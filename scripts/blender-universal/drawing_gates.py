#!/usr/bin/env python3
"""drawing_gates.py <out_dir> — DETERMINISTIC per-drawing quality gates (no LLM, £0, ~instant).

The self-correcting design loop's ≥8 stopping condition for the engineering DRAWINGS. The
multimodal council is expensive and judgment-based; most recurring drawing defects are actually
DETERMINISTIC and checkable from the data the drawings are generated from (state.json +
connection-schedule.json + route-manifest.json + parts-manifest.json + the rendered PNG dims):

  G1 LEGIBILITY        (a) every 2D drawing PNG aspect ratio ≤ 4:1 (a 9:1 strip is unreadable);
                       (b) MIN TEXT HEIGHT AT A1 PRINT SCALE: the drawing's smallest lettering,
                       printed at its A1 print scale (svg font-size × mm-per-px of its A1 sheet
                       set), must be ≥ 2.5 mm (ISO 3098 minimum lettering). A failing drawing
                       must PAGINATE onto more A1 sheets (bigger scale — a1_print.py), never
                       shrink content. Aspect stays as the secondary check (a 10:1 strip still
                       fails even with big text).
  G2 LOAD RECONCILE    the panel-schedule running total ≈ the contract connected_electrical_load_kw (±15%)
  G3 PART COVERAGE     every PRINCIPAL powered part (pump/blower/heat-pump/compressor/UV with a real kW)
                       in the BoM has its own 'supply → <part>' electrical edge in the connection schedule
  G4 MATERIAL DIVERSITY a multi-service plant uses ≥2 distinct pipe materials (not a uniform default)
  G5 QTY-N COVERAGE    each principal qty-N node (degasser/drum-filter/pump/tank count from the contract)
                       is represented by ~N instances in the parts manifest (not collapsed to 1)
  G6 NO STRAY BEAM     no routed CABLE run spans the plant as one overhead beam (≤16 m plan span)
  G7 SITE UTILISATION  plant hull ÷ deck area ≥ 0.45 (parts-manifest `site` block) — the deck
                       must hug the plant, not strand it in a corner (v52 measured 0.33)
  G8 CONNECTION SANITY (v55 scrambled-graph net, 2026-07-02) the connection graph must be
                       PHYSICALLY coherent, not merely referentially intact: (a) a fluid edge
                       may not terminate on switching/protection/control gear and a power feed
                       may not terminate on a pure storage vessel (service-domain, keyed on the
                       ledger's OWN classifier); (b) no self-loops (normalised names); (c) no
                       edge may carry a flow above the plant's own demand ceiling (max contract
                       flow qty × 5 — a 90 m³/h plant cannot carry a 300,000 m³/h line); (d) an
                       aggregate supply-demand quantity must reconcile against the connected
                       electrical load within ×10 (v55 shipped 132,599,650 kW on a 53 kW plant)
  G9 TAG LEGIBILITY    (v59 GA net, 2026-07-03) every equipment TAG on a drawing must be
                       READABLE: (i) no two tag bboxes may overlap >20% (v59 B–B shipped a
                       ~6-tag vertical pile-up over the tank nest; the plan/A–A titles were
                       overprinted); (ii) no tag bbox may extend past its view's border box
                       (v59 B–B clipped 'X-1…'/'TK-10…' mid-word off the sheet edge). Views
                       come from the generator's own `data-viewbox` markers (ONE shared rule
                       with draw_ga._TagPlacer bounds); a legacy SVG with no markers is
                       scored against the page rectangle, so the shipped v59 defect FIRES.

Each gate maps to the drawing(s) it scores. The scorecard is per-drawing (the worst failing gate sets
the drawing's verdict) + an overall ALL-PASS gate. Universal — keyed on the contract + manifests, never
a product class. Pure + deterministic → harness-testable directly (`--selftest`).
"""
from __future__ import annotations

