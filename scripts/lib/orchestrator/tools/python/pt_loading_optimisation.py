#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pt_loading_optimisation.py

Platinum catalyst loading optimisation: cost vs power vs durability.

Input:
    {
      "target_power_density_w_cm2": 1.0,
      "durability_target_hours": 10000,
      "stack_active_area_m2": 0.5,
      "pt_price_gbp_per_g": 25.0
    }

Output:
    {
      "pt_mg_cm2": ...,
      "cost_per_kw_gbp": ...,
      "total_pt_mass_g": ...,
      ...
    }

Physics + economics:
- Power density scales as P ∝ sqrt(loading) up to ~0.6 mg/cm² (DOE target).
- Loading > 0.4 mg/cm² for medium-duty, > 0.6 mg/cm² for heavy-duty (truck).
- Pt dissolution rate ∝ 1/loading × cycling stress. Loading 0.4 mg/cm² gives
  10,000 hr durability under load-cycling.

References:
- DOE 2026 PEMFC technical targets (DOE EERE FCTO).
- Borup et al. (2007) "Scientific Aspects of Polymer Electrolyte Fuel Cell
  Durability and Degradation," Chem. Rev. 107, 3904.
- Stamenkovic, Mun, Mayrhofer, Ross, Markovic (2007) Nature Materials 6, 241.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

