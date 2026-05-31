#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/psychrolib_run.py

Psychrometric calculation wrapper using psychrolib (ASHRAE 2017).
Reads JSON from stdin, writes JSON to stdout.

Input:
    {
      "dry_bulb_c": 25.0,
      "relative_humidity_pct": 60.0,
      "pressure_pa": 101325
    }

Output:
    {
      "dew_point_c": 16.7,
      "wet_bulb_c": 19.5,
      "humidity_ratio_kg_kg": 0.0118,
      "enthalpy_kj_kg": 55.3,
      "specific_volume_m3_kg": 0.857,
      "vapor_pressure_pa": 1898.5,
      ...
    }

Use: vertical-farm HVAC, heat-pump dehumidification, greenhouse climate.
ASHRAE 2017 Handbook of Fundamentals psychrometric equations.

License: MIT. Source: github.com/psychrometrics/psychrolib
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'PsychroLib',
    "tool_version": '2.5.0',
    "tool_license": 'MIT',
    "tool_source_url": 'https://github.com/psychrometrics/psychrolib',
    "tool_paper": "Meyer, Thevenard (2019), 'PsychroLib: a library of psychrometric functions to calculate thermodynamic properties of air', Journal of Open Source Software 4(33):1137",
    "tool_doi": '10.21105/joss.01137',
    "physics_basis": 'ASHRAE 2017 Handbook of Fundamentals chapter 1 psychrometric formulations. Hyland-Wexler vapour-pressure correlations (1983).',
    "confidence_class": 'library',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    import psychrolib as psy

    psy.SetUnitSystem(psy.SI)

    dry_bulb_c = float(payload.get("dry_bulb_c", 25.0))
    rh_frac = float(payload.get("relative_humidity_pct", 60.0)) / 100.0
    pressure_pa = float(payload.get("pressure_pa", 101325))

    # Calculate full psychrometric state from dry-bulb + RH + pressure.
    # CalcPsychrometricsFromRelHum returns:
    #   HumRatio, TWetBulb, TDewPoint, VapPres, MoistAirEnthalpy,
    #   MoistAirVolume, DegreeOfSaturation
    (hum_ratio, t_wb, t_dp, vap_pres, enthalpy_j_kg, sp_vol, deg_sat) = (
        psy.CalcPsychrometricsFromRelHum(dry_bulb_c, rh_frac, pressure_pa)
    )

    return {
        "dry_bulb_c": dry_bulb_c,
        "relative_humidity_pct": rh_frac * 100.0,
        "pressure_pa": pressure_pa,
        "dew_point_c": round(t_dp, 3),
        "wet_bulb_c": round(t_wb, 3),
        "humidity_ratio_kg_kg": round(hum_ratio, 6),
        "enthalpy_kj_kg": round(enthalpy_j_kg / 1000.0, 3),
        "specific_volume_m3_kg": round(sp_vol, 4),
        "vapor_pressure_pa": round(vap_pres, 2),
        "degree_of_saturation": round(deg_sat, 4),
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
