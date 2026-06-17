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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)


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
INSTR_LSL = ("LSL", "level-low")        # low-level switch / trip (life-safety)
INSTR_DO = ("AT", "dissolved-oxygen")   # dissolved-oxygen analyser (DO control)
INSTR_COND = ("AT", "conductivity")     # conductivity / salinity analyser

# A synthesised per-equipment instrument word's tag-letter prefix, keyed on the FUNCTION
# token in its character_id / name (the engine tags one word per instrument per unit —
# 'instr_level_on_rearing_tank…', 'Dissolved-Oxygen Analyser'). Order matters: the first
# match wins (dissolved-oxygen before a bare 'oxygen', pH before a generic analyser).
_INSTR_WORD_FUNC = [
    (re.compile(r"dissolved.?oxygen|dissolved_o2|\bdo\b|_do_|do_anal", re.I), INSTR_DO),
    (re.compile(r"\bph\b|_ph_|ph_anal", re.I), INSTR_PH),
    (re.compile(r"conductiv|salin", re.I), INSTR_COND),
    (re.compile(r"\blevel\b|_level_|level_transmit|level_switch", re.I), INSTR_LEVEL),
    (re.compile(r"temperatur|_temp_|\btemp\b", re.I), INSTR_TEMP),
    (re.compile(r"\bflow\b|_flow_|flow_transmit", re.I), INSTR_FLOW),
    (re.compile(r"pressure|_press_", re.I), INSTR_PRESSURE),
    (re.compile(r"analys|analyz", re.I), INSTR_ANALYSE),
]

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
class ControlLoop:
    """A CONTROL LOOP drawn as an ISA controller bubble + a dashed SIGNAL line from a
    measurement on one node to a final control element on another (e.g. a dissolved-oxygen
    analyser on the tank modulating the oxygenation system; a level transmitter on the tank
    opening the make-up-water valve). The life-safety interlocks a RAS P&ID must show."""
    src_key: str                 # node carrying the measurement (e.g. the rearing tank)
    dst_key: str                 # node with the final control element (O2 system / make-up)
    measure_tag: str             # the measurement bubble, e.g. 'AT' (DO) / 'LT'
    controller_tag: str          # the controller bubble, e.g. 'AC' / 'LC'
    label: str = ""              # short loop label, e.g. 'DO control' / 'level → make-up'
    dst_valve_tag: str = ""      # final control element tag at the destination, e.g. 'FCV'
    dst_fail_open: bool = False   # the final valve fails OPEN on power/air loss (life-safety
                                  # O₂ dosing valve, from the ledger o2_dosing_valve_fail_state)


@dataclass
class Ancillary:
    """A PRINCIPAL plant item that is NOT on the topology spine but IS in the BoM — every
    synthesised packaged / ancillary life-support system (feed, LOX, dosing, sludge,
    chilling, mortality, biosecurity, standby genset, UPS, SCADA, ventilation, …), the
    per-tank emergency-O₂ solenoid (the life-safety final element), and any field
    instrument not already mounted on a node. The P&ID MUST show what the BoM contains, so
    these are projected onto the sheet as a tagged register with each item's tie-in line
    reference (read from the connection schedule / route manifest), exactly as a real P&ID
    carries packaged-skid + utility tie-in tables. Universal — derived from the BoM, never
    a per-class list."""
    tag: str                     # equipment tag (e.g. 'X-111', 'Y', 'SCADA')
    name: str                    # the BoM requirement head noun
    kind: str                    # 'system' | 'utility' | 'safety' | 'instrument' | 'rotating'
    sym: str = ""                # ISA symbol when drawn as a block (else "")
    duty: str = ""               # the duty/rating clause from the requirement
    tie_line: str = ""           # the line number tying it into the process loop
    tie_to: str = ""             # the equipment tag/name it ties into
    qty: int = 1                 # placed quantity (e.g. 10 emergency-O₂ solenoids)


@dataclass
class Process:
    archetype: str
    nodes: list[Node]
    lines: list[Line]
    power_note: str = ""         # the electrical_bus edge, summarised as a note
    notes: list[str] = field(default_factory=list)
    schedule_present: bool = False
    control_loops: list[ControlLoop] = field(default_factory=list)
    ancillaries: list[Ancillary] = field(default_factory=list)
    # the fail-open per-tank emergency-O₂ solenoid life-safety final element, as
    # (tag, qty), or None when the design carries none. Drawn on the DO culture-tank.
    emergency_o2: Optional[tuple] = None
    # the dedicated emergency-O₂ supply rate (kg/h) + buffer (kg) from the ledger, annotated
    # on the emergency-O₂ supply line so the life-safety O₂ path carries its real figures.
    emergency_o2_supply_kg_h: float = 0.0
    emergency_o2_buffer_kg: float = 0.0
    rev: str = "P1"              # preliminary revision (deterministic, not a live clock)
    date: str = ""               # issue date derived from the run's own artifact mtime


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


def _load_route_manifest(out_dir: str) -> list:
    """Return the raw route-manifest line list, or [] if absent / unreadable."""
    p = Path(out_dir) / "route-manifest.json"
    if p.is_file():
        try:
            d = json.load(open(p))
            return d.get("lines") or []
        except Exception:
            return []
    return []


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


def _pid_quantity(state: dict, *keys):
    """First matching contract-quantity VALUE (dict OR list form) across both contracts —
    the same reader idiom the other generators use, for the life-safety O₂ figures."""
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict):
            for k in keys:
                if k in q:
                    v = q[k]
                    return v.get("value") if isinstance(v, dict) else v
        elif isinstance(q, list):
            for item in q:
                if item.get("key") in keys:
                    return item.get("value")
    return None


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


def _run_issue_date(out_dir: Optional[str]) -> str:
    """Deterministic title-block issue date (YYYY-MM-DD) from the run's OWN artifacts —
    now delegated to the shared `drawing_titleblock.issue_date` so all eight drawings use
    ONE implementation (see drawing_titleblock.py for the full contract)."""
    return _tb.issue_date(out_dir)


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


# ── SYNTHESISED PER-EQUIPMENT INSTRUMENTS ────────────────────────────────────────────
# The engine SYNTHESISES one instrument WORD per instrument per unit (tagged `_instrument`
# with `_instrument_of` naming the parent equipment word) — e.g. Level / Temperature /
# Dissolved-Oxygen / pH / Conductivity on each rearing tank, Level / Temperature / DO on
# the biofilter. These are the design's REAL instruments; the P&ID must PROJECT them onto
# the matching equipment node as ISA bubbles (the conventional `_discover_instrument_types`
# guesser is only a fallback for designs that don't synthesise explicit instrument words).

