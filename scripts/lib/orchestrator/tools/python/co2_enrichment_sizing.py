#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/co2_enrichment_sizing.py

CO2 enrichment system sizing for vertical farms.

Plant uptake (photosynthesis):
- A_net = A_max × (1 - exp(-k × C/C_K))  (per Farquhar-Caemmerer-Berry)
- Typical photosynthetic rate at 1000 ppm CO2: 15-25 μmol/m²/s for C3 crops

Net CO2 consumption per unit area per hour:
- Leafy greens (LAI 4-6): 1.5-3 g CO2/m²/h at 1000 ppm
- Tomato (LAI 4): 2-4 g CO2/m²/h
- Cannabis (LAI 5-7): 3-5 g CO2/m²/h

Infiltration loss (mass balance):
- Q_loss = V × ACH × (C_inside - C_outside) / 22.4 L/mol × 44 g/mol
  Or simplified: m_loss g/h = V × ACH × (ΔC ppm × 1.83e-3)
where:
  V = volume in m³
  ACH = air changes per hour
  ΔC = ppm difference inside - outside (typically 600-1200 ppm)
  Conversion: 1 ppm CO2 = 1.83 mg/m³ (at 20°C, 1 atm)

Supply methods:
1. Liquid bulk CO2 (siphon dewars): cheapest at scale (>50kg/day)
2. Pressurised cylinder (50L @ 50 bar = 38 kg liquid CO2): mid-scale
3. Flue gas (CHP cogeneration): "free" but needs cleanup

Typical CO2 costs:
- Bulk liquid: £100-180/tonne (delivered, UK 2026)
- Cylinder 50kg: £75-130 per cylinder (~£1500/tonne)
- Beverage-grade carbonator: £30-60/cylinder hire

References:
- Kozai, "Plant Factory: An Indoor Vertical Farming System", Academic Press 2015
- Sanchez-Molina et al, "Indirect adaptive control for CO2 enrichment",
  Computers and Electronics in Agriculture 2018
- ASHRAE Handbook, Greenhouses chapter, 2019
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'co2_enrichment_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Mortensen (1987), 'Review: CO2 enrichment in greenhouses. Crop responses', Scientia Horticulturae 33(1):1-25; Kozai (2015) 'Sustainable plant factory'",
    "physics_basis": 'CO2 uptake rate per leaf area from light-CO2 response curve. Tank sizing from kg/day × storage_days.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Plant CO2 uptake rate (g/m² per hour at canopy)
CROP_UPTAKE_G_M2_H = {
    "lettuce": 2.0,
    "basil": 2.2,
    "tomato": 3.0,
    "strawberry": 2.5,
    "cucumber": 3.2,
    "pepper": 3.0,
    "cannabis": 4.5,
    "spinach": 2.0,
    "kale": 2.3,
    "leafy_greens": 2.0,
}

# Defaults
PPM_OUTSIDE = 420   # ambient atmospheric CO2 (2026, NOAA)


