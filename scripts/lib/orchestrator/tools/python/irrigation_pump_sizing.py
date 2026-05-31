#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/irrigation_pump_sizing.py

Irrigation pump sizing for drip / NFT / aeroponics / flood-ebb systems.

Pump head computation:
    H_total = H_static + H_friction + H_velocity + H_emitter
where:
    H_static    = elevation difference (m)
    H_friction  = Darcy-Weisbach or Hazen-Williams pipe loss (m)
    H_velocity  = V²/(2g)  (usually negligible)
    H_emitter   = nozzle/emitter pressure (m water column)

Hazen-Williams (commonly used for water in PVC at ambient temp):
    H_f = 10.67 × L × Q^1.852 / (C^1.852 × D^4.871)   (SI: m, L/s, m)
where C = roughness coefficient (PVC=150, steel=120, copper=140)

Pump hydraulic power:
    P_hydraulic_kW = ρ × g × Q × H / 1000
    P_shaft_kW = P_hyd / η_pump   (η ~ 0.55-0.75)
    P_motor_kW = P_shaft / η_motor   (η ~ 0.85-0.92)

System types:
- Drip: 1-4 L/h per emitter at 100-150 kPa (10-15 m head)
- NFT (nutrient film): 1-2 L/min per channel at 5-15 m head
- Aero: 0.5-2 L/h per atomiser at 600-1000 kPa (60-100 m head)
- Flood/ebb: 10-30 L/min per table at 1-3 m head

References:
- Karassik et al., "Pump Handbook", 4th ed., McGraw-Hill 2008
- Dyne, "Hydraulic Engineering Reference Manual", PPI 2012
- Ross Penman, "Irrigation engineering", Wiley 1985
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'irrigation_pump_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "ASAE EP405.1 (Design and Installation of Microirrigation Systems); Burt et al. (2000) 'Irrigation Performance Measures: Efficiency and Uniformity'",
    "physics_basis": 'Pump head H = elevation + friction + emitter ΔP. Motor sizing P_motor = ρ × g × Q × H / (η_pump × η_motor).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    n_emitters = int(payload.get("total_emitters", 100))
    flow_per_emitter_lph = float(payload.get("flow_per_emitter_l_h", 2.0))
    system_type = str(payload.get("system_type", "drip")).lower()
    pressure_loss_kpa = float(payload.get("pressure_loss_kpa", 30))
    static_head_m = float(payload.get("static_head_m", 2.0))
    pipe_length_m = float(payload.get("pipe_length_m", 50))
    pipe_diameter_mm = float(payload.get("pipe_diameter_mm", 25))

    # Total flow
    total_flow_lph = n_emitters * flow_per_emitter_lph
    total_flow_lpm = total_flow_lph / 60.0
    total_flow_m3_h = total_flow_lph / 1000.0
    flow_q_lps = total_flow_lpm / 60.0  # L/s

    # Pressure loss conversion: 1 kPa = 0.102 m water column
    h_emitter = pressure_loss_kpa * 0.102

    # System-type specific defaults if not provided
    system_defaults = {
        "drip":  {"min_emitter_p_kpa": 100, "expected_head_m": 12.0, "pump_class": "centrifugal_small"},
        "nft":   {"min_emitter_p_kpa": 50,  "expected_head_m": 8.0,  "pump_class": "submersible_low_head"},
        "aero":  {"min_emitter_p_kpa": 700, "expected_head_m": 75.0, "pump_class": "high_pressure_diaphragm"},
        "aeroponics": {"min_emitter_p_kpa": 700, "expected_head_m": 75.0, "pump_class": "high_pressure_diaphragm"},
        "flood_ebb": {"min_emitter_p_kpa": 20, "expected_head_m": 4.0,  "pump_class": "submersible_low_head"},
    }
    defaults = system_defaults.get(system_type, system_defaults["drip"])
    if pressure_loss_kpa < defaults["min_emitter_p_kpa"]:
        # Override with minimum
        pressure_loss_kpa = defaults["min_emitter_p_kpa"]
        h_emitter = pressure_loss_kpa * 0.102

    # Hazen-Williams pipe friction
    # H_f = 10.67 × L × Q^1.852 / (C^1.852 × D^4.871)
    C_hw = 150.0  # PVC default
    D_m = pipe_diameter_mm / 1000.0
    h_friction = 10.67 * pipe_length_m * (flow_q_lps / 1000.0) ** 1.852 / (C_hw ** 1.852 * D_m ** 4.871)
    # Convert: HW formula expects Q in m³/s. Above used L/s -> m³/s already.

    # Total head
    h_total_m = static_head_m + h_friction + h_emitter

    # Hydraulic power
    # P = ρ g Q H = 9.81 × Q_m3s × H
    q_m3_s = total_flow_m3_h / 3600.0
    p_hydraulic_w = 1000.0 * 9.81 * q_m3_s * h_total_m
    # Pump efficiency depends on type
    pump_eff = {
        "drip": 0.65,
        "nft": 0.60,
        "aero": 0.55,
        "aeroponics": 0.55,
        "flood_ebb": 0.60,
    }.get(system_type, 0.65)
    motor_eff = 0.88
    p_shaft_w = p_hydraulic_w / pump_eff
    p_motor_w = p_shaft_w / motor_eff

    # Recommended motor size (next standard up)
    std_motors_kw = [0.18, 0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5, 11, 15, 18.5, 22]
    p_motor_kw = p_motor_w / 1000.0
    recommended_motor_kw = next((s for s in std_motors_kw if s >= p_motor_kw * 1.15), std_motors_kw[-1])

    # Velocity check (avoid water hammer / erosion: < 2.5 m/s)
    pipe_area_m2 = math.pi * (D_m / 2.0) ** 2
    velocity_m_s = q_m3_s / max(1e-9, pipe_area_m2)
    velocity_ok = velocity_m_s <= 2.5

    # Pump model category
    pump_class = defaults["pump_class"]

    # CAPEX rough
    pump_cost_gbp = recommended_motor_kw * 200 + 800  # crude per-kW + base

    return {
        "system_type": system_type,
        "total_emitters": n_emitters,
        "flow_per_emitter_l_h": flow_per_emitter_lph,
        "pump_flow_lpm": round(total_flow_lpm, 2),
        "pump_flow_m3_h": round(total_flow_m3_h, 2),
        "pump_head_m": round(h_total_m, 2),
        "head_breakdown": {
            "static_head_m": static_head_m,
            "friction_head_m": round(h_friction, 2),
            "emitter_pressure_head_m": round(h_emitter, 2),
        },
        "hydraulic_power_w": round(p_hydraulic_w, 1),
        "shaft_power_w": round(p_shaft_w, 1),
        "motor_power_w": round(p_motor_w, 1),
        "motor_power_kw": round(p_motor_w / 1000.0, 3),
        "recommended_motor_kw": recommended_motor_kw,
        "pump_efficiency": pump_eff,
        "motor_efficiency": motor_eff,
        "recommended_pump_model_category": pump_class,
        "pipe_velocity_m_s": round(velocity_m_s, 2),
        "pipe_velocity_acceptable": velocity_ok,
        "pipe_diameter_mm": pipe_diameter_mm,
        "pipe_length_m": pipe_length_m,
        "pump_cost_gbp_estimate": round(pump_cost_gbp),
        "notes": (
            "Hazen-Williams pipe loss (C=150 PVC). Pump efficiency varies "
            "60-75% depending on duty point. Aero systems need 6-10 bar "
            "diaphragm pumps; drip/NFT centrifugal 1-2 bar. "
            "Verify duty point on pump curve at intersect with system curve."
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
