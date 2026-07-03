#!/usr/bin/env python3
"""draw_isometric.py — UNIVERSAL PIPING ISOMETRIC drawing generator.

The LAST drawing of the engineering set (after the SLD, P&ID and GA). Same contract
as draw_pid.py / draw_ga.py: it does NOT recompute anything and it does NOT touch
build_universal_scene.py — it CONSUMES that generator's ROUTE-WAYPOINT export
(route-manifest.json) + the archetype state, and PROJECTS each MAJOR routed line
into a standard PIPING ISOMETRIC: the run drawn in the classic 30°/30° isometric
projection, with the bends drawn as fitting symbols, the line number + DN + service
labelled, the connected EQUIPMENT TAGS at each end, running coordinate / dimension
annotations at the bends, a north / iso key, a title block, and a per-line BILL OF
MATERIALS / cut-length table (pipe length by size + the fitting count).

WHY isometrics matter: a P&ID shows WHAT connects to what; a GA shows WHERE the kit
sits; the isometric shows HOW each individual line is actually run + cut + fabricated
— the spool drawing a pipe fitter works from. Reusing the routed orthogonal polyline
means the iso is the SAME geometry the model placed (not a re-guess).

INPUTS (read-only):
  <out>/route-manifest.json   — written by build_universal_scene.py after routing.
        {schema, count, lines:[{line_number, mechanism, from_tag, to_tag, service,
         size_label, outer_dia_mm, length_m, waypoints_mm:[[x,y,z]...],
         fittings:[{type:elbow|tee|reducer, at:[x,y,z]}]}]}.  x = plant length (east),
         y = plant width (north), z = elevation (up); mm.  waypoints_mm is the exact
         routed orthogonal polyline; an elbow sits at every bend.
  <state.json>                — the archetype state.  Used ONLY to run draw_pid's
        reconstruct_process() so the iso's line number + the two end EQUIPMENT TAGS
        match the P&ID + the line list EXACTLY (an iso for '203-ST-DN200' carries the
        same number + the same R-102 / H-102 tags the P&ID drew).  Auto-discovered
        next to the manifest if not given.

PIPELINE:
  1. load_manifest()        — read route-manifest.json + the line list.
  2. reconcile_lines()      — run draw_pid.reconstruct_process(); match each manifest
        route to its P&ID Line by (from_tag, to_tag) so the iso re-uses the AUTHORITATIVE
        line number + the resolved equipment tags at both ends.  Pick the MAJOR lines
        (largest bore first) to draw.
  3. project_iso()          — project each waypoint to paper via the standard 30/30
        isometric transform (x→down-right, y→down-left, z→up); derive the per-line
        cut-length BoM (pipe length by DN + fitting counts) from the polyline + fittings.
  4. build_isometric_svg()  — draw one or more lines per sheet: each run as iso-projected
        pipe segments (double-line for the big bore), elbows / tees / reducers as fitting
        symbols at the bends, the equipment-tag flags at each end, running ISO dimension
        ticks along the legs, an iso/north key, a per-line BoM table, a title block +
        "not for construction".
  5. rasterise()            — SVG → PNG (cairosvg → rsvg-convert → headless Chrome).

OUTPUTS:
  <out>/drawings/isometric-<lineno>.svg
  <out>/drawings/isometric-<lineno>.png
  <out>/drawings/isometric-index.svg + .png   (a key sheet listing every line drawn)

Run:
  python3 scripts/blender-universal/draw_isometric.py /tmp/bl-iso-efuel \
      out/oxccu-saf-v21/state.json
  python3 scripts/blender-universal/draw_isometric.py /tmp/ga-bess

Pure Python stdlib + (optional) a rasteriser on PATH.  No Blender import.  Imports
draw_pid (sibling module) for reconstruct_process + the shared rasterise cascade.
"""
from __future__ import annotations

import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Sibling module — for reconstruct_process() (line-number + equipment-tag consistency)
# and the shared rasterise cascade / chrome finder. Same directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import draw_pid  # noqa: E402
import drawing_titleblock as _tb  # noqa: E402  (shared REV — iso has no DATE row)


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — a projected piping line
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class IsoFitting:
    """One fitting on a line (an elbow at a bend, a tee at a trunk tap, a reducer)."""
    kind: str                 # 'elbow' | 'tee' | 'reducer'
    at_mm: tuple               # (x, y, z) model coords, mm


@dataclass
class IsoLine:
    """One routed line projected into the isometric, with its cut-length BoM."""
    number: str               # AUTHORITATIVE P&ID line number (reconstruct_process)
    mechanism: str
    dn: str                   # 'DN200' / '' (electrical bus has no DN)
    size_label: str           # full size text, e.g. 'DN200' or '8×400 mm²'
    outer_dia_mm: Optional[float]
    service: str              # humanised service description
    material: str             # pipe material (HDPE/PE100 · 316L · carbon steel) from manifest
    from_tag: str             # equipment tag at the source end, e.g. 'R-102'
    to_tag: str               # equipment tag at the target end, e.g. 'H-102'
    from_name: str            # source equipment human name
    to_name: str              # target equipment human name
    waypoints_mm: list        # [[x,y,z], ...] the routed orthogonal polyline (mm)
    fittings: list[IsoFitting] = field(default_factory=list)
    length_m: float = 0.0     # total cut length of the run (m)
    leg_lengths_mm: list = field(default_factory=list)   # per-segment lengths (mm)


# ═══════════════════════════════════════════════════════════════════════════
# INPUT LOADING
# ═══════════════════════════════════════════════════════════════════════════

def load_manifest(out_dir: str, manifest_path: Optional[str] = None):
    """Read route-manifest.json from out_dir (or an explicit path)."""
    p = Path(manifest_path) if manifest_path else Path(out_dir) / "route-manifest.json"
    if not p.is_file():
        raise FileNotFoundError(
            f"no route-manifest.json in {out_dir} (run build_universal_scene.py with "
            f"BLENDER_OUT_DIR={out_dir} first — it writes the route manifest after "
            f"routing; ensure ROUTE_SKIP_MANIFEST is NOT set)")
    with open(p) as fh:
        man = json.load(fh)
    return man


def _humanise_service(mc: str) -> str:
    if not mc:
        return ""
    s = mc.replace("_", " ").strip()
    s = re.sub(r"\s+", " ", s)
    return s[:1].upper() + s[1:] if s else s


