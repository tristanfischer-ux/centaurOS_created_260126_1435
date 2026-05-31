#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/aerospike_engine.py

Aerospike engine performance — altitude-compensating plug-nozzle rocket.
Computes Isp vs altitude, sea-level and vacuum thrust.

Companies served: Pangea Aerospace (ES), Hyperion (UK?), Stratolaunch
(US/EU customers).

Input:
    {
      "chamber_pressure_bar": 100.0,
      "expansion_ratio": 100.0,
      "fuel": "CH4" | "LH2" | "LOX_CH4" | "LOX_RP1",
      "throat_diameter_mm": 150.0,
      "primary_to_secondary_ratio": 1.0
    }

Output:
    sea_level_isp_s, vacuum_isp_s, thrust_n_at_altitudes
    (sea_level, 10km, 50km, vac), nozzle_length_m, _provenance.

Physics:
  Sutton-Biblarz with altitude compensation:
    External flow pressure = p_amb
    Effective expansion ratio adjusts so exit pressure ~ ambient
  Isp_vac = (Isp_sl + Isp_vac) / 2 typically
  Aerospike compensates from Pc/Pe_ideal_for_Pa down to Pc/Pa

References:
- Sutton, G.P., Biblarz, O., "Rocket Propulsion Elements", 9th ed., Wiley 2017,
  ch.3 + ch.5.
- Hill, P.G., Peterson, C.R., "Mechanics and Thermodynamics of Propulsion",
  2nd ed., Addison-Wesley 1992.
