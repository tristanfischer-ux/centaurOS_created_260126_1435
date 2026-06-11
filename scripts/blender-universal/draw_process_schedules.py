#!/usr/bin/env python3
"""draw_process_schedules.py — UNIVERSAL process schedules generator.

The TABULAR process deliverables that pair with the P&ID (draw_pid.py), exactly as the
PANEL SCHEDULE (draw_panel_schedule.py) pairs with the single-line diagram.  A real
engineering drawing set ships the P&ID together with three tables that cross-reference it
LINE-FOR-LINE:

  1. LINE LIST        — one row per process line (every fluid / thermal topology edge).
  2. VALVE LIST       — one row per valve in the state (control / relief / isolation / ESD).
  3. INSTRUMENT INDEX — one row per instrument in the state (ISA LT / PT / TT / FT / AT …).

It does NOT recompute anything and it does NOT touch build_universal_scene.py — it is a
pure CONSUMER of that generator's outputs + the archetype state, and it PROJECTS the same
modelled process the P&ID draws into the standard schedules.

═══ CONSISTENCY ACROSS THE DRAWING SET (the whole point) ═══
The LINE NUMBERS, EQUIPMENT TAGS and the P&ID references in these tables MUST match the
P&ID exactly — a line called `203-ST-DN200` on the P&ID is `203-ST-DN200` in the line
list, equipment `K-101` is `K-101` everywhere.  We GUARANTEE this by IMPORTING draw_pid
and calling its `reconstruct_process()` — the SAME deterministic reconstruction the P&ID
renders from.  We do not re-derive line numbers or tags; we read them off the reconstructed
`Process` so they are byte-identical by construction.  The valve / instrument P&ID refs
re-use draw_pid's own placement logic (which line / which equipment the P&ID decorated) so
those cross-references hold too.

INPUTS (read-only):
  <state.json>                    — the archetype state (engineeringContract.topology +
        moduleDecomposition BoM).  Same file the P&ID reads.
  <out>/connection-schedule.json  — OPTIONAL enrichment (from build_universal_scene): the
        sized pipe runs (size = DN / velocity / phase / pressure / length / material).
        When present, the LINE LIST carries the as-modelled DN + velocity + phase +
        material.  When absent, the topology alone still yields a full line list (DN
        inferred), identical to how the P&ID degrades.

OUTPUTS (to <out>/drawings/):
  process-line-list.{md,png}
  process-valve-list.{md,png}
  process-instrument-index.{md,png}

Run:
  python3 scripts/blender-universal/draw_process_schedules.py out/oxccu-saf-v21
  python3 scripts/blender-universal/draw_process_schedules.py out/co2-caspar-fix3 out/co2-caspar-fix3/state.json

Pure Python stdlib + (optional) a rasteriser on PATH.  No Blender import.
"""
from __future__ import annotations

import html
import math
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── reuse the P&ID's canonical reconstruction so line numbers + tags are IDENTICAL ──
sys.path.insert(0, str(Path(__file__).resolve().parent))
import draw_pid as PID  # noqa: E402  (the P&ID generator — single source of truth)


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — the three schedules
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class LineRow:
    number: str            # line number — IDENTICAL to the P&ID's (e.g. '203-ST-DN200')
    frm_tag: str           # from equipment tag (e.g. 'R-102')
    to_tag: str            # to equipment tag (e.g. 'H-102')
    service: str           # humanised service (the material_context head)
    fluid: str             # the carried fluid (CO2 / H2 / steam / amine / slurry …)
    phase: str             # gas / liquid / steam (2-phase / slurry where known)
    dn: str                # nominal size, e.g. 'DN200'
    material: str          # pipe material / schedule, e.g. '316L'
    rating: str            # design rating — flow (kg/s, m³/s, t/h) or duty (kW)
    insulation: str        # 'Y — hot' / 'Y — cold' / 'N'
    pid_ref: str           # the P&ID drawing reference (the sheet the line appears on)


@dataclass
class ValveRow:
    tag: str               # 'PSV-201', 'PCV-204', 'XV-201', 'HV-201'
    vtype: str             # PSV / PCV / XV / manual (ISA body type)
    service: str           # what it does (from the BoM form text)
    location: str          # line number or equipment tag it sits on
    size: str              # DN / line size where derivable
    set_or_cv: str         # set-pressure (relief) or Cv / "modulating" (control)
    fail_action: str       # FC / FO / FL (fail-closed / open / last)
    pid_ref: str           # P&ID drawing reference


@dataclass
class InstrRow:
    tag: str               # ISA tag, e.g. 'PT-201', 'TT-203', 'FT-201', 'LT-202', 'AT-205'
    isa: str               # the ISA function letters (PT / TT / FT / LT / AT / AT(pH) …)
    service: str           # service description
    measured: str          # measured variable (Pressure / Temperature / Flow / Level / …)
    itype: str             # sensing type (radar / Pt100 / electromagnetic / NDIR / coplanar)
    location: str          # equipment tag or line number it serves
    rng: str               # range where derivable (from the BoM form text)
    signal: str            # 4–20 mA HART / digital (Memosens) / PROFIBUS PA
    loop_ref: str          # loop / P&ID reference


@dataclass
class Schedules:
    archetype: str
    lines: list[LineRow]
    valves: list[ValveRow]
    instruments: list[InstrRow]
    schedule_present: bool = False
    pid_sheet: str = "FF-PID-001"


# ═══════════════════════════════════════════════════════════════════════════
# STATE / BoM helpers  (mirror draw_pid + draw_panel_schedule)
# ═══════════════════════════════════════════════════════════════════════════

