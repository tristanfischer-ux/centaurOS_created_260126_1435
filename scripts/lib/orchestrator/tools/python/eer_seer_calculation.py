#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/eer_seer_calculation.py

EER / SEER / SEER2 ratings per AHRI 210/240 (US).

EER (Energy Efficiency Ratio):
    EER = capacity_btuh / power_w   (BTU/h per W)
    Steady-state at 95°F outdoor / 80°F indoor (35°C / 26.7°C)

SEER (Seasonal Energy Efficiency Ratio):
    SEER = sum(capacity_part_load × hours_at_load) / sum(power × hours)
    Weighted across temperature bins per Table 6 AHRI 210/240

SEER2 (2023 update):
    Higher static pressure (0.50 inH2O for ducts vs 0.10 prev)
    SEER2 ≈ SEER × 0.95 for ducted, SEER2 = SEER for ductless mini-split

Energy Star tiers (2025+):
- Standard: SEER2 ≥ 13.4 / 14.3 (north/south)
- Most Efficient: SEER2 ≥ 16.1 / 17.0

References:
- AHRI Standard 210/240-2023 (Performance Rating of Unitary Air-Conditioning
  and Air-Source Heat Pump Equipment)
- DOE Test Procedure 10 CFR 430, Appendix M (Sept 2022 - SEER2)
- Energy Star Program Requirements Version 6.0 (effective 2023)
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'eer_seer_calculation (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "AHRI Standard 210/240-2023 'Performance Rating of Unitary Air-Conditioning & Air-Source Heat Pump Equipment'",
    "physics_basis": 'EER = capacity_BTUH / power_W at standard conditions. SEER = weighted-average EER across temperature bin distribution.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    rated_btuh = float(payload.get("rated_cooling_btuh", 36000))
    rated_w = float(payload.get("rated_power_w", 3200))
    part_load = payload.get("part_load_data", {})
    # Default part-load data per AHRI 210/240 Table 6 if not provided
    # (key = % load, value = effective EER at that load)
    if not part_load:
        # Realistic mini-split SEER 18 part-load curve
        part_load = {
            "25": 13.0,    # 25% load is most weighted
            "50": 14.5,
            "75": 13.5,
            "100": 12.5,
        }
    is_ducted = bool(payload.get("is_ducted", True))

    # EER at full load
    eer = rated_btuh / rated_w if rated_w > 0 else 0

    # SEER computation per AHRI 210/240 with simplified weighting
    # Hours weighting per Table 6 (approximate climate region IV averages):
    weights = {
        "100": 0.041,   # full load: hottest temps
        "75":  0.082,
        "50":  0.231,   # most weight at 50% load
        "25":  0.646,   # low-load hours dominate
    }
    # Convert part_load to numeric keys
    pl_eer = {str(k): float(v) for k, v in part_load.items()}
    total_btu = 0.0
    total_wh = 0.0
    for load_str, eer_pl in pl_eer.items():
        w = weights.get(load_str, 0)
        if w == 0:
            continue
        # Assume equal yearly hours (2080 hr cooling season)
        hrs = 2080 * w
        load_pct = float(load_str) / 100.0
        cooling_btu_hr = rated_btuh * load_pct
        power_w = (cooling_btu_hr / eer_pl) if eer_pl > 0 else 0
        total_btu += cooling_btu_hr * hrs
        total_wh += power_w * hrs

    seer = total_btu / max(1, total_wh) if total_wh > 0 else 0

    # SEER2: ducted units lose ~5%, ductless unchanged
    if is_ducted:
        seer2 = seer * 0.95
    else:
        seer2 = seer

    # Energy Star tier (2025)
    es_standard_seer2 = 14.3   # south
    es_most_efficient_seer2 = 17.0

    if seer2 >= es_most_efficient_seer2:
        es_class = "Most Efficient"
    elif seer2 >= es_standard_seer2:
        es_class = "Energy Star"
    elif seer2 >= 13.4:
        es_class = "Federal Min (north)"
    elif seer2 >= 13.0:
        es_class = "Just below code"
    else:
        es_class = "Below code"

    # Worked calculations for the PDF appendix.
    # The SEER computation is a weighted loop across temperature bins — branchy, skipped.
    # seer2 has two paths (ducted/ductless); the ducted case is shown as the general formula
    # with a note about ductless being unity.
    eer_r = round(eer, 2)
    cop_r = round(eer / 3.412, 2)
    seer_r = round(seer, 2)
    seer2_r = round(seer2, 2)
    cool_kw_r = round(rated_btuh / 3412.142, 2)
    seer2_factor = 0.95 if is_ducted else 1.0
    worked = [
        worked_calc(
            label="EER at rated conditions",
            formula="EER = rated_btuh / rated_w",
            values={"rated_btuh": (rated_btuh, "BTU/h"), "rated_w": (rated_w, "W")},
            result=eer_r,
            result_unit="BTU/h/W",
            assumptions=["AHRI 210/240 standard conditions: 95 degF outdoor / 80 degF indoor"],
        ),
        worked_calc(
            label="COP from EER",
            formula="COP = EER / 3.412",
            values={"EER": (eer_r, "BTU/h/W")},
            result=cop_r,
            result_unit="",
            assumptions=["1 kWh = 3412.142 BTU; COP = thermal / electrical (dimensionless ratio)"],
        ),
        worked_calc(
            label="Rated cooling capacity in kW",
            formula="cool_kw = rated_btuh / 3412.142",
            values={"rated_btuh": (rated_btuh, "BTU/h")},
            result=cool_kw_r,
            result_unit="kW",
        ),
        worked_calc(
            label="SEER2 adjustment",
            formula="SEER2 = SEER x seer2_factor",
            values={"SEER": (seer_r, "BTU/h/W"), "seer2_factor": (seer2_factor, "")},
            result=seer2_r,
            result_unit="BTU/h/W",
            assumptions=[
                "seer2_factor = 0.95 for ducted (DOE 10 CFR 430 Appendix M higher static pressure test)",
                "seer2_factor = 1.0 for ductless mini-splits",
                "SEER itself is weighted-bin integral across climate region IV (DOE Table 6); shown as input",
            ],
        ),
    ]

    return {
        "rated_cooling_btuh": rated_btuh,
        "rated_cooling_kw": cool_kw_r,
        "rated_power_w": rated_w,
        "eer_btuh_per_w": round(eer, 2),
        "cop_at_eer": round(eer / 3.412, 2),
        "seer": round(seer, 2),
        "seer2": round(seer2, 2),
        "is_ducted": is_ducted,
        "energy_star_class": es_class,
        "meets_energy_star_standard": (seer2 >= es_standard_seer2),
        "meets_most_efficient": (seer2 >= es_most_efficient_seer2),
        "part_load_eer_used": pl_eer,
        "weights_per_load": weights,
        "worked": worked,
        "notes": (
            "EER per AHRI 210/240 at 95°F outdoor. SEER weighted across "
            "DOE Climate IV climate (Atlanta GA basis). SEER2 = SEER × 0.95 for "
            "ducted (higher external static pressure 0.50 inWC). "
            "Energy Star Most Efficient 2025: SEER2 ≥ 17.0."
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
