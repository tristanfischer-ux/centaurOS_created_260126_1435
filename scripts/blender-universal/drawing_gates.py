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

    # ── G1 LEGIBILITY — each 2D drawing within a sane aspect ratio ───────────────
    dd = os.path.join(out_dir, "drawings")
    for nm in ("single-line-diagram", "pid", "panel-schedule", "general-arrangement",
               "block-flow-diagram", "hvac-layout", "process-schedules"):
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
    if os.path.exists(md_path):
        m = re.search(r"Total connected load\D*([\d,]+(?:\.\d+)?)\s*kW", open(md_path).read())
        if m:
            panel_total = float(m.group(1).replace(",", ""))
    if cload and panel_total:
        ratio = panel_total / cload
        gates.append(Gate("load_reconcile", ["panel-schedule", "single-line-diagram"],
                          "high", 0.85 <= ratio <= 1.15,
                          f"panel total {panel_total:.0f} kW vs contract {cload:.0f} kW (ratio {ratio:.2f}, ±15%)"))

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
    if fluid_route:
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
    if _encl_m3 and 0 < float(_encl_m3) < 1.0 and parts:
        fill = interior_fill_fraction(parts, float(_encl_m3))
        if fill is not None:
            gates.append(Gate("interior_fill", ["renders", "general-arrangement"],
                              "high", fill >= INTERIOR_FILL_MIN,
                              f"interior fill {fill * 100:.0f}% of the {float(_encl_m3):.2f} m³ "
                              f"enclosure (floor {INTERIOR_FILL_MIN * 100:.0f}% — below it the "
                              f"render is a hollow shell, not a product)"))

    return gates


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


# G10 floor: a sealed product interior below this fill fraction renders as an empty
# shell. Run 73's shipped manifest measured 0.27 (toy boxes + the 88-cell pack
# collapsed to one 99 mm box — visually hollow); the pack-array + zone-fill sizing
# lands ~0.45-0.65. A future legitimately-sparse sealed archetype (e.g. a dock that
# HOUSES a vehicle) needs its own regime signal, not a lowered floor.
INTERIOR_FILL_MIN = 0.35


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
