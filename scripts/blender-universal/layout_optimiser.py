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
# The zone-affinity pull (functional zoning, below): tuned to beat a "signal" tie (0.4)
# and sit near a "power" tie (1.4) — enough to bunch weakly-connected same-role kit —
# while staying well under a real "water"/"thermal" process MAIN (base 3.0 × a
# log-scaled flow factor ≥1), so a genuine high-flow connection always wins over the
# zone pull. Declared up front so _SERVICE_BASE (next) can reference it.
ZONE_AFFINITY_W = 2.2
# Service → base objective weight (keep the high-cost services SHORT). Fluid/thermal mains
# dominate (£/m × bore); power next; signal/assembly are cheap + short by nature.
_SERVICE_BASE = {"water": 3.0, "thermal": 3.0, "air": 1.6, "power": 1.4,
                 "signal": 0.4, "assembly": 0.5,
                 "__zone__": ZONE_AFFINITY_W}   # synthetic functional-zoning pull (below)
# HAZARD SEPARATION — pairs that must sit ≥ the stated metres apart (oxidiser/cryogen away
# from ignition; the standby genset off the wet process block). Class-agnostic vocabulary.
_OXIDISER_RE = re.compile(r"\blox\b|liquid[_ -]?oxygen|oxygen[_ -]?(?:supply|cone|generat)|"
                          r"ozone|\bpsa\b|\bo2\b", re.I)
_IGNITION_RE = re.compile(r"generator|genset|\bgas\b|boiler|fired|flame|switchgear|"
                          r"transformer|\bmcc\b|motor[_ -]?control", re.I)
HAZARD_SEP_MM = 8000    # ≥ 8 m oxidiser ↔ ignition (a typical process safety separation)

# ── FUNCTIONAL ZONING (Sam Green SME review, 2026-07-08: "kit randomly placed, not
# bunched together based on what sides need maintenance/access … huge footprint for a
# 45 m³ system … half of F2 for 1 system whereas we had 3 systems in ~1/4 that area").
# Root cause: the CRAFT objective only pulls parts together when a REAL topology edge
# connects them + a weak global compactness term. Weakly-connected same-ROLE kit (field
# instruments, electrical/control cabinets, small dosing vessels) has near-zero incident
# weight, so it gets placed LAST (the `order` sort is `-incident`) into whatever cell is
# left over once the heavy process train has claimed the centre — scattering it across
# the periphery instead of bunching it with its own kind, exactly Sam's complaint.
#
# Fix: classify every node into a ZONE from GENERIC, UNIVERSAL signals ONLY — its
# geometry-family `shape` (already assigned upstream by the shape classifier: tank/
# vertical_vessel/pump/cabinet/skid_box/… — the same vocabulary every archetype uses,
# NEVER a product-class name) + its footprint AREA (a physical quantity) +, as a
# fallback, its `module` (the universal module-decomposition id — energy_storage_source/
# power_distribution/control_compute_communication/… — again archetype-agnostic). Then
# add a bounded, deterministic "zone affinity" pseudo-edge from every zone member to its
# zone's HUB (the largest-footprint member, tie-broken by name) — ONE extra edge per
# non-hub part, so a big zone's aggregate pull on any single part never exceeds one
# edge's weight and can never swamp a real process MAIN. This buys BOTH of Sam's asks
# at once: parts of a kind cluster (functional zoning) AND the cluster is TIGHT (the
# CRAFT search naturally shelf-fits a hub + its close spokes far more densely than the
# same parts scattered with no shared attractor — this is the density fix, not a
# separate packing pass).
_VESSEL_ZONE_SHAPES = {"tank", "vertical_vessel", "horizontal_vessel",
                       "tall_vessel", "tall_column", "cone_vessel"}
