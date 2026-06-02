#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/regeneration_energy.py

Sorbent regeneration energy per ton CO2 captured.

Input:
    {
      "sorbent_type": "amine_silica",
      "capture_capacity_g_co2_g_sorbent": 0.05,
      "regeneration_temp_c": 100,
      "ambient_temp_c": 25,
      "heat_source": "low_grade_waste"  // low_grade_waste | electric_resistance | heat_pump
    }

Output:
    {
      "regen_energy_kwh_per_ton_co2": ...,
      "regeneration_time_minutes": ...,
      "specific_heat_demand_gj_per_ton_co2": ...,
      ...
    }

Physics:
- ΔH_desorption: 70-90 kJ/mol for amine-CO2 bond (Sanz-Pérez 2016).
- Sensible heat to warm sorbent: m_sorbent × c_p × ΔT.
- Steam stripping (Carbon Engineering): 5-10 GJ_thermal / ton CO2.
- Climeworks (amine-silica + TSA): 2-3 GJ_thermal / ton CO2 at 100°C.

References:
- Sanz-Pérez et al. (2016) Chem. Rev. 116, 11840.
- Keith et al. (2018) "A Process for Capturing CO2 from the Atmosphere,"
  Joule 2, 1573 — Carbon Engineering KOH process (8.81 GJ/ton).
- IEA 2022 "Direct Air Capture" Technology Tracking Report.
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
    "tool_name": "regeneration_energy (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Sanz-Pérez et al. (2016) Chem. Rev. 116 11840; Keith et al. (2018) Joule 2 1573",
    "physics_basis": "Energy_total = ΔH_desorption + sensible_heat + steam_stripping. ΔH ≈ 80 kJ/mol for amines.",
    "confidence_class": "industry_typical",
    "last_reviewed_date": "2026-05-22",
}

# Sorbent-specific energy parameters
SORBENT_ENERGY = {
    "amine_silica":     {"dh_desorption_kj_mol": 80,  "c_p_kj_kg_k": 1.5, "t_optimal_c": 100, "steam_stoich": 2.0},
    "koh_solution":     {"dh_desorption_kj_mol": 178, "c_p_kj_kg_k": 4.0, "t_optimal_c": 900, "steam_stoich": 0.5},  # high-T calciner
    "mof":              {"dh_desorption_kj_mol": 65,  "c_p_kj_kg_k": 1.2, "t_optimal_c": 110, "steam_stoich": 1.5},
    "zeolite":          {"dh_desorption_kj_mol": 50,  "c_p_kj_kg_k": 1.1, "t_optimal_c": 250, "steam_stoich": 2.5},
    "carbonate_slurry": {"dh_desorption_kj_mol": 168, "c_p_kj_kg_k": 3.5, "t_optimal_c": 800, "steam_stoich": 1.0},
}


