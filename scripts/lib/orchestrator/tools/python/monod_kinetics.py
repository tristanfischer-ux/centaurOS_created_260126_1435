#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/monod_kinetics.py

Monod kinetics for substrate consumption + biomass growth in bioreactors.

Monod equation:
    μ = μ_max × S / (K_s + S)
where:
    μ      = specific growth rate (1/h)
    μ_max  = maximum specific growth rate (1/h)
    S      = substrate concentration (g/L)
    K_s    = substrate affinity (g/L)

Biomass growth:
    dX/dt = μ × X
    X(t) = X0 × exp(μ × t)

Substrate consumption:
    dS/dt = -(1/Y_x_s) × μ × X
where Y_x_s = biomass yield coefficient (g biomass / g substrate)

Default kinetic parameters (literature):
- E. coli (glucose):  μ_max = 0.9 /h, K_s = 0.18 g/L, Y_x/s = 0.4
- S. cerevisiae (glucose): μ_max = 0.45 /h, K_s = 0.18 g/L, Y_x/s = 0.5
- CHO mammalian cells (glucose): μ_max = 0.04 /h (24hr doubling), K_s = 0.5 g/L, Y_x/s = 0.4
- Pichia pastoris (methanol): μ_max = 0.16 /h, K_s = 0.05 g/L, Y_x/s = 0.36
- Lactobacillus (lactose):  μ_max = 0.55 /h, K_s = 0.42 g/L, Y_x/s = 0.42

References:
- Monod, "The Growth of Bacterial Cultures", Ann Rev Microbiol 1949
- Doran, "Bioprocess Engineering Principles" 2nd ed., Academic Press 2013
- Shuler & Kargi, "Bioprocess Engineering" 3rd ed., Pearson 2017
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'monod_kinetics (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Monod (1949), 'The Growth of Bacterial Cultures', Annual Review of Microbiology 3:371-394; Doran (2013) 'Bioprocess Engineering Principles' 2nd ed., ch.12",
    "physics_basis": 'Monod growth rate μ = μ_max × S / (K_S + S). Substrate consumption from yield Y_X/S: -dS/dt = (1/Y) × μ × X.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Substrate-specific defaults (μ_max in /h, K_s in g/L, Y_x/s)
SUBSTRATE_DEFAULTS: dict[str, dict] = {
    "glucose":  {"mu_max": 0.9, "ks": 0.18, "yxs": 0.4, "name": "Glucose (E. coli baseline)"},
    "glycerol": {"mu_max": 0.55, "ks": 0.20, "yxs": 0.35, "name": "Glycerol"},
    "lactose":  {"mu_max": 0.55, "ks": 0.42, "yxs": 0.42, "name": "Lactose"},
    "methanol": {"mu_max": 0.16, "ks": 0.05, "yxs": 0.36, "name": "Methanol (Pichia)"},
    "ethanol":  {"mu_max": 0.35, "ks": 0.50, "yxs": 0.40, "name": "Ethanol"},
    "sucrose":  {"mu_max": 0.7,  "ks": 0.20, "yxs": 0.40, "name": "Sucrose"},
    "xylose":   {"mu_max": 0.3,  "ks": 0.30, "yxs": 0.35, "name": "Xylose"},
}


