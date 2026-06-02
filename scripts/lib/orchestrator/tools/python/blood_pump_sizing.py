#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/blood_pump_sizing.py

Peristaltic pump sizing for hemodialysis / ECMO / CRRT blood circuits.
Stdin JSON -> stdout JSON.

Input:
    {
      "target_flow_ml_min": 350.0,
      "pressure_head_mmhg": 200.0,         # arterial side pressure
      "tubing_id_mm": 8.0,                  # standard dialysis tubing
      "rotor_diameter_mm": 60.0,            # standard pump head
      "pump_efficiency": 0.75
    }

Output:
    {
      "pump_rpm": 80.0,
      "motor_torque_ncm": 25.0,
      "hemolysis_risk_score": "low",
      ...
    }

Method:
  - Volumetric flow per revolution: V_per_rev = A_tubing × L_per_rev
    where L_per_rev = π × D_rotor (circumferential path)
    and A_tubing = π × (ID/2)²
  - RPM = Q / V_per_rev
  - Torque to compress tubing + lift fluid head:
    T = F_compress × R_rotor + Q × ΔP / (2π × η)
  - Hemolysis risk (NIH score, Giersiepen 1990):
    HI = 3.62e-7 × τ_shear^2.416 × t_exposure^0.785
    Threshold: < 0.005% for clinical use

Reference: Giersiepen et al "Estimation of shear stress-related blood
damage in heart valve prostheses" Int J Artif Organs 1990; FDA Guidance
"Blood Pumps" 2013; Vesely "Heart Valve Tissue Engineering" 2005.

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
    "tool_name": 'blood_pump_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Giersiepen, Wurzinger, Opitz, Reul (1990), 'Estimation of shear stress-related blood damage in heart valve prostheses — in vitro comparison of 25 aortic valves', Int. J. Artif. Organs 13(5):300-306; FDA Blood Pump Premarket Notification Guidance (2013)",
    "physics_basis": 'Volumetric flow Q = ω × V_swept × η_v. Hemolysis index from Giersiepen Σ(τ^2.416 × t^0.785) shear-time integral.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Conversions
MMHG_TO_PA = 133.322


