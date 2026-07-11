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


# ── LEDGER equipment quantities (the parts-manifest — same qty source the GA + P&ID use) ──
# A powered load can carry a ledger QTY > 1 (e.g. recirc_pump_count = 8 → 8 pump feeders),
# but the connection schedule emits ONE aggregate electrical edge per load name. The panel
# must enumerate the ledger qty so the connected load + the breaker count reflect the real
# plant — the divergence this fixes (one recirc-pump circuit shown for 8 × 132 kW motors).
# Universal: keyed on the parts-manifest qty by equipment NAME, never a per-class table.
def _load_equipment_qty(out_dir: Optional[str]) -> dict:
    """{equipment_name_lower: TOTAL count} from <out>/parts-manifest.json, SUMMED across all
    rows sharing a name. Robust to BOTH manifest representations of a multi-count load — a
    single qty-N row (1 row × qty 8) AND N replicated qty-1 instance rows (8 rows × qty 1).
    The parts-manifest now replicates principal MACHINES (recirc pumps / blowers) into N
    instance rows (so the qty_coverage gate + the GA/P&ID/3D show all N); a name-keyed COUNT
    is therefore correct where the old `qty > 1` filter silently dropped the qty-1 instance
    rows → the recirc-pump panel under-count (load_reconcile regression, 2026-06-18: panel
    966 vs 1454 kW). Backward-compatible: a 1-row qty-N load still sums to N; a genuine single
    sums to 1 (which _ledger_qty_for treats as 'no multiple'). Empty when no out_dir / no
    manifest (the panel then shows one way per electrical edge, the prior behaviour)."""
    if not out_dir:
        return {}
    try:
        pm = json.loads((Path(out_dir) / "parts-manifest.json").read_text())
    except Exception:
        return {}
    out: dict = {}
    for p in (pm.get("parts") or []):
        if not isinstance(p, dict):
            continue
        nm = (p.get("name") or "").strip().lower()
        if not nm:
            continue
        q = p.get("qty")
        q = int(q) if isinstance(q, (int, float)) and q >= 1 else 1
        out[nm] = out.get(nm, 0) + q
    return out


def _ledger_qty_for(base: str, equip_qty: dict) -> int:
    """The ledger qty for a circuit's destination load, matched on the equipment name. Tries
    an exact name match, then a tokens-subset match (so 'Recirc Pump' matches a manifest
    'Recirc Pump'); returns 1 when the ledger names no multiple. Universal — name-keyed."""
    if not equip_qty:
        return 1
    b = re.sub(r"\s*[×x]\s*\d+\s*$", "", (base or "")).strip().lower()
    if not b:
        return 1
    if b in equip_qty:
        return equip_qty[b]
    btoks = {t for t in re.split(r"[^a-z0-9]+", b) if len(t) >= 3}
    if not btoks:
        return 1
    best = 1
    for nm, q in equip_qty.items():
        ntoks = {t for t in re.split(r"[^a-z0-9]+", nm) if len(t) >= 3}
        # the circuit-name tokens must all be in the manifest name (so 'Recirc Pump' ⊆
        # 'Recirc Pump', but a bare 'Pump' does not greedily grab the 8-off recirc pumps).
        if btoks and btoks <= ntoks:
            best = max(best, q)
    return best


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


def size_circuit_from_kw(kw, voltage_v, is_dc=False, phases=3, resistive=False):
    """The full load-derived sizing of ONE powered circuit from its connected kW:
    (design_a=FLC, cable_csa_mm2, cable_label, breaker_frame_a). The protective device is
    the next standard frame ≥ FLC (an MCB/MCCB must carry the design current continuously);
    the cable is sized to ≥ FLC × 1.25. Returns (None, None, '', None) when no kW/V.

    resistive=True (an immersion / resistance heater, heating element, heat-trace): the FLC is
    drawn at UNITY power factor and no motor-efficiency penalty (I = P/(√3·V)). Sizing a
    resistive load with the induction-motor pf/η defaults over-states its current ~31% (a
    1,027 kW immersion heater is 1,482 A at unity, not 1,938 A) → an oversized breaker + cable."""
    flc = flc_from_kw(kw, voltage_v, is_dc=is_dc, phases=phases,
                      **({"pf": 1.0, "eta": 1.0} if resistive else {}))
    if flc is None:
        return None, None, "", None
    csa, label = size_cable_csa(flc)
    frame = _next_frame(flc)
    return round(flc, 1), csa, label, frame


_RHO_CU_OP = 0.0225      # Ω·mm²/m — copper at ~70 °C conductor operating temperature
#                          (the BS 7671 mV/A/m tabulated basis, not the 20 °C 0.0172)
_VD_LIMIT_PCT = 5.0      # BS 7671 Appendix 4 volt-drop band for power circuits


def voltdrop_pct_from_run(length_m, cable_label, design_a, voltage_v,
                          is_dc=False, phases=3):
    """ΔU% over the ROUTED cable length at the circuit's Design I on its FINAL cable —
    the at-source volt-drop the schedule prints (and the workbook column contract
    re-verifies as f(length, CSA, Design I)).

      3-phase AC : ΔU = √3 · I · ρ · L / CSA   (line-to-line drop)
      1-ph / DC  : ΔU = 2 · I · ρ · L / CSA   (go-and-return)

    A parallel group ('3×400 mm²') divides the loop resistance by n. Returns None when
    any input is missing — the schedule then shows a dash, which the column contract
    honestly FAILS (a dash is never in-spec). Universal — pure arithmetic on the
    routed length, no product class."""
    if not length_m or not design_a or not voltage_v:
        return None
    m = re.search(r"(?:(\d+)\s*[×x]\s*)?([\d.]+)\s*mm²", str(cable_label or ""))
    if not m:
        return None
    n_par = int(m.group(1) or 1)
    csa = float(m.group(2))
    if csa <= 0 or n_par <= 0:
        return None
    r_path = _RHO_CU_OP * float(length_m) / (csa * n_par)   # Ω per conductor path
    k = 2.0 if (is_dc or phases < 3) else math.sqrt(3.0)
    vd_v = k * float(design_a) * r_path
    return round(100.0 * vd_v / float(voltage_v), 3)


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
    coincident: bool = True  # False ⇒ a standby/backup load OR a duplicate of an already-counted
    #                          item: SHOWN as a circuit (bus + breaker must carry it) but NOT
    #                          added to the RUNNING connected-load total (reconciles to physics
    #                          connected_electrical_load_kw, which is the coincident running load).
    duplicate: bool = False  # True ⇒ the SAME physical equipment emitted under another name —
    #                          excluded from BOTH the kW total AND the Σ-current (not really
    #                          installed twice). A standby load (coincident=False, duplicate=False)
    #                          keeps its current in Σ-current (the bus must carry it on a fault).


@dataclass
class Panel:
    board_id: str            # node tag (switchgear / switchgear_subdist / control)
    name: str                # human board name, e.g. 'MAIN SWITCHBOARD'
    kind: str = "main"      # 'main' | 'sub'
    supply: str = ""        # supply source description
    system: str = ""        # system voltage / phases, e.g. '400 V 3-phase + N' / '800 V DC'
    busbar_a: Optional[float] = None        # busbar continuous CURRENT (measured/derived), A
    busbar_rating_a: Optional[float] = None # busbar RATING — next BS-EN-60947 frame ≥ demand,
    #                                          A. Distinct from busbar_a: a RATING is the
    #                                          equipment the board is BUILT to (e.g. a 100 A
    #                                          frame), never a bare echo of the DEMAND current
    #                                          (e.g. 87 A) — see _set_busbar_rating().
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
# A routed CONNECTION row ('<medium> connection: A → B · NN kW') carries a TRANSFER duty between
# TWO pieces of equipment (e.g. 'water connection: electric steam generator → distillation
# reboiler · 49.22 kW' = the THERMAL steam duty delivered to the reboiler), never either
# endpoint's own electrical rating. A token-overlap match (both 'name' resolvers below match on
# head-noun subset) lets a device's name appear in a connection row it's merely one endpoint of,
# misattributing the transfer duty as that device's OWN draw — confirmed on the CO2-campaign-v7
# panel, where 'Electric steam generator' inherited this row's 49.22 kW instead of its real
# electrical-input rating. Universal — keyed on the connection-row SHAPE, never a product class.
def _is_connection_row_head(head: str) -> bool:
    return bool(re.match(r"\s*\w[\w /-]*\bconnection\b\s*:", head) or "→" in head or "->" in head)
# A motor circuit's CONNECTED (absorbed) electrical load is the SHAFT power, not the motor
# NAMEPLATE rating. The requirementsBom states both for a sized drive, e.g. 'Circulation Pump
# · 132 kW motor (94 kW shaft)' — the 132 is the frame the motor is BUILT on (the next standard
# size up from the duty), the 94 is what the pump actually absorbs and therefore the connected
# load the board sees. Reading the first '· NN kW' (132) over-states every motor circuit by the
# motor-sizing margin (here 1.4×). Prefer the parenthesised shaft/absorbed/input figure — but
# ONLY for a genuine MOTOR-driven load (a heater / transformer / UPS has no shaft power and its
# first '· NN kW' IS its connected load). Universal — keyed on the equipment NOUN, not a class.
_SHAFT_KW_RE = re.compile(r"\(\s*([\d.,]+)\s*kW\s*(?:shaft|absorbed|input|abs)\b", re.I)
_MOTOR_LOAD_RE = re.compile(
    r"pump|fan\b|blower|compressor|\bmotor\b|mixer|agitator|stirrer|conveyor|auger|"
    r"screw\b|centrifuge|\bdrive\b|extract|ventilat", re.I)
# A STANDBY / BACKUP / EMERGENCY load is NOT coincident with the running plant: a backup
# immersion heater, a standby pump, an emergency element only energises on a fault / cold-start,
# so it must NOT be added to the RUNNING connected-load total (which reconciles to the physics
# connected_electrical_load_kw). It is still SHOWN as a circuit (the board bus + its own breaker
# must be rated for it) but flagged non-coincident and excluded from the totals sum. Universal —
# keyed on the standby/backup NAMING, never a product class.
_STANDBY_LOAD_RE = re.compile(
    r"\bback-?up\b|\bstand-?by\b|\bemergency\b|\bspare\b|\bredundant\b", re.I)
# An AUXILIARY load is an instrument / control / monitoring loop or a small actuated device
# (analyser, transmitter, probe, gauge, flow/level meter, PLC, SCADA, gateway, network switch,
# I/O, controller PSU, a solenoid / actuated control valve). Its real draw is a loop load of
# tens of watts, NOT a duty-fraction of the plant's principal motor. When such a circuit has NO
# published kW in the ledger, the duty-type ESTIMATE (_panel_type_kw) wrongly scales it off the
# principal motor (e.g. a 'Dissolved-Oxygen Analyser' hitting the oxygen/aeration 0.10 fraction
# of a 220 kW anchor → an absurd 22 kW). Bound such an aux circuit to a small fixed load instead.
# Universal — keyed on the instrument/control NOUN, never a product class.
_AUX_LOAD_RE = re.compile(
    r"analy[sz]|monitor|sensor|transmitter|\bprobe\b|gauge|flow\s*meter|level\s*meter|"
    r"\bmeter\b|instrument|controller|\bplc\b|scada|gateway|\bnetwork\b|switch\b|\bi/?o\b|"
    r"\bups\b|control\s*system|power\s*supply|\bvalve\b|actuat|solenoid|damper", re.I)
