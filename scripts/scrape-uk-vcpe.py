#!/usr/bin/env python3
"""
UK VC/PE Firm Scraper
======================
Collects UK venture capital and private equity firms from multiple sources:
  1. BVCA member directory (https://www.bvca.co.uk/Our-Members)
  2. OpenVC API (https://api.openvc.com/v2/investors)
  3. Hardcoded seed list of ~50 well-known UK VC/PE firms (fallback)

Merges and deduplicates by domain/firm name, then writes to output/uk_vcpe_firms.csv.

Usage:
    python3 scripts/scrape-uk-vcpe.py
    python3 scripts/scrape-uk-vcpe.py --dry-run
    python3 scripts/scrape-uk-vcpe.py --limit 20
    python3 scripts/scrape-uk-vcpe.py --skip-bvca
    python3 scripts/scrape-uk-vcpe.py --skip-openvc

Output columns:
    name, website, firm_type, hq_city, hq_country, sectors,
    stage_focus, description, bvca_member, source

Environment:
    OPENVC_API_KEY  (optional — OpenVC may work without auth on public endpoints)
"""

import argparse
import csv
import os
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote

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
OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_FILE = OUTPUT_DIR / "uk_vcpe_firms.csv"

OPENVC_API_KEY = os.environ.get("OPENVC_API_KEY", "")

RATE_LIMIT_SLEEP = 1.0   # seconds between requests (polite scraping)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; ForgeOS-Research/1.0; "
        "+https://fractionalforge.com)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

CSV_COLUMNS = [
    "name",
    "website",
    "firm_type",
    "hq_city",
    "hq_country",
    "sectors",
    "stage_focus",
    "description",
    "bvca_member",
    "source",
]

