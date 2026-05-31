#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/noise_emission_dba.py

Acoustic emission of outdoor heat pump units per BS EN 12102 / ISO 9614.

Sound power level (Lw, dB ref 1pW):
    L_w = L_p + 10 × log10(S/S_0) + corrections
where S = measurement area, S_0 = 1 m².

Source-decomposed Lw for heat pumps:
- Compressor: 65-75 dB(A) re 1pW (scroll quietest, recip loudest)
- Outdoor fan: 60-75 dB(A) (depends on diameter, RPM, tip speed)
- Refrigerant flow noise: 50-60 dB(A) (typically below others)
- Cabinet rattle / structure: 50-60 dB(A) (well-designed)

Combined: L_w_total = 10 log10(sum(10^(L_i/10)))

Sound pressure at distance (free field, hemispherical radiation):
    L_p = L_w - 10 log10(2 π r²)   = L_w - 8 - 20 log10(r)

For ground-mounted: L_p_ground = L_w - 20 log10(r) - 8 + 3 (reflection)
For wall-mounted: L_p_wall = L_w - 20 log10(r) - 5 (quarter-space)

UK Permitted Development Rights (PDR) for ASHP:
- Maximum 42 dB(A) at 1m from neighbour's habitable room window

EU 2014 EcoDesign:
- LOT 1 heat pumps: must declare L_w_outdoor
- 2024 limits: 60 dB(A) for <12 kW, 65 dB(A) for 12-50 kW

References:
- BS EN 12102-1:2022 Determination of sound power level - heat pumps
- ISO 9614-2:1996 (sound intensity method)
- Statutory Instruments 2008/418 (England PDR), 2010 (Wales), 2011 (Scotland)
- EU 813/2013 + 814/2013 EcoDesign space heaters
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'noise_emission_dba (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "BS EN 12102-1:2022 'Air conditioners, liquid chilling packages — Part 1: Determination of sound power level'; UK Town and Country Planning General Permitted Development Order 2015",
    "physics_basis": 'Sound pressure decay L_p = L_w - 20 log10(r) - 11 (point source). UK PDR ≤42 dB(A) at neighbour boundary.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Tip Mach for fan noise modelling (Lighthill scaling)
def fan_lw_db(diameter_mm: float, rpm: float) -> float:
    """Estimated fan Lw using empirical correlation for axial fans."""
    omega = 2 * math.pi * rpm / 60
    radius_m = diameter_mm / 2000
    tip_speed = omega * radius_m
    tip_mach = tip_speed / 343
    # Empirical: Lw = 10 + 50 log10(tip_speed) for axial fans
    if tip_speed < 5:
        return 40   # very quiet
    lw = 10 + 50 * math.log10(max(5, tip_speed))
    # Add 10 dB if Mach > 0.3 (compressibility)
    if tip_mach > 0.3:
        lw += 10
    return lw


def compute(payload: dict) -> dict:
    compressor_kw = float(payload.get("compressor_kw", 3.0))
    compressor_type = str(payload.get("compressor_type", "scroll")).lower()
    fan_diameter_mm = float(payload.get("fan_diameter_mm", 500))
    fan_rpm = float(payload.get("fan_rpm", 800))
    distance_m = float(payload.get("distance_m", 5.0))
    mounting = str(payload.get("mounting", "ground")).lower()

    # Compressor Lw
    compressor_lw_base = {
        "scroll": 60,           # quietest, common for HP
        "rotary": 65,
        "reciprocating": 72,
        "vapour_injection_scroll": 58,
        "inverter_scroll": 55,   # quietest at part load
    }.get(compressor_type, 65)
    # Scale with capacity: +3 dB per 2× capacity (Lighthill)
    compressor_lw = compressor_lw_base + 10 * math.log10(max(0.1, compressor_kw / 3.0))

    # Fan Lw
    fan_lw = fan_lw_db(fan_diameter_mm, fan_rpm)

    # Other sources
    refrigerant_lw = 50
    cabinet_lw = 50

    # Combine sources (energy sum)
    sources = [compressor_lw, fan_lw, refrigerant_lw, cabinet_lw]
    lw_total = 10 * math.log10(sum(10 ** (s / 10) for s in sources))

    # Distance attenuation
    mounting_correction = {
        "ground": 3,        # 2π hemisphere
        "wall": 5,          # 1/4 sphere, +3 reflection-3 + 5 = 5
        "floor_pad": 3,
        "roof": 0,          # full sphere
    }.get(mounting, 3)

    lp_at_1m = lw_total - 8 + mounting_correction
    lp_at_distance = lw_total - 20 * math.log10(max(1, distance_m)) - 8 + mounting_correction

    # UK PDR 42 dB(A) check at 1m from neighbour window
    pdr_42db_pass = lp_at_distance <= 42.0
    # EcoDesign 2024
    if compressor_kw < 12:
        eco_limit = 60
    elif compressor_kw < 50:
        eco_limit = 65
    else:
        eco_limit = 70
    eco_design_pass = lw_total <= eco_limit

    # Recommendations
    recs: list[str] = []
    if not pdr_42db_pass:
        recs.append(f"L_p at {distance_m}m = {lp_at_distance:.1f} dB(A) exceeds UK PDR 42 dB(A). "
                    f"Increase distance, add acoustic enclosure (-10dB), or use inverter scroll.")
    if fan_lw > 70:
        recs.append(f"Fan Lw = {fan_lw:.1f} dB(A). Reduce fan rpm or use larger diameter at lower rpm.")
    if compressor_lw > 70:
        recs.append(f"Compressor Lw = {compressor_lw:.1f} dB(A). Consider inverter scroll variant.")
    if not eco_design_pass:
        recs.append(f"L_w {lw_total:.1f} > EU 2024 EcoDesign limit {eco_limit} dB(A) for {compressor_kw} kW class.")
    if not recs:
        recs.append("Acoustic emissions within typical limits.")

    return {
        "compressor_kw": compressor_kw,
        "compressor_type": compressor_type,
        "compressor_lw_dba": round(compressor_lw, 1),
        "fan_diameter_mm": fan_diameter_mm,
        "fan_rpm": fan_rpm,
        "fan_lw_dba": round(fan_lw, 1),
        "refrigerant_lw_dba": refrigerant_lw,
        "cabinet_lw_dba": cabinet_lw,
        "sound_power_db_lw_total": round(lw_total, 1),
        "sound_pressure_db_at_1m": round(lp_at_1m, 1),
        "sound_pressure_db_at_distance": round(lp_at_distance, 1),
        "distance_m": distance_m,
        "mounting": mounting,
        "mounting_correction_db": mounting_correction,
        "compliance_uk_pdr_42db": pdr_42db_pass,
        "compliance_eu_ecodesign_2024": eco_design_pass,
        "eu_ecodesign_limit_db": eco_limit,
        "recommendations": recs,
        "notes": (
            "Lw per BS EN 12102-1:2022. Lp at distance assumes free-field with "
            "ground or wall reflection. UK PDR 42 dB(A) at neighbour's window. "
            "Inverter scroll compressors typically 3-5 dB(A) quieter than fixed-speed. "
            "Fan tip speed > 0.3 Mach adds 10 dB for compressibility."
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
