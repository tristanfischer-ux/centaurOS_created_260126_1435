#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/delta_v_budget.py

Mission delta-V budget — sum + classify per-phase ΔV requirements.

Input:
    {
      "maneuvers": [
        {"name": "orbit insertion", "delta_v_ms": 50.0, "epoch_days_from_launch": 0.0},
        {"name": "stationkeeping yr1", "delta_v_ms": 12.0, "epoch_days_from_launch": 30.0},
        {"name": "EOL deorbit", "delta_v_ms": 150.0, "epoch_days_from_launch": 1825.0}
      ],
      "launch_vehicle": "Falcon_9",
      "orbit_target": "LEO_SSO",
      "mission_years": 5.0,
      "isp_assumed_s": 220.0,
      "dry_mass_kg": 500.0
    }

Output:
    {
      "total_delta_v_ms": ...,
      "launch_insertion_delta_v_ms": ...,
      "stationkeeping_delta_v_ms_per_year": ...,
      "deorbit_delta_v_ms": ...,
      "total_propellant_mass_kg": ...,
      "margin_pct": ...,
      ...
    }

Typical LEO ΔV budget (Wertz & Larson, SMAD ch.7):
  Orbit acquisition         ~50 m/s
  Stationkeeping (LEO drag)  3-15 m/s/yr
  Stationkeeping (GEO N-S)   45-55 m/s/yr (luni-solar)
  Stationkeeping (GEO E-W)    1-2 m/s/yr
  De-orbit (LEO < 25 yr rule) 100-250 m/s
  Disposal to grave (GEO)    11 m/s

Launch vehicle injection ΔV bias (insertion error compensation):
  Falcon 9:   5-15 m/s
  Vega-C:    10-30 m/s
  Long March 3B (with apogee kick): up to 1500 m/s for GTO->GEO

References:
- Wertz & Larson, "Space Mission Analysis and Design", 3rd ed., §7.6 (ΔV Budget).
- NASA Goddard "Mission Design Reference Manual".
- ESA "ESCAPE Launch Vehicle Performance Guide" (2024).
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'delta_v_budget (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wertz, Larson eds. (1999) 'Space Mission Analysis and Design' (SMAD) 3rd ed., §7.6",
    "physics_basis": 'Σ ΔV = transfer + station-keeping × lifetime + ADCS unloading + deorbit + margin. Each component sized per mission profile.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


G0 = 9.80665


# Per-orbit-class stationkeeping requirements (m/s/yr) — used as sanity check / default fill
ORBIT_SK_DEFAULTS = {
    "LEO_400km":  8.0,
    "LEO_SSO":    10.0,
    "MEO_GPS":    1.0,
    "GEO":        50.0,
    "L1":         5.0,
    "L2":         5.0,
}

# Launch vehicle injection error compensation (m/s)
LV_INJECTION_BIAS = {
    "Falcon_9":     15.0,
    "Ariane_6":     20.0,
    "Vega_C":       25.0,
    "Long_March_3B": 30.0,
    "Atlas_V":      20.0,
}


def compute(payload: dict) -> dict:
    maneuvers = payload.get("maneuvers", []) or []
    lv = str(payload.get("launch_vehicle", "Falcon_9"))
    orbit_target = str(payload.get("orbit_target", "LEO_SSO"))
    mission_years = float(payload.get("mission_years", 5.0))
    isp_s = float(payload.get("isp_assumed_s", 220.0))
    dry_kg = float(payload.get("dry_mass_kg", 500.0))

    if lv not in LV_INJECTION_BIAS:
        raise ValueError(f"unknown launch_vehicle {lv!r}; known: {list(LV_INJECTION_BIAS)}")
    if orbit_target not in ORBIT_SK_DEFAULTS:
        raise ValueError(f"unknown orbit_target {orbit_target!r}; known: {list(ORBIT_SK_DEFAULTS)}")

    # Classify maneuvers
    launch_insertion = 0.0
    stationkeeping = 0.0
    deorbit = 0.0
    other = 0.0

    for m in maneuvers:
        dv = float(m.get("delta_v_ms", 0.0))
        name = str(m.get("name", "")).lower()
        if any(k in name for k in ["insert", "acquisition", "launch", "transfer"]):
            launch_insertion += dv
        elif any(k in name for k in ["station", "drag", "maintenance"]):
            stationkeeping += dv
        elif any(k in name for k in ["deorbit", "disposal", "eol", "end of life", "grave"]):
            deorbit += dv
        else:
            other += dv

    # Add launch-vehicle injection bias
    lv_bias = LV_INJECTION_BIAS[lv]
    launch_insertion += lv_bias

    # If stationkeeping isn't supplied, fill from defaults
    if stationkeeping == 0.0 and mission_years > 0:
        sk_per_yr = ORBIT_SK_DEFAULTS[orbit_target]
        stationkeeping = sk_per_yr * mission_years
    if mission_years > 0:
        stationkeeping_per_year = stationkeeping / mission_years
    else:
        stationkeeping_per_year = 0.0

    total_dv = launch_insertion + stationkeeping + deorbit + other

    # Apply 10% margin (standard ESA practice)
    margin_pct = 10.0
    total_dv_with_margin = total_dv * (1.0 + margin_pct / 100.0)

    # Propellant mass from rocket equation
    ve = isp_s * G0
    mass_ratio = math.exp(total_dv_with_margin / ve)
    propellant_mass_kg = dry_kg * (mass_ratio - 1.0)

    return {
        "launch_vehicle": lv,
        "orbit_target": orbit_target,
        "mission_years": mission_years,
        "isp_assumed_s": isp_s,
        "dry_mass_kg": dry_kg,
        "lv_injection_bias_ms": lv_bias,
        "launch_insertion_delta_v_ms": round(launch_insertion, 2),
        "stationkeeping_delta_v_ms": round(stationkeeping, 2),
        "stationkeeping_delta_v_ms_per_year": round(stationkeeping_per_year, 3),
        "deorbit_delta_v_ms": round(deorbit, 2),
        "other_delta_v_ms": round(other, 2),
        "total_delta_v_ms": round(total_dv, 2),
        "margin_pct": margin_pct,
        "total_delta_v_with_margin_ms": round(total_dv_with_margin, 2),
        "mass_ratio": round(mass_ratio, 5),
        "total_propellant_mass_kg": round(propellant_mass_kg, 3),
        "n_maneuvers": len(maneuvers),
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
