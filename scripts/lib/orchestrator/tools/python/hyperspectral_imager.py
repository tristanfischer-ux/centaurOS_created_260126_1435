#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/hyperspectral_imager.py

Hyperspectral imager sizing for spaceborne earth observation.
Computes required aperture, dwell time, SNR per band and data rate
for a pushbroom imaging spectrometer.

Companies served: Kuva Space (FI), Satlantis (ES), Pixxel-EU mirrors,
HySpex-DLR, ESA CHIME industrial partners.

Input:
    {
      "wavelength_start_nm": 400.0,
      "wavelength_end_nm": 2500.0,
      "num_bands": 200,
      "spectral_resolution_nm": 10.0,
      "target_GSD_m": 30.0,
      "satellite_altitude_km": 500.0,
      "swath_pixels": 1000,
      "target_snr": 100.0,
      "surface_albedo": 0.3
    }

Output:
    required_aperture_mm, sensor_dwell_time_ms, SNR_per_band,
    data_rate_mbps, focal_length_mm, _provenance.

Physics:
  Pushbroom dwell time = GSD / v_ground
  Photon flux per band per pixel = L_band * A * Omega * lambda * BW
  SNR = sqrt(N_electrons) for shot-noise limit
  Data rate = num_bands * swath_pixels * bit_depth * pushbroom_rate

References:
- Mouroulis, P., Green, R.O., Chrien, T.G., "Design of pushbroom imaging
  spectrometers for optimum recovery of spectroscopic and spatial
  information", Applied Optics 39(13):2210-2220, 2000.
- Schowengerdt, R.A., "Remote Sensing: Models and Methods for Image
  Processing", 3rd ed., Academic Press 2006.
