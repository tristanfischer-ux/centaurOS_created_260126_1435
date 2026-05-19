#!/usr/bin/env python3
"""
render-translation-proof.py — emit the ForgeOS Radical engine "linguistic
hierarchy" HTML across multiple product classes from existing batch snapshots.

Concept (per Tristan, 2026-05-11 — second iteration, correct linguistic model):
  Visualise the FULL translation chain — English brief → linguistic hierarchy
  (Sentence → Word → Character → Radical) → assemblers + product list + BOM.

  THE BINDING LINGUISTIC MODEL:

    RADICALS    — 22 universal atoms (Silicon, LFP, Steel, Polymer, etc.)
                  combine to form
    CHARACTERS  — combinations of radicals (e.g. lfp_prismatic_cell =
                  LFP + Electrochemical Energy). NO modifiers.
                  one or more characters PLUS modifying-characters form
    WORDS       — procurable specs (e.g. "16x 280Ah LFP cell string" =
                  lfp_prismatic_cell character + ×16 quantity modifier
                  + "280Ah" capacity modifier). MODIFIERS LIVE HERE.
                  combine to form
    SENTENCES   — subsystems (battery_management_system, etc.)
                  combine to form
    PARAGRAPHS  — whole products (bess_001_system).

  Modifiers are themselves a special class of character ("modifying-characters")
  and they attach at the WORD level, NOT the character level.

  Snapshot has only `archetypeId` + `quantity` + `resolution{}`. Modifying-
  characters are RECONSTRUCTED from:
    - tree multiplicity (×qty)
    - character_id suffixes (e.g. lfp_prismatic_cell → "prismatic" form)
    - brief constraints (e.g. "3.5 MWh" → attaches to lfp_prismatic_cell word)

NO new pipeline runs. Reads state.json from a batch dir.

Usage:
    python3 scripts/render-translation-proof.py \
        --batch-dir ~/Downloads/engine-evidence/radical-shadow-20260511T0429 \
        --output ~/Downloads/radical-translation-proof-v4-v2.html
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
    string-concatenation expressions, so we invoke `node` to evaluate it and
    dump the rendered SVG strings as JSON.
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
    """Render a single radical glyph either as SVG (if known) or as a fallback text badge."""
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

def extract_hierarchy() -> tuple[dict[str, dict], dict[str, dict]]:
    """Parse SENTENCES + WORDS arrays from character-hierarchy.ts.
    Returns (sentences_by_id, words_by_id)."""
    src = HIERARCHY_TS.read_text()
    sentences: dict[str, dict] = {}
    s_pattern = re.compile(
        r"\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*words:\s*\[([^\]]+)\][^}]*?\}",
        re.DOTALL,
    )
    for m in s_pattern.finditer(src):
        sid = m.group(1)
        label = m.group(2)
        words = [s.strip().strip("'\"") for s in m.group(3).split(",") if s.strip()]
        sentences[sid] = {"id": sid, "label": label, "words": words}

    words: dict[str, dict] = {}
    w_pattern = re.compile(
        r"\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*sentence_id:\s*'([^']+)',\s*characters:\s*\[([^\]]+)\][^}]*?\}",
        re.DOTALL,
    )
    for m in w_pattern.finditer(src):
        wid = m.group(1)
        words[wid] = {
            "id": wid,
            "label": m.group(2),
            "sentence_id": m.group(3),
            "characters": [
                s.strip().strip("'\"") for s in m.group(4).split(",") if s.strip()
            ],
        }
    return sentences, words


# ── Brief loading + sentence splitting ──────────────────────────────────────

def load_brief(filename: str) -> str:
    path = BRIEF_DIR / filename
    if not path.exists():
        return f"(brief not found: {filename})"
    return path.read_text()


def split_brief_sentences(text: str) -> list[dict]:
    """Returns list of brief items (paragraphs / bullets / sub-modules / constraints)."""
    paragraphs: list[dict] = []
    lines = text.splitlines()
    skip_headers_re = re.compile(
        r"^\s*(target market|target customer|safety and regulatory|key constraints):", re.I
    )

    para_buf: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if para_buf:
                paragraphs.append({"raw": " ".join(para_buf), "is_bullet": False})
                para_buf = []
            continue
        if stripped.startswith("#"):
            if para_buf:
                paragraphs.append({"raw": " ".join(para_buf), "is_bullet": False})
                para_buf = []
            continue
        if stripped.startswith("- ") or stripped.startswith("* "):
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
        if skip_headers_re.match(raw):
            continue
        if raw.lower().startswith("sub-modules expected"):
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

def collect_subtree_leaves(node: dict) -> list[dict]:
    children = node.get("children") or []
    if not children:
        return [node]
    out: list[dict] = []
    for c in children:
        out.extend(collect_subtree_leaves(c))
    return out


def collect_all_leaves(node: dict, path: str = "") -> list[tuple[str, dict]]:
    cur_path = path + "/" + node.get("archetypeId", "?")
    children = node.get("children") or []
    if not children:
        return [(cur_path, node)]
    out: list[tuple[str, dict]] = []
    for c in children:
        out.extend(collect_all_leaves(c, cur_path))
    return out


def collect_sentence_subtrees(root: dict) -> list[dict]:
    return root.get("children") or []


# ── Brief sentence → tree node matching ─────────────────────────────────────

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
    "refrigerant": ["refrigerant_circuit"],
    "compressor": ["refrigerant_circuit"],
    "heat exchanger": ["refrigerant_circuit", "hydronic_circuit"],
    "expansion valve": ["refrigerant_circuit"],
    "hydronic": ["hydronic_circuit"],
    "circulation pump": ["hydronic_circuit"],
    "controller": ["heat_pump_controls", "bioreactor_controls", "flight_computer"],
    "inverter drive": ["heat_pump_controls"],
    "biosensor": ["biosensor_system"],
    "glucose": ["biosensor_system"],
    "sensor": ["biosensor_system", "detection_sensors"],
    "patch": ["medical_wearable_enclosure"],
    "housing": ["medical_wearable_enclosure", "heat_pump_enclosure"],
    "airframe": ["airframe_structure", "haps_airframe"],
    "carbon": ["airframe_structure"],
    "motor": ["propulsion_system"],
    "esc": ["propulsion_system"],
    "propeller": ["propulsion_system"],
    "flight": ["flight_computer"],
    "imu": ["flight_computer"],
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
    by_id = {s.get("archetypeId", ""): s for s in sentence_subtrees}
    matched: list[dict] = []
    seen: set[str] = set()

    for s in sentence_subtrees:
        aid = s.get("archetypeId", "")
        tokens = [t for t in aid.split("_") if len(t) > 3]
        for t in tokens:
            if t in text and aid not in seen:
                matched.append(s)
                seen.add(aid)
                break

    for keyword, target_ids in KEYWORD_HINTS.items():
        if keyword in text:
            for tid in target_ids:
                if tid in by_id and tid not in seen:
                    matched.append(by_id[tid])
                    seen.add(tid)

    return matched


# ── Modifying-character reconstruction ──────────────────────────────────────

# Rules: extract modifiers from character_id suffixes (form-factor-ish tokens
# that are not the radical material).  Heuristic — last 1-2 tokens after the
# material radical hint are commonly form/role modifiers.
FORM_MODIFIER_TOKENS = {
    "prismatic": "form: prismatic",
    "cylindrical": "form: cylindrical",
    "pouch": "form: pouch",
    "controller": "role: controller",
    "master": "role: master",
    "slave": "role: slave",
    "rack": "form: rack-mount",
    "frame": "form: frame",
    "panel": "form: panel",
    "door": "form: door",
    "transit": "form: transit",
    "switchboard": "role: switchboard",
    "distribution": "role: distribution",
    "buswork": "role: buswork",
    "busbar": "form: busbar",
    "contactor": "role: contactor",
    "breaker": "role: breaker",
    "relay": "role: relay",
    "switch": "form: switch",
    "vessel": "form: vessel",
    "pump": "role: pump",
    "valve": "role: valve",
    "compressor": "role: compressor",
    "exchanger": "role: exchanger",
    "sensor": "role: sensor",
    "monitor": "role: monitor",
    "patch": "form: patch",
    "wearable": "form: wearable",
    "housing": "form: housing",
    "enclosure": "form: enclosure",
    "heatsink": "form: heatsink",
    "insulation": "form: insulation",
    "fixtures": "form: fixtures",
}


def reconstruct_character_modifier(character_id: str) -> list[str]:
    """Pick out form / role tokens from a character_id (e.g.
    'lfp_prismatic_cell' → ['form: prismatic'])."""
    out: list[str] = []
    seen: set[str] = set()
    for tok in character_id.split("_"):
        if tok in FORM_MODIFIER_TOKENS:
            label = FORM_MODIFIER_TOKENS[tok]
            if label not in seen:
                out.append(label)
                seen.add(label)
    return out


# Brief constraint extraction → attach to specific words.
# Each entry: pattern → (label, target_word_id, optional sentence_filter)
CONSTRAINT_ATTACHMENTS: list[dict] = [
    # Energy capacity → cell_string word (lfp_prismatic_cell sits under it)
    {"re": re.compile(r"(\d[\d.,]*)\s*MWh", re.I), "label": "energy: {m}", "target_word": "cell_string"},
    {"re": re.compile(r"(\d[\d.,]*)\s*kWh", re.I), "label": "energy: {m}", "target_word": "cell_string"},
    # Power rating → pcs_inverter_group word
    {"re": re.compile(r"(\d[\d.,]*)\s*MW(?!h)", re.I), "label": "power: {m}", "target_word": "pcs_inverter_group"},
    {"re": re.compile(r"(\d[\d.,]*)\s*kW(?!h)", re.I), "label": "power: {m}", "target_word": "pcs_inverter_group"},
    # Container dimension → container_access word
    {"re": re.compile(r"(\d{2})-?foot ISO( container)?", re.I), "label": "container: {m}-foot ISO", "target_word": "container_access"},
    # Cycle life → cell_string word
    {"re": re.compile(r"(\d[\d,]*)\s*(equivalent full )?cycles?", re.I), "label": "cycles: {m}", "target_word": "cell_string"},
    # Ambient temp range → active_cooling word
    {"re": re.compile(r"(-?\d+)\s*°?C\s*(?:to|–|—|-)\s*\+?(\d+)\s*°?C\s*ambient", re.I), "label": "ambient: {m1}-{m2}°C", "target_word": "active_cooling"},
    {"re": re.compile(r"(\d+)\s*°?C\s*ambient", re.I), "label": "ambient: {m}°C", "target_word": "active_cooling"},
    # IP rating → container_access word
    {"re": re.compile(r"\bIP\s?(\d{2})\b"), "label": "ingress: IP{m}", "target_word": "container_access"},
    # Cell capacity (Ah) → cell_string word
    {"re": re.compile(r"(\d[\d,]*)\s*Ah", re.I), "label": "capacity: {m} Ah", "target_word": "cell_string"},
    # DC voltage → dc_buswork
    {"re": re.compile(r"(\d[\d,]*)\s*V\s*(?:nominal|DC bus|system voltage)", re.I), "label": "DC: {m} V", "target_word": "dc_buswork"},
    # Mass → container_services
    {"re": re.compile(r"(\d[\d,]*)\s*kg", re.I), "label": "mass: {m} kg", "target_word": "container_services"},
    # Refrigerant
    {"re": re.compile(r"\bR-?(\d+[a-z]?)\b", re.I), "label": "refrigerant: R{m}", "target_word": "refrigerant_cycle"},
    # COP — must match a number that is a sensible COP value (1-12 with optional decimal),
    # not a 4-digit standard year like "EN 14825 2014".
    {"re": re.compile(r"\bS?COP[^\n\d]{0,30}?(\d{1,2}(?:\.\d+)?)\b", re.I), "label": "COP: {m}", "target_word": "refrigerant_cycle"},
    # Lights spectrum / PPFD → lighting_fixtures
    {"re": re.compile(r"(\d[\d,]*)\s*µ?u?mol[/·\s]m", re.I), "label": "PPFD: {m} µmol/m²/s", "target_word": "lighting_fixtures"},
    # Drone weight g
    {"re": re.compile(r"(\d[\d.]*)\s*g\b(?!\s*per)", re.I), "label": "mass: {m} g", "target_word": "airframe_body"},
    # Flight time
    {"re": re.compile(r"(\d+)[\s-]*min(?:utes?)?\s*flight", re.I), "label": "flight: {m} min", "target_word": "avionics_compute"},
    # CGM duration
    {"re": re.compile(r"(\d+)[\s-]*day", re.I), "label": "wear: {m} day", "target_word": "wearable_skin_interface"},
]

# Regulatory standard recognisers — go into grammar panel as rules, NOT modifiers.
REGULATORY_RE = re.compile(
    r"\b(?:IEC|UL|EN|BS\s?EN|NFPA|G99|ISO|CE|FCC|RoHS|UKCA)[\s-]?\d[\w\d\-./]*",
    re.I,
)


def extract_brief_modifiers(
    brief_text: str, available_word_ids: set[str]
) -> tuple[dict[str, list[str]], list[str], list[str]]:
    """Returns (word_id → modifier-labels, regulatory list, unattached list)."""
    word_modifiers: dict[str, list[str]] = {}
    regulatory: list[str] = []
    unattached: list[str] = []
    seen_per_word: dict[str, set[str]] = {}

    # Regulatory standards (collected once)
    for m in REGULATORY_RE.finditer(brief_text):
        std = m.group(0).strip()
        if std not in regulatory:
            regulatory.append(std)

    # Constraints — only honour bullet-point or sentence-level matches
    for spec in CONSTRAINT_ATTACHMENTS:
        for m in spec["re"].finditer(brief_text):
            if "{m1}" in spec["label"] and "{m2}" in spec["label"]:
                label = spec["label"].format(m1=m.group(1), m2=m.group(2))
            else:
                label = spec["label"].format(m=m.group(1))
            target = spec["target_word"]
            if target not in available_word_ids:
                # attempt fallback to a similar word in same sentence
                if label not in unattached:
                    unattached.append(label)
                continue
            word_modifiers.setdefault(target, [])
            seen_per_word.setdefault(target, set())
            if label not in seen_per_word[target]:
                word_modifiers[target].append(label)
                seen_per_word[target].add(label)

    return word_modifiers, regulatory, unattached


# ── Linguistic-hierarchy renderer (replaces L2 + L3) ────────────────────────

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


def render_character_card(
    leaf_node: dict,
    glyphs: dict[str, dict],
    char_radicals: dict[str, list[str]],
    grammar_node_index: dict[str, list[dict]],
) -> str:
    """A character card shows: name + radical glyphs ONLY.  No modifiers."""
    cid = leaf_node.get("archetypeId", "?")
    qty = leaf_node.get("quantity", 1)
    radicals = char_radicals.get(cid, [])
    glyph_html = (
        '<div class="char-glyph-row">'
        + "".join(render_glyph_badge(rid, glyphs) for rid in radicals)
        + "</div>"
    ) if radicals else '<div class="char-no-radicals">⚠️ no radicals declared for this character</div>'

    # Grammar badges that hit this character (bug surface)
    badges = ""
    for v in grammar_node_index.get(cid, []):
        verdict = v.get("verdict")
        if verdict == "WARN":
            badges += f'<span class="char-grammar-badge badge-warn" title="{escape(v.get("reason",""))}">⚠️ {escape(v.get("rule_id",""))}</span>'
        elif verdict == "BLOCK":
            badges += f'<span class="char-grammar-badge badge-block" title="{escape(v.get("reason",""))}">❌ {escape(v.get("rule_id",""))}</span>'

    grammar_class = ""
    if badges:
        grammar_class = " has-grammar-warn" if "badge-warn" in badges else " has-grammar-block"

    return (
        f'<div class="char-card{grammar_class}">'
        f'  <div class="char-header">'
        f'    <span class="hier-tag hier-tag-char">CHARACTER</span>'
        f'    <code class="char-name">{escape(cid)}</code>'
        f'    <span class="hier-qty">×{qty}</span>'
        f'    {badges}'
        f'  </div>'
        f'  <div class="char-body">'
        f'    <div class="char-radicals-label">radicals (atoms)</div>'
        f'    {glyph_html}'
        f'  </div>'
        f'</div>'
    )


def render_word_card(
    word_id: str,
    word_label: str,
    word_node_quantity: int,
    leaves_under_word: list[dict],
    constraint_modifiers: list[str],
    glyphs: dict[str, dict],
    char_radicals: dict[str, list[str]],
    grammar_node_index: dict[str, list[dict]],
) -> str:
    """A word card shows: name + modifying-characters strip + nested character cards."""
    # Reconstruct modifiers:
    # 1. quantity from tree multiplicity (per leaf)
    # 2. form/role from character_id suffixes
    # 3. brief constraint modifiers (already passed in)
    quantity_mods: list[str] = []
    form_mods: list[str] = []
    seen_form: set[str] = set()

    for leaf in leaves_under_word:
        cid = leaf.get("archetypeId", "?")
        qty = leaf.get("quantity", 1)
        if qty and qty > 1:
            quantity_mods.append(f"×{qty} {cid}")
        for fm in reconstruct_character_modifier(cid):
            if fm not in seen_form:
                form_mods.append(fm)
                seen_form.add(fm)

    modifier_chips: list[str] = []
    if word_node_quantity and word_node_quantity > 1:
        modifier_chips.append(f'<span class="modchip modchip-qty">×{word_node_quantity}</span>')
    for q in quantity_mods:
        modifier_chips.append(f'<span class="modchip modchip-qty">{escape(q)}</span>')
    for f in form_mods:
        modifier_chips.append(f'<span class="modchip modchip-form">{escape(f)}</span>')
    for c in constraint_modifiers:
        modifier_chips.append(f'<span class="modchip modchip-spec">{escape(c)}</span>')

    if modifier_chips:
        mod_strip = (
            '<div class="word-modifiers">'
            '<span class="word-mod-label">modifying-characters →</span>'
            + "".join(modifier_chips)
            + '</div>'
        )
    else:
        mod_strip = (
            '<div class="word-modifiers word-modifiers-empty">'
            '<span class="word-mod-label">modifying-characters →</span>'
            '<span class="muted">(none — character is taken at default form/quantity)</span>'
            '</div>'
        )

    # Nested character cards
    char_cards = "".join(
        render_character_card(leaf, glyphs, char_radicals, grammar_node_index)
        for leaf in leaves_under_word
    )

    return (
        f'<div class="word-card">'
        f'  <div class="word-header">'
        f'    <span class="hier-tag hier-tag-word">WORD</span>'
        f'    <code class="word-name">{escape(word_id)}</code>'
        f'    <span class="word-label">— {escape(word_label)}</span>'
        f'  </div>'
        f'  {mod_strip}'
        f'  <div class="word-characters">'
        f'    <div class="word-chars-label">characters</div>'
        f'    {char_cards}'
        f'  </div>'
        f'</div>'
    )


def render_sentence_card(
    sentence_node: dict,
    sentences_meta: dict[str, dict],
    words_meta: dict[str, dict],
    constraint_modifiers_by_word: dict[str, list[str]],
    glyphs: dict[str, dict],
    char_radicals: dict[str, list[str]],
    grammar_node_index: dict[str, list[dict]],
) -> str:
    sid = sentence_node.get("archetypeId", "?")
    qty = sentence_node.get("quantity", 1)
    meta = sentences_meta.get(sid, {})
    label = meta.get("label", sid.replace("_", " ").title())

    # Group leaves by their word.  We use the catalogue (words_meta) to map
    # character_id → word_id, falling back to the immediate parent in the tree
    # if the catalogue is missing the entry.
    char_to_word: dict[str, str] = {}
    for wid in meta.get("words", []):
        wmeta = words_meta.get(wid)
        if not wmeta:
            continue
        for c in wmeta.get("characters", []):
            char_to_word[c] = wid

    # Walk the subtree.  Snapshot intermediate "word" nodes are present
    # (e.g. `bms_master`, `cell_string`) — we use those as the authoritative
    # word grouping, since they're what the engine actually built.
    direct_word_children = sentence_node.get("children") or []

    word_blocks: list[str] = []
    word_id_displayed: set[str] = set()

    for word_node in direct_word_children:
        wid = word_node.get("archetypeId", "?")
        wqty = word_node.get("quantity", 1)
        wmeta = words_meta.get(wid, {})
        wlabel = wmeta.get("label", wid.replace("_", " ").title())
        leaves = collect_subtree_leaves(word_node)
        constraints = constraint_modifiers_by_word.get(wid, [])
        word_blocks.append(
            render_word_card(
                wid, wlabel, wqty, leaves, constraints, glyphs, char_radicals, grammar_node_index
            )
        )
        word_id_displayed.add(wid)

    # Sentence-level grammar badges
    badges = ""
    for v in grammar_node_index.get(sid, []):
        verdict = v.get("verdict")
        if verdict == "WARN":
            badges += f'<span class="char-grammar-badge badge-warn" title="{escape(v.get("reason",""))}">⚠️ {escape(v.get("rule_id",""))}</span>'
        elif verdict == "BLOCK":
            badges += f'<span class="char-grammar-badge badge-block" title="{escape(v.get("reason",""))}">❌ {escape(v.get("rule_id",""))}</span>'

    return (
        f'<div class="sentence-card">'
        f'  <div class="sentence-header">'
        f'    <span class="hier-tag hier-tag-sentence">SENTENCE</span>'
        f'    <code class="sentence-name">{escape(sid)}</code>'
        f'    <span class="sentence-label">— {escape(label)} (×{qty})</span>'
        f'    {badges}'
        f'  </div>'
        f'  <div class="sentence-body">'
        f'    {"".join(word_blocks)}'
        f'  </div>'
        f'</div>'
    )


# ── Grammar panel ───────────────────────────────────────────────────────────

def render_grammar_panel(
    verdicts: list[dict], regulatory: list[str]
) -> str:
    if not verdicts and not regulatory:
        return '<div class="grammar-panel"><h3>Grammar Rules</h3><p class="muted">(no grammar verdicts in snapshot)</p></div>'

    rows: list[str] = []
    pass_n = warn_n = block_n = 0
    for v in verdicts:
        verdict = v.get("verdict", "?")
        if verdict == "PASS":
            pass_n += 1
            cls = "rule-pass"
            icon = "✅"
        elif verdict == "WARN":
            warn_n += 1
            cls = "rule-warn"
            icon = "⚠️"
        elif verdict == "BLOCK":
            block_n += 1
            cls = "rule-block"
            icon = "❌"
        else:
            cls = "rule-other"
            icon = "·"
        affected = v.get("affected_nodes") or []
        affected_html = (
            '<div class="rule-affected">affected: '
            + ", ".join(f'<code>{escape(a)}</code>' for a in affected)
            + '</div>'
        ) if affected else ""
        rows.append(
            f'<div class="rule-row {cls}">'
            f'  <div class="rule-icon">{icon}</div>'
            f'  <div class="rule-body">'
            f'    <div class="rule-head"><code>{escape(v.get("rule_id","?"))}</code> '
            f'<span class="rule-verdict">{escape(verdict)}</span> '
            f'<span class="rule-hardness">{escape(v.get("hardness","?"))}</span></div>'
            f'    <div class="rule-desc">{escape(v.get("rule_description",""))}</div>'
            f'    <div class="rule-reason">{escape(v.get("reason",""))}</div>'
            f'    {affected_html}'
            f'  </div>'
            f'</div>'
        )

    reg_block = ""
    if regulatory:
        reg_block = (
            '<div class="grammar-regulatory">'
            '<h4>Regulatory standards (cross-system rules)</h4>'
            + "".join(f'<span class="reg-pill">{escape(r)}</span>' for r in regulatory)
            + '</div>'
        )

    return (
        f'<div class="grammar-panel">'
        f'  <h3>Grammar Rules — {pass_n} PASS · {warn_n} WARN · {block_n} BLOCK</h3>'
        f'  <p class="muted">Constraints that link multiple nodes across the linguistic structure. '
        f'WARN/BLOCK rules also surface as ⚠️/❌ badges on the affected character cards above.</p>'
        f'  <div class="rule-rows">{"".join(rows)}</div>'
        f'  {reg_block}'
        f'</div>'
    )


# ── L4 BoM table ────────────────────────────────────────────────────────────

def render_bom_table(
    all_leaves: list[tuple[str, dict]], slug: str, snapshot_label: str
) -> str:
    rows: list[str] = []
    bom_total = 0.0
    unpriced: list[str] = []
    no_lead = 0
    for _, leaf in all_leaves:
        arch = leaf.get("archetypeId", "?")
        res = leaf.get("resolution") or {}
        qty = res.get("qty", leaf.get("quantity", 1))
        mpn = res.get("mpn") or "—"
        mfg = res.get("manufacturer") or "—"
        unit = res.get("unit_price_gbp")
        grade = res.get("verification_grade", "?")
        src = res.get("source", "?")
        lead = res.get("lead_weeks")
        if lead is None:
            no_lead += 1
            lead_str = "—"
        else:
            lead_str = f"{lead}w"
        if isinstance(unit, (int, float)) and unit > 0:
            line = unit * qty
            bom_total += line
            unit_disp = f"£{unit:,.2f}"
            line_disp = f"£{line:,.2f}"
        else:
            unit_disp = "—"
            line_disp = "—"
            unpriced.append(arch)
        rows.append(
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

    correctness: list[str] = []
    correctness.append(
        f'<li class="ok">✅ {len(all_leaves)} resolved leaves total</li>'
    )
    if unpriced:
        correctness.append(
            f'<li class="miss">❌ {len(unpriced)} unpriced leaves: '
            + ", ".join(f"<code>{escape(u)}</code>" for u in unpriced[:8])
            + (" …" if len(unpriced) > 8 else "")
            + "</li>"
        )
    else:
        correctness.append('<li class="ok">✅ all leaves priced</li>')
    if no_lead and "v4" in snapshot_label.lower():
        correctness.append(
            f'<li class="warn">⚠️ {no_lead} leaves without lead time '
            f'(\'—\' on V4 reflects pre-adapter-fix snapshot; populated in V6)</li>'
        )
    elif no_lead:
        correctness.append(
            f'<li class="warn">⚠️ {no_lead} leaves without lead time</li>'
        )

    # Engine-bug heuristics
    engine_bugs: list[str] = []
    if slug == "rs-cgm" and any(
        leaf[1].get("archetypeId") == "hull_and_buoyancy" for leaf in all_leaves
    ):
        engine_bugs.append(
            "❌ CGM tree contains <code>hull_and_buoyancy</code> (an AUV sentence) — engine archetype-guard bug P0-3"
        )
    for _, leaf in all_leaves:
        res = leaf.get("resolution") or {}
        mpn = (res.get("mpn") or "").upper()
        arch = leaf.get("archetypeId", "")
        if arch == "pcb_controller" and "ISL94212" in mpn and slug != "rs-bess":
            engine_bugs.append(
                f"❌ <code>{escape(slug)}</code> uses ISL94212 (BMS chip) for {escape(arch)} — class-aware MCU not applied (P0-2)"
            )
            break

    bug_html = (
        '<ul class="bug-list">'
        + "".join(f"<li>{b}</li>" for b in engine_bugs)
        + "</ul>"
    ) if engine_bugs else '<p class="muted">(no class-of-bug heuristics tripped)</p>'

    return (
        f'<div class="bom-panel">'
        f'  <h3>L4 · BoM (assemblers + product list)</h3>'
        f'  <table class="leaves">'
        f'    <thead><tr>'
        f'      <th>Character</th><th>Qty</th><th>MPN</th><th>Manufacturer</th>'
        f'      <th>Unit £</th><th>Line £</th><th>Source</th><th>Lead</th><th>Grade</th>'
        f'    </tr></thead>'
        f'    <tbody>{"".join(rows)}</tbody>'
        f'    <tfoot><tr><td colspan="5" style="text-align:right;font-weight:600">Sum</td>'
        f'      <td style="text-align:right;font-weight:700">{fmt_gbp(bom_total)}</td>'
        f'      <td colspan="3"></td></tr></tfoot>'
        f'  </table>'
        f'  <h4>Cross-layer correctness</h4>'
        f'  <ul>{"".join(correctness)}</ul>'
        f'  <h4>Engine bug surface</h4>'
        f'  {bug_html}'
        f'</div>'
    )


# ── Per-product rendering ───────────────────────────────────────────────────

def render_product_section(
    slug: str,
    title: str,
    brief_text: str,
    state: dict,
    glyphs: dict[str, dict],
    char_radicals: dict[str, list[str]],
    sentences_meta: dict[str, dict],
    words_meta: dict[str, dict],
    snapshot_label: str,
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
    grammar = state.get("grammarVerdicts") or {}
    verdicts = grammar.get("verdicts") or []

    # Index grammar verdicts by affected node for badge rendering
    grammar_node_index: dict[str, list[dict]] = {}
    for v in verdicts:
        for n in v.get("affected_nodes") or []:
            grammar_node_index.setdefault(n, []).append(v)

    # Available word IDs from the actual tree (the engine-built words)
    available_word_ids: set[str] = set()
    for s_node in sentence_subtrees:
        for w_node in s_node.get("children") or []:
            available_word_ids.add(w_node.get("archetypeId", ""))

    # Brief constraint modifiers → word_id mapping
    word_modifiers, regulatory, unattached = extract_brief_modifiers(
        brief_text, available_word_ids
    )

    # Brief item → tree-sentence matching (for the brief-arrow panel)
    brief_items = split_brief_sentences(brief_text)
    brief_arrow_rows: list[str] = []
    matched_count = 0
    matched_tree_ids: set[str] = set()
    for item in brief_items:
        text = item["text"]
        label = item["label"]
        matched = match_sentence_to_tree_nodes(text, sentence_subtrees)
        if matched:
            matched_count += 1
            for m in matched:
                matched_tree_ids.add(m.get("archetypeId", ""))
            arrow_html = " · ".join(
                f'<code>{escape(m.get("archetypeId","?"))}</code>'
                for m in matched
            )
            row_class = "brief-arrow-row matched"
            arrow = f'<span class="brief-arrow">→</span> {arrow_html}'
        else:
            row_class = "brief-arrow-row orphan"
            arrow = '<span class="brief-arrow">→</span> <span class="orphan-tag">orphan — no tree match</span>'
        brief_arrow_rows.append(
            f'<div class="{row_class}">'
            f'  <span class="brief-row-label">{escape(label)}</span>'
            f'  <span class="brief-row-text">{escape(text)}</span>'
            f'  {arrow}'
            f'</div>'
        )

    # Brief panel
    pct_matched = (matched_count / len(brief_items) * 100) if brief_items else 0
    brief_panel = (
        f'<div class="brief-panel">'
        f'  <h3>Brief → Sentence routing</h3>'
        f'  <p class="muted">{matched_count} / {len(brief_items)} brief items routed to a sentence ({pct_matched:.0f}%). '
        f'Orphans surface a gap in the engine\'s recognition vocabulary.</p>'
        f'  <pre class="brief-verbatim">{escape(brief_text)}</pre>'
        f'  <div class="brief-arrows">{"".join(brief_arrow_rows)}</div>'
        f'</div>'
    )

    # Linguistic-hierarchy panel
    sentence_cards = "".join(
        render_sentence_card(
            s_node, sentences_meta, words_meta, word_modifiers,
            glyphs, char_radicals, grammar_node_index,
        )
        for s_node in sentence_subtrees
    )

    # Unattached constraints
    unattached_html = ""
    if unattached:
        unattached_html = (
            '<div class="unattached-constraints">'
            '<h4>Unattached constraints — engine has no modeled handle for these</h4>'
            '<p class="muted">These brief constraints were extracted but could not be routed to a word-level node. Either the target word doesn\'t exist in the tree for this product, or the constraint type isn\'t modelled.</p>'
            + "".join(f'<span class="unattached-pill">{escape(u)}</span>' for u in unattached)
            + '</div>'
        )

    hierarchy_panel = (
        f'<div class="hierarchy-panel">'
        f'  <h3>Linguistic Hierarchy (sentence → word → character → radicals)</h3>'
        f'  <p class="muted">Modifying-characters attach at the WORD level. Character cards show ONLY their constituent radicals — they have no modifiers themselves.</p>'
        f'  {sentence_cards}'
        f'  {unattached_html}'
        f'</div>'
    )

    grammar_panel = render_grammar_panel(verdicts, regulatory)

    # All leaves for the BoM table
    all_leaves = collect_all_leaves(root)
    bom_panel = render_bom_table(all_leaves, slug, snapshot_label)

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
        f'      <span class="muted">{len(sentence_subtrees)} sentences · {len(all_leaves)} leaves</span>'
        f'    </div>'
        f'  </header>'
        f'  {brief_panel}'
        f'  {hierarchy_panel}'
        f'  {grammar_panel}'
        f'  {bom_panel}'
        f'</section>'
    )


# ── Page-level rendering ────────────────────────────────────────────────────

CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#fff;color:#1a1a1a;font-size:14px;line-height:1.5;padding:0}
.page{max-width:1320px;margin:0 auto;padding:32px 28px 80px}
h1{font-size:26px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px}
h2{font-size:20px;font-weight:700;letter-spacing:-.01em;margin:0}
h3{font-size:14px;font-weight:700;margin:0 0 8px;color:#222}
h4{font-size:12px;font-weight:600;margin:10px 0 6px;color:#555;text-transform:uppercase;letter-spacing:.04em}
p{margin-bottom:8px}
code{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:12px;background:#f4f4f4;padding:1px 5px;border-radius:3px;color:#222}
pre{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:12px;line-height:1.45;background:#f8f8f8;border:1px solid #e5e5e5;border-radius:4px;padding:10px 12px;overflow-x:auto;color:#1a1a1a}
.muted{color:#888;font-size:12px;font-style:italic}
.warn{color:#a05a00}
.page-header{border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:20px}
.page-header .meta{font-size:12px;color:#666;margin-top:6px}

.intro-note{background:#fef9e7;border-left:4px solid #c08a1a;border-radius:0 6px 6px 0;padding:14px 18px;margin:14px 0 22px;font-size:13px;line-height:1.6;color:#5a3a00}
.intro-note strong{color:#3a2400}

.legend{margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#444;align-items:center}
.legend-swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}

.product{margin-bottom:48px;border:1px solid #d0d0d0;border-radius:6px;overflow:hidden;background:#fff}
.product.missing{padding:20px}
.product-header{padding:14px 18px;background:#f0f0f0;border-bottom:1px solid #d0d0d0}
.product-header h2{margin-bottom:4px}
.product-meta{font-size:12px;color:#444}
.product-meta strong{color:#1a1a1a}
.overbudget{display:inline-block;background:#c0392b;color:#fff;padding:1px 7px;border-radius:3px;font-weight:600;font-size:11px;margin-left:6px}

/* ── Brief panel ── */
.brief-panel{padding:14px 18px;background:#fafafa;border-bottom:1px solid #e5e5e5}
.brief-verbatim{background:#fff;border:1px solid #e5e5e5;font-size:11px;max-height:160px;overflow-y:auto;margin-bottom:10px}
.brief-arrows{display:flex;flex-direction:column;gap:4px;font-size:12px;background:#fff;border:1px solid #e5e5e5;border-radius:4px;padding:8px 10px}
.brief-arrow-row{display:grid;grid-template-columns:80px 1fr auto;gap:10px;padding:4px 6px;border-radius:3px;align-items:baseline}
.brief-arrow-row.matched:hover{background:#f6fbf6}
.brief-arrow-row.orphan{background:#fdf4f4}
.brief-row-label{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:10px;color:#888;text-transform:uppercase}
.brief-row-text{color:#222;line-height:1.5}
.brief-arrow{color:#666;font-weight:600;margin:0 4px}
.orphan-tag{color:#a32020;font-weight:600;font-size:11px}

/* ── Linguistic hierarchy panel ── */
.hierarchy-panel{padding:14px 18px;background:#fff;border-bottom:1px solid #e5e5e5}

.sentence-card{border:2px solid #1a1a1a;border-left:6px solid #1a1a1a;border-radius:5px;background:#fafafa;margin-bottom:14px;overflow:hidden}
.sentence-header{padding:9px 12px;background:#1a1a1a;color:#fff;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sentence-name{background:#333;color:#fff;font-size:12px;font-weight:600}
.sentence-label{font-size:13px;color:#eee}
.sentence-body{padding:10px 14px 14px;display:flex;flex-direction:column;gap:10px}

.word-card{border:1px solid #888;border-left:5px solid #888;border-radius:4px;background:#f6f6f6;margin-left:14px;overflow:hidden}
.word-header{padding:7px 11px;background:#e0e0e0;display:flex;align-items:center;gap:9px;flex-wrap:wrap;border-bottom:1px solid #c8c8c8}
.word-name{background:#fff;font-size:12px;font-weight:600;color:#222}
.word-label{font-size:12px;color:#555}
.word-modifiers{padding:7px 11px;background:#fff;border-bottom:1px dashed #d0d0d0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.word-modifiers-empty{background:#fafafa}
.word-mod-label{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.05em;margin-right:6px}
.modchip{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:500;border:1px solid transparent}
.modchip-qty{background:#fef6e4;border-color:#e6c97a;color:#6a4500}
.modchip-form{background:#e8f4fd;border-color:#9ec5e8;color:#1f4f7e}
.modchip-spec{background:#f0fae8;border-color:#9ed089;color:#2a6a1e}

.word-characters{padding:8px 11px;display:flex;flex-direction:column;gap:8px}
.word-chars-label{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}

.char-card{border:1px solid #c0c0c0;border-left:4px solid #c0c0c0;border-radius:3px;background:#fff;margin-left:14px;overflow:hidden}
.char-card.has-grammar-warn{border-color:#e6b85a;border-left-color:#e6b85a;box-shadow:inset -3px 0 0 0 #c08a1a}
.char-card.has-grammar-block{border-color:#e09090;border-left-color:#e09090;box-shadow:inset -3px 0 0 0 #c0392b}
.char-header{padding:6px 10px;background:#fafafa;display:flex;align-items:center;gap:9px;flex-wrap:wrap;border-bottom:1px solid #ececec}
.char-name{background:#fff;font-size:11.5px;font-weight:600;color:#222}
.hier-qty{font-size:11px;font-weight:600;color:#555;background:#fff;border:1px solid #d8d8d8;padding:0 6px;border-radius:9px}
.char-grammar-badge{font-size:10px;font-weight:600;padding:1px 7px;border-radius:9px}
.badge-warn{background:#fff4dc;color:#8a6000;border:1px solid #e6c97a}
.badge-block{background:#fde8e8;color:#a32020;border:1px solid #e0a0a0}
.char-body{padding:8px 10px}
.char-radicals-label{font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:9.5px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.char-glyph-row{display:flex;flex-wrap:wrap;gap:6px}
.char-no-radicals{font-size:11px;color:#a32020;background:#fdf4f4;border:1px solid #e8c4c4;padding:5px 9px;border-radius:3px}

.hier-tag{display:inline-block;padding:2px 6px;border-radius:3px;font-family:"SF Mono","Fira Code",Consolas,monospace;font-size:9px;font-weight:700;letter-spacing:.06em}
.hier-tag-sentence{background:#fff;color:#1a1a1a}
.hier-tag-word{background:#888;color:#fff}
.hier-tag-char{background:#c0c0c0;color:#222}

/* ── Glyph tile ── */
.glyph-tile{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid #d0d0d0;background:#fff;border-radius:4px;padding:4px 6px 3px;min-width:62px;max-width:90px}
.glyph-tile-svg{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:3px}
.glyph-tile-svg.cat-material{background:#e8f4fd}
.glyph-tile-svg.cat-function{background:#f0fae8}
.glyph-tile-svg.cat-state{background:#fef6e4}
.glyph-tile-svg.cat-unknown{background:#f4f4f4;color:#888;font-weight:700;font-family:monospace}
.glyph-tile-label{font-size:8.5px;color:#444;text-align:center;line-height:1.2;font-family:"SF Mono","Fira Code",Consolas,monospace}
.glyph-tile-fallback{border-style:dashed;border-color:#bbb}

/* ── Grammar panel ── */
.grammar-panel{padding:14px 18px;background:#fafafa;border-bottom:1px solid #e5e5e5}
.rule-rows{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.rule-row{display:grid;grid-template-columns:24px 1fr;gap:8px;padding:7px 10px;border-radius:4px;border:1px solid #e0e0e0;background:#fff}
.rule-row.rule-pass{border-color:#c0e0c8;background:#f6fbf6}
.rule-row.rule-warn{border-color:#e6c97a;background:#fef9e7}
.rule-row.rule-block{border-color:#e0a0a0;background:#fdf4f4}
.rule-icon{font-size:14px;text-align:center;line-height:1.4}
.rule-head{font-size:12px;font-weight:600;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rule-verdict{font-size:10px;padding:1px 6px;border-radius:9px;background:#1a1a1a;color:#fff}
.rule-pass .rule-verdict{background:#1e7a3c}
.rule-warn .rule-verdict{background:#a05a00}
.rule-block .rule-verdict{background:#c0392b}
.rule-hardness{font-size:10px;color:#888;font-style:italic}
.rule-desc{font-size:11px;color:#444;margin-top:3px}
.rule-reason{font-size:11px;color:#222;margin-top:3px;font-family:"SF Mono","Fira Code",Consolas,monospace;line-height:1.4}
.rule-affected{font-size:11px;color:#666;margin-top:3px}
.rule-affected code{background:#fff;font-size:10.5px}

.grammar-regulatory{margin-top:12px;padding:8px 10px;background:#fff;border:1px solid #e5e5e5;border-radius:4px}
.reg-pill{display:inline-block;background:#e8f4fd;color:#1f4f7e;border:1px solid #9ec5e8;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:500;margin:2px 4px 2px 0}

.unattached-constraints{margin-top:14px;padding:10px 14px;background:#fdf4f4;border:1px solid #e0a0a0;border-radius:4px}
.unattached-constraints h4{color:#a32020;margin-top:0}
.unattached-pill{display:inline-block;background:#fff;color:#a32020;border:1px solid #e0a0a0;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:500;margin:2px 4px 2px 0}

/* ── BoM panel ── */
.bom-panel{padding:14px 18px;background:#fff}
.bom-panel h3{margin-bottom:8px}
table.leaves{width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #e5e5e5}
table.leaves th{background:#f0f0f0;text-align:left;padding:5px 7px;border:1px solid #d8d8d8;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#555}
table.leaves td{padding:4px 7px;border:1px solid #ececec;vertical-align:top}
table.leaves tfoot td{background:#fafafa;border-top:2px solid #888}
table.leaves code{font-size:10.5px;background:#fafafa}
.grade-verified{background:#e6f4ea;color:#1e7a3c;text-align:center;font-weight:600}
.grade-c{background:#fff4dc;color:#8a6000;text-align:center;font-weight:600}
.grade-d{background:#f0f0f0;color:#666;text-align:center;font-weight:500}
.grade-gap{background:#fde8e8;color:#a32020;text-align:center;font-weight:600}
.bom-panel ul{list-style:none;font-size:12px;line-height:1.7;padding-left:0;margin-top:4px}
.bom-panel li.ok{color:#1e7a3c}
.bom-panel li.warn{color:#8a5a00}
.bom-panel li.miss{color:#a32020}
.bug-list{font-size:12px;color:#a32020;list-style:none;padding-left:0}
.bug-list li{padding:4px 8px;background:#fff;border-left:3px solid #c0392b;margin-bottom:4px;border-radius:0 3px 3px 0}

@media print{
  .product{page-break-inside:avoid;border:1px solid #888}
  .sentence-card{page-break-inside:avoid}
  .product-header{background:#eee !important}
}
"""


