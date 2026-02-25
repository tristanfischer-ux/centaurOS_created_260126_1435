#!/usr/bin/env python3
"""
enrich-ukpc-websites.py
=======================
Fetches each UKPC profile page to extract:
  - Company website URL
  - Member type (better firm classification)
  - Description (longer than the teaser)

Reads:  output/uk_vcpe_firms_enriched.csv
Writes: output/uk_vcpe_firms_enriched.csv  (in-place, adds/updates 'website' column)

Usage:
    python3 scripts/enrich-ukpc-websites.py
    python3 scripts/enrich-ukpc-websites.py --limit 20
    python3 scripts/enrich-ukpc-websites.py --resume     # skip already-fetched rows
    python3 scripts/enrich-ukpc-websites.py --workers 8  # default 6

Performance:
    ~8-10 min total at 6 workers for 546 profiles.
"""

import argparse
import csv
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OUTPUT_DIR = Path(__file__).parent.parent / "output"
INPUT_CSV = OUTPUT_DIR / "uk_vcpe_firms_enriched.csv"
CHECKPOINT_FILE = OUTPUT_DIR / "enrich_websites_checkpoint.csv"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    ),
}

CHECKPOINT_EVERY = 50  # save to disk every N completed rows

# Domains to ignore when hunting for the firm's own website
SKIP_DOMAINS = {
    "typekit.net", "use.typekit.net",
    "pixl8.com",
    "linkedin.com",
    "twitter.com", "x.com",
    "youtube.com",
    "instagram.com",
    "facebook.com",
    "google.com", "googleapis.com",
    "ukprivatecapital.co.uk",
    "gravatar.com",
    "cloudflare.com",
    "jsdelivr.net",
    "jquery.com",
    "cookiebot.com",
    "cookielaw.org",
    "onetrust.com",
    "vimeo.com",
    "wistia.com",
    "brightcove.com",
    "akamaized.net",
}


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------

def _extract_from_profile(html: str) -> dict:
    """
    Parse a UKPC organisation-profile page.
    Returns dict with keys: website, member_type, description (all may be empty str).
    """
    result = {"website": "", "member_type": "", "description": ""}

    # Website: structured <dt>Website</dt><dd><a href="URL">
    website_match = re.search(
        r"<dt>Website</dt>\s*<dd><a\s+href=\"([^\"]+)\"", html
    )
    if website_match:
        result["website"] = website_match.group(1).strip().rstrip("/")

    # Fallback: any external link not on skip list
    if not result["website"]:
        for url in re.findall(r'href="(https?://[^"]{5,120})"', html):
            m = re.match(r"https?://(?:www\.)?([^/]+)", url)
            if not m:
                continue
            domain = m.group(1).lower()
            if any(skip in domain for skip in SKIP_DOMAINS):
                continue
            if re.search(r"\.(css|js|png|jpg|jpeg|svg|ico|woff|ttf)(\?|$)", url, re.IGNORECASE):
                continue
            result["website"] = url.rstrip("/")
            break

    # Member type: <dt>Member type</dt><dd>TEXT</dd>
    member_match = re.search(
        r"<dt>Member type</dt>\s*<dd>([^<]+)</dd>", html
    )
    if member_match:
        result["member_type"] = member_match.group(1).strip()

    # Description: inside the profile-contents section
    desc_match = re.search(
        r'class="profile-contents[^"]*"[^>]*>(.*?)</section>',
        html,
        re.DOTALL,
    )
    if desc_match:
        raw = desc_match.group(1)
        # Strip HTML tags and normalise whitespace
        text = re.sub(r"<[^>]+>", " ", raw)
        text = re.sub(r"\s+", " ", text).strip()
        # Drop leading "About" heading if present
        text = re.sub(r"^About\s*", "", text)
        result["description"] = text[:2000]

    return result


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

