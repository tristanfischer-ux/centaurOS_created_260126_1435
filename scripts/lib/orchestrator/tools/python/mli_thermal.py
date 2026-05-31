#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/mli_thermal.py

Multi-Layer Insulation (MLI) effective emissivity + heat leak.

Input:
    {
      "num_layers": 20,
      "layer_material": "mylar_aluminised",   # mylar_aluminised | kapton_aluminised | PEEK | germanium_coated
      "spacer_type": "dacron_net",            # dacron_net | silk_net | embossed | none
      "edge_treatment": "taped",              # taped | sewn | velcro | none
      "temperature_hot_k": 300.0,
      "temperature_cold_k": 100.0
    }

Output:
    {
      "effective_emissivity": ...,
      "heat_leak_w_m2": ...,
      "equivalent_thermal_conductivity_w_mk": ...,
      "mass_g_m2": ...,
      "penetration_penalty_pct": ...,
      ...
    }

Physics (Cunnington & Tien, "Heat Transfer Through Insulation Materials",
NASA SP-227, 1971):

For N intermediate radiation shields between two surfaces:
  ε_eff = 1 / [ (1/ε_outer) + (N-1)·(2/ε_film) + (1/ε_inner) ]   (radiation only)
  q = ε_eff × σ × (T_h⁴ - T_c⁴)

Spacer conduction is added:
  q_total = q_rad + h_spacer × ΔT × N_layers   (W/m²)

References:
- Cunnington & Tien, NASA SP-227, 1971.
- Bapat, Narayankhedkar, Lukose "Performance Prediction of MLI",
  Cryogenics 30, 1990.
- Gilmore (ed.), Spacecraft Thermal Control Handbook, ch.5 "MLI".
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'mli_thermal (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Cunnington, Tien (1971), 'Heat-transfer mechanisms in multilayer insulation', NASA SP-227 ch.6",
    "physics_basis": 'Cunnington-Tien MLI effective emissivity: ε_eff = (ε / (2 - ε)) / N for N layers. Radiation-only model. Penetration penalty multiplicatively reduces SE.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


SIGMA = 5.670374419e-8  # W/m²/K⁴

# Layer material properties: emissivity (single side), mass [g/m²]
LAYERS = {
    "mylar_aluminised":    {"epsilon": 0.04, "mass_g_m2": 5.0},
    "kapton_aluminised":   {"epsilon": 0.03, "mass_g_m2": 7.5},
    "PEEK":                {"epsilon": 0.10, "mass_g_m2": 12.0},
    "germanium_coated":    {"epsilon": 0.02, "mass_g_m2": 9.0},
}

# Spacer / netting heat conductance per layer pair [W/m²/K] (Bapat 1990 table)
SPACERS = {
    "dacron_net":  {"h_layer_w_m2k": 5.0e-4, "mass_g_m2_per_layer": 0.6},
    "silk_net":    {"h_layer_w_m2k": 2.0e-4, "mass_g_m2_per_layer": 0.4},
    "embossed":    {"h_layer_w_m2k": 8.0e-4, "mass_g_m2_per_layer": 0.0},  # uses film dimples
    "none":        {"h_layer_w_m2k": 5.0e-3, "mass_g_m2_per_layer": 0.0},  # layers touch
}

# Edge treatment penetration penalty fraction
EDGES = {
    "taped":   0.05,
    "sewn":    0.08,
    "velcro":  0.15,
    "none":    0.25,
}


def compute(payload: dict) -> dict:
    n = int(payload.get("num_layers", 20))
    layer_mat = str(payload.get("layer_material", "mylar_aluminised"))
    spacer = str(payload.get("spacer_type", "dacron_net"))
    edge = str(payload.get("edge_treatment", "taped"))
    t_hot = float(payload.get("temperature_hot_k", 300.0))
    t_cold = float(payload.get("temperature_cold_k", 100.0))

    if layer_mat not in LAYERS:
        raise ValueError(f"unknown layer_material {layer_mat!r}; known: {list(LAYERS)}")
    if spacer not in SPACERS:
        raise ValueError(f"unknown spacer_type {spacer!r}; known: {list(SPACERS)}")
    if edge not in EDGES:
        raise ValueError(f"unknown edge_treatment {edge!r}; known: {list(EDGES)}")
    if n < 1:
        raise ValueError("num_layers must be >= 1")

    layer = LAYERS[layer_mat]
    sp = SPACERS[spacer]
    edge_penalty = EDGES[edge]

    eps_film = layer["epsilon"]
    # Effective emissivity for N intermediate shields between identical-eps surfaces.
    # Standard textbook form: ε_eff = ε_film / (2 N - (N-1)·ε_film) for N total
    # film layers acting as shields. Equivalent to series resistance Sutton/Cunnington.
    # For N films: ε_eff = ε / (2N - (N-1) ε).
    eps_eff_rad = eps_film / (2.0 * n - (n - 1) * eps_film)

    # Radiation heat flux per m²
    q_rad = eps_eff_rad * SIGMA * (t_hot**4 - t_cold**4)

    # Spacer conduction adds: q_cond = h_layer × ΔT (treated as series of N conducting layers)
    # For N layers in series with conductance h per layer pair, total R = N / h
    # Per Cunnington this is a small correction; for dense MLI <10 mW/m².
    delta_t = t_hot - t_cold
    q_cond = (sp["h_layer_w_m2k"] * delta_t) / max(1.0, n / 20.0)

    # Penetration / edge penalty — increases effective heat leak
    q_ideal = q_rad + q_cond
    q_actual = q_ideal * (1.0 + edge_penalty)

    # Mass per m²
    mass_film_g_m2 = n * layer["mass_g_m2"]
    mass_spacer_g_m2 = (n - 1) * sp["mass_g_m2_per_layer"]
    mass_total_g_m2 = mass_film_g_m2 + mass_spacer_g_m2

    # Equivalent conductivity for a typical 25 mm blanket
    blanket_thickness_m = 0.025
    if delta_t > 0:
        k_eq = q_actual * blanket_thickness_m / delta_t
    else:
        k_eq = 0.0

    # Overall effective emissivity (radiation + conduction, charged back to ε form)
    if (t_hot**4 - t_cold**4) > 0:
        eps_eff_total = q_actual / (SIGMA * (t_hot**4 - t_cold**4))
    else:
        eps_eff_total = eps_eff_rad

    return {
        "num_layers": n,
        "layer_material": layer_mat,
        "spacer_type": spacer,
        "edge_treatment": edge,
        "temperature_hot_k": t_hot,
        "temperature_cold_k": t_cold,
        "film_emissivity_per_side": eps_film,
        "effective_emissivity_radiation_only": round(eps_eff_rad, 5),
        "effective_emissivity": round(eps_eff_total, 5),
        "heat_leak_radiation_w_m2": round(q_rad, 4),
        "heat_leak_conduction_w_m2": round(q_cond, 4),
        "heat_leak_ideal_w_m2": round(q_ideal, 4),
        "heat_leak_w_m2": round(q_actual, 4),
        "penetration_penalty_pct": round(edge_penalty * 100.0, 2),
        "equivalent_thermal_conductivity_w_mk": round(k_eq, 7),
        "mass_film_g_m2": round(mass_film_g_m2, 2),
        "mass_spacer_g_m2": round(mass_spacer_g_m2, 2),
        "mass_g_m2": round(mass_total_g_m2, 2),
        "mass_kg_m2": round(mass_total_g_m2 / 1000.0, 4),
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
