#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/nutrient_solution_chemistry.py

Hydroponic nutrient solution chemistry (NPK + micronutrients) for vertical farming.

Hoagland-Arnon solution (1938, modified) is the reference baseline.
Crop-specific recipes adjust the NPK ratio and EC target.

Macronutrients (mg/L target):
- Lettuce (Hoagland 0.5x): N=105, P=15, K=235, Ca=80, Mg=24, S=32, EC~1.4
- Tomato (Sonneveld): N=189, P=39, K=311, Ca=160, Mg=48, S=64, EC~2.6
- Basil: N=140, P=30, K=200, Ca=120, Mg=30, S=40, EC~1.8
- Strawberry: N=150, P=25, K=225, Ca=130, Mg=35, S=45, EC~1.5

Source ions from stock A/B salts (split to avoid Ca-P-S precipitation):
- Tank A: Ca(NO3)2·4H2O, KNO3, NH4NO3, Fe-EDTA
- Tank B: KH2PO4, K2SO4, MgSO4·7H2O, micronutrients (B, Mn, Zn, Cu, Mo)

EC range:
- Seedling: 0.8-1.2
- Vegetative: 1.5-2.5
- Fruiting/heading: 2.0-3.5

pH:
- Lettuce/leafy: 5.8-6.2
- Tomato/fruit: 5.6-6.0
- Strawberry: 5.5-6.0

References:
- Hoagland & Arnon, "The water-culture method for growing plants without soil",
  Circular 347, Cal Agricultural Experiment Station 1950 (rev. 1938)
- Sonneveld & Voogt, "Plant nutrition of greenhouse crops", Springer 2009
- Resh, "Hydroponic food production", CRC Press 7th ed. 2013
- Cornell CEA Center recipes 2018-2024
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'nutrient_solution_chemistry (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Hoagland, Arnon (1950), 'The water-culture method for growing plants without soil', California Agricultural Experiment Station Circular 347; Sonneveld, Voogt (2009), 'Plant Nutrition of Greenhouse Crops', Springer",
    "physics_basis": 'Nutrient solution mass-balance per Hoagland/Sonneveld species recipes. Salt-mass dosing from target ppm × volume.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Target macro nutrient concentrations (mg/L) per crop
CROP_RECIPES: dict[str, dict] = {
    "lettuce": {
        "N": 105, "P": 15, "K": 235, "Ca": 80, "Mg": 24, "S": 32,
        "Fe": 2.5, "Mn": 0.5, "Zn": 0.05, "B": 0.5, "Cu": 0.02, "Mo": 0.05,
        "target_ec_ms_cm": 1.4, "target_ph": 6.0,
    },
    "tomato": {
        "N": 189, "P": 39, "K": 311, "Ca": 160, "Mg": 48, "S": 64,
        "Fe": 3.5, "Mn": 0.7, "Zn": 0.10, "B": 0.7, "Cu": 0.05, "Mo": 0.05,
        "target_ec_ms_cm": 2.6, "target_ph": 5.8,
    },
    "basil": {
        "N": 140, "P": 30, "K": 200, "Ca": 120, "Mg": 30, "S": 40,
        "Fe": 3.0, "Mn": 0.6, "Zn": 0.08, "B": 0.6, "Cu": 0.03, "Mo": 0.05,
        "target_ec_ms_cm": 1.8, "target_ph": 6.0,
    },
    "strawberry": {
        "N": 150, "P": 25, "K": 225, "Ca": 130, "Mg": 35, "S": 45,
        "Fe": 3.0, "Mn": 0.6, "Zn": 0.08, "B": 0.6, "Cu": 0.03, "Mo": 0.05,
        "target_ec_ms_cm": 1.5, "target_ph": 5.8,
    },
    "cucumber": {
        "N": 175, "P": 35, "K": 280, "Ca": 150, "Mg": 40, "S": 55,
        "Fe": 3.2, "Mn": 0.6, "Zn": 0.10, "B": 0.6, "Cu": 0.04, "Mo": 0.05,
        "target_ec_ms_cm": 2.3, "target_ph": 5.8,
    },
    "pepper": {
        "N": 175, "P": 35, "K": 280, "Ca": 150, "Mg": 40, "S": 55,
        "Fe": 3.2, "Mn": 0.6, "Zn": 0.10, "B": 0.6, "Cu": 0.04, "Mo": 0.05,
        "target_ec_ms_cm": 2.2, "target_ph": 5.8,
    },
}

