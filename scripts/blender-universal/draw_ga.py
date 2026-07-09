#!/usr/bin/env python3
"""draw_ga.py — UNIVERSAL GENERAL ARRANGEMENT (GA) drawing generator.

The civil/layout-side companion to draw_single_line.py (SLD) and draw_pid.py (P&ID).
Same contract: it does NOT recompute anything and it does NOT touch
build_universal_scene.py — it CONSUMES that generator's PARTS-POSITION export
(parts-manifest.json) and PROJECTS the placed equipment into a standard GENERAL
ARRANGEMENT drawing: a dimensioned PLAN (top view) + two ELEVATIONS (front + side),
the real deliverable a layout / piping / civil engineer expects to set out a plant.

INPUT (read-only):
  <out>/parts-manifest.json  — written by build_universal_scene.py after placement.
        {schema, count, bbox_mm:{x_min..z_max, length/width/height},
         parts:[{tag, equipment_tag, name, module, shape, qty,
                 pos_mm:[x,y,z]  (the part CENTRE),
                 dims_mm:{w,d,h}  (box-like)  OR  {dia,len}  (cylinder-like)}]}
        x = plant length (east), y = plant width (north), z = elevation (up); mm.

PIPELINE:
  1. load_manifest()  — read the manifest, build a Part list with each part's
       footprint rectangle in PLAN (x extent × y extent), its FRONT-elevation
       rectangle (x extent × z extent) and its SIDE-elevation rectangle (y extent ×
       z extent), derived from pos_mm + dims_mm (a cylinder's plan footprint is its
       diameter square; its elevation a dia-wide × len-tall rectangle on its base).
  2. choose_scale()   — pick a STANDARD drawing scale (1:50 / 1:100 / 1:200 / …) so
       all three views fit the sheet, and a matching SCALE BAR length.
  3. build_ga_svg()   — draw the PLAN top-left, FRONT elevation below it (shared X
       axis, aligned), SIDE elevation to the right of the plan (shared Y axis): each
       piece of equipment as a scaled OUTLINE with its EQUIPMENT TAG; overall plant
       L×W×H DIMENSION LINES (extension lines + arrowheads + the mm/m value) + key
       equipment offsets; a drawn SCALE BAR + stated scale; a grid/datum; a NORTH
       ARROW on the plan; a title block + equipment key + "not for construction".
  4. rasterise()      — SVG → PNG (cairosvg → rsvg-convert → headless Chrome cascade).

OUTPUTS:
  <out>/drawings/general-arrangement.svg
  <out>/drawings/general-arrangement.png

Run:
  python3 scripts/blender-universal/draw_ga.py /tmp/ga-efuel
  python3 scripts/blender-universal/draw_ga.py /tmp/ga-bess out/rerun-energy_storage/state.json

Pure Python stdlib + (optional) a rasteriser on PATH.  No Blender import.
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
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)
import drawing_building_envelope as _be  # noqa: E402  (ledger-slab building footprint)

# Deterministic title-block issue date for THIS run (YYYY-MM-DD), set by
# generate_ga() from the run's own artifacts so the title block is not a live
# clock; '' until set (the block then shows '—', never a placeholder literal).
_ISSUE_DATE = ""


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — a projected piece of equipment
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class GAPart:
    """One placed part projected into the three orthographic views. All coords in
    PLANT mm (x east, y north, z up). Each view rectangle is (lo, hi) on its two
    axes, taken from the part CENTRE ± half-extent (a cylinder's footprint is a
    diameter square; a vessel sits on its base, so z spans base..base+height)."""
    tag: str                 # human equipment tag, e.g. 'R-103'
    obj_tag: str             # slugged object tag
    name: str
    module: str
    shape: str
    qty: int
    is_round: bool           # cylinder-like (plan footprint drawn as a circle)
    # extents in mm on each axis:
    x0: float; x1: float     # plan/front horizontal (plant length)
    y0: float; y1: float     # plan vertical / side horizontal (plant width)
    z0: float; z1: float     # elevation (plant height)
    cx: float; cy: float     # plan centre (for the tag + leader)
    # process-flow rank from the manifest (region_rank) — the equipment schedule
    # reads in PROCESS ORDER, not tag-letter-alphabetical (Tristan 2026-07-02:
    # "manifolds scattered around the page — why are they where they are").
    rank: int = 10**9
    # BELOW-GRADE / gravity-drain collection point (sump / drain-pit / manhole) —
    # Sam Green SME review 2026-07-08, Renders J3: "a lot would have to be
    # underground for drainage". UNIVERSAL: keyed on the generic noun in the name,
    # never a class name. See _BELOW_GRADE_NAME_RE.
    is_below_grade: bool = False


def _round_extent(centre, half):
    return centre - half, centre + half


# BELOW-GRADE / gravity-drain collection point — the same generic noun signal
# draw_pid.py keys its underground-drainage line style on (_BELOW_GRADE_NODE_RE).
# UNIVERSAL: no class name, just the noun a real drainpit/sump/manhole is called.
_BELOW_GRADE_NAME_RE = re.compile(
    r"\bsump\b|drain.?pit|catch.?pit|\bmanhole\b|\bgully\b|floor.?drain", re.I)


def load_manifest(out_dir: str, manifest_path: Optional[str] = None):
    """Read parts-manifest.json from out_dir (or an explicit path) and project each
    part into the three views. Returns (parts:list[GAPart], bbox:dict, meta:dict)."""
    p = Path(manifest_path) if manifest_path else Path(out_dir) / "parts-manifest.json"
    if not p.is_file():
        raise FileNotFoundError(
            f"no parts-manifest.json in {out_dir} (run build_universal_scene.py with "
            f"INSPECT=1 BLENDER_OUT_DIR={out_dir} first)")
    with open(p) as fh:
        man = json.load(fh)

    parts: list[GAPart] = []
    for r in (man.get("parts") or []):
        pos = r.get("pos_mm") or [0, 0, 0]
        x, y, z = (float(pos[0]), float(pos[1]), float(pos[2]))
        d = r.get("dims_mm") or {}
        if "dia" in d:
            dia = float(d.get("dia") or 0.0)
            length = float(d.get("len") or 0.0)
            is_round = True
            x0, x1 = _round_extent(x, dia / 2.0)
            y0, y1 = _round_extent(y, dia / 2.0)
            # a vessel/tank/column stands on its base: z is the CENTRE, height=len.
            z0, z1 = z - length / 2.0, z + length / 2.0
        else:
            w = float(d.get("w") or 0.0)
            dep = float(d.get("d") or 0.0)
            h = float(d.get("h") or 0.0)
            is_round = False
            x0, x1 = _round_extent(x, w / 2.0)
            y0, y1 = _round_extent(y, dep / 2.0)
            z0, z1 = z - h / 2.0, z + h / 2.0
        _name = r.get("name") or ""
        parts.append(GAPart(
            tag=r.get("equipment_tag") or "?",
            obj_tag=r.get("tag") or "",
            name=_name,
            module=r.get("module") or "",
            shape=r.get("shape") or "",
            qty=int(r.get("qty") or 1),
            is_round=is_round,
            x0=x0, x1=x1, y0=y0, y1=y1, z0=z0, z1=z1, cx=x, cy=y,
            rank=int(r.get("region_rank") or 10**9),
            is_below_grade=bool(_BELOW_GRADE_NAME_RE.search(_name))))

    bbox = man.get("bbox_mm") or {}
    if not bbox and parts:
        bbox = {
            "x_min_mm": min(p.x0 for p in parts), "x_max_mm": max(p.x1 for p in parts),
            "y_min_mm": min(p.y0 for p in parts), "y_max_mm": max(p.y1 for p in parts),
            "z_min_mm": min(p.z0 for p in parts), "z_max_mm": max(p.z1 for p in parts),
        }
    # FUNCTION-SEGREGATED PLANT ROOMS (RULE 6, Sam Green SME review 2026-07-08) — the
    # walled electrical/control vs wet-process partition build_universal_scene.py
    # computed over the FINAL placed geometry (deterministic_layout.compute_function_
    # rooms). [] on a homogeneous / compact archetype — no rooms to draw.
    meta = {"count": man.get("count", len(parts)), "schema": man.get("schema", ""),
            "rooms": man.get("rooms") or []}
    return parts, bbox, meta


# ═══════════════════════════════════════════════════════════════════════════
# ARCHETYPE NAME (read from the sibling state.json if available, else the dir)
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
    # fall back to the out-dir basename, tidied
    base = Path(out_dir).name
    base = re.sub(r"^(ga|bl-univ|rerun)[-_]", "", base)
    return base or "process_plant"


def _humanise(tag: str) -> str:
    if not tag:
        return tag
    ACR = {"co2", "h2", "ft", "saf", "mv", "lv", "hv", "dc", "ac", "bess", "pcs",
           "hvac", "led", "vf", "ev", "uav", "haps", "auv", "n2", "o2"}
    parts = re.split(r"[_\s]+", tag.strip())
    out = []
    for p in parts:
        out.append(p.upper() if p.lower() in ACR else p)
    s = " ".join(out)
    return s[:1].upper() + s[1:] if s else s


# ═══════════════════════════════════════════════════════════════════════════
# SCALE — pick a standard drawing scale + a scale-bar length
# ═══════════════════════════════════════════════════════════════════════════

_STD_SCALES = [20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000]


def choose_scale(span_mm: float, avail_px: float):
    """Pick the SMALLEST standard scale ratio 1:S such that span_mm draws within
    avail_px (px). px = mm / S * PX_PER_MM_AT_1_1 ... but we work directly: the
    drawn length for a 1:S scale is span_mm * (avail_px-derived px-per-mm). We pick
    S so the model span maps to ≤ avail_px at our fixed on-paper resolution.

    Returns (S, px_per_model_mm). On paper we draw at 96 dpi-ish; 1 model metre at
    1:100 ≈ 10 mm on paper ≈ ~38 px. We compute px_per_model_mm = K / S and choose
    the smallest S that fits."""
    # K = on-paper px per model-mm at 1:1 reference (so px_per_mm = K / S).
    # 1 m at 1:100 → ~37.8 px  ⇒  K/100 = 0.0378 ⇒ K ≈ 3.78.
    K = 3.78
    span_mm = max(span_mm, 1.0)
    for S in _STD_SCALES:
        if span_mm * (K / S) <= avail_px:
            return S, K / S
    S = _STD_SCALES[-1]
    return S, K / S


def _nice_bar_mm(scale_S: float):
    """A round scale-bar total length in model mm that draws to a sensible width:
    pick from 1/2/5 × 10^n metres so the bar reads cleanly (e.g. 10 m / 20 m)."""
    # aim for a bar ~ 5 model metres-ish scaled; choose by the scale band.
    for metres in (1, 2, 5, 10, 20, 50, 100, 200):
        # a bar of `metres` m drawn at this scale; prefer 4-10 mm-on-paper segments.
        return_mm = metres * 1000.0
        if metres * 1000.0 / scale_S >= 20:   # ≥ ~20 px total at K≈3.78 → readable
            return return_mm
    return 100 * 1000.0


# ═══════════════════════════════════════════════════════════════════════════
# SVG primitives — identical palette + builder to the SLD / P&ID
# ═══════════════════════════════════════════════════════════════════════════

INK = "#1a1a1a"            # primary line / text
EQ_INK = "#10243e"         # equipment outline (deep navy)
EQ_FILL = "#eef2f7"        # equipment body fill
DIM_INK = "#1a5fb4"        # dimension lines / arrows (blue, the standard dim colour)
ACCENT = "#1a5fb4"
FILL_BG = "#ffffff"        # page
PANEL_BG = "#f4f6f9"       # title-block / key fill
GRID_FAINT = "#e4e8ee"     # setting-out grid / faint guide
DATUM_INK = "#9aa3af"      # datum / centre-line grey
MUTED = "#5b6470"
UG_FILL_BG = "#f2ede4"     # below-grade item hatch backing (warm earth tint, not EQ_FILL)


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    """Tiny imperative SVG builder (deterministic) — same primitives as the SLD/P&ID."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.4, dash=None, cap="round"):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" stroke-linecap="{cap}"{d}/>')

    def rect(self, x, y, w, h, stroke=INK, width=1.3, fill="none", rx=0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def circle(self, cx, cy, r, stroke=INK, width=1.4, fill="none", dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{width}"{d}/>')

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
        body = "\n".join(self.parts)
        defs = (
            '<defs>'
            f'<marker id="dim" markerWidth="12" markerHeight="12" refX="6" refY="5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,5 L11,1.5 L8.5,5 L11,8.5 Z" fill="{DIM_INK}"/></marker>')
        # below-grade / buried-item hatch (45° ticks) — the standard drafting
        # convention for a hidden/excavated feature (Sam Green SME review
        # 2026-07-08: drainpits/sumps must read as UNDERGROUND, not an ordinary
        # at-grade tank). Same idiom as _hatch_ground's earth-symbol ticks. ONLY
        # emitted when the body actually references it (proveNoFalsePositive: an
        # all-above-grade drawing's <defs> carries no unused pattern, and critically
        # the pattern's OWN internal <line> tag must never leak into an SVG that
        # drew none — ga-tags selftest #2 caught this leaking into every render).
        if "url(#ug-hatch)" in body:
            defs += (
                '<pattern id="ug-hatch" width="6" height="6" patternUnits="userSpaceOnUse" '
                'patternTransform="rotate(45)">'
                f'<rect width="6" height="6" fill="{UG_FILL_BG}"/>'
                f'<line x1="0" y1="0" x2="0" y2="6" stroke="{DATUM_INK}" stroke-width="1.6"/>'
                '</pattern>')
        defs += '</defs>'
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n{defs}\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


# ═══════════════════════════════════════════════════════════════════════════
# DIMENSION LINE — extension lines + double arrowheads + the value
# ═══════════════════════════════════════════════════════════════════════════

def _fmt_mm(v_mm: float) -> str:
    """A dimension value: metres (2dp) over ~1 m, else mm."""
    a = abs(v_mm)
    if a >= 1000:
        s = f"{v_mm/1000:.2f}".rstrip("0").rstrip(".")
        return f"{s} m"
    return f"{v_mm:.0f} mm"


def dim_h(svg: SVG, x_a, x_b, y, value_mm, off=0.0, ext_from=None, tick_up=True,
          label=None):
    """A HORIZONTAL dimension: a dimension line at y between x_a and x_b with an
    arrowhead each end, short EXTENSION LINES dropping from the measured feature to
    the dimension line, and the value centred above the line. `ext_from` (y of the
    feature) draws the witness lines; off nudges nothing (caller positions y)."""
    if x_b < x_a:
        x_a, x_b = x_b, x_a
    # extension / witness lines
    if ext_from is not None:
        gap = 3.0 if tick_up else -3.0
        svg.line(x_a, ext_from + (gap if ext_from < y else -gap), x_a, y,
                 stroke=DIM_INK, width=0.8)
        svg.line(x_b, ext_from + (gap if ext_from < y else -gap), x_b, y,
                 stroke=DIM_INK, width=0.8)
    # the dimension line with an arrowhead at BOTH ends
    svg.add(f'<line x1="{x_a:.1f}" y1="{y:.1f}" x2="{x_b:.1f}" y2="{y:.1f}" '
            f'stroke="{DIM_INK}" stroke-width="1.0" marker-start="url(#dim)" '
            f'marker-end="url(#dim)"/>')
    txt = label if label is not None else _fmt_mm(value_mm)
    svg.text((x_a + x_b) / 2.0, y - 4, txt, size=10, anchor="middle",
             fill=DIM_INK, weight="bold")


def dim_v(svg: SVG, y_a, y_b, x, value_mm, ext_from=None, label=None):
    """A VERTICAL dimension: a dimension line at x between y_a and y_b, arrowheads
    each end, witness lines, the value beside it (rotated)."""
    if y_b < y_a:
        y_a, y_b = y_b, y_a
    if ext_from is not None:
        svg.line(ext_from + (3.0 if ext_from < x else -3.0), y_a, x, y_a,
                 stroke=DIM_INK, width=0.8)
        svg.line(ext_from + (3.0 if ext_from < x else -3.0), y_b, x, y_b,
                 stroke=DIM_INK, width=0.8)
    svg.add(f'<line x1="{x:.1f}" y1="{y_a:.1f}" x2="{x:.1f}" y2="{y_b:.1f}" '
            f'stroke="{DIM_INK}" stroke-width="1.0" marker-start="url(#dim)" '
            f'marker-end="url(#dim)"/>')
    txt = label if label is not None else _fmt_mm(value_mm)
    svg.text(x - 4, (y_a + y_b) / 2.0, txt, size=10, anchor="middle",
             fill=DIM_INK, weight="bold", rotate=-90)


# ═══════════════════════════════════════════════════════════════════════════
# NORTH ARROW + SCALE BAR
# ═══════════════════════════════════════════════════════════════════════════

def north_arrow(svg: SVG, cx, cy, r=20):
    """Standard surveyor's north arrow: a slim filled lozenge pointing up with an
    'N', set in a thin circle. PLAN view convention: +Y (plant width) = north."""
    svg.circle(cx, cy, r, stroke=MUTED, width=1.0)
    svg.path(f"M {cx:.1f} {cy-r+2:.1f} L {cx+5:.1f} {cy+4:.1f} L {cx:.1f} {cy+1:.1f} "
             f"L {cx-5:.1f} {cy+4:.1f} Z", stroke=INK, width=1.0, fill=INK)
    svg.path(f"M {cx:.1f} {cy-r+2:.1f} L {cx+5:.1f} {cy+4:.1f} L {cx:.1f} {cy+1:.1f} Z",
             stroke=INK, width=1.0, fill=FILL_BG)
    svg.text(cx, cy + r + 11, "N", size=11, anchor="middle", weight="bold")


def scale_bar(svg: SVG, x, y, scale_S, px_per_mm, total_mm):
    """A drawn graphic SCALE BAR: alternating black/white segments spanning total_mm
    model length, with tick labels (0 / mid / end in metres) and the ratio stated."""
    seg_n = 4
    seg_mm = total_mm / seg_n
    bar_h = 6.0
    x0 = x
    for i in range(seg_n):
        sx = x0 + i * seg_mm * px_per_mm
        sw = seg_mm * px_per_mm
        fill = INK if i % 2 == 0 else FILL_BG
        svg.rect(sx, y, sw, bar_h, stroke=INK, width=0.9, fill=fill)
    end_x = x0 + total_mm * px_per_mm
    # tick labels at 0, mid, end
    for frac in (0.0, 0.5, 1.0):
        tx = x0 + total_mm * frac * px_per_mm
        svg.line(tx, y - 2, tx, y + bar_h + 2, stroke=INK, width=0.8)
        svg.text(tx, y + bar_h + 13, _fmt_mm(total_mm * frac), size=8.5,
                 anchor="middle", fill=MUTED)
    svg.text(x0, y - 5, f"SCALE 1:{int(scale_S)}", size=9.5, weight="bold", fill=INK)
    return end_x


# ═══════════════════════════════════════════════════════════════════════════
# EQUIPMENT OUTLINE in a view
# ═══════════════════════════════════════════════════════════════════════════

def _colocated_box_skip(parts) -> set:
    """id()s of parts whose PLAN footprint outline should be SKIPPED because another
    part occupies the identical plan (x, y) — a vertical stack (e.g. a control-
    cabinet column: SCADA panel + UPS + electrical panel + digital panel racked one
    above another, differing only in z). Keeps the LARGEST member's box (the rest
    are hidden behind it in plan anyway); every member still gets its own tag."""
    coloc: dict = defaultdict(list)
    for p in parts:
        coloc[(round(p.cx), round(p.cy))].append(p)
    return {
        id(g) for grp in coloc.values() if len(grp) > 1
        for g in sorted(grp, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.y1 - q.y0, 1)))[1:]
    }


