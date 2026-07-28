#!/usr/bin/env python3
"""
inverter_sic_loss.py — 3-phase SiC bridge conduction + switching loss (MCU).

STAGED for Anvil promote as inverter:sic-loss.
HARD inputs fail loudly. Analytic first-principles; device Eon/Eoff from datasheet
normalisation (V_test, I_test).

INTENT: Race MCU loss at a single operating point so η_inv couples into
P_wheel = P_elec · η_inv · η_MGU · η_gear — not a vanity motor-only efficiency.
"""
from __future__ import annotations

import json
import math
import sys

HARD = [
    "continuous_power_kw",
    "dc_bus_voltage_v",
    "ac_output_voltage_v",
    "switching_frequency_khz",
    "mosfet_rdson_mohm",
]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    power_kw = float(inp["continuous_power_kw"])
    v_dc = float(inp["dc_bus_voltage_v"])
    v_ac = float(inp["ac_output_voltage_v"])
    f_sw_khz = float(inp["switching_frequency_khz"])
    rdson_mohm = float(inp["mosfet_rdson_mohm"])
    if min(power_kw, v_dc, v_ac, f_sw_khz, rdson_mohm) <= 0:
        raise ValueError("All HARD inputs must be > 0")

    e_on_j = float(inp.get("e_on_j", 0.002))
    e_off_j = float(inp.get("e_off_j", 0.001))
    v_test = float(inp.get("v_test_v", 800.0))
    i_test = float(inp.get("i_test_a", 100.0))
    n_sw = int(inp.get("n_switches", 6))
    duty = float(inp.get("duty_cycle", 0.5))

    i_ac_rms = (power_kw * 1000.0) / (math.sqrt(3.0) * v_ac)
    i_sw_rms = i_ac_rms / math.sqrt(2.0)
    rdson = rdson_mohm / 1000.0
    p_cond_sw = (i_sw_rms ** 2) * rdson * duty
    f_sw = f_sw_khz * 1000.0
    p_sw_sw = (e_on_j + e_off_j) * f_sw * (v_dc / v_test) * (i_ac_rms / i_test)
    p_diss_kw = n_sw * (p_cond_sw + p_sw_sw) / 1000.0
    eta = max(0.0, 1.0 - p_diss_kw / power_kw)

    warnings: list[str] = []
    if p_diss_kw > 0.15 * power_kw:
        warnings.append("inverter_loss >15% of throughput — check f_sw / Rdson / device class")
    if v_ac >= v_dc / math.sqrt(2.0):
        warnings.append("V_ac high vs V_dc — modulation headroom may be insufficient")

    return {
        "ac_rms_current_a": round(i_ac_rms, 3),
        "inverter_conduction_loss_kw": round(n_sw * p_cond_sw / 1000.0, 4),
        "inverter_switching_loss_kw": round(n_sw * p_sw_sw / 1000.0, 4),
        "inverter_dissipated_kw": round(p_diss_kw, 4),
        "inverter_efficiency": round(eta, 5),
        "warnings": warnings,
        "worked": [
            {
                "label": "AC RMS current",
                "formula": "I_ac = P*1000 / (sqrt(3)*V_ac)",
                "substitution": f"{power_kw}*1000/(1.73205*{v_ac})",
                "result": round(i_ac_rms, 3),
                "result_unit": "A",
            },
            {
                "label": "Inverter dissipation",
                "formula": "P_diss = N*(P_cond + P_sw)",
                "substitution": f"{n_sw}*({p_cond_sw:.3f}+{p_sw_sw:.3f})/1000",
                "result": round(p_diss_kw, 4),
                "result_unit": "kW",
            },
        ],
    }


def _selftest() -> None:
    out = solve({
        "continuous_power_kw": 350.0,
        "dc_bus_voltage_v": 800.0,
        "ac_output_voltage_v": 400.0,
        "switching_frequency_khz": 20.0,
        "mosfet_rdson_mohm": 5.0,
    })
    assert 0.9 < out["inverter_efficiency"] < 1.0, out
    assert out["inverter_dissipated_kw"] > 0
    assert out["ac_rms_current_a"] > 400  # ~505 A at 350 kW / 400 V
    try:
        solve({"continuous_power_kw": 1})
        raise AssertionError("should require HARD inputs")
    except ValueError:
        pass
    print("inverter_sic_loss selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    try:
        print(json.dumps(solve(json.load(sys.stdin))))
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"JSON parse: {exc}"}))
        sys.exit(2)
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}))
        sys.exit(3)
