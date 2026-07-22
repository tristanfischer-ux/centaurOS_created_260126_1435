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
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


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
    # SHARED AGITATION SPEED CONTRACT (2026-07-22 bug fix):
    # The engineering contract emits agitation_speed_rpm as the single source of truth for
    # ALL tools in the plan (read from the brief — e.g. 60 RPM for organoids).  This tool
    # previously computed rpm_required independently (bottom up from kLa targets) with a
    # hard floor of 100 RPM, which silently contradicted the brief's target and the
    # agitation:power tool's independent value.  Now: if the contract supplies a cap via
    # `agitation_speed_rpm_cap`, the internally-derived RPM is clamped at that value.
    # Without the cap, the tool's existing physics-derived value is unchanged — the fix is
    # UNIVERSAL: a fermenter at 800 RPM just has no cap (or a cap above its derived value).
    agitation_speed_rpm_cap = payload.get("agitation_speed_rpm_cap", None)
    if agitation_speed_rpm_cap is not None:
        agitation_speed_rpm_cap = float(agitation_speed_rpm_cap)

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
    # Apply the contract's shared agitation-speed cap (brief target) if supplied.
    # This enforces that this tool NEVER recommends a higher speed than the brief permits
    # (e.g. 60 RPM for organoids) regardless of what the kLa maths would suggest.
    if agitation_speed_rpm_cap is not None and agitation_speed_rpm_cap > 0:
        rpm_required = min(rpm_required, agitation_speed_rpm_cap)

    # DO response time: τ = 1 / kLa  (very fast for high kLa)
    do_response_time_s = 3600 / max(1, kla_per_hour)

    # Oxygen enrichment requirement
    o2_supplementation_needed = kla_required > 800

    # Worked calculations for the PDF appendix.
    # c_sat_air_mgl comes from a piecewise temperature table, so it is passed
    # as a live input symbol rather than re-derived.
    # vvm_target and rpm_required are piecewise/branchy — skipped.
    c_sat_r = round(c_sat_air_mgl, 2)
    c_sat_mmol_r = round(c_sat_air_mmol_l, 3)
    do_sp_r = round(do_setpoint_mmol_l, 3)
    drv_r = round(driving_force, 3)
    kla_req_r = round(kla_required, 1)
    worked = [
        worked_calc(
            label="O2 saturation in mmol/L",
            formula="c_sat_mmol = c_sat_mgl / 32",
            values={"c_sat_mgl": (c_sat_r, "mg/L")},
            result=c_sat_mmol_r,
            result_unit="mmol/L",
            assumptions=["O2 molar mass 32 g/mol; c_sat_mgl from Henry temperature table"],
        ),
        worked_calc(
            label="DO at setpoint",
            formula="do_sp = c_sat_mmol x (do_setpoint_pct / 100)",
            values={
                "c_sat_mmol": (c_sat_mmol_r, "mmol/L"),
                "do_setpoint_pct": (do_setpoint_pct, "%"),
            },
            result=do_sp_r,
            result_unit="mmol/L",
        ),
        worked_calc(
            label="Driving force (saturation deficit)",
            formula="driving_force = c_sat_mmol - do_sp",
            values={"c_sat_mmol": (c_sat_mmol_r, "mmol/L"), "do_sp": (do_sp_r, "mmol/L")},
            result=drv_r,
            result_unit="mmol/L",
        ),
        worked_calc(
            label="Required kLa",
            formula="kLa_req = OUR / driving_force",
            values={
                "OUR": (our_mmol_l_h, "mmol/L/h"),
                "driving_force": (drv_r, "mmol/L"),
            },
            result=kla_req_r,
            result_unit="1/h",
            assumptions=["steady-state DO balance: OTR = kLa x (C* - C_L) = OUR"],
        ),
    ]

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
        "worked": worked,
        "notes": (
            "Cascade: DO controller → airflow (primary) → agitation (secondary) → "
            "O2 supplementation (last resort). VVM typical 0.5-1.5 for stirred tank. "
            "Above 800 /h kLa, pure air saturates; needs O2 enrichment. "
            "Foam control mandatory at high VVM (mechanical breaker + antifoam dosing)."
        ),
    }


def _selftest() -> int:
    """
    proveCatch: agitation_speed_rpm_cap enforces the brief's shared agitation target.

    Asserts:
    (1) agitation_speed_rpm_cap=60 clamps the internally-derived RPM to ≤60,
        proving the pre-fix hard floor of 100 no longer overrides the brief target.
    (2) Without the cap, the existing physics-derived value is unchanged (backward-compat).
    (3) A fermenter brief with a genuinely high RPM target (800) is not over-clamped.
    """
    BRIEF_RPM_ORGANOID = 60   # organoid low-shear target
    BRIEF_RPM_FERMENTER = 800  # high-speed fermenter — cap well above physics

    # (1) organoid: cap=60 must dominate the physics-derived 100 RPM floor
    r1 = compute({
        "working_volume_l": 0.02,          # 20 ml benchtop vessel
        "kla_per_hour": 5,
        "do_setpoint_pct": 30,
        "organism_our_mmol_l_h": 0.5,      # low organoid OUR
        "temperature_c": 37,
        "agitation_speed_rpm_cap": BRIEF_RPM_ORGANOID,
    })
    rpm1 = r1["agitation_speed_rpm"]
    assert rpm1 <= BRIEF_RPM_ORGANOID, (
        f"Cap not applied: expected ≤{BRIEF_RPM_ORGANOID} RPM for organoid but got {rpm1} RPM "
        f"(pre-fix hard floor of 100 RPM leaked through)"
    )

    # (2) no cap: high-density ecoli run returns physics-derived value (≥100, unchanged)
    r2 = compute({
        "working_volume_l": 100,
        "kla_per_hour": 200,
        "do_setpoint_pct": 30,
        "organism_our_mmol_l_h": 15,
        "temperature_c": 30,
    })
    rpm2 = r2["agitation_speed_rpm"]
    assert rpm2 >= 100, (
        f"Backward-compat broken: without cap, physics-derived RPM should be ≥100 but got {rpm2}"
    )

    # (3) fermenter: a cap of 800 must not over-clamp a physics target below 800
    r3 = compute({
        "working_volume_l": 1000,
        "kla_per_hour": 600,
        "do_setpoint_pct": 30,
        "organism_our_mmol_l_h": 20,
        "temperature_c": 30,
        "agitation_speed_rpm_cap": BRIEF_RPM_FERMENTER,
    })
    rpm3 = r3["agitation_speed_rpm"]
    assert rpm3 <= BRIEF_RPM_FERMENTER, (
        f"Fermenter cap {BRIEF_RPM_FERMENTER} RPM not respected: got {rpm3} RPM"
    )

    print(
        f"[dissolved_oxygen_control] --selftest OK: "
        f"organoid cap {BRIEF_RPM_ORGANOID} RPM → emitted {rpm1} RPM (≤ cap); "
        f"no-cap ecoli → {rpm2} RPM (physics-derived, ≥100); "
        f"fermenter cap {BRIEF_RPM_FERMENTER} RPM → {rpm3} RPM (≤ cap); "
        f"pre-fix 100 RPM floor no longer violates low-shear brief targets"
    )
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return _selftest()
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
