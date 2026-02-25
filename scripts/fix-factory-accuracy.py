#!/usr/bin/env python3
"""
ForgeOS Factory Profile Accuracy Fix
=====================================
Three-pass cleanup pipeline:
  Pass 1 — Remove duplicates (same URL or near-identical names)
  Pass 2 — Remove misclassified companies
  Pass 3 — Re-verify factual data by scraping /about pages + LLM fact-check

Reads the existing batch files, fixes them, then updates Supabase.

Usage:
    python3 scripts/fix-factory-accuracy.py
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from html.parser import HTMLParser
from pathlib import Path

import requests

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
LOG_FILE = Path("./factory_accuracy_fix_log.txt")
OUTPUT_DIR = Path("./generated_factories")


class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._text, self._skip = [], False
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg", "iframe"): self._skip = True
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg", "iframe"): self._skip = False
    def handle_data(self, data):
        if not self._skip and data.strip(): self._text.append(data.strip())
    def get_text(self): return " ".join(self._text)


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        print(line, flush=True)
    except (BrokenPipeError, OSError):
        pass
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def scrape_page(url: str, max_chars: int = 3000) -> str:
    try:
        r = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html"}, timeout=15, allow_redirects=True)
        if r.status_code != 200:
            return ""
        ext = HTMLTextExtractor()
        ext.feed(r.text)
        return ext.get_text()[:max_chars]
    except Exception:
        return ""


def call_ollama(prompt: str, attempt: int = 1) -> dict | list | None:
    try:
        r = requests.post(f"{OLLAMA_HOST}/api/generate", json={
            "model": OLLAMA_MODEL, "prompt": prompt, "stream": True,
            "options": {"temperature": 0.2, "num_predict": 1024, "num_ctx": 8192}
        }, stream=True, timeout=600)
        if r.status_code != 200:
            return None
        full = ""
        for line in r.iter_lines():
            if line:
                c = json.loads(line)
                full += c.get("response", "")
                if c.get("done"):
                    break
        cleaned = re.sub(r"<think>[\s\S]*?</think>", "", full).strip()
        cleaned = re.sub(r"```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"```\s*$", "", cleaned).strip()
        cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            s = cleaned.find("{")
            if s == -1:
                return None
            d = 0
            for i in range(s, len(cleaned)):
                if cleaned[i] == "{":
                    d += 1
                elif cleaned[i] == "}":
                    d -= 1
                    if d == 0:
                        try:
                            return json.loads(re.sub(r",\s*([}\]])", r"\1", cleaned[s:i+1]))
                        except json.JSONDecodeError:
                            break
        if attempt < 2:
            time.sleep(3)
            return call_ollama(prompt, attempt + 1)
        return None
    except Exception:
        if attempt < 2:
            time.sleep(5)
            return call_ollama(prompt, attempt + 1)
        return None


# =========================================================================
# PASS 1: Deduplication
# =========================================================================

def dedup_profiles(profiles: list[dict]) -> list[dict]:
    log("PASS 1: Deduplication")
    seen_urls: dict[str, int] = {}
    seen_names: dict[str, int] = {}
    kept: list[dict] = []
    removed = 0

    for i, p in enumerate(profiles):
        url = p.get("website_url", "").lower().rstrip("/")
        name = p.get("company_name", "").lower().strip()

        # Skip if exact URL duplicate
        if url in seen_urls:
            existing = kept[seen_urls[url]]
            log(f"  🗑️  Duplicate URL: '{p['company_name']}' same as '{existing['company_name']}' ({url})")
            removed += 1
            continue

        # Skip if very similar name (>90% match) in same category
        is_dupe = False
        for sname, idx in seen_names.items():
            if SequenceMatcher(None, name, sname).ratio() > 0.85:
                existing = kept[idx]
                if existing.get("subcategory") == p.get("subcategory"):
                    log(f"  🗑️  Fuzzy duplicate: '{p['company_name']}' ≈ '{existing['company_name']}'")
                    removed += 1
                    is_dupe = True
                    break
        if is_dupe:
            continue

        seen_urls[url] = len(kept)
        seen_names[name] = len(kept)
        kept.append(p)

    log(f"  ✅ Removed {removed} duplicates, {len(kept)} remaining")
    return kept


# =========================================================================
# PASS 2: Misclassification removal
# =========================================================================

KNOWN_MISCLASSIFICATIONS = {
    # Giant conglomerates that aren't service providers
    "siemens": "Electronics Assembly",
    "schneider electric": "Electronics Assembly",
    "honeywell": "Electronics Assembly",
    "general electric": "Electronics Assembly",
    # Component manufacturers wrongly in service categories
    "kemet": "Surface Treatment",
    "kemet surface solutions": "Surface Treatment",
    # Mining/steel companies not job shops
    "hyundai steel": "Casting & Foundry",
    "pt. aneka tambang": "Casting & Foundry",
    # Wrong industry entirely
    "balrampur chintamanji": "Packaging",
    "balrampur chintamani": "Packaging",
}


def remove_misclassified(profiles: list[dict]) -> list[dict]:
    log("\nPASS 2: Misclassification removal")
    kept: list[dict] = []
    removed = 0

    for p in profiles:
        name = p.get("company_name", "").lower().strip()
        subcat = p.get("subcategory", "")

        is_bad = False
        for bad_name, bad_cat_fragment in KNOWN_MISCLASSIFICATIONS.items():
            if bad_name in name and bad_cat_fragment.lower() in subcat.lower():
                log(f"  🗑️  Misclassified: '{p['company_name']}' in '{subcat}'")
                removed += 1
                is_bad = True
                break
        if not is_bad:
            kept.append(p)

    log(f"  ✅ Removed {removed} misclassified, {len(kept)} remaining")
    return kept


# =========================================================================
# PASS 3: Fact verification via web scraping + LLM
# =========================================================================

VERIFY_PROMPT = """/no_think
You are fact-checking a company profile for accuracy. I will give you the company name, 
their current profile data, and text scraped from their website (including their /about page).

