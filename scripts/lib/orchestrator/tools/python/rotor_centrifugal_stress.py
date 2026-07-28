#!/usr/bin/env python3
"""
rotor_centrifugal_stress.py — analytical rim / sleeve hoop stress at speed.

STAGED → motor:rotor-centrifugal-stress
"""
from __future__ import annotations

import json
import math
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from _worked import worked_calc  # noqa: E402

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
        _ = rs

    warnings: list[str] = []
    if margin < 1.5:
        warnings.append(f"stress margin {margin:.2f} < 1.5 — retention redesign required")
    if tip > 250:
        warnings.append(f"tip speed {tip:.0f} m/s extreme for most magnet retention systems")

    tip_r = round(tip, 2)
    sigma_r = round(sigma_mpa, 2)
    margin_r = round(margin, 3)
    omega_r = round(omega, 4)
    r_r = round(r, 6)
    pa_per_mpa = 1e6

    worked = []
    worked.append(worked_calc(
        label="Rotor tip speed",
        formula="v_tip = omega x r",
        values={"omega": (omega_r, "rad/s"), "r": (r_r, "m")},
        result=tip_r,
        result_unit="m/s",
        assumptions=["rim radius = rotor OD / 2"],
    ))
    # DECISION: omega x omega / r x r (not ^2) so harness arithmetic re-evaluates cleanly
    worked.append(worked_calc(
        label="Rim hoop stress (thin ring)",
        formula="sigma = rho x omega x omega x r x r / pa_per_MPa",
        values={
            "rho": (rho, "kg/m3"),
            "omega": (omega_r, "rad/s"),
            "r": (r_r, "m"),
            "pa_per_MPa": (pa_per_mpa, "Pa/MPa"),
        },
        result=sigma_r,
        result_unit="MPa",
        assumptions=["thin rotating ring σ = ρ ω² r²"],
    ))
    worked.append(worked_calc(
        label="Stress margin vs allowable",
        formula="margin = allow / sigma",
        values={"allow": (allow_mpa, "MPa"), "sigma": (sigma_r, "MPa")},
        result=margin_r,
        result_unit="",
        assumptions=["pass criterion typically margin >= 1.5"],
    ))

    return {
        "tip_speed_m_s": tip_r,
        "rim_hoop_stress_mpa": sigma_r,
        "allowable_stress_mpa": allow_mpa,
        "stress_margin": margin_r,
        "sleeve_hoop_stress_mpa_estimate": (
            None if sleeve_hoop_mpa is None else round(sleeve_hoop_mpa, 2)
        ),
        "pass": margin >= 1.5,
        "warnings": warnings,
        "worked": worked,
    }


def _selftest() -> None:
    ok = solve({
        "rotor_od_mm": 80.0,
        "speed_rpm": 30000.0,
        "density_kg_m3": 7800.0,
        "allowable_stress_mpa": 800.0,
    })
    assert ok["rim_hoop_stress_mpa"] > 0
    assert len(ok.get("worked") or []) >= 1
    bad = solve({
        "rotor_od_mm": 120.0,
        "speed_rpm": 100000.0,
        "density_kg_m3": 7800.0,
        "allowable_stress_mpa": 200.0,
    })
    assert bad["pass"] is False
    assert len(bad.get("worked") or []) >= 1
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
