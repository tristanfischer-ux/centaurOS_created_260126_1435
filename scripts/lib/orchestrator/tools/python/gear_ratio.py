#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/gear_ratio.py

E-bike / EV motor → wheel gear ratio + top-speed calculator.
Stdin JSON -> stdout JSON.

Input:
    {
      "motor_kv": 100.0,                   # rpm/V — e-bike hub motors much lower than drones
      "battery_v": 36.0,
      "wheel_diameter_mm": 700.0,          # 27.5" wheel ≈ 698 mm
      "pulley_teeth_motor": 22,
      "pulley_teeth_wheel": 60,
      "max_torque_nm": 80.0,               # peak motor torque
      "battery_capacity_kwh": 0.7
    }

Output:
    {
      "max_speed_kmh": 35.0,
      "gear_ratio": 2.73,
      "motor_rpm_at_speed": 950,
      "max_thrust_n": 130.0,
      "torque_at_wheel_nm": 218.0,
      ...
    }

Method:
  - No-load motor rpm = Kv × battery_V
  - Wheel rpm = motor_rpm / gear_ratio
  - Wheel circumference = π × D
  - Top speed = wheel_rpm × circumference / 60
  - Torque at wheel = motor_torque × gear_ratio × η_drive
  - For hub motor (no gearing): ratio = 1.0

Reference: E-bike motor design (Heinz Stoll's "Brushless DC Motor Design"
2002), Bosch Performance Line CX datasheet, Bafang BBSHD wiki.