def _draw_equipment_rect(svg, px, py, pw, ph, round_plan, tag, show_tag=True,
                         tiny_fill=EQ_FILL, placer=None, below_grade=False,
                         draw_box=True):
    """Draw one equipment outline at paper (px,py) size (pw,ph). round_plan=True
    draws a circle (a vessel/tank footprint in PLAN) inscribed in the box. When a
    `placer` (_TagPlacer) is given the tag is REGISTERED for the view's de-overlap
    pass instead of being stamped immediately. below_grade=True (a sump / drainpit /
    manhole) draws a DASHED outline + hatch fill instead of the solid at-grade
    convention — the standard drafting signal for a buried/hidden feature (Sam Green
    SME review 2026-07-08: drainpits must read as underground, not an ordinary tank).
    draw_box=False skips the outline (used for a CO-LOCATED stack — several parts at
    the identical plan (x,y), e.g. panels racked one above another — where only the
    LARGEST member's outline is drawn; every member still gets its own de-overlapped
    tag + leader, so nothing is silently hidden, but the plan doesn't draw N nested,
    indistinguishable rectangles on top of each other)."""
    fill = "url(#ug-hatch)" if below_grade else tiny_fill
    dash = "5,3" if below_grade else None
    if draw_box:
        if round_plan and pw > 4 and ph > 4:
            # plan footprint of a cylinder = a circle (diameter = the box) + a centre dot
            r = min(pw, ph) / 2.0
            ccx, ccy = px + pw / 2.0, py + ph / 2.0
            svg.circle(ccx, ccy, r, stroke=EQ_INK, width=1.4, fill=fill, dash=dash)
            svg.line(ccx - r, ccy, ccx + r, ccy, stroke=DATUM_INK, width=0.6, dash="4,3")
            svg.line(ccx, ccy - r, ccx, ccy + r, stroke=DATUM_INK, width=0.6, dash="4,3")
        else:
            svg.rect(px, py, max(pw, 1.5), max(ph, 1.5), stroke=EQ_INK, width=1.4,
                     fill=fill, dash=dash)
    if draw_box and below_grade and pw >= 16 and ph >= 11:
        svg.text(px + pw / 2.0, py + ph - 2.5, "U/G", size=min(6.5, ph * 0.28),
                 anchor="middle", fill=MUTED)
    # a non-drawn (co-located, hidden-behind-the-largest) member always takes the
    # keynote/leader path — never an in-place tag with no box under it.
    if draw_box and show_tag and pw >= 16 and ph >= 11:
        _cx, _cy = px + pw / 2.0, py + ph / 2.0
        _sz = min(10.0, ph * 0.6)
        if placer is not None:
            placer.add(_cx, _cy + 3.2, tag, _sz, anchor_pt=(_cx, _cy))
        else:
            svg.text(_cx, _cy + 3.2, tag, size=_sz,
                     anchor="middle", weight="bold", fill=EQ_INK)
        return True
    return False   # too small to label in place → caller adds a leader/keynote


class _TagPlacer:
    """Deterministic tag-label DE-OVERLAP for one GA view (reviewers 2026-07-02: the
    small-tank nest rendered collided, garbled tags — 'TK-TK-113' / 'TK-1TK-11K-105' —
    on the plan and both elevations, because every in-place tag was stamped at its part
    centre regardless of neighbours). Tags are REGISTERED while the view's equipment is
    drawn, then resolved in ONE pass: a label keeps its in-place position unless its
    text bbox intersects an already-placed label, in which case it walks a fixed
    offset LADDER (up, down, further up, further down …) to the first clear slot and
    draws a leader line back to its part centre so the tag stays unambiguous.
    Registration order is the existing draw order (largest part first — a stable,
    deterministic sort), so the resolved layout is byte-identical run to run.

    v59 hardening (2026-07-03 — both ELEVATIONS failed a 5-second glance): the
    ladder is now 2-D (vertical rows first, then deterministic horizontal dodges),
    and every view passes its BOUNDS box: a tag whose bbox would leave the view is
    CLAMPED back inside (leader-flipped to its part) — never clipped mid-word the
    way v59 B–B lost 'X-1…'/'TK-10…' off the sheet edge. View titles + dimension
    bands are registered as obstacles via block()."""

    CHAR_W = 0.62          # ≈ em-fraction per character of the sheet's bold Helvetica

    def __init__(self, svg, bounds=None):
        self.svg = svg
        self.bounds = bounds       # (x0, y0, x1, y1) every tag bbox must stay inside
        self._pending = []
        self._placed = []          # bboxes of resolved labels in THIS view

    def _bbox(self, x, y, text, size):
        w = self.CHAR_W * size * max(len(str(text)), 1)
        # y is the text BASELINE (svg.text convention): ascender ≈ 0.78·size above.
        return (x - w / 2.0, y - size * 0.78, x + w / 2.0, y + size * 0.22)

    @staticmethod
    def _hits(a, b):
        return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])

    def add(self, x, y, text, size, anchor_pt=None):
        """Register a middle-anchored bold tag at its desired baseline (x, y);
        anchor_pt = the part centre a displaced label leads back to."""
        self._pending.append((float(x), float(y), str(text), float(size), anchor_pt))

    def block(self, x0, y0, x1, y1):
        """Reserve a rectangle no tag may land on (a dimension band / annotation
        the view draws OUTSIDE this placer), so a ladder-displaced tag can never
        overprint it."""
        self._placed.append((float(x0), float(y0), float(x1), float(y1)))

    def _inside(self, bb):
        """The clip-guard predicate: a candidate bbox must sit fully inside the
        view's bounds box (no bounds → everywhere is fair)."""
        if self.bounds is None:
            return True
        bx0, by0, bx1, by1 = self.bounds
        return bb[0] >= bx0 and bb[2] <= bx1 and bb[1] >= by0 and bb[3] <= by1

    def flush(self):
        """Resolve + draw every registered tag. 2-D ladder: in place, then ±1, ±2 …
        rows of (size + 2.5 px) — first straight above/below, then with a
        deterministic horizontal dodge; every candidate must clear the placed
        labels AND the view bounds. A label that moved (or was pulled inside the
        bounds) gets a leader back to its part.

        GOTCHA (Codema 1538 / G9): the old extreme-pile-up fallback stamped a
        clamped (x_in, y−9·step) WITHOUT re-checking `_placed`, so two tags that
        both exhausted the short ladder could land on the SAME fallback slot and
        ship a >20% bbox pile-up. The fallback now keeps searching a wider
        spiral and only accepts a clear slot — never an overlapping one."""
        for x, y, text, size, anchor_pt in self._pending:
            w = self.CHAR_W * size * max(len(str(text)), 1)
            # hard clip-guard: pull the anchor x inside the view bounds up front,
            # so even the fallback position can never run past the view border.
            x_in, clamped = x, False
            if self.bounds is not None:
                lo = self.bounds[0] + w / 2.0 + 1.0
                hi = self.bounds[2] - w / 2.0 - 1.0
                if lo <= hi:
                    nx = min(max(x, lo), hi)
                    if nx != x:
                        x_in, clamped = nx, True
            step = size + 2.5
            chosen = None
            # Primary ladder, then a wider spiral (same deterministic order) so a
            # dense nest never falls through to an unchecked stamp.
            dx_steps = (0.0, -0.75 * w, 0.75 * w, -1.5 * w, 1.5 * w,
                        -2.25 * w, 2.25 * w, -3.0 * w, 3.0 * w)
            k_order = [0]
            for kk in range(1, 17):
                k_order.extend((-kk, kk))
            for dx in dx_steps:
                for k in k_order:
                    cx = x_in + dx
                    cy = y + k * step
                    bb = self._bbox(cx, cy, text, size)
                    if not self._inside(bb):
                        continue
                    if not any(self._hits(bb, pb) for pb in self._placed):
                        chosen = (cx, cy, bb, bool(k) or bool(dx) or clamped)
                        break
                if chosen is not None:
                    break
            if chosen is None:
                # Last resort: scan a dense grid inside the view bounds for ANY
                # clear slot (still deterministic — row-major from the anchor).
                # Prefer near the part; never accept an overlapping bbox.
                search_ys = [y + k * step for k in k_order]
                search_xs = [x_in + dx for dx in dx_steps]
                if self.bounds is not None:
                    bx0, by0, bx1, by1 = self.bounds
                    # pad so the full text bbox fits
                    pad_x = w / 2.0 + 1.0
                    pad_y_lo = size * 0.78 + 1.0
                    pad_y_hi = size * 0.22 + 1.0
                    grid_x0 = bx0 + pad_x
                    grid_x1 = bx1 - pad_x
                    grid_y0 = by0 + pad_y_lo
                    grid_y1 = by1 - pad_y_hi
                    if grid_x0 <= grid_x1 and grid_y0 <= grid_y1:
                        gx = grid_x0
                        while gx <= grid_x1 + 0.01:
                            search_xs.append(gx)
                            gx += max(step, w * 0.5)
                        gy = grid_y0
                        while gy <= grid_y1 + 0.01:
                            search_ys.append(gy)
                            gy += step
                for cy in search_ys:
                    for cx in search_xs:
                        bb = self._bbox(cx, cy, text, size)
                        if not self._inside(bb):
                            continue
                        if not any(self._hits(bb, pb) for pb in self._placed):
                            chosen = (cx, cy, bb, True)
                            break
                    if chosen is not None:
                        break
            if chosen is None:
                # Truly full view: place at the farthest in-bounds ladder end that
                # MINIMISES overlap area with existing labels (never silently stack
                # on the same slot). Still draws — the sheet stays complete — but
                # G9 will flag residual IoU >20% so the defect stays visible.
                best = None
                best_ov = float("inf")
                for dx in dx_steps:
                    for k in k_order:
                        cx = x_in + dx
                        cy = y + k * step
                        bb = self._bbox(cx, cy, text, size)
                        if not self._inside(bb):
                            continue
                        ov = 0.0
                        for pb in self._placed:
                            ix = min(bb[2], pb[2]) - max(bb[0], pb[0])
                            iy = min(bb[3], pb[3]) - max(bb[1], pb[1])
                            if ix > 0 and iy > 0:
                                ov += ix * iy
                        if ov < best_ov:
                            best_ov = ov
                            best = (cx, cy, bb, True)
                if best is None:
                    cy = y - 9 * step
                    if self.bounds is not None:
                        cy = min(max(cy, self.bounds[1] + size * 0.78 + 1.0),
                                 self.bounds[3] - size * 0.22 - 1.0)
                    best = (x_in, cy, self._bbox(x_in, cy, text, size), True)
                chosen = best
            cx, cy, bb, moved = chosen
            self._placed.append(bb)
            if moved and anchor_pt is not None:
                ax, ay = anchor_pt
                # leader from the label's near edge back to the part centre
                ey = bb[3] if cy < ay else bb[1]
                self.svg.line(cx, ey, ax, ay, stroke=DATUM_INK, width=0.7)
            self.svg.text(cx, cy, text, size=size, anchor="middle", weight="bold",
                          fill=EQ_INK)
        self._pending = []


