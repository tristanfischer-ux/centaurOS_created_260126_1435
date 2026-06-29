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
BANK_GAP_MM = 4000     # gap between serpentine banks (Y)
# A "small standard item" (instrument/junction/small device) is consolidated into a cabinet rather
# than placed as its own floor object. Footprint threshold (plan area) keyed on size, not class.
SMALL_ITEM_MAX_AREA_MM2 = 0.6e6   # ≤ ~0.77 m × 0.77 m plan → a panel/cabinet-internal item
CABINET_CELL_MM = 600             # a consolidated small item occupies this much inside the cabinet
CABINET_MAX_COLS = 6              # cabinet internal grid width before it grows in depth


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


def layout(items: list[dict], n_banks: int = 2) -> dict:
    """Compute a DETERMINISTIC integer-grid layout for `items`.

    items: [{id, region, rank, seq, w, d, area, small?}]  (w/d = plan footprint mm; area = w*d;
            small=True forces cabinet consolidation; else inferred from area).
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
        region_nodes[rk] = nodes

    # 4) bank the regions in PROCESS ORDER across `n_banks` serpentine lanes (squareness), each
    #    region shelf-packed; bank cursor + lane Y are integer-accumulated (deterministic).
    per_bank = max(1, (len(region_order) + n_banks - 1) // n_banks)
    out: dict[str, tuple[int, int]] = {}
    bank_y = 0
    for b in range(n_banks):
        banks_regions = region_order[b * per_bank:(b + 1) * per_bank]
        if not banks_regions:
            continue
        if b % 2 == 1:                    # serpentine: odd banks flow right→left (reverse order)
            banks_regions = list(reversed(banks_regions))
        x_cursor, bank_d = 0, 0
        for rk in banks_regions:
            # a region's bay width ≈ sqrt(area)·~1.4, but a simple sum-of-widths cap keeps it tight;
            # use a fixed target so packing is deterministic + regions read as columns.
            tot_w = sum(nd["w"] for nd in region_nodes[rk]) or GRID_MM
            target_w = max(GRID_MM, int((tot_w ** 0.5) * 1200))
            rpos, used_w, used_d = _shelf_pack(region_nodes[rk], x_cursor, bank_y, target_w)
            out.update(rpos)
            x_cursor += used_w + REGION_GAP_MM
            bank_d = max(bank_d, used_d)
        bank_y += bank_d + BANK_GAP_MM
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
    print("deterministic_layout selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(1 if _selftest() else 0)
    print(__doc__)
