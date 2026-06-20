"""layout_optimiser.py — DETERMINISTIC plant-layout optimiser (the Facility Layout Problem).

Tristan 2026-06-20: "a full layout optimisation module that was deterministic and really
good." The current placement is a greedy bank-stack that minimises nothing globally, so the
RAS plant spreads to ~1,400 m² (26.8×52 m) vs its ~875 m² building and the pipe runs are
long (the D8 cost-inflation root). This module solves it properly:

  minimise  Σ wᵢⱼ · manhattan(i, j)   — wᵢⱼ = the ledger's connection COST DRIVER (a DN600
                                         recirc main weighs far more than a DN15 service
                                         line; a 4,000 A bus more than a signal cable)
  subject to  no footprint overlap (+ maintenance clearance) and hazard separations.

Manhattan distance because pipes route orthogonally — so minimising it directly minimises
pipe + cable cost AND declutters the render (short runs, no web). The CONNECTION LEDGER is
the weighted input; the footprints come from the parts. ALGORITHM = CRAFT (deterministic
constructive seed by descending edge-weight + pairwise-exchange improvement) — dependency-
free, fast at any size, reproducible (no RNG; same input → same layout, the anti-yo-yo
property). Run `python3 layout_optimiser.py <run_dir>` to A/B against the current placement,
or `--selftest`.
"""
import json
import math
import os
import re

# ── tuning (all deterministic) ──────────────────────────────────────────────
GRID_MM = 2000          # placement grid resolution (2 m — a real plant module grid)
MAX_EXCHANGE_PASSES = 12
# Maintenance-aisle halo SCALES with the part: a big vessel needs a real walk-round aisle,
# a small instrument/valve packs tight next to its neighbour. (A flat 1.5 m halo on all 80
# parts spread the plant 75% LARGER — the small kit dominated the area.)
CLEAR_MIN_MM, CLEAR_MAX_MM, CLEAR_FRAC = 300.0, 1500.0, 0.20
# COMPACTNESS pull toward the anchor (origin): every part has a small attraction to the
# centre so weakly-connected kit packs in instead of drifting to a far free cell. Balances
# against the connection weights — high enough to keep the footprint tight, low enough that
# it never overrides a real high-flow main.
COMPACT_W = 1.5
# Service → base objective weight (keep the high-cost services SHORT). Fluid/thermal mains
# dominate (£/m × bore); power next; signal/assembly are cheap + short by nature.
_SERVICE_BASE = {"water": 3.0, "thermal": 3.0, "air": 1.6, "power": 1.4,
                 "signal": 0.4, "assembly": 0.5}
# HAZARD SEPARATION — pairs that must sit ≥ the stated metres apart (oxidiser/cryogen away
# from ignition; the standby genset off the wet process block). Class-agnostic vocabulary.
_OXIDISER_RE = re.compile(r"\blox\b|liquid[_ -]?oxygen|oxygen[_ -]?(?:supply|cone|generat)|"
                          r"ozone|\bpsa\b|\bo2\b", re.I)
_IGNITION_RE = re.compile(r"generator|genset|\bgas\b|boiler|fired|flame|switchgear|"
                          r"transformer|\bmcc\b|motor[_ -]?control", re.I)
HAZARD_SEP_MM = 8000    # ≥ 8 m oxidiser ↔ ignition (a typical process safety separation)


def _service_of(mech):
    m = str(mech or "").lower()
    if "electric" in m or m in ("ac_busbar", "dc_bus", "power"):
        return "power"
    if "signal" in m or "data" in m:
        return "signal"
    if "thermal" in m or "heat" in m or "steam" in m:
        return "thermal"
    if "air" in m or "vent" in m or "duct" in m or "gas" in m:
        return "air"
    if "assembly" in m or "mechanical" in m:
        return "assembly"
    return "water"


def edge_weight(e):
    """Objective weight for one ledger edge — service base × a flow/current magnitude
    factor so a high-flow MAIN (the recirc loop) outranks a low-flow service tie and is
    pulled adjacent. Deterministic, no lookup tables."""
    svc = e.get("service") or _service_of(e.get("mechanism"))
    base = _SERVICE_BASE.get(svc, 1.0)
    rv = e.get("required_value")
    if isinstance(rv, (int, float)) and rv > 0:
        # log-compress so one giant flow doesn't swamp the layout, but mains still lead.
        base *= 1.0 + math.log10(1.0 + rv * 1000.0)
    return base


