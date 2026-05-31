#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/motion_kinematics.py

3D printer / CNC motion-axis kinematics: steps/mm, max accel, motor
torque from belt + stepper geometry.
Stdin JSON -> stdout JSON.

Input:
    {
      "axis_length_mm": 300.0,
      "belt_pulley_teeth": 20,
      "belt_pitch_mm": 2.0,                  # GT2 = 2mm pitch
      "motor_step_angle_deg": 1.8,           # NEMA17 typical
      "microstepping": 16,                   # driver setting
      "target_print_speed_mm_s": 200.0,
      "moving_mass_kg": 0.5,
      "target_accel_mm_s2": 5000.0
    }

Output:
    {
      "steps_per_mm": 80.0,
      "max_accel_mm_s2": 7500.0,
      "motor_torque_required_ncm": 28.0,
      "max_step_freq_hz": 16000,
      ...
    }

Method:
  steps_per_mm = (full_steps_per_rev × microstepping) / (teeth × pitch)
  max step freq at target speed = steps_per_mm × speed_mm_s
  Torque to accelerate moving mass:
      F = m × a (linear belt force) → motor_torque = F × r_pulley + friction
      r_pulley = (teeth × pitch) / (2π)

Pull-out torque drops with step frequency (Mitsumi/Stepper datasheets).
We compare required torque vs typical pull-in torque at the step
frequency. NEMA17 ~ 40-65 N·cm holding, drops to ~15 N·cm at 10 kHz step
frequency.

Reference: Stepper motor design (Bishop "The Mechatronics Handbook" Ch 21),
NEMA ICS 23 stepper standard, Klipper firmware documentation.

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
    "tool_name": 'motion_kinematics (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree, Klipper docs)',
    "tool_paper": 'Klipper firmware documentation (klipper3d.org); NEMA ICS 23 (stepper-motor classifications)',
    "physics_basis": 'Stepper microstepping: steps/mm = (motor_steps × microstep) / lead_per_rev. Torque margin = available_torque / required_torque at speed.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# NEMA17 typical pull-out torque vs step frequency (interpolation)
# Frequencies in Hz step rate, torque in N·cm (for 1.7A NEMA17)
NEMA17_TORQUE_HZ_NCM = [
    (0, 50),
    (1000, 45),
    (2000, 38),
    (5000, 25),
    (10000, 15),
    (20000, 8),
    (40000, 4),
]


def interp_torque(freq_hz: float) -> float:
    """Linear interpolation of pull-out torque (NEMA17 1.7A baseline)."""
    if freq_hz <= NEMA17_TORQUE_HZ_NCM[0][0]:
        return NEMA17_TORQUE_HZ_NCM[0][1]
    if freq_hz >= NEMA17_TORQUE_HZ_NCM[-1][0]:
        return NEMA17_TORQUE_HZ_NCM[-1][1]
    for (f1, t1), (f2, t2) in zip(NEMA17_TORQUE_HZ_NCM, NEMA17_TORQUE_HZ_NCM[1:]):
        if f1 <= freq_hz <= f2:
            return t1 + (t2 - t1) * (freq_hz - f1) / (f2 - f1)
    return 10.0


def compute(payload: dict) -> dict:
    axis_length = float(payload.get("axis_length_mm", 300.0))
    teeth = int(payload.get("belt_pulley_teeth", 20))
    pitch_mm = float(payload.get("belt_pitch_mm", 2.0))
    step_angle = float(payload.get("motor_step_angle_deg", 1.8))
    microstep = int(payload.get("microstepping", 16))
    target_speed = float(payload.get("target_print_speed_mm_s", 200.0))
    moving_mass_kg = float(payload.get("moving_mass_kg", 0.5))
    target_accel = float(payload.get("target_accel_mm_s2", 5000.0))
    friction_coeff = float(payload.get("friction_coefficient", 0.05))

    full_steps_per_rev = 360.0 / max(0.01, step_angle)
    travel_per_rev_mm = teeth * pitch_mm  # belt travel per motor revolution
    steps_per_mm = (full_steps_per_rev * microstep) / max(0.01, travel_per_rev_mm)

    max_step_freq_hz = steps_per_mm * target_speed

    # Pulley radius
    r_pulley_mm = travel_per_rev_mm / (2.0 * math.pi)
    r_pulley_m = r_pulley_mm * 1e-3

    # Force to accelerate moving mass + overcome friction
    a_m_s2 = target_accel * 1e-3  # mm/s² → m/s²
    f_accel_n = moving_mass_kg * a_m_s2
    f_friction_n = friction_coeff * moving_mass_kg * 9.80665
    f_total_n = f_accel_n + f_friction_n

    # Required torque at motor shaft (N·m), with belt efficiency 90%
    eta_belt = 0.90
    torque_required_nm = (f_total_n * r_pulley_m) / eta_belt
    torque_required_ncm = torque_required_nm * 100.0

    # Available motor torque at max step frequency
    available_torque_ncm = interp_torque(max_step_freq_hz)

    # Maximum achievable acceleration: when motor torque == required at max freq
    # F_max = (T_avail × η) / r → a_max = F_max / m
    torque_avail_at_target_speed_nm = available_torque_ncm / 100.0
    f_max_n = (torque_avail_at_target_speed_nm * eta_belt) / r_pulley_m
    f_avail_for_accel = max(0.0, f_max_n - f_friction_n)
    max_accel_m_s2 = f_avail_for_accel / max(1e-3, moving_mass_kg)
    max_accel_mm_s2 = max_accel_m_s2 * 1000.0

    return {
        "steps_per_mm": round(steps_per_mm, 4),
        "max_accel_mm_s2": round(max_accel_mm_s2, 1),
        "motor_torque_required_ncm": round(torque_required_ncm, 3),
        "motor_torque_available_at_speed_ncm": round(available_torque_ncm, 3),
        "torque_margin_pct": round(100.0 * (available_torque_ncm - torque_required_ncm) / max(0.01, available_torque_ncm), 1),
        "max_step_freq_hz": round(max_step_freq_hz, 1),
        "pulley_radius_mm": round(r_pulley_mm, 3),
        "travel_per_rev_mm": round(travel_per_rev_mm, 3),
        "full_steps_per_rev": round(full_steps_per_rev, 1),
        "microstepping": microstep,
        "force_required_n": round(f_total_n, 3),
        "force_acceleration_n": round(f_accel_n, 3),
        "force_friction_n": round(f_friction_n, 3),
        "axis_length_mm": axis_length,
        "moving_mass_kg": moving_mass_kg,
        "belt_pitch_mm": pitch_mm,
        "pulley_teeth": teeth,
        "step_angle_deg": step_angle,
        "target_print_speed_mm_s": target_speed,
        "feasible": available_torque_ncm > torque_required_ncm,
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
