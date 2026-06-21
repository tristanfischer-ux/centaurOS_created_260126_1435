#!/usr/bin/env python3
"""
canonical_tags.py — ONE numbered tag per synthesised auxiliary, shared by EVERY
consumer of the design state (the requirements bill-of-materials AND the drawing
schedules), so a part carries a single identity everywhere.

WHY THIS EXISTS
The bill-of-materials (scripts/requirements_bom.py) and the instrument / valve
index (scripts/blender-universal/draw_process_schedules.py) used to number the
synthesised auxiliary instruments / actuators / utilities INDEPENDENTLY: the
bill-of-materials emitted a BARE ISA letter ("LT") while the instrument index
numbered the same physical transmitter "LT-201". They disagreed. This module is
the SINGLE SOURCE for those auxiliary tags — both files import it and read the
same string, so "LT-201–205" in the bill-of-materials is exactly LT-201 … LT-205
in the instrument index.

KEYED BY CHARACTER-ID (cid), DELIBERATELY
The character-id (`word["content_character"]["character_id"]`) is the ONLY stable
identity present in every state-walking context: the bill-of-materials loop reads
`word["id"]` / `name_human`, the schedule walker reads the cid — but BOTH can read
the cid. Keying the map by cid lets every consumer look a word up the same way.
The returned value is the PER-INSTANCE tag list (length == quantity): a quantity-N
word expands into N consecutive tags, e.g. a 5-off Level Transmitter →
["LT-201","LT-202","LT-203","LT-204","LT-205"]. The instrument index pulls the
Nth element for its Nth physical instance; the bill-of-materials renders the list
as a range ("LT-201–205") because it emits ONE row for the quantity-N word.

SCOPE
Only synthesised AUXILIARIES are covered — words flagged `_instrument`,
`_actuator` or `_utility`. Equipment words keep their parts-manifest
`equipment_tag` (TK-102 / V-101 / P-102), which the bill-of-materials and the
drawings already agree on; those are explicitly OUT OF SCOPE here.

UNIVERSAL
No class-specific hard-coding: the prefix rules are the SAME name-substring rules
the bill-of-materials already applies (replicated from requirements_bom.py, the
instrument branch ~line 2360, the actuator branch ~line 2394, the utility branch
~line 2412), the walk is in DOCUMENT ORDER (identical to the index walker), and
each prefix counter is seeded at 200 to match the index's 200-loop range. Works
for any product class whose synthesis flags auxiliaries this way.
"""
from __future__ import annotations
import json
import os
import re
import sys


# ── prefix counter seed ──────────────────────────────────────────────────────
# Each ISA-prefix counter starts here and pre-increments, so the first instance
# of a prefix is 201 — the SAME 200-loop range the instrument index + line
# numbers use (draw_process_schedules.py: tag_seq.get(isa, 200) + 1).
_TAG_SEED = 200


