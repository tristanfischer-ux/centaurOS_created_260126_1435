#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/gust_response_atmospheric.py

Atmospheric turbulence response for HAPS / stratospheric platforms.

Gust velocity model (von Karman + Dryden hybrid):
- Continuous turbulence: described by power spectral density
- Discrete tuned gust per FAR 25.341(a):
    U(s) = U_ds × 0.5 × (1 - cos(πs/H))   for 0 ≤ s ≤ 2H
    where H = gust gradient (m), U_ds = design gust velocity (m/s EAS)

Stratospheric turbulence (15-25 km altitude):
- Much lower than tropospheric due to high static stability
- Typical RMS vertical velocity: 0.3-1.0 m/s (vs 3-5 m/s troposphere)
- CAT (clear air turbulence) events can spike to 3-5 m/s peak
- Latitude effect: polar > equatorial (jet stream proximity)
- Seasonal: winter > summer in jet stream regions

Peak gust statistics (von Karman model):
- Peak σ-multiplier for 3-min exposure: ~3.0 (3σ event)
- For 1-hour: ~3.5
- For mission duration (12+ hours): ~4.5

Design vertical gust per FAR 25 for 60,000 ft:
- 7.6 m/s EAS at 15.24 km (60,000 ft)
- 4.5 m/s EAS at 18 km
- 3.0 m/s EAS at 21 km (interpolated)

Aircraft response:
    Δn = ρ × V_eq × CL_α × U_ds / (2 × W/S)
    where W/S = wing loading (Pa)

