#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/rtg_radioisotope.py

Radioisotope Thermoelectric Generator (RTG) sizing — Pu-238, Am-241, Sr-90.

Companies served: Perpetual Atomics (UK), ESA RTG programmes,
Tractebel-Engie consultants.

Input:
    {
      "fuel": "Pu-238" | "Am-241" | "Sr-90",
      "fuel_mass_g": 100.0,
      "mission_duration_years": 10.0,
      "hot_end_temp_k": 1200.0,
      "cold_end_temp_k": 500.0,
      "thermoelectric_module": "SiGe" | "PbTe" | "GeTe_TAGS" | "skutterudite"
    }

Output:
    thermal_power_w, electrical_power_w_eol, mass_kg,
    thermoelectric_efficiency_pct, fuel_decay_factor, _provenance.

Physics:
  Specific thermal power at BOL (W/g):
    Pu-238: 0.566 (87.7 yr half-life)
    Am-241: 0.114 (432 yr)
    Sr-90:  0.93   (28.8 yr; but pure beta-emitter — beta + brems)
  Decay: P(t) = P_0 * exp(-ln(2) * t / t_half)
  Efficiency: typically 5-10% (thermoelectric); >15% Stirling RTG variants

References:
- Bennett, G.L., "Space Nuclear Power: Opening the Final Frontier", AIAA
  2006-4191, 2006.
- Voiculescu, M.G., O'Brien, R.C., "Status of the Department of Energy's RTG
  Programs", DOE/NE-0146, 2018.
