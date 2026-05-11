#!/usr/bin/env python3
"""
Engine Accuracy Scorecard — Phase A diagnostic for the Radical engine.

Reads a radical-shadow-* snapshot directory and emits an HTML scorecard that
measures whether the linguistic structure (paragraph -> sentence -> word ->
character -> radical/leaf) holds across products.

This is a STRUCTURAL CORRECTNESS gate, not a data-pretty gate. The point is to
catch wrong-domain archetypes, shallow trees, orphan brief items, and missing
radicals — the failures that prove the engine is rigid, not universal.

Usage:
    python3 scripts/engine-accuracy-scorecard.py \
        --batch-dir ~/Downloads/engine-evidence/radical-shadow-20260511T0839 \
        --output ~/Downloads/engine-accuracy-scorecard-V6.html

No external dependencies. Pure stdlib. No multimodal API calls.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import html
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Domain knowledge: per-class archetype allowlists for wrong-domain detection.
#
# These are the top-level "sentenceId" archetypes that legitimately belong
# under each product class. A sentence archetype outside this list is flagged
# as a wrong-domain violation. The lists are intentionally generous — they
# only need to catch obvious cross-contamination.
# ---------------------------------------------------------------------------

DOMAIN_ALLOWLIST: dict[str, set[str]] = {
    "auv": {
        "flight_computer",
        "hull_and_buoyancy",
        "propulsion_system",
        "navigation_system",
        "payload_bay",
        "communications_system",
        "battery_system",
        "ballast_and_trim",
        "thruster_assembly",
        "pressure_hull",
        "control_surfaces",
    },
    "drone": {
        "flight_computer",
        "airframe_structure",
        "propulsion_system",
        "battery_system",
        "camera_payload",
        "gimbal_system",
        "communications_system",
        "landing_gear",
        "navigation_system",
    },
    "haps": {
        "flight_computer",
        "haps_airframe",
        "propulsion_system",
        "solar_array_system",
        "battery_system",
        "navigation_system",
        "communications_payload",
        "tail_assembly",
    },
    "bioreactor": {
        "bioreactor_vessel",
        "bioreactor_controls",
        "fluid_handling_system",
        "gas_handling_system",
        "temperature_control_system",
        "agitation_system",
        "sensor_suite",
        "tubing_and_connectors",
        "single_use_consumables",
    },
    "wearable_medical": {
        "biosensor_system",
        "medical_wearable_enclosure",
        "communications_module",
        "battery_system",
        "adhesive_and_skin_interface",
        "applicator_assembly",
    },
    "energy_storage": {
        "battery_management_system_bms",
        "battery_rack_assembly",
        "container_enclosure_fit_out",
        "dc_distribution_switchgear",
        "energy_management_system_ems_scada",
        "fire_detection_and_suppression_system_fss",
        "power_conversion_system_pcs",
        "thermal_management_system",
        "ac_distribution_switchgear",
        "transformer_assembly",
    },
    "edge_ai_server": {
        "edge_compute_system",
        "server_enclosure",
        "power_supply_system",
        "thermal_management_system",
        "networking_system",
        "storage_subsystem",
    },
    "ev_charger": {
        "charger_enclosure",
        "charger_power_conversion",
        "container_enclosure_fit_out",
        "dc_distribution_switchgear",
        "power_conversion_system_pcs",
        "ac_input_system",
        "cable_and_connector_assembly",
        "user_interface_panel",
        "thermal_management_system",
        "communications_system",
    },
    "vertical_farm": {
        "fertigation_loop",
        "growing_rack_system",
        "lighting_system",
        "hvac_system",
        "controls_and_sensors",
        "irrigation_system",
        "germination_system",
        "harvest_handling",
    },
    "thermal_system": {
        "heat_pump_controls",
        "heat_pump_enclosure",
        "hydronic_circuit",
        "refrigerant_circuit",
        "compressor_assembly",
        "evaporator_assembly",
        "condenser_assembly",
        "expansion_valve_assembly",
        "fan_assembly",
        "electrical_distribution",
    },
}


# Cross-class red flags — archetypes that almost certainly mean leakage when
# seen on the wrong class, regardless of the allowlist.
HARD_CROSS_DOMAIN_FLAGS: dict[str, set[str]] = {
    # refrigerant doesn't belong on flying or underwater vehicles, on wearables,
    # or on edge-AI servers / EV chargers / vertical farms / energy storage.
    "refrigerant_circuit": {
        "auv", "drone", "haps", "wearable_medical", "edge_ai_server",
        "ev_charger", "vertical_farm", "energy_storage",
    },
    "fire_detection_and_suppression_system_fss": {
        "auv", "drone", "haps", "wearable_medical", "bioreactor",
        "vertical_farm", "edge_ai_server",
    },
    "heat_pump_enclosure": {
        "auv", "drone", "haps", "wearable_medical", "bioreactor",
        "vertical_farm", "edge_ai_server", "ev_charger", "energy_storage",
    },
    "hydronic_circuit": {
        "auv", "drone", "haps", "wearable_medical", "edge_ai_server",
        "ev_charger", "vertical_farm", "energy_storage",
    },
    "hull_and_buoyancy": {
        "drone", "haps", "wearable_medical", "bioreactor", "energy_storage",
        "edge_ai_server", "ev_charger", "vertical_farm", "thermal_system",
    },
    "haps_airframe": {
        "auv", "drone", "wearable_medical", "bioreactor", "energy_storage",
        "edge_ai_server", "ev_charger", "vertical_farm", "thermal_system",
    },
}


# Distributor source allowlist for "verified" calculation
VERIFIED_SOURCES = {"mouser", "digikey", "farnell"}


# ---------------------------------------------------------------------------
# Snapshot loading
# ---------------------------------------------------------------------------


def _safe_load_json(path: Path) -> dict[str, Any] | None:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        sys.stderr.write(f"WARN: could not read {path}: {exc}\n")
        return None


def discover_products(batch_dir: Path) -> list[tuple[str, Path, Path]]:
    """Return list of (slug, manifest_path, state_path) for every rs-* subdir.

    Looks for `state.json` first; falls back to `radical-phase5-state-*.json`
    so the script also works if the snapshot format reverts to the older name.
    """
    out: list[tuple[str, Path, Path]] = []
    if not batch_dir.is_dir():
        return out
    for child in sorted(batch_dir.iterdir()):
        if not child.is_dir():
            continue
        if not child.name.startswith("rs-"):
            continue
        manifest = child / "run-manifest.json"
        state = child / "state.json"
        if not state.is_file():
            # Fall back to the older snapshot naming convention.
            phase5 = sorted(child.glob("radical-phase5-state-*.json"))
            if phase5:
                state = phase5[-1]
        if not manifest.is_file() or not state.is_file():
            sys.stderr.write(f"WARN: skipping {child.name} (missing manifest or state)\n")
            continue
        out.append((child.name, manifest, state))
    return out


def load_brief_text(brief_path: str | None) -> str:
    if not brief_path:
        return ""
    try:
        with open(brief_path, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


# ---------------------------------------------------------------------------
# Tree walking helpers
# ---------------------------------------------------------------------------


def walk_resolved_tree(root: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Walk the resolvedRadicalTree.composition.root and bucket nodes by linguistic depth.

    Convention:
        depth 0 = paragraph (root)
        depth 1 = sentence  (top-level module)
        depth 2 = word      (subsystem)
        depth 3 = character (subassembly that carries resolution = the "radical")
        depth >=4 = future-expansion, treated as leaf children of characters

    Returns a dict with keys 'paragraphs', 'sentences', 'words', 'characters',
    'leaves'. The leaves bucket contains every node whose `children` array is
    empty — these are the priceable/procurable items.
    """
    buckets: dict[str, list[dict[str, Any]]] = {
        "paragraphs": [],
        "sentences": [],
        "words": [],
        "characters": [],
        "leaves": [],
        # Bookkeeping: every visited node, with depth — used for depth==3
        # validation downstream. Not part of the public per-bucket layout.
        "_all": [],
    }
    if not isinstance(root, dict):
        return buckets

    next_uid = [0]  # mutable closure counter so we can give every node a unique id

    def _walk(node: dict[str, Any], depth: int, parent_path: list[str], parent_uid: int | None) -> None:
        if not isinstance(node, dict):
            return
        archetype_id = node.get("archetypeId") or "?"
        path = parent_path + [archetype_id]
        uid = next_uid[0]
        next_uid[0] += 1
        entry = {
            "node": node,
            "depth": depth,
            "path": path,
            "uid": uid,
            "parent_uid": parent_uid,
        }
        buckets["_all"].append(entry)
        if depth == 0:
            buckets["paragraphs"].append(entry)
        elif depth == 1:
            buckets["sentences"].append(entry)
        elif depth == 2:
            buckets["words"].append(entry)
        elif depth == 3:
            buckets["characters"].append(entry)
        children = node.get("children") or []
        if not children:
            # Only treat depth==3 children as procurable leaves. Earlier-exit
            # (an empty paragraph/sentence/word) is a structural defect surfaced
            # via orphan_sentences / empty_words, NOT a Layer-2 leaf.
            if depth == 3:
                buckets["leaves"].append(entry)
        else:
            for child in children:
                _walk(child, depth + 1, path, uid)

    _walk(root, 0, [], None)
    return buckets


