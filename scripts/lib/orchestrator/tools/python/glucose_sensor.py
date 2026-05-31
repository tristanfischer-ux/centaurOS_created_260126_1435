#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/glucose_sensor.py

Electrochemical glucose biosensor (CGM electrode) response model. Reads
JSON from stdin, writes JSON to stdout.

Input:
    {
      "glucose_mg_dl": 100.0,            # mg/dL (clinical units)
      "enzyme_type": "GOx",              # "GOx" | "GDH-FAD" | "GDH-NAD"
      "bias_voltage_mv": 600.0,          # working electrode bias vs ref
      "electrode_area_mm2": 5.0,         # active area
      "temperature_c": 32.0,             # subcutaneous typical
      "operating_days": 10                # for drift estimate
    }

Output:
    {
      "current_density_nA_per_mM": 12.5,
      "current_total_nA": 35.0,
      "response_time_s": 12.0,
      "drift_pct_per_day": 0.5,
      "drift_at_day_n_pct": 5.0,
      "saturation_glucose_mM": 30.0,
      ...
    }

Physics: amperometric glucose sensor using Michaelis-Menten kinetics.
GOx (glucose oxidase) catalyses: glucose + O2 → gluconolactone + H2O2.
H2O2 oxidised at +600 mV (vs Ag/AgCl) generating 2e- per glucose
molecule. Current i = nFA × k_cat × [E]_total × [glucose] / (Km + [glucose])

References:
- Heller & Feldman, Chem Rev 2008 — "Electrochemical glucose sensors"
- Wang, Chem Rev 2008 — "Electrochemical glucose biosensors"
- Yoo & Lee, Sensors 2010 — Km(GOx) = 25-33 mM; Km(GDH-FAD) = 8-12 mM
- Cengiz & Tamborlane, Diab Tech 2009 — drift ~0.5-1% per day for GOx CGM
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'glucose_sensor (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Heller, Feldman (2008), 'Electrochemical Glucose Sensors and Their Applications in Diabetes Management', Chem. Rev. 108(7):2482-2505; Wang (2008), 'Electrochemical Glucose Biosensors', Chem. Rev. 108(2):814-825",
    "tool_doi": '10.1021/cr068073+',
    "physics_basis": 'Michaelis-Menten enzyme kinetics i = (n × F × A × k_cat × [GOx] × [S]) / (K_M + [S]). Outer-membrane diffusion limitation reduces effective loading.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Faraday constant (C/mol)
F = 96485.33

# Enzyme parameters — Michaelis constant (mM), turnover rate (s^-1),
# typical electrode loading (mol/cm²), and drift rate per day.
# Sources: Heller 2008, Yoo 2010, Cengiz 2009.
ENZYME_PARAMS = {
    "GOx": {
        # Glucose oxidase (most common in commercial CGM — Dexcom, Abbott)
        # Commercial CGM sensors achieve ~5-30 nA at 100 mg/dL on 0.05 cm²
        # active electrode. Sensitivity ~1-3 nA/mM (Heller 2008,
        # Cengiz 2009, Dexcom G6 datasheet). Effective enzyme loading is
        # diffusion-limited by outer polymer (Nafion/PEG) layers, so the
        # *apparent* turnover per cm² is far below solution-phase.
        "km_mM": 30.0,            # Michaelis constant, mM (apparent for immobilised)
        "kcat_s": 100.0,          # turnover number for immobilised enzyme, s^-1
        "loading_pmol_cm2": 0.05, # outer-membrane-limited effective active loading
        "n_electrons": 2,         # H2O2 -> 2H+ + O2 + 2e-
        "drift_pct_per_day": 0.7,
        "response_time_s_base": 12.0,
        "optimal_bias_mv": 600.0,
    },
    "GDH-FAD": {
        # Glucose dehydrogenase, FAD-dependent (oxygen-independent, used
        # in some next-gen CGMs and most BGM strips)
        "km_mM": 10.0,
        "kcat_s": 85.0,
        "loading_pmol_cm2": 0.05,
        "n_electrons": 2,
        "drift_pct_per_day": 0.5,
        "response_time_s_base": 8.0,
        "optimal_bias_mv": 250.0,  # mediator-driven, lower required
    },
    "GDH-NAD": {
        # Glucose dehydrogenase, NAD-dependent (rare in CGM, more in
        # research) — bias needs to be high to oxidise NADH
        "km_mM": 12.0,
        "kcat_s": 35.0,
        "loading_pmol_cm2": 0.04,
        "n_electrons": 2,
        "drift_pct_per_day": 0.9,
        "response_time_s_base": 15.0,
        "optimal_bias_mv": 700.0,
    },
}


def mg_dl_to_mM(mg_dl: float) -> float:
    """Glucose: 180.156 g/mol. mg/dL × 10 / 180.156 = mM."""
    return mg_dl * 10.0 / 180.156


