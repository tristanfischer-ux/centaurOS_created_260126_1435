#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cryocooler_sizing.py

Stirling / pulse-tube / J-T / sorption / TEC cryocooler sizing
for IR detector cooling, superconducting electronics, JT pre-cool stages.

Input:
    {
      "target_temp_k": 80.0,
      "cooling_load_w": 1.0,
      "sink_temp_k": 300.0,
      "cooler_type": "Stirling"          # Stirling | pulse_tube | Joule_Thomson | sorption | TEC
    }

Output:
    {
      "input_power_w": ...,
      "mass_kg": ...,
      "cop_actual": ...,
      "cop_carnot_max": ...,
      "efficiency_pct_carnot": ...,
      "microphonic_vibration_n": ...,    # important for imager pointing
      ...
    }

Physics:
  COP_Carnot = T_cold / (T_hot - T_cold)
  P_in = Q_load / COP_actual

Tech maturity (Ross "Cryogenic Engineering", 2020 + AIAA Spacecraft Cryocooler
papers):
  Stirling      80-150 K: 10-15% Carnot  (mature, AIM/RAL/RICOR space heritage)
  Pulse tube    35-90 K:  12-20% Carnot  (newer, lower vibration, NASA JPL flight units)
  J-T           4-20 K:   2-5%  Carnot   (no moving parts; needs Stirling pre-cool)
  Sorption       <2 K:    1-2%  Carnot   (Planck/Herschel heritage)
  TEC (Peltier) 220-280 K: 5-10% Carnot  (single stage), low cooling power

References:
- Ross, R. G. (ed.), "Cryocoolers" Vol 14-21 series, Springer/ICC proceedings.
- Walker, G. "Cryocoolers", Plenum Press, 1983.
- Radebaugh, R. "Pulse Tube Cryocoolers", NIST review 2003.
- Ladner, D.R. "Performance and Mass vs Operating Temperature for Pulse Tube
  Cryocoolers", Cryogenics 2010 (mass scaling laws).
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'cryocooler_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Ross ed. (2007), 'Cryocoolers Vol 14', Springer; Radebaugh (2003), 'Cryocoolers: the state of the art and recent developments', J. Phys.: Condens. Matter 21:164219",
    "physics_basis": 'Carnot ceiling: COP_Carnot = T_cold / (T_hot - T_cold). Real efficiency 5-25% Carnot for Stirling/PT/JT cryocoolers.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# cooler_type → (carnot_efficiency, applicable_temp_range_K, mass_per_w_at_80K, vib_n_per_w)
# Mass / vibration scale with input power; values below are at the type's "sweet spot".
COOLER_PROPS = {
    "Stirling": {
        "carnot_eff_at_80K": 0.13, "temp_range_k": (35, 200),
        "mass_kg_per_W_input": 0.10, "vib_n_per_w_input": 0.4,
    },
    "pulse_tube": {
        "carnot_eff_at_80K": 0.17, "temp_range_k": (15, 200),
        "mass_kg_per_W_input": 0.13, "vib_n_per_w_input": 0.05,
    },
    "Joule_Thomson": {
        "carnot_eff_at_80K": 0.04, "temp_range_k": (4, 30),
        "mass_kg_per_W_input": 0.20, "vib_n_per_w_input": 0.01,
    },
    "sorption": {
        "carnot_eff_at_80K": 0.015, "temp_range_k": (0.1, 30),
        "mass_kg_per_W_input": 0.35, "vib_n_per_w_input": 0.0,
    },
    "TEC": {
        "carnot_eff_at_80K": 0.08, "temp_range_k": (220, 290),
        "mass_kg_per_W_input": 0.05, "vib_n_per_w_input": 0.0,
    },
}


