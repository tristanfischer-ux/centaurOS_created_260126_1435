#!/usr/bin/env python3
"""drawing_building_envelope.py — ONE shared building-footprint derivation for the
plan-view drawings (GA + HVAC).

WHY THIS EXISTS (the #122 "all drawings derive from one shared ledger" principle):
the GA + HVAC plans previously took the building ENVELOPE straight from the
parts-manifest `bbox_mm` — the bounding box of the PLACED EQUIPMENT.  When the
placement optimiser strings the process train into a long ribbon (a RAS run laid the
kit over a 372 m line), that bbox is ~66 m × 372 m = ~24,600 m² — but the LEDGER's
reinforced floor slab is only ~2,988 m² (≈ 55 m × 55 m).  So the drawn building
disagreed with the slab the bill of materials actually costs.

THE RULE (universal, deterministic, class-agnostic): the DRAWN building footprint is
derived from the LEDGER slab / gross-floor area (the thing the BoM costs), NOT from the
equipment-placement spread.  The equipment is then fitted INSIDE that envelope
(uniformly scaled about the bbox centre) so the plan reads as a real building whose
walls match the slab area.  When the ledger carries no slab/floor area (most classes —
a skid, a turbine, a satellite), the equipment bbox is used unchanged, so nothing
regresses for a class that has no building.

Reads ONLY the contract quantities + requirementsBom already in state.json (the bare
canonical keys after the keystone reconciliation removed the computed_* twins).  Pure
stdlib; no Blender, no I/O.
"""
from __future__ import annotations

import math
import re
from typing import Optional


# Building-aspect cap: a real single-storey industrial hall is rarely longer than ~2.2×
# its depth. The drawn rectangle borrows the equipment bbox's aspect (so the long axis of
# the layout stays the long axis of the building) but clamps it into [1.0, this] so a
# placement ribbon can never stretch the building into an unphysical strip.
_MAX_BUILDING_ASPECT = 2.2


def _quantity(state: dict, *keys):
    """First matching contract-quantity VALUE (dict OR list form), across both contracts.
    Mirrors the readers in draw_hvac / draw_single_line so the slab area is read the same
    way everywhere."""
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict):
            for k in keys:
                if k in q:
                    v = q[k]
                    return v.get("value") if isinstance(v, dict) else v
        elif isinstance(q, list):
            for item in q:
                if item.get("key") in keys:
                    return item.get("value")
    return None


def _slab_area_from_bom(state: dict) -> Optional[float]:
    """The reinforced floor-slab / building-footprint area [m²] taken from the
    requirementsBom row the BoM costs (e.g. 'Reinforced Floor Slab · 2988 m² footprint ·
    2988 m² area'). Universal — matches any building-slab / floor-slab / footprint row by
    name, reads the first '<N> m²' figure. Returns None when no such row exists."""
    rb = state.get("requirementsBom")
    if not isinstance(rb, list):
        return None
    for r in rb:
        if not isinstance(r, dict):
            continue
        req = str(r.get("requirement") or "")
        if not re.search(r"floor\s*slab|reinforced\s*floor|building\s*slab|"
                         r"ground\s*slab|floor\s*area|building\s*footprint", req, re.I):
            continue
        m = re.search(r"([\d][\d,]*(?:\.\d+)?)\s*m(?:²|2|\^2)", req)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                continue
    return None


def ledger_floor_area_m2(state: dict) -> Optional[float]:
    """The authoritative BUILDING floor / slab area [m²] from the ledger, or None when the
    design has no building. Reads (in order): the contract building-footprint / gross-floor
    quantity, else the requirementsBom floor-slab row. Universal — keyed on the canonical
    quantity names + the BoM slab row, never a product class."""
    for k in ("building_footprint_m2", "building_gross_floor_area_m2",
              "building_floor_area_m2", "gross_floor_area_m2", "floor_area_m2",
              "slab_area_m2", "footprint_area_m2"):
        v = _quantity(state, k)
        if v:
            try:
                fv = float(v)
                if fv > 0:
                    return fv
            except (TypeError, ValueError):
                pass
    return _slab_area_from_bom(state)


