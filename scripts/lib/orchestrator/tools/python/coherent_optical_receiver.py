#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/coherent_optical_receiver.py

Coherent optical receiver (DPSK/QPSK) sensitivity and BER calculations.

Input:
    {
      "signal_photons_per_bit": 100.0,
      "modulation": "DPSK",     // OOK | DPSK | QPSK | 16QAM
      "data_rate_gbps": 10.0,
      "wavelength_nm": 1550.0,
      "lo_power_dbm": 0.0
    }

Output:
    {
      "ber": ...,
      "receiver_sensitivity_dbm": ...,
      "shot_noise_limit_dbm": ...,
      "snr_db": ...,
      ...
    }

Physics (Agrawal 4th ed., Ch. 4-5; Kazovsky 2006):
- BER for coherent BPSK: BER = (1/2) × erfc(sqrt(SNR))
- BER for DPSK: BER = (1/2) × exp(-SNR)
- BER for QPSK: BER = (1/2) × erfc(sqrt(SNR/2))
- Shot-noise limit: SNR_shot = N_photons_per_bit
- BER threshold for FEC: 1e-3 (hard-decision FEC corrects to 1e-12 output)

References:
- Agrawal (2010) "Fiber-Optic Communication Systems" 4th ed.
- Kazovsky, Benedetto, Willner (2006) "Optical Fiber Communication Systems."
- ITU-T G.709 OTN forward error correction.
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
    "tool_name": "coherent_optical_receiver (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Agrawal (2010) 'Fiber-Optic Communication Systems' 4th ed.; Kazovsky et al. (2006)",
    "physics_basis": "Shot-noise-limited coherent BER: BPSK = (1/2)·erfc(sqrt(N_photons)); DPSK adds 0.5 dB penalty.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

H_PLANCK = 6.626e-34  # J·s
C_LIGHT = 3e8  # m/s


