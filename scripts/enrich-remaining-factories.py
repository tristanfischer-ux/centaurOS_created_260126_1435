#!/usr/bin/env python3
"""
Enrich remaining ~80 factory profiles that weren't in the first batch.
Reads from discovery_remaining.json, enriches, pushes to Supabase.
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
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
LOG_FILE = Path("./factory_remaining_log.txt")
OUTPUT_DIR = Path("./generated_factories")

CAT_LOOKUP = {
    "PCB Manufacturing": "Products", "CNC Machining": "Products",
    "3D Printing": "Products", "Injection Molding": "Products",
    "Sheet Metal Fabrication": "Products", "Electronics Assembly": "Products",
    "Component Distribution": "Products", "Casting & Foundry": "Products",
    "Surface Treatment & Finishing": "Products", "Rubber & Silicone Molding": "Products",
    "Wire Harness & Cable Assembly": "Products", "Industrial Design": "Services",
    "Mechanical Engineering": "Services", "Testing & Certification": "Services",
    "Packaging Design & Manufacturing": "Services",
}

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
  "tagline": "One-line description (max 15 words)",
  "description": "2-3 paragraph description of the company and capabilities.",
  "company_history": "Brief history — when founded, key milestones. 2-3 sentences.",
  "headquarters": "City, Country",
  "founded_year": number or null,
  "employee_count_range": "e.g. 50-200, 1000-5000",
  "key_capabilities": ["capability 1", "capability 2", ...],
  "materials_or_technologies": ["material 1", "tech 2", ...],
  "certifications": ["ISO 9001", etc.] or [],
  "typical_lead_time": "e.g. 2-5 days, 1-2 weeks",
  "minimum_order": "e.g. 1 piece" or null,
  "pricing_tier": "budget" | "mid-range" | "premium",
  "serves_prototyping": true/false,
  "serves_production": true/false,
  "notable_clients_or_industries": ["industry 1", "industry 2"],
  "geographic_reach": "e.g. Global, North America",
  "executive_summary": "2-sentence summary for hardware startup founders."
}}

Return ONLY the JSON object.
"""


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


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def scrape(url, max_chars=3000):
    try:
        r = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html"}, timeout=15, allow_redirects=True)
        if r.status_code != 200:
            return f"[HTTP {r.status_code}]"
        ext = HTMLTextExtractor()
        ext.feed(r.text)
        return ext.get_text()[:max_chars]
    except Exception as e:
        return f"[Error: {e}]"


def generate(prompt, attempt=1):
    try:
        log(f"      🤖 Streaming ({attempt}/3)...")
        start = time.time()
        r = requests.post(f"{OLLAMA_HOST}/api/generate", json={
            "model": OLLAMA_MODEL, "prompt": prompt, "stream": True,
            "options": {"temperature": 0.4, "num_predict": 2048, "num_ctx": 8192}
        }, stream=True, timeout=1800)
        if r.status_code != 200: return None
        full = ""
        for line in r.iter_lines():
            if line:
                c = json.loads(line)
                full += c.get("response", "")
                if c.get("done"): break
        log(f"      ⏱️  {time.time()-start:.1f}s ({len(full)} chars)")
        cleaned = re.sub(r"<think>[\s\S]*?</think>", "", full).strip()
        cleaned = re.sub(r"```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"```\s*$", "", cleaned).strip()
        cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
        try:
            return json.loads(cleaned)
        except:
            s = cleaned.find("{")
            if s == -1: return None
            d = 0
            for i in range(s, len(cleaned)):
                if cleaned[i] == "{": d += 1
                elif cleaned[i] == "}":
                    d -= 1
                    if d == 0:
                        try: return json.loads(re.sub(r",\s*([}\]])", r"\1", cleaned[s:i+1]))
                        except: break
        if attempt < 3:
            time.sleep(5)
            return generate(prompt, attempt + 1)
        return None
    except Exception as e:
        log(f"      ❌ {e}")
        if attempt < 3:
            time.sleep(10)
            return generate(prompt, attempt + 1)
        return None


def push(profiles):
    if not SUPABASE_URL or not SUPABASE_KEY: return 0
    api_key = SUPABASE_ANON_KEY or SUPABASE_KEY
    headers = {"apikey": api_key, "Authorization": f"Bearer {SUPABASE_KEY}",
               "Content-Type": "application/json", "Prefer": "return=minimal"}
    pushed = 0
    for p in profiles:
        row = {
            "category": p["category"], "subcategory": p["subcategory"],
            "title": p["company_name"], "description": p.get("description", ""),
            "attributes": {
                k: p.get(k) for k in [
                    "website_url", "tagline", "company_history", "headquarters",
                    "founded_year", "employee_count_range", "key_capabilities",
                    "materials_or_technologies", "certifications", "typical_lead_time",
                    "minimum_order", "pricing_tier", "serves_prototyping", "serves_production",
                    "notable_clients_or_industries", "geographic_reach", "executive_summary",
                ] if p.get(k) is not None
            } | {"is_factory_enriched": True, "enriched_at": datetime.now(timezone.utc).isoformat()},
            "is_verified": True, "is_demo": True,
        }
        r = requests.post(f"{SUPABASE_URL}/rest/v1/marketplace_listings", headers=headers, json=row)
        if r.status_code in (200, 201): pushed += 1
        else: log(f"    ❌ Push {p.get('company_name','?')}: {r.status_code}")
    return pushed


def main():
    remaining_file = OUTPUT_DIR / "discovery_remaining.json"
    with open(remaining_file) as f:
        remaining = json.load(f)

    total = sum(len(v) for v in remaining.values())
    log(f"Enriching {total} remaining companies across {len(remaining)} categories")

    profiles = []
    idx = 0
    for subcat, companies in remaining.items():
        category = CAT_LOOKUP.get(subcat, "Products")
        log(f"\n  🏭 {subcat} ({len(companies)} companies)")
        for company in companies:
            idx += 1
            name, website = company["name"], company["website"]
            log(f"\n    [{idx}/{total}] {name}")
            log(f"      🌐 Scraping {website}...")
            scraped = scrape(website)
            prompt = ENRICHMENT_PROMPT.format(name=name, website=website, subcategory=subcat, scraped_text=scraped)
            profile = generate(prompt)
            if isinstance(profile, dict):
                profile["category"] = category
                profile["subcategory"] = subcat
                profile.setdefault("company_name", name)
                profile.setdefault("website_url", website)
                profiles.append(profile)
                log(f"      ✅ {name} — {profile.get('tagline','—')}")
            else:
                log(f"      ❌ Skipped {name}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = OUTPUT_DIR / f"batch_remaining_{ts}.json"
    with open(out, "w") as f:
        json.dump(profiles, f, indent=2, default=str)
    log(f"\n💾 Saved {len(profiles)} to {out}")

    pushed = push(profiles)
    log(f"✅ Pushed {pushed}/{len(profiles)} to Supabase")
    log(f"\n✅ COMPLETE — {len(profiles)}/{total} remaining factories enriched")


if __name__ == "__main__":
    main()
