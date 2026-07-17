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
from placement_fp import (  # noqa: E402  (GA↔Blender QC token)
    embed_svg_placement_fp,
    extract_svg_placement_fp,
    load_manifest_placement_fp,
    placement_fingerprint,
)

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


def _instrument_envelope_bbox(ww: float, dd: float, hh: float) -> dict:
    return {
        "x_min_mm": -ww / 2.0, "x_max_mm": ww / 2.0,
        "y_min_mm": -dd / 2.0, "y_max_mm": dd / 2.0,
        "z_min_mm": 0.0, "z_max_mm": hh,
        "length_mm": ww, "width_mm": dd, "height_mm": hh,
    }


def _clamp_instrument_parts_to_envelope(
    parts: list[GAPart],
    ww: float,
    dd: float,
    hh: float,
) -> None:
    """Keep instrument GA proxy outlines inside the product envelope.

    INTENT: handheld instruments export hidden coverage proxies so Part names / GA
    can identify real parts. If an old proxy is product-sized or tall, the GA must
    still show a compact product envelope instead of reverting to plant-scale massing.

    GOTCHA: world-Z (~600 mm wall-mount) must NOT be clamped into hh — that piles
    every part at the top of a 120 mm envelope. XY/size clamp only; Z seating is
    `_seat_instrument_parts_in_form` (form-rule bands) before draw.
    """
    max_half = (max(3.0, ww * 0.22), max(3.0, dd * 0.22), max(2.5, hh * 0.35))
    for p in parts:
        if _is_instrument_shell(p):
            # Shells keep full envelope footprint — drawn as dashed outline only.
            p.cx, p.cy = 0.0, 0.0
            p.x0, p.x1 = -ww / 2.0, ww / 2.0
            p.y0, p.y1 = -dd / 2.0, dd / 2.0
            p.z0, p.z1 = 0.0, min(hh, max(hh * 0.65, 20.0))
            continue
        cx = min(max(float(p.cx), -ww / 2.0 + 2.0), ww / 2.0 - 2.0)
        cy = min(max(float(p.cy), -dd / 2.0 + 2.0), dd / 2.0 - 2.0)
        hx = min(max((float(p.x1) - float(p.x0)) / 2.0, 2.0), max_half[0])
        hy = min(max((float(p.y1) - float(p.y0)) / 2.0, 2.0), max_half[1])
        hz = min(max((float(p.z1) - float(p.z0)) / 2.0, 1.5), max_half[2])
        # Preserve relative Z centre for now; seating rewrites bands later.
        zc = (float(p.z0) + float(p.z1)) / 2.0
        p.cx, p.cy = cx, cy
        p.x0, p.x1 = cx - hx, cx + hx
        p.y0, p.y1 = cy - hy, cy + hy
        p.z0, p.z1 = zc - hz, zc + hz


_INSTRUMENT_SHELL_RE = re.compile(
    r"enclosure|housing|shell|lid|shroud|chassis|\bcase\b|\bcover\b", re.I)
_INSTRUMENT_CLUTTER_RE = re.compile(
    r"\b(?:ferrite|emc[_ -]?bead|bead\b|polyfuse|tvs\b|esd[_ -]?protect|"
    r"varistor|mov\b|input[_ -]?fuse|dc[_ -]?input[_ -]?fuse|"
    r"thermal[_ -]?cutoff|overcurrent\s*protection|"
    r"subcomponent\s*\d+|sensing\s+instrumentation\s+subcomponent|"
    r"interconnect\s*cable|sensor\s*cable)\b",
    re.I,
)
_INSTRUMENT_OPTICAL_RE = re.compile(
    r"\bled\b|emitter|light\s*source|source\s*(?:board|module)|collimat|"
    r"cuvette|sample\s*cell|detector|photodiode|wavelength|filter|baffle|"
    r"optic|monochrom|grating|lens",
    re.I,
)
_INSTRUMENT_PCB_RE = re.compile(
    r"\bpcb\b|board|mcu|microcontroller|processor|compute|driver|regulator|"
    r"dc[\s_-]?dc|battery|cell\b|pack\b|usb|fuse|esd|ferrite",
    re.I,
)
_INSTRUMENT_HMI_RE = re.compile(
    r"display|screen|lcd|oled|hmi|bezel|button|keypad|switch|indicator",
    re.I,
)


def _is_instrument_shell(p: GAPart) -> bool:
    return bool(_INSTRUMENT_SHELL_RE.search(str(getattr(p, "name", "") or "")))


def _is_instrument_clutter(p: GAPart) -> bool:
    return bool(_INSTRUMENT_CLUTTER_RE.search(str(getattr(p, "name", "") or "")))


def _retag_instrument_parts_to_spine(parts: list[GAPart], state: dict) -> int:
    """Rewrite GA tags to gold-spine BoM principals (I-201 / X-201…), not X-101 proxies.

    INTENT: Assembly must name the same principals as Part names / Interconnect —
    a sheet of X-108/X-102 boxes while the BoM says I-201 is not a real drawing.
    """
    spine: list[tuple[str, str]] = []
    for b in state.get("requirementsBom") or []:
        if not isinstance(b, dict) or b.get("status") == "SUB-COMPONENT":
            continue
        nm = str(b.get("requirement") or b.get("name_human") or "").split("·")[0].strip()
        tg = str(b.get("tag") or "").strip()
        if nm and tg:
            spine.append((nm.lower(), tg))
    if not spine:
        return 0
    host_to_compute = re.compile(
        r"microcontroller|\bmcu\b|local\s*display|usb\s*(interface|power)|"
        r"rechargeable\s*battery|dc\s*dc\s*regulator|power\s*switch|"
        r"user\s*input|status\s*indicator|mounting\s*bezel",
        re.I,
    )
    compute_tag = next((tg for nm, tg in spine if "compute ui" in nm), "I-201")
    led_tag = next((tg for nm, tg in spine if "led source" in nm), "X-201")
    n = 0
    for p in parts:
        nm = str(p.name or "").lower()
        matched = None
        for sn, tg in spine:
            if sn in nm or nm in sn or (
                len(set(sn.split()) & set(nm.split()) - {"module", "board"}) >= 2
            ):
                matched = tg
                break
        if not matched:
            if re.search(r"\bled\s*driver\b|\bled\s*source\b", nm):
                matched = led_tag
            elif host_to_compute.search(nm):
                matched = compute_tag
        if matched and p.tag != matched:
            p.tag = matched
            n += 1
    return n


def _seat_instrument_parts_in_form(
    parts: list[GAPart],
    form: dict,
    ww: float,
    dd: float,
    hh_body: float,
) -> int:
    """Place BoM parts into form-rule Z bands so Assembly shows a real stack-up.

    INTENT (Tristan 2026-07-14): Assembly must show the PCB + optics + how they
    fit — not an empty exterior silhouette. Optical parts sit in the cube;
    compute/power on the body PCB plane; HMI on the deck.

    @returns Number of non-shell parts reseated.
    """
    if not form or not parts:
        return 0
    body_h = float(form.get("body_size", (ww, dd, hh_body))[2] or hh_body)
    tw, td, th = form["tower_size"]
    tx, ty, _tz = form["tower_loc"]
    total_h = float(form.get("total_height_mm") or (body_h + th))
    # PCB plane ~ mid-body under the UI deck (matches Blender cutaway green board).
    pcb_z = max(8.0, body_h * 0.42)
    pcb_half_h = 2.5
    n = 0
    for p in parts:
        nm = str(p.name or "")
        if _is_instrument_shell(p):
            p.z0, p.z1 = 0.0, body_h
            continue
        hx = max((p.x1 - p.x0) / 2.0, 2.0)
        hy = max((p.y1 - p.y0) / 2.0, 2.0)
        if _INSTRUMENT_OPTICAL_RE.search(nm):
            zc = body_h + th * 0.48
            hz = min(max((p.z1 - p.z0) / 2.0, 3.0), th * 0.40)
            # Keep optical parts inside the tower plan.
            p.cx = min(max(float(p.cx), tx - tw / 2 + hx), tx + tw / 2 - hx)
            p.cy = min(max(float(p.cy), ty - td / 2 + hy), ty + td / 2 - hy)
        elif _INSTRUMENT_HMI_RE.search(nm):
            zc = body_h + 4.0
            hz = min(max((p.z1 - p.z0) / 2.0, 2.0), 6.0)
        elif _INSTRUMENT_PCB_RE.search(nm):
            zc = pcb_z
            hz = pcb_half_h
            # Microcontroller / compute board: enlarge plan so the PCB reads as a
            # real board the optics/HMI mount above — not a 5 mm chip speck.
            if re.search(r"microcontroller|mcu|\bpcb\b|compute|processor", nm, re.I):
                hx = max(hx, min(ww * 0.22, 48.0))
                hy = max(hy, min(dd * 0.20, 38.0))
        else:
            zc = body_h * 0.55
            hz = min(max((p.z1 - p.z0) / 2.0, 2.0), body_h * 0.20)
        p.x0, p.x1 = p.cx - hx, p.cx + hx
        p.y0, p.y1 = p.cy - hy, p.cy + hy
        p.z0 = max(0.0, zc - hz)
        p.z1 = min(total_h, zc + hz)
        n += 1
    return n


