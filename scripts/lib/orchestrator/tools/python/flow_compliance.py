#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/flow_compliance.py

ICU ventilator: patient-side flow + pressure waveform from tidal volume,
PEEP, compliance, and resistance.
Stdin JSON -> stdout JSON.

Input:
    {
      "tidal_volume_ml": 500.0,
      "peep_cmh2o": 5.0,
      "respiratory_rate_bpm": 14.0,
      "compliance_ml_cmh2o": 50.0,           # normal adult 40-80
      "resistance_cmh2o_l_s": 5.0,            # normal adult 2-5; intubated 5-15
      "ie_ratio": 0.5,                        # I:E typically 1:2
      "waveform": "volume_constant"           # constant_flow | decelerating | pressure_control
    }

Output:
    {
      "peak_pressure_cmh2o": 28.0,
      "mean_airway_pressure_cmh2o": 10.0,
      "plateau_pressure_cmh2o": 15.0,
      "inspiratory_flow_l_min": 30.0,
      "inspiratory_time_ms": 1430,
      ...
    }

Method:
  Lung equation of motion:
    P_airway = (V_t / C) + (V_dot × R) + PEEP
  - V_t / C → elastic load
  - V_dot × R → resistive load
  - Peak occurs at end-inspiration for constant-flow VC ventilation
  - Plateau (end-inspiratory hold) = V_t/C + PEEP (resistive drops to 0)
  - Mean airway pressure: trapezoidal area under P-time curve over one
    breath ÷ total cycle time

References: West "Respiratory Physiology: The Essentials" 11th ed Ch 8,
ARDSNet ARMA Trial 2000 NEJM, FDA 21 CFR 868 (ventilator standards),
ISO 80601-2-12:2020 ICU ventilator essential safety + performance.

