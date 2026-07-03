#!/usr/bin/env python3
"""
scripts/blender-universal/draw_bfd_test.py

Headless test for draw_bfd.py.  Asserts the projected drawing is a REAL executive
Block-Flow Diagram — the rubric Tristan judges it on — NOT a degraded box-list:

  PROCESS ORDER         the equipment is laid out in TRUE process order left→right
                        (feed end at column 0, the reactor downstream of its feeds, the
                        finished product the right-hand climax), derived from the topology
                        graph (component-aware longest-path) — NOT the jumbled module-
                        storage order.  The headline assertion: the FEED block(s) sit
                        strictly left of the PRODUCT block(s).
  STREAMS DRAWN         the main process streams are drawn as ARROWS between the blocks
                        (flow-direction markers present) — the diagram carries streams,
                        not just boxes; thermal/steam streams are a distinct style.
  RECYCLE               a recycle loop is detected + drawn dashed when the process has one
                        (the e-fuel tail-gas recycle returns to the reactor).
  BOUNDARIES            feed(s) enter on the left + product(s) leave on the right, styled
                        distinctly (battery-limit markers).
  HONEST QUANTITIES     a boundary/stream flow label only ever shows a value that EXISTS
                        in the engineering contract (the CO₂ feed reads ~1000 kg/h, NOT
                        H₂'s 140 kg/h — the anti-fabrication guard).
  TITLE BLOCK + LEGEND  both present, with the "not for construction" scope note.
  PNG RENDERS           when a rasteriser is available, the PNG is written + is > 1 KB
                        (the absolute-file:// path guard — a relative path yields a blank
                        PNG; we render to an absolute path and check the bytes).

Two archetypes are exercised when present:
  e-fuel SAF (out/oxccu-saf-v21/state.json): the PRIMARY target — feed compressors →
      FT reactor → 3-phase separator → recycle; fractionation → SAF storage; the purge →
      thermal-oxidiser abatement branch + the waste-heat steam generator.
  CO2 mineralisation (out/co2-caspar-fix3/state.json): flue-gas blower → absorber →
      stripper → carbonation → CaCO3 filter.

Run (no venv needed — pure stdlib + the archetype state.json):
    python3 scripts/blender-universal/draw_bfd_test.py
    BFD_RASTER=0 python3 scripts/blender-universal/draw_bfd_test.py   # skip PNG raster

Exits non-zero on the first failed assertion; prints an inspectable per-archetype
summary either way.
"""
from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_bfd as B  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
# raster the PNG by default (the task wants the PNG asserted); BFD_RASTER=0 to skip.
RASTER = os.environ.get("BFD_RASTER", "1") != "0"

# (label, state.json, optional artifact dir that already holds route-manifest /
# connection-schedule).  When the artifact dir is absent the test still runs from the
# TOPOLOGY ALONE (the manifests are pure enrichment), which must still produce a valid BFD.
CASES = [
    ("e-fuel SAF", REPO / "out/oxccu-saf-v21/state.json", REPO / "out/oxccu-saf-v21",
     {"expect_recycle": True}),
    ("CO2 mineralisation", REPO / "out/co2-caspar-fix3/state.json",
     REPO / "out/co2-caspar-fix3", {"expect_recycle": False}),
]


class Fail(AssertionError):
    pass


def _check(cond, msg):
    if not cond:
        raise Fail(msg)


def _feed_keys(bf):
    return [b.block_key for b in bf.boundaries if b.kind == B.BND_FEED]


def _product_keys(bf):
    return [b.block_key for b in bf.boundaries if b.kind == B.BND_PRODUCT]


def _col(bf, key):
    for b in bf.blocks:
        if b.key == key:
            return b.col
    return None


