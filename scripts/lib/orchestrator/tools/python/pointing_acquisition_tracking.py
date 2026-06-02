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
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


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

    # Worked calculations — closed-form arithmetic steps only.
    # required_bw_hz involves sqrt(ratio^2 - 1) — transcendental, skipped.
    # residual_jitter involves sqrt(1 + ...) — skipped; passed as rounded input.
    beam_div_arcsec_r = round(beam_div_arcsec, 3)
    fine_fov_r = round(fine_fov_arcsec, 3)
    coarse_handoff_r = round(coarse_handoff_arcsec, 3)
    fine_steer_arcsec_r = round(fine_steering_arcsec, 4)
    fine_steer_urad_r = round(fine_steering_urad, 4)
    lateral_miss_r = round(lateral_miss_m, 3)
    step_r = round(step_arcsec, 3)
    n_steps_r = round(n_steps, 1)
    acq_time_r = round(acquisition_time_s, 3)

    # arc-second to radian conversion constant
    ARCSEC_TO_RAD = math.pi / 180.0 / 3600.0

    worked = [
        worked_calc(
            label="Beam divergence converted to arcseconds",
            formula="beam_div_arcsec = beam_div_mrad x 1e-3 x (180 / pi) x 3600",
            values={"beam_div_mrad": (beam_div_mrad, "mrad")},
            result=beam_div_arcsec_r, result_unit="arcsec",
            assumptions=["1 mrad = 1e-3 rad; 1 rad = (180/pi) deg = 206,265 arcsec"],
        ),
        worked_calc(
            label="Fine-sensor field of view (must cover residual after coarse acquisition)",
            formula="fine_FOV = 4 x beam_div_arcsec",
            values={"beam_div_arcsec": (beam_div_arcsec_r, "arcsec")},
            result=fine_fov_r, result_unit="arcsec",
            assumptions=[
                "Fine sensor FOV = 4 x beam divergence (rule of thumb: Chen & Gardner 1989)",
                "Minimum 10 arcsec floor applied if result is smaller",
            ],
        ),
        worked_calc(
            label="Coarse-to-fine handoff threshold",
            formula="coarse_handoff = fine_FOV / 4",
            values={"fine_FOV": (fine_fov_r, "arcsec")},
            result=coarse_handoff_r, result_unit="arcsec",
            assumptions=["Handoff at quarter of fine-sensor FOV to ensure overlap margin"],
        ),
        worked_calc(
            label="Required fine-steering resolution",
            formula="fine_steer_arcsec = target_arcsec / 4",
            values={"target_arcsec": (target_arcsec, "arcsec")},
            result=fine_steer_arcsec_r, result_unit="arcsec",
            assumptions=["Fine-steering resolution <= target/2; factor 4 gives comfortable margin"],
        ),
        worked_calc(
            label="Fine-steering resolution in microradians",
            formula="fine_steer_urad = fine_steer_arcsec x (pi / 180 / 3600) x 1e6",
            values={"fine_steer_arcsec": (fine_steer_arcsec_r, "arcsec")},
            result=fine_steer_urad_r, result_unit="urad",
            assumptions=["arcsec x pi/180/3600 converts to radians; x 1e6 converts to microradians"],
        ),
        worked_calc(
            label="Number of acquisition spiral steps",
            formula="n_steps = (acq_unc_arcsec / step_arcsec) ^ 2",
            values={
                "acq_unc_arcsec": (acq_unc_arcsec, "arcsec"),
                "step_arcsec": (step_r, "arcsec"),
            },
            result=n_steps_r, result_unit="steps",
            assumptions=[
                "Archimedean spiral: area_unc / area_step = (sigma_unc/step)^2",
                f"step_arcsec = fine_FOV / 4 = {step_r} arcsec",
            ],
        ),
        worked_calc(
            label="Acquisition time",
            formula="t_acq = n_steps x scan_dwell_s",
            values={
                "n_steps": (n_steps_r, ""),
                "scan_dwell_s": (round(scan_dwell_time_s, 6), "s"),
            },
            result=acq_time_r, result_unit="s",
            assumptions=[f"scan_dwell_s = 5 / sensor_rate_hz = 5 / {sensor_rate_hz} s (5 samples per dwell position)"],
        ),
        worked_calc(
            label="Lateral miss distance at receiver",
            formula="lateral_miss_m = target_arcsec x (pi / 180 / 3600) x link_km x 1000",
            values={
                "target_arcsec": (target_arcsec, "arcsec"),
                "link_km": (link_km, "km"),
            },
            result=lateral_miss_r, result_unit="m",
            assumptions=[
                "Small-angle approximation: miss = angle_rad x range",
                "arcsec x pi/180/3600 = angle in radians; x link_km x 1000 converts km to m",
            ],
        ),
    ]

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
