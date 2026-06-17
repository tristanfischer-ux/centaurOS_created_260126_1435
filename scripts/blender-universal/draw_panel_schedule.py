#!/usr/bin/env python3
"""draw_panel_schedule.py — UNIVERSAL panel / load schedule generator.

The tabular companion to the single-line diagram (draw_single_line.py). Where the SLD
PROJECTS the electrical distribution as a one-line picture, the PANEL SCHEDULE projects
the SAME converged model as the standard electrical-engineering TABLE: one schedule per
distribution board, a header block (supply, busbar rating, incoming feeder, totals) and
one row per outgoing CIRCUIT (circuit ref · description · connected load kW · design
current A · protective device · cable CSA + cores · length · volt-drop % · within-spec).

It does NOT recompute anything and it does NOT touch build_universal_scene.py — it is a
pure CONSUMER of that generator's outputs + the archetype state.

INPUTS (read-only):
  <out>/connection-schedule.json — the sized electrical runs (from / to / mechanism=
        electrical|electrical_bus / rating A / size CSA / length / volt-drop % / role /
        per-run cost / any D2 sub-distribution + (primary)/(secondary) transformer rows).
        Produced by build_universal_scene.write_connection_schedule.
  <state.json>                   — the archetype state: the loads + power ratings (kW),
        the bus continuous rating, the system voltages, and the protective devices in the
        BoM (breaker / contactor / isolator / fuse / RCD).  Auto-discovered next to the
        schedule, or passed explicitly.

PIPELINE:
  1. build_schedules()  — group every electrical circuit by its PANEL (the fan-out hub =
       MAIN board; each '<x>_subdist' node = its own SUB-board).  Per board: derive the
       header (supply source, busbar rating, incoming feeder + its size/length/Vd, total
       connected load kW, total demand A) and the outgoing-circuit rows.  Identical
       fan-out ways (rack[0..N]) collapse to ONE row annotated '× N ways' with a per-way
       AND a total connected load, so Σ circuit loads still reconciles against the board
       demand.  Each row carries the matched protective device (from the state BoM, else a
       sized standard frame ≥ design current × 1.25) + the cable + length + Vd + in-spec.
  2. render_markdown()  — one GitHub-flavoured table per board (the deliverable an
       electrical engineer reads), with the header block and a totals row.
  3. build_table_svg() + rasterise()  — the SAME table(s) rendered to a light-mode SVG
       and a PNG so the schedule can be embedded as a DRAWING alongside the SLD / P&ID.

OUTPUTS:
  <out>/drawings/panel-schedule.md     (one table per board + a reconciliation line)
  <out>/drawings/panel-schedule.svg
  <out>/drawings/panel-schedule.png

Run:
  python3 scripts/blender-universal/draw_panel_schedule.py /tmp/ps-bess
  python3 scripts/blender-universal/draw_panel_schedule.py /tmp/ps-bess-d2 out/rerun-energy_storage/state.json

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

# Universal distribution-voltage + per-module feeder model (shared with the SLD).
# Keyed on load magnitude + the connection model — never product class.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import electrical_distribution_model as edm  # noqa: E402
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)

# Deterministic title-block issue date for THIS run (YYYY-MM-DD), set by
# generate_panel_schedule() from the run's own artifacts; '' until set ('—').
_ISSUE_DATE = ""


# ═══════════════════════════════════════════════════════════════════════════
# INPUT LOADING  (identical contract to draw_single_line.load_inputs)
# ═══════════════════════════════════════════════════════════════════════════

def load_inputs(out_dir: str, state_path: Optional[str]):
    sched_path = Path(out_dir) / "connection-schedule.json"
    if not sched_path.is_file():
        raise FileNotFoundError(f"no connection-schedule.json in {out_dir} "
                                f"(run build_universal_scene.py first)")
    with open(sched_path) as fh:
        schedule = json.load(fh)
    state = {}
    for c in ([Path(state_path)] if state_path else []) + [Path(out_dir) / "state.json"]:
        if c and c.is_file():
            with open(c) as fh:
                state = json.load(fh)
            break
    return schedule, state


# ═══════════════════════════════════════════════════════════════════════════
# STATE quantity + device helpers  (kept self-contained — same heuristics the SLD uses)
# ═══════════════════════════════════════════════════════════════════════════

def _q(state: dict, key: str):
    """A numeric quantity from {engineering,orchestrator}Contract.quantities. float|None."""
    for ck in ("orchestratorContract", "engineeringContract"):
        q = ((state.get(ck) or {}).get("quantities") or {}).get(key)
        if isinstance(q, dict) and q.get("value") is not None:
            try:
                return float(q["value"])
            except (TypeError, ValueError):
                return None
        if isinstance(q, (int, float)):
            return float(q)
    return None


def _archetype_name(state: dict) -> str:
    for ck in ("engineeringContract", "orchestratorContract", "parsedBrief"):
        c = state.get(ck) or {}
        pc = c.get("product_class") or c.get("productClass")
        if pc:
            return str(pc)
    md = state.get("moduleDecomposition") or {}
    if md.get("product_class"):
        return str(md["product_class"])
    return str(state.get("projectId") or "universal_archetype")


_ACR = {"pcs", "ft", "mv", "lv", "hv", "dc", "ac", "bms", "saf", "co2", "h2", "ups",
        "pdu", "crac", "mcc", "rmu", "hvac", "led", "uvc", "ahu", "tp", "n"}


def _humanise(tag: str) -> str:
    if not tag:
        return tag
    parts = re.split(r"[_\s]+", str(tag).strip())
    words = [p.upper() if p.lower() in _ACR else p for p in parts]
    s = " ".join(words)
    return s[:1].upper() + s[1:] if s else s


# --- protective-device extraction from the BoM (same patterns as the SLD) -----

_DEVICE_PATTERNS = [
    (re.compile(r"rcd|residual_current|earth_leakage", re.I),        "rcd",       "RCD"),
    (re.compile(r"\bfuse\b|hrc_fuse|nh_fuse", re.I),                  "fuse",      "F"),
    (re.compile(r"isolator|disconnect(or)?|switch_disconnect", re.I), "isolator",  "Q"),
    (re.compile(r"contactor", re.I),                                  "contactor", "K"),
    (re.compile(r"breaker|mccb|\bmcb\b|\bacb\b|circuit_breaker|"
                r"main_breaker|branch_breaker", re.I),                "breaker",   "CB"),
]
_DEVICE_NOISE = re.compile(
    r"label|padlock|torque|card|enclosure|mount|rail|terminal|holder|sticker|"
    r"placard|sign|cover|gasket|bracket|vesa", re.I)


def _iter_words(state: dict):
    md = state.get("moduleDecomposition") or {}
    for m in (md.get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                cc = w.get("content_character")
                cid = cc.get("character_id", "") if isinstance(cc, dict) else ""
                yield w, (w.get("name_human") or ""), (cid or "")


def _word_fields(word: dict):
    """(manufacturer, part_number, rating_value) from modifier_characters."""
    mfr = pn = rating = ""
    for mc in (word.get("modifier_characters") or []):
        k = mc.get("kind")
        if k == "manufacturer":
            mfr = mc.get("value", "") or mfr
        elif k == "part_number":
            pn = mc.get("value", "") or pn
        elif k in ("rating_primary", "capacity") and not rating:
            rating = str(mc.get("value", "") or "")
    return mfr, pn, rating


def extract_devices(state: dict):
    """Every real protective / switching device in the BoM: kind, tag, cid, name,
    manufacturer, part_number, rating, + an amp rating parsed from the rating value."""
    out, seen = [], set()
    for w, name, cid in _iter_words(state):
        blob = f"{name} {cid}"
        if _DEVICE_NOISE.search(blob):
            continue
        for rx, kind, tag in _DEVICE_PATTERNS:
            if rx.search(blob):
                key = (kind, cid or name)
                if key in seen:
                    break
                seen.add(key)
                mfr, pn, rating = _word_fields(w)
                amp = _parse_amps(rating)
                out.append({"kind": kind, "tag": tag, "cid": cid,
                            "name": name.strip(), "mfr": mfr, "pn": pn,
                            "rating": rating, "amp": amp})
                break
    return out


def _parse_amps(val) -> Optional[float]:
    """Pull an ampere figure from a rating string ('200 A', '63', '2500 A frame')."""
    if val is None:
        return None
    m = re.search(r"([\d.]+)\s*[Aa]?\b", str(val))
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _pick_device(devices, *needles, kind=None):
    nl = [n.lower() for n in needles]
    for d in devices:
        if kind and d["kind"] != kind:
            continue
        hay = f"{d['cid']} {d['name']}".lower()
        if any(n in hay for n in nl):
            return d
    return None


# Standard BS-EN-60947 / IEC breaker frame ladder (A) — used to SIZE a default device
# when the BoM doesn't name one for a circuit.  Next frame ≥ design current.
_BREAKER_FRAMES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315,
                   400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000]


def _next_frame(design_a: float) -> int:
    for f in _BREAKER_FRAMES:
        if f >= design_a:
            return f
    return _BREAKER_FRAMES[-1]


# ── LOAD-DERIVED CIRCUIT SIZING (universal — every powered circuit sized from its own kW) ──
# BS 7671 / IEC 60228 conductor CSA ladder [mm²] + the current-carrying capacity (ampacity)
# per CSA for a 3- / 4-core 90 °C thermosetting (XLPE) copper cable, Method C (clipped
# direct) — BS 7671 Table 4D2A column. This is the realistic install for a three-phase power
# feeder, so the cable a circuit needs matches industrial practice (e.g. a ~96 kW motor lands
# on 70 mm², a ~132 kW motor on 120 mm²). The cable is sized to carry ≥ FLC × 1.25 (the
# BS 7671 §433 "design current ≤ cable rating" rule with the standard 1.25 motor/continuous-
# duty margin).
_CSA_LADDER = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400]
_CSA_AMPACITY_A = {
    1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 75, 16: 100, 25: 133, 35: 164, 50: 198,
    70: 253, 95: 306, 120: 354, 150: 407, 185: 464, 240: 546, 300: 628, 400: 751,
}
# Default electrical assumptions for the FLC of a powered circuit (overridable nowhere yet,
# but the board's own voltage/phases drive V): line-to-line V=400, power factor 0.85,
# motor efficiency 0.90 — the brief's universal three-phase induction-motor defaults.
_PF_DEFAULT = 0.85
_ETA_DEFAULT = 0.90


def flc_from_kw(kw, voltage_v, is_dc=False, phases=3,
                pf=_PF_DEFAULT, eta=_ETA_DEFAULT):
    """Full-load current [A] of a powered circuit from its connected load kW.
      • 3-phase AC:  I = P·1000 / (√3 · V · pf · η)
      • 1-phase AC:  I = P·1000 / (V · pf · η)
      • DC:          I = P·1000 / V
    η (motor efficiency) is applied for AC motor circuits — the SUPPLY current that the
    cable + breaker must carry is the SHAFT power ÷ efficiency, so a 132 kW motor draws
    more line current than 132 kW of resistive load. Universal: any kW → its real FLC."""
    if not kw or kw <= 0 or not voltage_v or voltage_v <= 0:
        return None
    p_w = kw * 1000.0
    if is_dc:
        return p_w / voltage_v
    denom = (math.sqrt(3.0) if phases >= 3 else 1.0) * voltage_v * pf * eta
    return p_w / denom if denom > 0 else None


def size_cable_csa(design_a, margin=1.25):
    """Smallest standard CSA [mm²] whose single-core copper ampacity ≥ design_a × margin
    (BS 7671 Method C). Above the top single conductor, report a parallel-run label so the
    schedule cell stays honest (e.g. '2×400 mm²') rather than silently under-sizing."""
    if not design_a or design_a <= 0:
        return None, ""
    need = design_a * margin
    for csa in _CSA_LADDER:
        if _CSA_AMPACITY_A.get(csa, 0) >= need:
            return csa, f"{csa:g} mm²"
    # parallel runs of the top CSA.
    top = _CSA_LADDER[-1]
    n = max(2, math.ceil(need / _CSA_AMPACITY_A[top]))
    return top, f"{n}×{top:g} mm²"


def size_circuit_from_kw(kw, voltage_v, is_dc=False, phases=3):
    """The full load-derived sizing of ONE powered circuit from its connected kW:
    (design_a=FLC, cable_csa_mm2, cable_label, breaker_frame_a). The protective device is
    the next standard frame ≥ FLC (an MCB/MCCB must carry the design current continuously);
    the cable is sized to ≥ FLC × 1.25. Returns (None, None, '', None) when no kW/V."""
    flc = flc_from_kw(kw, voltage_v, is_dc=is_dc, phases=phases)
    if flc is None:
        return None, None, "", None
    csa, label = size_cable_csa(flc)
    frame = _next_frame(flc)
    return round(flc, 1), csa, label, frame


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — the reconstructed panel / load schedule
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class Circuit:
    ref: str                 # 'W1', 'W4–18' (way / circuit reference)
    description: str         # the load served
    ways: int = 1            # >1 ⇒ identical collapsed ways
    connected_kw: Optional[float] = None    # connected load per circuit, kW (one way)
    connected_kw_total: Optional[float] = None  # × ways (for the totals reconciliation)
    design_a: Optional[float] = None        # design / load current, A (one way)
    device: str = ""        # protective device label (rating A + type + mfr/MPN)
    device_a: Optional[float] = None        # device frame/trip, A
    cable: str = ""         # CSA + cores, e.g. '25 mm² · 1c+E' or '3×400 mm²'
    length_m: Optional[float] = None
    voltdrop_pct: Optional[float] = None
    within_spec: Optional[bool] = None
    note: str = ""          # 'control / aux feeder' etc. for rating-less runs


@dataclass
class Panel:
    board_id: str            # node tag (switchgear / switchgear_subdist / control)
    name: str                # human board name, e.g. 'MAIN SWITCHBOARD'
    kind: str = "main"      # 'main' | 'sub'
    supply: str = ""        # supply source description
    system: str = ""        # system voltage / phases, e.g. '400 V 3-phase + N' / '800 V DC'
    busbar_a: Optional[float] = None        # busbar continuous rating, A
    incoming: str = ""      # incoming feeder description (size · length · Vd)
    incoming_a: Optional[float] = None      # incoming feeder current (THIS board's domain)
    phases: int = 3          # 3 (TP&N / 3-ph) | 1 (single-phase) — drives kW↔A
    voltage_v: Optional[float] = None       # the L-L (3-ph) or L-N (1-ph) or DC voltage
    is_dc: bool = False
    transformer: str = ""   # for a sub-board fed via a step-down: 'kVA · ratio'
    transformer_kva: Optional[float] = None
    circuits: list[Circuit] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# ROW PARSING helpers
# ═══════════════════════════════════════════════════════════════════════════

_RACK_TAP_RE = re.compile(r"^(.*?)\s*\[(\d+)\]$")    # 'rack[3]' → ('rack', 3)


def _electrical_rows(schedule: dict):
    return [r for r in (schedule.get("rows") or [])
            if "electrical" in (r.get("mechanism") or "")]


def _row_amps(row: dict) -> Optional[float]:
    return _parse_amps(row.get("rating"))


def _row_vd(row: dict) -> Optional[float]:
    """Volt-drop % from a 'drop' cell like '0.066% Vd'."""
    d = str(row.get("drop") or "")
    m = re.search(r"([\d.]+)\s*%", d)
    return float(m.group(1)) if m else None


def _clean_cable(row: dict) -> tuple[str, str]:
    """(cable_label, note).  Tidies the rating-less fallback strings."""
    s = str(row.get("size") or "").strip()
    low = s.lower()
    if not s or s in ("—", "-", "None"):
        return "", ""
    if "no rating" in low or "fallback" in low or "sense" in low or "unsized" in low:
        # a control / sense / aux feeder (no power rating) — keep the CSA if one is present
        m = re.match(r"([\d.]+\s*mm²)", s)
        return (m.group(1) if m else ""), "control / aux feeder"
    return s, ""


def _cores_for(cable: str, is_dc: bool, phases: int) -> str:
    """Annotate a bare CSA with a sensible core count for a schedule cell.
    Parallel busbar runs ('3×400 mm²') already encode their grouping — pass through."""
    if not cable or "×" in cable or "x" in cable.lower():
        return cable
    if is_dc:
        return f"{cable} · 2c"            # DC: +/− pair
    if phases >= 3:
        return f"{cable} · 3c+E"          # three-phase + earth
    return f"{cable} · 1c+N+E"            # single-phase + neutral + earth


# ═══════════════════════════════════════════════════════════════════════════
# BOARD / SUPPLY context from state  (mirrors the SLD's _build_source choices)
# ═══════════════════════════════════════════════════════════════════════════

def _board_voltage(state: dict) -> tuple[Optional[float], bool, int, str]:
    """(voltage_v, is_dc, phases, system_label) for the MAIN distribution board.

    DC bus (BESS) → the dc_bus_voltage; AC plant board → ac_output_voltage 3-phase; if
    neither is stated, INFER from the BoM main-breaker (a TP&N / 3-phase main → 400 V
    3-phase + N; a single-phase consumer unit → 230 V 1-phase)."""
    dc = _q(state, "dc_bus_voltage_v")
    if dc:
        return dc, True, 1, f"{dc:,.0f} V DC bus"
    ac = _q(state, "ac_output_voltage_v") or _q(state, "ac_voltage_v") \
        or _q(state, "grid_voltage_v")
    if ac:
        if ac >= 380:
            return ac, False, 3, f"{ac:,.0f} V 3-phase + N (TP&N)"
        return ac, False, 1, f"{ac:,.0f} V 1-phase + N"
    # infer from the BoM: a TP&N / 3-phase main breaker ⇒ standard UK 400 V TP&N board.
    tpn = single = False
    for _w, name, cid in _iter_words(state):
        blob = f"{name} {cid}".lower()
        if re.search(r"tp.?n|three.?phase|3.?phase|4p\b|4-pole|four.?pole", blob):
            tpn = True
        if re.search(r"consumer_unit|single.?phase|1.?phase|sp.?n\b", blob):
            single = True
    if tpn:
        return 400.0, False, 3, "400 V 3-phase + N (TP&N)"
    if single:
        return 230.0, False, 1, "230 V 1-phase + N"
    return None, False, 3, ""


def _supply_label(state: dict, is_dc: bool) -> str:
    """A short supply-source line for the main board header."""
    if _q(state, "external_transformer_mass_kg") or _q(state, "continuous_power_kw") and is_dc:
        return "Battery DC bus via PCS (grid-tie step-up to MV / G99)"
    mv = any(re.search(r"mv_transformer|distribution_transformer|mv_switchgear|ring.?main",
                       f"{n} {c}", re.I) for _w, n, c in _iter_words(state))
    if mv:
        return "11 kV ring-main → distribution transformer → 400 V LV board"
    return "Utility LV incomer (400 V distribution board)"


def _design_kw_from_a(design_a: Optional[float], panel: Panel) -> Optional[float]:
    """Derive connected load kW from design current + the board voltage/phases.
    DC: P = V·I.  3-phase: P = √3·V_LL·I·pf.  1-phase: P = V·I·pf.  pf assumed 0.95."""
    if design_a is None or not panel.voltage_v:
        return None
    v = panel.voltage_v
    pf = 0.95
    if panel.is_dc:
        return v * design_a / 1000.0
    if panel.phases >= 3:
        return math.sqrt(3) * v * design_a * pf / 1000.0
    return v * design_a * pf / 1000.0


# ── PER-LOAD connected-kW derivation (mirrors the single-line's own resolver) ─────
# A circuit's connected load must come from ITS equipment's real electrical kW — never a
# wholesale fallback that makes every circuit the same. Resolution order:
#   (1) the equipment's published kW in state.requirementsBom (its requirement string
#       carries '· NN kW ·' for many items — pumps, heat-pump, chilling, UPS);
#   (2) a contract '*_kw' quantity matching the load name;
#   (3) a TYPE-BASED estimate — a duty fraction of the plant's principal motor load;
#   (4) the design current × board voltage (last resort).
# Universal: keyed on generic equipment tokens, never a product class.
# Duty-type fractions of the principal motor load (ordered most-specific first); shared
# with the single-line's intent so the two drawings agree on each load's magnitude.
_PANEL_DUTY_FRACTION = [
    (re.compile(r"degas|de-?gas|co2.?strip|stripp?er|scrubber", re.I),      0.10),
    (re.compile(r"oxygen|\bo2\b|aeration|aerat|oxygenat", re.I),            0.10),
    (re.compile(r"blower|\bfan\b|compressor|extract|ventilat|\bahu\b|hrv", re.I), 0.12),
    (re.compile(r"ozone|\buv\b|disinfect|sterilis|steriliz|reactor", re.I), 0.08),
    (re.compile(r"protein.?skim|skimmer|foam.?fraction|flotation", re.I),   0.06),
    (re.compile(r"drum.?filter|screen|strainer|backwash|\bfilter\b", re.I), 0.05),
    (re.compile(r"chiller|refriger|heat.?exchang|\bhex\b|chilling|ice", re.I), 0.20),
    (re.compile(r"sludge|solids|thicken|dewater|centrifuge|grading|harvest|"
                r"mortalit|effluent|intake|biosecurit|quarantine|feed|grading", re.I), 0.06),
    (re.compile(r"dosing|metering|chemical|alkalin", re.I),                 0.03),
    (re.compile(r"\bups\b|scada|control|plc|panel|gateway|i/o|network|"
                r"switch|controller", re.I),                               0.02),
    (re.compile(r"pump|circulat|recirc", re.I),                             0.30),
    (re.compile(r"mixer|agitator|stirrer|conveyor|auger|screw", re.I),      0.08),
    (re.compile(r"heater|element|immersion", re.I),                         0.15),
    (re.compile(r"valve|actuat|damper|gate", re.I),                         0.01),
]
# A '· NN <unit> <qualifier>' duty where the QUALIFIER marks a WHOLE-PLANT figure (not the
# item's own draw) — e.g. SCADA '342 kW plant'. Such a kW is the connected plant load and
# must NOT be read as the control system's own circuit load.
_WHOLE_PLANT_KW_RE = re.compile(
    r"·\s*([\d.,]+)\s*kW\s*(plant|site|total|connected|aggregate|whole)", re.I)
_OWN_KW_RE = re.compile(r"·\s*([\d.,]+)\s*kW\b")


def _norm_load_name(s: str) -> str:
    """Lower-case head-noun key for matching a circuit name against a BoM requirement head."""
    s = re.sub(r"\s*[×x]\s*\d+\s*$", "", (s or "")).strip().lower()
    s = re.sub(r"\s*\([^)]*\)\s*", " ", s)            # drop parentheticals
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _panel_req_bom_kw(name: str, state: dict) -> Optional[float]:
    """The equipment's OWN published electrical kW from state.requirementsBom, matched on the
    requirement head noun. Rejects a whole-plant '342 kW plant'-style figure (that is the
    connected plant load, not this item's draw). Returns kW or None."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list) or not rb:
        return None
    target = _norm_load_name(name)
    if not target:
        return None
    t_toks = set(target.split())
    if not t_toks:
        return None
    best = None
    for row in rb:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "")
        head = req.split("·", 1)[0]
        h_toks = set(_norm_load_name(head).split())
        if not h_toks:
            continue
        # the circuit name's tokens must be a subset of the requirement head (so 'Heat Pump'
        # matches 'Heat Pump · 96 kW' but not 'Heat Exchanger · 96 kW').
        overlap = len(t_toks & h_toks)
        if overlap == 0 or overlap < len(t_toks):
            continue
        if _WHOLE_PLANT_KW_RE.search(req):
            continue                       # 'NN kW plant' = whole-plant, not this item
        m = _OWN_KW_RE.search(req)
        if not m:
            continue
        try:
            kw = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        if kw <= 0:
            continue
        if best is None or overlap > best[0]:
            best = (overlap, kw)
    return best[1] if best else None