- NASA RPS Program — "Radioisotope Power Systems: A Decadal Survey",
  National Academies Press, 2009.
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
    "tool_name": "rtg_radioisotope (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Bennett (2006) AIAA 2006-4191 'Space Nuclear Power: Opening the "
        "Final Frontier'; "
        "Voiculescu & O'Brien (2018) DOE/NE-0146; "
        "NAS (2009) 'Radioisotope Power Systems: A Decadal Survey'."
    ),
    "physics_basis": (
        "RTG = radioisotope decay × thermoelectric conversion. Power "
        "decay follows exponential half-life. Specific thermal power "
        "from CRC Handbook 95th ed.; Pu-238 0.566 W/g BOL."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "FUEL_PROPERTIES": {
            "source": "CRC Handbook of Chemistry and Physics 95th ed.; ANL-7886 'Radioisotope Power Supplies'",
            "confidence": "library",
        },
        "THERMOELECTRIC_EFFICIENCIES": {
            "source": "Rowe (ed.) 'Thermoelectrics Handbook' 2006; SiGe ~7% at delta_T=700K, PbTe ~9% at 500K",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Radioisotope properties
# - power_density (W/g thermal, BOL)
# - half_life_years
# - molar_mass (g/mol)
FUELS = {
    "Pu-238": {"power_density_w_g": 0.566, "half_life_yr": 87.7},
    "Am-241": {"power_density_w_g": 0.114, "half_life_yr": 432.2},
    "Sr-90":  {"power_density_w_g": 0.93, "half_life_yr": 28.8},
    "Po-210": {"power_density_w_g": 140.0, "half_life_yr": 0.378},
    "Cm-244": {"power_density_w_g": 2.78, "half_life_yr": 18.1},
}

# Thermoelectric module efficiency (figure of merit ZT and operating range)
TE_MODULES = {
    "SiGe":         {"max_temp_k": 1300, "min_temp_k": 600, "eta_at_dT_700": 0.07},
    "PbTe":         {"max_temp_k": 800, "min_temp_k": 400, "eta_at_dT_500": 0.09},
    "GeTe_TAGS":    {"max_temp_k": 800, "min_temp_k": 350, "eta_at_dT_500": 0.10},
    "skutterudite": {"max_temp_k": 900, "min_temp_k": 400, "eta_at_dT_700": 0.10},
    "Stirling":     {"max_temp_k": 900, "min_temp_k": 350, "eta_at_dT_500": 0.30},
}


def compute(payload: dict) -> dict:
    fuel = str(payload.get("fuel", "Pu-238"))
    fuel_mass_g = float(payload.get("fuel_mass_g", 100.0))
    mission_yr = float(payload.get("mission_duration_years", 10.0))
    hot_k = float(payload.get("hot_end_temp_k", 1200.0))
    cold_k = float(payload.get("cold_end_temp_k", 500.0))
    te_module = str(payload.get("thermoelectric_module", "SiGe"))

    if fuel not in FUELS:
        raise ValueError(f"unknown fuel {fuel!r}; known: {list(FUELS)}")
    if te_module not in TE_MODULES:
        te_module = "SiGe"

    f = FUELS[fuel]
    te = TE_MODULES[te_module]

    # Thermal power at BOL
    p_thermal_bol_w = fuel_mass_g * f["power_density_w_g"]

    # Decay factor over mission
    decay_factor = math.exp(-math.log(2) * mission_yr / f["half_life_yr"])
    p_thermal_eol_w = p_thermal_bol_w * decay_factor

    # Thermoelectric efficiency
    # Carnot limit:
    if hot_k > cold_k:
        eta_carnot = (hot_k - cold_k) / hot_k
    else:
        eta_carnot = 0.0

    # Real efficiency = baseline * carnot_correction
    delta_t = hot_k - cold_k
    if te_module == "SiGe":
        eta_real = te["eta_at_dT_700"] * (delta_t / 700.0)
    elif te_module == "PbTe":
        eta_real = te["eta_at_dT_500"] * (delta_t / 500.0)
    elif te_module == "GeTe_TAGS":
        eta_real = te["eta_at_dT_500"] * (delta_t / 500.0)
    elif te_module == "skutterudite":
        eta_real = te["eta_at_dT_700"] * (delta_t / 700.0)
    elif te_module == "Stirling":
        eta_real = te["eta_at_dT_500"] * (delta_t / 500.0)
    else:
        eta_real = 0.07

    # Bound to Carnot
    eta_real = min(eta_real, eta_carnot * 0.5)
    eta_real = max(eta_real, 0.0)

    # Electrical power
    p_elec_bol_w = p_thermal_bol_w * eta_real
    p_elec_eol_w = p_thermal_eol_w * eta_real

    # Mass: fuel + cladding + insulation + TE modules + radiator + structure
    # Cassini GPHS-RTG: 56.5 kg gross, ~8 kg PuO2, 285 W BOL → ~6 kg per kW thermal at PuO2
    # Approximation:
    fuel_cladding_g = fuel_mass_g * 0.5  # Ta/Ir + GIS layers
    fuel_total_kg = (fuel_mass_g + fuel_cladding_g) / 1000.0
    # Mass scaling: ~50 kg per kW thermal for full RTG
    rtg_total_mass_kg = max(2.0, p_thermal_bol_w / 1000.0 * 50.0)

    # Limit warnings
    over_temp = hot_k > te["max_temp_k"]
    under_temp = cold_k < te["min_temp_k"]

    # Worked calculations.  Decay factor involves exp() (transcendental) so
    # p_thermal_eol_w is passed as an opaque input to the electrical steps.
    p_bol_r = round(p_thermal_bol_w, 1)
    p_eol_r = round(p_thermal_eol_w, 1)
    decay_r = round(decay_factor, 4)
    eta_carnot_r = round(eta_carnot, 4)
    eta_real_r = round(eta_real, 4)
    delta_t_r = round(delta_t, 0)

    worked = [
        worked_calc(
            label="Thermal power at BOL",
            formula="P_thermal_BOL = m_fuel x power_density",
            values={
                "m_fuel": (fuel_mass_g, "g"),
                "power_density": (f["power_density_w_g"], "W/g"),
            },
            result=p_bol_r, result_unit="W",
            assumptions=[
                f"Specific thermal power {f['power_density_w_g']} W/g for {fuel} "
                f"(half-life {f['half_life_yr']} yr); CRC Handbook 95th ed. + Bennett 2006 AIAA 2006-4191",
            ],
        ),
        worked_calc(
            label="Carnot efficiency limit",
            formula="eta_carnot = (T_hot - T_cold) / T_hot",
            values={
                "T_hot": (hot_k, "K"),
                "T_cold": (cold_k, "K"),
            },
            result=eta_carnot_r, result_unit="",
            assumptions=["Second-law maximum; real TE operates at ~40-50% of Carnot (Rowe 2006)"],
        ),
        worked_calc(
            label="TE module real efficiency",
            formula="eta_real = eta_ref x (delta_T / delta_T_ref)",
            values={
                "eta_ref": (te.get("eta_at_dT_700", te.get("eta_at_dT_500", 0.07)), ""),
                "delta_T": (delta_t_r, "K"),
                "delta_T_ref": (700.0 if te_module in ("SiGe", "skutterudite") else 500.0, "K"),
            },
            result=eta_real_r, result_unit="",
            assumptions=[
                f"{te_module} reference efficiency from Rowe 'Thermoelectrics Handbook' 2006; "
                "bounded to 0.5 x eta_carnot",
            ],
        ),
        worked_calc(
            label="Electrical power at BOL",
            formula="P_elec_BOL = P_thermal_BOL x eta_real",
            values={
                "P_thermal_BOL": (p_bol_r, "W"),
                "eta_real": (eta_real_r, ""),
            },
            result=round(p_elec_bol_w, 2), result_unit="W",
            assumptions=["eta_real already bounded to Carnot limit above"],
        ),
        worked_calc(
            label="Electrical power at EOL",
            formula="P_elec_EOL = P_thermal_EOL x eta_real",
            values={
                "P_thermal_EOL": (p_eol_r, "W"),
                "eta_real": (eta_real_r, ""),
            },
            result=round(p_elec_eol_w, 2), result_unit="W",
            assumptions=[
                f"P_thermal_EOL = {p_bol_r} x decay_factor {decay_r} "
                f"(exp(-ln2 x {mission_yr} yr / {f['half_life_yr']} yr) — transcendental, pre-computed)",
            ],
        ),
    ]

    return {
        "fuel": fuel,
        "fuel_mass_g": fuel_mass_g,
        "fuel_specific_power_w_g": f["power_density_w_g"],
        "half_life_years": f["half_life_yr"],
        "thermoelectric_module": te_module,
        "hot_end_temp_k": hot_k,
        "cold_end_temp_k": cold_k,
        "delta_t_k": delta_t_r,
        "mission_duration_years": mission_yr,
        "thermal_power_bol_w": p_bol_r,
        "thermal_power_eol_w": p_eol_r,
        "thermal_power_w": p_eol_r,
        "fuel_decay_factor": decay_r,
        "carnot_efficiency_pct": round(eta_carnot * 100.0, 1),
        "thermoelectric_efficiency_pct": round(eta_real * 100.0, 2),
        "fraction_of_carnot": round(eta_real / max(eta_carnot, 0.001) * 100.0, 1),
        "electrical_power_w_bol": round(p_elec_bol_w, 2),
        "electrical_power_w_eol": round(p_elec_eol_w, 2),
        "fuel_with_cladding_mass_kg": round(fuel_total_kg, 3),
        "mass_kg": round(rtg_total_mass_kg, 2),
        "over_max_te_temp": over_temp,
        "under_min_te_temp": under_temp,
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
