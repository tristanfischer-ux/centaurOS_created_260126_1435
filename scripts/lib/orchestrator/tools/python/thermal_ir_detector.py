#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/thermal_ir_detector.py

Thermal IR detector sizing — LWIR / MWIR / SWIR — for spaceborne thermal
imaging. Computes required aperture, signal-to-noise, ground sample distance.

Companies served: SatVu (London), constellr (DE/CH), Hydrosat, OroraTech (DE).

Input:
    {
      "wavelength_band_um": "LWIR_8_14" | "MWIR_3_5" | "SWIR_1_3",
      "detector_pixel_size_um": 18.0,
      "detector_array_pixels": 1024,
      "integration_time_ms": 10.0,
      "target_NETD_mK": 50.0,
      "satellite_altitude_km": 500.0,
      "scene_temperature_k": 290.0,
      "detector_d_star_cm_sqrthz_per_w": 1e10
    }

Output:
    required_aperture_mm, signal_to_noise_db, GSD_at_500km_m,
    cooling_required, focal_length_mm, swath_width_km, _provenance.

Physics:
  Planck radiance L(lambda, T) per m^2 sr m of wavelength
  Photon flux at detector = L * A_aperture * Omega_pixel * eta_optics
  NETD = (NEP / (dL/dT * A * Omega)) * sqrt(BW)
  D* = sqrt(A * BW) / NEP

References:
- Holst, G.C., "Electro-Optical Imaging System Performance", 5th ed.,
  JCD Publishing 2008.
