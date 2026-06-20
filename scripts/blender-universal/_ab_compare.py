"""A/B the layout-optimiser render vs baseline: ACTUAL routed pipe length (summed
from route-manifest waypoints), plant footprint (from parts-manifest positions),
line count + degenerate/unresolved health. Pure read — no engine state touched."""
import json
import math
import os
import sys


def _load(d, fn):
    p = os.path.join(d, fn)
    return json.load(open(p)) if os.path.exists(p) else None


def _poly_len_m(wp):
    t = 0.0
    for a, b in zip(wp[:-1], wp[1:]):
        t += math.sqrt(sum((b[i] - a[i]) ** 2 for i in range(3)))
    return t / 1000.0


def _summ(d):
    rm = _load(d, "route-manifest.json") or {}
    pm = _load(d, "parts-manifest.json") or {}
    lines = rm.get("lines") or []
    total_run = sum(_poly_len_m(l.get("waypoints_mm") or []) for l in lines)
    parts = pm.get("parts") if isinstance(pm, dict) else (pm or [])
    xs0 = xs1 = ys0 = ys1 = None
    for p in parts:
        pos = p.get("pos_mm")
        dm = p.get("dims_mm")
        if not (isinstance(pos, list) and len(pos) >= 2):
            continue
        if isinstance(dm, dict):
            hx, hy = dm.get("w", 1500.0) / 2.0, dm.get("d", 1500.0) / 2.0
        elif isinstance(dm, list) and len(dm) >= 2:
            hx, hy = dm[0] / 2.0, dm[1] / 2.0
        else:
            hx = hy = 750.0
        lo_x, hi_x, lo_y, hi_y = pos[0] - hx, pos[0] + hx, pos[1] - hy, pos[1] + hy
        xs0 = lo_x if xs0 is None else min(xs0, lo_x)
        xs1 = hi_x if xs1 is None else max(xs1, hi_x)
        ys0 = lo_y if ys0 is None else min(ys0, lo_y)
        ys1 = hi_y if ys1 is None else max(ys1, hi_y)
    fp = ((xs1 - xs0) / 1000.0 * (ys1 - ys0) / 1000.0) if xs0 is not None else 0.0
    span = ((xs1 - xs0) / 1000.0, (ys1 - ys0) / 1000.0) if xs0 is not None else (0, 0)
    return {
        "lines": len(lines),
        "total_run_m": total_run,
        "footprint_m2": fp,
        "span_m": span,
        "skipped_degenerate": rm.get("skipped_degenerate"),
        "count": rm.get("count"),
    }


def main(base, opt):
    b, o = _summ(base), _summ(opt)
    print(f"{'metric':<22}{'BASELINE':>16}{'OPTIMISED':>16}{'delta':>12}")
    print("-" * 66)
    for k, unit in [("lines", ""), ("total_run_m", " m"), ("footprint_m2", " m²")]:
        bv, ov = b[k] or 0, o[k] or 0
        d = (ov / bv - 1) * 100 if bv else 0
        print(f"{k:<22}{bv:>14,.0f}{unit}{ov:>14,.0f}{unit}{d:>+11.0f}%")
    print(f"{'span_m':<22}{str(tuple(round(x,1) for x in b['span_m'])):>16}"
          f"{str(tuple(round(x,1) for x in o['span_m'])):>16}")
    print(f"\nBASE : {b}")
    print(f"OPT  : {o}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
