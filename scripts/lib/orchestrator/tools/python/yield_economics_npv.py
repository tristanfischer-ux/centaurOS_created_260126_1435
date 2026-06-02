#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/yield_economics_npv.py

Vertical farm yield economics: NPV, IRR, payback, energy intensity per kg.

NPV calculation:
    NPV = sum(CF_t / (1+r)^t) - Capex

IRR via Newton-Raphson (or bisection fallback).

Energy intensity:
    kWh_per_kg = (annual_energy_kwh) / (annual_yield_kg)
Typical benchmarks (2024-2026):
- Leafy greens: 8-15 kWh/kg (good operation)
- Tomato: 25-50 kWh/kg
- Strawberry: 30-60 kWh/kg
- Cannabis: 1500-2500 kWh/kg flower

References:
- Brealey, Myers, Allen, "Principles of Corporate Finance" 13th ed.
- Kozai, "Plant Factory" 2nd ed. 2020 (ch. 18 economics)
- Indoor Ag Conference benchmarks 2024
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
    "tool_name": 'yield_economics_npv (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Brealey, Myers, Allen (2020), 'Principles of Corporate Finance' 13th ed.; Damodaran 'Investment Valuation' 3rd ed.",
    "physics_basis": 'NPV = Σ (CF_t / (1+r)^t) - CapEx. IRR is the discount rate that zeroes NPV. Payback = CapEx / mean_annual_CF.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def calculate_irr(cashflows: list[float], guess: float = 0.10,
                  tolerance: float = 1e-6, max_iter: int = 100) -> float | None:
    """Newton-Raphson IRR with bisection fallback."""
    r = guess
    for _ in range(max_iter):
        npv = sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))
        d_npv = sum(-t * cf / (1 + r) ** (t + 1) for t, cf in enumerate(cashflows))
        if abs(d_npv) < 1e-12:
            break
        r_new = r - npv / d_npv
        if abs(r_new - r) < tolerance:
            return r_new
        r = r_new

    # Bisection fallback
    low, high = -0.99, 5.0
    for _ in range(200):
        mid = (low + high) / 2
        npv_mid = sum(cf / (1 + mid) ** t for t, cf in enumerate(cashflows))
        if abs(npv_mid) < tolerance:
            return mid
        npv_low = sum(cf / (1 + low) ** t for t, cf in enumerate(cashflows))
        if npv_low * npv_mid < 0:
            high = mid
        else:
            low = mid
    return None