# ═══════════════════════════════════════════════════════════════════════════
# LINE RECONCILIATION — match each manifest route to its P&ID Line for the
# AUTHORITATIVE line number + the resolved equipment tags at both ends.
# ═══════════════════════════════════════════════════════════════════════════

def reconcile_lines(man: dict, state: dict,
                    out_dir: Optional[str] = None,
                    state_path: Optional[str] = None) -> list[IsoLine]:
    """Build IsoLine objects from the manifest routes, re-using draw_pid's
    reconstruct_process() so every iso carries the SAME line number + the SAME
    equipment tags the P&ID + line list use.  Each manifest route is matched to a
    P&ID Line by its (from_tag → to_tag) topology keys; an unmatched route (a derived
    fan-out leg with no topology edge) keeps the manifest's own best-effort number +
    humanised endpoint names so it still draws.

    CRITICAL for number consistency: reconstruct_process must see the SAME
    connection-schedule.json the P&ID does (draw_pid.load_inputs reads it from out_dir),
    because the DN suffix on the line number (…-DN200) comes from the schedule's sized
    DN — without it the fallback flow-banded DN diverges from the P&ID's number."""
    # Load the schedule exactly as draw_pid's own generate_pid does, so the
    # reconstructed line numbers byte-match the P&ID + the line list.
    try:
        schedule, _state = draw_pid.load_inputs(out_dir or "", state_path)
        if _state:
            state = _state
    except Exception:
        schedule = {}
    try:
        proc = draw_pid.reconstruct_process(schedule, state)
    except Exception:
        proc = None

    node_by_key = {}
    line_by_pair = {}
    if proc is not None:
        node_by_key = {n.key: n for n in proc.nodes}
        for L in proc.lines:
            line_by_pair[(L.from_key, L.to_key)] = L

    out: list[IsoLine] = []
    for r in (man.get("lines") or []):
        frm = r.get("from_tag")
        to = r.get("to_tag")
        wp = [[float(c) for c in p] for p in (r.get("waypoints_mm") or [])]
        if len(wp) < 2:
            continue   # a degenerate run with no drawable polyline
        fittings = [IsoFitting(kind=f.get("type", "elbow"),
                               at_mm=tuple(float(c) for c in (f.get("at") or [0, 0, 0])))
                    for f in (r.get("fittings") or [])]

        pid_line = line_by_pair.get((frm, to))
        if pid_line is not None:
            number = pid_line.number               # AUTHORITATIVE (matches the P&ID)
            dn = pid_line.dn or _dn_of(r.get("size_label"))
            service = pid_line.service or _humanise_service(r.get("service"))
        else:
            number = r.get("line_number") or "(unnumbered)"
            dn = _dn_of(r.get("size_label"))
            service = _humanise_service(r.get("service"))

        fn = node_by_key.get(frm)
        tn = node_by_key.get(to)
        from_tag = fn.tag if fn else _fallback_tag(frm)
        to_tag = tn.tag if tn else _fallback_tag(to)
        from_name = fn.label if fn else _humanise_service(frm)
        to_name = tn.label if tn else _humanise_service(to)

        leg_lengths = [_dist3(wp[k], wp[k + 1]) for k in range(len(wp) - 1)]
        total_mm = sum(leg_lengths)

        out.append(IsoLine(
            number=number, mechanism=r.get("mechanism") or "",
            dn=dn, size_label=r.get("size_label") or dn or "",
            outer_dia_mm=r.get("outer_dia_mm"),
            service=service, material=r.get("material") or "",
            from_tag=from_tag, to_tag=to_tag,
            from_name=from_name, to_name=to_name,
            waypoints_mm=wp, fittings=fittings,
            length_m=round(total_mm / 1000.0, 2),
            leg_lengths_mm=leg_lengths))
    return out


def _dn_of(size_label) -> str:
    m = re.search(r"\bDN\s?(\d+)\b", str(size_label or ""), re.I)
    return "DN" + m.group(1) if m else ""


def _fallback_tag(key) -> str:
    """A readable short tag for an endpoint with no resolved P&ID node (a header /
    abstract supply): the key's initials, e.g. electrical_supply → 'ES'."""
    if not key:
        return "?"
    toks = [t for t in re.split(r"[_\s]+", str(key)) if t]
    return ("".join(t[0] for t in toks[:3]) or key[:3]).upper()


def _dist3(a, b) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def pick_major_lines(lines: list[IsoLine], max_lines: Optional[int] = None) -> list[IsoLine]:
    """Order lines so the MAJOR ones (largest bore, then longest run) come first, and
    cap to max_lines if given.  Process / thermal pipe lines rank ahead of electrical
    buses (an iso is a PIPING drawing — the cable trunk is shown only if asked)."""
    def _bore(ln: IsoLine) -> float:
        if ln.outer_dia_mm:
            return float(ln.outer_dia_mm)
        m = re.search(r"\d+", ln.dn or "")
        return float(m.group(0)) if m else 0.0

    def _key(ln: IsoLine):
        is_pipe = 0 if ln.mechanism == "electrical_bus" else 1
        return (is_pipe, _bore(ln), ln.length_m)

    ordered = sorted(lines, key=_key, reverse=True)
    if max_lines is not None:
        ordered = ordered[:max_lines]
    return ordered


# ═══════════════════════════════════════════════════════════════════════════
# ISOMETRIC PROJECTION — the classic 30°/30° transform
# ═══════════════════════════════════════════════════════════════════════════
#
# Standard piping-isometric projection: the three plant axes appear at 30° (the two
# horizontal axes, sloping down from the horizontal) and 90° (vertical, up).  Mapping
# plant (x = length / east, y = width / north, z = up):
#       paper_X =  (x - y) * cos(30°)
#       paper_Y =  (x + y) * sin(30°) - z          (paper Y grows DOWNWARD on screen)
# so +x runs DOWN-RIGHT, +y runs DOWN-LEFT, +z runs straight UP — the canonical iso a
# pipe fitter reads.  We project in model mm then scale + flip Y to screen px.

_COS30 = math.cos(math.radians(30.0))
_SIN30 = math.sin(math.radians(30.0))


