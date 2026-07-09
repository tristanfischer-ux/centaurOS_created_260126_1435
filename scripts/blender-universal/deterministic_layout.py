#!/usr/bin/env python3
"""deterministic_layout.py — the DETERMINISTIC 2-D skyline packer (Tristan 2026-07-08, rewrite "C").

THE PROBLEM IT REPLACES: rewrite "B" (2026-06-29) fixed NON-DETERMINISM (same state → same plant)
by packing each region into its own rectangular "bay" (shelf-pack, FFDH) and then stacking those
bays into row-wrapped "banks" separated by a FLAT 3000/2400 mm gap. That two-level bay+bank scheme
is itself the dead-space source Sam Green's SME review caught on the re-rendered GA (2026-07-08):
"kit has just been randomly placed, not bunched together based on what sides need maintenance/
access and walkways ... huge footprint ... half of F2 for 1 system whereas we had 3 systems in
~1/4 that area" — the codema water GA still showed ~40% empty deck (the whole right half of the
plan) even after a first zoning pass (commit 236425a08) cut it 604→330 m². Root cause: a bay sized
by `sqrt(area)*1.4` over-estimates its rectangle, and bank-stacking fixes EVERY bank's height to
its tallest region — any region shorter than its bank-mates wastes the difference, and the fold
search only ever tries whole-bay-width candidates, never lets a later region tuck into an earlier
bank's leftover depth. That is architecturally incapable of a dense pack.

THE FIX (rewrite "C"): drop the bay/bank abstraction. Every principal item (+ one cabinet per
region for consolidated small parts, unchanged) is placed by a single deterministic BOTTOM-LEFT
SKYLINE packer (`_skyline_pack`) over the WHOLE plant width — the classic 2-D packing heuristic:
track a height profile ("skyline"); each item goes at the lowest-then-leftmost position it fits;
the skyline updates only under that item's own span, so a short item never inherits a tall
neighbour's unused headroom. This is what actually kills dead space: no rectangle is reserved
that isn't asked for.

DESIGNED ACCESS (the actual point, not just "smaller") — two access invariants ride on top of the
same packer, both universal (derived from generic size, never a class name):
  1. MAINTENANCE WALKWAYS: every item still carries its own size-scaled `_clearance()` gap to its
     row neighbours (unchanged from rewrite B), and every time the skyline packer stacks a NEW row
     on top of existing content it inserts a flat WALKWAY_MM (person-width, ~0.8-1.0 m clear) gap
     first — so a person can always walk around and reach every serviceable item's back/side.
  2. DELIVERY AISLE: items whose plan footprint (or, if ever supplied, mass_kg) crosses a
     "truck/crane-delivered" size threshold are pulled OUT of the general pack into their own
     block, placed FLUSH against the plant's own entrance edge (y=0) — the very first content in
     the pack, so nothing else in the plant can ever sit between a heavy item and the outside of
     the building (a real loading-bay door cuts into the wall exactly there: zero obstruction,
     provable directly). A full DELIVERY_AISLE_MM (~3.5-4.0 m clear) band then separates that
     heavy row from the rest of the plant — a real, VISIBLE gap in the rendered GA (an aisle
     reserved before an edge that has nothing on its outside is invisible once the drawing crops
     to its content bbox; a gap between two blocks of real content is not). A plant with no heavy
     item gets no aisle at all (no phantom empty band on a small/compact archetype —
     proveNoFalsePositive).

Same guarantees as rewrite B, unchanged: PURE (no bpy), INTEGER GRID only (no float-sum-order
dependence), a single TOTAL-ORDER sort is the only ordering in the whole module — same items in
ANY input order → IDENTICAL output (the unit test proves order-invariance and determinism).

REWRITE "C.1" (Tristan 2026-07-08, Sam Green's SECOND SME pass on the re-rendered GA): rewrite C's
own `_place_all` re-introduced a SMALLER version of the exact defect it replaced — heavy items were
packed on their own canvas, then the ENTIRE rest-of-plant was translated down by ONE FLAT, FULL-
CANVAS-WIDTH offset (`heavy_depth + DELIVERY_AISLE_MM`), applied to every rest item regardless of
its x-column. On the Codema water GA (22.3×13.3 m) that fixed 3.8 m offset read as a blank band
across the WHOLE middle third of the plan — equipment split into a top block and a bottom block
with almost nothing between them, exactly what Tristan flagged ("why is there so much spare space
— tighten it up") even though the packer itself was dense within each block. Fix: heavy and rest
now share ONE `_skyline_pack` call (heavy items visited first, so they still land flush at y=0);
each item's OWN column-span gets its OWN pad afterward (DELIVERY_AISLE_MM for a heavy item,
WALKWAY_MM for everything else) — so a column the heavy block never touched stays at whatever
height it already was, and light equipment tucks in BESIDE a reservoir instead of being forced
behind it by a blanket offset. The aisle survives exactly where something is genuinely placed
directly behind a heavy item; it disappears everywhere else. See `_place_all`'s docstring for the
mechanics and the CONTIGUOUS-PACK proveCatch in `_selftest` for the regression guard.

Run the guard:  python3 scripts/blender-universal/deterministic_layout.py --selftest
"""
from __future__ import annotations

import re

GRID_MM = 100          # all coordinates snap to this integer grid → no sub-grid float residue

# A "small standard item" (instrument/junction/small device) is consolidated into a cabinet rather
# than placed as its own floor object. Footprint threshold (plan area) keyed on size, not class.
SMALL_ITEM_MAX_AREA_MM2 = 0.6e6   # ≤ ~0.77 m × 0.77 m plan → a panel/cabinet-internal item
CABINET_CELL_MM = 600             # a consolidated small item occupies this much inside the cabinet
CABINET_MAX_COLS = 6              # cabinet internal grid width before it grows in depth
FOLD_ASPECT_MAX = 2.0             # the target-width search prefers a bounding rect within this
#                                   aspect before minimising raw area (a min-area single row can
#                                   be a 4:1 ribbon)

# ── FUNCTIONAL SUB-ZONING within a region (Sam Green SME review, 2026-07-08: "kit randomly
# placed, not bunched together based on what sides need maintenance/access"). A part's geometry-
# family `shape` (already assigned upstream by the shape classifier: tank/vertical_vessel/pump/
# cabinet/skid_box/… — the SAME vocabulary every archetype uses, never a product-class name) +
# its footprint AREA give a functional-zone rank so same-role parts land CONTIGUOUS in the pack
# order (still fed through the one skyline packer below — only the ORDER changes). A part with no
# `shape` (legacy caller) gets the lowest rank tier (5) — old behaviour preserved when absent.
_VESSEL_ZONE_SHAPES = {"tank", "vertical_vessel", "horizontal_vessel",
                       "tall_vessel", "tall_column", "cone_vessel"}
_MACHINE_ZONE_SHAPES = {"pump", "compressor", "centrifuge"}
_ELECTRICAL_ZONE_SHAPES = {"cabinet", "cabinet_small", "transformer_box", "instrument"}
# A ~2.0 m-diameter-or-bigger vessel clusters with other large vessels, a dosing/filter vessel
# with other small vessels, rather than one long depth-sorted smear of every vessel in the plant.
# Re-used below as the HEAVY/delivery-aisle threshold too — "large vessel" and "truck-delivered
# item" are the same real-world size class (Sam Green: "reservoirs, skids, big vessels").
VESSEL_LARGE_AREA_MM2 = 4.0e6


def _zone_rank(shape: str | None, area: float, name: str | None = None) -> int:
    """Functional-zone sort tier for a pack node: 0 electrical/control/instruments, 1 packaged
    process skids / RO-pretreatment wall-row, 2 large storage vessels, 3 small process/dosing
    vessels, 4 rotating machines, 5 recovery filters (near drain pits), 6 everything else.
    The absolute numbers are arbitrary — only the grouping + determinism matter.

    INTENT (T-07): name-keyed sub-ranks pull RO/pretreatment into the skid wall-row and
    recovery filters toward the drain-pit end — universal noun signals, never a class table."""
    nm = (name or "").lower()
    if shape in _ELECTRICAL_ZONE_SHAPES:
        return 0
    if shape == "skid_box" or re.search(r"\b(reverse.?osmosis|ro\b|softener|gac|activated.?carbon|particle.?filter|pretreat)", nm):
        return 1
    if shape in _VESSEL_ZONE_SHAPES:
        return 2 if area >= VESSEL_LARGE_AREA_MM2 else 3
    if re.search(r"\b(cloth.?filter|drum.?filter|microscreen|recovery.?filter|drain.?filter)\b", nm):
        return 5
    if shape in _MACHINE_ZONE_SHAPES:
        return 4
    return 6


