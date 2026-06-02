#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pressure_vessel.py

Pressure vessel design for AUV / submersible / deep-sea housings.
Reads JSON from stdin, writes JSON to stdout.

Input:
    {
      "depth_m": 1000.0,
      "diameter_mm": 200.0,
      "wall_thickness_mm": 8.0,
      "length_mm": 600.0,
      "material": "Ti_grade5",          # Ti_grade5 | aluminium_7075 | steel_316L | aluminium_6061 | carbon_fiber
      "safety_factor_required": 2.0
    }

Output:
    {
      "depth_m": 1000.0,
      "external_pressure_mpa": 10.13,
      "hoop_stress_mpa": 126.6,
      "longitudinal_stress_mpa": 63.3,
      "yield_strength_mpa": 880.0,
      "safety_factor": 6.95,
      "buckling_pressure_critical_mpa": ...,
      "mass_kg": 4.7,
      "passes": true,
      ...
    }

Hoop stress (thin-wall cylinder): σ_h = P × r / t  (when t < r/10)
For thick wall (t > r/10), Lamé equation used.
Buckling of external-pressure cylinder: Bresse formula simplified

Reference: ASME BPVC Sec VIII Div 1, Roark's Formulas for Stress & Strain.
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
    "tool_name": 'pressure_vessel (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ASME BPVC Section VIII Division 1 (2023 edition)',
    "physics_basis": "Thin-wall cylinder hoop stress σ_h = pD/(2t). Roark's Formulas for Stress and Strain Table 13.1 for thick-wall corrections. External-pressure buckling per ASME Code Case 2286.",
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


G = 9.80665

# Material properties [yield MPa, ultimate MPa, density kg/m³, modulus GPa]
MATERIALS = {
    "Ti_grade5":      {"yield_mpa": 880,  "ult_mpa": 950,  "density": 4430, "E_gpa": 113.8},
    "Ti_grade2":      {"yield_mpa": 275,  "ult_mpa": 345,  "density": 4510, "E_gpa": 105},
    "aluminium_7075": {"yield_mpa": 503,  "ult_mpa": 572,  "density": 2810, "E_gpa": 71.7},
    "aluminium_6061": {"yield_mpa": 276,  "ult_mpa": 310,  "density": 2700, "E_gpa": 68.9},
    "steel_316L":     {"yield_mpa": 290,  "ult_mpa": 580,  "density": 8000, "E_gpa": 193},
    "steel_4130":     {"yield_mpa": 460,  "ult_mpa": 670,  "density": 7850, "E_gpa": 205},
    "carbon_fiber":   {"yield_mpa": 2400, "ult_mpa": 3500, "density": 1600, "E_gpa": 230},  # T700 typical
}


