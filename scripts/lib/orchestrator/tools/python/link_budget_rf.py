#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/link_budget_rf.py

Full RF link budget — spacecraft-to-ground or spacecraft-to-spacecraft.
S-band, X-band, Ka-band, V-band; multiple modulations.

Input:
    {
      "tx_power_w": 5.0,
      "tx_antenna_gain_dbi": 13.0,
      "tx_pointing_loss_db": 0.5,
      "frequency_ghz": 8.4,          # S=2.2, X=8.4, Ka=26, V=60
      "distance_km": 800.0,
      "rx_antenna_gain_dbi": 50.0,
      "rx_pointing_loss_db": 0.3,
      "system_noise_temp_k": 100.0,
      "bandwidth_hz": 5.0e6,
      "required_ebno_db": 6.0,
      "atmospheric_loss_db": 1.0,
      "polarisation_loss_db": 0.5,
      "modulation": "QPSK"           # BPSK | QPSK | 8PSK | 16APSK | OOK
    }

Output:
    {
      "eirp_dbw": ...,
      "free_space_path_loss_db": ...,
      "rx_power_dbw": ...,
      "cn0_dbhz": ...,
      "ebno_db": ...,
      "link_margin_db": ...,
      "data_rate_bps_supported": ...,
      ...
    }

Physics:
  EIRP = P_tx + G_tx - L_pointing_tx
  FSPL = 20·log10(d) + 20·log10(f) + 92.45    [d in km, f in GHz]
  Rx_power = EIRP - FSPL - L_atm - L_pol - L_pointing_rx + G_rx
  C/N0 = Rx_power + 228.6 - 10·log10(T_sys)
  Eb/N0 = C/N0 - 10·log10(R_bit)

References:
- Sklar, B., "Digital Communications: Fundamentals and Applications", 2nd ed.,
  Prentice Hall 2001.
- Pratt, T., Bostian, C., Allnutt, J., "Satellite Communications", 2nd ed.,
  Wiley 2003, ch.4 (Link Budget).
- ITU-R P.676 (atmospheric absorption), P.618 (rain attenuation).
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'link_budget_rf (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Sklar (2001), 'Digital Communications' 2nd ed., Prentice Hall; Pratt, Bostian, Allnutt (2002), 'Satellite Communications' 2nd ed. ch.4; ITU-R P.676 (atmospheric attenuation), P.618 (rain attenuation)",
    "physics_basis": 'Margin = EIRP + G_rx - FSPL - L_atm - L_other - (kTB + SNR_required). Friis FSPL = 20 log10(4πd/λ).',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Modulation efficiency (bits per symbol)
MOD_BITS_PER_SYMBOL = {
    "BPSK":   1,
    "QPSK":   2,
    "8PSK":   3,
    "16APSK": 4,
    "OOK":    1,
}

# Minimum Eb/N0 for BER 1e-6 (uncoded), shifted by FEC ~ 3-5 dB depending on code rate
MIN_EBN0_DB = {
    "BPSK":   10.5,
    "QPSK":   10.5,
    "8PSK":   14.0,
    "16APSK": 17.0,
    "OOK":    13.5,
}


