#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/transport_logistics.py

Transport mode sizing + customs lead-time + transport CO2.

Container dimensions (internal nominal):
- ISO 20ft: 5.9m × 2.35m × 2.39m, max 28,200 kg
- ISO 40ft: 12.0m × 2.35m × 2.39m, max 26,500 kg
- 40ft HC: 12.0m × 2.35m × 2.69m, max 26,500 kg
- EU truck (13.6m trailer): 13.6m × 2.45m × 2.65m, max 24,000 kg payload
- US truck (53ft trailer): 16.15m × 2.59m × 2.74m, max 22,680 kg
- Rail intermodal (40ft container same as sea)
- Air LD3 ULD: 1.53m × 1.56m × 1.62m, max 1,587 kg

Transport CO2 (gCO2/tkm = grams per tonne-kilometre):
- Sea container ship: 8-15 gCO2/tkm (avg 11)
- Rail freight: 22-50 gCO2/tkm (avg 30)
- Road EU/US truck: 60-110 gCO2/tkm (avg 80)
- Air freight: 500-1500 gCO2/tkm (avg 1100)

Shipping cost ranges (2026 spot, USD/container, primary trade lanes):
- 40ft sea Shanghai-LA: $4,500-8,000
- 40ft sea Shanghai-Rotterdam: $5,500-9,500
- 40ft sea UK-NY (transatlantic): $3,500-5,500
- EU truck (FTL 500km): €1,200-2,000
- US truck (FTL 800km): $3,000-4,500
- Air UK-US per kg: £6-12
- Rail (EU intermodal 800km): €2,000-3,500

Customs clearance days (typical, 2025-2026):
- UK<->EU: 1-2 days (post-Brexit baseline)
- EU<->EU: 0 days
- UK<->US: 2-5 days
- UK<->CN: 5-12 days
- EU<->US: 2-5 days

References:
- IMO MEPC.337(76) carbon intensity indicator
- IEA Transport 2024 statistics
- Drewry container freight rate benchmark
- Maersk/MSC/CMA CGM 2026 spot rates

Input:
    {
      "product_dimensions_mm": {"l": 5000, "w": 1200, "h": 2000},
      "product_mass_kg": 3000,
      "quantity_per_shipment": 5,
      "mode": "sea_40ft_container",
      "origin_country": "UK",
      "destination_country": "US"
    }

Output:
    {
      "fits_mode": true,
      "units_per_container": 2,
      "containers_needed": 3,
      "shipping_cost_gbp": ...,
      "transit_time_days": ...,
      "customs_clearance_days": ...,
      "co2_per_unit_kg": ...
    }
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'transport_logistics (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ISO 668:2020 (Series 1 freight containers); IATA Dangerous Goods Regulations 65th ed.; IMDG Code 2022 edition',
    "physics_basis": 'Container fit: ceil(unit_volume / container_payload_vol). CO2 per unit per mode (sea 8 g/tonne-km, road 62 g, air 500 g).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


USD_GBP = 0.78
EUR_GBP = 0.86

# (l_mm, w_mm, h_mm, max_kg, mode_label)
CONTAINERS: dict[str, dict] = {
    "sea_20ft":           {"l": 5900,  "w": 2350, "h": 2390, "max_kg": 28200, "label": "ISO 20ft"},
    "sea_40ft_container": {"l": 12000, "w": 2350, "h": 2390, "max_kg": 26500, "label": "ISO 40ft"},
    "sea_40ft_hc":        {"l": 12000, "w": 2350, "h": 2690, "max_kg": 26500, "label": "ISO 40ft HC"},
    "road_eu_truck":      {"l": 13600, "w": 2450, "h": 2650, "max_kg": 24000, "label": "EU trailer"},
    "road_us_truck":      {"l": 16150, "w": 2590, "h": 2740, "max_kg": 22680, "label": "US 53ft trailer"},
    "rail_intermodal":    {"l": 12000, "w": 2350, "h": 2390, "max_kg": 26500, "label": "Rail 40ft"},
    "air_ld3":            {"l": 1530,  "w": 1560, "h": 1620, "max_kg": 1587,  "label": "ULD LD3"},
}

