#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/radiator_sizing.py

Stefan-Boltzmann radiator sizing for spacecraft thermal control.

Input:
    {
      "dissipation_w": 500.0,
      "sink_temp_k": 3.0,              # 3 K deep space, 250 K Earth IR avg, 280 K sun-shielded LEO
      "radiator_temp_k": 300.0,        # operating temperature of the radiator
      "surface_alpha": 0.20,           # solar absorptivity (white paint/OSR ~0.10-0.25, black ~0.9)
      "surface_epsilon": 0.90,         # IR emissivity (OSR ~0.85-0.92, white paint 0.88-0.95)
      "view_factor_to_space": 1.0,     # F (0-1)
      "safety_margin_pct": 25.0,
      "solar_incidence_factor": 0.0    # 0 if shadowed, 1 if perpendicular to sun (default 0)
    }

Output:
    {
      "radiator_area_m2": ...,
      "radiator_mass_kg": ...,
      "deployable_required": bool,     # true if area > 4 m²
      "solar_load_w_per_m2": ...,
      "effective_emissivity": ...,
      ...
    }

Physics (Gilmore, "Spacecraft Thermal Control Handbook" Vol. 1, ch. 4):
  Q_dissipated + α·G·A·f_sol  = ε·σ·F·A·(T⁴_rad - T⁴_sink)
  =>  A = (Q × (1 + margin)) / (ε·σ·F·(T⁴_rad - T⁴_sink) - α·G·f_sol)

Mass model: 1.5 kg/m² for aluminium honeycomb body-mounted radiator.
A deployable radiator panel is typically used when area > 4 m².

Reference:
- D. G. Gilmore (ed.), Spacecraft Thermal Control Handbook, 2nd ed.,
  AIAA 2002. Ch. 4 ("Radiators"), §4.1-§4.3.
- Stefan-Boltzmann σ = 5.670374e-8 W/m²/K⁴.
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'radiator_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Gilmore (2002), 'Spacecraft Thermal Control Handbook' Vol I, AIAA, ch.4",
    "physics_basis": 'Stefan-Boltzmann radiator equation Q = ε × σ × A × (T_rad^4 - T_env^4). White OSR α/ε ≈ 0.22 typical.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


SIGMA = 5.670374419e-8  # W/m²/K⁴ Stefan-Boltzmann
G_SOLAR = 1361.0        # W/m² solar constant 1 AU


def compute(payload: dict) -> dict:
    q = float(payload.get("dissipation_w", 500.0))
    t_sink = float(payload.get("sink_temp_k", 3.0))
    t_rad = float(payload.get("radiator_temp_k", 300.0))
    alpha = float(payload.get("surface_alpha", 0.20))
    epsilon = float(payload.get("surface_epsilon", 0.90))
    view_factor = float(payload.get("view_factor_to_space", 1.0))
    margin = float(payload.get("safety_margin_pct", 25.0)) / 100.0
    sol_factor = float(payload.get("solar_incidence_factor", 0.0))

    if t_rad <= t_sink:
        raise ValueError(
            f"radiator_temp_k ({t_rad}) must exceed sink_temp_k ({t_sink}) for net rejection"
        )
    if not 0 <= view_factor <= 1:
        raise ValueError(f"view_factor_to_space must be 0-1, got {view_factor}")
    if not 0 <= sol_factor <= 1:
        raise ValueError(f"solar_incidence_factor must be 0-1, got {sol_factor}")

    # IR rejection per m² to sink:
    q_ir_per_m2 = epsilon * SIGMA * view_factor * (t_rad**4 - t_sink**4)

    # Solar load per m² absorbed:
    solar_load_per_m2 = alpha * G_SOLAR * sol_factor

    # Net rejection capability per m²:
    q_net_per_m2 = q_ir_per_m2 - solar_load_per_m2
    if q_net_per_m2 <= 0:
        raise ValueError(
            f"net rejection per m² is non-positive ({q_net_per_m2:.2f}); "
            f"solar load ({solar_load_per_m2:.1f}) >= IR capability ({q_ir_per_m2:.1f}). "
            "Increase ε, reduce α, shade the radiator, or raise radiator_temp_k."
        )

    # Required area including margin
    q_design = q * (1.0 + margin)
    area_m2 = q_design / q_net_per_m2

    # Mass: 1.5 kg/m² aluminium honeycomb (Gilmore §4.3)
    radiator_mass_kg = 1.5 * area_m2

    # Deployable threshold
    deployable_required = area_m2 > 4.0

    # Effective emissivity (treats α/ε ratio as figure of merit when sun-loaded)
    if sol_factor > 0:
        effective_eps = epsilon - (alpha * sol_factor * G_SOLAR) / max(
            1e-6, SIGMA * (t_rad**4 - t_sink**4)
        )
    else:
        effective_eps = epsilon

    return {
        "dissipation_w": q,
        "sink_temp_k": t_sink,
        "radiator_temp_k": t_rad,
        "surface_alpha": alpha,
        "surface_epsilon": epsilon,
        "view_factor_to_space": view_factor,
        "solar_incidence_factor": sol_factor,
        "safety_margin_pct": margin * 100.0,
        "ir_rejection_per_m2_w": round(q_ir_per_m2, 2),
        "solar_load_w_per_m2": round(solar_load_per_m2, 2),
        "net_rejection_per_m2_w": round(q_net_per_m2, 2),
        "radiator_area_m2": round(area_m2, 4),
        "radiator_mass_kg": round(radiator_mass_kg, 3),
        "deployable_required": deployable_required,
        "effective_emissivity": round(effective_eps, 4),
        "alpha_over_epsilon": round(alpha / max(1e-6, epsilon), 3),
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
