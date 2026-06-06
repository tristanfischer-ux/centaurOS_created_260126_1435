#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/flash_separation_sizing.py

process:flash-separation — FIRST-PRINCIPLES sizing of a 3-phase (vapour /
hydrocarbon-liquid / aqueous) flash separator: the vapour-disengagement
diameter from the Souders-Brown terminal-settling velocity, the liquid
hold-up volume from the residence-time basis, a real horizontal vessel size
(diameter x tangent-to-tangent length with the L/D clamped to a sane band)
and an oil-water settling check (Stokes' law) so the reviewer can see the
aqueous phase actually has time to disengage from the hydrocarbon layer.

WHAT IT DOES
    Given the three phase mass flows + densities and the operating P/T, it
    sizes the separator:

      v_max  = K_eff x sqrt((rho_l - rho_v) / rho_v)          (Souders-Brown)
      Qv     = vapour_flow / (rho_v x 3600)                   (vapour, m3/s)
      A_vap  = Qv / v_max                                     (vapour cross-section)
      Ql     = (hc_liq/rho_l + aqueous/rho_aq) / 3600         (liquid, m3/s)
      holdup = Ql x (liq_residence_min x 60)                  (liquid hold-up vol)
      horizontal: liquid fills ~50% of the bore, so the gross cross-section
      A = A_vap / 0.5; D = sqrt(4 A / pi); L from the hold-up volume, then the
      L/D is clamped to [2.5, 5] (Svrcek & Monnery economic band).
      Stokes oil-water settle: v_settle = g (d^2)(rho_aq - rho_l) / (18 mu);
      settling_ok = (liq_residence_min x 60) > (D/2) / v_settle.

WHY (e-fuel synthesis plant): the Fischer-Tropsch / methanol synthesis loop
    needs a 3-phase separator on the reactor effluent to split the syncrude /
    raw-methanol liquid, the produced reaction water (aqueous), and the
    unconverted syngas (vapour, recycled). That separator is a NOVEL bespoke
    vessel with no catalogue part — a SIZED vessel (D x L + the settling check)
    IS the BoM line item. Previously LLM-guessed.

INPUT (JSON on stdin)
    {
      "vapour_flow_kg_h": 300.0,        # REQUIRED — overhead vapour mass flow
      "liquid_hc_flow_kg_h": 210.0,     # REQUIRED — hydrocarbon liquid mass flow
      "aqueous_flow_kg_h": 250.0,       # produced-water mass flow (default 0)
      "rho_v_kg_m3": 15.0,              # vapour density at P,T (default 15)
      "rho_l_kg_m3": 700.0,            # hydrocarbon-liquid density (default 700)
      "rho_aq_kg_m3": 1000.0,          # aqueous density (default 1000)
      "p_bar": 24.0,                    # REQUIRED — operating pressure (selects K)
      "t_k": 423.0,                     # REQUIRED — operating temperature (record)
      "liq_residence_min": 20.0,        # liquid hold-up residence (default 20)
      "orientation": "horizontal",      # horizontal | vertical (default horizontal)
      "mesh": false,                    # demister mesh pad fitted? (default false)
      "droplet_um": 150.0               # aqueous droplet diameter for Stokes (default 150)
    }

OUTPUT (JSON on stdout)
    Vessel D x L, L/D, the Souders-Brown v_max + K, liquid residence, the
    oil-water settling verdict + hold-up volume, plus a worked[] array (each
    line hand-checkable) and a _provenance block.

LICENCE: tool wrapper internal. Correlations cited inline (Souders-Brown,
GPSA Engineering Data Book, Svrcek & Monnery, Stokes' law) — NO fabricated
constants.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "flash_separation_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Souders, M. & Brown, G.G. (1934) 'Design of fractionating columns' "
        "Ind. Eng. Chem. 26(1):98 (terminal-velocity vapour load factor); "
        "GPSA Engineering Data Book 12th/14th ed. Section 7 'Separators and "
        "Filters' (K-value bands vs pressure, mesh-pad factor); "
        "Svrcek, W.Y. & Monnery, W.D. (2000) 'Design two-phase separators "
        "within the right limits' Chem. Eng. Prog. + 'A Design of horizontal "
        "vessels with multiphase' (horizontal 3-phase L/D 2.5-5 economic band, "
        "50% liquid level); Stokes' law for oil-water droplet settling."
    ),
    "physics_basis": (
        "Vapour-disengagement diameter from the Souders-Brown terminal "
        "settling velocity v_max = K x sqrt((rho_l - rho_v)/rho_v), with the "
        "load factor K selected by operating pressure (GPSA: ~0.107 m/s below "
        "7 bar, ~0.085 m/s 7-20 bar, ~0.07 m/s above 20 bar) and reduced to "
        "0.7 x K when NO demister mesh is fitted. Vapour cross-section A_vap = "
        "Qv / v_max. Liquid hold-up volume = liquid volumetric flow x residence "
        "time. Horizontal vessel: liquid occupies ~50% of the bore so the gross "
        "cross-section A = A_vap / 0.5, D = sqrt(4A/pi), L from the hold-up "
        "volume, L/D clamped to the [2.5, 5] economic band (Svrcek & Monnery). "
        "Oil-water disengagement checked with Stokes' law v_settle = "
        "g d^2 (rho_aq - rho_l)/(18 mu): the aqueous phase settles out of the "
        "hydrocarbon layer only if the liquid residence time exceeds the time "
        "to fall half the vessel diameter."
    ),
    "confidence_class": "engineering_correlation",
    "last_reviewed_date": "2026-06-05",
}

