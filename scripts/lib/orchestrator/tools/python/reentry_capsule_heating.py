#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reentry_capsule_heating.py

Re-entry capsule aerothermal heating — heat flux, peak g-load, downrange,
TPS sizing for a return capsule.

Companies served: ATMOS Space Cargo (DE), Space Forge (UK), The Exploration
Company (DE/FR), Varda Space (US/EU presence).

Input:
    {
      "entry_velocity_m_s": 7800.0,
      "entry_angle_deg": -5.0,
      "capsule_mass_kg": 200.0,
      "ballistic_coefficient_kg_m2": 300.0,
      "TPS_material": "PICA" | "AVCOAT" | "CFRP_phenolic" | "cork",
      "nose_radius_m": 0.5
    }

Output:
    peak_heat_flux_w_m2, peak_load_g, downrange_distance_km,
    TPS_mass_kg, peak_temperature_K, peak_dynamic_pressure_pa,
    _provenance.

Physics:
  Allen-Eggers ballistic re-entry (1958):
    q_max = 1/2 rho v^2  (peak dynamic pressure at h = 0)
    g_max = v_e^2 sin(gamma) / (2 e g_0 H)  (peak deceleration)
  Sutton-Graves heat flux:
    q_conv = 1.83e-4 * sqrt(rho/R_n) * v^3  W/m^2
  Tauber-Sutton radiative heat flux for high velocity (>10 km/s):
    q_rad = scale factor * f(rho, V)

References:
- Allen, H.J., Eggers, A.J., "A Study of the Motion and Aerodynamic Heating
  of Ballistic Missiles Entering the Earth's Atmosphere", NACA Report 1381,
  1958.
- Sutton, K., Graves, R.A., "A General Stagnation-Point Convective Heating
  Equation for Arbitrary Gas Mixtures", NASA TR R-376, 1971.
- Tauber, M.E., "A Review of High-Speed, Convective, Heat-Transfer Computation
  Methods", NASA TP-2914, 1989.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


