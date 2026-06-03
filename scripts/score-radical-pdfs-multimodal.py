#!/usr/bin/env python3
"""
Multimodal council scorer for Radical Phase 5 PDFs.

Usage:
    python3 scripts/score-radical-pdfs-multimodal.py \
        --batch-dir ~/Downloads/engine-evidence/radical-shadow-20260510T2109 \
        --output eval-harness/COUNCIL-SCORES-V2-10-RADICAL-PDFS-2026-05-10.md \
        --v1-file eval-harness/COUNCIL-SCORES-10-RADICAL-PDFS-2026-05-10.md

Methodology:
    1. Find all radical.pdf files in batch-dir/<slug>/radical.pdf
    2. Convert each to 150 DPI PNGs using pdftoppm
    3. Score each PDF with 3 LLMs (Gemini-2.5-Pro via OR, Claude Opus 4.7 direct, Qwen3-VL via OR)
    4. Calibrate: if any score ≥3 below the other two, drop it as outlier
    5. Compute mean of remaining scores per section
    6. Write markdown report comparing V1 vs V2

12 canonical sections:
    cover, executive_summary, brief_requirements, design_modules, bom,
    cost_analysis, sourcing_strategy, feasibility_notes, grammar_language,
    sources_references, appendix_technical, visual_layout
"""

