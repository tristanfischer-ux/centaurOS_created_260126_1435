#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/digital_metal_forming.py

Digital metal forming (in-orbit additive manufacturing or hot-isostatic
pressing). Models build time, energy and dimensional tolerance for a
metallic part produced on orbit.

Companies served: Forg3D (UK), Made In Space (US/EU presence), Aspect3D,
3D Systems Aerospace.

Input:
    {
      "feedstock_material": "Ti_6Al_4V" | "AlSi10Mg" | "Inconel718" | "SS316L",
      "part_volume_cm3": 100.0,
      "target_strength_mpa": 900.0,
      "layer_thickness_um": 30.0,
      "laser_power_w": 400.0,
      "process": "LPBF" | "EBM" | "DED" | "binder_jet"
    }

Output:
    build_time_hours, energy_kwh, dimensional_tolerance_um,
    surface_roughness_um, mass_kg, _provenance.

Physics:
  Build time: t = V / (h * s * v) where h=layer, s=hatch, v=scan_speed
  Energy: E = P_laser * t / efficiency
  Densification (LPBF): rho_relative = 1 - exp(-E_density / E_critical)

References:
- Yap, C.Y. et al., "Review of selective laser melting", Applied Physics
  Reviews 2:041101, 2015. DOI: 10.1063/1.4935926
- DebRoy, T. et al., "Additive manufacturing of metallic components",
  Progress in Materials Science 92:112-224, 2018.
