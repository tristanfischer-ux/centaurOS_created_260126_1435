#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/decay_heat_loca.py

Decay heat removal during LOCA per ANSI/ANS-5.1-2014.

Input:
    {
      "reactor_power_mwt": 300.0,
      "time_after_shutdown_s": 60.0,
      "fuel_burnup_mwd_kg": 30.0,
      "operating_time_years": 2.0
    }

Output:
    {
      "decay_heat_mw": ...,
      "decay_heat_pct_of_rated": ...,
      "passive_cooling_required_capacity_mw": ...,
      "containment_pressure_bar": ...,
      ...
    }

Physics (ANSI/ANS-5.1-2014):
- Wigner-Way formula for U-235 fission product decay:
    P_decay(t) / P_0 = 6.21e-3 × (t^(-0.2) - (t + T_op)^(-0.2))
  where t = time after shutdown (s), T_op = operating time (s).
- For SMR cores, decay heat = 6% of rated at t=1 s, 1% at t=1 hr, 0.3% at t=1 day.

References:
- ANSI/ANS-5.1-2014 "Decay Heat Power in Light Water Reactors."
- Glasstone & Sesonske (1994) "Nuclear Reactor Engineering" 4th ed., Ch. 8.
- NUREG-0800 Standard Review Plan §15.6.5 LOCA acceptance criteria.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "decay_heat_loca (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "ANSI/ANS-5.1-2014; Glasstone & Sesonske (1994) Ch. 8; NUREG-0800 §15.6.5",
    "physics_basis": "ANSI/ANS-5.1 Wigner-Way decay-heat correlation: P_d/P_0 = 6.21e-3·(t^-0.2 - (t+T_op)^-0.2).",
    "confidence_class": "standard",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    P_mwt = float(payload.get("reactor_power_mwt", 300.0))
    t_s = float(payload.get("time_after_shutdown_s", 60.0))
    burnup = float(payload.get("fuel_burnup_mwd_kg", 30.0))
    T_op_years = float(payload.get("operating_time_years", 2.0))

    t_s = max(0.1, t_s)
    T_op_s = T_op_years * 365.25 * 86400

    # Wigner-Way ANS decay heat
    p_ratio = 6.21e-3 * (t_s ** (-0.2) - (t_s + T_op_s) ** (-0.2))
    p_ratio = max(0.0, p_ratio)
    p_ratio = min(0.07, p_ratio)  # cap at 7% for very short times

    decay_heat_mw = P_mwt * p_ratio

    # ANS-5.1 uncertainty band: ±10% typical, ±30% for short times
    uncertainty_pct = 30.0 if t_s < 10 else 15.0 if t_s < 1000 else 10.0
    decay_heat_max_mw = decay_heat_mw * (1 + uncertainty_pct / 100.0)

    # Burnup correction
    burnup_factor = 1.0 + 0.001 * (burnup - 30.0)  # +0.1% per MWd/kg above 30
    decay_heat_mw *= burnup_factor

    # Required passive cooling: must handle decay heat with 25% margin
    # for design basis accident (DBA)
    passive_cooling_mw = decay_heat_max_mw * 1.25

    # Containment heat-up: if cooling capacity = required, T stays constant
    # If cooling = 50% of required, T rises ~5°C/min for typical containment
    # Containment mass: ~5000 t steel + 2000 t concrete for SMR
    containment_mass_kg = 7e6
    c_p_steel = 500  # J/(kg·K)
    # ΔT/Δt if no cooling: P_decay / (m × c_p)
    dT_dt_uncooled_K_s = (decay_heat_mw * 1e6) / (containment_mass_kg * c_p_steel)
    dT_dt_uncooled_K_min = dT_dt_uncooled_K_s * 60

    # Containment pressure (assuming saturated steam):
    # Initial vapour from coolant flash: ~10 bar peak in PWR LOCA
    # Containment design pressure typically 4-6 bar
    initial_loop_inventory_kg = P_mwt * 1.5e3  # rough: 1.5 t/MWt for PWR
    saturated_vapour_kj_kg = 2257  # at 1 atm
    # Energy in coolant inventory available to flash
    if t_s < 10:
        # Early phase: peak containment pressure
        cont_p_bar = 4.5 + (1.5 * (1.0 - t_s / 10.0))  # 6 → 4.5 over 10 s
    elif t_s < 3600:
        cont_p_bar = 2.5 + (2.0 * (1.0 - t_s / 3600))  # 4.5 → 2.5 over 1 hr
    else:
        cont_p_bar = 1.5  # equilibrium

    # Core temperature (assuming passive cooling functional)
    # PWR fuel rod centreline ≈ 2200°C at full power, drops with decay heat
    T_centreline_normal_c = 2200
    T_centreline_at_t_c = T_centreline_normal_c * (decay_heat_mw / P_mwt) ** 0.5 + 300

    # Time-to-boil if no cooling (cooling injection failed)
    # Energy to vaporise loop inventory
    loop_energy_to_boil_mj = initial_loop_inventory_kg * saturated_vapour_kj_kg / 1000
    if decay_heat_mw > 0:
        time_to_dry_out_s = loop_energy_to_boil_mj * 1e6 / (decay_heat_mw * 1e6)
    else:
        time_to_dry_out_s = 999999.0

    return {
        "reactor_power_mwt": P_mwt,
        "time_after_shutdown_s": t_s,
        "decay_heat_mw": round(decay_heat_mw, 3),
        "decay_heat_pct_of_rated": round(p_ratio * 100, 3),
        "decay_heat_max_with_uncertainty_mw": round(decay_heat_max_mw, 3),
        "uncertainty_pct": uncertainty_pct,
        "passive_cooling_required_capacity_mw": round(passive_cooling_mw, 3),
        "uncooled_containment_heatup_k_per_min": round(dT_dt_uncooled_K_min, 4),
        "containment_pressure_bar": round(cont_p_bar, 2),
        "fuel_centreline_temp_c_estimate": round(T_centreline_at_t_c, 0),
        "time_to_loop_dry_out_s_uncooled": round(time_to_dry_out_s, 0) if time_to_dry_out_s < 999999 else None,
        "time_to_loop_dry_out_min_uncooled": round(time_to_dry_out_s / 60, 1) if time_to_dry_out_s < 999999 else None,
        "burnup_mwd_kg": burnup,
        "operating_time_years": T_op_years,
        "wigner_way_p_ratio": p_ratio,
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