def _panel_principal_motor_kw(state: dict) -> float:
    """The plant's principal motor load [kW] — anchor for the type-based estimate. Largest
    pump/motor/drive '· NN kW' figure in the BoM, else a quarter of the connected load."""
    best = 0.0
    rb = state.get("requirementsBom")
    if isinstance(rb, list):
        for row in rb:
            if not isinstance(row, dict):
                continue
            req = str(row.get("requirement") or "")
            head = req.split("·", 1)[0].lower()
            # A routed CONNECTION row ('<medium> connection: A → B · NN kW') carries a TRANSFER
            # duty (e.g. 'water connection: heat pumps → rearing tanks · 386.4 kW' = a thermal
            # heat-transfer duty), NOT an equipment's own motor rating — and its head can match
            # 'heat pump'/'pump'. Never read it as the principal-motor anchor (it would inflate
            # every duty-fraction circuit). Keyed on the connection shape, universal.
            if re.match(r"\s*\w[\w /-]*\bconnection\b\s*:", head) or "→" in head or "->" in head:
                continue
            if not re.search(r"pump|motor|drive|fan|blower|compressor|heat pump", head):
                continue
            if _WHOLE_PLANT_KW_RE.search(req):
                continue
            m = _OWN_KW_RE.search(req)
            if m:
                try:
                    best = max(best, float(m.group(1).replace(",", "")))
                except ValueError:
                    pass
    if best > 0:
        return best
    load = _q(state, "connected_electrical_load_kw") or _q(state, "total_supply_demand_kw")
    return (load * 0.25) if load else 0.0


