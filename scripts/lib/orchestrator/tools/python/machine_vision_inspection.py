#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/machine_vision_inspection.py

Machine-vision inspection — camera + edge-compute sizing for in-orbit
inspection (defect detection, photogrammetric reconstruction).

Companies served: Lodestar (UK/EU integrator), Astroscale (UK), GMV (ES),
ClearSpace, OroraTech inspection partners.

Input:
    {
      "target_distance_m": 5.0,
      "illumination": "solar_only" | "LED_4W" | "LED_20W" | "laser_flood",
      "camera_resolution_mp": 12.0,
      "defect_detection_target_mm": 1.0,
      "field_of_view_deg": 30.0,
      "frame_rate_fps": 10.0,
      "compute_accelerator": "Jetson_Xavier_NX",
      "exposure_time_ms": 5.0
    }

Output:
    required_compute_TOPS, detection_probability, false_alarm_rate,
    pixel_size_mm_at_target, signal_to_noise, _provenance.

Physics:
  Spatial resolution at target: pixel_size = 2 * distance * tan(FoV/2) / N_pixels
  Illumination: I_at_target = P_lamp / (2 pi r^2)  (point source isotropic)
  Edge detection performance: PoD = 1 - exp(-defect_area / (pixel_size^2 * SNR_factor))

References:
- Davies, E.R., "Computer & Machine Vision: Theory, Algorithms, Practicalities",
  4th ed., Academic Press 2012.
- Hartley, R., Zisserman, A., "Multiple View Geometry in Computer Vision",
  2nd ed., Cambridge 2003.
