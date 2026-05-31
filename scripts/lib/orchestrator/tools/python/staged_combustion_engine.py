#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/staged_combustion_engine.py

Staged-combustion rocket engine — FFSC, OFSC, gas-generator, expander cycles.
Performance, turbomachinery sizing, cycle efficiency.

Companies served: Rocket Factory Augsburg (RFA, DE), Skyrora, MaiaSpace.

Input:
    {
      "power_cycle": "FFSC" | "OFSC" | "gas_generator" | "expander",
      "propellants": "LOX_CH4" | "LOX_LH2" | "LOX_RP1",
      "chamber_pressure_bar": 200.0,
      "throat_area_cm2": 100.0,
      "expansion_ratio": 80.0
    }

Output:
    vacuum_isp_s, thrust_n, turbine_inlet_temp_k, cycle_efficiency_pct,
    pump_outlet_pressure_bar, _provenance.

Physics:
  Sutton-Biblarz ch.6 (staged combustion).
  Cycle efficiency: ratio of effective momentum to chemical energy.
  Turbine drives pump: W_pump = m_dot * dP / (rho * eta_pump)

References:
- Sutton, G.P., Biblarz, O., "Rocket Propulsion Elements", 9th ed., Wiley 2017,
  ch.6 (turbopumps + power cycles).
- Glassman, A.J., "Turbine Design and Application", NASA SP-290, 1972.
- Manski, D., Goertz, C., Saßnick, H.-D., "Cycles for staged combustion
  rocket engines", AIAA 91-2410, 1991.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "staged_combustion_engine (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Sutton & Biblarz (2017) 'Rocket Propulsion Elements' 9th ed. ch.6; "
        "Glassman (1972) NASA SP-290 'Turbine Design and Application'; "
        "Manski et al. (1991) AIAA 91-2410 'Cycles for staged combustion'."
    ),
    "physics_basis": (
        "Staged combustion cycle (FFSC/OFSC). Turbine inlet temp constrained "
        "by material limits (~600K oxidizer-rich, ~900K fuel-rich, ~1100K "
        "with cooled blades). Pump work from m_dot * dP / (rho * eta)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "TURBINE_INLET_LIMITS": {
            "source": "Sutton 2017 Table 6-2; OFSC ~600K, FFSC ~900K, GG ~1100K with cooled turbine",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Propellant properties: c* (m/s), gamma, density_LOX, density_fuel (kg/m^3)
PROPELLANTS = {
    "LOX_CH4":  {"c_star": 1850, "gamma": 1.19, "isp_vac_eps80": 360, "density_LOX": 1141, "density_fuel": 422, "of_opt": 3.6},
    "LOX_LH2":  {"c_star": 2420, "gamma": 1.26, "isp_vac_eps80": 440, "density_LOX": 1141, "density_fuel": 71, "of_opt": 6.0},
    "LOX_RP1":  {"c_star": 1780, "gamma": 1.22, "isp_vac_eps80": 335, "density_LOX": 1141, "density_fuel": 810, "of_opt": 2.3},
}

# Cycle efficiency: fraction of chemical energy delivered to thrust
CYCLE_EFFICIENCY = {
    "FFSC":         {"efficiency": 0.98, "turbine_inlet_max_k": 900, "pump_pressure_ratio": 4.0},
    "OFSC":         {"efficiency": 0.96, "turbine_inlet_max_k": 600, "pump_pressure_ratio": 3.5},
    "gas_generator": {"efficiency": 0.92, "turbine_inlet_max_k": 1100, "pump_pressure_ratio": 2.0},
    "expander":     {"efficiency": 0.99, "turbine_inlet_max_k": 700, "pump_pressure_ratio": 1.8},
    "tap_off":      {"efficiency": 0.95, "turbine_inlet_max_k": 1000, "pump_pressure_ratio": 2.0},
}

G_0 = 9.80665


def compute(payload: dict) -> dict:
    cycle = str(payload.get("power_cycle", "FFSC"))
    propellants = str(payload.get("propellants", "LOX_CH4"))
    p_c_bar = float(payload.get("chamber_pressure_bar", 200.0))
    A_t_cm2 = float(payload.get("throat_area_cm2", 100.0))
    expansion_ratio = float(payload.get("expansion_ratio", 80.0))

    if cycle not in CYCLE_EFFICIENCY:
        cycle = "FFSC"
    if propellants not in PROPELLANTS:
        propellants = "LOX_CH4"

    c = CYCLE_EFFICIENCY[cycle]
    p = PROPELLANTS[propellants]

    p_c_pa = p_c_bar * 1e5
    A_t_m2 = A_t_cm2 / 1e4

    # Mass flow
    m_dot_total_kg_s = p_c_pa * A_t_m2 / p["c_star"]

    # Pump pressure ratio
    p_pump_out_bar = p_c_bar * c["pump_pressure_ratio"]

    # Vacuum Isp at given expansion ratio (Sutton ch.3)
    # ε=80 baseline gives ~Isp_vac_eps80
    # Scale: Isp grows slowly with epsilon above 50
    isp_factor = 1.0 + 0.05 * math.log(expansion_ratio / 80.0) if expansion_ratio > 0 else 1.0
    isp_vac_s = p["isp_vac_eps80"] * isp_factor * c["efficiency"]

    # Sea-level Isp (with ambient back-pressure)
    # Assume bell nozzle, optimised for vacuum (eps=80)
    isp_sl_s = isp_vac_s * 0.85  # rough rule

    # Thrust
    g_0 = G_0
    thrust_vac_n = m_dot_total_kg_s * isp_vac_s * g_0
    thrust_sl_n = m_dot_total_kg_s * isp_sl_s * g_0

    # Turbine inlet temperature
    turbine_inlet_k = c["turbine_inlet_max_k"]

    # Pump power
    of_opt = p["of_opt"]
    m_dot_ox = m_dot_total_kg_s * of_opt / (1.0 + of_opt)
    m_dot_fuel = m_dot_total_kg_s / (1.0 + of_opt)
    dp_pa = (p_pump_out_bar - 5.0) * 1e5  # tank ~5 bar
    w_pump_ox_w = m_dot_ox * dp_pa / (p["density_LOX"] * 0.75)
    w_pump_fuel_w = m_dot_fuel * dp_pa / (p["density_fuel"] * 0.75)
    total_pump_power_kw = (w_pump_ox_w + w_pump_fuel_w) / 1000.0

    # Cycle efficiency (percentage)
    cycle_eff_pct = c["efficiency"] * 100.0

    return {
        "power_cycle": cycle,
        "propellants": propellants,
        "chamber_pressure_bar": p_c_bar,
        "pump_outlet_pressure_bar": round(p_pump_out_bar, 1),
        "throat_area_cm2": A_t_cm2,
        "expansion_ratio": expansion_ratio,
        "mass_flow_kg_s": round(m_dot_total_kg_s, 3),
        "oxidizer_mass_flow_kg_s": round(m_dot_ox, 3),
        "fuel_mass_flow_kg_s": round(m_dot_fuel, 3),
        "vacuum_isp_s": round(isp_vac_s, 1),
        "sea_level_isp_s": round(isp_sl_s, 1),
        "thrust_n": round(thrust_vac_n, 0),
        "thrust_sea_level_n": round(thrust_sl_n, 0),
        "turbine_inlet_temp_k": turbine_inlet_k,
        "cycle_efficiency_pct": round(cycle_eff_pct, 1),
        "total_pump_power_kw": round(total_pump_power_kw, 1),
        "characteristic_velocity_c_star": p["c_star"],
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
