#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/clean_in_place_cip.py

CIP (Clean-In-Place) cycle sizing for bioreactor / process vessel.

Standard CIP cycle (5 steps):
1. Pre-rinse (cold water) - removes loose soil (5-10 min)
2. Alkaline wash (1-2% NaOH, 70-85°C) - protein/biofilm removal (15-30 min)
3. Intermediate rinse (water) - removes alkali (5-10 min)
4. Acid wash (0.5-1% HNO3 or phosphoric, 60-75°C) - mineral/scale removal (10-20 min)
5. Final rinse (purified water) - sanitisation (5-15 min)

Water consumption:
- Each rinse: 1-3 × vessel volume
- Total CIP: 5-10 × vessel volume

Chemical consumption:
- NaOH 50%: ~10-30 L per 1000L vessel (1-2% solution)
- HNO3 30%: ~5-15 L per 1000L vessel (0.5-1% solution)

Energy:
- Hot wash heating: m × c × ΔT (water 4.184 kJ/kg/K)
- 1000L raised to 85°C from 20°C = 272 MJ = 75 kWh per cycle
- Pump energy: 3-5 kWh per cycle (typical)

Verification:
- ATP swab: <10 RLU = clean
- TOC analysis: <500 ppb residual
- Endotoxin LAL: <0.25 EU/mL rinse
- Riboflavin coverage test (visual GMP)

References:
- ASME BPE 2022 (Bioprocessing Equipment)
- 3-A Sanitary Standards 13-12 (Cleaning of Process Equipment)
- Tamime (ed.), "Cleaning-in-Place: Dairy, Food and Beverage Operations",
  Blackwell 3rd ed. 2008
- ISPE Baseline Volume 6 (Biopharmaceutical Manufacturing) 2018
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'clean_in_place_cip (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "ASME BPE-2022 'Bioprocessing Equipment Standard'; ISPE Baseline Guide Vol 6: Biopharmaceutical Manufacturing Facilities (2018)",
    "physics_basis": '5-step CIP: pre-rinse, alkaline wash, intermediate rinse, acid wash, final rinse. Each step has flow rate × time × chemical cost.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Soil-specific cleaning durations (min)
SOIL_DURATIONS: dict[str, dict] = {
    "cell_debris": {
        "pre_rinse_min": 8,
        "alkaline_min": 25,
        "interim_rinse_min": 5,
        "acid_min": 15,
        "final_rinse_min": 10,
        "alkali_strength_pct": 1.5,
        "acid_strength_pct": 0.75,
        "temp_c": 75,
    },
    "protein_fouling": {
        "pre_rinse_min": 10,
        "alkaline_min": 30,
        "interim_rinse_min": 8,
        "acid_min": 15,
        "final_rinse_min": 12,
        "alkali_strength_pct": 2.0,
        "acid_strength_pct": 0.75,
        "temp_c": 80,
    },
    "biofilm": {
        "pre_rinse_min": 5,
        "alkaline_min": 45,            # extended for biofilm
        "interim_rinse_min": 10,
        "acid_min": 20,
        "final_rinse_min": 15,
        "alkali_strength_pct": 2.5,
        "acid_strength_pct": 1.0,
        "temp_c": 85,
    },
    "yeast_residue": {
        "pre_rinse_min": 5,
        "alkaline_min": 20,
        "interim_rinse_min": 5,
        "acid_min": 10,
        "final_rinse_min": 8,
        "alkali_strength_pct": 1.5,
        "acid_strength_pct": 0.5,
        "temp_c": 70,
    },
    "mineral_scale": {
        "pre_rinse_min": 5,
        "alkaline_min": 10,
        "interim_rinse_min": 5,
        "acid_min": 30,                # extended for mineral
        "final_rinse_min": 8,
        "alkali_strength_pct": 0.5,
        "acid_strength_pct": 1.5,
        "temp_c": 70,
    },
}