License: MIT.
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
    "tool_name": 'gear_ratio (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'Bosch CX Drive Unit Technical Data; Bafang BBSHD service manual',
    "physics_basis": 'Motor RPM = Kv × V. Wheel RPM = motor RPM / gear_ratio. Speed = wheel RPM × π × D_wheel.',
    "confidence_class": 'datasheet',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    kv = float(payload.get("motor_kv", 100.0))
    v_batt = float(payload.get("battery_v", 36.0))
    wheel_d_mm = float(payload.get("wheel_diameter_mm", 700.0))
    teeth_motor = float(payload.get("pulley_teeth_motor", 22))
    teeth_wheel = float(payload.get("pulley_teeth_wheel", 60))
    t_motor_nm = float(payload.get("max_torque_nm", 50.0))
    cap_kwh = float(payload.get("battery_capacity_kwh", 0.5))
    drive_eta = float(payload.get("drive_efficiency", 0.85))

    # No-load RPM
    no_load_rpm = kv * v_batt

    # Gear ratio (motor:wheel)
    gear_ratio = teeth_wheel / max(0.1, teeth_motor)

    # Wheel RPM at no-load
    wheel_rpm_max = no_load_rpm / max(0.001, gear_ratio)

    # Top speed (no resistance, no load drop)
    wheel_circ_m = math.pi * (wheel_d_mm * 1e-3)
    top_speed_kmh = (wheel_rpm_max * wheel_circ_m * 60.0) / 1000.0

    # Realistic top speed: motor RPM drops to ~80% under load
    realistic_speed_kmh = top_speed_kmh * 0.80

    # Torque at wheel after gearing (multiplied)
    t_wheel_nm = t_motor_nm * gear_ratio * drive_eta

    # Wheel thrust force = torque / radius
    f_thrust_n = t_wheel_nm / max(1e-3, wheel_d_mm * 1e-3 / 2.0)

    # Range estimate (assume 250 W draw at cruise — modest e-bike):
    # range_h = capacity / power
    cruise_power_w = 250.0
    range_h = (cap_kwh * 1000.0) / cruise_power_w
    range_km = realistic_speed_kmh * range_h * 0.7  # 70% factor for non-cruise

    # Motor RPM at top speed
    motor_rpm_at_top = no_load_rpm * 0.80

    # Worked calculations — all steps are plain arithmetic, chain-rounded.
    no_load_rpm_r = round(no_load_rpm, 1)
    gear_ratio_r = round(gear_ratio, 4)
    wheel_rpm_r = round(wheel_rpm_max, 1)
    circ_r = round(wheel_circ_m, 4)
    top_speed_r = round(top_speed_kmh, 2)
    realistic_r = round(realistic_speed_kmh, 2)
    t_wheel_r = round(t_wheel_nm, 3)
    f_thrust_r = round(f_thrust_n, 2)
    worked = [
        worked_calc(
            label="No-load motor RPM",
            formula="RPM_nl = Kv x V_batt",
            values={"Kv": (kv, "rpm/V"), "V_batt": (v_batt, "V")},
            result=no_load_rpm_r, result_unit="rpm",
            assumptions=["No-load speed; Kv = speed constant from motor datasheet"],
        ),
        worked_calc(
            label="Gear ratio (motor:wheel)",
            formula="GR = teeth_wheel / teeth_motor",
            values={"teeth_wheel": (teeth_wheel, ""), "teeth_motor": (teeth_motor, "")},
            result=gear_ratio_r, result_unit="",
            assumptions=["Belt/chain transmission; teeth counts from sprocket spec"],
        ),
        worked_calc(
            label="Wheel RPM at no-load",
            formula="RPM_wheel = RPM_nl / GR",
            values={"RPM_nl": (no_load_rpm_r, "rpm"), "GR": (gear_ratio_r, "")},
            result=wheel_rpm_r, result_unit="rpm",
            assumptions=["No slippage assumed"],
        ),
        worked_calc(
            label="Wheel circumference",
            formula="C_wheel = pi x D_wheel",
            values={"D_wheel": (round(wheel_d_mm * 1e-3, 4), "m")},
            result=circ_r, result_unit="m",
            assumptions=["D_wheel in metres = wheel_diameter_mm / 1000"],
        ),
        worked_calc(
            label="Top speed (no-load)",
            formula="V_top = RPM_wheel x C_wheel x 60 / 1000",
            values={
                "RPM_wheel": (wheel_rpm_r, "rpm"),
                "C_wheel": (circ_r, "m"),
            },
            result=top_speed_r, result_unit="km/h",
            assumptions=["x 60 converts rev/min to rev/hour; / 1000 converts m to km"],
        ),
        worked_calc(
            label="Realistic top speed (80% load derating)",
            formula="V_real = V_top x 0.80",
            values={"V_top": (top_speed_r, "km/h")},
            result=realistic_r, result_unit="km/h",
            assumptions=["Motor RPM drops ~20% under load (back-EMF + resistance)"],
        ),
        worked_calc(
            label="Torque at wheel (after gearing)",
            formula="T_wheel = T_motor x GR x eta_drive",
            values={
                "T_motor": (t_motor_nm, "Nm"),
                "GR": (gear_ratio_r, ""),
                "eta_drive": (drive_eta, ""),
            },
            result=t_wheel_r, result_unit="Nm",
            assumptions=["eta_drive = drive_efficiency (belt/chain loss factor)"],
        ),
        worked_calc(
            label="Wheel thrust force",
            formula="F_thrust = T_wheel / r_wheel",
            values={
                "T_wheel": (t_wheel_r, "Nm"),
                "r_wheel": (round(wheel_d_mm * 1e-3 / 2.0, 4), "m"),
            },
            result=f_thrust_r, result_unit="N",
            assumptions=["r_wheel = wheel_diameter_mm / 2000"],
        ),
    ]

    return {
        "max_speed_kmh": round(realistic_speed_kmh, 2),
        "max_speed_kmh_no_load": round(top_speed_kmh, 2),
        "gear_ratio": round(gear_ratio, 4),
        "motor_rpm_at_speed": round(motor_rpm_at_top, 1),
        "no_load_motor_rpm": round(no_load_rpm, 1),
        "wheel_rpm_max": round(wheel_rpm_max, 1),
        "max_thrust_n": round(f_thrust_n, 2),
        "torque_at_wheel_nm": round(t_wheel_nm, 3),
        "wheel_circumference_m": round(wheel_circ_m, 4),
        "range_km_at_250w": round(range_km, 1),
        "kv": kv,
        "battery_v": v_batt,
        "wheel_diameter_mm": wheel_d_mm,
        "drive_efficiency": drive_eta,
        "pulley_teeth_motor": teeth_motor,
        "pulley_teeth_wheel": teeth_wheel,
        "worked": worked,
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