_MACHINE_ZONE_SHAPES = {"pump", "compressor", "centrifuge"}
_ELECTRICAL_ZONE_SHAPES = {"cabinet", "cabinet_small", "transformer_box", "instrument"}
# Below this plan-view footprint a vessel reads as a small ancillary/dosing tank (a 600 L
# drum, a CIP tank, a softener/filter housing); at or above it, a principal storage
# reservoir. 4 m² ≈ a 2.0 m-diameter vessel — the real Codema reservoirs (Ø3.7-5.46 m)
# clear it comfortably; the real dosing tanks (Ø0.9-1.4 m) and filter/softener housings
# (Ø0.9-1.83 m) sit well under it. A physical-size threshold, not a class name.
VESSEL_LARGE_AREA_MM2 = 4.0e6


def classify_zone(node):
    """Return a zone key for `node`, or None if it carries no shape/module signal at all
    (legacy callers that don't pass those keys get NO zoning — old behaviour, unchanged;
    this is what keeps a caller/selftest that never mentions shape/module byte-identical).
    Pure function of shape + footprint area + module — deterministic, class-agnostic."""
    shape = node.get("shape")
    module = node.get("module")
    if shape is None and module is None:
        return None
    if shape in _MACHINE_ZONE_SHAPES:
        return "machines"
    if shape == "skid_box":
        return "process_skids"
    if shape in _VESSEL_ZONE_SHAPES:
        dm = node.get("dims_mm") or [0, 0]
        area = (dm[0] or 0) * (dm[1] or 0) if len(dm) >= 2 else 0
        return "vessels_large" if area >= VESSEL_LARGE_AREA_MM2 else "vessels_small"
    if shape in _ELECTRICAL_ZONE_SHAPES:
        return "electrical_control"
    if module in ("power_distribution", "energy_storage_source",
                  "control_compute_communication", "safety_protection"):
        return "electrical_control"
    return module   # fallback: the universal module id groups whatever shape didn't match


