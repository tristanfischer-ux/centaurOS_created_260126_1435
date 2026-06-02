#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/composite_tow_steering.py

Composite tow-steering — Rapid Tow Shearing (RTS) for variable-stiffness
laminates.

Companies served: iCOMAT (UK), Solvay Composites, Hexcel.

Input:
    {
      "tow_width_mm": 3.0,
      "steering_radius_mm": 100.0,
      "layer_count": 8,
      "fibre_volume_fraction": 0.6,
      "material": "T800S" | "T1100G" | "IM7" | "AS4"
    }

Output:
    defect_count, structural_efficiency_factor, mass_savings_vs_quasi_iso_pct,
    layup_time_hours, _provenance.

Physics:
  Variable-stiffness laminate stiffness optimisation (Setoodeh-Gürdal)
  Defect generation when tow shear angle > 12° (Hyer)
  Mass savings: 10-30% vs straight-fibre laminate
  Tow shearing radius limit: R_min = w_tow / (2 * sin(theta_max))

References:
- Gürdal, Z., Olmedo, R., "In-plane response of laminates with spatially
  varying fiber orientations: variable stiffness concept", AIAA J. 31(4):
  751-758, 1993.
- Kim, B.C., Potter, K., Weaver, P.M., "Continuous tow shearing for
  manufacturing variable angle tow composites", Composites Part A 43(8):
  1347-1356, 2012.
