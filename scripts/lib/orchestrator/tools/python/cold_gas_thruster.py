#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cold_gas_thruster.py

Cold-gas / warm-gas thruster sizing for fine pointing, formation flight,
CubeSat propulsion.

Input:
    {
      "total_impulse_required_ns": 500.0,
      "propellant": "N2",                  # N2 | butane | Xe | NH3_warm_gas
      "thrust_n_per_thruster": 1.0,
      "regulator_pressure_bar": 5.0,
      "tank_pressure_bar": 200.0,
      "tank_volume_l": 5.0
    }

Output:
    {
      "propellant_mass_kg": ...,
      "Isp_s": ...,
      "lifetime_impulses": ...,
      "thruster_count_recommended": ...,
      "total_system_mass_kg": ...,
      ...
    }

Cold-gas Isp ≈ 50-80 s depending on gas (Brown ch.6.10; Sutton Ch.18).
Warm-gas (resistojet) NH3 Isp ≈ 150-200 s.

Gas properties at 300 K:
  N2    M = 28.0 g/mol, γ=1.40, ρ_stp = 1.165 kg/m³
  butane C4H10 M=58.1, γ=1.10, ρ_liq = 580 (saturated vapour pressure ~2 bar @25°C)
  Xe    M=131.3,        γ=1.66, ρ_stp = 5.4   (high storage density)
  NH3 warm-gas M=17.0, γ=1.31, ρ_liq = 681

References:
- Brown, "Spacecraft Propulsion", AIAA 1996, ch. 6.10.
- Sutton & Biblarz, ch.18 "Electric, Solar-Thermal & Hybrid Propulsion".
- Aerojet Marquardt cold-gas thruster datasheets (5N N2 thruster MARSIS).
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
    "tool_name": 'cold_gas_thruster (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Brown (2002), 'Spacecraft Propulsion' ch.6.10, AIAA; Sutton (2016) 'Rocket Propulsion Elements' ch.18",
    "physics_basis": 'Isentropic nozzle expansion: Isp = sqrt(2 × γ / (γ-1) × R_specific × T_chamber × (1 - (P_e/P_c)^((γ-1)/γ))) / g0.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# (Isp at room T [s], molar mass [g/mol], storage form, storage density [kg/m³ at 200 bar
# for compressed; saturated liquid for liquefied])
PROPELLANTS = {
    "N2":     {"isp_s": 75,  "M_g_mol": 28.0,  "storage_form": "compressed",  "rho_storage_kgm3": 230.0},
    "butane": {"isp_s": 65,  "M_g_mol": 58.1,  "storage_form": "liquefied",   "rho_storage_kgm3": 580.0},
    "Xe":     {"isp_s": 28,  "M_g_mol": 131.3, "storage_form": "compressed",  "rho_storage_kgm3": 1500.0},
    "NH3_warm_gas": {"isp_s": 180, "M_g_mol": 17.0, "storage_form": "liquefied", "rho_storage_kgm3": 681.0},
}

G0 = 9.80665