# ---------------------------------------------------------------------------
# Hardcoded seed list — well-known UK VC/PE firms
# Used as fallback if scraping fails, and merged into output regardless.
# ---------------------------------------------------------------------------
SEED_FIRMS = [
    # Venture Capital
    {"name": "Balderton Capital",       "website": "https://www.balderton.com",        "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Series A-C", "description": "European VC focused on technology companies.", "bvca_member": ""},
    {"name": "Atomico",                 "website": "https://www.atomico.com",           "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Series A-D", "description": "Global technology VC founded by Skype founders.", "bvca_member": ""},
    {"name": "Index Ventures",          "website": "https://www.indexventures.com",     "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Consumer", "stage_focus": "Seed-Growth", "description": "Multi-stage VC backing technology companies.", "bvca_member": ""},
    {"name": "Octopus Ventures",        "website": "https://octopusventures.com",       "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Health, Deep Tech, Consumer", "stage_focus": "Seed-Series B", "description": "UK-focused early-stage VC.", "bvca_member": "Yes"},
    {"name": "Accel",                   "website": "https://www.accel.com",             "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Seed-Growth", "description": "Global VC with European base in London.", "bvca_member": ""},
    {"name": "Notion Capital",          "website": "https://www.notioncapital.com",     "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "B2B SaaS", "stage_focus": "Series A-B", "description": "European B2B SaaS specialist VC.", "bvca_member": ""},
    {"name": "LocalGlobe",             "website": "https://localglobe.vc",             "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Seed", "description": "UK seed-stage VC.", "bvca_member": ""},
    {"name": "Hoxton Ventures",         "website": "https://www.hoxtonventures.com",    "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Seed-Series A", "description": "Early-stage UK tech VC.", "bvca_member": ""},
    {"name": "Passion Capital",         "website": "https://www.passioncapital.com",    "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Seed", "description": "London seed fund.", "bvca_member": ""},
    {"name": "Episode 1",               "website": "https://www.episode1.com",          "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Seed-Series A", "description": "UK early-stage VC.", "bvca_member": ""},
    {"name": "Seedcamp",                "website": "https://seedcamp.com",              "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Pre-seed-Seed", "description": "Pan-European micro-VC and accelerator.", "bvca_member": ""},
    {"name": "Forward Partners",        "website": "https://forwardpartners.com",       "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Pre-seed-Series A", "description": "UK early-stage VC.", "bvca_member": ""},
    {"name": "Augmentum Fintech",       "website": "https://augmentum.vc",             "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Fintech", "stage_focus": "Series A-C", "description": "Listed fintech-focused VC.", "bvca_member": "Yes"},
    {"name": "Molten Ventures",         "website": "https://moltenventures.com",        "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Series A-C", "description": "Listed European tech VC (formerly Draper Esprit).", "bvca_member": "Yes"},
    {"name": "Kennet Partners",         "website": "https://www.kennet.com",            "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Growth", "description": "Growth equity investor in profitable SaaS.", "bvca_member": ""},
    {"name": "MMC Ventures",            "website": "https://www.mmc.vc",               "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Seed-Series B", "description": "UK technology VC.", "bvca_member": "Yes"},
    {"name": "Blossom Capital",         "website": "https://www.blossomcap.com",        "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Series A-B", "description": "European series A-focused VC.", "bvca_member": ""},
    {"name": "Dawn Capital",            "website": "https://www.dawncapital.com",       "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "B2B SaaS, Fintech", "stage_focus": "Series A-B", "description": "European B2B software VC.", "bvca_member": ""},
    {"name": "Frog Capital",            "website": "https://www.frogcapital.com",       "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Series B-C", "description": "Scale-up investor for European tech.", "bvca_member": "Yes"},
    {"name": "GP Bullhound",            "website": "https://www.gpbullhound.com",       "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Growth", "description": "Tech-focused advisory and investment firm.", "bvca_member": ""},
    {"name": "Highland Europe",         "website": "https://www.highlandeurope.com",    "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Series B-D", "description": "European growth-stage VC.", "bvca_member": ""},
    {"name": "IQ Capital",              "website": "https://iqcapital.vc",             "firm_type": "VC",  "hq_city": "Cambridge", "hq_country": "GB", "sectors": "Deep Tech, AI", "stage_focus": "Seed-Series B", "description": "Deep tech VC based in Cambridge.", "bvca_member": "Yes"},
    {"name": "Parkwalk Advisors",       "website": "https://parkwalkadvisors.com",      "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Deep Tech, University Spinouts", "stage_focus": "Seed-Series A", "description": "EIS/VCT fund focused on university spinouts.", "bvca_member": "Yes"},
    {"name": "Playfair Capital",        "website": "https://www.playfaircapital.com",   "firm_type": "VC",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology", "stage_focus": "Pre-seed-Seed", "description": "London pre-seed VC.", "bvca_member": ""},
    {"name": "Pembroke VCT",            "website": "https://pembrokevct.com",           "firm_type": "VCT", "hq_city": "London",    "hq_country": "GB", "sectors": "SME", "stage_focus": "Early Stage", "description": "Venture Capital Trust.", "bvca_member": "Yes"},
    # PE / Growth Equity
    {"name": "BGF",                     "website": "https://www.bgf.co.uk",            "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Growth", "description": "UK's most active growth capital investor.", "bvca_member": "Yes"},
    {"name": "Inflexion",               "website": "https://www.inflexion.com",         "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Services", "stage_focus": "Buyout, Growth", "description": "Mid-market private equity.", "bvca_member": "Yes"},
    {"name": "Permira",                 "website": "https://www.permira.com",           "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Consumer, Healthcare", "stage_focus": "Buyout", "description": "Global private equity firm.", "bvca_member": "Yes"},
    {"name": "Bridgepoint",             "website": "https://www.bridgepoint.eu",        "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Healthcare, Technology, Consumer", "stage_focus": "Buyout", "description": "European mid-market PE.", "bvca_member": "Yes"},
    {"name": "ECI Partners",            "website": "https://www.ecipartners.com",       "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Services, Healthcare", "stage_focus": "Growth Buyout", "description": "UK growth-focused PE.", "bvca_member": "Yes"},
    {"name": "Hg",                      "website": "https://hgcapital.com",             "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Software, Services", "stage_focus": "Buyout", "description": "Software and services-focused PE.", "bvca_member": "Yes"},
    {"name": "Graphite Capital",        "website": "https://www.graphitecapital.com",   "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Buyout", "description": "Mid-market PE firm.", "bvca_member": "Yes"},
    {"name": "NVM Private Equity",      "website": "https://www.nvm.co.uk",            "firm_type": "PE",  "hq_city": "Newcastle", "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Growth, Buyout", "description": "Regional UK PE investor.", "bvca_member": "Yes"},
    {"name": "Mobeus Equity Partners",  "website": "https://www.mobeus.co.uk",          "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Growth, VCT", "description": "UK VCT and growth equity investor.", "bvca_member": "Yes"},
    {"name": "YFM Equity Partners",     "website": "https://www.yfmep.com",            "firm_type": "PE",  "hq_city": "Leeds",     "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Buyout, Development", "description": "Northern England PE firm.", "bvca_member": "Yes"},
    {"name": "Endless LLP",             "website": "https://www.endlessllp.com",        "firm_type": "PE",  "hq_city": "Leeds",     "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Buyout, Turnaround", "description": "Leeds-based PE.", "bvca_member": "Yes"},
    {"name": "Equistone Partners",      "website": "https://www.equistonepe.com",       "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Mid-Market Buyout", "description": "Pan-European PE.", "bvca_member": "Yes"},
    {"name": "Bowmark Capital",         "website": "https://www.bowmark.com",           "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Business Services, Tech", "stage_focus": "Mid-Market Buyout", "description": "UK mid-market PE.", "bvca_member": "Yes"},
    {"name": "August Equity",           "website": "https://www.augustequity.com",      "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Healthcare, Education, Tech", "stage_focus": "Growth Buyout", "description": "UK growth PE.", "bvca_member": "Yes"},
    {"name": "Panoramic Growth Equity", "website": "https://www.panoramic.vc",          "firm_type": "PE",  "hq_city": "Glasgow",   "hq_country": "GB", "sectors": "Technology, Services", "stage_focus": "Growth", "description": "UK growth equity investor.", "bvca_member": "Yes"},
    {"name": "Synova",                  "website": "https://www.synovacapital.com",     "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Services", "stage_focus": "Mid-Market Buyout", "description": "UK PE.", "bvca_member": "Yes"},
    {"name": "Tenzing",                 "website": "https://tenzing.pe",                "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Services", "stage_focus": "Mid-Market Buyout", "description": "PE for entrepreneurial businesses.", "bvca_member": "Yes"},
    {"name": "Limerston Capital",       "website": "https://www.limerstoncapital.com",  "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Mid-Market Buyout", "description": "UK PE firm.", "bvca_member": "Yes"},
    {"name": "Horizon Capital",         "website": "https://www.horizoncapital.co.uk",  "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Technology, Media", "stage_focus": "Growth, Buyout", "description": "UK PE.", "bvca_member": "Yes"},
    {"name": "Living Bridge",           "website": "https://www.livingbridge.com",      "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Healthcare, Technology, Consumer", "stage_focus": "Growth Buyout", "description": "Mid-market PE.", "bvca_member": "Yes"},
    {"name": "Literacy Capital",        "website": "https://www.literacycapital.com",   "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Diversified", "stage_focus": "Growth", "description": "PE investment trust.", "bvca_member": "Yes"},
    {"name": "Praxis Capital",          "website": "https://www.praxiscapital.co.uk",   "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Real Estate, Private Equity", "stage_focus": "Buyout", "description": "UK PE.", "bvca_member": ""},
    {"name": "Gresham House",           "website": "https://greshamhouse.com",          "firm_type": "PE",  "hq_city": "London",    "hq_country": "GB", "sectors": "Real Assets, Strategic Equity", "stage_focus": "Growth", "description": "Alternative asset manager.", "bvca_member": "Yes"},
]


# ---------------------------------------------------------------------------
# HTML parser utility
# ---------------------------------------------------------------------------
class TextExtractor(HTMLParser):
    """Extracts visible text from HTML, skipping scripts and styles."""

    def __init__(self):
        super().__init__()
        self._buf: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if t:
                self._buf.append(t)

    def get_text(self):
        return " ".join(self._buf)


# ---------------------------------------------------------------------------
# Networking helpers
# ---------------------------------------------------------------------------
def safe_get(url: str, params: dict | None = None, json_response: bool = False,
             auth: tuple | None = None, timeout: int = 30) -> dict | str | None:
    """
    GET a URL with graceful error handling.

    Returns parsed JSON if json_response=True, raw text otherwise.
    Returns None on any error (network, 4xx, 5xx).
    """
    try:
        resp = requests.get(url, params=params, headers=HEADERS, auth=auth,
                            timeout=timeout)
        if resp.status_code == 200:
            if json_response:
                return resp.json()
            return resp.text
        if resp.status_code == 429:
            print(f"  [rate-limit] 429 on {url} — sleeping 10s")
            time.sleep(10)
            return None
        if resp.status_code == 404:
            print(f"  [404] {url}")
            return None
        print(f"  [HTTP {resp.status_code}] {url}")
        return None
    except requests.RequestException as e:
        print(f"  [error] {url}: {e}")
        return None


def normalise_domain(url: str) -> str:
    """Extract bare domain (without www.) from a URL for dedup purposes."""
    if not url:
        return ""
    try:
        parsed = urlparse(url if "://" in url else "https://" + url)
        domain = parsed.netloc.lower().lstrip("www.")
        return domain
    except Exception:
        return url.lower()


def normalise_name(name: str) -> str:
    """Lowercase, strip punctuation for fuzzy name matching."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


# ---------------------------------------------------------------------------
# Source 1: BVCA member directory
# ---------------------------------------------------------------------------
def scrape_bvca(limit: int | None = None) -> list[dict]:
    """
    Scrape BVCA member directory at https://www.bvca.co.uk/Our-Members.

    The BVCA directory renders member cards via JavaScript, so we attempt:
      1. The static HTML endpoint for each letter A-Z
      2. Fallback: parse the main listing page for any visible firm names

    Returns a list of firm dicts with CSV columns.
    """
    print("\n[BVCA] Scraping BVCA member directory...")
    firms: list[dict] = []
    seen_names: set[str] = set()

    base_url = "https://www.bvca.co.uk"
    # BVCA provides an alphabetical filter; try each letter
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    for letter in alphabet:
        if limit and len(firms) >= limit:
            break
        url = f"{base_url}/Our-Members?memberLetter={letter}"
        print(f"  [BVCA] Fetching letter {letter}...")
        html = safe_get(url)
        time.sleep(RATE_LIMIT_SLEEP)

        if not html:
            continue

        # Extract firm name candidates from anchor tags and headings.
        # BVCA member cards typically have: <h3 class="member-name">...</h3>
        # or links like /Listing/Details/<id>
        firm_links = re.findall(
            r'href="(/Listing/Details/[^"]+)"[^>]*>([^<]+)<',
            html
        )
        # Also try member card patterns
        name_matches = re.findall(
            r'class="[^"]*member[^"]*"[^>]*>\s*<[^>]+>\s*([^<]{3,80})',
            html, re.IGNORECASE
        )
        # h3/h4 tags that look like firm names
        heading_matches = re.findall(
            r'<h[234][^>]*>\s*([A-Z][^<]{2,60})\s*</h[234]>',
            html
        )

        collected_this_letter = []

        for href, name in firm_links:
            name = name.strip()
            key = normalise_name(name)
            if not name or key in seen_names:
                continue
            seen_names.add(key)
            detail_url = urljoin(base_url, href)
            firm = _fetch_bvca_detail(detail_url, name)
            firm["source"] = "bvca"
            firm["bvca_member"] = "Yes"
            collected_this_letter.append(firm)
            time.sleep(RATE_LIMIT_SLEEP)

        if not collected_this_letter:
            # Fallback: try to extract names from headings
            for name in heading_matches:
                name = name.strip()
                key = normalise_name(name)
                if not name or key in seen_names or len(name) < 3:
                    continue
                # Skip generic nav items
                if any(skip in name.lower() for skip in
                       ["navigation", "menu", "search", "login", "home", "members"]):
                    continue
                seen_names.add(key)
                collected_this_letter.append({
                    "name": name,
                    "website": "",
                    "firm_type": "VC/PE",
                    "hq_city": "",
                    "hq_country": "GB",
                    "sectors": "",
                    "stage_focus": "",
                    "description": "",
                    "bvca_member": "Yes",
                    "source": "bvca",
                })

        firms.extend(collected_this_letter)
        print(f"  [BVCA] Letter {letter}: {len(collected_this_letter)} firms "
              f"(total: {len(firms)})")

    print(f"[BVCA] Done. {len(firms)} firms collected.")
    return firms


def _fetch_bvca_detail(url: str, fallback_name: str) -> dict:
    """Fetch an individual BVCA member detail page and extract fields."""
    html = safe_get(url)
    if not html:
        return _empty_firm(fallback_name)

    extractor = TextExtractor()
    extractor.feed(html)
    text = extractor.get_text()

    # Try to extract website
    website_match = re.search(
        r'(?:website|www)\s*[:\|]?\s*(https?://[^\s<>"\']+|www\.[^\s<>"\']+)',
        text, re.IGNORECASE
    )
    website = website_match.group(1).strip() if website_match else ""

    # Try to extract city
    city_match = re.search(
        r'(?:location|city|hq|headquarters)\s*[:\|]?\s*([A-Z][a-zA-Z\s]{2,30})',
        text, re.IGNORECASE
    )
    city = city_match.group(1).strip() if city_match else ""

    # Grab page title as firm name
    title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
    name = fallback_name
    if title_match:
        title = title_match.group(1).strip()
        # BVCA titles are usually "FirmName | BVCA"
        if "|" in title:
            name = title.split("|")[0].strip()
        elif "-" in title:
            name = title.split("-")[0].strip()

    return {
        "name": name or fallback_name,
        "website": website,
        "firm_type": "VC/PE",
        "hq_city": city,
        "hq_country": "GB",
        "sectors": "",
        "stage_focus": "",
        "description": "",
        "bvca_member": "Yes",
        "source": "bvca",
    }


def _empty_firm(name: str) -> dict:
    return {
        "name": name,
        "website": "",
        "firm_type": "VC/PE",
        "hq_city": "",
        "hq_country": "GB",
        "sectors": "",
        "stage_focus": "",
        "description": "",
        "bvca_member": "",
        "source": "",
    }


# ---------------------------------------------------------------------------
# Source 2: OpenVC API
# ---------------------------------------------------------------------------
def fetch_openvc(limit: int | None = None) -> list[dict]:
    """
    Query OpenVC public API for GB-based investors.

    Endpoint: GET https://api.openvc.com/v2/investors?country=GB
    Paginates through results until exhausted or limit reached.
    """
    print("\n[OpenVC] Querying OpenVC API for GB investors...")
    firms: list[dict] = []
    page = 1
    page_size = 50

    api_headers = dict(HEADERS)
    if OPENVC_API_KEY:
        api_headers["Authorization"] = f"Bearer {OPENVC_API_KEY}"

    while True:
        if limit and len(firms) >= limit:
            break

        params = {
            "country": "GB",
            "page": page,
            "limit": page_size,
        }
        print(f"  [OpenVC] Page {page}...")
        data = safe_get(
            "https://api.openvc.com/v2/investors",
            params=params,
            json_response=True,
        )
        time.sleep(RATE_LIMIT_SLEEP)

        if not data:
            # Try alternative endpoint shape
            if page == 1:
                data = safe_get(
                    "https://api.openvc.com/investors",
                    params={"country": "GB", "page": page, "per_page": page_size},
                    json_response=True,
                )
            if not data:
                break

        # OpenVC may return {"data": [...]} or a top-level list
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = (data.get("data") or data.get("investors")
                     or data.get("results") or [])

        if not items:
            print(f"  [OpenVC] No items on page {page} — stopping.")
            break

        for item in items:
            if limit and len(firms) >= limit:
                break
            firm = _parse_openvc_item(item)
            if firm:
                firms.append(firm)

        print(f"  [OpenVC] Page {page}: {len(items)} items (total: {len(firms)})")

        # Stop if we got fewer items than a full page
        if len(items) < page_size:
            break
        page += 1

    print(f"[OpenVC] Done. {len(firms)} investors collected.")
    return firms


def _parse_openvc_item(item: dict) -> dict | None:
    """Map an OpenVC API item to our CSV schema."""
    if not isinstance(item, dict):
        return None

    name = (item.get("name") or item.get("firm_name") or "").strip()
    if not name:
        return None

    website = (item.get("website") or item.get("url") or "").strip()
    city = (
        item.get("city") or item.get("hq_city")
        or item.get("location", {}).get("city", "") if isinstance(item.get("location"), dict) else ""
        or ""
    ).strip()
    country = (
        item.get("country") or item.get("hq_country")
        or item.get("location", {}).get("country", "") if isinstance(item.get("location"), dict) else "GB"
        or "GB"
    ).strip()

    sectors_raw = item.get("sectors") or item.get("focus_sectors") or item.get("verticals") or []
    if isinstance(sectors_raw, list):
        sectors = ", ".join(str(s) for s in sectors_raw)
    else:
        sectors = str(sectors_raw)

    stages_raw = item.get("stages") or item.get("investment_stages") or item.get("stage_focus") or []
    if isinstance(stages_raw, list):
        stage_focus = ", ".join(str(s) for s in stages_raw)
    else:
        stage_focus = str(stages_raw)

    investor_type = (
        item.get("type") or item.get("investor_type") or item.get("firm_type") or "VC"
    ).strip()

    description = (item.get("description") or item.get("bio") or "").strip()

    return {
        "name": name,
        "website": website,
        "firm_type": investor_type,
        "hq_city": city,
        "hq_country": country or "GB",
        "sectors": sectors,
        "stage_focus": stage_focus,
        "description": description[:300] if description else "",
        "bvca_member": "",
        "source": "openvc",
    }


# ---------------------------------------------------------------------------
# Merge + deduplication
# ---------------------------------------------------------------------------
def merge_firms(sources: list[list[dict]]) -> list[dict]:
    """
    Merge firm lists from multiple sources, deduplicating by domain then name.

    Priority: bvca > openvc > seed (first-seen wins for base fields,
    but bvca_member flag is OR'd across all sources).
    """
    seen_domains: dict[str, int] = {}   # domain -> index in merged
    seen_names: dict[str, int] = {}     # normalised name -> index in merged
    merged: list[dict] = []

    def _add_or_merge(firm: dict) -> None:
        domain = normalise_domain(firm.get("website", ""))
        norm_name = normalise_name(firm.get("name", ""))

        idx = None
        if domain and domain in seen_domains:
            idx = seen_domains[domain]
        elif norm_name and norm_name in seen_names:
            idx = seen_names[norm_name]

        if idx is not None:
            existing = merged[idx]
            # Upgrade empty fields from this source
            for col in CSV_COLUMNS:
                if not existing.get(col) and firm.get(col):
                    existing[col] = firm[col]
            # OR the bvca_member flag
            if firm.get("bvca_member") == "Yes":
                existing["bvca_member"] = "Yes"
            # Append source if different
            if firm.get("source") and firm["source"] not in existing.get("source", ""):
                existing["source"] = existing.get("source", "") + "," + firm["source"]
        else:
            new_idx = len(merged)
            merged.append(dict(firm))
            if domain:
                seen_domains[domain] = new_idx
            if norm_name:
                seen_names[norm_name] = new_idx

    for source_list in sources:
        for firm in source_list:
            _add_or_merge(firm)

    return merged


# ---------------------------------------------------------------------------
# CSV output
# ---------------------------------------------------------------------------
def write_csv(firms: list[dict], path: Path) -> None:
    """Write firms to CSV, ensuring all columns are present."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for firm in firms:
            row = {col: firm.get(col, "") for col in CSV_COLUMNS}
            writer.writerow(row)
    print(f"\n[output] Written {len(firms)} firms to {path}")


# ---------------------------------------------------------------------------
# Seed list helpers
# ---------------------------------------------------------------------------
def get_seed_firms() -> list[dict]:
    """Return the hardcoded seed list with source tag applied."""
    seeds = []
    for f in SEED_FIRMS:
        entry = dict(f)
        entry["source"] = "seed"
        seeds.append(entry)
    return seeds


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape UK VC/PE firms from BVCA, OpenVC, and a seed list."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print counts only — do not write CSV."
    )
    parser.add_argument(
        "--limit", type=int, default=None, metavar="N",
        help="Limit number of firms collected per source (for testing)."
    )
    parser.add_argument(
        "--skip-bvca", action="store_true",
        help="Skip the BVCA scrape."
    )
    parser.add_argument(
        "--skip-openvc", action="store_true",
        help="Skip the OpenVC API query."
    )
    parser.add_argument(
        "--seed-only", action="store_true",
        help="Only write the hardcoded seed list (no network requests)."
    )
    args = parser.parse_args()

    print("=" * 60)
    print("UK VC/PE Firm Scraper")
    print("=" * 60)

    sources: list[list[dict]] = []

    # Always include seed list
    seed = get_seed_firms()
    print(f"[seed] {len(seed)} hardcoded seed firms loaded.")
    sources.append(seed)

    if not args.seed_only:
        if not args.skip_bvca:
            bvca_firms = scrape_bvca(limit=args.limit)
            sources.append(bvca_firms)
        else:
            print("[BVCA] Skipped.")

        if not args.skip_openvc:
            openvc_firms = fetch_openvc(limit=args.limit)
            sources.append(openvc_firms)
        else:
            print("[OpenVC] Skipped.")

    merged = merge_firms(sources)

    if args.limit:
        merged = merged[: args.limit]

    print(f"\n[summary] Total unique firms after merge+dedup: {len(merged)}")

    if args.dry_run:
        print("[dry-run] No CSV written.")
        # Print a sample
        for firm in merged[:5]:
            print(f"  - {firm['name']} ({firm.get('website', '')}) [{firm.get('source', '')}]")
        if len(merged) > 5:
            print(f"  ... and {len(merged) - 5} more")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(merged, OUTPUT_FILE)
    print("Done.")


if __name__ == "__main__":
    main()
