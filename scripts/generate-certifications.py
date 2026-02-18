#!/usr/bin/env python3
"""
ForgeOS Certification & Compliance Data Generator
===================================================
Uses local Qwen to generate certification, compliance, and regulatory
data for components in the catalogue.

Populates the component_certifications table.

Usage:
    python3 scripts/generate-certifications.py
    python3 scripts/generate-certifications.py --dry-run
    python3 scripts/generate-certifications.py --model qwen3:14b

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

_env_local = Path(__file__).parent.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip("'\"")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:32b")
OLLAMA_TIMEOUT = 1800
LLM_MAX_RETRIES = 3

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = Path("./generated_certifications")
LOG_FILE = Path("./certifications_generation_log.txt")

CERT_BATCHES = [
    {"category": "Single Board Computers", "count": 20, "context": "SBCs like Raspberry Pi, Jetson, Arduino. Certifications: FCC Part 15, CE (RED), UKCA, RoHS, REACH, UL/IEC 62368-1. Include EMC test reports, safety certifications, and export control (EAR)."},
    {"category": "Brushless Motors", "count": 25, "context": "BLDC motors for drones and robotics. Certifications: CE, RoHS, REACH. IP ratings (IP20-IP67). UL recognition. Vibration and shock ratings (MIL-STD-810). Temperature ratings."},
    {"category": "Battery Cells & Packs", "count": 20, "context": "LiPo, Li-ion, LiFePO4 batteries. Certifications: UN38.3 (transport), IEC 62133 (safety), UL 2054, CE, KC mark. Shipping classifications (DG Class 9). MSDS requirements."},
    {"category": "Power Supplies & Converters", "count": 20, "context": "DC-DC converters, AC-DC power supplies. Certifications: UL/cUL 62368-1, CE (LVD + EMC), FCC Part 15 Class B, Energy Star, CoC Tier 2, medical (IEC 60601) for medical-grade."},
    {"category": "Sensors", "count": 25, "context": "IMU, environmental, distance sensors. Certifications: RoHS, REACH, AEC-Q100 (automotive), IATF 16949 (automotive quality). Calibration certificates. NIST traceability for measurement sensors."},
    {"category": "Connectors", "count": 20, "context": "JST, Molex, XT60, industrial connectors. Certifications: UL recognition, IP ratings, salt spray testing (hours), contact resistance, mating cycles, current derating curves. MIL-DTL specs for military-grade."},
    {"category": "Wireless Modules", "count": 20, "context": "WiFi, BLE, LoRa, Zigbee, cellular modules. Certifications: FCC ID, CE RED, IC (Canada), TELEC (Japan), NCC (Taiwan), Bluetooth SIG, Wi-Fi Alliance. SAR testing for body-worn. Antenna gain limits."},
    {"category": "Mechanical Components", "count": 20, "context": "Bearings, linear rails, extrusions. Certifications: ISO 9001 manufacturing, material certifications (mill certs), hardness testing (HRC), surface finish (Ra), dimensional tolerance (ISO 2768). ABEC ratings for bearings."},
    {"category": "Displays", "count": 15, "context": "OLED, LCD, LED displays. Certifications: RoHS, REACH, FCC (if active), CE, UKCA. Optical certifications: luminance, color gamut, viewing angle. Touch panel certifications. Blue light emission (IEC 62471)."},
    {"category": "PCB Materials & Boards", "count": 15, "context": "FR4, Rogers, flex PCB materials. Certifications: UL 94 V-0 flammability, IPC-A-600 (acceptability), IPC-6012 (qualification), CTI rating, Tg rating, Dk/Df specs. Lead-free process compatibility (J-STD-020)."},
]

GENERATION_PROMPT = """You are a regulatory compliance expert for hardware products. Generate exactly {count} certification/compliance entries for "{category}" components.

CONTEXT:
{context}

For EACH component, provide:
{{
  "component_name": "Exact product name",
  "manufacturer": "Brand name",
  "certifications": [
    {{
      "standard": "e.g. CE, FCC, UL, RoHS",
      "certificate_number": "realistic cert number or null",
      "status": "active" | "pending" | "expired",
      "issued_date": "YYYY-MM",
      "expiry_date": "YYYY-MM or null",
      "testing_lab": "lab name",
      "scope": "brief description of what's covered"
    }}
  ],
  "compliance_summary": {{
    "rohs_compliant": true/false,
    "reach_compliant": true/false,
    "ip_rating": "IPxx or null",
    "operating_temp_min_c": number,
    "operating_temp_max_c": number,
    "storage_temp_min_c": number,
    "storage_temp_max_c": number,
    "humidity_range": "X-Y% RH",
    "altitude_max_m": number or null,
    "shock_rating": "description or null",
    "vibration_rating": "description or null"
  }},
  "export_control": {{
    "eccn": "EAR classification or EAR99",
    "hts_code": "harmonized tariff code",
    "country_restrictions": []
  }},
  "material_declarations": ["lead-free", "halogen-free", etc.],
  "regulatory_notes": "any important notes for product designers"
}}

