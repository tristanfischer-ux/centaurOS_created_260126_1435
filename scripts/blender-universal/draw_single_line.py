#!/usr/bin/env python3
"""draw_single_line.py — UNIVERSAL single-line electrical diagram (SLD) generator.

The FIRST projected ENGINEERING DRAWING for the universal CAD system. It does NOT
recompute anything and it does NOT touch build_universal_scene.py — it CONSUMES that
generator's outputs and PROJECTS the electrical distribution into a standard SLD, the
real engineering deliverable an electrical engineer expects.

INPUTS (read-only):
  <out>/connection-schedule.json  — the sized electrical runs (from / to / mechanism=
        electrical|electrical_bus / size / rating A / volt-drop % / role / any D2
        sub-distribution transformer rows / costs).  Produced by build_universal_scene.
  <state.json>                    — the archetype state: loads + power ratings, the
        incomer/source, and the protective devices (BoM words named breaker / contactor
        / switchgear / busbar / fuse / RCD / isolator / relay).  Auto-discovered next to
        the schedule, or passed explicitly.

PIPELINE:
  1. reconstruct_tree()  — rebuild SOURCE/incomer → MAIN switchboard/busbar → feeders →
       sub-distributions (D2 transformers / panels) → final LOADS.  Each node/branch
       carries: tag, rating (A / kVA), protective device (breaker), cable size (CSA),
       volt-drop %.  Repeated fan-out (15 identical rack taps) collapses to ONE
       representative feeder annotated "× N" so the drawing reads like an engineer's
       SLD, not a 60-node graph dump.
  2. build_sld_svg()    — draw a STANDARD single-line diagram (deterministic, light-mode
       SVG): incomer at the TOP, a horizontal MAIN BUSBAR (heavy line), feeders/loads
       dropping off it, a sub-distribution as a two-winding transformer feeding a
       sub-busbar with its own loads.  Proper IEC/IEEE-style SYMBOLS (utility incomer,
       circuit breaker, isolator/contactor, busbar, two-winding transformer, load) —
       NOT boxes.  Title block + scope note.
  3. rasterise()        — SVG → PNG (headless Chrome → cairosvg → rsvg-convert cascade).

OUTPUTS:
  <out>/drawings/single-line-diagram.svg
  <out>/drawings/single-line-diagram.png

Run:
  python3 scripts/blender-universal/draw_single_line.py out/rerun-energy_storage
  python3 scripts/blender-universal/draw_single_line.py /tmp/sld-efuel out/oxccu-saf-v21/state.json

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

# Universal distribution-voltage + per-module feeder model (shared with the panel
# schedule). Keyed on load magnitude + the connection model — never product class.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import electrical_distribution_model as edm  # noqa: E402
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — the reconstructed distribution tree
# ═══════════════════════════════════════════════════════════════════════════

# Symbol kinds an SLD node can take (drives which IEC/IEEE glyph is drawn).
SYM_UTILITY = "utility"            # utility / grid incomer (the source)
SYM_BUSBAR = "busbar"             # main or sub busbar (heavy horizontal line)
SYM_TRANSFORMER = "transformer"    # two-winding transformer (two interlocked circles)
SYM_LOAD = "load"                 # a final load / equipment block
SYM_SOURCE_GEN = "generator"       # a generating source (circle 'G') — PV/genset feed-in


@dataclass
class Device:
    """A protective / switching device drawn IN-LINE on a branch (the order is the
    physical order from the bus down to the load)."""
    kind: str               # 'breaker' | 'isolator' | 'contactor' | 'fuse' | 'rcd'
    tag: str                # short label e.g. 'CB', 'Q', 'F'
    detail: str = ""        # mfr + MPN + rating, shown beside the symbol


@dataclass
class Branch:
    """A feeder / load drop off a busbar: bus → [devices…] → load (or → transformer)."""
    from_node: str
    to_node: str
    label: str              # the load / destination human tag
    rating: str = ""        # e.g. '130 A' or '1953 A'
    cable: str = ""         # CSA / size label e.g. '25 mm²'
    voltdrop: str = ""      # e.g. '0.04 %'
    count: int = 1          # >1 ⇒ a collapsed fan-out (drawn once, annotated × N)
    role: str = ""          # trunk / branch / feeder / local_busway
    devices: list[Device] = field(default_factory=list)
    target_sym: str = SYM_LOAD   # the destination symbol (load or transformer)
    sub_bus: Optional["Bus"] = None   # set when this branch feeds a sub-distribution


@dataclass
class Transformer:
    tag: str
    kva: str = ""
    ratio: str = ""         # e.g. '11000/400 V'
    currents: str = ""      # e.g. '13→1953 A'
    detail: str = ""        # mfr + MPN


@dataclass
class Bus:
    """A busbar with its incoming feed and its outgoing branches."""
    tag: str
    voltage: str = ""       # e.g. '800 V DC' / '400 V AC'
    rating: str = ""        # bus continuous rating e.g. '1250 A'
    branches: list[Branch] = field(default_factory=list)
    is_sub: bool = False


@dataclass
class Source:
    sym: str = SYM_UTILITY
    tag: str = "UTILITY SUPPLY"
    detail: str = ""        # e.g. '11 kV / 33 kV grid · G99'
    voltage: str = ""


@dataclass
class StandbySource:
    """A second supply (standby generator) that backs up the utility incomer through an
    Automatic Transfer Switch (ATS).  Drawn as a generating source (circle 'G') feeding
    the ATS in parallel with the utility, so on a mains failure the genset carries the
    board.  Discovered from a `_utility` BoM word whose name/form reads as a genset; its
    rating is the word's rating_primary (kVA).  None ⇒ no standby supply is drawn."""
    tag: str = "STANDBY GENERATOR"
    kva: str = ""           # e.g. '630 kVA'
    detail: str = ""        # one-line description (covered load etc.)
    ats_tag: str = "ATS"    # the automatic-transfer-switch label


@dataclass
class Converter:
    """A power-conversion stage (PCS / inverter / rectifier) drawn as a labelled box
    with the standard DC/AC converter glyph, in-line on the incomer between the
    transformer and the bus."""
    tag: str = "PCS"
    label: str = "Power conversion system"
    rating: str = ""
    cable: str = ""
    detail: str = ""        # mfr + MPN if known
    kind: str = "dc_ac"    # 'dc_ac' (inverter) | 'ac_dc' (rectifier)


@dataclass
class Tree:
    archetype: str
    source: Source
    incomer_devices: list[Device]          # devices between source and main bus
    incomer_transformer: Optional[Transformer]   # step-up / step-down at the incomer
    main_bus: Bus
    incomer_converter: Optional[Converter] = None  # PCS / inverter in the incomer stack
    standby_source: Optional[StandbySource] = None  # genset on an ATS (2nd source)
    notes: list[str] = field(default_factory=list)
    schedule_totals: dict = field(default_factory=dict)
    rev: str = "P1"          # preliminary revision (deterministic, not a live clock)
    date: str = ""           # issue date derived from the run's own artifact mtime


# ═══════════════════════════════════════════════════════════════════════════
# INPUT LOADING
# ═══════════════════════════════════════════════════════════════════════════

def load_inputs(out_dir: str, state_path: Optional[str]):
    """Read connection-schedule.json from out_dir and the archetype state.json.

    state.json is taken from state_path if given, else auto-discovered: the schedule's
    own dir, then any state.json a sibling out/<arch> the schedule was generated from."""
    sched_path = Path(out_dir) / "connection-schedule.json"
    if not sched_path.is_file():
        raise FileNotFoundError(f"no connection-schedule.json in {out_dir} "
                                f"(run build_universal_scene.py first)")
    with open(sched_path) as fh:
        schedule = json.load(fh)

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
    # Stash the qty-EXPANDED parts-manifest (the GA's source) so the feeder synthesis can
    # build a WAY PER electrically-driven equipment item (pumps / O2 / heat-pumps / control
    # panel) instead of ~7 module-name stubs — the "not enough electrical wiring" fix.
    # Carried on a private state key so the existing (schedule, state) signatures are
    # unchanged. Absent ⇒ the per-module split still applies.
    pm = Path(out_dir) / "parts-manifest.json"
    if pm.is_file():
        try:
            state["_parts_manifest"] = json.loads(pm.read_text())
        except Exception:
            pass
    # Stash the convergence-report so the board/incomer current reads ONE authoritative
    # value (the physics<->CAD fixed-point feeder_current_a / feeder_size) rather than the
    # SLD, the P&ID note and the convergence report each quoting a different headline
    # current. Carried on a private key so the (schedule, state) signatures are unchanged.
    cr = Path(out_dir) / "convergence-report.json"
    if cr.is_file():
        try:
            state["_convergence"] = json.loads(cr.read_text())
        except Exception:
            pass
    return schedule, state


# ═══════════════════════════════════════════════════════════════════════════
# PROTECTIVE-DEVICE EXTRACTION from state.json BoM
# ═══════════════════════════════════════════════════════════════════════════

# (regex on character_id / name, device kind, short tag) — order matters: the FIRST
# match wins so 'pre-charge contactor' classes as contactor not breaker.
_DEVICE_PATTERNS = [
    (re.compile(r"rcd|residual_current|earth_leakage", re.I),       "rcd",       "RCD"),
    (re.compile(r"\bfuse\b|hrc_fuse|nh_fuse", re.I),                 "fuse",      "F"),
    (re.compile(r"isolator|disconnect(or)?|switch_disconnect", re.I),"isolator",  "Q"),
    (re.compile(r"contactor", re.I),                                 "contactor", "K"),
    (re.compile(r"breaker|mccb|\bmcb\b|\bacb\b|circuit_breaker|"
                r"main_breaker", re.I),                              "breaker",   "CB"),
]

# Words that look like a protective device by name but are NOT switchgear we draw
# (labels, padlocks, torque cards, enclosures, mounting rails, terminal blocks…).
_DEVICE_NOISE = re.compile(
    r"label|padlock|torque|card|enclosure|mount|rail|terminal|holder|sticker|"
    r"placard|sign|cover|gasket|bracket", re.I)


def _word_mfr_pn(word: dict):
    mfr = pn = ""
    for mc in (word.get("modifier_characters") or []):
        k = mc.get("kind")
        if k == "manufacturer":
            mfr = mc.get("value", "") or mfr
        elif k == "part_number":
            pn = mc.get("value", "") or pn
    return mfr, pn


