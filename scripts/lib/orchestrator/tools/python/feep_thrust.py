#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/feep_thrust.py

FEEP — Field-Emission Electric Propulsion (liquid-metal ion source).

A FEEP thruster extracts ions from a liquid-metal propellant (indium or
caesium) by field emission at a sharp emitter, then electrostatically
accelerates them through a beam voltage V_b. It is the highest-Isp,
lowest-thrust electric thruster family (micro-newton class) used for
fine attitude / drag-free control (e.g. LISA Pathfinder, microsat ADCS).

Governing physics (single-charged ion beam, Brown "Spacecraft Propulsion"
ch.7; Goebel & Katz "Fundamentals of Electric Propulsion" 2008; Tajmar,
"Advanced Space Propulsion Systems" 2003):

  Exhaust (exit) velocity from electrostatic acceleration:
      v_e = sqrt(2 * q_i * V_b / m_i)
  Thrust from a beam current I_b of singly-charged ions:
      F   = I_b * sqrt(2 * m_i * V_b / q_i)   ( = m_dot * v_e )
  Specific impulse:
      Isp = v_e / g0
  Beam (jet) electrical power:
      P   = I_b * V_b

where q_i is the ion charge (e for singly-charged), m_i the ion mass.

Input:
    {
      "beam_current_a": 1.0e-3,      # I_b, beam current [A]
      "beam_voltage_v": 6000.0,      # V_b, accel/beam voltage [V]
      "propellant": "indium"         # indium | caesium
    }

Output (flat, declared output_keys):
    {
      "thrust_n": ...,               # F [N]
      "isp_s": ...,                  # Isp [s]
      "exhaust_velocity_ms": ...,    # v_e [m/s]
      "input_power_w": ...,          # P  [W] (beam power)
      ...
    }

References:
- Goebel, Katz (2008), "Fundamentals of Electric Propulsion", JPL/Wiley.
- Tajmar (2003), "Advanced Space Propulsion Systems", Springer.
- Marcuccio et al. (1998), "FEEP microthruster technology", J. Prop. Power.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

PROVENANCE = {
    "tool_name": 'feep_thrust (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Goebel, Katz (2008), 'Fundamentals of Electric Propulsion'; Tajmar (2003), 'Advanced Space Propulsion Systems'",
    "physics_basis": 'Electrostatic ion acceleration: v_e = sqrt(2 q V_b / m_i); F = I_b sqrt(2 m_i V_b / q); Isp = v_e/g0; P = I_b V_b.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-06-10",
}

G0 = 9.80665
E_CHARGE = 1.602176634e-19          # elementary charge [C]
AMU = 1.66053906660e-27            # atomic mass unit [kg]

# Liquid-metal propellants: singly-charged ions (q_i = e). Mass in amu.
PROPELLANTS = {
    "indium":  {"mass_amu": 114.818, "charge_states": 1},   # In, LISA-PF / microsat FEEP
    "caesium": {"mass_amu": 132.905, "charge_states": 1},   # Cs, classic FEEP propellant
}