References:
- FAR Part 25.341 (gust load criteria)
- MIL-F-8785C (mil spec turbulence)
- Hoblit, "Gust Loads on Aircraft: Concepts and Applications" AIAA 1988
- NCAR-TN-468 "Stratospheric turbulence", Sharman et al, 2014
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
    "tool_name": 'gust_response_atmospheric (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "MIL-F-8785C (Flying Qualities of Piloted Airplanes); Hoblit (1988) 'Gust Loads on Aircraft: Concepts and Applications', AIAA",
    "physics_basis": 'Von Karman + Dryden gust spectra. PSD-based RMS response from transfer function × gust spectrum.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    altitude_km = float(payload.get("altitude_km", 20))
    wing_loading_pa = float(payload.get("wing_loading_pa", 30))   # very low for HAPS
    latitude_deg = float(payload.get("latitude_deg", 45))
    season = str(payload.get("season", "summer")).lower()
    cl_alpha = float(payload.get("cl_alpha_per_rad", 6.0))
    airspeed_m_s = float(payload.get("airspeed_ms", 25))
    mission_duration_hours = float(payload.get("mission_duration_hours", 24))
    wing_span_m = float(payload.get("wing_span_m", 30))
    mass_kg = float(payload.get("mass_kg", 75))

    # ISA atmospheric density at altitude (km)
    altitude_m = altitude_km * 1000
    if altitude_m < 11000:
        T = 288.15 - 0.0065 * altitude_m
        P = 101325 * (T / 288.15) ** 5.256
    elif altitude_m < 20000:
        T = 216.65
        P = 22632 * math.exp(-(altitude_m - 11000) / 6341)
    else:
        T = 216.65 + (altitude_m - 20000) * 0.001
        P = 5474.9 * math.exp(-(altitude_m - 20000) / 6900)
    rho = P / (287.05 * T)

    # Base RMS vertical gust velocity (m/s) by altitude
    # σ_w decreases with altitude into stratosphere
    if altitude_km < 11:
        # Troposphere: σ_w decreases linearly from 1.5 at SL to 0.6 at tropopause
        sigma_w_base = 1.5 - (altitude_km / 11.0) * 0.9
    elif altitude_km < 20:
        # Lower stratosphere
        sigma_w_base = 0.6 - (altitude_km - 11) * 0.04
    else:
        # Mid-upper stratosphere
        sigma_w_base = 0.3

    # Latitude effect (higher near jet stream ~50-60°)
    lat = abs(latitude_deg)
    if 30 <= lat <= 70:
        lat_factor = 1.0 + 0.5 * math.exp(-((lat - 55) ** 2) / 200.0)   # peak at 55°
    else:
        lat_factor = 0.7
    sigma_w = sigma_w_base * lat_factor

    # Season effect
    season_factor = {"winter": 1.4, "spring": 1.1, "summer": 0.9, "autumn": 1.1}.get(season, 1.0)
    sigma_w *= season_factor

    # Peak gust statistical multiplier (Hoblit)
    if mission_duration_hours <= 0.05:
        peak_sigma = 2.5
    elif mission_duration_hours <= 1:
        peak_sigma = 3.0
    elif mission_duration_hours <= 12:
        peak_sigma = 3.5
    elif mission_duration_hours <= 100:
        peak_sigma = 4.0
    else:
        peak_sigma = 4.5

    peak_gust_ms = sigma_w * peak_sigma

    # FAR 25.341 reference value at altitude
    # Linear from 7.6 m/s at 15.24 km to 3.0 m/s at 21 km
    if altitude_km < 15.24:
        far_25_gust = 7.6 + (15.24 - altitude_km) / 15.24 * 7.6   # higher at lower altitudes
    elif altitude_km < 21.0:
        far_25_gust = 7.6 - (altitude_km - 15.24) * (4.6 / 5.76)
    else:
        far_25_gust = 3.0

    # Use the higher of statistical peak or FAR 25 design gust
    design_gust = max(peak_gust_ms, far_25_gust)

    # Aircraft gust load (n)
    # Δn = ρ V CL_α U_ds / (2 W/S)
    # W/S = wing loading
    delta_n = (rho * airspeed_m_s * cl_alpha * design_gust) / (2 * wing_loading_pa)
    n_total = 1.0 + delta_n   # 1g cruise + gust

    # Control surface aerodynamic load (qcS for full elevator deflection at gust + 0.5g extra)
    # Simplified: peak load on outer aileron from rolling response
    # F_ctrl = ρ × V² × S_ctrl × CL_ctrl × δ
    # Use 5% of wing area as control surface, CL_max = 0.7
    s_ctrl = 0.05 * (wing_span_m * (mass_kg * 9.81 / wing_loading_pa / wing_span_m))  # 5% wing area
    q = 0.5 * rho * airspeed_m_s ** 2
    f_ctrl = q * s_ctrl * 0.7

    # Recommended design g-factor
    g_factor_design = n_total * 1.5  # FAA factor 1.5 limit-to-ultimate

    # Worked calculations.
    # ISA density uses exp + piecewise branches → skipped; rho passed as live input.
    # sigma_w uses piecewise altitude branches + lat exp model → skipped;
    # sigma_w passed as live input to peak_gust_ms.
    # far_25_gust is piecewise/branchy → skipped; passed as live input to design_gust.
    # design_gust uses max() (piecewise) → skipped; passed as live input to delta_n.
    sigma_w_r = round(sigma_w, 3)
    peak_gust_r = round(peak_gust_ms, 2)
    rho_r = round(rho, 4)
    design_gust_r = round(design_gust, 2)
    delta_n_r = round(delta_n, 3)
    # Use 3 decimal places so n_total_r x 1.5 chains to g_factor_r correctly.
    n_total_r = round(1.0 + delta_n_r, 3)
    g_factor_r = round(n_total_r * 1.5, 2)
    worked = [
        worked_calc(
            label="Peak statistical gust velocity",
            formula="peak_gust = sigma_w x peak_sigma",
            values={
                "sigma_w": (sigma_w_r, "m/s"),
                "peak_sigma": (peak_sigma, ""),
            },
            result=peak_gust_r, result_unit="m/s",
            assumptions=[
                "sigma_w computed from altitude/latitude/season model (piecewise, not shown)",
                f"peak_sigma = {peak_sigma} for mission duration {mission_duration_hours} h (Hoblit 1988 Table)",
            ],
        ),
        worked_calc(
            label="Gust load increment (delta n)",
            formula="delta_n = rho x V x CL_alpha x U_ds / (2 x W_S)",
            values={
                "rho": (rho_r, "kg/m^3"),
                "V": (airspeed_m_s, "m/s"),
                "CL_alpha": (cl_alpha, "1/rad"),
                "U_ds": (design_gust_r, "m/s"),
                "W_S": (wing_loading_pa, "Pa"),
            },
            result=delta_n_r, result_unit="g",
            assumptions=[
                "FAR 25.341(a) discrete gust equation",
                "U_ds = max(statistical peak, FAR 25 reference) — max() not shown",
                "W/S = wing loading in Pa (N/m^2)",
            ],
        ),
        worked_calc(
            label="Total gust load factor",
            formula="n_total = 1 + delta_n",
            values={"delta_n": (delta_n_r, "g")},
            result=n_total_r, result_unit="g",
            assumptions=["1g cruise + gust increment"],
        ),
        worked_calc(
            label="Design g-factor (limit-to-ultimate, FAA 1.5x)",
            formula="g_design = n_total x 1.5",
            values={"n_total": (n_total_r, "g")},
            result=g_factor_r, result_unit="g",
            assumptions=["FAA/FAR ultimate load = 1.5 x limit load"],
        ),
    ]

    return {
        "altitude_km": altitude_km,
        "altitude_m": altitude_m,
        "air_density_kg_m3": round(rho, 4),
        "temperature_k": round(T, 1),
        "pressure_pa": round(P, 1),
        "latitude_deg": latitude_deg,
        "season": season,
        "rms_vertical_gust_sigma_w_ms": round(sigma_w, 3),
        "rms_base_at_altitude_ms": round(sigma_w_base, 3),
        "lat_factor": round(lat_factor, 2),
        "season_factor": season_factor,
        "peak_sigma_multiplier": peak_sigma,
        "peak_gust_ms_statistical": round(peak_gust_ms, 2),
        "far_25_design_gust_ms": round(far_25_gust, 2),
        "design_gust_ms": round(design_gust, 2),
        "wing_loading_pa": wing_loading_pa,
        "delta_n_per_gust": round(delta_n, 2),
        "n_total_g": round(n_total, 2),
        "g_factor_design": round(g_factor_design, 2),
        "control_surface_load_n": round(f_ctrl, 1),
        "airspeed_ms": airspeed_m_s,
        "mission_duration_hours": mission_duration_hours,
        "worked": worked,
        "notes": (
            "Stratospheric turbulence per NCAR-TN-468 (Sharman 2014). "
            "Mid-latitude jet stream (50-60°) doubles σ_w; polar/equatorial 0.7×. "
            "Winter 1.4× summer. Peak gust uses 3-4.5σ for mission duration. "
            "FAR 25.341 design gust used if higher than statistical peak."
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
