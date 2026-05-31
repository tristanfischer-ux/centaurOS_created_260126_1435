#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/thermal_strap.py

Flexible thermal strap conductance calculator for component-to-radiator coupling
(e.g. CCD/FPA -> cryocooler cold finger, optical bench -> radiator).

Input:
    {
      "material": "OFHC_copper",       # OFHC_copper | pyrolytic_graphite | aluminium_6061 | CFRP_K1100
      "length_mm": 100.0,
      "cross_section_mm2": 25.0,
      "end_attachment": "bolted",      # bolted | soldered | silver_epoxy
      "bending_radius_mm": 20.0
    }

Output:
    {
      "thermal_resistance_k_w": ...,
      "effective_conductance_w_k": ...,
      "mass_g": ...,
      "flexibility_score": ...,
      ...
    }

Physics:
  R_strap = L / (k × A)
  R_total = R_strap + 2 × R_contact   (two ends)
  G_eff = 1 / R_total

Contact resistance values from Gilmore "Spacecraft Thermal Control Handbook"
Table 8.1 (typical conductance per cm²):
  bolted (well-prepped, indium foil): 5000-10000 W/m²/K
  soldered:                            20000-40000 W/m²/K
  silver-loaded epoxy (NuSil CV-2580): 1500-3000 W/m²/K

Material conductivity references (room temp, ~300 K):
- OFHC copper:        k = 391 W/m/K   ρ = 8930 kg/m³
- Aluminium 6061:     k = 167 W/m/K   ρ = 2700 kg/m³
- Pyrolytic graphite (in-plane): k = 1600-1800 W/m/K  ρ = 2200 kg/m³
  (highly anisotropic; cross-plane only ~5-8 W/m/K)
- CFRP K1100 (pitch-fiber composite, unidirectional axial):
                      k = 600-900 W/m/K   ρ = 1850 kg/m³

References:
- Gilmore, Spacecraft Thermal Control Handbook, ch.8 "Thermal Conduction".
- Marlow Industries thermoelectric / strap technical data.
- Lockheed Martin Thermal Engineering Handbook (internal, declassified portions).
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'thermal_strap (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Gilmore (2002), 'Spacecraft Thermal Control Handbook' Vol I, AIAA, ch.8; ECSS-E-ST-31C (Thermal Control General Requirements)",
    "physics_basis": 'Bulk conduction R_bulk = L / (k × A). Bolted contact conductance from Marotta & Fletcher 1996 + ECSS-E-HB-31-01.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Conductivity W/m/K, density kg/m³, flexibility rating 1 (rigid) - 10 (flexible)
MATERIALS = {
    "OFHC_copper":         {"k_w_mk": 391, "rho_kgm3": 8930, "flex_base": 4},
    "aluminium_6061":      {"k_w_mk": 167, "rho_kgm3": 2700, "flex_base": 3},
    "pyrolytic_graphite":  {"k_w_mk": 1700, "rho_kgm3": 2200, "flex_base": 8},
    "CFRP_K1100":          {"k_w_mk": 800, "rho_kgm3": 1850, "flex_base": 6},
}

# Contact thermal conductance W/m²/K (per unit contact area)
ATTACH_H_W_M2K = {
    "bolted":       7500.0,   # well-prepped + indium foil
    "soldered":     30000.0,
    "silver_epoxy": 2200.0,
}


def compute(payload: dict) -> dict:
    material = str(payload.get("material", "OFHC_copper"))
    length_mm = float(payload.get("length_mm", 100.0))
    area_mm2 = float(payload.get("cross_section_mm2", 25.0))
    attach = str(payload.get("end_attachment", "bolted"))
    r_bend_mm = float(payload.get("bending_radius_mm", 20.0))

    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    if attach not in ATTACH_H_W_M2K:
        raise ValueError(f"unknown attachment {attach!r}; known: {list(ATTACH_H_W_M2K)}")

    mat = MATERIALS[material]
    h_contact = ATTACH_H_W_M2K[attach]

    length_m = length_mm / 1000.0
    area_m2 = area_mm2 / 1e6

    # Bulk strap resistance
    r_strap = length_m / (mat["k_w_mk"] * area_m2)  # K/W

    # Contact resistance (one end): R_c = 1 / (h × A)
    r_contact_end = 1.0 / (h_contact * area_m2)
    r_total = r_strap + 2.0 * r_contact_end

    g_eff = 1.0 / r_total

    # Mass = ρ × V
    volume_m3 = area_m2 * length_m
    mass_kg = mat["rho_kgm3"] * volume_m3
    mass_g = mass_kg * 1000.0

    # Flexibility — penalise tight bend radius (rule of thumb: r_bend/d > 5 for graphite)
    # Cross-section "equivalent diameter": d = sqrt(4A/π)
    import math
    d_eq_mm = math.sqrt(4.0 * area_mm2 / math.pi)
    r_over_d = r_bend_mm / max(0.1, d_eq_mm)
    flex_penalty = max(0.0, 1.0 - (5.0 - min(5.0, r_over_d)) * 0.2)
    flex_score = max(1, min(10, round(mat["flex_base"] * flex_penalty + (1 - flex_penalty) * 1)))

    return {
        "material": material,
        "length_mm": length_mm,
        "cross_section_mm2": area_mm2,
        "end_attachment": attach,
        "bending_radius_mm": r_bend_mm,
        "thermal_conductivity_w_mk": mat["k_w_mk"],
        "contact_conductance_w_m2k": h_contact,
        "bulk_resistance_k_w": round(r_strap, 5),
        "contact_resistance_per_end_k_w": round(r_contact_end, 5),
        "thermal_resistance_k_w": round(r_total, 5),
        "effective_conductance_w_k": round(g_eff, 3),
        "mass_g": round(mass_g, 3),
        "mass_kg": round(mass_kg, 5),
        "flexibility_score": flex_score,
        "equivalent_diameter_mm": round(d_eq_mm, 3),
        "bend_radius_to_diameter_ratio": round(r_over_d, 3),
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
