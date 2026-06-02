#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/spindle_thermal.py

CNC spindle thermal model: bearing heat dissipation + cooling oil flow.
Stdin JSON -> stdout JSON.

Input:
    {
      "spindle_power_kw": 15.0,
      "max_rpm": 18000,
      "bearing_type": "ceramic_hybrid",   # ceramic_hybrid | angular_contact | air
      "duty_cycle": 0.80,
      "ambient_c": 25.0
    }

Output:
    {
      "heat_dissipation_kw": 0.6,
      "bearing_temp_c": 65.0,
      "cooling_oil_lpm": 8.0,
      ...
    }

Method:
  - Bearing power loss: P_bearing ≈ μ × F × d × N
    - Ceramic hybrid: μ ≈ 0.0010-0.0015
    - Angular contact (steel): μ ≈ 0.0015-0.0025
  - For practical spindle sizing, use loss factor as % of rated power:
    - Air bearings: 0.5%
    - Ceramic hybrid: 1.5-3%
    - Steel ball: 3-5%
  - Cooling oil flow: m_oil × cp × ΔT_oil = P_loss
    Typical synthetic oil cp ≈ 2 kJ/kg·K, ρ ≈ 870 kg/m³
  - Steady-state bearing temp: T_bearing = T_oil_in + ΔT_film
    ΔT_film ~ P_bearing / (h × A_bearing)

Reference: SKF Bearing Selection Guide Ch 4 (Friction & Speed), Fischer
Spindle Catalog (Switzerland), Setco CNC Spindle Application Notes,
Kistler Cutting Force database.

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
    "tool_name": 'spindle_thermal (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'SKF Bearing Reference Catalogue; Setco Spindle Engineering Application Notes',
    "physics_basis": 'Bearing loss Q_bearing = M × ω where M is friction torque per SKF Catalogue General. Oil flow Q_oil = Q_bearing / (ρ × Cp × ΔT_acceptable).',
    "confidence_class": 'datasheet',
    "last_reviewed_date": "2026-05-22",
}


# Loss fraction of rated power as heat in bearings
BEARING_LOSS_PCT = {
    "ceramic_hybrid": 0.020,   # 2.0% of rated power
    "angular_contact": 0.040,  # 4.0%
    "deep_groove": 0.045,
    "air": 0.005,              # negligible mechanical, but cooling complex
    "magnetic": 0.003,
    "tapered_roller": 0.060,
}

# Maximum bearing temperature recommended (°C)
T_MAX_BEARING = {
    "ceramic_hybrid": 120.0,
    "angular_contact": 100.0,
    "deep_groove": 85.0,
    "air": 70.0,
    "magnetic": 80.0,
    "tapered_roller": 90.0,
}

OIL_CP_KJ_KG_K = 2.0
OIL_RHO_KG_M3 = 870.0  # ISO VG 32 synthetic spindle oil
OIL_DELTA_T_K = 8.0    # typical oil ΔT in/out for spindle chillers


def compute(payload: dict) -> dict:
    p_spindle_kw = float(payload.get("spindle_power_kw", 15.0))
    n_rpm = float(payload.get("max_rpm", 18000.0))
    bearing_type = str(payload.get("bearing_type", "ceramic_hybrid")).strip().lower()
    duty = float(payload.get("duty_cycle", 0.80))
    t_amb = float(payload.get("ambient_c", 25.0))
    bearing_temp_target_c = float(payload.get("bearing_temp_target_c", 60.0))

    if bearing_type not in BEARING_LOSS_PCT:
        bearing_type = "angular_contact"

    loss_frac = BEARING_LOSS_PCT[bearing_type]
    # Rotational speed factor — higher RPM lifts loss by sqrt of normalised speed
    # Reference 12000 rpm
    speed_factor = (n_rpm / 12000.0) ** 0.5
    p_loss_kw = p_spindle_kw * loss_frac * speed_factor * duty

    # Cooling oil flow rate
    m_dot_kg_s = (p_loss_kw * 1000.0) / (OIL_CP_KJ_KG_K * 1000.0 * OIL_DELTA_T_K)
    v_dot_m3_s = m_dot_kg_s / OIL_RHO_KG_M3
    oil_lpm = v_dot_m3_s * 1000.0 * 60.0  # m³/s → L/min

    # Bearing film temperature rise above oil
    # ΔT_film ~ P_loss / (h_oil × A_bearing); use 25 K typical film for hybrid
    delta_t_film_k = 25.0 if bearing_type == "ceramic_hybrid" else 35.0
    t_bearing_c = bearing_temp_target_c + delta_t_film_k * (p_loss_kw / max(0.1, p_spindle_kw * loss_frac))
    # Cap at material limit
    t_max = T_MAX_BEARING[bearing_type]

    # Worked calculations.
    # speed_factor uses sqrt() — skip; pass as live input to next steps.
    # p_loss_kw, m_dot_kg_s, and oil_lpm are clean products/ratios.
    speed_r = round(speed_factor, 3)
    p_loss_r = round(p_loss_kw, 4)
    m_dot_r = round(m_dot_kg_s, 4)
    oil_lpm_r = round(oil_lpm, 2)
    worked = [
        worked_calc(
            label="Bearing heat dissipation",
            formula="P_loss = P_spindle x loss_frac x speed_factor x duty",
            values={"P_spindle": (p_spindle_kw, "kW"),
                    "loss_frac": (loss_frac, ""),
                    "speed_factor": (speed_r, ""),
                    "duty": (duty, "")},
            result=p_loss_r, result_unit="kW",
            assumptions=["loss_frac from bearing type lookup (SKF catalogue)",
                         "speed_factor = (RPM/12000)^0.5 (reference speed 12,000 rpm)"],
        ),
        worked_calc(
            label="Cooling oil mass flow rate",
            formula="m_dot = P_loss x 1000 / (Cp x 1000 x dT)",
            values={"P_loss": (p_loss_r, "kW"),
                    "Cp": (OIL_CP_KJ_KG_K, "kJ/(kg*K)"),
                    "dT": (OIL_DELTA_T_K, "K")},
            result=m_dot_r, result_unit="kg/s",
            assumptions=["Cp = 2.0 kJ/(kg*K) for ISO VG 32 synthetic spindle oil",
                         "dT = 8 K oil inlet-to-outlet temperature rise"],
        ),
        worked_calc(
            label="Cooling oil volumetric flow rate",
            formula="oil_lpm = m_dot / rho x 1000 x 60",
            values={"m_dot": (m_dot_r, "kg/s"),
                    "rho": (OIL_RHO_KG_M3, "kg/m^3")},
            result=oil_lpm_r, result_unit="L/min",
            assumptions=["rho = 870 kg/m^3 for ISO VG 32 synthetic oil",
                         "multiply by 1000 (m^3 to L) and 60 (s to min)"],
        ),
    ]

    return {
        "heat_dissipation_kw": round(p_loss_kw, 4),
        "bearing_temp_c": round(min(t_max, t_bearing_c), 2),
        "bearing_temp_max_allowed_c": t_max,
        "cooling_oil_lpm": round(oil_lpm, 2),
        "cooling_oil_kg_s": round(m_dot_kg_s, 4),
        "oil_delta_t_k": OIL_DELTA_T_K,
        "loss_factor_pct": round(loss_frac * 100.0, 3),
        "speed_factor": round(speed_factor, 3),
        "duty_cycle": duty,
        "spindle_power_kw": p_spindle_kw,
        "max_rpm": n_rpm,
        "bearing_type": bearing_type,
        "feasible_with_chiller_5kw": p_loss_kw < 5.0,
        "ambient_c": t_amb,
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