def compute(payload: dict) -> dict:
    capex_gbp = float(payload.get("capex_gbp", 1000000))
    opex_per_yr = float(payload.get("opex_gbp_year", 250000))
    annual_yield_kg = float(payload.get("annual_yield_kg", 50000))
    market_price = float(payload.get("market_price_gbp_kg", 6.0))
    discount_rate = float(payload.get("discount_rate_pct", 8.0)) / 100.0
    project_years = int(payload.get("project_life_years", 10))
    annual_energy_kwh = float(payload.get("annual_energy_kwh", 500000))
    operational_inflation_pct = float(payload.get("operational_inflation_pct", 2.0)) / 100.0
    price_inflation_pct = float(payload.get("price_inflation_pct", 1.5)) / 100.0
    tax_rate_pct = float(payload.get("tax_rate_pct", 19.0)) / 100.0

    # Year 0 = capex out
    cashflows = [-capex_gbp]
    # Annual gross + cashflow with inflation
    annual_gross_yr_t = annual_yield_kg * market_price
    annual_opex_yr_t = opex_per_yr
    cumulative_revenue = 0.0
    cumulative_opex = 0.0
    payback_year = None

    for t in range(1, project_years + 1):
        revenue = annual_gross_yr_t * (1 + price_inflation_pct) ** (t - 1)
        opex = annual_opex_yr_t * (1 + operational_inflation_pct) ** (t - 1)
        depreciation = capex_gbp / project_years   # straight-line
        ebt = revenue - opex - depreciation
        tax = max(0, ebt) * tax_rate_pct
        net_income = ebt - tax
        # Cashflow = net income + depreciation (back since non-cash)
        cf = net_income + depreciation
        cashflows.append(cf)
        cumulative_revenue += revenue
        cumulative_opex += opex
        # Track payback
        if payback_year is None and sum(cashflows) >= 0:
            payback_year = t

    # NPV
    npv = sum(cf / (1 + discount_rate) ** t for t, cf in enumerate(cashflows))
    # IRR
    irr = calculate_irr(cashflows)

    # Gross margin year 1
    gross_margin_yr1 = (annual_gross_yr_t - annual_opex_yr_t) / annual_gross_yr_t * 100.0

    # Energy intensity
    energy_intensity = annual_energy_kwh / max(0.1, annual_yield_kg)

    # Cost per kg yr 1
    cost_per_kg_yr1 = annual_opex_yr_t / annual_yield_kg
    # All-in cost incl capex amortisation
    capex_amortised_per_kg = capex_gbp / (annual_yield_kg * project_years)
    all_in_cost_per_kg = cost_per_kg_yr1 + capex_amortised_per_kg

    # Benchmark check
    crop = str(payload.get("crop", "lettuce")).lower()
    benchmark_kwh_kg = {
        "lettuce": 12, "leafy_greens": 12, "basil": 15, "spinach": 12,
        "tomato": 35, "cucumber": 30, "pepper": 30, "strawberry": 45,
        "cannabis": 2000,
    }.get(crop, 15)
    benchmark_market = energy_intensity <= benchmark_kwh_kg

    # Rounded intermediates for chained worked calculations.
    annual_rev_r = round(annual_gross_yr_t, 2)
    gross_margin_r = round(gross_margin_yr1, 2)
    energy_int_r = round(energy_intensity, 2)
    cost_per_kg_r = round(cost_per_kg_yr1, 4)
    cap_amort_r = round(capex_amortised_per_kg, 4)
    all_in_cost_r = round(all_in_cost_per_kg, 4)
    all_in_margin_r = round(market_price - all_in_cost_per_kg, 4)

    worked = [
        worked_calc(
            label="Annual gross revenue (year 1)",
            formula="annual_revenue = annual_yield_kg x market_price",
            values={
                "annual_yield_kg": (annual_yield_kg, "kg/yr"),
                "market_price": (market_price, "GBP/kg"),
            },
            result=annual_rev_r, result_unit="GBP/yr",
            assumptions=["year 1 price; subsequent years inflated at price_inflation_pct per annum"],
        ),
        worked_calc(
            label="Gross margin year 1",
            formula="gross_margin = (annual_revenue - opex_per_yr) / annual_revenue x 100",
            values={
                "annual_revenue": (annual_rev_r, "GBP/yr"),
                "opex_per_yr": (opex_per_yr, "GBP/yr"),
            },
            result=gross_margin_r, result_unit="%",
            assumptions=["gross margin before tax and depreciation; year-1 only"],
        ),
        worked_calc(
            label="Energy intensity",
            formula="energy_intensity = annual_energy_kwh / annual_yield_kg",
            values={
                "annual_energy_kwh": (annual_energy_kwh, "kWh/yr"),
                "annual_yield_kg": (annual_yield_kg, "kg/yr"),
            },
            result=energy_int_r, result_unit="kWh/kg",
            assumptions=["total site energy divided by total harvested yield; no allocation between crops"],
        ),
        worked_calc(
            label="Operating cost per kg",
            formula="cost_per_kg = opex_per_yr / annual_yield_kg",
            values={
                "opex_per_yr": (opex_per_yr, "GBP/yr"),
                "annual_yield_kg": (annual_yield_kg, "kg/yr"),
            },
            result=cost_per_kg_r, result_unit="GBP/kg",
            assumptions=["year-1 opex only; subsequent years inflated"],
        ),
        worked_calc(
            label="Amortised capital cost per kg",
            formula="cap_amort = capex_gbp / (annual_yield_kg x project_years)",
            values={
                "capex_gbp": (capex_gbp, "GBP"),
                "annual_yield_kg": (annual_yield_kg, "kg/yr"),
                "project_years": (project_years, "yr"),
            },
            result=cap_amort_r, result_unit="GBP/kg",
            assumptions=["straight-line amortisation over project life; matches straight-line depreciation assumption"],
        ),
        worked_calc(
            label="All-in cost per kg (opex + amortised capex)",
            formula="all_in_cost = cost_per_kg + cap_amort",
            values={
                "cost_per_kg": (cost_per_kg_r, "GBP/kg"),
                "cap_amort": (cap_amort_r, "GBP/kg"),
            },
            result=all_in_cost_r, result_unit="GBP/kg",
            assumptions=[],
        ),
        worked_calc(
            label="All-in margin per kg",
            formula="all_in_margin = market_price - all_in_cost",
            values={
                "market_price": (market_price, "GBP/kg"),
                "all_in_cost": (all_in_cost_r, "GBP/kg"),
            },
            result=all_in_margin_r, result_unit="GBP/kg",
            assumptions=["positive = profitable at year-1 volume and price"],
        ),
    ]

    return {
        "npv_gbp": round(npv),
        "irr_pct": round(irr * 100.0, 2) if irr is not None else None,
        "payback_years": payback_year,
        "gross_margin_pct": round(gross_margin_yr1, 2),
        "annual_revenue_yr1_gbp": round(annual_gross_yr_t),
        "annual_opex_yr1_gbp": opex_per_yr,
        "annual_yield_kg": annual_yield_kg,
        "market_price_gbp_kg": market_price,
        "energy_intensity_kwh_per_kg": round(energy_intensity, 1),
        "energy_intensity_benchmark_kwh_kg": benchmark_kwh_kg,
        "meets_energy_benchmark": benchmark_market,
        "cost_per_kg_opex_only_gbp": round(cost_per_kg_yr1, 2),
        "all_in_cost_per_kg_gbp": round(all_in_cost_per_kg, 2),
        "all_in_margin_per_kg_gbp": round(market_price - all_in_cost_per_kg, 2),
        "worked": worked,
        "capex_gbp": capex_gbp,
        "project_life_years": project_years,
        "discount_rate_pct": discount_rate * 100.0,
        "cumulative_revenue_gbp": round(cumulative_revenue),
        "cumulative_opex_gbp": round(cumulative_opex),
        "cashflows_yearly": [round(cf, 0) for cf in cashflows],
        "is_profitable_npv": (npv > 0),
        "is_profitable_irr": (irr is not None and irr > discount_rate),
        "notes": (
            f"NPV per Brealey/Myers/Allen. Year 0 = capex. "
            f"Annual revenue inflated at {price_inflation_pct*100:.1f}%/yr, "
            f"opex at {operational_inflation_pct*100:.1f}%/yr. "
            f"Straight-line depreciation over project life. "
            f"Tax {tax_rate_pct*100:.0f}% on EBT. "
            f"Benchmark: {crop} should be ≤ {benchmark_kwh_kg} kWh/kg."
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