- Lin, T.-Y. et al., "Feature Pyramid Networks for Object Detection",
  CVPR 2017, DOI 10.1109/CVPR.2017.106.
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
    "tool_name": "machine_vision_inspection (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Davies (2012) 'Computer & Machine Vision' 4th ed. Academic Press; "
        "Hartley & Zisserman (2003) 'Multiple View Geometry in Computer Vision' "
        "2nd ed. CUP; Lin et al. (2017) CVPR DOI:10.1109/CVPR.2017.106."
    ),
    "physics_basis": (
        "Camera pixel pitch at target distance via similar-triangle geometry. "
        "Inverse-square illumination from point LED/laser source. CNN "
        "compute as GFLOPs/image × frame rate. PoD from defect size vs "
        "instantaneous-field-of-view."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "ACCELERATOR_TOPS_INT8": {
            "source": "Jetson Xavier NX = 21 TOPS, Orin Nano = 40 TOPS, Coral = 4 TOPS",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


ILLUMINATION_PROFILES = {
    "solar_only":  {"flux_w_m2_at_1au": 1361.0, "directional": False, "effective_w": 100.0},
    "LED_4W":      {"flux_w_m2_at_1au": None, "directional": True, "effective_w": 4.0},
    "LED_20W":     {"flux_w_m2_at_1au": None, "directional": True, "effective_w": 20.0},
    "laser_flood": {"flux_w_m2_at_1au": None, "directional": True, "effective_w": 50.0},
    "shadow":      {"flux_w_m2_at_1au": None, "directional": False, "effective_w": 0.5},
}

ACCELERATOR_TOPS = {
    "Movidius_Myriad_X": 1.0,
    "Jetson_Xavier_NX": 21.0,
    "Jetson_Orin_Nano": 40.0,
    "Coral_TPU":        4.0,
    "Hailo_8":          26.0,
}


def compute(payload: dict) -> dict:
    distance_m = float(payload.get("target_distance_m", 5.0))
    illumination = str(payload.get("illumination", "solar_only"))
    cam_mp = float(payload.get("camera_resolution_mp", 12.0))
    defect_mm = float(payload.get("defect_detection_target_mm", 1.0))
    fov_deg = float(payload.get("field_of_view_deg", 30.0))
    fps = float(payload.get("frame_rate_fps", 10.0))
    accel = str(payload.get("compute_accelerator", "Jetson_Xavier_NX"))
    exposure_ms = float(payload.get("exposure_time_ms", 5.0))

    if illumination not in ILLUMINATION_PROFILES:
        illumination = "solar_only"
    illum = ILLUMINATION_PROFILES[illumination]

    # Pixel pitch at target distance
    fov_rad = math.radians(fov_deg)
    # Camera sensor pixels (assume square)
    n_pixels_per_side = math.sqrt(cam_mp * 1e6)
    # Field of view at target
    fov_diameter_m = 2.0 * distance_m * math.tan(fov_rad / 2.0)
    pixel_size_at_target_mm = (fov_diameter_m * 1000.0) / n_pixels_per_side

    # Defects per pixel: how many pixels does the defect cover?
    pixels_per_defect = (defect_mm / max(pixel_size_at_target_mm, 0.001)) ** 2

    # Illumination at target
    if illum["directional"]:
        # Directional source: P / (4 pi r^2) for isotropic; or P / (pi r tan(theta)^2) for collimated
        # Use beam-diverging cone: assume 30° divergence
        cone_half_angle = math.radians(15.0)
        spot_radius = distance_m * math.tan(cone_half_angle)
        spot_area = math.pi * spot_radius ** 2
        irr_w_m2 = illum["effective_w"] / spot_area
    else:
        if illum["flux_w_m2_at_1au"]:
            irr_w_m2 = illum["flux_w_m2_at_1au"]
        else:
            irr_w_m2 = illum["effective_w"]

    # Reflected radiance off target
    albedo = 0.3  # typical satellite paint/skin
    L_w_m2_sr = irr_w_m2 * albedo / math.pi

    # SNR calculation
    qe = 0.5
    pixel_area_um2 = (pixel_size_at_target_mm * 1e3 / 1.0) ** 2  # at sensor, not target
    # In sensor space, pixel area is ~5 um pitch
    sensor_pixel_um = 5.0
    f_number = 4.0
    photon_energy_j = 6.626e-34 * 3e8 / 550e-9  # green light
    # Photons reaching sensor per pixel per exposure
    A_lens_m2 = math.pi * (0.025 / f_number) ** 2  # 25 mm lens
    omega_sr = math.pi / (4.0 * f_number ** 2)  # solid angle
    photons_per_pixel = (L_w_m2_sr * (sensor_pixel_um * 1e-6) ** 2 * omega_sr *
                         exposure_ms * 1e-3) / photon_energy_j
    n_electrons = photons_per_pixel * qe
    shot_noise = math.sqrt(max(n_electrons, 1.0))
    read_noise = 5.0  # e-
    dark_current_e = 100.0  # e-/s @ 25C → exposure_ms
    dark_current_total = dark_current_e * exposure_ms * 1e-3
    total_noise = math.sqrt(shot_noise ** 2 + read_noise ** 2 + dark_current_total)
    snr = n_electrons / max(total_noise, 0.1)

    # Compute requirement: assume CNN-based defect detector with ~20 GFLOPs per image
    gflops_per_image = 20.0 * (cam_mp / 12.0)  # scale with resolution
    tops_required = gflops_per_image * fps / 1000.0  # GFLOPs * fps / 1e3 = TFLOPs/s ≈ TOPS (INT8 approx)

    # Check accelerator
    tops_available = ACCELERATOR_TOPS.get(accel, 21.0)
    utilisation_factor = 0.15  # MLPerf real-world
    tops_effective = tops_available * utilisation_factor

    # Probability of detection
    # PoD = 1 - exp(-(SNR * pixels_per_defect) / k_threshold)
    k_threshold = 10.0
    pod = 1.0 - math.exp(-snr * pixels_per_defect / k_threshold) if (snr > 0 and pixels_per_defect > 0) else 0.0
    pod = max(0.0, min(1.0, pod))

    # False-alarm rate
    false_alarm_rate = 0.01 / max(snr / 10.0, 1.0)
    if pixels_per_defect < 1:
        false_alarm_rate = max(false_alarm_rate, 0.1)  # sub-pixel defects: many false alarms

    # Rounded display values that chain through the worked calculations.
    pixel_size_r = round(pixel_size_at_target_mm, 4)
    pixels_per_defect_r = round(pixels_per_defect, 2)
    gflops_r = round(gflops_per_image, 3)
    tops_req_r = round(tops_required, 2)
    tops_eff_r = round(tops_effective, 2)

    # Worked calculations (hand-checkable closed-form steps only).
    # fov_diameter uses tan(fov/2) — SKIP.
    # n_pixels_per_side uses sqrt — SKIP.
    # pixel_size = fov_diameter / n_pixels is quotient of two SKIP quantities;
    #   pass it as a live input symbol for pixels_per_defect.
    # irr_w_m2 uses tan (directional) or a lookup (solar) — SKIP.
    # photons/electrons use omega_sr (derived) — SKIP.
    # snr uses sqrt — SKIP.
    worked = [
        worked_calc(
            label="Pixels per defect (defect coverage)",
            formula="pixels_per_defect = (defect_mm / pixel_size_mm)^2",
            values={
                "defect_mm": (defect_mm, "mm"),
                "pixel_size_mm": (pixel_size_r, "mm"),
            },
            result=pixels_per_defect_r, result_unit="pixels",
            assumptions=[
                "pixel_size_mm is ground-projected pixel pitch: 2*d*tan(FoV/2) / sqrt(N_px)",
                "square defect assumption for pixel count",
            ],
        ),
        worked_calc(
            label="CNN compute requirement per image",
            formula="GFLOPs_per_image = 20 x (cam_mp / 12)",
            values={"cam_mp": (cam_mp, "MP")},
            result=gflops_r, result_unit="GFLOPs/image",
            assumptions=["20 GFLOPs baseline for ResNet-50-class detector at 12 MP; linear scaling"],
        ),
        worked_calc(
            label="Required compute throughput",
            formula="TOPS_req = GFLOPs_per_image x fps / 1000",
            values={"GFLOPs_per_image": (gflops_r, "GFLOPs/image"), "fps": (fps, "fps")},
            result=tops_req_r, result_unit="TOPS",
            assumptions=["GFLOPs/image x frames/s / 1000 = TOPS (INT8 approximate)"],
        ),
        worked_calc(
            label="Effective accelerator throughput (with utilisation factor)",
            formula="TOPS_eff = TOPS_peak x utilisation",
            values={"TOPS_peak": (tops_available, "TOPS"), "utilisation": (0.15, "")},
            result=tops_eff_r, result_unit="TOPS",
            assumptions=["0.15 utilisation factor from MLPerf real-world inference benchmarks"],
        ),
    ]

    return {
        "target_distance_m": distance_m,
        "illumination": illumination,
        "camera_resolution_mp": cam_mp,
        "field_of_view_deg": fov_deg,
        "fov_diameter_at_target_m": round(fov_diameter_m, 3),
        "pixel_size_at_target_mm": pixel_size_r,
        "defect_detection_target_mm": defect_mm,
        "pixels_per_defect": pixels_per_defect_r,
        "frame_rate_fps": fps,
        "exposure_time_ms": exposure_ms,
        "irradiance_at_target_w_m2": round(irr_w_m2, 2),
        "photons_per_pixel": round(photons_per_pixel, 1),
        "electrons_per_pixel": round(n_electrons, 1),
        "signal_to_noise": round(snr, 2),
        "required_compute_TOPS": tops_req_r,
        "compute_accelerator": accel,
        "tops_available_peak": tops_available,
        "tops_effective_with_utilisation": tops_eff_r,
        "compute_sufficient": tops_required <= tops_effective,
        "detection_probability": round(pod, 4),
        "false_alarm_rate": round(false_alarm_rate, 5),
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