def _iso_xy(x_mm, y_mm, z_mm):
    """Project a model point (mm) to ISO paper coordinates (mm, pre-scale). Returns
    (iso_x, iso_y) where iso_y grows UPWARD (we flip to screen later)."""
    iso_x = (x_mm - y_mm) * _COS30
    iso_y = (x_mm + y_mm) * _SIN30 - z_mm      # up is +; flipped at draw time
    return iso_x, iso_y


def _project_line(ln: IsoLine):
    """Project a line's waypoints + fittings into ISO paper coords (mm). Returns
    (iso_pts, iso_fittings, bounds) — bounds = (minx, miny, maxx, maxy)."""
    iso_pts = [_iso_xy(*p) for p in ln.waypoints_mm]
    iso_fit = [(f, _iso_xy(*f.at_mm)) for f in ln.fittings]
    xs = [p[0] for p in iso_pts] + [pt[0] for _f, pt in iso_fit]
    ys = [p[1] for p in iso_pts] + [pt[1] for _f, pt in iso_fit]
    bounds = (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 1, 1)
    return iso_pts, iso_fit, bounds


# ═══════════════════════════════════════════════════════════════════════════
# CUT-LENGTH BoM — pipe length by DN + fitting counts, per line
# ═══════════════════════════════════════════════════════════════════════════

def _line_bom(ln: IsoLine) -> dict:
    """The per-line cut-length / take-off: pipe length at the line's DN + a count of
    each fitting kind.  A standard iso carries this so the spool can be cut + costed."""
    counts = {"elbow": 0, "tee": 0, "reducer": 0}
    for f in ln.fittings:
        counts[f.kind] = counts.get(f.kind, 0) + 1
    return {
        "dn": ln.dn or ln.size_label,
        "pipe_length_m": ln.length_m,
        "elbows": counts.get("elbow", 0),
        "tees": counts.get("tee", 0),
        "reducers": counts.get("reducer", 0),
        "flanges": 2,   # one at each equipment connection (standard take-off assumption)
    }


# ═══════════════════════════════════════════════════════════════════════════
# SVG primitives — identical palette + builder to the P&ID / GA
# ═══════════════════════════════════════════════════════════════════════════

INK = "#1a1a1a"            # primary line / text
EQ_INK = "#10243e"         # equipment outline (deep navy)
EQ_FILL = "#eef2f7"        # equipment body fill
PIPE_INK = "#10243e"       # process pipe (navy)
THERMAL_INK = "#b5462a"    # thermal / steam pipe (warm)
UTIL_INK = "#7a8290"       # utility / electrical (grey)
DIM_INK = "#1a5fb4"        # dimension lines / coordinate annotations (blue)
ACCENT = "#1a5fb4"
FIT_FILL = "#dfe6ef"       # fitting body fill
FILL_BG = "#ffffff"        # page
PANEL_BG = "#f4f6f9"       # title-block / key fill
GRID_FAINT = "#e4e8ee"     # faint guide
DATUM_INK = "#9aa3af"      # datum / centre-line grey
MUTED = "#5b6470"


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    """Tiny imperative SVG builder (deterministic) — same primitives as the P&ID/GA."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.4, dash=None, cap="round"):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" stroke-linecap="{cap}"{d}/>')

    def rect(self, x, y, w, h, stroke=INK, width=1.3, fill="none", rx=0):
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')

    def circle(self, cx, cy, r, stroke=INK, width=1.4, fill="none"):
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{width}"/>')

    def path(self, d, stroke=INK, width=1.4, fill="none", join="round", cap="round"):
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
                 f'stroke-linejoin="{join}" stroke-linecap="{cap}"/>')

    def text(self, x, y, s, size=11, anchor="start", fill=INK, weight="normal",
             family="Helvetica, Arial, sans-serif", mono=False, spacing=None,
             rotate=None):
        fam = "'DejaVu Sans Mono', 'Menlo', monospace" if mono else family
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        tr = f' transform="rotate({rotate} {x:.1f} {y:.1f})"' if rotate is not None else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" '
                 f'font-size="{size}" text-anchor="{anchor}" fill="{fill}" '
                 f'font-weight="{weight}"{sp}{tr}>{_esc(s)}</text>')

    def render(self) -> str:
        defs = (
            '<defs>'
            f'<marker id="iflow" markerWidth="11" markerHeight="11" refX="8" refY="4" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L9,4 L0,8 Z" fill="{PIPE_INK}"/></marker>'
            f'<marker id="idim" markerWidth="10" markerHeight="10" refX="5" refY="4" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,4 L9,1 L7,4 L9,7 Z" fill="{DIM_INK}"/></marker>'
            '</defs>')
        body = "\n".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n{defs}\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


# ═══════════════════════════════════════════════════════════════════════════
# ISO axis key + fitting / equipment symbols
# ═══════════════════════════════════════════════════════════════════════════

def _mech_pipe_colour(mech: str) -> str:
    if mech == "thermal":
        return THERMAL_INK
    if mech == "electrical_bus":
        return UTIL_INK
    return PIPE_INK


def iso_key(svg: SVG, cx, cy, r=30):
    """The ISO / orientation key: the three model axes drawn in the 30/30 projection
    with N (north = +Y, plant width), E (east = +X, plant length) and UP (+Z) labelled
    — the equivalent of the GA's north arrow for an isometric sheet."""
    def to_scr(vx, vy, vz):
        ix, iy = _iso_xy(vx, vy, vz)
        return cx + ix, cy - iy        # flip Y (up is up)
    o = to_scr(0, 0, 0)
    ex = to_scr(r, 0, 0)               # +X east (down-right)
    ny = to_scr(0, r, 0)               # +Y north (down-left)
    up = to_scr(0, 0, r)               # +Z up
    for end, lbl, col in ((ex, "E", INK), (ny, "N", INK), (up, "UP", INK)):
        svg.add(f'<line x1="{o[0]:.1f}" y1="{o[1]:.1f}" x2="{end[0]:.1f}" '
                f'y2="{end[1]:.1f}" stroke="{col}" stroke-width="1.4" '
                f'marker-end="url(#idim)"/>')
    svg.text(ex[0] + 4, ex[1] + 10, "E", size=9, fill=MUTED, weight="bold")
    svg.text(ny[0] - 10, ny[1] + 10, "N", size=9, fill=MUTED, weight="bold")
    svg.text(up[0], up[1] - 4, "UP", size=9, anchor="middle", fill=MUTED, weight="bold")
    svg.text(cx, cy + r + 16, "ISO 30°/30°", size=8.5, anchor="middle", fill=MUTED)


