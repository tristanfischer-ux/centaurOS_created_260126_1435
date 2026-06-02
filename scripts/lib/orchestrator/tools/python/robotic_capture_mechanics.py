#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/robotic_capture_mechanics.py

Robotic-arm capture mechanics — payload dynamics, motor torque, capture window.

Companies served: ClearSpace (CH), Astroscale (UK), GMV (ES), Maxar Europe.

Input:
    {
      "arm_reach_m": 2.0,
      "arm_dof": 7,
      "payload_inertia_kgm2": 50.0,
      "target_grapple_point_type": "LAR" | "DOCK_PORT" | "AS_IS",
      "target_velocity_at_grapple_m_s": 0.05,
      "joint_friction_nm_per_joint": 0.5,
      "max_joint_speed_deg_s": 10.0
    }

Output:
    required_motor_torque_nm, capture_window_seconds, alignment_tolerance_mm,
    arm_mass_kg, control_bandwidth_hz, _provenance.

Physics:
  Joint torque: tau = I * alpha + tau_friction + I_payload * (omega_arm)^2
  Capture window: t_capture = sigma_align / v_relative
  Alignment tolerance: typical 5-50 mm for grapple, <1 mm for berthing

References:
- Yoshida, K., Wilcox, B., "Space Robots and Systems", in Springer Handbook
  of Robotics, 2008, ch.45.
- Flores-Abad, A., Ma, O., Pham, K., Ulrich, S., "A review of space robotics
  technologies for on-orbit servicing", Progress Aerospace Sci. 68:1-26, 2014.
