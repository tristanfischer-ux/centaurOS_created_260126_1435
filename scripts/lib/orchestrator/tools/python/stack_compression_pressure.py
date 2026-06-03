#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/stack_compression_pressure.py

Solid-state battery stack compression for contact integrity.

Input:
    {
      "cell_area_cm2": 25.0,
      "stack_count": 100,
      "target_contact_pressure_mpa": 2.0,
      "frame_material": "aluminium",  // aluminium | stainless | composite
      "stack_thickness_mm": 50
    }

Output:
    {
      "clamp_force_n": ...,
      "frame_stress_mpa": ...,
      "frame_mass_kg": ...,
      ...
    }

Physics:
- Solid-state Li-metal cells require ≥1 MPa to maintain ionic contact;
  Toyota / SCiB samples use 2-10 MPa during cycling.
- Stack clamp force F = P × A_cell × N_cells.
- Frame stress = F / A_frame_cross_section.
- Material safety: σ_yield > σ_applied × safety factor (1.5 minimum).

References:
- Dixit et al. (2022) "Polymorphism of garnet solid electrolytes,"
  ACS Energy Lett. 7, 3987 — discusses pressure effects on conductivity.
- QuantumScape filings: 2-5 MPa typical stack pressure.
- Doux et al. (2020) "Stack Pressure Considerations for Room-Temperature
  All-Solid-State Lithium Metal Batteries," Adv. Energy Mater. 10, 1903253.
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
    "tool_name": "stack_compression_pressure (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Doux et al. (2020) Adv. Energy Mater. 10 1903253; QuantumScape technical filings",
    "physics_basis": "F = P × A × N stack force balance; frame stress vs yield strength.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

# Material properties (yield strength MPa, density kg/m³)
MATERIALS = {
    "aluminium":  (270, 2700),    # 6061-T6
    "stainless":  (520, 8000),    # 304 SS
    "composite":  (700, 1600),    # CFRP wound
    "steel":      (350, 7850),    # mild steel
    "titanium":   (880, 4500),    # Ti-6Al-4V
}