def _iter_words(state: dict):
    md = state.get("moduleDecomposition") or {}
    for m in (md.get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                cid = ""
                cc = w.get("content_character")
                if isinstance(cc, dict):
                    cid = cc.get("character_id", "") or ""
                yield w, (w.get("name_human") or ""), cid


def extract_devices(state: dict):
    """Pull every real protective / switching device from the state BoM, classed by
    kind, with a short tag + a mfr/MPN detail string.  Returns a list of (kind, tag,
    cid, name, detail) — later mapped onto tree nodes by name heuristics."""
    out = []
    seen = set()
    for w, name, cid in _iter_words(state):
        blob = f"{name} {cid}"
        if _DEVICE_NOISE.search(blob):
            continue
        for rx, kind, tag in _DEVICE_PATTERNS:
            if rx.search(blob):
                mfr, pn = _word_mfr_pn(w)
                detail = " ".join(x for x in (mfr, pn) if x).strip()
                key = (kind, cid or name)
                if key in seen:
                    break
                seen.add(key)
                out.append({"kind": kind, "tag": tag, "cid": cid,
                            "name": name.strip(), "detail": detail})
                break
    return out


def _pick_device(devices, *needles, kind=None):
    """Find the first device whose cid/name contains ANY needle (and matches kind if
    given).  Needles are matched case-insensitively as substrings."""
    nl = [n.lower() for n in needles]
    for d in devices:
        if kind and d["kind"] != kind:
            continue
        hay = f"{d['cid']} {d['name']}".lower()
        if any(n in hay for n in nl):
            return d
    return None


def _as_device(d, fallback_kind, fallback_tag, fallback_detail=""):
    if d:
        return Device(kind=d["kind"], tag=d["tag"],
                      detail=(d["detail"] or d["name"]).strip())
    return Device(kind=fallback_kind, tag=fallback_tag, detail=fallback_detail)


# ═══════════════════════════════════════════════════════════════════════════
# STATE quantity helpers
# ═══════════════════════════════════════════════════════════════════════════

def _q(state: dict, key: str):
    """Read a numeric quantity value from engineeringContract.quantities (or
    orchestratorContract). Returns float or None."""
    for ck in ("engineeringContract", "orchestratorContract"):
        q = ((state.get(ck) or {}).get("quantities") or {}).get(key)
        if isinstance(q, dict) and q.get("value") is not None:
            try:
                return float(q["value"])
            except (TypeError, ValueError):
                return None
        if isinstance(q, (int, float)):
            return float(q)
    return None


def _fmt_a(v):
    if v is None:
        return ""
    return f"{v:,.0f} A" if v >= 10 else f"{v:.1f} A"


def _fmt_kw(v):
    if v is None:
        return ""
    if v >= 1000:
        return f"{v/1000:.2f} MW".replace(".00", "")
    return f"{v:,.0f} kW"


def _archetype_name(state: dict, schedule: dict):
    for ck in ("engineeringContract", "orchestratorContract", "parsedBrief"):
        c = state.get(ck) or {}
        pc = c.get("product_class") or c.get("productClass")
        if pc:
            return str(pc)
    pid = state.get("projectId") or ""
    return str(pid) or "universal_archetype"


def _run_issue_date(out_dir: str) -> str:
    """Deterministic title-block issue date (YYYY-MM-DD) from the run's OWN artifacts —
    now delegated to the shared `drawing_titleblock.issue_date` so all eight drawings use
    ONE implementation (see drawing_titleblock.py for the full contract)."""
    return _tb.issue_date(out_dir)


# Standard moulded-case / air circuit-breaker frame sizes [A] (BS EN 60947-2 ladder).
# Used to size the INCOMER breaker to the next frame above the actual feeder current
# instead of leaving it 'CB TBD'.
_CB_FRAME_A = [16, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
               630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300]


def _next_frame_a(current_a: float):
    """The next standard breaker frame at or above `current_a` (so the incomer breaker is
    rated to carry the feeder), or None when no current is known."""
    if not current_a or current_a <= 0:
        return None
    for f in _CB_FRAME_A:
        if f >= current_a:
            return f
    return _CB_FRAME_A[-1]


def _converged_feeder(state: dict):
    """The ONE authoritative main-incomer feeder current + cable size from the
    physics<->CAD convergence report (the fixed-point as-routed supply feeder). Reads the
    LAST trajectory point's feeder_current_a / feeder_size (the converged value). Returns
    (current_a: float|None, size_label: str|None). None when no report is present — the
    caller then falls back to the contract main-transformer secondary current."""
    cr = state.get("_convergence") or {}
    traj = cr.get("trajectory") or []
    cur = size = None
    if traj:
        last = traj[-1]
        try:
            cur = float(last.get("feeder_current_a")) if last.get(
                "feeder_current_a") is not None else None
        except (TypeError, ValueError):
            cur = None
        sz = last.get("feeder_size")
        if sz:
            size = str(sz).strip()
    # report may also carry top-level fields in a future schema; honour them as a fallback.
    if cur is None and cr.get("feeder_current_a") is not None:
        try:
            cur = float(cr["feeder_current_a"])
        except (TypeError, ValueError):
            cur = None
    if size is None and cr.get("feeder_size"):
        size = str(cr["feeder_size"]).strip()
    return cur, size


# ═══════════════════════════════════════════════════════════════════════════
# TREE RECONSTRUCTION
# ═══════════════════════════════════════════════════════════════════════════

_RACK_TAP_RE = re.compile(r"^(.*?)\s*\[(\d+)\]$")   # 'rack[0]' → ('rack', 0)


def _electrical_rows(schedule: dict):
    return [r for r in (schedule.get("rows") or [])
            if "electrical" in (r.get("mechanism") or "")]


def _spec_for_row(schedule: dict, row: dict):
    """Find the full ConnectionSpec matching a schedule row (for system_voltage_v
    etc.). Matched on from/to + size, best-effort."""
    for s in (schedule.get("specs") or []):
        if (s.get("from_part") == row.get("from")
                and s.get("to_part") == row.get("to")
                and s.get("size_label") == row.get("size")):
            return s
    return None


def _humanise(tag: str) -> str:
    """rack_block → 'Rack block'; pcs → 'PCS'; ft_synthesis_reactor → 'FT synthesis
    reactor'.  Upper-cases well-known acronyms."""
    if not tag:
        return tag
    t = tag.strip()
    ACR = {"pcs", "ft", "mv", "lv", "hv", "dc", "ac", "bms", "saf", "co2", "h2",
           "ups", "pdu", "crac", "mcc", "rmu", "hvac",
           "ras", "uv", "mbbr", "lox", "orp", "sbr", "daf", "ro", "uf", "gac",
           "cip", "hmi", "plc", "scada", "ats", "led", "psa"}
    parts = re.split(r"[_\s]+", t)
    words = []
    for p in parts:
        m = _RACK_TAP_RE.match(p)
        if p.lower() in ACR:
            words.append(p.upper())
        else:
            words.append(p)
    s = " ".join(words)
    return s[:1].upper() + s[1:] if s else s


def _clean_rating(val) -> str:
    """Tidy a schedule rating cell for the drawing: '—' / '' → '' ; keep real ratings."""
    s = str(val or "").strip()
    if s in ("", "—", "-", "None"):
        return ""
    return s


def _clean_cable(val) -> str:
    """Tidy a schedule size cell: the rating-less fallback strings become a short
    'aux feeder' note rather than '(no rating — fallback)' bleeding into the SLD."""
    s = str(val or "").strip()
    if not s or s in ("—", "-", "None"):
        return ""
    low = s.lower()
    if "no rating" in low or "fallback" in low or "sense" in low or "unsized" in low:
        return "control / aux feeder"
    return s


def _bus_voltage_label(state, schedule, default=""):
    """Best DC/system-voltage label for the MAIN bus from state, else a spec."""
    dc = _q(state, "dc_bus_voltage_v")
    if dc:
        return f"{dc:,.0f} V DC"
    # process plant LV board: use ac output / a feeder's system voltage
    ac = _q(state, "ac_output_voltage_v")
    if ac:
        return f"{ac:,.0f} V AC"
    for s in (schedule.get("specs") or []):
        v = s.get("system_voltage_v")
        # ONLY a real LV value [100, 1000] V. `_infer_system_voltage` leaks a 1500 V
        # DC-bus DEFAULT onto AC process edges (documented in
        # _apply_distribution_voltage_model, which guards lv_v the same way) — taking
        # it here mislabelled a 400 V RAS LV board as "1,500 V". Skipping it lets the
        # distribution-voltage model set the correct board voltage from the load.
        if v and 100.0 <= float(v) <= 1000.0:
            return f"{v:,.0f} V"
    return default


def _norm_load_name(s: str) -> str:
    """Normalise a feeder/load label for de-duplication: lower-case, strip a trailing
    '× N' fan-out annotation, and collapse all non-alphanumerics to single spaces so
    'I/O Module' == 'i o module' and 'Heat Pump ×2' == 'heat pump'."""
    s = (s or "").lower()
    s = re.sub(r"\s*[×x]\s*\d+\b", "", s)          # strip '× N'
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _rating_amps(br: "Branch") -> float:
    """Leading numeric of a branch rating string ('166 A' → 166.0); 0 when absent."""
    m = re.match(r"\s*([\d.,]+)", str(br.rating or ""))
    if not m:
        return 0.0
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return 0.0


def _dedup_branches(branches: list["Branch"]) -> list["Branch"]:
    """Collapse feeders that are the SAME distinct load appearing twice on the bus.

    UNIVERSAL: a load can reach the board both as a synthesised principal feeder
    (kW-derived, from synthesise_equipment_feeders) AND as a per-word skeleton edge
    from the connection schedule — e.g. a RAS Circulation Pump / Heat Pump / Degasser /
    Oxygenation / Protein-skimming / UV way each emitted twice. Collapse by normalised
    name, keeping ONE: prefer the kW-DERIVED feeder (it carries the equipment's real
    rating); on a tie prefer the higher current rating; then preserve first-seen order.
    Sub-distribution / transformer branches are never collapsed (each is structurally
    distinct). Deterministic — order-stable, no randomness."""
    best: dict[str, int] = {}     # normalised name → index into `out`
    out: list["Branch"] = []
    for br in branches:
        # never fold a sub-distribution / transformer branch into a plain load.
        if br.sub_bus is not None or br.target_sym == SYM_TRANSFORMER:
            out.append(br)
            continue
        key = _norm_load_name(br.label or br.to_node or "")
        if not key:
            out.append(br)
            continue
        if key not in best:
            best[key] = len(out)
            out.append(br)
            continue
        # already have one with this name — decide which to keep.
        keep_idx = best[key]
        cur = out[keep_idx]
        cur_kw = bool(getattr(cur, "_kw_derived", False))
        new_kw = bool(getattr(br, "_kw_derived", False))
        replace = False
        if new_kw and not cur_kw:
            replace = True
        elif new_kw == cur_kw and _rating_amps(br) > _rating_amps(cur):
            replace = True
        if replace:
            out[keep_idx] = br
    return out


# Words a `_utility` BoM word's name/form must mention to be read as a standby genset.
_GENSET_RE = re.compile(r"generator|genset|\bgenerating\s+set\b|diesel\s+gen", re.I)
# An ATS is implied by a genset; the form text usually says so explicitly.
_ATS_RE = re.compile(r"automatic\s+transfer\s+switch|\bats\b|changeover|"
                     r"transfer\s+switch", re.I)


def _word_modifier(word: dict, kind: str):
    for mc in (word.get("modifier_characters") or []):
        if mc.get("kind") == kind:
            return mc.get("value")
    return None


def _find_standby_generator(state: dict) -> Optional[StandbySource]:
    """UNIVERSAL second-source discovery: scan the BoM for a `_utility` word that reads
    as a standby generator (name/form matches _GENSET_RE) and lift it into a
    StandbySource carrying its kVA (rating_primary) so the SLD can draw it as a second
    supply on an ATS. Returns None when the plant has no genset word (a plant without a
    standby supply gets none — never an `if ras` branch)."""
    for w, name, cid in _iter_words(state):
        if not (w.get("_utility") is True):
            continue
        form = str(_word_modifier(w, "form") or "")
        blob = f"{name} {cid} {form}"
        if not _GENSET_RE.search(blob):
            continue
        # kVA from rating_primary (the genset's apparent-power rating).
        kva = ""
        rp = _word_modifier(w, "rating_primary")
        if rp is not None:
            m = re.match(r"\s*([\d.,]+)", str(rp))
            if m:
                try:
                    kva = f"{float(m.group(1).replace(',', '')):,.0f} kVA"
                except ValueError:
                    kva = ""
        # a short detail: prefer the covered-load clause from the form text.
        detail = ""
        cov = re.search(r"covers?\s+the\s+([^;.]+?(?:load)[^;.]*)", form, re.I)
        if cov:
            detail = cov.group(1).strip()
        elif form:
            detail = form.split(";")[0].strip()[:64]
        ats = "ATS" if _ATS_RE.search(form) else "ATS"   # always an ATS for a genset
        return StandbySource(tag=(name or "STANDBY GENERATOR").upper(),
                             kva=kva, detail=detail, ats_tag=ats)
    return None


# A small control / SCADA / instrumentation / networking load — UPS-backed, grouped off
# the main board onto a control sub-board rather than drawn as its own main-bus way.
_CONTROL_LOAD_RE = re.compile(
    r"controller|\bplc\b|\bscada\b|\bhmi\b|\bi/?o\b|\bio\s*module\b|gateway|"
    r"network\s*switch|\bswitch\b|router|\bups\b|control\s+power|power\s+supply|"
    r"instrument|telemetry|comms?\b|communication|server|workstation|monitor", re.I)
# Things that look like a control word but are POWER kit / loads we must NOT bury.
_CONTROL_LOAD_EXCLUDE = re.compile(
    r"pump|compressor|blower|fan|heat|pump|motor|skim|oxygen|\buv\b|ozone|"
    r"transformer|busbar|breaker|fuse|surge|valve|filter|degas|exchanger|drum", re.I)


# A control / SCADA / instrument / network load is SMALL (a parasitic compute/comms draw),
# so it groups onto the control sub-board only when its current is genuinely small. This is
# the magnitude gate that REPLACES the old blanket `_kw_derived` reject: the synthesised
# control feeders (Main Controller / SCADA / Gateway / I-O / Network / Controller PSU) ALL
# carry `_kw_derived=True` because they were sized from a duty-type kW — rejecting on that
# flag meant the control board NEVER formed. A control-named way drawing tens of amps is a
# mis-named power load and is excluded by the magnitude cap instead.
_CONTROL_LOAD_MAX_A = 25.0


def _is_control_load(br: "Branch") -> bool:
    if br.sub_bus is not None or br.target_sym == SYM_TRANSFORMER:
        return False
    name = f"{br.label} {br.to_node}"
    if _CONTROL_LOAD_EXCLUDE.search(name):
        return False
    if not _CONTROL_LOAD_RE.search(name):
        return False
    # magnitude gate: a genuine control/instrument way is small. A control-named feeder
    # drawing > ~25 A is really a power load (don't bury it on the control board). An
    # unsized way (0 A) that matches the name pattern is treated as a control stub.
    amps = _rating_amps(br)
    return amps <= _CONTROL_LOAD_MAX_A


# BOARD INFRASTRUCTURE — a main breaker / busbar / distribution board / fuse / isolator /
# surge protector / SPD / protective relay / UPS / ATS / generator IS the switchboard
# itself, NOT a load that hangs off it as a feeder tap. The per-word skeleton edges in the
# connection schedule (e.g. 'Standby Diesel Generator → Main Breaker') leak these board
# elements in as 54 A load feeders with a phantom cable. A main breaker cannot be a load on
# the board it protects. Such a branch must be DROPPED from the main-bus feeder list — the
# main breaker is already drawn as the incomer device, the SPD as a shunt on the bus, the
# busbar AS the bus. Universal (matched on the destination NAME, never a product class).
_BOARD_ELEMENT_RE = re.compile(
    r"main\s*breaker|incom(er|ing)\s*breaker|distribution\s*(board|busbar|panel)|"
    r"\bbusbar\b|bus\s*bar|fuse\s*holder|\bfuse\b|isolat(or|ion)|disconnect(or)?|"
    r"surge\s*protect(or|ion)?|\bspd\b|protect(ive|ion)\s*relay|\brelay\b|\bups\b|"
    r"uninterruptible|automatic\s*transfer\s*switch|\bats\b|change\s*over|"
    r"\bgenset\b|generator|generating\s*set|switchgear|switchboard|"
    r"earth(ing)?\s*(bar|terminal)|\brcd\b|\brcbo\b|\bmccb\b|\bmcb\b|\bacb\b", re.I)
# Words that READ like a board element but are genuine consuming loads we must NOT drop
# (a 'circulation pump' has no board token; these are belt-and-braces so a real load whose
# name happens to brush a token — e.g. a 'relay-controlled valve' — is preserved).
_BOARD_ELEMENT_KEEP = re.compile(
    r"pump|compressor|blower|\bfan\b|motor|valve|skim|oxygen|\buv\b|ozone|filter|"
    r"degas|exchanger|drum|reactor|biofilter|tank|lamp|heater|chiller|aerat|"
    r"sterilis|steriliz|disinfect|mixer|agitator|conveyor|dryer|column", re.I)


def _is_board_element_feeder(br: "Branch") -> bool:
    """True when this main-bus branch is actually a piece of the SWITCHBOARD (main
    breaker / busbar / fuse holder / isolator / SPD / protective relay / UPS / ATS /
    genset) wrongly emitted as a consuming load feeder, so it should be removed from the
    feeder list. A kW-derived synthesised feeder is a real motor/system load and is never
    a board element; a sub-distribution / transformer branch is structural, not a load."""
    if br.sub_bus is not None or br.target_sym == SYM_TRANSFORMER:
        return False
    if getattr(br, "_kw_derived", False):
        return False     # a kW-derived feeder is the equipment's real load, not board kit
    name = f"{br.label} {br.to_node}"
    if _BOARD_ELEMENT_KEEP.search(name):
        return False
    return bool(_BOARD_ELEMENT_RE.search(name))


def _branch_vd_pct(br: "Branch"):
    """The branch's voltage-drop magnitude as a float percent, or None when absent.
    Accepts '4.924%' / '4.924% Vd' / '4.924'."""
    m = re.search(r"([\d.]+)\s*%?", str(br.voltdrop or ""))
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _flag_voltdrop(tree: Tree, schedule: dict):
    """UNIVERSAL: flag any feeder whose voltage drop is at/above the design limit (or the
    council's 4% advisory). BS 7671 power-circuit limit is 5%; a branch at/over it (or
    within the last 1% advisory band) is marked so the renderer shows it in a WARNING
    colour rather than letting a 4.9% drop sit silently next to a compliant 1%. Reads the
    schedule's voltdrop_limit_pct (default 5%) and an advisory threshold of 4%. Sets a
    private _vd_flag on each branch (None / 'advisory' / 'over'). Deterministic."""
    try:
        limit = float(schedule.get("voltdrop_limit_pct") or 5.0)
    except (TypeError, ValueError):
        limit = 5.0
    advisory = min(4.0, limit - 1.0) if limit > 1.0 else limit
    for br in tree.main_bus.branches:
        for b in [br] + (list(br.sub_bus.branches) if br.sub_bus else []):
            vd = _branch_vd_pct(b)
            if vd is None:
                continue
            if vd >= limit - 1e-9:
                b._vd_flag = "over"      # type: ignore[attr-defined]
            elif vd >= advisory - 1e-9:
                b._vd_flag = "advisory"  # type: ignore[attr-defined]


# PASSIVE SUB-COMPONENTS — a part that is INSIDE / PART OF a parent equipment item: an
# MBBR's plastic media/carrier (inert — draws NO power), a filter's screen/backwash, a
# vessel's internals/packing/fill, a pump's impeller. Its power (if any) is the PARENT's
# motor feeder, so it must NOT appear as a standalone feeder on the board (a reviewer
# rightly asks why inert biofilm media has a 400 V breaker). Mirrors connection_ledger's
# _SUBCOMPONENT_RE so the single-line, the ledger and the Blender agree. Universal.
_PASSIVE_SUBCOMPONENT_RE = re.compile(
    r"\bmedia\b|carrier|biofilm[_ ]?carrier|\bscreen\b|backwash|\belement\b|cartridge|"
    r"membrane|\bpacking\b|\bfill\b|internals|impeller|standpipe|\bsparger\b", re.I)


def _strip_board_element_feeders(tree: Tree):
    """UNIVERSAL: drop any main-bus branch that is a board element drawn as a load tap
    (main breaker, busbar, fuse holder, isolator, surge protector, protective relay, UPS,
    ATS, generator) OR a PASSIVE SUB-COMPONENT (MBBR media, filter screen/backwash, vessel
    internals — part of a parent, not a standalone powered load). These reach the board
    only as per-word connection-schedule skeleton edges; the main breaker is already the
    incomer device, the SPD a shunt on the bus, and a sub-component's power is its parent's
    feeder — so none must also appear as a consuming feeder. Records which were removed so
    the bus can note the SPD/main-breaker placement. Deterministic; name-keyed."""
    main = tree.main_bus
    removed = [br for br in main.branches
               if _is_board_element_feeder(br)
               or _PASSIVE_SUBCOMPONENT_RE.search(f"{br.label or ''} {br.to_node or ''}")]
    if not removed:
        return
    main.branches = [br for br in main.branches if br not in removed]
    # carry the dropped board elements so the renderer can show the SPD as a bus shunt.
    names = []
    for br in removed:
        nm = _norm_load_name(br.label or br.to_node or "")
        if nm:
            names.append(nm)
    tree._board_shunts = names   # type: ignore[attr-defined]


def _group_control_loads(tree: Tree, devices: list):
    """UNIVERSAL legibility pass: move the small control / SCADA / instrument / network
    loads off the flat main bus onto a UPS-backed CONTROL & INSTRUMENT sub-board (an
    MCC-style sub-distribution), reusing the existing sub-bus rendering.

    Fires only when grouping genuinely helps (≥ MIN_GROUP such loads) so a plant with
    one or two control ways keeps them on the main bus (no clutter / no spurious board).
    Deterministic; archetype-agnostic (keyed on the load NAME, never a product class)."""
    MIN_GROUP = 3
    main = tree.main_bus
    ctrl = [br for br in main.branches if _is_control_load(br)]
    if len(ctrl) < MIN_GROUP:
        return
    keep = [br for br in main.branches if br not in ctrl]
    # build the control sub-board, fed via a UPS, carrying the grouped control ways.
    sub = Bus(tag="CONTROL & INSTRUMENT BOARD", is_sub=True)
    for br in ctrl:
        br.from_node = sub.tag
        br.devices = []                 # drop the in-line CB — the UPS + sub-board guard it
        sub.branches.append(br)
    feeder = Branch(
        from_node=main.tag,
        to_node=sub.tag,
        label="Control & instrument distribution",
        rating="",
        cable="",
        role="branch",
        target_sym=SYM_LOAD,   # not a transformer — a UPS feeds it (drawn in the sub fn)
    )
    feeder.sub_bus = sub
    feeder.is_ups = True   # type: ignore[attr-defined]  — draw a UPS in the drop, not a TX
    cb = _pick_device(devices, kind="breaker")
    if cb:
        feeder.devices.append(_as_device(cb, "breaker", "CB"))
    main.branches = keep + [feeder]


# LIFE-SAFETY / CRITICAL loads — the ways that MUST stay powered for the living process to
# survive a mains failure (the genset + UPS carry these on the critical board). For a
# recirculating-life-support plant: the recirculation / circulation pumps that keep water
# moving, the oxygenation / dissolved-oxygen system + its control valve, and the SCADA /
# controls that run them. Universal — keyed on the LOAD NAME's life-support function, never a
# product class; a plant whose ledger carries no critical-redundancy marker gets no such board.
_CRITICAL_LOAD_RE = re.compile(
    r"recirc|circulat(ion|ing)?\s*pump|\boxygenat|dissolved.?o|\bdo\b\s*control|"
    r"\bo2\b\s*(control|dosing|supply)|life.?support|emergency\s*o|aeration|"
    r"\bscada\b|main\s*controller|plant\s*control", re.I)
# A critical-named way that is really NOT a life-support load (a passive / bulk item that
# merely brushes a token) is kept off the critical board.
_CRITICAL_LOAD_EXCLUDE = re.compile(
    r"\btank\b|vessel|reservoir|media\b|frame|structural|pipework|busbar|breaker|"
    r"fuse|surge|generator|genset", re.I)


def _has_critical_redundancy(state: dict) -> bool:
    """True when the ledger marks the design as carrying CRITICAL / life-safety redundancy —
    the cue to draw a dedicated critical sub-board. Reads the contract's
    critical_equipment_redundancy / N+1 markers. Universal; absent ⇒ no critical board."""
    for k in ("critical_equipment_redundancy", "critical_load_redundancy",
              "life_support_redundancy", "n_plus_1_critical"):
        v = _q(state, k)
        if v is not None:
            try:
                if float(v) >= 1:
                    return True
            except (TypeError, ValueError):
                if str(v).strip().lower() in ("1", "true", "yes", "n+1", "n+2"):
                    return True
    return False


def _is_critical_load(br: "Branch") -> bool:
    if br.sub_bus is not None or br.target_sym == SYM_TRANSFORMER:
        return False
    name = f"{br.label} {br.to_node}"
    if _CRITICAL_LOAD_EXCLUDE.search(name):
        return False
    return bool(_CRITICAL_LOAD_RE.search(name))


def _group_critical_life_support(tree: Tree, state: dict, devices: list):
    """UNIVERSAL: group the LIFE-SAFETY loads (recirculation pumps, oxygenation / dissolved-
    oxygen + its control valve, SCADA / controls) onto a dedicated CRITICAL LIFE-SUPPORT
    sub-board fed via a UPS — the board the standby generator + ATS hold on a mains failure.
    Fires only when the plant has BOTH a standby source (genset on the ATS, already on the
    tree) AND the ledger marks critical redundancy, so a plant with no standby supply / no
    critical marker is untouched (never an `if ras` branch).

    Runs BEFORE _group_control_loads and claims its loads first: it pulls the critical POWER
    loads (recirc / oxygenation / DO) AND the small life-safety control loads (SCADA / main
    controller / instruments) onto ONE flat sub-board (single nesting level so it renders
    cleanly via _draw_sub_distribution). Deterministic; keyed on the load NAME + the ledger
    redundancy marker."""
    if tree.standby_source is None or not _has_critical_redundancy(state):
        return
    main = tree.main_bus
    # the critical power loads + the small control/instrument loads that run them.
    claimed = [br for br in main.branches
               if _is_critical_load(br) or _is_control_load(br)]
    if len(claimed) < 2:
        return     # nothing meaningful to group
    keep = [br for br in main.branches if br not in claimed]
    sub = Bus(tag="CRITICAL LIFE-SUPPORT BOARD", is_sub=True)
    for br in claimed:
        br.from_node = sub.tag
        br.devices = []        # the UPS + sub-board breakers guard these
        sub.branches.append(br)
    feeder = Branch(
        from_node=main.tag,
        to_node=sub.tag,
        label="Critical life-support distribution (UPS + standby-backed)",
        rating="", cable="", role="branch", target_sym=SYM_LOAD)
    feeder.sub_bus = sub
    feeder.is_ups = True            # type: ignore[attr-defined]  — UPS in the drop
    feeder.is_critical = True       # type: ignore[attr-defined]  — drives the critical label
    cb = _pick_device(devices, kind="breaker")
    if cb:
        feeder.devices.append(_as_device(cb, "breaker", "CB"))
    main.branches = keep + [feeder]
    # Derive the note from the ACTUAL critical loads claimed onto this board, never a fixed RAS
    # string. A non-RAS plant (e.g. a CO₂/SAF unit with a standby genset + N+1) names ITS critical
    # loads here, not "recirculation, oxygenation / dissolved-oxygen control" fish-farm kit. The
    # double gate above (standby source + critical redundancy) still controls whether this fires.
    load_names = []
    seen = set()
    for br in claimed:
        nm = (br.label or br.to_node or "").strip()
        key = nm.lower()
        if nm and key not in seen:
            seen.add(key)
            load_names.append(nm)
    load_list = ", ".join(load_names[:6]) if load_names else "the plant's critical loads"
    if len(load_names) > 6:
        load_list += ", …"
    tree.notes = list(tree.notes or []) + [
        f"Critical loads ({load_list}) grouped on a UPS-backed sub-board that the standby "
        "generator + ATS hold on a mains failure — the life-safety supply this plant's "
        "critical equipment needs."]


# ── powered-load real-current sizing ─────────────────────────────────────────
# A powered process LOAD on the board must never read 0.0 A (a placeholder) nor sit at a
# wholesale fallback default shared across many feeders (the schedule emits ~27 A for
# every unsized way). Each consuming feeder is sized from its OWN derived electrical kW,
# resolved deterministically and universally (NO per-class table) by this cascade:
#   (1) the equipment's published kW in state.requirementsBom — its requirement string
#       carries '· NN kW ·' for many items (pumps, heat-pump, HEX);
#   (2) a SPECIFIC electrical *_kw quantity in the contract matched on the load's name
#       (e.g. a UV unit → uv_lamp_power_kw);
#   (3) a TYPE-BASED estimate — a powered process unit (UV / oxygenation / degasser /
#       skimmer / blower / filter drive) always draws power, taken as a duty-weighted
#       fraction of the plant's principal motor load (the largest pump/driven-motor kW in
#       the contract, else a share of the connected electrical load). The basis is
#       surfaced on the feeder so the figure is honest, not a silent guess.
# A way that is genuinely NON-electrical (a passive vessel / valve body with no drive)
# is EXCLUDED from the feeder list rather than drawn at 0.0 A.

# Duty-type → fraction of the plant's principal motor load, for a powered unit with no
# published kW. Universal: keyed on generic equipment tokens, never a product class. The
# first matching token wins (ordered most-specific first). Values are engineering
# order-of-magnitude shares of the main recirculation/transfer pump (a degasser blower
# draws more than a UV bank, which draws more than a metering pump).
_DUTY_LOAD_FRACTION = [
    (re.compile(r"degas|de-?gas|co2.?strip|stripp?er|scrubber", re.I),      0.10),
    (re.compile(r"oxygen|\bo2\b|aeration|aerat|oxygenat", re.I),            0.10),
    (re.compile(r"ventilat|\bahu\b|\bhrv\b|air.?handl", re.I),              0.14),
    (re.compile(r"blower|\bfan\b|compressor|extract", re.I),               0.12),
    (re.compile(r"ozone|\buv\b|disinfect|sterilis|steriliz|reactor", re.I), 0.08),
    (re.compile(r"protein.?skim|skimmer|foam.?fraction|flotation", re.I),   0.06),
    (re.compile(r"drum.?filter|screen|strainer|backwash|\bfilter\b", re.I), 0.05),
    (re.compile(r"chiller|refriger|chilling|\bice\b", re.I),                0.20),
    (re.compile(r"heat.?exchang|\bhex\b", re.I),                            0.18),
    # packaged ancillary life-support systems (sludge/grading/mortality/effluent/intake/
    # biosecurity/feed) — modest mechanical handling loads, each distinct from the next.
    (re.compile(r"sludge|solids|thicken|dewater|centrifuge", re.I),         0.07),
    (re.compile(r"grading|harvest|live.?fish|fish.?handl|transfer", re.I),  0.05),
    (re.compile(r"mortalit|morts", re.I),                                   0.04),
    (re.compile(r"effluent|discharge|outfall", re.I),                       0.06),
    (re.compile(r"intake|make.?up.?treat|inlet.?treat", re.I),              0.06),
    (re.compile(r"biosecurit|quarantine|disinfection.?bath", re.I),         0.03),
    (re.compile(r"feed\b|feeder|feeding|silo", re.I),                       0.04),
    (re.compile(r"pump|circulat|recirc", re.I),                             0.30),
    (re.compile(r"dosing|metering|chemical|alkalin", re.I),                 0.03),
    (re.compile(r"mixer|agitator|stirrer|conveyor|auger|screw", re.I),      0.08),
    (re.compile(r"heater|element|immersion", re.I),                         0.15),
    # control / instrument distribution — a small parasitic load, NOT a process duty. Split
    # by sub-type with DISTINCT small fractions so a controls block isn't one flat value (a
    # UPS carries the standby load, SCADA/PLC the compute, a network switch barely anything).
    (re.compile(r"\bups\b|uninterruptible", re.I),                         0.030),
    (re.compile(r"scada|\bplc\b|main.?controller|control.?system", re.I),  0.020),
    (re.compile(r"control.?panel|\bmcc\b|distribution.?panel|local.?control", re.I), 0.025),
    (re.compile(r"controller.?power|power.?supply|\bpsu\b", re.I),         0.015),
    (re.compile(r"gateway|\bi/o\b|io.?module|signal.?condition", re.I),    0.012),
    (re.compile(r"network|switch|comms?\b|ethernet", re.I),                0.008),
    (re.compile(r"control|instrument|monitor", re.I),                      0.018),
    (re.compile(r"valve|actuat|damper|gate|solenoid", re.I),                0.01),
]
# A way whose name reads as a passive/non-electrical item (a tank/vessel/pipe with no
# drive or powered package) — never invent a feeder current for it; drop it from the bus.
_NON_ELECTRICAL_LOAD_RE = re.compile(
    r"\btank\b|vessel|sump|basin|column\b|cone\b|pipe|duct\b|manifold|header|"
    r"weir|sieve\s*plate|baffle|gasket|flange|nozzle|bund|plinth|gantry|walkway|"
    r"hand\s*rail|ladder|grating|\bbund\b|\bskid\b", re.I)
# Tokens that PROVE a way IS electrically driven even if its name also brushes a passive
# token (e.g. an 'oxygenation cone' is the powered O2 SYSTEM; a 'filter' has a drive).
_POWERED_LOAD_RE = re.compile(
    r"pump|compressor|blower|\bfan\b|motor|drive|\buv\b|ozone|oxygen|\bo2\b|aeration|"
    r"degas|skim|disinfect|sterilis|steriliz|chiller|refriger|heat.?pump|exchanger|"
    r"filter|drum|mixer|agitator|conveyor|heater|reactor|system|unit|package|plant", re.I)


def _req_bom_kw(name: str, state: dict):
    """The equipment's published electrical kW from state.requirementsBom, matched on the
    requirement string's HEAD noun (the text before its first '·'). Universal — the
    requirement rows carry '· NN kW ·' for many items. Returns kW (float) or None."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list) or not rb:
        return None
    target = _norm_load_name(name)
    if not target:
        return None
    best = None       # (overlap, kw) — most token overlap with the head noun wins
    t_toks = set(target.split())
    for row in rb:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "")
        head = req.split("·", 1)[0]
        # reject a WHOLE-PLANT figure (e.g. SCADA '· 342 kW plant') — that is the connected
        # plant load, NOT this item's own draw; reading it as a feeder vastly over-sizes it.
        if re.search(r"·\s*[\d.,]+\s*kW\s*(plant|site|total|connected|aggregate|whole)",
                     req, re.I):
            continue
        m = re.search(r"·\s*([\d.,]+)\s*kW\b", req)
        if not m:
            continue
        h_toks = set(_norm_load_name(head).split())
        if not h_toks:
            continue
        # require the load name's tokens to be a subset/equal of the head (so 'Heat Pump'
        # matches 'Heat Pump · 96 kW' but not 'Heat Exchanger · 96 kW').
        overlap = len(t_toks & h_toks)
        if overlap == 0 or overlap < len(t_toks):
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


def _principal_motor_kw(state: dict, quantities: dict):
    """The plant's principal motor load [kW] — the anchor for type-based estimates. The
    largest electrical motor/drive/pump *_kw quantity, else a share of the connected load.
    Universal — read from the contract, never hard-coded per class."""
    best = 0.0
    for k, v in (quantities or {}).items():
        kl = k.lower()
        if not kl.endswith("_kw"):
            continue
        if _FEEDER_THERMAL_KW_RE.search(kl) and not _FEEDER_ELEC_KW_RE.search(kl):
            continue
        if not re.search(r"pump|motor|drive|fan|blower|compressor", kl):
            continue
        val = v.get("value") if isinstance(v, dict) else v
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        best = max(best, val)
    if best > 0:
        return best
    # no motor quantity: fall back to a quarter of the connected electrical load.
    load = _q(state, "connected_electrical_load_kw") or _q(state, "total_supply_demand_kw")
    return (load * 0.25) if load else 0.0


def _type_based_load_kw(name: str, state: dict, quantities: dict):
    """A deterministic, plausible electrical kW for a powered process unit with no
    published figure — its duty-type fraction × the plant's principal motor load.
    Universal (duty-keyed, not class-keyed). Returns (kw, basis) or (None, '')."""
    anchor = _principal_motor_kw(state, quantities)
    if anchor <= 0:
        return None, ""
    low = (name or "").lower()
    for rx, frac in _DUTY_LOAD_FRACTION:
        if rx.search(low):
            kw = round(anchor * frac, 1)
            if kw <= 0:
                continue
            return kw, f"≈{int(frac * 100)}% of principal motor load (type estimate)"
    # an unrecognised powered way: a modest 5% of the principal motor load.
    kw = round(anchor * 0.05, 1)
    return (kw if kw > 0 else None), ("≈5% of principal motor load (type estimate)"
                                      if kw > 0 else "")


def _derive_load_kw(name: str, state: dict, quantities: dict):
    """Resolve ONE powered load's electrical kW deterministically: requirementsBom →
    contract *_kw quantity → type-based estimate. Returns (kw, basis) or (None, '')."""
    base = re.sub(r"\s*[×x]\s*\d+\s*$", "", name or "").strip()
    kw = _req_bom_kw(base, state)
    if kw and kw > 0:
        return kw, "requirementsBom"
    kw = _feeder_specific_kw(base, quantities)
    if kw and kw > 0:
        return kw, "contract quantity"
    return _type_based_load_kw(base, state, quantities)


def _is_non_electrical_load(name: str) -> bool:
    """True when a way reads as a PASSIVE / non-electrical item (a tank / vessel / pipe /
    valve body with no drive or powered package) — it must be excluded from the feeder
    list, not drawn at 0.0 A. A name that ALSO carries a powered token (pump / UV /
    oxygenation system / filter drive) is electrical and kept."""
    if _POWERED_LOAD_RE.search(name or ""):
        return False
    return bool(_NON_ELECTRICAL_LOAD_RE.search(name or ""))


def _size_powered_load_feeders(tree: Tree, state: dict):
    """UNIVERSAL: guarantee every powered LOAD feeder carries a real, per-load current.

    A consuming feeder must never render 0.0 A (a placeholder) nor sit at the wholesale
    schedule default (the unsized ~27 A every way inherits). Walks each load branch on the
    main bus + every sub-board and, where the branch is a powered load whose current is
    zero OR pinned to the dominant default value, re-derives the current from the load's
    OWN electrical kW (requirementsBom → contract quantity → duty-type estimate) and
    re-picks its cable. A genuinely non-electrical way (a passive tank/vessel/valve with no
    drive) is removed from the bus instead. Deterministic; archetype-agnostic.

    The board/incomer current is set separately from the converged headline (see
    _apply_converged_incomer) and is left untouched here — this only sizes the OUTGOING
    consuming feeders."""
    quantities = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict) and q:
            quantities = q
            break
    voltage_v = _board_voltage_v(tree, state)

    # gather every consuming LOAD branch (main bus + sub-board branches), excluding
    # transformer / sub-distribution carriers (those are structural, not loads).
    def _load_branches(bus: "Bus"):
        out = []
        for br in bus.branches:
            if br.sub_bus is not None or br.target_sym == SYM_TRANSFORMER:
                if br.sub_bus is not None:
                    out.extend(_load_branches(br.sub_bus))
                continue
            out.append((bus, br))
        return out

    pairs = _load_branches(tree.main_bus)

    # The "default" current to break up = the value shared by the most load feeders (the
    # schedule's wholesale fallback, e.g. 27.4 A on every unsized way). A feeder pinned to
    # it is treated as unsized and re-derived from its own kW.
    from collections import Counter
    amps = [round(_rating_amps(br), 1) for _b, br in pairs if _rating_amps(br) > 0]
    default_val = None
    if amps:
        val, n = Counter(amps).most_common(1)[0]
        if n >= 3 and n / len(amps) > 0.30:
            default_val = val

    drop: list[tuple] = []      # (bus, branch) to remove (non-electrical)
    for bus, br in pairs:
        cur = _rating_amps(br)
        name = br.label or br.to_node or ""
        is_zero = cur <= 0.0
        is_default = (default_val is not None
                      and abs(round(cur, 1) - default_val) < 0.05
                      and not getattr(br, "_kw_derived", False))
        if not (is_zero or is_default):
            continue
        # a passive / non-electrical way at 0.0 A must be dropped, not invented.
        if is_zero and _is_non_electrical_load(name):
            drop.append((bus, br))
            continue
        kw, basis = _derive_load_kw(name, state, quantities)
        if not kw or kw <= 0:
            # could not derive ANY load and the way reads non-electrical → drop it;
            # otherwise leave it (a real but unsized way keeps its schedule rating).
            if is_zero and not _POWERED_LOAD_RE.search(name):
                drop.append((bus, br))
            continue
        i_a = edm._3ph_current_a(kw, voltage_v)
        lbl, _isb = edm._cable_or_busbar_label(i_a)
        br.rating = _fmt_a(i_a)
        br.cable = lbl
        br._kw_derived = True            # type: ignore[attr-defined]
        br._load_basis = basis           # type: ignore[attr-defined]
    if drop:
        ids = {id(br) for _b, br in drop}
        tree.main_bus.branches = [b for b in tree.main_bus.branches if id(b) not in ids]
        for br in tree.main_bus.branches:
            if br.sub_bus is not None:
                br.sub_bus.branches = [b for b in br.sub_bus.branches
                                       if id(b) not in ids]

    # ── add a feeder for each SYNTHESISED powered SYSTEM/UTILITY the bus is missing ──
    # The engine routes process water to every packaged life-support system (feed / sludge /
    # chilling / mortality / effluent / intake / biosecurity / grading / standby genset / …)
    # but does NOT always emit a power edge for it, so it never reaches the single-line.
    # Each such system DOES draw power, so project a feeder for it from its OWN derived kW
    # (requirementsBom → contract → duty-type) — so the single-line shows the real load list,
    # each at its own current, not a block sharing one default. Universal — keyed on the
    # BoM status + a powered-package name, never a class.
    _add_synthesised_system_feeders(tree, state, quantities, voltage_v)


def _add_synthesised_system_feeders(tree: "Tree", state: dict, quantities: dict,
                                    voltage_v: float):
    """Append a main-board feeder for each SYNTHESISED powered SYSTEM/UTILITY equipment item
    (status SYSTEM / UTILITY in requirementsBom) that is a powered package and is not already
    a feeder on the bus. Sized from the item's OWN derived kW. Deterministic + universal."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list) or not rb:
        return
    main = tree.main_bus
    # names already represented anywhere on the bus (so we don't duplicate a feeder).
    present: set = set()

    def _collect_names(bus):
        for br in bus.branches:
            present.add(_norm_load_name(br.label or br.to_node or ""))
            if br.sub_bus is not None:
                _collect_names(br.sub_bus)
    _collect_names(main)

    # a packaged system that genuinely draws power (excludes pure storage media / structural)
    powered = re.compile(
        r"system|skid|package|plant|unit|treatment|handling|ventilation|generator|genset|"
        r"\bups\b|chilling|grading|harvest|mortalit|effluent|intake|biosecurit|sludge|"
        r"dosing|make.?up|feed|pump|blower|compressor", re.I)
    # things that are NOT a discrete LOAD feeder: passive media / structural / piping, AND
    # a standby generator (it is a SOURCE drawn on the incomer side, not an outgoing load).
    not_feeder = re.compile(
        r"\bmedia\b|carrier|biofilm|structural|support frame|enclosure|reservoir|"
        r"expansion|frame|pipework|manifold|bund|gantry|walkway|"
        r"generator|genset|\bgenerating\b|standby diesel", re.I)

    devices = extract_devices(state)
    added = 0
    seen_names: set = set()
    for row in rb:
        if not isinstance(row, dict):
            continue
        if str(row.get("status") or "") not in ("SYSTEM", "UTILITY"):
            continue
        req = str(row.get("requirement") or "")
        name = req.split("·")[0].strip()
        if not name or not powered.search(name) or not_feeder.search(name):
            continue
        nkey = _norm_load_name(name)
        if not nkey or nkey in seen_names:
            continue
        # already a feeder (by strong token overlap with an existing branch)?
        ntoks = set(nkey.split())
        if any(ntoks and len(ntoks & set(p.split())) >= max(1, len(ntoks) - 1)
               for p in present):
            continue
        kw, basis = _derive_load_kw(name, state, quantities)
        if not kw or kw <= 0:
            continue
        seen_names.add(nkey)
        i_a = edm._3ph_current_a(kw, voltage_v)
        lbl, _isb = edm._cable_or_busbar_label(i_a)
        # a standby genset is a SOURCE, not a load feeder — show it as a feeder labelled so,
        # since the single-line's standby branch is drawn elsewhere; skip if already shown.
        br = Branch(from_node=main.tag, to_node=name, label=_short_system_label(name),
                    rating=_fmt_a(i_a), cable=lbl, voltdrop="", count=1, role="branch")
        br._kw_derived = True            # type: ignore[attr-defined]
        br._load_basis = basis           # type: ignore[attr-defined]
        cb = _pick_device(devices, kind="breaker")
        if cb:
            br.devices.append(_as_device(cb, "breaker", "CB"))
        main.branches.append(br)
        present.add(nkey)
        added += 1
        if added >= 24:                  # safety cap — never explode the diagram
            break


def _short_system_label(name: str, maxlen: int = 30) -> str:
    """Trim a packaged-system name for the feeder label (drop a trailing parenthetical)."""
    n = re.sub(r"\s*\([^)]*\)\s*$", "", name or "").strip()
    return n if len(n) <= maxlen else n[:maxlen - 1] + "…"


def _board_voltage_v(tree: Tree, state: dict) -> float:
    """The MAIN board's L-L voltage [V] for kW↔A on the outgoing feeders. Prefer an
    explicit AC/DC system voltage in state; else parse the bus voltage label; else the
    standard 415 V LV board. Deterministic."""
    v = _q(state, "ac_output_voltage_v") or _q(state, "ac_voltage_v")
    if v and 100.0 <= v <= 1000.0:
        return v
    m = re.search(r"([\d,]+)\s*V", str(tree.main_bus.voltage or ""))
    if m:
        try:
            cand = float(m.group(1).replace(",", ""))
            if 100.0 <= cand <= 50000.0:
                return cand
        except ValueError:
            pass
    return 415.0


def _apply_converged_incomer(tree: Tree, state: dict):
    """UNIVERSAL: drive the MAIN board current + the INCOMER feeder/breaker from the ONE
    authoritative source — the physics<->CAD convergence report (feeder_current_a /
    feeder_size), else the contract main_transformer_secondary_current_a. This stops the
    set quoting three different headline currents (SLD board, P&ID note, convergence
    report). Mutates the tree's main-bus rating, incomer feeder size, and sizes the
    incomer breaker to the next standard frame above the current (not 'CB TBD').
    Deterministic; no-op when neither source is present."""
    cur, size = _converged_feeder(state)
    if cur is None:
        # fall back to the contract main-transformer secondary current (the LV board
        # incomer current) so the board still reads a real, single figure.
        cur = _q(state, "main_transformer_secondary_current_a")
    if cur is None or cur <= 0:
        return
    main = tree.main_bus
    # Re-base the main-board rating onto the converged current, preserving the connected-kW
    # prefix the voltage model wrote (so the board reads e.g. '680 kW connected · 1,034 A').
    load_kw = _q(state, "total_supply_demand_kw") or _q(state,
                                                        "connected_electrical_load_kw")
    if load_kw:
        main.rating = f"{load_kw:,.0f} kW connected · {cur:,.0f} A"
    else:
        main.rating = _fmt_a(cur)
    main._incomer_current_a = cur   # type: ignore[attr-defined]
    main._incomer_cable = size or ""  # type: ignore[attr-defined]
    # Size + label the INCOMER breaker to the next standard frame above the current.
    frame = _next_frame_a(cur)
    if frame is not None:
        det = f"{frame:,.0f} A frame (≥ {cur:,.0f} A incomer)"
        if tree.incomer_devices:
            for d in tree.incomer_devices:
                if d.kind == "breaker":
                    # replace a 'CB TBD'-style placeholder with the sized frame.
                    if not d.detail or "tbd" in d.detail.lower():
                        d.detail = det
                    break
            else:
                tree.incomer_devices.append(Device(kind="breaker", tag="CB", detail=det))
        else:
            tree.incomer_devices.append(Device(kind="breaker", tag="CB", detail=det))


def reconstruct_tree(schedule: dict, state: dict) -> Tree:
    """Rebuild the electrical distribution tree from the schedule rows + state.

    Strategy: the electrical rows already encode the modelled topology. We classify
    each by role and from/to:
      - 'trunk' / the bus-feeding series chain  → MAIN BUS feed + bus rating
      - 'branch' from a switchgear/bus           → a load feeder off the MAIN BUS
      - identical fan-out taps (rack[0..N])       → collapse to one '× N' feeder
      - 'transformer' rows ((primary)/(secondary))→ a sub-distribution step-down whose
        adjacent '<x>_subdist' node becomes a SUB-BUS with its own branches (D2 case)
      - series power chain (rack_block→pcs→transformer) → drawn as a vertical
        conversion stack feeding the grid export
    The SOURCE + incomer protection + step-up come from state.json."""
    arch = _archetype_name(state, schedule)
    devices = extract_devices(state)
    rows = _electrical_rows(schedule)

    # ---- Identify the bus "hub" node: the from_part that fans out to the most
    #      branch consumers (switchgear / electrical_supply / a board). -----------
    fanout_counts = {}
    for r in rows:
        if (r.get("role") or "") in ("branch", "trunk", "feeder", "local_busway"):
            fanout_counts[r.get("from")] = fanout_counts.get(r.get("from"), 0) + 1
    # also count plain (role=None) branch-like rows by source
    for r in rows:
        if not r.get("role"):
            fanout_counts[r.get("from")] = fanout_counts.get(r.get("from"), 0) + 1

    # ---- Build the MAIN BUS --------------------------------------------------
    main_bus = Bus(tag="MAIN SWITCHBOARD", is_sub=False)
    main_bus.voltage = _bus_voltage_label(state, schedule)
    bus_rating = _q(state, "bus_continuous_current_a")
    if bus_rating:
        main_bus.rating = _fmt_a(bus_rating)

    # ---- D2 sub-distributions: map '<x>_subdist' → a sub bus, and its feeding
    #      transformer row.  Collect them first so branch routing can attach. ----
    subdist_buses: dict[str, Bus] = {}
    subdist_xfmr: dict[str, Transformer] = {}
    # transformer rows are role=='transformer' with from='(primary)' to='(secondary)';
    # they sit IMMEDIATELY before their *_subdist feeder in schedule order — pair by
    # the next subdist node referenced.
    erows = rows
    for i, r in enumerate(erows):
        if (r.get("role") == "transformer"):
            # find the subdist node this transformer introduces: scan forward for the
            # first row whose from or to ends with '_subdist'.
            sd_node = None
            for j in range(i + 1, min(i + 4, len(erows))):
                for ep in (erows[j].get("from"), erows[j].get("to")):
                    if isinstance(ep, str) and ep.endswith("_subdist"):
                        sd_node = ep
                        break
                if sd_node:
                    break
            if sd_node and sd_node not in subdist_buses:
                subdist_buses[sd_node] = Bus(tag=_humanise(sd_node).replace("Subdist", "sub-board"),
                                             is_sub=True)
                ratio = (r.get("size") or "").replace(" sub-distribution", "").replace(
                    " transformer", "")
                subdist_xfmr[sd_node] = Transformer(
                    tag="TX", kva=str(r.get("rating") or ""), ratio=ratio,
                    currents=str(r.get("drop") or ""),
                    detail=_pick_subdist_detail(devices))

    # ---- Now route every electrical row. -------------------------------------
    # Series-chain detection for the conversion path (DC → PCS → step-up → grid):
    # rows whose from/to are both single equipment (not bus/rack/subdist) and role is
    # None form the export chain.  We collect the chain and render it as ONE main feed.
    used = set()

    # Collapse identical fan-out taps from the SAME source into representative feeders.
    # Key by (from_source, role, rating, size, target_base) where target_base strips the
    # [n] index.
    groups: dict[tuple, list[dict]] = {}
    order: list[tuple] = []
    for idx, r in enumerate(erows):
        if r.get("role") == "transformer":
            used.add(idx)
            continue
        to = r.get("to") or ""
        m = _RACK_TAP_RE.match(to)
        target_base = m.group(1) if m else to
        key = (r.get("from"), r.get("role"), r.get("rating"), r.get("size"),
               target_base)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append({"idx": idx, "row": r})

    # Decide which source node is the MAIN bus hub: the one feeding the most groups.
    src_group_count = {}
    for key in order:
        src_group_count[key[0]] = src_group_count.get(key[0], 0) + 1
    main_hub = max(src_group_count, key=src_group_count.get) if src_group_count else None

    # Build branches.
    def _mk_branch(rep_row, count, target_base):
        spec = _spec_for_row(schedule, rep_row)
        vd = ""
        drop = rep_row.get("drop") or ""
        if isinstance(drop, str) and "Vd" in drop:
            vd = drop.replace(" Vd", "").strip()
        sysv = (spec or {}).get("system_voltage_v")
        to_h = _humanise(target_base)
        br = Branch(
            from_node=_humanise(rep_row.get("from") or ""),
            to_node=to_h,
            label=to_h + (f" × {count}" if count > 1 else ""),
            rating=_clean_rating(rep_row.get("rating")),
            cable=_clean_cable(rep_row.get("size")),
            voltdrop=vd,
            count=count,
            role=rep_row.get("role") or "",
        )
        if sysv and sysv not in (None,):
            br.bus_voltage_hint = f"{sysv:,.0f} V"   # type: ignore[attr-defined]
        return br

    # First: any branch whose source is a *_subdist goes onto that sub bus.
    for key in order:
        rows_in = groups[key]
        first = rows_in[0]["row"]
        src = key[0] or ""
        if src in subdist_buses:
            br = _mk_branch(first, len(rows_in), key[4])
            br.from_node = subdist_buses[src].tag
            # skip the internal "local busway" pseudo-target
            if "busway" in (br.to_node or "").lower():
                continue
            subdist_buses[src].branches.append(br)
            for ri in rows_in:
                used.add(ri["idx"])

    # Second: the feeder rows that FEED a *_subdist (from main hub → subdist) become a
    # transformer-terminated branch off the MAIN bus carrying the sub bus.
    for key in order:
        rows_in = groups[key]
        first = rows_in[0]["row"]
        to = key[4] or ""
        if to in subdist_buses:
            br = _mk_branch(first, 1, to)
            br.target_sym = SYM_TRANSFORMER
            br.label = _humanise(first.get("from") or "")
            sd_bus = subdist_buses[to]
            sd_bus.tag = "LOCAL SUB-DISTRIBUTION"
            br.sub_bus = sd_bus
            br.transformer = subdist_xfmr.get(to)   # type: ignore[attr-defined]
            # the branch's destination tag is the sub bus
            br.to_node = sd_bus.tag
            main_bus.branches.append(br)
            for ri in rows_in:
                used.add(ri["idx"])

    # Third: remaining rows fan out off the MAIN bus / form the conversion chain.
    chain_rows = []
    for key in order:
        rows_in = groups[key]
        if all(ri["idx"] in used for ri in rows_in):
            continue
        first = rows_in[0]["row"]
        src = key[0] or ""
        to_base = key[4] or ""
        role = key[1] or ""
        # series export chain: role None, both endpoints equipment (not the hub, not a
        # rack tap, not a subdist), and they reference transformer/pcs/grid.
        is_chainish = (role in ("", None) and src != main_hub
                       and not _RACK_TAP_RE.match(first.get("to") or "")
                       and src not in subdist_buses and to_base not in subdist_buses)
        if is_chainish and any(t in f"{src} {to_base}".lower()
                               for t in ("pcs", "transformer", "grid", "inverter",
                                         "rectifier", "supply", "compressor", "pump")):
            chain_rows.append((key, rows_in))
            continue
        # otherwise a normal load feeder off the main bus
        br = _mk_branch(first, len(rows_in), to_base)
        if "busway" in (br.to_node or "").lower():
            for ri in rows_in:
                used.add(ri["idx"])
            continue
        main_bus.branches.append(br)
        for ri in rows_in:
            used.add(ri["idx"])

    # The conversion chain (rack_block → PCS → step-up transformer → grid) is the
    # power-conversion train.  Surface its fattest run as the representative rating/size.
    chain_rep = None
    chain_has_pcs = False
    chain_has_xfmr = False
    if chain_rows:
        def _amps(rin):
            r = rin[1][0]["row"]
            mt = re.match(r"\s*([\d.]+)", str(r.get("rating") or ""))
            return float(mt.group(1)) if mt else 0.0
        chain_rows.sort(key=_amps, reverse=True)
        chain_rep = chain_rows[0][1][0]["row"]
        joined = " ".join(f"{k[0]} {k[4]}".lower() for k, _ in chain_rows)
        chain_has_pcs = any(t in joined for t in ("pcs", "inverter", "rectifier"))
        chain_has_xfmr = "transformer" in joined

    # ---- SOURCE + incomer protection from state -------------------------------
    source, inc_devices, inc_xfmr, notes = _build_source(state, schedule, devices,
                                                          main_bus, arch)
    incomer_transformer = inc_xfmr

    # ---- Attach protective devices to main-bus branches by name heuristics ----
    _attach_branch_devices(main_bus, devices)
    for sd in subdist_buses.values():
        _attach_branch_devices(sd, devices)

    # ---- Place the conversion train. -----------------------------------------
    # For a grid-tie INVERTER-based class (BESS) the PCS sits in the INCOMER stack
    # between the step-up transformer and the DC bus — that is the true single-line
    # power flow (grid → TX → PCS → DC bus → rack feeders).  For other classes the
    # remaining chain rows (e.g. a process compressor feeder) hang off the bus as loads.
    incomer_converter = None
    grid_tie_inverter = (source.sym == SYM_UTILITY
                         and ("DC BUS" in main_bus.tag or chain_has_pcs))
    if chain_rep is not None:
        vd = ""
        drop = chain_rep.get("drop") or ""
        if isinstance(drop, str) and "Vd" in drop:
            vd = drop.replace(" Vd", "").strip()
        if grid_tie_inverter:
            incomer_converter = Converter(
                tag="PCS",
                label="Power conversion system (DC ↔ AC)",
                rating=str(chain_rep.get("rating") or "").strip(),
                cable=str(chain_rep.get("size") or "").strip(),
                detail=_pcs_detail(devices), kind="dc_ac")
            # the AC main breaker guards the PCS AC side: put it in the incomer chain
            cb = _pick_device(devices, "ac_main_breaker", "main_breaker", kind="breaker")
            if cb and not any(d.kind == "breaker" for d in inc_devices):
                inc_devices.append(_as_device(cb, "breaker", "CB"))
        else:
            # non-grid-tie: render the chain endpoint as a load feeder off the bus.
            br = Branch(
                from_node=main_bus.tag,
                to_node=_humanise(chain_rep.get("to") or "Process load"),
                label=_humanise(chain_rep.get("to") or "Process load"),
                rating=str(chain_rep.get("rating") or "").strip(),
                cable=str(chain_rep.get("size") or "").strip(),
                voltdrop=vd, role="branch")
            cb = _pick_device(devices, kind="breaker")
            if cb:
                br.devices.append(_as_device(cb, "breaker", "CB"))
            main_bus.branches.append(br)

    tree = Tree(archetype=arch, source=source, incomer_devices=inc_devices,
                incomer_transformer=incomer_transformer, main_bus=main_bus,
                incomer_converter=incomer_converter,
                notes=notes, schedule_totals=schedule.get("totals") or {})
    # UNIVERSAL distribution-voltage auto-selection + per-module feeders. When the
    # schedule's electrical model is a single lumped feeder at LV (the process-plant
    # case), re-base the board onto the load-appropriate voltage (MV above ~1.5 MW)
    # and split the aggregate into a feeder per module. Keyed on load magnitude.
    _apply_distribution_voltage_model(tree, schedule, state)
    # UNIVERSAL de-duplication: a load can reach the board both as a kW-derived
    # synthesised feeder AND as a per-word skeleton edge — collapse those to one way
    # each (keeps the kW-derived feeder). Done AFTER the voltage model so synthesised
    # feeders exist to win the tie-break.
    main_bus.branches = _dedup_branches(main_bus.branches)
    # UNIVERSAL second source: if the plant has a standby genset (_utility word), draw
    # it on an ATS alongside the utility incomer. Absent ⇒ utility incomer only.
    tree.standby_source = _find_standby_generator(state)
    if tree.standby_source is not None:
        kva = tree.standby_source.kva
        tree.notes = list(tree.notes or []) + [
            f"Standby {kva} diesel generator on an automatic transfer switch (ATS) "
            f"backs the utility incomer — carries the life-safety load on mains failure."
            if kva else
            "Standby diesel generator on an automatic transfer switch (ATS) backs the "
            "utility incomer — carries the life-safety load on mains failure."]
    # UNIVERSAL: a board element (main breaker / busbar / fuse holder / isolator / surge
    # protector / protective relay / UPS / ATS / genset) reaches the board only as a
    # per-word connection-schedule skeleton edge — it must NOT be drawn as a consuming
    # load feeder. Strip those before grouping so the main breaker stays the incomer
    # device, the SPD a bus shunt, and the busbar the bus (not a 54 A load tap).
    _strip_board_element_feeders(tree)
    # UNIVERSAL: a powered process LOAD must never render 0.0 A nor sit at the wholesale
    # schedule default — size each consuming feeder from its OWN derived electrical kW
    # (requirementsBom → contract quantity → duty-type estimate); drop a genuinely
    # non-electrical way rather than draw it at 0.0 A. Done after board elements are
    # stripped (so only real loads remain) and before the converged-incomer pass.
    _size_powered_load_feeders(tree, state)
    # UNIVERSAL: drive the board current + incomer feeder/breaker from the ONE converged
    # source (convergence-report feeder_current_a / feeder_size) so the whole set reads a
    # single headline current, with a real incomer cable + a sized breaker frame.
    _apply_converged_incomer(tree, state)
    # UNIVERSAL: flag any feeder at/above the volt-drop limit (or the 4% advisory) so a
    # 4.9% drop is not shown silently next to a compliant 1% feeder.
    _flag_voltdrop(tree, schedule)
    # UNIVERSAL life-safety: group the critical loads (recirc pumps / oxygenation / DO control
    # / SCADA + the controls that run them) onto a UPS-backed CRITICAL LIFE-SUPPORT sub-board
    # the standby genset + ATS hold on a mains failure — when the ledger carries a standby
    # source + a critical-redundancy marker. Runs FIRST so it claims the life-safety controls.
    _group_critical_life_support(tree, state, devices)
    # UNIVERSAL legibility: collapse any REMAINING small control / SCADA / instrument loads
    # onto a UPS-backed control sub-board so the main bus isn't a flat row of low-power stubs
    # (a plant without a critical board still gets this; a critical board already took its
    # controls, so this handles the residue / the non-critical-redundancy case).
    _group_control_loads(tree, devices)
    return tree


# A published quantity is a SPECIFIC per-item ELECTRICAL load (a real feeder figure) when
# it names electrical/motor/drive/lamp/power; it is a thermal DUTY (NOT an electrical
# feeder) when it names duty/capacity/cooling/heating/thermal/loss/dissipation. Mirrors the
# distribution model's intent but is applied here to refine an INDIVIDUAL named feeder.
_FEEDER_ELEC_KW_RE = re.compile(r"electrical|motor|drive|lamp|_power_kw$|_kw_power$", re.I)
_FEEDER_THERMAL_KW_RE = re.compile(
    r"duty|capacity|cooling|heating|thermal|dissipation|rejection|loss|"
    r"makeup|sensible|connected_electrical_load|supply_demand", re.I)


def _feeder_specific_kw(name: str, quantities: dict):
    """The SPECIFIC published electrical kW for one feeder's equipment, matched on the
    feeder NAME tokens against the contract quantities (universal — no per-class table).
    Disambiguates 'heat pump' (→ heat_pump_electrical_kw) from a generic 'pump'
    (→ recirc_pump_motor_kw) by requiring ALL the name's significant tokens to appear in
    the quantity key, and handles 2-letter equipment acronyms (UV → uv_lamp_power_kw).
    Returns the kW (float) or None when no specific electrical figure exists (the feeder
    then keeps its synthesised even-split — an honest, disclosed fallback)."""
    if not quantities:
        return None
    raw = (name or "").lower()
    # significant name tokens; keep 2-char tokens too (uv, o2) so short equipment matches.
    toks = [t for t in re.split(r"[^a-z0-9]+", raw) if len(t) >= 2 and t not in (
        "system", "supply", "unit", "set", "the", "and")]
    if not toks:
        return None
    best = None       # (specificity, value): more matched tokens = more specific
    for k, v in quantities.items():
        kl = k.lower()
        if not kl.endswith("_kw"):
            continue
        if _FEEDER_THERMAL_KW_RE.search(kl) and not _FEEDER_ELEC_KW_RE.search(kl):
            continue
        if not _FEEDER_ELEC_KW_RE.search(kl):
            continue
        # require EVERY significant token of the equipment name to be in the key, so
        # 'Heat Pump' won't grab 'recirc_pump_motor_kw' (missing 'heat') and a bare
        # 'Circulation Pump' won't grab 'heat_pump_electrical_kw' (missing 'circulation').
        matched = [t for t in toks if t in kl]
        if len(matched) < len(toks):
            # allow a single-token equipment (e.g. 'UV') to match on that one token.
            if not (len(toks) == 1 and matched):
                continue
        val = v.get("value") if isinstance(v, dict) else v
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        spec = len(matched) + (1 if ("motor" in kl or "electrical" in kl) else 0)
        if best is None or spec > best[0]:
            best = (spec, val)
    return best[1] if best else None


def _refine_feeder_currents(feeders, quantities, voltage_v):
    """Re-size each synthesised feeder from its equipment's OWN published electrical kW
    where one exists, so feeders aren't quantised to a handful of even-split buckets. The
    current is P/(√3·V·pf) (the model's own 3-phase relation) and the cable is re-picked to
    suit. Leaves a feeder untouched when no specific kW is published. Strips a trailing
    '×N' count from the name before matching. Deterministic; mutates the Feeder list."""
    for f in feeders:
        base = re.sub(r"\s*[×x]\s*\d+\s*$", "", f.name or "").strip()
        kw = _feeder_specific_kw(base, quantities)
        if kw is None or kw <= 0:
            continue
        i_a = edm._3ph_current_a(kw, voltage_v)
        lbl, isb = edm._cable_or_busbar_label(i_a)
        f.load_kw = round(kw, 1)
        f.current_a = round(i_a, 1)
        f.size_label = lbl
        f.is_busbar = isb
        f.note = ""   # now a real per-item figure, not an even split


def _process_electrical_branches(bus: Bus):
    """The main-bus branches that came from the LUMPED process-electrical edge —
    a single aggregate feeder like 'Process compressors and pumps' / 'Process
    motors and crystalliser', fed from electrical_supply. These are the ones the
    per-module synthesis replaces. Sub-distribution / converter / conversion-chain
    branches are left untouched."""
    out = []
    for br in bus.branches:
        if br.sub_bus is not None or br.target_sym == SYM_TRANSFORMER:
            continue
        frm = (br.from_node or "").lower()
        to = (br.to_node or "").lower()
        if (("electrical" in frm or "supply" in frm or "board" in frm
             or "switchgear" in frm or "incomer" in frm)
                and ("process" in to or "compressor" in to or "pump" in to
                     or "motor" in to or "crystallis" in to)):
            out.append(br)
    return out


def _apply_distribution_voltage_model(tree: Tree, schedule: dict, state: dict):
    """UNIVERSAL — choose the distribution voltage from the connected load and, for
    the lumped-process-feeder case, replace the single feeder with a feeder per
    module/major load group at the chosen voltage. Mutates the tree in place.

    Deterministic; archetype-agnostic (keyed on load magnitude + the connection
    model). No-op when there is no electrical load to plan or the bus is a DC /
    grid-tie inverter bus (those already model their own conversion train)."""
    main = tree.main_bus
    # Skip DC buses / grid-tie inverter classes — their voltage + conversion train
    # are already modelled correctly (this fix targets AC process distribution).
    if "DC" in (main.tag or "") or "DC" in (main.voltage or ""):
        return
    if tree.incomer_converter is not None:
        return

    # Connected load [kW] from state; else the lumped electrical run's design current.
    # Design-loop closure: PREFER the converged as-routed supply demand (total_supply_demand_kw,
    # = plant load + distribution parasitic, written back by the physics<->CAD loop) so the incomer
    # / distribution board is sized for the demand it ACTUALLY sees; fall back to the brief
    # plant-load metric when the loop has not run. UNIVERSAL — the brief metric is preserved in
    # state + prose; only this engineering figure adopts the converged value.
    load_kw = _q(state, "total_supply_demand_kw") or _q(state, "connected_electrical_load_kw")
    lumped = _process_electrical_branches(main)
    lv_current = None
    for br in lumped:
        m = re.match(r"\s*([\d.,]+)", str(br.rating or ""))
        if m:
            try:
                lv_current = max(lv_current or 0.0, float(m.group(1).replace(",", "")))
            except ValueError:
                pass
    # LV reference voltage the engine sized at. Prefer an explicit LV figure in the
    # electrical material_context (e.g. '400_415V_three_phase'); else a spec's
    # system_voltage_v BUT ONLY when it is a real LV value (≤ 1000 V) — the engine's
    # _infer_system_voltage leaks a 1500 V DC-bus default onto AC process edges, which
    # must NOT be taken as the LV reference. Final fallback 415 V.
    lv_v = None
    for s in (schedule.get("specs") or []):
        if "electrical" not in (s.get("mechanism") or ""):
            continue
        mc = (s.get("material_context") or "")
        mv = re.search(r"(\d{3,4})\s*[_\s]?V\b", mc) or re.search(r"(\d{3,4})V", mc)
        if mv:
            cand = float(mv.group(1))
            if 100.0 <= cand <= 1000.0:
                lv_v = cand
                break
        sv = s.get("system_voltage_v")
        if sv and 100.0 <= float(sv) <= 1000.0:
            lv_v = float(sv)
            break
    if lv_v is None:
        lv_v = 415.0

    plan = edm.select_distribution_voltage(load_kw, lv_design_current_a=lv_current,
                                           lv_voltage_v=lv_v)
    if plan is None:
        return

    # --- Re-base the MAIN board onto the chosen voltage. ----------------------
    # In the LV case, keep an explicit board voltage _build_source already chose
    # (e.g. the CO2 MV-ring-main → 400 V LV board) so the incomer transformer ratio
    # stays coherent; only set it ourselves when none was set. In the MV case we set
    # it unconditionally (the load demands MV).
    if plan.is_mv or not main.voltage:
        main.voltage = (f"{plan.board_voltage_label} 3-phase"
                        + (" (MV)" if plan.is_mv else " AC"))
    main.rating = (f"{plan.connected_load_kw:,.0f} kW connected · "
                   f"{plan.board_current_a:,.0f} A")
    if plan.is_mv:
        main.tag = "MAIN MV SWITCHBOARD"
        # The incomer is an MV utility supply straight to the MV board (a primary
        # substation); the board's outgoing LV distribution steps down locally.
        tree.source.tag = "MV UTILITY INCOMER"
        tree.source.detail = f"{plan.board_voltage_label} DNO / ring-main supply"
        tree.source.voltage = plan.board_voltage_label
        # An incomer step-down only applies if the utility delivers at a HIGHER
        # voltage; here the board IS at the supply MV, so drop any 11kV/400V
        # incomer transformer the LV-default path may have added and note the
        # local LV step-down instead.
        tree.incomer_transformer = None
        tree.notes = [(f"Plant connected load {plan.connected_load_kw:,.0f} kW → "
                       f"distributed at {plan.board_voltage_label} MV "
                       f"({plan.board_current_a:,.0f} A board); LV loads via local "
                       f"{plan.transformer_ratio} step-down.")] + list(tree.notes or [])
    else:
        if not main.tag or main.tag in ("MAIN SWITCHBOARD",):
            main.tag = "MAIN LV BOARD"

    # --- Replace the lumped feeder(s) with per-EQUIPMENT feeders (preferred) or, if no
    #     parts-manifest is available, per-MODULE feeders. --------------------------------
    # NB do NOT early-return when `lumped` is empty (2026-07-01): a process plant whose board
    # was built with NO lumped process feeder (a sparse connection-schedule electrical model)
    # STILL has real driven loads (pumps/blowers) in the parts-manifest that must appear as
    # outgoing feeders. `keep = [br not in lumped]` degrades correctly to "keep all + append"
    # when lumped is empty, so we proceed to synthesise the per-equipment feeders regardless.
    # (Codema: the single-line drew only 2 loads because it returned here before adding the 6
    # pump feeders → part-coverage 7/14.) The module-split FALLBACK still needs a load basis.
    md = state.get("moduleDecomposition") or {}
    # PREFER one way per electrically-driven equipment item (pump / blower / O2 / heat-pump
    # / control panel) from the qty-expanded parts-manifest — the real single-line a plant
    # has. Falls back to the per-module split when the manifest is absent or yields nothing.
    parts = ((state.get("_parts_manifest") or {}).get("parts")) or []
    quantities = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict) and q:
            quantities = q
            break
    feeders = []
    if parts:
        feeders = edm.synthesise_equipment_feeders(
            plan.board_current_a, plan.board_voltage_v, parts,
            total_load_kw=plan.connected_load_kw, quantities=quantities)
    if not feeders:
        feeders = edm.synthesise_module_feeders(
            plan.board_current_a, plan.board_voltage_v, md.get("modules") or [],
            total_load_kw=plan.connected_load_kw,
            per_module_load_kw=_known_module_loads(state))
    if not feeders:
        return
    # PER-FEEDER SIZING (universal): the synthesis assigns a published kW where the
    # equipment NAME maps to a specific kW quantity, else an EVEN SPLIT — which buckets
    # many feeders to the same current (every blower/UV at 83 A, every pump at 110 A).
    # Refine each feeder from the equipment's OWN published electrical kW (e.g. a heat pump
    # at 41 kW ≠ a circulation pump at 75 kW ≠ UV at 251 kW) so each feeder is sized from
    # its real load, not a wholesale bucket. Only OVERRIDES where a specific figure exists;
    # leaves the disclosed even-split where the engine published no per-item load.
    _refine_feeder_currents(feeders, quantities, plan.board_voltage_v)
    # Drop the lumped branches, append the synthesised per-module feeders.
    keep = [br for br in main.branches if br not in lumped]
    new_branches = []
    devices = extract_devices(state)
    for f in feeders:
        br = Branch(
            from_node=main.tag,
            to_node=f.name,
            label=f.name,
            rating=_fmt_a(f.current_a),
            cable=f.size_label,
            voltdrop="",
            count=1,
            role="branch",
        )
        # mark this as a kW-DERIVED feeder (current came from the equipment's real load,
        # not a flat per-word skeleton stub) so the de-dup pass prefers it when the same
        # load also appears as a schedule skeleton edge.
        br._kw_derived = True   # type: ignore[attr-defined]
        # a sized standard breaker per feeder (named device if one matches the group)
        cb = _pick_device(devices, kind="breaker")
        if cb:
            br.devices.append(_as_device(cb, "breaker", "CB"))
        new_branches.append(br)
    main.branches = keep + new_branches


