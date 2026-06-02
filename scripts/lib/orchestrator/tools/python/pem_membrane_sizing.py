#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pem_membrane_sizing.py

PEM electrolyser stack sizing for target H2 output.
Stdin JSON -> stdout JSON.

Input:
    {
      "target_h2_kg_per_day": 1000.0,
      "current_density_a_cm2": 2.0,
      "voltage_v": 1.85,                  # per cell voltage
      "active_area_per_cell_cm2": 1500.0,
      "faradaic_efficiency": 0.98
    }

Output:
    {
      "active_area_m2": 250.0,
      "cell_count": 1668,
      "total_power_kw": 4870.0,
      "stack_count": 5,
      ...
    }

Method:
  H2 mass rate per cell area: ṁ = (j × η_F × M_H2) / (2 × F) [kg/s/cm²]
  - 1 A/cm² produces 0.0376 kg H2 / day / cm² (η_F = 1.0)
  - Required total cell area = target_kg_day / per-area-rate
  - Cell count = total_area / per-cell-area
  - Power = cell_count × area_per_cell × j × V_cell

Reference: Bessarabov "PEM Electrolysis for Hydrogen Production" CRC 2016
Ch 4, Siemens Silyzer 300 product data, NEL M-series H2 generator
data sheets.

License: MIT.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'pem_membrane_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Bessarabov, Wang, Li, Zhao eds. (2016) 'PEM Electrolysis for Hydrogen Production: Principles and Applications', CRC Press",
    "physics_basis": "Faraday's law for H2 mass-rate: m_dot_H2 = I × M_H2 / (2F). Membrane sizing from current density i × area = total current.",
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


F_CONST = 96485.33  # C/mol
M_H2 = 2.016e-3  # kg/mol


