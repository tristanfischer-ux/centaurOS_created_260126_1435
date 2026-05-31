#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/vdes_maritime.py

VDES (VHF Data Exchange System) maritime satellite link.
Models throughput, collision rate and ship capacity for VDES at VHF.

Companies served: Sternula (DK), Saturn Satellite Networks (US/EU customers),
ESA partner SatNav/SatComm consortium.

Input:
    {
      "vessel_density_per_km2": 0.05,
      "message_rate_per_vessel_per_hour": 4.0,
      "freq_band": "161_MHz" | "162_MHz",
      "sat_altitude_km": 500.0,
      "channel_bandwidth_khz": 25.0,
      "modulation": "GMSK" | "PI/4_DQPSK" | "16QAM"
    }

Output:
    data_throughput_kbps, collision_rate_pct, max_vessels_per_satellite,
    contact_duration_minutes, _provenance.

Physics:
  Aloha throughput: T = G * exp(-G * 2)  where G = traffic load
  Coverage limited by elevation mask and Earth curvature.

References:
- ITU-R M.2092-1 "Technical characteristics for a VHF data exchange system in
  the maritime mobile band", 2022.
- IALA Guideline G-1117 "VHF Data Exchange System (VDES) Overview", 2019.
- Roberts, L.G. "Aloha packet system with and without slots and capture",
  Computer Communications Review 5(2):28-42, 1975.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "vdes_maritime (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "ITU-R M.2092-1 (2022) 'Technical characteristics for VDES'; "
        "IALA Guideline G-1117 (2019) 'VHF Data Exchange System Overview'; "
        "Roberts (1975) 'Aloha packet system with and without slots and "
        "capture' Computer Communications Review 5(2):28."
    ),
    "physics_basis": (
        "Aloha / slotted-Aloha medium-access throughput. VDES TDMA frame "
        "structure with 30 slots/sec @ 9.6 kbps GMSK = 9600 bps raw. "
        "Modulation order increases throughput for 16QAM (38.4 kbps)."
    ),
    "confidence_class": "standard",
    "embedded_constants": {
        "VDES_DATA_RATES": {
            "source": "ITU-R M.2092-1; GMSK 9.6 kbps, PI/4-DQPSK 19.2, 16QAM 38.4",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Modulation data rates per channel (kbps)
MODULATION_RATES_KBPS = {
    "GMSK":        9.6,
    "PI/4_DQPSK":  19.2,
    "16QAM":       38.4,
    "QPSK":        19.2,
}

# VDES channel allocations
CHANNELS_PER_BAND = {
    "161_MHz": 2,  # VDE-SAT downlink
    "162_MHz": 2,  # VDE-SAT uplink
    "AIS_161_975": 1,
}

R_EARTH_KM = 6378.137


def compute(payload: dict) -> dict:
    density = float(payload.get("vessel_density_per_km2", 0.05))
    msg_per_hr = float(payload.get("message_rate_per_vessel_per_hour", 4.0))
    band = str(payload.get("freq_band", "161_MHz"))
    sat_alt_km = float(payload.get("sat_altitude_km", 500.0))
    bw_khz = float(payload.get("channel_bandwidth_khz", 25.0))
    modulation = str(payload.get("modulation", "GMSK"))
    elevation_deg = float(payload.get("elevation_deg", 10.0))

    if modulation not in MODULATION_RATES_KBPS:
        modulation = "GMSK"
    if band not in CHANNELS_PER_BAND:
        band = "161_MHz"

    base_rate_kbps = MODULATION_RATES_KBPS[modulation]
    num_channels = CHANNELS_PER_BAND[band]
    total_raw_rate_kbps = base_rate_kbps * num_channels

    # Coverage area
    el_rad = math.radians(elevation_deg)
    R_sat_km = R_EARTH_KM + sat_alt_km
    sin_inner = R_EARTH_KM / R_sat_km * math.cos(el_rad)
    if abs(sin_inner) > 1:
        coverage_km2 = 0.0
        contact_minutes = 0.0
    else:
        alpha = math.pi / 2 - el_rad - math.asin(sin_inner)
        footprint_radius_km = R_EARTH_KM * alpha
        coverage_km2 = math.pi * footprint_radius_km ** 2
        # Contact duration: pass length / ground speed
        # For LEO: pass length ~ 3000 km at 30° elev, speed ~ 7 km/s
        contact_minutes = 2.0 * footprint_radius_km / 7.5 / 60.0

    # Number of vessels in footprint
    vessels_in_footprint = density * coverage_km2

    # Traffic load (messages per second)
    avg_msg_bytes = 50  # typical VDES message
    avg_msg_bits = avg_msg_bytes * 8
    msgs_per_sec_per_vessel = msg_per_hr / 3600.0
    total_msgs_per_sec = vessels_in_footprint * msgs_per_sec_per_vessel
    offered_bps = total_msgs_per_sec * avg_msg_bits

    # Channel utilisation
    utilisation = offered_bps / max(total_raw_rate_kbps * 1000.0, 1)

    # Slotted Aloha throughput (for unslotted MAC like simple VDES uplink)
    # T = G * exp(-G) for slotted; or G * exp(-2G) unslotted
    G = utilisation
    throughput_efficiency_slotted = G * math.exp(-G) if G < 1.0 else 0.368 / G
    achievable_throughput_kbps = total_raw_rate_kbps * min(throughput_efficiency_slotted, 0.368)

    # Collision rate
    if G > 0:
        # Probability of collision in slot
        collision_rate_pct = (1.0 - throughput_efficiency_slotted / max(G, 0.001)) * 100.0
    else:
        collision_rate_pct = 0.0

    # Max vessels per satellite for spec compliance
    # Spec: collision rate < 10%, so G < 0.1 typically
    max_g_for_spec = 0.1
    max_traffic_bps = max_g_for_spec * total_raw_rate_kbps * 1000.0
    max_msgs_per_sec = max_traffic_bps / avg_msg_bits
    max_vessels_per_sat = int(max_msgs_per_sec / max(msgs_per_sec_per_vessel, 1e-6))

    return {
        "vessel_density_per_km2": density,
        "message_rate_per_vessel_per_hour": msg_per_hr,
        "freq_band": band,
        "modulation": modulation,
        "base_rate_kbps_per_channel": base_rate_kbps,
        "num_channels": num_channels,
        "total_raw_rate_kbps": total_raw_rate_kbps,
        "sat_altitude_km": sat_alt_km,
        "coverage_km2": round(coverage_km2, 0),
        "vessels_in_footprint": int(vessels_in_footprint),
        "offered_load_bps": round(offered_bps, 0),
        "channel_utilisation_G": round(G, 3),
        "throughput_efficiency": round(throughput_efficiency_slotted, 3),
        "data_throughput_kbps": round(achievable_throughput_kbps, 2),
        "collision_rate_pct": round(collision_rate_pct, 1),
        "max_vessels_per_satellite": max_vessels_per_sat,
        "contact_duration_minutes": round(contact_minutes, 1),
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
