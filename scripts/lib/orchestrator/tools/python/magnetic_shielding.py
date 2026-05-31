#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/magnetic_shielding.py

Mu-metal magnetic shield design (multi-layer + open ends).

Input:
    {
      "external_field_gauss": 0.5,
      "target_attenuation_db": 60,
      "shield_layers": 2,
      "shield_diameter_m": 0.4,
      "shield_length_m": 0.8
    }

Output:
    {
      "mu_metal_thickness_mm": ...,
      "mass_kg": ...,
      "shielding_factor": ...,
      "actual_attenuation_db": ...,
      ...
    }

Physics:
- Single-layer transverse shielding factor S_T = μ_r·t/D + 1
- Multi-layer S_total ≈ S_1 × S_2 × ... × (1 + d/D)^(n-1) where d/D is the
  spacing-to-diameter ratio of nested shields.
- Mu-metal: μ_r ≈ 50,000-100,000 at low fields, drops at saturation (B_sat ~ 0.8 T).
- Open-end leakage: S_eff < S_inf by factor (1 + L_end/D) on each face.

References:
- Mager (1968) "Magnetic shields," IEEE Trans. Magnetics MAG-4, 410.
- Sumitomo Metals / Magnetic Shield Corp datasheets.
- Wills (2003) Cryogenics 43, 365-372 (low-T magnetic shielding).
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "magnetic_shielding (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Mager (1968) IEEE Trans. Magnetics MAG-4 410; Wills (2003) Cryogenics 43 365",
    "physics_basis": "Multi-layer shielding factor S_total = S_1·S_2·...·(1+d/D)^(n-1); open-end leakage degrades by L_end/D.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

MU_METAL_DENSITY_KG_M3 = 8700  # nickel-iron alloy
MU_R_LOW_FIELD = 60000  # typical for Mumetall 80


def compute(payload: dict) -> dict:
    B_ext_g = float(payload.get("external_field_gauss", 0.5))
    target_atten_db = float(payload.get("target_attenuation_db", 60.0))
    n_layers = int(payload.get("shield_layers", 2))
    D_m = float(payload.get("shield_diameter_m", 0.4))
    L_m = float(payload.get("shield_length_m", 0.8))

    target_atten_factor = 10 ** (target_atten_db / 20.0)

    # Single layer factor: S = (μ_r × t / D) + 1
    # Want product over n layers ≈ target.
    # If layers approximately equal: S_per_layer ≈ target^(1/n) / (1+d/D)^((n-1)/n)
    spacing_ratio = 0.1  # d/D — 10% typical between nested cans
    layer_boost_factor = (1.0 + spacing_ratio) ** (n_layers - 1)
    s_per_layer = (target_atten_factor / layer_boost_factor) ** (1.0 / n_layers)
    # Solve for t: μ_r × t / D = S - 1
    t_per_layer_m = max(0.0005, (s_per_layer - 1.0) * D_m / MU_R_LOW_FIELD)
    t_per_layer_mm = t_per_layer_m * 1000.0

    # Snap to commercial stock: 0.5, 1.0, 1.5, 2.0, 3.0 mm
    stock_mm = [0.5, 1.0, 1.5, 2.0, 3.0]
    t_recommended_mm = next((s for s in stock_mm if s >= t_per_layer_mm), stock_mm[-1])
    t_recommended_m = t_recommended_mm / 1000.0

    # Recompute actual achieved attenuation
    s_actual_per_layer = MU_R_LOW_FIELD * t_recommended_m / D_m + 1.0
    s_total_inf = s_actual_per_layer ** n_layers * layer_boost_factor

    # Open-end correction (cylindrical can has open ends or covers)
    # Reduction factor f_end = L/D >> 1 → no reduction; L/D=1 → factor ~0.5
    L_over_D = L_m / D_m
    end_factor = min(1.0, L_over_D / (L_over_D + 1.0))
    s_actual = s_total_inf * end_factor
    actual_atten_db = 20.0 * math.log10(max(1.0, s_actual))

    # Mass per layer: area = π·D·L + 2·π/4·D² (cylinder + 2 endcaps)
    # Each successive layer slightly larger; use D + n×0.05 m
    total_mass_kg = 0.0
    for n in range(n_layers):
        D_layer = D_m + n * 0.05
        L_layer = L_m + n * 0.05
        area_m2 = math.pi * D_layer * L_layer + 2 * math.pi * (D_layer / 2) ** 2
        vol_m3 = area_m2 * t_recommended_m
        mass_layer = vol_m3 * MU_METAL_DENSITY_KG_M3
        total_mass_kg += mass_layer

    # Internal field after shielding
    B_internal_gauss = B_ext_g / s_actual
    B_internal_nT = B_internal_gauss * 1e5

    # Saturation check: μ-metal saturates at B > 0.8 T
    B_external_T = B_ext_g * 1e-4
    saturated = B_external_T > 0.5  # working margin

    return {
        "external_field_gauss": B_ext_g,
        "external_field_uT": round(B_ext_g * 100, 2),
        "target_attenuation_db": target_atten_db,
        "shield_layers": n_layers,
        "mu_metal_thickness_mm": t_recommended_mm,
        "mu_metal_thickness_required_mm": round(t_per_layer_mm, 3),
        "mass_kg": round(total_mass_kg, 2),
        "shielding_factor": round(s_actual, 1),
        "actual_attenuation_db": round(actual_atten_db, 1),
        "internal_field_gauss": round(B_internal_gauss, 6),
        "internal_field_nT": round(B_internal_nT, 2),
        "open_end_loss_factor": round(end_factor, 3),
        "saturated": saturated,
        "mu_r_used": MU_R_LOW_FIELD,
        "shield_diameter_m": D_m,
        "shield_length_m": L_m,
        "meets_target": actual_atten_db >= target_atten_db,
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