RULES:
1. Use REAL standards and realistic certification numbers
2. Testing labs should be real (TUV, UL, Intertek, SGS, etc.)
3. Temperature ranges should be realistic for the component type
4. Export control should reflect actual EAR classifications
5. Include both mandatory (CE, FCC) and voluntary (UL) certifications

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
               "options": {"temperature": 0.3, "num_predict": 8192}}
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


# PostgREST requires every row in a batch to have identical keys (PGRST102).
SCHEMA_KEYS = [
    "component_name",
    "manufacturer",
    "certifications",
    "compliance_summary",
    "export_control",
    "material_declarations",
    "regulatory_notes",
]


def normalize_record(r: dict) -> dict:
    """Ensure record has exactly SCHEMA_KEYS so batch POST succeeds."""
    out = {k: r.get(k) for k in SCHEMA_KEYS}
    if out["certifications"] is None:
        out["certifications"] = []
    if out["material_declarations"] is None:
        out["material_declarations"] = []
    return out


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
    url = f"{SUPABASE_URL}/rest/v1/component_certifications"
    pushed = 0
    for i in range(0, len(records), 50):
        batch = [normalize_record(r) for r in records[i : i + 50]]
        resp = requests.post(url, json=batch, headers=headers, timeout=30)
        if resp.status_code in (200, 201):
            pushed += len(batch)
        elif resp.status_code == 409:
            # Duplicate key; insert one-by-one and skip duplicates
            for row in batch:
                r = requests.post(url, json=row, headers=headers, timeout=15)
                if r.status_code in (200, 201):
                    pushed += 1
        else:
            log(f"  ❌ Supabase push failed: {resp.status_code} {resp.text[:200]}")
    return pushed


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate certification data")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip categories already present in the latest batch file in generated_certifications/",
    )
    parser.add_argument("--model", type=str, default=None)
    parser.add_argument(
        "--push-only",
        type=str,
        default=None,
        metavar="PATH",
        help="Push existing JSON file to Supabase (no generation)",
    )
    args = parser.parse_args()

    global OLLAMA_MODEL
    if args.model:
        OLLAMA_MODEL = args.model

    OUTPUT_DIR.mkdir(exist_ok=True)
    log("=" * 60)
    log("ForgeOS Certification & Compliance Generator")
    log(f"Model: {OLLAMA_MODEL}")
    log("=" * 60)

    if args.push_only:
        with open(args.push_only) as f:
            records = json.load(f)
        pushed = push_to_supabase(records)
        log(f"✅ Pushed {pushed} certification records")
        return

    batches_to_run = CERT_BATCHES
    if args.resume:
        batch_files = sorted(OUTPUT_DIR.glob("batch_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if batch_files:
            with open(batch_files[0]) as f:
                existing = json.load(f)
            done_categories = {r.get("category") for r in existing if isinstance(r, dict) and r.get("category")}
            if done_categories:
                batches_to_run = [b for b in CERT_BATCHES if b["category"] not in done_categories]
                log(f"🔄 Resume: skipping {len(done_categories)} categories already in {batch_files[0].name}")
        if not batches_to_run:
            log("✅ No categories left to generate (resume).")
            return

    all_records = []
    total_batches = len(batches_to_run)

    for i, batch in enumerate(batches_to_run, 1):
        log(f"\n[{i}/{total_batches}] 📋 Generating certifications: {batch['category']} ({batch['count']} items)")
        prompt = GENERATION_PROMPT.format(**batch)
        results = generate_with_qwen(prompt)
        if results:
            valid = [r for r in results if "component_name" in r and "certifications" in r]
            for r in valid:
                r["category"] = batch["category"]
            log(f"  ✅ {len(valid)}/{len(results)} valid certification entries")
            all_records.extend(valid)
        else:
            log(f"  ❌ Failed to generate certifications for {batch['category']}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = OUTPUT_DIR / f"batch_{ts}.json"
    with open(out_file, "w") as f:
        json.dump(all_records, f, indent=2)
    log(f"\n💾 Saved {len(all_records)} certification records to {out_file}")

    if not args.dry_run:
        pushed = push_to_supabase(all_records)
        log(f"📤 Pushed {pushed} records to Supabase")

    log(f"\n{'='*60}")
    log(f"📋 Certification generation complete! {len(all_records)} records")
    log(f"{'='*60}")


if __name__ == "__main__":
    main()