# Souders-Brown load factor K [m/s] vs operating pressure, dry (no mesh).
# GPSA Engineering Data Book Section 7 vertical/horizontal separator bands.
K_LOW = 0.107    # p < 7 bar
K_MID = 0.085    # 7 <= p < 20 bar
K_HIGH = 0.07    # p >= 20 bar
MESH_FACTOR = 1.0      # demister mesh pad fitted -> full K
NO_MESH_FACTOR = 0.7   # no mesh (gravity only) -> 0.7 x K

# Liquid dynamic viscosity for the Stokes oil-water settling check [Pa.s].
# Light hydrocarbon condensate ~0.5 cP = 5e-4 Pa.s (engineering correlation
# value; Perry's: condensate/diesel-range liquids ~0.3-1 cP at process temp).
LIQ_VISCOSITY_PA_S = 5.0e-4
G = 9.81  # standard gravity [m/s^2]

# Horizontal-separator economic L/D band (Svrcek & Monnery 2000).
LD_MIN = 2.5
LD_MAX = 5.0
LIQUID_LEVEL_FRACTION = 0.5  # horizontal vessel half-full of liquid


def _k_base(p_bar: float) -> float:
    if p_bar < 7.0:
        return K_LOW
    if p_bar < 20.0:
        return K_MID
    return K_HIGH


