#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/sar_antenna_sizing.py

Synthetic Aperture Radar (SAR) antenna sizing — X/L/C/Ka-band.
Computes antenna dimensions, range resolution, azimuth resolution and
swath width for a given satellite SAR mission.

Companies served: ICEYE (FI), Capella Space (DE/EU presence), Lupin SAT
(DE), Synspective (JP/EU), Umbra (US/EU presence), Sateliot, Iceberg.

Input:
    {
      "frequency_ghz": 9.6,           # X-band 9.6, L 1.275, C 5.3, Ka 35
      "peak_power_kw": 1.0,
      "satellite_altitude_km": 500.0,
      "look_angle_deg": 30.0,
      "prf_hz": 1500.0,
      "pulse_duration_us": 30.0,
      "polarization": "VV",
      "incidence_angle_deg": 35.0
    }

Output:
    antenna_length_m, antenna_width_m, range_resolution_m,
    azimuth_resolution_m, swath_width_km, NESZ_dB, _provenance.

Physics:
  Min antenna area:  A_min = 4 * lambda * v * R / c * tan(theta)
    (Tomiyasu 1978 / Curlander Ch.4)
  Range resolution: dR = c / (2 * BW * cos(theta))
  Azimuth resolution:  dAz = L_ant / 2
  PRF constraints (ambiguity): PRF > 2 v / L_az,  PRF < c / (2 * R_swath)

References:
- Curlander, J.C., McDonough, R.N., "Synthetic Aperture Radar: Systems and
  Signal Processing", Wiley 1991, chs. 2-4.
