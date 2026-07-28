#!/usr/bin/env python3
"""
inverter_current_voltage_envelope.py — MCU DC/AC electrical ceiling.

Maps battery voltage band + phase-current limit → max electrical power and
approximate shaft torque ceiling once η_inv and gear ratio are supplied.

STAGED → inverter:current-voltage-envelope
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

HARD = ["v_dc_min_v", "v_dc_max_v", "i_phase_max_a", "n_phases"]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    v_min = float(inp["v_dc_min_v"])
    v_max = float(inp["v_dc_max_v"])
    i_ph = float(inp["i_phase_max_a"])
    n_ph = int(inp["n_phases"])
    if v_min <= 0 or v_max < v_min or i_ph <= 0 or n_ph < 1:
        raise ValueError("Invalid voltage/current envelope inputs")

    # Conservative: available AC line-line ≈ Vdc / √2 at full modulation (space-vector ~0.707)
    mod_index = float(inp.get("max_modulation_index", 0.95))
    sqrt2 = math.sqrt(2.0)
    sqrt3 = math.sqrt(3.0)
    v_ll_max = v_min * mod_index / sqrt2  # worst-case SoC (low Vdc)
    # 3-phase apparent power ceiling S ≈ √3 · V_ll · I_ph
    s_kva = (sqrt3 * v_ll_max * i_ph) / 1000.0
    pf = float(inp.get("power_factor", 0.95))
    p_elec_kw = s_kva * pf

    eta_inv = float(inp.get("inverter_efficiency", 0.98))
    eta_mgu = float(inp.get("mgu_efficiency", 0.96))
    gear = float(inp.get("gear_ratio", 1.0))
    omega_mgu_rad_s = float(inp.get("mgu_speed_rad_s", 0.0))

    p_shaft_kw = p_elec_kw * eta_inv * eta_mgu
    torque_nm = None
    if omega_mgu_rad_s > 0:
        torque_nm = (p_shaft_kw * 1000.0) / omega_mgu_rad_s
    wheel_torque_nm = torque_nm * gear if torque_nm is not None else None

    # Also report optimistic ceiling at Vdc_max (packaging / peak)
    v_ll_peak = v_max * mod_index / sqrt2
    p_peak_kw = (sqrt3 * v_ll_peak * i_ph / 1000.0) * pf

    warnings: list[str] = []
    if p_elec_kw > 350.0:
        warnings.append("electrical power ceiling exceeds common 350 kW axle cap — clamp externally")

    v_ll_r = round(v_ll_max, 2)
    s_kva_r = round(s_kva, 3)
    p_elec_r = round(p_elec_kw, 3)

    worked = []
    # DECISION: bind sqrt(2)/sqrt(3) as numeric symbols so harness re-evaluates
    # plain arithmetic instead of skipping on sqrt(...)
    worked.append(worked_calc(
        label="AC line-line voltage at Vdc min",
        formula="V_ll = V_dc_min x m / sqrt2",
        values={"V_dc_min": (v_min, "V"), "m": (mod_index, ""), "sqrt2": (sqrt2, "")},
        result=v_ll_r,
        result_unit="V",
        assumptions=["space-vector full modulation ≈ Vdc/√2 scaled by max modulation index"],
    ))
    worked.append(worked_calc(
        label="Electrical power at Vdc min",
        formula="P_elec = sqrt3 x V_ll x I_ph x pf / 1000",
        values={
            "sqrt3": (sqrt3, ""),
            "V_ll": (v_ll_r, "V"),
            "I_ph": (i_ph, "A"),
            "pf": (pf, ""),
        },
        result=p_elec_r,
        result_unit="kW",
        assumptions=["S = √3·V_ll·I_ph; P = S·pf at worst-case (low) DC bus"],
    ))

    return {
        "v_ll_max_at_vdc_min_v": v_ll_r,
        "apparent_power_kva": s_kva_r,
        "electrical_power_kw_at_vdc_min": p_elec_r,
        "electrical_power_kw_at_vdc_max": round(p_peak_kw, 3),
        "shaft_power_kw_at_vdc_min": round(p_shaft_kw, 3),
        "mgu_torque_nm": None if torque_nm is None else round(torque_nm, 3),
        "wheel_torque_nm": None if wheel_torque_nm is None else round(wheel_torque_nm, 3),
        "n_phases": n_ph,
        "warnings": warnings,
        "worked": worked,
    }


def _selftest() -> None:
    out = solve({
        "v_dc_min_v": 600.0,
        "v_dc_max_v": 900.0,
        "i_phase_max_a": 500.0,
        "n_phases": 3,
        "mgu_speed_rad_s": 2000.0,  # ~19k rpm
        "gear_ratio": 8.0,
    })
    assert out["electrical_power_kw_at_vdc_min"] > 100
    assert out["mgu_torque_nm"] is not None and out["mgu_torque_nm"] > 0
    assert out["wheel_torque_nm"] > out["mgu_torque_nm"]
    assert len(out.get("worked") or []) >= 1
    print("inverter_current_voltage_envelope selftest OK")


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
