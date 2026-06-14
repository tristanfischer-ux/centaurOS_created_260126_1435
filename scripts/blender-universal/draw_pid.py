#!/usr/bin/env python3
"""draw_pid.py — UNIVERSAL Piping & Instrumentation Diagram (P&ID) generator.

The PROCESS-side companion to draw_single_line.py (the single-line electrical diagram).
Same contract: it does NOT recompute anything and it does NOT touch
build_universal_scene.py — it CONSUMES that generator's outputs + the archetype state and
PROJECTS the modelled PROCESS into a standard P&ID, the real engineering deliverable a
process engineer expects.

INPUTS (read-only):
  <state.json>                       — the archetype state.  Two things are read:
        (1) engineeringContract.topology (or orchestratorContract.topology) — the PROCESS
            FLOW GRAPH: each edge = from_part → to_part + mechanism (fluid_loop / thermal /
            electrical_bus) + material_context (the SERVICE description) + constraint_kind
            + required_value/required_unit (the carried duty).  This is the SPINE of the
            P&ID — the feed→reaction→separation→product train.
        (2) moduleDecomposition — the equipment BoM words (vessels / columns / reactors /
            separators / drums / tanks / pumps / compressors / heat exchangers) used to
            (a) pick the correct P&ID SYMBOL per topology node, (b) discover which
            INSTRUMENT types (level / pressure / temp / flow transmitters) and VALVES
            (relief / control / ESD) the design actually carries, so ISA bubbles + valve
            symbols are drawn only where the state supports them.
  <out>/connection-schedule.json     — OPTIONAL enrichment (from build_universal_scene):
        the sized pipe runs (from / to / size = DN / drop / qty / phase).  When present,
        each process LINE is labelled with the AS-MODELLED DN + velocity/ΔP.  When absent,
        the P&ID still draws (DN inferred from the material_context / a flow-rate fallback)
        — the topology alone is enough to render a real P&ID.

PIPELINE:
  1. reconstruct_process()  — build the equipment list (one Node per topology endpoint,
       resolved to its richest BoM word for the right symbol + tag), the line list (one
       Line per process/thermal edge, with a generated LINE NUMBER + DN + service + flow
       direction), and attach instruments + valves per equipment.  Repeated feed
       compressors etc. are kept distinct (a P&ID shows every major item).  Process-flow
       order is a topological sort of the non-electrical edges (feed → reactor →
       separation → product), with un-sequenced items appended.
  2. build_pid_svg()        — draw a STANDARD P&ID (deterministic, light-mode SVG): the
       equipment laid out LEFT→RIGHT in flow order with proper P&ID symbols (column/reactor
       = tall vessel, separator/drum = horizontal drum, tank, pump, compressor, heat
       exchanger), the process lines connecting them with arrows + line tags, ISA
       instrument bubbles on equipment/lines, valve symbols, a symbol LEGEND and a
       standard TITLE BLOCK.  NOT a node-graph dump.
  3. rasterise()            — SVG → PNG (cairosvg → rsvg-convert → headless Chrome cascade).

OUTPUTS:
  <out>/drawings/pid.svg
  <out>/drawings/pid.png

Run:
  python3 scripts/blender-universal/draw_pid.py /tmp/bl-univ-efuel-sized out/oxccu-saf-v21/state.json
  python3 scripts/blender-universal/draw_pid.py /tmp/pid-co2 out/co2-caspar-fix3/state.json

Pure Python stdlib + (optional) a rasteriser on PATH.  No Blender import.
"""
from __future__ import annotations

import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — the reconstructed process
# ═══════════════════════════════════════════════════════════════════════════

# Equipment symbol kinds an P&ID node can take (drives which standard glyph is drawn).
SYM_COLUMN = "column"            # tall vessel WITH internals (column / reactor / absorber
                                  # / stripper / fractionator) — tall capsule + tray ticks
SYM_VESSEL = "vessel"            # tall vessel, no internals (buffer / guard bed / dryer)
SYM_DRUM = "drum"                # horizontal drum / separator / knock-out / flash
SYM_TANK = "tank"                # flat-bottom storage tank
SYM_PUMP = "pump"                # centrifugal pump (circle + delivery triangle)
SYM_COMPRESSOR = "compressor"    # compressor / blower / fan (ISA trapezoid)
SYM_HX = "hx"                    # heat exchanger (circle + internal bar) — cooler /
                                  # condenser / reboiler / pre-heater / cross-exchanger
SYM_FIRED = "fired"              # fired / steam generator / boiler / oxidiser / heater
SYM_OFFPAGE = "offpage"          # off-page / line connector (pentagon) — a pure line /
                                  # supply / header pseudo-node, not a discrete vessel
SYM_GENERIC = "generic"          # fallback rounded box (a real but unclassified node)

# Instrument kinds (ISA bubbles).
INSTR_LEVEL = ("LT", "level")
INSTR_PRESSURE = ("PT", "pressure")
INSTR_TEMP = ("TT", "temperature")
INSTR_FLOW = ("FT", "flow")
INSTR_ANALYSE = ("AT", "analyser")
INSTR_PH = ("AT", "pH")

# Line (pipe) style kinds.
LINE_PROCESS = "process"         # main process fluid (heavy solid)
LINE_THERMAL = "thermal"         # heating / cooling / steam (dashed, warm tint)
LINE_UTILITY = "utility"         # utility / minor (dashed grey)


@dataclass
class Instr:
    """An ISA instrument bubble placed ON a piece of equipment or a line."""
    tag: str                     # 'LT' / 'PT' / 'TT' / 'FT' / 'AT'
    func: str                    # 'level' / 'pressure' / 'temperature' / 'flow'
    loop: str = ""               # loop number, e.g. '201'
    where: str = "equipment"     # 'equipment' | 'line'


@dataclass
class Valve:
    """A valve symbol drawn in-line on a process line (or on an equipment nozzle)."""
    kind: str                    # 'control' | 'relief' | 'esd' | 'manual'
    tag: str = ""                # e.g. 'PCV', 'PSV', 'XV'


@dataclass
class TieIn:
    """A per-unit utility/service nozzle stub on an equipment item (drain, vent, O2 feed,
    inert purge …) enumerated by the interconnect census. Drawn as a short stub to a shared
    service header so the P&ID shows HOW each unit connects, not just the main process line."""
    role: str                    # 'drain' | 'vent/relief' | 'oxygen feed' | 'inert purge' …
    mechanism: str = "fluid_loop"  # fluid_loop | thermal | electrical_bus
    size: str = ""               # DN / mm² label
    n_per_unit: int = 1          # how many of this tie-in per single unit


@dataclass
class Node:
    """A piece of process equipment (one per resolved topology endpoint)."""
    key: str                     # the topology node key (character_id-ish)
    tag: str                     # equipment tag, e.g. 'R-201', 'V-101', 'P-301'
    label: str                   # human name (2-line wrapped at draw time)
    sym: str = SYM_GENERIC
    detail: str = ""             # a short duty / size note under the tag
    instruments: list[Instr] = field(default_factory=list)
    valves: list[Valve] = field(default_factory=list)
    column: int = 0              # process-flow column index (0 = feed end)
    # ARRAY EXPANSION (universal qty-N fix): when the topology collapses N identical
    # parallel units into ONE node (e.g. RAS `rearing_tanks` = 10 tanks), array_n carries
    # the real count from the parts-manifest (the GA's source) so the P&ID draws a BANK of
    # N symbols + a per-unit tie-in fan — the recurring "show all 10 tanks + how they
    # connect" request. array_tags carries the per-unit equipment tags (TK-101…TK-110).
    array_n: int = 1
    array_tags: list[str] = field(default_factory=list)
    tie_ins: list[TieIn] = field(default_factory=list)


@dataclass
class Line:
    """A process / thermal / utility line between two nodes."""
    from_key: str
    to_key: str
    number: str                  # generated line number, e.g. '12"-P-201-CO2'
    dn: str = ""                 # size, e.g. 'DN32'
    service: str = ""            # humanised material_context (the SERVICE)
    detail: str = ""             # velocity / ΔP / duty from the schedule
    style: str = LINE_PROCESS
    is_return: bool = False       # a recycle / return edge — routed over the top
    valves: list[Valve] = field(default_factory=list)
    instruments: list[Instr] = field(default_factory=list)


@dataclass
class Process:
    archetype: str
    nodes: list[Node]
    lines: list[Line]
    power_note: str = ""         # the electrical_bus edge, summarised as a note
    notes: list[str] = field(default_factory=list)
    schedule_present: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# INPUT LOADING
# ═══════════════════════════════════════════════════════════════════════════

def load_inputs(out_dir: str, state_path: Optional[str]):
    """Read the archetype state.json (required) + connection-schedule.json (optional).

    state.json is taken from state_path if given, else auto-discovered next to the
    schedule.  The schedule is optional — the P&ID's spine is the topology in the state."""
    state = {}
    candidates = []
    if state_path:
        candidates.append(Path(state_path))
    candidates.append(Path(out_dir) / "state.json")
    for c in candidates:
        if c and c.is_file():
            with open(c) as fh:
                state = json.load(fh)
            break
    if not state:
        raise FileNotFoundError(
            f"no state.json found (looked at {state_path or '—'} and "
            f"{Path(out_dir) / 'state.json'}); pass the archetype state.json path")

    schedule = {}
    sched_path = Path(out_dir) / "connection-schedule.json"
    if sched_path.is_file():
        with open(sched_path) as fh:
            schedule = json.load(fh)
    return schedule, state


# ═══════════════════════════════════════════════════════════════════════════
# ARRAY EXPANSION — read the qty-N reality the topology collapses
# ═══════════════════════════════════════════════════════════════════════════
# The topology spine collapses N identical parallel units into ONE node (RAS
# `rearing_tanks` = 10 tanks). The GENERAL ARRANGEMENT already shows all N because it
# reads the qty-EXPANDED parts-manifest.json (one row per physical unit). The P&ID /
# BFD / SLD read only the collapsed spine — so they showed ONE tank. These helpers
# read the SAME parts-manifest the GA uses + the interconnect census, so the system
# drawings can expand the array + draw its per-unit tie-ins. Universal: keyed purely
# on the manifest's repeated equipment names + the census shapes (no per-class table).

def _load_parts_manifest(out_dir: str) -> dict:
    p = Path(out_dir) / "parts-manifest.json"
    if p.is_file():
        try:
            return json.load(open(p))
        except Exception:
            return {}
    return {}


def _load_interconnect_census(out_dir: str) -> dict:
    p = Path(out_dir) / "interconnect-census.json"
    if p.is_file():
        try:
            return json.load(open(p))
        except Exception:
            return {}
    return {}


def _name_tokens(s: str) -> set:
    return {t for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if len(t) > 2}


