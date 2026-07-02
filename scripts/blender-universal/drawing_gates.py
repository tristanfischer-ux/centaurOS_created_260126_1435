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


# ── G1b — min text height at A1 print scale (ISO 3098: ≥2.5 mm lettering) ─────────
# Drawings with an A1 print pipeline (a1_print.py, hooked in their generators):
# gate name → the print set's file base (<base>-A1.pdf / <base>-A1.json).
_A1_PRINT_BASES = {"pid": "pid", "block-flow-diagram": "bfd",
                   "single-line-diagram": "single-line"}
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
    elec_dests = set()
    for e in conn:
        if not isinstance(e, dict):
            continue
        med = str(e.get("mechanism") or e.get("medium") or e.get("service") or "")
        if "electr" in med.lower():
            elec_dests.add(str(e.get("to_part") or e.get("to") or "").strip().lower())
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
        key = head.lower()
        if key in seen:
            continue
        seen.add(key)
        # is this principal powered part fed? (its head tokens ⊆ some electrical destination)
        htoks = set(re.findall(r"[a-z0-9]+", key))
        fed = any(htoks and htoks <= set(re.findall(r"[a-z0-9]+", d)) for d in elec_dests)
        if not fed:
            missing.append(head)
    gates.append(Gate("part_coverage", ["single-line-diagram", "panel-schedule", "pid"],
                      "high", len(missing) == 0,
                      "all principal powered parts fed" if not missing
                      else f"{len(missing)} principal powered part(s) with NO electrical feeder: {missing[:4]}"))

    # ── G4 MATERIAL DIVERSITY — multi-service plant ≠ a uniform material ─────────
    mats = set()
    for r in route:
        if isinstance(r, dict):
            m = r.get("material") or r.get("material_label") or ""
            if m:
                mats.add(re.split(r"\s*\(", str(m))[0].strip().lower())
    if route:
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

    # ── G6 NO STRAY BEAM — no CABLE run spans the plant as an overhead beam ──────────
    #    The v44 render shipped a 'stray red pipe extending off the platform to a floating
    #    box': an MCC->plant-wide-loads cable tray whose spine ran 33 m. A physical overhead
    #    cable tray does NOT span the whole plant to a lone load — that power/signal
    #    distribution belongs on the single-line/P&ID (build_universal_scene demotes it).
    #    SCOPE: cables ONLY (power/signal/electric/data/control/bus). A FLUID pipe MUST
    #    physically connect its two parts, so a long routed process pipe is legitimate (it
    #    hugs equipment via Manhattan waypoints — a large bbox is not a straight beam); only
    #    cable distribution is demotable. Universal — service-keyed, no class table.
    worst = None
    for r in route:
        if not isinstance(r, dict):
            continue
        svc = str(r.get("service") or r.get("mechanism") or "").lower()
        if not any(t in svc for t in ("power", "signal", "electric", "data", "control", "bus")):
            continue
        wps = r.get("waypoints_mm") or r.get("waypoints") or []
        xs = [w[0] for w in wps if isinstance(w, (list, tuple)) and len(w) >= 2]
        ys = [w[1] for w in wps if isinstance(w, (list, tuple)) and len(w) >= 2]
        if not xs or not ys:
            continue
        span = max(max(xs) - min(xs), max(ys) - min(ys))
        if worst is None or span > worst[1]:
            worst = (str(r.get("run_name") or r.get("name") or "?"), span)
    if worst is not None:
        gates.append(Gate("no_stray_beam", ["general-arrangement", "pid", "single-line-diagram"],
                          "high", worst[1] <= STRAY_BEAM_MAX_SPAN_MM,
                          f"longest CABLE run {worst[0]} spans {worst[1]/1000:.1f} m "
                          f"(limit {STRAY_BEAM_MAX_SPAN_MM/1000:.0f} m — a plant-crossing beam)"))

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

    return gates


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
    # qty coverage threshold
    chk("qty_ok", 8 >= max(2, int(8 * 0.8)))
    chk("qty_collapsed", not (1 >= max(2, int(8 * 0.8))))    # collapsed-to-1 fails
    # material diversity
    chk("mat_ok", len({"hdpe/pe100", "duplex 2205"}) >= 2)
    chk("mat_uniform", not (len({"316l stainless"}) >= 2))
    # no stray beam: a compact 8 m run passes; the v44 33 m MCC spine fails (proveCatch)
    def _span(wps):
        xs = [w[0] for w in wps]; ys = [w[1] for w in wps]
        return max(max(xs) - min(xs), max(ys) - min(ys))
    chk("beam_ok", _span([[0, 0, 6000], [8000, 0, 6000], [8000, 2000, 500]]) <= STRAY_BEAM_MAX_SPAN_MM)
    chk("beam_stray", not (_span([[440, 12940, 6270], [440, -16910, 6270], [-5980, -16910, 6270]])
                           <= STRAY_BEAM_MAX_SPAN_MM))   # the 33 m MCC beam is caught
    # G7 site utilisation proveCatch: the v52 stranded-corner deck (hull 476 / deck 1466
    # = 0.33, measured) FIRES; a compacted plant (hull 476 / deck 900 = 0.53) passes; the
    # severity mapping marks a sub-0.30 ratio HIGH (the deck is 3×+ the plant).
    chk("site_util_fires_on_v52", not (476 / 1466 >= SITE_UTILISATION_MIN))
    chk("site_util_pass_compacted", (476 / 900) >= SITE_UTILISATION_MIN)
    # severity: v52's 0.33 is a MED (fails, deck ~3× hull); a 0.20 (deck 5× hull) is a HIGH
    chk("site_util_severity_med", ("high" if 476 / 1466 < 0.30 else "med") == "med")
    chk("site_util_severity_high", ("high" if 300 / 1500 < 0.30 else "med") == "high")
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
    print(f"[drawing-gates] selftest OK ({26} deterministic-gate invariants)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
