#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/coolprop_run.py

Real CoolProp wrapper for the orchestrator. Reads JSON input from stdin,
writes JSON output to stdout.

Input:
    {"fluid": "r290", "temperature_c": 35}

Output:
    {
      "fluid": "R290",
      "saturation_temp_at_10bar_c": 27.7,
      "saturation_pressure_at_temp_bar": 12.3,
      "liquid_density_kg_m3": 500.1,
      ...
    }

Usage: invoked via subprocess from coolprop-real.ts. Pure stdin/stdout.

License: MIT (CoolProp itself is MIT). https://coolprop.org
"""
from __future__ import annotations

import json
import sys

# Map orchestrator fluid codes to CoolProp fluid names
FLUID_MAP = {
    "r290": "R290",
    "r32": "R32",
    "r410a": "R410A",
    "r513a": "R513A",
    "water": "Water",
    "water_glycol_50": "INCOMP::APG[0.50]",  # Aqueous propylene glycol 50% via INCOMP
    "co2": "CO2",
    "ammonia": "Ammonia",
}


def compute(payload: dict) -> dict:
    import CoolProp.CoolProp as CP

    fluid_in = str(payload.get("fluid", "")).strip().lower()
    fluid = FLUID_MAP.get(fluid_in)
    if not fluid:
        raise ValueError(f"unknown fluid code: {fluid_in!r} (supported: {list(FLUID_MAP.keys())})")

    t_c = float(payload.get("temperature_c", 25.0))
    t_k = t_c + 273.15

    # Some incompressible mixtures don't support all queries; wrap.
    out: dict = {"fluid": fluid}

    # Saturation temp at 1 MPa (10 bar) — fixed reference point for comparison
    try:
        t_sat_at_10bar_c = CP.PropsSI("T", "P", 10e5, "Q", 0, fluid) - 273.15
        out["saturation_temp_at_10bar_c"] = round(t_sat_at_10bar_c, 2)
    except Exception:
        out["saturation_temp_at_10bar_c"] = None

    # Saturation pressure at the requested temperature
    try:
        p_sat = CP.PropsSI("P", "T", t_k, "Q", 0, fluid)
        out["saturation_pressure_at_temp_bar"] = round(p_sat / 1e5, 3)
    except Exception:
        out["saturation_pressure_at_temp_bar"] = None

    # Liquid + vapour densities at saturation at t_k
    try:
        out["liquid_density_kg_m3"] = round(CP.PropsSI("D", "T", t_k, "Q", 0, fluid), 2)
    except Exception:
        out["liquid_density_kg_m3"] = None
    try:
        out["vapour_density_kg_m3"] = round(CP.PropsSI("D", "T", t_k, "Q", 1, fluid), 3)
    except Exception:
        out["vapour_density_kg_m3"] = None

    # Enthalpies at saturation
    try:
        out["enthalpy_liquid_kj_kg"] = round(CP.PropsSI("H", "T", t_k, "Q", 0, fluid) / 1000.0, 2)
    except Exception:
        out["enthalpy_liquid_kj_kg"] = None
    try:
        out["enthalpy_vapour_kj_kg"] = round(CP.PropsSI("H", "T", t_k, "Q", 1, fluid) / 1000.0, 2)
    except Exception:
        out["enthalpy_vapour_kj_kg"] = None

    if out["enthalpy_liquid_kj_kg"] is not None and out["enthalpy_vapour_kj_kg"] is not None:
        out["latent_heat_kj_kg"] = round(out["enthalpy_vapour_kj_kg"] - out["enthalpy_liquid_kj_kg"], 2)
    else:
        out["latent_heat_kj_kg"] = None

    # Liquid specific heat
    try:
        out["cp_liquid_kj_kgk"] = round(CP.PropsSI("C", "T", t_k, "Q", 0, fluid) / 1000.0, 3)
    except Exception:
        out["cp_liquid_kj_kgk"] = None

    # Flammability class (ASHRAE)
    flammability_classes = {
        "R290": "A3",
        "R32": "A2L",
        "R410A": "A1",
        "R513A": "A1",
        "Water": "A1",
        "INCOMP::APG[0.50]": "A1",
        "CO2": "A1",
        "Ammonia": "B2L",
    }
    out["flammability_class"] = flammability_classes.get(fluid, "unknown")

    return out


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2

    try:
        result = compute(payload)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
