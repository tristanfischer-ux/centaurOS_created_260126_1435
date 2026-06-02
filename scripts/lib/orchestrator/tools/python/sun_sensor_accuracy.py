#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/sun_sensor_accuracy.py

Sun sensor performance — digital, analog, fine, coarse sensors.

Companies served: Solar MEMS Technologies (ES), AAC Clyde Space sun sensors,
Bradford Engineering EU partners.

Input:
    {
      "sensor_type": "digital" | "analog" | "fine" | "coarse",
      "FOV_deg": 120.0,
      "detector_resolution_bits": 14
    }

Output:
    accuracy_arcsec, update_rate_hz, mass_g, power_w, _provenance.

Physics:
  Angular accuracy = FOV / 2^bits (digital) or (sensor_resolution + temp_drift) (analog)
  Fine sun sensor: 0.005-0.05 degrees; coarse: 0.5-5 degrees
  Update rate set by ADC / processing

References:
- Wertz, J.R. (ed.), "Spacecraft Attitude Determination and Control",
  Kluwer 1978, ch.6.
- Springmann, J., Cutler, J.W., "Attitude-Independent Magnetometer Calibration
  with Time-Varying Bias", J. Guidance Control Dyn. 35(4):1080-1088, 2012.
- Solar MEMS datasheets (nanoSSOC-D60, microSSOC).
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
    "tool_name": "sun_sensor_accuracy (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Wertz (1978) 'Spacecraft Attitude Determination and Control' Kluwer ch.6; "
        "Solar MEMS Technologies nanoSSOC-D60 datasheet (2021); "
        "Bradford Engineering sun sensor product line."
    ),
    "physics_basis": (
        "Digital sun-sensor reads quad-cell + slit shadow position. "
        "Accuracy = FOV / 2^bits at ADC level + drift. Coarse sun sensor "
        "based on cosine response of photodiode array."
    ),
    "confidence_class": "datasheet",
    "embedded_constants": {
        "SOLAR_MEMS_SPECS": {
            "source": "Solar MEMS nanoSSOC-D60 datasheet — accuracy 0.5° (3sigma), FoV 60°, "
                      "mass 4 g, power <0.5 W",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Sensor type defaults
SENSOR_TYPES = {
    "coarse":  {"accuracy_deg": 2.0, "fov_deg": 120, "mass_g": 30, "power_w": 0.2, "update_hz": 10},
    "analog":  {"accuracy_deg": 0.5, "fov_deg": 90, "mass_g": 20, "power_w": 0.3, "update_hz": 10},
    "digital": {"accuracy_deg": 0.05, "fov_deg": 60, "mass_g": 10, "power_w": 0.4, "update_hz": 50},
    "fine":    {"accuracy_deg": 0.005, "fov_deg": 30, "mass_g": 50, "power_w": 1.5, "update_hz": 100},
    "QUAD":    {"accuracy_deg": 0.01, "fov_deg": 90, "mass_g": 50, "power_w": 0.5, "update_hz": 30},
    "APS":     {"accuracy_deg": 0.005, "fov_deg": 90, "mass_g": 80, "power_w": 0.8, "update_hz": 100},
}


def compute(payload: dict) -> dict:
    sensor_type = str(payload.get("sensor_type", "digital"))
    fov_deg = float(payload.get("FOV_deg", SENSOR_TYPES.get(sensor_type, SENSOR_TYPES["digital"])["fov_deg"]))
    bits = int(payload.get("detector_resolution_bits", 14))

    if sensor_type not in SENSOR_TYPES:
        sensor_type = "digital"
    s = SENSOR_TYPES[sensor_type]

    # Accuracy
    if sensor_type in ("digital", "fine", "QUAD", "APS"):
        # Limited by ADC LSB: accuracy = FOV / 2^bits
        adc_resolution_deg = fov_deg / (2 ** bits)
        # Plus systematic error (thermal, optical)
        systematic_error_deg = s["accuracy_deg"]
        total_accuracy_deg = math.sqrt(adc_resolution_deg ** 2 + systematic_error_deg ** 2)
    elif sensor_type == "analog":
        total_accuracy_deg = s["accuracy_deg"]
    else:  # coarse
        total_accuracy_deg = s["accuracy_deg"]

    accuracy_arcsec = total_accuracy_deg * 3600.0

    # Update rate
    update_rate_hz = s["update_hz"]

    # Mass / power
    mass_g = s["mass_g"]
    power_w = s["power_w"]

    # Worked calculations.
    # adc_resolution_deg = FOV / 2^bits is only valid for digital/fine/QUAD/APS.
    # total_accuracy_deg uses sqrt-of-sum-of-squares (SKIP: transcendental) — pass
    # the live computed value as a symbol for the arcsec conversion step.
    total_acc_r = round(total_accuracy_deg, 5)
    worked = []
    if sensor_type in ("digital", "fine", "QUAD", "APS"):
        adc_r = round(fov_deg / (2 ** bits), 6)
        worked.append(worked_calc(
            label="ADC angular resolution",
            formula="adc_res_deg = FOV_deg / 2^bits",
            values={"FOV_deg": (fov_deg, "deg"), "bits": (bits, "")},
            result=adc_r, result_unit="deg",
            assumptions=["Digital sun sensor: one LSB spans FOV / 2^bits"],
        ))
    worked.append(worked_calc(
        label="Accuracy in arcseconds",
        formula="accuracy_arcsec = total_accuracy_deg x 3600",
        values={"total_accuracy_deg": (total_acc_r, "deg")},
        result=round(accuracy_arcsec, 1), result_unit="arcsec",
        assumptions=["1 degree = 3600 arcseconds; total_accuracy_deg is RSS of ADC "
                     "resolution and systematic error (sqrt step not shown — transcendental)"],
    ))

    return {
        "sensor_type": sensor_type,
        "FOV_deg": fov_deg,
        "detector_resolution_bits": bits,
        "adc_resolution_deg": round(fov_deg / (2 ** bits), 6),
        "systematic_error_deg": s["accuracy_deg"],
        "total_accuracy_deg": round(total_accuracy_deg, 5),
        "accuracy_arcsec": round(accuracy_arcsec, 1),
        "update_rate_hz": update_rate_hz,
        "mass_g": mass_g,
        "power_w": power_w,
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