def _instr_words(state: dict):
    """Yield (parent_key, instr_tuple) for every synthesised `_instrument` word, resolving
    its FUNCTION from the word's character_id / name. `parent_key` is the equipment word id
    it instruments (`_instrument_of`)."""
    for w, name, cid, _mid in _iter_words(state):
        if w.get("_instrument") is not True:
            continue
        parent = w.get("_instrument_of") or ""
        blob = f"{cid} {name}"
        instr = None
        for rx, tup in _INSTR_WORD_FUNC:
            if rx.search(blob):
                instr = tup
                break
        if instr is not None and parent:
            yield str(parent), instr


def _node_for_parent(parent_key: str, nodes: dict):
    """Map a synthesised instrument's parent equipment word id (e.g. 'rearing_tank_synth_
    word') onto the P&ID node it belongs to (e.g. the 'rearing_tanks' tank node), by token
    overlap (singularising trailing -s). Returns the Node or None. Universal — no per-class
    table; the same matcher the array-expansion uses."""
    ptoks = _name_tokens(parent_key)
    # drop generic suffix tokens so 'rearing_tank_synth_word' keys on 'rearing'/'tank'.
    ptoks -= {"synth", "word", "synthesized", "synthesised", "unit", "system"}
    ptoks |= {t[:-1] for t in list(ptoks) if t.endswith("s") and len(t) > 3}
    best, best_score = None, 0
    for nd in nodes.values():
        ntoks = _name_tokens(nd.key) | _name_tokens(nd.label)
        ntoks |= {t[:-1] for t in list(ntoks) if t.endswith("s") and len(t) > 3}
        score = len(ptoks & ntoks)
        if score > best_score:
            best_score, best = score, nd
    return best if best_score >= 1 else None


def _project_synth_instruments(nodes: dict, state: dict):
    """Place an ISA bubble on each equipment node for every synthesised `_instrument` word
    that instruments it (Level / Temperature / Dissolved-Oxygen / pH / Conductivity on the
    rearing tank; Level / Temperature / DO on the biofilter). De-duplicates by function so a
    node never carries two of the same bubble, and adds a low-level trip switch (LSL)
    alongside a tank LEVEL transmitter (the life-safety low-level interlock a RAS tank
    needs). Universal: reads the engine's own per-unit instrument words; keyed on the word
    tags, not a product class. Returns the set of (node_key, func) pairs placed (so the
    control-loop synthesis can find the DO / level instruments to wire)."""
    placed: set = set()
    by_node: dict[str, set] = {}
    # collect functions per node first (so we can add LSL only where a tank has LT).
    node_funcs: dict[str, list] = {}
    for parent_key, (tag, func) in _instr_words(state):
        nd = _node_for_parent(parent_key, nodes)
        if nd is None:
            continue
        node_funcs.setdefault(nd.key, [])
        if func not in by_node.setdefault(nd.key, set()):
            by_node[nd.key].add(func)
            node_funcs[nd.key].append((tag, func))
    for nkey, funcs in node_funcs.items():
        nd = nodes[nkey]
        existing = {i.func for i in nd.instruments}
        for tag, func in funcs:
            if func in existing:
                continue
            nd.instruments.append(Instr(tag=tag, func=func))
            existing.add(func)
            placed.add((nkey, func))
        # a tank/vessel carrying a LEVEL transmitter gets a low-level TRIP switch (LSL) —
        # the life-safety interlock (loss of level shuts the tank's make-up / trips alarms).
        if "level" in existing and nd.sym in (SYM_TANK, SYM_VESSEL, SYM_DRUM,
                                              SYM_COLUMN) and "level-low" not in existing:
            nd.instruments.append(Instr(tag=INSTR_LSL[0], func=INSTR_LSL[1]))
            existing.add("level-low")
            placed.add((nkey, "level-low"))
    return placed


# Destination patterns for the two life-safety control loops (universal, name-keyed): the
# DISSOLVED-OXYGEN loop modulates the oxygenation kit; the LEVEL loop opens the make-up /
# inlet feed. Matched against a node's key + label so the loop wires to the real equipment.
_O2_DEST_RE = re.compile(r"oxygen|\bo2\b|oxygenation|\blox\b|aeration", re.I)
_MAKEUP_DEST_RE = re.compile(
    r"make.?up|makeup|inlet|feed|new\s*water|top.?up|fresh\s*water|water\s*supply|"
    r"intake|reservoir|sump|head\s*tank", re.I)


def _find_node(nodes: dict, rx, exclude_keys=()):
    """First node whose key+label matches `rx` (not in exclude_keys), preferring the lowest
    flow column so the loop's destination is an upstream/early item where sensible."""
    cands = [nd for nd in nodes.values()
             if nd.key not in exclude_keys and rx.search(f"{nd.key} {nd.label}")]
    if not cands:
        return None
    return sorted(cands, key=lambda nd: nd.column)[0]


def _node_has_func(nd, func):
    return any(i.func == func for i in nd.instruments)


def _o2_dosing_fail_open(state: dict) -> bool:
    """True when the ledger marks the O₂ DOSING VALVE fail-state as FAIL-OPEN (the life-safety
    final element drives open on power/air loss so the fish never lose oxygen). Reads the
    contract o2_dosing_valve_fail_state (1 / 'fail_open' / 'open' = fail-open). Universal —
    keyed on the canonical fail-state quantity, never a class. Default False (fail-closed)."""
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        v = None
        if isinstance(q, dict):
            for k in ("o2_dosing_valve_fail_state", "oxygen_dosing_valve_fail_state",
                      "o2_valve_fail_state", "do_control_valve_fail_state"):
                if k in q:
                    vv = q[k]
                    v = vv.get("value") if isinstance(vv, dict) else vv
                    break
        if v is None:
            continue
        s = str(v).strip().lower()
        if s in ("1", "fail_open", "fail-open", "failopen", "open", "fo", "true", "normally_open"):
            return True
        try:
            if float(v) >= 1:
                return True
        except (TypeError, ValueError):
            pass
    return False