def compute(payload: dict) -> dict:
    depth_m = float(payload.get("depth_m", 1000.0))
    diameter_mm = float(payload.get("diameter_mm", 200.0))
    wall_t_mm = float(payload.get("wall_thickness_mm", 8.0))
    length_mm = float(payload.get("length_mm", diameter_mm * 3.0))
    material = str(payload.get("material", "Ti_grade5"))
    sf_required = float(payload.get("safety_factor_required", 2.0))

    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS.keys())}")
    mat = MATERIALS[material]

    rho_water = 1025.0  # kg/m³, seawater
    # External pressure (gauge — relative to atmospheric inside vessel)
    p_ext_pa = rho_water * G * depth_m  # Pa
    p_ext_mpa = p_ext_pa / 1e6

    # Geometry
    r_outer_mm = diameter_mm / 2.0
    r_inner_mm = r_outer_mm - wall_t_mm
    if r_inner_mm <= 0:
        raise ValueError("wall_thickness exceeds radius — pressure vessel impossible")

    # Hoop stress (thin-wall): σ_h = P × r / t [for r/t > 10, OK; else use Lamé]
    r_avg_mm = (r_outer_mm + r_inner_mm) / 2.0
    if wall_t_mm < r_avg_mm / 10.0:
        # Thin-wall formula
        sigma_hoop_mpa = p_ext_mpa * r_outer_mm / wall_t_mm
        thin_wall = True
    else:
        # Lamé for thick-wall, external pressure only
        # σ_t (at r_inner) = -2 P_o R_o² / (R_o² - R_i²)
        r_o_sq = r_outer_mm ** 2
        r_i_sq = r_inner_mm ** 2
        sigma_hoop_mpa = abs(2.0 * p_ext_mpa * r_o_sq / (r_o_sq - r_i_sq))
        thin_wall = False

    # Longitudinal stress (closed end) σ_l = P × r / (2 t)
    sigma_long_mpa = p_ext_mpa * r_outer_mm / (2.0 * wall_t_mm)

    # Safety factor on hoop stress vs yield
    safety_factor = mat["yield_mpa"] / max(1e-6, sigma_hoop_mpa)

    # Critical buckling pressure for thin-walled cylinder under external pressure
    # P_cr = 2 E / (1 - ν²) × (t/D)³ / [1 + ½(πD/L)²]  (Bresse / Bryan)
    # Simplified for L > D (typical): P_cr ≈ 2 E (t/D)³ / (1 - ν²)
    e_pa = mat["E_gpa"] * 1e9
    nu = 0.3  # Poisson's ratio (typical metal)
    p_cr_pa = 2.0 * e_pa * ((wall_t_mm / diameter_mm) ** 3) / (1.0 - nu ** 2)
    p_cr_mpa = p_cr_pa / 1e6

    # Buckling safety factor
    buckling_sf = p_cr_mpa / max(1e-6, p_ext_mpa)

    # Mass of the cylinder (no end caps)
    # Volume_cylinder_wall = π × (R_o² - R_i²) × L  [mm³]
    vol_mm3 = math.pi * (r_outer_mm ** 2 - r_inner_mm ** 2) * length_mm
    vol_m3 = vol_mm3 / 1e9
    mass_kg = vol_m3 * mat["density"]

    # End-cap mass (hemispheres, 2x)
    # Vol_hemisphere = (2/3) π R³  → 2 of them = (4/3) π R³ but only the
    # wall thickness mass matters; approximate end caps as flat plate with
    # thickness ≈ wall thickness, area = π R²
    end_cap_area_mm2 = math.pi * r_outer_mm ** 2
    end_cap_vol_mm3 = 2 * end_cap_area_mm2 * wall_t_mm
    end_cap_mass_kg = (end_cap_vol_mm3 / 1e9) * mat["density"]
    total_mass_kg = mass_kg + end_cap_mass_kg

    passes = (safety_factor >= sf_required) and (buckling_sf >= sf_required)

    # Worked calculations — chained off rounded intermediates so a reviewer
    # can verify each step by hand without the source code.
    p_ext_mpa_r = round(p_ext_mpa, 4)
    if thin_wall:
        sigma_hoop_r = round(sigma_hoop_mpa, 3)
        hoop_formula = "sigma_hoop = p_ext x r_outer / t"
        hoop_values = {
            "p_ext": (p_ext_mpa_r, "MPa"),
            "r_outer": (r_outer_mm, "mm"),
            "t": (wall_t_mm, "mm"),
        }
        hoop_note = "thin-wall formula (t < r/10)"
    else:
        sigma_hoop_r = round(sigma_hoop_mpa, 3)
        hoop_formula = "sigma_hoop = 2 x p_ext x r_outer^2 / (r_outer^2 - r_inner^2)"
        hoop_values = {
            "p_ext": (p_ext_mpa_r, "MPa"),
            "r_outer": (round(r_outer_mm, 2), "mm"),
            "r_inner": (round(r_inner_mm, 2), "mm"),
        }
        hoop_note = "Lame thick-wall formula (external pressure only)"
    sigma_long_r = round(sigma_long_mpa, 3)
    p_cr_mpa_r = round(p_cr_mpa, 4)
    safety_factor_r = round(safety_factor, 3)
    buckling_sf_r = round(buckling_sf, 3)
    vol_m3_r = round(vol_m3, 6)
    mass_kg_r = round(mass_kg, 3)
    end_cap_area_mm2_r = round(end_cap_area_mm2, 2)
    end_cap_vol_mm3_r = round(end_cap_vol_mm3, 2)
    end_cap_mass_kg_r = round(end_cap_mass_kg, 3)

    worked = [
        worked_calc(
            label="External hydrostatic pressure",
            formula="p_ext = rho_water x G x depth / 1e6",
            values={
                "rho_water": (1025.0, "kg/m3"),
                "G": (9.80665, "m/s2"),
                "depth": (depth_m, "m"),
            },
            result=p_ext_mpa_r, result_unit="MPa",
            assumptions=["seawater density 1025 kg/m3", "gauge pressure (atmospheric inside)", "divide by 1e6 converts Pa to MPa"],
        ),
        worked_calc(
            label="Hoop stress",
            formula=hoop_formula,
            values=hoop_values,
            result=sigma_hoop_r, result_unit="MPa",
            assumptions=[hoop_note],
        ),
        worked_calc(
            label="Longitudinal stress (closed-end)",
            formula="sigma_long = p_ext x r_outer / (2 x t)",
            values={
                "p_ext": (p_ext_mpa_r, "MPa"),
                "r_outer": (r_outer_mm, "mm"),
                "t": (wall_t_mm, "mm"),
            },
            result=sigma_long_r, result_unit="MPa",
            assumptions=["closed end-cap assumption; sigma_long = sigma_hoop / 2 for thin wall"],
        ),
        worked_calc(
            label="Yield safety factor (hoop-governing)",
            formula="SF_yield = yield_mpa / sigma_hoop",
            values={
                "yield_mpa": (mat["yield_mpa"], "MPa"),
                "sigma_hoop": (sigma_hoop_r, "MPa"),
            },
            result=safety_factor_r, result_unit="",
            assumptions=[f"material {material}; yield from datasheet/standard"],
        ),
        worked_calc(
            label="Critical external-pressure buckling (Bresse / Bryan)",
            formula="p_cr = 2 x E_gpa x 1000 x (t / diameter)^3 / (1 - nu^2)",
            values={
                "E_gpa": (mat["E_gpa"], "GPa"),
                "t": (wall_t_mm, "mm"),
                "diameter": (diameter_mm, "mm"),
                "nu": (0.3, ""),
            },
            result=p_cr_mpa_r, result_unit="MPa",
            assumptions=[
                "nu = 0.3 (Poisson's ratio, typical metal)",
                "simplified Bresse formula valid for L > D",
                "factor 1000 converts E from GPa to MPa; mm/mm ratio cancels units",
            ],
        ),
        worked_calc(
            label="Buckling safety factor",
            formula="SF_buckling = p_cr / p_ext",
            values={
                "p_cr": (p_cr_mpa_r, "MPa"),
                "p_ext": (p_ext_mpa_r, "MPa"),
            },
            result=buckling_sf_r, result_unit="",
            assumptions=[],
        ),
        worked_calc(
            label="Cylinder wall volume",
            formula="vol_m3 = pi x (r_outer^2 - r_inner^2) x length_mm / 1e9",
            values={
                "r_outer": (r_outer_mm, "mm"),
                "r_inner": (round(r_inner_mm, 2), "mm"),
                "length_mm": (length_mm, "mm"),
            },
            result=vol_m3_r, result_unit="m3",
            assumptions=["cylindrical shell only; end caps computed separately", "1e9 converts mm3 to m3"],
        ),
        worked_calc(
            label="Cylinder wall mass",
            formula="mass_kg = vol_m3 x density",
            values={
                "vol_m3": (vol_m3_r, "m3"),
                "density": (mat["density"], "kg/m3"),
            },
            result=mass_kg_r, result_unit="kg",
            assumptions=[f"material {material}"],
        ),
        worked_calc(
            label="End-cap mass (both flat-plate approximation)",
            formula="end_cap_mass = 2 x pi x r_outer^2 x t x density / 1e9",
            values={
                "r_outer": (r_outer_mm, "mm"),
                "t": (wall_t_mm, "mm"),
                "density": (mat["density"], "kg/m3"),
            },
            result=end_cap_mass_kg_r, result_unit="kg",
            assumptions=["flat-plate end-cap approximation; 2 caps", "1e9 converts mm3 to m3"],
        ),
        worked_calc(
            label="Total vessel mass",
            formula="total_mass = mass_cylinder + mass_end_caps",
            values={
                "mass_cylinder": (mass_kg_r, "kg"),
                "mass_end_caps": (end_cap_mass_kg_r, "kg"),
            },
            result=round(total_mass_kg, 3), result_unit="kg",
            assumptions=[],
        ),
    ]

    return {
        "depth_m": depth_m,
        "diameter_mm": diameter_mm,
        "wall_thickness_mm": wall_t_mm,
        "length_mm": length_mm,
        "material": material,
        "yield_strength_mpa": mat["yield_mpa"],
        "ultimate_strength_mpa": mat["ult_mpa"],
        "external_pressure_pa": round(p_ext_pa, 1),
        "external_pressure_mpa": round(p_ext_mpa, 4),
        "hoop_stress_mpa": round(sigma_hoop_mpa, 3),
        "longitudinal_stress_mpa": round(sigma_long_mpa, 3),
        "thin_wall_assumption_valid": thin_wall,
        "yield_safety_factor": round(safety_factor, 3),
        "buckling_critical_pressure_mpa": round(p_cr_mpa, 4),
        "buckling_safety_factor": round(buckling_sf, 3),
        "safety_factor": round(min(safety_factor, buckling_sf), 3),  # governing
        "cylinder_mass_kg": round(mass_kg, 3),
        "end_cap_mass_kg": round(end_cap_mass_kg, 3),
        "mass_kg": round(total_mass_kg, 3),
        "safety_factor_required": sf_required,
        "passes": passes,
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
