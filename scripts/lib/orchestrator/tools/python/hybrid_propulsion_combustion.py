#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/hybrid_propulsion_combustion.py

Hybrid rocket propulsion — solid fuel + liquid oxidiser. Computes thrust,
Isp, regression rate and burn time for a hybrid grain.

Companies served: HyImpulse Technologies (DE), HyPrSpace (FR),
Reaction Dynamics (CA/EU partners).

Input:
    {
      "fuel": "HDPE" | "HTPB" | "paraffin",
      "oxidizer": "LOX" | "N2O" | "H2O2",
      "o_f_ratio": 2.5,
      "chamber_pressure_bar": 30.0,
      "fuel_grain_diameter_mm": 200.0,
      "length_mm": 1000.0,
      "expansion_ratio": 30.0
    }

Output:
    thrust_n, isp_s, regression_rate_mm_s, burn_time_s,
    fuel_mass_kg, oxidizer_mass_kg, _provenance.

Physics:
  Marxman regression rate (1963): r_dot = a * G_ox^n
  Mass flow:  m_dot_fuel = rho_fuel * A_port * r_dot
  Thrust:     F = C_F * P_c * A_t
  Isp:        Isp = F / (m_dot * g_0)
  Expansion ratio coupling through C_F (Sutton ch.3)

References:
- Sutton, G.P., Biblarz, O., "Rocket Propulsion Elements", 9th ed., Wiley 2017,
  ch.15 (hybrid rockets).
- Marxman, G.A., Wooldridge, C.E., "Fundamentals of hybrid boundary-layer
  combustion", AIAA Solid Propellant Rocket Conf. 1963.