def _panel_type_kw(name: str, state: dict) -> Optional[float]:
    """A duty-type estimate of a load's electrical kW = a duty fraction × the principal
    motor load. Universal (duty-keyed). Returns kW or None when no anchor exists."""
    anchor = _panel_principal_motor_kw(state)
    if anchor <= 0:
        return None
    low = (name or "").lower()
    for rx, frac in _PANEL_DUTY_FRACTION:
        if rx.search(low):
            kw = round(anchor * frac, 1)
            if kw > 0:
                return kw
    kw = round(anchor * 0.05, 1)
    return kw if kw > 0 else None


def _panel_derive_load_kw(name: str, state: dict) -> Optional[float]:
    """Resolve ONE circuit's connected load [kW]: requirementsBom → contract quantity →
    duty-type estimate. Returns kW or None (caller then falls back to design current)."""
    base = re.sub(r"\s*[×x]\s*\d+\s*$", "", name or "").strip()
    kw = _panel_req_bom_kw(base, state)
    if kw and kw > 0:
        return kw
    # a contract *_kw quantity whose key tokens overlap the load name — but only on a
    # SPECIFIC (non-generic) token, and never a whole-plant aggregate key. Generic words
    # like supply/system/demand/total caused false matches (e.g. 'Oxygen SUPPLY system' ↔
    # total_SUPPLY_demand_kw = 344 kW, the whole plant) — so they are excluded.
    q = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = (state.get(ck) or {}).get("quantities")
        if isinstance(qs, dict) and qs:
            q = qs
            break
    _GENERIC_TOK = {"supply", "system", "demand", "total", "connected", "plant", "site",
                    "load", "unit", "process", "main", "aux", "auxiliary", "electrical",
                    "power", "design", "rated", "the", "and", "for"}
    _AGG_KEY = re.compile(r"total_supply_demand|connected_electrical_load|"
                          r"total_(?:installed|connected)|plant_(?:load|demand)|"
                          r"site_(?:load|demand)|peak_demand", re.I)
    btoks = set(_norm_load_name(base).split()) - _GENERIC_TOK
    if btoks:
        for k, v in q.items():
            kl = k.lower()
            if not kl.endswith("_kw") or _AGG_KEY.search(kl):
                continue
            if re.search(r"thermal|cooling|heating|dissipation|rejection|duty(?!_)|"
                         r"capacity|loss", kl) and not re.search(r"elec|motor|drive|"
                         r"compressor|fan|pump", kl):
                continue
            ktoks = set(re.split(r"[_\s]+", kl.replace("_kw", ""))) - _GENERIC_TOK
            if btoks & ktoks:
                val = v.get("value") if isinstance(v, dict) else v
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    continue
                if val > 0:
                    return val
    return _panel_type_kw(base, state)


# ═══════════════════════════════════════════════════════════════════════════
# SCHEDULE RECONSTRUCTION
# ═══════════════════════════════════════════════════════════════════════════