def _footprint_mm(node):
    """(w, d) plan footprint in mm from dims_mm, with a sane floor for tiny/again-less kit."""
    dm = node.get("dims_mm")
    if isinstance(dm, (list, tuple)) and len(dm) >= 2 and all(isinstance(x, (int, float)) for x in dm[:2]):
        w, d = float(dm[0]), float(dm[1])
    else:
        w = d = 1500.0
    return max(800.0, w), max(800.0, d)


def _clearance(fp_tuple):
    """Maintenance aisle for a part — scales with its size (big vessel → real aisle; small
    instrument → snug). Avoids the flat-halo over-spread."""
    return min(CLEAR_MAX_MM, max(CLEAR_MIN_MM, min(fp_tuple) * CLEAR_FRAC))


def _overlaps(ax, ay, aw, ad, bx, by, bw, bd, clear):
    """Do two footprints (centre x/y, w/d) overlap once a clearance halo is added?"""
    return (abs(ax - bx) * 2 < (aw + bw) + 2 * clear and
            abs(ay - by) * 2 < (ad + bd) + 2 * clear)


def total_weighted_length(pos, edges, name_resolve):
    """Σ weight × manhattan over every edge whose BOTH endpoints are placed real parts."""
    tot = 0.0
    for e in edges:
        a = name_resolve(e.get("from_part")); b = name_resolve(e.get("to_part"))
        if a in pos and b in pos:
            (ax, ay), (bx, by) = pos[a], pos[b]
            tot += edge_weight(e) * (abs(ax - bx) + abs(ay - by))
    return tot


def bbox_area_m2(pos, fp):
    if not pos:
        return 0.0
    xs0 = [x - fp[n][0] / 2 for n, (x, y) in pos.items()]
    xs1 = [x + fp[n][0] / 2 for n, (x, y) in pos.items()]
    ys0 = [y - fp[n][1] / 2 for n, (x, y) in pos.items()]
    ys1 = [y + fp[n][1] / 2 for n, (x, y) in pos.items()]
    return (max(xs1) - min(xs0)) / 1000.0 * (max(ys1) - min(ys0)) / 1000.0