def _fit_product_parts_to_envelope(
    parts: list[GAPart],
    ww: float,
    dd: float,
    hh: float,
) -> dict:
    """Sit a sealed-cabinet assembly on FFL and fit it inside the design envelope.

    INTENT (Powerwall 0332): parts-manifest carries plant/world Z (z_min≈825 mm —
    deck + wall-mount offset) while the product envelope is 1.105 m tall. GA drew
    FFL at 0 and z_max from the floating top (2.08 m), leaving an empty lower half
    that does not match the Blender hero. Universal: rebase onto the product base,
    uniformly scale Z if the stack is taller than the design height, soft-clip XY.
    Never crush part sizes to a handheld proxy fraction (that is the instrument clamp).
    """
    if not parts:
        return {"z_shift_mm": 0.0, "z_scale": 1.0}
    z_lo = min(float(p.z0) for p in parts)
    z_hi = max(float(p.z1) for p in parts)
    span = max(z_hi - z_lo, 1.0)
    for p in parts:
        p.z0 = float(p.z0) - z_lo
        p.z1 = float(p.z1) - z_lo
    z_scale = 1.0
    if span > hh + 0.5:
        z_scale = hh / span
        for p in parts:
            p.z0 *= z_scale
            p.z1 *= z_scale
    half_w = ww / 2.0
    half_d = dd / 2.0
    for p in parts:
        cx = min(max(float(p.cx), -half_w), half_w)
        cy = min(max(float(p.cy), -half_d), half_d)
        hx = max((float(p.x1) - float(p.x0)) / 2.0, 1.0)
        hy = max((float(p.y1) - float(p.y0)) / 2.0, 1.0)
        hx = min(hx, max(1.0, half_w - abs(cx)))
        hy = min(hy, max(1.0, half_d - abs(cy)))
        p.cx, p.cy = cx, cy
        p.x0, p.x1 = cx - hx, cx + hx
        p.y0, p.y1 = cy - hy, cy + hy
        p.z0 = max(0.0, min(float(p.z0), hh))
        p.z1 = max(p.z0 + 1.0, min(float(p.z1), hh))
    return {"z_shift_mm": z_lo, "z_scale": z_scale}


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
    # INTENT (Powerwall 2026-07-15): G15/G16 compare SVG data-placement-fp to the
    # settled parts-manifest fingerprint. Capture it HERE from the written rows —
    # BEFORE any display-only transform (product FFL rebase, instrument clamp)
    # mutates GAPart coordinates. Hashing rebased z would ship a divergent fp
    # (GA 176a… ≠ manifest 76fc…) while every other sheet stamps the manifest.
    try:
        _settle_fp = man.get("placement_fp") or placement_fingerprint(
            man.get("parts") or [])
        if _settle_fp:
            meta["placement_fp"] = str(_settle_fp).lower()
    except Exception:  # noqa: BLE001
        pass
    # INTENT (2026-07-13, colorimeter 0819): sealed instruments often leave the GA
    # massing list empty (PCB-level parts filtered). Without a bbox, build_ga_svg
    # defaulted to 1000×1000×3000 mm ("1×1×3 m plant"). Prefer the design envelope
    # from state when isInstrumentDevice — never invent a plant floor.
    # EXTENDED 2026-07-14: any product-scale sealed cabinet (Powerwall etc.) must
    # also say "product envelope", not "Overall plant envelope" — same signal as
    # render_view_contract.is_product_scale (enclosure_volume_m3 < 1).
    try:
        st_path = Path(out_dir) / "state.json"
        if st_path.is_file():
            with open(st_path) as fh:
                _st = json.load(fh)
            meta["is_instrument_device"] = bool(_st.get("isInstrumentDevice"))
            _pc = str(
                ((_st.get("moduleDecomposition") or {}).get("product_class"))
                or ((_st.get("orchestratorContract") or {}).get("product_class"))
                or ((_st.get("parsedBrief") or {}).get("product_class"))
                or ""
            ).lower()
            # INTENT (NinjaPCR 2026-07-15): thermocycler GA must show sample-block /
            # TEC / lid zones — not the colorimeter OPTICAL / UI DECK silhouettes.
            meta["is_thermocycler_form"] = bool(
                re.search(r"thermocycler|thermal[_ -]?cycler|\bpcr\b", _pc))
            sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
            from render_view_contract import is_product_scale as _is_product_scale
            meta["is_product_scale"] = bool(_is_product_scale(_st))
            if meta["is_instrument_device"] or meta["is_product_scale"]:
                # Prefer the SAME envelope the Renders captions publish
                # (design_envelope_* mm) so GA L×W×H cannot disagree with the hero.
                env = (
                    ((_st.get("orchestratorContract") or {}).get("quantities") or {})
                    or ((_st.get("engineeringContract") or {}).get("quantities") or {})
                )

                def _q(key: str):
                    v = env.get(key)
                    if isinstance(v, dict):
                        return v.get("value")
                    return v

                w = (_q("design_envelope_width_mm") or _q("enclosure_width_mm")
                     or _q("device_width_mm"))
                d = (_q("design_envelope_depth_mm") or _q("enclosure_depth_mm")
                     or _q("device_depth_mm"))
                h = (_q("design_envelope_height_mm") or _q("enclosure_height_mm")
                     or _q("device_height_mm"))
                try:
                    ww = float(w) if w is not None else 180.0
                    dd = float(d) if d is not None else 140.0
                    hh = float(h) if h is not None else 80.0
                except (TypeError, ValueError):
                    ww, dd, hh = 180.0, 140.0, 80.0
                # INTENT (2026-07-14): ALWAYS prefer resolve_design_envelope_mm for
                # instruments — it applies minimum_working_envelope (as small as
                # possible, still does the work) over mass÷density air written into
                # design_envelope_* quantities. Raw quantities alone re-inflated
                # colorimeter to 183×145 mm after the pack rule landed.
                try:
                    from render_view_contract import resolve_design_envelope_mm
                    _resolved = resolve_design_envelope_mm(_st)
                    if _resolved:
                        ww, dd, hh = (float(_resolved[0]), float(_resolved[1]),
                                      float(_resolved[2]))
                except Exception:  # noqa: BLE001
                    pass
                bbox = _instrument_envelope_bbox(ww, dd, hh)
                meta["envelope_source"] = "resolve_design_envelope_mm"
                try:
                    _op = _q("optical_path_mm") or _q("optical_path_length_mm")
                    if _op is not None:
                        meta["optical_path_mm"] = float(_op)
                except Exception:  # noqa: BLE001
                    pass
                if meta["is_instrument_device"]:
                    # INTENT (colorimeter 2026-07-14): legacy manifests pile every
                    # BoM proxy at (0,0). Spread via the same role-XY rule Blender
                    # now uses BEFORE clamp, so FRONT/PLAN match the product shot
                    # without requiring a full re-render. Persist the rewrite so
                    # placement_fp / G14 / G15 share one generation.
                    try:
                        from instrument_role_xy import spread_instrument_manifest_rows
                        rows = man.get("parts") or []
                        n_rew = spread_instrument_manifest_rows(rows, ww, dd)
                        if n_rew:
                            man["placement_fp"] = placement_fingerprint(rows)
                            with open(p, "w") as fh:
                                json.dump(man, fh, indent=2)
                        # Stamp the SAME fp into meta so the SVG cannot hash a
                        # different tag alphabet (u_slug vs X-101) and fail G15/G16.
                        if man.get("placement_fp"):
                            meta["placement_fp"] = str(man["placement_fp"]).lower()
                            # Re-project from the rewritten rows (keep dims, new xy).
                            parts.clear()
                            for r in rows:
                                pos = r.get("pos_mm") or [0, 0, 0]
                                x, y, z = (float(pos[0]), float(pos[1]), float(pos[2]))
                                d = r.get("dims_mm") or {}
                                if "dia" in d:
                                    dia = float(d.get("dia") or 0.0)
                                    length = float(d.get("len") or 0.0)
                                    is_round = True
                                    x0, x1 = _round_extent(x, dia / 2.0)
                                    y0, y1 = _round_extent(y, dia / 2.0)
                                    z0, z1 = z - length / 2.0, z + length / 2.0
                                else:
                                    w_ = float(d.get("w") or 0.0)
                                    dep = float(d.get("d") or 0.0)
                                    h_ = float(d.get("h") or 0.0)
                                    is_round = False
                                    x0, x1 = _round_extent(x, w_ / 2.0)
                                    y0, y1 = _round_extent(y, dep / 2.0)
                                    z0, z1 = z - h_ / 2.0, z + h_ / 2.0
                                _name = r.get("name") or ""
                                parts.append(GAPart(
                                    tag=r.get("equipment_tag") or "?",
                                    obj_tag=r.get("tag") or "",
                                    name=_name,
                                    module=r.get("module") or "",
                                    shape=r.get("shape") or "",
                                    qty=int(r.get("qty") or 1),
                                    is_round=is_round,
                                    x0=x0, x1=x1, y0=y0, y1=y1, z0=z0, z1=z1,
                                    cx=x, cy=y,
                                    rank=int(r.get("region_rank") or 10**9),
                                    is_below_grade=bool(
                                        _BELOW_GRADE_NAME_RE.search(_name))))
                            print(f"[ga] instrument role-XY spread: {n_rew} part(s) "
                                  f"un-collapsed + parts-manifest rewritten")
                            meta["instrument_role_xy_spread"] = n_rew
                    except Exception as _exc:  # noqa: BLE001
                        print(f"[ga] instrument role-XY spread skipped: {_exc}")
                    _clamp_instrument_parts_to_envelope(parts, ww, dd, hh)
                elif meta["is_product_scale"] and parts:
                    # INTENT (Powerwall 0332): envelope bbox alone is not enough —
                    # floating world-Z parts still paint in the upper half of a
                    # 0…H frame. Rebase onto FFL + fit into design L×W×H.
                    _fit = _fit_product_parts_to_envelope(parts, ww, dd, hh)
                    meta["product_ffl_rebase"] = _fit
                    if (_fit.get("z_shift_mm") or 0) > 50 or abs(
                            (_fit.get("z_scale") or 1.0) - 1.0) > 0.02:
                        print(f"[ga] product FFL rebase: shift="
                              f"{_fit.get('z_shift_mm'):.0f} mm  z_scale="
                              f"{_fit.get('z_scale'):.3f}  → envelope "
                              f"{ww:.0f}×{dd:.0f}×{hh:.0f} mm")
    except Exception:
        pass
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

    def rect(self, x, y, w, h, stroke=INK, width=1.3, fill="none", rx=0, dash=None,
             extra: str = ""):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        ex = f" {extra}" if extra else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"{d}{ex}/>')

    def circle(self, cx, cy, r, stroke=INK, width=1.4, fill="none", dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{width}"{d}/>')

    def path(self, d, stroke=INK, width=1.4, fill="none", join="round", cap="round"):
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
                 f'stroke-linejoin="{join}" stroke-linecap="{cap}"/>')

    def text(self, x, y, s, size=11, anchor="start", fill=INK, weight="normal",
             family="Helvetica, Arial, sans-serif", mono=False, spacing=None,
             rotate=None, extra: str = ""):
        fam = "'DejaVu Sans Mono', 'Menlo', monospace" if mono else family
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        tr = f' transform="rotate({rotate} {x:.1f} {y:.1f})"' if rotate is not None else ""
        ex = f" {extra}" if extra else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" '
                 f'font-size="{size}" text-anchor="{anchor}" fill="{fill}" '
                 f'font-weight="{weight}"{sp}{tr}{ex}>{_esc(s)}</text>')

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


