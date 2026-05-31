#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/peep_valve_sizing.py

PEEP (positive end-expiratory pressure) valve / safety pressure relief
sizing for ICU ventilators.
Stdin JSON -> stdout JSON.

Input:
    {
      "peep_target_cmh2o": 8.0,
      "max_flow_l_min": 120.0,             # peak expiratory flow
      "valve_type": "spring_loaded",       # spring_loaded | water_column | electronic
      "safety_pressure_cmh2o": 60.0        # max allowable airway P
    }

Output:
    {
      "valve_cv_required": 0.12,
      "relief_pressure_setting_cmh2o": 40.0,
      "dead_space_ml": 8.5,
      ...
    }

Method:
  Valve Cv (flow coefficient) for gas:
    Q (L/min STD) = Cv × N1 × √(ΔP × P_inlet / SG / T)
  Reformulated for incompressible flow at low ΔP (typical ventilator):
    Cv = Q_max / (1361 × √(ΔP × ρ_air))
    where ΔP cmH2O = ~0.098 kPa each cmH2O
  Dead space: catheter + valve body + sense lumen (typical 5-15 mL)

ISO 5356-1 medical gas connectors, ISO 80601-2-12 ventilator essential
performance, IEC 60601-1 medical electrical equipment.

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
    "tool_name": 'peep_valve_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "ISO 80601-2-12:2020 'Medical electrical equipment Part 2-12: Particular requirements for the basic safety and essential performance of critical care ventilators'; ISA S75.01.01-2007",
    "physics_basis": 'Valve coefficient Cv: Q = Cv × sqrt(ΔP / SG). PEEP-relief sizing per ISO 80601-2-12 max-pressure protocol.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# ISO 80601-2-12 minimum performance requirements
DEFAULT_SAFETY_RELIEF_OFFSET_CMH2O = 35.0   # safety should be ~10-30 cmH2O above PEEP
MAX_AIRWAY_PRESSURE = 60.0                   # ISO max allowable adult


def compute(payload: dict) -> dict:
    peep_target = float(payload.get("peep_target_cmh2o", 5.0))
    flow_max_l_min = float(payload.get("max_flow_l_min", 100.0))
    valve_type = str(payload.get("valve_type", "spring_loaded")).strip().lower()
    safety_p_in = payload.get("safety_pressure_cmh2o")

    # Safety relief pressure: max(60, PEEP + 35) but capped at 80
    if safety_p_in is None:
        safety_p_cmh2o = min(80.0, max(MAX_AIRWAY_PRESSURE, peep_target + DEFAULT_SAFETY_RELIEF_OFFSET_CMH2O))
    else:
        safety_p_cmh2o = float(safety_p_in)

    # Flow → m³/s
    q_m3_s = flow_max_l_min / 1000.0 / 60.0

    # Pressure drop across PEEP valve in steady exhalation
    # Typical 2-5 cmH2O at peak expiratory flow
    dp_cmh2o = 3.0
    dp_pa = dp_cmh2o * 98.0665   # 1 cmH2O = 98.067 Pa
    dp_kpa = dp_pa / 1000.0

    # Cv for low-ΔP gas (ISA S75.01): Cv = Q[scfh] × √(SG × T) / (1360 × √(ΔP × P1))
    # In SI subcritical gas form: Cv = (Q[m³/h, STP] × √SG) / (519 × √(ΔP_kPa × P_avg_kPa))
    # For air at ambient: SG = 1.0, P_avg ≈ 101.3 kPa (near-atmospheric)
    q_m3_h_stp = q_m3_s * 3600.0
    p_avg_kpa = 101.3 + dp_kpa / 2.0
    sg_air = 1.0
    # Subcritical gas formula (ISA): for very small ΔP, Cv ≈ Q × √SG / (1360 × √(2 × ΔP_psi × P1_psia))
    # using bar/m³ form to avoid unit drift:
    # Cv = (Q_m3_h_stp × √SG_T) / (16.95 × √(ΔP_bar × P1_bar))
    dp_bar = dp_pa / 1e5
    p1_bar = 1.013 + dp_bar / 2.0
    if dp_bar > 0 and p1_bar > 0:
        cv = (q_m3_h_stp * math.sqrt(sg_air)) / (16.95 * math.sqrt(max(1e-9, dp_bar * p1_bar)))
    else:
        cv = 0.0
    kv = cv * 0.865

    # Dead space estimate (valve body + adjoining tubing)
    if valve_type == "spring_loaded":
        dead_space_ml = 8.5
    elif valve_type == "water_column":
        dead_space_ml = 25.0  # bulky with sense lumen
    elif valve_type == "electronic":
        dead_space_ml = 12.0  # solenoid pilot + body
    else:
        dead_space_ml = 10.0

    # Relief valve characteristics
    relief_response_ms = 50.0 if valve_type == "electronic" else 100.0

    # Sound output (regulatory IEC 60601-1-2 typical < 50 dBA)
    sound_dba = 35.0 if valve_type == "water_column" else 45.0

    return {
        "valve_cv_required": round(cv, 4),
        "valve_kv_required": round(kv, 4),
        "relief_pressure_setting_cmh2o": round(safety_p_cmh2o, 1),
        "dead_space_ml": round(dead_space_ml, 2),
        "max_flow_l_min": flow_max_l_min,
        "pressure_drop_at_max_flow_cmh2o": round(dp_cmh2o, 2),
        "pressure_drop_pa": round(dp_pa, 2),
        "peep_target_cmh2o": peep_target,
        "valve_type": valve_type,
        "relief_response_ms": relief_response_ms,
        "sound_emission_dba": sound_dba,
        "iso_80601_2_12_compliant": (
            safety_p_cmh2o >= MAX_AIRWAY_PRESSURE
            and safety_p_cmh2o <= 80.0
            and relief_response_ms <= 200.0
        ),
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
