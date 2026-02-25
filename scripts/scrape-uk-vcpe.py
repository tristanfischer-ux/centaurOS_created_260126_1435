#!/usr/bin/env python3
"""
UK VC/PE Firm Scraper
=====================
Collects UK VC/PE firms from the UK Private Capital member directory
(formerly BVCA — British Private Equity & Venture Capital Association).

The directory at ukprivatecapital.co.uk exposes a loadMore endpoint that
returns all ~556 members in a single request. Each article block contains:
  - Company name
  - Profile URL (slug)
  - Location
  - Description teaser
  - Member type tags (UK General Partner, Venture Capital, etc.)

Output: output/uk_vcpe_firms.csv

Usage:
    python3 scripts/scrape-uk-vcpe.py
    python3 scripts/scrape-uk-vcpe.py --dry-run     # count only
    python3 scripts/scrape-uk-vcpe.py --limit 50    # first N firms
    python3 scripts/scrape-uk-vcpe.py --seed-only   # seed list only

Environment:
    No API key required.

Next step after this script:
    python3 scripts/enrich-companies-house.py
"""

import argparse
import csv
import os
import re
import sys
import time
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Load .env.local
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
# Constants
# ---------------------------------------------------------------------------
UKPC_BASE = "https://www.ukprivatecapital.co.uk"
UKPC_LOAD_MORE = f"{UKPC_BASE}/page-types/project_org_directory_page/loadMore/"
UKPC_PAGE_ID = "5A6DE0AD-DAAA-462C-920830D76844D8FF"
OUTPUT_DIR = Path(__file__).parent.parent / "output"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"{UKPC_BASE}/membership/member-directory.html",
}

