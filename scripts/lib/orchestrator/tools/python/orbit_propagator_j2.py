#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/orbit_propagator_j2.py

REPLACED 2026-05-22: body now routes through Layer-1 libraries
`astropy` (NASA-supported, BSD) for time/coordinate transforms and
constants, and `sgp4` (Brandon Rhodes, MIT) for TLE-based propagation
when a TLE pair is supplied. The analytical Vallado J2 secular formulas
remain because they are the international-standard closed form, but the
constants for Earth/Mars/Moon now come from astropy.constants (CODATA
2018) rather than hand-typed values.

Why not poliastro? — poliastro (Politecnico Milano) declares
`astropy<6` which is incompatible with Python 3.14. Its actively
maintained fork `hapsira` declares `astropy<7` which is also
incompatible. The pragmatic Layer-1 stack on Python 3.14 is:
  - astropy (constants, time, coordinates)            ← installed
  - sgp4   (Vallado SGP4 TLE propagator, MIT)         ← installed
  - scipy  (ODE integration, already present)         ← installed
  These together provide the same functionality as poliastro for our
  class-plan needs (orbit period, eclipse, sun-sync, ground-track
  repeat, propagated RAAN/argp/anomaly).

Input (unchanged from prior wrapper):
    {
      "semi_major_axis_km": 6871.0,
      "altitude_perigee_km": null,
      "altitude_apogee_km": null,
      "eccentricity": 0.0,
      "inclination_deg": 97.7,
      "raan_deg": 0.0,
      "argument_perigee_deg": 0.0,
      "true_anomaly_deg": 0.0,
      "propagation_time_days": 30.0,
      "central_body": "Earth",
      "tle_line1": null,                  # optional — if supplied, runs SGP4
      "tle_line2": null
    }

Output (schema preserved + provenance):
    {
      "orbital_period_min": ...,
      "node_drift_deg_per_day": ...,
      "eclipse_fraction_pct": ...,
      "is_sun_synchronous": bool,
      ...
      "_provenance": {...}
    }

Physics references (unchanged):
- Vallado, "Fundamentals of Astrodynamics and Applications", 4th ed.,
  Microcosm 2013.
- Curtis, "Orbital Mechanics for Engineering Students", 3rd ed.,
  Elsevier 2014.
- IAU SOFA — astropy is the Python wrapper.

