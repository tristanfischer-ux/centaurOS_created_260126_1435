#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/joint_actuator_torque.py

Joint actuator torque sizing for humanoid robot.

Input:
    {
      "lever_arm_m": 0.4,
      "payload_mass_kg": 5.0,
      "dynamic_acceleration_m_s2": 2.0,
      "gear_ratio": 100.0,
      "joint_type": "knee"   // hip | knee | ankle | shoulder | elbow | wrist
    }

Output:
    {
      "required_torque_nm": ...,
      "peak_current_a": ...,
      "actuator_mass_kg": ...,
      ...
    }

Physics:
- Static torque: τ_static = m × g × L (worst-case lever arm)
- Dynamic torque: τ_dynamic = m × a × L
- Total: τ = τ_static + τ_dynamic, with safety factor 1.5-2.5×.

References:
- Featherstone (2008) "Rigid Body Dynamics Algorithms," Springer.
- Boston Dynamics Atlas patent US 9,517,567 (2016) — joint sizing.
- Wensing et al. (2017) "Proprioceptive Actuator Design in the MIT Cheetah:
  Impact Mitigation and High-Bandwidth Physical Interaction," IEEE T-RO 33, 509.
- Apptronik Apollo white-paper (2024) — quasi-direct-drive actuators.
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
    "tool_name": "joint_actuator_torque (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Featherstone (2008); Wensing et al. (2017) IEEE T-RO 33 509",
    "physics_basis": "τ = m·(g + a)·L with safety factor 1.5-2.5; motor torque = output / gear_ratio / eff.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

G = 9.81