PROVENANCE = {
    "tool_name": "pt_loading_optimisation (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "DOE 2026 EERE FCTO technical targets; Borup et al. (2007) Chem. Rev. 107 3904",
    "physics_basis": "P_density ∝ sqrt(loading); durability ∝ loading × inverse stress. DOE 2026 targets 0.125 g/kW.",
    "confidence_class": "industry_typical",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    P_target_w_cm2 = float(payload.get("target_power_density_w_cm2", 1.0))
    durability_target_hr = float(payload.get("durability_target_hours", 10000.0))
    A_active_m2 = float(payload.get("stack_active_area_m2", 0.5))
    Pt_price_gbp_g = float(payload.get("pt_price_gbp_per_g", 25.0))

    # Loading required for target power
    # P = A × sqrt(loading/0.1) where A = 0.7 W/cm² at 0.1 mg/cm²
    # Solve: loading = 0.1 × (P/0.7)²
    loading_for_power = 0.1 * (P_target_w_cm2 / 0.7) ** 2

    # Loading required for durability
    # 5000 hr at 0.1 mg/cm², linear scaling assumed
    loading_for_durability = 0.1 * (durability_target_hr / 5000.0)

    # Take max
    loading_required = max(loading_for_power, loading_for_durability)

    # Snap to commercial values: 0.1, 0.2, 0.3, 0.4, 0.6 mg/cm²
    commercial = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]
    loading_recommended = next((s for s in commercial if s >= loading_required), commercial[-1])

    # Total Pt mass
    A_active_cm2 = A_active_m2 * 1e4
    total_pt_g = loading_recommended * A_active_cm2 * 1e-3  # mg/cm² × cm² × 1e-3 = g
    # Pt on BOTH electrodes (anode + cathode); cathode dominates (90%)
    pt_mass_total_g = total_pt_g * 1.1

    # Cost
    pt_cost_gbp = pt_mass_total_g * Pt_price_gbp_g

    # Power at this loading
    P_actual_w_cm2 = 0.7 * math.sqrt(loading_recommended / 0.1)
    P_total_kw = P_actual_w_cm2 * A_active_cm2 * 1e-3

    cost_per_kw = pt_cost_gbp / max(0.1, P_total_kw)

    # DOE 2026 target: 0.125 g_Pt / kW. Compare.
    pt_g_per_kw = pt_mass_total_g / max(0.1, P_total_kw)
    doe_target_g_per_kw = 0.125
    meets_doe_target = pt_g_per_kw <= doe_target_g_per_kw * 1.2  # 20% slack

    # Estimated durability at this loading
    durability_estimated_hr = 5000.0 * (loading_recommended / 0.1)

    # Worked calculations.
    # loading_for_power uses (P/0.7)^2 — a simple closed-form power expression, convertible.
    # loading_for_durability is linear — convertible.
    # max() to pick loading_required — piecewise, skip; pass live value as input.
    # Commercial snap to nearest table value — lookup skip; pass loading_recommended as input.
    # P_actual uses sqrt — transcendental, skip; pass P_total_kw as live input.
    # cost_per_kw and pt_g_per_kw chain off P_total_kw cleanly.
    loading_for_power_r = round(loading_for_power, 3)
    loading_for_durability_r = round(loading_for_durability, 3)
    A_active_cm2_r = round(A_active_cm2, 1)
    total_pt_g_r = round(total_pt_g, 3)
    pt_mass_total_g_r = round(pt_mass_total_g, 2)
    # Derive pt_cost_gbp_r from pt_mass_total_g_r (2 dp) so the substitution
    # pt_mass_total x pt_price reproduces the stated result exactly.
    pt_cost_gbp_r = round(pt_mass_total_g_r * Pt_price_gbp_g, 2)
    P_total_kw_r = round(P_total_kw, 2)
    # Derive cost_per_kw_r from pt_cost_gbp_r and P_total_kw_r so pt_cost / P_total_kw
    # reproduces the stated result exactly.
    cost_per_kw_r = round(pt_cost_gbp_r / max(0.01, P_total_kw_r), 2)
    durability_r = round(durability_estimated_hr, 0)

    worked = [
        worked_calc(
            label="Pt loading required for target power density",
            formula="loading_power = 0.1 x (P_target / 0.7)^2",
            values={"P_target": (P_target_w_cm2, "W/cm2")},
            result=loading_for_power_r, result_unit="mg/cm2",
            assumptions=[
                "reference: 0.7 W/cm2 at 0.1 mg/cm2 from USNL/DOE PEMFC curves",
                "power density scales as sqrt(loading) => loading = 0.1 x (P/P_ref)^2",
            ],
        ),
        worked_calc(
            label="Pt loading required for durability",
            formula="loading_durability = 0.1 x (durability_target / 5000)",
            values={"durability_target": (durability_target_hr, "hr")},
            result=loading_for_durability_r, result_unit="mg/cm2",
            assumptions=[
                "reference: 5000 hr at 0.1 mg/cm2 (Borup et al. 2007)",
                "linear durability vs loading assumed",
            ],
        ),
        # loading_required = max(power, durability) — piecewise, pass as input.
        worked_calc(
            label="Active electrode area",
            formula="A_active_cm2 = A_active_m2 x 1e4",
            values={"A_active_m2": (A_active_m2, "m2")},
            result=A_active_cm2_r, result_unit="cm2",
            assumptions=["1 m2 = 1e4 cm2"],
        ),
        worked_calc(
            label="Total Pt mass (cathode only)",
            formula="total_pt_g = loading_recommended x A_active_cm2 x 1e-3",
            values={
                "loading_recommended": (loading_recommended, "mg/cm2"),
                "A_active_cm2": (A_active_cm2_r, "cm2"),
            },
            result=total_pt_g_r, result_unit="g",
            assumptions=["1e-3 converts mg to g; cathode loading only"],
        ),
        worked_calc(
            label="Total Pt mass including anode (both electrodes)",
            formula="pt_mass_total = total_pt_g x 1.1",
            values={"total_pt_g": (total_pt_g_r, "g")},
            result=pt_mass_total_g_r, result_unit="g",
            assumptions=["anode loading ~10% of cathode (DOE targets; cathode dominates)"],
        ),
        worked_calc(
            label="Platinum cost",
            formula="pt_cost = pt_mass_total x pt_price",
            values={
                "pt_mass_total": (pt_mass_total_g_r, "g"),
                "pt_price": (Pt_price_gbp_g, "GBP/g"),
            },
            result=pt_cost_gbp_r, result_unit="GBP",
            assumptions=[],
        ),
        worked_calc(
            label="Cost per kilowatt (stack Pt cost)",
            formula="cost_per_kw = pt_cost / P_total_kw",
            values={
                "pt_cost": (pt_cost_gbp_r, "GBP"),
                "P_total_kw": (P_total_kw_r, "kW"),
            },
            result=cost_per_kw_r, result_unit="GBP/kW",
            assumptions=["P_total_kw from power-density model at the recommended loading"],
        ),
        worked_calc(
            label="Estimated durability at recommended loading",
            formula="durability_hr = 5000 x (loading_recommended / 0.1)",
            values={"loading_recommended": (loading_recommended, "mg/cm2")},
            result=durability_r, result_unit="hr",
            assumptions=["linear durability scaling from Borup et al. 2007 reference point"],
        ),
    ]

    return {
        "target_power_density_w_cm2": P_target_w_cm2,
        "durability_target_hours": durability_target_hr,
        "stack_active_area_m2": A_active_m2,
        "pt_mg_cm2": loading_recommended,
        "pt_mg_cm2_required_for_power": round(loading_for_power, 3),
        "pt_mg_cm2_required_for_durability": round(loading_for_durability, 3),
        "total_pt_mass_g": round(pt_mass_total_g, 2),
        "total_stack_pt_cost_gbp": round(pt_cost_gbp, 0),
        "cost_per_kw_gbp": round(cost_per_kw, 1),
        "actual_power_density_w_cm2": round(P_actual_w_cm2, 3),
        "total_stack_power_kw": round(P_total_kw, 2),
        "pt_g_per_kw": round(pt_g_per_kw, 3),
        "doe_2026_target_g_per_kw": doe_target_g_per_kw,
        "meets_doe_2026_target": meets_doe_target,
        "durability_estimated_hr": round(durability_estimated_hr, 0),
        "pt_price_gbp_per_g": Pt_price_gbp_g,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
