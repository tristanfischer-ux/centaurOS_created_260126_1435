#!/usr/bin/env python3
"""
Companies House Enrichment Script
===================================
Reads output/uk_vcpe_firms.csv (produced by scrape-uk-vcpe.py) and enriches
each firm with data from the UK Companies House API:

  - Company number
  - Incorporation date
  - Registered address
  - Company status (active, dissolved, etc.)
  - Directors (fetched from /company/{number}/officers)

Output is written to output/uk_vcpe_firms_enriched.csv.

Usage:
    python3 scripts/enrich-companies-house.py
    python3 scripts/enrich-companies-house.py --dry-run
    python3 scripts/enrich-companies-house.py --limit 10
    python3 scripts/enrich-companies-house.py --resume

Environment:
    COMPANIES_HOUSE_API_KEY  (required — get a free key at
                              https://developer.company-information.service.gov.uk/)

Rate limit:
    Companies House free tier: 600 requests/minute.
    We sleep 0.12s between requests to stay comfortably under that.

API docs:
    https://developer-specs.company-information.service.gov.uk/
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Load .env.local (same pattern as scrape-compatibility-pairs.py)
# ---------------------------------------------------------------------------
_env_local = Path(__file__).parent.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip("'\"")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
COMPANIES_HOUSE_API_KEY = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
CH_BASE_URL = "https://api.company-information.service.gov.uk"

# 600 req/min = 10/sec; we use 0.12s between calls (~8/sec) for safety
RATE_LIMIT_SLEEP = 0.12

INPUT_DIR = Path(__file__).parent.parent / "output"
INPUT_FILE = INPUT_DIR / "uk_vcpe_firms.csv"
OUTPUT_FILE = INPUT_DIR / "uk_vcpe_firms_enriched.csv"

# Columns added by this script
ENRICHED_COLUMNS = [
    "companies_house_number",
    "incorporation_date",
    "registered_address",
    "status",
    "directors_json",
]

HEADERS = {
    "User-Agent": (
        "ForgeOS-Research/1.0 (companies-house-enrichment; "
        "+https://fractionalforge.com)"
    ),
}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def check_api_key() -> None:
    """Exit with a helpful message if the API key is missing."""
    if not COMPANIES_HOUSE_API_KEY:
        print(
            "\n[error] COMPANIES_HOUSE_API_KEY is not set.\n"
            "\n"
            "To get a free key:\n"
            "  1. Go to https://developer.company-information.service.gov.uk/\n"
            "  2. Register for a free account\n"
            "  3. Create an application to receive an API key\n"
            "  4. Add to .env.local:\n"
            "       COMPANIES_HOUSE_API_KEY=your_key_here\n"
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def ch_get(path: str, params: dict | None = None, retries: int = 2) -> dict | None:
    """
    GET a Companies House API endpoint.

    Uses HTTP Basic Auth with the API key as the username and empty password.
    Returns parsed JSON on success, None on any error.
    Retries once on connection errors; backs off on 429s.
    """
    url = f"{CH_BASE_URL}{path}"
    auth = (COMPANIES_HOUSE_API_KEY, "")
    attempt = 0

    while attempt <= retries:
        try:
            resp = requests.get(
                url,
                params=params,
                auth=auth,
                headers=HEADERS,
                timeout=20,
            )
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "60"))
                print(f"  [rate-limit] 429 — sleeping {retry_after}s")
                time.sleep(retry_after)
                attempt += 1
                continue
            if resp.status_code == 404:
                return None
            if resp.status_code == 401:
                print(
                    f"\n[error] Companies House returned 401 Unauthorized.\n"
                    f"Check that COMPANIES_HOUSE_API_KEY is correct.\n"
                )
                sys.exit(1)
            print(f"  [HTTP {resp.status_code}] {url}")
            return None
        except requests.ConnectionError as e:
            print(f"  [connection-error] {e}")
            time.sleep(2)
            attempt += 1
        except requests.Timeout:
            print(f"  [timeout] {url}")
            return None
        except requests.RequestException as e:
            print(f"  [error] {url}: {e}")
            return None

    return None


# ---------------------------------------------------------------------------
# Companies House search
# ---------------------------------------------------------------------------
def search_company(name: str) -> dict | None:
    """
    Search Companies House for a firm by name.

    Returns the top result item dict, or None if no match found.
    Uses items_per_page=3 and returns the first result whose name
    is a close match — or just the first result if confident.
    """
    data = ch_get(
        "/search/companies",
        params={"q": name, "items_per_page": 3},
    )
    time.sleep(RATE_LIMIT_SLEEP)

    if not data:
        return None

    items = data.get("items", [])
    if not items:
        return None

    # Prefer an exact or near-exact name match
    name_lower = name.lower().strip()
    for item in items:
        ch_title = (item.get("title") or "").lower().strip()
        if ch_title == name_lower:
            return item

    # Otherwise return the first result (most relevant by CH ranking)
    return items[0]


def fetch_officers(company_number: str) -> list[dict]:
    """
    Fetch active officers (directors) for a company number.

    Returns a list of simplified officer dicts:
        {"name": ..., "role": ..., "appointed_on": ..., "resigned_on": ...}
    """
    data = ch_get(
        f"/company/{company_number}/officers",
        params={"items_per_page": 50},
    )
    time.sleep(RATE_LIMIT_SLEEP)

    if not data:
        return []

    officers = []
    for item in data.get("items", []):
        officer = {
            "name": item.get("name", ""),
            "role": item.get("officer_role", ""),
            "appointed_on": item.get("appointed_on", ""),
            "resigned_on": item.get("resigned_on", ""),
        }
        officers.append(officer)
    return officers


# ---------------------------------------------------------------------------
# Row enrichment
# ---------------------------------------------------------------------------
def enrich_row(row: dict) -> dict:
    """
    Given a CSV row, query Companies House and return enriched fields.

    Returns a dict with the ENRICHED_COLUMNS keys populated (may be empty
    strings if no match found).
    """
    extras = {col: "" for col in ENRICHED_COLUMNS}
    name = row.get("name", "").strip()
    if not name:
        return extras

    result = search_company(name)
    if not result:
        return extras

    company_number = result.get("company_number", "")
    extras["companies_house_number"] = company_number
    extras["incorporation_date"] = result.get("date_of_creation", "")
    extras["status"] = result.get("company_status", "")

    # Registered address
    addr = result.get("registered_office_address") or result.get("address") or {}
    if isinstance(addr, dict):
        parts = [
            addr.get("address_line_1", ""),
            addr.get("address_line_2", ""),
            addr.get("locality", ""),
            addr.get("postal_code", ""),
            addr.get("country", ""),
        ]
        extras["registered_address"] = ", ".join(p for p in parts if p)
    elif isinstance(addr, str):
        extras["registered_address"] = addr

    # Officers / directors
    if company_number:
        officers = fetch_officers(company_number)
        if officers:
            extras["directors_json"] = json.dumps(officers, ensure_ascii=False)

    return extras


# ---------------------------------------------------------------------------
# CSV I/O
# ---------------------------------------------------------------------------
def read_input_csv(path: Path) -> list[dict]:
    """Read the input CSV and return a list of row dicts."""
    if not path.exists():
        print(
            f"\n[error] Input file not found: {path}\n"
            f"Run scrape-uk-vcpe.py first to generate it.\n"
        )
        sys.exit(1)

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    print(f"[input] Read {len(rows)} rows from {path}")
    return rows


def get_output_columns(input_rows: list[dict]) -> list[str]:
    """Return the full column list for the enriched CSV."""
    if not input_rows:
        return list(input_rows[0].keys()) + ENRICHED_COLUMNS if input_rows else ENRICHED_COLUMNS
    existing_cols = list(input_rows[0].keys())
    # Add enriched columns that aren't already there
    for col in ENRICHED_COLUMNS:
        if col not in existing_cols:
            existing_cols.append(col)
    return existing_cols


def write_output_csv(rows: list[dict], columns: list[str], path: Path) -> None:
    """Write enriched rows to the output CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    print(f"\n[output] Written {len(rows)} rows to {path}")


