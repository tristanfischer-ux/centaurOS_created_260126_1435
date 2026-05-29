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

# Maximum PDF pages sent per scoring call. The corpus today is 17–22 pages
# per PDF; this hard cap protects against a future PDF being silently
# enormous and blowing the multimodal request budget. Per-judge image limits
# (Anthropic Opus 4.7 = 100 images/msg, OpenRouter ≈10 MB body) are still the
# physical ceiling — this is a softer safety net.
MAX_PAGES_PER_CALL = 40

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


def encode_image(path: Path) -> str:
    """Base64-encode a PNG file."""
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8")


# ─── API calls ────────────────────────────────────────────────────────────

def call_openrouter(model: str, messages: list[dict], max_tokens: int = 4096) -> str:
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.1,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENROUTER_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.fractionalforge.com",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
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
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
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
    """Score a PDF with one model. Returns dict of section → score."""
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

        # Convert to PNGs
        print(f"  Converting to PNGs...")
        pngs = pdf_to_pngs(pdf_path)
        print(f"  {len(pngs)} pages")

        if not pngs:
            print(f"  [SKIP] No pages extracted", file=sys.stderr)
            continue

        slug_results: dict[str, dict[str, Optional[int]]] = {s: {} for s in SECTIONS}

        for model_cfg in MODELS:
            mid = model_cfg["id"]
            model_scores = score_pdf_with_model(model_cfg, pngs, slug)
            for section in SECTIONS:
                val = model_scores.get(section)
                slug_results[section][mid] = val if isinstance(val, int) else None

        all_results[slug] = slug_results

        # ── Permanent score log ──────────────────────────────────────────
        # Compute per-PDF mean NOW (before the markdown pass) so we can
        # record it to the canonical log immediately. Mirrors the per-class
        # average logic used later in the markdown report.
        if _record_council_score is not None:
            section_means: list[float] = []
            for section in SECTIONS:
                by_model = slug_results.get(section, {})
                m = calibrate_section(by_model)
                if m is not None:
                    section_means.append(m)
            pdf_mean = sum(section_means) / len(section_means) if section_means else 0.0

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

            _record_council_score({
                "ts": datetime.now(timezone.utc).isoformat(),
                "product_class": product_class,
                "run_tag": run_tag,
                "pdf_path": str(pdf_path),
                "chain_commit_sha": sha,
                "seats": seat_scores,
                "mean": round(pdf_mean, 4),
                "gate": 8.0,
                "pass": pdf_mean >= 8.0,
                "notes": "",
                "backfilled": False,
            })
            print(f"  [log] Recorded {slug} mean={pdf_mean:.2f} → council-scores.jsonl")

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

    # Convert to PNGs
    print("  Converting to PNGs...")
    pngs = pdf_to_pngs(pdf_path)
    print(f"  {len(pngs)} pages")
    if not pngs:
        print("ERROR: No pages extracted.", file=sys.stderr)
        sys.exit(1)

    # Use pdf stem as the label identifier for prompts
    label = pdf_path.stem  # e.g. "radical" or whatever the file is named

    slug_results: dict[str, dict[str, Optional[int]]] = {s: {} for s in SECTIONS}
    for model_cfg in MODELS:
        mid = model_cfg["id"]
        model_scores = score_pdf_with_model(model_cfg, pngs, label)
        for section in SECTIONS:
            val = model_scores.get(section)
            slug_results[section][mid] = val if isinstance(val, int) else None

    # Compute section means and overall mean
    section_means: list[float] = []
    print("\n  Section scores (calibrated):")
    for section in SECTIONS:
        by_model = slug_results.get(section, {})
        m = calibrate_section(by_model)
        if m is not None:
            section_means.append(m)
            flag = " ✅" if m >= 8.0 else ""
            print(f"    {section:<30} {m:.2f}{flag}")
        else:
            print(f"    {section:<30} —")

    pdf_mean = sum(section_means) / len(section_means) if section_means else 0.0
    passed = pdf_mean >= 8.0

    print(f"\n  Overall mean: {pdf_mean:.2f}/10  gate=8.0  {'PASS ✅' if passed else 'FAIL ❌'}")

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
            "notes": "",
            "backfilled": False,
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
            "| Section | Gemini | Claude | Qwen | **Mean** |",
            "|---|---|---|---|---|",
        ]
        for section in SECTIONS:
            by_model = slug_results.get(section, {})
            g = by_model.get("gemini")
            c = by_model.get("claude")
            q = by_model.get("qwen")
            m = calibrate_section(by_model)
            g_s = str(g) if g is not None else "—"
            c_s = str(c) if c is not None else "—"
            q_s = str(q) if q is not None else "—"
            m_s = f"**{m:.2f}**{'  ✅' if m is not None and m >= 8 else ''}" if m is not None else "**—**"
            md_lines.append(f"| {build_section_label(section)} | {g_s} | {c_s} | {q_s} | {m_s} |")
        md_lines += [
            "",
            f"**Overall mean: {pdf_mean:.2f}/10** — {'PASS ✅' if passed else 'FAIL ❌'}",
            "",
            "_Generated by `scripts/score-radical-pdfs-multimodal.py --pdf`_",
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