def build_schedules(schedule: dict, state: dict) -> list[Panel]:
    """Group the electrical circuits into per-board panel schedules.

    Boards:
      - MAIN board = the node that feeds the most outgoing circuits (the fan-out hub:
        'switchgear' for BESS, 'control' for VF).  In the D2-actuated case the hub is the
        '<x>_subdist' node and the MAIN board is whatever feeds IT.
      - SUB board   = every distinct '<x>_subdist' node — its own schedule.
    """
    rows = _electrical_rows(schedule)
    devices = extract_devices(state)
    voltage_v, is_dc, phases, system = _board_voltage(state)
    # UNIVERSAL LV fallback: when the board voltage cannot be read or inferred (an AC
    # process plant whose state carries no explicit board voltage and no TP&N/1-ph cue in
    # the BoM) but the topology DOES carry electrical loads, adopt the standard low-voltage
    # distribution board — 400 V 3-phase + N — the same 415 V LV reference the single-line
    # uses. Without this every circuit's connected kW reads '—' (no V to convert Design A)
    # and the board TOTALS connected load collapses to 0.0 kW. Keyed on the connection
    # model (electrical rows present, no stated voltage), never a product class.
    if voltage_v is None and rows:
        voltage_v, is_dc, phases, system = (
            400.0, False, 3, "400 V 3-phase + N (TP&N)")

    # ---- find the DISTRIBUTION BOARDS -------------------------------------------
    # A node is a distribution BOARD only if it actually DISTRIBUTES — it must either
    #   (a) fan out to ≥2 distinct terminal loads (a genuine board with multiple ways), OR
    #   (b) be a NAMED distribution node (switchgear / switchboard / *_subdist / a board /
    #       panel / the VF 'control' board).
    # A node that feeds exactly ONE downstream item in a series chain (rack_block→pcs→
    # transformer = the DC→PCS→step-up export train) is a CONVERSION-CHAIN LINK, not a
    # board, and must NOT get its own schedule.  Likewise a node that only forwards one
    # feeder to a sub-board.
    load_targets: dict[str, set] = {}
    for r in rows:
        if r.get("role") == "transformer" or not _is_terminal_load(r):
            continue
        frm = r.get("from") or ""
        to = r.get("to") or ""
        m = _RACK_TAP_RE.match(to)
        base = m.group(1) if m else to        # collapse rack[0..N] → one logical target
        load_targets.setdefault(frm, set()).add(base)

    board_ids = [s for s, targets in load_targets.items()
                 if len(targets) >= 2 or _is_named_board(s)]
    load_count = {s: len(t) for s, t in load_targets.items()}
    # the MAIN board = the busiest BOARD node that is NOT a '*_subdist'.
    non_sub = {s: load_count[s] for s in board_ids if not s.endswith("_subdist")}
    main_hub = max(non_sub, key=non_sub.get) if non_sub else None
    # everything else that bears load is a sub-board (in the D2 case the load lands on a
    # '*_subdist'; without D2 there is only the one main board).
    sub_ids = sorted(s for s in board_ids if s != main_hub)

    sec_v = _subdist_secondary_v(rows, state)
    panels: list[Panel] = []

    # ---- MAIN board -------------------------------------------------------------
    if main_hub:
        main = _new_panel(main_hub, "main", state, voltage_v, is_dc, phases, system)
        main.supply = _supply_label(state, is_dc)
        main.busbar_a = _q(state, "bus_continuous_current_a")
        _fill_circuits(main, main_hub, rows, devices, state)
        _set_incoming(main, main_hub, rows, schedule, state)
        panels.append(main)

    # ---- SUB boards (one schedule each) ----------------------------------------
    for sd in sub_ids:
        sub = _new_panel(sd, "sub", state, voltage_v, is_dc, phases, system)
        # the sub-board sits on the transformer SECONDARY (the forced LV voltage, if any).
        if sec_v:
            sub.voltage_v = sec_v
            sub.is_dc = is_dc
            sub.system = (f"{sec_v:,.0f} V DC" if is_dc
                          else (f"{sec_v:,.0f} V 3-phase + N" if sec_v >= 380
                                else f"{sec_v:,.0f} V 1-phase + N"))
            sub.phases = 3 if (not is_dc and sec_v >= 380) else 1
        sub.supply = "Local sub-distribution (MV feeder → local step-down transformer)"
        _fill_circuits(sub, sd, rows, devices, state)
        _set_sub_incoming(sub, sd, rows, schedule, state)
        panels.append(sub)

    # ---- SYNTHESISED main board (universal fallback) ---------------------------
    # A chemical/process archetype's routed topology has NO board node the fan-out
    # recogniser matches (its electrical edge is a single lumped 'electrical_supply
    # → process_compressors_and_pumps' run), so build_schedules above finds ZERO
    # boards and the sheet would render blank. ONLY in that no-board-at-all case do
    # we synthesise the main incomer board + one outgoing circuit per module/major
    # load group from the connection schedule + the connected load, at the load-
    # appropriate distribution voltage. UNIVERSAL, keyed on the connection model —
    # not on the product class. (When ANY board was recognised — e.g. a D2 sub-board
    # — the topology already modelled distribution, so we never synthesise.)
    if not panels:
        synth = _synthesise_main_board(schedule, state, rows, devices)
        if synth is not None:
            panels.insert(0, synth)

    return panels


def _lumped_electrical_current_a(rows) -> Optional[float]:
    """The largest electrical run's design current [A] (the lumped process-electrical
    feeder when the topology carries one aggregate edge)."""
    best = None
    for r in rows:
        a = _row_amps(r)
        if a is not None and (best is None or a > best):
            best = a
    return best


def _synthesise_main_board(schedule: dict, state: dict, rows, devices) -> Optional[Panel]:
    """Build the MAIN incomer board + per-module outgoing circuits from the
    connection schedule + connected load, at the auto-selected distribution voltage.
    Returns a Panel, or None when there is no electrical load to model. UNIVERSAL."""
    # Design-loop closure: prefer the converged as-routed supply demand (total_supply_demand_kw,
    # plant load + distribution parasitic, written back by the physics<->CAD loop) to size the
    # incomer board for the demand it actually sees; fall back to the brief plant-load metric.
    load_kw = _q(state, "total_supply_demand_kw") or _q(state, "connected_electrical_load_kw")
    lumped_a = _lumped_electrical_current_a(rows)
    # LV reference voltage: prefer an explicit LV figure in the electrical
    # material_context; ignore a leaked ≥1000 V DC-bus default; else 415 V.
    lv_v = None
    for s in (schedule.get("specs") or []):
        if "electrical" not in (s.get("mechanism") or ""):
            continue
        mc = s.get("material_context") or ""
        mv = re.search(r"(\d{3,4})\s*[_\s]?V\b", mc) or re.search(r"(\d{3,4})V", mc)
        if mv and 100.0 <= float(mv.group(1)) <= 1000.0:
            lv_v = float(mv.group(1)); break
        sv = s.get("system_voltage_v")
        if sv and 100.0 <= float(sv) <= 1000.0:
            lv_v = float(sv); break
    if lv_v is None:
        lv_v = 415.0

    plan = edm.select_distribution_voltage(load_kw, lv_design_current_a=lumped_a,
                                           lv_voltage_v=lv_v)
    if plan is None:
        return None

    md = state.get("moduleDecomposition") or {}
    feeders = edm.synthesise_module_feeders(
        plan.board_current_a, plan.board_voltage_v, md.get("modules") or [],
        total_load_kw=plan.connected_load_kw,
        per_module_load_kw=_known_module_loads(state))
    if not feeders:
        return None

    is_mv = plan.is_mv
    panel = Panel(
        board_id="main_switchboard",
        name="MAIN MV SWITCHBOARD (MSB)" if is_mv else "MAIN LV BOARD (TP&N)",
        kind="main",
        system=(f"{plan.board_voltage_label} 3-phase (MV)" if is_mv
                else f"{plan.board_voltage_v:,.0f} V 3-phase + N (TP&N)"),
        voltage_v=plan.board_voltage_v,
        is_dc=False,
        phases=3,
        busbar_a=plan.board_current_a,
        incoming_a=plan.board_current_a,
    )
    if is_mv:
        panel.supply = (f"{plan.board_voltage_label} DNO / ring-main supply "
                        f"(primary substation)")
        panel.incoming = (f"{plan.board_voltage_label} MV feeder · "
                          f"{plan.board_current_a:,.0f} A; LV loads via local "
                          f"{plan.transformer_ratio} step-down")
        if plan.transformer_kva:
            panel.transformer = f"{plan.transformer_kva:,.0f} kVA · {plan.transformer_ratio}"
            panel.transformer_kva = plan.transformer_kva
        panel.notes.append(
            f"Connected load {plan.connected_load_kw:,.0f} kW exceeds practical LV "
            f"distribution → {plan.board_voltage_label} MV switchboard "
            f"({plan.board_current_a:,.0f} A). Outgoing MV feeders to module "
            f"sub-stations; small LV loads via a local {plan.transformer_ratio} "
            f"transformer.")
    else:
        mv_ring = any(re.search(r"mv_transformer|distribution_transformer|"
                                r"mv_switchgear|ring.?main", f"{n} {c}", re.I)
                      for _w, n, c in _iter_words(state))
        panel.supply = ("11 kV ring-main → distribution transformer → 400 V LV board"
                        if mv_ring else "Utility LV incomer (400 V distribution board)")
        panel.incoming = (f"{plan.board_voltage_v:,.0f} V incoming · "
                          f"{plan.board_current_a:,.0f} A")
        panel.notes.append(
            f"Connected load {plan.connected_load_kw:,.0f} kW → {plan.board_voltage_v:,.0f} "
            f"V LV board ({plan.board_current_a:,.0f} A). One outgoing circuit per "
            f"process module / major load group.")

    # outgoing circuits — one per synthesised feeder. The feeder current is already a real
    # FLC (sized by the distribution model from the module kW); the breaker is the next
    # standard frame ≥ FLC (load-derived, not design×1.25).
    for i, f in enumerate(feeders, start=1):
        cable = _cores_for(f.size_label, False, 3)
        dev, dev_a = _device_for(f.name, f.current_a, devices, panel,
                                 frame_override=_next_frame(f.current_a)
                                 if f.current_a else None)
        note = "even split of aggregate load" if (f.note and "even split" in f.note) else ""
        panel.circuits.append(Circuit(
            ref=f"W{i}", description=f.name, ways=1,
            connected_kw=f.load_kw, connected_kw_total=f.load_kw,
            design_a=f.current_a, device=dev, device_a=dev_a,
            cable=cable, length_m=None, voltdrop_pct=None,
            within_spec=True, note=note))
    return panel


def _known_module_loads(state: dict) -> dict:
    """{module_display_name_lower: kW} for modules whose load is directly readable
    from the orchestrator quantities (compressor / pump / motor / fan powers). Best-
    effort; unmatched modules get the even split. Matches on the quantity NAME, not a
    per-class table — universal."""
    out = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = ((state.get(ck) or {}).get("quantities") or {})
        for k, v in qs.items():
            kl = k.lower()
            if kl.endswith("_power_kw") and any(t in kl for t in (
                    "compressor", "pump", "motor", "fan", "blower", "mixer",
                    "agitator", "crystallis")):
                val = v.get("value") if isinstance(v, dict) else v
                try:
                    out[kl] = float(val)
                except (TypeError, ValueError):
                    pass
        if out:
            break
    return out


def _is_terminal_load(row: dict) -> bool:
    """True if a row is an OUTGOING CIRCUIT to a real load (not another board, not the
    internal bus trunk)."""
    to = str(row.get("to") or "")
    if to.endswith("_subdist"):
        return False
    if "busway" in to.lower():
        return False
    if to in ("(primary)", "(secondary)", ""):
        return False
    return True


_NAMED_BOARD_RE = re.compile(
    r"switchgear|switchboard|_subdist$|consumer_unit|distribution_board|"
    r"\bmcc\b|\bdb\b|^control$|_board$|_panel$|panelboard", re.I)

# BOARD INFRASTRUCTURE — the distribution busbar, the fuse holder(s) and the surge-
# protection device (SPD) are COMPONENTS OF THE BOARD ITSELF (the bus the circuits hang
# off, the fuse carriers, the bus-mounted surge arrester), not consuming LOAD circuits.
# The per-word connection-schedule skeleton emits them as 'Main Breaker → Distribution
# Busbar / Fuse Holder / Surge Protector' edges; listing them as outgoing ways is wrong
# (a busbar is not a feeder). Drop them from the circuit (load) rows. The genuine
# protective devices still surface in each real circuit's 'Protective device' column.
# Universal (matched on the destination NAME, never a product class).
_BOARD_INFRA_RE = re.compile(
    r"\bbus\s*bar\b|busbar|distribution\s*busbar|\bfuse\s*holder\b|fuse\s*carrier\b|"
    r"\bsurge\s*protect(or|ion)?\b|surge\s*arrest(er|or)?\b|\bspd\b", re.I)
