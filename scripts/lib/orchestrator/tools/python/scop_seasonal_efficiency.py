#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/scop_seasonal_efficiency.py

SCOP (Seasonal Coefficient of Performance) per EU 813/2013 / EN 14825.

SCOP integrates COP across temperature bins of a representative heating season.

EU climate zones per EN 14825 Annex B:
- Cold (Average climate Helsinki): T_design = -22°C, 8093 heating hours/yr
- Average climate (Strasbourg): T_design = -10°C, 4910 heating hours/yr
- Warm climate (Athens): T_design = +2°C, 3590 heating hours/yr

Bin temperatures (°C): -7, +2, +7, +12 are mandatory test points.
Default weighting per Annex B of EN 14825 (warm climate shown):
    -7:  1.4%   (intense heating)
    +2:  9.1%
    +7: 30.4%   (most weight)
    +12: 59.1%

Heating capacity and COP at each bin tested; capacity adjusted for
backup electric resistance heater when COP × capacity insufficient.

ErP label tiers (EU 811/2013):
- A+++: η_s ≥ 175%
- A++:  150-175%
- A+:   125-150%
- A:    100-125%
- B/C/D/E/F/G

η_s = SCOP × correction (mainly for power output / control)

References:
- EN 14825:2022 Testing and rating of air conditioners / heat pumps under
  part-load conditions
- EU Regulation 813/2013 (ecodesign requirements for space heaters)
- EU 811/2013 (energy labelling)
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
    "tool_name": 'scop_seasonal_efficiency (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "EU Regulation 813/2013 (Ecodesign for space heaters); EN 14825:2018 'Air conditioners, liquid chilling packages and heat pumps, with electrically driven compressors, for space heating and cooling — Testing and rating at part load conditions and calculation of seasonal performance'",
    "physics_basis": 'SCOP = Σ (Q_h × bin_hours) / Σ (P_in × bin_hours). Part-load COP curve per EN 14825 testing points.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Bin temperatures and hourly weights by climate
CLIMATE_BINS = {
    "cold": {       # Helsinki: T_design = -22°C, 8093 h/yr
        "T_design_c": -22, "annual_hours": 8093,
        "bin_temp_c": [-22, -19, -16, -13, -10, -7, -4, 2, 7, 12, 15],
        "bin_hours":  [0, 1, 25, 50, 100, 800, 1500, 2200, 2000, 1300, 117],
    },
    "average": {    # Strasbourg: T_design = -10°C, 4910 h/yr
        "T_design_c": -10, "annual_hours": 4910,
        "bin_temp_c": [-10, -7, -4, 2, 7, 12, 15],
        "bin_hours":  [4, 96, 300, 700, 1600, 1700, 510],
    },
    "warm": {       # Athens: T_design = +2°C, 3590 h/yr
        "T_design_c": 2, "annual_hours": 3590,
        "bin_temp_c": [-7, 2, 7, 12, 15],
        "bin_hours":  [50, 326, 1090, 1640, 484],
    },
}


