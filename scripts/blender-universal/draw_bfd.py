#!/usr/bin/env python3
"""draw_bfd.py — UNIVERSAL Block-Flow Diagram (BFD) generator.

The EXECUTIVE-LEVEL companion to draw_pid.py (the detailed Piping & Instrumentation
Diagram).  Same contract: it does NOT recompute anything and it does NOT touch
build_universal_scene.py — it CONSUMES that generator's outputs + the archetype state and
PROJECTS the modelled PROCESS into a clean, readable Block-Flow Diagram: the major
equipment laid out in PROCESS ORDER left→right, the main process streams drawn as labelled
arrows, recycle loops dashed, feeds in (left) and products out (right) styled distinctly.

WHY THIS EXISTS:  the Part-1 "Process flow" page in every dossier was a degraded box-list
for every product class except CO₂-mineralisation.  The BFD is the universal fix — a
topology-driven block diagram an executive judges "yes, this is the plant", derived purely
from the as-modelled flow graph (NOT the jumbled module-storage order).

INPUTS (read-only):
  <state.json>                       — the archetype state.  Read for:
        (1) engineeringContract.topology (or orchestratorContract.topology) — the PROCESS
            FLOW GRAPH: each edge = from_part → to_part + mechanism (fluid_loop / thermal /
            electrical_bus) + material_context (the SERVICE) + required_value/unit (the
            carried duty).  This is the SPINE of the BFD.
        (2) engineeringContract.quantities — the headline flows (CO₂ ~1000 kg/h, H₂
            ~140 kg/h, SAF ~125 kg/h …) used to label the BOUNDARY feed/product arrows.
        (3) moduleDecomposition — the equipment BoM words, used to resolve each topology
            node to its real human equipment name (name_human) for the box caption.
  <out>/route-manifest.json          — OPTIONAL: the routed lines (line_number / from_tag /
        to_tag / service / size_label).  When present the stream labels carry the routed
        line number + service.
  <out>/connection-schedule.json     — OPTIONAL: the sized runs (carried_rating / phase).
        When present each main stream is labelled with the as-modelled mass flow.

PIPELINE:
  1. reuse draw_pid.reconstruct_process() — the SINGLE source of truth for the equipment
     list, tags, line numbers + services + recycle back-edges (byte-identical to the P&ID).
  2. derive_block_order()  — re-layer the equipment in TRUE PROCESS ORDER.  The topology
     graph is often DISCONNECTED (the recycle, upgrading + disposal sub-trains have no
     explicit edge to the main feed→reactor→separation spine), so a naive longest-path
     layering scrambles the BFD (it drops the fractionation column next to the feed
     compressors).  derive_block_order() runs the longest-path layering WITHIN each
     connected component, then orders the COMPONENTS by a process-role rank (feed →
     reaction → separation → recycle → upgrading → product → disposal/utility) and
     concatenates them left→right so the diagram reads as one plant train.
  3. build_bfd_svg()       — draw clean labelled blocks + arrowed streams (no instrument
     bubbles, no valves), boundary feeds/products styled, title block + note.
  4. rasterise()           — SVG → PNG (reuses draw_pid.rasterise; absolute file:// path).

OUTPUTS:
  <out>/drawings/block-flow-diagram.svg
  <out>/drawings/block-flow-diagram.png

Run (via the repo venv):
  ../../.venv/bin/python scripts/blender-universal/draw_bfd.py out/oxccu-saf-v21
  ../../.venv/bin/python scripts/blender-universal/draw_bfd.py out/co2-caspar-fix3 out/co2-caspar-fix3/state.json

Pure Python stdlib + (optional) a rasteriser on PATH (Chrome fallback).  No Blender import.
"""
from __future__ import annotations

import html
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── reuse the P&ID's canonical reconstruction + rasteriser (single source of truth) ──
sys.path.insert(0, str(Path(__file__).resolve().parent))
import draw_pid as PID  # noqa: E402
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)

# Deterministic title-block issue date for THIS run (YYYY-MM-DD), set by
# generate_bfd() from the run's own artifacts; '' until set (block shows '—').
_ISSUE_DATE = ""


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — the reconstructed block-flow
# ═══════════════════════════════════════════════════════════════════════════

# Stream style kinds.
STREAM_PROCESS = "process"       # main process fluid (heavy solid arrow)
STREAM_THERMAL = "thermal"       # heating / cooling / steam (warm, dashed arrow)
STREAM_RECYCLE = "recycle"       # recycle / return loop (dashed, routed over the top)
STREAM_INFERRED = "inferred"     # a process-continues link the topology omits (light dashed)

# A block that exists in the BoM (the ledger) but has no topology edge — principal
# equipment the executive must see is present even though it isn't on a process line
# (standby generator, dosing skid, feed silo). Drawn in a distinct supporting band.
SYM_SUPPORTING = "supporting"

# Boundary kinds (a feed entering or a product leaving the battery limit).
BND_FEED = "feed"
BND_PRODUCT = "product"


@dataclass
class Block:
    """A major equipment unit = one labelled box."""
    key: str                     # the topology node key
    tag: str                     # equipment tag from the P&ID (e.g. 'R-102')
    label: str                   # real human equipment name (name_human)
    sym: str                     # the P&ID symbol class (drives the role/colour accent)
    col: int = 0                 # process-flow column (0 = feed end), left→right
    role_rank: int = 5           # process-role rank (feed=0 … disposal=9) for ordering
    # qty-N array (universal): when the topology collapsed N identical parallel units into
    # this block (RAS rearing tanks = 10), array_n is the real count from the parts-manifest
    # so the BFD box reads 'Rearing Tank ×10' + shows a stacked-array motif.
    array_n: int = 1
    array_tags: list = field(default_factory=list)


@dataclass
class Stream:
    """A process / thermal / recycle / inferred stream between two blocks."""
    from_key: str
    to_key: str
    number: str = ""             # routed line number (mirrors the P&ID), if any
    service: str = ""            # short humanised service phrase
    qty: str = ""                # a key quantity ('~1000 kg/h CO₂', 'syncrude'), honest-only
    style: str = STREAM_PROCESS


@dataclass
class Boundary:
    """A feed entering (left) or a product leaving (right) the battery limit."""
    kind: str                    # 'feed' | 'product'
    block_key: str               # the block it attaches to
    label: str                   # 'CO₂ feed' / 'SAF + naphtha'
    qty: str = ""                # '~1000 kg/h' (from the contract quantities), honest-only


@dataclass
class BlockFlow:
    archetype: str
    blocks: list[Block]
    streams: list[Stream]
    boundaries: list[Boundary] = field(default_factory=list)
    power_note: str = ""
    notes: list[str] = field(default_factory=list)
    has_recycle: bool = False
    has_inferred: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# PROCESS-ROLE CLASSIFICATION  (rank a node along the feed→product spine)
# ═══════════════════════════════════════════════════════════════════════════

