#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/air_breathing_ep.py

Air-breathing electric propulsion for VLEO operations.
Models intake collection, ionization and thrust at 160-250 km altitude.

Companies served: NewOrbit Space (UK?), Kreios (FR/CH?), ThrustMe variant,
ESA GOCE follow-on partners.

Input:
    {
      "altitude_km": 180.0,
      "satellite_cross_section_m2": 0.3,
      "intake_efficiency": 0.4,
      "ionization_efficiency": 0.6,
      "specific_power_w_kg_m_s": 0.05
    }

Output:
    thrust_n, propellant_mass_flow_g_s_collected, drag_compensation_margin,
    isp_s, power_w, _provenance.

Physics:
  Atmospheric density at altitude (NRLMSISE-00):
    rho(180 km) ~ 2.7e-10 kg/m^3 (avg solar)
  Mass collected: m_dot_in = rho * v * A_intake * eta_intake
  Thrust: F = m_dot * v_exit (electric prop)

References:
- Pekker, L., Keidar, M., "Analysis of Airbreathing Hall-Effect Thrusters",
  J. Propul. Power 28(6):1399-1405, 2012.
- Bock, D., Romano, F., Brüggemann, A., "Theoretical assessment of
  electromagnetic propellant collection of air-breathing electric
  propulsion", IEPC 2017-009.