import argparse
import base64
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ─── Recorder bootstrap ───────────────────────────────────────────────────
# Load council-score-log.py via importlib because the filename contains a
# hyphen (not valid as a Python module identifier).
def _load_recorder():
    _lib_path = Path(__file__).parent / "lib" / "council-score-log.py"
    if not _lib_path.exists():
        print(
            f"[WARN] council-score-log.py not found at {_lib_path} — "
            "scores will NOT be persisted to the canonical log.",
            file=sys.stderr,
        )
        return None
    spec = importlib.util.spec_from_file_location("council_score_log", _lib_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.record_council_score


_record_council_score = _load_recorder()


# ─── .env.local auto-loader ──────────────────────────────────────────────────
# Self-load the repo's .env.local so this scorer records a score REGARDLESS of
# how it's invoked (direct shell, cron, subagent). The council needs
# ANTHROPIC_API_KEY — an eval-tooling exception; the engine pipeline itself is
# Anthropic-free — and that key lives in .env.local, NOT in ~/.claude/secrets/.
# A run that can't find the key exits 1 and writes NOTHING to
# council-scores.jsonl, which is exactly the "losing information" failure this
# whole permanent-log feature exists to prevent. Removing the "forgot to source
# .env.local" failure class entirely is the robust fix. Already-exported env
# vars win (we only fill what's absent), preserving normal shell precedence.
def _load_dotenv_local() -> None:
    env_path = Path(__file__).parent.parent / ".env.local"
    if not env_path.exists():
        return
    try:
        for raw in env_path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except Exception as e:
        print(f"[WARN] could not parse .env.local: {e}", file=sys.stderr)


_load_dotenv_local()

# ─── Config ────────────────────────────────────────────────────────────────

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
ANTHROPIC_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")

# Validate keys at startup — fail loud rather than produce silent "—" cells
_missing_keys: list[str] = []
if not ANTHROPIC_KEY:
    _missing_keys.append("ANTHROPIC_API_KEY")
if not OPENROUTER_KEY:
    _missing_keys.append("OPENROUTER_API_KEY")
if _missing_keys:
    print(
        f"ERROR: Missing required environment variables: {', '.join(_missing_keys)}\n"
        "Export them before running, e.g.:\n"
        "  source .env.local  # if using dotenv file\n"
        "  export ANTHROPIC_API_KEY=sk-ant-...",
        file=sys.stderr,
    )
    sys.exit(1)

# ─── Per-SECTION scoring (root fix for HTTP 400 on large dossiers) ───────────
# THE OLD FAILURE: every model was sent the WHOLE PDF in one request. On the
# 91-page co2_mineralisation dossier (22.7 MB / ~90 page-images) that blew past
# the OpenRouter ≈10 MB body limit and the Anthropic per-request image ceiling,
# so Claude + Qwen both returned `HTTP 400 Bad Request` and ONLY Gemini scored —
# a single un-calibrated judge that returned a meaningless uniform 10.00 while
# the chain itself hard-exited a gate and the Physics Critic flagged 3 HIGH.
#
# THE FIX: score each of the 12 council SECTIONS from ONLY its relevant page
# images (mapped from the PDF's own section headers — see build_section_page_map),
# capped at MAX_IMAGES_PER_SECTION. Each request now carries a handful of images
# regardless of how long the dossier is, so it stays far under every seat's
# payload limit. 12 sections × 3 models = small, reliable calls instead of one
# enormous one.
#
# MAX_IMAGES_PER_SECTION: hard cap on images attached to ONE (model, section)
# request. ~8 keeps any single request well under ~10 MB even at 150–200 DPI.
# When a section spans more pages than this, we SAMPLE evenly (always keeping the
# first + last page so the section header and any sub-total/summary are seen).
MAX_IMAGES_PER_SECTION = 8

# Whole-document sampling for the two "holistic" sections (grammar_language and
# visual_layout) that are not tied to one header — sample this many pages spread
# across the entire dossier so the judge still sees representative typography /
# language across the whole document without receiving every page.
MAX_IMAGES_HOLISTIC = 8

# Per-section image legibility. Because a section subset is small (≤ ~8 pages),
# payload is no longer the binding constraint, so we can afford a HIGHER base DPI
# than the old whole-doc-in-one-call path (which had to step down to ~60 DPI on
# long dossiers and rendered unreadable pages). 150 DPI is comfortably legible
# for the BoM / cost tables that matter most. PER_SECTION_RAW_KB_CAP is a safety
# net: if a specific subset somehow exceeds it we down-convert just that subset.
SECTION_RENDER_DPI = 150
PER_SECTION_RAW_KB_CAP = 6500  # ~8.7 MB base64 body — under the ~10 MB seat limit

# Resilience: transient-error retry policy for model calls.
MAX_RETRIES = 3            # total attempts per (model, section) request
RETRY_BACKOFF_BASE_S = 4   # exponential: 4s, 8s, 16s ...

# A section is only trustworthy as a CALIBRATED result if ≥2 models scored it.
# A lone surviving model (the exact 91-page failure mode) must NOT be reported as
# a calibrated pass — calibrate_section returns its value but flags low-confidence,
# and the overall pass is forced False if any HARD section is single-model.
MIN_MODELS_FOR_CONFIDENT_SECTION = 2

# Legacy whole-PDF page cap (kept only for the obsolete build_messages helpers,
# which are no longer on the scoring path).
MAX_PAGES_PER_CALL = 120

MODELS = [
    {
        "id": "gemini",
        "label": "Gemini-2.5-Pro",
        "provider": "openrouter",
        "model": "google/gemini-3.1-pro-preview",
    },
    {
        "id": "claude",
        "label": "Claude Opus 4.7",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
    },
    {
        "id": "qwen",
        "label": "Qwen3-VL-235B",
        "provider": "openrouter",
        "model": "qwen/qwen3-vl-235b-a22b-instruct",
    },
]

SECTIONS = [
    "cover",
    "executive_summary",
    "brief_requirements",
    "design_modules",
    "bom",
    "cost_analysis",
    "sourcing_strategy",
    "feasibility_notes",
    "grammar_language",
    "sources_references",
    "appendix_technical",
    "visual_layout",
]

SLUG_LABEL = {
    "rs-auv":        "AUV",
    "rs-bess":       "BESS",
    "rs-bioreactor": "Bioreactor",
    "rs-cgm":        "CGM",
    "rs-drone":      "Drone",
    "rs-edge-ai":    "Edge-AI",
    "rs-ev-charger": "EV-Charger",
    "rs-farm":       "Farm",
    "rs-haps":       "HAPS",
    "rs-heatpump":   "Heatpump",
    "rs-wind-turbine":  "Wind-Turbine",
    "rs-solar-inverter": "Solar-Inverter",
}

SCORING_PROMPT = """You are a senior hardware engineering consultant reviewing a ForgeOS AI-generated engineering design report (PDF).

Score each of the following sections out of 10, where:
- 10 = publication-quality, completely fills the section's purpose for a hardware team
- 8  = clearly present, specific, actionable, minimal gaps
- 6  = present but thin, generic, or missing important sub-content
- 4  = partially present but significant gaps or errors
- 2  = token effort, mostly placeholder or wrong
- 0  = completely absent or so wrong it is misleading

Score these exact sections (use null if the section is not present in the PDF):
{section_list}

Criteria for each:
- cover: professional appearance, product name, class, cost ceiling, page count, any visual element
- executive_summary: 3-paragraph narrative (product description / design outcome / next steps), not just a table
- brief_requirements: quantified performance targets, regulatory standards, measurable KPIs
- design_modules: subsystem list with functional descriptions, domain-correct subsystems for this product class
- bom: complete BOM with parts, quantities, unit costs, suppliers, MPNs (not TBD), grade quality
- cost_analysis: total unit cost vs ceiling, cost breakdown by module, credibility of estimates
- sourcing_strategy: supplier identification, lead times, dual-source risk, MOQ discussion
- feasibility_notes: cost verdict, top 3 technical risks with severity, regulatory flags, manufacturing flags
- grammar_language: engineering terminology correctness, no hallucinated subsystems, DRC/grammar pass status
- sources_references: cited sources, search results referenced, credibility
- appendix_technical: any supporting technical data, calculations, datasheets
- visual_layout: overall PDF layout quality, typography, table formatting, BOM legend clarity

CRITICAL: Score grammar_language / design_modules low (≤4) if this PDF contains subsystems from the WRONG product class (e.g. heat pump / hydronic circuit subsystems in a drone or glucose monitor PDF).

Return ONLY a JSON object (no code fences, no backticks):
{{
  "cover": <int or null>,
  "executive_summary": <int or null>,
  "brief_requirements": <int or null>,
  "design_modules": <int or null>,
  "bom": <int or null>,
  "cost_analysis": <int or null>,
  "sourcing_strategy": <int or null>,
  "feasibility_notes": <int or null>,
  "grammar_language": <int or null>,
  "sources_references": <int or null>,
  "appendix_technical": <int or null>,
  "visual_layout": <int or null>,
  "notes": "<one sentence of most important finding>"
}}
"""

# ─── PDF → PNG conversion ──────────────────────────────────────────────────

def pdf_to_pngs(pdf_path: Path, dpi: int = 150) -> list[Path]:
    """Convert PDF to list of PNG paths using pdftoppm. Always re-converts."""
    import shutil
    out_dir = pdf_path.parent / f"_council_pngs_{pdf_path.stem}"
    # Always clean and re-create to avoid stale PNGs from previous runs
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(exist_ok=True)
    prefix = str(out_dir / "page")
    result = subprocess.run(
        ["pdftoppm", "-r", str(dpi), "-png", str(pdf_path), prefix],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  [WARN] pdftoppm error: {result.stderr[:200]}", file=sys.stderr)
    pngs = sorted(out_dir.glob("page-*.png"))
    return pngs


def pdf_to_pngs_fit(
    pdf_path: Path,
    target_raw_kb: int = 6800,
    max_dpi: int = 150,
    min_dpi: int = 60,
) -> tuple[list[Path], int]:
    """Convert a PDF to PNGs at the HIGHEST DPI whose total raw byte size fits
    `target_raw_kb`, so the WHOLE document can be sent in one multimodal call
    without blowing the request-body limit.

    Why: the OpenRouter seats cap the request body at roughly 10 MB; base64
    inflates bytes by 4/3, so ~6.8 MB of raw PNG → ~9 MB body, just under the
    limit. A short 17-22pp dossier stays at the full 150 DPI; a long one (e.g.
    the 85pp VF dossier) steps down until it fits, so EVERY page is scored
    rather than silently truncating to the first 40 (which would penalise the
    unseen BoM / cost / appendix sections). PNG size does NOT scale as DPI^2 for
    text/vector pages, so we MEASURE and back off proportionally rather than
    compute a single DPI analytically. Returns (pngs, dpi_used).
    """
    import math
    dpi = max_dpi
    pngs = pdf_to_pngs(pdf_path, dpi=dpi)
    for _ in range(4):
        raw_kb = sum(p.stat().st_size for p in pngs) // 1024
        if raw_kb <= target_raw_kb or dpi <= min_dpi:
            return pngs, dpi
        scale = math.sqrt(target_raw_kb / max(raw_kb, 1))
        new_dpi = max(min_dpi, int(dpi * scale))
        if new_dpi >= dpi:  # no further reduction possible
            return pngs, dpi
        dpi = new_dpi
        pngs = pdf_to_pngs(pdf_path, dpi=dpi)
    return pngs, dpi


def encode_image(path: Path) -> str:
    """Base64-encode a PNG file."""
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8")


# ─── Section → page mapping (root fix) ──────────────────────────────────────
# We send each council section ONLY its relevant page images. ForgeOS dossiers
# print a consistent running section header on every page ("SECTION 1 · BRIEF &
# REQUIREMENTS", "SECTION 2 · MODULE 4", "SECTION 3 · RISK & INTEGRATION
# ANALYSIS", "SECTION 7 · SOURCING STRATEGY", "SECTION · TOOLS USED IN THIS
# REPORT", "APPENDIX · ...", "EXECUTIVE SUMMARY", ...). We read those headers via
# pdftotext and bucket each PHYSICAL page (1-indexed) into one or more of the 12
# COUNCIL sections. This is class-AGNOSTIC: every archetype shares the header
# scheme, so the mapping works on an unseen dossier with no per-class wiring.

# Each council section maps to a set of header SIGNATURES (substring match on the
# de-spaced, upper-cased page header). A page may feed more than one section
# (e.g. a "COST BY MODULE" page feeds both `bom` and `cost_analysis`).
_HEADER_SIGNATURES: dict[str, list[str]] = {
    "executive_summary":  ["EXECUTIVESUMMARY"],
    "brief_requirements": ["BRIEF&REQUIREMENTS", "BRIEFPROVENANCE",
                           "BRIEFCOMPLIANCE", "PHYSICSNARRATIVE",
                           "SYSTEMOVERVIEW", "DESIGNTRADE-OFFS"],
    "design_modules":     ["·MODULES", "·MODULE", "ENGINEERINGTOOLSFLOW"],
    "bom":                ["COSTBYMODULE"],
    "cost_analysis":      ["COSTBYMODULE", "BRIEFCOMPLIANCE"],
    "sourcing_strategy":  ["SOURCINGSTRATEGY"],
    "feasibility_notes":  ["RISK&INTEGRATION", "RISKANALYSIS",
                           "REGULATORY&COMPLIANCE", "REGULATORY&"],
    "sources_references": ["TOOLSUSEDINTHISREPORT", "TOOLSUSED", "REFERENCES",
                           "POTENTIALINVESTORS", "APPENDIX·POTENTIAL"],
    "appendix_technical": ["TOOLSUSEDINTHISREPORT", "TOOLSUSED", "APPENDIX",
                           "PHYSICSNARRATIVE", "ENGINEERINGTOOLSFLOW"],
}
# Sections deliberately NOT in the table above:
#   cover           -> always physical page 1 (the title page has no SECTION header)
#   grammar_language, visual_layout -> HOLISTIC, sampled across the whole doc.

# Sections whose absence (single-model or no-model) is a genuine PASS-blocker.
# These are the content sections a reader relies on; a uniform-10 from one model
# on these is exactly the false-PASS this fix exists to prevent.
HARD_SECTIONS = {
    "executive_summary", "brief_requirements", "design_modules",
    "bom", "cost_analysis", "sourcing_strategy", "feasibility_notes",
}


def _despace_upper(s: str) -> str:
    """Normalise a page header for signature matching: strip ALL whitespace and
    upper-case, so the renderer's letter-spaced 'S E C T I O N 2' and the plain
    'SECTION 2' both collapse to 'SECTION2'."""
    return "".join(s.split()).upper()


def build_section_page_map(pdf_path: Path, num_pages: int) -> dict[str, list[int]]:
    """Return {council_section: [1-indexed physical page numbers]} by reading the
    PDF's own running section headers via pdftotext.

    Robust by construction:
      * cover           -> [1] always.
      * holistic sections (grammar_language, visual_layout) -> an evenly-spread
        sample across ALL pages (set later in select_section_pages), so they are
        NOT keyed here.
      * every other section -> pages whose header matches a signature.
      * any section that ends up empty (header scheme changed / unusual dossier)
        falls back to a sensible default so a model is still asked about it.
    """
    # Extract page text. pdftotext writes form-feed (\f) between pages.
    txt = ""
    try:
        tmp = Path(tempfile.mktemp(suffix=".txt"))
        subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), str(tmp)],
            capture_output=True, text=True,
        )
        if tmp.exists():
            txt = tmp.read_text(encoding="utf-8", errors="replace")
            tmp.unlink()
    except Exception as e:
        print(f"  [WARN] pdftotext failed for section map: {e}", file=sys.stderr)

    page_texts = txt.split("\f") if txt else []
    # The header is in the first few lines of each page; use the de-spaced first
    # ~6 lines as the matchable header blob.
    page_headers: list[str] = []
    for pg in page_texts:
        lines = [l for l in pg.splitlines() if l.strip()]
        page_headers.append(_despace_upper(" ".join(lines[:6])))

    mapping: dict[str, list[int]] = {s: [] for s in SECTIONS}
    mapping["cover"] = [1]

    for idx, header in enumerate(page_headers, start=1):
        if idx > num_pages:
            break
        for section, sigs in _HEADER_SIGNATURES.items():
            if any(sig in header for sig in sigs):
                if idx not in mapping[section]:
                    mapping[section].append(idx)

    # ── Fallbacks so NO content section is silently empty ────────────────────
    # If the header parse found nothing for a section (unusual dossier / header
    # scheme drift), fall back to a positional guess rather than asking the model
    # to score a section it never saw.
    if num_pages >= 2 and not mapping["executive_summary"]:
        mapping["executive_summary"] = [2]
    if not mapping["brief_requirements"]:
        mapping["brief_requirements"] = [p for p in range(3, min(8, num_pages) + 1)]
    if not mapping["design_modules"]:
        # middle of the document is almost always the modules body
        lo = max(1, num_pages // 4)
        hi = max(lo, (num_pages * 3) // 4)
        mapping["design_modules"] = list(range(lo, hi + 1))
    if not mapping["bom"]:
        mapping["bom"] = mapping["cost_analysis"] or mapping["design_modules"][:4] or [min(18, num_pages)]
    if not mapping["cost_analysis"]:
        mapping["cost_analysis"] = mapping["bom"]
    if not mapping["sourcing_strategy"]:
        mapping["sourcing_strategy"] = [max(1, num_pages - 3)]
    if not mapping["feasibility_notes"]:
        mapping["feasibility_notes"] = [max(1, num_pages - 5)]
    if not mapping["sources_references"]:
        mapping["sources_references"] = [num_pages]
    if not mapping["appendix_technical"]:
        mapping["appendix_technical"] = [num_pages]

    return mapping


def _sample_pages(pages: list[int], cap: int) -> list[int]:
    """Down-sample a sorted page list to at most `cap` entries, ALWAYS keeping the
    first and last page (section header + any closing sub-total/summary) and
    spreading the rest evenly across the span."""
    pages = sorted(set(pages))
    if len(pages) <= cap:
        return pages
    if cap <= 1:
        return [pages[0]]
    if cap == 2:
        return [pages[0], pages[-1]]
    # keep first + last, evenly sample the interior for the remaining slots
    interior = pages[1:-1]
    want = cap - 2
    step = len(interior) / want
    picked = [interior[int(i * step)] for i in range(want)]
    return sorted(set([pages[0]] + picked + [pages[-1]]))


def select_section_pages(
    section: str,
    section_map: dict[str, list[int]],
    num_pages: int,
) -> list[int]:
    """Return the capped, 1-indexed page list to send for one council section."""
    # Holistic sections: spread a sample across the WHOLE document.
    if section in ("grammar_language", "visual_layout"):
        if num_pages <= MAX_IMAGES_HOLISTIC:
            return list(range(1, num_pages + 1))
        step = num_pages / MAX_IMAGES_HOLISTIC
        return sorted(set(
            min(num_pages, max(1, int(i * step) + 1))
            for i in range(MAX_IMAGES_HOLISTIC)
        ))

    pages = [p for p in section_map.get(section, []) if 1 <= p <= num_pages]
    if not pages:
        # last-ditch: cover page so the model at least returns a (low) score
        return [1]
    return _sample_pages(pages, MAX_IMAGES_PER_SECTION)


def render_section_pngs(
    all_pngs: list[Path],
    page_numbers: list[int],
    pdf_path: Path,
) -> list[Path]:
    """Map 1-indexed physical page numbers to already-rendered PNG paths.

    `all_pngs` is the whole document rendered ONCE at SECTION_RENDER_DPI (pages are
    named page-0001.png, page-0002.png, ...). Subsets are small, so we do not need
    per-section re-rendering for size; if a particular subset still exceeds
    PER_SECTION_RAW_KB_CAP we down-convert just those pages to keep the body legal.
    """
    selected = [all_pngs[p - 1] for p in page_numbers if 1 <= p <= len(all_pngs)]
    if not selected:
        return []
    raw_kb = sum(p.stat().st_size for p in selected) // 1024
    if raw_kb <= PER_SECTION_RAW_KB_CAP:
        return selected
    # Rare: a few very heavy pages. Re-render just this subset at a lower DPI.
    import math
    scale = math.sqrt(PER_SECTION_RAW_KB_CAP / max(raw_kb, 1))
    lo_dpi = max(60, int(SECTION_RENDER_DPI * scale))
    sub_dir = pdf_path.parent / f"_council_pngs_sub_{pdf_path.stem}"
    import shutil
    if sub_dir.exists():
        shutil.rmtree(sub_dir)
    sub_dir.mkdir(exist_ok=True)
    out: list[Path] = []
    for p in page_numbers:
        prefix = str(sub_dir / f"p{p}")
        subprocess.run(
            ["pdftoppm", "-r", str(lo_dpi), "-png", "-f", str(p), "-l", str(p),
             str(pdf_path), prefix],
            capture_output=True, text=True,
        )
        hits = sorted(sub_dir.glob(f"p{p}-*.png"))
        if hits:
            out.append(hits[0])
    return out or selected


# ─── API calls ────────────────────────────────────────────────────────────

class PayloadTooLargeError(Exception):
    """Raised when a request is rejected as too large (HTTP 400/413). NOT retried
    — backing off won't help; the caller must send fewer images. With the
    per-section fix this should never fire, but we surface it distinctly so a
    regression (a section subset still too big) is obvious in the logs."""


def _http_post_with_retries(req_factory, who: str) -> "urllib.response.addinfourl":
    """POST with exponential backoff on TRANSIENT failures (429, 5xx, timeouts,
    connection resets). HTTP 400/413 (payload) is raised as PayloadTooLargeError
    immediately — retrying a too-large body is pointless. `req_factory` is a
    zero-arg callable returning a fresh urllib Request (a Request can't be reused
    after a failed send)."""
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return urllib.request.urlopen(req_factory(), timeout=180)
        except urllib.error.HTTPError as e:
            code = e.code
            if code in (400, 413):
                # Read a snippet of the error body for diagnosis, then give up
                # (neither a too-large body nor a malformed/billing 400 is helped
                # by retrying). Distinguish a genuine SIZE rejection (the original
                # 91-page failure) from other 400s (billing, auth, bad request) so
                # the log is accurate and a real size regression stays obvious.
                try:
                    detail = e.read().decode("utf-8", "replace")[:300]
                except Exception:
                    detail = ""
                low = detail.lower()
                size_signal = code == 413 or any(
                    k in low for k in (
                        "too large", "payload", "request entity",
                        "maximum", "image", "too many", "tokens", "exceed",
                    )
                )
                if size_signal:
                    raise PayloadTooLargeError(
                        f"HTTP {code} (payload/size) from {who}: {detail}"
                    ) from e
                raise RuntimeError(f"HTTP {code} from {who}: {detail}") from e
            if code == 429 or 500 <= code < 600:
                last_exc = e
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE_S * (2 ** (attempt - 1))
                    print(f"      [retry {attempt}/{MAX_RETRIES}] {who} HTTP {code}; "
                          f"backing off {wait}s", file=sys.stderr)
                    time.sleep(wait)
                    continue
            raise  # other 4xx (401/403/404) — not transient
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF_BASE_S * (2 ** (attempt - 1))
                print(f"      [retry {attempt}/{MAX_RETRIES}] {who} {type(e).__name__}; "
                      f"backing off {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError(f"{who}: exhausted retries with no exception captured")


def call_openrouter(model: str, messages: list[dict], max_tokens: int = 4096) -> str:
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.1,
    }).encode("utf-8")

    def _make_req():
        return urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://forgeos.fractionalforge.com",
            },
            method="POST",
        )

    with _http_post_with_retries(_make_req, f"OpenRouter[{model}]") as resp:
        body_bytes = resp.read().decode("utf-8").strip()
        # OpenRouter sometimes prepends whitespace before the JSON object
        start = body_bytes.find("{")
        body = json.loads(body_bytes[start:])
    return body["choices"][0]["message"]["content"]


