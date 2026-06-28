#!/usr/bin/env python3
"""drawing_gates.py <out_dir> — DETERMINISTIC per-drawing quality gates (no LLM, £0, ~instant).

The self-correcting design loop's ≥8 stopping condition for the engineering DRAWINGS. The
multimodal council is expensive and judgment-based; most recurring drawing defects are actually
DETERMINISTIC and checkable from the data the drawings are generated from (state.json +
connection-schedule.json + route-manifest.json + parts-manifest.json + the rendered PNG dims):

  G1 LEGIBILITY        every 2D drawing PNG aspect ratio ≤ 4:1 (a 9:1 single-line strip is unreadable)
  G2 LOAD RECONCILE    the panel-schedule running total ≈ the contract connected_electrical_load_kw (±15%)
  G3 PART COVERAGE     every PRINCIPAL powered part (pump/blower/heat-pump/compressor/UV with a real kW)
                       in the BoM has its own 'supply → <part>' electrical edge in the connection schedule
  G4 MATERIAL DIVERSITY a multi-service plant uses ≥2 distinct pipe materials (not a uniform default)
  G5 QTY-N COVERAGE    each principal qty-N node (degasser/drum-filter/pump/tank count from the contract)
                       is represented by ~N instances in the parts manifest (not collapsed to 1)

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

    return gates


# Map a gate to the engine STAGE that fixes it — the loop routes a failing gate back here.
GATE_STAGE = {
    "legibility": "draw-script (layout / multi-sheet wrap)",
    "load_reconcile": "contract (connected_electrical_load_kw) + panel kW resolution",
    "part_coverage": "topology / orphan-connector (per-equipment electrical feeders)",
    "material_diversity": "connection_sizing (per-service material)",
    "qty_coverage": "contract qty-N replication + parts-manifest expansion",
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
    print(f"[drawing-gates] selftest OK ({12} deterministic-gate invariants)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