def building_footprint_mm(state: dict, bbox: dict):
    """Return the DRAWN building footprint as (width_x_mm, depth_y_mm), derived from the
    LEDGER slab area (so the plan matches the slab the BoM costs).  The rectangle keeps the
    equipment-layout's long-axis orientation + aspect (clamped to a realistic building
    aspect) and is sized so its area == the ledger slab area, AND so it is never SMALLER
    than the equipment bbox on either axis (a building cannot be smaller than the kit it
    holds).  Returns None when the ledger carries no floor area — the caller then uses the
    equipment bbox unchanged (a class with no building is untouched)."""
    area_m2 = ledger_floor_area_m2(state)
    if not area_m2 or area_m2 <= 0:
        return None
    area_mm2 = area_m2 * 1.0e6

    # equipment extents (mm) — used for the aspect + as the lower bound on each side.
    eq_w = float(bbox.get("x_max_mm", 0.0) - bbox.get("x_min_mm", 0.0)) if bbox else 0.0
    eq_d = float(bbox.get("y_max_mm", 0.0) - bbox.get("y_min_mm", 0.0)) if bbox else 0.0
    eq_w = max(eq_w, 1.0)
    eq_d = max(eq_d, 1.0)

    # aspect from the equipment layout (long axis stays long), clamped to a real building.
    long_is_x = eq_w >= eq_d
    raw_aspect = (max(eq_w, eq_d) / min(eq_w, eq_d)) if min(eq_w, eq_d) > 0 else 1.0
    aspect = max(1.0, min(raw_aspect, _MAX_BUILDING_ASPECT))   # long / short

    # CLUSTERED plant (low aspect): the building ENCLOSES the equipment at full size — the SAME
    # footprint the 3-D render's plant shell + the building-civils cost use (equipment extent +
    # perimeter clearance). The slab-area hall (with the equipment scaled to fit) is reserved for
    # a high-aspect RIBBON layout (the placer strung the kit into a line). The slab area
    # undercounts a clustered hall, so using it made the HVAC/GA building disagree with the 3-D
    # render (Tristan 2026-06-22 — "HVAC odd, not linked to the building"). Universal — keyed on
    # layout aspect, never a product class.
    _CLEARANCE_MM = 5000.0   # 2.5 m aisle each side (matches the render shell + the civils footprint)
    if raw_aspect < 3.0:
        return eq_w + _CLEARANCE_MM, eq_d + _CLEARANCE_MM

    # size a rectangle of the given aspect to the slab area: short·long = area, long =
    # aspect·short ⇒ short = sqrt(area/aspect).
    short = math.sqrt(area_mm2 / aspect)
    long = aspect * short
    bw = long if long_is_x else short      # building extent on X
    bd = short if long_is_x else long       # building extent on Y

    # The building is sized to the LEDGER SLAB AREA, NOT the equipment-placement spread —
    # that is the whole point: when the placer strings the kit into a 372 m ribbon, the
    # drawn hall stays the ~55 m × 55 m the slab BoM costs and the equipment is scaled to
    # fit inside it (fit_equipment_transform). We deliberately do NOT grow the building to
    # the equipment bbox here (that would re-introduce the ribbon). One guard only: if the
    # ledger slab is itself ABSURDLY smaller than the equipment footprint (> 25× — a sign
    # the slab quantity is wrong, not the placement), fall back to the equipment bbox so we
    # never draw kit that visibly cannot fit; the RAS case (8× ribbon) is well within this
    # and is corrected to the slab.
    eq_area = eq_w * eq_d
    if eq_area > 0 and area_mm2 > 0 and (eq_area / area_mm2) > 25.0:
        return max(bw, eq_w), max(bd, eq_d)
    return bw, bd


def fit_equipment_transform(bbox: dict, build_w_mm: float, build_d_mm: float):
    """A uniform scale-about-centre transform that fits the equipment bbox INSIDE the drawn
    building rectangle, preserving the relative layout (so the kit sits within the walls and
    the pipe topology is undistorted). Returns a callable (x_mm, y_mm) -> (x_mm, y_mm).
    Scale is min(1, building/equipment) per axis, taken as the smaller (uniform) factor so
    nothing is stretched; identity when the equipment already fits.  Scales about the
    equipment bbox centre so the layout stays centred in the hall."""
    x0 = float(bbox.get("x_min_mm", 0.0))
    x1 = float(bbox.get("x_max_mm", 0.0))
    y0 = float(bbox.get("y_min_mm", 0.0))
    y1 = float(bbox.get("y_max_mm", 0.0))
    eq_w = max(x1 - x0, 1.0)
    eq_d = max(y1 - y0, 1.0)
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    # leave a small clear margin (4% each side) so equipment doesn't sit on the wall line.
    usable_w = build_w_mm * 0.92
    usable_d = build_d_mm * 0.92
    s = min(1.0, usable_w / eq_w, usable_d / eq_d)
    if s >= 0.999:
        return lambda x, y: (x, y)
    return lambda x, y: (cx + (x - cx) * s, cy + (y - cy) * s)


