#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/power_module_sizing.py

Power module count + cabinet sizing for DC fast chargers. Reads JSON
from stdin, writes JSON to stdout.

Input:
    {
      "total_power_kw": 150.0,
      "module_unit_kw": 25.0,          # individual converter module rating
      "redundancy_n_plus": "N+1",      # "N"|"N+1"|"N+2"
      "module_efficiency_pct": 95.0,
      "load_factor": 0.7                # average load relative to rated
    }

Output:
    {
      "module_count_required": 6,
      "module_count_with_redundancy": 7,
      "cabinet_size": "single_cabinet",
      "efficiency_at_partial_load_pct": 94.5,
      "rated_output_kw": 175,
      ...
    }

Architecture: parallelised stack of fixed-rating DC-DC modules
(20/25/30/50 kW units). Modules are hot-swappable; failure of one
unit drops capacity by its rating. Common module ratings:
- Phoenix Contact EV-Charging Power Cabinet: 25 kW or 30 kW modules
- Tritium PKM: 25 kW modules
- ABB Terra: 30 kW modules
- KemPower Satellite: 50 kW modules
- Tesla Supercharger V4: 75 kW modules

Cabinet sizing rules of thumb (CharIN, Heliox engineering data):
- ≤6 modules: single cabinet (~700×1500×600 mm)
- 7-12 modules: large cabinet (~1200×2000×800 mm)
- 13-20 modules: dual cabinet
- >20 modules: multiple cabinets, distributed

Efficiency vs load (typical SiC-based modules):
- 10% load: ~89%
- 25% load: ~94%
- 50% load: ~96%
- 75% load: ~96.5%
- 100% load: ~95% (slightly worse at full load due to thermal stress)

References:
- CharIN Public DC Charging white paper (2022)
- Heliox "Modular DC Fast Charger Architecture" tech brief
- Phoenix Contact EV charging brochure
- ABB Terra DC datasheet
- Wirth, "Power Electronics" 4th ed.
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
    "tool_name": 'power_module_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'CharIN High-Power Charging White Paper (2022); Phoenix Contact CCS Datasheets; ABB Terra HP Datasheet; Tritium Veefil Series',
    "physics_basis": 'Module count = ceil(P_rated / P_per_module) + N redundancy. Efficiency at part-load per module datasheet η(load_fraction).',
    "confidence_class": 'datasheet',
    "last_reviewed_date": "2026-05-22",
}


# Module efficiency curve: load_fraction -> efficiency
# Typical SiC-based modular DC charger
EFFICIENCY_CURVE = [
    (0.05, 0.82),
    (0.10, 0.89),
    (0.25, 0.94),
    (0.50, 0.96),
    (0.75, 0.965),
    (1.00, 0.95),
]


def interp_efficiency(load_fraction: float, peak_efficiency_pct: float) -> float:
    """Interpolate efficiency. Scales curve by ratio of peak_efficiency to 96.5%."""
    if load_fraction <= EFFICIENCY_CURVE[0][0]:
        eff = EFFICIENCY_CURVE[0][1]
    elif load_fraction >= EFFICIENCY_CURVE[-1][0]:
        eff = EFFICIENCY_CURVE[-1][1]
    else:
        for i in range(1, len(EFFICIENCY_CURVE)):
            if EFFICIENCY_CURVE[i - 1][0] <= load_fraction <= EFFICIENCY_CURVE[i][0]:
                x0, y0 = EFFICIENCY_CURVE[i - 1]
                x1, y1 = EFFICIENCY_CURVE[i]
                t = (load_fraction - x0) / (x1 - x0)
                eff = y0 + t * (y1 - y0)
                break
        else:
            eff = EFFICIENCY_CURVE[-1][1]

    # Scale to the spec peak efficiency
    eff_pct = eff * 100.0
    scale = peak_efficiency_pct / 96.5
    return min(eff_pct * scale, peak_efficiency_pct)