def _synthesise_control_loops(nodes: dict, lines: list, placed_instr: set,
                              o2_fail_open: bool = False):
    """Wire the two life-safety RAS control loops from the projected instruments to their
    final control elements, and put a flow transmitter (FT) on the MAIN recirculation line:

      • DISSOLVED-OXYGEN loop  — the DO analyser on the rearing tank modulates the
        OXYGENATION system (AC controller, dashed signal to an O2 feed control valve).
      • LEVEL loop             — the level transmitter on the tank opens the MAKE-UP /
        inlet water feed (LC controller, dashed signal to a make-up control valve).
      • FT on the main recirc line — a flow transmitter on the principal recirculation pipe.

    Universal: keyed on the instruments the engine actually synthesised (DO / level) + the
    destination equipment NAME, never a product class. Returns a list[ControlLoop]; empty
    when the design carries neither a DO nor a level instrument."""
    loops: list[ControlLoop] = []
    # the node(s) carrying the DO / level measurement (a tank / vessel with that bubble).
    do_node = next((nd for nd in nodes.values()
                    if _node_has_func(nd, "dissolved-oxygen")), None)
    lvl_node = next((nd for nd in nodes.values() if _node_has_func(nd, "level")), None)

    # --- DO → oxygenation loop ---
    if do_node is not None:
        o2_dest = _find_node(nodes, _O2_DEST_RE, exclude_keys={do_node.key})
        if o2_dest is not None:
            # the O₂ dosing final valve fails OPEN when the ledger says so (life-safety: the
            # valve drives open on power/air loss so dissolved oxygen is never starved).
            loops.append(ControlLoop(
                src_key=do_node.key, dst_key=o2_dest.key,
                measure_tag="AT", controller_tag="AC",
                label="DO control", dst_valve_tag=("FCV (FO)" if o2_fail_open else "FCV"),
                dst_fail_open=o2_fail_open))

    # --- level → make-up-water loop ---
    if lvl_node is not None:
        mu_dest = _find_node(nodes, _MAKEUP_DEST_RE,
                             exclude_keys={lvl_node.key})
        # if no explicit make-up node exists, the loop still reads correctly pointing back
        # at the tank's own inlet — draw it as a self-loop on the level node's make-up valve.
        dst = mu_dest.key if mu_dest is not None else lvl_node.key
        loops.append(ControlLoop(
            src_key=lvl_node.key, dst_key=dst,
            measure_tag="LT", controller_tag="LC",
            label="level → make-up", dst_valve_tag="FCV"))

    # --- FT on the MAIN recirculation line ---
    # pick the principal forward process line out of the tank (the recirc draw) — the
    # longest/earliest process line touching the level/DO tank, else the first process line.
    if lines:
        tank_key = (lvl_node or do_node).key if (lvl_node or do_node) else None
        main_line = None
        if tank_key is not None:
            for ln in lines:
                if ln.style == LINE_PROCESS and not ln.is_return and (
                        ln.from_key == tank_key or ln.to_key == tank_key):
                    main_line = ln
                    break
        if main_line is None:
            main_line = next((ln for ln in lines
                              if ln.style == LINE_PROCESS and not ln.is_return), None)
        if main_line is not None and not any(i.func == "flow"
                                             for i in main_line.instruments):
            main_line.instruments.append(Instr(tag="FT", func="flow", where="line"))
    return loops


# ── BoM → P&ID ancillary / packaged-system + field-device projection ─────────
# Statuses the engine stamps on a SYNTHESISED principal item (a packaged life-support
# system / actuator / utility) vs a sub-component or a routed connection.
_ANCILLARY_STATUS = {"SYSTEM", "UTILITY", "ACTUATOR", "INSTRUMENT", "BESPOKE",
                     "IDENTIFIED", "NOT FOUND"}
# Equipment-FAMILY nouns that do NOT, on their own, distinguish two machines: a
# 'Circulation Pump' (P-102) and a 'Heat Pump' (P-101 node) share only "pump"; a
# 'Heat Exchanger' (E-101) and a 'Heat Pump' node share only "heat". These must NOT
# let the duplicate-suppressor drop a distinct BoM item just because ONE generic family
# word collides with a node label. The duplicate skip therefore requires that the node
# overlap include at least one NON-generic (distinguishing) token. Universal — the same
# family nouns recur across every class's parallel trains; no per-class list.
_GENERIC_EQUIP_TOKENS = {
    "pump", "valve", "blower", "fan", "compressor", "exchanger", "heat", "tank",
    "vessel", "reservoir", "system", "unit", "filter", "skimmer", "skid", "module",
    "control", "reactor", "media", "cone", "column", "separator", "sump", "hopper",
    "silo", "plant", "package", "set",
}
# Map a BoM status / name to the register KIND + ISA symbol when drawn as a block.
_SAFETY_RE = re.compile(r"emergency|solenoid|fail.?open|esd|life.?saf|shutdown|fire", re.I)
_INSTR_NAME_RE = re.compile(
    r"transmitter|analy[sz]er|\bprobe\b|sensor|\bgauge\b|switch\b|detector|monitor|"
    r"meter\b", re.I)


def _ancillary_kind(name: str, status: str, typ: str) -> str:
    if _SAFETY_RE.search(name):
        return "safety"
    if typ == "instrument" or _INSTR_NAME_RE.search(name):
        return "instrument"
    if status == "UTILITY":
        return "utility"
    if typ in ("rotating", "exchanger", "separator", "vessel"):
        return typ
    return "system"


def _ancillary_sym(kind: str, typ: str) -> str:
    """The ISA symbol to draw an ancillary block with (only the principal equipment kinds
    get a real symbol; packaged systems/utilities draw as a generic block)."""
    if typ == "rotating":
        return SYM_PUMP
    if typ == "exchanger":
        return SYM_HX
    if typ == "separator":
        return SYM_DRUM
    if typ == "vessel":
        return SYM_VESSEL
    return SYM_GENERIC


def _tie_line_for(tag: str, name: str, route_lines: list, node_tags: set):
    """Find the route-manifest line that ties this BoM item into the process loop: a line
    whose from/to tag equals the item's tag, OR whose humanised from/to name matches the
    item name. Returns (line_number, other_endpoint_tag) or ('', '')."""
    nlow = _norm_tokens(name)
    for l in route_lines:
        ft = str(l.get("from_tag") or "")
        tt = str(l.get("to_tag") or "")
        ln = str(l.get("line_number") or "")
        if not ln:
            continue
        if tag and tag not in ("Y", "—", "SYS") and (ft == tag or tt == tag):
            other = tt if ft == tag else ft
            return ln, other
        # name match (the manifest often carries the humanised system name as the tag)
        if nlow and (_norm_tokens(ft) & nlow or _norm_tokens(tt) & nlow):
            other = tt if (_norm_tokens(ft) & nlow) else ft
            return ln, other
    return "", ""


def _norm_tokens(s: str) -> set:
    return {t for t in re.split(r"[^a-z0-9]+", (s or "").lower())
            if len(t) >= 3 and t not in ("the", "and", "for", "system", "unit", "plus",
                                         "with", "tank", "water")}