def _array_groups_from_manifest(manifest: dict) -> list[dict]:
    """Group the parts-manifest into ARRAYS of identical units. A group = ≥2 manifest
    rows that share the SAME equipment NAME (e.g. 10 rows 'Rearing Tank') OR the same
    equipment-tag LETTER family + name. Returns [{name, shape, module, n, tags,
    name_tokens}]. Universal — any class's parallel units (tanks, reactors, racks)."""
    rows = manifest.get("parts") or []
    by_name: dict[str, list] = {}
    for r in rows:
        nm = (r.get("name") or "").strip()
        if not nm:
            continue
        by_name.setdefault(nm.lower(), []).append(r)
    groups = []
    for _k, rs in by_name.items():
        if len(rs) < 2:
            continue
        tags = sorted((r.get("equipment_tag") or "") for r in rs)
        groups.append({
            "name": rs[0].get("name") or "",
            "shape": rs[0].get("shape") or "",
            "module": rs[0].get("module") or "",
            "n": len(rs),
            "tags": [t for t in tags if t],
            "name_tokens": _name_tokens(rs[0].get("name") or ""),
        })
    return groups


def _match_array_group(node_key: str, node_label: str, groups: list[dict]):
    """Find the manifest array group a collapsed topology node maps onto, by token
    overlap between the node (key + resolved label) and the group's unit name. Returns
    the group dict or None. 'rearing_tanks' / 'Rearing Tank' → the 10-tank group."""
    ntoks = _name_tokens(node_key) | _name_tokens(node_label)
    # singularise trailing-s tokens so 'tanks' matches 'tank'
    ntoks |= {t[:-1] for t in list(ntoks) if t.endswith("s") and len(t) > 3}
    best, best_score = None, 0
    for g in groups:
        gtoks = set(g["name_tokens"])
        gtoks |= {t[:-1] for t in list(gtoks) if t.endswith("s") and len(t) > 3}
        score = len(ntoks & gtoks)
        if score > best_score:
            best_score, best = score, g
    return best if best_score >= 1 else None


# Census role → a short P&ID service label + the header it ties into. Universal shapes
# (the census enumerates these per physical unit, keyed on equipment SHAPE).
_TIEIN_LABEL = {
    "drain": "drain", "vent/relief": "vent", "inert purge": "O2/purge",
    "signal": "signal", "power feed": "power", "instrument air": "air",
    "CW supply": "CW", "CW return": "CWR",
}


def _tieins_for_array(group: dict, census: dict) -> list[TieIn]:
    """The per-UNIT tie-ins the interconnect census enumerated for this array's unit name
    (each physical unit gets a drain + vent + inert/O2 purge etc.). Collapsed to one TieIn
    per role with its per-unit count, so the bank draws a clean nozzle fan rather than 10×
    the same stub. Universal — reads the census rows whose to_part is this array's name."""
    if not group or not census:
        return []
    gtoks = set(group["name_tokens"])
    gtoks |= {t[:-1] for t in list(gtoks) if t.endswith("s") and len(t) > 3}
    by_role: dict[str, dict] = {}
    for r in (census.get("rows") or []):
        to = r.get("to_part") or ""
        rtoks = _name_tokens(to)
        rtoks |= {t[:-1] for t in list(rtoks) if t.endswith("s") and len(t) > 3}
        if not (gtoks & rtoks):
            continue
        role = r.get("role") or ""
        if role in ("cable tray/ladder", "pipe supports"):
            continue
        slot = by_role.setdefault(role, {"role": role, "mechanism": r.get("mechanism")
                                         or "fluid_loop", "size": r.get("size") or "",
                                         "n": 0})
        slot["n"] += 1
    out = []
    for role, s in by_role.items():
        out.append(TieIn(role=role, mechanism=s["mechanism"], size=s["size"],
                         n_per_unit=max(1, round(s["n"] / max(1, group["n"])))))
    # stable, readable order: process drains/vents first, then services, then electrical
    order = {"drain": 0, "vent/relief": 1, "inert purge": 2, "CW supply": 3,
             "CW return": 4, "instrument air": 5, "power feed": 6, "signal": 7}
    out.sort(key=lambda t: order.get(t.role, 9))
    return out


# ═══════════════════════════════════════════════════════════════════════════
# STATE / TOPOLOGY EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════

def _topology(state: dict):
    """The process flow graph: prefer engineeringContract.topology, else orchestrator."""
    for ck in ("engineeringContract", "orchestratorContract"):
        topo = (state.get(ck) or {}).get("topology")
        if isinstance(topo, list) and topo:
            return topo
    return []


def _iter_words(state: dict):
    md = state.get("moduleDecomposition") or {}
    for m in (md.get("modules") or []):
        mid = m.get("module_id", "") or ""
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                cid = ""
                cc = w.get("content_character")
                if isinstance(cc, dict):
                    cid = cc.get("character_id", "") or ""
                yield w, (w.get("name_human") or ""), cid, mid


def _equipment_index(state: dict):
    """Map character_id → (name_human, blob) for every BoM word, used to resolve a
    topology node to its richest equipment word (for the symbol + a nicer label)."""
    idx = {}
    for w, name, cid, _mid in _iter_words(state):
        if cid:
            idx.setdefault(cid, name or cid)
    return idx


def _archetype_name(state: dict):
    for ck in ("parsedBrief", "engineeringContract", "orchestratorContract"):
        c = state.get(ck) or {}
        pc = c.get("product_class") or c.get("productClass")
        if pc:
            return str(pc)
    pid = state.get("projectId") or ""
    return str(pid) or "process_plant"


# ═══════════════════════════════════════════════════════════════════════════
# SYMBOL CLASSIFICATION  (node key + resolved name → P&ID symbol + tag letter)
# ═══════════════════════════════════════════════════════════════════════════

# Order MATTERS — the first pattern that matches wins.  Each entry:
#   (regex on "key name", symbol, ISA equipment-letter for the tag).
_SYM_PATTERNS = [
    # fired / combustion / steam-raising shells first (these often also contain
    # 'heater'/'boiler' words that would otherwise class as HX).
    (re.compile(r"oxidis|oxidiz|flare|incinerat|furnace|fired_heater|"
                r"steam_generator|\bboiler\b|reformer", re.I), SYM_FIRED, "H"),
    # reboilers / condensers FIRST — these are HEAT EXCHANGERS even though their name
    # carries a column token (column_reboiler, fractionation_overhead_condenser,
    # reboiler_steam_supply); without this they'd misclassify as a column below.
    (re.compile(r"reboiler|condenser|overhead_cond|reflux_cond", re.I), SYM_HX, "E"),
    # separators / drums / knock-out / flash — horizontal vessels.
    (re.compile(r"separator|knock.?out|\bko_drum\b|\bdrum\b|flash|coalesc|"
                r"demister|decanter|three_phase|2phase|3phase", re.I), SYM_DRUM, "V"),
    # columns / reactors / absorbers / strippers / fractionators — tall + internals.
    (re.compile(r"column|reactor|absorber|stripper|fractionat|distillat|"
                r"contactor_column|scrubber|crystallis|crystalliz|carbonation|"
                r"hydrocrack|hydrotreat|isomeris|isomeriz|guard_bed|adsorber", re.I),
     SYM_COLUMN, "R"),
    # pumps.
    (re.compile(r"\bpump\b|metering_pump|dosing(?!.*tank)|circulat.*pump", re.I),
     SYM_PUMP, "P"),
    # compressors / blowers / fans / VFD-driven gas movers.
    (re.compile(r"compressor|blower|\bfan\b|booster", re.I), SYM_COMPRESSOR, "K"),
    # heat exchangers (cooler / condenser / reboiler / pre-heater / cross-exchanger).
    (re.compile(r"exchanger|\bhx\b|cooler|condenser|reboiler|pre.?heat|"
                r"preheater|chiller|economiser|economizer|interchanger|"
                r"cross_exchanger|heater", re.I), SYM_HX, "E"),
    # storage tanks (flat-bottom).
    (re.compile(r"\btank\b|storage|reservoir|\bsump\b|gantry|loading", re.I),
     SYM_TANK, "T"),
    # generic vessels (buffer / dryer / drier / filter / guard / surge).
    (re.compile(r"vessel|buffer|dryer|drier|filter|surge|receiver|"
                r"accumulator|hopper|silo|dosing", re.I), SYM_VESSEL, "V"),
]

# A PURE-LINE pseudo-node: a header / supply / purge / vent that is a LINE, not a discrete
# vessel.  These render as an off-page line connector (pentagon), the standard P&ID symbol
# for a stream that taps in / continues off-drawing — NOT as an equipment box.  Note this
# is checked AFTER the equipment patterns + only when the resolved NAME still looks like
# the pseudo key (so 'saf_and_naphtha_storage', which resolves to a real tank word, stays
# a tank).
_LINE_PSEUDO = re.compile(
    r"(^|_)(purge|vent|flare|blowdown|relief_header|supply|header)(_line)?$|"
    r"_line$|^electrical_supply$", re.I)

# Pure-STREAM pseudo keys: a header / overhead / bottoms / supply STREAM, not a discrete
# vessel.  These render as an off-page line connector when the node has no equipment word
# of its OWN.  STRONG suffixes (_overhead, _bottoms, _vapour, _offgas) are streams even if
# the key also names kit ('stripper_overhead' = the vapour OFF the stripper, a connector);
# WEAK suffixes (_supply, _makeup, _recycle) yield to a kit token in the key
# ('reboiler_steam_supply' = a reboiler, 'makeup_compressor' = a compressor).
_STREAM_PSEUDO_STRONG = re.compile(
    r"(_overhead|_bottoms|_vapou?r|_offgas|_off_gas)$", re.I)
_STREAM_PSEUDO_WEAK = re.compile(
    r"(_supply|_header|_makeup|_make_up|_recycle|_return|_tail_?gas)$", re.I)


def _classify(key: str, name: str, has_exact_word: bool = True):
    """Return (symbol, tag_letter) for an equipment node from its key + resolved name.
    has_exact_word=False means the node key had no equipment word of its own (it only
    fuzzy-resolved) — used to treat pure-stream pseudo keys as off-page connectors.

    Order: a pure-stream pseudo key with NO equipment word AND whose KEY itself names no
    equipment → off-page connector (so 'stripper_overhead' isn't drawn as a stripper); but
    a stream key whose KEY does name kit (reboiler_steam_supply, makeup_compressor) keeps
    its equipment symbol via the patterns below."""
    key_names_kit = any(rx.search(key) for rx, _s, _l in _SYM_PATTERNS)
    if not has_exact_word:
        # STRONG stream suffix always wins; WEAK only when the key names no kit.
        if _STREAM_PSEUDO_STRONG.search(key) or (
                _STREAM_PSEUDO_WEAK.search(key) and not key_names_kit):
            return SYM_OFFPAGE, "L"
    blob = f"{key} {name}"
    for rx, sym, letter in _SYM_PATTERNS:
        if rx.search(blob):
            return sym, letter
    # no equipment pattern matched — if the KEY is a pure-line pseudo-node (purge / vent /
    # supply / *_line header), draw it as an off-page line connector, not a vessel box.
    if _LINE_PSEUDO.search(key):
        return SYM_OFFPAGE, "L"
    return SYM_GENERIC, "X"


# ═══════════════════════════════════════════════════════════════════════════
# NODE RESOLUTION  (topology node key → richest equipment word + symbol)
# ═══════════════════════════════════════════════════════════════════════════

