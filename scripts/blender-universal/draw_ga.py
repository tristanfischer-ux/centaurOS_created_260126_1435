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


def _round_extent(centre, half):
    return centre - half, centre + half


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
        parts.append(GAPart(
            tag=r.get("equipment_tag") or "?",
            obj_tag=r.get("tag") or "",
            name=r.get("name") or "",
            module=r.get("module") or "",
            shape=r.get("shape") or "",
            qty=int(r.get("qty") or 1),
            is_round=is_round,
            x0=x0, x1=x1, y0=y0, y1=y1, z0=z0, z1=z1, cx=x, cy=y,
            rank=int(r.get("region_rank") or 10**9)))

    bbox = man.get("bbox_mm") or {}
    if not bbox and parts:
        bbox = {
            "x_min_mm": min(p.x0 for p in parts), "x_max_mm": max(p.x1 for p in parts),
            "y_min_mm": min(p.y0 for p in parts), "y_max_mm": max(p.y1 for p in parts),
            "z_min_mm": min(p.z0 for p in parts), "z_max_mm": max(p.z1 for p in parts),
        }
    meta = {"count": man.get("count", len(parts)), "schema": man.get("schema", "")}
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
            f'<marker id="dim" markerWidth="12" markerHeight="12" refX="6" refY="5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,5 L11,1.5 L8.5,5 L11,8.5 Z" fill="{DIM_INK}"/></marker>'
            '</defs>')
        body = "\n".join(self.parts)
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