def compute(payload: dict) -> dict:
    Q_ml_min = float(payload.get("target_flow_ml_min", 300.0))
    P_head_mmhg = float(payload.get("pressure_head_mmhg", 150.0))
    D_tube_id_mm = float(payload.get("tubing_id_mm", 8.0))
    D_rotor_mm = float(payload.get("rotor_diameter_mm", 60.0))
    eta_pump = float(payload.get("pump_efficiency", 0.75))
    n_rollers = int(payload.get("num_rollers", 3))

    # Volume per revolution
    A_tube_mm2 = math.pi * (D_tube_id_mm / 2.0) ** 2  # mm²
    L_per_rev_mm = math.pi * D_rotor_mm  # mm
    V_per_rev_ml = (A_tube_mm2 * L_per_rev_mm) / 1000.0   # mm³ → ml

    # Stall volume between rollers reduces effective flow
    # Effective V_per_rev = V_geometric × stall_factor (typical 0.95)
    stall_factor = 0.95
    V_eff_ml = V_per_rev_ml * stall_factor

    # RPM to achieve target flow
    rpm = Q_ml_min / max(1e-6, V_eff_ml)

    # Pressure × flow rate = hydraulic power
    Q_m3_s = Q_ml_min * 1e-6 / 60.0
    P_pa = P_head_mmhg * MMHG_TO_PA
    P_hydraulic_w = Q_m3_s * P_pa

    # Tubing compression force (estimated 30 N per roller for standard dialysis tubing)
    f_compress_per_roller = 30.0  # N
    f_compress_total = f_compress_per_roller * n_rollers
    R_rotor_m = D_rotor_mm * 1e-3 / 2.0
    T_compress_nm = f_compress_total * R_rotor_m * 0.3  # 0.3 = effective lever arm fraction

    # Hydraulic torque
    omega = (rpm / 60.0) * 2.0 * math.pi
    T_hydraulic_nm = P_hydraulic_w / max(1e-6, omega * eta_pump)

    # Total motor torque
    T_motor_nm = T_compress_nm + T_hydraulic_nm
    T_motor_ncm = T_motor_nm * 100.0

    # Hemolysis risk
    # Wall shear in tubing: τ = 4 × μ × Q / (π × r³) for Poiseuille flow
    mu_blood = 0.003  # Pa·s (whole blood viscosity)
    r_tube_m = D_tube_id_mm * 1e-3 / 2.0
    tau_wall = (4.0 * mu_blood * Q_m3_s) / (math.pi * r_tube_m ** 3)
    # Exposure time: tubing length / velocity
    v_tube_m_s = Q_m3_s / (math.pi * r_tube_m ** 2)
    tube_length_m = 1.5  # typical arterial line length
    t_exposure_s = tube_length_m / max(1e-6, v_tube_m_s)

    # NIH hemolysis index (Giersiepen 1990) %
    HI_pct = 3.62e-7 * (tau_wall ** 2.416) * (t_exposure_s ** 0.785)

    if HI_pct < 0.005:
        risk = "low"
    elif HI_pct < 0.05:
        risk = "moderate"
    else:
        risk = "high"

    # Worked calculations — clean arithmetic steps only.
    # Transcendentals (tau_wall via pi/r^3, HI power-law) are passed as opaque
    # inputs to downstream steps and not themselves shown as worked steps.
    V_per_rev_r = round(V_per_rev_ml, 4)
    V_eff_r = round(V_eff_ml, 4)
    rpm_r = round(rpm, 2)
    P_hydraulic_r = round(P_hydraulic_w, 3)
    T_compress_r = round(T_compress_nm, 4)
    # Derive T_hydraulic_r from the rounded P_hydraulic_r and rounded omega so
    # that the substitution (P_hydraulic / (omega x eta_pump)) reproduces the
    # stated result exactly — avoids the 0.39% non-reconciliation from using
    # the raw P_hydraulic_w.
    omega_r = round(omega, 4)
    T_hydraulic_r = round(P_hydraulic_r / max(1e-6, omega_r * eta_pump), 4)
    T_motor_r = round(T_compress_r + T_hydraulic_r, 5)
    T_motor_ncm_r = round(T_motor_r * 100.0, 3)

    worked = [
        worked_calc(
            label="Geometric volume per revolution",
            formula="V_per_rev = (A_tube x L_per_rev) / 1000",
            values={
                "A_tube": (round(A_tube_mm2, 4), "mm2"),
                "L_per_rev": (round(L_per_rev_mm, 4), "mm"),
            },
            result=V_per_rev_r, result_unit="ml",
            assumptions=[
                "A_tube = pi x (ID/2)^2 (circular cross-section)",
                "L_per_rev = pi x D_rotor (one full circumferential path)",
                "1 mm3 = 0.001 ml",
            ],
        ),
        worked_calc(
            label="Effective volume per revolution (stall correction)",
            formula="V_eff = V_per_rev x stall_factor",
            values={
                "V_per_rev": (V_per_rev_r, "ml"),
                "stall_factor": (stall_factor, ""),
            },
            result=V_eff_r, result_unit="ml",
            assumptions=["stall_factor = 0.95 — typical for 3-roller peristaltic head (stagnant volume between rollers)"],
        ),
        worked_calc(
            label="Pump speed to deliver target flow",
            formula="rpm = Q_ml_min / V_eff",
            values={
                "Q_ml_min": (Q_ml_min, "ml/min"),
                "V_eff": (V_eff_r, "ml/rev"),
            },
            result=rpm_r, result_unit="rpm",
            assumptions=["linear relationship between RPM and volumetric flow"],
        ),
        worked_calc(
            label="Hydraulic power",
            formula="P_hydraulic = Q_m3_s x P_pa",
            values={
                "Q_m3_s": (round(Q_m3_s, 9), "m3/s"),
                "P_pa": (round(P_pa, 1), "Pa"),
            },
            result=P_hydraulic_r, result_unit="W",
            assumptions=["Q_m3_s = Q_ml_min x 1e-6 / 60; P_pa = P_mmhg x 133.322"],
        ),
        worked_calc(
            label="Tubing compression torque",
            formula="T_compress = f_compress_total x R_rotor x 0.3",
            values={
                "f_compress_total": (f_compress_total, "N"),
                "R_rotor": (round(R_rotor_m, 4), "m"),
            },
            result=T_compress_r, result_unit="N·m",
            assumptions=[
                "f_compress_per_roller = 30 N (standard dialysis tubing, empirical)",
                "0.3 = effective lever arm fraction",
                f"n_rollers = {n_rollers}",
            ],
        ),
        worked_calc(
            label="Hydraulic torque",
            formula="T_hydraulic = P_hydraulic / (omega x eta_pump)",
            values={
                "P_hydraulic": (P_hydraulic_r, "W"),
                "omega": (omega_r, "rad/s"),
                "eta_pump": (eta_pump, ""),
            },
            result=T_hydraulic_r, result_unit="N·m",
            assumptions=["omega = (rpm/60) x 2 x pi"],
        ),
        worked_calc(
            label="Total motor torque",
            formula="T_motor = T_compress + T_hydraulic",
            values={
                "T_compress": (T_compress_r, "N·m"),
                "T_hydraulic": (T_hydraulic_r, "N·m"),
            },
            result=T_motor_r, result_unit="N·m",
            assumptions=[],
        ),
        worked_calc(
            label="Motor torque in N·cm",
            formula="T_motor_ncm = T_motor x 100",
            values={
                "T_motor": (T_motor_r, "N·m"),
            },
            result=T_motor_ncm_r, result_unit="N·cm",
            assumptions=["1 N·m = 100 N·cm"],
        ),
    ]

    return {
        "pump_rpm": rpm_r,
        "motor_torque_ncm": T_motor_ncm_r,
        "motor_torque_nm": T_motor_r,
        "hemolysis_risk_score": risk,
        "hemolysis_index_pct": round(HI_pct, 6),
        "wall_shear_stress_pa": round(tau_wall, 2),
        "exposure_time_s": round(t_exposure_s, 3),
        "target_flow_ml_min": Q_ml_min,
        "pressure_head_mmhg": P_head_mmhg,
        "hydraulic_power_w": P_hydraulic_r,
        "volume_per_rev_ml": V_eff_r,
        "v_per_rev_geometric_ml": V_per_rev_r,
        "tubing_id_mm": D_tube_id_mm,
        "rotor_diameter_mm": D_rotor_mm,
        "num_rollers": n_rollers,
        "pump_efficiency": eta_pump,
        "torque_compression_nm": T_compress_r,
        "torque_hydraulic_nm": T_hydraulic_r,
        "tube_velocity_m_s": round(v_tube_m_s, 3),
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
