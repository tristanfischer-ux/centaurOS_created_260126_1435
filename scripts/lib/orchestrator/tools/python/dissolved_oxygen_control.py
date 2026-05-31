#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/dissolved_oxygen_control.py

Dissolved oxygen (DO) control via cascade airflow + agitation.

OUR (Oxygen Uptake Rate) per organism:
- E. coli (μ_max=0.9 /h): OUR = 5-20 mmol O2/L/h at high density (10-30 g/L)
- S. cerevisiae: OUR = 5-15 mmol O2/L/h
- CHO: OUR = 0.5-2 mmol O2/L/h (much lower)
- Bacillus: OUR = 10-30 mmol O2/L/h

OTR (Oxygen Transfer Rate):
    OTR = kLa × (C* - C_L)
where:
    kLa = volumetric mass transfer coefficient (1/h)
    C* = saturation O2 concentration (~7-8 mg/L at 20°C, 1 atm air)
    C_L = current DO concentration

For DO control:
    OTR must equal or exceed OUR

kLa correlations (Van 't Riet 1979):
    kLa = 0.026 × (P/V)^0.4 × U_g^0.5   (coalescing media)
    where P/V = power per volume (W/m³), U_g = superficial gas velocity (m/s)

For airflow: U_g = Q_air / A_cross
For agitation: P depends on impeller, RPM, fluid properties

Cascade control loop (typical):
- DO setpoint: 30-40% air saturation
- Cascade input: stir RPM 100-1500
- Cascade input 2: airflow 0.5-2.0 VVM (vol gas per vol liquid per min)
- Cascade input 3: O2 supplementation (only if pure air insufficient)

References:
- Van 't Riet, "Review of Measuring Methods and Results in Non-Viscous Gas-Liquid
  Mass Transfer in Stirred Vessels", Ind Eng Chem Process Des Dev 1979
- Doran "Bioprocess Engineering" Ch.10
- Maier, Pepper, Gerba "Environmental Microbiology" 2009
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'dissolved_oxygen_control (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Doran (2013) 'Bioprocess Engineering Principles' 2nd ed., ch.10; Van 't Riet (1979) Ind. Eng. Chem.",
    "physics_basis": 'kLa-OUR balance: kLa × (C* - C) = OUR × X. Required kLa from steady-state DO target.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    volume_l = float(payload.get("working_volume_l", 100))
    kla_per_hour = float(payload.get("kla_per_hour", 200))
    do_setpoint_pct = float(payload.get("do_setpoint_pct", 30))
    our_mmol_l_h = float(payload.get("organism_our_mmol_l_h", 15))
    organism = str(payload.get("organism", "ecoli")).lower()
    temp_c = float(payload.get("temperature_c", 30))
    pressure_atm = float(payload.get("pressure_atm", 1.0))

    # Saturation O2 (mg/L) at given temp and pressure
    # Henry's law: C* = (Henry × P_O2) - simplified table
    if temp_c < 5:
        c_sat_air_mgl = 12.0
    elif temp_c < 15:
        c_sat_air_mgl = 9.5
    elif temp_c < 25:
        c_sat_air_mgl = 8.0
    elif temp_c < 35:
        c_sat_air_mgl = 7.0
    elif temp_c < 40:
        c_sat_air_mgl = 6.5
    else:
        c_sat_air_mgl = 5.5
    c_sat_air_mgl *= pressure_atm

    # mmol/L: divide by 32 g/mol × 1000 mg/g
    c_sat_air_mmol_l = c_sat_air_mgl / 32.0

    # DO at setpoint (mmol/L)
    do_setpoint_mmol_l = c_sat_air_mmol_l * (do_setpoint_pct / 100.0)

    # OTR required = OUR (in steady state)
    otr_required = our_mmol_l_h

    # kLa required: OTR = kLa × (C* - C_L)
    # → kLa = OTR / (C* - C_L)
    driving_force = c_sat_air_mmol_l - do_setpoint_mmol_l
    if driving_force <= 0:
        return {"error": "DO setpoint at or above saturation - cannot maintain"}
    kla_required = otr_required / driving_force

    kla_adequate = kla_per_hour >= kla_required

    # Cascade control parameters
    # 1. VVM (volumetric gas flow per minute per working volume)
    # Higher VVM → higher Ug → higher kLa
    # For 0.5-1.5 VVM typical, U_g ≈ VVM × height/60
    typical_vessel_height_m = (volume_l / 1000) ** (1/3) * 1.5   # rough cylinder estimate
    vvm_target = max(0.3, kla_required / 200)   # rough: 200/h per VVM
    airflow_lpm = vvm_target * volume_l

    # 2. Agitation RPM (Doran Eq 9.31)
    # Higher P/V → higher kLa
    # For Rushton impeller: P/V = (5 × N³ × D⁵) / V
    # Target P/V depending on kLa target
    if kla_required < 100:
        target_p_v_w_m3 = 200
    elif kla_required < 300:
        target_p_v_w_m3 = 800
    elif kla_required < 600:
        target_p_v_w_m3 = 2000
    else:
        target_p_v_w_m3 = 5000

    # Solve for RPM (very approximate, assumes Rushton + D = 0.4 × T)
    target_p_w = target_p_v_w_m3 * (volume_l / 1000)
    # Power = Np × ρ × N³ × D⁵; Np = 5, ρ = 1000, D = 0.15m
    d_imp = 0.15
    np_rushton = 5.0
    rpm_required = ((target_p_w / (np_rushton * 1000 * d_imp ** 5)) ** (1/3)) * 60 if target_p_w > 0 else 100
    rpm_required = max(100, min(1500, rpm_required))

    # DO response time: τ = 1 / kLa  (very fast for high kLa)
    do_response_time_s = 3600 / max(1, kla_per_hour)

    # Oxygen enrichment requirement
    o2_supplementation_needed = kla_required > 800

    return {
        "working_volume_l": volume_l,
        "kla_per_hour_available": kla_per_hour,
        "kla_required_per_hour": round(kla_required, 1),
        "kla_adequate": kla_adequate,
        "our_mmol_l_h": our_mmol_l_h,
        "do_setpoint_pct": do_setpoint_pct,
        "do_setpoint_mmol_l": round(do_setpoint_mmol_l, 3),
        "do_setpoint_mgl": round(do_setpoint_mmol_l * 32, 2),
        "c_sat_air_mgl": round(c_sat_air_mgl, 2),
        "c_sat_air_mmol_l": round(c_sat_air_mmol_l, 3),
        "otr_required_mmol_l_h": round(otr_required, 1),
        "driving_force_mmol_l": round(driving_force, 3),
        "airflow_vvm_required": round(vvm_target, 2),
        "airflow_lpm": round(airflow_lpm, 1),
        "agitation_speed_rpm": round(rpm_required, 0),
        "target_p_v_w_m3": target_p_v_w_m3,
        "do_response_time_s": round(do_response_time_s, 1),
        "o2_supplementation_needed": o2_supplementation_needed,
        "organism": organism,
        "temperature_c": temp_c,
        "pressure_atm": pressure_atm,
        "notes": (
            "Cascade: DO controller → airflow (primary) → agitation (secondary) → "
            "O2 supplementation (last resort). VVM typical 0.5-1.5 for stirred tank. "
            "Above 800 /h kLa, pure air saturates; needs O2 enrichment. "
            "Foam control mandatory at high VVM (mechanical breaker + antifoam dosing)."
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
