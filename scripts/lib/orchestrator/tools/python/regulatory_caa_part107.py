#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/regulatory_caa_part107.py

UK CAA + FAA Part 107 + EASA drone certification lookup.

Drone categories by mass (UK/EU 2024):
- Open A1: <250g (toy/sub-toy)
- Open A2: 250g-2kg (commercial, near people)
- Open A3: 2kg-25kg (commercial, far from people)
- Specific: 25kg+ OR BVLOS OR over crowds (any mass)
- Certified: passenger or freight; full type-cert

US (FAA Part 107):
- Standard: <250g, recreational
- Part 107: <25kg commercial, VLOS, day, <400 ft AGL
- Part 91 + COA: BVLOS, >25kg, etc.

Operating limits per category (UK CAA CAP 722):
- A1: 50m horiz from uninvolved persons
- A2: 30m horiz, 5m if low-speed mode
- A3: 150m from residential/commercial/industrial areas
- Specific (BVLOS): individual operational authorisation

Training requirements:
- A2 CofC: 2-day course + theory exam, £350-500
- GVC (General VLOS Certificate): 5-day course, ~£600-1000
- BVLOS specific OA: extensive ops manual + risk assessment

Insurance:
- Public liability: £1M minimum (UK ANO 16(2))
- Commercial: £5M typical industry standard

References:
- ANO 2016 (UK Air Navigation Order)
- CAP 722 (UK Unmanned Aircraft System Operations in UK Airspace)
- CAP 1789 (UK Specific Category Operational Authorisation)
- EU 2019/945 + EU 2019/947 (EU drone regulations)
- 14 CFR Part 107 (US FAA Part 107)
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'regulatory_caa_part107 (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'UK CAA CAP 722 (UAS Operations in UK Airspace); 14 CFR Part 107 (USA Small UAS); EASA Implementing Regulation 2019/947; CASA Part 101 MOS',
    "physics_basis": 'Lookup table by (jurisdiction, drone class) → permit requirements, weight/range limits, BVLOS gates.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    country = str(payload.get("country", "UK")).upper()
    mass_kg = float(payload.get("mass_kg", 2.0))
    operation = str(payload.get("operation", "VLOS")).upper()
    urban_or_rural = str(payload.get("urban_or_rural", "urban")).lower()

    valid_ops = {"VLOS", "BVLOS", "EVLOS"}
    if operation not in valid_ops:
        return {"error": f"operation must be one of {valid_ops}"}

    if country in ("UK", "GB"):
        return uk_lookup(mass_kg, operation, urban_or_rural)
    elif country == "US":
        return us_lookup(mass_kg, operation, urban_or_rural)
    elif country == "EU" or country in ("DE", "FR", "IT", "ES", "NL"):
        return eu_lookup(mass_kg, operation, urban_or_rural)
    elif country == "AU":
        return au_lookup(mass_kg, operation, urban_or_rural)
    else:
        return {"error": f"Country '{country}' not yet supported. Try UK, EU, US, AU."}


def uk_lookup(mass_kg: float, operation: str, urban_or_rural: str) -> dict:
    # Category determination
    if mass_kg < 0.25:
        category = "Open A1"
        cert_req = "Operator ID + Flyer ID (free)"
        cost_gbp = 0
        training_hrs = 0
        restrictions = ["≤120m AGL", "≤50m from people", "VLOS only"]
    elif mass_kg < 2.0:
        category = "Open A2"
        cert_req = "A2 Certificate of Competency (A2 CofC)"
        cost_gbp = 400
        training_hrs = 16
        restrictions = ["≤120m AGL", "≥30m from uninvolved", "VLOS only", "Daylight"]
    elif mass_kg < 25:
        category = "Open A3"
        cert_req = "Operator ID + Flyer ID + GVC recommended"
        cost_gbp = 100
        training_hrs = 0
        restrictions = ["≤120m AGL", "≥150m from residential", "VLOS only"]
    else:
        category = "Specific (Type-Cert needed > 25 kg)"
        cert_req = "Specific category OA + Type Certificate (for >25kg)"
        cost_gbp = 25000
        training_hrs = 40
        restrictions = ["Per individual OA", "Detailed risk assessment", "Insurance"]

    # Operation overlay
    if operation == "BVLOS":
        cert_req = "Specific Category Operational Authorisation"
        cost_gbp += 25000  # specific OA cost
        training_hrs += 40
        restrictions += ["Detect-and-avoid system required", "Ground control station",
                          "Crew of 2 (pilot + observer)"]

    if urban_or_rural == "urban" and mass_kg > 2.0:
        restrictions += ["Urban ops: detailed concept of operations + traffic management"]
        cost_gbp += 8000

    return {
        "country": "UK",
        "category": category,
        "mass_kg": mass_kg,
        "operation": operation,
        "urban_or_rural": urban_or_rural,
        "required_certification": cert_req,
        "licence_cost_gbp": cost_gbp,
        "training_hours": training_hrs,
        "operating_restrictions": restrictions,
        "insurance_required_min_gbp": 1_000_000,
        "insurance_typical_commercial_gbp": 5_000_000,
        "authority": "CAA UK (Civil Aviation Authority)",
        "registration_renewal_yrs": 5 if mass_kg > 0.25 else None,
        "notes": (
            "Per UK CAA CAP 722. Open category covers most commercial drone "
            "ops. Specific category (BVLOS/large) requires bespoke OA. "
            "Always carry operator ID. Re-test required every 5 years."
        ),
    }


