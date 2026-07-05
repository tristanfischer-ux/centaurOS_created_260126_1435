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
import json
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
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)
import canonical_tags  # noqa: E402  (the SHARED auxiliary-tag authority — one tag, BoM + drawings)
import connection_sizing as CS  # noqa: E402  (pump-duty line-DN + PSV-set derivation, below)

# Deterministic title-block issue date for THIS run (YYYY-MM-DD), set by
# generate_process_schedules() from the run's own artifacts; '' until set ('—').
_ISSUE_DATE = ""


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


# ── route-manifest process lines (the FULL set the Blender model routed) ─────
# The P&ID topology spine carries only the principal flow edges (≈7), but the
# route-manifest written by build_universal_scene.py enumerates EVERY routed run
# (≈100) — including the tie-in line into the loop for every synthesised
# life-support system (make-up, dosing, sludge, chilling, mortality, …). The
# line list must show ALL of these PROCESS lines, and the valve list must be able
# to cite each valve's OWN line. We read the manifest here (additive, no-op when
# absent) and keep the FLUID / thermal lines (power feeders + signal cables
# belong on the single-line + instrument index, not the process line list).
_NON_PROCESS_MECH = {"electrical_bus", "signal", "power", "control"}


def _load_route_lines(out_dir: Optional[str]) -> list[dict]:
    """The de-duplicated route-manifest lines (by line number). Empty when no
    out_dir / no manifest. Each dict carries line_number / mechanism / from_tag /
    to_tag / service / size_label."""
    if not out_dir:
        return []
    try:
        man = json.loads((Path(out_dir) / "route-manifest.json").read_text())
    except Exception:
        return []
    seen: set = set()
    out: list[dict] = []
    for l in (man.get("lines") or []):
        if not isinstance(l, dict):
            continue
        ln = l.get("line_number")
        if not ln or ln in seen:
            continue
        seen.add(ln)
        out.append(l)
    return out


def _is_process_route(l: dict) -> bool:
    """A route is a PROCESS (pipe) line — drawn on the line list — when it is a
    fluid / thermal / gas run, not a power feeder or an instrument signal cable.
    Keyed on mechanism + a power/signal service tell, never a class."""
    mech = (l.get("mechanism") or "").lower()
    if mech in _NON_PROCESS_MECH:
        return False
    svc = (l.get("service") or "").lower()
    if re.search(r"power feeder|lv power|signal cable|4-20\s*ma|instrument signal|"
                 r"\bfeeder 400|ring.?main|switchboard", svc):
        return False
    return True


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


def _normalise_material(raw: str) -> str:
    """Humanise a route-manifest `material` value into a short line-list display token,
    preserving the grade. 'HDPE/PE100 (water service)' → 'HDPE/PE100', '316L stainless
    (oxidiser service)' → '316L', 'carbon steel (assumed)' → 'CS'. Returns '' when nothing
    recognisable is present (caller then falls back to the fluid-based default)."""
    s = (raw or "").strip()
    if not s:
        return ""
    head = re.split(r"\s*\(", s, maxsplit=1)[0].strip()  # drop the '(… service)' qualifier
    m = re.search(r"\b(316L|316|304L|304|321|Duplex|2205|Inconel|Hastelloy|GRP|FRP|"
                  r"HDPE(?:/PE\s?100)?|PE\s?100|MDPE|PVC-?U?|CPVC|PP|PVDF|PTFE.?lined|"
                  r"GRE|rubber.?lined|titanium|cupronickel|copper.?nickel)\b", head, re.I)
    if m:
        return m.group(1).upper().replace(" ", "")
    if re.search(r"carbon\s*steel|\bcs\b|a106|a53", head, re.I):
        return "CS (A106 Gr.B)" if re.search(r"a106", head, re.I) else "CS"
    if re.search(r"stainless", head, re.I):
        return "316L"
    return head[:18]


def _material_for(spec: dict, service_blob: str, mc: str,
                  manifest_material: str = "") -> str:
    """Pipe material / schedule. PRIORITY: the route-manifest `material` field — that is the
    LEDGER value (connection_sizing.corrosive_service_material set it: HDPE for water mains,
    316L for LOX/ozone/oxidiser service, CS for air/inert). The drawing must print the ledger
    material, never a fixed CS default. Only when the manifest carries no material (e.g. a
    topology-spine line the manifest didn't enumerate) do we fall back to a material called
    out in the mc/spec text, then a sensible default by fluid."""
    led = _normalise_material(manifest_material)
    if led:
        return led
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


