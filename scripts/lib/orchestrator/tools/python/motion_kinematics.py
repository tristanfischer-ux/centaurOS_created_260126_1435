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
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


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

    # Worked calculations for the PDF appendix.
    # available_torque_ncm comes from table interpolation — SKIP, pass as live value.
    # max_accel derives from available_torque after friction subtraction — pass live.
    travel_r = round(travel_per_rev_mm, 3)
    full_steps_r = round(full_steps_per_rev, 1)
    steps_per_mm_r = round(steps_per_mm, 4)
    max_step_freq_r = round(max_step_freq_hz, 1)
    r_pulley_mm_r = round(r_pulley_mm, 3)
    f_accel_r = round(f_accel_n, 3)
    f_friction_r = round(f_friction_n, 3)
    f_total_r = round(f_total_n, 3)
    torque_req_r = round(torque_required_ncm, 3)
    worked = [
        worked_calc(
            label="Belt travel per motor revolution",
            formula="travel_per_rev = teeth x pitch_mm",
            values={
                "teeth": (teeth, "teeth"),
                "pitch_mm": (pitch_mm, "mm"),
            },
            result=travel_r, result_unit="mm/rev",
        ),
        worked_calc(
            label="Steps per mm",
            formula="steps_per_mm = (full_steps_per_rev x microstep) / travel_per_rev",
            values={
                "full_steps_per_rev": (full_steps_r, "steps/rev"),
                "microstep": (microstep, ""),
                "travel_per_rev": (travel_r, "mm/rev"),
            },
            result=steps_per_mm_r, result_unit="steps/mm",
            assumptions=["full_steps_per_rev = 360 / step_angle_deg"],
        ),
        worked_calc(
            label="Maximum step frequency at target print speed",
            formula="max_step_freq = steps_per_mm x target_speed",
            values={
                "steps_per_mm": (steps_per_mm_r, "steps/mm"),
                "target_speed": (target_speed, "mm/s"),
            },
            result=max_step_freq_r, result_unit="Hz",
        ),
        worked_calc(
            label="Pulley pitch radius",
            formula="r_pulley_mm = travel_per_rev / (2 x pi)",
            values={"travel_per_rev": (travel_r, "mm/rev")},
            result=r_pulley_mm_r, result_unit="mm",
            assumptions=[f"2 x pi = {round(2*math.pi, 6)}"],
        ),
        worked_calc(
            label="Acceleration force on moving mass",
            formula="F_accel = moving_mass x target_accel_m_s2",
            values={
                "moving_mass": (moving_mass_kg, "kg"),
                "target_accel_m_s2": (round(a_m_s2, 4), "m/s^2"),
            },
            result=f_accel_r, result_unit="N",
            assumptions=["target_accel_m_s2 = target_accel_mm_s2 / 1000"],
        ),
        worked_calc(
            label="Friction force",
            formula="F_friction = friction_coeff x moving_mass x g",
            values={
                "friction_coeff": (friction_coeff, ""),
                "moving_mass": (moving_mass_kg, "kg"),
                "g": (9.80665, "m/s^2"),
            },
            result=f_friction_r, result_unit="N",
        ),
        worked_calc(
            label="Total belt force required",
            formula="F_total = F_accel + F_friction",
            values={
                "F_accel": (f_accel_r, "N"),
                "F_friction": (f_friction_r, "N"),
            },
            result=f_total_r, result_unit="N",
        ),
        worked_calc(
            label="Required motor torque (N.cm)",
            formula="T_req = ((F_total x r_pulley_mm) / eta_belt) / 10",
            values={
                "F_total": (f_total_r, "N"),
                "r_pulley_mm": (r_pulley_mm_r, "mm"),
                "eta_belt": (eta_belt, ""),
            },
            result=torque_req_r, result_unit="N.cm",
            assumptions=[
                "r_pulley_mm / 1000 converts mm to m; / 10 = / 1000 x 100 gives N.cm; eta_belt = 0.90",
            ],
        ),
    ]

    return {
        "steps_per_mm": steps_per_mm_r,
        "max_accel_mm_s2": round(max_accel_mm_s2, 1),
        "motor_torque_required_ncm": torque_req_r,
        "motor_torque_available_at_speed_ncm": round(available_torque_ncm, 3),
        "torque_margin_pct": round(100.0 * (available_torque_ncm - torque_required_ncm) / max(0.01, available_torque_ncm), 1),
        "max_step_freq_hz": max_step_freq_r,
        "pulley_radius_mm": r_pulley_mm_r,
        "travel_per_rev_mm": travel_r,
        "full_steps_per_rev": full_steps_r,
        "microstepping": microstep,
        "force_required_n": f_total_r,
        "force_acceleration_n": f_accel_r,
        "force_friction_n": f_friction_r,
        "axis_length_mm": axis_length,
        "moving_mass_kg": moving_mass_kg,
        "belt_pitch_mm": pitch_mm,
        "pulley_teeth": teeth,
        "step_angle_deg": step_angle,
        "target_print_speed_mm_s": target_speed,
        "feasible": available_torque_ncm > torque_required_ncm,
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
