"""Manifest -> SVG projection contract (SOL audit item 4, 2026-07-27).

THE GAP THIS CLOSES. Every drawing gate we had scored the parts-manifest, never the
sheet that was produced from it. So a drawing could misrepresent its own parts list and
still score: on 2026-07-26 an Assembly sheet showed boxes hanging outside the enclosure
while every gate was green and the tab read "TAB QUALITY 9/10". The defect was only
caught by a human opening the workbook.

SOL's rule, adopted: the GA WRITER emits an audit rectangle computed from the SAME
projected bounds it draws with, and the gate RECOMPUTES the expectation independently
from the manifest row. Comparing those two is what makes "the sheet matches the parts
list" a measured fact rather than an assumption. The writer must never re-derive the
bounds separately — that would just create a second source of truth inside the drawing.

COORDINATE SPACE. SOL's sketch assumed millimetre SVG units; draw_ga works in paper
pixels via `ppm` (px per mm) with per-view origins. The contract is therefore expressed
in the drawing's own space, and the view datum carries everything needed to reproduce it:

    front:  x = front_x + (x0_mm - x_min_mm) * ppm      w = (x1-x0) * ppm
            y = front_y + (z_max_mm - z1_mm) * ppm      h = (z1-z0) * ppm
    top:    x = plan_x  + (x0_mm - x_min_mm) * ppm      w = (x1-x0) * ppm
            y = plan_y  + (y_max_mm - y1_mm) * ppm      h = (y1-y0) * ppm
    side:   x = side_x  + (y_max_mm - y1_mm) * ppm      w = (y1-y0) * ppm
            y = side_y  + (z_max_mm - z1_mm) * ppm      h = (z1-z0) * ppm
            (SIDE inverts Y like the plan — verified against the loop, not assumed)

Z NOTE: draw_ga rebases part z onto the shell floor (the FFL datum) before drawing, so
the datum records `z_shift_mm` and the gate applies the same shift to the manifest row.
Everything else is read straight from the manifest.

UNITS: tolerances are in PAPER PIXELS, because that is what is actually drawn and what a
reader sees. At a typical 1.89 px/mm they correspond to roughly half a millimetre.
"""
from __future__ import annotations

from typing import Mapping, Optional

# A drawn box may differ from its manifest expectation by this much before the sheet is
# judged to misrepresent the parts list. Deliberately tight: this gate exists to catch a
# box in the WRONG PLACE or at the WRONG SIZE, not sub-pixel rounding.
PROJECTION_POS_TOL_PX = 1.5
PROJECTION_SIZE_TOL_PX = 1.5

SUPPORTED_VIEWS = frozenset({"front", "top", "side"})


def manifest_bbox_mm(row: Mapping) -> Optional[tuple]:
    """(xmin, xmax, ymin, ymax, zmin, zmax) in mm from a parts-manifest row, or None."""
    pos = row.get("pos_mm")
    dims = row.get("dims_mm") or {}
    if not isinstance(pos, (list, tuple)) or len(pos) < 3:
        return None
    try:
        x, y, z = float(pos[0]), float(pos[1]), float(pos[2])
    except (TypeError, ValueError):
        return None
    if "dia" in dims:
        # ⭐⭐ HONOUR THE CYLINDER AXIS (2026-08-03). This used to read
        # `w = d = dia; h = len` unconditionally, which silently assumes every
        # cylinder stands on its end. A transverse traction motor does not: the FE
        # front MGU emits `shape: horizontal_cylinder, axis: 'x', len 141.6,
        # dia 177.9`, so its X span is the LENGTH and its Y/Z spans are the
        # DIAMETER. With the axis ignored, the contract expected width and height
        # the other way round and G23 reported all 23 drawn boxes as disagreeing
        # with the manifest — "w 107.0 vs 134.5; h 134.5 vs 107.0", a transposition
        # repeated entity by entity. THE DRAWING WAS RIGHT AND THE GATE WAS WRONG;
        # a gate that misprojects the geometry it audits manufactures defects and
        # buries the real ones. Default stays 'z' so vertical vessels/tanks — the
        # overwhelming majority and the only case previously exercised — are
        # byte-identical.
        dia = float(dims.get("dia") or 0.0)
        ln = float(dims.get("len") or 0.0)
        axis = str(dims.get("axis") or "z").strip().lower()
        if axis == "x":
            w, d, h = ln, dia, dia
        elif axis == "y":
            w, d, h = dia, ln, dia
        else:
            w = d = dia
            h = ln
    else:
        w = float(dims.get("w") or 0.0)
        d = float(dims.get("d") or 0.0)
        h = float(dims.get("h") or 0.0)
    if w <= 0 or h <= 0:
        return None
    return (x - w / 2.0, x + w / 2.0,
            y - d / 2.0, y + d / 2.0,
            z - h / 2.0, z + h / 2.0)