def _project_bom_ancillaries(state: dict, nodes: dict, out_dir) -> list:
    """Project every PRINCIPAL BoM item the topology spine omitted onto the P&ID as a
    register entry: the synthesised packaged life-support systems, the per-tank
    emergency-O₂ solenoid (life-safety final element), and field instruments not already
    mounted on a node. Each entry carries its tie-in line number (from the route manifest)
    so the connection is shown + checked off. Universal: reads the engine's OWN BoM rows,
    never a per-class list. Returns list[Ancillary], empty when state carries none."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list) or not rb:
        return []
    # tags + name-tokens already on the P&ID (topology nodes + their array tags + instruments)
    on_pid_tags: set = set()
    on_pid_name_toks: set = set()
    for nd in nodes.values():
        on_pid_tags.add(nd.tag)
        for t in (nd.array_tags or []):
            on_pid_tags.add(t)
        on_pid_name_toks |= _norm_tokens(nd.label)
    route_lines = _load_route_manifest(out_dir) if out_dir else []

    # The P&ID register shows the items a P&ID conventionally carries: process equipment
    # (vessel / rotating / exchanger / separator), the packaged ANCILLARY/UTILITY life-
    # support systems (feed / LOX / dosing / sludge / chilling / …, with their tie-in line),
    # in-line valves + the life-safety solenoid, and field instruments. Pure electrical
    # board kit (breaker / busbar / fuse / relay / SPD / contactor) belongs on the single-
    # line, and bulk structural / pipework items on the GA — so those are excluded here
    # (keeps the register authentic). Universal — keyed on the derived type, not the class.
    _EXCLUDE_NAME = re.compile(
        r"\bpipework\b|distribution manifold|support frame|structural frame|enclosure panel|"
        r"htu|ntu tool|signal conditioner|isolation device|interlock switch|main breaker|"
        r"distribution busbar|fuse holder|surge protect|power contactor|protective relay|"
        r"emergency stop|\bcontroller\b|communication gateway|i/o module|network switch|"
        r"controller power supply|local control panel", re.I)

    out: list = []
    seen_keys: set = set()
    for r in rb:
        if not isinstance(r, dict):
            continue
        status = str(r.get("status") or "")
        if status not in _ANCILLARY_STATUS:
            continue                       # SUB-COMPONENT / ROUTED — not a principal item
        tag = str(r.get("tag") or "").strip()
        req = str(r.get("requirement") or "")
        name = req.split("·")[0].strip()
        if not name or _EXCLUDE_NAME.search(name):
            continue
        typ = _classify_ancillary(name, tag)
        kind = _ancillary_kind(name, status, typ)
        # drop pure electrical board kit (it belongs on the single-line, not the P&ID).
        if typ == "electrical":
            continue
        # skip items already drawn on the P&ID spine (by tag or strong name overlap)
        if tag and tag in on_pid_tags:
            continue
        ntoks = _norm_tokens(name)
        overlap = ntoks & on_pid_name_toks
        # the principal equipment is already shown (same name on a node) ⇒ skip the
        # duplicate — but ONLY when (a) nearly all the item's tokens match a node AND
        # (b) the overlap carries a DISTINGUISHING (non-family-generic) token, so a lone
        # generic word ("pump", "heat") shared with an UNRELATED node never suppresses a
        # genuinely-distinct item (e.g. Circulation Pump vs the Heat Pump node). ALWAYS
        # keep the safety solenoid + field instruments regardless.
        if ntoks and len(overlap) >= max(1, len(ntoks) - 1) and \
                (overlap - _GENERIC_EQUIP_TOKENS) and \
                kind not in ("safety", "instrument"):
            continue
        key = (tag, name)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        duty = ""
        parts = [p.strip() for p in req.split("·")[1:] if p.strip()]
        if parts:
            duty = parts[0]
        tie_line, tie_to = _tie_line_for(tag, name, route_lines, on_pid_tags)
        try:
            qty = int(r.get("qty") or 1)
        except (TypeError, ValueError):
            qty = 1
        out.append(Ancillary(tag=tag or "—", name=name, kind=kind,
                             sym=_ancillary_sym(kind, typ), duty=duty,
                             tie_line=tie_line, tie_to=tie_to, qty=max(1, qty)))
    return out


# A per-culture-tank EMERGENCY-O₂ solenoid + diffuser: the LIFE-SAFETY final element that
# floods oxygen on a low-dissolved-oxygen trip and FAILS OPEN on power/air loss. Recognised
# from the BoM by a fail-open emergency-O₂ / emergency-aeration solenoid line.
_EMERG_O2_RE = re.compile(
    r"(emergency|backup|back.?up).{0,24}(o₂|o2|oxygen|aerat).{0,24}(solenoid|valve|diffuser)|"
    r"(solenoid|valve|diffuser).{0,24}(emergency|backup).{0,24}(o₂|o2|oxygen|aerat)", re.I)


def _emergency_o2_final_element(state: dict):
    """Return (tag, qty) for the fail-open per-tank emergency-O₂ solenoid in the BoM, or None.
    Data-driven: reads the engine's OWN requirementsBom — never a per-class assumption. Used
    to project the life-safety final element onto every culture tank's low-DO loop."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list):
        return None
    for r in rb:
        if not isinstance(r, dict):
            continue
        if str(r.get("status") or "") not in _ANCILLARY_STATUS:
            continue
        name = str(r.get("requirement") or "").split("·")[0].strip()
        if not name or not _EMERG_O2_RE.search(name):
            continue
        try:
            qty = max(1, int(r.get("qty") or 1))
        except (TypeError, ValueError):
            qty = 1
        return (str(r.get("tag") or "Y").strip() or "Y", qty)
    return None


def _classify_ancillary(name: str, tag: str) -> str:
    """A light classifier for an ancillary BoM item (mirrors the parts-ledger TYPE_RULES so
    the register's type column matches the ledger)."""
    blob = f"{name} {tag}".lower()
    if re.search(r"transmitter|analy[sz]er|\bprobe\b|sensor|\bgauge\b|switch\b|detector|"
                 r"monitor|meter\b", blob):
        return "instrument"
    if re.search(r"\bvalve\b|solenoid|actuator|damper", blob):
        return "valve"
    if re.search(r"transformer|switchgear|\bmcc\b|busbar|generator|genset|breaker|relay|"
                 r"\bups\b|surge|fuse", blob):
        return "electrical"
    if re.search(r"\bpump\b|blower|\bfan\b|compressor|skimmer|aerat", blob):
        return "rotating"
    if re.search(r"heat exchanger|heat pump|\bhex\b|chiller|\buv\b|ozone|steril|oxygenat|"
                 r"degas|makeup hex", blob):
        return "exchanger"
    if re.search(r"drum filter|screen|filter|clarifi|settl|cyclone|membrane|biofilter|"
                 r"\bmbbr\b|media", blob):
        return "separator"
    if re.search(r"\btank\b|vessel|reservoir|\bsump\b|column|reactor|silo|hopper|\blox\b|"
                 r"storage", blob):
        return "vessel"
    return "other"


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
# RETURN-LOOP INFERENCE  (universal — keyed on graph shape, NOT class name)
# ═══════════════════════════════════════════════════════════════════════════

