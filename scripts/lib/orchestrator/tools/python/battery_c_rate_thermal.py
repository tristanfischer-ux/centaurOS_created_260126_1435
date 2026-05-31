#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/battery_c_rate_thermal.py

Battery cell thermal model under high C-rate (drone / EV / power tools).

Cell heat generation:
    Q_gen = I² × R_internal + I × η_polarisation
For LiPo at 30C: I = 30 × capacity_Ah; R = 3-8 mΩ; heating 10-50 W/cell.

Temperature rise:
    ΔT/dt = (Q_gen - Q_dissipated) / (m × c_p)
where c_p ≈ 1100 J/(kg·K) for typical cell.

Cooling mechanisms:
- Passive (air natural convection): h ~ 5-10 W/m²K
- Forced air (fan): h ~ 30-80 W/m²K
- Liquid cold plate: h ~ 200-500 W/m²K, very effective

Capacity loss per flight at high C:
- C-rate × temp interaction: 30C @ 60°C cycle = +0.15% loss per flight
- 50C cycling: capacity drops 30% in 100 cycles
- LiPo failure mode: thermal runaway > 130°C cell temp

Max safe C-rate by cooling:
- Passive air: 5-10C
- Forced air: 15-25C
- Liquid: 30-50C+

References:
- Jeffers et al, "Drone batteries: cycle vs flight life", IEEE Electrification
  Magazine 2020
- Wang et al, "Thermal runaway caused fire and explosion of lithium ion
  battery", J Power Sources 2012
- Doyle, Fuller, Newman 1993 - Pseudo-2D battery model
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'battery_c_rate_thermal (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Bandhauer, Garimella, Fuller (2011), 'A Critical Review of Thermal Issues in Lithium-Ion Batteries', J. Electrochem. Soc. 158(3):R1-R25",
    "tool_doi": '10.1149/1.3515880',
    "physics_basis": 'Cell heat generation Q = I² × R + |T × dV/dT| × I. Thermal runaway onset T_onset chemistry-dependent (NMC ~150°C, LFP ~270°C).',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    cell_capacity_ah = float(payload.get("cell_capacity_ah", 1.5))
    c_rate = float(payload.get("c_rate", 30))
    cooling = str(payload.get("cooling", "passive")).lower()
    ambient_c = float(payload.get("ambient_c", 25))
    flight_duration_min = float(payload.get("flight_duration_min", 12))
    cell_internal_resistance_mohm = float(payload.get("cell_internal_resistance_mohm", 4))

    # Discharge current
    current_a = c_rate * cell_capacity_ah

    # Heat generation (W/cell)
    # Q = I² × R
    r_ohm = cell_internal_resistance_mohm / 1000.0
    q_resistive = current_a ** 2 * r_ohm
    # Polarisation losses (~10% extra at high C)
    q_polarisation = q_resistive * 0.10
    q_total_w = q_resistive + q_polarisation

    # Cell properties (assume 18650-class or LiPo equivalent)
    # 18650: 45g, surface area ~25 cm² = 0.0025 m²
    # LiPo (3Ah): 80g, surface area ~80 cm² = 0.008 m²
    if cell_capacity_ah <= 0.5:
        cell_mass_kg = 0.020
        cell_surface_m2 = 0.0015
    elif cell_capacity_ah <= 3.0:
        cell_mass_kg = 0.045
        cell_surface_m2 = 0.0025
    else:
        cell_mass_kg = 0.080
        cell_surface_m2 = 0.008

    # Cooling coefficient h (W/m²K)
    h_cooling = {
        "passive": 8.0,
        "air": 8.0,
        "fan": 50.0,
        "forced_air": 50.0,
        "liquid": 350.0,
        "cold_plate": 400.0,
    }.get(cooling, 8.0)

    # Steady-state temp rise (no heat capacity buffering, just balance)
    # Q_gen = h × A × ΔT
    steady_dt_K = q_total_w / (h_cooling * cell_surface_m2)
    steady_temp_c = ambient_c + steady_dt_K

    # Transient: ΔT(t) = ΔT_ss × (1 - exp(-t/τ))
    # τ = mc_p / (h × A)
    cp_battery = 1100
    tau_s = (cell_mass_kg * cp_battery) / (h_cooling * cell_surface_m2)
    flight_s = flight_duration_min * 60.0
    actual_dt = steady_dt_K * (1 - math.exp(-flight_s / tau_s))
    actual_temp_c = ambient_c + actual_dt

    # Capacity loss per flight:
    # Empirical for LiPo: ~ 0.001% × C × (T - 25)² per cycle for T > 25°C
    if actual_temp_c > 25:
        capacity_loss_pct_per_flight = 0.0001 * c_rate * (actual_temp_c - 25) ** 2
    else:
        capacity_loss_pct_per_flight = 0.0001 * c_rate

    # Safety classification
    if actual_temp_c < 50:
        safety_status = "SAFE"
    elif actual_temp_c < 70:
        safety_status = "CAUTION - degraded cycle life"
    elif actual_temp_c < 90:
        safety_status = "WARNING - rapid degradation"
    elif actual_temp_c < 130:
        safety_status = "DANGER - venting risk"
    else:
        safety_status = "CRITICAL - thermal runaway likely"

    # Recommended max C-rate for this cooling solution to stay under 60°C
    target_dt = 60 - ambient_c
    if target_dt > 0:
        target_q = h_cooling * cell_surface_m2 * target_dt
        # Q = I²R → I = sqrt(Q/R), C = I/cap
        max_current = math.sqrt(target_q / r_ohm)
        recommended_max_c = max_current / cell_capacity_ah
    else:
        recommended_max_c = 1.0

    return {
        "cell_capacity_ah": cell_capacity_ah,
        "c_rate": c_rate,
        "current_a": round(current_a, 1),
        "cell_internal_resistance_mohm": cell_internal_resistance_mohm,
        "heat_generated_resistive_w": round(q_resistive, 2),
        "heat_generated_polarisation_w": round(q_polarisation, 2),
        "heat_generated_total_w": round(q_total_w, 2),
        "cooling": cooling,
        "h_cooling_w_m2k": h_cooling,
        "cell_mass_kg": cell_mass_kg,
        "cell_surface_area_m2": cell_surface_m2,
        "ambient_c": ambient_c,
        "steady_state_temp_rise_k": round(steady_dt_K, 1),
        "steady_state_temp_c": round(steady_temp_c, 1),
        "actual_temp_rise_at_end_flight_k": round(actual_dt, 1),
        "cell_temp_at_end_flight_c": round(actual_temp_c, 1),
        "thermal_time_constant_s": round(tau_s, 1),
        "flight_duration_min": flight_duration_min,
        "safety_status": safety_status,
        "capacity_loss_pct_per_flight": round(capacity_loss_pct_per_flight, 4),
        "recommended_max_c_rate": round(recommended_max_c, 1),
        "max_c_rate_within_cooling": recommended_max_c >= c_rate,
        "thermal_runaway_temp_c": 130,
        "vent_threshold_c": 90,
        "notes": (
            "Heat = I²R + polarisation losses. Transient temp uses lumped capacity. "
            "Capacity loss accelerates above 45°C; thermal runaway above 130°C "
            "(separator failure → internal short). For drones: 30C OK with forced "
            "air for short bursts; passive cooling limits to ~10C continuous."
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