def us_lookup(mass_kg: float, operation: str, urban_or_rural: str) -> dict:
    if mass_kg < 0.25:
        category = "Recreational (FAA Reg only)"
        cert_req = "TRUST (Recreational UAS Safety Test) - free"
        cost_gbp = 0
        training_hrs = 1
        restrictions = ["≤400 ft AGL", "VLOS only", "Daytime"]
    elif mass_kg < 25:
        category = "Part 107 (Commercial)"
        cert_req = "FAA Remote Pilot Certificate"
        cost_gbp = 130
        training_hrs = 20
        restrictions = ["≤400 ft AGL", "VLOS only", "Daytime (unless waivered)"]
    else:
        category = "Part 91 + Type Certificate"
        cert_req = "Full type certification or COA"
        cost_gbp = 800_000
        training_hrs = 200
        restrictions = ["Per Type Certificate / COA conditions"]

    if operation == "BVLOS":
        cert_req = "Part 107.205 waiver OR Part 91 COA"
        cost_gbp += 30000
        restrictions += ["Detect-and-avoid (UAS DAA)", "ADS-B Out + traffic display"]

    return {
        "country": "US",
        "category": category,
        "mass_kg": mass_kg,
        "operation": operation,
        "urban_or_rural": urban_or_rural,
        "required_certification": cert_req,
        "licence_cost_gbp": cost_gbp,
        "training_hours": training_hrs,
        "operating_restrictions": restrictions,
        "insurance_required_min_gbp": 0,  # FAA doesn't mandate; varies by state
        "insurance_typical_commercial_gbp": 1_000_000,
        "authority": "FAA",
        "registration_renewal_yrs": 3,
        "notes": "Per 14 CFR Part 107. Remote ID mandatory since 2024.",
    }


def eu_lookup(mass_kg: float, operation: str, urban_or_rural: str) -> dict:
    if mass_kg < 0.25:
        category = "Open A1 (C0)"
        cert_req = "Operator registration + Online theory test"
        cost_gbp = 0
        training_hrs = 2
        restrictions = ["≤120m AGL", "VLOS only", "Daytime"]
    elif mass_kg < 4.0:
        category = "Open A2 (C2)"
        cert_req = "A2 Certificate"
        cost_gbp = 400
        training_hrs = 12
        restrictions = ["≤120m AGL", "≥30m from uninvolved", "VLOS"]
    elif mass_kg < 25:
        category = "Open A3 (C6)"
        cert_req = "Operator registration"
        cost_gbp = 50
        training_hrs = 4
        restrictions = ["≤120m AGL", "≥150m from people", "VLOS"]
    else:
        category = "Specific"
        cert_req = "Specific Operational Authorisation"
        cost_gbp = 35000
        training_hrs = 40
        restrictions = ["Per OA conditions"]

    if operation == "BVLOS":
        cert_req = "Specific Category OA"
        cost_gbp += 30000

    return {
        "country": "EU",
        "category": category,
        "mass_kg": mass_kg,
        "operation": operation,
        "urban_or_rural": urban_or_rural,
        "required_certification": cert_req,
        "licence_cost_gbp": cost_gbp,
        "training_hours": training_hrs,
        "operating_restrictions": restrictions,
        "insurance_required_min_gbp": 750_000,
        "insurance_typical_commercial_gbp": 4_000_000,
        "authority": "EASA",
        "registration_renewal_yrs": 5,
        "notes": "EU 2019/947 - harmonised across member states.",
    }


def au_lookup(mass_kg: float, operation: str, urban_or_rural: str) -> dict:
    if mass_kg < 2.0:
        category = "Sub-2kg (excluded)"
        cert_req = "Operator registration"
        cost_gbp = 0
        training_hrs = 2
        restrictions = ["≤120m AGL", "VLOS only", "≥30m from people"]
    elif mass_kg < 25:
        category = "Part 101 commercial"
        cert_req = "Remote Pilot Licence (RePL)"
        cost_gbp = 1500
        training_hrs = 40
        restrictions = ["≤120m AGL", "VLOS"]
    else:
        category = "Type-Certificated"
        cert_req = "CASA Type Certificate"
        cost_gbp = 600_000
        training_hrs = 200
        restrictions = ["Per TC conditions"]

    if operation == "BVLOS":
        cert_req = "ReOC + Area Approval"
        cost_gbp += 20000

    return {
        "country": "AU",
        "category": category,
        "mass_kg": mass_kg,
        "operation": operation,
        "urban_or_rural": urban_or_rural,
        "required_certification": cert_req,
        "licence_cost_gbp": cost_gbp,
        "training_hours": training_hrs,
        "operating_restrictions": restrictions,
        "insurance_required_min_gbp": 750_000,
        "insurance_typical_commercial_gbp": 3_000_000,
        "authority": "CASA Australia",
        "registration_renewal_yrs": 1,
        "notes": "Per CASR Part 101 + 102.",
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