# ---------------------------------------------------------------------------
# Resume support
# ---------------------------------------------------------------------------
def load_existing_enriched(path: Path) -> dict[str, dict]:
    """
    Load an existing enriched CSV if it exists.

    Returns a dict keyed by firm name -> enriched row dict.
    Used by --resume to skip already-processed rows.
    """
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return {row["name"]: row for row in reader if row.get("name")}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Enrich UK VC/PE firms CSV with Companies House data "
            "(company number, incorporation date, address, directors)."
        )
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be processed — do not call the API or write output."
    )
    parser.add_argument(
        "--limit", type=int, default=None, metavar="N",
        help="Only process the first N rows (for testing)."
    )
    parser.add_argument(
        "--resume", action="store_true",
        help=(
            "Skip rows that already have a companies_house_number in the "
            "existing enriched CSV. Useful for resuming interrupted runs."
        )
    )
    parser.add_argument(
        "--input", type=Path, default=INPUT_FILE, metavar="PATH",
        help=f"Input CSV path (default: {INPUT_FILE})"
    )
    parser.add_argument(
        "--output", type=Path, default=OUTPUT_FILE, metavar="PATH",
        help=f"Output CSV path (default: {OUTPUT_FILE})"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Companies House Enrichment")
    print("=" * 60)

    check_api_key()

    rows = read_input_csv(args.input)
    output_cols = get_output_columns(rows)

    # Initialise enriched columns on all rows
    for row in rows:
        for col in ENRICHED_COLUMNS:
            if col not in row:
                row[col] = ""

    if args.limit:
        rows = rows[: args.limit]
        print(f"[limit] Processing first {args.limit} rows.")

    if args.dry_run:
        print(f"[dry-run] Would process {len(rows)} firms.")
        for row in rows[:10]:
            already = bool(row.get("companies_house_number"))
            flag = " [already enriched — would skip with --resume]" if already else ""
            print(f"  - {row.get('name', '?')}{flag}")
        if len(rows) > 10:
            print(f"  ... and {len(rows) - 10} more")
        return

    # Load existing enriched data for --resume
    existing_enriched: dict[str, dict] = {}
    if args.resume:
        existing_enriched = load_existing_enriched(args.output)
        print(f"[resume] {len(existing_enriched)} already-enriched rows loaded.")

    total = len(rows)
    processed = 0
    skipped = 0
    matched = 0
    no_match = 0

    for i, row in enumerate(rows, 1):
        name = row.get("name", "").strip()

        # --resume: skip rows that already have a company number
        if args.resume and name in existing_enriched:
            prev = existing_enriched[name]
            if prev.get("companies_house_number"):
                # Copy enriched fields from previous run
                for col in ENRICHED_COLUMNS:
                    row[col] = prev.get(col, "")
                skipped += 1
                continue

        print(f"[{i}/{total}] Enriching: {name}")
        extras = enrich_row(row)
        row.update(extras)
        processed += 1

        if extras.get("companies_house_number"):
            matched += 1
            print(
                f"  -> #{extras['companies_house_number']} "
                f"({extras.get('status', '')}) "
                f"inc. {extras.get('incorporation_date', 'unknown')}"
            )
        else:
            no_match += 1
            print(f"  -> No match found")

        # Write checkpoint every 50 rows so progress is not lost
        if processed % 50 == 0:
            write_output_csv(rows[:i], output_cols, args.output)
            print(f"  [checkpoint] Saved {i} rows so far.")

    print(f"\n[summary] Processed: {processed} | Skipped (resume): {skipped}")
    print(f"          Matched: {matched} | No match: {no_match}")

    write_output_csv(rows, output_cols, args.output)
    print("Done.")


if __name__ == "__main__":
    main()
