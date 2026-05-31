#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/dexterity_kinematics.py

Finger kinematics and grasp force for humanoid robot hands.

Input:
    {
      "finger_count": 5,
      "dof_per_finger": 4,
      "target_grip_force_n": 60.0,
      "thumb_opposable": true,
      "finger_length_mm": 95
    }

Output:
    {
      "actuator_count": ...,
      "total_motor_torque_nm": ...,
      "dexterity_index": ...,
      ...
    }

Physics:
- Dexterity index (Salisbury 1985): D = #independent_DOF / #task_DOF (6 for SE(3) pose).
- Pinch grasp force scales with finger flexion torque / lever arm.
- For human-like hand: 21 DOF total (4×5 + thumb special).
- Useful work envelope: from 1 mN (small object handling) to ~100 N (lifting).

References:
- Salisbury & Craig (1982) "Articulated Hands: Force Control and Kinematic
  Issues," Int. J. Robotics Research 1, 4.
- Allegro Hand v4 specifications (SimLab, 2018) — 16 DOF.
- Shadow Robot C6M dexterous hand (24 DOF, tendon-driven).
- Figure 02 / Optimus Gen 3 — public 11-DOF / 6-DOF hand designs.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "dexterity_kinematics (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Salisbury & Craig (1982) IJRR 1 4; Shadow Robot / Allegro Hand specs",
    "physics_basis": "Dexterity D = independent_DOF / 6 (SE(3)). Grasp force = sum(τ/L) at fingertip.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    n_fingers = int(payload.get("finger_count", 5))
    dof_per_finger = int(payload.get("dof_per_finger", 4))
    F_grip_n = float(payload.get("target_grip_force_n", 60.0))
    thumb_opp = bool(payload.get("thumb_opposable", True))
    L_finger_mm = float(payload.get("finger_length_mm", 95.0))

    # Total DOF
    if thumb_opp:
        # Thumb gets +1 opposition axis
        total_dof = n_fingers * dof_per_finger + (1 if thumb_opp else 0)
    else:
        total_dof = n_fingers * dof_per_finger

    # Actuator count (independent actuators; tendon-coupled cuts down)
    # Modern designs: 1 actuator per active DOF for full controllability
    # Underactuated: ~1 actuator per 2-3 DOF (e.g. Figure 02)
    # Use full actuation as baseline
    actuator_count = total_dof
    # Underactuated alt
    underactuated_count = math.ceil(total_dof / 2)

    # Torque per joint required
    # Lever arm = L_finger / 2 average distance from joint
    L_lever_m = (L_finger_mm / 1000.0) / 2.0
    # Distribute grip force across opposing fingers (typically 4 against thumb)
    n_opposing = min(4, n_fingers - 1) if thumb_opp else math.ceil(n_fingers / 2)
    F_per_finger_n = F_grip_n / max(1, n_opposing)
    tau_per_joint_nm = F_per_finger_n * L_lever_m / max(1, dof_per_finger - 1)

    # Total motor torque (sum of all joint torques) — used for actuator sizing
    total_torque_nm = actuator_count * tau_per_joint_nm

    # Dexterity index (Salisbury) — fraction of 6 task DOFs accessible
    dexterity_d = min(1.0, total_dof / 6.0)

    # Workspace volume estimate (cubic mm) — rough envelope
    workspace_mm3 = (L_finger_mm ** 3) * 1.5 * n_fingers

    # Pinch span (finger tip to thumb tip)
    pinch_span_mm = 2.5 * L_finger_mm if thumb_opp else 0

    # Estimated finger speed (rad/s typical 5-15)
    finger_speed_rad_s = 10.0

    # Actuator power per finger
    power_per_finger_w = tau_per_joint_nm * finger_speed_rad_s * (dof_per_finger - 1)
    total_hand_power_w = power_per_finger_w * n_fingers

    # Sensors required for closed-loop:
    # - Joint encoders: 1 per active DOF
    # - Tactile sensors: 1 per fingertip + 2 per finger
    encoder_count = actuator_count
    tactile_count = n_fingers * 3

    return {
        "finger_count": n_fingers,
        "dof_per_finger": dof_per_finger,
        "target_grip_force_n": F_grip_n,
        "thumb_opposable": thumb_opp,
        "actuator_count": actuator_count,
        "underactuated_count": underactuated_count,
        "total_dof": total_dof,
        "total_motor_torque_nm": round(total_torque_nm, 2),
        "torque_per_joint_nm": round(tau_per_joint_nm, 3),
        "dexterity_index": round(dexterity_d, 2),
        "workspace_mm3": round(workspace_mm3, 0),
        "pinch_span_mm": round(pinch_span_mm, 0),
        "force_per_finger_n": round(F_per_finger_n, 1),
        "n_opposing_fingers": n_opposing,
        "power_per_finger_w": round(power_per_finger_w, 2),
        "total_hand_power_w": round(total_hand_power_w, 1),
        "encoder_count": encoder_count,
        "tactile_sensor_count": tactile_count,
        "finger_length_mm": L_finger_mm,
        "max_grasp_force_n": round(F_grip_n, 1),
        "anthropomorphic": dexterity_d >= 0.8 and thumb_opp,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