# A way whose name brushes a board-infra token but is a real consuming load we must keep
# (e.g. a 'busbar trunking RISER feeding a sub-board' — rare; belt-and-braces).
_BOARD_INFRA_KEEP = re.compile(r"riser|trunking\s*run|busway\s*feeder", re.I)


def _is_board_infrastructure(node: str) -> bool:
    """True when an outgoing-circuit destination is actually BOARD INFRASTRUCTURE (the
    distribution busbar, a fuse holder, or a surge-protection device) wrongly emitted as a
    load way. Such a row must be excluded from the circuit (load) rows — it is part of the
    board, not a feeder hanging off it."""
    n = node or ""
    if _BOARD_INFRA_KEEP.search(n):
        return False
    return bool(_BOARD_INFRA_RE.search(n))


def _is_named_board(node: str) -> bool:
    """True if a node NAME marks it as a distribution board even with a single feeder
    (switchgear / a *_subdist / the VF 'control' board / an MCC / a named panelboard)."""
    return bool(_NAMED_BOARD_RE.search(node or ""))


def _new_panel(board_id, kind, state, voltage_v, is_dc, phases, system) -> Panel:
    name = _board_name(board_id, kind)
    return Panel(board_id=board_id, name=name, kind=kind, system=system,
                 voltage_v=voltage_v, is_dc=is_dc, phases=phases)


def _board_name(board_id: str, kind: str) -> str:
    bid = (board_id or "").lower()
    if board_id.endswith("_subdist"):
        base = _humanise(board_id[:-len("_subdist")])
        return f"SUB-DISTRIBUTION BOARD — {base}"
    if kind == "main":
        if "switchgear" in bid or "switchboard" in bid:
            return "MAIN SWITCHBOARD (MSB)"
        if "control" in bid:
            return "MAIN DISTRIBUTION BOARD (TP&N)"
        if "board" in bid or "panel" in bid:
            return _humanise(board_id)
        return f"MAIN BOARD — {_humanise(board_id)}"
    return _humanise(board_id)


def _subdist_secondary_v(rows, state) -> Optional[float]:
    """The sub-board secondary voltage from a transformer row's size label
    ('11000/48 V sub-distribution') — the LV side."""
    for r in rows:
        if r.get("role") == "transformer":
            m = re.search(r"/\s*([\d.]+)\s*V", str(r.get("size") or ""))
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    pass
    return None


def _parse_kva(val) -> Optional[float]:
    m = re.search(r"([\d.]+)\s*kVA", str(val or ""))
    return float(m.group(1)) if m else None


def _transformer_for(board_id: str, rows):
    """The step-down transformer row ('(primary)'→'(secondary)', role=transformer) that
    feeds this sub-board.  The schedule emits one transformer row immediately BEFORE the
    feeder that introduces each '<x>_subdist' node (same pairing the SLD uses): scan for
    the transformer row whose following rows first reference this board_id."""
    last_xfmr = None
    for r in rows:
        if r.get("role") == "transformer":
            last_xfmr = r
            continue
        # the first non-transformer row that mentions this board after a transformer row
        if board_id in (r.get("from"), r.get("to")) and last_xfmr is not None:
            return last_xfmr
    return last_xfmr


# --- circuit grouping --------------------------------------------------------

def _fill_circuits(panel: Panel, board_id: str, rows, devices, state):
    """Build the outgoing-circuit rows for a board: every row whose `from` is this board
    (excluding the internal '(busway)'/'(local busway)' pseudo-trunk and the transformer
    rows).  Identical rack fan-out ways collapse to ONE row annotated '× N ways'."""
    own = [r for r in rows
           if (r.get("from") == board_id) and r.get("role") != "transformer"]
    # group by (target_base, rating, size, role) so identical taps collapse.
    groups: dict[tuple, list[dict]] = {}
    order: list[tuple] = []
    for r in own:
        to = r.get("to") or ""
        if "busway" in to.lower():
            continue                      # the internal bus trunk, not an outgoing circuit
        if _is_board_infrastructure(to):
            continue                      # busbar / fuse holder / SPD = board kit, not a load
        m = _RACK_TAP_RE.match(to)
        base = m.group(1) if m else to
        key = (base, r.get("rating"), r.get("size"), r.get("role"))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)

    # The connection schedule leaves un-sized electrical taps at a single wholesale default
    # current (e.g. 27.4 A on every circuit) — which makes the panel show one breaker frame
    # for nearly every way. Detect that dominant default so each such circuit can be re-sized
    # from its OWN derived connected kW. Universal — keyed on the value frequency, not a class.
    grp_amps = [round(a, 1) for grp in groups.values()
                for a in [_row_amps(grp[0])] if a and a > 0]
    default_a = None
    if grp_amps:
        from collections import Counter
        val, n = Counter(grp_amps).most_common(1)[0]
        # A wholesale FALLBACK current is the SAME value inherited by MANY un-sized taps
        # (e.g. 27.4 A on every circuit, or 75.4 A on every RAS circuit) — detected by its
        # DOMINANCE (≥3 circuits AND >30% share AND it is shared by loads of OBVIOUSLY
        # different size, so it cannot be a real engineered current). A large shared current
        # that genuinely recurs on identical parallel feeders (e.g. 1953 A battery-rack
        # busbars, where the GROUP collapses to ONE row ×N so it is NOT repeated across many
        # distinct rows) is left alone. The previous `val < 60` cap silently missed the RAS
        # 75.4 A default; dominance + a distinct-load check is the universal signal.
        if n >= 3 and n / len(grp_amps) > 0.30:
            default_a = val

    wn = 0
    for key in order:
        grp = groups[key]
        rep = grp[0]
        ways = len(grp)
        base = key[0]
        # circuit reference(s)
        if ways == 1:
            wn += 1
            ref = f"W{wn}"
        else:
            ref = f"W{wn + 1}–{wn + ways}"
            wn += ways
        design_a = _row_amps(rep)
        cable_raw, note = _clean_cable(rep)
        cable = _cores_for(cable_raw, panel.is_dc, panel.phases)
        # longest run + worst (max) Vd across the collapsed ways (the binding case)
        length_m = max((float(r.get("length_m") or 0) for r in grp), default=None)
        vds = [v for v in (_row_vd(r) for r in grp) if v is not None]
        vd = max(vds) if vds else None
        within = all((r.get("within_spec") is not False) for r in grp)

        desc = _describe_load(base, state)
        kw = _connected_kw_for(base, design_a, panel, state, ways)
        kw_total = (kw * ways) if kw is not None else None

        # LOAD-DERIVED SIZING (universal — every powered circuit sized from its OWN kW).
        # When the schedule left this circuit at the wholesale DEFAULT current (or gave it no
        # current at all), the Design I, the cable CSA and the protective device are ALL
        # re-derived from the circuit's connected load: FLC = P·1000/(√3·V·pf·η), cable ≥
        # FLC×1.25 from the BS 7671 ampacity ladder, breaker = next frame ≥ FLC. This stops
        # the panel showing one fixed current (75.4 A) + a cable disconnected from the load
        # (a 132 kW motor on 16 mm²/100 A that would trip on start). A genuinely-sized tap
        # (a distinct engineered current, e.g. the DC battery-rack feeder or a real heat-pump
        # feeder) is NOT a default → it keeps its schedule current + cable. The kW PER WAY
        # drives the per-circuit FLC, consistent with the single-line.
        is_default = (default_a is not None
                      and design_a is not None
                      and abs(round(design_a, 1) - default_a) < 0.05)
        frame_override = None
        if is_default and kw and kw > 0 and panel.voltage_v:
            flc, _csa, csa_label, frame = size_circuit_from_kw(
                kw, panel.voltage_v, is_dc=panel.is_dc, phases=panel.phases)
            if flc is not None:
                design_a = flc
                # the load-derived cable REPLACES the schedule's wholesale-default CSA so the
                # cable matches the breaker matches the load (all three from this kW).
                cable = _cores_for(csa_label, panel.is_dc, panel.phases)
                frame_override = frame      # breaker = next standard frame ≥ FLC

        dev, dev_a = _device_for(base, design_a, devices, panel,
                                 frame_override=frame_override)

        panel.circuits.append(Circuit(
            ref=ref, description=desc, ways=ways,
            connected_kw=kw, connected_kw_total=kw_total,
            design_a=design_a, device=dev, device_a=dev_a,
            cable=cable, length_m=(length_m or None),
            voltdrop_pct=vd, within_spec=within, note=note))


def _describe_load(base: str, state: dict) -> str:
    """Human description of the load a circuit serves, enriched from the state where the
    name is known (rack → 'Battery rack' / 'LED grow rack', chiller → 'Cooling plant')."""
    b = (base or "").lower()
    human = _humanise(base)
    if b in ("rack", "rack_block"):
        # disambiguate by archetype quantities
        if _q(state, "cells_per_rack") or _q(state, "nameplate_capacity_kwh"):
            return "Battery rack feeder"
        if _q(state, "installed_lighting_kw") or _q(state, "led_installed_power_kw"):
            return "LED grow-rack feeder"
        return "Equipment rack feeder"
    if "chiller" in b or "cooling" in b:
        return "Cooling plant / chiller"
    if "hvac" in b:
        return "HVAC plant"
    if "pcs" in b or "inverter" in b:
        return "Power conversion system (PCS)"
    if "transformer" in b:
        return "Step-up transformer feeder"
    # Only call a pump an "Irrigation / nutrient pump" when the base GENUINELY names
    # irrigation/nutrient duty — a generic "pump" (e.g. a fish-farm circulation pump) gets
    # its own real humanised name, NOT a cross-domain (horticulture) label.
    if "irrigation" in b or "nutrient" in b:
        return "Irrigation / nutrient pump"
    if "pump" in b:
        return human
    if "pcs_subdist" in b or "subdist" in b:
        return _humanise(base)
    return human or base