def expected_rect_px(row: Mapping, view: str, datum: Mapping,
                     bbox_mm: Optional[tuple] = None) -> Optional[tuple]:
    """Independently recompute (x, y, w, h) in paper px for `row` in `view`.

    `datum` is the view record the writer emitted: origin_x/origin_y (paper px), ppm,
    the model min/max used by the mapping, and z_shift_mm (the FFL rebase draw_ga applies
    before drawing). Returns None when the row carries no usable geometry.
    """
    # FITTED mode (plant/product sheets) passes the part's POST-FIT bounds explicitly,
    # because `_fit_product_parts_to_envelope` rebases/scales/clamps per part and the
    # manifest row no longer predicts the drawing. Everything after this point — the
    # projection maths itself — is identical for both modes, which is the point: one
    # projection implementation, two sources of truth for what is being projected.
    bb = bbox_mm if bbox_mm is not None else manifest_bbox_mm(row)
    if bb is None:
        return None
    xmin, xmax, ymin, ymax, zmin, zmax = bb
    try:
        ppm = float(datum["ppm"])
        ox = float(datum["origin_x"])
        oy = float(datum["origin_y"])
    except (KeyError, TypeError, ValueError):
        return None
    if ppm <= 0:
        return None
    zsh = float(datum.get("z_shift_mm") or 0.0)
    zmin, zmax = zmin - zsh, zmax - zsh

    if view == "front":
        x_ref = float(datum.get("x_min_mm") or 0.0)
        z_top = float(datum.get("z_max_mm") or 0.0)
        return (ox + (xmin - x_ref) * ppm, oy + (z_top - zmax) * ppm,
                (xmax - xmin) * ppm, (zmax - zmin) * ppm)
    if view == "top":
        x_ref = float(datum.get("x_min_mm") or 0.0)
        y_top = float(datum.get("y_max_mm") or 0.0)
        return (ox + (xmin - x_ref) * ppm, oy + (y_top - ymax) * ppm,
                (xmax - xmin) * ppm, (ymax - ymin) * ppm)
    if view == "side":
        # VERIFIED against the actual SIDE loop (draw_ga.py ~L2412), NOT assumed:
        #     px = side_x + (y_max - p.y1) * ppm
        # The side elevation INVERTS Y with the same handedness as the plan ("plan rows
        # run north(top)->south"). An earlier version of this contract used
        # (ymin - y_min_mm), which is a different quantity and would have false-fired on
        # every side-view entity. The contract must describe the rectangle actually
        # emitted, not the intuitive one.
        y_top = float(datum.get("y_max_mm") or 0.0)
        z_top = float(datum.get("z_max_mm") or 0.0)
        return (ox + (y_top - ymax) * ppm, oy + (z_top - zmax) * ppm,
                (ymax - ymin) * ppm, (zmax - zmin) * ppm)
    return None


def compare_rect(drawn: tuple, expected: tuple) -> Optional[str]:
    """None when the drawn rect matches the manifest expectation; else why it does not."""
    dx, dy, dw, dh = (float(v) for v in drawn)
    ex, ey, ew, eh = (float(v) for v in expected)
    bad = []
    if abs(dx - ex) > PROJECTION_POS_TOL_PX:
        bad.append(f"x {dx:.1f} vs {ex:.1f}")
    if abs(dy - ey) > PROJECTION_POS_TOL_PX:
        bad.append(f"y {dy:.1f} vs {ey:.1f}")
    if abs(dw - ew) > PROJECTION_SIZE_TOL_PX:
        bad.append(f"w {dw:.1f} vs {ew:.1f}")
    if abs(dh - eh) > PROJECTION_SIZE_TOL_PX:
        bad.append(f"h {dh:.1f} vs {eh:.1f}")
    return "; ".join(bad) if bad else None


def _selftest() -> int:
    """Prove the axis is honoured — and that the default is unchanged."""
    fails = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    # ⭐ proveCatch: a horizontal cylinder along X must span `len` in X and `dia`
    # in Y and Z. This is the exact FE front MGU traction-motor row that made G23
    # report 23 false transpositions.
    row_x = {"pos_mm": [0.0, 5.1, 408.5],
             "dims_mm": {"dia": 177.9, "len": 141.6, "axis": "x"}}
    bb = manifest_bbox_mm(row_x)
    ck("axis_x.spans", bb is not None
       and abs((bb[1] - bb[0]) - 141.6) < 1e-6
       and abs((bb[3] - bb[2]) - 177.9) < 1e-6
       and abs((bb[5] - bb[4]) - 177.9) < 1e-6,
       f"axis=x cylinder mis-spanned: {bb}")

    row_y = {"pos_mm": [0, 0, 0], "dims_mm": {"dia": 10.0, "len": 40.0, "axis": "y"}}
    bby = manifest_bbox_mm(row_y)
    ck("axis_y.spans", bby is not None
       and abs((bby[1] - bby[0]) - 10.0) < 1e-6
       and abs((bby[3] - bby[2]) - 40.0) < 1e-6
       and abs((bby[5] - bby[4]) - 10.0) < 1e-6,
       f"axis=y cylinder mis-spanned: {bby}")

    # ⭐ REGRESSION: an axis-less cylinder must behave exactly as before (vertical).
    row_z = {"pos_mm": [0, 0, 0], "dims_mm": {"dia": 10.0, "len": 40.0}}
    bbz = manifest_bbox_mm(row_z)
    ck("default_axis_unchanged", bbz is not None
       and abs((bbz[1] - bbz[0]) - 10.0) < 1e-6
       and abs((bbz[5] - bbz[4]) - 40.0) < 1e-6,
       f"axis-less cylinder changed behaviour: {bbz}")

    # A box row must be untouched by any of this.
    bbb = manifest_bbox_mm({"pos_mm": [0, 0, 0], "dims_mm": {"w": 3, "d": 4, "h": 5}})
    ck("box_row_untouched", bbb is not None and abs((bbb[1] - bbb[0]) - 3) < 1e-6
       and abs((bbb[5] - bbb[4]) - 5) < 1e-6, f"box row changed: {bbb}")

    for f in fails:
        print(f"  FAIL {f}")
    print("ga_projection_contract selftest: OK" if not fails
          else f"FAIL ga_projection_contract selftest ({len(fails)} failures)")
    return 1 if fails else 0


if __name__ == "__main__":
    import sys as _sys
    _sys.exit(_selftest())