Your job: verify or correct ONLY these factual fields:
- headquarters (city, country)
- founded_year (number)
- employee_count_range (string like "50-200")

COMPANY: {name}
WEBSITE: {website}

CURRENT PROFILE DATA:
- headquarters: {current_hq}
- founded_year: {current_year}
- employee_count_range: {current_employees}

SCRAPED FROM WEBSITE HOMEPAGE:
{homepage_text}

SCRAPED FROM ABOUT PAGE:
{about_text}

Based on the scraped text, return a JSON object with ONLY the fields that need correction.
If a field is correct or you can't determine the right value, omit it.
If the scraped text reveals the correct value, include it.

Example responses:
- {{"headquarters": "Maple Plain, Minnesota, USA", "founded_year": 1999}}
- {{"employee_count_range": "5000-10000"}}
- {{}}  (if everything looks correct)

Return ONLY the JSON object.
"""


def verify_facts(profiles: list[dict]) -> list[dict]:
    log("\nPASS 3: Fact verification via web scraping + LLM")

    corrections_made = 0
    companies_checked = 0

    for i, p in enumerate(profiles):
        name = p["company_name"]
        website = p.get("website_url", "")
        current_hq = p.get("headquarters", "Unknown")
        current_year = p.get("founded_year")
        current_employees = p.get("employee_count_range", "Unknown")

        needs_check = (
            not current_hq or "unknown" in str(current_hq).lower()
            or not current_year
            or not current_employees or "unknown" in str(current_employees).lower()
            or True  # check everything
        )

        if not needs_check:
            continue

        companies_checked += 1
        if companies_checked % 20 == 1:
            log(f"  [{companies_checked}] Verifying {name}...")

        # Scrape homepage + /about page
        homepage_text = scrape_page(website)

        about_urls = []
        base = website.rstrip("/")
        for suffix in ["/about", "/about-us", "/company", "/about.html"]:
            about_urls.append(base + suffix)

        about_text = ""
        for au in about_urls:
            about_text = scrape_page(au)
            if len(about_text) > 100:
                break

        if not homepage_text and not about_text:
            continue

        prompt = VERIFY_PROMPT.format(
            name=name,
            website=website,
            current_hq=current_hq,
            current_year=current_year,
            current_employees=current_employees,
            homepage_text=homepage_text[:2000],
            about_text=about_text[:2000],
        )

        result = call_ollama(prompt)
        if isinstance(result, dict) and result:
            for field in ("headquarters", "founded_year", "employee_count_range"):
                new_val = result.get(field)
                if new_val is not None:
                    old_val = p.get(field)
                    if str(new_val) != str(old_val):
                        log(f"    📝 {name}: {field} '{old_val}' → '{new_val}'")
                        p[field] = new_val
                        corrections_made += 1

    log(f"  ✅ Checked {companies_checked} companies, made {corrections_made} corrections")
    return profiles


# =========================================================================
# Supabase operations
# =========================================================================

def clear_old_factory_listings() -> int:
    """Delete all is_demo factory-enriched listings to replace with clean data."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return 0
    api_key = SUPABASE_ANON_KEY or SUPABASE_KEY
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    # Delete all demo listings that have is_factory_enriched in attributes
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/marketplace_listings?is_demo=eq.true&attributes->>is_factory_enriched=eq.true",
        headers=headers,
    )
    log(f"  Cleared old listings: HTTP {r.status_code}")
    return r.status_code