def call_anthropic(model: str, messages: list[dict], max_tokens: int = 4096) -> str:
    # Note: claude-opus-4-7 does not accept `temperature` — omit it.
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    def _make_req():
        return urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "x-api-key": ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            method="POST",
        )

    with _http_post_with_retries(_make_req, f"Anthropic[{model}]") as resp:
        body = json.loads(resp.read())
    return body["content"][0]["text"]


def build_messages(pngs: list[Path], slug: str) -> list[dict]:
    """Build the multimodal message with all PDF pages as images."""
    section_list = "\n".join(f"  - {s}" for s in SECTIONS)
    prompt_text = SCORING_PROMPT.format(section_list=section_list)

    content = [{"type": "text", "text": f"PDF being scored: {slug}\n\n{prompt_text}\n\nPDF pages follow:"}]

    # Send all pages — judges must see the full PDF.
    # Previous `pngs[:12]` cap silently truncated sections past page 12 (e.g. §E
    # Appendix on pages 15-19, V6 BoM after a renderer reorder pushed it to page
    # 11+). See V6-BOM-INVESTIGATION-2026-05-11.md.
    # MAX_PAGES_PER_CALL is a generous safety net for future oversized PDFs.
    for png in pngs[:MAX_PAGES_PER_CALL]:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{encode_image(png)}"},
        })

    return [{"role": "user", "content": content}]


