#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/biological_shielding.py

Neutron + gamma biological shielding thickness for SMR / micro-reactor.

Input:
    {
      "reactor_power_mwt": 300.0,
      "target_dose_usv_h": 10.0,
      "shield_material": "concrete",  // concrete | borated_water | lead | borated_polyethylene
      "distance_m": 5.0
    }

Output:
    {
      "shield_thickness_m": ...,
      "shield_mass_tons": ...,
      "attenuated_dose_usv_h": ...,
      ...
    }

Physics:
- Tenth-value layer (TVL) for fast neutrons + capture gammas:
  - Concrete (ρ=2.35 g/cm³): TVL ≈ 35 cm
  - Borated water: TVL ≈ 50 cm (neutrons), 25 cm (gammas)
  - Lead: TVL ≈ 5 cm (gammas only — terrible for neutrons)
  - Polyethylene 5% borated: TVL ≈ 18 cm

References:
- Profio (1979) "Radiation Shielding and Dosimetry," Wiley.
- NUREG/CR-5453 "Shielding Design and Dose Assessment."
- ICRP 103 (2007) Radiation Protection Recommendations.
- Shultis & Faw (2002) "Radiation Shielding," 2nd ed.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "biological_shielding (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Shultis & Faw (2002) 'Radiation Shielding' 2nd ed.; ICRP 103 (2007)",
    "physics_basis": "Exponential attenuation D(x) = D_0·exp(-μx); TVL = ln(10)/μ. Source strength scales with reactor power.",
    "confidence_class": "standard",
    "last_reviewed_date": "2026-05-22",
}

# Material properties: (TVL_m, density_kg_m3)
MATERIALS = {
    "concrete":              (0.35, 2350),
    "high_density_concrete": (0.20, 4000),
    "borated_water":         (0.50, 1000),
    "lead":                  (0.05, 11340),  # gammas only — neutrons pass through
    "borated_polyethylene":  (0.18, 950),
    "steel":                 (0.10, 7850),
    "tungsten":              (0.03, 19300),  # gammas only
}


def compute(payload: dict) -> dict:
    P_mwt = float(payload.get("reactor_power_mwt", 300.0))
    target_dose_usv_h = float(payload.get("target_dose_usv_h", 10.0))
    material = str(payload.get("shield_material", "concrete")).lower()
    distance_m = float(payload.get("distance_m", 5.0))

    if material not in MATERIALS:
        material = "concrete"
    TVL_m, rho_kg_m3 = MATERIALS[material]

    # Source strength: neutrons + gammas from unshielded core
    # Empirical: 1 GW thermal core → ~10 Sv/h at 1 m distance (unshielded)
    unshielded_dose_at_1m_sv_h = 10 * (P_mwt / 1000)  # Sv/h at 1 m

    # Inverse-square law to required distance
    dose_at_distance_sv_h_unshielded = unshielded_dose_at_1m_sv_h / (distance_m ** 2)
    dose_at_distance_usv_h_unshielded = dose_at_distance_sv_h_unshielded * 1e6

    # Required attenuation
    target_dose_sv_h = target_dose_usv_h * 1e-6
    if dose_at_distance_sv_h_unshielded <= target_dose_sv_h:
        # No shielding needed
        x_required_m = 0.0
        n_tvl = 0
    else:
        atten_required = dose_at_distance_sv_h_unshielded / target_dose_sv_h
        # log10(atten) = x / TVL → x = TVL × log10(atten)
        x_required_m = TVL_m * math.log10(atten_required)
        n_tvl = math.ceil(math.log10(atten_required))

    # Round up to common construction increments: 0.1 m steps
    x_recommended_m = math.ceil(x_required_m * 10) / 10
    # Practical minimum 0.5 m for concrete
    if material == "concrete" and x_recommended_m < 0.5 and x_required_m > 0:
        x_recommended_m = 0.5

    # Actual attenuation at recommended thickness
    actual_attenuation = 10 ** (x_recommended_m / TVL_m)
    actual_dose_usv_h = dose_at_distance_usv_h_unshielded / actual_attenuation

    # Mass calculation (assume cylindrical shield surrounding core)
    # Inner radius = distance from core to shield inner face
    r_inner_m = 1.0  # 1 m from core surface — typical
    r_outer_m = r_inner_m + x_recommended_m
    H_m = 4.0  # typical core height
    # Volume of cylindrical shell + endcaps
    V_cyl_m3 = math.pi * (r_outer_m ** 2 - r_inner_m ** 2) * H_m
    V_endcap_m3 = 2 * math.pi * (r_outer_m ** 2) * x_recommended_m  # top + bottom
    V_total_m3 = V_cyl_m3 + V_endcap_m3
    mass_kg = V_total_m3 * rho_kg_m3
    mass_tons = mass_kg / 1000.0

    # Cost estimate
    cost_gbp_per_m3 = {
        "concrete":              250,
        "high_density_concrete": 800,
        "borated_water":         50,
        "lead":                  18000,
        "borated_polyethylene":  3000,
        "steel":                 4000,
        "tungsten":              700000,
    }.get(material, 250)
    cost_gbp = V_total_m3 * cost_gbp_per_m3

    return {
        "reactor_power_mwt": P_mwt,
        "target_dose_usv_h": target_dose_usv_h,
        "shield_material": material,
        "distance_m": distance_m,
        "shield_thickness_m": x_recommended_m,
        "shield_thickness_required_m": round(x_required_m, 3),
        "tenth_value_layer_m": TVL_m,
        "n_tvl_required": n_tvl,
        "shield_mass_kg": round(mass_kg, 0),
        "shield_mass_tons": round(mass_tons, 1),
        "shield_volume_m3": round(V_total_m3, 1),
        "unshielded_dose_at_1m_sv_h": round(unshielded_dose_at_1m_sv_h, 1),
        "unshielded_dose_at_distance_usv_h": round(dose_at_distance_usv_h_unshielded, 0),
        "attenuation_required_log10": round(math.log10(max(1.0, dose_at_distance_sv_h_unshielded / max(1e-30, target_dose_sv_h))), 2),
        "attenuation_achieved_log10": round(math.log10(actual_attenuation), 2),
        "attenuated_dose_usv_h": round(actual_dose_usv_h, 3),
        "meets_target": actual_dose_usv_h <= target_dose_usv_h,
        "shield_cost_gbp": round(cost_gbp, 0),
        "shield_density_kg_m3": rho_kg_m3,
        "icrp_103_public_limit_usv_h": 1.0,  # 1 mSv/yr ÷ 1000 hr ≈ 1 µSv/h
        "icrp_103_occupational_limit_usv_h": 10.0,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
