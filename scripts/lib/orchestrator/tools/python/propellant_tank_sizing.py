#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/propellant_tank_sizing.py

Spherical (and cylindrical fallback) propellant tank sizing:
hoop-stress + ASME-style safety factor, supports blowdown / regulated / pump-fed.

Input:
    {
      "propellant_type": "MMH",         # MMH | NTO | N2H4 | Xe | LOX | LH2 | CH4 | N2 | He
      "propellant_mass_kg": 30.0,
      "max_pressure_bar": 22.0,
      "feed_type": "regulated_He_press",
      "material": "Ti_6Al_4V",          # Ti_6Al_4V | CFRP_overwrap | aluminium_2219 | inconel_718
      "safety_factor": 1.5
    }

Output:
    {
      "tank_volume_l": ...,
      "wall_thickness_mm": ...,
      "tank_mass_kg": ...,
      "total_dry_mass_kg": ...,
      "mass_fraction_pct": ...,
      ...
    }

Physics:
  Spherical pressure vessel hoop stress: σ = P · r / (2 t)
  Required wall thickness: t = (P · r · SF) / (2 · σ_yield)

Propellant densities at storage conditions:
  MMH       880 kg/m³ (liquid, 20°C)
  NTO      1450 kg/m³ (N2O4 liquid, 20°C)
  N2H4     1004 kg/m³ (liquid, 20°C)
  Xe       1500 kg/m³ (supercritical, 150 bar / 25°C)
  LOX      1141 kg/m³ (liquid, 90 K)
  LH2        70.8 kg/m³ (liquid, 20 K)
  CH4       423 kg/m³ (liquid, 112 K)
  N2 (cold gas) 230 kg/m³ (gas at 200 bar / 300 K)
  He (pressurant) 32 kg/m³ (gas at 200 bar / 300 K)

Material properties (yield_MPa, density kg/m³):
  Ti_6Al_4V       880,  4430
  CFRP_overwrap (T700S in epoxy): 1500 effective, 1850
  Al 2219         290,  2840
  Inconel 718    1035,  8200

References:
- ASME Boiler and Pressure Vessel Code Section VIII, Division 1 (UG-32 + UG-34)
- Roark's Formulas for Stress & Strain, 8th ed., Table 13.1 (spherical pressure vessels)
- Sutton & Biblarz "Rocket Propulsion Elements", §6.7 (Propellant Tanks)
- Brown "Spacecraft Propulsion" ch.5 (tank sizing)
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'propellant_tank_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "ASME BPVC Section VIII Division 1 (2023); Roark's Formulas for Stress and Strain Table 13.1; Sutton (2016) ch.6.7",
    "physics_basis": 'Thin-wall pressure vessel σ_h = pD/(2t). Burst safety factor 1.5-2.0 per ASME. Helium pressurant volume from gas-law expansion.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Propellant storage densities kg/m³
PROP_DENSITIES = {
    "MMH":   880,
    "NTO":   1450,
    "N2H4":  1004,
    "Xe":    1500,    # supercritical at ~150 bar
    "LOX":   1141,
    "LH2":   70.8,
    "CH4":   423,
    "N2":    230,     # compressed gas, 200 bar
    "He":    32,      # compressed gas, 200 bar
}

# Materials: yield MPa, density kg/m³
MATERIALS = {
    "Ti_6Al_4V":      {"yield_mpa": 880,  "density_kgm3": 4430},
    "CFRP_overwrap":  {"yield_mpa": 1500, "density_kgm3": 1850},
    "aluminium_2219": {"yield_mpa": 290,  "density_kgm3": 2840},
    "inconel_718":    {"yield_mpa": 1035, "density_kgm3": 8200},
}

# Feed-type ullage volume (10% blowdown, 5% regulated, none for pump-fed pre-pressurised)
FEED_ULLAGE_PCT = {
    "blowdown":            10.0,
    "regulated_He_press":   3.0,
    "pump_fed":             2.0,
}