# Ranks order the DISCONNECTED components of the topology along the process spine so the
# BFD reads feed → reaction → separation → recycle → upgrading → product, regardless of how
# fragmented the as-modelled graph is.  First match wins.  Tuned against the e-fuel SAF +
# CO₂-mineralisation trains but expressed in generic process vocabulary so an unseen
# archetype still sorts sensibly.
_ROLE_PATTERNS = [
    # 0 — FEED / battery-limit inlet (feed compressors, feed pumps, supply headers).
    (re.compile(r"feed|inlet|supply|make.?up|charge|intake|receiv|"
                r"flue.?gas_blower|flue.?gas_fan", re.I), 0, "feed"),
    # 1 — feed conditioning / pre-treatment (pre-heat, dryer, guard bed, blend).
    (re.compile(r"pre.?heat|preheater|guard_bed|drier|dryer|conditioning|"
                r"blend|mixer|saturat", re.I), 1, "conditioning"),
    # 2 — REACTION / conversion core (reactor, synthesis, contactor, absorber, carbonation).
    (re.compile(r"reactor|synthesis|absorber|contactor|carbonat|"
                r"crystallis|crystalliz|converter|reformer|electrolys", re.I), 2, "reaction"),
    # 3 — primary heat recovery off the reactor (steam-raising, waste-heat boiler).
    (re.compile(r"steam_generator|waste_heat|boiler|economiser|economizer|"
                r"reboiler|quench", re.I), 3, "heat-recovery"),
    # 4 — SEPARATION (separator, flash, knock-out, drum, decanter, filter, stripper).
    (re.compile(r"separator|flash|knock.?out|ko_drum|\bdrum\b|decanter|"
                r"coalesc|demister|filter|stripper|three_phase|3phase|2phase", re.I),
     4, "separation"),
    # 5 — RECYCLE / return (recycle compressor, recycle pump, return, tail-gas loop).
    (re.compile(r"recycle|return|tail.?gas|loop|recompress", re.I), 5, "recycle"),
    # 6 — DISPOSAL / abatement / utility sinks (oxidiser, flare, vent, purge, effluent).
    #     Ranked BEFORE upgrading + product so the abatement branch (which taps off
    #     mid-process, right at the recycle) does NOT land to the RIGHT of the finished
    #     product — the product is always the right-hand climax of the diagram.
    (re.compile(r"oxidis|oxidiz|flare|incinerat|vent|purge|abatement|"
                r"effluent|disposal|waste|scrub_off", re.I), 6, "disposal"),
    # 7 — UPGRADING / refining (fractionation, distillation, hydrocrack, isomerise, column).
    (re.compile(r"fractionat|distillat|hydrocrack|hydrotreat|isomeris|"
                r"isomeriz|refin|upgrad|rectif|\bcolumn\b", re.I), 7, "upgrading"),
    # 8 — heat rejection / cooling on the product side (condenser, cooler, chiller).
    (re.compile(r"condenser|cooler|chiller|cold.?box|cryo", re.I), 8, "cooling"),
    # 9 — PRODUCT / storage / export (storage tank, product, export, loading, gantry).
    (re.compile(r"storage|\btank\b|product|export|loading|gantry|dispatch|"
                r"reservoir|bottling", re.I), 9, "product"),
]


def _role_rank(key: str, label: str, sym: str) -> tuple[int, str]:
    """Rank a node along the process spine (0=feed … 9=disposal) from its key + name.
    Falls back to a symbol-class heuristic, then a neutral mid rank."""
    blob = f"{key} {label}"
    for rx, rank, name in _ROLE_PATTERNS:
        if rx.search(blob):
            return rank, name
    # symbol-class fallback (when the name carries no role keyword).
    sym_rank = {
        PID.SYM_COMPRESSOR: 0, PID.SYM_PUMP: 0, PID.SYM_FIRED: 3,
        PID.SYM_DRUM: 4, PID.SYM_HX: 3, PID.SYM_COLUMN: 7,
        PID.SYM_TANK: 9, PID.SYM_VESSEL: 4, PID.SYM_OFFPAGE: 6,
    }.get(sym)
    if sym_rank is not None:
        return sym_rank, "process"
    return 5, "process"


# ═══════════════════════════════════════════════════════════════════════════
# PROCESS-ORDER DERIVATION  (true left→right block order over a disconnected graph)
# ═══════════════════════════════════════════════════════════════════════════

def _forward_layers(node_keys, proc_edges, back_edges):
    """Longest-path depth on the FORWARD edges (back/recycle edges excluded), per the
    standard layered-DAG layout.  Returns {key: layer} where a source (no forward
    predecessor) sits at layer 0 and each item is one deeper than its deepest feeder."""
    fpred = defaultdict(list)
    seen = set()
    nodeset = set(node_keys)
    for a, b in proc_edges:
        if (a, b) in back_edges or a == b or a not in nodeset or b not in nodeset:
            continue
        if (a, b) in seen:
            continue
        seen.add((a, b))
        fpred[b].append(a)
    layer: dict = {}

    def _depth(u, stack=frozenset()):
        if u in layer:
            return layer[u]
        if u in stack:                       # safety against any residual cycle
            return 0
        stack = stack | {u}
        ps = fpred.get(u, [])
        d = 0 if not ps else 1 + max(_depth(p, stack) for p in ps)
        layer[u] = d
        return d

    for k in node_keys:
        _depth(k)
    return layer


def _components(node_keys, proc_edges, back_edges):
    """Weakly-connected components over the FORWARD edges (recycle edges still link a
    component so a recycle loop stays in ONE component, not split off).  Returns
    {key: component_id}."""
    parent = {k: k for k in node_keys}

    def _find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def _union(a, b):
        ra, rb = _find(a), _find(b)
        if ra != rb:
            parent[ra] = rb

    nodeset = set(node_keys)
    for a, b in proc_edges:                  # back-edges INCLUDED for connectivity
        if a in nodeset and b in nodeset:
            _union(a, b)
    comp: dict = {}
    for k in node_keys:
        comp[k] = _find(k)
    return comp


def derive_block_order(proc) -> tuple[dict, dict]:
    """Assign every block a TRUE process column (0 = feed end), left→right, robust to a
    disconnected topology.

    Strategy:
      1. recover the forward edges + recycle back-edges from the reconstructed Process
         (the P&ID already flagged is_return on the recycle lines).
      2. longest-path layer WITHIN each weakly-connected component (the main spine lays out
         correctly: feeds → reactor → separator …).
      3. give each COMPONENT a process-role rank = the MINIMUM role rank of its members
         (a component containing the reactor anchors at 'reaction'; the lone
         fractionation→storage component anchors at 'upgrading'; purge→oxidiser at
         'disposal').  Order the components by (rank, first-appearance) and lay them out
         left→right by concatenating their internal layer spans — so the BFD reads as one
         plant train even though the graph is in pieces.

    Returns (col_of: {key:int}, role_of: {key:str})."""
    keys = [nd.key for nd in proc.blocks]
    edges = [(s.from_key, s.to_key) for s in proc._all_edges]
    back_edges = {(s.from_key, s.to_key) for s in proc._all_edges if s.style == STREAM_RECYCLE}

    layer = _forward_layers(keys, edges, back_edges)
    comp = _components(keys, edges, back_edges)

    # per-node role rank (also returned for styling / boundary detection).
    role_rank = {}
    role_name = {}
    for nd in proc.blocks:
        r, rn = _role_rank(nd.key, nd.label, nd.sym)
        role_rank[nd.key] = r
        role_name[nd.key] = rn

    # component anchor rank = the MIN role rank of its members (its earliest process role),
    # tie-broken by the component's earliest first-appearance index so order is stable.
    appear = {k: i for i, k in enumerate(keys)}
    comp_members = defaultdict(list)
    for k in keys:
        comp_members[comp[k]].append(k)
    comp_rank = {}
    comp_first = {}
    for cid, members in comp_members.items():
        comp_rank[cid] = min(role_rank[m] for m in members)
        comp_first[cid] = min(appear[m] for m in members)

    # order components along the spine, then concatenate their internal layer spans.
    comp_order = sorted(comp_members, key=lambda c: (comp_rank[c], comp_first[c]))
    col_of: dict = {}
    base = 0
    for cid in comp_order:
        members = comp_members[cid]
        local_max = max(layer[m] for m in members)
        for m in members:
            col_of[m] = base + layer[m]
        base += local_max + 1

    # compress to contiguous columns (0,1,2,… with no gaps) for a tidy ladder.
    used = sorted(set(col_of.values()))
    remap = {c: i for i, c in enumerate(used)}
    col_of = {k: remap[v] for k, v in col_of.items()}
    return col_of, role_name


# ═══════════════════════════════════════════════════════════════════════════
# QUANTITY / SERVICE / BOUNDARY extraction
# ═══════════════════════════════════════════════════════════════════════════

# Map a service/material-context blob → the headline contract-quantity keys to pull a flow
# from, and the human fluid name to show on a BOUNDARY arrow.  Honest-only: we only ever
# surface a value that EXISTS in the contract.quantities; never a fabricated number.
def _fmt_qty(q: dict) -> str:
    """Format a contract quantity dict {value, unit} into a compact label ('~1000 kg/h')."""
    if not isinstance(q, dict):
        return ""
    v = q.get("value")
    u = q.get("unit") or ""
    if v is None:
        return ""
    try:
        fv = float(v)
    except (TypeError, ValueError):
        return str(v)
    if abs(fv) >= 1000 and fv == int(fv):
        num = f"{int(fv):,}"
    elif fv == int(fv):
        num = f"{int(fv)}"
    else:
        num = f"{fv:g}"
    return f"~{num} {u}".strip()