- Skolnik, M.I., "Radar Handbook", 3rd ed., McGraw-Hill 2008.
- Tomiyasu, K., "Tutorial review of synthetic-aperture radar (SAR) with
  applications to imaging of the ocean surface", Proc. IEEE 66(5):
  563-583, 1978. DOI: 10.1109/PROC.1978.10961
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "sar_antenna_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Curlander & McDonough (1991) 'Synthetic Aperture Radar: Systems "
        "and Signal Processing' Wiley, chs. 2-4; "
        "Skolnik (2008) 'Radar Handbook' 3rd ed.; "
        "Tomiyasu (1978) Proc. IEEE 66(5):563 DOI:10.1109/PROC.1978.10961."
    ),
    "physics_basis": (
        "SAR minimum antenna area constraint (Tomiyasu 1978): A >= "
        "4*lambda*v*R*tan(theta_i)/c. Range resolution from chirp BW. "
        "Azimuth resolution = L_antenna/2. PRF ambiguity bracket: "
        "above range-ambiguity / below Doppler-ambiguity."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "RADAR_BANDS": {
            "source": "ITU-R radar frequency allocation; X-band 8-12 GHz, C 4-8 GHz, L 1-2 GHz, Ka 26.5-40 GHz",
            "confidence": "standard",
        },
        "GM_EARTH": {
            "source": "EGM2008 Earth gravitational parameter: 3.986e14 m^3/s^2",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


GM_EARTH = 3.986004418e14
R_EARTH_KM = 6378.137
C_LIGHT = 2.998e8


def compute(payload: dict) -> dict:
    freq_ghz = float(payload.get("frequency_ghz", 9.6))
    peak_power_kw = float(payload.get("peak_power_kw", 1.0))
    altitude_km = float(payload.get("satellite_altitude_km", 500.0))
    look_angle_deg = float(payload.get("look_angle_deg", 30.0))
    prf_hz = float(payload.get("prf_hz", 1500.0))
    pulse_us = float(payload.get("pulse_duration_us", 30.0))
    polarization = str(payload.get("polarization", "VV"))
    incidence_deg = float(payload.get("incidence_angle_deg", 35.0))

    # Wavelength
    lambda_m = C_LIGHT / (freq_ghz * 1e9)

    # Orbital velocity
    R_sat_m = (R_EARTH_KM + altitude_km) * 1000.0
    v_orbital_m_s = math.sqrt(GM_EARTH / R_sat_m)
    # Effective ground velocity (Doppler frequency varies as v * cos)
    v_effective_m_s = v_orbital_m_s * R_EARTH_KM * 1000.0 / R_sat_m  # ground track

    # Slant range
    h_m = altitude_km * 1000.0
    theta_l_rad = math.radians(look_angle_deg)
    # Range to ground from look-angle (approximate spherical earth):
    R_slant_m = h_m / math.cos(theta_l_rad)
    incidence_rad = math.radians(incidence_deg)

    # Minimum antenna area (Tomiyasu 1978)
    A_min_m2 = 4.0 * lambda_m * v_orbital_m_s * R_slant_m * math.tan(incidence_rad) / C_LIGHT

    # Aspect ratio: assume L_az / L_el = 4 (typical SAR)
    aspect_ratio = 4.0
    L_az_m = math.sqrt(A_min_m2 * aspect_ratio)
    L_el_m = A_min_m2 / L_az_m

    # Antenna gain
    g_lin = 4.0 * math.pi * A_min_m2 / (lambda_m ** 2)
    g_db = 10.0 * math.log10(g_lin)

    # Range resolution (signal bandwidth needed for chirp)
    # For 1 m range resolution at 35° incidence: BW = c / (2 * 1 * cos(35)) = 183 MHz
    # We'll back-solve the achievable range resolution from a default chirp BW
    chirp_bw_hz = float(payload.get("chirp_bandwidth_mhz", 100.0)) * 1e6
    dR_range_m = C_LIGHT / (2.0 * chirp_bw_hz * math.cos(incidence_rad))
    # Slant range resolution = c / (2*BW); ground range = slant / sin(incidence)
    dR_slant_m = C_LIGHT / (2.0 * chirp_bw_hz)
    dR_ground_m = dR_slant_m / math.sin(incidence_rad)

    # Azimuth resolution = L_az / 2 (full-aperture SAR)
    dAz_m = L_az_m / 2.0

    # Swath width:
    # Limited by PRF ambiguity: PRF < c / (2 * (R_far - R_near))
    # => Delta_R_max = c / (2 * PRF)
    # Then swath = Delta_R / sin(incidence)
    Delta_R_max_m = C_LIGHT / (2.0 * prf_hz)
    swath_width_km = Delta_R_max_m / math.sin(incidence_rad) / 1000.0

    # Azimuth-direction PRF requirement: PRF > 2 * v / L_az
    prf_min_hz = 2.0 * v_orbital_m_s / L_az_m

    # Noise Equivalent Sigma Zero (NESZ) — SAR sensitivity
    # NESZ = 256 pi^3 R^3 v sin(theta) k T_sys F L / (P_avg G^2 lambda^3 c tau_p)
    # Simplified Skolnik form:
    duty_cycle = pulse_us * 1e-6 * prf_hz
    p_avg_w = peak_power_kw * 1000.0 * duty_cycle
    t_sys_k = 600.0  # X-band typical (atmospheric + receiver noise)
    kB = 1.380649e-23
    noise_figure = 4.0  # dB → linear 2.5
    nf_lin = 10.0 ** (noise_figure / 10.0)
    losses_db = 3.0
    losses_lin = 10.0 ** (losses_db / 10.0)

    # Average power × antenna gain^2 ÷ (4πR^2)^2 × radar cross section sigma
    # NESZ where sigma is the noise-floor RCS per pixel
    # Approximate (Curlander 4.30):
    nesz_lin = (256.0 * math.pi ** 3 * R_slant_m ** 3 * v_orbital_m_s
                * math.sin(incidence_rad) * kB * t_sys_k * nf_lin * losses_lin) / (
                p_avg_w * (g_lin ** 2) * (lambda_m ** 3) * C_LIGHT * (pulse_us * 1e-6))
    nesz_db = 10.0 * math.log10(max(nesz_lin, 1e-30))

    # Convert to dB sigma zero (typically -20 to -25 dB for civil SAR)

    return {
        "frequency_ghz": freq_ghz,
        "wavelength_m": round(lambda_m, 4),
        "peak_power_kw": peak_power_kw,
        "average_power_w": round(p_avg_w, 1),
        "duty_cycle": round(duty_cycle, 4),
        "satellite_altitude_km": altitude_km,
        "orbital_velocity_km_s": round(v_orbital_m_s / 1000.0, 3),
        "look_angle_deg": look_angle_deg,
        "incidence_angle_deg": incidence_deg,
        "slant_range_km": round(R_slant_m / 1000.0, 1),
        "min_antenna_area_m2": round(A_min_m2, 3),
        "antenna_length_m": round(L_az_m, 2),
        "antenna_width_m": round(L_el_m, 2),
        "antenna_gain_dbi": round(g_db, 2),
        "chirp_bandwidth_mhz": float(payload.get("chirp_bandwidth_mhz", 100.0)),
        "range_resolution_slant_m": round(dR_slant_m, 3),
        "range_resolution_ground_m": round(dR_ground_m, 2),
        "azimuth_resolution_m": round(dAz_m, 2),
        "swath_width_km": round(swath_width_km, 1),
        "prf_min_hz_azimuth_ambiguity": round(prf_min_hz, 0),
        "prf_used_hz": prf_hz,
        "NESZ_dB": round(nesz_db, 2),
        "polarization": polarization,
        "valid_prf": prf_hz > prf_min_hz,
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
