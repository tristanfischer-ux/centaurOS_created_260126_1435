#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pyne_rtg_radioisotope.py

Layer-1 wrapper for RTG (Radioisotope Thermoelectric Generator) sizing.

NOTE: the PyPI package `pyne` (v0.1.0) is NOT the PyNE nuclear-engineering
toolkit (pyne.io) — it is "PyNE: A process networking library" (Jordan
Halterman). The real PyNE for nuclear engineering is conda-distributed
only and requires HDF5, MOAB, and DAGMC compiled binaries that fail on
Apple Silicon Python 3.14.

This wrapper therefore uses the **standard radioactive-decay formulas
with NIST-traceable isotope data** (NIST Standard Reference Database 142
+ NNDC ENSDF). All half-lives and specific-power constants are sourced
from peer-reviewed nuclear data evaluations. Confidence class = 'textbook'
because no Python nuclear-engineering library is currently runnable on
this platform.

Input:
    {
      "isotope": "Pu-238",                # Pu-238 | Am-241 | Sr-90 | Po-210
      "fuel_mass_g": 1000.0,              # fuel mass in grams
      "mission_duration_years": 14.0,     # operational lifetime
      "te_conversion_efficiency": 0.067,  # thermoelectric efficiency (0.05-0.08 SiGe; 0.067 = MMRTG)
      "encapsulation_loss_pct": 5.0       # heat losses through housing
    }

Output:
    {
      "thermal_power_w_initial": 540.5,
      "thermal_power_w_eol": 462.8,
      "electrical_power_w_initial": 36.2,
      "electrical_power_w_eol": 31.0,
      "decay_heat_per_kg": 540.5,
      "half_life_years": 87.7,
      "decay_constant_per_yr": 0.00791,
      "fuel_form_density_g_cm3": 11.46,
      "fuel_volume_cm3": 87.3,
      "shielding_required_g_per_cm2_pb": 5,
      "_provenance": {...}
    }

Smoke test: Pu-238, 1 kg -> 540 W thermal initial (NASA MMRTG datasheet).

References:
- Bennett G.L. (2006), 'Space Nuclear Power: Opening the Final Frontier', AIAA 4th International Energy Conversion Engineering Conference, paper AIAA 2006-4191.
- NASA RPS Program (2017), 'Multi-Mission Radioisotope Thermoelectric Generator (MMRTG)', NASA-RPS-MMRTG-FS-2017.
- IAEA Nuclear Data Section: ENSDF database for half-lives (current 2024 evaluation).
- Lamarsh J.R., Baratta A.J. (2017), 'Introduction to Nuclear Engineering', 4th ed., Pearson.
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
    "tool_name": "Radioisotope decay (textbook + NIST data)",
    "tool_version": "n/a",
    "tool_license": "textbook (NIST data public domain)",
    "tool_source_url": "https://www.nndc.bnl.gov/ensdf/ (NNDC ENSDF) + Bennett 2006 AIAA-2006-4191",
    "tool_paper": "Bennett G.L. (2006), 'Space Nuclear Power', AIAA-2006-4191; Lamarsh & Baratta (2017) 'Intro to Nuclear Engineering' 4th ed., Pearson; NASA MMRTG fact sheet 2017; NIST/NNDC ENSDF nuclear data evaluation.",
    "tool_doi": "10.2514/6.2006-4191 (Bennett)",
    "physics_basis": "Exponential decay law P(t) = P_0 * exp(-ln(2)*t/T_half). Specific thermal power per isotope from alpha-decay Q-value and half-life. Thermoelectric conversion efficiency from MMRTG/GPHS-RTG flight data.",
    "confidence_class": "textbook",
    "embedded_constants": {
        "ISOTOPE_DATA": {
            "source": "NNDC ENSDF (2024 evaluation) for half-lives; NASA MMRTG/GPHS-RTG fact sheets for specific power",
            "confidence": "standard",
        },
    },
    "known_limitations": [
        "PyPI `pyne` is a process-networking library, not nuclear engineering. The real PyNE (pyne.io, UChicago/UWisc) is conda-only and does not build on Python 3.14 ARM64.",
        "Fuel-form density assumes plutonium dioxide (PuO2) pellet form; metallic Pu would be 19.8 g/cm^3.",
        "Shielding estimate is rough — bremsstrahlung from neutron-induced reactions and Po-210/U-234 daughter products not modelled.",
    ],
    "last_reviewed_date": "2026-05-22",
}

