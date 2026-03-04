#!/usr/bin/env python3
"""
ForgeOS Factory Data — Dedup + Gap Fill
========================================
Step 1: Remove duplicate factory listings, keeping the most recently enriched
        version of each company (identified by website_url).
Step 2: Fill remaining gaps (missing HQ, founding year, employee count) by
        scraping company websites and using qwen3:14b for extraction.

Usage:
    python3 scripts/factory-dedup-and-fill.py
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
LOG_FILE = Path(__file__).parent / "factory_dedup_fill_log.txt"


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


def sb_headers(extra: dict | None = None) -> dict:
    h = {
        "apikey": SUPABASE_ANON or SUPABASE_JWT,
        "Authorization": f"Bearer {SUPABASE_JWT}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def fetch_all_factory_listings() -> list[dict]:
    """Fetch all is_demo=true factory-enriched listings."""
    all_rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/marketplace_listings"
            f"?is_demo=eq.true&select=id,title,created_at,attributes"
            f"&limit=200&offset={offset}",
            headers=sb_headers(),
        )
        if r.status_code != 200:
            break
        batch = r.json()
        all_rows.extend(batch)
        if len(batch) < 200:
            break
        offset += 200

    # Keep only factory-enriched rows
    factory = []
    for row in all_rows:
        attrs = row.get("attributes", {})
        if isinstance(attrs, str):
            try:
                attrs = json.loads(attrs)
            except Exception:
                continue
            if attrs.get("is_factory_enriched"):
                row["_attrs"] = attrs
                factory.append(row)
        elif isinstance(attrs, dict) and attrs.get("is_factory_enriched"):
            row["_attrs"] = attrs
            factory.append(row)

    return factory


# =========================================================================
# STEP 1: Deduplication
# =========================================================================

def dedup_listings(listings: list[dict]) -> tuple[list[dict], list[str]]:
    """
    Group by website_url, keep the entry with the best data (most filled fields),
    return (keep_list, delete_ids).
    """
    by_url: dict[str, list[dict]] = {}
    no_url: list[dict] = []

    for row in listings:
        attrs = row["_attrs"]
        url = attrs.get("website_url", "").lower().rstrip("/")
        if url:
            by_url.setdefault(url, []).append(row)
        else:
            no_url.append(row)

    keep = []
    delete_ids = []

    for url, rows in by_url.items():
        if len(rows) == 1:
            keep.append(rows[0])
            continue

        # Score each row by how many key fields are non-null/non-unknown
        def score(row: dict) -> int:
            a = row["_attrs"]
            s = 0
            for field in ("headquarters", "founded_year", "employee_count_range",
                          "tagline", "company_history", "key_capabilities"):
                v = a.get(field)
                if v and "unknown" not in str(v).lower():
                    s += 1
            return s

        rows_sorted = sorted(rows, key=score, reverse=True)
        keep.append(rows_sorted[0])
        for stale in rows_sorted[1:]:
            delete_ids.append(stale["id"])

    keep.extend(no_url)
    return keep, delete_ids


def delete_rows(ids: list[str]) -> int:
    deleted = 0
    for row_id in ids:
        r = requests.delete(
            f"{SUPABASE_URL}/rest/v1/marketplace_listings?id=eq.{row_id}",
            headers=sb_headers({"Prefer": "return=minimal"}),
        )
        if r.status_code in (200, 204):
            deleted += 1
    return deleted


# =========================================================================
# STEP 2: Gap filling
# =========================================================================

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
    chunks = []
    base = website.rstrip("/")
    for url in [base, f"{base}/about", f"{base}/about-us", f"{base}/company", f"{base}/our-story"]:
        text = scrape(url)
        if text:
            chunks.append(text)
        if sum(len(c) for c in chunks) > 5000:
            break
    # Wikipedia fallback
    if sum(len(c) for c in chunks) < 500:
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
                            return json.loads(re.sub(r",\s*([}\]])", r"\1", cleaned[s: i + 1]))
                        except json.JSONDecodeError:
                            break
        return None
    except Exception:
        return None


EXTRACT_PROMPT = """/no_think
You are extracting factual data about a manufacturing company.

