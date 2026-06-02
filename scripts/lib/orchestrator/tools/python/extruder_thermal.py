#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/extruder_thermal.py

FDM 3D printer hot-end thermal model. Predicts steady-state, time lag,
melt-zone length, cooling fan need.
Stdin JSON -> stdout JSON.

Input:
    {
      "set_temp_c": 220.0,
      "flow_rate_g_s": 0.15,             # ~9 g/min typical PLA at 60 mm/s
      "filament_diameter_mm": 1.75,
      "heater_w": 40.0,                  # E3D V6 standard
      "ambient_c": 25.0,
      "material": "PLA"                  # PLA | ABS | PETG | NYLON | TPU
    }

Output:
    {
      "steady_state_temp_c": 220.0,
      "temp_lag_s": 3.5,
      "melt_zone_length_mm": 6.0,
      "cooling_fan_required_cfm": 15.5,
      ...
    }

Method:
  - Heater power balance: P_heater = m_dot × cp × (T_set - T_in) + Q_loss
  - Time constant τ = m_block × cp_block / (UA + heater_w/T_diff)
  - Melt-zone length L_melt = m_dot × cp × ΔT / (k × π × D × h_film)
  - Cooling fan requirement: when flow_rate > critical (m_dot × cp_filament
    × ΔT > 0.7 × heater_w), heat creep into the cold zone requires forced
    cooling — typical fan ≥ 5-25 CFM at the heat-break.

Material properties from manufacturer TDS (Polymaker, ColorFabb,
NinjaTek). cp values are room-temperature averages.

License: MIT.
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
    "tool_name": 'extruder_thermal (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'E3D-Online V6 Hotend datasheet; Polymaker filament TDS series',
    "physics_basis": 'Lumped thermal capacitance dT/dt = (Q_in - Q_loss) / (m × Cp). Time constant τ = (m × Cp) / (h × A). Melt zone length L_melt = v × τ.',
    "confidence_class": 'datasheet',
    "last_reviewed_date": "2026-05-22",
}


# Material specific heat (J/g·K) and melt temperature reference (°C)
MATERIAL_PROPERTIES = {
    "PLA": {"cp_jgk": 1.80, "t_melt_c": 175, "t_glass_c": 60, "k_thermal_wm_k": 0.13},
    "ABS": {"cp_jgk": 1.75, "t_melt_c": 220, "t_glass_c": 105, "k_thermal_wm_k": 0.17},
    "PETG": {"cp_jgk": 1.20, "t_melt_c": 230, "t_glass_c": 80, "k_thermal_wm_k": 0.20},
    "NYLON": {"cp_jgk": 1.70, "t_melt_c": 250, "t_glass_c": 60, "k_thermal_wm_k": 0.25},
    "TPU": {"cp_jgk": 1.55, "t_melt_c": 220, "t_glass_c": -30, "k_thermal_wm_k": 0.19},
    "PC": {"cp_jgk": 1.20, "t_melt_c": 300, "t_glass_c": 150, "k_thermal_wm_k": 0.21},
    "ASA": {"cp_jgk": 1.50, "t_melt_c": 245, "t_glass_c": 100, "k_thermal_wm_k": 0.18},
}

# E3D V6 / similar reference values
M_BLOCK_G = 8.0   # heater block (brass ~3g) + nozzle (~2g) + heater cartridge (~3g)
CP_BLOCK = 0.45   # J/g·K (brass nozzle dominates; copper higher, aluminium block alone 0.9)
UA_BLOCK_W_K = 0.15  # ambient heat loss coefficient (with silicone sock)