- Boyd, R.W., "Radiometry and the Detection of Optical Radiation", Wiley 1983.
- Vollmer, M., Möllmann, K.-P., "Infrared Thermal Imaging", 2nd ed.,
  Wiley-VCH 2017.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "thermal_ir_detector (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Holst (2008) 'Electro-Optical Imaging System Performance' 5th ed.; "
        "Boyd (1983) 'Radiometry and the Detection of Optical Radiation' Wiley; "
        "Vollmer & Möllmann (2017) 'Infrared Thermal Imaging' 2nd ed. Wiley-VCH."
    ),
    "physics_basis": (
        "Planck blackbody radiance integrated over band. NETD = "
        "NEP / (dL/dT * A_aperture * Omega_pixel). D* (Jones, 1953) "
        "characterises detector sensitivity per cm sqrt(Hz)/W."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "BAND_DEFINITIONS_UM": {
            "source": "IR Optics handbooks; SWIR 1.0-3.0, MWIR 3.0-5.0, LWIR 8.0-14.0",
            "confidence": "standard",
        },
        "PLANCK_CONSTANTS": {
            "source": "CODATA 2018: h=6.626e-34, c=2.998e8, kB=1.381e-23",
            "confidence": "library",
        },
        "DETECTOR_DSTAR_TYPICAL": {
            "source": "Hamamatsu / Teledyne FLIR datasheets — MCT @ 77K: D*=2e10 to 1e11 cm sqrt(Hz)/W; uncooled microbolometer LWIR: D*~1e8",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Band definitions: wavelength range (um)
BANDS = {
    "SWIR_1_3":   {"lo": 1.0, "hi": 3.0, "lambda_c": 2.0, "cooling": "TEC", "typical_dstar": 1e12},
    "MWIR_3_5":   {"lo": 3.0, "hi": 5.0, "lambda_c": 4.0, "cooling": "Stirling_77K", "typical_dstar": 5e10},
    "LWIR_8_14":  {"lo": 8.0, "hi": 14.0, "lambda_c": 10.0, "cooling": "Stirling_77K_or_microbolometer", "typical_dstar": 2e10},
    "VLWIR_14_30": {"lo": 14.0, "hi": 30.0, "lambda_c": 20.0, "cooling": "Stirling_60K", "typical_dstar": 1e10},
}

H_PLANCK = 6.62607015e-34  # J s
C_LIGHT = 2.998e8  # m/s
KB_BOLTZ = 1.380649e-23  # J/K
SIGMA_SB = 5.670374e-8  # W/m^2/K^4


def planck_radiance(wavelength_m: float, T_k: float) -> float:
    """Planck spectral radiance L_lambda(W/m^2/sr/m)."""
    if T_k <= 0:
        return 0.0
    c1 = 2.0 * H_PLANCK * C_LIGHT ** 2 / wavelength_m ** 5
    arg = H_PLANCK * C_LIGHT / (wavelength_m * KB_BOLTZ * T_k)
    if arg > 700:
        return 0.0
    c2 = 1.0 / (math.exp(arg) - 1.0)
    return c1 * c2


def planck_dL_dT(wavelength_m: float, T_k: float) -> float:
    """dL/dT for the same Planck integrand."""
    L = planck_radiance(wavelength_m, T_k)
    arg = H_PLANCK * C_LIGHT / (wavelength_m * KB_BOLTZ * T_k)
    if arg > 700:
        return 0.0
    return L * (arg / T_k) * math.exp(arg) / (math.exp(arg) - 1.0)


def integrate_band(lambda_lo_um: float, lambda_hi_um: float, T_k: float) -> tuple:
    """Integrate Planck radiance and dL/dT over the band. Returns (L_total_W_m2_sr, dL_dT_W_m2_sr_K)."""
    n_steps = 50
    L_total = 0.0
    dL_dT_total = 0.0
    for i in range(n_steps):
        lam = (lambda_lo_um + (lambda_hi_um - lambda_lo_um) * (i + 0.5) / n_steps) * 1e-6
        d_lam = (lambda_hi_um - lambda_lo_um) / n_steps * 1e-6
        L_total += planck_radiance(lam, T_k) * d_lam
        dL_dT_total += planck_dL_dT(lam, T_k) * d_lam
    return L_total, dL_dT_total


def compute(payload: dict) -> dict:
    band = str(payload.get("wavelength_band_um", "LWIR_8_14"))
    pixel_um = float(payload.get("detector_pixel_size_um", 18.0))
    array_n = int(payload.get("detector_array_pixels", 1024))
    int_time_ms = float(payload.get("integration_time_ms", 10.0))
    target_netd_mk = float(payload.get("target_NETD_mK", 50.0))
    altitude_km = float(payload.get("satellite_altitude_km", 500.0))
    T_scene_k = float(payload.get("scene_temperature_k", 290.0))
    d_star = float(payload.get("detector_d_star_cm_sqrthz_per_w",
                                BANDS.get(band, BANDS["LWIR_8_14"])["typical_dstar"]))

    if band not in BANDS:
        raise ValueError(f"unknown band {band!r}; known: {list(BANDS)}")
    b = BANDS[band]

    # Integrate Planck radiance over band at scene temperature
    L_band, dL_dT_band = integrate_band(b["lo"], b["hi"], T_scene_k)

    # Pixel solid angle (sr) - at satellite, looking down
    # Required GSD: GSD = pixel_um * 1e-6 * altitude_km*1000 / f
    # We solve for f given target GSD = 10 m (typical SatVu / constellr)
    # GSD per pixel after sizing aperture:
    # Optical etendue:
    eta_optics = 0.7  # transmission

    # NEP: Noise Equivalent Power
    pixel_area_cm2 = (pixel_um * 1e-4) ** 2  # cm^2
    bw_hz = 1.0 / (2.0 * int_time_ms * 1e-3)
    nep_w = math.sqrt(pixel_area_cm2 * bw_hz) / d_star

    # NETD = NEP / (dL/dT * Omega_pixel * A_aperture * eta_optics)
    # Solve for A_aperture (m^2) given target_NETD_mK
    target_netd_k = target_netd_mk * 1e-3
    # Pixel IFOV (rad) — we need this from focal length f
    # We'll iterate: target GSD = 10 m at 500 km altitude
    target_gsd_m = 10.0 * (altitude_km / 500.0)

    # f = pixel_um * 1e-6 * altitude_m / GSD
    altitude_m = altitude_km * 1000.0
    focal_length_m = (pixel_um * 1e-6) * altitude_m / target_gsd_m
    focal_length_mm = focal_length_m * 1000.0

    # Pixel IFOV (rad)
    ifov_rad = pixel_um * 1e-6 / focal_length_m
    omega_pixel_sr = ifov_rad ** 2

    # Solve for aperture diameter D
    # A_aperture = NEP / (dL/dT * Omega * eta * NETD)
    A_aperture_m2 = nep_w / (dL_dT_band * omega_pixel_sr * eta_optics * target_netd_k)
    D_aperture_m = 2.0 * math.sqrt(A_aperture_m2 / math.pi)
    required_aperture_mm = D_aperture_m * 1000.0

    # F-number
    f_number = focal_length_m / max(D_aperture_m, 1e-9)

    # Signal power per pixel (W)
    signal_w = L_band * omega_pixel_sr * A_aperture_m2 * eta_optics
    # SNR
    snr_lin = signal_w / max(nep_w, 1e-30)
    snr_db = 10.0 * math.log10(max(snr_lin, 1e-30))

    # GSD
    gsd_m = pixel_um * 1e-6 * altitude_m / focal_length_m

    # Swath
    swath_km = array_n * gsd_m / 1000.0

    # Cooling required?
    cooling_required = b["cooling"] != "none" and "uncooled" not in b["cooling"]
    if band == "LWIR_8_14" and d_star < 1e9:
        # Uncooled microbolometer
        cooling_required = False

    return {
        "wavelength_band_um": band,
        "band_lambda_lo_um": b["lo"],
        "band_lambda_hi_um": b["hi"],
        "band_center_um": b["lambda_c"],
        "detector_pixel_size_um": pixel_um,
        "detector_array_pixels": array_n,
        "integration_time_ms": int_time_ms,
        "target_NETD_mK": target_netd_mk,
        "scene_temperature_k": T_scene_k,
        "satellite_altitude_km": altitude_km,
        "scene_radiance_w_m2_sr": round(L_band, 4),
        "dL_dT_w_m2_sr_K": round(dL_dT_band, 6),
        "detector_d_star_cm_sqrthz_per_w": d_star,
        "noise_equivalent_power_w": nep_w,
        "required_aperture_mm": round(required_aperture_mm, 2),
        "focal_length_mm": round(focal_length_mm, 1),
        "f_number": round(f_number, 2),
        "pixel_ifov_urad": round(ifov_rad * 1e6, 3),
        "signal_to_noise_db": round(snr_db, 2),
        "signal_to_noise_lin": round(snr_lin, 1),
        "GSD_at_altitude_m": round(gsd_m, 2),
        "GSD_at_500km_m": round(pixel_um * 1e-6 * 500e3 / focal_length_m, 2),
        "swath_width_km": round(swath_km, 2),
        "cooling_required": cooling_required,
        "cooling_method": b["cooling"],
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