def build_messages_anthropic(pngs: list[Path], slug: str) -> list[dict]:
    """Build Anthropic-format multimodal message."""
    section_list = "\n".join(f"  - {s}" for s in SECTIONS)
    prompt_text = SCORING_PROMPT.format(section_list=section_list)

    content: list[dict] = [{"type": "text", "text": f"PDF being scored: {slug}\n\n{prompt_text}\n\nPDF pages follow:"}]

    # Send all pages — judges must see the full PDF. See note in build_messages().
    for png in pngs[:MAX_PAGES_PER_CALL]:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": encode_image(png),
            },
        })

    return [{"role": "user", "content": content}]


# ─── Per-section scoring (root fix) ─────────────────────────────────────────

# Per-section criterion text, lifted from SCORING_PROMPT so each focused request
# carries the SAME rubric the whole-doc prompt used.
_SECTION_CRITERIA: dict[str, str] = {
    "cover": "professional appearance, product name, class, cost ceiling, page count, any visual element",
    "executive_summary": "3-paragraph narrative (product description / design outcome / next steps), not just a table",
    "brief_requirements": "quantified performance targets, regulatory standards, measurable KPIs",
    "design_modules": "subsystem list with functional descriptions, domain-correct subsystems for this product class",
    "bom": "complete BOM with parts, quantities, unit costs, suppliers, MPNs (not TBD), grade quality",
    "cost_analysis": "total unit cost vs ceiling, cost breakdown by module, credibility of estimates",
    "sourcing_strategy": "supplier identification, lead times, dual-source risk, MOQ discussion",
    "feasibility_notes": "cost verdict, top 3 technical risks with severity, regulatory flags, manufacturing flags",
    "grammar_language": "engineering terminology correctness, no hallucinated subsystems, DRC/grammar pass status",
    "sources_references": "cited sources, search results referenced, credibility",
    "appendix_technical": "any supporting technical data, calculations, datasheets",
    "visual_layout": "overall PDF layout quality, typography, table formatting, BOM legend clarity",
}

SECTION_SCORING_PROMPT = """You are a senior hardware engineering consultant reviewing ONE section of a ForgeOS AI-generated engineering design report (PDF).

You are shown ONLY the page images relevant to this section: **{section_name}**.

Score this section out of 10, where:
- 10 = publication-quality, completely fills the section's purpose for a hardware team
- 8  = clearly present, specific, actionable, minimal gaps
- 6  = present but thin, generic, or missing important sub-content
- 4  = partially present but significant gaps or errors
- 2  = token effort, mostly placeholder or wrong
- 0  = completely absent (these pages do not contain this section) or so wrong it is misleading

Criterion for "{section_name}": {criterion}

CRITICAL: Do NOT default to 10. Reserve 9–10 for genuinely publication-grade content. If the BoM has TBD/placeholder parts, if costs look implausible, if a risk/feasibility section lacks severities, if subsystems look wrong for the product class, or if the pages are mostly boilerplate, score accordingly (≤6). Judge ONLY what is visible on the pages shown.

Return ONLY a JSON object (no code fences, no backticks). Put "score" FIRST and keep "notes" to at most 12 words so the JSON is never truncated:
{{"score": <int 0-10 or null>, "notes": "<≤12-word justification>"}}
"""


def build_section_messages_openrouter(pngs: list[Path], section: str, slug: str) -> list[dict]:
    prompt = SECTION_SCORING_PROMPT.format(
        section_name=build_section_label(section),
        criterion=_SECTION_CRITERIA.get(section, section),
    )
    content: list[dict] = [{
        "type": "text",
        "text": f"PDF: {slug}  ·  Section under review: {section}\n\n{prompt}\n\nRelevant pages follow:",
    }]
    for png in pngs:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{encode_image(png)}"},
        })
    return [{"role": "user", "content": content}]


def build_section_messages_anthropic(pngs: list[Path], section: str, slug: str) -> list[dict]:
    prompt = SECTION_SCORING_PROMPT.format(
        section_name=build_section_label(section),
        criterion=_SECTION_CRITERIA.get(section, section),
    )
    content: list[dict] = [{
        "type": "text",
        "text": f"PDF: {slug}  ·  Section under review: {section}\n\n{prompt}\n\nRelevant pages follow:",
    }]
    for png in pngs:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": encode_image(png),
            },
        })
    return [{"role": "user", "content": content}]


