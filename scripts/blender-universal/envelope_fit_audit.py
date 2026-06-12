#!/usr/bin/env python3
"""envelope_fit_audit.py — design-to-envelope P1: does the design fit a fixed envelope?

Plan (d), Tristan 2026-06-12. A fixed building envelope (a 40 ft hi-cube container etc.)
is a hard SPATIAL constraint. This audit takes the CAD parts-manifest.json (per-equipment
dims_mm + shape) and classifies, against a chosen envelope:
  • IN the box   — modular skid equipment that fits a container (upright, or laid down if
                   not an erect-only vessel),
  • EXTERNAL     — piping/interconnects (don't fit properly → taken out, Tristan) + tall
                   columns/vessels that are field-erected (too tall to stand in the box),
then bin-packs the in-box items into N envelopes and reports containers_needed + utilisation.

This is the IMMEDIATE bug-finder (run it on any existing dossier BEFORE the iterative loop
exists): a fixed box turns a wrong/frozen equipment dimension into a visible contradiction
(an item that should containerise but is too big shows up EXTERNAL unexpectedly).

Partial-fit is expected + honest (Tristan): a process plant containerises its skids and
field-erects its columns + piping; that is the answer, not a failure.

Usage:  python3 envelope_fit_audit.py <out_dir | parts-manifest.json> [--env 40ft-hi-cube] [--json]
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

# Internal usable dims (mm): length × width × height. (ISO container internals.)
ENVELOPES = {
    "20ft":         {"L": 5900,  "W": 2350, "H": 2390},
    "40ft":         {"L": 12030, "W": 2350, "H": 2390},
    "40ft-hi-cube": {"L": 12030, "W": 2350, "H": 2700},
    "45ft-hi-cube": {"L": 13556, "W": 2350, "H": 2700},
}
PACK_EFFICIENCY = 0.75  # floor-area utilisation a real shelf/aisle pack achieves
ACCESS_AISLE_M = 0.8    # walkway reserved from container WIDTH (install/wire/maintain) —
#                         single source of truth, shared by shelf_pack + draw_envelope_pack

# The parts-manifest dims_mm are the as-DRAWN Blender bounding boxes — authored for the GA
# RENDER, not for physical packing. Two render artefacts wreck a naive pack: (1) field
# instruments are scaled UP for visibility (a point transmitter drawn ≈1×1 m), and (2) a
# cabinet row is drawn as ONE block of min(qty,6) units (≈4.4 m wide) while the manifest still
# carries the full qty — so the audit multiplies an already-aggregated footprint by qty again,
# inflating the container count ~10×. For these point-device shapes, pack the true PER-UNIT
# physical footprint (qty then multiplies correctly); real vessels / skids keep their bbox.
PHYSICAL_UNIT_DIMS_MM = {
    "instrument":    (250, 250, 400),     # field transmitter / gauge / probe / small inline valve
    "cabinet_small": (700, 500, 1800),    # ONE I/O / SIL-barrier / junction cabinet (not the drawn row)
}

# shapes that are EXTERNAL by nature (interconnects — "don't fit properly", taken out).
EXTERNAL_SHAPE = {"inline_spool", "pipe", "pipe_run", "pipe_rack", "cable", "cable_tray",
                  "duct", "route", "stack", "gantry", "flare"}
# vertical vessels that are normally ERECT-ONLY (cannot be laid down to fit a short box).
ERECT_ONLY_SHAPE = {"tall_column", "tall_vessel", "vertical_vessel", "tank", "column", "tower", "silo"}


def _dims(p: dict) -> tuple[float, float, float]:
    """(w, d, h) in mm. build_parts_manifest writes {w,d,h} for BOX shapes and
    {dia,len} for CYLINDERS — a VERTICAL vessel stands (footprint dia×dia, h=len);
    a horizontal vessel / inline spool lies down (length along the floor, h=dia).
    (Reading only {w,d,h} made every vessel/column 0×0×0 — they wrongly 'fit'.)"""
    d = p.get("dims_mm") or {}
    if "w" in d or "h" in d:
        return float(d.get("w", 0) or 0), float(d.get("d", 0) or 0), float(d.get("h", 0) or 0)
    if "dia" in d or "len" in d:
        dia = float(d.get("dia", 0) or 0)
        ln = float(d.get("len", 0) or 0)
        if str(p.get("shape", "")) in ("horizontal_vessel", "inline_spool"):
            return ln, dia, dia          # lying down: length × dia × dia (height = dia)
        return dia, dia, ln              # standing: dia × dia × height(len)
    return 0.0, 0.0, 0.0


def shelf_pack(in_box: list[dict], eL_mm: float, eW_mm: float) -> list[list[dict]]:
    """Qty-aware first-fit-decreasing SHELF pack of the in-box items into envelopes
    (length eL × width eW, mm). Each PHYSICAL unit (qty expanded) is placed; returns a
    list of containers, each a list of placed {x,y,w,d,label,module} in METRES. This is
    the single source of truth for containers_needed (an area estimate mis-counts a
    mixed-size set, and ignoring qty under-counts)."""
    eL, eW = eL_mm / 1000.0, eW_mm / 1000.0
    # ACCESS AISLE (real-fit fix 2026-06-12): you cannot pack a container wall-to-wall —
    # a ~0.8 m walkway is needed to install, wire, and maintain the equipment. Reserve it
    # from the usable WIDTH (equipment along one side, walkway the other) so the pack is
    # physical, not a 99%-utilisation fantasy. ACCESS_AISLE_M is module-level (shared with
    # draw_envelope_pack so the diagram draws the SAME aisle the packer reserved).
    eW = max(1.0, eW - ACCESS_AISLE_M)
    GAP = 0.15
    units = []
    for r in in_box:
        w_mm, d_mm = r["dims_mm"][0], r["dims_mm"][1]
        w = min(max(w_mm, d_mm) / 1000.0, eL)   # long side along container length
        d = min(w_mm, d_mm) / 1000.0            # short side = depth
        if d > eW:                               # can't fit even rotated (shouldn't happen post-audit)
            continue
        # label = human NAME (what the kit IS) — a reader learns nothing from a cryptic
        # tag like "EP-105"; "SIL isolation barrier" is self-explanatory. Tag stays in the JSON.
        for _ in range(max(1, int(r.get("qty", 1) or 1))):
            units.append((w, d, r.get("name") or r.get("equip_tag") or "?", r.get("module", "?")))
    units.sort(key=lambda u: -u[0])
    containers: list[list[dict]] = []
    cur: list[dict] = []
    shelf_y = shelf_h = x = 0.0
    for (w, d, label, module) in units:
        if x + w > eL + 1e-6:                    # next shelf
            shelf_y += shelf_h + GAP; x = shelf_h = 0.0
        if shelf_y + d > eW + 1e-6:              # container full → new container
            if cur:
                containers.append(cur)
            cur, shelf_y, shelf_h, x = [], 0.0, 0.0, 0.0
        cur.append({"x": round(x, 2), "y": round(shelf_y, 2), "w": round(w, 2),
                    "d": round(d, 2), "label": label, "module": module})
        x += w + GAP
        shelf_h = max(shelf_h, d)
    if cur:
        containers.append(cur)
    return containers


def audit(parts_manifest: dict, env_name: str = "40ft-hi-cube",
          headline_output: dict | None = None) -> dict:
    env = ENVELOPES[env_name]
    eL, eW, eH = env["L"], env["W"], env["H"]
    env_sorted = sorted([eL, eW, eH], reverse=True)
    parts = parts_manifest.get("parts", [])
    in_box: list[dict] = []
    external: list[dict] = []
    for p in parts:
        shape = str(p.get("shape", ""))
        w, d, h = _dims(p)
        phys = PHYSICAL_UNIT_DIMS_MM.get(shape)
        if phys:                                   # render bbox is scaled/aggregated → use per-unit
            w, d, h = phys
        qty = int(p.get("qty", 1) or 1)
        name = p.get("name", p.get("tag", "?"))
        rec = {"name": name, "shape": shape, "qty": qty,
               "module": str(p.get("module", "?")), "equip_tag": p.get("equipment_tag", ""),
               "dims_mm": [round(w), round(d), round(h)],
               "footprint_m2": round((w / 1000.0) * (d / 1000.0), 2)}
        if shape in EXTERNAL_SHAPE:
            rec["reason"] = "interconnect/piping — external by nature"
            external.append(rec); continue
        upright_fits = (w <= eW and d <= eL and h <= eH) or (w <= eL and d <= eW and h <= eH)
        any_fits = all(a <= b for a, b in zip(sorted([w, d, h], reverse=True), env_sorted))
        erect_only = shape in ERECT_ONLY_SHAPE
        if upright_fits:
            in_box.append(rec)
        elif any_fits and not erect_only:
            rec["note"] = "fits laid down"
            in_box.append(rec)
        else:
            rec["reason"] = ("too tall to stand — field-erected" if erect_only and h > eH
                             else "exceeds envelope in every orientation — field-erected")
            external.append(rec)
    # bin-pack the in-box items (qty-aware shelf pack) — the REAL pack is the single
    # source of truth for containers_needed + the diagram.
    floor_m2 = (eL / 1000.0) * (eW / 1000.0)
    used_m2 = sum(r["footprint_m2"] * r["qty"] for r in in_box)
    packing = shelf_pack(in_box, eL, eW)
    containers_needed = len(packing)
    # OUTPUT-FLEX (Tristan: the envelope SETS the scale, OUTPUT is the dependent variable).
    # The containerisable footprint scales ~linearly with throughput, so for a TARGET of K
    # envelopes the design's CONTAINERISABLE output scales O × K / N. For a MODULAR class
    # (vertical-farm grow-area, BESS energy) the containerised kit IS the output, so this
    # directly answers "put it in 1 box → how much output?" (1000 m² → ~100 m²). For a
    # PROCESS plant the headline output is governed by the FIELD-ERECTED core (reactor/
    # columns, external at any scale) — flagged in the note, so the flex is indicative.
    output_flex = None
    if headline_output and headline_output.get("value") and containers_needed:
        try:
            O = float(headline_output["value"])
            N = containers_needed
            ks = sorted({1, 2, max(1, N // 2), N})
            output_flex = {
                "current_output": O, "unit": headline_output.get("unit", ""),
                "metric": headline_output.get("metric", ""),
                "current_containers": N,
                "output_for_containers": {str(k): round(O * k / N, 3) for k in ks},
                "note": ("containerisable-footprint LINEAR flex. {0} field-erected item(s) "
                         "(reactor/columns/tanks/piping) are external at any scale — for a "
                         "process plant they govern the true output, so treat this as indicative; "
                         "for a modular class (grow-area, energy) it is direct.").format(len(external)),
            }
        except (TypeError, ValueError):
            output_flex = None
    return {
        "schema": "envelope-fit-audit/v1",
        "envelope": env_name, "envelope_mm": env,
        "total_parts": len(parts),
        "in_box_count": len(in_box),
        "external_count": len(external),
        "in_box_footprint_m2": round(used_m2, 1),
        "container_floor_m2": round(floor_m2, 1),
        "containers_needed": containers_needed,
        "utilisation_pct": round(100 * used_m2 / (containers_needed * floor_m2), 1) if containers_needed else 0.0,
        "packing": packing,
        "output_flex": output_flex,
        "external": external,
        "in_box": in_box,
        "verdict": ("CONTAINERISABLE — modular core in {0} × {1}; {2} item(s) external "
                    "(field-erected / piping)").format(containers_needed, env_name, len(external)),
    }


def _load_manifest(arg: str) -> dict:
    p = Path(arg)
    if p.is_dir():
        p = p / "parts-manifest.json"
    return json.loads(p.read_text())


def _headline_output(arg: str) -> dict | None:
    """Read the brief's primary output metric (value/unit) from the sibling state.json,
    so the audit can report the output-flex. None if unavailable."""
    p = Path(arg)
    sp = (p / "state.json") if p.is_dir() else (p.parent / "state.json")
    if not sp.exists():
        return None
    try:
        s = json.loads(sp.read_text())
        tp = ((s.get("parsedBrief") or {}).get("constraints") or {}).get("target_performance") or {}
        v = tp.get("value")
        if v in (None, 0):
            mets = tp.get("metrics") or []
            if mets:
                v, tp = mets[0].get("value"), mets[0]
        if v:
            return {"value": v, "unit": tp.get("unit", ""), "metric": tp.get("key_metric", "")}
    except Exception:
        pass
    return None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    env_name = "40ft-hi-cube"
    if "--env" in argv:
        env_name = argv[argv.index("--env") + 1]
    if env_name not in ENVELOPES:
        print(f"unknown envelope '{env_name}'. options: {', '.join(ENVELOPES)}"); return 2
    rep = audit(_load_manifest(argv[0]), env_name, _headline_output(argv[0]))
    if "--json" in argv:
        print(json.dumps(rep, indent=1)); return 0
    print(f"  ENVELOPE FIT — {env_name} ({rep['envelope_mm']['L']}×{rep['envelope_mm']['W']}×{rep['envelope_mm']['H']} mm)")
    print(f"  {'-'*66}")
    print(f"  {rep['verdict']}")
    print(f"  in-box: {rep['in_box_count']} items, {rep['in_box_footprint_m2']} m² → "
          f"{rep['containers_needed']} container(s) @ {rep['utilisation_pct']}% floor utilisation")
    print(f"  external ({rep['external_count']}): "
          + ", ".join(f"{e['name']}[{e['shape']}]" for e in rep["external"][:8])
          + (" …" if rep["external_count"] > 8 else ""))
    fx = rep.get("output_flex")
    if fx:
        row = "  ".join(f"{k}→{v:g}" for k, v in fx["output_for_containers"].items())
        print(f"  OUTPUT-FLEX ({fx['metric'] or 'output'}, {fx['unit']}): {fx['current_output']:g} at "
              f"{fx['current_containers']} containers; containers→output  {row}")
        print(f"    note: {fx['note']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