def build_line_list(proc, schedule: dict, state: dict,
                    out_dir: Optional[str] = None) -> list[LineRow]:
    """One row per process / thermal line, with the P&ID's line number + equipment tags
    (read straight off the reconstructed Process) and enriched process columns.

    The principal spine lines come from the reconstructed Process (≈7); when an out_dir
    is supplied, EVERY further routed PROCESS run in route-manifest.json (the synthesised
    life-support tie-ins: make-up, dosing, sludge, chilling, …) is appended too, so the
    line list is the COMPLETE process line schedule — not just the topology spine. Power
    feeders + instrument signal cables are excluded (they belong on the single-line +
    instrument index). Additive + deterministic; byte-identical to the prior 7-row list
    when out_dir is absent."""
    topo = PID._topology(state)
    proc_topo = [e for e in topo if e.get("mechanism") != "electrical_bus"]
    tag_of = {n.key: n.tag for n in proc.nodes}
    # topology-key → human LABEL (e.g. 'softener_vessel' → 'Softener Vessel'). The
    # connection-schedule's `specs`/`rows` are keyed by the human name (from_part /
    # from), NOT the topology key — joining on the raw key silently missed on every
    # topology-spine line (DN showed '—' even though the schedule sized every one of
    # them), which was the root cause of most "Size" placeholders downstream on the
    # valve list (2026-07-04, routed gap #2). Join on the label, always.
    label_of = {n.key: n.label for n in proc.nodes}
    # canonical name → equipment-tag map so routed-line endpoints (human names) resolve
    # to the SAME tag the BoM/GA use, never an invented abbreviation.
    tag_by_name = _manifest_tag_by_name(out_dir)
    pid_sheet = "FF-PID-001"

    # LEDGER material per line number, read from the route-manifest (the authoritative source —
    # connection_sizing.corrosive_service_material wrote it). The line list MUST print this, not
    # a fixed CS default, so HDPE water mains / 316L oxidiser lines render their real material.
    mat_by_line = {l.get("line_number"): l.get("material")
                   for l in _load_route_lines(out_dir)
                   if l.get("line_number")}

    rows: list[LineRow] = []
    seen_numbers: set = set()
    # proc.lines is in the SAME order as proc_topo (draw_pid builds it 1:1), so we can pair.
    for ln, edge in zip(proc.lines, proc_topo):
        mc = edge.get("material_context") or ""
        # join on the LABEL (the schedule's own key on SOME archetypes — e.g. water_treatment
        # writes 'Gac Softener'), falling back to the raw topology KEY (the convention OTHER
        # archetypes' connection-schedule writer uses — e.g. co2_mineralisation writes
        # 'absorber_column' verbatim as from_part/to_part). Two real conventions exist
        # upstream; try both rather than assume one, so this join never regresses either.
        frm_label = label_of.get(ln.from_key, ln.from_key)
        to_label = label_of.get(ln.to_key, ln.to_key)
        spec = _spec_for(schedule, frm_label, to_label) or _spec_for(schedule, ln.from_key, ln.to_key)
        srow = _row_for(schedule, frm_label, to_label) or _row_for(schedule, ln.from_key, ln.to_key)
        svc_blob = f"{ln.from_key} {ln.to_key} {mc}"
        # the 2-letter code embedded in the P&ID line number (….-ST-…. → 'ST')
        code_m = re.search(r"-([A-Z]{2})\b", ln.number)
        code = code_m.group(1) if code_m else ""
        fluid = _fluid_name(ln.from_key, mc, code)
        phase = _phase_from(spec, edge.get("mechanism") or "", svc_blob)
        material = _material_for(spec, svc_blob, mc, mat_by_line.get(ln.number, ""))
        rating = _rating_for(spec, srow, edge)
        insulation = _insulation_for(phase, edge.get("mechanism") or "", svc_blob)
        seen_numbers.add(ln.number)
        rows.append(LineRow(
            number=ln.number,
            frm_tag=tag_of.get(ln.from_key, "—"),
            to_tag=tag_of.get(ln.to_key, "—"),
            service=PID._service_text(mc) or PID._humanise(code) or "Process line",
            fluid=fluid,
            phase=phase,
            dn=ln.dn or _dn_of_size(spec.get("size_label")) or _dn_of_size(srow.get("size")) or "—",
            material=material,
            rating=rating,
            insulation=insulation,
            pid_ref=pid_sheet,
        ))

    # ── append the remaining ROUTED process lines from the manifest ──
    for l in _load_route_lines(out_dir):
        num = l.get("line_number")
        if not num or num in seen_numbers or not _is_process_route(l):
            continue
        seen_numbers.add(num)
        frm = l.get("from_tag") or ""
        to = l.get("to_tag") or ""
        svc_raw = l.get("service") or ""
        svc_blob = f"{frm} {to} {svc_raw}"
        code_m = re.search(r"-([A-Z]{2})\b", str(num))
        code = code_m.group(1) if code_m else ""
        dn = _dn_of_size(l.get("size_label")) or (f"DN{_dn_in(num)}" if _dn_in(num) else "—")
        mech = l.get("mechanism") or ""
        phase = _phase_from({}, mech, svc_blob)
        rows.append(LineRow(
            number=str(num),
            frm_tag=_resolve_endpoint_tag(frm, proc, tag_by_name),
            to_tag=_resolve_endpoint_tag(to, proc, tag_by_name),
            service=_humanise_route_service(svc_raw) or PID._humanise(code) or "Process line",
            fluid=_fluid_name(frm, svc_raw, code),
            phase=phase,
            dn=dn,
            material=_material_for({}, svc_blob, svc_raw, l.get("material", "")),
            rating="as-routed",
            insulation=_insulation_for(phase, mech, svc_blob),
            pid_ref=pid_sheet,
        ))
    return rows


def _dn_of_size(size_label) -> str:
    m = re.search(r"\bDN\s?(\d+)\b", str(size_label or ""), re.I)
    return "DN" + m.group(1) if m else ""


def _dn_in(line_number) -> str:
    m = re.search(r"-DN(\d+)\b", str(line_number or ""), re.I)
    return m.group(1) if m else ""


def _looks_like_tag(s: str) -> bool:
    """A short ISA-style equipment tag (e.g. 'TK-101', 'P-103', 'X-110') rather than a
    long humanised name."""
    return bool(re.fullmatch(r"[A-Z]{1,4}-?\d{1,4}", str(s or "").strip()))


def _short_tag(key: str) -> str:
    """A readable short tag for an endpoint with no resolved equipment tag (a header /
    abstract supply): the key's initials, e.g. electrical_supply → 'ES'. LAST RESORT
    only — _resolve_endpoint_tag prefers the real canonical tag first."""
    toks = [t for t in re.split(r"[_\s]+", str(key or "")) if t]
    return ("".join(t[0] for t in toks[:3]) or (str(key or "")[:3])).upper() or "—"


def _manifest_tag_by_name(out_dir: Optional[str]) -> dict:
    """{canonical part name (lower) → equipment tag} from parts-manifest.json, so a
    ROUTED line whose endpoint is a NAME ('Rearing Tank') resolves to the SAME canonical
    tag ('TK-101') the BoM / GA / P&ID use — never an invented abbreviation ('RT')
    (Tristan 2026-06-21: one identity for each part across everything). First instance of
    a repeated name wins (the farm representative)."""
    if not out_dir:
        return {}
    p = os.path.join(out_dir, "parts-manifest.json")
    if not os.path.exists(p):
        return {}
    try:
        pm = json.load(open(p))
    except Exception:  # noqa: BLE001
        return {}
    items = pm.get("parts") or pm.get("items") or (pm if isinstance(pm, list) else [])
    by: dict = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        nm = str(it.get("name") or "").strip().lower()
        tg = str(it.get("equipment_tag") or it.get("tag") or "").strip()
        if nm and tg and _looks_like_tag(tg):
            by.setdefault(nm, tg)
    return by


def _resolve_endpoint_tag(raw: str, proc, by_name: dict) -> str:
    """Resolve a routed-line endpoint to its CANONICAL equipment tag so the line list
    shares ONE identity with the BoM / GA / P&ID. Order: already-a-tag → parts-manifest
    name→tag → reconstructed-process node token match → last-resort initials. Never
    invents an abbreviation ('RT') when a real canonical tag ('TK-101') exists."""
    s = str(raw or "").strip()
    if not s:
        return "—"
    if _looks_like_tag(s):
        return s
    t = by_name.get(s.lower())
    if t:
        return t
    toks = [w for w in re.split(r"[_\s]+", s.lower()) if len(w) > 3]
    if toks and proc is not None:
        for nd in getattr(proc, "nodes", []):
            k = str(getattr(nd, "key", "")).lower()
            if toks and all(w in k for w in toks):
                return nd.tag
    return _short_tag(s)