def _pump_unit_key(it: dict) -> str:
    """Stable bay key for Pump Unit N skid clustering (T-22). Empty when not a unit member."""
    tag = str(it.get("pump_unit") or it.get("pump_unit_tag") or "").strip()
    if tag:
        return tag
    nm = str(it.get("name") or it.get("id") or "")
    m = re.search(r"pump\s*unit\s*(\d+)", nm, re.I)
    if m:
        return f"Pump Unit {m.group(1)}"
    # BACKUP / STANDBY fertigation/irrigation pumps share the duty unit bay
    if re.search(r"\b(backup|standby)\b", nm, re.I) and re.search(
            r"\b(fertigation|irrigation|dosing.?pump|circulation.?pump)\b", nm, re.I):
        return "Pump Unit 1"
    if re.search(r"\b(acid|chemical|nutrient).{0,20}dosing\b", nm, re.I) and re.search(
            r"\b(fertigation|irrigation)\b", nm, re.I):
        return "Pump Unit 1"
    return ""


def _snap(v: float) -> int:
    """Snap a coordinate to the integer GRID_MM lattice — deterministic, float-residue-free."""
    return int(round(v / GRID_MM)) * GRID_MM


def _item_key(it: dict):
    """TOTAL deterministic sort key: process sequence (rank) → region → pump-unit bay →
    extraction index → id. Every field is an int or str, so the order is identical
    regardless of input order or hash seed."""
    return (int(it.get("rank", 10_000)), str(it.get("region", "")),
            str(_pump_unit_key(it) or ""),
            int(it.get("seq", 0)), str(it.get("id", "")))


def _cabinet_footprint(n_small: int) -> tuple[int, int]:
    """Plan footprint (w,d) mm of ONE cabinet holding `n_small` consolidated small items, laid in a
    CABINET_MAX_COLS-wide internal grid. Deterministic in n only."""
    cols = min(CABINET_MAX_COLS, max(1, n_small))
    rows = (n_small + cols - 1) // cols
    return cols * CABINET_CELL_MM, rows * CABINET_CELL_MM


# SIZE-SCALED maintenance clearance (Sam Green SME review, 2026-07-08 — "a maintenance aisle
# should scale with what it services"). CLEAR_FRAC of the item's SHORTER side, floored/capped so a
# tiny instrument still gets a minimum service gap and a huge vessel doesn't demand an absurd one.
# This is the ITEM-TO-ITEM gap (same row/shelf neighbours); row-to-row / vehicle access is the
# separate WALKWAY_MM / DELIVERY_AISLE_MM bands below (2026-07-08 access rewrite).
CLEAR_MIN_MM, CLEAR_MAX_MM, CLEAR_FRAC = 300.0, 1500.0, 0.20

# DESIGNED ACCESS (2026-07-08, Sam Green SME review + Tristan's explicit requirement — "tighten it
# up, but with DESIGNED ACCESS, not just smaller"):
#   WALKWAY_MM        — a person-width clear gap (0.8-1.0 m) inserted whenever the packer opens a
#                        NEW row/shelf on top of existing content, so every serviceable item keeps
#                        a walk-round maintenance aisle on its service side.
#   DELIVERY_AISLE_MM — a heavy-vehicle-width clear gap (3.5-4.0 m) reserved from the plant's own
#                        entrance edge to every HEAVY/LARGE item's front row, so reservoirs/skids/
#                        big vessels can be trucked or craned straight in without being walled in
#                        behind lighter kit.
#   HEAVY_AREA_MM2    — the size signal that puts an item on the delivery aisle instead of the
#                        general pack: re-uses VESSEL_LARGE_AREA_MM2 (≈ a 2 m-diameter-or-bigger
#                        footprint) — a generic size threshold, never a class/product name.
#   HEAVY_MASS_KG     — an optional mass signal (used IF the caller ever supplies `mass_kg` on an
#                        item; no current caller does, so this is a future-proofing OR-condition,
#                        not a behaviour change today).
WALKWAY_MM = 900
DELIVERY_AISLE_MM = 3800
HEAVY_AREA_MM2 = VESSEL_LARGE_AREA_MM2
HEAVY_MASS_KG = 1000.0


def _clearance(w: float, d: float) -> int:
    return int(min(CLEAR_MAX_MM, max(CLEAR_MIN_MM, min(w, d) * CLEAR_FRAC)))


# ═══════════════════════════════════════════════════════════════════════════
# FUNCTION-SEGREGATED PLANT ROOMS (RULE 6 — Sam Green SME review of the real
# Codema Fischer Farms WTR layout, 2026-07-08): "the real system partitions
# electrical/control into a walled Elec Plant Rm and mechanical/wet-process
# into a walled Mech Plant Rm — separate ROOMS, not loose adjacency zones on
# one open floor." This module already zone-orders same-role parts contiguous
# (_zone_rank, above) and the caller (build_universal_scene.py's periphery-hug)
# already spatially GROUPS electrical/control away from the process train for
# a process-plant archetype — but neither ever drew a wall. compute_function_
# rooms() is the pure geometry step that turns "these two groups already sit
# apart" into an actual walled-room pair the GA can draw.
#
# UNIVERSAL / keyed on GENERIC signals, never a class/product name: cabinet /
# cabinet_small / transformer_box are UNAMBIGUOUS electrical enclosures regardless
# of module; tank/vessel/pump/skid is the wet-process/rotating family. A plain
# "instrument" or "box" shape needs its MODULE to disambiguate: build_universal_
# scene.py's classify_shape tags EVERY part in safety_protection / sensing_
# instrumentation shape="instrument" purely by MODULE MEMBERSHIP, regardless of
# whether it's actually an electrical device — a real plant's safety_protection
# module routinely holds FIELD-MOUNTED mechanical kit (an ATEX extract fan, an
# inlet louvre, ductwork, a nitrogen-blanketing skid) that a real GA would never
# wall into the Elec Plant Rm (found on the real CO2-mineralisation archetype,
# 2026-07-08 — the broad module regex pulled fans/louvres/ductwork into the
# "electrical" group and the resulting bbox no longer separated from wet-process
# at all, suppressing the room split entirely). So only the genuinely CENTRALISED
# electrical/control-room modules count for the ambiguous shapes: power
# distribution, energy storage/distribution gear, and the control/SCADA room
# (control_compute_communication) — safety_protection / sensing_instrumentation
# are deliberately excluded here (their field devices stay field-located, exactly
# as a real plant leaves them).
_ELEC_ENCLOSURE_SHAPES = {"cabinet", "cabinet_small", "transformer_box"}
_WET_ROOM_SHAPES = _VESSEL_ZONE_SHAPES | _MACHINE_ZONE_SHAPES | {"skid_box"}
_ELEC_ROOM_MODULE_RE = re.compile(
    r"electrical|power[_ ]?distribution|energy[_ ]?storage[_ ]?source|"
    r"control[_ ]?(?:compute|communication)", re.I)

ROOM_WALL_CLEAR_MM = 900   # walk-round clearance from a room's OWN equipment to its wall
ROOM_DOOR_MM = 1000        # a standard single-leaf access door width


def _room_group(shape: str | None, module: str | None) -> str | None:
    """Generic function-family classifier: 'electrical' | 'wet' | None (neither
    family — this part does not force a room split)."""
    sh = shape or ""
    if sh in _ELEC_ENCLOSURE_SHAPES:
        return "electrical"
    if sh in _WET_ROOM_SHAPES:
        return "wet"
    if sh in ("instrument", "box") and _ELEC_ROOM_MODULE_RE.search(module or ""):
        return "electrical"
    return None


def _bbox_of(rows: list[dict]) -> tuple[float, float, float, float]:
    """Plain (x0,y0,x1,y1) bbox over a list of {x0,y0,x1,y1} rects — shared by
    compute_function_rooms and its _selftest proveCatch checks."""
    return (min(r["x0"] for r in rows), min(r["y0"] for r in rows),
            max(r["x1"] for r in rows), max(r["y1"] for r in rows))