def _quantities(state: dict) -> dict:
    for ck in ("engineeringContract", "orchestratorContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict) and q:
            return q
    return {}


def _qty_from_source(frm: str, mechanism_thermal: bool, quantities: dict) -> str:
    """HONEST headline flow for a stream, keyed by the SOURCE EQUIPMENT that produces it
    (NOT by keyword-scanning the blended service sentence — a CO₂ feed line whose context
    reads 'CO₂ … blended with H₂ …' must NOT borrow H₂'s flow, and a tail-gas recycle line
    that mentions a 'small purge' must NOT borrow the purge flow).  Only a quantity that
    UNAMBIGUOUSLY belongs to the source is returned; otherwise '' (the caller shows the
    fluid name instead).  This is the anti-fabrication guard."""
    f = (frm or "").lower()
    if mechanism_thermal:
        # a thermal/steam tie-line carries the exotherm duty (a real contract quantity).
        for qk in ("ft_exotherm_kw",):
            if qk in quantities:
                return _fmt_qty(quantities[qk])
        return ""
    # tokenise the SOURCE-equipment tag (underscore/space separated) and key off its tokens
    # — NOT a substring scan of the blended service sentence (which is what borrowed H₂'s
    # flow onto the CO₂ line and the purge flow onto the recycle line).
    toks = set(re.split(r"[_\s]+", f))
    if "co2" in toks and "co2_feed_kg_h" in quantities:
        return _fmt_qty(quantities["co2_feed_kg_h"])
    if (toks & {"h2", "hydrogen"}) and "h2_feed_kg_h" in quantities:
        return _fmt_qty(quantities["h2_feed_kg_h"])
    if "purge" in toks and "purge_flow_kg_h" in quantities:
        return _fmt_qty(quantities["purge_flow_kg_h"])
    if (toks & {"fractionation", "distillation", "upgrading", "saf", "product"}) and \
            "saf_output_kg_h" in quantities:
        return _fmt_qty(quantities["saf_output_kg_h"])
    return ""


def _route_index(out_dir: str) -> dict:
    """Map (from_tag, to_tag) → route-manifest line entry, for the routed line number +
    service text (the BFD mirrors the P&ID/route line numbers)."""
    idx = {}
    p = Path(out_dir) / "route-manifest.json"
    if p.is_file():
        try:
            data = json.loads(p.read_text())
            for ln in (data.get("lines") or []):
                ft, tt = ln.get("from_tag"), ln.get("to_tag")
                if ft and tt:
                    idx[(ft, tt)] = ln
        except Exception:
            pass
    return idx


def _stream_qty(service: str, frm: str, to: str, quantities: dict,
                is_thermal: bool) -> str:
    """A concise, HONEST key quantity for an INTERNAL stream label.

    Preference: (1) a contract-quantity that UNAMBIGUOUSLY belongs to the SOURCE equipment
    (a rated headline flow, e.g. CO₂ ~1000 kg/h off the CO₂ feed compressor) — keyed by the
    producing unit, never by keyword-scanning the blended service sentence; else (2) the
    noun phrase of the service (e.g. 'syncrude', 'tail gas') so the arrow still says WHAT it
    carries.  We do NOT fall back to the connection-schedule kg/s rating here — that is the
    per-edge sized duty, shown on the P&ID; on the BFD we keep the executive-level headline
    flow or the fluid name only."""
    q = _qty_from_source(frm, is_thermal, quantities)
    if q:
        return q
    return _service_noun(service)


# words that NAME the carried fluid / phase in a material_context (the executive cares
# WHAT flows, not the full sentence).
_FLUID_WORDS = [
    ("syncrude", "syncrude"), ("wax", "syncrude + wax"), ("tail_gas", "tail gas"),
    ("tail gas", "tail gas"), ("process_water", "process water"),
    ("reactor_effluent", "reactor effluent"), ("effluent", "reactor effluent"),
    ("recycle", "recycle gas"), ("purge", "purge gas"),
    ("naphtha", "SAF + naphtha"), ("saf", "SAF + naphtha"),
    ("steam", "raised steam"), ("condensate", "condensate"),
    ("co2", "CO₂"), ("h2", "H₂"), ("hydrogen", "H₂"),
    ("flue", "flue gas"), ("amine", "rich/lean amine"), ("slurry", "slurry"),
    ("caco3", "CaCO₃"), ("liquid", "upgraded liquid"),
]


def _service_noun(service: str) -> str:
    """Extract the carried-fluid noun phrase from a material_context, e.g.
    'reactor_effluent_to_hot_and_cold_3phase_separators…' → 'reactor effluent'."""
    s = (service or "").lower()
    for needle, human in _FLUID_WORDS:
        if needle in s:
            return human
    # last resort: first 2-3 underscore tokens, humanised.
    toks = [t for t in re.split(r"[_\s]+", service or "") if t][:3]
    return PID._humanise(" ".join(toks)) if toks else ""


# ═══════════════════════════════════════════════════════════════════════════
# RECONSTRUCTION  (Process → BlockFlow, in true process order)
# ═══════════════════════════════════════════════════════════════════════════

def _supporting_equipment(state: dict, topology_blocks: list) -> list:
    """Principal equipment present in the BoM (the ledger spine) but NOT in the topology.

    The ledger is the single source of truth for what the BFD must show. The topology
    carries the process-train blocks; the BoM additionally carries major units that
    support the process but have no routed process line (standby generator, dosing skid,
    feed storage, expansion vessel, make-up hex). These must appear on the BFD so the
    executive sees every principal unit operation the ledger checks off.

    UNIVERSAL — reuses the ledger's own classification + connection filter (imported from
    parts_ledger) so the BFD and ledger agree on what counts as principal equipment.
    Returns a list of SYM_SUPPORTING Block objects (no streams; placed in the supporting
    band by the renderer).
    """
    try:
        import parts_ledger as PL
    except Exception:
        return []
    rb = state.get("requirementsBom") or []
    # normalised names already represented by a topology block (the identity key).
    # We dedup by NAME, not tag: a tag collision (same tag, different equipment)
    # means the BoM entry is a DIFFERENT unit that must still appear. Only a NAME
    # match means it's the same equipment already drawn.
    have_norms = {PL._norm(b.label) for b in topology_blocks if b.label}
    supporting: list[Block] = []
    seen = set()
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" or PL._is_connection(r):
            continue
        tag = str(r.get("tag", "")).strip()
        req = str(r.get("requirement", ""))
        name = (req.split("·")[0].strip() or str(r.get("part", "")) or tag)
        typ = PL._classify(name, tag)
        if typ not in ("vessel", "rotating", "exchanger", "separator"):
            continue
        nm = PL._norm(name)
        if nm in have_norms or nm in seen:    # same equipment (by name) already present
            continue
        seen.add(nm)
        supporting.append(Block(
            key=f"supporting_{tag or nm[:12]}",
            tag=tag or "—",
            label=name,
            sym=SYM_SUPPORTING,
            col=0,                         # placed in the supporting band, not a process column
            role_rank=9,
        ))
    return supporting


def reconstruct_blockflow(out_dir: str, state: dict) -> BlockFlow:
    """Build the BlockFlow from the P&ID's canonical Process (single source of truth) +
    the routed artifacts, laid out in TRUE process order."""
    # the P&ID reconstruction gives us equipment (tags + names + symbols) and the process
    # lines WITH recycle back-edges already flagged (is_return).  We re-use ALL of it, so
    # the BFD's tags + line numbers are byte-identical to the P&ID's.
    sched_for_pid = {}
    sp = Path(out_dir) / "connection-schedule.json"
    if sp.is_file():
        try:
            sched_for_pid = json.loads(sp.read_text())
        except Exception:
            sched_for_pid = {}
    # out_dir → the P&ID reconstruction also expands qty-N array nodes from the
    # parts-manifest (RAS 'rearing_tanks' → 10 tanks), so the BFD block reflects the array.
    proc = PID.reconstruct_process(sched_for_pid, state, out_dir=out_dir)

    quantities = _quantities(state)
    route_idx = _route_index(out_dir)

    # ---- blocks (drop the pure electrical pseudo-nodes; the BFD is a PROCESS diagram) ----
    blocks: list[Block] = []
    for nd in proc.nodes:
        if nd.sym == PID.SYM_OFFPAGE and re.search(
                r"electrical|power_supply|^supply$", nd.key, re.I):
            continue
        b = Block(key=nd.key, tag=nd.tag, label=nd.label, sym=nd.sym)
        # carry the array reality onto the BFD block so it reads '×N' (e.g. 10-tank farm)
        b.array_n = getattr(nd, "array_n", 1)
        b.array_tags = list(getattr(nd, "array_tags", []) or [])
        blocks.append(b)
    block_keys = {b.key for b in blocks}

    # ---- streams from the process lines (skip electrical; those become a note) ----
    streams: list[Stream] = []
    for ln in proc.lines:
        if ln.from_key not in block_keys or ln.to_key not in block_keys:
            continue
        if ln.style == PID.LINE_UTILITY:        # electrical bus → power note, not a stream
            continue
        rln = route_idx.get((ln.from_key, ln.to_key))
        service = (rln.get("service") if rln else "") or ln.service or ""
        number = (rln.get("line_number") if rln else "") or ln.number or ""
        if ln.is_return:
            style = STREAM_RECYCLE
        elif ln.style == PID.LINE_THERMAL:
            style = STREAM_THERMAL
        else:
            style = STREAM_PROCESS
        qty = _stream_qty(service, ln.from_key, ln.to_key, quantities,
                          is_thermal=(ln.style == PID.LINE_THERMAL))
        streams.append(Stream(from_key=ln.from_key, to_key=ln.to_key, number=number,
                              service=PID._service_text(service), qty=qty, style=style))

    # attach the canonical edge set + decide recycle, then derive the column order.
    proc._all_edges = streams                     # type: ignore[attr-defined]
    proc.blocks = blocks                          # type: ignore[attr-defined]
    col_of, role_of = derive_block_order(proc)
    for b in blocks:
        b.col = col_of.get(b.key, 0)
        b.role_rank, _rn = _role_rank(b.key, b.label, b.sym)

    # ---- INFERRED process-continues links across disconnected components --------------
    # The topology often omits the edge that carries product from one sub-train to the
    # next (separator syncrude → fractionation; recycle compressor → reactor).  Add a
    # CLEARLY-DISTINCT light dashed link (no fabricated quantity) between the natural
    # hand-off pair so the executive sees ONE connected train, not floating islands.
    streams += _infer_continuation_links(blocks, streams, col_of, role_of)

    has_recycle = any(s.style == STREAM_RECYCLE for s in streams)
    has_inferred = any(s.style == STREAM_INFERRED for s in streams)

    # ---- supporting equipment: principal BoM items with no topology node -------------
    # The ledger is the source of truth — every principal equipment it expects on the
    # BFD must appear. The topology gives us the process-train blocks; the BoM carries
    # additional major units (standby generator, dosing skid, feed silo, expansion vessel)
    # that have no process-line edge but ARE principal equipment the executive must see.
    # Add them as SYM_SUPPORTING blocks; the renderer places them in a distinct band.
    supporting = _supporting_equipment(state, blocks)

    # ---- boundaries: feeds in (left), products out (right) ----------------------------
    boundaries = _derive_boundaries(blocks, streams, col_of, role_of, quantities, state)

    # ---- power note from the electrical edge (kept off the process diagram) -----------
    power_note = proc.power_note or ""

    notes = [
        "Block-flow projected from the as-modelled process topology — major unit "
        "operations in process order (feed → reaction → separation → upgrading → "
        "product). Detailed sizing, instruments + valves are on the P&ID.",
    ]
    if has_inferred:
        notes.append("Dotted grey links show the process hand-off between sub-trains "
                     "(syncrude to upgrading, recycle to the reactor) inferred from the "
                     "unit roles where the routed topology does not carry an explicit line.")
    if not quantities:
        notes.append("Stream labels show the carried fluid; headline flows were not "
                     "available in the engineering contract for this run.")
    if supporting:
        notes.append("The lower 'Supporting services' band shows principal equipment from "
                     "the bill of materials that supports the process train but carries no "
                     "routed process line (standby generation, dosing, feed storage, etc.).")

    all_blocks = blocks + supporting
    return BlockFlow(
        archetype=proc.archetype, blocks=all_blocks, streams=streams, boundaries=boundaries,
        power_note=power_note, notes=notes,
        has_recycle=has_recycle, has_inferred=has_inferred)


def _infer_continuation_links(blocks, streams, col_of, role_of):
    """Bridge disconnected process-role components with light inferred links so the train
    is visually continuous.  CONSERVATIVE: at most one link per (separation→upgrading) and
    (recycle→reaction) hand-off, only when both endpoints exist, are NOT already connected
    by a real stream, and the geometry is sane.  Never invents a quantity."""
    existing = {(s.from_key, s.to_key) for s in streams}
    existing_undirected = existing | {(b, a) for a, b in existing}
    by_role = defaultdict(list)
    for b in blocks:
        by_role[role_of.get(b.key, "process")].append(b)
    added: list[Stream] = []

    def _link(src_role, dst_role, service_hint, style):
        srcs = by_role.get(src_role, [])
        dsts = by_role.get(dst_role, [])
        if not srcs or not dsts:
            return
        # pick the rightmost source + the leftmost destination (the natural hand-off).
        src = max(srcs, key=lambda b: col_of.get(b.key, 0))
        dst = min(dsts, key=lambda b: col_of.get(b.key, 0))
        if src.key == dst.key:
            return
        if (src.key, dst.key) in existing_undirected:
            return
        added.append(Stream(from_key=src.key, to_key=dst.key, number="",
                            service=service_hint, qty=service_hint, style=style))
        existing_undirected.add((src.key, dst.key))
        existing_undirected.add((dst.key, src.key))

    # syncrude/liquid leaves separation → upgrading (fractionation) — an inferred fwd link.
    _link("separation", "upgrading", "syncrude", STREAM_INFERRED)
    # recycle gas returns to the reactor — draw as a RECYCLE LOOP (the recycle compressor's
    # defining duty is to return tail gas to the reactor; honest even when the topology
    # omits the explicit return edge — flagged as role-inferred in the diagram note).
    _link("recycle", "reaction", "recycle gas", STREAM_RECYCLE)
    return added


def _derive_boundaries(blocks, streams, col_of, role_of, quantities, state):
    """Feeds entering (no upstream block) on a feed/conditioning unit → boundary feeds on
    the LEFT; products leaving (no downstream block) on a product/upgrading unit → boundary
    products on the RIGHT.  Quantities are honest-only (from the contract)."""
    indeg = defaultdict(int)
    outdeg = defaultdict(int)
    for s in streams:
        if s.style == STREAM_RECYCLE:            # a recycle is internal, not a boundary
            continue
        outdeg[s.from_key] += 1
        indeg[s.to_key] += 1
    bset = {b.key: b for b in blocks}
    boundaries: list[Boundary] = []

    # FEEDS — a feed/conditioning/reaction block with no real upstream block.
    for b in blocks:
        if indeg[b.key] == 0 and role_of.get(b.key) in ("feed", "conditioning"):
            label, qty = _feed_label(b, quantities)
            boundaries.append(Boundary(kind=BND_FEED, block_key=b.key,
                                       label=label, qty=qty))
    # if NOTHING got a feed (degenerate role mapping), fall back to the left-most block(s).
    if not any(x.kind == BND_FEED for x in boundaries) and blocks:
        leftcol = min(b.col for b in blocks)
        for b in blocks:
            if b.col == leftcol and indeg[b.key] == 0:
                label, qty = _feed_label(b, quantities)
                boundaries.append(Boundary(kind=BND_FEED, block_key=b.key,
                                           label=label, qty=qty))

    # PRODUCTS — a product/upgrading block with no real downstream block.
    for b in blocks:
        if outdeg[b.key] == 0 and role_of.get(b.key) in ("product", "upgrading",
                                                         "disposal"):
            label, qty = _product_label(b, quantities)
            boundaries.append(Boundary(kind=BND_PRODUCT, block_key=b.key,
                                       label=label, qty=qty))
    if not any(x.kind == BND_PRODUCT for x in boundaries) and blocks:
        rightcol = max(b.col for b in blocks)
        for b in blocks:
            if b.col == rightcol and outdeg[b.key] == 0:
                label, qty = _product_label(b, quantities)
                boundaries.append(Boundary(kind=BND_PRODUCT, block_key=b.key,
                                           label=label, qty=qty))
    return boundaries


def _feed_label(block, quantities):
    """Boundary-feed label + honest quantity from the block name + contract."""
    k = block.key.lower()
    if "co2" in k:
        return "CO₂ feed", _fmt_qty(quantities.get("co2_feed_kg_h", {}))
    if "h2" in k or "hydrogen" in k:
        return "H₂ feed", _fmt_qty(quantities.get("h2_feed_kg_h", {}))
    if "flue" in k:
        return "Flue gas", ""
    # generic: humanise the block, strip a trailing 'compressor/pump' kit word.
    name = re.sub(r"\b(compressor|pump|blower|fan)\b", "", block.label, flags=re.I).strip()
    return (name or block.label) + " feed", ""


def _product_label(block, quantities):
    """Boundary-product label + honest quantity from the block name + contract."""
    k = block.key.lower()
    if "saf" in k or "naphtha" in k or "storage" in k:
        return "SAF + naphtha", _fmt_qty(quantities.get("saf_output_kg_h", {}))
    if "oxidis" in k or "oxidiz" in k or "flare" in k:
        return "Clean flue gas", ""
    if "caco3" in k or "carbonat" in k:
        return "Mineralised CaCO₃", ""
    name = re.sub(r"\b(tank|storage|column)\b", "", block.label, flags=re.I).strip()
    return (name or block.label), ""


# ═══════════════════════════════════════════════════════════════════════════
# SVG DRAWING — clean blocks + arrowed streams (NO instruments, NO valves)
# ═══════════════════════════════════════════════════════════════════════════

# Light-mode palette — mirrors the P&ID so the drawing set is visually coherent.
INK = "#1a1a1a"
EQ_INK = "#10243e"          # block outline (deep navy)
PROC_INK = "#10243e"        # process stream
THERMAL_INK = "#b5462a"     # thermal / steam stream (warm)
RECYCLE_INK = "#1a5fb4"     # recycle loop (blue)
INFER_INK = "#9aa3b0"       # inferred hand-off (muted grey)
FEED_INK = "#1c7a4d"        # boundary feed (green)
PRODUCT_INK = "#8a5a00"     # boundary product (amber/brown)
FILL_BG = "#ffffff"
PANEL_BG = "#f4f6f9"
EQ_FILL = "#eef2f7"
SUPPORT_FILL = "#f7f5ef"     # supporting-equipment band (muted warm tint, distinct from main train)
SUPPORT_INK = "#6b6357"      # supporting-equipment outline (softer than the main navy)
FEED_FILL = "#e7f3ec"
PRODUCT_FILL = "#f6efe0"
GRID_FAINT = "#e4e8ee"
MUTED = "#5b6470"


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    """Tiny imperative SVG builder — same primitives + look as the P&ID's."""

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

    def path(self, d, stroke=INK, width=1.6, fill="none", join="round", cap="round",
             dash=None, marker=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        mk = f' marker-end="url(#{marker})"' if marker else ""
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
                 f'stroke-linejoin="{join}" stroke-linecap="{cap}"{da}{mk}/>')

    def text(self, x, y, s, size=12, anchor="start", fill=INK, weight="normal",
             family="Helvetica, Arial, sans-serif", mono=False, spacing=None):
        fam = "'DejaVu Sans Mono', 'Menlo', monospace" if mono else family
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" '
                 f'font-size="{size}" text-anchor="{anchor}" fill="{fill}" '
                 f'font-weight="{weight}"{sp}>{_esc(s)}</text>')

    def render(self) -> str:
        defs = (
            '<defs>'
            f'<marker id="bf_proc" markerWidth="13" markerHeight="13" refX="9" refY="4.5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L11,4.5 L0,9 Z" fill="{PROC_INK}"/></marker>'
            f'<marker id="bf_therm" markerWidth="13" markerHeight="13" refX="9" refY="4.5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L11,4.5 L0,9 Z" fill="{THERMAL_INK}"/></marker>'
            f'<marker id="bf_recyc" markerWidth="13" markerHeight="13" refX="9" refY="4.5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L11,4.5 L0,9 Z" fill="{RECYCLE_INK}"/></marker>'
            f'<marker id="bf_infer" markerWidth="12" markerHeight="12" refX="8" refY="4" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L9,4 L0,8 Z" fill="{INFER_INK}"/></marker>'
            f'<marker id="bf_feed" markerWidth="13" markerHeight="13" refX="9" refY="4.5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L11,4.5 L0,9 Z" fill="{FEED_INK}"/></marker>'
            f'<marker id="bf_prod" markerWidth="13" markerHeight="13" refX="9" refY="4.5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L11,4.5 L0,9 Z" fill="{PRODUCT_INK}"/></marker>'
            '</defs>')
        body = "\n".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n{defs}\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


