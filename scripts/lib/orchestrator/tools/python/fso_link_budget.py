#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/fso_link_budget.py

Free-space optical (FSO) laser-communications link budget.

Computes received power, link margin, BER and maximum data rate for a coherent
or direct-detection optical inter-satellite or ground-to-space laser link.

Companies served: Mynaric, TESAT-Spacecom, ODYSSEUS, Skyloom, Astrolight,
Cailabs (optical ground station optical-front-end), aXenic (modulator side).

Input:
    {
      "tx_power_w": 1.0,
      "tx_aperture_mm": 80.0,
      "wavelength_nm": 1550.0,
      "rx_aperture_mm": 80.0,
      "range_km": 1000.0,
      "atmospheric_loss_db": 3.0,
      "pointing_error_arcsec": 0.5,
      "rx_noise_equivalent_power_w_sqrthz": 5e-15,
      "receiver_bandwidth_ghz": 10.0,
      "detector_type": "APD" | "PIN" | "coherent",
      "required_ber": 1e-9
    }

Output:
    rx_power_w, rx_power_dbm, link_margin_db, ber_estimate,
    max_data_rate_gbps, antenna_gains_db, pointing_loss_db,
    far_field_distance_m, _provenance.

Physics:
  G_tx = (pi * D_tx / lambda)^2  (Gaussian-beam diffraction-limited gain)
  G_rx = (pi * D_rx / lambda)^2
  FSPL = (4 pi d / lambda)^2
  Pointing loss = exp(-(theta_err / divergence)^2 / 2) * 4.343 dB (approx)
  Beam divergence (1/e^2) = 1.27 * lambda / D_tx  [rad]
  BER (OOK direct-detection, Gaussian noise) ~ 0.5 * erfc(Q/sqrt(2)) where Q = (P_rx/NEP)/2

References:
- Kaushal, H. & Kaddoum, G., "Optical communication in space: challenges and
  mitigation techniques", IEEE Comm. Surveys & Tutorials, 19(1):57-96, 2017.
  DOI: 10.1109/COMST.2016.2603518
- Andrews, L.C., Phillips, R.L., "Laser Beam Propagation through Random Media",
  2nd ed., SPIE Press 2005, ch.12.