# ---------------------------------------------------------------------------
# Brief noun-phrase extraction (lightweight, regex-only)
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
    "with", "from", "by", "as", "is", "are", "was", "were", "be", "been", "being",
    "this", "that", "these", "those", "we", "our", "you", "your", "their",
    "it", "its", "they", "i", "he", "she", "him", "her", "his", "us",
    "not", "no", "yes", "do", "does", "did", "have", "has", "had",
    "if", "then", "else", "than", "so", "such", "any", "all", "each",
    "per", "via", "etc", "eg", "ie", "vs", "into", "onto", "out",
    "key", "constraints", "targets", "market", "competes",
    "sub", "modules", "expected", "safety", "regulatory",
}
# NB: deliberately do NOT add unit abbreviations like "nm", "kg", "kw" here —
# they're meaningful tokens for brief-coverage matching (e.g. "100 m" rated depth).


def extract_brief_noun_phrases(text: str) -> list[str]:
    """Cheap extraction of candidate noun-phrases from a markdown brief.

    Heuristic: each bullet-point line, each comma-separated phrase, and each
    capitalised n-gram becomes a candidate. We strip stopwords, fold to
    lowercase, and dedupe.
    """
    phrases: list[str] = []
    if not text:
        return phrases

    bullet_re = re.compile(r"^\s*[-*]\s*(.+?)\s*$", re.MULTILINE)
    for match in bullet_re.findall(text):
        for chunk in re.split(r"[,;:]", match):
            chunk = chunk.strip()
            if 3 <= len(chunk) <= 80:
                phrases.append(chunk)

    sub_module_re = re.compile(r"sub[- ]modules expected:?\s*(.+?)(?:\n\n|\Z)", re.IGNORECASE | re.DOTALL)
    m = sub_module_re.search(text)
    if m:
        for chunk in re.split(r"[,;]", m.group(1)):
            chunk = chunk.strip().strip(".")
            if 3 <= len(chunk) <= 80:
                phrases.append(chunk)

    # Capitalised n-grams (e.g. "Lithium-ion battery") — be conservative.
    cap_re = re.compile(r"\b([A-Z][a-z]{2,}(?:[- ][A-Za-z][a-z]+){0,4})\b")
    for cap in cap_re.findall(text):
        if cap.lower() not in _STOPWORDS and 3 <= len(cap) <= 60:
            phrases.append(cap)

    # Deduplicate, lowercase, strip remaining stopword-only entries.
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in phrases:
        norm = re.sub(r"\s+", " ", raw.lower()).strip()
        if not norm or norm in seen:
            continue
        tokens = [t for t in re.findall(r"[a-z0-9]+", norm) if t not in _STOPWORDS]
        if not tokens:
            continue
        key = " ".join(tokens)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(norm)
    return cleaned


