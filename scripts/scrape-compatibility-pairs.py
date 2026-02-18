#!/usr/bin/env python3
"""
ForgeOS Compatibility Mapping Scraper
=======================================
Scrapes community build sites (RotorBuilds, Hackaday, Thingiverse, etc.)
to extract which components are commonly used together, building a
compatibility graph for the assembly builder.

Creates component_compatibility_pairs that feed the "works with" suggestions.

Usage:
    python3 scripts/scrape-compatibility-pairs.py
    python3 scripts/scrape-compatibility-pairs.py --dry-run
    python3 scripts/scrape-compatibility-pairs.py --source rotorbuilds
    python3 scripts/scrape-compatibility-pairs.py --model qwen3:14b

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLLAMA_HOST, OLLAMA_MODEL
"""

import argparse
import json
import os
import queue
import re
import sys
import threading
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

import requests

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
OLLAMA_TIMEOUT = 1800
LLM_MAX_RETRIES = 2

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = Path("./generated_compatibility")
LOG_FILE = Path("./compatibility_scrape_log.txt")

# Build sources to scrape
BUILD_SOURCES = [
    {
        "id": "rotorbuilds",
        "name": "RotorBuilds (FPV Drones)",
        "seed_urls": [
            "https://rotorbuilds.com/builds?order=popular",
            "https://rotorbuilds.com/builds?order=popular&page=2",
            "https://rotorbuilds.com/builds?order=popular&page=3",
        ],
        "domain": "FPV drone",
        "link_pattern": r'href="(/build/[^"]+)"',
        "base_url": "https://rotorbuilds.com",
    },
    {
        "id": "openbuilds",
        "name": "OpenBuilds (CNC/3D Printers)",
        "seed_urls": [
            "https://openbuilds.com/builds/",
        ],
        "domain": "CNC and 3D printer",
        "link_pattern": r'href="(https://openbuilds\.com/builds/[^"]+)"',
        "base_url": "https://openbuilds.com",
    },
]

