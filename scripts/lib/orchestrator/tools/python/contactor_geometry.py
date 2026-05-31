#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/contactor_geometry.py

Air-contactor geometry sizing for a given DAC capture target.

Input:
    {
      "target_co2_per_year_tons": 1000,
      "sorbent_kinetics_kg_kg_hr": 0.001,
      "fan_static_pressure_pa": 200,
      "air_velocity_m_s": 1.5,
      "site_air_co2_ppm": 420,
      "available_pressure_drop_pa": 50
    }

Output:
    {
      "contactor_area_m2": ...,
      "fan_power_kw": ...,
      "footprint_m2": ...,
      ...
    }

Physics:
- Mass balance: capture_rate × A × t = annual_target
- Air volume rate: V_dot = A × v
- CO2 mass flow in air at 420 ppm = 420 × 10⁻⁶ × ρ_air × M_CO2 / M_air × V_dot
- Removal efficiency η = captured / available
- Fan power: P_fan = V_dot × ΔP / η_fan

References:
- Carbon Engineering 1 MtCO2/yr plant: ~14 km² of contactor packing.
- Climeworks Orca 4 kt/yr plant: 12 collectors × ~1 m × 1 m × 2 m.
- Sherwin (2021) "Electrification of industry: Potential, challenges, costs,"
  Joule 5, 1098.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "contactor_geometry (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Keith et al. (2018) Joule 2 1573; Climeworks Orca / Carbon Engineering technical disclosures",
    "physics_basis": "Mass balance: target = capture_rate × A × hr/year × η. Fan power = V_dot × ΔP / η_fan.",
    "confidence_class": "industry_typical",
    "last_reviewed_date": "2026-05-22",
}

RHO_AIR = 1.225
M_AIR = 0.029  # kg/mol
M_CO2 = 0.044  # kg/mol


def compute(payload: dict) -> dict:
    target_ton_yr = float(payload.get("target_co2_per_year_tons", 1000.0))
    cap_kg_kg_hr = float(payload.get("sorbent_kinetics_kg_kg_hr", 0.001))
    dp_fan_pa = float(payload.get("fan_static_pressure_pa", 200.0))
    v_ms = float(payload.get("air_velocity_m_s", 1.5))
    co2_ppm = float(payload.get("site_air_co2_ppm", 420.0))

    target_kg_yr = target_ton_yr * 1000.0
    hours_per_year = 8000  # 91% uptime
    target_kg_hr = target_kg_yr / hours_per_year

    # Volume of air needed
    # CO2 in air: 420 ppm × ρ × M_CO2/M_air = 420e-6 × 1.225 × 1.52 = 7.82e-4 kg CO2 / m³ air
    co2_kg_m3_air = co2_ppm * 1e-6 * RHO_AIR * M_CO2 / M_AIR

    # Assume 50% removal efficiency (single-pass typical for amine TSA)
    eta_removal = 0.5

    # Volume flow required
    V_dot_m3_s = target_kg_hr / (3600 * co2_kg_m3_air * eta_removal)

    # Contactor frontal area
    A_frontal_m2 = V_dot_m3_s / v_ms

    # Sorbent mass needed: target_kg_hr / cap_kg_kg_hr
    sorbent_mass_kg = target_kg_hr / max(1e-6, cap_kg_kg_hr)

    # Sorbent density / packing: assume 100 kg/m³ packed amine on silica monolith
    sorbent_density_kg_m3 = 100
    sorbent_volume_m3 = sorbent_mass_kg / sorbent_density_kg_m3

    # Bed depth from sorbent volume / frontal area
    bed_depth_m = sorbent_volume_m3 / max(0.1, A_frontal_m2)

    # Total pressure drop = fan ΔP + packing ΔP
    # Packing: assume 100 Pa/m bed depth for low-pressure-drop monoliths
    dp_packing_pa = 100 * bed_depth_m
    dp_total_pa = dp_fan_pa + dp_packing_pa

    # Fan power: P_fan = V_dot × ΔP / η_fan
    eta_fan = 0.65
    P_fan_w = V_dot_m3_s * dp_total_pa / eta_fan
    P_fan_kw = P_fan_w / 1000.0

    # Footprint (typical: contactor stacked vertically, 2 m tall, frontal A is W×H)
    contactor_height_m = 2.0
    contactor_width_m = A_frontal_m2 / contactor_height_m
    # Footprint = width × bed depth + 50% access aisles
    footprint_m2 = contactor_width_m * bed_depth_m * 1.5

    # Air flow rate in standard units
    V_dot_m3_hr = V_dot_m3_s * 3600
    V_dot_cfm = V_dot_m3_s * 2118.88

    # Annual electric energy for fan
    fan_kwh_per_year = P_fan_kw * hours_per_year
    fan_kwh_per_ton_co2 = fan_kwh_per_year / target_ton_yr

    return {
        "target_co2_per_year_tons": target_ton_yr,
        "target_kg_per_hr": round(target_kg_hr, 2),
        "contactor_area_m2": round(A_frontal_m2, 1),
        "contactor_width_m": round(contactor_width_m, 2),
        "contactor_height_m": contactor_height_m,
        "bed_depth_m": round(bed_depth_m, 2),
        "fan_power_kw": round(P_fan_kw, 2),
        "footprint_m2": round(footprint_m2, 1),
        "air_velocity_m_s": v_ms,
        "air_volume_flow_m3_s": round(V_dot_m3_s, 2),
        "air_volume_flow_m3_hr": round(V_dot_m3_hr, 0),
        "air_volume_flow_cfm": round(V_dot_cfm, 0),
        "sorbent_mass_kg": round(sorbent_mass_kg, 0),
        "sorbent_volume_m3": round(sorbent_volume_m3, 1),
        "co2_in_air_kg_m3": float(f"{co2_kg_m3_air:.3e}"),
        "removal_efficiency_pct": eta_removal * 100,
        "pressure_drop_total_pa": round(dp_total_pa, 1),
        "pressure_drop_packing_pa": round(dp_packing_pa, 1),
        "fan_energy_kwh_per_ton_co2": round(fan_kwh_per_ton_co2, 0),
        "fan_energy_mwh_per_year": round(fan_kwh_per_year / 1000, 1),
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
