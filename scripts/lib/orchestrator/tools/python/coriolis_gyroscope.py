#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/coriolis_gyroscope.py

Coriolis vibratory gyroscope — quartz/silicon/MEMS resonator gyro performance.

Companies served: InnaLabs (IE/UK), Honeywell IRU, Northrop Grumman LITEF
(EU operations).

Input:
    {
      "resonator_type": "quartz" | "silicon" | "MEMS",
      "drive_frequency_khz": 10.0,
      "Q_factor": 1e6
    }

Output:
    bias_stability_deg_hr, ARW_deg_sqrthr, scale_factor_stability_ppm,
    bandwidth_hz, _provenance.

Physics:
  Coriolis force in vibrating mass: F_cor = -2 m omega × v_vib
  Pickup signal amplitude proportional to angular rate
  ARW ~ sqrt(kT / (4 Q m omega_d * V_d^2 / 4))
  Q-factor dominates noise: higher Q → better bias stability

References:
- Lynch, D.D., "Coriolis vibratory gyros", IEEE PLANS 1998, pp.66-77.
  DOI: 10.1109/PLANS.1998.670213
- Lynch, D.D., "Vibratory Gyro Analysis by the Method of Averaging",
  Proc. 2nd St. Petersburg Conf. on Gyroscopic Tech. and Navigation, 1995.
- IEEE Std 528-2001 "IEEE Standard for Inertial Sensor Terminology".
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "coriolis_gyroscope (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Lynch (1998) IEEE PLANS pp.66-77 DOI:10.1109/PLANS.1998.670213; "
        "Lynch (1995) Proc. 2nd St. Petersburg Conf.; "
        "IEEE Std 528-2001."
    ),
    "physics_basis": (
        "Coriolis-vibratory gyro: drive vibration in axis 1, sense Coriolis "
        "coupling to axis 2 from rotation. Performance limited by drive-mode "
        "thermal noise and Q-factor. ARW ~ 1/sqrt(Q)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "RESONATOR_PARAMETERS": {
            "source": "Lynch 1995 + InnaLabs / Honeywell datasheets — quartz HRG Q~1e6, silicon MEMS Q~1e4-1e5",
            "confidence": "industry_typical",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


RESONATOR_PROPERTIES = {
    "quartz_HRG":  {"q_typical": 1e7, "drive_khz_typical": 10, "mass_g": 50},
    "quartz":      {"q_typical": 1e6, "drive_khz_typical": 10, "mass_g": 50},
    "silicon":     {"q_typical": 1e5, "drive_khz_typical": 20, "mass_g": 1},
    "MEMS":        {"q_typical": 5e4, "drive_khz_typical": 30, "mass_g": 0.01},
    "FOG":         {"q_typical": 1e8, "drive_khz_typical": 0, "mass_g": 300},  # fiber-optic baseline
    "RLG":         {"q_typical": 1e8, "drive_khz_typical": 0, "mass_g": 200},  # ring-laser baseline
}


def compute(payload: dict) -> dict:
    resonator = str(payload.get("resonator_type", "quartz"))
    drive_freq_khz = float(payload.get("drive_frequency_khz", 10.0))
    q_factor = float(payload.get("Q_factor", 1e6))

    if resonator not in RESONATOR_PROPERTIES:
        resonator = "MEMS"
    r = RESONATOR_PROPERTIES[resonator]

    # ARW (angular random walk) — thermal noise limit
    # ARW = sqrt(2 kT / (m * Q * omega_d^3 * x_d^2)) (Lynch eq.15)
    # Simplified scaling: ARW ~ 1 / sqrt(Q * f_d * mass)
    # Reference: high-Q HRG = 0.001 deg/sqrt(hr); MEMS = 0.1-1 deg/sqrt(hr)
    mass_g = r["mass_g"]
    omega_d = 2 * math.pi * drive_freq_khz * 1000  # rad/s
    # Calibrate to known values
    arw_reference_quartz_q1e6 = 0.005  # deg/sqrt(hr)
    arw_factor = math.sqrt((1e6 / q_factor) * (1.0 / drive_freq_khz * 10.0) * (50.0 / mass_g))
    arw_deg_sqrthr = arw_reference_quartz_q1e6 * arw_factor

    # Bias stability — long-term drift, typically 10-100x worse than ARW
    bias_stability_deg_hr = arw_deg_sqrthr * 30.0
    # Q-factor improves bias more than ARW
    if q_factor > 1e6:
        bias_stability_deg_hr *= (1e6 / q_factor) ** 0.5

    # Bandwidth
    # BW ~ 0.5 * f_resonant / Q (closed-loop)
    bandwidth_hz = 0.5 * drive_freq_khz * 1000 / max(q_factor, 100)
    if bandwidth_hz > 1000:
        bandwidth_hz = 1000  # capped by readout electronics

    # Scale factor stability
    # ppm = parts per million; temperature compensation typically 50-500 ppm
    if resonator == "quartz_HRG":
        sf_stability_ppm = 10
    elif resonator == "quartz":
        sf_stability_ppm = 50
    elif resonator == "silicon":
        sf_stability_ppm = 200
    elif resonator == "MEMS":
        sf_stability_ppm = 1000
    elif resonator == "FOG":
        sf_stability_ppm = 5
    elif resonator == "RLG":
        sf_stability_ppm = 2
    else:
        sf_stability_ppm = 100

    return {
        "resonator_type": resonator,
        "drive_frequency_khz": drive_freq_khz,
        "Q_factor": q_factor,
        "mass_g": mass_g,
        "ARW_deg_sqrthr": round(arw_deg_sqrthr, 5),
        "bias_stability_deg_hr": round(bias_stability_deg_hr, 4),
        "scale_factor_stability_ppm": sf_stability_ppm,
        "bandwidth_hz": round(bandwidth_hz, 2),
        "performance_grade": _classify_grade(bias_stability_deg_hr),
    }


def _classify_grade(bias_deg_hr: float) -> str:
    if bias_deg_hr < 0.01:
        return "navigation_grade"
    elif bias_deg_hr < 1.0:
        return "tactical_grade"
    elif bias_deg_hr < 10.0:
        return "industrial_grade"
    else:
        return "consumer_grade"


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
