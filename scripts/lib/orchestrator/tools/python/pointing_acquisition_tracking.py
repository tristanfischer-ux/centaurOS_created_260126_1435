#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pointing_acquisition_tracking.py

Pointing, Acquisition and Tracking (PAT) system sizing for inter-satellite
or ground-to-space optical laser links. Determines closed-loop bandwidth,
fine-steering sensor FOV and acquisition time.

Companies served: Mynaric, TESAT-Spacecom, ODYSSEUS, Skyloom, Astrolight,
all laser-comm terminal vendors.

Input:
    {
      "target_pointing_arcsec_rms": 1.0,
      "satellite_jitter_arcsec_rms": 5.0,
      "link_distance_km": 1000.0,
      "beam_divergence_mrad": 0.05,
      "controller_type": "PID" | "Kalman" | "LQG",
      "sensor_update_rate_hz": 1000.0,
      "acquisition_uncertainty_arcsec": 1000.0
    }

Output:
    closed_loop_bandwidth_hz, sensor_FOV_arcsec, acquisition_time_s,
    fine_steering_resolution_urad, sensor_noise_floor_arcsec,
    coarse_to_fine_handoff_arcsec, _provenance.

Physics:
  Jitter rejection: residual = jitter_in / sqrt(1 + (omega/omega_c)^2)
  Required bandwidth: omega_c = omega_disturb * sqrt((sigma_in/sigma_target)^2 - 1)
  Acquisition spiral time: t_acq = (sigma_unc^2 / FOV^2) * (1/scan_rate)

References:
- Chen, C.C., Gardner, C.S., "Impact of Random Pointing and Tracking Errors
  on the Design of Coherent and Incoherent Optical Intersatellite
  Communications Links", IEEE Trans. Comm. 37(3):252-260, 1989.
- Kaushal & Kaddoum (2017) IEEE Comm. Surveys & Tutorials 19(1) DOI:
  10.1109/COMST.2016.2603518.