def _resolve_word(key: str, eq_idx: dict):
    """Resolve a topology node key to (display_name, symbol_hint_name).

    Strategy: exact character_id match → fuzzy first-token match (three_phase_separator →
    hot_separator) → composite-node split (saf_and_naphtha_storage → saf_storage_tank) →
    the humanised key itself.  Returns the best human name to label + classify by."""
    if key in eq_idx:
        return eq_idx[key]
    ktoks = [t for t in re.split(r"[_\s]+", key) if t]
    # fuzzy: share the leading token AND ≥1 more, prefer the most-overlapping word.
    best = None
    best_score = 0
    for cid, name in eq_idx.items():
        ctoks = [t for t in re.split(r"[_\s]+", cid) if t]
        overlap = len(set(ktoks) & set(ctoks))
        if overlap >= 1 and (ktoks[0] == ctoks[0] or overlap >= 2):
            if overlap > best_score:
                best_score = overlap
                best = name
    if best:
        return best
    return _humanise(key)


def _humanise(tag: str) -> str:
    """ft_synthesis_reactor → 'FT synthesis reactor'; co2_feed_compressor → 'CO2 feed
    compressor'.  Upper-cases well-known acronyms / formulae."""
    if not tag:
        return tag
    ACR = {"co2", "h2", "ft", "saf", "mv", "lv", "hv", "dc", "ac", "psv", "prv",
           "esd", "voc", "co", "n2", "o2", "caco3", "k2so4", "koh", "mea", "zno",
           "vfd", "vsd", "api", "hp", "lp", "ko", "i&c"}
    parts = re.split(r"[_\s]+", tag.strip())
    words = []
    for p in parts:
        if p.lower() in ACR:
            words.append(p.upper())
        else:
            words.append(p)
    s = " ".join(words)
    return s[:1].upper() + s[1:] if s else s


# ═══════════════════════════════════════════════════════════════════════════
# INSTRUMENT + VALVE discovery from the state BoM
# ═══════════════════════════════════════════════════════════════════════════

def _discover_instrument_types(state: dict):
    """Which ISA instrument FUNCTIONS does the design actually carry?  We don't have
    per-equipment tag plates, so we read the design's instrument WORDS and return the set
    of available functions; the placer then puts a bubble where each function
    conventionally belongs (level on vessels, pressure on reactors, etc.)."""
    funcs = set()
    blob_all = []
    for _w, name, cid, _mid in _iter_words(state):
        blob_all.append(f"{cid} {name}".lower())
    joined = " \n ".join(blob_all)
    if re.search(r"level_transmitter|radar_level|level_sensor|level_gauge|\blt\b|"
                 r"level_instrument|displacer_level", joined):
        funcs.add(INSTR_LEVEL)
    if re.search(r"pressure_transmitter|rosemount_pressure|pressure_sensor|"
                 r"pressure_gauge|\bpt\b|pressure_instrument", joined):
        funcs.add(INSTR_PRESSURE)
    if re.search(r"temperature_transmitter|thermowell|thermocouple|itherm|"
                 r"temp_transmitter|\btt\b|rtd|temperature_instrument", joined):
        funcs.add(INSTR_TEMP)
    if re.search(r"flow_transmitter|flow_meter|flowmeter|coriolis|mag_flow|"
                 r"electromagnetic_flow|orifice|\bft\b|flow_instrument", joined):
        funcs.add(INSTR_FLOW)
    if re.search(r"analyser|analyzer|gas_analys|co2_analys|\bat\b|composition", joined):
        funcs.add(INSTR_ANALYSE)
    if re.search(r"\bph\b|ph_probe|ph_sensor|liquiline", joined):
        funcs.add(INSTR_PH)
    return funcs


def _discover_valves(state: dict):
    """Return flags for which valve families the design carries (relief / control / esd /
    blanketing), used to decorate the matching equipment / lines."""
    has = {"relief": False, "control": False, "esd": False, "blanket": False}
    for _w, name, cid, _mid in _iter_words(state):
        b = f"{cid} {name}".lower()
        if re.search(r"relief_valve|\bpsv\b|\bprv\b|safety_valve|relief", b):
            has["relief"] = True
        if re.search(r"control_valve|\bcv\b|purge_control|modulat", b):
            has["control"] = True
        if re.search(r"esd_valve|emergency_shutdown|\bxv\b|shutoff|sdv", b):
            has["esd"] = True
        if re.search(r"blanket|n2_blanket|inert", b):
            has["blanket"] = True
    return has


# ═══════════════════════════════════════════════════════════════════════════
# DN / SERVICE / LINE-NUMBER helpers
# ═══════════════════════════════════════════════════════════════════════════

def _schedule_row(schedule: dict, frm: str, to: str):
    for r in (schedule.get("rows") or []):
        if r.get("from") == frm and r.get("to") == to:
            return r
    # try the spec list too (carries phase)
    return None


def _schedule_spec(schedule: dict, frm: str, to: str):
    for s in (schedule.get("specs") or []):
        if s.get("from_part") == frm and s.get("to_part") == to:
            return s
    return None


def _dn_from_context(mc: str) -> str:
    m = re.search(r"\b(DN\s?\d+)\b", mc or "", re.I)
    return m.group(1).replace(" ", "").upper() if m else ""


