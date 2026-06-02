#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/arc_flash_analysis.py

Arc flash incident energy + PPE category per IEEE 1584-2018.

Simplified Ralph Lee + IEEE 1584-2018 formula:
    E = 4.184 × Cf × En × t × 610^x / D^x   (cal/cm²)
where:
    Cf  = 1.0 for V > 600V; 1.5 for ≤ 600V (correction factor)
    En  = normalized incident energy
    t   = arc duration (seconds) - usually breaker clearing time
    D   = working distance (mm)
    x   = distance exponent (varies by enclosure type / voltage)

For practical use, IEEE 1584-2018 Eq.4.3:
    log10(En) = K1 + K2 + 1.081 × log10(I_arc) + 0.0011 × G

Arc flash boundary (m): distance at which E = 1.2 cal/cm² (onset of 2nd-degree burn).
    AFB = (4.184 × Cf × En × t × 610^x / 1.2)^(1/x)

PPE categories (NFPA 70E Table 130.7(C)(15)(c)):
- Cat 0: <1.2 cal/cm²   (basic FR)
- Cat 1: 1.2-4 cal/cm²  (4 cal/cm² FR arc-rated shirt)
- Cat 2: 4-8 cal/cm²    (8 cal/cm² FR + arc hood)
- Cat 3: 8-25 cal/cm²   (25 cal/cm² flash suit)
- Cat 4: 25-40 cal/cm²  (40 cal/cm² fully encapsulated)
- Above 40 cal/cm² = no PPE certified, design out

References:
- IEEE 1584-2018 Guide for Performing Arc Flash Hazard Calculations
- NFPA 70E-2024 Electrical Safety in the Workplace
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'arc_flash_analysis (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "IEEE 1584-2018 'Guide for Performing Arc-Flash Hazard Calculations'",
    "physics_basis": 'Incident energy E_arc = 4.184 × Cf × E_n × (t / 0.2) × (610^x / D^x). PPE category from IEEE 1584 Table.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Distance exponent x depending on enclosure type and voltage (IEEE 1584-2018 Table 4)
# (config, voltage_class) -> x
DISTANCE_EXP: dict[tuple[str, str], float] = {
    ("vcb", "lv"): 1.473, ("vcb", "mv"): 0.973,  # vertical conductors box
    ("vcbb", "lv"): 1.641, ("vcbb", "mv"): 0.871,
    ("hcb", "lv"): 1.829, ("hcb", "mv"): 1.058,  # horizontal box
    ("vof", "lv"): 1.804, ("vof", "mv"): 0.781,  # vertical open
    ("hof", "lv"): 0.987, ("hof", "mv"): 0.620,
}

# K1, K2 for log10(En) per IEEE 1584-2018 Table 5 (simplified, mid-range)
# voltage_class -> (k1, k2)
K_TABLE: dict[str, tuple[float, float]] = {
    "lv": (-0.792, 0),     # ≤ 1 kV
    "mv": (-0.555, 0),     # 1-15 kV
}


def voltage_class(v: float) -> str:
    return "lv" if v <= 1000 else "mv"


def compute(payload: dict) -> dict:
    i_fault_ka = float(payload.get("prospective_fault_current_ka", 25))
    v = float(payload.get("voltage_v", 480))
    gap_mm = float(payload.get("gap_mm", 32))
    distance_mm = float(payload.get("working_distance_mm", 610))
    clearing_s = float(payload.get("clearing_time_s", 0.10))
    config = str(payload.get("config", "vcb")).lower()

    vc = voltage_class(v)
    cf = 1.5 if v <= 600 else 1.0

    # Estimate arcing current (~85% of bolted fault for LV, 95% for MV)
    i_arc_factor = 0.85 if vc == "lv" else 0.95
    i_arc_ka = i_fault_ka * i_arc_factor
    # Simplified IEEE 1584: log10(En) = K1 + K2 + 1.081*log10(I_arc) + 0.0011*G
    k1, k2 = K_TABLE.get(vc, K_TABLE["lv"])
    log_en = k1 + k2 + 1.081 * math.log10(max(0.1, i_arc_ka)) + 0.0011 * gap_mm
    en = 10 ** log_en  # normalised incident energy at 610mm, 0.2s

    x = DISTANCE_EXP.get((config, vc), DISTANCE_EXP[("vcb", "lv")])

    # E = 4.184 × Cf × En × (t/0.2) × (610/D)^x   (cal/cm²)
    e_cal_cm2 = 4.184 * cf * en * (clearing_s / 0.2) * (610.0 / distance_mm) ** x

    # Arc flash boundary
    afb_mm = ((4.184 * cf * en * (clearing_s / 0.2)) / 1.2) ** (1.0 / x) * 610.0

    # Worked calculations.
    # log_en uses log10 (transcendental) — skipped.
    # e_cal_cm2 uses (610/D)^x with non-integer x — skipped.
    # Only the arcing-current estimate is a plain multiplication.
    i_arc_r = round(i_arc_ka, 2)
    worked = [
        worked_calc(
            label="Estimated arcing current",
            formula="I_arc = I_bf x arc_factor",
            values={
                "I_bf": (i_fault_ka, "kA"),
                "arc_factor": (i_arc_factor, ""),
            },
            result=i_arc_r, result_unit="kA",
            assumptions=[
                "arc_factor = 0.85 for LV (<= 1 kV); 0.95 for MV (IEEE 1584-2018 simplified)",
                "bolted-fault-to-arcing-current ratio from empirical correlation",
            ],
        ),
    ]

    # PPE category
    if e_cal_cm2 < 1.2:
        ppe = 0
        ppe_desc = "PPE Cat 0 - 4 cal/cm² FR or basic protective"
    elif e_cal_cm2 < 4.0:
        ppe = 1
        ppe_desc = "PPE Cat 1 - 4 cal/cm² FR shirt/trousers"
    elif e_cal_cm2 < 8.0:
        ppe = 2
        ppe_desc = "PPE Cat 2 - 8 cal/cm² FR + balaclava + face shield"
    elif e_cal_cm2 < 25.0:
        ppe = 3
        ppe_desc = "PPE Cat 3 - 25 cal/cm² flash suit (jacket + bib)"
    elif e_cal_cm2 < 40.0:
        ppe = 4
        ppe_desc = "PPE Cat 4 - 40 cal/cm² encapsulated suit"
    else:
        ppe = -1
        ppe_desc = "DANGER >40 cal/cm² - no PPE rated. Re-design or remote racking."

    return {
        "incident_energy_cal_cm2": round(e_cal_cm2, 2),
        "incident_energy_j_cm2": round(e_cal_cm2 * 4.184, 2),
        "arc_flash_boundary_mm": round(afb_mm, 0),
        "arc_flash_boundary_m": round(afb_mm / 1000.0, 2),
        "ppe_category": ppe,
        "ppe_description": ppe_desc,
        "arc_current_ka": round(i_arc_ka, 2),
        "bolted_fault_ka": i_fault_ka,
        "voltage_v": v,
        "voltage_class": vc,
        "working_distance_mm": distance_mm,
        "gap_mm": gap_mm,
        "clearing_time_s": clearing_s,
        "config": config,
        "correction_factor_cf": cf,
        "distance_exponent_x": x,
        "notes": (
            "IEEE 1584-2018 Eq. 4.3. Working distance 610mm = arm's reach. "
            "Faster breaker clearing time (e.g. arc-fault breaker 50ms) "
            "dramatically reduces energy. PPE Cat 4+ = consider remote racking."
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