COMPANY: {name}
WEBSITE: {website}

TEXT FROM WEBSITE / WIKIPEDIA:
{text}

Find these MISSING fields. Only include what you can confirm from the text above:
{missing_fields}

- headquarters: "City, Country" format (e.g. "Shenzhen, China" or "Austin, Texas, USA")
- founded_year: integer (e.g. 1998)
- employee_count_range: "X-Y" or "X+" format (e.g. "200-500", "10000+")

Return ONLY a JSON object with the fields you found. If you cannot find a value, omit that field.
Return {{}} if you cannot find anything.
"""


def fill_gaps(listings: list[dict]) -> int:
    corrected = 0
    needs_fill = []

    for row in listings:
        attrs = row["_attrs"]
        hq = attrs.get("headquarters", "")
        yr = attrs.get("founded_year")
        emp = attrs.get("employee_count_range", "")

        missing = []
        if not hq or any(x in str(hq).lower() for x in ["unknown", "city,", "n/a", "tbd", "city country", "country"]):
            missing.append("headquarters")
        if not yr:
            missing.append("founded_year")
        if not emp or any(x in str(emp).lower() for x in ["unknown", "n/a", "tbd"]):
            missing.append("employee_count_range")

        if missing:
            needs_fill.append((row, missing))

    log(f"\n🔍 {len(needs_fill)} listings need gap-filling")
    for field in ("headquarters", "founded_year", "employee_count_range"):
        count = sum(1 for _, m in needs_fill if field in m)
        log(f"   {field}: {count} missing")

    for i, (row, missing) in enumerate(needs_fill):
        name = row["title"]
        attrs = row["_attrs"]
        website = attrs.get("website_url", "")

        if i % 20 == 0:
            log(f"\n  [{i + 1}/{len(needs_fill)}] {name}")

        if not website or "example.com" in website:
            continue

        text = gather_text(name, website)
        if not text:
            continue

        prompt = EXTRACT_PROMPT.format(
            name=name,
            website=website,
            text=text[:5000],
            missing_fields="\n".join(f"- {f}" for f in missing),
        )

        result = call_ollama(prompt)
        if not isinstance(result, dict) or not result:
            continue

        updates = {k: v for k, v in result.items() if k in missing and v}
        if not updates:
            continue

        for field, value in updates.items():
            log(f"    ✏️  {name}: {field} → '{value}'")
            attrs[field] = value

        # PATCH back to Supabase with proper JSON object (not string)
        h = sb_headers({"Prefer": "return=minimal"})
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/marketplace_listings?id=eq.{row['id']}",
            headers=h,
            json={"attributes": attrs},
        )
        if r.status_code in (200, 204):
            corrected += 1
        else:
            log(f"    ❌ PATCH failed {name}: HTTP {r.status_code}")

    return corrected


# =========================================================================
# Main
# =========================================================================

def main() -> None:
    log("=" * 70)
    log("ForgeOS Factory Data — Dedup + Gap Fill")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log("=" * 70)

    log("\n📋 Fetching all factory listings from Supabase...")
    all_listings = fetch_all_factory_listings()
    log(f"   Found {len(all_listings)} factory-enriched rows")

    # Step 1: Dedup
    log("\n🗑️  STEP 1: Deduplication")
    keep, delete_ids = dedup_listings(all_listings)
    log(f"   Keeping: {len(keep)}")
    log(f"   Deleting: {len(delete_ids)} duplicates")

    if delete_ids:
        deleted = delete_rows(delete_ids)
        log(f"   ✅ Deleted {deleted} duplicate rows")

    # Step 2: Fill gaps
    log("\n✏️  STEP 2: Gap filling via web scraping + LLM")
    corrected = fill_gaps(keep)

    log(f"\n{'=' * 70}")
    log(f"✅ COMPLETE")
    log(f"   Factory listings after dedup: {len(keep)}")
    log(f"   Duplicates removed: {len(delete_ids)}")
    log(f"   Gaps filled: {corrected}")
    log(f"{'=' * 70}")


if __name__ == "__main__":
    main()