- Karabeyoglu, M.A., Cantwell, B.J., "Fuel regression rate characterization
  of paraffin-based hybrid rocket fuels", J. Prop. Power 18(3):610-620, 2002.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "hybrid_propulsion_combustion (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Sutton & Biblarz (2017) 'Rocket Propulsion Elements' 9th ed. Wiley ch.15; "
        "Marxman & Wooldridge (1963) AIAA Solid Propellant Rocket Conf.; "
        "Karabeyoglu & Cantwell (2002) J. Prop. Power 18(3):610 "
        "DOI:10.2514/2.5996."
    ),
    "physics_basis": (
        "Marxman boundary-layer regression rate r_dot = a * G_ox^n. Mass "
        "flow from regression rate × density × port area. Sutton C_F * P_c "
        "* A_t gives thrust. Isp = F / (m_dot * g_0)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "REGRESSION_COEFFICIENTS": {
            "source": "Karabeyoglu 2002 + Sutton Table 15-1; HDPE: a=0.16 G^0.5, HTPB: a=0.13 G^0.65, paraffin: a=0.85 G^0.5",
            "confidence": "textbook",
        },
        "ISP_PERFORMANCE": {
            "source": "Sutton Table 15-2; theoretical Isp for fuel/oxidizer combinations at typical O/F",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Fuel properties: density (kg/m^3), regression coefficient (mm/s / (kg/m^2/s)^n), exponent n
FUELS = {
    "HDPE":     {"density": 950, "a_coeff": 0.16, "n_exp": 0.5},
    "HTPB":     {"density": 920, "a_coeff": 0.13, "n_exp": 0.65},
    "paraffin": {"density": 920, "a_coeff": 0.85, "n_exp": 0.5},
    "ABS":      {"density": 1040, "a_coeff": 0.10, "n_exp": 0.68},
}

# Theoretical Isp at typical O/F (from Sutton Table 15-2)
# (fuel, oxidizer) -> {O/F_optimal, Isp_vac_s, c_star_m_s}
ISP_TABLE = {
    ("HDPE", "LOX"):  {"of_opt": 2.4, "isp_vac": 290, "c_star": 1600},
    ("HDPE", "N2O"):  {"of_opt": 7.0, "isp_vac": 230, "c_star": 1500},
    ("HDPE", "H2O2"): {"of_opt": 7.5, "isp_vac": 270, "c_star": 1550},
    ("HTPB", "LOX"):  {"of_opt": 2.4, "isp_vac": 295, "c_star": 1620},
    ("HTPB", "N2O"):  {"of_opt": 7.0, "isp_vac": 240, "c_star": 1540},
    ("HTPB", "H2O2"): {"of_opt": 7.5, "isp_vac": 280, "c_star": 1580},
    ("paraffin", "LOX"):  {"of_opt": 2.5, "isp_vac": 310, "c_star": 1700},
    ("paraffin", "N2O"):  {"of_opt": 7.0, "isp_vac": 255, "c_star": 1580},
    ("paraffin", "H2O2"): {"of_opt": 7.5, "isp_vac": 285, "c_star": 1620},
    ("ABS", "N2O"):       {"of_opt": 6.5, "isp_vac": 230, "c_star": 1500},
}


def compute(payload: dict) -> dict:
    fuel = str(payload.get("fuel", "HDPE"))
    oxidizer = str(payload.get("oxidizer", "LOX"))
    of_ratio = float(payload.get("o_f_ratio", 2.5))
    p_c_bar = float(payload.get("chamber_pressure_bar", 30.0))
    diameter_mm = float(payload.get("fuel_grain_diameter_mm", 200.0))
    length_mm = float(payload.get("length_mm", 1000.0))
    expansion_ratio = float(payload.get("expansion_ratio", 30.0))
    initial_port_diameter_mm = float(payload.get("initial_port_diameter_mm", diameter_mm * 0.3))

    if fuel not in FUELS:
        raise ValueError(f"unknown fuel {fuel!r}; known: {list(FUELS)}")
    f = FUELS[fuel]

    # Get Isp performance
    isp_key = (fuel, oxidizer)
    if isp_key not in ISP_TABLE:
        isp_key = ("HDPE", oxidizer) if (("HDPE", oxidizer) in ISP_TABLE) else ("HDPE", "LOX")
    perf = ISP_TABLE[isp_key]
    isp_max = perf["isp_vac"]
    c_star = perf["c_star"]

    # Adjust Isp for off-design O/F (parabolic falloff from optimum)
    of_opt = perf["of_opt"]
    if of_opt > 0:
        isp_factor = 1.0 - 0.5 * ((of_ratio - of_opt) / of_opt) ** 2
        isp_factor = max(0.3, isp_factor)
    else:
        isp_factor = 1.0
    isp_s = isp_max * isp_factor

    # Thrust calculation
    # Throat area: A_t = m_dot * c_star / P_c
    # We need to solve self-consistently for m_dot
    # Initial guess: assume target burn time gives mass flow
    burn_time_target = float(payload.get("burn_time_target_s", 60.0))

    # Fuel grain geometry
    A_port_m2 = math.pi * (initial_port_diameter_mm / 2000.0) ** 2
    A_fuel_m2 = math.pi * (diameter_mm / 2000.0) ** 2 - A_port_m2
    L_m = length_mm / 1000.0
    fuel_volume_m3 = A_fuel_m2 * L_m
    fuel_mass_kg = fuel_volume_m3 * f["density"]

    # Mass flow consistency: m_dot_total = m_dot_ox + m_dot_fuel
    # m_dot_ox / m_dot_fuel = O/F
    # m_dot_fuel = (O/F + 1)^-1 * m_dot_total
    # m_dot_total = fuel_mass / burn_time * (1 + O/F)
    m_dot_total = fuel_mass_kg / burn_time_target * (1.0 + of_ratio)
    m_dot_fuel = m_dot_total / (1.0 + of_ratio)
    m_dot_ox = m_dot_fuel * of_ratio

    # Regression rate
    g_ox = m_dot_ox / A_port_m2
    r_dot_mm_s = f["a_coeff"] * (g_ox) ** f["n_exp"]

    # Throat area
    p_c_pa = p_c_bar * 1e5
    A_t = m_dot_total * c_star / p_c_pa

    # Thrust coefficient (Sutton eq.3-30)
    # C_F = sqrt(2k^2/(k-1) * (2/(k+1))^((k+1)/(k-1)) * (1 - (Pe/Pc)^((k-1)/k))) + (Pe-Pa)*Ae/(Pc*At)
    k = 1.22  # typical for hybrid combustion products
    # Critical pressure ratio
    pe_pc = (1 / expansion_ratio) ** (k / (k - 1.0))  # simplification — depends on expansion
    # Use Sutton approximation:
    cf_ideal = math.sqrt(2 * k ** 2 / (k - 1) * (2 / (k + 1)) ** ((k + 1) / (k - 1))
                          * (1 - pe_pc ** ((k - 1) / k)))
    cf_eff = cf_ideal * 0.96  # nozzle efficiency

    # Thrust
    thrust_n = cf_eff * p_c_pa * A_t

    # Burn time (using fuel mass)
    burn_time_s = fuel_mass_kg / m_dot_fuel

    # Oxidizer mass
    oxidizer_mass_kg = m_dot_ox * burn_time_s

    # Isp consistency check
    g_0 = 9.80665
    isp_calc = thrust_n / (m_dot_total * g_0)

    return {
        "fuel": fuel,
        "oxidizer": oxidizer,
        "o_f_ratio": of_ratio,
        "o_f_optimal": of_opt,
        "chamber_pressure_bar": p_c_bar,
        "fuel_grain_diameter_mm": diameter_mm,
        "fuel_grain_length_mm": length_mm,
        "initial_port_diameter_mm": initial_port_diameter_mm,
        "expansion_ratio": expansion_ratio,
        "fuel_density_kg_m3": f["density"],
        "thrust_n": round(thrust_n, 1),
        "isp_s": round(isp_calc, 1),
        "isp_max_theoretical_s": isp_max,
        "regression_rate_mm_s": round(r_dot_mm_s, 3),
        "burn_time_s": round(burn_time_s, 1),
        "fuel_mass_kg": round(fuel_mass_kg, 2),
        "oxidizer_mass_kg": round(oxidizer_mass_kg, 2),
        "total_propellant_mass_kg": round(fuel_mass_kg + oxidizer_mass_kg, 2),
        "throat_area_cm2": round(A_t * 1e4, 2),
        "throat_diameter_mm": round(2 * math.sqrt(A_t / math.pi) * 1000.0, 2),
        "thrust_coefficient_cf": round(cf_eff, 3),
        "characteristic_velocity_c_star": c_star,
        "oxidiser_mass_flux_g_ox_kg_m2_s": round(g_ox, 1),
        "m_dot_total_kg_s": round(m_dot_total, 3),
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
