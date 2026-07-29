#!/usr/bin/env python3
"""
ipmsm_analytical_sizing.py — radial-flux IPMSM first-pass envelope.

STAGED → motor:ipmsm-analytical-sizing

D²L air-gap shear sizing + rough back-EMF / base-speed. Analytical only —
FE is a later tier (PHANTM FE discipline).
"""
from __future__ import annotations

import json
import math
import sys

HARD = ["torque_nm", "base_speed_rpm", "airgap_b_t", "electric_loading_a_per_m"]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    t_nm = float(inp["torque_nm"])
    n_rpm = float(inp["base_speed_rpm"])
    bg = float(inp["airgap_b_t"])
    a_rms = float(inp["electric_loading_a_per_m"])
    kw = float(inp.get("winding_factor", 0.95))
    aspect = float(inp.get("stack_aspect_l_over_d", 0.8))  # L/D
    if min(t_nm, n_rpm, bg, a_rms, kw, aspect) <= 0:
        raise ValueError("HARD inputs must be > 0")

    # T = (π/2) · Bg · A · D² · L · kw  →  D³ · aspect = 2T / (π Bg A kw)
    # with L = aspect · D
    d3 = (2.0 * t_nm) / (math.pi * bg * a_rms * kw * aspect)
    d_m = d3 ** (1.0 / 3.0)
    l_m = aspect * d_m
    volume_m3 = math.pi * (d_m / 2.0) ** 2 * l_m
    tip_speed = math.pi * d_m * (n_rpm / 60.0)

    # Rough λ_pm from Bg and turns later; base electrical frequency for poles
    pole_pairs = int(inp.get("pole_pairs", 4))
    f_elec_hz = (n_rpm / 60.0) * pole_pairs
    # Rough stator OD = D + 2*backiron+teeth — use gap diameter as rotor OD proxy
    rotor_od_mm = d_m * 1000.0
    stack_mm = l_m * 1000.0

    power_kw = t_nm * (n_rpm * 2.0 * math.pi / 60.0) / 1000.0
    # Shear stress τ = Bg·A
    shear_pa = bg * a_rms

    warnings: list[str] = []
    if tip_speed > 200.0:
        warnings.append(f"tip speed {tip_speed:.0f} m/s — rotor integrity critical (sleeve/retention)")
    if f_elec_hz > 2000.0:
        warnings.append(f"electrical frequency {f_elec_hz:.0f} Hz — iron / inverter fsw pressure")

    return {
        "rotor_airgap_diameter_mm": round(rotor_od_mm, 2),
        "stack_length_mm": round(stack_mm, 2),
        "rotor_volume_m3": round(volume_m3, 6),
        "tip_speed_m_s": round(tip_speed, 2),
        "electrical_frequency_hz": round(f_elec_hz, 2),
        "airgap_shear_stress_pa": round(shear_pa, 1),
        "shaft_power_kw": round(power_kw, 3),
        "pole_pairs": pole_pairs,
        "warnings": warnings,
        "worked": [
            {
                "label": "Air-gap diameter from D2L",
                "formula": "D = (2T/(pi*Bg*A*kw*(L/D)))^(1/3)",
                "substitution": f"(2*{t_nm}/(pi*{bg}*{a_rms}*{kw}*{aspect}))^(1/3)",
                "result": round(rotor_od_mm, 2),
                "result_unit": "mm",
            },
            # INTENT (0846): Verification contract↔calc needs a BASE-speed tip
            # worked calc. Retention tip lives on rotor-centrifugal-stress under
            # a distinct label — without this row tip_speed_m_s pinned to the
            # retention calc and HARD-failed at ~10%.
            {
                "label": "Rotor tip speed at base rpm",
                "formula": "v_tip = pi * D * n / 60",
                "substitution": (
                    f"pi * {rotor_od_mm/1000.0:.6f} * {n_rpm:g} / 60"
                ),
                "result": round(tip_speed, 2),
                "result_unit": "m/s",
                "assumptions": ["D = air-gap diameter", "n = base speed rpm"],
            },
        ],
    }


def _selftest() -> None:
    # ~67 Nm at 50 krpm → ~350 kW class illustrative
    out = solve({
        "torque_nm": 67.0,
        "base_speed_rpm": 50000.0,
        "airgap_b_t": 0.9,
        "electric_loading_a_per_m": 60000.0,
        "pole_pairs": 2,
    })
    assert 20 < out["rotor_airgap_diameter_mm"] < 200
    assert out["shaft_power_kw"] > 300
    assert any("tip speed" in w for w in out["warnings"])
    print("ipmsm_analytical_sizing selftest OK")


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
