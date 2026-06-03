#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/conjunction_probability.py

Conjunction probability — probability of collision between two objects at
their predicted closest approach, given position+velocity+covariance.

Companies served: Lumi Space, Foundational Space, Aldoria (FR), Vyoma (DE),
Slingshot Aerospace (US/EU presence), Okapi-Orbits (DE).

Input:
    {
      "position_1_km": [7000, 0, 0],
      "velocity_1_km_s": [0, 7.5, 0],
      "covariance_1_diag_m2": [100, 100, 100],
      "position_2_km": [7000, 0.05, 0.05],
      "velocity_2_km_s": [0, -7.4, 0],
      "covariance_2_diag_m2": [100, 100, 100],
      "time_of_closest_approach_minutes": 0,
      "combined_object_radius_m": 5.0
    }

Output:
    collision_probability, miss_distance_m, relative_velocity_km_s,
    conjunction_severity ('green' | 'yellow' | 'red'), _provenance.

Physics:
  Foster 1992 collision probability:
    P_c = (1 / (2*pi*sqrt(det C))) * integral exp(-0.5 * r^T * C^-1 * r) dA
  Over the encounter region (2D area perpendicular to relative velocity).

References:
- Foster, J.L., "A parametric analysis of orbital debris collision probability
  and maneuver rate for space vehicles", NASA JSC-25898, 1992.