def _known_module_loads(state: dict) -> dict:
    """{module_display_name_lower: kW} for modules whose load we can read directly
    from the orchestrator quantities (compressor / pump / motor powers summed by the
    module their part name implies). Best-effort; unmatched modules get the even
    split. Universal — matches on the quantity NAME, not a per-class table."""
    q = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = ((state.get(ck) or {}).get("quantities") or {})
        for k, v in qs.items():
            kl = k.lower()
            if kl.endswith("_power_kw") and any(t in kl for t in (
                    "compressor", "pump", "motor", "fan", "blower", "mixer",
                    "agitator", "crystallis")):
                val = v.get("value") if isinstance(v, dict) else v
                try:
                    q[kl] = float(val)
                except (TypeError, ValueError):
                    pass
        if q:
            break
    return q


def _pcs_detail(devices):
    """A short detail string for the PCS — reuse the AC main breaker's mfr if no PCS
    word carries a part number (the PCS itself is often a non-BoM macro)."""
    return ""


def _pick_subdist_detail(devices):
    d = _pick_device(devices, "transformer", "subdist", "distribution")
    return (d["detail"] or d["name"]) if d else ""


def _attach_branch_devices(bus: Bus, devices):
    """Heuristically place a protective device IN-LINE on each branch based on the
    destination tag (rack → DC isolator; chiller → MCCB; conversion → main breaker)."""
    for br in bus.branches:
        if br.devices:
            continue
        to = (br.to_node or "").lower()
        picked = None
        if "rack" in to:
            picked = (_pick_device(devices, "rack_dc_isolator", "rack_dc", kind="isolator")
                      or _pick_device(devices, "string_fuse", "rack_string", kind="fuse"))
        elif any(t in to for t in ("chiller", "hvac", "cooling", "pump", "aux")):
            picked = (_pick_device(devices, kind="breaker")
                      or _pick_device(devices, "isolator", kind="isolator"))
        elif "sub-distribution" in to or br.target_sym == SYM_TRANSFORMER:
            picked = (_pick_device(devices, "main_bus_contactor", "main_bus", kind="contactor")
                      or _pick_device(devices, kind="breaker"))
        if picked:
            br.devices.append(_as_device(picked, picked["kind"], picked["tag"]))


