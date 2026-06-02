#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cmg_control_moment_gyro.py

Control Moment Gyroscope (CMG) sizing — agile spacecraft attitude control
via gyroscopic torque amplification.

Companies served: Veoware Space (BE), Honeywell aerospace, GMV.

Input:
    {
      "rotor_inertia_kgm2": 0.01,
      "rotor_speed_rpm": 10000.0,
      "gimbal_rate_deg_s": 10.0,
      "num_CMGs": 4,
      "satellite_inertia_kgm2": 100.0
    }

Output:
    torque_nm, momentum_nms, agility_deg_per_s2_per_kg_sat,
    saturation_angle_deg, _provenance.

Physics:
  CMG output torque:  T = H * omega_gimbal × n_unit
  Stored momentum:    H = I_rotor * omega_rotor
  Saturation in scissor pair occurs at gimbal angle = 90°
  Singularity-free workspace for pyramid CMG: ~70% of envelope

References:
- Wertz, J.R. (ed.), "Spacecraft Attitude Determination and Control",
  Kluwer 1978, ch.7.
- Sidi, M.J., "Spacecraft Dynamics and Control: A Practical Engineering
  Approach", Cambridge 1997.
- Lappas, V., Asghar, S., Fertin, D., et al., "Control Moment Gyros (CMGs)",
  Surrey Space Centre Tech. Note CMG-2003-04, 2003.
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
    "tool_name": "cmg_control_moment_gyro (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Wertz (1978) 'Spacecraft Attitude Determination and Control' Kluwer ch.7; "
        "Sidi (1997) 'Spacecraft Dynamics and Control: A Practical Engineering Approach' CUP; "
        "Lappas et al. (2003) Surrey Space Centre CMG-2003-04."
    ),
    "physics_basis": (
        "CMG torque from precession of rotor momentum H = I omega_rotor "
        "by gimbal rate omega_g. Output T = H * omega_g (cross product). "
        "Singularity-free workspace ~70% for pyramid arrangement."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "PYRAMID_SINGULARITY_FACTOR": {
            "source": "Sidi (1997) §7.6 — pyramid 4-CMG singularity-free workspace 70-75%",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    I_rotor = float(payload.get("rotor_inertia_kgm2", 0.01))
    omega_rotor_rpm = float(payload.get("rotor_speed_rpm", 10000.0))
    omega_gimbal_deg_s = float(payload.get("gimbal_rate_deg_s", 10.0))
    n_cmgs = int(payload.get("num_CMGs", 4))
    I_sat = float(payload.get("satellite_inertia_kgm2", 100.0))
    sat_mass_kg = float(payload.get("satellite_mass_kg", 100.0))

    if I_rotor <= 0:
        raise ValueError("rotor_inertia_kgm2 must be positive")
    if omega_rotor_rpm <= 0:
        raise ValueError("rotor_speed_rpm must be positive")

    # Convert to SI
    omega_rotor_rad_s = omega_rotor_rpm * 2.0 * math.pi / 60.0
    omega_gimbal_rad_s = math.radians(omega_gimbal_deg_s)

    # Per-CMG stored momentum
    h_per_cmg_nms = I_rotor * omega_rotor_rad_s

    # Per-CMG output torque
    torque_per_cmg_nm = h_per_cmg_nms * omega_gimbal_rad_s

    # Pyramid arrangement: 4 CMGs at 54.74° gives 2H peak; usable in singularity-free
    # workspace ~70%
    if n_cmgs >= 4:
        config_factor_torque = 2.0
        config_factor_momentum = 4.0
        singularity_free_factor = 0.7
    elif n_cmgs == 3:
        config_factor_torque = 1.7
        config_factor_momentum = 3.0
        singularity_free_factor = 0.6
    else:
        config_factor_torque = n_cmgs * 1.0
        config_factor_momentum = n_cmgs * 1.0
        singularity_free_factor = 0.5

    # Total torque
    total_torque_nm = torque_per_cmg_nm * config_factor_torque
    # Effective torque (singularity-free)
    effective_torque_nm = total_torque_nm * singularity_free_factor

    # Total momentum
    total_momentum_nms = h_per_cmg_nms * config_factor_momentum

    # Angular acceleration of spacecraft
    if I_sat > 0:
        alpha_sat_rad_s2 = effective_torque_nm / I_sat
        alpha_sat_deg_s2 = math.degrees(alpha_sat_rad_s2)
    else:
        alpha_sat_rad_s2 = 0
        alpha_sat_deg_s2 = 0

    # Agility metric (deg/s^2 per kg of satellite)
    if sat_mass_kg > 0:
        agility = alpha_sat_deg_s2 / sat_mass_kg
    else:
        agility = 0

    # Saturation angle: gimbal_max ~ 90° before reversal needed
    saturation_angle_deg = 90.0

    # Slew time for 90° maneuver
    # Time = 2 * sqrt(pi/2 / alpha_max) (bang-bang)
    if alpha_sat_rad_s2 > 0:
        slew_90_s = 2.0 * math.sqrt((math.pi / 2.0) / alpha_sat_rad_s2)
    else:
        slew_90_s = float("inf")

    # Power per CMG (for spinup + steady-state)
    p_per_cmg_w = h_per_cmg_nms * 5.0  # 5 W/Nms typical for high-speed flywheels
    total_power_w = p_per_cmg_w * n_cmgs

    # Worked calculations — reviewer-verifiable steps.
    # omega_rotor_rad_s uses 2*pi (transcendental) → SKIPPED; passed as live input.
    # omega_gimbal_rad_s uses math.radians (transcendental) → SKIPPED; passed as live input.
    # config_factor_torque and singularity_free_factor are piecewise lookup → SKIPPED.
    omega_r_r        = round(omega_rotor_rad_s, 1)
    omega_g_r        = round(omega_gimbal_rad_s, 6)
    h_per_r          = round(h_per_cmg_nms, 3)
    torque_per_r     = round(torque_per_cmg_nm, 4)
    total_torque_r   = round(total_torque_nm, 3)
    eff_torque_r     = round(effective_torque_nm, 3)
    total_mom_r      = round(total_momentum_nms, 2)

    worked = [
        worked_calc(
            label="Stored angular momentum per CMG",
            formula="h_per_cmg = I_rotor x omega_rotor_rad_s",
            values={
                "I_rotor":          (I_rotor,   "kg m2"),
                "omega_rotor_rad_s": (omega_r_r, "rad/s"),
            },
            result=h_per_r, result_unit="N m s",
            assumptions=["omega_rotor_rad_s = rpm x 2pi / 60 (transcendental — not re-shown)."],
        ),
        worked_calc(
            label="Output torque per CMG",
            formula="torque_per_cmg = h_per_cmg x omega_gimbal_rad_s",
            values={
                "h_per_cmg":         (h_per_r,   "N m s"),
                "omega_gimbal_rad_s": (omega_g_r, "rad/s"),
            },
            result=torque_per_r, result_unit="N m",
            assumptions=["Cross-product magnitude = H * gimbal_rate (Wertz 1978 ch.7)."],
        ),
        worked_calc(
            label="Peak torque (configuration factor applied)",
            formula="total_torque = torque_per_cmg x config_factor_torque",
            values={
                "torque_per_cmg":    (torque_per_r,       "N m"),
                "config_factor_torque": (config_factor_torque, ""),
            },
            result=total_torque_r, result_unit="N m",
            assumptions=["config_factor_torque = 2.0 for 4-CMG pyramid (Sidi 1997 §7.5)."],
        ),
        worked_calc(
            label="Effective (singularity-free workspace) torque",
            formula="eff_torque = total_torque x singularity_free_factor",
            values={
                "total_torque":          (total_torque_r,         "N m"),
                "singularity_free_factor": (singularity_free_factor, ""),
            },
            result=eff_torque_r, result_unit="N m",
            assumptions=["Singularity-free workspace 70% for pyramid 4-CMG (Sidi 1997 §7.6)."],
        ),
        worked_calc(
            label="Total stored momentum (cluster)",
            formula="total_momentum = h_per_cmg x config_factor_momentum",
            values={
                "h_per_cmg":            (h_per_r,               "N m s"),
                "config_factor_momentum": (config_factor_momentum, ""),
            },
            result=total_mom_r, result_unit="N m s",
            assumptions=["config_factor_momentum = n_CMGs for additive momentum (parallel spin axes)."],
        ),
    ]

    return {
        "rotor_inertia_kgm2": I_rotor,
        "rotor_speed_rpm": omega_rotor_rpm,
        "gimbal_rate_deg_s": omega_gimbal_deg_s,
        "num_CMGs": n_cmgs,
        "satellite_inertia_kgm2": I_sat,
        "satellite_mass_kg": sat_mass_kg,
        "rotor_angular_velocity_rad_s": round(omega_rotor_rad_s, 1),
        "momentum_per_cmg_nms": round(h_per_cmg_nms, 3),
        "torque_per_cmg_nm": round(torque_per_cmg_nm, 4),
        "config_factor_torque": config_factor_torque,
        "singularity_free_workspace_factor": singularity_free_factor,
        "torque_nm": round(effective_torque_nm, 3),
        "torque_total_peak_nm": round(total_torque_nm, 3),
        "momentum_nms": round(total_momentum_nms, 2),
        "spacecraft_angular_acceleration_deg_s2": round(alpha_sat_deg_s2, 3),
        "agility_deg_per_s2_per_kg_sat": round(agility, 5),
        "slew_90deg_seconds": round(slew_90_s, 2) if slew_90_s != float("inf") else None,
        "saturation_angle_deg": saturation_angle_deg,
        "total_power_w": round(total_power_w, 1),
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