def compute(payload: dict) -> dict:
    prop = str(payload.get("propellant_type", "MMH"))
    mass_kg = float(payload.get("propellant_mass_kg", 30.0))
    p_max_bar = float(payload.get("max_pressure_bar", 22.0))
    feed = str(payload.get("feed_type", "regulated_He_press"))
    material = str(payload.get("material", "Ti_6Al_4V"))
    sf = float(payload.get("safety_factor", 1.5))

    if prop not in PROP_DENSITIES:
        raise ValueError(f"unknown propellant {prop!r}; known: {list(PROP_DENSITIES)}")
    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    if feed not in FEED_ULLAGE_PCT:
        raise ValueError(f"unknown feed_type {feed!r}; known: {list(FEED_ULLAGE_PCT)}")

    rho = PROP_DENSITIES[prop]
    mat = MATERIALS[material]
    ullage_pct = FEED_ULLAGE_PCT[feed]

    # Propellant volume
    v_prop_m3 = mass_kg / rho
    v_tank_m3 = v_prop_m3 * (1.0 + ullage_pct / 100.0)
    v_tank_l = v_tank_m3 * 1000.0

    # Spherical tank radius for given volume
    r_m = ((3.0 * v_tank_m3) / (4.0 * math.pi)) ** (1.0 / 3.0)
    d_m = 2.0 * r_m

    # Hoop stress (spherical): σ = P r / (2 t)  =>  t = P r SF / (2 σ_y)
    p_pa = p_max_bar * 1e5
    sigma_y_pa = mat["yield_mpa"] * 1e6
    t_m = (p_pa * r_m * sf) / (2.0 * sigma_y_pa)
    t_mm = t_m * 1000.0

    # Apply minimum gauge: 1.0 mm for any flight tank
    t_mm = max(1.0, t_mm)
    t_m = t_mm / 1000.0

    # Tank mass: shell volume = 4π r² t (thin-wall approximation OK when t << r)
    surf_area_m2 = 4.0 * math.pi * r_m**2
    shell_vol_m3 = surf_area_m2 * t_m
    tank_shell_mass_kg = shell_vol_m3 * mat["density_kgm3"]

    # Mountings, valves, drain fittings: ~25% of shell mass
    tank_furniture_kg = 0.25 * tank_shell_mass_kg
    tank_mass_kg = tank_shell_mass_kg + tank_furniture_kg

    # Feedlines + valves
    feedline_mass_kg = 0.05 * mass_kg if feed != "pump_fed" else 0.08 * mass_kg

    total_dry_mass_kg = tank_mass_kg + feedline_mass_kg
    mass_fraction = mass_kg / (mass_kg + total_dry_mass_kg) * 100.0

    return {
        "propellant_type": prop,
        "propellant_mass_kg": mass_kg,
        "max_pressure_bar": p_max_bar,
        "feed_type": feed,
        "material": material,
        "safety_factor": sf,
        "propellant_density_kgm3": rho,
        "propellant_volume_l": round(v_prop_m3 * 1000.0, 3),
        "ullage_pct": ullage_pct,
        "tank_volume_l": round(v_tank_l, 3),
        "tank_inner_diameter_mm": round(d_m * 1000.0, 2),
        "tank_inner_radius_mm": round(r_m * 1000.0, 2),
        "wall_thickness_mm": round(t_mm, 3),
        "wall_thickness_min_gauge_mm": 1.0,
        "shell_mass_kg": round(tank_shell_mass_kg, 3),
        "furniture_mass_kg": round(tank_furniture_kg, 3),
        "tank_mass_kg": round(tank_mass_kg, 3),
        "feedline_mass_kg": round(feedline_mass_kg, 3),
        "total_dry_mass_kg": round(total_dry_mass_kg, 3),
        "mass_fraction_pct": round(mass_fraction, 2),
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