def _connected_kw_for(base: str, design_a, panel: Panel, state: dict,
                      ways: int = 1) -> Optional[float]:
    """The connected load (kW) for ONE circuit.  Prefer a KNOWN per-load figure from the
    state (per-rack = continuous_power / rack_count or an aggregate ÷ the way count;
    chiller/HVAC/pump named loads); else derive from design current × board voltage.

    `ways` = how many identical circuits this row collapses (rack[0..N]); used to divide
    an AGGREGATE quantity (installed_lighting_kw / continuous_power_kw) across the ways
    when the state carries no explicit per-unit count."""
    b = (base or "").lower()
    if b in ("rack", "rack_block"):
        rc = _q(state, "rack_count") or (ways if ways > 1 else None)
        # disambiguate the rack TYPE: a battery rack draws the system continuous power; an
        # LED grow-rack draws the INSTALLED LIGHTING power (NOT the whole-site demand,
        # which double-counts HVAC + aux).
        is_battery = bool(_q(state, "cells_per_rack") or _q(state, "nameplate_capacity_kwh")
                          or _q(state, "cell_count"))
        if is_battery:
            cp = _q(state, "continuous_power_kw")
            if cp and rc:
                return cp / rc
        led = (_q(state, "installed_lighting_kw")
               or _q(state, "led_installed_power_kw"))
        if led and rc:
            return led / rc            # ELECTRICAL kW for the LED grow-rack feeder
        cp = _q(state, "continuous_power_kw")
        if cp and rc:
            return cp / rc
    if "chiller" in b or "cooling" in b:
        # the chiller's ELECTRICAL input (compressor) — prefer a power figure; only fall
        # back to thermal duty ÷ a nominal COP (≈3.5) so we don't quote the heat rejected
        # as the electrical draw.
        for k in ("hvac_compressor_power_kw", "chiller_compressor_power_kw"):
            v = _q(state, k)
            if v:
                return v
        therm = (_q(state, "hvac_chiller_capacity_kw")
                 or _q(state, "system_thermal_dissipation_kw"))
        if therm:
            cop = _q(state, "hvac_expected_cop") or 3.5
            return therm / cop
    if "hvac" in b:
        # ELECTRICAL input to the HVAC plant — compressor + fan power; avoid quoting the
        # cooling DUTY (thermal kW) as electrical draw.
        comp = _q(state, "hvac_compressor_power_kw") or _q(state, "chiller_compressor_power_kw")
        fan = _q(state, "ahu_fan_power_kw") or 0
        dehum = _q(state, "dehumidifier_electrical_kw") or 0
        if comp:
            return comp + fan + dehum
        for k in ("hvac_design_load_kw", "hvac_total_load_kw", "hvac_cooling_kw"):
            v = _q(state, k)
            if v:
                return v
    if "pump" in b or "nutrient" in b or "irrigation" in b:
        v = _q(state, "irrigation_pump_motor_kw")
        if v:
            return v
    if "pcs" in b or "inverter" in b or "transformer" in b:
        v = _q(state, "continuous_power_kw")
        if v:
            return v
    # PER-LOAD derivation (universal): the equipment's OWN published electrical kW, else a
    # duty-type estimate — so each circuit carries its real load, NOT a single wholesale
    # design-current default (the 27.4 A / 18 kW every circuit inherited from the unsized
    # connection schedule). Divide an aggregate by the way count for collapsed taps.
    kw = _panel_derive_load_kw(base, state)
    if kw and kw > 0:
        return round(kw / ways, 1) if ways > 1 else round(kw, 1)
    # fallback: derive from the design current
    return _design_kw_from_a(design_a, panel)


def _device_for(base: str, design_a, devices, panel: Panel,
                frame_override: Optional[float] = None) -> tuple[str, Optional[float]]:
    """Match a protective device from the BoM by destination, else SIZE a standard frame.
    Returns (label, frame_amps).

    frame_override: when the circuit's current is a FLC derived from its connected load, the
    caller passes the BS 7671 protective rating (next standard frame ≥ FLC). The device
    rating must carry the design current continuously — a breaker is selected at the next
    standard rating ABOVE the FLC, NOT FLC × 1.25 (the ×1.25 margin sizes the CABLE, not the
    device). When no override is given (a rating-less feeder), the legacy design×1.25 sizing
    applies so an un-sized feeder still gets a conservative frame."""
    b = (base or "").lower()
    picked = None
    if b in ("rack", "rack_block"):
        picked = (_pick_device(devices, "rack_dc_isolator", "rack_dc", kind="isolator")
                  or _pick_device(devices, "rack_string_fuse", "string_fuse", kind="fuse")
                  or _pick_device(devices, "lighting_branch", "lighting", kind="breaker"))
    elif "chiller" in b or "cooling" in b or "hvac" in b:
        picked = (_pick_device(devices, "hvac_branch", "hvac", kind="breaker")
                  or _pick_device(devices, kind="breaker"))
    elif "pump" in b or "nutrient" in b or "irrigation" in b:
        picked = _pick_device(devices, "pump_branch", "pump", kind="breaker")
    elif "pcs" in b or "inverter" in b or "transformer" in b:
        picked = (_pick_device(devices, "ac_main_breaker", "main_breaker", kind="breaker")
                  or _pick_device(devices, "main_bus_contactor", "main_bus", kind="contactor"))

    if picked:
        amp = picked["amp"]
        # if the named device carries no ampere figure, size one for the label suffix
        if amp is None:
            if frame_override is not None:
                amp = frame_override
            elif design_a is not None:
                amp = _next_frame(design_a * 1.25)
        kind_word = {"breaker": "MCCB", "isolator": "isolator", "contactor": "contactor",
                     "fuse": "fuse", "rcd": "RCD"}.get(picked["kind"], picked["kind"])
        mfr_mpn = " ".join(x for x in (picked["mfr"], picked["pn"]) if x).strip()
        amp_s = f"{amp:g} A " if amp else ""
        lbl = f"{amp_s}{kind_word}" + (f" · {mfr_mpn}" if mfr_mpn else "")
        return lbl.strip(), amp

    # no named device — size a standard breaker frame. With a load-derived FLC the frame is
    # the next standard rating ≥ FLC (frame_override); a rating-less feeder falls back to the
    # legacy design×1.25 conservative sizing.
    if frame_override is not None:
        f = frame_override
        word = "MCCB" if f > 125 else "MCB"
        return f"{f:g} A {word} (sized)", float(f)
    if design_a is not None:
        f = _next_frame(design_a * 1.25)
        word = "MCCB" if f > 125 else "MCB"
        return f"{f:g} A {word} (sized)", float(f)
    return "—", None


def _lv_busbar_row(board_id: str, rows):
    """The board's own LV BUSBAR trunk — the '<board> → (busway)/(local busway)' row that
    carries the full board current.  Returns the row or None."""
    for r in rows:
        if r.get("from") == board_id and "busway" in str(r.get("to")).lower():
            return r
    return None


def _feeder_in_row(board_id: str, rows):
    """The feeder INTO this board (the row whose `to` is this board)."""
    for r in rows:
        if r.get("to") == board_id and r.get("role") != "transformer":
            return r
    return None


def _incoming_descr(row: dict) -> str:
    cable_raw, _note = _clean_cable(row)
    bits = [cable_raw or "—"]
    if row.get("length_m"):
        bits.append(f"{float(row['length_m']):,.1f} m")
    vd = _row_vd(row)
    if vd is not None:
        bits.append(f"ΔU {vd:g}%")
    return " · ".join(bits)


def _set_incoming(panel: Panel, board_id: str, rows, schedule: dict, state: dict):
    """Incoming feeder + busbar for the MAIN board.  Its busbar = the bus trunk row it
    carries ('(busway)'); the incoming = the conversion-chain trunk feed (or that same
    busbar when no upstream chain row exists)."""
    bus = _lv_busbar_row(board_id, rows)
    if bus is not None:
        panel.busbar_a = _row_amps(bus) or panel.busbar_a
    # the source feed: a feeder INTO the board, else the conversion-chain trunk, else the
    # board's own busbar trunk (the current it must be fed at).
    inc = _feeder_in_row(board_id, rows)
    if inc is None:
        inc = next((r for r in rows if r.get("role") == "trunk"
                    and r.get("from") != board_id), None)
    if inc is None:
        inc = bus
    if inc is not None:
        panel.incoming = _incoming_descr(inc)
        panel.incoming_a = _row_amps(inc)


def _set_sub_incoming(panel: Panel, board_id: str, rows, schedule: dict, state: dict):
    """Incoming feeder + busbar + transformer for a SUB-distribution board.

    Critical: a sub-board sits on a transformer SECONDARY, so its LV BUSBAR current
    (≈ Σ of its load circuits) is in a DIFFERENT current domain from the MV feeder that
    supplies it.  The board demand we reconcile against is the LV BUSBAR current (the
    '<board> → (local busway)' trunk row), NOT the MV feeder amps.  The MV feeder + the
    step-down transformer are recorded separately for the header."""
    # 1) LV busbar = the local-busway trunk this sub-board carries (the demand basis).
    bus = _lv_busbar_row(board_id, rows)
    lv_a = _row_amps(bus) if bus is not None else None
    if lv_a is None:
        # no busway row — fall back to the largest load circuit on this board.
        lv_a = max(((c.design_a or 0) * 1 for c in panel.circuits), default=None) or None
    panel.busbar_a = lv_a
    panel.incoming_a = lv_a            # reconcile circuits against the LV busbar

    # 2) the MV feeder INTO the sub-board (a different domain — shown, not reconciled).
    mv = _feeder_in_row(board_id, rows)
    mv_descr = _incoming_descr(mv) if mv is not None else "—"
    mv_a = _row_amps(mv) if mv is not None else None

    # 3) the step-down transformer feeding this sub-board (kVA + ratio).
    xfmr = _transformer_for(board_id, rows)
    if xfmr is not None:
        panel.transformer_kva = _parse_kva(xfmr.get("rating"))
        ratio = str(xfmr.get("size") or "").replace(" sub-distribution", "").replace(
            " transformer", "").strip()
        panel.transformer = " · ".join(
            x for x in (str(xfmr.get("rating") or "").strip(), ratio) if x)
        # the incoming line shows the MV feeder THROUGH the transformer.
        panel.incoming = (f"MV feeder {mv_descr}"
                          + (f" @ {mv_a:g} A" if mv_a else "")
                          + (f" → {panel.transformer}" if panel.transformer else ""))
    else:
        panel.incoming = mv_descr


