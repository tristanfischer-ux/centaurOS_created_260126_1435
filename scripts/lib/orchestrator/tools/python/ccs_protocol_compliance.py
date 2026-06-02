#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ccs_protocol_compliance.py

CCS Combo (1/2) / ISO 15118 / CHAdeMO / NACS protocol compliance
lookup for DC fast charger designs. Reads JSON from stdin, writes
JSON to stdout.

Input:
    {
      "max_voltage_v": 1000.0,
      "max_current_a": 500.0,
      "protocol_version": "ISO_15118_20",  # "ISO_15118_2"|"ISO_15118_20"|"DIN_70121"|"CHAdeMO_2_0"
      "plug_type": "CCS2"                    # "CCS2"|"CCS1"|"CHAdeMO"|"NACS"|"GB_T"
    }

Output:
    {
      "compliance_pass": true,
      "max_power_supported_kw": 500,
      "V2G_capable": true,
      "plug_rating_v": 1000,
      "plug_rating_a": 500,
      "PnC_supported": true,
      ...
    }

Standard limits (from ISO 15118, IEC 61851-23, CHAdeMO Association,
Tesla NACS specification):

Plug envelope (V_max × I_max × power_max):
- CCS2 (Type 2 + DC):       1000 V × 500 A → 500 kW (1500V variants for MCS)
- CCS1 (J1772 + DC):        1000 V × 500 A → 500 kW
- CHAdeMO 2.0:               1000 V × 400 A → 400 kW (HiCS variant)
- CHAdeMO 3.0 / ChaoJi:      1500 V × 600 A → 900 kW
- NACS (Tesla, J3400):       1000 V × 500 A → 500 kW (cont.); 900 kW pulse
- GB/T 20234.3 (China):      1000 V × 250 A → 250 kW
- MCS (Megawatt Charging):   1250 V × 3000 A → 3.75 MW (heavy truck)

Protocol capability:
- DIN 70121 (legacy): no V2G, no Plug-and-Charge, basic DC negotiation
- ISO 15118-2 (current): Plug-and-Charge, basic ISO V2G (rarely supported)
- ISO 15118-20 (next gen): full V2G, bidirectional, wireless inductive,
  Combined Charging System Plus

References:
- ISO 15118-2:2014, ISO 15118-20:2022
- IEC 61851-23:2014/2023
- CHAdeMO Association IFC v2.0 (2018), v3.0 (2020)
- SAE J3400 (NACS) 2024
- GB/T 20234.3-2015
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'ccs_protocol_compliance (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ISO 15118-2:2014 + ISO 15118-20:2022; IEC 61851-23:2014; CHAdeMO Protocol IFC; SAE J3400 (NACS)',
    "physics_basis": 'Protocol lookup table by (CCS connector, ISO version) → V/I rating, V2G/PnC/TLS feature support.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Plug envelope: (V_max, I_max, kW_max_continuous)
PLUG_SPECS = {
    "CCS2": {
        "v_max": 1000.0,
        "i_max_a": 500.0,
        "kw_max": 500.0,
        "iec_standard": "IEC 62196-3 type 2 + DC",
        "regions": "EU, UK, AU, NZ",
    },
    "CCS1": {
        "v_max": 1000.0,
        "i_max_a": 500.0,
        "kw_max": 500.0,
        "iec_standard": "SAE J1772 + DC",
        "regions": "US, KR",
    },
    "CHAdeMO": {
        "v_max": 1000.0,
        "i_max_a": 400.0,
        "kw_max": 400.0,
        "iec_standard": "IEEE 2030.1.1 / JEVS G105",
        "regions": "JP, EU legacy",
    },
    "CHAdeMO_3": {  # ChaoJi
        "v_max": 1500.0,
        "i_max_a": 600.0,
        "kw_max": 900.0,
        "iec_standard": "IEEE 2030.1.1 / GB/T 20234 next-gen",
        "regions": "JP, CN",
    },
    "NACS": {
        "v_max": 1000.0,
        "i_max_a": 500.0,
        "kw_max": 500.0,
        "iec_standard": "SAE J3400 (2024)",
        "regions": "NA (broad adoption 2025+)",
    },
    "GB_T": {
        "v_max": 1000.0,
        "i_max_a": 250.0,
        "kw_max": 250.0,
        "iec_standard": "GB/T 20234.3-2015",
        "regions": "CN",
    },
    "MCS": {
        "v_max": 1250.0,
        "i_max_a": 3000.0,
        "kw_max": 3750.0,
        "iec_standard": "IEC 61851-23-3 (CharIN MCS)",
        "regions": "heavy-truck global",
    },
}

