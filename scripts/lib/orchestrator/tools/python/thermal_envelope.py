#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/thermal_envelope.py

CPU/SoC thermal envelope analysis for edge AI / industrial enclosures.
Reads JSON from stdin, writes JSON to stdout.

Input:
    {
      "tdp_w": 15.0,
      "ambient_c": 25.0,
      "heatsink_type": "passive_finned", # "passive_finned"|"active_fan"|"liquid"|"none"
      "enclosure": "IP65_sealed",        # "IP65_sealed"|"open_chassis"|"din_rail"|"vented_box"
      "max_junction_c": 95.0             # SoC Tj_max (typical for ARM Cortex-A78AE)
    }

Output:
    {
      "junction_temp_c": 66.5,
      "case_temp_c": 50.0,
      "thermal_resistance_jc_total_k_w": 2.7,
      "throttle_risk": "safe",
      "required_airflow_cfm": 0.0,
      ...
    }

Physics: thermal resistance ladder
  T_j - T_ambient = TDP × (R_jc + R_cs + R_sa)
where
  R_jc = junction-to-case (silicon + TIM)
  R_cs = case-to-sink (heatsink interface)
  R_sa = sink-to-ambient (heatsink performance, convection-dependent)

For sealed enclosures, ambient inside enclosure rises above outside ambient.
We add an enclosure rise (5-25°C) based on sealing class.

References:
- NVIDIA Jetson Orin Nano thermal design guide (DA-09897-001)
- Texas Instruments AN-2020 thermal design
- Aavid Thermalloy heatsink catalogue
- Sergent & Krum "Thermal Management Handbook"
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'thermal_envelope (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'NVIDIA Jetson Thermal Design Guide; Aavid Thermal Solutions Heatsink Catalogue; TI Application Note AN-2020 (Thermal Calculations)',
    "physics_basis": 'Series thermal resistance ladder: T_j = T_amb + Q × (R_jc + R_cs + R_sa + R_enclosure). Enclosure rise via natural convection NTU.',
    "confidence_class": 'datasheet',
    "last_reviewed_date": "2026-05-22",
}


# Heatsink type → typical R_sa (K/W) + cost/complexity. Values from
# Aavid catalogue at natural / forced convection.
HEATSINK_SPECS = {
    "none": {
        "r_sa_natural_k_w": 12.0,    # bare chip on PCB
        "r_sa_forced_k_w": 8.0,
        "r_cs_k_w": 0.5,
        "needs_fan": False,
        "max_tdp_w": 3.0,            # passive limit before throttle
    },
    "passive_finned": {
        "r_sa_natural_k_w": 1.5,     # 100x100mm extruded fin, natural convection
        "r_sa_forced_k_w": 0.8,
        "r_cs_k_w": 0.3,
        "needs_fan": False,
        "max_tdp_w": 25.0,
    },
    "active_fan": {
        "r_sa_natural_k_w": 1.5,     # fan-off (failure mode)
        "r_sa_forced_k_w": 0.4,      # with fan running (typical 40mm fan)
        "r_cs_k_w": 0.3,
        "needs_fan": True,
        "max_tdp_w": 60.0,
    },
    "liquid": {
        "r_sa_natural_k_w": 0.5,
        "r_sa_forced_k_w": 0.15,     # cold plate + pump
        "r_cs_k_w": 0.2,
        "needs_fan": False,
        "max_tdp_w": 350.0,
    },
}

# Enclosure → ambient temperature rise inside enclosure (K above outside)
# at full TDP. Sources: NEMA / IEC 60529 + Schneider Electric enclosure
# thermal design notes.
ENCLOSURE_SPECS = {
    "open_chassis": {
        "ambient_rise_k": 0.0,
        "ventilation_factor": 1.0,
        "description": "Open frame; ambient = outside ambient",
    },
    "vented_box": {
        "ambient_rise_k": 5.0,
        "ventilation_factor": 0.8,
        "description": "IP30/40 with vent slots; minor stagnation",
    },
    "din_rail": {
        "ambient_rise_k": 10.0,
        "ventilation_factor": 0.7,
        "description": "DIN-rail panel-mount; restricted airflow",
    },
    "IP65_sealed": {
        "ambient_rise_k": 18.0,
        "ventilation_factor": 0.3,
        "description": "Sealed enclosure; heat conducted through case only",
    },
    "IP67_buried": {
        "ambient_rise_k": 25.0,
        "ventilation_factor": 0.1,
        "description": "Fully sealed harsh-environment; outside is heatsink",
    },
}