PROVENANCE = {
    "tool_name": "reentry_capsule_heating (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Allen & Eggers (1958) NACA Report 1381; "
        "Sutton & Graves (1971) NASA TR R-376 'A General Stagnation-Point "
        "Convective Heating Equation'; "
        "Tauber (1989) NASA TP-2914 'High-Speed Convective Heat Transfer'."
    ),
    "physics_basis": (
        "Allen-Eggers ballistic re-entry closed-form (1958). "
        "Sutton-Graves convective heat flux at stagnation point. "
        "Exponential atmosphere with scale height H = 7.5 km."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "ALLEN_EGGERS_CONSTANTS": {
            "source": "NACA Report 1381 — H_scale = 6.7-7.5 km; rho_0 = 1.225 kg/m^3",
            "confidence": "textbook",
        },
        "TPS_PROPERTIES": {
            "source": "NASA TM-1996-110381 + AIAA 2005-2986 PICA characterisation",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# TPS material properties:
# - density (kg/m^3)
# - max sustained heat flux (W/m^2)
# - char temperature (K)
# - mass loss rate (kg/m^2/MJ)
TPS = {
    "PICA":          {"density_kg_m3": 245, "max_q_w_m2": 1500e4, "char_temp_k": 2900,
                      "mass_loss_kg_m2_MJ": 0.05},
    "AVCOAT":        {"density_kg_m3": 510, "max_q_w_m2": 800e4, "char_temp_k": 2700,
                      "mass_loss_kg_m2_MJ": 0.08},
    "CFRP_phenolic": {"density_kg_m3": 1200, "max_q_w_m2": 500e4, "char_temp_k": 2400,
                      "mass_loss_kg_m2_MJ": 0.12},
    "cork":          {"density_kg_m3": 250, "max_q_w_m2": 200e4, "char_temp_k": 2000,
                      "mass_loss_kg_m2_MJ": 0.20},
    "SLA-561V":      {"density_kg_m3": 270, "max_q_w_m2": 350e4, "char_temp_k": 2300,
                      "mass_loss_kg_m2_MJ": 0.15},
    "carbon_carbon": {"density_kg_m3": 1700, "max_q_w_m2": 5000e4, "char_temp_k": 3700,
                      "mass_loss_kg_m2_MJ": 0.02},
}


def compute(payload: dict) -> dict:
    v_e = float(payload.get("entry_velocity_m_s", 7800.0))
    gamma_deg = float(payload.get("entry_angle_deg", -5.0))
    mass_kg = float(payload.get("capsule_mass_kg", 200.0))
    bc_kg_m2 = float(payload.get("ballistic_coefficient_kg_m2", 300.0))
    tps_mat = str(payload.get("TPS_material", "PICA"))
    nose_r_m = float(payload.get("nose_radius_m", 0.5))

    if tps_mat not in TPS:
        raise ValueError(f"unknown TPS material {tps_mat!r}; known: {list(TPS)}")
    t = TPS[tps_mat]

    gamma_rad = math.radians(gamma_deg)
    sin_gamma = math.sin(abs(gamma_rad))

    # Constants
    H_scale_m = 7500.0  # km in meters
    rho_0 = 1.225  # kg/m^3 sea level
    g_0 = 9.80665

    # Allen-Eggers altitude of peak deceleration
    # h_g = H * ln(rho_0 * H / (BC * sin(gamma)))
    if sin_gamma > 0:
        h_g_max = H_scale_m * math.log(rho_0 * H_scale_m / (bc_kg_m2 * sin_gamma))
        h_g_max = max(h_g_max, 0)
    else:
        h_g_max = 0

    # Density at peak heating altitude
    rho_at_peak = rho_0 * math.exp(-h_g_max / H_scale_m)

    # Peak velocity (Allen-Eggers)
    v_peak = v_e * math.exp(-1.0 / 2.0)  # v at peak deceleration

    # Peak dynamic pressure: q = 0.5 * rho * v^2
    q_peak_pa = 0.5 * rho_at_peak * (v_peak ** 2)

    # Peak deceleration (Allen-Eggers): g_max = v_e^2 * sin(gamma) / (2 * e * H * g_0)
    g_max = (v_e ** 2 * sin_gamma) / (2.0 * math.e * H_scale_m * g_0)

    # Sutton-Graves convective heat flux at stagnation:
    # q_conv = 1.83e-4 * sqrt(rho / R_n) * V^3  W/m^2
    q_conv_w_m2 = 1.83e-4 * math.sqrt(rho_at_peak / nose_r_m) * (v_peak ** 3)

    # Tauber-Sutton radiative heat flux (only significant > 10 km/s):
    # q_rad ~ k * rho^a * V^b
    if v_e > 10000:
        q_rad_w_m2 = 4.736e8 * (rho_at_peak / rho_0) ** 1.6 * (v_e / 1e4) ** 8.5 * nose_r_m
    else:
        q_rad_w_m2 = 0.0

    q_total_w_m2 = q_conv_w_m2 + q_rad_w_m2

    # Peak surface temperature (radiative equilibrium)
    sigma_sb = 5.67e-8
    emissivity = 0.85
    peak_temp_k = (q_total_w_m2 / (emissivity * sigma_sb)) ** (1.0 / 4.0)

    # TPS material check
    tps_ok = q_total_w_m2 <= t["max_q_w_m2"]

    # Total heat load (integrated):
    # Approximate as 4/3 * q_peak * t_peak with t_peak ~ 2 H / (v_e sin gamma)
    if sin_gamma > 0 and v_e > 0:
        t_peak_s = 2.0 * H_scale_m / (v_e * sin_gamma)
    else:
        t_peak_s = 300.0
    total_heat_load_J_m2 = (4.0 / 3.0) * q_total_w_m2 * t_peak_s

    # TPS mass calculation
    # Mass loss: m_loss = mass_loss_kg_m2_MJ * total_heat_load_MJ
    total_heat_MJ_m2 = total_heat_load_J_m2 / 1e6
    tps_recession_kg_m2 = t["mass_loss_kg_m2_MJ"] * total_heat_MJ_m2
    # Plus insulation thickness for through-thickness conduction:
    # Insulation: ~10x recession mass for time-margin
    tps_insulation_kg_m2 = tps_recession_kg_m2 * 5.0
    tps_total_kg_m2 = tps_recession_kg_m2 + tps_insulation_kg_m2 + 1.0  # minimum 1 kg/m^2

    # Capsule heat-shield area (assume forebody is 50% of total surface)
    # Approximate from mass and BC: ref area = mass / BC
    a_ref_m2 = mass_kg / bc_kg_m2
    heatshield_area_m2 = a_ref_m2 * 1.5  # forebody is larger than ref area
    tps_mass_kg = tps_total_kg_m2 * heatshield_area_m2

    # Downrange (Allen-Eggers approximation): R ~ v_e * t_total
    # t_total ~ v_e / (g * sin_gamma) for ballistic
    if sin_gamma > 0:
        t_total_s = v_e / (g_0 * sin_gamma)
        downrange_m = v_e * math.cos(gamma_rad) * t_total_s
        downrange_km = downrange_m / 1000.0
    else:
        downrange_km = 0.0

    # --- Worked calculations ---
    # The heat-flux steps (Sutton-Graves sqrt, Allen-Eggers exp/log, sin,
    # radiative equilibrium ^0.25) are transcendental — they are not shown
    # as simple hand-checkable arithmetic and are SKIPPED per the worked-calc
    # rules.  The following steps are clean closed-form arithmetic and ARE shown.

    q_peak_pa_r = round(q_peak_pa, 0)
    a_ref_r = round(a_ref_m2, 4)
    heatshield_r = round(heatshield_area_m2, 2)
    total_heat_r = round(total_heat_MJ_m2, 1)
    recession_r = round(tps_recession_kg_m2, 2)
    tps_total_r = round(tps_total_kg_m2, 2)
    tps_mass_r = round(tps_mass_kg, 1)
    v_peak_r = round(v_peak, 1)
    rho_peak_r = round(rho_at_peak, 5)

    worked = [
        worked_calc(
            label="Peak dynamic pressure",
            formula="q_peak = 0.5 x rho_peak x v_peak^2",
            values={
                "rho_peak": (rho_peak_r, "kg/m^3"),
                "v_peak": (v_peak_r, "m/s"),
            },
            result=q_peak_pa_r,
            result_unit="Pa",
            assumptions=[
                "rho_peak = rho_0 x exp(-h_peak / H_scale): transcendental, passed as computed input",
                "v_peak = v_e x exp(-0.5) (Allen-Eggers peak-deceleration velocity): transcendental, passed as computed input",
            ],
        ),
        worked_calc(
            label="Reference area (from ballistic coefficient)",
            formula="A_ref = mass / BC",
            values={
                "mass": (mass_kg, "kg"),
                "BC": (bc_kg_m2, "kg/m^2"),
            },
            result=a_ref_r,
            result_unit="m^2",
            assumptions=["ballistic coefficient BC = mass / (C_D x A_ref); rearranged for A_ref"],
        ),
        worked_calc(
            label="Heat-shield area",
            formula="A_shield = A_ref x 1.5",
            values={
                "A_ref": (a_ref_r, "m^2"),
            },
            result=heatshield_r,
            result_unit="m^2",
            assumptions=["forebody area assumed 1.5 x reference area (standard blunt-body approximation)"],
        ),
        worked_calc(
            label="TPS recession mass per unit area",
            formula="m_recession = loss_rate x Q_total_MJ",
            values={
                "loss_rate": (t["mass_loss_kg_m2_MJ"], "kg/m^2/MJ"),
                "Q_total_MJ": (total_heat_r, "MJ/m^2"),
            },
            result=recession_r,
            result_unit="kg/m^2",
            assumptions=[
                f"loss rate {t['mass_loss_kg_m2_MJ']} kg/m^2/MJ from {tps_mat} ablator datasheet",
                "total heat load Q = (4/3) x q_peak x t_peak; peak flux is Sutton-Graves (transcendental), passed as computed input",
            ],
        ),
        worked_calc(
            label="Total TPS areal density",
            formula="m_TPS_per_m2 = m_recession x (1 + 5.0) + 1.0",
            values={
                "m_recession": (recession_r, "kg/m^2"),
            },
            result=tps_total_r,
            result_unit="kg/m^2",
            assumptions=["insulation = 5 x recession mass (time-margin factor); minimum 1 kg/m^2 added"],
        ),
        worked_calc(
            label="Total TPS mass",
            formula="m_TPS = m_TPS_per_m2 x A_shield",
            values={
                "m_TPS_per_m2": (tps_total_r, "kg/m^2"),
                "A_shield": (heatshield_r, "m^2"),
            },
            result=tps_mass_r,
            result_unit="kg",
            assumptions=["uniform areal density over entire forebody heat shield"],
        ),
    ]

    return {
        "entry_velocity_m_s": v_e,
        "entry_angle_deg": gamma_deg,
        "capsule_mass_kg": mass_kg,
        "ballistic_coefficient_kg_m2": bc_kg_m2,
        "TPS_material": tps_mat,
        "nose_radius_m": nose_r_m,
        "peak_altitude_km": round(h_g_max / 1000.0, 1),
        "density_at_peak_kg_m3": round(rho_at_peak, 5),
        "peak_velocity_m_s": round(v_peak, 1),
        "peak_heat_flux_conv_w_m2": round(q_conv_w_m2, 0),
        "peak_heat_flux_rad_w_m2": round(q_rad_w_m2, 0),
        "peak_heat_flux_w_m2": round(q_total_w_m2, 0),
        "peak_dynamic_pressure_pa": round(q_peak_pa, 0),
        "peak_load_g": round(g_max, 2),
        "peak_surface_temperature_K": round(peak_temp_k, 0),
        "peak_temperature_K": round(peak_temp_k, 0),
        "total_heat_load_MJ_m2": round(total_heat_MJ_m2, 1),
        "tps_recession_kg_m2": round(tps_recession_kg_m2, 2),
        "tps_thickness_kg_m2": round(tps_total_kg_m2, 2),
        "heatshield_area_m2": round(heatshield_area_m2, 2),
        "TPS_mass_kg": round(tps_mass_kg, 1),
        "tps_max_capable_flux_w_m2": t["max_q_w_m2"],
        "TPS_material_capable": tps_ok,
        "downrange_distance_km": round(downrange_km, 0),
        "worked": worked,
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
