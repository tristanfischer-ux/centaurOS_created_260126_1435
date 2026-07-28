#!/usr/bin/env python3
"""
motor_loss_point.py — MGU loss breakdown at one (T, ω) operating point.

STAGED → motor:loss-point

Cu (I²R), iron (Steinmetz-ish), magnet eddy (σ·B²·f²), mechanical (windage+bearing).
"""
from __future__ import annotations

import json
import math
import sys

HARD = ["torque_nm", "speed_rpm", "phase_current_rms_a", "phase_resistance_ohm"]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    t = float(inp["torque_nm"])
    n = float(inp["speed_rpm"])
    i = float(inp["phase_current_rms_a"])
    r = float(inp["phase_resistance_ohm"])
    n_ph = int(inp.get("n_phases", 3))
    if min(n, i, r) <= 0:
        raise ValueError("speed, current, resistance must be > 0")

    omega = n * 2.0 * math.pi / 60.0
    p_shaft = t * omega  # W
    p_cu = n_ph * (i ** 2) * r

    # Iron: P_fe/kg = kh·f·B^α + ke·f²·B²  (kh, ke in W/kg units)
    f_hz = float(inp.get("electrical_frequency_hz", (n / 60.0) * float(inp.get("pole_pairs", 4))))
    b_t = float(inp.get("iron_b_t", 1.2))
    mass_fe_kg = float(inp.get("iron_mass_kg", 5.0))
    kh = float(inp.get("steinmetz_kh", 0.02))
    ke = float(inp.get("steinmetz_ke", 1e-5))
    alpha = float(inp.get("steinmetz_alpha", 1.8))
    p_fe_w_per_kg = kh * f_hz * (b_t ** alpha) + ke * (f_hz ** 2) * (b_t ** 2)
    p_fe = mass_fe_kg * p_fe_w_per_kg

    # Magnet eddy ~ k_m · B_m² · f² · V_m
    bm = float(inp.get("magnet_b_t", 1.0))
    vm = float(inp.get("magnet_volume_m3", 5e-5))
    km = float(inp.get("magnet_eddy_coeff", 50.0))  # empirical W / (T² Hz² m³)
    p_mag = km * (bm ** 2) * (f_hz ** 2) * vm

    # Mech: windage ∝ ω³ + bearing ∝ ω
    k_w = float(inp.get("windage_coeff", 1e-9))
    k_b = float(inp.get("bearing_coeff", 0.002))
    p_mech = k_w * (omega ** 3) + k_b * omega

    p_loss = p_cu + p_fe + p_mag + p_mech
    p_elec = p_shaft + p_loss if p_shaft >= 0 else abs(p_shaft) - p_loss  # motoring vs crude regen
    if t >= 0:
        eta = p_shaft / p_elec if p_elec > 0 else 0.0
    else:
        # regen: shaft power in, electrical out
        p_elec_out = abs(p_shaft) - p_loss
        eta = p_elec_out / abs(p_shaft) if abs(p_shaft) > 0 else 0.0
        p_elec = p_elec_out

    warnings: list[str] = []
    if eta < 0.7 and t >= 0:
        warnings.append("motoring efficiency <70% at this point — check current density / iron model")

    return {
        "shaft_power_w": round(p_shaft, 2),
        "copper_loss_w": round(p_cu, 2),
        "iron_loss_w": round(p_fe, 2),
        "magnet_eddy_loss_w": round(p_mag, 2),
        "mechanical_loss_w": round(p_mech, 2),
        "total_loss_w": round(p_loss, 2),
        "electrical_power_w": round(p_elec, 2),
        "efficiency": round(max(eta, 0.0), 5),
        "electrical_frequency_hz": round(f_hz, 2),
        "warnings": warnings,
    }


def _selftest() -> None:
    out = solve({
        "torque_nm": 50.0,
        "speed_rpm": 20000.0,
        "phase_current_rms_a": 200.0,
        "phase_resistance_ohm": 0.005,
        "pole_pairs": 2,
        "iron_mass_kg": 3.0,
        "steinmetz_kh": 0.05,   # W/kg/Hz-ish
        "steinmetz_ke": 1e-7,
        "magnet_eddy_coeff": 5.0,
        "windage_coeff": 1e-10,
        "bearing_coeff": 0.001,
    })
    assert out["copper_loss_w"] > 0
    assert out["total_loss_w"] > out["copper_loss_w"]
    assert 0.5 < out["efficiency"] < 1.0
    print("motor_loss_point selftest OK")


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
