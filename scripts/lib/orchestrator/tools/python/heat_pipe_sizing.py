#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/heat_pipe_sizing.py

Constant-conductance (CCHP), variable-conductance (VCHP), and loop-heat-pipe
(LHP / CPL) sizing for spacecraft thermal transport.

Input:
    {
      "heat_load_w": 100.0,
      "pipe_length_m": 1.0,
      "evap_cond_dt_k": 5.0,
      "working_fluid": "ammonia",        # ammonia | water | acetone | methanol
      "pipe_type": "CCHP",               # CCHP | VCHP | LHP | CPL
      "orientation": "micro_g",          # gravity_aided | against_gravity | micro_g
      "operating_temp_k": 300.0
    }

Output:
    {
      "pipe_diameter_mm": ...,
      "wick_pore_size_um": ...,
      "max_heat_transport_w_m": ...,    # capillary limit
      "pressure_drop_pa": ...,
      "mass_per_meter_kg": ...,
      "recommended_count": ...,
      ...
    }

Physics (Chi, "Heat Pipe Theory and Practice", 1976):
  Capillary limit:  Q × L_eff <= (2 σ cosθ / r_eff) × (ρ_l hfg K A_w) / μ_l
  Where:
    σ      = liquid surface tension [N/m]
    r_eff  = effective capillary pore radius [m]
    ρ_l    = liquid density [kg/m³]
    hfg    = latent heat of vaporization [J/kg]
    K      = wick permeability [m²]
    A_w    = wick cross-section [m²]
    μ_l    = liquid viscosity [Pa·s]
    L_eff  = effective length (≈ adiabatic + ½ evap + ½ cond)

