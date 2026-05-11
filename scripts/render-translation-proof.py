#!/usr/bin/env python3
"""
render-translation-proof.py — emit a NEW ForgeOS Radical engine "translation
chain" HTML across multiple product classes from existing batch snapshots.

Concept (per Tristan, 2026-05-11):
  Visualise the FULL translation chain — English brief → glyph IR →
  radical decomposition → assemblers + product list + BOM. Each layer
  must be checkable against the previous, so engine bugs surface
  visually at the point of failure rather than in a flat tree.

Layers per brief sentence:
  L1  Brief sentence (verbatim English)
  L2  Glyph translation     (engineering radicals as inline SVG glyphs)
  L3  Decomposition         (sentence → words → characters from the tree)
  L4  Assemblers + Product  (resolved leaves: MPN, manufacturer, grade, lead)
  L5  BoM contribution      (sum of (qty × unit_price_gbp) for those leaves)

NO new pipeline runs. Reads state.json from a batch dir.

Usage:
    python3 scripts/render-translation-proof.py \
        --batch-dir ~/Downloads/engine-evidence/radical-shadow-20260511T0429 \
        --output ~/Downloads/radical-translation-proof-v4.html
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from html import escape
from pathlib import Path
from typing import Any

REPO = Path("/Users/tristanfischer/Developer/CentaurOS created 260126 1435")
BRIEF_DIR = REPO / "src/lib/pdf-engine-v2/briefs/baseline-10"
GLYPHS_HTML = REPO / "src/lib/pdf-engine-v2/radical/glyphs/RADICAL-GLYPHS-V0.html"
GRAMMAR_PASS = REPO / "src/lib/pdf-engine-v2/radical/demo/grammar-pass.ts"
HIERARCHY_TS = REPO / "src/lib/pdf-engine-v2/radical/character-hierarchy.ts"

# ── Product set (slug → display title, brief filename) ──────────────────────
PRODUCTS: list[tuple[str, str, str]] = [
    ("rs-bess", "Containerised 3.5 MWh BESS", "09-bess-container.md"),
    ("rs-heatpump", "30 kW R290 Air-to-Water Heat Pump", "04-heatpump-30kw.md"),
    ("rs-cgm", "14-day Wearable Continuous Glucose Monitor", "01-cgm-wearable.md"),
    ("rs-farm", "Modular Indoor Vertical Farm Unit", "07-vertical-farm.md"),
    ("rs-drone", "4K Consumer Cinematography Drone", "02-drone-prosumer.md"),
]


# ── Glyph extraction ────────────────────────────────────────────────────────

def extract_glyphs() -> dict[str, dict]:
    """
    Load GLYPHS catalogue from RADICAL-GLYPHS-V0.html. The catalogue is JS with
    string-concatenation expressions (e.g. '<path d="' + hex() + '"...'), so we
    invoke `node` to evaluate it and dump the rendered SVG strings as JSON.
    Returns id → {label, cat, svg32, svg64}.
    """
    import subprocess

    html = GLYPHS_HTML.read_text()
    start = html.find("function sw(sz){")
    if start < 0:
        raise RuntimeError("could not locate `function sw(sz){` in glyphs HTML")
    solid_idx = html.find("var SOLID_STATE")
    if solid_idx < 0:
        raise RuntimeError("could not locate `var SOLID_STATE` in glyphs HTML")
    # End of SOLID_STATE definition: closing `} };` of the object literal.
    end_brace = html.find("} };", solid_idx)
    if end_brace < 0:
        raise RuntimeError("could not locate end of SOLID_STATE literal")
    js_block = html[start : end_brace + 4]

    node_script = (
        js_block
        + """
