#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/wireless_link_budget.py

BLE / NFC / Sub-GHz radio link budget calculator for wearable medical
devices (CGM, hearing aids, patches, etc.). Reads JSON from stdin,
writes JSON to stdout.

Input:
    {
      "tx_power_dbm": 0.0,
      "frequency_ghz": 2.4,          # 2.4 (BLE), 0.915 (sub-GHz), 0.013 (NFC 13.56 MHz)
      "distance_m": 2.0,
      "body_absorption": true,       # true if worn on body (~3 dB hit at 2.4 GHz)
      "antenna_gain_tx_dbi": 0.0,    # PIFA / chip antenna typical
      "antenna_gain_rx_dbi": 2.0,    # phone antenna typical
      "rx_sensitivity_dbm": -90.0    # BLE typical at 1 Mbps
    }

Output:
    {
      "path_loss_db": 46.0,
      "rx_power_dbm": -44.0,
      "link_margin_db": 46.0,
      "max_range_m": 25.0,
      ...
    }

Physics: Friis transmission equation in dB form.
  Pr_dBm = Pt_dBm + Gt + Gr - L_FSPL - L_body
  L_FSPL = 32.45 + 20 log10(f_MHz) + 20 log10(d_km)
         = 20 log10(4π d / λ)

Body absorption: at 2.4 GHz, head/torso adds ~3-5 dB; arm-worn adds ~3 dB.
At sub-GHz, body adds ~5-8 dB. At NFC (13.56 MHz), body essentially
transparent (~0.5 dB).

References:
- Hall & Hao, "Antennas and Propagation for Body-Centric Wireless
  Communications", 2nd ed.
- IEEE 802.15.6 Body Area Networks standard
- Texas Instruments CC2540 BLE radio datasheet (-93 dBm sens)
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'wireless_link_budget (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Hall, Hao eds. (2012), 'Antennas and Propagation for Body-Centric Wireless Communications', Artech House; IEEE 802.15.6-2012",
    "physics_basis": 'Friis transmission equation P_r = P_t × G_t × G_r × (λ/(4πd))². Body-absorption loss modelled per Hall-Hao chapter 4.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


SPEED_OF_LIGHT = 299_792_458.0  # m/s


def free_space_path_loss_db(distance_m: float, frequency_ghz: float) -> float:
    """Friis free-space path loss. L = 20 log10(4πd / λ)."""
    if distance_m < 0.001:
        distance_m = 0.001
    f_hz = frequency_ghz * 1e9
    wavelength_m = SPEED_OF_LIGHT / f_hz
    return 20.0 * math.log10(4.0 * math.pi * distance_m / wavelength_m)


def body_absorption_db(frequency_ghz: float, on_body: bool) -> float:
    """Body absorption loss for on-body wearables.
    From Hall & Hao Ch.3 + IEEE 802.15.6 PHY measurements."""
    if not on_body:
        return 0.0
    if frequency_ghz < 0.05:        # NFC 13.56 MHz
        return 0.5
    elif frequency_ghz < 0.5:        # MICS / sub-GHz
        return 7.0
    elif frequency_ghz < 1.0:        # 868 / 915 MHz
        return 5.5
    elif frequency_ghz < 3.0:        # 2.4 GHz ISM (BLE, ZigBee)
        return 3.0
    elif frequency_ghz < 7.0:        # 5 GHz Wi-Fi
        return 4.0
    else:                            # UWB / mmWave
        return 6.0


def compute(payload: dict) -> dict:
    tx_power_dbm = float(payload.get("tx_power_dbm", 0.0))
    freq_ghz = float(payload.get("frequency_ghz", 2.4))
    distance_m = float(payload.get("distance_m", 2.0))
    body_absorb = bool(payload.get("body_absorption", True))
    gain_tx = float(payload.get("antenna_gain_tx_dbi", 0.0))
    gain_rx = float(payload.get("antenna_gain_rx_dbi", 2.0))
    rx_sens_dbm = float(payload.get("rx_sensitivity_dbm", -90.0))

    fspl_db = free_space_path_loss_db(distance_m, freq_ghz)
    body_loss_db = body_absorption_db(freq_ghz, body_absorb)

    total_path_loss_db = fspl_db + body_loss_db
    rx_power_dbm = tx_power_dbm + gain_tx + gain_rx - total_path_loss_db
    link_margin_db = rx_power_dbm - rx_sens_dbm

    # Max range = distance at which link_margin reaches 0
    # Solve: rx_sens = tx + Gt + Gr - body - 20 log10(4π d / λ)
    f_hz = freq_ghz * 1e9
    wavelength_m = SPEED_OF_LIGHT / f_hz
    allowed_fspl_db = tx_power_dbm + gain_tx + gain_rx - body_loss_db - rx_sens_dbm
    max_range_m = (wavelength_m / (4.0 * math.pi)) * (10.0 ** (allowed_fspl_db / 20.0))

    feasibility = "OK" if link_margin_db >= 10.0 else (
        "MARGINAL" if link_margin_db >= 0.0 else "INFEASIBLE")

    return {
        "tx_power_dbm": tx_power_dbm,
        "frequency_ghz": freq_ghz,
        "distance_m": distance_m,
        "wavelength_m": round(wavelength_m, 4),
        "free_space_path_loss_db": round(fspl_db, 2),
        "body_absorption_loss_db": round(body_loss_db, 2),
        "total_path_loss_db": round(total_path_loss_db, 2),
        "rx_power_dbm": round(rx_power_dbm, 2),
        "rx_sensitivity_dbm": rx_sens_dbm,
        "link_margin_db": round(link_margin_db, 2),
        "max_range_m": round(max_range_m, 2),
        "feasibility": feasibility,
        "_meta": {
            "model": "Friis free-space + body-absorption (Hall & Hao 2012, IEEE 802.15.6)",
        },
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