def _build_source(state, schedule, devices, main_bus, arch):
    """Determine the SOURCE/incomer symbol, the incomer protection chain, and any
    step-up/step-down transformer between source and main bus, from state.json."""
    notes = []
    inc_devices = []
    inc_xfmr = None

    # Grid-tie BESS: PCS exports LV (400 V) → external step-up to MV (11/33 kV) grid.
    ac_v = _q(state, "ac_output_voltage_v")
    has_step_up = bool(_q(state, "external_transformer_mass_kg")) or bool(
        _pick_device(devices, "step_up", "step-up"))
    # process plant: MV incomer → distribution transformer → LV board
    mv_word = None
    for w, name, cid in _iter_words(state):
        if re.search(r"mv_transformer|distribution_transformer|mv_switchgear|"
                     r"ring.?main|incomer|incoming_supply", f"{name} {cid}", re.I):
            mv_word = (w, name, cid)
            break

    if mv_word is not None:
        # MV-fed process plant.  SOURCE = utility MV incomer; transformer steps MV→LV.
        source = Source(sym=SYM_UTILITY, tag="MV UTILITY INCOMER",
                        detail="11 kV ring-main / DNO supply", voltage="11 kV")
        # incomer protection: MV switchgear (isolator) + any MV breaker
        swgr = _pick_device(devices, "mv_switchgear", "switchgear", "ring_main")
        if swgr:
            inc_devices.append(Device(kind="isolator", tag="RMU",
                                      detail=(swgr["detail"] or swgr["name"])))
        xfmr_d = _pick_device(devices, "mv_transformer", "distribution_transformer",
                              "transformer")
        # Design-loop closure: prefer the converged as-routed supply demand (see above).
        load_kw = _q(state, "total_supply_demand_kw") or _q(state, "connected_electrical_load_kw")
        inc_xfmr = Transformer(
            tag="TX1", kva=(f"{load_kw/0.8:,.0f} kVA (≈)" if load_kw else ""),
            ratio="11000/400 V",
            detail=(xfmr_d["detail"] or xfmr_d["name"]) if xfmr_d else "")
        main_bus.tag = "MAIN LV BOARD"
        # The LV board sits on the transformer SECONDARY (400 V), not the internal
        # process-bus default the schedule may carry — set it unconditionally.
        main_bus.voltage = "400 V AC"
        if load_kw:
            main_bus.rating = _fmt_kw(load_kw) + " connected"
        notes.append("MV ring-main supply stepped to 400 V LV board; process loads on "
                     "Form-4 board via MCC.")
        return source, inc_devices, inc_xfmr, notes

    if has_step_up or ac_v:
        # Grid-tie inverter-based plant (BESS): the SOURCE is the GRID (export/import);
        # the DC bus is the internal generation node.  Draw GRID at top as utility,
        # main bus = the DC bus, the conversion train rejoins the grid.
        gv = "11 kV / 33 kV"
        source = Source(sym=SYM_UTILITY, tag="GRID CONNECTION POINT",
                        detail=f"{gv} MV grid · G99 (≤ 1 MW export)", voltage=gv)
        # incomer step-up transformer (LV PCS → MV grid)
        cont_kw = _q(state, "continuous_power_kw")
        inc_xfmr = Transformer(
            tag="TX1",
            kva=(f"{cont_kw/0.95:,.0f} kVA" if cont_kw else ""),
            ratio=(f"{ac_v:,.0f} V / {gv}" if ac_v else f"LV / {gv}"),
            detail="external pad-mount step-up (IEC 62933-5-2)")
        # G99 protection relay + AC main breaker sit at the grid interface
        g99 = _pick_device(devices, "g99", "grid_protection", "protection_relay")
        if g99:
            inc_devices.append(Device(kind="rcd", tag="G99",
                                      detail=(g99["detail"] or g99["name"])))
        if not main_bus.voltage:
            main_bus.voltage = _bus_voltage_label(state, schedule, "800 V DC")
        main_bus.tag = "MAIN DC BUS"
        notes.append("Battery DC bus → PCS inverter → external step-up transformer → "
                     "G99 grid connection (bidirectional charge / discharge).")
        return source, inc_devices, inc_xfmr, notes

    # Generic fallback: a utility LV incomer straight onto the main board.
    source = Source(sym=SYM_UTILITY, tag="UTILITY SUPPLY",
                    detail="LV distribution board incomer", voltage="400 V")
    main_inc = _pick_device(devices, "main_breaker", "incomer", kind="breaker")
    if main_inc:
        inc_devices.append(_as_device(main_inc, "breaker", "CB"))
    if not main_bus.voltage:
        main_bus.voltage = _bus_voltage_label(state, schedule, "400 V AC")
    return source, inc_devices, inc_xfmr, notes