def compute(payload: dict) -> dict:
    N_photons = float(payload.get("signal_photons_per_bit", 100.0))
    mod = str(payload.get("modulation", "DPSK")).upper()
    rate_gbps = float(payload.get("data_rate_gbps", 10.0))
    wavelength_nm = float(payload.get("wavelength_nm", 1550.0))
    lo_power_dbm = float(payload.get("lo_power_dbm", 0.0))

    # Photon energy at λ
    wavelength_m = wavelength_nm * 1e-9
    freq_hz = C_LIGHT / wavelength_m
    photon_energy_j = H_PLANCK * freq_hz

    # Quantum limit signal power
    rate_bps = rate_gbps * 1e9
    P_quantum_w = N_photons * photon_energy_j * rate_bps
    P_quantum_dbm = 10 * math.log10(P_quantum_w * 1000) if P_quantum_w > 0 else -99

    # BER formulas
    snr = N_photons  # for coherent detection in shot-noise limit
    snr_db = 10 * math.log10(snr) if snr > 0 else -99

    if mod == "OOK":
        # OOK ASK direct detection: SNR per bit ≈ N (shot noise)
        ber = 0.5 * math.erfc(math.sqrt(snr / 2))
        n_for_1e_9 = 36  # photons/bit threshold
    elif mod == "DPSK":
        # DPSK: BER = (1/2) × exp(-N)
        # 0.5 dB penalty vs BPSK
        ber = 0.5 * math.exp(-snr)
        n_for_1e_9 = 21  # photons/bit
    elif mod == "QPSK":
        # QPSK at 2 bits/symbol: BER per bit = (1/2)·erfc(sqrt(N/2))
        ber = 0.5 * math.erfc(math.sqrt(snr / 2))
        n_for_1e_9 = 21
    elif mod == "16QAM":
        # 16QAM 4 bits/symbol with Gray coding
        ber = (3 / 8) * math.erfc(math.sqrt(snr / 10))
        n_for_1e_9 = 95
    else:  # default BPSK
        ber = 0.5 * math.erfc(math.sqrt(snr))
        n_for_1e_9 = 18

    ber = max(1e-30, min(0.5, ber))

    # Receiver sensitivity = power at BER 1e-9 (or 1e-3 if FEC)
    # Threshold N for BER 1e-9 already determined per modulation
    P_sens_w = n_for_1e_9 * photon_energy_j * rate_bps
    P_sens_dbm = 10 * math.log10(P_sens_w * 1000)

    # Shot-noise limit (theoretical floor at BER 1e-9): ~ -57 dBm at 10 Gbps for BPSK
    P_shot_limit_w = 18 * photon_energy_j * rate_bps  # BPSK theoretical
    P_shot_limit_dbm = 10 * math.log10(P_shot_limit_w * 1000)

    # Local oscillator (LO) requirement
    # Need LO >> signal for shot-noise-limited detection
    P_lo_required_dbm = max(0, lo_power_dbm)  # 0 dBm = 1 mW typical

    # Information rate
    if mod == "OOK" or mod == "BPSK" or mod == "DPSK":
        bits_per_symbol = 1
    elif mod == "QPSK":
        bits_per_symbol = 2
    elif mod == "16QAM":
        bits_per_symbol = 4
    else:
        bits_per_symbol = 1
    symbol_rate_gsym_s = rate_gbps / bits_per_symbol

    # FEC: NCG = net coding gain. HD-FEC (RS) provides 6 dB at 7% overhead.
    fec_threshold_ber = 1e-3
    after_fec_ber = 1e-12 if ber < fec_threshold_ber else ber
    fec_helps = ber < fec_threshold_ber

    # Worked calculations — reviewer-verifiable arithmetic steps.
    # BER formulas use erfc/exp (transcendental) → SKIPPED.
    # log10 for SNR dB → SKIPPED.
    wavelength_m_r  = wavelength_m
    freq_r          = round(freq_hz, 4)
    photon_e_r      = photon_energy_j  # keep full float (very small)
    rate_bps_r      = rate_bps
    P_quantum_r     = float(f"{P_quantum_w:.3e}")
    P_sens_r        = float(f"{P_sens_w:.3e}")

    worked = [
        worked_calc(
            label="Optical frequency from wavelength",
            formula="freq_hz = C_LIGHT / wavelength_m",
            values={
                "C_LIGHT":      (3e8,            "m/s"),
                "wavelength_m": (wavelength_m_r, "m"),
            },
            result=freq_r, result_unit="Hz",
            assumptions=["Speed of light c = 3e8 m/s (vacuum approximation)."],
        ),
        worked_calc(
            label="Signal power at quantum limit",
            formula="P_quantum = N_photons x photon_energy_j x rate_bps",
            values={
                "N_photons":       (N_photons,    "photons/bit"),
                "photon_energy_j": (photon_e_r,   "J"),
                "rate_bps":        (rate_bps_r,   "bit/s"),
            },
            result=P_quantum_r, result_unit="W",
            assumptions=["Assumes one photon per bit energy × bit rate gives average optical power."],
        ),
        worked_calc(
            label="Receiver sensitivity power at BER 1e-9",
            formula="P_sens = n_for_1e_9 x photon_energy_j x rate_bps",
            values={
                "n_for_1e_9":      (n_for_1e_9,  "photons/bit"),
                "photon_energy_j": (photon_e_r,  "J"),
                "rate_bps":        (rate_bps_r,  "bit/s"),
            },
            result=P_sens_r, result_unit="W",
            assumptions=[
                f"n_for_1e_9 = {n_for_1e_9} for {mod} (shot-noise-limited coherent detection threshold, Agrawal 4th ed.).",
            ],
        ),
    ]

    return {
        "signal_photons_per_bit": N_photons,
        "modulation": mod,
        "data_rate_gbps": rate_gbps,
        "wavelength_nm": wavelength_nm,
        "snr_db": round(snr_db, 2),
        "ber": float(f"{ber:.3e}"),
        "ber_after_FEC": float(f"{after_fec_ber:.3e}"),
        "fec_corrects": fec_helps,
        "receiver_sensitivity_dbm": round(P_sens_dbm, 1),
        "receiver_sensitivity_at_1e_9_w": float(f"{P_sens_w:.3e}"),
        "shot_noise_limit_dbm": round(P_shot_limit_dbm, 1),
        "lo_required_power_dbm": P_lo_required_dbm,
        "photons_for_ber_1e_9": n_for_1e_9,
        "bits_per_symbol": bits_per_symbol,
        "symbol_rate_gsym_s": round(symbol_rate_gsym_s, 2),
        "quantum_power_at_input_dbm": round(P_quantum_dbm, 2),
        "photon_energy_j": photon_energy_j,
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