def compute(payload: dict) -> dict:
    t_cold = float(payload.get("target_temp_k", 80.0))
    q_load = float(payload.get("cooling_load_w", 1.0))
    t_hot = float(payload.get("sink_temp_k", 300.0))
    cooler_type = str(payload.get("cooler_type", "Stirling"))

    if cooler_type not in COOLER_PROPS:
        raise ValueError(f"unknown cooler_type {cooler_type!r}; known: {list(COOLER_PROPS)}")
    prop = COOLER_PROPS[cooler_type]

    if t_cold >= t_hot:
        raise ValueError(
            f"target_temp_k ({t_cold}) must be below sink_temp_k ({t_hot})"
        )

    t_min, t_max = prop["temp_range_k"]
    in_range = t_min <= t_cold <= t_max

    # Carnot ceiling
    cop_carnot = t_cold / (t_hot - t_cold)

    # Real COP — derate from peak at 80 K with a smooth scaling
    # Real cryocoolers are progressively less efficient as T_cold drops below sweet spot.
    sweet_spot = 80.0 if cooler_type in ("Stirling", "pulse_tube") else (
        15.0 if cooler_type == "Joule_Thomson" else 4.0 if cooler_type == "sorption" else 260.0
    )
    # Smooth derate using normalised log ratio
    if t_cold > 0:
        derate = math.exp(-abs(math.log(t_cold / sweet_spot)) * 0.5)
    else:
        derate = 0.1
    eta_carnot = prop["carnot_eff_at_80K"] * derate
    eta_carnot = max(0.001, min(0.5, eta_carnot))

    cop_actual = cop_carnot * eta_carnot

    # Input power
    p_input_w = q_load / max(1e-6, cop_actual)

    # Mass scales with input power (Ladner 2010 scaling law)
    mass_kg = prop["mass_kg_per_W_input"] * p_input_w
    # Floor: minimum cooler mass ~0.5 kg even for tiny loads
    mass_kg = max(0.5, mass_kg)

    # Microphonic vibration disturbance (relevant for IR imagers)
    vib_n = prop["vib_n_per_w_input"] * p_input_w

    # Worked calculations.
    # derate is exp(log(...)) — transcendental; eta_carnot is passed as a live
    # intermediate value rather than re-derived, making subsequent steps checkable.
    cop_carnot_r = round(cop_carnot, 4)
    eta_carnot_r = round(eta_carnot, 4)
    cop_actual_r = round(cop_actual, 4)
    p_input_r = round(p_input_w, 3)
    mass_r = round(mass_kg, 3)
    vib_r = round(vib_n, 5)
    worked = [
        worked_calc(
            label="Carnot coefficient of performance (COP)",
            formula="COP_Carnot = T_cold / (T_hot - T_cold)",
            values={
                "T_cold": (t_cold, "K"),
                "T_hot": (t_hot, "K"),
            },
            result=cop_carnot_r, result_unit="",
            assumptions=["ideal reversible (Carnot) cycle upper bound"],
        ),
        worked_calc(
            label="Actual COP (derated from Carnot)",
            formula="COP_actual = COP_Carnot x eta_carnot",
            values={
                "COP_Carnot": (cop_carnot_r, ""),
                "eta_carnot": (eta_carnot_r, ""),
            },
            result=cop_actual_r, result_unit="",
            assumptions=[
                f"eta_carnot from smooth log-derate of {prop['carnot_eff_at_80K']} (Carnot fraction at 80 K for {cooler_type}); "
                "derate = exp(-|ln(T_cold/sweet_spot)| x 0.5) — transcendental, not shown separately",
            ],
        ),
        worked_calc(
            label="Input electrical power required",
            formula="P_in = Q_load / COP_actual",
            values={
                "Q_load": (q_load, "W"),
                "COP_actual": (cop_actual_r, ""),
            },
            result=p_input_r, result_unit="W",
            assumptions=["steady-state; no transient start-up penalty"],
        ),
        worked_calc(
            label="Cryocooler mass (Ladner 2010 scaling)",
            formula="m = mass_per_W_input x P_in",
            values={
                "mass_per_W_input": (prop["mass_kg_per_W_input"], "kg/W"),
                "P_in": (p_input_r, "W"),
            },
            result=mass_r, result_unit="kg",
            assumptions=[
                f"mass scaling coefficient {prop['mass_kg_per_W_input']} kg/W for {cooler_type} (Ladner 2010)",
                "minimum 0.5 kg floor for small loads — applied after this step if necessary",
            ],
        ),
        worked_calc(
            label="Microphonic vibration force",
            formula="F_vib = vib_per_W x P_in",
            values={
                "vib_per_W": (prop["vib_n_per_w_input"], "N/W"),
                "P_in": (p_input_r, "W"),
            },
            result=vib_r, result_unit="N",
            assumptions=[f"vibration coefficient {prop['vib_n_per_w_input']} N/W for {cooler_type}; relevant for IR imager pointing stability"],
        ),
    ]

    return {
        "target_temp_k": t_cold,
        "cooling_load_w": q_load,
        "sink_temp_k": t_hot,
        "cooler_type": cooler_type,
        "in_temperature_range": in_range,
        "cop_carnot_max": cop_carnot_r,
        "carnot_efficiency_at_op": eta_carnot_r,
        "cop_actual": cop_actual_r,
        "efficiency_pct_carnot": round(eta_carnot * 100.0, 2),
        "input_power_w": p_input_r,
        "mass_kg": mass_r,
        "microphonic_vibration_n": vib_r,
        "worked": worked,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
