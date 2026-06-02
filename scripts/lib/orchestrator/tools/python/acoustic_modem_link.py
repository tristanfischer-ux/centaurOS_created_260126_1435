#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/acoustic_modem_link.py

Underwater acoustic communication link budget.

Sonar equation (passive form):
    SNR = SL - TL - NL + DI - DT
where:
    SL = source level (dB re 1 μPa @ 1m)
    TL = transmission loss (dB)
    NL = noise level (ambient, dB re 1 μPa²/Hz)
    DI = directivity index (dB, receiver array gain)
    DT = detection threshold (dB)

Transmission loss (Urick "Principles of Underwater Sound"):
    TL = 20 log10(r) + α(f) × r/1000 (dB)
where α(f) = absorption per km (depends on f, T, S, depth)

Sound speed (Mackenzie):
    c = 1448.96 + 4.591×T - 5.304e-2×T² + 2.374e-4×T³ + 1.340×(S-35)
        + 1.630e-2×D + 1.675e-7×D² - 1.025e-2×T×(S-35) - 7.139e-13×T×D³

Absorption (Francois-Garrison, 1982):
    α = A1×f1×f²/(f1²+f²) + A2×P2×f2×f²/(f2²+f²) + A3×P3×f²
Three terms: boric acid relaxation, MgSO4 relaxation, viscosity.

Data rates vs modulation:
- FSK (basic): 100-2000 bps, robust, low-rate
- PSK (BPSK/QPSK): 1-5 kbps, mid-range
- OFDM: 5-25 kbps, multipath-tolerant
- SS-OFDM (Spread Spectrum): noise-rejecting, jam-resistant

Propagation delay = range / sound speed (~1500 m/s).

References:
- Urick, "Principles of Underwater Sound", 3rd ed., Peninsula 1983
- Stojanovic & Preisig, "Underwater Acoustic Communication Channels:
  Propagation Models and Statistical Characterization", IEEE Comm Mag 2009
- WHOI Micromodem datasheet (FSK 80 bps - 5 kbps)
- Evologics S2C modems (PSK/OFDM up to 64 kbps)
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
    "tool_name": 'acoustic_modem_link (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Urick (1983) 'Principles of Underwater Sound' 3rd ed., McGraw-Hill; Stojanovic (2003), 'On the relationship between capacity and distance in an underwater acoustic communication channel', WUWNet '06",
    "physics_basis": 'Active sonar equation: SNR = SL - 2×TL - NL + DI - DT. TL = 20 log10(R) + α(f) × R (spherical + absorption).',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Sound speed (Mackenzie)
def sound_speed(T: float, S: float, D: float) -> float:
    return (1448.96 + 4.591 * T - 5.304e-2 * T**2 + 2.374e-4 * T**3
            + 1.340 * (S - 35) + 1.630e-2 * D + 1.675e-7 * D**2
            - 1.025e-2 * T * (S - 35) - 7.139e-13 * T * D**3)


# Absorption (Francois-Garrison simplified for f in kHz, T in °C, D in m, S in ppt)
def absorption_db_per_km(f_khz: float, T: float, S: float, D_m: float) -> float:
    # Convert to Hz for formula
    f = f_khz * 1000  # Hz
    # Boric acid
    f1 = 0.78 * math.sqrt(S / 35) * math.exp(T / 26)
    f2 = 42 * math.exp(T / 17)
    A1 = (8.86 / sound_speed(T, S, D_m)) * 10 ** (0.78 * (S - 35) / 35 - 5)
    A2 = 21.44 * (S / sound_speed(T, S, D_m)) * (1 + 0.025 * T)
    P2 = 1 - 1.37e-4 * D_m + 6.2e-9 * D_m**2
    A3 = 4.937e-4 - 2.59e-5 * T + 9.11e-7 * T**2 - 1.5e-8 * T**3
    P3 = 1 - 3.83e-5 * D_m + 4.9e-10 * D_m**2

    # Convert f1, f2 to kHz for term calculation
    f1_khz = f1
    f2_khz = f2

    alpha = (A1 * f1_khz * (f_khz**2) / (f1_khz**2 + f_khz**2)
             + A2 * P2 * f2_khz * (f_khz**2) / (f2_khz**2 + f_khz**2)
             + A3 * P3 * f_khz**2)
    return alpha