License: MIT.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'flow_compliance (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "West (2012), 'Respiratory Physiology: The Essentials' 11th ed., Lippincott",
    "physics_basis": 'Lung compliance C = ΔV / ΔP. Equation of motion: P_aw = V/C + R × V_dot + PEEP. PIP = P_plat + R × flow_peak.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    V_t_ml = float(payload.get("tidal_volume_ml", 500.0))
    peep_cmh2o = float(payload.get("peep_cmh2o", 5.0))
    rr_bpm = float(payload.get("respiratory_rate_bpm", 14.0))
    C_ml_cmh2o = float(payload.get("compliance_ml_cmh2o", 50.0))
    R_cmh2o_l_s = float(payload.get("resistance_cmh2o_l_s", 5.0))
    ie_ratio = float(payload.get("ie_ratio", 0.5))  # I:E = 1:2 means I/E = 0.5
    waveform = str(payload.get("waveform", "volume_constant")).strip().lower()

    # Breath cycle time (s)
    T_cycle_s = 60.0 / max(0.1, rr_bpm)
    # I:E ratio: T_i / T_e = ie_ratio → T_i = T_cycle × ie_ratio / (1 + ie_ratio)
    T_i_s = T_cycle_s * (ie_ratio / (1.0 + ie_ratio))
    T_e_s = T_cycle_s - T_i_s

    # Inspiratory flow (L/s) for constant-flow VC:
    # V_t (L) = V_dot × T_i → V_dot = V_t / T_i
    V_t_l = V_t_ml / 1000.0
    V_dot_l_s = V_t_l / max(0.01, T_i_s)
    insp_flow_l_min = V_dot_l_s * 60.0

    # Elastic pressure: V_t / C (cmH2O)
    P_elastic = V_t_ml / max(0.1, C_ml_cmh2o)

    # Resistive pressure: V_dot × R (cmH2O); R already in cmH2O·s/L
    P_resistive = V_dot_l_s * R_cmh2o_l_s

    # Peak pressure (PIP)
    if waveform in ("constant_flow", "volume_constant"):
        P_peak = peep_cmh2o + P_elastic + P_resistive
    elif waveform == "decelerating":
        # Decelerating flow has lower peak — about 15% reduction
        P_peak = peep_cmh2o + P_elastic + P_resistive * 0.85
    elif waveform == "pressure_control":
        # Target pressure ≈ elastic + PEEP; resistive contributes only during ramp
        P_peak = peep_cmh2o + P_elastic
    else:
        P_peak = peep_cmh2o + P_elastic + P_resistive

    # Plateau pressure (during inspiratory hold)
    P_plateau = peep_cmh2o + P_elastic

    # Mean airway pressure: trapezoidal area
    # For constant-flow VC + 0 hold: ramp 0 → P_peak over T_i, decay during T_e
    # Approximation: P_mean = PEEP + (P_plateau - PEEP) × T_i / T_cycle
    P_mean = peep_cmh2o + (P_plateau - peep_cmh2o) * (T_i_s / T_cycle_s)

    # Volume-minute
    V_min_l_min = (V_t_ml / 1000.0) * rr_bpm

    # Time constant tau = R × C (s) — important for expiratory adequacy
    # R cmH2O·s/L × C ml/cmH2O = ml·s/L = ms → divide by 1000
    tau_s = (R_cmh2o_l_s * C_ml_cmh2o) / 1000.0

    # Auto-PEEP risk: if T_e < 3 × tau, exhalation incomplete
    auto_peep_risk = T_e_s < 3.0 * tau_s

    T_cycle_r = round(T_cycle_s, 4)
    T_i_r = round(T_i_s, 4)
    V_dot_r = round(V_dot_l_s, 4)
    insp_flow_r = round(insp_flow_l_min, 2)
    P_el_r = round(P_elastic, 2)
    P_res_r = round(P_resistive, 2)
    P_peak_r = round(P_peak, 2)
    P_plat_r = round(P_plateau, 2)
    P_mean_r = round(P_mean, 2)
    tau_r = round(tau_s, 4)

    worked = [
        worked_calc(
            label="Breath cycle time",
            formula="T_cycle = 60 / RR",
            values={"RR": (rr_bpm, "breaths/min")},
            result=T_cycle_r, result_unit="s",
            assumptions=["RR = respiratory rate in breaths per minute"],
        ),
        worked_calc(
            label="Inspiratory time",
            formula="T_i = T_cycle x (IE / (1 + IE))",
            values={"T_cycle": (T_cycle_r, "s"), "IE": (ie_ratio, "")},
            result=T_i_r, result_unit="s",
            assumptions=["IE = I:E ratio; I:E = 1:2 gives IE = 0.5"],
        ),
        worked_calc(
            label="Inspiratory flow rate",
            formula="V_dot = V_t_L / T_i",
            values={"V_t_L": (round(V_t_l, 4), "L"), "T_i": (T_i_r, "s")},
            result=V_dot_r, result_unit="L/s",
            assumptions=["constant-flow volume-control; V_t_L = V_t_ml / 1000"],
        ),
        worked_calc(
            label="Elastic pressure (lung recoil)",
            formula="P_el = V_t_ml / C",
            values={"V_t_ml": (V_t_ml, "mL"), "C": (C_ml_cmh2o, "mL/cmH2O")},
            result=P_el_r, result_unit="cmH2O",
            assumptions=["compliance C = delta_V / delta_P"],
        ),
        worked_calc(
            label="Resistive pressure",
            formula="P_res = V_dot x R",
            values={"V_dot": (V_dot_r, "L/s"), "R": (R_cmh2o_l_s, "cmH2O.s/L")},
            result=P_res_r, result_unit="cmH2O",
            assumptions=["R already in cmH2O per L/s"],
        ),
        worked_calc(
            label="Peak inspiratory pressure (PIP)",
            formula="PIP = PEEP + P_el + P_res",
            values={
                "PEEP": (peep_cmh2o, "cmH2O"),
                "P_el": (P_el_r, "cmH2O"),
                "P_res": (P_res_r, "cmH2O"),
            },
            result=P_peak_r, result_unit="cmH2O",
            assumptions=["constant-flow VC waveform; decelerating/PC waveforms reduce P_res contribution"],
        ),
        worked_calc(
            label="Plateau pressure (end-inspiratory hold)",
            formula="P_plat = PEEP + P_el",
            values={"PEEP": (peep_cmh2o, "cmH2O"), "P_el": (P_el_r, "cmH2O")},
            result=P_plat_r, result_unit="cmH2O",
            assumptions=["resistive component = 0 at zero flow (inspiratory pause)"],
        ),
        worked_calc(
            label="Mean airway pressure",
            formula="P_mean = PEEP + (P_plat - PEEP) x (T_i / T_cycle)",
            values={
                "PEEP": (peep_cmh2o, "cmH2O"),
                "P_plat": (P_plat_r, "cmH2O"),
                "T_i": (T_i_r, "s"),
                "T_cycle": (T_cycle_r, "s"),
            },
            result=P_mean_r, result_unit="cmH2O",
            assumptions=["trapezoidal area approximation under P-time curve"],
        ),
        worked_calc(
            label="RC time constant (expiratory)",
            formula="tau = R x C / 1000",
            values={"R": (R_cmh2o_l_s, "cmH2O.s/L"), "C": (C_ml_cmh2o, "mL/cmH2O")},
            result=tau_r, result_unit="s",
            assumptions=["R x C = cmH2O.s/L x mL/cmH2O = mL.s/L = ms; /1000 to convert to s"],
        ),
    ]

    return {
        "peak_pressure_cmh2o": P_peak_r,
        "mean_airway_pressure_cmh2o": P_mean_r,
        "plateau_pressure_cmh2o": P_plat_r,
        "inspiratory_flow_l_min": insp_flow_r,
        "inspiratory_time_ms": round(T_i_s * 1000.0, 1),
        "expiratory_time_ms": round(T_e_s * 1000.0, 1),
        "cycle_time_ms": round(T_cycle_s * 1000.0, 1),
        "ie_ratio_io_e": round(ie_ratio, 3),
        "p_elastic_cmh2o": P_el_r,
        "p_resistive_cmh2o": P_res_r,
        "minute_ventilation_l_min": round(V_min_l_min, 2),
        "rc_time_constant_s": tau_r,
        "auto_peep_risk": auto_peep_risk,
        "tidal_volume_ml": V_t_ml,
        "peep_cmh2o": peep_cmh2o,
        "respiratory_rate_bpm": rr_bpm,
        "compliance_ml_cmh2o": C_ml_cmh2o,
        "resistance_cmh2o_l_s": R_cmh2o_l_s,
        "waveform": waveform,
        "lung_protective_pp_lt_30": P_plateau < 30.0,
        "lung_protective_dp_lt_15": (P_plateau - peep_cmh2o) < 15.0,
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