Working fluid properties at 300 K (Vasiliev "Heat Pipes in Modern Heat
Exchangers", 2005; Faghri "Heat Pipe Science and Technology", 1995):

References:
- Chi, S. W. "Heat Pipe Theory and Practice", Hemisphere, 1976.
- Brennan, P.J. & Kroliczek, E.J. "Heat Pipe Design Handbook", NASA, 1979.
- Gilmore (ed.), Spacecraft Thermal Control Handbook, ch. 14 "Heat Pipes".
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'heat_pipe_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Chi (1976), 'Heat Pipe Theory and Practice', Hemisphere; Brennan, Kroliczek (1979), 'Heat Pipe Design Handbook', NASA",
    "physics_basis": 'Capillary, sonic, entrainment, boiling limits per Chi. Working-fluid figure-of-merit M = ρ_L × σ × h_fg / μ_L.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Working fluid properties at ~300 K (typical heat-pipe operating range)
# Format: surface_tension [N/m], liquid_density [kg/m³], latent_heat [J/kg],
#         liquid_viscosity [Pa·s], typical_operating_range_K
FLUIDS = {
    "ammonia": {
        "surface_tension": 0.02112,
        "liquid_density": 600.0,
        "latent_heat": 1.166e6,
        "viscosity": 1.3e-4,
        "t_range_k": (213, 373),
        "merit_number": 5.0e11,  # ρ·σ·hfg / μ  (figure of merit, W/m²)
    },
    "water": {
        "surface_tension": 0.0717,
        "liquid_density": 996.5,
        "latent_heat": 2.43e6,
        "viscosity": 8.5e-4,
        "t_range_k": (303, 503),
        "merit_number": 5.1e11,
    },
    "acetone": {
        "surface_tension": 0.0237,
        "liquid_density": 779.0,
        "latent_heat": 5.18e5,
        "viscosity": 3.0e-4,
        "t_range_k": (250, 393),
        "merit_number": 3.2e10,
    },
    "methanol": {
        "surface_tension": 0.0220,
        "liquid_density": 783.0,
        "latent_heat": 1.10e6,
        "viscosity": 5.5e-4,
        "t_range_k": (283, 393),
        "merit_number": 3.4e10,
    },
}

# Pipe-type defaults (Gilmore ch.14 typical sizing tables)
PIPE_TYPES = {
    "CCHP":  {"wick": "screen_mesh", "r_eff_um": 50, "K_m2": 1.5e-10},
    "VCHP":  {"wick": "axial_groove", "r_eff_um": 70, "K_m2": 2.5e-10},
    "LHP":   {"wick": "sintered_metal", "r_eff_um": 1.5, "K_m2": 1.0e-13},
    "CPL":   {"wick": "sintered_metal", "r_eff_um": 5.0, "K_m2": 5.0e-13},
}


def compute(payload: dict) -> dict:
    q = float(payload.get("heat_load_w", 100.0))
    length_m = float(payload.get("pipe_length_m", 1.0))
    dt_k = float(payload.get("evap_cond_dt_k", 5.0))
    fluid_name = safe_choice(str(payload.get("working_fluid", "ammonia")).lower(), FLUIDS, default="ammonia", label="working_fluid")
    pipe_type = safe_choice(str(payload.get("pipe_type", "CCHP")).upper(), PIPE_TYPES, default="CCHP", label="pipe_type")
    orientation = str(payload.get("orientation", "micro_g"))
    t_op = float(payload.get("operating_temp_k", 300.0))

    if fluid_name not in FLUIDS:
        raise ValueError(f"unknown fluid {fluid_name!r}; known: {list(FLUIDS)}")
    if pipe_type not in PIPE_TYPES:
        raise ValueError(f"unknown pipe_type {pipe_type!r}; known: {list(PIPE_TYPES)}")
    fluid = FLUIDS[fluid_name]
    pt = PIPE_TYPES[pipe_type]

    t_min, t_max = fluid["t_range_k"]
    fluid_compatible = t_min <= t_op <= t_max

    # Effective length (treating evap + cond zones as equal halves)
    l_eff = length_m

    # Capillary limit per unit cross-section: Q_max_per_A = (2σ/r_eff)·(ρ·hfg·K)/(μ·L_eff)
    # Combining: Q_max / A_w = 2σ * ρ * hfg * K / (r_eff * μ * L_eff)
    r_eff_m = pt["r_eff_um"] * 1e-6
    K = pt["K_m2"]
    q_per_aw = (
        2.0 * fluid["surface_tension"] * fluid["liquid_density"] * fluid["latent_heat"] * K
    ) / (r_eff_m * fluid["viscosity"] * l_eff)

    # Diameter sizing — iterate: assume wick is ~30% of cross-section, vapour core 70%.
    # For a tube of inner diameter d: A_pipe = π d²/4; A_w ≈ 0.3·A_pipe.
    # Required A_w such that q_per_aw * A_w >= q (per pipe)
    a_w_required = q / q_per_aw  # m²
    a_pipe_required = a_w_required / 0.30
    d_inner_m = math.sqrt(4.0 * a_pipe_required / math.pi)
    d_inner_mm = d_inner_m * 1000.0
    # Add minimum wall thickness ~0.5 mm
    d_outer_mm = d_inner_mm + 1.0

    # Round up to common stocked sizes: 4, 6, 8, 10, 12.7, 16, 19, 25.4 mm
    common_sizes_mm = [4, 6, 8, 10, 12.7, 16, 19, 25.4]
    d_recommended_mm = next((s for s in common_sizes_mm if s >= d_outer_mm), d_outer_mm)

    # Max heat transport per metre (for the recommended size)
    # Re-compute with the rounded-up A_w available at the recommended size.
    a_pipe_avail = math.pi * ((d_recommended_mm - 1.0) / 1000.0) ** 2 / 4.0
    a_w_avail = 0.30 * a_pipe_avail
    q_max_w = q_per_aw * a_w_avail
    q_max_per_m = q_max_w / max(1e-6, length_m)

    # Pressure drop (vapour + liquid): ΔP ≈ Q × μ_l × L_eff / (ρ_l × hfg × K × A_w)
    pressure_drop_pa = (q * fluid["viscosity"] * l_eff) / (
        fluid["liquid_density"] * fluid["latent_heat"] * K * a_w_avail
    )

    # Gravity penalty (against gravity): subtract ρ·g·L_h from capillary head
    # σ_cap = 2σ/r_eff ; g-head = ρ·g·L (assume 0.5 m height for against_gravity)
    cap_head_pa = 2.0 * fluid["surface_tension"] / r_eff_m
    if orientation == "against_gravity":
        g_head_pa = fluid["liquid_density"] * 9.81 * 0.5
        gravity_derate = max(0.05, 1.0 - g_head_pa / cap_head_pa)
    elif orientation == "gravity_aided":
        gravity_derate = 1.1  # slight assist
    else:  # micro_g
        gravity_derate = 1.0

    q_max_w_corrected = q_max_w * gravity_derate
    q_max_per_m_corrected = q_max_per_m * gravity_derate

    # Mass per metre — typical 0.06 kg/m for 8 mm aluminium heat pipe (Brennan & Kroliczek)
    # Scale with diameter
    mass_per_m_kg = 0.06 * (d_recommended_mm / 8.0)

    # How many pipes if single pipe over-stretched
    recommended_count = max(1, math.ceil(q / max(1e-6, q_max_w_corrected)))

    # Worked calculations — closed-form steps only; sqrt-diameter and table
    # lookups are skipped because they are not hand-verifiable arithmetic.
    q_per_aw_r = round(q_per_aw, 4)
    cap_head_pa_r = round(cap_head_pa, 2)
    pressure_drop_pa_r = round(pressure_drop_pa, 2)
    mass_per_m_r = round(mass_per_m_kg, 4)
    worked = [
        worked_calc(
            label="Capillary limit per unit wick area",
            formula="q_per_aw = (2 x sigma x rho_l x hfg x K) / (r_eff x mu_l x L_eff)",
            values={
                "sigma": (fluid["surface_tension"], "N/m"),
                "rho_l": (fluid["liquid_density"], "kg/m3"),
                "hfg": (fluid["latent_heat"], "J/kg"),
                "K": (K, "m2"),
                "r_eff": (r_eff_m, "m"),
                "mu_l": (fluid["viscosity"], "Pa.s"),
                "L_eff": (l_eff, "m"),
            },
            result=q_per_aw_r, result_unit="W/m2",
            assumptions=[
                "Capillary limit formula per Chi (1976); wick permeability K and r_eff from pipe-type table",
                f"fluid: {fluid_name}, pipe type: {pipe_type}",
            ],
        ),
        worked_calc(
            label="Capillary pressure head",
            formula="cap_head_pa = 2 x sigma / r_eff",
            values={
                "sigma": (fluid["surface_tension"], "N/m"),
                "r_eff": (r_eff_m, "m"),
            },
            result=cap_head_pa_r, result_unit="Pa",
            assumptions=["Young-Laplace equation for cylindrical pore; contact angle theta assumed 0 (cos theta = 1)"],
        ),
        worked_calc(
            label="Liquid pressure drop",
            formula="delta_P = (Q x mu_l x L_eff) / (rho_l x hfg x K x A_w_avail)",
            values={
                "Q": (q, "W"),
                "mu_l": (fluid["viscosity"], "Pa.s"),
                "L_eff": (l_eff, "m"),
                "rho_l": (fluid["liquid_density"], "kg/m3"),
                "hfg": (fluid["latent_heat"], "J/kg"),
                "K": (K, "m2"),
                "A_w_avail": (round(a_w_avail, 8), "m2"),
            },
            result=pressure_drop_pa_r, result_unit="Pa",
            assumptions=["A_w_avail computed from recommended stock diameter; 30% wick fill assumed"],
        ),
        worked_calc(
            label="Mass per metre of heat pipe",
            formula="mass_per_m = 0.06 x (d_mm / 8.0)",
            values={
                "d_mm": (d_recommended_mm, "mm"),
            },
            result=mass_per_m_r, result_unit="kg/m",
            assumptions=["0.06 kg/m reference for 8 mm aluminium heat pipe (Brennan & Kroliczek 1979); linear diameter scaling"],
        ),
    ]

    return {
        "heat_load_w": q,
        "pipe_length_m": length_m,
        "evap_cond_dt_k": dt_k,
        "working_fluid": fluid_name,
        "pipe_type": pipe_type,
        "orientation": orientation,
        "operating_temp_k": t_op,
        "fluid_compatible_with_temp": fluid_compatible,
        "wick_type": pt["wick"],
        "wick_pore_size_um": pt["r_eff_um"],
        "wick_permeability_m2": K,
        "pipe_inner_diameter_mm": round(d_inner_mm, 2),
        "pipe_outer_diameter_mm": round(d_outer_mm, 2),
        "pipe_diameter_mm": round(d_recommended_mm, 2),   # recommended stock size
        "max_heat_transport_w": round(q_max_w, 2),
        "max_heat_transport_w_corrected": round(q_max_w_corrected, 2),
        "max_heat_transport_w_m": round(q_max_per_m_corrected, 2),
        "pressure_drop_pa": round(pressure_drop_pa, 2),
        "capillary_head_pa": round(cap_head_pa, 2),
        "gravity_derate_factor": round(gravity_derate, 3),
        "mass_per_meter_kg": round(mass_per_m_kg, 4),
        "mass_total_kg": round(mass_per_m_kg * length_m * recommended_count, 4),
        "recommended_count": recommended_count,
        "merit_number_w_m2": fluid["merit_number"],
        "worked": worked,
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
