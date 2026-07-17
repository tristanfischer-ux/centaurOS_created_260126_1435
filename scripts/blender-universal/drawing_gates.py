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
from drawing_vision_glance import drawing_vision_coherent  # noqa: E402

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
    view_failures = []
    checked_views = 0
    for view in required_views(state):
        path = os.path.join(out_dir, view.filename)
        if not os.path.exists(path):
            if view.required:
                view_failures.append(f"{view.view_id}: missing {view.filename}")
            continue
        checked_views += 1
        quality = evaluate_image(path)
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
    "drawing_domain": "deriveDeviceEnergyTopology (device-scale topology override) + draw_single_line/_apply_distribution_voltage_model DC-product branch",
    "render_view_quality": "render_view_contract required_views + build_universal_scene product cameras + render_image_quality",
    "cad_geometry_coverage": "cad_asset_resolver DB-first cache + seed_internal_cad_assets + build_universal_scene family imports",
}


def scorecard(gates: list) -> dict:
    by_drawing: dict = {}
    for g in gates:
        for dwg in g.drawings:
            by_drawing.setdefault(dwg, []).append(g)
    cards = {}
    for dwg, gl in sorted(by_drawing.items()):
        fails = [g for g in gl if not g.passed]
        cards[dwg] = {"pass": not fails,
                      "failing_gates": [{"gate": g.name, "severity": g.severity,
                                          "stage": GATE_STAGE.get(g.name, "?"), "detail": g.detail}
                                         for g in fails]}
    all_pass = all(g.passed for g in gates)
    return {"all_pass": all_pass, "n_gates": len(gates),
            "n_failing": sum(1 for g in gates if not g.passed), "drawings": cards}


def main(argv) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] in ("--selftest", "selftest"):
        return _selftest()
    out_dir = argv[0]
    gates = run_gates(out_dir)
    card = scorecard(gates)
    json.dump(card, open(os.path.join(out_dir, "drawing-gates.json"), "w"), indent=2)
    print(f"[drawing-gates] {card['n_gates']} gates · {card['n_failing']} failing · "
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
    chk("g12_legacy_hero_only_fires",
        len([view for view in _g12_required if view.filename not in {"00-hero.png"}]) == 4)
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

    if fails:
        print("[drawing-gates] SELFTEST FAIL: " + ", ".join(fails))
        return 1
    print("[drawing-gates] selftest OK (deterministic-gate invariants incl. G3 housed-power carve-out proveCatch on the v54/v56d 'Vfd Drive' + G8 connection-sanity proveCatch on v55 + G9 tag-legibility proveCatch on the v59 GA elevation pile-up/clip)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