def fetch_profile(row: dict, session: requests.Session) -> dict:
    """Fetch one profile page and return enriched row dict."""
    profile_url = row.get("profile_url", "").strip()
    if not profile_url:
        return row

    try:
        resp = session.get(profile_url, timeout=30)
        resp.raise_for_status()
        extracted = _extract_from_profile(resp.text)

        # Only overwrite website if we found one and the current is empty
        if extracted["website"] and not row.get("website", "").strip():
            row["website"] = extracted["website"]

        # Always update member_type if we found one
        if extracted["member_type"]:
            row["member_type"] = extracted["member_type"]

        # Only overwrite description if the current one is short / missing
        if extracted["description"] and len(row.get("description", "")) < 50:
            row["description"] = extracted["description"]

    except Exception as exc:
        print(f"  [WARN] Failed to fetch {profile_url}: {exc}", flush=True)

    return row


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(rows: list[dict], path: Path, fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich UK VC/PE firms with UKPC profile data")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N rows")
    parser.add_argument("--resume", action="store_true",
                        help="Skip rows that already have a website or member_type")
    parser.add_argument("--workers", type=int, default=6, help="Parallel workers (default 6)")
    parser.add_argument("--input", default=str(INPUT_CSV), help="Input CSV path")
    parser.add_argument("--output", default=str(INPUT_CSV), help="Output CSV path (default: in-place)")
    args = parser.parse_args()

    print("=" * 60)
    print("UKPC Website Enricher")
    print("=" * 60)

    rows = read_csv(Path(args.input))
    fieldnames = list(rows[0].keys()) if rows else []

    # Ensure member_type column exists (may not be in older CSV)
    if "member_type" not in fieldnames:
        fieldnames.append("member_type")
        for r in rows:
            r.setdefault("member_type", "")

    total = len(rows)
    print(f"Loaded {total} rows from {args.input}")

    # Identify rows that need enriching
    to_enrich_idx = []
    for i, row in enumerate(rows):
        has_profile = "ukprivatecapital" in row.get("profile_url", "")
        needs_website = not row.get("website", "").strip()
        if has_profile and (not args.resume or needs_website):
            to_enrich_idx.append(i)

    if args.limit:
        to_enrich_idx = to_enrich_idx[: args.limit]

    print(f"Rows needing enrichment: {len(to_enrich_idx)}")
    if not to_enrich_idx:
        print("Nothing to do.")
        return

    session = requests.Session()
    session.headers.update(HEADERS)

    completed = 0
    failed = 0
    start = time.time()

    # Use thread pool for parallel fetching
    futures = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        for i in to_enrich_idx:
            future = executor.submit(fetch_profile, rows[i], session)
            futures[future] = i

        for future in as_completed(futures):
            idx = futures[future]
            try:
                rows[idx] = future.result()
                completed += 1
            except Exception as exc:
                print(f"  [ERROR] Row {idx}: {exc}", flush=True)
                failed += 1

            # Progress + checkpoint
            done = completed + failed
            if done % 10 == 0 or done == len(to_enrich_idx):
                elapsed = time.time() - start
                rate = done / elapsed if elapsed > 0 else 0
                remaining = (len(to_enrich_idx) - done) / rate if rate > 0 else 0
                print(
                    f"\r  Progress: {done}/{len(to_enrich_idx)} "
                    f"({rate:.1f}/s, ~{remaining:.0f}s remaining)    ",
                    end="",
                    flush=True,
                )

            if done % CHECKPOINT_EVERY == 0:
                write_csv(rows, Path(args.output), fieldnames)
                print(f"\n  [checkpoint] Saved {done} rows to {args.output}", flush=True)

    print()  # newline after progress

    # Final write
    write_csv(rows, Path(args.output), fieldnames)

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"Done in {elapsed:.0f}s")
    print(f"  Enriched: {completed}")
    print(f"  Failed:   {failed}")
    has_website = sum(1 for r in rows if r.get("website", "").strip())
    print(f"  Firms with website: {has_website}/{total}")
    print(f"Output: {args.output}")


if __name__ == "__main__":
    main()