# Salt molar masses + nutrient fractions (g/mol; fraction of total mass per nutrient)
SALTS: dict[str, dict] = {
    "Ca(NO3)2_4H2O": {"mw": 236.15, "N_frac": 14.0 / 236.15 * 2,  # 2 NO3 groups, ~ 11.86% N
                       "Ca_frac": 40.08 / 236.15},
    "KNO3":           {"mw": 101.10, "N_frac": 14.0 / 101.10, "K_frac": 39.10 / 101.10},
    "NH4NO3":         {"mw": 80.04, "N_frac": 28.0 / 80.04},
    "KH2PO4":         {"mw": 136.09, "P_frac": 30.97 / 136.09, "K_frac": 39.10 / 136.09},
    "K2SO4":          {"mw": 174.26, "K_frac": (39.10 * 2) / 174.26, "S_frac": 32.07 / 174.26},
    "MgSO4_7H2O":     {"mw": 246.47, "Mg_frac": 24.31 / 246.47, "S_frac": 32.07 / 246.47},
    "Fe_EDTA":        {"mw": 367.05, "Fe_frac": 0.13},
    "Mn_EDTA":        {"mw": 366.20, "Mn_frac": 0.13},
    "ZnSO4_7H2O":     {"mw": 287.55, "Zn_frac": 65.39 / 287.55},
    "CuSO4_5H2O":     {"mw": 249.69, "Cu_frac": 63.55 / 249.69},
    "Na2B4O7_10H2O":  {"mw": 381.37, "B_frac": (10.81 * 4) / 381.37 * 0.5},
    "Na2MoO4_2H2O":   {"mw": 241.95, "Mo_frac": 95.95 / 241.95},
}


