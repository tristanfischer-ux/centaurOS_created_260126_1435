#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/regulatory_imo_maritime.py

IMO MARPOL + COLREGS + class society certification lookup for AUV/USV.

IMO conventions (relevant to autonomous maritime):
- COLREGS 1972: Collision avoidance rules (auto-vehicles must comply)
- SOLAS 1974: Safety of Life at Sea (some applicable to large autonomous)
- MARPOL 73/78: Marine pollution (battery, hydraulic, fuel limits)
- STCW: Crew training (limited relevance to unmanned)
- Ballast Water Management 2004 (some USVs subject)

Class societies (alphabetical):
- ABS: American Bureau of Shipping
- BV: Bureau Veritas
- ClassNK: Japan
- CCS: China Classification Society
- DNV: Det Norske Veritas
- KR: Korean Register
- LR: Lloyd's Register
- RINA: Italy

Autonomous Maritime Vessel (MASS) categories (IMO MSC.1/Circ.1638):
- Degree 1: Manned with automation
- Degree 2: Manned remote control
- Degree 3: Unmanned remote control
- Degree 4: Fully autonomous

UK MCA Regulatory Code for MASS (2024 v3):
- <24m hull: simplified compliance
- 24m+: full SOLAS-equivalent
- Subsea AUV: separate UMSV guidance

Insurance class typical for USVs:
- P&I (Protection & Indemnity): standard
- H&M (Hull & Machinery): for capital value protection

References:
- IMO MSC.1/Circ.1638 (2021) Outcome of regulatory scoping for MASS
- MCA MIN 712(M) (UK Maritime Autonomy Code 2024)
- Lloyd's Register UMSV Code 2023
- DNV-ST-0512 (2024) Autonomous and remotely operated ships
"""
from __future__ import annotations

import json
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'regulatory_imo_maritime (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'MARPOL 73/78 Annexes I-VI; COLREGS 1972 (Convention on the International Regulations for Preventing Collisions at Sea); IMO MSC.1/Circ.1638 (MASS Code interim guidelines)',
    "physics_basis": 'Lookup table by (vessel type, operational area) → regulatory obligations. MARPOL discharge zones + COLREGS lights.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    country_flag = str(payload.get("country_flag", "UK")).upper()
    displacement_kg = float(payload.get("displacement_kg", 500))
    propulsion_type = str(payload.get("propulsion_type", "battery")).lower()
    area_of_operation = str(payload.get("area_of_operation", "territorial_uk")).lower()
    hull_length_m = float(payload.get("hull_length_m", 3.0))
    mass_degree = int(payload.get("autonomy_degree", 4))    # 1-4 MASS scale

    certs_required: list[str] = []

    # COLREGS compliance (mandatory for all surface vessels)
    certs_required.append("COLREGS Rule 5 (Lookout) - compliance demonstration required")
    certs_required.append("COLREGS Rule 8 (Action to avoid collision)")

    # Length-based requirements
    if hull_length_m < 12:
        certs_required.append("MCA Workboat Code Category 0-2 (UK small workboat)")
    elif hull_length_m < 24:
        certs_required.append("UK Workboat Code Category 3-5 (under 24m)")
    else:
        certs_required.append("SOLAS Chapter V (Safety of Navigation)")
        certs_required.append("SOLAS Chapter IV (Radiocommunications) - GMDSS")
        certs_required.append("Full Type Certificate via Notified Body")

    # Class society (recommended if hull length > 5m or value > £100k)
    class_societies = {
        "UK": ["Lloyd's Register"],
        "EU": ["DNV", "Bureau Veritas", "RINA"],
        "US": ["ABS"],
        "JP": ["ClassNK"],
        "CN": ["CCS"],
        "KR": ["Korean Register"],
    }
    if country_flag in class_societies:
        suggested = class_societies[country_flag]
        certs_required.append(f"Class society notation: {', '.join(suggested)}")

    # Battery/propulsion specific
    if propulsion_type in ("battery", "li_ion"):
        certs_required.append("UN 38.3 (Battery Transport)")
        certs_required.append("IEC 62619 (Industrial Li-ion safety)")
        certs_required.append("IMO IMDG Code Class 9 (UN 3480/3481 lithium batteries)")
    if propulsion_type == "fuel_cell":
        certs_required.append("Class Notation: Fuel Cell System (DNV/LR)")
        certs_required.append("ISO 19880 (Hydrogen fuel cells)")
    if propulsion_type == "diesel":
        certs_required.append("MARPOL Annex VI (Air Emissions) - NOx Tier III if MARPOL ECA")
        certs_required.append("EU Recreational Craft Directive 2013/53/EU (if <24m)")

    # Area-based
    if area_of_operation in ("uk_eez", "international", "international_waters"):
        certs_required.append("IMO Flag State registration")
        certs_required.append("MARPOL 1973/78 Annex I-VI (waste, plastics, air pollution)")
    if area_of_operation in ("eez", "international"):
        certs_required.append("UNCLOS Article 87 (Freedom of high seas)")
    if area_of_operation == "polar":
        certs_required.append("Polar Code (IMO Resolution MSC.385(94))")

    # Autonomy degree
    if mass_degree >= 2:
        certs_required.append("MCA MIN 712(M) MASS Code Compliance (UK)")
        certs_required.append("Remote Operations Centre approval")
    if mass_degree == 4:
        certs_required.append("Risk assessment + safety case per ISO 31000")
        certs_required.append("Cybersecurity certification (IMO MSC.1/Circ.3 + IACS UR E26-E27)")

    # Insurance class
    insurance_class = "P&I + H&M Marine"
    if mass_degree >= 3:
        insurance_class += " (Specialist autonomous coverage required)"

    # Registration cost (UK)
    if hull_length_m < 12:
        reg_cost_gbp = 1500
    elif hull_length_m < 24:
        reg_cost_gbp = 8000
    else:
        reg_cost_gbp = 35000

    # Add class society cost if applicable
    if hull_length_m > 5:
        class_cost_gbp = 15000 + (hull_length_m - 5) * 2000
        reg_cost_gbp += class_cost_gbp

    return {
        "country_flag": country_flag,
        "displacement_kg": displacement_kg,
        "propulsion_type": propulsion_type,
        "area_of_operation": area_of_operation,
        "hull_length_m": hull_length_m,
        "autonomy_degree_mass": mass_degree,
        "required_certifications": certs_required,
        "insurance_class_required": insurance_class,
        "registration_cost_gbp": reg_cost_gbp,
        "annual_class_survey_required": (hull_length_m > 5),
        "annual_survey_cost_gbp": 3000 if hull_length_m > 5 else 0,
        "notes": (
            "IMO MSC.1/Circ.1638 categorises autonomy degrees 1-4. UK MCA MIN 712(M) "
            "is the leading code. Class societies (DNV/LR/ABS) issue Type Certificates. "
            "Subsea AUVs may follow UMSV (Unmanned Maritime Surface Vehicle) code. "
            "Insurance is the practical bottleneck - few insurers cover fully autonomous."
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