def _view_box(svg: SVG, name: str, x0, y0, x1, y1):
    """Emit an invisible per-view BOUNDS marker (`data-viewbox`) and return the
    bounds tuple. ONE shared rule: the _TagPlacer keeps every tag inside this box
    and drawing_gates G9 (tag_legibility) re-reads the SAME box from the SVG to
    verify no tag was clipped — generator and gate can never drift apart."""
    svg.add(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{x1 - x0:.1f}" '
            f'height="{y1 - y0:.1f}" fill="none" stroke="none" '
            f'data-viewbox="{_esc(name)}"/>')
    return (float(x0), float(y0), float(x1), float(y1))


def _elevation_tag_groups(items):
    """Collapse an elevation's stacked same-family tags into RANGE tags (v59 B–B:
    six colliding TK labels over the tank nest projected edge-on). `items` =
    [(part, px, py, pw, ph)] as DRAWN in one elevation. Same-FAMILY parts whose
    projected outlines overlap (3 px pad) cluster (union-find); inside a cluster
    of ≥3, a run of the SAME NAME with CONSECUTIVE numbers gets ONE range tag
    'TK-109…TK-113' with a single leader to the run — the EXACT rule the
    equipment schedule already ranges by (family + name), plus numeric
    contiguity so a range never claims a tag that isn't in it: a real elevation
    names a rack once, not 8 overlapping labels. Returns (singles, ranges):
      singles = [(tag, cx, baseline_y, size, anchor)]  (draw-order preserved)
      ranges  = [(label, cx, baseline_y, size, anchor)] (sorted by label)
    Deterministic — pure geometry + stable sorts."""
    PAD = 3.0
    ents = []
    for p, px, py, pw, ph in items:
        ents.append((p, float(px), float(py), max(float(pw), 1.5),
                     max(float(ph), 1.5), p.tag.split("-")[0]))
    n = len(ents)
    parent = list(range(n))

    def _find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            if ents[i][5] != ents[j][5]:
                continue
            ax0, ay0 = ents[i][1] - PAD, ents[i][2] - PAD
            ax1, ay1 = ents[i][1] + ents[i][3] + PAD, ents[i][2] + ents[i][4] + PAD
            bx0, by0 = ents[j][1], ents[j][2]
            bx1, by1 = ents[j][1] + ents[j][3], ents[j][2] + ents[j][4]
            if not (ax1 <= bx0 or bx1 <= ax0 or ay1 <= by0 or by1 <= ay0):
                ri, rj = _find(i), _find(j)
                if ri != rj:
                    parent[max(ri, rj)] = min(ri, rj)

    groups: dict = {}
    for i in range(n):
        groups.setdefault(_find(i), []).append(i)

    singles, ranges = [], []
    in_range = set()
    for root, idxs in groups.items():
        # DECISION: collapse from cluster size ≥2 (was ≥3). A pair of same-family
        # tanks projected edge-on still piles tags (Codema 1538 TK-110∩TK-111);
        # the schedule already ranges ×2 runs, so the elevation must match.
        # A singleton cluster is untouched (len < 2).
        if len(idxs) < 2:
            continue
        # same-NAME + numerically-CONSECUTIVE runs inside the stacked cluster —
        # the schedule's own collapse rule ('Drain Water Tank ×2 → TK-106…TK-107'),
        # so a range tag never claims a tag that is a DIFFERENT piece of equipment.
        by_name: dict = {}
        for i in idxs:
            by_name.setdefault(ents[i][0].name, []).append(i)
        for name in sorted(by_name):
            run: list = []

            def _emit(run):
                if len(run) < 2:
                    return
                members = [ents[i] for i in run]
                in_range.update(run)
                x0 = min(e[1] for e in members)
                y0 = min(e[2] for e in members)
                x1 = max(e[1] + e[3] for e in members)
                y1 = max(e[2] + e[4] for e in members)
                label = f"{members[0][0].tag}…{members[-1][0].tag}"
                cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
                ranges.append((label, cx, cy + 3.2, 9.0, (cx, cy)))

            for i in sorted(by_name[name],
                            key=lambda k: (_tag_num(ents[k][0].tag), ents[k][0].tag)):
                if run and _tag_num(ents[i][0].tag) != _tag_num(ents[run[-1]][0].tag) + 1:
                    _emit(run)
                    run = []
                run.append(i)
            _emit(run)
    for i, (p, px, py, pw, ph, _fam) in enumerate(ents):
        if i in in_range:
            continue
        if pw >= 16 and ph >= 12:
            cx, cy = px + pw / 2.0, py + ph / 2.0
            singles.append((p.tag, cx, cy + 3.2, min(9.5, ph * 0.5), (cx, cy)))
    ranges.sort(key=lambda r: r[0])
    return singles, ranges


# ═══════════════════════════════════════════════════════════════════════════
# MAIN LAYOUT
# ═══════════════════════════════════════════════════════════════════════════

def _wall_edge(svg: SVG, ax, ay, bx, by, gap=None, w=3.2):
    """Draw one wall EDGE (ax,ay)-(bx,by) — horizontal (ay==by) or vertical
    (ax==bx) only. `gap` (a0,a1) leaves a DOOR opening along the edge (a0<a1, in
    the same px space) with a short leaf-tick at its start — the standard
    architectural door symbol, simplified to a single leaf line (legible at GA
    scale without a full swing-arc). No gap ⇒ a plain wall line."""
    if gap is None:
        svg.line(ax, ay, bx, by, stroke=INK, width=w)
        return
    g0, g1 = gap
    if ay == by:      # horizontal edge — the gap splits it along X
        svg.line(ax, ay, g0, ay, stroke=INK, width=w)
        svg.line(g1, ay, bx, by, stroke=INK, width=w)
        svg.line(g0, ay, g0, ay + 12.0, stroke=INK, width=1.3)
    else:             # vertical edge — the gap splits it along Y
        svg.line(ax, ay, ax, g0, stroke=INK, width=w)
        svg.line(ax, g1, bx, by, stroke=INK, width=w)
        svg.line(ax, g0, ax + 12.0, g0, stroke=INK, width=1.3)


def _draw_function_room(svg: SVG, x0, y0, x1, y1, door, name, label_y_min=None):
    """Draw one function-segregated PLANT ROOM (RULE 6, Sam Green SME review
    2026-07-08) on the plan: a heavier-stroke wall outline (x0,y0)-(x1,y1) (px,
    y0<y1) with a DOOR GAP cut into whichever wall face `door` names, and a
    room-name label inside the top-left corner. `door` is (edge, a, b) with
    edge in {'top','bottom','left','right'} and (a,b) the gap's px range along
    that edge, or None for no door (should not happen in practice — every room
    compute_function_rooms returns carries one). `label_y_min` clamps the label
    baseline so a room whose wall sits hard against the plant's own edge (a
    dense archetype with almost no clearance to the building envelope) never
    prints its name up into the PLAN title / north-arrow band above the content."""
    edge, a, b = door if door else (None, None, None)
    _wall_edge(svg, x0, y0, x1, y0, (a, b) if edge == "top" else None)
    _wall_edge(svg, x0, y1, x1, y1, (a, b) if edge == "bottom" else None)
    _wall_edge(svg, x0, y0, x0, y1, (a, b) if edge == "left" else None)
    _wall_edge(svg, x1, y0, x1, y1, (a, b) if edge == "right" else None)
    label_y = y0 + 14
    if label_y_min is not None:
        label_y = max(label_y, label_y_min)
    svg.text(x0 + 6, label_y, name, size=10.2, weight="bold", fill=INK)


def _draw_function_rooms(svg: SVG, rooms, plan_x, plan_y, mx, my):
    """Project every RULE-6 room (mm, plan coords) into plan px via mx()/my() and
    draw its walls + door + label. No-op for an empty `rooms` list (a
    homogeneous / compact archetype — proveNoFalsePositive: no phantom wall)."""
    for rm in (rooms or []):
        rx0, ry0, rx1, ry1 = rm["x0"], rm["y0"], rm["x1"], rm["y1"]
        x0p, x1p = plan_x + mx(rx0), plan_x + mx(rx1)
        y0p, y1p = plan_y + my(ry1), plan_y + my(ry0)   # my() inverts (north = up)
        door = rm.get("door")
        d = None
        if door:
            if abs(door["y0"] - door["y1"]) < 1.0:      # horizontal wall-face door
                da, db = sorted((plan_x + mx(door["x0"]), plan_x + mx(door["x1"])))
                edge = "top" if abs(door["y0"] - ry1) <= abs(door["y0"] - ry0) else "bottom"
                d = (edge, da, db)
            else:                                        # vertical wall-face door
                da, db = sorted((plan_y + my(door["y1"]), plan_y + my(door["y0"])))
                edge = "left" if abs(door["x0"] - rx0) <= abs(door["x0"] - rx1) else "right"
                d = (edge, da, db)
        _draw_function_room(svg, x0p, y0p, x1p, y1p, d, rm.get("name", "Plant Rm"),
                            label_y_min=plan_y + 12)


def _nearest_plan_edge(cx: float, cy: float, env_x0: float, env_y0: float,
                       env_x1: float, env_y1: float) -> str:
    """Which plant-envelope edge a plan point is nearest (paper px)."""
    return min(
        ("bottom", env_y1 - cy), ("top", cy - env_y0),
        ("left", cx - env_x0), ("right", env_x1 - cx),
        key=lambda t: t[1],
    )[0]


def _collapse_ext_drain_runs(edge_members: list) -> list:
    """INTENT: same rule as elevation/schedule range-collapse — consecutive
    same-NAME below-grade vessels on ONE shared envelope edge become ONE
    EXT. DRAIN annotation with a range tag ('TK-110…TK-111'), not N piled-up
    labels. Codema 2026-07-09: two Drain Collection Sumps at the same plan Y
    both picked the left edge; outward-only stagger left their tag texts at
    the same baseline 10 px apart → G9 60% IoU. Different names never merge
    (Nursery Drain Collection Sump stays its own manhole). Returns a list of
    (members, label) where members is the run's GAPart list in tag order."""
    by_name: dict = {}
    for p, cx, cy in edge_members:
        by_name.setdefault(p.name, []).append((p, cx, cy))
    out = []
    for name in sorted(by_name):
        run: list = []

        def _emit(run: list) -> None:
            if not run:
                return
            members = [t[0] for t in run]
            if len(members) == 1:
                label = members[0].tag
            else:
                label = f"{members[0].tag}…{members[-1].tag}"
            out.append((run, label))

        for item in sorted(by_name[name],
                           key=lambda t: (_tag_num(t[0].tag), t[0].tag)):
            if run and _tag_num(item[0].tag) != _tag_num(run[-1][0].tag) + 1:
                _emit(run)
                run = []
            run.append(item)
        _emit(run)
    return out


