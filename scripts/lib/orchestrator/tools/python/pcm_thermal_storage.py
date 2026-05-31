#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pcm_thermal_storage.py

Phase-Change Material (PCM) thermal storage for transient peak absorption.

Input:
    {
      "pcm_material": "paraffin_n_octadecane",
      "pcm_mass_g": 1000.0,
      "container_material": "aluminium",       # aluminium | copper_honeycomb | graphite_foam
      "target_absorption_w": 1000.0,
      "peak_duration_minutes": 5.0
    }

Output:
    {
      "total_absorption_kj": ...,
      "melting_temp_c": ...,
      "latent_heat_kj_kg": ...,
      "response_time_s": ...,
      "solidification_time_minutes": ...,
      "mass_efficiency_kj_per_kg": ...,
      ...
    }

PCM property table (Gilmore + ASHRAE Handbook of Fundamentals):
  paraffin n-octadecane (C18H38):  T_m=28.2°C,  L=244 kJ/kg
  paraffin n-eicosane (C20H42):    T_m=36.7°C,  L=247 kJ/kg
  salt hydrate (Glauber's, Na2SO4·10H2O):  T_m=32.4°C, L=251 kJ/kg
  water/ice:                        T_m=0.0°C,  L=334 kJ/kg
  gallium:                          T_m=29.8°C, L=80  kJ/kg (low ratio per mass but excellent k)

References:
- ASHRAE Handbook of Fundamentals, Ch. 33 "Phase Change Materials".
- Mehling & Cabeza, "Heat and Cold Storage with PCM", Springer 2008.
- Lane, "Solar Heat Storage: Latent Heat Materials", Vol I & II, CRC.
- Hale, Hoover & O'Neill, "Phase Change Materials Handbook", NASA, 1971.
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'pcm_thermal_storage (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "ASHRAE Handbook of Fundamentals ch.33; Mehling, Cabeza (2008), 'Heat and Cold Storage with PCM: An Up to Date Introduction Into Basics and Applications', Springer",
    "physics_basis": 'PCM latent heat storage Q = m × h_fusion. Conduction-limited solidification time per Stefan problem solution.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# PCM properties: melting temp [°C], latent heat [kJ/kg], thermal conductivity [W/m/K],
# density [kg/m³], specific heat solid [kJ/kg/K], specific heat liquid [kJ/kg/K]
PCMS = {
    "paraffin_n_octadecane": {
        "t_melt_c": 28.2, "latent_kj_kg": 244, "k_w_mk": 0.21,
        "rho_kgm3": 814, "cp_solid": 1.91, "cp_liquid": 2.20,
    },
    "paraffin_n_eicosane": {
        "t_melt_c": 36.7, "latent_kj_kg": 247, "k_w_mk": 0.22,
        "rho_kgm3": 778, "cp_solid": 1.92, "cp_liquid": 2.21,
    },
    "salt_hydrate_glaubers": {
        "t_melt_c": 32.4, "latent_kj_kg": 251, "k_w_mk": 0.54,
        "rho_kgm3": 1485, "cp_solid": 1.93, "cp_liquid": 3.30,
    },
    "water_ice": {
        "t_melt_c": 0.0, "latent_kj_kg": 334, "k_w_mk": 2.20,
        "rho_kgm3": 917, "cp_solid": 2.05, "cp_liquid": 4.18,
    },
    "gallium": {
        "t_melt_c": 29.8, "latent_kj_kg": 80, "k_w_mk": 33.5,
        "rho_kgm3": 5907, "cp_solid": 0.37, "cp_liquid": 0.39,
    },
}

# Container thermal-coupling improvement (effective k multiplier)
CONTAINERS = {
    "aluminium":        {"k_boost": 1.0,  "mass_overhead_pct": 25.0},
    "copper_honeycomb": {"k_boost": 2.5,  "mass_overhead_pct": 40.0},
    "graphite_foam":    {"k_boost": 4.0,  "mass_overhead_pct": 15.0},
}


def compute(payload: dict) -> dict:
    pcm_name = str(payload.get("pcm_material", "paraffin_n_octadecane"))
    mass_g = float(payload.get("pcm_mass_g", 1000.0))
    container = str(payload.get("container_material", "aluminium"))
    q_target_w = float(payload.get("target_absorption_w", 1000.0))
    duration_min = float(payload.get("peak_duration_minutes", 5.0))

    if pcm_name not in PCMS:
        raise ValueError(f"unknown pcm_material {pcm_name!r}; known: {list(PCMS)}")
    if container not in CONTAINERS:
        raise ValueError(f"unknown container_material {container!r}; known: {list(CONTAINERS)}")

    pcm = PCMS[pcm_name]
    cont = CONTAINERS[container]

    mass_kg = mass_g / 1000.0

    # Total latent absorption available
    total_latent_kj = mass_kg * pcm["latent_kj_kg"]
    total_latent_w_s = total_latent_kj * 1000.0   # J = W·s

    # Energy delivered by the peak event (assumes constant Q for duration)
    duration_s = duration_min * 60.0
    energy_event_kj = q_target_w * duration_s / 1000.0

    # Sufficiency
    sufficient = total_latent_kj >= energy_event_kj
    if total_latent_kj > 0:
        utilisation_pct = min(100.0, 100.0 * energy_event_kj / total_latent_kj)
    else:
        utilisation_pct = 0.0

    # Response time = energy_to_reach_melt / Q  (sensible heating of solid PCM up to T_m)
    # Assume PCM starts 5 K below melt (typical "trigger threshold")
    sensible_kj = mass_kg * pcm["cp_solid"] * 5.0
    if q_target_w > 0:
        response_time_s = sensible_kj * 1000.0 / q_target_w
    else:
        response_time_s = float("inf")

    # Effective conductivity with container boost
    k_eff = pcm["k_w_mk"] * cont["k_boost"]

    # Solidification time (1-D Stefan approximation):
    # Approximate slab of thickness L, freeze front advances by:
    #   t_solid ≈ (rho × L_latent × L_thickness²) / (2 × k_eff × ΔT)
    # Assume 10 mm characteristic thickness (typical aluminium-finned PCM block)
    L_char_m = 0.010
    dt_freeze_k = 10.0  # 10 K sub-cool typical when "off"
    if k_eff > 0 and dt_freeze_k > 0:
        solid_time_s = (
            pcm["rho_kgm3"] * (pcm["latent_kj_kg"] * 1000.0) * L_char_m**2
        ) / (2.0 * k_eff * dt_freeze_k)
    else:
        solid_time_s = float("inf")
    solid_time_min = solid_time_s / 60.0

    # Mass efficiency: total latent energy per total system mass
    container_mass_kg = mass_kg * cont["mass_overhead_pct"] / 100.0
    total_system_mass_kg = mass_kg + container_mass_kg
    mass_efficiency = total_latent_kj / max(0.001, total_system_mass_kg)

    return {
        "pcm_material": pcm_name,
        "pcm_mass_g": mass_g,
        "container_material": container,
        "target_absorption_w": q_target_w,
        "peak_duration_minutes": duration_min,
        "melting_temp_c": pcm["t_melt_c"],
        "latent_heat_kj_kg": pcm["latent_kj_kg"],
        "thermal_conductivity_pcm_w_mk": pcm["k_w_mk"],
        "thermal_conductivity_effective_w_mk": round(k_eff, 4),
        "container_k_boost": cont["k_boost"],
        "total_absorption_kj": round(total_latent_kj, 3),
        "energy_event_kj": round(energy_event_kj, 3),
        "sufficient_capacity": sufficient,
        "utilisation_pct": round(utilisation_pct, 2),
        "response_time_s": round(response_time_s, 3),
        "solidification_time_s": round(solid_time_s, 2),
        "solidification_time_minutes": round(solid_time_min, 3),
        "container_mass_kg": round(container_mass_kg, 4),
        "total_system_mass_kg": round(total_system_mass_kg, 4),
        "mass_efficiency_kj_per_kg": round(mass_efficiency, 3),
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
