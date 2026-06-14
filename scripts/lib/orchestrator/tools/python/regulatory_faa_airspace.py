#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/regulatory_faa_airspace.py

FAA Class A airspace + NOTAM lead time + ATC coordination for HAPS / UAS.

Airspace classes (US):
- Class A: 18,000 ft to FL600 (60,000 ft). IFR only; ATC clearance required.
- Class B: airport terminal area, surface to 10,000 ft
- Class C: smaller terminal, surface to 4,000 ft
- Class D: smaller airport, surface to 2,500 ft
- Class E: controlled, generally 700-1,200 ft AGL to FL180
- Class G: uncontrolled, surface to ~14,000 ft

For HAPS at 60-90,000 ft:
- Above FL600 = "above" Class A; technically uncontrolled but FAA Order 7400.2
  governs UAS operations there
- COA (Certificate of Waiver or Authorization) required for civil ops
- DoD operations under MOA (Memorandum of Agreement)

NOTAM lead times:
- Standard: 24-72 hours
- High-altitude UAS: 30 days advance for permanent corridors
- Daily operations: 24-hour rolling

ATC coordination per AIM 5-1-15:
- Continuous comm with ARTCC required above FL180
- Transponder mandatory (ADS-B Out below FL180, optional above)

UK CAA equivalent:
- Class A airspace = upper airways (above FL245)
- BVLOS operational authorisation via specific category
- ANO 2016 Article 94: large UAS above 7kg requires CAA permission

