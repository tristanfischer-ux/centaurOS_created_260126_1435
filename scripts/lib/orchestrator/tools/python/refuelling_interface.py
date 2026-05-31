#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/refuelling_interface.py

In-orbit propellant transfer interface — RAFTI / RDU / SPRINT / OOS-SIM.
Sizes mass-flow rate, transfer time and propellant loss for a docked
refueling operation.

Companies served: Orbit Fab (US/UK), D-Orbit (IT), Astroscale, GMV (ES).

Input:
    {
      "propellant_type": "xenon" | "mmh" | "n2h4" | "water_steam" | "lox" | "lh2",
      "transfer_pressure_bar": 50.0,
      "mass_to_transfer_kg": 50.0,
      "mating_misalignment_mm": 5.0,
      "interface_diameter_mm": 25.0,
      "supply_tank_pressure_bar": 60.0
    }

Output:
    transfer_time_minutes, propellant_loss_pct, mass_flow_rate_g_s,
    seal_leakage_rate_g_per_day, alignment_force_n, _provenance.

Physics:
  Mass flow:  m_dot = Cd * A * sqrt(2 * rho * dP)  (incompressible)
                    = Cd * A * P_1 * sqrt(2k/(k-1) * (P_2/P_1)^(2/k) * ...) (gas)
  Seal leakage: empirical from O-ring helium-leak rate

References:
- API RP 521 (relief sizing for liquid + gas);
- NASA-STD-5012 "Strength and Life Assessment Requirements for Liquid-Fueled
  Space Propulsion System Engines"