# (mode, origin, dest) -> typical USD shipping cost per container
SHIPPING_COST: dict[tuple[str, str, str], float] = {
    # Sea 40ft container
    ("sea_40ft_container", "CN", "UK"): 5500,
    ("sea_40ft_container", "CN", "US"): 5800,
    ("sea_40ft_container", "CN", "EU"): 6500,
    ("sea_40ft_container", "UK", "US"): 4500,
    ("sea_40ft_container", "UK", "CN"): 5000,
    ("sea_40ft_container", "EU", "US"): 4200,
    ("sea_40ft_container", "EU", "CN"): 5500,
    ("sea_40ft_container", "US", "EU"): 4500,
    ("sea_40ft_container", "US", "CN"): 5800,
    # Sea 20ft (roughly 60% of 40ft)
    ("sea_20ft", "CN", "UK"): 3500,
    ("sea_20ft", "CN", "US"): 3800,
    ("sea_20ft", "UK", "US"): 2800,
    # Road EU truck per shipment (500-1000km typical)
    ("road_eu_truck", "UK", "EU"): 2000,
    ("road_eu_truck", "EU", "UK"): 2000,
    ("road_eu_truck", "EU", "EU"): 1500,
    # Road US truck per shipment (FTL)
    ("road_us_truck", "US", "US"): 4500,
    # Rail
    ("rail_intermodal", "CN", "EU"): 8500,
    ("rail_intermodal", "EU", "EU"): 3000,
    # Air per ULD
    ("air_ld3", "CN", "UK"): 12000,
    ("air_ld3", "CN", "US"): 14000,
    ("air_ld3", "UK", "US"): 9000,
    ("air_ld3", "UK", "EU"): 5000,
}

# (origin, dest) -> typical transit days for sea
TRANSIT_SEA_DAYS: dict[tuple[str, str], int] = {
    ("CN", "UK"): 35, ("CN", "EU"): 32, ("CN", "US"): 18, ("UK", "US"): 14,
    ("EU", "US"): 12, ("UK", "CN"): 35, ("EU", "CN"): 32, ("US", "EU"): 12,
    ("US", "CN"): 18,
}

# Air transit days
TRANSIT_AIR_DAYS = 3

# Road transit
TRANSIT_ROAD_DAYS: dict[tuple[str, str], int] = {
    ("UK", "EU"): 2, ("EU", "UK"): 2, ("EU", "EU"): 1, ("US", "US"): 3,
    ("UK", "UK"): 1,
}

# Rail transit
TRANSIT_RAIL_DAYS: dict[tuple[str, str], int] = {
    ("CN", "EU"): 16, ("EU", "CN"): 18, ("EU", "EU"): 4,
}

# Customs clearance days
CUSTOMS_DAYS: dict[tuple[str, str], int] = {
    ("UK", "EU"): 2, ("EU", "UK"): 2,
    ("UK", "US"): 3, ("US", "UK"): 3,
    ("UK", "CN"): 7, ("CN", "UK"): 7,
    ("EU", "US"): 3, ("US", "EU"): 3,
    ("EU", "CN"): 8, ("CN", "EU"): 8,
    ("US", "CN"): 7, ("CN", "US"): 7,
    ("UK", "UK"): 0,
    ("EU", "EU"): 0,
    ("US", "US"): 0,
    ("CN", "CN"): 0,
}

# CO2 g/tkm transport intensity
CO2_TKM: dict[str, float] = {
    "sea_20ft": 11.0,
    "sea_40ft_container": 11.0,
    "sea_40ft_hc": 11.0,
    "road_eu_truck": 80.0,
    "road_us_truck": 90.0,
    "rail_intermodal": 30.0,
    "air_ld3": 1100.0,
}