def _draw_equipment_rect(svg, px, py, pw, ph, round_plan, tag, show_tag=True,
                         tiny_fill=EQ_FILL):
    """Draw one equipment outline at paper (px,py) size (pw,ph). round_plan=True
    draws a circle (a vessel/tank footprint in PLAN) inscribed in the box."""
    if round_plan and pw > 4 and ph > 4:
        # plan footprint of a cylinder = a circle (diameter = the box) + a centre dot
        r = min(pw, ph) / 2.0
        ccx, ccy = px + pw / 2.0, py + ph / 2.0
        svg.circle(ccx, ccy, r, stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        svg.line(ccx - r, ccy, ccx + r, ccy, stroke=DATUM_INK, width=0.6, dash="4,3")
        svg.line(ccx, ccy - r, ccx, ccy + r, stroke=DATUM_INK, width=0.6, dash="4,3")
    else:
        svg.rect(px, py, max(pw, 1.5), max(ph, 1.5), stroke=EQ_INK, width=1.4,
                 fill=tiny_fill)
    if show_tag and pw >= 16 and ph >= 11:
        svg.text(px + pw / 2.0, py + ph / 2.0 + 3.2, tag, size=min(10.0, ph * 0.6),
                 anchor="middle", weight="bold", fill=EQ_INK)
        return True
    return False   # too small to label in place → caller adds a leader/keynote


# ═══════════════════════════════════════════════════════════════════════════
# MAIN LAYOUT
# ═══════════════════════════════════════════════════════════════════════════

def build_ga_svg(parts: list[GAPart], bbox: dict, archetype: str,
                 meta: dict) -> str:
    """Render the projected equipment as a GENERAL ARRANGEMENT: PLAN (top-left),
    FRONT elevation (below the plan, shared X), SIDE elevation (right of plan,
    shared Y), with overall + key dimensions, a scale bar, north arrow, grid,
    title block + key."""
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
    PLAN_MAX_W = 760.0     # px budget for the plan width (x)
    PLAN_MAX_H = 360.0     # px budget for the plan depth (y)
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
    title_h = 150
    gap = 96                 # gap between plan and the side elevation / dim gutters
    v_gap = 92               # gap between plan and front elevation (dim band)
    label_gutter = 30        # left gutter for the vertical (plant-width) dimension

    # PLAN block origin
    plan_x = margin + label_gutter + 34
    plan_y = margin + 54

    # SIDE elevation sits to the RIGHT of the plan, sharing the Y axis (plant width).
    side_x = plan_x + plan_w + gap
    side_y = plan_y
    side_w = elev_h          # side elevation width = plant HEIGHT (z), drawn L→R as z

    # FRONT elevation sits BELOW the plan, sharing the X axis (plant length).
    front_x = plan_x
    front_y = plan_y + plan_h + v_gap + 26
    front_h = elev_h

    width = max(side_x + side_w + margin + 30,
                plan_x + plan_w + margin + 30, 1080)
    # height covers the taller of (a) the front elevation below the plan and (b) the
    # equipment-schedule panel in the right gutter below the side elevation, so the
    # schedule never gets clipped or driven into the title block.
    n_sched_rows = max(8, min(len(parts), 16))
    # the schedule sits BELOW the front elevation (which is below the plan) — NOT just below
    # the plan TOP, or it covers the plan + front elevation (Tristan 2026-06-22: "the equipment
    # schedule is hiding most of the plans and elevations").
    sched_top = front_y + front_h + 56
    sched_bottom = sched_top + (20 + n_sched_rows * 13 + 8)
    height = max(front_y + front_h + 64, sched_bottom + 24) + title_h
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
    for p in sorted(parts, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.y1 - q.y0, 1))):
        pw = (p.x1 - p.x0) * ppm
        ph = (p.y1 - p.y0) * ppm
        px = plan_x + mx(p.x0)
        py = plan_y + my(p.y1)        # my inverts → top edge is the larger y
        labelled = _draw_equipment_rect(svg, px, py, pw, ph, p.is_round, p.tag)
        if not labelled:
            keynotes.append((p, px + pw / 2.0, py + ph / 2.0))
    # numbered balloons for unlabelled small items — but SKIP any balloon that would
    # land on top of one already drawn (within ~11 px), so the plan never becomes a
    # mass of overlapping circles; those items are still in the schedule.
    _draw_plan_keynotes(svg, keynotes, plan_x, plan_y, plan_w, plan_h)
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
    for p in sorted(parts, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.z1 - q.z0, 1))):
        pw = (p.x1 - p.x0) * ppm
        ph = (p.z1 - p.z0) * ppm
        px = front_x + mx(p.x0)
        py = front_y + (z_max - p.z1) * ppm
        _draw_elevation_item(svg, px, py, pw, ph, p, tag_axis="x")
    # ground / datum line + overall height dimension on the front elevation
    ground_y = front_y + (z_max - max(0.0, z_min)) * ppm
    svg.line(front_x - 8, ground_y, front_x + plan_w + 8, ground_y,
             stroke=INK, width=1.4)
    _hatch_ground(svg, front_x - 8, front_x + plan_w + 8, ground_y)
    svg.text(front_x + plan_w + 10, ground_y + 3, "± 0.000  FFL", size=8.6,
             fill=MUTED)
    dim_v(svg, front_y + (z_max - z_max) * ppm, ground_y, front_x - 16, H,
          ext_from=front_x, label=_fmt_mm(z_max - max(0.0, z_min)))

    # ───────────────────────── SIDE elevation ─────────────────────────
    svg.text(side_x, side_y - 30, "ELEVATION B–B", size=13, weight="bold",
             fill=EQ_INK, spacing="1.0")
    svg.text(side_x + 118, side_y - 30, "(looking east)", size=9.5, fill=MUTED)
    # side elevation: horizontal axis = plant WIDTH (y, north→south, matches plan
    # rows); vertical axis = plant HEIGHT (z). Width on paper = plan_h.
    _draw_elev_frame(svg, side_x, side_y, plan_h, front_h, W, H, ppm,
                     z_min, z_max, mz_base=side_y, horiz_label="WIDTH")
    for p in sorted(parts, key=lambda q: -(max(q.y1 - q.y0, 1) * max(q.z1 - q.z0, 1))):
        pw = (p.y1 - p.y0) * ppm
        ph = (p.z1 - p.z0) * ppm
        # plan rows run north(top)→south; keep the same handedness as the plan.
        px = side_x + (y_max - p.y1) * ppm
        py = side_y + (z_max - p.z1) * ppm
        _draw_elevation_item(svg, px, py, pw, ph, p, tag_axis="y")
    ground_ys = side_y + (z_max - max(0.0, z_min)) * ppm
    svg.line(side_x - 8, ground_ys, side_x + plan_h + 8, ground_ys,
             stroke=INK, width=1.4)
    _hatch_ground(svg, side_x - 8, side_x + plan_h + 8, ground_ys)
    dim_h(svg, side_x, side_x + plan_h, ground_ys + 30, W, ext_from=ground_ys)
    svg.text(side_x + plan_h / 2.0, ground_ys + 50, "PLANT WIDTH", size=8.6,
             anchor="middle", fill=MUTED, spacing="1.0")

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
    _draw_title_block(svg, archetype, meta, scale_S, width, height, title_h, L, W, H)
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


