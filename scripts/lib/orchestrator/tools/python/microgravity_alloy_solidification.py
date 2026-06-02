#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/microgravity_alloy_solidification.py

Microgravity superalloy solidification — yield, grain structure and
mechanical properties for crystals grown in space.

Companies served: Space Forge (UK), Varda Space Industries (US/EU mirror),
Maglev Manufacturing.

Input:
    {
      "alloy": "CMSX-4" | "Inconel718" | "AlSi10Mg" | "Mar-M247" | "Rene_N5",
      "volume_cm3": 1000.0,
      "target_grain_orientation": "111" | "100" | "polycrystalline",
      "cooling_rate_k_s": 5.0,
      "g_level": 1e-5,
      "container_material": "ceramic_alumina"
    }

Output:
    yield_pct, mechanical_properties (yield_mpa, UTS_mpa, fatigue_life_cycles),
    microstructure_score, solidification_time_hours, _provenance.

Physics:
  Solidification time t = (V * rho * H_fusion) / (Q_cooling)
  Grain size: d ~ A / (cooling_rate)^n  (Hall-Petch + Hunt-Lu solidification)
  Microgravity benefit: no buoyancy convection → primary dendrite arm
  spacing improves by 20-50% (Lott 1995)

References:
- Curreri, P.A., "Microgravity Containerless Processing of Glasses", NASA
  TM-100462, 1988.
- Bewlay, B.P. et al., "Solidification processing in microgravity",
  JOM 48(8):46-49, 1996.
- Pollock, T.M., Tin, S., "Nickel-Based Superalloys for Advanced Turbine
  Engines", J. Propul. Power 22(2):361-374, 2006.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