def _humanise_route_service(svc: str) -> str:
    """A route-manifest service string is often a long snake_case clause; take a short,
    readable head for the line-list service column."""
    if not svc:
        return ""
    s = re.split(r"[._]", svc)
    head = " ".join(s[:8]).strip()
    head = re.sub(r"\s+", " ", head)
    return head[:1].upper() + head[1:] if head else ""


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
    # Solenoid on/off shut-off valve (e.g. the emergency-O₂ solenoid). A powered isolating
    # device — its fail-action is read FROM the ledger (the emergency-O₂ solenoid is fail-open
    # per its own text + o2_dosing_valve_fail_state=1); the FC here is only a default.
    (re.compile(r"solenoid_valve|\bsolenoid\b|sov\b|on.?off_valve|shut.?off_solenoid", re.I),
     "XV", "Solenoid shut-off", "FC"),
    # Non-return / check valve — a passive one-way device (no fail-action). Was MISSING, so a
    # "Check Valve" BoM line entered no schedule row and the P&ID/process-schedule coverage dropped.
    # Default fail-action is 'n/a (passive)', not a bare '—': a check valve has no powered
    # fail-state to state at all (legitimately inapplicable, distinct from a genuine unknown
    # — routed gap #2). Short form (the Type column already says "Non-return (check)" — the
    # fuller basis lives in the Set/Cv cell + the table footnote); the narrow Fail column
    # (52-90 px) cannot hold a long phrase without overflowing into its neighbours.
    (re.compile(r"check[_ ]?valve|non.?return|\bnrv\b|one.?way.?valve|foot.?valve|clack_valve", re.I),
     "NV", "Non-return (check)", "n/a (passive)"),
    # Actuated on/off isolation (pneumatic / electric / motorised actuator) — a powered isolating
    # valve that is NOT an ESD/solenoid by name. Catches "Pneumatic Actuated Valve", "Automated Ball
    # Valve", a bare "Pneumatic Actuator". (The XV/ESD + solenoid rules above need an esd/shutdown/
    # solenoid keyword, so a plainly-"actuated" valve fell through to nothing.)
    (re.compile(r"pneumatic.{0,14}(?:actuat|valve)|(?:actuat|automat|motor(?:is|iz)ed).{0,14}valve|"
                r"actuated_valve|automated_ball|\bactuator\b", re.I),
     "XV", "Actuated isolation", "FC"),
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


# ── FAIL-ACTION from the LEDGER (universal — never a fixed default) ──────────────────
# A valve's drawn fail-action is its LEDGER fail-state, not the kind's default. Two ledger
# sources, in priority order:
#   (1) the valve word's OWN text — the synthesiser states the safe failure mode in the
#       form / rating_primary ('fail-open', 'energise-to-close', 'loss of power admits O₂';
#       or 'fail-closed', 'spring-return closed', 'de-energise to close / isolate');
#   (2) a contract '*_fail_state' quantity matched to the valve by SERVICE tokens — e.g.
#       o2_dosing_valve_fail_state=1 (1 = fail-open). The O₂ dosing valves + the emergency-O₂
#       solenoid are life-critical FAIL-OPEN; a fixed FC default is the divergence this fixes.
# Universal across classes: the fail-state is read from the ledger, never hard-coded.
_FAIL_OPEN_TEXT_RE = re.compile(
    r"fail.?open|energise.?to.?close|energize.?to.?close|normally.?open|"
    r"admits? (?:o₂|o2|oxygen)|power loss admits|loss of power admits", re.I)
_FAIL_CLOSED_TEXT_RE = re.compile(
    r"fail.?closed|fail.?close|energise.?to.?open|energize.?to.?open|normally.?closed|"
    r"spring.?return closed|de.?energise.?to.?close|tight.?shutoff on trip", re.I)
# Contract fail-state quantity keys → which valve SERVICE tokens they govern. Universal:
# the key name carries the service ('o2_dosing_valve_fail_state' → an O₂ dosing valve).
_FAIL_STATE_KEY_RE = re.compile(r"_fail_state$|_failsafe$|_fail_action$", re.I)


def _fail_action_from_text(blob: str) -> str:
    """'FO' / 'FC' from a valve's OWN ledger text, '' when it states neither. Fail-open is
    checked first (it is the safety-critical, explicitly-stated mode)."""
    if _FAIL_OPEN_TEXT_RE.search(blob or ""):
        return "FO"
    if _FAIL_CLOSED_TEXT_RE.search(blob or ""):
        return "FC"
    return ""


def _collect_fail_state_quantities(state: dict) -> dict:
    """{normalised_key: 'FO'|'FC'} for every contract '*_fail_state' quantity. A value of 1 /
    'fail-open' / 'open' → FO; 0 / 'fail-closed' / 'closed' → FC. Read once per run."""
    out = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = ((state.get(ck) or {}).get("quantities") or {})
        for k, v in qs.items():
            if not _FAIL_STATE_KEY_RE.search(k):
                continue
            val = v.get("value") if isinstance(v, dict) else v
            detail = (v.get("source_detail") or v.get("condition") or "") \
                if isinstance(v, dict) else ""
            verdict = ""
            sval = str(val).strip().lower()
            if _FAIL_OPEN_TEXT_RE.search(detail) or sval in ("1", "1.0", "open", "fail-open",
                                                             "fo", "true"):
                verdict = "FO"
            elif _FAIL_CLOSED_TEXT_RE.search(detail) or sval in ("0", "0.0", "closed",
                                                                 "fail-closed", "fc", "false"):
                verdict = "FC"
            if verdict:
                out[k.lower()] = verdict
        if out:
            break
    return out


def _fail_action_from_contract(blob: str, fail_states: dict) -> str:
    """Match a valve (by its service tokens) to a contract '*_fail_state' quantity and return
    its FO/FC verdict, '' when none applies. The key's leading tokens (minus the trailing
    'valve_fail_state') must all appear in the valve text — so o2_dosing_valve_fail_state
    matches an 'O₂ dosing valve' but not an unrelated isolation valve."""
    if not fail_states:
        return ""
    b = (blob or "").lower()
    # normalise unicode O₂ → o2 so 'o2_dosing' matches 'O₂ dosing'.
    b = b.replace("o₂", "o2").replace("₂", "2")
    best = ("", 0)
    for key, verdict in fail_states.items():
        stem = re.sub(r"_(?:valve_)?(?:fail_state|failsafe|fail_action)$", "", key)
        toks = [t for t in re.split(r"[_\s]+", stem) if len(t) >= 2
                and t not in ("the", "valve", "on", "of", "system")]
        if not toks:
            continue
        hits = sum(1 for t in toks if t in b)
        if hits == len(toks) and hits > best[1]:
            best = (verdict, hits)
    return best[0]


def _valve_fail_action(prefix: str, default_fail: str, cid: str, name: str,
                       form: str, rating: str, fail_states: dict) -> str:
    """The valve's fail-action read FROM the ledger (word text → contract fail-state), with
    the kind's default only as the last resort. PSV/HV carry an honest 'n/a' with its BASIS,
    not a bare '—' (routed gap #2: a relief valve is self-actuated by its own spring — it has
    no POWERED fail-action to lose; a manual valve has no actuator to fail at all — both are
    legitimately inapplicable, distinct from a genuine unknown). Universal: the drawn
    fail-action is the ledger value for every powered/actuated valve."""
    if prefix == "PSV":
        return "n/a (self-actuated)"
    if prefix == "HV":
        return "n/a (manual)"
    blob = f"{cid} {name} {form} {rating}"
    verdict = _fail_action_from_text(blob) or _fail_action_from_contract(blob, fail_states)
    return verdict or default_fail


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


# ── PSV SET-PRESSURE FROM THE PROTECTED VESSEL/LINE'S PRESSURE CLASS (2026-07-05) ──
# When the PSV's OWN word text states no set pressure (_parse_set_pressure above
# returns '—'), the relief is still not an unknown: a PSV protects a SPECIFIC
# vessel/line, and that vessel's own design pressure (already computed by the
# wall-thickness sizing that produced its BoM basis, e.g. 'P=13 kPa head') or a
# connected line's PN pressure-class rating is the real engineering reference for
# where it must lift. Only when NEITHER the vessel nor a connected line states a
# pressure class do we disclose the honest, explicit gap.
_VESSEL_DESIGN_PRESSURE_RX = re.compile(r"\bP\s*=\s*([\d.]+)\s*(kPa|MPa|bar|psi)\b", re.I)
_LINE_PN_RATING_RX = re.compile(r"\bPN\s?(\d{1,3})\b", re.I)
_PSV_SET_NOT_STATED = "not yet specified — requires process datasheet"