# Signals in a topology edge's material_context that indicate the plant is a
# CLOSED RECIRCULATING LOOP — the fluid cycles rather than flowing once through.
_RECIRC_KEYWORDS = re.compile(
    r"recirculat|recirc|closed.?loop|closed.?circuit|return.*tank|"
    r"loop.*back|back.*to.*tank|return.*feed|return.*reactor",
    re.I,
)


def _infer_return_loops(
    proc_topo: list,
    col_of: dict,
    back_edges: set,
    loop_seq_start: int,
    route_manifest_lines: list,
) -> list:
    """Detect and synthesise RETURN / RECIRCULATION legs not explicit in the topology.

    Two universal detection paths (no class-name checks anywhere):

    Path A — route-manifest back-edge injection:
        The route-manifest sometimes carries inter-module fluid connections (e.g.
        'Protein Skimming → Rearing Tank') that the engineeringContract topology omits.
        For each fluid_loop / thermal edge in the manifest, fuzzy-match its from_tag /
        to_tag against the known topology node keys (token overlap ≥1).  If the matched
        'to' node sits at a LOWER or EQUAL flow-column than the matched 'from' node,
        it is a back-edge: manufacture a synthetic Line with is_return=True.

    Path B — closed-loop terminal-to-source synthesis:
        If ANY topology edge's material_context contains a recirculation keyword AND the
        forward chain has a clear TERMINAL node (the rightmost node with no outgoing
        forward edge among the main-chain nodes with the highest column) AND a clear
        SOURCE node (the node on the main chain with the lowest non-zero column that has
        at least one outgoing forward edge AND is not a pure feed / supply pseudo-node),
        synthesise a single return Line: terminal → source, labelled 'RECIRC RETURN'.

    Returns a list of synthetic Line objects (may be empty — once-through plants produce
    no return legs).  Existing back_edges already detected by _flow_layers are skipped
    to avoid duplication.
    """
    from collections import defaultdict

    if not col_of:
        return []

    node_keys = list(col_of.keys())
    n_toks = {k: _name_tokens(k) for k in node_keys}

    def _best_match(tag: str) -> Optional[str]:
        """Fuzzy-match a route-manifest tag to a topology node key by token overlap."""
        t_toks = _name_tokens(tag)
        # singularise trailing-s
        t_toks |= {t[:-1] for t in list(t_toks) if t.endswith("s") and len(t) > 3}
        best, best_score = None, 0
        for k in node_keys:
            kt = n_toks[k] | {t[:-1] for t in list(n_toks[k])
                               if t.endswith("s") and len(t) > 3}
            score = len(t_toks & kt)
            if score > best_score:
                best_score, best = score, k
        return best if best_score >= 1 else None

    synthetic: list[Line] = []
    seen_pairs: set = set(back_edges)   # don't duplicate what DFS already found

    # ---- forward-edge adjacency (for Path B terminal detection) ----
    fwd_succ: dict = defaultdict(list)
    for e in proc_topo:
        frm, to = e.get("from_part"), e.get("to_part")
        if frm and to and frm in col_of and to in col_of:
            if (frm, to) not in seen_pairs:
                if col_of[to] > col_of[frm]:   # only genuinely forward edges
                    fwd_succ[frm].append(to)

    # ──────────────────────────────────────────────
    # Path A: route-manifest back-edges
    # ──────────────────────────────────────────────
    rm_return_count = [0]   # mutable counter for line-number sequencing

    for rm_ln in route_manifest_lines:
        mech = rm_ln.get("mechanism") or ""
        if mech == "electrical_bus":
            continue                               # skip power feeders
        frm_tag = rm_ln.get("from_tag") or ""
        to_tag = rm_ln.get("to_tag") or ""
        frm_key = _best_match(frm_tag)
        to_key = _best_match(to_tag)
        if not frm_key or not to_key or frm_key == to_key:
            continue
        if (frm_key, to_key) in seen_pairs:
            continue                               # already have this edge
        frm_col = col_of.get(frm_key, 0)
        to_col = col_of.get(to_key, 0)
        if to_col < frm_col:                      # to-node is UPSTREAM ⇒ back-edge
            seen_pairs.add((frm_key, to_key))
            rm_return_count[0] += 1
            svc = _service_text(rm_ln.get("service") or "")
            dn = rm_ln.get("line_number", "")
            # extract DN from line_number if present (e.g. '201-PR-DN300')
            dn_m = re.search(r"DN\d+", dn or "", re.I)
            dn_str = dn_m.group(0).upper() if dn_m else ""
            svc_code = _service_code(frm_key, to_key, rm_ln.get("service") or "")
            number = f'{loop_seq_start + 900 + rm_return_count[0]}-{svc_code}-RETURN' + (
                f'-{dn_str}' if dn_str else '')
            synthetic.append(Line(
                from_key=frm_key, to_key=to_key,
                number=number, dn=dn_str,
                service=svc or "Recirculation return",
                detail="RECIRC RETURN",
                style=_line_style(mech, ""),
                is_return=True,
            ))

    # ──────────────────────────────────────────────
    # Path B: closed-loop terminal→source synthesis
    # ──────────────────────────────────────────────
    # Check if any topology edge announces the plant is a closed recirculating loop.
    is_recirc_plant = any(
        _RECIRC_KEYWORDS.search(e.get("material_context") or "")
        for e in proc_topo
    )
    if is_recirc_plant and not synthetic:
        # Find the TERMINAL node on the main forward chain: the node with the highest
        # column AND no outgoing forward edge.  (Pure side-feeds / pseudo-nodes at col=0
        # are excluded by requiring col > 0.)
        max_col = max((col_of[k] for k in node_keys if col_of[k] > 0), default=0)
        terminals = [k for k in node_keys
                     if col_of.get(k, 0) == max_col and not fwd_succ.get(k)]
        # Find the SOURCE node: the main-chain entry point (lowest col > 0, has fwd
        # successors, not a pure feed pseudo-node by name).
        main_chain_cols = sorted(set(
            col_of[k] for k in node_keys
            if col_of[k] > 0 and fwd_succ.get(k)
        ))
        sources = []
        if main_chain_cols:
            min_main_col = main_chain_cols[0]
            sources = [k for k in node_keys
                       if col_of.get(k, 0) == min_main_col and fwd_succ.get(k)
                       and not re.search(r"supply|feed|source", k, re.I)]
        if terminals and sources:
            terminal = terminals[0]
            source = sources[0]
            pair = (terminal, source)
            if pair not in seen_pairs:
                seen_pairs.add(pair)
                svc_code = _service_code(terminal, source, "recirculation return")
                number = f'{loop_seq_start + 990}-{svc_code}-RETURN'
                synthetic.append(Line(
                    from_key=terminal, to_key=source,
                    number=number, dn="",
                    service="Recirculation return",
                    detail="RECIRC RETURN",
                    style=LINE_PROCESS,
                    is_return=True,
                ))

    return synthetic


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
    # ---- PROJECT the engine's SYNTHESISED per-equipment instruments (the design's real
    #      LT / TT / DO / pH / conductivity on the tank + biofilter) onto the matching
    #      nodes as ISA bubbles + a tank low-level trip (LSL). This is the authoritative
    #      instrument set; the conventional pass above is only the fallback. ----
    placed_instr = _project_synth_instruments(nodes, state)
    # cap each node to a legible instrument fan (the real per-tank set is LT/LSL/TT/DO/pH +
    # conductivity — keep up to 6 so the life-safety + water-quality instruments all show).
    for nd in nodes.values():
        nd.instruments = nd.instruments[:6]
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

    # ---- load route-manifest for return-loop inference (optional, additive) ----
    route_manifest_lines: list = []
    if out_dir:
        route_manifest_lines = _load_route_manifest(out_dir)

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

    # ---- RETURN / RECIRCULATION LEGS (universal — graph-shape driven) ----
    # Detect back-edges that the topology omits (common when the engineering contract
    # models a once-through chain even though the physical plant is a closed loop) and
    # inject them as is_return=True Lines so the P&ID draws the return loop over the top.
    return_lines = _infer_return_loops(
        proc_topo=proc_topo,
        col_of=col_of,
        back_edges=back_edges,
        loop_seq_start=loop_seq,
        route_manifest_lines=route_manifest_lines,
    )
    # Only add a synthetic return line for nodes that actually exist in this P&ID so the
    # renderer never references a dangling key.
    node_key_set = set(nodes.keys())
    for rl in return_lines:
        if rl.from_key in node_key_set and rl.to_key in node_key_set:
            lines.append(rl)

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

    # ---- CONTROL LOOPS: wire the life-safety DO→O2 + level→make-up loops + a main-line
    #      FT from the projected instruments to their final control elements. The O₂ dosing
    #      final valve is drawn FAIL-OPEN when the ledger marks it so (life-safety). ----
    control_loops = _synthesise_control_loops(nodes, lines, placed_instr,
                                              o2_fail_open=_o2_dosing_fail_open(state))

    # ---- ANCILLARY / PACKAGED-SYSTEM + FIELD-DEVICE register: project every principal BoM
    #      item the topology spine omitted (synthesised life-support systems, the per-tank
    #      emergency-O₂ solenoid, field instruments) so the P&ID shows what the BoM holds. ---
    ancillaries = _project_bom_ancillaries(state, nodes, out_dir)

    notes = []
    if not schedule.get("rows"):
        notes.append("Line sizes inferred from process duties (connection schedule not "
                     "supplied); DN shown is indicative.")
    notes.append("Instrument bubbles + valves shown where the design schedule carries "
                 "them; loop numbers are auto-allocated placeholders.")
    if control_loops:
        notes.append("Control loops shown dashed: dissolved-oxygen → oxygenation and tank "
                     "level → make-up water (life-safety interlocks).")

    return Process(archetype=arch, nodes=list(nodes.values()), lines=lines,
                   power_note=power_note, notes=notes,
                   schedule_present=bool(schedule.get("rows")),
                   control_loops=control_loops, ancillaries=ancillaries,
                   emergency_o2=_emergency_o2_final_element(state),
                   emergency_o2_supply_kg_h=float(
                       _pid_quantity(state, "emergency_o2_supply_kg_h",
                                     "emergency_oxygen_supply_kg_h") or 0.0),
                   emergency_o2_buffer_kg=float(
                       _pid_quantity(state, "emergency_o2_buffer_kg",
                                     "emergency_oxygen_buffer_kg") or 0.0))


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
            f'<marker id="sig" markerWidth="9" markerHeight="9" refX="6" refY="3" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L7,3 L0,6 Z" fill="{ACCENT}"/></marker>'
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
    elif kind == "failopen":
        # solenoid-actuated, fail-OPEN (life-safety emergency-O₂): solenoid box marked 'S'
        # with the fail-action arrow (FO) so the reader sees it drives open on power/air loss.
        svg.line(cx, cy - s, cx, cy - s - 3, stroke=INK, width=1.3)
        svg.rect(cx - 5, cy - s - 11, 10, 8, stroke=INK, width=1.2, fill=FILL_BG)
        svg.text(cx, cy - s - 5, "S", size=7, anchor="middle", fill=INK)
        svg.text(cx + 8, cy - s - 4, "FO", size=6, anchor="start", weight="bold", fill=INK)
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


