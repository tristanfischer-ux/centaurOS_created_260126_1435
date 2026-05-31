#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/optical_acquisition_tracking_pointing.py

FSO closed-loop bandwidth + jitter spectrum for ATP (acquisition / tracking
/ pointing) system.

Input:
    {
      "tx_jitter_arcsec_rms": 5.0,
      "rx_aperture_mm": 100.0,
      "link_range_km": 100.0,
      "wavelength_nm": 1550.0,
      "platform_vibration_hz": 200.0
    }

Output:
    {
      "ATP_bandwidth_hz": ...,
      "fade_margin_db": ...,
      "required_disturbance_rejection_db": ...,
      ...
    }

Physics:
- Far-field beam divergence θ ≈ λ / D_tx.
- Beam-pointing accuracy must be << θ for full power collection.
- Closed-loop control bandwidth must exceed dominant vibration spectrum
  with margin (typically 5-10× margin per Bode integral).
- Pointing loss: L = (jitter / θ)² × 10 dB for Gaussian beam.

References:
- Andrews & Phillips (2005) "Laser Beam Propagation through Random Media."
- Kaymak et al. (2018) IEEE Comm. Surv. & Tut. 20, 1104.
- Tesat-Spacecom Laser Comms Terminal datasheet (LCT-50/100/300).
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "optical_acquisition_tracking_pointing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Andrews & Phillips (2005); Kaymak et al. (2018) IEEE Comm. Surv. Tut. 20 1104",
    "physics_basis": "Diffraction-limited divergence θ = λ/D_tx; closed-loop BW must exceed jitter spectrum.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

ARCSEC_PER_RAD = 206265.0


def compute(payload: dict) -> dict:
    jitter_arcsec = float(payload.get("tx_jitter_arcsec_rms", 5.0))
    D_rx_mm = float(payload.get("rx_aperture_mm", 100.0))
    range_km = float(payload.get("link_range_km", 100.0))
    wavelength_nm = float(payload.get("wavelength_nm", 1550.0))
    f_vib_hz = float(payload.get("platform_vibration_hz", 200.0))

    # Diffraction-limited beam divergence: θ = λ / D_tx (half-angle)
    # Assume tx aperture = D_rx for symmetric system
    D_tx_m = D_rx_mm / 1000.0
    wavelength_m = wavelength_nm * 1e-9
    div_half_angle_rad = wavelength_m / D_tx_m
    div_half_angle_arcsec = div_half_angle_rad * ARCSEC_PER_RAD

    # Spot size at receiver
    spot_radius_m = div_half_angle_rad * range_km * 1000
    spot_radius_cm = spot_radius_m * 100

    # Required pointing accuracy: jitter << θ
    # Typical requirement: jitter < θ/3 for < 0.5 dB pointing loss
    required_jitter_arcsec = div_half_angle_arcsec / 3.0
    jitter_margin_arcsec = required_jitter_arcsec - jitter_arcsec

    # Closed-loop bandwidth: must be ~5-10× dominant disturbance freq
    ATP_bandwidth_hz = max(100.0, f_vib_hz * 5.0)

    # Required disturbance rejection at vibration frequency
    # In a Type-2 loop: 40 dB/decade rolloff. If BW/f_vib = 5, rejection = 28 dB
    bw_ratio = ATP_bandwidth_hz / f_vib_hz
    disturbance_rejection_db = 40.0 * math.log10(bw_ratio)

    # Pointing loss for Gaussian beam
    if div_half_angle_arcsec > 0:
        jitter_over_div = jitter_arcsec / div_half_angle_arcsec
        # L_p ≈ 10·log10(exp((jitter/θ)²)) × 10 dB ratio
        pointing_loss_db = 4.343 * (jitter_over_div ** 2)
    else:
        pointing_loss_db = 99.0

    # Fade margin = link margin to overcome scintillation + pointing
    # Industry typical: 6 dB scintillation + 3 dB pointing + 3 dB other = 12 dB
    fade_margin_db = 12.0 - pointing_loss_db

    # Tracking loop slew rate requirement
    # If platform moves at 1 deg/s (3600 arcsec/s), loop must track w/o overshoot
    # Slew BW > 100 Hz typical
    slew_bw_hz = 100.0

    # Acquisition time estimate (coarse scan + fine acquisition)
    # Scan FoV / spot size × dwell_time
    fov_arcmin = 60.0  # typical 1-deg cone of uncertainty
    cells = (fov_arcmin * 60 / div_half_angle_arcsec) ** 2
    dwell_s = 0.001  # 1 ms per cell
    acquisition_time_s = cells * dwell_s

    return {
        "tx_jitter_arcsec_rms": jitter_arcsec,
        "rx_aperture_mm": D_rx_mm,
        "link_range_km": range_km,
        "wavelength_nm": wavelength_nm,
        "platform_vibration_hz": f_vib_hz,
        "beam_divergence_half_angle_arcsec": round(div_half_angle_arcsec, 3),
        "beam_divergence_urad": round(div_half_angle_rad * 1e6, 2),
        "spot_radius_at_rx_cm": round(spot_radius_cm, 2),
        "spot_diameter_at_rx_m": round(spot_radius_m * 2, 3),
        "required_pointing_accuracy_arcsec": round(required_jitter_arcsec, 3),
        "pointing_margin_arcsec": round(jitter_margin_arcsec, 3),
        "ATP_bandwidth_hz": round(ATP_bandwidth_hz, 1),
        "disturbance_rejection_at_vib_db": round(disturbance_rejection_db, 1),
        "pointing_loss_db": round(pointing_loss_db, 2),
        "fade_margin_db": round(fade_margin_db, 2),
        "slew_loop_bandwidth_hz": slew_bw_hz,
        "acquisition_time_s": round(acquisition_time_s, 2),
        "pointing_adequate": jitter_arcsec <= required_jitter_arcsec,
        "fade_margin_positive": fade_margin_db > 0,
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
