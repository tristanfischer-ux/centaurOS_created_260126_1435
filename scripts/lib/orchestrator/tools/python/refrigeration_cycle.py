#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/refrigeration_cycle.py

UPDATED 2026-05-22: state-point math still rests on CoolProp (MIT) for
the equations of state (CoolProp uses Helmholtz-form EoS with REFPROP-
equivalent accuracy on the supported refrigerants, including blends
like R410A, R513A that thermo doesn't carry). The library `thermo`
(MIT, by the same author as fluids/ht) is now ALSO consulted for the
pure-fluid refrigerants (R290 → propane, R744 → CO2, R717 → ammonia,
R134a) — its result is reported as `thermo_density_check_kg_m3` so a
class-plan reviewer can see two independent libraries agree on the
state-point properties before signing off a heat-pump design.

Why both? CoolProp covers commercial blends (R410A, R513A, R32+R125)
and is the international reference for HVAC EoS. thermo provides a
cross-check on the pure components and adds DIPPR-based property
correlations (Cp, k, Pr) that aren't always exposed via CoolProp's
PropsSI() interface.

Input (unchanged from prior wrapper):
    {
      "refrigerant": "R290",
      "evap_temp_c": 5.0,
      "cond_temp_c": 45.0,
      "superheat_k": 5.0,
      "subcool_k": 2.0,
      "isentropic_efficiency": 0.70,
      "cooling_load_kw": 10.0
    }

Output (schema preserved + provenance + thermo cross-check):
    {
      "cop_cooling": 4.21,
      "cop_heating": 5.21,
      ...
      "thermo_cross_check": {
        "fluid_name_in_thermo": "propane",
        "evap_density_kg_m3": 11.45,
        "cond_density_kg_m3": 23.0,
        "thermo_available": true,
        "agreement_pct": 99.4
      },
      "_provenance": {...}
    }

License: MIT (CoolProp + thermo)
Sources:
  - CoolProp: https://coolprop.org   — Bell & Wronski (2014)
  - thermo:   https://github.com/CalebBell/thermo
"""
from __future__ import annotations

import json
import sys
import time

PROVENANCE = {
    "tool_name": "CoolProp + thermo cross-check",
    "tool_version": "CoolProp 6.x + thermo 0.6.0",
    "tool_license": "MIT (CoolProp), MIT (thermo)",
    "tool_source_url": "https://coolprop.org + https://github.com/CalebBell/thermo",
    "tool_paper": "Bell, Wronski, Quoilin, Lemort (2014), 'Pure and Pseudo-pure Fluid Thermophysical Property Evaluation and the Open-Source Thermophysical Property Library CoolProp', Industrial & Engineering Chemistry Research 53(6):2498-2508; plus thermo (Bell 2016-2024).",
    "tool_doi": "10.1021/ie4033999",
    "physics_basis": "Standard 4-stage vapour-compression cycle (Moran & Shapiro 'Fundamentals of Engineering Thermodynamics' Ch.10): evaporator → compressor (isentropic with η_is) → condenser → expansion valve (isenthalpic). CoolProp's Helmholtz EoS (REFPROP-equivalent) for state points, thermo as cross-check for pure-fluid properties.",
    "physics_paper_doi": "10.1021/ie4033999",
    "confidence_class": "library",
    "embedded_constants": {
        "FLUID_MAP_CODES_TO_COOLPROP": {
            "source": "ASHRAE 34 refrigerant designations + CoolProp's pseudo-pure fluid catalogue.",
            "confidence": "standard",
        },
        "FLUID_MAP_TO_THERMO": {
            "source": "IUPAC chemical names: R290=propane, R744=CO2, R717=ammonia, R134a=1,1,1,2-tetrafluoroethane. Used for thermo cross-check only.",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}

# Map orchestrator refrigerant codes to CoolProp fluid names
FLUID_MAP_COOLPROP = {
    "r290": "R290",
    "r32": "R32",
    "r410a": "R410A",
    "r513a": "R513A",
    "r134a": "R134a",
    "r744": "CO2",
    "co2": "CO2",
    "r717": "Ammonia",
    "ammonia": "Ammonia",
}

# For pure components, also map to thermo's recognised name for cross-check
FLUID_MAP_THERMO = {
    "r290": "propane",
    "r32": "difluoromethane",
    "r134a": "1,1,1,2-tetrafluoroethane",
    "r744": "CO2",
    "co2": "CO2",
    "r717": "ammonia",
    "ammonia": "ammonia",
    # R410A, R513A are blends — thermo can't handle these
}


def thermo_density_check(fluid_code: str, T_k: float, P_pa: float) -> dict:
    """Cross-check the saturated/superheated density against thermo's
    DIPPR-based estimate. Returns None for blends (thermo can't handle)."""
    if fluid_code not in FLUID_MAP_THERMO:
        return {"thermo_available": False, "reason": "blend not in thermo DIPPR"}
    try:
        from thermo.chemical import Chemical
        c = Chemical(FLUID_MAP_THERMO[fluid_code], T=T_k, P=P_pa)
        rho = float(c.rho) if c.rho is not None else None
        return {
            "thermo_available": True,
            "fluid_name_in_thermo": FLUID_MAP_THERMO[fluid_code],
            "density_kg_m3": round(rho, 3) if rho else None,
            "viscosity_pa_s": float(f"{c.mu:.6g}") if c.mu else None,
            "phase": c.phase,
        }
    except Exception as exc:
        return {"thermo_available": False, "error": f"{type(exc).__name__}: {exc}"}


def compute(payload: dict) -> dict:
    import CoolProp.CoolProp as CP

    fluid_in = str(payload.get("refrigerant", "R290")).strip().lower()
    fluid = FLUID_MAP_COOLPROP.get(fluid_in)
    if not fluid:
        raise ValueError(f"unknown refrigerant {fluid_in!r}; known: {list(FLUID_MAP_COOLPROP.keys())}")

    t_evap_c = float(payload.get("evap_temp_c", 5.0))
    t_cond_c = float(payload.get("cond_temp_c", 45.0))
    superheat_k = float(payload.get("superheat_k", 5.0))
    subcool_k = float(payload.get("subcool_k", 2.0))
    eta_is = float(payload.get("isentropic_efficiency", 0.70))
    cooling_load_kw = float(payload.get("cooling_load_kw", 10.0))

    t_evap_k = t_evap_c + 273.15
    t_cond_k = t_cond_c + 273.15

    # State 1: leaving evaporator, superheated vapour
    p_evap = CP.PropsSI("P", "T", t_evap_k, "Q", 1, fluid)
    t1 = t_evap_k + superheat_k
    h1 = CP.PropsSI("H", "T", t1, "P", p_evap, fluid)
    s1 = CP.PropsSI("S", "T", t1, "P", p_evap, fluid)

    # State 2: after compressor
    p_cond = CP.PropsSI("P", "T", t_cond_k, "Q", 0, fluid)
    h2s = CP.PropsSI("H", "S", s1, "P", p_cond, fluid)
    h2 = h1 + (h2s - h1) / eta_is

    # State 3: leaving condenser, subcooled liquid
    t3 = t_cond_k - subcool_k
    h3 = CP.PropsSI("H", "T", t3, "P", p_cond, fluid)

    # State 4: after expansion valve (isenthalpic)
    h4 = h3
    h_sat_l_evap = CP.PropsSI("H", "P", p_evap, "Q", 0, fluid)
    h_sat_v_evap = CP.PropsSI("H", "P", p_evap, "Q", 1, fluid)
    q4 = (h4 - h_sat_l_evap) / (h_sat_v_evap - h_sat_l_evap)

    # Energy quantities per unit mass [J/kg]
    q_evap = h1 - h4
    w_comp = h2 - h1
    q_cond = h2 - h3

    cop_cooling = q_evap / max(1e-9, w_comp)
    cop_heating = q_cond / max(1e-9, w_comp)

    mass_flow_kg_s = (cooling_load_kw * 1000.0) / max(1e-9, q_evap)
    compressor_power_kw = (mass_flow_kg_s * w_comp) / 1000.0
    heating_capacity_kw = (mass_flow_kg_s * q_cond) / 1000.0

    # Thermo cross-check (pure-fluid refrigerants only)
    thermo_check_evap = thermo_density_check(fluid_in, t_evap_k, p_evap)
    thermo_check_cond = thermo_density_check(fluid_in, t_cond_k, p_cond)

    # If thermo provided a density, compute the agreement with CoolProp
    try:
        rho_evap_cp = CP.PropsSI("D", "T", t_evap_k, "P", p_evap, fluid)
        rho_cond_cp = CP.PropsSI("D", "T", t3, "P", p_cond, fluid)
    except Exception:
        rho_evap_cp = None
        rho_cond_cp = None

    if thermo_check_evap.get("thermo_available") and rho_evap_cp:
        try:
            evap_agreement = 100 * (1 - abs(thermo_check_evap["density_kg_m3"] - rho_evap_cp) / rho_evap_cp)
            thermo_check_evap["coolprop_density_kg_m3"] = round(float(rho_evap_cp), 3)
            thermo_check_evap["agreement_pct"] = round(evap_agreement, 2)
        except Exception:
            pass
    if thermo_check_cond.get("thermo_available") and rho_cond_cp:
        try:
            cond_agreement = 100 * (1 - abs(thermo_check_cond["density_kg_m3"] - rho_cond_cp) / rho_cond_cp)
            thermo_check_cond["coolprop_density_kg_m3"] = round(float(rho_cond_cp), 3)
            thermo_check_cond["agreement_pct"] = round(cond_agreement, 2)
        except Exception:
            pass

    return {
        "refrigerant": fluid,
        "evap_temp_c": t_evap_c,
        "cond_temp_c": t_cond_c,
        "superheat_k": superheat_k,
        "subcool_k": subcool_k,
        "isentropic_efficiency": eta_is,
        "evap_pressure_bar": round(p_evap / 1e5, 3),
        "cond_pressure_bar": round(p_cond / 1e5, 3),
        "pressure_ratio": round(p_cond / p_evap, 3),
        "specific_enthalpy_j_kg": {
            "h1_leaving_evap": round(h1, 1),
            "h2_compressor_out": round(h2, 1),
            "h3_leaving_cond": round(h3, 1),
            "h4_post_expansion": round(h4, 1),
        },
        "quality_at_evap_inlet": round(q4, 4),
        "q_evap_kj_kg": round(q_evap / 1000.0, 3),
        "w_comp_kj_kg": round(w_comp / 1000.0, 3),
        "q_cond_kj_kg": round(q_cond / 1000.0, 3),
        "cop_cooling": round(cop_cooling, 3),
        "cop_heating": round(cop_heating, 3),
        "cooling_load_kw": cooling_load_kw,
        "mass_flow_kg_s": round(mass_flow_kg_s, 5),
        "compressor_power_kw": round(compressor_power_kw, 3),
        "heating_capacity_kw": round(heating_capacity_kw, 3),
        "thermo_cross_check": {
            "evap_state": thermo_check_evap,
            "cond_state": thermo_check_cond,
        },
        "_provenance": PROVENANCE,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