# ═══════════════════════════════════════════════════════════════════════════
# SVG DRAWING  — standard single-line-diagram symbols + layout
# ═══════════════════════════════════════════════════════════════════════════

# Light-mode palette (engineering-drawing aesthetic, NO dark theme).
INK = "#1a1a1a"            # primary line / text
BUS_INK = "#10243e"        # heavy busbar
ACCENT = "#1a5fb4"         # active-conductor accent (blue)
FILL_BG = "#ffffff"        # page
PANEL_BG = "#f4f6f9"       # title-block / load fill
GRID_FAINT = "#e4e8ee"     # very faint guide
DEV_INK = "#1a1a1a"
MUTED = "#5b6470"
WARN_ADVISE = "#b7791f"    # amber — volt-drop in the last advisory band (≥4%, <limit)
WARN_OVER = "#b42318"      # red — volt-drop at/above the design limit (≥5%)


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    """Tiny imperative SVG builder (deterministic; integer-ish coords)."""

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

    def text(self, x, y, s, size=12, anchor="start", fill=INK, weight="normal",
             family="Helvetica, Arial, sans-serif", mono=False, spacing=None):
        fam = "'DejaVu Sans Mono', 'Menlo', monospace" if mono else family
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" '
                 f'font-size="{size}" text-anchor="{anchor}" fill="{fill}" '
                 f'font-weight="{weight}"{sp}>{_esc(s)}</text>')

    def render(self) -> str:
        body = "\n".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