def _bar_from(value: float, unit: str) -> float:
    u = unit.strip().lower()
    if u == "kpa":
        return value / 100.0
    if u == "mpa":
        return value * 10.0
    if u == "psi":
        return value / 14.5038
    return value   # already bar


def _psv_set_from_protected_equipment(location: str, state: dict, schedule: dict,
                                      proc=None) -> str:
    """The PSV's Set cell derived from the PROTECTED vessel/line's OWN stated
    pressure class — never invented. Priority: (1) the protected vessel's
    requirementsBom `basis` states its design pressure (the wall-thickness
    calculation's own input for THIS exact vessel — the most direct reference);
    (2) a connection-schedule line touching that vessel states a PN pressure-
    class rating. Returns the honest, explicit `_PSV_SET_NOT_STATED` (never a
    bare dash) when neither is stated anywhere — a genuine, disclosed gap,
    distinct from a resolved one."""
    tag = re.sub(r"\s*\([^)]*\)\s*$", "", location or "").strip()
    if not tag:
        return _PSV_SET_NOT_STATED
    for row in (state.get("requirementsBom") or []):
        if not isinstance(row, dict) or str(row.get("tag") or "") != tag:
            continue
        m = _VESSEL_DESIGN_PRESSURE_RX.search(str(row.get("basis") or ""))
        if m:
            bar = _bar_from(float(m.group(1)), m.group(2))
            return (f"{bar:.2f} bar (design P) — derived from {tag}'s stated "
                    f"design pressure ({m.group(1)} {m.group(2)}, basis)")
        break
    node = next((n for n in (getattr(proc, "nodes", None) or []) if n.tag == tag), None)
    name = node.label if node is not None else None
    if name:
        for spec in ((schedule or {}).get("specs") or []):
            if not isinstance(spec, dict) or name not in (spec.get("from_part"),
                                                           spec.get("to_part")):
                continue
            blob = (f"{spec.get('material_qty_desc') or ''} "
                    f"{' '.join(spec.get('assumptions') or [])}")
            m = _LINE_PN_RATING_RX.search(blob)
            if m:
                return (f"~{m.group(1)} bar class (PN{m.group(1)}) — derived from "
                        f"the connected line's PN rating (basis)")
    return _PSV_SET_NOT_STATED


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


# Stop-words ignored when scoring a valve's service text against a line's service.
_VALVE_MATCH_STOP = frozenset((
    "valve", "control", "modulating", "isolation", "isolating", "manual", "assembly",
    "representative", "the", "and", "for", "with", "from", "into", "onto", "per",
    "on", "of", "to", "a", "an", "in", "or", "line", "process", "tie", "tie-in",
    "water", "system", "unit", "skid", "package", "duty", "service", "main", "branch",
    "dn", "mm", "esd", "shutdown", "emergency", "suction", "discharge", "inlet",
    "outlet", "pressure", "relief", "tank", "vent", "fail", "open", "closed",
))


def _valve_service_tokens(blob: str) -> set:
    """The MEANINGFUL service tokens of a valve's name/cid (drops generic valve words),
    used to score which line it sits on. Adds a couple of synonym anchors so an 'O₂'
    valve matches an 'oxygen' line and a 'flow' valve matches a 'recirculation' line."""
    toks = {t for t in re.split(r"[^a-z0-9₂]+", (blob or "").lower())
            if len(t) >= 2 and t not in _VALVE_MATCH_STOP}
    syn = set()
    b = (blob or "").lower()
    if re.search(r"o₂|\bo2\b|oxygen|do |dissolved", b):
        syn |= {"oxygen", "o2", "lox", "reoxygenated", "cones"}
    if re.search(r"flow|recirc|circulat|make.?up|makeup|level", b):
        syn |= {"recirculation", "recirc", "make", "up", "drain"}
    if re.search(r"degas|co2|carbon", b):
        syn |= {"co2", "degasser", "strip"}
    if re.search(r"feed|dosing|dose|chemical|alkalin", b):
        syn |= {"dosing", "feed", "chemical"}
    return toks | syn


def _best_line_for_valve(blob: str, line_rows, used: dict):
    """Score every line in the list against the valve's service tokens and return the
    BEST-matching line row (highest token overlap; ties broken toward an as-yet-unused
    line so successive valves spread across distinct lines rather than stacking on one).
    Returns a LineRow or None when there is no overlap at all."""
    vtoks = _valve_service_tokens(blob)
    if not vtoks or not line_rows:
        return None
    best = None
    best_score = 0
    for lr in line_rows:
        ltoks = {t for t in re.split(r"[^a-z0-9₂]+", f"{lr.service} {lr.fluid}".lower())
                 if len(t) >= 2}
        score = len(vtoks & ltoks)
        if score <= 0:
            continue
        # small tie-break bonus for a line not yet carrying a valve of this kind
        adj = score * 10 - used.get(lr.number, 0)
        if adj > best_score:
            best_score = adj
            best = lr
    return best


def _valve_location_and_ref(vtype: str, cid: str, name: str, proc, line_rows, used: dict,
                            seq_idx: int = 0):
    """Which line / equipment this valve sits on + its P&ID ref. Each valve is matched to
    its OWN line by SERVICE (so a flow-control valve cites the recirculation line, an O₂
    dosing valve cites the oxygen line, a degasser valve cites the CO₂ line) — never a
    single shared default. Falls back to a service-class line, then to a round-robin over
    the remaining lines so a block of un-typed valves still spreads across distinct lines
    instead of all citing line 0. Equipment-mounted bodies (PSV / blanketing) locate to
    their vessel. Returns (location, pid_ref)."""
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

    # ── in-line valves (PCV / XV / manual) — match to the OWN line by service ──
    match = _best_line_for_valve(blob, line_rows, used)
    if match is not None:
        used[match.number] = used.get(match.number, 0) + 1
        return match.number, pid_sheet

    # service-class fallbacks (the original P&ID placement intent)
    if vtype == "PCV":
        for lr in line_rows:
            if re.search(r"purge|recycle|tail|dos", lr.service, re.I) \
                    or lr.number.split("-")[1:2] == ["PG"] or re.search(r"PG|TG|RC", lr.number):
                used[lr.number] = used.get(lr.number, 0) + 1
                return lr.number, pid_sheet
    if vtype == "XV":
        for lr in line_rows:
            if re.search(r"feed|supply|blower|inlet", lr.service, re.I) or lr.frm_tag.startswith("K"):
                used[lr.number] = used.get(lr.number, 0) + 1
                return lr.number, pid_sheet

    # final fallback: ROUND-ROBIN over the lines (least-used first, then by index) so a
    # block of un-typed isolation valves never all cite line 0.
    if line_rows:
        lr = min(line_rows, key=lambda r: (used.get(r.number, 0),
                                           line_rows.index(r)))
        used[lr.number] = used.get(lr.number, 0) + 1
        return lr.number, pid_sheet
    return "—", pid_sheet


