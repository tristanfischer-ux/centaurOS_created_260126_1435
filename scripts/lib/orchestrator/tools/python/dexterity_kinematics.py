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
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

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

    # Worked calculations for the PDF appendix.
    # total_dof depends on the thumb_opp branch (not a simple closed-form for all cases)
    # so it is passed as a live input symbol rather than shown as a derived step.
    # dexterity_d uses min() clamping → also passed as input to downstream steps.
    L_lever_m_r = round(L_lever_m, 5)
    F_per_finger_r = round(F_per_finger_n, 1)
    # Use 4dp for tau_r so that actuator_count x tau_r evaluates to the same total_torque_r.
    # 3dp causes a floating-point artefact (0.23750...2 rounds to 0.238 not 0.237) that makes
    # 21 x 0.238 = 4.998 round to 5.00, disagreeing with the actual result 4.99.
    tau_r = round(tau_per_joint_nm, 4)
    # Derive total_torque_r from the same tau_r so the substitution is self-consistent.
    total_torque_r = round(actuator_count * tau_r, 2)
    workspace_r = round(workspace_mm3, 0)
    worked = [
        worked_calc(
            label="Lever arm (average joint-to-fingertip distance)",
            formula="L_lever_m = (L_finger_mm / 1000) / 2",
            values={"L_finger_mm": (L_finger_mm, "mm")},
            result=L_lever_m_r,
            result_unit="m",
            assumptions=["average moment arm = half the total finger length"],
        ),
        worked_calc(
            label="Force per opposing finger",
            formula="F_per_finger = F_grip / n_opposing",
            values={"F_grip": (F_grip_n, "N"), "n_opposing": (n_opposing, "")},
            result=F_per_finger_r,
            result_unit="N",
            assumptions=["grip load shared equally across opposing fingers"],
        ),
        worked_calc(
            label="Torque per joint",
            formula="tau = F_per_finger x L_lever_m / (dof_per_finger - 1)",
            values={
                "F_per_finger": (F_per_finger_r, "N"),
                "L_lever_m": (L_lever_m_r, "m"),
                "dof_per_finger": (dof_per_finger, ""),
            },
            result=tau_r,
            result_unit="N.m",
            assumptions=["torque distributed equally across active joints per finger"],
        ),
        worked_calc(
            label="Total motor torque (all actuators)",
            formula="total_torque = actuator_count x tau",
            values={"actuator_count": (actuator_count, ""), "tau": (tau_r, "N.m")},
            result=total_torque_r,
            result_unit="N.m",
            assumptions=["one actuator per active degree of freedom (full actuation)"],
        ),
        worked_calc(
            label="Workspace volume estimate",
            formula="workspace = L_finger_mm^3 x 1.5 x n_fingers",
            values={"L_finger_mm": (L_finger_mm, "mm"), "n_fingers": (n_fingers, "")},
            result=workspace_r,
            result_unit="mm^3",
            assumptions=["rough spherical-sector envelope; factor 1.5 from Salisbury (1985)"],
        ),
    ]

    return {
        "finger_count": n_fingers,
        "dof_per_finger": dof_per_finger,
        "target_grip_force_n": F_grip_n,
        "thumb_opposable": thumb_opp,
        "actuator_count": actuator_count,
        "underactuated_count": underactuated_count,
        "total_dof": total_dof,
        "total_motor_torque_nm": total_torque_r,
        "torque_per_joint_nm": tau_r,
        "dexterity_index": round(dexterity_d, 2),
        "workspace_mm3": workspace_r,
        "pinch_span_mm": round(pinch_span_mm, 0),
        "force_per_finger_n": F_per_finger_r,
        "n_opposing_fingers": n_opposing,
        "power_per_finger_w": round(power_per_finger_w, 2),
        "total_hand_power_w": round(total_hand_power_w, 1),
        "encoder_count": encoder_count,
        "tactile_sensor_count": tactile_count,
        "finger_length_mm": L_finger_mm,
        "max_grasp_force_n": round(F_grip_n, 1),
        "anthropomorphic": dexterity_d >= 0.8 and thumb_opp,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