- NRLMSISE-00 atmospheric model (Picone et al. 2002, J. Geophys. Res. 107(A12)).
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
    "tool_name": "air_breathing_ep (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Pekker & Keidar (2012) J. Propul. Power 28(6):1399 "
        "DOI:10.2514/1.B34532; "
        "Bock et al. (2017) IEPC 2017-009; "
        "Picone et al. (2002) J. Geophys. Res. 107(A12) NRLMSISE-00 "
        "DOI:10.1029/2002JA009430."
    ),
    "physics_basis": (
        "VLEO atmospheric density from NRLMSISE-00 (interpolated). "
        "Mass collected: m_dot = rho * v_orbital * A_intake * eta_intake. "
        "Hall-effect thrust from accelerated ionized atmosphere."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "NRLMSISE_LEO_DENSITY": {
            "source": "NRLMSISE-00 mean solar activity F10.7=150; 160 km: 7e-10, 180 km: 2.7e-10, "
                      "200 km: 1.2e-10, 250 km: 1.5e-11, 300 km: 2.7e-12",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# NRLMSISE-00 atmospheric density (kg/m^3) at average solar conditions
# F10.7 = 150 (moderate solar)
DENSITY_BY_ALTITUDE_KM = {
    140: 2.3e-9,
    160: 7.0e-10,
    180: 2.7e-10,
    200: 1.2e-10,
    220: 5.5e-11,
    250: 1.5e-11,
    300: 2.7e-12,
    400: 3.9e-13,
    500: 1.0e-13,
}

GM_EARTH = 3.986004418e14
R_EARTH_KM = 6378.137


def atm_density_at_altitude(h_km: float) -> float:
    """Log-linear interpolation of NRLMSISE-00 tables."""
    keys = sorted(DENSITY_BY_ALTITUDE_KM.keys())
    if h_km <= keys[0]:
        return DENSITY_BY_ALTITUDE_KM[keys[0]]
    if h_km >= keys[-1]:
        return DENSITY_BY_ALTITUDE_KM[keys[-1]]
    for i in range(len(keys) - 1):
        if keys[i] <= h_km <= keys[i + 1]:
            r_lo = DENSITY_BY_ALTITUDE_KM[keys[i]]
            r_hi = DENSITY_BY_ALTITUDE_KM[keys[i + 1]]
            t = (h_km - keys[i]) / (keys[i + 1] - keys[i])
            log_r = math.log(r_lo) + t * (math.log(r_hi) - math.log(r_lo))
            return math.exp(log_r)
    return DENSITY_BY_ALTITUDE_KM[keys[0]]


def compute(payload: dict) -> dict:
    alt_km = float(payload.get("altitude_km", 180.0))
    A_cross = float(payload.get("satellite_cross_section_m2", 0.3))
    eta_intake = float(payload.get("intake_efficiency", 0.4))
    eta_ion = float(payload.get("ionization_efficiency", 0.6))
    available_power_w = float(payload.get("available_power_w", 200.0))
    isp_target_s = float(payload.get("target_isp_s", 3500.0))

    # Atmospheric density
    rho_kg_m3 = atm_density_at_altitude(alt_km)

    # Orbital velocity
    R_sat_m = (R_EARTH_KM + alt_km) * 1000.0
    v_orbital_m_s = math.sqrt(GM_EARTH / R_sat_m)

    # Drag force on satellite
    Cd = 2.2  # aerodynamic drag coefficient in VLEO
    drag_force_n = 0.5 * rho_kg_m3 * (v_orbital_m_s ** 2) * Cd * A_cross

    # Mass collected
    A_intake_m2 = A_cross * eta_intake
    m_dot_in_kg_s = rho_kg_m3 * v_orbital_m_s * A_intake_m2
    m_dot_in_g_s = m_dot_in_kg_s * 1000.0

    # Effective propellant flow (after ionization)
    m_dot_eff_kg_s = m_dot_in_kg_s * eta_ion

    # Exhaust velocity from Isp
    v_exhaust_m_s = isp_target_s * 9.80665

    # Required power: P = 0.5 * m_dot * v_exhaust^2
    # Solve for either thrust or power-limited:
    # Power-limited thrust: F_max = sqrt(2 * P * m_dot)
    thrust_power_limited_n = math.sqrt(2 * available_power_w * m_dot_eff_kg_s)

    # Propellant-limited thrust: F = m_dot * v_exhaust
    thrust_propellant_limited_n = m_dot_eff_kg_s * v_exhaust_m_s

    # Effective thrust = min
    thrust_n = min(thrust_power_limited_n, thrust_propellant_limited_n)

    # Drag-compensation margin
    if drag_force_n > 0:
        drag_compensation = thrust_n / drag_force_n
    else:
        drag_compensation = float("inf")

    # Worked calculations — pure arithmetic steps only.
    # v_orbital uses sqrt(GM/R) (transcendental), so it is passed as a live
    # input.  thrust_power_limited uses sqrt() and is skipped.
    # thrust_n = min(...) is piecewise and skipped; thrust_propellant_limited
    # is the clean step to show.
    rho_r = float(f"{rho_kg_m3:.3e}")
    v_orb_r = round(v_orbital_m_s, 1)
    drag_r = round(drag_force_n, 6)
    A_in_r = round(A_intake_m2, 3)
    # Derive mdot_in_r from the same rounded inputs so the substitution
    # (rho_r x v_orb_r x A_in_r) evaluates to the stated result.
    mdot_in_r = rho_r * v_orb_r * A_in_r
    # Derive mdot_eff_r from mdot_in_r so the next step is also self-consistent.
    mdot_eff_r = mdot_in_r * eta_ion
    v_ex_r = round(v_exhaust_m_s, 1)
    # Derive thrust_prop_r from mdot_eff_r x v_ex_r so the substitution
    # reproduces the stated result exactly.
    thrust_prop_r = round(mdot_eff_r * v_ex_r, 6)
    worked = [
        worked_calc(
            label="Satellite drag force",
            formula="F_drag = 0.5 x rho x v_orb^2 x Cd x A_cross",
            values={
                "rho": (rho_r, "kg/m^3"),
                "v_orb": (v_orb_r, "m/s"),
                "Cd": (Cd, ""),
                "A_cross": (A_cross, "m^2"),
            },
            result=drag_r, result_unit="N",
            assumptions=[
                "Cd = 2.2 (flat-plate VLEO free-molecular regime; Pekker & Keidar 2012)",
                "v_orbital from sqrt(GM/R_sat) — not hand-checkable; passed as live input",
            ],
        ),
        worked_calc(
            label="Intake collection area",
            formula="A_intake = A_cross x eta_intake",
            values={
                "A_cross": (A_cross, "m^2"),
                "eta_intake": (eta_intake, ""),
            },
            result=A_in_r, result_unit="m^2",
            assumptions=["intake efficiency = fraction of cross-section that captures atmospheric flux"],
        ),
        worked_calc(
            label="Atmospheric propellant mass collection rate",
            formula="m_dot_in = rho x v_orb x A_intake",
            values={
                "rho": (rho_r, "kg/m^3"),
                "v_orb": (v_orb_r, "m/s"),
                "A_intake": (A_in_r, "m^2"),
            },
            result=mdot_in_r, result_unit="kg/s",
            assumptions=["ram-flux collection; no magnetic scooping correction"],
        ),
        worked_calc(
            label="Effective ionised propellant flow",
            formula="m_dot_eff = m_dot_in_kg_s x eta_ion",
            values={
                "m_dot_in_kg_s": (mdot_in_r, "kg/s"),
                "eta_ion": (eta_ion, ""),
            },
            result=mdot_eff_r, result_unit="kg/s",
            assumptions=["ionization efficiency = fraction of collected gas successfully ionized and accelerated"],
        ),
        worked_calc(
            label="Propellant-limited thrust",
            formula="F_prop = m_dot_eff_kg_s x v_exhaust",
            values={
                "m_dot_eff_kg_s": (mdot_eff_r, "kg/s"),
                "v_exhaust": (v_ex_r, "m/s"),
            },
            result=thrust_prop_r, result_unit="N",
            assumptions=["v_exhaust = Isp x g_0; lower bound on achievable thrust"],
        ),
    ]

    return {
        "altitude_km": alt_km,
        "atmospheric_density_kg_m3": rho_kg_m3,
        "orbital_velocity_km_s": round(v_orbital_m_s / 1000.0, 3),
        "satellite_cross_section_m2": A_cross,
        "drag_coefficient": Cd,
        "drag_force_n": round(drag_force_n, 6),
        "intake_efficiency": eta_intake,
        "ionization_efficiency": eta_ion,
        "intake_area_m2": round(A_intake_m2, 3),
        "propellant_mass_flow_g_s_collected": round(m_dot_in_g_s, 5),
        "effective_propellant_mass_flow_g_s": round(m_dot_eff_kg_s * 1000.0, 5),
        "available_power_w": available_power_w,
        "thrust_propellant_limited_n": round(thrust_propellant_limited_n, 6),
        "thrust_power_limited_n": round(thrust_power_limited_n, 6),
        "thrust_n": round(thrust_n, 6),
        "thrust_mn": round(thrust_n * 1000.0, 3),
        "target_isp_s": isp_target_s,
        "drag_compensation_margin": round(drag_compensation, 3) if drag_compensation != float("inf") else None,
        "drag_compensated": drag_compensation >= 1.0,
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
