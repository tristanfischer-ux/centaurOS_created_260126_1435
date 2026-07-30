#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/coolprop_run.py

Real CoolProp wrapper for the orchestrator. Reads JSON input from stdin,
writes JSON output to stdout.

Input:
    {"fluid": "r290", "temperature_c": 35}

Output:
    {
      "fluid": "R290",
      "saturation_temp_at_10bar_c": 27.7,
      "saturation_pressure_at_temp_bar": 12.3,
      "liquid_density_kg_m3": 500.1,
      ...
    }

Usage: invoked via subprocess from coolprop-real.ts. Pure stdin/stdout.

License: MIT (CoolProp itself is MIT). https://coolprop.org
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)

# Map orchestrator fluid codes to CoolProp fluid names
FLUID_MAP = {
    "r290": "R290",
    "r32": "R32",
    "r410a": "R410A",
    "r513a": "R513A",
    "water": "Water",
    # FPK / traction coolant: ethylene glycol 50% (MEG). APG kept as alias for propylene.
    "water_glycol_50": "INCOMP::MEG[0.50]",
    "egw_50": "INCOMP::MEG[0.50]",
    "meg_50": "INCOMP::MEG[0.50]",
    "apg_50": "INCOMP::APG[0.50]",
    "co2": "CO2",
    "ammonia": "Ammonia",
}


def compute(payload: dict) -> dict:
    import CoolProp.CoolProp as CP

    raw_fluid = str(payload.get("fluid", "")).strip()
    # GOTCHA: FPK stamps sometimes pass CoolProp native "INCOMP::MEG[0.50]".
    # Do NOT run that through safe_choice — it would silently become R290.
    if raw_fluid.upper().startswith("INCOMP::") or raw_fluid in FLUID_MAP.values():
        fluid = raw_fluid if raw_fluid.upper().startswith("INCOMP::") else raw_fluid
    else:
        fluid_in = safe_choice(
            raw_fluid.lower(), FLUID_MAP, default="r290", label="fluid"
        )
        fluid = FLUID_MAP.get(fluid_in)
    if not fluid:
        raise ValueError(f"unknown fluid code: {raw_fluid!r} (supported: {list(FLUID_MAP.keys())})")

    t_c = float(payload.get("temperature_c", 25.0))
    t_k = t_c + 273.15

    # Some incompressible mixtures don't support all queries; wrap.
    out: dict = {"fluid": fluid}

    # Saturation temp at 1 MPa (10 bar) — fixed reference point for comparison
    try:
        t_sat_at_10bar_c = CP.PropsSI("T", "P", 10e5, "Q", 0, fluid) - 273.15
        out["saturation_temp_at_10bar_c"] = round(t_sat_at_10bar_c, 2)
    except Exception:
        out["saturation_temp_at_10bar_c"] = None

    # Saturation pressure at the requested temperature
    try:
        p_sat = CP.PropsSI("P", "T", t_k, "Q", 0, fluid)
        out["saturation_pressure_at_temp_bar"] = round(p_sat / 1e5, 3)
    except Exception:
        out["saturation_pressure_at_temp_bar"] = None

    # Liquid + vapour densities at saturation at t_k
    try:
        out["liquid_density_kg_m3"] = round(CP.PropsSI("D", "T", t_k, "Q", 0, fluid), 2)
    except Exception:
        out["liquid_density_kg_m3"] = None
    try:
        out["vapour_density_kg_m3"] = round(CP.PropsSI("D", "T", t_k, "Q", 1, fluid), 3)
    except Exception:
        out["vapour_density_kg_m3"] = None

    # Enthalpies at saturation
    try:
        out["enthalpy_liquid_kj_kg"] = round(CP.PropsSI("H", "T", t_k, "Q", 0, fluid) / 1000.0, 2)
    except Exception:
        out["enthalpy_liquid_kj_kg"] = None
    try:
        out["enthalpy_vapour_kj_kg"] = round(CP.PropsSI("H", "T", t_k, "Q", 1, fluid) / 1000.0, 2)
    except Exception:
        out["enthalpy_vapour_kj_kg"] = None

    if out["enthalpy_liquid_kj_kg"] is not None and out["enthalpy_vapour_kj_kg"] is not None:
        out["latent_heat_kj_kg"] = round(out["enthalpy_vapour_kj_kg"] - out["enthalpy_liquid_kj_kg"], 2)
    else:
        out["latent_heat_kj_kg"] = None

    # Liquid specific heat — prefer saturation Q=0; for INCOMP mixtures use P=1 atm
    try:
        out["cp_liquid_kj_kgk"] = round(CP.PropsSI("C", "T", t_k, "Q", 0, fluid) / 1000.0, 3)
    except Exception:
        try:
            out["cp_liquid_kj_kgk"] = round(
                CP.PropsSI("C", "T", t_k, "P", 101325.0, fluid) / 1000.0, 3
            )
        except Exception:
            out["cp_liquid_kj_kgk"] = None

    # Incompressible coolants: also emit single-phase ρ / μ / k at (T,P)
    if fluid.startswith("INCOMP::") or fluid == "Water":
        try:
            out["liquid_density_kg_m3"] = round(
                CP.PropsSI("D", "T", t_k, "P", 101325.0, fluid), 2
            )
        except Exception:
            pass
        try:
            out["viscosity_pa_s"] = float(CP.PropsSI("V", "T", t_k, "P", 101325.0, fluid))
        except Exception:
            out["viscosity_pa_s"] = None
        try:
            out["conductivity_w_mk"] = round(
                CP.PropsSI("L", "T", t_k, "P", 101325.0, fluid), 4
            )
        except Exception:
            out["conductivity_w_mk"] = None
        if out.get("cp_liquid_kj_kgk") is not None:
            out["cp_liquid_j_kgk"] = round(float(out["cp_liquid_kj_kgk"]) * 1000.0, 1)

    # Flammability class (ASHRAE)
    flammability_classes = {
        "R290": "A3",
        "R32": "A2L",
        "R410A": "A1",
        "R513A": "A1",
        "Water": "A1",
        "INCOMP::APG[0.50]": "A1",
        "CO2": "A1",
        "Ammonia": "B2L",
    }
    out["flammability_class"] = flammability_classes.get(fluid, "unknown")

    return out


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2

    try:
        result = compute(payload)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