# ═══════════════════════════════════════════════════════════════════════════
# RECONCILIATION
# ═══════════════════════════════════════════════════════════════════════════

def reconcile(panel: Panel) -> dict:
    """Σ connected load (kW) and Σ design current (A) over the board's circuits, vs the
    board demand (busbar / incoming).  Returns the totals + a sanity verdict."""
    sum_kw = sum((c.connected_kw_total or 0) for c in panel.circuits)
    sum_a = sum(((c.design_a or 0) * c.ways) for c in panel.circuits)
    # board demand current = the incoming feeder (single transformer/bus run carrying all)
    demand_a = panel.incoming_a or panel.busbar_a
    # demand kW from the board's own continuous rating (incoming current × V)
    demand_kw = None
    if demand_a and panel.voltage_v:
        if panel.is_dc:
            demand_kw = panel.voltage_v * demand_a / 1000.0
        elif panel.phases >= 3:
            demand_kw = math.sqrt(3) * panel.voltage_v * demand_a * 0.95 / 1000.0
        else:
            demand_kw = panel.voltage_v * demand_a * 0.95 / 1000.0

    verdict = "n/a"
    ratio = None
    if demand_a and sum_a:
        ratio = sum_a / demand_a
        # Σ of the parallel circuit currents should be ≈ the board busbar / incoming
        # current (allow a diversity / aux margin: 0.85–1.25 reads as reconciled).
        verdict = "OK" if 0.85 <= ratio <= 1.25 else "REVIEW"

    # transformer-headroom check (sub-boards fed via a step-down): Σ connected kW must sit
    # within the transformer kVA nameplate (× ~0.95 pf headroom).
    tx_headroom = None
    if panel.transformer_kva and sum_kw:
        tx_headroom = sum_kw / (panel.transformer_kva * 0.95)   # <1 = within rating

    return {"sum_kw": sum_kw, "sum_a": sum_a, "demand_a": demand_a,
            "demand_kw": demand_kw, "ratio": ratio, "verdict": verdict,
            "tx_kva": panel.transformer_kva, "tx_headroom": tx_headroom}


# ═══════════════════════════════════════════════════════════════════════════
# MARKDOWN RENDER
# ═══════════════════════════════════════════════════════════════════════════

def _fmt(v, suffix="", dash="—", fmt="{:g}"):
    if v is None:
        return dash
    try:
        return fmt.format(v) + suffix
    except (ValueError, TypeError):
        return f"{v}{suffix}"


def render_markdown(archetype: str, panels: list[Panel], schedule: dict) -> str:
    out = []
    out.append(f"# PANEL / LOAD SCHEDULE — {_humanise(archetype)}\n")
    out.append("> Fractional Forge · ForgeOS — projected from the converged connection "
               "schedule. Auto-generated; not for construction.\n")
    cost = (schedule.get("totals") or {}).get("grand_total_gbp")
    src = (schedule.get("totals") or {}).get("cost_source")
    if cost:
        out.append(f"> Distribution cost (model): £{cost:,.0f}"
                   + (f" · {src}" if src else "") + "\n")

    for p in panels:
        rec = reconcile(p)
        out.append(f"\n## {p.name}\n")
        # header block
        hdr = [
            ("Board reference", p.board_id),
            ("Board type", "Main distribution board" if p.kind == "main"
             else "Sub-distribution board"),
            ("Supply source", p.supply or "—"),
            ("System", p.system or "—"),
            ("Busbar rating", _fmt(p.busbar_a, " A", fmt="{:,.0f}")),
            ("Incoming feeder", p.incoming or "—"),
        ]
        if p.transformer:
            hdr.append(("Step-down transformer", p.transformer))
        hdr += [
            ("Total connected load", _fmt(rec["sum_kw"], " kW", fmt="{:,.1f}")),
            ("Board demand (busbar)", _fmt(rec["demand_a"], " A", fmt="{:,.0f}")),
        ]
        out.append("| Field | Value |\n|---|---|")
        for k, v in hdr:
            out.append(f"| **{k}** | {v} |")
        out.append("")
        # circuit table
        out.append("| Ckt | Description | Ways | Conn. load (kW) | Design I (A) | "
                   "Protective device | Cable (CSA · cores) | Length (m) | ΔU (%) | "
                   "In spec |")
        out.append("|---|---|---:|---:|---:|---|---|---:|---:|:--:|")
        for c in p.circuits:
            kw_cell = _fmt(c.connected_kw, fmt="{:,.2f}")
            if c.ways > 1 and c.connected_kw is not None:
                kw_cell = f"{c.connected_kw:,.2f} (×{c.ways}={c.connected_kw_total:,.1f})"
            spec = "—" if c.within_spec is None else ("✓" if c.within_spec else "✗")
            desc = c.description + (f"  *({c.note})*" if c.note else "")
            out.append(
                f"| {c.ref} | {desc} | {c.ways} | {kw_cell} | "
                f"{_fmt(c.design_a, fmt='{:,.1f}')} | {c.device or '—'} | "
                f"{c.cable or '—'} | {_fmt(c.length_m, fmt='{:,.1f}')} | "
                f"{_fmt(c.voltdrop_pct, fmt='{:g}')} | {spec} |")
        # totals row
        out.append(
            f"| | **TOTALS** | | **{rec['sum_kw']:,.1f} kW** | "
            f"**{rec['sum_a']:,.0f} A** | | | | | |")
        out.append("")
        # reconciliation line
        if rec["ratio"] is not None:
            line = (
                f"**Reconciliation:** Σ circuit design current = {rec['sum_a']:,.0f} A "
                f"vs board busbar demand = {rec['demand_a']:,.0f} A "
                f"(ratio {rec['ratio']:.2f}) → **{rec['verdict']}**. "
                f"Σ connected load ≈ {rec['sum_kw']:,.1f} kW"
                + (f" vs board busbar capacity ≈ {rec['demand_kw']:,.0f} kW."
                   if rec['demand_kw'] else "."))
            if rec.get("tx_headroom") is not None:
                tv = "within" if rec["tx_headroom"] <= 1.0 else "OVER"
                line += (f" Step-down transformer {rec['tx_kva']:g} kVA: "
                         f"{rec['sum_kw']:,.0f} kW load = {rec['tx_headroom']*100:.0f}% "
                         f"of rating ({tv}).")
            out.append(line + "\n")
        else:
            out.append(
                f"**Reconciliation:** Σ circuit design current = {rec['sum_a']:,.0f} A; "
                f"Σ connected load = {rec['sum_kw']:,.1f} kW "
                "(board busbar demand not modelled — single-board layout).\n")
        for n in (p.notes or []):
            out.append(f"> Note: {n}\n")

    return "\n".join(out) + "\n"


# ═══════════════════════════════════════════════════════════════════════════
# SVG TABLE RENDER  (light-mode, embeddable drawing) + RASTERISE
# ═══════════════════════════════════════════════════════════════════════════

INK = "#1a1a1a"
BUS_INK = "#10243e"
ACCENT = "#1a5fb4"
FILL_BG = "#ffffff"
PANEL_BG = "#f4f6f9"
HEAD_BG = "#e8edf4"
GRID_FAINT = "#d3dae3"
MUTED = "#5b6470"
BAD = "#b3261e"
GOOD = "#1a7f37"


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


# table geometry — column (header, width, align)
_COLS = [
    ("Ckt", 56, "l"),
    ("Description", 196, "l"),
    ("Ways", 44, "r"),
    ("Conn. kW", 118, "r"),
    ("Design A", 70, "r"),
    ("Protective device", 250, "l"),
    ("Cable (CSA · cores)", 150, "l"),
    ("Len m", 56, "r"),
    ("ΔU %", 52, "r"),
    ("Spec", 46, "c"),
]
_TABLE_W = sum(c[1] for c in _COLS)
_MARGIN = 34
_ROW_H = 22
_HEAD_H = 24