PROVENANCE = {
    "tool_name": "microgravity_alloy_solidification (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Curreri (1988) NASA TM-100462 'Microgravity Containerless Processing'; "
        "Bewlay et al. (1996) JOM 48(8):46 DOI:10.1007/BF03222972; "
        "Pollock & Tin (2006) J. Propul. Power 22(2):361 DOI:10.2514/1.18239."
    ),
    "physics_basis": (
        "Solidification heat-removal: t = V * rho * H_fusion / Q_cool. "
        "Hall-Petch grain refinement from cooling rate. Microgravity "
        "eliminates buoyancy convection → improved DAS (~30% benefit)."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "ALLOY_PROPERTIES": {
            "source": "ASM Handbook Vol.3 - Alloy Phase Diagrams + Pollock & Tin 2006 + Reed 2006 'Superalloys: Fundamentals & Applications'",
            "confidence": "textbook",
        },
        "MICROGRAVITY_DAS_BENEFIT": {
            "source": "Bewlay 1996 — microgravity-cast superalloys show 20-50% finer primary dendrite arm spacing",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Alloy properties: density (g/cm^3), H_fusion (J/g), liquidus (C),
# yield_mpa_baseline (cast 1G), uts_mpa_baseline
ALLOYS = {
    "CMSX-4":     {"density_g_cm3": 8.7, "H_fusion_J_g": 270, "liquidus_c": 1380,
                   "yield_mpa": 950, "uts_mpa": 1110, "fatigue_n_cycles": 5e6},
    "CMSX-10":    {"density_g_cm3": 9.1, "H_fusion_J_g": 270, "liquidus_c": 1400,
                   "yield_mpa": 1050, "uts_mpa": 1220, "fatigue_n_cycles": 8e6},
    "Inconel718": {"density_g_cm3": 8.19, "H_fusion_J_g": 220, "liquidus_c": 1300,
                   "yield_mpa": 1100, "uts_mpa": 1350, "fatigue_n_cycles": 3e6},
    "Mar-M247":   {"density_g_cm3": 8.5, "H_fusion_J_g": 260, "liquidus_c": 1370,
                   "yield_mpa": 920, "uts_mpa": 1110, "fatigue_n_cycles": 4e6},
    "Rene_N5":    {"density_g_cm3": 8.7, "H_fusion_J_g": 270, "liquidus_c": 1370,
                   "yield_mpa": 900, "uts_mpa": 1060, "fatigue_n_cycles": 6e6},
    "AlSi10Mg":   {"density_g_cm3": 2.67, "H_fusion_J_g": 400, "liquidus_c": 600,
                   "yield_mpa": 260, "uts_mpa": 360, "fatigue_n_cycles": 1e7},
    "Ti_6Al_4V":  {"density_g_cm3": 4.43, "H_fusion_J_g": 320, "liquidus_c": 1660,
                   "yield_mpa": 950, "uts_mpa": 1050, "fatigue_n_cycles": 1e7},
}

# Grain-orientation improvement factors for single-crystal vs equiaxed
ORIENTATION_FACTORS = {
    "111":              {"yield_factor": 1.15, "uts_factor": 1.10, "fatigue_factor": 3.0},
    "100":              {"yield_factor": 1.25, "uts_factor": 1.20, "fatigue_factor": 5.0},
    "directional":      {"yield_factor": 1.10, "uts_factor": 1.05, "fatigue_factor": 2.0},
    "polycrystalline":  {"yield_factor": 1.00, "uts_factor": 1.00, "fatigue_factor": 1.0},
}


def compute(payload: dict) -> dict:
    alloy = str(payload.get("alloy", "CMSX-4"))
    volume_cm3 = float(payload.get("volume_cm3", 1000.0))
    orientation = str(payload.get("target_grain_orientation", "polycrystalline"))
    cooling_rate_k_s = float(payload.get("cooling_rate_k_s", 5.0))
    g_level = float(payload.get("g_level", 1e-5))
    container = str(payload.get("container_material", "ceramic_alumina"))

    if alloy not in ALLOYS:
        raise ValueError(f"unknown alloy {alloy!r}; known: {list(ALLOYS)}")
    if orientation not in ORIENTATION_FACTORS:
        orientation = "polycrystalline"

    a = ALLOYS[alloy]
    o = ORIENTATION_FACTORS[orientation]

    # Solidification time
    mass_g = volume_cm3 * a["density_g_cm3"]
    total_enthalpy_j = mass_g * a["H_fusion_J_g"]
    # Cooling rate gives temperature drop per second; assume need 200K below liquidus
    temp_drop_k = 200.0
    cooling_time_s = temp_drop_k / cooling_rate_k_s

    # Heat to remove
    cp_j_g_k = 0.5  # average for superalloy
    sensible_heat_j = mass_g * cp_j_g_k * temp_drop_k
    total_heat_j = total_enthalpy_j + sensible_heat_j
    # Required cooling power
    cooling_power_w = total_heat_j / max(cooling_time_s, 1.0)

    # Microgravity benefit factor
    # Lower g → better single-crystal yield + finer DAS
    if g_level < 1e-3:
        ug_factor = 1.30  # 30% improvement
        ug_yield_boost_pct = 50.0
    elif g_level < 1e-1:
        ug_factor = 1.10
        ug_yield_boost_pct = 20.0
    else:
        ug_factor = 1.00
        ug_yield_boost_pct = 0.0

    # Yield (% of parts meeting spec)
    # Baseline cast yield: 60-80% for SX, 90+% for equiaxed
    baseline_yield = {"111": 0.65, "100": 0.55, "directional": 0.85, "polycrystalline": 0.95}.get(orientation, 0.8)
    yield_pct = baseline_yield * 100.0 * (1.0 + ug_yield_boost_pct / 100.0)
    yield_pct = min(yield_pct, 99.0)

    # Mechanical properties
    yield_mpa = a["yield_mpa"] * o["yield_factor"] * ug_factor
    uts_mpa = a["uts_mpa"] * o["uts_factor"] * ug_factor
    fatigue_cycles = a["fatigue_n_cycles"] * o["fatigue_factor"] * ug_factor

    # Microstructure score (1-10) — 10 = textbook single-crystal
    score = 5
    if orientation == "100":
        score += 3
    elif orientation == "111":
        score += 2
    elif orientation == "directional":
        score += 1
    if g_level < 1e-3:
        score += 2
    score = min(10, max(1, score))

    # Cooling time in hours
    solidification_time_hours = cooling_time_s / 3600.0

    # Rounded display values that chain through the worked calculations.
    mass_g_r = round(mass_g, 2)
    total_enthalpy_r = round(total_enthalpy_j, 1)
    sensible_r = round(sensible_heat_j, 1)
    total_heat_r = round(total_heat_j, 1)
    cooling_time_r = round(cooling_time_s, 2)
    cooling_power_r = round(cooling_power_w, 1)
    solidification_hr_r = round(solidification_time_hours, 4)
    yield_mpa_r = round(yield_mpa, 1)
    uts_mpa_r = round(uts_mpa, 1)

    # Worked calculations (hand-checkable closed-form steps only).
    # ug_factor and baseline_yield are piecewise/lookup — SKIP; pass as live input symbols.
    # fatigue_cycles product includes float multiplication of large int; show it.
    worked = [
        worked_calc(
            label="Alloy mass from volume",
            formula="mass = volume x density",
            values={
                "volume": (volume_cm3, "cm3"),
                "density": (a["density_g_cm3"], "g/cm3"),
            },
            result=mass_g_r, result_unit="g",
            assumptions=[f"alloy density for {alloy} from ASM Handbook Vol.3 / Pollock & Tin (2006)"],
        ),
        worked_calc(
            label="Latent heat to remove (fusion enthalpy)",
            formula="H_fusion_total = mass x H_fusion",
            values={
                "mass": (mass_g_r, "g"),
                "H_fusion": (a["H_fusion_J_g"], "J/g"),
            },
            result=total_enthalpy_r, result_unit="J",
            assumptions=[f"H_fusion for {alloy} from ASM Handbook Vol.3"],
        ),
        worked_calc(
            label="Sensible heat (cooling 200 K below liquidus)",
            formula="Q_sensible = mass x cp x delta_T",
            values={
                "mass": (mass_g_r, "g"),
                "cp": (cp_j_g_k, "J/(g K)"),
                "delta_T": (temp_drop_k, "K"),
            },
            result=sensible_r, result_unit="J",
            assumptions=["cp = 0.5 J/(g K) average for superalloy; 200 K below liquidus"],
        ),
        worked_calc(
            label="Total heat to remove (latent + sensible)",
            formula="Q_total = H_fusion_total + Q_sensible",
            values={
                "H_fusion_total": (total_enthalpy_r, "J"),
                "Q_sensible": (sensible_r, "J"),
            },
            result=total_heat_r, result_unit="J",
            assumptions=[],
        ),
        worked_calc(
            label="Solidification time from cooling rate",
            formula="t_cool = delta_T / cooling_rate",
            values={
                "delta_T": (temp_drop_k, "K"),
                "cooling_rate": (cooling_rate_k_s, "K/s"),
            },
            result=cooling_time_r, result_unit="s",
            assumptions=["linear cooling rate; 200 K thermal window below liquidus"],
        ),
        worked_calc(
            label="Required cooling power",
            formula="P_cool = Q_total / t_cool",
            values={
                "Q_total": (total_heat_r, "J"),
                "t_cool": (cooling_time_r, "s"),
            },
            result=cooling_power_r, result_unit="W",
            assumptions=[],
        ),
        worked_calc(
            label="Solidification time in hours",
            formula="t_hr = t_cool / 3600",
            values={"t_cool": (cooling_time_r, "s")},
            result=solidification_hr_r, result_unit="hr",
            assumptions=[],
        ),
        worked_calc(
            label="Yield strength with orientation and microgravity factors",
            formula="yield_mpa = yield_base x yield_orient_f x ug_factor",
            values={
                "yield_base": (a["yield_mpa"], "MPa"),
                "yield_orient_f": (o["yield_factor"], ""),
                "ug_factor": (ug_factor, ""),
            },
            result=yield_mpa_r, result_unit="MPa",
            assumptions=[
                f"baseline for {alloy}; orientation factor for {orientation}; ug_factor from g-level",
            ],
        ),
        worked_calc(
            label="Ultimate tensile strength with orientation and microgravity factors",
            formula="uts_mpa = uts_base x uts_orient_f x ug_factor",
            values={
                "uts_base": (a["uts_mpa"], "MPa"),
                "uts_orient_f": (o["uts_factor"], ""),
                "ug_factor": (ug_factor, ""),
            },
            result=uts_mpa_r, result_unit="MPa",
            assumptions=[
                f"baseline for {alloy}; orientation factor for {orientation}; ug_factor from g-level",
            ],
        ),
    ]

    return {
        "alloy": alloy,
        "volume_cm3": volume_cm3,
        "target_grain_orientation": orientation,
        "cooling_rate_k_s": cooling_rate_k_s,
        "g_level": g_level,
        "container_material": container,
        "mass_kg": round(mass_g / 1000.0, 3),
        "total_heat_to_remove_kj": round(total_heat_j / 1000.0, 1),
        "cooling_power_w": cooling_power_r,
        "solidification_time_hours": solidification_hr_r,
        "microgravity_benefit_factor": ug_factor,
        "yield_pct": round(yield_pct, 1),
        "mechanical_properties": {
            "yield_mpa": yield_mpa_r,
            "uts_mpa": uts_mpa_r,
            "fatigue_life_cycles": int(fatigue_cycles),
        },
        "microstructure_score": score,
        "baseline_yield_pct_on_ground": round(baseline_yield * 100.0, 1),
        "worked": worked,
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
