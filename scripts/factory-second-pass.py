#!/usr/bin/env python3
"""
ForgeOS Factory Data — Second Pass Gap Filler
==============================================
Queries Supabase for factory listings that still have missing/unknown values
for headquarters, founding year, or employee count, then:
  1. Tries harder scraping: homepage, /about, /company, /contact, Wikipedia
  2. Uses qwen3:14b to extract the specific missing fields
  3. PATCHes only the corrected fields back to Supabase

Usage:
    python3 scripts/factory-second-pass.py
"""

import json
import os
import re
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

import requests

_env = Path(__file__).parent.parent / ".env.local"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() not in os.environ:
            os.environ[k.strip()] = v.strip().strip("'\"")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_JWT = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:14b")
LOG_FILE = Path(__file__).parent / "factory_second_pass_log.txt"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._text, self._skip = [], False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg", "iframe"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg", "iframe"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip and data.strip():
            self._text.append(data.strip())

    def get_text(self):
        return " ".join(self._text)


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        print(line, flush=True)
    except (BrokenPipeError, OSError):
        pass
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def scrape(url: str, max_chars: int = 3000) -> str:
    try:
        r = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
            timeout=12,
            allow_redirects=True,
        )
        if r.status_code != 200:
            return ""
        ext = TextExtractor()
        ext.feed(r.text)
        return ext.get_text()[:max_chars]
    except Exception:
        return ""


def gather_text(name: str, website: str) -> str:
    """Try several pages and Wikipedia to collect company facts."""
    chunks = []
    base = website.rstrip("/")

    # Primary pages
    for url in [base, f"{base}/about", f"{base}/about-us", f"{base}/company", f"{base}/our-story"]:
        text = scrape(url)
        if text:
            chunks.append(text)
        if len(" ".join(chunks)) > 5000:
            break

    # Wikipedia fallback
    if len(" ".join(chunks)) < 500:
        safe = re.sub(r"[^\w\s]", "", name).strip().replace(" ", "_")
        wiki = scrape(f"https://en.wikipedia.org/wiki/{safe}", max_chars=2000)
        if wiki:
            chunks.append(wiki)

    return " ".join(chunks)[:6000]


def call_ollama(prompt: str) -> dict | None:
    try:
        r = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": True,
                "options": {"temperature": 0.1, "num_predict": 512, "num_ctx": 8192},
            },
            stream=True,
            timeout=300,
        )
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
                            return json.loads(re.sub(r",\s*([}\]])", r"\1", cleaned[s : i + 1]))
                        except json.JSONDecodeError:
                            break
        return None
    except Exception:
        return None


EXTRACT_PROMPT = """/no_think
You are extracting factual data about a company for a manufacturing marketplace.

COMPANY: {name}
WEBSITE: {website}

TEXT FROM WEBSITE / WIKIPEDIA:
{text}

MISSING FIELDS TO FILL (only fill what you can confirm from the text above):
{missing_fields}

Rules:
- Only extract values you can actually see in the text. Do not guess.
- headquarters: city + country format (e.g. "Shenzhen, China" or "Austin, Texas, USA")
- founded_year: integer (e.g. 1998)
- employee_count_range: string like "10-50", "200-500", "1000+", "5000-10000"

Return a JSON object with only the fields you found. If you can't find a value, omit the field entirely.
Example: {{"headquarters": "Munich, Germany", "founded_year": 1987}}

Return ONLY the JSON object.
"""


def sb_headers() -> dict:
    return {
        "apikey": SUPABASE_ANON or SUPABASE_JWT,
        "Authorization": f"Bearer {SUPABASE_JWT}",
        "Content-Type": "application/json",
    }