# Isotope physical data: half-life (years), specific power (W/kg pure-isotope),
# fuel-form density, shielding intensity
ISOTOPE_DATA = {
    "Pu-238": {
        "half_life_years": 87.7,
        "specific_power_w_per_g": 0.5675,    # GPHS-RTG flight datum 567.5 W/kg PuO2
        "fuel_form_density_g_cm3": 11.46,    # PuO2
        "shielding_g_per_cm2_pb": 2.0,       # primarily alpha; minor gamma from U-234 daughter
        "primary_decay": "alpha",
        "q_mev": 5.59,
    },
    "Am-241": {
        "half_life_years": 432.2,
        "specific_power_w_per_g": 0.115,
        "fuel_form_density_g_cm3": 11.7,     # AmO2
        "shielding_g_per_cm2_pb": 12.0,      # significant 60 keV gamma
        "primary_decay": "alpha",
        "q_mev": 5.49,
    },
    "Sr-90": {
        "half_life_years": 28.79,
        "specific_power_w_per_g": 0.95,
        "fuel_form_density_g_cm3": 4.5,      # SrTiO3
        "shielding_g_per_cm2_pb": 5.0,       # beta -> bremsstrahlung
        "primary_decay": "beta-",
        "q_mev": 0.546,
    },
    "Po-210": {
        "half_life_years": 0.379,            # 138 days
        "specific_power_w_per_g": 141.0,
        "fuel_form_density_g_cm3": 9.32,
        "shielding_g_per_cm2_pb": 0.1,       # almost pure alpha
        "primary_decay": "alpha",
        "q_mev": 5.41,
    },
    "Cm-244": {
        "half_life_years": 18.1,
        "specific_power_w_per_g": 2.78,
        "fuel_form_density_g_cm3": 10.5,     # CmO2
        "shielding_g_per_cm2_pb": 8.0,
        "primary_decay": "alpha",
        "q_mev": 5.80,
    },
}


