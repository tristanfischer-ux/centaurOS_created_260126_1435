#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ins_navigation_drift.py

INS (Inertial Navigation System) drift estimation for AUVs.

Position drift (open-loop INS):
    x_error(t) = ε_gyro × t² × g / 2     (second-order in time)
where ε_gyro = gyro bias drift (rad/s)

Velocity drift:
    v_error(t) = b_accel × t  (linear in time)

Gyro grades:
- MEMS:  bias stability 1-10 °/hr; bias 50-200 °/hr
- FOG:   bias stability 0.01-1 °/hr
- RLG:   bias stability 0.001-0.01 °/hr (Boeing 757 IRU)
- Hemispherical resonator: 0.0001 °/hr (top-tier)

Accel grades:
- MEMS:  bias 200-1000 μg, walk 50-300 μg/√hr
- Servo: bias 10-50 μg
- Quartz: bias 5-25 μg
- Nav-grade: bias <10 μg

Aided navigation:
- DVL (Doppler Velocity Log): bounds velocity error to ±0.1-1% of speed
- USBL/LBL: bounds position error to acoustic baseline accuracy
- GPS/GNSS fix at surface: resets drift to ~1m

References:
- Titterton & Weston, "Strapdown Inertial Navigation Technology", IET 2004
- Groves, "Principles of GNSS, Inertial, and Multisensor Integrated Navigation",
  3rd ed., Artech House 2013
- Sandia Labs NavSyM testbed reports
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'ins_navigation_drift (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Groves (2013), 'Principles of GNSS, Inertial, and Multisensor Integrated Navigation Systems' 2nd ed., Artech House",
    "physics_basis": 'Position drift σ_pos(t) = σ_accel × t² / 2 + σ_gyro × t³ / 6. DVL-aided drift reduced to ~0.1-1% of distance travelled.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


GYRO_GRADES: dict[str, dict] = {
    "mems":     {"bias_deg_hr": 50.0,    "stability_deg_hr": 5.0,
                  "noise_deg_sqrt_hr": 0.5,  "cost_gbp": 200,    "size_class": "tiny"},
    "tactical": {"bias_deg_hr": 1.0,     "stability_deg_hr": 0.5,
                  "noise_deg_sqrt_hr": 0.1,  "cost_gbp": 5000,    "size_class": "small"},
    "fog":      {"bias_deg_hr": 0.1,     "stability_deg_hr": 0.01,
                  "noise_deg_sqrt_hr": 0.01, "cost_gbp": 30000,   "size_class": "small"},
    "rlg":      {"bias_deg_hr": 0.005,   "stability_deg_hr": 0.003,
                  "noise_deg_sqrt_hr": 0.003,"cost_gbp": 80000,   "size_class": "medium"},
    "navgrade": {"bias_deg_hr": 0.001,   "stability_deg_hr": 0.001,
                  "noise_deg_sqrt_hr": 0.002,"cost_gbp": 200000,  "size_class": "large"},
}

ACCEL_GRADES: dict[str, dict] = {
    "mems":     {"bias_mg": 1.0,   "stability_ug": 200, "cost_gbp": 50},
    "tactical": {"bias_mg": 0.1,   "stability_ug": 50,  "cost_gbp": 1500},
    "servo":    {"bias_mg": 0.05,  "stability_ug": 25,  "cost_gbp": 10000},
    "quartz":   {"bias_mg": 0.01,  "stability_ug": 10,  "cost_gbp": 25000},
    "navgrade": {"bias_mg": 0.002, "stability_ug": 3,   "cost_gbp": 80000},
}