def _instrument_zone_tag_items(items: list) -> list:
    """INTENT (2026-07-14 Tristan): instrument FRONT/SIDE must not ladder 6+
    optical tags at 12 px pitch (G9 IoU=0 while the human glance fails). Keep
    ONE tag per zone — PCB (Compute UI), Optical (LED Source Board preferred),
    HMI (Display) — so the sheet names the stack-up without a tag bullseye.

    @param items [(GAPart, px, py, pw, ph), ...] as drawn in one elevation
    @returns Filtered items (≤3) for `_elevation_tag_groups`
    """
    if not items:
        return items
    zones: dict[str, tuple] = {}
    zone_rank = {"pcb": 0, "optical": 1, "hmi": 2, "other": 9}

    def _zone(name: str) -> str:
        if re.search(
            r"compute\s*ui|microcontroller|\bmcu\b|dc\s*dc|usb|battery|"
            r"power\s*(switch|input)|regulator",
            name, re.I,
        ):
            return "pcb"
        if re.search(
            r"led\s*source|collimat|cuvette|detector|wavelength|optical\s*path|"
            r"baffle|\bled\b",
            name, re.I,
        ):
            return "optical"
        if re.search(r"display|button|hmi|status\s*indicator", name, re.I):
            return "hmi"
        return "other"

    # Prefer spine nouns when several parts share a zone.
    prefer = {
        "pcb": re.compile(r"compute\s*ui\s*module", re.I),
        "optical": re.compile(r"led\s*source\s*board", re.I),
        "hmi": re.compile(r"local\s*display|compute\s*ui", re.I),
    }
    for item in items:
        p = item[0]
        nm = str(getattr(p, "name", "") or "")
        z = _zone(nm)
        if z == "other":
            continue
        prev = zones.get(z)
        if prev is None:
            zones[z] = item
            continue
        pref = prefer.get(z)
        if pref and pref.search(nm) and not pref.search(str(prev[0].name or "")):
            zones[z] = item
    out = [zones[z] for z in sorted(zones, key=lambda k: zone_rank.get(k, 9))]
    return out or items[:3]


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



def _draw_thermocycler_form_silhouettes(
    svg, *,
    plan_x, plan_y, plan_w, plan_h, L, W, H, ppm, mx, my,
    front_x, front_y, z_max,
    assembly_cutaway: bool = False,
) -> None:
    """Benchtop PCR thermocycler zone cues — sample block / TEC / lid / PCB.

    INTENT (NinjaPCR 2026-07-15): never stamp OPTICAL / UI DECK (colorimeter
    family) onto a thermal cycler. Reader must see the tube block + TEC stack.
    """
    block_w, block_d = L * 0.48, W * 0.42
    block_h = max(12.0, H * 0.18)
    # TOP — sample block with well grid cue
    bx = plan_x + mx(-block_w / 2)
    by = plan_y + my(block_d / 2)
    svg.rect(bx, by, block_w * ppm, block_d * ppm, stroke=EQ_INK, width=1.5,
             fill="#d8dde3" if assembly_cutaway else "#c5ccd4",
             dash="3,2" if assembly_cutaway else None,
             extra='data-glance="top-sample-block"')
    svg.text(plan_x + mx(0), plan_y + my(0) + 3, "SAMPLE BLOCK",
             size=7.5, anchor="middle", fill=MUTED,
             extra='data-glance="top-sample-label"')
    # 2×4 well dots
    for r in range(2):
        for c in range(4):
            wx = -block_w / 2 + block_w * (c + 0.5) / 4
            wy = -block_d / 2 + block_d * (r + 0.5) / 2
            svg.rect(plan_x + mx(wx - 2), plan_y + my(wy + 2),
                     4 * ppm, 4 * ppm, stroke=MUTED, width=0.7, fill="none")
    # TEC under / behind block on TOP
    tec_w, tec_d = block_w * 0.9, block_d * 0.35
    svg.rect(plan_x + mx(-tec_w / 2), plan_y + my(-block_d / 2 - 2),
             tec_w * ppm, tec_d * ppm, stroke=DATUM_INK, width=1.0,
             fill="none", dash="2,2",
             extra='data-glance="top-tec"')
    svg.text(plan_x + mx(0), plan_y + my(-block_d / 2 - tec_d / 2) + 3, "TEC",
             size=6.5, anchor="middle", fill=MUTED)
    if assembly_cutaway:
        pcb_w, pcb_d = L * 0.55, W * 0.35
        svg.rect(plan_x + mx(-pcb_w / 2), plan_y + my(W * 0.35),
                 pcb_w * ppm, pcb_d * ppm, stroke="#2e7d32", width=1.2,
                 fill="#c5e1a5", dash="2,2",
                 extra='data-glance="top-pcb-plane"')
        svg.text(plan_x + mx(0), plan_y + my(W * 0.35 - pcb_d / 2) + 3, "PCB",
                 size=7.0, anchor="middle", fill="#1b5e20",
                 extra='data-glance="top-pcb-label"')
    # FRONT — body + block + lid band
    body_h = H * 0.62
    svg.rect(front_x, front_y + (z_max - body_h) * ppm, plan_w, body_h * ppm,
             stroke=EQ_INK, width=1.5,
             fill="none" if assembly_cutaway else "#f4f6f8",
             dash="5,3" if assembly_cutaway else None)
    fbx = front_x + mx(-block_w / 2)
    fby = front_y + (z_max - (body_h * 0.55 + block_h)) * ppm
    svg.rect(fbx, fby, block_w * ppm, block_h * ppm, stroke=EQ_INK, width=1.4,
             fill="#c5ccd4",
             extra='data-glance="front-sample-block"')
    svg.text(fbx + block_w * ppm / 2, fby + 10, "BLOCK",
             size=7.0, anchor="middle", fill=MUTED)
    lid_h = max(6.0, H * 0.08)
    svg.rect(front_x + mx(-L * 0.45), front_y + (z_max - (body_h + lid_h * 2.2)) * ppm,
             L * 0.9 * ppm, lid_h * ppm, stroke=DATUM_INK, width=1.1,
             fill="none", dash="3,2",
             extra='data-glance="front-lid"')
    svg.text(front_x + mx(0), front_y + (z_max - (body_h + lid_h * 1.2)) * ppm + 3,
             "LID", size=6.5, anchor="middle", fill=MUTED,
             extra='data-glance="front-lid-label"')
    if assembly_cutaway:
        svg.rect(front_x + mx(-L * 0.35), front_y + (z_max - 14) * ppm,
                 L * 0.7 * ppm, 8 * ppm, stroke="#2e7d32", width=1.1,
                 fill="#c5e1a5", dash="2,2",
                 extra='data-glance="front-pcb"')