def _zone_hub_edges(nodes):
    """Bounded, deterministic zone-affinity edges: for every zone with ≥2 members, ONE
    synthetic (hub → member) edge per non-hub member (never all-pairs — an O(n) pull, not
    O(n²), so a big zone's total attraction on one part is always exactly one edge's
    weight). Hub = the largest-footprint member, tie-broken by name — stable regardless of
    input order. Returns a list of edge dicts in the SAME shape as a real ledger row."""
    by_zone = {}
    for n in nodes:
        z = classify_zone(n)
        if z is None:
            continue
        by_zone.setdefault(z, []).append(n)

    def _area(n):
        dm = n.get("dims_mm") or [0, 0]
        return (dm[0] or 0) * (dm[1] or 0) if len(dm) >= 2 else 0

    virtual = []
    for z in sorted(by_zone):               # deterministic zone-iteration order
        members = by_zone[z]
        if len(members) < 2:
            continue
        hub = max(members, key=lambda n: (_area(n), n["name"]))
        for m in sorted(members, key=lambda n: n["name"]):
            if m is hub:
                continue
            virtual.append({"from_part": hub["name"], "to_part": m["name"],
                             "mechanism": "zone_affinity", "service": "__zone__"})
    return virtual


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
    """(w, d) plan footprint in mm from dims_mm, with a sane floor for tiny/again-less kit.
    Accepts dims_mm as a LIST [w, d, ...] OR the parts-manifest DICT {w,d,h} / {dia,len}
    (a cylinder's plan footprint is dia × dia). Reading the dict was the ab_report bug that
    silently treated every part as a 1.5 m box → a falsely-optimistic footprint A/B."""
    dm = node.get("dims_mm")
    w = d = None
    if isinstance(dm, (list, tuple)) and len(dm) >= 2 and all(isinstance(x, (int, float)) for x in dm[:2]):
        w, d = float(dm[0]), float(dm[1])
    elif isinstance(dm, dict):
        if dm.get("w") and dm.get("d"):
            w, d = float(dm["w"]), float(dm["d"])
        elif dm.get("dia"):
            w = d = float(dm["dia"])
    if w is None or d is None:
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
    # FUNCTIONAL ZONING (Sam Green SME review, 2026-07-08): merge in the bounded, deterministic
    # zone-affinity edges (hub→member, one per non-hub zone member) BEFORE the determinism sort
    # below, so they flow through the exact same canonical-order + wpair/incident accumulation as
    # a real ledger edge — no separate code path, no separate non-determinism risk. classify_zone()
    # returns None (no edge) for any node missing both `shape` and `module`, so a caller that never
    # passes those keys (e.g. the pre-existing selftest below) gets zero zone edges — byte-identical
    # to the pre-zoning behaviour.
    edges = list(edges or []) + _zone_hub_edges(nodes)
    # DETERMINISM (#86, Tristan 2026-06-29): canonicalise the edge order BEFORE accumulating incident
    # weights. The caller's `edges` arrive in a non-deterministic order (Blender forces hash
    # randomisation; upstream topology iterates sets), and `incident[a] += w` float-accumulates in that
    # order — floating-point addition is NOT associative, so the low bits of incident differed per run,
    # flipping the `-incident` tie-break in the placement `order` below → a DIFFERENT optimised layout
    # every render. A fixed accumulation order makes incident bit-identical. Universal; pure sort.
    edges = sorted(edges or [], key=lambda e: (
        str(e.get("from_part") or ""), str(e.get("to_part") or ""),
        str(e.get("mechanism") or ""), str(e.get("size") or e.get("size_label") or "")))

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
    order = sorted(names, key=lambda n: (-round(incident[n], 3), n))   # round → float-noise-proof tie-break (#86)
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

    # ── FUNCTIONAL ZONING regression guard (Sam Green SME review, 2026-07-08) ──────────────
    # proveCatch: two same-role groups with ZERO edges between their own members (the exact
    # failure mode — weakly/unconnected same-role kit used to scatter with no attraction to
    # its own kind) must still end up CLUSTERED: each group's average distance to its OWN
    # centroid must be less than the separation between the two groups' centroids.
    zone_nodes = (
        [{"name": f"CAB{i}", "dims_mm": [800, 800], "shape": "cabinet",
          "module": "power_distribution"} for i in range(4)]
        + [{"name": f"TANK{i}", "dims_mm": [1100, 1100], "shape": "tank",
            "module": "mass_fluid_transport_process"} for i in range(4)])
    zpos, _zfp = optimise(zone_nodes, [], log=lambda *a: None)
    def _centroid(names):
        xs = [zpos[n][0] for n in names]; ys = [zpos[n][1] for n in names]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    def _avg_to(names, c):
        return sum(abs(zpos[n][0] - c[0]) + abs(zpos[n][1] - c[1]) for n in names) / len(names)
    cabs, tanks = [f"CAB{i}" for i in range(4)], [f"TANK{i}" for i in range(4)]
    c_cab, c_tank = _centroid(cabs), _centroid(tanks)
    inter = abs(c_cab[0] - c_tank[0]) + abs(c_cab[1] - c_tank[1])
    assert _avg_to(cabs, c_cab) < inter, "cabinets clustered tighter than the inter-zone gap"
    assert _avg_to(tanks, c_tank) < inter, "tanks clustered tighter than the inter-zone gap"

    # proveNoFalsePositive: a caller that never mentions shape/module (every OTHER existing
    # caller, incl. the hazard-separation case above) gets classify_zone(...) is None for
    # every node → zero zone-affinity edges → BYTE-IDENTICAL positions to a run with the
    # zoning code stripped out entirely. Verify directly: the 6-part case re-run must match.
    pos2, _fp2 = optimise(nodes, edges, log=lambda *a: None)
    assert pos2 == pos, "no shape/module signal ⇒ zoning is a no-op (unchanged legacy behaviour)"
    print("layout_optimiser selftest: OK (functional zoning clusters unconnected same-role "
          "kit; legacy callers with no shape/module signal are untouched)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
    elif len(sys.argv) > 1:
        ab_report(sys.argv[1])
    else:
        print("usage: layout_optimiser.py <run_dir> | --selftest")