- Hyer, M.W., Lee, H.H., "The use of curvilinear fiber format to improve
  buckling resistance of composite plates with central circular holes",
  Compos. Struct. 18(3):239-261, 1991.
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
    "tool_name": "composite_tow_steering (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Gürdal & Olmedo (1993) AIAA J. 31(4):751 DOI:10.2514/3.11719; "
        "Kim, Potter & Weaver (2012) Composites A 43(8):1347 "
        "DOI:10.1016/j.compositesa.2012.02.024 (RTS process); "
        "Hyer & Lee (1991) Compos. Struct. 18(3):239 "
        "DOI:10.1016/0263-8223(91)90035-W."
    ),
    "physics_basis": (
        "Tow-steering geometry — radius limit set by shear-angle defect "
        "threshold (~12°). Stiffness efficiency from optimisation of "
        "fibre paths to load directions."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "MATERIAL_PROPERTIES": {
            "source": "Toray/Hexcel datasheets: T800S 5.9 GPa tensile strength, IM7 5.5 GPa",
            "confidence": "datasheet",
        },
        "SHEAR_DEFECT_THRESHOLD_DEG": {
            "source": "Hyer 1991 + Kim 2012: tow-shear angle defect onset at 8-15°",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Material tensile strength (MPa) and modulus (GPa)
MATERIALS = {
    "T800S":  {"tensile_mpa": 5900, "modulus_gpa": 294, "density_g_cm3": 1.80},
    "T1100G": {"tensile_mpa": 6900, "modulus_gpa": 324, "density_g_cm3": 1.79},
    "IM7":    {"tensile_mpa": 5520, "modulus_gpa": 276, "density_g_cm3": 1.78},
    "AS4":    {"tensile_mpa": 4480, "modulus_gpa": 231, "density_g_cm3": 1.78},
    "HR40":   {"tensile_mpa": 5200, "modulus_gpa": 287, "density_g_cm3": 1.81},
}

SHEAR_DEFECT_THRESHOLD_DEG = 12.0


def compute(payload: dict) -> dict:
    tow_width_mm = float(payload.get("tow_width_mm", 3.0))
    steering_radius_mm = float(payload.get("steering_radius_mm", 100.0))
    layer_count = int(payload.get("layer_count", 8))
    Vf = float(payload.get("fibre_volume_fraction", 0.6))
    material = str(payload.get("material", "T800S"))

    if material not in MATERIALS:
        material = "T800S"
    mat = MATERIALS[material]

    # Minimum steering radius (no defect) = w/(2 sin(theta_max))
    theta_max_rad = math.radians(SHEAR_DEFECT_THRESHOLD_DEG)
    r_min_no_defect_mm = tow_width_mm / (2.0 * math.sin(theta_max_rad))

    # Defect count per linear meter of steered tow
    if steering_radius_mm < r_min_no_defect_mm:
        # Shear angle required:
        actual_shear_rad = math.asin(tow_width_mm / (2.0 * steering_radius_mm))
        actual_shear_deg = math.degrees(actual_shear_rad)
        # Defects per meter scales with shear-angle excess
        excess_deg = actual_shear_deg - SHEAR_DEFECT_THRESHOLD_DEG
        defects_per_meter = max(0, excess_deg * 0.5)
    else:
        actual_shear_deg = math.degrees(math.asin(tow_width_mm / (2.0 * steering_radius_mm)))
        defects_per_meter = 0.0

    # Total defects in a square laminate of ~1 m^2
    # Assume one steered tow per 10 cm of laminate width
    n_tows_per_meter_width = 10
    tow_length_m = 1.0  # per square
    defect_count = defects_per_meter * tow_length_m * n_tows_per_meter_width * layer_count

    # Structural efficiency factor (vs quasi-isotropic baseline)
    # Optimised tow-steered laminates achieve 10-30% improvement
    if defects_per_meter == 0:
        # Perfect manufacturing
        if layer_count >= 8:
            structural_efficiency_factor = 1.25  # 25% improvement
        else:
            structural_efficiency_factor = 1.15
    elif defects_per_meter < 1:
        structural_efficiency_factor = 1.10
    elif defects_per_meter < 5:
        structural_efficiency_factor = 1.05
    else:
        structural_efficiency_factor = 0.95  # defective, worse than baseline

    # Mass savings (% vs equivalent strength quasi-isotropic)
    mass_savings_pct = (structural_efficiency_factor - 1.0) * 100.0
    mass_savings_pct = max(0.0, mass_savings_pct)

    # Layup time (RTS is faster than AFP for curved paths)
    # Typical AFP rate: 1-3 kg/hour; RTS: 2-5 kg/hour
    laminate_mass_per_m2_g = mat["density_g_cm3"] * 1000 * 0.25 * layer_count  # 0.25 mm per ply
    layup_rate_kg_hr = 3.0  # RTS typical
    layup_time_hours = (laminate_mass_per_m2_g / 1000.0) / layup_rate_kg_hr

    # Worked calculations — reviewer-verifiable arithmetic steps.
    # r_min_no_defect_mm uses sin (transcendental) → SKIPPED.
    # actual_shear_deg uses asin (transcendental) → SKIPPED.
    # defects_per_meter is branchy (if/else on radius vs threshold) → SKIPPED.
    # structural_efficiency_factor is piecewise → SKIPPED.
    lam_mass_r   = round(laminate_mass_per_m2_g, 0)
    layup_time_r = round(layup_time_hours, 2)

    worked = [
        worked_calc(
            label="Laminate areal mass",
            formula="lam_mass_g_m2 = density_g_cm3 x 1000 x 0.25 x layer_count",
            values={
                "density_g_cm3": (mat["density_g_cm3"], "g/cm3"),
                "layer_count":   (layer_count,          ""),
            },
            result=lam_mass_r, result_unit="g/m2",
            assumptions=["0.25 mm nominal ply thickness per layer (standard pre-preg)."],
        ),
        worked_calc(
            label="Layup time per square metre (RTS rate)",
            formula="layup_time = (lam_mass_g_m2 / 1000) / layup_rate_kg_hr",
            values={
                "lam_mass_g_m2":   (lam_mass_r, "g/m2"),
                "layup_rate_kg_hr": (3.0,        "kg/hr"),
            },
            result=layup_time_r, result_unit="hr/m2",
            assumptions=["RTS (Rapid Tow Shearing) rate 3 kg/hr (Kim, Potter & Weaver 2012)."],
        ),
    ]

    return {
        "tow_width_mm": tow_width_mm,
        "steering_radius_mm": steering_radius_mm,
        "layer_count": layer_count,
        "fibre_volume_fraction": Vf,
        "material": material,
        "tensile_strength_mpa": mat["tensile_mpa"],
        "min_steering_radius_no_defect_mm": round(r_min_no_defect_mm, 1),
        "actual_shear_angle_deg": round(actual_shear_deg, 2),
        "shear_threshold_deg": SHEAR_DEFECT_THRESHOLD_DEG,
        "defects_per_meter_per_tow": round(defects_per_meter, 2),
        "defect_count_per_m2_laminate": round(defect_count, 1),
        "structural_efficiency_factor": round(structural_efficiency_factor, 3),
        "mass_savings_vs_quasi_iso_pct": round(mass_savings_pct, 1),
        "layup_time_hours_per_m2": round(layup_time_hours, 2),
        "laminate_areal_mass_g_m2": round(laminate_mass_per_m2_g, 0),
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