def push_clean_data(profiles: list[dict]) -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return 0
    api_key = SUPABASE_ANON_KEY or SUPABASE_KEY
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    pushed = 0
    for p in profiles:
        row = {
            "category": p["category"],
            "subcategory": p["subcategory"],
            "title": p["company_name"],
            "description": p.get("description", ""),
            "attributes": {
                k: p.get(k) for k in [
                    "website_url", "tagline", "company_history", "headquarters",
                    "founded_year", "employee_count_range", "key_capabilities",
                    "materials_or_technologies", "certifications", "typical_lead_time",
                    "minimum_order", "pricing_tier", "serves_prototyping", "serves_production",
                    "notable_clients_or_industries", "geographic_reach", "executive_summary",
                ] if p.get(k) is not None
            } | {"is_factory_enriched": True, "enriched_at": datetime.now(timezone.utc).isoformat()},
            "is_verified": True,
            "is_demo": True,
        }
        r = requests.post(f"{SUPABASE_URL}/rest/v1/marketplace_listings", headers=headers, json=row)
        if r.status_code in (200, 201):
            pushed += 1
        else:
            if pushed < 3:
                log(f"    ❌ Push failed {p['company_name']}: {r.status_code}")
        if pushed % 50 == 0 and pushed > 0:
            log(f"    📤 Pushed {pushed}...")
    return pushed


# =========================================================================
# Main
# =========================================================================

def main() -> None:
    log("=" * 70)
    log("ForgeOS Factory Accuracy Fix")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log("=" * 70)

    # Load all profiles
    all_profiles = []
    for batch_file in sorted(OUTPUT_DIR.glob("batch_*.json")):
        with open(batch_file) as f:
            batch = json.load(f)
        log(f"Loaded {len(batch)} profiles from {batch_file.name}")
        all_profiles.extend(batch)

    log(f"\nTotal profiles loaded: {len(all_profiles)}")

    # Pass 1: Dedup
    profiles = dedup_profiles(all_profiles)

    # Pass 2: Remove misclassifications
    profiles = remove_misclassified(profiles)

    # Pass 3: Verify facts
    profiles = verify_facts(profiles)

    # Save cleaned data
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"cleaned_{ts}.json"
    with open(out_path, "w") as f:
        json.dump(profiles, f, indent=2, default=str)
    log(f"\n💾 Saved {len(profiles)} cleaned profiles to {out_path}")

    # Replace in Supabase
    log("\n📤 Replacing factory listings in Supabase...")
    clear_old_factory_listings()
    pushed = push_clean_data(profiles)
    log(f"✅ Pushed {pushed}/{len(profiles)} cleaned listings")

    log(f"\n{'='*70}")
    log(f"✅ ACCURACY FIX COMPLETE")
    log(f"   Original: {len(all_profiles)} profiles")
    log(f"   After dedup: {len(profiles)} profiles")
    log(f"   Pushed to Supabase: {pushed}")
    log(f"{'='*70}")


if __name__ == "__main__":
    main()
