#!/usr/bin/env python3
"""
rotor_centrifugal_stress.py — analytical rim / sleeve hoop stress at speed.

STAGED → motor:rotor-centrifugal-stress
"""
from __future__ import annotations

import json
import math
import sys

HARD = ["rotor_od_mm", "speed_rpm", "density_kg_m3", "allowable_stress_mpa"]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    od_mm = float(inp["rotor_od_mm"])
    n = float(inp["speed_rpm"])
    rho = float(inp["density_kg_m3"])
    allow_mpa = float(inp["allowable_stress_mpa"])
    if min(od_mm, n, rho, allow_mpa) <= 0:
        raise ValueError("HARD inputs must be > 0")

    r = (od_mm / 1000.0) / 2.0
    omega = n * 2.0 * math.pi / 60.0
    # Thin rotating ring: σ = ρ ω² r²
    sigma_pa = rho * (omega ** 2) * (r ** 2)
    sigma_mpa = sigma_pa / 1e6
    margin = allow_mpa / sigma_mpa if sigma_mpa > 0 else float("inf")
    tip = omega * r

    sleeve_od_mm = inp.get("sleeve_od_mm")
    sleeve_thk_mm = inp.get("sleeve_thickness_mm")
    sleeve_e_gpa = float(inp.get("sleeve_e_gpa", 200.0))
    sleeve_hoop_mpa = None
    if sleeve_od_mm and sleeve_thk_mm:
        rs = (float(sleeve_od_mm) / 1000.0) / 2.0
        # Order-of-magnitude hoop if sleeve carries the rim mass as pressure proxy
        # σ_hoop ≈ ρ_rotor · ω² · r² · (r / t) simplified — flag as estimate
        t = float(sleeve_thk_mm) / 1000.0
        sleeve_hoop_mpa = rho * (omega ** 2) * (r ** 2) * (r / max(t, 1e-6)) / 1e6
        _ = sleeve_e_gpa  # reserved for interference-fit extension

    warnings: list[str] = []
    if margin < 1.5:
        warnings.append(f"stress margin {margin:.2f} < 1.5 — retention redesign required")
    if tip > 250:
        warnings.append(f"tip speed {tip:.0f} m/s extreme for most magnet retention systems")

    return {
        "tip_speed_m_s": round(tip, 2),
        "rim_hoop_stress_mpa": round(sigma_mpa, 2),
        "allowable_stress_mpa": allow_mpa,
        "stress_margin": round(margin, 3),
        "sleeve_hoop_stress_mpa_estimate": (
            None if sleeve_hoop_mpa is None else round(sleeve_hoop_mpa, 2)
        ),
        "pass": margin >= 1.5,
        "warnings": warnings,
    }


def _selftest() -> None:
    ok = solve({
        "rotor_od_mm": 80.0,
        "speed_rpm": 30000.0,
        "density_kg_m3": 7800.0,
        "allowable_stress_mpa": 800.0,
    })
    assert ok["rim_hoop_stress_mpa"] > 0
    bad = solve({
        "rotor_od_mm": 120.0,
        "speed_rpm": 100000.0,
        "density_kg_m3": 7800.0,
        "allowable_stress_mpa": 200.0,
    })
    assert bad["pass"] is False
    print("rotor_centrifugal_stress selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    try:
        print(json.dumps(solve(json.load(sys.stdin))))
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"JSON parse: {exc}"})); sys.exit(2)
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"})); sys.exit(3)
