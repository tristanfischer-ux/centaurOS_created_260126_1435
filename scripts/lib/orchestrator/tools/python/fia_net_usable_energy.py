#!/usr/bin/env python3
"""fia_net_usable_energy.py — FIA Formula E net usable energy meter.

SOURCE: FIA Formula E Technical Regulations (Season 10 / Art. 7.4 style):
  E_net = E_discharge - k_regen * E_regen
with published factor k_regen = 0.93 (public tech regs PDF).

INTENT: Race-energy accounting every FE rear-PT design must honour. Not a
road-EV SOC model — the championship meters net usable energy with a regen
credit factor. Universal tool id stays regulation-agnostic via inputs.

STAGED → powertrain:fia-net-usable-energy
"""
from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from _worked import worked_calc  # noqa: E402

DEFAULT_REGEN_FACTOR = 0.93


def solve(inp: dict) -> dict:
    e_dis = float(inp["discharge_energy_kwh"])
    e_reg = float(inp.get("regen_energy_kwh", 0.0))
    k = float(inp.get("regen_credit_factor", DEFAULT_REGEN_FACTOR))
    race_cap = inp.get("race_net_energy_cap_kwh")
    if e_dis < 0 or e_reg < 0:
        raise ValueError("energies must be >= 0")
    if not (0.0 < k <= 1.0):
        raise ValueError("regen_credit_factor must be in (0, 1]")
    e_net = e_dis - k * e_reg
    remaining = None
    over_cap = False
    if race_cap is not None:
        cap = float(race_cap)
        remaining = cap - e_net
        over_cap = e_net > cap + 1e-9
    worked = [
        worked_calc(
            label="FIA net usable energy",
            formula="E_net = E_discharge - k_regen * E_regen",
            values={
                "E_discharge": (e_dis, "kWh"),
                "k_regen": (k, ""),
                "E_regen": (e_reg, "kWh"),
            },
            result=e_net,
            result_unit="kWh",
            assumptions=[
                "SOURCE: FIA FE Technical Regulations Art. 7.4-style meter (public PDF)",
                f"default k_regen={DEFAULT_REGEN_FACTOR} unless overridden",
            ],
        )
    ]
    return {
        "ok": True,
        "net_usable_energy_kwh": e_net,
        "discharge_energy_kwh": e_dis,
        "regen_energy_kwh": e_reg,
        "regen_credit_factor": k,
        "race_net_energy_cap_kwh": float(race_cap) if race_cap is not None else None,
        "remaining_to_cap_kwh": remaining,
        "over_race_cap": over_cap,
        "worked": worked,
        "warnings": (["net usable energy exceeds race cap"] if over_cap else []),
    }


def _selftest() -> None:
    r = solve({"discharge_energy_kwh": 50.0, "regen_energy_kwh": 20.0})
    expect = 50.0 - 0.93 * 20.0
    assert abs(r["net_usable_energy_kwh"] - expect) < 1e-9, r
    r2 = solve({
        "discharge_energy_kwh": 50.0,
        "regen_energy_kwh": 5.0,
        "race_net_energy_cap_kwh": 41.0,
    })
    # 50 - 0.93*5 = 45.35 > 41 → over cap
    assert r2["over_race_cap"] is True
    # Adversarial: factor outside (0,1] must fail
    try:
        solve({"discharge_energy_kwh": 1.0, "regen_credit_factor": 1.5})
        raise AssertionError("bad factor should fail")
    except ValueError:
        pass
    print("fia_net_usable_energy.py --selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        out = solve(payload)
        print(json.dumps(out))
    except Exception as exc:  # noqa: BLE001 — tool boundary
        print(json.dumps({"ok": False, "error": str(exc)}))
        raise SystemExit(1)