- AIAA 2018 RAFTI public design specification + Orbit Fab Tanker design docs.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "refuelling_interface (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "API RP 521 (relief sizing); "
        "NASA-STD-5012 'Strength and Life Assessment Requirements'; "
        "AIAA 2018 RAFTI design specification (Orbit Fab); "
        "Sutton & Biblarz (2017) 'Rocket Propulsion Elements' 9th ed."
    ),
    "physics_basis": (
        "Incompressible Bernoulli flow for liquid propellants. Compressible "
        "isentropic flow for gas propellants (Xenon). Seal-leakage from "
        "O-ring helium-leak rate empirical data."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "PROPELLANT_PROPERTIES": {
            "source": "Sutton 'Rocket Propulsion Elements' 9th ed. App. A; NIST REFPROP",
            "confidence": "textbook",
        },
        "SEAL_LEAKAGE_PER_DIAMETER": {
            "source": "Parker O-ring handbook ORD 5712, helium leak rates",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Propellant properties: density (kg/m^3), viscosity (Pa*s), is_gas, gas constant
PROPELLANTS = {
    "xenon":       {"density": 1.65, "viscosity": 2.3e-5, "is_gas": True, "R_specific": 63.3, "k_ratio": 1.66,
                    "compatibility": "stainless_steel_OK"},
    "mmh":         {"density": 880.0, "viscosity": 8.5e-4, "is_gas": False, "compatibility": "Ti_6Al_4V_OK_no_Cu"},
    "n2h4":        {"density": 1010.0, "viscosity": 9.0e-4, "is_gas": False, "compatibility": "Ti_or_Al_OK"},
    "mon3":        {"density": 1440.0, "viscosity": 4.0e-4, "is_gas": False, "compatibility": "Al_or_Ti_OK"},
    "water_steam": {"density": 998.0, "viscosity": 1.0e-3, "is_gas": False, "compatibility": "stainless_steel_OK"},
    "lox":         {"density": 1141.0, "viscosity": 2.0e-4, "is_gas": False, "compatibility": "Al_or_Inconel_no_organics"},
    "lh2":         {"density": 71.0, "viscosity": 1.3e-5, "is_gas": False, "compatibility": "Al_2219_OK"},
    "ch4_lng":     {"density": 422.0, "viscosity": 1.2e-4, "is_gas": False, "compatibility": "stainless_OK"},
}


def compute(payload: dict) -> dict:
    propellant = str(payload.get("propellant_type", "n2h4"))
    p_transfer_bar = float(payload.get("transfer_pressure_bar", 50.0))
    mass_kg = float(payload.get("mass_to_transfer_kg", 50.0))
    misalignment_mm = float(payload.get("mating_misalignment_mm", 5.0))
    diameter_mm = float(payload.get("interface_diameter_mm", 25.0))
    supply_p_bar = float(payload.get("supply_tank_pressure_bar", p_transfer_bar * 1.2))

    if propellant not in PROPELLANTS:
        raise ValueError(f"unknown propellant {propellant!r}; known: {list(PROPELLANTS)}")
    prop = PROPELLANTS[propellant]

    # Cross-section area
    A_m2 = math.pi * (diameter_mm * 1e-3 / 2.0) ** 2
    Cd = 0.7  # typical valve + connector

    # Pressure drop
    dP_pa = (supply_p_bar - p_transfer_bar) * 1e5
    if dP_pa <= 0:
        dP_pa = 5e4  # 0.5 bar minimum

    if prop["is_gas"]:
        # Compressible flow (Xenon, etc.)
        # Choked flow: m_dot = Cd * A * P_1 * sqrt(k/RT) * (2/(k+1))^((k+1)/(2(k-1)))
        p1_pa = supply_p_bar * 1e5
        T_k = 293.0  # tank temperature
        k = prop.get("k_ratio", 1.4)
        R_specific = prop.get("R_specific", 287.0)
        # Critical ratio
        p_crit_ratio = (2.0 / (k + 1.0)) ** (k / (k - 1.0))
        if p_transfer_bar / supply_p_bar < p_crit_ratio:
            # Choked
            mass_flow_kg_s = Cd * A_m2 * p1_pa * math.sqrt(k / (R_specific * T_k)) * \
                            (2.0 / (k + 1.0)) ** ((k + 1.0) / (2 * (k - 1.0)))
        else:
            # Subsonic
            p2_p1 = p_transfer_bar / supply_p_bar
            mass_flow_kg_s = Cd * A_m2 * p1_pa * math.sqrt(
                2 * k / ((k - 1) * R_specific * T_k) * (p2_p1 ** (2.0 / k) - p2_p1 ** ((k + 1.0) / k))
            )
    else:
        # Liquid
        mass_flow_kg_s = Cd * A_m2 * math.sqrt(2 * prop["density"] * dP_pa)

    mass_flow_g_s = mass_flow_kg_s * 1000.0

    # Transfer time
    if mass_flow_kg_s > 0:
        transfer_time_s = mass_kg / mass_flow_kg_s
    else:
        transfer_time_s = float("inf")
    transfer_time_minutes = transfer_time_s / 60.0

    # Seal leakage rate (Parker O-ring 5712 helium leak rate)
    # ~1e-6 std cm^3 He per second per cm of seal length
    seal_length_cm = math.pi * diameter_mm / 10.0
    he_leak_cc_s = 1e-6 * seal_length_cm
    # Scale by propellant viscosity (gas leaks faster than liquid)
    if prop["is_gas"]:
        prop_leak_cc_s = he_leak_cc_s * 0.5
    else:
        prop_leak_cc_s = he_leak_cc_s * 0.01  # liquid leaks ~100x slower
    leak_g_s = prop_leak_cc_s * 1e-6 * prop["density"]
    seal_leak_per_day_g = leak_g_s * 86400.0

    # Propellant loss percentage during transfer
    # Loss from: (1) seal leak during transfer, (2) residuals in transfer line
    transfer_loss_from_seal = leak_g_s * transfer_time_s / 1000.0  # kg
    residual_loss_kg = (A_m2 * 0.5) * prop["density"]  # 50 cm of transfer line
    propellant_loss_pct = ((transfer_loss_from_seal + residual_loss_kg) / mass_kg) * 100.0

    # Alignment force (passive seal compression)
    # Typical O-ring seal: 100-500 N per mm of compression × diameter
    alignment_force_n = (diameter_mm / 25.0) * 200.0  # 200 N for 25 mm baseline
    # Plus misalignment correction
    alignment_force_n *= (1.0 + misalignment_mm / 10.0)

    return {
        "propellant_type": propellant,
        "is_gas": prop["is_gas"],
        "propellant_density_kg_m3": prop["density"],
        "transfer_pressure_bar": p_transfer_bar,
        "supply_tank_pressure_bar": supply_p_bar,
        "pressure_drop_bar": round((supply_p_bar - p_transfer_bar), 2),
        "mass_to_transfer_kg": mass_kg,
        "interface_diameter_mm": diameter_mm,
        "mating_misalignment_mm": misalignment_mm,
        "mass_flow_rate_g_s": round(mass_flow_g_s, 2),
        "mass_flow_rate_kg_s": round(mass_flow_kg_s, 5),
        "transfer_time_minutes": round(transfer_time_minutes, 1) if transfer_time_s != float("inf") else None,
        "transfer_time_seconds": round(transfer_time_s, 0) if transfer_time_s != float("inf") else None,
        "propellant_loss_pct": round(propellant_loss_pct, 3),
        "seal_leakage_rate_g_per_day": round(seal_leak_per_day_g, 4),
        "alignment_force_n": round(alignment_force_n, 1),
        "material_compatibility": prop["compatibility"],
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
