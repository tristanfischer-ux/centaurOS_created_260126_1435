#!/usr/bin/env python3
"""
mgu_thermal_lumped.py — two-node winding/magnet thermal RC with coolant.

STAGED → motor:thermal-lumped
"""
from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from _worked import worked_calc  # noqa: E402

HARD = [
    "copper_loss_w",
    "iron_loss_w",
    "magnet_loss_w",
    "coolant_inlet_c",
    "coolant_flow_l_min",
    "thermal_resistance_winding_to_coolant_k_per_w",
    "thermal_resistance_magnet_to_winding_k_per_w",
]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    p_cu = float(inp["copper_loss_w"])
    p_fe = float(inp["iron_loss_w"])
    p_mag = float(inp["magnet_loss_w"])
    t_in = float(inp["coolant_inlet_c"])
    flow_lpm = float(inp["coolant_flow_l_min"])
    r_wc = float(inp["thermal_resistance_winding_to_coolant_k_per_w"])
    r_mw = float(inp["thermal_resistance_magnet_to_winding_k_per_w"])
    if flow_lpm <= 0 or r_wc <= 0 or r_mw <= 0:
        raise ValueError("flow and thermal resistances must be > 0")

    # Coolant temperature rise: ΔT = P / (ṁ cp)
    p_total = p_cu + p_fe + p_mag
    cp = 3500.0  # J/kg/K water-glycol approx
    rho = 1020.0
    mdot = (flow_lpm / 60.0) * 1e-3 * rho  # kg/s
    dt_coolant = p_total / (mdot * cp) if mdot > 0 else float("inf")
    t_coolant = t_in + dt_coolant

    # Winding node sees Cu+Fe; magnet sees magnet loss through R_mw to winding
    t_winding = t_coolant + (p_cu + p_fe) * r_wc
    t_magnet = t_winding + p_mag * r_mw

    t_w_max = float(inp.get("winding_limit_c", 180.0))
    t_m_max = float(inp.get("magnet_limit_c", 150.0))
    winding_ok = t_winding <= t_w_max
    magnet_ok = t_magnet <= t_m_max

    warnings: list[str] = []
    if not winding_ok:
        warnings.append(f"winding {t_winding:.1f}°C exceeds limit {t_w_max}°C")
    if not magnet_ok:
        warnings.append(f"magnet {t_magnet:.1f}°C exceeds limit {t_m_max}°C")

    t_coolant_r = round(t_coolant, 2)
    t_winding_r = round(t_winding, 2)
    t_magnet_r = round(t_magnet, 2)
    p_total_r = round(p_total, 2)
    dt_coolant_r = round(dt_coolant, 4)
    mdot_r = round(mdot, 6)
    p_w_r = round(p_cu + p_fe, 2)

    worked = []
    worked.append(worked_calc(
        label="Coolant temperature rise",
        formula="dT_coolant = P_total / (mdot x cp)",
        values={"P_total": (p_total_r, "W"), "mdot": (mdot_r, "kg/s"), "cp": (cp, "J/kg/K")},
        result=dt_coolant_r,
        result_unit="K",
        assumptions=["water-glycol cp≈3500 J/kg/K, rho≈1020 kg/m3", "steady-state energy balance"],
    ))
    worked.append(worked_calc(
        label="Winding node temperature",
        formula="T_w = T_coolant + P_w x R_wc",
        values={
            "T_coolant": (t_coolant_r, "C"),
            "P_w": (p_w_r, "W"),
            "R_wc": (r_wc, "K/W"),
        },
        result=t_winding_r,
        result_unit="C",
        assumptions=["winding node sees copper + iron loss into coolant"],
    ))

    return {
        "coolant_outlet_c": t_coolant_r,
        "winding_temperature_c": t_winding_r,
        "magnet_temperature_c": t_magnet_r,
        # INTENT: alias keys for consumers that use the shorter naming convention
        "winding_temp_c": t_winding_r,
        "magnet_temp_c": t_magnet_r,
        "total_loss_w": p_total_r,
        "winding_ok": winding_ok,
        "magnet_ok": magnet_ok,
        "pass": winding_ok and magnet_ok,
        "warnings": warnings,
        "worked": worked,
    }


def _selftest() -> None:
    ok = solve({
        "copper_loss_w": 2000.0,
        "iron_loss_w": 1500.0,
        "magnet_loss_w": 300.0,
        "coolant_inlet_c": 60.0,
        "coolant_flow_l_min": 15.0,
        "thermal_resistance_winding_to_coolant_k_per_w": 0.01,
        "thermal_resistance_magnet_to_winding_k_per_w": 0.05,
    })
    assert ok["pass"] is True
    assert ok["winding_temp_c"] == ok["winding_temperature_c"]
    assert ok["magnet_temp_c"] == ok["magnet_temperature_c"]
    assert len(ok.get("worked") or []) >= 1
    hot = solve({
        "copper_loss_w": 20000.0,
        "iron_loss_w": 10000.0,
        "magnet_loss_w": 5000.0,
        "coolant_inlet_c": 80.0,
        "coolant_flow_l_min": 5.0,
        "thermal_resistance_winding_to_coolant_k_per_w": 0.05,
        "thermal_resistance_magnet_to_winding_k_per_w": 0.1,
    })
    assert hot["pass"] is False
    assert len(hot.get("worked") or []) >= 1
    print("mgu_thermal_lumped selftest OK")


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