def extract_brief_modifiers(text: str) -> list[str]:
    """Extract numeric-spec modifiers (e.g. '100 m', '24 h', '12 kWh').

    Used by the modifier-extraction metric — we count how many such modifiers
    appear ANYWHERE in the resolved tree as a sanity check.
    """
    if not text:
        return []
    mod_re = re.compile(
        r"\b\d+(?:[.,]\d+)?\s?(?:kg|g|mm|cm|m|km|kw|kwh|wh|w|kva|v|a|ma|hz|khz|mhz|ghz|rpm|bar|psi|°c|c|h|hours?|hr|min|s|seconds?|knots?|nm|hp|mph|kn|mol|ppm|ppb|µm|um|nm|µa|nA)\b",
        re.IGNORECASE,
    )
    seen: set[str] = set()
    out: list[str] = []
    # finditer captures the full match span (number + unit); findall on a
    # capturing group would lose the leading digits.
    for m in mod_re.finditer(text):
        norm = m.group(0).lower().strip()
        if norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out


def tree_text_blob(buckets: dict[str, list[dict[str, Any]]]) -> str:
    """Concatenate every label, archetype, mpn, manufacturer, and note in
    the resolved tree into a single lowercase blob for keyword matching."""
    parts: list[str] = []
    for key in ("sentences", "words", "characters", "leaves"):
        for entry in buckets[key]:
            node = entry["node"]
            for k in ("archetypeId", "label"):
                v = node.get(k)
                if isinstance(v, str):
                    parts.append(v)
            res = node.get("resolution") or {}
            for k in ("mpn", "manufacturer", "grade_d_basis", "notes", "part_class"):
                v = res.get(k)
                if isinstance(v, str):
                    parts.append(v)
    return " ".join(parts).lower()


def normalise_tokens(s: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in _STOPWORDS and len(t) > 2]


# ---------------------------------------------------------------------------
# Per-product scoring
# ---------------------------------------------------------------------------


