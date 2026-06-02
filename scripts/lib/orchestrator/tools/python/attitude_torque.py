#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/attitude_torque.py

SmallSat / CubeSat disturbance torques: gravity gradient, aerodynamic
drag, solar radiation pressure. Sizes reaction wheel angular momentum.
Stdin JSON -> stdout JSON.

Input:
    {
      "inertia_tensor_kgm2": [0.01, 0.01, 0.005],   # [Ixx, Iyy, Izz] CubeSat
      "altitude_km": 400.0,
      "area_facing_sun_m2": 0.02,
      "area_facing_velocity_m2": 0.01,
      "cg_offset_m": 0.02,                            # offset of CG from CP
      "orbital_period_s": null,                       # auto-compute if null
      "solar_reflectivity": 0.6
    }

Output:
    {
      "gravity_gradient_torque_nm": 5.5e-8,
      "aero_torque_nm": 1.2e-6,
      "solar_torque_nm": 2.8e-9,
      "total_disturbance_nm": 1.27e-6,
      "actuator_required_nms": 1.1e-2,
      ...
    }

Method:
  Gravity gradient (Wertz "Spacecraft Attitude Determination & Control"
  eq 17-49): T_gg = (3μ/r³) × |I_z - I_y| × sin(2θ)
    For max disturbance: θ = 45°, sin(2θ) = 1
  Aerodynamic: T_aero = q × Cd × A × CP_offset where q = 0.5 × ρ × v²
    ρ at LEO 400 km ≈ 1e-12 kg/m³ (solar min) to 1e-11 kg/m³ (solar max)
  Solar: T_solar = (q_sun / c) × (1 + ρ_refl) × A × CP_offset
    where q_sun/c ≈ 4.6 μN/m² solar radiation pressure

Reaction wheel sizing (Wertz Ch 18): h_wheel = ∫ T dt over one orbit
   Conservative: h_wheel = 3 × T_disturbance × T_orbit / 4

Reference: Wertz "Spacecraft Attitude Determination & Control"
Kluwer 1978 Ch 17-18, Larson/Wertz "Space Mission Analysis & Design"
3rd ed Sec 11.1, NRLMSISE-00 atmosphere model.

License: MIT.
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
    "tool_name": 'attitude_torque (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wertz ed. (1978), 'Spacecraft Attitude Determination and Control', Springer/Kluwer",
    "physics_basis": 'Gravity-gradient torque T_gg = (3μ/R³) × (I_z - I_x) × sin(2θ). Solar pressure T_srp = c_R × P_sun × A × d. Aerodynamic torque T_aero = 0.5 × ρ × v² × C_d × A × d.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


MU_EARTH = 3.986e14  # m³/s²
R_EARTH_M = 6.371e6
SOLAR_FLUX_W_M2 = 1361.0
C_LIGHT = 2.998e8


# Atmospheric density at LEO altitudes (NRLMSISE-00 mean solar activity, kg/m³)
# Tabulated from NRLMSISE-00 documentation (F10.7 = 150)
ATM_DENSITY_TABLE = [
    (100, 5.50e-7),
    (150, 2.08e-9),
    (200, 2.54e-10),
    (250, 6.07e-11),
    (300, 2.07e-11),
    (350, 8.53e-12),
    (400, 3.96e-12),
    (450, 2.07e-12),
    (500, 1.17e-12),
    (600, 4.55e-13),
    (700, 2.10e-13),
    (800, 1.10e-13),
    (1000, 3.46e-14),
]


def atmosphere_density_leo(altitude_km: float) -> float:
    if altitude_km <= ATM_DENSITY_TABLE[0][0]:
        return ATM_DENSITY_TABLE[0][1]
    if altitude_km >= ATM_DENSITY_TABLE[-1][0]:
        return ATM_DENSITY_TABLE[-1][1]
    for (h1, r1), (h2, r2) in zip(ATM_DENSITY_TABLE, ATM_DENSITY_TABLE[1:]):
        if h1 <= altitude_km <= h2:
            # Log-linear interpolation (density is exponential)
            log1 = math.log(r1)
            log2 = math.log(r2)
            t = (altitude_km - h1) / (h2 - h1)
            return math.exp(log1 + t * (log2 - log1))
    return 1e-13


