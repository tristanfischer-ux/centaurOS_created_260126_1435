#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/opv_solar_cell.py

Organic photovoltaic (OPV) solar cell sizing for space applications —
flexible, low-mass solar arrays.

Companies served: Spacelis (DE), Heliatek (DE space partners), DSM Photovoltaic.

Input:
    {
      "irradiance_w_m2": 1361.0,
      "cell_area_m2": 1.0,
      "cell_efficiency_pct": 12.0,
      "beginning_of_life_eol_factor": 0.7,
      "mission_duration_years": 5.0
    }

Output:
    power_w, mass_kg, area_specific_mass_g_m2, degradation_lifetime_years,
    _provenance.

Physics:
  Power output: P = irradiance * area * efficiency * EOL_factor
  Degradation: typical OPV t_50 = 20,000 hours @ AM 1.5G; space-derated by UV
  Mass density: 200-500 g/m^2 typical for OPV vs 1500-2500 for Si

References:
- Brabec, C.J., Dyakonov, V., Scherf, U. (eds.), "Organic Photovoltaics:
  Materials, Device Physics, and Manufacturing Technologies", 2nd ed.,
  Wiley-VCH 2014.
- Cardinaletti, I. et al., "Organic and perovskite solar cells for space
  applications", Solar Energy Mat. Solar Cells 182:121-127, 2018.
