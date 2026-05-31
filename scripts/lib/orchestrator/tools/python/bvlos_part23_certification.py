#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/bvlos_part23_certification.py

FAA Part 23 / EASA SC-VTOL certification pathway sizing for eVTOL.

Input:
    {
      "design_mass_kg": 2500.0,
      "num_passengers": 4,
      "autonomy_level": "piloted",  // piloted | augmented | autonomous
      "operations": "commercial",   // private | commercial
      "region": "FAA"               // FAA | EASA | both
    }

Output:
    {
      "certification_basis": "Part 23 + SC-VTOL or SFAR-88",
      "cost_estimate_gbp": ...,
      "timeline_years": ...,
      "design_assurance_level": "DAL-A|B|C",
      ...
    }

Reference:
- FAA Order 8110.4C "Type Certification."
- EASA Special Condition SC-VTOL-01 (2019).
- FAA Special Federal Aviation Regulation SFAR-88 / Part 21.17(b).
- Joby Aviation SEC filings (S-1 2022) — Part 23 + SC-VTOL pathway.
- Vertical Aerospace SEC filings — EASA SC-VTOL pathway, £80-150M estimate.
"""
from __future__ import annotations

import json
import sys
import time

PROVENANCE = {
    "tool_name": "bvlos_part23_certification (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "FAA Order 8110.4C; EASA SC-VTOL-01; Joby S-1 (2022); Vertical Aerospace S-1 (2021)",
    "physics_basis": "Industry-typical certification cost + timeline curves from public Part 23 / SC-VTOL filings.",
    "confidence_class": "industry_typical",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    mass = float(payload.get("design_mass_kg", 2500.0))
    pax = int(payload.get("num_passengers", 4))
    autonomy = str(payload.get("autonomy_level", "piloted")).lower()
    operations = str(payload.get("operations", "commercial")).lower()
    region = str(payload.get("region", "FAA")).upper()

    # Certification basis selection (mass + pax + region)
    if region == "EASA":
        if mass <= 5670 and pax <= 9:
            cert_basis = "EASA SC-VTOL-01 (Enhanced Category)" if pax >= 2 else "EASA SC-VTOL-01 (Basic Category)"
        else:
            cert_basis = "EASA CS-25 + SC-VTOL supplement"
    elif region == "BOTH":
        cert_basis = "FAA Part 23 + EASA SC-VTOL parallel"
    else:  # FAA default
        if mass <= 8618 and pax <= 9:  # 19,000 lb / 9 pax cap
            cert_basis = "FAA Part 23 Amendment 64 + Special Conditions for VTOL"
        else:
            cert_basis = "FAA Part 25 transport + Special Conditions"

    # Cost estimate scaling (£M baseline + linear with complexity)
    # Joby (multi-rotor, piloted, Part 23): £80M
    # Vertical (lift+cruise, piloted, SC-VTOL): £100M
    # Archer (vectored thrust, piloted): £80M
    # Lilium (jet, SC-VTOL Enhanced): £150M+
    base_cost_gbp_m = 60.0  # baseline: Part 23 piloted VTOL
    if "SC-VTOL" in cert_basis and "Enhanced" in cert_basis:
        base_cost_gbp_m = 120.0  # CAT.5 Enhanced category higher
    if "CS-25" in cert_basis or "Part 25" in cert_basis:
        base_cost_gbp_m = 200.0  # transport cat much higher

    # Autonomy uplift
    autonomy_multiplier = 1.0
    if autonomy == "augmented":
        autonomy_multiplier = 1.25
    elif autonomy == "autonomous":
        autonomy_multiplier = 1.6

    # Commercial vs private
    if operations == "private":
        ops_multiplier = 0.7
    else:
        ops_multiplier = 1.0

    # Parallel FAA+EASA dual track
    region_multiplier = 1.65 if region == "BOTH" else 1.0

    # Mass scaling (heavier = more analysis + tests)
    mass_factor = 1.0 + 0.3 * max(0.0, (mass - 2500.0) / 5000.0)

    total_cost_gbp = base_cost_gbp_m * autonomy_multiplier * ops_multiplier * region_multiplier * mass_factor * 1_000_000.0

    # Timeline years (industry typical)
    base_timeline = 5.0  # Part 23 piloted VTOL baseline
    if autonomy != "piloted":
        base_timeline += 2.0  # automation flight-test maturity
    if region == "BOTH":
        base_timeline += 1.0
    if "Part 25" in cert_basis:
        base_timeline += 3.0

    # Design Assurance Level (DAL): pax + autonomy determines
    if pax >= 4 and autonomy != "piloted":
        dal = "DAL-A"
    elif pax >= 2:
        dal = "DAL-B"
    else:
        dal = "DAL-C"

    # Required flight test hours
    if pax >= 4:
        flight_test_hours = 5000
    elif pax >= 2:
        flight_test_hours = 3000
    else:
        flight_test_hours = 1500

    return {
        "certification_basis": cert_basis,
        "cost_estimate_gbp": round(total_cost_gbp, 0),
        "cost_estimate_gbp_m": round(total_cost_gbp / 1_000_000.0, 1),
        "timeline_years": round(base_timeline, 1),
        "design_assurance_level": dal,
        "flight_test_hours_required": flight_test_hours,
        "design_mass_kg": mass,
        "num_passengers": pax,
        "autonomy_level": autonomy,
        "operations": operations,
        "region": region,
        "milestones": [
            "G-1 Issues Paper (FAA) / Type Cert Application (EASA)",
            "Type Inspection Authorization (TIA)",
            "First flight",
            "Flight test program",
            "Type Certificate (TC)",
            "Production Certificate (PC)",
        ],
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
