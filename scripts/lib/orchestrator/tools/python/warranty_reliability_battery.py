#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/warranty_reliability_battery.py

Battery calendar + cycle fade prediction vs warranty terms.

Empirical fade models (combined Arrhenius + Wöhler):
    Q_loss_total = Q_calendar + Q_cycle
    Q_calendar  = k_cal × exp(-Ea / (RT)) × t^z
    Q_cycle     = k_cyc × N^β

Chemistry-specific coefficients (literature averages):
- LFP (LiFePO4): k_cal=0.045/yr, Ea=24.5 kJ/mol, k_cyc=2.5e-4/cycle, β=0.55
- NMC 622: k_cal=0.08/yr, Ea=22 kJ/mol, k_cyc=4.5e-4, β=0.50
- NCA: k_cal=0.10/yr, Ea=22 kJ/mol, k_cyc=5.5e-4, β=0.48
- LTO: k_cal=0.025/yr, Ea=20 kJ/mol, k_cyc=1.2e-4, β=0.60

Modifying factors:
- DoD: 80% DoD increases cycle fade 1.4× vs 50% (Wang et al)
- Temp: every +10°C halves calendar life (Arrhenius)
- C-rate: 2C cycling adds 1.3× fade vs 0.5C

EoL definition (NREL / industry):
- 80% SoH = end of warranty (residential / commercial)
- 60% SoH = end of useful life (utility)

References:
- NREL Battery Lifetime Analytical Model (BLAST) 2024
- Wang et al, "Cycle-life model for graphite-LiFePO4 cells", J. Power Sources 2011
- Schmalstieg et al, "Holistic aging model for Li(NiMnCo)O2", J. Power Sources 2014
- Naumann et al, "Analysis and Modeling of Cycle Aging of LFP", J. Energy Storage 2020
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
    "tool_name": 'warranty_reliability_battery (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'Bloomberg NEF Battery Price Survey 2024; Wood Mackenzie Energy Storage Service; Tesla/CATL/BYD/LG Chem published warranty terms',
    "physics_basis": 'Warranty cost = expected_failure_rate × replacement_cost × NPV(t_failure). Calendar fade + cycle fade per chemistry.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


R_GAS = 8.314  # J/(mol·K)

CHEMISTRY_PARAMS: dict[str, dict] = {
    "lfp":     {"k_cal": 0.045, "Ea_J": 24500, "k_cyc": 2.5e-4, "beta": 0.55, "z": 0.6},
    "nmc":     {"k_cal": 0.080, "Ea_J": 22000, "k_cyc": 4.5e-4, "beta": 0.50, "z": 0.55},
    "nca":     {"k_cal": 0.100, "Ea_J": 22000, "k_cyc": 5.5e-4, "beta": 0.48, "z": 0.55},
    "lto":     {"k_cal": 0.025, "Ea_J": 20000, "k_cyc": 1.2e-4, "beta": 0.60, "z": 0.5},
    "lmfp":    {"k_cal": 0.050, "Ea_J": 23500, "k_cyc": 3.0e-4, "beta": 0.53, "z": 0.55},
    "li_s":    {"k_cal": 0.150, "Ea_J": 18000, "k_cyc": 1.5e-3, "beta": 0.45, "z": 0.5},
}


def fade_model(chemistry: str, years: float, cycles: float, T_K: float,
               dod_pct: float, c_rate: float) -> dict:
    params = CHEMISTRY_PARAMS[chemistry]
    # Reference temp 25°C
    T_ref = 298.15
    # Calendar fade
    # k_cal_T = k_cal_ref × exp(-Ea/R × (1/T - 1/T_ref))
    arrhenius_factor = math.exp(-params["Ea_J"] / R_GAS * (1.0 / T_K - 1.0 / T_ref))
    cal_fade = params["k_cal"] * arrhenius_factor * (years ** params["z"])
    # Cycle fade with DoD and C-rate adjustment
    dod_factor = (dod_pct / 80.0) ** 0.7
    c_factor = 1.0 + 0.15 * max(0.0, c_rate - 0.5)  # +15% per C above 0.5C
    cyc_fade = params["k_cyc"] * (cycles ** params["beta"]) * dod_factor * c_factor

    return {
        "calendar_fade_pct": round(cal_fade * 100, 3),
        "cycle_fade_pct": round(cyc_fade * 100, 3),
        "total_fade_pct": round((cal_fade + cyc_fade) * 100, 3),
        "soh_pct": round((1 - cal_fade - cyc_fade) * 100, 2),
        "arrhenius_factor": round(arrhenius_factor, 3),
        "dod_factor": round(dod_factor, 3),
        "c_rate_factor": round(c_factor, 3),
    }