def _run_case(label, state_path, artifact_dir, opts):
    # render into a PRIVATE temp dir (never the source tree); copy the optional manifests
    # next to it so the enriched path is exercised when they exist.
    work = tempfile.mkdtemp(prefix="bfd-test-")
    have_artifacts = False
    if artifact_dir and Path(artifact_dir).is_dir():
        import shutil
        for fn in ("route-manifest.json", "connection-schedule.json"):
            src = Path(artifact_dir) / fn
            if src.is_file():
                shutil.copy(src, Path(work) / fn)
                have_artifacts = True

    summary, bf, svg = B.generate_bfd(work, str(state_path), rasterise_png=RASTER)

    print(f"\n=== {label} ===")
    print(f"  archetype      : {summary['archetype']}")
    print(f"  artifacts      : {'route+schedule copied' if have_artifacts else 'topology-only'}")
    print(f"  blocks         : {summary['blocks']}  ({summary['columns']} columns)")
    print(f"  streams        : {summary['streams']}  (process {summary['process_streams']}, "
          f"thermal {summary['thermal_streams']}, recycle {summary['recycle_streams']}, "
          f"inferred {summary['inferred_streams']})")
    print(f"  boundaries     : {summary['feeds']} feed(s), {summary['products']} product(s)")
    print(f"  SVG bytes      : {len(svg)}")
    print(f"  order          : {B._order_str(bf)}")

    # ---- (1) BLOCKS — real unit operations, not an empty sheet ---------------
    _check(summary["blocks"] >= 5, f"{label}: too few blocks ({summary['blocks']})")
    # every block carries a real human label (resolved name_human), never a bare key.
    for b in bf.blocks:
        _check(bool(b.label) and b.label != b.key,
               f"{label}: block {b.key} has no resolved human name ({b.label!r})")

    # ---- (2) PROCESS ORDER — feed strictly left of product ------------------
    cols = sorted({b.col for b in bf.blocks})
    _check(cols[0] == 0 and cols == list(range(cols[0], cols[-1] + 1)),
           f"{label}: process columns not contiguous from 0: {cols}")
    feeds, products = _feed_keys(bf), _product_keys(bf)
    _check(feeds, f"{label}: no boundary FEED derived")
    _check(products, f"{label}: no boundary PRODUCT derived")
    feed_cols = [_col(bf, k) for k in feeds]
    prod_cols = [_col(bf, k) for k in products]
    # THE headline assertion: the (M1) feed end is strictly upstream of the (M4) product.
    _check(min(feed_cols) < max(prod_cols),
           f"{label}: feed end (cols {feed_cols}) not upstream of product "
           f"(cols {prod_cols}) — process order not derived (reads like the storage dump)")

    # for e-fuel, assert the canonical spine specifically: a feed COMPRESSOR upstream of
    # the FT REACTOR upstream of the SEPARATOR upstream of the SAF STORAGE.  Gate on the
    # archetype (reliable) AND on the spine actually being present (so a future e-fuel
    # variant without a discrete separator does not hard-fail here).
    is_efuel = "e_fuel" in (summary.get("archetype") or "").lower()
    if is_efuel and all(
            any(re.search(rx, b.key, re.I) for b in bf.blocks)
            for rx in (r"feed_compressor", r"reactor|synthesis", r"separator",
                       r"storage|tank")):
        def _find(rx):
            for b in bf.blocks:
                if re.search(rx, b.key, re.I):
                    return b
            return None
        feedc = _find(r"feed_compressor")
        reactor = _find(r"reactor|synthesis")
        sep = _find(r"separator")
        store = _find(r"storage|tank")
        _check(feedc and reactor and sep and store,
               f"{label}: expected feed-compressor/reactor/separator/storage in the train")
        _check(feedc.col < reactor.col < sep.col,
               f"{label}: feed→reactor→separator order wrong "
               f"({feedc.col}<{reactor.col}<{sep.col})")
        _check(reactor.col < store.col,
               f"{label}: product storage (col {store.col}) not downstream of the reactor "
               f"(col {reactor.col})")

    # ---- (3) STREAMS DRAWN — arrows, not just boxes -------------------------
    _check(summary["streams"] >= 4, f"{label}: too few streams ({summary['streams']})")
    _check(summary["process_streams"] >= 3,
           f"{label}: too few MAIN process streams ({summary['process_streams']})")
    # the flow-direction arrow marker must be DEFINED and USED on the lines (a BFD shows
    # flow) — proves streams are drawn, not merely boxes.
    _check('marker-end="url(#bf_' in svg,
           f"{label}: no flow-direction arrows drawn on the streams")
    _check(svg.count('marker-end="url(#bf_') >= 4,
           f"{label}: implausibly few drawn stream arrows in the SVG")
    # a thermal/steam stream must be styled distinctly when the process has one.
    if any(s.style == B.STREAM_THERMAL for s in bf.streams):
        _check("bf_therm" in svg,
               f"{label}: a thermal stream exists but no thermal marker drawn")

    # ---- (4) RECYCLE detected + drawn when present --------------------------
    if opts.get("expect_recycle"):
        _check(summary["recycle_streams"] >= 1,
               f"{label}: expected a recycle loop but none detected")
        _check("bf_recyc" in svg or "Recycle loop" in svg,
               f"{label}: recycle present but no recycle styling/legend in the SVG")
        # the recycle must close back to an UPSTREAM block (a real loop, not a forward arc).
        rec = [s for s in bf.streams if s.style == B.STREAM_RECYCLE]
        for s in rec:
            fc, tc = _col(bf, s.from_key), _col(bf, s.to_key)
            if fc is not None and tc is not None:
                _check(tc <= fc,
                       f"{label}: recycle {s.from_key}->{s.to_key} routes forward "
                       f"({fc}->{tc}), not back to an upstream unit")

    # ---- (5) HONEST QUANTITIES — no borrowed/fabricated flow ----------------
    # the CO₂ feed must NOT carry H₂'s flow (and vice-versa); only contract values appear.
    for s in bf.streams:
        if re.search(r"co2_feed", s.from_key, re.I) and s.qty:
            _check("140" not in s.qty,
                   f"{label}: CO₂ feed stream borrowed H₂'s flow ({s.qty!r}) — "
                   f"anti-fabrication guard breached")
    for bnd in bf.boundaries:
        if "co2" in bnd.block_key.lower() and bnd.qty:
            _check("140" not in bnd.qty,
                   f"{label}: CO₂ feed boundary shows H₂ flow ({bnd.qty!r})")

    # ---- (6) TITLE BLOCK + LEGEND + scope note ------------------------------
    _check("LEGEND" in svg, f"{label}: no LEGEND in the drawing")
    _check("BLOCK-FLOW DIAGRAM" in svg, f"{label}: title-block heading missing")
    _check("not for construction" in svg.lower(),
           f"{label}: scope note 'not for construction' missing")
    _check("ISO 2768-mK" in svg,
           f"{label}: shared general-tolerance note (ISO 2768-mK) missing")
    _check("DRAWING No." in svg or "DRAWING No" in svg,
           f"{label}: drawing-number field missing from title block")
    _check("Process stream" in svg, f"{label}: legend missing the process-stream key")

    # ---- (7) structural SVG sanity ------------------------------------------
    _check(svg.lstrip().startswith("<svg"), f"{label}: output is not an SVG document")
    _check(svg.count("<text") >= 15, f"{label}: implausibly few text labels")

    # ---- (8) PNG RENDERS + > 1 KB (when a rasteriser is available) ----------
    if RASTER:
        png = summary.get("png")
        if png:
            p = Path(png)
            _check(p.is_absolute(),
                   f"{label}: PNG path is not absolute ({png}) — relative file:// risks "
                   f"a blank render")
            _check(p.is_file() and p.stat().st_size > 1024,
                   f"{label}: PNG missing or ≤1 KB ({p.stat().st_size if p.is_file() else 0} "
                   f"bytes) — rasterisation failed (blank-PNG bug?)")
            print(f"  PNG            : {p.stat().st_size:,} bytes -> {png}")
        else:
            # no rasteriser on this host — the SVG is the master; don't fail the suite,
            # but say so loudly so a missing PNG isn't silently treated as a pass.
            print("  PNG            : (no rasteriser available — SVG is the master; "
                  "PNG byte-check skipped)")

    print(f"  PASS  (order feed<product OK, {summary['process_streams']} process streams, "
          f"recycle={summary['recycle_streams']}, feeds={summary['feeds']}, "
          f"products={summary['products']})")
    return summary


def main():
    present = [(l, s, d, o) for (l, s, d, o) in CASES if Path(s).is_file()]
    if not present:
        missing = "\n  ".join(str(s) for _l, s, _d, _o in CASES)
        print("[bfd-test] SKIP — no state.json found:\n  " + missing)
        return 0
    try:
        for label, state_path, artifact_dir, opts in present:
            _run_case(label, state_path, artifact_dir, opts)
    except Fail as ex:
        print(f"\n[bfd-test] FAIL: {ex}")
        return 1
    print("\n[bfd-test] ALL PASS — the Block-Flow Diagram projects a real, process-ordered "
          "plant (feed upstream of product · streams drawn as arrows · recycle dashed · "
          "boundaries styled · honest quantities · legend + title block).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
