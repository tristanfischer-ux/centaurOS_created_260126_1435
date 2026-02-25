#!/usr/bin/env python3
"""
ForgeOS Factory / Supplier Profile Generator (v2 — LLM-Driven Discovery)
=========================================================================
Two-phase pipeline that populates the ForgeOS marketplace with ~400 real
manufacturing companies:

  Phase 1 — DISCOVERY:  Ollama generates lists of real companies per category
  Phase 2 — ENRICHMENT: Scrape each website, summarise with Ollama, push to Supabase

Usage:
    python3 scripts/generate-factory-profiles.py
    python3 scripts/generate-factory-profiles.py --dry-run
    python3 scripts/generate-factory-profiles.py --skip-discovery   # reuse cached discovery
    python3 scripts/generate-factory-profiles.py --push-only generated_factories/batch_XXX.json

Environment:
    SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    OLLAMA_HOST   (default http://localhost:11434)
    OLLAMA_MODEL  (default qwen3:14b)
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

_env_local = Path(__file__).parent.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() not in os.environ:
            os.environ[k.strip()] = v.strip().strip("'\"")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:14b")
OLLAMA_TIMEOUT = 1800
LLM_MAX_RETRIES = 3

OUTPUT_DIR = Path("./generated_factories")
DISCOVERY_CACHE = OUTPUT_DIR / "discovery_cache.json"
LOG_FILE = Path("./factory_profiles_log.txt")

# ---------------------------------------------------------------------------
# Target categories — aim for ~30-50 companies each → 400+ total
# ---------------------------------------------------------------------------

CATEGORIES = [
    {
        "category": "Products",
        "subcategory": "PCB Manufacturing",
        "target_count": 35,
        "description": "Companies that manufacture printed circuit boards — prototyping and production. Include Chinese, US, European, Japanese, Korean, and Taiwanese manufacturers. Mix of budget rapid-proto services and high-reliability mil-spec/medical-grade fabs.",
    },
    {
        "category": "Products",
        "subcategory": "CNC Machining",
        "target_count": 40,
        "description": "Companies offering CNC milling and turning services — both prototyping and production. Include online instant-quote platforms, traditional job shops, and specialty shops (Swiss turning, 5-axis). Global coverage: US, Europe, China, India.",
    },
    {
        "category": "Products",
        "subcategory": "3D Printing",
        "target_count": 35,
        "description": "3D printing service bureaus and additive manufacturing companies. Include SLS, SLA, FDM, MJF, DMLS/metal printing. Mix of consumer-friendly upload services and industrial AM providers.",
    },
    {
        "category": "Products",
        "subcategory": "Injection Molding",
        "target_count": 35,
        "description": "Injection molding companies for plastic parts — prototyping, bridge tooling, and production molding. Include rapid tooling services, traditional molders, and offshore options.",
    },
    {
        "category": "Products",
        "subcategory": "Sheet Metal Fabrication",
        "target_count": 30,
        "description": "Sheet metal fabrication companies — laser cutting, bending, welding, finishing. Include online instant-quote services and traditional fabricators.",
    },
    {
        "category": "Products",
        "subcategory": "Electronics Assembly",
        "target_count": 40,
        "description": "Electronics manufacturing services (EMS) — PCB assembly (PCBA), box build, cable assembly. Include turnkey providers, low-volume specialists, and large contract manufacturers.",
    },
    {
        "category": "Products",
        "subcategory": "Component Distribution",
        "target_count": 30,
        "description": "Electronic component distributors and suppliers. Include authorized distributors, aggregators, and specialty suppliers. Global coverage.",
    },
    {
        "category": "Products",
        "subcategory": "Casting & Foundry",
        "target_count": 25,
        "description": "Metal casting companies — investment casting, die casting, sand casting, lost-wax casting. Include both prototyping and production foundries for aluminium, steel, bronze, zinc.",
    },
    {
        "category": "Products",
        "subcategory": "Surface Treatment & Finishing",
        "target_count": 20,
        "description": "Surface finishing and treatment companies — anodizing, powder coating, electroplating, passivation, painting. Include specialty finishers for aerospace, medical, and consumer electronics.",
    },
    {
        "category": "Products",
        "subcategory": "Rubber & Silicone Molding",
        "target_count": 15,
        "description": "Companies specializing in rubber molding, silicone molding, LSR (liquid silicone rubber), compression molding, and transfer molding for gaskets, seals, overmolds, and custom parts.",
    },
    {
        "category": "Products",
        "subcategory": "Wire Harness & Cable Assembly",
        "target_count": 15,
        "description": "Companies that manufacture custom cable assemblies, wire harnesses, and interconnect solutions for electronics, automotive, aerospace, and industrial applications.",
    },
    {
        "category": "Services",
        "subcategory": "Industrial Design",
        "target_count": 30,
        "description": "Industrial design and product design consultancies — concept to production. Include famous agencies and smaller specialist firms. Cover US, Europe, and Asia.",
    },
    {
        "category": "Services",
        "subcategory": "Mechanical Engineering",
        "target_count": 25,
        "description": "Mechanical engineering consultancies and contract engineering firms — FEA/CFD simulation, mechanism design, DFM, thermal management. Include both boutique firms and larger engineering houses.",
    },
    {
        "category": "Services",
        "subcategory": "Testing & Certification",
        "target_count": 30,
        "description": "Testing laboratories and certification bodies — EMC testing, safety testing (UL, CE, FCC), environmental testing, reliability testing, HALT/HASS. Include global test labs and regional specialists.",
    },
    {
        "category": "Services",
        "subcategory": "Packaging Design & Manufacturing",
        "target_count": 15,
        "description": "Companies that design and manufacture product packaging — retail packaging, protective packaging, custom inserts. Include sustainable packaging specialists.",
    },
]

EXPECTED_TOTAL = sum(c["target_count"] for c in CATEGORIES)

# ---------------------------------------------------------------------------
# Seed companies — well-known companies we KNOW exist, seeded into discovery
# to guarantee they appear. The LLM will add more to reach target_count.
# ---------------------------------------------------------------------------

SEED_COMPANIES: dict[str, list[dict]] = {
    "PCB Manufacturing": [
        {"name": "JLCPCB", "website": "https://jlcpcb.com"},
        {"name": "PCBWay", "website": "https://www.pcbway.com"},
        {"name": "OSH Park", "website": "https://oshpark.com"},
        {"name": "Eurocircuits", "website": "https://www.eurocircuits.com"},
        {"name": "NextPCB", "website": "https://www.nextpcb.com"},
        {"name": "Elecrow", "website": "https://www.elecrow.com"},
        {"name": "Sierra Circuits", "website": "https://www.protoexpress.com"},
        {"name": "Advanced Circuits", "website": "https://www.4pcb.com"},
        {"name": "Sunstone Circuits", "website": "https://www.sunstone.com"},
        {"name": "TTM Technologies", "website": "https://www.ttm.com"},
    ],
    "CNC Machining": [
        {"name": "Xometry", "website": "https://www.xometry.com"},
        {"name": "Protolabs", "website": "https://www.protolabs.com"},
        {"name": "Hubs", "website": "https://www.hubs.com"},
        {"name": "Fictiv", "website": "https://www.fictiv.com"},
        {"name": "SendCutSend", "website": "https://sendcutsend.com"},
        {"name": "RapidDirect", "website": "https://www.rapiddirect.com"},
        {"name": "Star Rapid", "website": "https://www.starrapid.com"},
        {"name": "Get It Made", "website": "https://www.getitmade.com"},
        {"name": "Fractory", "website": "https://fractory.com"},
        {"name": "eMachineShop", "website": "https://www.emachineshop.com"},
    ],
    "3D Printing": [
        {"name": "Shapeways", "website": "https://www.shapeways.com"},
        {"name": "Sculpteo", "website": "https://www.sculpteo.com"},
        {"name": "i.materialise", "website": "https://i.materialise.com"},
        {"name": "Materialise", "website": "https://www.materialise.com"},
        {"name": "Stratasys Direct", "website": "https://www.stratasys.com"},
        {"name": "Weerg", "website": "https://www.weerg.com"},
        {"name": "JawsTec", "website": "https://jawstec.com"},
        {"name": "Craftcloud", "website": "https://craftcloud3d.com"},
    ],
    "Injection Molding": [
        {"name": "Protolabs Injection Molding", "website": "https://www.protolabs.com/services/injection-molding/"},
        {"name": "Xcentric Mold", "website": "https://www.xcentricmold.com"},
        {"name": "ICOMold", "website": "https://icomold.com"},
        {"name": "Quickparts", "website": "https://quickparts.com"},
        {"name": "Jabil", "website": "https://www.jabil.com"},
    ],
    "Electronics Assembly": [
        {"name": "Tempo Automation", "website": "https://www.tempoautomation.com"},
        {"name": "MacroFab", "website": "https://www.macrofab.com"},
        {"name": "Screaming Circuits", "website": "https://www.screamingcircuits.com"},
        {"name": "Sanmina", "website": "https://www.sanmina.com"},
        {"name": "Celestica", "website": "https://www.celestica.com"},
        {"name": "Flex Ltd", "website": "https://flex.com"},
        {"name": "Benchmark Electronics", "website": "https://www.bench.com"},
    ],
    "Component Distribution": [
        {"name": "DigiKey", "website": "https://www.digikey.com"},
        {"name": "Mouser Electronics", "website": "https://www.mouser.com"},
        {"name": "RS Components", "website": "https://www.rs-online.com"},
        {"name": "Farnell", "website": "https://www.farnell.com"},
        {"name": "Arrow Electronics", "website": "https://www.arrow.com"},
        {"name": "LCSC", "website": "https://www.lcsc.com"},
        {"name": "Newark", "website": "https://www.newark.com"},
        {"name": "Octopart", "website": "https://octopart.com"},
    ],
    "Industrial Design": [
        {"name": "IDEO", "website": "https://www.ideo.com"},
        {"name": "Frog Design", "website": "https://www.frog.co"},
        {"name": "Whipsaw", "website": "https://www.whipsaw.com"},
        {"name": "Bresslergroup", "website": "https://www.bresslergroup.com"},
        {"name": "Ammunition Group", "website": "https://www.ammunitiongroup.com"},
    ],
    "Testing & Certification": [
        {"name": "UL Solutions", "website": "https://www.ul.com"},
        {"name": "TÜV SÜD", "website": "https://www.tuvsud.com"},
        {"name": "Intertek", "website": "https://www.intertek.com"},
        {"name": "SGS", "website": "https://www.sgs.com"},
        {"name": "Bureau Veritas", "website": "https://www.bureauveritas.com"},
        {"name": "Eurofins", "website": "https://www.eurofins.com"},
        {"name": "Element Materials", "website": "https://www.element.com"},
    ],
}

# ---------------------------------------------------------------------------
# Discovery prompt — asks LLM to generate company lists
# ---------------------------------------------------------------------------

DISCOVERY_PROMPT = """/no_think
You are a hardware engineering expert helping populate a manufacturing marketplace.