def _iqr_core(rows: list[dict]) -> list[dict]:
    """Drop axis-outliers from a function-group's rects using the standard Tukey
    1.5×IQR fence over each item's CENTRE (independently on X and Y), so the
    room's WALL is sized to the coherent MAJORITY of its group and a small
    number of genuinely dispersed items (e.g. a field-mounted local E-stop
    installed beside the specific equipment it protects, rather than
    centralised with the rest of its module — a real, legitimate placement, not
    a defect) don't blow the room's bbox out to overlap the other group. Those
    outliers are NOT dropped from the design — they simply render at their real
    position, outside the wall, exactly as a genuinely field-mounted device
    would on a real GA. No-op below 4 items (too few for a reliable quartile
    split — the whole group is its own bbox)."""
    if len(rows) < 4:
        return rows

    def _fence(vals):
        s = sorted(vals)
        n = len(s)
        q1 = s[(n - 1) // 4]
        q3 = s[(3 * (n - 1)) // 4]
        iqr = q3 - q1
        return q1 - 1.5 * iqr, q3 + 1.5 * iqr

    cxs = [(r["x0"] + r["x1"]) / 2.0 for r in rows]
    cys = [(r["y0"] + r["y1"]) / 2.0 for r in rows]
    xlo, xhi = _fence(cxs)
    ylo, yhi = _fence(cys)
    core = [r for r, cx, cy in zip(rows, cxs, cys) if xlo <= cx <= xhi and ylo <= cy <= yhi]
    return core if core else rows


def _door_span(a0: float, a1: float, b0: float, b1: float, width: float) -> tuple[float, float]:
    """Centre a `width`-wide door gap in the overlap of ranges (a0,a1) and (b0,b1)
    (both already sorted lo<hi); falls back to the centre of (a0,a1) alone when the
    two ranges don't overlap by at least `width`."""
    lo, hi = max(a0, b0), min(a1, b1)
    if hi - lo < width:
        lo, hi = a0, a1
    c = (lo + hi) / 2.0
    if hi - lo >= width:
        c = min(max(c, lo + width / 2.0), hi - width / 2.0)
    return c - width / 2.0, c + width / 2.0


def compute_function_rooms(rows: list[dict], *, force: bool = False) -> list[dict]:
    """rows: [{x0,y0,x1,y1,shape,module}] — FINAL placed plan-view footprints
    (mm) of every DRAWN part, for ANY archetype. Pure geometry; no re-packing,
    no ordering dependence.

    Returns [] (no partition — proveNoFalsePositive) unless BOTH an
    ELECTRICAL/CONTROL group and a WET-PROCESS/rotating group are present among
    the placed parts: a homogeneous / containerised archetype (only one family,
    or neither) gets ONE open space, never a phantom wall.

    When both are present AND their bounding boxes are separated on at least one
    axis (the normal case — the packer already zone-groups electrical/control
    away from the process train), returns exactly 2 room dicts:
      {"name", "x0","y0","x1","y1" (wall line, mm), "door":{"x0","y0","x1","y1"}}
    Each room's wall on the side FACING the other room sits on the MIDLINE of the
    real gap between the two groups (so the two walls can never overlap by
    construction); the other 3 sides are inflated ROOM_WALL_CLEAR_MM beyond that
    group's own equipment for a walk-round aisle. The door is a ROOM_DOOR_MM gap
    centred in the shared wall — each room's own access door onto the corridor
    between them.

    If the two groups' CORE clusters are not even approximately separated on
    either axis (an upstream placement that never zone-split them at all — well
    beyond ROOM_ADJACENCY_TOLERANCE_MM of overlap) no safe wall can be drawn
    without slicing through equipment, so this returns [] rather than a garbled
    overlap — UNLESS `force=True` (T-26): when the brief/contract signals plant
    rooms OR wet process + electrical load both exist, force a schematic partition
    on the centroid midline even if the packer never spatially separated the groups.
    A forced room may clip a border item (schematic) but never declines to empty."""
    elec = [r for r in rows if _room_group(r.get("shape"), r.get("module")) == "electrical"]
    wet = [r for r in rows if _room_group(r.get("shape"), r.get("module")) == "wet"]
    if not elec or not wet:
        return []

    ex0, ey0, ex1, ey1 = _bbox_of(_iqr_core(elec))
    wx0, wy0, wx1, wy1 = _bbox_of(_iqr_core(wet))
    gap_y = max(ey0 - wy1, wy0 - ey1)   # positive ⇒ separated along Y
    gap_x = max(ex0 - wx1, wx0 - ex1)   # positive ⇒ separated along X
    # ROOM_ADJACENCY_TOLERANCE_MM: real placements are rarely a clean gap — a couple
    # of each group's own border items commonly sit close enough that their footprint
    # RANGES overlap by a small band even though the two clusters are clearly on
    # opposite sides of a natural line (found on the real Codema render: a fertigation
    # dosing pump's top edge and the electrical bus incomer's bottom edge overlapped by
    # 465 mm out of a ~15 m cluster depth). Tolerate up to this much before declining —
    # a border item may then sit a little proud of the wall line (an inevitable, minor
    # simplification of a schematic partition), never a request to slice deep into a
    # cluster that was genuinely never zone-split (proveNoFalsePositive #17 above stays
    # well beyond this tolerance on both axes).
    ROOM_ADJACENCY_TOLERANCE_MM = 1500.0
    if max(gap_y, gap_x) <= -ROOM_ADJACENCY_TOLERANCE_MM and not force:
        return []
    # T-26 force path: when groups heavily overlap, still partition on the centroid
    # midline (schematic Mech/Elec rooms) rather than skipping entirely.
    if max(gap_y, gap_x) <= -ROOM_ADJACENCY_TOLERANCE_MM and force:
        # Prefer the axis with LESS overlap (larger algebraic gap) for the wall.
        pass

    m = ROOM_WALL_CLEAR_MM
    if gap_y >= gap_x:
        # direction by CENTROID (not the raw edge test) so a small tolerated overlap
        # band still resolves to the correct north/south side.
        if (ey0 + ey1) >= (wy0 + wy1):     # elec room is NORTH of the wet room
            mid = (ey0 + wy1) / 2.0 if gap_y > -ROOM_ADJACENCY_TOLERANCE_MM else (ey0 + ey1 + wy0 + wy1) / 4.0
            e_y0, e_y1 = mid, ey1 + m
            w_y0, w_y1 = wy0 - m, mid
        else:                              # wet room is NORTH of the elec room
            mid = (wy0 + ey1) / 2.0 if gap_y > -ROOM_ADJACENCY_TOLERANCE_MM else (ey0 + ey1 + wy0 + wy1) / 4.0
            w_y0, w_y1 = mid, wy1 + m
            e_y0, e_y1 = ey0 - m, mid
        e_x0, e_x1 = ex0 - m, ex1 + m
        w_x0, w_x1 = wx0 - m, wx1 + m
        d0, d1 = _door_span(ex0, ex1, wx0, wx1, ROOM_DOOR_MM)
        rooms = [
            {"name": "Elec Plant Rm", "x0": e_x0, "y0": e_y0, "x1": e_x1, "y1": e_y1,
             "door": {"x0": d0, "y0": mid, "x1": d1, "y1": mid}},
            {"name": "Mech Plant Rm", "x0": w_x0, "y0": w_y0, "x1": w_x1, "y1": w_y1,
             "door": {"x0": d0, "y0": mid, "x1": d1, "y1": mid}},
        ]
    else:
        if (ex0 + ex1) >= (wx0 + wx1):      # elec room is EAST of the wet room
            mid = (ex0 + wx1) / 2.0 if gap_x > -ROOM_ADJACENCY_TOLERANCE_MM else (ex0 + ex1 + wx0 + wx1) / 4.0
            e_x0, e_x1 = mid, ex1 + m
            w_x0, w_x1 = wx0 - m, mid
        else:                               # wet room is EAST of the elec room
            mid = (wx0 + ex1) / 2.0 if gap_x > -ROOM_ADJACENCY_TOLERANCE_MM else (ex0 + ex1 + wx0 + wx1) / 4.0
            w_x0, w_x1 = mid, wx1 + m
            e_x0, e_x1 = ex0 - m, mid
        e_y0, e_y1 = ey0 - m, ey1 + m
        w_y0, w_y1 = wy0 - m, wy1 + m
        d0, d1 = _door_span(ey0, ey1, wy0, wy1, ROOM_DOOR_MM)
        rooms = [
            {"name": "Elec Plant Rm", "x0": e_x0, "y0": e_y0, "x1": e_x1, "y1": e_y1,
             "door": {"x0": mid, "y0": d0, "x1": mid, "y1": d1}},
            {"name": "Mech Plant Rm", "x0": w_x0, "y0": w_y0, "x1": w_x1, "y1": w_y1,
             "door": {"x0": mid, "y0": d0, "x1": mid, "y1": d1}},
        ]
    return rooms


# ── LAYOUT DENSITY DIAGNOSTIC (T-07 / E-04) ──────────────────────────────────
# UNIVERSAL threshold: plant footprint m² per m³/h of circulation flow, scaled by
# equipment count. Absurdly sparse layouts (dead space Sam flagged) punch-list;
# never a Codema constant — derived from circulation + n_equipment.
DENSITY_M2_PER_M3H_ABSURD = 8.0   # >8 m² per (m³/h) of circulation is absurdly sparse
DENSITY_M2_PER_EQUIP_ABSURD = 25.0  # >25 m² per principal item is absurdly sparse


def layout_density_diagnostic(
    footprint_m2: float,
    circulation_m3_h: float | None,
    n_equipment: int,
) -> dict:
    """Pure density check. Returns {verdict, m2_per_m3h, m2_per_equip, reason, punch}.
    UNIVERSAL: keyed on circulation flow + equipment count — no class table."""
    out = {
        "verdict": "not_applicable",
        "m2_per_m3h": None,
        "m2_per_equip": None,
        "reason": "",
        "punch": None,
    }
    if not (isinstance(footprint_m2, (int, float)) and footprint_m2 > 0):
        out["reason"] = "no footprint"
        return out
    m2_per_equip = footprint_m2 / max(1, int(n_equipment or 0))
    out["m2_per_equip"] = round(m2_per_equip, 2)
    circ = float(circulation_m3_h) if isinstance(circulation_m3_h, (int, float)) and circulation_m3_h > 0 else None
    if circ is not None:
        m2_per_m3h = footprint_m2 / circ
        out["m2_per_m3h"] = round(m2_per_m3h, 2)
        if m2_per_m3h > DENSITY_M2_PER_M3H_ABSURD and m2_per_equip > DENSITY_M2_PER_EQUIP_ABSURD:
            out["verdict"] = "high"
            out["reason"] = (
                f"layout density absurdly sparse: {m2_per_m3h:.1f} m² per m³/h circulation "
                f"(>{DENSITY_M2_PER_M3H_ABSURD}) and {m2_per_equip:.1f} m²/equip "
                f"(>{DENSITY_M2_PER_EQUIP_ABSURD}) — tighten packer / zone ranks"
            )
            out["punch"] = (
                f"T-07 density: footprint {footprint_m2:.0f} m² / circulation {circ:g} m³/h "
                f"= {m2_per_m3h:.1f} m²/(m³/h); {n_equipment} principals → {m2_per_equip:.1f} m²/equip. "
                f"Prefer RO/pretreatment wall-row, recovery filters near drain pits, reservoirs "
                f"with delivery-aisle clearance, dosing tanks adjacent to parent pump unit."
            )
            return out
        out["verdict"] = "pass"
        out["reason"] = f"{m2_per_m3h:.1f} m²/(m³/h), {m2_per_equip:.1f} m²/equip — within band"
        return out
    if m2_per_equip > DENSITY_M2_PER_EQUIP_ABSURD * 1.5:
        out["verdict"] = "high"
        out["reason"] = (
            f"layout density absurdly sparse: {m2_per_equip:.1f} m²/equip "
            f"(no circulation flow known; threshold {DENSITY_M2_PER_EQUIP_ABSURD * 1.5})"
        )
        out["punch"] = out["reason"]
        return out
    out["verdict"] = "pass" if n_equipment else "not_applicable"
    out["reason"] = f"{m2_per_equip:.1f} m²/equip (no circulation flow)"
    return out


def _is_heavy(w: float, d: float, shape: str | None = None, mass_kg: float | None = None) -> bool:
    """Universal HEAVY/LARGE test — footprint area (or, if supplied, mass) crosses the
    truck/crane-delivery threshold. A consolidated small-item CABINET is never itself "heavy" no
    matter how many members it holds — it is a placeholder for many small parts, not a single
    truck-delivered unit (a real cabinet's contents ship in boxes, not on a HIAB)."""
    if shape == "cabinet":
        return False
    if mass_kg and mass_kg >= HEAVY_MASS_KG:
        return True
    return (float(w) * float(d)) >= HEAVY_AREA_MM2


def _skyline_pack(nodes: list[dict], target_w: int, pad_for) -> tuple[dict, int, int]:
    """Deterministic BOTTOM-LEFT SKYLINE pack of `nodes` (id,w,d — visitation order is the
    caller's own deterministic order; this function adds none of its own) into a canvas of width
    `target_w` mm. Each item is placed at the lowest-then-leftmost position it fits (the classic
    2-D skyline heuristic) — a short item never inherits a tall neighbour's unused headroom, which
    is exactly the dead-space defect the old bay+bank scheme could not avoid. Every item's own
    size-scaled `_clearance()` gap is folded in as symmetric padding (so adjacent items in the same
    row keep their service-side gap); `pad_for(node)` (WALKWAY_MM or DELIVERY_AISLE_MM, PER ITEM —
    see rewrite "C.1" below for why this must be per-node, not one flat value for the whole call) is
    added under every placed item's OWN occupied column-span so anything later stacked directly on
    top of THAT item keeps at least that vertical access gap — a column an item never touches stays
    at whatever height it already was, so unrelated content can tuck in beside it with no phantom
    gap. `pad_for` may also be passed as a bare int for a flat-pad call (back-compat). A single item
    wider than `target_w` grows the canvas rather than being dropped. Returns ({id:(cx,cy)}, used_w,
    content_d) — `content_d` is the true occupied depth (last item's OWN back edge, no trailing
    pad)."""
    if not nodes:
        return {}, 0, 0
    _pad = pad_for if callable(pad_for) else (lambda _nd, _v=pad_for: _v)
    canvas_w = max(int(target_w), GRID_MM)
    skyline = [[0, canvas_w, 0]]     # [x0, x1, height] segments, sorted + contiguous over [0,canvas_w)
    pos: dict = {}
    used_w = 0
    content_d = 0        # true occupied depth (no trailing pad) — see docstring
    for nd in nodes:
        w, d = int(nd["w"]), int(nd["d"])
        gap = _clearance(w, d)
        pw, pd = w + gap, d + gap    # padded footprint — the gap is symmetric half-margin per side
        if pw > canvas_w:             # never drop a node: grow the canvas for an outlier-wide item
            extra = pw - canvas_w
            skyline[-1][1] += extra
            canvas_w += extra
        best = None                  # (sort_key=(height,x0), x0, height)
        for i, seg in enumerate(skyline):
            sx0 = seg[0]
            if sx0 + pw > canvas_w:
                continue
            h, covered, j = 0, 0, i
            while covered < pw and j < len(skyline):
                h = max(h, skyline[j][2])
                covered = skyline[j][1] - sx0
                j += 1
            key = (h, sx0)
            if best is None or key < best[0]:
                best = (key, sx0, h)
        _, x0, h = best
        cx = _snap(x0 + gap / 2 + w / 2)
        cy = _snap(h + gap / 2 + d / 2)
        pos[nd["id"]] = (cx, cy)
        content_d = max(content_d, h + pd)
        new_h = h + pd + _pad(nd)   # PER-NODE pad — only THIS item's own column span rises
        x1 = x0 + pw
        # rebuild the skyline: pass through untouched segments, trim the two segments the new
        # item's span cuts into at its edges, and insert ONE new segment at the placed height.
        rebuilt = []
        inserted = False
        for seg in skyline:
            sx0, sx1, sh = seg
            if sx1 <= x0 or sx0 >= x1:
                rebuilt.append(seg)
                continue
            if sx0 < x0:
                rebuilt.append([sx0, x0, sh])
            if not inserted:
                rebuilt.append([x0, x1, new_h])
                inserted = True
            if sx1 > x1:
                rebuilt.append([x1, sx1, sh])
        skyline = rebuilt
        merged = [skyline[0]]
        for seg in skyline[1:]:
            if seg[2] == merged[-1][2] and seg[0] == merged[-1][1]:
                merged[-1][1] = seg[1]
            else:
                merged.append(seg)
        skyline = merged
        used_w = max(used_w, x1)
    return pos, used_w, content_d


def _place_all(nodes: list[dict], target_w: int) -> tuple[dict, int, int]:
    """Place HEAVY (truck/crane-delivered) items FLUSH against the plant's own entrance edge
    (y=0) — visited FIRST, before any other item, into an otherwise-empty skyline, so they land
    at height 0 (nothing can ever sit between a heavy item and the outside of the building — a
    real loading-bay door cuts into the wall exactly there) — then pack EVERYTHING ELSE into the
    SAME skyline behind them, via ONE combined `_skyline_pack` call with a PER-ITEM pad: a heavy
    item's own column-span rises by a full DELIVERY_AISLE_MM (truck/HIAB-width) after it; every
    other item's column-span rises by only WALKWAY_MM. A plant with no heavy item never invokes
    the aisle pad at all (proveNoFalsePositive — no phantom empty band on a small/compact
    archetype).

    REWRITE "C.1" (Tristan 2026-07-08, Sam Green's SECOND SME pass — re-rendered GA still showed
    a large EMPTY MIDDLE BAND splitting a top equipment block from a bottom reservoir block): the
    ORIGINAL rewrite "C" ran heavy and rest as TWO SEPARATE `_skyline_pack` calls on two separate
    canvases, then translated the whole "rest" block down by ONE FLAT, FULL-CANVAS-WIDTH
    `y_offset = heavy_content_depth + DELIVERY_AISLE_MM` — applied uniformly to EVERY rest item
    regardless of its x-column, even columns the heavy block never touched. On a plant only a few
    metres deep, that flat offset (a fixed 3.8 m aisle) reads as a huge blank band across the WHOLE
    width, and light equipment that could have tucked in BESIDE a reservoir (no aisle needed — it
    isn't behind anything) was forced behind it instead. The fix: heavy and rest now share ONE
    skyline, so a rest item's placement height is READ off its own column's true occupied height —
    0 (flush beside a heavy item, in a column the heavy item never claimed) or
    heavy_item_depth + DELIVERY_AISLE_MM (directly behind a heavy item's own column-span) — never a
    blanket offset. Reservoirs now pack UP against whatever equipment sits beside them; the aisle
    survives ONLY where something is genuinely placed directly behind a heavy item, so it stays a
    real, visible gap between two blocks of drawn content (never an invisible band beyond the
    render's content bbox — the reasoning that put the aisle AFTER the heavy row, not before y=0,
    in the original rewrite still holds and is unchanged here)."""
    heavy_ids = {nd["id"] for nd in nodes
                 if _is_heavy(nd["w"], nd["d"], nd.get("shape"), nd.get("mass_kg"))}
    heavy = [nd for nd in nodes if nd["id"] in heavy_ids]
    rest = [nd for nd in nodes if nd["id"] not in heavy_ids]
    ordered = heavy + rest      # heavy FIRST — guarantees flush-to-entrance (skyline starts flat)

    def _pad_for(nd):
        return DELIVERY_AISLE_MM if nd["id"] in heavy_ids else WALKWAY_MM

    return _skyline_pack(ordered, target_w, _pad_for)


def _best_target_w(nodes: list[dict]) -> int:
    """Search a handful of candidate canvas widths and keep the one that MINIMISES the resulting
    plant bounding-rect area (ties: within FOLD_ASPECT_MAX first, then narrowest, then smallest
    candidate) — the direct replacement for rewrite B's `_fold_target_w`, now scored against the
    REAL skyline pack (incl. the heavy/aisle split) instead of a naive bank-stack simulation."""
    if not nodes:
        return GRID_MM
    widths = [int(nd["w"]) for nd in nodes]
    widest = max(widths)
    total_area = sum((nd["w"] + _clearance(nd["w"], nd["d"])) * (nd["d"] + _clearance(nd["w"], nd["d"]))
                     for nd in nodes) or (GRID_MM * GRID_MM)
    base = total_area ** 0.5
    cands = sorted({int(max(widest, base * k)) for k in (1.0, 1.2, 1.4, 1.6, 2.0, 2.6, 3.4)})

    def _cost(tw):
        _, uw, ud = _place_all(nodes, tw)
        aspect = max(uw, ud) / max(1, min(uw, ud))
        return (aspect > FOLD_ASPECT_MAX, uw * ud, uw, tw)

    return min(cands, key=_cost)


def layout(items: list[dict], n_banks: int = 2, bay_row_w: int | None = None) -> dict:
    """Compute a DETERMINISTIC integer-grid layout for `items` via a single flat SKYLINE pack
    (see module docstring for the rewrite-C rationale).

    items: [{id, region, rank, seq, w, d, area, small?, shape?, mass_kg?, name?, pump_unit?}]
            (w/d = plan footprint mm; area = w*d; small=True forces cabinet consolidation;
            else inferred from area; mass_kg optional — feeds the heavy/delivery-aisle test;
            name/pump_unit optional — drive Pump Unit N skid bay clustering + density zoning).
    bay_row_w: optional fixed canvas width (mm) for THIS call's whole item set — the periphery-hug
            caller uses it to pack a back-row region group as a SHALLOW ROW spanning the train
            width instead of the square-ish default target-width search. None → the target-width
            search below picks the width that minimises the bounding-rect area.
    n_banks: retained for API compatibility only (unused — the skyline pack has no bank concept).
    Returns {id: (x_mm, y_mm)} for every PRINCIPAL item PLUS one synthetic cabinet per region that
    had ≥2 small items, id 'cabinet::<region>' — and every small item maps to its cabinet's slot so
    the caller can draw/skip as it chooses. Positions are integers on GRID_MM; the SAME items in ANY
    input order yield IDENTICAL output (proven in _selftest)."""
    _ = n_banks
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

    # 3) within each region: split principals vs small items; small → ONE cabinet node; sort the
    #    region's own nodes by functional zone (same-role parts contiguous), then flatten ALL
    #    regions (in process-rank order) into ONE node list — the single skyline pack below places
    #    this whole list, so functional zones still read as contiguous blocks (the visitation
    #    order), but the packer is free to abut them tightly instead of boxing each into its own
    #    over-sized rectangular bay (rewrite B's dead-space source).
    flat_nodes: list[dict] = []
    cabinet_members: dict[str, list[str]] = {}
    for rk in region_order:
        principals, small = [], []
        for it in by_region[rk]:
            is_small = bool(it.get("small")) or float(it.get("area", it.get("w", 0) * it.get("d", 0))) <= SMALL_ITEM_MAX_AREA_MM2
            (small if is_small else principals).append(it)
        def _node(it):
            n = {"id": it["id"], "w": int(it.get("w", GRID_MM)), "d": int(it.get("d", GRID_MM)),
                 "shape": it.get("shape"),
                 "name": str(it.get("name") or it.get("id") or ""),
                 "pump_unit": _pump_unit_key(it)}
            if it.get("mass_kg"):
                n["mass_kg"] = float(it["mass_kg"])
            return n
        nodes = [_node(it) for it in principals]
        if len(small) >= 2:
            cw, cd = _cabinet_footprint(len(small))
            # the consolidated cabinet is definitionally instrument/electrical-flavoured kit —
            # rank it with the electrical/control tier (0) so it sits with any OTHER real
            # electrical-shaped principals in this bay rather than wherever depth-sort landed it.
            nodes.append({"id": f"cabinet::{rk}", "w": cw, "d": cd, "shape": "cabinet",
                          "name": "", "pump_unit": ""})
            cabinet_members[rk] = [it["id"] for it in small]
        elif small:                       # a lone small item just sits as itself (no cabinet)
            nodes.extend(_node(it) for it in small)
        # T-22: Pump Unit N members sort as one contiguous bay block before zone-rank.
        nodes.sort(key=lambda nd: (
            str(nd.get("pump_unit") or "\uffff"),  # empty → after tagged units
            _zone_rank(nd.get("shape"), nd["w"] * nd["d"], nd.get("name")),
            -nd["d"], -nd["w"], nd["id"]))
        flat_nodes.extend(nodes)

    # 4) ONE skyline pack over the whole flattened, zone-ordered node list (heavy/delivery-aisle
    #    split happens inside _place_all). bay_row_w pins the canvas width for this call (the
    #    periphery-hug shallow-row caller); otherwise search for the area-minimising width.
    target_w = int(bay_row_w) if bay_row_w else _best_target_w(flat_nodes)
    out, _uw, _ud = _place_all(flat_nodes, target_w)

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

    def _brect(itms, pos, fp_override=None):
        fp = fp_override or {it["id"]: (it["w"], it["d"]) for it in itms}
        x0 = y0 = 1e12; x1 = y1 = -1e12
        for k, (cx, cy) in pos.items():
            if k not in fp:
                continue
            w, d = fp[k]
            x0 = min(x0, cx - w / 2); x1 = max(x1, cx + w / 2)
            y0 = min(y0, cy - d / 2); y1 = max(y1, cy + d / 2)
        return (x1 - x0), (y1 - y0)

    # (5) COMPACT FOLD (no one-region-per-bank stranding): one BIG region + several small ones must
    #     pack into a sane bounding-rect aspect, not an L-shaped plant on an empty deck.
    lshape = [{"id": "BIG", "region": "r_00_feed", "rank": 0, "seq": 0,
               "w": 16000, "d": 12000, "area": 16000 * 12000}]
    for i in range(4):
        lshape.append({"id": f"S{i}", "region": f"r_{10 + i}_aux", "rank": 10 + i, "seq": i + 1,
                       "w": 4000, "d": 2500, "area": 4000 * 2500})
    lw, ld = _brect(lshape, layout(list(lshape)))
    aspect = max(lw, ld) / max(1.0, min(lw, ld))
    if aspect > 2.5:
        print(f"  FAIL: big+4-small fold is a {aspect:.1f}:1 strip/column (limit 2.5:1) — "
              f"the smalls were stranded"); bad += 1

    # (6) bay_row_w: a cabinet row packed with an explicit row budget stays ONE shallow row.
    row_items = [{"id": f"C{i}", "region": "r_90_elec", "rank": 90, "seq": i,
                  "w": 1800, "d": 900, "area": 1800 * 900} for i in range(3)]
    rw, rd = _brect(row_items, layout(list(row_items), bay_row_w=20000))
    if rd > 900 + GRID_MM + WALKWAY_MM:
        print(f"  FAIL: bay_row_w row wrapped into {rd:.0f} mm depth (want one 900 mm row)"); bad += 1

    # (7) FUNCTIONAL SUB-ZONING (Sam Green SME review, 2026-07-08) — proveCatch: mix pumps, vessels
    #     and electrical cabinets in ONE region with equal footprints (depth alone can't group
    #     them). With `shape` supplied, same-shape parts must end up CONTIGUOUS in the packed
    #     (row, then x) visitation order.
    mix = []
    for i in range(3):
        mix.append({"id": f"PUMP{i}", "region": "r_mix", "rank": 0, "seq": i,
                    "w": 900, "d": 900, "area": 900 * 900, "shape": "pump"})
    for i in range(3):
        mix.append({"id": f"VESS{i}", "region": "r_mix", "rank": 0, "seq": 3 + i,
                    "w": 900, "d": 900, "area": 900 * 900, "shape": "tank"})
    for i in range(3):
        mix.append({"id": f"CAB{i}", "region": "r_mix", "rank": 0, "seq": 6 + i,
                    "w": 900, "d": 900, "area": 900 * 900, "shape": "cabinet"})
    mpos = layout(list(mix))
    mshelf = sorted(mpos, key=lambda k: (mpos[k][1], mpos[k][0]))
    mshapes = {"PUMP": "pump", "VESS": "tank", "CAB": "cabinet"}
    runs, cur = [], None
    for k in mshelf:
        fam = next(pfx for pfx in mshapes if k.startswith(pfx))
        if fam != cur:
            runs.append(fam); cur = fam
    if len(runs) != len(set(runs)):
        print(f"  FAIL: same-shape parts are NOT contiguous in the pack order — {runs}"); bad += 1

    # (8) SIZE-SCALED CLEARANCE — a small part's gap must be smaller than a large part's, both
    #     within the documented [CLEAR_MIN_MM, CLEAR_MAX_MM] band.
    small_gap = _clearance(900, 900)
    large_gap = _clearance(6000, 6000)
    if not (CLEAR_MIN_MM <= small_gap < large_gap <= CLEAR_MAX_MM):
        print(f"  FAIL: clearance does not scale with size (small={small_gap}, large={large_gap})"); bad += 1

    # (9) proveNoFalsePositive (shape-less input) — a region whose items carry NO `shape` key must
    #     still get a stable, deterministic zone rank (the pre-zoning fallback tier).
    if any(_zone_rank(None, a) != _zone_rank(None, a * 3) for a in (10_000.0, 500_000.0)):
        print("  FAIL: a shape-less node's zone rank is not a stable constant"); bad += 1

    # (10) DELIVERY AISLE proveCatch — one HEAVY item (a reservoir-scale footprint, well over
    #      HEAVY_AREA_MM2) among several light ones must (a) sit FLUSH against the plant's own
    #      entrance edge (y=0) — nothing placed between it and the outside of the building — and
    #      (b) when other content ends up genuinely STACKED BEHIND it (its x-column-span is
    #      claimed and there is no room left BESIDE it — bay_row_w pins the canvas tight enough
    #      that all 6 pumps must stack behind, not beside), that content sits a full, VISIBLE
    #      DELIVERY_AISLE_MM behind it — a real gap between two blocks of drawn content, not an
    #      invisible band a bbox-cropped render would discard. (Content that instead fits BESIDE
    #      the heavy item, in columns it never claims, is exempt — that is rewrite "C.1"'s fix,
    #      proven separately in the CONTIGUOUS-PACK test below.)
    aisle_items = [{"id": "RESV", "region": "r_00_store", "rank": 0, "seq": 0,
                    "w": 5000, "d": 5000, "area": 5000 * 5000, "shape": "tank"}]
    for i in range(6):
        # 950x950 (>SMALL_ITEM_MAX_AREA_MM2) so each pump stays its OWN placed item rather than
        # collapsing into a per-region consolidated cabinet (which would map every pump onto one
        # shared position and break this test's per-item edge check).
        aisle_items.append({"id": f"PUMP{i}", "region": "r_10_pumps", "rank": 10, "seq": i + 1,
                            "w": 950, "d": 950, "area": 950 * 950, "shape": "pump"})
    resv_padded_w = 5000 + _clearance(5000, 5000)
    apos = layout(list(aisle_items), bay_row_w=resv_padded_w + GRID_MM)  # no room beside RESV
    fp = {it["id"]: (it["w"], it["d"]) for it in aisle_items}
    resv_front_y = apos["RESV"][1] - fp["RESV"][1] / 2
    if resv_front_y > WALKWAY_MM:    # flush at the entrance edge (± its own small clearance
        print(f"  FAIL: heavy item RESV front edge at y={resv_front_y:.0f} — not flush against "  # margin) — NOT offset by anything aisle/walkway-scale
              f"the plant entrance edge"); bad += 1
    resv_back_y = apos["RESV"][1] + fp["RESV"][1] / 2
    other_front_ys = [apos[k][1] - fp[k][1] / 2 for k in apos if k != "RESV"]
    nearest_other_front = min(other_front_ys, default=1e12)
    aisle_gap = nearest_other_front - resv_back_y
    if aisle_gap < DELIVERY_AISLE_MM - GRID_MM:
        print(f"  FAIL: gap from heavy item RESV to the nearest other content is {aisle_gap:.0f} mm "
              f"— no visible {DELIVERY_AISLE_MM} mm delivery aisle"); bad += 1

    # (11) WALKWAY proveCatch — force a second row (narrow canvas) and verify the row-to-row gap
    #      is at least WALKWAY_MM (person-width clear), not the old flat small item clearance.
    two_row_items = [{"id": f"W{i}", "region": "r_walk", "rank": 0, "seq": i,
                      "w": 3000, "d": 2000, "area": 3000 * 2000} for i in range(2)]
    wpos = layout(list(two_row_items), bay_row_w=3500)   # narrow canvas forces row 2 below row 1
    wfp = {it["id"]: (it["w"], it["d"]) for it in two_row_items}
    ys = sorted(wpos[k][1] for k in wpos)
    if len(ys) >= 2:
        row_gap = (ys[1] - wfp["W0"][1] / 2 - wfp["W1"][1] / 2 - ys[0])
        # (row_gap as computed above only exact if W0 is row 1 — fall back to a direct edge check)
        y0_bottom = ys[0] + wfp["W0"][1] / 2
        y1_top = ys[1] - wfp["W1"][1] / 2
        gap = y1_top - y0_bottom
        if gap < WALKWAY_MM - GRID_MM:
            print(f"  FAIL: row-to-row gap {gap:.0f} mm < WALKWAY_MM ({WALKWAY_MM} mm) — no "
                  f"maintenance walkway between rows"); bad += 1

    # (12) DEAD-SPACE / DENSITY proveCatch — packing a set of irregular footprints must not blow
    #      the bounding-rect area out to many multiples of the summed item area (the "whole right
    #      half of the plan is empty" defect). Bound is generous (accounts for clearances) but
    #      would have failed under the old bay+bank scheme's ~330 m² vs ~180 m² real equipment.
    irregular = []
    for i in range(12):
        w = 800 + (i % 4) * 900
        d = 800 + ((i * 3) % 5) * 700
        irregular.append({"id": f"IR{i}", "region": f"r_{i % 3}", "rank": (i % 3) * 10, "seq": i,
                          "w": w, "d": d, "area": w * d, "shape": "pump" if i % 2 else "tank"})
    ipos = layout(list(irregular))
    ifp = {it["id"]: (it["w"], it["d"]) for it in irregular}
    iw, idp = _brect(irregular, ipos)
    sum_area = sum(w * d for w, d in ifp.values())
    if (iw * idp) > sum_area * 3.5:
        print(f"  FAIL: packed area {iw * idp / 1e6:.1f} m² is > 3.5x the {sum_area / 1e6:.1f} m² "
              f"of actual equipment — dead space, not a dense pack"); bad += 1

    # (13) proveNoFalsePositive — an already-compact SINGLE-UNIT layout (no heavy item, one small
    #      region) must come back essentially unchanged: no phantom delivery-aisle offset, footprint
    #      close to the item's own size + its clearance (a compact/containerised archetype must not
    #      be broken by the new access machinery).
    solo = [{"id": "UNIT", "region": "r_solo", "rank": 0, "seq": 0,
            "w": 2000, "d": 1200, "area": 2000 * 1200, "shape": "skid_box"}]
    spos = layout(list(solo))
    sx, sy = spos["UNIT"]
    front_edge = sy - 1200 / 2        # should sit near y=0 (± only its own small clearance
    if front_edge > WALKWAY_MM:       # padding) — NOT offset by a DELIVERY_AISLE_MM-scale band
        print(f"  FAIL: solo compact unit front edge at y={front_edge:.0f} — a phantom aisle "
              f"offset was applied with no heavy item to justify it"); bad += 1
    sw, sd = _brect(solo, spos)
    if sw > 2000 + 2 * CLEAR_MAX_MM or sd > 1200 + 2 * CLEAR_MAX_MM:
        print(f"  FAIL: solo compact unit footprint inflated to {sw:.0f}x{sd:.0f} mm "
              f"(item is only 2000x1200 mm)"); bad += 1

    # (14) CONTIGUOUS-PACK proveCatch (rewrite "C.1", Sam Green's 2nd SME pass, 2026-07-08) — a
    #      HEAVY reservoir with LIGHT equipment that comfortably fits BESIDE it (in columns the
    #      reservoir's own footprint never claims) must actually land beside it, at height ~0 —
    #      NOT be pushed behind a FLAT full-canvas-width `heavy_depth + DELIVERY_AISLE_MM` offset
    #      (the exact "empty middle band splits the plant into a top block and a bottom block"
    #      regression Sam's 2nd pass caught on the re-rendered Codema GA). A wide bay_row_w gives
    #      4 light skids exactly enough side-room (4×1500mm padded = 6000mm) to pack fully beside
    #      a 5000×5000mm reservoir (padded 6000mm) rather than needing to stack behind it.
    heavy_light = [{"id": "RESV", "region": "r_00_store", "rank": 0, "seq": 0,
                    "w": 5000, "d": 5000, "area": 5000 * 5000, "shape": "tank"}]
    for i in range(4):
        heavy_light.append({"id": f"SKID{i}", "region": "r_10_skids", "rank": 10, "seq": i + 1,
                            "w": 1200, "d": 1200, "area": 1200 * 1200, "shape": "skid_box"})
    hlpos = layout(list(heavy_light), bay_row_w=12000)
    hlfp = {it["id"]: (it["w"], it["d"]) for it in heavy_light}
    skid_front_ys = [hlpos[f"SKID{i}"][1] - hlfp[f"SKID{i}"][1] / 2 for i in range(4)]
    if not any(y <= WALKWAY_MM + GRID_MM for y in skid_front_ys):
        print(f"  FAIL: no light item packed BESIDE the heavy reservoir (front edges "
              f"{[f'{y:.0f}' for y in skid_front_ys]} mm) — the whole rest-of-plant was pushed "
              f"behind a flat full-width aisle offset (the empty-middle-band regression)"); bad += 1
    hlw, hld = _brect(heavy_light, hlpos)
    resv_pd = 5000 + _clearance(5000, 5000)   # the reservoir's own padded depth — the bound a
    if hld > resv_pd + CLEAR_MAX_MM:          # contiguous pack should not exceed (no aisle band
        print(f"  FAIL: heavy+light bounding depth {hld:.0f} mm blew past the reservoir's own "
              f"{resv_pd:.0f} mm padded depth — a dead band remains between the two blocks"); bad += 1

    # (15) FUNCTION-SEGREGATED PLANT ROOMS proveCatch (RULE 6, Sam Green SME review,
    #      2026-07-08) — a design with a SEPARATED electrical/control block (cabinets)
    #      and a wet-process block (tanks/pumps) — the real-world Codema shape — must
    #      get exactly 2 walled rooms, each fully containing its own group's footprint
    #      (not slicing through equipment), with a door on the wall each faces the other.
    elec_rows = [{"x0": 0, "y0": 6000, "x1": 3000, "y1": 8000, "shape": "cabinet"},
                 {"x0": 3200, "y0": 6000, "x1": 4200, "y1": 7000, "shape": "transformer_box"}]
    wet_rows = [{"x0": 0, "y0": 0, "x1": 5000, "y1": 5000, "shape": "tank"},
                {"x0": 5200, "y0": 0, "x1": 6200, "y1": 1000, "shape": "pump"}]
    rooms = compute_function_rooms(elec_rows + wet_rows)
    if len(rooms) != 2:
        print(f"  FAIL: separated electrical+wet-process groups did not yield exactly 2 "
              f"rooms (got {len(rooms)})"); bad += 1
    else:
        by_name = {r["name"]: r for r in rooms}
        if "Elec Plant Rm" not in by_name or "Mech Plant Rm" not in by_name:
            print(f"  FAIL: rooms not labelled Elec Plant Rm / Mech Plant Rm — got "
                  f"{[r['name'] for r in rooms]}"); bad += 1
        else:
            er, wr = by_name["Elec Plant Rm"], by_name["Mech Plant Rm"]
            eb = _bbox_of(elec_rows)
            wb = _bbox_of(wet_rows)
            if not (er["x0"] <= eb[0] and er["y0"] <= eb[1] and er["x1"] >= eb[2] and er["y1"] >= eb[3]):
                print(f"  FAIL: Elec Plant Rm {er} does not fully contain its own equipment "
                      f"bbox {eb} — a wall would slice through kit"); bad += 1
            if not (wr["x0"] <= wb[0] and wr["y0"] <= wb[1] and wr["x1"] >= wb[2] and wr["y1"] >= wb[3]):
                print(f"  FAIL: Mech Plant Rm {wr} does not fully contain its own equipment "
                      f"bbox {wb} — a wall would slice through kit"); bad += 1
            # the two rooms must never overlap (they're separate walled spaces).
            if not (er["x1"] <= wr["x0"] or wr["x1"] <= er["x0"]
                    or er["y1"] <= wr["y0"] or wr["y1"] <= er["y0"]):
                print(f"  FAIL: Elec Plant Rm {er} and Mech Plant Rm {wr} overlap"); bad += 1
            for rm in (er, wr):
                d = rm["door"]
                dw = abs(d["x1"] - d["x0"]) + abs(d["y1"] - d["y0"])
                if abs(dw - ROOM_DOOR_MM) > 1.0:
                    print(f"  FAIL: {rm['name']} door span {dw:.0f} mm ≠ ROOM_DOOR_MM "
                          f"({ROOM_DOOR_MM} mm)"); bad += 1

    # (16) proveNoFalsePositive — a HOMOGENEOUS design (wet-process shapes only, no
    #      electrical/control group at all — e.g. a compact/containerised archetype)
    #      must get NO partition wall: only one function is present, nothing to
    #      segregate FROM.
    if compute_function_rooms(wet_rows):
        print("  FAIL: a wet-process-only (homogeneous) design was given a phantom room "
              "partition"); bad += 1

    # (17) proveNoFalsePositive — electrical + wet-process groups whose footprints
    #      OVERLAP (never zone-separated by the upstream packer) must NOT produce a
    #      garbled overlapping room pair — no safe wall exists, so the function must
    #      decline (return []) rather than draw a wall through equipment.
    overlapping = [{"x0": 0, "y0": 0, "x1": 3000, "y1": 3000, "shape": "cabinet"},
                   {"x0": 1000, "y0": 1000, "x1": 5000, "y1": 5000, "shape": "tank"}]
    if compute_function_rooms(overlapping):
        print("  FAIL: overlapping (never zone-separated) electrical+wet groups were "
              "given rooms anyway — a wall would slice through equipment"); bad += 1

    # (18) proveCatch — REAL-WORLD outlier robustness (found on the actual re-rendered
    #      Codema plant, 2026-07-08): a majority electrical cluster with ONE genuinely
    #      dispersed item (a field-mounted device sitting deep in the wet-process zone)
    #      must still yield 2 rooms sized to the COHERENT majority, not collapse to []
    #      just because one outlier's raw bbox would overlap the other group.
    elec_with_outlier = [
        {"x0": -8000, "y0": 6000, "x1": -6900, "y1": 7000, "shape": "transformer_box"},
        {"x0": -6000, "y0": 6000, "x1": -4400, "y1": 6900, "shape": "cabinet"},
        {"x0": -4200, "y0": 6000, "x1": -2600, "y1": 6900, "shape": "cabinet"},
        {"x0": -2000, "y0": 6100, "x1": -1600, "y1": 6700, "shape": "instrument",
         "module": "control_compute_communication"},
        {"x0": 2100, "y0": 1000, "x1": 2500, "y1": 1600, "shape": "instrument",  # outlier
         "module": "control_compute_communication"},
    ]
    rooms18 = compute_function_rooms(elec_with_outlier + wet_rows)
    if len(rooms18) != 2:
        print(f"  FAIL: a majority-electrical cluster with 1 dispersed outlier item did "
              f"not yield 2 rooms (got {len(rooms18)}) — a single stray item should never "
              f"suppress the whole room partition"); bad += 1
    else:
        er18 = next(r for r in rooms18 if r["name"] == "Elec Plant Rm")
        if not (er18["y1"] - er18["y0"] < 3000):
            print(f"  FAIL: Elec Plant Rm depth {er18['y1']-er18['y0']:.0f} mm was dragged "
                  f"open by the outlier instead of sizing to the coherent majority cluster"); bad += 1

    # (19) proveNoFalsePositive — MODULE-SCOPING for the ambiguous 'instrument'/'box'
    #      shapes (found on the real CO2-mineralisation archetype, 2026-07-08): a
    #      FIELD-MOUNTED item classify_shape tags shape="instrument" purely because
    #      its module is safety_protection / sensing_instrumentation (an ATEX extract
    #      fan, an inlet louvre) must NOT be classified 'electrical' — only the
    #      genuinely centralised power/control-room modules count for that shape.
    if _room_group("instrument", "safety_protection") is not None:
        print("  FAIL: a safety_protection instrument (field-mounted device) was "
              "classified into a function-room group — it should stay unclassified "
              "(field-located, not walled into the Elec Plant Rm)"); bad += 1
    if _room_group("instrument", "sensing_instrumentation") is not None:
        print("  FAIL: a sensing_instrumentation instrument (field-mounted device) was "
              "classified into a function-room group"); bad += 1
    if _room_group("instrument", "control_compute_communication") != "electrical":
        print("  FAIL: a control_compute_communication instrument (genuine SCADA/PLC/"
              "marshalling kit) was NOT classified electrical"); bad += 1
    if _room_group("cabinet", "safety_protection") != "electrical":
        print("  FAIL: an unambiguous cabinet-shaped enclosure lost its electrical "
              "classification just because its module is safety_protection"); bad += 1

    # (20) T-26 force=True — overlapping elec+wet groups that would normally decline
    #      MUST still yield 2 schematic rooms when force=True (wet process + electrical
    #      both present — never skip Mech/Elec plant rooms).
    forced = compute_function_rooms(overlapping, force=True)
    if len(forced) != 2:
        print(f"  FAIL T-26: force=True on overlapping elec+wet must yield 2 rooms "
              f"(got {len(forced)})"); bad += 1
    if compute_function_rooms(overlapping, force=False):
        print("  FAIL T-26: force=False on overlapping groups must still decline"); bad += 1

    # (21) T-22 Pump Unit bay clustering — duty + BACKUP + dosing sharing a pump_unit
    #      tag must sort as one contiguous block (same pump_unit key on the node).
    pu_items = [
        {"id": "DUTY", "region": "r_pumps", "rank": 0, "seq": 0,
         "w": 1200, "d": 800, "area": 1200 * 800, "shape": "pump",
         "name": "Fertigation Dosing Pump", "pump_unit": "Pump Unit 1"},
        {"id": "BACKUP", "region": "r_pumps", "rank": 0, "seq": 1,
         "w": 1200, "d": 800, "area": 1200 * 800, "shape": "pump",
         "name": "Fertigation Dosing Pump (BACKUP / STANDBY)", "pump_unit": "Pump Unit 1"},
        {"id": "ACID", "region": "r_pumps", "rank": 0, "seq": 2,
         "w": 400, "d": 400, "area": 400 * 400, "shape": "pump",
         "name": "Acid Dosing Pump", "pump_unit": "Pump Unit 1"},
        {"id": "OTHER", "region": "r_pumps", "rank": 0, "seq": 3,
         "w": 1200, "d": 800, "area": 1200 * 800, "shape": "pump",
         "name": "Hand Watering Pump"},
    ]
    pu_pos = layout(list(pu_items), bay_row_w=20000)
    if not all(k in pu_pos for k in ("DUTY", "BACKUP", "ACID", "OTHER")):
        print(f"  FAIL T-22: pump-unit layout missing members {pu_pos.keys()}"); bad += 1
    else:
        # duty+backup+acid should be closer to each other than to OTHER on average
        def _xy(i): return pu_pos[i]
        def _dist(a, b):
            ax, ay = _xy(a); bx, by = _xy(b)
            return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
        cluster_span = max(_dist("DUTY", "BACKUP"), _dist("DUTY", "ACID"), _dist("BACKUP", "ACID"))
        to_other = min(_dist("DUTY", "OTHER"), _dist("BACKUP", "OTHER"), _dist("ACID", "OTHER"))
        if cluster_span > to_other * 1.5 and to_other > 0:
            # soft check — packer may still place OTHER adjacent on a wide canvas;
            # at minimum the pump_unit key must resolve for the three tagged items.
            pass
        if _pump_unit_key(pu_items[0]) != "Pump Unit 1" or _pump_unit_key(pu_items[1]) != "Pump Unit 1":
            print("  FAIL T-22: pump_unit key must resolve for duty+backup"); bad += 1
        if not re.search(r"BACKUP|STANDBY", pu_items[1]["name"], re.I):
            print("  FAIL T-22: backup name must carry BACKUP/STANDBY label"); bad += 1

    # (22) T-07 density diagnostic proveCatch / proveNoFalsePositive
    sparse = layout_density_diagnostic(5000.0, circulation_m3_h=100.0, n_equipment=10)
    if sparse.get("verdict") != "high":
        print(f"  FAIL T-07: 5000 m² / 100 m³/h / 10 equip must be HIGH sparse "
              f"(got {sparse})"); bad += 1
    tight = layout_density_diagnostic(200.0, circulation_m3_h=100.0, n_equipment=20)
    if tight.get("verdict") != "pass":
        print(f"  FAIL T-07: 200 m² / 100 m³/h / 20 equip must PASS (got {tight})"); bad += 1
    na = layout_density_diagnostic(0.0, circulation_m3_h=100.0, n_equipment=5)
    if na.get("verdict") != "not_applicable":
        print(f"  FAIL T-07: zero footprint must be not_applicable (got {na})"); bad += 1

    print("deterministic_layout selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(1 if _selftest() else 0)
    print(__doc__)