- Pratt, Bostian, Allnutt, "Satellite Communications", 2nd ed., Wiley 2003, ch.4.
- CCSDS 141.0-B-1 "Optical Communications Coding & Synchronization" (2019).
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "fso_link_budget (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Kaushal & Kaddoum (2017) DOI 10.1109/COMST.2016.2603518; "
        "Andrews & Phillips, 'Laser Beam Propagation through Random Media' "
        "2nd ed. SPIE 2005; CCSDS 141.0-B-1 (2019)."
    ),
    "physics_basis": (
        "Friis link equation extended to optical wavelengths. Antenna gain "
        "G = (pi D / lambda)^2 (diffraction-limited Gaussian aperture). "
        "Pointing loss from Marcum-Q approximation for Gaussian pointing error. "
        "BER from Q-function for direct-detection Gaussian noise channel."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "NEP_default_w_sqrthz": {
            "source": "Hamamatsu G8931-20 APD datasheet (5e-15 W/sqrt(Hz) typical at 1550 nm)",
            "confidence": "datasheet",
        },
        "DIVERGENCE_GAUSSIAN_FACTOR (1.27)": {
            "source": "Siegman, Lasers (1986) eq. 17.30 — Gaussian-beam half-angle 1/e^2 divergence",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Detector NEP defaults (W / sqrt(Hz))
NEP_DEFAULT = {
    "APD": 5e-15,    # avalanche photodiode at 1550 nm
    "PIN": 5e-14,    # PIN photodiode
    "coherent": 1e-15,  # coherent / homodyne receiver
}

# Detector quantum-limited sensitivity (photons / bit at BER 1e-9)
PHOTONS_PER_BIT_BER_1E9 = {
    "OOK_direct": 1000.0,
    "DPSK_coherent": 38.0,
    "BPSK_homodyne": 18.0,
}


def q_to_ber(q: float) -> float:
    """BER = 0.5 * erfc(Q/sqrt(2))."""
    if q <= 0:
        return 0.5
    return 0.5 * math.erfc(q / math.sqrt(2.0))


def compute(payload: dict) -> dict:
    tx_power_w = float(payload.get("tx_power_w", 1.0))
    tx_aperture_m = float(payload.get("tx_aperture_mm", 80.0)) / 1000.0
    wavelength_m = float(payload.get("wavelength_nm", 1550.0)) * 1e-9
    rx_aperture_m = float(payload.get("rx_aperture_mm", 80.0)) / 1000.0
    range_m = float(payload.get("range_km", 1000.0)) * 1000.0
    atm_loss_db = float(payload.get("atmospheric_loss_db", 3.0))
    pointing_arcsec = float(payload.get("pointing_error_arcsec", 0.5))
    nep = float(payload.get("rx_noise_equivalent_power_w_sqrthz",
                            NEP_DEFAULT.get(str(payload.get("detector_type", "APD")), 5e-15)))
    bw_hz = float(payload.get("receiver_bandwidth_ghz", 10.0)) * 1e9
    detector = str(payload.get("detector_type", "APD"))
    required_ber = float(payload.get("required_ber", 1e-9))

    if tx_power_w <= 0 or wavelength_m <= 0 or range_m <= 0:
        raise ValueError("tx_power_w, wavelength, range must be positive")

    # Antenna gains (diffraction-limited Gaussian)
    g_tx = (math.pi * tx_aperture_m / wavelength_m) ** 2
    g_rx = (math.pi * rx_aperture_m / wavelength_m) ** 2
    g_tx_db = 10.0 * math.log10(g_tx)
    g_rx_db = 10.0 * math.log10(g_rx)

    # Free-space path loss
    fspl = (4.0 * math.pi * range_m / wavelength_m) ** 2
    fspl_db = 10.0 * math.log10(fspl)

    # Beam divergence (1/e^2 half-angle, radians)
    beam_divergence_half_rad = 1.27 * wavelength_m / tx_aperture_m  # ~1.22 lambda/D Airy + Gaussian
    beam_divergence_full_urad = 2.0 * beam_divergence_half_rad * 1e6

    # Pointing loss — Gaussian beam exponential fall-off
    pointing_err_rad = pointing_arcsec * (math.pi / 180.0) / 3600.0
    pointing_arg = (pointing_err_rad / max(beam_divergence_half_rad, 1e-12)) ** 2
    pointing_loss_lin = math.exp(-2.0 * pointing_arg)
    pointing_loss_db = -10.0 * math.log10(max(pointing_loss_lin, 1e-30))

    # Received power
    tx_power_dbw = 10.0 * math.log10(tx_power_w)
    rx_power_dbw = (tx_power_dbw + g_tx_db + g_rx_db
                    - fspl_db - atm_loss_db - pointing_loss_db)
    rx_power_w = 10.0 ** (rx_power_dbw / 10.0)
    rx_power_dbm = rx_power_dbw + 30.0

    # Noise power = NEP * sqrt(BW); signal-to-noise
    noise_power_w = nep * math.sqrt(bw_hz)
    snr_lin = rx_power_w / max(noise_power_w, 1e-30)
    snr_db = 10.0 * math.log10(max(snr_lin, 1e-30))

    # Q factor for OOK: Q ~ sqrt(SNR)/2 for non-coherent direct detection
    if detector == "coherent":
        q_factor = math.sqrt(2.0 * snr_lin)
    else:
        q_factor = math.sqrt(snr_lin) / 2.0

    ber_estimate = q_to_ber(q_factor)

    # Required Q for target BER (inverse of erfc)
    # For BER=1e-9, Q~6; BER=1e-12, Q~7; BER=1e-6, Q~4.75
    if required_ber >= 0.5:
        q_required = 0.0
    else:
        # Newton iteration for Q given BER target
        q_required = 6.0  # initial guess
        for _ in range(40):
            ber_q = 0.5 * math.erfc(q_required / math.sqrt(2.0))
            dber_dq = -math.exp(-q_required ** 2 / 2.0) / math.sqrt(2.0 * math.pi)
            err = ber_q - required_ber
            if abs(err) < 1e-15 or abs(dber_dq) < 1e-30:
                break
            q_required -= err / dber_dq
            q_required = max(0.1, min(12.0, q_required))

    snr_required_lin = (2.0 * q_required) ** 2 if detector != "coherent" else (q_required ** 2) / 2.0
    snr_required_db = 10.0 * math.log10(max(snr_required_lin, 1e-30))
    link_margin_db = snr_db - snr_required_db

    # Maximum data rate: power-limited assuming photons/bit floor for the detector
    photon_energy_j = 6.626e-34 * 3e8 / wavelength_m
    photons_per_bit = PHOTONS_PER_BIT_BER_1E9.get("OOK_direct", 1000.0)
    if detector == "coherent":
        photons_per_bit = PHOTONS_PER_BIT_BER_1E9["BPSK_homodyne"]
    max_data_rate_bps = rx_power_w / (photons_per_bit * photon_energy_j)
    max_data_rate_gbps = max_data_rate_bps / 1e9

    # Far-field (Rayleigh) distance: 2 D^2 / lambda
    far_field_m = 2.0 * (tx_aperture_m ** 2) / wavelength_m

    return {
        "tx_power_w": tx_power_w,
        "wavelength_nm": float(payload.get("wavelength_nm", 1550.0)),
        "range_km": float(payload.get("range_km", 1000.0)),
        "tx_antenna_gain_db": round(g_tx_db, 2),
        "rx_antenna_gain_db": round(g_rx_db, 2),
        "free_space_path_loss_db": round(fspl_db, 2),
        "beam_divergence_full_urad": round(beam_divergence_full_urad, 3),
        "pointing_loss_db": round(pointing_loss_db, 3),
        "atmospheric_loss_db": atm_loss_db,
        "rx_power_w": rx_power_w,
        "rx_power_dbm": round(rx_power_dbm, 2),
        "snr_db": round(snr_db, 2),
        "q_factor": round(q_factor, 3),
        "ber_estimate": ber_estimate,
        "required_ber": required_ber,
        "q_required": round(q_required, 3),
        "snr_required_db": round(snr_required_db, 2),
        "link_margin_db": round(link_margin_db, 2),
        "max_data_rate_gbps": round(max_data_rate_gbps, 3),
        "far_field_distance_m": round(far_field_m, 1),
        "detector_type": detector,
        "noise_equivalent_power_w_sqrthz": nep,
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