# A bounded aux circuit load [kW]: an instrument loop / actuated valve / small control device.
# Conservative single value — enough to size a 6–10 A final circuit, never a process driver.
_AUX_CIRCUIT_KW = 0.5
# A PURE SENSING INSTRUMENT (analyser / monitor / sensor / transmitter / probe / gauge / meter /
# transmittance / intensity / turbidity loop) is ALWAYS a tens-of-watts loop load — it must never
# inherit a process unit's kW via a shared name token (e.g. a 'UV Transmittance Monitor' borrowing
# the UV reactor's kW because both contain 'uv'). It is bounded to the aux load BEFORE the ledger
# resolution runs. Universal — keyed on the sensing-instrument noun, never a product class.
_INSTRUMENT_LOAD_RE = re.compile(
    r"analy[sz]|\bmonitor\b|\bsensor\b|transmitter|transmittance|\bprobe\b|gauge|"
    r"\bmeter\b|intensity|turbidity|\binstrument\b", re.I)
# A RESISTIVE-HEATING load (immersion / resistance heater, heating element, heat-trace,
# electrode boiler) draws its full-load current at UNITY power factor and no motor-efficiency
# penalty. It must be sized at pf=1.0/η=1.0, NOT the induction-motor defaults (which over-state
# a 1 MW immersion heater's current ~31%). Universal — keyed on the resistive-heating noun.
# Excludes a HEAT PUMP (a motor-driven refrigeration unit, not a resistive element).
_RESISTIVE_LOAD_RE = re.compile(
    r"immersion|resistance\s*heat|heating\s*element|\belement\b|heat[\s-]?trace|"
    r"electrode\s*boiler|resistive|trace\s*heat", re.I)


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
        if _is_connection_row_head(head):
            continue                       # A→B transfer duty, not either endpoint's own draw
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
        # CONNECTED load = the SHAFT/absorbed power for a motor-driven load (the pump/fan/etc.
        # actually draws its shaft power ÷ η, NOT the next-frame-up motor NAMEPLATE). Prefer the
        # parenthesised '(NN kW shaft)' for a motor load; otherwise (heater/UPS/transformer, or a
        # motor with no stated shaft figure) take the item's own first '· NN kW'.
        shaft = _SHAFT_KW_RE.search(req)
        if shaft is not None and _MOTOR_LOAD_RE.search(name):
            m = shaft
        else:
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


