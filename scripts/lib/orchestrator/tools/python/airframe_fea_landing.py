#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/airframe_fea_landing.py

Drone airframe LANDING-LOAD analysis — CLOSED-FORM ENERGY METHOD (FEA-ready seam).

HONEST NAMING (engineering-credibility WAVE 1, 2026-07-03): this tool computes a
closed-form energy-method analysis (KE balance → peak force → axial stress → yield
check → idealised cantilever deflection). It performs NO finite-element analysis —
scikit-fem is not installed and no mesh is ever built. The historical name claimed
"FEA"; every surface string now states the real method. The FILE NAME + tool id
(`airframe-fea:landing`) are kept for registry compatibility only — they are
identifiers, not method claims; the "FEA-ready seam" phrasing marks where a real
finite-element implementation would slot in (non-axial loading, detailed deflection).

Landing impact analysis:
1. Kinetic energy at touchdown: KE = 0.5 × m × v²
2. Energy must be absorbed by landing gear deformation + structure
3. Peak deceleration g = v² / (2 × stroke)
4. Peak stress = F/A; F = m × g_peak

Landing gear stroke (typical):
- Rigid (fixed legs): 5-10 mm (only material flex)
- Sprung (spring damped): 30-50 mm
- Soft (foam/elastomer): 50-100 mm

Material yield (typical UAV materials):
- 6061-T6 aluminium: σ_y = 276 MPa, E = 68.9 GPa
- 2024-T3 aluminium: σ_y = 345 MPa, E = 73.1 GPa
- CFRP unidirectional: σ_tensile = 600-1200 MPa, E = 130 GPa
- ABS plastic: σ_y = 35 MPa, E = 2.0 GPa
- Glass-filled nylon: σ_y = 90 MPa, E = 8 GPa

References:
- Niu, "Composite Airframe Structures: Practical Design Information and
  Data", Conmilit Press 1992
- FAA Part 23 Subpart C (Structural Loads)
- FAR 25.473 Landing Load Conditions
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    # Honest method naming: closed-form energy method, NOT finite-element analysis.
    "tool_name": 'landing-load closed-form energy method (FEA-ready seam)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Roark's Formulas for Stress and Strain (8th ed.); JAR-VLA 14 CFR Part 23 (Crashworthiness)",
    "physics_basis": 'Energy balance: 0.5 × m × v² = 0.5 × k × x². Peak load factor n = v / sqrt(g × h_stroke). Material yield check vs computed stress.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Material properties (yield in MPa, E in GPa)
MATERIALS: dict[str, dict] = {
    "aluminium_6061_t6":  {"sy_mpa": 276, "E_gpa": 68.9, "density_kg_m3": 2700},
    "aluminium_2024_t3":  {"sy_mpa": 345, "E_gpa": 73.1, "density_kg_m3": 2780},
    "aluminium_7075_t6":  {"sy_mpa": 503, "E_gpa": 71.7, "density_kg_m3": 2810},
    "cfrp_ud":            {"sy_mpa": 900, "E_gpa": 130, "density_kg_m3": 1600},
    "cfrp_woven":         {"sy_mpa": 550, "E_gpa": 70,  "density_kg_m3": 1550},
    "titanium_grade5":    {"sy_mpa": 880, "E_gpa": 113, "density_kg_m3": 4430},
    "abs_plastic":        {"sy_mpa": 35,  "E_gpa": 2.0, "density_kg_m3": 1050},
    "nylon_30gf":         {"sy_mpa": 90,  "E_gpa": 8.0, "density_kg_m3": 1340},
    "petg":               {"sy_mpa": 52,  "E_gpa": 2.1, "density_kg_m3": 1270},
    "tpu":                {"sy_mpa": 25,  "E_gpa": 0.05,"density_kg_m3": 1200},
    "steel_a36":          {"sy_mpa": 250, "E_gpa": 200, "density_kg_m3": 7850},
}

LANDING_GEAR_STROKE = {
    "rigid": 0.005,        # 5 mm
    "sprung": 0.040,        # 40 mm
    "soft": 0.080,          # 80 mm
    "shock_absorber": 0.150, # 150 mm hydraulic
}