- Chan, K., "Spacecraft Collision Probability", AIAA 2008.
- Klinkrad, H., "Space Debris: Models and Risk Analysis", Springer 2006, ch.6.
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
    "tool_name": "conjunction_probability (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Foster (1992) NASA JSC-25898 'A parametric analysis of orbital debris "
        "collision probability and maneuver rate for space vehicles'; "
        "Chan (2008) 'Spacecraft Collision Probability' AIAA; "
        "Klinkrad (2006) 'Space Debris: Models and Risk Analysis' Springer ch.6."
    ),
    "physics_basis": (
        "Foster 1992 2D Gaussian collision-probability integral over the "
        "encounter plane perpendicular to relative velocity. Combined "
        "covariance = C_1 + C_2 projected to plane. Hardbody radius is "
        "the encounter sphere."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "SEVERITY_THRESHOLDS": {
            "source": "ISO 24113:2019 + ESA SDO operational thresholds — "
                      "green < 1e-7, yellow 1e-7..1e-4, red > 1e-4",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def _vec_subtract(a, b):
    return [a[i] - b[i] for i in range(3)]


def _vec_norm(a):
    return math.sqrt(sum(x ** 2 for x in a))


def _vec_dot(a, b):
    return sum(a[i] * b[i] for i in range(3))


def compute(payload: dict) -> dict:
    pos1 = payload.get("position_1_km", [7000, 0, 0])
    vel1 = payload.get("velocity_1_km_s", [0, 7.5, 0])
    cov1 = payload.get("covariance_1_diag_m2", [100, 100, 100])
    pos2 = payload.get("position_2_km", [7000, 0.05, 0.05])
    vel2 = payload.get("velocity_2_km_s", [0, -7.4, 0])
    cov2 = payload.get("covariance_2_diag_m2", [100, 100, 100])
    radius_m = float(payload.get("combined_object_radius_m", 5.0))
    tca_min = float(payload.get("time_of_closest_approach_minutes", 0.0))

    # Convert to meters
    pos1_m = [p * 1000 for p in pos1]
    pos2_m = [p * 1000 for p in pos2]
    vel1_m = [v * 1000 for v in vel1]
    vel2_m = [v * 1000 for v in vel2]

    # Relative position and velocity at TCA
    r_rel_m = _vec_subtract(pos2_m, pos1_m)
    v_rel_m = _vec_subtract(vel2_m, vel1_m)
    miss_distance_m = _vec_norm(r_rel_m)
    rel_speed_m_s = _vec_norm(v_rel_m)
    rel_speed_km_s = rel_speed_m_s / 1000.0

    # Combined covariance (sum) at TCA
    combined_cov_m2 = [cov1[i] + cov2[i] for i in range(3)]

    # Project to encounter plane (perpendicular to v_rel)
    # Simplification: use trace and project the radial component
    # For aligned axes, take the variances perpendicular to v_rel
    # Approximate by selecting the two smallest variance directions
    if rel_speed_m_s > 0:
        # Unit vector along v_rel
        v_hat = [v_rel_m[i] / rel_speed_m_s for i in range(3)]
        # Project miss distance onto plane perpendicular to v_hat
        r_dot_v = _vec_dot(r_rel_m, v_hat)
        r_perp_m = [r_rel_m[i] - r_dot_v * v_hat[i] for i in range(3)]
        miss_perp_m = _vec_norm(r_perp_m)
        # In-plane variances (subtract v_hat-aligned component from each diag)
        sigma_perp_2 = (combined_cov_m2[0] + combined_cov_m2[1] + combined_cov_m2[2]
                        - sum(v_hat[i] ** 2 * combined_cov_m2[i] for i in range(3))) / 2.0
        # Use symmetric in-plane (each axis ~ half of remainder)
        sigma_x_2 = max(sigma_perp_2, 1.0)
        sigma_y_2 = max(sigma_perp_2, 1.0)
    else:
        miss_perp_m = miss_distance_m
        sigma_x_2 = (combined_cov_m2[0] + combined_cov_m2[1] + combined_cov_m2[2]) / 3.0
        sigma_y_2 = sigma_x_2

    # Collision probability (Foster 1992 / Patera 2001 — circular hardbody approximation)
    # P_c ~ exp(-rho^2/2) - exp(-(rho+R)^2/2) integrated over hardbody area
    # For 2D circular Gaussian: P_c = (R^2 / (2*sigma_perp^2)) * exp(-rho^2/(2*sigma_perp^2))
    # if R << sigma; or use full integral
    sigma_perp = math.sqrt(sigma_x_2 * sigma_y_2)
    if sigma_perp > 0:
        u = miss_perp_m / sigma_perp
        # Small-radius approximation:
        if radius_m < sigma_perp / 3.0:
            p_c = (radius_m ** 2 / (2.0 * sigma_x_2)) * math.exp(-u ** 2 / 2.0)
        else:
            # Larger radius — use full integral approximation (1D Gaussian × disc)
            # Patera approximation (1/(2pi sigma_x sigma_y)) * exp(-(x-mu_x)^2/(2 sigma_x^2)) ... over disc
            # Simplification: integrate as if radius were small but multiply by enclosed-prob
            n_thetas = 16
            n_rs = 8
            p_c = 0.0
            for ir in range(n_rs):
                r_int = radius_m * (ir + 0.5) / n_rs
                for it in range(n_thetas):
                    theta = 2 * math.pi * it / n_thetas
                    x = miss_perp_m + r_int * math.cos(theta)
                    y = r_int * math.sin(theta)
                    dens = math.exp(-(x ** 2) / (2 * sigma_x_2) - (y ** 2) / (2 * sigma_y_2))
                    dens /= (2 * math.pi * sigma_perp)
                    dA = (radius_m ** 2 / n_rs) * (2 * math.pi / n_thetas) * r_int / radius_m
                    p_c += dens * dA
    else:
        # Zero covariance: deterministic collision if miss < radius
        p_c = 1.0 if miss_perp_m < radius_m else 0.0

    p_c = max(0.0, min(1.0, p_c))

    # Severity
    if p_c > 1e-4:
        severity = "red"
    elif p_c > 1e-7:
        severity = "yellow"
    else:
        severity = "green"

    # Worked calculations (2026-06-03): the Foster 1992 collision-probability
    # integral over the encounter plane is numerical (not hand-checkable), but the
    # two geometric drivers that feed it — the closest-approach miss distance and
    # the relative velocity — are plain Euclidean norms a reviewer can re-check.
    dx_m, dy_m, dz_m = r_rel_m[0], r_rel_m[1], r_rel_m[2]
    dvx, dvy, dvz = vel2[0] - vel1[0], vel2[1] - vel1[1], vel2[2] - vel1[2]
    worked = [
        worked_calc(
            label="Miss distance at closest approach",
            formula="miss_distance = (dx^2 + dy^2 + dz^2)^0.5",
            values={"dx": (round(dx_m, 3), "m"), "dy": (round(dy_m, 3), "m"), "dz": (round(dz_m, 3), "m")},
            result=round(miss_distance_m, 2), result_unit="m",
            assumptions=["relative position vector (object 2 - object 1) at the time of closest approach, converted km -> m"],
        ),
        worked_calc(
            label="Relative velocity",
            formula="rel_velocity = (dvx^2 + dvy^2 + dvz^2)^0.5",
            values={"dvx": (round(dvx, 4), "km/s"), "dvy": (round(dvy, 4), "km/s"), "dvz": (round(dvz, 4), "km/s")},
            result=round(rel_speed_km_s, 3), result_unit="km/s",
            assumptions=["relative velocity vector (object 2 - object 1) magnitude"],
        ),
    ]

    return {
        "position_1_km": pos1,
        "position_2_km": pos2,
        "miss_distance_m": round(miss_distance_m, 2),
        "miss_distance_perp_m": round(miss_perp_m, 2),
        "relative_velocity_km_s": round(rel_speed_km_s, 3),
        "combined_object_radius_m": radius_m,
        "combined_covariance_diag_m2": combined_cov_m2,
        "encounter_plane_sigma_m": round(sigma_perp, 1),
        "collision_probability": p_c,
        "log10_probability": round(math.log10(max(p_c, 1e-30)), 2),
        "conjunction_severity": severity,
        "time_of_closest_approach_minutes": tca_min,
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