- ISO/ASTM 52900:2021 "Additive manufacturing — General principles".
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
    "tool_name": "digital_metal_forming (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Yap et al. (2015) Applied Phys. Rev. 2:041101 DOI:10.1063/1.4935926; "
        "DebRoy et al. (2018) Progress Mat. Sci. 92:112 DOI:10.1016/j.pmatsci.2017.10.001; "
        "ISO/ASTM 52900:2021."
    ),
    "physics_basis": (
        "LPBF/EBM scan-speed × hatch × layer-height = build rate. Densification "
        "from melt-pool overlap (Yap 2015). Energy density E_d = P/(v*h*t) "
        "drives microstructure + porosity."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "MATERIAL_PROPERTIES": {
            "source": "ASM Handbook Vol.23 — Additive Manufacturing Processes (2020); EOS / Renishaw / SLM Solutions material datasheets",
            "confidence": "datasheet",
        },
        "PROCESS_BUILD_RATES": {
            "source": "Wohlers Report 2024 — industry typical build rates by process",
            "confidence": "industry_typical",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Material properties
# - density (g/cm^3)
# - critical energy density (J/mm^3) for full densification
# - yield_mpa (after HIP)
# - melting_point_c
MATERIALS = {
    "Ti_6Al_4V":   {"density_g_cm3": 4.43, "E_crit_J_mm3": 55.0, "yield_mpa": 950.0,
                    "uts_mpa": 1050.0, "melting_c": 1660, "thermal_cond_w_mk": 7.0},
    "AlSi10Mg":    {"density_g_cm3": 2.67, "E_crit_J_mm3": 35.0, "yield_mpa": 250.0,
                    "uts_mpa": 360.0, "melting_c": 660, "thermal_cond_w_mk": 130.0},
    "Inconel718":  {"density_g_cm3": 8.19, "E_crit_J_mm3": 75.0, "yield_mpa": 1100.0,
                    "uts_mpa": 1350.0, "melting_c": 1300, "thermal_cond_w_mk": 12.0},
    "SS316L":      {"density_g_cm3": 7.96, "E_crit_J_mm3": 50.0, "yield_mpa": 520.0,
                    "uts_mpa": 670.0, "melting_c": 1380, "thermal_cond_w_mk": 16.0},
    "AlMgSc":      {"density_g_cm3": 2.65, "E_crit_J_mm3": 40.0, "yield_mpa": 460.0,
                    "uts_mpa": 530.0, "melting_c": 645, "thermal_cond_w_mk": 100.0},
    "Cu_OFHC":     {"density_g_cm3": 8.94, "E_crit_J_mm3": 200.0, "yield_mpa": 110.0,
                    "uts_mpa": 220.0, "melting_c": 1085, "thermal_cond_w_mk": 400.0},
}

# Process build rates (cm^3 / hour) — Wohlers Report typical
PROCESS_RATES = {
    "LPBF":      {"rate_cm3_hr": 30.0, "tolerance_um": 50, "roughness_um": 8.0, "efficiency": 0.25},
    "EBM":       {"rate_cm3_hr": 60.0, "tolerance_um": 200, "roughness_um": 25.0, "efficiency": 0.40},
    "DED":       {"rate_cm3_hr": 600.0, "tolerance_um": 500, "roughness_um": 50.0, "efficiency": 0.35},
    "binder_jet": {"rate_cm3_hr": 200.0, "tolerance_um": 100, "roughness_um": 15.0, "efficiency": 0.80},
    "WAAM":      {"rate_cm3_hr": 1500.0, "tolerance_um": 1000, "roughness_um": 100.0, "efficiency": 0.85},
}


def compute(payload: dict) -> dict:
    material = str(payload.get("feedstock_material", "Ti_6Al_4V"))
    volume_cm3 = float(payload.get("part_volume_cm3", 100.0))
    target_strength = float(payload.get("target_strength_mpa", 900.0))
    layer_um = float(payload.get("layer_thickness_um", 30.0))
    laser_w = float(payload.get("laser_power_w", 400.0))
    process = str(payload.get("process", "LPBF"))

    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    if process not in PROCESS_RATES:
        process = "LPBF"

    mat = MATERIALS[material]
    proc = PROCESS_RATES[process]

    # Build time
    build_rate_cm3_hr = proc["rate_cm3_hr"]
    # Adjust for material (more refractory materials are slower)
    material_factor = 50.0 / max(mat["E_crit_J_mm3"], 5.0)
    effective_rate = build_rate_cm3_hr * material_factor
    build_time_hours = volume_cm3 / effective_rate

    # Energy
    # E = P_laser × build_time / efficiency
    energy_kwh = laser_w * build_time_hours / 1000.0 / proc["efficiency"]
    # For EBM, add heating + beam manipulation overhead
    energy_kwh *= 1.2

    # Dimensional tolerance
    tolerance_um = proc["tolerance_um"]
    # Scale with material thermal conductivity (high-conductivity = more distortion)
    tolerance_um *= (1.0 + 0.001 * mat["thermal_cond_w_mk"])

    # Surface roughness
    roughness_um = proc["roughness_um"]
    # Layer thickness affects roughness
    roughness_um *= (layer_um / 30.0) ** 0.5

    # Density / strength
    # Yield strength achievable = mat["yield_mpa"] * relative_density
    # Energy density: E_d = P / (v * h * t)
    # Assume scan speed 1000 mm/s, hatch 0.12 mm (typical Ti-6Al-4V)
    scan_speed_mm_s = 1000.0
    hatch_mm = 0.12
    layer_mm = layer_um / 1000.0
    e_density_j_mm3 = laser_w / (scan_speed_mm_s * hatch_mm * layer_mm)
    rho_rel = 1.0 - math.exp(-e_density_j_mm3 / mat["E_crit_J_mm3"])
    rho_rel = max(0.0, min(1.0, rho_rel))
    yield_mpa_achievable = mat["yield_mpa"] * rho_rel

    # Mass
    mass_kg = volume_cm3 * mat["density_g_cm3"] / 1000.0

    # Spec compliance
    spec_met = yield_mpa_achievable >= target_strength

    # Worked calculations for the PDF appendix.
    # material_factor and effective_rate are clean arithmetic steps.
    # rho_rel = 1 - exp(-e_density/E_crit) is transcendental so is passed as a live input
    # symbol to the yield step below.
    mat_factor_r = round(material_factor, 4)
    eff_rate_r = round(effective_rate, 1)
    # Use 4dp for build_time in the energy substitution so that
    # laser_w x build_time_4dp / 1000 / efficiency x 1.2 reproduces energy_kwh_r.
    # 2dp (e.g. 3.67) introduces enough error that the sub rounds to 7.05 instead of 7.04.
    build_time_r = round(build_time_hours, 2)
    build_time_4dp = round(build_time_hours, 4)
    layer_mm_r = round(layer_mm, 6)
    e_dens_r = round(e_density_j_mm3, 1)
    # Derive energy_kwh_r from the 4dp build_time so the substitution is self-consistent.
    energy_kwh_r = round(laser_w * build_time_4dp / 1000.0 / proc["efficiency"] * 1.2, 2)
    mass_kg_r = round(mass_kg, 3)
    rho_rel_r = round(rho_rel, 4)
    worked = [
        worked_calc(
            label="Material speed factor (refractory penalty)",
            formula="mat_factor = 50 / E_crit",
            values={"E_crit": (mat["E_crit_J_mm3"], "J/mm^3")},
            result=mat_factor_r,
            result_unit="",
            assumptions=["reference E_crit = 50 J/mm^3 (Ti-6Al-4V baseline)"],
        ),
        worked_calc(
            label="Effective build rate",
            formula="eff_rate = build_rate x mat_factor",
            values={
                "build_rate": (build_rate_cm3_hr, "cm^3/hr"),
                "mat_factor": (mat_factor_r, ""),
            },
            result=eff_rate_r,
            result_unit="cm^3/hr",
            assumptions=["Wohlers Report 2024 process nominal rates"],
        ),
        worked_calc(
            label="Build time",
            formula="build_time = volume / eff_rate",
            values={"volume": (volume_cm3, "cm^3"), "eff_rate": (eff_rate_r, "cm^3/hr")},
            result=build_time_r,
            result_unit="hr",
        ),
        worked_calc(
            label="Energy density",
            formula="E_density = laser_w / (scan_speed x hatch x layer_mm)",
            values={
                "laser_w": (laser_w, "W"),
                "scan_speed": (scan_speed_mm_s, "mm/s"),
                "hatch": (hatch_mm, "mm"),
                "layer_mm": (layer_mm_r, "mm"),
            },
            result=e_dens_r,
            result_unit="J/mm^3",
            assumptions=["scan_speed 1000 mm/s, hatch 0.12 mm (typical Ti-6Al-4V)"],
        ),
        worked_calc(
            label="Energy consumption",
            formula="energy_kwh = laser_w x build_time / 1000 / efficiency x 1.2",
            values={
                "laser_w": (laser_w, "W"),
                "build_time": (build_time_4dp, "hr"),
                "efficiency": (proc["efficiency"], ""),
            },
            result=energy_kwh_r,
            result_unit="kWh",
            assumptions=["1.2 overhead factor for beam manipulation and heating"],
        ),
        worked_calc(
            label="Part mass",
            formula="mass_kg = volume_cm3 x density / 1000",
            values={
                "volume_cm3": (volume_cm3, "cm^3"),
                "density": (mat["density_g_cm3"], "g/cm^3"),
            },
            result=mass_kg_r,
            result_unit="kg",
        ),
        worked_calc(
            label="Achievable yield strength",
            formula="yield_mpa = mat_yield x rho_rel",
            values={
                "mat_yield": (mat["yield_mpa"], "MPa"),
                "rho_rel": (rho_rel_r, ""),
            },
            result=round(yield_mpa_achievable, 1),
            result_unit="MPa",
            assumptions=["rho_rel from 1-exp(-E_density/E_crit) (Yap 2015); transcendental step not shown"],
        ),
    ]

    return {
        "feedstock_material": material,
        "process": process,
        "part_volume_cm3": volume_cm3,
        "target_strength_mpa": target_strength,
        "layer_thickness_um": layer_um,
        "laser_power_w": laser_w,
        "build_rate_cm3_hr": round(effective_rate, 1),
        "build_time_hours": round(build_time_hours, 2),
        "energy_kwh": round(energy_kwh, 2),
        "energy_density_J_mm3": round(e_density_j_mm3, 1),
        "relative_density": round(rho_rel, 4),
        "yield_mpa_achievable": round(yield_mpa_achievable, 1),
        "uts_mpa_after_HIP": mat["uts_mpa"],
        "dimensional_tolerance_um": round(tolerance_um, 0),
        "surface_roughness_um": round(roughness_um, 1),
        "mass_kg": round(mass_kg, 3),
        "spec_strength_met": spec_met,
        "material_density_g_cm3": mat["density_g_cm3"],
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