def compute(payload: dict) -> dict:
    sorbent = str(payload.get("sorbent_type", "amine_silica")).lower()
    cap_g_g = float(payload.get("capture_capacity_g_co2_g_sorbent", 0.05))
    T_regen_c = float(payload.get("regeneration_temp_c", 100.0))
    T_amb_c = float(payload.get("ambient_temp_c", 25.0))
    heat_source = str(payload.get("heat_source", "low_grade_waste")).lower()

    if sorbent not in SORBENT_ENERGY:
        sorbent = "amine_silica"
    p = SORBENT_ENERGY[sorbent]

    # Desorption enthalpy per ton CO2
    # ΔH × moles CO2 per ton = 80 kJ/mol × (1e6 g / 44 g/mol) = 1.82 GJ/ton
    moles_co2_per_ton = 1e6 / 44.0  # ≈ 22,727 mol/ton
    h_desorption_gj_ton = p["dh_desorption_kj_mol"] * moles_co2_per_ton / 1e6

    # Sensible heat to warm sorbent
    # mass sorbent per ton CO2 = 1e6 g CO2 / cap_g_g = e.g. 1e6/0.05 = 2e7 g = 20 t sorbent
    if cap_g_g > 0:
        mass_sorbent_kg_per_ton_co2 = 1000.0 / cap_g_g  # kg sorbent per kg CO2 → kg/kg
        # Per ton CO2: m_sorbent_kg = 1000 × (1/cap)
        mass_sorbent_kg = 1000.0 / cap_g_g
    else:
        mass_sorbent_kg = 1e6

    dT = T_regen_c - T_amb_c
    h_sensible_kj = mass_sorbent_kg * p["c_p_kj_kg_k"] * dT
    h_sensible_gj_ton = h_sensible_kj / 1e6

    # Steam stripping (only if steam used)
    if "amine" in sorbent or "mof" in sorbent or sorbent == "carbonate_slurry":
        # Steam: 2257 kJ/kg latent + sensible
        # 2 kg steam per mole CO2 desorbed typical
        steam_kg_per_ton = p["steam_stoich"] * moles_co2_per_ton * 0.018  # 18 g H2O/mol
        h_steam_gj_ton = steam_kg_per_ton * 2257 / 1e6
    else:
        h_steam_gj_ton = 0.0

    total_gj_ton = h_desorption_gj_ton + h_sensible_gj_ton + h_steam_gj_ton

    # Account for heat-recovery (60% typical for modern TSA)
    if heat_source == "heat_pump":
        # Heat pump can deliver 100°C with COP ~ 3-4 from ambient
        cop = 3.5
        useful_energy_gj_ton = total_gj_ton / cop
    elif heat_source == "electric_resistance":
        useful_energy_gj_ton = total_gj_ton  # 100% conversion electric → heat
    else:  # low_grade_waste (free / very cheap)
        useful_energy_gj_ton = total_gj_ton * 0.4  # 60% from waste heat, 40% from grid

    energy_kwh_per_ton = useful_energy_gj_ton * 277.78  # GJ → kWh

    # Regeneration time estimate
    # P_heat / m × c_p × dT
    # Assume 100 kW heat input per tonne of sorbent
    P_heat_kw_per_t_sorbent = 100
    time_to_heat_s = (mass_sorbent_kg * p["c_p_kj_kg_k"] * dT) / (P_heat_kw_per_t_sorbent * mass_sorbent_kg / 1000)
    regen_time_min = time_to_heat_s / 60

    # --- Worked calculations ---
    moles_r = round(moles_co2_per_ton, 1)
    h_des_r = round(h_desorption_gj_ton, 2)
    mass_sorb_r = round(mass_sorbent_kg, 0)
    dT_r = round(dT, 1)
    h_sens_kj_r = round(h_sensible_kj, 1)
    h_sens_gj_r = round(h_sensible_gj_ton, 2)
    # steam_kg_per_ton is only computed for amine/mof/carbonate; guard:
    if "amine" in sorbent or "mof" in sorbent or sorbent == "carbonate_slurry":
        steam_kg_r = round(steam_kg_per_ton, 2)
        h_steam_r = round(h_steam_gj_ton, 2)
    else:
        steam_kg_r = 0.0
        h_steam_r = 0.0
    total_gj_r = round(total_gj_ton, 2)
    useful_r = round(useful_energy_gj_ton, 2)
    kwh_r = round(energy_kwh_per_ton, 0)

    worked = [
        worked_calc(
            label="Moles of CO2 per tonne captured",
            formula="n_co2 = 1e6 / M_co2",
            values={
                "M_co2": (44.0, "g/mol"),
            },
            result=moles_r,
            result_unit="mol/tonne",
            assumptions=["1 tonne CO2 = 1e6 g; molar mass CO2 = 44 g/mol"],
        ),
        worked_calc(
            label="Desorption enthalpy per tonne CO2",
            formula="H_des = dh_mol x n_co2 / 1e6",
            values={
                "dh_mol": (p["dh_desorption_kj_mol"], "kJ/mol"),
                "n_co2": (moles_r, "mol/tonne"),
            },
            result=h_des_r,
            result_unit="GJ/tonne",
            assumptions=[f"dh_mol = {p['dh_desorption_kj_mol']} kJ/mol for {sorbent} (Sanz-Perez 2016)"],
        ),
        worked_calc(
            label="Sorbent mass per tonne CO2 captured",
            formula="m_sorbent = 1000 / cap",
            values={
                "cap": (cap_g_g, "g_CO2/g_sorbent"),
            },
            result=mass_sorb_r,
            result_unit="kg_sorbent/tonne_CO2",
            assumptions=["1000 kg CO2 per tonne; cap = grams CO2 per gram sorbent"],
        ),
        worked_calc(
            label="Sensible heat to warm sorbent",
            formula="H_sens_kJ = m_sorbent x c_p x dT",
            values={
                "m_sorbent": (mass_sorb_r, "kg"),
                "c_p": (p["c_p_kj_kg_k"], "kJ/kg/K"),
                "dT": (dT_r, "K"),
            },
            result=h_sens_kj_r,
            result_unit="kJ",
            assumptions=[f"dT = T_regen - T_amb = {T_regen_c} - {T_amb_c} = {dT_r} K"],
        ),
        worked_calc(
            label="Sensible heat in GJ per tonne CO2",
            formula="H_sens_GJ = H_sens_kJ / 1e6",
            values={
                "H_sens_kJ": (h_sens_kj_r, "kJ"),
            },
            result=h_sens_gj_r,
            result_unit="GJ/tonne",
            assumptions=["unit conversion only: 1 GJ = 1e6 kJ"],
        ),
        worked_calc(
            label="Total thermal energy demand (no heat recovery)",
            formula="H_total = H_des + H_sens + H_steam",
            values={
                "H_des": (h_des_r, "GJ/tonne"),
                "H_sens": (h_sens_gj_r, "GJ/tonne"),
                "H_steam": (h_steam_r, "GJ/tonne"),
            },
            result=total_gj_r,
            result_unit="GJ/tonne",
            assumptions=["H_steam = steam_kg x 2257 kJ/kg / 1e6; steam latent heat 2257 kJ/kg"],
        ),
        worked_calc(
            label="Useful energy after heat-source adjustment",
            formula="H_useful = H_total x source_factor",
            values={
                "H_total": (total_gj_r, "GJ/tonne"),
                "source_factor": (round(useful_r / total_gj_r if total_gj_r > 0 else 1.0, 3), ""),
            },
            result=useful_r,
            result_unit="GJ/tonne",
            assumptions=[
                "low_grade_waste: 0.4 (40% from grid, 60% from free waste heat); "
                "heat_pump: 1/COP=1/3.5=0.286; electric_resistance: 1.0",
            ],
        ),
        worked_calc(
            label="Regeneration energy in kWh per tonne CO2",
            formula="E_kwh = H_useful x 277.78",
            values={
                "H_useful": (useful_r, "GJ/tonne"),
            },
            result=kwh_r,
            result_unit="kWh/tonne",
            assumptions=["1 GJ = 277.78 kWh"],
        ),
    ]

    return {
        "sorbent_type": sorbent,
        "capture_capacity_g_co2_g_sorbent": cap_g_g,
        "regeneration_temp_c": T_regen_c,
        "ambient_temp_c": T_amb_c,
        "heat_source": heat_source,
        "regen_energy_kwh_per_ton_co2": round(energy_kwh_per_ton, 0),
        "specific_heat_demand_gj_per_ton_co2": round(useful_energy_gj_ton, 2),
        "h_desorption_gj_ton": round(h_desorption_gj_ton, 2),
        "h_sensible_gj_ton": round(h_sensible_gj_ton, 2),
        "h_steam_gj_ton": round(h_steam_gj_ton, 2),
        "h_total_gj_ton_no_recovery": round(total_gj_ton, 2),
        "regeneration_time_minutes": round(regen_time_min, 1),
        "mass_sorbent_kg_per_ton_co2": round(mass_sorbent_kg, 0),
        "dh_desorption_kj_mol": p["dh_desorption_kj_mol"],
        "dt_kelvin": dT,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