def compute(payload: dict) -> dict:
    tx_power_w = float(payload.get("tx_power_w", 5.0))
    tx_gain_dbi = float(payload.get("tx_antenna_gain_dbi", 13.0))
    tx_point_loss_db = float(payload.get("tx_pointing_loss_db", 0.5))
    freq_ghz = float(payload.get("frequency_ghz", 8.4))
    distance_km = float(payload.get("distance_km", 800.0))
    rx_gain_dbi = float(payload.get("rx_antenna_gain_dbi", 50.0))
    rx_point_loss_db = float(payload.get("rx_pointing_loss_db", 0.3))
    t_sys_k = float(payload.get("system_noise_temp_k", 100.0))
    bw_hz = float(payload.get("bandwidth_hz", 5e6))
    required_ebno_db = float(payload.get("required_ebno_db", 6.0))
    l_atm_db = float(payload.get("atmospheric_loss_db", 1.0))
    l_pol_db = float(payload.get("polarisation_loss_db", 0.5))
    # Build #20-cleanup (2026-05-22): normalise to uppercase to accept
    # lowercase + mixed-case modulation strings. HAPS class plan passes
    # 'qpsk' which previously raised ValueError + exit 3.
    modulation = safe_choice(str(payload.get("modulation", "QPSK")).upper(), MOD_BITS_PER_SYMBOL, default="QPSK", label="modulation")

    if modulation not in MOD_BITS_PER_SYMBOL:
        raise ValueError(f"unknown modulation {modulation!r}; known: {list(MOD_BITS_PER_SYMBOL)}")

    # Convert TX power to dBW
    if tx_power_w <= 0:
        raise ValueError("tx_power_w must be positive")
    tx_power_dbw = 10.0 * math.log10(tx_power_w)

    # EIRP = P_tx (dBW) + G_tx (dBi) - L_pointing_tx (dB)
    eirp_dbw = tx_power_dbw + tx_gain_dbi - tx_point_loss_db

    # Free-space path loss (Friis in dB):  FSPL = 20·log10(4πd/λ) = 92.45 + 20·log10(d_km) + 20·log10(f_GHz)
    if distance_km <= 0 or freq_ghz <= 0:
        raise ValueError("distance_km and frequency_ghz must be positive")
    fspl_db = 92.45 + 20.0 * math.log10(distance_km) + 20.0 * math.log10(freq_ghz)

    # Rx isotropic power (dBW): EIRP - FSPL - L_atm - L_pol - L_pointing_rx
    rx_iso_dbw = eirp_dbw - fspl_db - l_atm_db - l_pol_db - rx_point_loss_db
    rx_power_dbw = rx_iso_dbw + rx_gain_dbi  # after applying RX antenna gain

    # Carrier-to-noise-density: C/N0 = Rx_power (dBW) + 228.6 - 10·log10(T_sys)
    # 228.6 = -10·log10(k_Boltzmann) where k = 1.38e-23
    BOLTZMANN_OFFSET_DB = 228.6
    cn0_dbhz = rx_power_dbw + BOLTZMANN_OFFSET_DB - 10.0 * math.log10(t_sys_k)

    # For a given bandwidth, what data rate fits? Bits/symbol from modulation,
    # symbol rate ~ bandwidth (assume 100% spectral efficiency for back-of-envelope;
    # real DVB-S2 etc gets 80% Nyquist roll-off).
    bits_per_symbol = MOD_BITS_PER_SYMBOL[modulation]
    nyquist_roll = 0.8  # 20% roll-off
    symbol_rate = bw_hz * nyquist_roll
    data_rate_bps_bandwidth_limited = symbol_rate * bits_per_symbol

    # Power-limited data rate from C/N0 and required Eb/N0:
    #   Eb/N0 = C/N0 - 10·log10(R_bit) - implementation_loss
    impl_loss_db = 1.5  # typical implementation loss
    # Solve for R_bit such that Eb/N0 = required_ebno_db
    # 10·log10(R_bit) = C/N0 - required_ebno_db - impl_loss
    log_r = (cn0_dbhz - required_ebno_db - impl_loss_db) / 10.0
    if log_r > 0:
        data_rate_power_limited = 10.0 ** log_r
    else:
        data_rate_power_limited = 0.0

    # Effective data rate = min(bandwidth_limited, power_limited)
    data_rate_bps = min(data_rate_bps_bandwidth_limited, data_rate_power_limited)

    # Eb/N0 at the limiting data rate
    if data_rate_bps > 0:
        ebno_db = cn0_dbhz - 10.0 * math.log10(data_rate_bps) - impl_loss_db
    else:
        ebno_db = -float("inf")

    # Link margin at the configured data rate (use the bandwidth-supported rate as design rate)
    if data_rate_bps_bandwidth_limited > 0:
        ebno_at_bw_db = cn0_dbhz - 10.0 * math.log10(data_rate_bps_bandwidth_limited) - impl_loss_db
    else:
        ebno_at_bw_db = -float("inf")
    link_margin_db = ebno_at_bw_db - required_ebno_db

    # Rounded display values that chain through the worked calculations.
    eirp_r = round(eirp_dbw, 3)
    rx_power_r = round(rx_power_dbw, 3)
    link_margin_r = round(link_margin_db, 3) if link_margin_db != -float("inf") else None

    # Worked calculations (hand-checkable dB arithmetic only).
    # tx_power_dbw uses log10 — SKIP.
    # fspl_db uses log10 — SKIP.
    # cn0 uses log10(T_sys) — SKIP.
    # data_rate_power_limited uses 10^x — SKIP.
    worked = [
        worked_calc(
            label="Effective isotropic radiated power (EIRP)",
            formula="EIRP = tx_dbw + G_tx - L_tx_point",
            values={
                "tx_dbw": (round(tx_power_dbw, 3), "dBW"),
                "G_tx": (tx_gain_dbi, "dBi"),
                "L_tx_point": (tx_point_loss_db, "dB"),
            },
            result=eirp_r, result_unit="dBW",
            assumptions=["EIRP = transmitter power + antenna gain − pointing loss"],
        ),
        worked_calc(
            label="Received power at antenna port",
            formula="P_rx = EIRP - FSPL - L_atm - L_pol - L_rx_point + G_rx",
            values={
                "EIRP": (eirp_r, "dBW"),
                "FSPL": (round(fspl_db, 3), "dB"),
                "L_atm": (l_atm_db, "dB"),
                "L_pol": (l_pol_db, "dB"),
                "L_rx_point": (rx_point_loss_db, "dB"),
                "G_rx": (rx_gain_dbi, "dBi"),
            },
            result=rx_power_r, result_unit="dBW",
            assumptions=["Friis free-space transmission equation; atmospheric + polarisation losses"],
        ),
        worked_calc(
            label="Link margin at design bandwidth",
            formula="margin = Eb_N0_at_bw - required_EbN0",
            values={
                "Eb_N0_at_bw": (round(ebno_at_bw_db, 3) if ebno_at_bw_db != -float("inf") else 0.0, "dB"),
                "required_EbN0": (required_ebno_db, "dB"),
            },
            result=link_margin_r if link_margin_r is not None else 0.0,
            result_unit="dB",
            assumptions=["positive margin = link closes at design data rate"],
        ),
    ]

    return {
        "tx_power_w": tx_power_w,
        "tx_power_dbw": round(tx_power_dbw, 3),
        "tx_antenna_gain_dbi": tx_gain_dbi,
        "tx_pointing_loss_db": tx_point_loss_db,
        "frequency_ghz": freq_ghz,
        "distance_km": distance_km,
        "rx_antenna_gain_dbi": rx_gain_dbi,
        "rx_pointing_loss_db": rx_point_loss_db,
        "system_noise_temp_k": t_sys_k,
        "bandwidth_hz": bw_hz,
        "required_ebno_db": required_ebno_db,
        "atmospheric_loss_db": l_atm_db,
        "polarisation_loss_db": l_pol_db,
        "modulation": modulation,
        "bits_per_symbol": bits_per_symbol,
        "eirp_dbw": round(eirp_dbw, 3),
        "free_space_path_loss_db": round(fspl_db, 3),
        "rx_power_dbw": round(rx_power_dbw, 3),
        "rx_power_dbm": round(rx_power_dbw + 30, 3),
        "cn0_dbhz": round(cn0_dbhz, 3),
        "implementation_loss_db": impl_loss_db,
        "ebno_db": round(ebno_db, 3) if ebno_db != -float("inf") else None,
        "ebno_at_design_bw_db": round(ebno_at_bw_db, 3) if ebno_at_bw_db != -float("inf") else None,
        "link_margin_db": link_margin_r,
        "data_rate_bps_supported": int(round(data_rate_bps)),
        "data_rate_bps_bandwidth_limited": int(round(data_rate_bps_bandwidth_limited)),
        "data_rate_bps_power_limited": int(round(data_rate_power_limited)),
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
