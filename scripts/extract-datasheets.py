#!/usr/bin/env python3
"""
ForgeOS Datasheet Extraction Pipeline
=======================================
Reads downloaded PDF datasheets and extracts structured mechanical
dimensions, electrical specs, pinouts, and tolerances using Qwen.

Enriches the component_catalogue with precise specs from official datasheets.

Usage:
    python3 scripts/extract-datasheets.py
    python3 scripts/extract-datasheets.py --dir ./datasheets
    python3 scripts/extract-datasheets.py --dry-run
    python3 scripts/extract-datasheets.py --model qwen3:14b

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLLAMA_HOST, OLLAMA_MODEL
"""

import argparse
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import requests

try:
    import fitz  # PyMuPDF — best PDF text extraction
except ImportError:
    fitz = None

# Load .env.local for Supabase credentials
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
OLLAMA_TIMEOUT = 600
LLM_MAX_RETRIES = 2

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Check both this repo and the forge-map directory for datasheets
DATASHEET_DIR = Path("./datasheets")
FORGE_MAP_DATASHEETS = Path.home() / "forgeos" / "forge-map" / "datasheets"
OUTPUT_DIR = Path("./extracted_datasheet_specs")
LOG_FILE = Path("./datasheet_extraction_log.txt")

EXTRACTION_PROMPT = """You are an electrical/mechanical engineering expert reading text extracted from a product datasheet.

The text may contain dimensions, electrical specs, pinouts, mechanical drawing annotations, and tolerances.
Some PDFs have raw numbers from mechanical drawings without labels — use engineering conventions:
- Board dimensions are typically the two largest numbers (length x width)
- Ø or diameter symbols indicate hole sizes (2.5, 2.7, 3.0, 3.2mm are common mounting holes)
- Pairs of numbers with consistent spacing indicate hole patterns
- Numbers near edges (3.5, 5.0) are edge distances
- Voltage ranges: "3.3V", "5V", "3.7-42V"
- Current specs: "2A", "30A", "500mA"

DATASHEET TEXT:
{text}

Extract ALL available specifications into this JSON format:
{{
  "product_name": "official product name",
  "manufacturer": "manufacturer name",
  "part_number": "exact part number",
  "category": "motor|sensor|mcu|connector|bearing|actuator|power|passive|ic|other",
  "mechanical": {{
    "length_mm": number or null,
    "width_mm": number or null,
    "height_mm": number or null,
    "diameter_mm": number or null,
    "shaft_diameter_mm": number or null,
    "weight_g": number or null,
    "mounting_pattern": "description or null",
    "mounting_holes": "M3x4 pattern or null",
    "tolerances": {{
      "dimension_tolerance_mm": number or null,
      "shaft_runout_mm": number or null
    }}
  }},
  "electrical": {{
    "voltage_min": number or null,
    "voltage_max": number or null,
    "voltage_nominal": number or null,
    "current_max_a": number or null,
    "current_nominal_a": number or null,
    "power_max_w": number or null,
    "interface": "I2C|SPI|UART|PWM|analog|CAN|USB|other|null",
    "connector_type": "description or null",
    "pinout": [
      {{"pin": 1, "name": "VCC", "description": "Power supply"}},
      ...
    ]
  }},
  "performance": {{
    "speed_rpm": number or null,
    "torque_nm": number or null,
    "kv_rating": number or null,
    "resolution": "description or null",
    "accuracy": "description or null",
    "operating_temp_min_c": number or null,
    "operating_temp_max_c": number or null,
    "ip_rating": "IP65 or null"
  }},
  "materials": ["list of materials mentioned"],
  "certifications": ["RoHS", "CE", etc.],
  "key_features": ["feature 1", "feature 2"],
  "datasheet_quality": "high|medium|low"
}}

RULES:
1. Use EXACT values from the datasheet — never estimate or guess
2. If a value is not clearly stated, use null
3. Convert all dimensions to mm, all weights to grams
4. Extract the complete pinout if available
5. Include all tolerance specifications
6. datasheet_quality: high = full specs, medium = partial, low = minimal data

Output ONLY the JSON object. No explanation, no markdown. Start with {{ and end with }}.

/no_think"""


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def extract_text_from_pdf(pdf_path: Path) -> str | None:
    """Extract text from PDF using PyMuPDF (proven best for datasheets).

    Returns up to 12k chars of extracted text, or None if the PDF
    is image-only or unreadable.
    """
    # PyMuPDF (fitz) — best quality, handles embedded text in drawings
    if fitz is not None:
        try:
            doc = fitz.open(str(pdf_path))
            pages = []
            for i, page in enumerate(doc):
                text = page.get_text()
                if text and text.strip():
                    pages.append(f"--- PAGE {i + 1} ---\n{text.strip()}")
            doc.close()
            combined = "\n\n".join(pages)
            if combined.strip() and len(combined.strip()) >= 50:
                return combined[:12000]
        except Exception:
            pass

    # Fallback: pdftotext (poppler-utils)
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout[:12000]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return None