def compute(payload: dict) -> dict:
    # ---- Required inputs ----
    if payload.get("vapour_flow_kg_h") is None:
        raise ValueError("vapour_flow_kg_h is required")
    if payload.get("liquid_hc_flow_kg_h") is None:
        raise ValueError("liquid_hc_flow_kg_h is required")
    if payload.get("p_bar") is None:
        raise ValueError("p_bar is required")
    if payload.get("t_k") is None:
        raise ValueError("t_k is required")

    vapour_flow = float(payload["vapour_flow_kg_h"])
    liquid_hc_flow = float(payload["liquid_hc_flow_kg_h"])
    aqueous_flow = float(payload.get("aqueous_flow_kg_h", 0.0))
    rho_v = float(payload.get("rho_v_kg_m3", 15.0))
    rho_l = float(payload.get("rho_l_kg_m3", 700.0))
    rho_aq = float(payload.get("rho_aq_kg_m3", 1000.0))
    p_bar = float(payload["p_bar"])
    t_k = float(payload["t_k"])
    liq_residence_min = float(payload.get("liq_residence_min", 20.0))
    orientation = str(payload.get("orientation", "horizontal")).strip().lower()
    mesh = bool(payload.get("mesh", False))
    droplet_um = float(payload.get("droplet_um", 150.0))

    if vapour_flow <= 0:
        raise ValueError("vapour_flow_kg_h must be > 0")
    if rho_v <= 0 or rho_l <= 0 or rho_aq <= 0:
        raise ValueError("densities must be > 0")
    if rho_l <= rho_v:
        raise ValueError("rho_l must exceed rho_v for vapour disengagement")
    if rho_aq <= rho_l:
        raise ValueError("rho_aq must exceed rho_l for oil-water settling (aqueous = heavy phase)")
    if p_bar <= 0:
        raise ValueError("p_bar must be > 0")
    if liq_residence_min <= 0:
        raise ValueError("liq_residence_min must be > 0")
    if droplet_um <= 0:
        raise ValueError("droplet_um must be > 0")
    if orientation not in ("horizontal", "vertical"):
        raise ValueError(f"orientation must be 'horizontal' or 'vertical', got {orientation!r}")

    # ---- Souders-Brown maximum vapour velocity ----
    k_base = _k_base(p_bar)
    mesh_factor = MESH_FACTOR if mesh else NO_MESH_FACTOR
    k_eff = k_base * mesh_factor
    v_max = k_eff * math.sqrt((rho_l - rho_v) / rho_v)        # m/s
    if v_max <= 0:
        raise ValueError("Souders-Brown v_max resolved to <= 0")

    # ---- Vapour cross-section needed ----
    q_v = vapour_flow / (rho_v * 3600.0)                       # m3/s
    a_vap = q_v / v_max                                        # m2

    # ---- Liquid hold-up volume from residence time ----
    q_l = (liquid_hc_flow / rho_l + aqueous_flow / rho_aq) / 3600.0   # m3/s
    holdup_vol = q_l * (liq_residence_min * 60.0)             # m3

    # ---- Vessel geometry ----
    if orientation == "horizontal":
        # Liquid fills bottom ~50% of bore -> gross cross-section from vapour area.
        a_total = a_vap / (1.0 - LIQUID_LEVEL_FRACTION)        # vapour space = upper 50%
        diameter_m = math.sqrt(4.0 * a_total / math.pi)
        # Length to hold the liquid in the bottom 50% of the bore, with a 3D floor.
        liquid_cross_section = LIQUID_LEVEL_FRACTION * (math.pi / 4.0) * diameter_m ** 2
        length_from_holdup = holdup_vol / liquid_cross_section if liquid_cross_section > 0 else 0.0
        length_m = max(length_from_holdup, 3.0 * diameter_m)
        l_over_d = length_m / diameter_m
        ld_basis = "horizontal: liquid in bottom 50% of bore; L from hold-up, 3D floor"
        # Clamp L/D into the economic band.
        if l_over_d < LD_MIN:
            length_m = LD_MIN * diameter_m
            l_over_d = LD_MIN
            ld_basis += f"; L raised to {LD_MIN}xD (below economic band)"
        elif l_over_d > LD_MAX:
            # Grow D so the hold-up fits at L/D = LD_MAX (longest economic vessel).
            # holdup = 0.5 x (pi/4) x D^2 x L, with L = LD_MAX x D
            #   -> D = (holdup / (0.5 x (pi/4) x LD_MAX))^(1/3)
            diameter_m = (holdup_vol / (LIQUID_LEVEL_FRACTION * (math.pi / 4.0) * LD_MAX)) ** (1.0 / 3.0)
            length_m = LD_MAX * diameter_m
            l_over_d = LD_MAX
            ld_basis += f"; D grown to satisfy hold-up at L/D={LD_MAX} (above economic band)"
    else:
        # Vertical: diameter straight from the vapour area; height from hold-up + 3D floor.
        diameter_m = math.sqrt(4.0 * a_vap / math.pi)
        liquid_cross_section = (math.pi / 4.0) * diameter_m ** 2
        length_from_holdup = holdup_vol / liquid_cross_section if liquid_cross_section > 0 else 0.0
        length_m = max(length_from_holdup, 3.0 * diameter_m)
        l_over_d = length_m / diameter_m
        ld_basis = "vertical: full-bore liquid; height from hold-up, 3D floor"
        if l_over_d < LD_MIN:
            length_m = LD_MIN * diameter_m
            l_over_d = LD_MIN
            ld_basis += f"; height raised to {LD_MIN}xD"
        elif l_over_d > LD_MAX:
            length_m = LD_MAX * diameter_m
            l_over_d = LD_MAX
            ld_basis += f"; height clamped to {LD_MAX}xD"

    # ---- Stokes' law oil-water settling check ----
    droplet_m = droplet_um * 1e-6
    v_settle = G * (droplet_m ** 2) * (rho_aq - rho_l) / (18.0 * LIQ_VISCOSITY_PA_S)   # m/s
    settle_distance = diameter_m / 2.0
    settle_time = settle_distance / v_settle if v_settle > 0 else float("inf")
    oil_water_settling_ok = (liq_residence_min * 60.0) > settle_time

    # ===================== worked[] — chained off rounded intermediates ====
    k_eff_r = round(k_eff, 4)
    v_max_r = round(v_max, 4)
    q_v_r = round(q_v, 6)
    a_vap_r = round(a_vap, 5)
    q_l_r = round(q_l, 6)
    holdup_vol_r = round(holdup_vol, 4)
    diameter_m_r = round(diameter_m, 4)
    length_m_r = round(length_m, 4)
    l_over_d_r = round(l_over_d, 3)
    v_settle_r = round(v_settle, 8)
    settle_time_r = round(settle_time, 2) if math.isfinite(settle_time) else settle_time

    worked = []
    worked.append(worked_calc(
        label="Souders-Brown maximum vapour velocity",
        formula="v_max = K_eff x sqrt((rho_l - rho_v) / rho_v)",
        values={"K_eff": (k_eff_r, "m/s"), "rho_l": (rho_l, "kg/m3"), "rho_v": (rho_v, "kg/m3")},
        result=v_max_r, result_unit="m/s",
        assumptions=[
            f"K_base = {round(k_base, 3)} m/s by pressure ({p_bar} bar; GPSA Section 7 bands)",
            f"{'mesh pad fitted (x1.0)' if mesh else 'NO mesh pad -> x0.7 (gravity disengagement only)'}",
            "Souders & Brown (1934) terminal-velocity load factor",
        ],
    ))
    worked.append(worked_calc(
        label="Vapour volumetric flow",
        formula="Qv = vapour_flow / (rho_v x 3600)",
        values={"vapour_flow": (vapour_flow, "kg/h"), "rho_v": (rho_v, "kg/m3")},
        result=q_v_r, result_unit="m3/s",
        assumptions=["actual volumetric vapour rate at operating P,T"],
    ))
    worked.append(worked_calc(
        label="Vapour-disengagement cross-section",
        formula="A_vap = Qv / v_max",
        values={"Qv": (q_v_r, "m3/s"), "v_max": (v_max_r, "m/s")},
        result=a_vap_r, result_unit="m2",
        assumptions=["minimum vapour flow area to keep up-flow below the settling velocity"],
    ))
    worked.append(worked_calc(
        label="Liquid volumetric flow (HC + aqueous)",
        formula="Ql = (hc_liq / rho_l + aqueous / rho_aq) / 3600",
        values={"hc_liq": (liquid_hc_flow, "kg/h"), "rho_l": (rho_l, "kg/m3"),
                "aqueous": (aqueous_flow, "kg/h"), "rho_aq": (rho_aq, "kg/m3")},
        result=q_l_r, result_unit="m3/s",
        assumptions=["combined hydrocarbon + aqueous liquid drop-out rate"],
    ))
    worked.append(worked_calc(
        label="Liquid hold-up volume",
        formula="holdup = Ql x (liq_residence_min x 60)",
        values={"Ql": (q_l_r, "m3/s"), "liq_residence_min": (liq_residence_min, "min")},
        result=holdup_vol_r, result_unit="m3",
        assumptions=[f"{liq_residence_min}-min liquid residence (HC/water emulsion break, level-control surge)"],
    ))
    if orientation == "horizontal":
        worked.append(worked_calc(
            label="Vessel diameter (horizontal, 50% liquid level)",
            formula="D = sqrt(4 x (A_vap / 0.5) / pi)",
            values={"A_vap": (a_vap_r, "m2")},
            result=diameter_m_r, result_unit="m",
            assumptions=["vapour space = upper 50% of bore so gross area A = A_vap / 0.5",
                         ld_basis],
        ))
    else:
        worked.append(worked_calc(
            label="Vessel diameter (vertical)",
            formula="D = sqrt(4 x A_vap / pi)",
            values={"A_vap": (a_vap_r, "m2")},
            result=diameter_m_r, result_unit="m",
            assumptions=[ld_basis],
        ))
    worked.append(worked_calc(
        label="Vessel tangent-to-tangent length",
        formula="L = L_over_D x D",
        values={"L_over_D": (l_over_d_r, ""), "D": (diameter_m_r, "m")},
        result=length_m_r, result_unit="m",
        assumptions=[f"L/D clamped to [{LD_MIN}, {LD_MAX}] economic band (Svrcek & Monnery 2000)"],
    ))
    worked.append(worked_calc(
        label="Oil-water droplet settling velocity (Stokes)",
        formula="v_settle = g x d^2 x (rho_aq - rho_l) / (18 x mu)",
        values={"g": (G, "m/s2"), "d": (round(droplet_m, 8), "m"),
                "rho_aq": (rho_aq, "kg/m3"), "rho_l": (rho_l, "kg/m3"),
                "mu": (LIQ_VISCOSITY_PA_S, "Pa.s")},
        result=v_settle_r, result_unit="m/s",
        assumptions=[f"aqueous droplet {droplet_um} um falling through the hydrocarbon layer",
                     f"hydrocarbon-liquid viscosity {LIQ_VISCOSITY_PA_S} Pa.s (~0.5 cP, light condensate)",
                     "Stokes' law (laminar, Re < 1)"],
    ))

    return {
        "vessel_diameter_m": round(diameter_m, 4),
        "vessel_length_m": round(length_m, 4),
        "l_over_d": round(l_over_d, 3),
        "vapour_velocity_max_ms": round(v_max, 4),
        "k_factor_used": round(k_eff, 4),
        "liquid_residence_min": round(liq_residence_min, 3),
        "oil_water_settling_ok": bool(oil_water_settling_ok),
        "holdup_volume_m3": round(holdup_vol, 4),
        "orientation": orientation,
        "mesh_fitted": mesh,
        "operating_pressure_bar": p_bar,
        "operating_temperature_k": t_k,
        "settling_time_s": round(settle_time, 2) if math.isfinite(settle_time) else None,
        "vapour_cross_section_m2": round(a_vap, 5),
        "worked": worked,
        "data_sources": [
            "Souders, M. & Brown, G.G. (1934) Ind. Eng. Chem. 26(1):98 — terminal-velocity load factor",
            "GPSA Engineering Data Book Section 7 — separator K-value bands vs pressure + mesh-pad factor",
            "Svrcek, W.Y. & Monnery, W.D. (2000) Chem. Eng. Prog. — horizontal separator L/D + 50% liquid level",
            "Stokes' law — oil-water droplet settling (laminar regime)",
        ],
    }


def main() -> int:
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout)
        return 2
    try:
        out = compute(payload)
        out["_provenance"] = PROVENANCE
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 3)
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