def _draw_instrument_form_silhouettes(
    svg, form: dict, *,
    plan_x, plan_y, plan_w, plan_h, L, W, ppm, mx, my,
    front_x, front_y, z_max, mz,
    assembly_cutaway: bool = False,
) -> None:
    """Envelope + zone context for the instrument Assembly / product sheet.

    INTENT (updated 2026-07-14): when ``assembly_cutaway`` is True the BoM parts
    carry the story (PCB, optics, stack-up) — this layer is a light dashed
    envelope + zone labels so the reader still sees OPTICAL / UI DECK / PCB
    planes. When False (legacy empty-massing), keep the heavier exterior form.
    """
    if not form:
        return
    tw, td, th = form["tower_size"]
    tx, ty, tz = form["tower_loc"]
    body_h = float(form["body_size"][2])
    # ----- TOP: optical chamber + UI deck zones -----
    tpx = plan_x + mx(tx - tw / 2)
    tpy = plan_y + my(ty + td / 2)
    svg.rect(tpx, tpy, tw * ppm, td * ppm, stroke=EQ_INK, width=1.4,
             fill="#eef2f6" if assembly_cutaway else "#dde3ea",
             dash="4,3" if assembly_cutaway else None)
    svg.text(tpx + tw * ppm / 2, tpy + 11, "OPTICAL",
             size=7.5, anchor="middle", fill=MUTED)
    dw, dd, dh = form["deck_size"]
    dcx, dcy, _ = form["deck_loc"]
    dpx = plan_x + mx(dcx - dw / 2)
    dpy = plan_y + my(dcy + dd / 2)
    svg.rect(dpx, dpy, dw * ppm, dd * ppm, stroke=DATUM_INK, width=1.0,
             fill="none" if assembly_cutaway else "#f0f3f6", dash="3,2")
    svg.text(dpx + dw * ppm * 0.28, dpy + 10, "UI DECK",
             size=7.0, anchor="middle", fill=MUTED)
    # Display + buttons stay as HMI cues (even under cutaway — reader orientation).
    dx, dy, _ = form["top_display_loc"]
    dsw, dsd, _ = form["top_display_size"]
    svg.rect(plan_x + mx(dx - dsw / 2), plan_y + my(dy + dsd / 2),
             dsw * ppm, dsd * ppm, stroke=EQ_INK, width=1.1, fill="#c8e6d8")
    bd = float(form["button_diameter_mm"])
    for bx, by, _bz in form["button_locs"]:
        svg.rect(plan_x + mx(bx - bd / 2), plan_y + my(by + bd / 2),
                 bd * ppm, bd * ppm, stroke=MUTED, width=0.8, fill="none")
    if assembly_cutaway:
        # PCB plane cue on TOP (left body) — green FR4 strip under HMI.
        pcb_w = min(W * 0.42, 90.0)
        pcb_d = min(dd * 0.55, 55.0)
        pcb_cx = -W * 0.16
        pcb_cy = dcy
        svg.rect(plan_x + mx(pcb_cx - pcb_w / 2), plan_y + my(pcb_cy + pcb_d / 2),
                 pcb_w * ppm, pcb_d * ppm, stroke="#2e7d32", width=1.2,
                 fill="#c5e1a5", dash="2,2",
                 extra='data-glance="top-pcb-plane"')
        svg.text(plan_x + mx(pcb_cx), plan_y + my(pcb_cy) + 3, "PCB",
                 size=7.5, anchor="middle", fill="#1b5e20",
                 extra='data-glance="top-pcb-label"')

    # ----- FRONT: body + optical cube (cutaway = open shell; else closed form) -----
    svg.rect(front_x, front_y + (z_max - body_h) * ppm, plan_w, body_h * ppm,
             stroke=EQ_INK, width=1.5,
             fill="none" if assembly_cutaway else "#f4f6f8",
             dash="5,3" if assembly_cutaway else None)
    tower_x0 = tx - tw / 2
    tower_z0 = body_h
    ftx = front_x + mx(tower_x0)
    fty = front_y + (z_max - (tower_z0 + th)) * ppm
    svg.rect(ftx, fty, tw * ppm, th * ppm, stroke=EQ_INK, width=1.5,
             fill="none" if assembly_cutaway else "#eef1f4",
             dash="4,3" if assembly_cutaway else None)
    svg.text(ftx + tw * ppm / 2, fty + 10, "OPTICAL",
             size=7.0, anchor="middle", fill=MUTED)
    dw, _dd, _dh = form["deck_size"]
    dcx, _dcy, _ = form["deck_loc"]
    deck_band_h_mm = max(body_h * 0.18, 12.0)
    f_deck_x = front_x + mx(dcx - dw / 2)
    f_deck_y = front_y + (z_max - body_h) * ppm
    svg.rect(f_deck_x, f_deck_y, dw * ppm, deck_band_h_mm * ppm,
             stroke=DATUM_INK, width=1.0, fill="#e8eef5", dash="2,2",
             extra='data-glance="front-ui-deck"')
    svg.text(f_deck_x + dw * ppm * 0.22, f_deck_y + deck_band_h_mm * ppm * 0.55 + 2,
             "UI", size=6.5, anchor="middle", fill=MUTED,
             extra='data-glance="front-ui-label"')
    dx, _dy, _dz = form["top_display_loc"]
    dsw, _dsd, dst = form["top_display_size"]
    disp_h_mm = max(float(dst) * 3.5, 8.0)
    f_disp_x = front_x + mx(dx - dsw / 2)
    f_disp_y = front_y + (z_max - (body_h + disp_h_mm * 0.15)) * ppm
    svg.rect(f_disp_x, f_disp_y, dsw * ppm, disp_h_mm * ppm,
             stroke=EQ_INK, width=1.1, fill="#c8e6d8",
             extra='data-glance="front-display"')
    svg.text(f_disp_x + dsw * ppm / 2, f_disp_y + disp_h_mm * ppm * 0.65 + 2,
             "DISPLAY", size=6.5, anchor="middle", fill=EQ_INK,
             extra='data-glance="front-display-label"')
    bd = float(form["button_diameter_mm"])
    for bx, _by, _bz in form["button_locs"]:
        nub_h = max(bd * 0.55, 3.5) * ppm
        svg.rect(front_x + mx(bx - bd / 2),
                 front_y + (z_max - body_h) * ppm - nub_h * 0.35,
                 bd * ppm, nub_h,
                 stroke=MUTED, width=0.7, fill="#d7dce3",
                 extra='data-glance="front-button"')
    if assembly_cutaway:
        # FRONT PCB plane (FR4) — the board the MCU / power parts sit on.
        pcb_w = min(W * 0.42, 90.0)
        pcb_h = max(body_h * 0.12, 8.0)
        pcb_cx = -W * 0.16
        pcb_zc = body_h * 0.42
        svg.rect(front_x + mx(pcb_cx - pcb_w / 2),
                 front_y + (z_max - (pcb_zc + pcb_h / 2)) * ppm,
                 pcb_w * ppm, pcb_h * ppm,
                 stroke="#2e7d32", width=1.3, fill="#c5e1a5",
                 extra='data-glance="front-pcb"')
        svg.text(front_x + mx(pcb_cx),
                 front_y + (z_max - pcb_zc) * ppm + 3, "PCB",
                 size=7.0, anchor="middle", fill="#1b5e20",
                 extra='data-glance="front-pcb-label"')
    else:
        lx, _ly, lz = form["led_pcb_loc"]
        lw, _ld, lh = form["led_pcb_size"]
        win_w = lw * 0.45
        win_h = lh * 0.45
        svg.rect(front_x + mx(lx - win_w / 2),
                 front_y + (z_max - (lz + win_h / 2)) * ppm,
                 win_w * ppm, win_h * ppm,
                 stroke=MUTED, width=1.0, fill="#1a1f28",
                 extra='data-glance="front-source-window"')