def compute(payload: dict) -> dict:
    L = float(payload.get("lever_arm_m", 0.4))
    m_payload = float(payload.get("payload_mass_kg", 5.0))
    a = float(payload.get("dynamic_acceleration_m_s2", 2.0))
    gear_ratio = float(payload.get("gear_ratio", 100.0))
    joint = str(payload.get("joint_type", "knee")).lower()

    # Joint type safety factor (knees and hips need higher SF for landing impacts)
    joint_sf = {
        "knee": 2.5,
        "hip": 2.5,
        "ankle": 2.0,
        "shoulder": 2.0,
        "elbow": 1.8,
        "wrist": 1.5,
        "neck": 1.5,
        "torso": 2.0,
    }.get(joint, 2.0)

    # Static + dynamic torque at the joint
    tau_static_nm = m_payload * G * L
    tau_dynamic_nm = m_payload * a * L
    tau_total_nm = (tau_static_nm + tau_dynamic_nm) * joint_sf

    # Motor torque (after gear reduction)
    gear_efficiency = 0.85  # typical harmonic / planetary
    motor_torque_nm = tau_total_nm / (gear_ratio * gear_efficiency)

    # Peak current at 350 V DC bus, 0.1 Nm/A motor constant
    # Typical small-frame BLDC: 0.05-0.15 Nm/A
    Kt = 0.10
    peak_current_a = motor_torque_nm / Kt

    # Actuator mass estimate from power
    # Wensing et al.: ~1 kg per 100 Nm output torque for proprioceptive design
    actuator_mass_kg = max(0.3, tau_total_nm / 100.0 * 1.2)

    # Peak power
    # Typical joint angular velocity: 5-15 rad/s
    omega_rad_s = 8.0  # mid-range
    peak_power_w = tau_total_nm * omega_rad_s

    # Heat dissipation: I² × R
    R_phase = 0.05  # ohm
    heat_w = (peak_current_a ** 2) * R_phase * 1.5  # 1.5× for 3-phase

    # Cost estimate: £80/Nm for high-quality QDD actuator
    cost_gbp = 80 * tau_total_nm

    # Worked calculations — all steps are straightforward closed-form arithmetic.
    tau_s_r = round(tau_static_nm, 2)
    tau_d_r = round(tau_dynamic_nm, 2)
    tau_t_r = round(tau_total_nm, 1)
    # Derive motor_tau_r from tau_t_r (the rounded value shown in the prior step) so
    # that tau_total / (gear_ratio x gear_eff) reproduces the stated result exactly.
    motor_tau_r = round(tau_t_r / (gear_ratio * gear_efficiency), 3)
    # Derive i_peak_r from motor_tau_r so motor_torque / Kt reproduces stated result.
    i_peak_r = round(motor_tau_r / Kt, 2)
    p_peak_r = round(peak_power_w, 0)
    worked = [
        worked_calc(
            label="Static joint torque",
            formula="tau_static = m_payload x G x L",
            values={
                "m_payload": (m_payload, "kg"),
                "G": (G, "m/s2"),
                "L": (L, "m"),
            },
            result=tau_s_r, result_unit="N.m",
            assumptions=["Worst-case static gravity load at full lever extension"],
        ),
        worked_calc(
            label="Dynamic joint torque",
            formula="tau_dynamic = m_payload x a x L",
            values={
                "m_payload": (m_payload, "kg"),
                "a": (a, "m/s2"),
                "L": (L, "m"),
            },
            result=tau_d_r, result_unit="N.m",
            assumptions=["Dynamic inertial load from acceleration; simultaneous with gravity"],
        ),
        worked_calc(
            label="Total joint torque (with safety factor)",
            formula="tau_total = (tau_static + tau_dynamic) x joint_sf",
            values={
                "tau_static": (tau_s_r, "N.m"),
                "tau_dynamic": (tau_d_r, "N.m"),
                "joint_sf": (joint_sf, ""),
            },
            result=tau_t_r, result_unit="N.m",
            assumptions=[f"Safety factor {joint_sf} for {joint} joint (Boston Dynamics Atlas sizing practice)"],
        ),
        worked_calc(
            label="Required motor torque (before gearbox)",
            formula="motor_torque = tau_total / (gear_ratio x gear_eff)",
            values={
                "tau_total": (tau_t_r, "N.m"),
                "gear_ratio": (gear_ratio, ""),
                "gear_eff": (gear_efficiency, ""),
            },
            result=motor_tau_r, result_unit="N.m",
            assumptions=["gear_eff = 0.85 typical for harmonic/planetary gearbox (Wensing et al. 2017)"],
        ),
        worked_calc(
            label="Peak motor current",
            formula="peak_current = motor_torque / Kt",
            values={
                "motor_torque": (motor_tau_r, "N.m"),
                "Kt": (Kt, "N.m/A"),
            },
            result=i_peak_r, result_unit="A",
            assumptions=["Kt = 0.10 N.m/A typical small-frame BLDC (0.05-0.15 N.m/A range)"],
        ),
        worked_calc(
            label="Peak joint power",
            formula="peak_power = tau_total x omega",
            values={
                "tau_total": (tau_t_r, "N.m"),
                "omega": (omega_rad_s, "rad/s"),
            },
            result=p_peak_r, result_unit="W",
            assumptions=["omega = 8 rad/s mid-range typical joint angular velocity (5-15 rad/s)"],
        ),
    ]

    return {
        "joint_type": joint,
        "lever_arm_m": L,
        "payload_mass_kg": m_payload,
        "dynamic_acceleration_m_s2": a,
        "required_torque_nm": round(tau_total_nm, 1),
        "torque_static_nm": round(tau_static_nm, 2),
        "torque_dynamic_nm": round(tau_dynamic_nm, 2),
        "joint_safety_factor": joint_sf,
        "motor_torque_nm": round(motor_torque_nm, 2),
        "gear_ratio": gear_ratio,
        "gear_efficiency": gear_efficiency,
        "peak_current_a": round(peak_current_a, 1),
        "mass_kg": round(actuator_mass_kg, 2),
        "actuator_mass_kg": round(actuator_mass_kg, 2),
        "peak_power_w": round(peak_power_w, 0),
        "heat_dissipation_w": round(heat_w, 1),
        "estimated_cost_gbp": round(cost_gbp, 0),
        "motor_constant_kt_nm_a": Kt,
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