def _draw_elbow(svg, sx, sy, in_dir, out_dir, col, r=6.5):
    """A 90° elbow at a bend: the standard iso elbow mark — a solid quarter-turn band
    chamfering the corner (stepping back along the incoming leg, arcing across to the
    outgoing leg) + a node dot, so each bend reads clearly as a fitting, not a kink."""
    bx = sx - in_dir[0] * r
    by = sy - in_dir[1] * r
    ax = sx + out_dir[0] * r
    ay = sy + out_dir[1] * r
    # filled quarter-turn wedge (the elbow body) + an outline arc over it.
    svg.path(f"M {bx:.1f} {by:.1f} Q {sx:.1f} {sy:.1f} {ax:.1f} {ay:.1f} "
             f"L {sx:.1f} {sy:.1f} Z", stroke=col, width=1.4, fill=FIT_FILL)
    svg.path(f"M {bx:.1f} {by:.1f} Q {sx:.1f} {sy:.1f} {ax:.1f} {ay:.1f}",
             stroke=col, width=2.2)
    svg.circle(sx, sy, 2.0, stroke=col, width=1.0, fill=col)


def _draw_tee(svg, sx, sy, col):
    """A tee at a trunk tap: a small filled square node (the branch connection mark)."""
    svg.rect(sx - 3.6, sy - 3.6, 7.2, 7.2, stroke=col, width=1.5, fill=FIT_FILL)
    svg.circle(sx, sy, 1.6, stroke=col, width=1.0, fill=col)


def _draw_reducer(svg, sx, sy, leg_dir, col):
    """A concentric reducer mark just downstream of a tee: the standard iso bow-tie /
    trapezoid narrowing along the leg direction."""
    # perpendicular to the leg
    px, py = -leg_dir[1], leg_dir[0]
    x0 = sx + leg_dir[0] * 4.0
    y0 = sy + leg_dir[1] * 4.0
    x1 = sx + leg_dir[0] * 12.0
    y1 = sy + leg_dir[1] * 12.0
    svg.path(f"M {x0 + px*5:.1f} {y0 + py*5:.1f} L {x0 - px*5:.1f} {y0 - py*5:.1f} "
             f"L {x1 - px*3:.1f} {y1 - py*3:.1f} L {x1 + px*3:.1f} {y1 + py*3:.1f} Z",
             stroke=col, width=1.2, fill=FIT_FILL)


def _equip_flag(svg, sx, sy, tag, name, anchor_left=True, sub=""):
    """An equipment-tag FLAG at a line end: a small filled connection square + a leader
    to a boxed equipment tag (bold) with the equipment name beneath — the standard iso
    'connect to <equipment>' callout."""
    # the nozzle connection block
    svg.rect(sx - 4, sy - 4, 8, 8, stroke=EQ_INK, width=1.5, fill=EQ_FILL)
    dx = -1 if anchor_left else 1
    lx = sx + dx * 26
    ly = sy - 24
    svg.line(sx, sy, lx, ly + 9, stroke=EQ_INK, width=1.0)
    # tag box
    tw = max(34, 8 + len(tag) * 7)
    bx = lx - (tw if anchor_left else 0)
    svg.rect(bx, ly - 5, tw, 17, stroke=EQ_INK, width=1.3, fill=PANEL_BG, rx=2)
    svg.text(bx + tw / 2, ly + 7, tag, size=10.5, anchor="middle", weight="bold",
             fill=EQ_INK)
    name_x = bx if anchor_left else bx + tw
    if name:
        for i, l in enumerate(_wrap(name, 22)[:2]):
            svg.text(name_x, ly + 26 + i * 11, l, size=7.6, anchor="start", fill=MUTED)
    if sub:
        svg.text(name_x, ly + 26 + 22, sub, size=7.4, anchor="start", fill=MUTED)


def _wrap(label: str, maxlen=22):
    words = str(label).split()
    out = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= maxlen:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


# ═══════════════════════════════════════════════════════════════════════════
# ONE LINE drawn isometrically  (into a placed panel of the sheet)
# ═══════════════════════════════════════════════════════════════════════════