def _dn_by_equipment_name(schedule: dict, name: str) -> str:
    """The DN of a connection-schedule run touching equipment NAME <name> (either end) —
    joins the SAME connection-schedule.json rows the line list uses, keyed by the
    equipment's human name. Used for a valve mounted ON EQUIPMENT (a relief/breather valve
    on a vessel, `location` = the vessel's tag) rather than in-line on a process line, where
    there is no line-list row to inherit from. Picks the LARGEST-bore matching run (a
    vessel's main process nozzle rather than a small drain/vent stub) so the cited size is
    representative, never fabricated. Returns '' — a genuine gap, never invented — when the
    equipment has no sized connection at all."""
    if not name:
        return ""
    best_dn, best_bore = "", -1.0
    for r in (schedule.get("rows") or []):
        if not isinstance(r, dict) or name not in (r.get("from"), r.get("to")):
            continue
        dn = r.get("size") or ""
        if not dn:
            continue
        try:
            bore = float(r.get("outer_dia_mm") or 0)
        except (TypeError, ValueError):
            bore = 0.0
        if bore >= best_bore:
            best_dn, best_bore = dn, bore
    return best_dn


def _valve_size_from(location: str, line_rows, proc=None, schedule=None) -> str:
    """DN inherited from the valve's HOSTING CONNECTION (routed gap #2 — Size was 85/464
    of the placeholder count, mostly here): a line-mounted valve inherits its line's DN
    (now resolved by build_line_list's label-keyed schedule join, see the label_of comment
    there); an EQUIPMENT-mounted valve (PSV / PV — `location` is a vessel tag, optionally
    suffixed '(storage)') joins the connection schedule by the vessel's OWN name to find its
    largest sized nozzle. Returns '' — a genuine, honestly-flagged gap, never invented — when
    neither the line nor the equipment has a sized connection to inherit from."""
    for lr in line_rows:
        if lr.number == location:
            return lr.dn if lr.dn and lr.dn != "—" else ""
    if proc is not None and schedule is not None:
        tag = re.sub(r"\s*\([^)]*\)\s*$", "", location or "").strip()
        node = next((n for n in proc.nodes if n.tag == tag), None)
        if node is not None:
            dn = _dn_by_equipment_name(schedule, node.label)
            if dn:
                return dn
    return ""


# ── PUMP-DUTY VALVE-SIZE DERIVATION (2026-07-05) ──────────────────────────────
# A sub-assembly valve on a pump skid (Suction/Discharge Isolation, Non-Return) is
# not an independent line item — it sits directly on its HOST PUMP's suction or
# discharge nozzle, whose bore follows from the pump's OWN duty at a standard line
# velocity (suction ~1.3 m/s to avoid cavitation at the pump eye; discharge ~2.0
# m/s — the check valve rides the discharge nozzle too, preventing backflow). This
# is the EXACT D=sqrt(4Q/πv) + DN-ladder rule connection_sizing.py already applies
# to every routed line; connection_sizing.size_pump_line_dn exposes it pure (no
# subprocess) for this documentation path. The synthesiser names the host pump
# directly in the valve word's OWN cid ('<pump_slug>_synth_word__suction_isolation_
# valve' etc, see _iter_words) — we are a CONSUMER of that identity, never a
# re-derivation of it.
_PUMP_VALVE_CID_RX = re.compile(
    r"^(?P<slug>.+?)_synth_word__(?P<kind>suction_isolation_valve|"
    r"discharge_isolation_valve|non_return_valve)$")
_PUMP_FLOW_RX = re.compile(r"[·\-]\s*([\d.]+)\s*m[³3]/h\b", re.I)


def _pump_duty_size(cid: str, state: dict) -> str:
    """A DN + provenance string derived from the host pump's OWN stated flow, for a
    Suction/Discharge Isolation or Non-Return valve whose cid names that pump
    (see the module comment above). '' when the cid does not name a host pump at
    all (a different valve family — untouched, falls through to the existing '—').
    An HONEST, explicit flag — never a bare dash — when the cid DOES name a host
    pump but the derivation cannot complete: no principal of that name exists
    (ambiguous), or the pump's own requirement states a duty with no flow (e.g. a
    dosing pump stated only in kW — genuinely no-flow)."""
    m = _PUMP_VALVE_CID_RX.match(cid or "")
    if not m:
        return ""
    pump_name = re.sub(r"_", " ", m.group("slug")).strip()
    is_suction = m.group("kind") == "suction_isolation_valve"
    side = "suction" if is_suction else "discharge"
    velocity = (CS.PUMP_SUCTION_VELOCITY_MS if is_suction
                else CS.PUMP_DISCHARGE_VELOCITY_MS)
    for row in (state.get("requirementsBom") or []):
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "")
        head = req.split("·")[0].strip()
        if head.lower() != pump_name.lower():
            continue
        fm = _PUMP_FLOW_RX.search(req)
        if not fm:
            return (f"not derivable — {head} states no flow duty (host pump has "
                    f"no m3/h to size a line from)")
        flow_m3h = float(fm.group(1))
        dn_label, _bore_mm = CS.size_pump_line_dn(flow_m3h, velocity)
        return (f"{dn_label} — derived from host pump duty ({flow_m3h:g} m3/h @ "
                f"{velocity:g} m/s {side})")
    return f"ambiguous — no principal named '{pump_name.title()}' in the BoM"


# A word minted by derive-skeleton.ts's generic Tier-C/GENERIC_FLOOR filler carries this
# EXACT marker in its 'form' modifier ("<name> — representative <module> component") — the
# universal stamp for an UNDIFFERENTIATED catch-all placeholder, not a word tied to a real
# numbered process line. Several near-synonym fillers (singular/plural noun variants, or a
# valve/its-own-actuator synonym pair — e.g. "Pneumatic Actuated Valve", "Pneumatic Actuated
# Valves", "Pneumatic Actuators") can independently inherit the SAME contract count (e.g.
# actuated_distribution_valve_count=200) from derive-skeleton's fuzzy contractCountFor() —
# three distinct WORDS, one real population. Each still mints its OWN valve-list row here
# (keyed on cid, not on the population it represents), so the schedule triple-counted 200
# actuated valves as 600 (Codema v75, 2026-07-04: schedule 630 vs BoM 476, >20% cross-
# schedule reconciliation fault). requirements_bom.py already folds these to ONE BoM line;
# the valve list needs the same discipline. Fix: a GENERIC-REPRESENTATIVE row (same vtype,
# same quantity) is only listed ONCE — a second one is the same undifferentiated count
# restated under a synonym, not a second population.
_GENERIC_REPRESENTATIVE_FORM_RE = re.compile(r"representative\s+\S.*\bcomponent\b", re.I)