def fetch_listings_with_gaps() -> list[dict]:
    """Fetch all factory-enriched listings that have at least one gap.

    Attributes are stored as stringified JSON, so we fetch all is_demo rows,
    parse the string, and filter in Python.
    """
    all_listings = []
    offset = 0
    page = 200
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/marketplace_listings"
            f"?is_demo=eq.true&select=id,title,attributes"
            f"&limit={page}&offset={offset}",
            headers=sb_headers(),
        )
        if r.status_code != 200:
            log(f"  ❌ Fetch failed: HTTP {r.status_code}")
            break
        batch = r.json()
        all_listings.extend(batch)
        if len(batch) < page:
            break
        offset += page

    gaps = []
    for row in all_listings:
        attrs = row.get("attributes", {})
        if isinstance(attrs, str):
            try:
                attrs = json.loads(attrs)
            except (json.JSONDecodeError, TypeError):
                continue

        # Only process factory-enriched listings
        if not attrs.get("is_factory_enriched"):
            continue

        hq = attrs.get("headquarters", "")
        yr = attrs.get("founded_year")
        emp = attrs.get("employee_count_range", "")

        missing = []
        if not hq or any(x in str(hq).lower() for x in ["unknown", "city,", "n/a", "tbd", "city country"]):
            missing.append("headquarters")
        if not yr:
            missing.append("founded_year")
        if not emp or any(x in str(emp).lower() for x in ["unknown", "n/a", "tbd"]):
            missing.append("employee_count_range")

        if missing:
            gaps.append({
                "id": row["id"],
                "name": row["title"],
                "website": attrs.get("website_url", ""),
                "missing": missing,
                "attrs": attrs,
            })

    return gaps


def patch_listing(listing_id: str, updates: dict[str, object], current_attrs: dict) -> bool:
    """PATCH the attributes JSONB for a single listing."""
    attrs = dict(current_attrs)
    attrs.update(updates)

    h = sb_headers()
    h["Prefer"] = "return=minimal"
    # Send as proper JSON object (not double-encoded string) so JSONB stores correctly
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/marketplace_listings?id=eq.{listing_id}",
        headers=h,
        json={"attributes": attrs},
    )
    return r.status_code in (200, 204)


def main() -> None:
    log("=" * 70)
    log("ForgeOS Factory Second Pass — Gap Filler")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log("=" * 70)

    log("\n📋 Fetching listings with gaps from Supabase...")
    gaps = fetch_listings_with_gaps()
    log(f"   Found {len(gaps)} listings with at least one missing field")

    if not gaps:
        log("✅ No gaps found — data is complete!")
        return

    # Count by field
    missing_counts = {}
    for g in gaps:
        for f in g["missing"]:
            missing_counts[f] = missing_counts.get(f, 0) + 1
    for field, count in sorted(missing_counts.items(), key=lambda x: -x[1]):
        log(f"   {field}: {count} missing")

    log(f"\n🔍 Starting verification loop...")
    corrected = 0
    checked = 0

    for i, listing in enumerate(gaps):
        name = listing["name"]
        website = listing["website"]
        missing = listing["missing"]
        checked += 1

        if checked % 20 == 1:
            log(f"\n  [{checked}/{len(gaps)}] {name}")
            log(f"    Missing: {', '.join(missing)}")

        if not website or website == "https://www.example.com":
            continue

        text = gather_text(name, website)
        if not text:
            continue

        missing_desc = "\n".join(f"- {f}" for f in missing)
        prompt = EXTRACT_PROMPT.format(
            name=name,
            website=website,
            text=text[:5000],
            missing_fields=missing_desc,
        )

        result = call_ollama(prompt)
        if not isinstance(result, dict) or not result:
            continue

        # Filter to only fields that were actually missing
        updates = {k: v for k, v in result.items() if k in missing and v}
        if not updates:
            continue

        for field, value in updates.items():
            log(f"    ✏️  {name}: {field} → '{value}'")

        if patch_listing(listing["id"], updates, listing["attrs"]):
            corrected += 1
        else:
            log(f"    ❌ Patch failed for {name}")

    log(f"\n{'='*70}")
    log(f"✅ SECOND PASS COMPLETE")
    log(f"   Checked: {checked} listings")
    log(f"   Corrected: {corrected} listings")
    log(f"{'='*70}")


if __name__ == "__main__":
    main()