def _draw_one_iso(svg: SVG, ln: IsoLine, ox, oy, panel_w, panel_h,
                  show_dims=True, title=True):
    """Draw a single line as an isometric spool inside the panel rect (ox,oy,panel_w,
    panel_h).  Returns the scale used (px per model-mm).  Lays the run with the elbows
    as fitting symbols, the equipment-tag flags at both ends, running coordinate
    dimensions on the legs, and a small line label."""
    iso_pts, iso_fit, (minx, miny, maxx, maxy) = _project_line(ln)
    span_x = max(maxx - minx, 1.0)
    span_y = max(maxy - miny, 1.0)

    # leave a margin inside the panel for flags + dim text.
    pad = 64.0
    avail_w = max(panel_w - 2 * pad, 60.0)
    avail_h = max(panel_h - 2 * pad - (22 if title else 0), 60.0)
    sc = min(avail_w / span_x, avail_h / span_y)

    # centre the projected run in the panel.
    draw_w = span_x * sc
    draw_h = span_y * sc
    base_x = ox + (panel_w - draw_w) / 2.0
    base_y = oy + (panel_h - draw_h) / 2.0 + (12 if title else 0)

    def scr(ix, iy):
        # ix,iy are ISO mm (iy up). Flip to screen (y down) + scale + offset.
        return (base_x + (ix - minx) * sc,
                base_y + (maxy - iy) * sc)

    col = _mech_pipe_colour(ln.mechanism)
    pts = [scr(ix, iy) for ix, iy in iso_pts]

    # --- the pipe run, drawn to read as PIPE not a wire ---
    # The bore drives the on-paper pipe width: a true DOUBLE-LINE (two parallel
    # strokes offset ⊥ to each leg) for a fat bore (the classic iso convention), a
    # single heavy line for small bore. The double-line half-offset is the scaled
    # radius, clamped to a readable 2.5–9 px band so a DN200 reads clearly fatter
    # than a DN15 without becoming a slab.
    od = float(ln.outer_dia_mm) if ln.outer_dia_mm else _dn_mm(ln.dn)
    half_px = max(2.5, min(9.0, (od * sc) / 2.0)) if od else 2.5
    big = od >= 90.0
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    if big:
        # two parallel offset rails + thin centre-line = a fat double-line pipe.
        rail_a = _offset_polyline(pts, +half_px)
        rail_b = _offset_polyline(pts, -half_px)
        for rail in (rail_a, rail_b):
            dd = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in rail)
            svg.add(f'<path d="{dd}" fill="none" stroke="{col}" stroke-width="1.6" '
                    f'stroke-linejoin="round" stroke-linecap="round"/>')
        svg.add(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="0.7" '
                f'stroke-linejoin="round" stroke-linecap="round" '
                f'stroke-dasharray="6,4" opacity="0.55" marker-end="url(#iflow)"/>')
    else:
        lw = 2.6 if od >= 40 else 2.0
        svg.add(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{lw}" '
                f'stroke-linejoin="round" stroke-linecap="round" '
                f'marker-end="url(#iflow)"/>')

    # --- running coordinate / dimension annotations on each leg ---
    if show_dims:
        for k in range(len(pts) - 1):
            p, q = pts[k], pts[k + 1]
            seg_mm = ln.leg_lengths_mm[k] if k < len(ln.leg_lengths_mm) else 0.0
            if seg_mm < 200:        # don't clutter with sub-200 mm stubs
                continue
            mx, my = (p[0] + q[0]) / 2.0, (p[1] + q[1]) / 2.0
            # the leg's dominant MODEL axis → annotate which run direction it is.
            ax = _leg_axis(ln.waypoints_mm[k], ln.waypoints_mm[k + 1]) \
                if k + 1 < len(ln.waypoints_mm) else ""
            label = f"{seg_mm/1000:.2f} m" + (f" {ax}" if ax else "")
            svg.text(mx + 6, my - 5, label, size=7.4, fill=DIM_INK, weight="bold")

    # --- fitting symbols at the bends (elbow / tee / reducer) ---
    # map each fitting to its screen point + the local leg directions for orientation.
    for f, (fix, fiy) in iso_fit:
        fx, fy = scr(fix, fiy)
        # find the nearest waypoint index to orient the elbow chamfer.
        idx = _nearest_pt_index(iso_pts, (fix, fiy))
        in_dir = _unit(_sub(pts[idx], pts[idx - 1])) if idx > 0 else (1.0, 0.0)
        out_dir = _unit(_sub(pts[idx + 1], pts[idx])) if idx + 1 < len(pts) \
            else in_dir
        if f.kind == "elbow":
            _draw_elbow(svg, fx, fy, in_dir, out_dir, col,
                        r=max(5.5, min(11.0, half_px + 4.0)))
        elif f.kind == "tee":
            _draw_tee(svg, fx, fy, col)
        elif f.kind == "reducer":
            _draw_reducer(svg, fx, fy, out_dir, col)

    # --- equipment-tag flags at both ends ---
    if pts:
        # source end on the left/upper, target on the right/lower (by screen x).
        src_left = pts[0][0] <= pts[-1][0]
        _equip_flag(svg, pts[0][0], pts[0][1], ln.from_tag, ln.from_name,
                    anchor_left=src_left)
        _equip_flag(svg, pts[-1][0], pts[-1][1], ln.to_tag, ln.to_name,
                    anchor_left=not src_left)

    # --- line label (number + DN + service) above the panel ---
    if title:
        svg.text(ox + 10, oy + 16, ln.number, size=12, weight="bold", fill=col,
                 mono=True)
        meta = (ln.size_label or ln.dn or "").strip()
        if meta:
            svg.text(ox + 10 + 11 * len(ln.number) * 0.62 + 14, oy + 16,
                     f"·  {meta}", size=10, fill=MUTED)
        if ln.service:
            svg.text(ox + 10, oy + 30, _short(ln.service, 64), size=8.5, fill=MUTED)
    return sc


def _leg_axis(a, b) -> str:
    """Which plant direction a leg runs (E/W along x, N/S along y, UP/DN along z)."""
    d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ax = max(range(3), key=lambda i: abs(d[i]))
    if abs(d[ax]) <= 1.0:
        return ""
    if ax == 0:
        return "E" if d[0] > 0 else "W"
    if ax == 1:
        return "N" if d[1] > 0 else "S"
    return "UP" if d[2] > 0 else "DN"


def _nearest_pt_index(pts, target):
    best, bi = 1e18, 0
    for i, p in enumerate(pts):
        dd = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2
        if dd < best:
            best, bi = dd, i
    return bi


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _unit(v):
    m = math.hypot(v[0], v[1]) or 1.0
    return (v[0] / m, v[1] / m)


def _dn_mm(dn: str) -> float:
    """The DN's nominal bore in mm (for the on-paper pipe width when no o/d is known)."""
    m = re.search(r"\d+", str(dn or ""))
    return float(m.group(0)) if m else 0.0


def _offset_polyline(pts, off):
    """Offset a screen polyline by `off` px perpendicular to each leg (the double-line
    rail of a fat pipe). Each vertex moves by the average of its two adjacent legs'
    perpendiculars, so corners stay closed."""
    n = len(pts)
    if n < 2:
        return list(pts)
    perps = []
    for k in range(n - 1):
        dx, dy = pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]
        m = math.hypot(dx, dy) or 1.0
        perps.append((-dy / m, dx / m))
    out = []
    for k in range(n):
        if k == 0:
            px, py = perps[0]
        elif k == n - 1:
            px, py = perps[-1]
        else:
            ax, ay = perps[k - 1]
            bx, by = perps[k]
            sx, sy = ax + bx, ay + by
            m = math.hypot(sx, sy) or 1.0
            px, py = sx / m, sy / m
        out.append((pts[k][0] + px * off, pts[k][1] + py * off))
    return out


def _short(s, maxlen):
    s = str(s).strip()
    return s if len(s) <= maxlen else s[:maxlen - 1] + "…"


# ═══════════════════════════════════════════════════════════════════════════
# PER-LINE BoM / cut-length table panel
# ═══════════════════════════════════════════════════════════════════════════

