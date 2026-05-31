#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/network_bandwidth.py

Edge AI uplink bandwidth budget calculator. Reads JSON from stdin,
writes JSON to stdout.

Input:
    {
      "inferences_per_sec": 100,
      "output_kbytes_per_inference": 1.0,
      "link_type": "4G",                # "4G"|"5G"|"wifi_6"|"gigabit_ethernet"|"lora"|"sub_ghz"
      "latency_budget_ms": 500,
      "redundancy_factor": 1.2          # protocol overhead / retries
    }

Output:
    {
      "required_bandwidth_mbps": 0.8,
      "available_bandwidth_mbps": 50,
      "link_feasibility": "OK",
      "monthly_data_gb": 25,
      "latency_typical_ms": 80,
      ...
    }

Link bandwidth & latency from 3GPP / IEEE / LoRa Alliance specs at
typical real-world (not peak) conditions.

References:
- 3GPP TS 36.211 (4G LTE), TS 38.211 (5G NR)
- IEEE 802.11ax (Wi-Fi 6)
- LoRaWAN Regional Parameters RP002-1.0.3
- ITU-R P.1546 (path loss)
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'network_bandwidth (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": '3GPP TS 36.211 / 38.211 (LTE/5G); IEEE 802.11ax (Wi-Fi 6); LoRa Alliance RP002 (LoRa)',
    "physics_basis": 'Required bandwidth = inferences/s × bytes/inference × 8 bits/byte × overhead. Compared against link physical bandwidth.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Link type → realistic uplink throughput (Mbps), typical latency (ms),
# monthly data cap (GB unmetered = -1), cost per GB.
# Values: typical real-world (3GPP RAN3 measurement studies).
LINK_SPECS = {
    "4G": {
        "uplink_mbps": 25.0,         # LTE typical UL throughput
        "latency_ms": 80,
        "monthly_cap_gb": 50.0,
        "cost_per_gb_usd": 8.0,
        "is_metered": True,
    },
    "5G": {
        "uplink_mbps": 200.0,        # 5G NR Sub-6 typical UL
        "latency_ms": 25,
        "monthly_cap_gb": 100.0,
        "cost_per_gb_usd": 10.0,
        "is_metered": True,
    },
    "wifi_6": {
        "uplink_mbps": 800.0,        # 802.11ax typical, 80MHz channel
        "latency_ms": 5,
        "monthly_cap_gb": -1.0,
        "cost_per_gb_usd": 0.0,
        "is_metered": False,
    },
    "wifi_5": {
        "uplink_mbps": 200.0,
        "latency_ms": 10,
        "monthly_cap_gb": -1.0,
        "cost_per_gb_usd": 0.0,
        "is_metered": False,
    },
    "gigabit_ethernet": {
        "uplink_mbps": 950.0,
        "latency_ms": 1,
        "monthly_cap_gb": -1.0,
        "cost_per_gb_usd": 0.0,
        "is_metered": False,
    },
    "lora": {
        "uplink_mbps": 0.05,         # LoRaWAN SF7, EU868, ~50 kbps
        "latency_ms": 1000,
        "monthly_cap_gb": -1.0,      # Duty-cycled, not GB-limited
        "cost_per_gb_usd": 0.0,
        "is_metered": False,
    },
    "sub_ghz": {
        "uplink_mbps": 0.5,          # 868/915 MHz proprietary
        "latency_ms": 200,
        "monthly_cap_gb": -1.0,
        "cost_per_gb_usd": 0.0,
        "is_metered": False,
    },
    "narrowband_iot": {
        "uplink_mbps": 0.06,         # NB-IoT typical UL
        "latency_ms": 1500,
        "monthly_cap_gb": -1.0,
        "cost_per_gb_usd": 1.0,
        "is_metered": True,
    },
    "lte_m": {
        "uplink_mbps": 1.0,          # Cat-M1 typical
        "latency_ms": 500,
        "monthly_cap_gb": 5.0,
        "cost_per_gb_usd": 3.0,
        "is_metered": True,
    },
}


def compute(payload: dict) -> dict:
    inferences_per_sec = float(payload.get("inferences_per_sec", 100.0))
    output_kbytes = float(payload.get("output_kbytes_per_inference", 1.0))
    link_type = str(payload.get("link_type", "4G"))
    latency_budget_ms = float(payload.get("latency_budget_ms", 500))
    redundancy = float(payload.get("redundancy_factor", 1.2))

    if link_type not in LINK_SPECS:
        link_type = "4G"
    link = LINK_SPECS[link_type]

    # Raw bandwidth requirement
    # bytes/s = inferences/s × kbytes/inf × 1000
    # bits/s = bytes/s × 8
    # Mbps = bits/s / 1e6
    bytes_per_sec = inferences_per_sec * output_kbytes * 1000.0
    bits_per_sec = bytes_per_sec * 8.0
    raw_mbps = bits_per_sec / 1e6
    required_mbps = raw_mbps * redundancy

    available_mbps = link["uplink_mbps"]
    utilisation_pct = (required_mbps / available_mbps) * 100.0 if available_mbps > 0 else float("inf")

    # Feasibility
    if utilisation_pct < 30.0:
        feasibility = "OK"
    elif utilisation_pct < 70.0:
        feasibility = "tight"
    elif utilisation_pct < 100.0:
        feasibility = "marginal"
    else:
        feasibility = "INFEASIBLE"

    # Latency check
    latency_ok = link["latency_ms"] <= latency_budget_ms

    # Monthly data
    seconds_per_month = 30.0 * 24.0 * 3600.0
    bytes_per_month = bytes_per_sec * redundancy * seconds_per_month
    gb_per_month = bytes_per_month / 1e9

    # Cost / cap
    if link["is_metered"]:
        monthly_cost_usd = gb_per_month * link["cost_per_gb_usd"]
        over_cap = (link["monthly_cap_gb"] > 0 and gb_per_month > link["monthly_cap_gb"])
    else:
        monthly_cost_usd = 0.0
        over_cap = False

    return {
        "inferences_per_sec": inferences_per_sec,
        "output_kbytes_per_inference": output_kbytes,
        "link_type": link_type,
        "raw_bandwidth_mbps": round(raw_mbps, 4),
        "required_bandwidth_mbps": round(required_mbps, 4),
        "available_bandwidth_mbps": available_mbps,
        "utilisation_pct": round(utilisation_pct, 2),
        "link_feasibility": feasibility,
        "monthly_data_gb": round(gb_per_month, 2),
        "monthly_cost_usd": round(monthly_cost_usd, 2),
        "over_data_cap": over_cap,
        "latency_typical_ms": link["latency_ms"],
        "latency_budget_ms": latency_budget_ms,
        "latency_feasible": latency_ok,
        "redundancy_factor": redundancy,
        "_meta": {
            "model": "Bandwidth = inf/s × output_size × redundancy; capacity from 3GPP / IEEE / LoRa typical real-world",
            "references": [
                "3GPP TS 36.211 / TS 38.211",
                "IEEE 802.11ax (Wi-Fi 6)",
                "LoRaWAN RP002-1.0.3",
            ],
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
