#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/nb_iot_satellite_link.py

NB-IoT (Narrowband Internet of Things) satellite link budget — 5G/3GPP
Rel-17 NTN extension. Computes link margin, Doppler offset, coverage area
for a satellite-borne NB-IoT base station.

Companies served: Sateliot (ES), Iridium NB-IoT, OQ Tech (LU), Lacuna Space (UK).

Input:
    {
      "user_terminal_eirp_dbm": 20.0,
      "satellite_g_t_db_k": 10.0,
      "frequency_band": "S" | "L" | "Ka",
      "data_rate_required_bps": 240.0,
      "sat_altitude_km": 500.0,
      "elevation_deg": 30.0
    }

Output:
    link_margin_db, doppler_offset_khz, coverage_km2_per_sat,
    user_terminal_battery_life_years, _provenance.

Physics:
  Link budget (Friis):
    P_rx = EIRP - FSPL + G_rx - L_atm
    SNR = P_rx + 228.6 - 10log10(T_sys * BW)
  Doppler: f_d = v_radial * f / c
  Coverage: subsatellite footprint per elevation mask

References:
- 3GPP TR 38.821 V16.1.0 "Solutions for NR to support non-terrestrial networks
  (NTN)", 2021.
- 3GPP TS 38.331 V17.0.0 "NR Radio Resource Control (RRC) protocol", 2022.
- Liberg, O. et al., "Cellular Internet of Things: From Massive Deployments
  to Critical 5G Applications", 2nd ed., Academic Press 2020.
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
    "tool_name": "nb_iot_satellite_link (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "3GPP TR 38.821 V16.1.0 (2021) 'Solutions for NR to support NTN'; "
        "3GPP TS 38.331 V17.0.0 (2022); "
        "Liberg et al. (2020) 'Cellular Internet of Things: From Massive "
        "Deployments to Critical 5G Applications' 2nd ed."
    ),
    "physics_basis": (
        "3GPP NR-NTN Friis link equation. Doppler from satellite radial "
        "velocity. NB-IoT bandwidth = 180 kHz (12 subcarriers @ 15 kHz "
        "or 4×3.75 kHz). Earth-station footprint from elevation mask."
    ),
    "confidence_class": "standard",
    "embedded_constants": {
        "BAND_FREQUENCIES": {
            "source": "ITU-R Radio Regulations; L-band 1.5 GHz, S-band 2.0 GHz, Ka 20 GHz",
            "confidence": "standard",
        },
        "FSPL_OFFSET_DB": {
            "source": "Friis formula: FSPL = 92.45 + 20log10(d_km) + 20log10(f_GHz)",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Frequency band properties
BANDS = {
    "L":   {"freq_ghz": 1.5, "atm_loss_db": 0.1},
    "S":   {"freq_ghz": 2.0, "atm_loss_db": 0.15},
    "C":   {"freq_ghz": 5.0, "atm_loss_db": 0.2},
    "X":   {"freq_ghz": 8.0, "atm_loss_db": 0.3},
    "Ku":  {"freq_ghz": 12.0, "atm_loss_db": 0.5},
    "Ka":  {"freq_ghz": 20.0, "atm_loss_db": 1.0},
}

R_EARTH_KM = 6378.137
GM_EARTH = 3.986004418e14
C_LIGHT = 2.998e8
BOLTZMANN_DB = 228.6


def compute(payload: dict) -> dict:
    eirp_dbm = float(payload.get("user_terminal_eirp_dbm", 20.0))
    g_t_db_k = float(payload.get("satellite_g_t_db_k", 10.0))
    band = str(payload.get("frequency_band", "S"))
    data_rate_bps = float(payload.get("data_rate_required_bps", 240.0))
    sat_alt_km = float(payload.get("sat_altitude_km", 500.0))
    elevation_deg = float(payload.get("elevation_deg", 30.0))

    if band not in BANDS:
        band = "S"
    b = BANDS[band]

    freq_ghz = b["freq_ghz"]

    # Slant range
    R_sat_km = R_EARTH_KM + sat_alt_km
    el_rad = math.radians(elevation_deg)
    # Spherical geometry: slant range from elevation
    # R_slant = R_E * sin(arccos(R_E/R_sat * cos(el)) - el)  / sin(el)
    cos_el = math.cos(el_rad)
    R_E = R_EARTH_KM
    if abs(R_E * cos_el / R_sat_km) > 1:
        slant_range_km = R_sat_km
    else:
        gamma_rad = math.acos(R_E * cos_el / R_sat_km)
        slant_range_km = R_sat_km * math.sin(gamma_rad - el_rad) / max(math.cos(el_rad), 0.001) if math.cos(el_rad) > 0 else R_sat_km
    # Simpler approximation:
    slant_range_km = math.sqrt(R_sat_km ** 2 - (R_E * cos_el) ** 2) - R_E * math.sin(el_rad)
    slant_range_km = max(slant_range_km, sat_alt_km)

    # FSPL
    fspl_db = 92.45 + 20.0 * math.log10(slant_range_km) + 20.0 * math.log10(freq_ghz)

    # Atmospheric loss (scaled by slant range)
    atm_loss_db = b["atm_loss_db"] / math.sin(el_rad)

    # Received power (uplink, UT to satellite)
    eirp_dbw = eirp_dbm - 30.0
    rx_power_dbw = eirp_dbw - fspl_db - atm_loss_db

    # SNR: NB-IoT bandwidth = 180 kHz
    bw_hz = 180e3
    # C/N0 = P_rx + 228.6 - 10*log10(T_sys), here T_sys handled via G/T
    cn0_dbhz = eirp_dbw - fspl_db - atm_loss_db + g_t_db_k + BOLTZMANN_DB

    # SNR for given data rate
    ebno_db = cn0_dbhz - 10.0 * math.log10(data_rate_bps)
    required_ebno_db = 3.5  # NB-IoT receiver sensitivity threshold
    link_margin_db = ebno_db - required_ebno_db

    # Doppler offset
    # v_radial_max ~ orbital velocity * cos(arcsin(R_E/R_sat))
    v_orbital_m_s = math.sqrt(GM_EARTH / (R_sat_km * 1000.0))
    doppler_max_hz = v_orbital_m_s * freq_ghz * 1e9 / C_LIGHT
    doppler_khz = doppler_max_hz / 1000.0

    # Coverage area
    # Footprint half-angle from elevation mask
    sin_inner = R_E / R_sat_km * math.cos(el_rad)
    if abs(sin_inner) > 1:
        coverage_km2 = 0.0
    else:
        alpha_rad = math.pi / 2 - el_rad - math.asin(sin_inner)
        footprint_radius_km = R_E * alpha_rad
        coverage_km2 = math.pi * footprint_radius_km ** 2

    # User-terminal battery life
    # Assume duty cycle: 1 transmission per hour, 2s each, 25 mA TX, 30 uA idle
    bat_mah = float(payload.get("terminal_battery_mah", 2400))
    tx_current_ma = 25.0
    idle_current_ma = 0.030
    duty_cycle = 2.0 / 3600.0  # 2 seconds per hour
    avg_current_ma = tx_current_ma * duty_cycle + idle_current_ma * (1 - duty_cycle)
    battery_life_h = bat_mah / avg_current_ma
    battery_life_years = battery_life_h / 8760.0

    # Worked calculations.
    # FSPL, CNO, EbNo all involve log10 (transcendental) — skip.
    # Doppler uses sqrt (transcendental) — skip.
    # Battery life duty-cycle average current is pure arithmetic — convert.
    # Round to 4 dp so _fmt displays the same digits used in the substitution,
    # then chain each subsequent step off the prior rounded value (drift-safe).
    avg_current_r = round(avg_current_ma, 4)
    battery_life_h_r = round(bat_mah / avg_current_r, 1)
    worked = [
        worked_calc(
            label="Average terminal current draw",
            formula="I_avg = I_tx x duty + I_idle x (1 - duty)",
            values={
                "I_tx": (tx_current_ma, "mA"),
                "duty": (duty_cycle, ""),
                "I_idle": (idle_current_ma, "mA"),
            },
            result=avg_current_r, result_unit="mA",
            assumptions=[
                "duty = 2 s TX per 3600 s hour",
                "I_tx = 25 mA (NB-IoT typical uplink at 20 dBm EIRP)",
                "I_idle = 0.030 mA (PSM deep sleep, 3GPP TS 23.682)",
            ],
        ),
        worked_calc(
            label="Battery life",
            formula="t_battery = bat_mah / I_avg",
            values={"bat_mah": (bat_mah, "mAh"), "I_avg": (avg_current_r, "mA")},
            result=battery_life_h_r, result_unit="h",
            assumptions=[],
        ),
        worked_calc(
            label="Battery life in years",
            formula="t_years = t_battery / 8760",
            values={"t_battery": (battery_life_h_r, "h")},
            result=round(battery_life_h_r / 8760.0, 2), result_unit="years",
            assumptions=["8760 h/year"],
        ),
    ]

    return {
        "user_terminal_eirp_dbm": eirp_dbm,
        "satellite_g_t_db_k": g_t_db_k,
        "frequency_band": band,
        "frequency_ghz": freq_ghz,
        "data_rate_required_bps": data_rate_bps,
        "sat_altitude_km": sat_alt_km,
        "elevation_deg": elevation_deg,
        "slant_range_km": round(slant_range_km, 1),
        "fspl_db": round(fspl_db, 2),
        "atmospheric_loss_db": round(atm_loss_db, 2),
        "cn0_dbhz": round(cn0_dbhz, 2),
        "ebno_db": round(ebno_db, 2),
        "required_ebno_db": required_ebno_db,
        "link_margin_db": round(link_margin_db, 2),
        "doppler_offset_khz": round(doppler_khz, 2),
        "coverage_km2_per_sat": round(coverage_km2, 0),
        "user_terminal_battery_life_years": round(battery_life_years, 2),
        "v_orbital_km_s": round(v_orbital_m_s / 1000.0, 3),
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