# ---- symbol primitives (drawn around an anchor point) ------------------------

def sym_utility(svg: SVG, cx, cy):
    """Utility/grid incomer: the standard 'arrow-into-network' — a downward feed with
    a small transformer-network glyph (circle with a sine)."""
    r = 16
    svg.circle(cx, cy, r, stroke=INK, width=1.8)
    # a stylised lightning/grid mark inside
    svg.add(f'<path d="M {cx-5:.1f} {cy-7:.1f} L {cx+2:.1f} {cy-1:.1f} '
            f'L {cx-2:.1f} {cy+1:.1f} L {cx+5:.1f} {cy+7:.1f}" '
            f'fill="none" stroke="{ACCENT}" stroke-width="2.2" '
            f'stroke-linejoin="round" stroke-linecap="round"/>')
    # feed line out the bottom
    svg.line(cx, cy + r, cx, cy + r + 18, width=2.0)
    return (cx, cy + r + 18)   # the exit point


def sym_generator(svg: SVG, cx, cy, r=16):
    """Generating source — the standard circle with a 'G' (a standby genset / PV feed).
    Feed line exits the BOTTOM. Returns the exit point."""
    svg.circle(cx, cy, r, stroke=INK, width=1.8)
    svg.text(cx, cy + 5, "G", size=15, anchor="middle", weight="bold", fill=INK)
    svg.line(cx, cy + r, cx, cy + r + 18, width=2.0)
    return (cx, cy + r + 18)


def sym_ats(svg: SVG, cx, cy, in_left, in_right, size=15):
    """Automatic Transfer Switch (changeover) — a common output pole that selects ONE of
    two incoming supplies (left = utility, right = standby). Drawn as two upper contacts
    with a single wiper to a common lower terminal. `in_left` / `in_right` are the X of
    the two incoming conductors that arrive at this ATS; the box spans them. Returns the
    bottom (common) terminal point (cx, y)."""
    half = max(28.0, abs(in_right - in_left) / 2 + 16)
    x0, x1 = cx - half, cx + half
    top = cy - size
    bot = cy + size
    # enclosure
    svg.rect(x0, top - 6, x1 - x0, (bot - top) + 12, stroke=DEV_INK, width=1.5,
             fill=FILL_BG, rx=3)
    # two upper contact dots (where the two supplies land) + the common lower terminal
    lcx = cx - half * 0.55
    rcx = cx + half * 0.55
    svg.circle(lcx, top, 2.2, fill=FILL_BG, stroke=DEV_INK, width=1.4)
    svg.circle(rcx, top, 2.2, fill=FILL_BG, stroke=DEV_INK, width=1.4)
    svg.circle(cx, bot, 2.4, fill=DEV_INK, stroke=DEV_INK, width=1.2)
    # the wiper currently selecting the LEFT (utility) supply — solid; the alternate to
    # the right shown dashed (the standby path, energised on changeover).
    svg.line(cx, bot, lcx, top, stroke=DEV_INK, width=1.9)
    svg.line(cx, bot, rcx, top, stroke=MUTED, width=1.4, dash="3,3")
    svg.text(cx, bot + 14, "ATS", size=9.5, anchor="middle", weight="bold", fill=DEV_INK)
    # incoming stubs from the two supply X positions down to the contacts
    svg.line(in_left, top - 6, lcx, top, stroke=INK, width=1.6)
    svg.line(in_right, top - 6, rcx, top, stroke=INK, width=1.6)
    return (cx, bot)


def sym_ups(svg: SVG, cx, cy_top, label_side="right", kva="", detail=""):
    """Uninterruptible power supply — a labelled box with the double-conversion glyph
    (AC→DC→AC: a sine, a rectifier arrow, a sine). Drawn in-line on a feeder drop.
    Returns the bottom terminal y."""
    s = 18
    top = cy_top
    box_top = top + 12
    x0 = cx - s
    y0 = box_top
    svg.line(cx, top, cx, box_top, width=1.8)
    svg.rect(x0, y0, 2 * s, 2 * s, stroke=INK, width=1.7, fill=FILL_BG, rx=2)
    # battery cell mark inside (a long + short pair) — the UPS energy store
    svg.line(cx - 6, y0 + 13, cx - 6, y0 + 23, stroke=INK, width=2.0)
    svg.line(cx - 1, y0 + 16, cx - 1, y0 + 20, stroke=INK, width=1.4)
    svg.line(cx + 4, y0 + 13, cx + 4, y0 + 23, stroke=INK, width=2.0)
    svg.line(cx + 9, y0 + 16, cx + 9, y0 + 20, stroke=INK, width=1.4)
    bot = y0 + 2 * s
    svg.line(cx, bot, cx, bot + 12, width=1.8)
    lx = cx + s + 10 if label_side == "right" else cx - s - 10
    anc = "start" if label_side == "right" else "end"
    svg.text(lx, y0 + 6, "UPS", size=11, anchor=anc, weight="bold")
    lines = [x for x in (kva, detail) if x]
    for k, ln in enumerate(lines):
        svg.text(lx, y0 + 20 + k * 12, ln, size=9, anchor=anc, fill=MUTED)
    return bot + 12


def sym_breaker(svg: SVG, cx, cy, size=11):
    """Circuit breaker — IEC: a square drawn on the conductor (open contact in a box).
    We use the common drawn-box-with-diagonal that engineers read as a moulded-case CB."""
    s = size
    svg.rect(cx - s, cy - s, 2 * s, 2 * s, stroke=DEV_INK, width=1.8, fill=FILL_BG)
    # the contact stroke
    svg.line(cx - s + 3, cy + s - 3, cx + s - 3, cy - s + 3, stroke=DEV_INK, width=1.8)
    return cy + s


def sym_isolator(svg: SVG, cx, cy, size=12):
    """Isolator / disconnector — an open knife switch: a hinge dot, a contact dot, and
    a blade leaning open at ~30°."""
    s = size
    top = cy - s
    bot = cy + s
    svg.circle(cx, bot, 2.0, fill=DEV_INK, stroke=DEV_INK, width=1)
    # blade leaning open
    bx = cx + s * 0.8
    svg.line(cx, bot, bx, top, stroke=DEV_INK, width=1.8)
    svg.circle(cx, top, 2.0, fill=FILL_BG, stroke=DEV_INK, width=1.4)
    return bot


def sym_contactor(svg: SVG, cx, cy, size=11):
    """Contactor — like an isolator but with the characteristic open 'cup' (a small arc)
    at the moving contact."""
    s = size
    top = cy - s
    bot = cy + s
    svg.circle(cx, bot, 2.0, fill=DEV_INK, stroke=DEV_INK, width=1)
    bx = cx + s * 0.7
    svg.line(cx, bot, bx, top + 1, stroke=DEV_INK, width=1.8)
    # the contactor arc cup at the top contact
    svg.add(f'<path d="M {cx-5:.1f} {top:.1f} Q {cx:.1f} {top+6:.1f} {cx+5:.1f} {top:.1f}" '
            f'fill="none" stroke="{DEV_INK}" stroke-width="1.6"/>')
    return bot


def sym_fuse(svg: SVG, cx, cy, size=11):
    """Fuse — IEC rectangle on the conductor with a line through it."""
    w, h = 8, size * 1.6
    svg.rect(cx - w, cy - h / 2, 2 * w, h, stroke=DEV_INK, width=1.6, fill=FILL_BG)
    svg.line(cx, cy - h / 2, cx, cy + h / 2, stroke=DEV_INK, width=1.4)
    return cy + h / 2


def sym_rcd(svg: SVG, cx, cy, size=12):
    """Protection relay / RCD / G99 interface relay — a diamond on the conductor."""
    s = size
    svg.add(f'<path d="M {cx:.1f} {cy-s:.1f} L {cx+s:.1f} {cy:.1f} '
            f'L {cx:.1f} {cy+s:.1f} L {cx-s:.1f} {cy:.1f} Z" '
            f'fill="{FILL_BG}" stroke="{DEV_INK}" stroke-width="1.6"/>')
    return cy + s