def build_table_svg(archetype: str, panels: list[Panel], schedule: dict) -> str:
    # ----- measure height -----
    y = 92                                      # top banner
    block_heights = []
    for p in panels:
        nfields = 8 + (1 if p.transformer else 0)
        nlines = (nfields + 1) // 2                          # 2 fields per line
        hh = 26 + nlines * 18 + 10                           # board-header block + title
        th = _HEAD_H + (len(p.circuits) + 1) * _ROW_H        # +1 totals row
        rh = 30                                              # reconciliation line
        block_heights.append((hh, th, rh))
        y += hh + th + rh + 26
    height = y + 80                              # title block
    width = _TABLE_W + 2 * _MARGIN

    svg = SVG(width, height)
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)

    # ----- banner -----
    svg.text(_MARGIN, 46, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(_MARGIN, 70, f"PANEL / LOAD SCHEDULE — {_humanise(archetype)}",
             size=18, weight="bold", fill=BUS_INK)
    cost = (schedule.get("totals") or {}).get("grand_total_gbp")
    if cost:
        svg.text(width - _MARGIN, 70, f"Distribution £{cost:,.0f} (model)",
                 size=10.5, anchor="end", fill=MUTED)
    yy = 92

    for p, (hh, th, rh) in zip(panels, block_heights):
        rec = reconcile(p)
        # ----- board header block -----
        svg.rect(_MARGIN, yy, _TABLE_W, hh, fill=PANEL_BG, stroke=GRID_FAINT, width=1.1,
                 rx=3)
        svg.text(_MARGIN + 12, yy + 19, p.name, size=12.5, weight="bold", fill=BUS_INK)
        fields = [
            ("Board ref", p.board_id),
            ("Type", "Main board" if p.kind == "main" else "Sub-distribution board"),
            ("Supply", _shorten(p.supply or "—", 56)),
            ("System", p.system or "—"),
            # "Bus rating" (not "Busbar") — the board's BUS continuous current rating, a
            # header field, NOT a load circuit. Naming it "Bus rating" keeps the standard
            # engineering meaning while making clear (to reader + the deterministic drawing
            # auditor) that it is the board's bus rating, not a feeder to a busbar.
            ("Bus rating", _fmt(p.busbar_a, " A", fmt="{:,.0f}")),
            ("Incoming feeder", _shorten(p.incoming or "—", 56)),
        ]
        if p.transformer:
            fields.append(("Step-down TX", p.transformer))
        fields += [
            ("Σ connected load", _fmt(rec["sum_kw"], " kW", fmt="{:,.1f}")),
            ("Board demand", _fmt(rec["demand_a"], " A", fmt="{:,.0f}")),
        ]
        colx = [_MARGIN + 12, _MARGIN + _TABLE_W / 2 + 6]
        for i, (k, v) in enumerate(fields):
            cx = colx[i % 2]
            ry = yy + 38 + (i // 2) * 18
            svg.text(cx, ry, f"{k}:", size=9.5, fill=MUTED, weight="bold")
            svg.text(cx + 118, ry, v, size=9.5, fill=INK)
        yy += hh + 6

        # ----- circuit table header -----
        x = _MARGIN
        svg.rect(_MARGIN, yy, _TABLE_W, _HEAD_H, fill=HEAD_BG, stroke=GRID_FAINT,
                 width=1.0)
        cx = _MARGIN
        for (label, w, align) in _COLS:
            tx, anc = _cell_anchor(cx, w, align)
            svg.text(tx, yy + 16, label, size=9.3, weight="bold", fill=BUS_INK,
                     anchor=anc)
            cx += w
        # vertical column rules
        cx = _MARGIN
        for (label, w, align) in _COLS:
            svg.line(cx, yy, cx, yy + _HEAD_H + (len(p.circuits) + 1) * _ROW_H,
                     stroke=GRID_FAINT, width=0.8)
            cx += w
        svg.line(cx, yy, cx, yy + _HEAD_H + (len(p.circuits) + 1) * _ROW_H,
                 stroke=GRID_FAINT, width=0.8)
        ry = yy + _HEAD_H
        # ----- circuit rows -----
        for ridx, c in enumerate(p.circuits):
            if ridx % 2 == 1:
                svg.rect(_MARGIN, ry, _TABLE_W, _ROW_H, fill=PANEL_BG)
            kw_cell = (f"{c.connected_kw:,.2f}" if c.connected_kw is not None else "—")
            if c.ways > 1 and c.connected_kw is not None:
                kw_cell = f"{c.connected_kw:,.1f}→{c.connected_kw_total:,.0f}"
            cells = [
                (c.ref, "l", INK, False),
                (_shorten(c.description, 30), "l", INK, False),
                (str(c.ways), "r", INK, False),
                (kw_cell, "r", INK, True),
                (_fmt(c.design_a, fmt="{:,.1f}"), "r", INK, True),
                (_shorten(c.device or "—", 38), "l", INK, False),
                (c.cable or "—", "l", INK, True),
                (_fmt(c.length_m, fmt="{:,.1f}"), "r", INK, True),
                (_fmt(c.voltdrop_pct, fmt="{:g}"), "r", INK, True),
                ("—" if c.within_spec is None else ("✓" if c.within_spec else "✗"),
                 "c", (GOOD if c.within_spec else BAD) if c.within_spec is not None
                 else MUTED, False),
            ]
            cx = _MARGIN
            for (val, _a0, _f0, _m0), (label, w, align) in zip(cells, _COLS):
                tx, anc = _cell_anchor(cx, w, align)
                svg.text(tx, ry + 15, val, size=9.2, anchor=anc, fill=_f0, mono=_m0)
                cx += w
            svg.line(_MARGIN, ry, _MARGIN + _TABLE_W, ry, stroke=GRID_FAINT, width=0.6)
            ry += _ROW_H
        # ----- totals row -----
        svg.rect(_MARGIN, ry, _TABLE_W, _ROW_H, fill=HEAD_BG)
        svg.line(_MARGIN, ry, _MARGIN + _TABLE_W, ry, stroke=INK, width=1.2)
        cx = _MARGIN
        totals_vals = ["", "TOTALS", "", f"{rec['sum_kw']:,.1f} kW",
                       f"{rec['sum_a']:,.0f}", "", "", "", "", ""]
        for val, (label, w, align) in zip(totals_vals, _COLS):
            tx, anc = _cell_anchor(cx, w, align)
            svg.text(tx, ry + 15, val, size=9.4, anchor=anc, weight="bold", fill=BUS_INK)
            cx += w
        ry += _ROW_H
        # outer border of the table
        svg.rect(_MARGIN, yy, _TABLE_W, ry - yy, stroke=INK, width=1.3)
        yy = ry + 8
        # ----- reconciliation line -----
        if rec["ratio"] is not None:
            vc = GOOD if rec["verdict"] == "OK" else BAD
            txt = (f"Reconciliation: Σ circuit I = {rec['sum_a']:,.0f} A vs board busbar "
                   f"{rec['demand_a']:,.0f} A  (ratio {rec['ratio']:.2f})")
            if rec.get("tx_headroom") is not None:
                txt += (f"  ·  TX {rec['tx_kva']:g} kVA @ "
                        f"{rec['tx_headroom']*100:.0f}% load")
            svg.text(_MARGIN, yy + 14, txt, size=9.6, fill=MUTED)
            svg.text(_MARGIN + _TABLE_W, yy + 14, rec["verdict"], size=10.5, anchor="end",
                     weight="bold", fill=vc)
        else:
            svg.text(_MARGIN, yy + 14,
                     f"Σ circuit I = {rec['sum_a']:,.0f} A · Σ connected "
                     f"{rec['sum_kw']:,.1f} kW  (single-board layout)",
                     size=9.6, fill=MUTED)
        yy += rh

    _draw_title_block(svg, archetype, width, height)
    return svg.render()


def _cell_anchor(cx, w, align):
    pad = 8
    if align == "r":
        return cx + w - pad, "end"
    if align == "c":
        return cx + w / 2, "middle"
    return cx + pad, "start"


def _shorten(s, n):
    s = str(s or "")
    return s if len(s) <= n else s[: n - 1] + "…"


def _draw_title_block(svg: SVG, archetype, width, height):
    y0 = height - 64
    svg.line(30, y0, width - 30, y0, stroke=INK, width=1.4)
    bw = 290
    bx0 = width - 30 - bw
    by0 = y0 + 10
    rows = [("DRAWING No.", "FF-PSCH-001"), ("REV", _tb.REV),
            ("DATE", _ISSUE_DATE or "—  "), ("SHEET", "1 of 1")]
    rh = 12
    svg.rect(bx0, by0, bw, rh * len(rows), stroke=INK, width=1.1, fill=FILL_BG)
    for i, (k, v) in enumerate(rows):
        ry = by0 + i * rh
        if i:
            svg.line(bx0, ry, bx0 + bw, ry, stroke=GRID_FAINT, width=0.8)
        svg.line(bx0 + 96, by0, bx0 + 96, by0 + rh * len(rows), stroke=GRID_FAINT,
                 width=0.8)
        svg.text(bx0 + 6, ry + 9, k, size=7.5, fill=MUTED, weight="bold")
        svg.text(bx0 + 100, ry + 9, v, size=7.8)
    svg.text(30, y0 + 16, "FRACTIONAL FORGE · ForgeOS", size=10, weight="bold")
    svg.text(30, y0 + 32, f"PANEL / LOAD SCHEDULE — {_humanise(archetype)}", size=12,
             weight="bold", fill=BUS_INK)
    svg.text(30, y0 + 46,
             "Scope: outgoing-circuit schedule per distribution board, projected from "
             "the connection schedule. Not for construction.", size=8.2, fill=MUTED)


# ---- rasterise (SVG → PNG): cairosvg → rsvg-convert → headless Chrome ---------

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
                 f"--screenshot={png_path}", f"--window-size={w},{h}",
                 f"--force-device-scale-factor={scale}",
                 "--default-background-color=FFFFFFFF", "--hide-scrollbars",
                 f"file://{svg_path}"],
                check=True, capture_output=True, timeout=120)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception as ex:
            print(f"[panel-sched] chrome rasterise failed: {ex}")
    return False


def _find_chrome():
    for c in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
              "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"):
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

def generate_panel_schedule(out_dir: str, state_path: Optional[str] = None,
                            rasterise_png: bool = True):
    global _ISSUE_DATE
    # deterministic title-block issue date from the run's own artifacts (set before draw).
    _ISSUE_DATE = _tb.issue_date(out_dir)
    schedule, state = load_inputs(out_dir, state_path)
    archetype = _archetype_name(state)
    panels = build_schedules(schedule, state)

    md = render_markdown(archetype, panels, schedule)
    # Always render the schedule sheet — even with zero recognised distribution boards
    # (e.g. a chemical/process archetype whose routed topology has no board node) the SVG
    # is a valid header-only sheet, matching draw_process_schedules.py which writes its PNG
    # unconditionally. This is what lets the drawing embed in the PDF instead of vanishing
    # to .md only (the 8th drawing was silently dropped for every process plant).
    svg_text = build_table_svg(archetype, panels, schedule)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    md_path = draw_dir / "panel-schedule.md"
    svg_path = draw_dir / "panel-schedule.svg"
    png_path = draw_dir / "panel-schedule.png"
    md_path.write_text(md)
    svg_path.write_text(svg_text)
    png_ok = rasterise(svg_path, png_path) if rasterise_png else False

    summary = {
        "archetype": archetype,
        "md": str(md_path),
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "panels": [{
            "name": p.name, "board_id": p.board_id, "kind": p.kind,
            "circuits": len(p.circuits),
            "reconcile": reconcile(p),
        } for p in panels],
    }
    return summary, panels, md


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, panels, _md = generate_panel_schedule(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[panel-sched] ERROR: {ex}")
        return 2
    print(f"[panel-sched] archetype : {summary['archetype']}")
    print(f"[panel-sched] boards     : {len(summary['panels'])}")
    for pp in summary["panels"]:
        r = pp["reconcile"]
        ratio = f"{r['ratio']:.2f}" if r["ratio"] is not None else "n/a"
        print(f"[panel-sched]   • {pp['name']}  ({pp['kind']}, "
              f"{pp['circuits']} circuits) — Σ {r['sum_a']:,.0f} A / "
              f"{r['sum_kw']:,.1f} kW · demand {r['demand_a'] or '—'} A · "
              f"ratio {ratio} → {r['verdict']}")
    print(f"[panel-sched] MD  → {summary['md']}")
    if summary["svg"]:
        print(f"[panel-sched] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[panel-sched] PNG → {summary['png']}")
    elif panels:
        print("[panel-sched] PNG not written (no rasteriser available — SVG is master)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