def compute(payload: dict) -> dict:
    glucose_mg_dl = float(payload.get("glucose_mg_dl", 100.0))
    enzyme = str(payload.get("enzyme_type", "GOx"))
    bias_mv = float(payload.get("bias_voltage_mv", 600.0))
    electrode_area_mm2 = float(payload.get("electrode_area_mm2", 5.0))
    temp_c = float(payload.get("temperature_c", 32.0))  # subcutaneous
    operating_days = float(payload.get("operating_days", 10.0))

    if enzyme not in ENZYME_PARAMS:
        enzyme = "GOx"
    params = ENZYME_PARAMS[enzyme]

    # Convert glucose to mM
    glucose_mM = mg_dl_to_mM(glucose_mg_dl)

    # Convert electrode area to cm² (1 mm² = 0.01 cm²)
    area_cm2 = electrode_area_mm2 * 0.01

    # Total enzyme moles on electrode (loading × area)
    enzyme_mol = params["loading_pmol_cm2"] * 1e-12 * area_cm2

    # Bias factor: optimal bias = 1.0; bias too low loses electrons
    # (insufficient driving force); bias too high adds background noise.
    # Empirical: linear ramp from 100 mV below optimal to optimal, then flat.
    bias_factor = max(0.3, min(1.0,
        (bias_mv - (params["optimal_bias_mv"] - 200.0)) / 200.0))

    # Temperature factor: enzyme activity follows Arrhenius. Q10 ≈ 2 for
    # enzymes near body temp (32-37°C range). Reference: 37°C.
    temp_factor = 2.0 ** ((temp_c - 37.0) / 10.0)

    # Michaelis-Menten rate (mol/s per electrode)
    # v = k_cat × [E] × [S] / (Km + [S])
    # Glucose concentration in mol/L → cm² electrode sees bulk concentration
    rate_mol_per_s = (
        params["kcat_s"] * enzyme_mol *
        (glucose_mM / (params["km_mM"] + glucose_mM)) *
        bias_factor * temp_factor
    )

    # Current = n × F × rate  (Coulombs/s = Amperes)
    n_electrons = params["n_electrons"]
    current_a = n_electrons * F * rate_mol_per_s
    current_nA = current_a * 1e9

    # Current density: nA / mM (sensor sensitivity figure of merit)
    # Linear region (low glucose): i ≈ (n F kcat [E] / Km) × [S]
    sensitivity_linear_a_per_M = (n_electrons * F * params["kcat_s"] *
                                   enzyme_mol / (params["km_mM"] * 1e-3) *
                                   bias_factor * temp_factor)
    # Convert A/M to nA/mM: nA/mM = A/M × 1e9 × 1e-3 = A/M × 1e6
    current_density_nA_per_mM = sensitivity_linear_a_per_M * 1e6

    # Response time (90% step-response). Enzyme kinetics + diffusion-limited.
    # Base from datasheet; scales weakly with electrode area (sqrt).
    response_time_s = params["response_time_s_base"] * math.sqrt(
        max(0.5, electrode_area_mm2 / 5.0))

    # Drift: % per day from baseline. Reflects enzyme degradation +
    # biofouling. Linear approximation over the 14-day CGM lifespan.
    drift_pct_per_day = params["drift_pct_per_day"]
    drift_at_day_n_pct = drift_pct_per_day * operating_days

    # Saturation: above 5×Km, sensor goes non-linear (Michaelis-Menten plateau)
    saturation_glucose_mM = params["km_mM"] * 5.0
    saturation_glucose_mg_dl = saturation_glucose_mM * 180.156 / 10.0

    # Linear range in clinical units (within 10% of linearity)
    linear_range_max_mg_dl = params["km_mM"] * 0.5 * 180.156 / 10.0

    return {
        "glucose_mg_dl_input": glucose_mg_dl,
        "glucose_mM": round(glucose_mM, 3),
        "enzyme_type": enzyme,
        "bias_voltage_mv": bias_mv,
        "current_total_nA": round(current_nA, 3),
        "current_density_nA_per_mM": round(current_density_nA_per_mM, 3),
        "response_time_s": round(response_time_s, 2),
        "drift_pct_per_day": drift_pct_per_day,
        "drift_at_day_n_pct": round(drift_at_day_n_pct, 2),
        "operating_days_assessed": operating_days,
        "saturation_glucose_mM": round(saturation_glucose_mM, 1),
        "saturation_glucose_mg_dl": round(saturation_glucose_mg_dl, 1),
        "linear_range_max_mg_dl": round(linear_range_max_mg_dl, 1),
        "bias_optimality_factor": round(bias_factor, 3),
        "temperature_factor": round(temp_factor, 3),
        "km_mM": params["km_mM"],
        "electrode_area_mm2": electrode_area_mm2,
        "_meta": {
            "model": "Michaelis-Menten amperometric biosensor",
            "references": [
                "Heller & Feldman, Chem Rev 2008",
                "Wang, Chem Rev 2008",
                "Cengiz & Tamborlane, Diab Tech 2009",
            ],
        },
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