def compute(payload: dict) -> dict:
    A_cell_cm2 = float(payload.get("cell_area_cm2", 25.0))
    N_cells = int(payload.get("stack_count", 100))
    P_target_mpa = float(payload.get("target_contact_pressure_mpa", 2.0))
    frame_mat = str(payload.get("frame_material", "aluminium")).lower()
    stack_thick_mm = float(payload.get("stack_thickness_mm", 50.0))

    if frame_mat not in MATERIALS:
        frame_mat = "aluminium"
    sigma_yield_mpa, rho_kg_m3 = MATERIALS[frame_mat]

    # Total clamp force: P × A_cell × N (assume series stack with same area)
    A_cell_m2 = A_cell_cm2 * 1e-4
    P_pa = P_target_mpa * 1e6
    F_clamp_n = P_pa * A_cell_m2 * 1  # one force across the whole stack
    F_clamp_kn = F_clamp_n / 1000.0

    # Stack height total
    stack_height_m = (stack_thick_mm / 1000.0) * N_cells

    # Frame design: assume 4 tie rods at corners, each carrying F/4 in tension
    n_tie_rods = 4
    F_per_rod_n = F_clamp_n / n_tie_rods
    # Tie rod design: σ_applied = σ_yield / SF; SF = 1.5
    SF = 1.5
    sigma_design_mpa = sigma_yield_mpa / SF
    sigma_design_pa = sigma_design_mpa * 1e6
    # A_rod = F / σ_design
    A_rod_m2 = F_per_rod_n / sigma_design_pa
    A_rod_mm2 = A_rod_m2 * 1e6
    # Round-up to commercial bolt area: M8=36 mm², M10=58 mm², M12=84 mm², M16=157 mm², M20=245 mm²
    bolt_areas_mm2 = [36, 58, 84, 157, 245, 353, 561]  # M8..M30
    bolt_names = ["M8", "M10", "M12", "M16", "M20", "M24", "M30"]
    selected_idx = next((i for i, a in enumerate(bolt_areas_mm2) if a >= A_rod_mm2), len(bolt_areas_mm2) - 1)
    selected_bolt = bolt_names[selected_idx]
    selected_area_mm2 = bolt_areas_mm2[selected_idx]
    actual_stress_mpa = F_per_rod_n / (selected_area_mm2 * 1e-6) / 1e6

    # End plates: thickness sized to keep deflection < 0.1 mm under uniform pressure.
    # Plate bending: max deflection δ = 0.0138·P·b⁴ / (E·h³) for simply supported.
    # E for selected material:
    E_GPA = {"aluminium": 70, "stainless": 200, "composite": 70, "steel": 210, "titanium": 110}
    E_pa = E_GPA[frame_mat] * 1e9
    # Plate dim ≈ sqrt(A_cell)
    plate_side_m = math.sqrt(A_cell_m2) * 1.2  # 20% margin around cell footprint
    delta_target_mm = 0.1
    delta_target_m = delta_target_mm / 1000.0
    # h³ = 0.0138·P·b⁴ / (E·δ)
    h3 = 0.0138 * P_pa * (plate_side_m ** 4) / (E_pa * delta_target_m)
    h_plate_m = h3 ** (1.0 / 3.0)
    h_plate_mm = h_plate_m * 1000.0
    # Round up to standard plate thickness
    plate_stock_mm = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50]
    h_plate_recommended_mm = next((s for s in plate_stock_mm if s >= h_plate_mm), plate_stock_mm[-1])

    # Frame mass
    end_plate_vol_m3 = (plate_side_m ** 2) * (h_plate_recommended_mm / 1000.0)
    rod_vol_m3 = n_tie_rods * (selected_area_mm2 * 1e-6) * (stack_height_m + 0.1)  # +100 mm bolt extension
    frame_vol_m3 = 2 * end_plate_vol_m3 + rod_vol_m3  # 2 plates
    frame_mass_kg = frame_vol_m3 * rho_kg_m3

    # Stress check
    margin_pct = (sigma_yield_mpa - actual_stress_mpa) / sigma_yield_mpa * 100

    # Worked calculations (2026-06-03): the clamp force balance and tie-rod stress
    # are pure closed-form (F = P*A, stress = F/A) — fully hand-checkable. Pressure
    # is in MPa and area in mm2 so that MPa*mm2 = N directly (and MPa = N/mm2).
    A_cell_mm2 = A_cell_cm2 * 100.0  # cm2 -> mm2
    worked = [
        worked_calc(
            label="Stack clamp force",
            formula="clamp_force = target_pressure x cell_area",
            values={"target_pressure": (P_target_mpa, "MPa"),
                    "cell_area": (round(A_cell_mm2, 2), "mm2")},
            result=round(F_clamp_n, 0), result_unit="N",
            assumptions=["F = P * A across the cell footprint (MPa * mm2 = N)"],
        ),
        worked_calc(
            label="Force per tie rod",
            formula="force_per_rod = clamp_force / tie_rod_count",
            values={"clamp_force": (round(F_clamp_n, 0), "N"),
                    "tie_rod_count": (n_tie_rods, "")},
            result=round(F_per_rod_n, 0), result_unit="N",
            assumptions=[f"{n_tie_rods} tie rods at the corners share the clamp load equally in tension"],
        ),
        worked_calc(
            label="Tie-rod tensile stress",
            formula="frame_stress = force_per_rod / rod_area",
            values={"force_per_rod": (round(F_per_rod_n, 0), "N"),
                    "rod_area": (selected_area_mm2, "mm2")},
            result=round(actual_stress_mpa, 2), result_unit="MPa",
            assumptions=[f"selected {selected_bolt} thread (stress area {selected_area_mm2} mm2); N/mm2 = MPa"],
        ),
        worked_calc(
            label="Yield stress margin",
            formula="stress_margin = (yield_strength - frame_stress) / yield_strength x 100",
            values={"yield_strength": (sigma_yield_mpa, "MPa"),
                    "frame_stress": (round(actual_stress_mpa, 2), "MPa")},
            result=round(margin_pct, 1), result_unit="%",
            assumptions=[f"{frame_mat} yield strength {sigma_yield_mpa} MPa (design safety factor {SF})"],
        ),
    ]

    return {
        "cell_area_cm2": A_cell_cm2,
        "stack_count": N_cells,
        "target_contact_pressure_mpa": P_target_mpa,
        "frame_material": frame_mat,
        "clamp_force_n": round(F_clamp_n, 0),
        "clamp_force_kn": round(F_clamp_kn, 2),
        "tie_rod_count": n_tie_rods,
        "tie_rod_force_per_rod_n": round(F_per_rod_n, 0),
        "tie_rod_selected": selected_bolt,
        "tie_rod_area_mm2": selected_area_mm2,
        "frame_stress_mpa": round(actual_stress_mpa, 2),
        "frame_yield_strength_mpa": sigma_yield_mpa,
        "stress_margin_pct": round(margin_pct, 1),
        "end_plate_thickness_mm": h_plate_recommended_mm,
        "end_plate_thickness_required_mm": round(h_plate_mm, 2),
        "frame_mass_kg": round(frame_mass_kg, 2),
        "stack_height_mm": round(stack_height_m * 1000, 1),
        "safety_factor_design": SF,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
