#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/sorbent_kinetics.py

CO2 adsorption kinetics for direct-air-capture (DAC) sorbents.

Input:
    {
      "sorbent": "amine_silica",      // amine_silica | koh_solution | mof | zeolite
      "air_co2_ppm": 420,
      "contact_time_s": 60,
      "temperature_c": 25,
      "humidity_pct": 50
    }

Output:
    {
      "capture_rate_kg_co2_per_kg_sorbent_per_hr": ...,
      "breakthrough_time_hours": ...,
      "capacity_g_co2_g_sorbent": ...,
      ...
    }

Physics:
- Equilibrium capacity (mass CO2 / mass sorbent) from Langmuir isotherm:
  q_eq = q_max × b·P / (1 + b·P)
- Adsorption rate: dq/dt = k_LDF × (q_eq - q)  [Linear Driving Force]
- Sorbent comparison (literature):
  - Amine-silica (Climeworks): q_max ≈ 2.5 mmol/g (0.11 g/g), k ≈ 0.001 s⁻¹
  - KOH solution (Carbon Engineering): liquid sorbent, ~50 ppm·s breakthrough
  - MOF (e.g. Mg-MOF-74): q_max ≈ 3.5 mmol/g, k ≈ 0.005 s⁻¹

References:
- Bui et al. (2018) "Carbon capture and storage: a review," Energy &
  Environmental Science 11, 1062.
- Sanz-Pérez et al. (2016) "Direct Capture of CO2 from Ambient Air,"
  Chem. Rev. 116, 11840.
- Climeworks technical disclosures (2024).
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "sorbent_kinetics (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Sanz-Pérez et al. (2016) Chem. Rev. 116 11840; Bui et al. (2018) EES 11 1062",
    "physics_basis": "Langmuir isotherm equilibrium + LDF kinetics dq/dt = k_LDF·(q_eq - q). Sorbent-specific q_max and k.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

# Sorbent parameters: q_max_mmol_g, k_LDF_per_s, T_regen_c
SORBENTS = {
    "amine_silica":   {"q_max_mmol_g": 2.5, "k_LDF_per_s": 0.001, "T_regen_c": 100, "energy_kj_mol": 80},
    "koh_solution":   {"q_max_mmol_g": 25.0, "k_LDF_per_s": 0.01, "T_regen_c": 900, "energy_kj_mol": 120},  # 2-stage with calciner
    "mof":            {"q_max_mmol_g": 3.5, "k_LDF_per_s": 0.005, "T_regen_c": 110, "energy_kj_mol": 70},
    "zeolite":        {"q_max_mmol_g": 1.8, "k_LDF_per_s": 0.003, "T_regen_c": 250, "energy_kj_mol": 100},
    "carbonate_slurry": {"q_max_mmol_g": 8.0, "k_LDF_per_s": 0.008, "T_regen_c": 800, "energy_kj_mol": 110},
}


def compute(payload: dict) -> dict:
    sorbent = str(payload.get("sorbent", "amine_silica")).lower()
    co2_ppm = float(payload.get("air_co2_ppm", 420.0))
    contact_s = float(payload.get("contact_time_s", 60.0))
    T_c = float(payload.get("temperature_c", 25.0))
    rh_pct = float(payload.get("humidity_pct", 50.0))

    if sorbent not in SORBENTS:
        sorbent = "amine_silica"
    p = SORBENTS[sorbent]
    q_max_mmol_g = p["q_max_mmol_g"]
    k_LDF = p["k_LDF_per_s"]
    T_regen = p["T_regen_c"]
    energy_kj_mol = p["energy_kj_mol"]

    # CO2 partial pressure: ambient ≈ 0.04 bar at 420 ppm and 1 atm
    p_co2_bar = co2_ppm / 1e6 * 1.01325

    # Langmuir b: typical 100-500 bar⁻¹ for amine sorbents → 95% capacity at 0.04 bar
    b_bar_inv = 200.0
    q_eq_mmol_g = q_max_mmol_g * b_bar_inv * p_co2_bar / (1 + b_bar_inv * p_co2_bar)

    # Humidity boost (amines): RH 50-60% optimum, gain ~30%
    if sorbent == "amine_silica" or sorbent == "mof":
        rh_factor = 1.0 + 0.3 * math.exp(-0.005 * ((rh_pct - 55) ** 2))
        q_eq_mmol_g *= rh_factor
    else:
        rh_factor = 1.0

    # Temperature effect: lower T → more adsorption
    if T_c > 25:
        T_factor = math.exp((25 - T_c) * 0.02)
        q_eq_mmol_g *= max(0.3, T_factor)

    # Capture during contact time (LDF model)
    q_at_t_mmol_g = q_eq_mmol_g * (1 - math.exp(-k_LDF * contact_s))
    q_at_t_g_g = q_at_t_mmol_g * 0.044 / 1000  # g CO2 / g sorbent

    # Time to 99% saturation (breakthrough)
    if k_LDF > 0:
        t_99_s = -math.log(0.01) / k_LDF
        breakthrough_time_hr = t_99_s / 3600
    else:
        breakthrough_time_hr = 999

    # Capture rate (steady-state assuming continuous regeneration cycle)
    # rate = q_at_t / cycle_time
    # cycle_time = adsorption + regen + cooling
    adsorption_time_s = contact_s
    regen_time_s = adsorption_time_s * 2  # 2× because heating + steam stripping
    cycle_time_s = adsorption_time_s + regen_time_s
    capture_rate_g_per_g_per_hr = q_at_t_g_g * 3600 / cycle_time_s

    # Energy intensity (kWh / ton CO2)
    moles_co2_per_kg = q_at_t_mmol_g  # mmol/g = mol/kg
    energy_kj_per_kg_co2 = (energy_kj_mol * moles_co2_per_kg) / (44.0 / 1000.0 * moles_co2_per_kg)
    # simpler: per mol CO2 = energy_kj_mol; per kg CO2 = energy_kj_mol / 0.044
    energy_kj_per_kg_co2 = energy_kj_mol / 0.044
    energy_gj_per_ton_co2 = energy_kj_per_kg_co2 / 1000.0  # GJ/ton
    energy_kwh_per_ton_co2 = energy_gj_per_ton_co2 * 277.78  # convert GJ→kWh

    return {
        "sorbent": sorbent,
        "air_co2_ppm": co2_ppm,
        "contact_time_s": contact_s,
        "temperature_c": T_c,
        "humidity_pct": rh_pct,
        "q_max_mmol_g": q_max_mmol_g,
        "q_eq_mmol_g": round(q_eq_mmol_g, 3),
        "capacity_g_co2_g_sorbent": round(q_at_t_g_g, 4),
        "capacity_mmol_g_at_contact_time": round(q_at_t_mmol_g, 3),
        "capture_rate_kg_co2_per_kg_sorbent_per_hr": round(capture_rate_g_per_g_per_hr / 1000.0, 4),
        "capture_rate_g_co2_per_g_sorbent_per_hr": round(capture_rate_g_per_g_per_hr, 4),
        "breakthrough_time_hours": round(breakthrough_time_hr, 2),
        "k_LDF_per_s": k_LDF,
        "regeneration_temp_c": T_regen,
        "rh_factor": round(rh_factor, 3),
        "energy_kj_per_mol_co2": energy_kj_mol,
        "energy_gj_per_ton_co2": round(energy_gj_per_ton_co2, 2),
        "energy_kwh_per_ton_co2": round(energy_kwh_per_ton_co2, 0),
        "cycle_time_s": cycle_time_s,
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