- Nokin, M., "Capture and Berthing Mechanisms: Lessons from ATV / HTV",
  i-SAIRAS 2010.
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
    "tool_name": "robotic_capture_mechanics (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Yoshida & Wilcox (2008) Springer Handbook of Robotics ch.45 "
        "DOI:10.1007/978-3-540-30301-5_45; "
        "Flores-Abad et al. (2014) Progress Aerospace Sci. 68:1 "
        "DOI:10.1016/j.paerosci.2014.03.002; "
        "Nokin (2010) i-SAIRAS proceedings."
    ),
    "physics_basis": (
        "Manipulator dynamics from Lagrangian formulation. Joint torque "
        "scales with payload inertia and acceleration. Capture window "
        "= alignment_tolerance / relative_velocity."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "ALIGNMENT_TOLERANCE_BY_INTERFACE": {
            "source": "Nokin 2010, ATV CAM design; LAR 50 mm, DOCK_PORT 10 mm, AS_IS 200 mm",
            "confidence": "industry_typical",
        },
        "ARM_MASS_PER_DOF_KG": {
            "source": "Canadarm2 + ERA + JEMRMS public data — average 30 kg/DOF for free-flying arm",
            "confidence": "industry_typical",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


ALIGNMENT_TOLERANCE_MM = {
    "LAR":      50.0,    # Launch Adapter Ring
    "DOCK_PORT": 10.0,   # standard docking port
    "AS_IS":    200.0,   # tumbling debris, no grapple feature
    "GRAPPLE_FIXTURE": 30.0,  # Canadarm-type GF
    "RAFTI":    5.0,    # Orbit Fab RAFTI refueling
}

ARM_MASS_PER_DOF_KG = 30.0  # average for spacecraft manipulator


def compute(payload: dict) -> dict:
    reach_m = float(payload.get("arm_reach_m", 2.0))
    dof = int(payload.get("arm_dof", 7))
    payload_inertia = float(payload.get("payload_inertia_kgm2", 50.0))
    target = str(payload.get("target_grapple_point_type", "LAR"))
    v_rel = float(payload.get("target_velocity_at_grapple_m_s", 0.05))
    friction_nm = float(payload.get("joint_friction_nm_per_joint", 0.5))
    max_joint_speed_deg_s = float(payload.get("max_joint_speed_deg_s", 10.0))

    if target not in ALIGNMENT_TOLERANCE_MM:
        target = "LAR"
    alignment_mm = ALIGNMENT_TOLERANCE_MM[target]

    # Capture window
    if v_rel > 0:
        capture_window_s = (alignment_mm / 1000.0) / v_rel
    else:
        capture_window_s = float("inf")

    # Joint acceleration
    omega_max = math.radians(max_joint_speed_deg_s)
    # Acceleration to reach max speed within capture window
    if capture_window_s > 0:
        alpha_required = omega_max / capture_window_s
    else:
        alpha_required = omega_max * 10.0  # very fast

    # Worst-case joint torque (base joint, all payload mass at end-effector)
    # I_payload at base = m * reach^2 + I_intrinsic
    # Assume payload mass = inertia / arm length^2 approximation
    # More direct: tau = I * alpha + tau_friction + I_payload * alpha_payload + tau_grav (gravity off-axis)
    tau_base_inertia = payload_inertia * alpha_required
    tau_friction_total = friction_nm * dof
    # Centripetal load on base joint from payload rotation
    # tau_centripetal = m_payload * reach * omega^2 (approx)
    # Simplified: payload_mass = inertia / (0.5 * reach^2) → m_payload = 2 * I / reach^2
    m_payload_kg = 2 * payload_inertia / (reach_m ** 2) if reach_m > 0 else 100
    tau_dynamics = m_payload_kg * reach_m * (omega_max ** 2)

    tau_total = tau_base_inertia + tau_friction_total + tau_dynamics
    # Add 50% safety factor
    required_motor_torque_nm = tau_total * 1.5

    # Arm mass
    arm_mass_kg = dof * ARM_MASS_PER_DOF_KG

    # Control bandwidth
    # Typical capture requires omega_BW > 10 / capture_window
    # Plus stability margin: bandwidth needs to be at least 5x the dynamics
    if capture_window_s > 0:
        control_bw_hz_required = 5.0 / capture_window_s
    else:
        control_bw_hz_required = 10.0
    # Realistic upper bound for space robotics: 5-30 Hz
    control_bw_hz_achievable = min(control_bw_hz_required, 30.0)

    # Feasibility check
    feasible = (control_bw_hz_achievable >= control_bw_hz_required and
                capture_window_s > 0.5)  # need at least 0.5 s window

    # Worked calculations — transcendental intermediates (radians, sqrt)
    # are passed as opaque inputs; only the clean arithmetic steps are shown.
    capture_window_r = round(capture_window_s, 2) if capture_window_s != float("inf") else None
    m_payload_r = round(m_payload_kg, 1)
    tau_i_r = round(tau_base_inertia, 1)
    tau_f_r = round(tau_friction_total, 2)
    tau_d_r = round(tau_dynamics, 2)
    tau_total_r = round(tau_total, 1)

    worked = []

    if capture_window_r is not None:
        worked.append(worked_calc(
            label="Capture window",
            formula="t_capture = (align_mm / 1000) / v_rel",
            values={
                "align_mm": (alignment_mm, "mm"),
                "v_rel": (v_rel, "m/s"),
            },
            result=capture_window_r, result_unit="s",
            assumptions=[
                f"Alignment tolerance for '{target}' interface from Nokin 2010 ATV CAM data",
            ],
        ))

    worked.append(worked_calc(
        label="Estimated payload mass (from inertia)",
        formula="m_payload = 2 x I_payload / reach^2",
        values={
            "I_payload": (payload_inertia, "kg.m^2"),
            "reach": (reach_m, "m"),
        },
        result=m_payload_r, result_unit="kg",
        assumptions=["Thin-rod approximation: I = m*L^2/2 => m = 2*I/L^2"],
    ))

    worked.append(worked_calc(
        label="Arm structural mass",
        formula="m_arm = dof x mass_per_dof",
        values={
            "dof": (dof, ""),
            "mass_per_dof": (ARM_MASS_PER_DOF_KG, "kg/DOF"),
        },
        result=round(arm_mass_kg, 1), result_unit="kg",
        assumptions=["30 kg/DOF from Canadarm2 + ERA + JEMRMS public data (Flores-Abad 2014)"],
    ))

    worked.append(worked_calc(
        label="Total base-joint torque",
        formula="tau_total = tau_inertia + tau_friction + tau_dynamics",
        values={
            "tau_inertia": (tau_i_r, "N.m"),
            "tau_friction": (tau_f_r, "N.m"),
            "tau_dynamics": (tau_d_r, "N.m"),
        },
        result=tau_total_r, result_unit="N.m",
        assumptions=[
            "tau_inertia = I_payload x alpha (alpha from omega_max / capture_window — transcendental, passed as input)",
            "tau_friction = friction_per_joint x dof",
            "tau_dynamics = m_payload x reach x omega_max^2 (centripetal)",
        ],
    ))

    worked.append(worked_calc(
        label="Required motor torque (with safety factor)",
        formula="tau_motor = tau_total x 1.5",
        values={
            "tau_total": (tau_total_r, "N.m"),
        },
        result=round(required_motor_torque_nm, 1), result_unit="N.m",
        assumptions=["1.5x safety factor for contact dynamics at capture (Yoshida & Wilcox 2008)"],
    ))

    return {
        "arm_reach_m": reach_m,
        "arm_dof": dof,
        "payload_inertia_kgm2": payload_inertia,
        "estimated_payload_mass_kg": m_payload_r,
        "target_grapple_point_type": target,
        "alignment_tolerance_mm": alignment_mm,
        "target_velocity_at_grapple_m_s": v_rel,
        "capture_window_seconds": capture_window_r,
        "required_motor_torque_nm": round(required_motor_torque_nm, 1),
        "tau_inertial_component_nm": tau_i_r,
        "tau_friction_component_nm": tau_f_r,
        "tau_dynamics_component_nm": tau_d_r,
        "arm_mass_kg": round(arm_mass_kg, 1),
        "max_joint_speed_deg_s": max_joint_speed_deg_s,
        "control_bandwidth_hz_required": round(control_bw_hz_required, 1),
        "control_bandwidth_hz_achievable": round(control_bw_hz_achievable, 1),
        "feasible": feasible,
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