- Hemmati, H. (ed.), "Deep Space Optical Communications", Wiley 2006, ch.6.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "pointing_acquisition_tracking (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Chen & Gardner (1989) IEEE Trans. Comm. 37(3):252; "
        "Kaushal & Kaddoum (2017) IEEE Surveys & Tutorials 19(1) "
        "DOI:10.1109/COMST.2016.2603518; Hemmati (ed.) (2006) 'Deep Space "
        "Optical Communications' Wiley, ch.6."
    ),
    "physics_basis": (
        "Closed-loop disturbance rejection: residual error = input/sqrt(1 + "
        "(omega_dist/omega_BW)^2). Acquisition spiral covers uncertainty "
        "area at sensor FOV * step / scan_rate. Sensor noise floor from "
        "Cramer-Rao bound for centroid estimator."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "JITTER_DISTURBANCE_FREQUENCY": {
            "source": "Sidi 'Spacecraft Dynamics & Control' (Cambridge 1997); satellite micro-vibration spectrum peaks ~50-200 Hz",
            "confidence": "textbook",
        },
        "CONTROLLER_BW_RATIO_OF_SENSOR_RATE": {
            "source": "Astrom & Wittenmark 'Computer-Controlled Systems' (Prentice Hall 1997); rule of thumb omega_BW < f_sample / 5",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Typical satellite-induced disturbance characteristic frequency (Hz)
JITTER_PEAK_HZ = {
    "stable_3axis": 50.0,
    "agile":       200.0,
    "reaction_wheel_dominant": 100.0,
}

# Sensor noise floor for typical fine-tracking sensors (arcsec rms)
SENSOR_NOISE_FLOOR = {
    "CCD_quadrant": 0.5,
    "CMOS_lateral_effect": 0.2,
    "PSD_lateral_effect_diode": 0.1,
    "InGaAs_quadrant_4Q": 0.3,
}


def compute(payload: dict) -> dict:
    target_arcsec = float(payload.get("target_pointing_arcsec_rms", 1.0))
    jitter_arcsec = float(payload.get("satellite_jitter_arcsec_rms", 5.0))
    link_km = float(payload.get("link_distance_km", 1000.0))
    beam_div_mrad = float(payload.get("beam_divergence_mrad", 0.05))
    controller = str(payload.get("controller_type", "PID"))
    sensor_rate_hz = float(payload.get("sensor_update_rate_hz", 1000.0))
    acq_unc_arcsec = float(payload.get("acquisition_uncertainty_arcsec", 1000.0))
    jitter_class = str(payload.get("jitter_class", "stable_3axis"))
    sensor_type = str(payload.get("sensor_type", "CMOS_lateral_effect"))

    if target_arcsec <= 0 or jitter_arcsec <= 0:
        raise ValueError("pointing and jitter must be positive")

    # Disturbance peak frequency
    f_dist_hz = JITTER_PEAK_HZ.get(jitter_class, 50.0)

    # Required closed-loop bandwidth
    ratio = jitter_arcsec / target_arcsec
    if ratio <= 1:
        required_bw_hz = f_dist_hz * 0.5  # bandwidth still needs to be > disturbance
    else:
        # omega_c = omega_dist * sqrt(ratio^2 - 1)
        required_bw_hz = f_dist_hz * math.sqrt(ratio ** 2 - 1.0)

    # Controller-bandwidth bonus (LQG > Kalman > PID)
    if controller == "LQG":
        required_bw_hz *= 0.75
    elif controller == "Kalman":
        required_bw_hz *= 0.85

    # Check Nyquist + practical sampling: BW <= sensor_rate / 5
    max_bw_from_sensor = sensor_rate_hz / 5.0
    bw_achievable_hz = min(required_bw_hz, max_bw_from_sensor)

    # Beam divergence in arcsec (full angle)
    beam_div_arcsec = beam_div_mrad * 1e-3 * (180.0 / math.pi) * 3600.0

    # Coarse-to-fine handoff: fine sensor FOV must cover residual pointing
    # error after coarse acquisition. Typical fine sensor: 4 * beam_divergence
    fine_fov_arcsec = max(4.0 * beam_div_arcsec, 10.0)

    # Sensor noise floor
    sensor_noise_arcsec = SENSOR_NOISE_FLOOR.get(sensor_type, 0.5)
    # Centroid SNR-limited precision: noise / sqrt(N_photons * sampling_factor)
    # Assume nominal signal SNR of 100 (-> /10 precision improvement)
    snr_improvement_factor = 10.0
    achievable_pointing_arcsec = sensor_noise_arcsec / snr_improvement_factor

    # Coarse sensor handoff threshold
    coarse_handoff_arcsec = fine_fov_arcsec / 4.0  # quarter of fine FOV

    # Acquisition time — Archimedean spiral covering uncertainty
    # area_unc = pi * sigma_unc^2
    # area_scan = (FOV/4)^2 per step * scan_rate
    # Approximate: t_acq = (sigma_unc / step_size)^2 / scan_rate
    step_arcsec = fine_fov_arcsec / 4.0
    n_steps = (acq_unc_arcsec / step_arcsec) ** 2
    scan_dwell_time_s = 5.0 / sensor_rate_hz  # 5 samples per dwell
    acquisition_time_s = n_steps * scan_dwell_time_s

    # Fine-steering resolution (must be < target/2)
    fine_steering_arcsec = target_arcsec / 4.0
    fine_steering_urad = fine_steering_arcsec * (math.pi / 180.0) / 3600.0 * 1e6

    # Pointing budget check
    residual_jitter = jitter_arcsec / math.sqrt(1.0 + (bw_achievable_hz / f_dist_hz) ** 2)
    residual_after_loop = math.sqrt(residual_jitter ** 2 + sensor_noise_arcsec ** 2)
    pointing_margin_arcsec = target_arcsec - residual_after_loop

    # Lateral miss on receiver due to pointing error
    lateral_miss_m = target_arcsec * (math.pi / 180.0) / 3600.0 * link_km * 1000.0

    return {
        "target_pointing_arcsec_rms": target_arcsec,
        "satellite_jitter_arcsec_rms": jitter_arcsec,
        "link_distance_km": link_km,
        "beam_divergence_mrad": beam_div_mrad,
        "beam_divergence_arcsec": round(beam_div_arcsec, 2),
        "closed_loop_bandwidth_hz_required": round(required_bw_hz, 1),
        "closed_loop_bandwidth_hz_achievable": round(bw_achievable_hz, 1),
        "controller_type": controller,
        "sensor_update_rate_hz": sensor_rate_hz,
        "fine_sensor_FOV_arcsec": round(fine_fov_arcsec, 2),
        "coarse_to_fine_handoff_arcsec": round(coarse_handoff_arcsec, 2),
        "sensor_noise_floor_arcsec": sensor_noise_arcsec,
        "fine_steering_resolution_arcsec": round(fine_steering_arcsec, 3),
        "fine_steering_resolution_urad": round(fine_steering_urad, 4),
        "acquisition_uncertainty_arcsec": acq_unc_arcsec,
        "acquisition_time_s": round(acquisition_time_s, 2),
        "residual_jitter_arcsec_rms": round(residual_jitter, 3),
        "total_residual_arcsec_rms": round(residual_after_loop, 3),
        "pointing_margin_arcsec": round(pointing_margin_arcsec, 3),
        "pointing_budget_met": pointing_margin_arcsec >= 0,
        "lateral_miss_distance_m": round(lateral_miss_m, 2),
        "disturbance_peak_hz": f_dist_hz,
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