def score_product(slug: str, manifest: dict[str, Any], state: dict[str, Any],
                  brief_text: str) -> dict[str, Any]:
    """Compute Layer-1 (structural) and Layer-2 (data quality) metrics."""

    product_class = (manifest.get("productClass") or "").strip()
    composition = (state.get("resolvedRadicalTree") or {}).get("composition") or {}
    root = composition.get("root") or {}
    buckets = walk_resolved_tree(root)

    paragraphs = buckets["paragraphs"]
    sentences = buckets["sentences"]
    words = buckets["words"]
    characters = buckets["characters"]
    leaves = buckets["leaves"]

    # ---- Layer 1: structural validity ----

    # Radical coverage: a "character" has a radical when its `resolution` carries
    # an mpn OR a unit_price_gbp OR a grade_d_basis OR (since character==leaf in
    # the current data) when it is itself a leaf with non-empty resolution.
    def has_radical(node: dict[str, Any]) -> bool:
        res = node.get("resolution") or {}
        if not res:
            # If the node has children that are leaves with resolution, still OK.
            for child in node.get("children") or []:
                if (child.get("resolution") or {}).get("archetype_id"):
                    return True
            return False
        # Any populated resolution counts as a radical attachment.
        return bool(
            res.get("archetype_id")
            or res.get("mpn")
            or res.get("unit_price_gbp") is not None
            or res.get("grade_d_basis")
            or res.get("source")
        )

    chars_with_radical = [e for e in characters if has_radical(e["node"])]
    chars_missing_radical = [e for e in characters if not has_radical(e["node"])]
    radical_coverage_pct = (
        100.0 * len(chars_with_radical) / len(characters) if characters else 0.0
    )

    # Character coverage: % of words with >=1 character child.
    words_with_chars = [w for w in words if (w["node"].get("children") or [])]
    empty_words = [w for w in words if not (w["node"].get("children") or [])]
    character_coverage_pct = (
        100.0 * len(words_with_chars) / len(words) if words else 0.0
    )

    # Sentence coverage: % of sentences with >=1 word child.
    sentences_with_words = [s for s in sentences if (s["node"].get("children") or [])]
    orphan_sentences = [s for s in sentences if not (s["node"].get("children") or [])]
    sentence_coverage_pct = (
        100.0 * len(sentences_with_words) / len(sentences) if sentences else 0.0
    )

    # Paragraph integrity: exactly 1 paragraph, root archetype implies the class.
    paragraph_count = len(paragraphs)
    root_archetype = root.get("archetypeId") or ""
    paragraph_integrity_ok = paragraph_count == 1 and _archetype_matches_class(
        root_archetype, product_class
    )

    # Wrong-domain archetype detection.
    allow = DOMAIN_ALLOWLIST.get(product_class, set())
    wrong_domain: list[dict[str, Any]] = []
    for s in sentences:
        arch = s["node"].get("archetypeId") or ""
        if not arch:
            continue
        critical = False
        reason: list[str] = []
        if allow and arch not in allow:
            reason.append(f"not in allowlist for class '{product_class}'")
        hard_flags = HARD_CROSS_DOMAIN_FLAGS.get(arch, set())
        if product_class in hard_flags:
            reason.append(f"hard cross-domain flag (archetype forbidden on class '{product_class}')")
            critical = True
        if reason:
            wrong_domain.append({
                "archetype_id": arch,
                "reason": "; ".join(reason),
                "critical": critical,
            })
    # Score: 100 if no violations; subtract 25 per critical and 8 per non-critical, floor 0.
    wrong_domain_penalty = sum(25 if v["critical"] else 8 for v in wrong_domain)
    wrong_domain_score_pct = max(0.0, 100.0 - wrong_domain_penalty)

    # Modifier extraction: count brief modifiers that appear anywhere in the tree.
    brief_modifiers = extract_brief_modifiers(brief_text)
    blob = tree_text_blob(buckets)
    attached_modifiers = [m for m in brief_modifiers if m.replace(" ", "") in blob.replace(" ", "")]
    unattached_modifiers = [m for m in brief_modifiers if m not in attached_modifiers]
    modifier_extraction_pct = (
        100.0 * len(attached_modifiers) / len(brief_modifiers) if brief_modifiers else 0.0
    )

    # Brief coverage: % of brief noun-phrases that map to >=1 tree node.
    brief_phrases = extract_brief_noun_phrases(brief_text)
    tree_tokens = set(normalise_tokens(blob))
    covered_phrases: list[str] = []
    orphan_phrases: list[str] = []
    for phrase in brief_phrases:
        phrase_tokens = set(normalise_tokens(phrase))
        if not phrase_tokens:
            continue
        overlap = phrase_tokens & tree_tokens
        # Coverage = >=1 meaningful token matches (length>=4 to avoid generic 3-letter hits)
        meaningful = {t for t in overlap if len(t) >= 4}
        if meaningful:
            covered_phrases.append(phrase)
        else:
            orphan_phrases.append(phrase)
    brief_coverage_pct = (
        100.0 * len(covered_phrases) / (len(covered_phrases) + len(orphan_phrases))
        if (covered_phrases or orphan_phrases) else 0.0
    )

    # Tree depth: mean leaves per sentence + total leaves. Walk via uid lineage
    # so two sentences sharing an archetype name don't double-count each other's
    # leaves (Gemini council fix).
    parent_index: dict[int, int | None] = {e["uid"]: e["parent_uid"] for e in buckets["_all"]}

    def _ancestors(uid: int | None) -> set[int]:
        out: set[int] = set()
        while uid is not None:
            out.add(uid)
            uid = parent_index.get(uid)
        return out

    leaves_per_sentence: list[int] = []
    for s in sentences:
        s_uid = s["uid"]
        cnt = sum(1 for l in leaves if s_uid in _ancestors(l["uid"]))
        leaves_per_sentence.append(cnt)
    total_leaves = len(leaves)
    mean_leaves_per_sentence = (
        sum(leaves_per_sentence) / len(leaves_per_sentence) if leaves_per_sentence else 0.0
    )
    shallow_sentences = [
        sentences[i] for i, c in enumerate(leaves_per_sentence) if c < 2
    ]
    # Depth-shape validation (GLM council fix): every leaf must sit at depth 3
    # for the linguistic structure to be intact. Anything else is a structural
    # defect that the scorer should refuse to ignore.
    misplaced_leaves = [l for l in leaves if l["depth"] != 3]
    # Also surface unattached early-exit nodes (paragraph/sentence/word with
    # no children — these are NOT leaves but represent under-decomposition).
    early_exit_nodes = [e for e in buckets["_all"]
                        if e["depth"] < 3 and not (e["node"].get("children") or [])]
    # Score: 100 if total_leaves >= 8 AND no shallow sentences AND no misplaced leaves;
    # else scale down with explicit penalties.
    if total_leaves >= 8 and not shallow_sentences and not misplaced_leaves:
        tree_depth_pct = 100.0
    else:
        deficit = max(0, 8 - total_leaves)
        tree_depth_pct = max(
            0.0,
            100.0 - 10.0 * len(shallow_sentences) - 5.0 * deficit - 15.0 * len(misplaced_leaves),
        )

    paragraph_pct = 100.0 if paragraph_integrity_ok else 0.0

    # Structural validity composite (weights from spec).
    structural = {
        "radical_coverage": (radical_coverage_pct, 0.15),
        "character_coverage": (character_coverage_pct, 0.15),
        "modifier_extraction": (modifier_extraction_pct, 0.10),
        "sentence_coverage": (sentence_coverage_pct, 0.10),
        "paragraph_integrity": (paragraph_pct, 0.10),
        "wrong_domain": (wrong_domain_score_pct, 0.25),
        "brief_coverage": (brief_coverage_pct, 0.10),
        "tree_depth": (tree_depth_pct, 0.05),
    }
    structural_validity_score = sum(v * w for (v, w) in structural.values())

    # ---- Layer 2: data quality (procurability) ----

    def leaf_res(e: dict[str, Any]) -> dict[str, Any]:
        return e["node"].get("resolution") or {}

    priced_leaves = [e for e in leaves if leaf_res(e).get("unit_price_gbp") is not None]
    verified_leaves = [e for e in leaves if leaf_res(e).get("source") in VERIFIED_SOURCES]
    mfr_populated = [
        e for e in leaves
        if (leaf_res(e).get("manufacturer") or "").strip()
        and (leaf_res(e).get("mpn") or "").strip()
    ]
    leadtime_populated = [e for e in leaves if leaf_res(e).get("lead_weeks") is not None]

    priced_pct = 100.0 * len(priced_leaves) / len(leaves) if leaves else 0.0
    verified_pct = 100.0 * len(verified_leaves) / len(leaves) if leaves else 0.0
    mfr_pct = 100.0 * len(mfr_populated) / len(leaves) if leaves else 0.0
    leadtime_pct = 100.0 * len(leadtime_populated) / len(leaves) if leaves else 0.0

    # Distributor diversity: how many distinct sources appear (out of an ideal 4)
    src_counter: Counter[str] = Counter()
    for e in leaves:
        s = (leaf_res(e).get("source") or "no-source").strip() or "no-source"
        src_counter[s] += 1
    distinct_real_sources = len([s for s in src_counter if s in VERIFIED_SOURCES])
    # 0 sources -> 0%, full coverage of VERIFIED_SOURCES -> 100% (GLM fix:
    # previous *33.0 capped at 99% even with all 3 distributors present).
    diversity_pct = min(
        100.0, 100.0 * distinct_real_sources / max(1, len(VERIFIED_SOURCES))
    )

    avg_unit_price = (
        sum(leaf_res(e).get("unit_price_gbp") or 0.0 for e in priced_leaves) / len(priced_leaves)
        if priced_leaves else 0.0
    )

    layer2 = {
        "priced": (priced_pct, 0.25),
        "verified": (verified_pct, 0.25),
        "manufacturer_populated": (mfr_pct, 0.20),
        "leadtime": (leadtime_pct, 0.15),
        "distributor_diversity": (diversity_pct, 0.15),
    }
    data_quality_score = sum(v * w for (v, w) in layer2.values())

    # ---- Universality flag ----
    has_critical_wrong = any(v["critical"] for v in wrong_domain)
    universality = (
        structural_validity_score >= 80.0
        and not has_critical_wrong
        and brief_coverage_pct >= 50.0
    )

    is_empty_tree = not paragraphs and not sentences and not leaves

    return {
        "slug": slug,
        "product_class": product_class,
        "root_archetype": root_archetype,
        "ok": manifest.get("ok"),
        "saved_at": manifest.get("savedAt"),
        "is_empty_tree": is_empty_tree,
        "structural_validity_score": round(structural_validity_score, 1),
        "data_quality_score": round(data_quality_score, 1),
        "universality": "Y" if universality else "N",
        "metrics": {
            "radical_coverage_pct": round(radical_coverage_pct, 1),
            "character_coverage_pct": round(character_coverage_pct, 1),
            "modifier_extraction_pct": round(modifier_extraction_pct, 1),
            "sentence_coverage_pct": round(sentence_coverage_pct, 1),
            "paragraph_integrity_ok": paragraph_integrity_ok,
            "wrong_domain_score_pct": round(wrong_domain_score_pct, 1),
            "brief_coverage_pct": round(brief_coverage_pct, 1),
            "tree_depth_pct": round(tree_depth_pct, 1),
            "priced_pct": round(priced_pct, 1),
            "verified_pct": round(verified_pct, 1),
            "manufacturer_populated_pct": round(mfr_pct, 1),
            "leadtime_pct": round(leadtime_pct, 1),
            "distributor_diversity_pct": round(diversity_pct, 1),
        },
        "counts": {
            "paragraphs": paragraph_count,
            "sentences": len(sentences),
            "words": len(words),
            "characters": len(characters),
            "leaves": total_leaves,
            "mean_leaves_per_sentence": round(mean_leaves_per_sentence, 2),
            "priced_leaves": len(priced_leaves),
            "verified_leaves": len(verified_leaves),
            "mfr_populated_leaves": len(mfr_populated),
            "leadtime_leaves": len(leadtime_populated),
            "brief_phrases_total": len(covered_phrases) + len(orphan_phrases),
            "brief_phrases_covered": len(covered_phrases),
            "brief_modifiers_total": len(brief_modifiers),
            "brief_modifiers_attached": len(attached_modifiers),
            "distinct_real_sources": distinct_real_sources,
            "avg_unit_price_gbp": round(avg_unit_price, 2),
        },
        "distributor_breakdown": dict(src_counter),
        "evidence": {
            "wrong_domain_sentences": wrong_domain,
            "orphan_sentences": [s["node"].get("archetypeId") for s in orphan_sentences],
            "empty_words": [w["node"].get("archetypeId") for w in empty_words],
            "chars_missing_radical": [c["node"].get("archetypeId") for c in chars_missing_radical],
            "shallow_sentences": [
                s["node"].get("archetypeId") for s in shallow_sentences
            ],
            "misplaced_leaves": [
                {"depth": l["depth"], "path": l["path"]} for l in misplaced_leaves
            ],
            "early_exit_nodes": [
                {"depth": e["depth"], "archetype": e["node"].get("archetypeId")}
                for e in early_exit_nodes
            ],
            "orphan_brief_phrases": orphan_phrases[:30],
            "unattached_brief_modifiers": unattached_modifiers[:30],
            "all_sentences": [s["node"].get("archetypeId") for s in sentences],
        },
    }


