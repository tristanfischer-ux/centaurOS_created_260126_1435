#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/building_envelope_heat_loss.py

Design heat loss per BS EN 12831 (UK / EU).

Heat loss components:
- Fabric transmission: U-value × area × ΔT
- Ventilation/infiltration: 0.34 × volume × ACH × ΔT (W/K)
- Thermal bridges: linear bridges × Ψ × length + point bridges × Χ × count

UK Part L 2021 target U-values (new dwellings):
- Wall: 0.16-0.18 W/m²K
- Window: 1.2-1.4 W/m²K (double glazed argon-filled)
- Roof: 0.11-0.13 W/m²K
- Floor: 0.11-0.13 W/m²K

Design temperatures (UK):
- Indoor: 21°C (living rooms), 18°C (bedrooms)
- Outdoor design temp: -3°C (London), -5°C (Birmingham), -7°C (Glasgow)

Annual heating demand:
    Q_annual_kwh = design_heat_loss_kw × heating_degree_days × 24 / (T_indoor - T_outdoor_design)
HDD15.5 (UK average): 2000-2700

Heat pump sizing rule:
- Cover 100% of design load at design temp WITHOUT backup heater
- Modulate down to 20-30% load via inverter
- Oversize 10-15% for defrost cycle capacity loss

References:
- BS EN 12831-1:2017+A1:2020 Heating systems - Method for calculation
- UK Building Regulations Part L 2021
- ASHRAE Handbook Fundamentals 2021 Ch. 18 Nonresidential cooling and
  heating load calculations
- MCS heat pump installer guide MIS 3005
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'building_envelope_heat_loss (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "BS EN 12831-1:2017 'Energy performance of buildings — Method for calculation of the design heat load'; CIBSE Guide A: Environmental Design",
    "physics_basis": 'Design heat load Q = Σ(U × A × ΔT) + ventilation losses. Per-element U-values from material library.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    wall_area_m2 = float(payload.get("wall_area_m2", 80))
    wall_u_value = float(payload.get("wall_u_value", 0.30))
    window_area_m2 = float(payload.get("window_area_m2", 15))
    window_u_value = float(payload.get("window_u_value", 1.4))
    roof_area_m2 = float(payload.get("roof_area_m2", 50))
    roof_u_value = float(payload.get("roof_u_value", 0.16))
    floor_area_m2 = float(payload.get("floor_area_m2", 50))
    floor_u_value = float(payload.get("floor_u_value", 0.20))
    door_area_m2 = float(payload.get("door_area_m2", 2.0))
    door_u_value = float(payload.get("door_u_value", 1.6))
    infiltration_ach = float(payload.get("infiltration_ach", 0.5))
    indoor_set_c = float(payload.get("indoor_set_c", 21))
    outdoor_min_c = float(payload.get("outdoor_min_c", -3))
    thermal_bridge_factor_pct = float(payload.get("thermal_bridge_factor_pct", 15))
    building_volume_m3 = float(payload.get("building_volume_m3", floor_area_m2 * 2.5))

    delta_t = max(0, indoor_set_c - outdoor_min_c)

    # Fabric losses (W)
    q_wall = wall_u_value * wall_area_m2 * delta_t
    q_window = window_u_value * window_area_m2 * delta_t
    q_roof = roof_u_value * roof_area_m2 * delta_t
    q_floor = floor_u_value * floor_area_m2 * delta_t
    q_door = door_u_value * door_area_m2 * delta_t
    q_fabric = q_wall + q_window + q_roof + q_floor + q_door

    # Ventilation
    # Q_vent = 0.34 × V × n × ΔT  (W)
    q_vent = 0.34 * building_volume_m3 * infiltration_ach * delta_t

    # Thermal bridges (% uplift on fabric losses)
    q_bridges = q_fabric * (thermal_bridge_factor_pct / 100.0)

    # Total design heat loss
    q_total_w = q_fabric + q_vent + q_bridges
    q_total_kw = q_total_w / 1000.0

    # Annual heating demand using degree-day method
    # HDD = sum of (base_T - daily_avg_T)
    # UK average HDD15.5 = 2200, scale by ΔT
    hdd_uk_base = 2200
    annual_heating_kwh = (q_total_kw * hdd_uk_base * 24) / max(0.1, delta_t)

    # Specific heat loss W/K
    htc_w_k = q_total_w / max(0.1, delta_t)

    # Specific demand per m² of floor area
    q_total_per_m2 = q_total_w / max(0.1, floor_area_m2)
    annual_kwh_per_m2 = annual_heating_kwh / max(0.1, floor_area_m2)

    # Heat pump sizing
    # Heat pump nominal rating typically at A7/W35 - capacity drops 20-30% at A-7/W35
    # Size HP at full design load (no backup) with 10% safety factor
    hp_size_kw = q_total_kw * 1.10
    # Round up to standard sizes
    std_sizes_kw = [4, 5, 6, 8, 10, 12, 14, 16, 18, 22, 28, 35]
    recommended_hp_kw = next((s for s in std_sizes_kw if s >= hp_size_kw), std_sizes_kw[-1])

    # Passivhaus check: heat demand ≤ 15 kWh/m²/yr
    is_passivhaus = annual_kwh_per_m2 <= 15
    # NZEB check: heat demand ≤ 50 kWh/m²/yr
    is_nzeb = annual_kwh_per_m2 <= 50

    return {
        "design_heat_loss_kw": round(q_total_kw, 2),
        "design_heat_loss_w": round(q_total_w, 0),
        "delta_t_design": delta_t,
        "indoor_set_c": indoor_set_c,
        "outdoor_min_c": outdoor_min_c,
        "fabric_loss_w": round(q_fabric, 0),
        "fabric_breakdown_w": {
            "wall": round(q_wall, 0),
            "window": round(q_window, 0),
            "roof": round(q_roof, 0),
            "floor": round(q_floor, 0),
            "door": round(q_door, 0),
        },
        "ventilation_loss_w": round(q_vent, 0),
        "thermal_bridge_loss_w": round(q_bridges, 0),
        "annual_heating_kwh": round(annual_heating_kwh, 0),
        "specific_heat_loss_w_per_k": round(htc_w_k, 1),
        "heat_loss_per_m2_floor_w": round(q_total_per_m2, 1),
        "annual_kwh_per_m2": round(annual_kwh_per_m2, 1),
        "recommended_heat_pump_kw": recommended_hp_kw,
        "heat_pump_oversized_pct": round((recommended_hp_kw - q_total_kw) / max(0.1, q_total_kw) * 100, 1),
        "passivhaus_compliant": is_passivhaus,
        "nzeb_compliant": is_nzeb,
        "u_values_used": {
            "wall": wall_u_value,
            "window": window_u_value,
            "roof": roof_u_value,
            "floor": floor_u_value,
            "door": door_u_value,
        },
        "infiltration_ach": infiltration_ach,
        "thermal_bridge_factor_pct": thermal_bridge_factor_pct,
        "notes": (
            "BS EN 12831 design heat loss. Vent loss = 0.34 × V × n × ΔT. "
            "Thermal bridges +15% typical default; Part L 2021 mandates Y-value ≤ 0.05 W/m²K. "
            "Heat pump sized at design temp + 10% for defrost/safety. "
            "Annual demand via UK HDD15.5 = 2200 method."
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
