#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/obstacle_avoidance_sensor.py

Obstacle avoidance sensor sizing for drone safety envelopes.

Stopping distance:
    s = v² / (2a) + v × τ
where:
    v = velocity (m/s)
    a = max deceleration (m/s²)
    τ = sensor + control latency (s)

Sensor-specific properties:
- Lidar: 10-300 m range, ±2-5 cm accuracy, 5-30° FOV, 10-50 Hz, £500-15000
- mmWave radar: 5-200 m, ±10 cm, ±30° FOV horiz, 10-50 Hz, £100-3000
- Stereo vision: 0.5-25 m, ±5 cm @ 5m, 60-180° FOV, 30-90 Hz, £50-1500
- Ultrasonic: 0.2-4 m, ±2 cm, ±15° FOV, 20-40 Hz, £20-200
- Mono vision + AI: 1-50 m, depth via parallax/scale, 90-180° FOV, 30 Hz, £100-1500
- Time-of-flight (ToF): 0.2-10 m, ±1 cm, 60-120° FOV, 30-60 Hz, £50-500
- Event camera: 0.5-50 m, ±10 cm, 90-180° FOV, 10 kHz pseudo-rate, £1000-5000

Blind spot analysis:
- Above/below sensors → blind cone where obstacle invisible
- Volume = (4/3) π × r³ for omni; fraction blind = (4π - solid_angle_covered) / 4π

Sensor fusion typical:
- Fixed-wing UAV: forward lidar + downward ToF + side mmwave
- Multirotor: omnidirectional stereo + downward ultrasonic

References:
- ISO 21629 (Robotics safety - autonomous mobile robots)
- ASTM F3411 (Remote ID for UAS)
- SAE AS6968 (Detect and Avoid systems for UAS)
- Velodyne Puck Lite, Livox MID-40 datasheets
- Intel RealSense D435i, Stereolabs ZED 2 datasheets
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'obstacle_avoidance_sensor (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Bachrach et al. (2012), 'Estimation, planning and mapping for autonomous flight using an RGB-D camera in GPS-denied environments', Int. J. Robotics Research; Ouster/Velodyne LiDAR datasheets",
    "physics_basis": 'Braking envelope = (v² / (2 × a_max)) + (v × t_response). Sensor blind-spot from FoV geometry.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


SENSORS: dict[str, dict] = {
    "lidar": {
        "min_range_m": 1.0, "max_range_m": 100, "accuracy_cm": 3,
        "fov_horiz_deg": 360, "fov_vert_deg": 30, "rate_hz": 20,
        "latency_ms": 30, "cost_gbp": 3000, "mass_g": 500,
        "works_in_fog_rain": True,   # depends on wavelength; near-IR ok
    },
    "mmwave_radar": {
        "min_range_m": 0.5, "max_range_m": 200, "accuracy_cm": 10,
        "fov_horiz_deg": 120, "fov_vert_deg": 30, "rate_hz": 20,
        "latency_ms": 25, "cost_gbp": 800, "mass_g": 150,
        "works_in_fog_rain": True,    # excellent in all weather
    },
    "stereo_vision": {
        "min_range_m": 0.5, "max_range_m": 25, "accuracy_cm": 5,
        "fov_horiz_deg": 90, "fov_vert_deg": 70, "rate_hz": 60,
        "latency_ms": 60, "cost_gbp": 400, "mass_g": 120,
        "works_in_fog_rain": False,   # degrades in low visibility
    },
    "ultrasonic": {
        "min_range_m": 0.2, "max_range_m": 4, "accuracy_cm": 2,
        "fov_horiz_deg": 30, "fov_vert_deg": 30, "rate_hz": 30,
        "latency_ms": 15, "cost_gbp": 50, "mass_g": 20,
        "works_in_fog_rain": True,
    },
    "tof": {
        "min_range_m": 0.2, "max_range_m": 10, "accuracy_cm": 1,
        "fov_horiz_deg": 120, "fov_vert_deg": 80, "rate_hz": 30,
        "latency_ms": 30, "cost_gbp": 250, "mass_g": 30,
        "works_in_fog_rain": False,
    },
    "event_camera": {
        "min_range_m": 0.5, "max_range_m": 50, "accuracy_cm": 10,
        "fov_horiz_deg": 90, "fov_vert_deg": 70, "rate_hz": 1000,   # event-rate
        "latency_ms": 1, "cost_gbp": 2000, "mass_g": 80,
        "works_in_fog_rain": False,
    },
}


