#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/microgravity_fibre_optic.py

Microgravity optical fibre drawing — ZBLAN, silica, chalcogenide.
Models attenuation, tensile strength and yield for fibre drawn in space.

Companies served: Space Forge (UK), ZBLAN.IO, FOMS Inc (US/EU partners),
NASA / ESA ZBLAN payload integrators.

Input:
    {
      "preform_material": "ZBLAN" | "silica" | "AsSe_chalcogenide" | "germanium_silica" | "fluoride",
      "draw_speed_m_s": 0.01,
      "target_diameter_um": 125.0,
      "preform_diameter_mm": 20.0,
      "furnace_temperature_c": 350.0,
      "atmosphere": "argon" | "vacuum" | "N2"
    }

Output:
    attenuation_db_per_km, tensile_strength_mpa, yield_pct,
    draw_length_per_hour_km, _provenance.

Physics:
  Mass conservation: A_preform * V_preform = A_fibre * V_fibre
  → V_fibre / V_preform = (D_preform / D_fibre)^2
  ZBLAN crystallization happens on cooling; microgravity slows kinetics
  via convection elimination → 100x yield improvement (Tucker 1997)

References:
- Tucker, D.S., Workman, G.L., Smith, G.A., O'Brien, S.M., "Effects of
  gravity on processing heavy metal fluoride fibers", J. Mat. Res. 12(9):
  2223-2225, 1997.
- Park, S.J., Bishop, S.G., "Spectroscopic properties of ZBLAN glasses",
  J. Non-Crystalline Solids 240:215-220, 1998.
- France, P.W., "Fluoride Glass Optical Fibres", Springer 1990.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "microgravity_fibre_optic (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Tucker et al. (1997) J. Mat. Res. 12(9):2223 "
        "DOI:10.1557/JMR.1997.0298; "
        "Park & Bishop (1998) J. Non-Cryst. Solids 240:215; "
        "France (1990) 'Fluoride Glass Optical Fibres' Springer."
    ),
    "physics_basis": (
        "Mass conservation in fibre drawing: A_preform * V = A_fibre * v. "
        "ZBLAN crystallization eliminated in microgravity → 100x yield "
        "improvement. Theoretical Rayleigh-scattering limit at 0.05 dB/km "
        "for fluoride glass."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "MATERIAL_ATTENUATIONS": {
            "source": "France 1990 + Yamane 2000 'Glass Science' Springer; "
                      "ZBLAN min ~0.01-0.1 dB/km theoretical, ~1-5 dB/km practical 1G",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


MATERIALS = {
    "ZBLAN":            {"viscosity_drawpt_pas": 1e4, "draw_temp_c": 350,
                         "atten_1G_db_km": 5.0, "atten_ug_db_km": 0.05,
                         "tensile_mpa": 1000.0, "yield_1G_pct": 5.0},
    "silica":           {"viscosity_drawpt_pas": 1e6, "draw_temp_c": 2000,
                         "atten_1G_db_km": 0.18, "atten_ug_db_km": 0.18,
                         "tensile_mpa": 5500.0, "yield_1G_pct": 95.0},
    "AsSe_chalcogenide": {"viscosity_drawpt_pas": 1e5, "draw_temp_c": 250,
                          "atten_1G_db_km": 1.0, "atten_ug_db_km": 0.1,
                          "tensile_mpa": 200.0, "yield_1G_pct": 60.0},
    "germanium_silica": {"viscosity_drawpt_pas": 1e6, "draw_temp_c": 1900,
                         "atten_1G_db_km": 0.25, "atten_ug_db_km": 0.20,
                         "tensile_mpa": 5000.0, "yield_1G_pct": 90.0},
    "fluoride":         {"viscosity_drawpt_pas": 1e4, "draw_temp_c": 400,
                         "atten_1G_db_km": 8.0, "atten_ug_db_km": 0.1,
                         "tensile_mpa": 800.0, "yield_1G_pct": 5.0},
    "Tellurite":        {"viscosity_drawpt_pas": 1e5, "draw_temp_c": 380,
                         "atten_1G_db_km": 2.0, "atten_ug_db_km": 0.3,
                         "tensile_mpa": 500.0, "yield_1G_pct": 30.0},
}


def compute(payload: dict) -> dict:
    material = str(payload.get("preform_material", "ZBLAN"))
    draw_speed_m_s = float(payload.get("draw_speed_m_s", 0.01))
    target_diameter_um = float(payload.get("target_diameter_um", 125.0))
    preform_diameter_mm = float(payload.get("preform_diameter_mm", 20.0))
    furnace_c = float(payload.get("furnace_temperature_c",
                                   MATERIALS.get(material, MATERIALS["ZBLAN"])["draw_temp_c"]))
    atmosphere = str(payload.get("atmosphere", "argon"))
    g_level = float(payload.get("g_level", 1e-5))

    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    m = MATERIALS[material]

    # Mass conservation
    preform_um = preform_diameter_mm * 1000.0
    draw_ratio = (preform_um / target_diameter_um) ** 2
    preform_feed_rate_m_s = draw_speed_m_s / draw_ratio

    # Microgravity factor
    if g_level < 1e-3:
        # Choose microgravity attenuation
        attenuation_db_km = m["atten_ug_db_km"]
        ug_yield_multiplier = 20.0  # 20x improvement typical for ZBLAN
    elif g_level < 0.1:
        attenuation_db_km = (m["atten_1G_db_km"] + m["atten_ug_db_km"]) / 2.0
        ug_yield_multiplier = 5.0
    else:
        attenuation_db_km = m["atten_1G_db_km"]
        ug_yield_multiplier = 1.0

    # Yield
    base_yield = m["yield_1G_pct"]
    yield_pct = min(99.5, base_yield * ug_yield_multiplier)

    # Tensile strength (microgravity-cast fibres benefit slightly)
    tensile_mpa = m["tensile_mpa"] * (1.0 + (1.0 if g_level < 1e-3 else 0.0) * 0.2)

    # Length produced per hour
    draw_length_km_hr = draw_speed_m_s * 3600.0 / 1000.0

    # Diameter tolerance
    # Typical: 0.1% at preform stability ~ 0.1 um for 125 um fibre
    diameter_tolerance_um = 0.5  # ±0.5 um for SMF-28-class fibre
    if material == "ZBLAN" or material == "fluoride":
        diameter_tolerance_um = 2.0  # less mature

    return {
        "preform_material": material,
        "draw_speed_m_s": draw_speed_m_s,
        "target_diameter_um": target_diameter_um,
        "preform_diameter_mm": preform_diameter_mm,
        "draw_ratio": round(draw_ratio, 1),
        "preform_feed_rate_mm_per_min": round(preform_feed_rate_m_s * 60 * 1000.0, 4),
        "furnace_temperature_c": furnace_c,
        "atmosphere": atmosphere,
        "g_level": g_level,
        "attenuation_db_per_km": round(attenuation_db_km, 4),
        "attenuation_1G_db_km": m["atten_1G_db_km"],
        "improvement_factor_vs_1G": round(m["atten_1G_db_km"] / max(attenuation_db_km, 0.001), 1),
        "tensile_strength_mpa": round(tensile_mpa, 1),
        "yield_pct": round(yield_pct, 1),
        "draw_length_per_hour_km": round(draw_length_km_hr, 4),
        "diameter_tolerance_um": diameter_tolerance_um,
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
