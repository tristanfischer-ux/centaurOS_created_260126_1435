#!/usr/bin/env python3
"""
duty_cycle_energy.py — net electrical energy + loss integral over a duty cycle.

STAGED → powertrain:duty-cycle-energy

Accepts either:
  - samples: [{t_s, speed_rpm, torque_nm, v_dc_v, ...}, ...]
  - bins: [{speed_rpm, torque_nm, duration_s, ...}, ...]
"""
from __future__ import annotations

import json
import math
import sys

HARD = []  # either samples or bins required — checked in solve


def _point_powers(speed_rpm: float, torque_nm: float, eta_inv: float, eta_mgu: float, eta_gear: float):
    omega = speed_rpm * 2.0 * math.pi / 60.0
    p_shaft = torque_nm * omega  # W; sign: + motoring
    chain = eta_inv * eta_mgu * eta_gear
    if p_shaft >= 0:
        p_elec = p_shaft / max(chain, 1e-6)
        p_loss = p_elec - p_shaft
    else:
        # regen: mechanical in → electrical out
        p_elec = p_shaft * chain  # more negative magnitude smaller
        p_loss = abs(p_shaft) - abs(p_elec)
    return p_shaft, p_elec, p_loss


def solve(inp: dict) -> dict:
    samples = inp.get("samples")
    bins = inp.get("bins")
    if not samples and not bins:
        raise ValueError("Provide samples[] or bins[]")

    eta_inv = float(inp.get("inverter_efficiency", 0.98))
    eta_mgu = float(inp.get("mgu_efficiency", 0.96))
    eta_gear = float(inp.get("gear_efficiency", 0.97))

    e_elec_j = 0.0
    e_shaft_j = 0.0
    e_loss_j = 0.0
    t_mot = 0.0
    t_regen = 0.0
    p_elec_peak = 0.0

    if samples:
        # trapezoid on consecutive times
        prev = None
        for s in samples:
            t = float(s["t_s"])
            n = float(s["speed_rpm"])
            tau = float(s["torque_nm"])
            ps, pe, pl = _point_powers(n, tau, eta_inv, eta_mgu, eta_gear)
            p_elec_peak = max(p_elec_peak, abs(pe))
            if prev is not None:
                dt = t - prev["t"]
                if dt < 0:
                    raise ValueError("samples must be time-sorted ascending")
                e_elec_j += 0.5 * (pe + prev["pe"]) * dt
                e_shaft_j += 0.5 * (ps + prev["ps"]) * dt
                e_loss_j += 0.5 * (pl + prev["pl"]) * dt
                if pe >= 0:
                    t_mot += dt
                else:
                    t_regen += dt
            prev = {"t": t, "pe": pe, "ps": ps, "pl": pl}
    else:
        for b in bins:
            dt = float(b["duration_s"])
            n = float(b["speed_rpm"])
            tau = float(b["torque_nm"])
            ps, pe, pl = _point_powers(n, tau, eta_inv, eta_mgu, eta_gear)
            e_elec_j += pe * dt
            e_shaft_j += ps * dt
            e_loss_j += pl * dt
            p_elec_peak = max(p_elec_peak, abs(pe))
            if pe >= 0:
                t_mot += dt
            else:
                t_regen += dt

    warnings: list[str] = []
    if e_elec_j < 0:
        warnings.append("net electrical energy negative — regen-dominated segment")

    return {
        "net_electrical_energy_j": round(e_elec_j, 2),
        "net_electrical_energy_kwh": round(e_elec_j / 3.6e6, 6),
        "shaft_energy_j": round(e_shaft_j, 2),
        "loss_energy_j": round(e_loss_j, 2),
        "motoring_time_s": round(t_mot, 3),
        "regen_time_s": round(t_regen, 3),
        "peak_abs_electrical_power_w": round(p_elec_peak, 2),
        "warnings": warnings,
    }


def _selftest() -> None:
    bins = solve({
        "bins": [
            {"speed_rpm": 20000, "torque_nm": 40, "duration_s": 10},
            {"speed_rpm": 30000, "torque_nm": -20, "duration_s": 5},
        ],
        "inverter_efficiency": 0.98,
        "mgu_efficiency": 0.96,
        "gear_efficiency": 0.97,
    })
    assert bins["motoring_time_s"] == 10
    assert bins["regen_time_s"] == 5
    assert bins["loss_energy_j"] > 0

    samples = solve({
        "samples": [
            {"t_s": 0, "speed_rpm": 10000, "torque_nm": 30},
            {"t_s": 2, "speed_rpm": 20000, "torque_nm": 30},
            {"t_s": 4, "speed_rpm": 20000, "torque_nm": -10},
        ]
    })
    assert samples["net_electrical_energy_j"] != 0
    print("duty_cycle_energy selftest OK")


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