def _draw_bom_table(svg: SVG, ln: IsoLine, x, y, w):
    """The per-line BILL OF MATERIALS / cut-length take-off: pipe length at the DN +
    the fitting count (elbows / tees / reducers / flanges).  The spool's cut list."""
    bom = _line_bom(ln)
    rows = [
        ("Pipe — " + (bom["dn"] or "line"), f"{bom['pipe_length_m']:.2f} m cut length"),
        ("90° elbows", f"{bom['elbows']} off"),
    ]
    if bom["tees"]:
        rows.append(("Tees (branch)", f"{bom['tees']} off"))
    if bom["reducers"]:
        rows.append(("Reducers", f"{bom['reducers']} off"))
    rows.append(("Flanged connections", f"{bom['flanges']} off (line ends)"))
    if ln.outer_dia_mm:
        rows.append(("Outer diameter", f"{ln.outer_dia_mm:.1f} mm o/d"))

    header_h = 20
    rh = 15.0
    bh = header_h + len(rows) * rh + 8
    svg.rect(x, y, w, bh, stroke=GRID_FAINT, width=1.1, fill=FILL_BG)
    svg.rect(x, y, w, header_h, stroke=GRID_FAINT, width=1.1, fill=PANEL_BG)
    svg.text(x + 8, y + 14, f"BILL OF MATERIALS — {ln.number}", size=9, weight="bold",
             fill=MUTED)
    yy = y + header_h + 12
    for i, (k, v) in enumerate(rows):
        if i:
            svg.line(x, yy - 11, x + w, yy - 11, stroke=GRID_FAINT, width=0.7)
        svg.text(x + 8, yy, k, size=8.2, fill=EQ_INK)
        svg.text(x + w - 8, yy, v, size=8.2, anchor="end", fill=MUTED)
        yy += rh
    return y + bh


# ═══════════════════════════════════════════════════════════════════════════
# SHEET — one line per sheet (full iso + BoM + key + title block)
# ═══════════════════════════════════════════════════════════════════════════

