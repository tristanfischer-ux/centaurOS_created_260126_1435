#!/usr/bin/env python3
"""deterministic_layout.py — the DETERMINISTIC sequence-packer (Tristan 2026-06-29, rewrite "B").

THE PROBLEM IT REPLACES: the accreted place_all + CRAFT layout-optimiser computed positions with
float-sum-order-dependent maths and Blender-object read-back, so the SAME state rendered a
DIFFERENT plant each run (Blender forces hash randomisation; #86). There is no single line to fix —
proven: even the base place_all is intermittently non-deterministic with every post-step disabled.

THE DESIGN (Tristan's spec): a layout that is deterministic BY CONSTRUCTION —
  1. Components placed in PROCESS SEQUENCE (region rank), each as close to the next as possible.
  2. Small standard items CONSOLIDATED into one cabinet per region (10-30 small parts → one box),
     not scattered across the floor.
  3. ALL arithmetic on an INTEGER GRID — no float-sum-order dependence, no set iteration; total-order
     sorts only. Same items in ANY order → identical positions (the unit test proves order-invariance).
This module is PURE (no bpy): the caller passes lightweight item dicts (it computes footprints with
the existing footprint_mm), and uses the returned integer positions as the AUTHORITATIVE coords the
manifest + GA + every drawing read — Blender renders AT them, it does not measure them back.

Run the guard:  python3 scripts/blender-universal/deterministic_layout.py --selftest
"""
from __future__ import annotations

GRID_MM = 100          # all coordinates snap to this integer grid → no sub-grid float residue
AISLE_MM = 2000        # gap between parts within a region row
REGION_GAP_MM = 3000   # gap between regions along the process train
BANK_GAP_MM = 2400     # gap between serpentine banks (Y) — aligned 2026-07-02 with the plant's
#                        established compacted-lane maintenance aisle (build_universal_scene
#                        BANK_COMPACT_GAP_MM = 2400, "a REAL maintenance aisle"); the old 4000
#                        was an arbitrary double-width band that alone cost ~3 m of dead deck
#                        per fold on the v52 codema plant (site-utilisation issue 13)
# A "small standard item" (instrument/junction/small device) is consolidated into a cabinet rather
# than placed as its own floor object. Footprint threshold (plan area) keyed on size, not class.
SMALL_ITEM_MAX_AREA_MM2 = 0.6e6   # ≤ ~0.77 m × 0.77 m plan → a panel/cabinet-internal item
CABINET_CELL_MM = 600             # a consolidated small item occupies this much inside the cabinet
CABINET_MAX_COLS = 6              # cabinet internal grid width before it grows in depth
FOLD_ASPECT_MAX = 2.0             # the fold prefers a bounding rect within this aspect before
#                                   minimising area (a min-area single row can be a 4:1 ribbon)


def _snap(v: float) -> int:
    """Snap a coordinate to the integer GRID_MM lattice — deterministic, float-residue-free."""
    return int(round(v / GRID_MM)) * GRID_MM


def _item_key(it: dict):
    """TOTAL deterministic sort key: process sequence (rank) → region → extraction index → id.
    Every field is an int or str, so the order is identical regardless of input order or hash seed."""
    return (int(it.get("rank", 10_000)), str(it.get("region", "")),
            int(it.get("seq", 0)), str(it.get("id", "")))


def _cabinet_footprint(n_small: int) -> tuple[int, int]:
    """Plan footprint (w,d) mm of ONE cabinet holding `n_small` consolidated small items, laid in a
    CABINET_MAX_COLS-wide internal grid. Deterministic in n only."""
    cols = min(CABINET_MAX_COLS, max(1, n_small))
    rows = (n_small + cols - 1) // cols
    return cols * CABINET_CELL_MM, rows * CABINET_CELL_MM


def _shelf_pack(nodes: list[dict], x0: int, y0: int, target_w: int) -> tuple[dict, int, int]:
    """Place `nodes` (each {id, w, d}) in left→right rows that wrap at target_w, rows stepping +Y.
    INTEGER grid only. Returns ({id:(x,y)}, used_w, used_d). Order of `nodes` is the caller's
    deterministic order — this function adds no ordering of its own."""
    pos = {}
    x, row_y, row_d, used_w = x0, y0, 0, 0
    for nd in nodes:
        w, d = int(nd["w"]), int(nd["d"])
        if x > x0 and x + w > x0 + target_w:        # wrap to a new shelf
            row_y += row_d + AISLE_MM
            x, row_d = x0, 0
        pos[nd["id"]] = (_snap(x + w / 2), _snap(row_y + d / 2))
        x += w + AISLE_MM
        row_d = max(row_d, d)
        used_w = max(used_w, x - x0)
    return pos, used_w, (row_y + row_d - y0)


