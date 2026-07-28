#!/usr/bin/env python3
"""
motor_loss_point.py — MGU loss breakdown at one (T, ω) operating point.

STAGED → motor:loss-point

Cu (I²R), iron (Steinmetz-ish), magnet eddy (σ·B²·f²), mechanical (windage+bearing).
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

    p_cu_r = round(p_cu, 2)
    p_fe_r = round(p_fe, 2)
    p_mag_r = round(p_mag, 2)
    p_mech_r = round(p_mech, 2)
    p_loss_r = round(p_loss, 2)
    p_shaft_r = round(p_shaft, 2)
    p_elec_r = round(p_elec, 2)
    eta_r = round(max(eta, 0.0), 5)

    worked = []
    worked.append(worked_calc(
        label="Copper loss (I2R)",
        formula="P_cu = n_ph x I x I x R",
        values={"n_ph": (n_ph, ""), "I": (i, "A_rms"), "R": (r, "ohm")},
        result=p_cu_r,
        result_unit="W",
        assumptions=["phase resistance at operating temperature"],
    ))
    worked.append(worked_calc(
        label="Total electromagnetic + mechanical loss",
        formula="P_loss = P_cu + P_fe + P_mag + P_mech",
        values={
            "P_cu": (p_cu_r, "W"),
            "P_fe": (p_fe_r, "W"),
            "P_mag": (p_mag_r, "W"),
            "P_mech": (p_mech_r, "W"),
        },
        result=p_loss_r,
        result_unit="W",
        assumptions=["iron + magnet eddy + windage/bearing summed with copper"],
    ))
    if t >= 0 and p_elec_r > 0:
        worked.append(worked_calc(
            label="Motoring efficiency",
            formula="eta = P_shaft / P_elec",
            values={"P_shaft": (p_shaft_r, "W"), "P_elec": (p_elec_r, "W")},
            result=eta_r,
            result_unit="",
            assumptions=["P_elec = P_shaft + P_loss at this operating point"],
        ))
    else:
        worked.append(worked_calc(
            label="Regen efficiency",
            formula="eta = P_elec / P_shaft_abs",
            values={"P_elec": (p_elec_r, "W"), "P_shaft_abs": (abs(p_shaft_r), "W")},
            result=eta_r,
            result_unit="",
            assumptions=["regen: electrical out over |shaft| in"],
        ))

    return {
        "shaft_power_w": p_shaft_r,
        "copper_loss_w": p_cu_r,
        "iron_loss_w": p_fe_r,
        "magnet_eddy_loss_w": p_mag_r,
        "mechanical_loss_w": p_mech_r,
        "total_loss_w": p_loss_r,
        "electrical_power_w": p_elec_r,
        "efficiency": eta_r,
        "electrical_frequency_hz": round(f_hz, 2),
        "warnings": warnings,
        "worked": worked,
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
    assert len(out.get("worked") or []) >= 1
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