def compute(payload: dict) -> dict:
    f_khz = float(payload.get("frequency_khz", 25))
    distance_km = float(payload.get("distance_km", 5))
    depth_m = float(payload.get("depth_m", 100))
    salinity = float(payload.get("salinity_ppt", 35))
    water_temp = float(payload.get("water_temp_c", 10))
    modulation = str(payload.get("modulation", "PSK")).upper()
    source_level_db = float(payload.get("source_level_db_re_1upa", 185))   # 1 W ≈ 185 dB
    noise_level_db = float(payload.get("noise_level_db_re_1upa2_hz", 50))
    directivity_index_db = float(payload.get("directivity_index_db", 10))
    detection_threshold_db = float(payload.get("detection_threshold_db", 15))
    bandwidth_hz = float(payload.get("bandwidth_hz", 5000))

    # Sound speed
    c_ms = sound_speed(water_temp, salinity, depth_m)
    # Absorption
    alpha = absorption_db_per_km(f_khz, water_temp, salinity, depth_m)
    distance_m = distance_km * 1000
    # Transmission loss (spherical spreading + absorption)
    tl_db = 20 * math.log10(max(1, distance_m)) + alpha * distance_km
    # Bandwidth-integrated noise
    nl_db = noise_level_db + 10 * math.log10(bandwidth_hz)

    # SNR
    snr_db = source_level_db - tl_db - nl_db + directivity_index_db - detection_threshold_db
    snr_db_r = round(snr_db, 1)

    # Data rate vs modulation
    if modulation in ("FSK",):
        # FSK: ~1 bit/Hz at SNR > 12 dB
        data_rate_bps = bandwidth_hz * 1.0 if snr_db > 12 else 0
    elif modulation in ("PSK", "BPSK", "QPSK"):
        # QPSK: 2 bits/Hz at SNR > 8 dB
        data_rate_bps = bandwidth_hz * 2.0 if snr_db > 8 else 0
    elif modulation in ("OFDM",):
        # OFDM-16QAM: 4 bits/Hz at SNR > 18 dB
        data_rate_bps = bandwidth_hz * 4.0 if snr_db > 18 else 0
        if snr_db > 22:
            data_rate_bps = bandwidth_hz * 6.0   # 64QAM
    elif modulation in ("OFDM_ACOUSTIC", "OFDM_BPSK"):
        # Conservative OFDM-BPSK for harsh channels
        data_rate_bps = bandwidth_hz * 1.0 if snr_db > 5 else 0
    else:
        data_rate_bps = bandwidth_hz * 0.5 if snr_db > 10 else 0

    # BER estimate (Shannon-Hartley channel limit)
    if snr_db > 0 and data_rate_bps > 0:
        snr_linear = 10 ** (snr_db / 10)
        shannon_capacity = bandwidth_hz * math.log2(1 + snr_linear)
        capacity_ratio = data_rate_bps / max(1, shannon_capacity)
        if capacity_ratio < 0.5:
            ber_estimate = 1e-6
        elif capacity_ratio < 0.8:
            ber_estimate = 1e-4
        else:
            ber_estimate = 1e-2
    else:
        ber_estimate = 0.5
        capacity_ratio = 0

    # Propagation delay
    propagation_delay_ms = (distance_m / c_ms) * 1000

    # Link viability
    link_works = snr_db > 5 and data_rate_bps > 0

    # Worked calculations (only the two purely arithmetic steps are shown;
    # sound speed and absorption use Mackenzie/Francois-Garrison transcendental
    # polynomials that cannot be verified by hand, so they are passed as live
    # inputs to the chain-able steps below).
    tl_db_r = round(tl_db, 1)
    nl_db_r = round(nl_db, 1)
    c_ms_r = round(c_ms, 1)
    prop_delay_r = round(propagation_delay_ms, 1)
    # Compute snr_db_r from the same rounded intermediates used in the
    # substitution so that the printed arithmetic reproduces the stated result.
    snr_db_r = round(source_level_db - tl_db_r - nl_db_r + directivity_index_db - detection_threshold_db, 1)
    worked = [
        worked_calc(
            label="Signal-to-noise ratio (sonar equation)",
            formula="SNR = SL - TL - NL + DI - DT",
            values={
                "SL": (source_level_db, "dB re 1 uPa"),
                "TL": (tl_db_r, "dB"),
                "NL": (nl_db_r, "dB"),
                "DI": (directivity_index_db, "dB"),
                "DT": (detection_threshold_db, "dB"),
            },
            result=snr_db_r, result_unit="dB",
            assumptions=[
                "TL = 20 log10(r) + alpha x r (Urick 1983 spherical + absorption)",
                "NL = noise_spectral_level + 10 log10(bandwidth)",
                "sound speed and absorption from Mackenzie / Francois-Garrison (not hand-checkable)",
            ],
        ),
        worked_calc(
            label="One-way propagation delay",
            formula="t_prop = distance_m / c x 1000",
            values={
                "distance_m": (distance_m, "m"),
                "c": (c_ms_r, "m/s"),
            },
            result=prop_delay_r, result_unit="ms",
            assumptions=["one-way delay; x 1000 converts s to ms; multiply by 2 for round-trip"],
        ),
    ]

    return {
        "frequency_khz": f_khz,
        "distance_km": distance_km,
        "depth_m": depth_m,
        "salinity_ppt": salinity,
        "water_temp_c": water_temp,
        "sound_speed_ms": round(c_ms, 1),
        "absorption_db_per_km": round(alpha, 3),
        "transmission_loss_db": round(tl_db, 1),
        "source_level_db": source_level_db,
        "noise_level_total_db": round(nl_db, 1),
        "snr_db": snr_db_r,
        "modulation": modulation,
        "data_rate_bps": round(data_rate_bps, 0),
        "ber_estimate": ber_estimate,
        "propagation_delay_ms": round(propagation_delay_ms, 1),
        "bandwidth_hz": bandwidth_hz,
        "link_viable": link_works,
        "shannon_capacity_bps": round(bandwidth_hz * math.log2(1 + 10**(snr_db/10)), 0)
            if snr_db > 0 else 0,
        "capacity_utilization": round(capacity_ratio, 2) if data_rate_bps > 0 else 0,
        "notes": (
            "Sonar equation per Urick (1983). Mackenzie sound speed, Francois-Garrison "
            "absorption. Low frequencies (<10 kHz) propagate further but offer lower bandwidth. "
            "High frequencies (>100 kHz) attenuate rapidly (>10 dB/km @ 100 kHz). "
            "Multipath in shallow water reduces practical rates 2-4× vs free field."
        ),
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