def _fold_target_w(region_bay: dict, region_order: list) -> int:
    """Bank-fold width that MINIMISES the plant's occupied bounding-RECT area.

    THE DEFECT THIS FIXES (Tristan 2026-07-02, codema v52 "square-width fold"): the single
    sqrt(total-area)·1.4 target wraps EVERY region after the first big bay onto its OWN bank —
    one region per lane, each lane only as wide as its (small) bay — so the plant reads as an
    L / a ragged narrow column on a much larger deck (site utilisation 0.33). A fold can only
    happen at a region boundary, so the SEARCH SPACE is tiny: every contiguous-prefix
    cumulative width is a candidate target (plus the legacy square-ish target); each candidate
    is run through the SAME greedy wrap the placer uses and scored by the bounding-rect area
    it produces (max bank extent × total stacked depth). Smallest area wins; ties break to the
    narrower extent, then the smaller target — pure integer arithmetic over the total-ordered
    region list, so it is deterministic AND order-invariant like everything else here."""
    widths = [int(region_bay[rk][0]) for rk in region_order]
    depths = [int(region_bay[rk][1]) for rk in region_order]
    if not widths:
        return GRID_MM
    widest = max(widths)
    cands = set()
    cum = 0
    for i, w in enumerate(widths):
        cum += w + (REGION_GAP_MM if i else 0)
        cands.add(max(widest, cum))
    total_area = sum(w * d for w, d in zip(widths, depths)) or (GRID_MM * GRID_MM)
    cands.add(max(widest, int((total_area ** 0.5) * 1.4)))   # legacy square-ish target

    def _cost(tw):
        # EXACT mirror of the placement wrap below: greedy, wrap when the bay overshoots tw.
        x, bank_d, depth, used_w = 0, 0, 0, 0
        for w, d in zip(widths, depths):
            if x > 0 and x + w > tw:
                depth += bank_d + BANK_GAP_MM
                x, bank_d = 0, 0
            x += w + REGION_GAP_MM
            bank_d = max(bank_d, d)
            used_w = max(used_w, x - REGION_GAP_MM)
        depth += bank_d
        # ASPECT GATE before raw area: a min-area single row can be a 4:1 ribbon (area
        # does not punish shape) — prefer candidates whose bounding rect stays within
        # FOLD_ASPECT_MAX, then the smallest area, then the narrowest, then smallest tw.
        aspect = max(used_w, depth) / max(1, min(used_w, depth))
        return (aspect > FOLD_ASPECT_MAX, used_w * depth, used_w, tw)

    return min(sorted(cands), key=_cost)