# Fallback: when we can't scrape a site, ask Qwen to generate pairs from knowledge
FALLBACK_DOMAINS = [
    {
        "domain": "FPV Racing Drone",
        "count": 100,
        "context": "Common FPV drone component combinations: flight controllers paired with ESCs, motors paired with propellers, VTX paired with antennas, cameras paired with VTX, frames paired with motor sizes. Include specific real products: Betaflight F7, SpeedyBee F405, T-Motor F40 Pro IV, XING2 motors, Caddx Vista/Ratel, TBS Crossfire, ELRS receivers. Use real part numbers.",
    },
    {
        "domain": "3D Printer",
        "count": 80,
        "context": "3D printer component pairings: mainboards paired with stepper drivers (SKR + TMC2209), hotends paired with nozzles (E3D V6 + 0.4mm brass), extruders paired with hotends (BMG + Dragon), linear rails paired with carriages (MGN12H + MGN12), power supplies paired with heated beds. Include Voron, Ender, Prusa parts.",
    },
    {
        "domain": "Robot Arm",
        "count": 60,
        "context": "Robot arm component pairings: servo motors (Dynamixel, MG996R), bearings (6806ZZ, 6206), timing belts + pulleys (GT2), stepper + driver (NEMA17 + A4988), microcontrollers (Arduino Mega, Teensy 4.1), joint encoders (AS5048A), end effectors (grippers). Include real parts from Robotis, Pololu, ServoCity.",
    },
    {
        "domain": "Electric Vehicle / Go-Kart",
        "count": 60,
        "context": "EV component pairings: motor + controller (QS 138 + Fardriver ND72530), batteries + BMS (Molicel P42A + JBD BMS), throttle + controller, contactor + controller, charger + battery pack. Include real products from QS Motor, Kelly Controller, Orion BMS, CALB cells.",
    },
    {
        "domain": "IoT Sensor Node",
        "count": 50,
        "context": "IoT component pairings: MCU + radio (ESP32 + LoRa SX1276), sensor + breakout (BME280 + Adafruit board), power (TP4056 + 18650), antenna + connector (SMA + dipole), solar panel + charge controller. Include products from Adafruit, SparkFun, Seeed, HolyBro.",
    },
    {
        "domain": "Audio Amplifier",
        "count": 50,
        "context": "Audio component pairings: amplifier IC + heatsink (TDA7498E + extruded Al), capacitors + PSU (Nichicon + toroidal), input selector + relay (signal relay + DPDT), speaker terminals + binding posts, volume pot + encoder (Alps Blue + Bourns). Include audiophile-grade parts.",
    },
    {
        "domain": "CNC Machine",
        "count": 60,
        "context": "CNC machine component pairings: spindles paired with VFDs (2.2kW ER20 + Huanyang VFD), linear rails paired with ball screws (SBR20 + SFU1605), stepper motors paired with drivers (NEMA23 + DM542), controllers paired with breakout boards (Mach3 + C11G), coolant pumps paired with nozzles. Include Openbuilds, CNC4PC, StepperOnline parts.",
    },
    {
        "domain": "Quadruped Robot",
        "count": 40,
        "context": "Quadruped robot component pairings: servo motors (Dynamixel XM430, LX-16A), IMU paired with controller (BNO055 + Teensy 4.1), leg linkages paired with bearings, power distribution paired with BEC, camera paired with compute (OAK-D + Jetson Nano). Include MIT Mini Cheetah, Spot-inspired, and OpenDog parts.",
    },
    {
        "domain": "Weather Station",
        "count": 40,
        "context": "Weather station component pairings: anemometer paired with wind vane, rain gauge paired with tipping bucket counter, BME280 paired with ESP32, solar panel paired with charge controller, LoRa module paired with antenna, UV sensor paired with light sensor. Include Davis, Ecowitt, and DIY parts.",
    },
    {
        "domain": "Electric Bicycle",
        "count": 50,
        "context": "E-bike component pairings: hub motor paired with controller (Bafang + KT controller), battery paired with BMS (52V 20Ah + 14S BMS), display paired with controller (KT-LCD3 + KT controller), torque sensor paired with bottom bracket, throttle paired with brake lever cutoff. Include Bafang, TSDZ2, Luna Cycle parts.",
    },
    {
        "domain": "Home Automation",
        "count": 50,
        "context": "Home automation component pairings: ESP32 paired with relay module, Zigbee coordinator paired with sensors (CC2652 + Aqara), smart switches paired with dimmers, motion sensor paired with LED strip controller, door sensor paired with alarm, temperature sensor paired with HVAC relay. Include Sonoff, Shelly, Aqara, IKEA Tradfri parts.",
    },
    {
        "domain": "Laser Cutter",
        "count": 40,
        "context": "Laser cutter component pairings: CO2 tube paired with power supply (40W + MYJG-40), mirrors paired with lens (Si + ZnSe), stepper motors paired with belts (NEMA17 + GT2), controller paired with software (Ruida + LightBurn), air assist pump paired with nozzle, exhaust fan paired with ducting. Include K40, Ortur, xTool parts.",
    },
]

EXTRACTION_PROMPT = """You are a hardware product expert. Analyze this build page content and extract component compatibility pairs.

BUILD PAGE CONTENT:
{content}

For each pair of components that are used together in this build, output a JSON object:
{{
  "pairs": [
    {{
      "component_a": "exact product name / part number",
      "component_a_category": "motor|esc|flight_controller|frame|propeller|vtx|camera|receiver|battery|antenna|other",
      "component_b": "exact product name / part number",
      "component_b_category": "category from list above",
      "relationship": "powers|controls|mounts_to|connects_to|drives|receives_from|pairs_with",
      "confidence": 0.0 to 1.0,
      "notes": "brief note on why they work together"
    }}
  ],
  "build_name": "name of the build",
  "build_domain": "FPV drone|3D printer|robot|CNC|other"
}}

RULES:
1. Only include pairs where both components are specific products (not generic descriptions)
2. Use exact product names/part numbers from the page
3. Confidence 1.0 = explicitly listed together, 0.7 = strongly implied, 0.5 = inferred
4. Include ALL meaningful pairs (motor+ESC, FC+ESC, frame+motor, camera+VTX, etc.)

Output ONLY the JSON object."""

GENERATION_PROMPT = """You are a hardware component expert. Generate {count} REAL component compatibility pairs for the "{domain}" domain.

CONTEXT:
{context}

Output a JSON array of pairs:
[
  {{
    "component_a": "exact real product name / part number",
    "component_a_category": "motor|esc|controller|frame|propeller|sensor|actuator|power|mcu|driver|bearing|belt|hotend|extruder|other",
    "component_b": "exact real product name / part number",
    "component_b_category": "from categories above",
    "relationship": "powers|controls|mounts_to|connects_to|drives|receives_from|pairs_with|compatible_with",
    "confidence": 0.9,
    "notes": "why these work together",
    "domain": "{domain}"
  }}
]

RULES:
1. ONLY use REAL products that actually exist
2. Use exact manufacturer part numbers where possible
3. Each pair should represent a genuinely useful compatibility fact
4. Vary the pairs: don't repeat the same component in every pair
5. Include interface details in notes (connector type, voltage, mounting pattern)

Output ONLY the JSON array."""


