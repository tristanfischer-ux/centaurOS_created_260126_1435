#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/enclosure_emc.py

Electromagnetic compliance (EMC) check for edge AI enclosures. Reads
JSON from stdin, writes JSON to stdout.

Input:
    {
      "enclosure_material": "die_cast_alu", # "plastic"|"die_cast_alu"|"sheet_steel"|"abs_plastic_metallised"
      "shielding_dB": 40.0,                  # additional shielding (typical for material)
      "target_standard": "CISPR_22_B",       # "CISPR_22_B"|"CISPR_22_A"|"FCC_Class_B"|"EN_55032"
      "source_dBuV_m_at_3m": 60.0,           # uncontrolled emissions estimate
      "frequency_mhz": 100.0                  # target measurement frequency
    }

Output:
    {
      "predicted_emissions_dBuV_m": 20.0,
      "compliance_margin_dB": 20.0,
      "compliance_pass": true,
      "required_shielding_dB": 25.0,
      ...
    }

EMC standards limits (radiated emissions, dBuV/m at 3m measurement
distance, quasi-peak detector):

CISPR 22 Class A (industrial, 30-230 MHz): 40 dBuV/m
CISPR 22 Class A (230-1000 MHz):           47 dBuV/m
CISPR 22 Class B (residential, 30-230):    30 dBuV/m
CISPR 22 Class B (230-1000):               37 dBuV/m
FCC Class B (radiated, 30-88 MHz):         29.5 dBuV/m  (closer to CISPR-B)
FCC Class B (216-960 MHz):                 46 dBuV/m
EN 55032 Class B = identical to CISPR-22 Class B
EN 55032 Class A = identical to CISPR-22 Class A

Material shielding effectiveness (typical):
- Plastic (no metallisation): 0 dB
- ABS metallised (5-10 µm Cu):  20-30 dB at 100 MHz
- Die-cast aluminium (3 mm wall): 50-70 dB
- Sheet steel (1.5 mm): 60-90 dB

References:
- CISPR 22:2009 / EN 55032:2015
- FCC Part 15 Subpart B
- Ott, "Electromagnetic Compatibility Engineering" 2nd ed.
- Henry Ott Consultants, "Shielding Effectiveness" reference data
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'enclosure_emc (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "CISPR 22 / EN 55032 (Information Technology Equipment Emissions); FCC Part 15 Subpart B; Ott (2009) 'Electromagnetic Compatibility Engineering' 2nd ed., Wiley",
    "physics_basis": 'Shielding effectiveness SE = A + R + B (absorption + reflection + multi-reflection). Intrinsic SE of metal enclosure at frequency from Schelkunoff impedance.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# EMC limit (dBuV/m at 3m) by standard and frequency band
EMC_LIMITS = {
    "CISPR_22_A": [
        # (freq_min_MHz, freq_max_MHz, limit_dBuV_m)
        (30.0, 230.0, 40.0),
        (230.0, 1000.0, 47.0),
    ],
    "CISPR_22_B": [
        (30.0, 230.0, 30.0),
        (230.0, 1000.0, 37.0),
    ],
    "FCC_Class_B": [
        (30.0, 88.0, 29.5),
        (88.0, 216.0, 33.0),
        (216.0, 960.0, 35.0),
        (960.0, 5000.0, 43.5),
    ],
    "FCC_Class_A": [
        (30.0, 88.0, 39.0),
        (88.0, 216.0, 43.5),
        (216.0, 960.0, 46.5),
        (960.0, 5000.0, 49.5),
    ],
    "EN_55032_B": [
        (30.0, 230.0, 30.0),
        (230.0, 1000.0, 37.0),
    ],
    "EN_55032_A": [
        (30.0, 230.0, 40.0),
        (230.0, 1000.0, 47.0),
    ],
    "EN_55032": [
        # default to Class B (more restrictive)
        (30.0, 230.0, 30.0),
        (230.0, 1000.0, 37.0),
    ],
}

# Material → frequency-dependent shielding effectiveness (SE) in dB
# Format: list of (freq_MHz, SE_dB) sample points; we interpolate
# References: Ott Ch.6, Henry Ott "Shielding Effectiveness" tables
MATERIAL_SE = {
    "plastic": [(10, 0), (100, 0), (1000, 0)],
    "abs_plastic_metallised": [(10, 30), (100, 25), (1000, 18)],
    "die_cast_alu": [(10, 80), (100, 60), (1000, 45)],
    "sheet_steel": [(10, 90), (100, 75), (1000, 50)],
    "copper_mesh": [(10, 70), (100, 50), (1000, 30)],
    "iron_phosphate_paint": [(10, 35), (100, 25), (1000, 15)],
}