Generate a list of EXACTLY {remaining_count} REAL companies in the category "{subcategory}".

IMPORTANT RULES:
- These must be REAL companies that actually exist today
- Include the company's REAL website URL (must be a working URL)
- Mix of well-known and lesser-known companies
- Geographic diversity: include companies from USA, Europe, China, Japan, Korea, Taiwan, India, SE Asia
- Mix of company sizes: startups, mid-size, and large enterprises
- Each company must be DIFFERENT from these already-listed ones: {existing_names}

Category description: {description}

Return a JSON array of objects, each with "name" and "website" fields:
[
  {{"name": "Company Name", "website": "https://www.example.com"}},
  ...
]

Return ONLY the JSON array. No markdown fences. No explanation.
"""

# ---------------------------------------------------------------------------
# Enrichment prompt — generates full profile from scraped website
# ---------------------------------------------------------------------------

ENRICHMENT_PROMPT = """/no_think
You are generating a structured factory/supplier profile for a hardware engineering marketplace called ForgeOS.

COMPANY: {name}
WEBSITE: {website}
CATEGORY: {subcategory}
SCRAPED WEBSITE TEXT (may be partial):
---
{scraped_text}
---

Based on the scraped text and your knowledge of this company, generate a JSON object with these fields:

{{
  "company_name": "{name}",
  "website_url": "{website}",
  "tagline": "One-line description of what they do (max 15 words)",
  "description": "2-3 paragraph description of the company, what they offer, and why hardware engineers use them. Be specific about capabilities.",
  "company_history": "Brief history — when founded, by whom, key milestones, growth. 2-3 sentences.",
  "headquarters": "City, Country",
  "founded_year": number or null,
  "employee_count_range": "e.g. 50-200, 1000-5000, 10000+",
  "key_capabilities": ["capability 1", "capability 2", ...],
  "materials_or_technologies": ["material/tech 1", "material/tech 2", ...],
  "certifications": ["ISO 9001", "ISO 13485", etc.] or [],
  "typical_lead_time": "e.g. 2-5 days, 1-2 weeks, 3-4 weeks",
  "minimum_order": "e.g. 1 piece, 5 units, $500 MOQ" or null,
  "pricing_tier": "budget" | "mid-range" | "premium",
  "serves_prototyping": true/false,
  "serves_production": true/false,
  "notable_clients_or_industries": ["industry 1", "industry 2"],
  "geographic_reach": "e.g. Global, North America, Europe, Asia",
  "executive_summary": "A 2-sentence summary a hardware startup founder would find useful when deciding whether to use this company."
}}

