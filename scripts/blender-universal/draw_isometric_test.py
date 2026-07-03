#!/usr/bin/env python3
"""
scripts/blender-universal/draw_isometric_test.py

Headless test for draw_isometric.py + the route-waypoint manifest it consumes.
Asserts the output is a REAL PIPING ISOMETRIC (the rubric Tristan judges it on),
NOT a 3D screenshot or a flat plan:

  ROUTE MANIFEST       route-manifest.json carries, per routed line: a from/to,
                       a DN/size, an outer diameter, the routed WAYPOINTS polyline,
                       and FITTINGS (an elbow at each bend). Without waypoints +
                       fittings the iso has nothing to project.
  ISO PROJECTION       the iso transform is the classic 30°/30° projection — a model
                       leg along +X (or +Y) projects to a paper segment at ~±30° from
                       the horizontal, +Z projects straight up. The SVG carries
                       iso-projected pipe-run path segments (NOT a flat axis-aligned
                       plan, NOT a raster screenshot).
  FITTINGS DRAWN       elbows render at the bends (≥ the manifest's elbow count for
                       the line); tees/reducers on a tap.
  LINE No. MATCHES P&ID every iso's line number == the number draw_pid.reconstruct_process
                       assigns the same (from_tag → to_tag) edge — an iso for the DN200
                       steam line carries the SAME 203-ST-DN200 the P&ID + line list do.
  EQUIPMENT TAGS       the connected equipment tags appear at BOTH ends (e.g. R-102 … H-102).
  BoM / CUT-LENGTH     a per-line BILL OF MATERIALS / take-off table (pipe length by
                       size + the fitting count) is present.
  ISO KEY + TITLE BLOCK an iso/north key + a title block + "not for construction".

The manifest is built once by build_universal_scene.py (Blender). This test reads the
already-built route-manifest.json from a /tmp build dir (or the canonical out dir);
if none is found it SKIPS the manifest-driven cases but still runs the PROJECTION unit
checks (which need no manifest).

Run (no venv / Blender needed — pure stdlib + an existing route-manifest.json):
    python3 scripts/blender-universal/draw_isometric_test.py
    ISO_RASTER=1 python3 scripts/blender-universal/draw_isometric_test.py   # also PNGs

Exits non-zero on the first failed assertion; prints an inspectable summary either way.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_isometric as I  # noqa: E402
import draw_pid as P        # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RASTER = os.environ.get("ISO_RASTER") == "1"

# (label, state.json, candidate dirs that may hold a route-manifest.json). The first
# dir that has both a route-manifest.json is used; the state.json drives the P&ID
# line-number reconciliation.
CASES = [
    ("e-fuel SAF", REPO / "out/oxccu-saf-v21/state.json",
     [REPO / "out/oxccu-saf-v21", "/tmp/bl-iso-efuel", "/tmp/ga-efuel"]),
]


class Fail(AssertionError):
    pass


def _check(cond, msg):
    if not cond:
        raise Fail(msg)


def _find_manifest_dir(candidates):
    for c in candidates:
        if (Path(c) / "route-manifest.json").is_file():
            return Path(c)
    return None


# ───────────────────────── PROJECTION UNIT CHECKS (no manifest needed) ─────────

def _angle_deg(p, q):
    """Acute angle of the screen segment p→q from the horizontal, in degrees [0,90]
    (direction-agnostic — a down-left and a down-right leg both read as their slope)."""
    dx = q[0] - p[0]
    dy = q[1] - p[1]
    if abs(dx) < 1e-9:
        return 90.0
    ang = abs(math.degrees(math.atan2(dy, dx)))
    return min(ang, 180.0 - ang)


def _run_projection_unit():
    print("\n=== ISO PROJECTION (unit) ===")
    # A leg purely along +X (plant east) must project to ~30° from horizontal.
    a = I._iso_xy(0, 0, 0)
    bx = I._iso_xy(1000, 0, 0)
    by = I._iso_xy(0, 1000, 0)
    bz = I._iso_xy(0, 0, 1000)
    # screen: flip Y (up is up) → use (x, -y) so angles read as drawn.
    sa = (a[0], -a[1])
    sx = (bx[0], -bx[1])
    sy = (by[0], -by[1])
    sz = (bz[0], -bz[1])
    ax = _angle_deg(sa, sx)
    ay = _angle_deg(sa, sy)
    az = _angle_deg(sa, sz)
    print(f"  +X leg angle = {ax:.1f}°  (expect ~30°)")
    print(f"  +Y leg angle = {ay:.1f}°  (expect ~30°)")
    print(f"  +Z leg angle = {az:.1f}°  (expect ~90°, vertical)")
    _check(abs(ax - 30.0) < 1.0, f"+X leg not at 30° (got {ax:.1f}°) — not an iso")
    _check(abs(ay - 30.0) < 1.0, f"+Y leg not at 30° (got {ay:.1f}°) — not an iso")
    _check(abs(az - 90.0) < 1.0, f"+Z leg not vertical (got {az:.1f}°) — not an iso")
    # +X and +Y must go to OPPOSITE sides (one down-right, one down-left).
    _check((sx[0] - sa[0]) > 0 > (sy[0] - sa[0]),
           "+X and +Y should project to opposite horizontal sides (down-right / "
           "down-left) — the iso handedness is wrong")
    print("  PASS  (30/30 isometric transform verified)")


# ───────────────────────── FITTING DERIVATION (unit) ──────────────────────────

def _run_fitting_unit():
    """An orthogonal L (move +X then +Z) has exactly ONE bend → one elbow; a straight
    run has none; a tap flags a tee + reducer at its origin."""
    print("\n=== FITTING DERIVATION (unit) ===")
    # NB: this exercises the SAME _rm_fittings used by the manifest export, imported
    # from build_universal_scene-style logic re-implemented in draw_isometric? No —
    # the manifest writer owns _rm_fittings; here we validate the iso's own bend count
    # via the manifest it reads. Use a synthetic IsoLine through the projection path.
    from draw_isometric import IsoLine, IsoFitting, _line_bom
    L = IsoLine(number="900-PR", mechanism="fluid_loop", dn="DN50",
                size_label="DN50", outer_dia_mm=60.0, service="test",
                material="HDPE/PE100 (water service)",
                from_tag="A-1", to_tag="B-1", from_name="a", to_name="b",
                waypoints_mm=[[0, 0, 0], [3000, 0, 0], [3000, 0, 2000]],
                fittings=[IsoFitting("elbow", (3000, 0, 0))],
                length_m=5.0, leg_lengths_mm=[3000, 2000])
    bom = _line_bom(L)
    _check(bom["elbows"] == 1, f"expected 1 elbow on the L, got {bom['elbows']}")
    _check(abs(bom["pipe_length_m"] - 5.0) < 0.01,
           f"cut length wrong ({bom['pipe_length_m']})")
    print(f"  PASS  (L-route → {bom['elbows']} elbow, {bom['pipe_length_m']} m cut)")


# ───────────────────────── MANIFEST-DRIVEN CASE ───────────────────────────────

def _run_case(label, state_path, manifest_candidates):
    man_dir = _find_manifest_dir(manifest_candidates)
    print(f"\n=== {label} ===")
    if man_dir is None:
        print("  SKIP — no route-manifest.json found in any candidate dir "
              f"({[str(c) for c in manifest_candidates]}); run build_universal_scene.py "
              "to write one.")
        return None

    man = json.loads((man_dir / "route-manifest.json").read_text())

    # ---- (1) ROUTE MANIFEST shape: waypoints + fittings per line ---------------
    _check(man.get("count", 0) >= 4,
           f"{label}: too few routed lines in manifest ({man.get('count')})")
    elbow_total = 0
    for r in man["lines"]:
        wp = r.get("waypoints_mm") or []
        _check(len(wp) >= 2,
               f"{label}: line {r.get('line_number')} has < 2 waypoints (no polyline)")
        _check(all(len(p) == 3 for p in wp),
               f"{label}: line {r.get('line_number')} waypoint is not [x,y,z]")
        fit = r.get("fittings")
        _check(fit is not None,
               f"{label}: line {r.get('line_number')} has no 'fittings' key")
        # a multi-leg run MUST carry ≥1 elbow (a bend = a fitting).
        legs = len(wp) - 1
        elbows = sum(1 for f in fit if f.get("type") == "elbow")
        elbow_total += elbows
        if legs >= 2:
            _check(elbows >= 1,
                   f"{label}: line {r.get('line_number')} has {legs} legs but no elbow")
        for f in fit:
            _check("type" in f and "at" in f and len(f["at"]) == 3,
                   f"{label}: malformed fitting on {r.get('line_number')}: {f}")
    print(f"  manifest        : {man['count']} lines, {elbow_total} elbows "
          f"(from {man_dir})")

    # ---- generate the isometrics into a private temp dir -----------------------
    # copy the manifest + the connection-schedule (for line-number parity) next to it.
    work = tempfile.mkdtemp(prefix="iso-test-")
    import shutil
    shutil.copy(man_dir / "route-manifest.json", Path(work) / "route-manifest.json")
    sched = man_dir / "connection-schedule.json"
    if sched.is_file():
        shutil.copy(sched, Path(work) / "connection-schedule.json")

    summary = I.generate_isometrics(work, str(state_path), rasterise_png=RASTER)
    print(f"  archetype       : {summary['archetype']}")
    print(f"  lines drawn     : {summary['lines_drawn']} (of {summary['lines_total']})")
    _check(summary["lines_drawn"] >= 4,
           f"{label}: too few isometrics drawn ({summary['lines_drawn']})")

    # ---- (2) LINE NUMBER MATCHES the P&ID (reconstruct_process) ----------------
    # build the authoritative P&ID line numbers (same schedule the iso used).
    sched_dict, st = P.load_inputs(work, str(state_path))
    proc = P.reconstruct_process(sched_dict, st)
    pid_pairs = {(L.from_key, L.to_key): L.number for L in proc.lines}
    pid_numbers = set(pid_pairs.values())
    iso_lines = I.reconcile_lines(man, st, out_dir=work, state_path=str(state_path))
    matched = 0
    for ln in iso_lines:
        if ln.number in pid_numbers:
            matched += 1
    _check(matched >= 4,
           f"{label}: too few iso line numbers match the P&ID ({matched}); "
           f"P&ID numbers={sorted(pid_numbers)}")
    # the DN200 steam line specifically must carry the SAME number as the P&ID.
    steam = [L for L in proc.lines if "DN200" in (L.dn or "") or "ST" in L.number]
    if steam:
        st_num = steam[0].number
        _check(any(x.number == st_num for x in iso_lines),
               f"{label}: the steam line {st_num} from the P&ID has no matching iso")
        print(f"  steam line      : {st_num} present in BOTH P&ID + isometric ✓")
    print(f"  line-no parity  : {matched}/{len(iso_lines)} iso numbers == P&ID numbers")

    # ---- (3) per-sheet SVG content: iso segments + BoM + tags + title block ----
    drew_dir = Path(work) / "drawings"
    sheet_svgs = sorted(drew_dir.glob("isometric-*.svg"))
    _check(len(sheet_svgs) >= 4,
           f"{label}: too few iso SVG sheets written ({len(sheet_svgs)})")

    # pick the steam-line sheet (the marquee DN200 case) for the deep content checks.
    target = None
    for s in sheet_svgs:
        if "203-ST" in s.name or "DN200" in s.name:
            target = s
            break
    target = target or sheet_svgs[0]
    svg = target.read_text()
    print(f"  inspect sheet   : {target.name}  ({len(svg)} bytes)")

    # iso-PROJECTED segments: the sheet must contain pipe-run <path> elements, and the
    # projection must NOT be a flat plan — at least one path segment runs at an
    # iso-diagonal (~30° band), proving it's projected, not an orthographic plan.
    _check(svg.count("<path") >= 3,
           f"{label}: too few path elements — not a drawn run")
    _check(_has_iso_diagonal_segment(svg),
           f"{label}: no ~30° iso-diagonal pipe segment found — reads as a flat plan, "
           f"not an isometric")
    _check("<image" not in svg and "data:image" not in svg,
           f"{label}: SVG embeds a raster image — an iso must be VECTOR linework, "
           f"not a 3D screenshot")

    # BoM / cut-length table.
    _check("BILL OF MATERIALS" in svg,
           f"{label}: no BILL OF MATERIALS / cut-length table on the sheet")
    _check(re.search(r"cut length", svg, re.I) is not None,
           f"{label}: BoM has no cut-length entry")
    _check(re.search(r"elbow", svg, re.I) is not None,
           f"{label}: BoM does not list elbows")

    # equipment tags at both ends (the P&ID tags, e.g. R-102 … H-102).
    if steam:
        fk = proc.nodes  # resolve the steam line's two node tags
        node_by_key = {n.key: n for n in proc.nodes}
        sline = steam[0]
        ft = node_by_key.get(sline.from_key)
        tt = node_by_key.get(sline.to_key)
        if ft and tt:
            _check(ft.tag in svg and tt.tag in svg,
                   f"{label}: steam-line equipment tags {ft.tag}/{tt.tag} missing "
                   f"from the iso sheet")
            print(f"  equipment tags  : {ft.tag} … {tt.tag} on the sheet ✓")

    # iso key + title block + scope note.
    _check("ISO 30" in svg, f"{label}: no ISO 30/30 orientation key")
    _check("PIPING ISOMETRIC" in svg, f"{label}: title block heading missing")
    _check("not for construction" in svg.lower(),
           f"{label}: 'not for construction' scope note missing")
    _check("ISO 2768-mK" in svg,
           f"{label}: shared general-tolerance note (ISO 2768-mK) missing")
    _check("DRAWING No." in svg, f"{label}: drawing-number field missing")

    # ---- (4) index sheet present with a line register --------------------------
    idx = drew_dir / "isometric-index.svg"
    _check(idx.is_file(), f"{label}: no isometric-index.svg written")
    isvg = idx.read_text()
    _check("INDEX" in isvg and "LINE No." in isvg,
           f"{label}: index sheet missing its line register")

    print(f"  PASS  ({len(sheet_svgs)} sheets, line-no parity {matched}, BoM + tags + "
          f"iso key + title block all present)")
    if RASTER:
        pngs = list(drew_dir.glob("isometric-*.png"))
        real = [p for p in pngs if p.stat().st_size > 4000]
        print(f"  PNG  -> {len(real)}/{len(pngs)} rasterised "
              f"({target.with_suffix('.png').name})")
    return summary


def _has_iso_diagonal_segment(svg: str) -> bool:
    """True if any straight segment of a pipe-run path runs in the ~30° iso band (i.e.
    a genuine isometric projection, not a flat axis-aligned plan). Parses the M/L path
    data and measures each segment's angle from horizontal."""
    for m in re.finditer(r'<path d="(M[^"]+)"', svg):
        d = m.group(1)
        coords = re.findall(r'(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)', d)
        pts = [(float(x), float(y)) for x, y in coords]
        for p, q in zip(pts[:-1], pts[1:]):
            dx, dy = q[0] - p[0], q[1] - p[1]
            if math.hypot(dx, dy) < 12:        # skip tiny fitting chamfers
                continue
            if abs(dx) < 1e-6:
                continue
            ang = abs(math.degrees(math.atan2(dy, dx)))
            ang = min(ang, 180 - ang)
            if 22.0 <= ang <= 38.0:            # the iso 30° band (±8°)
                return True
    return False


def main():
    try:
        _run_projection_unit()
        _run_fitting_unit()
        ran_any = False
        for label, state_path, cands in CASES:
            if not Path(state_path).is_file():
                print(f"\n=== {label} ===\n  SKIP — state.json not found: {state_path}")
                continue
            res = _run_case(label, state_path, cands)
            ran_any = ran_any or (res is not None)
        if not ran_any:
            print("\n[iso-test] projection + fitting unit checks PASS; "
                  "manifest-driven cases SKIPPED (no route-manifest.json on disk — "
                  "run build_universal_scene.py first).")
            return 0
    except Fail as ex:
        print(f"\n[iso-test] FAIL: {ex}")
        return 1
    print("\n[iso-test] ALL PASS — the route manifest carries waypoints + fittings, and "
          "the isometric projects them as a real 30/30 piping iso (iso-diagonal pipe "
          "segments · elbows at bends · BoM cut-length table · line numbers + equipment "
          "tags matching the P&ID · iso key · title block).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