class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._text = []
        self._skip = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            text = data.strip()
            if text:
                self._text.append(text)

    def get_text(self) -> str:
        return " ".join(self._text)


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def safe_get(url: str, timeout: int = 30) -> str | None:
    try:
        headers = {"User-Agent": "ForgeOS-Scraper/1.0 (compatibility research)"}
        resp = requests.get(url, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            return resp.text
        log(f"    ⚠️  HTTP {resp.status_code}: {url}")
        return None
    except requests.RequestException as e:
        log(f"    ❌ Request failed: {e}")
        return None


def extract_text(html: str) -> str:
    parser = HTMLTextExtractor()
    parser.feed(html)
    return parser.get_text()[:6000]


def generate_with_qwen(prompt: str, attempt: int = 1) -> dict | list | None:
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": True,
               "options": {"temperature": 0.3, "num_predict": 8192}}
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
        # Try parse as JSON
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        # Extract JSON object or array
        for opener, closer in [("{", "}"), ("[", "]")]:
            depth = 0
            si = None
            for i, ch in enumerate(cleaned):
                if ch == opener:
                    if depth == 0:
                        si = i
                    depth += 1
                elif ch == closer:
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


def scrape_build_pages(source: dict) -> list[dict]:
    """Scrape build pages using parallel pipeline.

    Producer thread fetches and extracts text from build pages (network I/O)
    while consumer thread runs Qwen on the scraped content (GPU).
    GPU never waits for the network.
    """
    all_pairs: list[dict] = []
    build_urls: list[str] = []
    for seed_url in source["seed_urls"]:
        log(f"  📡 Fetching index: {seed_url}")
        html = safe_get(seed_url)
        if not html:
            continue
        links = re.findall(source["link_pattern"], html)
        for link in links[:20]:
            full_url = urljoin(source["base_url"], link)
            if full_url not in build_urls:
                build_urls.append(full_url)
        time.sleep(2)

    urls_to_process = build_urls[:15]
    log(f"  📋 Found {len(build_urls)} build pages, processing {len(urls_to_process)}")

    # Queue holds (index, url, text) — pre-scraped page content
    scrape_q: queue.Queue = queue.Queue(maxsize=3)
    SENTINEL = None

    def page_scraper():
        """Producer: fetch and extract text from build pages."""
        for i, url in enumerate(urls_to_process, 1):
            log(f"  🌐 [{i}/{len(urls_to_process)}] Pre-fetching: {url}")
            html = safe_get(url)
            if not html:
                scrape_q.put((i, url, ""))
                continue
            text = extract_text(html)
            scrape_q.put((i, url, text))
            time.sleep(1.5)
        scrape_q.put(SENTINEL)

    # Start scraper in background thread
    fetcher = threading.Thread(target=page_scraper, daemon=True)
    fetcher.start()

    # Consumer: pull pre-scraped text and run Qwen
    while True:
        item = scrape_q.get()
        if item is SENTINEL:
            break
        i, url, text = item
        if len(text) < 100:
            continue
        log(f"  [{i}/{len(urls_to_process)}] 🔍 Processing with Qwen: {url}")
        prompt = EXTRACTION_PROMPT.format(content=text[:5000])
        result = generate_with_qwen(prompt)
        if isinstance(result, dict) and "pairs" in result:
            pairs = result["pairs"]
            for p in pairs:
                p["source_url"] = url
                p["domain"] = source.get("domain", "unknown")
            all_pairs.extend(pairs)
            log(f"    ✅ {len(pairs)} pairs extracted")

    fetcher.join(timeout=5)
    return all_pairs


def generate_pairs_from_knowledge(domain_info: dict) -> list[dict]:
    """Generate compatibility pairs from Qwen's training knowledge."""
    prompt = GENERATION_PROMPT.format(**domain_info)
    result = generate_with_qwen(prompt)
    if isinstance(result, list):
        return [p for p in result if isinstance(p, dict) and p.get("component_a")]
    return []


