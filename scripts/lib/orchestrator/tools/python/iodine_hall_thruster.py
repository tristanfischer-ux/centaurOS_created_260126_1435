#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/iodine_hall_thruster.py

Iodine Hall-effect thruster — thrust, Isp, propellant storage advantage
vs Xenon.

Companies served: ThrustMe (FR), Magdrive (UK), Apollo Fusion Hall thrusters.

Input:
    {
      "power_w": 200.0,
      "mass_flow_mg_s": 1.0,
      "voltage_v": 300.0,
      "magnetic_field_g": 100.0
    }

Output:
    thrust_mn, isp_s, propellant_storage_density_advantage_vs_Xe,
    efficiency_pct, _provenance.

Physics:
  Hall thruster basics: F = m_dot * v_exit = m_dot * sqrt(2 q V / m_ion)
  Iodine ion mass = 126.9 amu (vs Xe 131.3 amu)
  Iodine solid density 4.93 g/cm^3 (vs Xe gas storage 1.6 g/cm^3 at 200 bar)

References:
- Goebel, D.M., Katz, I., "Fundamentals of Electric Propulsion: Ion and Hall
  Thrusters", JPL/Wiley 2008.
- Szabo, J., Robin, M., Paintal, S., et al., "High Density Hall Thruster
  Propellant Investigations", AIAA 2012-3853.
- ThrustMe NPT30-I2 datasheet, 2021.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "iodine_hall_thruster (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Goebel & Katz (2008) 'Fundamentals of Electric Propulsion' JPL/Wiley; "
        "Szabo et al. (2012) AIAA 2012-3853 'High Density Hall Thruster Propellant'; "
        "ThrustMe NPT30-I2 datasheet (2021)."
    ),
    "physics_basis": (
        "Hall thrust F = m_dot * v_exhaust where v_exhaust = sqrt(2 q V / m_ion). "
        "Iodine storage at room temp is solid 4.93 g/cm^3 vs Xe at 1.6 g/cm^3 "
        "compressed gas at 200 bar. 3x volume saving."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "ION_MASSES_AMU": {
            "source": "NIST atomic weights — Xe 131.293, I 126.904",
            "confidence": "library",
        },
        "STORAGE_DENSITIES": {
            "source": "CRC Handbook of Chemistry and Physics 95th ed.; iodine 4.93 g/cm^3, "
                      "Xe @ 200 bar 1.6 g/cm^3",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


AMU_KG = 1.66054e-27
Q_ELEMENTARY = 1.602e-19
G_0 = 9.80665


PROPELLANT_PROPERTIES = {
    "I":  {"mass_amu": 126.904, "storage_g_cm3": 4.93, "form": "solid"},
    "Xe": {"mass_amu": 131.293, "storage_g_cm3": 1.60, "form": "gas_200bar"},
    "Kr": {"mass_amu": 83.798, "storage_g_cm3": 0.85, "form": "gas_200bar"},
    "Ar": {"mass_amu": 39.948, "storage_g_cm3": 0.30, "form": "gas_200bar"},
}


def compute(payload: dict) -> dict:
    power_w = float(payload.get("power_w", 200.0))
    m_dot_mg_s = float(payload.get("mass_flow_mg_s", 1.0))
    voltage_v = float(payload.get("voltage_v", 300.0))
    b_field_g = float(payload.get("magnetic_field_g", 100.0))
    propellant = str(payload.get("propellant", "I"))

    if propellant not in PROPELLANT_PROPERTIES:
        propellant = "I"
    p = PROPELLANT_PROPERTIES[propellant]
    p_xe = PROPELLANT_PROPERTIES["Xe"]

    m_ion_kg = p["mass_amu"] * AMU_KG
    m_dot_kg_s = m_dot_mg_s * 1e-6

    # Exhaust velocity (ideal)
    v_exhaust_m_s = math.sqrt(2 * Q_ELEMENTARY * voltage_v / m_ion_kg)

    # Apply ionization + plume efficiency
    # Iodine has slightly lower ionization efficiency than Xe due to molecular dissociation
    if propellant == "I":
        eta_thrust = 0.50  # ThrustMe / Apollo Fusion measured
    else:
        eta_thrust = 0.55  # typical Xe Hall thruster

    # Effective thrust
    thrust_n = eta_thrust * m_dot_kg_s * v_exhaust_m_s
    thrust_mn = thrust_n * 1000.0

    # Isp
    isp_s = (thrust_n / m_dot_kg_s) / G_0

    # Storage density advantage vs Xe
    storage_advantage = p["storage_g_cm3"] / p_xe["storage_g_cm3"]

    # Thruster efficiency
    p_jet_w = 0.5 * m_dot_kg_s * (v_exhaust_m_s ** 2) * eta_thrust
    eff_pct = (p_jet_w / power_w) * 100.0

    # Discharge current (m_dot expressed as ion current)
    i_d_a = m_dot_kg_s * Q_ELEMENTARY / m_ion_kg

    return {
        "propellant": propellant,
        "ion_mass_amu": p["mass_amu"],
        "power_w": power_w,
        "mass_flow_mg_s": m_dot_mg_s,
        "voltage_v": voltage_v,
        "magnetic_field_g": b_field_g,
        "exhaust_velocity_m_s": round(v_exhaust_m_s, 0),
        "thrust_n": thrust_n,
        "thrust_mn": round(thrust_mn, 4),
        "isp_s": round(isp_s, 0),
        "discharge_current_a": round(i_d_a, 3),
        "thrust_efficiency_pct": round(eta_thrust * 100.0, 1),
        "overall_efficiency_pct": round(eff_pct, 1),
        "storage_density_g_cm3": p["storage_g_cm3"],
        "propellant_storage_density_advantage_vs_Xe": round(storage_advantage, 2),
        "propellant_form": p["form"],
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