def _draw_spd_shunt(svg: SVG, cx, bus_y):
    """Surge-protection device (SPD) drawn as a SHUNT off the busbar: a short stub down to
    a varistor box and an earth symbol. An SPD sits in PARALLEL across the bus to earth — it
    is NOT a series load tap. Drawn directly under the bus so it reads as bus-mounted
    protection, separate from the outgoing feeders."""
    top = bus_y + 4
    box_top = top + 16
    svg.line(cx, top, cx, box_top, width=1.6, stroke=DEV_INK)
    # varistor / MOV box
    svg.rect(cx - 9, box_top, 18, 20, stroke=DEV_INK, width=1.5, fill=FILL_BG)
    # diagonal varistor stroke + the SPD arrows
    svg.line(cx - 6, box_top + 16, cx + 6, box_top + 4, stroke=DEV_INK, width=1.5)
    bot = box_top + 20
    svg.line(cx, bot, cx, bot + 8, width=1.6, stroke=DEV_INK)
    # earth symbol (three shortening bars)
    ey = bot + 8
    svg.line(cx - 8, ey, cx + 8, ey, stroke=DEV_INK, width=1.6)
    svg.line(cx - 5, ey + 3, cx + 5, ey + 3, stroke=DEV_INK, width=1.4)
    svg.line(cx - 2, ey + 6, cx + 2, ey + 6, stroke=DEV_INK, width=1.2)
    svg.text(cx + 13, box_top + 13, "SPD", size=8.5, anchor="start", weight="bold",
             fill=MUTED)


_DEVICE_GLYPH = {
    "breaker": sym_breaker, "isolator": sym_isolator, "contactor": sym_contactor,
    "fuse": sym_fuse, "rcd": sym_rcd,
}


def sym_transformer(svg: SVG, cx, cy, label_side="right", ratio="", kva="",
                    currents="", detail="", tag="TX"):
    """Two-winding transformer — the standard two interlocked circles, primary above
    secondary, with terminals top + bottom.  Returns (top_terminal, bottom_terminal)."""
    r = 15
    gap = r * 0.9
    top_c = (cx, cy - gap / 2)
    bot_c = (cx, cy + gap / 2)
    # terminals
    svg.line(cx, top_c[1] - r - 14, cx, top_c[1] - r, width=2.0)
    svg.line(cx, bot_c[1] + r, cx, bot_c[1] + r + 14, width=2.0)
    # windings
    svg.circle(*top_c, r, stroke=INK, width=1.9)
    svg.circle(*bot_c, r, stroke=INK, width=1.9)
    # labels
    lx = cx + r + 10 if label_side == "right" else cx - r - 10
    anc = "start" if label_side == "right" else "end"
    ly = cy - 14
    svg.text(lx, ly, tag, size=12, anchor=anc, weight="bold")
    lines = [x for x in (kva, ratio, currents, detail) if x]
    for k, ln in enumerate(lines):
        svg.text(lx, ly + 14 + k * 13, ln, size=10.5, anchor=anc, fill=MUTED)
    return (cx, top_c[1] - r - 14), (cx, bot_c[1] + r + 14)


def _fit_font(text: str, box_w: float, base: float, floor: float,
              char_factor: float = 0.56) -> float:
    """Deterministic font-size that keeps `text` inside `box_w` (with a small inset),
    shrinking from `base` to `floor`. Avg glyph width ≈ char_factor × font-size for a
    Helvetica-ish face; good enough to stop labels overflowing narrow load boxes."""
    n = max(1, len(text or ""))
    avail = max(1.0, box_w - 8.0)
    size = avail / (n * char_factor)
    return max(floor, min(base, size))


def sym_load(svg: SVG, cx, cy_top, w=150, label="", rating="", cable="", vd="",
             count=1, sub=False, vd_flag=None):
    """A final load / equipment block — labelled rectangle hanging below its drop
    point cy_top.  Returns the block bottom y.

    vd_flag ∈ {None, 'advisory', 'over'} marks a feeder whose volt-drop is in the last
    advisory band ('advisory', amber) or at/above the design limit ('over', red): the box
    outline + the ΔU text switch to a warning colour and a ⚠ marker is shown, so an
    out-of-limit drop is conspicuous rather than buried."""
    h = 46
    x = cx - w / 2
    y = cy_top + 16
    # drop into the block
    svg.line(cx, cy_top, cx, y, width=1.8)
    fill = PANEL_BG
    warn_col = WARN_OVER if vd_flag == "over" else (WARN_ADVISE if vd_flag == "advisory"
                                                    else None)
    box_stroke = warn_col or INK
    box_w = 2.2 if warn_col else 1.5
    svg.rect(x, y, w, h, stroke=box_stroke, width=box_w, fill=fill, rx=3)
    # shrink the label to fit a narrow box (sub-board loads can be tightly pitched).
    lbl_size = _fit_font(label, w, base=11.5, floor=7.0)
    svg.text(cx, y + 18, label, size=lbl_size, anchor="middle", weight="bold")
    sub_bits = " · ".join(b for b in (rating, cable) if b)
    if sub_bits:
        sb_size = _fit_font(sub_bits, w, base=9.5, floor=6.5)
        svg.text(cx, y + 33, sub_bits, size=sb_size, anchor="middle", fill=MUTED)
    if vd:
        vd_col = warn_col or MUTED
        vd_txt = (f"⚠ ΔU {vd}" if warn_col else f"ΔU {vd}")
        vd_weight = "bold" if warn_col else "normal"
        svg.text(cx, y + 44, vd_txt, size=8.8, anchor="middle", fill=vd_col,
                 weight=vd_weight)
    return y + h


def sym_converter(svg: SVG, cx, cy_top, conv: "Converter", label_side="right"):
    """Power converter (PCS / inverter / rectifier) — the standard square split by a
    diagonal with a sine on the AC side and ⎓ on the DC side.  Drawn in-line on the
    incomer.  Returns the bottom terminal y."""
    s = 20
    top = cy_top
    box_top = top + 14
    cx0 = cx - s
    cy0 = box_top
    # terminal in
    svg.line(cx, top, cx, box_top, width=2.0)
    svg.rect(cx0, cy0, 2 * s, 2 * s, stroke=INK, width=1.9, fill=FILL_BG)
    # diagonal split
    svg.line(cx0, cy0 + 2 * s, cx0 + 2 * s, cy0, stroke=INK, width=1.4)
    # DC mark (top-left): ⎓  (a line over a dashed line)
    svg.line(cx0 + 6, cy0 + 9, cx0 + 15, cy0 + 9, stroke=INK, width=1.3)
    svg.add(f'<line x1="{cx0+6:.1f}" y1="{cy0+13:.1f}" x2="{cx0+15:.1f}" '
            f'y2="{cy0+13:.1f}" stroke="{INK}" stroke-width="1.3" '
            f'stroke-dasharray="2,2"/>')
    # AC sine (bottom-right)
    sx = cx0 + 2 * s - 20
    sy = cy0 + 2 * s - 11
    svg.add(f'<path d="M {sx:.1f} {sy:.1f} q 3 -6 6 0 q 3 6 6 0" fill="none" '
            f'stroke="{ACCENT}" stroke-width="1.5"/>')
    # terminal out
    bot = cy0 + 2 * s
    svg.line(cx, bot, cx, bot + 14, width=2.0)
    # labels
    lx = cx + s + 12 if label_side == "right" else cx - s - 12
    anc = "start" if label_side == "right" else "end"
    ly = cy0 + 4
    svg.text(lx, ly, conv.tag, size=12, anchor=anc, weight="bold")
    lines = [x for x in (conv.label, " · ".join(b for b in (conv.rating, conv.cable) if b),
                         conv.detail) if x]
    for k, ln in enumerate(lines):
        svg.text(lx, ly + 14 + k * 13, ln, size=10, anchor=anc, fill=MUTED)
    return bot + 14


# ---- layout -----------------------------------------------------------------

def _device_chain(svg: SVG, cx, y_start, y_end, devices):
    """Draw the conductor from y_start to y_end with each device glyph spaced along it,
    plus a small label beside each.  Returns nothing (line already spans)."""
    svg.line(cx, y_start, cx, y_end, width=1.8)
    if not devices:
        return
    n = len(devices)
    span = y_end - y_start
    for i, dev in enumerate(devices):
        cy = y_start + span * (i + 1) / (n + 1)
        glyph = _DEVICE_GLYPH.get(dev.kind, sym_breaker)
        glyph(svg, cx, cy)
        lbl = dev.tag + (f"  {dev.detail}" if dev.detail else "")
        svg.text(cx + 18, cy + 3.5, lbl, size=9.5, anchor="start", fill=MUTED)


def _balance_rows(items, spans, n_rows):
    """Greedily split an ORDERED list of branches into ≤ n_rows rows of ~equal total span,
    so a folded multi-section busbar reads evenly. Never splits a branch; preserves order.
    Returns list[list[(branch, span)]] (non-empty rows only). Deterministic + universal."""
    total = sum(spans) or 1.0
    target = total / max(1, n_rows)
    rows, cur, cur_span = [], [], 0.0
    for br, sp in zip(items, spans):
        if cur and cur_span + sp > target * 1.15 and len(rows) < n_rows - 1:
            rows.append(cur)
            cur, cur_span = [], 0.0
        cur.append((br, sp))
        cur_span += sp
    if cur:
        rows.append(cur)
    return rows or [[]]


# Board-infrastructure electrical + control gear that a single-line carries as a SYMBOL (drawn as
# G / SPD / a breaker glyph) but WITHOUT its full BoM name — so the deterministic coverage check
# (which matches the BoM part NAME/tag in the SVG text) misses it. Collect these from the BoM and
# print them in a compact "board components" schedule strip so each is named. UNIVERSAL — keyed on
# the board-infrastructure noun, excluding process equipment + field instruments (other drawings).
_SLD_BOARD_RE = re.compile(
    r"\b(control panel|digital control|circuit breaker|breaker|surge|\bspd\b|\bups\b|"
    r"switchboard|switchgear|\bmcc\b|distribution board|isolator|disconnect|contactor|relay|"
    r"power supply|\bpsu\b|vfd|soft[- ]start|standby (?:diesel )?generator|genset|"
    r"transfer switch|\bats\b|plc|scada|hmi|gateway|controller)\b", re.I)
_SLD_BOARD_EXCLUDE_RE = re.compile(
    r"\b(pump|tank|valve|filter|membrane|vessel|skid|motor|sensor|transmitter|analy[sz]er|"
    r"probe|gauge|nozzle|frame|wall|floor|nutrient)\b", re.I)


def _collect_board_components(state: dict):
    seen: set = set()
    out: list = []
    rows = state.get("requirementsBom") if isinstance(state, dict) else None
    for r in (rows if isinstance(rows, list) else []):
        if not isinstance(r, dict):
            continue
        nm = str(r.get("name") or r.get("requirement") or "").split(" · ")[0].strip()
        if not nm or nm.lower().startswith(("water connection", "electrical connection",
                                            "signal connection", "air connection")):
            continue
        if not _SLD_BOARD_RE.search(nm) or _SLD_BOARD_EXCLUDE_RE.search(nm):
            continue
        if nm.lower() in seen:
            continue
        seen.add(nm.lower())
        tag = str(r.get("tag") or "")
        out.append(f"{nm}" + (f" ({tag})" if tag else ""))
    return out[:18]


def build_sld_svg(tree: Tree, state: dict | None = None) -> str:
    """Render the reconstructed tree as a standard single-line diagram SVG."""
    main = tree.main_bus

    # ----- size the canvas from branch counts -----
    # Keep sub-distribution branches LAST so they sit at the right end of the bus, away
    # from the left bus label; their wider sub-busbar then has clear room before the
    # legend gutter. Order is otherwise preserved (stable). Deterministic.
    main_branches = sorted(main.branches,
                           key=lambda b: (1 if b.sub_bus is not None else 0))
    n_main = max(1, len(main_branches))
    col_w = 210
    margin_l = 60
    margin_r = 60
    title_h = 138
    legend_gutter = 220   # dedicated right-hand column for the symbol legend
    # sub-distribution branches need extra vertical space below their parent slot.
    has_sub = any(br.sub_bus for br in main_branches)

    # ----- each branch claims a horizontal SPAN: a plain load needs one column; a
    #       sub-distribution needs room for its fanned sub-busbar (≈ its load count).
    def _branch_span(br):
        if br.sub_bus is not None:
            return max(2.0, 0.9 * len(br.sub_bus.branches))
        return 1.0
    spans = [_branch_span(br) for br in main_branches]
    total_span = sum(spans) or 1.0
    # provisional canvas width for the incomer measurement only (its vertical depth is
    # width-independent); the REAL width + height are set after the folded-busbar row
    # count R is chosen below, so the page clears the ≤4:1 legibility gate with margin.
    width = 1400
    bus_x0 = margin_l

    # ----- height is finalised after we know the incomer stack depth; draw the
    #       incomer onto a scratch SVG first to measure, then assemble for real. ----
    def _draw_utility_stack(svg, src_cx, src_cy):
        """The utility incomer column: source symbol + incomer devices + step-down TX +
        any PCS converter. Returns the bottom y where the conductor continues."""
        svg.text(src_cx, src_cy - 30, tree.source.tag, size=13, anchor="middle",
                 weight="bold")
        if tree.source.detail:
            svg.text(src_cx, src_cy - 16, tree.source.detail, size=10, anchor="middle",
                     fill=MUTED)
        exit_pt = sym_utility(svg, src_cx, src_cy)
        y = exit_pt[1]
        if tree.incomer_devices:
            chain_end = y + 24 + 30 * (len(tree.incomer_devices) - 1)
            _device_chain(svg, src_cx, y, chain_end, tree.incomer_devices)
            y = chain_end
        if tree.incomer_transformer:
            svg.line(src_cx, y, src_cx, y + 14, width=2.0)
            _t, bot_t = sym_transformer(
                svg, src_cx, y + 14 + 30, label_side="right",
                tag=tree.incomer_transformer.tag, kva=tree.incomer_transformer.kva,
                ratio=tree.incomer_transformer.ratio,
                currents=tree.incomer_transformer.currents,
                detail=tree.incomer_transformer.detail)
            y = bot_t[1]
        if tree.incomer_converter:
            svg.line(src_cx, y, src_cx, y + 10, width=2.0)
            y = sym_converter(svg, src_cx, y + 10, tree.incomer_converter,
                              label_side="right")
        return y

    def _draw_genset_stack(svg, gen_cx, gen_cy, stby: StandbySource):
        """The standby-generator column (a 'G' source + rating label). Returns the
        bottom y where its conductor continues down to the ATS."""
        svg.text(gen_cx, gen_cy - 30, stby.tag, size=12.5, anchor="middle",
                 weight="bold")
        lab = " · ".join(b for b in (stby.kva, "standby") if b)
        if lab:
            svg.text(gen_cx, gen_cy - 16, lab, size=10, anchor="middle", fill=MUTED)
        return sym_generator(svg, gen_cx, gen_cy)[1]

    def _draw_incomer(svg, src_cx, src_cy):
        """Draw the incomer above the main bus and return the bottom y of the conductor
        that drops onto the bus. With a standby source, draws utility (left) + genset
        (right) into an ATS; otherwise the single utility stack down the centre."""
        stby = tree.standby_source
        if stby is None:
            return _draw_utility_stack(svg, src_cx, src_cy)
        # dual source: utility left, genset right, both into a central ATS.
        spread = min(max(col_w * 1.05, 230), (width - margin_l - margin_r) / 2 - 20)
        util_cx = src_cx - spread / 2
        gen_cx = src_cx + spread / 2
        util_bot = _draw_utility_stack(svg, util_cx, src_cy)
        gen_bot = _draw_genset_stack(svg, gen_cx, src_cy, stby)
        # bring both conductors down to a common ATS level, then the ATS box.
        ats_in_y = max(util_bot, gen_bot) + 16
        svg.line(util_cx, util_bot, util_cx, ats_in_y - 6, width=2.0)
        svg.line(gen_cx, gen_bot, gen_cx, ats_in_y - 6, width=2.0)
        _cx, ats_bot = sym_ats(svg, src_cx, ats_in_y + 9, util_cx, gen_cx)
        if stby.detail:
            svg.text(src_cx, ats_bot + 26, "Standby: " + stby.detail, size=8.8,
                     anchor="middle", fill=MUTED)
            return ats_bot + 30
        return ats_bot

    src_cx = width / 2
    src_cy = 70
    scratch = SVG(width, 1200)
    incomer_bottom = _draw_incomer(scratch, src_cx, src_cy)
    # leave headroom above the busbar for the 2-line bus label (tag + voltage/rating).
    bus_y = incomer_bottom + 44

    # ----- FOLD the feeders into R left-risered busbar sections so the page clears the
    #       ≤4:1 legibility gate with margin. A 30-feeder single bus renders as an
    #       unreadable 9:1 strip; folding collapses the width and grows the height.
    #       Universal + deterministic — keyed only on the feeder spans + measured incomer.
    ROW_PITCH = 340          # one feeder row's vertical pitch (the proven single-row body)
    SUB_ROW_EXTRA = 260      # a row carrying a sub-distribution fans a sub-busbar below it

    def _row_heights(rws):
        return [ROW_PITCH + (SUB_ROW_EXTRA if any(b.sub_bus for b, _ in r) else 0)
                for r in rws]

    def _dims_for(n_rows):
        rws = _balance_rows(main_branches, spans, n_rows)
        max_rs = max((sum(sp for _, sp in r) for r in rws), default=1.0) or 1.0
        dia_w = margin_l + max_rs * col_w
        w = max(dia_w + legend_gutter + margin_r, 1060)
        h = bus_y + sum(_row_heights(rws)) + title_h
        return w, h, rws, dia_w

    rows = [list(zip(main_branches, spans))]
    width = height = diagram_w = 0
    for _cand in range(1, 9):                # smallest R giving aspect ≤ 2.6 (margin < 4:1)
        width, height, rows, diagram_w = _dims_for(_cand)
        if width / max(1.0, height) <= 2.6:
            break
    bus_x1 = diagram_w
    src_cx = (bus_x0 + bus_x1) / 2.0         # incomer centred over the folded bus

    svg = SVG(width, height)
    # faint border
    svg.rect(18, 18, width - 36, height - 36, stroke=GRID_FAINT, width=1.2)

    # ===== SOURCE / INCOMER (top) =====
    y = _draw_incomer(svg, src_cx, src_cy)
    # drop onto the main bus
    svg.line(src_cx, y, src_cx, bus_y, width=2.2, stroke=ACCENT)
    # label the INCOMER feeder (the real as-routed cable + its current) on the drop, so the
    # board's incoming way carries the converged size (e.g. '1,034 A · 240 mm²'), not blank.
    inc_a = getattr(main, "_incomer_current_a", None)
    inc_cable = getattr(main, "_incomer_cable", "")
    inc_bits = " · ".join(b for b in (_fmt_a(inc_a) if inc_a else "", inc_cable) if b)
    if inc_bits:
        svg.text(src_cx + 12, (y + bus_y) / 2, inc_bits, size=9.5, anchor="start",
                 fill=MUTED)

    # ===== FOLDED MAIN BUSBAR + BRANCHES =====
    # The switchboard bus is ONE bus drawn as R left-risered sections (a 30-feeder single
    # row is an unreadable strip). Per-feeder horizontal geometry is IDENTICAL to a single
    # row (band = span × col_w); only the rows are stacked + linked by a left riser.
    row_h = _row_heights(rows)
    row_y = []
    yy = bus_y
    for h_r in row_h:
        row_y.append(yy)
        yy += h_r
    content_bottom = bus_y
    spd_done = False
    for ri, row in enumerate(rows):
        by = row_y[ri]
        row_span = sum(sp for _, sp in row) or 1.0
        seg_x1 = bus_x0 + row_span * col_w
        # heavy bus segment for this section
        svg.line(bus_x0, by, seg_x1, by, stroke=BUS_INK, width=7.0, cap="butt")
        if ri == 0:
            # bus label (left) + Σ rating (right end), kept clear ABOVE the heavy line.
            svg.text(bus_x0, by - 28, main.tag, size=13, anchor="start", weight="bold",
                     fill=BUS_INK)
            binfo = " · ".join(b for b in (main.voltage, main.rating) if b)
            if binfo:
                svg.text(bus_x0, by - 14, binfo, size=10.5, anchor="start", fill=MUTED,
                         spacing="0.2")
            svg.text(seg_x1, by - 14, "Σ " + (main.rating or ""), size=10, anchor="end",
                     fill=MUTED)
        else:
            # left riser — the SAME switchboard bus, continued onto the next section.
            svg.line(bus_x0, row_y[ri - 1], bus_x0, by, stroke=BUS_INK, width=7.0,
                     cap="butt")
            svg.text(bus_x0 + 12, by - 12, "bus continued", size=8.5, anchor="start",
                     fill=MUTED)
        # SPD shunt once (a stub to earth on the bus, not a load tap).
        if not spd_done:
            shunts = getattr(tree, "_board_shunts", []) or []
            if any("surge" in s or "spd" in s for s in shunts):
                _draw_spd_shunt(svg, bus_x0 + 150, by)
            spd_done = True
        # feeders along this section — band = span × col_w (identical to a single row).
        cursor = bus_x0
        base_y = by + 70
        for br, sp in row:
            w_band = col_w * sp
            bx = cursor + w_band / 2.0
            cursor += w_band
            # tap line down from bus
            svg.line(bx, by, bx, base_y - 30, width=1.8)
            hdr = " · ".join(b for b in (br.rating, br.cable) if b)
            if hdr:
                svg.text(bx + 10, by + 26, hdr, size=9.3, anchor="start", fill=MUTED)
            if br.sub_bus is not None:
                bot = _draw_sub_distribution(svg, bx, base_y - 30, br, w_band)
            else:
                # in-line protective device(s)
                dev_end = base_y - 8
                if br.devices:
                    _device_chain(svg, bx, base_y - 30, dev_end, br.devices)
                else:
                    svg.line(bx, base_y - 30, bx, dev_end, width=1.8)  # plain conductor
                bot = sym_load(svg, bx, dev_end, w=min(178, col_w - 24),
                               label=br.label, rating=br.rating, cable=br.cable,
                               vd=br.voltdrop, count=br.count,
                               vd_flag=getattr(br, "_vd_flag", None))
            content_bottom = max(content_bottom, bot or base_y)

    # ===== LEGEND (lower-right of the body, above the title block) =====
    legend_y = min(content_bottom + 24, height - title_h - 170)
    legend_y = max(legend_y, bus_y + 24)
    _draw_legend(svg, bus_x1, legend_y)

    # ===== BOARD COMPONENTS & CONTROL-GEAR SCHEDULE (names the symbol-only devices) =====
    comps = _collect_board_components(state or {})
    if comps:
        strip_y = height - title_h - 150
        svg.text(30, strip_y, "BOARD COMPONENTS & CONTROL GEAR (schedule):", size=9.5,
                 weight="bold", fill=BUS_INK)
        # wrap into rows of ~3 across the width so the strip stays inside the free gap
        per_row = 3
        col_w = (width - 60) / per_row
        for i, name in enumerate(comps):
            rr = i // per_row
            cc = i % per_row
            svg.text(30 + cc * col_w, strip_y + 15 + rr * 13, "• " + name, size=8.6, fill=MUTED)

    # ===== TITLE BLOCK =====
    _draw_title_block(svg, tree, width, height, title_h)
    return svg.render()


