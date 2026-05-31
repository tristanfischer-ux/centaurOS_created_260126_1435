#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/rotor_tilt_transition.py

Tilt-rotor / tilt-wing transition dynamics for eVTOL.

Input:
    {
      "forward_speed_ms": 30.0,
      "tilt_angle_deg": 45.0,
      "mass_kg": 2000.0,
      "num_rotors": 6,
      "disk_area_per_rotor_m2": 2.0,
      "wing_area_m2": 12.0,
      "cl_max": 1.4
    }

Output:
    {
      "lift_force_n": ...,
      "thrust_required_n": ...,
      "transition_corridor_speed_ms": ...,
      "rotor_lift_n": ...,
      "wing_lift_n": ...,
      ...
    }

Physics:
- During transition, total lift = rotor vertical thrust + wing aero lift.
  L = T·cos(tilt) + (1/2)·ρ·V²·S·CL
- Required thrust to maintain altitude: T_v = m·g - L_wing.
- Forward thrust: T_f = T·sin(tilt).
- Transition corridor: V_min such that wing supports w_frac of weight.

References:
- McDonald (2018) "Conceptual design of electric vertical takeoff and
  landing aircraft," PhD thesis, U. Stuttgart.
- NASA TM-2018-219768 "Aerodynamic Investigation of Tiltrotor Conversion
  Corridor."
- Yoo et al. (2017), Vertica J. eVTOL transition analysis.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "rotor_tilt_transition (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "McDonald (2018) PhD U. Stuttgart, NASA TM-2018-219768 Tiltrotor Conversion Corridor",
    "physics_basis": "Force balance during transition: lift = thrust_vertical + wing_lift; momentum theory for hover/forward thrust.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

G = 9.81
RHO_SL = 1.225


def compute(payload: dict) -> dict:
    V = float(payload.get("forward_speed_ms", 30.0))
    tilt_deg = float(payload.get("tilt_angle_deg", 45.0))
    mass = float(payload.get("mass_kg", 2000.0))
    num_rotors = int(payload.get("num_rotors", 6))
    A_disk = float(payload.get("disk_area_per_rotor_m2", 2.0))
    S_wing = float(payload.get("wing_area_m2", 12.0))
    cl_max = float(payload.get("cl_max", 1.4))

    tilt_rad = math.radians(tilt_deg)
    weight_n = mass * G

    # Wing lift contribution at this forward speed
    cl_op = 0.6 * cl_max  # operational CL at transition (margin to stall)
    wing_lift_n = 0.5 * RHO_SL * V * V * S_wing * cl_op
    # Cap wing lift at full weight
    wing_lift_eff = min(wing_lift_n, weight_n)

    # Lift deficit must come from rotor vertical component
    lift_deficit_n = max(0.0, weight_n - wing_lift_eff)
    # Rotor thrust vertical = T·cos(tilt) (0deg=hover, 90deg=cruise)
    cos_t = math.cos(tilt_rad)
    if cos_t < 1e-3:
        thrust_required_n = lift_deficit_n / 1e-3
    else:
        thrust_required_n = lift_deficit_n / cos_t
    forward_thrust_n = thrust_required_n * math.sin(tilt_rad)

    # Power per rotor via momentum theory: P = T^1.5 / sqrt(2·ρ·A)
    t_per_rotor = thrust_required_n / max(1, num_rotors)
    power_per_rotor_w = (t_per_rotor ** 1.5) / math.sqrt(2.0 * RHO_SL * A_disk) if t_per_rotor > 0 else 0.0
    total_power_kw = (power_per_rotor_w * num_rotors) / 1000.0 / 0.75  # 0.75 hover efficiency

    # Transition corridor: speed at which wing supports >50% weight
    # V_50 = sqrt(weight / (rho·S·CL))
    v_50 = math.sqrt(weight_n / (RHO_SL * S_wing * cl_op))
    v_stall = math.sqrt(2 * weight_n / (RHO_SL * S_wing * cl_max))
    transition_corridor_min_ms = v_stall
    transition_corridor_50pct_ms = v_50

    # Corridor width: tilt 0->90 with thrust < installed margin
    installed_thrust_n = weight_n * 1.5  # typical TWR 1.5 in hover
    margin = (installed_thrust_n - thrust_required_n) / installed_thrust_n

    # Failure mode
    feasible = thrust_required_n <= installed_thrust_n and V >= v_stall

    return {
        "forward_speed_ms": V,
        "tilt_angle_deg": tilt_deg,
        "weight_n": round(weight_n, 1),
        "lift_force_n": round(wing_lift_eff + thrust_required_n * cos_t, 1),
        "thrust_required_n": round(thrust_required_n, 1),
        "forward_thrust_n": round(forward_thrust_n, 1),
        "wing_lift_n": round(wing_lift_n, 1),
        "wing_lift_effective_n": round(wing_lift_eff, 1),
        "rotor_lift_n": round(thrust_required_n * cos_t, 1),
        "power_per_rotor_kw": round(power_per_rotor_w / 1000.0, 2),
        "total_power_kw": round(total_power_kw, 2),
        "transition_corridor_stall_speed_ms": round(v_stall, 2),
        "transition_corridor_50pct_lift_ms": round(v_50, 2),
        "thrust_margin_pct": round(margin * 100.0, 1),
        "feasible_at_this_state": feasible,
        "thrust_to_weight_at_transition": round(thrust_required_n / weight_n, 3),
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