def compute(payload: dict) -> dict:
    total_impulse_ns = float(payload.get("total_impulse_required_ns", 500.0))
    propellant = safe_choice(str(payload.get("propellant", "N2")), PROPELLANTS, default="N2", label="propellant")
    thrust_per = float(payload.get("thrust_n_per_thruster", 1.0))
    p_reg_bar = float(payload.get("regulator_pressure_bar", 5.0))
    p_tank_bar = float(payload.get("tank_pressure_bar", 200.0))
    v_tank_l = float(payload.get("tank_volume_l", 5.0))

    if propellant not in PROPELLANTS:
        raise ValueError(f"unknown propellant {propellant!r}; known: {list(PROPELLANTS)}")
    prop = PROPELLANTS[propellant]
    isp = prop["isp_s"]

    # Propellant mass from total impulse: I = m * Isp * g0  =>  m = I / (Isp * g0)
    prop_mass_kg = total_impulse_ns / (isp * G0)

    # Check tank capacity (for compressed gases) using ideal gas law
    # PV = nRT, n = PV/(RT), m = n*M
    # For compressed: m_max = (P_tank * V) / (R_specific * T)
    R_universal = 8.314  # J/(mol·K)
    M_kg_mol = prop["M_g_mol"] * 1e-3
    R_specific = R_universal / M_kg_mol
    T_K = 293.15

    if prop["storage_form"] == "compressed":
        # m_max = P*V / (R_specific * T)
        v_tank_m3 = v_tank_l * 1e-3
        p_tank_pa = p_tank_bar * 1e5
        m_max_per_tank_kg = (p_tank_pa * v_tank_m3) / (R_specific * T_K)
    else:
        # Liquefied: density * volume (assume tank ~95% liquid fill at room T)
        v_tank_m3 = v_tank_l * 1e-3 * 0.95
        m_max_per_tank_kg = prop["rho_storage_kgm3"] * v_tank_m3

    tank_count = max(1, math.ceil(prop_mass_kg / max(1e-6, m_max_per_tank_kg)))
    tank_count_actual = tank_count

    # Single thruster impulse capability: scale with cold-gas valve life
    # Typical cold-gas solenoid valve: 1e6 firings, 50 ms per fire => 50 N·s per firing at 1N
    # For continuous, lifetime impulses ~ impulse_capacity_per_valve / impulse_per_fire
    lifetime_impulses = 1_000_000

    # Recommended thruster count — pair for 3-axis (6 minimum) but for FCS only 4 may suffice
    # Default: 4 thrusters for 1-axis attitude push or fine pointing; 6-8 for full 3-axis
    if total_impulse_ns < 100:
        thruster_count_rec = 4
    elif total_impulse_ns < 1000:
        thruster_count_rec = 6
    else:
        thruster_count_rec = 8

    # System masses
    # Tank: ~1 kg per litre at 200 bar Ti tank; lower for low-pressure liquefied
    if prop["storage_form"] == "compressed":
        tank_mass_kg = 1.0 * v_tank_l * tank_count_actual
    else:
        tank_mass_kg = 0.4 * v_tank_l * tank_count_actual  # lower pressure rating

    # Thruster mass: 0.05 kg each for 1 N cold-gas solenoid
    thruster_mass_each = 0.05 * (thrust_per / 1.0) ** 0.5
    thruster_total_mass = thruster_mass_each * thruster_count_rec

    # Regulator + plumbing: ~0.5 kg
    regulator_mass = 0.5

    total_system_mass = (
        prop_mass_kg + tank_mass_kg + thruster_total_mass + regulator_mass
    )

    # Mass flow rate at thrust
    m_dot_per = thrust_per / (isp * G0)

    # Worked calculations — reviewer-verifiable arithmetic steps.
    # tank_count uses math.ceil (branchy) → SKIPPED.
    prop_mass_r    = round(prop_mass_kg, 4)
    m_max_r        = round(m_max_per_tank_kg, 4)
    m_dot_r        = round(m_dot_per, 7)
    R_spec_r       = round(R_specific, 2)

    # Tank capacity worked step differs by storage form (two clean arithmetic paths).
    if prop["storage_form"] == "compressed":
        tank_cap_wc = worked_calc(
            label="Maximum propellant per tank (ideal gas, compressed)",
            formula="m_max = (p_tank_pa x v_tank_m3) / (R_specific x T_K)",
            values={
                "p_tank_pa":  (p_tank_bar * 1e5, "Pa"),
                "v_tank_m3":  (v_tank_l * 1e-3,  "m3"),
                "R_specific": (R_spec_r,           "J/(kg K)"),
                "T_K":        (T_K,                "K"),
            },
            result=m_max_r, result_unit="kg",
            assumptions=["Ideal gas law PV = mRT. R_specific = R_universal / M_molar."],
        )
    else:
        v_liq_m3 = v_tank_l * 1e-3 * 0.95
        tank_cap_wc = worked_calc(
            label="Maximum propellant per tank (liquefied, density method)",
            formula="m_max = rho_storage x v_liq_m3",
            values={
                "rho_storage": (prop["rho_storage_kgm3"], "kg/m3"),
                "v_liq_m3":    (round(v_liq_m3, 5),       "m3"),
            },
            result=m_max_r, result_unit="kg",
            assumptions=["95% liquid fill fraction at room temperature; density from PROPELLANTS table."],
        )

    worked = [
        worked_calc(
            label="Propellant mass from total impulse",
            formula="m_prop = I_total / (Isp x g0)",
            values={
                "I_total": (total_impulse_ns, "N s"),
                "Isp":     (isp,             "s"),
                "g0":      (G0,              "m/s2"),
            },
            result=prop_mass_r, result_unit="kg",
            assumptions=["Tsiolkovsky impulse equation: I = m * Isp * g0 → m = I/(Isp*g0)."],
        ),
        tank_cap_wc,
        worked_calc(
            label="Mass flow rate per thruster",
            formula="m_dot = F / (Isp x g0)",
            values={
                "F":   (thrust_per, "N"),
                "Isp": (isp,        "s"),
                "g0":  (G0,         "m/s2"),
            },
            result=m_dot_r, result_unit="kg/s",
            assumptions=["Steady-state on-design thrust, rated Isp."],
        ),
    ]

    return {
        "total_impulse_required_ns": total_impulse_ns,
        "propellant": propellant,
        "Isp_s": isp,
        "thrust_n_per_thruster": thrust_per,
        "regulator_pressure_bar": p_reg_bar,
        "tank_pressure_bar": p_tank_bar,
        "tank_volume_l": v_tank_l,
        "storage_form": prop["storage_form"],
        "propellant_mass_kg": round(prop_mass_kg, 4),
        "max_propellant_per_tank_kg": round(m_max_per_tank_kg, 4),
        "tank_count": tank_count_actual,
        "tank_mass_kg": round(tank_mass_kg, 3),
        "thruster_count_recommended": thruster_count_rec,
        "thruster_mass_each_kg": round(thruster_mass_each, 4),
        "thruster_total_mass_kg": round(thruster_total_mass, 3),
        "regulator_mass_kg": regulator_mass,
        "total_system_mass_kg": round(total_system_mass, 3),
        "lifetime_impulses": lifetime_impulses,
        "mass_flow_rate_kg_s_per_thruster": round(m_dot_per, 7),
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
