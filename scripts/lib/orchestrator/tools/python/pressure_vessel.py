#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pressure_vessel.py

Pressure vessel design — TWO physics modes:

  mode = "external" (default): AUV / submersible / deep-sea HOUSING under
      EXTERNAL hydrostatic pressure set by water depth. Hoop stress + external-
      pressure buckling govern. (The original AUV-class behaviour, unchanged.)

  mode = "internal": a process column / reactor / tank under INTERNAL design
      gauge pressure (a chemical plant, NOT the seabed). Sizes a thin-wall
      cylinder from the INTERNAL design pressure via the ASME VIII Div.1 UG-27
      circumferential-stress rule t = P D / (2 S E - 1.2 P) + corrosion
      allowance, surfaces the hoop stress at the adopted wall, and computes the
      shell mass from geometry x steel density. NO seawater / depth / external-
      hydrostatic maths appears. (Mirrors reactor_cstr_pfr_sizing.py's shell
      wall calc so a CO2/chemical-plant column reads as a real pressure vessel,
      not a fake "29.8 m of seawater" hack.)

Reads JSON from stdin, writes JSON to stdout.

EXTERNAL-mode input:
    {
      "mode": "external",               # optional; default
      "depth_m": 1000.0,
      "diameter_mm": 200.0,
      "wall_thickness_mm": 8.0,
      "length_mm": 600.0,
      "material": "Ti_grade5",          # Ti_grade5 | aluminium_7075 | steel_316L | aluminium_6061 | carbon_fiber
      "safety_factor_required": 2.0
    }

INTERNAL-mode input:
    {
      "mode": "internal",
      "design_pressure_barg": 3.0,      # OR design_pressure_mpa; internal gauge
      "diameter_mm": 900.0,
      "length_mm": 9000.0,
      "material": "steel_316L",
      "corrosion_allowance_mm": 3.0,    # optional (default 3.0)
      "weld_joint_efficiency": 0.85,    # optional (default 0.85, spot-RT)
      "allowable_stress_mpa": null,     # optional override; else 0.6 x yield
      "safety_factor_required": 2.0
    }
    (wall_thickness_mm is OPTIONAL in internal mode — the tool COMPUTES the
    minimum wall from the pressure; if supplied it is used as a floor.)

EXTERNAL Output:
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

INTERNAL Output:
    {
      "mode": "internal",
      "design_pressure_barg": 3.0,
      "design_pressure_mpa": 0.3,
      "wall_thickness_mm": 8.0,         # adopted shell wall (>= 5 mm handling min)
      "hoop_stress_mpa": 16.9,          # at the adopted wall, internal pressure
      "yield_safety_factor": 17.2,      # yield / hoop (governing check)
      "mass_kg": 1274.0,
      "passes": true,
      ...
    }

Hoop stress (thin-wall cylinder): σ_h = P × r / t  (when t < r/10)
For thick wall (t > r/10), Lamé equation used (external mode).
Buckling of external-pressure cylinder: Bresse formula simplified (external mode).
Internal-pressure shell thickness: ASME VIII Div.1 UG-27 circumferential stress.

Reference: ASME BPVC Sec VIII Div 1 (UG-27), Roark's Formulas for Stress & Strain.
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
    "physics_basis": "EXTERNAL mode (AUV/submersible): thin-wall cylinder hoop stress σ_h = pD/(2t) under external hydrostatic pressure; Roark's Formulas for Stress and Strain Table 13.1 for thick-wall corrections; external-pressure buckling per ASME Code Case 2286. INTERNAL mode (process column/reactor/tank): minimum shell thickness from internal design pressure via ASME VIII Div.1 UG-27 circumferential stress t = P D / (2 S E - 1.2 P) + corrosion allowance, hoop stress σ_h = P D / (2 t) reported at the adopted wall, shell mass from cylinder-wall geometry × steel density.",
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-06-04",
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
    """Dispatch on `mode`: 'internal' (process column/reactor/tank under internal
    design pressure) or 'external' (AUV/submersible housing under external
    hydrostatic pressure — the default, unchanged historical behaviour)."""
    mode = str(payload.get("mode", "external")).strip().lower()
    if mode == "internal":
        return compute_internal(payload)
    if mode not in ("external", ""):
        raise ValueError(f"mode must be 'internal' or 'external', got {mode!r}")
    return compute_external(payload)