def build_single_line_sheet(ln: IsoLine, archetype: str, idx: int, total: int) -> str:
    width = 1180
    height = 860
    # 166 (was 132): the NFC line at y0+113 used to land BELOW the sheet edge (clipped);
    # +the shared general-tolerance note line (_tb.TOLERANCE_NOTE) at y0+130.
    title_h = 166
    svg = SVG(width, height)
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)

    # header
    svg.text(40, 46, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(40, 70, f"PIPING ISOMETRIC — {draw_pid._humanise(archetype)}",
             size=16, weight="bold", fill=EQ_INK)
    svg.text(40, 90, f"Line {ln.number}   ·   spool isometric projected from the "
                     f"as-routed model (30°/30°).", size=10, fill=MUTED)
    svg.line(40, 104, width - 40, 104, stroke=GRID_FAINT, width=1.2)

    # main iso panel (left ~70%) + right column (key + BoM)
    panel_x = 40
    panel_y = 116
    panel_w = width - 360
    panel_h = height - title_h - panel_y - 16
    svg.rect(panel_x, panel_y, panel_w, panel_h, stroke=GRID_FAINT, width=1.0,
             fill="#fcfdfe")
    _draw_one_iso(svg, ln, panel_x, panel_y, panel_w, panel_h, show_dims=True,
                  title=True)

    # right column
    rx = panel_x + panel_w + 18
    rw = width - rx - 40
    iso_key(svg, rx + 56, panel_y + 56, r=34)
    bom_bottom = _draw_bom_table(svg, ln, rx, panel_y + 120, rw)
    _draw_line_facts(svg, ln, rx, bom_bottom + 14, rw)

    _draw_title_block(svg, archetype, width, height, title_h, line=ln,
                      sheet=(idx, total))
    return svg.render()


def _draw_line_facts(svg, ln: IsoLine, x, y, w):
    """A small facts panel: from → to equipment, service, mechanism."""
    rows = [
        ("From", f"{ln.from_tag}  {_short(ln.from_name, 24)}"),
        ("To", f"{ln.to_tag}  {_short(ln.to_name, 24)}"),
        ("Service", _short(ln.service or "process", 30)),
        ("Mechanism", ln.mechanism or "—"),
    ]
    if ln.material:                                 # pipe material (line-list spec)
        rows.append(("Material", _short(ln.material, 30)))
    rows.append(("Run length", f"{ln.length_m:.2f} m  ({len(ln.waypoints_mm)} pts)"))
    header_h = 20
    rh = 15.0
    bh = header_h + len(rows) * rh + 8
    svg.rect(x, y, w, bh, stroke=GRID_FAINT, width=1.1, fill=FILL_BG)
    svg.rect(x, y, w, header_h, stroke=GRID_FAINT, width=1.1, fill=PANEL_BG)
    svg.text(x + 8, y + 14, "LINE DATA", size=9, weight="bold", fill=MUTED)
    yy = y + header_h + 12
    for i, (k, v) in enumerate(rows):
        if i:
            svg.line(x, yy - 11, x + w, yy - 11, stroke=GRID_FAINT, width=0.7)
        svg.text(x + 8, yy, k, size=8.2, weight="bold", fill=EQ_INK)
        svg.text(x + 64, yy, v, size=8.0, fill=MUTED)
        yy += rh
    return y + bh


# ═══════════════════════════════════════════════════════════════════════════
# INDEX SHEET — a few key lines laid out as thumbnails + a line register
# ═══════════════════════════════════════════════════════════════════════════

def build_index_sheet(lines: list[IsoLine], archetype: str) -> str:
    """A key sheet: a thumbnail iso of each major line in a grid + a line register
    table (number · DN · from → to · cut length · elbows), so the set reads as one."""
    n = len(lines)
    cols = 2 if n <= 4 else 3
    rows_g = max(1, math.ceil(n / cols))
    cell_w = 360
    cell_h = 230
    margin = 40
    # 166 (was 132): the NFC line at y0+113 used to land BELOW the sheet edge (clipped);
    # +the shared general-tolerance note line (_tb.TOLERANCE_NOTE) at y0+130.
    title_h = 166
    reg_h = 28 + min(n, 16) * 16 + 16
    width = margin * 2 + cols * cell_w
    height = (116 + rows_g * cell_h + 24) + reg_h + title_h
    width = max(width, 1100)

    svg = SVG(width, height)
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)
    svg.text(40, 46, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    svg.text(40, 70, f"PIPING ISOMETRICS — INDEX — {draw_pid._humanise(archetype)}",
             size=16, weight="bold", fill=EQ_INK)
    svg.text(40, 90, f"{n} major line isometric(s) projected from the as-routed model "
                     f"(30°/30°). Line numbers + tags match the P&ID.", size=10,
             fill=MUTED)
    svg.line(40, 104, width - 40, 104, stroke=GRID_FAINT, width=1.2)

    gy0 = 116
    for i, ln in enumerate(lines):
        c = i % cols
        r = i // cols
        cx = margin + c * cell_w
        cy = gy0 + r * cell_h
        svg.rect(cx, cy, cell_w - 16, cell_h - 16, stroke=GRID_FAINT, width=1.0,
                 fill="#fcfdfe")
        _draw_one_iso(svg, ln, cx, cy, cell_w - 16, cell_h - 16, show_dims=False,
                      title=True)

    # line register
    reg_y = gy0 + rows_g * cell_h + 8
    _draw_line_register(svg, lines, margin, reg_y, width - 2 * margin)

    iso_key(svg, width - margin - 50, gy0 + 36, r=28)
    _draw_title_block(svg, archetype, width, height, title_h, line=None,
                      sheet=None, is_index=True, n_lines=n)
    return svg.render()


def _draw_line_register(svg, lines, x, y, w):
    """The line register table — every drawn line as a row."""
    header_h = 22
    rh = 16.0
    shown = lines[:16]
    bh = header_h + len(shown) * rh + 10
    svg.rect(x, y, w, bh, stroke=GRID_FAINT, width=1.1, fill=FILL_BG)
    svg.rect(x, y, w, header_h, stroke=GRID_FAINT, width=1.1, fill=PANEL_BG)
    cols = [("LINE No.", 0.0), ("SIZE", 0.13), ("FROM", 0.24),
            ("TO", 0.39), ("SERVICE", 0.54), ("MATERIAL", 0.74), ("CUT L.", 0.89),
            ("ELB.", 0.965)]
    for label, frac in cols:
        svg.text(x + 8 + frac * (w - 16), y + 15, label, size=8.2, weight="bold",
                 fill=MUTED)
    yy = y + header_h + 13
    for ln in shown:
        bom = _line_bom(ln)
        cells = [
            (ln.number, 0.0, True), (ln.size_label or ln.dn, 0.13, False),
            (ln.from_tag, 0.24, False), (ln.to_tag, 0.39, False),
            (_short(ln.service or "process", 20), 0.54, False),
            (_short(ln.material or "—", 20), 0.74, False),
            (f"{bom['pipe_length_m']:.1f} m", 0.89, False),
            (str(bom["elbows"]), 0.965, False),
        ]
        for txt, frac, bold in cells:
            svg.text(x + 8 + frac * (w - 16), yy, _short(txt, 26), size=7.8,
                     weight="bold" if bold else "normal",
                     fill=EQ_INK if bold else MUTED, mono=bold)
        yy += rh


# ═══════════════════════════════════════════════════════════════════════════
# TITLE BLOCK — mirrors the P&ID / GA
# ═══════════════════════════════════════════════════════════════════════════

def _draw_title_block(svg, archetype, width, height, title_h, line: Optional[IsoLine],
                      sheet, is_index=False, n_lines=0):
    y0 = height - title_h + 24
    x0 = 30
    x1 = width - 30
    svg.line(x0, y0, x1, y0, stroke=INK, width=1.6)

    bw = 320
    bx0 = x1 - bw
    by0 = y0 + 14
    if is_index:
        dno = "FF-ISO-000"
    elif line is not None:
        dno = "FF-ISO-" + re.sub(r"[^0-9]", "", line.number.split("-")[0]).zfill(3)
    else:
        dno = "FF-ISO-001"
    sheet_txt = "INDEX" if is_index else (f"{sheet[0]} of {sheet[1]}" if sheet else "—")
    rows = [("DRAWING No.", dno),
            ("SHEET", sheet_txt),
            ("REV", _tb.REV),
            ("SCALE", "NTS  (iso 30°/30°)")]
    rh = 22
    box_h = rh * len(rows)
    svg.rect(bx0, by0, bw, box_h, stroke=INK, width=1.3, fill=FILL_BG)
    for i, (k, v) in enumerate(rows):
        ry = by0 + i * rh
        if i:
            svg.line(bx0, ry, bx0 + bw, ry, stroke=GRID_FAINT, width=1.0)
        svg.line(bx0 + 112, by0, bx0 + 112, by0 + box_h, stroke=GRID_FAINT, width=1.0)
        svg.text(bx0 + 8, ry + 15, k, size=9, fill=MUTED, weight="bold")
        svg.text(bx0 + 120, ry + 15, v, size=9.5)

    svg.text(x0, y0 + 24, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    if is_index:
        svg.text(x0, y0 + 43, f"PIPING ISOMETRICS — INDEX — {draw_pid._humanise(archetype)}",
                 size=15, weight="bold", fill=EQ_INK)
        svg.text(x0, y0 + 61,
                 f"{n_lines} major line isometric(s) · one spool sheet per line · "
                 "30°/30° projection of the as-routed model.", size=9.5, fill=MUTED)
    else:
        ttl = f"PIPING ISOMETRIC — Line {line.number}" if line else "PIPING ISOMETRIC"
        svg.text(x0, y0 + 43, f"{ttl} — {draw_pid._humanise(archetype)}",
                 size=15, weight="bold", fill=EQ_INK)
        sub = (f"{line.size_label or line.dn} · {line.from_tag} → {line.to_tag} · "
               f"{line.length_m:.2f} m run") if line else ""
        svg.text(x0, y0 + 61, sub, size=9.5, fill=MUTED)
    svg.text(x0, y0 + 79,
             "Run + fittings projected from the as-routed orthogonal polyline · "
             "dimensions in metres · line number + tags per the P&ID.", size=9.0,
             fill=MUTED)
    svg.text(x0, y0 + 96,
             "Coordinate dims are run lengths on each leg (E/N/UP) · elbows shown at "
             "each bend · BoM is a cut-length take-off.", size=9.0, fill=MUTED)
    svg.text(x0, y0 + 113,
             "NOT FOR CONSTRUCTION — preliminary auto-generated isometric; verify "
             "against the P&ID + GA + line list before issue.",
             size=9.0, fill="#a4332a", weight="bold")
    # shared general-tolerance note (ONE source of truth: drawing_titleblock.py)
    svg.text(x0, y0 + 130, _tb.TOLERANCE_NOTE, size=8.6, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# ARCHETYPE NAME
# ═══════════════════════════════════════════════════════════════════════════

def _archetype_name(out_dir: str, state_path: Optional[str]) -> str:
    cands = []
    if state_path:
        cands.append(Path(state_path))
    cands.append(Path(out_dir) / "state.json")
    for c in cands:
        if c and c.is_file():
            try:
                with open(c) as fh:
                    st = json.load(fh)
            except Exception:
                continue
            for ck in ("parsedBrief", "engineeringContract", "orchestratorContract"):
                pc = (st.get(ck) or {}).get("product_class") or (
                    st.get(ck) or {}).get("productClass")
                if pc:
                    return str(pc)
            if st.get("projectId"):
                return str(st["projectId"])
    base = Path(out_dir).name
    base = re.sub(r"^(bl-iso|ga|bl-univ|rerun)[-_]", "", base)
    return base or "process_plant"


def _load_state(out_dir: str, state_path: Optional[str]) -> dict:
    cands = []
    if state_path:
        cands.append(Path(state_path))
    cands.append(Path(out_dir) / "state.json")
    for c in cands:
        if c and c.is_file():
            try:
                with open(c) as fh:
                    return json.load(fh)
            except Exception:
                continue
    return {}


# ═══════════════════════════════════════════════════════════════════════════
# RASTERISATION — reuse the P&ID cascade
# ═══════════════════════════════════════════════════════════════════════════

def _svg_dims(svg_text: str):
    mw = re.search(r'<svg[^>]*\bwidth="([\d.]+)"', svg_text)
    mh = re.search(r'<svg[^>]*\bheight="([\d.]+)"', svg_text)
    return (int(math.ceil(float(mw.group(1)))) if mw else 1200,
            int(math.ceil(float(mh.group(1)))) if mh else 800)


def rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
    """SVG → PNG via the SAME cairosvg → rsvg-convert → headless-Chrome cascade the
    P&ID + GA use (delegated to draw_pid for the chrome finder)."""
    svg_text = svg_path.read_text()
    w, h = _svg_dims(svg_text)
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=w * scale, output_height=h * scale,
                         background_color="white")
        if png_path.is_file() and png_path.stat().st_size > 1000:
            return True
    except Exception:
        pass
    rsvg = shutil.which("rsvg-convert")
    if rsvg:
        try:
            subprocess.run([rsvg, "-w", str(w * scale), "-h", str(h * scale),
                            "-b", "white", "-o", str(png_path), str(svg_path)],
                           check=True, capture_output=True, timeout=60)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception:
            pass
    chrome = draw_pid._find_chrome()
    if chrome:
        try:
            # Chrome's file:// loader needs an ABSOLUTE path — a relative out_dir
            # (e.g. out/oxccu-saf-v21) otherwise yields ERR_INVALID_URL and a blank
            # "site can't be reached" PNG. Resolve both paths.
            abs_svg = svg_path.resolve()
            abs_png = png_path.resolve()
            subprocess.run(
                [chrome, "--headless", "--disable-gpu", "--no-sandbox",
                 f"--screenshot={abs_png}",
                 f"--window-size={w},{h}",
                 f"--force-device-scale-factor={scale}",
                 "--default-background-color=FFFFFFFF",
                 "--hide-scrollbars", f"file://{abs_svg}"],
                check=True, capture_output=True, timeout=90)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception as ex:
            print(f"[iso] chrome rasterise failed: {ex}")
    return False


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def generate_isometrics(out_dir: str, state_path: Optional[str] = None,
                        manifest_path: Optional[str] = None,
                        max_lines: Optional[int] = None,
                        rasterise_png: bool = True):
    """Full pipeline: load manifest → reconcile against the P&ID → project → draw one
    iso sheet per major line + an index sheet → write SVG (+ PNG)."""
    man = load_manifest(out_dir, manifest_path)
    state = _load_state(out_dir, state_path)
    archetype = _archetype_name(out_dir, state_path)

    all_lines = reconcile_lines(man, state, out_dir=out_dir, state_path=state_path)
    lines = pick_major_lines(all_lines, max_lines=max_lines)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)

    sheets = []
    total = len(lines)
    for i, ln in enumerate(lines, start=1):
        svg_text = build_single_line_sheet(ln, archetype, i, total)
        slug = _slug(ln.number)
        svg_path = draw_dir / f"isometric-{slug}.svg"
        png_path = draw_dir / f"isometric-{slug}.png"
        svg_path.write_text(svg_text)
        png_ok = rasterise(svg_path, png_path) if rasterise_png else False
        sheets.append({"line": ln.number, "svg": str(svg_path),
                       "png": str(png_path) if png_ok else None,
                       "length_m": ln.length_m,
                       "elbows": _line_bom(ln)["elbows"]})

    # index sheet
    index_svg = None
    index_png = None
    if lines:
        idx_text = build_index_sheet(lines, archetype)
        idx_svg = draw_dir / "isometric-index.svg"
        idx_png = draw_dir / "isometric-index.png"
        idx_svg.write_text(idx_text)
        index_png_ok = rasterise(idx_svg, idx_png) if rasterise_png else False
        index_svg = str(idx_svg)
        index_png = str(idx_png) if index_png_ok else None

    summary = {
        "archetype": archetype,
        "lines_total": len(all_lines),
        "lines_drawn": len(lines),
        "sheets": sheets,
        "index_svg": index_svg,
        "index_png": index_png,
    }
    return summary


def _slug(number: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", str(number)).strip("-") or "line"


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    max_lines = None
    for a in argv[2:]:
        if a.startswith("--max="):
            try:
                max_lines = int(a.split("=", 1)[1])
            except ValueError:
                pass
    try:
        summary = generate_isometrics(out_dir, state_path, max_lines=max_lines)
    except FileNotFoundError as ex:
        print(f"[iso] ERROR: {ex}")
        return 2
    print(f"[iso] archetype  : {summary['archetype']}")
    print(f"[iso] lines       : {summary['lines_drawn']} drawn "
          f"(of {summary['lines_total']} routed)")
    for s in summary["sheets"]:
        print(f"[iso]   {s['line']:<16} {s['length_m']:.2f} m  {s['elbows']} elbows  "
              f"→ {s['svg']}" + ("  (+png)" if s["png"] else ""))
    if summary["index_svg"]:
        print(f"[iso] index → {summary['index_svg']}"
              + ("  (+png)" if summary["index_png"] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