import json
import os
import re
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from render_image_quality import evaluate_image
from render_view_contract import (
    is_product_scale,
    pack_drawings,
    required_views,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from placement_fp import (  # noqa: E402
    embed_svg_placement_fp,
    extract_svg_placement_fp,
    is_na_by_design,
    load_manifest_placement_fp,
    manifest_equipment_tags,
    phantom_equipment_tags,
    placement_fingerprint,
)
from ga_glance_audit import ga_glance_coherent  # noqa: E402
from drawing_vision_glance import drawing_vision_coherent, render_ga_coherent  # noqa: E402

# EVERY system drawing that can ship in the dossier — all must share one
# parts-manifest generation (G16). Tabular sheets (panel / process schedules)
# are included: Tristan 2026-07-14 "check on all of the drawings that they are
# consistent with each other" — a matching fingerprint + no phantom tags is the
# universal proof, whether the sheet is spatial or tabular.
_DRAWING_SET_SVG = (
    ("general-arrangement", "general-arrangement.svg"),
    ("interconnect", "interconnect.svg"),
    ("pid", "pid.svg"),
    ("block-flow-diagram", "block-flow-diagram.svg"),
    ("single-line-diagram", "single-line-diagram.svg"),
    ("panel-schedule", "panel-schedule.svg"),
    ("process-schedules", "process-schedules.svg"),
    ("facility-layout", "facility-layout.svg"),
    ("distribution-interface", "distribution-interface.svg"),
)
DRAWING_COVERAGE_MIN_PCT = 80.0
# Coverage floor applies to the process/spatial core. Panel / process-schedules /
# facility sheets are still fingerprint-checked (same generation) but their
# ledger denominators differ (circuits vs equipment) and are scored on the Excel
# Drawing tabs — not double-gated here.
_DRAWING_COVERAGE_KEYS = frozenset({
    "general-arrangement", "pid", "block-flow-diagram", "single-line-diagram",
})

# Map drawing-file stem → pack_drawings() key (render_view_contract).
_STEM_TO_PACK_KEY = {
    "general-arrangement": "general-arrangement",
    "interconnect": "interconnect",
    "pid": "pid",
    "block-flow-diagram": "bfd",
    "single-line-diagram": "single-line",
    "panel-schedule": "panel-schedule",
    "process-schedules": "process-schedules",
    "hvac-layout": "hvac",
    "facility-layout": "facility-layout",
    "distribution-interface": "distribution-interface",
}


def _in_drawing_pack(state: dict, stem: str) -> bool:
    """True when this stem belongs in the form-factor pack (else abstain)."""
    pk = _STEM_TO_PACK_KEY.get(stem, stem)
    return pk in pack_drawings(state or {})


@dataclass
class Gate:
    name: str
    drawings: list           # which drawing(s) this gate scores
    severity: str            # 'high' | 'med' | 'low'
    passed: bool
    detail: str


def _png_wh(path: str):
    """(width, height) of a PNG from its header — no PIL dependency. None if unreadable."""
    try:
        with open(path, "rb") as f:
            head = f.read(24)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        return struct.unpack(">II", head[16:24])
    except Exception:
        return None


def _q(state: dict, key: str):
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = (state.get(ck) or {}).get("quantities")
        if isinstance(qs, dict) and key in qs:
            v = qs[key]
            return v.get("value") if isinstance(v, dict) else v
    return None


_G2_STOP = {"electrical", "consumer", "connected", "load", "power", "kw",
            "system", "total"}


def _g2_panel_total(panel_md: str, state: dict):
    """Select the panel whose circuits match electrical_consumer__* contract keys."""
    candidates = []
    for section in re.split(r"(?m)^##\s+", panel_md or "")[1:]:
        lines = section.splitlines()
        board = lines[0].strip() if lines else "?"
        match = re.search(
            r"Total connected load\D*([\d,]+(?:\.\d+)?)\s*kW", section, re.I)
        if match:
            candidates.append(
                (board, float(match.group(1).replace(",", "")), section))
    if not candidates:
        return None, None

    quantities = {}
    for contract_key in ("orchestratorContract", "engineeringContract"):
        q = (state.get(contract_key) or {}).get("quantities")
        if isinstance(q, dict) and q:
            quantities = q
            break
    items = []
    for key, raw in quantities.items():
        if not re.match(r"^electrical_consumer__.+_kw$", str(key), re.I):
            continue
        value = raw.get("value") if isinstance(raw, dict) else raw
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        stem = re.sub(r"^electrical_consumer__|_kw$", "", str(key).lower())
        tokens = {token for token in re.split(r"[^a-z0-9]+", stem)
                  if len(token) > 2 and token not in _G2_STOP}
        if tokens and value > 0:
            items.append((tokens, value))
    if items:
        ranked = []
        for board, value, section in candidates:
            section_tokens = set(re.split(r"[^a-z0-9]+", section.lower()))
            score = sum(weight for tokens, weight in items if tokens & section_tokens)
            ranked.append((score, board, value))
        ranked.sort(key=lambda item: item[0], reverse=True)
        if ranked[0][0] > 0:
            return ranked[0][2], ranked[0][1]
    return candidates[0][1], candidates[0][0]


_PRINCIPAL_POWERED_RE = re.compile(
    r"\bpump\b|blower|compressor|\bfan\b|heat\s*pump|\buv\b|ozone|skimmer|degasser|"
    r"dehumidifier|aerat|oxygenat|centrifuge|mixer|agitator|drive\b", re.I)
# passive / instrument / structural rows that legitimately need NO dedicated power feeder
_NON_POWERED_RE = re.compile(
    r"\bmedia\b|\bcarrier\b|packing|\bfill\b|\bmesh\b|tank\b|vessel\b|pipe\b|valve\b|"
    r"analy[sz]|sensor|transmitter|\bprobe\b|gauge|\bmeter\b|monitor|slab|frame|panel\b|"
    r"enclosure|busbar|fuse|surge|cable|connection|\bmedia\b", re.I)


def _housed_power_re():
    """The cabinet-HOUSED power-gear rule — ONE rule shared with the ledger.

    parts_ledger._HOUSED_POWER_RE classifies a VFD / variable-frequency drive /
    soft-start / breaker / contactor / protection relay as CABINET CONTENTS (the
    cabinet deck houses it inside the MCC / power board), and ga_massing drops
    the same vocabulary from the GA as switchgear/panel internals. Such a device
    is fed by the panel BUSBAR inside its enclosure — there is never an authored
    'supply → <device>' edge on the single-line, so requiring one is an
    EXPECTATION bug: G3 flagged 'Vfd Drive' with no electrical feeder run after
    run (v54…v56d) while the motor it drives (the pump) carried the real feeder.
    Import the ledger's own regex so the gate and the ledger can never diverge;
    the inline fallback mirrors it only when the sibling import is unavailable."""
    try:
        import parts_ledger
        return parts_ledger._HOUSED_POWER_RE
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            import parts_ledger
            return parts_ledger._HOUSED_POWER_RE
        except ImportError:
            # MIRROR of parts_ledger._HOUSED_POWER_RE (fallback only — keep in sync)
            return re.compile(
                r"\bbreaker\b|\bfuse\b|surge|\bSPD\b|\brelay\b|\bMCB\b|\bMCCB\b|\bMPCB\b|\bRCD\b|\bRCBO\b|"
                r"contactor|isolator|motor[- ]?protection|earth[- ]?leakage|\bVFD\b|variable[- ]?frequency|"
                r"frequency\s*drive|soft[- ]?start|blower/centrifuge\s*VSD", re.I)


def g3_missing_feeders(bom: list, elec_dests: set) -> list:
    """PURE G3 decision — the principal powered BoM heads with NO electrical
    feeder edge. Extracted from run_gates so the selftest can proveCatch the
    housed-power carve-out directly. A head is required to have its own
    'supply → <part>' edge iff it matches the principal-powered vocabulary AND
    is neither passive/instrument gear (_NON_POWERED_RE) NOR cabinet-housed
    power gear (parts_ledger._HOUSED_POWER_RE — panel-internal, busbar-fed)."""
    housed = _housed_power_re()
    missing = []
    seen = set()
    for r in bom:
        if not isinstance(r, dict):
            continue
        req = str(r.get("requirement") or "")
        head = req.split("·", 1)[0].strip()
        if "connection" in head.lower() or "↳" in head:
            continue
        if not _PRINCIPAL_POWERED_RE.search(head) or _NON_POWERED_RE.search(head):
            continue
        # Cabinet-housed power gear (VFD / soft-start / starter / protection):
        # fed by the panel busbar INSIDE its enclosure — the cabinet deck proves
        # that tie; a dedicated one-line feeder is not the drawing convention.
        if housed.search(head):
            continue
        key = head.lower()
        if key in seen:
            continue
        seen.add(key)
        # is this principal powered part fed? (its head tokens ⊆ some electrical destination)
        htoks = set(re.findall(r"[a-z0-9]+", key))
        fed = any(htoks and htoks <= set(re.findall(r"[a-z0-9]+", d)) for d in elec_dests)
        if not fed:
            missing.append(head)
    return missing


# ── G1b — min text height at A1 print scale (ISO 3098: ≥2.5 mm lettering) ─────────
# Drawings with an A1 print pipeline (a1_print.py, hooked in their generators):
# gate name → the print set's file base (<base>-A1.pdf / <base>-A1.json).
_A1_PRINT_BASES = {"pid": "pid", "block-flow-diagram": "bfd",
                   "single-line-diagram": "single-line", "hvac-layout": "hvac"}
A1_MIN_TEXT_MM = 2.5


def _a1_mod():
    """Lazy sibling import of a1_print (pure planning maths — stdlib only)."""
    try:
        import a1_print
        return a1_print
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            import a1_print
            return a1_print
        except ImportError:
            return None


def _min_text_on_a1(dd: str, nm: str, base: str):
    """(min_text_mm, source) for drawing <nm> at its A1 print scale, or None when the
    drawing was not produced / carries no text. Prefers the DELIVERED A1 print set's
    manifest (<base>-A1.json with real PDFs); falls back to the one-A1-sheet fit scale
    computed from the SVG, so a missing/failed pagination is scored, not skipped."""
    man_path = os.path.join(dd, f"{base}-A1.json")
    if os.path.exists(man_path):
        try:
            man = json.load(open(man_path))
            mm = man.get("min_text_mm")
            if man.get("pdf_ok") and man.get("pdfs") and isinstance(mm, (int, float)):
                return float(mm), (f"{man['sheets']} A1 sheet(s) "
                                   f"[{man['grid'][0]}x{man['grid'][1]}], "
                                   f"1 px = {man['mm_per_px']:.4f} mm")
        except Exception:
            pass
    svg_path = os.path.join(dd, nm + ".svg")
    a1 = _a1_mod()
    if a1 is None or not os.path.exists(svg_path):
        return None
    try:
        svg = open(svg_path).read()
    except OSError:
        return None
    dims, font = a1.svg_px_dims(svg), a1.min_font_px(svg)
    if not dims or not font:
        return None
    return font * a1.sheet_scale_mm_per_px(dims[0], dims[1], 1, 1), \
        "one-A1-sheet fit (NO delivered A1 print set — paginate via a1_print)"


def _rows(d):
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        for k in ("rows", "lines", "items", "parts", "connections"):
            if isinstance(d.get(k), list):
                return d[k]
    return []


# ── G8 CONNECTION SANITY (2026-07-02, the v55 scrambled-graph deterministic net) ─────────
# v55 shipped 86 connections all reading 'OK' because the existing trace gates check
# referential integrity, never PHYSICAL coherence: water was routed INTO the Mains Incomer,
# the Connection trace carried a 'Cip Tank → Cip Tank' self-loop, and a 90 m³/h plant carried
# six parallel DN300 runs rated '90 m³/s' (= 324,000 m³/h) @ 205.6 m/s — cascading into
# total_supply_demand_kw = 132,599,650 kW on a 53 kW plant (the 132.6 GW cover + 201 MA
# busbar). The checks are keyed on connection_ledger's OWN classifiers so the authoring rule
# and this gate can never drift apart.

def _cl_mod():
    """Lazy sibling import of connection_ledger (pure, stdlib-only — the classifiers)."""
    try:
        import connection_ledger
        return connection_ledger
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            import connection_ledger
            return connection_ledger
        except ImportError:
            return None


# an aggregate supply demand (plant load + distribution parasitic) can sit above the
# connected load, but never an order of magnitude above it — beyond this it is a phantom
# artefact (v55: ×2,501,880), not a design output.
AGG_SUPPLY_DEMAND_FACTOR = 10.0

_RATING_FLOW_RE = re.compile(
    r"([\d,]+(?:\.\d+)?)\s*(m³/s|m3/s|m\^3/s|m³/h|m3/h|m\^3/h|l/s|l/min|l/h)", re.I)


def connection_sanity_findings(ledger_rows, schedule_rows, quantities):
    """PURE check — list of finding strings (empty = sane). See the G8 doc block above."""
    cl = _cl_mod()
    if cl is None:
        return []
    findings = []

    def _svc(r):
        return str(r.get("service") or r.get("_ledger_service") or "").lower()

    def _ends(r):
        return (str(r.get("from_part") or r.get("from") or ""),
                str(r.get("to_part") or r.get("to") or ""))

    # (a) SERVICE-DOMAIN — fluid on switch/control gear; power into a pure storage vessel
    for r in ledger_rows or []:
        if not isinstance(r, dict):
            continue
        a, b = _ends(r)
        svc = _svc(r)
        if svc in cl._FLUID_SERVICES:
            for nm in (a, b):
                if nm and cl.SWITCH_CONTROL_GEAR_RE.search(nm):
                    findings.append(f"fluid[{svc}] edge on electrical/control gear: {a} → {b}")
                    break
        elif svc == "power":
            if (b and cl.PURE_STORAGE_RE.search(b)
                    and not cl.POWERED_INTERNALS_RE.search(b)):
                findings.append(f"power feed into a pure storage vessel: {a} → {b}")

    # (b) SELF-LOOPS — normalised names, on the ledger AND the sized schedule
    for src, rows in (("ledger", ledger_rows), ("schedule", schedule_rows)):
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            a, b = _ends(r)
            if a and b and cl._norm_name(a) == cl._norm_name(b):
                findings.append(f"self-loop ({src}): {a} → {b}")

    # (c) PER-EDGE FLOW CEILING — the plant's own demand family bounds every line
    ceiling = cl.plant_flow_ceiling_m3h(quantities or {})
    if ceiling:
        limit = ceiling * cl.FLOW_CEILING_FACTOR
        for r in ledger_rows or []:
            if not isinstance(r, dict):
                continue
            if r.get("flow_implausible"):
                a, b = _ends(r)
                findings.append(f"implausible flow (ledger-marked): {a} → {b} — {r['flow_implausible']}")
                continue
            v = r.get("required_value")
            unit = str(r.get("required_unit") or "").strip().lower()
            factor = cl._VOL_FLOW_TO_M3H.get(unit)
            try:
                v = float(v)
            except (TypeError, ValueError):
                continue
            if factor and v * factor > limit:
                a, b = _ends(r)
                findings.append(f"flow over plant ceiling: {a} → {b} carries {v:g} {unit} = "
                                f"{v * factor:g} m³/h > {ceiling:g} × {cl.FLOW_CEILING_FACTOR:g}")
        for r in schedule_rows or []:
            if not isinstance(r, dict):
                continue
            m = _RATING_FLOW_RE.search(str(r.get("rating") or ""))
            if not m:
                continue
            v = float(m.group(1).replace(",", ""))
            factor = cl._VOL_FLOW_TO_M3H.get(m.group(2).lower())
            if factor and v * factor > limit:
                a, b = _ends(r)
                findings.append(f"sized run over plant ceiling: {a} → {b} rated "
                                f"{m.group(0)} = {v * factor:g} m³/h > {ceiling:g} × "
                                f"{cl.FLOW_CEILING_FACTOR:g}")

    # (d) AGGREGATE SUPPLY-DEMAND RECONCILE — total_supply_demand_kw vs the connected load
    def _qv(key):
        v = (quantities or {}).get(key)
        v = v.get("value") if isinstance(v, dict) else v
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    supply = _qv("total_supply_demand_kw")
    base = _qv("connected_electrical_load_kw") or _qv("total_electrical_demand_kw")
    if supply and base and supply > base * AGG_SUPPLY_DEMAND_FACTOR:
        findings.append(f"aggregate supply demand {supply:g} kW is ×{supply / base:,.0f} the "
                        f"connected load {base:g} kW (limit ×{AGG_SUPPLY_DEMAND_FACTOR:g}) — "
                        f"a phantom artefact, not a design output")
    return findings


# ── G9 TAG LEGIBILITY (2026-07-03, the v59 GA-elevation pile-up + clip net) ─────────
# v59's scores could not see that BOTH GA elevations failed a 5-second glance: B–B had a
# vertical pile of ~6 colliding tags over the tank nest, tags overprinted the view titles,
# and the B–B right edge clipped tags mid-word. Deterministic: parse the SVG's own <text>
# elements, keep only equipment-tag-shaped labels ('TK-104', ranges 'TK-106…TK-113'),
# rebuild each bbox with the SAME char-width model the generator's _TagPlacer used, and
# score (i) pairwise overlap and (ii) containment in the view's `data-viewbox` border box.

TAG_OVERLAP_MAX = 0.20          # >20% bbox intersection (over the smaller bbox) = a pile-up
_TAG_LABEL_RE = re.compile(
    r"^[A-Z]{1,4}-\d+[A-Za-z]?(?:…[A-Z]{1,4}-\d+[A-Za-z]?)?$")
_VIEWBOX_RE = re.compile(
    r'<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"'
    r'[^>]*data-viewbox="([^"]+)"')
_TEXT_EL_RE = re.compile(r"<text\s([^>]*)>([^<]*)</text>")
_ATTR_RE = re.compile(r'([a-zA-Z-]+)="([^"]*)"')


def _tag_char_w():
    """The generator's OWN char-width model (draw_ga._TagPlacer.CHAR_W) — one shared
    rule, so the gate's bboxes are the placer's bboxes. Mirror constant on import miss."""
    try:
        import draw_ga
        return float(draw_ga._TagPlacer.CHAR_W)
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            import draw_ga
            return float(draw_ga._TagPlacer.CHAR_W)
        except ImportError:
            return 0.62   # MIRROR of draw_ga._TagPlacer.CHAR_W (keep in sync)


def tag_legibility_findings(svg_text: str) -> list:
    """PURE G9 check — list of finding strings (empty = every tag legible).
    (i) two tag bboxes in the SAME view overlapping >TAG_OVERLAP_MAX of the smaller;
    (ii) a tag bbox extending past its view's `data-viewbox` border (fallback: the
    page rect when a legacy SVG carries no markers — the shipped-v59 case)."""
    boxes = {}
    for m in _VIEWBOX_RE.finditer(svg_text):
        x, y, w, h = (float(m.group(i)) for i in range(1, 5))
        boxes[m.group(5)] = (x, y, x + w, y + h)
    msvg = re.search(r'<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"', svg_text)
    sheet = (0.0, 0.0, float(msvg.group(1)), float(msvg.group(2))) if msvg else None
    cw = _tag_char_w()

    tags = []   # (view_name_or_None, label, bbox)
    for m in _TEXT_EL_RE.finditer(svg_text):
        attrs = dict(_ATTR_RE.findall(m.group(1)))
        label = m.group(2).strip()
        if not _TAG_LABEL_RE.match(label):
            continue                       # titles, dims, notes — never scored
        if "transform" in attrs:
            continue                       # rotated dimension text is not a tag
        try:
            x = float(attrs["x"])
            y = float(attrs["y"])
            size = float(attrs.get("font-size", 10))
        except (KeyError, ValueError):
            continue
        w = cw * size * len(label)
        x0 = x - w / 2.0 if attrs.get("text-anchor") == "middle" else x
        bb = (x0, y - 0.78 * size, x0 + w, y + 0.22 * size)
        cx, cy = (bb[0] + bb[2]) / 2.0, (bb[1] + bb[3]) / 2.0
        view = None
        for nm in sorted(boxes):
            b = boxes[nm]
            if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
                view = nm
                break
        tags.append((view, label, bb))

    findings = []
    # (i) pairwise pile-up within one view (or the un-marked sheet)
    for i in range(len(tags)):
        for j in range(i + 1, len(tags)):
            va, ta, a = tags[i]
            vb, tb, b = tags[j]
            if va != vb:
                continue
            ix = min(a[2], b[2]) - max(a[0], b[0])
            iy = min(a[3], b[3]) - max(a[1], b[1])
            if ix <= 0 or iy <= 0:
                continue
            amin = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
            if amin > 0 and (ix * iy) / amin > TAG_OVERLAP_MAX:
                findings.append(f"tag pile-up in {va or 'sheet'}: '{ta}' ∩ '{tb}' = "
                                f"{(ix * iy) / amin:.0%} of the smaller bbox (max "
                                f"{TAG_OVERLAP_MAX:.0%})")
    # (ii) a tag past its view border box is CLIPPED (mid-word at the sheet edge)
    for view, label, bb in tags:
        box = boxes.get(view) or sheet
        if box is None:
            continue
        if (bb[0] < box[0] - 0.5 or bb[2] > box[2] + 0.5
                or bb[1] < box[1] - 0.5 or bb[3] > box[3] + 0.5):
            findings.append(f"tag '{label}' extends past its view border "
                            f"({view or 'sheet'}) — clipped text")
    return findings


_THIN_PLATE_RE = re.compile(
    r"\bbase\s*plate\b|\bmounting\s*plate\b|\bbracket\b|\bstandoff\b", re.I)

# PROVENANCE allow-list for DELIBERATE above-lid features (2026-07-26). A part may sit
# proud of the enclosure lid ONLY when a seating pass explicitly put it there and stamped
# its `geometry_source` — the on-top culture vessel (instrument_spine_manifest.
# seat_vessel_on_top_from_mesh) and the exterior signature features registered in
# build_universal_scene._ABOVE_LID_SIGNATURE_MESHES (optical tower, collar, fascia).
#
# WHY THIS REPLACED A GEOMETRIC TEST: the previous rule exempted ANY part whose centre-z
# cleared the lid. That inverted G19's intent — the further a part was dumped out of
# containment, the more certainly it was excluded from the check, so the gate could not
# fail on its own adversarial input (a Peltier TEC module parked 25 mm above the lid on
# the organoid r11 bake was silently dropped, along with 12 other internal parts). A gate
# that cannot catch its adversarial input is decoration (GATE INTENT RULE). Provenance is
# the same doctrine the Blender-side containment clamp already honours: an intentional
# exterior feature is exempt because a builder SAID SO, never because of where it landed.
# SCOPED CONTAINMENT EXEMPTION (SOL audit item 2, 2026-07-27).
#
# The previous allow-list accepted a broad `geometry_source` string. That exempted TEN
# rows on the organoid, of which SEVEN were ordinary INTERIOR parts (HMI display, three
# buttons, indicator, port, front fascia — all below the 408 mm lid). Any mis-aliased
# interior component could escape shell containment just by carrying that string: the
# same shape of hole as the geometric above-lid exemption this gate replaced in
# aafce5dd6, re-created one layer up.
#
# A part must now PROVE all of the following to be exempt:
#   1. it is a bom_component, not a drawing-only feature;
#   2. its geometry came from a registered signature mesh (not a proxy or a guess);
#   3. its signature family is one of the narrow PHYSICAL above-lid families;
#   4. the builder explicitly declared the exterior_above_lid placement intent;
#   5. it carries the join proof recording HOW that binding was made.
# An HMI feature satisfies (1) and (2) and is still — correctly — refused.
_ABOVE_LID_EXEMPT_FAMILIES = frozenset({"vessel", "vessel_collar", "od_sensor"})
_RETIRED_BLANKET_SOURCE = "exterior_signature_mesh"


def _is_intentional_above_lid(part: dict) -> bool:
    """True only for a BoM component bound to a registered PHYSICAL above-lid feature."""
    if not isinstance(part, dict):
        return False
    return (
        str(part.get("entity_type") or "").strip() == "bom_component"
        and str(part.get("geometry_source") or "").strip()
        == "registered_signature_component_mesh"
        and str(part.get("signature_family") or "").strip() in _ABOVE_LID_EXEMPT_FAMILIES
        and str(part.get("placement_intent") or "").strip() == "exterior_above_lid"
        and str(part.get("placement_proof") or "").strip()
        == "signature_mesh_family_join_v1"
    )


def _retired_blanket_exemptions(parts: list) -> list:
    """Rows still carrying the retired blanket source — a build that predates the scoping.

    Reported rather than silently honoured: the old string granted an unearned pass, so a
    manifest still using it must be re-baked, not trusted.
    """
    return [str(p.get("equipment_tag") or p.get("tag") or "?")
            for p in (parts or []) if isinstance(p, dict)
            and str(p.get("geometry_source") or "") == _RETIRED_BLANKET_SOURCE]


def _interior_bbox_from_parts(
    parts: list,
    shell_pos_z: float,
    shell_h: float,
) -> Optional[tuple]:
    """Compute a bbox from the parts the shell MUST contain, excluding:
    - the shell itself
    - thin structural plates (min dim < 20 mm — base plates, brackets)
    - parts stamped as DELIBERATE above-lid features (provenance, not geometry —
      see _is_intentional_above_lid); for those that straddle the lid only the
      interior PORTION counts.

    An UNSTAMPED part sitting proud of the lid is counted IN FULL — that protrusion is
    precisely the defect G19 exists to catch, not a reason to skip the part.
    Returns (w_span, d_span, h_span) or None if no containable parts.
    """
    _shell_re_inner = re.compile(
        r"\benclosure\s*shell\b|\bhousing\s*shell\b|\bcabinet\s*shell\b", re.I)
    shell_z_top = shell_pos_z + shell_h / 2.0
    shell_z_bot = shell_pos_z - shell_h / 2.0
    xs, ys, zs_lo, zs_hi = [], [], [], []
    for p in parts:
        if not isinstance(p, dict):
            continue
        nm = str(p.get("name") or "")
        if _shell_re_inner.search(nm):
            continue
        d = p.get("dims_mm") or {}
        pos = p.get("pos_mm")
        if not d or not pos:
            continue
        if isinstance(pos, list):
            px, py, pz = float(pos[0]), float(pos[1]), float(pos[2])
        elif isinstance(pos, dict):
            px = float(pos.get("x") or 0)
            py = float(pos.get("y") or 0)
            pz = float(pos.get("z") or 0)
        else:
            continue
        if "dia" in d:
            hw = float(d.get("dia") or 0) / 2.0
            hd = hw
            hh = float(d.get("len") or 0) / 2.0
        else:
            hw = float(d.get("w") or 0) / 2.0
            hd = float(d.get("d") or 0) / 2.0
            hh = float(d.get("h") or 0) / 2.0
        if hw == 0 and hd == 0 and hh == 0:
            continue
        dims_vals = sorted([hw * 2, hd * 2, hh * 2])
        if dims_vals[0] < 20.0 and _THIN_PLATE_RE.search(nm):
            continue
        _intentional = _is_intentional_above_lid(p)
        if pz > shell_z_top and _intentional:
            continue          # deliberate exterior feature — exempt BY PROVENANCE
        z_lo = pz - hh
        z_hi = pz + hh
        # Clip the above-lid portion ONLY for a stamped feature (its interior portion is
        # what the shell must contain). An unstamped part counts in FULL, protrusion and
        # all, so the containment span reflects the real overshoot.
        z_hi_clipped = min(z_hi, shell_z_top) if _intentional else z_hi
        z_lo_clipped = max(z_lo, shell_z_bot)
        if z_hi_clipped <= z_lo_clipped:
            continue
        xs += [px - hw, px + hw]
        ys += [py - hd, py + hd]
        zs_lo.append(z_lo_clipped)
        zs_hi.append(z_hi_clipped)
    if not xs:
        return None
    w_span = max(xs) - min(xs)
    d_span = max(ys) - min(ys)
    h_span = max(zs_hi) - min(zs_lo)
    return (w_span, d_span, h_span)


def enclosure_shell_contains_check(
    parts: list,
    pm_bbox: Optional[dict],
    tol_mm: float = 10.0,
) -> tuple:
    """PURE G19 — shell dims ⊇ contained parts bbox within tolerance.

    Finds the Enclosure Shell part's dims, then computes the bbox of the parts the
    shell MUST contain — excluding thin structural plates (base plates, brackets) and
    parts stamped as DELIBERATE above-lid features via `geometry_source`
    (_is_intentional_above_lid). An UNSTAMPED part sitting proud of the lid counts
    IN FULL: that protrusion is the defect this gate exists to catch, so it must move the
    span rather than earn an exemption. Checks containment of THIS filtered bbox, not the
    raw pm_bbox which includes deliberate exterior features.
    Returns (passed, detail).
    """
    # A manifest still using the RETIRED blanket source predates the exemption scoping
    # (SOL item 2). That string handed an unearned containment pass to interior parts —
    # 7 of 10 exempted rows on the organoid — so such a manifest is refused outright
    # rather than re-interpreted under the new rules.
    _retired = _retired_blanket_exemptions(parts)
    if _retired:
        return (False,
                f"{len(_retired)} row(s) carry the RETIRED blanket exemption "
                f"'{_RETIRED_BLANKET_SOURCE}' (e.g. {', '.join(_retired[:4])}) — it "
                "granted an unearned pass to interior parts; re-bake so rows carry a "
                "scoped signature_family + placement_intent + placement_proof")
    # Find the Enclosure Shell part
    shell_w = shell_d = shell_h = None
    shell_pos_z = 0.0
    _shell_re = re.compile(r"\benclosure\s*shell\b|\bhousing\s*shell\b|\bcabinet\s*shell\b", re.I)
    for p in parts:
        if not isinstance(p, dict):
            continue
        nm = str(p.get("name") or "")
        if _shell_re.search(nm):
            d = p.get("dims_mm") or {}
            if isinstance(d, dict):
                shell_w = float(d.get("w") or 0)
                shell_d_val = float(d.get("d") or 0)
                shell_h = float(d.get("h") or 0)
                shell_d = shell_d_val
            pos = p.get("pos_mm")
            if isinstance(pos, list) and len(pos) >= 3:
                shell_pos_z = float(pos[2])
            elif isinstance(pos, dict):
                shell_pos_z = float(pos.get("z") or 0)
            break

    if shell_w is None or shell_w == 0:
        return (True, "no Enclosure Shell part in manifest — abstain")

    interior = _interior_bbox_from_parts(parts, shell_pos_z, shell_h)
    if interior is None:
        if not pm_bbox or not isinstance(pm_bbox, dict):
            return (True, "no parts-manifest bbox — abstain")
        parts_w = float(pm_bbox.get("length_mm") or 0)
        parts_d = float(pm_bbox.get("width_mm") or 0)
        parts_h = float(pm_bbox.get("height_mm") or 0)
    else:
        parts_w, parts_d, parts_h = interior

    if parts_w == 0 or parts_h == 0:
        return (True, "parts bbox dims zero — abstain")

    # Check containment PER AXIS. Both triples come from the SAME manifest in the SAME
    # convention (w↔x, d↔y, h↔z), so there is no axis-flip ambiguity to defend against.
    # The old code sorted both triples largest→smallest before comparing, which silently
    # compared HEIGHT against LENGTH: a 160 mm-tall stack "fitted" a 108 mm-tall shell
    # because the shell was 242 mm long. Containment is not a multiset property — a part
    # must fit on the axis it actually occupies. (The sorted form is still correct in G20
    # / envelope_equality_cross_check, where a drawing CAPTION may legitimately list its
    # dims in a different order; that is a different question on a different input.)
    _axes = (("length (x)", parts_w, shell_w),
             ("depth (y)", parts_d, shell_d),
             ("height (z)", parts_h, shell_h))
    violations = []
    for _ax_name, _p_dim, _s_dim in _axes:
        if _s_dim and _p_dim > _s_dim + tol_mm:
            violations.append(f"{_ax_name}: parts {_p_dim:.0f} mm > shell {_s_dim:.0f} mm "
                              f"(excess {_p_dim - _s_dim:.0f} mm, tol ±{tol_mm:.0f} mm)")

    _suffix = (" (containable bbox: excl. base plates + provenance-stamped "
               "above-lid features)")
    _parts_str = f"{parts_w:.0f}×{parts_d:.0f}×{parts_h:.0f} mm"
    _shell_str = f"{shell_w:.0f}×{shell_d:.0f}×{shell_h:.0f} mm"
    if violations:
        return (False, f"parts bbox {_parts_str} exceeds shell {_shell_str}: "
                       + "; ".join(violations) + _suffix)

    return (True, f"shell {_shell_str} ⊇ parts {_parts_str} "
                  f"(within ±{tol_mm:.0f} mm, per-axis)" + _suffix)


_SHELL_RE_G20 = re.compile(r"\benclosure\s*shell\b|\bhousing\s*shell\b|\bcabinet\s*shell\b", re.I)
_CAPTION_NUM_RE = re.compile(r"[-+]?\d*\.?\d+")


def _canonical_shell_dims_mm(parts: list):
    """(w, d, h) mm from the manifest 'Enclosure Shell' part's dims_mm, or None."""
    for p in parts or []:
        if not isinstance(p, dict):
            continue
        if _SHELL_RE_G20.search(str(p.get("name") or "")):
            d = p.get("dims_mm") or {}
            if isinstance(d, dict):
                w = float(d.get("w") or 0)
                depth = float(d.get("d") or 0)
                h = float(d.get("h") or 0)
                if w > 0 and depth > 0 and h > 0:
                    return (w, depth, h)
    return None


def _parse_caption_envelope_mm(caption: str):
    """Parse the drawing-caption envelope string into an (a, b, c) mm triple, or None.

    The drawing emits either 'W × D × H mm' (manifest-shell path, canonical) or
    'L × W × H m' (metre fallback path). Detects the unit from the trailing token and
    converts metres→mm so the comparison is always in mm. Returns None if it can't
    parse three numbers (nothing to compare — abstain).
    """
    if not caption:
        return None
    nums = [float(x) for x in _CAPTION_NUM_RE.findall(caption)]
    if len(nums) < 3:
        return None
    a, b, c = nums[0], nums[1], nums[2]
    # Metre string ('… m' but NOT '… mm') → convert to mm.
    tail = caption.strip().lower()
    is_mm = tail.endswith("mm")
    is_m = tail.endswith(" m") or (tail.endswith("m") and not is_mm)
    if is_m and not is_mm:
        a, b, c = a * 1000.0, b * 1000.0, c * 1000.0
    if a <= 0 or b <= 0 or c <= 0:
        return None
    return (a, b, c)


def envelope_equality_cross_check(
    parts: list,
    caption_dims,
    tol_frac: float = 0.02,
    tol_mm: float = 2.0,
) -> tuple:
    """PURE G20 — the DELIVERED drawing-caption envelope must EQUAL the canonical shell.

    INTENT (2026-07-22, envelope-equality coherence): the canonical envelope is the
    Enclosure Shell dims_mm in parts-manifest.json, which grows at render time to
    contain the placed parts (council-approved reorder, commit 439e2bc91). The Equipment
    & Dimensions Register reads dims_mm directly; the drawing caption is now routed
    (generate_drawing_set._manifest_envelope_dims) to read the SAME manifest shell — so
    both surfaces equal the canonical shell BY CONSTRUCTION.

    This gate compares the value the DRAWING ACTUALLY EMITS (`caption_dims` — the parsed
    output of the drawing's own `_manifest_envelope_dims` resolver, NOT the superseded
    state pre-estimate) against the canonical manifest shell. On a coherent bake they are
    identical (the caption reads the shell). If a future regression makes the caption
    resolver fall back to the state pre-estimate — or any other source — the emitted
    value diverges from the manifest shell and G20 FIRES. THAT is the real regression
    guard: it proves the delivered artefacts stay routed to the one canonical model.

    Args:
        parts:        parts-manifest 'parts' list (source of the canonical shell dims).
        caption_dims: the drawing's DELIVERED envelope as an (a, b, c) mm triple —
                      parse the drawing caption string via `_parse_caption_envelope_mm`.

    Abstains when:
    - No Enclosure Shell part in the manifest (non-enclosure / plant-scale archetypes).
    - caption_dims is None (the drawing emitted no parseable envelope — nothing to check).

    UNIVERSAL — keyed on the Enclosure Shell presence, never on a product class slug.
    """
    canonical = _canonical_shell_dims_mm(parts)
    if canonical is None:
        return (True, "no Enclosure Shell in manifest — abstain (non-enclosure product)")

    if not caption_dims or len(caption_dims) < 3:
        return (True, "no parseable drawing-caption envelope — abstain")

    cap_w, cap_d, cap_h = float(caption_dims[0]), float(caption_dims[1]), float(caption_dims[2])
    if cap_w <= 0 or cap_d <= 0 or cap_h <= 0:
        return (True, "drawing-caption envelope has non-positive dims — abstain")

    # Compare sorted triples (dimension-agnostic — avoids W/D axis-flip false positives).
    canon_sorted = sorted(canonical, reverse=True)
    cap_sorted = sorted([cap_w, cap_d, cap_h], reverse=True)

    violations = []
    dim_names = ["largest", "middle", "smallest"]
    for i, (c, cap) in enumerate(zip(canon_sorted, cap_sorted)):
        allowed = max(tol_mm, c * tol_frac)
        diff = abs(c - cap)
        if diff > allowed:
            violations.append(
                f"{dim_names[i]} dim: canonical shell {c:.1f} mm vs drawing caption {cap:.1f} mm "
                f"(diff {diff:.1f} mm > tol {allowed:.1f} mm)"
            )

    if violations:
        return (False,
                f"envelope MISMATCH — drawing caption "
                f"{cap_sorted[0]:.0f}×{cap_sorted[1]:.0f}×{cap_sorted[2]:.0f} mm "
                f"≠ canonical manifest shell "
                f"{canon_sorted[0]:.0f}×{canon_sorted[1]:.0f}×{canon_sorted[2]:.0f} mm: "
                + "; ".join(violations)
                + " — fix: route generate_drawing_set._manifest_envelope_dims to read the "
                "canonical parts-manifest Enclosure Shell dims_mm (it fell back to another "
                "source — e.g. the superseded state pre-estimate)")

    return (True,
            f"envelope MATCH — drawing caption "
            f"{cap_sorted[0]:.0f}×{cap_sorted[1]:.0f}×{cap_sorted[2]:.0f} mm "
            f"equals canonical manifest shell "
            f"{canon_sorted[0]:.0f}×{canon_sorted[1]:.0f}×{canon_sorted[2]:.0f} mm "
            f"(within ±{max(tol_mm, canon_sorted[0] * tol_frac):.1f} mm / {tol_frac*100:.0f}%)")


_VESSEL_NOUN_GATE = re.compile(
    r"\b(vial|culture\s+vessel|culture\s+chamber|bioreactor\s+vessel|culture\s+flask|"
    r"reaction\s+vessel|growth\s+vessel)\b", re.I)
_VESSEL_EXCL_GATE = re.compile(
    r"holder|fixture|probe|thermistor|\bcap\b|\blid\b|seal|collar|septum|clamp|port|tubing",
    re.I)


def vessel_manifest_realistic_check(parts, is_instrument):
    """Deterministic backstop for the vessel-unification seat (2026-07-25).

    The culture vessel is DRAWN from its cutaway-cue geometry (~30×63 mm for a 20 ml
    vial) but the manifest can silently key off the tiny HIDDEN base pack-mesh (2.9 mm)
    — so the GA drew a vessel ~10× too small ("they don't look anything like each
    other"). seat_vessel_on_top_from_mesh fixes it at source; THIS gate proveCatches a
    regression where the seat silently no-ops (mesh renamed / not found at runtime).
    None = abstain (not an instrument, or no culture vessel in the design)."""
    if not is_instrument:
        return None
    vrow = None
    for p in parts or []:
        nm = str((p or {}).get("name") or "")
        if _VESSEL_NOUN_GATE.search(nm) and not _VESSEL_EXCL_GATE.search(nm):
            vrow = p
            break
    if vrow is None:
        return None  # no vessel → not applicable
    d = vrow.get("dims_mm") or {}
    if "dia" in d:
        dims = [float(d.get("dia") or 0), float(d.get("len") or d.get("h") or 0)]
    else:
        dims = [float(d.get(k) or 0) for k in ("w", "d", "h")]
    mx = max(dims) if dims else 0.0
    tag = str(vrow.get("equipment_tag") or vrow.get("tag") or vrow.get("name") or "vessel")
    # 10 mm floor: no real culture vessel is < 10 mm; the base-mesh bug produced 2.9 mm.
    if mx < 10.0:
        return (False,
                f"culture vessel {tag} manifest size {mx:.1f} mm is micro — it keyed "
                f"off the hidden base pack-mesh, not the drawn cutaway-cue vessel; the GA "
                f"would draw it ~10× too small. Fix: seat_vessel_on_top_from_mesh "
                f"(build_universal_scene.write_parts_manifest) — check the vessel cutaway "
                f"cue exists + _vessel_drawn_bbox_mm matched it.")
    return (True, f"culture vessel {tag} manifest size {mx:.0f} mm is realistic (drawn geometry)")


def run_gates(out_dir: str) -> list:
    """Run every deterministic drawing gate on <out_dir>. Returns list[Gate]."""
    def _load(name):
        p = os.path.join(out_dir, name)
        if os.path.exists(p):
            try:
                return json.load(open(p))
            except Exception:
                return None
        return None

    state = _load("state.json") or {}
    conn = _rows(_load("connection-schedule.json"))
    route = _rows(_load("route-manifest.json"))
    parts = _rows(_load("parts-manifest.json"))
    bom = state.get("requirementsBom") or []
    gates: list = []
    # INTENT: handheld / PCB instruments have no process-fluid schedules — the Excel
    # exporter already VERIFIED-NA's Process schedules. Scoring a 26:1 empty strip
    # as a legibility HIGH floors the dossier (colorimeter 0819 drawing_gates=6).
    _instrument = bool(state.get("isInstrumentDevice"))

    # ── G1 LEGIBILITY — each 2D drawing within a sane aspect ratio ───────────────
    # INTENT (2026-07-14): abstain when the form-factor pack excludes the stem —
    # a fluid-less handheld must not be scored on a stale/missing P&ID PNG.
    dd = os.path.join(out_dir, "drawings")
    for nm in ("single-line-diagram", "pid", "panel-schedule", "general-arrangement",
               "block-flow-diagram", "hvac-layout", "process-schedules", "interconnect"):
        if not _in_drawing_pack(state, nm):
            continue
        if _instrument and nm in ("process-schedules", "hvac-layout"):
            continue
        wh = _png_wh(os.path.join(dd, nm + ".png"))
        if not wh:
            continue
        w, h = wh
        aspect = max(w, h) / max(1, min(w, h))
        gates.append(Gate("legibility", [nm], "high" if aspect > 6 else "med",
                          aspect <= 4.0, f"{nm} {w}x{h} aspect {aspect:.1f}:1 (limit 4:1)"))

    # ── G1b LEGIBILITY (min text height at A1 print scale) — the aspect check fixes
    #    SHAPE, not READABILITY: a 2:1 drawing can still print 1.4 mm lettering. The
    #    smallest lettering AT THE DRAWING'S A1 PRINT SCALE must be ≥ 2.5 mm (ISO 3098).
    #    The scale comes from the drawing's own A1 print set (<base>-A1.json, written by
    #    a1_print.py via the generator — paginated onto N sheets when one is not enough);
    #    with no delivered A1 set the drawing is scored at ONE-A1-sheet fit scale, so a
    #    generator that skips pagination fails honestly. Fix = MORE SHEETS, never smaller.
    for nm, base in _A1_PRINT_BASES.items():
        if not _in_drawing_pack(state, nm):
            continue
        verdict = _min_text_on_a1(dd, nm, base)
        if verdict is None:
            continue
        mm, src = verdict
        gates.append(Gate("legibility", [nm], "high" if mm < 1.8 else "med",
                          mm >= A1_MIN_TEXT_MM,
                          f"{nm} min text {mm:.2f} mm at A1 print scale "
                          f"(≥{A1_MIN_TEXT_MM:g} mm ISO 3098) — {src}"))

    # ── G2 LOAD RECONCILE — panel total ≈ contract connected load ────────────────
    cload = _q(state, "connected_electrical_load_kw")
    md_path = os.path.join(dd, "panel-schedule.md")
    panel_total = None
    panel_board = None
    if os.path.exists(md_path):
        panel_total, panel_board = _g2_panel_total(open(md_path).read(), state)
    if cload and panel_total:
        ratio = panel_total / cload
        gates.append(Gate("load_reconcile", ["panel-schedule", "single-line-diagram"],
                          "high", 0.85 <= ratio <= 1.15,
                          f"{panel_board or 'panel'} total {panel_total:g} kW vs "
                          f"contract {cload:g} kW (ratio {ratio:.2f}, ±15%)"))

    # ── G3 PART COVERAGE — every principal powered part has its OWN electrical feeder ─
    # (decision extracted to g3_missing_feeders above; cabinet-housed power gear —
    # VFD / soft-start / starter — is busbar-fed panel contents, never a feeder row)
    elec_dests = set()
    for e in conn:
        if not isinstance(e, dict):
            continue
        med = str(e.get("mechanism") or e.get("medium") or e.get("service") or "")
        if "electr" in med.lower():
            elec_dests.add(str(e.get("to_part") or e.get("to") or "").strip().lower())
    missing = g3_missing_feeders(bom, elec_dests)
    # Abstain when the pack has no plant electrical / P&ID home (handheld PCB story).
    if (_in_drawing_pack(state, "single-line-diagram")
            or _in_drawing_pack(state, "panel-schedule")
            or _in_drawing_pack(state, "pid")):
        gates.append(Gate("part_coverage", ["single-line-diagram", "panel-schedule", "pid"],
                          "high", len(missing) == 0,
                          "all principal powered parts fed" if not missing
                          else f"{len(missing)} principal powered part(s) with NO electrical feeder: {missing[:4]}"))

    # ── G4 MATERIAL DIVERSITY — multi-service plant ≠ a uniform material ─────────
    # FLUID ROUTES ONLY (2026-07-11 powerwall run 71): the gate's intent is a fluid
    # plant modelling every pipe as one default material. An all-electrical sealed
    # product legitimately routes ONLY cables/busbars (mechanism electrical_*,
    # material None) — 0 fluid lines is "gate not applicable", never "0 materials
    # FAIL". Keyed on the route's own mechanism/service signal, not the class.
    fluid_route = []
    for r in route:
        if not isinstance(r, dict):
            continue
        mech = str(r.get("mechanism") or r.get("service") or "").lower()
        if re.search(r"electr|signal|data|comms|network|bus\b", mech):
            continue
        fluid_route.append(r)
    mats = set()
    for r in fluid_route:
        m = r.get("material") or r.get("material_label") or ""
        if m:
            mats.add(re.split(r"\s*\(", str(m))[0].strip().lower())
    # GOTCHA (NinjaPCR 2026-07-15): a benchtop instrument may author one incidental
    # air/coolant fluid edge with a single default material — that is NOT a multi-
    # service fluid plant. G4's ≥2-materials rule is for plants; skip instruments.
    if fluid_route and not state.get("isInstrumentDevice"):
        gates.append(Gate("material_diversity", ["line-velocity-schedule", "process-schedules"],
                          "med", len(mats) >= 2,
                          f"{len(mats)} distinct pipe material(s): {sorted(mats)[:4]}"))

    # ── G5 QTY-N COVERAGE — a qty-N principal node is represented N× (not collapsed) ─
    pm_names = [str(p.get("name") or "") for p in parts if isinstance(p, dict)]
    for cnt_key, noun in (("degasser_count", "degasser"), ("drum_filter_count", "drum"),
                          ("recirc_pump_count", "recirc"), ("rearing_tank_count", "tank")):
        n = _q(state, cnt_key)
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if n < 2:
            continue
        got = sum(1 for nm in pm_names if re.search(noun, nm, re.I))
        gates.append(Gate("qty_coverage", ["pid", "block-flow-diagram", "general-arrangement"],
                          "high" if got < n * 0.5 else "med", got >= max(2, int(n * 0.8)),
                          f"{noun}: contract qty {n}, parts-manifest has {got} instance(s) (need ≥{max(2, int(n*0.8))})"))

    # ── G6 NO STRAY BEAM — no DRAWN plant-crossing overhead run ─────────────────────
    #    The v44 render shipped a 'stray red pipe extending off the platform to a floating
    #    box': an MCC->plant-wide-loads cable tray whose spine ran 33 m. Codema 1538 shipped
    #    the SAME visual class as a FLUID overhead Manhattan beam (oxygen dosing → drain
    #    sump, 31 m) while this gate only audited cables — vision flagged it, G6 passed.
    #    SCOPE (2026-07-09): EVERY drawn route whose plan span exceeds the limit —
    #    cable OR fluid. Undrawn (demoted) runs are skipped. Fully buried runs
    #    (all waypoints z < 0) are skipped — short drains stay 3-D underground;
    #    plant-spanning laterals are demoted upstream so they never appear here.
    #    Universal — geometry + drawn flag, no class table.
    worst = None
    for r in route:
        if not isinstance(r, dict):
            continue
        # Demoted / logical-only runs are not in the 3-D scene — not a visual beam.
        if r.get("drawn") is False:
            continue
        wps = r.get("waypoints_mm") or r.get("waypoints") or []
        xs = [w[0] for w in wps if isinstance(w, (list, tuple)) and len(w) >= 2]
        ys = [w[1] for w in wps if isinstance(w, (list, tuple)) and len(w) >= 2]
        zs = [w[2] for w in wps if isinstance(w, (list, tuple)) and len(w) >= 3]
        if not xs or not ys:
            continue
        # Fully buried short drains (all z < 0) are not a visible stray beam.
        # Noun-free: z-signal only. Long laterals demote before draw.
        if zs and max(zs) < 0.0:
            continue
        span = max(max(xs) - min(xs), max(ys) - min(ys))
        if worst is None or span > worst[1]:
            svc = str(r.get("service") or r.get("mechanism") or "run")
            worst = (str(r.get("run_name") or r.get("name") or "?"), span, svc)
    if worst is not None:
        gates.append(Gate("no_stray_beam", ["general-arrangement", "pid", "single-line-diagram"],
                          "high", worst[1] <= STRAY_BEAM_MAX_SPAN_MM,
                          f"longest drawn run {worst[0]} ({worst[2]}) spans "
                          f"{worst[1]/1000:.1f} m (limit {STRAY_BEAM_MAX_SPAN_MM/1000:.0f} m "
                          f"— a plant-crossing beam)"))

    # ── G7 SITE UTILISATION — the deck must hug the plant, not dwarf it ──────────────
    #    v52's top view shipped the plant as a corner/L of a much larger deck (the packer's
    #    square-width fold): hull/deck measured 0.33. build_universal_scene writes `site`
    #    into parts-manifest.json (hull = union of placed part footprints each inflated
    #    1 m — its access strip; deck = the drawn slab plan rect = mesh bbox + 3 m apron).
    #    THRESHOLD BASIS (SITE_UTILISATION_MIN = 0.45): with every part carrying its 1 m
    #    access strip and the deck a 3 m perimeter aisle, a compact single-block rectangular
    #    layout measures ~0.5–0.7 on this metric (plant-layout practice for a developed
    #    plot); below 0.45 the empty deck area exceeds the plant's own hull even after the
    #    aisles — the top view visibly reads as a plant stranded on an oversized deck.
    #    Skips (like every gate) when the `site` block is absent — free-space families
    #    (aircraft / wind turbine) lay no deck and are never scored.
    pm_doc = _load("parts-manifest.json")
    site = pm_doc.get("site") if isinstance(pm_doc, dict) else None
    # SEALED PRODUCT SKIP (2026-07-11 run 78): a wall-mounted sub-1 m³ product has no
    # SITE to utilise — the "deck" is the render's floor prop, and hull/deck = 0.43
    # is not a stranded plant corner. Same enclosure signal as G10/G11; plants keep
    # the gate (guard-vs-scale family: the intent is plant-layout compactness).
    _g7_encl = _q(state, "enclosure_volume_m3")
    if _g7_encl and 0 < float(_g7_encl) < 1.0:
        site = None
    if isinstance(site, dict) and site.get("utilisation") is not None:
        try:
            _ratio = float(site["utilisation"])
        except (TypeError, ValueError):
            _ratio = None
        if _ratio is not None:
            gates.append(Gate("site_utilisation", ["general-arrangement"],
                              "high" if _ratio < 0.30 else "med",
                              _ratio >= SITE_UTILISATION_MIN,
                              f"plant hull {site.get('hull_m2')} m² / deck {site.get('deck_m2')} m² "
                              f"= {_ratio:.2f} (floor {SITE_UTILISATION_MIN} — below it the plant "
                              f"sits in a corner of an empty deck)"))

    # ── G8 CONNECTION SANITY — service-domain + self-loop + flow-ceiling + aggregate ──
    ledg = _rows(_load("connection-ledger.json"))
    if ledg:
        qs = {}
        for ck in ("orchestratorContract", "engineeringContract"):
            _cand = (state.get(ck) or {}).get("quantities")
            if isinstance(_cand, dict):
                qs = _cand
                break
        f8 = connection_sanity_findings(ledg, conn, qs)
        gates.append(Gate("connection_sanity",
                          ["pid", "single-line-diagram", "process-schedules"],
                          "high", len(f8) == 0,
                          "connection graph physically coherent (domain + direction + magnitude)"
                          if not f8 else
                          f"{len(f8)} incoherent connection(s): " + " | ".join(f8[:4])))

    # ── G9 TAG LEGIBILITY — no tag pile-ups, no tag clipped at a view border ─────────
    ga_svg = os.path.join(dd, "general-arrangement.svg")
    if os.path.exists(ga_svg):
        try:
            _ga_txt = open(ga_svg).read()
        except OSError:
            _ga_txt = ""
        if _ga_txt:
            f9 = tag_legibility_findings(_ga_txt)
            gates.append(Gate("tag_legibility", ["general-arrangement"],
                              "high", len(f9) == 0,
                              "every tag distinct (≤20% bbox overlap) + inside its view border"
                              if not f9 else
                              f"{len(f9)} illegible tag(s): " + " | ".join(f9[:4])))

    # ── G10 INTERIOR FILL (2026-07-11 run 73, the empty-shell render) — a SEALED
    # sub-1 m³ product's interior must be substantially occupied: Σ part bbox volume /
    # enclosure interior volume ≥ INTERIOR_FILL_MIN. The 88-cell pack collapsed to one
    # 99 mm box left the Powerwall render ~3% full — a hollow translucent shell no
    # buyer would recognise (Tristan vs the LTEC PW3 teardown). Keyed on the SAME
    # enclosure_volume_m3 < 1 signal as the sealed scene family; plants untouched. ──
    _encl_m3 = _q(state, "enclosure_volume_m3")
    # GOTCHA (colorimeter 2026-07-14): optical/electronic instruments are mostly
    # air path + PCB — BoM proxy bbox fill legitimately sits well below the
    # Powerwall 35% floor. G10 targets sealed energy cabinets whose hero looked
    # like a hollow shell; skip when isInstrumentDevice.
    if (_encl_m3 and 0 < float(_encl_m3) < 1.0 and parts
            and not state.get("isInstrumentDevice")):
        fill = interior_fill_fraction(parts, float(_encl_m3))
        if fill is not None:
            gates.append(Gate("interior_fill", ["renders", "general-arrangement"],
                              "high", fill >= INTERIOR_FILL_MIN,
                              f"interior fill {fill * 100:.0f}% of the {float(_encl_m3):.2f} m³ "
                              f"enclosure (floor {INTERIOR_FILL_MIN * 100:.0f}% — below it the "
                              f"render is a hollow shell, not a product)"))
    # ── G14 PLAN LATERAL SPREAD (2026-07-14 Powerwall GA≠hero) — sealed parts
    # must not all share one plan cell. A centreline Z-stack makes every GA tag
    # land at (0,0) while the hero CAD pass paints heatsink/fans/caps off-axis.
    # EXTENDED (colorimeter 2026-07-14): instruments use the same floor —
    # role-XY / form-rule slots make pile-up a defect again (not "expected").
    if _encl_m3 and 0 < float(_encl_m3) < 1.0 and parts:
        _nxy = plan_lateral_unique_xy(parts)
        if _nxy is not None:
            gates.append(Gate(
                "plan_lateral_spread", ["general-arrangement", "renders"],
                "high", _nxy >= PLAN_LATERAL_MIN_UNIQUE,
                (f"plan has {_nxy} distinct (x,y) cell(s) among placed internals "
                 f"(floor {PLAN_LATERAL_MIN_UNIQUE} — centreline pile-up makes GA≠cutaway)"
                 if _nxy < PLAN_LATERAL_MIN_UNIQUE else
                 f"plan has {_nxy} distinct (x,y) cell(s) (≥{PLAN_LATERAL_MIN_UNIQUE})"),
            ))

    # ── G11 DRAWING DOMAIN COHERENCE (2026-07-11, Grok: "deterministic gates report all
    # PASS despite semantic defects — they check geometry/coverage, not whether the
    # drawing represents the right product"). Mirrors gate-34's marker approach on the
    # DRAWING SVGs: plant-architecture vocabulary on a drawing whose CONTRACT declares a
    # device that has none is wrong-domain content, whatever the geometry says. Signals:
    #   • MV/transformer markers fire when the contract sizes NO transformer AND ties at
    #     ≤250 V (a plant with a real transformer quantity keeps them);
    #   • plant heat-rejection markers fire on a sealed sub-1 m³ product (its losses go
    #     to AIR; 'heat rejection / cooling tower / chiller / CDU' is plant equipment).
    _g11 = drawing_domain_findings(out_dir, state)
    for dwg, marker in _g11:
        gates.append(Gate("drawing_domain", [dwg], "high", False,
                          f"wrong-domain content on {dwg}: '{marker}' — plant architecture "
                          f"on a device-scale contract (no transformer sized / ≤250 V tie / "
                          f"air-cooled sealed product)"))
    if not _g11 and _encl_m3 and 0 < float(_encl_m3) < 1.0:
        gates.append(Gate("drawing_domain", ["pid", "block-flow-diagram", "single-line-diagram"],
                          "high", True, "no plant-architecture markers on the device drawings"))

    # ── G12 EXCEL-BOUND RENDER VIEW QUALITY ────────────────────────────────────
    # Filename existence is not evidence: run 79's 02-corner-FR was a nearly
    # blank backdrop and the forced product top/side views were meaningless.
    # Evaluate exactly the form-factor views the workbook contract requests.
    # ASPECT-AWARE (organoid bioreactor 2026-07-22): pass the product's own
    # bbox (width=length_mm, height=height_mm from parts-manifest) so a correctly-
    # framed wide/landscape product is not height-penalised.  See render_image_quality
    # evaluate_image product_bbox_mm for the full rationale.
    _pm_bbox = pm_doc.get("bbox_mm") if isinstance(pm_doc, dict) else None
    _product_bbox_mm: tuple[float, float] | None = None
    if isinstance(_pm_bbox, dict):
        try:
            _bw = float(_pm_bbox.get("length_mm") or 0)  # x-span = width in plan
            _bh = float(_pm_bbox.get("height_mm") or 0)  # z-span = height
            if _bw > 0 and _bh > 0:
                _product_bbox_mm = (_bw, _bh)
        except (TypeError, ValueError):
            pass
    view_failures = []
    checked_views = 0
    for view in required_views(state):
        path = os.path.join(out_dir, view.filename)
        if not os.path.exists(path):
            if view.required:
                view_failures.append(f"{view.view_id}: missing {view.filename}")
            continue
        checked_views += 1
        # pass the enclosure volume so a compact benchtop product's smooth (low-edge but
        # frame-filling) service view is not failed as "blank" — occupancy floors still guard.
        # pass product_bbox_mm so a landscape product is scored on its dominant axis.
        quality = evaluate_image(
            path,
            enclosure_volume_m3=float(_encl_m3) if _encl_m3 else None,
            product_bbox_mm=_product_bbox_mm,
        )
        if not quality.passed:
            view_failures.append(
                f"{view.view_id}: " + "; ".join(quality.reasons))
    gates.append(Gate(
        "render_view_quality",
        ["renders"],
        "high",
        not view_failures and checked_views > 0,
        (f"{checked_views} Excel-bound view(s) present, non-blank and correctly framed"
         if not view_failures and checked_views > 0 else
         f"{len(view_failures)} invalid/missing Excel-bound view(s): "
         + " | ".join(view_failures[:5])),
    ))

    # ── G15 GA↔BLENDER COHERENCE (Codema plant + Powerwall product 2026-07-14) ─
    # Plant: Excel annotated plan (01-top) + GA share the settled manifest.
    # Product: Excel cutaway hero (00-hero) + GA share the settled manifest
    # (fingerprint) — never require a plant top-plan of a wall cabinet.
    _g15 = ga_render_manifest_coherent(out_dir)
    if _g15 is not None:
        ok, detail = _g15
        gates.append(Gate(
            "plan_render_coherence", ["general-arrangement", "renders"],
            "high", ok, detail,
        ))

    # ── G16 DRAWING-SET COHERENCE (2026-07-14 Tristan: "I now doubt all of the
    # drawings — they need to be consistent") — every system SVG that is NOT
    # honestly NA-BY-DESIGN must carry the same placement_fp as the manifest,
    # and parts_ledger coverage for that drawing must clear 80%. ───────────────
    _g16 = drawing_set_coherent(out_dir)
    if _g16 is not None:
        ok, detail = _g16
        gates.append(Gate(
            "drawing_set_coherence",
            ["general-arrangement", "pid", "block-flow-diagram",
             "single-line-diagram"],
            "high", ok, detail,
        ))

    # ── G17 GA GLANCE COHERENCE (2026-07-14 Tristan: "look at the GA visually")
    # Fingerprints can ALL-PASS while the sheet fails a 5-second glance (empty
    # "door removed" FRONT, title 0.1 m vs 183 mm dims). Audits the DELIVERED
    # SVG — OPERATING-FRAME SIGHT — not state.json intent. ────────────────────
    _ga_svg_path = os.path.join(out_dir, "drawings", "general-arrangement.svg")
    if os.path.exists(_ga_svg_path) and os.path.getsize(_ga_svg_path) > 80:
        try:
            _ga_svg_txt = open(_ga_svg_path, encoding="utf-8", errors="replace").read()
        except OSError:
            _ga_svg_txt = ""
        if _ga_svg_txt:
            _g17_ok, _g17_detail = ga_glance_coherent(
                _ga_svg_txt,
                is_instrument_device=bool(_instrument),
                is_product_scale=bool(is_product_scale(state) or _instrument),
            )
            gates.append(Gate(
                "ga_glance_coherence",
                ["general-arrangement"],
                "high",
                _g17_ok,
                _g17_detail,
            ))

    # ── G18 DRAWING VISION GLANCE (2026-07-14 Tristan: "look at the GA visually")
    # Irreducible PNG residue after G17's SVG markers. FLAG-ONLY; shadow unless
    # DRAWING_VISION_ENFORCING=1. Abstains (no gate) when offline / no key. ─────
    _g18 = drawing_vision_coherent(out_dir, is_instrument=bool(_instrument))
    if _g18 is not None:
        _g18_ok, _g18_detail = _g18
        _g18_enforce = os.environ.get("DRAWING_VISION_ENFORCING", "").strip().lower() not in (
            "", "0", "false", "no", "off", "shadow",
        )
        # Shadow: record as passed with advisory detail; enforcing: real fail.
        gates.append(Gate(
            "drawing_vision_glance",
            ["general-arrangement", "renders"],
            "high",
            True if not _g18_enforce else _g18_ok,
            (_g18_detail if _g18_ok else f"SHADOW would-fail: {_g18_detail}")
            if not _g18_enforce and not _g18_ok
            else _g18_detail,
        ))

    # ── G18b RENDER↔GA COHERENCE VISION SIGHT (2026-07-25 Tristan: "render and
    # drawings were supposed to always be identical") ────────────────────────
    # The single-image G18 critiques the GA and the render SEPARATELY, each against
    # its own form rubric — so a GA that is individually plausible AND a render that
    # is individually plausible both pass while depicting DIFFERENT devices (the
    # vessel-on-top-in-render vs vessel-inside-in-GA divergence). This gate shows the
    # model BOTH images together and flags cross-artefact disagreement of the dominant
    # geometry — the irreducible visual residue G21/G22 (manifest-based) cannot see
    # because the render's decorative meshes are not in the manifest. FLAG-ONLY;
    # shadow unless RENDER_GA_VISION_ENFORCING=1; abstains offline / no key.
    _g18b = render_ga_coherent(out_dir)
    if _g18b is not None:
        _g18b_ok, _g18b_detail = _g18b
        _g18b_enforce = os.environ.get("RENDER_GA_VISION_ENFORCING", "").strip().lower() not in (
            "", "0", "false", "no", "off", "shadow",
        )
        gates.append(Gate(
            "render_ga_vision_coherence",
            ["renders", "general-arrangement"],
            "high",
            True if not _g18b_enforce else _g18b_ok,
            (f"SHADOW would-fail: {_g18b_detail}")
            if not _g18b_enforce and not _g18b_ok
            else _g18b_detail,
        ))

    # ── G18c VESSEL MANIFEST REALISM (2026-07-25 vessel-unification backstop) ──
    # Deterministic proveCatch for the seat: if the vessel row keys off the tiny
    # hidden base pack-mesh instead of the drawn cutaway-cue geometry, the GA draws
    # it ~10× too small. Abstains when there is no culture vessel / not an instrument.
    _pm_parts_g18c = (pm_doc.get("parts") if isinstance(pm_doc, dict) else None) or []
    _g18c = vessel_manifest_realistic_check(_pm_parts_g18c, bool(_instrument))
    if _g18c is not None:
        _g18c_ok, _g18c_detail = _g18c
        gates.append(Gate(
            "vessel_manifest_realism",
            ["general-arrangement", "renders"],
            "high",
            _g18c_ok,
            _g18c_detail,
        ))

    # ── G19 ENCLOSURE SHELL CONTAINS PARTS BBOX (2026-07-22) ─────────────────
    # The RENDER's outer envelope (enclosure shell dims) must CONTAIN the
    # DRAWING's parts-manifest bbox. A parts stack that exceeds the shell means
    # the render only looks tidy because the containment clamp HID the sprawl —
    # the drawing plots parts at their real extent, exposing the incoherence.
    # Root-fix: minimum_working_envelope.py must size the enclosure to contain
    # the real mechanical stack (stir drive + pump + fan etc) including HEIGHT.
    if _encl_m3 and 0 < float(_encl_m3) < 1.0:
        _pm_doc_for_g19 = pm_doc if isinstance(pm_doc, dict) else {}
        _pm_bbox_for_g19 = _pm_doc_for_g19.get("bbox_mm")
        _parts_for_g19 = _pm_doc_for_g19.get("parts") or []
        _g19_ok, _g19_detail = enclosure_shell_contains_check(
            _parts_for_g19, _pm_bbox_for_g19
        )
        gates.append(Gate(
            "enclosure_shell_contains_parts",
            ["renders", "general-arrangement"],
            "high",
            _g19_ok,
            _g19_detail,
        ))

    # ── G20 ENVELOPE EQUALITY CROSS-CHECK (2026-07-22) ────────────────────────
    # The value the DRAWING ACTUALLY EMITS (its own _manifest_envelope_dims resolver
    # output) must EQUAL the canonical manifest Enclosure Shell dims within ±2% / ±2mm.
    # After the routing fix the caption reads the manifest shell, so on a coherent bake
    # they are identical. This gate is the BACKSTOP: if a future regression makes the
    # caption resolver fall back to the superseded state pre-estimate (or any other
    # source), the emitted value diverges from the placed shell and the gate fires before
    # the dossier ships. Compares the DELIVERED artefact, NOT the state pre-estimate (a
    # legitimate upstream input the reorder is designed to supersede). Abstains on
    # non-enclosure / plant-scale products (no Enclosure Shell part).
    if _encl_m3 and 0 < float(_encl_m3) < 1.0:
        _pm_doc_for_g20 = pm_doc if isinstance(pm_doc, dict) else {}
        _parts_for_g20 = _pm_doc_for_g20.get("parts") or []
        _caption_dims_g20 = None
        try:
            # Parse the DELIVERED GA SVG caption — what the drawing ACTUALLY shows —
            # so G20 fires when the caption diverges from the canonical manifest shell.
            # (The old code called _manifest_envelope_dims which re-resolves from state,
            # returning the same source that may be wrong — defeating the purpose of G20.)
            _ga_svg_path_g20 = os.path.join(out_dir, "drawings", "general-arrangement.svg")
            if os.path.exists(_ga_svg_path_g20):
                _ga_svg_text_g20 = open(_ga_svg_path_g20, encoding="utf-8", errors="replace").read()
                # The title block emits one of:
                #   "product envelope W × D × H mm (L×W×H)"      — product/instrument
                #   "Overall plant envelope …"                    — plant scale
                #   "enclosure W × D × H mm (L×W×H) · OVERALL assembled height N mm"
                #     — a product with feature(s) proud of the lid (2026-07-26). The
                #     enclosure triple and the overall height are DIFFERENT numbers and
                #     the sheet must state both; this gate checks the ENCLOSURE triple
                #     against the canonical shell, which is what it has always meant.
                # `enclosure` MUST be in this alternation: when the organoid caption
                # gained the OVERALL clause the old two-noun regex stopped matching and
                # G20 silently ABSTAINED ("no parseable drawing-caption envelope") — a
                # gate that stopped catching, the same failure mode as an exemption that
                # widens with the defect.
                _cap_match_g20 = re.search(
                    r"(?:product envelope|Overall plant envelope|enclosure)\s+"
                    r"([\d][\d ×\.]+(?:mm|m))",
                    _ga_svg_text_g20)
                if _cap_match_g20:
                    _caption_dims_g20 = _parse_caption_envelope_mm(_cap_match_g20.group(1).strip())
        except Exception:  # noqa: BLE001
            _caption_dims_g20 = None
        _g20_ok, _g20_detail = envelope_equality_cross_check(_parts_for_g20, _caption_dims_g20)
        gates.append(Gate(
            "envelope_equality",
            ["renders", "general-arrangement"],
            "high",
            _g20_ok,
            _g20_detail,
        ))

    # ── G23 MANIFEST -> SVG PROJECTION (SOL audit item 4, 2026-07-27) ──────────────────
    # The only gate that reads what was DRAWN. Every other drawing gate scores the
    # manifest and is therefore blind to a sheet that misrepresents it.
    try:
        _g23_svg = ""
        _g23_p = os.path.join(out_dir, "drawings", "general-arrangement.svg")
        if os.path.exists(_g23_p):
            _g23_svg = open(_g23_p, encoding="utf-8", errors="replace").read()
        # Read the manifest INDEPENDENTLY. This block used to borrow `_parts_for_g20`,
        # which is only bound inside G20's enclosure-scale branch — so on every
        # plant/product sheet the name was unbound, the except swallowed it, and the gate
        # reported "abstain" behind a GREEN TICK. G23 was structurally instrument-only
        # while appearing to cover everything. Same shape as the earlier `run_dir` slip:
        # an exception path that renders as a pass is worse than no gate, because it
        # advertises coverage it does not have.
        _g23_doc = pm_doc if isinstance(pm_doc, dict) else {}
        _g23_parts = _g23_doc.get("parts") or []
        _g23_ok_r, _g23_detail = manifest_svg_projection_check(_g23_parts, _g23_svg)
    except Exception as _g23e:  # noqa: BLE001 — never block the gate run
        _g23_ok_r, _g23_detail = True, f"projection gate skipped ({_g23e}) — abstain"
    gates.append(Gate(
        "manifest_svg_projection",
        ["general-arrangement"],
        "high",
        _g23_ok_r,
        _g23_detail,
    ))

    # ── G21 PART-SET COHERENCE (2026-07-22, step-d cross-artefact geometry) ─────────────
    # The GA drawing's equipment-tag set must EQUAL the manifest principal-part set.
    # Two directions: phantom (GA has a tag absent from manifest) + dropped (manifest tag
    # absent from GA). Abstains when no GA SVG or fewer than 3 manifest tags.
    # COHERENT BY CONSTRUCTION: draw_ga.py reads parts-manifest.json directly and emits
    # each part's own equipment_tag. On a coherent bake the sets are identical. This gate
    # is the BACKSTOP: a future regression (stale SVG backfilled with the new fingerprint,
    # a changed manifest, generator skip) breaks that invariant and the gate fires.
    # proveCatch both directions in --selftest: coherent → PASS; phantom/dropped → FIRES.
    _g21_ga_svg_path = os.path.join(out_dir, "drawings", "general-arrangement.svg")
    _g21_ga_text = ""
    if os.path.exists(_g21_ga_svg_path) and os.path.getsize(_g21_ga_svg_path) > 40:
        try:
            _g21_ga_text = open(_g21_ga_svg_path, encoding="utf-8", errors="replace").read()
        except OSError:
            _g21_ga_text = ""
    _pm_doc_for_g21 = pm_doc if isinstance(pm_doc, dict) else {}
    _parts_for_g21 = _pm_doc_for_g21.get("parts") or []
    _g21_ok, _g21_detail = part_set_coherence_check(_parts_for_g21, _g21_ga_text)
    gates.append(Gate(
        "part_set_coherence",
        ["general-arrangement"],
        "high",
        _g21_ok,
        _g21_detail,
    ))

    # ── G22 RENDER↔DRAWING EXTERIOR-SIGNATURE FEATURE COHERENCE (2026-07-23) ──────────
    # The exterior/above-lid signature FEATURE-FAMILY set must AGREE between the RENDER
    # (form-meshes.json exterior_signature_features — the render's own above-lid
    # _ABOVE_LID_SIGNATURE_MESHES ∩ exterior-keep survivors) and the GA DRAWING (the
    # form-family silhouette). Catches the "lost the light tower" incident: the GA drew a
    # protruding optical tower while the sealed render shipped a flat box (the containment
    # clamp buried the u_se_le_od*/vial signature below the opaque shell). Orthogonal to
    # G19 (shell⊇parts) / G20 (envelope) / G21 (manifest-principal-tag set) — the tower is
    # a SKIN signature mesh + a form-rule silhouette, in NEITHER the manifest NOR a tag.
    # Applicability guard: product-scale only (0 < encl_m3 < 1.0), mirroring G19/G20 — a
    # plant/BESS never reaches the sealed-instrument dump sites, so it abstains structurally.
    # proveCatch both directions in --selftest: matched sets → PASS; drawn-not-rendered
    # (the incident) → FIRES; both-empty → ABSTAIN.
    if _encl_m3 and 0 < float(_encl_m3) < 1.0:
        _g22_form_meshes = _load("form-meshes.json")
        _g22_is_instrument = bool(state.get("isInstrumentDevice"))
        _g22_pc = str(
            state.get("product_class")
            or (state.get("orchestratorContract") or {}).get("product_class")
            or (state.get("parsedBrief") or {}).get("product_class")
            or ""
        )
        _g22_is_thermo = bool(_THERMOCYCLER_RE.search(_g22_pc))
        # Reuse the GA SVG text already loaded for G21 (the drawing's OWN OPTICAL zone
        # is the independent drawn-optical-tower evidence). Missing SVG → empty → the
        # drawing lane draws no optical tower (abstains unless the render carries one,
        # which then legitimately fires as rendered-but-not-drawn).
        _g22_ok, _g22_detail = render_drawing_feature_coherence_check(
            _g22_form_meshes, _g21_ga_text, _g22_is_instrument, _g22_is_thermo)
        gates.append(Gate(
            "render_drawing_feature_coherence",
            ["renders", "general-arrangement"],
            "high",
            _g22_ok,
            _g22_detail,
        ))

    # ── G13 PRODUCT CAD GEOMETRY COVERAGE ─────────────────────────────────────
    # Small products must not regress to an all-box cutaway. The hero pass writes
    # a provenance log for every cached exact/family CAD mesh it actually used.
    # INTENT: handheld instruments use curated optical-bench STORY meshes +
    # hide_render manifest proxies (build_universal_scene) — not the Powerwall
    # CAD-family library. Requiring ≥4 resolved families false-fails a correct
    # instrument cutaway (colorimeter 0819). Pass when instrument story/proxy
    # geometry is recorded; keep the ≥4-family bar for non-instrument products.
    if is_product_scale(state):
        if _instrument:
            n_proxy = sum(
                1 for p in parts
                if isinstance(p, dict) and (
                    str(p.get("geometry_source") or "").startswith("instrument_")
                    or str(p.get("source") or "").startswith("instrument_")
                )
            )
            # parts-manifest proxies may not carry geometry_source — count placed
            # instrument parts + any cad-geometry-resolution instrument families
            cad_doc = _load("cad-geometry-resolution.json")
            cad_assets = cad_doc.get("assets") if isinstance(cad_doc, dict) else []
            n_cad = len([
                a for a in (cad_assets or [])
                if isinstance(a, dict) and a.get("family")
            ])
            n_parts = len([p for p in parts if isinstance(p, dict)])
            ok = n_proxy >= 1 or n_cad >= 1 or n_parts >= 8
            gates.append(Gate(
                "cad_geometry_coverage",
                ["renders"],
                "high",
                ok,
                (f"instrument geometry present — {n_parts} manifest part(s), "
                 f"{n_proxy} instrument-proxy source(s), {n_cad} CAD family(ies)"
                 if ok else
                 "instrument product has no manifest parts / story proxies — "
                 "cutaway would be an empty shell"),
            ))
        else:
            cad_doc = _load("cad-geometry-resolution.json")
            cad_assets = cad_doc.get("assets") if isinstance(cad_doc, dict) else []
            families = {
                str(asset.get("family")) for asset in (cad_assets or [])
                if isinstance(asset, dict) and asset.get("family")
            }
            gates.append(Gate(
                "cad_geometry_coverage",
                ["renders"],
                "high",
                len(families) >= 4,
                (f"{len(families)} verified CAD families used: {', '.join(sorted(families))}"
                 if families else
                 "no verified CAD family geometry recorded — product remains primitive-only"),
            ))

    return gates


_G11_MV_RE = re.compile(
    # negative lookbehind: "no step-up transformer (direct LV tie)" is the CORRECT
    # device-scale disclosure, not plant content (run-75 SLD false hit)
    r"(?<!no )(?<!without )step[\s-]?up\s+transformer|MV\s+(?:feeder|switchboard|utility)|"
    r"\b(?:3\.3|6\.6|11|33)\s?kV\b|ring[\s-]?main", re.I)
_G11_PLANT_THERMAL_RE = re.compile(
    r"heat\s+rejection|cooling\s+tower|\bchiller\b|coolant\s+distribution|\bCDU\b", re.I)


def drawing_domain_findings(out_dir: str, state: dict) -> list:
    """PURE G11 check — [(drawing, marker), ...] wrong-domain hits on the electrical/
    process drawing SVGs, keyed on the contract's own signals (never a class)."""
    q = lambda k: _q(state, k)
    qkeys = []
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = (state.get(ck) or {}).get("quantities")
        if isinstance(qs, dict):
            qkeys += list(qs.keys())
    has_transformer = any("transformer" in k.lower() for k in qkeys)
    ac_v = q("ac_output_voltage_v")
    encl = q("enclosure_volume_m3")
    sealed = bool(encl and 0 < float(encl) < 1.0)
    lv_tie = bool(ac_v and float(ac_v) <= 250)
    findings = []
    for nm in ("pid", "block-flow-diagram", "single-line-diagram", "panel-schedule"):
        if not _in_drawing_pack(state, nm):
            continue
        p = os.path.join(out_dir, "drawings", nm + ".svg")
        try:
            txt = open(p, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if lv_tie and not has_transformer:
            m = _G11_MV_RE.search(txt)
            if m:
                findings.append((nm, m.group(0)))
                continue
        if sealed:
            m = _G11_PLANT_THERMAL_RE.search(txt)
            if m:
                findings.append((nm, m.group(0)))
    return findings


def interior_fill_fraction(parts, encl_m3: float):
    """PURE G10 measure — Σ per-part bbox volume / enclosure volume (0..1), or None
    when the manifest carries no usable dims. Skin/enclosure/shell parts are excluded
    (they ARE the boundary, not the contents)."""
    _skin_rx = re.compile(r"enclosure|cabinet|housing|\bdoor\b|panel|insulation|liner|"
                          r"gasket|\bseal\b|bracket|mount|cover|lid|skin|chassis|frame", re.I)
    tot_mm3 = 0.0
    n_dims = 0
    for p in parts:
        if not isinstance(p, dict):
            continue
        if _skin_rx.search(str(p.get("name") or "")):
            continue
        d = p.get("dims_mm") or p.get("size_mm") or {}
        if isinstance(d, dict):
            w, dp, h = (float(d.get("w") or 0), float(d.get("d") or 0),
                        float(d.get("h") or 0))
        elif isinstance(d, (list, tuple)) and len(d) == 3:
            w, dp, h = (float(d[0]), float(d[1]), float(d[2]))
        else:
            continue
        if w > 0 and dp > 0 and h > 0:
            tot_mm3 += w * dp * h
            n_dims += 1
    if n_dims == 0:
        return None
    return min(1.0, tot_mm3 / (encl_m3 * 1e9))


def plan_lateral_unique_xy(parts, tol_mm: float = 5.0) -> Optional[int]:
    """PURE G14 measure — count of distinct plan (x,y) anchors among non-skin parts.

    INTENT: sealed centreline Z-stacks put every tag at (0,0) while the hero CAD
    pass paints heatsink/fans/caps off-axis — GA≠render. Returns None when the
    manifest has fewer than 3 placeable non-skin parts (abstain).
    """
    _skin_rx = re.compile(r"enclosure|cabinet|housing|\bdoor\b|panel|insulation|liner|"
                          r"gasket|\bseal\b|bracket|mount|cover|lid|skin|chassis|frame|"
                          r"warning\s+label|signage|label", re.I)
    cells = set()
    n = 0
    for p in parts:
        if not isinstance(p, dict):
            continue
        if _skin_rx.search(str(p.get("name") or "")):
            continue
        pos = p.get("pos_mm")
        if not (isinstance(pos, (list, tuple)) and len(pos) >= 2):
            continue
        try:
            x, y = float(pos[0]), float(pos[1])
        except (TypeError, ValueError):
            continue
        n += 1
        cells.add((round(x / tol_mm), round(y / tol_mm)))
    if n < 3:
        return None
    return len(cells)


# G10 floor: a sealed product interior below this fill fraction renders as an empty
# shell. Run 73's shipped manifest measured 0.27 (toy boxes + the 88-cell pack
# collapsed to one 99 mm box — visually hollow); the pack-array + zone-fill sizing
# lands ~0.45-0.65. A future legitimately-sparse sealed archetype (e.g. a dock that
# HOUSES a vehicle) needs its own regime signal, not a lowered floor.
INTERIOR_FILL_MIN = 0.35

# G14 floor: a sealed cabinet with ≥3 placed internals must occupy ≥3 distinct plan
# cells (5 mm grid). Powerwall 0332 shipped 1 unique XY for 26 parts — centreline pile-up.
PLAN_LATERAL_MIN_UNIQUE = 3


def _load_state(out_dir: str) -> dict:
    try:
        return json.load(open(os.path.join(out_dir, "state.json")))
    except Exception:  # noqa: BLE001
        return {}


def ga_render_manifest_coherent(out_dir: str):
    """PURE G15 measure — GA + the Excel-bound Blender view must share the settled
    parts-manifest generation (mtime freshness + placement fingerprint).

    INTENT (Codema 2026-07-14 + Powerwall 2026-07-14): plant runs compare GA to
    `01-top.png`; sealed products compare GA to the cutaway hero (`00-hero.png`) —
    never require a plant top-plan of a wall cabinet. Returns (ok, detail) or None
    when abstaining (no manifest / nothing to score).
    """
    manifest = os.path.join(out_dir, "parts-manifest.json")
    ga_png = os.path.join(out_dir, "drawings", "general-arrangement.png")
    ga_svg = os.path.join(out_dir, "drawings", "general-arrangement.svg")
    if not os.path.exists(manifest):
        return None
    try:
        doc = json.load(open(manifest))
    except Exception:  # noqa: BLE001
        return None
    parts = [p for p in (doc.get("parts") or []) if isinstance(p, dict)]
    n = int(doc.get("count") or len(parts) or 0)
    if n < 3:
        return None
    state = _load_state(out_dir)
    product = bool(state and is_product_scale(state))
    if not product:
        # Fallback when state is missing: rooms ⇒ plant; sub-2 m envelope ⇒ product.
        rooms = doc.get("rooms") or []
        bbox = doc.get("bbox_mm") or {}
        max_edge = max(
            float(bbox.get("length_mm") or 0),
            float(bbox.get("width_mm") or 0),
            float(bbox.get("height_mm") or 0),
        )
        product = (not rooms) and 0 < max_edge <= 2000.0

    # Primary Blender artefact the Excel Renders tab binds for this form factor.
    if product:
        render_cands = (
            os.path.join(out_dir, "00-hero.png"),
            os.path.join(out_dir, "inspect-hero.png"),
        )
        render_label = "00-hero.png (product cutaway)"
    else:
        render_cands = (
            os.path.join(out_dir, "01-top.png"),
            os.path.join(out_dir, "inspect-top.png"),
        )
        render_label = "01-top.png (plant plan)"
    render = next((p for p in render_cands if os.path.exists(p) and os.path.getsize(p) > 1000), None)
    if render is None:
        return (False, f"{render_label} missing — Excel Blender view cannot match the GA")

    # Placement fingerprint — proves the GA was drawn from THIS manifest.
    fp_man = doc.get("placement_fp") or placement_fingerprint(parts)
    fp_ga = None
    if os.path.exists(ga_svg) and os.path.getsize(ga_svg) > 40:
        try:
            svg_txt = open(ga_svg, encoding="utf-8", errors="replace").read()
        except OSError:
            svg_txt = ""
        fp_ga = extract_svg_placement_fp(svg_txt)
        if not fp_ga:
            return (False,
                    "general-arrangement.svg missing data-placement-fp — "
                    "redraw GA so the sheet carries the manifest fingerprint")
        if fp_ga != str(fp_man).lower():
            return (False,
                    f"GA placement fingerprint {fp_ga} ≠ manifest {fp_man} — "
                    f"GA and Blender do not share the same parts-manifest generation")

    # Freshness vs parts-manifest mtime.
    # DECISION (colorimeter 2026-07-14): when GA↔manifest fingerprints already
    # match, skip the render-vs-manifest mtime check on PRODUCT runs — role-XY
    # rewrites and placement_fp stamps update the JSON without invalidating the
    # story-mesh hero. PLANT runs still require a fresh 01-top (settled layout).
    m_mtime = os.path.getmtime(manifest)
    r_mtime = os.path.getmtime(render)
    fp_matched = bool(fp_ga and fp_ga == str(fp_man).lower())
    if not (product and fp_matched):
        if r_mtime + 2.0 < m_mtime:
            return (False,
                    f"{os.path.basename(render)} older than parts-manifest.json by "
                    f"{m_mtime - r_mtime:.0f}s — Blender view is a stale generation "
                    f"(GA follows the settled manifest; re-render)")
        if os.path.exists(ga_png) and os.path.getsize(ga_png) > 1000:
            g_mtime = os.path.getmtime(ga_png)
            if g_mtime + 2.0 < m_mtime:
                return (False,
                        f"general-arrangement.png older than parts-manifest.json by "
                        f"{m_mtime - g_mtime:.0f}s — redraw GA from the settled manifest")
    kind = "product cutaway" if product else "plant plan"
    # Product/instrument: hero-embed used on the Exec cover must not be older than
    # the gallery lead view / cutaway (colorimeter 2026-07-14: cover ≠ Renders).
    if product:
        embed = os.path.join(out_dir, "hero-embed.png")
        primary = os.path.join(out_dir, "04-product-exterior.png")
        if os.path.exists(embed) and os.path.getsize(embed) > 1000:
            e_m = os.path.getmtime(embed)
            for src, label in ((render, os.path.basename(render)),
                               (primary, "04-product-exterior.png")):
                if os.path.exists(src) and os.path.getsize(src) > 1000:
                    if e_m + 2.0 < os.path.getmtime(src):
                        return (False,
                                f"hero-embed.png older than {label} by "
                                f"{os.path.getmtime(src) - e_m:.0f}s — Exec cover "
                                f"would show a stale generation vs the Renders gallery")
    # Instrument/product GA must lead with FRONT (not a plant PLAN pile-up).
    # DECISION: sealed cabinets claim "door removed"; handheld instruments claim
    # "product form" (exterior silhouette) OR "cover removed · assembly internals"
    # (BoM-parts cutaway — draw_ga instrument_assembly_cutaway). Requiring only
    # door-removed fights G17; rejecting cover-removed fought the Assembly sheet
    # (NinjaPCR 0906: FRONT cover-removed shipped, G15 still fired plant-style).
    if product and os.path.exists(ga_svg):
        try:
            ga_txt = open(ga_svg, encoding="utf-8", errors="replace").read()
        except OSError:
            ga_txt = ""
        if ga_txt:
            has_front = bool(re.search(r">\s*FRONT\s*\(", ga_txt, re.I))
            has_cabinet_cutaway = "door removed" in ga_txt.lower()
            has_instrument_form = "product form" in ga_txt.lower()
            has_assembly_cutaway = (
                "cover removed" in ga_txt.lower()
                or "assembly internals" in ga_txt.lower()
            )
            if not (has_front and (
                has_cabinet_cutaway or has_instrument_form or has_assembly_cutaway
            )):
                return (False,
                        "general-arrangement.svg is still plant-style PLAN — "
                        "product/instrument GA must lead with FRONT "
                        "(door removed · looking in OR product form · Blender exterior "
                        "OR cover removed · assembly internals)")
    return (True,
            f"{os.path.basename(render)} + GA fresh vs parts-manifest "
            f"(fp={fp_man}, {kind}) — same placement generation")


# Back-compat alias (Codema-era name) — callers / punch-lists may still reference it.
plan_render_manifest_coherent = ga_render_manifest_coherent


def drawing_set_coherent(out_dir: str):
    """PURE G16 measure — every shipped drawing is the SAME generation.

    INTENT (Tristan 2026-07-14): "you need a check on all of the drawings that
    they are consistent with each other." G15 seals GA↔Blender; this gate seals
    the whole set. Proofs (all required when applicable):

      1. Fingerprint — every non-NA system SVG embeds the same
         ``data-placement-fp`` as parts-manifest (and therefore as each other).
      2. Content — no phantom equipment tags (letter-prefix in the manifest but
         tag absent from it) — catches a fingerprint stamped onto a stale SVG.
      3. Coverage — parts_ledger coverage ≥ DRAWING_COVERAGE_MIN_PCT when the
         sheet expects tags (NA-BY-DESIGN sheets are stripped from the
         denominator by parts_ledger).
      4. Raster freshness — each drawing's PNG is not older than its SVG
         (stale raster of a previous generation).

    Returns (ok, detail) or None when abstaining (<3 parts / no manifest / no SVGs).
    """
    fp = load_manifest_placement_fp(out_dir)
    if not fp:
        return None
    draw = os.path.join(out_dir, "drawings")
    if not os.path.isdir(draw):
        return None

    man_path = os.path.join(out_dir, "parts-manifest.json")
    try:
        man_doc = json.load(open(man_path))
    except Exception:  # noqa: BLE001
        man_doc = {}
    man_tags = manifest_equipment_tags(man_doc.get("parts") or [])

    fp_fails: list[str] = []
    tag_fails: list[str] = []
    png_fails: list[str] = []
    na_ok: list[str] = []
    stamped: list[str] = []
    fps_seen: dict[str, str] = {}

    # Pack-aware: missing SVG for a stem outside the pack is ABSENT-BY-DESIGN, not a fail.
    try:
        _st = json.load(open(os.path.join(out_dir, "state.json")))
        _pack = pack_drawings(_st)
    except Exception:  # noqa: BLE001
        _pack = frozenset()

    for key, fname in _DRAWING_SET_SVG:
        pk = _STEM_TO_PACK_KEY.get(key, key)
        if _pack and pk not in _pack:
            continue
        path = os.path.join(draw, fname)
        if not os.path.exists(path) or os.path.getsize(path) < 40:
            continue
        try:
            txt = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if is_na_by_design(txt):
            na_ok.append(key)
            continue
        got = extract_svg_placement_fp(txt)
        if not got:
            fp_fails.append(f"{key}: missing data-placement-fp")
        elif got != fp:
            fp_fails.append(f"{key}: fp {got} ≠ manifest {fp}")
        else:
            stamped.append(key)
            fps_seen[key] = got

        # Phantom tags on PLACEMENT-projected sheets only (GA / facility-layout).
        # DECISION: P&ID / panel / SLD / BFD also cite topology & instrument tags
        # that are intentionally absent from parts-manifest — scoring those as
        # phantoms false-fires on every real plant. The fingerprint already proves
        # those sheets share the settled generation; GA is the sheet whose tags
        # MUST be a projection of the manifest.
        if key in ("general-arrangement", "facility-layout"):
            phantoms = sorted(phantom_equipment_tags(txt, man_tags))
            if phantoms:
                tag_fails.append(
                    f"{key}: phantom tag(s) {', '.join(phantoms[:4])} "
                    f"not in parts-manifest")

        # PNG must not lag its SVG (stale raster).
        png = os.path.join(draw, fname.replace(".svg", ".png"))
        if os.path.exists(png) and os.path.getsize(png) > 1000:
            try:
                if os.path.getmtime(png) + 2.0 < os.path.getmtime(path):
                    png_fails.append(
                        f"{key}: png older than svg by "
                        f"{os.path.getmtime(path) - os.path.getmtime(png):.0f}s")
            except OSError:
                pass

    # Pairwise: every stamped sheet must agree with every other (belt + braces
    # on top of "each == manifest").
    uniq_fps = sorted(set(fps_seen.values()))
    if len(uniq_fps) > 1:
        fp_fails.append(
            f"drawings disagree with each other: "
            + ", ".join(f"{k}={v}" for k, v in sorted(fps_seen.items())[:6]))

    # Coverage floor from parts-ledger (same matrix the Excel Drawing tabs score).
    cov_fails: list[str] = []
    ledger_path = os.path.join(out_dir, "parts-ledger.json")
    if os.path.exists(ledger_path):
        try:
            ledger = json.load(open(ledger_path))
        except Exception:  # noqa: BLE001
            ledger = {}
        by_dwg = ledger.get("coverage_by_drawing") or {}
        for key, _fname in _DRAWING_SET_SVG:
            pk = _STEM_TO_PACK_KEY.get(key, key)
            if _pack and pk not in _pack:
                continue
            if key in na_ok or key not in _DRAWING_COVERAGE_KEYS:
                continue
            row = by_dwg.get(key) or {}
            exp = row.get("expected")
            pct = row.get("pct")
            if exp is None or int(exp or 0) <= 0:
                continue
            if pct is None or float(pct) < DRAWING_COVERAGE_MIN_PCT:
                cov_fails.append(
                    f"{key}: coverage {pct}% of {exp} expected "
                    f"(floor {DRAWING_COVERAGE_MIN_PCT:.0f}%)")

    if not stamped and not fp_fails and not cov_fails and not tag_fails and not png_fails:
        return None
    fails = fp_fails + tag_fails + png_fails + cov_fails
    if fails:
        return (False,
                f"{len(fails)} drawing-set coherence defect(s): "
                + " | ".join(fails[:8]))
    detail = (f"{len(stamped)} system drawing(s) share placement_fp={fp}"
              + (f"; NA-BY-DESIGN: {', '.join(na_ok)}" if na_ok else "")
              + f"; no phantom tags; png≥svg; "
              + f"coverage ≥{DRAWING_COVERAGE_MIN_PCT:.0f}% on applicable sheets")
    return (True, detail)



# ── G21 PART-SET COHERENCE (2026-07-22, step-d cross-artefact geometry coherence) ─────────
# The SAME set of principal parts must appear on the GA drawing and in the parts-manifest.
# Two failure modes:
#   PHANTOM  — a tag appears in the GA but is absent from the parts-manifest.
#              (A stale SVG backfilled with the current fp still shows the old generation's
#              tags — this is the exact defect G16 catches only on the GA/facility-layout sheet,
#              and only in the prefix-gated subset. G21 is the STRICT per-tag backstop.)
#   DROPPED  — a principal manifest tag is absent from the GA.
#              (The placer omitted a part; the GA was drawn from an older manifest snapshot;
#              a future GA generator skips a whole class of parts — the dropped part ships
#              in the BoM but is invisible to the reviewer.)
#
# SCOPE: GA only (the placement-projected sheet). P&ID / SLD / BFD legitimately carry
# topology-only tags (synthetic X-9nn, instrument nodes, terminal bus tags) that are
# intentionally absent from parts-manifest — scoring those would false-fire on every plant.
# G16 fingerprint already proves those sheets share the settled generation; G21 is the
# per-tag set equality check on the ONE sheet whose tags MUST equal the manifest.
#
# DEFINITION OF PRINCIPAL PARTS (matching how G19 counts parts):
# All parts with a valid equipment_tag in parts-manifest. This includes the Enclosure Shell
# (a principal structural part that must appear on the GA for dimension reference).
# The GA generator (draw_ga.py) plots EVERY manifest part with a valid equipment_tag, so
# the expected set is simply: {manifest equipment_tags}.
#
# COHERENT BY CONSTRUCTION: draw_ga.py reads parts-manifest.json directly (load_manifest())
# and emits exactly the manifest's equipment_tag for each part. On a coherent bake the two
# sets are identical. G21 is the BACKSTOP — it fires when a future regression (stale SVG,
# changed manifest, generator skip, fingerprint backfill on wrong content) breaks that.
#
# ABSTAIN: when no GA SVG exists (drawings not yet generated, or instrument product whose GA
# uses a story-mesh path), or when the manifest has fewer than 3 tagged principal parts.

_GA_PART_SET_TAG_RE = re.compile(
    r"""(?<![A-Z0-9-])   # not preceded by alpha-tag char
        ([A-Z]{1,4}-\d{3,}[A-Za-z]?)  # equipment-tag-shaped token (≥3 digit suffix)
        (?![A-Z0-9-])    # not followed by alpha-tag char
    """,
    re.VERBOSE,
)


def _manifest_principal_tags(parts: list) -> set:
    """Equipment tags of ALL named parts in the manifest (the full principal set).

    Includes structural parts (Enclosure Shell, brackets) because draw_ga.py plots
    every part with a valid equipment_tag and the dimensional reference sheet must
    show the shell outline + its tag. Excludes rows with no equipment_tag.
    """
    tags: set = set()
    for p in (parts or []):
        if not isinstance(p, dict):
            continue
        tag = str(p.get("equipment_tag") or "").strip()
        if tag and re.match(r"^[A-Z]{1,4}-\d+", tag):
            tags.add(tag)
    return tags


def _ga_svg_equipment_tags(svg_text: str) -> set:
    """Equipment-tag-shaped tokens in the GA SVG text (≥3-digit suffix, prefix filter).

    Uses the same shape as G16's phantom_equipment_tags scanner but without the
    prefix-gating (G21 cross-checks the FULL set, not a prefix-filtered subset).
    Rotated dimension text is excluded: the GA marks rotated text with a `transform`
    attribute — skip any <text> element carrying transform="rotate(...)".
    """
    # Strip transform-rotated <text> elements (dimension text — never a tag)
    txt = re.sub(r'<text[^>]*\btransform\s*=\s*"rotate[^"]*"[^>]*>.*?</text>', "", svg_text)
    return set(_GA_PART_SET_TAG_RE.findall(txt))


_GA_TOPN_RE = re.compile(r"\btop\s+(\d+)\s+of\s+(\d+)\s+items\b", re.I)


def _ga_svg_schedule_tags(svg_text: str) -> tuple:
    """Tags listed in the equipment schedule section of the GA SVG.

    The schedule may show only a 'top N of M items by footprint' subset — in that case
    the M-N items NOT shown are legitimately absent from the SVG and must not be flagged
    as dropped by G21.

    Returns (schedule_tag_set, declared_top_n, declared_total_m).
    When no top-N note is present, schedule_tag_set is empty and top_n == total_m == 0
    (caller treats all SVG tags as the full set).
    """
    top_n_match = _GA_TOPN_RE.search(svg_text)
    if not top_n_match:
        return set(), 0, 0
    top_n = int(top_n_match.group(1))
    total_m = int(top_n_match.group(2))
    # Strip rotated text (dimension annotations) same as _ga_svg_equipment_tags.
    txt = re.sub(r'<text[^>]*\btransform\s*=\s*"rotate[^"]*"[^>]*>.*?</text>', "", svg_text)
    sched_tags = set(_GA_PART_SET_TAG_RE.findall(txt))
    return sched_tags, top_n, total_m


def part_set_coherence_check(
    parts: list,
    ga_svg_text: str,
) -> tuple:
    """PURE G21 — the GA drawing's equipment-tag set must equal the manifest principal set.

    INTENT (2026-07-22, step-d cross-artefact coherence): the same set of principal
    parts must appear in the GA drawing and in the parts-manifest. A tag on the GA but
    absent from the manifest is a PHANTOM (stale SVG generation); a manifest principal
    tag missing from the GA is a DROPPED part (placer omit / generator skip).

    This is the strict bilateral complement to G16's prefix-gated phantom check:
    G16 detects a SUBSET of phantoms (prefix-gated, GA+facility-layout only) as part of
    the broader drawing-set coherence check; G21 closes both directions precisely.

    COHERENT BY CONSTRUCTION (current routing): draw_ga.py's load_manifest() reads
    parts-manifest.json and emits each part's own equipment_tag. On a coherent bake
    the two sets are identical. G21 is the BACKSTOP that fires when a future regression
    breaks that invariant — stale SVG backfilled with the new fingerprint, a changed
    manifest not reflected in the drawing, or a generator skip.

    Abstains when:
    - Fewer than 3 manifest principal tags (trivial / stub bake).
    - The GA SVG text is empty or too small to contain tags.

    Returns (passed, detail).
    """
    man_tags = _manifest_principal_tags(parts)
    if len(man_tags) < 3:
        return (True, f"fewer than 3 manifest principal tags ({len(man_tags)}) — abstain")
    if not ga_svg_text or len(ga_svg_text) < 40:
        return (True, "no GA SVG content — abstain")

    ga_tags = _ga_svg_equipment_tags(ga_svg_text)

    # Intersect with the manifest's prefix set to avoid false positives from numeric
    # strings or reference IDs that match the tag shape but belong to a different
    # letter-prefix family (e.g. "IP-54", "G99", "EN-50549").
    prefixes = {t.split("-", 1)[0] for t in man_tags}
    ga_tags_filtered = {t for t in ga_tags if t.split("-", 1)[0] in prefixes}

    # If the GA declares a top-N subset ("top N of M items by footprint"), the M-N
    # items not drawn are LEGITIMATELY absent — GA convention. The schedule only renders
    # the top-N by footprint; manifest tags absent from the GA are not "dropped" — they
    # are simply outside the top-N. Suppress the dropped check; only phantoms (tags on GA
    # absent from manifest) remain active.
    _sched_tags, _top_n, _total_m = _ga_svg_schedule_tags(ga_svg_text)
    _is_topn = _top_n > 0 and _total_m > _top_n

    phantoms = sorted(ga_tags_filtered - man_tags)   # in GA, not in manifest
    if _is_topn:
        # Any manifest tag absent from the GA is legitimately excluded as bottom-(M-N).
        dropped: list = []
        _topn_note = f" (top-{_top_n}-of-{_total_m} GA subset; dropped check suppressed)"
    else:
        dropped = sorted(man_tags - ga_tags_filtered)  # in manifest, not in GA
        _topn_note = ""

    if phantoms or dropped:
        parts_list = []
        if phantoms:
            parts_list.append(f"phantom tag(s) on GA not in manifest: {', '.join(phantoms[:6])}"
                              + (" …" if len(phantoms) > 6 else ""))
        if dropped:
            parts_list.append(f"manifest principal tag(s) absent from GA: {', '.join(dropped[:6])}"
                              + (" …" if len(dropped) > 6 else ""))
        return (False,
                f"part-set INCOHERENT — {len(phantoms)} phantom(s) + {len(dropped)} dropped: "
                + "; ".join(parts_list))

    return (True,
            f"part-set COHERENT{_topn_note} — {len(man_tags)} manifest principal tag(s); "
            f"0 phantoms + 0 dropped")


# ── G22 RENDER↔DRAWING EXTERIOR-SIGNATURE FEATURE COHERENCE ────────────────────────
# The exterior/above-lid signature FEATURE-FAMILY vocabulary. Both artefacts encode
# the SAME optical tower via INDEPENDENT provenance — the render as a skin signature
# mesh (u_se_le_od*, dumped by build_universal_scene into form-meshes.json's
# `exterior_signature_features`), the GA drawing as a form-rule silhouette (an OPTICAL
# tower zone / tower_size). The normalised FAMILY token is what makes them directly
# comparable, universal across signature forms, never a product-class slug.
_THERMOCYCLER_RE = re.compile(r"thermocycler|thermal[_ -]?cycler|\bpcr\b", re.I)
# The GA instrument-form silhouette stamps an above-lid OPTICAL tower zone label
# (draw_ga.py:1616/1661 svg.text "OPTICAL"). This is the drawing's OWN, INDEPENDENT
# evidence that it drew a protruding optical tower — measured from the GA SVG, not
# inferred from the render — so the two lanes are independent measurements of the same
# physical fact (the crux that lets drawn-but-not-rendered actually fire).
_GA_OPTICAL_ZONE_RE = re.compile(r">\s*OPTICAL\s*<", re.I)


def _ga_drew_optical_tower(ga_svg_text: str, is_thermocycler_form: bool) -> bool:
    """True iff the GA drawing silhouetted an above-lid OPTICAL tower (its own evidence).

    Independent of the render: reads the GA SVG's own OPTICAL zone label. The
    thermocycler silhouette (_draw_thermocycler_form_silhouettes) ALSO stamps an
    "OPTICAL" zone label, but as a generic sample-block/lid colour zone — NOT a
    protruding above-lid optical tower — so is_thermocycler_form suppresses it. That
    keeps a thermocycler (whose render carries NO le_od signature) from false-firing.
    """
    if is_thermocycler_form:
        return False
    if not ga_svg_text:
        return False
    return bool(_GA_OPTICAL_ZONE_RE.search(ga_svg_text))


def _render_exterior_feature_families(form_meshes: Optional[dict]) -> set:
    """RENDER lane — the exterior-visible signature FAMILY set the render itself decided.

    Reads form-meshes.json's `exterior_signature_features` provenance (a list of
    {"family": tok, "mesh": name}) that build_universal_scene serialises from the
    module-level _ABOVE_LID_SIGNATURE_MESHES ∩ exterior-keep survivors — the render's
    OWN exterior-visibility decision. NEVER a per-product prefix guess here: if the
    field is absent/falsy the render carried no exterior signature (empty set → the
    gate abstains). Universal for ANY signature form (thermocycler, syringe-pump,
    future) because it consumes the render's own provenance, not a name vocabulary.

    IMPORTANT: this is EXACTLY the exterior-visible subset — the deliberately-hidden
    translucent bare vial (u_se_le_vial / u_se_le_vial_fluid) is registered above-lid
    but is NOT in exterior_signature_features (build_universal_scene filters it via the
    exterior-keep predicate), so diffing this set never false-fires on the cutaway prop.
    """
    if not isinstance(form_meshes, dict):
        return set()
    feats = form_meshes.get("exterior_signature_features")
    if not isinstance(feats, list):
        return set()
    fams = set()
    for f in feats:
        if isinstance(f, dict):
            fam = str(f.get("family") or "").strip()
            if fam:
                fams.add(fam)
    return fams


def _drawing_exterior_feature_families(
    render_families: set,
    is_instrument_device: bool,
    is_thermocycler_form: bool,
    ga_drew_optical_tower: bool,
) -> set:
    """DRAWING lane — the exterior-feature FAMILY set the GA actually DREW as a silhouette.

    Two provenance sources, INDEPENDENT of the render (so drawn-but-not-rendered can
    actually fire):
      • optical-tower — the GA's OWN OPTICAL zone label (`ga_drew_optical_tower`, read
        from the GA SVG by `_ga_drew_optical_tower`). This is the load-bearing
        independent signal: when the render LOSES the tower (the clamp buried u_se_le_od*
        so exterior_signature_features has no optical-tower) but the GA still stamps the
        OPTICAL tower zone, drawing_set has optical-tower and render_set does not → FIRES.
      • the other exterior families (sample-port / hmi-fascia / lead / …) — these are the
        collar/fascia the GA seats onto the SAME instrument-form body it silhouettes when
        it drew the optical tower; there is no independent per-family divergence signal on
        the drawing side for them, so they are mirrored from the render whenever the GA
        drew an instrument silhouette (the optical zone evidences that silhouette). This
        keeps them from false-firing while the optical-tower carries the real bilateral
        test.

    Applicability:
    - Not an instrument device → GA draws a flat/plant form, no above-lid silhouette → {}.
    - is_thermocycler_form → the GA routes through _draw_thermocycler_form_silhouettes
      (draw_ga.py ~L1517): sample-block / lid / TEC zones, NOT an above-lid optical tower
      (`ga_drew_optical_tower` is already False for it) → optical-tower never in the set.

    Deliberately NOT keyed on `total_height_mm > body_h`: instrument_form_rule_mm always
    returns chamber_h ≥ 38 so that test is degenerate (the false-fire the review caught).
    """
    if not is_instrument_device:
        return set()
    drawn: set = set()
    if ga_drew_optical_tower:
        drawn.add("optical-tower")
        # the instrument silhouette that carries the tower also carries the collar/fascia
        # the render placed on the same body — mirror the render's non-optical families.
        drawn |= {f for f in render_families if f != "optical-tower"}
    return drawn


def render_drawing_feature_coherence_check(
    form_meshes: Optional[dict],
    ga_svg_text: str,
    is_instrument_device: bool,
    is_thermocycler_form: bool,
) -> tuple:
    """PURE G22 — the exterior/above-lid signature FEATURE-FAMILY set must AGREE between
    the RENDER (form-meshes.json exterior_signature_features) and the GA DRAWING
    (form-family silhouette). Bilateral, exactly like G21 phantom/dropped.

    INTENT (organoid vial_bioreactor, 2026-07-23 "lost the light tower"): the GA drawing
    showed a protruding optical tower while the sealed RENDER shipped a flat box — the
    interior containment clamp (build_universal_scene ~L18408) had buried the deliberately
    above-lid u_se_le_od*/vial signature meshes below the opaque shell (fixed 6605a8c62 via
    _ABOVE_LID_SIGNATURE_MESHES). NO existing gate caught it: G19 (shell⊇parts) and G21
    (GA tag-set == manifest principal-tag set) both passed because the tower is a SKIN
    signature mesh — in NEITHER the manifest NOR a principal tag. G22 is the orthogonal
    "exterior signature feature present in one artefact only" check.

    FIRES (passed=False) iff the two family sets differ in either direction:
      • RENDERED-BUT-NOT-DRAWN — a family in the render set but not the drawing set.
      • DRAWN-BUT-NOT-RENDERED — a family in the drawing set but not the render set
        (THE INCIDENT: the GA silhouettes an optical tower while form-meshes shows ZERO
        surviving exterior optical-tower meshes — the render lost the tower).

    ABSTAINS (passed=True, "— abstain") when BOTH sets are EMPTY — no exterior signature
    feature on either artefact, so it never false-fires and never overlaps G19/G20/G21:
      • plant/BESS/process (no form-meshes exterior_signature_features + not instrument);
      • sealed instruments with a flat lid (no od/collar/face exterior family survives +
        the form drew no above-lid silhouette);
      • form-meshes.json missing/unparseable → render side unknown → abstain.

    UNIVERSAL — keyed on the render's OWN _ABOVE_LID_SIGNATURE_MESHES provenance (shared
    by both lanes via the family vocabulary) + the GA form-family, never a product slug.
    Returns (passed, detail).
    """
    render_set = _render_exterior_feature_families(form_meshes)
    ga_drew_optical = _ga_drew_optical_tower(ga_svg_text, is_thermocycler_form)
    drawing_set = _drawing_exterior_feature_families(
        render_set, is_instrument_device, is_thermocycler_form, ga_drew_optical)
    # Symmetric abstain: neither artefact carries an exterior signature feature.
    if not render_set and not drawing_set:
        return (True, "no exterior signature feature on either artefact — abstain")

    rendered_not_drawn = sorted(render_set - drawing_set)   # in render, not drawn
    drawn_not_rendered = sorted(drawing_set - render_set)   # drawn, not rendered

    if rendered_not_drawn or drawn_not_rendered:
        parts_list = []
        if drawn_not_rendered:
            parts_list.append(
                "drawn-but-not-rendered: "
                + ", ".join(drawn_not_rendered)
                + " — fix: build_universal_scene _ABOVE_LID_SIGNATURE_MESHES exemption "
                  "(the containment clamp / suppress pass buried the exterior signature "
                  "mesh below the opaque shell — the 'lost the light tower' bug)")
        if rendered_not_drawn:
            parts_list.append(
                "rendered-but-not-drawn: "
                + ", ".join(rendered_not_drawn)
                + " — fix: draw_ga form-rule (the GA drew a flat/wrong form-family for a "
                  "product whose render carries an exterior signature feature)")
        return (False,
                f"feature set INCOHERENT — {len(drawn_not_rendered)} drawn-not-rendered + "
                f"{len(rendered_not_drawn)} rendered-not-drawn: " + "; ".join(parts_list))

    return (True,
            f"feature set COHERENT — {len(render_set)} exterior signature family(ies) "
            f"in both artefacts: {', '.join(sorted(render_set)) or '—'}")


# A single routed CABLE line whose PLAN span exceeds this is a stray plant-crossing beam
# (mirrors build_universal_scene.WIRE_TRAY_MAX_SPAN_MM); such distribution goes on the P&ID.
STRAY_BEAM_MAX_SPAN_MM = 16000.0

# G7 floor: plant hull ÷ deck must be ≥ this (basis in the G7 block above — a compact
# single-block layout with 1 m part strips + a 3 m deck apron measures ~0.5–0.7; v52's
# stranded-corner defect measured 0.33).
SITE_UTILISATION_MIN = 0.45


# Map a gate to the engine STAGE that fixes it — the loop routes a failing gate back here.
GATE_STAGE = {
    "legibility": "draw-script (layout / multi-sheet wrap — A1 pagination via a1_print)",
    "load_reconcile": "contract (connected_electrical_load_kw) + panel kW resolution",
    "part_coverage": "topology / orphan-connector (per-equipment electrical feeders)",
    "material_diversity": "connection_sizing (per-service material)",
    "qty_coverage": "contract qty-N replication + parts-manifest expansion",
    "no_stray_beam": "wire_ports tray demotion + draw_boundary_services (plant-crossing run → single-line/P&ID)",
    "site_utilisation": "deterministic_layout min-area fold + periphery row + ground-slab 3 m apron (the deck must hug the plant hull)",
    "connection_sanity": "derive-topology role ranks (spine direction) + connection_ledger finalize (service-domain drop + flow-unit canonicalisation) + design-loop writeback reconcile bound",
    "tag_legibility": "draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger)",
    "interior_fill": "build_universal_scene place_sealed_enclosure (pack-array expansion + zone-fill sizing)",
    "plan_lateral_spread": "build_universal_scene _sealed_role_xy_mm / instrument_role_xy + place_sealed_enclosure (role-XY slots shared with hero CAD)",
    "plan_render_coherence": "settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway)",
    "drawing_set_coherence": "placement_fp on EVERY system SVG (GA/P&ID/BFD/SLD/panel/process/facility/distribution) + pairwise fp agree + phantom-tag content check + png≥svg + parts_ledger coverage ≥80%",
    "ga_glance_coherence": "ga_glance_audit.audit_ga_svg (cutaway-claim honesty + envelope-vs-dims + instrument form markers + FRONT data-glance HMI) + draw_ga title/FRONT HMI band",
    "drawing_vision_glance": "drawing_vision_glance.critique_drawing_set (GA PNG + product exterior — flag-only residue; proveCatch on known-bad fixture)",
    "render_ga_vision_coherence": "drawing_vision_glance.render_ga_coherent (RENDER + GA shown together — flag-only cross-artefact residue; retry+tiebreak on nameless-broken; catches vessel-on-top-vs-inside G22 can't see)",
    "drawing_domain": "deriveDeviceEnergyTopology (device-scale topology override) + draw_single_line/_apply_distribution_voltage_model DC-product branch",
    "render_view_quality": "render_view_contract required_views + build_universal_scene product cameras + render_image_quality",
    "cad_geometry_coverage": "cad_asset_resolver DB-first cache + seed_internal_cad_assets + build_universal_scene family imports",
    "enclosure_shell_contains_parts": "minimum_working_envelope (functional-stack height pack) + place_sealed_enclosure env_mm — shell must contain the real mechanical+fluidic part stack",
    "envelope_equality": "generate_drawing_set._manifest_envelope_dims (must read the canonical parts-manifest Enclosure Shell dims_mm — a fallback to the superseded state pre-estimate makes the emitted caption diverge from the shell) + build-excel-export tab_equipment_register (already canonical)",
    "part_set_coherence": "draw_ga.load_manifest() — GA derives its tag set from parts-manifest.json directly; a PHANTOM (tag on GA absent from manifest) means a stale SVG; a DROPPED part (manifest tag absent from GA) means the placer omitted a part or the generator skipped a class — fix at the source (draw_ga or parts-manifest settle loop)",
    "render_drawing_feature_coherence": "build_universal_scene _ABOVE_LID_SIGNATURE_MESHES exemption (interior containment clamp ~L18408 + _suppress_instrument_boilerplate_meshes must NOT bury/hide an above-lid exterior signature mesh — the 'lost the light tower' bug) for a DRAWN-not-rendered miss; draw_ga form-rule / is_thermocycler_form silhouette for a RENDERED-not-drawn miss — the render's exterior_signature_features (form-meshes.json) and the GA form-family silhouette must encode the SAME exterior feature family set",
}


def scorecard(gates: list, state: Optional[dict] = None) -> dict:
    by_drawing: dict = {}
    for g in gates:
        for dwg in g.drawings:
            by_drawing.setdefault(dwg, []).append(g)
    cards = {}
    n_skipped = 0
    for dwg, gl in sorted(by_drawing.items()):
        fails = [g for g in gl if not g.passed]
        # D2 (2026-07-20): a drawing appears in the scorecard because a gate LISTS it,
        # not because a gate VERIFIED it. A multi-drawing gate (e.g. part_coverage lists
        # single-line-diagram + panel-schedule + pid) marks EVERY listed drawing pass:true
        # when it passes — even ones OUT OF SCOPE for this product (a fluid-less handheld
        # has no P&ID). A co-listed out-of-scope drawing was never actually inspected, so
        # it must read `skipped`, never a green `pass` (and never a `fail` co-attached from
        # a gate whose real subject is the in-scope drawing). Checked OOS-FIRST so the
        # gate's real pass/fail verdict lands on its in-scope drawing(s); gate-level
        # `all_pass` stays the backstop for any fail. With no state we cannot know the pack
        # → assume in scope (back-compat for the unit harness). GUARD: only a genuine
        # form-factor DRAWING (a `_STEM_TO_PACK_KEY` member) can be OOS-skipped — a
        # co-listed pseudo-surface (`renders`, `line-velocity-schedule`) is scored
        # regardless of the drawing pack and must keep its real pass/fail (else a genuine
        # render/schedule defect would be laundered into `skipped`).
        if (state is not None and dwg in _STEM_TO_PACK_KEY
                and not _in_drawing_pack(state, dwg)):
            status = "skipped"
            n_skipped += 1
        elif fails:
            status = "fail"
        else:
            status = "pass"
        cards[dwg] = {"pass": status == "pass", "status": status,
                      "failing_gates": ([{"gate": g.name, "severity": g.severity,
                                          "stage": GATE_STAGE.get(g.name, "?"), "detail": g.detail}
                                         for g in fails] if status == "fail" else [])}
    all_pass = all(g.passed for g in gates)
    return {"all_pass": all_pass, "n_gates": len(gates),
            "n_failing": sum(1 for g in gates if not g.passed),
            "n_drawings_skipped": n_skipped, "drawings": cards}


def main(argv) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] in ("--selftest", "selftest"):
        return _selftest()
    out_dir = argv[0]
    gates = run_gates(out_dir)
    _state = None
    try:
        _state = json.load(open(os.path.join(out_dir, "state.json")))
    except Exception:  # noqa: BLE001
        _state = None
    card = scorecard(gates, _state)
    json.dump(card, open(os.path.join(out_dir, "drawing-gates.json"), "w"), indent=2)
    print(f"[drawing-gates] {card['n_gates']} gates · {card['n_failing']} failing · "
          f"{card.get('n_drawings_skipped', 0)} drawing(s) skipped (out-of-scope) · "
          f"ALL-PASS={card['all_pass']}")
    for g in gates:
        mark = "✓" if g.passed else "✗"
        print(f"  {mark} [{g.severity:4}] {g.name:18} {g.detail}")
    return 0 if card["all_pass"] else 1


def _selftest() -> int:
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    # vessel-manifest realism (G18c) proveCatch: the tiny hidden base-mesh (2.9 mm)
    # FIRES; the drawn cutaway-cue vessel (29.7×63) PASSES; a holder/probe is not the
    # vessel; a non-instrument / vessel-less design abstains (None).
    _vp_micro = [{"equipment_tag": "X-103", "name": "Borosilicate Culture Vial 20 ml",
                  "dims_mm": {"w": 2.9, "d": 2.9, "h": 6.1}},
                 {"equipment_tag": "X-105", "name": "Vial Holder Fixture",
                  "dims_mm": {"w": 60.0, "d": 40.0, "h": 30.0}}]
    _vp_real = [{"equipment_tag": "X-103", "name": "Borosilicate Culture Vial 20 ml",
                 "dims_mm": {"w": 29.7, "d": 29.7, "h": 63.0}}]
    _vm = vessel_manifest_realistic_check(_vp_micro, True)
    chk("g18c_micro_vessel_fires", _vm is not None and _vm[0] is False)
    _vr = vessel_manifest_realistic_check(_vp_real, True)
    chk("g18c_real_vessel_passes", _vr is not None and _vr[0] is True)
    chk("g18c_no_vessel_abstains",
        vessel_manifest_realistic_check([{"name": "Vial Holder Fixture",
                                          "dims_mm": {"w": 2.0, "d": 2.0, "h": 2.0}}], True) is None)
    chk("g18c_non_instrument_abstains", vessel_manifest_realistic_check(_vp_micro, False) is None)

    # legibility: a 9:1 strip fails, a 1.3:1 sheet passes (pure aspect logic)
    chk("legible_pass", (lambda a: a <= 4.0)(2160 / 1716))
    chk("legible_fail", not (lambda a: a <= 4.0)(17858 / 1960))
    # G1b min-text-at-A1-print-scale proveCatch: a 12000-px-wide SVG with 10 px text
    # squeezed onto ONE A1 sheet prints ~0.67 mm lettering → the gate FIRES; the SAME
    # drawing paginated (a1_print planner → 4×1 A1 sheets; 3 sheets is still <2.5 mm)
    # prints ≥2.5 mm → PASS. Adversarial input drives the decision both directions.
    a1 = _a1_mod()
    chk("a1_mod_present", a1 is not None)
    if a1 is not None:
        bad_svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="12000" height="2000">'
                   '<text x="10" y="30" font-size="10">microscopic label</text></svg>')
        dims, font = a1.svg_px_dims(bad_svg), a1.min_font_px(bad_svg)
        one_sheet_mm = font * a1.sheet_scale_mm_per_px(dims[0], dims[1], 1, 1)
        chk("min_text_fires_on_strip", not (one_sheet_mm >= A1_MIN_TEXT_MM))
        plan = a1.plan_sheets(dims[0], dims[1], font)
        chk("min_text_pass_when_paginated",
            plan["meets_bar"] and plan["min_text_mm"] >= A1_MIN_TEXT_MM)
        chk("three_sheets_not_enough",
            font * a1.sheet_scale_mm_per_px(dims[0], dims[1], 3, 1) < A1_MIN_TEXT_MM)
        chk("planner_picked_smallest_grid", plan["sheets"] == 4)
        # severity mapping: sub-1.8 mm lettering is a HIGH, 1.8-2.5 mm a MED
        chk("min_text_severity_high", ("high" if one_sheet_mm < 1.8 else "med") == "high")
        chk("min_text_severity_med", ("high" if 2.1 < 1.8 else "med") == "med")
    # load reconcile ratio band
    chk("load_ok", 0.85 <= (1417 / 1417) <= 1.15)
    chk("load_under", not (0.85 <= (1050 / 1417) <= 1.15))   # the pre-fix undercount fails
    # G2 two-board semantic authority: contract auxiliary-consumer load selects
    # AUX, never the first/principal transfer board.
    _g2_md = (
        "## MAIN DC BUS\n| **Total connected load** | 11.04 kW |\n"
        "| W1 | DC DC Converters | 11.04 |\n"
        "## AUX BOARD\n| **Total connected load** | 0.21 kW |\n"
        "| W1 | Auxiliary Power Supply | 0.09 |\n"
        "| W2 | Active Ventilation Fan | 0.06 |\n"
        "| W3 | Audible Alarm | 0.06 |\n")
    _g2_state = {"orchestratorContract": {"quantities": {
        "connected_electrical_load_kw": {"value": 0.21},
        "electrical_consumer__auxiliary_power_supply_kw": {"value": 0.09},
        "electrical_consumer__active_ventilation_fan_kw": {"value": 0.06},
        "electrical_consumer__audible_alarm_kw": {"value": 0.06},
    }}}
    _g2_total, _g2_board = _g2_panel_total(_g2_md, _g2_state)
    chk("g2_semantic_aux_board_selected",
        _g2_total == 0.21 and _g2_board == "AUX BOARD")
    _g2_legacy_total, _ = _g2_panel_total(_g2_md, {})
    chk("g2_legacy_first_board_preserved", _g2_legacy_total == 11.04)
    # part coverage: a pump with no feeder is flagged; the subset-match logic
    htoks = set("recirc pump".split())
    chk("part_fed", htoks <= set("standby diesel generator recirc pump".split()))
    chk("part_unfed", not (htoks <= set("standby diesel generator heat pump".split())))
    # G3 housed-power carve-out proveCatch (the v54…v56d 'Vfd Drive' repeat-flag):
    # a cabinet-HOUSED power device (VFD / soft-start — parts_ledger._HOUSED_POWER_RE,
    # the ONE rule shared with the ledger's cabinet deck + ga_massing's panel-internal
    # drop) is busbar-fed INSIDE its enclosure → needs NO dedicated SLD feeder; a real
    # powered principal with no feeder MUST still fire (both directions).
    _g3_bom = [{"requirement": "Vfd Drive"},           # housed → never a feeder row
               {"requirement": "Soft-Start Unit"},     # housed → never a feeder row
               {"requirement": "Recirc Pump"},         # principal, UNFED → must fire
               {"requirement": "Irrigation Pump"},     # principal, fed → clean
               {"requirement": "Agitator Drive"}]      # a REAL drive-driven machine, UNFED → must fire
    _g3_missing = g3_missing_feeders(_g3_bom, {"motor control center irrigation pump"})
    chk("g3_vfd_housed_not_flagged", "Vfd Drive" not in _g3_missing)
    chk("g3_softstart_housed_not_flagged", "Soft-Start Unit" not in _g3_missing)
    chk("g3_unfed_pump_still_fires", "Recirc Pump" in _g3_missing)
    chk("g3_real_drive_still_fires", "Agitator Drive" in _g3_missing)
    chk("g3_fed_pump_clean", "Irrigation Pump" not in _g3_missing)
    # the shared rule really is the ledger's own regex (import, not a drifted copy)
    try:
        import parts_ledger as _pl
        chk("g3_shares_ledger_rule", _housed_power_re() is _pl._HOUSED_POWER_RE)
    except ImportError:
        pass
    # qty coverage threshold
    chk("qty_ok", 8 >= max(2, int(8 * 0.8)))
    chk("qty_collapsed", not (1 >= max(2, int(8 * 0.8))))    # collapsed-to-1 fails
    # material diversity
    chk("mat_ok", len({"hdpe/pe100", "duplex 2205"}) >= 2)
    chk("mat_uniform", not (len({"316l stainless"}) >= 2))
    # G4 fluid-route filter proveCatch (2026-07-11 powerwall run 71): an all-electrical
    # route set (cables/busbars, material None) yields ZERO fluid routes → the gate is
    # not emitted (never "0 materials FAIL"); a real fluid route survives the filter so
    # a uniform-material fluid plant STILL fires. Same regex as the gate body.
    _g4_rx = re.compile(r"electr|signal|data|comms|network|bus\b")
    _g4_elec = [{"mechanism": "electrical_bus"}, {"mechanism": "electrical_cable",
                "service": "LV power feeder 230V 1ph"}]
    _g4_fluid = [{"mechanism": "pipe", "service": "process water", "material": "316l stainless"}]
    chk("g4_all_electrical_skipped",
        not [r for r in _g4_elec if not _g4_rx.search(str(r.get("mechanism") or r.get("service") or "").lower())])
    chk("g4_fluid_route_survives",
        [r for r in _g4_fluid if not _g4_rx.search(str(r.get("mechanism") or r.get("service") or "").lower())])
    # proveCatch (NinjaPCR 2026-07-15): instrument + single fluid material must NOT
    # emit material_diversity (plant-only rule).
    _g4_inst = {"isInstrumentDevice": True}
    _g4_plant = {"isInstrumentDevice": False}
    chk("g4_instrument_skips_material_diversity",
        not (_g4_inst.get("isInstrumentDevice") is False))  # polarity of the skip guard
    chk("g4_plant_still_subjects_fluid_to_diversity",
        not _g4_plant.get("isInstrumentDevice"))
    # G10 interior-fill proveCatch (2026-07-11 run 73): the REAL shipped manifest shape —
    # 33 small boxes ≈ 3% of the 0.13 m³ enclosure — FIRES; a pack-array interior
    # (~50%) passes; skin parts are excluded from the numerator both ways.
    _g10_sparse = ([{"name": f"Part {i}", "dims_mm": {"w": 90, "d": 135, "h": 85}}
                    for i in range(33)]   # ≈ run-73's real 27% — must FIRE
                   + [{"name": "Enclosure Housing", "dims_mm": {"w": 1105, "d": 193, "h": 609}}])
    _g10_dense = [{"name": "LFP Prismatic Cells", "dims_mm": {"w": 700, "d": 160, "h": 500}},
                  {"name": "DC AC Inverter Module", "dims_mm": {"w": 570, "d": 120, "h": 220}}]
    _f_sparse = interior_fill_fraction(_g10_sparse, 0.13)
    _f_dense = interior_fill_fraction(_g10_dense, 0.13)
    chk("g10_sparse_interior_fires", _f_sparse is not None and _f_sparse < INTERIOR_FILL_MIN)
    chk("g10_dense_interior_passes", _f_dense is not None and _f_dense >= INTERIOR_FILL_MIN)
    chk("g10_no_dims_abstains", interior_fill_fraction([{"name": "X"}], 0.13) is None)
    # G14 plan-lateral proveCatch (2026-07-14 Powerwall): ALL parts at (0,0) FIRES;
    # role-spread slots (fans L/R + heatsink + caps) PASS; skin-only abstains.
    _g14_pile = [{"name": f"Part {i}", "pos_mm": [0.0, 0.0, 100.0 + i]}
                 for i in range(8)]
    _g14_spread = [
        {"name": "Active Ventilation Fan", "pos_mm": [-110.0, -25.0, 900.0]},
        {"name": "Active Ventilation Fan B", "pos_mm": [110.0, -25.0, 900.0]},
        {"name": "Extruded Heatsink", "pos_mm": [-140.0, -7.0, 600.0]},
        {"name": "DC Link Capacitor", "pos_mm": [90.0, -7.0, 600.0]},
        {"name": "BMS Controller PCB", "pos_mm": [-90.0, -25.0, 800.0]},
    ]
    chk("g14_centreline_pile_fires",
        plan_lateral_unique_xy(_g14_pile) == 1
        and plan_lateral_unique_xy(_g14_pile) < PLAN_LATERAL_MIN_UNIQUE)
    chk("g14_role_spread_passes",
        plan_lateral_unique_xy(_g14_spread) is not None
        and plan_lateral_unique_xy(_g14_spread) >= PLAN_LATERAL_MIN_UNIQUE)
    chk("g14_skin_only_abstains",
        plan_lateral_unique_xy([{"name": "Enclosure Housing", "pos_mm": [0, 0, 0]}]) is None)
    # G15 ga-render coherence proveCatch (Codema plant + Powerwall product 2026-07-14):
    # plant + stale 01-top FIRES; fresh plant + matching fp PASSES; product requires
    # 00-hero (not 01-top); wrong GA fingerprint FIRES; <3 parts abstains.
    import tempfile, time as _time
    _g15_td = tempfile.mkdtemp(prefix="g15-")
    try:
        _parts54 = [
            {"equipment_tag": f"P-{i:03d}", "name": f"Pump {i}",
             "pos_mm": [i * 100.0, 0.0, 0.0]}
            for i in range(54)
        ]
        _fp54 = placement_fingerprint(_parts54)
        _mani = {
            "schema": "parts-manifest/1", "count": 54,
            "rooms": [{"name": "Mech Plant Rm"}],
            "parts": _parts54,
            "placement_fp": _fp54,
        }
        _mp = os.path.join(_g15_td, "parts-manifest.json")
        json.dump(_mani, open(_mp, "w"))
        _plan = os.path.join(_g15_td, "01-top.png")
        open(_plan, "wb").write(b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        os.makedirs(os.path.join(_g15_td, "drawings"), exist_ok=True)
        _ga_svg = os.path.join(_g15_td, "drawings", "general-arrangement.svg")
        open(_ga_svg, "w").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" data-placement-fp="{_fp54}" '
            f'width="100" height="100"></svg>')
        open(os.path.join(_g15_td, "drawings", "general-arrangement.png"), "wb").write(
            b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        _time.sleep(0.05)
        os.utime(_mp, None)
        os.utime(_plan, (os.path.getmtime(_mp) - 60, os.path.getmtime(_mp) - 60))
        _stale = ga_render_manifest_coherent(_g15_td)
        chk("g15_stale_plan_fires", _stale is not None and _stale[0] is False)
        os.utime(_plan, None)
        os.utime(os.path.join(_g15_td, "drawings", "general-arrangement.png"), None)
        _ok = ga_render_manifest_coherent(_g15_td)
        chk("g15_fresh_plan_passes", _ok is not None and _ok[0] is True)
        # Wrong fingerprint on GA must FIRE even when mtimes are fresh.
        open(_ga_svg, "w").write(
            '<svg xmlns="http://www.w3.org/2000/svg" data-placement-fp="deadbeefdeadbeef" '
            'width="100" height="100"></svg>')
        _bad_fp = ga_render_manifest_coherent(_g15_td)
        chk("g15_fingerprint_mismatch_fires",
            _bad_fp is not None and _bad_fp[0] is False and "fingerprint" in _bad_fp[1])
        # proveCatch (Powerwall 2026-07-15): GA stamped with a DISPLAY-rebased
        # fingerprint (FFL z-shift) while the manifest keeps the settled fp MUST
        # fire — this is the exact defect that shipped on powerwall-20260715-0512.
        _rebased = [
            {**p, "pos_mm": [p["pos_mm"][0], p["pos_mm"][1],
                             p["pos_mm"][2] - 825.0]}
            for p in _parts54[:8]
        ]
        _fp_rebased = placement_fingerprint(_rebased)
        assert _fp_rebased != _fp54, "proveCatch setup: rebased fp must diverge"
        open(_ga_svg, "w").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'data-placement-fp="{_fp_rebased}" width="100" height="100"></svg>')
        os.utime(_plan, None)
        os.utime(os.path.join(_g15_td, "drawings", "general-arrangement.png"), None)
        _rebase_fire = ga_render_manifest_coherent(_g15_td)
        chk("g15_product_ffl_rebase_fp_fires",
            _rebase_fire is not None and _rebase_fire[0] is False
            and "fingerprint" in _rebase_fire[1]
            and _fp_rebased in _rebase_fire[1]
            and str(_fp54) in _rebase_fire[1])
        # Restore matching fp for subsequent product-scale checks.
        open(_ga_svg, "w").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" data-placement-fp="{_fp54}" '
            f'width="100" height="100"></svg>')
        # Product-scale: 01-top alone is NOT enough — needs 00-hero cutaway.
        _prod = tempfile.mkdtemp(prefix="g15-prod-")
        _pparts = [
            {"equipment_tag": "X-101", "name": "Inverter", "pos_mm": [-100.0, -10.0, 900.0]},
            {"equipment_tag": "X-118", "name": "Battery Modules", "pos_mm": [0.0, 10.0, 400.0]},
            {"equipment_tag": "K-101", "name": "Active Ventilation Fan",
             "pos_mm": [80.0, -20.0, 1100.0]},
        ]
        _pfp = placement_fingerprint(_pparts)
        json.dump({
            "count": 3, "parts": _pparts, "rooms": [], "placement_fp": _pfp,
            "bbox_mm": {"length_mm": 618, "width_mm": 182, "height_mm": 1260},
        }, open(os.path.join(_prod, "parts-manifest.json"), "w"))
        json.dump({"orchestratorContract": {"quantities": {
            "enclosure_volume_m3": {"value": 0.14},
        }}}, open(os.path.join(_prod, "state.json"), "w"))
        open(os.path.join(_prod, "01-top.png"), "wb").write(
            b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        _prod_no_hero = ga_render_manifest_coherent(_prod)
        chk("g15_product_without_hero_fires",
            _prod_no_hero is not None and _prod_no_hero[0] is False
            and "00-hero" in _prod_no_hero[1])
        open(os.path.join(_prod, "00-hero.png"), "wb").write(
            b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        os.makedirs(os.path.join(_prod, "drawings"), exist_ok=True)
        open(os.path.join(_prod, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_pfp}" width="10" height="10">'
            f'<text>FRONT (door removed · looking in)</text></svg>')
        open(os.path.join(_prod, "drawings", "general-arrangement.png"), "wb").write(
            b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        _prod_ok = ga_render_manifest_coherent(_prod)
        chk("g15_product_with_hero_passes",
            _prod_ok is not None and _prod_ok[0] is True)
        # Plant-style GA on a product must FIRE.
        open(os.path.join(_prod, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_pfp}" width="10" height="10">'
            f'<text>PLAN (roof removed · looking down)</text></svg>')
        _prod_plan = ga_render_manifest_coherent(_prod)
        chk("g15_product_plant_style_ga_fires",
            _prod_plan is not None and _prod_plan[0] is False
            and "FRONT" in _prod_plan[1])
        # Instrument exterior form (not cabinet cutaway) must also PASS G15 —
        # otherwise G15 fights G17 and forces the cutaway lie forever.
        open(os.path.join(_prod, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_pfp}" width="10" height="10">'
            f'<text>FRONT (product form · matches Blender exterior)</text></svg>')
        _prod_form = ga_render_manifest_coherent(_prod)
        chk("g15_instrument_product_form_passes",
            _prod_form is not None and _prod_form[0] is True)
        # Instrument Assembly cutaway caption (cover removed) must also PASS —
        # draw_ga emits this when BoM parts are seated; G15 must not reject it.
        open(os.path.join(_prod, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_pfp}" width="10" height="10">'
            f'<text>FRONT (cover removed · assembly internals)</text></svg>')
        _prod_cover = ga_render_manifest_coherent(_prod)
        chk("g15_instrument_cover_removed_passes",
            _prod_cover is not None and _prod_cover[0] is True)
        open(os.path.join(_prod, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_pfp}" width="10" height="10">'
            f'<text>FRONT (door removed · looking in)</text></svg>')
        # Stale hero-embed vs fresher exterior must FIRE (colorimeter cover≠Renders).
        open(os.path.join(_prod, "04-product-exterior.png"), "wb").write(
            b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        open(os.path.join(_prod, "hero-embed.png"), "wb").write(
            b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        import time as _t2
        _t2.sleep(0.05)
        os.utime(os.path.join(_prod, "04-product-exterior.png"), None)
        os.utime(os.path.join(_prod, "hero-embed.png"),
                 (os.path.getmtime(os.path.join(_prod, "04-product-exterior.png")) - 120,
                  os.path.getmtime(os.path.join(_prod, "04-product-exterior.png")) - 120))
        _stale_embed = ga_render_manifest_coherent(_prod)
        chk("g15_stale_hero_embed_fires",
            _stale_embed is not None and _stale_embed[0] is False
            and "hero-embed" in _stale_embed[1])
        _tiny = tempfile.mkdtemp(prefix="g15-tiny-")
        json.dump({"count": 1, "parts": [{"name": "A", "equipment_tag": "A-1",
                                          "pos_mm": [0, 0, 0]}], "rooms": []},
                  open(os.path.join(_tiny, "parts-manifest.json"), "w"))
        chk("g15_too_few_parts_abstains",
            ga_render_manifest_coherent(_tiny) is None)
        # G16 drawing-set coherence proveCatch (2026-07-14): matching fp on GA+P&ID
        # PASSES; missing fp on P&ID FIRES; NA-BY-DESIGN P&ID is exempt; low coverage FIRES.
        _g16 = tempfile.mkdtemp(prefix="g16-")
        _g16p = [
            {"equipment_tag": f"TK-{i:03d}", "name": f"Tank {i}",
             "pos_mm": [i * 500.0, 0.0, 0.0]}
            for i in range(8)
        ]
        _g16fp = placement_fingerprint(_g16p)
        json.dump({"count": 8, "parts": _g16p, "placement_fp": _g16fp,
                   "rooms": [{"name": "Mech"}]},
                  open(os.path.join(_g16, "parts-manifest.json"), "w"))
        os.makedirs(os.path.join(_g16, "drawings"), exist_ok=True)
        open(os.path.join(_g16, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100"></svg>')
        open(os.path.join(_g16, "drawings", "pid.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100">'
            f'<text>TK-001</text></svg>')
        open(os.path.join(_g16, "drawings", "block-flow-diagram.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100"></svg>')
        open(os.path.join(_g16, "drawings", "single-line-diagram.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100"></svg>')
        json.dump({"coverage_by_drawing": {
            "general-arrangement": {"expected": 8, "present": 8, "pct": 100.0},
            "pid": {"expected": 8, "present": 8, "pct": 100.0},
            "block-flow-diagram": {"expected": 4, "present": 4, "pct": 100.0},
            "single-line-diagram": {"expected": 2, "present": 2, "pct": 100.0},
        }}, open(os.path.join(_g16, "parts-ledger.json"), "w"))
        _g16_ok = drawing_set_coherent(_g16)
        chk("g16_matching_fp_passes", _g16_ok is not None and _g16_ok[0] is True)
        open(os.path.join(_g16, "drawings", "pid.svg"), "w").write(
            '<svg width="100" height="100"><text>TK-001</text></svg>')
        _g16_miss = drawing_set_coherent(_g16)
        chk("g16_missing_pid_fp_fires",
            _g16_miss is not None and _g16_miss[0] is False
            and "pid" in _g16_miss[1])
        open(os.path.join(_g16, "drawings", "pid.svg"), "w").write(
            '<svg width="100" height="100"><text>P&ID — NOT APPLICABLE '
            '(NA-BY-DESIGN)</text></svg>')
        json.dump({"coverage_by_drawing": {
            "general-arrangement": {"expected": 8, "present": 8, "pct": 100.0},
            "pid": {"expected": 0, "present": 0, "pct": None},
            "block-flow-diagram": {"expected": 4, "present": 4, "pct": 100.0},
            "single-line-diagram": {"expected": 2, "present": 2, "pct": 100.0},
        }}, open(os.path.join(_g16, "parts-ledger.json"), "w"))
        _g16_na = drawing_set_coherent(_g16)
        chk("g16_na_pid_exempt", _g16_na is not None and _g16_na[0] is True)
        json.dump({"coverage_by_drawing": {
            "general-arrangement": {"expected": 8, "present": 4, "pct": 50.0},
            "pid": {"expected": 0, "present": 0, "pct": None},
            "block-flow-diagram": {"expected": 4, "present": 4, "pct": 100.0},
            "single-line-diagram": {"expected": 2, "present": 2, "pct": 100.0},
        }}, open(os.path.join(_g16, "parts-ledger.json"), "w"))
        _g16_cov = drawing_set_coherent(_g16)
        chk("g16_low_coverage_fires",
            _g16_cov is not None and _g16_cov[0] is False
            and "coverage" in _g16_cov[1])
        # Restore coverage; prove panel-schedule must carry fp too.
        json.dump({"coverage_by_drawing": {
            "general-arrangement": {"expected": 8, "present": 8, "pct": 100.0},
            "pid": {"expected": 0, "present": 0, "pct": None},
            "block-flow-diagram": {"expected": 4, "present": 4, "pct": 100.0},
            "single-line-diagram": {"expected": 2, "present": 2, "pct": 100.0},
            "panel-schedule": {"expected": 2, "present": 2, "pct": 100.0},
        }}, open(os.path.join(_g16, "parts-ledger.json"), "w"))
        open(os.path.join(_g16, "drawings", "pid.svg"), "w").write(
            '<svg width="100" height="100"><text>P&ID — NOT APPLICABLE '
            '(NA-BY-DESIGN)</text></svg>')
        open(os.path.join(_g16, "drawings", "panel-schedule.svg"), "w").write(
            '<svg width="100" height="100"><text>PANEL</text></svg>')
        _g16_panel = drawing_set_coherent(_g16)
        chk("g16_panel_missing_fp_fires",
            _g16_panel is not None and _g16_panel[0] is False
            and "panel-schedule" in _g16_panel[1])
        open(os.path.join(_g16, "drawings", "panel-schedule.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100">'
            f'<text>PANEL</text></svg>')
        # Phantom tag on GA (same letter prefix, wrong number) must FIRE.
        open(os.path.join(_g16, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100">'
            f'<text>TK-999</text></svg>')
        _g16_phant = drawing_set_coherent(_g16)
        chk("g16_phantom_tag_fires",
            _g16_phant is not None and _g16_phant[0] is False
            and "phantom" in _g16_phant[1])
        open(os.path.join(_g16, "drawings", "general-arrangement.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100">'
            f'<text>TK-001</text></svg>')
        # Topology-only tags on SLD must NOT fire (not a placement-projected sheet).
        open(os.path.join(_g16, "drawings", "single-line-diagram.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100">'
            f'<text>X-999</text></svg>')
        # Keep panel stamped; restore BFD to matching fp for the silent check.
        open(os.path.join(_g16, "drawings", "block-flow-diagram.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100"></svg>')
        open(os.path.join(_g16, "drawings", "panel-schedule.svg"), "w").write(
            f'<svg data-placement-fp="{_g16fp}" width="100" height="100"></svg>')
        _png_ok = os.path.join(_g16, "drawings", "general-arrangement.png")
        if os.path.exists(_png_ok):
            os.utime(_png_ok, None)
        _g16_topo = drawing_set_coherent(_g16)
        chk("g16_topology_tag_on_sld_silent",
            _g16_topo is not None and _g16_topo[0] is True)
        # Stale PNG vs fresher SVG must FIRE.
        _png = os.path.join(_g16, "drawings", "general-arrangement.png")
        open(_png, "wb").write(b"\x89PNG\r\n\x1a\n" + b"\0" * 2000)
        import time as _t3
        _t3.sleep(0.05)
        os.utime(os.path.join(_g16, "drawings", "general-arrangement.svg"), None)
        os.utime(_png, (os.path.getmtime(
            os.path.join(_g16, "drawings", "general-arrangement.svg")) - 120,
            os.path.getmtime(
            os.path.join(_g16, "drawings", "general-arrangement.svg")) - 120))
        _g16_png = drawing_set_coherent(_g16)
        chk("g16_stale_png_fires",
            _g16_png is not None and _g16_png[0] is False
            and "png older" in _g16_png[1])
        os.utime(_png, None)
        # Pairwise disagree: BFD stamped with a different fp must FIRE.
        open(os.path.join(_g16, "drawings", "block-flow-diagram.svg"), "w").write(
            '<svg data-placement-fp="aaaaaaaaaaaaaaaa" width="100" height="100"></svg>')
        _g16_pair = drawing_set_coherent(_g16)
        chk("g16_pairwise_fp_disagree_fires",
            _g16_pair is not None and _g16_pair[0] is False
            and ("block-flow" in _g16_pair[1] or "disagree" in _g16_pair[1]))
        # G17 glance audit proveCatch (2026-07-14): empty cover-removed claim
        # must FIRE; assembly with PCB+tags must PASS; exterior form still PASS.
        from ga_glance_audit import audit_ga_svg, _selftest as _g17_self
        _g17_self()
        _bad_ga = (
            '<svg><text>FRONT (cover removed · assembly internals)</text>'
            '<text>product envelope 0.2 m (L) × 0.1 m (W) × 0.1 m (H)</text>'
            '<text>183</text><text>145</text><text>120</text>'
            '<text>OPTICAL</text><text>UI DECK</text>'
            '<rect fill="#c8e6d8"/>'
            + ''.join(
                '<rect fill="none" stroke="#5b6470" width="17" height="17"/>'
                for _ in range(6))
            + '</svg>'
        )
        _bad_codes = {f.code for f in audit_ga_svg(
            _bad_ga, is_instrument_device=True, is_product_scale=True)}
        chk("g17_empty_cutaway_lie_fires",
            "cutaway_claim_without_parts" in _bad_codes)
        chk("g17_envelope_mismatch_fires", "envelope_vs_dimension_mismatch" in _bad_codes)
        _good_asm = (
            '<svg><text>FRONT (cover removed · assembly internals)</text>'
            '<text>product envelope 183 × 145 × 120 mm (L×W×H)</text>'
            '<text>183</text><text>145</text><text>120</text>'
            '<text>OPTICAL</text><text>UI DECK</text>'
            '<text>I-113</text><text>X-112</text><text>I-114</text><text>I-108</text>'
            '<rect fill="#c8e6d8" data-glance="front-display"/>'
            '<rect fill="#e8eef5" data-glance="front-ui-deck"/>'
            '<rect fill="#c5e1a5" data-glance="front-pcb"/>'
            + ''.join(
                '<rect fill="none" stroke="#5b6470" width="17" height="17"/>'
                for _ in range(6))
            + '</svg>'
        )
        chk("g17_honest_assembly_passes",
            audit_ga_svg(_good_asm, is_instrument_device=True,
                         is_product_scale=True) == [])
        _good_ga = (
            '<svg><text>FRONT (product form · matches Blender exterior)</text>'
            '<text>product envelope 183 × 145 × 120 mm (L×W×H)</text>'
            '<text>183</text><text>145</text><text>120</text>'
            '<text>OPTICAL</text><text>UI DECK</text>'
            '<rect fill="#c8e6d8" data-glance="front-display"/>'
            '<rect fill="#e8eef5" data-glance="front-ui-deck"/>'
            + ''.join(
                '<rect fill="none" stroke="#5b6470" width="17" height="17"/>'
                for _ in range(6))
            + '</svg>'
        )
        chk("g17_honest_form_passes",
            audit_ga_svg(_good_ga, is_instrument_device=True,
                         is_product_scale=True) == [])
        _no_front = _good_ga.replace('data-glance="front-display"', "").replace(
            'data-glance="front-ui-deck"', "")
        chk("g17_front_missing_hmi_fires",
            "instrument_front_missing_hmi" in {
                f.code for f in audit_ga_svg(
                    _no_front, is_instrument_device=True, is_product_scale=True)})
        # G18 drawing-vision glance proveCatch (offline skip + prompt contract).
        from drawing_vision_glance import _selftest as _g18_self
        _g18_self()
        chk("g18_vision_glance_selftest", True)
        # G19 ENCLOSURE SHELL CONTAINS PARTS BBOX proveCatch (both directions):
        # (a) shell that CONTAINS the parts → PASS
        _g19_parts_fit = [
            {"name": "Enclosure Shell", "dims_mm": {"w": 250.0, "d": 190.0, "h": 110.0}},
            {"name": "Heatsink Fan",    "dims_mm": {"w": 80.0,  "d": 80.0,  "h": 96.0}},
        ]
        _g19_bbox_fit  = {"length_mm": 229.0, "width_mm": 175.0, "height_mm": 96.0}
        _g19_ok_fit, _ = enclosure_shell_contains_check(_g19_parts_fit, _g19_bbox_fit)
        chk("g19_pass_when_shell_contains", _g19_ok_fit)
        # (b) the 1603 organoid defect class: shell height 78mm, parts height 96mm
        # → excess 18mm > 15mm tolerance → FAIL. The actual 1603 run had shell=82mm vs
        # parts=96.4mm (14.4mm excess — borderline), but the ROOT CAUSE (heatsink fan
        # 80mm+fan assembly sticking above the envelope) is best tested with a clear
        # excess beyond the 15mm wall-clearance tolerance.
        _g19_parts_fail = [
            {"name": "Enclosure Shell", "dims_mm": {"w": 221.0, "d": 165.0, "h": 78.0}},
            {"name": "Heatsink Fan",    "dims_mm": {"w": 80.0,  "d": 78.0,  "h": 96.0}},
        ]
        _g19_bbox_fail  = {"length_mm": 229.0, "width_mm": 175.0, "height_mm": 96.0}
        _g19_ok_fail, _g19_msg = enclosure_shell_contains_check(_g19_parts_fail, _g19_bbox_fail)
        chk("g19_fail_when_parts_exceed_shell", not _g19_ok_fail)
        chk("g19_detail_mentions_excess", "excess" in _g19_msg)
        # (c) abstain when no Enclosure Shell part in manifest
        _g19_ok_abs, _ = enclosure_shell_contains_check(
            [], {"length_mm": 200.0, "width_mm": 100.0, "height_mm": 80.0})
        chk("g19_abstains_without_shell_part", _g19_ok_abs)
        # (d) proveCatch for the REORDER fix (place_sealed_enclosure council fix #2, 2026-07-22):
        # The organoid-bioreactor-20260722-2050 defect: the pre-placement _SEALED_ENV_MM
        # (248×188×108 mm) was used to build the MESH; the placer then spread parts to a bbox
        # of 262×251×116 mm. Goodhart patches (fa113262a, c55d66ff7) updated the NUMBER in
        # the manifest but left the MESH at 248×188×108 — G19 read the manifest number (PASS)
        # while pixels still protruded (FAIL). Council #2 fix: place_sealed_enclosure now
        # measures the post-placement bbox from placed_xyz_mm, resizes W,D,H,_SEALED_ENV_MM
        # to contain it, THEN builds the shell mesh from those final dims. G19 is the
        # last-resort backstop for cases where the reorder couldn't fire (headless/mock bpy
        # where placed_xyz_mm was never populated, or a new placer that escapes the fix).
        #
        # Direction 1 (FAIL): pre-fix state — shell=248×188×108, placed bbox=262×251×116
        # → parts exceed shell on W and D → G19 FIRES.
        _g19_shell_nm_re = re.compile(r"enclosure\s*shell|housing\s*shell|cabinet\s*shell", re.I)
        _g19_real_bbox = {"length_mm": 262.3, "width_mm": 251.2, "height_mm": 116.5}
        _g19_real_rows = [
            {"name": "Enclosure Shell", "dims_mm": {"w": 248.2, "d": 188.2, "h": 108.0}},
            {"name": "Magnetic Stirrer Drive", "dims_mm": {"w": 120.0, "d": 100.0, "h": 60.0}},
            {"name": "Heatsink Fan",           "dims_mm": {"w": 80.4,  "d": 77.9,  "h": 96.5}},
        ]
        _g19_before_ok, _g19_before_msg = enclosure_shell_contains_check(
            _g19_real_rows, _g19_real_bbox)
        chk("g19_real_2050_fails_before_fix", not _g19_before_ok)
        chk("g19_real_2050_detail_mentions_excess", "excess" in _g19_before_msg)
        # Direction 2 (PASS): after the REORDER fix, place_sealed_enclosure resizes
        # W,D,H to max(cur, placed_bbox_dim + 2×clearance=6mm) BEFORE building the mesh.
        # This produces the same math — verify the shell that would be built contains the bbox.
        _g19_clr = 6.0
        _g19_pm_w = float(_g19_real_bbox["length_mm"])
        _g19_pm_d = float(_g19_real_bbox["width_mm"])
        _g19_pm_h = float(_g19_real_bbox["height_mm"])
        _g19_cur_W, _g19_cur_D, _g19_cur_H = 248.2, 188.2, 108.0
        _g19_need_W = max(_g19_cur_W, _g19_pm_w + 2 * _g19_clr)
        _g19_need_D = max(_g19_cur_D, _g19_pm_d + 2 * _g19_clr)
        _g19_need_H = max(_g19_cur_H, _g19_pm_h + 2 * _g19_clr)
        # Verify the reorder computation produces a shell that contains the bbox
        chk("g19_reorder_shell_W_gte_bbox_plus_clr", _g19_need_W >= _g19_pm_w + 2 * _g19_clr - 0.1)
        chk("g19_reorder_shell_D_gte_bbox_plus_clr", _g19_need_D >= _g19_pm_d + 2 * _g19_clr - 0.1)
        chk("g19_reorder_shell_H_gte_bbox_plus_clr", _g19_need_H >= _g19_pm_h + 2 * _g19_clr - 0.1)
        # Simulate the reorder: apply the final W,D,H as the shell dims, verify G19 passes.
        # This proves: when place_sealed_enclosure correctly resizes before building the mesh,
        # G19 passes (shell ⊇ parts). The shell built with FINAL dims ≡ what the mesh produces.
        _g19_fixed_rows = list(_g19_real_rows)  # shallow copy, will replace shell row
        for _g19_i, _r in enumerate(_g19_fixed_rows):
            if _g19_shell_nm_re.search(str(_r.get("name") or "")):
                _g19_fixed_rows[_g19_i] = {
                    **_r,
                    "dims_mm": {
                        "w": round(float(_g19_need_W), 1),
                        "d": round(float(_g19_need_D), 1),
                        "h": round(float(_g19_need_H), 1),
                    },
                }
                break
        _g19_after_ok, _ = enclosure_shell_contains_check(_g19_fixed_rows, _g19_real_bbox)
        chk("g19_passes_after_reorder_fix", _g19_after_ok)
        # Sanity: the reordered shell must be strictly larger than the old pre-estimate
        _g19_new_shell = next(
            r for r in _g19_fixed_rows
            if _g19_shell_nm_re.search(str(r.get("name") or "")))
        chk("g19_reorder_shell_grew_from_248_to_gte_274",
            float(_g19_new_shell["dims_mm"]["w"]) >= 274.0 - 0.5)
        # Direction 3 (FAIL-STILL-CATCHES): verify G19 still catches even when the reorder
        # produced only a partial fix (e.g., measurement used wrong proxy dims → under-sized).
        # A shell that grew to 260×240×120 but parts span 262×251×116 still fails W and D.
        _g19_partial_rows = [
            {"name": "Enclosure Shell", "dims_mm": {"w": 260.0, "d": 240.0, "h": 120.0}},
            {"name": "Heatsink Fan",    "dims_mm": {"w": 80.4,  "d": 77.9,  "h": 96.5}},
        ]
        _g19_partial_ok, _g19_partial_msg = enclosure_shell_contains_check(
            _g19_partial_rows, _g19_real_bbox)
        chk("g19_still_catches_partial_fix", not _g19_partial_ok)
        chk("g19_partial_fix_detail_mentions_excess", "excess" in _g19_partial_msg)
        # (e) proveCatch for PROVENANCE-keyed above-lid handling (organoid r11,
        # rewritten 2026-07-26). The shell spans z 258.5–366.5 (h=108 @ z=312.5).
        # A thin base plate (200×140×3 mm) overhangs the 180-wide shell and must stay
        # excluded (structural, not contained equipment).
        #
        # DIRECTION 1 — an UNSTAMPED part parked on the roof MUST FIRE. This is the exact
        # adversarial input the old geometric rule silently dropped: it exempted anything
        # whose centre cleared the lid, so the worse the overshoot the surer the escape.
        _g19_roof_rows = [
            {"name": "Enclosure Shell", "dims_mm": {"w": 180.0, "d": 242.0, "h": 108.0},
             "pos_mm": [0.0, 0.0, 312.5]},
            {"name": "Chassis Base Plate", "dims_mm": {"w": 200.0, "d": 140.0, "h": 3.0},
             "pos_mm": [0.0, 0.0, 260.0]},
            {"name": "Magnetic Stirrer Drive", "dims_mm": {"w": 120.0, "d": 100.0, "h": 60.0},
             "pos_mm": [-7.8, 42.8, 300.0]},
            # 410–430 mm: 43.5 mm clear of the lid, no provenance stamp → a placer bug.
            {"name": "Peltier Tec Module", "dims_mm": {"w": 40.0, "d": 40.0, "h": 20.0},
             "pos_mm": [-47.8, 30.8, 420.0]},
        ]
        _g19_roof_ok, _g19_roof_msg = enclosure_shell_contains_check(
            _g19_roof_rows, None)
        chk("g19_unstamped_above_lid_part_fires", not _g19_roof_ok)
        chk("g19_unstamped_above_lid_mentions_excess", "excess" in _g19_roof_msg)
        # DIRECTION 2 — the SAME part, stamped as a deliberate exterior feature, is
        # exempt and the gate PASSES (a real on-top vessel / optical tower must not
        # be reported as a containment breach).
        # A genuine above-lid feature must carry the FULL proof set (SOL item 2): a
        # bom_component, from a registered signature mesh, in a PHYSICAL above-lid family,
        # with an explicit placement intent and the join proof.
        _g19_stamped_rows = [dict(r) for r in _g19_roof_rows]
        _g19_stamped_rows[-1].update({
            "entity_type": "bom_component",
            "geometry_source": "registered_signature_component_mesh",
            "signature_family": "vessel",
            "placement_intent": "exterior_above_lid",
            "placement_proof": "signature_mesh_family_join_v1",
        })
        _g19_stamped_ok, _g19_stamped_msg = enclosure_shell_contains_check(
            _g19_stamped_rows, None)
        chk("g19_stamped_above_lid_feature_exempt", _g19_stamped_ok)
        chk("g19_bbox_msg_mentions_containable",
            "containable bbox" in _g19_stamped_msg)
        # The thin base plate (200 mm wide, overhanging the 180 mm shell) must stay
        # excluded in the passing direction — else its overhang would fire length (x).
        chk("g19_thin_base_plate_still_excluded", "120×100" in _g19_stamped_msg)
        # PER-AXIS proof: the roof part violates HEIGHT specifically, not "largest dim".
        chk("g19_roof_violation_names_height_axis", "height (z)" in _g19_roof_msg)
        # SCOPE proveCatch (SOL item 2): an HMI feature has real provenance and is still
        # REFUSED — it lives inside the shell, so it must never buy a containment pass.
        # This is the hole the retired blanket string opened: 7 of 10 exempted rows on the
        # organoid were interior parts.
        _g19_hmi_rows = [dict(r) for r in _g19_roof_rows]
        _g19_hmi_rows[-1].update({
            "entity_type": "bom_component",
            "geometry_source": "registered_signature_component_mesh",
            "signature_family": "hmi_fascia",          # real, but NOT an above-lid family
            "placement_intent": "exterior_above_lid",  # even if it claims the intent
            "placement_proof": "signature_mesh_family_join_v1",
        })
        _g19_hmi_ok, _ = enclosure_shell_contains_check(_g19_hmi_rows, None)
        chk("g19_hmi_family_cannot_claim_exemption", not _g19_hmi_ok)
        # A geometry-only feature is refused even in an allowed family.
        _g19_geo_rows = [dict(r) for r in _g19_stamped_rows]
        _g19_geo_rows[-1]["entity_type"] = "geometry_feature"
        _g19_geo_ok, _ = enclosure_shell_contains_check(_g19_geo_rows, None)
        chk("g19_geometry_feature_cannot_claim_exemption", not _g19_geo_ok)
        # The retired blanket string is refused outright, not silently honoured.
        _g19_old_rows = [dict(r) for r in _g19_roof_rows]
        _g19_old_rows[-1]["geometry_source"] = "exterior_signature_mesh"
        _g19_old_ok, _g19_old_msg = enclosure_shell_contains_check(_g19_old_rows, None)
        chk("g19_retired_blanket_source_refused", not _g19_old_ok)
        chk("g19_retired_blanket_detail_says_retired", "RETIRED" in _g19_old_msg)
        # (f) proveCatch direction 2: interior parts that GENUINELY overflow
        # still cause FAIL even with the filter active.
        _g19_overflow_rows = [
            {"name": "Enclosure Shell", "dims_mm": {"w": 180.0, "d": 242.0, "h": 108.0},
             "pos_mm": [0.0, 0.0, 312.5]},
            {"name": "Magnetic Stirrer Drive", "dims_mm": {"w": 200.0, "d": 200.0, "h": 120.0},
             "pos_mm": [0.0, 0.0, 340.0]},
        ]
        _g19_overflow_ok, _g19_overflow_msg = enclosure_shell_contains_check(
            _g19_overflow_rows, None)
        chk("g19_interior_overflow_still_fires", not _g19_overflow_ok)
        chk("g19_interior_overflow_mentions_excess", "excess" in _g19_overflow_msg)
    finally:
        import shutil as _sh
        _sh.rmtree(_g15_td, ignore_errors=True)
        for _td in list(locals().get("_prod", None) and [_prod] or []):
            _sh.rmtree(_td, ignore_errors=True)
        try:
            _sh.rmtree(_tiny, ignore_errors=True)
        except NameError:
            pass
        try:
            _sh.rmtree(_g16, ignore_errors=True)
        except NameError:
            pass
        try:
            _sh.rmtree(_prod, ignore_errors=True)
        except NameError:
            pass
    # G11 proveCatch (2026-07-11, Grok's audit): run-75's REAL P&ID text ('PCS → Heat
    # Rejection', 'Step Up Transformer') must FIRE on a sealed no-transformer ≤250 V
    # contract; the same text on a PLANT contract (transformer sized, 400 V) must NOT;
    # a clean device drawing must NOT.
    chk("g11_mv_marker_fires", bool(_G11_MV_RE.search("Step Up Transformer → Enclosure Atmosphere")))
    chk("g11_thermal_marker_fires", bool(_G11_PLANT_THERMAL_RE.search("PCS Inverter → Heat Rejection")))
    chk("g11_clean_device_silent",
        not _G11_MV_RE.search("Battery String → DC Bus → PCS → Grid Interface (230 V, G98/G99)")
        and not _G11_PLANT_THERMAL_RE.search("Air Intake → Ventilation Fan → Air Exhaust"))
    chk("g11_plant_kv_legit", bool(_G11_MV_RE.search("11 kV ring-main")))  # marker exists; the
    # CONTRACT gate (has_transformer / >250 V) suppresses it on plants — decision, not regex
    chk("g11_negated_disclosure_silent",
        not _G11_MV_RE.search("no step-up transformer (direct LV tie)"))
    # G12 proveCatch: a product with only the legacy hero is NOT complete; all
    # form-factor-required Excel views must exist and pass image quality.
    _g12_state = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": {"value": 0.13},
        "design_envelope_width_mm": {"value": 609},
        "design_envelope_depth_mm": {"value": 193},
        "design_envelope_height_mm": {"value": 1105},
    }}}
    _g12_required = [view for view in required_views(_g12_state) if view.required]
    chk("g12_product_requires_five_views", len(_g12_required) == 5)
    # This asserts the gate's INTENT (a run carrying ONLY the legacy hero is incomplete)
    # by driving the decision with that adversarial input, rather than counting the
    # required list. The old form asserted `len(required - hero) == 4`, which silently
    # went FALSE when the required set became five non-hero product views — the hero is
    # not in the required list at all, so the subtraction stopped meaning anything and the
    # proveCatch failed while the gate itself was still correct. An assertion about a list
    # COMPOSITION decays whenever the list changes; an assertion about the DECISION does
    # not. Per the GATE INTENT RULE, prove the catch, do not count the inputs.
    _g12_present = {"00-hero.png"}
    _g12_missing = [v.filename for v in _g12_required if v.filename not in _g12_present]
    chk("g12_legacy_hero_only_fires", len(_g12_missing) == len(_g12_required) > 0)
    # G12 render_view_quality proveCatch (2026-07-22): organoid bioreactor height_occupancy
    # was 0.43 — below the 0.45 floor.  Verify evaluate_image correctly fires on 0.43
    # and passes on ≥0.45.  Build synthetic grayscale PNGs with controlled edge spans.
    import tempfile, struct, zlib as _zlib
    def _make_png(width, height, edge_rows_frac, edge_cols_frac):
        """Minimal valid PNG: white bg, black edge strip to control occupancy."""
        from io import BytesIO
        # Use Pillow directly — it's already imported by render_image_quality.
        from PIL import Image as _PI
        im = _PI.new("L", (width, height), 255)
        pix = im.load()
        # Draw a black rectangle that spans (edge_cols_frac × width) and
        # (edge_rows_frac × height) to produce predictable occupancy.
        ec = max(1, int(width * edge_cols_frac))
        er = max(1, int(height * edge_rows_frac))
        x0 = (width - ec) // 2
        y0 = (height - er) // 2
        for y in range(y0, y0 + er):
            for x in range(x0, x0 + ec):
                pix[x, y] = 0
        buf = BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    _tf = tempfile.mkdtemp(prefix="g12-img-")
    # Low occupancy: 43% height (non-landscape product) → must FAIL gate.
    _img_low = os.path.join(_tf, "low-hocc.png")
    with open(_img_low, "wb") as _f:
        _f.write(_make_png(200, 200, edge_rows_frac=0.43, edge_cols_frac=0.70))
    _res_low = evaluate_image(_img_low, enclosure_volume_m3=0.004)
    chk("g12_height_occ_0_43_fires",
        not _res_low.passed and any("height occupancy" in r for r in _res_low.reasons))
    # Adequate occupancy: 50% height (non-landscape) → must PASS gate.
    _img_ok = os.path.join(_tf, "ok-hocc.png")
    with open(_img_ok, "wb") as _f:
        _f.write(_make_png(200, 200, edge_rows_frac=0.50, edge_cols_frac=0.70))
    _res_ok = evaluate_image(_img_ok, enclosure_volume_m3=0.004)
    chk("g12_height_occ_0_50_passes",
        _res_ok.passed or not any("height occupancy" in r for r in _res_ok.reasons))
    # ASPECT-AWARE proveCatch (organoid bioreactor 2026-07-22):
    # (A) Well-framed LANDSCAPE product: high width_occ (96%), low height_occ (41%).
    #     With product_bbox_mm=(221, 96) the dominant occupancy = max(0.96, 0.41) = 0.96 → PASS.
    #     Without the fix, height_occ=0.41 < 0.45 → FAIL (the original bug).
    _img_wide_ok = os.path.join(_tf, "wide-well-framed.png")
    with open(_img_wide_ok, "wb") as _f:
        # 96% width, 41% height — mirrors the real organoid exterior view metrics
        _f.write(_make_png(400, 200, edge_rows_frac=0.41, edge_cols_frac=0.96))
    _res_wide_ok = evaluate_image(
        _img_wide_ok, enclosure_volume_m3=0.004, product_bbox_mm=(221.0, 96.4))
    chk("g12_landscape_well_framed_passes", _res_wide_ok.passed)
    # (B) Genuinely tiny LANDSCAPE product: both dims low (20%) → must still FAIL.
    _img_wide_tiny = os.path.join(_tf, "wide-tiny.png")
    with open(_img_wide_tiny, "wb") as _f:
        _f.write(_make_png(400, 200, edge_rows_frac=0.20, edge_cols_frac=0.20))
    _res_wide_tiny = evaluate_image(
        _img_wide_tiny, enclosure_volume_m3=0.004, product_bbox_mm=(221.0, 96.4))
    chk("g12_landscape_tiny_render_fails", not _res_wide_tiny.passed)
    import shutil as _sh2; _sh2.rmtree(_tf, ignore_errors=True)
    chk("g13_three_cad_families_still_fires", len({"fan", "pcb", "gland"}) < 4)
    chk("g13_four_cad_families_pass",
        len({"fan", "pcb", "gland", "cell"}) >= 4)
    # G7 sealed-product skip proveCatch: the gate must NOT be emitted for a sub-1 m³
    # sealed product (no site to utilise) and MUST keep firing on the v52 plant ratio.
    chk("g7_plant_ratio_still_fires", not (476 / 1466 >= SITE_UTILISATION_MIN))
    chk("g7_sealed_skip_signal", (lambda encl: bool(encl and 0 < encl < 1.0))(0.13))
    # no stray beam: a compact 8 m run passes; the v44 33 m MCC spine fails (proveCatch)
    def _span(wps):
        xs = [w[0] for w in wps]; ys = [w[1] for w in wps]
        return max(max(xs) - min(xs), max(ys) - min(ys))
    chk("beam_ok", _span([[0, 0, 6000], [8000, 0, 6000], [8000, 2000, 500]]) <= STRAY_BEAM_MAX_SPAN_MM)
    chk("beam_stray", not (_span([[440, 12940, 6270], [440, -16910, 6270], [-5980, -16910, 6270]])
                           <= STRAY_BEAM_MAX_SPAN_MM))   # the 33 m MCC beam is caught
    # Codema 1538 fluid overhead beam (oxygen dosing → drain sump, ~17 m plan span
    # at z≈7 m) MUST trip the same limit — G6 now covers drawn fluid, not cables only.
    _fluid_stray = [[10496, 1500, 7070], [-7100, 0, 7070], [-7100, 0, 500]]
    chk("beam_fluid_stray", not (_span(_fluid_stray) <= STRAY_BEAM_MAX_SPAN_MM))
    # Fully buried short drain (all z < 0) is NOT a visual beam — gate skips it.
    chk("beam_fully_buried_skip", max(w[2] for w in [[0, 0, -800], [5000, 0, -800]]) < 0)
    # Codema 1715: long lateral that SURFACES (z −0.8→+4.3 m) is a visual beam —
    # max(z) ≥ 0 so G6 must NOT skip; span > limit → fail. Universal z-signal.
    _surfaced = [[0, 0, -800], [25800, 0, -800], [25800, 0, 4300]]
    chk("beam_surfaced_long_fires",
        max(w[2] for w in _surfaced) >= 0
        and not (_span(_surfaced) <= STRAY_BEAM_MAX_SPAN_MM))
    # Codema 1759: MCC power trunk polyline 20.2 m (dest AABB alone was ≤16 m).
    _mcc_trunk = [[-10410, 5416, 7340], [9825, 4866, 7340]]
    chk("beam_mcc_trunk_fires", not (_span(_mcc_trunk) <= STRAY_BEAM_MAX_SPAN_MM))
    # G7 site utilisation proveCatch: the v52 stranded-corner deck (hull 476 / deck 1466
    # = 0.33, measured) FIRES; a compacted plant (hull 476 / deck 900 = 0.53) passes; the
    # severity mapping marks a sub-0.30 ratio HIGH (the deck is 3×+ the plant).
    chk("site_util_fires_on_v52", not (476 / 1466 >= SITE_UTILISATION_MIN))
    chk("site_util_pass_compacted", (476 / 900) >= SITE_UTILISATION_MIN)
    # severity: v52's 0.33 is a MED (fails, deck ~3× hull); a 0.20 (deck 5× hull) is a HIGH
    chk("site_util_severity_med", ("high" if 476 / 1466 < 0.30 else "med") == "med")
    chk("site_util_severity_high", ("high" if 300 / 1500 < 0.30 else "med") == "high")
    # ── G8 connection sanity proveCatch — v55's REAL shipped rows must FIRE every check;
    #    the corrected set must pass clean. (2026-07-02 scrambled-graph net.)
    _v55_q = {"irrigation_pump_flow_m3_h": {"value": 90},
              "connected_electrical_load_kw": {"value": 53},
              "total_supply_demand_kw": {"value": 132599650.69}}   # the shipped 132.6 GW
    _v55_ledger = [
        # v55 row: WATER routed INTO the electrical incomer (service-domain)
        {"from_part": "Fresh Water Tank", "to_part": "Mains Incomer", "service": "water",
         "required_value": 90, "required_unit": "m3/h"},
        # v55 Connection-trace self-loop
        {"from_part": "Cip Tank", "to_part": "Cip Tank", "service": "water"},
        # sane row — must not be flagged
        {"from_part": "Ro High Pressure Pump", "to_part": "Ro Membrane Elements",
         "service": "water", "required_value": 11, "required_unit": "m3/h"},
    ]
    _v55_sched = [
        # v55 sized run: '90 m³/s' on a 90 m³/h plant (the 6×DN300 @ 205.6 m/s phantom)
        {"from": "Fresh Water Tank", "to": "Permeate Outlet", "rating": "90 m³/s",
         "size": "6×DN300", "drop": "205.576 m/s"},
    ]
    _f = connection_sanity_findings(_v55_ledger, _v55_sched, _v55_q)
    chk("g8_fires_on_v55", len(_f) >= 4)   # domain + self-loop + flow + aggregate all fire
    chk("g8_domain_fires", any("electrical/control gear" in x and "Mains Incomer" in x for x in _f))
    chk("g8_selfloop_fires", any("self-loop" in x and "Cip Tank" in x for x in _f))
    chk("g8_flow_ceiling_fires", any("over plant ceiling" in x and "m³/s" in x for x in _f))
    chk("g8_aggregate_fires", any("phantom artefact" in x for x in _f))
    chk("g8_sane_edge_not_flagged", not any("Ro Membrane Elements" in x for x in _f))
    # the CORRECTED graph passes clean: pump feeds its membranes, sane units, reconciled load
    _fix_q = {"irrigation_pump_flow_m3_h": {"value": 90},
              "connected_electrical_load_kw": {"value": 53},
              "total_supply_demand_kw": {"value": 55.1}}
    _fix_ledger = [
        {"from_part": "Uf Module Bank", "to_part": "Ro High Pressure Pump",
         "service": "water", "required_value": 11, "required_unit": "m3/h"},
        {"from_part": "Ro High Pressure Pump", "to_part": "Ro Membrane Elements",
         "service": "water", "required_value": 11, "required_unit": "m3/h"},
        {"from_part": "Main Switchboard", "to_part": "Irrigation Pump", "service": "power"},
    ]
    _fix_sched = [{"from": "Fresh Water Tank", "to": "Irrigation Pump", "rating": "90 m³/h",
                   "size": "DN125"}]
    chk("g8_pass_on_corrected", connection_sanity_findings(_fix_ledger, _fix_sched, _fix_q) == [])
    # power feed into a HEATED tank is legitimate (powered-internals carve-out); into a pure
    # storage tank it fires
    chk("g8_power_to_pure_tank_fires", any("pure storage" in x for x in connection_sanity_findings(
        [{"from_part": "Main Switchboard", "to_part": "Fresh Water Tank", "service": "power"}], [], {})))
    chk("g8_power_to_heated_tank_ok", connection_sanity_findings(
        [{"from_part": "Main Switchboard", "to_part": "Heated Cip Tank", "service": "power"}], [], {}) == [])
    # NinjaPCR 2026-07-15: Flash/Firmware Storage is a powered memory IC, not a tank.
    chk("g8_power_to_flash_storage_ok", connection_sanity_findings(
        [{"from_part": "Wire Harness", "to_part": "Flash Storage", "service": "power"}], [], {}) == [])
    chk("g8_power_to_firmware_storage_ok", connection_sanity_findings(
        [{"from_part": "Wire Harness", "to_part": "Firmware Storage", "service": "power"}], [], {}) == [])
    # coolant to power-CONVERSION gear is legitimate (the BESS PCS carve-out)
    chk("g8_pcs_coolant_ok", connection_sanity_findings(
        [{"from_part": "Coolant Manifold", "to_part": "PCS Inverter Module", "service": "water"}], [], {}) == [])

    # ── G9 tag-legibility proveCatch — the v59 GA B–B defects, both directions. ──────
    # (a) the PILE-UP: v59 B–B stamped ~6 TK tags in one column a few px apart over the
    #     tank nest ('TK-110/TK-109/TK-105/TK-107/TK-106/TK-108') → the overlap check
    #     must FIRE on exactly that shape.
    _pile = ('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400">'
             + "".join(f'<text x="1600" y="{200 + i * 4}" font-family="Helvetica" '
                       f'font-size="9.5" text-anchor="middle" fill="#10243e" '
                       f'font-weight="bold">TK-1{k:02d}</text>'
                       for i, k in enumerate((10, 9, 5, 7, 6, 8)))
             + '</svg>')
    _f9a = tag_legibility_findings(_pile)
    chk("g9_fires_on_v59_pileup", any("pile-up" in x for x in _f9a))
    # (b) the CLIP: a legacy SVG (no data-viewbox markers — the shipped v59) with a tag
    #     whose bbox runs past the PAGE edge must FIRE the border check.
    _clip = ('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600">'
             '<text x="996" y="300" font-size="9.5" text-anchor="middle" '
             'font-weight="bold">TK-104</text></svg>')
    chk("g9_fires_on_clipped_edge",
        any("extends past" in x for x in tag_legibility_findings(_clip)))
    # (c) a tag past its own VIEW's data-viewbox border fires even when on-page
    _past = ('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600">'
             '<rect x="100" y="100" width="500" height="300" fill="none" stroke="none" '
             'data-viewbox="elevation-bb"/>'
             '<text x="596" y="200" font-size="9.5" text-anchor="middle" '
             'font-weight="bold">TK-106…TK-113</text></svg>')
    chk("g9_fires_past_view_border",
        any("elevation-bb" in x and "extends past" in x
            for x in tag_legibility_findings(_past)))
    # (d) the FIXED layout passes clean: a laddered stack (rows ≥ size+2.5 apart) +
    #     a range tag, all inside their view box
    _clean = ('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600">'
              '<rect x="100" y="100" width="500" height="300" fill="none" stroke="none" '
              'data-viewbox="elevation-bb"/>'
              '<text x="200" y="150" font-size="9.5" text-anchor="middle" '
              'font-weight="bold">TK-106…TK-113</text>'
              '<text x="200" y="164" font-size="9.5" text-anchor="middle" '
              'font-weight="bold">V-102</text>'
              '<text x="350" y="150" font-size="9.5" text-anchor="middle" '
              'font-weight="bold">Z-101</text></svg>')
    chk("g9_pass_on_deoverlapped", tag_legibility_findings(_clean) == [])
    # (e) non-tag lettering (view titles / dims / the drawing number) is NEVER scored —
    #     two overprinting titles + a rotated dim must yield zero findings
    _titles = ('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
               '<text x="10" y="20" font-size="13" font-weight="bold">ELEVATION B–B</text>'
               '<text x="12" y="22" font-size="13" font-weight="bold">ELEVATION A–A</text>'
               '<text x="790" y="300" font-size="10" transform="rotate(-90 790 300)">'
               'TK-101</text>'
               '<text x="700" y="590" font-size="9.5">FF-GA-001</text></svg>')
    chk("g9_ignores_titles_and_dims", tag_legibility_findings(_titles) == [])
    # (f) two tags merely CLOSE (rows a full ladder step apart) do not fire — the
    #     threshold is >20% of the smaller bbox, not any touch
    _close = ('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600">'
              '<text x="200" y="150" font-size="9.5" text-anchor="middle" '
              'font-weight="bold">TK-114</text>'
              '<text x="200" y="162" font-size="9.5" text-anchor="middle" '
              'font-weight="bold">TK-115</text></svg>')
    chk("g9_no_false_positive_on_ladder_rows", tag_legibility_findings(_close) == [])

    # scorecard aggregation
    gs = [Gate("legibility", ["single-line-diagram"], "high", False, "x"),
          Gate("qty_coverage", ["pid"], "high", True, "y")]
    card = scorecard(gs)
    chk("card_all_pass_false", card["all_pass"] is False)
    chk("card_sld_fails", card["drawings"]["single-line-diagram"]["pass"] is False)
    chk("card_pid_passes", card["drawings"]["pid"]["pass"] is True)
    chk("card_routes_stage", card["drawings"]["single-line-diagram"]["failing_gates"][0]["stage"].startswith("draw-script"))

    # D2 (2026-07-20): a co-listed OUT-OF-SCOPE drawing must read `skipped`, not a green
    # `pass`. On an instrument the pack is {general-arrangement, interconnect}; a passing
    # multi-drawing gate that co-lists single-line-diagram (OOS) must NOT mark it pass.
    _inst = {"isInstrumentDevice": True, "product_class": "colorimeter",
             "orchestratorContract": {"quantities": {}}}
    gs_pass = [Gate("part_coverage", ["single-line-diagram", "general-arrangement"],
                    "high", True, "all fed")]
    c_inst = scorecard(gs_pass, _inst)
    chk("d2_oos_sld_skipped", c_inst["drawings"]["single-line-diagram"]["status"] == "skipped")
    chk("d2_oos_sld_not_pass", c_inst["drawings"]["single-line-diagram"]["pass"] is False)
    chk("d2_inscope_ga_passes", c_inst["drawings"]["general-arrangement"]["status"] == "pass")
    chk("d2_skipped_counted", c_inst["n_drawings_skipped"] == 1)
    # a FAILING multi-drawing gate: the fail lands on the IN-SCOPE drawing; the OOS
    # co-listee is skipped (not a false FAIL); gate-level all_pass still goes False.
    gs_fail = [Gate("part_coverage", ["single-line-diagram", "general-arrangement"],
                    "high", False, "GA part unfed")]
    c_fail = scorecard(gs_fail, _inst)
    chk("d2_fail_on_inscope_ga", c_fail["drawings"]["general-arrangement"]["status"] == "fail")
    chk("d2_oos_sld_skipped_even_on_fail", c_fail["drawings"]["single-line-diagram"]["status"] == "skipped")
    chk("d2_all_pass_false_backstop", c_fail["all_pass"] is False)
    # no-state back-compat: OOS is unknown → assume in scope (the existing gs case above).
    chk("d2_no_state_backcompat_pid_pass", scorecard(gs)["drawings"]["pid"]["status"] == "pass")
    # PSEUDO-SURFACE GUARD: `renders` is scored regardless of the drawing pack — a FAILING
    # render on an instrument must stay `fail`, NOT be laundered into `skipped` just because
    # `renders` is not a form-factor drawing-pack key.
    gs_render = [Gate("interior_fill", ["renders", "general-arrangement"], "high", False,
                      "phenotype sprawl")]
    c_render = scorecard(gs_render, _inst)
    chk("d2_renders_pseudo_stays_fail", c_render["drawings"]["renders"]["status"] == "fail")

    # G20 ENVELOPE EQUALITY proveCatch (2026-07-22, corrected):
    # The canonical envelope is the manifest Enclosure Shell dims_mm (post-placement,
    # 274×252×126). G20 compares the value the DRAWING ACTUALLY EMITS (its own
    # _manifest_envelope_dims resolver output, parsed to mm) against that canonical shell
    # — NOT the superseded state pre-estimate (248×188×108), which the reorder is designed
    # to grow beyond. After the routing fix the caption reads the manifest shell, so on a
    # coherent bake they are identical.
    _g20_parts = [
        {"name": "Enclosure Shell", "dims_mm": {"w": 274.3, "d": 251.6, "h": 126.0}},
        {"name": "Heatsink Fan",    "dims_mm": {"w": 80.0,  "d": 80.0,  "h": 96.0}},
    ]
    # (a) PASS: the drawing caption reads the manifest shell (the delivered coherent case).
    #     _parse_caption_envelope_mm of the emitted 'W × D × H mm' string returns the shell.
    _g20_caption_coherent = _parse_caption_envelope_mm("274 × 252 × 126 mm")
    _g20_ok_match, _g20_msg_match = envelope_equality_cross_check(
        _g20_parts, _g20_caption_coherent)
    chk("g20_pass_when_caption_reads_shell", _g20_ok_match)
    chk("g20_pass_detail_says_match", "MATCH" in _g20_msg_match)
    # (b) FAIL: a regression makes the caption resolver fall back to the stale state
    #     pre-estimate — the emitted metre string '0.248 × 0.188 × 0.108 m' parses to
    #     248×188×108 mm, which diverges from the 274×252×126 manifest shell → FIRES.
    _g20_caption_stale = _parse_caption_envelope_mm("0.248 × 0.188 × 0.108 m")
    chk("g20_metre_string_parses_to_mm",
        _g20_caption_stale is not None and abs(_g20_caption_stale[0] - 248.0) < 1.0)
    _g20_ok_fail, _g20_msg_fail = envelope_equality_cross_check(
        _g20_parts, _g20_caption_stale)
    chk("g20_fail_when_caption_diverges_from_shell", not _g20_ok_fail)
    chk("g20_fail_detail_says_mismatch", "MISMATCH" in _g20_msg_fail)
    chk("g20_fail_detail_mentions_fix", "canonical" in _g20_msg_fail.lower())
    # (b2) EXTRACTION proveCatch (2026-07-26): the title block gained a second labelled
    #      value — "enclosure W × D × H mm (L×W×H) · OVERALL assembled height N mm" —
    #      when a feature stands proud of the lid. The SVG-side extraction regex keyed
    #      only on "product envelope|Overall plant envelope", so the new wording made G20
    #      silently ABSTAIN ("no parseable drawing-caption envelope"): a gate that stopped
    #      catching. Assert the caption the drawing ACTUALLY emits still yields the
    #      ENCLOSURE triple (not the OVERALL height) through the same regex the runner uses.
    _g20_cap_dual = (
        "enclosure 180 × 242 × 108 mm (L×W×H) · OVERALL assembled height 203 mm "
        "(incl. 1 feature(s) proud of the lid) · 10 equipment items."
    )
    _g20_dual_m = re.search(
        r"(?:product envelope|Overall plant envelope|enclosure)\s+"
        r"([\d][\d ×\.]+(?:mm|m))", _g20_cap_dual)
    chk("g20_dual_label_caption_extracts", _g20_dual_m is not None)
    _g20_dual_dims = (_parse_caption_envelope_mm(_g20_dual_m.group(1).strip())
                      if _g20_dual_m else None)
    chk("g20_dual_label_yields_enclosure_triple_not_overall",
        _g20_dual_dims is not None
        and abs(_g20_dual_dims[0] - 180.0) < 1.0
        and abs(_g20_dual_dims[2] - 108.0) < 1.0)
    # ── G23 proveCatch (SOL item 4, 2026-07-27) ─────────────────────────────────────
    # A gate that only ever passes is decoration. These drive the THREE real failure
    # modes from 2026-07-26 and assert the gate FIRES on each. The datum below is the
    # one draw_ga emits; the "correct" rect is what the contract computes from the row.
    _g23_datum = ('<g class="projection-view-datum" data-view="front" '
                  'data-origin-x="100.000" data-origin-y="200.000" data-ppm="2.000000" '
                  'data-x-min-mm="-50.000" data-z-max-mm="100.000" '
                  'data-z-shift-mm="0.000"/>')
    _g23_rows = [{"tag": "u_widget", "name": "Widget",
                  "pos_mm": [0.0, 0.0, 25.0], "dims_mm": {"w": 20.0, "d": 10.0, "h": 30.0}}]
    # front: x = 100 + (-10 - -50)*2 = 180 ; y = 200 + (100 - 40)*2 = 320 ; w = 40 ; h = 60
    def _g23_rect(x, y, w, h, tag="u_widget"):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="0" fill="none" '
                f'stroke="none" class="manifest-projection-audit" '
                f'data-entity-tag="{tag}" data-view="front"/>')
    _g23_ok_svg = "<svg>" + _g23_datum + _g23_rect("180.0", "320.0", "40.0", "60.0") + "</svg>"
    _g23_ok, _g23_msg = manifest_svg_projection_check(_g23_rows, _g23_ok_svg)
    chk("g23_faithful_projection_passes", _g23_ok)
    # (a) MOVED — the 2026-07-26 sheet drew boxes outside the envelope.
    _g23_moved = "<svg>" + _g23_datum + _g23_rect("260.0", "320.0", "40.0", "60.0") + "</svg>"
    _g23_mv_ok, _g23_mv_msg = manifest_svg_projection_check(_g23_rows, _g23_moved)
    chk("g23_moved_box_fires", not _g23_mv_ok)
    chk("g23_moved_detail_names_axis", "x " in _g23_mv_msg)
    # (b) RESIZED — the old _clamp_instrument_parts_to_envelope crushed every part to a
    #     FRACTION of the envelope, so drawn size != real size.
    _g23_resized = "<svg>" + _g23_datum + _g23_rect("180.0", "320.0", "12.0", "18.0") + "</svg>"
    _g23_rs_ok, _ = manifest_svg_projection_check(_g23_rows, _g23_resized)
    chk("g23_resized_box_fires", not _g23_rs_ok)
    # (c) INVENTED — a synthesized zone box with no manifest counterpart (the phantom
    #     OPTICAL rectangle drawn beside the real vessel).
    _g23_invented = ("<svg>" + _g23_datum + _g23_rect("180.0", "320.0", "40.0", "60.0")
                     + _g23_rect("400.0", "320.0", "40.0", "60.0", tag="u_phantom") + "</svg>")
    _g23_iv_ok, _g23_iv_msg = manifest_svg_projection_check(_g23_rows, _g23_invented)
    chk("g23_invented_box_fires", not _g23_iv_ok)
    chk("g23_invented_detail_says_no_manifest_row", "NO manifest row" in _g23_iv_msg)
    # ABSTAIN, never a silent pass, when the sheet carries no contract at all.
    _g23_ab_ok, _g23_ab_msg = manifest_svg_projection_check(_g23_rows, "<svg></svg>")
    chk("g23_no_contract_abstains", _g23_ab_ok and "abstain" in _g23_ab_msg)

    # ── G23 FITTED-MODE proveCatch (SOL round 5, plant coverage) ──────────────────
    # Plant/product sheets route through _fit_product_parts_to_envelope, which rebases,
    # scales and clamps each part, so the manifest row no longer predicts the drawing and
    # the rigid contract false-fired on all 77 powerwall pairs. Fitted rects therefore
    # publish their POST-FIT bounds and the gate projects THOSE with its own maths.
    # The manifest row below is deliberately NOWHERE NEAR the fitted bounds: if the gate
    # ever silently fell back to it, these cases would fail — which is exactly how the
    # attribute-order bug was caught (the regex stopped at data-view, so data-fit-*-mm sat
    # outside the match and every fitted rect was scored as faithful).
    def _g23_fit_rect(x, y, w, h, z0="10.000", z1="40.000", tag="u_widget"):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="0" fill="none" '
                f'stroke="none" class="manifest-projection-audit" '
                f'data-entity-tag="{tag}" data-view="front" data-mode="fitted" '
                f'data-fit-x0-mm="-10.000" data-fit-x1-mm="10.000" '
                f'data-fit-y0-mm="-5.000" data-fit-y1-mm="5.000" '
                f'data-fit-z0-mm="{z0}" data-fit-z1-mm="{z1}"/>')
    # front from the FITTED bounds: x = 100 + (-10 - -50)*2 = 180 ; y = 200 + (100-40)*2
    # = 320 ; w = 20*2 = 40 ; h = 30*2 = 60.
    _g23_far_rows = [{"tag": "u_widget", "name": "Widget",
                      "pos_mm": [900.0, 900.0, 900.0],
                      "dims_mm": {"w": 5.0, "d": 5.0, "h": 5.0}}]
    _g23_ft_ok, _g23_ft_msg = manifest_svg_projection_check(
        _g23_far_rows, "<svg>" + _g23_datum + _g23_fit_rect("180.0", "320.0", "40.0", "60.0") + "</svg>")
    chk("g23_fitted_projection_passes", _g23_ft_ok)
    chk("g23_fitted_states_coverage_limit", "NOT the envelope fit" in _g23_ft_msg)
    # MOVED in fitted mode must still fire — the mode changes the SOURCE of the expected
    # rectangle, never whether the gate is willing to fail.
    _g23_ftm_ok, _g23_ftm_msg = manifest_svg_projection_check(
        _g23_far_rows, "<svg>" + _g23_datum + _g23_fit_rect("260.0", "320.0", "40.0", "60.0") + "</svg>")
    chk("g23_fitted_moved_box_fires", not _g23_ftm_ok)
    # RESIZED in fitted mode must fire.
    _g23_ftr_ok, _ = manifest_svg_projection_check(
        _g23_far_rows, "<svg>" + _g23_datum + _g23_fit_rect("180.0", "320.0", "12.0", "18.0") + "</svg>")
    chk("g23_fitted_resized_box_fires", not _g23_ftr_ok)

    # (c) ABSTAIN: no Enclosure Shell part in manifest (plant-scale / non-enclosure).
    _g20_ok_abs, _g20_msg_abs = envelope_equality_cross_check(
        [], _g20_caption_coherent)
    chk("g20_abstains_without_shell_part", _g20_ok_abs)
    chk("g20_abstain_detail_says_abstain", "abstain" in _g20_msg_abs.lower())
    # (d) ABSTAIN: no parseable caption (drawing emitted nothing) — nothing to compare.
    _g20_ok_nocap, _g20_msg_nocap = envelope_equality_cross_check(_g20_parts, None)
    chk("g20_abstains_without_caption", _g20_ok_nocap)

    # ── G21 PART-SET COHERENCE proveCatch (2026-07-22, both directions) ───────────
    # Establishes that the pure check fires on REAL adversarial inputs, not just on
    # abstract logic. Uses a synthetic manifest + GA SVG pair.
    #
    # Manifest: 5 principal parts with known equipment_tags (EP-101, P-101, K-101,
    # X-102 Enclosure Shell, I-102 Temperature Sensor).
    _g21_parts_coherent = [
        {"equipment_tag": "EP-101", "name": "Magnetic Stirrer Drive"},
        {"equipment_tag": "P-101",  "name": "Dosing Peristaltic Pump"},
        {"equipment_tag": "K-101",  "name": "Heatsink Fan"},
        {"equipment_tag": "X-102",  "name": "Enclosure Shell"},
        {"equipment_tag": "I-102",  "name": "Temperature Sensor"},
    ]
    # (a) COHERENT: GA SVG carries all 5 manifest tags and no phantom tags → PASS.
    _g21_svg_coherent = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        '<text x="300" y="50" font-weight="bold">K-101</text>'
        '<text x="400" y="50" font-weight="bold">X-102</text>'
        '<text x="500" y="50" font-weight="bold">I-102</text>'
        '</svg>'
    )
    _g21_ok_coh, _g21_msg_coh = part_set_coherence_check(_g21_parts_coherent, _g21_svg_coherent)
    chk("g21_coherent_set_passes", _g21_ok_coh)
    chk("g21_coherent_detail_says_coherent", "COHERENT" in _g21_msg_coh)
    chk("g21_coherent_shows_tag_count", "5" in _g21_msg_coh)
    # (b) PHANTOM: GA carries X-999 (same X-prefix as X-102, but absent from manifest) → FIRES.
    # This is the adversarial input: a stale SVG backfilled with the new fingerprint still
    # shows X-999 from the OLD generation while the manifest settled on X-102.
    _g21_svg_phantom = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        '<text x="300" y="50" font-weight="bold">K-101</text>'
        '<text x="400" y="50" font-weight="bold">X-102</text>'
        '<text x="500" y="50" font-weight="bold">I-102</text>'
        '<text x="600" y="50" font-weight="bold">X-999</text>'  # phantom — not in manifest
        '</svg>'
    )
    _g21_ok_ph, _g21_msg_ph = part_set_coherence_check(_g21_parts_coherent, _g21_svg_phantom)
    chk("g21_phantom_tag_fires", not _g21_ok_ph)
    chk("g21_phantom_detail_says_phantom", "phantom" in _g21_msg_ph.lower())
    chk("g21_phantom_names_offender", "X-999" in _g21_msg_ph)
    # (c) DROPPED: GA is missing K-101 (Heatsink Fan — a principal part the placer omitted) → FIRES.
    # This is the adversarial input: the GA generator skipped a part class, or the manifest
    # was updated after the SVG was drawn.
    _g21_svg_dropped = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        # K-101 deliberately omitted — DROPPED
        '<text x="400" y="50" font-weight="bold">X-102</text>'
        '<text x="500" y="50" font-weight="bold">I-102</text>'
        '</svg>'
    )
    _g21_ok_dr, _g21_msg_dr = part_set_coherence_check(_g21_parts_coherent, _g21_svg_dropped)
    chk("g21_dropped_part_fires", not _g21_ok_dr)
    chk("g21_dropped_detail_says_dropped", "dropped" in _g21_msg_dr.lower() or "absent" in _g21_msg_dr.lower())
    chk("g21_dropped_names_offender", "K-101" in _g21_msg_dr)
    # (d) BOTH PHANTOM + DROPPED simultaneously → FIRES, reports both.
    _g21_svg_both = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        # K-101 dropped
        '<text x="400" y="50" font-weight="bold">X-102</text>'
        '<text x="500" y="50" font-weight="bold">I-102</text>'
        '<text x="600" y="50" font-weight="bold">I-999</text>'   # phantom (I-prefix known)
        '</svg>'
    )
    _g21_ok_both, _g21_msg_both = part_set_coherence_check(_g21_parts_coherent, _g21_svg_both)
    chk("g21_both_phantom_and_dropped_fires", not _g21_ok_both)
    chk("g21_both_mentions_phantom", "phantom" in _g21_msg_both.lower())
    chk("g21_both_mentions_dropped", "dropped" in _g21_msg_both.lower() or "absent" in _g21_msg_both.lower())
    # (e) ABSTAIN: fewer than 3 manifest principal tags → abstain (trivial stub bake).
    _g21_ok_few, _g21_msg_few = part_set_coherence_check(
        [{"equipment_tag": "X-101", "name": "A"}, {"equipment_tag": "X-102", "name": "B"}],
        _g21_svg_coherent)
    chk("g21_abstains_on_fewer_than_3_tags", _g21_ok_few)
    chk("g21_abstain_detail_says_abstain", "abstain" in _g21_msg_few.lower())
    # (f) ABSTAIN: empty GA SVG → abstain (drawings not yet generated).
    _g21_ok_nosvg, _ = part_set_coherence_check(_g21_parts_coherent, "")
    chk("g21_abstains_on_empty_svg", _g21_ok_nosvg)
    # (g) PREFIX GUARD: a tag that looks like IP-54 (noise / IP rating) must NOT fire.
    # IP is not a known manifest prefix, so it is filtered out.
    _g21_svg_ip = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        '<text x="300" y="50" font-weight="bold">K-101</text>'
        '<text x="400" y="50" font-weight="bold">X-102</text>'
        '<text x="500" y="50" font-weight="bold">I-102</text>'
        '<text x="600" y="50" font-weight="bold">IP-54</text>'   # IP-rating noise — prefix IP unknown
        '</svg>'
    )
    _g21_ok_ip, _ = part_set_coherence_check(_g21_parts_coherent, _g21_svg_ip)
    chk("g21_ip_rating_noise_filtered", _g21_ok_ip)
    # (g2) TOP-N SCHEDULE: the GA declares "top 3 of 5 items by footprint" and only
    # draws EP-101, P-101, K-101 in the schedule. X-102 and I-102 are legitimately
    # absent (not in the top-3 by footprint) — must NOT false-fire as "dropped".
    # PHANTOM rule still fires: a phantom not in manifest still fires.
    _g21_svg_topn = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        # Title block: top-N declaration
        '<text x="100" y="500">PRINCIPAL EQUIPMENT  (top 3 of 5 items by footprint)</text>'
        # Schedule: 3 drawn + scheduled tags
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        '<text x="300" y="50" font-weight="bold">K-101</text>'
        # X-102 and I-102 absent (legitimately — not in top-3)
        '<text x="100" y="520">Equipment schedule: see the Part names tab for the full 5-item list.</text>'
        '</svg>'
    )
    _g21_ok_topn, _g21_msg_topn = part_set_coherence_check(_g21_parts_coherent, _g21_svg_topn)
    chk("g21_topn_schedule_does_not_false_fire", _g21_ok_topn)
    # But a phantom in the same top-N SVG still fires
    _g21_svg_topn_phantom = _g21_svg_topn.replace(
        '</svg>',
        '<text x="600" y="50" font-weight="bold">X-999</text></svg>')
    _g21_ok_topn_ph, _g21_msg_topn_ph = part_set_coherence_check(_g21_parts_coherent, _g21_svg_topn_phantom)
    chk("g21_topn_phantom_still_fires", not _g21_ok_topn_ph)
    chk("g21_topn_phantom_names_offender", "X-999" in _g21_msg_topn_ph)
    # A truly dropped tag (not in schedule, not drawn, but manifest declares top-N > schedule) — fires.
    _g21_parts_7 = _g21_parts_coherent + [
        {"equipment_tag": "X-201", "name": "Extra Part A"},
        {"equipment_tag": "X-202", "name": "Extra Part B"},
    ]
    # Same SVG: 3 scheduled, 4 unscheduled (X-102, I-102, X-201, X-202). The note says "top 3 of 7".
    _g21_svg_topn_7 = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="500">PRINCIPAL EQUIPMENT  (top 3 of 7 items by footprint)</text>'
        '<text x="100" y="50" font-weight="bold">EP-101</text>'
        '<text x="200" y="50" font-weight="bold">P-101</text>'
        '<text x="300" y="50" font-weight="bold">K-101</text>'
        # X-102, I-102, X-201, X-202 legitimately absent
        '</svg>'
    )
    _g21_ok_7, _g21_msg_7 = part_set_coherence_check(_g21_parts_7, _g21_svg_topn_7)
    chk("g21_topn_all_absent_legitimately_passes", _g21_ok_7)
    # (h) VERIFY COHERENCE on the DELIVERED coherence-verify-2240 bake:
    # No GA SVG exists in that output (drawings/general-arrangement.svg absent).
    # G21 must ABSTAIN (not false-fire on a missing SVG) — confirming the delivered
    # bake is coherent by construction (draw_ga not yet run, not a divergence).
    import os as _os21
    _g21_cv_dir = _os21.path.join(
        _os21.path.dirname(_os21.path.dirname(_os21.path.abspath(__file__))),
        "out", "coherence-verify-2240")
    _g21_cv_man = _os21.path.join(_g21_cv_dir, "parts-manifest.json")
    if _os21.path.exists(_g21_cv_man):
        try:
            _g21_cv_parts = json.load(open(_g21_cv_man)).get("parts") or []
            _g21_cv_ga_path = _os21.path.join(_g21_cv_dir, "drawings", "general-arrangement.svg")
            _g21_cv_ga_text = ""
            if _os21.path.exists(_g21_cv_ga_path):
                try:
                    _g21_cv_ga_text = open(_g21_cv_ga_path, encoding="utf-8", errors="replace").read()
                except OSError:
                    _g21_cv_ga_text = ""
            _g21_cv_ok, _g21_cv_detail = part_set_coherence_check(_g21_cv_parts, _g21_cv_ga_text)
            chk("g21_coherence_verify_2240_passes_or_abstains", _g21_cv_ok)
        except Exception:  # noqa: BLE001
            pass  # manifest unreadable — skip the live-bake check

    # ── G22 RENDER↔DRAWING EXTERIOR-SIGNATURE FEATURE COHERENCE proveCatch ──────────
    # Both directions + the three universal invariants the revised spec requires, keyed
    # on the render's OWN exterior_signature_features provenance (shared by both lanes),
    # NEVER a vial_bioreactor prefix hack. Synthetic form-meshes dicts — no live Blender.
    #
    # Render-side family derivation reads the exterior-visible subset (the drop-in for the
    # build-side _exterior_signature_features dump). u_se_le_od* → optical-tower,
    # u_se_le_vial_collar → sample-port, u_se_le_face* → hmi-fascia; the deliberately-
    # hidden bare u_se_le_vial / u_se_le_vial_fluid are NOT in the exterior list.
    _fm_organoid = {"le_signature": "vial_bioreactor", "exterior_signature_features": [
        {"family": "optical-tower", "mesh": "u_se_le_od_src"},
        {"family": "optical-tower", "mesh": "u_se_le_od_det"},
        {"family": "sample-port", "mesh": "u_se_le_vial_collar"},
        {"family": "hmi-fascia", "mesh": "u_se_le_face_display"},
    ]}
    # render-side set derivation excludes the bare vial even if present in a raw mesh list
    chk("g22_render_families_from_provenance",
        _render_exterior_feature_families(_fm_organoid)
        == {"optical-tower", "sample-port", "hmi-fascia"})

    # GA SVG fragments — the drawing's OWN provenance. A GA that silhouetted an optical
    # tower stamps the OPTICAL zone label (draw_ga.py:1616/1661); a flat-form GA does not.
    _ga_svg_with_optical = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50">OPTICAL</text><text x="200" y="50">UI DECK</text></svg>')
    _ga_svg_flat = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
        '<text x="100" y="50">FRONT</text></svg>')

    # (a) ORGANOID COHERENT: render HAS the optical family AND the instrument-form GA
    # stamped the OPTICAL tower zone (not thermocycler) → both sets == {optical,sample,
    # hmi} → PASS.
    _g22_ok_a, _g22_msg_a = render_drawing_feature_coherence_check(
        _fm_organoid, _ga_svg_with_optical,
        is_instrument_device=True, is_thermocycler_form=False)
    chk("g22_organoid_coherent_passes", _g22_ok_a)
    chk("g22_organoid_coherent_detail", "COHERENT" in _g22_msg_a)

    # (a′) THE INCIDENT — DRAWN-BUT-NOT-RENDERED: the render LOST the tower (the clamp
    # buried u_se_le_od*, so exterior_signature_features carries NO optical-tower) while
    # the GA STILL stamps the OPTICAL tower zone → drawing set has optical-tower, render
    # does not → FIRES, names the family, routes to the _ABOVE_LID_SIGNATURE_MESHES fix.
    _fm_organoid_lost_tower = {"le_signature": "vial_bioreactor",
                               "exterior_signature_features": [
                                   {"family": "sample-port", "mesh": "u_se_le_vial_collar"},
                                   {"family": "hmi-fascia", "mesh": "u_se_le_face_display"},
                               ]}
    _g22_ok_incident, _g22_msg_incident = render_drawing_feature_coherence_check(
        _fm_organoid_lost_tower, _ga_svg_with_optical,
        is_instrument_device=True, is_thermocycler_form=False)
    chk("g22_lost_tower_incident_fires", not _g22_ok_incident)
    chk("g22_incident_says_drawn_not_rendered", "drawn-but-not-rendered" in _g22_msg_incident)
    chk("g22_incident_names_optical_tower", "optical-tower" in _g22_msg_incident)
    chk("g22_incident_routes_to_above_lid_fix",
        "_ABOVE_LID_SIGNATURE_MESHES" in _g22_msg_incident)

    # (a″) RENDERED-BUT-NOT-DRAWN (the other direction): the render carries the optical
    # tower but the GA drew a FLAT form (no OPTICAL zone stamped) → render set has
    # optical-tower, drawing set has none → FIRES, routes to the draw_ga form-rule fix.
    _g22_ok_rnd, _g22_msg_rnd = render_drawing_feature_coherence_check(
        _fm_organoid, _ga_svg_flat,
        is_instrument_device=True, is_thermocycler_form=False)
    chk("g22_rendered_not_drawn_fires", not _g22_ok_rnd)
    chk("g22_rnd_says_rendered_not_drawn", "rendered-but-not-drawn" in _g22_msg_rnd)
    chk("g22_rnd_names_optical_tower", "optical-tower" in _g22_msg_rnd)
    chk("g22_rnd_routes_to_draw_ga_fix", "draw_ga" in _g22_msg_rnd)

    # (b) THERMOCYCLER FIXTURE — the false-fire the ORIGINAL spec produced. The render
    # emits u_se_product_tc_*/u_se_tc_* (NO le_od exterior family) so
    # exterior_signature_features is EMPTY, and even though the thermocycler silhouette
    # ALSO stamps an "OPTICAL" zone label, is_thermocycler_form suppresses the drawing's
    # optical-tower → BOTH sets empty → ABSTAIN, never fires.
    _fm_thermo = {"form": "lab_electronics", "form_id": "thermocycler",
                  "le_signature": None, "exterior_signature_features": []}
    _g22_ok_b, _g22_msg_b = render_drawing_feature_coherence_check(
        _fm_thermo, _ga_svg_with_optical,   # thermocycler SVG carries OPTICAL zone label
        is_instrument_device=True, is_thermocycler_form=True)
    chk("g22_thermocycler_both_empty_abstains", _g22_ok_b)
    chk("g22_thermocycler_says_abstain", "abstain" in _g22_msg_b.lower())
    # (b′) the thermocycler drawing lane suppresses optical-tower even with an OPTICAL zone
    # label present — so a thermocycler never trips drawn-not-rendered on optical.
    chk("g22_thermocycler_drawing_lane_suppresses_optical",
        "optical-tower" not in _drawing_exterior_feature_families(
            set(), is_instrument_device=True, is_thermocycler_form=True,
            ga_drew_optical_tower=_ga_drew_optical_tower(_ga_svg_with_optical, True)))

    # (c) SYRINGE-PUMP FIXTURE — the render emits u_se_sp_* only (no exterior signature
    # family), so exterior_signature_features is empty/absent; is_instrument True but the
    # GA draws no above-lid OPTICAL zone → BOTH empty → ABSTAIN.
    _fm_syringe = {"form": "syringe_pump", "channels": 4}   # NO exterior_signature_features
    chk("g22_syringe_render_set_empty",
        _render_exterior_feature_families(_fm_syringe) == set())
    _g22_ok_c, _g22_msg_c = render_drawing_feature_coherence_check(
        _fm_syringe, _ga_svg_flat,
        is_instrument_device=True, is_thermocycler_form=False)
    chk("g22_syringe_pump_both_empty_abstains", _g22_ok_c)
    chk("g22_syringe_says_abstain", "abstain" in _g22_msg_c.lower())

    # (d) PLANT / MISSING form-meshes → render side unknown → abstain (never fire on
    # absence); not-instrument → drawing side empty too.
    _g22_ok_plant, _g22_msg_plant = render_drawing_feature_coherence_check(
        None, "", is_instrument_device=False, is_thermocycler_form=False)
    chk("g22_plant_missing_formmeshes_abstains", _g22_ok_plant)
    chk("g22_plant_says_abstain", "abstain" in _g22_msg_plant.lower())

    # (e) NON-OVERLAP proof: G22 keys on exterior signature FAMILIES (skin mesh vs
    # silhouette), touching NEITHER a manifest bbox (G19) NOR a caption envelope (G20)
    # NOR a manifest-principal tag (G21). The organoid coherent case passes G22 on the
    # SAME artefacts where G21 abstains (no GA tag set fed) — orthogonal subjects.
    chk("g22_non_overlap_optical_family_not_a_manifest_tag",
        _render_exterior_feature_families(_fm_organoid)  # families, not EP-101/P-101 tags
        != {"EP-101", "P-101", "K-101"})

    if fails:
        print("[drawing-gates] SELFTEST FAIL: " + ", ".join(fails))
        return 1
    print("[drawing-gates] selftest OK (deterministic-gate invariants incl. G3 housed-power carve-out proveCatch on the v54/v56d 'Vfd Drive' + G8 connection-sanity proveCatch on v55 + G9 tag-legibility proveCatch on the v59 GA elevation pile-up/clip + G20 envelope-equality proveCatch both directions + G21 part-set coherence proveCatch both directions on synthetic data + G21 top-N schedule non-false-fire proveCatch + verified coherent/abstain on out/coherence-verify-2240 + G22 render↔drawing exterior-signature feature coherence proveCatch both directions: organoid tower coherent PASS / lost-tower incident FIRES / rendered-not-drawn FIRES / thermocycler + syringe-pump ABSTAIN)")
    return 0


# ── G23 MANIFEST → SVG PROJECTION (SOL audit item 4, 2026-07-27) ────────────────────
# THE GAP EVERY OTHER DRAWING GATE HAD: they score the parts-manifest, never the sheet
# produced from it. So a drawing could misrepresent its own parts list and still pass —
# on 2026-07-26 an Assembly sheet showed boxes outside the enclosure while every gate was
# green and the tab read "TAB QUALITY 9/10". A human caught it; no gate could.
#
# This one reads what was DRAWN. The GA writer emits an invisible audit rect from the
# SAME bounds it drew with, plus a per-view datum; this gate independently recomputes the
# expected rect from the MANIFEST row and compares. Three failure modes, all real:
#   * MOVED/RESIZED — drawn rect disagrees with the manifest projection
#   * MISSING       — a manifest part that should appear in the view was never drawn
#   * INVENTED      — an audit rect with no manifest counterpart
def manifest_svg_projection_check(parts: list, ga_svg_text: str) -> tuple:
    """PURE G23 — every drawn entity must equal its manifest projection.

    Abstains when the sheet carries no projection contract (a drawing generated before
    the writer emitted one, or a non-instrument sheet) — an abstain here means "not
    measurable", never "fine".
    """
    if not ga_svg_text or "projection-view-datum" not in ga_svg_text:
        return (True, "no projection contract on this sheet — abstain")
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from ga_projection_contract import expected_rect_px, compare_rect
    except Exception as exc:  # noqa: BLE001
        return (True, f"projection contract unavailable ({exc}) — abstain")

    _dat = {}
    for m in re.finditer(r'<g class="projection-view-datum"([^>]*)/?>', ga_svg_text):
        a = m.group(1)
        v = re.search(r'data-view="([^"]+)"', a)
        if not v:
            continue
        def _f(key, _a=a):
            mm = re.search(rf'data-{key}="([-\d.]+)"', _a)
            return float(mm.group(1)) if mm else 0.0
        _dat[v.group(1)] = {"origin_x": _f("origin-x"), "origin_y": _f("origin-y"),
                            "ppm": _f("ppm"), "x_min_mm": _f("x-min-mm"),
                            "y_min_mm": _f("y-min-mm"), "y_max_mm": _f("y-max-mm"),
                            "z_max_mm": _f("z-max-mm"), "z_shift_mm": _f("z-shift-mm")}
    if not _dat:
        return (True, "projection datum unparseable — abstain")

    _drawn = {}
    for m in re.finditer(
            r'<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"'
            r'[^>]*class="manifest-projection-audit"[^>]*?'
            # `[^>]*>` matters: data-mode and the data-fit-*-mm bounds are emitted AFTER
            # data-view, so a match that stopped at data-view left them outside group(0).
            # Every fitted rect then read as faithful, fell back to the manifest row the
            # fit had deliberately superseded, and the gate false-fired on all 77 pairs.
            r'data-entity-tag="([^"]*)"[^>]*?data-view="([^"]+)"[^>]*>', ga_svg_text):
        _whole = m.group(0)
        _mode_m = re.search(r'data-mode="([a-z]+)"', _whole)
        _mode = _mode_m.group(1) if _mode_m else "faithful"
        # FITTED sheets publish the part's POST-FIT bounds on the rect, because the
        # product/plant fit rebases, scales and clamps per part and the manifest row no
        # longer predicts the drawing. The gate still recomputes the rectangle with its
        # OWN projection maths — it never copies px/py/pw/ph — so this measures the
        # projection step rather than restating it (SOL round 5's tautology warning).
        _fit_bb = None
        if _mode == "fitted":
            _v = {}
            for _k in ("x0", "x1", "y0", "y1", "z0", "z1"):
                _mm2 = re.search(rf'data-fit-{_k}-mm="([-\d.]+)"', _whole)
                if _mm2 is None:
                    break
                _v[_k] = float(_mm2.group(1))
            if len(_v) == 6:
                _fit_bb = (_v["x0"], _v["x1"], _v["y0"], _v["y1"], _v["z0"], _v["z1"])
        _drawn.setdefault((m.group(6), m.group(5)), []).append(
            (float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)),
             _mode, _fit_bb))
    if not _drawn:
        return (True, "no audit rects emitted — abstain")

    _rows = {str(p.get("tag") or ""): p for p in (parts or []) if isinstance(p, dict)}
    bad, missing, invented = [], [], []
    _fitted_pairs = 0
    for (view, tag), rects in sorted(_drawn.items()):
        row = _rows.get(tag)
        if row is None:
            invented.append(f"{tag or '(untagged)'}@{view}")
            continue
        _ok = False
        _why = None
        for r in rects:
            exp = expected_rect_px(row, view, _dat.get(view) or {}, bbox_mm=r[5])
            if exp is None:
                _ok = True          # nothing to compare against — do not manufacture a fail
                break
            _w = compare_rect(r[:4], exp)
            if _w is None:
                _ok = True
                break
            if _why is None:
                _why = _w
        if not _ok and _why is not None:
            bad.append(f"{tag}@{view}: {_why}")
        if rects and rects[0][4] == "fitted":
            _fitted_pairs += 1
    _drawn_tags = {t for _v, t in _drawn}
    for tag, row in sorted(_rows.items()):
        if tag and tag not in _drawn_tags and (row.get("dims_mm") or {}):
            missing.append(tag)

    n = len(_drawn)
    if bad or invented:
        detail = []
        if bad:
            detail.append(f"{len(bad)} drawn box(es) disagree with the manifest: "
                          + "; ".join(bad[:3]))
        if invented:
            detail.append(f"{len(invented)} drawn box(es) have NO manifest row: "
                          + ", ".join(invented[:5]))
        return (False, " | ".join(detail)
                + f" (checked {n} entity/view pair(s) — the sheet must project the parts "
                  "list, not re-invent it)")
    _miss_note = (f"; {len(missing)} manifest row(s) not drawn in any view "
                  f"(e.g. {', '.join(missing[:3])})" if missing else "")
    # State the coverage limit rather than letting a green tick imply more than it
    # measures: on a fitted sheet this proves the PROJECTION of the post-fit bounds, not
    # the fit that produced them.
    _mode_note = (f"; {_fitted_pairs} of these are FITTED pairs — that checks the "
                  f"projection of each part's post-fit bounds, NOT the envelope fit "
                  f"itself" if _fitted_pairs else "")
    return (True, f"all {n} drawn entity/view pair(s) equal their manifest projection"
                  f"{_mode_note}{_miss_note}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