def _ancillary_register_height(proc: Process, ncols: int) -> float:
    """Height (px) the ancillary/field-device register block needs, or 0 when empty."""
    anc = proc.ancillaries
    if not anc:
        return 0.0
    systems = [a for a in anc if a.kind in ("system", "utility", "vessel", "rotating",
                                            "exchanger", "separator")]
    devices = [a for a in anc if a.kind in ("instrument", "safety", "valve")]
    rows = 0
    for grp in (systems, devices):
        if grp:
            rows += math.ceil(len(grp) / ncols)
    header = 26 + (18 if systems else 0) + (18 if devices else 0)  # block + sub heads
    return header + rows * 15 + 22


def _draw_ancillary_register(svg, proc: Process, x: float, y: float, w: float,
                             ncols: int) -> float:
    """Draw the PACKAGED / ANCILLARY SYSTEMS + FIELD DEVICES register: every principal BoM
    item the topology spine omitted, as a tagged table with each item's tie-in line — so the
    P&ID shows what the BoM contains + every connection is cross-referenced. Returns the
    bottom y. Universal, deterministic; nothing drawn when the design carries no ancillaries."""
    anc = proc.ancillaries
    if not anc:
        return y
    systems = [a for a in anc if a.kind in ("system", "utility", "vessel", "rotating",
                                            "exchanger", "separator")]
    devices = [a for a in anc if a.kind in ("instrument", "safety", "valve")]

    # panel frame
    h = _ancillary_register_height(proc, ncols)
    svg.rect(x, y, w, h, stroke=GRID_FAINT, width=1.2, fill=PANEL_BG, rx=4)
    svg.text(x + 12, y + 18, "ANCILLARY / PACKAGED SYSTEMS · FIELD DEVICES "
             "(projected from the bill of materials — tie-in line shown)",
             size=10.5, weight="bold", fill=EQ_INK)
    col_w = (w - 24) / max(1, ncols)
    cy = y + 30

    def _draw_group(title: str, items: list, cy: float) -> float:
        if not items:
            return cy
        cy += 16
        svg.text(x + 12, cy, title, size=9.5, weight="bold", fill=ACCENT)
        cy += 4
        per_col = math.ceil(len(items) / ncols)
        for i, a in enumerate(items):
            col = i // per_col
            row = i % per_col
            ix = x + 12 + col * col_w
            iy = cy + 12 + row * 15
            qn = f" ×{a.qty}" if a.qty > 1 else ""
            tie = f"  → {a.tie_line}" if a.tie_line else ""
            label = f"{a.tag}  {_short_anc_name(a.name)}{qn}"
            duty = (f" · {a.duty}" if a.duty else "")
            txt = (label + duty)[:46] + tie
            svg.text(ix, iy, txt, size=8.0, anchor="start", fill=INK, mono=True)
        return cy + 12 + per_col * 15

    cy = _draw_group("Packaged & ancillary systems", systems, cy)
    cy = _draw_group("Field instruments & safety devices", devices, cy)
    return y + h