# Protocol → (V2G, PnC, bidirectional, certificate authentication)
PROTOCOL_SPECS = {
    "DIN_70121": {
        "v2g": False,
        "pnc": False,
        "bidirectional": False,
        "tls_certificate_auth": False,
        "max_charging_power_kw_protocol": 200.0,
        "supported_plugs": ["CCS1", "CCS2"],
        "description": "Legacy DIN spec; basic DC charging only",
    },
    "ISO_15118_2": {
        "v2g": True,            # nominally supported but rarely deployed
        "pnc": True,            # Plug-and-Charge with TLS certificates
        "bidirectional": False, # uni-directional in practice
        "tls_certificate_auth": True,
        "max_charging_power_kw_protocol": 500.0,
        "supported_plugs": ["CCS1", "CCS2", "NACS"],
        "description": "ISO 15118-2:2014; PnC, basic ISO V2G",
    },
    "ISO_15118_20": {
        "v2g": True,
        "pnc": True,
        "bidirectional": True,
        "tls_certificate_auth": True,
        "max_charging_power_kw_protocol": 3750.0,
        "supported_plugs": ["CCS1", "CCS2", "NACS", "MCS"],
        "description": "ISO 15118-20:2022; full V2G, bidirectional, ACDP wireless",
    },
    "CHAdeMO_2_0": {
        "v2g": True,
        "pnc": False,
        "bidirectional": True,  # CHAdeMO has had V2G since 2014
        "tls_certificate_auth": False,
        "max_charging_power_kw_protocol": 400.0,
        "supported_plugs": ["CHAdeMO"],
        "description": "CHAdeMO 2.0 (2018); V2G native",
    },
    "CHAdeMO_3_0": {
        "v2g": True,
        "pnc": True,
        "bidirectional": True,
        "tls_certificate_auth": True,
        "max_charging_power_kw_protocol": 900.0,
        "supported_plugs": ["CHAdeMO_3"],
        "description": "ChaoJi (CHAdeMO 3.0); harmonised with GB/T",
    },
}


def compute(payload: dict) -> dict:
    max_voltage_v = float(payload.get("max_voltage_v", 1000.0))
    max_current_a = float(payload.get("max_current_a", 500.0))
    protocol_version = str(payload.get("protocol_version", "ISO_15118_20"))
    plug_type = str(payload.get("plug_type", "CCS2"))

    if plug_type not in PLUG_SPECS:
        plug_type = "CCS2"
    if protocol_version not in PROTOCOL_SPECS:
        protocol_version = "ISO_15118_20"

    plug = PLUG_SPECS[plug_type]
    proto = PROTOCOL_SPECS[protocol_version]

    # Check voltage/current within plug ratings
    voltage_ok = max_voltage_v <= plug["v_max"]
    current_ok = max_current_a <= plug["i_max_a"]

    # Check protocol supports this plug
    plug_supported_by_protocol = plug_type in proto["supported_plugs"]

    # Max power achievable = limited by min(plug rating, protocol max, V × I)
    requested_kw = (max_voltage_v * max_current_a) / 1000.0
    max_power_supported_kw = min(
        plug["kw_max"],
        proto["max_charging_power_kw_protocol"],
        requested_kw,
    )

    compliance_pass = voltage_ok and current_ok and plug_supported_by_protocol

    issues = []
    if not voltage_ok:
        issues.append(f"Voltage {max_voltage_v}V exceeds plug rating {plug['v_max']}V")
    if not current_ok:
        issues.append(f"Current {max_current_a}A exceeds plug rating {plug['i_max_a']}A")
    if not plug_supported_by_protocol:
        issues.append(f"Plug '{plug_type}' not supported by protocol '{protocol_version}'")

    # Worked calculation — only requested_kw is a simple hand-checkable formula.
    # max_power_supported_kw = min(plug_kw, protocol_kw, requested_kw) is a clamp — skip.
    requested_kw_r = round(requested_kw, 2)
    worked = [
        worked_calc(
            label="Requested DC charging power",
            formula="requested_kw = (max_voltage_v x max_current_a) / 1000",
            values={
                "max_voltage_v": (max_voltage_v, "V"),
                "max_current_a": (max_current_a, "A"),
            },
            result=requested_kw_r, result_unit="kW",
            assumptions=["DC power = V x I; divide by 1000 to convert W to kW"],
        ),
    ]

    return {
        "compliance_pass": compliance_pass,
        "plug_type": plug_type,
        "plug_rating_v": plug["v_max"],
        "plug_rating_a": plug["i_max_a"],
        "plug_rating_kw": plug["kw_max"],
        "plug_iec_standard": plug["iec_standard"],
        "plug_regions": plug["regions"],
        "protocol_version": protocol_version,
        "protocol_description": proto["description"],
        "requested_voltage_v": max_voltage_v,
        "requested_current_a": max_current_a,
        "requested_kw": requested_kw_r,
        "max_power_supported_kw": round(max_power_supported_kw, 2),
        "V2G_capable": proto["v2g"],
        "PnC_supported": proto["pnc"],
        "bidirectional_supported": proto["bidirectional"],
        "tls_certificate_auth": proto["tls_certificate_auth"],
        "issues": issues,
        "worked": worked,
        "_meta": {
            "model": "ISO 15118-2/-20 + IEC 61851-23 + CHAdeMO Association lookup",
            "references": [
                "ISO 15118-2:2014, ISO 15118-20:2022",
                "IEC 61851-23",
                "CHAdeMO Association IFC v2/v3",
                "SAE J3400 (NACS) 2024",
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