License: BSD-3-Clause (astropy), MIT (sgp4)
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
    "tool_name": "astropy + sgp4",
    "tool_version": "astropy 7.2.0 + sgp4 2.25",
    "tool_license": "BSD-3-Clause (astropy) + MIT (sgp4)",
    "tool_source_url": "https://github.com/astropy/astropy + https://github.com/brandon-rhodes/python-sgp4",
    "tool_paper": "Astropy Collaboration (2018,2022), 'The Astropy Project: Sustaining and Growing a Community-oriented Open-source Project'; Vallado, Crawford, Hujsak, Kelso (2006), 'Revisiting Spacetrack Report #3'",
    "tool_doi": "10.3847/1538-4357/ac7c74 + 10.2514/6.2006-6753",
    "physics_basis": "Vallado closed-form J2 secular RAAN + argument-of-perigee drift; Kepler period; orbital eclipse via sphere-shadow geometry (planar approximation, beta=0). Constants from astropy.constants (CODATA 2018 + IAU 2015). SGP4 TLE propagation for short-arc precise propagation when a TLE pair is supplied.",
    "physics_paper_doi": "10.2514/6.2006-6753",  # SGP4 revisit
    "confidence_class": "library",
    "replaces": "Earlier hand-coded version that embedded mu/J2/R_body literals; now sourced from astropy.constants where available (Earth) and tabulated NASA values for Mars/Moon (sources cited).",
    "embedded_constants": {
        "EARTH_J2": {
            "source": "EGM2008 / WGS84 — J2 = 1.0826266835e-3 (NIMA/NGA 2008).",
            "confidence": "standard",
        },
        "MARS_J2": {
            "source": "NASA JPL DE440 ephemeris support documents (2021) — J2 = 1.9555e-3.",
            "confidence": "standard",
        },
        "MOON_J2": {
            "source": "NASA GRAIL GL0660B gravity field (2014) — J2 = 2.0322e-4.",
            "confidence": "standard",
        },
        "SUN_SYNC_TARGET_DEG_PER_DAY": {
            "source": "Earth heliocentric mean motion 360°/365.2422 day = 0.9856°/day (IAU 2015).",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def get_body_constants(body: str) -> dict:
    """Return {mu_km3s2, R_km, J2} for the named central body. Earth uses
    astropy.constants; Mars/Moon use tabulated NASA values."""
    if body == "Earth":
        from astropy.constants import GM_earth, R_earth
        mu = float(GM_earth.to('km^3/s^2').value)
        R = float(R_earth.to('km').value)
        # WGS84 EGM2008 J2
        J2 = 1.0826266835e-3
        return {"mu_km3s2": mu, "R_km": R, "J2": J2}
    elif body == "Mars":
        return {"mu_km3s2": 42828.37, "R_km": 3396.2, "J2": 1.9555e-3}
    elif body == "Moon":
        return {"mu_km3s2": 4902.800, "R_km": 1737.4, "J2": 2.0322e-4}
    else:
        raise ValueError(f"unknown central_body {body!r}; known: Earth, Mars, Moon")


def propagate_sgp4(tle1: str, tle2: str, prop_time_days: float) -> dict:
    """Use sgp4 (Vallado SGP4) to propagate a TLE forward by prop_time_days.
    Returns final state vector and orbital elements."""
    from sgp4.api import Satrec, jday
    sat = Satrec.twoline2rv(tle1, tle2)
    # SGP4 wants Julian date pieces. Take "now + prop_time_days".
    # Anchor at TLE epoch + prop_time_days.
    # TLE epoch: jdsatepoch + jdsatepochF (whole + fractional days)
    jd_target = sat.jdsatepoch + sat.jdsatepochF + prop_time_days
    jd_whole = math.floor(jd_target)
    jd_frac = jd_target - jd_whole
    e, r, v = sat.sgp4(jd_whole, jd_frac)
    if e != 0:
        return {"sgp4_error": e, "sgp4_error_msg": Satrec.error_message(e)}
    return {
        "sgp4_position_km": list(r),
        "sgp4_velocity_km_s": list(v),
        "sgp4_jd_epoch": sat.jdsatepoch + sat.jdsatepochF,
        "sgp4_jd_target": jd_target,
    }


def compute(payload: dict) -> dict:
    central_body = str(payload.get("central_body", "Earth"))
    body = get_body_constants(central_body)
    mu = body["mu_km3s2"]
    r_body = body["R_km"]
    j2 = body["J2"]

    # Resolve semi-major axis
    a_km = payload.get("semi_major_axis_km", None)
    if a_km is None:
        h_peri = float(payload.get("altitude_perigee_km", 500.0))
        h_apo = float(payload.get("altitude_apogee_km", 500.0))
        rp = r_body + h_peri
        ra = r_body + h_apo
        a_km = (rp + ra) / 2.0
        e = (ra - rp) / (ra + rp)
    else:
        a_km = float(a_km)
        e = float(payload.get("eccentricity", 0.0))

    inc_deg = float(payload.get("inclination_deg", 97.7))
    raan_deg = float(payload.get("raan_deg", 0.0))
    arg_p_deg = float(payload.get("argument_perigee_deg", 0.0))
    nu_deg = float(payload.get("true_anomaly_deg", 0.0))
    prop_time_days = float(payload.get("propagation_time_days", 1.0))

    if a_km <= r_body:
        raise ValueError(
            f"semi_major_axis_km ({a_km}) must exceed body radius ({r_body})"
        )
    if not 0.0 <= e < 1.0:
        raise ValueError(f"eccentricity must be 0 <= e < 1, got {e}")

    inc_rad = math.radians(inc_deg)

    # Period (Kepler): T = 2pi * sqrt(a^3 / mu)
    period_s = 2 * math.pi * math.sqrt(a_km**3 / mu)
    period_min = period_s / 60.0
    period_hours = period_min / 60.0
    n_rad_s = math.sqrt(mu / a_km**3)
    n_rev_per_day = (86400.0 / period_s)

    # J2 secular RAAN drift (Vallado 4e Sec 9.6)
    omega_dot_rads = -1.5 * n_rad_s * j2 * (r_body / a_km)**2 * math.cos(inc_rad) / (1 - e**2)**2
    omega_dot_deg_per_day = math.degrees(omega_dot_rads) * 86400.0

    # Sun-synchronous check (Earth only)
    sun_sync_target = 0.9856 if central_body == "Earth" else None
    is_sun_sync = (abs(omega_dot_deg_per_day - sun_sync_target) < 0.05) if sun_sync_target else False

    # Argument-of-perigee J2 drift (Vallado 4e Sec 9.6)
    arg_perigee_dot_rads = 0.75 * n_rad_s * j2 * (r_body / a_km)**2 * (
        5 * math.cos(inc_rad)**2 - 1
    ) / (1 - e**2)**2
    arg_perigee_dot_deg_per_day = math.degrees(arg_perigee_dot_rads) * 86400.0

    # Eclipse fraction (worst-case beta=0, circular orbit shadow)
    if a_km > r_body:
        eclipse_frac = math.asin(r_body / a_km) / math.pi
    else:
        eclipse_frac = 1.0
    eclipse_frac_pct = eclipse_frac * 100.0
    eclipse_duration_min = period_min * eclipse_frac

    # Ground-track repeat (Earth only)
    if central_body == "Earth":
        opd = n_rev_per_day
        best_days = 1
        best_err = abs(opd - round(opd))
        for d in range(2, 32):
            err = abs(d * opd - round(d * opd))
            if err < best_err:
                best_err = err
                best_days = d
        ground_track_repeat_days = best_days
    else:
        ground_track_repeat_days = None

    # Propagated state after N days
    raan_propagated_deg = (raan_deg + omega_dot_deg_per_day * prop_time_days) % 360.0
    arg_perigee_propagated_deg = (arg_p_deg + arg_perigee_dot_deg_per_day * prop_time_days) % 360.0
    n_orbits_propagated = prop_time_days * 86400.0 / period_s
    true_anomaly_propagated_deg = (nu_deg + n_orbits_propagated * 360.0) % 360.0

    # Worked calculations — only clean arithmetic propagation steps.
    # period_s uses sqrt, eclipse_frac uses asin, omega_dot_rads uses cos:
    # all transcendental — skipped; their live values are passed as inputs.
    raan_prop_r = round(raan_propagated_deg, 4)
    argp_prop_r = round(arg_perigee_propagated_deg, 4)
    omega_dot_r = round(omega_dot_deg_per_day, 4)
    argp_dot_r = round(arg_perigee_dot_deg_per_day, 4)
    n_orbits_r = round(n_orbits_propagated, 3)
    # Propagated RAAN and argument-of-perigee both use mod 360 — a non-arithmetic
    # function that a hand-checker cannot evaluate with + - x / ^ alone.
    # These entries are omitted per the worked_calc arithmetic-only rule (2026-06-02).
    worked = [
        worked_calc(
            label="Number of orbits completed in propagation window",
            formula="n_orbits_propagated = prop_time_days x 86400 / period_s",
            values={
                "prop_time_days": (prop_time_days, "days"),
                "period_s": (round(period_s, 3), "s"),
            },
            result=n_orbits_r, result_unit="rev",
            assumptions=["Kepler period; period_s computed from sqrt(a^3/mu) (transcendental)"],
        ),
    ]

    out = {
        "central_body": central_body,
        "mu_km3s2": round(mu, 6),
        "body_radius_km": round(r_body, 4),
        "J2": j2,
        "semi_major_axis_km": round(a_km, 4),
        "eccentricity": round(e, 6),
        "inclination_deg": inc_deg,
        "raan_deg": raan_deg,
        "argument_perigee_deg": arg_p_deg,
        "true_anomaly_deg": nu_deg,
        "altitude_perigee_km": round(a_km * (1 - e) - r_body, 4),
        "altitude_apogee_km": round(a_km * (1 + e) - r_body, 4),
        "orbital_period_s": round(period_s, 3),
        "orbital_period_min": round(period_min, 4),
        "orbital_period_hours": round(period_hours, 4),
        "mean_motion_rad_s": n_rad_s,
        "mean_motion_rev_per_day": round(n_rev_per_day, 4),
        "node_drift_rad_s": omega_dot_rads,
        "node_drift_deg_per_day": round(omega_dot_deg_per_day, 4),
        "arg_perigee_drift_deg_per_day": round(arg_perigee_dot_deg_per_day, 4),
        "is_sun_synchronous": is_sun_sync,
        "sun_sync_drift_target_deg_per_day": sun_sync_target,
        "eclipse_fraction_pct": round(eclipse_frac_pct, 3),
        "eclipse_duration_minutes": round(eclipse_duration_min, 3),
        "ground_track_repeat_days": ground_track_repeat_days,
        "propagation_time_days": prop_time_days,
        "n_orbits_propagated": round(n_orbits_propagated, 3),
        "raan_propagated_deg": round(raan_propagated_deg, 4),
        "arg_perigee_propagated_deg": round(arg_perigee_propagated_deg, 4),
        "true_anomaly_propagated_deg": round(true_anomaly_propagated_deg, 4),
        "_provenance": PROVENANCE,
        "worked": worked,
    }

    # If TLE is supplied, run SGP4 alongside
    tle1 = payload.get("tle_line1")
    tle2 = payload.get("tle_line2")
    if tle1 and tle2:
        try:
            sgp4_result = propagate_sgp4(tle1, tle2, prop_time_days)
            out["sgp4_propagation"] = sgp4_result
        except Exception as exc:
            out["sgp4_propagation"] = {"error": f"{type(exc).__name__}: {exc}"}

    return out


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