def _iter_words(state: dict):
    """Yield (word, name_human, character_id) for every BoM word — same walk as the P&ID."""
    md = state.get("moduleDecomposition") or {}
    for m in (md.get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                cc = w.get("content_character")
                cid = cc.get("character_id", "") if isinstance(cc, dict) else ""
                yield w, (w.get("name_human") or ""), (cid or "")


def _mods(word: dict) -> dict:
    """All modifier_characters as {kind: value} (last write wins, like the renderer)."""
    out = {}
    for mc in (word.get("modifier_characters") or []):
        k = mc.get("kind")
        v = mc.get("value")
        if k and v is not None:
            out[k] = str(v)
    return out


def _qty(mods: dict) -> int:
    """Parse a '×4' / 'x16' / '×25' quantity modifier → int (default 1)."""
    m = re.search(r"(\d+)", str(mods.get("quantity") or ""))
    return int(m.group(1)) if m else 1


# ═══════════════════════════════════════════════════════════════════════════
# CONNECTION-SCHEDULE lookup  (the as-modelled DN / phase / velocity / material)
# ═══════════════════════════════════════════════════════════════════════════

def _spec_for(schedule: dict, frm: str, to: str) -> dict:
    for s in (schedule.get("specs") or []):
        if s.get("from_part") == frm and s.get("to_part") == to:
            return s
    return {}


def _row_for(schedule: dict, frm: str, to: str) -> dict:
    for r in (schedule.get("rows") or []):
        if r.get("from") == frm and r.get("to") == to:
            return r
    return {}


# ═══════════════════════════════════════════════════════════════════════════
# LINE-LIST field derivation
# ═══════════════════════════════════════════════════════════════════════════

# fluid name from the stream head (source-first; most specific patterns first).
_FLUID_TABLE = [
    (r"\bsteam\b|raised_steam|boiling|reboiler", "Steam"),
    (r"condensate", "Condensate"),
    (r"cooling_water|coolant|chilled", "Cooling water"),
    (r"flue_gas|flue gas|\bflue\b|flue_gas_blower", "Flue gas"),
    (r"tail_gas|tail gas|unconverted|recycle_gas", "Tail gas"),
    (r"stripper_overhead|stripped_co2|\bco2\b|carbon_dioxide|co2_feed", "CO₂"),
    (r"\bh2\b|hydrogen|h2_feed", "H₂"),
    (r"rich_amine|lean_amine|\bamine\b|\bmea\b", "MEA amine"),
    (r"koh|k2so4|sulfate|sulphate|crystallis", "K₂SO₄ liquor"),
    (r"slurry|caco3|gypsum|cake|carbonation_reactors", "Process slurry"),
    (r"naphtha", "Naphtha"),
    (r"\bsaf\b|jet|upgraded_liquid|fractionat", "SAF / syncrude"),
    (r"syncrude|wax|effluent", "Reactor effluent"),
    (r"purge", "Purge gas"),
    (r"\bvent\b|offgas|off_gas", "Vent gas"),
    (r"process_water|\bwater\b", "Process water"),
    (r"nitrogen|\bn2\b", "Nitrogen"),
]


def _fluid_name(from_key: str, mc: str, fallback_code: str) -> str:
    """The CARRIED fluid.  A line carries what LEAVES its source, so the stream HEAD (the
    `from` node + the first clause of the material_context, before any 'blended_with' /
    'then' / downstream-equipment mention) is authoritative — otherwise a CO₂ feed line
    'blended_with_H2' mis-reads as H₂, and a stripped-CO₂ line 'to gypsum reactor'
    mis-reads as slurry.  Fall back to the whole blob, then the line-number code."""
    head_mc = re.split(r"blended_with|then|recompress|recover|to_316l|to_atmospheric|"
                       r"\bthen\b|recycled|preheat", (mc or ""), maxsplit=1,
                       flags=re.I)[0]
    head = f"{from_key} {head_mc}".lower()
    for pat, name in _FLUID_TABLE:
        if re.search(pat, head):
            return name
    # nothing in the head — try the whole context (a return / utility line names its fluid
    # later in the string).
    whole = f"{from_key} {mc}".lower()
    for pat, name in _FLUID_TABLE:
        if re.search(pat, whole):
            return name
    # fall back to the line-number's 2-letter service code, humanised
    code_map = {"ST": "Steam", "CD": "Condensate", "CW": "Cooling water", "H2": "H₂",
                "CO": "CO₂", "TG": "Tail gas", "RC": "Recycle gas", "PG": "Purge gas",
                "AM": "MEA amine", "SL": "Process slurry", "NP": "Naphtha",
                "PR": "Process fluid", "SC": "Reactor effluent", "FG": "Flue gas",
                "VT": "Vent gas", "WT": "Process water"}
    return code_map.get(fallback_code, "Process fluid")


def _phase_from(spec: dict, mechanism: str, service_blob: str) -> str:
    """gas / liquid / steam / 2-phase / slurry — prefer the schedule spec, else infer."""
    p = (spec.get("phase") or "").strip().lower()
    if p:
        # the schedule's phase is authoritative; refine a slurry / 2-phase tell from the mc
        if p == "liquid" and re.search(r"slurry|caco3|gypsum|cake|crystallis", service_blob, re.I):
            return "Slurry"
        return p.capitalize()
    if mechanism == "thermal" or re.search(r"\bsteam\b|raised_steam", service_blob, re.I):
        return "Steam"
    if re.search(r"slurry|caco3|gypsum|cake", service_blob, re.I):
        return "Slurry"
    if re.search(r"3phase|three_phase|2phase|hot_and_cold|effluent", service_blob, re.I):
        return "2-phase"
    if re.search(r"\bgas\b|vapou?r|compressed|tail_gas|flue|purge|h2|co2", service_blob, re.I):
        return "Gas"
    if re.search(r"\bamine\b|water|liquid|naphtha|saf|liquor", service_blob, re.I):
        return "Liquid"
    return "—"


def _material_for(spec: dict, service_blob: str, mc: str) -> str:
    """Pipe material / schedule.  Prefer a material called out in the mc / spec text, else
    a sensible default by fluid (hydrogen / amine / slurry → stainless; steam → CS)."""
    blob = f"{spec.get('material_qty_desc') or ''} {mc} {service_blob}"
    m = re.search(r"\b(316L|316|304L|304|321|Duplex|2205|Inconel|Hastelloy|GRP|FRP|"
                  r"HDPE|MDPE|PVC|PTFE.?lined|rubber.?lined)\b", blob, re.I)
    if m:
        return m.group(1).upper().replace("STAINLESS", "316L")
    # carbon-steel for clean dry steam / condensate; stainless for wet / corrosive / H2 /
    # process gas (tail gas + reactor effluent carry water + wax + acids → stainless).
    if re.search(r"\bh2\b|hydrogen", blob, re.I):
        return "316L (H₂ service)"
    if re.search(r"amine|mea|co2|slurry|caco3|gypsum|k2so4|sulfate|naphtha|saf|"
                 r"tail_gas|tail gas|effluent|syncrude|wax|recycle|3phase|three_phase|"
                 r"flue", blob, re.I):
        return "316L"
    if re.search(r"\bsteam\b|condensate", blob, re.I):
        return "CS (A106 Gr.B)"
    return "CS"


def _rating_for(spec: dict, row: dict, edge: dict) -> str:
    """Design rating: a carried FLOW (kg/s, m³/s, t/h) or a DUTY (kW), as the topology
    states it (with the schedule's recomputed figure preferred when present)."""
    # the schedule re-derives a (margined) carried rating per run; prefer it, but keep the
    # topology's unit/value as the base.
    val = edge.get("required_value")
    unit = edge.get("required_unit") or ""
    sval = spec.get("carried_rating")
    sunit = spec.get("carried_unit")
    if sval is not None and sunit:
        val, unit = sval, sunit
    elif row.get("rating"):
        m = re.match(r"\s*([\d.]+)\s*(\S+)", str(row["rating"]))
        if m:
            val, unit = m.group(1), m.group(2)
    if val is None:
        return "—"
    try:
        f = float(val)
    except (TypeError, ValueError):
        return f"{val} {unit}".strip()
    u = unit.strip()
    if u in ("kW", "kw"):
        return f"{f:,.0f} kW"
    if "kg/s" in u:
        return f"{f:,.3f} kg/s" if f < 1 else f"{f:,.2f} kg/s"
    if "m³/s" in u or "m3/s" in u:
        return f"{f:,.4f} m³/s"
    if "t/hr" in u or "t/h" in u:
        return f"{f:,.3f} t/h"
    return f"{f:g} {u}".strip()


def _insulation_for(phase: str, mechanism: str, service_blob: str) -> str:
    """Insulation flag + type.  Hot services (steam / reactor / >~60 °C duty) → hot
    insulation + personnel protection; cold / cryogenic → cold; ambient process → N."""
    b = (service_blob or "").lower()
    if mechanism == "thermal" or phase == "Steam" or re.search(
            r"\bsteam\b|reboiler|exotherm|preheat|hot_|600|1000c|120c|reactor_inlet", b):
        return "Y — hot (PP)"
    if re.search(r"cryo|chilled|cold_box|refriger|liquefied", b):
        return "Y — cold"
    # heat-traced lines (amine, condensate that must not freeze) — heat-trace + insulate
    if re.search(r"amine|condensate|caustic|koh", b):
        return "Y — trace"
    return "N"


def build_line_list(proc, schedule: dict, state: dict) -> list[LineRow]:
    """One row per process / thermal line, with the P&ID's line number + equipment tags
    (read straight off the reconstructed Process) and enriched process columns."""
    topo = PID._topology(state)
    proc_topo = [e for e in topo if e.get("mechanism") != "electrical_bus"]
    tag_of = {n.key: n.tag for n in proc.nodes}
    pid_sheet = "FF-PID-001"

    rows: list[LineRow] = []
    # proc.lines is in the SAME order as proc_topo (draw_pid builds it 1:1), so we can pair.
    for ln, edge in zip(proc.lines, proc_topo):
        mc = edge.get("material_context") or ""
        spec = _spec_for(schedule, ln.from_key, ln.to_key)
        srow = _row_for(schedule, ln.from_key, ln.to_key)
        svc_blob = f"{ln.from_key} {ln.to_key} {mc}"
        # the 2-letter code embedded in the P&ID line number (….-ST-…. → 'ST')
        code_m = re.search(r"-([A-Z]{2})\b", ln.number)
        code = code_m.group(1) if code_m else ""
        fluid = _fluid_name(ln.from_key, mc, code)
        phase = _phase_from(spec, edge.get("mechanism") or "", svc_blob)
        material = _material_for(spec, svc_blob, mc)
        rating = _rating_for(spec, srow, edge)
        insulation = _insulation_for(phase, edge.get("mechanism") or "", svc_blob)
        rows.append(LineRow(
            number=ln.number,
            frm_tag=tag_of.get(ln.from_key, "—"),
            to_tag=tag_of.get(ln.to_key, "—"),
            service=PID._service_text(mc) or PID._humanise(code) or "Process line",
            fluid=fluid,
            phase=phase,
            dn=ln.dn or "—",
            material=material,
            rating=rating,
            insulation=insulation,
            pid_ref=pid_sheet,
        ))
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# VALVE-LIST derivation  (from the BoM valve-family words)
# ═══════════════════════════════════════════════════════════════════════════

# (regex on cid+name, ISA tag prefix, vtype label, default fail-action).
# Each VALVE pattern requires an actual valve/body token — a safety LOGIC SOLVER ('ESD
# chain controller', 'PLC'), a SIGNAL BARRIER, a gas-detection PANEL or an N2 GENERATION
# skid is NOT a valve and must not enter the valve list (those are caught by _VALVE_NOISE).
_VALVE_KINDS = [
    (re.compile(r"relief_valve|\bpsv\b|\bprv\b|safety_valve|pressure.?relief", re.I),
     "PSV", "Pressure relief (PSV)", "—"),
    (re.compile(r"esd_valve|emergency_shutdown_valve|\bxv\b|\bsdv\b|shutoff_valve|"
                r"(?:esd|shutdown|emergency).{0,16}(?:valve|ball|actuat)|"
                r"(?:valve|ball|actuat).{0,16}(?:esd|shutdown)", re.I),
     "XV", "Emergency shutdown (ESD)", "FC"),
    (re.compile(r"control_valve|\bpcv\b|purge_control|control.?valve|"
                r"(?:modulat|throttl).{0,12}valve|globe_valve|valve.*positioner|"
                r"valve.*dvc", re.I),
     "PCV", "Control valve", "FC"),
    (re.compile(r"blanket(?:ing)?_valve|breather|blanketing.{0,20}(?:valve|regulator)|"
                r"(?:valve|regulator).{0,20}breather|n2_blanket", re.I),
     "PV", "Blanketing / breather", "FO"),
    (re.compile(r"isolation_valve|\bhv\b|hand_valve|ball_valve|gate_valve|manual_valve|"
                r"isolat.{0,12}valve|valve.{0,12}isolat", re.I),
     "HV", "Manual isolation", "—"),
]
# words that look valve-ish but are NOT physical valves (logic solvers / signal kit /
# generation packages / detectors) — excluded before classification.  A BLANKETING /
# breather skid IS a packaged valve set (regulator + breather valve) and is kept; an
# INERTING / PSA / N2-GENERATION skid is a utility package and is dropped.
_VALVE_NOISE = re.compile(
    r"barrier|signal|\blabel\b|placard|card|gasket|seal_kit|spare|bracket|sil_barrier|"
    r"controller|logic_solver|\bplc\b|\bcpu\b|panel|detection|detector|monitor|"
    r"inerting_skid|n2_inerting|psa|membrane|generation|annunciator|"
    r"emergency_stop|e_stop|push.?button|\bhmi\b", re.I)


def _parse_set_pressure(mods: dict, mc_text: str) -> str:
    """Relief set-pressure where the BoM / context states one (e.g. '25 bar', 'PED')."""
    blob = f"{mods.get('form','')} {mc_text} {mods.get('rating_primary','')} " \
           f"{mods.get('capacity','')}"
    m = re.search(r"(\d+(?:\.\d+)?)\s*bar", blob, re.I)
    if m:
        return f"{m.group(1)} bar (set)"
    if re.search(r"\bPED\b|2014/68", blob):
        return "PED-set"
    return "—"


def _parse_cv(mods: dict) -> str:
    """Control-valve sizing hint: a Cv / Kv or a capacity figure where stated."""
    blob = f"{mods.get('form','')} {mods.get('capacity','')} {mods.get('rating_primary','')}"
    m = re.search(r"\b(?:Cv|Kv)\s*[=:]?\s*([\d.]+)", blob, re.I)
    if m:
        return f"Cv {m.group(1)}"
    cap = mods.get("capacity")
    if cap and re.search(r"\d", str(cap)):
        return f"≈{str(cap).strip()} kg/h"
    return "modulating"


def _valve_location_and_ref(vtype: str, cid: str, name: str, proc, line_rows):
    """Which line / equipment this valve sits on + its P&ID ref — re-using the P&ID's OWN
    placement logic so the cross-reference is consistent:
      • relief (PSV)  → the P&ID drops a PSV on the first pressure vessel (column / drum /
        vessel / fired) and on the main reactor/column — so locate to that equipment tag.
      • control (PCV) → the P&ID decorates a purge / control / recycle / dosing line.
      • ESD (XV)      → the P&ID decorates the primary feed line.
    Returns (location, pid_ref)."""
    pid_sheet = "FF-PID-001"
    blob = f"{cid} {name}".lower()
    if vtype == "PSV":
        # named reactor/column relief → that vessel; else first pressure vessel (P&ID rule).
        for nd in proc.nodes:
            if re.search(r"reactor|column", nd.key, re.I) and re.search(
                    r"reactor|column|synthesis|absorber|stripper", blob):
                return nd.tag, pid_sheet
        for nd in proc.nodes:
            if nd.sym in (PID.SYM_COLUMN, PID.SYM_DRUM, PID.SYM_VESSEL, PID.SYM_FIRED):
                return nd.tag, pid_sheet
    if vtype in ("PCV",):
        for lr in line_rows:
            if re.search(r"purge|recycle|tail", lr.service, re.I) or lr.number.split("-")[1:2] == ["PG"]:
                return lr.number, pid_sheet
        # the P&ID puts the purge PCV on a purge/recycle/dosing line — pick the first such.
        for lr in line_rows:
            if re.search(r"PG|TG|RC", lr.number):
                return lr.number, pid_sheet
    if vtype == "XV":
        # the P&ID's ESD valve lands on the primary FEED line (first feed/supply line).
        for lr in line_rows:
            if re.search(r"feed|supply|blower", lr.service, re.I) or lr.frm_tag.startswith("K"):
                return lr.number, pid_sheet
        if line_rows:
            return line_rows[0].number, pid_sheet
    if vtype == "PV":
        # blanketing protects a STORAGE / SURGE TANK — locate to the first tank, else a
        # named storage/surge vessel, else a generic vessel/drum.  NEVER a feed line.
        for nd in proc.nodes:
            if nd.sym == PID.SYM_TANK:
                return nd.tag, pid_sheet
        for nd in proc.nodes:
            if re.search(r"storage|surge|buffer|tank|filter|dryer|silo", nd.key, re.I):
                return f"{nd.tag} (storage)", pid_sheet
        for nd in proc.nodes:
            if nd.sym in (PID.SYM_VESSEL, PID.SYM_DRUM):
                return f"{nd.tag} (storage)", pid_sheet
        return "MEA storage tanks", pid_sheet
    # manual isolation / fallback: the feed end.
    if line_rows:
        return line_rows[0].number, pid_sheet
    return "—", pid_sheet


def _valve_size_from(location: str, line_rows) -> str:
    """If the valve sits on a line, inherit that line's DN; on equipment, leave to derive."""
    for lr in line_rows:
        if lr.number == location:
            return lr.dn
    return "line size"


def build_valve_list(proc, schedule: dict, state: dict, line_rows) -> list[ValveRow]:
    rows: list[ValveRow] = []
    tag_seq: dict[str, int] = {}
    seen = set()
    # walk in module order so PSV-201, PSV-202 … read top-to-bottom.
    for w, name, cid in _iter_words(state):
        blob = f"{cid} {name}"
        if _VALVE_NOISE.search(blob):
            continue
        for rx, prefix, vtype, fail in _VALVE_KINDS:
            if not rx.search(blob):
                continue
            key = (prefix, cid or name)
            if key in seen:
                break
            seen.add(key)
            mods = _mods(w)
            qty = _qty(mods)
            location, pid_ref = _valve_location_and_ref(prefix, cid, name, proc, line_rows)
            # one ISA tag per valve TYPE, numbered in the 200 loop range like the P&ID lines
            tag_seq[prefix] = tag_seq.get(prefix, 200) + 1
            tag = f"{prefix}-{tag_seq[prefix]}"
            if qty > 1:
                tag = f"{tag} (×{qty})"
            form = mods.get("form", "") or name
            if prefix == "PSV":
                set_or_cv = _parse_set_pressure(mods, form)
                fail = "—"
            elif prefix == "XV":
                set_or_cv = "on/off (tight-shutoff)"     # ESD = isolating, not modulating
            elif prefix == "PCV":
                set_or_cv = _parse_cv(mods)
            elif prefix == "PV":
                set_or_cv = "reg. + breather"
            else:
                set_or_cv = "—"
            size = _valve_size_from(location, line_rows)
            rows.append(ValveRow(
                tag=tag, vtype=vtype,
                service=_short(form, 60),
                location=location, size=size or "line size",
                set_or_cv=set_or_cv, fail_action=fail, pid_ref=pid_ref))
            break
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# INSTRUMENT-INDEX derivation  (from the BoM instrument words)
# ═══════════════════════════════════════════════════════════════════════════

# (regex, ISA letters, measured variable, sensing-type hint).  Order: specific → generic.
_INSTR_KINDS = [
    (re.compile(r"\bph\b|ph_probe|ph_electrode|liquiline.*ph|\bph/", re.I),
     "AT", "pH / conductivity", "Memosens electrode"),
    (re.compile(r"\borp\b|redox", re.I),
     "AT", "Redox (ORP)", "Pt ORP electrode"),
    (re.compile(r"analy[sz]er|ndir|gas_analys|co2_analys|composition|chromatograph", re.I),
     "AT", "Composition", "NDIR analyser"),
    (re.compile(r"level_transmitter|radar_level|level_sensor|level_gauge|displacer_level|"
                r"\bradar\b", re.I),
     "LT", "Level", "80 GHz radar"),
    (re.compile(r"flow_transmitter|flow_?meter|coriolis|mag_flow|electromagnetic_flow|"
                r"\bpromag\b|orifice", re.I),
     "FT", "Flow", "Electromagnetic"),
    (re.compile(r"pressure_transmitter|rosemount.*pressure|pressure_sensor|"
                r"pressure_gauge|coplanar|\b3051\b", re.I),
     "PT", "Pressure", "Coplanar gauge / DP"),
    (re.compile(r"temperature_transmitter|temp_transmitter|temp_probe|thermowell|"
                r"thermocouple|itherm|\brtd\b|pt100|temperature_sensor|temperature_profile", re.I),
     "TT", "Temperature", "Pt100 + thermowell"),
]
_INSTR_NOISE = re.compile(
    r"catalyst|barrier|sil_barrier|launder|label|relief_valve|control_valve|"
    r"blanket|breather|filter_cloth|gasket", re.I)


def _range_from_form(form: str, measured: str) -> str:
    """Pull a measurement range from the BoM form string, e.g. 'process range to 250 bar',
    '–50 to +600 °C', 'range to 120 m', '–40 to +85 °C electronics'."""
    f = form or ""
    # explicit lo-to-hi with a unit
    m = re.search(r"(?:range\s*)?[–\-]?\d[\d.]*\s*to\s*[+–\-]?\d[\d.]*\s*"
                  r"(?:°?C|bar|m\b|mbar|barg|kPa|MPa)", f, re.I)
    if m:
        return m.group(0).replace("range", "").strip()
    # 'to 250 bar' / 'to 120 m' single-bound
    m = re.search(r"(?:range\s*)?to\s*\d[\d.]*\s*(?:bar|m\b|°?C|mbar|kPa)", f, re.I)
    if m:
        return m.group(0).strip()
    # DN span for flow meters (DN25–DN300)
    m = re.search(r"DN\s?\d+\s*[–\-]\s*DN\s?\d+", f, re.I)
    if m and measured == "Flow":
        return m.group(0).strip()
    return "—"


def _signal_from_form(form: str) -> str:
    f = (form or "").lower()
    sig = []
    if re.search(r"4.?20\s*ma", f):
        sig.append("4–20 mA")
    if "hart" in f:
        sig.append("HART")
    if "profibus" in f:
        sig.append("PROFIBUS PA")
    if "memosens" in f and not sig:
        sig.append("Memosens digital")
    elif "memosens" in f:
        sig.append("Memosens")
    if not sig:
        return "4–20 mA"            # plant default for a field transmitter
    return " / ".join(dict.fromkeys(sig))


def _instr_location(isa: str, cid: str, name: str, proc, line_rows) -> str:
    """Where the instrument sits — by ISA convention + any explicit equipment tell in the
    BoM word (reactor / absorber / stripper / tank / feed line)."""
    blob = f"{cid} {name}".lower()
    # explicit equipment tell wins
    for nd in proc.nodes:
        toks = [t for t in re.split(r"[_\s]+", nd.key) if len(t) > 3]
        if any(t in blob for t in toks):
            return nd.tag
    # ISA convention: flow → a feed line; level/pressure/analyser → main vessel; temp → reactor
    if isa == "FT":
        for lr in line_rows:
            if lr.frm_tag.startswith("K") or re.search(r"feed|flow", lr.service, re.I):
                return f"lines (e.g. {lr.number})"
        if line_rows:
            return f"lines (e.g. {line_rows[0].number})"
    # pick the principal vessel (reactor / column) for L/P/T/A
    for nd in proc.nodes:
        if re.search(r"reactor|synthesis|absorber|stripper|carbonation", nd.key, re.I):
            return f"vessels (e.g. {nd.tag})"
    for nd in proc.nodes:
        if nd.sym in (PID.SYM_COLUMN, PID.SYM_DRUM, PID.SYM_VESSEL, PID.SYM_TANK):
            return f"vessels (e.g. {nd.tag})"
    return "process-wide"


def build_instrument_index(proc, state: dict, line_rows) -> list[InstrRow]:
    rows: list[InstrRow] = []
    tag_seq: dict[str, int] = {}
    seen = set()
    for w, name, cid in _iter_words(state):
        blob = f"{cid} {name}"
        if _INSTR_NOISE.search(blob):
            continue
        for rx, isa, measured, itype_default in _INSTR_KINDS:
            if not rx.search(blob):
                continue
            key = (isa, measured, cid or name)
            if key in seen:
                break
            seen.add(key)
            mods = _mods(w)
            qty = _qty(mods)
            form = mods.get("form", "") or ""
            # ISA tag in the 200 loop range to align with the line numbers
            tag_seq[isa] = tag_seq.get(isa, 200) + 1
            base_tag = f"{isa}-{tag_seq[isa]}"
            tag = f"{base_tag} (×{qty})" if qty > 1 else base_tag
            # sensing type: prefer a specific tell in the form, else the kind default
            itype = itype_default
            mt = re.search(r"\b(80 GHz radar|coplanar|Pt100|electromagnetic|NDIR|"
                           r"Memosens|multipoint|displacer|Coriolis)\b", form, re.I)
            if mt:
                itype = mt.group(1)
            isa_label = isa
            if measured.startswith("pH"):
                isa_label = "AT (pH)"
            elif measured.startswith("Redox"):
                isa_label = "AT (ORP)"
            elif measured == "Composition":
                isa_label = "AT"
            rng = _range_from_form(form, measured)
            mfr_pn = " ".join(x for x in (mods.get("manufacturer", ""),
                                          mods.get("part_number", "")) if x).strip()
            service = (name or PID._humanise(cid))
            if mfr_pn:
                service = f"{service} — {mfr_pn}"
            rows.append(InstrRow(
                tag=tag, isa=isa_label, service=_short(service, 56),
                measured=measured, itype=_short(itype, 22),
                location=_instr_location(isa, cid, name, proc, line_rows),
                rng=rng, signal=_signal_from_form(form),
                loop_ref="FF-PID-001"))
            break
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# small text helpers
# ═══════════════════════════════════════════════════════════════════════════

def _short(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


# ═══════════════════════════════════════════════════════════════════════════
# ASSEMBLY
# ═══════════════════════════════════════════════════════════════════════════

def reconstruct_schedules(schedule: dict, state: dict) -> Schedules:
    """Build the three schedules from the P&ID's canonical Process reconstruction."""
    proc = PID.reconstruct_process(schedule, state)
    line_rows = build_line_list(proc, schedule, state)
    valve_rows = build_valve_list(proc, schedule, state, line_rows)
    instr_rows = build_instrument_index(proc, state, line_rows)
    return Schedules(
        archetype=proc.archetype, lines=line_rows, valves=valve_rows,
        instruments=instr_rows, schedule_present=bool(schedule.get("rows")))


# ═══════════════════════════════════════════════════════════════════════════
# MARKDOWN RENDER
# ═══════════════════════════════════════════════════════════════════════════

_SCOPE_NOTE = ("Scope: as-modelled major process lines, valves and instruments, projected "
               "from the process topology + connection schedule — cross-referenced to the "
               "P&ID. **Not for construction · as-modelled.**")


def render_markdown(sc: Schedules) -> str:
    arch = PID._humanise(sc.archetype)
    out = []
    out.append(f"# PROCESS SCHEDULES — {arch}\n")
    out.append("> Fractional Forge · ForgeOS — line list · valve list · instrument index. "
               "Auto-generated; cross-referenced line-for-line to the P&ID "
               f"(`{sc.pid_sheet}`). Not for construction · as-modelled.\n")
    if not sc.schedule_present:
        out.append("> Line sizes inferred from process duties (connection schedule not "
                   "supplied); DN shown is indicative.\n")

    # ── LINE LIST ──
    out.append("\n## 1 · LINE LIST\n")
    out.append("| Line no. | From | To | Service | Fluid | Phase | DN | Material | "
               "Design rating | Insul. | P&ID |")
    out.append("|---|---|---|---|---|---|---|---|---|:--:|---|")
    for r in sc.lines:
        out.append(f"| `{r.number}` | {r.frm_tag} | {r.to_tag} | {_short(r.service,40)} | "
                   f"{r.fluid} | {r.phase} | {r.dn} | {r.material} | {r.rating} | "
                   f"{r.insulation} | {r.pid_ref} |")
    out.append(f"\n*{len(sc.lines)} process lines.*\n")

    # ── VALVE LIST ──
    out.append("\n## 2 · VALVE LIST\n")
    out.append("| Tag | Type | Service | Line / location | Size | Set / Cv | Fail | P&ID |")
    out.append("|---|---|---|---|---|---|:--:|---|")
    for v in sc.valves:
        out.append(f"| `{v.tag}` | {v.vtype} | {_short(v.service,52)} | {v.location} | "
                   f"{v.size} | {v.set_or_cv} | {v.fail_action} | {v.pid_ref} |")
    out.append(f"\n*{len(sc.valves)} valve types (control / relief / isolation / ESD). "
               "Fail-action: FC = fail-closed, FO = fail-open.*\n")

    # ── INSTRUMENT INDEX ──
    out.append("\n## 3 · INSTRUMENT INDEX\n")
    out.append("| Tag | ISA | Service | Measured | Type | Location | Range | Signal | "
               "Loop |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    for i in sc.instruments:
        out.append(f"| `{i.tag}` | {i.isa} | {_short(i.service,46)} | {i.measured} | "
                   f"{i.itype} | {i.location} | {i.rng} | {i.signal} | {i.loop_ref} |")
    out.append(f"\n*{len(sc.instruments)} instrument types (ISA — LT level · PT pressure · "
               "TT temperature · FT flow · AT analyser).*\n")

    out.append(f"\n> {_SCOPE_NOTE.replace(chr(10),' ')}\n")
    return "\n".join(out) + "\n"


# ═══════════════════════════════════════════════════════════════════════════
# SVG TABLE RENDER  (light-mode, embeddable drawing) + RASTERISE
# ═══════════════════════════════════════════════════════════════════════════

INK = "#1a1a1a"
HEAD_INK = "#10243e"
ACCENT = "#1a5fb4"
FILL_BG = "#ffffff"
PANEL_BG = "#f4f6f9"
HEAD_BG = "#e8edf4"
GRID_FAINT = "#d3dae3"
MUTED = "#5b6470"
WARM = "#b5462a"


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}"{d}/>')

    def rect(self, x, y, w, h, stroke="none", width=1.0, fill="none", rx=0):
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')

    def text(self, x, y, s, size=11, anchor="start", fill=INK, weight="normal",
             mono=False):
        fam = ("'DejaVu Sans Mono','Menlo',monospace" if mono
               else "Helvetica, Arial, sans-serif")
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" font-size="{size}" '
                 f'text-anchor="{anchor}" fill="{fill}" font-weight="{weight}">'
                 f'{_esc(s)}</text>')

    def render(self) -> str:
        body = "\n".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


def _cell_anchor(cx, w, align):
    pad = 8
    if align == "r":
        return cx + w - pad, "end"
    if align == "c":
        return cx + w / 2, "middle"
    return cx + pad, "start"


_ROW_H = 21
_HEAD_H = 24
_MARGIN = 34


def _draw_table(svg, x, y, cols, rows_cells, title, subtitle):
    """Draw one titled table block. cols = [(label,width,align)]; rows_cells = list of
    [(value, mono_bool)] aligned to cols.  Returns the y after the block."""
    table_w = sum(c[1] for c in cols)
    # title
    svg.text(x, y, title, size=13, weight="bold", fill=HEAD_INK)
    if subtitle:
        svg.text(x + table_w, y, subtitle, size=9, anchor="end", fill=MUTED)
    y += 10
    # header band
    svg.rect(x, y, table_w, _HEAD_H, fill=HEAD_BG, stroke=GRID_FAINT, width=1.0)
    cx = x
    for (label, w, align) in cols:
        tx, anc = _cell_anchor(cx, w, align)
        svg.text(tx, y + 16, label, size=9.0, weight="bold", fill=HEAD_INK, anchor=anc)
        cx += w
    total_h = _HEAD_H + len(rows_cells) * _ROW_H
    # vertical rules
    cx = x
    for (_l, w, _a) in cols:
        svg.line(cx, y, cx, y + total_h, stroke=GRID_FAINT, width=0.8)
        cx += w
    svg.line(cx, y, cx, y + total_h, stroke=GRID_FAINT, width=0.8)
    ry = y + _HEAD_H
    for ridx, cells in enumerate(rows_cells):
        if ridx % 2 == 1:
            svg.rect(x, ry, table_w, _ROW_H, fill=PANEL_BG)
        cx = x
        for (val, mono), (_l, w, align) in zip(cells, cols):
            tx, anc = _cell_anchor(cx, w, align)
            fill = ACCENT if mono else INK
            svg.text(tx, ry + 14.5, val, size=8.7, anchor=anc, fill=fill, mono=mono)
            cx += w
        svg.line(x, ry, x + table_w, ry, stroke=GRID_FAINT, width=0.6)
        ry += _ROW_H
    svg.rect(x, y, table_w, total_h, stroke=INK, width=1.3)
    return ry + 16


# column layouts per table (header, width, align, mono?)
_LINE_COLS = [
    ("Line no.", 116, "l"), ("From", 52, "c"), ("To", 52, "c"),
    ("Service", 220, "l"), ("Fluid", 96, "l"), ("Phase", 64, "c"),
    ("DN", 60, "c"), ("Material", 116, "l"), ("Design rating", 104, "r"),
    ("Insul.", 84, "c"), ("P&ID", 92, "c"),
]
_LINE_MONO = {0, 1, 2, 6}     # line no. + tags + DN in mono
_VALVE_COLS = [
    ("Tag", 96, "l"), ("Type", 168, "l"), ("Service", 300, "l"),
    ("Line / loc.", 120, "c"), ("Size", 78, "c"), ("Set / Cv", 120, "c"),
    ("Fail", 52, "c"), ("P&ID", 92, "c"),
]
_VALVE_MONO = {0, 3}
_INSTR_COLS = [
    ("Tag", 92, "l"), ("ISA", 66, "c"), ("Service", 290, "l"),
    ("Measured", 116, "l"), ("Type", 138, "l"), ("Location", 132, "l"),
    ("Range", 128, "l"), ("Signal", 130, "l"), ("Loop", 86, "c"),
]
_INSTR_MONO = {0}


def build_table_svg(sc: Schedules) -> str:
    arch = PID._humanise(sc.archetype)
    line_w = sum(c[1] for c in _LINE_COLS)
    valve_w = sum(c[1] for c in _VALVE_COLS)
    instr_w = sum(c[1] for c in _INSTR_COLS)
    table_w = max(line_w, valve_w, instr_w)
    width = table_w + 2 * _MARGIN

    # measure height: banner + 3 blocks (title+10 + head + rows + 16 gap) + title block
    def block_h(n):
        return 10 + _HEAD_H + n * _ROW_H + 16 + 14   # +14 for title line
    height = (96
              + block_h(len(sc.lines))
              + block_h(len(sc.valves))
              + block_h(len(sc.instruments))
              + 84)

    svg = SVG(width, int(math.ceil(height)))
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)

    # banner
    svg.text(_MARGIN, 46, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(_MARGIN, 70, f"PROCESS SCHEDULES — {arch}", size=18, weight="bold",
             fill=HEAD_INK)
    svg.text(width - _MARGIN, 70,
             f"Line list · Valve list · Instrument index  ·  P&ID {sc.pid_sheet}",
             size=9.5, anchor="end", fill=MUTED)
    svg.line(_MARGIN, 80, width - _MARGIN, 80, stroke=GRID_FAINT, width=1.0)
    y = 110

    # ── LINE LIST ──
    line_cells = []
    for i, r in enumerate(sc.lines):
        vals = [r.number, r.frm_tag, r.to_tag, _short(r.service, 38), r.fluid, r.phase,
                r.dn, _short(r.material, 18), r.rating, r.insulation, r.pid_ref]
        line_cells.append([(v, (j in _LINE_MONO)) for j, v in enumerate(vals)])
    y = _draw_table(svg, _MARGIN, y, _LINE_COLS, line_cells,
                    "1 · LINE LIST",
                    f"{len(sc.lines)} process lines · line numbers match the P&ID")

    # ── VALVE LIST ──
    valve_cells = []
    for v in sc.valves:
        vals = [v.tag, v.vtype, _short(v.service, 56), v.location, v.size, v.set_or_cv,
                v.fail_action, v.pid_ref]
        valve_cells.append([(val, (j in _VALVE_MONO)) for j, val in enumerate(vals)])
    y = _draw_table(svg, _MARGIN, y, _VALVE_COLS, valve_cells,
                    "2 · VALVE LIST",
                    f"{len(sc.valves)} valve types · FC fail-closed / FO fail-open")

    # ── INSTRUMENT INDEX ──
    instr_cells = []
    for ins in sc.instruments:
        vals = [ins.tag, ins.isa, _short(ins.service, 54), ins.measured, ins.itype,
                ins.location, ins.rng, ins.signal, ins.loop_ref]
        instr_cells.append([(val, (j in _INSTR_MONO)) for j, val in enumerate(vals)])
    y = _draw_table(svg, _MARGIN, y, _INSTR_COLS, instr_cells,
                    "3 · INSTRUMENT INDEX",
                    f"{len(sc.instruments)} instrument types · ISA LT/PT/TT/FT/AT")

    _draw_title_block(svg, arch, width, int(math.ceil(height)), sc)
    return svg.render()


def _draw_title_block(svg, archetype, width, height, sc: Schedules):
    y0 = height - 66
    svg.line(30, y0, width - 30, y0, stroke=INK, width=1.4)
    bw = 300
    bx0 = width - 30 - bw
    by0 = y0 + 10
    rows = [("DRAWING No.", "FF-PROC-SCH-001"), ("REV", "—   (placeholder)"),
            ("PAIRS WITH", sc.pid_sheet + " (P&ID)"), ("DATE", "YYYY-MM-DD")]
    rh = 12
    svg.rect(bx0, by0, bw, rh * len(rows), stroke=INK, width=1.1, fill=FILL_BG)
    for i, (k, v) in enumerate(rows):
        ry = by0 + i * rh
        if i:
            svg.line(bx0, ry, bx0 + bw, ry, stroke=GRID_FAINT, width=0.8)
        svg.line(bx0 + 104, by0, bx0 + 104, by0 + rh * len(rows), stroke=GRID_FAINT,
                 width=0.8)
        svg.text(bx0 + 6, ry + 9, k, size=7.5, fill=MUTED, weight="bold")
        svg.text(bx0 + 108, ry + 9, v, size=7.8)
    svg.text(30, y0 + 16, "FRACTIONAL FORGE · ForgeOS", size=10, weight="bold")
    svg.text(30, y0 + 32, f"PROCESS SCHEDULES — {archetype}", size=12, weight="bold",
             fill=HEAD_INK)
    svg.text(30, y0 + 47,
             "Scope: line list · valve list · instrument index, projected from the process "
             "topology + connection schedule. Cross-referenced to the P&ID. "
             "Not for construction · as-modelled.", size=8.2, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def generate_process_schedules(out_dir: str, state_path: Optional[str] = None,
                               rasterise_png: bool = True):
    """Full pipeline: load (via the P&ID's loader) → reconstruct → render MD + SVG (+ PNG)."""
    schedule, state = PID.load_inputs(out_dir, state_path)
    sc = reconstruct_schedules(schedule, state)

    md = render_markdown(sc)
    svg_text = build_table_svg(sc)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    md_path = draw_dir / "process-schedules.md"
    svg_path = draw_dir / "process-schedules.svg"
    png_path = draw_dir / "process-schedules.png"
    md_path.write_text(md)
    svg_path.write_text(svg_text)
    png_ok = PID.rasterise(svg_path, png_path) if rasterise_png else False

    summary = {
        "archetype": sc.archetype,
        "md": str(md_path),
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "lines": len(sc.lines),
        "valves": len(sc.valves),
        "instruments": len(sc.instruments),
        "schedule_present": sc.schedule_present,
    }
    return summary, sc, md


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, sc, _md = generate_process_schedules(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[proc-sched] ERROR: {ex}")
        return 2
    print(f"[proc-sched] archetype    : {summary['archetype']}")
    print(f"[proc-sched] lines        : {summary['lines']}")
    print(f"[proc-sched] valves       : {summary['valves']}")
    print(f"[proc-sched] instruments  : {summary['instruments']}")
    print(f"[proc-sched] schedule used : {summary['schedule_present']}")
    print(f"[proc-sched] MD  → {summary['md']}")
    print(f"[proc-sched] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[proc-sched] PNG → {summary['png']}")
    else:
        print("[proc-sched] PNG not written (no rasteriser available — SVG is master)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
