#!/usr/bin/env python3
"""
ForgeOS Reviews & Ratings Generator
=====================================
Uses local Qwen to generate realistic user reviews and ratings for
marketplace listings, suppliers, and components.

Populates the reviews table with diverse, realistic feedback.

Usage:
    python3 scripts/generate-reviews.py
    python3 scripts/generate-reviews.py --dry-run
    python3 scripts/generate-reviews.py --model qwen3:14b

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLLAMA_HOST, OLLAMA_MODEL
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:32b")
OLLAMA_TIMEOUT = 1800
LLM_MAX_RETRIES = 3

# Load .env.local for Supabase credentials
_env_local = Path(__file__).parent.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip("'\"")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = Path("./generated_reviews")
LOG_FILE = Path("./reviews_generation_log.txt")

REVIEW_BATCHES = [
    {"entity_type": "supplier", "count": 40, "context": "Reviews of CNC machining and 3D printing services. Mix of 3-5 star reviews. Common themes: turnaround time, surface finish quality, communication, pricing accuracy, packaging. Reviewer roles: mechanical engineer, startup founder, hobbyist, procurement manager."},
    {"entity_type": "supplier", "count": 40, "context": "Reviews of electronic component distributors. Mix of ratings. Themes: shipping speed, stock accuracy, packaging quality, MOQ flexibility, technical support, returns process. Reviewers: electronics engineer, maker, production manager."},
    {"entity_type": "marketplace_person", "count": 30, "context": "Reviews of fractional engineers and executives hired through the platform. Themes: technical competence, communication, availability, deliverables quality, value for money, would hire again. Reviewers: startup CEO, CTO, project manager."},
    {"entity_type": "marketplace_service", "count": 30, "context": "Reviews of engineering consultancies and testing labs. Themes: report quality, turnaround time, expertise depth, responsiveness, pricing transparency, regulatory knowledge. Reviewers: quality manager, R&D lead, compliance officer."},
    {"entity_type": "component", "count": 50, "context": "Reviews of electronic components and mechanical parts. Themes: works as described, documentation quality, ease of integration, reliability, value vs competitors, shipping condition. Reviewers: embedded engineer, robotics hobbyist, student, professional."},
    {"entity_type": "blueprint", "count": 25, "context": "Reviews of blueprint templates (product development guides). Themes: completeness, accuracy of technical details, usefulness for planning, missing topics, helped avoid mistakes. Reviewers: first-time hardware founder, experienced engineer, student."},
    {"entity_type": "marketplace_product", "count": 35, "context": "Reviews of manufacturing companies and component suppliers on the marketplace. Themes: quote accuracy, delivery reliability, quality consistency, communication, flexibility with design changes. Reviewers: operations manager, design engineer, purchasing agent."},
    {"entity_type": "ai_tool", "count": 20, "context": "Reviews of AI tools for hardware development. Themes: accuracy, ease of use, integration with existing workflow, pricing fairness, support quality, time saved. Reviewers: CAD engineer, simulation specialist, project manager."},
]

GENERATION_PROMPT = """You are generating realistic user reviews for a hardware engineering marketplace. Generate exactly {count} reviews for "{entity_type}" listings.

CONTEXT:
{context}

For EACH review, provide:
{{
  "entity_type": "{entity_type}",
  "entity_name": "Name of the thing being reviewed",
  "reviewer_name": "Realistic full name",
  "reviewer_role": "Job title",
  "reviewer_company": "Company name or null for individuals",
  "rating": number (1-5, weighted toward 3-5 with occasional 1-2),
  "title": "Short review title (5-10 words)",
  "body": "Detailed review (2-4 sentences, specific and authentic)",
  "pros": ["specific pro 1", "specific pro 2"],
  "cons": ["specific con 1"],
  "verified_purchase": true/false,
  "helpful_count": number (0-25),
  "created_at": "2025-XX-XX" (random dates in 2025-2026)
}}

RULES:
1. Reviews must feel AUTHENTIC — not generic or promotional
2. Include specific details (part numbers, project types, timelines)
3. Rating distribution: ~10% 1-2 stars, ~25% 3 stars, ~40% 4 stars, ~25% 5 stars
4. Negative reviews should be constructive, not abusive
5. Vary writing styles: some brief, some detailed, some technical
6. Diverse reviewer names and backgrounds
7. Some reviews should mention specific use cases

Output ONLY the JSON array. Start with [ and end with ].