def compute(payload: dict) -> dict:
    total_power_kw = float(payload.get("total_power_kw", 150.0))
    module_unit_kw = float(payload.get("module_unit_kw", 25.0))
    redundancy = str(payload.get("redundancy_n_plus", "N+1"))
    peak_efficiency_pct = float(payload.get("module_efficiency_pct", 95.0))
    load_factor = float(payload.get("load_factor", 0.7))

    if module_unit_kw <= 0:
        module_unit_kw = 25.0

    n_required = math.ceil(total_power_kw / module_unit_kw)

    redundancy_add = {"N": 0, "N+1": 1, "N+2": 2}.get(redundancy, 1)
    n_total = n_required + redundancy_add

    # Real rated output (capacity if all modules active)
    rated_output_kw = n_total * module_unit_kw

    # Cabinet sizing
    if n_total <= 6:
        cabinet_size = "single_cabinet"
        cabinet_dimensions_mm = "700 x 1500 x 600"
        cabinets = 1
    elif n_total <= 12:
        cabinet_size = "large_cabinet"
        cabinet_dimensions_mm = "1200 x 2000 x 800"
        cabinets = 1
    elif n_total <= 20:
        cabinet_size = "dual_cabinet"
        cabinet_dimensions_mm = "2 × 1200 x 2000 x 800"
        cabinets = 2
    else:
        cabinet_size = "multi_cabinet"
        cabinets = math.ceil(n_total / 12)
        cabinet_dimensions_mm = f"{cabinets} × 1200 x 2000 x 800"

    # Partial-load efficiency at the given load_factor
    # At load_factor=0.7, each active module runs at 0.7 of its rating
    eff_at_partial = interp_efficiency(load_factor, peak_efficiency_pct)
    eff_at_full = interp_efficiency(1.0, peak_efficiency_pct)

    # Annual energy throughput at typical CSO utilisation (~6 hours/day at avg load)
    avg_kw_drawn = total_power_kw * load_factor
    annual_kwh_delivered = avg_kw_drawn * 6.0 * 365.0  # 6 hours/day rough estimate

    # Capex hint: $50-200/kW for modular DC charger hardware (CharIN 2022 data)
    capex_per_kw_low = 50.0
    capex_per_kw_high = 200.0
    capex_low = rated_output_kw * capex_per_kw_low
    capex_high = rated_output_kw * capex_per_kw_high

    # Module mass: typical SiC module = 15-25 kg per 25 kW unit
    mass_per_module_kg = 18.0
    total_module_mass_kg = mass_per_module_kg * n_total

    # Worked calculations — closed-form arithmetic steps only.
    # n_required uses ceil() — skipped; passed as rounded input.
    # Efficiency is from piecewise-interpolated curve — skipped.
    rated_output_r = round(rated_output_kw, 1)
    avg_kw_r = round(avg_kw_drawn, 2)
    annual_kwh_r = round(annual_kwh_delivered, 0)
    capex_low_r = round(capex_low, 0)
    capex_high_r = round(capex_high, 0)
    mass_r = round(total_module_mass_kg, 1)

    worked = [
        worked_calc(
            label="Rated output power of installed modules",
            formula="rated_output_kw = n_total x module_unit_kw",
            values={"n_total": (n_total, ""), "module_unit_kw": (module_unit_kw, "kW")},
            result=rated_output_r, result_unit="kW",
            assumptions=[
                f"n_total = n_required + redundancy_add = {n_required} + {redundancy_add} = {n_total}",
                "n_required = ceil(total_power / module_unit_kw) — ceiling applied before this step",
            ],
        ),
        worked_calc(
            label="Average power drawn at stated load factor",
            formula="avg_kw = total_power_kw x load_factor",
            values={"total_power_kw": (total_power_kw, "kW"), "load_factor": (load_factor, "")},
            result=avg_kw_r, result_unit="kW",
            assumptions=["load_factor is the average utilisation fraction of rated power"],
        ),
        worked_calc(
            label="Annual energy delivered (rough estimate)",
            formula="annual_kwh = avg_kw x 6 x 365",
            values={"avg_kw": (avg_kw_r, "kW")},
            result=annual_kwh_r, result_unit="kWh/year",
            assumptions=["6 hours/day average utilisation at charge-site (CharIN 2022 CSO model)"],
        ),
        worked_calc(
            label="Capital expenditure range — lower bound",
            formula="capex_low = rated_output_kw x 50",
            values={"rated_output_kw": (rated_output_r, "kW")},
            result=capex_low_r, result_unit="USD",
            assumptions=["USD 50/kW installed cost — low end of CharIN 2022 modular DC charger cost range"],
        ),
        worked_calc(
            label="Capital expenditure range — upper bound",
            formula="capex_high = rated_output_kw x 200",
            values={"rated_output_kw": (rated_output_r, "kW")},
            result=capex_high_r, result_unit="USD",
            assumptions=["USD 200/kW installed cost — high end of CharIN 2022 modular DC charger cost range"],
        ),
        worked_calc(
            label="Total module mass",
            formula="mass_kg = 18 x n_total",
            values={"n_total": (n_total, "")},
            result=mass_r, result_unit="kg",
            assumptions=["18 kg per module — typical SiC-based 25 kW modular DC charger unit (Phoenix Contact / ABB Terra datasheets)"],
        ),
    ]

    return {
        "total_power_kw_requested": total_power_kw,
        "module_unit_kw": module_unit_kw,
        "module_count_required": n_required,
        "module_count_with_redundancy": n_total,
        "module_count_redundant_only": redundancy_add,
        "redundancy_scheme": redundancy,
        "rated_output_kw": rated_output_kw,
        "cabinet_size": cabinet_size,
        "cabinet_dimensions_mm": cabinet_dimensions_mm,
        "cabinet_count": cabinets,
        "peak_efficiency_pct": peak_efficiency_pct,
        "efficiency_at_partial_load_pct": round(eff_at_partial, 2),
        "efficiency_at_full_load_pct": round(eff_at_full, 2),
        "load_factor_assumed": load_factor,
        "annual_kwh_delivered_estimate": round(annual_kwh_delivered, 0),
        "capex_usd_low": round(capex_low, 0),
        "capex_usd_high": round(capex_high, 0),
        "total_module_mass_kg": round(total_module_mass_kg, 1),
        "_meta": {
            "model": "Modular DC charger sizing with N+ redundancy + efficiency curve",
            "references": [
                "CharIN Public DC Charging white paper 2022",
                "Phoenix Contact / ABB Terra / Tritium modular datasheets",
                "Heliox modular DC charger tech brief",
            ],
        },
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