def parse_single_score(raw: str) -> Optional[int]:
    """Extract a single integer `score` from a per-section model response.

    Tolerant of TRUNCATED JSON: when max_tokens cuts the response off mid-`notes`
    string the object never closes, so json.loads fails — but the score we need is
    the FIRST key and is fully present (`{"score": 8, "notes": "The cover...`).
    We therefore try a strict parse first, then fall back to a regex that pulls the
    leading integer `score` out of the partial object. Without this fallback every
    Gemini section read returned None and the whole judge was wrongly dropped."""
    # Quiet strict parse first (don't route through parse_scores, which logs a
    # WARN on every truncated object — that would spam 12× per model).
    import re
    text = raw.strip()
    if text.startswith("```"):
        nl = text.find("\n")
        if nl != -1:
            text = text[nl + 1:]
        if text.endswith("```"):
            text = text[: text.rfind("```")].rstrip()
    start = text.find("{")
    if start != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(text, start)
            if isinstance(obj, dict):
                val = obj.get("score")
                if isinstance(val, bool):
                    val = None
                elif isinstance(val, int):
                    return val
                elif isinstance(val, float) and val.is_integer():
                    return int(val)
        except json.JSONDecodeError:
            pass
    # Fallback: regex the score out of a truncated / non-standard object.
    mt = re.search(r'"score"\s*:\s*(null|-?\d+(?:\.\d+)?)', raw)
    if mt:
        tok = mt.group(1)
        if tok == "null":
            return None
        try:
            f = float(tok)
            if f.is_integer():
                return int(f)
        except ValueError:
            pass
    return None


def score_section_with_model(
    model_cfg: dict,
    section: str,
    section_pngs: list[Path],
    slug: str,
) -> Optional[int]:
    """Score ONE section with ONE model from ONLY that section's page images.
    Returns the int score, or None on failure (after retries) — recorded as
    MISSING so a single surviving model can never stand as the calibrated result.
    """
    provider = model_cfg["provider"]
    model = model_cfg["model"]
    if not section_pngs:
        return None
    try:
        if provider == "anthropic":
            messages = build_section_messages_anthropic(section_pngs, section, slug)
            raw = call_anthropic(model, messages, max_tokens=700)
        else:
            messages = build_section_messages_openrouter(section_pngs, section, slug)
            raw = call_openrouter(model, messages, max_tokens=700)
        return parse_single_score(raw)
    except PayloadTooLargeError as e:
        # Should not happen with ≤8 images; surface loudly if it does.
        print(f"      ! {model_cfg['label']} / {section}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"      ! {model_cfg['label']} / {section} ERROR: {e}", file=sys.stderr)
        return None


def score_pdf_per_section(
    pdf_path: Path,
    all_pngs: list[Path],
    slug: str,
) -> dict[str, dict[str, Optional[int]]]:
    """ROOT-FIX scoring path. For each model × each of the 12 sections, send ONLY
    that section's page subset and collect the score. Returns
    {section: {model_id: score_or_None}} — the same structure the markdown and
    calibration code already consume.

    Image subsets are cached per (page-tuple) so identical page sets (e.g. bom and
    cost_analysis both reading the COST BY MODULE pages) don't double-encode.
    """
    num_pages = len(all_pngs)
    section_map = build_section_page_map(pdf_path, num_pages)

    # Pre-compute the page subset + PNG list per section (with the small payload
    # safety re-render baked in by render_section_pngs).
    section_pngs: dict[str, list[Path]] = {}
    for section in SECTIONS:
        pages = select_section_pages(section, section_map, num_pages)
        section_pngs[section] = render_section_pngs(all_pngs, pages, pdf_path)
        print(f"    · {section:<20} pages {pages}")

    results: dict[str, dict[str, Optional[int]]] = {s: {} for s in SECTIONS}
    for model_cfg in MODELS:
        mid = model_cfg["id"]
        label = model_cfg["label"]
        print(f"    → {label} (per-section)...", flush=True)
        ok = 0
        fail = 0
        for section in SECTIONS:
            score = score_section_with_model(model_cfg, section, section_pngs[section], slug)
            results[section][mid] = score
            if score is None:
                fail += 1
            else:
                ok += 1
        status = f"OK ({ok}/{len(SECTIONS)} sections)"
        if fail:
            status += f", {fail} missing"
        print(f"      {label}: {status}")
    return results


def parse_scores(raw: str) -> dict:
    """Extract JSON scores from LLM response."""
    # Strip code fences
    raw = raw.strip()
    if raw.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = raw.find("\n")
        if first_newline != -1:
            raw = raw[first_newline + 1:]
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")].rstrip()

    # Find the first { and try to parse from there using json.JSONDecoder
    start = raw.find("{")
    if start == -1:
        print(f"  [WARN] No JSON object found in response: {raw[:200]}", file=sys.stderr)
        return {}

    # Use json.JSONDecoder.raw_decode to find the first complete JSON object
    decoder = json.JSONDecoder()
    try:
        obj, _ = decoder.raw_decode(raw, start)
        return obj
    except json.JSONDecodeError as e:
        # Fallback: try rfind approach
        end = raw.rfind("}") + 1
        if end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
        print(f"  [WARN] JSON parse error: {e} — raw snippet: {raw[start:start+200]}", file=sys.stderr)
        return {}


def score_pdf_with_model(model_cfg: dict, pngs: list[Path], slug: str) -> dict:
    """DEPRECATED whole-PDF scoring path — sent every page in ONE request, which
    HTTP-400'd on large dossiers (the 91-page failure this module was fixed for).
    Replaced by score_pdf_per_section() / score_section_with_model(). Retained only
    so any external importer doesn't break; NOT on the active scoring path.

    Score a PDF with one model. Returns dict of section → score."""
    provider = model_cfg["provider"]
    model    = model_cfg["model"]
    label    = model_cfg["label"]

    print(f"    → {label}...", end=" ", flush=True)

    try:
        if provider == "anthropic":
            messages = build_messages_anthropic(pngs, slug)
            raw = call_anthropic(model, messages)
        else:
            messages = build_messages(pngs, slug)
            raw = call_openrouter(model, messages)

        scores = parse_scores(raw)
        print(f"OK ({len([v for v in scores.values() if isinstance(v, int)])} sections scored)")
        return scores

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return {}


# ─── Calibration ──────────────────────────────────────────────────────────

def calibrate_section(scores_by_model: dict[str, Optional[int]]) -> Optional[float]:
    """
    Drop outlier if it is ≥3 below the other two. Return mean of remaining.
    scores_by_model: {model_id: score or None}
    """
    valid = [(mid, s) for mid, s in scores_by_model.items() if isinstance(s, int)]
    if not valid:
        return None
    if len(valid) == 1:
        return float(valid[0][1])

    values = [s for _, s in valid]
    if len(values) == 2:
        return sum(values) / 2

    # 3 values: check for outlier
    sorted_vals = sorted(values)
    low = sorted_vals[0]
    mid_high_avg = (sorted_vals[1] + sorted_vals[2]) / 2
    if mid_high_avg - low >= 3:
        # Drop the low outlier
        remaining = sorted_vals[1:]
    else:
        remaining = sorted_vals

    return sum(remaining) / len(remaining)


def section_model_count(scores_by_model: dict[str, Optional[int]]) -> int:
    """How many models returned an integer score for this section."""
    return sum(1 for s in scores_by_model.values() if isinstance(s, int))


def section_is_confident(scores_by_model: dict[str, Optional[int]]) -> bool:
    """A section is CALIBRATED-confident only if ≥2 models scored it.

    This is the guard that stops the 91-page failure mode: when Claude + Qwen both
    HTTP-400'd, Gemini's lone uniform-10 was reported as a calibrated PASS. With
    the per-section fix that should not recur, but if a single model still fails a
    section we treat that section as low-confidence rather than trusting one judge.
    """
    return section_model_count(scores_by_model) >= MIN_MODELS_FOR_CONFIDENT_SECTION


# ─── Markdown output ──────────────────────────────────────────────────────

def score_cell(mean: Optional[float]) -> str:
    if mean is None:
        return "—"
    if mean >= 8:
        return f"✅{mean:.1f}"
    if mean >= 6:
        return f"~{mean:.1f}"
    return f"❌{mean:.1f}"


def build_section_label(section_id: str) -> str:
    return section_id.replace("_", " ").title()


def compute_delta(v1: Optional[float], v2: Optional[float]) -> str:
    if v1 is None or v2 is None:
        return "—"
    delta = v2 - v1
    if delta > 0:
        return f"+{delta:.1f}"
    if delta < 0:
        return f"{delta:.1f}"
    return "0"


# ─── Main ─────────────────────────────────────────────────────────────────

def load_v1_scores(v1_file: Path) -> dict[str, dict[str, float]]:
    """
    Parse V1 scores from existing markdown.
    Returns {slug_label: {section: mean_score}}
    """
    if not v1_file.exists():
        return {}

    # Parse the heatmap table section
    results: dict[str, dict[str, float]] = {}
    content = v1_file.read_text()

    # Find the heatmap table
    lines = content.split("\n")
    in_table = False
    headers: list[str] = []

    for line in lines:
        if "| Class |" in line and "cover" in line:
            # Header row — extract section names
            parts = [p.strip() for p in line.split("|")[1:-1]]
            headers = parts  # ['Class', 'cover', 'exec_sum', ...]
            in_table = True
            continue

        if in_table:
            if not line.startswith("|"):
                if line.strip():
                    in_table = False
                continue
            if line.startswith("|---"):
                continue

            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) < 2:
                continue

            class_name = parts[0].lower()
            section_map = {
                "exec_sum": "executive_summary",
                "brief_req": "brief_requirements",
                "design_mod": "design_modules",
                "cost": "cost_analysis",
                "sourcing": "sourcing_strategy",
                "feasibility": "feasibility_notes",
                "grammar": "grammar_language",
                "sources": "sources_references",
                "appendix": "appendix_technical",
                "visual": "visual_layout",
            }

            row_scores: dict[str, float] = {}
            for i, val in enumerate(parts[1:], start=1):
                if i >= len(headers):
                    break
                hdr = headers[i]
                # Map header to canonical section id
                sect = section_map.get(hdr, hdr)
                # Parse value: ✅8.3, ~7.0, ❌5.0, —
                val_clean = val.replace("✅", "").replace("~", "").replace("❌", "").strip()
                if val_clean == "—" or not val_clean:
                    row_scores[sect] = None
                else:
                    try:
                        row_scores[sect] = float(val_clean)
                    except ValueError:
                        row_scores[sect] = None

            results[class_name] = row_scores

    return results