def _short_anc_name(name: str, maxlen: int = 26) -> str:
    """Trim a register item's name to fit the table cell (keeps the head)."""
    n = re.sub(r"\s*\([^)]*\)\s*$", "", name or "").strip()   # drop a trailing (...) note
    return n if len(n) <= maxlen else n[:maxlen - 1] + "…"


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
    has_return = any(getattr(ln, 'is_return', False) for ln in proc.lines)
    col_pitch = 246 if has_array else 210
    row_pitch = 168
    margin_l = 70
    # headroom for parallel ghost stacks (+70) and/or return-leg banner above (+60)
    margin_top = 150
    if has_array:
        margin_top += 70
    if has_return:
        margin_top = max(margin_top, 230)   # return loop needs clearance above equipment
    title_h = 150
    legend_w = 250

    diagram_w = margin_l * 2 + (ncol - 1) * col_pitch + EQ_W
    width = max(diagram_w + legend_w, 1180)
    body_h = margin_top + (max_stack - 1) * row_pitch + (340 if has_array else 220)
    # the ancillary / field-device register sits in a full-width band below the equipment,
    # above the title block; size it to the page width (3 columns on a standard sheet).
    reg_cols = 3
    reg_h = _ancillary_register_height(proc, reg_cols)
    reg_gap = 24 if reg_h else 0
    height = body_h + reg_h + reg_gap + title_h
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

    # ----- CONTROL LOOPS (life-safety DO→O2 + level→make-up) — drawn AFTER the equipment
    #       so the controller bubble + dashed signal lines sit on top, routed in the band
    #       BELOW the equipment row so they read clearly as control (not process) lines. ---
    band_bottom = height - title_h - reg_h - reg_gap - 30
    _draw_control_loops(svg, proc, centre, ports, band_bottom)

    # ----- LIFE-SAFETY EMERGENCY-O₂ FINAL ELEMENT on the culture tank (low-DO → fail-open
    #       solenoid → O₂ diffuser) — the per-tank element the BoM carries on all N tanks. ---
    _draw_emergency_o2_final_element(svg, proc, centre, ports)

    # ----- ANCILLARY / FIELD-DEVICE REGISTER (projected from the BoM) -----
    if reg_h:
        reg_y = height - title_h - reg_h - reg_gap + reg_gap / 2
        _draw_ancillary_register(svg, proc, 40, reg_y, width - 80, reg_cols)

    # ----- LEGEND + power note -----
    legend_x = width - legend_w + 10
    legend_bottom = _draw_legend(svg, legend_x, margin_top + 6, legend_w - 30)
    if proc.power_note:
        _draw_power_note(svg, legend_x, legend_bottom + 16, legend_w - 30,
                         proc.power_note)

    # ----- TITLE BLOCK -----
    _draw_title_block(svg, proc, width, height, title_h)
    return svg.render()


def _draw_control_loops(svg, proc, centre, ports, band_y):
    """Draw each control loop as: a measurement bubble on the SOURCE node, a dashed SIGNAL
    line down to a controller bubble on a routing rail at `band_y`, across to the
    DESTINATION node, up to a final control valve (FCV) on the destination, with arrows so
    the loop reads measurement → controller → final element. Dashed thin lines (ISA signal)
    distinguish them unmistakably from the solid process pipes. Routed below the equipment
    band so they never overlap the process train. Deterministic; geometry from the node
    centres + ports already computed."""
    loops = getattr(proc, "control_loops", None) or []
    if not loops:
        return
    # stagger each loop's routing rail so two loops don't share a line, and OFFSET the
    # measurement drop to the LEFT of the source node so it clears the centred array
    # tie-in fan that drops straight below an N-array tank.
    for li, lp in enumerate(loops):
        if lp.src_key not in centre or lp.dst_key not in centre:
            continue
        rail_y = band_y - li * 34
        sp = ports[lp.src_key]
        dp = ports[lp.dst_key]
        sleft_x, sy = sp["left"]
        sx, sbot = sp["bottom"]
        dx, dbot = dp["bottom"]
        # measurement bubble below-LEFT of the source node (clear of the tie-in fan trunk).
        m_x = sx - 28
        m_y = sbot + 26
        svg.line(sx - 10, sbot, m_x, m_y - 13, stroke=ACCENT, width=1.0, dash="2,2")
        _sym_instrument(svg, m_x, m_y, lp.measure_tag, where="equipment")
        # signal from measurement down to the rail
        svg.line(m_x, m_y + 13, m_x, rail_y, stroke=ACCENT, width=1.1, dash="4,3")
        # controller bubble on the rail, midway between the measurement and destination
        cx_ctrl = (m_x + dx) / 2
        svg.line(m_x, rail_y, cx_ctrl - 13, rail_y, stroke=ACCENT, width=1.1, dash="4,3")
        _sym_controller(svg, cx_ctrl, rail_y, lp.controller_tag)
        svg.text(cx_ctrl, rail_y + 26, lp.label, size=7.6, anchor="middle", fill=MUTED)
        # controller out to under the destination, then up to the final control valve.
        # offset the riser slightly when the destination IS the source (self-loop on the
        # tank's own make-up inlet) so it doesn't sit on the measurement drop.
        riser_x = dx + (20 if lp.dst_key == lp.src_key else 0)
        svg.add(f'<path d="M {cx_ctrl + 13:.1f} {rail_y:.1f} L {riser_x:.1f} {rail_y:.1f} '
                f'L {riser_x:.1f} {dbot + 18:.1f}" fill="none" stroke="{ACCENT}" '
                f'stroke-width="1.1" stroke-dasharray="4,3" marker-end="url(#sig)"/>')
        # final control valve on the destination's feed — drawn FAIL-OPEN (solenoid + FO
        # action) when the ledger marks this dosing valve fail-open (life-safety), else a
        # plain modulating control valve.
        _sym_valve(svg, riser_x, dbot + 12,
                   kind="failopen" if getattr(lp, "dst_fail_open", False) else "control")
        if lp.dst_valve_tag:
            svg.text(riser_x + 11, dbot + 10, lp.dst_valve_tag, size=7.5, anchor="start",
                     fill=MUTED)