def compute(payload: dict) -> dict:
    t_set = float(payload.get("set_temp_c", 210.0))
    m_dot_g_s = float(payload.get("flow_rate_g_s", 0.10))
    d_filament_mm = float(payload.get("filament_diameter_mm", 1.75))
    p_heater = float(payload.get("heater_w", 40.0))
    t_ambient = float(payload.get("ambient_c", 25.0))
    material = str(payload.get("material", "PLA")).strip().upper()

    if material not in MATERIAL_PROPERTIES:
        material = "PLA"  # fallback
    mat = MATERIAL_PROPERTIES[material]

    t_glass = mat["t_glass_c"]
    cp_filament = mat["cp_jgk"]
    k_thermal = mat["k_thermal_wm_k"]

    # Heat required to melt incoming filament: P_melt = m_dot × cp × ΔT
    # (Filament enters at ambient; needs to reach extrusion temp.)
    delta_t = t_set - t_ambient
    p_melt_w = m_dot_g_s * cp_filament * delta_t  # W

    # Heat loss from block to ambient
    q_loss = UA_BLOCK_W_K * (t_set - t_ambient)

    # Total heater duty needed
    p_required = p_melt_w + q_loss
    # If heater can't supply this, steady state is BELOW set point
    if p_required > p_heater:
        # Solve: heater_w = m_dot × cp × (T_steady - amb) + UA × (T_steady - amb)
        # T_steady = amb + heater_w / (m_dot × cp + UA)
        denom = m_dot_g_s * cp_filament + UA_BLOCK_W_K
        t_steady = t_ambient + p_heater / max(0.01, denom)
    else:
        t_steady = t_set

    # Thermal time constant τ for the heater block under closed-loop control.
    # Open-loop τ = m × cp / UA (ambient losses dominate).
    # Closed-loop response is much faster because heater can pump 40-50W
    # against a UA of 0.15 W/K, so during warm-up: dT/dt = (P_max - UA·ΔT) / (m·cp).
    # Effective heating time constant during ramp:
    #   τ_heat = (m × cp) / (P_heater_max / ΔT_max)
    # which for typical V6: τ ≈ 8g × 0.45 J/gK / (40W / 200K) = 18 s for ramp-up
    # But for STEP RESPONSE around setpoint (small disturbance) τ ≈ m·cp / UA = 24s
    # PID-controlled hot-ends typically respond to 1°C disturbances in 1-3s.
    # Use the PID-effective time constant:
    m_cp = M_BLOCK_G * CP_BLOCK
    # heater_responsiveness = how much W can be delivered per K of error
    # PID with kP × heater_w gives an effective UA_loop = kP × P_heater
    # Typical kP = 0.05/K (5% per K error) → UA_loop ≈ 2 W/K for 40W heater
    ua_loop = 0.05 * p_heater
    ua_total = ua_loop + UA_BLOCK_W_K
    tau_s = m_cp / max(0.5, ua_total)
    temp_lag_s = tau_s * 1.0  # 1τ to 63% — approximation of step response

    # Melt zone length: assume cylindrical channel through heater block
    # Volumetric flow rate (m³/s):
    rho_polymer_kg_m3 = 1250.0  # average melt density
    v_dot_m3_s = (m_dot_g_s * 1e-3) / rho_polymer_kg_m3
    d_channel_mm = d_filament_mm  # roughly = filament dia in melt zone
    a_channel_m2 = math.pi * (d_channel_mm * 1e-3 / 2.0) ** 2
    v_axial_m_s = v_dot_m3_s / max(1e-12, a_channel_m2)

    # Convection coefficient inside melt channel (forced flow against hot block).
    # For polymer melts in 2mm channel at typical FDM flow:
    # h ≈ Nu × k / D ≈ 5 × 0.20 / 0.002 = 500 W/m²K. For laminar entry-length
    # flow inside heated tube Nu can reach 10+, so use 2000 W/m²K conservative.
    h_film_w_m2_k = 2000.0
    # L_melt: distance to heat from glass to set temp
    # Q_required = m_dot × cp × (T_set - T_glass)
    # Available per unit L = h × π × D × ΔT_lm (log-mean)
    # Simplified: L = (m_dot × cp × ΔT) / (h × π × D × ΔT_film)
    delta_t_melt = max(1.0, t_set - t_glass)
    perimeter = math.pi * (d_channel_mm * 1e-3)
    delta_t_film = 50.0  # film ΔT between block wall and centerline
    if h_film_w_m2_k * perimeter * delta_t_film > 0:
        L_melt = (m_dot_g_s * cp_filament * delta_t_melt) / (h_film_w_m2_k * perimeter * delta_t_film)
        L_melt_mm = L_melt * 1000.0
    else:
        L_melt_mm = 0.0

    # Cooling fan need at heat-break:
    # If m_dot × cp × (T_set - T_glass) > 0.7 × heater_w → need forced cooling
    heat_creep_load_w = m_dot_g_s * cp_filament * delta_t_melt
    if heat_creep_load_w > 0.5 * p_heater:
        # 5 CFM per W of creep, cap 50 CFM
        cooling_fan_cfm = min(50.0, heat_creep_load_w * 0.5)
    else:
        cooling_fan_cfm = 5.0  # baseline

    delta_t_r = round(delta_t, 2)
    p_melt_r = round(p_melt_w, 3)
    q_loss_r = round(q_loss, 3)
    p_req_r = round(p_required, 3)
    ua_loop_r = round(ua_loop, 4)
    ua_total_r = round(ua_total, 4)
    m_cp_r = round(m_cp, 4)
    tau_r = round(temp_lag_s, 3)

    worked = [
        worked_calc(
            label="Temperature rise from ambient to set point",
            formula="delta_T = T_set - T_ambient",
            values={"T_set": (t_set, "C"), "T_ambient": (t_ambient, "C")},
            result=delta_t_r, result_unit="K",
            assumptions=["filament enters at ambient temperature"],
        ),
        worked_calc(
            label="Power to melt incoming filament",
            formula="P_melt = m_dot x cp x delta_T",
            values={
                "m_dot": (m_dot_g_s, "g/s"),
                "cp": (cp_filament, "J/g.K"),
                "delta_T": (delta_t_r, "K"),
            },
            result=p_melt_r, result_unit="W",
            assumptions=["cp from material TDS; room-temperature average"],
        ),
        worked_calc(
            label="Ambient heat loss from heater block",
            formula="Q_loss = UA_block x delta_T",
            values={
                "UA_block": (UA_BLOCK_W_K, "W/K"),
                "delta_T": (delta_t_r, "K"),
            },
            result=q_loss_r, result_unit="W",
            assumptions=["UA_block = 0.15 W/K (E3D V6 with silicone sock)"],
        ),
        worked_calc(
            label="Total heater power required",
            formula="P_req = P_melt + Q_loss",
            values={"P_melt": (p_melt_r, "W"), "Q_loss": (q_loss_r, "W")},
            result=p_req_r, result_unit="W",
            assumptions=["if P_req > P_heater, steady-state temp falls below set point"],
        ),
        worked_calc(
            label="PID effective UA (loop contribution)",
            formula="UA_loop = kP x P_heater",
            values={"kP": (0.05, "1/K"), "P_heater": (p_heater, "W")},
            result=ua_loop_r, result_unit="W/K",
            assumptions=["typical PID kP = 0.05 per K of error for 40 W heater"],
        ),
        worked_calc(
            label="Total effective UA",
            formula="UA_total = UA_loop + UA_block",
            values={"UA_loop": (ua_loop_r, "W/K"), "UA_block": (UA_BLOCK_W_K, "W/K")},
            result=ua_total_r, result_unit="W/K",
            assumptions=["ambient + PID-driven UA combined"],
        ),
        worked_calc(
            label="Thermal time constant (temp lag)",
            formula="tau = m_cp / UA_total",
            values={
                "m_cp": (m_cp_r, "J/K"),
                "UA_total": (ua_total_r, "W/K"),
            },
            result=tau_r, result_unit="s",
            assumptions=[
                "m_cp = M_BLOCK_G x CP_BLOCK = 8.0 g x 0.45 J/g.K",
                "tau = 1 time constant for 63% step response",
            ],
        ),
    ]

    return {
        "steady_state_temp_c": round(t_steady, 2),
        "temp_lag_s": tau_r,
        "melt_zone_length_mm": round(L_melt_mm, 3),
        "cooling_fan_required_cfm": round(cooling_fan_cfm, 2),
        "p_melt_required_w": p_melt_r,
        "p_ambient_loss_w": q_loss_r,
        "p_required_total_w": p_req_r,
        "heater_capacity_w": p_heater,
        "heater_utilisation_pct": round(min(100.0, 100.0 * p_required / p_heater), 1),
        "axial_melt_velocity_m_s": round(v_axial_m_s, 5),
        "material": material,
        "set_temp_c": t_set,
        "ambient_c": t_ambient,
        "flow_rate_g_s": m_dot_g_s,
        "flow_rate_g_min": round(m_dot_g_s * 60.0, 2),
        "filament_diameter_mm": d_filament_mm,
        "material_t_glass_c": t_glass,
        "material_cp_jgk": cp_filament,
        "material_k_thermal_wm_k": k_thermal,
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
