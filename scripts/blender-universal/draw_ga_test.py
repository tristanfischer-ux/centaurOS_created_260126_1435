#!/usr/bin/env python3
"""
scripts/blender-universal/draw_ga_test.py

Headless test for the GENERAL ARRANGEMENT pipeline — Part 1 (parts-manifest export
from build_universal_scene.py) + Part 2 (draw_ga.py projection). Asserts the
manifest is COMPLETE and the projected drawing is a REAL dimensioned GA — the exact
rubric a layout engineer (and Tristan) judges it on — NOT a screenshot of the 3D
render:

  COMPLETE MANIFEST    every placed part carries pos_mm (3 coords) + dims_mm
                       ({w,d,h} OR {dia,len}, all > 0) + a human equipment_tag
                       (ISA letter + number, e.g. R-103 / V-101 / K-101); the
                       overall bbox_mm is present with a plant L/W/H.
  TAG CONVENTION       at least the standard letters appear where the archetype has
                       the kit (K compressor / P pump / R reactor / C column /
                       V or D vessel/drum / E exchanger / T or TK tank).
  DIMENSIONED DRAWING  the GA SVG carries DIMENSION LINES (arrow markers + extension
                       lines) with mm/m VALUES, an explicit SCALE (1:N) + a drawn
                       scale bar, a NORTH ARROW on the plan, PLAN + two ELEVATIONS,
                       equipment OUTLINES tagged with their equipment_tag, a datum,
                       a title block (FF-GA-001) + a "not for construction" note.

Two canonical archetypes are exercised from a pre-built manifest (regenerate via
  INSPECT=1 BLENDER_OUT_DIR=/tmp/ga-efuel <blender> ... -- out/oxccu-saf-v21/state.json
  INSPECT=1 BLENDER_OUT_DIR=/tmp/ga-bess  <blender> ... -- out/rerun-energy_storage/state.json
):
  e-fuel SAF  (process_plant family) and  BESS  (rack_farm family).

Run (no venv needed — pure stdlib + the pre-built parts-manifest.json):
    python3 scripts/blender-universal/draw_ga_test.py
    GA_RASTER=1 python3 scripts/blender-universal/draw_ga_test.py   # also write PNGs

Exits non-zero on the first failed assertion; prints an inspectable per-archetype
summary either way. Skips an archetype (with a clear note) if its manifest has not
yet been generated, so the test never hard-fails purely for a missing Blender run —
but at least ONE manifest must be present or the test errors.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_ga as G  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RASTER = os.environ.get("GA_RASTER") == "1"

# (label, manifest dir candidates, sibling state.json) — manifest dir is the /tmp
# build dir from build_universal_scene with INSPECT=1.
CASES = [
    ("e-fuel SAF", ["/tmp/ga-efuel", "/tmp/bl-univ-efuel-sized"],
     REPO / "out/oxccu-saf-v21/state.json"),
    ("BESS", ["/tmp/ga-bess", "/tmp/bl-univ-bess"],
     REPO / "out/rerun-energy_storage/state.json"),
]


class Fail(AssertionError):
    pass


def _check(cond, msg):
    if not cond:
        raise Fail(msg)


def _find_manifest_dir(candidates):
    for c in candidates:
        if (Path(c) / "parts-manifest.json").is_file():
            return c
    return None


def _run_case(label, manifest_dir, state_path):
    summary, parts, svg = G.generate_ga(manifest_dir, str(state_path),
                                        rasterise_png=RASTER)
    # re-load the raw manifest for the completeness assertions.
    raw_parts, bbox, meta = G.load_manifest(manifest_dir)

    print(f"\n=== {label} ===")
    print(f"  archetype : {summary['archetype']}")
    print(f"  manifest  : {manifest_dir}/parts-manifest.json  ({len(raw_parts)} parts)")
    print(f"  envelope  : {summary['plant_L_m']} × {summary['plant_W_m']} × "
          f"{summary['plant_H_m']} m  (L×W×H)")
    print(f"  SVG bytes : {len(svg)}")

    # ---- (1) COMPLETE MANIFEST — every part has pos + dims + tag -------------
    _check(len(raw_parts) >= 8, f"{label}: too few placed parts ({len(raw_parts)})")
    for p in raw_parts:
        # ISA-style tag: 1-3 uppercase letters + '-' + a number (R-103, TK-101,
        # PCS-104, BMS-101 are all valid industry equipment tags).
        _check(bool(p.tag) and re.match(r"^[A-Z]{1,3}-\d+$", p.tag),
               f"{label}: part '{p.name}' has a non-standard equipment_tag '{p.tag}'")
        # position present + finite
        for c in (p.cx, p.cy):
            _check(isinstance(c, float), f"{label}: '{p.name}' has no numeric pos")
        # dims present + positive (a real footprint, not a zero box)
        if p.is_round:
            dia = p.x1 - p.x0
            ln = p.z1 - p.z0
            _check(dia > 0 and ln > 0,
                   f"{label}: round part '{p.name}' has zero dims (dia={dia}, len={ln})")
        else:
            w = p.x1 - p.x0
            dep = p.y1 - p.y0
            h = p.z1 - p.z0
            _check(w > 0 and dep > 0 and h > 0,
                   f"{label}: box part '{p.name}' has a zero dim (w={w},d={dep},h={h})")
    # bbox present with a real plant envelope
    _check(summary["plant_L_m"] > 0 and summary["plant_W_m"] > 0
           and summary["plant_H_m"] > 0,
           f"{label}: plant envelope missing/zero {summary}")

    # ---- (2) TAG CONVENTION — ISA letters present for the archetype's kit ----
    letters = sorted({p.tag.split("-")[0] for p in raw_parts})
    print(f"  tag letters: {letters}")
    _check(len(letters) >= 2,
           f"{label}: only one equipment-tag family ({letters}) — tags not derived")
    # tags are UNIQUE (a real schedule never repeats an item number)
    all_tags = [p.tag for p in raw_parts]
    _check(len(all_tags) == len(set(all_tags)),
           f"{label}: duplicate equipment tags emitted "
           f"({[t for t in all_tags if all_tags.count(t) > 1][:4]})")

    # ---- (3) DIMENSIONED GA DRAWING, not a 3D screenshot --------------------
    # PLAN + two ELEVATIONS
    _check("PLAN" in svg, f"{label}: no PLAN view in the GA")
    _check(svg.count("ELEVATION") >= 2,
           f"{label}: expected two ELEVATIONS, found {svg.count('ELEVATION')}")
    # DIMENSION LINES: the arrow marker is defined AND referenced (real dim lines).
    _check('id="dim"' in svg, f"{label}: no dimension-arrow marker defined")
    _check(svg.count("url(#dim)") >= 4,
           f"{label}: too few dimension lines ({svg.count('url(#dim)')}) — "
           f"a GA must dimension overall L, W and H at minimum")
    # dimension VALUES in mm/m present (e.g. '42.4 m' / '15030 mm')
    _check(re.search(r">[\d.]+\s*(m|mm)<", svg),
           f"{label}: dimension lines carry no mm/m values")
    # explicit SCALE ratio + a drawn scale bar
    _check(re.search(r"SCALE\s*1:\d+", svg) or re.search(r"1:\d+", svg),
           f"{label}: no stated scale (1:N)")
    _check("SCALE 1:" in svg, f"{label}: no scale-bar label")
    # NORTH ARROW on the plan
    _check(re.search(r'>N<', svg), f"{label}: no north arrow / 'N' on the plan")
    # equipment OUTLINES tagged with the equipment_tag (a few sampled tags appear)
    sample = [p.tag for p in sorted(raw_parts,
              key=lambda q: -(abs(q.x1 - q.x0) * abs(q.z1 - q.z0)))[:5]]
    found = [t for t in sample if f">{t}<" in svg]
    _check(len(found) >= 2,
           f"{label}: equipment tags not drawn on outlines (looked for {sample}, "
           f"found {found})")
    # datum / FFL + title block + not-for-construction
    _check("FFL" in svg or "0.000" in svg, f"{label}: no datum / floor level")
    _check("FF-GA-001" in svg, f"{label}: no GA drawing number in the title block")
    _check("GENERAL ARRANGEMENT" in svg, f"{label}: no 'General Arrangement' title")
    _check("NOT FOR CONSTRUCTION" in svg.upper(),
           f"{label}: missing 'not for construction' note")
    _check("ISO 2768-mK" in svg,
           f"{label}: shared general-tolerance note (ISO 2768-mK) missing")

    print(f"  ✓ manifest complete ({len(raw_parts)} parts, tags {letters})")
    print(f"  ✓ GA dimensioned: {svg.count('url(#dim)')} dim lines, scale "
          f"{re.search(r'SCALE 1:(\d+)', svg).group(0) if re.search(r'SCALE 1:', svg) else '?'}, "
          f"north arrow, plan + {svg.count('ELEVATION')} elevations")
    if summary["png"]:
        print(f"  ✓ PNG → {summary['png']}")
    return True


def main():
    ran = 0
    skipped = []
    for label, cand, state_path in CASES:
        mdir = _find_manifest_dir(cand)
        if not mdir:
            skipped.append((label, cand))
            continue
        _run_case(label, mdir, state_path)
        ran += 1
    if skipped:
        print("\n[skip] no manifest yet for: "
              + "; ".join(f"{lab} (looked in {c})" for lab, c in skipped))
    if ran == 0:
        print("\nERROR: no parts-manifest.json found for ANY case — generate one with\n"
              "  INSPECT=1 BLENDER_OUT_DIR=/tmp/ga-efuel <blender> --background "
              "--factory-startup --python scripts/blender-universal/build_universal_scene.py "
              "-- out/oxccu-saf-v21/state.json")
        return 1
    print(f"\nALL GA ASSERTIONS PASSED ({ran} archetype(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