def _draw_emergency_o2_final_element(svg, proc, centre, ports):
    """Project the fail-open per-tank EMERGENCY-O₂ SOLENOID + DIFFUSER — the LIFE-SAFETY
    final element on the low-dissolved-oxygen loop — onto the culture tank as a drawn ISA
    final element (low-DO switch → fail-open solenoid → O₂ diffuser into the tank), annotated
    with its per-tank quantity so every one of the N tanks is shown to carry it. Drawn on the
    RIGHT face of the DO tank, clear of the make-up control loop (which drops below it).
    Deterministic; no-op when the design carries no emergency-O₂ element or no DO tank."""
    eo = getattr(proc, "emergency_o2", None)
    if not eo:
        return
    tag, qty = eo
    # the culture tank carrying the dissolved-oxygen measurement (the array node).
    tank = next((nd for nd in proc.nodes if _node_has_func(nd, "dissolved-oxygen")), None)
    if tank is None or tank.key not in ports:
        tank = next((nd for nd in proc.nodes if nd.sym == SYM_TANK), None)
    if tank is None or tank.key not in ports:
        return
    rightx, ry = ports[tank.key]["right"]
    # low-DO switch bubble (ASL), a short trip lead to the fail-open solenoid, then a stub
    # diffuser arrow back into the tank — the standard emergency-oxygen final-element group.
    sx = rightx + 30
    sw_y = ry - 26
    _sym_instrument(svg, sx, sw_y, "AS", where="equipment")     # low-DO (AS = analysis switch)
    svg.text(sx, sw_y - 17, "low-DO", size=6.6, anchor="middle", fill=MUTED)
    vx, vy = sx, ry
    svg.line(sx, sw_y + 13, vx, vy - 8, stroke=INK, width=1.1, dash="4,3")  # trip signal
    _sym_valve(svg, vx, vy, kind="failopen")
    # DEDICATED EMERGENCY-O₂ SUPPLY LINE feeding the fail-open solenoid from the RIGHT (a
    # separate buffered O₂ supply, distinct from the routine LOX dosing) — drawn as an
    # incoming process line with an off-page supply connector + the supply rate / buffer the
    # ledger carries, so the life-safety O₂ path is explicit on the sheet.
    sup_x = vx + 64
    svg.add(f'<line x1="{sup_x:.1f}" y1="{vy:.1f}" x2="{vx + 8:.1f}" y2="{vy:.1f}" '
            f'stroke="{PROC_INK}" stroke-width="1.6" marker-end="url(#flow)"/>')
    _sym_offpage(svg, sup_x + 12, vy)
    sup_bits = []
    if getattr(proc, "emergency_o2_supply_kg_h", 0):
        sup_bits.append(f"{proc.emergency_o2_supply_kg_h:g} kg/h")
    if getattr(proc, "emergency_o2_buffer_kg", 0):
        sup_bits.append(f"{proc.emergency_o2_buffer_kg:g} kg buffer")
    if sup_bits:
        svg.text(sup_x + 2, vy - 6, "emergency O₂ supply", size=6.4, anchor="middle",
                 fill=MUTED)
        svg.text(sup_x + 2, vy + 16, " · ".join(sup_bits), size=6.4, anchor="middle",
                 fill=MUTED)
    # O₂ diffuser stub from the solenoid back into the tank (the bubble diffuser in the tank).
    svg.add(f'<line x1="{vx - 8:.1f}" y1="{vy:.1f}" x2="{rightx + 4:.1f}" y2="{vy:.1f}" '
            f'stroke="{PROC_INK}" stroke-width="1.6" marker-end="url(#flow)"/>')
    qn = f" ×{qty}" if qty > 1 else ""
    svg.text(vx + 11, vy + 3, f"{tag}{qn}", size=7.6, anchor="start", weight="bold", fill=INK)
    svg.text(vx + 11, vy + 13, "emergency O₂ (fail-open)", size=6.6, anchor="start", fill=MUTED)


def _sym_controller(svg, cx, cy, tag):
    """An ISA CONTROLLER bubble — a circle with a square box around it (the standard
    'shared display / DCS controller' tag), carrying the loop function letters."""
    r = 13
    svg.rect(cx - r, cy - r, 2 * r, 2 * r, stroke=ACCENT, width=1.3, fill=FILL_BG)
    svg.circle(cx, cy, r, stroke=ACCENT, width=1.6, fill=FILL_BG)
    svg.text(cx, cy + 3, tag[:2], size=8.5, anchor="middle", weight="bold", fill=ACCENT)
    return r


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
        # recycle / return: leave 'top', go UP above the equipment row, across, down into
        # 'top' of target — so the return loop is routed ABOVE the main equipment band and
        # reads unmistakably as a closing loop, not a forward pipe.
        x0, y0 = pf["top"]
        x1, y1 = pt["top"]
        # Use a larger clearance for inferred recirc-return legs (detail="RECIRC RETURN")
        # so they sit well above any array ghost stacks or instrument bubbles.
        clearance = 90 if ln.detail == "RECIRC RETURN" else 56
        up = min(y0, y1) - clearance
        pts = [(x0, y0), (x0, up), (x1, up), (x1, y1)]
        _polyline(svg, pts, stroke, lw, dash, marker)
        mid_x = (x0 + x1) / 2
        _line_tag(svg, ln, mid_x, up, stroke, above=True)
        # For inferred recirc-return legs draw a bold "RECIRC RETURN" banner above the
        # line number so the return loop is visually unmistakable.
        if ln.detail == "RECIRC RETURN":
            banner_y = up - 22
            _draw_recirc_banner(svg, mid_x, banner_y, ln)
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


def _draw_recirc_banner(svg, cx, cy, ln: "Line"):
    """Draw a visually prominent 'RECIRC RETURN' banner above the return-leg line number.
    A filled pill badge with the label + the line's service hint, so the reader immediately
    sees that this upper route is a recirculation / return leg, not a forward process line.
    Deterministic position: centred at (cx, cy), above the horizontal run."""
    # Pill badge background
    label = "RECIRC RETURN"
    pill_w = 104
    pill_h = 16
    px = cx - pill_w / 2
    py = cy - pill_h / 2
    svg.rect(px, py, pill_w, pill_h, stroke=PROC_INK, width=1.2,
             fill="#dde8f5", rx=pill_h / 2)
    svg.text(cx, cy + 4, label, size=8.0, anchor="middle",
             weight="bold", fill=EQ_INK)
    # Service hint below badge (if available)
    if ln.service and ln.service.lower() not in ("recirculation return",):
        svc = _short_service(ln.service)
        if svc:
            svg.text(cx, cy + pill_h + 4, svc, size=7.0, anchor="middle", fill=MUTED)


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
            ("REV", _tb.REV),
            ("DATE", proc.date or "—  "),
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
    # populate the title-block issue date deterministically from the run's artifacts.
    proc.date = _run_issue_date(out_dir)
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