def _draw_sub_distribution(svg: SVG, bx, y_from, br: Branch, col_w):
    """Draw: parent-bus tap → two-winding transformer (or a UPS for a control board) →
    SUB-BUSBAR → its load branches."""
    sub = br.sub_bus
    svg.line(bx, y_from, bx, y_from + 12, width=1.8)
    if getattr(br, "is_ups", False):
        # control / instrument sub-board fed via a UPS (no step-down transformer).
        ups_bot = sym_ups(svg, bx, y_from + 12, label_side="right",
                          kva="", detail="back-up supply")
        sub_bus_y = ups_bot + 22
        bot_anchor = ups_bot
    else:
        xfmr = getattr(br, "transformer", None)
        tag = xfmr.tag if xfmr else "TX"
        kva = xfmr.kva if xfmr else ""
        ratio = xfmr.ratio if xfmr else ""
        currents = xfmr.currents if xfmr else ""
        detail = xfmr.detail if xfmr else ""
        top_t, bot_t = sym_transformer(svg, bx, y_from + 12 + 30, label_side="right",
                                       tag=tag, kva=kva, ratio=ratio, currents=currents,
                                       detail=detail)
        sub_bus_y = bot_t[1] + 26
        bot_anchor = bot_t[1]
    # sub busbar — fit within the allocated band (`col_w` is this branch's band width),
    # leaving a margin so neighbouring branches / the legend never collide.
    sb = sub.branches
    sn = max(1, len(sb))
    band = max(160.0, col_w)
    sb_w = min(band - 40.0, 70.0 + sn * 96.0)
    sbx0 = bx - sb_w / 2
    sbx1 = bx + sb_w / 2
    svg.line(bx, bot_anchor, bx, sub_bus_y, width=2.0, stroke=ACCENT)
    svg.line(sbx0, sub_bus_y, sbx1, sub_bus_y, stroke=BUS_INK, width=5.5, cap="butt")
    svg.text(sbx0, sub_bus_y - 9, sub.tag, size=10.5, anchor="start", weight="bold",
             fill=BUS_INK)
    # sub branches — evenly pitched; each load box is sized to its pitch so labels in
    # adjacent boxes cannot overlap (the cramped-control-board smear fix).
    if sn == 1:
        sxs = [bx]
        pitch = sb_w
    else:
        edge = 36.0
        pitch = (sb_w - 2 * edge) / (sn - 1)
        sxs = [sbx0 + edge + pitch * i for i in range(sn)]
    load_w = max(78.0, min(120.0, (pitch if sn > 1 else sb_w) - 12.0))
    sbase = sub_bus_y + 54
    bottom = sbase
    for sx, sbr in zip(sxs, sb):
        svg.line(sx, sub_bus_y, sx, sbase - 26, width=1.6)
        dev_end = sbase - 6
        if sbr.devices:
            _device_chain(svg, sx, sbase - 26, dev_end, sbr.devices)
        else:
            svg.line(sx, sbase - 26, sx, dev_end, width=1.6)
        b = sym_load(svg, sx, dev_end, w=load_w, label=sbr.label, rating=sbr.rating,
                     cable=sbr.cable, vd=sbr.voltdrop, count=sbr.count, sub=True,
                     vd_flag=getattr(sbr, "_vd_flag", None))
        bottom = max(bottom, b or sbase)
    return bottom


def _draw_title_block(svg: SVG, tree: Tree, width, height, title_h):
    """Standard drawing title block — bottom strip with two panels: a description box
    (left) and a drawing-metadata box (right). Robust to narrow canvases."""
    y0 = height - title_h + 24
    x0 = 30
    x1 = width - 30
    svg.line(x0, y0, x1, y0, stroke=INK, width=1.6)

    # right metadata box first (fixed width), so the left panel takes the remainder.
    bw = 300
    bx0 = x1 - bw
    by0 = y0 + 14
    rows = [("DRAWING No.", "FF-SLD-001"),
            ("REV", _tb.REV),
            ("DATE", tree.date or "—  "),
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

    # left: project + drawing title + scope + notes
    svg.text(x0, y0 + 24, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(x0, y0 + 43, f"SINGLE-LINE DIAGRAM — {_humanise(tree.archetype)}",
             size=15, weight="bold", fill=BUS_INK)
    svg.text(x0, y0 + 61,
             "Scope: major electrical distribution as modelled "
             "(projected from the connection schedule).", size=9.5, fill=MUTED)
    ny = y0 + 79
    for note in (tree.notes or [])[:2]:
        svg.text(x0, ny, "• " + note, size=9.2, fill=MUTED)
        ny += 13
    svg.text(x0, ny + 2,
             "Auto-generated · drawn ForgeOS auto-projection · not for construction.",
             size=8.6, fill=MUTED)


def _draw_legend(svg: SVG, x_right, y_top):
    """Compact symbol legend in a boxed panel, drawn TOP-RIGHT of the diagram body so it
    never collides with the title block.  x_right = right edge to align the box to."""
    items = [
        ("breaker", "Circuit breaker"),
        ("isolator", "Isolator / disconnector"),
        ("contactor", "Contactor"),
        ("fuse", "Fuse"),
        ("rcd", "Protection relay"),
        (SYM_TRANSFORMER, "Two-winding transformer"),
        (SYM_SOURCE_GEN, "Standby generator"),
        ("ats", "Automatic transfer switch"),
        ("ups", "Uninterruptible power supply"),
        (SYM_LOAD, "Load / equipment"),
    ]
    bw, rowh = 188, 21
    bh = 20 + rowh * len(items)
    bx = x_right - bw
    svg.rect(bx, y_top, bw, bh, stroke=GRID_FAINT, width=1.2, fill=PANEL_BG, rx=3)
    svg.text(bx + 10, y_top + 15, "LEGEND", size=9.5, weight="bold", fill=MUTED)
    yy = y_top + 30
    gx = bx + 18
    for kind, lbl in items:
        if kind in _DEVICE_GLYPH:
            _DEVICE_GLYPH[kind](svg, gx, yy)
        elif kind == SYM_TRANSFORMER:
            # mini two-circle glyph
            svg.circle(gx, yy - 3, 5, stroke=INK, width=1.4)
            svg.circle(gx, yy + 3, 5, stroke=INK, width=1.4)
        elif kind == SYM_SOURCE_GEN:
            # mini 'G' source circle
            svg.circle(gx, yy, 7, stroke=INK, width=1.4)
            svg.text(gx, yy + 3, "G", size=8.5, anchor="middle", weight="bold", fill=INK)
        elif kind == "ats":
            # mini changeover: two upper dots, one wiper to a common lower terminal
            svg.circle(gx - 5, yy - 5, 1.6, fill=FILL_BG, stroke=DEV_INK, width=1.2)
            svg.circle(gx + 5, yy - 5, 1.6, fill=FILL_BG, stroke=DEV_INK, width=1.2)
            svg.circle(gx, yy + 5, 1.8, fill=DEV_INK, stroke=DEV_INK, width=1.0)
            svg.line(gx, yy + 5, gx - 5, yy - 5, stroke=DEV_INK, width=1.5)
            svg.line(gx, yy + 5, gx + 5, yy - 5, stroke=MUTED, width=1.1, dash="2,2")
        elif kind == "ups":
            # mini battery-box
            svg.rect(gx - 6, yy - 5, 12, 10, stroke=INK, width=1.3, fill=FILL_BG)
            svg.line(gx - 2, yy - 2, gx - 2, yy + 2, stroke=INK, width=1.6)
            svg.line(gx + 2, yy - 3, gx + 2, yy + 3, stroke=INK, width=1.6)
        elif kind == SYM_LOAD:
            svg.rect(gx - 6, yy - 5, 12, 10, stroke=INK, width=1.3, fill=FILL_BG)
        svg.text(gx + 16, yy + 3.5, lbl, size=8.8, fill=MUTED)
        yy += rowh


# ═══════════════════════════════════════════════════════════════════════════
# RASTERISATION  (SVG → PNG)
# ═══════════════════════════════════════════════════════════════════════════

def _svg_dims(svg_text: str):
    mw = re.search(r'<svg[^>]*\bwidth="([\d.]+)"', svg_text)
    mh = re.search(r'<svg[^>]*\bheight="([\d.]+)"', svg_text)
    return (int(math.ceil(float(mw.group(1)))) if mw else 1200,
            int(math.ceil(float(mh.group(1)))) if mh else 800)


def rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
    """SVG → PNG.  Tries, in order: cairosvg (py), rsvg-convert, headless Chrome.
    Returns True on success (PNG written)."""
    svg_text = svg_path.read_text()
    w, h = _svg_dims(svg_text)

    # 1) cairosvg
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=w * scale, output_height=h * scale,
                         background_color="white")
        if png_path.is_file() and png_path.stat().st_size > 1000:
            return True
    except Exception:
        pass

    # 2) rsvg-convert
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

    # 3) headless Chrome / Chromium screenshot.  window-size is the LOGICAL viewport
    #    (the SVG's intrinsic size); force-device-scale-factor does the upscaling, so the
    #    PNG comes out w*scale × h*scale with NO double-counting and NO extra whitespace.
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
            print(f"[sld] chrome rasterise failed: {ex}")

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

def generate_sld(out_dir: str, state_path: Optional[str] = None,
                 rasterise_png: bool = True):
    """Full pipeline: load → reconstruct → draw → write SVG (+ PNG).  Returns a dict
    summary (paths + node/symbol counts)."""
    schedule, state = load_inputs(out_dir, state_path)
    tree = reconstruct_tree(schedule, state)
    _sld_state = state
    # populate the title-block issue date deterministically from the run's artifacts.
    tree.date = _run_issue_date(out_dir)
    svg_text = build_sld_svg(tree, _sld_state)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "single-line-diagram.svg"
    png_path = draw_dir / "single-line-diagram.png"
    svg_path.write_text(svg_text)

    png_ok = False
    if rasterise_png:
        png_ok = rasterise(svg_path, png_path)

    summary = {
        "archetype": tree.archetype,
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "source": tree.source.tag,
        "main_bus": tree.main_bus.tag,
        "main_branches": len(tree.main_bus.branches),
        "sub_distributions": sum(1 for b in tree.main_bus.branches if b.sub_bus),
        "transformers": (1 if tree.incomer_transformer else 0)
                        + sum(1 for b in tree.main_bus.branches if b.sub_bus),
        "devices_in_diagram": _count_devices(tree),
        "loads": _count_loads(tree),
    }
    return summary, tree, svg_text


def _count_devices(tree: Tree):
    n = len(tree.incomer_devices or [])
    for br in tree.main_bus.branches:
        n += len(br.devices)
        if br.sub_bus:
            for sb in br.sub_bus.branches:
                n += len(sb.devices)
    return n


def _count_loads(tree: Tree):
    n = 0
    for br in tree.main_bus.branches:
        if br.sub_bus:
            n += sum(1 for _ in br.sub_bus.branches)
        elif br.target_sym == SYM_LOAD:
            n += 1
    return n


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, _tree, _svg = generate_sld(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[sld] ERROR: {ex}")
        return 2
    print(f"[sld] archetype       : {summary['archetype']}")
    print(f"[sld] source          : {summary['source']}")
    print(f"[sld] main bus        : {summary['main_bus']} "
          f"({summary['main_branches']} branches)")
    print(f"[sld] sub-distributions: {summary['sub_distributions']}")
    print(f"[sld] transformers    : {summary['transformers']}")
    print(f"[sld] devices drawn   : {summary['devices_in_diagram']}")
    print(f"[sld] loads drawn     : {summary['loads']}")
    print(f"[sld] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[sld] PNG → {summary['png']}")
    else:
        print("[sld] PNG not written (no rasteriser available — SVG is the master)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