def _dn_from_flow(value, unit) -> str:
    """Crude DN fallback from a carried flow (kg/s) when neither schedule nor context has
    a DN — keeps a line LABELLED rather than blank.  Mass-flow → nominal bore band."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return ""
    u = (unit or "").lower()
    if "kg/s" not in u and "kg/h" not in u:
        return ""
    if "kg/h" in u:
        v = v / 3600.0
    # very rough gas-line banding (informational only; the schedule is authoritative).
    for lim, dn in ((0.02, "DN15"), (0.06, "DN25"), (0.12, "DN32"), (0.3, "DN50"),
                    (0.6, "DN80"), (1.2, "DN100")):
        if v <= lim:
            return dn
    return "DN150"


# Short service code from a material_context, for the line number.
def _service_code(key_from: str, key_to: str, mc: str) -> str:
    blob = f"{key_from} {key_to} {mc}".lower()
    table = [
        ("steam", "ST"), ("condensate", "CD"), ("cooling", "CW"), ("coolant", "CW"),
        ("h2", "H2"), ("hydrogen", "H2"), ("co2", "CO"), ("tail_gas", "TG"),
        ("tail gas", "TG"), ("recycle", "RC"), ("purge", "PG"), ("amine", "AM"),
        ("slurry", "SL"), ("naphtha", "NP"), ("saf", "PR"), ("syncrude", "SC"),
        ("flue", "FG"), ("vent", "VT"), ("water", "WT"),
    ]
    for needle, code in table:
        if needle in blob:
            return code
    return "PR"   # generic process


def _service_text(mc: str) -> str:
    """Turn a material_context like 'CO2_compressed_~1.5_to_25_bar_blended_with_H2...'
    into a short readable service phrase."""
    if not mc:
        return ""
    s = mc.replace("_", " ").strip()
    s = re.sub(r"\s+", " ", s)
    # keep it to the first clause (before a long blend description)
    s = s[:1].upper() + s[1:]
    return s


def _line_style(mechanism: str, phase: str) -> str:
    if mechanism == "thermal" or (phase or "").lower() in ("steam", "condensate"):
        return LINE_THERMAL
    if mechanism == "electrical_bus":
        return LINE_UTILITY
    return LINE_PROCESS


# ═══════════════════════════════════════════════════════════════════════════
# PROCESS-FLOW LAYERING  (longest-path depth on the non-electrical edges)
# ═══════════════════════════════════════════════════════════════════════════

def _flow_layers(nodes_keys, proc_edges):
    """Assign each node a LAYER (left→right process depth) = its longest path from any
    feed source along the FORWARD edges, the standard layered-DAG layout for a flow
    diagram.  Feeds (no incoming forward edge) sit at layer 0; each downstream item is one
    layer deeper than its deepest upstream feeder.  Recycle/return edges that would create
    a cycle (point back to an already-deeper or equal node) are treated as BACK-EDGES and
    excluded from the depth calc (they're drawn as return loops over the top).

    Returns (layer_of: {key:int}, back_edges: set[(a,b)]) — back_edges flags which
    topology edges route as recycle returns."""
    from collections import defaultdict
    succ = defaultdict(list)
    pred = defaultdict(list)
    nodeset = set(nodes_keys)
    seen = set()
    for a, b in proc_edges:
        if a == b or a not in nodeset or b not in nodeset or (a, b) in seen:
            continue
        seen.add((a, b))
        succ[a].append(b)
        pred[b].append(a)

    # Identify a DAG by removing back-edges via DFS (grey/black colouring).  Edges that
    # close a cycle (target currently on the DFS stack) are the recycle returns.
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {k: WHITE for k in nodes_keys}
    back_edges: set = set()
    forward_succ = defaultdict(list)

    def _dfs(u):
        colour[u] = GREY
        for v in succ.get(u, []):
            if colour[v] == GREY:                 # edge into the active stack ⇒ back-edge
                back_edges.add((u, v))
            else:
                forward_succ[u].append(v)
                if colour[v] == WHITE:
                    _dfs(v)
        colour[u] = BLACK

    # start DFS from feed sources first (true process inlets), then any remaining node.
    sources = [k for k in nodes_keys if not pred.get(k)]
    for s in sources + nodes_keys:
        if colour.get(s, BLACK) == WHITE:
            _dfs(s)

    # longest-path layer on the DAG (forward edges only), memoised.
    fpred = defaultdict(list)
    for u, vs in forward_succ.items():
        for v in vs:
            fpred[v].append(u)
    layer: dict = {}

    def _depth(u, _stack=None):
        if u in layer:
            return layer[u]
        _stack = _stack or set()
        if u in _stack:                            # safety against any residual cycle
            return 0
        _stack = _stack | {u}
        ps = fpred.get(u, [])
        d = 0 if not ps else 1 + max(_depth(p, _stack) for p in ps)
        layer[u] = d
        return d

    for k in nodes_keys:
        _depth(k)
    return layer, back_edges


# ═══════════════════════════════════════════════════════════════════════════
# RECONSTRUCTION
# ═══════════════════════════════════════════════════════════════════════════

def reconstruct_process(schedule: dict, state: dict,
                        out_dir: Optional[str] = None) -> Process:
    """Reconstruct the process for the P&ID/BFD/iso. When `out_dir` is given, also reads
    the qty-EXPANDED parts-manifest.json + interconnect-census.json (the same sources the
    GA uses) and ANNOTATES each node that the topology collapsed an N-unit array into, with
    its real count + per-unit tie-ins — so the P&ID can draw all N units + how they connect.
    out_dir is OPTIONAL + purely ADDITIVE: line numbers / tags / layering are unchanged
    when it is absent, so the isometric/process-schedule callers (which rely on identical
    line numbers) are unaffected."""
    arch = _archetype_name(state)
    topo = _topology(state)
    eq_idx = _equipment_index(state)
    instr_funcs = _discover_instrument_types(state)
    valve_has = _discover_valves(state)

    # ---- partition edges: process/thermal (drawn as pipes) vs electrical (a note) ----
    proc_topo = [e for e in topo if e.get("mechanism") != "electrical_bus"]
    elec_topo = [e for e in topo if e.get("mechanism") == "electrical_bus"]

    # ---- ordered, de-duplicated node keys, in first-appearance order ----
    node_keys = []
    seen = set()
    for e in proc_topo:
        for k in (e.get("from_part"), e.get("to_part")):
            if k and k not in seen:
                seen.add(k)
                node_keys.append(k)

    # ---- flow LAYERS (left→right process depth) + recycle back-edges ----
    proc_edges = [(e.get("from_part"), e.get("to_part")) for e in proc_topo]
    col_of, back_edges = _flow_layers(node_keys, proc_edges)
    # iterate nodes left→right (layer, then first-appearance) so tags read in flow order.
    ordered = sorted(node_keys, key=lambda k: (col_of.get(k, 0), node_keys.index(k)))

    # ---- build Node objects ----
    nodes: dict[str, Node] = {}
    tag_counters: dict[str, int] = {}

    def _next_tag(letter: str) -> str:
        # ISA-ish sequential tag: letter + a per-letter running number (left→right).
        tag_counters[letter] = tag_counters.get(letter, 100) + 1
        return f"{letter}-{tag_counters[letter]}"

    for k in ordered:
        name = _resolve_word(k, eq_idx)
        sym, letter = _classify(k, name, has_exact_word=(k in eq_idx))
        nd = Node(key=k, tag=_next_tag(letter),
                  label=name, sym=sym, column=col_of.get(k, 0))
        nodes[k] = nd

    # ---- ARRAY ANNOTATION (universal qty-N): a node the topology collapsed an N-unit
    #      array into (RAS 'rearing_tanks' → 10 tanks) gets its real count + per-unit
    #      tie-ins from the parts-manifest + interconnect census, so the P&ID draws ALL
    #      N units + their connections. Additive; no-op when out_dir/manifest is absent.
    if out_dir:
        manifest = _load_parts_manifest(out_dir)
        census = _load_interconnect_census(out_dir)
        groups = _array_groups_from_manifest(manifest)
        used_groups = set()
        if groups:
            for nd in nodes.values():
                g = _match_array_group(nd.key, nd.label, groups)
                if not g or g["n"] < 2 or id(g) in used_groups:
                    continue
                used_groups.add(id(g))
                nd.array_n = g["n"]
                nd.array_tags = g["tags"]
                # adopt the array's FIRST per-unit equipment tag as the node tag (TK-101…)
                if g["tags"]:
                    nd.tag = g["tags"][0]
                nd.tie_ins = _tieins_for_array(g, census)

    # ---- attach instruments per equipment by convention + available functions ----
    _attach_instruments(nodes, instr_funcs)
    # ---- attach equipment-mounted valves (relief on pressure vessels) ----
    if valve_has["relief"]:
        for nd in nodes.values():
            if nd.sym in (SYM_COLUMN, SYM_DRUM, SYM_VESSEL, SYM_FIRED):
                nd.valves.append(Valve(kind="relief", tag="PSV"))
                break   # one representative PSV symbol on the first pressure vessel
        # also a PSV on the main reactor/column explicitly if found
        for nd in nodes.values():
            if re.search(r"reactor|column", nd.key, re.I) and not any(
                    v.kind == "relief" for v in nd.valves):
                nd.valves.append(Valve(kind="relief", tag="PSV"))
                break

    # ---- build Line objects from the process edges ----
    lines: list[Line] = []
    loop_seq = 200
    for i, e in enumerate(proc_topo, start=1):
        frm, to = e.get("from_part"), e.get("to_part")
        mc = e.get("material_context") or ""
        spec = _schedule_spec(schedule, frm, to)
        row = _schedule_row(schedule, frm, to)
        phase = (spec or {}).get("phase") or ""
        # DN: schedule row size → schedule spec size_label → context → flow fallback.
        dn = ""
        detail = ""
        if row:
            dn = str(row.get("size") or "").strip()
            detail = str(row.get("drop") or "").strip()
        if not dn and spec:
            dn = str(spec.get("size_label") or "").strip()
        if not dn:
            dn = _dn_from_context(mc)
        if not dn:
            dn = _dn_from_flow(e.get("required_value"), e.get("required_unit"))
        svc_code = _service_code(frm, to, mc)
        number = f'{loop_seq + i}-{svc_code}' + (f'-{dn}' if dn else '')
        ln = Line(
            from_key=frm, to_key=to, number=number, dn=dn,
            service=_service_text(mc),
            detail=detail,
            style=_line_style(e.get("mechanism") or "", phase),
            is_return=((frm, to) in back_edges),
        )
        # a flow-transmitter on a FEED line if the design carries flow instruments
        if INSTR_FLOW in instr_funcs and re.search(r"feed|compressor|supply", frm, re.I):
            ln.instruments.append(Instr(tag="FT", func="flow",
                                        loop=str(loop_seq + i), where="line"))
        # control valve on a purge / control line
        if valve_has["control"] and re.search(r"purge|control|recycle|dos", f"{frm} {to}",
                                               re.I):
            ln.valves.append(Valve(kind="control", tag="PCV"))
        # ESD valve on a primary feed line
        if valve_has["esd"] and re.search(r"feed|supply", frm, re.I) and not any(
                v.kind == "esd" for L in lines for v in L.valves):
            ln.valves.append(Valve(kind="esd", tag="XV"))
        lines.append(ln)

    # ---- power note from the electrical edge ----
    power_note = ""
    if elec_topo:
        e = elec_topo[0]
        amps = e.get("required_value")
        try:
            amps_s = f"{float(amps):,.0f} A" if amps else ""
        except (TypeError, ValueError):
            amps_s = ""
        svc = _service_text(e.get("material_context") or "")
        power_note = (f"Electrical: {_humanise(e.get('from_part') or 'supply')} → "
                      f"{_humanise(e.get('to_part') or 'process loads')}"
                      + (f" ({amps_s})" if amps_s else "")
                      + " — see single-line diagram." )
        if svc:
            power_note = power_note  # service folded into the SLD; keep the P&ID note short

    notes = []
    if not schedule.get("rows"):
        notes.append("Line sizes inferred from process duties (connection schedule not "
                     "supplied); DN shown is indicative.")
    notes.append("Instrument bubbles + valves shown where the design schedule carries "
                 "them; loop numbers are auto-allocated placeholders.")

    return Process(archetype=arch, nodes=list(nodes.values()), lines=lines,
                   power_note=power_note, notes=notes,
                   schedule_present=bool(schedule.get("rows")))


def _attach_instruments(nodes: dict, instr_funcs: set):
    """Place ISA bubbles on equipment by convention, limited to functions the design has:
       level    → vessels / columns / separators / drums / tanks (anything that holds a
                  liquid level)
       pressure → reactors / columns / separators / drums (pressure-containing vessels)
       temp     → reactors / heat exchangers / fired heaters / columns
       analyse  → reactors / columns (composition control)
    """
    for nd in nodes.values():
        s = nd.sym
        if INSTR_LEVEL in instr_funcs and s in (SYM_COLUMN, SYM_DRUM, SYM_VESSEL,
                                                SYM_TANK):
            nd.instruments.append(Instr(*INSTR_LEVEL))
        if INSTR_PRESSURE in instr_funcs and s in (SYM_COLUMN, SYM_DRUM, SYM_VESSEL,
                                                   SYM_FIRED):
            nd.instruments.append(Instr(*INSTR_PRESSURE))
        if INSTR_TEMP in instr_funcs and s in (SYM_COLUMN, SYM_HX, SYM_FIRED):
            nd.instruments.append(Instr(*INSTR_TEMP))
        if INSTR_PH in instr_funcs and re.search(r"carbonation|crystallis|reactor|"
                                                 r"neutralis|amine", nd.key, re.I):
            nd.instruments.append(Instr(*INSTR_PH))
        elif INSTR_ANALYSE in instr_funcs and s == SYM_COLUMN and re.search(
                r"absorber|stripper|reactor|fractionat", nd.key, re.I):
            nd.instruments.append(Instr(*INSTR_ANALYSE))
    # cap to a sane number per node so a vessel isn't a pin-cushion
    for nd in nodes.values():
        nd.instruments = nd.instruments[:3]


# ═══════════════════════════════════════════════════════════════════════════
# SVG DRAWING — standard P&ID symbols + layout
# ═══════════════════════════════════════════════════════════════════════════

# Light-mode palette (engineering-drawing aesthetic, NO dark theme) — mirrors the SLD.
INK = "#1a1a1a"            # primary line / text
EQ_INK = "#10243e"         # equipment outline (deep navy)
PROC_INK = "#10243e"       # process pipe
THERMAL_INK = "#b5462a"    # thermal / steam pipe (warm)
UTIL_INK = "#7a8290"       # utility / minor pipe
ACCENT = "#1a5fb4"         # instrument bubble accent (blue)
FILL_BG = "#ffffff"        # page
PANEL_BG = "#f4f6f9"       # title-block / equipment fill
EQ_FILL = "#eef2f7"        # equipment body fill
GRID_FAINT = "#e4e8ee"     # faint guide
MUTED = "#5b6470"


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    """Tiny imperative SVG builder (deterministic) — same primitives as the SLD."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.6, dash=None, cap="round"):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" stroke-linecap="{cap}"{d}/>')

    def rect(self, x, y, w, h, stroke=INK, width=1.4, fill="none", rx=0):
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')

    def circle(self, cx, cy, r, stroke=INK, width=1.6, fill="none"):
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{width}"/>')

    def ellipse(self, cx, cy, rx, ry, stroke=INK, width=1.6, fill="none"):
        self.add(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')

    def path(self, d, stroke=INK, width=1.6, fill="none", join="round", cap="round"):
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
                 f'stroke-linejoin="{join}" stroke-linecap="{cap}"/>')

    def text(self, x, y, s, size=12, anchor="start", fill=INK, weight="normal",
             family="Helvetica, Arial, sans-serif", mono=False, spacing=None):
        fam = "'DejaVu Sans Mono', 'Menlo', monospace" if mono else family
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" '
                 f'font-size="{size}" text-anchor="{anchor}" fill="{fill}" '
                 f'font-weight="{weight}"{sp}>{_esc(s)}</text>')

    def render(self) -> str:
        # arrow marker for flow direction
        defs = (
            '<defs>'
            f'<marker id="flow" markerWidth="11" markerHeight="11" refX="8" refY="4" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L9,4 L0,8 Z" fill="{PROC_INK}"/></marker>'
            f'<marker id="flowT" markerWidth="11" markerHeight="11" refX="8" refY="4" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L9,4 L0,8 Z" fill="{THERMAL_INK}"/></marker>'
            '</defs>')
        body = "\n".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n{defs}\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


# ---- equipment symbol primitives ---------------------------------------------
# Each draws the symbol centred on (cx, cy) inside a box of width EQ_W and returns a dict
# of named connection ports {'in','out','top','bottom'} in absolute coords.

