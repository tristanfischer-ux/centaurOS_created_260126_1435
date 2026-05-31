#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/dynamic_walking_zmp.py

Zero Moment Point (ZMP) trajectory + dynamic walking stability.

Input:
    {
      "stride_length_m": 0.6,
      "walking_speed_ms": 1.2,
      "robot_mass_kg": 60.0,
      "foot_size_mm": 250,
      "step_period_s": 0.5,
      "com_height_m": 0.9
    }

Output:
    {
      "zmp_margin_mm": ...,
      "stability": "stable|marginal|fall",
      "control_bandwidth_required_hz": ...,
      ...
    }

Physics (Vukobratovic 1969; Kajita 2003):
- ZMP must remain within support polygon for static-equivalent stability.
- LIPM (Linear Inverted Pendulum): ω_c = sqrt(g / h_com).
- Cart-table model: ZMP = x_com - h_com / g × ẍ_com.
- Foot size = base of support polygon during single-support phase.

References:
- Vukobratovic & Stepanenko (1972) "On the Stability of Anthropomorphic
  Systems," Math. Biosciences 15, 1.
- Kajita et al. (2003) "Biped Walking Pattern Generation by Using Preview
  Control of Zero-Moment Point," IEEE ICRA, 1620.
- Boston Dynamics Atlas / Honda ASIMO ZMP control papers.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "dynamic_walking_zmp (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Vukobratovic & Stepanenko (1972); Kajita et al. (2003) IEEE ICRA 1620",
    "physics_basis": "ZMP must remain in support polygon (foot footprint). LIPM ω_c = sqrt(g/h_com). Cart-table ẍ feedback.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

G = 9.81


def compute(payload: dict) -> dict:
    stride_m = float(payload.get("stride_length_m", 0.6))
    speed_ms = float(payload.get("walking_speed_ms", 1.2))
    mass_kg = float(payload.get("robot_mass_kg", 60.0))
    foot_mm = float(payload.get("foot_size_mm", 250.0))
    step_T_s = float(payload.get("step_period_s", 0.5))
    h_com_m = float(payload.get("com_height_m", 0.9))

    # LIPM natural frequency
    omega_c_rad_s = math.sqrt(G / max(0.01, h_com_m))
    omega_c_hz = omega_c_rad_s / (2 * math.pi)

    # Maximum CoM acceleration before ZMP exits foot
    # Foot extends ±L/2 from heel-to-toe; cart-table gives ZMP shift = ẍ × h/g
    L_foot_m = foot_mm / 1000.0
    a_max_m_s2 = (L_foot_m / 2) * G / h_com_m

    # CoM acceleration during walking
    # Linear approximation: ẍ ≈ stride / T² × 2π² × something
    # More precisely: peak acceleration during single-support
    # For simple sinusoidal: ẍ_max = (2π/T)² × A = ω² × stride/2
    omega_walk_rad_s = (2 * math.pi) / step_T_s
    com_accel_m_s2 = (omega_walk_rad_s ** 2) * (stride_m / 2)

    # ZMP excursion = h × ẍ / g
    zmp_excursion_m = h_com_m * com_accel_m_s2 / G
    zmp_excursion_mm = zmp_excursion_m * 1000.0

    # Margin = (L_foot/2) - zmp_excursion
    zmp_margin_mm = (foot_mm / 2) - zmp_excursion_mm

    if zmp_margin_mm > 30:
        stability = "stable"
    elif zmp_margin_mm > 5:
        stability = "marginal"
    elif zmp_margin_mm > -20:
        stability = "marginal_capture"  # may recover via capture step
    else:
        stability = "fall"

    # Required control bandwidth: must reject disturbances at LIPM frequency × margin
    # Typical: 5× ω_c = 5 × 3.3 Hz = 16.5 Hz for 0.9 m CoM height
    control_bw_hz_required = 5.0 * omega_c_hz

    # Capture region radius (Pratt 2006)
    # r_capture = sqrt(h_com / g) × v_com
    v_com_max = speed_ms * 1.5  # at peak step
    capture_radius_m = math.sqrt(h_com_m / G) * v_com_max
    capture_radius_mm = capture_radius_m * 1000.0

    # Step frequency
    step_freq_hz = 1.0 / step_T_s
    cadence_steps_min = step_freq_hz * 60

    # Power required during walking (rough)
    # P ≈ 0.5 × m × v² × cadence
    power_walking_w = 0.5 * mass_kg * (speed_ms ** 2) * step_freq_hz

    return {
        "stride_length_m": stride_m,
        "walking_speed_ms": speed_ms,
        "robot_mass_kg": mass_kg,
        "foot_size_mm": foot_mm,
        "step_period_s": step_T_s,
        "com_height_m": h_com_m,
        "zmp_excursion_mm": round(zmp_excursion_mm, 1),
        "zmp_margin_mm": round(zmp_margin_mm, 1),
        "stability": stability,
        "lipm_natural_freq_hz": round(omega_c_hz, 2),
        "lipm_natural_omega_rad_s": round(omega_c_rad_s, 2),
        "control_bandwidth_required_hz": round(control_bw_hz_required, 1),
        "com_acceleration_m_s2": round(com_accel_m_s2, 2),
        "max_safe_acceleration_m_s2": round(a_max_m_s2, 2),
        "capture_radius_mm": round(capture_radius_mm, 0),
        "step_frequency_hz": round(step_freq_hz, 2),
        "cadence_steps_per_min": round(cadence_steps_min, 0),
        "walking_power_estimate_w": round(power_walking_w, 0),
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
