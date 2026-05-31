#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/solar_array_sizing.py

Spacecraft solar-array sizing — orbital-average power, BOL/EOL.

Input:
    {
      "required_orbital_avg_power_w": 500.0,
      "orbit": "LEO_SSO",                 # LEO_400km | LEO_SSO | MEO_GPS | GEO | L1 | L2
      "eclipse_fraction_pct": null,       # if null, computed from orbit
      "cell_efficiency_pct": 32.0,        # 28-32% triple junction, 22% silicon, 35% IMM
      "packing_factor_pct": 80.0,
      "eol_degradation_pct": 15.0,
      "sun_pointing_accuracy_deg": 5.0
    }

Output:
    {
      "array_area_m2": ...,
      "peak_power_w": ...,                # BOL noon
      "array_mass_kg": ...,
      "cell_count_estimate": ...,
      "string_voltage_v_recommended": ...,
      ...
    }

Physics:
  Solar flux at 1 AU = 1361 W/m² (G_solar)
  P_BOL_peak = G × A × η × packing × cos(off-pointing)
  P_avg = P_BOL × (1 - degradation) × (1 - eclipse_fraction)

Required A: A = P_required / (G × η × packing × (1-deg) × (1-eclipse) × cos(misalign))

References:
- Wertz & Larson, "Space Mission Analysis and Design", 3rd ed.,
  Microcosm Press 1999, §11.4 (Power Subsystem Design).
- Spectrolab XTJ Prime IMM cell datasheet (32.0% BOL AM0 efficiency).
- Patel, "Spacecraft Power Systems", CRC 2005, ch.6.
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'solar_array_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wertz, Larson eds. (1999) 'Space Mission Analysis and Design' (SMAD) 3rd ed., Microcosm/Kluwer, §11.4; Patel (2005) 'Spacecraft Power Systems' ch.6",
    "physics_basis": 'P_array = solar_constant × η_cell × η_inherent × η_string × (1 - degradation_per_year × lifetime). Solar flux 1361 W/m² at 1 AU.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


G_SOLAR = 1361.0  # W/m²

# Orbit characteristics: typical eclipse fraction (%) and solar flux at body (1 AU normalised)
# LEO eclipses depend on beta angle; we use beta=0 worst case
ORBIT_PROPS = {
    "LEO_400km":  {"eclipse_pct_default": 38, "solar_flux_w_m2": 1361, "altitude_km": 400},
    "LEO_SSO":    {"eclipse_pct_default": 35, "solar_flux_w_m2": 1361, "altitude_km": 600},
    "MEO_GPS":    {"eclipse_pct_default": 10, "solar_flux_w_m2": 1361, "altitude_km": 20200},
    "GEO":        {"eclipse_pct_default": 2,  "solar_flux_w_m2": 1361, "altitude_km": 35786},
    "L1":         {"eclipse_pct_default": 0,  "solar_flux_w_m2": 1361, "altitude_km": 1500000},
    "L2":         {"eclipse_pct_default": 0,  "solar_flux_w_m2": 1361, "altitude_km": 1500000},
}


def compute(payload: dict) -> dict:
    p_required_w = float(payload.get("required_orbital_avg_power_w", 500.0))
    orbit = str(payload.get("orbit", "LEO_SSO"))
    eclipse_in = payload.get("eclipse_fraction_pct", None)
    eta_cell = float(payload.get("cell_efficiency_pct", 32.0)) / 100.0
    packing = float(payload.get("packing_factor_pct", 80.0)) / 100.0
    eol_deg = float(payload.get("eol_degradation_pct", 15.0)) / 100.0
    misalign_deg = float(payload.get("sun_pointing_accuracy_deg", 5.0))

    if orbit not in ORBIT_PROPS:
        raise ValueError(f"unknown orbit {orbit!r}; known: {list(ORBIT_PROPS)}")
    op = ORBIT_PROPS[orbit]

    if eclipse_in is None:
        eclipse_frac = op["eclipse_pct_default"] / 100.0
    else:
        eclipse_frac = float(eclipse_in) / 100.0

    # Cosine loss from off-pointing
    cos_loss = math.cos(math.radians(misalign_deg))

    # Sun-fraction: 1 - eclipse_fraction
    sun_frac = 1.0 - eclipse_frac

    # The required peak BOL power = required_avg / (sun_frac × (1 - EOL_deg) × packing × cos × η × G/G)
    # We need the array area A such that:
    #   P_avg = A × G × η × packing × (1 - EOL) × sun_frac × cos_loss × η_distribution
    # where η_distribution accounts for charge/discharge efficiency through battery (~85%)
    # and direct-bus efficiency (~95%). Weighted by sun_frac and eclipse_frac:
    eta_direct = 0.95
    eta_through_battery = 0.80   # 90% charge × 90% discharge ≈ 0.81
    eta_distribution = sun_frac * eta_direct + eclipse_frac * eta_through_battery

    denominator = (
        op["solar_flux_w_m2"] * eta_cell * packing * (1.0 - eol_deg) * cos_loss * eta_distribution
    )
    if denominator <= 0:
        raise ValueError("denominator non-positive; check inputs")

    area_m2 = p_required_w / denominator

    # BOL peak (no degradation, full sun, no misalignment)
    p_bol_peak_w = area_m2 * op["solar_flux_w_m2"] * eta_cell * packing

    # Array mass: typical 200 W/kg BOL for rigid IMM, 350+ W/kg for thin-film
    # Use 250 W/kg as a balanced default; high efficiency gets you closer to 350.
    spec_power_w_per_kg = 250.0 + (eta_cell - 0.30) * 1000.0  # 250 W/kg at 30%, 270 W/kg at 32%
    array_mass_kg = p_bol_peak_w / spec_power_w_per_kg

    # Cell count: assume 4 cm × 8 cm cells ~ 32 cm² each = 0.0032 m²
    cell_area_m2 = 0.0032
    cell_count = math.ceil(area_m2 * packing / cell_area_m2)

    # String voltage typically 28 V or 100 V regulated bus
    # 2.6 V per cell at MPP, but with series of 36 cells = ~94 V
    if p_required_w < 1000:
        v_string = 28.0
    elif p_required_w < 10000:
        v_string = 50.0
    else:
        v_string = 100.0

    return {
        "required_orbital_avg_power_w": p_required_w,
        "orbit": orbit,
        "eclipse_fraction_pct": eclipse_frac * 100.0,
        "sun_fraction_pct": sun_frac * 100.0,
        "cell_efficiency_pct": eta_cell * 100.0,
        "packing_factor_pct": packing * 100.0,
        "eol_degradation_pct": eol_deg * 100.0,
        "sun_pointing_accuracy_deg": misalign_deg,
        "cos_misalign_loss": round(cos_loss, 4),
        "solar_flux_w_m2": op["solar_flux_w_m2"],
        "eta_distribution": round(eta_distribution, 4),
        "array_area_m2": round(area_m2, 4),
        "peak_power_w": round(p_bol_peak_w, 2),
        "eol_avg_power_w": round(p_required_w, 2),
        "array_mass_kg": round(array_mass_kg, 3),
        "specific_power_w_per_kg": round(spec_power_w_per_kg, 1),
        "cell_count_estimate": cell_count,
        "string_voltage_v_recommended": v_string,
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
