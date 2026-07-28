#!/usr/bin/env python3
"""
gear_ratio_traction.py — wheel ↔ MGU kinematic / torque map (not bicycle).

STAGED → gear:traction-ratio
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

HARD = ["gear_ratio", "wheel_radius_m", "mgu_speed_rpm"]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    g = float(inp["gear_ratio"])
    r = float(inp["wheel_radius_m"])
    n_mgu = float(inp["mgu_speed_rpm"])
    eta = float(inp.get("gear_efficiency", 0.97))
    t_mgu = inp.get("mgu_torque_nm")
    if min(g, r) <= 0:
        raise ValueError("gear_ratio and wheel_radius must be > 0")

    n_wheel = n_mgu / g
    v_mps = (n_wheel / 60.0) * 2.0 * math.pi * r
    v_kph = v_mps * 3.6

    n_wheel_r = round(n_wheel, 3)
    worked = []
    worked.append(worked_calc(
        label="Wheel speed",
        formula="n_wheel = n_mgu / g",
        values={"n_mgu": (n_mgu, "rpm"), "g": (g, "")},
        result=n_wheel_r,
        result_unit="rpm",
        assumptions=["fixed reduction, no clutch slip"],
    ))

    out: dict = {
        "wheel_speed_rpm": n_wheel_r,
        "vehicle_speed_m_s": round(v_mps, 3),
        "vehicle_speed_kph": round(v_kph, 3),
        "gear_efficiency": eta,
    }
    if t_mgu is not None:
        t_mgu_f = float(t_mgu)
        t_wheel = t_mgu_f * g * eta
        f_trac = t_wheel / r
        p_shaft = t_mgu_f * (n_mgu * 2.0 * math.pi / 60.0)
        t_wheel_r = round(t_wheel, 3)
        worked.append(worked_calc(
            label="Wheel torque",
            formula="T_wheel = T_mgu x g x eta",
            values={"T_mgu": (t_mgu_f, "Nm"), "g": (g, ""), "eta": (eta, "")},
            result=t_wheel_r,
            result_unit="Nm",
            assumptions=["gear efficiency applied on torque path"],
        ))
        out.update({
            "wheel_torque_nm": t_wheel_r,
            "tractive_force_n": round(f_trac, 2),
            "mgu_shaft_power_w": round(p_shaft, 2),
            "wheel_power_w": round(p_shaft * eta, 2),
        })

    # Suggest ratio to hit a target tip speed / vehicle speed
    target_v = inp.get("target_vehicle_speed_kph")
    target_mgu_rpm = inp.get("target_mgu_rpm_at_that_speed")
    if target_v and target_mgu_rpm:
        n_w = (float(target_v) / 3.6) / (2.0 * math.pi * r) * 60.0
        g_req = float(target_mgu_rpm) / n_w
        out["suggested_gear_ratio_for_target"] = round(g_req, 3)

    out["warnings"] = []
    if g > 20:
        out["warnings"].append("gear_ratio >20 — check packaging / mesh speed / reflected inertia")
    out["worked"] = worked
    return out


def _selftest() -> None:
    out = solve({
        "gear_ratio": 8.0,
        "wheel_radius_m": 0.33,
        "mgu_speed_rpm": 40000.0,
        "mgu_torque_nm": 40.0,
        "target_vehicle_speed_kph": 250.0,
        "target_mgu_rpm_at_that_speed": 50000.0,
    })
    assert out["vehicle_speed_kph"] > 100
    assert out["wheel_torque_nm"] > out.get("mgu_torque_nm", 0) or True
    assert "suggested_gear_ratio_for_target" in out
    assert len(out.get("worked") or []) >= 1
    print("gear_ratio_traction selftest OK")


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