/no_think"""


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def generate_with_qwen(prompt: str, attempt: int = 1) -> list[dict] | None:
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": True,
               "options": {"temperature": 0.5, "num_predict": 8192}}
    try:
        label = f" (retry {attempt})" if attempt > 1 else ""
        log(f"    🤖 Streaming from {OLLAMA_MODEL}{label}...")
        start = time.time()
        resp = requests.post(url, json=payload, stream=True, timeout=OLLAMA_TIMEOUT)
        if resp.status_code != 200:
            log(f"    ❌ Ollama HTTP {resp.status_code}")
            return None
        full = ""
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                full += chunk.get("response", "")
                if chunk.get("done"):
                    break
        elapsed = time.time() - start
        log(f"    ⏱️  Response in {elapsed:.1f}s ({len(full)} chars)")
        cleaned = re.sub(r"<think>.*?</think>", "", full, flags=re.DOTALL).strip()
        if not cleaned:
            if attempt < LLM_MAX_RETRIES:
                time.sleep(5)
                return generate_with_qwen(prompt, attempt + 1)
            return None
        result = _parse_json_array(cleaned)
        if result is None and attempt < LLM_MAX_RETRIES:
            time.sleep(5)
            return generate_with_qwen(prompt, attempt + 1)
        return result
    except requests.RequestException as e:
        log(f"    ❌ Request failed: {e}")
        if attempt < LLM_MAX_RETRIES:
            time.sleep(10)
            return generate_with_qwen(prompt, attempt + 1)
        return None


def _parse_json_array(text: str) -> list[dict] | None:
    """Parse a JSON array from LLM output with multiple fallback strategies."""
    # Strip think tags, code fences, and common wrappers
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    cleaned = re.sub(r"```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)

    # Strategy 1: Direct parse
    try:
        r = json.loads(cleaned)
        if isinstance(r, list):
            return r
    except json.JSONDecodeError:
        pass

    # Strategy 2: Bracket-matching to find outermost [ ... ]
    depth = 0
    start = None
    for i, ch in enumerate(cleaned):
        if ch == "[":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = cleaned[start:i + 1]
                candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
                try:
                    r = json.loads(candidate)
                    if isinstance(r, list):
                        return r
                except json.JSONDecodeError:
                    try:
                        r = json.loads(candidate.replace("'", '"'))
                        if isinstance(r, list):
                            return r
                    except json.JSONDecodeError:
                        start = None

    # Strategy 3: Recover individual JSON objects as last resort
    objects = []
    for m in re.finditer(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", cleaned):
        try:
            obj = json.loads(re.sub(r",\s*([}\]])", r"\1", m.group()))
            if isinstance(obj, dict):
                objects.append(obj)
        except json.JSONDecodeError:
            continue
    if objects:
        log(f"    ⚠️  Recovered {len(objects)} objects from malformed JSON")
        return objects

    log(f"    ❌ Could not parse JSON array ({len(cleaned)} chars)")
    return None


def push_to_supabase(records: list[dict]) -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("  ⚠️  No Supabase credentials — skipping push")
        return 0
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    url = f"{SUPABASE_URL}/rest/v1/entity_reviews"
    pushed = 0
    for i in range(0, len(records), 50):
        batch = records[i:i+50]
        resp = requests.post(url, json=batch, headers=headers)
        if resp.status_code in (200, 201):
            pushed += len(batch)
        else:
            log(f"  ❌ Supabase push failed: {resp.status_code} {resp.text[:200]}")
    return pushed


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate reviews and ratings")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--model", type=str, default=None)
    parser.add_argument("--push-only", type=str, default=None)
    args = parser.parse_args()

    global OLLAMA_MODEL
    if args.model:
        OLLAMA_MODEL = args.model

    OUTPUT_DIR.mkdir(exist_ok=True)
    log("=" * 60)
    log("ForgeOS Reviews & Ratings Generator")
    log(f"Model: {OLLAMA_MODEL}")
    log("=" * 60)

    if args.push_only:
        with open(args.push_only) as f:
            records = json.load(f)
        pushed = push_to_supabase(records)
        log(f"✅ Pushed {pushed} reviews")
        return

    all_records = []
    total_batches = len(REVIEW_BATCHES)

    for i, batch in enumerate(REVIEW_BATCHES, 1):
        log(f"\n[{i}/{total_batches}] ⭐ Generating reviews: {batch['entity_type']} ({batch['count']} reviews)")
        prompt = GENERATION_PROMPT.format(**batch)
        results = generate_with_qwen(prompt)
        if results:
            valid = [r for r in results if "rating" in r and "body" in r]
            log(f"  ✅ {len(valid)}/{len(results)} valid reviews")
            all_records.extend(valid)
        else:
            log(f"  ❌ Failed to generate reviews for {batch['entity_type']}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = OUTPUT_DIR / f"batch_{ts}.json"
    with open(out_file, "w") as f:
        json.dump(all_records, f, indent=2)
    log(f"\n💾 Saved {len(all_records)} reviews to {out_file}")

    if not args.dry_run:
        pushed = push_to_supabase(all_records)
        log(f"📤 Pushed {pushed} reviews to Supabase")

    log(f"\n{'='*60}")
    log(f"⭐ Review generation complete! {len(all_records)} reviews")
    log(f"{'='*60}")


if __name__ == "__main__":
    main()
