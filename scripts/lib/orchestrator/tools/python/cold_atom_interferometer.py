#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cold_atom_interferometer.py

Cold-atom interferometer / quantum gravimeter / accelerometer sizing.
Based on Mach-Zehnder atom-interferometer geometry with two-photon
Raman or Bragg pulses.

Companies served: Aquark Technologies, Delta.g, Q-CTRL (UK), Muquans (FR),
iXBlue (FR), AOSense (US partner), M-Squared Lasers.

Input:
    {
      "atom_species": "Rb87" | "Cs133" | "Sr87" | "K39",
      "interrogation_time_ms": 100.0,
      "fringe_contrast_pct": 80.0,
      "atom_number": 1e7,
      "shot_to_shot_rate_hz": 1.0,
      "temperature_uK": 1.0
    }

Output:
    sensitivity_g_per_sqrthz, bias_stability_micro_g, size_volume_l,
    velocity_recoil_mm_s, signal_to_noise, _provenance.

Physics:
  Phase shift in Mach-Zehnder atom interferometer (Kasevich-Chu 1991):
    Delta_phi = k_eff * a * T^2
  where k_eff = 2 k_laser (two-photon Raman), T is interrogation time
  Sensitivity (shot-noise limited):
    sigma_a = 1 / (k_eff * T^2 * C * sqrt(N_atoms * rate))
  Recoil velocity v_rec = hbar k / m

References:
- Kasevich, M., Chu, S., "Atomic interferometry using stimulated Raman
  transitions", Phys. Rev. Lett. 67(2):181-184, 1991.
  DOI: 10.1103/PhysRevLett.67.181
- Peters, A., Chung, K.Y., Chu, S., "High-precision gravity measurements
  using atom interferometry", Metrologia 38:25-61, 2001.
