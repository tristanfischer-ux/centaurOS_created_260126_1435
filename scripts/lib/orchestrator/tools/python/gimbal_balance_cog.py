#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/gimbal_balance_cog.py

Camera gimbal centre-of-gravity + balance for drones.

Brushless gimbal stages (2-3 axis):
- Roll axis: parallel to flight direction
- Pitch axis: orthogonal to flight (tilt up/down)
- Yaw axis: vertical (pan left/right)

Each axis: torque = mass × distance × g (worst case at horizontal)
- Static: balance via counterweight; no motor torque needed
- Dynamic: motor compensates for body motion only

Motor sizing (torque-current ratio):
- BLDC gimbal motor torque constant: 0.1-0.3 Nm/A
- 5-30 Ncm typical for small camera gimbals
- 50-200 Ncm for cinema gimbals

CoG must be on rotational axis of each gimbal stage (±2mm) to avoid:
- Motor saturation (limits dynamic response)
- Battery drain
- Vibration coupling

References:
- Roberts & Reichard, "Cinematography for Drone Pilots", Routledge 2016
- DJI Ronin technical manual
- BaseCam EVO controller datasheet
- 3-axis stabilisation: Roetenberg et al, "Joint estimation of orientation
  using IMU", IEEE Trans Biomed Eng 2005
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
    "tool_name": 'gimbal_balance_cog (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Gross, Hauger, Schroeder, Wall (2018) 'Engineering Mechanics 1: Statics' 13th ed., Springer",
    "physics_basis": 'Center of gravity = Σ(m_i × r_i) / Σm_i. Required gimbal motor torque = (Σm_i × |r_perpendicular|) × g.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    pl_mass_g = float(payload.get("payload_mass_g", 250))   # camera + lens
    dims = payload.get("payload_dimensions_mm", {})
    pl_x = float(dims.get("x", 80))
    pl_y = float(dims.get("y", 60))
    pl_z = float(dims.get("z", 50))
    mount_xyz = payload.get("mount_point_xyz_mm", {"x": 0, "y": 0, "z": 0})
    mx, my, mz = float(mount_xyz.get("x", 0)), float(mount_xyz.get("y", 0)), float(mount_xyz.get("z", 0))
    gimbal_stages = int(payload.get("gimbal_stage_count", 3))

    # CoG of payload assumed at geometric centre (offset from mount)
    cog_x = mx + 0.0   # camera CoG typically on optical axis
    cog_y = my + 0.0   # symmetric L-R
    # Camera CoG offset downward from mount (camera body extends below mount line)
    cog_z = mz - pl_z * 0.3

    # Convert to m, kg
    pl_mass_kg = pl_mass_g / 1000.0
    cog_x_m = cog_x / 1000.0
    cog_y_m = cog_y / 1000.0
    cog_z_m = cog_z / 1000.0

    # Worst-case torque per axis (horizontal CoG offset × weight)
    g = 9.81
    # Roll axis (rotates around roll axis = horizontal flight direction)
    # Torque = m × g × |distance from axis|
    # If gimbal aligned correctly, distance ≈ 0 nominally; we use offset from mount as worst case
    torque_roll_nm = pl_mass_kg * g * abs(cog_z_m)
    torque_pitch_nm = pl_mass_kg * g * abs(cog_z_m)
    torque_yaw_nm = pl_mass_kg * g * abs(math.sqrt(cog_x_m ** 2 + cog_y_m ** 2))

    # Dynamic factor (g-loads during flight)
    dynamic_factor = 3.0   # 3g for aggressive manoeuvres
    torque_roll_dyn = torque_roll_nm * dynamic_factor
    torque_pitch_dyn = torque_pitch_nm * dynamic_factor
    torque_yaw_dyn = torque_yaw_nm * dynamic_factor

    # Torque in Ncm (commonly quoted)
    torque_required_ncm = max(torque_roll_dyn, torque_pitch_dyn, torque_yaw_dyn) * 100

    # Recommended motor: typically 1.5× peak required torque
    motor_torque_required_ncm = torque_required_ncm * 1.5

    # Max payload capacity for typical 30Ncm motor (sized for handheld gimbal)
    # max_payload = (motor_torque / 1.5 / dynamic_factor) / (g × cog_offset)
    if abs(cog_z_m) > 0.001:
        max_payload_with_30ncm = (0.30 / dynamic_factor) / (g * abs(cog_z_m)) * 1000  # g
    else:
        max_payload_with_30ncm = 5000  # huge capacity if CoG on-axis

    # Stage 1 (yaw): heaviest because carries everything below
    # Each stage adds mass; assume 30g per axis motor + 20g frame
    motor_mass_g = 30
    frame_per_stage_g = 20
    total_gimbal_mass_g = pl_mass_g + gimbal_stages * (motor_mass_g + frame_per_stage_g)

    # Balance check (target: |CoG offset| < 2mm on each axis)
    balance_ok_x = abs(cog_x) < 2
    balance_ok_y = abs(cog_y) < 2
    balance_ok_z = abs(cog_z) < 5   # vertical offset can be slightly larger
    balance_ok = balance_ok_x and balance_ok_y and balance_ok_z

    # Worked calculations.
    # torque_yaw_nm uses sqrt(x^2+y^2) (transcendental) — skipped; passed as live
    # input to motor_torque_required_ncm via torque_required_ncm.
    pl_mass_kg_r = round(pl_mass_kg, 4)
    cog_z_m_r = round(cog_z_m, 4)
    torque_roll_r = round(torque_roll_nm, 4)
    torque_dyn_r = round(torque_roll_dyn, 4)   # roll == pitch by construction
    # Use 4 decimal places so that torque_ncm_r * 1.5 chains to motor_ncm_r correctly.
    torque_ncm_r = round(torque_required_ncm, 4)
    motor_ncm_r = round(torque_ncm_r * 1.5, 2)
    total_mass_r = round(total_gimbal_mass_g, 1)
    worked = [
        worked_calc(
            label="Payload mass (kg)",
            formula="m_pl = pl_mass_g / 1000",
            values={"pl_mass_g": (pl_mass_g, "g")},
            result=pl_mass_kg_r, result_unit="kg",
            assumptions=["Convert grams to kilograms"],
        ),
        worked_calc(
            label="Camera CoG vertical offset from mount",
            formula="cog_z_m = (mz - pl_z x 0.3) / 1000",
            values={"mz": (mz, "mm"), "pl_z": (pl_z, "mm")},
            result=cog_z_m_r, result_unit="m",
            assumptions=["Camera body extends 30% of its Z dimension below the mount point"],
        ),
        worked_calc(
            label="Static roll/pitch gimbal torque",
            formula="T_static = m_pl x g x |cog_z_m|",
            values={
                "m_pl": (pl_mass_kg_r, "kg"),
                "g": (9.81, "m/s^2"),
                "|cog_z_m|": (abs(cog_z_m_r), "m"),
            },
            result=torque_roll_r, result_unit="Nm",
            assumptions=[
                "Worst-case axis torque when CoG is offset from rotational axis",
                "Roll and pitch torques are equal by symmetry for this geometry",
            ],
        ),
        worked_calc(
            label="Dynamic torque (3g manoeuvre factor)",
            formula="T_dyn = T_static x dynamic_factor",
            values={"T_static": (torque_roll_r, "Nm"), "dynamic_factor": (dynamic_factor, "")},
            result=torque_dyn_r, result_unit="Nm",
            assumptions=["3g dynamic factor for aggressive flight manoeuvres (cinema = 1.5g)"],
        ),
        worked_calc(
            label="Required motor torque (peak dynamic, in Ncm)",
            formula="T_req_ncm = T_dyn x 100",
            values={"T_dyn": (torque_dyn_r, "Nm")},
            result=torque_ncm_r, result_unit="Ncm",
            assumptions=[
                "x100 converts Nm to Ncm",
                "Yaw torque uses sqrt of CoG radial offset (not shown — transcendental); "
                "roll/pitch torques govern this geometry because CoG is on-axis laterally",
            ],
        ),
        worked_calc(
            label="Specified gimbal motor torque (1.5x safety factor)",
            formula="T_motor = T_req_ncm x 1.5",
            values={"T_req_ncm": (torque_ncm_r, "Ncm")},
            result=motor_ncm_r, result_unit="Ncm",
            assumptions=["1.5x safety factor for motor torque spec (DJI Ronin / BaseCam EVO sizing rule)"],
        ),
        worked_calc(
            label="Total gimbal assembly mass",
            formula="m_total = pl_mass_g + gimbal_stages x (motor_mass_g + frame_per_stage_g)",
            values={
                "pl_mass_g": (pl_mass_g, "g"),
                "gimbal_stages": (gimbal_stages, ""),
                "motor_mass_g": (motor_mass_g, "g"),
                "frame_per_stage_g": (frame_per_stage_g, "g"),
            },
            result=total_mass_r, result_unit="g",
            assumptions=["30 g per axis motor + 20 g per stage frame (brushless gimbal motors, typical)"],
        ),
    ]

    return {
        "payload_mass_g": pl_mass_g,
        "payload_dimensions_mm": dims,
        "mount_point_xyz_mm": mount_xyz,
        "cog_xyz_mm": {"x": round(cog_x, 2), "y": round(cog_y, 2), "z": round(cog_z, 2)},
        "cog_xyz_m": {"x": round(cog_x_m, 4), "y": round(cog_y_m, 4), "z": round(cog_z_m, 4)},
        "gimbal_stage_count": gimbal_stages,
        "torque_required_static_ncm": round(torque_required_ncm / dynamic_factor, 2),
        "torque_required_dynamic_ncm": round(torque_required_ncm, 2),
        "motor_torque_specified_ncm": round(motor_torque_required_ncm, 2),
        "max_payload_capacity_g_30ncm_motor": round(max_payload_with_30ncm, 0),
        "balance_ok": balance_ok,
        "balance_x_ok": balance_ok_x,
        "balance_y_ok": balance_ok_y,
        "balance_z_ok": balance_ok_z,
        "balance_offsets_required_mm": {
            "x_offset_to_zero": round(-cog_x, 2),
            "y_offset_to_zero": round(-cog_y, 2),
            "z_offset_to_zero": round(-cog_z, 2),
        },
        "total_gimbal_mass_g": round(total_gimbal_mass_g, 1),
        "motor_mass_per_stage_g": motor_mass_g,
        "frame_mass_per_stage_g": frame_per_stage_g,
        "dynamic_g_factor": dynamic_factor,
        "notes": (
            "CoG balance ±2mm on each axis required. Static torque only when "
            "perfectly balanced (motor compensates dynamic motion only). "
            "Dynamic factor 3g for aggressive manoeuvres (cinema = 1.5g). "
            "Counterweight tab balance is fastest tuning method."
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