def _panel_motor_nameplate_kw(name: str, state: dict) -> Optional[float]:
    """The motor NAMEPLATE rating [kW] for a motor circuit — the '· NN kW [motor]' frame figure
    (the first '· NN kW'), NOT the parenthesised absorbed shaft power. Used to size a motor's
    protective device + cable to the motor full-load current (IEC 60947-4-1). Returns None when no
    matching ledger row carries a nameplate kW. Universal — keyed on the requirement head noun."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list) or not rb:
        return None
    t_toks = set(_norm_load_name(name).split())
    if not t_toks:
        return None
    best = None
    for row in rb:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "")
        head = req.split("·", 1)[0]
        if _is_connection_row_head(head):
            continue                       # A→B transfer duty, not either endpoint's own draw
        h_toks = set(_norm_load_name(head).split())
        if not h_toks or len(t_toks & h_toks) < len(t_toks):
            continue
        if _WHOLE_PLANT_KW_RE.search(req):
            continue
        m = _OWN_KW_RE.search(req)        # the NAMEPLATE (first '· NN kW'), never the shaft
        if not m:
            continue
        try:
            kw = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        if kw <= 0:
            continue
        ov = len(t_toks & h_toks)
        if best is None or ov > best[0]:
            best = (ov, kw)
    return best[1] if best else None


# A DISTRIBUTION/SWITCHGEAR ASSEMBLY (motor control centre / MCC, distribution board,
# switchboard, switchgear, busbar) HOUSES motor starters but is not itself a motor — yet its
# head noun contains the substring 'motor' ('motor control centre') so the anchor regex below
# would otherwise match it. Its own '· NN kW' figure is a BUSBAR/BOARD rating (or, as seen on
# the CO2 mineralisation run, a rating-BASIS placeholder used purely to PRICE the switchboard via
# a generic '£/kW as if it were a motor' costing rule — 'motor control centre · 750 kW' — never
# an actual shaft/nameplate duty). Reading it as "the plant's principal motor load" corrupts every
# downstream duty-fraction estimate that falls back to _panel_type_kw (e.g. a 250 m³/h ATEX
# extract fan inflated to 90 kW, a passive static mixer inflated to 60 kW) — the root cause of the
# CO2-campaign-v7 load_reconcile failure (panel total inflated to 846 kW vs the grounded 87 kW
# contract load). Universal — keyed on the ASSEMBLY noun, never a product class.
_SWITCHGEAR_ASSEMBLY_RE = re.compile(
    r"\bmotor control cent(?:re|er)\b|\bmcc\b|distribution board|switchboard|switchgear|"
    r"\bbusbar\b", re.I)


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
            if _is_connection_row_head(head):
                continue
            # A switchgear/distribution ASSEMBLY (motor control centre, switchboard, busbar) is
            # never itself a motor, even though 'motor control centre' contains 'motor' — see
            # _SWITCHGEAR_ASSEMBLY_RE above.
            if _SWITCHGEAR_ASSEMBLY_RE.search(head):
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


# Generic head-noun tokens shared by many loads — stripped before any token-set match so two
# genuinely-distinct machines never collide on a shared word (pump/tank/unit/system…). Module-
# level so both the ledger-kW resolver and the panel coincidence parent-subsumed check use it.
_GENERIC_TOK = {"supply", "system", "demand", "total", "connected", "plant", "site",
                "load", "unit", "process", "main", "aux", "auxiliary", "electrical",
                "power", "design", "rated", "the", "and", "for"}


def _panel_resolve_ledger_kw(name: str, state: dict) -> Optional[float]:
    """Resolve ONE circuit's connected load [kW] from the LEDGER ONLY: the equipment's own
    published electrical kW in requirementsBom (shaft-preferred for motors), else a matching
    contract '*_kw' quantity. Returns the kW, or None when the ledger does not price this item
    (the caller then applies the aux bound for an instrument, or the duty-type estimate for
    process equipment). Deliberately does NOT fall through to the duty-type estimate so an aux
    instrument circuit is not scaled off the principal motor."""
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
    _AGG_KEY = re.compile(r"total_supply_demand|connected_electrical_load|"
                          r"total_(?:installed|connected)|plant_(?:load|demand)|"
                          r"site_(?:load|demand)|peak_demand", re.I)
    btoks = set(_norm_load_name(base).split()) - _GENERIC_TOK
    best: Optional[tuple[int, float]] = None
    if btoks:
        for k, v in q.items():
            kl = k.lower()
            if not kl.endswith("_kw") or _AGG_KEY.search(kl):
                continue
            # NOTE 2026-07-06: was 'duty(?!_)' — a negative lookahead that can NEVER fire against
            # the overwhelmingly common '..._duty_kw' key shape (duty is ALWAYS immediately
            # followed by '_kw' there), so it silently failed to exclude a single real thermal-duty
            # quantity. Root cause of the CO2-campaign-v7 load_reconcile failure: the MEA
            # lean/rich cross-exchanger's THERMAL duty ('lean_rich_cross_exchanger_duty_kw' =
            # 43.6 kW) leaked into the unrelated 'dryer exhaust heat-recovery exchanger' circuit
            # purely because both share the token 'exchanger'. Plain 'duty' correctly excludes
            # every '*_duty_kw' thermal/process quantity (the elec/motor/drive/compressor/fan/pump
            # escape hatch below still lets a genuinely-electrical '*_duty_kw' through).
            if re.search(r"thermal|cooling|heating|dissipation|rejection|duty|"
                         r"recover|capacity|loss", kl) and not re.search(r"elec|motor|drive|"
                         r"compressor|fan|pump", kl):
                continue                       # a *_recovery_kw / heat-recovery duty is THERMAL,
                #                                not the fan's electrical draw (HRV 941 kW bug)
            ktoks = set(re.split(r"[_\s]+", kl.replace("_kw", ""))) - _GENERIC_TOK
            if not btoks or not ktoks:
                continue
            # NOTE 2026-07-06: was 'any shared token' (btoks & ktoks) — too weak once the CO2
            # contract carries several similarly-worded packaging/drying quantities: 'dryer exhaust
            # heat-recovery exchanger' matched 'dryer_air_heater_battery_kw' on the single shared
            # token 'dryer' (67.5 kW misattributed), and 'bag-mouth pre-heater' matched
            # 'hot_air_process_heater_kw' on the single shared token 'heater' (150 kW
            # misattributed) — the SAME false-positive class as the switchgear/duty-regex bugs
            # above, just against multi-word contract keys instead of BoM rows. Require a FULL
            # SUBSET match in either direction (mirrors _panel_req_bom_kw's discipline) so two
            # genuinely-distinct pieces of equipment sharing one generic noun never collide;
            # among qualifying candidates, prefer the LARGEST (most specific) overlap.
            if not (btoks <= ktoks or ktoks <= btoks):
                continue
            val = v.get("value") if isinstance(v, dict) else v
            try:
                val = float(val)
            except (TypeError, ValueError):
                continue
            if val <= 0:
                continue
            overlap = len(btoks & ktoks)
            if best is None or overlap > best[0]:
                best = (overlap, val)
    return best[1] if best else None       # ledger does not price this item — caller decides aux bound vs estimate


def _equipment_dup_sig(name: str, kw: Optional[float], ways: int,
                       state: dict) -> Optional[str]:
    """A de-duplication signature for a circuit's destination equipment, so the SAME physical
    plant emitted under two circuit names is counted once. The signature is the requirementsBom
    requirement TAIL (everything after the head noun — the rating + dimensions string, which is
    byte-identical for the same physical item, e.g. '132 kW motor (94 kW shaft) · 1176x1000x1294
    mm' shared by both 'Circulation Pump' and 'Recirc Pump') combined with the per-way kW + the
    way count. Returns None when the equipment carries no substantial, ledger-priced spec (a
    small aux instrument or an un-priced load is never deduped — only real equipment with an
    identical engineering spec). Universal — keyed on the ledger spec, never a product class."""
    # only dedup substantial, ledger-priced equipment (an aux/instrument or a tiny load is left
    # alone — two genuinely-separate small loops must each be counted).
    if not kw or kw <= _AUX_CIRCUIT_KW:
        return None
    base = re.sub(r"\s*[×x]\s*\d+\s*$", "", name or "").strip()
    target = set(_norm_load_name(base).split())
    if not target:
        return None
    rb = state.get("requirementsBom")
    if not isinstance(rb, list):
        return None
    best = None       # (overlap, tail)
    for row in rb:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "")
        if "·" not in req:
            continue
        head, tail = req.split("·", 1)
        h = set(_norm_load_name(head).split())
        if not h or len(target & h) < len(target):
            continue                     # circuit-name tokens must all be in the requirement head
        if _WHOLE_PLANT_KW_RE.search(req) or "→" in head or "connection" in head.lower():
            continue                     # a routed connection row is a transfer duty, not equipment
        ov = len(target & h)
        if best is None or ov > best[0]:
            best = (ov, " ".join(tail.split()).lower())
    if best is None:
        return None
    return f"{best[1]}|{round(kw, 1)}|{ways}"


# ═══════════════════════════════════════════════════════════════════════════
# SCHEDULE RECONSTRUCTION
# ═══════════════════════════════════════════════════════════════════════════

def build_schedules(schedule: dict, state: dict,
                    out_dir: Optional[str] = None) -> list[Panel]:
    """Group the electrical circuits into per-board panel schedules.

    Boards:
      - MAIN board = the node that feeds the most outgoing circuits (the fan-out hub:
        'switchgear' for BESS, 'control' for VF).  In the D2-actuated case the hub is the
        '<x>_subdist' node and the MAIN board is whatever feeds IT.
      - SUB board   = every distinct '<x>_subdist' node — its own schedule.
    """
    rows = _electrical_rows(schedule)
    devices = extract_devices(state)
    # LEDGER equipment quantities (parts-manifest) — so a circuit to an N-off load enumerates
    # N feeders (8 recirc pumps), not one. Empty when no out_dir / manifest (prior behaviour).
    equip_qty = _load_equipment_qty(out_dir)
    # Stash the qty-expanded parts-manifest on state so the MAIN board can synthesise ONE outgoing
    # circuit PER driven equipment item (the real panel schedule) instead of per-module — mirrors the
    # single-line. Without this the schedule shows module circuits and under-covers the principal
    # parts (Codema: panel-schedule part-coverage 64%). Best-effort; falls back when absent. 2026-07-01.
    if out_dir and not (state.get("_parts_manifest") or {}).get("parts"):
        try:
            state["_parts_manifest"] = json.loads((Path(out_dir) / "parts-manifest.json").read_text())
        except Exception:  # noqa: BLE001
            pass
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
        _fill_circuits(main, main_hub, rows, devices, state, equip_qty)
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
        _fill_circuits(sub, sd, rows, devices, state, equip_qty)
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


# ── ONE-MINT electrical-consumer breakdown (load_reconcile fix, 2026-07-06) ───────────
# A canonical `electrical_consumer__<name>_kw` quantity family: one entry per REAL
# electrical consumer in the plant, each counted ONCE, published by the archetype's
# engineering-contract builder (e.g. co2_mineralisation) from the SAME array it derives
# `connected_electrical_load_kw` from — see scripts/lib/engineering-contract.ts.
_ELEC_CONSUMER_BREAKDOWN_RE = re.compile(r"^electrical_consumer__(.+)_kw$")


def _electrical_consumer_breakdown_feeders(quantities: dict, voltage_v: float) -> list:
    """Build the panel feeder list DIRECTLY from the ONE-MINT electrical-consumer
    breakdown when the engineering contract publishes one, instead of re-deriving
    per-item kW by fuzzy name-matching against the full `quantities` dict
    (edm.synthesise_equipment_feeders / _equip_kw_from_quantities).

    WHY: on a fresh chain run, `quantities` also carries process-tool-computed THERMAL
    DUTY figures under similar-sounding keys that the archetype builder does not own
    (e.g. a `k2so4_crystalliser_duty_kw` independently recomputed by a sizing tool,
    alongside the builder's own `k2so4_crystalliser_evap_kw`) — a name-overlap matcher
    can pick up the wrong one of two similarly-shaped kW quantities, or a per-item
    rating that is ALSO folded into a fleet total elsewhere, and that risk changes from
    run to run because the tool-computed duties are not the archetype's constants. This
    was the root of the co2_mineralisation load_reconcile divergence (panel 886 kW vs
    contract 559 kW, out/co2-campaign-v9) surviving three independent patch attempts.

    Reading the SAME published array both `connected_electrical_load_kw` and this
    feeder list derive from GUARANTEES Σ feeders == connected_electrical_load_kw BY
    CONSTRUCTION, for any consumer added, removed, or rescaled — there is no
    independent re-derivation left to diverge.

    Returns [] when no archetype has published the breakdown (every OTHER product
    class today) — the caller then falls back to the existing heuristic synthesis,
    unchanged (a byte-identical no-op for water/BESS/SAF/etc).

    NB: mirrored verbatim in draw_single_line.py (this file pair doesn't share a
    helper module for per-file feeder-list logic — see the existing precedent of
    `_known_module_loads`, independently defined in both files); fix the sister copy
    too if you change this."""
    entries: list[tuple[str, float]] = []
    for k, v in (quantities or {}).items():
        m = _ELEC_CONSUMER_BREAKDOWN_RE.match(k.lower())
        if not m:
            continue
        val = v.get("value") if isinstance(v, dict) else v
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        name = m.group(1).replace("_", " ").strip().title()
        entries.append((name, val))
    if not entries:
        return []
    # stable, deterministic order: largest load first, then name (matches the
    # existing feeder-list convention of leading with the driven/major loads).
    entries.sort(key=lambda e: (-e[1], e[0]))
    feeders = []
    for name, kw in entries:
        i_a = edm._3ph_current_a(kw, voltage_v) if kw > 0 else 0.0
        lbl, isb = edm._cable_or_busbar_label(i_a)
        feeders.append(edm.Feeder(name=name, load_kw=round(kw, 2) if kw else None,
                                  current_a=round(i_a, 1), size_label=lbl,
                                  voltage_v=voltage_v, is_busbar=isb, note=""))
    return feeders


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
    # PREFER one outgoing circuit PER driven equipment item (pump/blower/panel) from the qty-expanded
    # parts-manifest — the real panel schedule a plant has — mirroring the single-line. Falls back to
    # the per-module split when the manifest is absent or yields nothing. 2026-07-01 (panel-coverage fix).
    parts = ((state.get("_parts_manifest") or {}).get("parts")) or []
    quantities = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict) and q:
            quantities = q
            break
    # ONE-MINT breakdown FIRST (2026-07-06 load_reconcile fix): when the contract
    # publishes an explicit electrical_consumer__*_kw list, it IS the plant's real
    # electrical consumers — use it directly so the panel total reconciles to
    # connected_electrical_load_kw by construction. Absent for every other archetype
    # today, so this is a no-op fall-through to the existing heuristic synthesis.
    feeders = _electrical_consumer_breakdown_feeders(quantities, plan.board_voltage_v)
    if feeders:
        # ONE MINT, WHOLE BOARD (2026-07-11 run 60: the circuits honestly summed 1 A
        # while the board header still printed 'demand 162 A / rating 200 A / ≈45 kW'
        # from the legacy lumped derivation — an internal contradiction on one sheet).
        # When the breakdown drives the circuits, it drives the BOARD figures too:
        # demand = Σ circuit currents; rating = the next standard frame with margin,
        # floored at a real 6 A device.
        _sum_a = sum(float(f.current_a or 0) for f in feeders)
        _sum_kw = sum(float(f.load_kw or 0) for f in feeders)
        plan.board_current_a = max(6.0, _sum_a * 1.25)
        plan.connected_load_kw = _sum_kw
    if not feeders and parts:
        feeders = edm.synthesise_equipment_feeders(
            plan.board_current_a, plan.board_voltage_v, parts,
            total_load_kw=plan.connected_load_kw, quantities=quantities)
    if not feeders:
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
    r"\bsurge\s*protect(or|ion)?\b|surge\s*arrest(er|or)?\b|\bspd\b|"
    # 2026-07-11 run 60: the sealed-product vocabulary defeated every token — 'Main AC
    # Breaker' has a phase word inside 'main breaker'; bare 'DC Fuses' is a protective
    # position not a load; 'AC Filter Inductors' are PCS bus internals; 'Surge Apparent
    # Power' is a QUANTITY phantom. All board-work, never outgoing circuits.
    r"\bfuses?\b|main\s+\w{0,3}\s*breaker|\bfilter\s+inductors?\b|apparent\s+power|"
    r"main\s*breaker|main\s*incomer|\bincomer\b|main\s*isolator", re.I)
# A way whose name brushes a board-infra token but is a real consuming load we must keep
# (e.g. a 'busbar trunking RISER feeding a sub-board' — rare; belt-and-braces).
_BOARD_INFRA_KEEP = re.compile(r"riser|trunking\s*run|busway\s*feeder", re.I)


# A PASSIVE process internal — filter / column MEDIA, biofilm CARRIER, random/structured PACKING,
# tower FILL, MESH panels, a SUBSTRATE — has no motor and draws no power: it must never appear as
# an electrical load way (the MBBR 'Biofilm Carrier Media' + the 'Media / Mesh Panels' sub-component
# each picking up a default duty kW). The ACTIVE duty that fluidises / aerates the media is a
# SEPARATE blower / pump circuit that is itself a real load. Universal — keyed on the passive-
# internal noun, never a product class.
_PASSIVE_NONELECTRICAL_RE = re.compile(
    r"\bmedia\b|\bcarrier\b|\bpacking\b|\bfill\b|random\s*pack|structured\s*pack|"
    r"\bmesh\b|\bsubstrate\b|biofilm\s*carrier", re.I)


def _is_passive_nonelectrical(node: str) -> bool:
    """True when an outgoing-circuit destination is a PASSIVE process internal (media / packing /
    fill / mesh / substrate) that draws no power — it must be excluded from the load (circuit)
    rows. A node that names a passive internal BUT also a real driven device ('media transfer
    pump', 'fill blower') is NOT passive and is kept."""
    n = node or ""
    if not _PASSIVE_NONELECTRICAL_RE.search(n):
        return False
    if _MOTOR_LOAD_RE.search(n):            # 'media transfer pump' / 'fill blower' = a real driver
        return False
    return True


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
    name = _board_name(board_id, kind, is_dc=is_dc)
    return Panel(board_id=board_id, name=name, kind=kind, system=system,
                 voltage_v=voltage_v, is_dc=is_dc, phases=phases)


def _board_name(board_id: str, kind: str, is_mv: bool = False, is_dc: bool = False) -> str:
    """Delegates to edm.canonical_board_name — the ONE MINT shared with draw_single_line's
    main-bus tagging (J101, 2026-07-03) so the schedule heading and the SLD tag can never
    diverge for the same board. `_humanise` is passed through as the caller-local
    tag→title-case function (edm stays pure logic, no drawer-specific string convention)."""
    return edm.canonical_board_name(board_id, kind, is_mv=is_mv, is_dc=is_dc,
                                    humanise=_humanise)


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

def _dominant_default_amps(amps: list) -> Optional[float]:
    """A WHOLESALE FALLBACK current is the SAME value inherited by MANY un-sized rows (e.g.
    27.4 A on every outgoing circuit, or 4.2 A repeated verbatim across trunk + branch rows
    of the connection schedule) — detected by its DOMINANCE (≥3 occurrences AND >30% share of
    the readings), never by a fixed magnitude cap (a genuine large current recurring on
    identical parallel feeders — e.g. 1953 A battery-rack busbars collapsed to one row ×N —
    is NOT repeated across many distinct rows, so it never trips this). Shared by
    `_fill_circuits` (per-board outgoing-circuit sizing, the original 2026-07-02 use) and
    `_set_incoming` (the schedule-wide guard on a MAIN board's incoming-feeder reading,
    2026-07-03) so both sides of the amps-from-kW fix read the SAME dominance signal."""
    if not amps:
        return None
    from collections import Counter
    val, n = Counter(amps).most_common(1)[0]
    if n >= 3 and n / len(amps) > 0.30:
        return val
    return None


def _dedup_row_amps_for_schedule(rows) -> list:
    """One amps reading PER DISTINCT (from, to-base, role) edge — the SAME rack/tap
    collapsing `_fill_circuits` already applies per board — so the schedule-WIDE dominant-
    default detector (`_set_incoming` / `_set_sub_incoming`) compares like-for-like samples.
    Without this, a single board's own large fan-out (e.g. 13 rack branches all inheriting
    one placeholder current) out-votes the value that is ACTUALLY the schedule-wide
    placeholder (recurring once per distinct edge across every other board) purely because
    it has more raw ROWS — a BESS-class regression (2026-07-05 J98 board-recon fix): 13×
    1.2 A rack branches out-voted the 8 distinct 15 A placeholder edges, so the schedule-wide
    default resolved to 1.2 A instead of 15 A and the MAIN board's stale-default guard never
    fired. Universal — keyed on the topology's own from/to shape, never a product class."""
    groups: dict = {}
    for r in rows:
        to = r.get("to") or ""
        m = _RACK_TAP_RE.match(to)
        base = m.group(1) if m else to
        key = (r.get("from"), base, r.get("role"))
        if key in groups:
            continue
        a = _row_amps(r)
        if a and a > 0:
            groups[key] = a
    return list(groups.values())


# The SAME pass/review tolerance `reconcile()` renders (Σ circuit current within 0.85-1.25×
# the board's stated demand) is the ONE MINT used to decide whether a raw schedule reading is
# trustworthy enough to keep, or is a stale placeholder that must yield to the board's own
# circuits (Codema J98 discipline: a board's demand is judged by ONE rule regardless of
# board TYPE, so a MAIN board and a SUB/AUX board can never disagree on what counts as
# "reconciled"). Defined once here; `reconcile()` re-uses the same tuple for its verdict.
_RECON_BAND = (0.85, 1.25)


def _demand_needs_circuit_override(raw_a: Optional[float], downstream_a: Optional[float],
                                   schedule_default_a: Optional[float]) -> bool:
    """True when a board's raw demand reading is PROVABLY a stale schedule-wide placeholder:
    it equals the schedule's own dominant default AND trusting it would fail the identical
    reconciliation band `reconcile()` renders. This is the ONE test both `_set_incoming`
    (MAIN board) and `_set_sub_incoming` (SUB/AUX board) call — before this fix only the MAIN
    board carried the guard, so a SUB board (e.g. a BESS 'BMS ctrl' aux board) whose own
    busway-trunk row happened to carry the same 15 A schedule-wide placeholder as everywhere
    else locked onto a 16 A busbar rating while its own circuits (13 rack feeders) demanded
    1,685 A — a REVIEW ratio of 112× instead of the true reconciled 1.0×. Root cause fixed at
    the RULE (both callers), not the one BESS instance."""
    if raw_a is None or not downstream_a or schedule_default_a is None:
        return False
    if round(raw_a, 1) != round(schedule_default_a, 1):
        return False
    lo, hi = _RECON_BAND
    ratio = downstream_a / raw_a
    return not (lo <= ratio <= hi)


def _fill_circuits(panel: Panel, board_id: str, rows, devices, state,
                   equip_qty: Optional[dict] = None):
    """Build the outgoing-circuit rows for a board: every row whose `from` is this board
    (excluding the internal '(busway)'/'(local busway)' pseudo-trunk and the transformer
    rows).  Identical rack fan-out ways collapse to ONE row annotated '× N ways'.

    `equip_qty` ({equipment_name_lower: qty}, from the parts-manifest) lets a circuit to an
    N-off load ENUMERATE its N feeders even when the connection schedule emitted one lumped
    electrical edge for it — so 8 recirc pumps show as a ×8 way (per-way + total load), the
    panel total reflecting the real connected load. Universal: the qty is the LEDGER qty."""
    equip_qty = equip_qty or {}
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
        if _is_passive_nonelectrical(to):
            continue                      # filter/column media, packing, fill — passive, no motor
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
    default_a = _dominant_default_amps(grp_amps)

    # Identical-equipment de-duplication set: a signature per circuit (ledger spec tail +
    # per-way kW + ways) so the SAME physical equipment emitted under two names is counted once.
    seen_equip: set = set()
    # Head-noun token-sets of the coincident PRINCIPAL machines already counted, so a SUB-COMPONENT
    # circuit whose tokens STRICTLY SUPERSET a counted principal (a "Drum Filter Backwash" / "Drum
    # Filter Screen" of an already-counted "Drum Filter") is SHOWN (its breaker carries it) but its
    # kW is NOT added to the RUNNING connected-load total — the parent already carries it. This is
    # the panel analogue of the contract's redundant-shell suppression, and it reconciles the
    # bottom-up running total to the contract connected_electrical_load_kw (the engine's
    # coincident running figure). Universal — keyed on the head-noun superset relation, no class.
    counted_toks: list = []
    wn = 0
    for key in order:
        grp = groups[key]
        rep = grp[0]
        base = key[0]
        # WAYS = the larger of (a) the schedule's own fan-out rows and (b) the LEDGER qty for
        # this load (parts-manifest). The connection schedule emits one lumped electrical edge
        # per load name, so an 8-off pump set arrives as a single row; the ledger qty enumerates
        # the real 8 feeders. Universal — the qty is read from the ledger, never assumed 1.
        sched_ways = len(grp)
        led_qty = _ledger_qty_for(base, equip_qty)
        ways = max(sched_ways, led_qty)
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
        # PER-WAY connected kW. An AGGREGATE quantity (continuous_power_kw split across rack
        # taps) is divided by the SCHEDULE fan-out (sched_ways) as before; a PER-UNIT figure
        # (e.g. the requirementsBom 'Recirc Pump · 94 kW' read per pump) is already per-way and
        # must NOT be divided again when the LEDGER qty expanded the ways. So the kW split uses
        # sched_ways (the schedule's own duplication), and the total = per-way × the full ways.
        kw = _connected_kw_for(base, design_a, panel, state, sched_ways)
        kw_total = (kw * ways) if kw is not None else None

        # AMPS-FROM-kW (universal — the Design current is DERIVED from the circuit's OWN connected
        # kW, never inherited from the connection schedule's per-row current). The connection
        # schedule's electrical-edge currents were computed upstream with an inconsistent pf/η
        # convention (e.g. the 769 kW backup heater arrived as 1541.6 A, which is its kW pushed
        # through a different pf — a kW-magnitude value landing in the AMPS column), so reading
        # `rating` straight makes the amps column lie. Recompute every powered circuit's Design I
        # = P·1000/(√3·V·pf·η) from its connected kW (the SAME flc model the cable + breaker use),
        # and SIZE the cable (≥ FLC×1.25) + the breaker (next frame ≥ FLC) from that kW so all
        # three reconcile. A circuit the ledger can't price (kW is None) keeps the schedule's own
        # current + cable (the prior behaviour) — there is no kW to derive from. Universal: any
        # kW → its real FLC, keyed on the connection model, never a product class.
        # A MOTOR's protective device + cable carry the motor NAMEPLATE full-load current
        # (IEC 60947-4-1 — the frame the motor is built on can draw its rated FLC), NOT the
        # shaft/absorbed power that feeds the connected-load TOTAL. So a 132 kW motor on a 94 kW
        # shaft duty sizes its breaker + cable from 132 kW (~222 A → 250 A frame) while its
        # connected-load column stays the 94 kW absorbed. A non-motor load (heater/UPS/transformer)
        # has no shaft figure → nameplate == connected, so nothing changes. Universal.
        sizing_kw = kw
        if kw and _MOTOR_LOAD_RE.search(base):
            nameplate = _panel_motor_nameplate_kw(base, state)
            if nameplate and nameplate > kw:
                sizing_kw = nameplate
        frame_override = None
        if sizing_kw and sizing_kw > 0 and panel.voltage_v:
            flc, _csa, csa_label, frame = size_circuit_from_kw(
                sizing_kw, panel.voltage_v, is_dc=panel.is_dc, phases=panel.phases,
                resistive=bool(_RESISTIVE_LOAD_RE.search(base)))
            if flc is not None:
                design_a = flc              # amps column = motor-nameplate FLC (for sizing)
                cable = _cores_for(csa_label, panel.is_dc, panel.phases)
                frame_override = frame       # breaker = next standard frame ≥ nameplate FLC

        dev, dev_a = _device_for(base, design_a, devices, panel,
                                 frame_override=frame_override)

        # CABLE ≥ DEVICE RATING (2026-07-05, the 'BMS ctrl · W1–13' fix): BS 7671 In ≤ Iz
        # — once the protective/switching DEVICE is picked (above), the cable must carry AT
        # LEAST that device's own rating, not just the row's per-way design current. A REAL
        # picked device (e.g. a rack DC isolator matched from the BoM by `_pick_device`)
        # carries its OWN catalogue ampacity, independent of this row's kW-derived design
        # current — the smallest ABB OTDC-ESS DC isolator frame is 315 A even when the
        # per-rack demand it protects is only ~128 A (a real, deliberately-oversized-for-
        # margin catalogue part, not a sizing bug), so a cable sized purely from the load
        # current (Iz just above Ib) can sit below the LARGER In actually installed on the
        # circuit (v9 BESS: a 315 A isolator on a 35 mm²/138 A cable). Re-size the cable to
        # the standard CSA whose Method-C ampacity ≥ dev_a whenever the picked device's
        # rating exceeds what the load-derived cable already covers — never DOWN-sizes (a
        # load-derived cable that already clears a smaller device stays as-is). Universal:
        # keyed on the device's OWN stamped rating, never a per-class table.
        # TABLE CHOICE: uses electrical_distribution_model's `_CSA_AMPACITY_A` (via `edm`,
        # already imported), NOT this module's own (more generous, multicore) `_CSA_AMPACITY_A`
        # — the workbook's In≤Iz column-contract check (build-excel-export.py
        # `_METHOD_C_AMPACITY_A`) is explicitly documented as MIRRORING the electrical
        # model's table, so sizing against it here is what actually satisfies that check
        # (mixing two divergent 'Method-C' tables for the SAME comparison would size a
        # cable that passes this module's own ladder yet still fails the workbook's).
        if dev_a is not None and dev_a > 0:
            _need = dev_a  # Iz ≥ In directly — no ×1.25 (that margin sizes Ib→In, not In→Iz)
            _need_csa = next((c for c in sorted(edm._CSA_AMPACITY_A)
                              if edm._CSA_AMPACITY_A[c] >= _need), None)
            _need_label = f"{_need_csa:g} mm²" if _need_csa is not None else ""
            _cur_csa_m = re.search(r"([\d.]+)\s*mm²", str(cable or ""))
            _cur_csa = float(_cur_csa_m.group(1)) if _cur_csa_m else None
            if _need_csa is not None and (_cur_csa is None or _need_csa > _cur_csa):
                cable = _cores_for(_need_label, panel.is_dc, panel.phases)

        # ΔU AT SOURCE (2026-07-02): the connection-schedule row's Vd was computed on the
        # ROW's cable at the ROW's (often wholesale-default) current; this panel re-derives
        # Design I from the circuit's own kW and re-sizes the cable — so recompute
        # ΔU% = f(routed length, FINAL cable CSA, Design I) here, the same formula the
        # workbook column contract verifies. The schedule-row Vd stays the fallback for a
        # circuit with no kW-derived sizing. In-spec is then a COMPUTED comparison
        # (ΔU ≤ 5 %), never a default — a dash stays a FAIL downstream.
        vd_calc = voltdrop_pct_from_run(length_m, cable, design_a, panel.voltage_v,
                                        is_dc=panel.is_dc, phases=panel.phases)
        if vd_calc is not None:
            # Recomputed on THIS circuit's Design I + final cable — supersedes the row's
            # verdict (which judged the row cable at the schedule's default current).
            vd = vd_calc
            within = vd_calc <= _VD_LIMIT_PCT
        elif vd is not None:
            within = within and (vd <= _VD_LIMIT_PCT)

        # COINCIDENCE: a STANDBY / BACKUP / EMERGENCY load (a backup immersion heater, a standby
        # pump) is NOT part of the running plant — it energises only on a fault / cold-start — so
        # it is SHOWN (the bus + its breaker must carry it) but excluded from the RUNNING
        # connected-load total (which reconciles to the physics connected_electrical_load_kw, the
        # coincident running load). A DUPLICATE of an already-counted item (the SAME physical
        # equipment emitted under two names — e.g. 'Circulation Pump' and 'Recirc Pump', the same
        # 8×94 kW pumps with a byte-identical ledger spec) is likewise shown once but counted once:
        # the second occurrence is non-coincident so the panel total does not double-count it.
        standby = bool(_STANDBY_LOAD_RE.search(desc))
        sig = _equipment_dup_sig(base, kw, ways, state)
        is_dup = (sig is not None and sig in seen_equip)
        if sig is not None and not is_dup:
            seen_equip.add(sig)
        # PARENT-SUBSUMED SUB-COMPONENT: a circuit whose head-noun tokens STRICTLY SUPERSET an
        # already-counted principal (drum-filter-backwash/screen ⊃ drum filter) is a sub-system of
        # that machine — its load is part of the parent's connected load already counted. Shown
        # (the breaker carries it) but excluded from the RUNNING total so the panel reconciles to
        # the contract connected_electrical_load_kw. Only real, ledger-priced equipment is judged
        # (a tiny aux/instrument is never subsumed); a generic shared head-noun (pump/tank/unit) is
        # stripped so two genuinely-distinct machines never collide.
        my_toks = (set(_norm_load_name(base).split()) - _GENERIC_TOK)
        is_sub = False
        if kw and kw > _AUX_CIRCUIT_KW and len(my_toks) >= 2:
            for ptoks in counted_toks:
                if ptoks and ptoks < my_toks:  # parent's tokens are a STRICT subset of mine
                    is_sub = True
                    break
        # A DUPLICATE is the same physical equipment emitted twice — not really installed a second
        # time — so neither its kW NOR its current is summed in the board totals (the row is still
        # SHOWN with its own figures, flagged as a duplicate). A STANDBY load IS installed (the
        # bus + breaker carry it on a fault) — its current stays in Σ-current; only its kW is left
        # out of the RUNNING connected-load total. A PARENT-SUBSUMED sub-component (is_sub) is also
        # shown but its kW is in the parent's already-counted load.
        coincident = not (standby or is_dup or is_sub)
        # Register a COINCIDENT principal's head-noun tokens so a later sub-component circuit can be
        # recognised as subsumed by it (only the running, non-subsumed machines are parents).
        if coincident and len(my_toks) >= 1 and kw and kw > _AUX_CIRCUIT_KW:
            counted_toks.append(my_toks)
        cnote = note
        if standby:
            cnote = (cnote + "; " if cnote else "") + "standby — not in running total"
        elif is_dup:
            cnote = (cnote + "; " if cnote else "") + "duplicate of an earlier circuit — counted once"
        elif is_sub:
            cnote = (cnote + "; " if cnote else "") + "sub-component of a counted machine — load in parent"

        panel.circuits.append(Circuit(
            ref=ref, description=desc, ways=ways,
            connected_kw=kw, connected_kw_total=kw_total,
            design_a=design_a, device=dev, device_a=dev_a,
            cable=cable, length_m=(length_m or None),
            voltdrop_pct=vd, within_spec=within, note=cnote,
            coincident=coincident, duplicate=is_dup))


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


def _panel_pump_kw_by_name(name: str, state: dict) -> Optional[float]:
    """A PUMP circuit's OWN electrical kW from a NAME-MATCHED contract quantity — e.g.
    'Fertigation Dosing Pump' → fertigation_dosing_pump_power_kw, 'Drain Transfer Pump' →
    drain_transfer_pump_power_kw, 'Irrigation Pump' → irrigation_pump_motor_kw. Replaces the old
    blanket rule that returned the single irrigation_pump_motor_kw for EVERY pump (Tristan
    2026-06-29: that inflated the Codema panel 48→63 kW — drain 1.9 kW + fertigation 7.5 kW were
    both shown at 9.65 — and tripped the load_reconcile drawing-gate). Best token-overlap wins; the
    generic 'pump'/'motor'/'power' tokens are dropped so the DISTINGUISHING noun decides. Returns
    None when no pump-specific quantity matches by name (caller falls through to ledger/duty)."""
    # ONE shared matcher — edm._equip_kw_from_quantities (the 2026-07-02 half-fix lesson:
    # this distinguishing-token logic lived TWICE; only this copy got the 06-29 fix while
    # synthesise_equipment_feeders kept the blanket match and re-broke load_reconcile for
    # 120 runs). The panel scopes candidates to pump/motor keys via require_key_re.
    q = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        qq = (state.get(ck) or {}).get("quantities")
        if isinstance(qq, dict) and qq:
            q = qq
            break
    return edm._equip_kw_from_quantities(name, q,
                                         require_key_re=re.compile(r"pump|motor"))


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
    if "dehumidif" in b:
        # a dehumidifier is a vapour-compression REFRIGERATION unit: its ELECTRICAL draw is the
        # latent/thermal duty ÷ the dehumidification COP, NOT the latent duty itself (the heat it
        # must remove — e.g. 240 kg/h × 2450 kJ/kg ≈ 163 kW thermal, but ~54 kW electrical at
        # COP 3). Prefer a published electrical figure; else duty ÷ COP. Universal — a dehumidifier
        # is a refrigeration unit in any plant, never a product-class branch.
        v = _q(state, "dehumidifier_electrical_kw")
        if v:
            return v
        duty = _q(state, "dehumidifier_power_kw") or _q(state, "dehumidifier_duty_kw")
        if duty:
            cop = _q(state, "dehumidifier_cop") or _q(state, "dehumidification_cop") or 3.0
            return round(duty / cop, 1)
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
        # EACH pump circuit takes ITS OWN power — a NAME-MATCHED pump *_kw quantity — NEVER one
        # blanket value for every pump. The old rule returned irrigation_pump_motor_kw (9.65 kW)
        # for the fertigation (7.5) + drain (1.9) + hand-watering pumps too, inflating the Codema
        # panel total 48→63 kW and tripping the load_reconcile drawing-gate (Tristan 2026-06-29).
        # Fall through to the per-load ledger '· N kW' resolution when nothing matches by name.
        v = _panel_pump_kw_by_name(base, state)
        if v:
            return v
    if "pcs" in b or "inverter" in b or "transformer" in b:
        v = _q(state, "continuous_power_kw")
        if v:
            return v
    # A PURE SENSING INSTRUMENT is a tens-of-watts loop load — bound it BEFORE the ledger
    # resolution so it can never borrow a process unit's kW on a shared name token (the
    # 'UV Transmittance Monitor' inheriting the 35 kW UV reactor). Universal — keyed on the
    # sensing-instrument noun, never a product class.
    if _INSTRUMENT_LOAD_RE.search(b):
        return _AUX_CIRCUIT_KW
    # PER-LOAD derivation (universal): the equipment's OWN published electrical kW (ledger
    # requirementsBom / a contract *_kw quantity), so each circuit carries its real load, NOT a
    # single wholesale design-current default. Divide an aggregate by the way count for collapsed
    # taps. NOTE we do NOT take the duty-type ESTIMATE here for an AUXILIARY (instrument/control/
    # valve) load — see the aux bound below.
    kw = _panel_resolve_ledger_kw(base, state)
    if kw and kw > 0:
        return round(kw / ways, 1) if ways > 1 else round(kw, 1)
    # AUX circuits (analyser / transmitter / PLC / SCADA / network / actuated valve) with no
    # published kW are a small loop load — NOT a duty-fraction of the principal motor. Bound them
    # so an instrument can never read as a major load (the 22 kW 'analyser' over-count). This is
    # the universal correction for the duty-type estimate scaling an instrument off a mis-read
    # principal-motor anchor; process equipment (filters/UV/skimmer) still gets the duty estimate.
    if _AUX_LOAD_RE.search(b):
        return _AUX_CIRCUIT_KW
    # process equipment with no ledger kW: the duty-type estimate (a duty fraction of the
    # principal motor) — the realistic stand-in when the ledger doesn't price the item.
    kw = _panel_type_kw(base, state)
    if kw and kw > 0:
        return round(kw / ways, 1) if ways > 1 else round(kw, 1)
    # last resort: derive from the design current.
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


def _circuit_current_sum(panel: Panel) -> float:
    """Σ design current across the board's OWN circuits (non-duplicate, ways-weighted) — the
    board's real downstream demand signal, computed from panel.circuits (already filled by
    `_fill_circuits` before either incoming-setter runs). Same formula `reconcile()` uses for
    its headline `sum_a`, exposed early so `_set_incoming` can derive/guard the incoming
    demand BEFORE the full reconciliation runs. Not a duplicate mint — `reconcile()` calls
    this helper too."""
    return sum(((c.design_a or 0) * c.ways) for c in panel.circuits if not c.duplicate)


def _set_busbar_rating(panel: Panel) -> None:
    """Busbar RATING is the standard BS-EN-60947 breaker/busbar FRAME the board is BUILT to
    (the next _BREAKER_FRAMES rung ≥ the board's own demand current) — never a bare echo of
    the DEMAND current itself (an 87 A demand sits on a 100 A busbar, not an '87 A busbar').
    Same ladder + `_next_frame()` the outgoing-circuit devices use. Called from both incoming-
    setters once the board's demand (incoming_a, else busbar_a) is settled."""
    demand_a = panel.incoming_a or panel.busbar_a
    if demand_a:
        panel.busbar_rating_a = _next_frame(demand_a)


def _set_incoming(panel: Panel, board_id: str, rows, schedule: dict, state: dict):
    """Incoming feeder + busbar for the MAIN board.  Its busbar = the bus trunk row it
    carries ('(busway)'); the incoming = the conversion-chain trunk feed (or that same
    busbar when no upstream chain row exists).

    The connection schedule frequently leaves the incoming-feeder row at the SAME wholesale
    default current it puts on many unrelated trunk/branch rows (e.g. 4.2 A repeated across
    4 trunk stages + 11 branches) — trusting that raw reading made a MAIN board's demand read
    orders of magnitude below its own Σ circuit current (ratio ~20). Guard it: when the raw
    incoming reading (a) doesn't exist, or (b) is PROVABLY a stale placeholder per
    `_demand_needs_circuit_override` (2026-07-05 J98 fix: the SAME test `_set_sub_incoming`
    now shares — one mint), derive the demand from the board's own circuit sum instead — the
    board's own circuits are real (kW-derived, 2026-07-02), never a stale row. When (b) fires,
    the displayed feeder cable is RE-SIZED from that corrected current too — leaving the
    placeholder row's undersized cable label standing next to a corrected demand figure would
    just relocate the lie from the amps column to the cable column."""
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

    downstream_a = _circuit_current_sum(panel)
    raw_a = _row_amps(inc) if inc is not None else None
    schedule_default_a = _dominant_default_amps(_dedup_row_amps_for_schedule(rows))
    stale_default = _demand_needs_circuit_override(raw_a, downstream_a, schedule_default_a)

    if inc is None and downstream_a > 0:
        panel.incoming_a = downstream_a                 # (a) no incoming row — use own circuits
        if bus is None and not panel.busbar_a:
            panel.busbar_a = downstream_a
        panel.incoming = "—"
    elif stale_default:
        panel.incoming_a = downstream_a                 # (b) stale wholesale default — use own
        _csa_label = size_cable_csa(downstream_a)[1]     #     circuits' derived sum + cable
        panel.incoming = (f"{_csa_label or '—'} (re-sized from the board's own {downstream_a:,.0f} A "
                          f"circuit demand — the schedule's own reading was the "
                          f"{schedule_default_a:g} A wholesale placeholder)")
    elif inc is not None:
        panel.incoming_a = raw_a
        panel.incoming = _incoming_descr(inc)            # a genuine reading — show its own cable

    # (c) the busbar RATING is a separate figure from the demand current — never a bare echo.
    _set_busbar_rating(panel)


def _set_sub_incoming(panel: Panel, board_id: str, rows, schedule: dict, state: dict):
    """Incoming feeder + busbar + transformer for a SUB-distribution board.

    Critical: a sub-board sits on a transformer SECONDARY, so its LV BUSBAR current
    (≈ Σ of its load circuits) is in a DIFFERENT current domain from the MV feeder that
    supplies it.  The board demand we reconcile against is the LV BUSBAR current (the
    '<board> → (local busway)' trunk row), NOT the MV feeder amps.  The MV feeder + the
    step-down transformer are recorded separately for the header.

    2026-07-05 J98 board-recon fix: this LV busway reading is subject to the SAME
    stale-placeholder guard the MAIN board's `_set_incoming` already carried
    (`_demand_needs_circuit_override` — one mint, shared). Before this fix an AUX/control
    board whose busway-trunk row happened to carry the schedule-wide wholesale placeholder
    (e.g. a BESS 'BMS ctrl' board reading 15 A on its own trunk while its 13 rack-feeder
    circuits actually demand 1,685 A) locked its busbar rating onto that placeholder — a
    112× REVIEW ratio — because only the MAIN board ever cross-checked the reading against
    its own circuits. A board's demand is now judged by the IDENTICAL rule regardless of
    board TYPE (main vs sub/aux)."""
    # 1) LV busbar = the local-busway trunk this sub-board carries (the demand basis) —
    # unless that reading is provably the schedule-wide placeholder (see docstring above).
    bus = _lv_busbar_row(board_id, rows)
    raw_lv_a = _row_amps(bus) if bus is not None else None
    downstream_a = _circuit_current_sum(panel)
    schedule_default_a = _dominant_default_amps(_dedup_row_amps_for_schedule(rows))
    stale_default = _demand_needs_circuit_override(raw_lv_a, downstream_a, schedule_default_a)
    if raw_lv_a is None or stale_default:
        lv_a = downstream_a if downstream_a > 0 else raw_lv_a
    else:
        lv_a = raw_lv_a
    if lv_a is None:
        # no busway row, no circuits yet sized — fall back to the largest load circuit.
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

    # busbar RATING (the frame the board is built to) — split from the demand current, same
    # as the MAIN board (see _set_busbar_rating).
    _set_busbar_rating(panel)


def _electrical_consumer_breakdown_total(quantities: dict) -> Optional[float]:
    """Σ electrical_consumer__*_kw — the ONE-MINT authoritative electrical-consumer
    total published by the engineering contract (scripts/lib/engineering-contract.ts),
    the SAME array `connected_electrical_load_kw` is itself summed from. Returns None
    when no archetype has published a breakdown (every OTHER product class today)."""
    total = 0.0
    found = False
    for k, v in (quantities or {}).items():
        if not _ELEC_CONSUMER_BREAKDOWN_RE.match(k.lower()):
            continue
        val = v.get("value") if isinstance(v, dict) else v
        try:
            total += float(val)
            found = True
        except (TypeError, ValueError):
            continue
    return total if found else None


def _reconcile_panels_to_breakdown(panels: list, state: dict) -> None:
    """ONE-MINT reconciliation (load_reconcile fix, 2026-07-06): when the engineering
    contract publishes an electrical_consumer__*_kw breakdown, PIN the MAIN board's
    running (coincident) connected-load total to that Σ — the SAME authoritative list
    connected_electrical_load_kw is summed from — by uniformly rescaling every
    circuit's displayed kW, rather than leaving the total to whatever a topology-driven
    per-circuit derivation (`_fill_circuits` → `_connected_kw_for`) or the universal
    fallback synthesis happens to produce on a fresh emit.

    WHY here, not just at feeder-synthesis time: a board recognised directly from the
    routed topology (`_fill_circuits`) never goes through `_synthesise_main_board` /
    `_electrical_consumer_breakdown_feeders` at all — it derives each circuit's kW from
    the connection-schedule + a THIRD independent heuristic (`_connected_kw_for`). This
    was the actual root of the co2_mineralisation load_reconcile chain failure: the
    isolated harness (fresh `_synthesise_main_board` run) reconciled to ~529/559
    (0.95, PASS), but the LIVE chain's parts-manifest/connection-schedule WAS
    topology-recognised and went through `_fill_circuits`, landing at 886 kW — two
    different code paths inside this SAME file, one fixed, one not (out/co2-campaign-v9).
    Reconciling HERE, after either path has built its panels, closes both at once and
    is robust to which path a future design's topology happens to hit.

    Rescaling (not overwriting) preserves each circuit's relative proportion — the
    totals row still equals Σ the visible per-circuit rows, so the table stays
    internally honest. After a non-trivial rescale, Design I (+ cable / breaker when
    those were load-derived) MUST be re-derived from the new kW — leaving the pre-
    rescale FLC beside a rescaled Conn. load fabricates an impossible pf·η (Codema
    1820 Electrical 6.7: UV row 18.33 kW vs Design I 56.6 A → implied pf·η 0.47).
    Scoped to `kind == 'main'` (the board load_reconcile's regex reads); a sub-board
    downstream of its own transformer is a different physical demand and is left
    alone. No-op — unchanged behaviour — when no archetype has published a breakdown
    (every OTHER product class today: water/BESS/SAF/etc all return None here and
    this function does nothing)."""
    quantities = {}
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict) and q:
            quantities = q
            break
    target = _electrical_consumer_breakdown_total(quantities)
    if target is None or target <= 0:
        return
    for p in panels:
        if p.kind != "main":
            continue
        raw = sum((c.connected_kw_total or 0) for c in p.circuits if c.coincident)
        if raw <= 0:
            continue
        ratio = target / raw
        if abs(ratio - 1.0) < 1e-9:
            continue
        for c in p.circuits:
            if c.connected_kw is not None:
                c.connected_kw = c.connected_kw * ratio
            if c.connected_kw_total is not None:
                c.connected_kw_total = c.connected_kw_total * ratio
            # Re-derive Design I from the rescaled kW so Conn. load ↔ Design I stay
            # arithmetically honest (workbook column contract: implied pf·η ∈ 0.60–1.05).
            kw_one = c.connected_kw
            if kw_one is None or kw_one <= 0 or not p.voltage_v:
                continue
            resistive = bool(_RESISTIVE_LOAD_RE.search(c.description or ""))
            flc, _csa, cable_label, frame = size_circuit_from_kw(
                kw_one, p.voltage_v, is_dc=p.is_dc, phases=p.phases,
                resistive=resistive)
            if flc is None:
                continue
            c.design_a = flc
            if cable_label:
                # Preserve core-count / type prefix when present ("4C · 16 mm²");
                # otherwise replace the CSA cell with the re-sized label.
                prev = c.cable or ""
                if "·" in prev:
                    prefix = prev.split("·", 1)[0].strip()
                    c.cable = f"{prefix} · {cable_label}"
                else:
                    c.cable = cable_label
            if frame is not None:
                c.device_a = frame
                # Keep the device family (MCB/MCCB/…) but stamp the new frame amps.
                if c.device:
                    c.device = re.sub(
                        r"\b\d{1,5}\s*A\b", f"{frame:g} A", c.device, count=1)
                else:
                    c.device = f"MCB {frame:g} A"


# ═══════════════════════════════════════════════════════════════════════════
# RECONCILIATION
# ═══════════════════════════════════════════════════════════════════════════

def reconcile(panel: Panel) -> dict:
    """Σ connected load (kW) and Σ design current (A) over the board's circuits, vs the
    board demand (busbar / incoming).  Returns the totals + a sanity verdict.

    The headline `sum_kw` is the RUNNING (coincident) connected load — it sums only the
    coincident circuits (a standby/backup load + a duplicate of an already-counted item are
    EXCLUDED), so it reconciles to the physics connected_electrical_load_kw (the running load).
    `noncoincident_kw` is the standby + duplicate kW shown-but-not-summed (reported in the note).
    `sum_a` keeps EVERY circuit's current — the busbar + breakers must carry the standby load
    when it energises — so the Σ-current-vs-busbar check still sees the full installed current."""
    sum_kw = sum((c.connected_kw_total or 0) for c in panel.circuits if c.coincident)
    noncoincident_kw = sum((c.connected_kw_total or 0)
                           for c in panel.circuits if not c.coincident)
    # Σ-current keeps every INSTALLED circuit (standby included — the bus carries it on a fault)
    # but drops a DUPLICATE (the same equipment's current is already counted under its first name).
    sum_a = _circuit_current_sum(panel)
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
        # current (allow a diversity / aux margin — the SAME _RECON_BAND the stale-default
        # guard uses, one mint: a reading that would already fail here is what makes the
        # guard override it in the first place).
        lo, hi = _RECON_BAND
        verdict = "OK" if lo <= ratio <= hi else "REVIEW"

    # transformer-headroom check (sub-boards fed via a step-down): Σ connected kW must sit
    # within the transformer kVA nameplate (× ~0.95 pf headroom).
    tx_headroom = None
    if panel.transformer_kva and sum_kw:
        tx_headroom = sum_kw / (panel.transformer_kva * 0.95)   # <1 = within rating

    return {"sum_kw": sum_kw, "noncoincident_kw": noncoincident_kw,
            "sum_a": sum_a, "demand_a": demand_a,
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
    out.append(f"> {_tb.TOLERANCE_NOTE}\n")
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
            ("Busbar rating", _fmt(p.busbar_rating_a or p.busbar_a, " A", fmt="{:,.0f}")),
            ("Incoming feeder", p.incoming or "—"),
        ]
        if p.transformer:
            hdr.append(("Step-down transformer", p.transformer))
        nc = rec.get("noncoincident_kw") or 0
        conn_val = _fmt(rec["sum_kw"], " kW", fmt="{:,.1f}")
        if nc > 0:
            conn_val += f"  (running; + {nc:,.0f} kW standby/duplicate not summed)"
        hdr += [
            ("Total connected load", conn_val),
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
            if not c.coincident and c.connected_kw is not None:
                kw_cell = f"({kw_cell})"        # parenthesised = shown but NOT in the running total
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
            nc_note = (f" Standby/duplicate loads shown but not summed: "
                       f"{rec['noncoincident_kw']:,.0f} kW."
                       if (rec.get('noncoincident_kw') or 0) > 0 else "")
            out.append(
                f"**Reconciliation:** Σ circuit design current = {rec['sum_a']:,.0f} A; "
                f"Σ RUNNING connected load = {rec['sum_kw']:,.1f} kW "
                "(board busbar demand not modelled — single-board layout)." + nc_note + "\n")
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


# Control + cabinet-electrical devices that are CABINET CONTENTS (PLC / SCADA / HMI / UPS /
# gateway / power-supply / VFD-controller / protection / surge / breaker) — they have NO outgoing
# feeder of their own (fed from the board's internal control supply), so the outgoing-circuit
# schedule never lists them, yet a complete panel / MCC submittal ENUMERATES every device in the
# enclosure. Collect them from the BoM so the schedule documents them (and the deterministic
# coverage check finds their tag/name). UNIVERSAL — keyed on the control/electrical device noun,
# excluding process equipment (pump/tank/valve/filter/…) which is documented on the P&ID/GA.
_AUX_DEVICE_RE = re.compile(
    r"\b(plc|scada|hmi|touch ?screen|\bups\b|gateway|controller|power supply|\bpsu\b|"
    r"vfd|variable[- ]speed|soft[- ]start|relay|contactor|surge|\bspd\b|circuit breaker|breaker|"
    r"control panel|digital control|marshalling|i/?o module|network switch|data logger|telemetry|"
    r"protection device|standby (?:diesel )?generator|genset)\b", re.I)
_AUX_EXCLUDE_RE = re.compile(
    r"\b(pump|tank|valve|filter|membrane|vessel|skid|motor|sensor|transmitter|analy[sz]er|"
    r"probe|gauge|meter|nozzle|frame|wall|floor|nutrient)\b", re.I)


def _collect_aux_devices(state: dict):
    """Distinct control / cabinet-electrical devices from the BoM (cabinet contents that carry no
    outgoing circuit). Returns [(tag, name)], deterministic order, de-duplicated by name."""
    seen: set = set()
    out: list = []
    rb = state.get("requirementsBom") if isinstance(state, dict) else None
    rows = rb if isinstance(rb, list) else []
    for r in rows:
        if not isinstance(r, dict):
            continue
        nm = str(r.get("name") or r.get("requirement") or "").strip()
        if not nm:
            continue
        base = nm.split(" · ")[0].strip()              # drop a "· 364 m² area" qualifier
        if base.lower().startswith(("water connection", "electrical connection",
                                    "signal connection", "air connection")):
            continue                                    # a routed connection, not a device
        if not _AUX_DEVICE_RE.search(base) or _AUX_EXCLUDE_RE.search(base):
            continue
        key = base.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append((str(r.get("tag") or ""), base))
    return out[:48]


def build_table_svg(archetype: str, panels: list[Panel], schedule: dict, state: dict | None = None) -> str:
    # ----- measure height -----
    aux_devices = _collect_aux_devices(state or {})
    aux_h = (_HEAD_H + (len(aux_devices) + 1) * _ROW_H + 30) if aux_devices else 0
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
    height = y + aux_h + 108                      # + aux device schedule + title block (+28: tolerance note)
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
            # "Bus rating" (not "Busbar") — the board's BUS RATING (the breaker/busbar frame
            # it's built to — see _set_busbar_rating), a header field, NOT a load circuit and
            # NOT a bare echo of the demand current.
            ("Bus rating", _fmt(p.busbar_rating_a or p.busbar_a, " A", fmt="{:,.0f}")),
            ("Incoming feeder", _shorten(p.incoming or "—", 56)),
        ]
        if p.transformer:
            fields.append(("Step-down TX", p.transformer))
        nc = rec.get("noncoincident_kw") or 0
        conn_v = _fmt(rec["sum_kw"], " kW", fmt="{:,.1f}")
        if nc > 0:
            conn_v += f"  (+{nc:,.0f} standby/dup)"
        fields += [
            ("Σ running load", conn_v),
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
            # a standby/backup OR duplicate circuit is rendered MUTED and tagged so the reader sees
            # it is SHOWN but excluded from the running total (the bus must still carry a standby).
            row_ink = MUTED if not c.coincident else INK
            tag = (" [standby]" if (not c.coincident and not c.duplicate)
                   else (" [dup]" if c.duplicate else ""))
            kw_cell = (f"{c.connected_kw:,.2f}" if c.connected_kw is not None else "—")
            if c.ways > 1 and c.connected_kw is not None:
                kw_cell = f"{c.connected_kw:,.1f}→{c.connected_kw_total:,.0f}"
            if not c.coincident:
                kw_cell = f"({kw_cell})"        # parenthesised = not summed into the total
            cells = [
                (c.ref, "l", row_ink, False),
                (_shorten(c.description + tag, 30), "l", row_ink, False),
                (str(c.ways), "r", row_ink, False),
                (kw_cell, "r", row_ink, True),
                (_fmt(c.design_a, fmt="{:,.1f}"), "r", row_ink, True),
                (_shorten(c.device or "—", 38), "l", row_ink, False),
                (c.cable or "—", "l", row_ink, True),
                (_fmt(c.length_m, fmt="{:,.1f}"), "r", row_ink, True),
                (_fmt(c.voltdrop_pct, fmt="{:g}"), "r", row_ink, True),
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

    # ----- auxiliary & control device schedule (cabinet contents — no outgoing circuit) -----
    if aux_devices:
        svg.text(_MARGIN, yy + 14, "AUXILIARY & CONTROL DEVICE SCHEDULE — cabinet contents (fed from the board control supply)",
                 size=11, weight="bold", fill=BUS_INK)
        yy += 26
        svg.rect(_MARGIN, yy, _TABLE_W, _HEAD_H, fill=HEAD_BG, stroke=GRID_FAINT, width=1.0)
        _acols = [("Tag", 90, "start"), ("Device / description", _TABLE_W - 90 - 150, "start"), ("Enclosure", 150, "start")]
        cx = _MARGIN
        for (label, w, align) in _acols:
            tx, anc = _cell_anchor(cx, w, align)
            svg.text(tx, yy + 16, label, size=9.3, weight="bold", fill=BUS_INK, anchor=anc)
            cx += w
        ry = yy + _HEAD_H
        for i, (tag, name) in enumerate(aux_devices):
            if i % 2:
                svg.rect(_MARGIN, ry, _TABLE_W, _ROW_H, fill=PANEL_BG)
            vals = [tag or "—", _shorten(name, 70), "Control / power cabinet"]
            cx = _MARGIN
            for val, (label, w, align) in zip(vals, _acols):
                tx, anc = _cell_anchor(cx, w, align)
                svg.text(tx, ry + 15, val, size=9.2, anchor=anc, fill=INK)
                cx += w
            ry += _ROW_H
        svg.rect(_MARGIN, yy, _TABLE_W, ry - yy, stroke=INK, width=1.3)
        yy = ry + 8

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
    y0 = height - 92          # -92 (was -64): +28 for the shared general-tolerance note line
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
    # shared general-tolerance note (ONE source of truth: drawing_titleblock.py) — drawn
    # BELOW the metadata box's bottom row so the long line never strikes through it.
    svg.text(30, y0 + 72, _tb.TOLERANCE_NOTE, size=8.2, fill=MUTED)


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
                 f"file://{Path(svg_path).resolve()}"],
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
    panels = build_schedules(schedule, state, out_dir)
    _reconcile_panels_to_breakdown(panels, state)

    md = render_markdown(archetype, panels, schedule)
    # Always render the schedule sheet — even with zero recognised distribution boards
    # (e.g. a chemical/process archetype whose routed topology has no board node) the SVG
    # is a valid header-only sheet, matching draw_process_schedules.py which writes its PNG
    # unconditionally. This is what lets the drawing embed in the PDF instead of vanishing
    # to .md only (the 8th drawing was silently dropped for every process plant).
    svg_text = build_table_svg(archetype, panels, schedule, state)

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


def _selftest() -> int:
    """Universal connected-load reconciliation invariants (regression-harness for the RAS
    panel-total regression: motor shaft-vs-nameplate, kW-in-amps leak, qty-N N² double-sum,
    duplicate equipment, standby coincidence). Pure — no external files. Returns 0 on pass."""
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    # I1 — a MOTOR circuit reads its SHAFT/absorbed kW, not the motor NAMEPLATE.
    st = {"requirementsBom": [
        {"requirement": "Circulation Pump · 132 kW motor (94 kW shaft) · 1176x1000x1294 mm"},
        {"requirement": "Backup Immersion Heater · 769 kW · 2369x2014x2606 mm"}]}
    chk("I1.motor_shaft_preferred",
        _panel_req_bom_kw("Circulation Pump", st) == 94.0)
    # I2 — a NON-motor load (heater) keeps its own first '· NN kW' (no shaft figure exists).
    chk("I2.heater_keeps_nameplate",
        _panel_req_bom_kw("Backup Immersion Heater", st) == 769.0)
    # I3 — amps DERIVED from kW = P·1000/(√3·V·pf·η); 769 kW @ 400 V → ~1451 A, NEVER the kW.
    a = flc_from_kw(769.0, 400.0, phases=3)
    chk("I3.amps_from_kw_not_kw", a is not None and 1400 <= a <= 1500)
    chk("I3.amps_not_kw_magnitude", a is not None and abs(a - 769.0) > 100)
    # I4 — an AUX instrument circuit with no ledger kW is BOUNDED, not a duty-fraction estimate.
    class _P:  # minimal panel stub
        is_dc = False; phases = 3; voltage_v = 400.0
    chk("I4.aux_instrument_bounded",
        _connected_kw_for("Dissolved-Oxygen Analyser", 41.5, _P(), st, 1) == _AUX_CIRCUIT_KW)
    chk("I4.valve_bounded",
        _connected_kw_for("Flow Control Valve", 27.4, _P(), st, 1) == _AUX_CIRCUIT_KW)
    # I5 — a STANDBY/BACKUP load is detected (excluded from the running total downstream).
    chk("I5.standby_detected", bool(_STANDBY_LOAD_RE.search("Backup Immersion Heater")))
    chk("I5.running_not_standby", not _STANDBY_LOAD_RE.search("Circulation Pump"))
    # I6 — identical equipment under two names shares a dedup signature (counted once).
    st2 = {"requirementsBom": [
        {"requirement": "Circulation Pump · 132 kW motor (94 kW shaft) · 1176x1000x1294 mm"},
        {"requirement": "Recirc Pump · 132 kW motor (94 kW shaft) · 1176x1000x1294 mm"}]}
    s_a = _equipment_dup_sig("Circulation Pump", 94.0, 8, st2)
    s_b = _equipment_dup_sig("Recirc Pump", 94.0, 8, st2)
    chk("I6.duplicate_equipment_same_sig", s_a is not None and s_a == s_b)
    # I7 — a small AUX load is NEVER deduped (two separate instruments each count).
    chk("I7.aux_not_deduped",
        _equipment_dup_sig("Dissolved-Oxygen Analyser", _AUX_CIRCUIT_KW, 1, st2) is None)
    # I8 — reconcile() excludes non-coincident kW from the running total but keeps standby amps.
    pnl = Panel(board_id="b", name="B", voltage_v=400.0, phases=3)
    pnl.circuits = [
        Circuit(ref="W1", description="Pump", connected_kw=94.0, connected_kw_total=94.0,
                design_a=100.0, coincident=True),
        Circuit(ref="W2", description="Backup Heater", connected_kw=769.0,
                connected_kw_total=769.0, design_a=1451.0, coincident=False, duplicate=False),
        Circuit(ref="W3", description="Recirc Pump", connected_kw=94.0, connected_kw_total=94.0,
                design_a=100.0, coincident=False, duplicate=True)]
    rec = reconcile(pnl)
    chk("I8.running_total_excludes_noncoincident", abs(rec["sum_kw"] - 94.0) < 0.01)
    chk("I8.noncoincident_reported", abs(rec["noncoincident_kw"] - 863.0) < 0.01)
    # standby current stays in Σ-current (100 + 1451), the duplicate's 100 is dropped.
    chk("I8.amps_keep_standby_drop_dup", abs(rec["sum_a"] - 1551.0) < 0.01)

    # I-pump — EACH pump circuit resolves to ITS OWN name-matched contract kW, NEVER one blanket
    # value for every pump (Tristan 2026-06-29: drain 1.9 kW + fertigation 7.5 kW were both shown at
    # the irrigation pump's 9.65 kW, inflating the Codema panel total 48→63 kW and tripping the
    # load_reconcile drawing-gate). The distinguishing noun must decide each pump's power.
    st_p = {"orchestratorContract": {"quantities": {
        "fertigation_dosing_pump_power_kw": {"value": 7.5},
        "drain_transfer_pump_power_kw": {"value": 1.92},
        "irrigation_pump_motor_kw": {"value": 9.65}}}}
    kf = _connected_kw_for("Fertigation Dosing Pump", 20.0, _P(), st_p, 1)
    kd = _connected_kw_for("Drain Transfer Pump", 8.0, _P(), st_p, 1)
    ki = _connected_kw_for("Irrigation Pump", 20.0, _P(), st_p, 1)
    chk("Ipump.fertigation_own_kw", kf == 7.5)
    chk("Ipump.drain_own_kw", kd == 1.92)
    chk("Ipump.irrigation_own_kw", ki == 9.65)
    chk("Ipump.not_blanket_all_equal", not (kf == kd == ki))   # the exact regression we fixed

    # I9 — a THERMAL-RECOVERY quantity (*_recovery_kw / heat-recovery duty) is NOT read as the
    # item's electrical draw (the HRV 941 kW thermal-recovery duty landing in the panel as a
    # 941 kW electrical load). Universal — any class with a heat-recovery duty.
    st_hrv = {"orchestratorContract": {"quantities": {
                  "ventilation_hrv_recovery_kw": {"value": 941.0},
                  "recirc_pump_motor_kw": {"value": 132.0}}},
              "requirementsBom": [{"requirement":
                  "Building Ventilation (HRV) · 100200 m³/h · 6503x5528x7153 mm"}]}
    chk("I9.thermal_recovery_not_electrical",
        _panel_resolve_ledger_kw("Building Ventilation (HRV)", st_hrv) is None)
    # I10 — a PURE SENSING INSTRUMENT never inherits a process unit's kW via a shared name token
    # (a 'UV Transmittance / Intensity Monitor' borrowing the 35 kW UV reactor on the 'uv' token).
    st_uv = {"orchestratorContract": {"quantities": {"uv_reactor_kw": {"value": 35.0}}},
             "requirementsBom": [{"requirement":
                 "UV Transmittance / Intensity Monitor · 0–100 %UVT"}]}
    chk("I10.instrument_never_inherits_process_kw",
        _connected_kw_for("UV Transmittance / Intensity Monitor", 87.1, _P(), st_uv, 1)
        == _AUX_CIRCUIT_KW)
    # I11 — a PASSIVE process internal (filter/column media, packing, fill, mesh) is excluded from
    # the load list (no motor); a board incomer ('Main Breaker') is board kit, not a load; a real
    # driven device that merely names a passive noun ('Media Transfer Pump') is KEPT.
    chk("I11.passive_media_excluded", _is_passive_nonelectrical("Biofilm Carrier Media (MBBR)"))
    chk("I11.passive_mesh_excluded", _is_passive_nonelectrical("Media / Mesh Panels"))
    chk("I11.media_pump_kept", not _is_passive_nonelectrical("Media Transfer Pump"))
    chk("I11.real_blower_kept", not _is_passive_nonelectrical("Aeration Blower"))
    chk("I11.main_breaker_is_board_infra", _is_board_infrastructure("Main Breaker"))
    chk("I11.pump_not_board_infra", not _is_board_infrastructure("Recirc Pump"))

    # I12 — a DEHUMIDIFIER's ELECTRICAL draw is the latent/thermal duty ÷ COP, not the duty (the
    # heat it must remove). dehumidifier_power_kw = 163 (latent) → ~54 kW electrical at COP 3.
    st_dh = {"orchestratorContract": {"quantities": {"dehumidifier_power_kw": {"value": 163.0}}}}
    chk("I12.dehumidifier_electrical_is_duty_over_cop",
        abs(_connected_kw_for("Dehumidifier", 100.0, _P(), st_dh, 1) - 163.0 / 3.0) < 0.5)
    # I13 — a MOTOR's breaker/cable size from the NAMEPLATE kW (132), while the connected-load
    # column keeps the absorbed SHAFT power (94).
    st_np = {"requirementsBom": [
        {"requirement": "Recirc Pump · 132 kW motor (94 kW shaft) · 1176x1000x1294 mm"}]}
    chk("I13.motor_nameplate_for_sizing",
        _panel_motor_nameplate_kw("Recirc Pump", st_np) == 132.0)
    chk("I13.motor_connected_is_shaft",
        _panel_req_bom_kw("Recirc Pump", st_np) == 94.0)

    # I14 — a PARENT-SUBSUMED sub-component (its head-noun tokens STRICTLY SUPERSET a counted
    # principal's) is excluded from the RUNNING total — its load is part of the parent's already
    # counted. "Drum Filter Backwash"/"Drum Filter Screen" ⊃ "Drum Filter"; a distinct machine
    # ("Recirc Pump") shares no superset relation with "Drum Filter". Generic words are stripped so
    # two distinct machines never collide. This reconciles the panel running total to the contract
    # connected_electrical_load_kw (the RAS 2,865→1,754 kW load_reconcile fix, 2026-06-19).
    def _ntok(s):
        return set(_norm_load_name(s).split()) - _GENERIC_TOK
    drum = _ntok("Drum Filter")
    chk("I14.subcomponent_supersets_parent", drum < _ntok("Drum Filter Backwash") and drum < _ntok("Drum Filter Screen"))
    chk("I14.distinct_machine_not_subsumed", not (drum < _ntok("Recirc Pump")) and not (_ntok("Recirc Pump") < drum))
    # the reconcile excludes a non-coincident (subsumed) circuit's kW but keeps its current.
    pnl2 = Panel(board_id="b2", name="B2", voltage_v=400.0, phases=3)
    pnl2.circuits = [
        Circuit(ref="W1", description="Drum Filter", connected_kw=21.5, connected_kw_total=21.5, design_a=40.0, coincident=True),
        Circuit(ref="W2", description="Drum Filter Backwash", connected_kw=21.5, connected_kw_total=21.5, design_a=40.0, coincident=False)]
    rec2 = reconcile(pnl2)
    chk("I14.subsumed_kw_excluded_from_running", abs(rec2["sum_kw"] - 21.5) < 0.01)

    # I15 — ONE-MINT kW rescale MUST re-derive Design I (Codema 1820 Electrical 6.7:
    # Conn. load rescaled 30→18.33 kW but Design I stayed 56.6 A → implied pf·η 0.47).
    pnl3 = Panel(board_id="mdb", name="MAIN", kind="main", voltage_v=400.0, phases=3)
    # Pre-rescale: UV at hydraulic-misapplied ~30 kW → ~56.6 A FLC (motor pf/η).
    uv_a = flc_from_kw(30.0, 400.0, phases=3)
    pump_a = flc_from_kw(30.0, 400.0, phases=3)
    pnl3.circuits = [
        Circuit(ref="W2", description="UV Disinfection", connected_kw=30.0,
                connected_kw_total=30.0, design_a=uv_a, coincident=True,
                cable="4C · 16 mm²", device="MCCB 63 A", device_a=63),
        Circuit(ref="W3", description="Fertigation Pump", connected_kw=30.0,
                connected_kw_total=30.0, design_a=pump_a, coincident=True,
                cable="4C · 16 mm²", device="MCCB 63 A", device_a=63),
    ]
    st_recon = {"orchestratorContract": {"quantities": {
        "electrical_consumer__uv_disinfection_kw": {"value": 10.0},
        "electrical_consumer__fertigation_kw": {"value": 10.0},
    }}}
    _reconcile_panels_to_breakdown([pnl3], st_recon)
    # target Σ = 20 kW, raw = 60 → ratio 1/3 → each circuit 10 kW
    chk("I15.kw_rescaled_to_breakdown",
        abs((pnl3.circuits[0].connected_kw or 0) - 10.0) < 0.05)
    # Design I must match flc_from_kw(10) — not the stale 56.6 A
    expect_a = flc_from_kw(10.0, 400.0, phases=3)
    chk("I15.design_a_rederived_from_kw",
        expect_a is not None and abs((pnl3.circuits[0].design_a or 0) - expect_a) < 0.5)
    # implied pf·η from P = √3·V·I·pf·η → pf·η = P·1000/(√3·V·I) must sit in 0.60–1.05
    kw0 = pnl3.circuits[0].connected_kw or 0
    a0 = pnl3.circuits[0].design_a or 0
    implied = (kw0 * 1000.0) / (math.sqrt(3) * 400.0 * a0) if a0 > 0 else 0
    chk("I15.implied_pf_eta_in_band", 0.60 <= implied <= 1.05)

    if fails:
        print("[panel-sched] SELFTEST FAIL: " + ", ".join(fails))
        return 1
    print("[panel-sched] selftest OK (15 connected-load reconciliation invariants)")
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] in ("--selftest", "--self-test", "selftest"):
        return _selftest()
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