var dump = {};
for (var i = 0; i < GLYPHS.length; i++) {
  var glyph = GLYPHS[i];
  dump[glyph.id] = { label: glyph.label, cat: glyph.cat, svg32: glyph.svg(32), svg64: glyph.svg(64) };
}
dump[SOLID_STATE.id] = { label: SOLID_STATE.label, cat: SOLID_STATE.cat, svg32: SOLID_STATE.svg(32), svg64: SOLID_STATE.svg(64) };
console.log(JSON.stringify(dump));
"""
    )
    proc = subprocess.run(
        ["node", "--input-type=commonjs", "-e", node_script],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"node failed: {proc.stderr}")
    return json.loads(proc.stdout)


def render_glyph_badge(rid: str, glyphs: dict[str, dict]) -> str:
    """Render a single glyph either as SVG (if known) or as a fallback text badge."""
    g = glyphs.get(rid)
    label = (g or {}).get("label", rid.replace("_", " "))
    cat = (g or {}).get("cat", "unknown")
    cat_class = f"cat-{cat}"
    if g and g.get("svg32"):
        svg = g["svg32"]
        return (
            f'<div class="glyph-tile" title="{escape(rid)}">'
            f'  <div class="glyph-tile-svg {cat_class}">{svg}</div>'
            f'  <div class="glyph-tile-label">{escape(label)}</div>'
            f'</div>'
        )
    # Fallback text badge for radicals that lack an SVG (referenced by characters
    # but not yet drawn into the glyph library — e.g. mineral_fibre_material).
    return (
        f'<div class="glyph-tile glyph-tile-fallback" title="{escape(rid)}">'
        f'  <div class="glyph-tile-svg cat-unknown">?</div>'
        f'  <div class="glyph-tile-label">{escape(label)}</div>'
        f'</div>'
    )


# ── Character → radicals extraction ─────────────────────────────────────────

def extract_characters() -> dict[str, list[str]]:
    """Parse lib.characters.set('X', { radicals: [...] }) from grammar-pass.ts."""
    src = GRAMMAR_PASS.read_text()
    pattern = re.compile(
        r"lib\.characters\.set\('([^']+)',\s*\{[^}]*?radicals:\s*\[([^\]]+)\]",
        re.DOTALL,
    )
    out: dict[str, list[str]] = {}
    for m in pattern.finditer(src):
        cid = m.group(1)
        rids = [s.strip().strip("'\"") for s in m.group(2).split(",")]
        out[cid] = [r for r in rids if r]
    return out


# ── Hierarchy extraction (sentence → words → characters) ────────────────────

def extract_hierarchy() -> tuple[list[dict], list[dict]]:
    """Parse SENTENCES + WORDS arrays from character-hierarchy.ts."""
    src = HIERARCHY_TS.read_text()
    sentences: list[dict] = []
    s_pattern = re.compile(
        r"\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*words:\s*\[([^\]]+)\][^}]*?\}",
        re.DOTALL,
    )
    for m in s_pattern.finditer(src):
        sid = m.group(1)
        label = m.group(2)
        words = [s.strip().strip("'\"") for s in m.group(3).split(",") if s.strip()]
        sentences.append({"id": sid, "label": label, "words": words})

    words: list[dict] = []
    w_pattern = re.compile(
        r"\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*sentence_id:\s*'([^']+)',\s*characters:\s*\[([^\]]+)\][^}]*?\}",
        re.DOTALL,
    )
    for m in w_pattern.finditer(src):
        words.append(
            {
                "id": m.group(1),
                "label": m.group(2),
                "sentence_id": m.group(3),
                "characters": [
                    s.strip().strip("'\"") for s in m.group(4).split(",") if s.strip()
                ],
            }
        )
    return sentences, words


# ── Brief loading + sentence splitting ──────────────────────────────────────

def load_brief(filename: str) -> str:
    path = BRIEF_DIR / filename
    if not path.exists():
        return f"(brief not found: {filename})"
    return path.read_text()


def split_brief_sentences(text: str) -> list[dict]:
    """
    Returns list of {paragraph_idx, paragraph_intro, sentences:[...]} plus a
    flat list of bullet/numbered items. Skips H1, target market, regulatory blocks
    (those don't decompose into engineering subsystems).
    """
    paragraphs: list[dict] = []
    cur_para_idx = -1
    lines = text.splitlines()
    in_skip_block = False
    skip_headers_re = re.compile(r"^\s*(target market|target customer|safety and regulatory|key constraints):", re.I)

    para_buf: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if para_buf:
                paragraphs.append({"raw": " ".join(para_buf), "is_bullet": False})
                para_buf = []
            continue
        if stripped.startswith("#"):
            # heading — flush
            if para_buf:
                paragraphs.append({"raw": " ".join(para_buf), "is_bullet": False})
                para_buf = []
            continue
        if stripped.startswith("- ") or stripped.startswith("* "):
            # bullet
            if para_buf:
                paragraphs.append({"raw": " ".join(para_buf), "is_bullet": False})
                para_buf = []
            paragraphs.append({"raw": stripped[2:].strip(), "is_bullet": True})
            continue
        para_buf.append(stripped)
    if para_buf:
        paragraphs.append({"raw": " ".join(para_buf), "is_bullet": False})

    out: list[dict] = []
    for idx, p in enumerate(paragraphs):
        raw = p["raw"]
        if not raw:
            continue
        # Skip the regulatory/market blocks — they don't translate to subsystems
        if skip_headers_re.match(raw):
            continue
        # Sub-modules expected: ... — keep as a single high-value item
        if raw.lower().startswith("sub-modules expected"):
            # Split each sub-module by comma
            after_colon = raw.split(":", 1)[1] if ":" in raw else raw
            modules = [m.strip().rstrip(".") for m in after_colon.split(",")]
            modules = [m for m in modules if m]
            for m_idx, m in enumerate(modules):
                out.append(
                    {
                        "paragraph_idx": idx,
                        "is_bullet": True,
                        "is_submodule": True,
                        "text": m,
                        "label": f"Sub-module {m_idx+1}",
                    }
                )
            continue
        if p["is_bullet"]:
            out.append(
                {
                    "paragraph_idx": idx,
                    "is_bullet": True,
                    "is_submodule": False,
                    "text": raw,
                    "label": "Constraint",
                }
            )
            continue
        # Split paragraph on sentence boundaries
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", raw)
        for s in sentences:
            s = s.strip()
            if not s:
                continue
            out.append(
                {
                    "paragraph_idx": idx,
                    "is_bullet": False,
                    "is_submodule": False,
                    "text": s,
                    "label": f"Para {idx+1}",
                }
            )
    return out


# ── Tree helpers ────────────────────────────────────────────────────────────

def collect_leaves(node: dict, path: str = "") -> list[tuple[str, dict]]:
    cur_path = path + "/" + node.get("archetypeId", "?")
    children = node.get("children") or []
    if not children:
        return [(cur_path, node)]
    out: list[tuple[str, dict]] = []
    for c in children:
        out.extend(collect_leaves(c, cur_path))
    return out


def collect_sentence_subtrees(root: dict) -> list[dict]:
    """Top-level sentences are direct children of the root node."""
    return root.get("children") or []


# ── Brief sentence → tree node matching ─────────────────────────────────────

# Keyword → archetype hints (used as additional matchers when name overlap fails).
KEYWORD_HINTS: dict[str, list[str]] = {
    "battery management": ["battery_management_system_bms"],
    "bms": ["battery_management_system_bms"],
    "battery rack": ["battery_rack_assembly"],
    "lfp": ["battery_rack_assembly"],
    "prismatic cell": ["battery_rack_assembly"],
    "lithium": ["battery_rack_assembly"],
    "pcs": ["power_conversion_system_pcs"],
    "power conversion": ["power_conversion_system_pcs"],
    "inverter": ["power_conversion_system_pcs"],
    "transformer": ["power_conversion_system_pcs"],
    "switchgear": ["dc_distribution_switchgear"],
    "dc distribution": ["dc_distribution_switchgear"],
    "busbar": ["dc_distribution_switchgear"],
    "thermal": ["thermal_management_system"],
    "cooling": ["thermal_management_system"],
    "fire": ["fire_detection_and_suppression_system_fss"],
    "suppression": ["fire_detection_and_suppression_system_fss"],
    "ems": ["energy_management_system_ems_scada"],
    "scada": ["energy_management_system_ems_scada"],
    "container": ["container_enclosure_fit_out"],
    "enclosure": ["container_enclosure_fit_out", "heat_pump_enclosure", "charger_enclosure"],
    # Heat pump
    "refrigerant": ["refrigerant_circuit"],
    "compressor": ["refrigerant_circuit"],
    "heat exchanger": ["refrigerant_circuit", "hydronic_circuit"],
    "expansion valve": ["refrigerant_circuit"],
    "hydronic": ["hydronic_circuit"],
    "circulation pump": ["hydronic_circuit"],
    "controller": ["heat_pump_controls", "bioreactor_controls", "flight_computer"],
    "inverter drive": ["heat_pump_controls"],
    # CGM
    "biosensor": ["biosensor_system"],
    "glucose": ["biosensor_system"],
    "sensor": ["biosensor_system", "detection_sensors"],
    "patch": ["medical_wearable_enclosure"],
    "housing": ["medical_wearable_enclosure", "heat_pump_enclosure"],
    # Drone
    "airframe": ["airframe_structure", "haps_airframe"],
    "carbon": ["airframe_structure"],
    "motor": ["propulsion_system"],
    "esc": ["propulsion_system"],
    "propeller": ["propulsion_system"],
    "flight": ["flight_computer"],
    "imu": ["flight_computer"],
    # Vfarm
    "growing": ["growing_rack_system"],
    "rack": ["growing_rack_system"],
    "led": ["lighting_system"],
    "lighting": ["lighting_system"],
    "fertigation": ["fertigation_loop"],
    "nutrient": ["fertigation_loop"],
    "co2": ["hvac_co2_system"],
    "hvac": ["hvac_co2_system"],
    "dehumidifier": ["hvac_co2_system"],
}


def match_sentence_to_tree_nodes(
    brief_sentence: str, sentence_subtrees: list[dict]
) -> list[dict]:
    """Best-effort match. Returns list of matched tree-sentence subtrees."""
    text = brief_sentence.lower()
    # Map archetypeId → subtree
    by_id = {s.get("archetypeId", ""): s for s in sentence_subtrees}
    matched: list[dict] = []
    seen: set[str] = set()

    # 1. Direct ID-token overlap
    for s in sentence_subtrees:
        aid = s.get("archetypeId", "")
        # Convert id snake_case → bag of tokens
        tokens = [t for t in aid.split("_") if len(t) > 3]
        for t in tokens:
            if t in text and aid not in seen:
                matched.append(s)
                seen.add(aid)
                break

    # 2. Keyword hints
    for keyword, target_ids in KEYWORD_HINTS.items():
        if keyword in text:
            for tid in target_ids:
                if tid in by_id and tid not in seen:
                    matched.append(by_id[tid])
                    seen.add(tid)

    return matched


# ── Decomposition rendering ─────────────────────────────────────────────────

def render_decomposition(node: dict, indent: int = 0) -> list[str]:
    """Return list of pre-formatted lines for a subtree."""
    lines: list[str] = []
    arch = node.get("archetypeId", "?")
    qty = node.get("quantity", 1)
    children = node.get("children") or []
    pad = "  " * indent
    branch = "└── " if indent > 0 else ""
    lines.append(f"{pad}{branch}{arch} (×{qty})")
    for c in children:
        lines.extend(render_decomposition(c, indent + 1))
    return lines


def collect_subtree_leaves(node: dict) -> list[dict]:
    children = node.get("children") or []
    if not children:
        return [node]
    out: list[dict] = []
    for c in children:
        out.extend(collect_subtree_leaves(c))
    return out


def fmt_gbp(n: float | int | None) -> str:
    if n is None:
        return "—"
    return "£" + f"{n:,.2f}"


def grade_class(grade: str) -> str:
    return {
        "verified": "grade-verified",
        "grade_c": "grade-c",
        "grade_d": "grade-d",
        "data_gap": "grade-gap",
        "stub": "grade-gap",
    }.get(grade, "grade-d")


# ── Per-product rendering ───────────────────────────────────────────────────

def render_product_section(
    slug: str,
    title: str,
    brief_text: str,
    state: dict,
    glyphs: dict[str, dict],
    char_radicals: dict[str, list[str]],
) -> str:
    if not state:
        return f'<section class="product missing"><h2>{escape(title)}</h2><p class="warn">No state.json found for {escape(slug)} — skipped.</p></section>'

    rt = state.get("resolvedRadicalTree") or {}
    comp = rt.get("composition") or {}
    root = comp.get("root") or {}
    sentence_subtrees = collect_sentence_subtrees(root)
    cs = state.get("radicalCostSummary") or {}
    bom_total = cs.get("finalUnitCost", cs.get("bomTotal", 0.0))
    is_over = cs.get("isOverBudget", False)
    over_pct = cs.get("overBudgetPct")

    # Brief split
    brief_items = split_brief_sentences(brief_text)

    # ── Track which tree subtrees got matched (for orphan diagnostic)
    matched_tree_ids: set[str] = set()
    sentence_blocks_html: list[str] = []
    matched_sentence_count = 0

    for item in brief_items:
        text = item["text"]
        label = item["label"]
        is_submodule = item.get("is_submodule", False)
        is_bullet = item.get("is_bullet", False)

        matched_subtrees = match_sentence_to_tree_nodes(text, sentence_subtrees)
        if matched_subtrees:
            matched_sentence_count += 1
            for st in matched_subtrees:
                matched_tree_ids.add(st.get("archetypeId", ""))

        # ── L2: Glyph translation (union of radicals from matched subtrees' leaves)
        glyph_ids: list[str] = []
        glyph_seen: set[str] = set()
        for st in matched_subtrees:
            for leaf in collect_subtree_leaves(st):
                arch = leaf.get("archetypeId", "")
                rids = char_radicals.get(arch, [])
                for r in rids:
                    if r not in glyph_seen:
                        glyph_ids.append(r)
                        glyph_seen.add(r)

        # ── L3: Decomposition lines
        decomp_lines: list[str] = []
        for st in matched_subtrees:
            decomp_lines.extend(render_decomposition(st, indent=0))
            decomp_lines.append("")

        # ── L4: Assemblers + product list (resolved leaves with MPN/grade)
        leaf_rows: list[str] = []
        sentence_bom_total = 0.0
        sentence_unpriced: list[str] = []
        for st in matched_subtrees:
            for leaf in collect_subtree_leaves(st):
                arch = leaf.get("archetypeId", "?")
                res = leaf.get("resolution") or {}
                qty = res.get("qty", leaf.get("quantity", 1))
                mpn = res.get("mpn") or "—"
                mfg = res.get("manufacturer") or "—"
                unit = res.get("unit_price_gbp")
                grade = res.get("verification_grade", "?")
                src = res.get("source", "?")
                lead = res.get("lead_weeks")
                lead_str = f"{lead}w" if lead is not None else "—"
                if isinstance(unit, (int, float)) and unit > 0:
                    line_total = unit * qty
                    sentence_bom_total += line_total
                    unit_disp = f"£{unit:,.2f}"
                    line_disp = f"£{line_total:,.2f}"
                else:
                    unit_disp = "—"
                    line_disp = "—"
                    sentence_unpriced.append(arch)
                leaf_rows.append(
                    f"<tr>"
                    f"<td><code>{escape(arch)}</code></td>"
                    f"<td style='text-align:right'>{escape(str(qty))}</td>"
                    f"<td>{escape(str(mpn))}</td>"
                    f"<td>{escape(str(mfg))}</td>"
                    f"<td style='text-align:right'>{escape(unit_disp)}</td>"
                    f"<td style='text-align:right'>{escape(line_disp)}</td>"
                    f"<td>{escape(src)}</td>"
                    f"<td style='text-align:center'>{escape(lead_str)}</td>"
                    f"<td class='{grade_class(grade)}'>{escape(grade)}</td>"
                    f"</tr>"
                )

        # Render the cluster
        if matched_subtrees:
            glyph_block = (
                f'<div class="glyph-row">{ "".join(render_glyph_badge(rid, glyphs) for rid in glyph_ids[:14]) }</div>'
                if glyph_ids
                else '<p class="muted">(no glyphs — matched leaves have no characters in seed library)</p>'
            )
            decomp_block = f'<pre class="tree">{escape(chr(10).join(decomp_lines))}</pre>'
            if leaf_rows:
                table_block = (
                    '<table class="leaves">'
                    '<thead><tr>'
                    '<th>Character</th><th>Qty</th><th>MPN</th><th>Manufacturer</th>'
                    '<th>Unit £</th><th>Line £</th><th>Source</th><th>Lead</th><th>Grade</th>'
                    '</tr></thead><tbody>'
                    f'{"".join(leaf_rows)}'
                    '</tbody></table>'
                )
            else:
                table_block = '<p class="muted">(no resolved leaves)</p>'
            unpriced_note = ""
            if sentence_unpriced:
                unpriced_note = (
                    f'<div class="warn-pill">⚠️ {len(sentence_unpriced)} unpriced leaf(es): '
                    f"{escape(', '.join(sentence_unpriced))}</div>"
                )
            bom_block = (
                f'<div class="bom-pill">BoM contribution: <strong>{fmt_gbp(sentence_bom_total)}</strong> '
                f"({len(leaf_rows)} leaves)"
                f"{unpriced_note}"
                f'</div>'
            )
            match_pill = (
                f'<span class="match-pill ok">matched → {", ".join(escape(s.get("archetypeId","?")) for s in matched_subtrees)}</span>'
            )
        else:
            glyph_block = '<p class="muted">(no glyphs — no tree match)</p>'
            decomp_block = '<p class="muted">(no decomposition — brief item not represented in tree)</p>'
            table_block = ''
            bom_block = '<div class="bom-pill bom-pill-orphan">BoM contribution: <strong>£0.00</strong> (orphan)</div>'
            match_pill = '<span class="match-pill miss">orphan — brief mentions this but tree has no entry</span>'

        cluster_class = "cluster"
        if not matched_subtrees:
            cluster_class += " cluster-orphan"
        if is_submodule:
            cluster_class += " cluster-submodule"
        elif is_bullet:
            cluster_class += " cluster-bullet"

        sentence_blocks_html.append(
            f'<div class="{cluster_class}">'
            f'  <div class="cluster-header">'
            f'    <span class="cluster-label">{escape(label)}</span>'
            f'    {match_pill}'
            f'  </div>'
            f'  <div class="layer layer-l1">'
            f'    <div class="layer-tag">L1 · BRIEF</div>'
            f'    <div class="layer-content">{escape(text)}</div>'
            f'  </div>'
            f'  <div class="layer layer-l2">'
            f'    <div class="layer-tag">L2 · GLYPH IR</div>'
            f'    <div class="layer-content">{glyph_block}</div>'
            f'  </div>'
            f'  <div class="layer layer-l3">'
            f'    <div class="layer-tag">L3 · DECOMP</div>'
            f'    <div class="layer-content">{decomp_block}</div>'
            f'  </div>'
            f'  <div class="layer layer-l4">'
            f'    <div class="layer-tag">L4 · ASSEMBLERS + PRODUCT</div>'
            f'    <div class="layer-content">{table_block}</div>'
            f'  </div>'
            f'  <div class="layer layer-l5">'
            f'    <div class="layer-tag">L5 · BoM</div>'
            f'    <div class="layer-content">{bom_block}</div>'
            f'  </div>'
            f'</div>'
        )

    # ── Cross-layer correctness check
    all_tree_ids = {s.get("archetypeId", "") for s in sentence_subtrees}
    orphan_tree_ids = sorted(all_tree_ids - matched_tree_ids)
    total_brief_items = len(brief_items)
    pct_matched = (
        (matched_sentence_count / total_brief_items * 100) if total_brief_items else 0
    )

    # All unpriced leaves across the product
    all_leaves = collect_leaves(root)
    unpriced_leaves: list[str] = []
    for _, leaf in all_leaves:
        res = leaf.get("resolution") or {}
        unit = res.get("unit_price_gbp")
        if not (isinstance(unit, (int, float)) and unit > 0):
            unpriced_leaves.append(leaf.get("archetypeId", "?"))

    # Engine bug surface: CGM tree contains hull_and_buoyancy (AUV part) — flag that.
    engine_bugs: list[str] = []
    if slug == "rs-cgm" and any(
        s.get("archetypeId") == "hull_and_buoyancy" for s in sentence_subtrees
    ):
        engine_bugs.append(
            "❌ CGM tree contains <code>hull_and_buoyancy</code> (an AUV sentence) — engine archetype-guard bug P0-3"
        )
    # ISL94212 in non-BESS context = class-aware MCU not applied
    for _, leaf in all_leaves:
        res = leaf.get("resolution") or {}
        mpn = (res.get("mpn") or "").upper()
        arch = leaf.get("archetypeId", "")
        if (
            arch == "pcb_controller"
            and "ISL94212" in mpn
            and slug != "rs-bess"
        ):
            engine_bugs.append(
                f"❌ <code>{escape(slug)}</code> uses ISL94212 (BMS chip) for {escape(arch)} — class-aware MCU not applied (P0-2)"
            )
            break

    # Visible engine bugs in V4 view
    bug_html = (
        '<ul class="bug-list">'
        + "".join(f"<li>{b}</li>" for b in engine_bugs)
        + "</ul>"
        if engine_bugs
        else '<p class="muted">(no class-of-bug heuristics tripped at this layer)</p>'
    )

    correctness_html = (
        f'<div class="correctness">'
        f'  <h3>Cross-layer correctness check</h3>'
        f'  <ul>'
        f'    <li class="ok">✅ {matched_sentence_count} / {total_brief_items} brief items matched a tree subtree ({pct_matched:.0f}%)</li>'
        f'    <li class="warn">⚠️ {len(unpriced_leaves)} leaves unpriced (need quote / vendor catalog placeholder)</li>'
        f'    <li class="{"miss" if orphan_tree_ids else "ok"}">'
        f'      {"❌" if orphan_tree_ids else "✅"} {len(orphan_tree_ids)} tree subtrees with no brief match'
        f'      {(": <code>" + "</code>, <code>".join(escape(o) for o in orphan_tree_ids) + "</code>") if orphan_tree_ids else ""}'
        f'    </li>'
        f'  </ul>'
        f'  <h4>Engine bug surface (visible in this view):</h4>'
        f'  {bug_html}'
        f'</div>'
    )

    # Header
    over_html = ""
    if is_over and over_pct is not None:
        over_html = f' <span class="overbudget">OVER BUDGET by {over_pct:.0f}%</span>'

    return (
        f'<section class="product">'
        f'  <header class="product-header">'
        f'    <h2>{escape(title)}</h2>'
        f'    <div class="product-meta">'
        f'      <code>{escape(slug)}</code> · '
        f'      BoM total: <strong>{fmt_gbp(bom_total)}</strong>{over_html} · '
        f'      <span class="muted">{len(sentence_subtrees)} top-level subsystems · {len(all_leaves)} leaves</span>'
        f'    </div>'
        f'  </header>'
        f'  <div class="brief-fulltext"><strong>Source brief (verbatim):</strong><pre>{escape(brief_text)}</pre></div>'
        f'  <div class="sentence-clusters">{"".join(sentence_blocks_html)}</div>'
        f'  {correctness_html}'
        f'</section>'
    )


# ── Page-level rendering ────────────────────────────────────────────────────

CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#fff;color:#1a1a1a;font-size:14px;line-height:1.5;padding:0}
.page{max-width:1280px;margin:0 auto;padding:32px 28px 80px}
h1{font-size:26px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px}
h2{font-size:20px;font-weight:700;letter-spacing:-.01em;margin:0}
h3{font-size:14px;font-weight:600;margin:14px 0 6px;color:#333}
h4{font-size:12px;font-weight:600;margin:10px 0 6px;color:#555;text-transform:uppercase;letter-spacing:.04em}
p{margin-bottom:8px}
code{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:12px;background:#f4f4f4;padding:1px 5px;border-radius:3px;color:#222}
pre{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:12px;line-height:1.45;background:#f8f8f8;border:1px solid #e5e5e5;border-radius:4px;padding:10px 12px;overflow-x:auto;color:#1a1a1a}
.muted{color:#888;font-size:12px;font-style:italic}
.warn{color:#a05a00}
.page-header{border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:20px}
.page-header .meta{font-size:12px;color:#666;margin-top:6px}
.page-header .legend{margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#444}
.legend-swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
.product{margin-bottom:48px;border:1px solid #d0d0d0;border-radius:6px;overflow:hidden;background:#fff}
.product.missing{padding:20px}
.product-header{padding:14px 18px;background:#f0f0f0;border-bottom:1px solid #d0d0d0}
.product-header h2{margin-bottom:4px}
.product-meta{font-size:12px;color:#444}
.product-meta strong{color:#1a1a1a}
.overbudget{display:inline-block;background:#c0392b;color:#fff;padding:1px 7px;border-radius:3px;font-weight:600;font-size:11px;margin-left:6px}
.brief-fulltext{padding:12px 18px;background:#fafafa;border-bottom:1px solid #e5e5e5;font-size:12px}
.brief-fulltext pre{background:#fff;border:1px solid #e5e5e5;font-size:11px;max-height:180px;overflow-y:auto}
.sentence-clusters{padding:14px 18px;display:flex;flex-direction:column;gap:18px}
.cluster{border:1px solid #d8d8d8;border-radius:6px;overflow:hidden;background:#fff}
.cluster-orphan{border-color:#e8c0c0}
.cluster-bullet{background:#fdfdfb}
.cluster-submodule{background:#fbfdff}
.cluster-header{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f5f5f5;border-bottom:1px solid #e5e5e5;font-size:12px}
.cluster-orphan .cluster-header{background:#fdf2f2}
.cluster-label{font-weight:600;color:#444;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.match-pill{display:inline-block;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:500;margin-left:auto}
.match-pill.ok{background:#e6f4ea;color:#1e7a3c}
.match-pill.miss{background:#fde8e8;color:#a32020}
.layer{display:grid;grid-template-columns:120px 1fr;gap:0;border-top:4px solid transparent;padding:8px 12px}
.layer-tag{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:10px;font-weight:700;color:#666;letter-spacing:.06em;padding-right:12px;align-self:flex-start;padding-top:4px}
.layer-content{min-width:0}
.layer-l1{border-left:4px solid #1a1a1a;background:#fafafa}
.layer-l1 .layer-content{font-size:14px;line-height:1.55;padding:4px 0;color:#1a1a1a}
.layer-l2{border-left:4px solid #1f6fbe;background:#f4f8fc}
.layer-l3{border-left:4px solid #2a8a3a;background:#f4faf5}
.layer-l4{border-left:4px solid #6a3a8a;background:#f8f4fb}
.layer-l5{border-left:4px solid #c08a1a;background:#fcf8ef}
.glyph-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.glyph-tile{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid #d0d0d0;background:#fff;border-radius:4px;padding:5px 7px 4px;min-width:78px;max-width:110px}
.glyph-tile-svg{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:3px}
.glyph-tile-svg.cat-material{background:#e8f4fd}
.glyph-tile-svg.cat-function{background:#f0fae8}
.glyph-tile-svg.cat-state{background:#fef6e4}
.glyph-tile-svg.cat-unknown{background:#f4f4f4;color:#888;font-weight:700;font-family:monospace}
.glyph-tile-label{font-size:9px;color:#444;text-align:center;line-height:1.2;font-family:"SF Mono","Fira Code",Consolas,monospace}
.glyph-tile-fallback{border-style:dashed;border-color:#bbb}
.tree{margin-bottom:0;font-size:11px;line-height:1.45}
table.leaves{width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #e5e5e5}
table.leaves th{background:#f0f0f0;text-align:left;padding:5px 7px;border:1px solid #d8d8d8;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#555}
table.leaves td{padding:4px 7px;border:1px solid #ececec;vertical-align:top}
table.leaves code{font-size:10.5px;background:#fafafa}
.grade-verified{background:#e6f4ea;color:#1e7a3c;text-align:center;font-weight:600}
.grade-c{background:#fff4dc;color:#8a6000;text-align:center;font-weight:600}
.grade-d{background:#f0f0f0;color:#666;text-align:center;font-weight:500}
.grade-gap{background:#fde8e8;color:#a32020;text-align:center;font-weight:600}
.bom-pill{padding:6px 10px;background:#fcf8ef;border:1px solid #e8d8a8;border-radius:4px;font-size:12px;color:#5a3a00}
.bom-pill strong{font-size:14px}
.bom-pill-orphan{background:#fdf2f2;border-color:#f0c8c8;color:#8a3030}
.warn-pill{display:inline-block;margin-left:10px;font-size:11px;color:#8a5a00;background:#fff;padding:2px 7px;border-radius:3px;border:1px solid #d8c098}
.correctness{margin:0 18px 18px;padding:12px 14px;background:#f6f6f6;border-radius:5px;border:1px solid #e0e0e0}
.correctness h3{font-size:13px;font-weight:700;margin-top:0}
.correctness ul{list-style:none;font-size:12px;line-height:1.7;padding-left:0}
.correctness li.ok{color:#1e7a3c}
.correctness li.warn{color:#8a5a00}
.correctness li.miss{color:#a32020}
.bug-list{font-size:12px;color:#a32020;list-style:none;padding-left:0}
.bug-list li{padding:4px 8px;background:#fff;border-left:3px solid #c0392b;margin-bottom:4px;border-radius:0 3px 3px 0}
@media print{
  .product{page-break-inside:avoid;border:1px solid #888}
  .cluster{page-break-inside:avoid}
  .product-header{background:#eee !important}
}
"""


def render_page(
    products_html: list[str], batch_dir: Path, glyphs: dict[str, dict]
) -> str:
    glyph_count = sum(1 for g in glyphs.values() if g.get("svg32"))
    legend = (
        '<div class="legend">'
        '<span><span class="legend-swatch" style="background:#1a1a1a"></span>L1 brief</span>'
        '<span><span class="legend-swatch" style="background:#1f6fbe"></span>L2 glyph IR</span>'
        '<span><span class="legend-swatch" style="background:#2a8a3a"></span>L3 decomposition</span>'
        '<span><span class="legend-swatch" style="background:#6a3a8a"></span>L4 assemblers + product</span>'
        '<span><span class="legend-swatch" style="background:#c08a1a"></span>L5 BoM</span>'
        '</div>'
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ForgeOS Radical · Translation Chain Proof</title>
<style>{CSS}</style>
</head>
<body>
<div class="page">
<div class="page-header">
  <h1>ForgeOS Radical — Translation Chain Proof</h1>
  <div class="meta">
    Source: <code>{escape(str(batch_dir))}</code> ·
    Glyph library: {glyph_count} radicals from <code>RADICAL-GLYPHS-V0.html</code> ·
    Light theme · Date: 2026-05-11
  </div>
  <p style="margin-top:10px;font-size:13px;color:#444">
    Each brief sentence is rendered as a five-layer cascade (brief → glyph IR → decomposition →
    assemblers + product list → BoM contribution). Layer borders are colour-coded; if any layer
    breaks against the previous, the engine bug surfaces visually at that boundary.
  </p>
  {legend}
</div>
{"".join(products_html)}
</div>
</body>
</html>
"""


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--batch-dir",
        default=str(Path.home() / "Downloads/engine-evidence/radical-shadow-20260511T0429"),
    )
    parser.add_argument(
        "--output",
        default=str(Path.home() / "Downloads/radical-translation-proof.html"),
    )
    args = parser.parse_args()

    batch_dir = Path(args.batch_dir).expanduser()
    output = Path(args.output).expanduser()

    glyphs = extract_glyphs()
    char_radicals = extract_characters()
    print(
        f"[init] glyphs={len(glyphs)}  chars={len(char_radicals)}  batch={batch_dir}",
        file=sys.stderr,
    )

    sections: list[str] = []
    for slug, title, brief_filename in PRODUCTS:
        state_path = batch_dir / slug / "state.json"
        state = None
        if state_path.exists():
            try:
                state = json.loads(state_path.read_text())
            except Exception as e:
                print(f"[warn] {state_path}: {e}", file=sys.stderr)
        else:
            print(f"[warn] missing {state_path}", file=sys.stderr)
        brief_text = load_brief(brief_filename)
        sections.append(
            render_product_section(slug, title, brief_text, state or {}, glyphs, char_radicals)
        )

    html = render_page(sections, batch_dir, glyphs)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    size_kb = output.stat().st_size / 1024
    print(f"[ok] wrote {output} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