def run(args):
    batch_dir = Path(args.batch_dir).expanduser()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    v1_scores: dict[str, dict[str, float]] = {}
    if args.v1_file:
        v1_path = Path(args.v1_file)
        v1_scores = load_v1_scores(v1_path)
        print(f"Loaded V1 scores for {len(v1_scores)} classes from {v1_path}")

    # Find all radical PDFs
    slugs = sorted(SLUG_LABEL.keys())
    pdf_paths: dict[str, Path] = {}
    for slug in slugs:
        radical_pdf = batch_dir / slug / "radical.pdf"
        if radical_pdf.exists():
            pdf_paths[slug] = radical_pdf
        else:
            print(f"  [SKIP] {slug}: no radical.pdf in {batch_dir / slug}")

    if not pdf_paths:
        print("ERROR: No radical.pdf files found. Batch may still be running.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(pdf_paths)} radical PDFs to score")

    # Score each PDF
    all_results: dict[str, dict[str, dict[str, Optional[int]]]] = {}
    # structure: {slug: {section: {model_id: score_or_None}}}

    for slug, pdf_path in pdf_paths.items():
        label = SLUG_LABEL[slug]
        print(f"\n[{label}] {pdf_path}")

        # Render the whole document ONCE at a legible fixed DPI, then score each
        # council section from ONLY its relevant page subset (per-section fix). The
        # old whole-doc-in-one-request path HTTP-400'd on 88-91 page dossiers; this
        # keeps every request tiny regardless of length while preserving legibility.
        print(f"  Converting to PNGs @ {SECTION_RENDER_DPI} DPI (per-section scoring)...")
        pngs = pdf_to_pngs(pdf_path, dpi=SECTION_RENDER_DPI)
        print(f"  {len(pngs)} pages rendered")

        if not pngs:
            print(f"  [SKIP] No pages extracted", file=sys.stderr)
            continue

        slug_results = score_pdf_per_section(pdf_path, pngs, slug)
        all_results[slug] = slug_results

        # ── Permanent score log ──────────────────────────────────────────
        # Compute per-PDF mean NOW (before the markdown pass) so we can
        # record it to the canonical log immediately. Mirrors the per-class
        # average logic used later in the markdown report.
        if _record_council_score is not None:
            section_means: list[float] = []
            low_confidence_sections: list[str] = []
            for section in SECTIONS:
                by_model = slug_results.get(section, {})
                m = calibrate_section(by_model)
                if m is not None:
                    section_means.append(m)
                if not section_is_confident(by_model):
                    low_confidence_sections.append(section)
            pdf_mean = sum(section_means) / len(section_means) if section_means else 0.0
            hard_low_conf = [s for s in low_confidence_sections if s in HARD_SECTIONS]

            # Seat scores: mean of calibrated sections per model
            seat_scores: dict[str, float] = {}
            for mc in MODELS:
                mid = mc["id"]
                model_section_scores = [
                    slug_results[s].get(mid)
                    for s in SECTIONS
                    if isinstance(slug_results.get(s, {}).get(mid), int)
                ]
                if model_section_scores:
                    seat_scores[mc["label"]] = round(
                        sum(model_section_scores) / len(model_section_scores), 2
                    )

            # Attempt to read the current git commit SHA for traceability
            try:
                sha = subprocess.check_output(
                    ["git", "rev-parse", "--short", "HEAD"],
                    cwd=str(Path(__file__).parent.parent),
                    stderr=subprocess.DEVNULL,
                    text=True,
                ).strip() or None
            except Exception:
                sha = None

            run_tag = getattr(args, "run_tag", None) or ""
            product_class = getattr(args, "product_class", None) or slug

            confidence_ok = not hard_low_conf
            note = ""
            if hard_low_conf:
                note = (f"LOW-CONFIDENCE: {len(hard_low_conf)} HARD section(s) scored by "
                        f"<{MIN_MODELS_FOR_CONFIDENT_SECTION} models — manual review "
                        f"required: {', '.join(hard_low_conf)}")
            _record_council_score({
                "ts": datetime.now(timezone.utc).isoformat(),
                "product_class": product_class,
                "run_tag": run_tag,
                "pdf_path": str(pdf_path),
                "chain_commit_sha": sha,
                "seats": seat_scores,
                "mean": round(pdf_mean, 4),
                "gate": 8.0,
                "pass": (pdf_mean >= 8.0) and confidence_ok,
                "notes": note,
                "backfilled": False,
                "confidence_ok": confidence_ok,
                "low_confidence_sections": low_confidence_sections,
                "section_model_counts": {
                    s: section_model_count(slug_results.get(s, {})) for s in SECTIONS
                },
            })
            conf_flag = "" if confidence_ok else f"  ⚠ {len(hard_low_conf)} HARD low-conf"
            print(f"  [log] Recorded {slug} mean={pdf_mean:.2f}{conf_flag} → council-scores.jsonl")

        time.sleep(1)  # Brief pause between PDFs

    # Build markdown report
    lines: list[str] = []
    lines.append("# Multimodal Council Scores — V2 Radical Phase 5 PDFs")
    lines.append("")
    lines.append(f"**Date:** 2026-05-10  ")
    lines.append(f"**Shadow batch:** `{batch_dir.name}`  ")
    lines.append(f"**Council models:** `google/gemini-3.1-pro-preview` · `anthropic/claude-opus-4-7` · `qwen/qwen3-vl-235b-a22b-instruct`")
    lines.append(f"**Methodology:** 150 DPI PNG conversion via `pdftoppm`; 3-LLM multimodal scoring per PDF; outlier calibration (drop score ≥3 below other two); mean of calibrated valid scores per cell.  ")
    lines.append(f"**Changes scored:** P1 template cross-contamination fix, P2 Feasibility Assessment section, P3 Executive Summary section, DRC rename, BOM legend fix.")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Per-class section scores
    total_cells_v2 = 0
    cells_ge8_v2 = 0
    total_cells_v1 = 41  # from V1
    cells_ge8_v1 = 41    # from V1

    class_summaries: list[dict] = []

    for slug in slugs:
        if slug not in all_results:
            continue
        label = SLUG_LABEL[slug]
        slug_results = all_results[slug]

        lines.append(f"### {label}")
        lines.append("")
        lines.append("| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |")
        lines.append("|---|---|---|---|---|---|")

        class_ge8 = 0
        class_present = 0
        class_total_score = 0.0

        for section in SECTIONS:
            by_model = slug_results.get(section, {})
            g = by_model.get("gemini")
            c = by_model.get("claude")
            q = by_model.get("qwen")

            mean = calibrate_section(by_model)

            g_str = str(g) if g is not None else "—"
            c_str = str(c) if c is not None else "—"
            q_str = str(q) if q is not None else "—"

            if mean is not None:
                mean_str = f"**{mean:.2f}**"
                if mean >= 8:
                    mean_str += " ✅"
                    class_ge8 += 1
                    cells_ge8_v2 += 1
                total_cells_v2 += 1
                class_present += 1
                class_total_score += mean
            else:
                mean_str = "**—**"

            # V1 comparison
            v1_key = label.lower()
            v1_section_map = {
                "executive_summary": "exec_sum",
                "brief_requirements": "brief_req",
                "design_modules": "design_mod",
                "cost_analysis": "cost",
                "sourcing_strategy": "sourcing",
                "feasibility_notes": "feasibility",
                "grammar_language": "grammar",
                "sources_references": "sources",
                "appendix_technical": "appendix",
                "visual_layout": "visual",
            }
            v1_sect_key = v1_section_map.get(section, section)
            v1_val = v1_scores.get(v1_key, {}).get(v1_sect_key) if v1_scores else None
            delta_str = compute_delta(v1_val, mean)

            lines.append(f"| {build_section_label(section)} | {g_str} | {c_str} | {q_str} | {mean_str} | {delta_str} |")

        class_avg = class_total_score / class_present if class_present > 0 else 0
        lines.append("")
        lines.append(f"**Overall average: {class_avg:.2f}/10** ({class_ge8}/{class_present} sections ≥8)")
        lines.append("")
        lines.append("---")
        lines.append("")

        class_summaries.append({
            "slug": slug,
            "label": label,
            "avg": class_avg,
            "ge8": class_ge8,
            "present": class_present,
        })

    # Overall heatmap
    lines.append("## Overall V2 heatmap")
    lines.append("")
    lines.append("| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|")

    heatmap_section_order = [
        "cover", "executive_summary", "brief_requirements", "design_modules",
        "bom", "cost_analysis", "sourcing_strategy", "feasibility_notes",
        "grammar_language", "sources_references", "appendix_technical", "visual_layout"
    ]

    for slug in slugs:
        if slug not in all_results:
            continue
        label = SLUG_LABEL[slug]
        slug_results = all_results[slug]
        row = [label.lower()]
        for section in heatmap_section_order:
            by_model = slug_results.get(section, {})
            mean = calibrate_section(by_model)
            row.append(score_cell(mean))
        lines.append("| " + " | ".join(row) + " |")

    lines.append("")
    lines.append("---")
    lines.append("")

    # Summary stats
    lines.append("## V1 → V2 Progress Summary")
    lines.append("")
    lines.append(f"| Metric | V1 (commit `6d013046`) | V2 (commit `cfc877df`) | Delta |")
    lines.append("|---|---|---|---|")
    lines.append(f"| Cells ≥8/10 | 41/113 (36%) | {cells_ge8_v2}/{total_cells_v2} ({100*cells_ge8_v2//max(total_cells_v2,1)}%) | {cells_ge8_v2 - 41:+d} cells |")
    lines.append(f"| Target (≥65/113) | ❌ | {'✅' if cells_ge8_v2 >= 65 else '❌'} | — |")
    lines.append("")

    # Per-class ranking
    lines.append("## Per-class average (V2, sorted highest to lowest)")
    lines.append("")
    lines.append("| Rank | Product class | V2 avg | V1 avg | Delta | Sections ≥8 |")
    lines.append("|---|---|---|---|---|---|")

    sorted_summaries = sorted(class_summaries, key=lambda x: x["avg"], reverse=True)
    for rank, cs in enumerate(sorted_summaries, 1):
        v1_key = cs["label"].lower()
        # Get V1 avg from the heatmap data we parsed... we don't have it directly
        # so skip for now and just show V2
        lines.append(f"| {rank} | {cs['label']} | **{cs['avg']:.2f}/10** | — | — | {cs['ge8']}/{cs['present']} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("_Generated by `scripts/score-radical-pdfs-multimodal.py`_")

    output_path.write_text("\n".join(lines))
    print(f"\n✓ Report written to {output_path}")
    print(f"  V2: {cells_ge8_v2}/{total_cells_v2} cells ≥8/10 ({100*cells_ge8_v2//max(total_cells_v2,1)}%)")
    print(f"  V1: 41/113 cells ≥8/10 (36%)")
    print(f"  Delta: {cells_ge8_v2 - 41:+d} cells")
    target_met = cells_ge8_v2 >= 65
    print(f"  Target (≥65): {'MET' if target_met else 'NOT MET'}")


# ─── Single-PDF mode ──────────────────────────────────────────────────────

def run_single_pdf(args) -> None:
    """
    Score ONE arbitrary PDF at --pdf <path> and record the result.

    Bypasses the hardcoded SLUG_LABEL map and the batch-dir / symlink dance
    that the batch mode requires. Feeds the PDF directly into pdf_to_pngs +
    score_pdf_with_model + calibrate, then records to the canonical log.

    Usage:
        python score-radical-pdfs-multimodal.py \\
            --pdf ~/Downloads/engine-evidence/my-run/radical.pdf \\
            --class bess \\
            --run-tag iter-67
    """
    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    product_class = args.product_class
    run_tag = args.run_tag
    output_path = Path(args.output).expanduser() if args.output else None

    print(f"[single-PDF] Scoring: {pdf_path}")
    print(f"  product_class={product_class}  run_tag={run_tag}")

    # Render the WHOLE document ONCE at a legible fixed DPI. We no longer shrink
    # to fit the whole doc into a single request (that path produced ~60 DPI
    # unreadable pages on long dossiers and STILL HTTP-400'd at 91 pages because
    # ~90 images blew the body limit). Instead each council section is scored from
    # only its own ≤8-page subset (build_section_page_map), so payload is never the
    # constraint and we can keep full legibility.
    print(f"  Converting to PNGs @ {SECTION_RENDER_DPI} DPI (per-section scoring)...")
    pngs = pdf_to_pngs(pdf_path, dpi=SECTION_RENDER_DPI)
    print(f"  {len(pngs)} pages rendered")
    if not pngs:
        print("ERROR: No pages extracted.", file=sys.stderr)
        sys.exit(1)

    # Use pdf stem as the label identifier for prompts
    label = pdf_path.stem  # e.g. "radical" or whatever the file is named

    # ROOT FIX: per-section scoring — each (model, section) request carries ONLY
    # that section's relevant pages, so no request exceeds the payload limit
    # regardless of dossier length.
    slug_results = score_pdf_per_section(pdf_path, pngs, label)

    # Compute section means + confidence. A section needs ≥2 models to be a
    # CALIBRATED result; a HARD section with <2 models forces overall FAIL so a
    # lone surviving model's uniform-10 can never be reported as a pass.
    section_means: list[float] = []
    low_confidence_sections: list[str] = []
    print("\n  Section scores (calibrated, [n] = models that scored it):")
    for section in SECTIONS:
        by_model = slug_results.get(section, {})
        m = calibrate_section(by_model)
        n = section_model_count(by_model)
        confident = section_is_confident(by_model)
        if not confident:
            low_confidence_sections.append(section)
        if m is not None:
            section_means.append(m)
            flag = " ✅" if m >= 8.0 else ""
            conf = "" if confident else "  ⚠ LOW-CONF (needs manual)"
            print(f"    {section:<30} {m:.2f} [{n}]{flag}{conf}")
        else:
            print(f"    {section:<30} —   [0]  ⚠ MISSING (no model scored)")

    pdf_mean = sum(section_means) / len(section_means) if section_means else 0.0

    # Pass requires the gate AND that no HARD content section is low-confidence.
    hard_low_conf = [s for s in low_confidence_sections if s in HARD_SECTIONS]
    confidence_ok = not hard_low_conf
    passed = (pdf_mean >= 8.0) and confidence_ok

    # Guard against the exact regression this fix targets: a uniform result from a
    # single surviving model. If every scored section has the identical value and
    # ≥half the sections are single-model, that is the degraded-to-one-judge
    # signature — never a pass.
    scored_vals = [calibrate_section(slug_results[s]) for s in SECTIONS]
    scored_vals = [v for v in scored_vals if v is not None]
    uniform = len(set(scored_vals)) == 1 and len(scored_vals) >= 2
    single_model_heavy = len(hard_low_conf) >= 1
    if uniform and single_model_heavy:
        passed = False
        confidence_ok = False

    print(f"\n  Overall mean: {pdf_mean:.2f}/10  gate=8.0  {'PASS ✅' if passed else 'FAIL ❌'}")
    if hard_low_conf:
        print(f"  ⚠ FAIL reason: {len(hard_low_conf)} HARD section(s) scored by <2 models "
              f"(needs manual review): {', '.join(hard_low_conf)}", file=sys.stderr)
    if low_confidence_sections:
        print(f"  Low-confidence sections (<2 models): {', '.join(low_confidence_sections)}")

    # Seat scores: mean of calibrated section scores per model
    seat_scores: dict[str, float] = {}
    for mc in MODELS:
        mid = mc["id"]
        model_section_scores = [
            slug_results[s].get(mid)
            for s in SECTIONS
            if isinstance(slug_results.get(s, {}).get(mid), int)
        ]
        if model_section_scores:
            seat_scores[mc["label"]] = round(
                sum(model_section_scores) / len(model_section_scores), 2
            )

    # Attempt to read current git commit SHA
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(Path(__file__).parent.parent),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip() or None
    except Exception:
        sha = None

    # Record permanently
    _log_path = Path("~/Downloads/engine-evidence/council-scores.jsonl").expanduser()
    if _record_council_score is not None:
        note = ""
        if hard_low_conf:
            note = (f"LOW-CONFIDENCE: {len(hard_low_conf)} HARD section(s) scored by "
                    f"<{MIN_MODELS_FOR_CONFIDENT_SECTION} models — manual review "
                    f"required: {', '.join(hard_low_conf)}")
        _record_council_score({
            "ts": datetime.now(timezone.utc).isoformat(),
            "product_class": product_class,
            "run_tag": run_tag,
            "pdf_path": str(pdf_path),
            "chain_commit_sha": sha,
            "seats": seat_scores,
            "mean": round(pdf_mean, 4),
            "gate": 8.0,
            "pass": passed,
            "notes": note,
            "backfilled": False,
            # Confidence metadata so a degraded run is never silently a "pass".
            "confidence_ok": confidence_ok,
            "low_confidence_sections": low_confidence_sections,
            "section_model_counts": {
                s: section_model_count(slug_results.get(s, {})) for s in SECTIONS
            },
        })
        print(f"  [log] Recorded → {_log_path}")
    else:
        print("  [WARN] Recorder not available — score was NOT persisted.", file=sys.stderr)

    # Optional markdown output
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        md_lines = [
            f"# Council Scores — {product_class} / {run_tag}",
            "",
            f"**PDF:** `{pdf_path}`  ",
            f"**run_tag:** `{run_tag}`  ",
            f"**product_class:** `{product_class}`  ",
            f"**commit:** `{sha or 'unknown'}`",
            "",
            "| Section | Gemini | Claude | Qwen | n | **Mean** | Confidence |",
            "|---|---|---|---|---|---|---|",
        ]
        for section in SECTIONS:
            by_model = slug_results.get(section, {})
            g = by_model.get("gemini")
            c = by_model.get("claude")
            q = by_model.get("qwen")
            m = calibrate_section(by_model)
            n = section_model_count(by_model)
            g_s = str(g) if g is not None else "—"
            c_s = str(c) if c is not None else "—"
            q_s = str(q) if q is not None else "—"
            m_s = f"**{m:.2f}**{'  ✅' if m is not None and m >= 8 else ''}" if m is not None else "**—**"
            conf = "OK" if section_is_confident(by_model) else "⚠ low (manual)"
            md_lines.append(f"| {build_section_label(section)} | {g_s} | {c_s} | {q_s} | {n} | {m_s} | {conf} |")
        md_lines += [
            "",
            f"**Overall mean: {pdf_mean:.2f}/10** — {'PASS ✅' if passed else 'FAIL ❌'}",
        ]
        if hard_low_conf:
            md_lines.append(
                f"\n> ⚠ **Not a clean pass**: {len(hard_low_conf)} HARD section(s) "
                f"scored by fewer than {MIN_MODELS_FOR_CONFIDENT_SECTION} models "
                f"({', '.join(hard_low_conf)}) — manual review required."
            )
        md_lines += [
            "",
            "_Generated by `scripts/score-radical-pdfs-multimodal.py --pdf` (per-section scoring)_",
        ]
        output_path.write_text("\n".join(md_lines))
        print(f"  Report written to {output_path}")


# ─── Entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Multimodal council scorer for Radical PDFs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Modes:

  Batch mode (score 10 baseline slugs from a shadow-batch dir):
    python score-radical-pdfs-multimodal.py \\
        --batch-dir ~/Downloads/engine-evidence/radical-shadow-20260510T2109 \\
        --output eval-harness/COUNCIL-SCORES-V2.md

  Single-PDF mode (score any arbitrary PDF, no symlink dance):
    python score-radical-pdfs-multimodal.py \\
        --pdf ~/Downloads/engine-evidence/my-run/rs-bess/radical.pdf \\
        --class bess \\
        --run-tag iter-67
""",
    )

    # ── Shared optional args ──────────────────────────────────────────────
    parser.add_argument("--output", help="Output markdown report path (optional in single-PDF mode)")
    parser.add_argument("--run-tag", default="", help="Tag for this scoring run, e.g. iter-67 (used in log)")
    parser.add_argument("--product-class", "--class", dest="product_class", help="Product class slug, e.g. bess (single-PDF mode). --class is an accepted alias.")

    # ── Batch-mode args ───────────────────────────────────────────────────
    parser.add_argument("--batch-dir", help="[Batch mode] Path to shadow batch directory")
    parser.add_argument("--v1-file", help="[Batch mode] V1 scores file for delta comparison")
    parser.add_argument("--slugs", nargs="+", help="[Batch mode] Limit to specific slugs (e.g. rs-drone rs-cgm)")

    # ── Single-PDF mode arg ───────────────────────────────────────────────
    parser.add_argument("--pdf", help="[Single-PDF mode] Path to a PDF to score directly")

    args = parser.parse_args()

    # ── Mode dispatch ─────────────────────────────────────────────────────
    if args.pdf:
        # Single-PDF mode
        if not args.product_class:
            parser.error("--class is required in single-PDF mode (e.g. --class bess)")
        if not args.run_tag:
            parser.error("--run-tag is required in single-PDF mode (e.g. --run-tag iter-67)")
        # Map --product-class → args.product_class already handled by dest=
        run_single_pdf(args)
    else:
        # Batch mode
        if not args.batch_dir:
            parser.error("--batch-dir is required in batch mode (or use --pdf for single-PDF mode)")
        if not args.output:
            parser.error("--output is required in batch mode")

        if args.slugs:
            SLUG_LABEL_FILTERED = {k: v for k, v in SLUG_LABEL.items() if k in args.slugs}
            globals()["SLUG_LABEL"] = SLUG_LABEL_FILTERED

        run(args)