def _draw_external_drain_points(svg: SVG, parts, plan_x, plan_y, plan_w, plan_h,
                                mx, my):
    """T-27 — annotate an EXTERNAL DRAIN / MANHOLE outside the plant envelope for
    every below-grade collection vessel (sump / drainpit / catch-pit).

    UNIVERSAL: keyed on `is_below_grade` (the same noun signal as the hatch
    convention) — never a class name. Each sump (or same-name consecutive run
    sharing an edge) gets a buried (dash-dot) leader from its plan centre to a
    manhole symbol just outside the nearest plan edge, labelled 'EXT. DRAIN' +
    the equipment tag (or range). proveCatch in _selftest.

    DECISION (Codema tag_legibility 5× ESCALATE, 2026-07-09): when several
    sumps share an edge, (1) range-collapse consecutive same-NAME runs into
    ONE annotation (mirrors `_elevation_tag_groups` / schedule collapse) and
    (2) stagger remaining annotations ALONG the edge — not only outward. The
    old `offset = 28 + (i % 3) * 10` only moved the manhole further off-sheet;
    two sumps at the same plan Y kept identical label baselines and piled up.
    """
    sumps = [p for p in parts if getattr(p, "is_below_grade", False)]
    if not sumps:
        return
    # plan envelope in paper px
    env_x0, env_y0 = plan_x, plan_y
    env_x1, env_y1 = plan_x + plan_w, plan_y + plan_h
    # assign each sump to its nearest edge first, THEN collapse + place — so
    # two same-Y left-edge sumps share one group (and can range-collapse).
    by_edge: dict = {"bottom": [], "top": [], "left": [], "right": []}
    for p in sumps:
        cx = plan_x + mx(p.cx)
        cy = plan_y + my(p.cy)
        edge = _nearest_plan_edge(cx, cy, env_x0, env_y0, env_x1, env_y1)
        by_edge[edge].append((p, cx, cy))

    # along-edge pitch must clear a start-anchored tag bbox (~6 chars × 6.8 × 0.62
    # ≈ 26 px wide) plus the EXT. DRAIN title — 36 px keeps G9 IoU well under 20%.
    ALONG_PITCH = 36.0
    for edge, members in by_edge.items():
        if not members:
            continue
        runs = _collapse_ext_drain_runs(members)
        # stable along-edge order: by the run's mean plan position on the edge axis
        def _along_key(run_label):
            run, _label = run_label
            if edge in ("left", "right"):
                return sum(t[2] for t in run) / len(run)  # mean cy
            return sum(t[1] for t in run) / len(run)      # mean cx

        for slot, (run, label) in enumerate(sorted(runs, key=_along_key)):
            # centroid of the run → one leader / one manhole for the whole range
            cx = sum(t[1] for t in run) / len(run)
            cy = sum(t[2] for t in run) / len(run)
            # outward offset still staggers when many runs share an edge; along-
            # edge pitch is what stops same-baseline pile-ups. Range labels are
            # wider ('TK-110…TK-111' ≈ 55 px) — pad outward so the OUTBOARD text
            # clears the plan viewbox (G9 attributes a tag by its bbox centre;
            # a label drawn INBOARD of a left-edge manhole landed inside the
            # plan and piled onto TK-107 at 68% IoU on the Codema regen).
            n_chars = max(len(label), len("EXT. DRAIN"))
            label_w = 0.62 * 7.2 * n_chars
            outward = 28 + (slot % 3) * 10 + max(0.0, label_w - 20.0)
            along = (slot - (len(runs) - 1) / 2.0) * ALONG_PITCH
            if edge == "bottom":
                mxh, myh = cx + along, env_y1 + outward
                lx, anchor = mxh + 10, "start"
            elif edge == "top":
                mxh, myh = cx + along, env_y0 - outward
                lx, anchor = mxh + 10, "start"
            elif edge == "left":
                mxh, myh = env_x0 - outward, cy + along
                # GOTCHA: label must sit LEFT of the manhole (anchor=end). The
                # previous mxh+10 drew the tag INTO the plant and onto in-place
                # equipment tags — the Codema TK-107 ∩ TK-110…TK-111 miss.
                lx, anchor = mxh - 10, "end"
            else:
                mxh, myh = env_x1 + outward, cy + along
                lx, anchor = mxh + 10, "start"
            # one leader per member (each sump still shows its buried path) —
            # the shared manhole + range label is what de-overlaps.
            for _p, pcx, pcy in run:
                svg.line(pcx, pcy, mxh, myh, stroke=DATUM_INK, width=1.1,
                         dash="2,2,6,2")
            # manhole symbol — double circle (standard civil drain/manhole mark)
            svg.circle(mxh, myh, 7, stroke=EQ_INK, width=1.4, fill=UG_FILL_BG)
            svg.circle(mxh, myh, 3.5, stroke=EQ_INK, width=1.0, fill="none")
            svg.text(lx, myh - 2, "EXT. DRAIN", size=7.2, fill=EQ_INK,
                     weight="bold", anchor=anchor)
            svg.text(lx, myh + 10, label, size=6.8, fill=MUTED, anchor=anchor)


def _draw_elevation_buried_laterals(svg, parts, elev_x, elev_y, elev_w, elev_h,
                                    axis: str, mx_fn, mz_fn, ground_y):
    """T-08 — GA elevation dashed buried drain laterals from zone off-page to sumps.

    INTENT: side elevation already hides the slab so below-grade geometry is visible;
    the FRONT/SIDE elevations still need dashed leaders showing buried headers running
    from the zone edge (off-page) into each below-grade sump. UNIVERSAL: keyed on
    is_below_grade — never a class name. axis='x' → front elev (plant length);
    axis='y' → side elev (plant width)."""
    sumps = [p for p in parts if getattr(p, "is_below_grade", False)]
    if not sumps:
        return
    # buried trench depth below FFL (schematic — matches 3D BELOW_GRADE_TRENCH_MM spirit)
    trench_dy = 18.0  # paper px below the ground datum
    for i, p in enumerate(sumps):
        if axis == "x":
            cx = elev_x + mx_fn(p.cx)
        else:
            cx = elev_x + mx_fn(p.cy)
        # sump top sits at/below ground; draw a short vertical drop into the trench
        # then a horizontal dashed header to the nearest elev edge (off-page zone).
        sy = ground_y + trench_dy
        # prefer the nearer elev edge for the off-page stub
        to_left = cx - elev_x
        to_right = (elev_x + elev_w) - cx
        if to_left <= to_right:
            edge_x = elev_x - 6
            label_x = elev_x - 4
            anchor = "end"
        else:
            edge_x = elev_x + elev_w + 6
            label_x = elev_x + elev_w + 8
            anchor = "start"
        # horizontal buried header (dash-dot) + short riser into the sump
        svg.line(edge_x, sy, cx, sy, stroke=DATUM_INK, width=1.15, dash="2,2,6,2")
        svg.line(cx, sy, cx, ground_y - 2, stroke=DATUM_INK, width=1.0, dash="2,2,6,2")
        if i == 0:
            svg.text(label_x, sy - 4, "buried drain lateral", size=6.5, fill=MUTED,
                     anchor=anchor)