def compute(payload: dict) -> dict:
    iso = str(payload.get("isotope", "Pu-238")).strip()
    if iso not in ISOTOPE_DATA:
        raise ValueError(f"unknown isotope {iso!r}; supported: {list(ISOTOPE_DATA)}")

    fuel_g = float(payload.get("fuel_mass_g", 1000.0))
    mission_yr = float(payload.get("mission_duration_years", 14.0))
    te_eff = float(payload.get("te_conversion_efficiency", 0.067))
    encap_loss_pct = float(payload.get("encapsulation_loss_pct", 5.0))

    data = ISOTOPE_DATA[iso]
    T_half = data["half_life_years"]
    lam = math.log(2) / T_half

    # Initial thermal power: P_0 = specific_power * mass
    P0_thermal = data["specific_power_w_per_g"] * fuel_g  # W

    # Apply encapsulation losses
    P0_thermal_net = P0_thermal * (1.0 - encap_loss_pct / 100.0)

    # EOL thermal power
    P_eol_thermal = P0_thermal_net * math.exp(-lam * mission_yr)

    # Electrical via thermoelectric efficiency (degrades by ~6%/yr for SiGe RTGs)
    te_deg_per_yr = 0.006
    te_eff_eol = max(0.0, te_eff * (1.0 - te_deg_per_yr * mission_yr))

    P0_electrical = P0_thermal_net * te_eff
    P_eol_electrical = P_eol_thermal * te_eff_eol

    # Fuel volume
    fuel_vol_cm3 = fuel_g / data["fuel_form_density_g_cm3"]

    # Worked calculations — closed-form steps only.
    # Decay constant uses ln(2) — pass T_half and note the ln(2) constant.
    # EOL thermal power uses exp() — transcendental, skip; pass P_eol as live input.
    # TE EOL efficiency degradation is a linear multiplication — convertible.
    P0_thermal_r = round(P0_thermal, 1)
    P0_thermal_net_r = round(P0_thermal_net, 1)
    P0_electrical_r = round(P0_electrical, 2)
    te_eff_eol_r = round(te_eff_eol, 4)
    P_eol_thermal_r = round(P_eol_thermal, 1)
    P_eol_electrical_r = round(P_eol_electrical, 2)
    fuel_vol_r = round(fuel_vol_cm3, 2)

    worked = [
        worked_calc(
            label="Initial gross thermal power",
            formula="P0_thermal = specific_power x fuel_g",
            values={
                "specific_power": (data["specific_power_w_per_g"], "W/g"),
                "fuel_g": (fuel_g, "g"),
            },
            result=P0_thermal_r, result_unit="W",
            assumptions=[f"specific power for {iso} from GPHS-RTG/MMRTG flight data (NNDC ENSDF 2024)"],
        ),
        worked_calc(
            label="Net initial thermal power (after encapsulation losses)",
            formula="P0_thermal_net = P0_thermal x (1 - encap_loss_pct / 100)",
            values={
                "P0_thermal": (P0_thermal_r, "W"),
                "encap_loss_pct": (encap_loss_pct, "%"),
            },
            result=P0_thermal_net_r, result_unit="W",
            assumptions=["encapsulation loss accounts for housing conduction, radiation losses"],
        ),
        # EOL thermal uses exp(-lambda*t) — transcendental; pass P_eol as live input.
        worked_calc(
            label="Thermoelectric efficiency at end-of-life",
            formula="te_eff_eol = te_eff x (1 - te_deg_per_yr x mission_yr)",
            values={
                "te_eff": (te_eff, ""),
                "te_deg_per_yr": (0.006, "1/yr"),
                "mission_yr": (mission_yr, "yr"),
            },
            result=te_eff_eol_r, result_unit="",
            assumptions=["SiGe RTG thermoelectric degradation ~0.6%/yr (NASA MMRTG flight data)"],
        ),
        worked_calc(
            label="Electrical power at beginning-of-life",
            formula="P0_electrical = P0_thermal_net x te_eff",
            values={
                "P0_thermal_net": (P0_thermal_net_r, "W"),
                "te_eff": (te_eff, ""),
            },
            result=P0_electrical_r, result_unit="W",
            assumptions=[],
        ),
        worked_calc(
            label="Electrical power at end-of-life",
            formula="P_eol_electrical = P_eol_thermal x te_eff_eol",
            values={
                "P_eol_thermal": (P_eol_thermal_r, "W"),
                "te_eff_eol": (te_eff_eol_r, ""),
            },
            result=P_eol_electrical_r, result_unit="W",
            assumptions=["P_eol_thermal from exponential decay law (exp term not shown — transcendental)"],
        ),
        worked_calc(
            label="Fuel volume",
            formula="fuel_vol_cm3 = fuel_g / fuel_density",
            values={
                "fuel_g": (fuel_g, "g"),
                "fuel_density": (data["fuel_form_density_g_cm3"], "g/cm3"),
            },
            result=fuel_vol_r, result_unit="cm3",
            assumptions=[f"{iso} fuel-form density {data['fuel_form_density_g_cm3']} g/cm3 (PuO2 / AmO2 / SrTiO3 / Po-metal / CmO2 per isotope)"],
        ),
    ]

    out: dict = {
        "isotope": iso,
        "fuel_mass_g": fuel_g,
        "mission_duration_years": mission_yr,
        "te_conversion_efficiency_bol": te_eff,
        "te_conversion_efficiency_eol": round(te_eff_eol, 4),
        "encapsulation_loss_pct": encap_loss_pct,
        "thermal_power_w_initial": round(P0_thermal_net, 1),
        "thermal_power_w_eol": round(P_eol_thermal, 1),
        "electrical_power_w_initial": round(P0_electrical, 2),
        "electrical_power_w_eol": round(P_eol_electrical, 2),
        "decay_heat_per_kg": round(data["specific_power_w_per_g"] * 1000, 1),
        "half_life_years": T_half,
        "decay_constant_per_yr": round(lam, 5),
        "fuel_form_density_g_cm3": data["fuel_form_density_g_cm3"],
        "fuel_volume_cm3": round(fuel_vol_cm3, 2),
        "shielding_required_g_per_cm2_pb": data["shielding_g_per_cm2_pb"],
        "primary_decay_mode": data["primary_decay"],
        "alpha_q_mev": data["q_mev"],
        "power_fade_pct_over_mission": round((1 - P_eol_thermal / P0_thermal_net) * 100, 2),
        "worked": worked,
    }
    return out


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2

    try:
        result = compute(payload)
    except Exception as exc:
        import traceback
        json.dump({
            "error": f"compute failed: {type(exc).__name__}: {exc}",
            "trace": traceback.format_exc().splitlines()[-3:],
        }, sys.stdout)
        return 3

    result["_provenance"] = PROVENANCE
    result["_meta"] = {"wall_time_s": round(time.time() - t0, 3)}
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