def building_bbox(state: dict, bbox: dict):
    """Convenience: the building footprint as a bbox-shaped dict CENTRED on the equipment
    bbox centre, plus the fit transform.  Returns (building_bbox_dict, transform) or
    (None, identity) when the ledger has no floor area.

    The returned dict carries x_min_mm/x_max_mm/y_min_mm/y_max_mm for the DRAWN building
    walls; z is copied from the equipment bbox (the building height is the equipment height,
    unchanged). The transform maps equipment coords into that envelope."""
    dims = building_footprint_mm(state, bbox)
    if dims is None:
        return None, (lambda x, y: (x, y))
    bw, bd = dims
    x0 = float(bbox.get("x_min_mm", 0.0))
    x1 = float(bbox.get("x_max_mm", 0.0))
    y0 = float(bbox.get("y_min_mm", 0.0))
    y1 = float(bbox.get("y_max_mm", 0.0))
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    bb = {
        "x_min_mm": cx - bw / 2.0, "x_max_mm": cx + bw / 2.0,
        "y_min_mm": cy - bd / 2.0, "y_max_mm": cy + bd / 2.0,
        "z_min_mm": float(bbox.get("z_min_mm", 0.0)),
        "z_max_mm": float(bbox.get("z_max_mm", 3000.0)),
        "length_mm": bw, "width_mm": bd,
        "height_mm": float(bbox.get("z_max_mm", 3000.0) - bbox.get("z_min_mm", 0.0)),
    }
    return bb, fit_equipment_transform(bbox, bw, bd)


# ═══════════════════════════════════════════════════════════════════════════
# SELF-TEST  (python3 drawing_building_envelope.py --selftest)
# ═══════════════════════════════════════════════════════════════════════════

def _selftest() -> int:
    import json as _json
    ok = True

    def check(name, cond):
        nonlocal ok
        print(("  PASS " if cond else "  FAIL ") + name)
        ok = ok and cond

    # a 372 m placement ribbon over a 2,988 m² slab → building ≈ 2,988 m², equipment fits.
    bbox = {"x_min_mm": 0.0, "x_max_mm": 66000.0,
            "y_min_mm": 0.0, "y_max_mm": 372000.0,
            "z_min_mm": 0.0, "z_max_mm": 25000.0}
    state = {"orchestratorContract": {"quantities": {"building_footprint_m2": 2988}}}
    bw, bd = building_footprint_mm(state, bbox)
    area = bw * bd / 1.0e6
    check(f"building area == slab (got {area:.0f} m², want 2988)", abs(area - 2988.0) < 30.0)
    check("building aspect clamped (<=2.2)",
          (max(bw, bd) / min(bw, bd)) <= 2.21)
    bb, tf = building_bbox(state, bbox)
    pts = [tf(x, y) for x in (bbox["x_min_mm"], bbox["x_max_mm"])
           for y in (bbox["y_min_mm"], bbox["y_max_mm"])]
    ew = max(p[0] for p in pts) - min(p[0] for p in pts)
    ed = max(p[1] for p in pts) - min(p[1] for p in pts)
    check("equipment fits inside building after transform",
          ew <= (bb["x_max_mm"] - bb["x_min_mm"]) + 1 and
          ed <= (bb["y_max_mm"] - bb["y_min_mm"]) + 1)

    # no-building class (no slab quantity) → None / identity (untouched).
    check("no-slab → None footprint", building_footprint_mm({}, bbox) is None)
    nbb, ntf = building_bbox({}, bbox)
    check("no-slab → identity transform", nbb is None and ntf(5, 7) == (5, 7))

    # slab read from the requirementsBom row (no contract quantity).
    st2 = {"requirementsBom": [
        {"status": "BUILDING", "tag": "SLB",
         "requirement": "Reinforced Floor Slab · 2988 m² footprint · 2988 m² area"}]}
    check("slab area read from BoM row", ledger_floor_area_m2(st2) == 2988.0)

    # absurd slab (equipment > 25× the slab) → fall back to equipment bbox (never hide kit).
    st3 = {"orchestratorContract": {"quantities": {"building_footprint_m2": 100}}}
    abw, abd = building_footprint_mm(st3, bbox)
    check("absurd-slab guard falls back to equipment bbox",
          abw >= (bbox["x_max_mm"] - bbox["x_min_mm"]) - 1 and
          abd >= (bbox["y_max_mm"] - bbox["y_min_mm"]) - 1)

    print("ALL PASS" if ok else "SOME FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    import sys as _sys
    if "--selftest" in _sys.argv:
        raise SystemExit(_selftest())
    print(__doc__)
