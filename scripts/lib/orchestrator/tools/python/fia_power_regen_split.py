#!/usr/bin/env python3
"""fia_power_regen_split.py — FE axle power / regen split feasibility.

SOURCE (public FIA FE TechRegs + GEN3/GEN4 fact sheets):
  GEN3-class defaults (overridable):
    traction_rear_max_kw = 350
    regen_rear_max_kw = 350
    regen_front_max_kw = 250
    regen_total_max_kw = 600
  GEN4 unveil targets (opt-in via profile=gen4):
    traction_peak_kw = 450 (race) / 600 (attack)
    regen_total_max_kw = 700

INTENT: Constraint solver for rear-MGU sizing — never invent a single-axle
power that the published championship envelope forbids.

STAGED → powertrain:fia-power-regen-split
"""
from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from _worked import worked_calc  # noqa: E402

PROFILES = {
    "gen3": {
        "traction_rear_max_kw": 350.0,
        "traction_front_max_kw": 250.0,
        "regen_rear_max_kw": 350.0,
        "regen_front_max_kw": 250.0,
        "regen_total_max_kw": 600.0,
        "traction_total_max_kw": 350.0,  # race continuous rear-led; AWD windows separate
    },
    "gen4": {
        "traction_rear_max_kw": 450.0,
        "traction_front_max_kw": 250.0,
        "regen_rear_max_kw": 350.0,
        "regen_front_max_kw": 250.0,
        "regen_total_max_kw": 700.0,
        "traction_total_max_kw": 450.0,
        "attack_traction_total_max_kw": 600.0,
    },
}


def solve(inp: dict) -> dict:
    profile = str(inp.get("profile", "gen3")).lower()
    if profile not in PROFILES:
        raise ValueError(f"unknown profile: {profile}")
    caps = dict(PROFILES[profile])
    # Allow explicit overrides from brief/contract.
    for k in list(caps.keys()):
        if k in inp and inp[k] is not None:
            caps[k] = float(inp[k])

    p_rear = float(inp.get("rear_traction_kw", 0.0))
    p_front = float(inp.get("front_traction_kw", 0.0))
    r_rear = float(inp.get("rear_regen_kw", 0.0))
    r_front = float(inp.get("front_regen_kw", 0.0))
    attack = bool(inp.get("attack_mode", False))

    violations: list[str] = []
    if p_rear > caps["traction_rear_max_kw"] + 1e-6:
        violations.append(
            f"rear traction {p_rear} kW > cap {caps['traction_rear_max_kw']} kW"
        )
    if p_front > caps["traction_front_max_kw"] + 1e-6:
        violations.append(
            f"front traction {p_front} kW > cap {caps['traction_front_max_kw']} kW"
        )
    trac_total = p_rear + p_front
    trac_cap = caps.get("attack_traction_total_max_kw", caps["traction_total_max_kw"]) if attack \
        else caps["traction_total_max_kw"]
    if trac_total > trac_cap + 1e-6:
        violations.append(f"total traction {trac_total} kW > cap {trac_cap} kW")
    if r_rear > caps["regen_rear_max_kw"] + 1e-6:
        violations.append(f"rear regen {r_rear} kW > cap {caps['regen_rear_max_kw']} kW")
    if r_front > caps["regen_front_max_kw"] + 1e-6:
        violations.append(f"front regen {r_front} kW > cap {caps['regen_front_max_kw']} kW")
    regen_total = r_rear + r_front
    if regen_total > caps["regen_total_max_kw"] + 1e-6:
        violations.append(
            f"total regen {regen_total} kW > cap {caps['regen_total_max_kw']} kW"
        )

    worked = [
        worked_calc(
            label="Axle power split vs FIA envelope",
            formula="feasible = (P_rear<=P_rear_max) AND (R_rear+R_front<=R_total_max)",
            values={
                "P_rear": (p_rear, "kW"),
                "P_rear_max": (caps["traction_rear_max_kw"], "kW"),
                "R_rear": (r_rear, "kW"),
                "R_front": (r_front, "kW"),
                "R_total_max": (caps["regen_total_max_kw"], "kW"),
            },
            result=1.0 if not violations else 0.0,
            result_unit="feasible",
            assumptions=[
                f"profile={profile} from public FIA FE fact sheets / tech regs",
                "Attack-mode total traction uses attack_traction_total_max_kw when set",
            ],
        )
    ]
    return {
        "ok": True,
        "profile": profile,
        "feasible": len(violations) == 0,
        "violations": violations,
        "caps_kw": caps,
        "requested_kw": {
            "rear_traction_kw": p_rear,
            "front_traction_kw": p_front,
            "rear_regen_kw": r_rear,
            "front_regen_kw": r_front,
            "traction_total_kw": trac_total,
            "regen_total_kw": regen_total,
            "attack_mode": attack,
        },
        "worked": worked,
        "warnings": list(violations),
    }


def _selftest() -> None:
    ok = solve({"rear_traction_kw": 300, "rear_regen_kw": 300, "front_regen_kw": 250})
    assert ok["feasible"] is True, ok
    bad = solve({"rear_traction_kw": 400, "profile": "gen3"})
    assert bad["feasible"] is False
    g4 = solve({"rear_traction_kw": 450, "profile": "gen4"})
    assert g4["feasible"] is True
    attack_bad = solve({
        "rear_traction_kw": 400,
        "front_traction_kw": 250,
        "profile": "gen4",
        "attack_mode": False,
    })
    assert attack_bad["feasible"] is False
    print("fia_power_regen_split.py --selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        out = solve(payload)
        print(json.dumps(out))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        raise SystemExit(1)