def build_valve_list(proc, schedule: dict, state: dict, line_rows) -> list[ValveRow]:
    rows: list[ValveRow] = []
    used_lines: dict[str, int] = {}     # line number → how many valves already cite it
    vseq = 0
    generic_repr_seen: dict[tuple[str, int], str] = {}  # (vtype, qty) → the cid first seen
    # CANONICAL TAGS (shared with the bill-of-materials): a valve that the synthesis
    # flagged as an actuator (`_actuator`) carries its canonical tag here too, so the
    # same physical valve has ONE name in the bill-of-materials and the valve list. A
    # valve that is NOT in the map (most isolation / relief / breather valves are not
    # `_actuator`) keeps the existing 200-loop numbering UNCHANGED — its fallback
    # counter is seeded ABOVE the map's highest per-prefix number so the two number
    # spaces never collide.
    tag_map = canonical_tags.build_tag_map(state)
    tag_seq: dict[str, int] = {}
    for _tags in tag_map.values():
        for _t in _tags:
            _pfx, _n = _t.rsplit("-", 1)
            try:
                tag_seq[_pfx] = max(tag_seq.get(_pfx, 200), int(_n))
            except ValueError:
                pass
    seen = set()
    # LEDGER fail-states: every contract '*_fail_state' quantity → FO/FC (read once).
    fail_states = _collect_fail_state_quantities(state)
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
            form_for_match = mods.get("form", "") or ""
            vseq += 1
            location, pid_ref = _valve_location_and_ref(
                prefix, cid, f"{name} {form_for_match}", proc, line_rows,
                used_lines, vseq)
            # one ISA tag per valve TYPE, numbered in the 200 loop range like the P&ID lines.
            # SINGLE SOURCE: an actuator-flagged valve takes its canonical tag from the
            # shared map (same as the bill-of-materials) — a qty-N run renders as a range
            # ("FCV-201–204"). A non-mapped valve keeps the existing numbering.
            mapped = tag_map.get(cid)
            if mapped:
                tag = canonical_tags.format_range(mapped)
            else:
                tag_seq[prefix] = tag_seq.get(prefix, 200) + 1
                tag = f"{prefix}-{tag_seq[prefix]}"
                if qty > 1:
                    tag = f"{tag} (×{qty})"
            form = mods.get("form", "") or name
            if prefix == "PSV":
                set_or_cv = _parse_set_pressure(mods, form)
                if set_or_cv == "—":
                    set_or_cv = _psv_set_from_protected_equipment(
                        location, state, schedule, proc)
            elif prefix == "XV":
                set_or_cv = "on/off (tight-shutoff)"     # ESD = isolating, not modulating
            elif prefix == "PCV":
                set_or_cv = _parse_cv(mods)
            elif prefix == "PV":
                set_or_cv = "reg. + breather"
            elif prefix == "HV":
                # a manual full-bore isolation valve has no Cv/set-point to state — this is
                # LEGITIMATELY INAPPLICABLE, not a missing data point (routed gap #2: a bare
                # '—' here read as an unresolved unknown; the honest content distinguishes
                # the two with a basis).
                set_or_cv = "n/a (isolation — full bore)"
            elif prefix == "NV":
                # a check valve is a passive one-way body — it has no set-point either.
                set_or_cv = "n/a (check — passive)"
            else:
                set_or_cv = "—"
            # FAIL-ACTION FROM THE LEDGER (universal): the valve's OWN fail-state text, then a
            # contract '*_fail_state' quantity, then the kind default. This is what makes the
            # O₂ dosing valves (o2_dosing_valve_fail_state=1) + the emergency-O₂ solenoid print
            # FO instead of the fixed FC default.
            fail = _valve_fail_action(prefix, fail, cid, name, form,
                                      mods.get("rating_primary", "") or "", fail_states)
            size = (_valve_size_from(location, line_rows, proc, schedule)
                    or _pump_duty_size(cid, state) or "—")
            rows.append(ValveRow(
                tag=tag, vtype=vtype,
                service=_norm(form),
                location=location, size=size,
                set_or_cv=set_or_cv, fail_action=fail, pid_ref=pid_ref))
            break
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# INSTRUMENT-INDEX derivation  (from the BoM instrument words)
# ═══════════════════════════════════════════════════════════════════════════

# (regex, ISA letters, measured variable, sensing-type hint).  Order: specific → generic.
# 2026-07-05 BESS process-schedules coverage pass: two real field instruments in the BESS
# design carried a `content_character.character_id` no existing pattern recognised — the
# words fell through EVERY _INSTR_KINDS regex and never became a schedule row (the design
# itself has them; this was a matcher gap, not a missing part):
#   `pressure_transducer` ("pressure transducer", the coolant-loop instrument, BoM X-43) —
#   the PT pattern only knew '..._transmitter'/'..._sensor'/'..._gauge' synonyms, never
#   'transducer'. Scoped to `pressure_transducer` specifically (NOT a bare '\btransducer\b')
#   so this does not also swallow `current_transducer` — an ELECTRICAL/BMS parameter that
#   belongs on the single-line diagram as a protection callout, not a process-ISA row.
#   `gas_sensor` ("gas sensor", the atmosphere/off-gas detection instrument, BoM I-8, ×13) —
#   the AT pattern's gas-detection alternatives (gas_analys/co2_analys) never matched the
#   design's actual cid. Scoped to the exact `\bgas_sensor\b` token (word-boundary after
#   the 'r' — underscore is a \w char, so this does NOT match 'gas_sensor_mount' /
#   'gas_sensor_label', the accessory/labelling rows for the SAME 13 physical sensors, nor
#   'gas_detector_controller', a control-panel word, not a field instrument).
_INSTR_KINDS = [
    (re.compile(r"\bph\b|ph_probe|ph_electrode|liquiline.*ph|\bph/", re.I),
     "AT", "pH / conductivity", "Memosens electrode"),
    (re.compile(r"\borp\b|redox", re.I),
     "AT", "Redox (ORP)", "Pt ORP electrode"),
    (re.compile(r"analy[sz]er|ndir|gas_analys|co2_analys|composition|chromatograph|"
                r"\bgas_sensor\b", re.I),
     "AT", "Composition", "NDIR analyser"),
    (re.compile(r"instr_level|level_transmitter|level[_\s]?transmitter|radar_level|"
                r"level_sensor|level_gauge|displacer_level|\bradar\b", re.I),
     "LT", "Level", "80 GHz radar"),
    (re.compile(r"instr_flow|flow_transmitter|flow[_\s]?transmitter|flow_?meter|"
                r"flow[_\s]?meter|coriolis|mag_flow|electromagnetic_flow|\bpromag\b|orifice",
                re.I),
     "FT", "Flow", "Electromagnetic"),
    (re.compile(r"instr_pressure|pressure_transmitter|pressure[_\s]?transmitter|"
                r"rosemount.*pressure|pressure_sensor|pressure_gauge|coplanar|\b3051\b|"
                r"\bpressure_transducer\b", re.I),
     "PT", "Pressure", "Coplanar gauge / DP"),
    (re.compile(r"instr_temperature|temperature_transmitter|temperature[_\s]?transmitter|"
                r"temp_transmitter|temp_probe|thermowell|thermocouple|itherm|\brtd\b|pt100|"
                r"temperature_sensor|temperature_profile", re.I),
     "TT", "Temperature", "Pt100 + thermowell"),
]
_INSTR_NOISE = re.compile(
    r"catalyst|barrier|sil_barrier|launder|label|relief_valve|control_valve|"
    r"blanket|breather|filter_cloth|gasket", re.I)

