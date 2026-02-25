#!/usr/bin/env python3
"""
extract-vcpe-contacts.py
========================
Cleans the directors_json column from uk_vcpe_firms_enriched.csv into
a contacts CSV ready for CRM and Apollo import.

Filtering rules:
  - Current officers only: resigned_on == ""
  - Human persons only: exclude corporate entities (ALL CAPS names, Ltd/PLC/LLP in name)
  - Exclude secretarial/corporate roles

Name cleaning:
  - "LASTNAME, Firstname Middle" → "Firstname Middle LASTNAME"

Output: output/uk_vcpe_contacts.csv

Usage:
    python3 scripts/extract-vcpe-contacts.py
    python3 scripts/extract-vcpe-contacts.py --limit 50
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OUTPUT_DIR = Path(__file__).parent.parent / "output"
INPUT_CSV = OUTPUT_DIR / "uk_vcpe_firms_enriched.csv"
OUTPUT_CSV = OUTPUT_DIR / "uk_vcpe_contacts.csv"

OUTPUT_FIELDNAMES = [
    "firm_name",
    "person_name",
    "title",
    "role_type",
    "appointed_on",
    "companies_house_number",
    "firm_website",
]

# Roles to exclude (secretarial, corporate, administrative)
EXCLUDED_ROLES = {
    "secretary",
    "corporate-secretary",
    "corporate-director",
    "corporate-llp-member",
    "corporate-llp-designated-member",
    "corporate-nominee-director",
    "corporate-nominee-secretary",
    "corporate-member",
    "corporate-managing-officer",
    "corporate-firm",
}

# Role → human-readable title
ROLE_TITLES = {
    "director": "Director",
    "llp-designated-member": "Partner / MD",
    "llp-member": "Partner",
    "member": "Member",
    "managing-officer": "Managing Officer",
    "judicial-factor": "Judicial Factor",
}

# Tokens that appear in corporate entity names but not person names
CORPORATE_TOKENS = re.compile(
    r"\b(?:LIMITED|LTD|PLC|LLP|LP|CORPORATION|CORP|INC|INCORPORATED|NOMINEES?|"
    r"SECRETAR(?:Y|IES)|DIRECTOR|SERVICES|MANAGEMENT|SOLUTIONS|ACCOUNTING|"
    r"TRUSTEES?|COMPANY|CO\.|NOMINEES?)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_corporate_name(name: str) -> bool:
    """Return True if the name looks like a corporate entity rather than a person."""
    # All-caps single-word or multi-word names are usually corporate
    stripped = name.strip()
    if stripped == stripped.upper() and len(stripped) > 10:
        return True
    # Has typical corporate tokens
    if CORPORATE_TOKENS.search(stripped):
        return True
    return False


def _clean_name(name: str) -> str:
    """
    Convert "LASTNAME, Firstname Middle" → "Firstname Middle LASTNAME".
    Names already in normal form are returned as-is (title-cased).
    """
    name = name.strip()
    if "," in name:
        parts = name.split(",", 1)
        lastname = parts[0].strip().title()
        firstnames = parts[1].strip().title()
        return f"{firstnames} {lastname}"
    # Already in normal form — just title-case it
    return name.title()


def _map_role(role: str) -> str:
    return ROLE_TITLES.get(role.lower(), role.replace("-", " ").title())


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------

def process_firm(row: dict) -> list[dict]:
    """Extract cleaned contacts from a single CSV row."""
    directors_raw = row.get("directors_json", "").strip()
    if not directors_raw:
        return []

    try:
        officers = json.loads(directors_raw)
    except json.JSONDecodeError as exc:
        print(f"  [WARN] JSON parse error for {row.get('name', '?')}: {exc}", flush=True)
        return []

    contacts = []
    for officer in officers:
        role = officer.get("role", "").lower()
        resigned = officer.get("resigned_on", "").strip()
        name = officer.get("name", "").strip()

        # Filter: current officers only
        if resigned:
            continue

        # Filter: excluded roles
        if role in EXCLUDED_ROLES:
            continue

        # Filter: corporate entities
        if _is_corporate_name(name):
            continue

        clean_name = _clean_name(name)
        title = _map_role(role)
        appointed = officer.get("appointed_on", "")

        contacts.append({
            "firm_name": row.get("name", ""),
            "person_name": clean_name,
            "title": title,
            "role_type": role,
            "appointed_on": appointed,
            "companies_house_number": row.get("companies_house_number", ""),
            "firm_website": row.get("website", ""),
        })

    return contacts


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Extract clean contacts from directors_json")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N firms")
    parser.add_argument("--input", default=str(INPUT_CSV))
    parser.add_argument("--output", default=str(OUTPUT_CSV))
    args = parser.parse_args()

    print("=" * 60)
    print("VC/PE Contact Extractor")
    print("=" * 60)

    with open(args.input, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if args.limit:
        rows = rows[: args.limit]

    print(f"Processing {len(rows)} firms...")

    all_contacts: list[dict] = []
    firms_with_contacts = 0
    firms_no_contacts = 0

    for row in rows:
        contacts = process_firm(row)
        if contacts:
            all_contacts.extend(contacts)
            firms_with_contacts += 1
        else:
            firms_no_contacts += 1

    print(f"  Firms with contacts: {firms_with_contacts}")
    print(f"  Firms with no contacts: {firms_no_contacts}")
    print(f"  Total contacts extracted: {len(all_contacts)}")

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_contacts)

    print(f"\nOutput: {output_path}")

    # Sample output
    print("\nSample contacts (first 5):")
    for c in all_contacts[:5]:
        print(f"  {c['person_name']} | {c['title']} @ {c['firm_name']}")


if __name__ == "__main__":
    main()
