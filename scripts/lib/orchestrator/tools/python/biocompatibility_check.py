#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/biocompatibility_check.py

ISO 10993 biocompatibility classification for materials used in CGM
sensors, electrodes, and patches. Reads JSON from stdin, writes JSON
to stdout.

Input:
    {
      "materials": ["Pt", "PI_polyimide", "PDMS"],
      "contact_type": "subcutaneous",   # "skin_contact"|"subcutaneous"|"blood_contact"|"mucosal"
      "contact_duration": "limited"     # "limited" (<24h)|"prolonged" (24h-30d)|"permanent" (>30d)
    }

Output:
    {
      "overall_pass": true,
      "per_material": [
        {"material": "Pt", "iso10993_grade": "passive", "biocompatible": true, "notes": "..."},
        ...
      ],
      "required_iso10993_parts": ["1", "5", "6", "10"],
      "warnings": []
    }

ISO 10993-1 categorises devices by contact type and duration:
  Surface (skin/mucosa/breached) × duration -> required test panel
  External-communicating × duration -> required test panel
  Implant (tissue/bone/blood) × duration -> required test panel

For CGM:
- 14-day wear ≈ "prolonged" subcutaneous → ISO 10993-1, -5 (cyto), -6
  (implantation), -10 (sensitisation), -11 (systemic) at minimum.
- Adhesive layer touches skin → -5, -10, -23 (irritation).

References:
- ISO 10993-1:2018 — Biological evaluation of medical devices
- ISO 10993-5:2009 — In vitro cytotoxicity
- ISO 10993-6:2016 — Local effects after implantation
- ISO 10993-10:2010 — Irritation and sensitisation
- FDA Guidance Document G95-1
- Onuki et al., J Diabetes Sci Technol 2008 — CGM biocompat review
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'biocompatibility_check (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "ISO 10993-1:2018 'Biological evaluation of medical devices Part 1: Evaluation and testing within a risk management process'; Ratner et al. eds. (2020) 'Biomaterials Science' 4th ed., Academic Press",
    "physics_basis": 'ISO 10993-1 contact-type × duration matrix. Per-material biocompatibility records (Pt/Ti/SS/PDMS/PTFE/etc.) per ISO 10993 family of standards.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Material classification: ISO 10993 history + literature compatibility
