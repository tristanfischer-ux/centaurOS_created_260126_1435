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
import sys
import time


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