- Heliatek HeliaFilm datasheet (2023).
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
    "tool_name": "opv_solar_cell (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Brabec, Dyakonov & Scherf (2014) 'Organic Photovoltaics' 2nd ed. Wiley-VCH; "
        "Cardinaletti et al. (2018) Solar Energy Mat. Solar Cells 182:121 "
        "DOI:10.1016/j.solmat.2018.03.024; "
        "Heliatek HeliaFilm datasheet (2023)."
    ),
    "physics_basis": (
        "OPV cell P = irradiance * area * efficiency. Degradation from UV "
        "(no atmospheric protection), proton flux, temperature cycling. "
        "Mass density 200-500 g/m^2 from flexible polymer substrate."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "OPV_MASS_DENSITY_G_M2": {
            "source": "Heliatek HeliaFilm: 500 g/m^2; FlexOPV: 300 g/m^2; lab cells: 200 g/m^2",
            "confidence": "datasheet",
        },
        "TYPICAL_OPV_EFFICIENCY_PCT": {
            "source": "NREL Best Research Cell Efficiency Chart 2024 — OPV champion 19.2%, commercial 8-12%",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    irradiance_w_m2 = float(payload.get("irradiance_w_m2", 1361.0))
    cell_area_m2 = float(payload.get("cell_area_m2", 1.0))
    cell_eff_pct = float(payload.get("cell_efficiency_pct", 12.0))
    eol_factor = float(payload.get("beginning_of_life_eol_factor", 0.7))
    mission_yr = float(payload.get("mission_duration_years", 5.0))
    temperature_c = float(payload.get("operating_temperature_c", 50.0))
    radiation_environment = str(payload.get("radiation_environment", "LEO"))

    # Temperature derating: OPV degrades faster than Si at high T
    # Coefficient: -0.5%/K vs reference 25°C
    temp_coeff = -0.005
    temp_factor = 1.0 + temp_coeff * (temperature_c - 25.0)
    temp_factor = max(0.3, temp_factor)

    # Power at BOL (W)
    p_bol_w = irradiance_w_m2 * cell_area_m2 * (cell_eff_pct / 100.0) * temp_factor

    # Power at EOL (W)
    p_eol_w = p_bol_w * eol_factor

    # Mass
    # Mass density for production OPV: ~300 g/m^2 (flexible substrate)
    mass_density_g_m2 = float(payload.get("mass_density_g_m2", 300.0))
    mass_kg = cell_area_m2 * mass_density_g_m2 / 1000.0

    # Specific power
    if mass_kg > 0:
        specific_power_w_kg = p_bol_w / mass_kg
    else:
        specific_power_w_kg = 0

    # Degradation lifetime
    # OPV t_50 ~ 20,000 hours under AM1.5G; in space derate for radiation:
    # LEO: 30% derate per year (high proton flux, UV)
    # GEO: 50% derate (more UV but less proton)
    if radiation_environment == "LEO":
        annual_degradation = 0.10  # 10% per year typical
    elif radiation_environment == "GEO":
        annual_degradation = 0.08
    else:
        annual_degradation = 0.05

    # Lifetime at which power = 50%
    if annual_degradation > 0:
        t_50_years = math.log(0.5) / math.log(1 - annual_degradation)
    else:
        t_50_years = float("inf")

    # Power after mission years
    power_after_mission = p_bol_w * ((1 - annual_degradation) ** mission_yr)

    # Worked calculations — clean closed-form arithmetic steps only.
    # temp_factor uses max() clamp so is skipped; pass its live value as an input.
    # t_50_years uses log() so is skipped.
    temp_factor_r = round(temp_factor, 3)
    p_bol_r = round(p_bol_w, 2)
    p_eol_r = round(p_eol_w, 2)
    mass_r = round(mass_kg, 3)
    pam_r = round(power_after_mission, 2)
    worked = [
        worked_calc(
            label="Beginning-of-life (BOL) power output",
            formula="p_bol_w = irradiance_w_m2 x cell_area_m2 x (cell_eff_pct / 100) x temp_factor",
            values={
                "irradiance_w_m2": (irradiance_w_m2, "W/m2"),
                "cell_area_m2": (cell_area_m2, "m2"),
                "cell_eff_pct": (cell_eff_pct, "%"),
                "temp_factor": (temp_factor_r, ""),
            },
            result=p_bol_r, result_unit="W",
            assumptions=["temp_factor = 1 + (-0.005/K) x (T_op - 25 C); clamped >= 0.3 (OPV datasheet)"],
        ),
        worked_calc(
            label="End-of-life (EOL) power output",
            formula="p_eol_w = p_bol_w x eol_factor",
            values={
                "p_bol_w": (p_bol_r, "W"),
                "eol_factor": (eol_factor, ""),
            },
            result=p_eol_r, result_unit="W",
            assumptions=["EOL factor supplied by user; covers radiation + UV degradation over mission"],
        ),
        worked_calc(
            label="Cell mass",
            formula="mass_kg = cell_area_m2 x mass_density_g_m2 / 1000",
            values={
                "cell_area_m2": (cell_area_m2, "m2"),
                "mass_density_g_m2": (mass_density_g_m2, "g/m2"),
            },
            result=mass_r, result_unit="kg",
            assumptions=["OPV flexible substrate; Heliatek HeliaFilm: 500 g/m2; default 300 g/m2"],
        ),
        worked_calc(
            label="Specific power",
            formula="specific_power_w_kg = p_bol_w / mass_kg",
            values={
                "p_bol_w": (p_bol_r, "W"),
                "mass_kg": (mass_r, "kg"),
            },
            result=round(specific_power_w_kg, 1), result_unit="W/kg",
            assumptions=["BOL power; mass includes substrate only (not structure or wiring)"],
        ),
        worked_calc(
            label="Power remaining after mission duration",
            formula="power_after_mission = p_bol_w x (1 - annual_degradation) ^ mission_yr",
            values={
                "p_bol_w": (p_bol_r, "W"),
                "annual_degradation": (annual_degradation, ""),
                "mission_yr": (mission_yr, "yr"),
            },
            result=pam_r, result_unit="W",
            assumptions=[f"annual degradation {annual_degradation*100:.0f}%/yr for {radiation_environment} (Cardinaletti et al. 2018)"],
        ),
    ]

    return {
        "irradiance_w_m2": irradiance_w_m2,
        "cell_area_m2": cell_area_m2,
        "cell_efficiency_pct": cell_eff_pct,
        "beginning_of_life_eol_factor": eol_factor,
        "mission_duration_years": mission_yr,
        "operating_temperature_c": temperature_c,
        "temp_derating_factor": round(temp_factor, 3),
        "power_bol_w": round(p_bol_w, 2),
        "power_w": round(p_bol_w, 2),
        "power_eol_w": round(p_eol_w, 2),
        "power_after_mission_w": round(power_after_mission, 2),
        "mass_density_g_m2": mass_density_g_m2,
        "mass_kg": round(mass_kg, 3),
        "area_specific_mass_g_m2": mass_density_g_m2,
        "specific_power_w_kg": round(specific_power_w_kg, 1),
        "radiation_environment": radiation_environment,
        "annual_degradation_rate": annual_degradation,
        "degradation_lifetime_years": round(t_50_years, 1) if t_50_years != float("inf") else None,
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
