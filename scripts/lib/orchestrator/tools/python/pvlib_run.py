#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pvlib_run.py

Real pvlib wrapper for solar irradiance + sun position. Reads JSON from
stdin, writes JSON to stdout.

Input:
    {
      "latitude": 45.0,
      "longitude": 0.0,
      "altitude_m": 20000,
      "time_utc": "2026-06-21T12:00:00",
      "model": "ineichen"  # optional: "ineichen" (default) | "simplified_solis" | "extraterrestrial"
    }

Output:
    {
      "ghi": 1380.5,                       # W/m² (global horizontal irradiance)
      "dni": 1320.1,                       # W/m² (direct normal)
      "dhi": 88.2,                         # W/m² (diffuse horizontal)
      "solar_elevation_deg": 68.4,
      "solar_azimuth_deg": 180.0,
      "solar_zenith_deg": 21.6,
      "extraterrestrial_w_m2": 1322.0,
      "_meta": { ... }
    }

Use:
- HAPS solar-power budgets at high altitudes (>15 km) use the
  "extraterrestrial" model (no Earth atmosphere left to absorb anything).
- Ground-level PV uses Ineichen or simplified Solis with Linke turbidity.

License: BSD-3-Clause. Source: github.com/pvlib/pvlib-python
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'pvlib python',
    "tool_version": '0.15.1',
    "tool_license": 'BSD-3-Clause',
    "tool_source_url": 'https://github.com/pvlib/pvlib-python',
    "tool_paper": "Anderson, Hansen, Holmgren, Jensen, Mikofski, Driesse (2023), 'pvlib python: 2023 project update', Journal of Open Source Software 8(92):5994",
    "tool_doi": '10.21105/joss.05994',
    "physics_basis": 'Solar geometry per NREL SPA algorithm (Reda & Andreas 2004); clear-sky irradiance via Ineichen-Perez 2002 or Simplified Solis (Mueller 2004); ET radiation from solar constant 1366.1 W/m².',
    "confidence_class": 'library',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    import pvlib
    import pandas as pd

    latitude = float(payload.get("latitude", 45.0))
    longitude = float(payload.get("longitude", 0.0))
    altitude_m = float(payload.get("altitude_m", 0.0))
    time_utc = payload.get("time_utc", "2026-06-21T12:00:00")
    model = safe_choice(str(payload.get("model", "ineichen")).lower(), ("ineichen", "simplified_solis", "extraterrestrial"), default="ineichen", label="model")

    # FAIL-SOFT: an unparseable time_utc (the planner may wire garbage) falls
    # back to the noon-solstice default rather than raising a DateParseError.
    try:
        times = pd.DatetimeIndex([time_utc], tz="UTC")
    except Exception:
        time_utc = "2026-06-21T12:00:00"
        times = pd.DatetimeIndex([time_utc], tz="UTC")
    location = pvlib.location.Location(
        latitude=latitude,
        longitude=longitude,
        tz="UTC",
        altitude=altitude_m,
    )

    # Solar position (zenith, elevation, azimuth) at the requested time
    solpos = pvlib.solarposition.get_solarposition(times, latitude, longitude, altitude=altitude_m)
    zenith_deg = float(solpos["apparent_zenith"].iloc[0])
    elevation_deg = float(solpos["apparent_elevation"].iloc[0])
    azimuth_deg = float(solpos["azimuth"].iloc[0])

    # Extraterrestrial irradiance (top-of-atmosphere) — depends on day-of-year only
    extra_dni = float(pvlib.irradiance.get_extra_radiation(times[0]))
    # Project ET-DNI onto horizontal plane: ET-GHI = ET-DNI × cos(zenith)
    import math
    cos_z = max(0.0, math.cos(math.radians(zenith_deg)))
    extra_ghi = extra_dni * cos_z

    out: dict = {
        "latitude_deg": latitude,
        "longitude_deg": longitude,
        "altitude_m": altitude_m,
        "time_utc": time_utc,
        "solar_zenith_deg": round(zenith_deg, 3),
        "solar_elevation_deg": round(elevation_deg, 3),
        "solar_azimuth_deg": round(azimuth_deg, 3),
        "extraterrestrial_dni_w_m2": round(extra_dni, 2),
        "extraterrestrial_ghi_w_m2": round(extra_ghi, 2),
        "model": model,
    }

    if model == "extraterrestrial":
        # Above the atmosphere. The atmosphere transmits ~98% at 20 km even
        # for sea-level paths; for HAPS pointing the sun we model it as the
        # extraterrestrial flux directly.
        out["ghi"] = round(extra_ghi, 2)
        out["dni"] = round(extra_dni, 2)
        out["dhi"] = 0.0  # no atmosphere to diffuse
    else:
        # Ineichen / simplified_solis clear-sky model (ground-level)
        clearsky = location.get_clearsky(times, model=model)
        out["ghi"] = round(float(clearsky["ghi"].iloc[0]), 2)
        out["dni"] = round(float(clearsky["dni"].iloc[0]), 2)
        out["dhi"] = round(float(clearsky["dhi"].iloc[0]), 2)

    return out


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
