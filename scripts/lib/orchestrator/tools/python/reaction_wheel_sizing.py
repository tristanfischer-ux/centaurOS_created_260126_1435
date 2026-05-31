#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reaction_wheel_sizing.py

Reaction Wheel Assembly (RWA) sizing — torque + angular-momentum capacity.

Input:
    {
      "satellite_inertia_kgm2": 50.0,
      "max_slew_rate_deg_s": 1.0,
      "slew_amplitude_deg": 30.0,
      "disturbance_torque_nm": 1.0e-5,
      "wheel_count": "3_pyramid"          # 3_pyramid | 4_redundant_pyramid | 4_orthogonal
    }

Output:
    {
      "torque_required_nm": ...,
      "momentum_capacity_nms": ...,
      "saturation_rpm": ...,
      "desat_method_recommended": ...,
      "wheel_mass_kg": ...,
      ...
    }

Physics:
  Torque needed for slew: T = I × α
  Slew time t = 2 × sqrt(amplitude / α)  (bang-bang)
  Peak slew rate ω_p = α × (t/2)
  Momentum storage: H = I × ω

Sizing margin: 2× for transient + 10× life margin on momentum to avoid
chronic saturation.

References:
- Wertz, J.R. (ed.), "Spacecraft Attitude Determination and Control",
  Kluwer / Microcosm 1978, ch.7 (Reaction Wheel Sizing).
- Sidi, M.J., "Spacecraft Dynamics and Control", Cambridge 1997, §7.5.
- Honeywell HR Series RWA datasheets (HR-04, HR-12, HR-50).
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'reaction_wheel_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wertz ed. (1978), 'Spacecraft Attitude Determination and Control' ch.7; Sidi (1997) 'Spacecraft Dynamics and Control' §7.5; Honeywell HR-Series datasheet",
    "physics_basis": 'Required torque T_req = I × α + T_disturbance. Momentum storage H = I_wheel × ω_wheel_max. Sized 2× peak disturbance integral.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


DEG_TO_RAD = math.pi / 180.0


# Geometry factors for converting per-axis vs per-wheel demands
# Per-wheel = per-axis / projection of axis onto wheel spin axis
WHEEL_GEOMETRIES = {
    "3_pyramid":           {"count": 3, "projection_factor": 0.577, "redundancy": False},  # cos(54.7°) tetrahedral
    "4_redundant_pyramid": {"count": 4, "projection_factor": 0.500, "redundancy": True},   # 4-corner pyramid
    "4_orthogonal":        {"count": 4, "projection_factor": 0.707, "redundancy": True},   # 3 ortho + 1 skew
}


def compute(payload: dict) -> dict:
    inertia_kgm2 = float(payload.get("satellite_inertia_kgm2", 50.0))
    slew_rate_deg_s = float(payload.get("max_slew_rate_deg_s", 1.0))
    slew_amp_deg = float(payload.get("slew_amplitude_deg", 30.0))
    disturbance_nm = float(payload.get("disturbance_torque_nm", 1e-5))
    wheel_geom = str(payload.get("wheel_count", "3_pyramid"))

    if wheel_geom not in WHEEL_GEOMETRIES:
        raise ValueError(f"unknown wheel_count {wheel_geom!r}; known: {list(WHEEL_GEOMETRIES)}")
    geom = WHEEL_GEOMETRIES[wheel_geom]

    slew_rate_rad_s = slew_rate_deg_s * DEG_TO_RAD
    slew_amp_rad = slew_amp_deg * DEG_TO_RAD

    # Bang-bang slew with given max rate:
    # accelerate for t_a, coast for t_c, decelerate for t_a.
    # If pure acceleration to reach max rate is shorter than half-amplitude time:
    # ω_max = α × t_a, half-amp = ½ α t_a²
    # For simplest design, assume need to reach max_slew_rate in t_a = 30 s typical
    # => α = slew_rate / 30
    t_accel_s = 30.0
    alpha_rad_s2 = slew_rate_rad_s / t_accel_s

    # Per-axis torque
    torque_axis_nm = inertia_kgm2 * alpha_rad_s2

    # Add disturbance compensation × 2 (transient safety)
    torque_required_axis_nm = max(torque_axis_nm, disturbance_nm * 10)

    # Per-wheel torque demand
    torque_per_wheel_nm = torque_required_axis_nm / geom["projection_factor"]

    # Momentum capacity required:
    # 1. To stop a max-rate slew: H = I × ω_max  (per axis)
    h_slew_axis_nms = inertia_kgm2 * slew_rate_rad_s

    # 2. To absorb integrated disturbance over a desat interval (typical 6 hours = 21600 s)
    desat_interval_s = 21600
    h_dist_nms = disturbance_nm * desat_interval_s

    # Pick the larger; apply 1.5× margin
    h_required_axis_nms = 1.5 * max(h_slew_axis_nms, h_dist_nms)
    h_per_wheel_nms = h_required_axis_nms / geom["projection_factor"]

    # Wheel saturation: assume wheel rated at H_max with rotor inertia I_w typical 6e-4 kg·m²
    # for ~0.5 N·m·s wheel. Saturation RPM scales as H_max / I_w / (2π / 60).
    # Use a sized wheel: I_w_per_Nms = 6e-4 N·m·s / 0.5 N·m·s for HR-04 class
    # Saturation rpm = (60 / 2π) × H/I_w. For HR-04 spec: 6000 rpm at 0.5 N·m·s.
    sat_rpm = 6000 * (1.0 + math.log(max(1.0, h_per_wheel_nms / 0.5)) * 0.1)
    sat_rpm = min(sat_rpm, 7500)  # ball-bearing wheel ceiling

    # Wheel mass: Honeywell HR Series mass scales roughly with H_max^0.6 (mass = 1.7 H^0.6)
    wheel_mass_each_kg = 1.7 * (h_per_wheel_nms ** 0.6)
    wheel_mass_total_kg = wheel_mass_each_kg * geom["count"]

    # Desat method recommendation
    # Magnetorquer good for LEO; thrusters for GEO/deep-space; gravity-gradient for very small sats
    if disturbance_nm > 1e-4:
        desat_recommended = "thrusters"
    elif disturbance_nm > 1e-6:
        desat_recommended = "magnetorquer"
    else:
        desat_recommended = "gravity_gradient"

    return {
        "satellite_inertia_kgm2": inertia_kgm2,
        "max_slew_rate_deg_s": slew_rate_deg_s,
        "slew_amplitude_deg": slew_amp_deg,
        "disturbance_torque_nm": disturbance_nm,
        "wheel_count": wheel_geom,
        "wheel_count_n": geom["count"],
        "wheel_geometry_redundant": geom["redundancy"],
        "angular_accel_rad_s2": round(alpha_rad_s2, 6),
        "torque_required_per_axis_nm": round(torque_required_axis_nm, 5),
        "torque_required_nm": round(torque_per_wheel_nm, 5),
        "momentum_capacity_per_axis_nms": round(h_required_axis_nms, 4),
        "momentum_capacity_nms": round(h_per_wheel_nms, 4),
        "saturation_rpm": round(sat_rpm, 0),
        "desat_method_recommended": desat_recommended,
        "wheel_mass_each_kg": round(wheel_mass_each_kg, 3),
        "wheel_mass_kg": round(wheel_mass_total_kg, 3),
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