# ---- block geometry ----------------------------------------------------------

BLOCK_W = 138
BLOCK_H = 84


# accent stripe colour per process role — a quiet visual cue to the train stage.
def _role_accent(role_rank: int) -> str:
    return {
        0: FEED_INK, 1: "#3a6ea5", 2: "#7a3a8a", 3: THERMAL_INK,
        4: "#2a7d8a", 5: RECYCLE_INK, 6: "#7a4a3a", 7: "#9a5a00",
        8: "#2a7d8a", 9: PRODUCT_INK,
    }.get(role_rank, EQ_INK)


def _wrap(label: str, maxlen=20, maxlines=3):
    words = str(label).split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= maxlen:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == maxlines:
            break
    if cur and len(lines) < maxlines:
        lines.append(cur)
    if len(lines) == maxlines and len(" ".join(words)) > len(" ".join(lines)):
        lines[-1] = lines[-1][:maxlen - 1] + "…"
    return lines[:maxlines]


def build_bfd_svg(bf: BlockFlow) -> str:
    """Render the BlockFlow as a clean executive Block-Flow Diagram."""
    blocks = bf.blocks
    if not blocks:
        svg = SVG(1100, 560)
        svg.rect(18, 18, 1100 - 36, 560 - 36, stroke=GRID_FAINT, width=1.2)
        svg.text(550, 280, "No process topology in state — nothing to draw.",
                 size=14, anchor="middle", fill=MUTED)
        _draw_title_block(svg, bf, 1100, 560, 150)
        return svg.render()

    # group blocks by process column; lay columns left→right, stack same-column items.
    # Supporting blocks (SYM_SUPPORTING) are excluded from the process-train columns and
    # rendered in a distinct band below.
    topo_blocks = [b for b in blocks if b.sym != SYM_SUPPORTING]
    support_blocks = [b for b in blocks if b.sym == SYM_SUPPORTING]
    by_col: dict[int, list[Block]] = defaultdict(list)
    for b in topo_blocks:
        by_col[b.col].append(b)
    cols = sorted(by_col)
    ncol = len(cols)
    max_stack = max(len(by_col[c]) for c in cols) if cols else 1

    # ----- geometry -----
    col_pitch = 250
    row_pitch = 150
    margin_l = 160            # room for the feed arrow + label on the left
    margin_r = 215           # room for the product arrow + label on the right
    header_h = 124
    title_h = 150

    # reserve extra vertical room when any product / waste sink exits DOWNWARD (a sink in
    # an earlier column) so its arrow + label clear the band before the legend.
    has_down_product = any(
        b.kind == BND_PRODUCT and _bcol(b.block_key, topo_blocks) < max(x.col for x in topo_blocks)
        for b in bf.boundaries)
    bottom_pad = 210 if has_down_product else 130

    diagram_w = margin_l + margin_r + (ncol - 1) * col_pitch + BLOCK_W
    width = int(math.ceil(max(diagram_w, 1180)))

    # supporting-equipment band geometry: a grid of smaller blocks below the main train.
    # 5 per row, BLOCK_W spacing; reserves vertical room only when supporting blocks exist.
    support_cell_w = BLOCK_W + 24
    support_cell_h = BLOCK_H + 28
    support_per_row = max(1, int((width - margin_l - margin_r + 24) // support_cell_w)) if support_blocks else 0
    support_rows = math.ceil(len(support_blocks) / support_per_row) if support_blocks else 0
    support_band_h = (support_rows * support_cell_h + 48) if support_blocks else 0

    body_h = header_h + (max_stack - 1) * row_pitch + BLOCK_H + bottom_pad + support_band_h
    height = int(math.ceil(body_h + title_h))

    svg = SVG(width, height)
    svg.rect(18, 18, width - 36, height - 36, stroke=GRID_FAINT, width=1.2)

    # ----- header -----
    svg.text(40, 50, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(40, 74, f"BLOCK-FLOW DIAGRAM — {PID._humanise(bf.archetype)}",
             size=16, weight="bold", fill=EQ_INK)
    svg.text(40, 94,
             "Major unit operations in process order (feed → reaction → separation → "
             "upgrading → product), with the main streams + recycle.",
             size=10, fill=MUTED)
    svg.line(40, 108, width - 40, 108, stroke=GRID_FAINT, width=1.2)

    # ----- compute each block centre -----
    centre: dict[str, tuple] = {}
    base_y = header_h + 40
    band_h = (max_stack - 1) * row_pitch
    for ci, c in enumerate(cols):
        stack = by_col[c]
        cx = margin_l + ci * col_pitch + BLOCK_W / 2
        total_h = (len(stack) - 1) * row_pitch
        y0 = base_y + (band_h - total_h) / 2
        for si, b in enumerate(stack):
            centre[b.key] = (cx, y0 + si * row_pitch)

    ports = {b.key: _block_ports(*centre[b.key]) for b in topo_blocks}

    # ----- draw STREAMS first (so the blocks sit on top of stream ends) -----
    # spread converging inlets / diverging outlets across a block face into lanes.
    fwd_streams = [s for s in bf.streams if s.style != STREAM_RECYCLE]
    in_count, out_count = defaultdict(int), defaultdict(int)
    for s in fwd_streams:
        if s.from_key in centre and s.to_key in centre:
            in_count[s.to_key] += 1
            out_count[s.from_key] += 1
    in_seen, out_seen = defaultdict(int), defaultdict(int)
    lane = {}
    for s in fwd_streams:
        if s.from_key in centre and s.to_key in centre:
            lane[id(s)] = (out_seen[s.from_key], out_count[s.from_key],
                           in_seen[s.to_key], in_count[s.to_key])
            out_seen[s.from_key] += 1
            in_seen[s.to_key] += 1

    block_col = {b.key: b.col for b in topo_blocks}
    band_bottom = base_y + band_h + BLOCK_H / 2
    # a lower bus level for long cross-component bridges (inferred links / any forward
    # stream that skips ≥2 columns) so they route UNDER the intervening blocks instead of
    # jogging up into one of them.
    bus_y = band_bottom + 24

    def _spans_far(s):
        return abs(block_col.get(s.to_key, 0) - block_col.get(s.from_key, 0)) >= 2

    for s in bf.streams:
        if s.from_key not in centre or s.to_key not in centre:
            continue
        if s.style == STREAM_RECYCLE:
            _draw_recycle(svg, ports[s.from_key], ports[s.to_key],
                          centre[s.from_key], centre[s.to_key], s)
        elif s.style == STREAM_INFERRED or _spans_far(s):
            _draw_bus_link(svg, ports[s.from_key], ports[s.to_key], s, bus_y)
        else:
            _draw_stream(svg, ports[s.from_key], ports[s.to_key],
                         centre[s.from_key], centre[s.to_key], s,
                         lane.get(id(s), (0, 1, 0, 1)))

    # ----- draw BOUNDARY feeds (left) + products (right) -----
    min_col = min(block_col.values())
    max_col = max(block_col.values())
    _draw_boundaries(svg, bf, centre, ports, col_pitch, block_col, min_col, max_col,
                     band_bottom=band_bottom)

    # ----- draw the BLOCKS on top -----
    for b in topo_blocks:
        _draw_block(svg, b, *centre[b.key])

    # ----- SUPPORTING EQUIPMENT BAND (principal BoM items with no topology edge) -----
    if support_blocks:
        support_y0 = band_bottom + bottom_pad - 20
        svg.text(margin_l, support_y0 - 14, "Supporting services",
                 size=11, weight="bold", fill=SUPPORT_INK)
        svg.text(margin_l + 150, support_y0 - 14,
                 "— principal equipment from the bill of materials (no routed process line)",
                 size=9, fill=MUTED)
        svg.line(40, support_y0 - 6, width - 40, support_y0 - 6,
                 stroke=GRID_FAINT, width=1.0)
        for i, b in enumerate(support_blocks):
            row = i // support_per_row
            col = i % support_per_row
            cx = margin_l + col * support_cell_w + BLOCK_W / 2
            cy = support_y0 + 16 + row * support_cell_h + BLOCK_H / 2
            _draw_supporting_block(svg, b, cx, cy)

    # ----- LEGEND + power note -----
    _draw_legend(svg, bf, 40, height - title_h - 96, width)

    # ----- TITLE BLOCK -----
    _draw_title_block(svg, bf, width, height, title_h)
    return svg.render()


def _bcol(key, blocks):
    for b in blocks:
        if b.key == key:
            return b.col
    return 0


def _block_ports(cx, cy):
    return {
        "left": (cx - BLOCK_W / 2, cy), "right": (cx + BLOCK_W / 2, cy),
        "top": (cx, cy - BLOCK_H / 2), "bottom": (cx, cy + BLOCK_H / 2),
        "cx": cx, "cy": cy,
    }


def _draw_block(svg, b, cx, cy):
    """A clean rounded block: navy outline, faint fill, a role-accent top stripe, the
    equipment tag (bold) + the wrapped human name. A qty-N array block (RAS rearing tanks
    = 10) draws a STACKED-ARRAY motif (offset ghost rectangles behind the box) + a '×N'
    badge so the executive sees the parallel set, not a single unit."""
    x = cx - BLOCK_W / 2
    y = cy - BLOCK_H / 2
    accent = _role_accent(b.role_rank)
    array_n = getattr(b, "array_n", 1)
    # STACKED-ARRAY ghost rectangles behind the main box (offset up-right), so the box
    # reads as N identical parallel units. Drawn first ⇒ they sit behind the front box.
    if array_n > 1:
        for i in range(min(array_n - 1, 3), 0, -1):
            ox, oy = i * 7, -i * 6
            svg.rect(x + ox, y + oy, BLOCK_W, BLOCK_H, stroke="#9fb0c4", width=1.3,
                     fill="#f3f6fa", rx=7)
    svg.rect(x, y, BLOCK_W, BLOCK_H, stroke=EQ_INK, width=1.8, fill=EQ_FILL, rx=7)
    # role-accent stripe along the top edge
    svg.path(f"M {x + 7:.1f} {y + 1.2:.1f} L {x + BLOCK_W - 7:.1f} {y + 1.2:.1f}",
             stroke=accent, width=3.2)
    # tag (bold, accent) then the wrapped name
    tag_txt = b.tag
    if array_n > 1 and len(getattr(b, "array_tags", []) or []) >= 2:
        tag_txt = f"{b.array_tags[0]}…{b.array_tags[-1]}"
    svg.text(cx, y + 20, tag_txt, size=12, anchor="middle", weight="bold", fill=accent)
    label = b.label if array_n <= 1 else f"{b.label} ×{array_n}"
    name_lines = _wrap(label, maxlen=20, maxlines=3)
    n = len(name_lines)
    start = cy - (n - 1) * 7 + 6
    for i, line in enumerate(name_lines):
        svg.text(cx, start + i * 13, line, size=10, anchor="middle", fill=EQ_INK)
    # a '×N' badge top-right of the stack (the parallel-count marker)
    if array_n > 1:
        bx = x + BLOCK_W + min(array_n - 1, 3) * 7
        svg.text(bx + 4, y - min(array_n - 1, 3) * 6 + 6, f"×{array_n}", size=11,
                 anchor="start", weight="bold", fill=accent)


def _draw_supporting_block(svg, b, cx, cy):
    """A muted block for supporting equipment (principal BoM items with no topology edge).
    Distinct from the main process-train blocks: warmer fill, softer outline, no role
    stripe — so the executive reads them as context, not process stages."""
    x = cx - BLOCK_W / 2
    y = cy - BLOCK_H / 2
    svg.rect(x, y, BLOCK_W, BLOCK_H, stroke=SUPPORT_INK, width=1.4,
             fill=SUPPORT_FILL, rx=6)
    svg.text(cx, y + 18, b.tag, size=11, anchor="middle", weight="bold",
             fill=SUPPORT_INK)
    name_lines = _wrap(b.label, maxlen=22, maxlines=3)
    n = len(name_lines)
    start = cy - (n - 1) * 7 + 5
    for i, line in enumerate(name_lines):
        svg.text(cx, start + i * 12, line, size=9, anchor="middle", fill=SUPPORT_INK)


def _draw_stream(svg, pf, pt, cf, ct, s, lane):
    """Route an orthogonal arrow from block-from's right/appropriate face to block-to's
    left face, labelled with the line number + service + key quantity.  Lanes spread
    converging inlets / diverging outlets so labels don't collide."""
    out_i, out_n, in_i, in_n = lane
    stroke = {STREAM_PROCESS: PROC_INK, STREAM_THERMAL: THERMAL_INK,
              STREAM_INFERRED: INFER_INK}.get(s.style, PROC_INK)
    dash = {STREAM_THERMAL: "8,4", STREAM_INFERRED: "2,4"}.get(s.style)
    marker = {STREAM_PROCESS: "bf_proc", STREAM_THERMAL: "bf_therm",
              STREAM_INFERRED: "bf_infer"}.get(s.style, "bf_proc")
    lw = 2.6 if s.style == STREAM_PROCESS else (1.6 if s.style == STREAM_INFERRED else 2.1)

    fx, fy = cf
    tx, ty = ct
    forward = tx >= fx - 1
    out_off = _lane_off(out_i, out_n, BLOCK_H * 0.6)
    in_off = _lane_off(in_i, in_n, BLOCK_H * 0.6)

    if forward:
        x0, y0 = pf["right"]
        x1, y1 = pt["left"]
        y0 += out_off
        y1 += in_off
        xm = x0 + (x1 - x0) * 0.5
        if abs(y1 - y0) > 3:
            pts = [(x0, y0), (xm, y0), (xm, y1), (x1, y1)]
        else:
            pts = [(x0, y0), (x1, y1)]
        _polyline(svg, pts, stroke, lw, dash, marker)
        # label sits on the clear horizontal run nearest the source.
        lx = (x0 + xm) / 2
        _stream_label(svg, s, lx, y0, stroke)
    else:
        # a forward-in-process but right→left geometry (rare with role ordering): loop low.
        x0, y0 = pf["bottom"]
        x1, y1 = pt["bottom"]
        down = max(y0, y1) + 46
        pts = [(x0, y0), (x0, down), (x1, down), (x1, y1)]
        _polyline(svg, pts, stroke, lw, dash, marker)
        _stream_label(svg, s, (x0 + x1) / 2, down, stroke, below=True)


def _draw_recycle(svg, pf, pt, cf, ct, s):
    """A recycle loop: leave the source TOP, route up + across + down into the target TOP,
    dashed blue so it reads unambiguously as a return."""
    x0, y0 = pf["top"]
    x1, y1 = pt["top"]
    up = min(y0, y1) - 64
    pts = [(x0, y0), (x0, up), (x1, up), (x1, y1)]
    _polyline(svg, pts, RECYCLE_INK, 2.1, "6,4", "bf_recyc")
    _stream_label(svg, s, (x0 + x1) / 2, up, RECYCLE_INK, above=True, recycle=True)


def _draw_bus_link(svg, pf, pt, s, bus_y):
    """Route a long cross-component bridge (an inferred hand-off, or any forward stream
    that skips ≥2 columns) along a LOWER BUS: down out of the source bottom, across at
    bus_y, then up into the destination bottom.  This keeps the long run clear of the
    blocks it passes beneath instead of jogging up into one of them."""
    inferred = s.style == STREAM_INFERRED
    stroke = INFER_INK if inferred else PROC_INK
    dash = "2,4" if inferred else None
    marker = "bf_infer" if inferred else "bf_proc"
    lw = 1.6 if inferred else 2.4
    x0, y0 = pf["bottom"]
    x1, y1 = pt["bottom"]
    pts = [(x0, y0), (x0, bus_y), (x1, bus_y), (x1, y1)]
    _polyline(svg, pts, stroke, lw, dash, marker)
    # label centred on the horizontal bus run, just above the bus line.
    _stream_label(svg, s, (x0 + x1) / 2, bus_y, stroke)


def _polyline(svg, pts, stroke, lw, dash, marker):
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    svg.path(d, stroke=stroke, width=lw, dash=dash, marker=marker)


def _stream_label(svg, s, x, y, stroke, above=False, below=False, recycle=False):
    """Two-line stream label: line number / quantity (primary) + service hint (secondary),
    on a small leader off the pipe."""
    # primary = the key quantity if we have one, else the line number.
    primary = s.qty or s.number or ""
    secondary = ""
    if s.qty and s.number:
        secondary = s.number
    elif s.qty and s.service and _short(s.service) and _short(s.service) != s.qty:
        secondary = ""    # qty already names the fluid; avoid redundant service echo
    if recycle and not primary:
        primary = "recycle"
    dy_main = -9 if (above or below) else -8
    if below:
        dy_main = 13
    if primary:
        svg.text(x, y + dy_main, primary, size=9, anchor="middle", weight="bold",
                 fill=stroke)
    if secondary:
        svg.text(x, y + dy_main - 11, secondary, size=7.6, anchor="middle", fill=MUTED,
                 mono=True)


def _short(svc: str, maxlen=22) -> str:
    s = (svc or "").strip()
    for cut in (" then ", " blended ", " to ", " into ", " recompressed ", " recovers "):
        i = s.lower().find(cut)
        if 0 < i <= maxlen + 6:
            s = s[:i]
            break
    s = s.strip(" .,_")
    return s if len(s) <= maxlen else s[:maxlen - 1] + "…"


def _lane_off(i, n, span):
    if n <= 1:
        return 0.0
    return (i - (n - 1) / 2) * (span / max(1, n))


def _draw_boundaries(svg, bf, centre, ports, col_pitch, block_col, min_col, max_col,
                     band_bottom):
    """Draw the boundary feeds + products as arrows crossing the battery limit, styled
    distinctly (green feed, amber product) with a small battery-limit marker + the honest
    flow label.

    Direction is chosen so an arrow NEVER ploughs through a later block:
      • a FEED on a left-most-column block enters horizontally from the LEFT margin; a feed
        on a deeper block drops in vertically from ABOVE.
      • a PRODUCT on the right-most-column block leaves horizontally to the RIGHT margin
        (the main product — the diagram's right-hand climax); a product / waste sink in an
        EARLIER column leaves vertically DOWNWARD into the margin below (the standard BFD
        convention for a side-product / abatement stream), so it cannot collide with the
        blocks in the columns to its right."""
    feeds = defaultdict(list)
    prods = defaultdict(list)
    for bnd in bf.boundaries:
        (feeds if bnd.kind == BND_FEED else prods)[bnd.block_key].append(bnd)

    arrow_len = min(70, col_pitch - BLOCK_W - 14)   # fits inside the inter-column gap

    # ---- FEEDS ----
    for key, items in feeds.items():
        if key not in centre:
            continue
        n = len(items)
        if block_col.get(key, min_col) <= min_col:
            bx, by = ports[key]["left"]
            for i, bnd in enumerate(items):
                yy = by + _lane_off(i, n, BLOCK_H * 0.7)
                sx = bx - 86
                _battery_chip(svg, sx - 8, yy, FEED_INK, FEED_FILL)
                _polyline(svg, [(sx, yy), (bx, yy)], FEED_INK, 2.4, None, "bf_feed")
                svg.text(sx - 14, yy - 5, bnd.label, size=9.5, anchor="end",
                         weight="bold", fill=FEED_INK)
                if bnd.qty:
                    svg.text(sx - 14, yy + 9, bnd.qty, size=8.4, anchor="end", fill=MUTED)
        else:
            tx, ty = ports[key]["top"]
            for i, bnd in enumerate(items):
                xx = tx + _lane_off(i, n, BLOCK_W * 0.5)
                sy = ty - 64
                _battery_chip(svg, xx, sy - 8, FEED_INK, FEED_FILL)
                _polyline(svg, [(xx, sy), (xx, ty)], FEED_INK, 2.4, None, "bf_feed")
                svg.text(xx + 11, sy - 6, bnd.label, size=9.5, anchor="start",
                         weight="bold", fill=FEED_INK)
                if bnd.qty:
                    svg.text(xx + 11, sy + 6, bnd.qty, size=8.4, anchor="start", fill=MUTED)

    # ---- PRODUCTS ----
    for key, items in prods.items():
        if key not in centre:
            continue
        n = len(items)
        if block_col.get(key, max_col) >= max_col:
            bx, by = ports[key]["right"]
            for i, bnd in enumerate(items):
                yy = by + _lane_off(i, n, BLOCK_H * 0.7)
                ex = bx + arrow_len
                _polyline(svg, [(bx, yy), (ex, yy)], PRODUCT_INK, 2.4, None, "bf_prod")
                _battery_chip(svg, ex + 10, yy, PRODUCT_INK, PRODUCT_FILL)
                svg.text(ex + 22, yy - 5, bnd.label, size=9.5, anchor="start",
                         weight="bold", fill=PRODUCT_INK)
                if bnd.qty:
                    svg.text(ex + 22, yy + 9, bnd.qty, size=8.4, anchor="start", fill=MUTED)
        else:
            bx, by = ports[key]["bottom"]
            for i, bnd in enumerate(items):
                xx = bx + _lane_off(i, n, BLOCK_W * 0.5)
                ey = band_bottom + 46
                _polyline(svg, [(xx, by), (xx, ey)], PRODUCT_INK, 2.4, None, "bf_prod")
                _battery_chip(svg, xx, ey + 10, PRODUCT_INK, PRODUCT_FILL)
                svg.text(xx + 11, ey + 8, bnd.label, size=9.5, anchor="start",
                         weight="bold", fill=PRODUCT_INK)
                if bnd.qty:
                    svg.text(xx + 11, ey + 22, bnd.qty, size=8.4, anchor="start",
                             fill=MUTED)


def _battery_chip(svg, x, y, stroke, fill):
    """A small battery-limit marker (a notched square) at a boundary terminus."""
    s = 7
    svg.rect(x - s, y - s, 2 * s, 2 * s, stroke=stroke, width=1.6, fill=fill, rx=2)
    svg.line(x, y - s, x, y + s, stroke=stroke, width=1.0)


# ---- legend / title block ----------------------------------------------------

def _draw_legend(svg, bf, x, y, width):
    """A compact horizontal legend strip: stream types + boundary markers."""
    svg.text(x, y, "LEGEND", size=10, weight="bold", fill=MUTED)
    yy = y + 20
    cur_x = x

    def _entry(draw_fn, label, w):
        nonlocal cur_x
        draw_fn(cur_x)
        svg.text(cur_x + 40, yy + 4, label, size=9, fill=MUTED)
        cur_x += 40 + w

    def _proc(px):
        svg.path(f"M {px:.1f} {yy:.1f} L {px + 30:.1f} {yy:.1f}", stroke=PROC_INK,
                 width=2.6, marker="bf_proc")
    _entry(_proc, "Process stream", 120)

    def _therm(px):
        svg.path(f"M {px:.1f} {yy:.1f} L {px + 30:.1f} {yy:.1f}", stroke=THERMAL_INK,
                 width=2.1, dash="8,4", marker="bf_therm")
    _entry(_therm, "Thermal / steam", 120)

    if bf.has_recycle:
        def _recyc(px):
            svg.path(f"M {px:.1f} {yy:.1f} L {px + 30:.1f} {yy:.1f}", stroke=RECYCLE_INK,
                     width=2.1, dash="6,4", marker="bf_recyc")
        _entry(_recyc, "Recycle loop", 100)

    if bf.has_inferred:
        def _infer(px):
            svg.path(f"M {px:.1f} {yy:.1f} L {px + 30:.1f} {yy:.1f}", stroke=INFER_INK,
                     width=1.6, dash="2,4", marker="bf_infer")
        _entry(_infer, "Inferred hand-off", 120)

    def _feed(px):
        _battery_chip(svg, px + 4, yy, FEED_INK, FEED_FILL)
        svg.path(f"M {px + 12:.1f} {yy:.1f} L {px + 30:.1f} {yy:.1f}", stroke=FEED_INK,
                 width=2.4, marker="bf_feed")
    _entry(_feed, "Feed (battery limit)", 130)

    def _prod(px):
        svg.path(f"M {px:.1f} {yy:.1f} L {px + 18:.1f} {yy:.1f}", stroke=PRODUCT_INK,
                 width=2.4, marker="bf_prod")
        _battery_chip(svg, px + 26, yy, PRODUCT_INK, PRODUCT_FILL)
    _entry(_prod, "Product (battery limit)", 130)


def _wrap_text(s, px_w, font_px):
    cw = max(1, int(px_w / (font_px * 0.52)))
    words = str(s).split()
    out, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= cw:
            cur = (cur + " " + w).strip()
        else:
            out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


def _draw_title_block(svg, bf, width, height, title_h):
    """Standard drawing title block — mirrors the P&ID's."""
    y0 = height - title_h + 24
    x0 = 30
    x1 = width - 30
    svg.line(x0, y0, x1, y0, stroke=INK, width=1.6)

    bw = 300
    bx0 = x1 - bw
    by0 = y0 + 14
    rows = [("DRAWING No.", "FF-BFD-001"),
            ("REV", _tb.REV),
            ("DATE", _ISSUE_DATE or "—  "),
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
    svg.text(x0, y0 + 43, f"BLOCK-FLOW DIAGRAM — {PID._humanise(bf.archetype)}",
             size=15, weight="bold", fill=EQ_INK)
    svg.text(x0, y0 + 61,
             "Scope: as-modelled major unit operations in process order — "
             "an executive process overview · not for construction.",
             size=9.5, fill=MUTED)
    avail_w = (bx0 - 20) - x0
    ny = y0 + 79
    for note in (bf.notes or [])[:2]:
        for j, wl in enumerate(_wrap_text("• " + note, avail_w, 9.0)):
            svg.text(x0 if j == 0 else x0 + 9, ny, wl, size=9.0, fill=MUTED)
            ny += 12
    svg.text(x0, ny + 2,
             "Auto-generated · ForgeOS process auto-projection · not for construction.",
             size=8.6, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# RASTERISATION + ENTRY  (reuse the P&ID's absolute-path rasteriser)
# ═══════════════════════════════════════════════════════════════════════════

def generate_bfd(out_dir: str, state_path: Optional[str] = None,
                 rasterise_png: bool = True):
    """Full pipeline: load → reconstruct → draw → write SVG (+ PNG)."""
    global _ISSUE_DATE
    # deterministic title-block issue date from the run's own artifacts (set before draw).
    _ISSUE_DATE = _tb.issue_date(out_dir)
    _schedule, state = PID.load_inputs(out_dir, state_path)
    bf = reconstruct_blockflow(out_dir, state)
    svg_text = build_bfd_svg(bf)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    # IMPORTANT: resolve to an ABSOLUTE path — the Chrome rasteriser reads file://<path>;
    # a relative path silently yields a BLANK png (the known draw_pid relative-path bug).
    svg_path = (draw_dir / "block-flow-diagram.svg").resolve()
    png_path = (draw_dir / "block-flow-diagram.png").resolve()
    svg_path.write_text(svg_text)

    png_ok = PID.rasterise(svg_path, png_path) if rasterise_png else False

    summary = {
        "archetype": bf.archetype,
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "blocks": len(bf.blocks),
        "streams": len(bf.streams),
        "process_streams": sum(1 for s in bf.streams if s.style == STREAM_PROCESS),
        "thermal_streams": sum(1 for s in bf.streams if s.style == STREAM_THERMAL),
        "recycle_streams": sum(1 for s in bf.streams if s.style == STREAM_RECYCLE),
        "inferred_streams": sum(1 for s in bf.streams if s.style == STREAM_INFERRED),
        "feeds": sum(1 for b in bf.boundaries if b.kind == BND_FEED),
        "products": sum(1 for b in bf.boundaries if b.kind == BND_PRODUCT),
        "columns": len(set(b.col for b in bf.blocks)),
        "has_recycle": bf.has_recycle,
    }
    return summary, bf, svg_text


def _order_str(bf: BlockFlow) -> str:
    """A readable left→right tag/name sequence, for the CLI + tests."""
    seq = sorted(bf.blocks, key=lambda b: (b.col, b.tag))
    return "  →  ".join(f"[{b.col}] {b.tag} {b.label}" for b in seq)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, bf, _svg = generate_bfd(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[bfd] ERROR: {ex}")
        return 2
    print(f"[bfd] archetype      : {summary['archetype']}")
    print(f"[bfd] blocks         : {summary['blocks']}  ({summary['columns']} columns)")
    print(f"[bfd] streams        : {summary['streams']}  "
          f"(process {summary['process_streams']}, thermal {summary['thermal_streams']}, "
          f"recycle {summary['recycle_streams']}, inferred {summary['inferred_streams']})")
    print(f"[bfd] boundaries     : {summary['feeds']} feed(s), "
          f"{summary['products']} product(s)")
    print(f"[bfd] process order  : {_order_str(bf)}")
    print(f"[bfd] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[bfd] PNG → {summary['png']}")
    else:
        print("[bfd] PNG not written (no rasteriser available — SVG is the master)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