def _archetype_matches_class(archetype: str, product_class: str) -> bool:
    """The root archetype should mention the class or a synonym.

    Match on tokens (split on '_'/'-'/' ') rather than substring, so
    e.g. 'edge_compute_system' matches class 'edge_ai_server' via the 'edge'
    token but does NOT spuriously match an unrelated 'wedge_assembly' archetype.
    """
    if not archetype or not product_class:
        return False
    a_tokens = set(re.split(r"[_\-\s]+", archetype.lower()))
    c = product_class.lower()
    synonyms = {
        "auv": ["auv", "underwater"],
        "drone": ["drone", "uav", "quadcopter", "cinematography"],
        "haps": ["haps", "stratospheric"],
        "bioreactor": ["bioreactor"],
        "wearable_medical": ["cgm", "wearable", "patch"],
        "energy_storage": ["bess", "energy_storage"],
        "edge_ai_server": ["edge", "inference"],
        "ev_charger": ["ev", "charger"],
        "vertical_farm": ["farm"],
        "thermal_system": ["heat", "thermal"],
    }
    candidates = synonyms.get(c, [c])
    for token in candidates:
        # Multi-word synonyms (e.g. "energy_storage") match if all parts present.
        parts = re.split(r"[_\-\s]+", token)
        if all(p in a_tokens for p in parts):
            return True
    return False


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------