# Approximate distance (km) for each route
DISTANCE_KM: dict[tuple[str, str], int] = {
    ("CN", "UK"): 22000,
    ("CN", "US"): 15000,
    ("CN", "EU"): 21000,
    ("UK", "US"): 5500,
    ("EU", "US"): 6000,
    ("UK", "EU"): 1000,
    ("EU", "EU"): 800,
    ("US", "US"): 1500,
    ("UK", "UK"): 300,
    ("UK", "CN"): 22000,
    ("US", "CN"): 15000,
    ("EU", "CN"): 21000,
    ("US", "EU"): 6000,
    ("EU", "UK"): 1000,
    ("US", "UK"): 5500,
}


def fit_check(prod_l: float, prod_w: float, prod_h: float, prod_kg: float,
              qty: int, container: dict) -> dict:
    """Check if qty units of given dimensions fit in container."""
    # Try all 6 orientations
    best = {"fits": False, "qty_fit": 0, "by_volume": 0, "by_weight": 0}
    orientations = [
        (prod_l, prod_w, prod_h),
        (prod_l, prod_h, prod_w),
        (prod_w, prod_l, prod_h),
        (prod_w, prod_h, prod_l),
        (prod_h, prod_l, prod_w),
        (prod_h, prod_w, prod_l),
    ]
    for (l, w, h) in orientations:
        if l > container["l"] or w > container["w"] or h > container["h"]:
            continue
        nl = container["l"] // l
        nw = container["w"] // w
        nh = container["h"] // h
        n_by_vol = int(nl * nw * nh)
        n_by_kg = int(container["max_kg"] // prod_kg) if prod_kg > 0 else n_by_vol
        n_max = min(n_by_vol, n_by_kg)
        if n_max > best["qty_fit"]:
            best = {
                "fits": n_max >= 1,
                "qty_fit": n_max,
                "by_volume": n_by_vol,
                "by_weight": n_by_kg,
                "orientation_mm": [int(l), int(w), int(h)],
                "stack_lwh": [int(nl), int(nw), int(nh)],
            }
    return best


def compute(payload: dict) -> dict:
    dims = payload.get("product_dimensions_mm", {})
    prod_l = float(dims.get("l", 0))
    prod_w = float(dims.get("w", 0))
    prod_h = float(dims.get("h", 0))
    prod_kg = float(payload.get("product_mass_kg", 0))
    qty = int(payload.get("quantity_per_shipment", 1))
    mode = str(payload.get("mode", "sea_40ft_container")).lower()
    origin = str(payload.get("origin_country", "UK")).upper()
    dest = str(payload.get("destination_country", "US")).upper()

    if mode not in CONTAINERS:
        return {"error": f"Unknown mode {mode}. Valid: {sorted(CONTAINERS.keys())}"}

    container = CONTAINERS[mode]
    fit = fit_check(prod_l, prod_w, prod_h, prod_kg, qty, container)

    units_per_container = fit["qty_fit"]
    containers_needed = math.ceil(qty / max(1, units_per_container)) if units_per_container > 0 else 0

    # Shipping cost
    base_cost = SHIPPING_COST.get((mode, origin, dest))
    if base_cost is None:
        # Inverse lookup
        base_cost = SHIPPING_COST.get((mode, dest, origin))
    if base_cost is None:
        # Fallback estimate
        if mode.startswith("sea_"):
            base_cost = 5000
        elif mode.startswith("road_"):
            base_cost = 2000
        elif mode.startswith("rail_"):
            base_cost = 4000
        elif mode.startswith("air_"):
            base_cost = 8000
        else:
            base_cost = 3000
    total_cost_usd = base_cost * containers_needed
    total_cost_gbp = total_cost_usd * USD_GBP

    # Transit time
    if mode.startswith("sea_"):
        transit_days = TRANSIT_SEA_DAYS.get((origin, dest))
        if transit_days is None:
            transit_days = TRANSIT_SEA_DAYS.get((dest, origin), 25)
    elif mode.startswith("air_"):
        transit_days = TRANSIT_AIR_DAYS
    elif mode.startswith("road_"):
        transit_days = TRANSIT_ROAD_DAYS.get((origin, dest), 3)
    elif mode.startswith("rail_"):
        transit_days = TRANSIT_RAIL_DAYS.get((origin, dest), 7)
    else:
        transit_days = 10

    # Customs
    customs_days = CUSTOMS_DAYS.get((origin, dest))
    if customs_days is None:
        customs_days = CUSTOMS_DAYS.get((dest, origin), 5)

    # CO2 per unit
    distance_km = DISTANCE_KM.get((origin, dest), 5000)
    co2_intensity = CO2_TKM.get(mode, 50.0)
    # g CO2 per unit = intensity * (unit mass / 1000) * distance
    co2_per_unit_g = co2_intensity * (prod_kg / 1000.0) * distance_km
    co2_per_unit_kg = co2_per_unit_g / 1000.0

    # Worked calculations — table lookups (fit check, transit days, customs days)
    # are piecewise/branchy, SKIP.  Cost and CO2 are clean closed-form arithmetic.
    cost_r = round(total_cost_gbp)
    co2_g_r = round(co2_per_unit_g, 1)
    worked = [
        worked_calc(
            label="Total shipping cost (GBP)",
            formula="cost_gbp = base_cost_usd x containers_needed x USD_GBP",
            values={"base_cost_usd": (base_cost, "USD"),
                    "containers_needed": (containers_needed, ""),
                    "USD_GBP": (USD_GBP, "")},
            result=cost_r, result_unit="GBP",
            assumptions=["base_cost_usd from SHIPPING_COST table (2026 spot rates, "
                         "Drewry/Freightos); USD_GBP = 0.78"],
        ),
        worked_calc(
            label="Shipping cost per unit",
            formula="cost_per_unit = cost_gbp / qty",
            values={"cost_gbp": (cost_r, "GBP"), "qty": (qty, "")},
            result=round(total_cost_gbp / max(1, qty)), result_unit="GBP/unit",
            assumptions=[],
        ),
        worked_calc(
            label="CO2 per unit (grams)",
            formula="co2_g = co2_intensity x (prod_kg / 1000) x distance_km",
            values={"co2_intensity": (co2_intensity, "g_CO2/t-km"),
                    "prod_kg": (prod_kg, "kg"),
                    "distance_km": (distance_km, "km")},
            result=co2_g_r, result_unit="g CO2",
            assumptions=[f"CO2 intensity {co2_intensity} g/t-km for {mode} "
                         f"(IMO MEPC.337(76) / IEA Transport 2024); "
                         f"distance {distance_km} km from DISTANCE_KM table"],
        ),
        worked_calc(
            label="CO2 per unit (kg)",
            formula="co2_kg = co2_g / 1000",
            values={"co2_g": (co2_g_r, "g")},
            result=round(co2_per_unit_kg, 1), result_unit="kg CO2",
            assumptions=[],
        ),
    ]

    return {
        "mode": mode,
        "mode_label": container["label"],
        "fits_mode": bool(fit["fits"]),
        "units_per_container": units_per_container,
        "containers_needed": containers_needed,
        "container_internal_mm": {"l": container["l"], "w": container["w"], "h": container["h"]},
        "container_max_kg": container["max_kg"],
        "best_orientation_mm": fit.get("orientation_mm"),
        "stack_pattern_lwh": fit.get("stack_lwh"),
        "by_volume_max_units": fit.get("by_volume"),
        "by_weight_max_units": fit.get("by_weight"),
        "shipping_cost_gbp": round(total_cost_gbp),
        "shipping_cost_per_unit_gbp": round(total_cost_gbp / max(1, qty)),
        "transit_time_days": transit_days,
        "customs_clearance_days": customs_days,
        "total_door_to_door_days": transit_days + customs_days,
        "co2_per_unit_kg": round(co2_per_unit_kg, 1),
        "distance_km": distance_km,
        "co2_intensity_g_per_tkm": co2_intensity,
        "origin_country": origin,
        "destination_country": dest,
        "worked": worked,
        "notes": (
            "Costs are 2026 spot averages (Drewry/Freightos). Sea routes vary "
            "±40% with bunker. Customs assumes standard HS classification - "
            "controlled goods (dual-use, lithium UN 3480) add 3-7 days."
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