# component_compatibility table columns (PostgREST requires uniform keys per batch).
COMPAT_SCHEMA_KEYS = [
    "component_a",
    "component_a_category",
    "component_b",
    "component_b_category",
    "relationship",
    "confidence",
    "notes",
    "domain",
    "source_url",
]


def normalize_compat_record(p: dict) -> dict:
    """Ensure record has exactly COMPAT_SCHEMA_KEYS for component_compatibility table."""
    out = {k: p.get(k) for k in COMPAT_SCHEMA_KEYS}
    if out["confidence"] is not None:
        out["confidence"] = float(out["confidence"])
    return out


def push_to_supabase(pairs: list[dict]) -> int:
    """Push compatibility pairs to component_compatibility table."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("❌ Missing Supabase credentials")
        return 0
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    url = f"{SUPABASE_URL}/rest/v1/component_compatibility"
    pushed = 0
    for i in range(0, len(pairs), 50):
        batch = [normalize_compat_record(p) for p in pairs[i : i + 50]]
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
            log(f"  ⚠️  Push failed: {resp.status_code} {resp.text[:200]}")
    log(f"📤 Pushed {pushed} compatibility pairs to Supabase")
    return pushed


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape component compatibility pairs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source", type=str, help="Only scrape a specific source")
    parser.add_argument("--generate-only", action="store_true", help="Skip scraping, only generate from knowledge")
    parser.add_argument(
        "--push-only",
        type=str,
        default=None,
        metavar="PATH",
        help="Push existing JSON file or directory of batch_*.json to Supabase (no scrape/generate)",
    )
    parser.add_argument("--model", type=str)
    args = parser.parse_args()

    global OLLAMA_MODEL
    if args.model:
        OLLAMA_MODEL = args.model

    OUTPUT_DIR.mkdir(exist_ok=True)
    log("=" * 60)
    log("ForgeOS Compatibility Mapping")
    log(f"Model: {OLLAMA_MODEL} @ {OLLAMA_HOST}")
    log("=" * 60)

    if args.push_only:
        path = Path(args.push_only)
        pairs: list[dict] = []
        if path.is_file():
            pairs = json.loads(path.read_text())
        elif path.is_dir():
            for f in sorted(path.glob("batch_*.json")):
                with open(f) as fp:
                    pairs.extend(json.load(fp))
        else:
            log(f"❌ Not a file or directory: {path}")
            sys.exit(1)
        log(f"Loaded {len(pairs)} pairs from {path}")
        pushed = push_to_supabase(pairs)
        log(f"✅ Pushed {pushed} compatibility pairs")
        return

    log(f"Scrape sources: {len(BUILD_SOURCES)}")
    log(f"Generation domains: {len(FALLBACK_DOMAINS)}")
    log("=" * 60)

    all_pairs: list[dict] = []

    # Phase 1: Scrape real build pages
    if not args.generate_only:
        sources = BUILD_SOURCES
        if args.source:
            sources = [s for s in sources if s["id"] == args.source]
        for source in sources:
            log(f"\n🌐 Scraping: {source['name']}")
            pairs = scrape_build_pages(source)
            all_pairs.extend(pairs)
            log(f"  📊 {len(pairs)} pairs from {source['name']}")

    # Phase 2: Generate from LLM knowledge
    for i, domain in enumerate(FALLBACK_DOMAINS, 1):
        log(f"\n[{i}/{len(FALLBACK_DOMAINS)}] 🧠 Generating: {domain['domain']} ({domain['count']} pairs)")
        pairs = generate_pairs_from_knowledge(domain)
        all_pairs.extend(pairs)
        log(f"  ✅ {len(pairs)} pairs generated")

    # Deduplicate
    seen = set()
    unique_pairs: list[dict] = []
    for p in all_pairs:
        key = (p.get("component_a", "").lower(), p.get("component_b", "").lower())
        rev_key = (key[1], key[0])
        if key not in seen and rev_key not in seen:
            seen.add(key)
            unique_pairs.append(p)
    log(f"\n📊 Total: {len(all_pairs)} raw → {len(unique_pairs)} unique pairs")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = OUTPUT_DIR / f"batch_{ts}.json"
    with open(out, "w") as f:
        json.dump(unique_pairs, f, indent=2)
    log(f"💾 Saved to {out}")

    if not args.dry_run:
        push_to_supabase(unique_pairs)
    else:
        log(f"🏷️  Dry run complete.")
    log(f"\n✅ Compatibility mapping complete! {len(unique_pairs)} pairs.")


if __name__ == "__main__":
    main()
