#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/solar_sail.py

Solar-sail propulsion — photon-pressure thrust, characteristic acceleration,
delta-V per year.

Companies served: Gama (FR), Solar Sail technology demonstrators.

Input:
    {
      "sail_area_m2": 73.0,
      "sail_density_g_m2": 5.0,
      "distance_from_sun_au": 1.0,
      "sail_reflectivity": 0.85,
      "spacecraft_mass_kg": 100.0
    }

Output:
    thrust_n, characteristic_acceleration_mm_s2, delta_v_per_year_ms,
    sail_mass_kg, total_mass_kg, _provenance.

Physics:
  Solar radiation pressure: P_sr = 2 * S * R / c   (perfect reflection)
                          = (1 + rho) * S / c   (specular fraction)
  At 1 AU: S = 1361 W/m^2, so P_sr_max = 9.08 μPa
  Inverse-square: S(r) = 1361 * (1 AU / r)^2

References:
- McInnes, C.R., "Solar Sailing: Technology, Dynamics and Mission Applications",
  Springer 1999.
- Macdonald, M., McInnes, C.R., "Solar sail science mission applications and
  advancement", Adv. Space Res. 48(11):1702-1716, 2011.
- IKAROS mission (JAXA 2010-2013), JAXA Tsuda et al., Acta Astronautica 82:
  183-188, 2013.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "solar_sail (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "McInnes (1999) 'Solar Sailing: Technology, Dynamics and Mission "
        "Applications' Springer; "
        "Macdonald & McInnes (2011) Adv. Space Res. 48(11):1702 "
        "DOI:10.1016/j.asr.2011.03.018; "
        "Tsuda et al. (2013) Acta Astronautica 82:183 (IKAROS)."
    ),
    "physics_basis": (
        "Solar radiation pressure P_sr = (1 + reflectivity) * S / c, "
        "where S = solar constant scaled by inverse-square distance. "
        "Characteristic acceleration ac = (1 + R) * S * A / (m * c)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "SOLAR_CONSTANT_W_M2": {
            "source": "Kopp & Lean 2011 (Geophys. Res. Lett. 38:L01706); S = 1360.8 W/m^2 at 1 AU",
            "confidence": "library",
        },
        "AU_M": {
            "source": "IAU 2015 Resolution B2: 1 AU = 1.49597870700e11 m",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


SOLAR_CONSTANT_W_M2 = 1360.8
AU_M = 1.49597870700e11
C_LIGHT = 2.998e8


def compute(payload: dict) -> dict:
    sail_area_m2 = float(payload.get("sail_area_m2", 73.0))
    sail_density_g_m2 = float(payload.get("sail_density_g_m2", 5.0))
    distance_au = float(payload.get("distance_from_sun_au", 1.0))
    reflectivity = float(payload.get("sail_reflectivity", 0.85))
    spacecraft_mass_kg = float(payload.get("spacecraft_mass_kg", 100.0))

    if sail_area_m2 <= 0:
        raise ValueError("sail_area_m2 must be positive")
    if distance_au <= 0:
        raise ValueError("distance_from_sun_au must be positive")

    # Solar flux at distance
    S = SOLAR_CONSTANT_W_M2 / (distance_au ** 2)

    # Sail mass
    sail_mass_kg = sail_area_m2 * sail_density_g_m2 / 1000.0
    total_mass_kg = sail_mass_kg + spacecraft_mass_kg

    # Thrust (perfect sail at normal incidence)
    # F = (1 + rho) * S * A / c
    thrust_n = (1.0 + reflectivity) * S * sail_area_m2 / C_LIGHT

    # Acceleration
    accel_m_s2 = thrust_n / total_mass_kg
    accel_mm_s2 = accel_m_s2 * 1000.0

    # Characteristic acceleration (at 1 AU)
    char_accel_m_s2 = (1.0 + reflectivity) * SOLAR_CONSTANT_W_M2 * sail_area_m2 / (total_mass_kg * C_LIGHT)
    char_accel_mm_s2 = char_accel_m_s2 * 1000.0

    # Delta-V per year (continuous acceleration over 1 year)
    seconds_per_year = 365.25 * 86400.0
    delta_v_per_year_ms = accel_m_s2 * seconds_per_year

    # Sail loading (g/m^2)
    sail_loading_g_m2 = (total_mass_kg * 1000.0) / sail_area_m2

    # Lightness number — ratio of solar radiation to solar gravity
    # beta = (2 R + alpha) S / c / (G M_sun / r^2) / area_loading
    # Simplification: at 1 AU, beta_1 = ~1.53 mm/s^2 per g/m^2 sail loading
    # beta = char_accel / g_sun_at_1AU
    g_sun_at_1au = 5.93e-3  # m/s^2
    lightness_number_beta = char_accel_m_s2 / g_sun_at_1au

    # Cone half-angle (force angle vs sail normal) — for ideal sail = 35.26°
    # (max efficient propulsion angle for orbit-raising)
    optimal_cone_angle_deg = 35.26

    return {
        "sail_area_m2": sail_area_m2,
        "sail_density_g_m2": sail_density_g_m2,
        "distance_from_sun_au": distance_au,
        "sail_reflectivity": reflectivity,
        "spacecraft_mass_kg": spacecraft_mass_kg,
        "sail_mass_kg": round(sail_mass_kg, 3),
        "total_mass_kg": round(total_mass_kg, 2),
        "sail_loading_g_m2": round(sail_loading_g_m2, 1),
        "solar_flux_w_m2_at_distance": round(S, 2),
        "thrust_n": round(thrust_n, 6),
        "thrust_mn": round(thrust_n * 1000.0, 3),
        "acceleration_m_s2": accel_m_s2,
        "acceleration_mm_s2": round(accel_mm_s2, 4),
        "characteristic_acceleration_mm_s2": round(char_accel_mm_s2, 4),
        "delta_v_per_year_ms": round(delta_v_per_year_ms, 1),
        "lightness_number_beta": round(lightness_number_beta, 5),
        "optimal_cone_angle_deg": optimal_cone_angle_deg,
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