- Goetz, A.F.H. et al., "Imaging spectrometry for Earth remote sensing",
  Science 228:1147-1153, 1985.
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
    "tool_name": "hyperspectral_imager (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Mouroulis, Green & Chrien (2000) Applied Optics 39(13):2210 "
        "DOI:10.1364/AO.39.002210; "
        "Schowengerdt (2006) 'Remote Sensing: Models and Methods for Image "
        "Processing' 3rd ed.; "
        "Goetz et al. (1985) Science 228:1147 DOI:10.1126/science.228.4704.1147."
    ),
    "physics_basis": (
        "Pushbroom spectrometer photon-budget. Solar TOA reflected radiance "
        "L = (E_sun/pi) * albedo * cos(SZA). Shot-noise-limited SNR. "
        "Dwell time = GSD/v_ground; required aperture sized for SNR target."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "SOLAR_IRRADIANCE_AVG_VNIR_SWIR": {
            "source": "Thuillier 2003 solar spectrum; VNIR mean ~1.1 W/m^2/nm, SWIR ~0.3, MWIR ~0.07",
            "confidence": "library",
        },
        "GM_EARTH": {
            "source": "EGM2008: 3.986e14 m^3/s^2",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


GM_EARTH = 3.986004418e14
R_EARTH_KM = 6378.137
H_PLANCK = 6.626e-34
C_LIGHT = 2.998e8


def solar_irradiance_at_wavelength(wavelength_nm: float) -> float:
    """Approximate Thuillier 2003 solar irradiance (W/m^2/nm)."""
    # Empirical piecewise approximation
    if wavelength_nm < 350:
        return 0.5
    elif wavelength_nm < 500:
        return 1.5 - (wavelength_nm - 350) / 150 * 0.4
    elif wavelength_nm < 800:
        return 1.5 - (wavelength_nm - 500) / 300 * 0.8
    elif wavelength_nm < 1500:
        return 0.7 - (wavelength_nm - 800) / 700 * 0.4
    elif wavelength_nm < 2500:
        return 0.3 - (wavelength_nm - 1500) / 1000 * 0.2
    else:
        return 0.1


def compute(payload: dict) -> dict:
    lam_start_nm = float(payload.get("wavelength_start_nm", 400.0))
    lam_end_nm = float(payload.get("wavelength_end_nm", 2500.0))
    num_bands = int(payload.get("num_bands", 200))
    spectral_res_nm = float(payload.get("spectral_resolution_nm", 10.0))
    target_gsd_m = float(payload.get("target_GSD_m", 30.0))
    altitude_km = float(payload.get("satellite_altitude_km", 500.0))
    swath_pixels = int(payload.get("swath_pixels", 1000))
    target_snr = float(payload.get("target_snr", 100.0))
    albedo = float(payload.get("surface_albedo", 0.3))
    sza_deg = float(payload.get("solar_zenith_angle_deg", 30.0))
    pixel_um = float(payload.get("detector_pixel_size_um", 18.0))

    # Orbital velocity
    R_sat_m = (R_EARTH_KM + altitude_km) * 1000.0
    v_orb_m_s = math.sqrt(GM_EARTH / R_sat_m)
    v_ground_m_s = v_orb_m_s * R_EARTH_KM * 1000.0 / R_sat_m

    # Dwell time (pushbroom)
    dwell_time_s = target_gsd_m / v_ground_m_s
    dwell_time_ms = dwell_time_s * 1000.0

    # Focal length: GSD = pixel_size * altitude / f
    altitude_m = altitude_km * 1000.0
    focal_length_m = (pixel_um * 1e-6) * altitude_m / target_gsd_m
    focal_length_mm = focal_length_m * 1000.0

    # Pixel solid angle
    ifov_rad = pixel_um * 1e-6 / focal_length_m
    omega_pixel = ifov_rad ** 2

    # Band properties
    band_width_nm = (lam_end_nm - lam_start_nm) / num_bands
    # Use minimum of spectral res and band width
    effective_bw_nm = min(spectral_res_nm, band_width_nm)

    # Compute SNR for several representative bands and average
    qe = 0.7
    eta_optics = 0.6
    sza_rad = math.radians(sza_deg)

    snr_per_band = []
    photons_per_band = []
    representative_wavelengths = [lam_start_nm,
                                  (lam_start_nm + lam_end_nm) / 2,
                                  lam_end_nm]
    # Iterate to size aperture for target SNR at the weakest band (often SWIR)
    # SNR target met when sqrt(N_e) >= target_snr
    # N_e = L * Omega * A * BW * t_dwell * qe / E_photon
    # → A = (target_snr^2 * E_photon) / (L * Omega * BW * t_dwell * qe * eta_optics)

    # Use weakest representative band
    weakest_band_nm = lam_end_nm  # SWIR end
    E_solar = solar_irradiance_at_wavelength(weakest_band_nm)
    L_band_reflected = (E_solar / math.pi) * albedo * math.cos(sza_rad)
    photon_energy = H_PLANCK * C_LIGHT / (weakest_band_nm * 1e-9)
    # N_e for SNR target:
    target_n_e = target_snr ** 2
    A_required_m2 = (target_n_e * photon_energy) / (
        L_band_reflected * omega_pixel * effective_bw_nm * dwell_time_s * qe * eta_optics)
    D_required_m = 2.0 * math.sqrt(A_required_m2 / math.pi)
    required_aperture_mm = D_required_m * 1000.0

    # Now compute SNR for each representative band with this aperture
    for w in representative_wavelengths:
        E_s = solar_irradiance_at_wavelength(w)
        L = (E_s / math.pi) * albedo * math.cos(sza_rad)
        photon_e = H_PLANCK * C_LIGHT / (w * 1e-9)
        n_e = (L * omega_pixel * A_required_m2 * effective_bw_nm
               * dwell_time_s * qe * eta_optics) / photon_e
        snr_per_band.append(math.sqrt(max(n_e, 1.0)))
        photons_per_band.append(n_e)

    # Data rate
    bit_depth_bits = int(payload.get("adc_bit_depth", 14))
    pushbroom_rate_hz = 1.0 / dwell_time_s
    data_rate_bps = num_bands * swath_pixels * bit_depth_bits * pushbroom_rate_hz
    data_rate_mbps = data_rate_bps / 1e6

    # Worked calculations — closed-form steps only.
    # v_orb (sqrt of GM/R), omega_pixel (ifov^2), photon energy (hc/lambda),
    # A_required (complex fraction), SNR (sqrt), and piecewise solar irradiance
    # are all skipped — transcendental or piecewise.
    v_ground_r = round(v_ground_m_s, 2)
    dwell_s_r = round(dwell_time_s, 6)
    focal_mm_r = round(focal_length_mm, 1)
    pushbroom_hz_r = round(pushbroom_rate_hz, 0)
    data_rate_r = round(data_rate_mbps, 1)
    worked = [
        worked_calc(
            label="Pushbroom dwell time per ground pixel",
            formula="dwell_time = GSD / v_ground",
            values={
                "GSD": (target_gsd_m, "m"),
                "v_ground": (v_ground_r, "m/s"),
            },
            result=dwell_s_r, result_unit="s",
            assumptions=["v_ground derived from orbital mechanics (sqrt step, not hand-verified); GSD = ground-sample distance"],
        ),
        worked_calc(
            label="Focal length from GSD geometry",
            formula="focal_length_mm = (pixel_um x 1e-6) x altitude_m / GSD x 1000",
            values={
                "pixel_um": (pixel_um, "um"),
                "altitude_m": (altitude_m, "m"),
                "GSD": (target_gsd_m, "m"),
            },
            result=focal_mm_r, result_unit="mm",
            assumptions=["Thin-lens paraxial relation: GSD = pixel_size x altitude / focal_length"],
        ),
        worked_calc(
            label="Pushbroom line rate",
            formula="pushbroom_rate = v_ground / GSD",
            values={
                "v_ground": (v_ground_r, "m/s"),
                "GSD": (target_gsd_m, "m"),
            },
            result=pushbroom_hz_r, result_unit="Hz",
            assumptions=[
                "Equivalent to 1 / dwell_time; uses v_ground / GSD to avoid precision loss "
                "when dwell_time is small and _fmt truncates to 4 decimal places",
            ],
        ),
        worked_calc(
            label="Raw data rate",
            formula="data_rate_mbps = num_bands x swath_pixels x bit_depth x pushbroom_rate / 1e6",
            values={
                "num_bands": (num_bands, ""),
                "swath_pixels": (swath_pixels, ""),
                "bit_depth": (bit_depth_bits, "bits"),
                "pushbroom_rate": (pushbroom_hz_r, "Hz"),
            },
            result=data_rate_r, result_unit="Mbit/s",
            assumptions=["Uncompressed; bit_depth from adc_bit_depth input (default 14 bits)"],
        ),
    ]

    return {
        "wavelength_start_nm": lam_start_nm,
        "wavelength_end_nm": lam_end_nm,
        "num_bands": num_bands,
        "spectral_resolution_nm": spectral_res_nm,
        "effective_bandwidth_per_band_nm": round(effective_bw_nm, 3),
        "target_GSD_m": target_gsd_m,
        "satellite_altitude_km": altitude_km,
        "swath_pixels": swath_pixels,
        "v_ground_m_s": round(v_ground_m_s, 2),
        "dwell_time_ms": round(dwell_time_ms, 4),
        "focal_length_mm": round(focal_length_mm, 1),
        "required_aperture_mm": round(required_aperture_mm, 2),
        "SNR_at_wavelength_start": round(snr_per_band[0], 1),
        "SNR_at_wavelength_mid": round(snr_per_band[1], 1),
        "SNR_at_wavelength_end": round(snr_per_band[2], 1),
        "SNR_per_band_avg": round(sum(snr_per_band) / len(snr_per_band), 1),
        "target_snr": target_snr,
        "data_rate_mbps": round(data_rate_mbps, 1),
        "pushbroom_line_rate_hz": round(pushbroom_rate_hz, 0),
        "bit_depth_bits": bit_depth_bits,
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