def compute(payload: dict) -> dict:
    substrate = str(payload.get("substrate", "glucose")).lower()
    yxs_user = payload.get("yield_coefficient_g_g")
    mu_max_user = payload.get("max_growth_rate_per_hour")
    ks_user = payload.get("substrate_affinity_ks_g_l")
    initial_biomass = float(payload.get("initial_biomass_g_l", 0.1))
    working_volume_l = float(payload.get("working_volume_l", 100))
    initial_substrate = float(payload.get("initial_substrate_g_l", 30))
    target_biomass = float(payload.get("target_biomass_g_l", 10))

    if substrate not in SUBSTRATE_DEFAULTS:
        # Use first as default
        defaults = SUBSTRATE_DEFAULTS["glucose"]
    else:
        defaults = SUBSTRATE_DEFAULTS[substrate]

    yxs = float(yxs_user) if yxs_user is not None else defaults["yxs"]
    mu_max = float(mu_max_user) if mu_max_user is not None else defaults["mu_max"]
    ks = float(ks_user) if ks_user is not None else defaults["ks"]

    # Time to reach target biomass (assuming substrate not depleted)
    if initial_biomass <= 0 or target_biomass <= initial_biomass:
        return {"error": "target_biomass must be > initial_biomass and both > 0"}
    if initial_substrate <= 0:
        return {"error": "initial_substrate must be > 0"}

    # Substrate needed (mass balance)
    biomass_to_produce_g_l = target_biomass - initial_biomass
    substrate_consumed_g_l = biomass_to_produce_g_l / yxs

    if substrate_consumed_g_l > initial_substrate:
        # Substrate limited
        substrate_limited = True
        max_biomass = initial_biomass + initial_substrate * yxs
        time_to_substrate_exhaust = math.log((initial_biomass + initial_substrate * yxs) / initial_biomass) / mu_max
        time_to_target_h = time_to_substrate_exhaust
        target_achievable = False
    else:
        substrate_limited = False
        max_biomass = target_biomass
        # Time = ln(X/X0) / μ (assuming μ ≈ μ_max)
        # If S falls toward K_s, μ slows but for first 80% of substrate, μ ≈ μ_max
        time_to_target_h = math.log(target_biomass / initial_biomass) / mu_max
        target_achievable = True

    # Final biomass after substrate exhausted
    final_biomass = initial_biomass + initial_substrate * yxs
    final_biomass_kg = final_biomass * working_volume_l / 1000

    # Peak substrate uptake rate at maximum growth
    # q_s = (1/Y_x_s) × μ_max
    q_s_max = (1 / yxs) * mu_max   # g/g cells/h
    # At peak biomass × volume
    peak_uptake_g_per_h = q_s_max * max_biomass * working_volume_l

    # Doubling time
    doubling_time_h = math.log(2) / mu_max

    # Productivity (g biomass produced per L per hour)
    productivity_g_l_h = (final_biomass - initial_biomass) / max(0.1, time_to_target_h)

    # Worked calculations for the PDF appendix.
    # time_to_target uses ln() — transcendental, SKIP.
    # doubling_time uses ln(2) — transcendental, SKIP.
    # substrate_consumed, q_s_max, peak_uptake, final_biomass_kg are arithmetic.
    substrate_consumed_r = round(substrate_consumed_g_l, 2)
    q_s_max_r = round(q_s_max, 3)
    peak_uptake_r = round(peak_uptake_g_per_h, 1)
    final_biomass_r = round(final_biomass, 2)
    final_biomass_kg_r = round(final_biomass_kg, 2)
    worked = [
        worked_calc(
            label="Substrate consumed to reach target biomass",
            formula="S_consumed = (X_target - X0) / Y_xs",
            values={
                "X_target": (target_biomass, "g/L"),
                "X0": (initial_biomass, "g/L"),
                "Y_xs": (yxs, "g_biomass/g_substrate"),
            },
            result=substrate_consumed_r, result_unit="g/L",
            assumptions=["Y_xs = biomass yield coefficient; assumes no substrate maintenance"],
        ),
        worked_calc(
            label="Maximum specific substrate uptake rate",
            formula="q_s_max = mu_max / Y_xs",
            values={
                "mu_max": (mu_max, "/h"),
                "Y_xs": (yxs, "g_biomass/g_substrate"),
            },
            result=q_s_max_r, result_unit="g_substrate/g_cells/h",
            assumptions=["at mu = mu_max (no substrate limitation)"],
        ),
        worked_calc(
            label="Peak substrate uptake rate (whole bioreactor)",
            formula="q_s_peak = q_s_max x max_biomass x working_volume",
            values={
                "q_s_max": (q_s_max_r, "g_s/g_x/h"),
                "max_biomass": (round(max_biomass, 2), "g/L"),
                "working_volume": (working_volume_l, "L"),
            },
            result=peak_uptake_r, result_unit="g/h",
        ),
        worked_calc(
            label="Final biomass (mass balance: all substrate consumed)",
            formula="X_final_kg = (X0 + S_init x Y_xs) x V / 1000",
            values={
                "X0": (initial_biomass, "g/L"),
                "S_init": (initial_substrate, "g/L"),
                "Y_xs": (yxs, ""),
                "V": (working_volume_l, "L"),
            },
            result=final_biomass_kg_r, result_unit="kg",
            assumptions=["/ 1000 converts g to kg"],
        ),
    ]

    return {
        "substrate": substrate,
        "substrate_name": defaults["name"],
        "mu_max_per_hour": mu_max,
        "ks_g_l": ks,
        "yield_coefficient_yxs": yxs,
        "doubling_time_h": round(doubling_time_h, 2),
        "initial_biomass_g_l": initial_biomass,
        "initial_substrate_g_l": initial_substrate,
        "target_biomass_g_l": target_biomass,
        "working_volume_l": working_volume_l,
        "time_to_target_biomass_h": round(time_to_target_h, 2),
        "target_achievable": target_achievable,
        "substrate_limited": substrate_limited,
        "biomass_final_g_l": final_biomass_r,
        "biomass_final_kg_total": final_biomass_kg_r,
        "substrate_consumed_g_l": substrate_consumed_r,
        "substrate_consumed_g_total": round(substrate_consumed_r * working_volume_l, 0),
        "peak_substrate_uptake_g_h": peak_uptake_r,
        "specific_substrate_uptake_q_s_max_g_g_h": q_s_max_r,
        "productivity_g_l_h": round(productivity_g_l_h, 3),
        "worked": worked,
        "notes": (
            "Monod kinetics per Doran (2013) Ch.13. mu_max applies above K_s. "
            "For fed-batch, substrate kept low to control mu (avoid Crabtree/Warburg "
            "effects). For continuous chemostat, set dilution rate D < mu_max."
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
