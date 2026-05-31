#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/orbital_thermal.py

SmallSat / CubeSat thermal balance: equilibrium temperatures in sunlight
and eclipse, radiator sizing.
Stdin JSON -> stdout JSON.

Input:
    {
      "surface_area_m2": 1.5,             # total external area
      "solar_absorptivity": 0.35,         # α — coating-dependent
      "ir_emissivity": 0.85,              # ε
      "internal_dissipation_w": 50.0,
      "orbital_altitude_km": 500.0,
      "eclipse_fraction_pct": 35.0,
      "sun_facing_area_m2": null,         # default = surface_area / 6
      "albedo_factor": 0.30,              # Earth albedo (0.25-0.35 LEO)
      "earth_ir_w_m2": 237.0              # outgoing longwave radiation
    }

Output:
    {
      "equilibrium_temp_c_sun": 35.0,
      "equilibrium_temp_c_eclipse": -25.0,
      "radiator_area_required_m2": 0.5,
      "solar_flux_w_m2": 1361.0,
      "albedo_flux_w_m2": 200.0,
      ...
    }

Method:
  Energy balance:  α × A_sun × q_sun + α × A_alb × q_alb +
                    ε × A_ir × q_ir + Q_internal = ε × σ × A × T^4

  - q_sun = 1361 W/m² solar constant (varies ±3% annual)
  - q_alb = α × q_sun × albedo_factor × view_factor (LEO ~ 0.25-0.30)
  - q_ir = 237 W/m² (Earth outgoing LWR, NASA CERES average)
  - Eclipse: only q_ir + internal dissipation remain
  - Radiator area: A_rad = (Q_internal + ext_loads) / (ε × σ × (T_set^4 - T_space^4))

Reference: Gilmore "Spacecraft Thermal Control Handbook" 2nd ed Vol 1
Ch 2, NASA SP-3051 "Spacecraft Radiative Transfer Analysis", IADC
Space Debris Mitigation Guidelines IADC-02-01 R2 2020.

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
    "tool_name": 'orbital_thermal (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Gilmore (2002), 'Spacecraft Thermal Control Handbook' Vol I, AIAA",
    "physics_basis": 'Steady-state heat balance: α × Q_solar + ε × Q_earth_IR + Q_internal = ε × σ × T⁴ × A. Eclipse uses Q_solar=0.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


SIGMA_SB = 5.670374e-8  # Stefan-Boltzmann W/(m²·K⁴)
T_SPACE_K = 4.0         # cosmic background (CMB ~ 2.7 K + IR ~ 4 K effective)
Q_SUN_W_M2 = 1361.0     # solar constant at 1 AU
T_RADIATOR_DESIGN_C = 20.0  # typical avionics setpoint


def compute(payload: dict) -> dict:
    A_total = float(payload.get("surface_area_m2", 1.0))
    alpha = float(payload.get("solar_absorptivity", 0.35))
    eps = float(payload.get("ir_emissivity", 0.85))
    Q_int = float(payload.get("internal_dissipation_w", 50.0))
    alt_km = float(payload.get("orbital_altitude_km", 500.0))
    eclipse_pct = float(payload.get("eclipse_fraction_pct", 35.0))
    A_sun = payload.get("sun_facing_area_m2")
    albedo = float(payload.get("albedo_factor", 0.30))
    earth_ir = float(payload.get("earth_ir_w_m2", 237.0))

    if A_sun is None:
        A_sun = A_total / 6.0  # cubesat single face
    A_sun = float(A_sun)

    # View factor to Earth at altitude
    r_earth_km = 6371.0
    h_ratio = (r_earth_km / max(1.0, r_earth_km + alt_km))
    view_factor_earth = 0.5 * (1.0 - math.sqrt(1.0 - h_ratio ** 2))

    # Earth-facing area (= sun-facing for cubesat assumption)
    A_earth = A_sun

    # Sunlit conditions:
    Q_solar = alpha * A_sun * Q_SUN_W_M2
    Q_albedo = alpha * A_earth * Q_SUN_W_M2 * albedo * view_factor_earth
    Q_earth_ir = eps * A_earth * earth_ir * view_factor_earth

    # Sum incoming on sunlit side
    Q_in_sun = Q_solar + Q_albedo + Q_earth_ir + Q_int

    # Equilibrium T^4 = Q_in / (ε × σ × A_total)
    T_sun_k_4 = Q_in_sun / max(1e-9, eps * SIGMA_SB * A_total)
    T_sun_k = T_sun_k_4 ** 0.25 if T_sun_k_4 > 0 else T_SPACE_K
    T_sun_c = T_sun_k - 273.15

    # Eclipse conditions:
    Q_in_ecl = Q_earth_ir + Q_int
    T_ecl_k_4 = Q_in_ecl / max(1e-9, eps * SIGMA_SB * A_total)
    T_ecl_k = T_ecl_k_4 ** 0.25 if T_ecl_k_4 > 0 else T_SPACE_K
    T_ecl_c = T_ecl_k - 273.15

    # Average temperature accounting for duty cycle
    f_ecl = eclipse_pct / 100.0
    T_avg_c = (1.0 - f_ecl) * T_sun_c + f_ecl * T_ecl_c

    # Radiator area needed to dissipate Q_int at T_design_C
    T_design_k = T_RADIATOR_DESIGN_C + 273.15
    q_rad_per_m2 = eps * SIGMA_SB * (T_design_k ** 4 - T_SPACE_K ** 4)
    A_rad_required = Q_int / max(1e-3, q_rad_per_m2)

    return {
        "equilibrium_temp_c_sun": round(T_sun_c, 2),
        "equilibrium_temp_c_eclipse": round(T_ecl_c, 2),
        "equilibrium_temp_c_avg": round(T_avg_c, 2),
        "radiator_area_required_m2": round(A_rad_required, 4),
        "solar_flux_w_m2": Q_SUN_W_M2,
        "albedo_flux_w_m2": round(Q_SUN_W_M2 * albedo * view_factor_earth, 2),
        "earth_ir_w_m2": earth_ir,
        "view_factor_earth": round(view_factor_earth, 4),
        "q_solar_w": round(Q_solar, 2),
        "q_albedo_w": round(Q_albedo, 2),
        "q_earth_ir_w": round(Q_earth_ir, 2),
        "q_internal_w": Q_int,
        "q_in_sun_total_w": round(Q_in_sun, 2),
        "q_in_eclipse_total_w": round(Q_in_ecl, 2),
        "altitude_km": alt_km,
        "surface_area_m2": A_total,
        "sun_facing_area_m2": A_sun,
        "solar_absorptivity": alpha,
        "ir_emissivity": eps,
        "alpha_over_epsilon": round(alpha / max(1e-3, eps), 4),
        "eclipse_fraction_pct": eclipse_pct,
        "radiator_setpoint_c": T_RADIATOR_DESIGN_C,
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