# Engine `sensing_principle` token → schedule display label. The engine declares the principle
# as f(measured medium, phase) (universal-contract-sizing.ts), so it overrides the name-default
# (which would mis-type a dissolved-O₂ analyser as NDIR — a gas-phase method). Universal.
_SENSING_PRINCIPLE_LABEL = {
    "optical": "Optical / luminescent",
    "ndir": "NDIR analyser",
    "electrode": "ISE / glass electrode",
    "toroidal": "Toroidal conductivity",
    "guided-radar": "Guided-radar",
    "pt100": "Pt100 + thermowell",
    "piezoresistive": "Piezoresistive",
}


def _range_from_form(form: str, measured: str) -> str:
    """Pull a measurement range from the instrument's spec text. Handles the en-dash
    'lo–hi unit' the engine's rating_primary uses ('0–2.4 m', '0–40 °C', '0–20 mg/L'),
    the 'X to Y unit' long form ('–50 to +600 °C'), a single-bound 'to X unit', and a
    DN span for flow meters. Universal — keys off the number+unit grammar, no class
    assumptions. A pH / ORP electrode has a standard physical span, returned as a
    genuine instrument spec when the spec text carries no explicit range."""
    f = re.sub(r"\s+", " ", form or "")
    # Unit alternation. Multi-char / m-prefixed units come BEFORE bare 'm' so
    # '0–100 m³/h' and '0–20 mg/L' are not clipped to '… m'.
    U = (r"(?:°?C|barg|bar|mbar|kPa|MPa|mg/?[lL]|[µu]g/?[lL]|ppm|ppb|pH|NTU|FNU|"
         r"mS/cm|[µu]S/cm|L/min|lpm|Nm³/h|m³/h|m3/h|kW|kV|mm|cm|km|kg|%|V|A|Hz|m)")
    # lo–hi (en-dash) OR lo-to-hi, with a trailing unit
    m = re.search(rf"[–\-+]?\d[\d.]*\s*(?:to|[–\-])\s*[+–\-]?\d[\d.]*\s*{U}\b", f, re.I)
    if m:
        return re.sub(r"^\s*range\s*", "", m.group(0), flags=re.I).strip()
    # single-bound 'to 250 bar' / 'to 120 m'
    m = re.search(rf"(?:range\s*)?to\s*\d[\d.]*\s*{U}\b", f, re.I)
    if m:
        return re.sub(r"^\s*range\s*", "", m.group(0), flags=re.I).strip()
    # DN span for flow meters (DN25–DN300)
    m = re.search(r"DN\s?\d+\s*[–\-]\s*DN\s?\d+", f, re.I)
    if m and measured == "Flow":
        return m.group(0).strip()
    # pH / ORP analysers have a standard sensor span (physical spec, not a guess)
    ml = (measured or "").lower()
    if ml.startswith("ph"):
        return "0–14 pH"
    if "redox" in ml or "orp" in ml:
        return "−1500 to +1500 mV"
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


def _instr_host_vessel(cid: str) -> str:
    """The host vessel a per-vessel synth instrument sits on, from its cid
    ('instr_level_on_rearing_tank_synth_word' → 'Rearing Tank'). '' when the cid carries no
    'on_<vessel>' tell (then the per-instance location falls back to the ISA-convention one)."""
    m = re.search(r"_on_([a-z0-9_]+?)(?:_synth)?(?:_word)?$", cid or "", re.I)
    if not m:
        return ""
    host = re.sub(r"_+", " ", m.group(1)).strip()
    return PID._humanise(host)


def build_instrument_index(proc, state: dict, line_rows) -> list[InstrRow]:
    rows: list[InstrRow] = []
    seen = set()
    # CANONICAL TAGS (the single source shared with the bill-of-materials): every
    # synthesised auxiliary instrument's ISA tag comes from canonical_tags.build_tag_map,
    # keyed by content-character id, so "LT-201" here is the SAME LT-201 the
    # requirements bill-of-materials prints. Non-synthesised equipment instruments
    # (a pump's discharge gauge, the dosing pH probe) are NOT in the map and keep
    # the existing 200-loop numbering — seeded ABOVE the map's highest per-prefix
    # number so the two number-spaces never collide.
    tag_map = canonical_tags.build_tag_map(state)
    tag_seq: dict[str, int] = {}
    for _tags in tag_map.values():
        for _t in _tags:
            _pfx, _n = _t.rsplit("-", 1)
            try:
                tag_seq[_pfx] = max(tag_seq.get(_pfx, 200), int(_n))
            except ValueError:
                pass
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
            # sensing type. PRIORITY: the engine's explicit `sensing_principle` modifier — that
            # principle is f(measured medium, phase), so it is medium-correct by construction (a
            # dissolved-O₂ analyser carries 'optical', NOT the NDIR the name-default would assign:
            # NDIR is a GAS-PHASE infra-red method, useless for O₂ dissolved in water). Then a
            # specific tell in the form; then the kind default.
            itype = itype_default
            principle = (mods.get("sensing_principle", "") or "").strip()
            if principle:
                itype = _SENSING_PRINCIPLE_LABEL.get(principle.lower(), principle)
            else:
                mt = re.search(r"\b(80 GHz radar|coplanar|Pt100|electromagnetic|NDIR|"
                               r"Memosens|multipoint|displacer|Coriolis)\b", form, re.I)
                if mt:
                    itype = mt.group(1)
            # ISA display refinement (independent of the tag NUMBER): a pH / ORP /
            # composition analyser shows "AT (pH)" / "AT (ORP)" / "AT". The base letter
            # itself is set per-instance below FROM the canonical tag prefix so the
            # displayed ISA can never disagree with the tag.
            def _isa_label_for(base: str) -> str:
                if measured.startswith("pH"):
                    return "AT (pH)"
                if measured.startswith("Redox"):
                    return "AT (ORP)"
                if measured == "Composition":
                    return "AT"
                return base
            # The clean range lives in the `rating_primary` modifier ('0–2.4 m',
            # '0–40 °C'); `form` often truncates it ('…high / low-'). Read both, the
            # rating first so its clean span wins.
            rng = _range_from_form(
                f"{mods.get('rating_primary', '') or ''} {form}", measured)
            mfr_pn = " ".join(x for x in (mods.get("manufacturer", ""),
                                          mods.get("part_number", "")) if x).strip()
            service = (name or PID._humanise(cid))
            if mfr_pn:
                service = f"{service} — {mfr_pn}"
            base_location = _instr_location(isa, cid, name, proc, line_rows)
            host = _instr_host_vessel(cid)
            # ENUMERATE the ledger's per-vessel instances (universal): a qty-N synthesised
            # instrument is N physical transmitters, so it gets N consecutive ISA tags
            # (LT-201..LT-210, TT-201..TT-210) — not one row carrying '(×N)'. Each instance
            # locates to its own vessel (Rearing Tank-01..-10) when the cid names the host
            # array; otherwise it inherits the ISA-convention location. ISA tags run in the
            # 200 loop range to align with the line numbers.
            n = qty if qty and qty > 0 else 1
            sig = _signal_from_form(form)
            mapped = tag_map.get(cid)   # canonical per-instance tags (synth aux only)
            for inst in range(1, n + 1):
                # SINGLE SOURCE: the synthesised auxiliary's Nth instance reads its
                # canonical tag (shared with the bill-of-materials). The displayed ISA
                # base letter is then taken FROM that tag's prefix so the index never
                # disagrees with the tag — the pH / ORP / composition refinement below
                # still applies. A non-mapped (equipment) instrument, or an instance
                # index beyond the map's list, falls back to the existing numbering so
                # nothing crashes or blanks.
                if mapped is not None and (inst - 1) < len(mapped):
                    tag = mapped[inst - 1]
                    inst_isa = tag.rsplit("-", 1)[0]
                else:
                    tag_seq[isa] = tag_seq.get(isa, 200) + 1
                    tag = f"{isa}-{tag_seq[isa]}"
                    inst_isa = isa
                if n > 1 and host:
                    loc = f"{host}-{inst:02d}"
                elif n > 1:
                    loc = f"{base_location} (#{inst} of {n})"
                else:
                    loc = base_location
                rows.append(InstrRow(
                    tag=tag, isa=_isa_label_for(inst_isa), service=_norm(service),
                    measured=measured, itype=_short(itype, 22),
                    location=loc, rng=rng, signal=sig,
                    loop_ref="FF-PID-001"))
            break
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# small text helpers
# ═══════════════════════════════════════════════════════════════════════════