def render_page(
    products_html: list[str], batch_dir: Path, glyphs: dict[str, dict]
) -> str:
    glyph_count = sum(1 for g in glyphs.values() if g.get("svg32"))
    legend = (
        '<div class="legend">'
        '<span><span class="legend-swatch" style="background:#1a1a1a"></span>Sentence (subsystem)</span>'
        '<span><span class="legend-swatch" style="background:#888"></span>Word (procurable spec)</span>'
        '<span><span class="legend-swatch" style="background:#c0c0c0"></span>Character (radical combo)</span>'
        '<span><span class="legend-swatch" style="background:#fef6e4;border:1px solid #e6c97a"></span>×qty modifier</span>'
        '<span><span class="legend-swatch" style="background:#e8f4fd;border:1px solid #9ec5e8"></span>form/role modifier</span>'
        '<span><span class="legend-swatch" style="background:#f0fae8;border:1px solid #9ed089"></span>brief-spec modifier</span>'
        '</div>'
    )
    intro = (
        '<div class="intro-note">'
        '<strong>Linguistic model.</strong> '
        'Radicals are the 22 universal atoms (Silicon, LFP, Steel, etc.). '
        'Characters are combinations of radicals. '
        'Words are one or more characters PLUS modifying-characters '
        '(quantity, capacity, form-factor, function descriptor) — '
        '<strong>modifiers attach at the WORD level, not the character level.</strong> '
        'Sentences are subsystems made of words. Paragraphs are whole products. '
        'Grammar rules are constraints that link multiple nodes across the structure.'
        '</div>'
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ForgeOS Radical · Translation Proof (linguistic hierarchy)</title>
<style>{CSS}</style>
</head>
<body>
<div class="page">
<div class="page-header">
  <h1>ForgeOS Radical — Translation Proof (linguistic hierarchy)</h1>
  <div class="meta">
    Source: <code>{escape(str(batch_dir))}</code> ·
    Glyph library: {glyph_count} radicals from <code>RADICAL-GLYPHS-V0.html</code> ·
    Light theme · Date: 2026-05-11
  </div>
  {legend}
</div>
{intro}
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
        default=str(Path.home() / "Downloads/radical-translation-proof-v4-v2.html"),
    )
    args = parser.parse_args()

    batch_dir = Path(args.batch_dir).expanduser()
    output = Path(args.output).expanduser()
    snapshot_label = output.name

    glyphs = extract_glyphs()
    char_radicals = extract_characters()
    sentences_meta, words_meta = extract_hierarchy()
    print(
        f"[init] glyphs={len(glyphs)}  chars={len(char_radicals)}  "
        f"sentences={len(sentences_meta)}  words={len(words_meta)}  batch={batch_dir}",
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
            render_product_section(
                slug, title, brief_text, state or {},
                glyphs, char_radicals, sentences_meta, words_meta,
                snapshot_label,
            )
        )

    html = render_page(sections, batch_dir, glyphs)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    size_kb = output.stat().st_size / 1024
    print(f"[ok] wrote {output} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