def build_ga_svg(parts: list[GAPart], bbox: dict, archetype: str,
                 meta: dict, rooms: Optional[list] = None) -> str:
    """Render the projected equipment as a GENERAL ARRANGEMENT: PLAN (top-left),
    FRONT elevation (below the plan, shared X), SIDE elevation (right of plan,
    shared Y), with overall + key dimensions, a scale bar, north arrow, grid,
    title block + key. `rooms` (RULE 6, optional): function-segregated plant
    rooms drawn as walled partitions on the PLAN only."""
    # ----- model extents (mm), padded a touch so outlines aren't on the frame -----
    x_min = bbox.get("x_min_mm", min((p.x0 for p in parts), default=0.0))
    x_max = bbox.get("x_max_mm", max((p.x1 for p in parts), default=1000.0))
    y_min = bbox.get("y_min_mm", min((p.y0 for p in parts), default=0.0))
    y_max = bbox.get("y_max_mm", max((p.y1 for p in parts), default=1000.0))
    z_min = min(0.0, bbox.get("z_min_mm", 0.0))
    z_max = bbox.get("z_max_mm", max((p.z1 for p in parts), default=3000.0))
    L = max(x_max - x_min, 1.0)     # plant length (x)
    W = max(y_max - y_min, 1.0)     # plant width  (y)
    H = max(z_max - z_min, 1.0)     # plant height (z)

    # ----- pick ONE scale shared across all views so they read together. The
    #       binding span is whichever of (L, W) and (L) , (H) dominates the sheet.
    #       Target a ~A3-landscape working area; choose scale from the widest view.
    # Larger plan budgets (2026-07-02): the in-drawing schedule now shows only the top
    # principals (full list → Part names tab), freeing sheet area — spend it on a bigger,
    # more legible plan (typically one standard scale finer).
    PLAN_MAX_W = 1000.0    # px budget for the plan width (x)
    PLAN_MAX_H = 600.0     # px budget for the plan depth (y)
    sx, ppm_x = choose_scale(L, PLAN_MAX_W)
    sy, ppm_y = choose_scale(W, PLAN_MAX_H)
    sz, ppm_z = choose_scale(H, 300.0)
    scale_S = max(sx, sy, sz)              # the coarsest fits everything
    # re-derive the matching px-per-mm for that single scale (K from choose_scale).
    K = 3.78
    ppm = K / scale_S

    def mx(x_mm):   # model-x (mm) → paper px offset
        return (x_mm - x_min) * ppm

    def my(y_mm):   # model-y (mm) → paper px offset (PLAN: north is UP → invert)
        return (y_max - y_mm) * ppm

    def mz(z_mm):   # model-z (mm) → paper px offset (elevation: up is UP → invert)
        return (z_max - z_mm) * ppm

    plan_w = L * ppm
    plan_h = W * ppm
    elev_h = H * ppm

    # ----- sheet geometry -----
    margin = 46
    has_below_grade = any(p.is_below_grade for p in parts)
    title_h = 166             # +16 for the shared general-tolerance note line (_tb.TOLERANCE_NOTE)
    if has_below_grade:
        title_h += 16         # +16 for the below-grade hatch-symbol note (conditional)
    gap = 96                 # gap between plan and the side elevation / dim gutters
    v_gap = 92               # gap between plan and front elevation (dim band)
    label_gutter = 30        # left gutter for the vertical (plant-width) dimension

    # PLAN block origin
    plan_x = margin + label_gutter + 34
    plan_y = margin + 54

    # SIDE elevation sits to the RIGHT of the plan, sharing the Y axis (plant width).
    side_x = plan_x + plan_w + gap
    side_y = plan_y
    # the side elevation's PAPER width = the plant WIDTH (y), the axis it is drawn
    # along — v59 sized the sheet from elev_h (plant HEIGHT, tiny for a low plant)
    # so the B–B view ran PAST the sheet edge and its right-edge tags rasterised
    # clipped mid-word ('X-1…' / 'TK-10…'). Source fix: the sheet budget uses the
    # drawn width, and the +46 keeps the level labels ('+4m') on-sheet.
    side_w = plan_h + 46

    # FRONT elevation sits BELOW the plan, sharing the X axis (plant length).
    front_x = plan_x
    front_y = plan_y + plan_h + v_gap + 26
    front_h = elev_h

    width = max(side_x + side_w + margin + 30,
                plan_x + plan_w + margin + 30, 1080)
    # height covers the taller of (a) the front elevation below the plan and (b) the
    # equipment-schedule panel in the right gutter below the side elevation, so the
    # schedule never gets clipped or driven into the title block.
    # the schedule sits BELOW the front elevation (which is below the plan) — NOT just below
    # the plan TOP, or it covers the plan + front elevation (Tristan 2026-06-22: "the equipment
    # schedule is hiding most of the plans and elevations"). Its height is the EXACT panel
    # height _draw_key will draw (shared helper), plus a hard clearance band so the scale
    # bar + 'SCALE 1:N' text can never overprint the schedule (v54, 2026-07-02).
    sched_top = front_y + front_h + 56
    sched_bottom = sched_top + _key_panel_height(parts)
    height = max(front_y + front_h + 64, sched_bottom + 60) + title_h
    width = int(math.ceil(width))
    height = int(math.ceil(height))

    svg = SVG(width, height)
    # faint sheet border
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)

    # ───────────────────────── PLAN (top view) ─────────────────────────
    svg.text(plan_x, plan_y - 30, "PLAN", size=13, weight="bold", fill=EQ_INK,
             spacing="1.5")
    svg.text(plan_x + 52, plan_y - 30, "(roof removed · looking down)", size=9.5,
             fill=MUTED)
    # setting-out grid + plant boundary
    _draw_setout_grid(svg, plan_x, plan_y, plan_w, plan_h, L, W, ppm, axis="plan")
    svg.rect(plan_x, plan_y, plan_w, plan_h, stroke=DATUM_INK, width=1.2,
             fill="none")
    # equipment footprints. Draw LARGEST first so small items overlay readably; an
    # item with a clearly readable footprint gets its tag in place, the rest become
    # small numbered balloons keyed to the EQUIPMENT SCHEDULE (the standard GA way
    # to keep a dense plan legible without tag pile-ups).
    keynotes = []   # (part, cx, cy) for items too small to label in place
    # de-overlap pass (GA fix 7, reviewers 2026-07-02) + view BOUNDS (v59: the
    # ladder walked plan tags up ONTO the 'PLAN' title — the bounds stop above
    # the top dimension band, so no tag can ever reach the heading again).
    plan_tags = _TagPlacer(svg, bounds=_view_box(
        svg, "plan", plan_x - 2, plan_y - 2, plan_x + plan_w + 40,
        plan_y + plan_h + 34))
    # reserve the plan's annotation bands so a ladder-displaced tag can never
    # overprint the dimensions / grid balloons / north arrow drawn around the plan.
    plan_tags.block(plan_x - 40, plan_y - 26, plan_x + plan_w + 40, plan_y - 2)
    plan_tags.block(plan_x - 28, plan_y - 2, plan_x - 2, plan_y + plan_h + 2)
    plan_tags.block(plan_x + plan_w - 40, plan_y + 2, plan_x + plan_w + 8, plan_y + 46)
    # CO-LOCATED STACK collapse (v59b — a control-cabinet column: e.g. SCADA panel +
    # UPS + electrical panel + digital panel racked one above another at the IDENTICAL
    # plan (x,y), differing only in Z). Drawing N near-identical nested rectangles on
    # top of each other reads as an illegible 'bullseye' (each tag's own de-overlap
    # ladder still staggers the TEXT correctly, but the overlapping BOX ART behind it
    # is what breaks legibility). Fix: draw only the LARGEST member's outline; every
    # member keeps its own tag + leader (nothing is silently hidden from the sheet).
    _plan_box_skip = _colocated_box_skip(parts)
    for p in sorted(parts, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.y1 - q.y0, 1))):
        pw = (p.x1 - p.x0) * ppm
        ph = (p.y1 - p.y0) * ppm
        px = plan_x + mx(p.x0)
        py = plan_y + my(p.y1)        # my inverts → top edge is the larger y
        labelled = _draw_equipment_rect(svg, px, py, pw, ph, p.is_round, p.tag,
                                        placer=plan_tags, below_grade=p.is_below_grade,
                                        draw_box=(id(p) not in _plan_box_skip))
        if not labelled:
            keynotes.append((p, px + pw / 2.0, py + ph / 2.0))
    # items too small for an IN-PLACE tag get their FULL equipment tag through the same
    # de-overlap ladder (a leader line back to the part when displaced). The old numeric-
    # suffix balloon ('6' for P-106) keyed to a schedule that now shows only the top-10
    # principals left every small part UNIDENTIFIABLE on the sheet — v58b GA coverage
    # 24/37: P-101 / P-104 / P-106 / M-101 / I-102 were DRAWN but untagged. A GA must
    # honestly NAME every part it draws. proveCatch in _selftest.
    for p, kx, ky in keynotes:
        plan_tags.add(kx, ky + 2.7, p.tag, 7.5, anchor_pt=(kx, ky))
    plan_tags.flush()
    # FUNCTION-SEGREGATED PLANT ROOMS (RULE 6, Sam Green SME review 2026-07-08) —
    # walled partitions between function-incompatible equipment groups (today:
    # electrical/control vs wet-process), drawn OVER the equipment so the heavier
    # wall stroke reads clearly. No-op when `rooms` is empty (a homogeneous /
    # compact archetype gets no phantom partition — proveNoFalsePositive).
    _draw_function_rooms(svg, rooms, plan_x, plan_y, mx, my)
    # T-27 — EXTERNAL DRAIN / MANHOLE annotations outside the plant envelope for
    # every below-grade collection vessel (sump / drainpit). Buried leader from
    # the sump centre to a manhole symbol just outside the plan boundary.
    # Universal: any below-grade collection vessel gets one; no-op otherwise.
    _draw_external_drain_points(svg, parts, plan_x, plan_y, plan_w, plan_h, mx, my)
    # north arrow (top-right corner of the plan)
    north_arrow(svg, plan_x + plan_w - 16, plan_y + 22)

    # overall PLAN dimensions: length along the top, width down the left.
    dim_h(svg, plan_x, plan_x + plan_w, plan_y - 14, L, ext_from=plan_y)
    dim_v(svg, plan_y, plan_y + plan_h, plan_x - 16, W, ext_from=plan_x)

    # ───────────────────────── FRONT elevation ─────────────────────────
    svg.text(front_x, front_y - 14, "ELEVATION A–A", size=13, weight="bold",
             fill=EQ_INK, spacing="1.0")
    svg.text(front_x + 118, front_y - 14, "(looking north)", size=9.5, fill=MUTED)
    _draw_elev_frame(svg, front_x, front_y, plan_w, front_h, L, H, ppm,
                     z_min, z_max, mz_base=front_y)
    # SAME _TagPlacer discipline as the plan, with the view's own BOUNDS box (the
    # clip-guard) — v59's A–A ladder walked tags up over the 'ELEVATION A–A' title.
    _gy_f = front_y + (z_max - max(0.0, z_min)) * ppm
    front_tags = _TagPlacer(svg, bounds=_view_box(
        svg, "elevation-aa", front_x - 2, front_y - 40, front_x + plan_w + 2,
        _gy_f + 0.5))
    # the view TITLE + subtitle are OBSTACLES (they sit inside the bounds headroom)
    front_tags.block(front_x - 4, front_y - 26, front_x + 212, front_y - 4)
    # reserve the ground/FFL row, the left height dimension and the schedule-panel
    # top edge so displaced tags never overprint them.
    front_tags.block(front_x - 30, _gy_f + 0.5, front_x + plan_w + 95, _gy_f + 13)
    front_tags.block(front_x - 30, front_y - 2, front_x - 2, _gy_f)
    front_tags.block(margin, sched_top - 2, width - margin, sched_top + 20)
    front_items = []
    for p in sorted(parts, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.z1 - q.z0, 1))):
        pw = (p.x1 - p.x0) * ppm
        ph = (p.z1 - p.z0) * ppm
        px = front_x + mx(p.x0)
        py = front_y + (z_max - p.z1) * ppm
        _draw_elevation_item(svg, px, py, pw, ph, p)
        front_items.append((p, px, py, pw, ph))
    # stacked same-family tags (the tank nest seen edge-on) collapse to ONE range
    # tag with a single leader — like the schedule's 'TK-106…TK-113' rows.
    _singles_f, _ranges_f = _elevation_tag_groups(front_items)
    for label, cx, cy, size, anchor in _ranges_f + _singles_f:
        front_tags.add(cx, cy, label, size, anchor_pt=anchor)
    front_tags.flush()
    # ground / datum line + overall height dimension on the front elevation
    ground_y = front_y + (z_max - max(0.0, z_min)) * ppm
    svg.line(front_x - 8, ground_y, front_x + plan_w + 8, ground_y,
             stroke=INK, width=1.4)
    _hatch_ground(svg, front_x - 8, front_x + plan_w + 8, ground_y)
    svg.text(front_x + plan_w + 10, ground_y + 3, "± 0.000  FFL", size=8.6,
             fill=MUTED)
    dim_v(svg, front_y + (z_max - z_max) * ppm, ground_y, front_x - 16, H,
          ext_from=front_x, label=_fmt_mm(z_max - max(0.0, z_min)))
    # T-08: dashed buried drain laterals on the FRONT elevation (zone off-page → sump)
    _draw_elevation_buried_laterals(
        svg, parts, front_x, front_y, plan_w, front_h, "x", mx, mz, ground_y)

    # ───────────────────────── SIDE elevation ─────────────────────────
    svg.text(side_x, side_y - 30, "ELEVATION B–B", size=13, weight="bold",
             fill=EQ_INK, spacing="1.0")
    svg.text(side_x + 118, side_y - 30, "(looking east)", size=9.5, fill=MUTED)
    # side elevation: horizontal axis = plant WIDTH (y, north→south, matches plan
    # rows); vertical axis = plant HEIGHT (z). Width on paper = plan_h.
    _draw_elev_frame(svg, side_x, side_y, plan_h, front_h, W, H, ppm,
                     z_min, z_max, mz_base=side_y, horiz_label="WIDTH")
    # SAME _TagPlacer discipline + BOUNDS (v59 B–B: a ~6-tag pile-up over the tank
    # nest, X-106/EP-104 colliding, and right-edge tags clipped mid-word).
    _gy_s = side_y + (z_max - max(0.0, z_min)) * ppm
    side_tags = _TagPlacer(svg, bounds=_view_box(
        svg, "elevation-bb", side_x - 2, side_y - 44, side_x + plan_h + 2,
        _gy_s + 0.5))
    # the view TITLE + subtitle are OBSTACLES inside the bounds headroom
    side_tags.block(side_x - 4, side_y - 42, side_x + 212, side_y - 20)
    # reserve the ground row + the width dimension band ('33.12 m' / PLANT WIDTH):
    # the v55 regen showed a displaced tag overprinting the dim label without this.
    side_tags.block(side_x - 30, _gy_s + 0.5, side_x + plan_h + 40, _gy_s + 58)
    side_items = []
    for p in sorted(parts, key=lambda q: -(max(q.y1 - q.y0, 1) * max(q.z1 - q.z0, 1))):
        pw = (p.y1 - p.y0) * ppm
        ph = (p.z1 - p.z0) * ppm
        # plan rows run north(top)→south; keep the same handedness as the plan.
        px = side_x + (y_max - p.y1) * ppm
        py = side_y + (z_max - p.z1) * ppm
        _draw_elevation_item(svg, px, py, pw, ph, p)
        side_items.append((p, px, py, pw, ph))
    _singles_s, _ranges_s = _elevation_tag_groups(side_items)
    for label, cx, cy, size, anchor in _ranges_s + _singles_s:
        side_tags.add(cx, cy, label, size, anchor_pt=anchor)
    side_tags.flush()
    ground_ys = side_y + (z_max - max(0.0, z_min)) * ppm
    svg.line(side_x - 8, ground_ys, side_x + plan_h + 8, ground_ys,
             stroke=INK, width=1.4)
    _hatch_ground(svg, side_x - 8, side_x + plan_h + 8, ground_ys)
    dim_h(svg, side_x, side_x + plan_h, ground_ys + 30, W, ext_from=ground_ys)
    svg.text(side_x + plan_h / 2.0, ground_ys + 50, "PLANT WIDTH", size=8.6,
             anchor="middle", fill=MUTED, spacing="1.0")
    # T-08: dashed buried drain laterals on the SIDE elevation too
    def _my_side(y_mm):
        return (y_max - y_mm) * ppm
    _draw_elevation_buried_laterals(
        svg, parts, side_x, side_y, plan_h, front_h, "y", _my_side, mz, ground_ys)

    # ───────────────────────── EQUIPMENT SCHEDULE (right gutter) ──────────────
    # The schedule sits in the right-hand column BELOW the side elevation, where
    # both layouts leave clear whitespace — never overlapping the bottom title
    # strip. It is height-bounded; overflow is summarised as "+N more items".
    # FULL-WIDTH bottom strip (Tristan: "no reason you couldn't put the equipment
    # schedule in two columns") — the right gutter alone only fit one column and the
    # 72-item list overran into the title block. Spanning the sheet width lets the
    # schedule lay out in multiple legible columns.
    key_x = margin
    key_y = sched_top                       # below the front elevation (see sched_top above)
    key_w = width - 2 * margin
    key_h_max = (height - title_h - 30) - key_y
    _draw_key(svg, parts, keynotes, key_x, key_y, key_x + key_w, key_h_max)

    # ───────────────────────── scale bar + title block ───────────────────────
    bar_total = _nice_bar_mm(scale_S)
    bar_y = height - title_h - 26
    scale_bar(svg, margin + 6, bar_y, scale_S, ppm, bar_total)
    _draw_title_block(svg, archetype, meta, scale_S, width, height, title_h, L, W, H,
                      has_below_grade=has_below_grade)
    return svg.render()


def _draw_setout_grid(svg, ox, oy, pw, ph, L_mm, W_mm, ppm, axis="plan"):
    """A faint column/row SETTING-OUT GRID (datum lines A,B,C… / 1,2,3…) behind the
    plan — the layout engineer's reference frame. Grid pitch ≈ a round metre count
    that yields 4-8 divisions."""
    def _pitch(span_mm):
        for m in (2000, 5000, 10000, 20000, 50000):
            if span_mm / m <= 8:
                return m
        return 100000
    px_pitch = _pitch(L_mm)
    py_pitch = _pitch(W_mm)
    # vertical grid lines (columns 1,2,3 along x)
    n = 0
    xx = 0.0
    while xx <= L_mm + 1:
        gx = ox + xx * ppm
        svg.line(gx, oy - 6, gx, oy + ph, stroke=GRID_FAINT, width=0.9)
        svg.circle(gx, oy - 13, 6.5, stroke=DATUM_INK, width=0.8, fill=FILL_BG)
        svg.text(gx, oy - 10, str(n + 1), size=7.5, anchor="middle", fill=MUTED)
        xx += px_pitch
        n += 1
    # horizontal grid lines (rows A,B,C along y, top→down)
    n = 0
    yy = W_mm
    while yy >= -1:
        gy = oy + (W_mm - yy) * ppm
        svg.line(ox - 6, gy, ox + pw, gy, stroke=GRID_FAINT, width=0.9)
        svg.circle(ox - 13, gy, 6.5, stroke=DATUM_INK, width=0.8, fill=FILL_BG)
        svg.text(ox - 13, gy + 2.5, chr(ord("A") + n), size=7.5, anchor="middle",
                 fill=MUTED)
        yy -= py_pitch
        n += 1