def compute(payload: dict) -> dict:
    target_h2_kg_day = float(payload.get("target_h2_kg_per_day", 1000.0))
    j_a_cm2 = float(payload.get("current_density_a_cm2", 2.0))
    v_cell = float(payload.get("voltage_v", 1.85))
    a_per_cell_cm2 = float(payload.get("active_area_per_cell_cm2", 1500.0))
    eta_F = float(payload.get("faradaic_efficiency", 0.98))

    # H2 mass per second per cm² active area
    # i (A/cm²) × η_F / (2 F) = mol H2 / s / cm² → × M_H2 kg/mol
    rate_kg_s_cm2 = (j_a_cm2 * eta_F * M_H2) / (2.0 * F_CONST)
    rate_kg_day_cm2 = rate_kg_s_cm2 * 86400.0  # kg/day per cm²

    total_area_cm2 = target_h2_kg_day / max(1e-9, rate_kg_day_cm2)
    total_area_m2 = total_area_cm2 / 1e4

    cell_count = math.ceil(total_area_cm2 / max(1e-3, a_per_cell_cm2))

    # Power = I × V per cell × cell_count where I = j × A_per_cell
    current_per_cell_a = j_a_cm2 * a_per_cell_cm2
    power_per_cell_w = current_per_cell_a * v_cell
    total_power_w = power_per_cell_w * cell_count

    # Typical stack max cells: 100-300 per stack (commercial)
    cells_per_stack = 200
    stack_count = max(1, math.ceil(cell_count / cells_per_stack))

    # H2 produced per kWh
    h2_per_kwh = target_h2_kg_day / max(1e-9, (total_power_w / 1000.0 * 24.0))

    # Specific energy consumption (kWh/kg H2)
    spec_energy_kwh_per_kg = (total_power_w / 1000.0 * 24.0) / max(1e-9, target_h2_kg_day)

    # Water consumption: 9 kg H2O per kg H2 (stoich + cooling/humidification)
    water_kg_day = target_h2_kg_day * 9.0  # stoichiometric
    water_total_kg_day = water_kg_day * 1.5  # +50% for cooling/humid

    # Worked calculations — all steps are closed-form arithmetic.
    # rate_kg_s_cm2 involves Faraday constants and is passed as a rounded input.
    # Display the rate in micro-kg/day/cm² (multiply by 1e6) so that _fmt shows
    # four meaningful decimal digits rather than rounding 0.001769 -> 0.0018,
    # which would make the substitution 1000/0.0018 = 555,555 instead of 565,237.
    rate_day_r = round(rate_kg_day_cm2, 6)
    rate_day_u_r = round(rate_kg_day_cm2 * 1e6, 4)   # same value in ug/day/cm²
    total_area_cm2_r = round(total_area_cm2, 1)
    total_area_m2_r = round(total_area_m2, 2)
    current_per_cell_r = round(current_per_cell_a, 1)
    power_per_cell_r = round(power_per_cell_w, 1)
    total_power_kw_r = round(total_power_w / 1000.0, 2)
    water_kg_day_r = round(water_kg_day, 1)
    water_total_r = round(water_total_kg_day, 1)

    worked = [
        worked_calc(
            label="H2 production rate per cm^2 per day",
            formula="rate_kg_day_cm2 = rate_kg_s_cm2 x 86400",
            values={"rate_kg_s_cm2": (round(rate_kg_s_cm2, 10), "kg/s/cm^2")},
            result=rate_day_r, result_unit="kg/day/cm^2",
            assumptions=[
                "rate_kg_s_cm2 = j x eta_F x M_H2 / (2 x F) — Faraday's law; 86400 s/day",
                f"j = {j_a_cm2} A/cm^2, eta_F = {eta_F}, M_H2 = {M_H2} kg/mol, F = {F_CONST} C/mol",
            ],
        ),
        worked_calc(
            label="Total required active area",
            formula="total_area_cm2 = target_h2_kg_day x 1e6 / rate_ukg_day_cm2",
            values={
                "target_h2_kg_day": (target_h2_kg_day, "kg/day"),
                "rate_ukg_day_cm2": (rate_day_u_r, "ug/day/cm^2"),
            },
            result=total_area_cm2_r, result_unit="cm^2",
            assumptions=[
                "Linear scaling: area = production target / unit-area rate",
                "rate expressed in micro-kg/day/cm^2 (x 1e6) to preserve display precision",
            ],
        ),
        worked_calc(
            label="Total active area in m^2",
            formula="total_area_m2 = total_area_cm2 / 10000",
            values={"total_area_cm2": (total_area_cm2_r, "cm^2")},
            result=total_area_m2_r, result_unit="m^2",
            assumptions=["1 m^2 = 10,000 cm^2"],
        ),
        worked_calc(
            label="Current per cell",
            formula="I_cell = j x A_per_cell",
            values={"j": (j_a_cm2, "A/cm^2"), "A_per_cell": (a_per_cell_cm2, "cm^2")},
            result=current_per_cell_r, result_unit="A",
            assumptions=["All cells operate at the same current density"],
        ),
        worked_calc(
            label="Power per cell",
            formula="P_cell = I_cell x V_cell",
            values={"I_cell": (current_per_cell_r, "A"), "V_cell": (v_cell, "V")},
            result=power_per_cell_r, result_unit="W",
            assumptions=["V_cell is the per-cell operating voltage (includes overpotentials)"],
        ),
        worked_calc(
            label="Total stack power",
            formula="P_total_kw = P_cell x cell_count / 1000",
            values={"P_cell": (power_per_cell_r, "W"), "cell_count": (cell_count, "")},
            result=total_power_kw_r, result_unit="kW",
            assumptions=["cell_count = ceil(total_area_cm2 / area_per_cell) — ceiling applied before this step"],
        ),
        worked_calc(
            label="Stoichiometric water consumption",
            formula="water_kg_day = target_h2_kg_day x 9",
            values={"target_h2_kg_day": (target_h2_kg_day, "kg/day")},
            result=water_kg_day_r, result_unit="kg/day",
            assumptions=["9 kg H2O per kg H2 (stoichiometric: 2H2O -> 2H2 + O2; M_H2O/M_H2 = 18/2 = 9)"],
        ),
        worked_calc(
            label="Total water requirement (incl. cooling + humidification)",
            formula="water_total = water_stoich x 1.5",
            values={"water_stoich": (water_kg_day_r, "kg/day")},
            result=water_total_r, result_unit="kg/day",
            assumptions=["+50% for cooling water and membrane humidification (Bessarabov 2016 design factor)"],
        ),
    ]

    return {
        "active_area_m2": round(total_area_m2, 2),
        "active_area_cm2": round(total_area_cm2, 1),
        "cell_count": cell_count,
        "stack_count": stack_count,
        "cells_per_stack": cells_per_stack,
        "current_per_cell_a": round(current_per_cell_a, 1),
        "voltage_per_cell_v": v_cell,
        "stack_voltage_v": round(v_cell * cells_per_stack, 1),
        "stack_current_a": round(current_per_cell_a, 1),
        "power_per_cell_w": round(power_per_cell_w, 1),
        "total_power_kw": round(total_power_w / 1000.0, 2),
        "target_h2_kg_per_day": target_h2_kg_day,
        "h2_rate_per_cm2_kg_day": round(rate_kg_day_cm2, 6),
        "h2_per_kwh_kg": round(h2_per_kwh, 5),
        "spec_energy_kwh_per_kg_h2": round(spec_energy_kwh_per_kg, 2),
        "water_stoich_kg_day": round(water_kg_day, 1),
        "water_total_kg_day": round(water_total_kg_day, 1),
        "faradaic_efficiency": eta_F,
        "worked": worked,
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
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