def compute(payload: dict) -> dict:
    i_b = float(payload.get("beam_current_a", 1.0e-3))
    v_b = float(payload.get("beam_voltage_v", 6000.0))
    propellant = str(payload.get("propellant", "indium")).lower()

    if propellant not in PROPELLANTS:
        raise ValueError(f"unknown propellant {propellant!r}; known: {list(PROPELLANTS)}")
    if i_b <= 0 or v_b <= 0:
        raise ValueError("beam_current_a and beam_voltage_v must be positive")

    spec = PROPELLANTS[propellant]
    m_i = spec["mass_amu"] * AMU          # ion mass [kg]
    q_i = spec["charge_states"] * E_CHARGE  # ion charge [C]

    # Exhaust velocity from electrostatic acceleration.
    v_e = math.sqrt(2.0 * q_i * v_b / m_i)

    # Thrust = I_b * sqrt(2 * m_i * V_b / q_i)  (equivalently m_dot * v_e).
    thrust_n = i_b * math.sqrt(2.0 * m_i * v_b / q_i)

    # Specific impulse.
    isp_s = v_e / G0

    # Beam electrical power.
    input_power_w = i_b * v_b

    # Mass flow rate (kg/s) and thrust-to-power (mN/kW) for diagnostics.
    m_dot_kg_s = thrust_n / v_e
    thrust_to_power_mn_kw = (thrust_n * 1000.0) / (input_power_w / 1000.0)

    v_e_r = round(v_e, 2)
    thrust_r = thrust_n            # micro-newton class — keep full precision
    isp_r = round(isp_s, 1)
    power_r = round(input_power_w, 4)

    worked = [
        worked_calc(
            label="Ion mass (from atomic mass)",
            formula="m_i = mass_amu x AMU",
            values={"mass_amu": (spec["mass_amu"], "amu"), "AMU": (AMU, "kg")},
            result=m_i,
            result_unit="kg",
            assumptions=[f"{propellant} singly-charged ion; AMU = 1.66053907e-27 kg"],
        ),
        worked_calc(
            label="Exhaust velocity (electrostatic acceleration)",
            formula="v_e = sqrt(2 x q_i x V_b / m_i)",
            values={"q_i": (q_i, "C"), "V_b": (v_b, "V"), "m_i": (m_i, "kg")},
            result=v_e_r,
            result_unit="m/s",
            assumptions=["singly-charged ion, q_i = e; full beam-voltage acceleration (Goebel & Katz 2008 eq. 2.3-x)"],
        ),
        worked_calc(
            label="Thrust (beam current of singly-charged ions)",
            formula="F = I_b x sqrt(2 x m_i x V_b / q_i)",
            values={"I_b": (i_b, "A"), "m_i": (m_i, "kg"), "V_b": (v_b, "V"), "q_i": (q_i, "C")},
            result=thrust_r,
            result_unit="N",
            assumptions=["F = m_dot * v_e; 100% singly-charged beam (no doubly-charged fraction)"],
        ),
        worked_calc(
            label="Specific impulse",
            formula="Isp = v_e / G0",
            values={"v_e": (v_e_r, "m/s"), "G0": (G0, "m/s^2")},
            result=isp_r,
            result_unit="s",
            assumptions=["G0 = 9.80665 m/s^2"],
        ),
        worked_calc(
            label="Beam electrical power",
            formula="P = I_b x V_b",
            values={"I_b": (i_b, "A"), "V_b": (v_b, "V")},
            result=power_r,
            result_unit="W",
            assumptions=["jet/beam power; excludes neutraliser + PPU overhead"],
        ),
    ]

    return {
        "beam_current_a": i_b,
        "beam_voltage_v": v_b,
        "propellant": propellant,
        "ion_mass_kg": m_i,
        "ion_charge_c": q_i,
        "thrust_n": thrust_r,
        "thrust_un": round(thrust_n * 1e6, 4),      # micro-newtons, convenience
        "isp_s": isp_r,
        "exhaust_velocity_ms": v_e_r,
        "input_power_w": power_r,
        "mass_flow_rate_kg_s": m_dot_kg_s,
        "thrust_to_power_mn_per_kw": round(thrust_to_power_mn_kw, 4),
        "worked": worked,
        "data_sources": [
            "Goebel, Katz (2008), 'Fundamentals of Electric Propulsion: Ion and Hall Thrusters', JPL/Wiley",
            "Tajmar (2003), 'Advanced Space Propulsion Systems', Springer",
            "Marcuccio, Genovese, Andrenucci (1998), 'FEEP microthruster technology', J. Propulsion & Power",
        ],
    }


def main() -> int:
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout)
        return 2
    try:
        out = compute(payload)
        out["_provenance"] = PROVENANCE
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 3)
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    import sys as _sys

    # ---- Self-test: indium FEEP at 1 mA, 6 kV ----
    # Indium FEEP at these slit-emitter conditions gives Isp ~8000-10000 s and
    # micro-newton-to-milli-newton thrust. Isp depends only on V_b and m_i:
    #   v_e = sqrt(2 e V_b / m_i), Isp = v_e / g0
    # For In (114.8 amu) at 6 kV: v_e ~ 9.4e4 m/s -> Isp ~ 9600 s.
    payload_default = {"beam_current_a": 1.0e-3, "beam_voltage_v": 6000.0, "propellant": "indium"}
    result = compute(payload_default)

    _sink = _sys.stdout if _sys.stdin.isatty() else _sys.stderr
    json.dump(result, _sink, indent=2)
    print(file=_sink)

    errors = []
    isp = result["isp_s"]
    if not (4000.0 <= isp <= 12000.0):
        errors.append(f"FAIL: isp_s={isp} not in FEEP range [4000, 12000] s")
    else:
        print(f"PASS: isp_s = {isp:.1f} s (FEEP range 4000-12000)", file=_sys.stderr)

    ve = result["exhaust_velocity_ms"]
    if not (3.0e4 <= ve <= 1.5e5):
        errors.append(f"FAIL: exhaust_velocity_ms={ve} not in [3e4, 1.5e5]")
    else:
        print(f"PASS: exhaust_velocity_ms = {ve:.0f} m/s", file=_sys.stderr)

    # Power must equal I_b * V_b exactly.
    p_expected = payload_default["beam_current_a"] * payload_default["beam_voltage_v"]
    if abs(result["input_power_w"] - p_expected) > 1e-9:
        errors.append(f"FAIL: input_power_w={result['input_power_w']} != I_b*V_b={p_expected}")
    else:
        print(f"PASS: input_power_w = {result['input_power_w']} W (= I_b*V_b)", file=_sys.stderr)

    # Thrust must equal m_dot * v_e (internal consistency).
    f_check = result["mass_flow_rate_kg_s"] * result["exhaust_velocity_ms"]
    if abs(f_check - result["thrust_n"]) > 1e-12 + 1e-6 * abs(result["thrust_n"]):
        errors.append(f"FAIL: thrust_n inconsistent with m_dot*v_e ({f_check} vs {result['thrust_n']})")
    else:
        print(f"PASS: thrust_n = {result['thrust_n']:.6e} N (= m_dot*v_e)", file=_sys.stderr)

    if errors:
        for e in errors:
            print(e, file=_sys.stderr)
        _sys.exit(1)
    print("ALL FEEP SELF-TESTS PASSED", file=_sys.stderr)
    if not _sys.stdin.isatty():
        # Behave as a normal subprocess when piped (serve the stdin payload).
        _sys.exit(main())