def _draw_elev_frame(svg, ox, oy, pw, ph, horiz_mm, H_mm, ppm, z_min, z_max,
                     mz_base=None, horiz_label="LENGTH"):
    """A faint elevation backdrop: level datum lines every round metre count up the
    height, lightly labelled with the level in metres (the elevation grid)."""
    # level lines every round number of metres (aim 3-6 levels)
    for step in (2000, 5000, 10000, 20000):
        if H_mm / step <= 6:
            pitch = step
            break
    else:
        pitch = 50000
    lvl = 0.0
    while lvl <= z_max + 1:
        gy = oy + (z_max - lvl) * ppm
        if gy >= oy - 1 and gy <= oy + ph + 1:
            svg.line(ox, gy, ox + pw, gy, stroke=GRID_FAINT, width=0.8)
            svg.text(ox + pw + 4, gy + 3, f"+{lvl/1000:.0f}m" if lvl else "0",
                     size=7.5, fill=DATUM_INK)
        lvl += pitch


def _draw_elevation_item(svg, px, py, pw, ph, p: GAPart):
    """One equipment OUTLINE in an elevation. Cylinders (vessels/columns/tanks/
    stacks) draw as a capsule (rounded top) so they read as vessels, not boxes;
    everything else a rect. Tagging is NOT done here — the view collects its
    items and tags them in one pass via _elevation_tag_groups + _TagPlacer
    (range-collapse for stacked same-family nests, then the de-overlap ladder).

    below_grade items (sump / drainpit / manhole) draw with the SAME dashed +
    hatch below-grade convention as the plan (Sam Green SME review 2026-07-08) so
    a reader scanning either the plan OR an elevation sees the same buried signal."""
    pw = max(pw, 1.5)
    ph = max(ph, 1.5)
    fill = "url(#ug-hatch)" if p.is_below_grade else EQ_FILL
    dash = "5,3" if p.is_below_grade else None
    if p.is_round and p.shape == "tank" and ph > 8 and pw > 5:
        # Atmospheric OPEN-TOP process tank (RAS rearing tank etc.): a flat-top
        # cylindrical shell with a water-surface line — NOT a domed/capsule roof.
        # RAS rearing tanks (and most process tanks) are open to the atmosphere;
        # the capsule arc wrongly drew every tank with a dome (Tristan 2026-06-13).
        svg.rect(px, py, pw, ph, stroke=EQ_INK, width=1.4, fill=fill, dash=dash)
        wl = py + min(4.0, ph * 0.18)
        svg.line(px + 1.5, wl, px + pw - 1.5, wl, stroke=DATUM_INK, width=0.7)
    elif p.is_round and p.shape in ("tall_column", "tall_vessel", "vertical_vessel",
                                    "stack") and ph > 10 and pw > 5:
        rx = min(pw / 2.0, 9)
        svg.path(f"M {px:.1f} {py+rx:.1f} "
                 f"A {rx:.1f} {rx:.1f} 0 0 1 {px+pw:.1f} {py+rx:.1f} "
                 f"L {px+pw:.1f} {py+ph:.1f} L {px:.1f} {py+ph:.1f} Z",
                 stroke=EQ_INK, width=1.4, fill=fill)
        # tray ticks on a column
        if p.shape == "tall_column" and ph > 40:
            for k in range(1, 5):
                ty = py + rx + (ph - rx) * k / 5.0
                svg.line(px + 2, ty, px + pw - 2, ty, stroke=DATUM_INK, width=0.6)
    else:
        svg.rect(px, py, pw, ph, stroke=EQ_INK, width=1.4, fill=fill, dash=dash)


def _hatch_ground(svg, x0, x1, y):
    """45° ground hatch ticks below a datum line (the standard 'earth' symbol)."""
    n = int((x1 - x0) / 12)
    for i in range(max(n, 0) + 1):
        hx = x0 + i * 12
        svg.line(hx, y, hx - 6, y + 6, stroke=MUTED, width=0.7)


def _collapse_schedule(parts):
    """Build the schedule rows: consecutive items that share the SAME letter family
    AND the SAME name collapse to one range row (e.g. 15 battery racks → 'BR-101…
    BR-115  Battery / equipment rack  ×15'), so the schedule is concise. Returns a
    list of (tag_label, name) in equipment-tag order."""
    # PROCESS ORDER first (manifest region_rank — feed → treatment → product →
    # utilities), then tag family/number so range-collapsing still finds its
    # consecutive runs within a region. Was tag-letter-alphabetical, which
    # scattered the schedule's reading order across the process.
    items = sorted(parts, key=lambda p: (p.rank, p.tag.split("-")[0],
                                         _tag_num(p.tag), p.tag))
    rows = []
    i = 0
    n = len(items)
    while i < n:
        j = i
        fam = items[i].tag.split("-")[0]
        nm = items[i].name
        while (j + 1 < n and items[j + 1].tag.split("-")[0] == fam
               and items[j + 1].name == nm):
            j += 1
        # BELOW-GRADE suffix (Sam Green SME review 2026-07-08): the schedule row for
        # a sump/drainpit reads "below grade" so the tag-only plan/elevation symbol
        # isn't the only place the reader can tell it's buried.
        nm_out = nm + ("  · below grade" if items[i].is_below_grade else "")
        if j > i:
            rows.append((f"{items[i].tag}…{items[j].tag}",
                         f"{nm_out}  ×{j - i + 1}"))
        else:
            rows.append((items[i].tag, nm_out))
        i = j + 1
    return rows


def _tag_num(tag):
    m = re.search(r"-(\d+)$", tag or "")
    return int(m.group(1)) if m else 0


# The in-drawing schedule shows only the PRINCIPAL equipment (largest plan footprints) —
# a 39-row full schedule shrank to an unreadable 8 px row height and overran into the
# scale bar (v54, 2026-07-02). The FULL list lives in the dossier's Part names tab; the
# panel says so explicitly. Universal: selection is by footprint geometry, never a class.
_GA_SCHED_MAX_ROWS = 10


def _principal_schedule_rows(parts):
    """(rows, total_rows, total_items): the collapsed schedule rows for the largest-
    footprint principals (≤ _GA_SCHED_MAX_ROWS rows), plus the FULL collapsed-row and
    item counts for the pointer note.

    COLLAPSE FIRST, THEN CAP — never the reverse (BESS-containerised fix, 2026-07-05):
    the old order picked the top-N-by-RAW-footprint PARTS first (with a '+6 headroom'
    fudge for ranges) and only THEN collapsed same-family runs. A wide same-family
    run (13 battery racks) fills most of that raw-item headroom on its own, so two
    genuinely distinct standalone principals (BMS-101 'BMS master housing', EQ-101
    'EMS industrial PC' — both real BoM tags, not synthetic placeholders) fell OUTSIDE
    the top-(10+6) raw slice and were silently dropped from the schedule entirely —
    even though the FULL range-collapse of all 21 BESS parts is only 9 rows, comfortably
    under the 10-row cap. Every manifest principal must get a row whenever the honestly-
    collapsed list already fits the cap; the fallback (large multi-service plants like
    the water GA's 49 parts -> 37 collapsed rows, still over the cap) truncates the
    COLLAPSED ROWS by each row's own representative footprint — a family's single range
    row now competes fairly against a standalone principal on genuine size, not on how
    many raw un-collapsed instances happened to occupy the pre-collapse top-N slice.
    Deterministic (area then tag)."""
    all_rows = _collapse_schedule(parts)
    if len(all_rows) <= _GA_SCHED_MAX_ROWS:
        return all_rows, len(all_rows), len(parts)
    area_by_tag = {p.tag: max(p.x1 - p.x0, 1.0) * max(p.y1 - p.y0, 1.0) for p in parts}

    def _row_area(row):
        return area_by_tag.get(row[0].split("…")[0], 0.0)

    ranked = sorted(all_rows, key=lambda r: (-_row_area(r), r[0]))
    selected = set(ranked[:_GA_SCHED_MAX_ROWS])
    # keep the SCHEDULE's own process-flow reading order (all_rows is already sorted
    # that way by _collapse_schedule) — area only drives WHICH rows are kept, not the
    # order they print in, exactly like the pre-fix schedule always read.
    rows = [r for r in all_rows if r in selected]
    return rows, len(all_rows), len(parts)


def _key_panel_height(parts) -> float:
    """The EXACT height _draw_key will draw — shared with the sheet-size computation so
    the scale bar / title block can never collide with the panel (v54: 'SCALE 1:500'
    overprinted the schedule rows)."""
    rows, total_rows, _ = _principal_schedule_rows(parts)
    note_h = 16 if total_rows > len(rows) else 0
    return 20 + len(rows) * 13.0 + note_h + 8


def _draw_key(svg, parts, keynotes, x, y, x_right, h_max):
    """PRINCIPAL-EQUIPMENT schedule: a bounded, boxed tag→name table of the largest
    items only, with a pointer to the dossier's Part names tab for the full list.
    Fixed 13 px rows — always legible, never shrunk to fit an unbounded list."""
    bw = max(x_right - x, 260)
    rows, total_rows, total_items = _principal_schedule_rows(parts)
    header_h = 20
    rh = 13.0
    fs = 8.2
    pad = 8
    note_h = 16 if total_rows > len(rows) else 0
    panel_h = header_h + len(rows) * rh + note_h + pad
    svg.rect(x, y, bw, panel_h, stroke=GRID_FAINT, width=1.1, fill=FILL_BG)
    svg.rect(x, y, bw, header_h, stroke=GRID_FAINT, width=1.1, fill=PANEL_BG)
    title = (f"PRINCIPAL EQUIPMENT  (top {len(rows)} of {total_items} items by footprint)"
             if note_h else f"EQUIPMENT SCHEDULE  ({total_items} items)")
    svg.text(x + 8, y + 14, title, size=9.5, weight="bold", fill=MUTED)
    yy = y + header_h + 11
    for tag, name in rows:
        svg.text(x + 8, yy, tag, size=fs + 0.2, weight="bold", fill=EQ_INK)
        svg.text(x + 150, yy, name, size=fs, fill=MUTED)
        yy += rh
    if note_h:
        svg.text(x + 8, yy + 3,
                 f"Equipment schedule: see the Part names tab of the dossier for the "
                 f"full {total_items}-item list (tag · name · duty).",
                 size=8.2, fill=EQ_INK, weight="bold")


def _draw_title_block(svg, archetype, meta, scale_S, width, height, title_h, L, W, H,
                      has_below_grade=False):
    """Standard GA title block — bottom strip with a description panel (left) and a
    drawing-metadata box (right), mirroring the SLD / P&ID."""
    y0 = height - title_h + 24
    x0 = 30
    x1 = width - 30
    svg.line(x0, y0, x1, y0, stroke=INK, width=1.6)

    bw = 320
    bx0 = x1 - bw
    by0 = y0 + 14
    rows = [("DRAWING No.", "FF-GA-001"),
            ("REV", _tb.REV),
            ("DATE", _ISSUE_DATE or "—  "),
            ("SCALE", f"1:{int(scale_S)}  (@ A1)")]
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
    svg.text(x0, y0 + 43, f"GENERAL ARRANGEMENT — {_humanise(archetype)}",
             size=15, weight="bold", fill=EQ_INK)
    svg.text(x0, y0 + 61,
             f"Overall plant envelope {L/1000:.1f} m (L) × {W/1000:.1f} m (W) × "
             f"{H/1000:.1f} m (H) · {meta.get('count', 0)} equipment items.",
             size=9.5, fill=MUTED)
    svg.text(x0, y0 + 79,
             "Plan + two elevations · dimensions in millimetres unless noted · "
             "datum ± 0.000 = finished floor level.", size=9.0, fill=MUTED)
    svg.text(x0, y0 + 96,
             "Projected from the as-placed equipment manifest (ForgeOS universal "
             "CAD). Equipment outlines + setting-out only.", size=9.0, fill=MUTED)
    svg.text(x0, y0 + 113,
             "NOT FOR CONSTRUCTION — preliminary auto-generated arrangement; "
             "verify against the P&ID + single-line before issue.",
             size=9.0, fill="#a4332a", weight="bold")
    # shared general-tolerance note (ONE source of truth: drawing_titleblock.py)
    svg.text(x0, y0 + 130, _tb.TOLERANCE_NOTE, size=8.6, fill=MUTED)
    if has_below_grade:
        svg.text(x0, y0 + 146,
                 "Hatched / dashed outline = BELOW-GRADE item (sump, drainpit, "
                 "manhole) — buried below the ± 0.000 slab; see the P&ID for its "
                 "gravity drain run.", size=8.6, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# RASTERISATION  (SVG → PNG) — identical cascade to the SLD / P&ID
# ═══════════════════════════════════════════════════════════════════════════

def _svg_dims(svg_text: str):
    mw = re.search(r'<svg[^>]*\bwidth="([\d.]+)"', svg_text)
    mh = re.search(r'<svg[^>]*\bheight="([\d.]+)"', svg_text)
    return (int(math.ceil(float(mw.group(1)))) if mw else 1200,
            int(math.ceil(float(mh.group(1)))) if mh else 800)


def rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
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
    chrome = _find_chrome()
    if chrome:
        try:
            subprocess.run(
                [chrome, "--headless", "--disable-gpu", "--no-sandbox",
                 f"--screenshot={png_path}",
                 f"--window-size={w},{h}",
                 f"--force-device-scale-factor={scale}",
                 "--default-background-color=FFFFFFFF",
                 "--hide-scrollbars", f"file://{Path(svg_path).resolve()}"],
                check=True, capture_output=True, timeout=90)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception as ex:
            print(f"[ga] chrome rasterise failed: {ex}")
    return False


def _find_chrome():
    for c in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ):
        if Path(c).is_file():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def _load_state(out_dir: str, state_path: Optional[str]) -> dict:
    """Load the archetype state.json (for the ledger slab area), or {} if absent."""
    for c in ([Path(state_path)] if state_path else []) + [Path(out_dir) / "state.json"]:
        if c and c.is_file():
            try:
                with open(c) as fh:
                    return json.load(fh)
            except Exception:
                return {}
    return {}


