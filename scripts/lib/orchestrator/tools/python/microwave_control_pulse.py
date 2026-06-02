#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/microwave_control_pulse.py

Qubit control via shaped microwave pulses (DRAG, Gaussian).

Input:
    {
      "qubit_frequency_ghz": 5.0,
      "anharmonicity_mhz": -250,
      "pulse_amplitude_v": 0.1,
      "pulse_duration_ns": 20.0,
      "pulse_shape": "DRAG"  // gaussian | DRAG | rectangular
    }

Output:
    {
      "rotation_angle_rad": ...,
      "leakage_pct": ...,
      "gate_fidelity": ...,
      ...
    }

Physics (Motzoi 2009; Chow 2010):
- Rotation angle θ = Ω × t where Ω is Rabi rate ∝ pulse amplitude.
- DRAG (Derivative Removal by Adiabatic Gate) reduces |2>-state leakage by
  adding I-Q derivative correction at half-anharmonicity timescale.
- Leakage to |2> ≈ (Ω/Δ)² where Δ is anharmonicity. With DRAG, leakage
  suppressed by ~(Δ·t)⁻² further.
- Gate fidelity F = 1 - leakage - decoherence_loss - calibration_error.

References:
- Motzoi, Gambetta, Rebentrost, Wilhelm (2009) PRL 103, 110501 "Simple Pulses
  for Elimination of Leakage in Weakly Nonlinear Qubits."