def compute(payload: dict) -> dict:
    gyro_grade = str(payload.get("gyro_grade", "tactical")).lower()
    accel_grade = str(payload.get("accelerometer_grade", "tactical")).lower()
    dvl_present = bool(payload.get("dvl_present", True))
    mission_hours = float(payload.get("mission_duration_hours", 24))
    dvl_accuracy_pct = float(payload.get("dvl_accuracy_pct", 0.2))   # 0.2% of speed
    average_speed_ms = float(payload.get("average_speed_ms", 1.5))

    if gyro_grade not in GYRO_GRADES:
        return {"error": f"Unknown gyro_grade '{gyro_grade}'. Available: {list(GYRO_GRADES.keys())}"}
    if accel_grade not in ACCEL_GRADES:
        return {"error": f"Unknown accelerometer_grade '{accel_grade}'. Available: {list(ACCEL_GRADES.keys())}"}

    gyro = GYRO_GRADES[gyro_grade]
    accel = ACCEL_GRADES[accel_grade]

    # Attitude drift: angle error ω_err × t
    bias_deg_hr = gyro["bias_deg_hr"]
    bias_rad_s = math.radians(bias_deg_hr) / 3600.0
    attitude_drift_deg_per_hr = bias_deg_hr

    # Position drift open-loop INS (Schuler oscillation suppressed assumption):
    # Position error ~ (1/3) × bias_rad_s × g × t²  for short times
    # Where g ≈ 9.81 m/s²
    g = 9.81
    t_s = 3600.0   # 1 hour
    position_drift_m_per_hr = (1/3) * bias_rad_s * g * t_s ** 2

    # If DVL aided, position error doesn't grow with t² but with velocity error × time
    # DVL velocity error = 0.2% × v_avg
    dvl_vel_err_ms = (dvl_accuracy_pct / 100) * average_speed_ms

    if dvl_present:
        # Position drift ~ DVL velocity error × time
        position_drift_m_per_hr_aided = dvl_vel_err_ms * 3600.0
    else:
        position_drift_m_per_hr_aided = position_drift_m_per_hr

    # Surface fix interval (recommended)
    # Want position error < 100m typically
    if position_drift_m_per_hr_aided > 0:
        surface_fix_interval_hours = 100.0 / position_drift_m_per_hr_aided
    else:
        surface_fix_interval_hours = 999

    surface_fix_interval_minutes = surface_fix_interval_hours * 60

    # Total drift over mission
    total_position_drift_m = position_drift_m_per_hr_aided * mission_hours
    total_attitude_drift_deg = attitude_drift_deg_per_hr * mission_hours

    # IMU + DVL cost
    imu_cost = gyro["cost_gbp"] + accel["cost_gbp"] * 3  # 3 accels (xyz)
    dvl_cost = 25000 if dvl_present else 0
    total_nav_cost = imu_cost + dvl_cost

    # Recommendations
    recs: list[str] = []
    if not dvl_present and position_drift_m_per_hr > 50:
        recs.append("Add DVL - bounds velocity error to <0.5% of speed (huge benefit)")
    if gyro_grade in ("mems",) and mission_hours > 6:
        recs.append("MEMS gyro inadequate for >6 hr mission - upgrade to FOG (cost £30k)")
    if surface_fix_interval_minutes < 30:
        recs.append("Surface fix every <30 min disrupts mission - upgrade IMU OR add USBL acoustic positioning")
    if not recs:
        recs.append("Navigation accuracy adequate for mission duration.")

    return {
        "gyro_grade": gyro_grade,
        "gyro_bias_deg_hr": bias_deg_hr,
        "gyro_bias_stability_deg_hr": gyro["stability_deg_hr"],
        "gyro_size_class": gyro["size_class"],
        "accelerometer_grade": accel_grade,
        "accel_bias_mg": accel["bias_mg"],
        "accel_stability_ug": accel["stability_ug"],
        "dvl_present": dvl_present,
        "dvl_accuracy_pct": dvl_accuracy_pct,
        "average_speed_ms": average_speed_ms,
        "attitude_drift_deg_per_hour": round(attitude_drift_deg_per_hr, 4),
        "position_drift_m_per_hour_inertial_only": round(position_drift_m_per_hr, 1),
        "position_drift_m_per_hour": round(position_drift_m_per_hr_aided, 2),
        "surface_fix_interval_minutes_recommended": round(surface_fix_interval_minutes, 1),
        "total_position_drift_m": round(total_position_drift_m, 1),
        "total_attitude_drift_deg": round(total_attitude_drift_deg, 2),
        "mission_duration_hours": mission_hours,
        "imu_cost_gbp": imu_cost,
        "dvl_cost_gbp": dvl_cost,
        "total_navigation_cost_gbp": total_nav_cost,
        "recommendations": recs,
        "notes": (
            "Open-loop INS position drift = (1/3) × bias × g × t². "
            "DVL bounds velocity error to ~0.2% of speed = drastically lower drift. "
            "Pair IMU grade with DVL for 24+ hour missions. Surface fix opportunity "
            "resets drift but disrupts dive ops."
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