# ---------------------------------------------------------------------------
# Hardcoded seed list (48 firms) — always included
# ---------------------------------------------------------------------------
SEED_FIRMS = [
    {"name": "Balderton Capital", "website": "https://www.balderton.com", "firm_type": "VC", "hq_city": "London", "sectors": "SaaS, Fintech, Deep Tech", "stage_focus": "Series A, Series B", "bvca_member": "Yes"},
    {"name": "Atomico", "website": "https://www.atomico.com", "firm_type": "VC", "hq_city": "London", "sectors": "Deep Tech, SaaS, Climate", "stage_focus": "Series A, Series B, Growth", "bvca_member": "Yes"},
    {"name": "Index Ventures", "website": "https://www.indexventures.com", "firm_type": "VC", "hq_city": "London", "sectors": "Fintech, Gaming, Developer Tools", "stage_focus": "Seed, Series A, Growth", "bvca_member": "Yes"},
    {"name": "Octopus Ventures", "website": "https://www.octopusventures.com", "firm_type": "VC", "hq_city": "London", "sectors": "Health Tech, B2B SaaS, Deep Tech", "stage_focus": "Seed, Series A, Series B", "bvca_member": "Yes"},
    {"name": "Accel", "website": "https://www.accel.com", "firm_type": "VC", "hq_city": "London", "sectors": "B2B SaaS, Security, Fintech", "stage_focus": "Series A, Series B, Growth", "bvca_member": "No"},
    {"name": "Notion Capital", "website": "https://www.notioncapital.com", "firm_type": "VC", "hq_city": "London", "sectors": "B2B SaaS, Cloud, RegTech", "stage_focus": "Series A, Series B", "bvca_member": "Yes"},
    {"name": "LocalGlobe", "website": "https://www.localglobe.vc", "firm_type": "VC", "hq_city": "London", "sectors": "Consumer Tech, Fintech, SaaS", "stage_focus": "Pre-Seed, Seed", "bvca_member": "Yes"},
    {"name": "Hoxton Ventures", "website": "https://www.hoxtonventures.com", "firm_type": "VC", "hq_city": "London", "sectors": "B2B SaaS, Consumer Tech", "stage_focus": "Seed, Series A", "bvca_member": "Yes"},
    {"name": "Passion Capital", "website": "https://www.passioncapital.com", "firm_type": "VC", "hq_city": "London", "sectors": "Fintech, SaaS, Consumer", "stage_focus": "Seed", "bvca_member": "Yes"},
    {"name": "Episode 1 Ventures", "website": "https://www.episode1.com", "firm_type": "VC", "hq_city": "London", "sectors": "SaaS, Marketplaces, B2B", "stage_focus": "Seed", "bvca_member": "Yes"},
    {"name": "Seedcamp", "website": "https://www.seedcamp.com", "firm_type": "VC", "hq_city": "London", "sectors": "SaaS, Fintech, Consumer Tech", "stage_focus": "Pre-Seed, Seed", "bvca_member": "Yes"},
    {"name": "Forward Partners", "website": "https://www.forwardpartners.com", "firm_type": "VC", "hq_city": "London", "sectors": "Marketplace, SaaS, Consumer", "stage_focus": "Pre-Seed, Seed", "bvca_member": "Yes"},
    {"name": "Augmentum Fintech", "website": "https://www.augmentum.vc", "firm_type": "VC", "hq_city": "London", "sectors": "Fintech, InsurTech, WealthTech", "stage_focus": "Series A, Series B", "bvca_member": "Yes"},
    {"name": "Molten Ventures", "website": "https://www.moltenventures.com", "firm_type": "Growth", "hq_city": "London", "sectors": "Deep Tech, Fintech, SaaS", "stage_focus": "Series B, Series C, Growth", "bvca_member": "Yes"},
    {"name": "Kennet Partners", "website": "https://www.kennet.com", "firm_type": "Growth", "hq_city": "London", "sectors": "SaaS, Tech-Enabled Services", "stage_focus": "Growth", "bvca_member": "Yes"},
    {"name": "MMC Ventures", "website": "https://www.mmcventures.com", "firm_type": "VC", "hq_city": "London", "sectors": "Fintech, InsurTech, AI", "stage_focus": "Series A, Series B", "bvca_member": "Yes"},
    {"name": "Blossom Capital", "website": "https://www.blossomcapital.com", "firm_type": "VC", "hq_city": "London", "sectors": "Fintech, SaaS, Consumer", "stage_focus": "Series A, Series B", "bvca_member": "Yes"},
    {"name": "Dawn Capital", "website": "https://www.dawncapital.com", "firm_type": "VC", "hq_city": "London", "sectors": "Enterprise SaaS, Fintech", "stage_focus": "Series A, Series B", "bvca_member": "Yes"},
    {"name": "Frog Capital", "website": "https://www.frogcapital.com", "firm_type": "Growth", "hq_city": "London", "sectors": "B2B SaaS, Tech-Enabled Services", "stage_focus": "Series A, Series B, Growth", "bvca_member": "Yes"},
    {"name": "GP Bullhound", "website": "https://www.gpbullhound.com", "firm_type": "Growth", "hq_city": "London", "sectors": "SaaS, Media Tech, Gaming", "stage_focus": "Series B, Growth", "bvca_member": "Yes"},
    {"name": "Highland Europe", "website": "https://www.highlandeurope.com", "firm_type": "Growth", "hq_city": "London", "sectors": "Enterprise SaaS, Security, Analytics", "stage_focus": "Series B, Series C", "bvca_member": "No"},
    {"name": "IQ Capital", "website": "https://www.iqcapital.vc", "firm_type": "VC", "hq_city": "Cambridge", "sectors": "Deep Tech, AI, Quantum", "stage_focus": "Seed, Series A, Series B", "bvca_member": "Yes"},
    {"name": "Parkwalk Advisors", "website": "https://www.parkwalkadvisors.com", "firm_type": "VC", "hq_city": "London", "sectors": "Deep Tech, AI, Life Sciences", "stage_focus": "Seed, Series A", "bvca_member": "Yes"},
    {"name": "Playfair Capital", "website": "https://www.playfaircapital.com", "firm_type": "VC", "hq_city": "London", "sectors": "SaaS, Impact, Fintech", "stage_focus": "Pre-Seed, Seed", "bvca_member": "Yes"},
    {"name": "BGF", "website": "https://www.bgf.co.uk", "firm_type": "PE", "hq_city": "London", "sectors": "All Sectors", "stage_focus": "Growth, Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Inflexion Private Equity", "website": "https://www.inflexion.com", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, Business Services, Healthcare", "stage_focus": "Buyout, Growth", "bvca_member": "Yes"},
    {"name": "Permira", "website": "https://www.permira.com", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, Consumer, Healthcare", "stage_focus": "Large Buyout, Growth", "bvca_member": "Yes"},
    {"name": "Bridgepoint", "website": "https://www.bridgepoint.eu", "firm_type": "PE", "hq_city": "London", "sectors": "Consumer, Healthcare, Business Services", "stage_focus": "Large Buyout, Mid-Market", "bvca_member": "Yes"},
    {"name": "ECI Partners", "website": "https://www.ecipartners.com", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, SaaS, Education", "stage_focus": "Buyout, Growth", "bvca_member": "Yes"},
    {"name": "Hg", "website": "https://www.hgcapital.com", "firm_type": "PE", "hq_city": "London", "sectors": "Software, SaaS, Tech-Enabled Services", "stage_focus": "Buyout, Growth", "bvca_member": "Yes"},
    {"name": "Graphite Capital", "website": "https://www.graphitecapital.com", "firm_type": "PE", "hq_city": "London", "sectors": "Consumer, Business Services, Healthcare", "stage_focus": "Mid-Market Buyout", "bvca_member": "Yes"},
    {"name": "NVM Private Equity", "website": "https://www.nvm.co.uk", "firm_type": "PE", "hq_city": "Newcastle", "sectors": "Technology, Manufacturing, Business Services", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Mobeus Equity Partners", "website": "https://www.mobeusequity.co.uk", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, Healthcare, Business Services", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "YFM Equity Partners", "website": "https://www.yfmep.com", "firm_type": "PE", "hq_city": "Leeds", "sectors": "Manufacturing, Technology, Business Services", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Endless LLP", "website": "https://www.endlessllp.com", "firm_type": "PE", "hq_city": "Leeds", "sectors": "Distressed, Manufacturing, Retail", "stage_focus": "Turnaround, Buyout", "bvca_member": "Yes"},
    {"name": "Equistone Partners Europe", "website": "https://www.equistone.com", "firm_type": "PE", "hq_city": "London", "sectors": "Industrial Technology, Business Services, Healthcare", "stage_focus": "Mid-Market Buyout", "bvca_member": "Yes"},
    {"name": "Bowmark Capital", "website": "https://www.bowmark.com", "firm_type": "PE", "hq_city": "London", "sectors": "Professional Services, Financial Services, Healthcare", "stage_focus": "Mid-Market Buyout", "bvca_member": "Yes"},
    {"name": "August Equity", "website": "https://www.augustequity.com", "firm_type": "PE", "hq_city": "London", "sectors": "Healthcare, Education, Technology Services", "stage_focus": "Buyout, Growth", "bvca_member": "Yes"},
    {"name": "Panoramic Growth Equity", "website": "https://www.panoramicgrowth.com", "firm_type": "Growth", "hq_city": "Edinburgh", "sectors": "Technology, Business Services, Consumer", "stage_focus": "Growth Capital", "bvca_member": "Yes"},
    {"name": "Synova", "website": "https://www.synovacapital.com", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, Healthcare, Financial Services", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Tenzing", "website": "https://www.tenzingpe.com", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, Tech-Enabled Services", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Limerston Capital", "website": "https://www.limerstoncapital.com", "firm_type": "PE", "hq_city": "London", "sectors": "Consumer, Business Services, Healthcare", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Horizon Capital", "website": "https://www.horizoncapital.co.uk", "firm_type": "PE", "hq_city": "London", "sectors": "Technology, Business Services", "stage_focus": "Growth, Buyout", "bvca_member": "Yes"},
    {"name": "Living Bridge", "website": "https://www.livingbridge.com", "firm_type": "PE", "hq_city": "London", "sectors": "Healthcare, Education, Financial Services", "stage_focus": "Growth Capital, Buyout", "bvca_member": "Yes"},
    {"name": "Literacy Capital", "website": "https://www.literacycapital.com", "firm_type": "PE", "hq_city": "London", "sectors": "Business Services, Technology, Consumer", "stage_focus": "Lower Mid-Market", "bvca_member": "Yes"},
    {"name": "Praxis Capital", "website": "https://www.praxiscap.com", "firm_type": "PE", "hq_city": "London", "sectors": "Real Estate, Diversified", "stage_focus": "Growth, Buyout", "bvca_member": "Yes"},
    {"name": "Gresham House", "website": "https://www.greshamhouse.com", "firm_type": "PE", "hq_city": "London", "sectors": "Forestry, Real Assets, Technology", "stage_focus": "Growth", "bvca_member": "Yes"},
]


# ---------------------------------------------------------------------------
# UKPC scraper — single-request approach
# ---------------------------------------------------------------------------

def _classify_firm_type(tags: list[str]) -> str:
    tag_text = " ".join(t.lower() for t in tags)
    if "venture capital" in tag_text or "emerging manager" in tag_text:
        return "VC"
    if "private equity" in tag_text or "buyout" in tag_text or "direct investor" in tag_text:
        return "PE"
    if "growth" in tag_text:
        return "Growth"
    if "private credit" in tag_text:
        return "Debt"
    if "corporate venture" in tag_text:
        return "CVC"
    if "accelerator" in tag_text:
        return "Accelerator"
    return "VC/PE"


def _parse_articles(html: str) -> list[dict]:
    """Parse all member articles from a single loadMore HTML response."""
    firms = []
    articles = re.findall(
        r'<article[^>]*class="[^"]*member-directory-list-item[^"]*"[^>]*>(.*?)</article>',
        html, re.DOTALL
    )

    for article in articles:
        firm: dict = {
            "name": "",
            "website": "",
            "firm_type": "",
            "hq_city": "",
            "hq_country": "UK",
            "sectors": "",
            "stage_focus": "",
            "description": "",
            "bvca_member": "Yes",
            "profile_url": "",
            "source": "ukpc_directory",
        }

        # Profile URL and name
        profile_match = re.search(
            r'href="(https://www\.ukprivatecapital\.co\.uk/organisation-profile/[^"]+)"',
            article
        )
        if profile_match:
            firm["profile_url"] = profile_match.group(1)

        name_match = re.search(
            r'class="member-directory-list-item-details-name"[^>]*>.*?<a[^>]*>\s*([^<]{2,100})\s*</a>',
            article, re.DOTALL
        )
        if name_match:
            firm["name"] = name_match.group(1).strip()

        # Location
        loc_match = re.search(
            r'class="member-directory-list-item-details-sublabel"[^>]*>\s*([^<]{2,60})\s*</p>',
            article
        )
        if loc_match:
            loc = loc_match.group(1).strip()
            city = loc.split(",")[0].strip()
            if city and city not in ("United Kingdom", "UK"):
                firm["hq_city"] = city
            else:
                firm["hq_city"] = "United Kingdom"

        # Description teaser
        desc_match = re.search(
            r'class="member-directory-list-item-details-teaser"[^>]*>\s*([^<]{5,500})\s*</div>',
            article
        )
        if desc_match:
            firm["description"] = desc_match.group(1).strip()

        # Tags → firm type
        tags = re.findall(r'<span[^>]*class="content-tag"[^>]*>\s*([^<]+)\s*</span>', article)
        tags = [t.strip() for t in tags]
        if tags:
            firm["firm_type"] = _classify_firm_type(tags)
            firm["sectors"] = ", ".join(tags)

        if firm["name"]:
            firms.append(firm)

    return firms


def scrape_ukpc(limit: int = 0) -> list[dict]:
    """Fetch all UK Private Capital members in a single request."""
    print(f"\n[UKPC] Fetching all members from UK Private Capital directory...")

    session = requests.Session()
    session.headers.update(HEADERS)

    try:
        resp = session.post(
            UKPC_LOAD_MORE,
            data={
                "pageId": UKPC_PAGE_ID,
                "sortBy": "alphabetical",
                "startRow": 0,
                "pageSize": 600,  # Fetch all at once
            },
            timeout=90,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"  [UKPC] Error: {e}")
        return []

    print(f"  [UKPC] Response: {resp.status_code} | Size: {len(resp.text):,} bytes")

    firms = _parse_articles(resp.text)
    print(f"  [UKPC] Parsed {len(firms)} member firms")

    if limit:
        firms = firms[:limit]
        print(f"  [UKPC] Limited to {len(firms)} firms")

    return firms


# ---------------------------------------------------------------------------
# Merge & deduplicate
# ---------------------------------------------------------------------------

def _norm_name(name: str) -> str:
    return re.sub(r'[\s\-\.&,]+', ' ', name.lower().strip())


def merge_firms(sources: list[list[dict]]) -> list[dict]:
    """Merge multiple source lists, deduplicating by normalised name."""
    seen: dict[str, dict] = {}
    merged: list[dict] = []

    for source_list in sources:
        for firm in source_list:
            key = _norm_name(firm.get("name", ""))
            if not key:
                continue

            if key in seen:
                existing = seen[key]
                # Upgrade with richer data from later sources
                for field in ("website", "firm_type", "hq_city", "description", "sectors", "stage_focus"):
                    if not existing.get(field) and firm.get(field):
                        existing[field] = firm[field]
                if firm.get("bvca_member") == "Yes":
                    existing["bvca_member"] = "Yes"
                continue

            # New entry — fill missing fields
            entry = {k: firm.get(k, "") for k in FIELDNAMES}
            entry["bvca_member"] = firm.get("bvca_member", "Yes")
            merged.append(entry)
            seen[key] = entry

    return merged


# ---------------------------------------------------------------------------
# CSV output
# ---------------------------------------------------------------------------

FIELDNAMES = [
    "name", "website", "firm_type", "hq_city", "hq_country",
    "sectors", "stage_focus", "description", "bvca_member",
    "profile_url", "source",
]


def write_csv(firms: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        for firm in firms:
            row = {k: firm.get(k, "") for k in FIELDNAMES}
            writer.writerow(row)
    print(f"\n[output] Written {len(firms)} firms to {path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape UK VC/PE firms from UK Private Capital directory")
    parser.add_argument("--dry-run", action="store_true", help="Count only, don't write CSV")
    parser.add_argument("--limit", type=int, default=0, help="Limit UKPC firms to N")
    parser.add_argument("--skip-ukpc", action="store_true", help="Skip UKPC, output seed list only")
    parser.add_argument("--seed-only", action="store_true", help="Output seed list only")
    parser.add_argument("--output", default=str(OUTPUT_DIR / "uk_vcpe_firms.csv"), help="Output CSV path")
    args = parser.parse_args()

    print("=" * 60)
    print("UK VC/PE Firm Scraper")
    print("=" * 60)

    sources: list[list[dict]] = []

    # Always include seed firms
    print(f"\n[seed] {len(SEED_FIRMS)} hardcoded seed firms loaded.")
    sources.append([{**f, "hq_country": "UK", "profile_url": "", "source": "seed"} for f in SEED_FIRMS])

    # UKPC directory
    if not args.skip_ukpc and not args.seed_only:
        ukpc_firms = scrape_ukpc(limit=args.limit)
        sources.append(ukpc_firms)

    firms = merge_firms(sources)
    print(f"\n[summary] Total unique firms after merge+dedup: {len(firms)}")

    if args.dry_run:
        print(f"[dry-run] Would write {len(firms)} firms. Sample:")
        for f in firms[:5]:
            print(f"  {f.get('name')} | {f.get('firm_type')} | {f.get('hq_city')} | {f.get('description', '')[:60]}")
        return

    write_csv(firms, Path(args.output))
    print("\nDone. Next step: python3 scripts/enrich-companies-house.py")


if __name__ == "__main__":
    main()