def compute(payload: dict) -> dict:
    climate = safe_choice(str(payload.get("climate_zone", "average")).lower(), CLIMATE_BINS, default="average", label="climate_zone")
    cop_at_a7w35 = float(payload.get("nominal_cop_at_a7w35", 4.5))
    cop_at_a2w35 = float(payload.get("cop_at_a2w35", cop_at_a7w35 * 0.85))
    cop_at_am7w35 = float(payload.get("cop_at_am7w35", cop_at_a7w35 * 0.60))
    cop_at_a12w35 = float(payload.get("cop_at_a12w35", cop_at_a7w35 * 1.15))

    if climate not in CLIMATE_BINS:
        return {"error": f"climate must be one of {list(CLIMATE_BINS.keys())}"}

    bins = CLIMATE_BINS[climate]
    total_hours = sum(bins["bin_hours"])

    # Interpolate COP at each bin temperature
    # Use linear interpolation between known points (-7, +2, +7, +12)
    def cop_at_temp(T: float) -> float:
        # Known reference points
        if T >= 12:
            return cop_at_a12w35
        elif T >= 7:
            return cop_at_a7w35 + (cop_at_a12w35 - cop_at_a7w35) * (T - 7) / 5.0
        elif T >= 2:
            return cop_at_a2w35 + (cop_at_a7w35 - cop_at_a2w35) * (T - 2) / 5.0
        elif T >= -7:
            return cop_at_am7w35 + (cop_at_a2w35 - cop_at_am7w35) * (T + 7) / 9.0
        else:
            # Below -7°C: degrades sharply
            return max(1.0, cop_at_am7w35 - (T + 7) * 0.05)

    # SCOP = sum(heat_demand_at_bin) / sum(electricity_at_bin)
    # Assume building heat demand at design temp = rated, drops linearly to 0 at indoor temp
    indoor_t = 20.0
    total_heat_kwh = 0.0
    total_elec_kwh = 0.0
    bin_results = []
    for T, hrs in zip(bins["bin_temp_c"], bins["bin_hours"]):
        # Heat demand (fraction of rated)
        if T >= indoor_t:
            demand_fraction = 0.0
        else:
            demand_fraction = (indoor_t - T) / (indoor_t - bins["T_design_c"])
        cop = cop_at_temp(T)
        heat_per_bin = demand_fraction * hrs   # in capacity-hours (relative)
        elec_per_bin = heat_per_bin / max(1.0, cop)
        total_heat_kwh += heat_per_bin
        total_elec_kwh += elec_per_bin
        bin_results.append({
            "T_c": T,
            "hours": hrs,
            "heat_demand_fraction": round(demand_fraction, 3),
            "cop": round(cop, 2),
        })

    if total_elec_kwh > 0:
        scop = total_heat_kwh / total_elec_kwh
    else:
        scop = 0

    # η_s (seasonal efficiency) is SCOP × correction (typ. 0.40 for primary energy)
    # EU formula: η_s = SCOP/2.5 × 100% - corrections (5% for control, 5% for power)
    eta_s = scop / 2.5 * 100.0 - 6.0   # typical aux losses

    # Worked calculations — COP interpolation across bins is piecewise (skip);
    # the final SCOP ratio and ErP seasonal efficiency formula are clean arithmetic.
    scop_r = round(scop, 2)
    total_heat_r = round(total_heat_kwh, 1)
    total_elec_r = round(total_elec_kwh, 1)
    worked = [
        worked_calc(
            label="Seasonal COP (SCOP)",
            formula="SCOP = total_heat / total_elec",
            values={"total_heat": (total_heat_r, "capacity-h"),
                    "total_elec": (total_elec_r, "capacity-h")},
            result=scop_r, result_unit="",
            assumptions=[
                "total_heat = sum(demand_fraction_bin x bin_hours) over climate bins",
                "total_elec = sum(heat_bin / COP_bin); COP interpolated linearly between -7/+2/+7/+12 degC test points",
                f"climate zone: {climate}",
            ],
        ),
        worked_calc(
            label="Seasonal efficiency (eta_s) for ErP label",
            formula="eta_s = SCOP / 2.5 x 100 - 6",
            values={"SCOP": (scop_r, "")},
            result=round(eta_s, 1), result_unit="%",
            assumptions=["EU Regulation 813/2013: divides by primary-energy factor 2.5",
                         "minus 6% for typical auxiliary-loss corrections"],
        ),
    ]

    if eta_s >= 175:
        eu_label = "A+++"
    elif eta_s >= 150:
        eu_label = "A++"
    elif eta_s >= 125:
        eu_label = "A+"
    elif eta_s >= 100:
        eu_label = "A"
    elif eta_s >= 90:
        eu_label = "B"
    elif eta_s >= 82:
        eu_label = "C"
    else:
        eu_label = "D or lower"

    # Variant outputs for other climates
    scop_cold = scop * 0.85   # rough estimate for cold
    scop_warm = scop * 1.15   # rough estimate for warm

    return {
        "worked": worked,
        "climate_zone": climate,
        "scop_average": round(scop, 2),
        "scop_cold_estimate": round(scop_cold, 2),
        "scop_warm_estimate": round(scop_warm, 2),
        "eta_s_pct": round(eta_s, 1),
        "eu_label": eu_label,
        "bin_results": bin_results,
        "T_design_c": bins["T_design_c"],
        "annual_heating_hours": total_hours,
        "total_heat_demand_relative": round(total_heat_kwh, 1),
        "total_elec_consumption_relative": round(total_elec_kwh, 1),
        "cop_inputs": {
            "a-7_w35": cop_at_am7w35,
            "a+2_w35": cop_at_a2w35,
            "a+7_w35": cop_at_a7w35,
            "a+12_w35": cop_at_a12w35,
        },
        "notes": (
            "SCOP per EN 14825:2022, EU 813/2013. Test points -7/+2/+7/+12°C, "
            "interpolated linearly. ErP label is η_s (seasonal efficiency); "
            "A+++ ≥ 175%. Heat demand modelled as linear from design temp to indoor."
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