def generate_with_qwen(prompt: str, attempt: int = 1) -> dict | None:
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": True,
               "options": {"temperature": 0.1, "num_predict": 4096}}
    try:
        label = f" (retry {attempt})" if attempt > 1 else ""
        log(f"    🤖 Streaming from {OLLAMA_MODEL}{label}...")
        start = time.time()
        resp = requests.post(url, json=payload, stream=True, timeout=OLLAMA_TIMEOUT)
        if resp.status_code != 200:
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
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        depth = 0
        si = None
        for i, ch in enumerate(cleaned):
            if ch == "{":
                if depth == 0:
                    si = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and si is not None:
                    try:
                        return json.loads(cleaned[si:i + 1])
                    except json.JSONDecodeError:
                        si = None
        if attempt < LLM_MAX_RETRIES:
            time.sleep(5)
            return generate_with_qwen(prompt, attempt + 1)
        return None
    except requests.RequestException as e:
        log(f"    ❌ Request failed: {e}")
        if attempt < LLM_MAX_RETRIES:
            time.sleep(10)
            return generate_with_qwen(prompt, attempt + 1)
        return None


def push_to_supabase(specs: list[dict]) -> int:
    """Update component_catalogue entries with extracted specs. Sets verified=true and datasheet_specs."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("❌ Missing Supabase credentials")
        return 0
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
               "Content-Type": "application/json", "Prefer": "return=minimal"}
    updated = 0
    for spec in specs:
        part = spec.get("part_number") or spec.get("product_name")
        if not part:
            continue
        # Escape for URL: PostgREST ilike uses * for wildcard
        safe = requests.utils.quote(part, safe="")
        search_url = (f"{SUPABASE_URL}/rest/v1/component_catalogue"
                      f"?or=(name.ilike.*{safe}*,part_number.ilike.*{safe}*)"
                      f"&select=id,name&limit=1")
        resp = requests.get(search_url, headers=headers, timeout=15)
        if resp.status_code != 200 or not resp.json():
            continue
        component = resp.json()[0]
        extracted_at = datetime.now().isoformat()
        update_resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/component_catalogue?id=eq.{component['id']}",
            headers=headers,
            json={
                "datasheet_specs": spec,
                "datasheet_extracted_at": extracted_at,
                "verified": True,
            },
            timeout=15,
        )
        if update_resp.status_code in (200, 204):
            updated += 1
            log(f"  ✅ Updated: {component['name']}")
        else:
            log(f"  ⚠️  Failed to update: {component['name']} ({update_resp.status_code})")
    log(f"✅ Updated {updated} components with datasheet specs")
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract specs from PDF datasheets")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--dir", type=str, default=str(DATASHEET_DIR))
    parser.add_argument("--push-only", type=str)
    parser.add_argument("--model", type=str)
    args = parser.parse_args()

    global OLLAMA_MODEL
    if args.model:
        OLLAMA_MODEL = args.model

    OUTPUT_DIR.mkdir(exist_ok=True)
    datasheet_dir = Path(args.dir)
    log("=" * 60)
    log("ForgeOS Datasheet Extraction Pipeline")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log(f"Datasheet directory: {datasheet_dir}")
    log("=" * 60)

    if args.push_only:
        with open(args.push_only) as f:
            push_to_supabase(json.load(f))
        return

    if not datasheet_dir.exists():
        # Try the forge-map datasheets directory as fallback
        if FORGE_MAP_DATASHEETS.exists():
            datasheet_dir = FORGE_MAP_DATASHEETS
            log(f"📂 Using forge-map datasheets: {datasheet_dir}")
        else:
            datasheet_dir.mkdir(parents=True, exist_ok=True)
            log(f"📂 Created directory: {datasheet_dir}")
            log("  Add PDF datasheets and re-run. Writing empty batch file.")
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            out = OUTPUT_DIR / f"batch_{ts}.json"
            OUTPUT_DIR.mkdir(exist_ok=True)
            with open(out, "w") as f:
                json.dump([], f, indent=2)
            log(f"💾 Saved empty batch to {out}")
            return

    pdfs = sorted(datasheet_dir.glob("*.pdf"))
    if not pdfs:
        log(f"⚠️  No PDF files found in {datasheet_dir}")
        log("  Add PDF files and re-run. Writing empty batch file.")
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = OUTPUT_DIR / f"batch_{ts}.json"
        OUTPUT_DIR.mkdir(exist_ok=True)
        with open(out, "w") as f:
            json.dump([], f, indent=2)
        log(f"💾 Saved empty batch to {out}")
        return

    log(f"📂 Found {len(pdfs)} PDF datasheets (parallel pipeline)")
    log(f"   PDF text extraction runs ahead of GPU — GPU always has work ready")
    all_specs: list[dict] = []

    # Queue holds (index, pdf_path, text) — pre-extracted PDF text
    # Buffer 3 ahead so GPU always has a prompt ready
    pdf_queue: queue.Queue = queue.Queue(maxsize=3)
    SENTINEL = None

    def pdf_reader():
        """Producer: extract text from PDFs ahead of GPU processing."""
        for i, pdf in enumerate(pdfs, 1):
            log(f"  📖 [{i}/{len(pdfs)}] Pre-reading: {pdf.name}")
            text = extract_text_from_pdf(pdf)
            pdf_queue.put((i, pdf, text))
        pdf_queue.put(SENTINEL)

    # Start PDF reader in background
    reader = threading.Thread(target=pdf_reader, daemon=True)
    reader.start()

    # Consumer: pull pre-extracted text and run Qwen
    while True:
        item = pdf_queue.get()
        if item is SENTINEL:
            break
        i, pdf, text = item
        log(f"\n[{i}/{len(pdfs)}] 📄 {pdf.name}")
        if not text:
            log(f"  ❌ Could not extract text")
            continue
        log(f"  📝 {len(text)} chars → sending to Qwen")
        prompt = EXTRACTION_PROMPT.format(text=text)
        result = generate_with_qwen(prompt)
        if result and isinstance(result, dict):
            result["source_file"] = pdf.name
            all_specs.append(result)
            name = result.get("product_name", "unknown")
            quality = result.get("datasheet_quality", "?")
            log(f"  ✅ {name} (quality: {quality})")
        else:
            log(f"  ❌ Failed to extract specs")

    reader.join(timeout=5)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = OUTPUT_DIR / f"batch_{ts}.json"
    with open(out, "w") as f:
        json.dump(all_specs, f, indent=2)
    log(f"\n💾 Saved {len(all_specs)} spec sheets to {out}")

    if not args.dry_run:
        push_to_supabase(all_specs)
    else:
        log(f"🏷️  Dry run. Push later: python3 {sys.argv[0]} --push-only {out}")
    log(f"\n✅ Datasheet extraction complete! {len(all_specs)} processed.")


if __name__ == "__main__":
    main()