def _iter_words(state: dict):
    """Yield (word, name_human, character_id) for every bill-of-materials word, in
    DOCUMENT ORDER — the SAME modules → sub_modules → words walk the instrument
    index uses (draw_process_schedules.py::_iter_words). Document order is what
    keeps the per-prefix counters (201, 202, …) identical across both consumers."""
    md = state.get("moduleDecomposition") or {}
    for m in (md.get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                cc = w.get("content_character")
                cid = cc.get("character_id", "") if isinstance(cc, dict) else ""
                yield w, (w.get("name_human") or ""), (cid or "")


def _qty(w: dict) -> int:
    """Quantity of a word from its `quantity` modifier — parse the integer out of
    '×4' / 'x16' / '×25' → 4 / 16 / 25; default 1. Mirrors the quantity read used
    by both the bill-of-materials and the index."""
    for mc in (w.get("modifier_characters") or []):
        if mc.get("kind") == "quantity":
            m = re.search(r"(\d+)", str(mc.get("value") or ""))
            return int(m.group(1)) if m else 1
    return 1


def _instrument_prefix(name: str) -> str:
    """ISA instrument letter from the part name — EXACT replica of the
    bill-of-materials instrument branch (requirements_bom.py ~line 2360):
    level→LT, temperature→TT, pressure→PT, flow→FT, else AT (analysers)."""
    nlow = name.lower()
    return ("LT" if "level" in nlow else "TT" if "temperature" in nlow
            else "PT" if "pressure" in nlow else "FT" if "flow" in nlow
            else "AT")


def _actuator_prefix(name: str) -> str:
    """Final-control-element letter — EXACT replica of the bill-of-materials
    actuator branch (requirements_bom.py ~line 2394):
    valve→FCV, blower→B, fan→FE, else Y."""
    nlow = name.lower()
    return ("FCV" if "valve" in nlow else "B" if "blower" in nlow
            else "FE" if "fan" in nlow else "Y")


def _utility_prefix(name: str) -> str:
    """Balance-of-plant utility letter — EXACT replica of the bill-of-materials
    utility branch (requirements_bom.py ~line 2412):
    generator→G, make-up→P, bleed/drain→DV, ventilation→AHU, else U."""
    nlow = name.lower()
    return ("G" if "generator" in nlow else "P" if ("make-up" in nlow or "make up" in nlow)
            else "DV" if ("bleed" in nlow or "drain" in nlow)
            else "AHU" if "ventil" in nlow else "U")


def _prefix_for(word: dict, name: str) -> str | None:
    """The canonical ISA prefix for a synthesised auxiliary word, or None if the
    word is not a synthesised auxiliary (equipment / process words are skipped —
    they keep their parts-manifest equipment_tag)."""
    if word.get("_instrument"):
        return _instrument_prefix(name)
    if word.get("_actuator"):
        return _actuator_prefix(name)
    if word.get("_utility"):
        return _utility_prefix(name)
    return None


def build_tag_map(state: dict) -> dict:
    """Build the canonical {cid: [tag, …]} map for every synthesised auxiliary in
    `state`, in document order, with a per-prefix counter seeded at 200 (so the
    first instance is 201). A quantity-N word expands to N consecutive tags. The
    list length equals the word's quantity, so the Nth physical instance reads
    map[cid][N-1] and the bill-of-materials renders the whole list as a range.

    Equipment / process words are skipped — they keep their parts-manifest
    equipment_tag and are out of scope. If two words somehow share a cid (they
    should not for synthesised auxiliaries), the first one in document order wins
    so the mapping stays deterministic.
    """
    counters: dict[str, int] = {}
    tag_map: dict[str, list[str]] = {}
    for w, name, cid in _iter_words(state):
        prefix = _prefix_for(w, name)
        if prefix is None:
            continue
        if not cid:
            # No identity to key on — skip rather than collide. Synthesised
            # auxiliaries always carry a cid (instr_/actr_/util_…), so this is a
            # defensive guard, not an expected path.
            continue
        if cid in tag_map:
            # Stable first-write-wins; do not re-number an already-tagged cid.
            continue
        n = _qty(w)
        if n < 1:
            n = 1
        tags: list[str] = []
        for _ in range(n):
            counters[prefix] = counters.get(prefix, _TAG_SEED) + 1
            tags.append(f"{prefix}-{counters[prefix]}")
        tag_map[cid] = tags
    return tag_map


def _norm_name(s) -> str:
    """Normalise a human part name for a NAME-keyed lookup: NFKC-fold (so the
    subscript 'O₂' folds to 'O2'), lowercase, collapse whitespace, trim. The SAME
    fold the parts-manifest consumer applies, so 'Dissolved-O₂ Control Valve' joins
    whether it arrives with a subscript or not."""
    import unicodedata
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(s or "")).strip().lower())


def build_name_tag_map(state: dict) -> dict:
    """{normalised_name: [tag, …]} for every synthesised auxiliary — the per-instance
    tag list keyed by the human NAME instead of the cid. This lets a consumer that
    carries only the part NAME (the parts-manifest — its Part objects have no cid) adopt
    the SAME canonical tag the bill-of-materials + instrument index use, so the GA / P&ID
    drawings stop minting their own shape-class tags (K-103) for a part the BoM calls
    B-201. When two auxiliary words share a name (e.g. a Dissolved-O₂ Control Valve on the
    rearing tanks AND one on the biofilter), their instance tags are CONCATENATED in
    document order, so the manifest's Nth drawn instance of that name reads the Nth tag."""
    tm = build_tag_map(state)
    out: dict[str, list[str]] = {}
    for _w, name, cid in _iter_words(state):
        tags = tm.get(cid)
        if not tags or not name:
            continue
        key = _norm_name(name)
        if not key:
            continue
        out.setdefault(key, []).extend(tags)
    return out


def format_range(tags: list[str]) -> str:
    """Render a per-instance tag list as a compact label for a single
    bill-of-materials row: a 1-tag list → the tag itself ("LT-201"); a multi-tag
    list → first–last with an en-dash ("LT-201–205"). Assumes the list is the
    consecutive run produced by build_tag_map (it always is)."""
    if not tags:
        return ""
    if len(tags) == 1:
        return tags[0]
    first = tags[0]
    last_num = tags[-1].rsplit("-", 1)[-1]
    return f"{first}–{last_num}"   # en-dash between first tag and last number


if __name__ == "__main__":
    # Standalone smoke test — load the RAS run state and print the map so the
    # mapping can be eyeballed without running the chain.
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(os.path.dirname(here))   # …/scripts/blender-universal → repo root
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(repo, "out/ras-5m-v27/state.json")
    st = json.load(open(path))
    tm = build_tag_map(st)
    print(f"canonical tag map · {path}")
    print(f"{len(tm)} synthesised-auxiliary cids tagged\n")
    # echo with the human name for legibility
    name_by_cid = {cid: name for _w, name, cid in _iter_words(st)}
    for cid, tags in tm.items():
        rng = format_range(tags)
        print(f"  {rng:14s} ({len(tags):>2d})  {cid:48s}  {name_by_cid.get(cid, '')}")