# R_jc (junction-to-case) typical for edge SoCs
DEFAULT_R_JC_K_W = 0.5


def compute(payload: dict) -> dict:
    tdp_w = float(payload.get("tdp_w", 15.0))
    ambient_c = float(payload.get("ambient_c", 25.0))
    heatsink_type = str(payload.get("heatsink_type", "passive_finned"))
    enclosure = str(payload.get("enclosure", "vented_box"))
    max_junction_c = float(payload.get("max_junction_c", 95.0))

    if heatsink_type not in HEATSINK_SPECS:
        heatsink_type = "passive_finned"
    if enclosure not in ENCLOSURE_SPECS:
        enclosure = "vented_box"

    hs = HEATSINK_SPECS[heatsink_type]
    enc = ENCLOSURE_SPECS[enclosure]

    # Enclosure internal ambient (TDP-scaled rise)
    # Linear scaling: at TDP=10W, rise as-quoted; at higher TDP, more rise.
    enclosure_rise_k = enc["ambient_rise_k"] * (tdp_w / 10.0) ** 0.6
    internal_ambient_c = ambient_c + enclosure_rise_k

    # Effective R_sa depending on whether fan/ventilation active
    if hs["needs_fan"]:
        # Assume fan is running
        r_sa = hs["r_sa_forced_k_w"]
    else:
        # Use natural convection scaled by enclosure ventilation factor
        # Sealed boxes have less natural convection
        r_sa = hs["r_sa_natural_k_w"] / max(0.1, enc["ventilation_factor"])

    r_cs = hs["r_cs_k_w"]
    r_jc = DEFAULT_R_JC_K_W

    r_total = r_jc + r_cs + r_sa
    temp_rise_k = tdp_w * r_total

    junction_temp_c = internal_ambient_c + temp_rise_k
    case_temp_c = internal_ambient_c + tdp_w * (r_cs + r_sa)
    sink_temp_c = internal_ambient_c + tdp_w * r_sa

    # Throttle risk: Tj should be < Tj_max - 10°C margin to avoid throttling
    if junction_temp_c < max_junction_c - 15.0:
        throttle_risk = "safe"
    elif junction_temp_c < max_junction_c - 5.0:
        throttle_risk = "marginal"
    elif junction_temp_c < max_junction_c:
        throttle_risk = "throttling"
    else:
        throttle_risk = "damage"

    # Required airflow if forced cooling needed
    # Rule of thumb: 0.1 CFM per W for fan-cooled electronics
    if heatsink_type == "active_fan":
        required_airflow_cfm = 0.15 * tdp_w
    elif heatsink_type == "liquid":
        required_airflow_cfm = 0.0  # liquid loop
    else:
        # Passive — recommend airflow if marginal
        required_airflow_cfm = 0.1 * tdp_w if throttle_risk != "safe" else 0.0

    # Junction margin (positive = headroom)
    junction_margin_c = max_junction_c - junction_temp_c

    # Cost / complexity ranking
    complexity_score = {"none": 1, "passive_finned": 2, "active_fan": 3, "liquid": 5}[heatsink_type]

    return {
        "tdp_w": tdp_w,
        "ambient_c_outside": ambient_c,
        "ambient_c_internal": round(internal_ambient_c, 2),
        "enclosure": enclosure,
        "enclosure_rise_k": round(enclosure_rise_k, 2),
        "heatsink_type": heatsink_type,
        "thermal_resistance_jc_k_w": r_jc,
        "thermal_resistance_cs_k_w": r_cs,
        "thermal_resistance_sa_k_w": round(r_sa, 3),
        "thermal_resistance_jc_total_k_w": round(r_total, 3),
        "junction_temp_c": round(junction_temp_c, 2),
        "case_temp_c": round(case_temp_c, 2),
        "sink_temp_c": round(sink_temp_c, 2),
        "max_junction_temp_c": max_junction_c,
        "junction_margin_c": round(junction_margin_c, 2),
        "throttle_risk": throttle_risk,
        "required_airflow_cfm": round(required_airflow_cfm, 2),
        "heatsink_complexity_score": complexity_score,
        "feasibility": "OK" if throttle_risk in ("safe", "marginal") else "NEEDS_UPGRADE",
        "_meta": {
            "model": "Series thermal resistance (R_jc + R_cs + R_sa) + enclosure ambient rise",
            "references": [
                "NVIDIA Jetson Orin Thermal Design Guide DA-09897-001",
                "TI AN-2020 thermal design",
                "Aavid Thermalloy heatsink catalogue",
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