def layout(items: list[dict], n_banks: int = 2, bay_row_w: int | None = None) -> dict:
    """Compute a DETERMINISTIC integer-grid layout for `items`.

    items: [{id, region, rank, seq, w, d, area, small?}]  (w/d = plan footprint mm; area = w*d;
            small=True forces cabinet consolidation; else inferred from area).
    bay_row_w: optional fixed shelf width for EVERY region bay (mm). The periphery-hug caller
            uses it to pack a back-row region as a SHALLOW ROW spanning the train width instead
            of the square-ish default (which stacked 2-3 cabinets into a deep one-part-per-row
            column). None → the square-ish per-bay target (the default for the process train).
    Returns {id: (x_mm, y_mm)} for every PRINCIPAL item PLUS one synthetic cabinet per region that
    had ≥2 small items, id 'cabinet::<region>' — and every small item maps to its cabinet's slot so
    the caller can draw/skip as it chooses. Positions are integers on GRID_MM; the SAME items in ANY
    input order yield IDENTICAL output (proven in _selftest)."""
    if not items:
        return {}
    # 1) TOTAL-ORDER sort — the only ordering in the whole module; everything below is order-free.
    ordered = sorted(items, key=_item_key)

    # 2) group by region, preserving first-seen region order (which, after the sort, is rank order).
    region_order: list[str] = []
    by_region: dict[str, list[dict]] = {}
    for it in ordered:
        rk = str(it.get("region", ""))
        if rk not in by_region:
            by_region[rk] = []
            region_order.append(rk)
        by_region[rk].append(it)

    # 3) within each region: split principals vs small items; small → ONE cabinet node.
    region_nodes: dict[str, list[dict]] = {}
    cabinet_members: dict[str, list[str]] = {}
    for rk in region_order:
        principals, small = [], []
        for it in by_region[rk]:
            is_small = bool(it.get("small")) or float(it.get("area", it.get("w", 0) * it.get("d", 0))) <= SMALL_ITEM_MAX_AREA_MM2
            (small if is_small else principals).append(it)
        nodes = [{"id": it["id"], "w": int(it.get("w", GRID_MM)), "d": int(it.get("d", GRID_MM))}
                 for it in principals]
        if len(small) >= 2:
            cw, cd = _cabinet_footprint(len(small))
            nodes.append({"id": f"cabinet::{rk}", "w": cw, "d": cd})
            cabinet_members[rk] = [it["id"] for it in small]
        elif small:                       # a lone small item just sits as itself (no cabinet)
            nodes.extend({"id": it["id"], "w": int(it.get("w", GRID_MM)), "d": int(it.get("d", GRID_MM))} for it in small)
        # DEPTH-SORTED SHELVES (2026-07-02, the v52 ragged-row fix): pack each bay's rows
        # deepest-part-first (FFDH — like-depth parts share a shelf) so a lone deep tank
        # can't blow a mixed row's depth while later rows run half-empty. Within-region
        # order is NOT process order (extraction seq ties → alphabetical id), so this
        # re-order loses nothing semantic; big-at-the-back also mirrors the legacy
        # big/medium/small banding. Deterministic + order-invariant (pure sort key).
        nodes.sort(key=lambda nd: (-nd["d"], -nd["w"], nd["id"]))
        region_nodes[rk] = nodes

    # 4) shelf-pack each region into a compact BAY (square-ish), then lay the bays in PROCESS ORDER
    #    left→right, WRAPPING to a new bank when the running width exceeds the MIN-AREA fold target
    #    (_fold_target_w — the compactness fix; the old single sqrt-target stranded one region per
    #    lane and shipped an L-shaped plant on a mostly-empty deck). All integer-grid, process order
    #    preserved, deterministic. `n_banks` is retained for API compatibility (an upper-cap idea
    #    the min-area search supersedes).
    #    Bay width accounts for the AISLE each part carries ((w+aisle)·(d+aisle) pitch area, not the
    #    bare footprint area): the bare-area sqrt under-estimated the row budget so small-part
    #    regions shelf-wrapped into one-part-per-row columns 3-5× deeper than wide.
    region_bay: dict[str, tuple] = {}
    for rk in region_order:
        nodes = region_nodes[rk]
        bay_area = sum((nd["w"] + AISLE_MM) * (nd["d"] + AISLE_MM) for nd in nodes) \
            or (GRID_MM * GRID_MM)
        bay_target_w = int(bay_row_w) if bay_row_w else max(GRID_MM, int((bay_area ** 0.5) * 1.4))
        rpos, used_w, used_d = _shelf_pack(nodes, 0, 0, bay_target_w)
        region_bay[rk] = (used_w, used_d, rpos)
    target_w = _fold_target_w(region_bay, region_order)
    min_banks = max(1, (len(region_order) + max(1, n_banks * 4) - 1) // max(1, n_banks * 4))  # cap fold
    out: dict[str, tuple[int, int]] = {}
    x_cursor, bank_y, bank_d, n_banks_used = 0, 0, 0, 1
    for rk in region_order:
        used_w, used_d, rpos = region_bay[rk]
        if x_cursor > 0 and x_cursor + used_w > target_w:   # wrap to a new bank
            bank_y += bank_d + BANK_GAP_MM
            x_cursor, bank_d = 0, 0
            n_banks_used += 1
        for pid, (lx, ly) in rpos.items():
            out[pid] = (_snap(x_cursor + lx), _snap(bank_y + ly))
        x_cursor += used_w + REGION_GAP_MM
        bank_d = max(bank_d, used_d)
    _ = min_banks  # (reserved: a future fold cap; width-budget wrap governs squareness today)
    # map each small item to its cabinet position so the caller can resolve it.
    for rk, members in cabinet_members.items():
        cpos = out.get(f"cabinet::{rk}")
        if cpos:
            for mid in members:
                out[mid] = cpos
    return out


def _selftest() -> int:
    import random as _r
    bad = 0
    items = []
    for i in range(40):
        rank = (i % 5) * 10
        area = 5_000_000 if i % 3 == 0 else 300_000   # mix of principals + small items
        w = d = int(area ** 0.5)
        items.append({"id": f"P{i}", "region": f"region_{rank}", "rank": rank, "seq": i,
                      "w": w, "d": d, "area": area})
    base = layout(list(items))
    # (1) DETERMINISM: same input → identical output.
    if layout(list(items)) != base:
        print("  FAIL: same input gave a different layout (non-deterministic)"); bad += 1
    # (2) ORDER-INVARIANCE: shuffled input → IDENTICAL output (the property the old placer lacked).
    for seed in (1, 2, 3):
        sh = list(items); _r.Random(seed).shuffle(sh)
        if layout(sh) != base:
            print(f"  FAIL: shuffled input (seed {seed}) changed the layout — not order-invariant"); bad += 1
            break
    # (3) INTEGER GRID: every coordinate snaps to GRID_MM.
    if any(x % GRID_MM or y % GRID_MM for (x, y) in base.values()):
        print("  FAIL: a coordinate is not on the integer GRID_MM lattice"); bad += 1
    # (4) CABINET CONSOLIDATION: small items collapsed onto a per-region cabinet (fewer distinct
    #     positions than items in a region with many smalls).
    if not any(k.startswith("cabinet::") for k in base):
        print("  FAIL: no cabinet was synthesised for the small items"); bad += 1

    # (5) COMPACT FOLD (2026-07-02, the v52 "square-width fold" guard): one BIG region + several
    #     small ones must NOT strand each small region on its own bank (the L-shaped plant on an
    #     empty deck). The min-area fold packs the smalls side-by-side, so the layout's bounding
    #     rect must stay within a sane aspect AND must beat the one-region-per-bank stacking.
    def _brect(itms, pos):
        fp = {it["id"]: (it["w"], it["d"]) for it in itms}
        x0 = y0 = 1e12; x1 = y1 = -1e12
        for k, (cx, cy) in pos.items():
            if k not in fp:
                continue
            w, d = fp[k]
            x0 = min(x0, cx - w / 2); x1 = max(x1, cx + w / 2)
            y0 = min(y0, cy - d / 2); y1 = max(y1, cy + d / 2)
        return (x1 - x0), (y1 - y0)
    lshape = [{"id": "BIG", "region": "r_00_feed", "rank": 0, "seq": 0,
               "w": 16000, "d": 12000, "area": 16000 * 12000}]
    for i in range(4):
        lshape.append({"id": f"S{i}", "region": f"r_{10 + i}_aux", "rank": 10 + i, "seq": i + 1,
                       "w": 4000, "d": 2500, "area": 4000 * 2500})
    lw, ld = _brect(lshape, layout(list(lshape)))
    aspect = max(lw, ld) / max(1.0, min(lw, ld))
    if aspect > 2.5:
        print(f"  FAIL: big+4-small fold is a {aspect:.1f}:1 strip/column (limit 2.5:1) — "
              f"the smalls were stranded one-per-bank"); bad += 1
    # stacked-per-bank depth would be 12000 + 4×(2500+BANK_GAP_MM); the fold must beat it clearly
    if ld >= 12000 + 2 * (2500 + BANK_GAP_MM):
        print(f"  FAIL: fold depth {ld:.0f} mm ≈ the one-region-per-bank stack (no compaction)"); bad += 1
    # (6) bay_row_w: a cabinet row packed with an explicit row budget stays ONE shallow row.
    row_items = [{"id": f"C{i}", "region": "r_90_elec", "rank": 90, "seq": i,
                  "w": 1800, "d": 900, "area": 1800 * 900} for i in range(3)]
    rw, rd = _brect(row_items, layout(list(row_items), bay_row_w=20000))
    if rd > 900 + GRID_MM:
        print(f"  FAIL: bay_row_w row wrapped into {rd:.0f} mm depth (want one 900 mm row)"); bad += 1
    print("deterministic_layout selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(1 if _selftest() else 0)
    print(__doc__)