def compute(payload: dict) -> dict:
    crop = safe_choice(str(payload.get("target_crop", "lettuce")).lower(), CROP_RECIPES, default="lettuce", label="target_crop")
    water_tds = float(payload.get("water_source_ppm_dissolved", 100))
    target_ec = float(payload.get("target_ec_ms_cm", 0))
    target_ph = float(payload.get("target_ph", 0))
    res_volume_l = float(payload.get("reservoir_volume_l", 1000))

    if crop not in CROP_RECIPES:
        return {"error": f"Unknown crop '{crop}'. Available: {list(CROP_RECIPES.keys())}"}

    recipe = CROP_RECIPES[crop]
    if target_ec == 0:
        target_ec = recipe["target_ec_ms_cm"]
    if target_ph == 0:
        target_ph = recipe["target_ph"]

    # Compute salt quantities for stock solution (mg/L target -> kg/m³)
    nutrient_mix_g_per_l: dict[str, float] = {}
    salts_needed: dict[str, float] = {}

    # Strategy: solve for each macro
    # 1) Provide all Ca via Ca(NO3)2 -> provides N too
    Ca_target = recipe["Ca"]
    salts_needed["Ca(NO3)2_4H2O"] = Ca_target / SALTS["Ca(NO3)2_4H2O"]["Ca_frac"]  # mg/L
    N_from_calnit = salts_needed["Ca(NO3)2_4H2O"] * SALTS["Ca(NO3)2_4H2O"]["N_frac"]

    # 2) Top up N with KNO3 (also adds K)
    N_remaining = max(0, recipe["N"] - N_from_calnit)
    salts_needed["KNO3"] = N_remaining / SALTS["KNO3"]["N_frac"]
    K_from_kno3 = salts_needed["KNO3"] * SALTS["KNO3"]["K_frac"]

    # 3) Provide all P via KH2PO4
    P_target = recipe["P"]
    salts_needed["KH2PO4"] = P_target / SALTS["KH2PO4"]["P_frac"]
    K_from_kh2po4 = salts_needed["KH2PO4"] * SALTS["KH2PO4"]["K_frac"]

    # 4) Top up K with K2SO4
    K_remaining = max(0, recipe["K"] - K_from_kno3 - K_from_kh2po4)
    salts_needed["K2SO4"] = K_remaining / SALTS["K2SO4"]["K_frac"]
    S_from_k2so4 = salts_needed["K2SO4"] * SALTS["K2SO4"]["S_frac"]

    # 5) Mg via MgSO4
    Mg_target = recipe["Mg"]
    salts_needed["MgSO4_7H2O"] = Mg_target / SALTS["MgSO4_7H2O"]["Mg_frac"]
    S_from_mgso4 = salts_needed["MgSO4_7H2O"] * SALTS["MgSO4_7H2O"]["S_frac"]

    # 6) Micronutrients
    salts_needed["Fe_EDTA"] = recipe["Fe"] / SALTS["Fe_EDTA"]["Fe_frac"]
    salts_needed["Mn_EDTA"] = recipe["Mn"] / SALTS["Mn_EDTA"]["Mn_frac"]
    salts_needed["ZnSO4_7H2O"] = recipe["Zn"] / SALTS["ZnSO4_7H2O"]["Zn_frac"]
    salts_needed["CuSO4_5H2O"] = recipe["Cu"] / SALTS["CuSO4_5H2O"]["Cu_frac"]
    salts_needed["Na2B4O7_10H2O"] = recipe["B"] / SALTS["Na2B4O7_10H2O"]["B_frac"]
    salts_needed["Na2MoO4_2H2O"] = recipe["Mo"] / SALTS["Na2MoO4_2H2O"]["Mo_frac"]

    # Convert all to g/L
    nutrient_mix_g_per_l = {k: round(v / 1000.0, 4) for k, v in salts_needed.items()}

    # Dosing rates (assume 100x concentrated stock, dose 10ml stock per L solution)
    # 100x stock = 100× concentrate; dose rate target 10 ml per 1000 L irrigation
    stock_concentration_factor = 100
    dose_rate_ml_per_l_solution = 10.0
    # Replenish frequency: when EC drops > 0.3 mS/cm (typical)
    replenish_days = 5  # default 5 days

    # pH correction agents
    ph_correction_acid = "Phosphoric H3PO4 (10%)" if target_ph > 5.8 else "Nitric HNO3 (10%)"
    ph_correction_base = "Potassium hydroxide KOH (10%)"

    # Total mineral mass for reservoir
    total_mineral_g = sum(salts_needed.values()) * res_volume_l / 1000.0  # convert mg/L to g

    # Worked calculations for the PDF appendix — built from the SAME live values
    # above (drift-safe). Two representative macro-salt dosings are shown (each
    # salt mass = target ppm / nutrient mass-fraction). SKIPPED:
    # total_mineral_mass (a variable-length sum over all 12 salts, not a
    # fixed-input arithmetic expression).
    ca_frac = SALTS["Ca(NO3)2_4H2O"]["Ca_frac"]
    p_frac = SALTS["KH2PO4"]["P_frac"]
    worked = [
        worked_calc(
            label="Calcium nitrate dosing (provides Ca)",
            formula="salt_mass = Ca_target / Ca_fraction",
            values={"Ca_target": (recipe["Ca"], "mg/L"), "Ca_fraction": (round(ca_frac, 4), "")},
            result=round(salts_needed["Ca(NO3)2_4H2O"], 2), result_unit="mg/L",
            assumptions=[f"Ca mass-fraction of Ca(NO3)2.4H2O = {round(ca_frac, 4)} (40.08 / 236.15 g/mol)"],
        ),
        worked_calc(
            label="Monopotassium phosphate dosing (provides P)",
            formula="salt_mass = P_target / P_fraction",
            values={"P_target": (recipe["P"], "mg/L"), "P_fraction": (round(p_frac, 4), "")},
            result=round(salts_needed["KH2PO4"], 2), result_unit="mg/L",
            assumptions=[f"P mass-fraction of KH2PO4 = {round(p_frac, 4)} (30.97 / 136.09 g/mol)"],
        ),
        worked_calc(
            label="Stock dosing rate",
            formula="dosing_rate = (reservoir_volume x dose_rate) / 60",
            values={"reservoir_volume": (res_volume_l, "L"),
                    "dose_rate": (dose_rate_ml_per_l_solution, "mL/L")},
            result=round(res_volume_l * dose_rate_ml_per_l_solution / 60.0, 2), result_unit="mL/min",
            assumptions=["100x concentrated stock dosed over the reservoir fill"],
        ),
    ]

    return {
        "target_crop": crop,
        "target_ec_ms_cm": target_ec,
        "target_ph": target_ph,
        "water_source_ppm_dissolved": water_tds,
        "reservoir_volume_l": res_volume_l,
        "nutrient_concentrations_mg_l": {
            "N": recipe["N"], "P": recipe["P"], "K": recipe["K"],
            "Ca": recipe["Ca"], "Mg": recipe["Mg"], "S": recipe["S"],
            "Fe": recipe["Fe"], "Mn": recipe["Mn"], "Zn": recipe["Zn"],
            "B": recipe["B"], "Cu": recipe["Cu"], "Mo": recipe["Mo"],
        },
        "salts_required_mg_per_l": {k: round(v, 2) for k, v in salts_needed.items()},
        "nutrient_mix_g_per_l": nutrient_mix_g_per_l,
        "tank_a_salts": ["Ca(NO3)2_4H2O", "KNO3", "Fe_EDTA"],
        "tank_b_salts": ["KH2PO4", "K2SO4", "MgSO4_7H2O",
                         "ZnSO4_7H2O", "CuSO4_5H2O", "Na2B4O7_10H2O",
                         "Na2MoO4_2H2O", "Mn_EDTA"],
        "stock_concentration_factor": stock_concentration_factor,
        "dosing_rate_ml_per_l_solution": dose_rate_ml_per_l_solution,
        "dosing_rates_ml_per_min": round(res_volume_l * dose_rate_ml_per_l_solution / 60.0, 2),
        "reservoir_replenish_frequency_days": replenish_days,
        "total_mineral_mass_g_per_reservoir": round(total_mineral_g, 2),
        "ph_correction_acid": ph_correction_acid,
        "ph_correction_base": ph_correction_base,
        "split_tank_required": True,  # Always - Ca and P precipitate if mixed concentrated
        "notes": (
            "Recipe per Hoagland (1938) modified / Sonneveld (2009). "
            "Always use SPLIT tank A/B to prevent Ca-PO4-SO4 precipitation. "
            "EC drops 0.3-0.5 mS/cm/day in active crop; replenish on EC sag. "
            "Verify with hand-held EC/pH meter 2x daily; calibrate weekly."
        ),
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