- Rocketdyne X-33 RS-2200 Linear Aerospike Engine Final Report, NASA CR-205299,
  1997.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "aerospike_engine (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Sutton & Biblarz (2017) 'Rocket Propulsion Elements' 9th ed. Wiley ch.3,5; "
        "Hill & Peterson (1992) 'Mechanics and Thermodynamics of Propulsion' 2nd ed.; "
        "NASA CR-205299 (1997) 'Rocketdyne X-33 RS-2200 Linear Aerospike'."
    ),
    "physics_basis": (
        "Sutton-Biblarz altitude-compensated expansion. C_F at altitude: "
        "C_F = sqrt(2k^2/(k-1) * (2/(k+1))^((k+1)/(k-1)) * (1 - (Pe/Pc)^((k-1)/k))) "
        "+ (Pe-Pa)*epsilon. Aerospike maintains Pe ~ Pa from cruise alt down."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "PROPELLANT_PERFORMANCE": {
            "source": "Sutton 2017 Table 5-1 + 5-2; ideal c* and gamma for typical propellant combinations",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Propellant properties: c* (m/s), gamma, isp_vac_baseline (s at eps=200)
PROPELLANTS = {
    "LOX_CH4":  {"c_star": 1850, "gamma": 1.19, "isp_vac_eps200": 365},
    "LOX_RP1":  {"c_star": 1780, "gamma": 1.22, "isp_vac_eps200": 340},
    "LOX_LH2":  {"c_star": 2420, "gamma": 1.26, "isp_vac_eps200": 450},
    "CH4":      {"c_star": 1850, "gamma": 1.19, "isp_vac_eps200": 365},
    "LH2":      {"c_star": 2420, "gamma": 1.26, "isp_vac_eps200": 450},
    "RP1":      {"c_star": 1780, "gamma": 1.22, "isp_vac_eps200": 340},
}

G_0 = 9.80665


def thrust_coefficient(p_c_pa, p_a_pa, expansion_ratio, gamma):
    """C_F at given altitude pressure."""
    # Find Pe iteratively from expansion ratio (Sutton eq.3-25)
    # 1/epsilon = ((gamma+1)/2)^(1/(gamma-1)) * (Pe/Pc)^(1/gamma)
    #            * sqrt((gamma+1)/(gamma-1) * (1 - (Pe/Pc)^((gamma-1)/gamma)))
    # Newton iteration
    pe_pc = 0.001
    for _ in range(100):
        lhs = 1.0 / expansion_ratio
        rhs = ((gamma + 1.0) / 2.0) ** (1.0 / (gamma - 1.0))
        rhs *= pe_pc ** (1.0 / gamma)
        rhs *= math.sqrt((gamma + 1.0) / (gamma - 1.0) * (1.0 - pe_pc ** ((gamma - 1.0) / gamma)))
        if abs(rhs - lhs) < 1e-7:
            break
        pe_pc *= (lhs / max(rhs, 1e-10)) ** 0.1
    pe_pc = max(min(pe_pc, 0.99), 1e-6)
    # C_F = sqrt(...) + (Pe - Pa) * epsilon / Pc
    cf_momentum = math.sqrt(
        2 * gamma ** 2 / (gamma - 1) *
        (2.0 / (gamma + 1.0)) ** ((gamma + 1.0) / (gamma - 1.0)) *
        (1.0 - pe_pc ** ((gamma - 1.0) / gamma))
    )
    cf_pressure = (pe_pc - p_a_pa / p_c_pa) * expansion_ratio
    cf = cf_momentum + cf_pressure
    return cf, pe_pc


def atmospheric_pressure_at_altitude(h_km):
    """ISA pressure (Pa) at altitude."""
    if h_km < 0:
        return 101325.0
    elif h_km < 11:
        return 101325.0 * (1.0 - 0.0065 * h_km * 1000 / 288.15) ** 5.256
    elif h_km < 25:
        return 22632.0 * math.exp(-0.0001577 * (h_km - 11) * 1000)
    elif h_km < 47:
        return 2488.0 * (1.0 + 0.0028 * (h_km - 25) * 1000 / 216.65) ** -34.16
    else:
        return 110.0 * math.exp(-0.0001577 * (h_km - 47) * 1000)


def compute(payload: dict) -> dict:
    p_c_bar = float(payload.get("chamber_pressure_bar", 100.0))
    expansion_ratio = float(payload.get("expansion_ratio", 100.0))
    fuel = str(payload.get("fuel", "LOX_CH4"))
    throat_d_mm = float(payload.get("throat_diameter_mm", 150.0))
    primary_secondary_ratio = float(payload.get("primary_to_secondary_ratio", 1.0))

    if fuel not in PROPELLANTS:
        # Try CH4 -> LOX_CH4
        if fuel == "CH4":
            fuel = "LOX_CH4"
        else:
            raise ValueError(f"unknown fuel {fuel!r}; known: {list(PROPELLANTS)}")
    p = PROPELLANTS[fuel]

    p_c_pa = p_c_bar * 1e5
    A_t_m2 = math.pi * (throat_d_mm / 2000.0) ** 2

    # Conventional bell-nozzle baseline
    # At sea level, ideal expansion ratio is much smaller (~20-30)
    # Aerospike behaves as if optimally expanded across altitude range

    altitudes = [0, 10, 50, "vacuum"]
    thrust_at_alt = {}
    isp_at_alt = {}

    # Mass flow constant (chamber-throat sonic)
    m_dot_kg_s = p_c_pa * A_t_m2 / p["c_star"]

    for h in altitudes:
        if h == "vacuum":
            p_a_pa = 0.0
        else:
            p_a_pa = atmospheric_pressure_at_altitude(h)

        # Conventional bell nozzle
        cf_bell, pe_pc = thrust_coefficient(p_c_pa, p_a_pa, expansion_ratio, p["gamma"])
        thrust_bell_n = cf_bell * p_c_pa * A_t_m2
        isp_bell = thrust_bell_n / (m_dot_kg_s * G_0)

        # Aerospike: at each altitude, exhaust matches ambient
        # This gives higher Isp at low altitudes than fixed-bell
        # For ideal aerospike: Pe = Pa, so cf_pressure = 0
        # cf_aero = cf_momentum at Pe = Pa
        if p_a_pa > 0:
            pe_pc_ideal = p_a_pa / p_c_pa
            cf_aero_momentum = math.sqrt(
                2 * p["gamma"] ** 2 / (p["gamma"] - 1) *
                (2.0 / (p["gamma"] + 1.0)) ** ((p["gamma"] + 1.0) / (p["gamma"] - 1.0)) *
                (1.0 - pe_pc_ideal ** ((p["gamma"] - 1.0) / p["gamma"]))
            )
            cf_aero = cf_aero_momentum
        else:
            # Vacuum: same as bell
            cf_aero = cf_bell

        # Aerospike efficiency: ~95% of ideal
        thrust_aero_n = cf_aero * p_c_pa * A_t_m2 * 0.95
        isp_aero = thrust_aero_n / (m_dot_kg_s * G_0)

        key_alt = h if h == "vacuum" else f"{h}km"
        thrust_at_alt[key_alt] = round(thrust_aero_n, 0)
        isp_at_alt[key_alt] = round(isp_aero, 1)

    # Nozzle length estimate (aerospike is shorter than bell)
    # Bell: L ~ 1.5 * sqrt(epsilon) * sqrt(A_t)
    # Aerospike: ~ 30-50% of bell
    A_exit_m2 = expansion_ratio * A_t_m2
    bell_length_m = 1.5 * math.sqrt(A_exit_m2)
    aerospike_length_m = bell_length_m * 0.4

    return {
        "chamber_pressure_bar": p_c_bar,
        "expansion_ratio": expansion_ratio,
        "fuel": fuel,
        "throat_diameter_mm": throat_d_mm,
        "throat_area_cm2": round(A_t_m2 * 1e4, 2),
        "primary_to_secondary_ratio": primary_secondary_ratio,
        "mass_flow_kg_s": round(m_dot_kg_s, 3),
        "characteristic_velocity_c_star": p["c_star"],
        "thrust_at_altitudes_n": thrust_at_alt,
        "isp_at_altitudes_s": isp_at_alt,
        "sea_level_isp_s": isp_at_alt["0km"],
        "vacuum_isp_s": isp_at_alt["vacuum"],
        "exit_area_cm2": round(A_exit_m2 * 1e4, 2),
        "bell_nozzle_length_m_equivalent": round(bell_length_m, 2),
        "aerospike_length_m": round(aerospike_length_m, 2),
        "nozzle_length_m": round(aerospike_length_m, 2),
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
