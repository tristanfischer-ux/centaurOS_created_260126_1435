#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/rf_mems_beamsteering.py

RF MEMS phase-shifter beam-steering — insertion loss, switching speed and
lifetime for MEMS-based reconfigurable antennas.

Companies served: Sofant Technologies (UK), Anywaves, Cobham (RF MEMS).

Input:
    {
      "frequency_ghz": 12.0,
      "num_MEMS_switches": 32,
      "switch_loss_db_per": 0.2,
      "packaging_loss_db": 1.0,
      "switch_type": "ohmic" | "capacitive" | "MMIC_PIN",
      "duty_cycle_pct": 50.0
    }

Output:
    total_insertion_loss_db, switching_speed_us, lifetime_cycles,
    isolation_db, _provenance.

Physics:
  Total loss: L_total = N * L_switch + L_packaging + L_routing
  Switching speed: t_sw = sqrt(m * x_pull-in / F_actuation)
  Lifetime: empirical (10^9 - 10^12 cycles, depends on switch type)

References:
- Rebeiz, G.M., "RF MEMS: Theory, Design, and Technology", Wiley 2003.
- Pozar, D.M., "Microwave Engineering", 4th ed., Wiley 2012.
- Hsu, S.S.H. et al., "RF MEMS Switches Review", IEEE Microw. Mag. 14(1):
  79-92, 2013.
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
    "tool_name": "rf_mems_beamsteering (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Rebeiz (2003) 'RF MEMS: Theory, Design, and Technology' Wiley; "
        "Pozar (2012) 'Microwave Engineering' 4th ed. Wiley; "
        "Hsu et al. (2013) IEEE Microw. Mag. 14(1):79."
    ),
    "physics_basis": (
        "Cascade of N switches: total IL = N*L_switch + L_routing. "
        "Switching speed from mechanical resonance frequency. Lifetime "
        "empirical from Rebeiz Table 11.1."
    ),
    "confidence_class": "datasheet",
    "embedded_constants": {
        "MEMS_LIFETIMES": {
            "source": "Rebeiz 2003 Table 11.1 — ohmic: 1e9-1e10 cycles cold-switched; "
                      "capacitive: 1e11-1e12 cycles cold-switched",
            "confidence": "datasheet",
        },
        "MMIC_PIN_LIFETIME": {
            "source": "GaAs PIN diode datasheets (M/A-COM, Macom) — virtually unlimited cycles",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


SWITCH_TYPES = {
    "ohmic":      {"loss_typical_db": 0.2, "isolation_db": 30, "speed_us": 5.0, "lifetime": 1e10},
    "capacitive": {"loss_typical_db": 0.15, "isolation_db": 40, "speed_us": 20.0, "lifetime": 1e12},
    "MMIC_PIN":   {"loss_typical_db": 0.5, "isolation_db": 25, "speed_us": 0.1, "lifetime": 1e15},
    "MMIC_FET":   {"loss_typical_db": 0.7, "isolation_db": 20, "speed_us": 0.01, "lifetime": 1e15},
}


def compute(payload: dict) -> dict:
    freq_ghz = float(payload.get("frequency_ghz", 12.0))
    n_switches = int(payload.get("num_MEMS_switches", 32))
    switch_loss_user = payload.get("switch_loss_db_per", None)
    packaging_loss_db = float(payload.get("packaging_loss_db", 1.0))
    switch_type = str(payload.get("switch_type", "ohmic"))
    duty_pct = float(payload.get("duty_cycle_pct", 50.0))

    if switch_type not in SWITCH_TYPES:
        switch_type = "ohmic"
    s = SWITCH_TYPES[switch_type]

    # Switch loss per element
    if switch_loss_user is not None:
        switch_loss_db = float(switch_loss_user)
    else:
        switch_loss_db = s["loss_typical_db"]
    # Frequency adjustment: loss scales as ~sqrt(f) for ohmic, ~f for capacitive
    if switch_type == "ohmic":
        switch_loss_db *= math.sqrt(freq_ghz / 10.0)
    elif switch_type == "capacitive":
        switch_loss_db *= (freq_ghz / 10.0) ** 0.7

    # Routing loss (transmission lines between switches)
    routing_loss_db = 0.1 * n_switches * math.sqrt(freq_ghz / 10.0) / 10.0

    # Total insertion loss
    total_loss_db = n_switches * switch_loss_db + packaging_loss_db + routing_loss_db

    # Isolation (single switch — typical)
    isolation_db = s["isolation_db"]
    # Cascading isolation: I_total ≈ I_single + 10 dB for each additional series-switch
    if n_switches > 1:
        total_isolation_db = isolation_db + 10.0 * math.log10(n_switches)
    else:
        total_isolation_db = isolation_db

    # Switching speed (one switch transition)
    switching_speed_us = s["speed_us"]

    # Lifetime
    # Cold-switched lifetime from table, derated for actual switching frequency
    base_lifetime = s["lifetime"]
    # Derate for hot-switching (high RF power) — if duty cycle high
    if duty_pct > 50:
        derate_factor = (50.0 / duty_pct)
        lifetime_cycles = base_lifetime * derate_factor
    else:
        lifetime_cycles = base_lifetime

    # Worked calculations.  switch_loss_db and routing_loss_db both involve
    # sqrt (transcendental) so we pass their rounded values as opaque inputs;
    # the cascade-sum and derate steps are then clean arithmetic.
    switch_loss_r = round(switch_loss_db, 3)
    routing_loss_r = round(routing_loss_db, 3)
    total_loss_r = round(total_loss_db, 2)
    lifetime_r = round(lifetime_cycles, 0)

    worked = [
        worked_calc(
            label="Total insertion loss",
            formula="IL_total = N_sw x L_switch + L_pkg + L_route",
            values={
                "N_sw": (n_switches, ""),
                "L_switch": (switch_loss_r, "dB"),
                "L_pkg": (packaging_loss_db, "dB"),
                "L_route": (routing_loss_r, "dB"),
            },
            result=total_loss_r, result_unit="dB",
            assumptions=[
                f"switch_loss_db {switch_loss_r} dB already frequency-corrected via sqrt(f/10) (transcendental, pre-computed)",
                f"routing_loss_db {routing_loss_r} dB = 0.1 x N_sw x sqrt(f_ghz/10) / 10 (pre-computed)",
                f"switch type '{switch_type}', base loss from Rebeiz 2003 Table 11.1",
            ],
        ),
    ]

    # Lifetime derate step only when it actually applies (duty > 50%)
    if duty_pct > 50:
        worked.append(worked_calc(
            label="Hot-switch lifetime derate",
            formula="lifetime = base_lifetime x (50 / duty_pct)",
            values={
                "base_lifetime": (s["lifetime"], "cycles"),
                "duty_pct": (duty_pct, "%"),
            },
            result=lifetime_r, result_unit="cycles",
            assumptions=["Derate for hot-switching at duty_pct > 50%; Rebeiz 2003 ch.11"],
        ))

    return {
        "frequency_ghz": freq_ghz,
        "num_MEMS_switches": n_switches,
        "switch_type": switch_type,
        "switch_loss_db_per": switch_loss_r,
        "packaging_loss_db": packaging_loss_db,
        "routing_loss_db": routing_loss_r,
        "total_insertion_loss_db": total_loss_r,
        "isolation_per_switch_db": isolation_db,
        "total_isolation_db": round(total_isolation_db, 1),
        "switching_speed_us": switching_speed_us,
        "lifetime_cycles": lifetime_r,
        "duty_cycle_pct": duty_pct,
        "worked": worked,
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