def compute(payload: dict) -> dict:
    I_tensor = payload.get("inertia_tensor_kgm2", [0.01, 0.01, 0.005])
    if not isinstance(I_tensor, list) or len(I_tensor) < 3:
        I_tensor = [0.01, 0.01, 0.005]
    Ixx, Iyy, Izz = float(I_tensor[0]), float(I_tensor[1]), float(I_tensor[2])

    alt_km = float(payload.get("altitude_km", 400.0))
    A_sun = float(payload.get("area_facing_sun_m2", 0.02))
    A_vel = float(payload.get("area_facing_velocity_m2", 0.01))
    cg_offset = float(payload.get("cg_offset_m", 0.02))
    reflectivity = float(payload.get("solar_reflectivity", 0.6))
    orbital_period_s_in = payload.get("orbital_period_s")
    cd_aero = float(payload.get("drag_coefficient", 2.2))

    # Orbital radius
    r_m = R_EARTH_M + alt_km * 1000.0
    # Orbital velocity (circular)
    v_orbital = math.sqrt(MU_EARTH / r_m)
    # Orbital period
    T_orbit_s = 2.0 * math.pi * r_m / v_orbital
    if orbital_period_s_in is not None:
        T_orbit_s = float(orbital_period_s_in)

    # Gravity-gradient torque (max at 45° tilt)
    I_max_diff = max(abs(Izz - Iyy), abs(Izz - Ixx), abs(Iyy - Ixx))
    T_gg = (3.0 * MU_EARTH / r_m ** 3) * I_max_diff  # already includes sin(2θ)=1 at max

    # Aerodynamic torque
    rho = atmosphere_density_leo(alt_km)
    q_dyn = 0.5 * rho * v_orbital ** 2
    T_aero = q_dyn * cd_aero * A_vel * cg_offset

    # Solar radiation pressure torque
    p_solar = SOLAR_FLUX_W_M2 / C_LIGHT  # ≈ 4.54 μPa
    T_solar = p_solar * (1.0 + reflectivity) * A_sun * cg_offset

    # Total disturbance (worst-case sum)
    T_total = T_gg + T_aero + T_solar

    # Reaction wheel momentum to absorb 1 orbit of disturbance (Wertz Ch 18)
    # h_wheel = T_total × T_orbit / 4 (conservative)
    h_wheel_nms = T_total * T_orbit_s / 4.0

    # Add 50% margin for transients
    h_wheel_with_margin = h_wheel_nms * 1.5

    # --- Worked calculations (hand-checkable steps only) ---
    # Quantities derived from transcendental functions (sqrt, log, exp) or
    # table lookups (atmosphere_density_leo) are passed as rounded live values
    # rather than expanded, following the led_par pattern.
    r_m_r = round(r_m, 0)
    v_orbital_r = round(v_orbital, 1)
    T_orbit_s_r = round(T_orbit_s, 1)
    rho_r = float(f"{rho:.4e}")
    q_dyn_r = float(f"{q_dyn:.4e}")

    T_gg_r = float(f"{T_gg:.4e}")
    T_aero_r = float(f"{T_aero:.4e}")
    p_solar_r = float(f"{p_solar:.4e}")
    T_solar_r = float(f"{T_solar:.4e}")
    T_total_r = float(f"{T_total:.4e}")
    h_wheel_r = float(f"{h_wheel_nms:.4e}")
    h_margin_r = float(f"{h_wheel_with_margin:.4e}")

    worked = [
        worked_calc(
            label="Orbital radius",
            formula="r = R_earth + alt_km x 1000",
            values={"R_earth": (R_EARTH_M, "m"), "alt_km": (alt_km, "km")},
            result=r_m_r, result_unit="m",
            assumptions=["Earth mean radius 6,371 km"],
        ),
        worked_calc(
            label="Gravity-gradient disturbance torque (max)",
            formula="T_gg = (3 x mu / r^3) x I_max_diff",
            values={"mu": (MU_EARTH, "m3/s2"), "r": (r_m_r, "m"),
                    "I_max_diff": (I_max_diff, "kg m2")},
            result=T_gg_r, result_unit="N m",
            assumptions=["Max disturbance at 45 deg tilt (sin 2theta = 1)"],
        ),
        worked_calc(
            label="Aerodynamic disturbance torque",
            formula="T_aero = q_dyn x Cd x A_vel x cg_offset",
            values={"q_dyn": (q_dyn_r, "Pa"), "Cd": (cd_aero, ""),
                    "A_vel": (A_vel, "m2"), "cg_offset": (cg_offset, "m")},
            result=T_aero_r, result_unit="N m",
            assumptions=["q_dyn = 0.5 x rho x v^2 from NRLMSISE-00 table lookup"],
        ),
        worked_calc(
            label="Solar radiation pressure",
            formula="p_solar = SOLAR_FLUX / c",
            values={"SOLAR_FLUX": (SOLAR_FLUX_W_M2, "W/m2"), "c": (C_LIGHT, "m/s")},
            result=p_solar_r, result_unit="Pa",
            assumptions=["Solar constant 1361 W/m2"],
        ),
        worked_calc(
            label="Solar radiation pressure torque",
            formula="T_solar = p_solar x (1 + reflectivity) x A_sun x cg_offset",
            values={"p_solar": (p_solar_r, "Pa"), "reflectivity": (reflectivity, ""),
                    "A_sun": (A_sun, "m2"), "cg_offset": (cg_offset, "m")},
            result=T_solar_r, result_unit="N m",
            assumptions=["Worst-case orientation: sun normal to A_sun face"],
        ),
        worked_calc(
            label="Total disturbance torque (worst-case sum)",
            formula="T_total = T_gg + T_aero + T_solar",
            values={"T_gg": (T_gg_r, "N m"), "T_aero": (T_aero_r, "N m"),
                    "T_solar": (T_solar_r, "N m")},
            result=T_total_r, result_unit="N m",
            assumptions=["Torques add worst-case (not root-sum-square)"],
        ),
        worked_calc(
            label="Reaction wheel angular momentum (one orbit)",
            formula="h_wheel = T_total x T_orbit / 4",
            values={"T_total": (T_total_r, "N m"), "T_orbit": (T_orbit_s_r, "s")},
            result=h_wheel_r, result_unit="N m s",
            assumptions=["Wertz Ch 18 conservative estimate; divides by 4 for sinusoidal averaging"],
        ),
        worked_calc(
            label="Reaction wheel angular momentum (with 50% margin)",
            formula="h_margin = h_wheel x 1.5",
            values={"h_wheel": (h_wheel_r, "N m s")},
            result=h_margin_r, result_unit="N m s",
            assumptions=["50% transient margin per Wertz Ch 18 recommendation"],
        ),
    ]

    return {
        "gravity_gradient_torque_nm": float(f"{T_gg:.4e}"),
        "aero_torque_nm": float(f"{T_aero:.4e}"),
        "solar_torque_nm": float(f"{T_solar:.4e}"),
        "total_disturbance_nm": float(f"{T_total:.4e}"),
        "actuator_required_nms": float(f"{h_wheel_with_margin:.4e}"),
        "actuator_one_orbit_nms": float(f"{h_wheel_nms:.4e}"),
        "atmospheric_density_kg_m3": float(f"{rho:.4e}"),
        "orbital_velocity_ms": round(v_orbital, 1),
        "orbital_period_min": round(T_orbit_s / 60.0, 2),
        "dynamic_pressure_pa": float(f"{q_dyn:.4e}"),
        "altitude_km": alt_km,
        "inertia_tensor_kgm2": I_tensor,
        "cg_offset_m": cg_offset,
        "area_facing_sun_m2": A_sun,
        "area_facing_velocity_m2": A_vel,
        "solar_reflectivity": reflectivity,
        "drag_coefficient": cd_aero,
        "solar_radiation_pressure_pa": float(f"{p_solar:.4e}"),
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