def compute(payload: dict) -> dict:
    sensor_type = str(payload.get("sensor_type", "lidar")).lower()
    if sensor_type not in SENSORS:
        return {"error": f"Unknown sensor_type '{sensor_type}'. Available: {list(SENSORS.keys())}"}

    sensor = SENSORS[sensor_type]
    max_range_m = float(payload.get("max_range_m", sensor["max_range_m"]))
    fov_deg = float(payload.get("fov_deg", sensor["fov_horiz_deg"]))
    rate_hz = float(payload.get("frame_rate_hz", sensor["rate_hz"]))
    drone_max_speed_ms = float(payload.get("drone_max_speed_ms", 10))
    deceleration_ms2 = float(payload.get("max_deceleration_ms2", 5.0))

    # Latency: sensor + 2-3 frames + control
    control_latency_ms = 50
    total_latency_ms = sensor["latency_ms"] + (3 * 1000 / rate_hz) + control_latency_ms
    total_latency_s = total_latency_ms / 1000.0

    # Braking distance
    v = drone_max_speed_ms
    braking_distance_m = (v ** 2) / (2 * deceleration_ms2) + v * total_latency_s

    # Ratio range to braking distance: > 1 = safe
    safety_margin = max_range_m / max(0.1, braking_distance_m)

    # Blind spot estimation
    fov_solid_angle_sr = 2 * math.pi * (1 - math.cos(math.radians(fov_deg / 2)))
    blind_solid_angle = 4 * math.pi - fov_solid_angle_sr
    blind_fraction = blind_solid_angle / (4 * math.pi)
    # Blind spot volume (sphere of radius = max_range)
    sphere_vol = (4/3) * math.pi * max_range_m ** 3
    blind_spot_vol_m3 = sphere_vol * blind_fraction

    # Operating envelope check
    sufficient_range = max_range_m >= braking_distance_m * 1.5   # 50% safety
    sufficient_rate = rate_hz >= 20   # min 20Hz for dynamic obstacles

    # Recommend sensor count for 360° coverage with this single-sensor FOV
    sensors_for_360 = math.ceil(360 / max(1, fov_deg))

    return {
        "sensor_type": sensor_type,
        "max_range_m": max_range_m,
        "fov_deg": fov_deg,
        "frame_rate_hz": rate_hz,
        "drone_max_speed_ms": drone_max_speed_ms,
        "max_deceleration_ms2": deceleration_ms2,
        "total_latency_ms": round(total_latency_ms, 1),
        "braking_distance_at_max_speed_m": round(braking_distance_m, 2),
        "safety_margin_ratio": round(safety_margin, 2),
        "sufficient_range": sufficient_range,
        "sufficient_rate": sufficient_rate,
        "blind_spot_solid_angle_sr": round(blind_solid_angle, 3),
        "blind_spot_fraction": round(blind_fraction, 3),
        "blind_spot_volume_m3": round(blind_spot_vol_m3, 2),
        "sensors_for_360_deg_coverage": sensors_for_360,
        "sensor_cost_gbp_per_unit": sensor["cost_gbp"],
        "total_cost_360_gbp": sensors_for_360 * sensor["cost_gbp"],
        "sensor_mass_g_per_unit": sensor["mass_g"],
        "total_mass_g_360": sensors_for_360 * sensor["mass_g"],
        "weather_capable": sensor["works_in_fog_rain"],
        "minimum_rate_for_dynamic_obstacles_hz": 20,
        "recommendations": (
            ["Add fast sensor (radar/lidar) for forward-facing" if not sufficient_range else
             "Range adequate for max speed"]
            + (["Increase frame rate or sensor count for full coverage"] if not sufficient_rate else [])
            + ([f"Use {sensor_type} + complementary sensor for blind spots"]
                if blind_fraction > 0.3 else [])
        ),
        "notes": (
            f"Per ISO 21629 + SAE AS6968. Braking distance accounts for sensor latency "
            f"({sensor['latency_ms']}ms) + control loop (50ms). Multirotors decelerate "
            f"at 5-8 m/s² typical. {sensor_type.upper()} weather capability: "
            f"{'OK rain/fog' if sensor['works_in_fog_rain'] else 'degrades in low visibility'}."
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
