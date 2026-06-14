#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/aerosandbox_run.py

AeroSandbox airfoil analysis wrapper. Reads JSON from stdin, writes
JSON to stdout.

Input:
    {
      "airfoil_name": "NACA4412",   # NACA 4-digit or 6-digit code
      "alpha_deg": 5.0,             # angle of attack in degrees
      "reynolds": 500000,           # Re (kinematic-viscosity-based)
      "mach": 0.0                   # Mach number
    }

Output:
    {
      "airfoil_name": "NACA4412",
      "CL": 0.92,
      "CD": 0.0095,
      "CM": -0.105,
      "L_over_D": 96.8,
      "alpha_deg": 5.0,
      "reynolds": 500000,
      "mach": 0.0,
      "_meta": { ... }
    }

Use: low-Reynolds airfoil polars for HAPS wing sections and drone props.
Backend is NeuralFoil (XFoil-trained neural net) — fast and accurate down
to Re ~ 100k.

License: MIT. Source: github.com/peterdsharpe/AeroSandbox
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'AeroSandbox',
    "tool_version": '4.2.9',
    "tool_license": 'MIT',
    "tool_source_url": 'https://github.com/peterdsharpe/AeroSandbox',
    "tool_paper": "Sharpe (2021), 'AeroSandbox: A differentiable framework for aircraft design optimization', MIT MS Thesis",
    "physics_basis": 'VLM + 3D panel method + XFOIL airfoil polars (via NeuralFoil neural-network surrogate). Compressible flow corrections per Karman-Tsien.',
    "confidence_class": 'library',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    import aerosandbox as asb

    airfoil_name = str(payload.get("airfoil_name", "NACA4412"))
    alpha_deg = float(payload.get("alpha_deg", 5.0))
    reynolds = float(payload.get("reynolds", 500_000))
    mach = float(payload.get("mach", 0.0))

    # FAIL-SOFT: asb.Airfoil only synthesises coordinates for a valid NACA code;
    # an unrecognised name yields no geometry and NeuralFoil then crashes. The
    # planner may wire a non-NACA / garbage name, so fall back to NACA4412.
    af = asb.Airfoil(name=airfoil_name)
    if getattr(af, "coordinates", None) is None:
        airfoil_name = "NACA4412"
        af = asb.Airfoil(name=airfoil_name)
    # NeuralFoil-based polar — fast, no XFoil dependency
    aero = af.get_aero_from_neuralfoil(alpha=alpha_deg, Re=reynolds, mach=mach)

    cl = float(aero["CL"])
    cd = float(aero["CD"])
    cm = float(aero["CM"])

    return {
        "airfoil_name": airfoil_name,
        "alpha_deg": alpha_deg,
        "reynolds": reynolds,
        "mach": mach,
        "CL": round(cl, 4),
        "CD": round(cd, 6),
        "CM": round(cm, 4),
        "L_over_D": round(cl / max(1e-6, cd), 2),
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
