#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pest_control_uvc.py

UV-C sterilisation dose for plant pathogens in vertical farming.

UV-C inactivation follows first-order kinetics:
    log10(N0/N) = k × D
where:
    k = species-specific inactivation constant (cm²/mJ)
    D = UV dose (mJ/cm²)
    N0/N = ratio of viable cells before/after

Pathogen-specific dose for 4-log (99.99%) reduction:
- Botrytis cinerea (grey mould): D90 = 11 mJ/cm² → D9999 = 44 mJ/cm²
- Powdery mildew (Erysiphales): D90 = 20 mJ/cm² → D9999 = 80 mJ/cm²
- Pythium spp: D90 = 25 mJ/cm² → D9999 = 100 mJ/cm² (in water)
- Pseudomonas (bacteria): D90 = 7 mJ/cm² → D9999 = 28 mJ/cm²
- Thrips (insect): no UV-C effect on adults; only eggs (D9999 ~ 60 mJ/cm²)
- Spider mite: surface eggs D9999 ~ 90 mJ/cm²
- Plant viruses (TMV/CMV): D9999 = 200-400 mJ/cm²

UV-C lamp output:
- Low-pressure Hg (254nm): 30-300 W lamp; efficiency 30-35%; ~95% emission at 254nm
- UV-C LED (255-280nm): 1-10 W; efficiency 4-6%; pure 280nm
- Pulsed Xenon: broad spectrum; ~30 J/pulse; high peak power

Lamp safety:
- UV-C is hazardous to human skin/eyes (3 mJ/cm² = sunburn)
- TLV: 6 mJ/cm² per 8h day
- Eye exposure causes welder's flash within seconds
- Mandatory: occupancy sensor lockout; door interlock; warning signs (ISO 3864 / ISO 7010)

References:
- Yu et al, "Inactivation effects of UV-C light on Botrytis cinerea",
  Phytopathology Research 2020
- USDA, "Use of UV-C for postharvest control of plant pathogens", 2017
- IUVA, "UV Dosing Guidelines for Indoor Crops", 2021
- ANSI/IES RP-27.3-2017 Photobiological Safety
- NIOSH 1972 UV exposure limits
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'pest_control_uvc (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Kowalski (2009), 'Ultraviolet Germicidal Irradiation Handbook', Springer; ASHRAE 185.1 (UV-C Air Disinfection); IUVA UV-C LED Design Guide",
    "physics_basis": 'UV dose D = irradiance × exposure_time. Lamp count from D_required / (E_lamp × geometry_factor).',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Pathogen / pest UV-C dose for 4-log reduction (D9999, mJ/cm²)
PATHOGEN_DOSE: dict[str, dict] = {
    "botrytis":         {"D9999_mJ_cm2": 44,  "D_log10_mJ_cm2": 11, "type": "fungus"},
    "powdery_mildew":   {"D9999_mJ_cm2": 80,  "D_log10_mJ_cm2": 20, "type": "fungus"},
    "pythium":          {"D9999_mJ_cm2": 100, "D_log10_mJ_cm2": 25, "type": "oomycete"},
    "pseudomonas":      {"D9999_mJ_cm2": 28,  "D_log10_mJ_cm2": 7,  "type": "bacterium"},
    "thrips":           {"D9999_mJ_cm2": 60,  "D_log10_mJ_cm2": 15, "type": "insect_egg"},
    "spider_mite":      {"D9999_mJ_cm2": 90,  "D_log10_mJ_cm2": 23, "type": "arachnid_egg"},
    "tmv":              {"D9999_mJ_cm2": 300, "D_log10_mJ_cm2": 75, "type": "virus"},
    "fusarium":         {"D9999_mJ_cm2": 60,  "D_log10_mJ_cm2": 15, "type": "fungus"},
    "alternaria":       {"D9999_mJ_cm2": 50,  "D_log10_mJ_cm2": 13, "type": "fungus"},
    "rhizoctonia":      {"D9999_mJ_cm2": 75,  "D_log10_mJ_cm2": 19, "type": "fungus"},
    "xanthomonas":      {"D9999_mJ_cm2": 22,  "D_log10_mJ_cm2": 6,  "type": "bacterium"},
    "e_coli":           {"D9999_mJ_cm2": 18,  "D_log10_mJ_cm2": 4.5,"type": "bacterium"},
}


