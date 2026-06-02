#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/beamforming_codebook.py

DFT / hybrid / MMSE beamforming codebook design for phased arrays.

Input:
    {
      "num_elements": 256,
      "num_RF_chains": 16,
      "signal_freq_ghz": 28.0,
      "scan_angle_deg": 60.0,
      "codebook_type": "DFT"   // DFT | hybrid | MMSE
    }

Output:
    {
      "codebook_size": 64,
      "scan_loss_db": ...,
      "computational_complexity": ...,
      "max_scan_angle_deg": ...,
      ...
    }

Physics (Balanis 3rd ed. Ch. 6; Hur 2013 IEEE Comm. Mag.):
- DFT codebook: M codewords for M-element ULA, each pointing at θ_m = arcsin(2m/M - 1).
- Half-wavelength spacing scans ±90°; smaller spacing reduces grating lobes.
- Scan loss = 20·log10(cos(θ)) for cosine taper, ~1.5 dB at 60°.
- Hybrid: N_RF analog chains × N_BB digital streams = digital beamforming
  on a reduced set of beams.

References:
- Balanis (2005) "Antenna Theory" 3rd ed.
- Hur, Kim, Love (2013) IEEE Comm. Mag. 51, 106-113.
- Heath et al. (2016) "An Overview of Signal Processing Techniques for
  Millimeter Wave MIMO Systems," IEEE JSTSP 10, 436.
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
    "tool_name": "beamforming_codebook (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Balanis (2005) Ch. 6; Hur, Kim, Love (2013) IEEE Comm. Mag. 51 106; Heath et al. (2016) JSTSP 10 436",
    "physics_basis": "DFT codebook: M codewords for M-element ULA. Scan loss = cos(θ) for broadside-normal arrays; hybrid uses N_RF < M.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

C_LIGHT = 3e8


def compute(payload: dict) -> dict:
    M = int(payload.get("num_elements", 256))
    N_RF = int(payload.get("num_RF_chains", 16))
    f_ghz = float(payload.get("signal_freq_ghz", 28.0))
    scan_deg = float(payload.get("scan_angle_deg", 60.0))
    codebook_type = str(payload.get("codebook_type", "DFT")).upper()

    f_hz = f_ghz * 1e9
    wavelength_m = C_LIGHT / f_hz

    # Half-wavelength element spacing
    d_m = wavelength_m / 2

    # Codebook size
    if codebook_type == "DFT":
        codebook_size = M  # full DFT
        complexity = M  # one IFFT
    elif codebook_type == "HYBRID":
        # Hybrid: N_RF analog beams × digital streams
        codebook_size = N_RF * 4  # typical 4 digital streams per chain
        complexity = M * N_RF  # mixed analog-digital
    elif codebook_type == "MMSE":
        codebook_size = max(M, M * N_RF)  # adaptive
        complexity = M * M  # O(M²) for MMSE
    else:
        codebook_size = M
        complexity = M

    # Scan loss
    scan_rad = math.radians(scan_deg)
    # Cosine taper: 1·cos(θ) for projected aperture
    proj_factor = math.cos(scan_rad)
    if proj_factor > 0:
        scan_loss_db = -20 * math.log10(proj_factor)
    else:
        scan_loss_db = 99

    # Max scan angle without grating lobe (for d = λ/2 ULA): ±90°
    # For d > λ/2: ±arcsin(λ/d - 1)
    d_over_lambda = 0.5
    if d_over_lambda <= 0.5:
        max_scan_deg = 90.0
    else:
        max_scan_deg = math.degrees(math.asin(1 / d_over_lambda - 1))

    # Beam width at broadside (HPBW for ULA): 0.886·λ/(M·d) rad
    hpbw_rad = 0.886 * wavelength_m / (M * d_m)
    hpbw_deg = math.degrees(hpbw_rad)
    # Beam width at θ: HPBW(θ) ≈ HPBW(0) / cos(θ)
    hpbw_at_scan_deg = hpbw_deg / max(0.05, proj_factor)

    # Array gain at broadside: 10·log10(M)
    array_gain_db = 10 * math.log10(M)
    effective_gain_db = array_gain_db - scan_loss_db

    # Number of independent beams
    n_beams_independent = max(1, int(180 / hpbw_deg))

    # Codebook training overhead (bits)
    codebook_bits = math.ceil(math.log2(max(2, codebook_size)))

    # --- Worked calculations ---
    # codebook_size is branchy — SKIP.
    # proj_factor = cos(scan_rad) — trig: SKIP.
    # scan_loss_db = -20 log10(proj_factor) — log: SKIP.
    # array_gain_db = 10 log10(M) — log: SKIP.
    # hpbw_deg / proj_factor is division but proj_factor is trig result — pass as input.
    wavelength_r = round(wavelength_m * 1000, 2)  # mm
    d_r = round(d_m * 1000, 2)  # mm
    hpbw_r = round(hpbw_deg, 2)

    # Pass lambda and d at 4 dp so _fmt represents them accurately; derive hpbw_r
    # from those same 4-dp values so the printed substitution reproduces the result.
    lam_4dp = round(wavelength_m, 4)
    d_4dp = round(d_m, 4)
    hpbw_r_rad = round(0.886 * lam_4dp / (M * d_4dp), 6)

    worked = [
        worked_calc(
            label="Signal wavelength",
            formula="lambda = c / f",
            values={"c": (C_LIGHT, "m/s"), "f": (f_ghz * 1e9, "Hz")},
            result=round(wavelength_m, 6), result_unit="m",
            assumptions=["Speed of light 3e8 m/s"],
        ),
        worked_calc(
            label="Half-wavelength element spacing",
            formula="d = lambda / 2",
            values={"lambda": (round(wavelength_m, 6), "m")},
            result=round(d_m, 6), result_unit="m",
            assumptions=["Standard half-wavelength ULA spacing"],
        ),
        worked_calc(
            label="HPBW at broadside (ULA)",
            formula="HPBW = 0.886 x lambda / (M x d)",
            values={"lambda": (lam_4dp, "m"), "M": (M, "elements"),
                    "d": (d_4dp, "m")},
            result=hpbw_r_rad, result_unit="rad",
            assumptions=["Balanis 3rd ed. ULA HPBW formula; 0.886 = 2 arcsin(0.443)"],
        ),
    ]

    return {
        "num_elements": M,
        "num_RF_chains": N_RF,
        "signal_freq_ghz": f_ghz,
        "wavelength_mm": round(wavelength_m * 1000, 2),
        "scan_angle_deg": scan_deg,
        "codebook_type": codebook_type,
        "codebook_size": codebook_size,
        "codebook_index_bits": codebook_bits,
        "scan_loss_db": round(scan_loss_db, 2),
        "max_scan_angle_deg": round(max_scan_deg, 1),
        "computational_complexity_ops": complexity,
        "array_gain_broadside_db": round(array_gain_db, 1),
        "effective_gain_at_scan_db": round(effective_gain_db, 1),
        "hpbw_broadside_deg": round(hpbw_deg, 2),
        "hpbw_at_scan_deg": round(hpbw_at_scan_deg, 2),
        "element_spacing_mm": round(d_m * 1000, 2),
        "n_independent_beams": n_beams_independent,
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