# rating per contact type. "passive" = inert / well-tolerated;
# "active" = elicits foreign body response but acceptable for limited
# implantation; "FAIL" = known toxic / sensitising for that contact type.
#
# References: ISO 10993, Onuki 2008, Ratner "Biomaterials Science"
# 4th ed., Ratner & Bryant Annu Rev Biomed Eng 2004.
MATERIAL_LOOKUP = {
    # Metals
    "Pt": {
        "name": "Platinum",
        "skin_contact": ("passive", "Inert, used as electrode in CGM (Dexcom G7, Abbott FreeStyle)"),
        "subcutaneous": ("passive", "Standard CGM working electrode material; FDA-cleared"),
        "blood_contact": ("passive", "Used in pacemaker leads"),
        "mucosal": ("passive", "Used in dental probes"),
    },
    "Au": {
        "name": "Gold",
        "skin_contact": ("passive", "Inert; common reference electrode coating"),
        "subcutaneous": ("passive", "Inert in tissue"),
        "blood_contact": ("passive", "Used in some catheter coatings"),
        "mucosal": ("passive", "Dental use"),
    },
    "Ag": {
        "name": "Silver",
        "skin_contact": ("active", "Antimicrobial but can cause argyria; OK for limited duration"),
        "subcutaneous": ("active", "Ag/AgCl reference electrode common in CGM; small amounts only"),
        "blood_contact": ("FAIL", "Silver ions toxic to blood cells at sustained exposure"),
        "mucosal": ("active", "Acceptable in low quantities"),
    },
    "AgCl": {
        "name": "Silver chloride",
        "skin_contact": ("passive", "Standard ECG reference; safe"),
        "subcutaneous": ("passive", "Reference electrode in CGM"),
        "blood_contact": ("active", "Limited duration only"),
        "mucosal": ("passive", "Safe"),
    },
    "Ti": {
        "name": "Titanium",
        "skin_contact": ("passive", "Hypoallergenic, surgical"),
        "subcutaneous": ("passive", "Implant-grade (CP grade 1-4)"),
        "blood_contact": ("passive", "Stents, pacemaker cases"),
        "mucosal": ("passive", "Dental implants"),
    },
    "Ti6Al4V": {
        "name": "Ti-6Al-4V (grade 5)",
        "skin_contact": ("passive", "Aerospace + medical implant alloy"),
        "subcutaneous": ("passive", "Orthopaedic implants; debated due to Al/V leaching"),
        "blood_contact": ("active", "Some Al/V leaching at long term"),
        "mucosal": ("passive", "Dental"),
    },
    "Stainless_316L": {
        "name": "316L stainless steel",
        "skin_contact": ("passive", "Surgical grade"),
        "subcutaneous": ("active", "Some Ni leaching can sensitise"),
        "blood_contact": ("active", "OK for short-term implants"),
        "mucosal": ("passive", "Common dental wire"),
    },

    # Polymers
    "PDMS": {
        "name": "Polydimethylsiloxane (silicone)",
        "skin_contact": ("passive", "Pacifier-grade; biocompatible"),
        "subcutaneous": ("passive", "Sensor encapsulation in CGM; ISO 10993-5 cleared"),
        "blood_contact": ("active", "OK with surface modification"),
        "mucosal": ("passive", "Medical-grade silicone is standard"),
    },
    "PI_polyimide": {
        "name": "Polyimide (Kapton)",
        "skin_contact": ("passive", "Flex-circuit substrate, USP Class VI"),
        "subcutaneous": ("passive", "Used as CGM flex substrate (USP Class VI)"),
        "blood_contact": ("active", "Limited duration only"),
        "mucosal": ("passive", "Used in endoscopic probes"),
    },
    "Parylene_C": {
        "name": "Parylene C",
        "skin_contact": ("passive", "USP Class VI; biocompat coating"),
        "subcutaneous": ("passive", "Standard CGM sensor encapsulant"),
        "blood_contact": ("passive", "Used in stent coatings"),
        "mucosal": ("passive", "Inert"),
    },
    "Nafion": {
        "name": "Nafion (perfluorosulfonate)",
        "skin_contact": ("passive", "Inert ionomer"),
        "subcutaneous": ("passive", "Glucose-selective membrane in CGM; FDA-cleared"),
        "blood_contact": ("active", "Limited duration"),
        "mucosal": ("passive", "Inert"),
    },
    "PEG": {
        "name": "Polyethylene glycol",
        "skin_contact": ("passive", "Common excipient"),
        "subcutaneous": ("passive", "Hydrogel coating, reduces foreign-body response"),
        "blood_contact": ("passive", "Standard anti-fouling coating"),
        "mucosal": ("passive", "Pharma standard"),
    },
    "PVC": {
        "name": "Polyvinyl chloride",
        "skin_contact": ("active", "DEHP plasticiser can leach"),
        "subcutaneous": ("FAIL", "Plasticiser leaching causes inflammation"),
        "blood_contact": ("FAIL", "Banned for long-term blood contact in EU"),
        "mucosal": ("active", "OK for short-term tubing"),
    },
    "PU_medical": {
        "name": "Medical-grade polyurethane",
        "skin_contact": ("passive", "Standard wound dressing"),
        "subcutaneous": ("passive", "Catheter material"),
        "blood_contact": ("passive", "Standard vascular catheter"),
        "mucosal": ("passive", "Endotracheal tubes"),
    },

    # Adhesives (CGM patch attachment)
    "Acrylic_adhesive": {
        "name": "Medical-grade acrylic adhesive",
        "skin_contact": ("active", "Can cause contact dermatitis in ~3% of users"),
        "subcutaneous": ("FAIL", "Not designed for sub-cutaneous contact"),
        "blood_contact": ("FAIL", "Not designed for blood contact"),
        "mucosal": ("FAIL", "Not designed for mucosal contact"),
    },
    "Silicone_adhesive": {
        "name": "Silicone gel adhesive",
        "skin_contact": ("passive", "Gentle on skin, repositionable"),
        "subcutaneous": ("FAIL", "Not for subcutaneous contact"),
        "blood_contact": ("FAIL", "N/A"),
        "mucosal": ("active", "OK in limited use"),
    },

    # Misc
    "C_carbon": {
        "name": "Carbon (graphite/glassy carbon)",
        "skin_contact": ("passive", "Inert electrode"),
        "subcutaneous": ("passive", "Used as working electrode in glucose sensors"),
        "blood_contact": ("passive", "Some catheter coatings"),
        "mucosal": ("passive", "Inert"),
    },
    "GOx": {
        "name": "Glucose oxidase enzyme",
        "skin_contact": ("passive", "Aspergillus niger-derived"),
        "subcutaneous": ("passive", "Standard CGM enzyme; FDA cleared"),
        "blood_contact": ("active", "Some immune response possible"),
        "mucosal": ("passive", "OK"),
    },
}