def _apply_building_envelope(parts: list, bbox: dict, state: dict,
                             rooms: Optional[list] = None):
    """Make the DRAWN building footprint match the LEDGER slab area (the #122 one-source
    rule): when the ledger carries a floor-slab / building-footprint area, draw the building
    at THAT area (not the equipment-placement bbox, which can be a long ribbon) and uniformly
    scale every part INTO that envelope so the kit sits within walls that match the slab the
    BoM costs. No-op (returns the inputs unchanged) for a design with no building slab — a
    skid / turbine / satellite is untouched. Deterministic; universal.

    `rooms` (optional, mutated in place): the function-segregated plant ROOM rects
    (RULE 6) must scale/translate with the SAME transform as the equipment they wall
    in, or the drawn walls would drift off the parts they're meant to enclose."""
    build_bb, tf = _be.building_bbox(state, bbox)
    if build_bb is None:
        return parts, bbox
    for p in parts:
        p.x0, p.y0 = tf(p.x0, p.y0)
        p.x1, p.y1 = tf(p.x1, p.y1)
        p.cx, p.cy = tf(p.cx, p.cy)
        if p.x1 < p.x0:
            p.x0, p.x1 = p.x1, p.x0
        if p.y1 < p.y0:
            p.y0, p.y1 = p.y1, p.y0
    for rm in (rooms or []):
        rm["x0"], rm["y0"] = tf(rm["x0"], rm["y0"])
        rm["x1"], rm["y1"] = tf(rm["x1"], rm["y1"])
        if rm["x1"] < rm["x0"]:
            rm["x0"], rm["x1"] = rm["x1"], rm["x0"]
        if rm["y1"] < rm["y0"]:
            rm["y0"], rm["y1"] = rm["y1"], rm["y0"]
        d = rm.get("door")
        if d:
            d["x0"], d["y0"] = tf(d["x0"], d["y0"])
            d["x1"], d["y1"] = tf(d["x1"], d["y1"])
    return parts, build_bb


def generate_ga(out_dir: str, state_path: Optional[str] = None,
                manifest_path: Optional[str] = None, rasterise_png: bool = True):
    """Full pipeline: load manifest → project → draw → write SVG (+ PNG)."""
    global _ISSUE_DATE
    # deterministic title-block issue date from the run's own artifacts (set before draw).
    _ISSUE_DATE = _tb.issue_date(out_dir)
    parts, bbox, meta = load_manifest(out_dir, manifest_path)
    rooms = meta.get("rooms") or []
    # the building rectangle is derived from the LEDGER slab area, with equipment fitted
    # inside it — so the GA envelope matches the slab the BoM costs (not the placement spread).
    parts, bbox = _apply_building_envelope(parts, bbox, _load_state(out_dir, state_path), rooms)
    archetype = _archetype_name(out_dir, state_path)
    svg_text = build_ga_svg(parts, bbox, archetype, meta, rooms)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "general-arrangement.svg"
    png_path = draw_dir / "general-arrangement.png"
    svg_path.write_text(svg_text)
    png_ok = rasterise(svg_path, png_path) if rasterise_png else False

    # print-ready ISO A1 PDF set — the SAME additive, non-fatal contract as the P&ID /
    # BFD / single-line generators (reviewers 2026-07-02: the GA was the only system
    # drawing without one, so the workbook's drawing register had nothing to point at).
    # The SVG master above is untouched; a1_print paginates onto multiple A1 sheets when
    # one sheet would print the smallest lettering below 2.5 mm (ISO 3098).
    a1 = None
    try:
        import a1_print
        a1 = a1_print.export_a1(svg_path, base="ga", title="General Arrangement")
    except Exception as ex:  # noqa: BLE001 — the A1 print set never blocks the drawing
        print(f"[ga] A1 PDF export skipped: {type(ex).__name__}: {ex}")

    summary = {
        "archetype": archetype,
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "a1": a1,
        "equipment": len(parts),
        "plant_L_m": round((bbox.get("length_mm")
                            or (bbox.get("x_max_mm", 0) - bbox.get("x_min_mm", 0)))
                           / 1000.0, 2),
        "plant_W_m": round((bbox.get("width_mm")
                            or (bbox.get("y_max_mm", 0) - bbox.get("y_min_mm", 0)))
                           / 1000.0, 2),
        "plant_H_m": round((bbox.get("height_mm")
                            or (bbox.get("z_max_mm", 0) - bbox.get("z_min_mm", 0)))
                           / 1000.0, 2),
    }
    return summary, parts, svg_text