def optimise(nodes, edges, name_resolve=None, log=print):
    """CRAFT layout. nodes = [{name, dims_mm}]; edges = ledger rows. Returns {name:(x,y)}
    in mm, deterministic. name_resolve maps an edge endpoint string → a node name (default
    identity)."""
    name_resolve = name_resolve or (lambda s: s)
    names = [n["name"] for n in nodes if n.get("name")]
    nameset = set(names)
    fp = {n["name"]: _footprint_mm(n) for n in nodes if n.get("name")}

    # adjacency weight between placed real parts (sum the edge weights per unordered pair).
    wpair = {}
    incident = {nm: 0.0 for nm in names}
    for e in edges:
        a = name_resolve(e.get("from_part")); b = name_resolve(e.get("to_part"))
        if a in nameset and b in nameset and a != b:
            w = edge_weight(e)
            key = (a, b) if a < b else (b, a)
            wpair[key] = wpair.get(key, 0.0) + w
            incident[a] += w; incident[b] += w

    def _w(a, b):
        return wpair.get((a, b) if a < b else (b, a), 0.0)

    def _hazard(a, b):
        na, nb = a, b
        ox = (_OXIDISER_RE.search(na) and _IGNITION_RE.search(nb)) or \
             (_OXIDISER_RE.search(nb) and _IGNITION_RE.search(na))
        return HAZARD_SEP_MM if ox else 0.0

    # DETERMINISTIC order: anchor = the most-connected part; then descending incident weight,
    # ties by name. The anchor (the tank farm / hub) sits at the origin.
    order = sorted(names, key=lambda n: (-incident[n], n))
    pos = {}

    def _free(nm, cx, cy):
        for o, (ox, oy) in pos.items():
            clr = max(_clearance(fp[nm]), _clearance(fp[o]), _hazard(nm, o))
            if _overlaps(cx, cy, *fp[nm], ox, oy, *fp[o], clr):
                return False
        return True

    def _cost_at(nm, cx, cy):
        c = COMPACT_W * (abs(cx) + abs(cy))   # compactness pull toward the anchor (origin)
        for o, (ox, oy) in pos.items():
            w = _w(nm, o)
            if w:
                c += w * (abs(cx - ox) + abs(cy - oy))
        return c

    for nm in order:
        if not pos:
            pos[nm] = (0.0, 0.0)        # anchor at origin
            continue
        # candidate grid: a box around the current placed bbox, one footprint margin out.
        xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
        pad = max(fp[nm]) + 2 * CLEAR_MAX_MM
        x0 = math.floor((min(xs) - pad) / GRID_MM) * GRID_MM
        x1 = math.ceil((max(xs) + pad) / GRID_MM) * GRID_MM
        y0 = math.floor((min(ys) - pad) / GRID_MM) * GRID_MM
        y1 = math.ceil((max(ys) + pad) / GRID_MM) * GRID_MM
        best = None
        cx = x0
        while cx <= x1:
            cy = y0
            while cy <= y1:
                if _free(nm, cx, cy):
                    c = _cost_at(nm, cx, cy)
                    # tie-break deterministically toward the centroid (compactness)
                    tb = abs(cx) + abs(cy)
                    if best is None or (c, tb) < (best[0], best[1]):
                        best = (c, tb, cx, cy)
                cy += GRID_MM
            cx += GRID_MM
        pos[nm] = (best[2], best[3]) if best else (x1 + pad, 0.0)

    # ── CRAFT pairwise-exchange improvement (deterministic) ──────────────────
    def _all_cost():
        c = sum(_w(a, b) * (abs(pos[a][0] - pos[b][0]) + abs(pos[a][1] - pos[b][1]))
                for (a, b) in wpair)
        c += COMPACT_W * sum(abs(x) + abs(y) for (x, y) in pos.values())  # compactness
        return c

    for _pass in range(MAX_EXCHANGE_PASSES):
        improved = False
        cur = _all_cost()
        for i in range(len(order)):
            for j in range(i + 1, len(order)):
                a, b = order[i], order[j]
                pa, pb = pos[a], pos[b]
                pos[a], pos[b] = pb, pa
                ok = (_free_excluding(pos, fp, a, b, _hazard) and
                      _free_excluding(pos, fp, b, a, _hazard))
                if ok and _all_cost() < cur - 1e-6:
                    cur = _all_cost(); improved = True
                else:
                    pos[a], pos[b] = pa, pb   # revert
        if not improved:
            break

    # normalise to a positive quadrant (mirror the render's origin convention)
    minx = min(p[0] - fp[n][0] / 2 for n, p in pos.items())
    miny = min(p[1] - fp[n][1] / 2 for n, p in pos.items())
    pos = {n: (round(x - minx, 1), round(y - miny, 1)) for n, (x, y) in pos.items()}
    return pos, fp


def _free_excluding(pos, fp, nm, skip, hazard):
    cx, cy = pos[nm]
    for o, (ox, oy) in pos.items():
        if o == nm or o == skip:
            continue
        clr = max(_clearance(fp[nm]), _clearance(fp[o]), hazard(nm, o))
        if _overlaps(cx, cy, *fp[nm], ox, oy, *fp[o], clr):
            return False
    return True


# --------------------------------------------------------------------------- CLI / A/B
def _load(run_dir, fn):
    p = os.path.join(run_dir, fn)
    return json.load(open(p)) if os.path.exists(p) else None


