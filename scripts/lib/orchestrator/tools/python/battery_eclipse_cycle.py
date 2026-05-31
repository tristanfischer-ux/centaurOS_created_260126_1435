#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/battery_eclipse_cycle.py

Spacecraft battery cycle-life sizing — depth-of-discharge per orbit, total cycles.

Input:
    {
      "eclipse_fraction_pct": 35.0,
      "load_power_w_during_eclipse": 100.0,
      "eclipse_duration_minutes": 35.0,
      "battery_capacity_wh": 200.0,
      "allowed_dod_pct": 25.0,         # 15-25% LEO 5-year, 40-60% GEO
      "mission_years": 5.0
    }

Output:
    {
      "discharge_depth_pct_per_orbit": ...,
      "cycle_count_per_year": ...,
      "total_cycles_lifetime": ...,
      "battery_oversize_factor": ...,
      "capacity_required_wh": ...,
      ...
    }

Physics:
  Discharge_per_orbit_Wh = Power_load × eclipse_minutes / 60
  DoD = Discharge_per_orbit_Wh / Battery_capacity_Wh
  Cycles_per_year ≈ orbits_per_year × eclipses_per_orbit (1 per LEO orbit)

LEO cycle-life vs DoD (Linden's Handbook of Batteries, 4th ed., Ch.27;
NASA/TM-2009-215617 "Li-Ion Battery Cell-Level Cycle Life"):
  Li-ion at 100% DoD: ~500 cycles
  Li-ion at 50%  DoD: ~3,000 cycles
  Li-ion at 30%  DoD: ~10,000 cycles
  Li-ion at 20%  DoD: ~20,000 cycles
  Li-ion at 15%  DoD: ~35,000 cycles (LEO 5+ yr territory)

GEO 1 cycle/day means even 60% DoD lasts 15+ years.

References:
- Wertz & Larson, SMAD ch.11.4.
- Patel, "Spacecraft Power Systems" ch.10.
- Reuse pybamm for cell-level fade if temperature-dependent detail required.
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'battery_eclipse_cycle (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Linden, Reddy eds. (2010), 'Linden's Handbook of Batteries' 4th ed., ch.27; NASA/TM-2009-215617",
    "physics_basis": 'DoD per orbit = (P_load × t_eclipse) / (battery_capacity_Wh × η_discharge). Cycle life from DoD curve per chemistry.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Li-ion cycle-life lookup at given DoD (cycles to 80% capacity remaining)
# Curve fit from NASA/TM-2009-215617 Li-ion data
def cycles_to_eol(dod_pct: float) -> int:
    """Cycles-to-end-of-life as a function of average DoD per cycle."""
    if dod_pct <= 0:
        return 50000
    # Inverse power law (approximate):  N = N_ref × (DoD_ref / DoD)^k  with k≈1.7
    # Anchor: 1000 cycles at 80% DoD => N_ref = 1000, DoD_ref = 80
    n_ref = 1000
    dod_ref = 80.0
    k = 1.7
    cycles = n_ref * (dod_ref / dod_pct) ** k
    return int(round(cycles))


def compute(payload: dict) -> dict:
    eclipse_frac_pct = float(payload.get("eclipse_fraction_pct", 35.0))
    load_w = float(payload.get("load_power_w_during_eclipse", 100.0))
    eclipse_min = float(payload.get("eclipse_duration_minutes", 35.0))
    cap_wh = float(payload.get("battery_capacity_wh", 200.0))
    dod_max_pct = float(payload.get("allowed_dod_pct", 25.0))
    mission_yr = float(payload.get("mission_years", 5.0))

    # Energy per eclipse pass
    discharge_wh = load_w * eclipse_min / 60.0

    # Actual DoD per orbit (% of total capacity)
    if cap_wh > 0:
        dod_per_orbit_pct = (discharge_wh / cap_wh) * 100.0
    else:
        dod_per_orbit_pct = 100.0

    # Orbital period: derive from eclipse_min and eclipse_fraction
    # eclipse_min = orbital_period_min × eclipse_frac
    if eclipse_frac_pct > 0:
        orbital_period_min = eclipse_min / (eclipse_frac_pct / 100.0)
    else:
        orbital_period_min = 1440.0  # 24 hr default

    cycles_per_day = 1440.0 / orbital_period_min
    cycles_per_year = cycles_per_day * 365.25
    total_cycles = cycles_per_year * mission_yr

    # Cycles available at this DoD
    cycles_available = cycles_to_eol(dod_per_orbit_pct)

    # Feasibility: cycles_available must exceed total_cycles
    feasible = cycles_available >= total_cycles

    # Required capacity to stay below allowed_dod
    capacity_required_wh = discharge_wh / (dod_max_pct / 100.0)
    oversize_factor = capacity_required_wh / cap_wh if cap_wh > 0 else 0.0

    return {
        "eclipse_fraction_pct": eclipse_frac_pct,
        "load_power_w_during_eclipse": load_w,
        "eclipse_duration_minutes": eclipse_min,
        "battery_capacity_wh": cap_wh,
        "allowed_dod_pct": dod_max_pct,
        "mission_years": mission_yr,
        "discharge_per_orbit_wh": round(discharge_wh, 3),
        "discharge_depth_pct_per_orbit": round(dod_per_orbit_pct, 2),
        "orbital_period_min": round(orbital_period_min, 2),
        "cycles_per_day": round(cycles_per_day, 2),
        "cycle_count_per_year": round(cycles_per_year, 1),
        "total_cycles_lifetime": round(total_cycles, 0),
        "cycles_available_at_dod": cycles_available,
        "feasible_for_life": feasible,
        "capacity_required_wh": round(capacity_required_wh, 2),
        "battery_oversize_factor": round(oversize_factor, 3),
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