def compute_internal(payload: dict) -> dict:
    """Size a thin-wall cylinder from INTERNAL design pressure (a process column /
    reactor / tank in a chemical plant). ASME VIII Div.1 UG-27 circumferential-
    stress wall + hoop stress + shell mass from geometry. NO seawater / depth /
    external-hydrostatic maths. Mirrors reactor_cstr_pfr_sizing.py's shell calc."""
    diameter_mm = float(payload.get("diameter_mm", 900.0))
    length_mm = float(payload.get("length_mm", diameter_mm * 3.0))
    material = str(payload.get("material", "steel_316L"))
    sf_required = float(payload.get("safety_factor_required", 2.0))
    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS.keys())}")
    mat = MATERIALS[material]

    # Internal design gauge pressure (barg preferred; MPa accepted as override).
    if payload.get("design_pressure_mpa") is not None:
        p_design_mpa = float(payload["design_pressure_mpa"])
        p_design_barg = p_design_mpa / 0.1
    else:
        p_design_barg = float(payload.get("design_pressure_barg", 3.0))
        p_design_mpa = p_design_barg * 0.1                 # 1 bar = 0.1 MPa
    if p_design_mpa <= 0:
        raise ValueError("internal design pressure must be > 0")

    # Allowable stress S: supplied, else ASME-style ~0.6 x yield.
    s_allow = payload.get("allowable_stress_mpa")
    if s_allow is None:
        s_allow_mpa = 0.6 * mat["yield_mpa"]
        s_basis = "0.6 x yield (no datasheet allowable supplied)"
    else:
        s_allow_mpa = float(s_allow)
        s_basis = "supplied allowable stress"
    weld_eff = float(payload.get("weld_joint_efficiency", 0.85))      # E (spot-RT)
    corr_mm = float(payload.get("corrosion_allowance_mm", 3.0))

    # ASME VIII Div.1 UG-27 circumferential (hoop): t = P R / (S E - 0.6 P); D = 2R
    #   => t = P D / (2 S E - 1.2 P)
    denom = (2.0 * s_allow_mpa * weld_eff - 1.2 * p_design_mpa)
    if denom <= 0:
        raise ValueError("design pressure too high for allowable stress (negative wall thickness)")
    t_pressure_mm = p_design_mpa * diameter_mm / denom
    t_min_mm = t_pressure_mm + corr_mm
    # Practical handling minimum (Sinnott: small vessels rarely below ~5 mm),
    # and a supplied wall (if any) is treated as a floor.
    wall_floor_mm = float(payload.get("wall_thickness_mm", 0.0))
    wall_t_mm = max(t_min_mm, 5.0, wall_floor_mm)

    # Geometry
    r_inner_mm = diameter_mm / 2.0
    r_outer_mm = r_inner_mm + wall_t_mm

    # Hoop stress at the adopted wall, internal pressure (thin-wall): σ_h = P D / (2 t)
    sigma_hoop_mpa = p_design_mpa * diameter_mm / (2.0 * wall_t_mm)
    # Yield safety factor (the governing check for an internally-pressurised vessel).
    yield_sf = mat["yield_mpa"] / max(1e-6, sigma_hoop_mpa)

    # Shell mass: cylindrical wall + 2 flat-head plates (conservative vs torispherical).
    cyl_wall_vol_mm3 = math.pi * (r_outer_mm ** 2 - r_inner_mm ** 2) * length_mm
    head_vol_mm3 = 2.0 * (math.pi * r_outer_mm ** 2) * wall_t_mm
    cyl_mass_kg = (cyl_wall_vol_mm3 / 1e9) * mat["density"]
    head_mass_kg = (head_vol_mm3 / 1e9) * mat["density"]
    total_mass_kg = cyl_mass_kg + head_mass_kg

    passes = yield_sf >= sf_required

    # ----- worked[] — drift-safe, chained off rounded intermediates, INTERNAL maths -----
    p_design_mpa_r = round(p_design_mpa, 4)
    p_design_barg_r = round(p_design_barg, 3)
    s_allow_r = round(s_allow_mpa, 2)
    t_pressure_r = round(t_pressure_mm, 4)
    t_adopt_r = round(wall_t_mm, 3)
    sigma_hoop_r = round(sigma_hoop_mpa, 3)
    yield_sf_r = round(yield_sf, 3)
    cyl_mass_r = round(cyl_mass_kg, 3)
    head_mass_r = round(head_mass_kg, 3)

    worked = [
        worked_calc(
            label="Internal design pressure",
            formula="p_design_mpa = p_design_barg x 0.1",
            values={"p_design_barg": (p_design_barg_r, "barg")},
            result=p_design_mpa_r, result_unit="MPa",
            assumptions=["internal gauge design pressure of the process vessel",
                         "1 bar = 0.1 MPa"],
        ),
        worked_calc(
            label="Shell minimum thickness (hoop stress, internal pressure)",
            formula="t = p_design x D / (2 x S x E - 1.2 x p_design) + corr",
            values={
                "p_design": (p_design_mpa_r, "MPa"),
                "D": (round(diameter_mm, 1), "mm"),
                "S": (s_allow_r, "MPa"),
                "E": (weld_eff, ""),
                "corr": (corr_mm, "mm"),
            },
            result=round(t_pressure_mm + corr_mm, 3), result_unit="mm",
            assumptions=["ASME VIII Div.1 UG-27 circumferential-stress form (BS EN 13445 equivalent)",
                         s_basis, f"+ {corr_mm} mm corrosion allowance",
                         f"adopted shell t = {t_adopt_r} mm (>= 5 mm practical handling minimum)"],
        ),
        worked_calc(
            label="Hoop stress at adopted wall (internal pressure)",
            formula="sigma_hoop = p_design x D / (2 x t)",
            values={
                "p_design": (p_design_mpa_r, "MPa"),
                "D": (round(diameter_mm, 1), "mm"),
                "t": (t_adopt_r, "mm"),
            },
            result=sigma_hoop_r, result_unit="MPa",
            assumptions=["thin-wall cylinder under internal pressure"],
        ),
        worked_calc(
            label="Yield safety factor (hoop-governing, internal pressure)",
            formula="SF_yield = yield_mpa / sigma_hoop",
            values={
                "yield_mpa": (mat["yield_mpa"], "MPa"),
                "sigma_hoop": (sigma_hoop_r, "MPa"),
            },
            result=yield_sf_r, result_unit="",
            assumptions=[f"material {material}; yield from datasheet/standard",
                         "internal-pressure vessel — yield governs (no external-buckling check)"],
        ),
        worked_calc(
            label="Cylinder wall mass",
            formula="mass = pi x (r_outer^2 - r_inner^2) x length_mm x density / 1e9",
            values={
                "r_outer": (round(r_outer_mm, 2), "mm"),
                "r_inner": (round(r_inner_mm, 2), "mm"),
                "length_mm": (round(length_mm, 1), "mm"),
                "density": (mat["density"], "kg/m3"),
            },
            result=cyl_mass_r, result_unit="kg",
            assumptions=[f"material {material}", "cylindrical shell only; heads computed separately",
                         "1e9 converts mm3 to m3"],
        ),
        worked_calc(
            label="Head mass (2 flat-plate heads)",
            formula="mass = 2 x pi x r_outer^2 x t x density / 1e9",
            values={
                "r_outer": (round(r_outer_mm, 2), "mm"),
                "t": (t_adopt_r, "mm"),
                "density": (mat["density"], "kg/m3"),
            },
            result=head_mass_r, result_unit="kg",
            assumptions=["flat-head approximation (conservative vs torispherical); 2 heads",
                         "1e9 converts mm3 to m3"],
        ),
        worked_calc(
            label="Total vessel shell mass",
            formula="total_mass = mass_cylinder + mass_heads",
            values={
                "mass_cylinder": (cyl_mass_r, "kg"),
                "mass_heads": (head_mass_r, "kg"),
            },
            result=round(total_mass_kg, 3), result_unit="kg",
            assumptions=[],
        ),
    ]

    return {
        "mode": "internal",
        "diameter_mm": diameter_mm,
        "length_mm": length_mm,
        "material": material,
        "yield_strength_mpa": mat["yield_mpa"],
        "ultimate_strength_mpa": mat.get("ult_mpa"),
        "design_pressure_barg": round(p_design_barg, 3),
        "design_pressure_mpa": round(p_design_mpa, 4),
        "allowable_stress_mpa": round(s_allow_mpa, 2),
        "weld_joint_efficiency": weld_eff,
        "corrosion_allowance_mm": corr_mm,
        "wall_thickness_pressure_mm": round(t_pressure_mm, 4),
        "wall_thickness_mm": round(wall_t_mm, 3),
        "hoop_stress_mpa": round(sigma_hoop_mpa, 3),
        "yield_safety_factor": round(yield_sf, 3),
        "safety_factor": round(yield_sf, 3),          # internal-pressure governing check
        "cylinder_mass_kg": round(cyl_mass_kg, 3),
        "head_mass_kg": round(head_mass_kg, 3),
        "mass_kg": round(total_mass_kg, 3),
        "safety_factor_required": sf_required,
        "passes": passes,
        "worked": worked,
    }


def compute_external(payload: dict) -> dict:
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