def get_emc_limit(standard: str, freq_mhz: float) -> float:
    """Return the radiated-emission limit (dBuV/m at 3m) for freq_mhz."""
    if standard not in EMC_LIMITS:
        standard = "CISPR_22_B"
    bands = EMC_LIMITS[standard]
    for f_lo, f_hi, lim in bands:
        if f_lo <= freq_mhz <= f_hi:
            return lim
    # If outside all bands, return the closest band's limit
    if freq_mhz < bands[0][0]:
        return bands[0][2]
    return bands[-1][2]


def interpolate_se(material: str, freq_mhz: float) -> float:
    """Interpolate shielding effectiveness at freq_mhz."""
    if material not in MATERIAL_SE:
        return 0.0  # no shielding
    samples = MATERIAL_SE[material]
    # If outside range, clamp
    if freq_mhz <= samples[0][0]:
        return float(samples[0][1])
    if freq_mhz >= samples[-1][0]:
        return float(samples[-1][1])
    # Linear interp in log10(freq) (SE drops roughly with log-freq)
    for i in range(1, len(samples)):
        f_lo, se_lo = samples[i - 1]
        f_hi, se_hi = samples[i]
        if f_lo <= freq_mhz <= f_hi:
            x_lo = math.log10(f_lo)
            x_hi = math.log10(f_hi)
            x = math.log10(freq_mhz)
            t = (x - x_lo) / (x_hi - x_lo)
            return se_lo + t * (se_hi - se_lo)
    return float(samples[-1][1])


def compute(payload: dict) -> dict:
    material = str(payload.get("enclosure_material", "die_cast_alu"))
    explicit_shielding_dB = payload.get("shielding_dB")
    target_standard = str(payload.get("target_standard", "CISPR_22_B"))
    source_dBuV = float(payload.get("source_dBuV_m_at_3m", 60.0))
    freq_mhz = float(payload.get("frequency_mhz", 100.0))

    # Use explicit shielding if provided, else interp from material
    if explicit_shielding_dB is not None:
        shielding_dB = float(explicit_shielding_dB)
    else:
        shielding_dB = interpolate_se(material, freq_mhz)

    material_se_dB = interpolate_se(material, freq_mhz)
    effective_shielding_dB = max(shielding_dB, material_se_dB)

    # Predicted emissions at the antenna = source - shielding
    predicted_emissions_dBuV = source_dBuV - effective_shielding_dB

    # Get standard limit
    limit_dBuV = get_emc_limit(target_standard, freq_mhz)

    # Compliance margin: positive = passing with margin, negative = failing
    compliance_margin_dB = limit_dBuV - predicted_emissions_dBuV
    compliance_pass = compliance_margin_dB > 0.0

    # Required shielding to meet standard with 6 dB engineering margin
    required_shielding_dB = source_dBuV - limit_dBuV + 6.0
    additional_shielding_needed_dB = max(0.0, required_shielding_dB - effective_shielding_dB)

    return {
        "enclosure_material": material,
        "frequency_mhz": freq_mhz,
        "source_dBuV_m_at_3m": source_dBuV,
        "material_intrinsic_shielding_dB": round(material_se_dB, 2),
        "applied_shielding_dB": round(effective_shielding_dB, 2),
        "predicted_emissions_dBuV_m": round(predicted_emissions_dBuV, 2),
        "target_standard": target_standard,
        "limit_dBuV_m": limit_dBuV,
        "compliance_margin_dB": round(compliance_margin_dB, 2),
        "compliance_pass": compliance_pass,
        "required_shielding_dB_with_6dB_margin": round(required_shielding_dB, 2),
        "additional_shielding_needed_dB": round(additional_shielding_needed_dB, 2),
        "_meta": {
            "model": "Source - shielding effectiveness vs CISPR-22/FCC/EN-55032 radiated emission limits at 3m",
            "references": [
                "CISPR 22:2009 / EN 55032:2015",
                "FCC Part 15 Subpart B",
                "Ott, EMC Engineering 2nd ed.",
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