def compute(payload: dict) -> dict:
    growing_area_m2 = float(payload.get("growing_area_m2", 100))
    target_ppm = float(payload.get("target_co2_ppm", 1200))
    photoperiod_hours = float(payload.get("photoperiod_hours", 16))
    leaf_area_index = float(payload.get("leaf_area_index", 4.0))
    ach = float(payload.get("ach_air_changes_per_hour", 0.5))
    room_height_m = float(payload.get("room_height_m", 3.0))
    crop = str(payload.get("crop", "leafy_greens")).lower()

    if target_ppm <= PPM_OUTSIDE:
        return {"error": f"target_co2_ppm ({target_ppm}) must exceed atmospheric ({PPM_OUTSIDE})."}

    if crop not in CROP_UPTAKE_G_M2_H:
        crop = "leafy_greens"

    base_uptake = CROP_UPTAKE_G_M2_H[crop]
    # Scale by LAI (more canopy = more uptake, up to saturation)
    lai_factor = min(1.5, leaf_area_index / 4.0)
    uptake_g_m2_h = base_uptake * lai_factor
    # Only during photoperiod
    daily_plant_uptake_kg = uptake_g_m2_h * growing_area_m2 * photoperiod_hours / 1000.0

    # Infiltration loss
    room_volume_m3 = growing_area_m2 * room_height_m
    delta_c_ppm = target_ppm - PPM_OUTSIDE
    # 1 ppm = 1.83 mg/m³ at STP
    co2_loss_g_per_h = room_volume_m3 * ach * delta_c_ppm * 1.83e-3
    daily_infiltration_kg = co2_loss_g_per_h * 24.0 / 1000.0   # 24h leak

    # Total daily consumption
    daily_consumption_kg = daily_plant_uptake_kg + daily_infiltration_kg

    # Supply method selection
    annual_consumption_kg = daily_consumption_kg * 365
    if annual_consumption_kg < 500:
        supply_method = "cylinder"
        cyl_size_kg = 50
        cylinder_count_per_month = round(daily_consumption_kg * 30 / cyl_size_kg, 1)
        cost_per_kg_gbp = 1.50
    elif annual_consumption_kg < 5000:
        supply_method = "cylinder_or_bulk"
        cyl_size_kg = 50
        cylinder_count_per_month = round(daily_consumption_kg * 30 / cyl_size_kg, 1)
        cost_per_kg_gbp = 0.50
    else:
        supply_method = "liquid_bulk"
        cyl_size_kg = 5000   # mini-bulk tank ~5 tonne
        cylinder_count_per_month = round(daily_consumption_kg * 30 / cyl_size_kg, 2)
        cost_per_kg_gbp = 0.15

    daily_cost_gbp = daily_consumption_kg * cost_per_kg_gbp
    annual_cost_gbp = daily_cost_gbp * 365

    # Tank size recommendation (2 week supply)
    recommended_tank_size_kg = daily_consumption_kg * 14
    # Round up to standard size
    standard_sizes = [50, 100, 200, 500, 1000, 3000, 5000, 10000, 20000]
    tank_size_kg = next((s for s in standard_sizes if s >= recommended_tank_size_kg),
                         standard_sizes[-1])

    # Distribution: pipe + injection points sized for ~120% of peak demand
    peak_demand_g_h = uptake_g_m2_h * growing_area_m2 * lai_factor + co2_loss_g_per_h
    injection_points = max(1, int(growing_area_m2 / 100))   # 1 per 100m² grow

    # Worked calculations for the PDF appendix — built from the SAME live values
    # above (drift-safe), chained so each line follows from the previous.
    # SKIPPED: lai_factor (min(1.5, LAI/4) clamp — its value is already folded
    # into the live uptake_g_m2_h used below); supply-method + tank-size
    # selection (annual-volume threshold + standard-size table lookup).
    uptake_r = round(uptake_g_m2_h, 2)
    plant_uptake_r = round(daily_plant_uptake_kg, 2)
    loss_r = round(co2_loss_g_per_h, 1)
    infil_r = round(daily_infiltration_kg, 2)
    worked = [
        worked_calc(
            label="Room volume",
            formula="volume = area x room_height",
            values={"area": (growing_area_m2, "m2"), "room_height": (room_height_m, "m")},
            result=round(room_volume_m3, 2), result_unit="m3",
        ),
        worked_calc(
            label="Daily plant CO2 uptake",
            formula="plant_uptake = (uptake_rate x area x photoperiod) / 1000",
            values={"uptake_rate": (uptake_r, "g/m2/h"), "area": (growing_area_m2, "m2"),
                    "photoperiod": (photoperiod_hours, "h")},
            result=plant_uptake_r, result_unit="kg/day",
            assumptions=["uptake only during photoperiod", "/1000 converts g to kg"],
        ),
        worked_calc(
            label="Infiltration loss rate",
            formula="co2_loss = volume x ach x delta_c x 0.00183",
            values={"volume": (round(room_volume_m3, 2), "m3"), "ach": (ach, "1/h"),
                    "delta_c": (delta_c_ppm, "ppm")},
            result=loss_r, result_unit="g/h",
            assumptions=["1 ppm CO2 = 1.83 mg/m3 at 20 C, 1 atm"],
        ),
        worked_calc(
            label="Daily infiltration loss",
            formula="daily_infiltration = (co2_loss x 24) / 1000",
            values={"co2_loss": (loss_r, "g/h")},
            result=infil_r, result_unit="kg/day",
            assumptions=["24 h/day leak (enrichment maintained continuously)"],
        ),
        worked_calc(
            label="Total daily CO2 consumption",
            formula="consumption = plant_uptake + daily_infiltration",
            values={"plant_uptake": (plant_uptake_r, "kg/day"),
                    "daily_infiltration": (infil_r, "kg/day")},
            result=round(daily_consumption_kg, 2), result_unit="kg/day",
        ),
    ]

    return {
        "growing_area_m2": growing_area_m2,
        "target_co2_ppm": target_ppm,
        "outside_co2_ppm": PPM_OUTSIDE,
        "delta_c_ppm": delta_c_ppm,
        "ach_air_changes_per_hour": ach,
        "room_volume_m3": room_volume_m3,
        "uptake_g_m2_h": round(uptake_g_m2_h, 2),
        "daily_plant_uptake_kg": round(daily_plant_uptake_kg, 2),
        "co2_loss_g_per_h_infiltration": round(co2_loss_g_per_h, 1),
        "daily_infiltration_kg": round(daily_infiltration_kg, 2),
        "co2_consumption_kg_day": round(daily_consumption_kg, 2),
        "annual_consumption_kg": round(annual_consumption_kg, 0),
        "peak_demand_g_per_h": round(peak_demand_g_h, 1),
        "supply_method": supply_method,
        "tank_size_kg": tank_size_kg,
        "cylinder_count_per_month": cylinder_count_per_month,
        "injection_points": injection_points,
        "cost_per_kg_gbp": cost_per_kg_gbp,
        "daily_cost_gbp": round(daily_cost_gbp, 2),
        "annual_cost_gbp": round(annual_cost_gbp, 0),
        "crop": crop,
        "leaf_area_index": leaf_area_index,
        "photoperiod_hours": photoperiod_hours,
        "notes": (
            "Plant uptake per Kozai (2015) Plant Factory. Infiltration loss assumes "
            "uniform mixing and constant ACH. Supply method based on annual volume: "
            "<500 kg/yr cylinders, 500-5000 kg/yr cylinders or mini-bulk, >5000 kg/yr bulk. "
            "CHP flue gas is free if cleaned to <50 ppm NOx + <50 ppm CO."
        ),
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