def compute(payload: dict) -> dict:
    mass_kg = float(payload.get("drone_mass_kg", 5.0))
    v_descent = float(payload.get("descent_velocity_ms", 3.0))
    gear_type = safe_choice(str(payload.get("landing_gear", "sprung")).lower(), LANDING_GEAR_STROKE, default="sprung", label="landing_gear")
    material = safe_choice(str(payload.get("frame_material", "cfrp_woven")).lower(), MATERIALS, default="cfrp_woven", label="frame_material")
    frame_csa_mm2 = float(payload.get("frame_csa_mm2", 50))   # cross-section area
    arm_length_m = float(payload.get("arm_length_m", 0.3))    # for cantilever deflection

    if material not in MATERIALS:
        return {"error": f"Unknown material '{material}'. Available: {list(MATERIALS.keys())}"}
    if gear_type not in LANDING_GEAR_STROKE:
        return {"error": f"Unknown landing_gear. Use {list(LANDING_GEAR_STROKE.keys())}"}

    mat = MATERIALS[material]
    stroke_m = LANDING_GEAR_STROKE[gear_type]

    # Kinetic energy
    ke_j = 0.5 * mass_kg * v_descent ** 2

    # Peak deceleration (energy / stroke)
    # KE = F × stroke → F = KE / stroke
    f_peak_n = ke_j / max(0.001, stroke_m)
    g_peak = f_peak_n / (mass_kg * 9.81)

    # Stress in frame member
    sigma_peak_pa = f_peak_n / (frame_csa_mm2 * 1e-6)
    sigma_peak_mpa = sigma_peak_pa / 1e6

    # Safety factor
    sy_mpa = mat["sy_mpa"]
    safety_factor = sy_mpa / max(1, sigma_peak_mpa)

    # Cantilever deflection at end of arm (idealised)
    # δ = F × L³ / (3 × E × I)
    # I for rectangular cross-section ~ b × h³ / 12; approximate
    # Use circular tube approximation: I = π × r⁴ / 4
    # Convert CSA to tube assuming wall = 1mm
    csa_m2 = frame_csa_mm2 * 1e-6
    # Solid rod approximation: r = sqrt(CSA / π)
    radius_m = math.sqrt(csa_m2 / math.pi)
    I_m4 = math.pi * radius_m ** 4 / 4
    E_pa = mat["E_gpa"] * 1e9
    deflection_m = (f_peak_n * arm_length_m ** 3) / (3 * E_pa * max(1e-12, I_m4))
    deflection_mm = deflection_m * 1000

    # Check yield
    yields = sigma_peak_mpa > sy_mpa
    pass_factor_15 = safety_factor >= 1.5

    # Required ultimate stroke for SF of 2 (per FAR 23.473)
    required_stroke_sf2 = ke_j / (mass_kg * 9.81 * (sy_mpa * 1e6 * csa_m2 / mass_kg / 9.81 / 2)) if csa_m2 > 0 else stroke_m

    # Worked calculations — pure arithmetic steps only.
    # radius_m, I_m4, and deflection_m involve sqrt then ^4 / division;
    # radius is skipped (sqrt), but I_m4 and deflection are passed as live
    # inputs to avoid transcendental display.
    ke_r = round(ke_j, 1)
    fpeak_r = round(f_peak_n, 0)
    gpeak_r = round(g_peak, 1)
    # Derive sig_r from fpeak_r so that F_peak / (frame_csa_mm2 x 1e-6) / 1e6
    # evaluates to sig_r in the substitution.
    sig_r = round(fpeak_r / (frame_csa_mm2 * 1e-6) / 1e6, 1)
    worked = [
        worked_calc(
            label="Kinetic energy at touchdown",
            formula="KE = 0.5 x m x v^2",
            values={
                "m": (mass_kg, "kg"),
                "v": (v_descent, "m/s"),
            },
            result=ke_r, result_unit="J",
            assumptions=[
                "all kinetic energy must be absorbed by landing gear stroke",
                "method: closed-form energy balance (hand-calculation), not a "
                "finite-element analysis — a mesh-based check is the seam for "
                "detailed design",
            ],
        ),
        worked_calc(
            label="Peak impact force",
            formula="F_peak = KE / stroke",
            values={
                "KE": (ke_r, "J"),
                "stroke": (stroke_m, "m"),
            },
            result=fpeak_r, result_unit="N",
            assumptions=[
                "linear energy absorption assumed (F constant over stroke)",
                f"landing gear type: {gear_type} — stroke from standard table",
            ],
        ),
        worked_calc(
            label="Peak deceleration",
            formula="g_peak = F_peak / (m x 9.81)",
            values={
                "F_peak": (fpeak_r, "N"),
                "m": (mass_kg, "kg"),
            },
            result=gpeak_r, result_unit="g",
            assumptions=["9.81 m/s^2 gravitational acceleration"],
        ),
        worked_calc(
            label="Peak stress in frame member",
            formula="sigma = F_peak / (frame_csa_mm2 x 1e-6) / 1e6",
            values={
                "F_peak": (fpeak_r, "N"),
                "frame_csa_mm2": (frame_csa_mm2, "mm^2"),
            },
            result=sig_r, result_unit="MPa",
            assumptions=["uniform axial stress over cross-section; 1 mm^2 = 1e-6 m^2; / 1e6 converts Pa to MPa"],
        ),
    ]

    return {
        "drone_mass_kg": mass_kg,
        "descent_velocity_ms": v_descent,
        "kinetic_energy_j": round(ke_j, 1),
        "landing_gear": gear_type,
        "stroke_m": stroke_m,
        "peak_force_n": round(f_peak_n, 0),
        "peak_g": round(g_peak, 1),
        "frame_material": material,
        "frame_csa_mm2": frame_csa_mm2,
        "peak_stress_mpa": round(sigma_peak_mpa, 1),
        "material_yield_mpa": sy_mpa,
        "safety_factor": round(safety_factor, 2),
        "material_yields_under_load": yields,
        "passes_sf_1_5": pass_factor_15,
        "max_deflection_mm": round(deflection_mm, 2),
        "max_deflection_m": round(deflection_m, 5),
        "arm_length_m": arm_length_m,
        "elastic_modulus_gpa": mat["E_gpa"],
        "frame_mass_per_m_kg": round(mat["density_kg_m3"] * csa_m2, 4),
        "notes": (
            "Closed-form energy-method landing impact analysis (no finite-element "
            "model is built). Peak g = KE / (stroke × mg). "
            "Per FAR 23.473 / 25.473: ultimate load = 1.5 × limit. "
            "Add ground reaction multiplier × 1.5 for hard surface. "
            "FEA-ready seam: a mesh-based solver (e.g. scikit-fem) would slot in here "
            "for non-axial loading or detailed deflection at detailed design."
        ),
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