Return ONLY the JSON object, no markdown fences.
"""

# ---------------------------------------------------------------------------
# HTML text extraction
# ---------------------------------------------------------------------------


class HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._text: list[str] = []
        self._skip = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style", "noscript", "svg", "iframe"):
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript", "svg", "iframe"):
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            text = data.strip()
            if text:
                self._text.append(text)

    def get_text(self) -> str:
        return " ".join(self._text)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def scrape_website(url: str, max_chars: int = 3000) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        if resp.status_code != 200:
            log(f"      ⚠️  HTTP {resp.status_code} for {url}")
            return f"[Could not fetch — HTTP {resp.status_code}]"
        extractor = HTMLTextExtractor()
        extractor.feed(resp.text)
        text = extractor.get_text()
        seen: set[str] = set()
        parts: list[str] = []
        for p in text.split(". "):
            n = p.strip().lower()
            if n not in seen and len(n) > 10:
                seen.add(n)
                parts.append(p.strip())
        return ". ".join(parts)[:max_chars]
    except requests.RequestException as e:
        log(f"      ⚠️  Scrape failed: {e}")
        return f"[Could not fetch — {e}]"


def generate_with_qwen(prompt: str, attempt: int = 1) -> dict | list | None:
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": 0.4, "num_predict": 2048, "num_ctx": 8192},
    }
    try:
        label = f" (retry {attempt})" if attempt > 1 else ""
        log(f"      🤖 Streaming from {OLLAMA_MODEL}{label}...")
        start = time.time()
        resp = requests.post(url, json=payload, stream=True, timeout=OLLAMA_TIMEOUT)
        if resp.status_code != 200:
            log(f"      ❌ Ollama HTTP {resp.status_code}")
            return None
        full = ""
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                full += chunk.get("response", "")
                if chunk.get("done"):
                    break
        elapsed = time.time() - start
        log(f"      ⏱️  {elapsed:.1f}s ({len(full)} chars)")
        cleaned = re.sub(r"<think>[\s\S]*?</think>", "", full).strip()
        if not cleaned:
            if attempt < LLM_MAX_RETRIES:
                time.sleep(5)
                return generate_with_qwen(prompt, attempt + 1)
            return None
        result = _parse_json(cleaned)
        if result is None and attempt < LLM_MAX_RETRIES:
            time.sleep(5)
            return generate_with_qwen(prompt, attempt + 1)
        return result
    except requests.RequestException as e:
        log(f"      ❌ Request failed: {e}")
        if attempt < LLM_MAX_RETRIES:
            time.sleep(10)
            return generate_with_qwen(prompt, attempt + 1)
        return None


def _parse_json(text: str) -> dict | list | None:
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
    cleaned = re.sub(r"```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Find outermost array or object
    for open_ch, close_ch in [("[", "]"), ("{", "}")]:
        start = cleaned.find(open_ch)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(cleaned)):
            if cleaned[i] == open_ch:
                depth += 1
            elif cleaned[i] == close_ch:
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start : i + 1]
                    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break
    return None


def push_to_supabase(listings: list[dict]) -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("⚠️  Missing Supabase credentials — skipping push")
        return 0

    api_key = SUPABASE_ANON_KEY or SUPABASE_KEY
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    pushed = 0
    for listing in listings:
        row = {
            "category": listing["category"],
            "subcategory": listing["subcategory"],
            "title": listing["company_name"],
            "description": listing.get("description", ""),
            "attributes": {
                "website_url": listing.get("website_url", ""),
                "tagline": listing.get("tagline", ""),
                "company_history": listing.get("company_history", ""),
                "headquarters": listing.get("headquarters", ""),
                "founded_year": listing.get("founded_year"),
                "employee_count_range": listing.get("employee_count_range", ""),
                "key_capabilities": listing.get("key_capabilities", []),
                "materials_or_technologies": listing.get("materials_or_technologies", []),
                "certifications": listing.get("certifications", []),
                "typical_lead_time": listing.get("typical_lead_time", ""),
                "minimum_order": listing.get("minimum_order"),
                "pricing_tier": listing.get("pricing_tier", "mid-range"),
                "serves_prototyping": listing.get("serves_prototyping", True),
                "serves_production": listing.get("serves_production", True),
                "notable_clients_or_industries": listing.get("notable_clients_or_industries", []),
                "geographic_reach": listing.get("geographic_reach", "Global"),
                "executive_summary": listing.get("executive_summary", ""),
                "is_factory_enriched": True,
                "enriched_at": datetime.now(timezone.utc).isoformat(),
            },
            "is_verified": True,
            "is_demo": True,
        }

        url = f"{SUPABASE_URL}/rest/v1/marketplace_listings"
        try:
            resp = requests.post(url, headers=headers, json=row)
            if resp.status_code in (200, 201):
                pushed += 1
            else:
                log(f"    ❌ Push failed for {listing.get('company_name','?')}: {resp.status_code}")
        except requests.RequestException as e:
            log(f"    ❌ Push error: {e}")

    return pushed


# ---------------------------------------------------------------------------
# Phase 1: Discovery — LLM generates company lists per category
# ---------------------------------------------------------------------------


def discover_companies(categories: list[dict]) -> dict[str, list[dict]]:
    """Use LLM to discover real companies for each category."""
    all_discovered: dict[str, list[dict]] = {}

    for idx, cat in enumerate(categories, 1):
        subcat = cat["subcategory"]
        target = cat["target_count"]
        seeds = SEED_COMPANIES.get(subcat, [])
        existing_names = ", ".join(s["name"] for s in seeds) if seeds else "none"
        remaining = max(0, target - len(seeds))

        log(f"\n  [{idx}/{len(categories)}] 🔍 Discovering {subcat}: "
            f"{len(seeds)} seeds + {remaining} to discover (target {target})")

        companies = list(seeds)

        if remaining > 0:
            prompt = DISCOVERY_PROMPT.format(
                remaining_count=remaining,
                subcategory=subcat,
                description=cat["description"],
                existing_names=existing_names,
            )
            result = generate_with_qwen(prompt)
            if isinstance(result, list):
                valid = [
                    c for c in result
                    if isinstance(c, dict) and c.get("name") and c.get("website")
                ]
                # Deduplicate against seeds
                seed_names = {s["name"].lower() for s in seeds}
                unique = [c for c in valid if c["name"].lower() not in seed_names]
                companies.extend(unique[:remaining])
                log(f"      ✅ Discovered {len(unique)} new companies "
                    f"(total {len(companies)} for {subcat})")
            else:
                log(f"      ⚠️  Discovery failed — using {len(seeds)} seeds only")

        all_discovered[subcat] = companies

    return all_discovered


# ---------------------------------------------------------------------------
# Phase 2: Enrichment — scrape + profile each company
# ---------------------------------------------------------------------------


def enrich_company(name: str, website: str, subcategory: str, category: str) -> dict | None:
    log(f"      🌐 Scraping {website}...")
    scraped = scrape_website(website)

    prompt = ENRICHMENT_PROMPT.format(
        name=name, website=website, subcategory=subcategory, scraped_text=scraped,
    )
    profile = generate_with_qwen(prompt)
    if not isinstance(profile, dict):
        log(f"      ❌ Failed to enrich {name}")
        return None

    profile["category"] = category
    profile["subcategory"] = subcategory
    profile.setdefault("company_name", name)
    profile.setdefault("website_url", website)
    return profile


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate 400+ factory profiles for ForgeOS")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't push")
    parser.add_argument("--skip-discovery", action="store_true", help="Reuse cached discovery")
    parser.add_argument("--push-only", type=str, help="Push existing JSON batch")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)

    if args.push_only:
        log(f"📤 Push-only: {args.push_only}")
        with open(args.push_only) as f:
            listings = json.load(f)
        pushed = push_to_supabase(listings)
        log(f"✅ Pushed {pushed} listings")
        return

    log("=" * 70)
    log("ForgeOS Factory Profile Generator v2 — LLM-Driven Discovery")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log(f"Categories: {len(CATEGORIES)}")
    log(f"Target total: ~{EXPECTED_TOTAL} companies")
    log("=" * 70)

    # ------ Phase 1: Discovery ------
    if args.skip_discovery and DISCOVERY_CACHE.exists():
        log("\n📂 Loading cached discovery...")
        with open(DISCOVERY_CACHE) as f:
            discovered = json.load(f)
        total_discovered = sum(len(v) for v in discovered.values())
        log(f"   Loaded {total_discovered} companies from cache")
    else:
        log("\n" + "=" * 70)
        log("PHASE 1: DISCOVERY — LLM generating company lists")
        log("=" * 70)
        discovered = discover_companies(CATEGORIES)
        with open(DISCOVERY_CACHE, "w") as f:
            json.dump(discovered, f, indent=2)
        total_discovered = sum(len(v) for v in discovered.values())
        log(f"\n💾 Discovery complete: {total_discovered} companies across "
            f"{len(discovered)} categories → saved to {DISCOVERY_CACHE}")

    # ------ Phase 2: Enrichment ------
    log("\n" + "=" * 70)
    log("PHASE 2: ENRICHMENT — Scraping & profiling each company")
    log("=" * 70)

    all_profiles: list[dict] = []
    cat_lookup = {c["subcategory"]: c["category"] for c in CATEGORIES}
    total_companies = sum(len(v) for v in discovered.values())
    global_idx = 0

    for subcat, companies in discovered.items():
        category = cat_lookup.get(subcat, "Products")
        log(f"\n  🏭 {subcat} ({len(companies)} companies)")

        for i, company in enumerate(companies, 1):
            global_idx += 1
            name = company["name"]
            website = company["website"]
            log(f"\n    [{global_idx}/{total_companies}] {name}")

            profile = enrich_company(name, website, subcat, category)
            if profile:
                all_profiles.append(profile)
                tagline = profile.get("tagline", "—")
                log(f"      ✅ {name} — {tagline}")
            else:
                log(f"      ❌ Skipped {name}")

            # Save intermediate checkpoint every 25 companies
            if len(all_profiles) % 25 == 0 and len(all_profiles) > 0:
                ckpt = OUTPUT_DIR / f"checkpoint_{len(all_profiles)}.json"
                with open(ckpt, "w") as f:
                    json.dump(all_profiles, f, indent=2, default=str)
                log(f"      💾 Checkpoint: {len(all_profiles)} profiles saved")

    # ------ Save final batch ------
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"batch_{ts}.json"
    with open(out_path, "w") as f:
        json.dump(all_profiles, f, indent=2, default=str)
    log(f"\n💾 Saved {len(all_profiles)} profiles to {out_path}")

    # ------ Push to Supabase ------
    if not args.dry_run:
        log(f"\n📤 Pushing {len(all_profiles)} listings to Supabase...")
        pushed = push_to_supabase(all_profiles)
        log(f"✅ Pushed {pushed}/{len(all_profiles)} listings")
    else:
        log("🔍 Dry run — skipping Supabase push")

    log(f"\n{'=' * 70}")
    log(f"✅ COMPLETE — {len(all_profiles)}/{total_companies} factories enriched")
    log(f"   Output: {out_path}")
    log(f"{'=' * 70}")


if __name__ == "__main__":
    main()
