#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electric_propulsion_sizing.py

Electric propulsion sizing — Hall thrusters, gridded ion, PPT, colloidal.

Input:
    {
      "delta_v_target_ms": 1500.0,
      "dry_mass_kg": 500.0,
      "available_power_w": 4000.0,
      "mission_duration_days": 90.0,
      "ep_type": "Hall_SPT-100"    # Hall_SPT-100 | Hall_BHT-1500 | gridded_ion_NSTAR
                                   # | gridded_ion_T6 | PPT_pulsed | colloidal
    }

Output:
    {
      "propellant_mass_kg": ...,
      "thrust_mn": ...,
      "Isp_s": ...,
      "total_burn_time_days": ...,
      "PPU_efficiency_pct": ...,
      "total_propulsion_mass_kg": ...,
      ...
    }

Physics:
  Thrust:  F = 2 P η / (Isp · g0)
  Mass flow: m_dot = F / (Isp · g0)
  Tsiolkovsky for propellant: m_prop = m_dry · (exp(ΔV/Isp/g0) - 1)
  Burn time: t = m_prop / m_dot

EP system specs (Brown ch.7, Goebel & Katz "Fundamentals of Electric
Propulsion: Ion and Hall Thrusters", JPL/Wiley 2008):
  Hall SPT-100   1.35 kW, 1600 s Isp, 80 mN thrust, 0.55 thrust eff
  Hall BHT-1500  1.5 kW,  1750 s Isp, 90 mN thrust, 0.50
  Ion NSTAR      2.3 kW,  3100 s Isp, 92 mN thrust, 0.62  (Dawn, DS1)
  Ion T6         4.5 kW,  4660 s Isp, 145 mN thrust, 0.69  (BepiColombo)
  PPT pulsed     ~50 W,   1000 s Isp, 1.4 mN thrust, 0.07  (EO-1)
  Colloidal      <100 W,  500 s Isp, 0.05 mN thrust, 0.50  (LISA Pathfinder)

References:
- Goebel & Katz, "Fundamentals of Electric Propulsion", JPL/Wiley 2008.
- Brown, "Spacecraft Propulsion", AIAA 1996, ch.7.
- Andrenucci, "Electric Propulsion: Sources & Bibliography", ESA TM-1, 2015.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'electric_propulsion_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Goebel, Katz (2008), 'Fundamentals of Electric Propulsion: Ion and Hall Thrusters', JPL/Wiley",
    "physics_basis": 'Hall thruster thrust T = 2 × P / (g0 × Isp). Mass-flow rate proportional to discharge current.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


G0 = 9.80665

# (input_power_W, Isp_s, thrust_mN, thrust_efficiency, PPU_efficiency, mass_kg_thruster,
#  propellant)
EP_TYPES = {
    "Hall_SPT-100":     {"P_in_w": 1350, "isp_s": 1600, "thrust_mn": 80,  "eta_thrust": 0.55, "eta_ppu": 0.92, "mass_kg": 3.5,  "propellant": "Xe"},
    "Hall_BHT-1500":    {"P_in_w": 1500, "isp_s": 1750, "thrust_mn": 90,  "eta_thrust": 0.50, "eta_ppu": 0.94, "mass_kg": 4.5,  "propellant": "Xe"},
    "gridded_ion_NSTAR":{"P_in_w": 2300, "isp_s": 3100, "thrust_mn": 92,  "eta_thrust": 0.62, "eta_ppu": 0.91, "mass_kg": 8.2,  "propellant": "Xe"},
    "gridded_ion_T6":   {"P_in_w": 4500, "isp_s": 4660, "thrust_mn": 145, "eta_thrust": 0.69, "eta_ppu": 0.95, "mass_kg": 13.0, "propellant": "Xe"},
    "PPT_pulsed":       {"P_in_w": 50,   "isp_s": 1000, "thrust_mn": 1.4, "eta_thrust": 0.07, "eta_ppu": 0.85, "mass_kg": 1.2,  "propellant": "Teflon"},
    "colloidal":        {"P_in_w": 100,  "isp_s": 500,  "thrust_mn": 0.05,"eta_thrust": 0.50, "eta_ppu": 0.90, "mass_kg": 0.6,  "propellant": "EMI-Im"},
}


def compute(payload: dict) -> dict:
    dv_target = float(payload.get("delta_v_target_ms", 1500.0))
    dry_kg = float(payload.get("dry_mass_kg", 500.0))
    available_power_w = float(payload.get("available_power_w", 4000.0))
    duration_days = float(payload.get("mission_duration_days", 90.0))
    ep_type = safe_choice(str(payload.get("ep_type", "Hall_SPT-100")), EP_TYPES, default="Hall_SPT-100", label="ep_type")

    if ep_type not in EP_TYPES:
        raise ValueError(f"unknown ep_type {ep_type!r}; known: {list(EP_TYPES)}")
    spec = EP_TYPES[ep_type]

    isp = spec["isp_s"]
    p_rated = spec["P_in_w"]
    f_mn = spec["thrust_mn"]
    eta_t = spec["eta_thrust"]
    eta_ppu = spec["eta_ppu"]
    mass_thruster = spec["mass_kg"]

    # Effective power at the thruster after PPU losses
    # Number of thrusters that can be powered with available bus power
    n_thrusters = max(1, int(available_power_w * eta_ppu / p_rated))

    # Total thrust if all units run simultaneously
    total_thrust_n = (f_mn * 1e-3) * n_thrusters  # convert mN -> N

    # Propellant required (Tsiolkovsky)
    ve = isp * G0
    mass_ratio = math.exp(dv_target / ve)
    prop_mass = dry_kg * (mass_ratio - 1.0)

    # Mass flow rate
    m_dot = total_thrust_n / ve  # kg/s

    # Burn time
    if m_dot > 0:
        burn_time_s = prop_mass / m_dot
    else:
        burn_time_s = float("inf")
    burn_time_days = burn_time_s / 86400.0

    feasible = burn_time_days <= duration_days

    # Xenon tank mass (high-pressure ~150 bar in CFRP overwrap): ~10% of propellant mass
    if spec["propellant"] == "Xe":
        tank_mass = 0.10 * prop_mass
    elif spec["propellant"] == "Teflon":
        tank_mass = 0.05 * prop_mass  # solid bar feed
    else:
        tank_mass = 0.15 * prop_mass  # ionic liquid, higher overhead

    # PPU mass: ~3 kg/kW typical (Goebel & Katz)
    ppu_mass = 3.0 * (available_power_w / 1000.0)

    total_prop_system_mass = (
        prop_mass + tank_mass + ppu_mass + mass_thruster * n_thrusters
    )

    # Worked calculations for the PDF appendix.
    # n_thrusters uses int() + max() (branchy) — passed as live input.
    # mass_ratio = exp(dv/ve) is transcendental — passed as live input.
    # tank_mass path branches on propellant type — shown for Xe path.
    ve_r = round(ve, 2)
    mass_ratio_r = round(mass_ratio, 5)
    prop_mass_r = round(prop_mass, 3)
    total_thrust_r = round(total_thrust_n, 4)
    m_dot_r = m_dot  # small number, keep full precision for chain
    burn_time_r = round(burn_time_s, 1)
    burn_days_r = round(burn_time_days, 3)
    tank_mass_r = round(tank_mass, 3)
    ppu_mass_r = round(ppu_mass, 3)
    total_prop_r = round(total_prop_system_mass, 3)
    worked = [
        worked_calc(
            label="Effective exhaust velocity",
            formula="ve = Isp x G0",
            values={"Isp": (isp, "s"), "G0": (G0, "m/s^2")},
            result=ve_r,
            result_unit="m/s",
            assumptions=["G0 = 9.80665 m/s^2 (standard gravity)"],
        ),
        worked_calc(
            label="Propellant mass (Tsiolkovsky)",
            formula="m_prop = dry_kg x (mass_ratio - 1)",
            values={"dry_kg": (dry_kg, "kg"), "mass_ratio": (mass_ratio_r, "")},
            result=prop_mass_r,
            result_unit="kg",
            assumptions=["mass_ratio = exp(dv / ve); transcendental step not shown"],
        ),
        worked_calc(
            label="Total thrust (all thrusters)",
            formula="F_total = thrust_mn x 0.001 x n_thrusters",
            values={
                "thrust_mn": (f_mn, "mN"),
                "n_thrusters": (n_thrusters, ""),
            },
            result=total_thrust_r,
            result_unit="N",
            assumptions=["n_thrusters = floor(P_bus x eta_PPU / P_rated); at least 1"],
        ),
        worked_calc(
            label="Propellant mass flow rate",
            formula="m_dot = F_total / ve",
            values={"F_total": (total_thrust_r, "N"), "ve": (ve_r, "m/s")},
            result=round(m_dot_r, 8),
            result_unit="kg/s",
        ),
        worked_calc(
            label="Burn time",
            formula="burn_time_s = m_prop / m_dot",
            values={"m_prop": (prop_mass_r, "kg"), "m_dot": (round(m_dot_r, 8), "kg/s")},
            result=burn_time_r,
            result_unit="s",
        ),
        worked_calc(
            label="Burn time in days",
            formula="burn_days = burn_time_s / 86400",
            values={"burn_time_s": (burn_time_r, "s")},
            result=burn_days_r,
            result_unit="days",
        ),
        worked_calc(
            label="Xenon tank mass (10% of propellant)",
            formula="tank_mass = 0.10 x m_prop",
            values={"m_prop": (prop_mass_r, "kg")},
            result=tank_mass_r,
            result_unit="kg",
            assumptions=["Xe CFRP overwrap tank at 150 bar; ~10% of propellant mass (Goebel & Katz 2008)"],
        ),
        worked_calc(
            label="PPU mass",
            formula="ppu_mass = 3.0 x (P_bus / 1000)",
            values={"P_bus": (available_power_w, "W")},
            result=ppu_mass_r,
            result_unit="kg",
            assumptions=["3 kg/kW specific PPU mass (Goebel & Katz 2008 typical)"],
        ),
        worked_calc(
            label="Total propulsion system mass",
            formula="m_total = m_prop + tank_mass + ppu_mass + thruster_mass x n_thrusters",
            values={
                "m_prop": (prop_mass_r, "kg"),
                "tank_mass": (tank_mass_r, "kg"),
                "ppu_mass": (ppu_mass_r, "kg"),
                "thruster_mass": (mass_thruster, "kg"),
                "n_thrusters": (n_thrusters, ""),
            },
            result=total_prop_r,
            result_unit="kg",
        ),
    ]

    return {
        "delta_v_target_ms": dv_target,
        "dry_mass_kg": dry_kg,
        "available_power_w": available_power_w,
        "mission_duration_days": duration_days,
        "ep_type": ep_type,
        "Isp_s": isp,
        "thrust_mn": f_mn,
        "thrust_efficiency": eta_t,
        "PPU_efficiency_pct": round(eta_ppu * 100.0, 2),
        "thruster_count": n_thrusters,
        "total_thrust_n": round(total_thrust_n, 4),
        "propellant_type": spec["propellant"],
        "propellant_mass_kg": round(prop_mass, 3),
        "mass_flow_rate_kg_s": m_dot,
        "burn_time_s": round(burn_time_s, 1),
        "total_burn_time_days": round(burn_time_days, 3),
        "feasible_in_mission_duration": feasible,
        "tank_mass_kg": round(tank_mass, 3),
        "PPU_mass_kg": round(ppu_mass, 3),
        "thruster_unit_mass_kg": mass_thruster,
        "total_propulsion_mass_kg": total_prop_r,
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