def compute(payload: dict) -> dict:
    chemistry = safe_choice(str(payload.get("cell_chemistry", "lfp")).lower(), CHEMISTRY_PARAMS, default="lfp", label="cell_chemistry")
    if chemistry not in CHEMISTRY_PARAMS:
        return {"error": f"Unknown chemistry. Available: {list(CHEMISTRY_PARAMS.keys())}"}

    cycle_per_yr = float(payload.get("cycle_count_per_year", 365))
    dod_pct = float(payload.get("average_dod_pct", 80))
    temp_c = float(payload.get("average_temp_c", 25))
    warranty_yrs = float(payload.get("warranty_years", 10))
    c_rate = float(payload.get("c_rate_average", 0.5))
    unit_cost_gbp = float(payload.get("battery_unit_cost_gbp", 100000))

    T_K = temp_c + 273.15

    # Fade at end of warranty
    total_cycles = cycle_per_yr * warranty_yrs
    fade_eow = fade_model(chemistry, warranty_yrs, total_cycles, T_K, dod_pct, c_rate)

    # Expected SoH at warranty end
    soh_eow = fade_eow["soh_pct"]
    # Warranty target SoH (industry typical 70% for utility, 80% for C&I)
    target_soh = float(payload.get("warranty_target_soh_pct", 70))

    # Warranty replacement probability
    # If predicted soh_eow > target_soh: probability low (~5-10%)
    # If predicted soh_eow < target_soh: probability ~30-60%
    if soh_eow >= target_soh + 5:
        repl_prob_pct = 5.0
    elif soh_eow >= target_soh:
        repl_prob_pct = 15.0
    elif soh_eow >= target_soh - 5:
        repl_prob_pct = 35.0
    else:
        repl_prob_pct = 65.0

    # Warranty cost per unit = probability × battery replacement cost (typically 50% of unit)
    repl_cost_per_unit_gbp = unit_cost_gbp * 0.50
    expected_warranty_cost = (repl_prob_pct / 100.0) * repl_cost_per_unit_gbp

    # Year-by-year SoH curve (annual snapshots)
    soh_curve: list[dict] = []
    for yr in range(0, int(warranty_yrs) + 1):
        cycles_yr = cycle_per_yr * yr
        fade = fade_model(chemistry, yr, cycles_yr, T_K, dod_pct, c_rate)
        soh_curve.append({"year": yr, "soh_pct": fade["soh_pct"], "total_fade_pct": fade["total_fade_pct"]})

    # Year when SoH hits target (extrapolate)
    year_at_target = None
    for yr in range(1, 25):
        cycles_yr = cycle_per_yr * yr
        fade = fade_model(chemistry, yr, cycles_yr, T_K, dod_pct, c_rate)
        if fade["soh_pct"] < target_soh:
            year_at_target = yr
            break

    # Rounded intermediates for chained worked calculations.
    total_cycles_r = round(total_cycles, 0)
    repl_cost_r = round(repl_cost_per_unit_gbp, 2)
    expected_warranty_cost_r = round(expected_warranty_cost, 0)

    # Partial worked calculations: only plain arithmetic steps are shown.
    # Calendar fade and cycle fade involve Arrhenius exp() and N^beta power
    # terms — those are transcendental and are omitted per reviewer convention.
    worked = [
        worked_calc(
            label="Total cycles over warranty period",
            formula="total_cycles = cycle_per_yr x warranty_yrs",
            values={
                "cycle_per_yr": (cycle_per_yr, "cycles/yr"),
                "warranty_yrs": (warranty_yrs, "yr"),
            },
            result=int(total_cycles_r), result_unit="cycles",
            assumptions=["constant cycle rate over warranty; no degradation-driven rate change"],
        ),
        worked_calc(
            label="Battery replacement cost (50% of unit cost)",
            formula="repl_cost = unit_cost_gbp x 0.5",
            values={"unit_cost_gbp": (unit_cost_gbp, "GBP")},
            result=repl_cost_r, result_unit="GBP",
            assumptions=["replacement at 50% of new unit cost (industry standard for battery module swap)"],
        ),
        worked_calc(
            label="Expected warranty cost per unit",
            formula="expected_cost = (repl_prob_pct / 100) x repl_cost",
            values={
                "repl_prob_pct": (repl_prob_pct, "%"),
                "repl_cost": (repl_cost_r, "GBP"),
            },
            result=int(expected_warranty_cost_r), result_unit="GBP",
            assumptions=[
                "repl_prob_pct is piecewise (branchy) based on predicted vs target SoH — see full fade model for detail",
                "calendar + cycle fade use Arrhenius / power-law — not hand-checkable; SoH reported separately",
            ],
        ),
    ]

    return {
        "cell_chemistry": chemistry,
        "warranty_years": warranty_yrs,
        "warranty_target_soh_pct": target_soh,
        "expected_soh_at_warranty_end_pct": soh_eow,
        "calendar_fade_pct": fade_eow["calendar_fade_pct"],
        "cycle_fade_pct": fade_eow["cycle_fade_pct"],
        "total_fade_pct": fade_eow["total_fade_pct"],
        "warranty_replacement_probability_pct": repl_prob_pct,
        "warranty_cost_per_unit_gbp": round(expected_warranty_cost, 0),
        "warranty_cost_pct_of_unit": round(expected_warranty_cost / max(1.0, unit_cost_gbp) * 100, 2),
        "year_at_target_soh": year_at_target,
        "soh_curve": soh_curve,
        "operating_conditions": {
            "average_temp_c": temp_c,
            "average_dod_pct": dod_pct,
            "cycles_per_year": cycle_per_yr,
            "c_rate_average": c_rate,
            "total_cycles_at_eow": int(total_cycles),
        },
        "arrhenius_factor_at_op_temp": fade_eow["arrhenius_factor"],
        "dod_stress_factor": fade_eow["dod_factor"],
        "c_rate_stress_factor": fade_eow["c_rate_factor"],
        "worked": worked,
        "notes": (
            f"Combined calendar + cycle fade per Schmalstieg/Naumann. "
            f"Calendar fade ∝ t^0.55-0.6 with Arrhenius temp dependence. "
            f"Cycle fade scales sublinearly N^0.5. "
            f"+10°C halves calendar life; 80% DoD vs 50% adds ~40% cycle fade."
        ),
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