def _selftest() -> int:
    """proveCatch the tag de-overlap (GA fix 7, reviewers 2026-07-02 — the v55
    'TK-TK-113' / 'TK-1TK-11K-105' garbled small-tank nest): (1) tags registered at
    colliding positions resolve to DISJOINT bboxes with leader lines; (2) a tag with
    clear air stays EXACTLY in place (no false displacement); (3) the pass is
    deterministic (same input → byte-identical SVG)."""
    bad = 0

    def _render(tags):
        svg = SVG(400, 200)
        pl = _TagPlacer(svg)
        for x, y, t in tags:
            pl.add(x, y, t, 9.0, anchor_pt=(x, y - 3.2))
        pl.flush()
        return svg.render(), pl

    # 1 — the v55 nest: three tags stamped ~8 px apart (text ~34 px wide) must
    #     resolve to pairwise-disjoint bboxes and draw leaders for the moved ones.
    nest = [(100.0, 60.0, "TK-113"), (108.0, 60.0, "TK-111"), (116.0, 60.0, "TK-105")]
    txt1, pl1 = _render(nest)
    for i in range(len(pl1._placed)):
        for j in range(i + 1, len(pl1._placed)):
            if _TagPlacer._hits(pl1._placed[i], pl1._placed[j]):
                print("  FAIL ga-tags: resolved labels still overlap "
                      f"({pl1._placed[i]} vs {pl1._placed[j]})")
                bad += 1
    if txt1.count("<line") < 2:
        print(f"  FAIL ga-tags: the two displaced labels must each draw a leader "
              f"line (got {txt1.count('<line')})")
        bad += 1
    if "TK-113" not in txt1 or "TK-111" not in txt1 or "TK-105" not in txt1:
        print("  FAIL ga-tags: every registered tag must still render")
        bad += 1
    # 1b — EXTREME pile-up proveCatch (Codema 1538 G9): many tags at the SAME
    #     anchor must still resolve to pairwise-disjoint bboxes. The old fallback
    #     stamped every exhausted tag at (x, y−9·step) without re-checking
    #     `_placed` — two tags landed on one slot → >20% IoU. Universal geometry.
    dense = [(200.0, 100.0, f"TK-{101 + i}") for i in range(12)]
    _td, pld = _render(dense)
    for i in range(len(pld._placed)):
        for j in range(i + 1, len(pld._placed)):
            if _TagPlacer._hits(pld._placed[i], pld._placed[j]):
                print("  FAIL ga-tags-dense: extreme nest still overlaps "
                      f"({pld._placed[i]} vs {pld._placed[j]})")
                bad += 1
                break
        else:
            continue
        break
    # 2 — the OTHER direction: a lone tag must stay exactly in place, no leader.
    txt2, pl2 = _render([(100.0, 60.0, "TK-101")])
    if '<line' in txt2:
        print("  FAIL ga-tags: an uncontested tag must NOT grow a leader")
        bad += 1
    if 'y="60.0"' not in txt2 and 'y="60"' not in txt2:
        print("  FAIL ga-tags: an uncontested tag must stay at its in-place baseline")
        bad += 1
    # 3 — determinism: the same registration sequence renders byte-identically.
    txt1b, _ = _render(nest)
    if txt1 != txt1b:
        print("  FAIL ga-tags: de-overlap pass must be deterministic")
        bad += 1
    # 4 — SMALL-PART FULL-TAG proveCatch (v58b GA coverage 24/37): a part whose
    #     footprint is too small for an in-place tag (<16×11 px at the chosen scale)
    #     must STILL emit its FULL equipment tag into the SVG text — the old numeric-
    #     suffix balloon left P-101/P-104/P-106/M-101/I-102 drawn but unidentifiable.
    #     A 600×510 mm pump inside a 30×20 m plant forces the small-part path.
    small = GAPart(tag="P-106", obj_tag="p106", name="Fertigation Dosing Pump",
                   module="m", shape="box", qty=1, is_round=False,
                   x0=5000, x1=5600, y0=5000, y1=5510, z0=0, z1=660,
                   cx=5300, cy=5255)
    big = GAPart(tag="T-101", obj_tag="t101", name="Fresh Water Storage Tank",
                 module="m", shape="tank", qty=1, is_round=True,
                 x0=10000, x1=16000, y0=8000, y1=14000, z0=0, z1=4000,
                 cx=13000, cy=11000)
    bbox = {"x_min_mm": 0, "x_max_mm": 30000, "y_min_mm": 0, "y_max_mm": 20000,
            "z_min_mm": 0, "z_max_mm": 5000}
    svg_txt = build_ga_svg([big, small], bbox, "water_treatment", {"count": 2})
    if ">P-106<" not in svg_txt:
        print("  FAIL ga-small-tag: a drawn-but-tiny part must carry its FULL tag "
              "in the GA text (P-106 absent — the v58b untagged-pump defect)")
        bad += 1
    if ">T-101<" not in svg_txt:
        print("  FAIL ga-small-tag: the large part's in-place tag must still render")
        bad += 1
    if build_ga_svg([big, small], bbox, "water_treatment", {"count": 2}) != svg_txt:
        print("  FAIL ga-small-tag: the GA render must stay deterministic")
        bad += 1
    # 5 — ELEVATION proveCatch (the v59 GA: BOTH elevations failed a 5-second glance —
    #     a ~6-tag pile-up over the tank nest projected edge-on, tags over the view
    #     titles, and the B–B right edge clipping tags mid-word). Adversarial input:
    #     a 2×4 nest of SAME-NAME tanks (projects to ONE stacked column in each
    #     elevation) + a long-tagged part hard against the plant's far edge. Must
    #     yield: (a) a same-name consecutive RANGE tag (the schedule's own collapse
    #     rule) instead of 8 stacked labels; (b) `data-viewbox` bounds markers for
    #     all three views; (c) a CLEAN drawing_gates G9 verdict — no two tag bboxes
    #     >20% overlapped, nothing outside its view border box.
    nest = []
    for i in range(8):
        col, row = i % 2, i // 2
        x0 = 20000 + col * 1300
        y0 = 6000 + row * 1300
        nest.append(GAPart(tag=f"TK-1{i+3:02d}", obj_tag=f"tk1{i+3:02d}",
                           name="Nutrient Tank", module="m", shape="tank", qty=1,
                           is_round=True, x0=x0, x1=x0 + 1200, y0=y0, y1=y0 + 1200,
                           z0=0, z1=2000, cx=x0 + 600, cy=y0 + 600))
    edge = GAPart(tag="TX-101", obj_tag="tx101", name="Transformer", module="m",
                  shape="box", qty=1, is_round=False,
                  x0=28000, x1=29900, y0=18000, y1=19900, z0=0, z1=2200,
                  cx=28950, cy=18950)
    bbox2 = {"x_min_mm": 0, "x_max_mm": 30000, "y_min_mm": 0, "y_max_mm": 20000,
             "z_min_mm": 0, "z_max_mm": 4000}
    svg_nest = build_ga_svg([big] + nest + [edge], bbox2, "water_treatment",
                            {"count": 10})
    if ">TK-103…TK-110<" not in svg_nest:
        print("  FAIL ga-elev-range: an edge-on same-name tank nest must collapse to "
              "ONE range tag (TK-103…TK-110) in the elevations — the v59 B–B pile-up")
        bad += 1
    # 5b — PAIR range-collapse proveCatch (Codema 1538): two same-NAME tanks whose
    #     elevation footprints overlap must collapse to ONE 'TK-110…TK-111' range,
    #     not two singles that G9 scores as a pile-up. Cluster threshold is ≥2
    #     (was ≥3 — a pair slipped through). Universal — geometry + same-name.
    pair = [
        GAPart(tag="TK-110", obj_tag="tk110", name="Drain Collection Sump",
               module="m", shape="tank", qty=1, is_round=True,
               x0=2000, x1=3200, y0=2000, y1=3200, z0=0, z1=1400,
               cx=2600, cy=2600, is_below_grade=True),
        GAPart(tag="TK-111", obj_tag="tk111", name="Drain Collection Sump",
               module="m", shape="tank", qty=1, is_round=True,
               x0=2100, x1=3300, y0=2100, y1=3300, z0=0, z1=1400,
               cx=2700, cy=2700, is_below_grade=True),
    ]
    bbox_pair = {"x_min_mm": 0, "x_max_mm": 10000, "y_min_mm": 0, "y_max_mm": 8000,
                 "z_min_mm": 0, "z_max_mm": 3000}
    svg_pair = build_ga_svg(pair, bbox_pair, "generic", {"count": 2})
    if ">TK-110…TK-111<" not in svg_pair:
        print("  FAIL ga-elev-pair-range: overlapping same-name pair must collapse "
              "to ONE range tag (TK-110…TK-111) — the Codema 1538 G9 pile-up")
        bad += 1
    try:
        import drawing_gates as _dg
        _fp = _dg.tag_legibility_findings(svg_pair)
        if any("TK-110" in f and "TK-111" in f for f in _fp):
            print(f"  FAIL ga-elev-pair-legible: G9 must not flag the ranged pair, "
                  f"got {_fp[:3]}")
            bad += 1
    except ImportError:
        pass
    for vb in ("plan", "elevation-aa", "elevation-bb"):
        if f'data-viewbox="{vb}"' not in svg_nest:
            print(f"  FAIL ga-viewbox: the {vb} bounds marker must be emitted (the "
                  "one-shared-rule box drawing_gates G9 re-checks)")
            bad += 1
    try:
        import drawing_gates as _dg
        _f9 = _dg.tag_legibility_findings(svg_nest)
        if _f9:
            print(f"  FAIL ga-elev-legible: G9 must pass the generated GA clean, got "
                  f"{len(_f9)}: {_f9[:3]}")
            bad += 1
    except ImportError:
        pass
    # 6 — SCHEDULE collapse-BEFORE-cap proveCatch (BESS containerised, 2026-07-05):
    #     adversarial input = one huge same-family run (13 battery racks, which used
    #     to fill the old pre-collapse '+6 headroom' slice on raw-part count alone)
    #     PLUS two small standalone principals with real BoM tags. The FULL collapse
    #     is only 9 rows — under the cap — so every principal (including the small
    #     ones) MUST appear; nothing may be dropped just because a family is wide.
    rack_nest = [GAPart(tag=f"BR-{101+i}", obj_tag=f"br{101+i}", name="rack wiring carrier",
                        module="m", shape="box", qty=1, is_round=False,
                        x0=i * 700, x1=i * 700 + 600, y0=0, y1=1200, z0=0, z1=2200,
                        cx=i * 700 + 300, cy=600, rank=1)
                 for i in range(13)]
    standalones = [
        GAPart(tag="BMS-101", obj_tag="bms101", name="BMS master housing", module="m",
               shape="box", qty=1, is_round=False, x0=9500, x1=9700, y0=1400, y1=1500,
               z0=0, z1=600, cx=9600, cy=1450, rank=2),
        GAPart(tag="EQ-101", obj_tag="eq101", name="EMS industrial PC", module="m",
               shape="box", qty=1, is_round=False, x0=9800, x1=9950, y0=1400, y1=1470,
               z0=0, z1=400, cx=9875, cy=1435, rank=3),
    ]
    sched_rows, sched_total, sched_items = _principal_schedule_rows(rack_nest + standalones)
    if len(sched_rows) != sched_total:
        print(f"  FAIL ga-sched-cap: a fully-collapsed schedule ({sched_total} rows) "
              f"under the {_GA_SCHED_MAX_ROWS}-row cap must show EVERY row, got "
              f"{len(sched_rows)}")
        bad += 1
    sched_tags = {r[0] for r in sched_rows}
    if "BMS-101" not in sched_tags or "EQ-101" not in sched_tags:
        print("  FAIL ga-sched-cap: a wide rack family must not crowd out standalone "
              f"principals with real BoM tags (got {sorted(sched_tags)})")
        bad += 1
    # 7 — BELOW-GRADE proveCatch/proveNoFalsePositive (Sam Green SME review
    #     2026-07-08, Renders J3: "a lot would have to be underground for
    #     drainage"). A drainpit/sump must render with the hatch fill + dashed
    #     outline + the title-block note; an all-pressurised design (no sump) must
    #     show NONE of that — the below-grade signal must never false-positive on
    #     an ordinary at-grade tank.
    sump = GAPart(tag="TK-114", obj_tag="tk114", name="Drain Collection Sump",
                  module="m", shape="tank", qty=1, is_round=True,
                  x0=2000, x1=4100, y0=2000, y1=4100, z0=0, z1=1400,
                  cx=3050, cy=3050, is_below_grade=True)
    tank = GAPart(tag="TK-106", obj_tag="tk106", name="Drain Water Tank",
                  module="m", shape="tank", qty=1, is_round=True,
                  x0=8000, x1=11700, y0=2000, y1=5700, z0=0, z1=2563,
                  cx=9850, cy=3850, is_below_grade=False)
    bbox3 = {"x_min_mm": 0, "x_max_mm": 20000, "y_min_mm": 0, "y_max_mm": 15000,
             "z_min_mm": 0, "z_max_mm": 4000}
    svg_ug = build_ga_svg([sump, tank], bbox3, "water_treatment", {"count": 2})
    if "url(#ug-hatch)" not in svg_ug or 'dasharray="5,3"' not in svg_ug:
        print("  FAIL ga-below-grade: a drainpit/sump must render with the "
              "below-grade hatch fill + dashed outline")
        bad += 1
    if "below grade" not in svg_ug.lower():
        print("  FAIL ga-below-grade: the schedule/title-block must note the "
              "below-grade item in text, not just a graphic convention")
        bad += 1
    all_pressurised = build_ga_svg([tank], bbox3, "water_treatment", {"count": 1})
    if "url(#ug-hatch)" in all_pressurised or "below grade" in all_pressurised.lower():
        print("  FAIL ga-below-grade-fp: an all-above-grade design (no sump) must "
              "show NO below-grade signal")
        bad += 1
    # 7b — T-27 EXTERNAL DRAIN / MANHOLE proveCatch/proveNoFalsePositive.
    # A below-grade sump must emit an EXT. DRAIN annotation + manhole outside the
    # plant envelope; an all-above-grade design must show none.
    if "EXT. DRAIN" not in svg_ug:
        print("  FAIL ga-ext-drain: a below-grade sump must annotate an external "
              "drain/manhole outside the plant envelope (T-27)")
        bad += 1
    if "TK-114" not in svg_ug:
        print("  FAIL ga-ext-drain: the external drain label must carry the sump tag")
        bad += 1
    if "EXT. DRAIN" in all_pressurised:
        print("  FAIL ga-ext-drain-fp: an all-above-grade design must NOT emit "
              "external drain annotations")
        bad += 1
    # 7b2 — EXT. DRAIN same-edge de-overlap proveCatch (Codema 2026-07-09
    #     tag_legibility ESCALATE ×5: 'TK-110' ∩ 'TK-111' = 60% of the smaller
    #     bbox). Adversarial input = TWO same-NAME Drain Collection Sumps at the
    #     SAME plan Y (both nearest the left envelope edge) + a differently-named
    #     nursery sump. Must: (a) range-collapse the same-name consecutive pair to
    #     ONE 'TK-110…TK-111' EXT. DRAIN label (not two piled-up singles); (b) keep
    #     the differently-named sump as its own annotation; (c) pass drawing_gates
    #     G9 (no tag IoU >20%). The old outward-only stagger left both labels on
    #     the same baseline 10 px apart — this is the catch that proves the fix.
    sump_a = GAPart(tag="TK-110", obj_tag="tk110", name="Drain Collection Sump",
                    module="m", shape="tank", qty=1, is_round=True,
                    x0=-6826 - 1050, x1=-6826 + 1050, y0=-1050, y1=1050,
                    z0=-909, z1=491, cx=-6826, cy=0, is_below_grade=True)
    sump_b = GAPart(tag="TK-111", obj_tag="tk111", name="Drain Collection Sump",
                    module="m", shape="tank", qty=1, is_round=True,
                    x0=-4474 - 1050, x1=-4474 + 1050, y0=-1050, y1=1050,
                    z0=-909, z1=491, cx=-4474, cy=0, is_below_grade=True)
    sump_c = GAPart(tag="TK-112", obj_tag="tk112",
                    name="Nursery Drain Collection Sump", module="m",
                    shape="tank", qty=1, is_round=True,
                    x0=-1950 - 1050, x1=-1950 + 1050, y0=-1050, y1=1050,
                    z0=-915, z1=485, cx=-1950, cy=0, is_below_grade=True)
    bbox_edge = {"x_min_mm": -9000, "x_max_mm": 5000, "y_min_mm": -4000,
                 "y_max_mm": 4000, "z_min_mm": -1000, "z_max_mm": 3000}
    svg_edge = build_ga_svg([sump_a, sump_b, sump_c, tank], bbox_edge,
                            "water_treatment", {"count": 4})
    if "TK-110…TK-111" not in svg_edge:
        print("  FAIL ga-ext-drain-range: two same-name consecutive sumps on one "
              "envelope edge must collapse to ONE 'TK-110…TK-111' EXT. DRAIN "
              "label (the Codema TK-110∩TK-111 = 60% pile-up)")
        bad += 1
    # the differently-named nursery sump must NOT be swallowed into the range
    if svg_edge.count("EXT. DRAIN") < 2:
        print("  FAIL ga-ext-drain-range: a differently-named sump on the same "
              "edge must keep its own EXT. DRAIN annotation")
        bad += 1
    if ">TK-112<" not in svg_edge and "TK-112" not in svg_edge:
        print("  FAIL ga-ext-drain-range: the nursery sump's own tag must still "
              "appear (range-collapse is same-NAME only)")
        bad += 1
    try:
        import drawing_gates as _dg
        _f9e = _dg.tag_legibility_findings(svg_edge)
        if _f9e:
            print(f"  FAIL ga-ext-drain-legible: G9 must pass the same-edge sump "
                  f"GA clean (Codema catch — pile-up OR clip), got: {_f9e[:3]}")
            bad += 1
    except ImportError:
        pass
    # 7c — T-08 elevation buried drain laterals
    if "buried drain lateral" not in svg_ug.lower():
        print("  FAIL ga-T-08: elevation must draw dashed buried drain laterals "
              "from zone off-page to sumps")
        bad += 1
    if "buried drain lateral" in all_pressurised.lower():
        print("  FAIL ga-T-08-fp: all-above-grade design must NOT show buried laterals")
        bad += 1
    # 8 — CO-LOCATED STACK proveCatch/proveNoFalsePositive (the real Codema control-
    #     cabinet cluster EP-104/X-104/I-103/U-201, all at plan (x,y)=(-4150,9650) —
    #     4 nested rectangles rendered as an illegible 'bullseye'). proveCatch: 4 parts
    #     at the IDENTICAL plan centre collapse to ONE drawn box (the largest keeps
    #     its outline; the other 3 are skipped) but EVERY tag stays findable.
    #     proveNoFalsePositive: parts at genuinely DIFFERENT positions never collapse.
    stack = [
        GAPart(tag="X-104", obj_tag="x104", name="Electrical Control Panel", module="m",
               shape="box", qty=1, is_round=False, x0=-4150 - 355, x1=-4150 + 355,
               y0=9650 - 610, y1=9650 + 610, z0=482.5, z1=722.5, cx=-4150, cy=9650),
        GAPart(tag="EP-104", obj_tag="ep104", name="SCADA / Plant Control System",
               module="m", shape="box", qty=1, is_round=False, x0=-4150 - 287.5,
               x1=-4150 + 287.5, y0=9650 - 410, y1=9650 + 410, z0=675, z1=915,
               cx=-4150, cy=9650),
        GAPart(tag="I-103", obj_tag="i103", name="Digital Control Panel", module="m",
               shape="box", qty=1, is_round=False, x0=-4150 - 186.25, x1=-4150 + 186.25,
               y0=9650 - 285, y1=9650 + 285, z0=290, z1=530, cx=-4150, cy=9650),
        GAPart(tag="U-201", obj_tag="u201", name="Control + Instrument UPS", module="m",
               shape="box", qty=1, is_round=False, x0=-4150 - 300, x1=-4150 + 300,
               y0=9650 - 255, y1=9650 + 255, z0=165, z1=765, cx=-4150, cy=9650),
    ]
    skip = _colocated_box_skip(stack)
    if not (len(skip) == 3 and id(stack[0]) not in skip
            and all(id(m) in skip for m in stack[1:])):
        print("  FAIL ga-colocated: a 4-part control-cabinet stack at the IDENTICAL "
              "plan (x,y) must collapse to ONE drawn box (the largest kept, the "
              f"other 3 skipped) — got skip-set size {len(skip)}")
        bad += 1
    bbox4 = {"x_min_mm": -6000, "x_max_mm": -2000, "y_min_mm": 8000, "y_max_mm": 11000,
             "z_min_mm": 0, "z_max_mm": 2000}
    svg_stack = build_ga_svg(stack, bbox4, "water_treatment", {"count": 4})
    if not all(f">{p.tag}<" in svg_stack for p in stack):
        print("  FAIL ga-colocated: every co-located member must still have a "
              "findable tag on the sheet, even with its box outline skipped")
        bad += 1
    # a genuinely two-position layout must NOT collapse (proveNoFalsePositive).
    apart = [
        GAPart(tag="A-101", obj_tag="a101", name="Panel A", module="m", shape="box",
               qty=1, is_round=False, x0=0, x1=600, y0=0, y1=600, z0=0, z1=600,
               cx=300, cy=300),
        GAPart(tag="B-101", obj_tag="b101", name="Panel B", module="m", shape="box",
               qty=1, is_round=False, x0=5000, x1=5600, y0=0, y1=600, z0=0, z1=600,
               cx=5300, cy=300),
    ]
    if len(_colocated_box_skip(apart)) != 0:
        print("  FAIL ga-colocated-fp: two parts at genuinely DIFFERENT plan "
              "positions must never collapse into one box")
        bad += 1
    print("[ga] selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return 1 if bad else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] in ("--selftest", "selftest"):
        return _selftest()
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, _parts, _svg = generate_ga(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[ga] ERROR: {ex}")
        return 2
    print(f"[ga] archetype : {summary['archetype']}")
    print(f"[ga] equipment : {summary['equipment']}")
    print(f"[ga] envelope  : {summary['plant_L_m']} × {summary['plant_W_m']} × "
          f"{summary['plant_H_m']} m  (L×W×H)")
    print(f"[ga] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[ga] PNG → {summary['png']}")
    else:
        print("[ga] PNG not written (no rasteriser available — SVG is the master)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