def _esc(x: Any) -> str:
    if x is None:
        return ""
    return html.escape(str(x), quote=True)


def _pct_row(label: str, pct: float, threshold: float, badness: str = "red") -> str:
    failed = pct < threshold
    cls = badness if failed else "ok"
    return (
        f'<tr class="{cls}"><td>{_esc(label)}</td>'
        f'<td class="num">{pct:.1f}%</td>'
        f'<td class="thr">target &ge; {threshold:.0f}%</td></tr>'
    )


def render_card(p: dict[str, Any]) -> str:
    m = p["metrics"]
    c = p["counts"]
    ev = p["evidence"]
    universal = p["universality"] == "Y"
    border = "border-green" if universal else "border-red"

    # Layer-1 table
    layer1_rows = [
        _pct_row("Radical coverage (characters with resolution)", m["radical_coverage_pct"], 100),
        _pct_row("Character coverage (words with characters)", m["character_coverage_pct"], 100),
        _pct_row("Modifier extraction (brief specs surfaced)", m["modifier_extraction_pct"], 50),
        _pct_row("Sentence coverage (sentences with words)", m["sentence_coverage_pct"], 100),
        f'<tr class="{"ok" if m["paragraph_integrity_ok"] else "red"}">'
        f'<td>Paragraph integrity (1 root, class match)</td>'
        f'<td class="num">{"OK" if m["paragraph_integrity_ok"] else "FAIL"}</td>'
        f'<td class="thr">root: {_esc(p["root_archetype"])}</td></tr>',
        _pct_row("Wrong-domain archetype score", m["wrong_domain_score_pct"], 80),
        _pct_row("Brief coverage (noun-phrases mapped)", m["brief_coverage_pct"], 50),
        _pct_row("Tree depth (>=8 leaves, no shallow sentence)", m["tree_depth_pct"], 80),
    ]

    layer2_rows = [
        _pct_row("Priced ratio (unit_price_gbp present)", m["priced_pct"], 80),
        _pct_row("Verified ratio (real distributor URL)", m["verified_pct"], 50, badness="orange"),
        _pct_row("Manufacturer + MPN populated", m["manufacturer_populated_pct"], 50, badness="orange"),
        _pct_row("Lead-time captured", m["leadtime_pct"], 50, badness="orange"),
        _pct_row("Distributor diversity", m["distributor_diversity_pct"], 66, badness="orange"),
    ]

    # Distributor breakdown
    dist_items = "".join(
        f"<li><b>{_esc(k)}</b>: {v}</li>"
        for k, v in sorted(p["distributor_breakdown"].items(), key=lambda x: -x[1])
    )

    # Evidence sections
    def _ev_list(label: str, items: list[Any], css: str = "") -> str:
        if not items:
            return ""
        rows = "".join(f"<li>{_esc(x)}</li>" for x in items)
        return f'<div class="ev-block {css}"><b>{_esc(label)} ({len(items)})</b><ul>{rows}</ul></div>'

    wrong_domain_rows = "".join(
        f'<li class="{"crit" if v.get("critical") else ""}">'
        f'<code>{_esc(v["archetype_id"])}</code> &mdash; {_esc(v["reason"])}'
        f'{" <b>[CRITICAL]</b>" if v.get("critical") else ""}'
        f'</li>'
        for v in ev["wrong_domain_sentences"]
    )
    evidence_html = (
        (f'<div class="ev-block red"><b>Wrong-domain sentences ({len(ev["wrong_domain_sentences"])})</b>'
         f'<ul>{wrong_domain_rows}</ul></div>' if ev["wrong_domain_sentences"] else "")
        + _ev_list("Orphan sentences (no words)", ev["orphan_sentences"], "red")
        + _ev_list("Empty words (no characters)", ev["empty_words"], "red")
        + _ev_list("Characters missing radical", ev["chars_missing_radical"], "red")
        + _ev_list("Misplaced leaves (depth != 3)",
                   [f"depth={ml['depth']} path={'/'.join(ml['path'])}" for ml in ev.get("misplaced_leaves", [])],
                   "red")
        + _ev_list("Early-exit nodes (paragraph/sentence/word with no children)",
                   [f"depth={e['depth']} archetype={e['archetype']}" for e in ev.get("early_exit_nodes", [])],
                   "orange")
        + _ev_list("Shallow sentences (<2 leaves)", ev["shallow_sentences"], "orange")
        + _ev_list("Orphan brief phrases (no tree match)", ev["orphan_brief_phrases"], "orange")
        + _ev_list("Unattached brief modifiers", ev["unattached_brief_modifiers"], "orange")
        + _ev_list("All sentences (top-level archetypes)", ev["all_sentences"])
    )

    return f"""
<section class="card {border}">
  <header>
    <h2>{_esc(p['slug'])} <span class="muted">({_esc(p['product_class'])})</span></h2>
    <div class="badges">
      <span class="badge {'good' if universal else 'bad'}">Universality: {p['universality']}</span>
      <span class="badge">SV: {p['structural_validity_score']:.1f}</span>
      <span class="badge">DQ: {p['data_quality_score']:.1f}</span>
    </div>
    <div class="muted small">Root archetype: <code>{_esc(p['root_archetype'])}</code> &middot; Saved: {_esc(p.get('saved_at'))}</div>
  </header>

  <div class="counts">
    <span><b>Paragraphs:</b> {c['paragraphs']}</span>
    <span><b>Sentences:</b> {c['sentences']}</span>
    <span><b>Words:</b> {c['words']}</span>
    <span><b>Characters:</b> {c['characters']}</span>
    <span><b>Leaves:</b> {c['leaves']}</span>
    <span><b>Mean leaves/sentence:</b> {c['mean_leaves_per_sentence']}</span>
    <span><b>Priced:</b> {c['priced_leaves']}/{c['leaves']}</span>
    <span><b>Verified:</b> {c['verified_leaves']}/{c['leaves']}</span>
    <span><b>Avg unit price:</b> &pound;{c['avg_unit_price_gbp']}</span>
  </div>

  <h3>Layer 1 &mdash; Structural validity</h3>
  <table class="metrics">
    <thead><tr><th>Metric</th><th>Value</th><th>Threshold</th></tr></thead>
    <tbody>{''.join(layer1_rows)}</tbody>
  </table>

  <h3>Layer 2 &mdash; Data quality (procurability)</h3>
  <table class="metrics">
    <thead><tr><th>Metric</th><th>Value</th><th>Threshold</th></tr></thead>
    <tbody>{''.join(layer2_rows)}</tbody>
  </table>

  <h4>Distributor breakdown</h4>
  <ul class="dist">{dist_items or '<li><i>(none)</i></li>'}</ul>

  <details>
    <summary>Raw evidence</summary>
    {evidence_html or '<i>(no orphans, no wrong-domain hits)</i>'}
  </details>
</section>
"""