- Geiger, R., Landragin, A., Merlet, S., Pereira Dos Santos, F.,
  "High-accuracy inertial measurements with cold-atom sensors", AVS
  Quantum Sci. 2(2):024702, 2020.
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
    "tool_name": "cold_atom_interferometer (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Kasevich & Chu (1991) PRL 67:181 DOI:10.1103/PhysRevLett.67.181; "
        "Peters, Chung & Chu (2001) Metrologia 38:25; "
        "Geiger et al. (2020) AVS Quantum Sci. 2(2):024702 DOI:10.1116/5.0009093."
    ),
    "physics_basis": (
        "Mach-Zehnder atom interferometer phase Delta_phi = k_eff a T^2. "
        "Shot-noise-limited sensitivity sigma = 1/(k_eff T^2 C sqrt(N rate)). "
        "Atomic recoil velocity v_rec = hbar k / m."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "ATOM_PROPERTIES": {
            "source": "Steck, Rubidium 87 D Line Data (steck.us/alkalidata); Steck Cs D Line Data; Sansonetti, NIST handbook 2014",
            "confidence": "textbook",
        },
        "G_STANDARD": {
            "source": "CODATA 2018: g_n = 9.80665 m/s^2 (standard gravity)",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Atomic properties: mass (kg), D-line wavelength (m), recoil velocity (m/s)
ATOMS = {
    "Rb87": {"mass_kg": 1.443e-25, "lambda_m": 780e-9, "name": "Rubidium-87"},
    "Cs133": {"mass_kg": 2.207e-25, "lambda_m": 852e-9, "name": "Caesium-133"},
    "Sr87": {"mass_kg": 1.443e-25, "lambda_m": 461e-9, "name": "Strontium-87"},
    "K39": {"mass_kg": 6.470e-26, "lambda_m": 767e-9, "name": "Potassium-39"},
    "Yb171": {"mass_kg": 2.836e-25, "lambda_m": 399e-9, "name": "Ytterbium-171"},
}

HBAR = 1.0545718e-34  # J*s
G_STANDARD = 9.80665  # m/s^2
KB = 1.380649e-23  # Boltzmann J/K


def compute(payload: dict) -> dict:
    species = str(payload.get("atom_species", "Rb87"))
    T_ms = float(payload.get("interrogation_time_ms", 100.0))
    contrast_pct = float(payload.get("fringe_contrast_pct", 80.0))
    N_atoms = float(payload.get("atom_number", 1e7))
    rate_hz = float(payload.get("shot_to_shot_rate_hz", 1.0))
    temp_uk = float(payload.get("temperature_uK", 1.0))

    if species not in ATOMS:
        raise ValueError(f"unknown atom species {species!r}; known: {list(ATOMS)}")
    atom = ATOMS[species]

    m = atom["mass_kg"]
    lambda_m = atom["lambda_m"]
    k_laser = 2.0 * math.pi / lambda_m
    k_eff = 2.0 * k_laser  # two-photon Raman

    # Recoil velocity
    v_rec = HBAR * k_laser / m
    v_rec_mm_s = v_rec * 1000.0

    # Interrogation time in seconds
    T_s = T_ms / 1000.0
    contrast = contrast_pct / 100.0

    # Shot-noise-limited acceleration sensitivity (per shot)
    # sigma_phi (per shot) = 1 / (C * sqrt(N))
    # sigma_a = sigma_phi / (k_eff * T^2)
    sigma_phi_per_shot = 1.0 / (contrast * math.sqrt(N_atoms))
    sigma_a_per_shot = sigma_phi_per_shot / (k_eff * T_s ** 2)

    # Per sqrt(Hz):
    sigma_a_per_sqrthz = sigma_a_per_shot / math.sqrt(rate_hz)
    sensitivity_g_per_sqrthz = sigma_a_per_sqrthz / G_STANDARD
    sensitivity_micro_g_per_sqrthz = sensitivity_g_per_sqrthz * 1e6

    # Bias stability: typically achievable with 1000s averaging
    avg_time_s = 1000.0
    bias_stability_micro_g = sensitivity_micro_g_per_sqrthz / math.sqrt(avg_time_s)

    # Vacuum chamber / total instrument size
    # Cloud expansion: sigma_x(T) = sigma_0 + v_thermal * T
    # v_thermal = sqrt(kB * T_atoms / m)
    T_atoms_k = temp_uk * 1e-6
    v_thermal = math.sqrt(KB * T_atoms_k / m)
    cloud_expansion_at_2T = v_thermal * 2.0 * T_s  # full free-fall
    # Chamber length: free-fall distance + safety margin
    free_fall_m = 0.5 * G_STANDARD * (2.0 * T_s) ** 2
    chamber_length_m = free_fall_m + cloud_expansion_at_2T + 0.1  # +10cm for optics
    # Approximate volume: cylinder with chamber_length × 0.2 m diameter (industry typical)
    volume_l = math.pi * 0.1 ** 2 * chamber_length_m * 1000.0

    # SNR (signal-to-noise at the fringe maximum)
    snr = math.sqrt(N_atoms) * contrast

    # Dynamic range: ±g uniquely measured before phase wraps modulo 2pi
    # phi_max = pi → a_max = pi / (k_eff * T^2)
    a_dynamic_range_g = math.pi / (k_eff * T_s ** 2) / G_STANDARD

    # Worked calculations — reviewer-verifiable arithmetic steps.
    # k_laser = 2*pi/lambda (transcendental) → SKIPPED; passed as live input.
    # sigma_phi_per_shot = 1/(C*sqrt(N)) uses sqrt (transcendental) → SKIPPED; passed as live.
    # v_thermal uses sqrt (transcendental) → SKIPPED.
    k_eff_r              = round(k_eff, 1)
    k_laser_r            = round(k_laser, 1)
    sigma_phi_r          = round(sigma_phi_per_shot, 8)
    sigma_a_r            = sigma_a_per_shot
    T_s_r                = T_s
    sigma_a_sqrthz_r     = sigma_a_per_sqrthz
    sens_g_r             = sensitivity_g_per_sqrthz
    sens_ug_r            = round(sensitivity_micro_g_per_sqrthz, 4)

    worked = [
        worked_calc(
            label="Effective two-photon wave-vector",
            formula="k_eff = 2 x k_laser",
            values={"k_laser": (k_laser_r, "rad/m")},
            result=k_eff_r, result_unit="rad/m",
            assumptions=[
                "Two-photon Raman process: k_eff = 2*k_laser (Kasevich & Chu 1991).",
                "k_laser = 2*pi/lambda (transcendental — not re-shown).",
            ],
        ),
        worked_calc(
            label="Per-shot acceleration sensitivity",
            formula="sigma_a = sigma_phi_per_shot / (k_eff x T_s^2)",
            values={
                "sigma_phi_per_shot": (sigma_phi_r, "rad"),
                "k_eff":              (k_eff_r,     "rad/m"),
                "T_s":                (T_s_r,       "s"),
            },
            result=float(f"{sigma_a_r:.4e}"), result_unit="m/s2",
            assumptions=[
                "sigma_phi = 1/(C*sqrt(N)) (shot-noise limit; transcendental — not re-shown).",
                "Phase sensitivity formula Delta_phi = k_eff a T^2 (Kasevich & Chu 1991).",
            ],
        ),
        worked_calc(
            label="Sensitivity in micro-g per root-Hz",
            formula="sens_ug = sigma_a_per_sqrthz / G_STANDARD x 1e6",
            values={
                "sigma_a_per_sqrthz": (float(f"{sigma_a_per_sqrthz:.4e}"), "m/s2 / sqrt(Hz)"),
                "G_STANDARD":          (G_STANDARD,                          "m/s2"),
            },
            # Use the pre-rounded value so the substitution arithmetic reproduces the result.
            # The output field sensitivity_micro_g_per_sqrthz is rounded separately.
            result=sensitivity_micro_g_per_sqrthz, result_unit="ug/sqrt(Hz)",
            assumptions=[
                "sigma_a_per_sqrthz = sigma_a / sqrt(rate_hz) (transcendental — not re-shown).",
                "1e6 converts g to micro-g.",
            ],
        ),
    ]

    return {
        "atom_species": species,
        "atom_name": atom["name"],
        "atom_mass_kg": m,
        "wavelength_nm": lambda_m * 1e9,
        "interrogation_time_ms": T_ms,
        "atom_number": N_atoms,
        "temperature_uK": temp_uk,
        "k_eff_per_m": round(k_eff, 1),
        "recoil_velocity_mm_s": round(v_rec_mm_s, 3),
        "fringe_contrast_pct": contrast_pct,
        "shot_to_shot_rate_hz": rate_hz,
        "sigma_phi_per_shot_rad": round(sigma_phi_per_shot, 8),
        "sensitivity_g_per_sqrthz": sensitivity_g_per_sqrthz,
        "sensitivity_micro_g_per_sqrthz": round(sensitivity_micro_g_per_sqrthz, 4),
        "bias_stability_micro_g": round(bias_stability_micro_g, 4),
        "chamber_length_m": round(chamber_length_m, 3),
        "free_fall_distance_m": round(free_fall_m, 3),
        "cloud_expansion_at_2T_m": round(cloud_expansion_at_2T, 4),
        "size_volume_l": round(volume_l, 1),
        "signal_to_noise": round(snr, 1),
        "dynamic_range_g": round(a_dynamic_range_g, 4),
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
