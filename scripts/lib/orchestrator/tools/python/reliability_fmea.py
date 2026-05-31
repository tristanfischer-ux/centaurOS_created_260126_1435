#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reliability_fmea.py

Reliability + warranty cost from component-level FMEA.

System MTBF computed by serial reliability formula:
    1/MTBF_sys = Sum(n_i / MTBF_i)
    where n_i = number of instances of component i.

Industry MTBF tables (component-level, 25°C operating):
- Electrolytic capacitor: ~100,000 hrs (MIL-HDBK-217F)
- Ceramic capacitor: ~500,000 hrs
- Film capacitor: ~300,000 hrs
- Resistor (carbon film): ~1,000,000 hrs
- Inductor / transformer: ~250,000 hrs
- Connector (10A typical): ~500,000 hrs
- Relay (electromechanical): ~1,000,000 cycles (~30,000 hrs operational)
- Fan (axial, ball bearing): ~50,000 hrs
- Fan (sleeve bearing): ~30,000 hrs
- Battery (Li-ion, 80% DoD, daily cycle): 5-10 years cell-level
- Pump (positive displacement): ~80,000 hrs
- Motor (BLDC, automotive grade): ~100,000 hrs
- IGBT module: ~150,000 hrs
- MOSFET (Si): ~500,000 hrs
- SiC MOSFET: ~200,000 hrs (newer, less data)
- Sensor (Hall): ~500,000 hrs
- Sensor (NTC thermistor): ~1,000,000 hrs
- Microcontroller / SoC: ~1,000,000 hrs
- LED (high-power): ~50,000 hrs
- Display (LCD): ~30,000 hrs
- HDD: ~30,000 hrs
- SSD: ~100,000 hrs
- PCB (FR4): ~5,000,000 hrs

References:
- MIL-HDBK-217F Notice 2 (1995)
- Telcordia SR-332 Issue 4 (2016)
- IEC 61709:2017 stress factors
- Reliability Engineering handbook (Birolini, 2013)

Warranty cost = expected failure rate during warranty × cost per claim.
Cost per claim = labour + parts.

Input:
    {
      "components": [
        {"category": "electrolytic_capacitor", "count": 12, "mtbf_hours": 100000,
         "failure_severity": "minor"},
        ...
      ],
      "warranty_years": 5,
      "service_call_cost_gbp": 200,
      "replacement_cost_pct_of_unit": 5
    }

Output:
    {
      "system_mtbf_hours": ...,
      "expected_warranty_claims_per_unit": ...,
      "warranty_cost_per_unit_gbp": ...,
      "top_failure_modes": [...],
      "recommended_redundancy": [...]
    }
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'reliability_fmea (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'MIL-HDBK-217F (Reliability Prediction); IEC 61709 (Reliability Prediction); IEC 60812 (Failure modes and effects analysis)',
    "physics_basis": 'System MTBF = 1 / Σ (λ_i × duty_i). Component failure rates from MIL-HDBK-217F or IEC 61709 part-stress models.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Default MTBF tables when not provided per-component (hours)
DEFAULT_MTBF: dict[str, float] = {
    "electrolytic_capacitor": 100_000,
    "ceramic_capacitor": 500_000,
    "film_capacitor": 300_000,
    "resistor": 1_000_000,
    "inductor": 250_000,
    "transformer": 250_000,
    "connector": 500_000,
    "relay": 30_000,
    "fan_ball": 50_000,
    "fan_sleeve": 30_000,
    "battery_li_ion": 30_000,                 # ~7-8 years 80% DoD daily
    "pump": 80_000,
    "motor_bldc": 100_000,
    "motor_induction": 60_000,
    "igbt": 150_000,
    "mosfet_si": 500_000,
    "mosfet_sic": 200_000,
    "sensor_hall": 500_000,
    "sensor_thermistor": 1_000_000,
    "sensor_pressure": 200_000,
    "sensor_imu": 250_000,
    "mcu": 1_000_000,
    "soc": 800_000,
    "led": 50_000,
    "display_lcd": 30_000,
    "display_oled": 25_000,
    "hdd": 30_000,
    "ssd": 100_000,
    "pcb": 5_000_000,
    "valve_solenoid": 100_000,
    "valve_motorised": 75_000,
    "compressor_scroll": 80_000,
    "compressor_reciprocating": 50_000,
    "heat_exchanger": 500_000,
    "filter": 8_000,                          # consumable
    "membrane_ro": 25_000,
    "cable_harness": 1_000_000,
    "antenna": 500_000,
    "modem": 250_000,
    "power_supply": 150_000,
    "ups_module": 200_000,
}

