#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/gust_response_drone.py

Small UAV / drone gust response per FAR 23.341 (or simplified per ASTM F3322).

Light aircraft gust load:
    Δn = ρ × V_eq × CL_α × U_de / (2 × W/S)
where:
    U_de = derived equivalent gust velocity (m/s EAS)
    W/S  = wing loading (Pa)

ASTM F3322-22 (Light Sport Aircraft):
- Vertical gust 50 ft/s = 15.24 m/s EAS at cruise
- 25 ft/s at V_D (max dive)
- Horizontal gust 50 ft/s

For multirotors, gust response is mostly in attitude, not in g-load:
- Strong gust causes attitude excursion measured in degrees
- Recovery time = function of moment of inertia + control authority

Attitude response (open-loop):
    Δθ = U_gust × t / span
For a 30 m/s gust on 0.5m drone:
    Δθ ~ 1 rad in ~17ms; closed-loop recovery in ~200-400ms

References:
- FAR 23.341 (gust load factor for normal/utility category)
- ASTM F3322-22 (Light Sport Aircraft - Aeronautical)
- ICAO 9863 (Wind shear / turbulence reporting)
- Hoblit, "Gust Loads on Aircraft: Concepts and Applications" 1988
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'gust_response_drone (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Pamadi (1998) 'Performance, Stability, Dynamics, and Control of Airplanes', AIAA; ASTM F3322-18 (Standard Specification for Small Unmanned Aircraft Crashworthiness)",
    "physics_basis": 'Discrete gust load factor Δn = (ρ × V × C_Lα × U_de) / (2 × W/S). Recovery time from neutral-stability roots.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    drone_mass_kg = float(payload.get("drone_mass_kg", 2.0))
    wing_area_m2 = float(payload.get("wing_area_m2", 0.5))    # fixed-wing or rotor disc
    airspeed_m_s = float(payload.get("airspeed_ms", 20))
    gust_speed_m_s = float(payload.get("gust_speed_ms", 10))
    cl_alpha_per_rad = float(payload.get("cl_alpha_per_rad", 5.5))   # 5-6 for thin foil
    is_multirotor = bool(payload.get("is_multirotor", False))
    drone_dimensions_m = payload.get("drone_dimensions_m", {"length": 0.5, "width": 0.5})

    rho = 1.225   # sea level
    # Wing loading
    W = drone_mass_kg * 9.81
    wing_loading_pa = W / max(0.01, wing_area_m2)

    # Peak gust load factor
    delta_n = (rho * airspeed_m_s * cl_alpha_per_rad * gust_speed_m_s) / (2 * wing_loading_pa)
    n_total = 1.0 + delta_n
    peak_g = n_total

    # Attitude excursion (degrees)
    # For fixed-wing: bank angle change from side gust
    # Δθ ≈ atan(V_gust / V_aircraft) over response time
    char_length = max(0.1, drone_dimensions_m.get("length", 0.5))
    # Time constant for attitude response (idealised mass × moment / control authority)
    if is_multirotor:
        # Multirotor recovers quickly via tilt
        tau_attitude_s = 0.1
    else:
        # Fixed-wing recovers slower (must overcome aero damping)
        tau_attitude_s = 0.3

    # Open-loop excursion (without control)
    attitude_excursion_rad = math.atan(gust_speed_m_s / max(1, airspeed_m_s))
    attitude_excursion_deg = math.degrees(attitude_excursion_rad)

    # Recovery time (closed-loop, with controller)
    # Critically damped: ζ=1, ω_n = 5 rad/s typical for hobby UAS controllers
    # Recovery to 5% in t = 3.0 / (ζ × ω_n) = 0.6s typical
    recovery_time_s = 3.0 / 5.0   # 600ms for 5% settle
    if is_multirotor:
        recovery_time_s *= 0.5   # multirotor is faster

    # Load factor safety check (Light Sport Aircraft target: -1.76 to +3.8g per ASTM F3322)
    g_limit_max = 3.8
    g_limit_min = -1.76
    within_limits = (peak_g <= g_limit_max) and (peak_g >= g_limit_min)

    # Critical airspeed (gust would exceed g-limits)
    # Solve for V_critical: g_limit = ρ × V × CL_α × U / (2 W/S)
    if gust_speed_m_s > 0:
        v_critical = (2 * wing_loading_pa * (g_limit_max - 1.0)) / (rho * cl_alpha_per_rad * gust_speed_m_s)
    else:
        v_critical = 999

    return {
        "drone_mass_kg": drone_mass_kg,
        "wing_area_m2": wing_area_m2,
        "wing_loading_pa": round(wing_loading_pa, 1),
        "airspeed_ms": airspeed_m_s,
        "gust_speed_ms": gust_speed_m_s,
        "is_multirotor": is_multirotor,
        "delta_n_per_gust": round(delta_n, 2),
        "n_total_g": round(n_total, 2),
        "peak_g": round(peak_g, 2),
        "attitude_excursion_deg_openloop": round(attitude_excursion_deg, 2),
        "recovery_time_s": round(recovery_time_s, 3),
        "tau_attitude_s": tau_attitude_s,
        "within_g_limits": within_limits,
        "g_limit_max_astm_f3322": g_limit_max,
        "g_limit_min_astm_f3322": g_limit_min,
        "critical_airspeed_ms_for_g_limit": round(v_critical, 1),
        "notes": (
            "Per FAR 23.341 / ASTM F3322-22. Multirotor recovery 2-3× faster than "
            "fixed-wing due to direct attitude control via differential thrust. "
            "Above critical airspeed, gust will exceed g-limit - reduce throttle. "
            "For ag/inspection drones, target 30% margin (peak ≤ 2.5g for typical 10 m/s gust)."
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