def _short(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def _norm(s):
    """Whitespace-normalise WITHOUT truncating — for the markdown schedule cells.
    The Excel exporter wraps + auto-grows the row height, so the FULL service /
    description text must reach it; Tristan flagged the '…' clipping on the Service,
    valve and instrument columns ('dots are missing stuff')."""
    return re.sub(r"\s+", " ", str(s or "")).strip()


# ═══════════════════════════════════════════════════════════════════════════
# ASSEMBLY
# ═══════════════════════════════════════════════════════════════════════════

def reconstruct_schedules(schedule: dict, state: dict,
                          out_dir: Optional[str] = None) -> Schedules:
    """Build the three schedules from the P&ID's canonical Process reconstruction.
    out_dir (optional) lets the line list pull the full routed process-line set from
    route-manifest.json so the synthesised life-support tie-ins all appear."""
    proc = PID.reconstruct_process(schedule, state, out_dir)
    line_rows = build_line_list(proc, schedule, state, out_dir)
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
    out.append(f"> {_tb.TOLERANCE_NOTE}\n")
    if not sc.schedule_present:
        out.append("> Line sizes inferred from process duties (connection schedule not "
                   "supplied); DN shown is indicative.\n")

    # ── LINE LIST ──
    out.append("\n## 1 · LINE LIST\n")
    out.append("| Line no. | From | To | Service | Fluid | Phase | DN | Material | "
               "Design rating | Insul. | P&ID |")
    out.append("|---|---|---|---|---|---|---|---|---|:--:|---|")
    for r in sc.lines:
        out.append(f"| `{r.number}` | {r.frm_tag} | {r.to_tag} | {_norm(r.service)} | "
                   f"{r.fluid} | {r.phase} | {r.dn} | {r.material} | {r.rating} | "
                   f"{r.insulation} | {r.pid_ref} |")
    out.append(f"\n*{len(sc.lines)} process lines.*\n")

    # ── VALVE LIST ──
    out.append("\n## 2 · VALVE LIST\n")
    out.append("| Tag | Type | Service | Line / location | Size | Set / Cv | Fail | P&ID |")
    out.append("|---|---|---|---|---|---|:--:|---|")
    for v in sc.valves:
        out.append(f"| `{v.tag}` | {v.vtype} | {_norm(v.service)} | {v.location} | "
                   f"{v.size} | {v.set_or_cv} | {v.fail_action} | {v.pid_ref} |")
    out.append(f"\n*{len(sc.valves)} valve types (control / relief / isolation / ESD). "
               "Fail-action: FC = fail-closed, FO = fail-open, n/a = no powered fail-state "
               "(self-actuated relief / manual / passive check) — stated with its basis, "
               "never a bare dash.*\n")

    # ── INSTRUMENT INDEX ──
    out.append("\n## 3 · INSTRUMENT INDEX\n")
    out.append("| Tag | ISA | Service | Measured | Type | Location | Range | Signal | "
               "Loop |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    for i in sc.instruments:
        out.append(f"| `{i.tag}` | {i.isa} | {_norm(i.service)} | {i.measured} | "
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
#  Set/Cv + Fail widened (routed gap #2: the honest 'n/a (isolation — full bore)' /
#  'n/a (manual)' content is longer than the old dash it replaced) — Type + Service
#  narrowed by the same total so the table width is unchanged; long cells are still
#  `_short()`-truncated for THIS fixed-pixel table only (build_table_svg), never for the
#  markdown/Excel cell, which always carries the full basis.
_VALVE_COLS = [
    ("Tag", 96, "l"), ("Type", 138, "l"), ("Service", 262, "l"),
    ("Line / loc.", 120, "c"), ("Size", 78, "c"), ("Set / Cv", 150, "c"),
    ("Fail", 90, "c"), ("P&ID", 92, "c"),
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
              + 98)          # +14: shared general-tolerance note line in the title block

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
    # Size/Set/Cv + Fail are `_short()`-truncated for THIS fixed-pixel table ONLY
    # (matches the existing Service/Material precedent) — the markdown/Excel cell
    # (render_markdown, below) always carries the untruncated basis + provenance;
    # only the drawing-page image needs the cap. Size gained a cap 2026-07-05: a
    # pump-duty-derived Size now carries its provenance too ('DN80 — derived from
    # host pump duty …') which would otherwise overflow the narrow 78 px column.
    valve_cells = []
    for v in sc.valves:
        vals = [v.tag, v.vtype, _short(v.service, 56), v.location, _short(v.size, 20),
                _short(v.set_or_cv, 30), _short(v.fail_action, 17), v.pid_ref]
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
    y0 = height - 80          # -80 (was -66): +14 for the shared general-tolerance note line
    svg.line(30, y0, width - 30, y0, stroke=INK, width=1.4)
    bw = 300
    bx0 = width - 30 - bw
    by0 = y0 + 10
    rows = [("DRAWING No.", "FF-PROC-SCH-001"), ("REV", _tb.REV),
            ("PAIRS WITH", sc.pid_sheet + " (P&ID)"), ("DATE", _ISSUE_DATE or "—  ")]
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
    # shared general-tolerance note (ONE source of truth: drawing_titleblock.py)
    svg.text(30, y0 + 60, _tb.TOLERANCE_NOTE, size=8.2, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def generate_process_schedules(out_dir: str, state_path: Optional[str] = None,
                               rasterise_png: bool = True):
    """Full pipeline: load (via the P&ID's loader) → reconstruct → render MD + SVG (+ PNG)."""
    global _ISSUE_DATE
    # deterministic title-block issue date from the run's own artifacts (set before draw).
    _ISSUE_DATE = _tb.issue_date(out_dir)
    schedule, state = PID.load_inputs(out_dir, state_path)
    sc = reconstruct_schedules(schedule, state, out_dir)

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