# Required ISO 10993 test parts per contact-type / duration combination
ISO_PARTS_MATRIX = {
    ("skin_contact", "limited"): ["1", "5", "10"],
    ("skin_contact", "prolonged"): ["1", "5", "10", "23"],
    ("skin_contact", "permanent"): ["1", "5", "10", "11", "23"],
    ("subcutaneous", "limited"): ["1", "5", "6", "10", "11"],
    ("subcutaneous", "prolonged"): ["1", "5", "6", "10", "11", "23"],
    ("subcutaneous", "permanent"): ["1", "3", "5", "6", "10", "11", "23"],
    ("blood_contact", "limited"): ["1", "4", "5", "10", "11"],
    ("blood_contact", "prolonged"): ["1", "4", "5", "10", "11", "23"],
    ("blood_contact", "permanent"): ["1", "3", "4", "5", "10", "11", "23"],
    ("mucosal", "limited"): ["1", "5", "10"],
    ("mucosal", "prolonged"): ["1", "5", "10", "23"],
    ("mucosal", "permanent"): ["1", "5", "10", "11", "23"],
}


def compute(payload: dict) -> dict:
    materials = payload.get("materials", [])
    if isinstance(materials, str):
        materials = [materials]
    contact_type = str(payload.get("contact_type", "subcutaneous"))
    contact_duration = str(payload.get("contact_duration", "prolonged"))

    if contact_type not in ("skin_contact", "subcutaneous", "blood_contact", "mucosal"):
        contact_type = "subcutaneous"
    if contact_duration not in ("limited", "prolonged", "permanent"):
        contact_duration = "prolonged"

    per_material = []
    warnings = []
    fails = []

    for mat in materials:
        if mat not in MATERIAL_LOOKUP:
            per_material.append({
                "material": mat,
                "name": mat,
                "iso10993_grade": "UNKNOWN",
                "biocompatible": False,
                "notes": "Material not in lookup table; requires ISO 10993-5/-6 testing",
            })
            warnings.append(f"Material '{mat}' not in lookup; requires explicit ISO 10993 testing")
            continue
        entry = MATERIAL_LOOKUP[mat]
        grade, notes = entry[contact_type]
        biocompat = (grade != "FAIL")
        per_material.append({
            "material": mat,
            "name": entry["name"],
            "iso10993_grade": grade,
            "biocompatible": biocompat,
            "notes": notes,
        })
        if not biocompat:
            fails.append(mat)
            warnings.append(f"Material '{entry['name']}' is FAIL for {contact_type} contact")

    required_parts = ISO_PARTS_MATRIX.get((contact_type, contact_duration), ["1", "5", "10"])

    overall_pass = len(fails) == 0

    return {
        "overall_pass": overall_pass,
        "materials_analysed": len(materials),
        "materials_failed": fails,
        "per_material": per_material,
        "contact_type": contact_type,
        "contact_duration": contact_duration,
        "required_iso10993_parts": required_parts,
        "required_iso10993_parts_list": [
            f"ISO 10993-{p}" for p in required_parts
        ],
        "warnings": warnings,
        "_meta": {
            "model": "ISO 10993-1 contact × duration matrix + material lookup",
            "references": [
                "ISO 10993-1:2018",
                "ISO 10993-5/-6/-10/-11",
                "Onuki et al., J Diabetes Sci Technol 2008",
                "Ratner, 'Biomaterials Science' 4th ed.",
            ],
            "materials_in_database": len(MATERIAL_LOOKUP),
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