def build_ga_svg(parts: list[GAPart], bbox: dict, archetype: str,
                 meta: dict, rooms: Optional[list] = None) -> str:
    """Render the projected equipment as a GENERAL ARRANGEMENT.

    Plant (default): PLAN top-left, FRONT below, SIDE right of plan.
    Product / sealed cabinet (`is_product_scale`): FRONT (door removed · looking
    in) is the PRIMARY view — same orientation as the Blender cutaway hero — with
    TOP and SIDE as secondary. A thin wall-cabinet top plan cannot carry tags.

    `rooms` (RULE 6, optional): function-segregated plant rooms on the PLAN only.
    """
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
    # Instrument optical cube sits ON the body (form-rule) — extend the sheet
    # so FRONT shows the same L-body silhouette as the Blender product shot.
    _form = None
    if meta.get("is_instrument_device"):
        try:
            from instrument_form_rule import instrument_form_rule_mm
            _opath = float(meta.get("optical_path_mm") or 10.0)
            _form = instrument_form_rule_mm(L, W, H, 0.0, 2.0, optical_path_mm=_opath)
            z_max = max(z_max, float(_form["total_height_mm"]))
            H = max(z_max - z_min, 1.0)
            # DECISION (2026-07-14 Tristan): Assembly must show PCB + parts stack-up.
            # Seat BoM proxies into form-rule Z bands BEFORE drawing — the old
            # exterior-only silhouette + "see FRONT" TOP failed a real assembly glance.
            if parts:
                n_seat = _seat_instrument_parts_in_form(
                    parts, _form, L, W, float(_form["body_size"][2]))
                print(f"[ga] instrument assembly seat: {n_seat} part(s) in form bands")
                meta["instrument_assembly_cutaway"] = True
                # Retag proxies → spine BoM tags (I-201…) so the sheet matches Part names.
                try:
                    _st_path = Path(str(meta.get("out_dir") or "")) / "state.json"
                    _st = {}
                    if meta.get("state"):
                        _st = meta["state"] if isinstance(meta["state"], dict) else {}
                    elif _st_path.is_file():
                        with open(_st_path) as _fh:
                            _st = json.load(_fh)
                    if _st:
                        n_tag = _retag_instrument_parts_to_spine(parts, _st)
                        if n_tag:
                            print(f"[ga] instrument spine retag: {n_tag} part(s) → BoM tags")
                except Exception as _te:  # noqa: BLE001
                    print(f"[ga] instrument spine retag skipped: {_te}")
        except Exception as _fe:  # noqa: BLE001
            print(f"[ga] instrument form-rule unavailable: {_fe}")
            _form = None

    # INTENT (2026-07-14 Powerwall): sealed product GA must lead with the FRONT
    # cutaway view — the plant-style top plan of a 618×182 mm wall cabinet is a
    # tag pile-up that cannot match the Blender hero a reader compares against.
    product_mode = bool(meta.get("is_product_scale") or meta.get("is_instrument_device"))
    # Instruments with seated parts: TOP carries tags (real assembly plan).
    # Thin wall cabinets still defer TOP tags to FRONT.
    thin_top = (
        (product_mode and not meta.get("is_instrument_device")
         and (W / max(L, 1.0)) < 0.45)
    )

    # ----- pick ONE scale shared across all views so they read together. -----
    K = 3.78
    if product_mode:
        # Handheld instruments need a close scale (≤1:5) so the L-body reads;
        # wall cabinets still use the wide FRONT budget.
        if meta.get("is_instrument_device"):
            # GOTCHA: choose_scale() bottoms out at 1:20 for sub-metre envelopes
            # (its series is plant-oriented). Handhelds need 1:2 so the L-body
            # + optical cube fill the sheet the way the Blender product shot does.
            sx = sy = sz = 2.0
        else:
            sx, _ = choose_scale(L, 720.0)
            sy, _ = choose_scale(W, 160.0)
            sz, _ = choose_scale(H, 820.0)
    else:
        # Larger plan budgets (2026-07-02): spend sheet area on a bigger plan.
        sx, _ = choose_scale(L, 1000.0)
        sy, _ = choose_scale(W, 600.0)
        sz, _ = choose_scale(H, 300.0)
    scale_S = max(sx, sy, sz)              # the coarsest fits everything
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
    gap = 96                 # gap between primary view and the side elevation
    v_gap = 92               # gap between stacked views (dim band)
    label_gutter = 30        # left gutter for the vertical dimension

    if product_mode:
        # FRONT primary top-left (matches Blender cutaway); SIDE right; TOP below.
        front_x = margin + label_gutter + 34
        front_y = margin + 54
        front_h = elev_h
        side_x = front_x + plan_w + gap
        side_y = front_y
        side_w = plan_h + 46
        plan_x = front_x
        plan_y = front_y + front_h + v_gap + 26
        sched_top = plan_y + plan_h + 56
    else:
        # PLAN top-left; SIDE right of plan; FRONT below plan (plant convention).
        plan_x = margin + label_gutter + 34
        plan_y = margin + 54
        side_x = plan_x + plan_w + gap
        side_y = plan_y
        side_w = plan_h + 46
        front_x = plan_x
        front_y = plan_y + plan_h + v_gap + 26
        front_h = elev_h
        sched_top = front_y + front_h + 56

    width = max(side_x + side_w + margin + 30,
                plan_x + plan_w + margin + 30, 1080)
    # schedule sits below the lowest orthographic view — never over the drawings
    # (Tristan 2026-06-22). Clearance band keeps the scale bar off the schedule.
    sched_bottom = sched_top + _key_panel_height(parts)
    lowest_view = max(front_y + front_h, plan_y + plan_h)
    height = max(lowest_view + 64, sched_bottom + 60) + title_h
    width = int(math.ceil(width))
    height = int(math.ceil(height))

    svg = SVG(width, height)
    # faint sheet border
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)

    # ───────────────────────── PLAN / TOP (looking down) ─────────────────────────
    if product_mode:
        svg.text(plan_x, plan_y - 30, "TOP", size=13, weight="bold", fill=EQ_INK,
                 spacing="1.5")
        _top_sub = (
            "(looking down · internal arrangement)"
            if meta.get("is_instrument_device") and meta.get("instrument_assembly_cutaway")
            else "(looking down · secondary)"
        )
        svg.text(plan_x + 42, plan_y - 30, _top_sub, size=9.5, fill=MUTED)
    else:
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
    # INTENT (2026-07-14 sealed GA): skip ultra-thin face-plate skins (w or d ≤ 8 mm)
    # from PLAN art + tags. They are real BoM lines (schedule still lists them) but
    # their edge-strip footprints collide with interior tags (K-101 ∩ X-120 G9).
    def _is_face_skin(q: GAPart) -> bool:
        return min(max(q.x1 - q.x0, 0.0), max(q.y1 - q.y0, 0.0)) <= 8.0

    # INTENT (2026-07-14 Tristan): gold-spine retag maps many discrete hosts onto
    # I-201/X-201 — plan then stamped I-201 ×8 (dense ladder). Draw every outline,
    # but only zone-representative tags (PCB / Optical / HMI) on instrument TOP.
    _instrument_plan_tag_ids: set[int] = set()
    if meta.get("is_instrument_device"):
        _plan_zone_src = []
        for p in parts:
            if _is_instrument_shell(p) or _is_instrument_clutter(p) or _is_face_skin(p):
                continue
            pw = (p.x1 - p.x0) * ppm
            ph = (p.y1 - p.y0) * ppm
            px = plan_x + mx(p.x0)
            py = plan_y + my(p.y1)
            _plan_zone_src.append((p, px, py, pw, ph))
        for item in _instrument_zone_tag_items(_plan_zone_src):
            _instrument_plan_tag_ids.add(id(item[0]))

    for p in sorted(parts, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.y1 - q.y0, 1))):
        # Instrument shells = envelope outline (already drawn); clutter = schedule-only.
        if _form is not None and (_is_instrument_shell(p) or _is_instrument_clutter(p)):
            continue
        if _is_face_skin(p):
            continue
        pw = (p.x1 - p.x0) * ppm
        ph = (p.y1 - p.y0) * ppm
        px = plan_x + mx(p.x0)
        py = plan_y + my(p.y1)        # my inverts → top edge is the larger y
        # DECISION (2026-07-14): thin product TOP views draw outlines only — tags
        # live on FRONT (the cutaway-matched primary). Labelling a 182 mm-deep strip
        # is what made Powerwall GA look unrelated to the Blender hero.
        _inst_skip_tag = (
            meta.get("is_instrument_device")
            and id(p) not in _instrument_plan_tag_ids
        )
        if thin_top or _inst_skip_tag:
            _draw_equipment_rect(svg, px, py, pw, ph, p.is_round, p.tag,
                                 show_tag=False, placer=None,
                                 below_grade=p.is_below_grade,
                                 draw_box=(id(p) not in _plan_box_skip))
            if thin_top:
                continue
            # Instrument: outline drawn, no tag — skip keynote pile-up too.
            continue
        labelled = _draw_equipment_rect(svg, px, py, pw, ph, p.is_round, p.tag,
                                        placer=plan_tags, below_grade=p.is_below_grade,
                                        draw_box=(id(p) not in _plan_box_skip))
        if not labelled:
            keynotes.append((p, px + pw / 2.0, py + ph / 2.0))
    if thin_top:
        svg.text(plan_x + plan_w / 2.0, plan_y + plan_h / 2.0 + 3,
                 "Internal arrangement — see FRONT", size=8.5, anchor="middle",
                 fill=MUTED)
        print(f"[ga] product thin-TOP: {len(parts)} outlines, tags deferred to FRONT "
              f"(W/L={W / max(L, 1.0):.2f})")
    # items too small for an IN-PLACE tag get their FULL equipment tag through the same
    # de-overlap ladder (a leader line back to the part when displaced). The old numeric-
    # suffix balloon ('6' for P-106) keyed to a schedule that now shows only the top-10
    # principals left every small part UNIDENTIFIABLE on the sheet — v58b GA coverage
    # 24/37: P-101 / P-104 / P-106 / M-101 / I-102 were DRAWN but untagged. A GA must
    # honestly NAME every part it draws. proveCatch in _selftest.
    # KEYNOTE DENSITY COLLAPSE (2026-07-11 run 59, sealed product: 30+ DISTINCT small
    # parts in a 0.6×0.2 m cabinet plan piled 26 illegible tags — the G9 gate failed and
    # corroborated the vision critic's 'garbled' verdict. At keynote densities no ladder
    # can help, the honest engineering convention is module-ranged group tags on the
    # plan; the equipment schedule ON THIS SHEET names every member individually.
    # Signal-keyed on COUNT, never a class: a normal plant (few keynotes) is untouched.)
    elif len(keynotes) >= 15:
        _groups: dict = {}
        for p, kx, ky in keynotes:
            # group per (module, TAG LETTER) — a mixed-letter range ('D-101…X-154')
            # cannot expand in the coverage scan (2026-07-11 run 65: Arc Fault/Flash +
            # Signage fell out of GA coverage because their letters differed from the
            # module's X-range label).
            _ltr = str(getattr(p, "tag", "") or "?").split("-")[0]
            _groups.setdefault(f"{getattr(p, 'module', '') or 'misc'}|{_ltr}", []).append((p, kx, ky))
        for _mod, members in sorted(_groups.items()):
            _tags = sorted({str(m[0].tag) for m in members})
            _lbl = _tags[0] if len(_tags) == 1 else f"{_tags[0]}…{_tags[-1]} ({len(_tags)})"
            _cx = sum(m[1] for m in members) / len(members)
            _cy = sum(m[2] for m in members) / len(members)
            plan_tags.add(_cx, _cy + 2.7, _lbl, 7.5, anchor_pt=(_cx, _cy))
        print(f"[ga] keynote density collapse: {len(keynotes)} small-part tags → "
              f"{len(_groups)} module-range tag(s); every member named in the schedule")
    else:
        for p, kx, ky in keynotes:
            plan_tags.add(kx, ky + 2.7, p.tag, 7.5, anchor_pt=(kx, ky))
    if not thin_top:
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
    if product_mode:
        # INTENT (2026-07-14 Tristan): instrument Assembly FRONT is a cover-removed
        # cutaway with seated BoM parts (PCB + optics). Empty exterior silhouette
        # claiming "product form" was the Goodhart glance that hid the stack-up.
        svg.text(front_x, front_y - 14, "FRONT", size=13, weight="bold",
                 fill=EQ_INK, spacing="1.0")
        if meta.get("is_instrument_device") and meta.get("instrument_assembly_cutaway"):
            _front_sub = "(cover removed · assembly internals)"
        elif meta.get("is_instrument_device"):
            _front_sub = "(product form · matches Blender exterior)"
        else:
            _front_sub = "(door removed · looking in)"
        svg.text(front_x + 68, front_y - 14, _front_sub, size=9.5, fill=MUTED)
    else:
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
    front_tags.block(front_x - 4, front_y - 26, front_x + 280, front_y - 4)
    # reserve the ground/FFL row, the left height dimension and the schedule-panel
    # top edge so displaced tags never overprint them.
    front_tags.block(front_x - 30, _gy_f + 0.5, front_x + plan_w + 95, _gy_f + 13)
    front_tags.block(front_x - 30, front_y - 2, front_x - 2, _gy_f)
    front_tags.block(margin, sched_top - 2, width - margin, sched_top + 20)
    _assembly_cutaway = bool(
        meta.get("is_instrument_device") and meta.get("instrument_assembly_cutaway"))
    if meta.get("is_thermocycler_form"):
        _draw_thermocycler_form_silhouettes(
            svg,
            plan_x=plan_x, plan_y=plan_y, plan_w=plan_w, plan_h=plan_h,
            L=L, W=W, H=H, ppm=ppm, mx=mx, my=my,
            front_x=front_x, front_y=front_y, z_max=z_max,
            assembly_cutaway=_assembly_cutaway,
        )
        print("[ga] thermocycler form context drawn "
              f"(assembly_cutaway={_assembly_cutaway})")
    elif _form is not None:
        _draw_instrument_form_silhouettes(
            svg, _form,
            plan_x=plan_x, plan_y=plan_y, plan_w=plan_w, plan_h=plan_h,
            L=L, W=W, ppm=ppm, mx=mx, my=my,
            front_x=front_x, front_y=front_y, z_max=z_max, mz=mz,
            assembly_cutaway=_assembly_cutaway,
        )
        print("[ga] instrument form context drawn "
              f"(assembly_cutaway={_assembly_cutaway})")
    front_items = []
    for p in sorted(parts, key=lambda q: -(max(q.x1 - q.x0, 1) * max(q.z1 - q.z0, 1))):
        if _form is not None and (_is_instrument_shell(p) or _is_instrument_clutter(p)):
            continue
        pw = (p.x1 - p.x0) * ppm
        ph = (p.z1 - p.z0) * ppm
        px = front_x + mx(p.x0)
        py = front_y + (z_max - p.z1) * ppm
        _draw_elevation_item(svg, px, py, pw, ph, p)
        front_items.append((p, px, py, pw, ph))
    # INTENT (2026-07-14 Tristan): instrument FRONT must not ladder every optical
    # tag at ~12 px pitch (G9 IoU=0 while the human glance fails). One tag per
    # zone (PCB / Optical / HMI) — schedule still lists every principal.
    if meta.get("is_instrument_device"):
        front_items = _instrument_zone_tag_items(front_items)
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
    if _form is not None:
        # Side envelope: dashed when assembly cutaway (parts carry the massing).
        body_h = float(_form["body_size"][2])
        svg.rect(side_x, side_y + (z_max - body_h) * ppm, plan_h, body_h * ppm,
                 stroke=EQ_INK, width=1.5,
                 fill="none" if _assembly_cutaway else "#f4f6f8",
                 dash="5,3" if _assembly_cutaway else None)
        tw, td, th = _form["tower_size"]
        _tx, ty, _tz = _form["tower_loc"]
        stx = side_x + (y_max - (ty + td / 2)) * ppm
        sty = side_y + (z_max - (body_h + th)) * ppm
        svg.rect(stx, sty, td * ppm, th * ppm, stroke=EQ_INK, width=1.5,
                 fill="none" if _assembly_cutaway else "#eef1f4",
                 dash="4,3" if _assembly_cutaway else None)
    for p in sorted(parts, key=lambda q: -(max(q.y1 - q.y0, 1) * max(q.z1 - q.z0, 1))):
        if _form is not None and (_is_instrument_shell(p) or _is_instrument_clutter(p)):
            continue
        pw = (p.y1 - p.y0) * ppm
        ph = (p.z1 - p.z0) * ppm
        # plan rows run north(top)→south; keep the same handedness as the plan.
        px = side_x + (y_max - p.y1) * ppm
        py = side_y + (z_max - p.z1) * ppm
        _draw_elevation_item(svg, px, py, pw, ph, p)
        side_items.append((p, px, py, pw, ph))
    if meta.get("is_instrument_device"):
        side_items = _instrument_zone_tag_items(side_items)
    _singles_s, _ranges_s = _elevation_tag_groups(side_items)
    for label, cx, cy, size, anchor in _ranges_s + _singles_s:
        side_tags.add(cx, cy, label, size, anchor_pt=anchor)
    side_tags.flush()
    ground_ys = side_y + (z_max - max(0.0, z_min)) * ppm
    svg.line(side_x - 8, ground_ys, side_x + plan_h + 8, ground_ys,
             stroke=INK, width=1.4)
    _hatch_ground(svg, side_x - 8, side_x + plan_h + 8, ground_ys)
    dim_h(svg, side_x, side_x + plan_h, ground_ys + 30, W, ext_from=ground_ys)
    svg.text(side_x + plan_h / 2.0, ground_ys + 50,
             "PRODUCT WIDTH" if product_mode else "PLANT WIDTH", size=8.6,
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
    # Title count must match the equipment schedule (not raw principal len).
    # Instrument gold-spine runs otherwise claim "36 equipment items" while the
    # schedule shows ~8 — Goodhart title vs content (Tristan 2026-07-14).
    try:
        _sched_rows, _sched_total, _ = _principal_schedule_rows(parts)
        _title_n = len(_sched_rows) if _sched_rows else int(_sched_total or 0)
        if _title_n > 0:
            meta = {**meta, "count": _title_n}
    except Exception:  # noqa: BLE001
        pass
    _draw_title_block(svg, archetype, meta, scale_S, width, height, title_h, L, W, H,
                      has_below_grade=has_below_grade)
    # QC token: G15/G16 compare this to parts-manifest placement_fp.
    # GOTCHA: never hash display-mutated GAParts (product FFL rebase / clamp) —
    # that is the Powerwall 2026-07-15 GA≠manifest fingerprint bug. Prefer the
    # settled manifest fp captured in load_manifest (or rewritten with the rows).
    fp = meta.get("placement_fp")
    if not fp:
        # Last resort only when the caller built GAParts without a manifest.
        fp = placement_fingerprint(parts)
    return embed_svg_placement_fp(svg.render(), fp)


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


def _absurd_schedule_part(p) -> bool:
    """True when a part must not appear as PRINCIPAL equipment on the GA.

    INTENT (colorimeter 2026-07-14): Ferrite Emc Bead stamped at 260×200×434 mm
    (= whole product bbox) won 'top 10 by footprint' and a GA scored 10 while
    listing a bead as principal equipment. Discrete electronics are never
    GA principals — exclude by noun even after dims are clamped (a 24 mm bead
    can still outrank tiny sensors on a handheld and re-enter the top-10).

    EXTENDED (2026-07-14): gold-spine absorbed hosts (Microcontroller, USB
    Interface, …) are retagged to I-201 for callout credit, but must NOT fill
    the PRINCIPAL EQUIPMENT table as ten identical I-201 rows — only the
    spine noun itself (Compute UI Module / LED Source Board / …) schedules.
    """
    name = str(getattr(p, "name", "") or "")
    if re.search(
        r"\b(?:ferrite|emc[_ -]?bead|bead\b|polyfuse|tvs\b|esd[_ -]?protect|"
        r"varistor|mov\b|input[_ -]?fuse|dc[_ -]?input[_ -]?fuse|"
        r"thermal[_ -]?cutoff|overcurrent\s*protection|"
        r"subcomponent\s*\d+|sensing\s+instrumentation\s+subcomponent|"
        r"enclosure\s+shell|lid\s+shroud|mounting\s+bezel|"
        r"ambient\s+light\s+cap|sensor\s+interconnect\s+cable|"
        r"qwiic|stemma\s*header|fastener\s*set|cuvette\s*consumable)\b",
        name, re.I,
    ):
        return True
    # Spine principal nouns stay; absorbed host motherboard lines drop.
    if re.search(
        r"compute\s*ui\s*module|led\s*source\s*board|"
        r"optical\s*detector\s*module|cuvette\s*holder|"
        r"collimating\s*optic|wavelength\s*selection|"
        r"optical\s*path\s*baffle",
        name, re.I,
    ):
        return False
    if re.search(
        r"microcontroller|\bmcu\b|local\s*display|user\s*input|"
        r"usb\s*(interface|power)|rechargeable\s*battery|"
        r"dc\s*dc\s*regulator|power\s*switch|control\s*switch|"
        r"status\s*indicator|power\s*indicator|reverse\s*polarity|"
        r"power\s*input\s*connector|\bled\s*driver\b|\bled\s*source\b(?!\s*board)",
        name, re.I,
    ):
        return True
    return False


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
    # Drop absurd micro-component bbox echoes before ranking by footprint.
    parts = [p for p in parts if not _absurd_schedule_part(p)]
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
    # INTENT (2026-07-14): handheld instruments — reader-facing title is Assembly
    # (plant "General Arrangement" is the wrong genre). Disk stem stays
    # general-arrangement.* for gate/manifest keys.
    _sheet_title = (
        "ASSEMBLY"
        if meta.get("is_instrument_device")
        else "GENERAL ARRANGEMENT"
    )
    svg.text(x0, y0 + 43, f"{_sheet_title} — {_humanise(archetype)}",
             size=15, weight="bold", fill=EQ_INK)
    _env_noun = (
        "product envelope"
        if meta.get("is_instrument_device") or meta.get("is_product_scale")
        else "Overall plant envelope"
    )
    # GOTCHA: {:.1f} m rounds a 183×145×120 mm handheld to "0.2×0.1×0.1 m" —
    # the title block then fails a glance against the mm dimensions on the views
    # (ga_glance_audit envelope_vs_dimension_mismatch). Products under 1 m print mm.
    if (meta.get("is_instrument_device") or meta.get("is_product_scale")) and max(L, W, H) < 1000.0:
        _env_line = (
            f"{_env_noun} {L:.0f} × {W:.0f} × {H:.0f} mm (L×W×H) · "
            f"{meta.get('count', 0)} equipment items."
        )
    else:
        _env_line = (
            f"{_env_noun} {L/1000:.1f} m (L) × {W/1000:.1f} m (W) × "
            f"{H/1000:.1f} m (H) · {meta.get('count', 0)} equipment items."
        )
    svg.text(x0, y0 + 61, _env_line, size=9.5, fill=MUTED)
    if meta.get("is_instrument_device") and meta.get("instrument_assembly_cutaway"):
        _view_note = (
            "Front (cover removed) + top + side · PCB / optics / HMI stack-up · "
            "dimensions in millimetres unless noted."
        )
    elif meta.get("is_instrument_device"):
        _view_note = (
            "Front (product form) + top + side · matches Blender exterior composition · "
            "dimensions in millimetres unless noted."
        )
    elif meta.get("is_product_scale"):
        _view_note = (
            "Front (door removed) + top + side · matches Blender cutaway orientation · "
            "dimensions in millimetres unless noted."
        )
    else:
        _view_note = (
            "Plan + two elevations · dimensions in millimetres unless noted · "
            "datum ± 0.000 = finished floor level."
        )
    svg.text(x0, y0 + 79, _view_note, size=9.0, fill=MUTED)
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
    _state = _load_state(out_dir, state_path)
    parts, bbox = _apply_building_envelope(parts, bbox, _state, rooms)
    archetype = _archetype_name(out_dir, state_path)
    # FLOW: spine retag in build_ga_svg reads meta["state"] + meta["out_dir"].
    meta["out_dir"] = out_dir
    if isinstance(_state, dict):
        meta["state"] = _state
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
        _a1_title = (
            "Assembly" if meta.get("is_instrument_device") else "General Arrangement"
        )
        a1 = a1_print.export_a1(svg_path, base="ga", title=_a1_title)
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
    # 4b — INSTRUMENT empty-massing envelope (colorimeter 0819): 0 GA parts must
    #     NOT invent a 1×1×3 m plant floor. load_manifest + build_ga_svg with an
    #     instrument meta + device bbox must say "product envelope" and stay
    #     under 0.5 m on every axis.
    inst_bbox = {"x_min_mm": 0, "x_max_mm": 180, "y_min_mm": 0, "y_max_mm": 140,
                 "z_min_mm": 0, "z_max_mm": 80}
    svg_inst = build_ga_svg([], inst_bbox, "optical_instrument",
                            {"count": 0, "is_instrument_device": True})
    if "product envelope" not in svg_inst:
        print("  FAIL ga-instrument-envelope: instrument GA must say 'product envelope'")
        bad += 1
    if "Overall plant envelope" in svg_inst:
        print("  FAIL ga-instrument-envelope: must not say 'Overall plant envelope'")
        bad += 1
    # Glance honesty (2026-07-14): mm envelope; empty-massing keeps exterior form.
    if "mm (L×W×H)" not in svg_inst and "×" not in svg_inst:
        print("  FAIL ga-instrument-envelope: product <1 m must print envelope in mm")
        bad += 1
    if "cover removed" in svg_inst.lower() or "assembly internals" in svg_inst.lower():
        print("  FAIL ga-instrument-glance: empty-massing instrument must not claim "
              "cover-removed assembly (no parts to show)")
        bad += 1
    if "product form" not in svg_inst.lower():
        print("  FAIL ga-instrument-glance: empty instrument FRONT must say product form")
        bad += 1
    if 'data-glance="front-display"' not in svg_inst:
        print("  FAIL ga-instrument-glance: FRONT must stamp data-glance=front-display "
              "(G17 FRONT-scoped HMI)")
        bad += 1
    if 'data-glance="front-ui-deck"' not in svg_inst:
        print("  FAIL ga-instrument-glance: FRONT must stamp data-glance=front-ui-deck")
        bad += 1
    # proveCatch: with BoM parts, Assembly must seat + draw stack-up (PCB + tags).
    _mcu = GAPart(tag="I-113", obj_tag="mcu", name="Microcontroller",
                  module="m", shape="box", qty=1, is_round=False,
                  x0=-40, x1=-10, y0=-20, y1=10, z0=600, z1=605, cx=-25, cy=-5)
    _cuv = GAPart(tag="X-112", obj_tag="cuv", name="Cuvette Holder",
                  module="m", shape="box", qty=1, is_round=False,
                  x0=30, x1=55, y0=-10, y1=15, z0=640, z1=680, cx=42, cy=2)
    _det = GAPart(tag="I-114", obj_tag="det", name="Optical Detector Module",
                  module="m", shape="box", qty=1, is_round=False,
                  x0=30, x1=50, y0=20, y1=40, z0=640, z1=655, cx=40, cy=30)
    _shell = GAPart(tag="X-110", obj_tag="shell", name="Enclosure Shell",
                    module="m", shape="box", qty=1, is_round=False,
                    x0=-90, x1=90, y0=-70, y1=70, z0=580, z1=660, cx=0, cy=0)
    svg_asm_parts = build_ga_svg(
        [_mcu, _cuv, _det, _shell],
        {"x_min_mm": -90, "x_max_mm": 90, "y_min_mm": -70, "y_max_mm": 70,
         "z_min_mm": 0, "z_max_mm": 80},
        "colorimeter",
        {"count": 4, "is_instrument_device": True, "optical_path_mm": 10.0},
    )
    if "cover removed" not in svg_asm_parts.lower():
        print("  FAIL ga-instrument-assembly: with parts, FRONT must say cover removed")
        bad += 1
    if 'data-glance="front-pcb"' not in svg_asm_parts:
        print("  FAIL ga-instrument-assembly: cutaway must stamp front-pcb plane")
        bad += 1
    if ">I-113<" not in svg_asm_parts and "I-113" not in svg_asm_parts:
        print("  FAIL ga-instrument-assembly: MCU tag must appear on the sheet")
        bad += 1
    if ">X-112<" not in svg_asm_parts and "X-112" not in svg_asm_parts:
        print("  FAIL ga-instrument-assembly: cuvette tag must appear on the sheet")
        bad += 1
    if "Internal arrangement — see FRONT" in svg_asm_parts:
        print("  FAIL ga-instrument-assembly: TOP must not defer internals to FRONT")
        bad += 1
    # Sealed cabinet (Powerwall-scale): product envelope noun, not plant floor;
    # FRONT is the primary view (matches Blender cutaway); fingerprint embedded.
    pw_bbox = {"x_min_mm": -265, "x_max_mm": 266, "y_min_mm": -78, "y_max_mm": 78,
               "z_min_mm": 0, "z_max_mm": 1070}
    svg_pw = build_ga_svg([], pw_bbox, "energy_storage",
                          {"count": 26, "is_product_scale": True})
    if "product envelope" not in svg_pw:
        print("  FAIL ga-product-envelope: sealed cabinet must say 'product envelope'")
        bad += 1
    if "Overall plant envelope" in svg_pw:
        print("  FAIL ga-product-envelope: sealed cabinet must not say 'Overall plant envelope'")
        bad += 1
    if ">FRONT<" not in svg_pw and "FRONT" not in svg_pw:
        print("  FAIL ga-product-front-primary: sealed cabinet must lead with FRONT view")
        bad += 1
    if "door removed" not in svg_pw:
        print("  FAIL ga-product-front-primary: FRONT caption must say door removed")
        bad += 1
    if 'data-placement-fp="' not in svg_pw:
        print("  FAIL ga-placement-fp: GA SVG must embed data-placement-fp for G15")
        bad += 1
    # proveCatch: handheld reader title is ASSEMBLY; plant/cabinet stays GA.
    svg_asm = build_ga_svg([], {"x_min_mm": -90, "x_max_mm": 90, "y_min_mm": -70,
                                "y_max_mm": 70, "z_min_mm": 0, "z_max_mm": 80},
                           "colorimeter",
                           {"count": 14, "is_instrument_device": True})
    if "ASSEMBLY" not in svg_asm:
        print("  FAIL ga-assembly-title: instrument GA must say ASSEMBLY")
        bad += 1
    if "GENERAL ARRANGEMENT" in svg_asm:
        print("  FAIL ga-assembly-title: instrument must not say GENERAL ARRANGEMENT")
        bad += 1
    if "GENERAL ARRANGEMENT" not in svg_pw:
        print("  FAIL ga-assembly-title: sealed cabinet must keep GENERAL ARRANGEMENT")
        bad += 1
    # proveCatch (Powerwall 0332): floating world-Z stack (z_min≈825) must sit on
    # FFL inside the 1.105 m design envelope — never leave an empty lower half on
    # a 2.08 m sheet that disagrees with the Blender hero.
    _float_batt = GAPart(tag="X-118", obj_tag="x118", name="Battery Modules",
                         module="m", shape="box", qty=1, is_round=False,
                         x0=-200, x1=200, y0=-70, y1=70, z0=825, z1=1240,
                         cx=0, cy=0)
    _float_door = GAPart(tag="X-112", obj_tag="x112", name="Service Access Door",
                         module="m", shape="box", qty=1, is_round=False,
                         x0=-300, x1=-297, y0=-78, y1=78, z0=1108, z1=2085,
                         cx=-298.5, cy=0)
    _fit = _fit_product_parts_to_envelope(
        [_float_batt, _float_door], 609.0, 193.0, 1105.0)
    if _fit["z_shift_mm"] < 800:
        print(f"  FAIL ga-product-ffl-rebase: expected ~825 mm world-Z shift, "
              f"got {_fit['z_shift_mm']:.1f}")
        bad += 1
    if _float_batt.z0 > 5.0:
        print(f"  FAIL ga-product-ffl-rebase: battery must sit on FFL after rebase, "
              f"got z0={_float_batt.z0:.1f}")
        bad += 1
    if _float_door.z1 > 1105.0 + 0.5:
        print(f"  FAIL ga-product-ffl-rebase: door top must fit envelope 1105 mm, "
              f"got z1={_float_door.z1:.1f}")
        bad += 1
    if _fit["z_scale"] >= 1.0:
        print(f"  FAIL ga-product-ffl-rebase: stack taller than envelope must scale "
              f"(got z_scale={_fit['z_scale']:.3f})")
        bad += 1
    # proveCatch (Powerwall 2026-07-15): product FFL rebase MUST NOT change the
    # SVG placement_fp — G15 compares it to parts-manifest generation. A GA that
    # hashes rebased z ships fp≠manifest while P&ID/SLD stamp the settled token.
    import tempfile as _tf_fp
    _fp_td = _tf_fp.mkdtemp(prefix="ga-fp-")
    _fp_parts = [
        {"equipment_tag": "X-118", "name": "Battery Modules",
         "pos_mm": [0.0, 10.0, 1000.0], "dims_mm": {"w": 400, "d": 140, "h": 400},
         "module": "m", "shape": "box", "qty": 1},
        {"equipment_tag": "X-101", "name": "DC DC Converters",
         "pos_mm": [-100.0, -10.0, 1400.0], "dims_mm": {"w": 80, "d": 60, "h": 80},
         "module": "m", "shape": "box", "qty": 1},
        {"equipment_tag": "K-101", "name": "Active Ventilation Fan",
         "pos_mm": [80.0, -20.0, 1600.0], "dims_mm": {"w": 60, "d": 50, "h": 40},
         "module": "m", "shape": "box", "qty": 1},
    ]
    _fp_man = placement_fingerprint(_fp_parts)
    json.dump({
        "schema": "parts-manifest/1", "count": 3, "parts": _fp_parts,
        "placement_fp": _fp_man,
        "bbox_mm": {"length_mm": 609, "width_mm": 193, "height_mm": 1105},
    }, open(os.path.join(_fp_td, "parts-manifest.json"), "w"))
    json.dump({"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": {"value": 0.14},
        "design_envelope_width_mm": {"value": 609},
        "design_envelope_depth_mm": {"value": 193},
        "design_envelope_height_mm": {"value": 1105},
    }}}, open(os.path.join(_fp_td, "state.json"), "w"))
    _lp, _lb, _lm = load_manifest(_fp_td)
    if not _lm.get("is_product_scale"):
        print("  FAIL ga-product-fp-settle: fixture must classify as product_scale")
        bad += 1
    if (_lm.get("product_ffl_rebase") or {}).get("z_shift_mm", 0) < 100:
        print("  FAIL ga-product-fp-settle: fixture must exercise FFL rebase "
              f"(got {_lm.get('product_ffl_rebase')})")
        bad += 1
    _fp_mut = placement_fingerprint(_lp)
    if _fp_mut == _fp_man:
        print("  FAIL ga-product-fp-settle: rebased GAParts must DIVERGE from "
              "manifest fp (proveCatch setup — otherwise the trap is inert)")
        bad += 1
    _svg_fp = build_ga_svg(_lp, _lb, "energy_storage", _lm)
    _got_fp = extract_svg_placement_fp(_svg_fp)
    if _got_fp != _fp_man:
        print(f"  FAIL ga-product-fp-settle: GA SVG fp {_got_fp} must equal "
              f"settled manifest {_fp_man} (not rebased {_fp_mut})")
        bad += 1
    # Thin TOP must not pile tags — a part on a thin envelope + note instead.
    pw_part = GAPart(tag="X-119", obj_tag="x119", name="LFP Prismatic Cells",
                     module="m", shape="box", qty=1, is_round=False,
                     x0=-200, x1=200, y0=-70, y1=70, z0=100, z1=600,
                     cx=0, cy=0)
    svg_pw2 = build_ga_svg([pw_part], pw_bbox, "energy_storage",
                           {"count": 1, "is_product_scale": True})
    if "Internal arrangement — see FRONT" not in svg_pw2:
        print("  FAIL ga-product-thin-top: thin TOP must defer tags to FRONT")
        bad += 1
    if "1.0 m (L) × 1.0 m (W) × 3.0 m (H)" in svg_inst:
        print("  FAIL ga-instrument-envelope: must not invent the 1×1×3 m plant default")
        bad += 1
    # DECISION (2026-07-14): handheld envelope prints millimetres — metres
    # (0.2×0.1×0.1 m) failed the glance against 180 mm dims (G17).
    if "0.2 m (L)" in svg_inst or "0.18 m (L)" in svg_inst:
        print("  FAIL ga-instrument-envelope: handheld must NOT print metres "
              "(use mm — see ga_glance_audit envelope_vs_dimension_mismatch)")
        bad += 1
    if "180" not in svg_inst or "mm (L×W×H)" not in svg_inst:
        print("  FAIL ga-instrument-envelope: expected mm envelope from 180 mm bbox; "
              f"snippet: {[ln for ln in svg_inst.splitlines() if 'envelope' in ln.lower()][:2]}")
        bad += 1
    # 4c — INSTRUMENT stale proxy clamp: product-bbox XY must shrink into the
    #     envelope (≤ ~22% half-span). Z is NOT crushed here — seating assigns
    #     form bands (clamping world-Z into hh piled every part at the roof).
    proxy = GAPart(tag="X-101", obj_tag="u_proxy", name="Wavelength Selection Module",
                   module="m", shape="box", qty=1, is_round=False,
                   x0=-130, x1=130, y0=-100, y1=100, z0=-120, z1=352,
                   cx=0, cy=0)
    _clamp_instrument_parts_to_envelope([proxy], 180.0, 140.0, 80.0)
    if (proxy.x1 - proxy.x0) > 90 or (proxy.y1 - proxy.y0) > 70:
        print("  FAIL ga-instrument-proxy-clamp: oversized proxy XY must shrink "
              f"inside handheld envelope, got x={proxy.x1 - proxy.x0:.1f} "
              f"y={proxy.y1 - proxy.y0:.1f}")
        bad += 1
    if abs(proxy.cx) > 90 or abs(proxy.cy) > 70:
        print("  FAIL ga-instrument-proxy-clamp: proxy centre outside envelope "
              f"cx={proxy.cx:.1f} cy={proxy.cy:.1f}")
        bad += 1
    # Seating proveCatch: world-Z stack → form bands (optics above body PCB).
    _seat_instrument_parts_in_form(
        [proxy],
        {"body_size": (180.0, 140.0, 80.0),
         "tower_size": (40.0, 38.0, 42.0),
         "tower_loc": (54.0, 11.0, 101.0),
         "total_height_mm": 122.0},
        180.0, 140.0, 80.0,
    )
    if proxy.z0 < 80.0:
        print("  FAIL ga-instrument-seat: optical part must sit in the tower band "
              f"(z0≥80), got z0={proxy.z0:.1f}")
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