def compute(payload: dict) -> dict:
    volume_l = float(payload.get("vessel_volume_l", 1000))
    surface_area_m2 = float(payload.get("vessel_surface_area_m2", 25))
    soil = safe_choice(str(payload.get("soil_type", "cell_debris")).lower(), SOIL_DURATIONS, default="cell_debris", label="soil_type")
    cleaning_temp_c_user = payload.get("cleaning_temp_c")

    if soil not in SOIL_DURATIONS:
        return {"error": f"Unknown soil type. Available: {list(SOIL_DURATIONS.keys())}"}

    durations = SOIL_DURATIONS[soil]
    cleaning_temp = float(cleaning_temp_c_user) if cleaning_temp_c_user else durations["temp_c"]

    # Cycle time total
    cycle_time_min = (durations["pre_rinse_min"]
                       + durations["alkaline_min"]
                       + durations["interim_rinse_min"]
                       + durations["acid_min"]
                       + durations["final_rinse_min"])

    # Water consumption per rinse step (water bell-shaped per ASME BPE)
    # Each rinse uses ~1.5 × vessel volume
    rinse_volume_l = volume_l * 1.5
    total_water_l = (
        rinse_volume_l   # pre
        + volume_l * 2   # alkaline cycle (recirc, ~2 vols)
        + rinse_volume_l   # interim rinse
        + volume_l * 1.5   # acid cycle (recirc)
        + rinse_volume_l * 2   # final rinse (extra for sanitisation)
    )

    # Chemical consumption (concentrate)
    # NaOH 50% solution → dilute to alkali_strength_pct in alkaline cycle
    alkali_cycle_volume = volume_l * 2
    naoh_50_l = alkali_cycle_volume * (durations["alkali_strength_pct"] / 50.0)
    # HNO3 30% → acid_strength_pct
    acid_cycle_volume = volume_l * 1.5
    hno3_30_l = acid_cycle_volume * (durations["acid_strength_pct"] / 30.0)
    detergent_l = volume_l * 0.001    # 0.1% surfactant in alkali wash

    # Energy: heating water from ambient (20°C) to cleaning_temp
    delta_t = cleaning_temp - 20
    cycle_volume_to_heat_l = volume_l * 2  # alkali + acid wash both hot
    energy_kj = cycle_volume_to_heat_l * 4.184 * delta_t
    energy_kwh_heating = energy_kj / 3600.0
    energy_kwh_pumping = volume_l * 0.005   # ~5 Wh/L pumping
    total_energy_kwh = energy_kwh_heating + energy_kwh_pumping

    # Cost per cycle
    water_cost_gbp = total_water_l * 0.002       # £2/m³ water (city water)
    naoh_cost_gbp = naoh_50_l * 0.30             # £300/m³ NaOH 50%
    hno3_cost_gbp = hno3_30_l * 0.35
    energy_cost_gbp = total_energy_kwh * 0.15    # £0.15/kWh
    chemical_disposal_gbp = (naoh_50_l + hno3_30_l) * 0.50   # £500/m³ neutralisation
    total_cost_gbp = water_cost_gbp + naoh_cost_gbp + hno3_cost_gbp + energy_cost_gbp + chemical_disposal_gbp

    # Worked calculations — reviewer-verifiable arithmetic steps.
    # cycle_time_min is a sum of lookup-table values (not re-shown).
    delta_t_r           = round(delta_t, 1)
    energy_kj_r         = round(energy_kj, 1)
    energy_kwh_heat_r   = round(energy_kwh_heating, 2)
    energy_kwh_pump_r   = round(energy_kwh_pumping, 2)
    total_energy_r      = round(total_energy_kwh, 2)
    naoh_r              = round(naoh_50_l, 2)
    hno3_r              = round(hno3_30_l, 2)
    water_cost_r        = round(water_cost_gbp, 2)
    naoh_cost_r         = round(naoh_cost_gbp, 2)
    hno3_cost_r         = round(hno3_cost_gbp, 2)
    energy_cost_r       = round(energy_cost_gbp, 2)
    disposal_cost_r     = round(chemical_disposal_gbp, 2)
    total_cost_r        = round(total_cost_gbp, 2)

    worked = [
        worked_calc(
            label="Heating energy (alkaline + acid washes)",
            formula="energy_kj = cycle_volume_to_heat_l x 4.184 x delta_t",
            values={
                "cycle_volume_to_heat_l": (cycle_volume_to_heat_l, "L"),
                "delta_t":               (delta_t_r, "K"),
            },
            result=energy_kj_r, result_unit="kJ",
            assumptions=[
                "Specific heat of water = 4.184 kJ/(kg·K); density 1 kg/L.",
                "delta_t = cleaning_temp_c - 20 (ambient 20 °C).",
                "Two vessel-volumes heated (alkaline wash + acid wash).",
            ],
        ),
        worked_calc(
            label="Heating energy converted to kWh",
            formula="energy_kwh_heating = energy_kj / 3600",
            values={"energy_kj": (energy_kj_r, "kJ")},
            result=energy_kwh_heat_r, result_unit="kWh",
            assumptions=["1 kWh = 3600 kJ."],
        ),
        worked_calc(
            label="Pumping energy",
            formula="energy_kwh_pumping = vessel_volume_l x 0.005",
            values={"vessel_volume_l": (volume_l, "L")},
            result=energy_kwh_pump_r, result_unit="kWh",
            assumptions=["~5 Wh/L pumping energy (ASME BPE industry typical for CIP skids)."],
        ),
        worked_calc(
            label="NaOH 50% concentrate required",
            formula="naoh_50_l = alkali_cycle_volume x (alkali_strength_pct / 50)",
            values={
                "alkali_cycle_volume":   (alkali_cycle_volume, "L"),
                "alkali_strength_pct":   (durations["alkali_strength_pct"], "%"),
            },
            result=naoh_r, result_unit="L",
            assumptions=["Alkali cycle volume = 2 x vessel volume (recirculation loop per ASME BPE)."],
        ),
        worked_calc(
            label="HNO3 30% concentrate required",
            formula="hno3_30_l = acid_cycle_volume x (acid_strength_pct / 30)",
            values={
                "acid_cycle_volume": (acid_cycle_volume, "L"),
                "acid_strength_pct": (durations["acid_strength_pct"], "%"),
            },
            result=hno3_r, result_unit="L",
            assumptions=["Acid cycle volume = 1.5 x vessel volume (single-pass with recirculation per ASME BPE)."],
        ),
        worked_calc(
            label="Total cost per CIP cycle",
            formula="total_cost = water_cost + naoh_cost + hno3_cost + energy_cost + disposal_cost",
            values={
                "water_cost":    (water_cost_r,    "GBP"),
                "naoh_cost":     (naoh_cost_r,     "GBP"),
                "hno3_cost":     (hno3_cost_r,     "GBP"),
                "energy_cost":   (energy_cost_r,   "GBP"),
                "disposal_cost": (disposal_cost_r, "GBP"),
            },
            result=total_cost_r, result_unit="GBP",
            assumptions=[
                "Water £2/m3, NaOH 50% £300/m3, HNO3 30% £350/m3, electricity £0.15/kWh.",
                "Effluent neutralisation £500/m3 of chemical concentrate.",
            ],
        ),
    ]

    # Effluent treatment requirements
    effluent_volume = total_water_l
    effluent_ph = "Acidic (HNO3) → neutralise to pH 6-9 before discharge"
    effluent_cod_mg_l = 5000   # rough estimate per ASME BPE

    return {
        "vessel_volume_l": volume_l,
        "vessel_surface_area_m2": surface_area_m2,
        "soil_type": soil,
        "cleaning_temp_c": cleaning_temp,
        "cycle_time_min": cycle_time_min,
        "cycle_time_h": round(cycle_time_min / 60.0, 2),
        "step_durations_min": durations,
        "water_consumption_l": round(total_water_l, 0),
        "water_consumption_m3": round(total_water_l / 1000.0, 2),
        "naoh_50_l": round(naoh_50_l, 2),
        "hno3_30_l": round(hno3_30_l, 2),
        "detergent_l": round(detergent_l, 3),
        "energy_kwh_heating": round(energy_kwh_heating, 2),
        "energy_kwh_pumping": round(energy_kwh_pumping, 2),
        "energy_kwh_total": round(total_energy_kwh, 2),
        "cost_per_cycle_gbp": round(total_cost_gbp, 2),
        "cost_water_gbp": round(water_cost_gbp, 2),
        "cost_chemicals_gbp": round(naoh_cost_gbp + hno3_cost_gbp, 2),
        "cost_energy_gbp": round(energy_cost_gbp, 2),
        "cost_effluent_treatment_gbp": round(chemical_disposal_gbp, 2),
        "effluent_volume_l": round(effluent_volume, 0),
        "effluent_ph_handling": effluent_ph,
        "effluent_cod_mg_l_estimate": effluent_cod_mg_l,
        "verification_methods": [
            "ATP swab (target <10 RLU)",
            "TOC analysis on final rinse (target <500 ppb)",
            "Endotoxin LAL test (target <0.25 EU/mL)",
            "Riboflavin coverage test (visual)",
        ],
        "notes": (
            "Per ASME BPE 2022 + 3-A Sanitary Standards. 5-step cycle: "
            "pre-rinse → alkaline → interim rinse → acid → final rinse. "
            "Hot caustic removes proteins/cells; hot acid removes mineral scale. "
            "Effluent neutralisation mandatory before discharge."
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