def _draw_elevation_item(svg, px, py, pw, ph, p: GAPart, tag_axis="x"):
    """One equipment outline in an elevation. Cylinders (vessels/columns/tanks/
    stacks) draw as a capsule (rounded top) so they read as vessels, not boxes;
    everything else a rect. Tag if it fits."""
    pw = max(pw, 1.5)
    ph = max(ph, 1.5)
    if p.is_round and p.shape == "tank" and ph > 8 and pw > 5:
        # Atmospheric OPEN-TOP process tank (RAS rearing tank etc.): a flat-top
        # cylindrical shell with a water-surface line — NOT a domed/capsule roof.
        # RAS rearing tanks (and most process tanks) are open to the atmosphere;
        # the capsule arc wrongly drew every tank with a dome (Tristan 2026-06-13).
        svg.rect(px, py, pw, ph, stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        wl = py + min(4.0, ph * 0.18)
        svg.line(px + 1.5, wl, px + pw - 1.5, wl, stroke=DATUM_INK, width=0.7)
    elif p.is_round and p.shape in ("tall_column", "tall_vessel", "vertical_vessel",
                                    "stack") and ph > 10 and pw > 5:
        rx = min(pw / 2.0, 9)
        svg.path(f"M {px:.1f} {py+rx:.1f} "
                 f"A {rx:.1f} {rx:.1f} 0 0 1 {px+pw:.1f} {py+rx:.1f} "
                 f"L {px+pw:.1f} {py+ph:.1f} L {px:.1f} {py+ph:.1f} Z",
                 stroke=EQ_INK, width=1.4, fill=EQ_FILL)
        # tray ticks on a column
        if p.shape == "tall_column" and ph > 40:
            for k in range(1, 5):
                ty = py + rx + (ph - rx) * k / 5.0
                svg.line(px + 2, ty, px + pw - 2, ty, stroke=DATUM_INK, width=0.6)
    else:
        svg.rect(px, py, pw, ph, stroke=EQ_INK, width=1.4, fill=EQ_FILL)
    if pw >= 16 and ph >= 12:
        svg.text(px + pw / 2.0, py + ph / 2.0 + 3.2, p.tag,
                 size=min(9.5, ph * 0.5), anchor="middle", weight="bold",
                 fill=EQ_INK)


def _hatch_ground(svg, x0, x1, y):
    """45° ground hatch ticks below a datum line (the standard 'earth' symbol)."""
    n = int((x1 - x0) / 12)
    for i in range(max(n, 0) + 1):
        hx = x0 + i * 12
        svg.line(hx, y, hx - 6, y + 6, stroke=MUTED, width=0.7)


def _draw_plan_keynotes(svg, keynotes, ox, oy, pw, ph):
    """Stamp the small unlabelled plan items with their equipment-tag NUMBER in a
    tiny balloon at the item centre. De-cluttered: a balloon that would overlap one
    already drawn (within ~12 px) is skipped (the item stays in the EQUIPMENT
    SCHEDULE + reads on the elevations), so a dense plan never piles balloons. The
    balloon shows the tag's numeric suffix only (e.g. '7' for V-107) to stay small;
    the schedule resolves it. Returns the count actually drawn."""
    placed = []
    drawn = 0
    for (p, cx, cy) in keynotes:
        if any((cx - ux) ** 2 + (cy - uy) ** 2 < 12.0 ** 2 for ux, uy in placed):
            continue
        m = re.search(r"-(\d+)$", p.tag)
        num = m.group(1) if m else "•"
        svg.circle(cx, cy, 6.2, stroke=EQ_INK, width=1.0, fill=FILL_BG)
        svg.text(cx, cy + 2.7, num, size=7.2, anchor="middle", weight="bold",
                 fill=EQ_INK)
        placed.append((cx, cy))
        drawn += 1
    return drawn


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
        if j > i:
            rows.append((f"{items[i].tag}…{items[j].tag}",
                         f"{nm}  ×{j - i + 1}"))
        else:
            rows.append((items[i].tag, nm))
        i = j + 1
    return rows


def _tag_num(tag):
    m = re.search(r"-(\d+)$", tag or "")
    return int(m.group(1)) if m else 0


def _draw_key(svg, parts, keynotes, x, y, x_right, h_max):
    """Equipment SCHEDULE: a bounded, boxed tag→name table. Repeated identical
    items collapse to a range row. Lays out in as many columns as needed to fit the
    available height h_max; overflow is summarised as '+N more items'. Boxed so it
    reads as a drawing panel, never colliding with the title block."""
    bw = max(x_right - x, 260)
    rows = _collapse_schedule(parts)
    header_h = 20
    rh = 13.0
    pad = 8
    # rows per column from the height budget
    body_h = max(h_max - header_h - pad, 13.0)
    # SHOW EVERY item (Tristan 2026-06-13: "show ALL of the equipment in the schedule,
    # not just a select few"). Never truncate: fit ALL rows by taking as many columns as
    # the panel width allows, then shrinking the row height to a legibility floor. The
    # panel grows within the right gutter if still needed.
    total = len(rows)
    # Column count is HEIGHT-driven: pick enough columns to keep each one a readable
    # length (~24 rows) at a legible row height, bounded by the panel width and a
    # 4-column cap; force ≥2 columns once the list is long (Tristan's explicit ask).
    max_cols_by_width = max(1, int(bw // 200))    # ≥200 px per column (tag + full name)
    target_cols = max(1, math.ceil(total / 24))
    ncol = max(1, min(max_cols_by_width, 4, target_cols))
    if total > 16:
        ncol = max(ncol, 2)
    rows_per_col = max(1, math.ceil(total / ncol))
    rh = max(8.0, min(13.0, body_h / rows_per_col))
    fs = max(5.6, min(8.2, rh * 0.62))            # font scales with row height
    shown = rows                                  # no cap, no overflow note
    panel_h = header_h + rows_per_col * rh + pad
    svg.rect(x, y, bw, panel_h, stroke=GRID_FAINT, width=1.1, fill=FILL_BG)
    svg.rect(x, y, bw, header_h, stroke=GRID_FAINT, width=1.1, fill=PANEL_BG)
    svg.text(x + 8, y + 14, f"EQUIPMENT SCHEDULE  ({total} items)", size=9.5, weight="bold", fill=MUTED)
    yy0 = y + header_h + 11
    actual_col_w = bw / ncol
    for idx, (tag, name) in enumerate(shown):
        col = idx // rows_per_col
        row = idx % rows_per_col
        cx = x + 8 + col * actual_col_w
        cy = yy0 + row * rh
        svg.text(cx, cy, tag, size=fs + 0.2, weight="bold", fill=EQ_INK)
        avail_chars = max(6, int((actual_col_w - 62) / (fs * 0.58)))
        nm = name if len(name) <= avail_chars else name[:max(avail_chars - 1, 4)] + "…"
        svg.text(cx + 56, cy, nm, size=fs, fill=MUTED)


def _draw_title_block(svg, archetype, meta, scale_S, width, height, title_h, L, W, H):
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
                 "--hide-scrollbars", f"file://{svg_path}"],
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


def _apply_building_envelope(parts: list, bbox: dict, state: dict):
    """Make the DRAWN building footprint match the LEDGER slab area (the #122 one-source
    rule): when the ledger carries a floor-slab / building-footprint area, draw the building
    at THAT area (not the equipment-placement bbox, which can be a long ribbon) and uniformly
    scale every part INTO that envelope so the kit sits within walls that match the slab the
    BoM costs. No-op (returns the inputs unchanged) for a design with no building slab — a
    skid / turbine / satellite is untouched. Deterministic; universal."""
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
    return parts, build_bb


def generate_ga(out_dir: str, state_path: Optional[str] = None,
                manifest_path: Optional[str] = None, rasterise_png: bool = True):
    """Full pipeline: load manifest → project → draw → write SVG (+ PNG)."""
    global _ISSUE_DATE
    # deterministic title-block issue date from the run's own artifacts (set before draw).
    _ISSUE_DATE = _tb.issue_date(out_dir)
    parts, bbox, meta = load_manifest(out_dir, manifest_path)
    # the building rectangle is derived from the LEDGER slab area, with equipment fitted
    # inside it — so the GA envelope matches the slab the BoM costs (not the placement spread).
    parts, bbox = _apply_building_envelope(parts, bbox, _load_state(out_dir, state_path))
    archetype = _archetype_name(out_dir, state_path)
    svg_text = build_ga_svg(parts, bbox, archetype, meta)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "general-arrangement.svg"
    png_path = draw_dir / "general-arrangement.png"
    svg_path.write_text(svg_text)
    png_ok = rasterise(svg_path, png_path) if rasterise_png else False

    summary = {
        "archetype": archetype,
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
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


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
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