def compute(payload: dict) -> dict:
    room_volume_m3 = float(payload.get("room_volume_m3", 100))
    contaminant = str(payload.get("contaminant_type", "botrytis")).lower()
    target_log_reduction = float(payload.get("target_kill_log_reduction", 4.0))
    exposure_time_s = float(payload.get("exposure_time_s", 600))   # 10 min
    lamp_uvc_w = float(payload.get("lamp_uvc_w", 30))
    distance_m = float(payload.get("target_distance_m", 1.0))

    if contaminant not in PATHOGEN_DOSE:
        return {"error": f"Unknown contaminant '{contaminant}'. "
                          f"Available: {list(PATHOGEN_DOSE.keys())}"}

    path_info = PATHOGEN_DOSE[contaminant]
    # Scale dose for target log reduction
    target_dose_mJ_cm2 = path_info["D_log10_mJ_cm2"] * target_log_reduction
    # Convert to J/m² for room-level: 1 mJ/cm² = 10 J/m²
    target_dose_j_m2 = target_dose_mJ_cm2 * 10.0

    # UV-C lamp output: typically 30-35% of input power is 254nm UV-C
    uv_efficiency = 0.32
    lamp_output_w = lamp_uvc_w * uv_efficiency

    # Inverse square law at distance + spread factor
    # Irradiance at distance d (point source): I = P / (4π d²)
    # For tube source (typical low-Hg): more like cylindrical: I = P / (2π × L × d)
    # Assume tube length ~ 1m. For room ~10m², 1 lamp gives:
    # I ~ 0.5 × lamp_W / area_at_distance
    # Realistic: 30W lamp at 1m gives ~1 W/m² UV-C irradiance
    # That's 1000 mW/m² = 0.1 mW/cm² = 0.1 × time_s = mJ/cm²
    irradiance_mw_cm2 = (lamp_output_w * 0.1) / max(0.1, distance_m ** 1.5)

    # Dose delivered per lamp at distance over exposure time
    dose_per_lamp_mJ_cm2 = irradiance_mw_cm2 * exposure_time_s

    # Lamps required
    lamps_required = max(1, math.ceil(target_dose_mJ_cm2 / max(0.01, dose_per_lamp_mJ_cm2)))

    # Multi-lamp consideration: scale up for room coverage
    # 1 lamp covers ~10-15 m² floor area effectively
    floor_area_m2 = room_volume_m3 / 3.0  # assume 3m ceiling
    lamps_for_coverage = max(1, math.ceil(floor_area_m2 / 12.0))
    lamps_required = max(lamps_required, lamps_for_coverage)

    # Actual dose delivered with this lamp count
    actual_dose_mJ_cm2 = lamps_required * dose_per_lamp_mJ_cm2
    actual_log_reduction = actual_dose_mJ_cm2 / path_info["D_log10_mJ_cm2"]

    # Eye safety lockout: occupancy must be excluded for 1.2× exposure + 30s cool-down
    # TLV for unprotected eyes at 254nm: 6 mJ/cm²/8h = 0.05 µW/cm²
    # Lamp full power = ~0.1 mW/cm² at 1m → way above TLV
    # Must lock for entire exposure period + safety margin
    eye_safety_lockout_s = exposure_time_s * 1.2 + 30

    # Energy use
    energy_kwh_per_cycle = lamps_required * lamp_uvc_w / 1000.0 * (exposure_time_s / 3600.0)

    # Cost estimate
    lamp_cost_gbp = lamps_required * 180   # ~£180 per 30W UV-C lamp w/ ballast
    fixture_cost_gbp = lamps_required * 120
    control_panel_gbp = 1500
    install_gbp = lamps_required * 200
    total_capex = lamp_cost_gbp + fixture_cost_gbp + control_panel_gbp + install_gbp

    return {
        "contaminant_type": contaminant,
        "pathogen_class": path_info["type"],
        "target_log_reduction": target_log_reduction,
        "target_dose_mJ_cm2": round(target_dose_mJ_cm2, 1),
        "target_dose_j_m2": round(target_dose_j_m2, 1),
        "actual_dose_at_target_distance_mJ_cm2": round(actual_dose_mJ_cm2, 1),
        "actual_log_reduction": round(actual_log_reduction, 2),
        "lamps_required": lamps_required,
        "lamp_uvc_w_each": lamp_uvc_w,
        "lamp_uv_output_w_each": round(lamp_output_w, 1),
        "irradiance_mw_cm2_at_1m": round(irradiance_mw_cm2, 3),
        "mwh_uvc_dose_at_target_distance": round(actual_dose_mJ_cm2 * floor_area_m2 / 1000.0, 2),
        "exposure_time_s": exposure_time_s,
        "target_distance_m": distance_m,
        "room_volume_m3": room_volume_m3,
        "floor_area_m2": round(floor_area_m2, 1),
        "eye_safety_lockout_time_s": round(eye_safety_lockout_s, 0),
        "energy_kwh_per_cycle": round(energy_kwh_per_cycle, 3),
        "estimated_capex_gbp": round(total_capex),
        "safety_requirements": [
            "Occupancy sensor lockout (interrupts on motion)",
            "Door interlock (cannot run with door open)",
            "ISO 3864 warning signs on entry",
            "PPE: EN 170 UV-blocking safety glasses",
            "Annual lamp output verification (radiometer)",
            "Run during plant photoperiod 'off' phase only - reduces phytotoxicity",
        ],
        "notes": (
            f"UV-C dose per IUVA 2021 guidelines + USDA 2017. "
            f"{contaminant.title()} requires {path_info['D_log10_mJ_cm2']} mJ/cm² per "
            f"log10 reduction. UV-C is HAZARDOUS - mandatory occupancy lockout. "
            f"For confluent infestation use higher target_log_reduction (5-6)."
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
