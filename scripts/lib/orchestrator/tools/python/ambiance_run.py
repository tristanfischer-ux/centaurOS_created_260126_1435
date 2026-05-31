#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ambiance_run.py

ISA (International Standard Atmosphere) wrapper using the ambiance library.
Reads JSON from stdin, writes JSON to stdout.

Input:
    { "altitude_m": 20000 }

Output:
    {
      "altitude_m": 20000,
      "density_kg_m3": 0.0889,
      "pressure_pa": 5474.9,
      "temperature_k": 216.65,
      "speed_of_sound_m_s": 295.07,
      "dynamic_viscosity_pa_s": 1.421e-05,
      "kinematic_viscosity_m2_s": 1.598e-04,
      ...
    }

Use: HAPS / drone / aircraft design at any altitude up to 80 km.
Reference: ISO 2533:1975 / ICAO standard atmosphere.

License: MIT. Source: github.com/airinnova/ambiance
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'Ambiance',
    "tool_version": '1.3.1',
    "tool_license": 'MIT',
    "tool_source_url": 'https://github.com/airinnova/ambiance',
    "tool_paper": 'ICAO Manual of the ICAO Standard Atmosphere (Doc 7488/3, 1993); ISO 2533:1975',
    "physics_basis": 'ISA 1976 atmosphere model — hydrostatic equilibrium + ideal gas + piecewise-linear temperature lapse (troposphere -6.5K/km, stratosphere isothermal, mesosphere descending).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    from ambiance import Atmosphere

    altitude_m = float(payload.get("altitude_m", 0.0))
    atm = Atmosphere(altitude_m)

    return {
        "altitude_m": altitude_m,
        "density_kg_m3": round(float(atm.density[0]), 6),
        "pressure_pa": round(float(atm.pressure[0]), 3),
        "temperature_k": round(float(atm.temperature[0]), 3),
        "temperature_c": round(float(atm.temperature[0]) - 273.15, 3),
        "speed_of_sound_m_s": round(float(atm.speed_of_sound[0]), 3),
        "dynamic_viscosity_pa_s": float(atm.dynamic_viscosity[0]),
        "kinematic_viscosity_m2_s": float(atm.kinematic_viscosity[0]),
        "grav_accel_m_s2": round(float(atm.grav_accel[0]), 5),
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