SEVERITY_WARRANTY_COST_FACTOR: dict[str, float] = {
    "critical": 1.5,         # Field replacement, often includes loaner
    "major": 1.0,            # Standard depot return + service call
    "minor": 0.5,            # Customer-replaceable or quick visit
    "cosmetic": 0.1,         # Tier-1 phone support only
}


def compute(payload: dict) -> dict:
    components = payload.get("components", [])
    warranty_yrs = float(payload.get("warranty_years", 1.0))
    service_cost = float(payload.get("service_call_cost_gbp", 150.0))
    repl_pct = float(payload.get("replacement_cost_pct_of_unit", 5.0))
    unit_cost = float(payload.get("unit_cost_gbp", 1000.0))

    if not components:
        return {"error": "components list is empty"}

    warranty_hours = warranty_yrs * 8760.0

    # Serial system MTBF: 1/MTBF_sys = sum(n_i / MTBF_i)
    sum_failure_rate = 0.0
    component_breakdown: list[dict] = []
    for c in components:
        category = str(c.get("category", "?")).lower().strip()
        count = float(c.get("count", 1))
        # MTBF: use given, else look up default, else use 100k as conservative
        mtbf = c.get("mtbf_hours")
        if mtbf is None:
            mtbf = DEFAULT_MTBF.get(category, 100_000)
        mtbf = float(mtbf)
        severity = str(c.get("failure_severity", "major")).lower().strip()

        # Failure rate (failures per hour) for this category
        if mtbf <= 0:
            continue
        failure_rate = count / mtbf
        sum_failure_rate += failure_rate

        # Probability of failure in warranty period (exponential)
        # P(fail in t) = 1 - exp(-lambda * t)
        warranty_prob = 1.0 - math.exp(-failure_rate * warranty_hours)
        # Expected claims = sum of probability per component instance
        expected_claims_this_cat = count * (1.0 - math.exp(-(1.0 / mtbf) * warranty_hours))
        # Cost per warranty claim
        cost_per_claim = service_cost + (unit_cost * repl_pct / 100.0)
        cost_per_claim *= SEVERITY_WARRANTY_COST_FACTOR.get(severity, 1.0)

        warranty_cost_cat = expected_claims_this_cat * cost_per_claim

        component_breakdown.append({
            "category": category,
            "count": count,
            "mtbf_hours_per_unit": int(mtbf),
            "severity": severity,
            "expected_claims_per_unit": round(expected_claims_this_cat, 3),
            "warranty_cost_gbp": round(warranty_cost_cat, 1),
            "failure_rate_per_million_hours": round(failure_rate * 1e6, 2),
        })

    if sum_failure_rate <= 0:
        return {"error": "all components have zero or invalid MTBF"}

    system_mtbf_hours = 1.0 / sum_failure_rate
    # Expected warranty claims per unit shipped (sum over all categories)
    expected_warranty_claims = 1.0 - math.exp(-sum_failure_rate * warranty_hours)
    # Total warranty cost per unit
    total_warranty_cost = sum(c["warranty_cost_gbp"] for c in component_breakdown)

    # Sort top failure modes (highest expected claims)
    component_breakdown.sort(key=lambda x: -x["expected_claims_per_unit"])
    top_modes = component_breakdown[:5]

    # Recommended redundancy: any category contributing > 30% of failure rate is critical
    recommended_redundancy: list[str] = []
    for c in component_breakdown:
        contrib_pct = (c["failure_rate_per_million_hours"] * 1e-6) / sum_failure_rate * 100.0
        if contrib_pct > 30 and c["severity"] in ("critical", "major"):
            recommended_redundancy.append(
                f"{c['category']} (contributes {contrib_pct:.0f}% of system failures) - add N+1"
            )
    if not recommended_redundancy:
        recommended_redundancy.append("No single component dominates failures - redundancy not required.")

    return {
        "system_mtbf_hours": int(system_mtbf_hours),
        "system_mtbf_years": round(system_mtbf_hours / 8760.0, 2),
        "expected_warranty_claims_per_unit": round(expected_warranty_claims, 3),
        "warranty_cost_per_unit_gbp": round(total_warranty_cost, 1),
        "warranty_cost_pct_of_unit": round(total_warranty_cost / max(1.0, unit_cost) * 100.0, 2),
        "warranty_years": warranty_yrs,
        "warranty_hours": warranty_hours,
        "top_failure_modes": top_modes,
        "recommended_redundancy": recommended_redundancy,
        "component_breakdown_count": len(component_breakdown),
        "notes": (
            "Failure rates per MIL-HDBK-217F Notice 2 / Telcordia SR-332. "
            "Assumes exponential failure distribution (constant rate). "
            "Severity multiplier: critical 1.5x, major 1.0x, minor 0.5x. "
            "For wear-out components (fans, batteries), MTBF is end-of-useful-life."
        ),
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
