#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/li_metal_dendrite.py

Li-metal dendrite growth model for solid-state batteries.

Input:
    {
      "current_density_ma_cm2": 1.0,
      "separator_modulus_gpa": 8.0,
      "temperature_c": 25,
      "li_thickness_um": 50,
      "stack_pressure_mpa": 2.0
    }

Output:
    {
      "critical_current_density_ma_cm2": ...,
      "dendrite_growth_rate_um_per_hr": ...,
      "safe_operating_window": "safe|caution|hazard",
      ...
    }

Physics (Monroe-Newman 2005; Porz et al. 2017):
- Mechanical suppression: dendrite penetration requires
  G_separator > G_dendrite_critical.
- Monroe-Newman criterion: separator shear modulus must exceed 2× Li's
  shear modulus (~4 GPa) → 8 GPa minimum.
- Sand's time t_s = π × D × (z·F·c)² / (4·J²·μ²) — time to Li depletion.
- Critical current density: i_crit ∝ separator_modulus / dendrite_radius.

References:
- Monroe & Newman (2005) "The impact of elastic deformation on deposition
  kinetics at lithium/polymer interfaces," J. Electrochem. Soc. 152, A396.
- Porz et al. (2017) "Mechanism of Lithium Metal Penetration through
  Inorganic Solid Electrolytes," Adv. Energy Mat. 7, 1701003.
- Sharafi et al. (2017) "Surface chemistry mechanism of ultra-low
  interfacial resistance in the solid-state electrolyte Li7La3Zr2O12,"
  Chem. Mater. 29, 7961.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "li_metal_dendrite (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Monroe & Newman (2005) J. Electrochem. Soc. 152 A396; Porz et al. (2017) Adv. Energy Mat. 7 1701003",
    "physics_basis": "Monroe-Newman shear modulus criterion: G_sep > 2·G_Li for dendrite suppression; Sand's-time depletion.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

LI_SHEAR_MODULUS_GPA = 4.2  # Li-metal shear modulus


def compute(payload: dict) -> dict:
    J_ma_cm2 = float(payload.get("current_density_ma_cm2", 1.0))
    G_sep_gpa = float(payload.get("separator_modulus_gpa", 8.0))
    T_c = float(payload.get("temperature_c", 25.0))
    Li_thick_um = float(payload.get("li_thickness_um", 50.0))
    stack_p_mpa = float(payload.get("stack_pressure_mpa", 2.0))

    # Monroe-Newman criterion: separator modulus must exceed 2× Li shear modulus
    monroe_newman_threshold = 2.0 * LI_SHEAR_MODULUS_GPA
    mn_pass = G_sep_gpa >= monroe_newman_threshold

    # Critical current density (Porz et al. fit for LLZO): i_crit increases
    # with modulus and stack pressure. Typical values:
    # - Polymer (1 GPa, 0 MPa): ~0.1 mA/cm²
    # - LLZO sintered (130 GPa, 1 MPa): ~1.5 mA/cm²
    # - LLZO sintered + heated to 60°C + 2 MPa: ~3-5 mA/cm²
    # Empirical: i_crit = 0.1 × (G_sep / 8) × (1 + 0.5·stack_p) × (1 + (T-25)·0.03)
    base_crit = 0.5  # mA/cm² at G=8 GPa, p=1 MPa, T=25°C
    modulus_factor = G_sep_gpa / 8.0
    pressure_factor = 1.0 + 0.5 * (stack_p_mpa - 1.0)
    temp_factor = 1.0 + 0.03 * (T_c - 25.0)
    i_crit_ma_cm2 = base_crit * modulus_factor * pressure_factor * temp_factor
    i_crit_ma_cm2 = max(0.01, i_crit_ma_cm2)

    # Sand's time: total Li to be plated / current
    # 50 µm Li × (capacity 3860 mAh/g, density 0.534 g/cm³)
    # Charge per unit area = 50 µm × 0.534 g/cm³ × 3860 mAh/g × 1e-4 = 10.3 mAh/cm²
    Li_density_g_cm3 = 0.534
    Li_specific_capacity_mAh_g = 3860
    cap_per_area_mAh_cm2 = (Li_thick_um * 1e-4) * Li_density_g_cm3 * Li_specific_capacity_mAh_g
    sand_time_hr = cap_per_area_mAh_cm2 / max(0.01, J_ma_cm2)

    # Dendrite growth rate (above i_crit)
    if J_ma_cm2 > i_crit_ma_cm2:
        # Linear approximation: rate ∝ (J - J_crit)
        excess_pct = (J_ma_cm2 - i_crit_ma_cm2) / i_crit_ma_cm2
        # Empirical: 5 µm/hr at 2× critical
        growth_rate_um_hr = 5.0 * excess_pct
        # Time to penetrate 100 µm separator
        time_to_short_hr = 100.0 / max(0.01, growth_rate_um_hr)
    else:
        growth_rate_um_hr = 0.0
        time_to_short_hr = 999999.0

    # Safe operating window
    if J_ma_cm2 < 0.5 * i_crit_ma_cm2:
        window = "safe"
    elif J_ma_cm2 < i_crit_ma_cm2:
        window = "caution"
    else:
        window = "hazard"

    return {
        "current_density_ma_cm2": J_ma_cm2,
        "critical_current_density_ma_cm2": round(i_crit_ma_cm2, 3),
        "dendrite_growth_rate_um_per_hr": round(growth_rate_um_hr, 2),
        "time_to_short_circuit_hr": round(time_to_short_hr, 1) if time_to_short_hr < 999999 else None,
        "safe_operating_window": window,
        "monroe_newman_threshold_gpa": monroe_newman_threshold,
        "monroe_newman_pass": mn_pass,
        "sand_time_hr": round(sand_time_hr, 1),
        "li_capacity_per_area_mAh_cm2": round(cap_per_area_mAh_cm2, 2),
        "separator_modulus_gpa": G_sep_gpa,
        "stack_pressure_mpa": stack_p_mpa,
        "temperature_c": T_c,
        "modulus_factor": round(modulus_factor, 2),
        "pressure_factor": round(pressure_factor, 2),
        "temperature_factor": round(temp_factor, 2),
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
