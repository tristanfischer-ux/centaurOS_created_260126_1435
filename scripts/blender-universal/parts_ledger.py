#!/usr/bin/env python3
"""
parts_ledger.py — THE LEDGER: one canonical object holding everything about the
design except the pixels. The images (Blender + the 8 drawings) are VIEWS of it:
generated from it and checked against it.

Tristan's design (2026-06-16, across four messages):
  1. "a table/database of parts that is the bom but also has all the inputs and
     outputs and transformations plus whether the information is in the relevant
     blender image or the 8 engineering documents — explicitly check things off."
  2. "the ledger is also the bom with everything about the costings in it."
  3. "the ledger should have everything in it except the images and they should
     inform the ledger and be changed by the ledger."
  4. "inputs and outputs should also determine what part it inputs from and outputs
     to including all of the pipes wires sensors etc. that information can be cross
     referenced with the 8 engineering drawings and the blender images."

So the ledger has two row kinds, both cross-referenced against every view:
  PARTS (equipment) — identity, BoM/cost (catalogue part, qty, unit/line £, basis,
    status, sub-component breakdown), inputs/outputs that NAME the connected part +
    the connecting element (pipe/cable/sensor) + mechanism, transformation, and a
    ✓/✗ coverage cell per representation (blender + 8 drawings) with EXPECTED
    coverage per type so a GAP = expected ✓ ∧ absent.
  CONNECTIONS (the pipes / wires / sensor ties) — from-part → to-part, mechanism,
    kind, size, rating, length, cost, AND their OWN coverage (P&ID line, line-list,
    isometric spool, Blender route) so every connection is checked off too.

SPINE = state.requirementsBom (the BoM, tag-keyed; sub-components line_gbp=0 so
Σ line_gbp reconciles). Flows = connection-schedule rows. Enriched by parts-
manifest (Blender placement) + route-manifest (routed pipes). DERIVED every run —
never hand-maintained — and meant to become the single source the draw_*.py
generators read (one tag → one name → one cost → one role → one connection).

USAGE: python3 parts_ledger.py <out_dir> [state.json]
OUTPUT: <out_dir>/parts-ledger.json + a printed ledger + coverage check-off.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPS = ["blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule",
        "block-flow-diagram", "process-schedules", "isometric-index"]
SHORT = {"blender": "BLE", "general-arrangement": "GA", "pid": "P&ID",
         "single-line-diagram": "SLD", "panel-schedule": "PNL", "block-flow-diagram": "BFD",
         "process-schedules": "SCH", "isometric-index": "ISO"}

TYPE_EXPECTED = {
    "vessel":     {"blender", "general-arrangement", "pid", "block-flow-diagram", "isometric-index"},
    "rotating":   {"blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule", "block-flow-diagram"},
    "exchanger":  {"blender", "general-arrangement", "pid", "block-flow-diagram"},
    "separator":  {"blender", "general-arrangement", "pid", "block-flow-diagram", "isometric-index"},
    "instrument": {"pid", "process-schedules"},
    "valve":      {"pid", "process-schedules"},
    "electrical": {"single-line-diagram", "panel-schedule"},
    "control":    {"single-line-diagram", "panel-schedule"},
    "other":      {"blender", "general-arrangement"},
}
TYPE_RULES = [
    ("instrument", r"transmitter|analy[sz]er|\bprobe\b|sensor|\bgauge\b|level switch|"
                   r"flow meter|detector|monitor"),
    ("valve",      r"\bvalve\b|solenoid|actuator|damper"),
    ("control",    r"controller|gateway|\bI/O\b|network switch|power supply|scada|\bUPS\b|\bPLC\b"),
    ("electrical", r"transformer|switchgear|\bMCC\b|\bpanel\b|busbar|generator|genset|breaker|relay|\bATS\b|fuse|surge"),
    ("rotating",   r"\bpump\b|blower|\bfan\b|compressor|skimmer|aerat"),
    ("exchanger",  r"heat exchanger|heat pump|\bHEX\b|chiller|\bUV\b|ozone|steril|oxygenat|degas|makeup hex"),
    ("separator",  r"drum filter|screen|filter|clarifi|settl|cyclone|membrane|biofilter|\bMBBR\b"),
    ("vessel",     r"\btank\b|vessel|reservoir|\bsump\b|\bcone\b|column|reactor|silo|hopper|\bLOX\b|storage"),
]
TRANSFORM = {"vessel": "holds / contains working fluid", "rotating": "adds head / moves fluid",
             "exchanger": "transfers heat / treats stream", "separator": "separates a phase",
             "instrument": "measures a process variable", "valve": "regulates / isolates a flow",
             "electrical": "distributes electrical power", "control": "computes / commands",
             "other": "—"}
# mechanism → the physical connecting element kind (pipes / wires / sensors)
MECH_KIND = {"fluid_loop": "pipe", "fluid": "pipe", "process": "pipe", "thermal": "pipe (thermal)",
             "electrical": "cable", "power": "cable", "signal": "signal/sensor tie",
             "control": "signal/sensor tie", "gas": "gas pipe"}


def _norm(s: str) -> str:
    s = re.sub(r"^u_", "", (s or "").strip().lower())
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"s\b", "", s)


def _classify(name: str, tag: str) -> str:
    blob = f"{name} {tag}".lower()
    for typ, rx in TYPE_RULES:
        if re.search(rx, blob, re.I):
            return typ
    return "other"


def _load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _is_connection(r: dict) -> bool:
    return (r.get("status") == "ROUTED" or bool(re.fullmatch(r"C\d+", str(r.get("tag", ""))))
            or str(r.get("basis", "")).startswith(("pipe ", "cable ", "gas ")))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: parts_ledger.py <out_dir> [state.json]", file=sys.stderr)
        return 2
    out_dir = Path(sys.argv[1]).resolve()
    state_path = Path(sys.argv[2]) if len(sys.argv) > 2 else out_dir / "state.json"
    ddir = out_dir / "drawings"
    state = _load(state_path) or {}
    manifest = _load(out_dir / "parts-manifest.json") or {}
    conn = _load(out_dir / "connection-schedule.json") or {}
    route = _load(out_dir / "route-manifest.json") or {}
    rb = state.get("requirementsBom") or []

    placed = {str(p.get("equipment_tag") or p.get("tag")): p
              for p in (manifest.get("parts", []) if isinstance(manifest, dict) else [])}
    subs: dict[str, list] = {}
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" and r.get("sub_of"):
            subs.setdefault(str(r["sub_of"]), []).append(r)

    # rendered text per view (deterministic, no OCR)
    def _svg_text(f: Path) -> str:
        return " " + " ".join(re.findall(r">([^<>]+)<", f.read_text(errors="ignore"))) + " " \
            if f.exists() else ""

    rep_text = {"blender": ""}
    for key in REPS:
        if key == "blender":
            continue
        if key == "isometric-index":
            # the isometrics are PER-LINE spool files (isometric-201-PR-DN300.svg …), NOT a
            # single index sheet — `isometric-index.svg` never exists, so the old single-file
            # read gave EVERY part ISO=absent (false 0/N). A part is on the ISO set if it is
            # named on ANY spool, so AGGREGATE every spool's text. (Connection ISO coverage
            # already keys on the per-line spool file; this fixes the PART side.)
            rep_text[key] = " ".join(_svg_text(f) for f in sorted(ddir.glob("isometric-*.svg")))
            continue
        rep_text[key] = _svg_text(ddir / f"{key}.svg")
    placed_norms = {_norm(str(p.get("name", ""))) for p in placed.values()}

    def covered(tag: str, name: str, key: str) -> bool:
        if key == "blender":
            return tag in placed or _norm(name) in placed_norms
        txt = rep_text.get(key, "")
        if not txt:
            return False
        if tag and (f" {tag} " in txt or f">{tag}<" in txt):
            return True
        nm = (name or "").strip()
        return bool(nm and len(nm) >= 4 and nm.lower() in txt.lower())

    # ── 1. PARTS (equipment) — identity + BoM/cost + coverage (I/O attached below) ──
    equipment = []
    grand = sum(r.get("line_gbp", 0) or 0 for r in rb)
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" or _is_connection(r):
            continue
        tag = str(r.get("tag", ""))
        req = str(r.get("requirement", ""))
        name = (req.split("·")[0].strip() or str(placed.get(tag, {}).get("name", "")) or tag)
        typ = _classify(name, tag)
        pm = placed.get(tag, {})
        sublist = subs.get(tag, [])
        cov = {key: covered(tag, name, key) for key in REPS}
        expected = TYPE_EXPECTED.get(typ, set())
        equipment.append(dict(
            tag=tag, name=name, type=typ, module=pm.get("module"), ikey=_norm(name),
            requirement=req, part=r.get("part"), status=r.get("status"),
            qty=r.get("qty"), unit_gbp=r.get("unit_gbp"), line_gbp=r.get("line_gbp"),
            basis=str(r.get("basis", ""))[:90], subcomponents=len(sublist),
            subcomponent_gbp=round(sum(s.get("breakdown_gbp", 0) or 0 for s in sublist)),
            modelled_qty=(pm.get("qty") if pm else 0), dims_mm=pm.get("dims_mm"),
            transformation=TRANSFORM.get(typ, "—"),
            coverage=cov, expected=sorted(expected),
            gaps=sorted(k for k in expected if not cov.get(k)),
            inputs=[], outputs=[]))

    # resolver: a connection-schedule internal key → the equipment row (by norm name)
    eq_by_key: dict[str, dict] = {}
    for e in equipment:
        eq_by_key.setdefault(e["ikey"], e)
    def resolve(ikey: str):
        if ikey in eq_by_key:
            return eq_by_key[ikey]
        for k, e in eq_by_key.items():          # loose contains-match (rotary_drum_filter↔drum filter)
            if k and (k in ikey or ikey in k):
                return e
        return None

    # ── 2. CONNECTIONS (pipes / wires / sensor ties) — endpoints + via + coverage ──
    rows = conn.get("rows", []) if isinstance(conn, dict) else []
    specs = conn.get("specs", []) if isinstance(conn, dict) else []
    route_lines = (route.get("lines") if isinstance(route, dict) else None) or []
    runname_to_lineno = {l.get("run_name"): l.get("line_number")
                         for l in route_lines if isinstance(l, dict)}
    tagpair_to_lineno = {(_norm(str(l.get("from_tag", ""))), _norm(str(l.get("to_tag", "")))):
                         l.get("line_number") for l in route_lines if isinstance(l, dict)}
    connections = []
    for i, r in enumerate(rows):
        fr_key, to_key = _norm(str(r.get("from", ""))), _norm(str(r.get("to", "")))
        mech = r.get("mechanism", "")
        spec = specs[i] if i < len(specs) and isinstance(specs[i], dict) else {}
        kind = spec.get("kind") or MECH_KIND.get(mech, "pipe")
        size = r.get("size") or spec.get("size_label") or ""
        lineno = runname_to_lineno.get(spec.get("run_name")) or tagpair_to_lineno.get((fr_key, to_key))
        fe, te = resolve(fr_key), resolve(to_key)
        fn = fe["name"] if fe else fr_key.title()
        tn = te["name"] if te else to_key.title()
        # coverage by the AUTHORITATIVE line number (exact join via route-manifest): the
        # P&ID + line-list label the line number, the isometric spool file is named for
        # it, the Blender route-manifest carries the run. P&ID falls back to "both
        # endpoint symbols present" when the line number itself is not labelled.
        ln = str(lineno or "")
        both_pid = (covered((fe or {}).get("tag", ""), fn, "pid")
                    and covered((te or {}).get("tag", ""), tn, "pid"))
        cov = dict(
            pid=bool(ln and ln in rep_text.get("pid", "")) or both_pid,
            process_schedules=bool(ln and ln in rep_text.get("process-schedules", "")),
            isometric=bool(lineno and (ddir / f"isometric-{lineno}.svg").exists()),
            route=bool(lineno),
        )
        via = f"{kind} {size}".strip()
        connections.append(dict(
            idx=i, line_number=lineno, from_part=fn, from_tag=(fe or {}).get("tag"), to_part=tn,
            to_tag=(te or {}).get("tag"), mechanism=mech, kind=kind, via=via,
            size=size, rating=r.get("rating"), length_m=r.get("length_m"),
            line_gbp=r.get("line_total_gbp") or r.get("line_gbp"),
            within_spec=r.get("within_spec"), coverage=cov))
        # attach to the endpoint parts' inputs/outputs (NAME the part + via-element)
        if te:
            te["inputs"].append(f"{fn} ({(fe or {}).get('tag') or '?'}) via {via} [{mech}]")
        if fe:
            fe["outputs"].append(f"{tn} ({(te or {}).get('tag') or '?'}) via {via} [{mech}]")

    # ── reconciliations / summaries ──
    by_drawing = {}
    for key in REPS:
        exp = [e for e in equipment if key in e["expected"]]
        pres = [e for e in exp if e["coverage"].get(key)]
        by_drawing[key] = dict(expected=len(exp), present=len(pres),
                               pct=round(100 * len(pres) / len(exp), 1) if exp else None)
    conn_cov = {}
    for key in ("pid", "process_schedules", "isometric", "route"):
        vals = [c["coverage"][key] for c in connections if c["coverage"][key] is not None]
        applic = [c for c in connections if not (key == "isometric" and "pipe" not in c["kind"])]
        pres = sum(1 for c in applic if c["coverage"][key])
        conn_cov[key] = dict(present=pres, applicable=len(applic),
                             pct=round(100 * pres / len(applic), 1) if applic else None)
    not_found = [e["tag"] for e in equipment if e["status"] == "NOT FOUND"]
    gapped = [e for e in equipment if e["gaps"]]
    orphans = [e["tag"] for e in equipment if not e["inputs"] and not e["outputs"]
               and e["type"] in ("vessel", "rotating", "exchanger", "separator")]
    uncov_conn = [f"{c['from_part']}→{c['to_part']}" for c in connections
                  if not c["coverage"]["pid"]]

    for e in equipment:
        e.pop("ikey", None)
    report = dict(out_dir=str(out_dir), grand_total_gbp=round(grand), n_equipment=len(equipment),
                  n_connections=len(connections),
                  connections_gbp=round(sum(c["line_gbp"] or 0 for c in connections)),
                  coverage_by_drawing=by_drawing, connection_coverage=conn_cov,
                  not_found=not_found, n_gapped=len(gapped), orphan_equipment=orphans,
                  n_connections_off_pid=len(uncov_conn),
                  equipment=equipment, connections=connections)
    (out_dir / "parts-ledger.json").write_text(json.dumps(report, indent=1))

    # ── printed ledger + coverage ──
    print(f"\n  LEDGER (BoM + connectivity + coverage) — {out_dir.name}   "
          f"£{round(grand):,} raw materials   {len(equipment)} parts + {len(connections)} connections")
    hdr = ("  " + f"{'tag':7}{'type':10}{'name':22}{'£ line':>9} {'in/out':>6} {'status':9}"
           + "".join(f"{SHORT[k]:>5}" for k in REPS))
    print(hdr); print("  " + "-" * (len(hdr) - 2))
    for e in equipment:
        cells = "".join(f"{'  ✓':>5}" if e["coverage"].get(k) else
                        (f"{'  ✗':>5}" if k in e["expected"] else f"{'  ·':>5}") for k in REPS)
        lg = f"{e['line_gbp']:>8,.0f}" if e.get("line_gbp") is not None else "       —"
        io = f"{len(e['inputs'])}/{len(e['outputs'])}"
        print(f"  {e['tag']:7}{e['type']:10}{e['name'][:21]:22}{lg} {io:>6} "
              f"{str(e['status'] or '')[:8]:9}{cells}")
    print("  " + "-" * (len(hdr) - 2))
    part_cov = "   ".join(f"{SHORT[k]} {by_drawing[k]['present']}/{by_drawing[k]['expected']}"
                          for k in REPS if by_drawing[k]['expected'])
    print(f"  PART coverage by drawing (present / expected):   {part_cov}")
    cc = []
    for k in ("pid", "process_schedules", "isometric", "route"):
        d = conn_cov[k]
        pct = "" if d["pct"] is None else f" ({d['pct']}%)"
        cc.append(f"{k} {d['present']}/{d['applicable']}{pct}")
    print("  CONNECTION coverage (pipes/wires/sensors vs the views):   " + "   ".join(cc))
    print(f"  → {len(not_found)} NOT FOUND · {len(gapped)} parts w/ coverage gap · "
          f"{len(orphans)} orphan · {len(uncov_conn)} connections off the P&ID.  wrote parts-ledger.json\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