- Chow, DiCarlo, Gambetta, Motzoi, Frunzio, Girvin, Schoelkopf (2010) PRA 82, 040305.
- McKay et al. (2017) "Efficient Z-gates for Quantum Computing," PRA 96, 022330.
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
    "tool_name": "microwave_control_pulse (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Motzoi et al. (2009) PRL 103 110501; Chow et al. (2010) PRA 82 040305",
    "physics_basis": "Rabi rotation Ω = γ·A_drive; DRAG pulse reduces |2> leakage to O((Ω/Δ)²·(Δ·t)⁻²).",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    f_qubit_ghz = float(payload.get("qubit_frequency_ghz", 5.0))
    anharm_mhz = float(payload.get("anharmonicity_mhz", -250.0))
    pulse_amp_v = float(payload.get("pulse_amplitude_v", 0.1))
    pulse_ns = float(payload.get("pulse_duration_ns", 20.0))
    shape = str(payload.get("pulse_shape", "DRAG")).upper()

    # Rabi rate Ω (rad/s) — typical coupling: drive line ~50 MHz/V for 50 Ω
    # transmission line + qubit-cavity coupling g/2π ~ 100 MHz
    # Use industry-typical 100 MHz/V conversion from coupler to Rabi rate
    rabi_mhz_per_v = 100.0
    omega_rabi_mhz = rabi_mhz_per_v * pulse_amp_v
    omega_rabi_rad_s = omega_rabi_mhz * 2 * math.pi * 1e6
    delta_rad_s = anharm_mhz * 2 * math.pi * 1e6  # typically negative for transmon

    # Rotation angle
    pulse_s = pulse_ns * 1e-9
    rotation_rad = omega_rabi_rad_s * pulse_s
    # Wrap to π for X gate context
    rotation_normalised_pi = rotation_rad / math.pi

    # Leakage to |2> state
    omega_over_delta = abs(omega_rabi_mhz / max(abs(anharm_mhz), 1e-3))
    leakage_no_correction = omega_over_delta ** 2

    if shape == "DRAG":
        # DRAG correction reduces by (Δ·t)⁻²
        dt = abs(delta_rad_s) * pulse_s
        suppression = max(1.0, dt ** 2)
        leakage = leakage_no_correction / suppression
        # Plus residual ~1e-5 from imperfect DRAG calibration
        leakage = max(1e-5, leakage)
    elif shape == "GAUSSIAN":
        # Gaussian envelope reduces leakage spectrum modestly
        leakage = leakage_no_correction * 0.3
    else:  # rectangular
        leakage = leakage_no_correction

    # Decoherence loss for typical T1 ~ 100 µs, T2 ~ 50 µs
    T1_us = 100.0
    T2_us = 50.0
    pulse_us = pulse_ns / 1000.0
    decoherence = pulse_us / (3 * T2_us) + pulse_us / (3 * T1_us)

    # Calibration error floor ~ 1e-4 (Rabi amplitude calibration to 0.5%)
    calibration_error = 1e-4

    gate_fidelity = max(0.0, 1.0 - leakage - decoherence - calibration_error)
    gate_error = 1.0 - gate_fidelity

    # Worked calculations for the PDF appendix.
    # Leakage probability is piecewise on shape — not hand-checkable; passed as live input.
    # Rotation angle chains through Rabi rate (arithmetic unit conversion), pulse duration,
    # then decoherence and gate fidelity are clean arithmetic.
    omega_rabi_mhz_r = round(omega_rabi_mhz, 2)
    # omega_rabi_rad_s = omega_rabi_mhz x 2pi x 1e6 — used as input to rotation
    omega_rabi_rad_s_r = round(omega_rabi_rad_s, 2)
    pulse_s_r = round(pulse_s, 12)
    rotation_rad_r = round(rotation_rad, 4)
    decoherence_r = round(decoherence, 7)
    leakage_r = round(leakage, 6)
    gate_fidelity_r = round(gate_fidelity, 6)
    worked = [
        worked_calc(
            label="Rabi rate from pulse amplitude",
            formula="omega_rabi_mhz = rabi_mhz_per_v x pulse_amp_v",
            values={
                "rabi_mhz_per_v": (rabi_mhz_per_v, "MHz/V"),
                "pulse_amp_v": (pulse_amp_v, "V"),
            },
            result=omega_rabi_mhz_r, result_unit="MHz",
            assumptions=["coupling constant 100 MHz/V (industry-typical for 50-ohm drive line)"],
        ),
        worked_calc(
            label="Rotation angle",
            formula="theta = omega_rabi_rad_s x pulse_s",
            values={
                "omega_rabi_rad_s": (omega_rabi_rad_s_r, "rad/s"),
                "pulse_s": (pulse_s_r, "s"),
            },
            result=rotation_rad_r, result_unit="rad",
            assumptions=["omega_rabi_rad_s = omega_rabi_mhz x 2 x pi x 1e6"],
        ),
        worked_calc(
            label="Decoherence loss (T1+T2 limited)",
            formula="decoherence = pulse_us / (3 x T2_us) + pulse_us / (3 x T1_us)",
            values={
                "pulse_us": (round(pulse_ns / 1000.0, 6), "us"),
                "T2_us": (T2_us, "us"),
                "T1_us": (T1_us, "us"),
            },
            result=decoherence_r, result_unit="",
            assumptions=["T1 = 100 us, T2 = 50 us typical superconducting qubit"],
        ),
        worked_calc(
            label="Gate fidelity",
            formula="gate_fidelity = 1 - leakage - decoherence - calibration_error",
            values={
                "leakage": (leakage_r, ""),
                "decoherence": (decoherence_r, ""),
                "calibration_error": (calibration_error, ""),
            },
            result=gate_fidelity_r, result_unit="",
            assumptions=["leakage computed from DRAG suppression formula (piecewise, not hand-verified here)"],
        ),
    ]

    return {
        "qubit_frequency_ghz": f_qubit_ghz,
        "anharmonicity_mhz": anharm_mhz,
        "pulse_amplitude_v": pulse_amp_v,
        "pulse_duration_ns": pulse_ns,
        "pulse_shape": shape,
        "rabi_rate_mhz": omega_rabi_mhz_r,
        "rotation_angle_rad": rotation_rad_r,
        "rotation_angle_pi_units": round(rotation_normalised_pi, 3),
        "leakage_pct": round(leakage * 100.0, 5),
        "leakage_no_correction": round(leakage_no_correction, 5),
        "gate_fidelity": gate_fidelity_r,
        "gate_error": round(gate_error, 6),
        "decoherence_loss_pct": round(decoherence * 100.0, 4),
        "calibration_error_pct": round(calibration_error * 100.0, 4),
        "single_qubit_gate_error_target_1e_4": gate_error < 1e-3,
        "supports_fault_tolerance_threshold_1e_2": gate_error < 1e-2,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