EQ_W = 78        # nominal equipment symbol width
EQ_H = 96        # nominal equipment symbol height (tall items)


def _sym_column(svg, cx, cy, internals=True):
    """Tall vertical vessel (column / reactor) — capsule with rounded ends + tray ticks."""
    w = 46
    h = EQ_H
    x = cx - w / 2
    top = cy - h / 2
    rx = w / 2
    # capsule body
    svg.path(f"M {x:.1f} {top + rx:.1f} "
             f"A {rx:.1f} {rx:.1f} 0 0 1 {x + w:.1f} {top + rx:.1f} "
             f"L {x + w:.1f} {top + h - rx:.1f} "
             f"A {rx:.1f} {rx:.1f} 0 0 1 {x:.1f} {top + h - rx:.1f} Z",
             stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    if internals:
        for k in range(4):
            ty = top + rx + 10 + k * (h - 2 * rx - 16) / 3
            svg.line(x + 5, ty, x + w - 5, ty, stroke=EQ_INK, width=1.0)
    return {"in": (x, cy), "out": (x + w, cy), "top": (cx, top),
            "bottom": (cx, top + h), "left": (x, cy), "right": (x + w, cy)}


def _sym_vessel(svg, cx, cy):
    return _sym_column(svg, cx, cy, internals=False)


def _sym_drum(svg, cx, cy):
    """Horizontal drum / separator — horizontal capsule."""
    w = EQ_W
    h = 42
    x = cx - w / 2
    top = cy - h / 2
    ry = h / 2
    svg.path(f"M {x + ry:.1f} {top:.1f} "
             f"L {x + w - ry:.1f} {top:.1f} "
             f"A {ry:.1f} {ry:.1f} 0 0 1 {x + w - ry:.1f} {top + h:.1f} "
             f"L {x + ry:.1f} {top + h:.1f} "
             f"A {ry:.1f} {ry:.1f} 0 0 1 {x + ry:.1f} {top:.1f} Z",
             stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    # liquid level line
    svg.line(x + 8, cy + 6, x + w - 8, cy + 6, stroke=ACCENT, width=1.0,
             dash="3,2")
    return {"in": (x, cy), "out": (x + w, cy), "top": (cx, top),
            "bottom": (cx, top + h), "left": (x, cy), "right": (x + w, cy)}


def _sym_tank(svg, cx, cy):
    """Flat-bottom storage tank — cylinder with a domed/flat top."""
    w = 64
    h = 70
    x = cx - w / 2
    top = cy - h / 2
    # body
    svg.rect(x, top + 6, w, h - 6, stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    # shallow dome top
    svg.path(f"M {x:.1f} {top + 8:.1f} Q {cx:.1f} {top - 6:.1f} {x + w:.1f} {top + 8:.1f}",
             stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    # level
    svg.line(x + 6, cy + 10, x + w - 6, cy + 10, stroke=ACCENT, width=1.0, dash="3,2")
    return {"in": (x, top + 18), "out": (x, top + h - 8), "top": (cx, top - 2),
            "bottom": (cx, top + h), "left": (x, cy), "right": (x + w, cy)}


def _sym_pump(svg, cx, cy):
    """Centrifugal pump — circle with a delivery triangle (standard P&ID volute mark)."""
    r = 19
    svg.circle(cx, cy, r, stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    # delivery triangle pointing up-right
    svg.path(f"M {cx:.1f} {cy:.1f} L {cx + r:.1f} {cy - r * 0.55:.1f} "
             f"L {cx + r:.1f} {cy + r * 0.55:.1f} Z", stroke=EQ_INK, width=1.4,
             fill="#dfe6ef")
    return {"in": (cx - r, cy), "out": (cx + r, cy), "top": (cx, cy - r),
            "bottom": (cx, cy + r), "left": (cx - r, cy), "right": (cx + r, cy)}


def _sym_compressor(svg, cx, cy):
    """Compressor / blower — ISA trapezoid (wide inlet narrowing to discharge) in a
    circle outline often; we use the trapezoid which reads unambiguously as a compressor."""
    w = 56
    h = 44
    x = cx - w / 2
    top = cy - h / 2
    # trapezoid narrowing left→right
    svg.path(f"M {x:.1f} {top:.1f} L {x + w:.1f} {top + h * 0.22:.1f} "
             f"L {x + w:.1f} {top + h * 0.78:.1f} L {x:.1f} {top + h:.1f} Z",
             stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    return {"in": (x, cy), "out": (x + w, cy), "top": (cx, top + h * 0.11),
            "bottom": (cx, top + h * 0.89), "left": (x, cy), "right": (x + w, cy)}


def _sym_hx(svg, cx, cy):
    """Heat exchanger — circle with a horizontal bar through it (TEMA/ISA shell symbol)."""
    r = 22
    svg.circle(cx, cy, r, stroke=EQ_INK, width=1.8, fill=EQ_FILL)
    svg.line(cx - r, cy, cx + r, cy, stroke=EQ_INK, width=1.4)
    # small tube-side ticks
    svg.line(cx - r * 0.5, cy - 6, cx + r * 0.5, cy - 6, stroke=EQ_INK, width=1.0)
    svg.line(cx - r * 0.5, cy + 6, cx + r * 0.5, cy + 6, stroke=EQ_INK, width=1.0)
    return {"in": (cx - r, cy), "out": (cx + r, cy), "top": (cx, cy - r),
            "bottom": (cx, cy + r), "left": (cx - r, cy), "right": (cx + r, cy)}


def _sym_fired(svg, cx, cy):
    """Fired heater / steam generator / oxidiser — vertical cylinder shell with a flame
    tick at the base (reads as a fired / combustion item)."""
    w = 48
    h = 84
    x = cx - w / 2
    top = cy - h / 2
    svg.rect(x, top, w, h, stroke=EQ_INK, width=1.8, fill=EQ_FILL, rx=4)
    # flame at the base
    fy = top + h - 6
    for off in (-9, 0, 9):
        svg.path(f"M {cx + off:.1f} {fy:.1f} q 3 -8 0 -13 q -3 5 0 13",
                 stroke=THERMAL_INK, width=1.4)
    # stack
    svg.line(cx, top, cx, top - 14, stroke=EQ_INK, width=1.6)
    return {"in": (x, cy), "out": (x + w, cy), "top": (cx, top - 14),
            "bottom": (cx, top + h), "left": (x, cy), "right": (x + w, cy)}


def _sym_generic(svg, cx, cy):
    w = 60
    h = 50
    svg.rect(cx - w / 2, cy - h / 2, w, h, stroke=EQ_INK, width=1.7, fill=EQ_FILL, rx=4)
    return {"in": (cx - w / 2, cy), "out": (cx + w / 2, cy), "top": (cx, cy - h / 2),
            "bottom": (cx, cy + h / 2), "left": (cx - w / 2, cy),
            "right": (cx + w / 2, cy)}


def _sym_offpage(svg, cx, cy):
    """Off-page / line connector — the standard 'home-plate' pentagon for a stream that
    taps in or continues off-drawing (used for pure-line pseudo-nodes: purge, supply,
    vent headers).  Points right (a source feeding into the drawing)."""
    w = 46
    h = 30
    x = cx - w / 2
    top = cy - h / 2
    tip = x + w + 12
    svg.path(f"M {x:.1f} {top:.1f} L {x + w:.1f} {top:.1f} L {tip:.1f} {cy:.1f} "
             f"L {x + w:.1f} {top + h:.1f} L {x:.1f} {top + h:.1f} Z",
             stroke=EQ_INK, width=1.7, fill="#e9edf3")
    return {"in": (x, cy), "out": (tip, cy), "top": (cx, top),
            "bottom": (cx, top + h), "left": (x, cy), "right": (tip, cy)}


_SYM_DRAW = {
    SYM_COLUMN: _sym_column, SYM_VESSEL: _sym_vessel, SYM_DRUM: _sym_drum,
    SYM_TANK: _sym_tank, SYM_PUMP: _sym_pump, SYM_COMPRESSOR: _sym_compressor,
    SYM_HX: _sym_hx, SYM_FIRED: _sym_fired, SYM_OFFPAGE: _sym_offpage,
    SYM_GENERIC: _sym_generic,
}


def _sym_instrument(svg, cx, cy, tag, where="equipment"):
    """ISA instrument bubble: a circle with the function tag; a field-mounted instrument
    (where='line') gets the standard single horizontal line through it."""
    r = 13
    svg.circle(cx, cy, r, stroke=ACCENT, width=1.6, fill=FILL_BG)
    if where == "line":
        svg.line(cx - r, cy, cx + r, cy, stroke=ACCENT, width=1.0)
    svg.text(cx, cy - 1, tag[:2], size=8.5, anchor="middle", weight="bold", fill=ACCENT)
    return r


def _sym_valve(svg, cx, cy, kind="manual"):
    """Standard P&ID valve bodies (two opposed triangles = bowtie). Control valves carry a
    diaphragm actuator; relief valves the angle-body + spring; ESD a solenoid box."""
    s = 8
    # bowtie gate body
    svg.path(f"M {cx - s:.1f} {cy - s:.1f} L {cx:.1f} {cy:.1f} "
             f"L {cx - s:.1f} {cy + s:.1f} Z", stroke=INK, width=1.5, fill=FILL_BG)
    svg.path(f"M {cx + s:.1f} {cy - s:.1f} L {cx:.1f} {cy:.1f} "
             f"L {cx + s:.1f} {cy + s:.1f} Z", stroke=INK, width=1.5, fill=FILL_BG)
    if kind == "control":
        # diaphragm actuator on top
        svg.line(cx, cy - s, cx, cy - s - 9, stroke=INK, width=1.3)
        svg.path(f"M {cx - 6:.1f} {cy - s - 9:.1f} A 6 5 0 0 1 {cx + 6:.1f} "
                 f"{cy - s - 9:.1f}", stroke=INK, width=1.3, fill=FILL_BG)
    elif kind == "relief":
        # spring/angle relief — a zig-zag spring above
        svg.line(cx, cy - s, cx, cy - s - 4, stroke=INK, width=1.3)
        svg.path(f"M {cx - 4:.1f} {cy - s - 4:.1f} l 8 -3 l -8 -3 l 8 -3",
                 stroke=INK, width=1.2)
    elif kind == "esd":
        # solenoid box
        svg.rect(cx - 5, cy - s - 11, 10, 8, stroke=INK, width=1.2, fill=FILL_BG)
        svg.text(cx, cy - s - 5, "S", size=7, anchor="middle", fill=INK)
    return s


# ---- main layout -------------------------------------------------------------

def _wrap(label: str, maxlen=18):
    """Wrap an equipment label to ≤2 lines for the symbol caption."""
    words = label.split()
    lines = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= maxlen:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == 2:
            break
    if cur and len(lines) < 2:
        lines.append(cur)
    if len(lines) == 2 and (len(" ".join(words)) > len(" ".join(lines))):
        lines[1] = lines[1][:maxlen - 1] + "…"
    return lines[:2]


def build_pid_svg(proc: Process) -> str:
    """Render the reconstructed process as a standard P&ID."""
    nodes = proc.nodes
    if not nodes:
        # degenerate: still emit a titled empty sheet so callers get a file.
        svg = SVG(1100, 600)
        svg.rect(18, 18, 1100 - 36, 600 - 36, stroke=GRID_FAINT, width=1.2)
        svg.text(550, 300, "No process topology in state — nothing to draw.",
                 size=14, anchor="middle", fill=MUTED)
        _draw_title_block(svg, proc, 1100, 600, 150)
        return svg.render()

    # group nodes by flow column; lay columns left→right, stack same-column items.
    by_col: dict[int, list[Node]] = {}
    for nd in nodes:
        by_col.setdefault(nd.column, []).append(nd)
    cols = sorted(by_col)
    ncol = len(cols)
    max_stack = max(len(by_col[c]) for c in cols)

    # ----- geometry -----
    # An array node draws a ghost-stack ABOVE its symbol (parallel units) + a tie-in fan
    # BELOW it; widen the column pitch + add top/bottom headroom so neither collides with
    # the neighbouring column or the title block. Universal — only grows when N-arrays
    # exist, otherwise byte-identical to the prior layout.
    has_array = any(nd.array_n > 1 for nd in nodes)
    col_pitch = 246 if has_array else 210
    row_pitch = 168
    margin_l = 70
    margin_top = (150 + 70) if has_array else 150   # +headroom for the parallel ghost stack
    title_h = 150
    legend_w = 250

    diagram_w = margin_l * 2 + (ncol - 1) * col_pitch + EQ_W
    width = max(diagram_w + legend_w, 1180)
    body_h = margin_top + (max_stack - 1) * row_pitch + (340 if has_array else 220)
    height = body_h + title_h
    width = int(math.ceil(width))
    height = int(math.ceil(height))

    svg = SVG(width, height)
    svg.rect(18, 18, width - 36, height - 36, stroke=GRID_FAINT, width=1.2)

    # ----- header -----
    svg.text(40, 50, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(40, 74, f"PIPING & INSTRUMENTATION DIAGRAM — {_humanise(proc.archetype)}",
             size=16, weight="bold", fill=EQ_INK)
    svg.text(40, 94, "Process flow projected from the as-modelled topology "
                     "(feed → reaction → separation → product).",
             size=10, fill=MUTED)
    svg.line(40, 108, width - 40, 108, stroke=GRID_FAINT, width=1.2)

    # ----- compute each node's centre -----
    centre: dict[str, tuple] = {}
    ports: dict[str, dict] = {}
    base_y = margin_top + 30
    for ci, c in enumerate(cols):
        stack = by_col[c]
        cx = margin_l + ci * col_pitch + EQ_W / 2
        # vertically centre the stack around the band middle
        total_h = (len(stack) - 1) * row_pitch
        y0 = base_y + ((max_stack - 1) * row_pitch - total_h) / 2
        for si, nd in enumerate(stack):
            cy = y0 + si * row_pitch
            centre[nd.key] = (cx, cy)

    # ----- draw process LINES first (so symbols sit on top of pipe ends) -----
    # we must draw symbols to know exact ports; do a scratch pass for ports.
    scratch = SVG(width, height)
    for nd in nodes:
        cx, cy = centre[nd.key]
        ports[nd.key] = _SYM_DRAW.get(nd.sym, _sym_generic)(scratch, cx, cy)

    # which lines are FORWARD vs return (decide once, so we can spread converging inlets).
    def _is_forward(ln):
        if ln.from_key not in centre or ln.to_key not in centre:
            return None
        return (centre[ln.to_key][0] >= centre[ln.from_key][0] - 1) and not ln.is_return

    # distribute multiple FORWARD inlets on a shared target across its left face, and
    # multiple FORWARD outlets from a shared source across its right face, so converging /
    # diverging pipes (and their tags) each get a clear lane instead of stacking.
    from collections import defaultdict
    in_idx, out_idx = {}, {}
    in_count, out_count = defaultdict(int), defaultdict(int)
    for ln in proc.lines:
        if _is_forward(ln):
            in_count[ln.to_key] += 1
            out_count[ln.from_key] += 1
    in_seen, out_seen = defaultdict(int), defaultdict(int)
    for ln in proc.lines:
        if _is_forward(ln):
            in_idx[id(ln)] = (in_seen[ln.to_key], in_count[ln.to_key])
            out_idx[id(ln)] = (out_seen[ln.from_key], out_count[ln.from_key])
            in_seen[ln.to_key] += 1
            out_seen[ln.from_key] += 1

    def _face_offset(idx_count, span):
        i, n = idx_count
        if n <= 1:
            return 0.0
        return (i - (n - 1) / 2) * (span / max(1, n))

    for ln in proc.lines:
        fwd = _is_forward(ln)
        if fwd is None:
            continue
        pf = ports[ln.from_key]
        pt = ports[ln.to_key]
        (fx, fy) = centre[ln.from_key]
        (tx, ty) = centre[ln.to_key]
        stroke = {LINE_PROCESS: PROC_INK, LINE_THERMAL: THERMAL_INK,
                  LINE_UTILITY: UTIL_INK}[ln.style]
        dash = {LINE_PROCESS: None, LINE_THERMAL: "7,4", LINE_UTILITY: "3,3"}[ln.style]
        marker = "flowT" if ln.style == LINE_THERMAL else "flow"
        lw = 2.4 if ln.style == LINE_PROCESS else 1.9
        in_off = _face_offset(in_idx.get(id(ln), (0, 1)), 56) if fwd else 0.0
        out_off = _face_offset(out_idx.get(id(ln), (0, 1)), 52) if fwd else 0.0
        # when the source fans out (>1 outlet) the tags share an x; keep them terse
        # (line number only) so they don't collide with each other's service hints.
        terse = out_count.get(ln.from_key, 1) > 1
        _draw_pipe(svg, pf, pt, fx, fy, tx, ty, fwd, stroke, lw, dash, marker, ln,
                   in_off=in_off, out_off=out_off, terse=terse)

    # ----- draw equipment SYMBOLS + captions + instruments -----
    for nd in nodes:
        cx, cy = centre[nd.key]
        _SYM_DRAW.get(nd.sym, _sym_generic)(svg, cx, cy)
        # ARRAY BANK: a collapsed qty-N node draws the FULL bank of N parallel units
        # (TK-101…TK-110) behind/around the primary symbol + a per-unit tie-in fan, so
        # the P&ID honestly shows all N units + how each connects. Universal (any class).
        if nd.array_n > 1:
            _draw_array_bank(svg, nd, cx, cy, ports[nd.key])
        # tag (bold) above, name (wrapped) below
        tag_txt = nd.tag if nd.array_n <= 1 else _array_tag_label(nd)
        svg.text(cx, cy - _sym_caption_top(nd.sym), tag_txt, size=11, anchor="middle",
                 weight="bold", fill=EQ_INK)
        cap_y = cy + _sym_caption_bot(nd.sym)
        label = nd.label if nd.array_n <= 1 else f"{nd.label}  (×{nd.array_n} parallel)"
        for li, line in enumerate(_wrap(label, 20)):
            svg.text(cx, cap_y + li * 12, line, size=9, anchor="middle", fill=MUTED)
        # instruments — bubbles above the symbol, connected by a dashed lead
        instr_right = _draw_node_instruments(svg, nd, cx, cy, ports[nd.key])
        # equipment-mounted relief valve (PSV) — nozzle placed clear to the RIGHT of the
        # instrument fan + the equipment tag (both at top-centre), so nothing overlaps.
        for v in nd.valves:
            if v.kind == "relief":
                topx, topy = ports[nd.key]["top"]
                nx = max(instr_right + 30, topx + 26)
                svg.line(topx + 6, topy + 2, nx, topy + 2, stroke=INK, width=1.1)
                svg.line(nx, topy + 2, nx, topy - 12, stroke=INK, width=1.3)
                _sym_valve(svg, nx, topy - 20, kind="relief")
                svg.text(nx + 11, topy - 18, v.tag, size=8, anchor="start", fill=MUTED)

    # ----- LEGEND + power note -----
    legend_x = width - legend_w + 10
    legend_bottom = _draw_legend(svg, legend_x, margin_top + 6, legend_w - 30)
    if proc.power_note:
        _draw_power_note(svg, legend_x, legend_bottom + 16, legend_w - 30,
                         proc.power_note)

    # ----- TITLE BLOCK -----
    _draw_title_block(svg, proc, width, height, title_h)
    return svg.render()


def _array_tag_label(nd: Node) -> str:
    """A tag RANGE for an array node: 'TK-101…TK-110' (first…last per-unit tag), else the
    node tag + '×N'."""
    tags = nd.array_tags or []
    if len(tags) >= 2:
        return f"{tags[0]}…{tags[-1]}"
    return f"{nd.tag} ×{nd.array_n}"


def _draw_array_bank(svg, nd: Node, cx, cy, port):
    """Draw a collapsed qty-N node as a BANK of N parallel units + a per-unit tie-in fan.

    Layout (standard P&ID 'parallel-train' depiction): the primary symbol (already drawn
    at cx,cy) is the FIRST unit on the main process line; behind it we draw a compact stack
    of (N-1) GHOSTED unit glyphs offset up-and-right to read as 'N identical units in
    parallel', joined to a COMMON SUPPLY + COMMON RETURN header rail (the manifold every
    rearing tank taps). Below the bank we draw the per-unit TIE-IN nozzles the interconnect
    census enumerated (drain, vent/relief, O2/inert purge, …) dropping to a labelled
    service header, each annotated '×N' (one per unit). Universal: shapes + counts come
    from the manifest + census, no per-class geometry."""
    n = nd.array_n
    # ghost stack — up to 4 visible offset copies (the rest implied by the ×N label), so
    # the bank reads as a parallel set without 10 full symbols crushing the column.
    n_ghost = min(n - 1, 4)
    dx, dy = 13, -11
    for i in range(n_ghost, 0, -1):
        gx, gy = cx + i * dx, cy + i * dy
        # a small ghosted vessel outline (lighter ink) so depth reads
        _mini_unit_glyph(svg, gx, gy, nd.sym, ghost=True)
    # a brace + count over the stack
    bxr = cx + (n_ghost + 0.5) * dx + 8
    byr = cy + (n_ghost + 0.5) * dy
    svg.text(bxr, byr, f"×{n}", size=10, anchor="start", weight="bold", fill=ACCENT)

    # COMMON HEADERS — a supply rail entering the bank top, a return rail leaving the
    # bottom, both spanning the ghost stack (the manifold all N units share).
    top_x, top_y = port["top"]
    bot_x, bot_y = port["bottom"]
    hdr_x0, hdr_x1 = cx - 8, cx + (n_ghost + 1) * dx
    svg.line(hdr_x0, top_y - 6, hdr_x1, top_y - 6, stroke=PROC_INK, width=2.0)
    svg.text(hdr_x1 + 3, top_y - 8, "common supply header", size=6.6, anchor="start",
             fill=MUTED)
    # tie each ghost + the primary up to the supply header
    for i in range(0, n_ghost + 1):
        ux = cx + i * dx
        uy = (cy + i * dy) - 16
        svg.line(ux, uy, ux, top_y - 6, stroke=PROC_INK, width=1.0)

    # PER-UNIT TIE-IN FAN — the census nozzles drop below the primary unit to a labelled
    # service header; each carries its '×N' (one per physical unit).
    if nd.tie_ins:
        _draw_tiein_fan(svg, nd, cx, cy, bot_x, bot_y)


def _mini_unit_glyph(svg, cx, cy, sym, ghost=False):
    """A small single-unit glyph used for the ghosted parallel copies in an array bank."""
    ink = "#9fb0c4" if ghost else EQ_INK
    fill = "#f3f6fa" if ghost else EQ_FILL
    if sym == SYM_TANK:
        svg.rect(cx - 11, cy - 7, 22, 22, stroke=ink, width=1.2, fill=fill, rx=1)
        svg.path(f"M {cx-11:.1f} {cy-7:.1f} Q {cx:.1f} {cy-13:.1f} {cx+11:.1f} {cy-7:.1f}",
                 stroke=ink, width=1.2, fill=fill)
    elif sym in (SYM_COLUMN, SYM_VESSEL):
        svg.path(f"M {cx-7:.1f} {cy-9:.1f} A 7 7 0 0 1 {cx+7:.1f} {cy-9:.1f} "
                 f"L {cx+7:.1f} {cy+11:.1f} A 7 7 0 0 1 {cx-7:.1f} {cy+11:.1f} Z",
                 stroke=ink, width=1.2, fill=fill)
    else:
        svg.rect(cx - 10, cy - 9, 20, 20, stroke=ink, width=1.2, fill=fill, rx=2)


def _draw_tiein_fan(svg, nd: Node, cx, cy, bot_x, bot_y):
    """Drop the per-unit census tie-ins (drain / vent / O2-inert / CW / power / signal)
    from the bank's bottom to a shared SERVICE HEADER below it, each as a short nozzle stub
    with its role label + '×N' count. The mechanism sets the stub colour (process / thermal
    / electrical), so the reader sees the full per-tank service set, not just the main
    line."""
    ties = nd.tie_ins[:6]
    if not ties:
        return
    n_units = nd.array_n
    # Drop the fan well BELOW the 2-line equipment caption so the role labels never
    # collide with it (caption sits ~cy+48..+72; the fan header goes lower still), and
    # shift it slightly right of the symbol centre so the trunk clears the caption text.
    base_y = bot_y + 86
    pitch = 30
    span = pitch * max(1, len(ties) - 1)
    x0 = cx + 6 - span / 2.0
    # the service header rail
    svg.line(x0 - 12, base_y, x0 + span + 12, base_y, stroke=UTIL_INK, width=1.8,
             dash="1,0")
    svg.text(x0 + span + 16, base_y + 3, "to shared service headers", size=6.8,
             anchor="start", fill=MUTED)
    # a trunk from the bank bottom down to the header (offset right of the caption)
    trunk_x = cx + 6
    svg.line(trunk_x, bot_y + 2, trunk_x, base_y - 0.5, stroke=UTIL_INK, width=1.0,
             dash="3,2")
    for i, t in enumerate(ties):
        tx = x0 + i * pitch
        col = {"thermal": THERMAL_INK, "electrical_bus": ACCENT}.get(t.mechanism,
                                                                     PROC_INK)
        # short nozzle stub up from the header
        svg.line(tx, base_y, tx, base_y - 13, stroke=col, width=1.4)
        _sym_valve(svg, tx, base_y - 13, kind="manual")
        lbl = _TIEIN_LABEL.get(t.role, t.role)
        cnt = t.n_per_unit * n_units
        svg.text(tx, base_y + 13, lbl, size=6.8, anchor="middle", fill=MUTED)
        svg.text(tx, base_y + 22, f"×{cnt}" + (f" {t.size}" if t.size else ""),
                 size=6.2, anchor="middle", fill=MUTED)


def _sym_caption_top(sym):
    return {SYM_COLUMN: 58, SYM_VESSEL: 58, SYM_FIRED: 58, SYM_TANK: 44,
            SYM_DRUM: 30, SYM_HX: 30, SYM_PUMP: 28, SYM_COMPRESSOR: 30}.get(sym, 32)


def _sym_caption_bot(sym):
    return {SYM_COLUMN: 62, SYM_VESSEL: 62, SYM_FIRED: 60, SYM_TANK: 48,
            SYM_DRUM: 32, SYM_HX: 32, SYM_PUMP: 30, SYM_COMPRESSOR: 32}.get(sym, 34)


def _draw_pipe(svg, pf, pt, fx, fy, tx, ty, forward, stroke, lw, dash, marker, ln,
               in_off=0.0, out_off=0.0, terse=False):
    """Route an orthogonal pipe from node-from to node-to with a flow arrow + line tag.
    Forward edges leave the source's right face (+out_off) and enter the target's left
    face (+in_off) — the offsets give converging/diverging pipes distinct lanes.  Backward
    (recycle) edges route OVER the top so they read as a return loop."""
    if forward:
        x0, y0 = pf["right"]
        x1, y1 = pt["left"]
        y0 += out_off
        y1 += in_off
        # vertical jog ~⅖ of the way from the source, so the tag sits on a clear run near
        # the SOURCE outlet (distinct per line) rather than piling at a shared target.
        xm = x0 + (x1 - x0) * 0.42 if abs(y1 - y0) > 3 else x1
        pts = [(x0, y0)]
        if abs(y1 - y0) > 3:
            pts += [(xm, y0), (xm, y1)]
        pts += [(x1, y1)]
        _polyline(svg, pts, stroke, lw, dash, marker)
        run_end = xm if xm != x0 else x1
        _line_tag(svg, ln, (x0 + run_end) / 2, y0, stroke, terse=terse)
        _decorate_line(svg, ln, x0, y0, run_end, y0, stroke)
    else:
        # recycle: leave 'top', go up, across, down into 'top' of target
        x0, y0 = pf["top"]
        x1, y1 = pt["top"]
        up = min(y0, y1) - 56
        pts = [(x0, y0), (x0, up), (x1, up), (x1, y1)]
        _polyline(svg, pts, stroke, lw, dash, marker)
        _line_tag(svg, ln, (x0 + x1) / 2, up, stroke, above=True)
        _decorate_line(svg, ln, x0, up, x1, up, stroke)


def _polyline(svg, pts, stroke, lw, dash, marker):
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    da = f' stroke-dasharray="{dash}"' if dash else ""
    svg.add(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{lw}" '
            f'stroke-linejoin="round" stroke-linecap="round" '
            f'marker-end="url(#{marker})"{da}/>')


def _line_tag(svg, ln, x, y, stroke, above=False, terse=False):
    """The line number (primary) + a SHORT service hint, on a small leader above the pipe.
    The full service description lives in the line schedule; here we keep it terse so
    converging-inlet tags stay legible.  terse=True (source fans out) drops the hint."""
    dy = -8 if above else -7
    svg.text(x, y + dy, ln.number, size=8.3, anchor="middle", weight="bold", fill=stroke,
             mono=True)
    if ln.service and not terse:
        svc = _short_service(ln.service)
        if svc:
            svg.text(x, y + dy - 10, svc, size=7.0, anchor="middle", fill=MUTED)


def _short_service(svc: str, maxlen=22) -> str:
    """First clause of a service description, truncated — the line number carries the
    identity; this is just a human hint (e.g. 'CO2 compressed', 'raised steam')."""
    s = svc.strip()
    # cut at the first connective so we keep the head noun phrase.
    for cut in (" then ", " blended ", " recompressed ", " recovers ", " to ", " into "):
        idx = s.lower().find(cut)
        if 0 < idx <= maxlen + 6:
            s = s[:idx]
            break
    s = s.strip(" .,_")
    return s if len(s) <= maxlen else s[:maxlen - 1] + "…"


def _decorate_line(svg, ln, x0, y, x1, y2, stroke):
    """Place in-line valves + field instruments along a (roughly horizontal) segment."""
    items = [("valve", v) for v in ln.valves] + [("instr", i) for i in ln.instruments]
    if not items:
        return
    n = len(items)
    span_x = x1 - x0
    for i, (kind, obj) in enumerate(items):
        px = x0 + span_x * (i + 1) / (n + 1)
        if kind == "valve":
            _sym_valve(svg, px, y, kind=obj.kind)
            if obj.tag:
                svg.text(px, y + 18, obj.tag, size=7.5, anchor="middle", fill=MUTED)
        else:
            # field instrument bubble dropped below the line on a lead
            svg.line(px, y, px, y + 18, stroke=ACCENT, width=1.0, dash="2,2")
            _sym_instrument(svg, px, y + 30, obj.tag, where="line")


def _draw_node_instruments(svg, nd, cx, cy, port):
    """Draw the equipment instrument bubbles in a small fan above the symbol.  Returns the
    x of the RIGHTMOST bubble (so a PSV nozzle can be placed clear to its right), or cx
    when there are none."""
    if not nd.instruments:
        return cx
    topx, topy = port["top"]
    n = len(nd.instruments)
    spread = 30
    start = cx - spread * (n - 1) / 2
    rightmost = cx
    for i, ins in enumerate(nd.instruments):
        bx = start + i * spread
        by = topy - 34
        svg.line(cx, topy, bx, by + 13, stroke=ACCENT, width=0.9, dash="2,2")
        _sym_instrument(svg, bx, by, ins.tag, where="equipment")
        rightmost = max(rightmost, bx)
    return rightmost


# ---- legend / power note / title block --------------------------------------

def _draw_legend(svg, x, y, w):
    """Symbol legend panel — equipment glyphs + line styles + instrument bubble."""
    items_eq = [
        (SYM_COLUMN, "Column / reactor"),
        (SYM_DRUM, "Separator / drum"),
        (SYM_VESSEL, "Vessel / dryer"),
        (SYM_TANK, "Storage tank"),
        (SYM_PUMP, "Pump"),
        (SYM_COMPRESSOR, "Compressor / blower"),
        (SYM_HX, "Heat exchanger"),
        (SYM_FIRED, "Fired / steam gen."),
        (SYM_OFFPAGE, "Line / off-page conn."),
    ]
    rowh = 30
    pad = 14
    header_h = 22
    n_rows = len(items_eq) + 5   # + 3 line styles + instrument + valve
    bh = header_h + pad + n_rows * rowh
    svg.rect(x, y, w, bh, stroke=GRID_FAINT, width=1.2, fill=PANEL_BG, rx=4)
    svg.text(x + 12, y + 16, "LEGEND", size=10, weight="bold", fill=MUTED)
    yy = y + header_h + 16
    gx = x + 26
    tx = x + 52
    for sym, lbl in items_eq:
        _mini_symbol(svg, gx, yy, sym)
        svg.text(tx, yy + 4, lbl, size=8.8, fill=MUTED)
        yy += rowh
    # line styles
    for stroke, dash, lbl in (
            (PROC_INK, None, "Process line"),
            (THERMAL_INK, "7,4", "Thermal / steam"),
            (UTIL_INK, "3,3", "Utility / minor")):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        svg.add(f'<line x1="{gx - 10:.1f}" y1="{yy:.1f}" x2="{gx + 14:.1f}" '
                f'y2="{yy:.1f}" stroke="{stroke}" stroke-width="2.2"{da} '
                f'marker-end="url(#{"flowT" if stroke == THERMAL_INK else "flow"})"/>')
        svg.text(tx, yy + 4, lbl, size=8.8, fill=MUTED)
        yy += rowh
    # instrument bubble
    _sym_instrument(svg, gx, yy, "PT", where="equipment")
    svg.text(tx, yy + 4, "ISA instrument (field)", size=8.8, fill=MUTED)
    yy += rowh
    # valve
    _sym_valve(svg, gx, yy, kind="control")
    svg.text(tx, yy + 4, "Control / relief valve", size=8.8, fill=MUTED)
    yy += rowh
    return y + bh


def _mini_symbol(svg, cx, cy, sym):
    """A small glyph for the legend (scaled-down equipment marks)."""
    if sym == SYM_COLUMN:
        svg.path(f"M {cx-5:.1f} {cy-8:.1f} A 5 5 0 0 1 {cx+5:.1f} {cy-8:.1f} "
                 f"L {cx+5:.1f} {cy+8:.1f} A 5 5 0 0 1 {cx-5:.1f} {cy+8:.1f} Z",
                 stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        svg.line(cx - 4, cy - 2, cx + 4, cy - 2, stroke=EQ_INK, width=0.8)
        svg.line(cx - 4, cy + 3, cx + 4, cy + 3, stroke=EQ_INK, width=0.8)
    elif sym == SYM_DRUM:
        svg.path(f"M {cx-6:.1f} {cy-5:.1f} L {cx+6:.1f} {cy-5:.1f} "
                 f"A 5 5 0 0 1 {cx+6:.1f} {cy+5:.1f} L {cx-6:.1f} {cy+5:.1f} "
                 f"A 5 5 0 0 1 {cx-6:.1f} {cy-5:.1f} Z",
                 stroke=EQ_INK, width=1.4, fill=EQ_FILL)
    elif sym == SYM_VESSEL:
        svg.path(f"M {cx-5:.1f} {cy-8:.1f} A 5 5 0 0 1 {cx+5:.1f} {cy-8:.1f} "
                 f"L {cx+5:.1f} {cy+8:.1f} A 5 5 0 0 1 {cx-5:.1f} {cy+8:.1f} Z",
                 stroke=EQ_INK, width=1.4, fill=EQ_FILL)
    elif sym == SYM_TANK:
        svg.rect(cx - 7, cy - 5, 14, 12, stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        svg.path(f"M {cx-7:.1f} {cy-5:.1f} Q {cx:.1f} {cy-9:.1f} {cx+7:.1f} {cy-5:.1f}",
                 stroke=EQ_INK, width=1.4, fill=EQ_FILL)
    elif sym == SYM_PUMP:
        svg.circle(cx, cy, 7, stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        svg.path(f"M {cx:.1f} {cy:.1f} L {cx+7:.1f} {cy-4:.1f} L {cx+7:.1f} {cy+4:.1f} Z",
                 stroke=EQ_INK, width=1.0, fill="#dfe6ef")
    elif sym == SYM_COMPRESSOR:
        svg.path(f"M {cx-7:.1f} {cy-6:.1f} L {cx+7:.1f} {cy-3:.1f} "
                 f"L {cx+7:.1f} {cy+3:.1f} L {cx-7:.1f} {cy+6:.1f} Z",
                 stroke=EQ_INK, width=1.4, fill=EQ_FILL)
    elif sym == SYM_HX:
        svg.circle(cx, cy, 8, stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        svg.line(cx - 8, cy, cx + 8, cy, stroke=EQ_INK, width=1.0)
    elif sym == SYM_FIRED:
        svg.rect(cx - 5, cy - 8, 10, 16, stroke=EQ_INK, width=1.4, fill=EQ_FILL, rx=1)
        svg.path(f"M {cx:.1f} {cy+6:.1f} q 2 -5 0 -8 q -2 3 0 8",
                 stroke=THERMAL_INK, width=1.1)
    elif sym == SYM_OFFPAGE:
        svg.path(f"M {cx-7:.1f} {cy-5:.1f} L {cx+3:.1f} {cy-5:.1f} L {cx+8:.1f} {cy:.1f} "
                 f"L {cx+3:.1f} {cy+5:.1f} L {cx-7:.1f} {cy+5:.1f} Z",
                 stroke=EQ_INK, width=1.3, fill="#e9edf3")
    else:
        svg.rect(cx - 7, cy - 6, 14, 12, stroke=EQ_INK, width=1.3, fill=EQ_FILL, rx=2)


def _draw_power_note(svg, x, y, w, note):
    lines = _wrap_text(note, w, 8.6)
    bh = 14 + len(lines) * 12
    svg.rect(x, y, w, bh, stroke=GRID_FAINT, width=1.0, fill=FILL_BG, rx=3)
    svg.text(x + 10, y + 14, "POWER", size=8.5, weight="bold", fill=MUTED)
    for i, ln in enumerate(lines):
        svg.text(x + 10, y + 26 + i * 12, ln, size=8.4, fill=MUTED)


def _wrap_text(s, px_w, font_px):
    """Greedy word-wrap to a pixel width (approx char width = 0.52×font)."""
    cw = max(1, int(px_w / (font_px * 0.52)))
    words = s.split()
    out = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= cw:
            cur = (cur + " " + w).strip()
        else:
            out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


def _draw_title_block(svg, proc, width, height, title_h):
    """Standard drawing title block — bottom strip with a description panel (left) and a
    drawing-metadata box (right), mirroring the SLD."""
    y0 = height - title_h + 24
    x0 = 30
    x1 = width - 30
    svg.line(x0, y0, x1, y0, stroke=INK, width=1.6)

    bw = 300
    bx0 = x1 - bw
    by0 = y0 + 14
    rows = [("DRAWING No.", "FF-PID-001"),
            ("REV", "—   (placeholder)"),
            ("DATE", "YYYY-MM-DD"),
            ("SCALE", "NTS")]
    rh = 22
    box_h = rh * len(rows)
    svg.rect(bx0, by0, bw, box_h, stroke=INK, width=1.3, fill=FILL_BG)
    for i, (k, v) in enumerate(rows):
        ry = by0 + i * rh
        if i:
            svg.line(bx0, ry, bx0 + bw, ry, stroke=GRID_FAINT, width=1.0)
        svg.line(bx0 + 108, by0, bx0 + 108, by0 + box_h, stroke=GRID_FAINT, width=1.0)
        svg.text(bx0 + 8, ry + 15, k, size=9, fill=MUTED, weight="bold")
        svg.text(bx0 + 116, ry + 15, v, size=9.5)

    svg.text(x0, y0 + 24, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(x0, y0 + 43, f"PIPING & INSTRUMENTATION DIAGRAM — {_humanise(proc.archetype)}",
             size=15, weight="bold", fill=EQ_INK)
    svg.text(x0, y0 + 61,
             "Scope: as-modelled major process lines + instruments "
             "(projected from the process topology) · not for construction.",
             size=9.5, fill=MUTED)
    ny = y0 + 79
    for note in (proc.notes or [])[:2]:
        svg.text(x0, ny, "• " + note, size=9.0, fill=MUTED)
        ny += 13
    svg.text(x0, ny + 2,
             "Auto-generated · ForgeOS process auto-projection · not for construction.",
             size=8.6, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# RASTERISATION  (SVG → PNG) — identical cascade to the SLD
# ═══════════════════════════════════════════════════════════════════════════

def _svg_dims(svg_text: str):
    mw = re.search(r'<svg[^>]*\bwidth="([\d.]+)"', svg_text)
    mh = re.search(r'<svg[^>]*\bheight="([\d.]+)"', svg_text)
    return (int(math.ceil(float(mw.group(1)))) if mw else 1200,
            int(math.ceil(float(mh.group(1)))) if mh else 800)


def rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
    svg_text = svg_path.read_text()
    w, h = _svg_dims(svg_text)

    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=w * scale, output_height=h * scale,
                         background_color="white")
        if png_path.is_file() and png_path.stat().st_size > 1000:
            return True
    except Exception:
        pass

    rsvg = shutil.which("rsvg-convert")
    if rsvg:
        try:
            subprocess.run([rsvg, "-w", str(w * scale), "-h", str(h * scale),
                            "-b", "white", "-o", str(png_path), str(svg_path)],
                           check=True, capture_output=True, timeout=60)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception:
            pass

    chrome = _find_chrome()
    if chrome:
        try:
            subprocess.run(
                [chrome, "--headless", "--disable-gpu", "--no-sandbox",
                 f"--screenshot={png_path}",
                 f"--window-size={w},{h}",
                 f"--force-device-scale-factor={scale}",
                 "--default-background-color=FFFFFFFF",
                 "--hide-scrollbars", f"file://{svg_path}"],
                check=True, capture_output=True, timeout=90)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception as ex:
            print(f"[pid] chrome rasterise failed: {ex}")
    return False


def _find_chrome():
    for c in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ):
        if Path(c).is_file():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def generate_pid(out_dir: str, state_path: Optional[str] = None,
                 rasterise_png: bool = True):
    """Full pipeline: load → reconstruct → draw → write SVG (+ PNG)."""
    schedule, state = load_inputs(out_dir, state_path)
    # pass out_dir so array nodes (qty-N collapsed) get expanded from the parts-manifest +
    # interconnect census the GA already uses (all N units + their per-unit tie-ins).
    proc = reconstruct_process(schedule, state, out_dir=out_dir)
    svg_text = build_pid_svg(proc)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "pid.svg"
    png_path = draw_dir / "pid.png"
    svg_path.write_text(svg_text)

    png_ok = rasterise(svg_path, png_path) if rasterise_png else False

    summary = {
        "archetype": proc.archetype,
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "equipment": len(proc.nodes),
        "lines": len(proc.lines),
        "instruments": sum(len(n.instruments) for n in proc.nodes)
                       + sum(len(l.instruments) for l in proc.lines),
        "valves": sum(len(n.valves) for n in proc.nodes)
                  + sum(len(l.valves) for l in proc.lines),
        "schedule_present": proc.schedule_present,
        "symbols": _symbol_breakdown(proc),
    }
    return summary, proc, svg_text


def _symbol_breakdown(proc: Process):
    from collections import Counter
    c = Counter(n.sym for n in proc.nodes)
    return dict(c)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, _proc, _svg = generate_pid(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[pid] ERROR: {ex}")
        return 2
    print(f"[pid] archetype     : {summary['archetype']}")
    print(f"[pid] equipment     : {summary['equipment']}  {summary['symbols']}")
    print(f"[pid] process lines : {summary['lines']}")
    print(f"[pid] instruments   : {summary['instruments']}")
    print(f"[pid] valves        : {summary['valves']}")
    print(f"[pid] schedule used : {summary['schedule_present']}")
    print(f"[pid] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[pid] PNG → {summary['png']}")
    else:
        print("[pid] PNG not written (no rasteriser available — SVG is the master)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
