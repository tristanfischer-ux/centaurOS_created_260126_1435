#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/l_band_iot_link.py

L-band (1-2 GHz) satellite IoT link budget — short messages from
low-power ground devices to LEO satellites.

Companies served: Astrocast (CH), Kinéis (FR), Hiber (NL), Swarm
(US/EU customers), Iridium.

Input:
    {
      "device_tx_power_dbm": 27.0,
      "antenna_gain_dbi": 2.0,
      "sat_altitude_km": 500.0,
      "data_rate_bps": 200.0,
      "messages_per_day_target": 12,
      "battery_capacity_mah": 19000.0
    }

Output:
    link_margin_db, daily_messages_per_device, battery_life_years,
    coverage_km2_per_sat, doppler_offset_khz, _provenance.

Physics:
  Friis link budget + Astrocast / Argos / Iridium published parameters
  Battery life: average current * device duty cycle

References:
- Astrocast NB-IoT-NTN whitepaper (2023).
- Argos system handbook (CLS, 2018).
- Iridium NEXT mission profile (Iridium Communications 2017).
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
    "tool_name": "l_band_iot_link (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Astrocast NB-IoT-NTN whitepaper (2023); "
        "Argos system handbook (CLS 2018); "
        "Iridium NEXT mission profile (2017); "
        "Sklar (2001) 'Digital Communications' 2nd ed."
    ),
    "physics_basis": (
        "L-band Friis link budget. Doppler from LEO radial velocity. "
        "Argos / Astrocast modulations BPSK / GMSK. Battery life from "
        "average current draw at duty cycle."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "ASTROCAST_LINK_TARGETS": {
            "source": "Astrocast 2023 datasheet; +27 dBm EIRP UT, ~3 dB link margin design",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


R_EARTH_KM = 6378.137
GM_EARTH = 3.986004418e14
C_LIGHT = 2.998e8


def compute(payload: dict) -> dict:
    tx_dbm = float(payload.get("device_tx_power_dbm", 27.0))
    ant_gain_dbi = float(payload.get("antenna_gain_dbi", 2.0))
    sat_alt_km = float(payload.get("sat_altitude_km", 500.0))
    data_rate_bps = float(payload.get("data_rate_bps", 200.0))
    msgs_per_day = float(payload.get("messages_per_day_target", 12))
    battery_mah = float(payload.get("battery_capacity_mah", 19000.0))
    elevation_deg = float(payload.get("elevation_deg", 30.0))
    freq_ghz = float(payload.get("freq_ghz", 1.6))  # L-band default
    sat_g_t_db_k = float(payload.get("sat_g_t_db_k", 5.0))

    # Slant range
    el_rad = math.radians(elevation_deg)
    R_sat_km = R_EARTH_KM + sat_alt_km
    slant_range_km = math.sqrt(R_sat_km ** 2 - (R_EARTH_KM * math.cos(el_rad)) ** 2) - R_EARTH_KM * math.sin(el_rad)
    slant_range_km = max(slant_range_km, sat_alt_km)

    # FSPL
    fspl_db = 92.45 + 20.0 * math.log10(slant_range_km) + 20.0 * math.log10(freq_ghz)
    # Atmospheric absorption (L-band negligible)
    atm_loss_db = 0.1

    # EIRP
    eirp_dbm = tx_dbm + ant_gain_dbi
    eirp_dbw = eirp_dbm - 30

    # C/N0
    cn0_dbhz = eirp_dbw - fspl_db - atm_loss_db + sat_g_t_db_k + 228.6

    # Eb/N0 at the requested data rate
    ebno_db = cn0_dbhz - 10.0 * math.log10(data_rate_bps)
    required_ebno_db = 8.0  # BPSK/GMSK for BER 1e-5 with FEC
    link_margin_db = ebno_db - required_ebno_db

    # Doppler offset
    v_orbital_m_s = math.sqrt(GM_EARTH / (R_sat_km * 1000.0))
    doppler_max_hz = v_orbital_m_s * freq_ghz * 1e9 / C_LIGHT
    doppler_khz = doppler_max_hz / 1000.0

    # Coverage area
    sin_inner = R_EARTH_KM / R_sat_km * math.cos(el_rad)
    if abs(sin_inner) > 1:
        coverage_km2 = 0.0
    else:
        alpha = math.pi / 2 - el_rad - math.asin(sin_inner)
        footprint_radius_km = R_EARTH_KM * alpha
        coverage_km2 = math.pi * footprint_radius_km ** 2

    # Daily messages per device
    # Assumes link margin > 0 means message goes through
    if link_margin_db > 0:
        # Astrocast: ~4-12 messages/day with current constellation
        daily_messages = min(msgs_per_day, 48)
    else:
        daily_messages = 0

    # Battery life
    # Per message: 2 seconds at 500 mA (TX), then 1 second of idle
    tx_current_a = 0.5  # 500 mA during TX
    idle_current_a = 0.00005  # 50 uA idle
    tx_time_per_msg_s = 2.0
    msg_energy_mah = (tx_current_a * tx_time_per_msg_s) / 3600.0 * 1000  # mAh per message
    daily_consumption_mah = daily_messages * msg_energy_mah + idle_current_a * 24 * 1000
    if daily_consumption_mah > 0:
        battery_life_days = battery_mah / daily_consumption_mah
    else:
        battery_life_days = float("inf")
    battery_life_years = battery_life_days / 365.25

    # Worked calculations — closed-form dB arithmetic and battery life steps.
    # FSPL (20*log10 of range and frequency) and Eb/N0 (10*log10 of data rate)
    # are transcendental — skipped. Pass their live values as inputs to downstream steps.
    eirp_dbm_r = round(eirp_dbm, 2)
    eirp_dbw_r = round(eirp_dbw, 2)
    cn0_r = round(cn0_dbhz, 2)
    ebno_r = round(ebno_db, 2)
    margin_r = round(link_margin_db, 2)
    msg_e_r = round(msg_energy_mah, 3)
    daily_c_r = round(daily_consumption_mah, 4)
    worked = [
        worked_calc(
            label="Device EIRP (Effective Isotropic Radiated Power)",
            formula="eirp_dbm = tx_dbm + ant_gain_dbi",
            values={
                "tx_dbm": (tx_dbm, "dBm"),
                "ant_gain_dbi": (ant_gain_dbi, "dBi"),
            },
            result=eirp_dbm_r, result_unit="dBm",
            assumptions=["dB addition; antenna gain referenced to isotropic"],
        ),
        worked_calc(
            label="EIRP in dBW",
            formula="eirp_dbw = eirp_dbm - 30",
            values={
                "eirp_dbm": (eirp_dbm_r, "dBm"),
            },
            result=eirp_dbw_r, result_unit="dBW",
            assumptions=["0 dBW = 30 dBm"],
        ),
        worked_calc(
            label="Carrier-to-noise-density ratio (C/N0)",
            formula="cn0_dbhz = eirp_dbw - fspl_db - atm_loss_db + sat_g_t_db_k + 228.6",
            values={
                "eirp_dbw": (eirp_dbw_r, "dBW"),
                "fspl_db": (round(fspl_db, 2), "dB"),
                "atm_loss_db": (atm_loss_db, "dB"),
                "sat_g_t_db_k": (sat_g_t_db_k, "dB/K"),
            },
            result=cn0_r, result_unit="dBHz",
            assumptions=[
                "Friis link equation; 228.6 dBW/K/Hz = Boltzmann constant in dB",
                "fspl_db = 92.45 + 20*log10(range_km) + 20*log10(freq_GHz) — not hand-verifiable (log10)",
            ],
        ),
        worked_calc(
            label="Link margin",
            formula="link_margin_db = ebno_db - required_ebno_db",
            values={
                "ebno_db": (ebno_r, "dB"),
                "required_ebno_db": (required_ebno_db, "dB"),
            },
            result=margin_r, result_unit="dB",
            assumptions=[
                "required_ebno_db = 8.0 dB for BPSK/GMSK at BER 1e-5 with FEC (Sklar 2001)",
                "ebno_db = cn0_dbhz - 10*log10(data_rate_bps) — not hand-verifiable (log10); treated as input",
            ],
        ),
        worked_calc(
            label="Energy per message",
            formula="msg_energy_mah = (tx_current x tx_time_per_msg) / 3600 x 1000",
            values={
                "tx_current": (tx_current_a, "A"),
                "tx_time_per_msg": (tx_time_per_msg_s, "s"),
            },
            result=msg_e_r, result_unit="mAh",
            assumptions=["tx_current = 500 mA during transmission; tx_time = 2 s per message"],
        ),
        worked_calc(
            label="Daily battery consumption",
            formula="daily_consumption_mah = daily_messages x msg_energy_mah + idle_current_a x 24 x 1000",
            values={
                "daily_messages": (int(daily_messages), ""),
                "msg_energy_mah": (msg_e_r, "mAh"),
                "idle_current_a": (idle_current_a, "A"),
            },
            result=daily_c_r, result_unit="mAh/day",
            assumptions=["idle_current = 50 uA = 0.00005 A; 24 hours/day"],
        ),
    ]
    if daily_consumption_mah > 0 and battery_life_years != float("inf"):
        battery_life_years_r = round(battery_life_years, 1)
        battery_life_days_r = round(battery_life_days, 1)
        worked.append(worked_calc(
            label="Battery life",
            formula="battery_life_years = (battery_mah / daily_consumption_mah) / 365.25",
            values={
                "battery_mah": (battery_mah, "mAh"),
                "daily_consumption_mah": (daily_c_r, "mAh/day"),
            },
            result=battery_life_years_r, result_unit="years",
            assumptions=["365.25 days/year"],
        ))

    return {
        "device_tx_power_dbm": tx_dbm,
        "antenna_gain_dbi": ant_gain_dbi,
        "eirp_dbm": eirp_dbm,
        "sat_altitude_km": sat_alt_km,
        "slant_range_km": round(slant_range_km, 1),
        "elevation_deg": elevation_deg,
        "freq_ghz": freq_ghz,
        "fspl_db": round(fspl_db, 2),
        "cn0_dbhz": round(cn0_dbhz, 2),
        "ebno_db": round(ebno_db, 2),
        "required_ebno_db": required_ebno_db,
        "link_margin_db": round(link_margin_db, 2),
        "doppler_offset_khz": round(doppler_khz, 2),
        "coverage_km2_per_sat": round(coverage_km2, 0),
        "daily_messages_per_device": int(daily_messages),
        "msg_energy_mah": round(msg_energy_mah, 3),
        "daily_consumption_mah": round(daily_consumption_mah, 4),
        "battery_life_years": round(battery_life_years, 1) if battery_life_years != float("inf") else None,
        "data_rate_bps": data_rate_bps,
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