References:
- FAA Order JO 7400.2N (Procedures for Handling Airspace Matters)
- FAR Part 91.215 (transponder requirements)
- FAR Part 107 (small UAS)
- FAA AC 91-57B (model aircraft)
- CAA UK CAP 722 (Unmanned Aircraft System Operations in UK Airspace)
"""
from __future__ import annotations

import json
import sys
import time
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'regulatory_faa_airspace (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": '14 CFR Part 91 (General Operating); FAA Order 7400.11G (Airspace Designations); ICAO Annex 11 (Air Traffic Services)',
    "physics_basis": 'Airspace classification lookup by altitude + lat/lon. NOTAM filing requirements per Class A (>18 kft MSL).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Country-specific UAS rules
COUNTRY_RULES: dict[str, dict] = {
    "US": {
        "class_a_min_ft": 18000,
        "class_a_max_ft": 60000,
        "uas_authority": "FAA",
        "operating_permit_form": "COA (Certificate of Waiver or Authorization)",
        "lead_time_days": 60,
        "annual_renewal_required": True,
        "operating_cost_gbp": 50000,
        "notam_lead_days": 7,
        "atc_coordination_required": True,
        "transponder_required_above_18kft": True,
    },
    "UK": {
        "class_a_min_ft": 24500,    # FL245
        "class_a_max_ft": 66000,    # FL660
        "uas_authority": "CAA",
        "operating_permit_form": "Specific Category Operational Authorisation",
        "lead_time_days": 90,
        "annual_renewal_required": True,
        "operating_cost_gbp": 25000,
        "notam_lead_days": 10,
        "atc_coordination_required": True,
        "transponder_required_above_18kft": True,
    },
    "EU": {
        "class_a_min_ft": 19500,    # FL195
        "class_a_max_ft": 66000,    # FL660
        "uas_authority": "EASA",
        "operating_permit_form": "Specific Category Operational Authorisation",
        "lead_time_days": 90,
        "annual_renewal_required": True,
        "operating_cost_gbp": 30000,
        "notam_lead_days": 10,
        "atc_coordination_required": True,
        "transponder_required_above_18kft": True,
    },
    "JP": {
        "class_a_min_ft": 24000,
        "class_a_max_ft": 60000,
        "uas_authority": "JCAB",
        "operating_permit_form": "Level 3/4 UAS Permission",
        "lead_time_days": 120,
        "annual_renewal_required": True,
        "operating_cost_gbp": 35000,
        "notam_lead_days": 14,
        "atc_coordination_required": True,
        "transponder_required_above_18kft": True,
    },
    "AU": {
        "class_a_min_ft": 18000,
        "class_a_max_ft": 60000,
        "uas_authority": "CASA",
        "operating_permit_form": "ReOC + Area Approval",
        "lead_time_days": 60,
        "annual_renewal_required": True,
        "operating_cost_gbp": 20000,
        "notam_lead_days": 7,
        "atc_coordination_required": True,
        "transponder_required_above_18kft": True,
    },
    "CN": {
        "class_a_min_ft": 19500,
        "class_a_max_ft": 60000,
        "uas_authority": "CAAC",
        "operating_permit_form": "ATC Civil Aviation Authority Permit",
        "lead_time_days": 180,
        "annual_renewal_required": True,
        "operating_cost_gbp": 45000,
        "notam_lead_days": 21,
        "atc_coordination_required": True,
        "transponder_required_above_18kft": True,
    },
}


def compute(payload: dict) -> dict:
    country = safe_choice(str(payload.get("country", "US")).upper(), COUNTRY_RULES, default="US", label="country")
    altitude_ceiling_ft = float(payload.get("altitude_ceiling_ft", 65000))
    mission_duration_hours = float(payload.get("mission_duration_hours", 24))
    area_polygon_km2 = float(payload.get("area_polygon_km2", 1000))

    if country not in COUNTRY_RULES:
        return {"error": f"Unknown country '{country}'. Available: {list(COUNTRY_RULES.keys())}"}

    rules = COUNTRY_RULES[country]

    # Determine airspace classes traversed
    classes_traversed: list[str] = []
    if altitude_ceiling_ft <= 700:
        classes_traversed.append("Class G (uncontrolled)")
    if altitude_ceiling_ft > 0:
        classes_traversed.append("Class E (controlled below FL180)")
    if altitude_ceiling_ft >= rules["class_a_min_ft"]:
        classes_traversed.append("Class A (controlled FL180+)")
    if altitude_ceiling_ft >= rules["class_a_max_ft"]:
        classes_traversed.append("Above-Class-A (≥FL600)")

    # Permits required (any UAS over 25 kg or operating above Class G requires permit)
    operating_permit_required = altitude_ceiling_ft > 400  # >400ft AGL needs permit
    # NOTAM lead time
    notam_lead_days = rules["notam_lead_days"]
    if mission_duration_hours > 24:
        notam_lead_days = max(notam_lead_days, 14)   # extended ops

    # Permit lead time
    permit_lead_days = rules["lead_time_days"]
    if area_polygon_km2 > 10000:
        permit_lead_days = max(permit_lead_days, 180)   # large area

    # ATC coordination requirement
    atc_required = altitude_ceiling_ft > 18000 or rules["atc_coordination_required"]
    transponder_required = altitude_ceiling_ft > 18000

    # Cost
    base_cost_gbp = rules["operating_cost_gbp"]
    if area_polygon_km2 > 10000:
        base_cost_gbp *= 1.5   # large area uplift

    # Additional requirements
    additional_reqs: list[str] = []
    if altitude_ceiling_ft > rules["class_a_max_ft"]:
        additional_reqs.append("Above Class A: ITU + ICAO coordination required")
    if mission_duration_hours > 24 * 7:
        additional_reqs.append("Long-duration (>1 week): persistent NOTAM with daily renewal")
    if area_polygon_km2 > 50000:
        additional_reqs.append("National-scale ops: multiple ARTCC coordination")
    if altitude_ceiling_ft > 60000:
        additional_reqs.append("Stratospheric: FAA Special Federal Aviation Regulations may apply")

    if transponder_required:
        additional_reqs.append("ADS-B Out + Mode S transponder mandatory")

    return {
        "country": country,
        "uas_authority": rules["uas_authority"],
        "altitude_ceiling_ft": altitude_ceiling_ft,
        "mission_duration_hours": mission_duration_hours,
        "area_polygon_km2": area_polygon_km2,
        "classes_traversed": classes_traversed,
        "operating_permit_required": operating_permit_required,
        "operating_permit_form": rules["operating_permit_form"] if operating_permit_required else "None",
        "notam_lead_time_days": notam_lead_days,
        "permit_lead_time_days": permit_lead_days,
        "atc_coordination_required": atc_required,
        "transponder_required": transponder_required,
        "estimated_cost_gbp": round(base_cost_gbp),
        "annual_renewal_required": rules["annual_renewal_required"],
        "additional_requirements": additional_reqs,
        "class_a_min_ft": rules["class_a_min_ft"],
        "class_a_max_ft": rules["class_a_max_ft"],
        "notes": (
            f"Permit required for any UAS ops above 400 ft AGL in most jurisdictions. "
            f"NOTAM filed via {rules['uas_authority']}; coordinate with local ARTCC/ACC. "
            f"For HAPS above Class A: file under SFAR or equivalent above-FL600 procedures. "
            f"Costs exclude flight test, insurance, and recurring NOTAM fees."
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
