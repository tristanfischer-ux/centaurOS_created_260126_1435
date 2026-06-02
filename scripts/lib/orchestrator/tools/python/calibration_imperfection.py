#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/calibration_imperfection.py

Phase / gain calibration mismatch impact on phased-array beam pattern.

Input:
    {
      "phase_error_deg_rms": 5.0,
      "gain_error_db_rms": 0.5,
      "num_elements": 256,
      "amplitude_taper": "uniform"  // uniform | taylor | chebyshev
    }

Output:
    {
      "sidelobe_level_db": ...,
      "gain_loss_db": ...,
      "pointing_error_arcmin": ...,
      ...
    }

Physics (Mailloux 2005 Ch. 7; Skolnik 2008 Ch. 8):
- Random phase error σ_φ in radians: average sidelobe level above ideal:
    SLL_random = -10·log10(M) - 6 [dB above min]
  where additional rise = 10·log10(σ_φ² × M).
- Gain loss: ΔG = -4.343·σ_φ² (rad²) dB.
- Pointing error: σ_θ ≈ σ_φ / (M·d_β) where d_β is beam slope.

References:
- Mailloux (2005) "Phased Array Antenna Handbook" 2nd ed., Ch. 7.
- Skolnik (2008) "Radar Handbook" 3rd ed., Ch. 8.
- Hansen (2009) "Phased Array Antennas" 2nd ed., Wiley.
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
    "tool_name": "calibration_imperfection (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Mailloux (2005) 'Phased Array Antenna Handbook' 2nd ed.; Skolnik (2008) 'Radar Handbook' 3rd ed.",
    "physics_basis": "Random-error theory: gain loss = -4.343·σ_φ² dB; sidelobe rise = 10·log10(σ_φ²·M).",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    phase_err_deg_rms = float(payload.get("phase_error_deg_rms", 5.0))
    gain_err_db_rms = float(payload.get("gain_error_db_rms", 0.5))
    M = int(payload.get("num_elements", 256))
    taper = str(payload.get("amplitude_taper", "uniform")).lower()

    # Convert to radians
    sigma_phase_rad = math.radians(phase_err_deg_rms)
    # Gain error: 0.5 dB ≈ ±6% in linear
    sigma_gain_linear = 10 ** (gain_err_db_rms / 20.0) - 1.0

    # Combined error variance (uncorrelated)
    sigma_total_sq = sigma_phase_rad ** 2 + sigma_gain_linear ** 2

    # Gain loss (Mailloux 7.4-1): ΔG = -4.343·σ²
    gain_loss_db = 4.343 * sigma_total_sq

    # Sidelobe level — uniform taper baseline is -13 dB
    if taper == "uniform":
        sll_ideal_db = -13.0
    elif taper == "taylor":
        sll_ideal_db = -30.0  # typical Taylor n̄=4 design
    elif taper == "chebyshev":
        sll_ideal_db = -30.0
    else:
        sll_ideal_db = -13.0

    # Average sidelobe rise from random errors
    # Mailloux 7.4-8: average sidelobe level above noise floor
    # Average SLL_random ≈ σ² × M / (10·log10(M)) — linear units
    sll_rise_db = 10 * math.log10(sigma_total_sq * M) if sigma_total_sq * M > 1e-6 else -99

    # Final SLL = max(ideal, random average)
    sll_final_db = max(sll_ideal_db, sll_rise_db)

    # Pointing error (degrees) — for ULA: σ_θ = σ_φ × √(12/M³) × λ/(2πd)
    # Simplified: σ_θ ≈ σ_φ × √(12 / M³) for d = λ/2
    if M > 0:
        sigma_theta_rad = sigma_phase_rad * math.sqrt(12.0 / (M ** 3))
        sigma_theta_arcmin = math.degrees(sigma_theta_rad) * 60.0
    else:
        sigma_theta_arcmin = 999

    # Yield estimate: how many elements within ±1σ of nominal
    # For Gaussian: 68% within ±σ. Tighter spec = higher yield required.
    yield_pct = 100 * (1 - 2 * 0.16)  # 68% within ±1σ

    # Half-power beam-width broadening from errors
    hpbw_broaden_pct = (1 + sigma_total_sq) * 100 - 100

    # Worked calculation — only the gain_loss step is a simple closed-form multiply.
    # sigma_phase_rad = radians(deg) and sigma_gain_linear = 10^(x/20)-1 are
    # transcendental; sll_rise and pointing_error contain log10/sqrt — all skipped.
    # We pass the live sigma_total_sq as an opaque input symbol so the gain_loss
    # step is hand-checkable without needing to re-derive it.
    sigma_total_sq_r = round(sigma_total_sq, 6)
    gain_loss_r = round(gain_loss_db, 3)
    worked = [
        worked_calc(
            label="Gain loss from combined phase + gain errors",
            formula="gain_loss = 4.343 x sigma_total_sq",
            values={"sigma_total_sq": (sigma_total_sq_r, "rad2 (combined error variance)")},
            result=gain_loss_r, result_unit="dB",
            assumptions=[
                "Mailloux (2005) eq. 7.4-1: delta_G = -4.343 x sigma^2 dB",
                f"sigma_phase_rad = {round(sigma_phase_rad, 4)} rad "
                f"(converted from {phase_err_deg_rms} deg rms)",
                f"sigma_gain_linear = {round(sigma_gain_linear, 4)} "
                f"(10^(gain_err_db/20) - 1 for {gain_err_db_rms} dB rms)",
                "sigma_total_sq = sigma_phase_rad^2 + sigma_gain_linear^2 (uncorrelated errors)",
            ],
        ),
    ]

    return {
        "phase_error_deg_rms": phase_err_deg_rms,
        "gain_error_db_rms": gain_err_db_rms,
        "num_elements": M,
        "amplitude_taper": taper,
        "sidelobe_level_db": round(sll_final_db, 1),
        "sidelobe_level_ideal_db": round(sll_ideal_db, 1),
        "sidelobe_rise_db": round(sll_rise_db - sll_ideal_db, 1) if sll_rise_db > sll_ideal_db else 0.0,
        "gain_loss_db": gain_loss_r,
        "pointing_error_arcmin": round(sigma_theta_arcmin, 2),
        "hpbw_broadening_pct": round(hpbw_broaden_pct, 2),
        "phase_error_rms_rad": round(sigma_phase_rad, 4),
        "gain_error_rms_linear": round(sigma_gain_linear, 4),
        "calibration_yield_pct": round(yield_pct, 1),
        "meets_n_30db_SLL": sll_final_db <= -30,
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