def render_summary_table(products: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for p in products:
        cls_row = "ok" if p["universality"] == "Y" else "red"
        rows.append(
            f'<tr class="{cls_row}">'
            f'<td>{_esc(p["slug"])}</td>'
            f'<td>{_esc(p["product_class"])}</td>'
            f'<td class="num">{p["structural_validity_score"]:.1f}</td>'
            f'<td class="num">{p["data_quality_score"]:.1f}</td>'
            f'<td class="num">{p["universality"]}</td>'
            f'<td class="num">{p["counts"]["leaves"]}</td>'
            f'<td class="num">{p["metrics"]["wrong_domain_score_pct"]:.0f}</td>'
            f'<td class="num">{p["metrics"]["brief_coverage_pct"]:.0f}</td>'
            f'</tr>'
        )
    return (
        '<table class="summary">'
        '<thead><tr>'
        '<th>Slug</th><th>Class</th><th>Structural Validity</th>'
        '<th>Data Quality</th><th>Universal?</th><th>Leaves</th>'
        '<th>Wrong-domain</th><th>Brief coverage</th>'
        '</tr></thead><tbody>'
        + "".join(rows)
        + "</tbody></table>"
    )


CSS = """
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       background: #f7f7fa; color: #1f2330; margin: 0; padding: 24px; }
h1 { margin: 0 0 4px 0; }
h2 { margin: 0; font-size: 18px; }
h3 { margin: 18px 0 6px 0; font-size: 14px; color: #444; text-transform: uppercase; letter-spacing: 0.05em; }
h4 { margin: 14px 0 4px; font-size: 13px; }
.muted { color: #666; }
.small { font-size: 12px; }
.header { background: #fff; border: 1px solid #e2e3e8; border-radius: 8px;
          padding: 16px 20px; margin-bottom: 20px; }
.card { background: #fff; border: 1px solid #e2e3e8; border-radius: 8px;
        padding: 16px 20px; margin: 14px 0; border-left-width: 6px; }
.border-green { border-left-color: #1f9d4d; }
.border-red { border-left-color: #c0392b; }
.badges { margin: 6px 0 4px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px;
         background: #eef0f5; margin-right: 6px; font-size: 12px; }
.badge.good { background: #d1f0db; color: #145a32; }
.badge.bad  { background: #f7d3cf; color: #7b241c; }
.counts { margin: 6px 0 8px; font-size: 13px; }
.counts span { display: inline-block; margin-right: 14px; color: #333; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
table.metrics th, table.metrics td { padding: 5px 8px; border-bottom: 1px solid #f0f0f3; }
table.summary th, table.summary td { padding: 6px 8px; border-bottom: 1px solid #e8e8ee; }
table.summary thead th { background: #eef0f5; text-align: left; }
table .num { text-align: right; font-variant-numeric: tabular-nums; }
table .thr { color: #888; font-size: 12px; }
tr.ok td { background: #fbfffb; }
tr.red td { background: #fff5f4; color: #7b241c; }
tr.orange td { background: #fff9ed; color: #7a5a14; }
tr.red td.thr, tr.orange td.thr { color: inherit; }
ul.dist { list-style: none; padding-left: 0; margin: 4px 0; font-size: 13px; }
ul.dist li { display: inline-block; margin-right: 12px; }
details { margin-top: 12px; }
details summary { cursor: pointer; font-weight: 600; color: #555; }
.ev-block { margin: 10px 0; padding: 8px 12px; border-radius: 6px; background: #fafbff;
            border: 1px solid #ececf2; font-size: 12.5px; }
.ev-block.red    { background: #fff5f4; border-color: #f1c3bd; color: #7b241c; }
.ev-block.orange { background: #fff8ec; border-color: #ecd9aa; color: #6e4d10; }
.ev-block ul { margin: 6px 0 0 18px; padding: 0; }
.ev-block .crit { font-weight: 700; }
code { background: #eef0f5; padding: 0 4px; border-radius: 3px; font-size: 12px; }
"""


def render_html(batch_id: str, products: list[dict[str, Any]]) -> str:
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pass_n = sum(1 for p in products if p["universality"] == "Y")
    fail_n = len(products) - pass_n
    cards = "\n".join(render_card(p) for p in products)
    summary = render_summary_table(products)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Engine Accuracy Scorecard &mdash; {_esc(batch_id)}</title>
<style>{CSS}</style>
</head>
<body>
<div class="header">
  <h1>Engine Accuracy Scorecard</h1>
  <div class="muted">Batch: <code>{_esc(batch_id)}</code> &middot; Generated: {_esc(ts)} &middot; Products scored: {len(products)}</div>
  <div class="muted">Universality &mdash; Pass (Y): <b style="color:#145a32">{pass_n}</b> &middot; Fail (N): <b style="color:#7b241c">{fail_n}</b></div>
  <p class="small muted">Universality flag = Structural Validity &ge; 80% AND no critical wrong-domain archetypes AND brief-coverage &ge; 50%.</p>
  {summary}
</div>
{cards}
</body>
</html>
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Engine Accuracy Scorecard")
    parser.add_argument("--batch-dir", required=True, help="Path to radical-shadow-* batch dir")
    parser.add_argument("--output", required=True, help="HTML output path")
    parser.add_argument("--open", action="store_true", help="Open the HTML in default browser when done")
    args = parser.parse_args(argv)

    batch_dir = Path(os.path.expanduser(args.batch_dir)).resolve()
    out_path = Path(os.path.expanduser(args.output)).resolve()

    if not batch_dir.is_dir():
        sys.stderr.write(f"ERROR: batch dir not found: {batch_dir}\n")
        return 2

    products_meta = discover_products(batch_dir)
    if not products_meta:
        sys.stderr.write(f"ERROR: no rs-* subdirectories with state.json found in {batch_dir}\n")
        return 3

    scored: list[dict[str, Any]] = []
    for slug, manifest_path, state_path in products_meta:
        manifest_raw = _safe_load_json(manifest_path)
        state_raw = _safe_load_json(state_path)
        if manifest_raw is None or state_raw is None:
            sys.stderr.write(
                f"WARN: skipping {slug} — could not parse manifest or state JSON\n"
            )
            continue
        if not isinstance(manifest_raw, dict) or not isinstance(state_raw, dict):
            sys.stderr.write(
                f"WARN: skipping {slug} — manifest or state is not a JSON object\n"
            )
            continue
        brief_text = load_brief_text(manifest_raw.get("brief"))
        scored.append(score_product(slug, manifest_raw, state_raw, brief_text))

    # Sort by structural validity score descending for visual scan.
    scored.sort(key=lambda p: -p["structural_validity_score"])

    html_doc = render_html(batch_dir.name, scored)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_doc, encoding="utf-8")
    sys.stdout.write(f"Wrote scorecard: {out_path}\n")

    if args.open:
        try:
            import webbrowser
            webbrowser.open(out_path.as_uri())
        except Exception as exc:
            sys.stderr.write(f"WARN: could not open browser: {exc}\n")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
