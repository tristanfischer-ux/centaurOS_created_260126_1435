#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/membrane_humidification.py

Nafion membrane water content (λ) and ohmic resistance.

Input:
    {
      "dry_air_flow_lpm": 100.0,
      "current_a_per_cm2": 1.0,
      "temperature_c": 80,
      "relative_humidity_in_pct": 100,
      "membrane_thickness_um": 50
    }

Output:
    {
      "water_content_lambda": ...,
      "ohmic_resistance_ohm_cm2": ...,
      "water_generation_rate_g_s": ...,
      ...
    }

Physics (Springer-Zawodzinski 1991, Springer-Rowland 1993):
- λ = water molecules per sulphonate group in Nafion membrane.
- At a_w = 1 (saturated vapour): λ = 14.
- In liquid water: λ = 22.
- σ_membrane(λ) = (0.005139·λ - 0.00326) × exp(1268·(1/303 - 1/T)) S/cm
- Membrane drag coefficient n_drag ≈ 2.5·λ/22 mol H2O / mol H+

References:
- Springer, Zawodzinski, Gottesfeld (1991) "Polymer Electrolyte Fuel Cell
  Model," J. Electrochem. Soc. 138, 2334.
- Zawodzinski et al. (1993) "Determination of water diffusion coefficients
  in perfluorosulfonate ionomeric membranes," J. Phys. Chem. 97, 4756.
- Barbir (2013) "PEM Fuel Cells: Theory and Practice" 2nd ed., Ch. 4.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "membrane_humidification (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Springer, Zawodzinski, Gottesfeld (1991) J. Electrochem. Soc. 138 2334; Barbir (2013) Ch. 4",
    "physics_basis": "Springer water uptake isotherm + Springer-Rowland conductivity correlation: σ = (5.14e-3·λ - 3.26e-3)·exp(1268·(1/303 - 1/T)).",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

F = 96485
M_H2O = 0.018  # kg/mol


def lambda_from_aw(a_w: float) -> float:
    """Springer water uptake isotherm for Nafion."""
    if a_w <= 0:
        return 0.043
    if a_w >= 1:
        return 14.0
    # λ = 0.043 + 17.81·a_w - 39.85·a_w² + 36·a_w³ for 0 < a_w ≤ 1
    return 0.043 + 17.81 * a_w - 39.85 * (a_w ** 2) + 36 * (a_w ** 3)


def compute(payload: dict) -> dict:
    Q_air_lpm = float(payload.get("dry_air_flow_lpm", 100.0))
    i_a_cm2 = float(payload.get("current_a_per_cm2", 1.0))
    T_c = float(payload.get("temperature_c", 80.0))
    rh_in_pct = float(payload.get("relative_humidity_in_pct", 100.0))
    t_membrane_um = float(payload.get("membrane_thickness_um", 50.0))

    T_k = T_c + 273.15

    # Activity from RH (assume isothermal): a_w = RH/100
    a_w = rh_in_pct / 100.0
    lambda_val = lambda_from_aw(a_w)

    # Conductivity (Springer-Rowland)
    sigma_s_cm = (0.005139 * lambda_val - 0.00326) * math.exp(1268 * (1/303 - 1/T_k))
    sigma_s_cm = max(1e-5, sigma_s_cm)

    # Ohmic resistance per unit area
    t_membrane_cm = t_membrane_um * 1e-4
    R_ohm_cm2 = t_membrane_cm / sigma_s_cm

    # Water generation rate at this current
    # Per cell: H2O moles = i / (2F) per cm². At 1 A/cm²: 5.18e-6 mol/(s·cm²)
    water_gen_mol_s_cm2 = i_a_cm2 / (2 * F)
    water_gen_g_s_cm2 = water_gen_mol_s_cm2 * 18.0
    # Total over 100 cm² (typical lab cell)
    A_cell_cm2 = 100
    water_gen_g_s = water_gen_g_s_cm2 * A_cell_cm2

    # Membrane drag coefficient
    n_drag = 2.5 * lambda_val / 22.0

    # Stoichiometric air flow at this i_density
    # For O2: n_O2_min = i_total / (4F). Air is 21% O2.
    # Stoich 2 typical to manage water
    i_total_A = i_a_cm2 * A_cell_cm2
    O2_mol_s = i_total_A / (4 * F)
    Air_mol_s_min = O2_mol_s / 0.21
    Air_mol_s_actual = Air_mol_s_min * 2  # stoich 2
    Air_lpm_actual = Air_mol_s_actual * 22.4 * 60  # STP L/min

    # Flooding risk if water gen > evaporation capacity
    # Evaporation = air flow × (Psat - Pin) / Patm
    P_sat_kpa = 0.61 * math.exp(17.27 * T_c / (T_c + 237.3))
    P_in_kpa = a_w * P_sat_kpa
    P_atm_kpa = 101.325
    # Max water in air at outlet (mol H2O / mol air)
    water_to_air_ratio_out = P_sat_kpa / (P_atm_kpa - P_sat_kpa)
    water_carry_capacity_mol_s = Air_mol_s_actual * water_to_air_ratio_out

    flooding_risk = water_gen_mol_s_cm2 * A_cell_cm2 > water_carry_capacity_mol_s

    return {
        "dry_air_flow_lpm": Q_air_lpm,
        "current_a_per_cm2": i_a_cm2,
        "temperature_c": T_c,
        "relative_humidity_in_pct": rh_in_pct,
        "water_content_lambda": round(lambda_val, 2),
        "ionic_conductivity_s_cm": round(sigma_s_cm, 5),
        "ohmic_resistance_ohm_cm2": round(R_ohm_cm2, 4),
        "water_generation_rate_g_s": round(water_gen_g_s, 4),
        "water_generation_rate_mol_s_cm2": float(f"{water_gen_mol_s_cm2:.3e}"),
        "membrane_drag_coefficient": round(n_drag, 2),
        "stoich_air_flow_lpm_at_2x": round(Air_lpm_actual, 1),
        "water_carry_capacity_mol_s": float(f"{water_carry_capacity_mol_s:.3e}"),
        "flooding_risk": flooding_risk,
        "p_sat_kpa": round(P_sat_kpa, 2),
        "p_water_inlet_kpa": round(P_in_kpa, 2),
        "membrane_thickness_um": t_membrane_um,
        "operating_window_ok": lambda_val >= 8.0 and not flooding_risk,
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