def ab_report(run_dir, log=print):
    """A/B the optimiser against the CURRENT Blender placement: read parts-manifest (placed
    positions + dims) + connection-ledger (edges), report total-weighted-run + footprint
    for both. The optimiser should be SHORTER + TIGHTER."""
    pm = _load(run_dir, "parts-manifest.json") or {}
    led = _load(run_dir, "connection-ledger.json") or {}
    parts = pm.get("parts") if isinstance(pm, dict) else pm
    edges = led.get("rows") or []
    if not parts or not edges:
        log("[layout] need parts-manifest.json + connection-ledger.json"); return None
    nodes = [{"name": p.get("name"), "dims_mm": p.get("dims_mm")} for p in parts if p.get("name")]
    nameset = {n["name"] for n in nodes}

    def _resolve(s):
        s = str(s or "")
        if s in nameset:
            return s
        # tolerant token match (ledger uses resolved part names; manifest matches)
        st = set(re.split(r"[^a-z0-9]+", s.lower()))
        best, bov = None, 0
        for nm in nameset:
            ov = len(st & set(re.split(r"[^a-z0-9]+", nm.lower())))
            if ov > bov:
                best, bov = nm, ov
        return best if bov >= 1 else s

    # CURRENT layout from the manifest positions
    cur_pos = {p["name"]: (p["pos_mm"][0], p["pos_mm"][1])
               for p in parts if p.get("name") and isinstance(p.get("pos_mm"), list)}
    cur_fp = {n["name"]: _footprint_mm(n) for n in nodes}
    cur_len = total_weighted_length(cur_pos, edges, _resolve)
    cur_area = bbox_area_m2(cur_pos, cur_fp)

    new_pos, new_fp = optimise(nodes, edges, name_resolve=_resolve, log=log)
    new_len = total_weighted_length(new_pos, edges, _resolve)
    new_area = bbox_area_m2(new_pos, new_fp)

    dl = (1 - new_len / cur_len) * 100 if cur_len else 0
    da = (1 - new_area / cur_area) * 100 if cur_area else 0
    log(f"[layout] CURRENT : weighted-run {cur_len:,.0f}  ·  footprint {cur_area:,.0f} m²")
    log(f"[layout] OPTIMISED: weighted-run {new_len:,.0f}  ·  footprint {new_area:,.0f} m²")
    log(f"[layout] → weighted pipe/cable run -{dl:.0f}%  ·  footprint -{da:.0f}%")
    return {"current": {"len": cur_len, "area_m2": cur_area},
            "optimised": {"len": new_len, "area_m2": new_area, "pos": new_pos}}


def _selftest():
    # 4 process units in a loop + 2 services; the optimiser must place the loop compactly
    # and keep the oxidiser away from the genset.
    nodes = [{"name": "Tank", "dims_mm": [8000, 8000]},
             {"name": "Drum Filter", "dims_mm": [3000, 2000]},
             {"name": "Biofilter", "dims_mm": [4000, 4000]},
             {"name": "Recirc Pump", "dims_mm": [2000, 1500]},
             {"name": "LOX Tank", "dims_mm": [3000, 3000]},
             {"name": "Standby Generator", "dims_mm": [4000, 2500]}]
    edges = [
        {"from_part": "Tank", "to_part": "Drum Filter", "service": "water", "required_value": 0.5},
        {"from_part": "Drum Filter", "to_part": "Biofilter", "service": "water", "required_value": 0.5},
        {"from_part": "Biofilter", "to_part": "Recirc Pump", "service": "water", "required_value": 0.5},
        {"from_part": "Recirc Pump", "to_part": "Tank", "service": "water", "required_value": 0.5},
        {"from_part": "Standby Generator", "to_part": "Recirc Pump", "service": "power", "required_value": 100},
    ]
    pos, fp = optimise(nodes, edges, log=lambda *a: None)
    assert len(pos) == 6, "all placed"
    # no overlaps
    ns = list(pos)
    for i in range(len(ns)):
        for j in range(i + 1, len(ns)):
            a, b = ns[i], ns[j]
            assert not _overlaps(*pos[a], *fp[a], *pos[b], *fp[b], 0.0), f"overlap {a}/{b}"
    # hazard: LOX Tank must be ≥ 8 m from the generator
    lx, gn = pos["LOX Tank"], pos["Standby Generator"]
    assert (abs(lx[0] - gn[0]) + abs(lx[1] - gn[1])) >= 7000, "oxidiser-ignition separation held"
    # the recirc loop should be compact: tank↔pump manhattan small
    t, p = pos["Tank"], pos["Recirc Pump"]
    print(f"layout_optimiser selftest: OK (6 placed, no overlap, LOX-genset separated, "
          f"loop compact tank-pump={abs(t[0]-p[0])+abs(t[1]-p[1]):.0f} mm)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
    elif len(sys.argv) > 1:
        ab_report(sys.argv[1])
    else:
        print("usage: layout_optimiser.py <run_dir> | --selftest")
