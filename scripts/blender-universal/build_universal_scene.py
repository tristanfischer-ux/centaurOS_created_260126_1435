"""build_universal_scene.py — UNIVERSAL deterministic state.json → Blender CAD.

FIRST CUT (2026-06-10). Driven by the ENGINEERING MODULE STRUCTURE + the
TOPOLOGY FLOW GRAPH — NOT keyword bins (that was the rejected "procedural
vomit"). The difference, concretely:

  1. Physical parts are extracted from moduleDecomposition.modules → sub_modules
     → words; NON-PHYSICAL lines (catalyst charges, adsorbent fills, coatings,
     software, services, …) are FILTERED OUT before any geometry is built.
  2. Parts are grouped by their owning MODULE REGION and the regions are laid
     out left→right in PROCESS-FLOW ORDER (derived from a topological sort of
     the fluid_loop topology edges, with a module-name priority fallback).
  3. Every topology edge is drawn as a routed CAD pipe between the two resolved
     part anchors, coloured by mechanism. That connectivity is the whole point.

It uses the parametric primitive library in forge_blender_lib.py
(prim_skid_frame, prim_pipe_run, route_orthogonal, prim_tower, prim_gantry,
add_cyl/add_box/add_frustum/add_torus, …) — all millimetre-based. Process
vessels + rotating machines are built by the LOCAL build_vessel() /
build_machine() helpers below (shell + torispherical-read dished heads +
kind-specific support; baseplate + motor + casing) because the generic
lib prim_vessel rendered every vessel identically and squat tanks as spheres
(Tristan visual-judge 2026-06-10).

Run:
  BLENDER_OUT_DIR=/tmp/bl-univ-efuel \
  /Applications/Blender.app/Contents/MacOS/Blender --background --python \
  scripts/blender-universal/build_universal_scene.py -- out/oxccu-saf-v21/state.json

Argv after `--` = state.json path (also via env STATE_JSON). Output dir via
env BLENDER_OUT_DIR (default: ./out-universal next to this file).

EVERYTHING tunable lives in the CONFIG block at the top: the part→shape map,
the type-default sizes, the module-region order fallback, the pipe palette.
"""
import bpy  # noqa: F401  (provided by Blender)
import os
import re
import sys
import json
import math
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender-templates"))
import forge_blender_lib as fl

# ── FAST PIPE-RUN PATCH (universal router robustness) ─────────────────────────
# The stock forge_blender_lib.add_pipe calls bpy.ops.object.select_all + convert
# (target="MESH") after creating the curve. In a large scene (RAS v14: 96 parts
# × several mesh bodies = 800+ objects by the time routing starts) these bpy.ops
# calls iterate over EVERY scene object on each invocation — O(scene_objects) per
# pipe segment.  With 105 topology edges × 5-6 waypoints each, the cumulative cost
# reaches tens of minutes on the 493 m × 70 m RAS plant.  Solution: skip the
# convert-to-mesh step (keep the curve as a curve — Blender renders bevel curves
# identically at INSPECT quality; Freestyle line detection works the same way).
# The patch installs itself on fl.add_pipe so every downstream caller
# (forge_blender_lib.prim_pipe_run) benefits automatically without touching the
# shared library file.  All bpy.data calls are O(1) regardless of scene size.
def _add_pipe_fast(name, points, radius, material, module=None,
                   module_objects=None, bevel_segments=4):
    """Drop-in replacement for forge_blender_lib.add_pipe that avoids the
    bpy.ops.object.select_all + convert(target='MESH') calls that make pipe
    creation O(scene_objects).  The curve is linked directly — no conversion —
    so geometry creation stays O(1) regardless of how many objects are in the
    scene.  Visual output is identical at INSPECT zoom (bevel curve = tube mesh
    at the render level).  The fl_pipe_run attribute and module linkage are
    preserved so downstream consumers see the same object shape."""
    import bpy as _bpy  # available in Blender's embedded Python
    if len(points) < 2:
        return None
    curve_data = _bpy.data.curves.new(name + "_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_segments
    polyline = curve_data.splines.new("POLY")
    polyline.points.add(len(points) - 1)
    for idx, (x, y, z) in enumerate(points):
        polyline.points[idx].co = (x, y, z, 1.0)
    obj = _bpy.data.objects.new(name, curve_data)
    _bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    # No bpy.ops.select_all / convert — O(1) instead of O(scene_objects).
    obj["fl_pipe_run"] = True
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj

# Install the patch immediately after importing fl so every subsequent call to
# fl.add_pipe (including calls from within forge_blender_lib.prim_pipe_run) uses
# the fast version.  This is safe in Blender's single-threaded script environment.
fl.add_pipe = _add_pipe_fast

# Similarly patch fl.add_box to avoid bpy.ops.object.transform_apply (also
# O(scene_objects) via the implicit depsgraph refresh).  Replace with a direct
# bpy.data primitive creation + manual scale bake via object.matrix_world, which
# is O(1).  The visual output is identical; the scale is applied to the mesh data
# via bmesh so downstream dimension queries still work.
def _add_box_fast(name, location, size, material, module=None,
                  module_objects=None, rotation=(0, 0, 0)):
    """Drop-in for forge_blender_lib.add_box that skips bpy.ops.transform_apply."""
    import bpy as _bpy
    import bmesh as _bmesh
    import mathutils as _mu
    mesh = _bpy.data.meshes.new(name + "_mesh")
    bm = _bmesh.new()
    # half-extents in Blender units (size already in Blender units, not mm)
    _bmesh.ops.create_cube(bm, size=1.0)
    # Scale each vertex to the desired half-extents directly in bmesh (O(8 verts))
    sx, sy, sz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = _bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    _bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj

fl.add_box = _add_box_fast

# Deterministic + universal connection-sizing engine (SIBLING module, no Blender
# import). It turns each topology edge's rating (constraint_kind + required_value
# + required_unit + required_margin_factor + material_context) + the CAD-measured
# run length into a REAL connection size (cable CSA / pipe DN / duct) and an
# outer_dia_mm the generator renders the cylinder/tray at — so a 1562 A DC bus
# renders VISIBLY FATTER than a signal line and a drip line thin, instead of every
# run being the fabricated PIPE_DIA_MM = 190. It shells out to the repo .venv +
# the orchestrator first-principles tools, so it runs fine under Blender's python.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import connection_sizing as cs
import connection_ledger as cl   # the LEDGER authority — validates + owns the connection graph
import layout_optimiser as lo    # deterministic CRAFT plant-layout optimiser (opt-in)


# ═══════════════════════════════════════════════════════════════════════════
# CONFIG — tune the generator here. (Tristan will edit these in a visual loop.)
# ═══════════════════════════════════════════════════════════════════════════

# ── 1. Non-physical filter ─────────────────────────────────────────────────
# A word is NON-PHYSICAL (no geometry) when its NAME marks it as a consumable
# fill, a coating, a software/service line, or spares. We test ONLY the
# name_human — NOT the form text — because the form prose of a perfectly real
# vessel routinely mentions "catalyst" / "service" / "resin" / "additive"
# (e.g. the FT reactor form says "shaped iron catalyst", the H2 compressor form
# says "hydrogen-service") and matching on form wrongly deletes the vessel.
# The genuinely non-physical lines name themselves: they END in "charge", or
# are a pure consumable/coating/software noun.
NON_PHYSICAL_RE = re.compile(
    r"("
    r"\bcharge\b|"                       # "... catalyst charge", "adsorbent ... charge"
    r"\bcoating\b|\bpaint\b|\bprimer\b|"
    r"\blabell?ing\b|\bsignage\b|"
    r"\bsoftware\b|\bfirmware\b|\blicen[cs]e\b|"
    r"\bservice\s+contract\b|\bconsumables?\b|"
    r"\blubricant\b|\bgrease\b|\bsealant\b|"
    r"\bdesiccant\s+(?:fill|charge)\b|\bresin\s+(?:fill|charge)\b|"
    r"\bmedia\s+(?:fill|charge)\b|\badsorbent\s+(?:fill|charge|\+)|"
    r"\bdocumentation\b|\btraining\b|\bwarranty\b|"
    r"\bparameters?\b|\bsizing\s+basis\b|\bdesign\s+basis\b|"  # "Reactor/Absorber Sizing Parameters" — design metadata, never a vessel
    r"\bcontactors?\b|"                                        # a motor contactor is panel control-gear, not GA-scale equipment
    r"\bspares?\b"
    r")", re.IGNORECASE,
)

# ── 2. Part → SHAPE classification ─────────────────────────────────────────
# Ordered list of (regex on name_human+form, shape-kind). FIRST match wins, so
# put the most specific patterns first. The shape-kind is interpreted by
# build_part() below into a primitive call. Add/réorder freely.
SHAPE_RULES = [
    # ── ROTATING MACHINES first (a "tail-gas recycle compressor" must read as a
    #    MACHINE, not get caught by a downstream "recycle"/"gas" vessel rule) ──
    (r"compressor", "compressor"),
    (r"\bpump\b", "pump"),
    (r"blower|\bfan\b", "pump"),
    # ── WATER / PROCESS TREATMENT equipment (universal — any treatment plant has
    #    these; without a rule they fall to the DEFAULT box and their cylinder
    #    dimension is discarded, so a 515 m³ biofilter renders as a 1 m grey box) ──
    (r"biofilter|bioreactor|\bmbbr\b|moving.?bed|trickling|\bbiological\b", "vertical_vessel"),
    (r"degass|deaerat|\bstripper\b|stripping", "tall_column"),
    (r"skimmer|foam.?frac", "tall_column"),
    (r"oxygenat|oxygen.?cone|speece", "vertical_vessel"),
    (r"clarifier|settler|lamella|sediment", "tank"),
    (r"\buv\b|steriliz|disinfect|ozone", "vertical_vessel"),
    # ── HORIZONTAL vessels (separation/exchange/disengagement) BEFORE the
    #    generic vertical bucket, because "separator"/"drum"/"knock-out" are the
    #    classic horizontal-on-saddles shapes. A "steam drum" + "3-phase
    #    separator" + "knock-out drum" all belong here. ──
    (r"separator|knock[- ]?out|steam drum|\bdrum\b|3[- ]?phase|three[- ]?phase|"
     r"exchanger|\bcooler\b|condenser|reboiler|heat[- ]?exchang|\bHX\b|"
     r"buffer|receiver", "horizontal_vessel"),
    # tall vertical process vessels / towers (reaction, mass transfer)
    (r"fractionation column|distillation|stripper|absorber|scrubber|"
     r"\bcolumn\b|\btower\b", "tall_column"),
    (r"reactor|reaction|hydrocrack|hydrotreat|isomeris|isomeriz|dewax", "tall_vessel"),
    # vertical fixed-bed / filtration vessels (flanged ends, short legs)
    (r"dryer|guard[- ]?bed|\bbed\b|adsorber|coalescer|\bfilter\b|"
     r"\bguard\b", "vertical_vessel"),
    # storage
    (r"storage tank|\btank\b|\bstorage\b", "tank"),
    # tall stacks (oxidiser/flare/chimney)
    (r"oxidi[sz]er|flare|stack|chimney|incinerat", "stack"),
    # boiler / steam generator / fired preheater (big box-ish package)
    (r"steam generator|boiler|waste[- ]?heat|preheater|fired heater|furnace|"
     r"\bheater\b", "package_box"),
    # skids / packages / electrical lineups
    (r"transformer", "transformer_box"),
    (r"switchgear|\bMCC\b|motor control cent|distribution board|\bUPS\b|"
     r"uninterruptible|\bboard\b|switchboard|motor control centre", "cabinet"),
    (r"cabinet|marshalling|junction box|\bDCS\b|distributed control|control system|"
     r"safety instrumented|fire .*(controller|gas)|\bI/O\b|isolation barrier|"
     r"\bbarrier\b|\bHMI\b|industrial switch|profinet|ethernet|"
     r"interface station|remote i/o|\bdrive\b|\bVFD\b|frequency drive", "cabinet_small"),
    (r"\bskid\b|package|additisation|generation|inerting|nitrogen", "skid_box"),
    (r"gantry|loading arm|loading", "gantry"),
    (r"\bmixer\b|static mixer", "inline_spool"),
    (r"valve|transmitter|thermowell|detector|analy[sz]er|metering|"
     r"instrument|sensor|relief|gauge|probe", "instrument"),
]
DEFAULT_SHAPE = "box"  # anything unmatched → a modest box

# ── 3. TYPE-DEFAULT sizes (mm) — used only when the word has NO explicit dim ─
# Each entry: overall (diameter_or_width, length_or_height) in mm. For vessels
# the first is diameter, second is length/height. For boxes (W, D, H) we expand
# below. Keep these realistic — they set the silhouette when data is silent.
TYPE_DEFAULTS_MM = {
    "tall_column":       dict(dia=900,  height=12000),
    "tall_vessel":       dict(dia=1200, height=4500),
    "vertical_vessel":   dict(dia=700,  height=2400),
    "horizontal_vessel": dict(dia=700,  length=2600),
    "compressor":        dict(w=1800,   d=1100, h=1300),
    "pump":              dict(w=900,    d=500,  h=700),
    "tank":              dict(dia=3000, height=3500),
    "stack":             dict(dia=500,  height=9000),
    "package_box":       dict(w=2400,   d=1600, h=2200),
    "skid_box":          dict(w=2200,   d=1500, h=1600),
    "transformer_box":   dict(w=1800,   d=1400, h=1900),
    "cabinet":           dict(w=1600,   d=700,  h=2100),
    "cabinet_small":     dict(w=700,    d=500,  h=1800),
    "gantry":            dict(span=4000, height=4500),
    "inline_spool":      dict(dia=350,  length=900),
    "instrument":        dict(w=250,    d=250,  h=400),
    "box":               dict(w=1000,   d=900,  h=1100),
}

# ── 4. Module-region PROCESS-FLOW order (fallback when topo sort is partial) ─
# Lower rank = further upstream (placed further left, lower X). Matched as a
# substring against the lower-cased module display_name AND the module id.
REGION_PRIORITY = [
    (r"feedstock|feed |intake|receipt|conditioning", 10),
    (r"synthesis|reaction|conversion|reactor", 20),
    (r"separation|recycle", 30),
    (r"upgrading|fractionation|refin|product treat", 40),
    (r"storage|loading|product stor", 50),
    (r"utilit|offsite|environmental|power|electrical", 60),
    (r"control|safety|instrument|sensing", 70),
]
REGION_PRIORITY_DEFAULT = 45  # unmatched regions land mid-plant

# ── 5. Layout geometry (mm) ────────────────────────────────────────────────
# These govern the plant footprint. The KEY scale lever is the region-width
# cap: crowded instrument/electrical regions pack into a bounded window + grid
# rather than stringing parts metres down the skid (the 125 m-ribbon bug).
DECK_Z_MM         = 300     # skid-deck datum: equipment underside sits here
# DENSITY (Tristan visual-judge 2026-06-10): the plant read as objects scattered
# on a flat plate. Gaps roughly HALVED so equipment packs together as one unit.
REGION_GAP_MM     = 600     # clear gap between successive regions along X (Fix 2: 800→600)
PART_GAP_MM       = 350     # gap between parts within a region (Fix 2: 450→350)
MIN_REGION_WIDTH_MM = 3500  # floor so a sparse region still gets a sane block
MAX_REGION_WIDTH_MM = 10000 # cap so one busy region can't dominate (wrap instead)
REGION_ASPECT     = 1.4     # target_width ≈ sqrt(footprint_area) × this (>1 = wider than deep)
# Region serpentine banking — fold the process line into N lanes so the plant
# footprint stays square-ish instead of one long ribbon (the scale fix).
N_BANKS           = 2       # number of stacked process lanes
BANK_LANE_PITCH_MM = 8000   # initial Y pitch between bank lanes (a generous first
                            # pass; the real spacing is set by the post-placement
                            # Y-compaction below, which packs lanes to their true depth)
# Fix 2 DENSITY (Tristan 2026-06-10): after placing, banks are RE-STACKED in Y to
# their MEASURED depth + this small gap, so there is no dead empty band between the
# two lanes (the old fixed 8 m pitch left a deep empty middle/front bay — the frame
# was far deeper than the equipment). A walkway-width gap keeps them readable.
BANK_COMPACT_GAP_MM = 2400  # clear gap between adjacent compacted bank lanes — a REAL
                            # pipe-rack maintenance AISLE (2026-06-20: 3600→2400 to compact
                            # the Y-spread — Tristan; 2.4 m is still a walkable aisle but
                            # trims ~1.2 m per inter-bank gap, packing the plant toward its
                            # building footprint. was 1.6 m, too tight for the
                            # overhead rack spine + lanes; 3.6 m gives the spine a
                            # genuine corridor so cross-laterals only span one bank)
# FLOW-LAYOUT (2026-06-11): the process train stays a SINGLE left→right lane while
# its total width is under this — so every connected stage is X-adjacent and the
# pipe runs are SHORT (the whole point of the flow layout). A train wider than this
# folds along the flow into ≤ N_BANKS lanes. Generous (~52 m) so the typical 5-6
# region plant reads as one clean process row; folding only kicks in for a genuinely
# long train (8+ wide regions) where one row would be an unreadable ribbon.
# NB (2026-06-20): this governs the X flow-DIRECTION width, NOT the Y bank-depth. The
# RAS 53.9 m spread is Y bank-stacking (region rows + the tank mega-array), not the
# flow train — lowering this to 34 m had no effect (RAS flow-X is only 26.8 m). The
# Y-compaction is the placement-polish job (task #147).
FLOW_TRAIN_SINGLE_LANE_MAX_MM = 52000
# Within a region bay, the three sub-blocks are offset in Y from the bay base.
# Fix 2 DENSITY (Tristan 2026-06-10): offsets pulled in so big/medium/small NEST
# closer — the old 5000/2200 spread left an empty middle band in every bay (visible
# as gaps in the top view). Tighter banding packs each region + lets the two banks
# sit closer in Y, so the framed footprint reads PACKED, not scattered.
BIG_BLOCK_DY_MM   = 3200    # big process vessels at the BACK of the bay (was 5000)
MED_BLOCK_DY_MM   = 1500    # medium vessels in the MIDDLE (was 2200)
SMALL_BLOCK_DY_MM = 0       # instrument/cabinet grid at the FRONT
FRAME_MARGIN_MM   = 700     # skid frame padding around the EQUIPMENT bulk (Fix 2
                            # DENSITY 2026-06-10: 1200→700 so the frame HUGS the
                            # equipment outline — the wide perimeter border read as
                            # an empty bay all round; a tight margin fills the frame)
# FRAME FIT (Tristan visual-judge 2026-06-10, Fix 1): the frame must HUG the
# equipment, not the full plant extent. Both its FOOTPRINT (equipment_bbox_mm) and
# its HEIGHT target (main(), is_tall_for_frame) are computed from the NON-tall
# equipment only — stacks/flares/slim towers are excluded and poke through the
# roof. SKID_FRAME_MIN_HEIGHT_MM is just a floor so a flat plant still gets a frame.
SKID_FRAME_MIN_HEIGHT_MM = 4500
SKID_FRAME_HEIGHT_FRAC   = 0.92   # frame top = this × tallest-EQUIPMENT-top. With
                                  # tall towers/stacks already excluded from the
                                  # target, the frame hugs the bulk (≈ its top) and
                                  # the excluded towers tower above it.
SKID_POST_MM             = 180    # box-section size of frame posts/rails (substantial)

# ── STAGE 4 GROUND SLAB (the floor the plant SITS ON) ──────────────────────────
# Tristan 2026-06-21: the universal render had "everything floating in the air, no
# floor showing". add_ground_slab lays a flat reinforced-concrete deck under the
# plant: its TOP at DECK_Z_MM (the same datum every part's underside sits on, so the
# equipment SITS on it), spanning the equipment footprint + a margin so it reads as a
# deck the plant stands on (not a tight tile, not a horizon-filling plane that would
# shrink the plant in-frame). Universal, footprint-keyed; named u_ground_* (already
# registered in the parts-manifest skip + the INSPECT recolour). Skipped for the
# free-space families (aircraft/satellite have their own faint ground plane; a wind
# turbine has its own foundation pad).
GROUND_SLAB_THICK_MM   = 400.0    # reinforced slab depth (top at DECK_Z_MM, extends down)
GROUND_SLAB_MARGIN_MM  = 4000.0   # (was 2500) wider apron so the floor clearly reads in the hero
# Concrete-grey — darker than before (was 0.62) against the 0.85 INSPECT world so the
# deck reads UNMISTAKABLY as the plant floor in the hero/iso view (Tristan 2026-06-22:
# "no floor"), while staying subordinate to the equipment.
GROUND_SLAB_COLOUR     = (0.52, 0.52, 0.55)

# ── STAGE 1 LINEAR LAYOUT (BLENDER_LINEAR_LAYOUT=1) ─────────────────────────
# A DETERMINISTIC diagnostic placement that lays EVERY part in ONE straight row
# along +X, ordered by process sequence (region_rank ascending, then a stable
# tag/name tie-break). This is STAGE 1 of the 4-stage connection-points plan
# (1: correct parts in one line in process order · 2: ports · 3: wire ·
# 4: fold/compact). It deliberately BYPASSES the compact bank/serpentine layout,
# the skid frame, the pipe rack and the topology routing — those belong to the
# folding/wiring stages. Default OFF so the production compact placement is
# byte-unchanged; truthy → the linear override runs (see place_all_linear).
LINEAR_LAYOUT_ON = os.environ.get("BLENDER_LINEAR_LAYOUT", "").strip().lower() \
    not in ("", "0", "false", "no", "off")
# Clear gap [mm] left between successive parts' footprint edges along the row.
LINEAR_PART_GAP_MM = 2500   # ≈2.5 m breathing space so the row reads part-by-part

# ── STAGE 3/4 PORT-TO-PORT WIRING (BLENDER_WIRE_PORTS) ─────────────────────────
# Route every LEDGER edge as a real pipe PORT-TO-PORT (from the source part's
# <service>_out port to the destination part's <service>_in port — the coordinates
# Stage 2 stored on part.ports), so the line reads as one long CONNECTED run with
# NOTHING floating. See wire_ports().
#
# STAGE 4 CONVERGENCE (2026-06-21): port-to-port wiring is now ON BY DEFAULT for the
# PRODUCTION compact layout too (not just the Stage-1 linear row). The compact placer
# IS the fold; this brings the ports + port-to-port runs INTO that fold so the real
# hero shows parts connected port-to-port. The OLD centre-based spine router
# (route_topology) still runs, but it now DEFERS every edge wire_ports can resolve
# (both endpoints are real placed-and-ported parts) and only routes the abstract
# battery-limit edges wire_ports cannot land on (grid / drain / atmosphere incomers)
# — see _edge_is_port_wirable + _SPINE_DRAWN_EDGE_IDS, so each edge is drawn EXACTLY
# ONCE (no double-draw). Escape hatch: BLENDER_WIRE_PORTS=0 restores the pure
# centre-based spine routing (route_topology draws everything, wire_ports off).
def _wire_ports_on(linear_on):
    v = os.environ.get("BLENDER_WIRE_PORTS", "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    # default: ON — the Stage-1 linear row AND the production compact layout both wire
    # port-to-port. (Stage 4 turned this on for production; was: ON iff linear_on.)
    return True

# STAGE 4 DOUBLE-DRAW GUARD — the registry of topology edges the centre-based SPINE
# router (route_topology / _emit_routes_on_plan) actually drew this run, keyed by the
# edge object's id(). wire_ports skips any edge already in here, so when both engines
# run (production with wiring ON) NO edge is drawn twice. Reset per build alongside
# _ROUTE_LOG. (Edge identity is stable: the SAME topology list object is passed to the
# placer's route_topology AND to wire_ports, so id(edge) matches across both.)
_SPINE_DRAWN_EDGE_IDS = set()


def _spine_defers_to_wire_ports():
    """True when wire_ports is the PRIMARY router for part-to-part edges (Stage 4):
    the spine router must then DEFER (skip) every edge wire_ports will draw and route
    ONLY the abstract battery-limit edges. This is exactly `_wire_ports_on(...)` — when
    wiring is active the partition is in force; when it is off the spine draws all."""
    return _wire_ports_on(LINEAR_LAYOUT_ON)


def _edge_is_port_wirable(e, by_name):
    """The SINGLE source of truth for the wire_ports ↔ spine-router partition: True iff
    THIS ledger edge will be drawn PORT-TO-PORT by wire_ports (so the spine router must
    skip it). An edge is port-wirable when it is a routable service (not an assembly
    mount) AND BOTH endpoints resolve — by EXACT name — to a placed, NON-ENVELOPE part.

    "placed + non-envelope" is EXACTLY the set add_connection_ports gives ports to
    (_required_ports_for always returns ≥1 port for such a part, via its universal
    water-in/out | power-in fallback), so this predicate is the route-TIME-valid proxy
    for "will be ported": it must NOT test p.ports, because the spine router
    (route_topology) runs INSIDE the placer, BEFORE Stage-2 ports exist. wire_ports runs
    AFTER ports, where placed+non-envelope ⟺ has-ports, so both engines agree on the
    partition and every edge is drawn by exactly one of them.

    Uses exact name match (by_name = {p.name: p}), NOT resolve_endpoint's fuzzy token
    overlap, because finalize_ledger already canonicalised every REAL endpoint to its
    resolved part's `p.name` (it sets e['from_part']/e['to_part'] = a_name/b_name). So an
    abstract battery-limit endpoint keeps its raw tag (absent from by_name) and is NOT
    port-wirable → the spine router routes it (its _resolve_abstract_end synthesises an
    incomer/centroid). EXACT complement of route_topology's abstract-endpoint handling."""
    mech = e.get("mechanism")
    service = e.get("_ledger_service") or cl._service_of(mech)
    if service == "assembly":
        return False
    a = by_name.get(e.get("from_part"))
    b = by_name.get(e.get("to_part"))
    return (a is not None and b is not None
            and bool(getattr(a, "placed_xyz_mm", None))
            and bool(getattr(b, "placed_xyz_mm", None))
            and not _layout_is_envelope(a) and not _layout_is_envelope(b))


# How far above the TALLER of the two ports a wired run's horizontal "across" leg
# travels [mm] — the run rises from the source port, crosses overhead at this
# clearance, then drops to the destination port (a clean Manhattan 3-segment path
# that reads as one connected line and clears the equipment tops it spans).
WIRE_OVERHEAD_CLEAR_MM = 450.0   # (was 900) hug the equipment tops — less overhead "flare"
# Per-(service) Z stagger [mm] added to the overhead leg so two wired runs that
# share a span (e.g. the water main + the power bus running the length of the row)
# sit at distinct elevations and don't co-incide / cross at the same height. Kept
# small (was 320) so runs read as a TIDY rack at near-uniform height, not a spray of
# pipes climbing to a dozen elevations (Tristan 2026-06-22: "pipework flaring around").
WIRE_SERVICE_TIER_MM = 130.0
# A run whose plan span is at/under this stays at its OWN LOCAL height (just above the
# taller of its two ports) — a short riser → local cross → drop that LANDS on the port,
# instead of flying up to the global ~6.4 m overhead rack and back down (the absurd 40 m
# detour Tristan flagged: a busbar→fuse-holder 1.5 m apart routed up-and-over the whole
# plant). ONLY genuinely long cross-plant runs use the high rack to clear the tank farm.
WIRE_LOCAL_DIRECT_MAX_MM = 9000.0

# ── 6. Pipe palette by mechanism ───────────────────────────────────────────
# Pipe radius ~1.7× (Tristan 2026-06-10): the runs read as thin wires. 110→190 mm.
# 2026-06-11: PIPE_DIA_MM is NO LONGER the diameter every run is drawn at. Each run
# is now sized at its REAL outer diameter by connection_sizing.size_connection (from
# the edge rating + the routed-polyline length); see _sized_dia_mm. PIPE_DIA_MM
# survives ONLY as the FALLBACK diameter for an edge that carries no rating at all
# (and for the nozzle-stub neck radius, which is geometry not a sized connection).
PIPE_DIA_MM = 190           # FALLBACK routed-pipe diameter (un-rated edge only)
# Fallback diameter [mm] for a DERIVED fan-out edge that has no parent rating to
# divide (small — a thin default, NOT the fat 190). Logged + noted in the schedule.
CONN_FALLBACK_DIA_MM = 60.0
# Hard floor on the rendered outer diameter [mm] so even the thinnest sized run
# (a 1.5 mm² control lead ≈ 12 mm) stays visible at plant zoom without being so fat
# it hides the step-down. A sized value ABOVE this is used as-is (the whole point).
CONN_MIN_RENDER_DIA_MM = 12.0
# Whether this run is the clean light CAD-inspection pass (INSPECT=1, the default
# visual-judge surface) vs the production dark-deck PDF render. Read once at import
# so the sizing chokepoint can lift the thin-pipe floor for legibility (below).
_INSPECT_MODE = os.environ.get("INSPECT", "1").strip().lower() not in (
    "0", "false", "no", "off", "")
# INSPECT-ONLY visual floor on the rendered outer diameter [mm]. The engineering
# sizing (and the PDF render) keep the true 12 mm floor; but on the light
# visual-judge surface a real DN15 process line (15 mm) is a hair-thin thread at a
# 44 m plant zoom, which reads as "odd / sparse pipework" (Tristan visual-judge
# 2026-06-11). Lifting the FLOOR to a legible minimum makes every process run read
# as a proper pipe on the rack while fat sized runs (a DN200 header) stay fat — the
# relative thickness ordering is preserved, only the thinnest become legible.
INSPECT_MIN_PIPE_DIA_MM = 90.0
# ── PHASE D2 ACTUATION (auto-insert a sub-distribution + re-route) ───────────────
# OFF BY DEFAULT. When a fan-out trunk is a D2 case (a long high-current LV run that
# size_connection_to_spec can only RECOMMEND re-designing), enabling this makes the
# engine ACT: it inserts a local sub-distribution (step-down transformer) marker near
# the consumer cluster, runs ONE thin MV feeder from the source hub to it, and re-routes
# the consumers as SHORT LV branches off the sub-distribution — all re-sized IN-SPEC
# (connection_sizing.size_d2_actuation). Gated so real archetypes at normal limits are
# BYTE-IDENTICAL unless actuation is explicitly enabled (CONN_D2_ACTUATE=1).
CONN_D2_ACTUATE = os.environ.get("CONN_D2_ACTUATE", "").strip() not in ("", "0", "false", "no")
# Physical footprint [mm] of the rendered sub-distribution box (a local LV panel /
# step-down transformer kiosk). Coarse — it is a MARKER that the re-design happened,
# placed between the source hub and the far consumers, near the cluster.
SUBDIST_BOX_MM = (1400.0, 1000.0, 1800.0)   # W(along) × D(cross) × H
# Sub-distribution marker colour (a distinct yellow-amber kiosk so it reads as the
# inserted step-down, separate from the orange electrical runs).
SUBDIST_COLOUR = (0.92, 0.74, 0.18)
MECH_COLOUR = {             # sRGB; make_mat handles linear conversion.
    # SERVICE-COLOUR CONVENTION (Tristan 2026-06-13: "water pipes as blue and
    # electricity wires as red would help to see what is going on"). WATER/process
    # fluid = BLUE family, ELECTRICITY = RED, thermal/steam = ORANGE (moved off red so
    # red is unambiguously electrical), signal/data = green, control = yellow. Universal
    # — keyed on the routed edge's mechanism class, no per-archetype code.
    "fluid_loop":    (0.13, 0.40, 0.74),   # STEEL-BLUE — process water (muted off the electric
                                            # 0.10/0.45/0.90 so the pipework reads as subordinate
                                            # to the equipment in the value hierarchy (#147) while
                                            # staying unambiguously the WATER service colour)
    # DIRECTIONAL fluid mechanisms (derived flows): a SUPPLY feed and its RETURN must
    # read as TWO visually distinct lines (Tristan 2026-06-11) — both stay in the BLUE
    # family (water) but at clearly different shades so direction reads.
    "fluid_supply":  (0.12, 0.45, 0.95),   # bright blue — water SUPPLY / feed fan-out
    "fluid_return":  (0.00, 0.72, 0.90),   # cyan-blue — water RETURN (blue family, distinct)
    "thermal":       (1.00, 0.50, 0.05),   # ORANGE — hot/steam thermal SUPPLY
    "thermal_return":(0.78, 0.30, 0.05),   # dark orange — thermal / coolant RETURN
    "electrical_bus":(0.90, 0.10, 0.10),   # RED — electricity / power
    "mechanical":    (0.55, 0.56, 0.60),   # grey — mechanical / drive
    "data":          (0.20, 0.70, 0.40),   # green — signal / data
    "control":       (0.92, 0.80, 0.15),   # yellow — control / instrument air
    # LEDGER-MECHANISM keys (Stage-3 port-to-port wiring keys off the ledger edge's
    # raw `mechanism`, which uses these literals). Folded into the SAME service-colour
    # convention so a wired line reads by service: signal=green (= data), the oxygen
    # header = teal, the ventilation/gas air line = pale cyan-grey. Additive — these
    # mechanisms were previously absent from the map (fell to neutral grey); production
    # routing uses fluid_supply/fluid_return/electrical_bus/thermal, unaffected.
    "signal":        (0.20, 0.70, 0.40),   # green — instrument signal (same as data)
    "oxygen":        (0.10, 0.78, 0.74),   # teal — O₂ / oxidant gas header
    "air":           (0.62, 0.80, 0.86),   # pale cyan-grey — ventilation / gas air
}
MECH_DEFAULT_COLOUR = (0.50, 0.52, 0.56)

# ── 7. Material palette for the geometry by shape family ───────────────────
# REALISTIC PBR materials for the MATERIALED (INSPECT=0) render — stainless vessels, GRP/painted
# tanks, painted machinery, galvanised steel (Tristan 2026-06-22 "make the images better #1").
# (key, sRGB, metallic, roughness). The flat INSPECT=1 render uses INSPECT_TYPE_COLOUR instead,
# so this only changes the photoreal render. UNIVERSAL — keyed on shape, no class table.
SHAPE_MAT = {
    "tall_column":       ("col",      (0.74, 0.76, 0.80), 0.55, 0.42),  # BRUSHED stainless column
    "tall_vessel":       ("reactor",  (0.73, 0.75, 0.79), 0.52, 0.44),  # brushed reactor
    "vertical_vessel":   ("vessel",   (0.75, 0.77, 0.81), 0.52, 0.44),  # brushed stainless vessel
    "horizontal_vessel": ("vessel",   (0.75, 0.77, 0.81), 0.52, 0.44),  # brushed stainless drum
    "compressor":        ("comp",     (0.28, 0.38, 0.50), 0.55, 0.38),  # painted steel
    "pump":              ("pump",     (0.18, 0.40, 0.60), 0.45, 0.40),  # painted cast-iron (blue)
    "tank":              ("tank",     (0.60, 0.68, 0.74), 0.25, 0.42),  # GRP / painted tank
    "stack":             ("stack",    (0.62, 0.63, 0.66), 0.62, 0.40),  # galvanised
    "package_box":       ("pkg",      (0.54, 0.56, 0.60), 0.35, 0.52),  # painted package skid
    "skid_box":          ("skidbox",  (0.50, 0.58, 0.68), 0.40, 0.44),  # painted skid
    "transformer_box":   ("xfmr",     (0.40, 0.42, 0.47), 0.50, 0.44),
    "cabinet":           ("cab",      (0.32, 0.38, 0.48), 0.55, 0.40),  # painted cabinet
    "cabinet_small":     ("cabs",     (0.34, 0.40, 0.50), 0.50, 0.40),
    "gantry":            ("gantry",   (0.58, 0.59, 0.62), 0.70, 0.38),  # galvanised steel
    "inline_spool":      ("spool",    (0.80, 0.82, 0.86), 0.88, 0.26),  # stainless spool
    "instrument":        ("instr",    (0.30, 0.34, 0.40), 0.45, 0.42),  # (hidden in hero)
    "box":               ("box",      (0.54, 0.56, 0.60), 0.40, 0.48),
}
STRUCTURE_MODULE_ID = "structure_containment"  # the skid frame module tag

# ── 7b. CAD-INSPECTION colour palette by part TYPE (INSPECT=1) ──────────────
# A SEPARATE, flat-matte, light-mode palette used ONLY by render_inspection().
# The production SHAPE_MAT above is tuned for the dark navy PDF deck (saturated +
# metallic) which reads muddy on a light CAD background. These are solid, low-
# saturation, distinct-by-type colours so the visual judge reads SHAPE by
# silhouette, not gloss. sRGB tuples; make_mat handles linear conversion.
# Keyed by the classifier's `shape` (the per-part result already computed) so it
# is UNIVERSAL — any archetype's parts colour by their resolved type, no per-
# class hand-coding. All low metallic + mid-high roughness = matte.
INSPECT_TYPE_COLOUR = {
    "tall_column":       (0.74, 0.77, 0.82),   # columns/towers = light steel grey
    "tall_vessel":       (0.42, 0.55, 0.72),   # reactors = blue-steel
    "vertical_vessel":   (0.30, 0.66, 0.66),   # drums/separators/HX = teal
    "horizontal_vessel": (0.30, 0.66, 0.66),   # drums/separators/HX = teal
    "tank":              (0.48, 0.66, 0.48),   # tanks/storage = muted green
    "stack":             (0.66, 0.68, 0.72),   # stacks read as light steel grey
    "compressor":        (0.56, 0.58, 0.62),   # machines = mid grey
    "pump":              (0.56, 0.58, 0.62),   # machines = mid grey
    "package_box":       (0.80, 0.72, 0.56),   # fired/bed packages = tan
    "skid_box":          (0.62, 0.64, 0.68),   # machines/skids = mid grey
    "transformer_box":   (0.56, 0.58, 0.62),   # electrical machine = mid grey
    "cabinet":           (0.56, 0.58, 0.62),   # electrical cabinet = mid grey
    "cabinet_small":     (0.56, 0.58, 0.62),   # electrical cabinet = mid grey
    "gantry":            (0.86, 0.86, 0.88),   # structure = very light grey
    "inline_spool":      (0.30, 0.66, 0.66),   # inline HX/mixer = teal
    "instrument":        (0.95, 0.60, 0.18),   # instruments/valves = orange
    "box":               (0.70, 0.72, 0.74),   # generic = light grey
}
# Bed/dryer/filter family = TAN. These resolve to the vertical_vessel shape, so
# they cannot be separated by `shape` alone; render_inspection re-keys a part to
# this tan when its NAME marks it as a packed bed / dryer / filter / adsorber.
INSPECT_BED_COLOUR    = (0.80, 0.72, 0.56)   # beds/dryers/filters = tan
INSPECT_BED_RE = re.compile(
    r"\b(dryer|drier|guard[- ]?bed|\bbed\b|adsorber|adsorption|molecular[- ]?sieve|"
    r"coalescer|\bfilter\b|\bguard\b|desulph|desulf|reformer\s+bed|catalyst\s+bed)\b",
    re.IGNORECASE,
)
INSPECT_DEFAULT_COLOUR = (0.72, 0.74, 0.76)  # unmatched part → neutral light grey
# Access / connection STEEL (platforms, caged ladders, nozzle stubs, manways) —
# a deliberate mid structural-grey so these read as INTENTIONAL steelwork, NOT as
# the neutral "unmatched" default. Darker + more neutral than INSPECT_DEFAULT so
# the eye separates "platform/ladder steel" from a genuinely-unmatched helper.
# (Task 2026-06-11 process-plant polish: the ladder hoops/stringers + topology
# nozzle stubs were landing in the unmatched bucket; the vessel-prefixed platform
# rings + vessel nozzles were inheriting the vessel skin. Both should be steel.)
INSPECT_ACCESS_STEEL_COLOUR = (0.58, 0.60, 0.63)
# Object-name TOKENS that mark a mesh as access/connection steel, regardless of
# which vessel prefix it carries. Matched as a SUBSTRING of the object name in
# apply_inspection_materials BEFORE the part-prefix equipment fallback, so the
# vessel-prefixed decorations (u_<vessel>_platform_*/_platrail_/_neck/_flange/
# _manway/_ntop/_nbot) get steel instead of the vessel colour, and the
# non-part-owned ladder/stub prefixes (u_ladhoop_/u_ladstr_/u_stub_) leave the
# unmatched bucket. Universal — every process plant grows these from the same
# helpers (_add_platforms_and_ladder / _spawn_nozzle_stub / _add_vessel_nozzles).
INSPECT_ACCESS_STEEL_RE = re.compile(
    r"u_ladhoop_|u_ladstr_|u_stub_|"          # caged-ladder + routing nozzle stubs
    r"_platform_|_platrail_|"                  # access platform ring + its handrail
    r"_neck\b|_flange\b|_manway\b|_ntop\b|_nbot\b|"  # vessel nozzle stubs + manway
    r"_port_|_term_|"                          # STAGE-2 connection-port stubs + terminal markers
    r"_cover\b|_handrail\b|_windgirder\b|_post_|_plinth\b|_rim\b|_centredrain\b",  # tank roof + handrail +
    # wind-girder + posts + plinth → steel, so a tank reads as engineered (grey roof
    # rim + rail on the green shell) instead of a featureless green blob. Universal.
)


# ═══════════════════════════════════════════════════════════════════════════
# Dimension parsing
# ═══════════════════════════════════════════════════════════════════════════

def _num(s):
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def parse_dimension(dim_value):
    """Parse a dimension string → a normalised dict in MM. Recognises:
      "<W> m dia x <H> m"  → cylinder  {kind:cyl, dia_mm, len_mm}
      "<a>x<b>x<c> mm"     → box       {kind:box, w_mm,d_mm,h_mm}
      "<a> m² area"        → area      {kind:area, area_m2}
      "<a> m stack dia"    → cyl with only dia  {kind:cyl, dia_mm}
    Returns None if nothing usable. Accepts ASCII x and Unicode × / ×.
    """
    if not dim_value:
        return None
    s = str(dim_value).strip().lower().replace("×", "x").replace("·", ".")

    # area, e.g. "15 m² area" / "15 m2 area"
    if "m²" in dim_value or re.search(r"m2\b", s) or "area" in s:
        a = _num(s)
        if a is not None:
            return {"kind": "area", "area_m2": a}

    # "<dia> m dia x <len> m"  (cylinder with two figures)
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*m\s*dia(?:meter)?\s*x\s*(-?\d+(?:\.\d+)?)\s*m", s)
    if m:
        return {"kind": "cyl", "dia_mm": float(m.group(1)) * 1000,
                "len_mm": float(m.group(2)) * 1000}

    # "<dia> m dia"  / "<dia> m stack dia"  (single diameter only)
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*m\s*(?:stack\s*)?dia", s)
    if m:
        return {"kind": "cyl", "dia_mm": float(m.group(1)) * 1000}

    # "<a>x<b>x<c> mm"  (box, millimetres)
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*mm", s)
    if m:
        return {"kind": "box", "w_mm": float(m.group(1)), "d_mm": float(m.group(2)),
                "h_mm": float(m.group(3))}

    # "<a> x <b> mm"  (TWO-figure box, millimetres) — the common DEVICE datasheet
    # footprint (e.g. the edge-AI GPU card "267 x 111 mm", an insulin-pump board).
    # Read as a flat plate: w × d × a thin default height so a small device part
    # gets a real footprint instead of falling to the type-default box.
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*mm", s)
    if m:
        w = float(m.group(1))
        d = float(m.group(2))
        return {"kind": "box", "w_mm": w, "d_mm": d,
                "h_mm": max(8.0, min(w, d) * 0.5)}

    # generic "<a> m x <b> m" without 'dia' → treat as cyl dia × length
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*m\s*x\s*(-?\d+(?:\.\d+)?)\s*m", s)
    if m:
        return {"kind": "cyl", "dia_mm": float(m.group(1)) * 1000,
                "len_mm": float(m.group(2)) * 1000}
    return None


def parse_quantity(qty_value):
    """'x2' / '×25' / 'x1' → int. Default 1."""
    if not qty_value:
        return 1
    m = re.search(r"\d+", str(qty_value))
    return int(m.group()) if m else 1


# ═══════════════════════════════════════════════════════════════════════════
# Part extraction
# ═══════════════════════════════════════════════════════════════════════════

class Part:
    """A physical, renderable part resolved from a word."""
    __slots__ = ("name", "module_id", "region_key", "region_rank",
                 "shape", "dim", "qty", "form", "match_tokens",
                 "obj_anchor", "placed_xyz_mm", "anchors", "ports", "_consolidated")

    def __init__(self, name, module_id, region_key, region_rank, shape, dim, qty, form):
        self.name = name
        self.module_id = module_id
        self.region_key = region_key
        self.region_rank = region_rank
        self.shape = shape
        self.dim = dim
        self.qty = qty
        self.form = form
        self.match_tokens = tokenise(name)
        self.obj_anchor = None        # (assembly dict) once placed
        self.placed_xyz_mm = None     # CENTRE anchor (mm) for legacy bbox/routing
        self.anchors = None           # {"top","bottom","centre"} (mm) for nozzle routing
        self.ports = None             # {"<service>_<dir>": (x,y,z) mm} — STAGE 2 named
        #                               connection ports (set by add_connection_ports);
        #                               the stub-TIP for a fluid port, the terminal face
        #                               for a power/signal port. Stage 3 reads these.


STOPWORDS = {"the", "a", "an", "and", "or", "of", "for", "to", "with", "on",
             "in", "per", "each", "duty", "standby", "line", "item",
             "replaceable", "system", "unit", "package", "skid", "process"}


def tokenise(text):
    """Lower-case discriminating tokens (drop stopwords + short noise)."""
    toks = re.split(r"[^a-z0-9]+", str(text).lower())
    return [t for t in toks if t and t not in STOPWORDS and len(t) > 1]


# Explicit SMALL-DEVICE nouns: when the part's NAME ends in one of these the part
# IS that device — a "reactor pressure-relief valve" is a VALVE, not a reactor; a
# "storage N2 blanketing valve" is a valve, not a tank; a "variable-frequency
# drive (compressors)" is a DRIVE cabinet, not a compressor. These win over the
# big-vessel keywords that the upstream qualifier word would otherwise trigger.
# Tested as the LAST noun (head word) of the name so a qualifier never hijacks.
_DEVICE_HEAD_RE = [
    (r"(relief|control|shutdown|blanketing|isolation|block|metering)\s+valves?$|"
     r"\bvalves?$|thermowell|transmitters?$|gauges?$|detectors?$|analy[sz]ers?$|"
     r"\bprobes?$|\bsensors?$", "instrument"),
    (r"frequency\s+drives?\b|\bvfd\b|\bdrives?$", "cabinet_small"),
    (r"i/?o\s+cards?$|\bcards?$", "box"),
]


def _name_head(name):
    """The classification target = the part NAME with any parenthetical context
    stripped (e.g. 'VFD (compressors)' → 'VFD'). Form prose is deliberately NOT
    used: it routinely names other equipment ('protects the feed compressor',
    'mixes the reactor feed') which hijacks the shape — the same false-match
    class NON_PHYSICAL_RE already documents. The engineer's NAME is the identity."""
    return re.sub(r"\([^)]*\)", " ", str(name)).strip().lower()


_INSTRUMENT_SHAPE_MODULES = ("sensing_instrumentation", "safety_protection",
                             "control_compute_communication")


def classify_shape(name, form, module_id=""):
    # 0. I&C / control / safety parts are small DEVICES — a level switch, an analyser, a
    #    relay — NEVER vessels, even when the name carries a vessel noun ("LOX TANK Level +
    #    Low Alarm" is a level sensor, not a 3.7 m tank; "UV Transmittance Monitor" is not a
    #    vessel). The module is the authority over the misleading name (Tristan 2026-06-22:
    #    "there is a problem with the dimensions … whether things are cylinders or rectangles").
    if module_id in _INSTRUMENT_SHAPE_MODULES:
        return "instrument"
    head = _name_head(name)
    # 1. explicit small-device head nouns win (anti-qualifier-hijack)
    for pattern, kind in _DEVICE_HEAD_RE:
        if re.search(pattern, head):
            return kind
    # 2. otherwise the ordered shape rules, on the NAME ONLY (not the form prose)
    for pattern, kind in SHAPE_RULES:
        if re.search(pattern, head):
            return kind
    return DEFAULT_SHAPE


def region_rank_for(display_name, module_id):
    """Process-flow rank from the module display name / id. Lower = upstream.
    The Mx prefix (M1..M8) in the display name is the strongest signal — it IS
    the engineer's intended process order — so honour it first, then fall back
    to keyword priority."""
    m = re.match(r"\s*m(\d+)\b", str(display_name).lower())
    if m:
        return int(m.group(1)) * 10  # M1→10, M2→20 … preserves authored order
    blob = f"{display_name} {module_id}".lower()
    for pattern, rank in REGION_PRIORITY:
        if re.search(pattern, blob):
            return rank
    return REGION_PRIORITY_DEFAULT


def extract_parts(state):
    """Walk modules→sub_modules→words; return (parts, dropped, stats)."""
    parts, dropped = [], []
    modules = state.get("moduleDecomposition", {}).get("modules", [])
    for m in modules:
        module_id = m.get("module", "unknown")
        display = m.get("display_name", module_id)
        # region_key keeps M1/M3 (both mass_fluid_transport) as SEPARATE regions
        region_key = display or module_id
        rank = region_rank_for(display, module_id)
        for s in m.get("sub_modules", []):
            for w in s.get("words", []):
                name = w.get("name_human") or w.get("character_id") or "part"
                mods = w.get("modifier_characters", []) or []
                form = " ".join(mc.get("value", "") for mc in mods
                                if mc.get("kind") == "form")
                # BoM-only sub-components (motor / valve / seal inside an assembly, id
                # 'parent__slug') are DETAIL — not separately-placed equipment. Placing
                # them buries the real plant in tiny boxes; the parent assembly stands for
                # them in the layout, GA and 3D. (They still appear in the bill of materials.)
                if "__" in str(w.get("id") or "") or "sub-component" in form.lower():
                    dropped.append(name)
                    continue
                # Skeleton hardware padding that slipped the chain's strip is never a GA
                # equipment item (a "Fastener Set" must not render as a 9 m grey box).
                if re.search(r"\bfastener set\b|\bgasket seal\b|\bmounting (bracket|hardware)\b|"
                             r"\bwiring harness\b|\blabelling set\b|\blifting (point|lug)\b|"
                             r"\bnameplate\b|\bearthing boss\b", name, re.I):
                    dropped.append(name)
                    continue
                # Filter on the NAME only (form prose names catalysts/resins on
                # real vessels — see NON_PHYSICAL_RE note).
                if NON_PHYSICAL_RE.search(name):
                    dropped.append(name)
                    continue
                # Accept BOTH "dimension" (singular) and "dimensions" (plural) —
                # real states emit either (the corpus uses ~2:1 singular:plural),
                # so reading only the singular silently dropped the size of many
                # device parts (e.g. the edge-AI GPU card carries "dimensions").
                dim = None
                for mc in mods:
                    if mc.get("kind") in ("dimension", "dimensions"):
                        dim = parse_dimension(mc.get("value"))
                        if dim:
                            break
                qty = 1
                for mc in mods:
                    if mc.get("kind") == "quantity":
                        qty = parse_quantity(mc.get("value"))
                        break
                shape = classify_shape(name, form, module_id)
                parts.append(Part(name, module_id, region_key, rank, shape, dim, qty, form))
    # A qty-N big VESSEL/TANK is replicated DOWNSTREAM in build_part (one Part, N
    # instances drawn as a compact grid, each with a unique object base-name) so the
    # 3D render, the parts-manifest AND every 2D drawing all show N tanks. Replicating
    # the Part HERE was wrong: the manifest unions identically-named instances by
    # name-prefix back into ONE row, so N same-named Parts still collapsed to 1.
    return parts, dropped


# ═══════════════════════════════════════════════════════════════════════════
# GEOMETRY-FAMILY DISPATCH (2026-06-10)
# ───────────────────────────────────────────────────────────────────────────
# The generator's ONE strategy (process-plant, tuned on e-fuel) lays parts out
# as process REGIONS of vessels/machines on an open skid + an overhead pipe
# rack. That is wrong for a battery system: a BESS is ROWS OF RACKS in a
# container, not scattered vessels. detect_geometry_family() picks the strategy
# from the part NAMES (universal — no per-class hand-coding): rack_farm when the
# rack/cabinet vocabulary dominates the vessel/machine vocabulary, else the
# process_plant default. panel_array / aero_body are later stubs (return
# process_plant for now so any unknown archetype still renders).
# ═══════════════════════════════════════════════════════════════════════════

# Vocabulary that marks a RACK-FARM archetype — ROWS OF CABINETS. This is the
# GENERIC rack/cabinet family (battery is ONE flavour; compute/server is another;
# switchgear/generic cabinets a third). It must trigger on a compute SERVER rack
# (GPU/CPU sleds in a chassis) just as it does on a battery rack — both render as
# rows of cabinets — so the battery vocabulary is NO LONGER a precondition.
# Universal — keyed on the cabinet/rack/server NAMES only, no per-class coding.
RACK_FARM_RE = re.compile(
    r"\bcell\b|\bcells\b|\brack\b|\bracks\b|\bmodule\b|\bbattery\b|\bcabinet\b|"
    r"\bserver\b|\bbusbar\b|\bbms\b|\bpcs\b|\binverter\b|\bchassis\b|\bsled\b|"
    r"\bnode\b|blade.?server|rack.?unit|rack.?mount|enclosure.?bay", re.IGNORECASE)
# Vocabulary that marks a PROCESS-PLANT archetype (vessels + rotating machines).
PROCESS_PLANT_RE = re.compile(
    r"\bvessel\b|\bcolumn\b|\breactor\b|\btank\b|\bseparator\b|\bdrum\b|"
    r"\bpump\b|\bcompressor\b|distillation|\babsorber\b", re.IGNORECASE)
# Vocabulary that marks a PANEL-ARRAY / GROW-RACK archetype (vertical farm:
# multi-tier grow racks with LED panels). A vertical farm HAS grow-racks but they
# are NOT battery racks — so the GROW vocabulary (below) gates panel_array, while
# the BATTERY-SPECIFIC vocabulary (cell/battery/bms/pcs/inverter) gates rack_farm.
# The bare "rack"/"module"/"cabinet"/"busbar" tokens are deliberately EXCLUDED
# from the battery test here: a VF legitimately carries a "propagation rack",
# I/O "modules" and a "main earth busbar", none of which make it a battery system.
PANEL_ARRAY_RE = re.compile(
    r"\bgrow\b|\bgrowing\b|\btier\b|\btiers\b|\btray\b|\btrays\b|\bcanopy\b|"
    r"\bled\b|grow.?light|hydroponic|aeroponic|nutrient|fertigation|seedling|"
    r"\bplant\b|cultivation|propagation|horticultur", re.IGNORECASE)
# The BATTERY-SYSTEM gate (strong markers only) — when these dominate the grow
# vocabulary the design is a battery rack farm, NOT a vertical farm, so we suppress
# panel_array and let the rack_farm test decide.
BATTERY_SYSTEM_RE = re.compile(
    r"\bcell\b|\bcells\b|\bbattery\b|\bbms\b|\bpcs\b|\binverter\b|\bbusbar\b",
    re.IGNORECASE)
# The COMPUTE / SERVER rack-farm FLAVOUR discriminator (strong, near-exclusive
# server-hardware markers). When a rack farm's parts hit these, it's a COMPUTE
# rack (rows of SERVER cabinets + cooling/CRAC + PDU + network switch + UPS),
# NOT a battery rack. Tokens chosen to be unique to data-centre/edge compute
# hardware so they don't leak into a battery/switchgear lineup: GPU/EPYC sleds,
# motherboards, DIMMs, NVMe, PCIe risers, BMC/IPMI, SFPnn, 1U/2U/4U chassis.
COMPUTE_RACK_RE = re.compile(
    r"\bserver\b|\bsled\b|blade.?server|rack.?unit|\b[124]u\b|\bgpu\b|"
    r"motherboard|\bdimm\b|\bnvme\b|inference|\bbmc\b|\bipmi\b|\briser\b|"
    r"\bepyc\b|\bpcie\b|\bsfp\d|\bsocket\b", re.IGNORECASE)
# Vocabulary that marks a TOWER-MACHINE archetype (a wind turbine + similar
# tower-mounted rotating machines: tower + nacelle + rotor/blades on a hub + a
# foundation, with a power-conversion BoP lineup at the base). This is a 5th
# geometry family — a turbine is emphatically NOT an aircraft (no fuselage/wing)
# and NOT a process plant. Universal — keyed on the tower/nacelle/rotor NAMES.
TOWER_MACHINE_RE = re.compile(
    r"\btower\b|\bnacelle\b|\brotor\b|\bblade\b|\bblades\b|\bturbine\b|\bhub\b|"
    r"\byaw\b|\bpylon\b|\bmast\b|\bgearbox\b|\bpitch\b", re.IGNORECASE)
# A tower machine must be GROUND-MOUNTED: it needs a tower/foundation present so a
# stray "rotor"/"blade" on a non-turbine (e.g. an edge-server "dual-rotor fan",
# a pump impeller "blade") can never alone route a design to tower_machine.
TOWER_BASE_RE = re.compile(
    r"foundation|\btower\b|monopile|\bpile\b|footing|\bplinth\b|\bbedplate\b",
    re.IGNORECASE)
# DEFINITIVE aircraft markers — a winged air vehicle MUST carry a FUSELAGE/airframe
# AND a WING. A rotor+nacelle with neither is a turbine, not a plane (the wind
# misdetection). Both predicates must hold for is_true_aircraft.
AIRCRAFT_FUSELAGE_RE = re.compile(
    r"fuselage|airframe|monocoque|tail.?boom|\bempennage\b|\bgondola\b|aerostat",
    re.IGNORECASE)
AIRCRAFT_WING_RE = re.compile(
    r"\bwing\b|\bspar\b|\baileron\b|\belevon\b|wing.?rib|wing.?skin", re.IGNORECASE)
# DEFINITIVE spacecraft markers — a satellite carries a BUS + SOLAR-ARRAY +
# THRUSTER/reaction-wheel constellation. Require ≥2 distinct such markers so a
# stray "main bus contactor" / "lighting bus cable" never reads as a spacecraft.
SPACECRAFT_DEF_RE = re.compile(
    r"\bbus\b|solar.?array|\bthruster\b|reaction.?wheel|magnetorquer|"
    r"star.?tracker|propellant|bus.?structure|thrust.?tube|separation.?ring|"
    r"\bespa\b|sun.?sensor|\bdeorbit\b|drag.?sail|\bmli\b|radiator.?panel",
    re.IGNORECASE)
# Vocabulary that marks an AERO-BODY archetype (a flight vehicle — aircraft or
# spacecraft — that flies in FREE SPACE, never sits in a skid/container/grow room).
# This must WIN over the industrial rack/vessel markers for a HAPS solar aircraft
# (whose BoM legitimately carries "battery"/"cell"/"module" words that would
# otherwise pull it into rack_farm) and a satellite (whose "bus"/"module"/"panel"
# would scatter as industrial boxes). Universal — keyed on part NAMES + module ids,
# no per-class hand-coding.
AERO_BODY_RE = re.compile(
    r"fuselage|\bwing\b|empennage|\btail\s?boom\b|\bv-?tail\b|propeller|\brotor\b|"
    r"airframe|nacelle|\bspar\b|aerostat|gondola|solar.?array|solar.?laminate|"
    r"payload|\bbus\b|reaction.?wheel|thruster|antenna|deployable|satellite|"
    r"spacecraft|avionics|aileron|elevon|gimbal|magnetorquer|star.?tracker|"
    r"\bpitot\b|propellant|drag.?sail|\bnacelle\b|monocoque|flight.?control",
    re.IGNORECASE)
# Sub-type split: AIRCRAFT (a winged / propeller-driven / aerostat air vehicle)
# vs SPACECRAFT (a bus-centred satellite with arrays/thrusters/reaction wheels).
AERO_AIRCRAFT_RE = re.compile(
    r"\bwing\b|fuselage|propeller|\brotor\b|empennage|aerostat|gondola|airframe|"
    r"\bv-?tail\b|\btail\s?boom\b|nacelle|\bspar\b|\belevon\b|aileron|\bpitot\b|"
    r"\bpylon\b|monocoque|landing.?skid", re.IGNORECASE)
AERO_SPACECRAFT_RE = re.compile(
    r"\bbus\b|reaction.?wheel|thruster|solar.?array|payload.?bay|deployable|"
    r"satellite|spacecraft|magnetorquer|star.?tracker|propellant|drag.?sail|"
    r"thrust.?tube|espa|separation.?ring|sun.?sensor|deorbit|\bxenon\b|hydrazine|"
    r"radiator.?panel|\bmli\b", re.IGNORECASE)


# ── RACK-STRUCTURE vs BATTERY-CHEMISTRY split (2026-06-11) ──────────────────
# A real RACK FARM is dominated by physical RACK/CABINET/SERVER STRUCTURE parts
# (the cabinets the rows are made of). The BATTERY-CHEMISTRY tokens (cell/battery/
# bms/pcs/module) leak into many NON-rack archetypes — an AGV traction battery, an
# insulin-pump cell, a robot field "module" — and were hijacking those devices into
# rack_farm. So the rack_farm GATE keys on STRUCTURE parts (this regex), not on the
# chemistry markers. "module"/"node" are deliberately EXCLUDED here (too generic —
# an I/O "module" is not a rack); a genuine server uses chassis/sled/rack/blade.
RACK_STRUCT_RE = re.compile(
    r"\brack\b|\bracks\b|\bcabinet\b|\bserver\b|\bsled\b|\bchassis\b|"
    r"blade.?server|rack.?unit|rack.?mount|enclosure.?bay", re.IGNORECASE)
# REQUIRED process-plant VESSEL vocabulary (task 2026-06-11): process_plant must
# REQUIRE genuine vessel vocab to fire — NOT bare pump/compressor (those are
# machines that appear in robots/AUVs/AGVs too). "contactor" is EXCLUDED (an
# electrical contactor is not a vessel). A real plant has MANY vessels; a lone
# "trim tank" on an AUV must NOT make it a process plant — so the gate counts
# DISTINCT vessel-named parts and needs ≥ PROCESS_VESSEL_MIN_DISTINCT of them.
PROCESS_VESSEL_RE = re.compile(
    r"\bvessel\b|\bcolumn\b|\breactor\b|\btank\b|\bseparator\b|\bdrum\b|"
    r"distillation|\babsorber\b|\bstripper\b|crystalli|\bscrubber\b|"
    r"\bcondenser\b|\breboiler\b|\bcoalescer\b|fractionat|\bevaporator\b|"
    r"\bflash\b|\bdigester\b|\bclarifier\b|\bcyclone\b|\bhydrocyclone\b",
    re.IGNORECASE)
PROCESS_VESSEL_MIN_DISTINCT = 2   # a plant has ≥2 distinct vessels; 1 ≠ a plant
# product_class tokens that mark a RACK/SERVER/STORAGE archetype — the secondary
# signal that lets a THIN state (generic part names, no rack vocab) still route to
# rack_farm, e.g. the compute-heat-module state whose part names are placeholders
# ("Main Controller", "Power Converter") but whose product_class IS the signal.
RACK_CLASS_RE = re.compile(
    r"compute|server|gpu|data.?cent|edge.?ai|edge_ai|inference|hpc|"
    r"battery|bess|energy.?storage|storage|ups|switchgear|\brack\b|"
    r"telecom|datacenter", re.IGNORECASE)
# product_class / vocab that marks a COMPUTE rack (vs a battery rack) — used by the
# rack-FLAVOUR resolver so a GPU/compute brick reads as a SERVER rack even when its
# part names lack the strong server-hardware vocab (the compute-heat-module case).
COMPUTE_CLASS_RE = re.compile(
    r"compute|server|gpu|data.?cent|edge.?ai|edge_ai|inference|hpc|"
    r"datacenter|\bhsm\b|telecom", re.IGNORECASE)
# product_class / vocab that marks a BATTERY rack flavour explicitly.
BATTERY_CLASS_RE = re.compile(
    r"battery|bess|energy.?storage|\bups\b|\bess\b", re.IGNORECASE)
# MARINE / SUBMERSIBLE markers (mirrors gate-34 isMarineClass) — an AUV/ROV/UUV
# legitimately carries "thruster" + "ballast" + a "tank", which were tripping the
# AERO (thruster→spacecraft) and PROCESS-PLANT (tank→plant) gates. When these lead,
# the design is a marine vehicle → it must reach GENERIC ASSEMBLY, not aero/plant.
MARINE_RE = re.compile(
    r"\bhull\b|pressure.?hull|subsea|\bauv\b|\buuv\b|\brov\b|submar|underwater|"
    r"torpedo|\bballast\b|drop.?weight|bathyal|\bsonar\b|\bdvl\b|"
    r"wet.?mate|seawater|buoyan|\bbilge\b|syntactic.?foam|"
    r"acoustic.?modem|pressure.?compensat",
    re.IGNORECASE)
# NOTE: 'thruster' + 'fairing' are deliberately EXCLUDED from MARINE_RE — a
# SATELLITE legitimately carries 'electric-propulsion thruster' / 'monopropellant
# thruster' (2 hits) and an aircraft a 'fairing', so keying marine on them would
# steal a satellite from aero. The submersible markers above (hull / subsea /
# ballast / sonar / DVL / wet-mate / seawater / buoyancy / syntactic-foam /
# acoustic-modem) are unambiguous: a satellite has ZERO; an AUV has many.
MARINE_CLASS_RE = re.compile(
    r"auv|uuv|\brov\b|submar|subsea|underwater|torpedo|\bsonar\b|marine|"
    r"bathyal|\bglider\b", re.IGNORECASE)


def product_class_of(state):
    """The design's product_class, tried across the four places a state may carry
    it (parsedBrief → moduleDecomposition → orchestratorContract → keyMetrics),
    lower-cased. '' when absent. Used by the family gates as the SECONDARY signal
    (the part NAMES remain the primary signal) so a thin state still routes well."""
    if not isinstance(state, dict):
        return ""
    for holder in ("parsedBrief", "moduleDecomposition", "orchestratorContract",
                   "keyMetrics"):
        pc = (state.get(holder) or {}).get("product_class")
        if pc:
            return str(pc).lower()
    return ""


def detect_aero_subtype(parts, modules):
    """Classify an AERO-BODY design as 'aircraft' or 'spacecraft' from the part
    NAMES + the module display names/ids (universal — no per-class hand-coding).
    Aircraft vocab (wing/fuselage/propeller/empennage/aerostat/airframe) vs
    spacecraft vocab (bus/reaction-wheel/thruster/solar-array/satellite). Returns
    (subtype, aircraft_hits, spacecraft_hits). Ties → 'aircraft' (a winged air
    vehicle is the more common visual default; a true satellite always carries the
    strong spacecraft markers and wins decisively)."""
    blob_extra = " ".join(
        f"{m.get('display_name') or ''} {m.get('module') or ''}" for m in (modules or []))
    air = sum(1 for p in parts if AERO_AIRCRAFT_RE.search(str(p.name)))
    spc = sum(1 for p in parts if AERO_SPACECRAFT_RE.search(str(p.name)))
    # the module ids are a strong signal too (aerodynamic_wing / propulsion_motor_prop
    # vs energy_conversion_transduction + the satellite_smallsat tells in names)
    air += len(AERO_AIRCRAFT_RE.findall(blob_extra))
    spc += len(AERO_SPACECRAFT_RE.findall(blob_extra))
    subtype = "spacecraft" if spc > air else "aircraft"
    return subtype, air, spc


def _distinct_hits(parts, rx):
    """Count DISTINCT part NAMES that match `rx` (a part repeated under the same
    name counts once). Used where a 'how many different cues' threshold matters —
    e.g. panel_array needs ≥2 DISTINCT grow/cultivation cues so a single stray
    'LED indicator' on a compute server never mis-routes a non-farm to a grow room."""
    seen = set()
    for p in parts:
        nm = str(p.name)
        if rx.search(nm):
            seen.add(nm.lower())
    return len(seen)


def is_true_aircraft(parts):
    """A design is a real winged AIRCRAFT only if its parts carry BOTH a fuselage/
    airframe marker AND a wing marker. Deterministic gate that stops a wind turbine
    (rotor + nacelle + blades, no fuselage/wing) reading as a plane."""
    has_fuse = any(AIRCRAFT_FUSELAGE_RE.search(str(p.name)) for p in parts)
    has_wing = any(AIRCRAFT_WING_RE.search(str(p.name)) for p in parts)
    return has_fuse and has_wing


def is_true_spacecraft(parts):
    """A design is a real SPACECRAFT only if ≥2 DISTINCT bus/solar-array/thruster
    markers are present, so an isolated 'bus' word (a contactor / cable) on a
    non-spacecraft never reads as a satellite."""
    return _distinct_hits(parts, SPACECRAFT_DEF_RE) >= 2


def detect_rack_flavour(parts, product_class=""):
    """Sub-flavour of a rack farm: 'battery' | 'compute' | 'generic'. Picks the
    flavour whose vocabulary dominates the parts: BATTERY when battery-system
    markers (cell/battery/bms/pcs) lead, COMPUTE when server-hardware markers
    (GPU/EPYC/DIMM/NVMe/PCIe/1U chassis) lead, else GENERIC (bare rack/cabinet
    rows). Deterministic + universal — no per-class hand-coding. Returns
    (flavour, battery_hits, compute_hits).

    The product_class is a STRONG override (2026-06-11): a GPU / compute brick
    whose part NAMES are thin placeholders ('Main Controller', 'Inverter Bridge'
    — no server vocab) still reads COMPUTE because its product_class IS the signal
    (the compute-heat-module case, which had 0 compute markers + 2 incidental
    battery markers 'Inverter Bridge'/'Distribution Busbar' and so flipped to
    battery). A class compute-token forces compute; a class battery-token (with no
    compute token) forces battery. Part-name markers decide only when the class is
    silent/ambiguous."""
    batt = sum(1 for p in parts if BATTERY_SYSTEM_RE.search(str(p.name)))
    comp = sum(1 for p in parts if COMPUTE_RACK_RE.search(str(p.name)))
    pc = str(product_class or "")
    class_compute = bool(COMPUTE_CLASS_RE.search(pc))
    class_battery = bool(BATTERY_CLASS_RE.search(pc)) and not class_compute
    # 1. product_class is authoritative when it names the flavour.
    if class_compute:
        flavour = "compute"
    elif class_battery:
        flavour = "battery"
    # 2. else the part-name markers (original behaviour).
    elif comp > batt:
        flavour = "compute"
    elif batt > 0:
        flavour = "battery"
    else:
        flavour = "generic"
    return flavour, batt, comp


_RACK_FLAVOUR = None    # set by detect_geometry_family; read by main() / placer


def detect_geometry_family(parts, modules, product_class=""):
    """Return the geometry FAMILY for this design — one of 'aero_body',
    'tower_machine', 'panel_array', 'rack_farm', 'process_plant' or the universal
    'generic_assembly' default. Heuristic on the physical part NAMES (universal —
    no per-class hand-coding), with product_class as a SECONDARY signal. Precedence
    (first match wins), each guarded so a stray token can't mis-route:

      1. aero_body (FLIGHT VEHICLE in FREE SPACE) — a TRUE aircraft (fuselage AND
         wing) or a TRUE spacecraft (≥2 distinct bus/solar-array/thruster markers),
         the aero vocabulary leads, AND the design is NOT marine. The fuselage∧wing
         / multi-spacecraft gate stops a wind turbine (rotor + nacelle, no fuselage/
         wing) grabbing aero; the MARINE guard stops an AUV (whose 'thruster' words
         trip the spacecraft gate) reading as a satellite.
      2. tower_machine (WIND TURBINE) — tower/nacelle/rotor/blade/turbine/hub/yaw
         present AND a tower/foundation present (ground-mounted), AND not a flight
         vehicle. A free-standing tower + nacelle + rotor + blades + foundation.
      3. panel_array (VF grow-rack) — ≥2 DISTINCT grow/cultivation cues AND grow
         leads battery. The ≥2-distinct gate stops a stray 'LED indicator'/'plant'.
      4. rack_farm (ROWS OF CABINETS — battery | compute | generic) — REQUIRES
         genuine RACK STRUCTURE: the rack/cabinet/server vocabulary leads the
         vessels AND (≥RACK_STRUCT_MIN actual rack/cabinet/server-structure parts
         are present OR the product_class names a rack/server/storage archetype).
         The STRUCTURE requirement is the 2026-06-11 breadth fix: the bare battery-
         chemistry tokens (cell/battery/bms/module) used to hijack an AGV traction
         battery / an insulin-pump cell / a robot 'module' into a battery rack farm;
         now a device with 1-2 incidental battery parts but no real racks falls
         through to generic_assembly. compute-heat (thin part names, 0 structure)
         still routes via its product_class.
      5. process_plant — REQUIRES genuine vessel vocab: ≥PROCESS_VESSEL_MIN_DISTINCT
         DISTINCT vessel-named parts (vessel/column/reactor/tank/separator/drum/
         distillation/absorber/stripper/scrubber/…). A lone 'trim tank' on an AUV
         no longer makes it a plant; a real plant has many vessels.
      6. generic_assembly — the TRUE universal default for ANY archetype that fits
         no specific family (robot, AUV, small device, vehicle): the parts laid out
         grouped by MODULE region, each as its classified shape or a neutral sized
         box, connected by the shared topology router. NOT wrong vessels, NOT vomit.

    Logs the decision + per-family hit counts (+ aero subtype / rack flavour).
    Deterministic + universal."""
    pc = str(product_class or "")
    aero_hits = sum(1 for p in parts if AERO_BODY_RE.search(str(p.name)))
    grow_hits = sum(1 for p in parts if PANEL_ARRAY_RE.search(str(p.name)))
    grow_distinct = _distinct_hits(parts, PANEL_ARRAY_RE)
    batt_hits = sum(1 for p in parts if BATTERY_SYSTEM_RE.search(str(p.name)))
    rack_hits = sum(1 for p in parts if RACK_FARM_RE.search(str(p.name)))
    struct_hits = sum(1 for p in parts if RACK_STRUCT_RE.search(str(p.name)))
    proc_hits = sum(1 for p in parts if PROCESS_PLANT_RE.search(str(p.name)))
    vessel_distinct = _distinct_hits(parts, PROCESS_VESSEL_RE)
    tower_hits = sum(1 for p in parts if TOWER_MACHINE_RE.search(str(p.name)))
    tower_grounded = any(TOWER_BASE_RE.search(str(p.name)) for p in parts)
    # RACK-FARM evidence: real rack STRUCTURE present, or the class names a rack.
    rack_class = bool(RACK_CLASS_RE.search(pc))
    rack_evidence = struct_hits >= RACK_STRUCT_MIN or rack_class
    true_aircraft = is_true_aircraft(parts)
    true_spacecraft = is_true_spacecraft(parts)
    # MARINE: a submersible vehicle leads with hull/ballast/sonar/subsea markers,
    # or its product_class says so. Stops a marine AUV (whose 'thruster' words trip
    # the loose true_spacecraft gate, and whose 'trim tank' trips the plant gate)
    # reading as a satellite or a process plant. MARINE_RE is thruster-free, so a
    # satellite scores 0 unambiguous marine markers and is NEVER marine; an AUV
    # scores many (hull / subsea / ballast / sonar / DVL / syntactic-foam / …).
    # When is_marine, the aero + plant gates are suppressed (see below) and the AUV
    # falls through to generic_assembly — a submarine, not a satellite/plant.
    marine_hits = sum(1 for p in parts if MARINE_RE.search(str(p.name)))
    is_marine = bool(MARINE_CLASS_RE.search(pc)) or marine_hits >= 2
    subtype = None
    flavour = None
    air_h = spc_h = 0

    # 1. AERO — DEFINITIVE flight-vehicle signature, aero leads, NOT marine.
    if (true_aircraft or true_spacecraft) and aero_hits > 0 and not is_marine \
            and aero_hits >= rack_hits and aero_hits >= proc_hits \
            and aero_hits >= grow_hits and aero_hits >= tower_hits:
        family = "aero_body"
        subtype, air_h, spc_h = detect_aero_subtype(parts, modules)
        if true_spacecraft and not true_aircraft:
            subtype = "spacecraft"
        elif true_aircraft and not true_spacecraft:
            subtype = "aircraft"
    # 2. TOWER MACHINE — turbine vocab + a ground tower/foundation, not a flight
    #    vehicle, not marine (a tidal-kite stays tower; an AUV does not).
    elif tower_hits > 0 and tower_grounded \
            and not (true_aircraft or true_spacecraft) and not is_marine \
            and tower_hits >= proc_hits and tower_hits >= grow_hits:
        family = "tower_machine"
    # 3. PANEL ARRAY (VF) — ≥2 DISTINCT grow cues + grow leads battery.
    elif grow_distinct >= 2 and grow_hits > batt_hits and grow_hits >= proc_hits:
        family = "panel_array"
    # 4. RACK FARM — rack vocab leads vessels AND genuine rack STRUCTURE present
    #    (≥RACK_STRUCT_MIN structure parts) OR the class names a rack/server. The
    #    structure requirement stops a device's incidental battery/cell/module
    #    tokens routing it here.
    elif rack_hits > proc_hits and rack_evidence:
        family = "rack_farm"
        flavour, _bh, _ch = detect_rack_flavour(parts, pc)
    # 5. PROCESS PLANT — REQUIRES ≥PROCESS_VESSEL_MIN_DISTINCT distinct vessels,
    #    and NOT marine (an AUV's ballast/trim tanks are not a process plant).
    elif vessel_distinct >= PROCESS_VESSEL_MIN_DISTINCT and not is_marine:
        family = "process_plant"
    # 6. GENERIC ASSEMBLY — the universal default for any unmatched archetype.
    else:
        family = "generic_assembly"

    print(f"[univ] geometry family = {family}"
          + (f" / {subtype}" if subtype else "")
          + (f" / {flavour}" if flavour else "") + "  "
          f"(product_class={pc or '∅'}; "
          f"aero/flight-vehicle = {aero_hits}, "
          f"tower-machine = {tower_hits} [grounded={tower_grounded}], "
          f"grow/panel = {grow_hits} (distinct {grow_distinct}), "
          f"battery-system = {batt_hits}, "
          f"rack/cabinet/server = {rack_hits} (structure {struct_hits}, "
          f"rack_class={rack_class}), "
          f"vessel = {proc_hits} (distinct {vessel_distinct}), "
          f"marine = {marine_hits} (is_marine={is_marine}), "
          f"of {len(parts)} physical parts; "
          f"true_aircraft={true_aircraft}, true_spacecraft={true_spacecraft})")
    if subtype:
        print(f"[univ] aero subtype = {subtype} "
              f"(aircraft markers = {air_h}, spacecraft markers = {spc_h})")
    if flavour:
        _fl, bh, ch = detect_rack_flavour(parts, pc)
        print(f"[univ] rack flavour = {flavour} "
              f"(battery markers = {bh}, compute/server markers = {ch}, "
              f"class={pc or '∅'})")
    # stash the subtype + flavour module-level so main() can pass them to the
    # placer without changing detect_geometry_family's single-return contract.
    global _AERO_SUBTYPE, _RACK_FLAVOUR
    _AERO_SUBTYPE = subtype
    _RACK_FLAVOUR = flavour
    return family


# Minimum number of genuine rack/cabinet/server-STRUCTURE parts for rack_farm to
# fire on STRUCTURE evidence alone (BESS≈13, edge-AI≈6 qualify; a device with 1-2
# incidental rack/cabinet words does NOT). A thin compute state with 0 structure
# still routes via its product_class (rack_class). Tuned 2026-06-11.
RACK_STRUCT_MIN = 3


_AERO_SUBTYPE = None   # set by detect_geometry_family; read by main() at dispatch


def qval(quantities, key, default=None):
    """Read a numeric value from the orchestratorContract.quantities map, which
    stores each quantity as {"value": N, "unit": …, …}. Returns the float value
    or `default` if absent/unparseable. Tolerates a bare number too (older
    state shapes). Universal helper used by the rack-farm placer to derive the
    rack grid from the engineering contract (rack_count, cells_per_rack, …)."""
    if not isinstance(quantities, dict):
        return default
    q = quantities.get(key)
    if q is None:
        return default
    if isinstance(q, dict):
        q = q.get("value")
    try:
        return float(q)
    except (TypeError, ValueError):
        return default


# ═══════════════════════════════════════════════════════════════════════════
# Region ordering — topological sort of fluid_loop edges, then rank fallback
# ═══════════════════════════════════════════════════════════════════════════

def order_regions(parts, topology):
    """Return region_keys ordered left→right in process flow.

    Primary signal: the authored Mx rank (already in part.region_rank).
    Refinement: where the fluid_loop topology connects parts in regions A→B and
    that disagrees with the rank tie, the topo direction breaks the tie. We keep
    it simple + robust: sort by (rank, first-appearance), which for this data
    already equals the true flow. Topology is used to VALIDATE/log, and as the
    tie-break when two regions share a rank.
    """
    # stable first-appearance index per region
    order_seen = {}
    for i, p in enumerate(parts):
        order_seen.setdefault(p.region_key, i)
    region_rank = {p.region_key: p.region_rank for p in parts}

    # Build a region adjacency from fluid_loop edges (A region → B region) to
    # break rank ties deterministically.
    name_to_region = {}
    for p in parts:
        name_to_region[p.region_key] = name_to_region.get(p.region_key, p.region_key)
    # map a part to its region for edge resolution
    def region_of_partname(pname):
        best = None
        toks = tokenise(pname)
        for p in parts:
            score = token_overlap(toks, p.match_tokens)
            if score > 0 and (best is None or score > best[0]):
                best = (score, p.region_key)
        return best[1] if best else None

    region_edges = set()
    for e in topology:
        if e.get("mechanism") != "fluid_loop":
            continue
        ra = region_of_partname(e.get("from_part", ""))
        rb = region_of_partname(e.get("to_part", ""))
        if ra and rb and ra != rb:
            region_edges.add((ra, rb))

    def sort_key(rk):
        return (region_rank.get(rk, REGION_PRIORITY_DEFAULT), order_seen.get(rk, 1e9))

    regions = sorted(set(p.region_key for p in parts), key=sort_key)
    return regions, region_edges


# ═══════════════════════════════════════════════════════════════════════════
# UNIVERSAL FLOW-LAYOUT ordering (2026-06-11) — drive the X-position of every
# region from the CONNECTIVITY GRAPH (the explicit topology flow edges), NOT the
# module decomposition. The module rank scatters flow-connected equipment: a
# reactor (energy_conversion module) ends up in a different bank from its feed
# compressor (mass_fluid module) and its product separator (mass_fluid module).
# This orders the regions so each process stage sits ADJACENT to the stage it
# feeds — feed → reaction → separation → upgrading → product as a process TRAIN —
# and pushes the NON-FLOW regions (utilities / electrical / control / instruments
# / structure / safety / packaging — the parts not in the flow graph) to the
# periphery instead of interleaving them through the train. Keyed ONLY on the
# connectivity graph + a rank tie-break; universal, no CO2/e-fuel special case.
# ───────────────────────────────────────────────────────────────────────────
# A flow edge is a fluid OR thermal connection (material/heat actually travels
# between the two stages). electrical_bus is EXCLUDED from the flow train — it is
# a utility DISTRIBUTION bus (a star from the incomer to every motor), not a
# process-train hand-off; the routing engine already draws it as a busway, and
# its endpoints (the electrical-supply region) belong on the periphery.
_FLOW_MECHANISMS = {"fluid_loop", "fluid", "fluid_supply", "fluid_return",
                    "thermal", "steam", "process", "gas", "slurry"}


def flow_order_regions(parts, topology):
    """Order the process regions for the FLOW-LAYOUT (the process-train placement).

    Returns (flow_regions, periphery_regions):
      • flow_regions — the regions that participate in the material/heat flow
        graph, ordered left→right by their FLOW POSITION (a longest-path
        levelling from the sources/feed to the sinks/product, so a stage always
        sits to the RIGHT of every stage that feeds it and DIRECTLY-connected
        stages end up adjacent). Rank + first-appearance break ties so a chain
        the topology leaves undirected (e.g. upgrading→product when no explicit
        edge exists) still follows the authored M-order.
      • periphery_regions — every other region (no flow edge touches it):
        utilities, electrical distribution, control, instrumentation, structure,
        safety, packaging. These go to the BACK row, off the train.

    Deterministic + universal — derived from the connectivity graph, no class
    data. When the topology carries no usable flow edge at all (a design that
    ships only an electrical star, say) flow_regions is empty and the caller
    falls back to the rank order for the whole plant (parts are never dropped)."""
    all_regions = list(dict.fromkeys(p.region_key for p in parts))  # first-appearance
    rank = {p.region_key: p.region_rank for p in parts}
    seen = {rk: i for i, rk in enumerate(all_regions)}

    # Resolve a topology part name onto its region (same token-overlap matcher the
    # rest of the placer uses, with the discriminator guard so h2_* never lands on
    # the CO2 compressor).
    def region_of_partname(pname):
        toks = tokenise(pname)
        best = None
        for p in parts:
            score = token_overlap(toks, p.match_tokens)
            if score > 0 and (best is None or score > best[0]):
                best = (score, p.region_key)
        return best[1] if best else None

    # Build the DIRECTED region flow graph from the flow-mechanism edges. A self
    # edge (both endpoints in the same region) marks that region as a flow region
    # but adds no ordering constraint.
    succ = {rk: set() for rk in all_regions}    # region → regions it feeds
    pred = {rk: set() for rk in all_regions}
    flow_touched = set()                        # regions touched by ANY flow edge
    for e in topology:
        if e.get("mechanism") not in _FLOW_MECHANISMS:
            continue
        ra = region_of_partname(e.get("from_part", ""))
        rb = region_of_partname(e.get("to_part", ""))
        if ra:
            flow_touched.add(ra)
        if rb:
            flow_touched.add(rb)
        if ra and rb and ra != rb:
            succ[ra].add(rb)
            pred[rb].add(ra)

    flow_regions_set = {rk for rk in all_regions if rk in flow_touched}
    periphery = [rk for rk in all_regions if rk not in flow_regions_set]

    if not flow_regions_set:
        return [], all_regions      # no flow graph → caller uses rank order for all

    # LONGEST-PATH LEVELLING from the sources. level[r] = the longest directed
    # chain of flow edges ending at r (so a stage is always to the RIGHT of every
    # stage feeding it). Recycle / return streams create cycles; we break a
    # back-edge by ignoring any predecessor with rank ≥ this region's rank (the
    # recycle compressor that feeds BACK to the reactor has a HIGHER rank, so the
    # forward longest-path is preserved and the loop-back sits NEAR its source).
    INF_GUARD = len(flow_regions_set) + 2
    level = {rk: 0 for rk in flow_regions_set}
    for _ in range(INF_GUARD):                  # relax until stable (DAG depth bound)
        changed = False
        for rk in flow_regions_set:
            for pr in pred[rk]:
                if pr not in flow_regions_set:
                    continue
                if rank.get(pr, REGION_PRIORITY_DEFAULT) > rank.get(rk, REGION_PRIORITY_DEFAULT):
                    continue                    # back-edge (recycle) — skip for level
                if level[pr] + 1 > level[rk]:
                    level[rk] = level[pr] + 1
                    changed = True
        if not changed:
            break

    # WEAKLY-CONNECTED COMPONENTS — keep each connected sub-chain CONTIGUOUS. The
    # explicit topology often omits a hand-off edge between two adjacent process
    # blocks (e.g. e-fuel ships M2→M3 separation and M4→M6 upgrading→product but
    # NO M3→M4 edge), so the two chains are disconnected in the graph. Ordering by
    # bare level would INTERLEAVE them (M1, M4, M2, M6, M3 …) — a scrambled read.
    # Instead we (1) find the connected components, (2) order WITHIN a component by
    # (level, rank, seen) so the connectivity order rules a real chain, and (3)
    # order the COMPONENTS by their min member rank then min appearance — so the
    # upgrading→product chain follows the separation chain (rank 30 < 40) and the
    # whole plant still reads feed→reaction→separation→upgrading→product. Directly-
    # connected stages always land adjacent (same component, consecutive levels).
    adj = {rk: set() for rk in flow_regions_set}
    for rk in flow_regions_set:
        for nb in succ[rk] | pred[rk]:
            if nb in flow_regions_set:
                adj[rk].add(nb)
                adj[nb].add(rk)
    comp_id = {}
    comps = []
    for rk in flow_regions_set:
        if rk in comp_id:
            continue
        stack = [rk]
        comp = []
        comp_id[rk] = len(comps)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for nb in adj[cur]:
                if nb not in comp_id:
                    comp_id[nb] = len(comps)
                    stack.append(nb)
        comps.append(comp)

    def _comp_sort_key(comp):
        return (min(rank.get(rk, REGION_PRIORITY_DEFAULT) for rk in comp),
                min(seen[rk] for rk in comp))
    comps.sort(key=_comp_sort_key)

    flow_regions = []
    for comp in comps:
        comp_sorted = sorted(
            comp,
            key=lambda rk: (level[rk], rank.get(rk, REGION_PRIORITY_DEFAULT), seen[rk]),
        )
        flow_regions.extend(comp_sorted)

    # Order the periphery by rank too (utilities before control before instruments)
    # so the back row still reads sensibly.
    periphery.sort(key=lambda rk: (rank.get(rk, REGION_PRIORITY_DEFAULT), seen[rk]))
    return flow_regions, periphery


DISCRIMINATORS = {"h2", "co2", "hot", "cold", "saf", "naphtha", "recycle",
                  "feed", "product", "tail", "syncrude"}


def _token_match(x, y):
    """Two part-name tokens count as the SAME discriminating token when they are
    equal OR one is a clean morphological PREFIX of the other (a conservative stem
    so a process tag's noun matches the placed part's noun across an inflection):
    e.g. 'oxygen' ⊂ 'oxygenation', 'disinfect' ⊂ 'disinfection'. The rule is kept
    deliberately tight — the shorter token must be ≥6 chars AND the longer at least
    3 chars longer — so short generic words never over-match (it must NOT fold
    'pump'/'pumps' or 'heat' together, which would steal a thermal line onto a pump
    or vice-versa). Universal: pure string morphology, no per-archetype vocabulary."""
    if x == y:
        return True
    s, l = (x, y) if len(x) <= len(y) else (y, x)
    return len(s) >= 6 and len(l) >= len(s) + 3 and l.startswith(s)


def token_overlap(a_tokens, b_tokens):
    """Count of shared discriminating tokens (with the conservative stem of
    `_token_match`), but VETO a candidate that carries a CONFLICTING distinctive
    qualifier — so 'h2_feed_compressor' (query disc {h2,feed}) never resolves onto
    the CO2 compressor (candidate disc {co2}: co2 ∉ query → conflict → 0).

    The veto fires ONLY when the candidate carries a discriminator the query does
    NOT (a genuine RIVAL on the same axis), NOT merely because the candidate lacks
    the query's discriminator. The old 'candidate must echo the query discriminator'
    rule silently dropped real lines: a 'co2_degasser' tag (disc {co2}) failed to
    reach the placed 'Degasser' (no discriminator at all) and the whole CO2-degasser
    line vanished, even though no rival 'Degasser' existed to be confused with. A
    candidate WITHOUT any discriminator is a valid (unqualified) match; only one
    bearing a competing qualifier is excluded."""
    a, b = set(a_tokens), set(b_tokens)
    qd = a & DISCRIMINATORS
    cd = b & DISCRIMINATORS
    if qd and (cd - qd):
        return 0  # candidate carries a CONFLICTING discriminator (a real rival)
    n = 0
    for x in a:
        if any(_token_match(x, y) for y in b):
            n += 1
    return n


# ═══════════════════════════════════════════════════════════════════════════
# Geometry construction per part
# ═══════════════════════════════════════════════════════════════════════════

# Equipment colour-coded by MODULE for identification (Tristan 2026-06-13: "color
# coding things will help with identification"). DISTINCT but MUTED earthy/cool tones
# that deliberately AVOID the saturated service hues (blue=water, red=electrical,
# orange=thermal) so the coloured service pipes POP and stay traceable against the
# equipment. Cycled by module — universal across archetypes, no per-class code.
# PROFESSIONAL NEUTRAL palette (Tristan 2026-06-24: "blender images must look great, no parts vomit").
# The previous mid-chroma "muted" tones rendered GARISH under the studio lighting (slate teal → cyan,
# muted violet → purple, clay → orange = the toy-block look). Equipment now reads as STEEL/PLANT — all
# variants pulled hard toward neutral steel grey (≈0.65) with only a FAINT tint for first-glance module
# differentiation; the SERVICE PIPES (blue=water / red=electrical / orange=thermal) carry the colour and
# now POP against the neutral plant. Universal across archetypes (cycled by module, no per-class code).
MODULE_EQUIP_COLOURS = [
    (0.66, 0.67, 0.70),   # 0 — neutral steel
    (0.63, 0.67, 0.64),   # 1 — faint sage-steel
    (0.71, 0.69, 0.63),   # 2 — faint sand-steel
    (0.66, 0.64, 0.70),   # 3 — faint violet-steel
    (0.62, 0.67, 0.69),   # 4 — faint slate-steel
    (0.71, 0.66, 0.62),   # 5 — faint clay-steel
    (0.64, 0.66, 0.61),   # 6 — faint olive-steel
    (0.69, 0.65, 0.67),   # 7 — faint mauve-steel
    (0.63, 0.66, 0.71),   # 8 — faint periwinkle-steel
    (0.70, 0.68, 0.62),   # 9 — faint ochre-steel
    (0.62, 0.65, 0.67),   # 10 — blue-steel grey
    (0.68, 0.65, 0.63),   # 11 — faint taupe-steel
]
_MODULE_COLOUR_ORDER = []  # module_ids in deterministic first-seen order


def _module_hue(module_id):
    """Stable, distinct equipment colour per MODULE (Tristan 2026-06-13: colour-code
    for identification). First-seen order → MODULE_EQUIP_COLOURS. Deterministic because
    part placement order is deterministic. Universal across archetypes."""
    if module_id and module_id not in _MODULE_COLOUR_ORDER:
        _MODULE_COLOUR_ORDER.append(module_id)
    idx = (_MODULE_COLOUR_ORDER.index(module_id) if module_id in _MODULE_COLOUR_ORDER
           else 0)
    return MODULE_EQUIP_COLOURS[idx % len(MODULE_EQUIP_COLOURS)]


def _mat_for(shape, MAT, module_id=None):
    key, rgb, met, rough = SHAPE_MAT.get(shape, SHAPE_MAT["box"])
    # COLOUR-CODE principal equipment by MODULE (each subsystem = one colour group);
    # keep the SHAPE's metallic/roughness for the material feel. Cache per (module,
    # shape) so the feel still varies by shape within a module. No module → shape colour.
    if module_id:
        rgb = _module_hue(module_id)
        mkey = f"u_mod__{module_id}__{key}"
    else:
        mkey = f"u_{key}"
    if mkey not in MAT:
        MAT[mkey] = fl.make_mat(f"m_{mkey}", rgb, metallic=met, roughness=rough)
    return MAT[mkey], key


def _steel_mat(MAT):
    """Shared galvanised-steel material for skirts / saddles / legs / baseplates."""
    if "u_support_steel" not in MAT:
        MAT["u_support_steel"] = fl.make_mat("m_u_support_steel",
                                             (0.40, 0.42, 0.46), metallic=0.80, roughness=0.42)
    return MAT["u_support_steel"]


def _nozzle_mat(MAT):
    """Mid-grey machined-steel material for nozzle stubs, flanges, manways and
    platform/ladder structure — distinct from the vessel skin so the CAD reader
    sees the connection hardware as hardware, not vessel body."""
    if "u_nozzle_steel" not in MAT:
        MAT["u_nozzle_steel"] = fl.make_mat("m_u_nozzle_steel",
                                            (0.52, 0.54, 0.58), metallic=0.75, roughness=0.40)
    return MAT["u_nozzle_steel"]


# ── Fix 1 — FLANGED NOZZLE STUBS where pipes meet vessels (realism win #1) ────
# A routed pipe used to stab straight into the bare shell. Instead each routed
# pipe now terminates on a short FLANGED STUB grown out of the vessel at the
# resolved nozzle point: a small cylinder of (roughly) the pipe's bore + a thin
# flange disc at its tip. The pipe connects to the STUB TIP, not the shell.
# Universal: keyed only off the anchor point + an outward axis, never e-fuel
# specifics. Each MAJOR vertical vessel also gets a standard top + bottom nozzle
# and a manway disc for realism (build_vessel reserves those).
STUB_LEN_MM       = 360.0    # how far a nozzle stub projects from the shell
STUB_FLANGE_T_MM  = 70.0     # flange disc thickness at the stub tip
MANWAY_DIA_MM     = 600.0    # standard manway disc diameter on a major vessel


def _spawn_nozzle_stub(nm, base_xyz_mm, axis, pipe_dia_mm, MAT, mod, MO,
                       length_mm=STUB_LEN_MM):
    """Grow a short flanged nozzle stub from `base_xyz_mm` along unit `axis`
    (a 3-tuple; +Z=up, -Z=down, ±X/±Y=sideways). Returns the stub-TIP point (mm)
    the routed pipe should connect to, so the pipe meets a flange face, not the
    shell. The stub bore tracks the pipe diameter (a touch fatter) so the joint
    reads flush. Deterministic + universal — only geometry, no class logic."""
    nz_mat = _nozzle_mat(MAT)
    bx, by, bz = (float(c) for c in base_xyz_mm)
    ax, ay, az = axis
    nl = float(length_mm)
    r = max(0.045, pipe_dia_mm * fl.MM * 0.60)        # stub neck radius
    # neck centre sits half a stub-length out along the axis
    cx = (bx + ax * nl * 0.5) * fl.MM
    cy = (by + ay * nl * 0.5) * fl.MM
    cz = (bz + az * nl * 0.5) * fl.MM
    # cylinder axis: default Z; rotate 90° for an X- or Y-facing stub
    if abs(az) > 0.5:
        rot = (0, 0, 0)
    elif abs(ax) > 0.5:
        rot = (0, math.radians(90), 0)
    else:
        rot = (math.radians(90), 0, 0)
    fl.add_cyl(f"{nm}_neck", (cx, cy, cz), r, nl * fl.MM, nz_mat,
               module=mod, module_objects=MO, rotation=rot)
    # flange disc at the stub TIP (a short fat cylinder = a raised-face flange)
    tx, ty, tz = bx + ax * nl, by + ay * nl, bz + az * nl
    fl.add_cyl(f"{nm}_flange",
               (tx * fl.MM, ty * fl.MM, tz * fl.MM), r * 1.55,
               STUB_FLANGE_T_MM * fl.MM, nz_mat, module=mod, module_objects=MO,
               rotation=rot)
    return (tx, ty, tz)


def _add_vessel_nozzles(nm, anchors, dia_mm, kind, MAT, mod, MO):
    """Add a couple of STANDARD nozzles (one near the top head, one near the
    bottom) + a MANWAY disc on a major vertical vessel, purely for realism so a
    bare shell reads as a real process vessel even where no pipe routes to it.
    Universal: placed from the vessel anchors + radius, no class specifics. The
    side nozzles face +Y (toward the walkway/front) so they're visible."""
    nz_mat = _nozzle_mat(MAT)
    x_mm, y_mm, z_top = anchors["top"]
    z_bot = anchors["bottom"][2]
    z_ctr = anchors["centre"][2]
    r = (dia_mm * fl.MM) / 2
    span = max(0.0, z_top - z_bot)
    # side nozzle near the top tan-line and near the bottom tan-line (+Y face)
    for frac, tag in ((0.82, "ntop"), (0.18, "nbot")):
        nz = z_bot + span * frac
        _spawn_nozzle_stub(f"{nm}_{tag}", (x_mm, y_mm + dia_mm * 0.5, nz),
                           (0.0, 1.0, 0.0), 150.0, MAT, mod, MO, length_mm=260.0)
    # MANWAY: a fat short flanged disc at ~mid height on the +Y face. A real manway
    # is a FIXED ~0.6 m hatch regardless of vessel size — the old `max(r*0.55, …)`
    # scaled it to 55% of the radius, ballooning to a 2-3 m disc on big tanks (the
    # "weird circles on the sides of the tanks", Tristan 2026-06-13). Fixed standard
    # size, capped down only on a genuinely tiny vessel. Universal.
    mw_r = min(MANWAY_DIA_MM * fl.MM / 2, r * 0.4)
    fl.add_cyl(f"{nm}_manway",
               ((x_mm) * fl.MM, (y_mm + dia_mm * 0.5) * fl.MM, z_ctr * fl.MM),
               mw_r, 120.0 * fl.MM, nz_mat, module=mod, module_objects=MO,
               rotation=(math.radians(90), 0, 0))


# ═══════════════════════════════════════════════════════════════════════════
# VESSEL + MACHINE BUILDERS (Tristan visual-judge 2026-06-10)
# ───────────────────────────────────────────────────────────────────────────
# The first cut rendered EVERY process vessel as an identical flat-cut cylinder,
# and squat storage tanks as GREEN SPHERES (lib prim_vessel's two squashed
# hemispheres dominate a short body). These deterministic, UNIVERSAL builders fix
# that: a vessel = cylindrical SHELL + two torispherical-read DISHED HEADS (a
# straight flange ring + a knuckle frustum + a shallow dome cap, total head rise
# ≈ 0.19 D like a real 2:1 head) + a SUPPORT differentiated by kind (skirt /
# saddles / legs / plinth). No spheres for process vessels. Mirrors the hand-coded
# e-fuel-synthesis-9shot.py vessel idiom (shell + dome heads + skirt) but
# parametrically, so it works on ANY archetype's vessels.
# ═══════════════════════════════════════════════════════════════════════════

def _add_dished_head(nm, x_mm, y_mm, z_face_mm, dia_mm, direction, mat, mod, MO,
                     rise_frac=0.19):
    """One torispherical-READ head sealing a cylinder END at z_face_mm.
    direction = +1 (head bulges UP, a top head) or -1 (bulges DOWN, bottom head).
    Built as: a short straight flange collar at the tan-line + a knuckle frustum
    tapering inward + a shallow spherical dome cap. Total rise ≈ rise_frac × dia
    (real 2:1 ellipsoidal ≈ 0.25 D, torispherical ≈ 0.19 D). This reads as a
    proper dished head on BOTH a slim tall column AND a squat tank — unlike a
    full hemisphere, which turns a squat tank into a ball."""
    r = (dia_mm * fl.MM) / 2
    rise = dia_mm * fl.MM * rise_frac
    z0 = z_face_mm * fl.MM
    # straight flange collar (a thin ring of full radius right at the tan line)
    fl.add_cyl(f"{nm}_collar", (x_mm * fl.MM, y_mm * fl.MM, z0 + direction * rise * 0.10),
               r * 1.02, rise * 0.20, mat, module=mod, module_objects=MO)
    # knuckle: frustum from full radius up to ~0.62 R over most of the rise
    knk_h = rise * 0.62
    knk_zc = z0 + direction * (rise * 0.20 + knk_h / 2)
    fl.add_frustum(f"{nm}_knuckle",
                   (x_mm * fl.MM, y_mm * fl.MM, knk_zc),
                   r if direction > 0 else r * 0.62,
                   r * 0.62 if direction > 0 else r,
                   knk_h, mat, module=mod, module_objects=MO, vertices=32)
    # crown: a shallow spherical cap (sphere squashed in Z) closing the top
    crown_z = z0 + direction * (rise * 0.82)
    crown = fl.add_sphere(f"{nm}_crown", (x_mm * fl.MM, y_mm * fl.MM, crown_z),
                          r * 0.66, mat, module=mod, module_objects=MO)
    # squash to a shallow cap and keep only the protruding half visually
    crown.scale = (1.0, 1.0, 0.55)
    return rise


def _greeble_ladder(nm, cx_b, cy_b, r_b, z0_b, z1_b, steel, mod, MO):
    """#4 (Tristan 2026-06-22): a CLEAN vertical access ladder on the +X face of a vessel/tank —
    two stiles + rungs (add_cyl, so no add_box half-size issue). Deliberately NO cage hoops /
    handrail ring: the busy per-tank furniture read as a 'scalloped blob' (mempalace render-
    regression 2026-06-13). A thin one-sided ladder reads as 'engineered' without the blob."""
    h = z1_b - z0_b
    if h < 1.5:
        return
    lx = cx_b + r_b + 0.15
    for s in (-1, 1):
        fl.add_cyl(f"{nm}_ladrail{s:+d}", (lx, cy_b + s * 0.22, (z0_b + z1_b) / 2),
                   0.025, h, steel, module=mod, module_objects=MO)
    n = max(3, int(h / 0.30))
    for k in range(n):
        fl.add_cyl(f"{nm}_ladrung{k}", (lx, cy_b, z0_b + (k + 0.5) * h / n),
                   0.018, 0.44, steel, module=mod, module_objects=MO,
                   rotation=(math.radians(90), 0, 0))


# ── OPEN-REARING / open-process-water detector (H1, 2026-06-23) ──────────────
# A bare `tank`/`storage` shape is NOT a signal that the vessel is OPEN to the
# air with a free water surface. The teal-water + open-rim + centre-drain-stand-
# pipe treatment below is the AQUACULTURE rearing-tank signature; a CO₂ / SAF /
# e-fuel storage or pressure tank is a CLOSED roofed vessel. Gate the open-top
# treatment on a POSITIVE physical signal: the part NAME names an open-rearing /
# open-process-water structure (rearing / raceway / basin / pond / lagoon /
# aquaculture / grow-out / nursery), OR the geometry MATERIAL is the aquaculture
# water mat (an open-process-water CONTENTS cue set upstream). Never an archetype-
# name string equality — keyed on the noun + the fluid-contents material only.
_OPEN_REARING_RE = re.compile(
    r"rearing|raceway|basin|\bpond\b|lagoon|aquacultur|grow.?out|nursery",
    re.IGNORECASE)


def _is_open_rearing_tank(nm, mat, MAT):
    """True only when a POSITIVE open-rearing / open-process-water signal fires —
    the part NAME matches an open-rearing noun, OR the vessel's body material IS
    the aquaculture open-water mat (an explicit open-process-water contents cue).
    `nm` is the normalised object base-name ("u_<part-name>…") so the rearing-tank
    noun survives as a substring. Default (no signal) → CLOSED storage tank."""
    if _OPEN_REARING_RE.search(str(nm or "")):
        return True
    # open-process-water CONTENTS cue: the shell mat is the aquaculture water mat
    # (set upstream when the contents are an open process-water pool, not a closed
    # storage/pressure inventory). Compared by identity against MAT["u_water"].
    try:
        if "u_water" in MAT and mat is MAT["u_water"]:
            return True
    except Exception:
        pass
    return False


def build_vessel(nm, kind, dia_mm, length_mm, x_mm, y_mm, base_z_mm, mat, mod, MO,
                 MAT, lagged=False):
    """Deterministic process vessel = shell + two dished heads + a kind-specific
    support. Returns (assembly_dict, anchors) where anchors = {"top","bottom",
    "centre"} in MM for nozzle-accurate pipe routing.

    kind ∈ {"column","reactor","vertical","tank","horizontal","bed"} drives the
    SUPPORT + proportions:
      column/reactor → tall support SKIRT (cylindrical) to deck, dome heads
      vertical/bed   → short LEGS + flanged ends
      tank           → flat bottom on a PLINTH + low-domed roof (NOT a sphere)
      horizontal     → two SADDLE supports, dished heads on the ends
    """
    steel = _steel_mat(MAT)
    r = (dia_mm * fl.MM) / 2
    anchors = {}

    if kind == "horizontal":
        # axis along X, on two saddles. Heads dish outward in ±X.
        head_rise = dia_mm * fl.MM * 0.19
        body_len = max(length_mm * fl.MM - 2 * head_rise, r)
        cz = base_z_mm * fl.MM + dia_mm * fl.MM * 0.55 + r  # sit clear of saddles
        # shell
        shell = fl.add_cyl(f"{nm}_shell", (x_mm * fl.MM, y_mm * fl.MM, cz),
                           r, body_len, mat, module=mod, module_objects=MO,
                           rotation=(0, math.radians(90), 0))
        # dished heads on each X end (frustum + cap, built sideways)
        for s, side in ((-1, "W"), (1, "E")):
            hx = x_mm * fl.MM + s * body_len / 2
            fl.add_frustum(f"{nm}_head_{side}", (hx + s * head_rise * 0.4, y_mm * fl.MM, cz),
                           r, r * 0.5, head_rise * 0.9, mat, module=mod, module_objects=MO,
                           rotation=(0, math.radians(s * 90), 0), vertices=32)
            cap = fl.add_sphere(f"{nm}_cap_{side}", (hx + s * head_rise * 0.6, y_mm * fl.MM, cz),
                                r * 0.55, mat, module=mod, module_objects=MO)
            cap.scale = (0.55, 1.0, 1.0)
        # two saddle supports
        for s in (-0.34, 0.34):
            fl.add_box(f"{nm}_saddle_{s:+.2f}",
                       (x_mm * fl.MM + s * body_len, y_mm * fl.MM,
                        base_z_mm * fl.MM + (cz - base_z_mm * fl.MM - r) / 2),
                       (r * 0.55, r * 1.9, (cz - r - base_z_mm * fl.MM)), steel,
                       module=mod, module_objects=MO)
        anchors = {"top": (x_mm, y_mm, (cz + r) / fl.MM),
                   "bottom": (x_mm, y_mm, (cz - r) / fl.MM),
                   "centre": (x_mm, y_mm, cz / fl.MM)}
        return {"root": shell, "name": nm}, anchors

    if kind == "tank":
        # SQUAT large-diameter cylinder, FLAT bottom on a low plinth. Emphatically
        # NOT a sphere. The ROOF treatment forks on a PHYSICAL signal (H1, 2026-06-23):
        #   • OPEN-REARING signal (name = rearing/raceway/basin/pond/lagoon/aquaculture/
        #     grow-out/nursery, OR the open-process-water contents mat) → the AQUACULTURE
        #     open-top treatment: recessed teal WATER SURFACE + open steel RIM + centre
        #     dual-drain STANDPIPE (the RAS signature). PRESERVED EXACTLY.
        #   • DEFAULT (any other tank/storage — a CO₂ / SAF / e-fuel closed storage or
        #     pressure tank) → a CLOSED roofed vessel: a shallow low-DOME roof, NO water
        #     surface, NO standpipe. A closed inventory is not an open pool.
        body_h = length_mm * fl.MM
        plinth_h = max(0.10, r * 0.10)
        z_bot = base_z_mm * fl.MM + plinth_h
        # ground plinth ring
        fl.add_cyl(f"{nm}_plinth", (x_mm * fl.MM, y_mm * fl.MM, base_z_mm * fl.MM + plinth_h / 2),
                   r * 1.08, plinth_h, steel, module=mod, module_objects=MO)
        shell = fl.add_cyl(f"{nm}_shell", (x_mm * fl.MM, y_mm * fl.MM, z_bot + body_h / 2),
                           r, body_h, mat, module=mod, module_objects=MO)
        anchors = {"top": (x_mm, y_mm, (z_bot + body_h) / fl.MM),
                   "bottom": (x_mm, y_mm, z_bot / fl.MM),
                   "centre": (x_mm, y_mm, (z_bot + body_h / 2) / fl.MM)}
        if _is_open_rearing_tank(nm, mat, MAT):
            # OPEN-TOP RAS rearing tank (council 2026-06-16: the solid lid read as a
            # featureless green blob). A recessed DARK WATER SURFACE so top-down reads
            # "open tank with water"; a steel RIM ring at the open edge; a CENTRE dual-
            # drain STANDPIPE (the signature RAS fitting). Fires ONLY on the open-rearing
            # signal — a closed CO₂/SAF storage tank never grows a water pool.
            rim_z = z_bot + body_h
            water_z = z_bot + body_h * 0.90                       # ~10% freeboard below the rim
            if "u_water" not in MAT:
                # reflective aquaculture water — brighter teal-green + low roughness so it reads as
                # a WATER surface (a mirror-ish sheen), not a flat dark disc (Tristan 2026-06-22 #5).
                MAT["u_water"] = fl.make_mat("m_u_water", (0.06, 0.40, 0.46), metallic=0.0, roughness=0.06)
            fl.add_cyl(f"{nm}_watersurf", (x_mm * fl.MM, y_mm * fl.MM, water_z), r * 0.965, 0.05,
                       MAT["u_water"], module=mod, module_objects=MO)
            fl.add_torus(f"{nm}_rim", (x_mm * fl.MM, y_mm * fl.MM, rim_z),
                         r, max(0.06, r * 0.03), steel, module=mod, module_objects=MO)
            # a LOW centre dual-drain standpipe — just proud of the water (the RAS signature),
            # NOT a tall column. Tristan 2026-06-16: the #139 rim furniture (8 posts + handrail
            # + wind-girder per tank, ×10) read as a SCALLOPED BLOB silhouette — "blobby again".
            # mempalace (render-regression 2026-06-13): the decent renders are CLEAN cylinders
            # with shading, not busy furniture. Stripped the posts/handrail/wind-girder; a tank
            # now reads as a clean shallow cylinder + dark water + a thin rim + a low centre drain.
            fl.add_cyl(f"{nm}_centredrain", (x_mm * fl.MM, y_mm * fl.MM, water_z + 0.18),
                       max(0.10, r * 0.04), 0.45, steel, module=mod, module_objects=MO)
            # NO bolted side manway / nozzles on an OPEN tank (mempalace render-regression
            # 2026-06-13: "_add_vessel_nozzles … reads as random grey circles stuck on the
            # tanks" — WRONG for an open RAS tank, whose tie-ins come from the per-instance
            # MANIFOLD, not a pressure-vessel manway).
        else:
            # CLOSED-TOP storage / pressure tank (the universal default): a shallow low-
            # DOME roof closes the shell — no open water surface, no centre standpipe. The
            # correct silhouette for a CO₂ / SAF / e-fuel closed inventory. Roof = a sphere
            # squashed in Z to a low cap, capped to a realistic rise.
            roof_rise = min(r * 0.35, body_h * 0.20)
            roof = fl.add_sphere(f"{nm}_roof", (x_mm * fl.MM, y_mm * fl.MM, z_bot + body_h),
                                 r * 0.99, mat, module=mod, module_objects=MO)
            roof.scale = (1.0, 1.0, max(0.12, roof_rise / max(r, 1e-6)))
            # closed tanks legitimately carry tie-in nozzles + a top manway (unlike the
            # open rearing tank). Anchor top stays at the dome apex for routing.
            anchors["top"] = (x_mm, y_mm, (z_bot + body_h + roof_rise) / fl.MM)
            _add_vessel_nozzles(nm, anchors, dia_mm, "tank", MAT, mod, MO)
        _greeble_ladder(nm, x_mm * fl.MM, y_mm * fl.MM, r, z_bot, z_bot + body_h, steel, mod, MO)
        return {"root": shell, "name": nm}, anchors

    # ── VERTICAL families: column / reactor / vertical / bed ──
    head_rise = dia_mm * fl.MM * 0.19
    if kind in ("column", "reactor"):
        skirt_h = max(0.55, length_mm * fl.MM * 0.10)
    else:  # vertical / bed sit on short legs
        skirt_h = max(0.35, r * 0.9)
    z_bot = base_z_mm * fl.MM + skirt_h
    body_h = max(length_mm * fl.MM - 2 * head_rise, r)
    cz = z_bot + body_h / 2 + head_rise   # cylinder centre above bottom head

    shell = fl.add_cyl(f"{nm}_shell", (x_mm * fl.MM, y_mm * fl.MM, cz), r, body_h,
                       mat, module=mod, module_objects=MO)
    if lagged:  # insulation lagging cue — a slightly fatter, matte overshell
        if "u_lagging" not in MAT:
            MAT["u_lagging"] = fl.make_mat("m_u_lagging", (0.86, 0.84, 0.74),
                                           metallic=0.0, roughness=0.62)
        fl.add_cyl(f"{nm}_lagging", (x_mm * fl.MM, y_mm * fl.MM, cz), r * 1.07,
                   body_h * 0.94, MAT["u_lagging"], module=mod, module_objects=MO)
    # dished heads top + bottom (z faces at the tan lines)
    _add_dished_head(f"{nm}_th", x_mm, y_mm, cz / fl.MM + body_h / (2 * fl.MM),
                     dia_mm, +1, mat, mod, MO)
    _add_dished_head(f"{nm}_bh", x_mm, y_mm, cz / fl.MM - body_h / (2 * fl.MM),
                     dia_mm, -1, mat, mod, MO)

    if kind in ("column", "reactor"):
        # cylindrical support SKIRT to the deck
        fl.add_cyl(f"{nm}_skirt", (x_mm * fl.MM, y_mm * fl.MM, base_z_mm * fl.MM + skirt_h / 2),
                   r * 0.94, skirt_h, steel, module=mod, module_objects=MO)
    else:
        # 4 short angled legs + a flanged collar at each end (bed/filter cue)
        for i in range(4):
            ang = math.pi / 4 + i * math.pi / 2
            fl.add_box(f"{nm}_leg_{i}",
                       (x_mm * fl.MM + r * 0.82 * math.cos(ang),
                        y_mm * fl.MM + r * 0.82 * math.sin(ang),
                        base_z_mm * fl.MM + skirt_h / 2),
                       (r * 0.16, r * 0.16, skirt_h), steel, module=mod, module_objects=MO)
        for zf in (z_bot, z_bot + body_h):
            fl.add_torus(f"{nm}_flange_{zf:.2f}", (x_mm * fl.MM, y_mm * fl.MM, zf),
                         r + 0.01, max(0.015, r * 0.07), steel, module=mod, module_objects=MO)

    top_z = (cz + body_h / 2 + head_rise) / fl.MM
    bot_z = (z_bot) / fl.MM
    anchors = {"top": (x_mm, y_mm, top_z), "bottom": (x_mm, y_mm, bot_z),
               "centre": (x_mm, y_mm, cz / fl.MM)}
    # Fix 1: standard top/bottom side nozzles + a manway on MAJOR vertical
    # vessels (skip the small bed/filter legs case — those are minor drums).
    if kind in ("column", "reactor", "vertical"):
        _add_vessel_nozzles(nm, anchors, dia_mm, kind, MAT, mod, MO)
    _greeble_ladder(nm, x_mm * fl.MM, y_mm * fl.MM, r, z_bot, cz + body_h / 2, steel, mod, MO)
    return {"root": shell, "name": nm}, anchors


def build_machine(nm, dia_mm, length_mm, x_mm, y_mm, base_z_mm, mat, mod, MO, MAT):
    """Rotating machine (compressor/pump) that reads as MACHINERY, not a cylinder:
    a baseplate + a horizontal DRIVER (motor) cylinder coupled through a short
    coupling to a CASING/volute block, with a discharge stub. Axis along X.
    Returns (assembly, anchors). length_mm = overall package length."""
    steel = _steel_mat(MAT)
    if "u_motor" not in MAT:
        MAT["u_motor"] = fl.make_mat("m_u_motor", (0.15, 0.45, 1.00),
                                     metallic=0.30, roughness=0.40)
    motor_mat = MAT["u_motor"]
    L = length_mm * fl.MM
    body_r = max(0.14, dia_mm * fl.MM * 0.5)
    base_t = body_r * 0.30
    bz = base_z_mm * fl.MM
    cz = bz + base_t + body_r          # shaft centreline
    # baseplate skid
    base = fl.add_box(f"{nm}_baseplate", (x_mm * fl.MM, y_mm * fl.MM, bz + base_t / 2),
                      (L * 1.05, body_r * 2.6, base_t), steel, module=mod, module_objects=MO)
    # driver MOTOR (horizontal cylinder, drive end toward +X)
    fl.add_cyl(f"{nm}_motor", (x_mm * fl.MM - L * 0.26, y_mm * fl.MM, cz),
               body_r, L * 0.42, motor_mat, module=mod, module_objects=MO,
               rotation=(0, math.radians(90), 0))
    # coupling guard
    fl.add_cyl(f"{nm}_coupling", (x_mm * fl.MM - L * 0.02, y_mm * fl.MM, cz),
               body_r * 0.45, L * 0.10, steel, module=mod, module_objects=MO,
               rotation=(0, math.radians(90), 0))
    # CASING / volute block (the compression element)
    fl.add_box(f"{nm}_casing", (x_mm * fl.MM + L * 0.24, y_mm * fl.MM, cz),
               (L * 0.40, body_r * 2.1, body_r * 2.1), mat, module=mod, module_objects=MO)
    # suction + discharge nozzles
    fl.add_cyl(f"{nm}_suction", (x_mm * fl.MM + L * 0.24, y_mm * fl.MM, cz + body_r * 1.4),
               body_r * 0.42, body_r * 1.0, mat, module=mod, module_objects=MO)
    fl.add_cyl(f"{nm}_discharge", (x_mm * fl.MM + L * 0.42, y_mm * fl.MM, cz + body_r * 1.0),
               body_r * 0.36, body_r * 1.2, mat, module=mod, module_objects=MO)
    top_z = (cz + body_r * 2.4) / fl.MM
    anchors = {"top": (x_mm, y_mm, top_z),
               "bottom": (x_mm, y_mm, (bz + base_t) / fl.MM),
               "centre": (x_mm, y_mm, cz / fl.MM)}
    return {"root": base, "name": nm}, anchors


# ── Fix 4 — CAP runaway type-default heights on undimensioned tall parts ──────
# A part that classifies as a column/tower/stack but carries NO explicit HEIGHT
# falls to the TYPE_DEFAULTS height (e.g. tall_column 12 m, stack 9 m). On a
# small plant that default can dwarf the real, DIMENSIONED vessels and read as an
# absurd spike. So we cap an UNDIMENSIONED-height tall part to ≤ TALL_CAP_FACTOR
# × the tallest DIMENSIONED vessel in the scene. Set once in main() from the real
# data; universal (any archetype) — keyed on shape + dimension presence only.
TALL_CAP_FACTOR     = 1.6     # undimensioned tall part ≤ this × tallest dimensioned vessel
_UNDIM_TALL_CAP_MM = None     # module-level cap (mm); None = uncapped (pre-compute)
# Shapes whose DEFAULT height is the runaway risk (slim verticals + stacks).
_CAPPABLE_TALL_SHAPES = {"tall_column", "tall_vessel", "stack"}


def _dimensioned_height_mm(part):
    """The part's EXPLICIT height in mm if the brief gave one, else None. A cyl
    dim with len_mm, a box dim with h_mm, an area dim (derived h). dia-only stack
    dims (len_mm absent) return None → they're treated as undimensioned-height."""
    d = part.dim
    if not d:
        return None
    if d.get("kind") == "cyl":
        return d.get("len_mm")            # None when only a diameter was given
    if d.get("kind") == "box":
        return d.get("h_mm")
    if d.get("kind") == "area":
        return max(1000.0, math.sqrt(d["area_m2"]) * 1000) * 0.45
    return None


def compute_undim_tall_cap(parts):
    """Set the module-level cap = TALL_CAP_FACTOR × the tallest DIMENSIONED vessel
    height across the scene (mm). Called once in main() before placement so every
    downstream consumer (footprint / build_part / is_tall_for_frame) sees the same
    capped height for any undimensioned-height column/tower/stack."""
    global _UNDIM_TALL_CAP_MM
    heights = [h for h in (_dimensioned_height_mm(p) for p in parts) if h]
    if heights:
        _UNDIM_TALL_CAP_MM = max(heights) * TALL_CAP_FACTOR
    else:
        _UNDIM_TALL_CAP_MM = None
    return _UNDIM_TALL_CAP_MM


# Replication grid geometry — the SINGLE source of truth shared by build_part (which
# draws the N instances) and footprint_mm (which must RESERVE the grid's full extent so
# the placer never lands another part on top of a qty-N array). Keeping both keyed on this
# helper is what stops the 10-tank rearing farm overlapping its neighbours: build_part lays
# N vessels in a cols×rows grid at pitch≈dia×1.4, so the reserved footprint MUST be that
# whole grid, not one unit. Universal — any replicated _VESSEL_KIND shape (tanks, reactors).
_VESSEL_GRID_PITCH_FACTOR = 1.12    # centre-to-centre pitch = unit dia × this (council 2026-06-16: 1.4 spread the farm 4× too wide; 1.12 ≈ dia + 1.5 m walkway)
_VESSEL_GRID_MAX_N = 12             # build_part caps replication at 12 instances


def _vessel_grid_dims(n: int):
    """(cols, rows) of the compact near-square grid build_part lays N replicated vessels
    into — IDENTICAL to build_part's `cols = ceil(sqrt(N)); rows = ceil(N/cols)`."""
    n = max(1, min(int(n or 1), _VESSEL_GRID_MAX_N))
    cols = int(math.ceil(math.sqrt(n)))
    rows = int(math.ceil(n / cols))
    return cols, rows


def _vessel_grid_span_mm(unit_dia_mm: float, n: int):
    """The full PLAN span (span_x_mm, span_y_mm) the replicated-vessel grid occupies on the
    deck, so the placer reserves the grid's real footprint (not one unit). Mirrors
    build_part's layout exactly: a cols×rows grid at pitch = unit_dia × pitch-factor, the
    overall span being (n_axis-1)×pitch + one unit dia (the half-unit margin each end)."""
    cols, rows = _vessel_grid_dims(n)
    pitch = unit_dia_mm * _VESSEL_GRID_PITCH_FACTOR
    span_x = (cols - 1) * pitch + unit_dia_mm
    span_y = (rows - 1) * pitch + unit_dia_mm
    return span_x, span_y


# Principal MACHINES (pumps/blowers/compressors) replicate into N DISTINCT instances when
# qty 2..12 — the same faithful "show every unit" rule as the _VESSEL_KIND grid above, so a
# qty-8 recirc-pump array draws 8 pump bodies + 8 parts-manifest rows (P-101…P-108) and the
# P&ID / BFD / GA show every pump, not one collapsed unit. Without this, principal pumps were
# the lone qty-N node that stayed at 1 (drawing-gate `qty_coverage` FAIL: recirc qty 8, manifest
# 1). N==1 is byte-identical to the old single machine (inm==nm, xo==yo==0). Universal — any
# pump/blower/compressor array, any class. Like the vessel grid, this is the SINGLE source of
# truth shared by build_part (draws the N instances) and footprint_mm (reserves the grid span).
_REPLICATED_MACHINE_KIND = {"pump", "compressor"}
_MACHINE_GRID_PITCH_X_FACTOR = 1.7    # centre-to-centre X pitch = unit footprint width × this
_MACHINE_GRID_PITCH_Y_FACTOR = 1.9    # centre-to-centre Y pitch = unit footprint depth × this


def _machine_grid_span_mm(unit_w_mm: float, unit_dep_mm: float, n: int):
    """The full PLAN span (span_x_mm, span_y_mm) the replicated-MACHINE cluster occupies, so
    the placer reserves the cluster (not one machine). Mirrors build_part's machine layout: a
    cols×rows grid (the same near-square `_vessel_grid_dims`) at pitch = unit footprint ×
    pitch-factor, span = (n_axis-1)×pitch + one unit footprint (half-unit margin each end)."""
    cols, rows = _vessel_grid_dims(n)
    px = unit_w_mm * _MACHINE_GRID_PITCH_X_FACTOR
    py = unit_dep_mm * _MACHINE_GRID_PITCH_Y_FACTOR
    span_x = (cols - 1) * px + unit_w_mm
    span_y = (rows - 1) * py + unit_dep_mm
    return span_x, span_y


def resolved_dims_mm(part):
    """Return a concrete (kind, geometry-dict) in MM, from explicit dim if
    present else the type default for the shape. Footprint is used by the
    placer to space parts.

    The returned dict carries `_qty` (the part's replication count) so footprint_mm can
    reserve a qty-N vessel array's FULL grid extent — without it the placer reserves a
    single unit's footprint and a 10-tank farm lands on top of its neighbours (the
    recurring RAS overlap). Universal: zero effect for qty-1 parts."""
    shape = part.shape
    d = part.dim
    qty = int(getattr(part, "qty", 1) or 1)
    # cylinder-like dim available
    if d and d["kind"] == "cyl":
        dia = d.get("dia_mm", TYPE_DEFAULTS_MM.get(shape, {}).get("dia", 800))
        ln = d.get("len_mm")
        # Fix 4: a dia-only tall part (no explicit height) gets the type-default
        # height — CAP it so it can't spike past the real dimensioned vessels.
        if ln is None and shape in _CAPPABLE_TALL_SHAPES:
            ln = _capped_default_height(shape)
        rd = {"shape": shape, "dia_mm": dia, "len_mm": ln,
              "explicit": d.get("len_mm") is not None}
    elif d and d["kind"] == "box":
        rd = {"shape": shape, "w_mm": d["w_mm"], "d_mm": d["d_mm"],
              "h_mm": d["h_mm"], "explicit": True}
    elif d and d["kind"] == "area":
        # area → derive a square package footprint (sqrt), height ~ 0.4× side
        side = max(1000.0, math.sqrt(d["area_m2"]) * 1000)
        rd = {"shape": shape, "w_mm": side, "d_mm": side, "h_mm": side * 0.45,
              "explicit": True}
    else:
        # no explicit dim → type default
        td = dict(TYPE_DEFAULTS_MM.get(shape, TYPE_DEFAULTS_MM["box"]))
        # Fix 4: clamp an undimensioned column/tower/stack's default height.
        if shape in _CAPPABLE_TALL_SHAPES and "height" in td:
            td["height"] = _capped_default_height(shape)
        td["shape"] = shape
        td["explicit"] = False
        rd = td
    # Carry the replication count so footprint_mm can reserve the qty-N grid extent
    # (build_part replicates _VESSEL_KIND shapes into a cols×rows grid). Harmless for
    # all other shapes / qty-1 parts (footprint_mm only consumes it for vessels).
    rd["_qty"] = qty
    # CAP an instrument's geometry — a field device (sensor / transmitter / analyser / relay)
    # is small regardless of a bad dimension modifier (a "Voltage Sensor" tagged 1.28 m is
    # data noise, not a 1.3 m box). Clamp every axis to ≤600 mm so a stray dim can't render a
    # device as a vessel-scale block (Tristan 2026-06-22). Universal — shape-keyed.
    if shape == "instrument":
        for _k in ("dia_mm", "len_mm", "w_mm", "d_mm", "h_mm"):
            if rd.get(_k):
                rd[_k] = min(float(rd[_k]), 600.0)
    return rd


def _capped_default_height(shape):
    """The TYPE_DEFAULTS height for `shape`, clamped to the scene cap (Fix 4)."""
    base = TYPE_DEFAULTS_MM.get(shape, {}).get("height", 9000)
    if _UNDIM_TALL_CAP_MM is not None:
        return min(base, _UNDIM_TALL_CAP_MM)
    return base


def footprint_mm(rd):
    """(footprint_x_mm, footprint_y_mm, top_z_mm-ish height) for spacing.

    A qty-N vessel (any _VESSEL_KIND shape, 2..12 units) is replicated by build_part into
    a compact cols×rows grid on the deck — so its RESERVED footprint here is that whole
    GRID span, not a single unit. Without this the placer reserves one unit and the array
    overlaps its neighbours (the recurring RAS 10-tank-on-top-of-everything overlap).
    `rd["_qty"]` is stamped by resolved_dims_mm; absent/1 ⇒ identical to a single unit."""
    shape = rd["shape"]
    n = int(rd.get("_qty", 1) or 1)
    replicate = shape in _VESSEL_KIND and 2 <= n <= _VESSEL_GRID_MAX_N
    if shape in ("tall_column", "tall_vessel", "vertical_vessel", "tank", "stack"):
        dia = rd.get("dia_mm", 800)
        h = rd.get("len_mm") or rd.get("height", TYPE_DEFAULTS_MM[shape].get("height", 3000))
        if replicate:                       # reserve the full N-vessel grid footprint
            span_x, span_y = _vessel_grid_span_mm(dia, n)
            return span_x, span_y, h
        return dia, dia, h
    if shape == "horizontal_vessel":
        dia = rd.get("dia_mm", 700)
        ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["length"]
        if replicate:
            # build_part grids horizontal vessels on a dia-pitch too; a unit's plan
            # footprint is ln (X) × dia*1.8 (Y), so scale each axis by the grid count.
            cols, rows = _vessel_grid_dims(n)
            pitch = dia * _VESSEL_GRID_PITCH_FACTOR
            return (cols - 1) * pitch + ln, (rows - 1) * pitch + dia * 1.8, dia
        return ln, dia * 1.8, dia
    if shape in _REPLICATED_MACHINE_KIND:
        w = rd.get("w_mm", TYPE_DEFAULTS_MM[shape].get("w", 1000))
        dep = rd.get("d_mm", TYPE_DEFAULTS_MM[shape].get("d", 900))
        h = rd.get("h_mm", TYPE_DEFAULTS_MM[shape].get("h", 1100))
        n = int(rd.get("_qty", 1) or 1)
        if 2 <= n <= _VESSEL_GRID_MAX_N:       # reserve the full N-machine cluster footprint
            sx, sy = _machine_grid_span_mm(w, dep, n)
            return sx, sy, h
        return w, dep, h
    if shape in ("package_box", "skid_box",
                 "transformer_box", "cabinet", "cabinet_small", "box"):
        w = rd.get("w_mm", TYPE_DEFAULTS_MM[shape].get("w", 1000))
        dep = rd.get("d_mm", TYPE_DEFAULTS_MM[shape].get("d", 900))
        h = rd.get("h_mm", TYPE_DEFAULTS_MM[shape].get("h", 1100))
        return w, dep, h
    if shape == "gantry":
        sp = rd.get("span", TYPE_DEFAULTS_MM[shape]["span"])
        return sp, sp * 0.5, rd.get("height", TYPE_DEFAULTS_MM[shape]["height"])
    if shape == "inline_spool":
        ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["length"]
        return ln, rd.get("dia_mm", 350) * 1.4, rd.get("dia_mm", 350)
    if shape == "instrument":
        return (rd.get("w_mm", 250), rd.get("d_mm", 250), rd.get("h_mm", 400))
    return 1000, 900, 1100


# Kind passed to build_vessel() per shape, so the support + proportions differ.
_VESSEL_KIND = {
    "tall_column":     "column",
    "tall_vessel":     "reactor",
    "vertical_vessel": "vertical",
    "horizontal_vessel": "horizontal",
    "tank":            "tank",
}
# Vessel shapes that wear insulation lagging by default (hot process vessels).
_LAGGED_SHAPES = {"tall_column", "tall_vessel"}


def _box_anchors(x_mm, y_mm, base_z_mm, h):
    return {"top": (x_mm, y_mm, base_z_mm + h),
            "bottom": (x_mm, y_mm, base_z_mm + h * 0.2),
            "centre": (x_mm, y_mm, base_z_mm + h * 0.5)}


def build_part(part, x_mm, y_mm, base_z_mm, MAT, MO):
    """Instantiate ONE part at footprint-centre (x,y) on base_z. Returns
    (assembly_dict_or_obj, anchors) where anchors = {"top","bottom","centre"}
    in MM — overhead/vapour edges route from a source's TOP, liquid/bottoms
    edges from its BOTTOM (nozzle-accurate routing). Multi-quantity small parts
    repeat in a tight cluster."""
    shape = part.shape
    mod = part.module_id
    mat, _ = _mat_for(shape, MAT, mod)
    rd = resolved_dims_mm(part)
    nm = "u_" + re.sub(r"[^a-z0-9]+", "_", part.name.lower()).strip("_")[:40]

    # ── PROCESS VESSELS: shell + dished heads + kind-specific support ──
    if shape in _VESSEL_KIND:
        kind = _VESSEL_KIND[shape]
        # BOX-dimmed vessel fallback (Tristan 2026-06-22, the 13.3 m "Degasser" tower):
        # a vessel/column whose contract dim is a BOX (e.g. "1548x1316x1703 mm") carries
        # w/d/h, NOT dia/len — without the fallbacks below build_part ignored the box and
        # fell to the 12 m tall_column DEFAULT, rendering a ⌀0.8×12 m tower for a 1.7 m
        # degasser. Read the box h_mm/w_mm so the rendered vessel matches the contract.
        if shape == "tank":
            dia = rd.get("dia_mm") or rd.get("w_mm") or 3000
            ln = rd.get("len_mm") or rd.get("h_mm") or TYPE_DEFAULTS_MM[shape]["height"]
        elif shape == "horizontal_vessel":
            dia = rd.get("dia_mm") or rd.get("h_mm") or 700
            ln = rd.get("len_mm") or rd.get("w_mm") or TYPE_DEFAULTS_MM[shape]["length"]
        else:
            dia = rd.get("dia_mm") or rd.get("w_mm") or 800
            ln = rd.get("len_mm") or rd.get("h_mm") or TYPE_DEFAULTS_MM[shape].get("height", 3000)
        # qty-N vessels (e.g. a 10-tank rearing farm) render as a COMPACT grid of N
        # DISTINCT instances centred on this part's footprint (x_mm,y_mm). Each instance
        # gets a UNIQUE object base-name (nm_inst<idx>) so build_parts_manifest can
        # separate them into N rows + the 2D GA shows all N. Routing uses the FIRST
        # instance as the representative (its (asm, anchors) is returned). N==1 is
        # byte-identical to a single vessel (inm == nm, xo == yo == 0).
        N = max(1, min(int(getattr(part, "qty", 1) or 1), 12))
        cols = int(math.ceil(math.sqrt(N)))
        rows = int(math.ceil(N / cols))
        pitch = dia * _VESSEL_GRID_PITCH_FACTOR
        first = None
        for idx in range(N):
            r, c = divmod(idx, cols)
            xo = (c - (cols - 1) / 2.0) * pitch
            yo = (r - (rows - 1) / 2.0) * pitch
            inm = nm if N == 1 else f"{nm}_inst{idx}"
            asm, anchors = build_vessel(inm, kind, dia, ln, x_mm + xo, y_mm + yo,
                                        base_z_mm, mat, mod, MO, MAT,
                                        lagged=(shape in _LAGGED_SHAPES))
            if shape == "tall_column":  # add visible tray rings up the column
                _add_tray_rings(inm, anchors, dia, MAT, mod, MO)
            # Fix 3: access platforms + caged ladder on tall columns/towers.
            if shape in ("tall_column", "tall_vessel"):
                _add_platforms_and_ladder(inm, anchors["top"], anchors["bottom"],
                                          dia, MAT, mod, MO)
            if first is None:
                first = (asm, anchors)
        # ── qty-N MANIFOLD: EVERY tank gets an inlet + drain + power tie-in, not just
        # instance 0 (Tristan 2026-06-15: "each tank min has inputs and outputs for
        # pipes and power"). A SUPPLY main (up one side) feeds a per-row BRANCH header
        # that DROPS into each tank; a DRAIN per-row header at floor collects each tank;
        # a POWER header drops to each. The supply/drain main ENDS become the array's
        # routing anchors so the plant loop connects to the manifold, which distributes
        # to all N. Universal — fires for ANY replicated vessel array, any class. ──
        if N >= 2:
            MM = fl.MM
            blue = _mech_pipe_mat("fluid_loop", MAT)
            pwr = _mech_pipe_mat("electrical_bus", MAT)
            # REALISTIC pipe radii (a header is sized by FLOW, not by the tank ⌀ — the
            # old dia·0.05 gave a 1.24 m-thick "pipe" that rendered as a fat blob).
            r_main = 0.16    # ~DN300 supply/drain header
            r_br = 0.11      # ~DN200 per-row branch
            r_drop = 0.07    # ~DN125 drop into each tank
            r_pwr = 0.035    # cable run
            ttop = base_z_mm + (ln or 3000)
            sup_z = ttop + 1300.0                       # supply header above the tanks
            drn_z = base_z_mm + 1100.0                  # drain/return header at a VISIBLE height
                                                        # (Tristan 2026-06-22: "can't see water
                                                        # going OUT") — was 250 mm, hidden at floor
            pwr_z = base_z_mm + 600.0                   # power header low on the side
            cxs = [x_mm + (c - (cols - 1) / 2.0) * pitch for c in range(cols)]
            rys = [y_mm + (r - (rows - 1) / 2.0) * pitch for r in range(rows)]
            # Headers HUG the array — a small CLEARANCE beyond the outer tank face / rows,
            # NOT a pitch fraction. The old 0.55–0.8×pitch overhang made a big tank array's
            # supply/power mains stick 8+ m PAST the plant edge as stray floor lines (Tristan
            # 2026-06-22, "two black wires going nowhere"). dia = the tank diameter in scope.
            _edge = dia / 2.0 + 250.0                      # hug the tank face (0.25 m clearance)
            sup_x, drn_x = cxs[0] - _edge, cxs[-1] + _edge  # mains just outside the columns
            y_f, y_b = rys[0] - 500.0, rys[-1] + 500.0      # span the rows + a short elbow

            def _vp(n, x, y, z0, z1, rr, mt):     # vertical pipe
                fl.add_cyl("u_pipe_" + n, (x * MM, y * MM, (z0 + z1) / 2 * MM), rr, abs(z1 - z0) * MM,
                           mt, module=mod, module_objects=MO)

            def _xp(n, x0, x1, y, z, rr, mt):     # horizontal pipe along X
                fl.add_cyl("u_pipe_" + n, ((x0 + x1) / 2 * MM, y * MM, z * MM), rr, abs(x1 - x0) * MM,
                           mt, module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))

            def _yp(n, x, y0, y1, z, rr, mt):     # horizontal pipe along Y
                fl.add_cyl("u_pipe_" + n, (x * MM, (y0 + y1) / 2 * MM, z * MM), rr, abs(y1 - y0) * MM,
                           mt, module=mod, module_objects=MO, rotation=(math.radians(90), 0, 0))

            _yp(f"{nm}_supmain", sup_x, y_f, y_b, sup_z, r_main, blue)     # supply main (left)
            _yp(f"{nm}_drnmain", drn_x, y_f, y_b, drn_z, r_main, blue)     # drain main (right)
            _yp(f"{nm}_pwrmain", sup_x, y_f, y_b, pwr_z, r_pwr * 1.4, pwr)  # power main (left)
            for r in range(rows):
                _xp(f"{nm}_supbr{r}", sup_x, cxs[-1], rys[r], sup_z, r_br, blue)
                _xp(f"{nm}_drnbr{r}", drn_x, cxs[0], rys[r], drn_z, r_br, blue)
                _xp(f"{nm}_pwrbr{r}", sup_x, cxs[-1], rys[r], pwr_z, r_pwr, pwr)
                for c in range(cols):
                    idx = r * cols + c
                    if idx >= N:
                        continue
                    _vp(f"{nm}_inlet{idx}", cxs[c], rys[r], sup_z, ttop + 250, r_drop, blue)
                    _vp(f"{nm}_drain{idx}", cxs[c], rys[r], base_z_mm + 100, drn_z, r_drop, blue)
                    _vp(f"{nm}_pdrop{idx}", cxs[c], rys[r], pwr_z, base_z_mm + (ln or 3000) * 0.5, r_pwr, pwr)
            man_anchors = {"top": (sup_x, y_f, sup_z), "bottom": (drn_x, y_f, drn_z),
                           "centre": (x_mm, y_mm, ttop * 0.5)}
            return (first[0], man_anchors)
        return first

    if shape == "stack":
        dia = rd.get("dia_mm", 500)
        h = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["height"]
        asm = fl.prim_tower(nm, h, dia, (x_mm, y_mm, base_z_mm), material=mat,
                            taper=0.85, module=mod, module_objects=MO)
        # a flared tip
        fl.add_frustum(nm + "_tip", ((x_mm) * fl.MM, (y_mm) * fl.MM,
                       (base_z_mm + h) * fl.MM + 0.18), (dia * fl.MM) / 2 * 0.85,
                       (dia * fl.MM) / 2 * 1.15, 0.36,
                       fl.make_mat("m_flare_tip", (1.0, 0.35, 0.0), roughness=0.5),
                       module=mod, module_objects=MO)
        anchors = {"top": (x_mm, y_mm, base_z_mm + h),
                   "bottom": (x_mm, y_mm, base_z_mm + h * 0.15),
                   "centre": (x_mm, y_mm, base_z_mm + h * 0.4)}
        # Fix 3: platforms + caged ladder on the flare/oxidiser stack too.
        _add_platforms_and_ladder(nm, anchors["top"], anchors["bottom"],
                                  dia, MAT, mod, MO)
        return asm, anchors

    if shape in _REPLICATED_MACHINE_KIND:
        w = rd.get("w_mm", TYPE_DEFAULTS_MM[shape]["w"])
        dep = rd.get("d_mm", TYPE_DEFAULTS_MM[shape].get("d", 600))
        h = rd.get("h_mm", TYPE_DEFAULTS_MM[shape]["h"])
        body_d = max(400, h * 0.7)
        # qty-N principal machines (8 recirc pumps, 3 degasser blowers …) render as N DISTINCT
        # instances {nm}_inst{idx} in a compact cluster — so build_parts_manifest emits N rows
        # (P-101…P-108) and the P&ID / BFD / GA show every pump, not one collapsed unit. N==1
        # is byte-identical to the old single machine (inm==nm, xo==yo==0). Universal — any
        # pump/blower/compressor array, any class (mirrors the _VESSEL_KIND tank grid above).
        N = max(1, min(int(getattr(part, "qty", 1) or 1), _VESSEL_GRID_MAX_N))
        cols, rows_n = _vessel_grid_dims(N)
        px, py = w * _MACHINE_GRID_PITCH_X_FACTOR, dep * _MACHINE_GRID_PITCH_Y_FACTOR
        first = None
        for idx in range(N):
            r, c = divmod(idx, cols)
            xo = (c - (cols - 1) / 2.0) * px
            yo = (r - (rows_n - 1) / 2.0) * py
            inm = nm if N == 1 else f"{nm}_inst{idx}"
            asm, anchors = build_machine(inm, body_d, w, x_mm + xo, y_mm + yo,
                                         base_z_mm, mat, mod, MO, MAT)
            if first is None:
                first = (asm, anchors)
        return first

    if shape in ("package_box", "skid_box", "transformer_box", "cabinet",
                 "cabinet_small", "box"):
        w = rd.get("w_mm", TYPE_DEFAULTS_MM[shape].get("w", 1000))
        dep = rd.get("d_mm", TYPE_DEFAULTS_MM[shape].get("d", 900))
        h = rd.get("h_mm", TYPE_DEFAULTS_MM[shape].get("h", 1100))
        # for multi-qty cabinets, render a short row
        n = min(part.qty, 6) if shape in ("cabinet", "cabinet_small") else 1
        asm = None
        for i in range(n):
            xo = (i - (n - 1) / 2) * (w * 1.06)
            o = fl.add_box(f"{nm}_{i}",
                           ((x_mm + xo) * fl.MM, y_mm * fl.MM, (base_z_mm + h / 2) * fl.MM),
                           (w * fl.MM, dep * fl.MM, h * fl.MM), mat,
                           module=mod, module_objects=MO)
            o.dimensions = (w * fl.MM, dep * fl.MM, h * fl.MM)   # add_box halves; set true size
            if asm is None:
                asm = {"root": o, "name": nm}
        return asm, _box_anchors(x_mm, y_mm, base_z_mm, h)

    if shape == "gantry":
        sp = rd.get("span", TYPE_DEFAULTS_MM[shape]["span"])
        h = rd.get("height", TYPE_DEFAULTS_MM[shape]["height"])
        asm = fl.prim_gantry(nm, sp, h, (x_mm, y_mm, base_z_mm), material=mat,
                             axis="x", module=mod, module_objects=MO)
        return asm, _box_anchors(x_mm, y_mm, base_z_mm, h)

    if shape == "inline_spool":
        dia = rd.get("dia_mm", 350)
        ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["length"]
        o = fl.add_cyl(nm, (x_mm * fl.MM, y_mm * fl.MM, (base_z_mm + 600) * fl.MM),
                       (dia * fl.MM) / 2, ln * fl.MM, mat,
                       module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))
        anchors = {"top": (x_mm, y_mm, base_z_mm + 600 + dia * 0.5),
                   "bottom": (x_mm, y_mm, base_z_mm + 600 - dia * 0.5),
                   "centre": (x_mm, y_mm, base_z_mm + 600)}
        return {"root": o, "name": nm}, anchors

    # instrument / valve / transmitter — small box, clustered if many
    w = rd.get("w_mm", 250)
    dep = rd.get("d_mm", 250)
    h = rd.get("h_mm", 400)
    n = min(part.qty, 8)
    asm = None
    cols = max(1, int(math.ceil(math.sqrt(n))))
    for i in range(n):
        r, c = divmod(i, cols)
        xo = (c - (cols - 1) / 2) * (w * 1.5)
        yo = r * (dep * 1.5)
        o = fl.add_box(f"{nm}_{i}",
                       ((x_mm + xo) * fl.MM, (y_mm + yo) * fl.MM, (base_z_mm + h / 2) * fl.MM),
                       (w * fl.MM, dep * fl.MM, h * fl.MM), mat,
                       module=mod, module_objects=MO)
        o.dimensions = (w * fl.MM, dep * fl.MM, h * fl.MM)   # add_box halves; set true size
        if asm is None:
            asm = {"root": o, "name": nm}
    return asm, _box_anchors(x_mm, y_mm, base_z_mm, h)


def _add_tray_rings(nm, anchors, dia, MAT, mod, MO):
    """Tray-support rings up a fractionation column's SHELL — spaced between the
    real bottom-tan and top-tan z (from the vessel anchors, not base+h, since the
    skirt offsets the shell upward)."""
    ring_mat = MAT.get("u_col") or fl.make_mat("m_ring", (0.8, 0.82, 0.86),
                                               metallic=0.6, roughness=0.3)
    r = (dia * fl.MM) / 2
    x_mm, y_mm, z_bot = anchors["bottom"]
    z_top = anchors["top"][2]
    span = max(0.0, z_top - z_bot)
    n = max(4, int(span / 1400))
    for i in range(n):
        z = z_bot + span * (i + 1) / (n + 1)
        fl.add_torus(f"{nm}_tray_{i}", (x_mm * fl.MM, y_mm * fl.MM, z * fl.MM),
                     r + 0.03, 0.022, ring_mat, module=mod, module_objects=MO)


# ── Fix 3 — ACCESS PLATFORMS + CAGED LADDER on tall columns/towers/stacks ─────
# A bare tall pole reads as a placeholder. Real process columns + flare stacks
# carry circular access PLATFORMS at intervals up the height and a vertical
# caged LADDER strip between them. Universal: keyed only off the part's vertical
# anchors + radius (top/bottom), so it works on ANY tall vessel or stack.
PLATFORM_T_MM      = 90.0     # platform ring/grating thickness
PLATFORM_OUT_MM    = 700.0    # how far a platform projects beyond the shell radius
LADDER_W_MM        = 360.0    # caged-ladder strip width


def _add_platforms_and_ladder(nm, top_xyz_mm, bot_xyz_mm, dia_mm, MAT, mod, MO):
    """Add 1-2 access platform rings up the shell + a vertical caged-ladder strip
    on the +Y face. Spaced from the real top/bottom anchors so platforms land on
    the shell, not the skirt. Deterministic + universal (any tall vessel/stack)."""
    plat_mat = _nozzle_mat(MAT)
    if "u_grating" not in MAT:
        MAT["u_grating"] = fl.make_mat("m_u_grating", (0.50, 0.52, 0.55),
                                       metallic=0.45, roughness=0.55)
    grate = MAT["u_grating"]
    x_mm, y_mm, z_top = top_xyz_mm
    z_bot = bot_xyz_mm[2]
    span = max(0.0, z_top - z_bot)
    if span < 3000:                       # too short to bother — leave it bare
        return
    r = (dia_mm * fl.MM) / 2
    # a WIDE, THIN ring = a walking platform (not a fat doughnut): major radius
    # sits the walkway out past the shell; minor radius is the thin grating depth.
    ring_major = r + PLATFORM_OUT_MM * fl.MM
    ring_minor = max(0.06, PLATFORM_T_MM * fl.MM)
    # 1 platform for a medium tower, 2 for a tall one (every ~7 m).
    n_plat = 1 if span < 9000 else 2
    plat_levels = []
    for i in range(n_plat):
        # space platforms in the UPPER half (where access matters), below the top
        frac = 0.55 + 0.30 * (i / max(1, n_plat))
        z = z_bot + span * frac
        plat_levels.append(z)
        fl.add_torus(f"{nm}_platform_{i}",
                     (x_mm * fl.MM, y_mm * fl.MM, z * fl.MM),
                     ring_major, ring_minor, grate, module=mod, module_objects=MO)
        # a thin toe/hand rail just above the grating (a second, fatter ring edge)
        fl.add_torus(f"{nm}_platrail_{i}",
                     (x_mm * fl.MM, y_mm * fl.MM, (z + 1050) * fl.MM),
                     ring_major, max(0.02, r * 0.05), plat_mat,
                     module=mod, module_objects=MO)
    # vertical caged-ladder strip on the +Y face, from deck-ish up to the top
    lad_y = (y_mm + dia_mm * 0.5 + PLATFORM_OUT_MM * 0.35)
    lad_z0 = z_bot + span * 0.05
    lad_z1 = z_top
    lad_h = (lad_z1 - lad_z0)
    lad_zc = (lad_z0 + lad_z1) / 2
    # two side stringers + a partial hoop cage (read as a caged ladder)
    for dy in (-LADDER_W_MM * 0.5, LADDER_W_MM * 0.5):
        fl.add_box(f"u_ladstr_{nm}_{dy:.0f}",
                   (x_mm * fl.MM, (lad_y) * fl.MM, lad_zc * fl.MM),
                   (0.04, 0.04, lad_h * fl.MM), plat_mat,
                   module=mod, module_objects=MO)
    # cage hoops every ~1.4 m
    n_hoop = max(2, int(lad_h / 1400))
    for j in range(n_hoop):
        zc = lad_z0 + lad_h * (j + 0.5) / n_hoop
        fl.add_torus(f"u_ladhoop_{nm}_{j}",
                     (x_mm * fl.MM, (lad_y + 150) * fl.MM, zc * fl.MM),
                     LADDER_W_MM * fl.MM * 0.55, 0.018, plat_mat,
                     module=mod, module_objects=MO,
                     rotation=(math.radians(90), 0, 0))


# ═══════════════════════════════════════════════════════════════════════════
# Placement — region bands along X (anti-vomit core)
# ═══════════════════════════════════════════════════════════════════════════

# Parts whose shape goes on the front instrument/cabinet row, not the deck rows.
FRONT_ROW_SHAPES = {"instrument", "cabinet_small"}
# Parts that prefer back row (the big silhouette pieces).
BIG_SHAPES = {"tall_column", "tall_vessel", "vertical_vessel", "horizontal_vessel",
              "tank", "stack", "package_box"}

# ── UNIVERSAL "is this a stack / flare / very-tall slim column?" test ──────────
# (Tristan visual-judge 2026-06-10, Fix 1 FRAME FIT.) The skid frame must hug the
# EQUIPMENT BULK, not the full plant extent — so stacks, flares and very-tall slim
# columns are excluded from BOTH the frame's height target AND its footprint, and
# left to POKE THROUGH the roof. ONE test, reused by the height calc + the
# footprint calc, so the two never disagree. Universal (any archetype): a part is
# "tall" if its NAME marks it a stack/flare/vent/chimney OR its silhouette is
# slim-and-tall (height/diameter aspect > TALL_ASPECT). Not per-class.
TALL_NAME_RE = re.compile(r"\bstack\b|\bflare\b|\bvent\b|chimney|\bflue\b",
                          re.IGNORECASE)
TALL_ASPECT = 4.0   # height / max(footprint_x, footprint_y) above this = slim tower


def is_tall_for_frame(part):
    """True if `part` should be EXCLUDED from the skid-frame footprint + height
    target (a stack / flare / very-tall slim column that towers above the deck).
    Reused by build_skid_frame's footprint bbox AND main()'s height target so the
    frame is sized to the equipment bulk only and the tall items poke through."""
    if part.shape == "stack":            # classifier already groups flare/chimney here
        return True
    if TALL_NAME_RE.search(str(part.name)):
        return True
    fx, fy, h = footprint_mm(resolved_dims_mm(part))
    base = max(1.0, min(fx, fy))
    return (h / base) > TALL_ASPECT


def equipment_bbox_mm(parts, margin_mm):
    """Footprint bounding box (mm) of the NON-tall equipment only, padded by
    margin_mm. Stacks / flares / slim towers (is_tall_for_frame) are excluded so
    the skid frame hugs the equipment bulk instead of stretching to a lone flare
    in a corner. Falls back to ALL placed parts if every part is 'tall'. Uses each
    part's full footprint half-extents (not just its centre) so a wide horizontal
    vessel near the edge is fully enclosed, not clipped."""
    def _extents(pool):
        xs0 = xs1 = ys0 = ys1 = None
        for p in pool:
            if not p.placed_xyz_mm:
                continue
            cx, cy = p.placed_xyz_mm[0], p.placed_xyz_mm[1]
            fx, fy, _ = footprint_mm(resolved_dims_mm(p))
            hx, hy = fx / 2.0, fy / 2.0
            lo_x, hi_x = cx - hx, cx + hx
            lo_y, hi_y = cy - hy, cy + hy
            xs0 = lo_x if xs0 is None else min(xs0, lo_x)
            xs1 = hi_x if xs1 is None else max(xs1, hi_x)
            ys0 = lo_y if ys0 is None else min(ys0, lo_y)
            ys1 = hi_y if ys1 is None else max(ys1, hi_y)
        return xs0, xs1, ys0, ys1

    equip = [p for p in parts if not is_tall_for_frame(p)]
    x0, x1, y0, y1 = _extents(equip)
    if x0 is None:                       # everything was tall — frame the lot
        x0, x1, y0, y1 = _extents(parts)
    if x0 is None:                       # nothing placed at all — safe default
        return {"x0": -3000, "x1": 3000, "y0": -3000, "y1": 3000}
    return {"x0": x0 - margin_mm, "x1": x1 + margin_mm,
            "y0": y0 - margin_mm, "y1": y1 + margin_mm}


def _row_extent(items_footprints, gap):
    """Total X length a row of (fx,...) footprints would consume with `gap`."""
    return sum(fp[0] for fp in items_footprints) + gap * max(0, len(items_footprints) - 1)


def _place_grid(plist, x0, x_window, y_front, base_z_mm, MAT, MO):
    """Pack small parts (instruments/cabinets) into a COMPACT 2D grid that fits
    inside x_window — wrapping in X and stepping back in +Y. This is what keeps
    a 38-transmitter region from stringing 50 m down the skid (the scale bug):
    crowded field-instrument / cabinet regions belong in a compact block, like a
    marshalling area, NOT spread along the process line."""
    if not plist:
        return x0
    # cell size = the largest footprint in the group (uniform grid reads cleanly)
    cell_w = max(footprint_mm(resolved_dims_mm(p))[0] for p in plist)
    cell_d = max(footprint_mm(resolved_dims_mm(p))[1] for p in plist)
    pitch_x = cell_w * 1.35
    pitch_y = cell_d * 1.5
    cols = max(1, int(x_window // pitch_x))
    for i, p in enumerate(plist):
        r, c = divmod(i, cols)
        x = x0 + pitch_x * (c + 0.5)
        y = y_front + pitch_y * r          # step toward +Y (away from walkway)
        asm, anchors = build_part(p, x, y, base_z_mm, MAT, MO)
        p.obj_anchor, p.anchors = asm, anchors
        p.placed_xyz_mm = anchors["centre"]
    used_cols = min(cols, len(plist))
    return x0 + pitch_x * used_cols


def _shelf_pack(plist, x_left, y_front, target_width, base_z_mm, gap, MAT, MO,
                y_dir=+1):
    """Shelf-pack a list of parts into rows that WRAP when a row reaches
    target_width, stacking successive rows in the y_dir direction. This is the
    2D bin-pack that keeps a region SQUARE-ish instead of a single long row —
    the core scale fix (a 70-part plant laid single-file is a 90 m ribbon; the
    same parts shelf-packed are a compact ~20 m skid). Returns
    (x_extent_used, y_extent_used)."""
    if not plist:
        return 0.0, 0.0
    x = x_left
    row_y = y_front
    row_idx = 0
    row_depth = 0.0           # deepest footprint in the current row (for y step)
    x_used = x_left
    y_used = y_front
    for p in plist:
        fx, fy, _ = footprint_mm(resolved_dims_mm(p))
        if x + fx > x_left + target_width and x > x_left:
            # wrap: advance to a new shelf
            row_idx += 1
            row_y = row_y + y_dir * (row_depth + gap)
            x = x_left
            row_depth = 0.0
        x += fx / 2
        asm, anchors = build_part(p, x, row_y, base_z_mm, MAT, MO)
        p.obj_anchor, p.anchors = asm, anchors
        p.placed_xyz_mm = anchors["centre"]
        x += fx / 2 + gap
        row_depth = max(row_depth, fy)
        x_used = max(x_used, x)
        y_used = max(y_used, row_y) if y_dir > 0 else min(y_used, row_y)
    return x_used - x_left, abs(y_used - y_front) + row_depth


def _place_region(rparts, x_left, y_base, MAT, MO):
    """Place ONE region as a compact, square-ish bay anchored at (x_left, y_base).
    Three sub-blocks stacked in Y within the bay: big process vessels at the
    BACK (highest Y), medium vessels in the MIDDLE, small instruments/cabinets
    in a grid at the FRONT (lowest Y). Each block 2D-shelf-packs so the bay
    grows in both X and Y. Returns the bay's used X-width (mm)."""
    big = [p for p in rparts if p.shape in BIG_SHAPES]
    small = [p for p in rparts if p.shape in FRONT_ROW_SHAPES]
    medium = [p for p in rparts if p not in big and p not in small]

    all_fps = [footprint_mm(resolved_dims_mm(p)) for p in rparts]
    total_area = sum(fx * fy for fx, fy, _ in all_fps)
    widest = max((fx for fx, _, _ in all_fps), default=2000)
    target_width = max(MIN_REGION_WIDTH_MM, widest,
                       min(MAX_REGION_WIDTH_MM, math.sqrt(total_area) * REGION_ASPECT))

    big_y = y_base + BIG_BLOCK_DY_MM       # back of the bay
    med_y = y_base + MED_BLOCK_DY_MM       # middle
    small_y = y_base + SMALL_BLOCK_DY_MM   # front
    # MEGA-GRID GUARD: if the big band holds a qty-N replicated MEGA-GRID (a 10-tank hall,
    # ~40 m deep), it would otherwise swallow the medium + small bands (centred only a few
    # metres in front of it) — the tanks-on-top-of-the-pumps overlap. Detect the grid's true
    # half-depth and push the medium + small bands BEHIND the grid's back edge (a clear gap)
    # so the ancillary kit (pumps / degasser / instruments) sits in its OWN strip behind the
    # tank hall, never inside it. Universal: only triggers for a hall-sized replicated grid;
    # a normal region keeps the original front→back band offsets.
    grid_half_depth = 0.0
    for p in big:
        q = int(getattr(p, "qty", 1) or 1)
        if p.shape in _VESSEL_KIND and 2 <= q <= _VESSEL_GRID_MAX_N:
            _gx, gy, _gz = footprint_mm(resolved_dims_mm(p))
            if _gx * gy > 150e6:               # hall-sized replicated grid
                grid_half_depth = max(grid_half_depth, gy / 2.0)
    # Width the ancillary (medium + small) bands shelf-pack at. Normally the region
    # target_width (capped at MAX_REGION_WIDTH_MM = 10 m). BUT when a hall-sized
    # mega-grid is present, the grid is far WIDER than 10 m (a 10-tank farm ≈ 45 m),
    # so packing the 27 ancillary parts at only 10 m strings them ~13 m DEEP in a
    # narrow strip behind the tanks (council 2026-06-16: the 95 m RAS Y-extent). Pack
    # them across the GRID'S width instead → the same parts read as a 1-2 row service
    # alley spanning the hall, not a deep tail. Y shrinks, the strip reads correctly.
    ancillary_width = target_width
    if grid_half_depth > 0.0:
        # The mega-grid's plan width (the widest big part's footprint = the grid span).
        grid_width = max((footprint_mm(resolved_dims_mm(p))[0] for p in big), default=target_width)
        ancillary_width = max(target_width, grid_width)
        # Back-gap between the tank grid and the ancillary alley behind it. 4.0 m was a
        # generous double aisle; 2.5 m is still a walkable maintenance gap and trims the
        # Y-tail (applied to BOTH the medium and the small band offsets, so ×2).
        MEGA_GRID_BACK_GAP_MM = 2500
        behind = big_y + grid_half_depth + MEGA_GRID_BACK_GAP_MM
        med_y = behind
        small_y = behind + _band_depth_for(medium) + MEGA_GRID_BACK_GAP_MM
    big_dx, _ = _shelf_pack(big, x_left, big_y, target_width, DECK_Z_MM,
                            PART_GAP_MM, MAT, MO, y_dir=+1)
    med_dx, _ = _shelf_pack(medium, x_left, med_y, ancillary_width, DECK_Z_MM,
                            PART_GAP_MM, MAT, MO, y_dir=+1)
    _place_grid(small, x_left, ancillary_width, small_y, DECK_Z_MM, MAT, MO)
    return max(big_dx, med_dx, target_width, MIN_REGION_WIDTH_MM)


def _band_depth_for(plist):
    """Deepest single-part Y footprint in a band (headroom needed for one shelf)."""
    if not plist:
        return 0.0
    return max(footprint_mm(resolved_dims_mm(p))[1] for p in plist)


def _estimate_region_width(rparts):
    """Pure (no-placement) estimate of the bay width _place_region will consume —
    mirrors its target_width term (the dominant width, since the shelf-packers wrap
    at target_width). Used to BALANCE banks BEFORE placing so no bank is left much
    shorter than the other (the empty-corner cause). Universal, no per-class data."""
    all_fps = [footprint_mm(resolved_dims_mm(p)) for p in rparts]
    if not all_fps:
        return MIN_REGION_WIDTH_MM
    total_area = sum(fx * fy for fx, fy, _ in all_fps)
    widest = max(fx for fx, _, _ in all_fps)
    return max(MIN_REGION_WIDTH_MM, widest,
               min(MAX_REGION_WIDTH_MM, math.sqrt(total_area) * REGION_ASPECT))


def _balanced_bank_split(region_list, widths, n_banks):
    """Partition region_list into n_banks CONTIGUOUS groups (process order kept
    within each bank) chosen so the banks' total widths are as EQUAL as possible —
    minimising the widest bank. Contiguous-cut DP over the cumulative widths;
    returns a list of region-key sub-lists. This replaces the equal-COUNT split
    (which left a width-heavy bank long and its partner short → an empty corner).
    Fix 2 DENSITY (Tristan 2026-06-10)."""
    n = len(region_list)
    if n_banks <= 1 or n <= 1:
        return [list(region_list)]
    n_banks = min(n_banks, n)
    span = [w + REGION_GAP_MM for w in widths]          # each region's X cost
    # DP: best[k][i] = min achievable max-bank-width using first i regions in k banks
    INF = float("inf")
    best = [[INF] * (n + 1) for _ in range(n_banks + 1)]
    cut = [[0] * (n + 1) for _ in range(n_banks + 1)]
    pref = [0.0]
    for s in span:
        pref.append(pref[-1] + s)
    for i in range(1, n + 1):
        best[1][i] = pref[i]
    for k in range(2, n_banks + 1):
        for i in range(k, n + 1):
            for j in range(k - 1, i):     # previous bank ends at j
                cost = max(best[k - 1][j], pref[i] - pref[j])
                if cost < best[k][i]:
                    best[k][i] = cost
                    cut[k][i] = j
    # walk the cuts back into contiguous slices
    bounds = []
    i, k = n, n_banks
    while k > 0:
        j = cut[k][i] if k > 1 else 0
        bounds.append((j, i))
        i, k = j, k - 1
    bounds.reverse()
    return [region_list[a:b] for a, b in bounds]


# FLOW-LAYOUT handoff (2026-06-11): place_process_plant sets this to
# (flow_regions, periphery_regions) so place_all lays the flow regions as a
# process TRAIN folded ALONG THE FLOW (connected stages adjacent) with the
# non-flow regions pushed to a BACK row. None → the legacy width-balanced
# rank-order banking (every other family + the no-flow-graph fallback).
_PLANT_FLOW_PLAN = None
# Set by place_all to the set of region_keys that ended up in the TRAIN lanes (the
# flow regions actually placed), so place_process_plant can site the pipe-rack
# spine to bisect the TRAIN equipment (short flow taps) — not the train↔periphery
# aisle (which is far behind the train, inflating every flow run's riser).
_PLANT_FLOW_TRAIN_REGIONS = None


def _flow_fold_banks(flow_regions, region_w, n_lanes):
    """Fold the FLOW-ORDERED region list into ≤ n_lanes contiguous lanes so the
    process train stays compact WITHOUT breaking flow-adjacency. Unlike the
    width-balanced module split (which reorders for equal lane widths and scatters
    connected stages), this keeps the flow order INTACT and only cuts the train
    into contiguous runs at width-balanced fold points. Because the lanes are
    serpentined (odd lanes reversed) by the caller, the region at a fold boundary
    sits at the SAME X as its flow-neighbour in the next lane — so directly-
    connected stages remain adjacent (side-by-side across the aisle) even across a
    fold. Returns a list of contiguous region sub-lists (flow order preserved)."""
    n = len(flow_regions)
    if n_lanes <= 1 or n <= 1:
        return [list(flow_regions)]
    n_lanes = min(n_lanes, n)
    # Contiguous width-balanced cut over the FLOW ORDER (same DP as the rank
    # splitter, but the input order is the connectivity order, not the rank list —
    # so the cut never reorders the train, it only chooses where to wrap).
    return _balanced_bank_split(flow_regions,
                                [region_w[rk] for rk in flow_regions], n_lanes)


def place_all(parts, regions, MAT, MO):
    """Arrange the process regions in process-flow order across N SERPENTINE
    BANKS (lanes stacked in Y). Bank 0 flows left→right; bank 1 sits behind it
    (higher Y) flowing right→left; etc. This keeps the overall plant footprint
    roughly SQUARE — an 8-region, 70-part plant laid in a single lane is a ~55 m
    ribbon (aspect 5); folded into 2 banks it is a compact ~30 m × ~24 m skid
    (aspect ~1.3) that frames cleanly and reads as an assembled plant.

    FLOW-LAYOUT (2026-06-11): when _PLANT_FLOW_PLAN is set (place_process_plant),
    the bank assignment is GRAPH-DRIVEN — the flow regions are laid as a process
    TRAIN in connectivity order (feed→reaction→separation→upgrading→product),
    folded ALONG THE FLOW so connected stages stay adjacent, and the NON-FLOW
    regions (utilities / electrical / control / instruments) are pushed to a BACK
    row off the train rather than interleaved through it. Falls back to the
    width-balanced rank banking below when no flow plan is set.

    DENSITY (Fix 2, Tristan 2026-06-10): banks are split by a width-BALANCED
    contiguous partition (not equal region count) so neither bank is left far
    shorter than the other, and every bank is CENTRED on a shared centreline so the
    framed footprint fills evenly instead of leaving an empty corner/edge. Process
    flow (left→right, serpentine) is preserved within each bank.

    Within each region, parts 2D-shelf-pack into a square-ish bay (big vessels
    back, medium middle, instruments/cabinets front). Returns
    (plant_bbox_mm, region_centres)."""
    region_list = [rk for rk in regions if any(p.region_key == rk for p in parts)]
    n_banks = max(1, min(N_BANKS, len(region_list)))

    # Pre-estimate each region's width (needed by every banking path below).
    region_parts = {rk: [p for p in parts if p.region_key == rk]
                    for rk in region_list}
    # ENVELOPE / BUILDING-SHELL parts (floor slab / structural / portal frame / enclosure — a part
    # whose plan footprint is BUILDING-SCALE, far larger than any process vessel) are pulled OUT of
    # region placement here and placed LAST, CENTRED on the finished plant so they ENCLOSE it (the
    # slab under everything, the frame around it). Shelf-packing them strings each oversized shell
    # into its own row → a ~400 m Y-column that shoved every lane hundreds of metres back (the
    # ~500 m RAS spread + £3.1 M routed cost). A shell is plant-scale by AREA (≥ 200 m²) OR both
    # long AND wide (≥ 25 m × ≥ 6 m — the wide-AND-long test spares a long THIN conveyor); a
    # mega-grid vessel is excluded (handled by the mega-array guard). Universal, footprint-keyed.
    def _is_envelope_part(p):
        fx, fy, _ = footprint_mm(resolved_dims_mm(p))
        return (p.shape not in _VESSEL_KIND
                and (fx * fy >= 200e6 or (max(fx, fy) >= 25000 and min(fx, fy) >= 6000)))
    _envelope_parts = [p for p in parts if _is_envelope_part(p)]
    if _envelope_parts:
        _env_ids = {id(p) for p in _envelope_parts}
        region_parts = {rk: [p for p in region_parts[rk] if id(p) not in _env_ids]
                        for rk in region_list}
        region_list = [rk for rk in region_list if region_parts[rk]]
        n_banks = max(1, min(N_BANKS, len(region_list)))
    region_w = {rk: _estimate_region_width(region_parts[rk]) for rk in region_list}

    # Detect mega-array regions UP FRONT (a hall-sized qty-N replicated vessel grid,
    # e.g. the RAS 10-tank farm). They are pulled into their OWN solo lane below, so
    # they must ALSO be excluded from the train fold-width decision — otherwise the
    # giant tank region inflates train_w, forces the thin remaining train to fold into
    # 2 lanes, and THEN gets removed, leaving two near-empty Y lanes where one would do
    # (council 2026-06-16: a chunk of the 95 m RAS Y-extent was this spurious fold).
    def _region_holds_mega_array(rk):
        for p in region_parts[rk]:
            q = int(getattr(p, "qty", 1) or 1)
            if p.shape in _VESSEL_KIND and 2 <= q <= _VESSEL_GRID_MAX_N:
                fx, fy, _ = footprint_mm(resolved_dims_mm(p))
                if fx * fy > 150e6:           # hall-sized replicated grid
                    return True
        return False
    _mega_regions_pre = {rk for rk in region_list if _region_holds_mega_array(rk)}

    if _PLANT_FLOW_PLAN is not None:
        # ── GRAPH-DRIVEN FLOW LAYOUT ──────────────────────────────────────────
        # banks = [flow lane(s) … , periphery lane]. The flow train is folded
        # along the flow into the FRONT lanes (so the process reads left→right and
        # connected stages stay adjacent); the periphery (non-flow) regions go to
        # ONE back lane behind the train. Any region missing from the plan (should
        # not happen — the plan covers every region) is appended to the periphery
        # so a part is never dropped.
        flow_regions, periphery = _PLANT_FLOW_PLAN
        present = set(region_list)
        flow_regions = [rk for rk in flow_regions if rk in present]
        periphery = [rk for rk in periphery if rk in present]
        covered = set(flow_regions) | set(periphery)
        periphery += [rk for rk in region_list if rk not in covered]   # safety net
        # Give the TRAIN the bank budget; the periphery takes one extra back lane.
        # The train stays a SINGLE left→right lane while its total width fits under
        # FLOW_TRAIN_SINGLE_LANE_MAX_MM — that gives the SHORTEST connections (every
        # stage X-adjacent to the stage it feeds, no cross-lane pipe). Only a train
        # too wide to read in one row folds along the flow into ≤ N_BANKS lanes
        # (serpentined, so the fold-boundary stages still sit adjacent across the
        # aisle). Keeping the typical 5-6 region plant a single lane is what makes
        # the pipe runs short; the periphery lane behind it keeps the footprint sane.
        # Width that decides the fold uses only the regions that STAY in the train —
        # mega-array regions (pulled solo below) are excluded so they don't trigger a
        # spurious 2-lane fold of the thin remaining train.
        fold_regions = [rk for rk in flow_regions if rk not in _mega_regions_pre]
        train_w = sum(region_w[rk] for rk in fold_regions) \
            + REGION_GAP_MM * max(0, len(fold_regions) - 1)
        train_lanes = 1 if train_w <= FLOW_TRAIN_SINGLE_LANE_MAX_MM \
            else min(N_BANKS, max(1, len(flow_regions)))
        banks = _flow_fold_banks(flow_regions, region_w, train_lanes) if flow_regions else []
        # Publish the TRAIN regions so place_process_plant sites the spine to bisect
        # the train (short flow taps), not the far train↔periphery aisle.
        global _PLANT_FLOW_TRAIN_REGIONS
        _PLANT_FLOW_TRAIN_REGIONS = set(flow_regions)
        if periphery:
            banks = banks + [periphery]      # periphery is the LAST (back) lane
        banks = [b for b in banks if b]
        n_banks = max(1, len(banks))
        print(f"[univ][flow] train lanes={len(banks) - (1 if periphery else 0)} "
              f"(regions {flow_regions}); periphery back row={periphery}")
    else:
        # ── LEGACY width-balanced RANK banking (every other family) ───────────
        banks = _balanced_bank_split(region_list,
                                     [region_w[rk] for rk in region_list], n_banks)

    # ── MEGA-ARRAY ISOLATION (universal qty-N overlap fix) ────────────────────────
    # A region that holds a qty-N replicated MEGA-ARRAY (RAS 10×10 m rearing tanks ≈ a
    # 50×40 m hall) is an order of magnitude bigger than the rest. Left sharing a serpentine
    # lane, its huge footprint engulfs the regions placed beside it in X AND the lane behind
    # it in Y (the recurring RAS overlap: tanks on top of the biofilter / instrument grid).
    # Pull every such region into its OWN SOLO lane so (a) nothing shares its X-lane and
    # (b) the post-placement Y-compaction (which measures real placed extents) separates it
    # from the other lanes by its true depth. Universal + deterministic: a region qualifies
    # only when it contains a 2..12-qty replicated vessel whose grid footprint dominates
    # (≥ MEGA_REGION_AREA_FACTOR × the median region area) — zero effect on plants without
    # a big parallel array (CO2/SAF single-train: no region qualifies, banks unchanged).
    def _region_area_mm2(rk):
        a = 0.0
        for p in region_parts[rk]:
            fx, fy, _ = footprint_mm(resolved_dims_mm(p))
            a += fx * fy
        return a

    def _has_mega_array(rk):
        for p in region_parts[rk]:
            q = int(getattr(p, "qty", 1) or 1)
            if p.shape in _VESSEL_KIND and 2 <= q <= _VESSEL_GRID_MAX_N:
                fx, fy, _ = footprint_mm(resolved_dims_mm(p))
                # the replicated grid alone is a hall-sized footprint (> ~150 m²)
                if fx * fy > 150e6:
                    return True
        return False

    if len(region_list) > 1:
        areas = sorted(_region_area_mm2(rk) for rk in region_list)
        median_area = areas[len(areas) // 2] or 1.0
        MEGA_REGION_AREA_FACTOR = 4.0
        mega = {rk for rk in region_list
                if _has_mega_array(rk)
                and _region_area_mm2(rk) >= MEGA_REGION_AREA_FACTOR * median_area}
        if mega:
            # rebuild banks: drop the mega regions from their shared lanes, then append
            # each as its OWN solo lane (kept in flow order, after the lanes they led).
            new_banks = []
            for b in banks:
                kept = [rk for rk in b if rk not in mega]
                if kept:
                    new_banks.append(kept)
            for rk in region_list:               # deterministic order
                if rk in mega:
                    new_banks.append([rk])        # solo lane
            banks = [b for b in new_banks if b]
            n_banks = max(1, len(banks))
            print(f"[univ][flow] mega-array isolation: {sorted(mega)} → own solo lane(s); "
                  f"banks now {len(banks)}")

    # Common centreline = the widest bank's total span; shorter banks centre to it
    # (no lopsided empty corner). Each bank's span = Σ widths + gaps between them.
    def _bank_span(bank):
        if not bank:
            return 0.0
        return sum(region_w[rk] for rk in bank) + REGION_GAP_MM * (len(bank) - 1)
    max_span = max((_bank_span(b) for b in banks), default=0.0)

    region_centres = {}
    bank_lane_dy = BANK_LANE_PITCH_MM       # Y pitch between bank lanes (initial)
    bank_of_region = {}                     # region_key → bank index (for compaction)
    for bank_idx, bank_regions in enumerate(banks):
        if not bank_regions:
            continue
        # alternate flow direction per bank (serpentine) so the process line is
        # continuous: even banks L→R, odd banks R→L.
        if bank_idx % 2 == 1:
            bank_regions = list(reversed(bank_regions))
        y_base = bank_idx * bank_lane_dy
        # centre this bank within the widest-bank span → fills the footprint evenly
        cursor_x = (max_span - _bank_span(bank_regions)) / 2.0
        for rk in bank_regions:
            rparts = region_parts[rk]
            width = _place_region(rparts, cursor_x, y_base, MAT, MO)
            region_centres[rk] = (cursor_x + width / 2, y_base)
            bank_of_region[rk] = bank_idx
            cursor_x += width + REGION_GAP_MM

    # Fix 2 DENSITY (Tristan 2026-06-10) — POST-PLACEMENT Y-COMPACTION.
    # The fixed BANK_LANE_PITCH_MM left a dead Y-band between the two lanes (each
    # bank's equipment is only ~6 m deep but the lanes sat 8 m apart, so the frame
    # was much deeper than the equipment → empty bays front + middle). Now we
    # measure each bank's ACTUAL placed Y-extent and re-stack the lanes so
    # successive banks are separated by just BANK_COMPACT_GAP_MM. Purely a Y shift
    # per bank — X (process-flow order) is untouched. Universal + deterministic.
    _compact_banks_in_y(parts, bank_of_region, region_centres, n_banks)

    # actual bbox from placed-equipment EXTENTS (half-footprints, not just centres)
    # so the frame/bbox hug the TRUE equipment outline per-axis (Fix 2): the frame
    # then fills with no large empty margin. Tall stacks/flares are still included
    # here (they sit inside the X/Y outline; only their HEIGHT pokes through).
    min_x, max_x = 1e12, -1e12
    min_y, max_y = 1e12, -1e12
    for p in parts:
        if not p.placed_xyz_mm:
            continue
        cx, cy = p.placed_xyz_mm[0], p.placed_xyz_mm[1]
        fx, fy, _ = footprint_mm(resolved_dims_mm(p))
        min_x = min(min_x, cx - fx / 2); max_x = max(max_x, cx + fx / 2)
        min_y = min(min_y, cy - fy / 2); max_y = max(max_y, cy + fy / 2)
    # Place the ENVELOPE shells CENTRED on the finished equipment bbox so they ENCLOSE the plant
    # (slab under everything, frame + enclosure around it), then extend the bbox to the building
    # boundary so the skid frame + framing hug the building rather than only the equipment.
    if _envelope_parts and max_x > -1e11:
        _ecx = (min_x + max_x) / 2.0
        _ecy = (min_y + max_y) / 2.0
        for p in _envelope_parts:
            # The building SHELL (floor slab / frame / portal / enclosure) is ALREADY represented
            # by the SKID-FRAME wireframe that encloses the whole plant; drawing its solid mesh
            # (a 2,980 m² opaque slab) just obscures the equipment in every view. Record its
            # CENTRED position (for the BoM + the enclosing bbox) WITHOUT a solid mesh.
            p.placed_xyz_mm = (_ecx, _ecy, 0.0)
            fx, fy, _ = footprint_mm(resolved_dims_mm(p))
            min_x = min(min_x, _ecx - fx / 2); max_x = max(max_x, _ecx + fx / 2)
            min_y = min(min_y, _ecy - fy / 2); max_y = max(max_y, _ecy + fy / 2)
    bbox = {"x0": min_x - 800, "x1": max_x + 800,
            "y0": min_y - 800, "y1": max_y + 800}
    return bbox, region_centres


def _compact_banks_in_y(parts, bank_of_region, region_centres, n_banks):
    """Shift each serpentine BANK in Y so the lanes are contiguous (separated by
    BANK_COMPACT_GAP_MM) instead of sitting at the fixed BANK_LANE_PITCH_MM that
    left a dead empty band between them. Measures each bank's real placed Y-extent
    (part centre ± half-footprint), then re-bases bank k to start right after bank
    k-1. ONLY the Y of each part (and region_centre) moves — X / Z and the L→R
    process order are preserved. Universal: derived from placed geometry, no class
    data. No-op when there is a single bank."""
    global _PLANT_BANK_AISLES
    _PLANT_BANK_AISLES = []
    final_bands = []      # (front_y, back_y) per bank AFTER the Y-shift, for the spine
    if n_banks <= 1:
        return
    # group placed parts by bank
    bank_parts = {b: [] for b in range(n_banks)}
    for p in parts:
        if p.placed_xyz_mm is None:
            continue
        b = bank_of_region.get(p.region_key)
        if b is None:
            continue
        bank_parts[b].append(p)

    # current Y-extent (front edge, back edge) per non-empty bank, in bank order
    extents = {}
    for b, plist in bank_parts.items():
        if not plist:
            continue
        lo = hi = None
        for p in plist:
            _, fy, _ = footprint_mm(resolved_dims_mm(p))
            y = p.placed_xyz_mm[1]
            l, h = y - fy / 2.0, y + fy / 2.0
            lo = l if lo is None else min(lo, l)
            hi = h if hi is None else max(hi, h)
        extents[b] = (lo, hi)

    # Re-base each bank so the gap to the previous bank's back edge is EXACTLY
    # BANK_COMPACT_GAP_MM — a real maintenance/pipe-rack AISLE. This both PULLS a
    # bank forward (closing a dead empty band) AND PUSHES it back when the banks
    # were packed tighter than the aisle (so the overhead rack spine has a genuine
    # corridor to run down). The first bank stays put; L→R process order + X/Z are
    # untouched. (Pushing back grows the footprint slightly — a worthwhile trade for
    # a clean rack aisle; the frame re-hugs the new extent.)
    ordered = sorted(extents.keys())
    prev_back = None
    moved = set()        # object pointers already shifted (guards prefix overlap)
    for b in ordered:
        lo, hi = extents[b]
        depth = hi - lo
        if prev_back is None:
            target_front = lo            # keep first bank where it is
        else:
            target_front = prev_back + BANK_COMPACT_GAP_MM   # ENFORCE the aisle gap
        shift = target_front - lo
        if abs(shift) > 1.0:
            # Move EVERY Blender object this bank's parts created — matched by each
            # part's object-name PREFIX (build_part names all of a part's sub-meshes
            # — shell, heads, skirt, tray rings, platforms, ladders, nozzles — with
            # that prefix). Prefix-shift is robust where walking the heterogeneous
            # assembly dict would miss the decorations. Collect prefixes first.
            prefixes = tuple(_part_prefix(p.name) for p in bank_parts[b])
            _shift_objects_by_prefix(prefixes, shift, moved)
            for p in bank_parts[b]:
                x, y, z = p.placed_xyz_mm
                p.placed_xyz_mm = (x, y + shift, z)
                if p.anchors:
                    p.anchors = {k: (v[0], v[1] + shift, v[2])
                                 for k, v in p.anchors.items()}
            for rk, b2 in bank_of_region.items():
                if b2 == b and rk in region_centres:
                    cx, cy = region_centres[rk]
                    region_centres[rk] = (cx, cy + shift)
        # record this bank's FINAL Y-band (front, back) so place_process_plant can
        # site the pipe-rack spine in the aisle BETWEEN banks (not over equipment).
        final_bands.append((target_front, target_front + depth))
        prev_back = target_front + depth      # this bank's (possibly shifted) back edge

    # Publish the inter-bank aisle centres + widths (the gaps between consecutive
    # final bank bands) for the router. The WIDEST one is the main rack aisle.
    # (_PLANT_BANK_AISLES already declared global + reset at the top of this fn.)
    final_bands.sort()
    for (f0, b0), (f1, b1) in zip(final_bands[:-1], final_bands[1:]):
        aisle_lo, aisle_hi = b0, f1
        if aisle_hi - aisle_lo > 1.0:
            _PLANT_BANK_AISLES.append(((aisle_lo + aisle_hi) / 2.0, aisle_hi - aisle_lo))


def _shift_objects_by_prefix(prefixes, dy_mm, moved):
    """Translate every scene object whose name starts with one of `prefixes` by
    dy_mm along +Y, skipping any object already in `moved` (so an exact-prefix
    overlap between two banks can never double-shift a shared object). Used by the
    Fix-2 bank Y-compaction to move a whole bank's placed geometry (every sub-mesh
    a part built shares the part-name prefix)."""
    if not prefixes:
        return
    if isinstance(prefixes, str):
        prefixes = (prefixes,)
    # Also carry each part's qty-N MANIFOLD ("u_pipe_<prefix>_*") so a bank Y-shift moves the
    # array's supply/drain/power headers WITH it — otherwise the manifold is left behind and
    # hangs in mid-air as a floating "comb" (Tristan 2026-06-22). Same fix as _shift_part_xy.
    prefixes = tuple(prefixes) + tuple("u_pipe_" + p for p in prefixes)
    dy = dy_mm * fl.MM
    for obj in bpy.data.objects:
        if not obj.name.startswith(prefixes):
            continue
        try:
            oid = obj.as_pointer()
        except (AttributeError, ReferenceError):
            oid = id(obj)
        if oid in moved:
            continue
        moved.add(oid)
        try:
            obj.location[1] += dy
        except (AttributeError, TypeError, IndexError):
            pass


# ═══════════════════════════════════════════════════════════════════════════
# Topology routing
# ═══════════════════════════════════════════════════════════════════════════

# Topology endpoints that are ABSTRACTIONS, not discrete placed parts — a bus
# rail, a battery-limit supply, or an aggregate "X and Y" group. These must NOT
# be force-matched onto a random nearby part (it draws a misleading pipe); the
# router skips + logs them. Matched as a substring on the raw endpoint name.
ABSTRACT_ENDPOINTS_RE = re.compile(
    r"electrical_supply|power_supply|process_compressors_and_pumps|"
    r"compressors_and_pumps|_and_pumps|utilities?$|grid|battery_limit",
    re.IGNORECASE,
)

# ── Fix 1 (Tristan 2026-06-10) — ABSTRACT-ENDPOINT GENERALISATION ─────────────
# Two abstract-endpoint families that USED to make the router skip an edge are now
# routable so the connectivity is complete (the e-fuel ELECTRICAL-BUS edge
# electrical_supply → process_compressors_and_pumps was the last missing run):
#   • EXTERNAL SUPPLY — a battery-limit utility term (grid / mains / incomer /
#     utility / power supply). We synthesise a small "incomer" marker (a junction
#     box + cable gland) at the plant edge nearest the power/utilities region and
#     route from there. Detected by EXTERNAL_SUPPLY_RE.
#   • GROUP / AGGREGATE — a plural/"X_and_Y" term that token-matches MANY parts
#     (e.g. process_compressors_and_pumps). We route to the CENTROID of the matched
#     cluster (and, when ≥2 strong matches, draw short branch drops to the top ~3).
# Universal: keyed only on the endpoint TEXT + token-overlap counts, no class data.
EXTERNAL_SUPPLY_RE = re.compile(
    r"electrical_supply|power_supply|\bgrid\b|\bmains\b|incomer|utility|"
    r"(?:^|[_\s-])supply\b|battery_limit|offsite", re.IGNORECASE)
# Endpoint text that signals an AGGREGATE of several parts (route to the cluster).
GROUP_ENDPOINT_RE = re.compile(
    r"_and_|compressors_and_pumps|\bpumps\b|\bcompressors\b|\bdrives\b|"
    r"\bmotors\b|\bvessels\b|\bcolumns\b|\bunits\b|\ball_\b", re.IGNORECASE)
# How many discrete top matches a GROUP endpoint drops a short branch to (besides
# the main run to the cluster centroid). Keeps the bus visibly feeding the loads.
GROUP_BRANCH_TOP_N = 3
# An external-supply token-match must clear this overlap to be considered a part
# (so 'electrical_supply' never accidentally resolves onto a stray 'supply' word).


def resolve_endpoint(edge_part_name, parts):
    """Best parts-list match for a topology endpoint name by token overlap with
    the discriminator guard. Returns the Part or None. Abstract/aggregate
    endpoints (a bus, a supply, an 'X_and_Y' group) deliberately return None so
    the router skips them rather than drawing a misleading pipe to a stray part."""
    if ABSTRACT_ENDPOINTS_RE.search(edge_part_name):
        return None
    toks = tokenise(edge_part_name)
    # synonyms the topology uses that differ from the human names
    SYN = {
        "ft_synthesis_reactor": "fischer tropsch synthesis reactor",
        "recycle_gas_compressor": "tail gas recycle compressor",
        "three_phase_separator": "cold 3-phase separator",
        "waste_heat_steam_generator": "waste heat steam generator",
        "fractionation_column": "product fractionation column",
        "saf_and_naphtha_storage": "saf storage tank",
        "thermal_oxidiser": "enclosed thermal oxidiser",
    }
    if edge_part_name in SYN:
        toks = tokenise(SYN[edge_part_name])
    best = None
    for p in parts:
        score = token_overlap(toks, p.match_tokens)
        if score <= 0:
            continue
        if best is None or score > best[0]:
            best = (score, p)
    return best[1] if best else None


# Edge-label / endpoint-name tokens that imply the line LEAVES the source from
# its TOP head (vapour / overhead / gas / vent / off-gas / recycle gas) vs its
# BOTTOM (liquid / bottoms / drain / product draw). Used to pick the nozzle.
_TOP_NOZZLE_RE = re.compile(
    r"vapou?r|overhead|\bgas\b|off[- ]?gas|tail[- ]?gas|recycle|vent|flare|"
    r"purge|steam|light|distillate|reflux", re.IGNORECASE)
_BOTTOM_NOZZLE_RE = re.compile(
    r"liquid|bottoms?|\bdrain\b|residue|heav|product|syncrude|effluent|"
    r"draw|reboiler|slurry|condensate", re.IGNORECASE)


def _pick_nozzle(part, role, edge_blob):
    """Choose which anchor a pipe attaches to on `part`. Returns
    (xyz_mm, anchor_key) where anchor_key ∈ {"top","bottom","centre"} so the
    caller can grow a stub along the correct outward axis (+Z for a top nozzle,
    -Z for a bottom). role = "from" (source OUTLET) or "to" (target INLET).
    Heuristic from the edge text: vapour/overhead/gas → TOP; liquid/bottoms →
    BOTTOM; otherwise outlets leave + inlets arrive at the TOP head (overhead
    headers are the common case in a skid). Falls back to centre if no anchors."""
    anc = getattr(part, "anchors", None)
    if not anc:
        return part.placed_xyz_mm, "centre"
    top = _TOP_NOZZLE_RE.search(edge_blob)
    bot = _BOTTOM_NOZZLE_RE.search(edge_blob)
    if bot and not top:
        return anc.get("bottom", anc["centre"]), ("bottom" if "bottom" in anc else "centre")
    if top and not bot:
        return anc.get("top", anc["centre"]), ("top" if "top" in anc else "centre")
    # default: both source-outlet and target-inlet at the TOP head (overhead pipe rack)
    return anc.get("top", anc["centre"]), ("top" if "top" in anc else "centre")


# ── Overhead PIPE-RACK routing (Fix 3, Tristan visual-judge 2026-06-10) ───────
# Real plants don't run pipes diagonally across the deck — they carry them up to a
# common OVERHEAD RACK, run them orthogonally along it, then drop to the target.
# This shared-elevation router replaces the per-pipe route_orthogonal() (which rose
# only a fixed amount above each pipe's OWN taller endpoint, so every run sat at a
# different height = the "wires wandering across the deck" look). Universal: the
# rack elevation is derived from the frame top, the runs are pure X/Y/Z.
RACK_BELOW_ROOF_MM = 600.0   # rack main runs this far below the frame top rail
RACK_TIER_PITCH_MM = 320.0   # stagger successive runs in Z so parallel pipes don't
                             # co-incide (reads as a multi-tier rack, not one line)


def rack_elevation_mm(frame_top_mm):
    """The shared OVERHEAD-RACK elevation (mm). One source of truth so the
    physical rack STRUCTURE (Fix 2) and the routed pipes (Fix 3) sit at the same
    height. Just below the frame roof if we know it, else a sane default above
    the deck."""
    return (float(frame_top_mm) - RACK_BELOW_ROOF_MM
            if frame_top_mm else DECK_Z_MM + 4500.0)


# ── Fix 2 — physical PIPE-RACK STRUCTURE under the overhead runs ──────────────
# The routed pipes used to float on an invisible rack. Build the real thing:
# light structural-grey longitudinal STRINGER beams + transverse cross-beams at
# the rack elevation spanning the plant, carried on a few vertical POSTS down to
# the deck. Kept thin + light grey so it stays SUBORDINATE to the equipment.
# Universal: spans the plant bbox at the shared rack elevation, no class logic.
RACK_BEAM_MM      = 130.0    # square section of the rack beams (thin, subordinate)
RACK_POST_MM      = 150.0    # square section of the rack support posts
RACK_TIER_COUNT   = 2        # number of stacked beam tiers (matches pipe tiers)


def build_pipe_rack(bbox_mm, frame_top_mm, MAT, MO):
    """Light grey structural pipe-rack spanning the plant at the overhead-rack
    elevation: two longitudinal stringer tiers down each side bent, transverse
    cross-beams at intervals, and vertical posts to the deck. Subordinate weight
    (thin, light grey) so the equipment + pipes still dominate. Deterministic +
    universal — geometry only, derived from the plant bbox + rack elevation."""
    if "u_rack_steel" not in MAT:
        # matte (low metallic) so the thin rack members don't reflect-pop as bright
        # sketch-lines — they recede as subordinate structure (see m_skid_steel note).
        MAT["u_rack_steel"] = fl.make_mat("m_u_rack_steel", (0.60, 0.62, 0.65),
                                          metallic=0.10, roughness=0.70)
    steel = MAT["u_rack_steel"]
    sid = STRUCTURE_MODULE_ID
    m = RACK_BEAM_MM
    x0, x1 = bbox_mm["x0"], bbox_mm["x1"]
    y0, y1 = bbox_mm["y0"], bbox_mm["y1"]
    w = x1 - x0
    d = y1 - y0
    cx = (x0 + x1) / 2
    z_rack = rack_elevation_mm(frame_top_mm)

    def _mm3(t):
        return tuple(c * fl.MM for c in t)

    # Two transverse "bents": longitudinal stringer beams run along X near the
    # front and back of the plant (where the rack drops hang), at RACK_TIER_COUNT
    # stacked tiers so the multi-tier pipes visibly rest on beams.
    y_lines = [y0 + d * 0.30, y1 - d * 0.30]
    for ti in range(RACK_TIER_COUNT):
        z = z_rack + RACK_TIER_PITCH_MM * ti
        for yl in y_lines:
            fl.add_box(f"u_rack_stringer_{ti}_{yl:.0f}",
                       _mm3((cx, yl, z)), _mm3((w, m, m)),
                       steel, module=sid, module_objects=MO)
    # Transverse cross-beams tying the two stringer lines, at regular X bays —
    # these are the members the pipes actually lie across.
    n_bays = max(2, int(w / 4500))
    xs = [x0 + (k + 0.5) * w / n_bays for k in range(n_bays)]
    yc = (y_lines[0] + y_lines[1]) / 2
    cross_d = abs(y_lines[1] - y_lines[0]) + m
    for k, xb in enumerate(xs):
        fl.add_box(f"u_rack_cross_{k}", _mm3((xb, yc, z_rack)),
                   _mm3((m, cross_d, m)), steel, module=sid, module_objects=MO)
        # vertical posts down to the deck at each bay, both stringer lines
        post_h = z_rack - DECK_Z_MM
        for yl in y_lines:
            fl.add_box(f"u_rack_post_{k}_{yl:.0f}",
                       _mm3((xb, yl, DECK_Z_MM + post_h / 2)),
                       _mm3((RACK_POST_MM, RACK_POST_MM, post_h)),
                       steel, module=sid, module_objects=MO)
    print(f"[univ] pipe rack: {w/1000:.1f} m span @ {z_rack/1000:.1f} m, "
          f"{n_bays} bays, {RACK_TIER_COUNT} tiers")


def route_rack(start_mm, end_mm, rack_z_mm):
    """Orthogonal pipe-rack route between two nozzles (mm): rise vertically from
    the source to the rack elevation, run along X then Y AT the rack level, then
    drop vertically to the target. No diagonals — pure Manhattan on a shared rack.
    rack_z_mm is clamped to sit ABOVE both endpoints (a real rack is overhead).
    Degenerate (<1 mm) legs are dropped so a stacked source/target stays clean.

    LEGACY per-pipe router. Kept ONLY for the single-body families (tower-machine
    down-tower runs, aero harness) where there is no equipment row to thread a
    shared spine through. The multi-equipment families (process-plant, rack-farm,
    panel-array, generic-assembly) now route on a shared RackPlan spine via
    route_on_spine() — see the PIPE-RACK SPINE ENGINE below — so their parallel
    runs sit in lanes on a real corridor instead of each crossing the deck."""
    sx, sy, sz = (float(c) for c in start_mm)
    ex, ey, ez = (float(c) for c in end_mm)
    zt = max(float(rack_z_mm), sz + 200.0, ez + 200.0)   # never below an endpoint
    raw = [(sx, sy, sz),        # source nozzle
           (sx, sy, zt),        # riser up to the rack
           (ex, sy, zt),        # run along X on the rack
           (ex, ey, zt),        # run along Y on the rack
           (ex, ey, ez)]        # drop to target nozzle
    pts = [raw[0]]
    for p in raw[1:]:
        if max(abs(p[0] - pts[-1][0]), abs(p[1] - pts[-1][1]),
               abs(p[2] - pts[-1][2])) > 1.0:
            pts.append(p)
    return pts


# ═══════════════════════════════════════════════════════════════════════════
# PIPE-RACK SPINE ENGINE (2026-06-11) — the real fix for the "insane piping".
# ───────────────────────────────────────────────────────────────────────────
# A real plant does NOT route each pipe independently as source→X→Y→target at a
# common height (that crosses other pipes, cuts across equipment, and sends an
# edge endpoint round the whole building). It carries every line up onto a shared
# PIPE RACK that runs down the AISLE between the equipment rows, gives each line
# its own LANE (lateral offset) so parallels sit side-by-side, and stacks lines
# that would otherwise cross onto different TIERS (elevations). This engine does
# exactly that, deterministically, for ANY family:
#
#   1. The placement strategy (which knows the layout) builds a RackPlan: the
#      spine AXIS ('x' or 'y'), the spine cross-axis POSITION (in the free aisle,
#      NEVER over equipment), the along-axis EXTENT, the rack base elevation, and
#      the equipment XY bboxes (so the router can keep horizontals off them).
#   2. route_on_spine() routes one edge: source nozzle → riser UP to its tier →
#      short lateral to the SPINE (at its lane offset) → run ALONG the spine to the
#      target's along-spine coordinate → short lateral OFF the spine → drop DOWN to
#      the target nozzle. The only horizontal that travels any distance is ON the
#      spine, which lives in the aisle — so it never crosses equipment.
#   3. LANES: each edge gets a distinct lateral offset; parallel runs never overlap.
#   4. TIERS: edges whose along-spine intervals overlap are coloured onto distinct
#      elevations (interval-graph greedy colouring), so any unavoidable crossing
#      happens at a different height — zero same-Z crossings.
#   5. ABSTRACT endpoints (electrical incomer / aggregate group) connect to the
#      spine at the NEAREST point (their along-axis coord is CLAMPED into the spine
#      extent) — no perimeter detour.
# Universal + deterministic: all geometry is derived from the layout the placer
# already computed; no per-class data, no LLM.
# ═══════════════════════════════════════════════════════════════════════════

RACK_LANE_PITCH_MM   = 360.0   # lateral offset between adjacent lanes on the spine
RACK_LANE_SPAN_MM    = 2600.0  # total lateral band the lanes are spread across (caps
                               # the offset so lanes stay within the aisle width)
RACK_LATERAL_MIN_MM  = 300.0   # shortest lateral/riser leg (≥ pipe bend radius so the
                               # fillet on prim_pipe_run always fits)
RACK_TIER_MAX        = 16      # give every run its OWN elevation tier up to this many
                               # edges (zero same-Z crossings); beyond it, fall back to
                               # interval-graph tier colouring (reuse disjoint spans)
RACK_DIRECT_MAX_MM   = 13000.0 # an edge whose endpoints are within this XY distance is
                               # a LOCAL jumper: route it DIRECT (clean L) if that
                               # avoids equipment, instead of detouring to the spine.
                               # Longer edges always take the spine (visual coherence).
LOCAL_JUMPER_MAX_MM  = 6000.0  # a DIRECT jumper this short between two LOW nozzles runs
                               # at a LOW local elevation (just over the taller endpoint),
                               # NOT up at the overhead rack — a real plant runs a short
                               # hop between adjacent ground equipment as a low pipe, not a
                               # 4-5 m climb-and-return. Beyond it, the direct L (if any)
                               # uses the rack tier; clipped routes fall back to the spine.
LOCAL_JUMPER_CLEAR_MM = 450.0  # how far a low jumper's horizontal sits ABOVE the taller
                               # of its two endpoints (clears the nozzle/flange + reads as
                               # a deliberate run, never grazing the shell top).
LOCAL_JUMPER_TIER_MM  = 260.0  # Z stagger between successive low jumpers so two that share
                               # an area never co-incide / cross at the same elevation.
# ── PER-EDGE ROUTER BUDGET ─────────────────────────────────────────────────
# Hard wall-clock limit (seconds) per routed edge, covering both waypoint
# computation AND Blender geometry creation. On a healthy plant every edge
# completes in well under a second; pathological edges (e.g. a cross-plant
# electrical run that produces 300+ cable-tray rungs on a large RAS scene)
# peg the CPU indefinitely. When the budget is exceeded the edge falls back to
# a direct two-point straight-line route and logs a WARN so the problem is
# traceable. The budget must be large enough that NO healthy edge ever hits it
# (set conservatively at 8 s, ≈8× the slowest observed healthy edge); it is a
# safety net, not a tuning knob.
EDGE_ROUTER_BUDGET_S  = 8.0   # wall-clock seconds before straight-line fallback
# Rung density cap for cable-tray legs: limits the number of Blender mesh
# objects created per cable-tray leg. Very long legs (a 424 m cross-lateral on
# a 500 m RAS farm) would otherwise produce 300+ boxes whose cumulative
# bpy.ops calls block in a 1 000+ object scene. The cap keeps it below 40
# rungs/leg — still visually dense and legible at normal inspect zoom.
CABLE_TRAY_MAX_RUNGS  = 40    # max rungs per cable-tray leg (density cap)
# Inter-bank aisle bands [(centre_y, width), …] published by _compact_banks_in_y so
# place_process_plant sites the rack spine in the REAL aisle between the equipment
# banks (not over equipment). Reset every run; empty for a single-bank plant.
_PLANT_BANK_AISLES = []


def part_xy_bbox_mm(part):
    """The XY footprint bounding box (x0,y0,x1,y1) in mm of a PLACED part —
    its centre ± half its resolved footprint. Returns None for an unplaced part."""
    if part.placed_xyz_mm is None:
        return None
    cx, cy = part.placed_xyz_mm[0], part.placed_xyz_mm[1]
    fx, fy, _ = footprint_mm(resolved_dims_mm(part))
    return (cx - fx / 2.0, cy - fy / 2.0, cx + fx / 2.0, cy + fy / 2.0)


def part_top_z_mm(part):
    """The part's TOP elevation (mm) — where a horizontal pipe at or above this Z
    clears it. Uses the placed top anchor; falls back to centre + half height."""
    if part.anchors and "top" in part.anchors:
        return part.anchors["top"][2]
    if part.placed_xyz_mm is None:
        return DECK_Z_MM
    _, _, h = footprint_mm(resolved_dims_mm(part))
    return part.placed_xyz_mm[2] + h / 2.0


_OWN_MATCH_TOL_MM = 250.0   # ≥ the bbox shrink, so an unshrunk OWN bbox still matches
                            # its shrunk entry in the global equipment list


def _bbox_is_own(bb, own):
    """True if equipment bbox `bb` is one of THIS run's own source/target parts
    `own`. Compares only the XY corners (ignores any 5th top_z element) with a
    tolerance that absorbs the inward shrink applied to the global list, so an
    unshrunk own-bbox still matches its shrunk global twin (and a riser/drop at a
    part's own footprint is never miscounted as 'over OTHER equipment')."""
    for ob in own:
        if all(abs(bb[k] - ob[k]) < _OWN_MATCH_TOL_MM for k in range(4)):
            return True
    return False


def equipment_xy_bboxes_mm(parts, shrink_mm=120.0):
    """List of (x0,y0,x1,y1,top_z) for every placed part — the XY footprint (shrunk
    inward by shrink_mm so a riser/drop at the shell EDGE isn't counted) plus the
    part's TOP elevation. A horizontal pipe segment 'clears' a part when its Z is
    ABOVE top_z; only a pipe BELOW a part's top that overlaps it in XY actually
    clips it (an overhead rack legitimately flies over SHORT equipment). Used by the
    route audit + the direct-route + corridor clearance tests."""
    out = []
    for p in parts:
        bb = part_xy_bbox_mm(p)
        if bb is None:
            continue
        x0, y0, x1, y1 = bb
        if (x1 - x0) > 2 * shrink_mm and (y1 - y0) > 2 * shrink_mm:
            x0 += shrink_mm; y0 += shrink_mm; x1 -= shrink_mm; y1 -= shrink_mm
        out.append((x0, y0, x1, y1, part_top_z_mm(p)))
    return out


def _free_aisle_position(bboxes, axis, lo_cross, hi_cross):
    """Find the cross-axis coordinate of the MAIN AISLE — the empty band that best
    separates the equipment into two halves, so the spine runs down the middle of
    the plant (not down a thin gap at the front edge). Returns (centre, width).

    axis='x' means the spine RUNS along X, so the cross axis is Y; axis='y' mirrors.
    We project the equipment onto the cross axis, merge into occupied blocks, take
    the gaps between blocks, and SCORE each gap = its width but PENALISED by its
    distance from the equipment centre (a central aisle beats an equally-wide edge
    margin). The interior gap that splits the plant wins; falls back to the centre."""
    occ = []
    span_lo = span_hi = None
    for bb in bboxes:                       # bb may be (x0,y0,x1,y1) or +top_z
        x0, y0, x1, y1 = bb[0], bb[1], bb[2], bb[3]
        a, b = (y0, y1) if axis == "x" else (x0, x1)
        occ.append((a, b))
        span_lo = a if span_lo is None else min(span_lo, a)
        span_hi = b if span_hi is None else max(span_hi, b)
    if not occ:
        return (lo_cross + hi_cross) / 2.0, (hi_cross - lo_cross)
    occ.sort()
    merged = [list(occ[0])]
    for a, b in occ[1:]:
        if a <= merged[-1][1] + 1.0:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    centre = (span_lo + span_hi) / 2.0
    total = max(1.0, span_hi - span_lo)
    # The MAIN AISLE is the gap that best BISECTS the plant — equipment on BOTH
    # sides, so every part reaches the spine across at most HALF the plant depth
    # (not the whole of it). We score each interior gap (between two merged blocks)
    # by (a) how evenly it splits the equipment by count, (b) its width, (c) how
    # central it is. A gap with lots of equipment on both sides and near the middle
    # wins — that is the through-aisle a real plant lays its main rack down. Edge
    # margins (nothing on one side) score ~0 and are rejected.
    n_parts = len(occ)
    starts = sorted(a for a, _ in occ)
    best = None   # (score, mid, width)
    for (a_lo, a_hi), (b_lo, b_hi) in zip(merged[:-1], merged[1:]):
        gap_lo, gap_hi = a_hi, b_lo
        w = gap_hi - gap_lo
        if w < 1.0:
            continue
        mid = (gap_lo + gap_hi) / 2.0
        # parts whose centre is below / above the gap midpoint
        below = sum(1 for a, b in occ if (a + b) / 2.0 < mid)
        above = n_parts - below
        balance = (min(below, above) / max(1, n_parts / 2.0))   # 0 (edge) … 1 (50/50)
        central = 1.0 - min(1.0, abs(mid - centre) / (total / 2.0))
        width_term = min(1.0, w / 1500.0)                       # saturate ~1.5 m aisle
        # bisection dominates (an aisle MUST have equipment on both sides); width +
        # centrality break ties between equally-balanced candidate gaps.
        score = balance * (1.0 + 0.4 * width_term + 0.3 * central)
        if best is None or score > best[0]:
            best = (score, mid, w)
    if best is not None and best[0] > 0.05:
        return best[1], best[2]
    # no bisecting interior gap (one solid block, or all parts on one side): put the
    # spine at the equipment Y-CENTRE so cross-laterals are as short as possible.
    return centre, 0.0


class RackPlan:
    """A shared pipe-rack corridor the router threads every run through.

    axis        : 'x' or 'y' — the direction the SPINE runs (the plant's primary
                  axis; horizontals on the spine travel along it).
    spine_pos   : the cross-axis coordinate of the spine centreline (mm) — placed
                  in the free aisle by the strategy, NEVER over equipment.
    lo, hi      : the along-axis extent of the spine (mm).
    base_z      : the lowest rack tier elevation (mm); higher tiers stack above it.
    cross_lo/hi : the cross-axis band the lanes may spread across (the aisle width).
    bboxes      : equipment XY bboxes (for the audit / future corridor refinement).

    assign(edges): one-shot allocation of a LANE + a TIER to every edge, where each
    edge is (along_a, along_b) its two along-axis endpoint coordinates (used to
    build the interval graph for tier colouring). Call once before routing; then
    route_on_spine() reads the per-edge lane/tier the plan stored."""

    __slots__ = ("axis", "spine_pos", "lo", "hi", "base_z", "cross_lo", "cross_hi",
                 "bboxes", "_lane", "_tier", "_n_tiers")

    def __init__(self, axis, spine_pos, lo, hi, base_z, cross_lo, cross_hi, bboxes):
        self.axis = "x" if axis == "x" else "y"
        self.spine_pos = float(spine_pos)
        self.lo = float(min(lo, hi))
        self.hi = float(max(lo, hi))
        self.base_z = float(base_z)
        self.cross_lo = float(min(cross_lo, cross_hi))
        self.cross_hi = float(max(cross_lo, cross_hi))
        self.bboxes = list(bboxes or [])
        self._lane = {}     # edge index → signed lane index (…-1,0,+1…)
        self._tier = {}     # edge index → tier index (0 = base)
        self._n_tiers = 1

    def _along(self, xyz):
        """The along-spine coordinate of a 3D point."""
        return xyz[0] if self.axis == "x" else xyz[1]

    def _clamp_along(self, v):
        return max(self.lo, min(self.hi, v))

    def assign(self, intervals):
        """intervals = list of (along_a, along_b) per edge (already clamped to the
        spine). Allocate a distinct LANE (lateral offset, centred about the spine and
        fitted inside the aisle band) AND a distinct TIER (elevation) to every edge.

        TIERS: each edge gets its OWN tier up to RACK_TIER_MAX, then the greedy
        interval-graph colouring reuses a tier only for edges whose along-spine spans
        do NOT overlap (so two pipes never share an elevation where they could cross).
        For the small edge counts these families carry (≤ ~16), every edge typically
        lands on a unique tier → zero same-elevation crossings, guaranteed. LANES then
        keep parallel runs on the same tier visually side-by-side."""
        n = len(intervals)
        # --- lanes: centre + fit inside the aisle band so a lane never hits equipment.
        aisle_half = max(0.0, (self.cross_hi - self.cross_lo) / 2.0 - RACK_LATERAL_MIN_MM)
        max_off = min(RACK_LANE_SPAN_MM / 2.0, aisle_half) if aisle_half > 0 else \
            RACK_LANE_SPAN_MM / 2.0
        pitch = RACK_LANE_PITCH_MM
        if n > 1 and max_off > 0:
            pitch = min(RACK_LANE_PITCH_MM, (2.0 * max_off) / (n - 1))
        for i in range(n):
            raw = i - (n - 1) / 2.0                 # …-1,0,+1… centred
            self._lane[i] = raw * pitch
        # --- tiers: unique-per-edge first (best separation), capped, then colour. ---
        order = sorted(range(n), key=lambda i: (intervals[i][0], intervals[i][1]))
        tier_of = {}
        if n <= RACK_TIER_MAX:
            # plenty of head-room → give every edge its own tier (zero same-Z cross).
            for rank, i in enumerate(order):
                tier_of[i] = rank
        else:
            # many edges → greedy interval colouring: reuse a tier only for edges
            # whose along-spine ranges are disjoint (they can't cross at that Z).
            for i in order:
                a_i, b_i = intervals[i]
                used = set()
                for j in order:
                    if j in tier_of:
                        a_j, b_j = intervals[j]
                        if a_i < b_j and a_j < b_i:
                            used.add(tier_of[j])
                t = 0
                while t in used:
                    t += 1
                tier_of[i] = t
        self._tier = tier_of
        self._n_tiers = (max(tier_of.values()) + 1) if tier_of else 1

    def lane_offset(self, i):
        return self._lane.get(i, 0.0)

    def tier_z(self, i):
        return self.base_z + RACK_TIER_PITCH_MM * self._tier.get(i, 0)


def _polyline_over_equipment(waypoints, bboxes, own):
    """Count the HORIZONTAL legs of an orthogonal polyline that pass over equipment
    (any bbox not in `own`). Shared by the direct-route decision + mirrors the audit
    rule, so 'would this route be clean?' is judged with the SAME test the audit uses."""
    n = 0
    for p, q in zip(waypoints[:-1], waypoints[1:]):
        if not _seg_horizontal(p, q):
            continue
        for bb in bboxes:
            if own and _bbox_is_own(bb, own):
                continue
            if _seg_over_bbox(p, q, bb):
                n += 1
                break
    return n


def _local_jumper_z(plan, i, a_xyz, b_xyz):
    """The LOW elevation a short local jumper runs at: just above the TALLER of its
    two endpoints (so it clears both nozzles + reads as a real low pipe), with a small
    per-run stagger so two jumpers in one area never co-incide. Capped just below the
    rack so a tall-ish pair still produces a sensible low run rather than merging into
    the overhead rack lane."""
    base = max(float(a_xyz[2]), float(b_xyz[2])) + LOCAL_JUMPER_CLEAR_MM
    z = base + LOCAL_JUMPER_TIER_MM * (i % 4)
    ceiling = plan.base_z - LOCAL_JUMPER_CLEAR_MM      # stay clear under the rack floor
    return min(z, ceiling) if ceiling > base else base


def _direct_route(plan, i, a_xyz, b_xyz, own):
    """A SHORT LOCAL jumper between two nearby parts: rise just over the taller nozzle,
    run along X then Y (an L) at that LOW local elevation, drop to the target — NO trip
    to the overhead rack and NO 4-5 m climb-and-return. Used when the two endpoints are
    close AND the L-route is clear of OTHER equipment, so adjacent units get a direct
    low pipe (how a real plant runs a local jumper) instead of a wasteful detour up to
    the rack aisle and back.

    Elevation: a genuinely SHORT hop (≤ LOCAL_JUMPER_MAX_MM) between two LOW nozzles
    runs at the LOW local elevation (`_local_jumper_z` — over the taller endpoint, with
    a per-run stagger); a longer-but-still-direct edge keeps the rack tier so it lines
    up with the overhead runs. Each candidate elevation is tried and the LOW one is
    preferred whenever its L is clear; if the low L would clip OTHER equipment we fall
    through to the rack-tier L, and if THAT clips we return None (caller takes the
    spine). The run still sits on its own elevation, so it never shares a height with
    another run. Returns the waypoints, or None if no clean direct L exists."""
    ax, ay, az = (float(c) for c in a_xyz)
    bx, by, bz = (float(c) for c in b_xyz)
    straight = math.hypot(bx - ax, by - ay)
    tz_rack = plan.tier_z(i)
    tz_low = _local_jumper_z(plan, i, a_xyz, b_xyz)
    # Prefer the LOW elevation for a short hop between low nozzles; otherwise (longer
    # direct edge, or a pair already near the rack) use the rack tier. Try the preferred
    # elevation first so a clean low run wins; fall back to the rack tier only if the
    # low L is blocked. Within each elevation, try both orthogonal orderings (X-first /
    # Y-first) and keep the cleaner.
    low_ok = (straight <= LOCAL_JUMPER_MAX_MM and tz_low < tz_rack - 1.0)
    elevations = ([tz_low, tz_rack] if low_ok else [tz_rack])
    # The plant's main equipment corridor cross-coordinate (the spine line): a long
    # traverse reads cleanest running NEAR it (through the equipment band), not along
    # an empty plant edge. Used to break ties between the two L orderings.
    spine_cross = plan.spine_pos

    def _long_leg_offset(pts):
        """Plan-view distance from the spine cross-line of the candidate's LONGEST
        horizontal leg (the dominant traverse). Lower = the long run hugs the central
        corridor rather than skirting an empty boundary."""
        worst = 0.0
        best_len = -1.0
        for p, q in zip(pts[:-1], pts[1:]):
            if not _seg_horizontal(p, q):
                continue
            ln = math.hypot(q[0] - p[0], q[1] - p[1])
            cross = ((p[1] + q[1]) / 2.0 if plan.axis == "x"
                     else (p[0] + q[0]) / 2.0)
            if ln > best_len:
                best_len, worst = ln, abs(cross - spine_cross)
        return worst

    for tz in elevations:
        cand_xy = [(ax, ay, az), (ax, ay, tz), (bx, ay, tz), (bx, by, tz), (bx, by, bz)]
        cand_yx = [(ax, ay, az), (ax, ay, tz), (ax, by, tz), (bx, by, tz), (bx, by, bz)]
        best = None
        for cand in (cand_xy, cand_yx):
            pts = [cand[0]]
            for p in cand[1:]:
                if max(abs(p[0] - pts[-1][0]), abs(p[1] - pts[-1][1]),
                       abs(p[2] - pts[-1][2])) > 1.0:
                    pts.append(p)
            over = _polyline_over_equipment(pts, plan.bboxes, own)
            # rank: fewest over-equipment legs first; then the ordering whose long
            # traverse runs closest to the central corridor (avoids the empty-edge run).
            key = (over, _long_leg_offset(pts))
            if best is None or key < best[0]:
                best = (key, pts)
        if best and best[0][0] == 0:
            return best[1]
    return None


def _corridor_clear_along_cross(plan, fixed_along, cross_a, cross_b, own):
    """True if a CROSS-axis segment (the lateral that connects a part to the spine),
    held at along-axis coord `fixed_along`, sweeping the cross axis from cross_a to
    cross_b, is CLEAR of every equipment bbox except this run's own endpoints `own`.
    axis='x' → the lateral runs along Y at X=fixed_along; axis='y' → along X."""
    c_lo, c_hi = (min(cross_a, cross_b), max(cross_a, cross_b))
    for bb in plan.bboxes:
        if own and _bbox_is_own(bb, own):
            continue
        x0, y0, x1, y1 = bb[0], bb[1], bb[2], bb[3]
        if plan.axis == "x":            # lateral ∥ Y at X=fixed_along
            if x0 <= fixed_along <= x1 and not (y1 < c_lo or y0 > c_hi):
                return False
        else:                           # lateral ∥ X at Y=fixed_along
            if y0 <= fixed_along <= y1 and not (x1 < c_lo or x0 > c_hi):
                return False
    return True


def _nearest_clear_cross_along(plan, start_along, cross_a, cross_b, own):
    """Find an along-axis coordinate NEAR start_along where the cross-lateral to the
    spine (from cross_a to cross_b) is clear of OTHER equipment, so the lateral drops
    through a column GAP instead of over a neighbour. Tries the part's own coord
    first (no shift if its column is already clear), then steps outward in small
    increments. Returns the chosen along-coord (clamped to the spine span). Falls
    back to start_along if nothing clears within the search window (audit will flag
    it; better a short over-equipment stub than a wild detour)."""
    if _corridor_clear_along_cross(plan, start_along, cross_a, cross_b, own):
        return start_along
    step = RACK_LANE_PITCH_MM
    for k in range(1, 28):              # up to ~10 m of search either way
        for sign in (+1, -1):
            cand = plan._clamp_along(start_along + sign * step * k)
            if _corridor_clear_along_cross(plan, cand, cross_a, cross_b, own):
                return cand
    return start_along


def route_on_spine(plan, i, a_xyz, b_xyz, a_abstract=False, b_abstract=False,
                   own=()):
    """Route ONE edge onto the shared rack spine and return PURELY-ORTHOGONAL mm
    waypoints (every leg moves on ONE axis). Path (axis='x' shown; 'y' mirrors):

        source nozzle                 (ax, ay, az)
        riser UP                      (ax, ay, tz)
        align to a CLEAR column       (ca, ay, tz)    — X-move over its OWN bay
        CROSS-lateral down to spine   (ca, spine_y, tz)— Y through a clear column gap
        run ALONG the spine           (cb, spine_y, tz)— the ONLY long X horizontal
        CROSS-lateral up off spine    (cb, by, tz)    — Y through a clear column gap
        align back to the target      (bx, by, tz)    — X-move over the TARGET's bay
        drop DOWN to the target       (bx, by, bz)

    The cross-lateral (the long Y leg from a part to the central aisle) is routed at
    a CLEAR column coordinate (ca/cb) found by _nearest_clear_cross_along, so it
    drops through a gap between equipment rather than over a neighbour. The short
    X-aligning legs sit over the run's OWN source/target bay (allowed). The only
    long along-axis run is ON the spine in the aisle. Abstract endpoints keep their
    own cross-coordinate (plant edge); their along-coord is clamped into the spine.
    tz + lane from plan.assign(); tz forced above both endpoints."""
    ax, ay, az = (float(c) for c in a_xyz)
    bx, by, bz = (float(c) for c in b_xyz)
    # Elevation = a GLOBAL shared rack floor + this run's own TIER offset. The same
    # floor for every run is exactly how a real overhead rack works (all the steel is
    # at one height); the riser/drop simply bridges the nozzle up OR down to it, and
    # the per-run tier keeps any two horizontals at distinct Z (zero same-Z crossings
    # — NOT clamped to each endpoint, which used to collapse runs onto a tall vessel's
    # top). A nozzle above the rack (tall column/tank) just drops DOWN to the rack.
    tz = plan.tier_z(i)
    lane = plan.lane_offset(i)
    own = tuple(own)
    # clear-column search (drop into a gap between equipment) is opt-in: on dense
    # plants the X-jog it adds can lengthen the path more than the over-equipment it
    # avoids. Default OFF — a straight cross-lateral at the part's own coord, which
    # is short + reads clean; enable with ROUTE_CLEAR_COLUMNS=1.
    use_clear = os.environ.get("ROUTE_CLEAR_COLUMNS", "").strip() not in ("", "0", "false")
    if plan.axis == "x":
        spine_y = plan.spine_pos + lane     # the spine lane (cross-axis = Y)
        ca = (_nearest_clear_cross_along(plan, ax, ay, spine_y, own)
              if use_clear and not a_abstract else ax)
        cb = (_nearest_clear_cross_along(plan, bx, by, spine_y, own)
              if use_clear and not b_abstract else bx)
        raw = [
            (ax, ay, az),                   # source nozzle
            (ax, ay, tz),                   # riser up at the part's own X
            (ca, ay, tz),                   # X-align to a clear column (over own bay)
            (ca, spine_y, tz),              # cross-lateral (Y) down to the spine lane
            (cb, spine_y, tz),              # run ALONG the spine (X) in the aisle
            (cb, by, tz),                   # cross-lateral (Y) up off the spine
            (bx, by, tz),                   # X-align back over the target's bay
            (bx, by, bz),                   # drop to the target nozzle
        ]
    else:
        spine_x = plan.spine_pos + lane     # cross-axis = X
        ca = (_nearest_clear_cross_along(plan, ay, ax, spine_x, own)
              if use_clear and not a_abstract else ay)
        cb = (_nearest_clear_cross_along(plan, by, bx, spine_x, own)
              if use_clear and not b_abstract else by)
        raw = [
            (ax, ay, az),
            (ax, ay, tz),
            (ax, ca, tz),
            (spine_x, ca, tz),
            (spine_x, cb, tz),
            (bx, cb, tz),
            (bx, by, tz),
            (bx, by, bz),
        ]
    # drop degenerate (<1 mm) legs so a stacked/co-incident endpoint stays clean
    pts = [raw[0]]
    for p in raw[1:]:
        if max(abs(p[0] - pts[-1][0]), abs(p[1] - pts[-1][1]),
               abs(p[2] - pts[-1][2])) > 1.0:
            pts.append(p)
    return pts


def make_rack_plan_for_rows(bbox_mm, base_z_mm, bboxes, axis="x"):
    """Build a RackPlan whose spine runs down the widest free aisle of a
    ROW-LAYOUT plant (process-plant banks, rack-farm / panel-array rows). The
    spine is laid along `axis` (the long plant axis), positioned in the free aisle
    on the cross axis, spanning the plant extent on the along axis. Universal:
    derived purely from the placed bbox + equipment footprints."""
    x0, x1 = bbox_mm["x0"], bbox_mm["x1"]
    y0, y1 = bbox_mm["y0"], bbox_mm["y1"]
    if axis == "x":
        spine_pos, aisle_w = _free_aisle_position(bboxes, "x", y0, y1)
        plan = RackPlan("x", spine_pos, x0, x1, base_z_mm,
                        spine_pos - aisle_w / 2, spine_pos + aisle_w / 2, bboxes)
        print(f"[univ][spine] axis=x  spine_y={spine_pos:.0f}  aisle={aisle_w:.0f} mm  "
              f"x∈[{x0:.0f},{x1:.0f}] y∈[{y0:.0f},{y1:.0f}]  ({len(bboxes)} equip)")
        return plan
    spine_pos, aisle_w = _free_aisle_position(bboxes, "y", x0, x1)
    plan = RackPlan("y", spine_pos, y0, y1, base_z_mm,
                    spine_pos - aisle_w / 2, spine_pos + aisle_w / 2, bboxes)
    print(f"[univ][spine] axis=y  spine_x={spine_pos:.0f}  aisle={aisle_w:.0f} mm  "
          f"x∈[{x0:.0f},{x1:.0f}] y∈[{y0:.0f},{y1:.0f}]  ({len(bboxes)} equip)")
    return plan


def _make_rack_plan_from_bank_aisle(bbox_mm, base_z_mm, parts, axis="x"):
    """Build a RackPlan whose spine sits in the WIDEST inter-bank aisle the
    placement published (_PLANT_BANK_AISLES, the Y-gaps between serpentine banks).
    This is the corridor the strategy KNOWS — far more reliable than inferring an
    aisle from raw bboxes. Falls back to make_rack_plan_for_rows (gap inference)
    when there is no published aisle (single-bank plant)."""
    bboxes = equipment_xy_bboxes_mm(parts)
    aisles = sorted(_PLANT_BANK_AISLES or [], key=lambda t: -t[1])   # widest first
    if not aisles or axis != "x":
        return make_rack_plan_for_rows(bbox_mm, base_z_mm, bboxes, axis=axis)
    spine_y, aisle_w = aisles[0]
    x0, x1 = bbox_mm["x0"], bbox_mm["x1"]
    plan = RackPlan("x", spine_y, x0, x1, base_z_mm,
                    spine_y - aisle_w / 2, spine_y + aisle_w / 2, bboxes)
    print(f"[univ][spine] axis=x  spine_y={spine_y:.0f}  aisle={aisle_w:.0f} mm "
          f"(inter-bank)  x∈[{x0:.0f},{x1:.0f}]  ({len(bboxes)} equip)")
    return plan


def _make_rack_plan_for_flow_train(bbox_mm, base_z_mm, parts, axis="x"):
    """FLOW-LAYOUT rack plan: run the X-spine through the MIDDLE of the process
    TRAIN (the flow regions), so every flow run taps it across at most ~half the
    train-row depth — short risers, low detour — instead of the train↔periphery
    aisle the generic bisector would pick (that aisle sits at the train's BACK
    edge, 5-6 m behind the front of the row, so a flow tap from a front vessel
    detours all the way up to it and back). The spine Y = the area-weighted Y
    centre of the TRAIN equipment (the row's middle), and the audit/lane band uses
    the train's Y extent. Falls back to the published-aisle plan when there is no
    train (no flow plan was active). Universal — keyed only on which regions are
    the flow train, no class data."""
    train_regions = _PLANT_FLOW_TRAIN_REGIONS
    if not train_regions or axis != "x":
        return _make_rack_plan_from_bank_aisle(bbox_mm, base_z_mm, parts, axis=axis)
    train_parts = [p for p in parts if p.region_key in train_regions]
    bboxes = equipment_xy_bboxes_mm(parts)           # audit against ALL equipment
    train_bboxes = [bb for bb in (part_xy_bbox_mm(p) for p in train_parts)
                    if bb is not None]
    if not train_bboxes:
        return _make_rack_plan_from_bank_aisle(bbox_mm, base_z_mm, parts, axis=axis)
    # Spine Y = the bisecting free aisle of the TRAIN equipment only (a real aisle
    # through the row when there is one — e.g. between a back vessel band and a
    # front instrument band — else the train's Y centre). Using only the train
    # bboxes keeps the spine in the row, never dragged back to the periphery.
    ylo = min(bb[1] for bb in train_bboxes)
    yhi = max(bb[3] for bb in train_bboxes)
    spine_y, aisle_w = _free_aisle_position(train_bboxes, "x", ylo, yhi)
    if aisle_w < 600.0:                              # no real internal aisle → centre
        spine_y = (ylo + yhi) / 2.0
        aisle_w = max(800.0, (yhi - ylo) * 0.25)
    x0, x1 = bbox_mm["x0"], bbox_mm["x1"]
    plan = RackPlan("x", spine_y, x0, x1, base_z_mm,
                    spine_y - aisle_w / 2, spine_y + aisle_w / 2, bboxes)
    print(f"[univ][spine] axis=x  spine_y={spine_y:.0f}  aisle={aisle_w:.0f} mm "
          f"(flow-train bisector, {len(train_bboxes)} train equip of "
          f"{len(bboxes)})  x∈[{x0:.0f},{x1:.0f}]")
    return plan


# ── Deterministic ROUTE AUDIT — the harsh self-check (Tristan 2026-06-11) ─────
# Computes the THREE hard acceptance numbers from the emitted polylines + the
# equipment bboxes, and writes them to route-audit.json so the result is a fact,
# not an eyeball:
#   • over_equipment_segments — horizontal pipe legs whose XY span passes over any
#     equipment footprint (target 0).
#   • max_detour_ratio — the longest routed path / straight-line source→target XY
#     distance (target ≤ ~1.6; flags a perimeter detour).
#   • same_elevation_crossings — pairs of horizontal legs that cross in XY at the
#     SAME Z (target 0; tiers must resolve every crossing).
_ROUTE_LOG = []   # list of dicts: {name, mech, waypoints, a_xy, b_xy, own_bboxes}

# Every run that gets SIZED (its diameter computed from a rating) records its
# ConnectionSpec here, so after routing we can build the distribution SCHEDULE
# (connection_schedule) for the BoM feedback. A trunk records the trunk spec; each
# tap records its own (thinner) spec. Reset per run alongside _ROUTE_LOG.
_CONN_SPECS = []   # list of ConnectionSpec dicts (see connection_sizing._spec)

# Sizing memo: the N rack TAPS of a fan-out all carry the SAME rating + ~same length,
# so size the physics ONCE per (rating-signature, rounded-length) and reuse it. Cuts
# the per-run subprocess tool calls (electrical sweeps n_parallel 1..8) from O(racks)
# to O(distinct sizes). Keyed on the rating, NOT the run name. Cleared per build.
_SIZING_CACHE = {}   # signature → ConnectionSpec (template, deep-copied per use)


def _route_log_reset():
    _ROUTE_LOG.clear()
    _CONN_SPECS.clear()
    _SIZING_CACHE.clear()
    _SPINE_DRAWN_EDGE_IDS.clear()   # Stage 4 double-draw guard (see _edge_is_port_wirable)


def _route_log_add(name, mech, waypoints, a_xy, b_xy, own_parts=()):
    """Record one emitted run for the audit. own_parts = the (≤2) source/target
    Part objects this run connects, so the audit can EXCLUDE their footprints from
    the over-equipment test (a riser/drop legitimately starts at its own part edge —
    that is not 'a horizontal across OTHER equipment')."""
    own = []
    for p in own_parts:
        if p is not None:
            bb = part_xy_bbox_mm(p)
            if bb is not None:
                own.append(bb)
    _ROUTE_LOG.append({"name": name, "mech": mech,
                       "waypoints": [tuple(float(c) for c in p) for p in waypoints],
                       "a_xy": (float(a_xy[0]), float(a_xy[1])),
                       "b_xy": (float(b_xy[0]), float(b_xy[1])),
                       "own_bboxes": own})


def audit_connection_geometry(parts, tol_mm=1400.0):
    """DETERMINISTIC CONNECTION AUDIT (Tristan 2026-06-22): every drawn line MUST land on a
    real part at BOTH ends — no line goes from nowhere to nowhere. Walks _ROUTE_LOG (every
    emitted run) and tests each run's two ENDPOINTS against the placed parts' bboxes + ports.
    Reports each endpoint that is NOT within tol of any part. Returns the list of offenders so
    a caller can gate. This is the answer to 'how are you confirming all parts connect?'."""
    import math as _m
    tgts = []   # (label, cx,cy,cz, hx,hy,hz) — every valid landing target
    for p in parts:
        if getattr(p, "placed_xyz_mm", None) is None:
            continue
        bb = part_xy_bbox_mm(p)
        cx, cy, cz = p.placed_xyz_mm
        if bb is not None:
            hx = (bb[2] - bb[0]) / 2.0 + tol_mm
            hy = (bb[3] - bb[1]) / 2.0 + tol_mm
        else:
            hx = hy = 1500.0 + tol_mm
        hz = 1e9   # ignore Z for the landing test (a riser can meet a nozzle at any height)
        tgts.append((p.name, cx, cy, cz, hx, hy, hz))
        for pn, pc in (getattr(p, "ports", None) or {}).items():
            tgts.append((p.name + ":" + pn, pc[0], pc[1], pc[2], tol_mm, tol_mm, 1e9))

    def _nearest(pt):
        x, y = float(pt[0]), float(pt[1])
        best = None
        for nm, cx, cy, cz, hx, hy, hz in tgts:
            dx = max(0.0, abs(x - cx) - hx)
            dy = max(0.0, abs(y - cy) - hy)
            g = _m.hypot(dx, dy)
            if best is None or g < best[0]:
                best = (g, nm)
                if g <= 0.0:
                    break
        return best or (9e9, "—")

    bad = []
    for r in _ROUTE_LOG:
        wp = r.get("waypoints") or []
        if len(wp) < 2:
            continue
        for side, pt in (("A", wp[0]), ("B", wp[-1])):
            g, nm = _nearest(pt)
            if g > 0.0:
                bad.append((round(g), r.get("name", "?"), side, r.get("mech", ""), nm))
    n = len(_ROUTE_LOG)
    print(f"[univ][conn-audit] {n} drawn run(s); {len(bad)} endpoint(s) NOT on a part "
          f"(tol {tol_mm:.0f} mm) — these are the 'random lines':")
    for g, nm, s, mech, near in sorted(bad, reverse=True)[:30]:
        print(f"   gap={g:>6}mm  {nm} end {s} [{mech}]  nearest={near}")

    # ── BROAD SCAN: any MESH object whose world-bbox reaches well BEYOND the plant
    #    envelope (the mystery thin lines extending past the slab). Names them so we know
    #    what they are (route? manifold? frame? stub?) instead of guessing from the render.
    exs0 = exs1 = eys0 = eys1 = None   # envelope from part FOOTPRINTS (not centres, so a
    for p in parts:                    # header beside a wide tank doesn't read as 'beyond')
        if not getattr(p, "placed_xyz_mm", None):
            continue
        _cx, _cy = p.placed_xyz_mm[0], p.placed_xyz_mm[1]
        _fx, _fy, _ = footprint_mm(resolved_dims_mm(p))
        lo_x, hi_x, lo_y, hi_y = _cx - _fx / 2, _cx + _fx / 2, _cy - _fy / 2, _cy + _fy / 2
        exs0 = lo_x if exs0 is None else min(exs0, lo_x)
        exs1 = hi_x if exs1 is None else max(exs1, hi_x)
        eys0 = lo_y if eys0 is None else min(eys0, lo_y)
        eys1 = hi_y if eys1 is None else max(eys1, hi_y)
    if exs0 is not None:
        ex0, ex1, ey0, ey1 = exs0 - 4000, exs1 + 4000, eys0 - 4000, eys1 + 4000
        beyond = []
        for obj in bpy.data.objects:
            if getattr(obj, "type", None) != "MESH" or obj.data is None:
                continue
            if obj.name.startswith("u_ground_"):
                continue   # the deck legitimately spans the plant (+ apron)
            try:
                mw = obj.matrix_world
                cs = [mw @ __import__("mathutils").Vector(c) for c in obj.bound_box]
            except Exception:
                continue
            ox = max(0.0, ex0 - max(c.x * 1000 for c in cs), min(c.x * 1000 for c in cs) - ex1)
            oy = max(0.0, ey0 - max(c.y * 1000 for c in cs), min(c.y * 1000 for c in cs) - ey1)
            d = math.hypot(ox, oy)
            if d > 3000:
                beyond.append((round(d / 1000, 1), obj.name))
        print(f"[univ][conn-audit] MESH objects reaching >3 m BEYOND the plant: {len(beyond)}")
        for d, nm in sorted(beyond, reverse=True)[:25]:
            print(f"   {d:>5} m beyond  {nm}")
        # FULL INVENTORY (Tristan 2026-06-22 — stop guessing what the floor lines are): every
        # MESH object family by prefix, + every THIN/LONG piece (one axis ≫ the other two) so
        # the "random lines" are named, wherever they sit.
        try:
            _V2 = __import__("mathutils").Vector
            fam = {}
            thin = []
            outliers = []
            # plant centre from non-flying meshes, to flag stragglers far from the pack
            _ox = [o.matrix_world.translation.x * 1000 for o in bpy.data.objects
                   if getattr(o, "type", None) == "MESH" and o.data is not None]
            _oy = [o.matrix_world.translation.y * 1000 for o in bpy.data.objects
                   if getattr(o, "type", None) == "MESH" and o.data is not None]
            _mcx = sorted(_ox)[len(_ox) // 2] if _ox else 0
            _mcy = sorted(_oy)[len(_oy) // 2] if _oy else 0
            for obj in bpy.data.objects:
                if getattr(obj, "type", None) != "MESH" or obj.data is None:
                    continue
                pre = re.match(r"(u_[a-z]+_?[a-z]*)", obj.name)
                key = pre.group(1) if pre else obj.name[:14]
                fam[key] = fam.get(key, 0) + 1
                mw = obj.matrix_world
                cs = [mw @ _V2(c) for c in obj.bound_box]
                ex = (max(c.x for c in cs) - min(c.x for c in cs)) * 1000
                ey = (max(c.y for c in cs) - min(c.y for c in cs)) * 1000
                ez = (max(c.z for c in cs) - min(c.z for c in cs)) * 1000
                dims = sorted([ex, ey, ez])
                if dims[2] > 8000 and dims[1] < 700 and dims[0] < 700:   # long + thin = a "line"
                    zc = sum(c.z for c in cs) / 8 * 1000
                    thin.append((round(dims[2] / 1000, 1), round(zc), obj.name))
                t = mw.translation
                tx, ty, tz = t.x * 1000, t.y * 1000, t.z * 1000
                zmin = min(c.z for c in cs) * 1000
                if ((tx - _mcx) ** 2 + (ty - _mcy) ** 2) ** 0.5 > 18000 or zmin > 1200:
                    outliers.append((obj.name, round(tx), round(ty), round(zmin)))
            print("[univ][inventory] mesh families: " + ", ".join(
                f"{k}={v}" for k, v in sorted(fam.items(), key=lambda x: -x[1])[:18]))
            print(f"[univ][inventory] THIN+LONG 'line' meshes (>8 m long, <0.7 m thick): {len(thin)}")
            for L, zc, nm in sorted(thin, reverse=True)[:30]:
                print(f"   len={L:>5}m zc={zc:>5}mm  {nm}")
            print(f"[univ][inventory] OUTLIER meshes (>18 m from centre OR floating >1.2 m): {len(outliers)}")
            for nm, tx, ty, zmn in sorted(outliers, key=lambda r: -abs(r[1]))[:20]:
                print(f"   ({tx},{ty}) zmin={zmn}mm  {nm}")
        except Exception as _ie:
            print(f"[univ][inventory] skipped: {_ie}")
    return bad


def _seg_horizontal(p, q, z_tol=50.0):
    """True if the segment p→q is a (near-)horizontal run (its Z barely changes and
    it actually moves in XY) — the legs that must not cross equipment / each other."""
    return (abs(p[2] - q[2]) <= z_tol
            and (abs(p[0] - q[0]) > 1.0 or abs(p[1] - q[1]) > 1.0))


_CLEAR_OVER_MM = 150.0   # a horizontal this far ABOVE a part's top clears it cleanly


def _seg_over_bbox(p, q, bb):
    """Does the horizontal segment p→q (axis-aligned) CLIP the equipment bb? bb is
    (x0,y0,x1,y1[,top_z]). It clips when the segment overlaps the footprint in XY
    AND the segment runs at or below the part's top (an overhead rack legitimately
    FLIES OVER equipment shorter than the rack — that is clearance, not a clip).
    When bb has no top_z (4-tuple) any XY overlap counts (height-agnostic callers)."""
    x0, y0, x1, y1 = bb[0], bb[1], bb[2], bb[3]
    sx0, sx1 = min(p[0], q[0]), max(p[0], q[0])
    sy0, sy1 = min(p[1], q[1]), max(p[1], q[1])
    if sx1 < x0 or sx0 > x1 or sy1 < y0 or sy0 > y1:
        return False
    if len(bb) >= 5:
        seg_z = (p[2] + q[2]) / 2.0
        if seg_z >= bb[4] - _CLEAR_OVER_MM:   # pipe is above the part top → clears it
            return False
    return True


def _segs_cross_xy(p1, p2, q1, q2):
    """True if axis-aligned horizontal segments p1p2 and q1q2 properly cross in XY
    (one runs ∥X, the other ∥Y, and they intersect at an interior point — not a
    shared endpoint touch). Returns False for parallel or merely-touching legs."""
    def _orient(a, b):
        if abs(a[0] - b[0]) <= 1.0:
            return "y"            # runs along Y (X constant)
        if abs(a[1] - b[1]) <= 1.0:
            return "x"            # runs along X (Y constant)
        return None
    o1, o2 = _orient(p1, p2), _orient(q1, q2)
    if o1 is None or o2 is None or o1 == o2:
        return False
    # name the X-running one (h) and the Y-running one (v)
    (h1, h2), (v1, v2) = ((p1, p2), (q1, q2)) if o1 == "x" else ((q1, q2), (p1, p2))
    hy = h1[1]                                  # the horizontal leg's constant Y
    vx = v1[0]                                  # the vertical leg's constant X
    hx0, hx1 = min(h1[0], h2[0]), max(h1[0], h2[0])
    vy0, vy1 = min(v1[1], v2[1]), max(v1[1], v2[1])
    eps = 1.0
    return (hx0 + eps < vx < hx1 - eps) and (vy0 + eps < hy < vy1 - eps)


def audit_routes(parts, out_dir):
    """Compute the three hard acceptance numbers from _ROUTE_LOG + equipment
    bboxes, print them, and write route-audit.json. Returns the metrics dict."""
    bboxes = equipment_xy_bboxes_mm(parts)
    over = 0
    over_detail = []
    detours = []

    # over-equipment + detour-ratio per route. A segment that passes over THIS run's
    # own source/target part is fine (the riser/drop starts there); a segment ABOVE a
    # part's top clears it (overhead rack); only a horizontal that would CLIP OTHER
    # equipment (overlaps in XY and runs at/below that part's top) counts.
    for r in _ROUTE_LOG:
        wp = r["waypoints"]
        own = r.get("own_bboxes", [])
        horiz_len = 0.0     # XY (plan-view) length only — risers/drops don't detour
        for p, q in zip(wp[:-1], wp[1:]):
            horiz_len += math.hypot(q[0] - p[0], q[1] - p[1])
            if _seg_horizontal(p, q):
                for bb in bboxes:
                    if _bbox_is_own(bb, own):
                        continue
                    if _seg_over_bbox(p, q, bb):
                        over += 1
                        over_detail.append(r["name"])
                        if os.environ.get("ROUTE_DEBUG"):
                            print(f"[univ][route-dbg] {r['name']} seg "
                                  f"({p[0]:.0f},{p[1]:.0f})->({q[0]:.0f},{q[1]:.0f}) "
                                  f"over bbox ({bb[0]:.0f},{bb[1]:.0f},{bb[2]:.0f},{bb[3]:.0f})")
                        break
        straight = math.dist(r["a_xy"], r["b_xy"])
        # detour = plan-view routed length / straight XY distance. A short cross-aisle
        # tap to the spine (straight ~ a metre) inflates harmlessly; only count the
        # ratio when the straight run is long enough to be a meaningful comparison.
        ratio = (horiz_len / straight) if straight > 2000.0 else 1.0
        detours.append((round(ratio, 3), r["name"]))
    max_detour = max(detours, default=(1.0, None))
    if os.environ.get("ROUTE_DEBUG"):
        for d, nm in sorted(detours, reverse=True):
            print(f"[univ][route-dbg] detour {d:.3f}  {nm}")
    # same-elevation crossings: every pair of horizontal legs at the same Z
    horiz = []   # (p, q, z, name)
    for r in _ROUTE_LOG:
        wp = r["waypoints"]
        for p, q in zip(wp[:-1], wp[1:]):
            if _seg_horizontal(p, q):
                horiz.append((p, q, round((p[2] + q[2]) / 2.0, 1), r["name"]))
    crossings = 0
    cross_detail = []
    for a in range(len(horiz)):
        pa, qa, za, na = horiz[a]
        for b in range(a + 1, len(horiz)):
            pb, qb, zb, nb = horiz[b]
            if na == nb:
                continue                       # same pipe's own corner, ignore
            if abs(za - zb) > 30.0:
                continue                       # different tiers → not a same-Z cross
            if _segs_cross_xy(pa, qa, pb, qb):
                crossings += 1
                cross_detail.append((na, nb, za))
    metrics = {
        "routes": len(_ROUTE_LOG),
        "over_equipment_segments": over,
        "over_equipment_routes": sorted(set(over_detail)),
        "max_detour_ratio": round(max_detour[0], 3),
        "max_detour_route": max_detour[1],
        "same_elevation_crossings": crossings,
        "crossing_detail": cross_detail[:20],
        "tiers_used_note": "tiers separate crossings; lanes keep parallels apart",
    }
    try:
        with open(os.path.join(out_dir, "route-audit.json"), "w") as fh:
            json.dump(metrics, fh, indent=2)
    except OSError:
        pass
    print(f"[univ][route-audit] routes={metrics['routes']}  "
          f"over_equipment_segments={metrics['over_equipment_segments']}  "
          f"max_detour_ratio={metrics['max_detour_ratio']}  "
          f"same_elevation_crossings={metrics['same_elevation_crossings']}")
    if over_detail:
        print(f"[univ][route-audit]   over-equipment routes: "
              f"{', '.join(sorted(set(over_detail)))}")
    if cross_detail:
        print(f"[univ][route-audit]   same-Z crossings: {cross_detail[:8]}")
    return metrics


# ── ROUTE → COSTED-SPEC RECONCILIATION (council 2026-06-16, two routing-cost fixes) ──
# Runs ONCE after audit_routes, BEFORE write_connection_schedule + write_route_manifest.
# Both of those read _CONN_SPECS, so reconciling the specs in place repairs the COST
# (connection-schedule + requirements_bom) AND the DRAWINGS (route-manifest → isometric)
# together — ONE source. Universal + deterministic: no class table, no `if ras`.
#
#  DEFECT 1 — a FLUID edge whose source OR target resolves to a PURE INSTRUMENT is
#    nonsense (a £167k DN350 process main to a Temperature Sensor). The primary
#    topology / cross-module grammar routes these even though the AUGMENT path's
#    _required_services guard already discards 'water' for an instrument — they bypass
#    that. DROP them from the costed schedule + the drawn manifest. The instrument is
#    still wired by its own signal cable elsewhere, so nothing is orphaned.
#
#  DEFECT 2 — a routed run that DETOURS (perimeter spine, or a giant riser for a 2.5 m
#    hop) inflates length_m → £ AND pump friction-head (dP over fake length). CAP the
#    COSTED length at min(actual, straight_line_endpoint_distance × 2.5 + 5 m): real
#    routing has bends/risers (~1.5-2.5× straight-line is normal) but never ~20×. The
#    straight-line is the Euclidean XYZ distance between the two routed endpoints (the
#    polyline ends — includes a legitimate riser between endpoints at different
#    heights, so a tall genuine drop is NOT over-cut). The DRAWN geometry (waypoints)
#    is left as-is; only the costed/scheduled length_m is capped (the manifest reports
#    BOTH so the isometric is honest about geometry while the BoM is honest about £).
ROUTE_LENGTH_DETOUR_FACTOR = 2.5    # routed length may exceed straight-line by ≤ this…
ROUTE_LENGTH_DETOUR_PAD_M = 5.0     # …plus this pad (terminal stubs / short hops)


def _spec_pipe_rate_gbp_per_m(spec):
    """The £/m this spec's length costs at, for the saved-£ log (PIPE only — DEFECT 2
    bites overwhelmingly on fluid pipes; a coarse rate is fine for a one-line summary,
    the authoritative re-cost is cs.connection_schedule_costed on the capped specs)."""
    if spec.get("kind") != "pipe":
        return 0.0
    return float(cs.PIPE_COST_GBP_PER_M_BY_DN.get(spec.get("size_label"), 0.0))


def _delete_run_geometry(run_names):
    """Remove the BLENDER objects of the named routed runs (every object _draw_run /
    prim_pipe_run / _draw_cable_tray created carries the run name as its object-name
    prefix). Used when a route is DROPPED so its phantom geometry never renders. Returns
    the count removed."""
    names = [n for n in (run_names or []) if n]
    if not names:
        return 0
    n = 0
    for obj in list(bpy.data.objects):
        onm = obj.name
        if any(onm == rn or onm.startswith(rn) for rn in names):
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
                n += 1
            except (RuntimeError, ReferenceError):
                pass
    if n:
        print(f"[univ][route-reconcile]   deleted {n} phantom-route mesh object(s)")
    return n


def reconcile_route_specs(parts):
    """Apply the two routing-cost fixes to _CONN_SPECS in place (see block comment).
    Returns a small summary dict. Pure over the module globals — no I/O."""
    if not _CONN_SPECS:
        return {"instrument_edges_dropped": 0, "routes_capped": 0,
                "length_saved_m": 0.0, "gbp_saved": 0.0}

    # straight-line XYZ endpoint distance per run (from the polyline ends the router
    # already recorded), keyed by run name — the cap's denominator.
    straight_m_by_name = {}
    for r in _ROUTE_LOG:
        wp = r.get("waypoints") or []
        if len(wp) >= 2:
            a, b = wp[0], wp[-1]
            straight_m_by_name[r["name"]] = math.dist(a, b) * fl.MM   # mm → m

    cost_before = cs.connection_schedule_costed(_CONN_SPECS)["totals"]["grand_total_gbp"]

    # DEFECT 1 — drop fluid specs that tie a pure instrument into the process loop.
    kept = []
    dropped_instr = []
    dropped_run_names = []
    for s in _CONN_SPECS:
        if _mech_is_fluid(s.get("mechanism")):
            pa = resolve_endpoint(str(s.get("from_part") or ''), parts)
            pb = resolve_endpoint(str(s.get("to_part") or ''), parts)
            from_instr = _endpoint_is_pure_instrument(
                pa.name if pa is not None else s.get("from_part"))
            to_instr = _endpoint_is_pure_instrument(
                pb.name if pb is not None else s.get("to_part"))
            if from_instr or to_instr:
                dropped_instr.append((s.get("from_part"), s.get("to_part"),
                                      s.get("size_label"), float(s.get("length_m") or 0.0)))
                if s.get("run_name"):
                    dropped_run_names.append(s["run_name"])
                continue
        kept.append(s)
    if dropped_instr:
        _CONN_SPECS[:] = kept
        # DELETE the dropped routes' BLENDER GEOMETRY too — not just the cost spec. Without
        # this the phantom pipe stays drawn (a blue/red line ending in mid-air at the
        # instrument — Tristan 2026-06-22), even though it's gone from the BoM. _draw_run
        # names every object with the run name as prefix, so delete by that prefix.
        _delete_run_geometry(dropped_run_names)
        # purge their route-log entries so the connection audit + manifest agree.
        _ROUTE_LOG[:] = [r for r in _ROUTE_LOG if r.get("name") not in set(dropped_run_names)]

    # DEFECT 2 — cap the COSTED length of any detour at straight-line × factor + pad.
    n_capped = 0
    saved_m = 0.0
    for s in _CONN_SPECS:
        L = float(s.get("length_m") or 0.0)
        sl = straight_m_by_name.get(s.get("run_name"))
        if sl is None or sl <= 0.0 or L <= 0.0:
            continue
        cap = sl * ROUTE_LENGTH_DETOUR_FACTOR + ROUTE_LENGTH_DETOUR_PAD_M
        if L > cap + 0.01:
            s["length_capped_from_m"] = round(L, 2)         # disclose the original
            s["length_straight_m"] = round(sl, 2)
            s["length_m"] = round(cap, 2)
            n_capped += 1
            saved_m += (L - cap)

    cost_after = cs.connection_schedule_costed(_CONN_SPECS)["totals"]["grand_total_gbp"]
    gbp_saved = cost_before - cost_after

    instr_m = sum(d[3] for d in dropped_instr)
    print(f"[univ][route-reconcile] DEFECT 1: dropped {len(dropped_instr)} fluid "
          f"edge(s) routed onto a pure instrument ({instr_m:.0f} m of phantom pipe)"
          + ("".join(f"\n[univ][route-reconcile]   drop  {a!r}→{b!r}  {sz} {L:.0f} m"
                     for a, b, sz, L in dropped_instr) if dropped_instr else ""))
    print(f"[univ][route-reconcile] DEFECT 2: capped {n_capped} detour route(s) at "
          f"{ROUTE_LENGTH_DETOUR_FACTOR:g}× straight-line + {ROUTE_LENGTH_DETOUR_PAD_M:g} m "
          f"({saved_m:.0f} m of routed length removed)")
    print(f"[univ][route-reconcile] costed £ {cost_before:,.0f} → {cost_after:,.0f} "
          f"(saved £{gbp_saved:,.0f})")
    return {"instrument_edges_dropped": len(dropped_instr),
            "instrument_drop_detail": dropped_instr,
            "routes_capped": n_capped,
            "length_saved_m": round(saved_m, 1),
            "gbp_saved": round(gbp_saved, 2)}


def _write_connection_bom_md(out_dir, rows, totals):
    """Write a readable COSTED distribution BoM table to connection-bom.md:
    mechanism | from→to | size | length m | qty | £, grouped by mechanism with
    per-mechanism subtotals + a grand total. The £ are a documented MODEL
    (totals['cost_source']) — the header says so, plainly."""
    # group rows by mechanism, preserving first-seen order.
    by_mech = {}
    mech_order = []
    for r in rows:
        m = r.get("mechanism") or "(other)"
        if m not in by_mech:
            by_mech[m] = []
            mech_order.append(m)
        by_mech[m].append(r)

    def _g(x):
        return f"£{_safe_num(x):,.0f}"

    lines = []
    lines.append("# Distribution & cabling — costed BoM")
    lines.append("")
    lines.append(f"**Cost source:** `{totals.get('cost_source')}` — a DOCUMENTED "
                 "UK-2026 supply+install unit-cost model (cable £/m by CSA, pipe "
                 "£/m by DN, duct £/m by side, + per-termination hardware). These "
                 "are NOT engine/distributor data: the engine has no per-metre "
                 "cable/pipe/duct cost source, so this is a transparent quoting "
                 "model (treat as ±30%). See connection_sizing.py COST MODEL header.")
    lines.append("")
    lines.append(f"- Runs sized: **{totals.get('runs_sized', len(rows))}**  ·  "
                 f"out of spec: {totals.get('runs_out_of_spec', 0)}  ·  "
                 f"auto-upsized: {totals.get('runs_upsized', 0)}")
    lines.append(f"- Cable {_g(totals.get('cable_gbp'))}  ·  "
                 f"Pipe {_g(totals.get('pipe_gbp'))}  ·  "
                 f"Duct {_g(totals.get('duct_gbp'))}"
                 + (f"  ·  Transformer {_g(totals.get('transformer_gbp'))}"
                    if _safe_num(totals.get('transformer_gbp')) else "")
                 + (f"  ·  Other {_g(totals.get('other_gbp'))}"
                    if _safe_num(totals.get('other_gbp')) else ""))
    lines.append(f"- Terminations & connection hardware: "
                 f"{_g(totals.get('terminations_gbp'))}  "
                 f"(metre/install {_g(totals.get('install_gbp'))})")
    lines.append("")
    lines.append(f"## Grand total: {_g(totals.get('grand_total_gbp'))}")
    lines.append("")

    for m in mech_order:
        grp = by_mech[m]
        sub = sum(_safe_num(r.get("line_total_gbp")) for r in grp)
        lines.append(f"### {m}  —  subtotal {_g(sub)}")
        lines.append("")
        lines.append("| from → to | size | length (m) | qty | unit £/m | line £ |")
        lines.append("|---|---|---:|---:|---:|---:|")
        for r in grp:
            frm = r.get("from") or "?"
            to = r.get("to") or "?"
            size = r.get("size") or "(unsized)"
            L = r.get("length_m")
            Ls = f"{_safe_num(L):.1f}" if L is not None else "—"
            qty = r.get("qty") or "—"
            # keep the qty cell short in the table.
            qty = str(qty)
            if len(qty) > 42:
                qty = qty[:39] + "…"
            unit = r.get("unit_cost_gbp")
            us = f"£{_safe_num(unit):,.1f}" if unit is not None else "—"
            line = _g(r.get("line_total_gbp"))
            lines.append(f"| {frm} → {to} | {size} | {Ls} | {qty} | {us} | {line} |")
        lines.append("")

    try:
        with open(os.path.join(out_dir, "connection-bom.md"), "w") as fh:
            fh.write("\n".join(lines) + "\n")
    except OSError as ex:
        print(f"[univ][conn-bom] md write FAILED: {ex}")


def _safe_num(x):
    """float(x) or 0.0 — keeps the md writer robust against None/strings."""
    try:
        return float(x) if x is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ═══════════════════════════════════════════════════════════════════════════
# PARTS-POSITION MANIFEST  (the data the GA + isometric drawings consume)
# ───────────────────────────────────────────────────────────────────────────
# After placement, EVERY physical part carries placed_xyz_mm (its CENTRE) + a
# resolved geometry (footprint from the SAME resolved_dims_mm/footprint_mm the
# placer used). write_parts_manifest projects that into a small, deterministic
# parts-manifest.json — one row per placed part with its tag, module, shape, the
# centre position (mm), the real dims (w/d/h box OR dia/len cylinder), and a
# derived EQUIPMENT TAG (ISA letter + running number). It is PURE EXPORT: it
# reads already-placed state, writes ONE file, and touches nothing on the
# render / route / schedule paths. Always writes (gated only on out_dir).

# ISA equipment-tag letters by part SHAPE (the placer's classified shape is the
# strongest signal). A few shapes carry two plausible letters, disambiguated by
# the NAME below (e.g. a 'reactor' tall_vessel → R, a generic tall_vessel → V).
_TAG_LETTER_BY_SHAPE = {
    "compressor":        "K",   # compressor / blower / fan driver
    "pump":              "P",
    "tall_column":       "C",   # column / tower / absorber / stripper
    "tall_vessel":       "R",   # reactor (overridden to V for non-reactor)
    "vertical_vessel":   "V",   # guard bed / dryer / filter / coalescer
    "horizontal_vessel": "V",   # separator / drum / knock-out (D via name)
    "tank":              "T",   # bulk storage (TK via name)
    "stack":             "S",   # flare / oxidiser / chimney stack
    "package_box":       "H",   # fired heater / steam generator / boiler
    "skid_box":          "Z",   # packaged skid
    "transformer_box":   "TX",
    "cabinet":           "EP",  # switchgear / MCC / board (electrical panel)
    "cabinet_small":     "EP",  # VFD / control / I/O cabinet
    "gantry":            "G",
    "inline_spool":      "M",   # static mixer / in-line spool
    "instrument":        "I",   # valve / transmitter / analyser (field device)
    "box":               "X",
}

# NAME overrides — the engineer's noun decides the letter when the shape is
# ambiguous (a heat exchanger is a horizontal_vessel by shape but is E by tag; a
# reboiler/condenser likewise). First match wins; checked on the part NAME only.
_TAG_LETTER_BY_NAME = [
    (re.compile(r"reboiler|condenser|exchang|\bcooler\b|\bhx\b|chiller|"
                r"economi[sz]er|interchang|pre.?heat", re.I), "E"),
    (re.compile(r"reactor|reaction|hydrocrack|hydrotreat|isomeris|isomeriz|"
                r"\bcstr\b|\bpfr\b|carbonation|crystallis|crystalliz", re.I), "R"),
    (re.compile(r"column|tower|absorber|stripper|scrubber|fractionat|"
                r"distillat|contactor", re.I), "C"),
    (re.compile(r"separator|knock.?out|\bko\b.?drum|\bdrum\b|flash|coalesc|"
                r"demister|decanter|3.?phase|three.?phase", re.I), "D"),
    (re.compile(r"compressor|blower|\bfan\b|booster", re.I), "K"),
    (re.compile(r"\bpump\b", re.I), "P"),
    (re.compile(r"storage|\btank\b|reservoir|\bsump\b|bullet|sphere", re.I), "TK"),
    (re.compile(r"oxidi[sz]er|flare|stack|chimney|incinerat", re.I), "S"),
    (re.compile(r"steam.?gen|boiler|fired.?heat|furnace|waste.?heat", re.I), "H"),
    (re.compile(r"transformer", re.I), "TX"),
]


def _equipment_letter(part):
    """The ISA tag letter for a placed part.

    The placer's SHAPE wins for FIELD DEVICES (a 'reactor thermowell' or a
    'reactor pressure-relief valve' is shape=instrument → I, never R just because
    the name references the reactor it protects); same for an in-line spool/mixer
    (M). For real EQUIPMENT shapes the NAME noun is most specific (a heat-exchanger
    horizontal_vessel is E, a separator drum is D) and wins over the shape default;
    fall back to the shape letter, else 'X'."""
    if part.shape == "instrument":
        return "I"
    if part.shape == "inline_spool":
        return "M"
    head = _name_head(part.name)
    for rx, letter in _TAG_LETTER_BY_NAME:
        if rx.search(head):
            return letter
    return _TAG_LETTER_BY_SHAPE.get(part.shape, "X")


def _world_bbox_mm_by_prefix(parts):
    """Union the WORLD-SPACE bounding box (mm) of every placed Blender MESH object,
    grouped by the part prefix that built it (longest-prefix-first, the SAME mapping
    apply_inspection_materials uses). This is the UNIVERSAL geometry source: every
    placement family (process-plant, rack-farm, panel-array, tower-machine, aero,
    generic) populates the Blender scene, even the ones that never back-annotate
    part.placed_xyz_mm. Returns {prefix: (xmin,xmax,ymin,ymax,zmin,zmax) in mm}.

    Excludes the structure/frame/route/datum helpers (u_skid_/u_rack_/u_route_/
    u_pipe_/u_ground_) so an equipment footprint is the EQUIPMENT, not the skid it
    sits in. Coords are Blender units (1 BU = 1 m) × 1000 → mm, via each object's
    matrix_world over its 8 local bound_box corners."""
    prefixes = sorted({_part_prefix(p.name) for p in parts},
                      key=len, reverse=True)
    acc = {}
    SKIP = ("u_skid_", "u_rack_", "u_route_", "u_pipe_", "u_ground_", "u_grid_",
            "u_datum_", "u_dim_")
    for obj in list(bpy.data.objects):
        if getattr(obj, "type", None) != "MESH" or obj.data is None:
            continue
        nm = obj.name
        if any(nm.startswith(s) for s in SKIP):
            continue
        pref = None
        for pr in prefixes:           # longest first → most specific wins
            if nm.startswith(pr):
                pref = pr
                break
        if pref is None:
            continue
        mw = obj.matrix_world
        try:
            _V = __import__("mathutils").Vector
            corners = [mw @ _V(c) for c in obj.bound_box]
        except Exception:
            continue
        xs = [c.x for c in corners]
        ys = [c.y for c in corners]
        zs = [c.z for c in corners]
        b = acc.get(pref)
        lo_x, hi_x = min(xs) * 1000.0, max(xs) * 1000.0
        lo_y, hi_y = min(ys) * 1000.0, max(ys) * 1000.0
        lo_z, hi_z = min(zs) * 1000.0, max(zs) * 1000.0
        if b is None:
            acc[pref] = [lo_x, hi_x, lo_y, hi_y, lo_z, hi_z]
        else:
            b[0] = min(b[0], lo_x); b[1] = max(b[1], hi_x)
            b[2] = min(b[2], lo_y); b[3] = max(b[3], hi_y)
            b[4] = min(b[4], lo_z); b[5] = max(b[5], hi_z)
    return {k: tuple(v) for k, v in acc.items()}


def _world_bbox_mm_for_exact_prefix(prefix):
    """World-space bbox (mm) of every placed MESH object whose name starts with the
    EXACT given prefix — same matrix_world maths + SKIP filter as
    _world_bbox_mm_by_prefix, but for ONE explicit prefix. Used to separate the N
    instances of a qty-N vessel (u_<slug>_inst0 … u_<slug>_inst{N-1}), which the
    by-prefix union (keyed by the bare slug) would otherwise lump into one box.
    Returns (xmin,xmax,ymin,ymax,zmin,zmax) in mm, or None if nothing matched."""
    SKIP = ("u_skid_", "u_rack_", "u_route_", "u_pipe_", "u_ground_", "u_grid_",
            "u_datum_", "u_dim_")
    b = None
    for obj in list(bpy.data.objects):
        if getattr(obj, "type", None) != "MESH" or obj.data is None:
            continue
        nm = obj.name
        if not nm.startswith(prefix):
            continue
        if any(nm.startswith(s) for s in SKIP):
            continue
        mw = obj.matrix_world
        try:
            _V = __import__("mathutils").Vector
            corners = [mw @ _V(c) for c in obj.bound_box]
        except Exception:
            continue
        xs = [c.x for c in corners]
        ys = [c.y for c in corners]
        zs = [c.z for c in corners]
        lo_x, hi_x = min(xs) * 1000.0, max(xs) * 1000.0
        lo_y, hi_y = min(ys) * 1000.0, max(ys) * 1000.0
        lo_z, hi_z = min(zs) * 1000.0, max(zs) * 1000.0
        if b is None:
            b = [lo_x, hi_x, lo_y, hi_y, lo_z, hi_z]
        else:
            b[0] = min(b[0], lo_x); b[1] = max(b[1], hi_x)
            b[2] = min(b[2], lo_y); b[3] = max(b[3], hi_y)
            b[4] = min(b[4], lo_z); b[5] = max(b[5], hi_z)
    return tuple(b) if b is not None else None


# ── SYNTHETIC-EQUIPMENT grouping for the AGGREGATE placement families ────────
# rack_farm / panel_array / tower_machine / aero_body build their geometry under
# their OWN object-naming scheme (u_rf_*, u_gr_*, u_tm_*, u_aero_*) instead of
# instantiating one build_part() per BoM word — the cells / racks / blades are
# aggregated, the BoP is a small set of role skids. So per-word matching finds
# NOTHING. For those families we recover the GA equipment by grouping the DRAWN
# synthetic objects into equipment BLOCKS by a family-aware key, and tag each by
# its role. This keeps the manifest UNIVERSAL: every family yields a real set of
# tagged, positioned, dimensioned equipment outlines for the GA, even when the
# words themselves were never drawn as discrete parts.

# role token (in the synthetic object name) → (ISA tag letter, human label, round?)
_SYN_ROLE = {
    # rack-farm BoP + racks
    "rack":      ("BR", "Battery / equipment rack", False),
    "pcs":       ("PCS", "Power conversion system", False),
    "chiller":   ("CH", "Liquid chiller / cooling skid", False),
    "bms":       ("BMS", "Battery management controller", False),
    "bms_ctrl":  ("BMS", "Battery management controller", False),
    "fire":      ("FS", "Fire suppression skid", False),
    "transformer": ("TX", "Step-up transformer", False),
    "switchgear": ("SG", "Switchgear / LV board", False),
    # tower-machine
    "tower":     ("WT", "Turbine tower", True),
    "nacelle":   ("WT", "Nacelle", False),
    "blade":     ("BL", "Rotor blade", False),
    "foundation": ("FD", "Foundation", True),
    "hub":       ("HB", "Rotor hub", True),
    # panel-array (vertical farm)
    "growrack":  ("GR", "Grow rack", False),
    "canopy":    ("CN", "Grow canopy", False),
    "hvac":      ("AH", "Air-handling / HVAC skid", False),
    "nutrient":  ("NT", "Nutrient / dosing skid", False),
    "water":     ("WS", "Water treatment skid", False),
    "co2":       ("GS", "CO2 enrichment skid", False),
    "control":   ("EP", "Control cabinet", False),
    # aero-body
    "fuselage":  ("AB", "Airframe / bus", True),
    "wing":      ("WG", "Wing / solar array", False),
    "prop":      ("PR", "Propulsor", True),
    "antenna":   ("AN", "Antenna / payload", False),
    "bus":       ("AB", "Spacecraft bus", False),
    "array":     ("SA", "Solar array", False),
}

# Recognised synthetic prefixes → a regex that captures (block_key, role) from the
# object name, so each distinct piece of kit becomes ONE manifest row. block_key
# makes a rack r0c0 distinct from r0c1; role drives the tag.
_SYN_PREFIX_RE = [
    # rack-farm racks: u_rf_rack_r0_c0_<detail> → block 'rack_r0_c0', role 'rack'
    (re.compile(r"^(u_rf_rack_r\d+_c\d+)_"), "rack"),
    # rack-farm BoP with a bay index: u_rf_bop_pcs_bay0_<detail> → block keeps bay
    (re.compile(r"^(u_rf_bop_([a-z]+(?:_[a-z]+)?)_bay\d+)"), None),
    # rack-farm BoP single: u_rf_bop_chiller_<detail> → block 'bop_chiller'
    (re.compile(r"^(u_rf_bop_([a-z]+(?:_ctrl)?))_"), None),
    # tower-machine: u_tm_<role><idx?>_<detail>
    (re.compile(r"^(u_tm_(tower|nacelle|hub|foundation|blade\d*))"), None),
    # panel-array grow racks: u_gr_rack_<r>_<c>_<detail>
    (re.compile(r"^(u_gr_rack_\d+_\d+)"), "growrack"),
    # panel-array BoP: u_gr_bop_<role>_<detail>
    (re.compile(r"^(u_gr_bop_([a-z0-9]+))"), None),
    # aero-body: u_aero_<role><idx?>_<detail>
    (re.compile(r"^(u_aero_([a-z]+)\d*)"), None),
]


def _syn_role_from_block(block_key: str, explicit_role):
    """Pull the role token out of a synthetic block key (or use the explicit role
    the regex assigned). Maps to (letter, label, round) via _SYN_ROLE; unknown
    roles fall back to a neutral 'EQ' tag so nothing is silently dropped."""
    role = explicit_role
    if role is None:
        # the 2nd capture group (if any) is the role; else infer from tokens.
        toks = block_key.split("_")
        for t in toks:
            if t in _SYN_ROLE:
                role = t
                break
        if role is None:
            # join two tokens for compound roles (bms_ctrl)
            for i in range(len(toks) - 1):
                j = f"{toks[i]}_{toks[i+1]}"
                if j in _SYN_ROLE:
                    role = j
                    break
    if role and role in _SYN_ROLE:
        return role, _SYN_ROLE[role]
    return (role or "equipment"), ("EQ", _humanise_role(role or "equipment"), False)


def _humanise_role(role: str) -> str:
    return role.replace("_", " ").strip().capitalize() or "Equipment"


def _synthetic_equipment_rows(parts, region_rank_default):
    """Build manifest rows from the DRAWN synthetic equipment objects (rack-farm /
    panel-array / tower-machine / aero-body). Groups MESH objects by the family
    block key, unions each block's world bbox (mm), and emits one tagged row per
    block. Returns rows[] (same schema as build_parts_manifest's per-word rows)."""
    _V = __import__("mathutils").Vector
    blocks = {}   # block_key → [role, bbox list]
    for obj in list(bpy.data.objects):
        if getattr(obj, "type", None) != "MESH" or obj.data is None:
            continue
        nm = obj.name
        if nm.startswith(("u_skid_", "u_route_", "u_pipe_", "u_trunk_", "u_tap_",
                          "u_wire_", "u_ground_")):
            continue
        block_key = role = None
        for rx, fixed_role in _SYN_PREFIX_RE:
            m = rx.match(nm)
            if m:
                block_key = m.group(1)
                role = fixed_role
                break
        if not block_key:
            continue
        try:
            corners = [obj.matrix_world @ _V(c) for c in obj.bound_box]
        except Exception:
            continue
        xs = [c.x * 1000.0 for c in corners]
        ys = [c.y * 1000.0 for c in corners]
        zs = [c.z * 1000.0 for c in corners]
        b = blocks.get(block_key)
        if b is None:
            blocks[block_key] = [role, [min(xs), max(xs), min(ys), max(ys),
                                        min(zs), max(zs)]]
        else:
            bb = b[1]
            bb[0] = min(bb[0], min(xs)); bb[1] = max(bb[1], max(xs))
            bb[2] = min(bb[2], min(ys)); bb[3] = max(bb[3], max(ys))
            bb[4] = min(bb[4], min(zs)); bb[5] = max(bb[5], max(zs))

    entries = []
    for block_key, (explicit_role, bb) in blocks.items():
        role, (letter, label, is_round) = _syn_role_from_block(block_key, explicit_role)
        cx = (bb[0] + bb[1]) / 2.0
        cy = (bb[2] + bb[3]) / 2.0
        cz = (bb[4] + bb[5]) / 2.0
        w = bb[1] - bb[0]; dep = bb[3] - bb[2]; h = bb[5] - bb[4]
        entries.append((block_key, role, letter, label, is_round,
                        cx, cy, cz, w, dep, h))

    # deterministic order: by role letter, then Y, X, Z
    entries.sort(key=lambda e: (e[2], round(e[6], 1), round(e[5], 1), round(e[7], 1),
                                e[0]))
    counters = {}
    rows = []
    for (block_key, role, letter, label, is_round,
         cx, cy, cz, w, dep, h) in entries:
        counters[letter] = counters.get(letter, 100) + 1
        equip_tag = f"{letter}-{counters[letter]}"
        if is_round:
            dims = {"dia": round(max(w, dep), 1), "len": round(h, 1)}
        else:
            dims = {"w": round(w, 1), "d": round(dep, 1), "h": round(h, 1)}
        rows.append({
            "tag": block_key,
            "equipment_tag": equip_tag,
            "name": label,
            "module": role,
            "shape": "synthetic_block",
            "qty": 1,
            "pos_mm": [round(cx, 1), round(cy, 1), round(cz, 1)],
            "dims_mm": dims,
        })
    return rows


def build_parts_manifest(parts):
    """Build the deterministic parts-manifest rows for every PLACED physical part.

    Geometry comes from the placed BLENDER OBJECTS' world bounding boxes (universal
    across every placement family), keyed by each part's object prefix. A part with
    no objects in the scene (aggregated into a rack, or a pure-line word) is omitted
    — the manifest lists what was actually DRAWN. The as-placed centre is the bbox
    centre on x/y; for z the row carries the bbox CENTRE z (the GA spans z about it).

    Determinism: rows are tag-assigned in a STABLE order (region rank, then Y, X, Z,
    then name) so the same scene always yields the same equipment tags. Each row:
    {tag, equipment_tag, name, module, shape, qty, pos_mm:[x,y,z], dims_mm:{...}}.
    `tag` is the slugged object prefix; `equipment_tag` is the ISA letter + a
    per-letter running number (K-101, P-101, R-101, V-101, D-101, E-101, TK-101…)."""
    bbox_by_pref = _world_bbox_mm_by_prefix(parts)

    # one Part per object-prefix (the richest by region rank wins the metadata; a
    # name that slugged identically is the same drawn equipment).
    by_pref = {}
    for p in parts:
        pref = _part_prefix(p.name)
        if pref not in bbox_by_pref:
            continue                 # this word drew nothing (aggregated / abstract)
        by_pref.setdefault(pref, p)

    entries = []
    for pref, p in by_pref.items():
        # A qty-N vessel (the _VESSEL_KIND shapes build_part replicates) was drawn as
        # N DISTINCT instances u_<slug>_inst0…inst{N-1}. Emit one row per instance —
        # each with its OWN world bbox — so 10 rearing tanks become 10 rows (TK-101…
        # TK-110) at distinct compact-grid positions, not one unioned mega-tank.
        qty = int(getattr(p, "qty", 1) or 1)
        if (p.shape in _VESSEL_KIND or p.shape in _REPLICATED_MACHINE_KIND) and 2 <= qty <= 12:
            n_inst = min(qty, 12)
            added = 0
            for idx in range(n_inst):
                ibb = _world_bbox_mm_for_exact_prefix(f"{pref}_inst{idx}")
                if ibb is None:
                    continue
                ixmin, ixmax, iymin, iymax, izmin, izmax = ibb
                # one Part per instance so each row gets its own running tag + qty 1
                ip = Part(p.name, p.module_id, p.region_key, p.region_rank,
                          p.shape, p.dim, 1, p.form)
                entries.append((f"{pref}_inst{idx}", ip,
                                (ixmin + ixmax) / 2.0, (iymin + iymax) / 2.0,
                                (izmin + izmax) / 2.0,
                                ixmax - ixmin, iymax - iymin, izmax - izmin))
                added += 1
            if added:
                continue
            # fall through to the unioned single-row path if no instance matched
            # (defensive — should not happen once build_part replicated the vessel)
        xmin, xmax, ymin, ymax, zmin, zmax = bbox_by_pref[pref]
        cx = (xmin + xmax) / 2.0
        cy = (ymin + ymax) / 2.0
        cz = (zmin + zmax) / 2.0
        w = xmax - xmin
        dep = ymax - ymin
        h = zmax - zmin
        entries.append((pref, p, cx, cy, cz, w, dep, h))

    # stable deterministic order for tag assignment
    entries.sort(key=lambda e: (e[1].region_rank, round(e[3], 1), round(e[2], 1),
                                round(e[4], 1), e[1].name.lower()))

    counters = {}
    rows = []
    for pref, p, cx, cy, cz, w, dep, h in entries:
        letter = _equipment_letter(p)
        counters[letter] = counters.get(letter, 100) + 1
        equip_tag = f"{letter}-{counters[letter]}"
        # round vs square footprint: a cylinder-shaped part reports {dia,len}.
        round_shape = p.shape in ("tall_column", "tall_vessel", "vertical_vessel",
                                  "tank", "stack", "horizontal_vessel",
                                  "inline_spool")
        if round_shape:
            # CANONICAL SHELL over drawn BBOX. A placed vessel's bounding box also
            # contains non-structural FURNITURE — a foundation plinth (≈8% wider than
            # the shell), a top guardrail/handrail standing ≈1 m above the rim, a
            # support skirt — which inflates a SHALLOW tank's apparent ⌀ and height
            # (a ⌀12.4×3.2 m rearing-tank shell draws a ≈⌀13.4×4.6 m bbox → a 1.9×
            # phantom-volume over-read in the BoM material take-off + a silo look in
            # the GA). Report the ⌀×height the vessel was SIZED to (parse_dimension's
            # two-figure cylinder) so BoM, GA footprint and 3D agree on ONE tank.
            sd = getattr(p, "dim", None)
            if isinstance(sd, dict) and sd.get("kind") == "cyl" \
                    and sd.get("dia_mm") and sd.get("len_mm"):
                dia = round(sd["dia_mm"], 1)       # sized shell diameter
                length = round(sd["len_mm"], 1)    # sized shell height / axial length
            elif p.shape in ("horizontal_vessel", "inline_spool"):
                # lies on its side: diameter = the smaller of footprint depth/height,
                # length = the long axis (the larger of width/depth footprint).
                dia = round(min(dep, h) if min(dep, h) > 1 else max(dep, h), 1)
                length = round(max(w, dep), 1)
            else:
                dia = round(max(w, dep), 1)        # plan footprint diameter
                length = round(h, 1)               # standing height
            dims = {"dia": dia, "len": length}
        else:
            # SIZED FOOTPRINT over drawn BBOX (mirrors the round-shape branch above): the drawn
            # prefix-bbox can be POLLUTED — by attached furniture, OR by a NAME COLLISION (two
            # distinct words sharing a name_human slug to the same object prefix, so the bbox
            # unions their geometry ACROSS regions into a phantom mega-part — the 32 m "Degassing
            # Blower" spanning the gap between two real blowers). When the part carries an explicit
            # box dim, report THAT footprint so the GA + BoM see the real device size, not the union.
            sd = getattr(p, "dim", None)
            if isinstance(sd, dict) and sd.get("kind") == "box" \
                    and sd.get("w_mm") and sd.get("d_mm"):
                dims = {"w": round(sd["w_mm"], 1), "d": round(sd["d_mm"], 1),
                        "h": round(sd.get("h_mm") or h, 1)}
            else:
                dims = {"w": round(w, 1), "d": round(dep, 1), "h": round(h, 1)}
        # An INSTRUMENT's reported dims must match its capped render geometry (≤600 mm) — the
        # box branch above reports the RAW part.dim, which for a mis-tagged device (Voltage
        # Sensor @1.28 m) re-introduces the vessel-scale size the render already capped. Cap
        # here too so the BoM/GA agree with the model (Tristan 2026-06-22).
        if p.shape == "instrument":
            dims = {k: round(min(float(v), 600.0), 1) for k, v in dims.items()}
        rows.append({
            "tag": pref,
            "equipment_tag": equip_tag,
            "name": p.name,
            "module": p.module_id,
            "shape": p.shape,
            "qty": int(p.qty) if p.qty else 1,
            "pos_mm": [round(cx, 1), round(cy, 1), round(cz, 1)],
            "dims_mm": dims,
        })

    # AGGREGATE FAMILIES (rack-farm / panel-array / tower-machine / aero-body) draw
    # their kit under a synthetic naming scheme, so per-word matching above finds
    # (almost) nothing. When that happens, recover the GA equipment from the drawn
    # synthetic blocks instead — keeps the manifest universal across families.
    if len(rows) < 4:
        syn = _synthetic_equipment_rows(parts, REGION_PRIORITY_DEFAULT)
        if len(syn) > len(rows):
            return syn
    return rows


def _remap_manifest_to_canonical_tags(rows, state):
    """Overwrite each AUXILIARY manifest row's equipment_tag with the canonical tag the
    bill-of-materials + instrument index already use (canonical_tags.build_name_tag_map),
    so the GA / P&ID / line-list and the Excel show ONE tag per part (Tristan 2026-06-21:
    "one name/tag per part used throughout"). Before this, the manifest minted its own
    SHAPE-class tag (a blower → K-103) for a part the BoM calls B-201 — two namespaces for
    the same plant. PRINCIPALS are untouched (build_name_tag_map only carries synthesised
    instruments / actuators / utilities), so TK-101 / C-101 / P-101 keep their manifest tag
    that the BoM already agrees on. Per-instance: the Nth drawn row of a name takes the Nth
    canonical tag (in row order); when more instances are drawn than were tagged the last
    tag is reused. Pure mutation of rows; no-op when state / canonical_tags is unavailable."""
    if state is None:
        return 0
    try:
        import canonical_tags as _ct
    except Exception:
        return 0
    name_map = _ct.build_name_tag_map(state)
    if not name_map:
        return 0
    used: dict[str, int] = {}
    n_remapped = 0
    for row in rows:
        key = _ct._norm_name(row.get("name"))
        tags = name_map.get(key)
        if not tags:
            continue
        idx = used.get(key, 0)
        new_tag = tags[idx] if idx < len(tags) else tags[-1]
        used[key] = idx + 1
        if row.get("equipment_tag") != new_tag:
            row["equipment_tag"] = new_tag
            n_remapped += 1
    if n_remapped:
        print(f"[parts-manifest] unified {n_remapped} auxiliary tag(s) to the canonical "
              f"BoM/index namespace (canonical_tags)")
    return n_remapped


def write_parts_manifest(out_dir, parts, state=None):
    """Write <out_dir>/parts-manifest.json — the parts-position export the GA +
    isometric drawing generators consume. PURE EXPORT (reads placed state, writes
    one file). Returns the manifest dict (also handy for the SUMMARY line).

    `state` (the design state.json dict) lets the manifest adopt the canonical auxiliary
    tags so the drawings and the BoM/Excel share ONE tag per part; omitted → the legacy
    shape-class manifest tags (back-compat for callers that don't pass it).

    Kill switch: GA_SKIP_MANIFEST=1 skips ALL manifest work (the bbox reads + the
    write) — used to prove the render / route-audit outputs are byte-identical with
    or without the manifest export (it must change NOTHING else)."""
    if not out_dir:
        return {"parts": [], "count": 0}
    if os.environ.get("GA_SKIP_MANIFEST", "").strip() not in ("", "0", "false", "no"):
        print("[parts-manifest] SKIPPED (GA_SKIP_MANIFEST set)")
        return {"parts": [], "count": 0, "skipped": True}
    os.makedirs(out_dir, exist_ok=True)
    rows = build_parts_manifest(parts)
    # Unify auxiliary tags with the canonical BoM/index namespace (kill: CANON_TAGS=0).
    if os.environ.get("CANON_TAGS", "").strip() not in ("0", "false", "no"):
        _remap_manifest_to_canonical_tags(rows, state)
    # overall placed-equipment bounding box (mm) — the GA's plant L×W×H source.
    if rows:
        xs, ys, zs_lo, zs_hi = [], [], [], []
        for r in rows:
            x, y, z = r["pos_mm"]
            d = r["dims_mm"]
            if "dia" in d:
                hw = hd = d["dia"] / 2.0
                hh = d["len"]
            else:
                hw, hd, hh = d["w"] / 2.0, d["d"] / 2.0, d["h"]
            xs += [x - hw, x + hw]
            ys += [y - hd, y + hd]
            zs_lo.append(z - hh / 2.0)
            zs_hi.append(z + hh / 2.0)
        bbox = {
            "x_min_mm": round(min(xs), 1), "x_max_mm": round(max(xs), 1),
            "y_min_mm": round(min(ys), 1), "y_max_mm": round(max(ys), 1),
            "z_min_mm": round(min(zs_lo), 1), "z_max_mm": round(max(zs_hi), 1),
        }
        bbox["length_mm"] = round(bbox["x_max_mm"] - bbox["x_min_mm"], 1)
        bbox["width_mm"] = round(bbox["y_max_mm"] - bbox["y_min_mm"], 1)
        bbox["height_mm"] = round(bbox["z_max_mm"] - max(0.0, bbox["z_min_mm"]), 1)
    else:
        bbox = {}
    manifest = {"schema": "parts-manifest/1", "count": len(rows),
                "bbox_mm": bbox, "parts": rows}
    with open(os.path.join(out_dir, "parts-manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    print(f"[parts-manifest] wrote {len(rows)} placed parts → "
          f"{os.path.join(out_dir, 'parts-manifest.json')}"
          + (f"  (plant {bbox.get('length_mm', 0)/1000:.1f}×"
             f"{bbox.get('width_mm', 0)/1000:.1f}×"
             f"{bbox.get('height_mm', 0)/1000:.1f} m)" if bbox else ""))
    return manifest


# ═══════════════════════════════════════════════════════════════════════════
# ROUTE-WAYPOINT MANIFEST  (the data the PIPING ISOMETRIC generator consumes)
# ═══════════════════════════════════════════════════════════════════════════
# After routing, every drawn run is in _ROUTE_LOG (its orthogonal polyline) and —
# when it was sized — its ConnectionSpec is in _CONN_SPECS (from/to/mechanism/DN/OD/
# service). We JOIN the two by run name + project each route into one manifest entry:
# the routed polyline + an elbow at every bend + a tee at every shared spine origin +
# a reducer where a tap leaves a fatter trunk. draw_isometric.py reads this file (and
# reconstruct_process() from draw_pid.py) to lay each MAJOR line out as a real iso.
#
# PURE EXPORT (reads the route log + the specs already built; writes ONE file). The
# kill switch ROUTE_SKIP_MANIFEST=1 skips ALL of it, so a run with vs without proves
# the renders / route-audit / connection-schedule are byte-identical — it changes
# nothing else.

# Short SERVICE code from a material_context / endpoint names — IDENTICAL table to
# draw_pid._service_code so the manifest's best-effort line number agrees with the
# P&ID + line list (the iso ALSO re-derives via reconstruct_process for the exact
# match; this keeps the manifest readable + self-consistent on its own).
_RM_SERVICE_TABLE = [
    ("steam", "ST"), ("condensate", "CD"), ("cooling", "CW"), ("coolant", "CW"),
    ("h2", "H2"), ("hydrogen", "H2"), ("co2", "CO"), ("tail_gas", "TG"),
    ("tail gas", "TG"), ("recycle", "RC"), ("purge", "PG"), ("amine", "AM"),
    ("slurry", "SL"), ("naphtha", "NP"), ("saf", "PR"), ("syncrude", "SC"),
    ("flue", "FG"), ("vent", "VT"), ("water", "WT"),
]


def _rm_service_code(frm, to, mc):
    blob = f"{frm or ''} {to or ''} {mc or ''}".lower()
    for needle, code in _RM_SERVICE_TABLE:
        if needle in blob:
            return code
    return "PR"   # generic process line


def _rm_dn_label(size_label):
    """Pull a compact DN / CSA token out of a connection size_label for the line no.
    'DN200' → 'DN200'; '3×400 mm²' → '' (electrical buses don't get a DN suffix)."""
    if not size_label:
        return ""
    m = re.search(r"\bDN\s?(\d+)\b", str(size_label), re.I)
    if m:
        return "DN" + m.group(1)
    return ""


def _rm_fittings(waypoints, trunk_origin=None, is_tap=False):
    """Derive the in-line fittings from a routed orthogonal polyline:
      • an ELBOW at every interior bend (the direction changes between two legs);
      • a TEE at the run's start when it taps off a shared trunk/spine origin;
      • a REDUCER on a tap (a branch leaving a fatter header is a smaller bore).
    Orthogonal routes only ever turn 90°, so every interior vertex where the travel
    axis changes is a single elbow. Returns a list of {type, at:[x,y,z]} (mm)."""
    fittings = []
    if is_tap and waypoints:
        fittings.append({"type": "tee", "at": [round(c, 1) for c in waypoints[0]]})
        fittings.append({"type": "reducer", "at": [round(c, 1) for c in waypoints[0]]})
    n = len(waypoints)
    for k in range(1, n - 1):
        p, q, r = waypoints[k - 1], waypoints[k], waypoints[k + 1]
        # the axis that changed between leg p→q and leg q→r: if the dominant motion
        # axis differs, q is a 90° bend → an elbow.
        d1 = (q[0] - p[0], q[1] - p[1], q[2] - p[2])
        d2 = (r[0] - q[0], r[1] - q[1], r[2] - q[2])
        ax1 = max(range(3), key=lambda i: abs(d1[i]))
        ax2 = max(range(3), key=lambda i: abs(d2[i]))
        moved1 = abs(d1[ax1]) > 1.0
        moved2 = abs(d2[ax2]) > 1.0
        if moved1 and moved2 and ax1 != ax2:
            fittings.append({"type": "elbow", "at": [round(c, 1) for c in q]})
    return fittings


def write_route_manifest(out_dir):
    """Write <out_dir>/route-manifest.json — one entry per ROUTED connection (the
    topology + derived edges that get drawn). The piping-isometric generator's input.

    Each entry: {line_number, mechanism, from_tag, to_tag, size_label, outer_dia_mm,
    waypoints_mm:[[x,y,z]...], fittings:[{type,at}]}. The waypoints are the EXACT
    orthogonal polyline _ROUTE_LOG recorded; the size/from/to/service come from the
    matching ConnectionSpec (joined by run name). PURE EXPORT — see header.

    Kill switch: ROUTE_SKIP_MANIFEST=1 skips the whole thing (proves byte-identical
    renders / route-audit / schedule with or without)."""
    if not out_dir:
        return {"lines": [], "count": 0}
    if os.environ.get("ROUTE_SKIP_MANIFEST", "").strip() not in ("", "0", "false", "no"):
        print("[route-manifest] SKIPPED (ROUTE_SKIP_MANIFEST set)")
        return {"lines": [], "count": 0, "skipped": True}
    os.makedirs(out_dir, exist_ok=True)

    # index the sized ConnectionSpecs by run name (the join key _draw_run stamps on
    # both the route-log entry's `name` and the spec's `run_name`). LAST spec wins for
    # a duplicated name (the trunk/tap split uses distinct names, so collisions are
    # only a re-emitted identical run — the later one is the kept geometry).
    spec_by_name = {}
    for s in _CONN_SPECS:
        nm = s.get("run_name")
        if nm:
            spec_by_name[nm] = s

    # trunk names → so a tap that shares the trunk's spine origin is marked is_tap.
    trunk_names = {s.get("run_name") for s in _CONN_SPECS
                   if str(s.get("role") or "").lower() == "trunk"}

    rows = []
    seq = 200            # mirrors draw_pid's loop base (200 + i) for the line number.
    _skipped_degenerate = 0
    for i, r in enumerate(_ROUTE_LOG, start=1):
        nm = r.get("name")
        wp = [[round(float(c), 1) for c in p] for p in r.get("waypoints", [])]
        spec = spec_by_name.get(nm, {})
        mech = r.get("mech") or spec.get("mechanism") or ""
        frm = spec.get("from_part")
        to = spec.get("to_part")
        # LEDGER INTEGRITY (Tristan 2026-06-20): never emit a DEGENERATE route — one
        # whose spec carries NO resolvable endpoints (the 'pipe from nothing to nothing'
        # he flagged). The ledger authors only endpoint-valid connections; a route that
        # reached here with both tags empty is a fan-out / fallback artefact, not a real
        # connection, and must not pollute the manifest, the drawings, or the BoM.
        if not frm and not to:
            _skipped_degenerate += 1
            continue
        size_label = spec.get("size_label")
        outer_dia = spec.get("outer_dia_mm")
        mc = spec.get("material_context") or ""
        role = str(spec.get("role") or "").lower()
        is_tap = (role == "branch")
        svc = _rm_service_code(frm, to, mc)
        dn = _rm_dn_label(size_label)
        line_number = f"{seq + i}-{svc}" + (f"-{dn}" if dn else "")
        # PIPE-LINE MATERIAL (universal, fluid-keyed): the corrosion-appropriate material
        # the line list + the BoM both quote — a corrosive-fluid run (seawater / saline /
        # brine / effluent) defaults to HDPE/PE100 (chloride-proof), an oxidiser/LOX/ozone
        # line to 316L, everything else to the substring-or-carbon default. Same resolver
        # cost uses, so the drawn line list agrees with the costed BoM. Only fluid/pipe runs
        # carry a pipe material; an electrical bus / duct leaves it null.
        pipe_material = None
        if dn or any(k in (mech or "").lower()
                     for k in ("fluid", "pipe", "thermal", "process", "water",
                               "steam", "gas", "coolant")):
            _mf, pipe_material = cs._pipe_material_factor(mc or None)
        rows.append({
            "line_number": line_number,
            "run_name": nm,
            "mechanism": mech,
            "role": role or None,
            "from_tag": frm,
            "to_tag": to,
            "service": mc or None,
            "material": pipe_material,
            "size_label": size_label,
            "outer_dia_mm": outer_dia,
            "length_m": spec.get("length_m"),   # COSTED length (detour-capped — see reconcile)
            # If reconcile_route_specs capped this run, disclose the as-routed length so
            # the drawn polyline (waypoints) stays honest while the BoM uses the cap.
            "length_routed_m": spec.get("length_capped_from_m"),
            "waypoints_mm": wp,
            "fittings": _rm_fittings(r.get("waypoints", []), is_tap=is_tap),
        })

    manifest = {"schema": "route-manifest/1", "count": len(rows),
                "note": ("One entry per routed connection (the drawn orthogonal "
                         "polyline + an elbow at each bend). line_number mirrors "
                         "draw_pid; the isometric re-matches via reconstruct_process "
                         "for the exact P&ID/line-list number."),
                "lines": rows}
    with open(os.path.join(out_dir, "route-manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    n_fit = sum(len(r["fittings"]) for r in rows)
    n_wp = sum(len(r["waypoints_mm"]) for r in rows)
    print(f"[route-manifest] wrote {len(rows)} routed lines "
          f"({n_wp} waypoints, {n_fit} fittings"
          + (f"; {_skipped_degenerate} degenerate no-endpoint route(s) skipped" if _skipped_degenerate else "")
          + f") → {os.path.join(out_dir, 'route-manifest.json')}")
    return manifest


def write_connection_schedule(out_dir):
    """PHASE C — the BoM feedback. Flatten every sized ConnectionSpec into the
    distribution SCHEDULE (connection_schedule), write it to connection-schedule.json
    and log a [conn-schedule] roll-up (total cable-m by CSA, pipe-m by DN, duct-m by
    size) plus a [conn-WARN] line per run that is NOT within spec (volt-drop /
    velocity over limit) — the seed of the iterate loop. Returns the schedule dict."""
    # Ensure the target dir exists before writing (the inspect-render makedirs runs on
    # a different code path / later, so a fresh BLENDER_OUT_DIR would otherwise drop the
    # schedule + bom .md with 'No such file or directory').
    os.makedirs(out_dir, exist_ok=True)
    specs = list(_CONN_SPECS)
    rows = cs.connection_schedule(specs)

    # roll-up totals by size, per kind, summing the run length.
    cable_m_by_csa = {}     # CSA label → metres (cable + busbar)
    pipe_m_by_dn = {}       # DN label → metres
    duct_m_by_size = {}     # duct label → metres
    other_m = 0.0
    warns = []
    design_feedback = []    # PHASE D2 — runs the engine RECOMMENDS a re-design for
    upsized_runs = []       # PHASE D1 — runs the engine auto-upsized to reach spec
    for s in specs:
        L = float(s.get("length_m") or 0.0)
        kind = s.get("kind")
        size = s.get("size_label") or "(unsized)"
        if kind in ("cable", "busbar"):
            cable_m_by_csa[size] = cable_m_by_csa.get(size, 0.0) + L
        elif kind == "pipe":
            pipe_m_by_dn[size] = pipe_m_by_dn.get(size, 0.0) + L
        elif kind == "duct":
            duct_m_by_size[size] = duct_m_by_size.get(size, 0.0) + L
        else:
            other_m += L
        # PHASE D1 — record every auto-upsize (size grew to bring the run in-spec).
        if s.get("upsized"):
            upsized_runs.append({
                "run_name": s.get("run_name"), "mechanism": s.get("mechanism"),
                "from": s.get("from_part"), "to": s.get("to_part"),
                "original_size": s.get("original_size_label"),
                "final_size": s.get("final_size_label") or size,
                "length_m": s.get("length_m"),
                "drop_pct_or_velocity": s.get("drop_pct_or_velocity"),
                "upsize_iterations": s.get("upsize_iterations") or 0,
                "driver": s.get("driver"),
            })
        # PHASE D2 — record every design recommendation (loop back into the design).
        if s.get("design_recommendation"):
            design_feedback.append({
                "run_name": s.get("run_name"), "mechanism": s.get("mechanism"),
                "from": s.get("from_part"), "to": s.get("to_part"),
                "size": s.get("final_size_label") or size,
                "length_m": s.get("length_m"),
                "rating": (f"{s.get('carried_rating')} {s.get('carried_unit') or ''}".strip()
                           if s.get("carried_rating") is not None else None),
                "driver": s.get("driver"),
                "recommendation": s.get("design_recommendation"),
            })
        if s.get("within_spec") is False:
            warns.append({
                "run_name": s.get("run_name"), "mechanism": s.get("mechanism"),
                "from": s.get("from_part"), "to": s.get("to_part"),
                "size": size, "length_m": s.get("length_m"),
                "drop_pct_or_velocity": s.get("drop_pct_or_velocity"),
                "spec_limit": s.get("spec_limit"), "notes": s.get("notes"),
            })

    def _round_map(d):
        return {k: round(v, 1) for k, v in sorted(d.items())}

    # COST — roll every costed row's all-in line total into per-category £ totals
    # (the rows already carry unit_cost_gbp / install_gbp / termination_gbp /
    # line_total_gbp / cost_source from connection_sizing.connection_cost; this is
    # the same split connection_schedule_costed() computes). MODEL costs, disclosed.
    cost_totals = cs.connection_schedule_costed(specs)["totals"]

    schedule = {
        "rows": rows,
        "specs": specs,           # full ConnectionSpecs (auditable: tool, assumptions)
        "totals": {
            "cable_m_by_csa": _round_map(cable_m_by_csa),
            "pipe_m_by_dn": _round_map(pipe_m_by_dn),
            "duct_m_by_size": _round_map(duct_m_by_size),
            "other_m": round(other_m, 1),
            "runs_sized": len(specs),
            "runs_out_of_spec": len(warns),
            "runs_upsized": len(upsized_runs),               # PHASE D1
            "design_recommendations": len(design_feedback),  # PHASE D2
            # --- COST roll-up (model:uk-2026-supply+install) ---
            "cable_gbp": cost_totals["cable_gbp"],
            "pipe_gbp": cost_totals["pipe_gbp"],
            "duct_gbp": cost_totals["duct_gbp"],
            "transformer_gbp": cost_totals["transformer_gbp"],
            "other_gbp": cost_totals["other_gbp"],
            "terminations_gbp": cost_totals["terminations_gbp"],
            "install_gbp": cost_totals["install_gbp"],
            "grand_total_gbp": cost_totals["grand_total_gbp"],
            "cost_source": cost_totals["cost_source"],
        },
        "out_of_spec": warns,
        "upsized": upsized_runs,        # PHASE D1 — auto-upsized runs (size grew)
        "design_feedback": design_feedback,  # PHASE D2 — re-design recommendations
        "voltdrop_limit_pct": cs._voltdrop_limit_pct(),  # the active limit (D3 knob)
    }
    try:
        with open(os.path.join(out_dir, "connection-schedule.json"), "w") as fh:
            json.dump(schedule, fh, indent=2, ensure_ascii=False)
    except OSError as ex:
        print(f"[univ][conn-schedule] write FAILED: {ex}")

    # Readable costed BoM table — connection-bom.md (mechanism | from→to | size |
    # length | qty | £), grouped by mechanism with subtotals + a grand total.
    _write_connection_bom_md(out_dir, rows, schedule["totals"])

    t = schedule["totals"]
    print(f"[conn-schedule] {t['runs_sized']} runs sized; "
          f"cable-m by CSA: {t['cable_m_by_csa']}; "
          f"pipe-m by DN: {t['pipe_m_by_dn']}; "
          f"duct-m by size: {t['duct_m_by_size']}"
          + (f"; other-m: {t['other_m']}" if t['other_m'] else ""))
    print(f"[conn-bom] cable £{t['cable_gbp']:,.0f} | pipe £{t['pipe_gbp']:,.0f} | "
          f"duct £{t['duct_gbp']:,.0f} | total £{t['grand_total_gbp']:,.0f} "
          f"(terminations £{t['terminations_gbp']:,.0f}; source {t['cost_source']})")
    # PHASE D — surface the volt-drop limit in force + the loop's response counts.
    print(f"[conn-schedule] volt-drop limit {schedule['voltdrop_limit_pct']:g}% "
          f"(env CONN_VOLTDROP_LIMIT_PCT); D1 upsized {t['runs_upsized']} run(s); "
          f"D2 design recommendations: {t['design_recommendations']}")
    # min/max sized outer diameter actually rendered (the proof sizes VARY).
    od_vals = [s["outer_dia_mm"] for s in specs
               if isinstance(s.get("outer_dia_mm"), (int, float))]
    if od_vals:
        print(f"[conn-schedule] rendered outer_dia_mm range: "
              f"min={min(od_vals):.1f} mm  max={max(od_vals):.1f} mm  "
              f"({len(set(round(v, 1) for v in od_vals))} distinct sizes)")
    # PHASE D1 — each auto-upsize (the cheap response: size GREW, run is now in-spec).
    for u in upsized_runs:
        print(f"[conn-UPSIZE] {u['run_name']} ({u['mechanism']}) {u['from']} -> "
              f"{u['to']}: {u['original_size']} → {u['final_size']} "
              f"in {u['upsize_iterations']} step(s) — {u['driver']}; "
              f"now {u['drop_pct_or_velocity']} (in spec)")
    # PHASE D2 — each design recommendation (the loop BACK into the design).
    for d in design_feedback:
        print(f"[conn-DESIGN] {d['run_name']} ({d['mechanism']}) {d['from']} -> "
              f"{d['to']}: {d['recommendation']}")
    for w in warns:
        print(f"[conn-WARN] {w['run_name']} ({w['mechanism']}) {w['from']} -> "
              f"{w['to']}: {w['size']} {w['drop_pct_or_velocity']} exceeds "
              f"{w['spec_limit']} over {w['length_m']} m — {w['notes']}")
    return schedule


# ═══════════════════════════════════════════════════════════════════════════
# UNIVERSAL FLOW-DERIVATION (2026-06-11) — the connectivity the sparse explicit
# topology omits. A BESS state ships ONE edge (lfp_cell_string → dc_bus); a VF
# ships no water loop at all. A real schematic shows the DETAILED per-unit flows:
# the DC bus fanning out to EVERY rack, the fertigation reservoir feeding each
# grow rack and a return-drainage grid carrying the water back. This engine
# DERIVES those flows from the parts' CONNECTIVITY ROLE + the mechanism they
# belong to — keyed ON ROLE, never on archetype. There is NO `if vertical_farm`.
#
# The model (role + mechanism):
#   • HUB       — a distribution / source part that fans out to many consumers:
#                 electrical (panel/busbar/PDU/switchboard/UPS/combiner),
#                 fluid-supply (reservoir/manifold/header/supply-or-circulation
#                 pump/fertigation source), thermal (chiller/CRAC/condenser).
#   • CONSUMER  — the REPEATED RENDERED UNITS the placer emitted (the rack
#                 anchors: 15 BESS racks, 8 VF trolleys, the edge-AI racks) PLUS
#                 a discrete big load (an HVAC unit). NEVER the leaf parts
#                 (3,750 cells, 400 drip emitters) — those are aggregated.
#   • COLLECTOR — a return/recovery part that gathers a loop back to its source:
#                 drain/return/sump/condensate/recycle/recovery/drainage-grid.
#
# Per mechanism present we derive:
#   hub → branch to EACH consumer (supply fan-out), and — WHEN a collector exists
#   for that mechanism — each consumer → collector → back to the source hub (a
#   CLOSED return loop). Coloured by mechanism AND direction (supply vs return =
#   two distinct lines). The derived edges are then routed on the SAME clean
#   RackPlan / route_on_spine engine as the explicit topology, so the per-rack
#   fan-out gets lanes + tiers (no spaghetti, no over-equipment).
#
# DEFER on rich topology: a process-flow graph with ≥ DERIVE_RICH_TOPOLOGY_EDGES
# explicit edges (e-fuel: 8) is already a faithful schematic — we do NOT override
# it; we only derive to fill an obvious MISSING electrical fan-out (a panel→loads
# bus the topology omitted). So e-fuel stays essentially unchanged.
# ───────────────────────────────────────────────────────────────────────────

# A topology with at least this many explicit edges is RICH (a real process-flow
# graph). We defer to it: derive only a missing electrical fan-out, never a full
# supply/return loop. e-fuel ships 8; BESS/VF/edge-AI ship 3/3/5.
DERIVE_RICH_TOPOLOGY_EDGES = 6

# ── ROLE detectors — robust, mechanism-scoped (NOT brittle exact regexes). A HUB
#    is a DISTRIBUTION / SOURCE-named part of a mechanism that has many consumers;
#    these patterns must catch the edge-AI power hub whether it is named "PDU",
#    "power supply" or "distribution board", so they are deliberately broad. ──
# Electrical distribution hub: a panel / bus / PDU / switchboard / UPS / combiner.
HUB_ELECTRICAL_RE = re.compile(
    r"\bpanel\b|busbar|\bbus\b|\bbusway\b|distribution|switch ?board|switch ?gear|"
    r"\bpdu\b|\bups\b|combiner|power\s+supply|\bpsu\b|main\s+breaker|"
    r"power\s+distribution|rack\s+power|\bmcc\b|consumer\s+unit|\bboard\b",
    re.IGNORECASE)
# Fluid-SUPPLY hub: a source reservoir / manifold / header / main, or a supply /
# circulation / fertigation pump that pushes the loop out to the consumers.
HUB_FLUID_SUPPLY_RE = re.compile(
    r"reservoir|manifold|\bheader\b|\bmain\b|"
    r"supply\s+pump|circulation\s+pump|circulating\s+pump|"
    r"fertigation\s+(?:reservoir|pump|tank|skid|unit)|fertigation|"
    r"distribution\s+pump|process\s+pump|nutrient\s+(?:tank|reservoir)",
    re.IGNORECASE)
# Thermal hub: a chiller / cooling unit / CRAC / condenser that rejects heat and
# feeds chilled coolant to the consumers.
HUB_THERMAL_RE = re.compile(
    r"chiller|cooling\s+(?:unit|skid|plant|system)|\bcrac\b|\bcrah\b|condenser|"
    r"\bahu\b|air\s+handler|cooling\s+tower|heat\s+rejection|coolant\s+(?:skid|unit)|"
    r"precision\s+air|liquid\s+cooling",
    re.IGNORECASE)
# COLLECTOR / RETURN: a part that gathers a loop back to its source.
COLLECTOR_RE = re.compile(
    r"\bdrain\b|\breturn\b|\bsump\b|condensate|recycle|recovery|collection|"
    r"drainage[\s_-]?grid|\bdrainage\b|effluent|recirculation\s+(?:tank|sump)|"
    r"coolant\s+return|water\s+return",
    re.IGNORECASE)
# Thermal-specific collector (a coolant/condensate return path) so a thermal loop
# closes to the chiller and a fluid loop closes to the reservoir — separately.
COLLECTOR_THERMAL_RE = re.compile(
    r"coolant\s+return|condensate|heat\s+rejection|chilled\s+return|"
    r"\breturn\s+pipe\b|cooling\s+return",
    re.IGNORECASE)
# The PRECISE coolant-loop return (outranks a weaker 'condensate' HVAC match when
# both exist, e.g. a BESS has both an HVAC condensate pump and a coolant return pipe
# — the cooling LOOP returns via the latter).
COLLECTOR_THERMAL_STRONG_RE = re.compile(
    r"coolant\s+return|chilled\s+return|cooling\s+return|\breturn\s+pipe\b",
    re.IGNORECASE)
# A discrete BIG LOAD that is a CONSUMER in its own right (a whole HVAC unit, a
# heat-pump, a big motor) — distinct from the repeated rack units. Used so the
# electrical hub also feeds the climate plant, not only the racks.
BIG_LOAD_RE = re.compile(
    r"\bhvac\b|\bdx\b\s+hvac|\bahu\b|air\s+handler|heat\s+pump|chiller|"
    r"\bcrac\b|\bcrah\b|compressor\s+unit|condensing\s+unit|"
    r"climate\s+(?:unit|system)|dehumidifier",
    re.IGNORECASE)
# Tokens that, when present, DISQUALIFY a part from being a hub/consumer even if a
# broad pattern matched — a LABEL, a sensor, a small accessory is never a hub.
ROLE_EXCLUDE_RE = re.compile(
    r"\blabel\b|\bsticker\b|\btag\b|\bsensor\b|\bprobe\b|\bgauge\b|\bdetector\b|"
    r"\bcard\b|\bgland\b|\bseal\b|\bfuse\b|\bpadlock\b|\bcable\b|\bwire\b|"
    r"\bbracket\b|\bmount\b|\bcertif|\baudit\b|\bport\b|warning|hazard|"
    r"\bbreaker\b\s+\w*label",
    re.IGNORECASE)


def _role_part_top(part):
    """The (x,y,z) point a derived flow attaches to on a placed part — its TOP
    anchor (where a bus / supply header drops onto / leaves from overhead), or its
    centre. None for an unplaced part."""
    if part.placed_xyz_mm is None:
        return None
    if part.anchors and "top" in part.anchors:
        return tuple(part.anchors["top"])
    return tuple(part.placed_xyz_mm)


def _find_role_parts(parts, role_re, mech_hint=None):
    """All PLACED parts whose name matches role_re and is not excluded, best first
    (longest match-token name last so the most specific source wins). Universal —
    keyed only on the part NAME (role), never on archetype/class."""
    hits = []
    for p in parts:
        nm = str(p.name)
        if ROLE_EXCLUDE_RE.search(nm):
            continue
        if role_re.search(nm) and p.placed_xyz_mm is not None:
            hits.append(p)
    # prefer the part with the FEWEST tokens (a "fertigation reservoir" beats a
    # "fertigation reservoir level sensor bracket"): a cleaner source name.
    hits.sort(key=lambda p: len(p.match_tokens))
    return hits


def _best_hub(parts, role_re):
    """The single best HUB part for a mechanism (the cleanest source-named match),
    or None. Used as the fan-out origin + the return-loop destination."""
    hits = _find_role_parts(parts, role_re)
    return hits[0] if hits else None


def _has_role_part(parts, role_re, prefer_re=None):
    """The cleanest part NAME matching role_re, IGNORING whether it was placed (the
    rack placers aggregate parts into racks/skids, so a 'coolant return pipe' or
    'return drainage grid' has no placed_xyz_mm — but its EXISTENCE still tells us a
    return path is in the BoM, and the caller synthesises the geometric return port).
    When `prefer_re` is given, a match hitting it OUTRANKS one that doesn't (so the
    precise 'coolant return pipe' beats a weaker 'condensate' match). Returns the
    name str or None. Universal — name/role only, no archetype."""
    best = None          # (preferred_bool, -ntokens, name) — higher tuple wins
    for p in parts:
        nm = str(p.name)
        if ROLE_EXCLUDE_RE.search(nm):
            continue
        if role_re.search(nm):
            rank = (1 if (prefer_re and prefer_re.search(nm)) else 0,
                    -len(p.match_tokens))
            if best is None or rank > best[0]:
                best = (rank, nm)
    return best[1] if best else None


def derive_flows(parts, consumer_anchors, explicit_topology, mechanisms_present,
                 hub_anchors=None, electrical_chain=None,
                 hubs=None, collectors=None):
    """UNIVERSAL per-unit flow derivation. Returns a list of DERIVED edge dicts in
    the `resolved`-shape `_emit_routes_on_plan` consumes (concrete 3D a_xyz/b_xyz,
    a_abstract/b_abstract=True so they route straight onto the spine), so the
    derived fan-out is routed on the SAME clean RackPlan engine as the explicit
    topology — lanes + tiers, no spaghetti, audited.

    Args:
      parts             : Part list — HUBs/COLLECTORs are found here BY ROLE for a
                          placer that places its parts (process-plant). The rack
                          placers DON'T place individual parts (they aggregate them
                          into racks + BoP skids), so they pass the resolved hub /
                          collector anchors explicitly (see `hubs`/`collectors`).
      consumer_anchors  : list of (x,y,z) — the REPEATED RENDERED UNITS the placer
                          emitted (rack tops). NEVER leaf parts.
      explicit_topology : the contract topology (to DEFER when it is rich, and to
                          know which mechanisms the explicit graph already covers).
      mechanisms_present: set/iterable of family strings to derive for, any of
                          {"electrical","fluid","thermal"}. The placer passes the
                          families its archetype actually has wired.
      hubs              : {family: (name, (x,y,z))} — the placer's RESOLVED hub
                          point per family (the BoP skid that IS the panel / the
                          fertigation reservoir / the chiller). Universal: the
                          placer maps its OWN BoP role names → the three families;
                          derive_flows is archetype-agnostic. Takes priority over
                          part-role detection.
      collectors        : {family: (name, (x,y,z))} — the placer's RESOLVED return /
                          collector point per family (the recirculation/effluent
                          skid for fluid, the coolant-return skid for thermal). When
                          present the loop CLOSES: consumer → collector → hub.
      hub_anchors       : optional {role: (x,y,z)} BoP anchors (legacy fallback used
                          only if `hubs` lacks a family).
      electrical_chain  : optional ORDERED list of (name, (x,y,z)) downstream
                          electrical-stage anchors (e.g. [("pcs",pt),("transformer",
                          pt)]). The rack block is collected to the first stage and
                          each stage chained to the next — so the BESS reads
                          DC-bus → each rack → PCS → transformer. Role-keyed, never
                          archetype-keyed.

    Each derived edge feeds the SAME emitter, so over-equipment / detour / crossing
    self-audit covers them exactly like the explicit edges."""
    hub_anchors = hub_anchors or {}
    hubs = hubs or {}
    collectors = collectors or {}
    derived = []
    n_explicit = len(explicit_topology or [])
    rich = n_explicit >= DERIVE_RICH_TOPOLOGY_EDGES
    next_i = [10_000]   # synthetic edge indices (well above any real topology index)

    # ── RATING the derived fan-out from the parent explicit edge. The sparse topology
    #    ships ONE aggregate edge per family (BESS: lfp_cell_string→dc_bus @1562.5 A
    #    ×1.25); we DROP that single edge and DERIVE the per-rack fan-out, so the
    #    derived edges must INHERIT its rating to be sized. The TRUNK carries the
    #    TOTAL design value; each of the N consumer TAPS carries total/N (one rack's
    #    share). Where no parent rating exists, the share is None ⇒ small fallback
    #    diameter (NOT 190). Keyed on mechanism FAMILY, never archetype.
    _FAMILY_MECHS = {
        "electrical": ("electrical_bus", "electrical"),
        "fluid": ("fluid_loop", "fluid", "fluid_supply", "fluid_return"),
        "thermal": ("thermal", "thermal_return"),
    }

    def _parent_rating(family):
        """(constraint_kind, total_design_value, unit, material_context) for a family,
        from the LARGEST-rated matching explicit edge (× its margin = design value).
        Returns (None, None, None, None) when the topology has no edge for it."""
        mechs = _FAMILY_MECHS.get(family, ())
        best = None
        for e in (explicit_topology or []):
            if e.get("mechanism") not in mechs:
                continue
            rv = e.get("required_value")
            if rv is None:
                continue
            margin = e.get("required_margin_factor") or 1.0
            design = float(rv) * float(margin)
            if best is None or design > best[1]:
                best = (e.get("constraint_kind"), design, e.get("required_unit"),
                        e.get("material_context"))
        return best if best is not None else (None, None, None, None)

    # Per-family parent (constraint_kind, total_design_value, unit, material_context).
    _RATING = {fam: _parent_rating(fam) for fam in ("electrical", "fluid", "thermal")}

    def _share_edge(family, mech, a_nm, b_nm, n_consumers, is_trunk=False):
        """Synthesize a topology-edge dict carrying the rating THIS derived segment
        should be SIZED from: the parent family total for a trunk, total/N for one
        consumer tap. carried_value is FINAL (margin already applied in the total),
        so the edge sets required_margin_factor=1. None total ⇒ a rating-less edge
        (the emitter falls back to the small default diameter)."""
        ck, total, unit, mc = _RATING.get(family, (None, None, None, None))
        share = None
        if total is not None:
            share = total if is_trunk else (total / max(1, n_consumers))
        return {
            "from_part": a_nm, "to_part": b_nm, "mechanism": mech,
            "constraint_kind": ck, "required_value": share, "required_unit": unit,
            "required_margin_factor": 1.0, "material_context": mc,
            # parent family total, so the TRUNK emitter can size for the SUM even when
            # the group is rebuilt from the per-consumer tap edges.
            "parent_total_value": total, "n_consumers": n_consumers,
            "rating_family": family,
        }

    def _emit(a_xyz, b_xyz, mech, a_nm, b_nm, edge=None):
        if a_xyz is None or b_xyz is None:
            return
        i = next_i[0]; next_i[0] += 1
        derived.append({
            "i": i, "mech": mech, "edge": edge,
            "a_xyz": tuple(float(c) for c in a_xyz),
            "b_xyz": tuple(float(c) for c in b_xyz),
            "a_abstract": True, "b_abstract": True,
            "a_conn": None, "b_conn": None, "b_branch": [],
            "pa": None, "pb": None, "a_nm": a_nm, "b_nm": b_nm,
        })

    if not consumer_anchors:
        return derived

    # ── resolve a mechanism's HUB origin point: the placer's explicit `hubs[family]`
    #    FIRST (the BoP skid it sited), then a PART matched by role, then a legacy
    #    BoP-role anchor. So a rack placer (no placed parts) still finds its hub. ──
    def _hub_for(family, role_re, *anchor_roles):
        if family in hubs and hubs[family] and hubs[family][1] is not None:
            return tuple(hubs[family][1]), hubs[family][0]
        hub = _best_hub(parts, role_re)
        if hub is not None:
            return _role_part_top(hub), str(hub.name)
        for r in anchor_roles:
            if r in hub_anchors:
                return tuple(hub_anchors[r]), r
        return None, None

    def _collector_for(family, role_re):
        if family in collectors and collectors[family] and collectors[family][1] is not None:
            return tuple(collectors[family][1]), collectors[family][0]
        coll = _best_hub(parts, role_re)
        if coll is not None:
            return _role_part_top(coll), str(coll.name)
        return None, None

    # The consumer-spread bounds (for siting a return PORT distinct from the supply
    # port when there is no separate return skid — a manifold loop returns to the
    # SAME plant item via a different header, so we offset the return port across
    # the rack block so supply + return read as two distinct lines that close).
    _cx0 = min(c[0] for c in consumer_anchors)
    _cx1 = max(c[0] for c in consumer_anchors)
    _cy0 = min(c[1] for c in consumer_anchors)
    _cy1 = max(c[1] for c in consumer_anchors)

    def _return_port(hub_pt, ret_part_name):
        """A return-header port distinct from the supply hub, used to CLOSE a loop
        when the return is a (non-placed) PART (coolant-return pipe / drainage grid)
        rather than a separate BoP skid. Sits on the FAR side of the rack block from
        the hub (offset along the longer consumer axis), at the hub elevation, so
        the return runs back to the plant item via its own header — two distinct
        lines. Returns (pt, name) or (None,None) if no return part exists."""
        if ret_part_name is None:
            return None, None
        # offset the port to the opposite end of the rack block from the hub, on the
        # longer spread axis, by a clear margin so it never coincides with supply.
        if (_cx1 - _cx0) >= (_cy1 - _cy0):
            far_x = _cx0 if hub_pt[0] > (_cx0 + _cx1) / 2 else _cx1
            port = (far_x, (_cy0 + _cy1) / 2, hub_pt[2])
        else:
            far_y = _cy0 if hub_pt[1] > (_cy0 + _cy1) / 2 else _cy1
            port = ((_cx0 + _cx1) / 2, far_y, hub_pt[2])
        if math.dist(port[:2], hub_pt[:2]) < 300.0:
            return None, None
        return port, ret_part_name

    # ── ELECTRICAL: hub → EACH consumer (DC bus / panel / PDU fan-out). ──────────
    # Derived ALWAYS when an electrical mechanism is present (even on a rich
    # topology: a process plant's panel→loads bus is exactly the fan-out the sparse
    # graph omits) — this is the one derivation we add even when we DEFER.
    if "electrical" in mechanisms_present:
        hub_pt, hub_nm = _hub_for("electrical", HUB_ELECTRICAL_RE, "pdu", "panel",
                                  "switchgear", "ups", "pcs", "bms_ctrl", "control")
        if hub_pt is not None:
            n_cons = len(consumer_anchors)
            for k, c in enumerate(consumer_anchors):
                _emit(hub_pt, c, "electrical_bus", hub_nm, f"rack[{k}]",
                      edge=_share_edge("electrical", "electrical_bus", hub_nm,
                                       f"rack[{k}]", n_cons))
            # also feed each discrete BIG LOAD from the same electrical hub: a placed
            # HVAC / heat-pump PART (process-plant path) AND the thermal/fluid BoP
            # skids (the chiller + reservoir pumps are powered equipment) — so the
            # panel→HVAC bus the topology omitted is drawn. De-dup on point.
            big_pts = []
            for bl in _find_role_parts(parts, BIG_LOAD_RE):
                big_pts.append((_role_part_top(bl), str(bl.name)))
            for fam in ("thermal", "fluid"):
                if fam in hubs and hubs[fam] and hubs[fam][1] is not None:
                    big_pts.append((tuple(hubs[fam][1]), hubs[fam][0]))
            seen_pt = set()
            for pt, nm in big_pts:
                if pt is None or math.dist(pt[:2], hub_pt[:2]) < 300.0:
                    continue
                key = (round(pt[0]), round(pt[1]))
                if key in seen_pt:
                    continue
                seen_pt.add(key)
                # discrete big load (HVAC/chiller/reservoir pump): an individual
                # feeder of UNKNOWN current (not 1/N of the bus, not the full bus) —
                # leave rating-less so it draws at the small fallback diameter.
                _emit(hub_pt, pt, "electrical_bus", hub_nm, nm,
                      edge={"from_part": hub_nm, "to_part": nm,
                            "mechanism": "electrical_bus"})
        # DOWNSTREAM electrical chain: rack block → first stage (PCS) → next
        # (transformer) → … So the power path reads in series, not just a fan-out.
        # The WHOLE bus current flows through each stage in series, so each chain
        # link is sized for the family TOTAL (the trunk value), reading FAT.
        # Role-keyed via the anchors the placer passed; absent ⇒ skipped.
        if electrical_chain:
            cx = sum(c[0] for c in consumer_anchors) / len(consumer_anchors)
            cy = sum(c[1] for c in consumer_anchors) / len(consumer_anchors)
            cz = max(c[2] for c in consumer_anchors)
            prev_pt, prev_nm = (cx, cy, cz), "rack_block"
            for stage_nm, stage_pt in electrical_chain:
                if stage_pt is None:
                    continue
                # the full bus current flows through this series stage → trunk total.
                _emit(prev_pt, stage_pt, "electrical_bus", prev_nm, stage_nm,
                      edge=_share_edge("electrical", "electrical_bus", prev_nm,
                                       stage_nm, 1, is_trunk=True))
                prev_pt, prev_nm = stage_pt, stage_nm

    # On a RICH process-flow graph we STOP here: the fluid/thermal loops are
    # already authored as real edges; do not override them (e-fuel stays intact).
    if rich:
        return derived

    # ── FLUID-SUPPLY: source hub → EACH consumer; then (if a collector exists)
    #    each consumer → COLLECTOR → back to the source (a CLOSED return loop). ──
    if "fluid" in mechanisms_present:
        hub_pt, hub_nm = _hub_for("fluid", HUB_FLUID_SUPPLY_RE, "nutrient", "water")
        coll_pt, coll_nm = _collector_for("fluid", COLLECTOR_RE)
        # If no separate return SKID resolved, look for a return PART (return-drainage
        # grid / drain / recirculation) so the loop can still close via a return port.
        # _has_role_part ignores placement (the part may be aggregated into a rack).
        if coll_pt is None and hub_pt is not None:
            rp_nm = _has_role_part(parts, COLLECTOR_RE)
            if rp_nm is not None:
                coll_pt, coll_nm = _return_port(hub_pt, rp_nm)
        if hub_pt is not None:
            n_cons = len(consumer_anchors)
            for k, c in enumerate(consumer_anchors):
                _emit(hub_pt, c, "fluid_supply", hub_nm, f"rack[{k}]",
                      edge=_share_edge("fluid", "fluid_supply", hub_nm,
                                       f"rack[{k}]", n_cons))
            # close the loop only when the return point is a genuinely DIFFERENT
            # location from the supply hub (else the return overlays supply — a
            # duplicate, not a loop the eye reads). Each per-rack return = one share;
            # the collector→hub MAIN return carries the SUM (the trunk total).
            if coll_pt is not None and math.dist(coll_pt[:2], hub_pt[:2]) > 300.0:
                for k, c in enumerate(consumer_anchors):
                    _emit(c, coll_pt, "fluid_return", f"rack[{k}]", coll_nm,
                          edge=_share_edge("fluid", "fluid_return", f"rack[{k}]",
                                           coll_nm, n_cons))
                _emit(coll_pt, hub_pt, "fluid_return", coll_nm, hub_nm,
                      edge=_share_edge("fluid", "fluid_return", coll_nm, hub_nm,
                                       n_cons, is_trunk=True))

    # ── THERMAL: chiller hub → EACH consumer; then (if a coolant-return collector
    #    exists) each consumer → coolant-return → back to the chiller. ───────────
    if "thermal" in mechanisms_present:
        hub_pt, hub_nm = _hub_for("thermal", HUB_THERMAL_RE, "chiller", "cooling",
                                  "hvac")
        tcoll_pt, tcoll_nm = _collector_for("thermal", COLLECTOR_THERMAL_RE)
        # No separate coolant-return SKID? Close the loop via a return PART (coolant
        # return pipe / condensate) routed back to a return port on the chiller.
        # _has_role_part ignores placement (the return pipe is aggregated into racks).
        if tcoll_pt is None and hub_pt is not None:
            rp_nm = _has_role_part(parts, COLLECTOR_THERMAL_RE,
                                   prefer_re=COLLECTOR_THERMAL_STRONG_RE)
            if rp_nm is not None:
                tcoll_pt, tcoll_nm = _return_port(hub_pt, rp_nm)
        if hub_pt is not None:
            n_cons = len(consumer_anchors)
            for k, c in enumerate(consumer_anchors):
                _emit(hub_pt, c, "thermal", hub_nm, f"rack[{k}]",
                      edge=_share_edge("thermal", "thermal", hub_nm,
                                       f"rack[{k}]", n_cons))
            # close the loop only if the return point is genuinely DIFFERENT from the
            # chiller hub (a separate coolant-return skid / return port) — else the
            # "return" would overlay the supply and read as a duplicate, not a loop.
            # Per-rack return = one share; coolant-return MAIN → chiller = trunk total.
            if tcoll_pt is not None and \
                    math.dist(tcoll_pt[:2], hub_pt[:2]) > 300.0:
                for k, c in enumerate(consumer_anchors):
                    _emit(c, tcoll_pt, "thermal_return", f"rack[{k}]", tcoll_nm,
                          edge=_share_edge("thermal", "thermal_return", f"rack[{k}]",
                                           tcoll_nm, n_cons))
                _emit(tcoll_pt, hub_pt, "thermal_return", tcoll_nm, hub_nm,
                      edge=_share_edge("thermal", "thermal_return", tcoll_nm, hub_nm,
                                       n_cons, is_trunk=True))

    return derived


# ═══════════════════════════════════════════════════════════════════════════
# TRUNK-AND-BRANCH (HEADER / BUSWAY) GROUPING (2026-06-11)
# ───────────────────────────────────────────────────────────────────────────
# derive_flows correctly connects a HUB to EACH consumer in a row, but emits
# every connection as an INDEPENDENT full-length run hub→consumer. With 15-49
# consumers that is a dense tangled BUNDLE in plan view (every run projects onto
# the same band). Real distribution uses a HEADER/BUSWAY: ONE trunk runs ALONG
# the row of consumers and each consumer TAPS OFF with a SHORT branch. This
# module detects those fan-out groups GENERICALLY — derived edges that SHARE a
# (hub, mechanism) and reach MANY consumers — and the emitter routes each as ONE
# trunk + N short taps instead of N full runs. Keyed ONLY on the fan-out
# structure (a repeated endpoint over ≥ TRUNK_MIN_CONSUMERS edges of one mech),
# NEVER on archetype. There is NO `if bess`. SUPPLY and RETURN are different
# mechanisms (distinct colours) so each becomes its OWN parallel trunk.
# ───────────────────────────────────────────────────────────────────────────

# Minimum distinct consumers sharing a (hub, mechanism) for the fan-out to be
# routed as a TRUNK + taps. Below this (a hub→one-load, a BoP→BoP, a hub→HVAC,
# the 2-stage electrical chain) the normal per-edge route is cleaner.
TRUNK_MIN_CONSUMERS = 3
# Two endpoints within this XY distance are the "same" shared hub/collector point
# (absorbs float noise + the tiny per-edge nozzle offsets).
_TRUNK_SAME_PT_TOL_MM = 50.0


def _pt_key(xyz):
    """A rounded (x,y) key so near-coincident endpoints group together."""
    q = _TRUNK_SAME_PT_TOL_MM
    return (round(xyz[0] / q), round(xyz[1] / q))


def group_fanout_trunks(resolved, min_consumers=TRUNK_MIN_CONSUMERS):
    """Partition derived/resolved edges into TRUNK GROUPS + PASSTHROUGH edges.

    A TRUNK GROUP = edges of the SAME mechanism that share ONE endpoint (the hub,
    for a supply fan-out; the collector, for a return gather) and reach
    >= min_consumers DISTINCT other endpoints (the consumers). The shared end is
    the trunk ORIGIN; the distinct ends are the consumers each tap reaches.

    Returns (groups, passthrough):
      groups      : list of dicts {mech, origin_xyz, origin_nm, origin_is_a,
                    consumers:[{xyz,nm,pa,pb,i}], edge_idxs}. `origin_is_a` is
                    True when the SHARED point is the edges' a_xyz (supply: hub→
                    consumer), False when it is b_xyz (return: consumer→collector).
      passthrough : edges that are NOT part of any fan-out (single loads, BoP→BoP,
                    hub→HVAC, the 2-stage electrical chain stages, collector→hub).

    Universal: groups purely on the SHARED-ENDPOINT + mechanism structure of the
    derived edges, never on names/archetype. Only edges flagged abstract on BOTH
    ends are eligible (the derived fan-out is abstract→abstract; a real explicit
    part→part edge is left to the normal router)."""
    # bucket eligible edges by (mechanism, shared-endpoint-key) for BOTH possible
    # shared ends, then pick, per mechanism, the endpoint that fans out the most.
    by_a = {}   # (mech, a_key) -> [edge_idx]
    by_b = {}   # (mech, b_key) -> [edge_idx]
    eligible = set()
    for idx, r in enumerate(resolved):
        # only the derived abstract→abstract fan-out edges are trunk-eligible; an
        # explicit part-anchored edge keeps its own (already-clean) route.
        if not (r.get("a_abstract") and r.get("b_abstract")):
            continue
        if r.get("a_xyz") is None or r.get("b_xyz") is None:
            continue
        eligible.add(idx)
        mech = r["mech"]
        by_a.setdefault((mech, _pt_key(r["a_xyz"])), []).append(idx)
        by_b.setdefault((mech, _pt_key(r["b_xyz"])), []).append(idx)

    # For each candidate shared-endpoint bucket, count DISTINCT opposite endpoints
    # (the consumers). A bucket with >= min_consumers distinct consumers is a trunk.
    # Each edge may appear in an a-bucket AND a b-bucket; assign it to the LARGER
    # fan-out so an edge is claimed once (the supply hub usually wins over a lone
    # shared consumer point).
    candidates = []   # (n_consumers, side, mech, key, [edge_idx])
    for (mech, key), idxs in by_a.items():
        opp = {_pt_key(resolved[i]["b_xyz"]) for i in idxs}
        if len(opp) >= min_consumers:
            candidates.append((len(opp), "a", mech, key, idxs))
    for (mech, key), idxs in by_b.items():
        opp = {_pt_key(resolved[i]["a_xyz"]) for i in idxs}
        if len(opp) >= min_consumers:
            candidates.append((len(opp), "b", mech, key, idxs))
    # greedily claim the biggest fan-outs first; an edge is used by ONE trunk only.
    candidates.sort(key=lambda c: -c[0])
    claimed = set()
    groups = []
    for _, side, mech, key, idxs in candidates:
        edge_idxs = [i for i in idxs if i in eligible and i not in claimed]
        # re-check the distinct-consumer count after removing already-claimed edges.
        if side == "a":
            opp = {_pt_key(resolved[i]["b_xyz"]) for i in edge_idxs}
        else:
            opp = {_pt_key(resolved[i]["a_xyz"]) for i in edge_idxs}
        if len(opp) < min_consumers:
            continue
        origin_is_a = (side == "a")
        # de-dup consumers by point key (a repeated consumer point taps once).
        seen = set()
        consumers = []
        for i in edge_idxs:
            r = resolved[i]
            cons_xyz = r["b_xyz"] if origin_is_a else r["a_xyz"]
            ck = _pt_key(cons_xyz)
            if ck in seen:
                continue
            seen.add(ck)
            consumers.append({
                "xyz": cons_xyz,
                "nm": r["b_nm"] if origin_is_a else r["a_nm"],
                # the consumer's own Part (for the over-equipment own-bbox exclusion)
                "pb": r.get("pb") if origin_is_a else r.get("pa"),
                "i": i,
                # the derived edge for THIS consumer tap (carries total/N rating) so
                # the trunk emitter sizes each tap at its real (thinner) diameter.
                "edge": r.get("edge"),
            })
            claimed.add(i)
        # claim ALL edges in this bucket (including any whose consumer point was a
        # duplicate) so they don't fall through to passthrough as stray full runs.
        for i in edge_idxs:
            claimed.add(i)
        origin_xyz = resolved[edge_idxs[0]]["a_xyz"] if origin_is_a \
            else resolved[edge_idxs[0]]["b_xyz"]
        origin_nm = resolved[edge_idxs[0]]["a_nm"] if origin_is_a \
            else resolved[edge_idxs[0]]["b_nm"]
        # Synthesize the TRUNK edge: it carries the SUMMED design load (the parent
        # family total — each tap is total/N, the trunk is the sum, so it renders
        # FATTER than any tap). Built from a consumer edge's parent_total_value.
        c0_edge = next((c["edge"] for c in consumers if c.get("edge")), None)
        trunk_edge = None
        if c0_edge is not None:
            total = c0_edge.get("parent_total_value")
            trunk_edge = {
                "from_part": origin_nm, "to_part": "(busway)", "mechanism": mech,
                "constraint_kind": c0_edge.get("constraint_kind"),
                "required_value": total, "required_unit": c0_edge.get("required_unit"),
                "required_margin_factor": 1.0,
                "material_context": c0_edge.get("material_context"),
            }
        groups.append({
            "mech": mech, "origin_xyz": origin_xyz, "origin_nm": origin_nm,
            "origin_is_a": origin_is_a, "consumers": consumers,
            "edge_idxs": list(edge_idxs), "trunk_edge": trunk_edge,
        })
    passthrough = [r for idx, r in enumerate(resolved) if idx not in claimed]
    return groups, passthrough


def _bop_anchors_to_families(bop_anchor, parts):
    """Map a placer's role→(x,y,z) BoP anchors to derive_flows' family `hubs` +
    `collectors` dicts, classifying each BoP skid BY ROLE (its role key + the name
    of the design part it represents). Universal: a 'nutrient'/'fertigation' skid
    is the fluid hub, a 'water'/'effluent'/'drain' skid is the fluid collector, a
    'chiller'/'hvac'/'cooling' skid is the thermal hub, a 'panel'/'pdu'/'control'/
    'switchgear' skid is the electrical hub — no archetype branch. The placer owns
    the role NAMES; this maps them to the three families the engine reasons about."""
    hubs, collectors = {}, {}
    # representative part name per role (for nicer edge labels), best-effort.
    def _role_blob(role):
        # the role key itself plus any design part whose name hits the role token
        return role
    for role, pt in (bop_anchor or {}).items():
        blob = _role_blob(role)
        # COLLECTORS first (a 'water'/'drain'/'return' skid is a return, not a hub).
        if COLLECTOR_RE.search(blob) or role in ("water", "drain", "return", "effluent"):
            collectors.setdefault("fluid", (role, pt))
            continue
        if COLLECTOR_THERMAL_RE.search(blob):
            collectors.setdefault("thermal", (role, pt))
            continue
        # HUBS by family.
        if HUB_THERMAL_RE.search(blob) or role in ("chiller", "cooling", "hvac", "crac"):
            hubs.setdefault("thermal", (role, pt))
        elif HUB_FLUID_SUPPLY_RE.search(blob) or role in ("nutrient", "fertigation"):
            hubs.setdefault("fluid", (role, pt))
        elif HUB_ELECTRICAL_RE.search(blob) or role in ("pdu", "panel", "control",
                                                        "switchgear", "ups", "bms_ctrl"):
            hubs.setdefault("electrical", (role, pt))
    return hubs, collectors


def _mechanisms_present_in(topology, parts, extra=()):
    """Which mechanism FAMILIES this design has, for derive_flows. Reads the
    explicit topology's mechanisms AND scans the parts for hub/collector evidence,
    so a design with NO explicit fluid edge but a fertigation reservoir + a
    return-drainage grid (VF) still derives its water loop. Universal — keyed on
    mechanism evidence, never on class. `extra` lets a placer force a family it
    knows it has (e.g. rack-farm always has electrical + thermal)."""
    present = set(extra)
    MECH_TO_FAMILY = {
        "electrical_bus": "electrical", "electrical": "electrical",
        "fluid_loop": "fluid", "fluid": "fluid", "fluid_supply": "fluid",
        "fluid_return": "fluid", "thermal": "thermal", "thermal_return": "thermal",
    }
    for e in (topology or []):
        fam = MECH_TO_FAMILY.get(e.get("mechanism", ""))
        if fam:
            present.add(fam)
    # part-evidence: a fluid-supply hub OR a fluid collector ⇒ a fluid loop exists.
    if _best_hub(parts, HUB_FLUID_SUPPLY_RE) or _best_hub(parts, COLLECTOR_RE):
        present.add("fluid")
    if _best_hub(parts, HUB_THERMAL_RE):
        present.add("thermal")
    if _best_hub(parts, HUB_ELECTRICAL_RE):
        present.add("electrical")
    return present


# Shapes that have a real SHELL a nozzle stub can grow out of (Fix 1). A box,
# cabinet, instrument or gantry has no curved shell, so a pipe simply lands on it.
STUB_SHAPES = {"tall_column", "tall_vessel", "vertical_vessel", "horizontal_vessel",
               "tank", "stack", "compressor", "pump", "inline_spool"}


def _maybe_stub(part, anchor_key, anchor_xyz, mech, edge_i, side, MAT, MO):
    """If `part` is a shell-type, grow a flanged nozzle stub at the picked anchor
    and return the stub-TIP point for the pipe to connect to; else return the
    anchor unchanged. Universal — keyed only by the part's resolved shape + the
    chosen anchor's axis (top→+Z, bottom→-Z, centre→+Z fallback)."""
    if getattr(part, "shape", None) not in STUB_SHAPES:
        return anchor_xyz
    if not anchor_xyz:
        return anchor_xyz
    axis = (0.0, 0.0, -1.0) if anchor_key == "bottom" else (0.0, 0.0, 1.0)
    nm = f"u_stub_{edge_i}_{side}"
    mod = "mass_fluid_transport_process"
    return _spawn_nozzle_stub(nm, anchor_xyz, axis, PIPE_DIA_MM, MAT, mod, MO)


# ── Fix 1 — abstract-endpoint resolvers (external supply + group cluster) ──────
ELEC_MODULE_ID = "mass_fluid_transport_process"   # tag the electrical run carries


def _depluralise(tok):
    """Crude singular form so a PLURAL group token ('compressors'/'pumps') matches
    the SINGULAR part names ('CO2 feed compressor'). Only used for GROUP-cluster
    matching, never for the chemical-discriminator routing (which stays exact)."""
    if len(tok) > 4 and tok.endswith("ies"):
        return tok[:-3] + "y"
    if len(tok) > 3 and tok.endswith("es") and tok[-3] in "sxz":
        return tok[:-2]
    if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def _matched_cluster(endpoint_name, parts):
    """All parts in the GROUP endpoint's cluster, best first. A part joins when its
    match-tokens overlap the endpoint tokens — compared with SINGULAR/PLURAL
    folding so 'process_compressors_and_pumps' (plural) gathers every singular
    'compressor' + 'pump' as well as the plural VFD-drive cabinets. The h2/co2
    chemical discriminators are still honoured (a chemically-wrong vessel never
    joins). Returns [(score, part), …] score-descending."""
    ep_folded = {_depluralise(t) for t in tokenise(endpoint_name)}
    ep_disc = ep_folded & DISCRIMINATORS
    hits = []
    for p in parts:
        if p.placed_xyz_mm is None:
            continue
        pf = {_depluralise(t) for t in p.match_tokens}
        p_disc = pf & DISCRIMINATORS
        # honour the endpoint's chemical discriminators, but exclude ONLY a part that
        # carries a CONFLICTING discriminator (a chemically-wrong rival) — not one that
        # merely lacks the token (same relaxation as token_overlap; an unqualified part
        # is a valid cluster member). Mirrors the route-coverage fix so a 'co2_*' group
        # tag still gathers its unqualified members instead of dropping them.
        if ep_disc and (p_disc - ep_disc):
            continue
        s = len(ep_folded & pf)
        if s > 0:
            hits.append((s, p))
    hits.sort(key=lambda t: (t[0], -len(t[1].match_tokens)), reverse=True)
    return hits


def _cluster_centroid_mm(cluster):
    """Mean (x,y) of a matched cluster at the TOP-anchor mean Z (where a bus drops
    onto the loads from overhead). cluster = [(score, part), …]."""
    xs = [p.placed_xyz_mm[0] for _, p in cluster]
    ys = [p.placed_xyz_mm[1] for _, p in cluster]
    zs = [(p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2]) for _, p in cluster]
    n = float(len(cluster))
    return (sum(xs) / n, sum(ys) / n, sum(zs) / n)


def _make_incomer(endpoint_name, parts, region_centres, bbox_mm, MAT, MO):
    """Synthesise a small EXTERNAL-SUPPLY 'incomer' at the plant edge nearest the
    power/utilities region: a junction box + a stubby cable gland on top, returned
    as the (x,y,z) gland-tip the bus leaves from. Universal — placed from the plant
    bbox + the utilities/power region centroid (falls back to the −X plant edge)."""
    # Find the power/utilities region centre to sit the incomer beside; else the
    # left (−X) plant edge at mid-Y (a battery-limit incomer enters from offsite).
    util_xy = None
    for rk, c in (region_centres or {}).items():
        if re.search(r"utilit|offsite|power|electric", str(rk), re.IGNORECASE):
            util_xy = c
            break
    if util_xy is not None:
        # sit just OUTSIDE the plant on the nearer long edge, level with utilities
        edge_y = bbox_mm["y0"] - 700.0 if util_xy[1] < (bbox_mm["y0"] + bbox_mm["y1"]) / 2 \
            else bbox_mm["y1"] + 700.0
        bx, by = util_xy[0], edge_y
    else:
        bx, by = bbox_mm["x0"] - 700.0, (bbox_mm["y0"] + bbox_mm["y1"]) / 2

    if "u_incomer_box" not in MAT:
        MAT["u_incomer_box"] = fl.make_mat("m_u_incomer_box", (0.32, 0.34, 0.40),
                                           metallic=0.55, roughness=0.45)
    bmat = MAT["u_incomer_box"]
    box_w, box_d, box_h = 900.0, 700.0, 1500.0
    bz = DECK_Z_MM + box_h / 2.0
    fl.add_box(f"u_incomer_{_part_prefix(endpoint_name)}",
               (bx * fl.MM, by * fl.MM, bz * fl.MM),
               (box_w * fl.MM, box_d * fl.MM, box_h * fl.MM),
               bmat, module=ELEC_MODULE_ID, module_objects=MO)
    # a short cable gland on top → the bus leaves from its tip
    gland_top = DECK_Z_MM + box_h
    tip = _spawn_nozzle_stub(f"u_incomer_gland_{_part_prefix(endpoint_name)}",
                             (bx, by, gland_top), (0.0, 0.0, 1.0),
                             PIPE_DIA_MM, MAT, ELEC_MODULE_ID, MO)
    return tip


def _resolve_abstract_end(endpoint_name, parts, region_centres, bbox_mm, MAT, MO):
    """Turn an ABSTRACT endpoint into a routable target. Returns
    (point_mm, branch_points, connect_anchor) where branch_points is a (possibly
    empty) list of extra (x,y,z) the bus should also drop a short branch to (top
    matched loads of a GROUP), and connect_anchor is an assembly to declare the run
    attached_to (or None). External supply → a synthesised incomer marker; group →
    the matched-cluster centroid + branch drops; otherwise None (truly unroutable)."""
    if EXTERNAL_SUPPLY_RE.search(endpoint_name) and \
            not GROUP_ENDPOINT_RE.search(endpoint_name):
        return _make_incomer(endpoint_name, parts, region_centres, bbox_mm,
                             MAT, MO), [], None
    if GROUP_ENDPOINT_RE.search(endpoint_name):
        cluster = _matched_cluster(endpoint_name, parts)
        if cluster:
            centroid = _cluster_centroid_mm(cluster)
            # short branch drops to the top-N matched loads (their TOP anchors)
            branches = []
            for _, p in cluster[:GROUP_BRANCH_TOP_N]:
                tp = p.anchors["top"] if p.anchors else p.placed_xyz_mm
                branches.append(tp)
            return centroid, branches, cluster[0][1].obj_anchor
    return None, [], None


def _draw_cable_tray(nm, waypoints_mm, MAT, MO, dia_mm=None):
    """Draw an electrical run as a CABLE TRAY / bus-duct (copper-orange,
    RECTANGULAR cross-section) so it reads visually DISTINCT from round process
    pipe. Built as oriented boxes along each orthogonal leg + a couple of ladder
    rungs per leg (the tray look). Universal — pure geometry from the waypoints.

    `dia_mm` = the SIZED conductor outer diameter (busbar/cable bundle) from
    connection_sizing; the tray width tracks it so a 1562 A DC busway reads VISIBLY
    FATTER than a signal/control tray. None ⇒ the old nominal width (back-compat)."""
    if "u_cable_tray" not in MAT:
        # RED electrical tray/conductor (Tristan 2026-06-13: "electricity wires as red").
        MAT["u_cable_tray"] = fl.make_mat("m_u_cable_tray", (0.90, 0.10, 0.10),
                                          metallic=0.45, roughness=0.40)
    tray = MAT["u_cable_tray"]
    if dia_mm is not None and dia_mm > 0:
        # tray carries the conductor(s) + clearance: ~1.4× the sized OD. A LOW floor
        # (40 mm) so the trunk-vs-tap STEP-DOWN reads — a 93.8 mm DC-bus trunk →
        # ~131 mm tray vs a 13.5 mm rack tap → ~40 mm tray is a clear ~3× difference;
        # a high floor would flatten the very step-down this sizing exists to show.
        tray_w = max(40.0, dia_mm * 1.4)
    else:
        tray_w = max(220.0, PIPE_DIA_MM * 1.3)   # tray slightly wider than a pipe
    tray_h = tray_w * 0.55                    # shallow rectangular section
    legs = 0
    for a, b in zip(waypoints_mm[:-1], waypoints_mm[1:]):
        ax, ay, az = (float(c) for c in a)
        bx, by, bz = (float(c) for c in b)
        dx, dy, dz = bx - ax, by - ay, bz - az
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        if ln < 1.0:
            continue
        cx, cy, cz = (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2
        # size the box along the dominant axis of this leg (legs are orthogonal)
        if abs(dz) >= abs(dx) and abs(dz) >= abs(dy):       # vertical riser
            size = (tray_w, tray_h, ln)
        elif abs(dx) >= abs(dy):                            # along X
            size = (ln, tray_w, tray_h)
        else:                                               # along Y
            size = (tray_w, ln, tray_h)
        fl.add_box(f"{nm}_leg{legs}", (cx * fl.MM, cy * fl.MM, cz * fl.MM),
                   (size[0] * fl.MM, size[1] * fl.MM, size[2] * fl.MM),
                   tray, module=ELEC_MODULE_ID, module_objects=MO)
        # ladder rungs along the leg (skip risers — rungs read on the horizontals).
        # Cap at CABLE_TRAY_MAX_RUNGS: very long legs (cross-plant runs on a large
        # scene) would otherwise spawn hundreds of bpy.ops mesh objects, pegging
        # the CPU in Blender's O(scene-objects) operator loop (the root hang for
        # the RAS v14 Standby Diesel Generator → Degassing Blower cable run).
        if abs(dz) < max(abs(dx), abs(dy)):
            n_rung = min(max(2, int(ln / 1400)), CABLE_TRAY_MAX_RUNGS)
            ux, uy = dx / ln, dy / ln
            for k in range(1, n_rung):
                t = k / float(n_rung)
                rx, ry, rz = ax + dx * t, ay + dy * t, az + dz * t
                # rung crosses the tray width (perpendicular, horizontal)
                if abs(dx) >= abs(dy):
                    rsize = (tray_h * 0.7, tray_w, tray_h * 0.7)
                else:
                    rsize = (tray_w, tray_h * 0.7, tray_h * 0.7)
                fl.add_box(f"{nm}_rung{legs}_{k}",
                           (rx * fl.MM, ry * fl.MM, rz * fl.MM),
                           (rsize[0] * fl.MM, rsize[1] * fl.MM, rsize[2] * fl.MM),
                           tray, module=ELEC_MODULE_ID, module_objects=MO)
        legs += 1
    return legs


# ── CROSS-MODULE PROCESS-LINE AUGMENTATION (universal) ────────────────────────
# The orchestrator `topology` is the PRIMARY edge list, but on some archetypes it
# under-describes the plant: it captures the equipment-to-equipment sequence WITHIN
# the main process module yet omits the INTER-module process-water connections that
# close the loop (e.g. a recirculating-aquaculture train sits largely inside one
# fluid module, so the tank→treatment→tank legs between modules never become topology
# edges and the 3D/P&ID look sparse — only ~4 of ~20 connections drawn). Those legs
# DO exist, authored by the engine, in moduleDecomposition.cross_module_grammar_links
# (module→module + mechanism). This augmentation routes the FLUID ones the topology
# does NOT already cover, as real process lines between a representative part of each
# module. It is deliberately FLUID-ONLY and PAIR-DEDUPED so it adds genuinely-missing
# recirculation/service legs without (a) drawing non-physical signal/control/mount
# links as pipes, or (b) duplicating a connection the topology already routes. On a
# plant whose topology already spans its modules (e.g. once-through CO₂ capture) it
# adds NOTHING. Universal — keyed purely on mechanism class + module coverage, never
# on archetype.
_AUG_FLUID_MECHANISMS = {
    "fluid_routing", "fluid_loop", "fluid", "process_flow", "process_fluid",
    "liquid", "water", "slurry",
}


# Structural / electrical / control nouns whose part CANNOT carry process fluid — a
# fluid line must never terminate on one (a "Rearing Tank → Structural Frame" pipe is
# non-physical). Used ONLY when picking a representative for a FLUID link; the power /
# signal augmentation still legitimately routes to a frame/cabinet/switchgear.
_NON_FLUID_REPR_RE = re.compile(
    r"frame|panel|enclosure|structur|\brack\b|cabinet|\bwall\b|floor|roof|building|"
    r"skid|foundation|plinth|busbar|switchgear|breaker|controller|transformer|"
    r"gateway|\bi/?o\b|conduit|walkway|platform|ladder|grating", re.I)


def _module_repr_part_name(module_id, parts, fluid_only=False):
    """Pick a representative placed-equipment NAME for `module_id` so a module→module
    link can route to a real part. Prefers the LARGEST primary vessel/machine in the
    module (by footprint when dimensioned), else the first non-detail part. Returns
    None when the module has no placeable equipment (then the link is skipped).

    fluid_only=True (used by the FLUID cross-module augmentation): consider only parts
    that can actually CARRY process fluid — exclude structural/electrical items
    (frame, panel, enclosure, switchgear…) so a fluid line never terminates on a
    structural frame. Returns None when the module has no fluid-capable part (then the
    fluid link is skipped, which is correct — e.g. structure_containment is not a
    fluid node)."""
    in_mod = [p for p in parts if p.module_id == module_id]
    if fluid_only:
        in_mod = [p for p in in_mod if not _NON_FLUID_REPR_RE.search(p.name or "")]
    if not in_mod:
        return None

    def _vol(p):
        # p.dim is a parse_dimension DICT ({kind:'cyl',dia_mm,len_mm} or
        # {kind:'box',w_mm,d_mm,h_mm}), NOT a list — the old (list,tuple) test was
        # ALWAYS False so this returned 0 for every part and the "largest principal
        # vessel" pick silently degraded to "first part in the module". Reading the
        # dict makes the representative the real principal item (the rearing TANK for
        # the fluid module, the transformer for power), which is what a module→module
        # process line should route to.
        d = getattr(p, "dim", None)
        if isinstance(d, dict):
            if d.get("kind") == "cyl" and d.get("dia_mm"):
                r = float(d["dia_mm"]) / 2.0
                return math.pi * r * r * float(d.get("len_mm") or d["dia_mm"])
            if d.get("kind") == "box":
                return (float(d.get("w_mm") or 0.0) * float(d.get("d_mm") or 0.0)
                        * float(d.get("h_mm") or 0.0))
        return 0.0

    # Prefer a dimensioned MAJOR item (largest footprint); fall back to the first.
    best = max(in_mod, key=_vol)
    if _vol(best) > 0:
        return best.name
    return in_mod[0].name


_POWERED_KW = ('pump', 'heat', 'uv', 'oxygen', 'blower', 'drum', 'chiller', 'steril', 'aerat',
               'degas', 'mbbr', 'filter', 'skim', 'compress', 'motor', 'fan', 'lamp', 'mixer', 'agitat')
_SENSOR_KW = ('sensor', 'probe', 'transmit', 'gauge', 'meter', 'analy', 'detector')


def _device_current_a(name, quantities):
    """Per-device feeder current (A) at 400/415 V 3-phase. Match the device to a *_kw
    quantity in the contract by keyword; else a modest default share of the connected
    load. UNIVERSAL — no class table."""
    nm = re.sub(r'[^a-z0-9]', '', str(name).lower())
    kw = None
    for k, v in (quantities or {}).items():
        kl = k.lower()
        if not (kl.endswith('_kw') or 'power_kw' in kl):
            continue
        key = re.sub(r'[^a-z0-9]', '', kl.replace('_kw', '').replace('electrical', '').replace('power', ''))
        val = v.get('value') if isinstance(v, dict) else v
        if key and key in nm and isinstance(val, (int, float)) and val > 0:
            kw = float(val)
            break
    if kw is None:
        tot = quantities.get('connected_electrical_load_kw') if isinstance(quantities, dict) else None
        totv = (tot.get('value') if isinstance(tot, dict) else tot) or 0
        kw = max(2.0, float(totv) / 25) if totv else 7.5
    return round(kw * 1000.0 / (1.732 * 400.0 * 0.9), 1)


# UNIVERSAL role → required-services classifier, imported from the SHARED module
# (component_engineering._required_services) so the Blender topology connector and the
# dashboard's missing-connection DIAGNOSIS agree on what every part needs — ONE source
# of truth. Falls back to a byte-identical local replica if the import fails under
# Blender's interpreter (keep the two in sync if you ever edit _required_services).
def _load_required_services():
    try:
        import sys as _sys
        _scripts = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        if _scripts not in _sys.path:
            _sys.path.insert(0, _scripts)
        from component_engineering import _required_services as _rs
        return _rs
    except Exception:
        def _rs(name, module, function, wet_plant=True):   # replica of component_engineering._required_services
            t = re.sub(r'[^a-z0-9]', '', f"{name} {module} {function}".lower())
            m = re.sub(r'[^a-z0-9]', '', str(module or '').lower()); req = set()
            if any(k in t for k in ('pump', 'heat', 'uv', 'oxygen', 'blower', 'drum', 'chiller', 'steril', 'aerat', 'degas', 'mbbr', 'filter', 'skim', 'compress', 'motor', 'fan', 'lamp', 'mixer', 'agitat')):
                req.add('power')
            # PROCESS-FLUID role gated on the WET-plant signal (M1, 2026-06-23 — keep in
            # sync with component_engineering._required_services). RAS-only tokens
            # ('rear','cone') are a conditional extension folded in here, never universal.
            if wet_plant and any(k in t for k in ('tank', 'rear', 'filter', 'mbbr', 'degas', 'oxygen', 'uv', 'skim', 'sump', 'vessel', 'pump', 'clarifier', 'reservoir', 'manifold', 'header', 'pipework', 'pipe', 'duct', 'valve', 'exchanger', 'cone', 'column', 'tower', 'reactor', 'separator', 'contactor', 'blower', 'fan', 'compress')):
                req.add('water')
            if any(k in t for k in ('sensor', 'probe', 'instrument', 'monitor', 'meter', 'gauge', 'transmit', 'analy', 'detector')):
                req.add('signal')
            if any(k in t for k in ('control', 'plc', 'scada', 'hmi', 'compute', 'automation', 'gateway', 'network', 'iomodule', 'controller')):
                req.update(('signal', 'power'))
            # (1b) field instrument → signal only, never its own water main (see
            # component_engineering._required_services — keep in sync).
            _is_sensor = any(k in t for k in ('sensor', 'probe', 'transmit', 'gauge', 'analy', 'detector'))
            _is_inline = ('valve' in t) or any(k in t for k in (
                'tank', 'vessel', 'filter', 'mbbr', 'degas', 'skim', 'clarifier', 'reactor',
                'column', 'tower', 'cone', 'exchanger', 'separator', 'contactor', 'sump', 'reservoir', 'drum'))
            if _is_sensor and not _is_inline:
                req.discard('water')
            if any(k in t for k in ('frame', 'enclos', 'structur', 'platform', 'foundation', 'nameplate', 'label', 'walkway', 'ladder', 'grating', 'cladding')):
                return req
            if not req:   # module-primary ONLY for name-unclassified passive kit (see component_engineering)
                if 'powerdistribution' in m or 'powerconversion' in m:
                    req.add('power')
                if 'safetyprotection' in m:
                    req.add('signal')
                if 'sensing' in m or 'instrumentation' in m:
                    req.add('signal')
                if 'controlcompute' in m or 'communication' in m:
                    req.update(('signal', 'power'))
                if wet_plant and ('massfluid' in m or 'watertreatment' in m or 'fluidtransport' in m):
                    req.add('water')
                if 'environmentalinterface' in m:
                    req.add('power')
            return req
        return _rs


_REQUIRED_SERVICES = _load_required_services()


def _edge_service(mech):
    """Map a topology edge mechanism → the SERVICE it provides (power / signal / water)
    so a part's existing edges can be credited against its required services."""
    m = str(mech or '').lower()
    if 'electrical' in m or m in ('ac_busbar', 'dc_bus'):
        return 'power'
    if m in ('signal', 'data_link', 'control_signal', 'sensor_feedback', 'modbus_tcp',
             'alarm_interlock', 'contactor_command'):
        return 'signal'
    if 'fluid' in m or m in ('water', 'slurry', 'liquid', 'thermal', 'process_flow', 'process_fluid'):
        return 'water'
    return None


# A FLUID-carrying mechanism (the ones whose routed run is a process pipe, not a cable
# or a signal lead). Mirrors _edge_service's 'water' branch — a pipe to a pure
# instrument (DEFECT 1) is only ever wrong on a FLUID edge. Kept as its own predicate
# so the routing-level reconciliation reads as intent.
def _mech_is_fluid(mech):
    return _edge_service(mech) == 'water'


# A pure FIELD INSTRUMENT measures the process; it never carries the process fluid in
# its own main (a temperature sensor on a DN350 water pipe is nonsense — it is wired by
# its signal lead, not a pipe). This is the EXACT predicate the _required_services
# replica uses to discard 'water' for an instrument (lines ~5612-5616 above — KEEP IN
# SYNC): an endpoint is a pure instrument if its name matches a sensing word AND NOT a
# vessel/inline word (a control valve / an analyser BUILT INTO a degasser is inline and
# legitimately on the loop). Used at the ROUTING level to drop fluid edges the PRIMARY
# topology / cross-module grammar routed straight onto an instrument (those bypass the
# AUGMENT path's _required_services guard). Universal + deterministic — name-only, no
# class table.
def _endpoint_is_pure_instrument(name):
    t = re.sub(r'[^a-z0-9]', '', str(name or '').lower())
    _is_sensor = any(k in t for k in ('sensor', 'probe', 'transmit', 'gauge', 'analy', 'detector'))
    _is_inline = ('valve' in t) or any(k in t for k in (
        'tank', 'vessel', 'filter', 'mbbr', 'degas', 'skim', 'clarifier', 'reactor',
        'column', 'tower', 'cone', 'exchanger', 'separator', 'contactor', 'sump', 'reservoir', 'drum'))
    return _is_sensor and not _is_inline


# ── ELECTRICAL DISTRIBUTION HIERARCHY (universal, role-keyed — no class table) ────
# A real power net is not a flat star off one part: utility/source → MAIN BREAKER →
# BUSBAR/BOARD → protective devices (fuses / surge / relays) → each powered LOAD. The
# orphan connector previously fed EVERY load from ONE representative part (the largest
# in power_distribution → the standby generator), so the breaker / busbar / fuse /
# surge each got a feed IN but nothing OUT (they read as just-another-load), and the
# source had no input. We classify the distribution-chain parts present BY ROLE and
# order them into a SERIES SPINE; the BUSBAR (last common bus) becomes the LOAD HUB so
# loads tap the bus, and a synthesised utility incomer (an ORIGIN) feeds the source so
# nothing upstream is input-less. Keyed only on role words — a class with no such
# chain (e.g. e-fuel) yields an empty spine and the single-hub fallback is byte-stable.
# The incomer/source is a true upstream ELECTRICAL supply — a power generator / genset /
# utility grid / mains / incoming transformer. A UPS / inverter is NOT the series source:
# it is fed FROM the board and backs up the control loads, so it is wired as an ordinary
# load. CRITICAL false-positive guard: a STEAM / waste-heat / fired / process generator
# (a boiler-class heat source — common on a CO₂ / e-fuel plant) is NOT an electrical
# source; the negative lookahead drops "steam generator", "waste-heat steam generator",
# "fired heater generator" etc. so a process plant never grows a spurious power spine.
_DIST_SOURCE_RE     = re.compile(
    r"(?:\b(?:diesel|standby|backup|emergency|power|electrical|engine)\s+)?\bgenerator\b(?!\s*set\s+for\s+steam)"
    r"|\bgenset\b|\bincomer\b|utility\s*(?:supply|incomer|connection)|\bgrid\b|\bmains\b"
    r"|incoming\s*transformer",
    re.IGNORECASE)
# a bare "generator" qualified by steam/heat/process words is a HEAT source, not power.
_NOT_POWER_GENERATOR_RE = re.compile(
    r"steam|waste[- ]?heat|fired|furnace|boiler|process|heat[- ]?recovery|hrsg|reformer|syngas",
    re.IGNORECASE)
# POWER / DISTRIBUTION transformer = a SERIES spine stage BETWEEN the incomer and the
# board (MV/LV, HV/LV, step-up/down, distribution, isolation, dry-type, unit, auxiliary).
# It is NOT an instrument transformer (CT / VT / PT) — those measure, they don't
# distribute power; the negative guard drops them so a metering CT never grows a spine.
# (2026-06-24 universal fix: a plant "distribution transformer" matched no role and got
# wired as a LOAD off the board — MCC→transformer, backwards — so it read as a dead-end
# with no downstream. It belongs IN the spine: incomer → transformer → board → loads.)
_DIST_XFMR_RE       = re.compile(
    r"distribution\s*transformer|power\s*transformer|\bMV\s*/?\s*LV\s*transformer\b|"
    r"\bHV\s*/?\s*LV\s*transformer\b|\bLV\s*transformer\b|step[- ]?up\s*transformer|"
    r"step[- ]?down\s*transformer|isolation\s*transformer|dry[- ]?type\s*transformer|"
    r"auxiliary\s*transformer|unit\s*transformer|\btransformer\b",
    re.IGNORECASE)
_NOT_POWER_XFMR_RE  = re.compile(
    r"current\s*transformer|\bCT\b|potential\s*transformer|voltage\s*transformer|"
    r"instrument\s*transformer", re.IGNORECASE)
_DIST_MAINBRK_RE    = re.compile(r"main\s*breaker|main\s*switch|main\s*isolat|incoming\s*breaker|\bACB\b|\bMCCB\b|main\s*circuit\s*breaker", re.IGNORECASE)
_DIST_BUSBAR_RE     = re.compile(r"busbar|bus\s*bar|distribution\s*board|switchboard|main\s*board|\bMCC\b|consumer\s*unit|\bpanelboard\b|distribution\s*panel|switchgear|switch[- ]?gear|motor\s*control\s*cent|\bLV\s*board\b|\bMV\s*board\b|low[- ]?voltage\s*board|\bLV\s*panel\b|\bLV\s*switchboard\b|power\s*distribution\s*unit|\bPDU\b", re.IGNORECASE)
# a DOWNSTREAM / sub-distribution board (an MCC, a motor-control board, a sub-board, a
# local/field panel) sits BELOW the main board in series — keyed so multiple boards
# order main→sub instead of collapsing to one (the 2nd board used to orphan).
_DIST_SUBBOARD_RE   = re.compile(r"\bMCC\b|motor\s*control\s*cent|motor\s*control\s*board|sub[- ]?board|sub[- ]?distribution|local\s*panel|field\s*panel", re.IGNORECASE)
_DIST_PROTECT_RE    = re.compile(r"\bfuse\b|surge|\bSPD\b|protective\s*relay|protection\s*relay|safety\s*relay|earth\s*leakage|\bRCD\b|\bRCBO\b|\bMCB\b|motor[- ]?protection|\bMPCB\b", re.IGNORECASE)


def _distribution_spine(parts):
    """Order the distribution-chain parts present into a SERIES electrical spine.
    Returns (spine, load_hub, protects) where spine is the ORDERED list of part NAMES
    incomer → SOURCE → TRANSFORMER → MAIN-BREAKER → BUSBAR(s, main→sub) (only the stages
    actually present) and load_hub is the bus the loads should tap (the last/most-
    downstream board, else the last spine stage, else None). Protective devices (fuse /
    surge / protective-or-safety relay / motor-protection breaker) are returned
    separately as bus TAPS — they sit ON the bus, not in the series path. MULTIPLE boards
    chain in series (a main board → its MCC) rather than collapsing to one. Each scalar
    role is filled by the FIRST matching part, most-specific role first so a 'main
    breaker' never falls through to the broad source test. Pure, name-only, archetype-
    agnostic — a class with none of these roles yields an empty spine (caller falls back)."""
    src = xfmr = brk = None
    buses_main: list[str] = []
    buses_sub: list[str] = []
    protects: list[str] = []
    for p in parts:
        nm = p.name or ""
        # most-specific role first: main-breaker, then protective tap, then board, then
        # transformer, then source. A protective device must not be claimed as a board
        # (and vice-versa), so the protect test excludes board-named parts.
        if _DIST_MAINBRK_RE.search(nm) and brk is None:
            brk = nm
        elif _DIST_PROTECT_RE.search(nm) and not _DIST_BUSBAR_RE.search(nm):
            protects.append(nm)
        elif _DIST_BUSBAR_RE.search(nm):
            (buses_sub if _DIST_SUBBOARD_RE.search(nm) else buses_main).append(nm)
        elif _DIST_XFMR_RE.search(nm) and not _NOT_POWER_XFMR_RE.search(nm) and xfmr is None:
            xfmr = nm   # a power/distribution transformer is a series stage, not a load
        elif _DIST_SOURCE_RE.search(nm) and not _NOT_POWER_GENERATOR_RE.search(nm) \
                and src is None:
            src = nm   # a STEAM/waste-heat/process generator is excluded — it's a heat source
    buses = buses_main + buses_sub          # main board(s) feed sub-boards (MCC) in series
    spine = [s for s in (src, xfmr, brk, *buses) if s]
    load_hub = buses[-1] if buses else (spine[-1] if spine else None)
    return spine, load_hub, protects


def augment_topology_connect_orphans(state, topology, parts):
    """UNIVERSAL orphan connector — give EVERY part each connection SERVICE its ROLE
    requires, mirroring component_engineering._required_services (the SAME classifier
    the dashboard uses to NAME the missing connection — ONE source of truth). For each
    part, for each required service it does NOT already have an edge for, ADD the edge:
        power  → fed from the LOAD HUB of the electrical distribution hierarchy (the
                 busbar/board), which is itself fed via the series spine
                 utility-incomer → main-breaker → busbar → load (sized by device kW)
        signal → it links to the control hub (instrument signal cable, sized small);
                 a FINAL CONTROL ELEMENT (valve/solenoid/damper) ALWAYS gets a signal
                 association (it is actuated), even when its role only asked for water
        water  → it ties into the fluid loop at its MODULE's principal fluid vessel,
                 sized to the LOOP flow (a DN300 loop gets a DN300 tie, not DN15)
    Tristan 2026-06-15: "a part with no inputs/outputs is probably missing one" — this
    adds exactly the missing one, so orphans → 0 and the connection + BoM count GROWS.
    A purely-STRUCTURAL part (frame/enclosure → no required services) stays unconnected,
    correctly. Existing edges are credited via resolve_endpoint, so a process-ID
    endpoint (uv_ozone_disinfection) counts for its equipment-name part (UV Sterilization)
    — no double-wiring. Subsumes the old power/signal pass. Universal + deterministic."""
    contract = state.get('orchestratorContract', {}) or {}
    quantities = contract.get('quantities', {}) or {}
    ctrl_hub = _module_repr_part_name('control_compute_communication', parts)

    # ── the electrical distribution hierarchy (role-keyed series spine + load hub) ──
    # Activate the hierarchy ONLY when a genuine MULTI-STAGE chain is present (≥2 of
    # source / main-breaker / busbar), e.g. RAS: generator → main breaker → busbar. A
    # class with just a lone busbar (or none) keeps the EXISTING single-hub behaviour
    # (pwr_hub = the module-representative part) BYTE-IDENTICALLY — so CO₂/SAF/VF, which
    # have at most one distribution-chain part, are untouched. The hierarchy is purely
    # additive where it activates: the spine edges + busbar→protective taps are new, and
    # loads tap the busbar instead of the lone repr-part.
    dist_spine, dist_load_hub, dist_protects = _distribution_spine(parts)
    _hierarchy_active = len(dist_spine) >= 2
    if _hierarchy_active:
        pwr_hub = dist_load_hub
    else:
        # no multi-stage chain → still use the LONE distribution part (busbar / switchgear /
        # board / MCC) as the power hub if one exists, so every load taps a real
        # distribution point; else the module-representative part. (2026-06-20 universal
        # fix: previously this IGNORED a lone busbar and used only the module repr — a class
        # with just a switchgear, like SAF, got pwr_hub=None and wired ZERO power feeds, so
        # 30 powered parts were left unpowered. dist_load_hub is the lone bus when present.)
        pwr_hub = dist_load_hub or _module_repr_part_name('power_distribution', parts)
        dist_spine, dist_protects = [], []

    # the water tie carries the loop flow (largest flow_capacity already on the topology)
    loop_flow = 0.0
    for e in topology:
        if str(e.get('constraint_kind')) == 'flow_capacity':
            try:
                loop_flow = max(loop_flow, float(e.get('required_value') or 0.0))
            except (TypeError, ValueError):
                pass

    # SERVICES each part already HAS — resolve BOTH endpoints to a real part so a
    # process-ID endpoint credits its equipment-name part (the identity bridge). Also
    # track fluid DIRECTION per part (does it already have an inbound / outbound process
    # line?) so the water tie can close the MISSING direction: a process vessel on a
    # recirculation loop needs BOTH a feed IN and a return OUT, and the loop only ever
    # authored one of them (e.g. Expansion Reservoir → Rearing Tank gives an OUT but no
    # IN). Universal — keyed on edge direction, no per-part table.
    have = {}
    plant_is_wet = False   # WET-plant signal (M1, 2026-06-23): does the topology carry
    #                        any process-FLUID edge? A dry archetype (satellite / aero /
    #                        BESS / generic_assembly) has none → its parts default to
    #                        power/signal, never a spurious process-water pipe. Physical
    #                        signal (fluid topology edge), never an archetype-name string.
    for e in topology:
        svc = _edge_service(e.get('mechanism'))
        if not svc:
            continue
        if svc == 'water':
            plant_is_wet = True
        for endp in (e.get('from_part'), e.get('to_part')):
            pp = resolve_endpoint(str(endp or ''), parts)
            if pp is not None:
                have.setdefault(pp.name, set()).add(svc)

    fluid_sink = {}
    def _sink_for(module_id):
        if module_id not in fluid_sink:
            fluid_sink[module_id] = _module_repr_part_name(module_id, parts, fluid_only=True)
        return fluid_sink[module_id]

    existing = {(str(e.get('from_part')), str(e.get('to_part'))) for e in topology}
    seen = set()
    extra = []
    n_pwr = n_sig = n_wtr = n_chain = 0

    def _add_pwr_edge(a, b, ctx, current=None):
        """Add an electrical_bus feeder a→b once (dedup against topology + this pass)."""
        if not a or not b or a == b:
            return False
        if (a, b) in existing or (a, b) in seen:
            return False
        seen.add((a, b))
        e = {'from_part': a, 'to_part': b, 'mechanism': 'electrical_bus',
             'constraint_kind': 'current_rating',
             'required_value': current if current is not None else _device_current_a(b, quantities),
             'required_unit': 'A', 'required_margin_factor': 1.25,
             'material_context': ctx, '_augmented': True}
        extra.append(e)
        return True

    def _add_fluid_edge(a, b):
        """Add a fluid_loop SERVICE tie-in a→b once. Returns 1 if added else 0. A 2-cycle
        is rejected (an a→b suppresses a later b→a — two process lines between the same
        pair read as a tangle).

        SERVICE SIZING (2026-06-20 fix — Tristan caught the fat-pipe 'web' in the render):
        this tie exists because part `a` lacked ANY water connection — it is therefore a
        SERVICE tie-in (make-up / fill / drain / wash-down / utility), NOT a leg of the
        main recirculation loop. It must NOT inherit the plant's largest `loop_flow`:
        doing so sized 26 ancillary ties (feed store, mortality, biosecurity, dosing,
        grading…) at the full recirc 3×DN300 main, which (a) DREW a web of fat mains
        radiating to the tanks and (b) fed the cost ledger an inflated length×bore. A
        service tie carries a small fraction of the loop — size it to ~5% of loop_flow
        (the same conservative branch default the BoM's `_edge_water_flow_m3h` uses for
        an off-loop branch), so the render shows a THIN service tap and the schedule bore
        agrees with the re-priced BoM. Universal: an orphan service tie on ANY archetype
        is a service line, never the process main. The genuine main-loop legs are authored
        by the primary topology / cross-module grammar and keep their full flow."""
        if not a or not b or a == b:
            return 0
        if (a, b) in existing or (b, a) in existing or (a, b) in seen or (b, a) in seen:
            return 0
        seen.add((a, b))
        edge = {'from_part': a, 'to_part': b, 'mechanism': 'fluid_loop',
                'constraint_kind': 'flow_capacity',
                'material_context': 'process-water service tie-in (make-up / fill / drain)',
                '_augmented': True, '_service_tie': True}
        if loop_flow > 0:
            edge['required_value'] = loop_flow * 0.015  # service branch (~DN65-80), NOT the main loop
            edge['required_unit'] = 'm³/s'
        extra.append(edge)
        return 1

    # ── (0) ELECTRICAL DISTRIBUTION SPINE — energise the chain itself so every node
    #    on it has power IN and OUT, then loads tap the busbar (done in the loop). The
    #    series path is utility-incomer → source → main-breaker → busbar; each
    #    protective device (fuse/surge/relay) TEES off the busbar. A synthesised
    #    "Utility Incomer" ORIGIN feeds the first stage so the source is not input-less.
    #    Skipped wholesale when no chain is recognised (dist_spine empty) — byte-stable.
    chain_parts = set(dist_spine) | set(dist_protects)
    if dist_spine:
        prev = 'Utility Incomer'   # abstract battery-limit origin (an ORIGIN_KEYWORD)
        for stage in dist_spine:
            if _add_pwr_edge(prev, stage, 'utility incomer / main distribution feeder'):
                n_chain += 1
            prev = stage
        # protective devices sit ON the bus (busbar → fuse / surge / relay)
        bus = dist_load_hub
        for prot in dist_protects:
            if _add_pwr_edge(bus, prot, 'busbar protective tap (fuse / surge / relay)'):
                n_chain += 1

    for p in parts:
        needed = _REQUIRED_SERVICES(p.name, p.module_id or '', getattr(p, 'function', '') or '', plant_is_wet)
        got = have.get(p.name, set())
        # a FINAL CONTROL ELEMENT that is ACTUATED (a control valve / solenoid / motorised
        # / actuated damper) takes a command signal, even when its role only asked for
        # water. Narrow to genuinely-actuated elements: a manual / relief / check / safety
        # valve is mechanical and gets NO signal (so a relief valve never grows a spurious
        # signal tie on any class). Keyed on actuation words, no class table.
        _nl_fe = (p.name or '').lower()
        _is_actuated_fe = (
            ('solenoid' in _nl_fe or 'actuat' in _nl_fe or 'motoris' in _nl_fe or 'motoriz' in _nl_fe)
            or (('control valve' in _nl_fe or 'control-valve' in _nl_fe)
                or ('valve' in _nl_fe and any(k in _nl_fe for k in ('control', 'modulat', 'throttl', 'dosing', 'metering')))))
        if _is_actuated_fe and not any(k in _nl_fe for k in ('relief', 'check', 'non-return', 'manual', 'safety', 'isolation', 'isolat')):
            needed = set(needed) | {'signal'}
        for svc in sorted(needed - got):
            # a part that IS on the distribution spine/taps is already energised by (0)
            if svc == 'power' and p.name in chain_parts:
                continue
            if svc == 'power' and pwr_hub and p.name != pwr_hub \
                    and (pwr_hub, p.name) not in existing and (pwr_hub, p.name) not in seen:
                if _add_pwr_edge(pwr_hub, p.name, 'LV power feeder 400/415V 3ph'):
                    n_pwr += 1
            elif svc == 'signal' and ctrl_hub and p.name != ctrl_hub \
                    and (p.name, ctrl_hub) not in existing and (p.name, ctrl_hub) not in seen:
                seen.add((p.name, ctrl_hub)); n_sig += 1
                extra.append({'from_part': p.name, 'to_part': ctrl_hub, 'mechanism': 'signal',
                              'constraint_kind': 'current_rating', 'required_value': 0.5,
                              'required_unit': 'A', 'required_margin_factor': 1.0,
                              'material_context': 'instrument signal cable 4-20mA', '_augmented': True})
            elif svc == 'water':
                # ORIGINAL behaviour (byte-stable): tie the part to its MODULE's fluid
                # repr, giving it an OUTPUT. The direction-closer below ADDS the missing
                # opposite direction on top (purely additive — it never redirects this
                # edge), so existing classes' fluid ties are unchanged.
                sink = _sink_for(p.module_id)
                if not (sink and sink != p.name):
                    continue
                n_wtr += _add_fluid_edge(p.name, sink)
    if extra:
        print(f"[univ] orphan connector: +{len(extra)} edge(s) — {n_chain} distribution-spine, "
              f"{n_pwr} power, {n_sig} signal, {n_wtr} water "
              f"(load hub={pwr_hub}, spine={'→'.join(dist_spine) or '—'}, control hub={ctrl_hub})")
    return extra


def augment_topology_cross_module(state, topology, parts):
    """Return EXTRA topology-shaped edges for the FLUID cross-module grammar links the
    primary `topology` does not already route (see the block comment above). Each extra
    edge is `{from_part, to_part, mechanism:'fluid_loop', constraint_kind:'flow_capacity',
    material_context, _augmented:True}` so it flows through the SAME route_topology /
    sizing / manifest path as a real edge. Pure: no Blender, no mutation of `topology`."""
    md = state.get("moduleDecomposition", {}) or {}
    links = md.get("cross_module_grammar_links", []) or []
    if not links:
        return []

    present_modules = {p.module_id for p in parts}

    # The recirc/service leg carries the LOOP's flow — inherit the largest
    # flow_capacity already on the fluid topology so the return is sized like the
    # forward process line (a DN300 forward must NOT get a DN15 return). m³/s.
    loop_flow = 0.0
    for e in topology:
        if str(e.get("constraint_kind")) == "flow_capacity":
            try:
                loop_flow = max(loop_flow, float(e.get("required_value") or 0.0))
            except (TypeError, ValueError):
                pass

    # (1) module-pairs the PRIMARY topology already connects — so we never duplicate a
    #     drawn line. DIRECTED ((from_module, to_module)) — a forward supply leg
    #     A→B must NOT suppress a RETURN leg B→A: on a RECIRCULATING plant (RAS:
    #     tanks→treatment forward + treatment→tanks return) the grammar authors both
    #     directions and they are PHYSICALLY DISTINCT lines (supply vs return). The old
    #     UNDIRECTED frozenset deduped the return against the forward leg, so the
    #     recirc loop never closed (0 fluid edges returned to the tanks). Directed
    #     dedup adds the return; a once-through plant authors no return grammar link,
    #     so it stays a no-op there. Resolve each endpoint via the router's resolver.
    covered_pairs = set()
    for e in topology:
        pa = resolve_endpoint(e.get("from_part", ""), parts)
        pb = resolve_endpoint(e.get("to_part", ""), parts)
        if pa is not None and pb is not None and pa.module_id != pb.module_id:
            covered_pairs.add((pa.module_id, pb.module_id))

    extra = []
    seen = set()
    for l in links:
        if not isinstance(l, dict):
            continue
        mech = str(l.get("mechanism") or "").lower()
        if mech not in _AUG_FLUID_MECHANISMS:
            continue  # FLUID transports only — never signal/control/thermal/power here
        fm = l.get("from_module")
        tm = l.get("to_module")
        if not fm or not tm or fm == tm:
            continue
        if fm not in present_modules or tm not in present_modules:
            continue
        pair = (fm, tm)   # DIRECTED — see covered_pairs note: a return leg B→A is
                          # distinct from the forward A→B and must close the loop.
        if pair in covered_pairs or pair in seen:
            continue
        a_name = _module_repr_part_name(fm, parts, fluid_only=True)
        b_name = _module_repr_part_name(tm, parts, fluid_only=True)
        if not a_name or not b_name or a_name == b_name:
            continue
        seen.add(pair)
        edge = {
            "from_part": a_name,
            "to_part": b_name,
            "mechanism": "fluid_loop",
            "constraint_kind": "flow_capacity",
            "material_context": "process water (inter-module recirculation/service)",
            "_augmented": True,
        }
        if loop_flow > 0:                          # size the leg like the loop it closes
            edge["required_value"] = loop_flow
            edge["required_unit"] = "m³/s"
        extra.append(edge)
    if extra:
        print(f"[univ] cross-module augmentation: +{len(extra)} FLUID process line(s) "
              f"from grammar links not covered by topology "
              f"({len(covered_pairs)} pairs already routed)")
        for x in extra:
            print(f"[univ]   +aug fluid: {x['from_part']} -> {x['to_part']}")
    return extra


def route_topology(topology, parts, MAT, MO, frame_top_mm=None,
                   region_centres=None, bbox_mm=None, rack_plan=None):
    """Draw a routed CAD pipe for every resolvable edge on a SHARED PIPE-RACK SPINE
    (2026-06-11 overhaul). Two passes: (1) RESOLVE every edge's source/target to a
    3D nozzle point (abstract endpoints → incomer / cluster centroid); (2) build a
    RackPlan whose spine runs down the free inter-bank AISLE, assign each run a LANE
    + a TIER (so parallels sit side-by-side and crossings stack in Z), then emit via
    route_on_spine() — riser → spine lane → along the aisle → off the spine → drop.
    The long horizontal travels ON the spine in the aisle, never across equipment,
    and an abstract endpoint joins at the NEAREST spine point (no perimeter detour).
    Nozzle pick + mechanism colours unchanged. Returns (routed_count, unresolved)."""
    rack_base_z = rack_elevation_mm(frame_top_mm)

    # STAGE 4: when wire_ports is the primary router (default-ON, incl. production), the
    # SPINE router DEFERS every PORT-WIRABLE edge (both ends a real placed+ported part —
    # wire_ports draws those port-to-port) and routes ONLY the abstract battery-limit
    # edges (grid/drain/atmosphere incomers) wire_ports cannot land on. Same partition
    # predicate both sides + the drawn-edge registry ⇒ each edge drawn EXACTLY once.
    _defer = _spine_defers_to_wire_ports()
    _by_name = {p.name: p for p in parts}
    _deferred = 0
    _skipped_assembly = 0

    # ── PASS 1: resolve every edge to concrete 3D endpoints (collect, don't draw) ─
    resolved = []   # per drawable edge: dict of endpoints/metadata
    unresolved = []
    for i, e in enumerate(topology):
        # Stage 4 deferral: leave the port-wirable part-to-part edges to wire_ports.
        if _defer and _edge_is_port_wirable(e, _by_name):
            _deferred += 1
            continue
        # ASSEMBLY edges are a MOUNT / part-of relation (a part and its own sub-component,
        # e.g. Drum Filter ↔ Drum Filter Screen), NEVER a routable pipe. wire_ports already
        # skips them (svc=="assembly", line ~8066) — the spine router MUST too, else the
        # sub-component edge draws as a long stray pipe up to the overhead deck and back
        # (the u_route_*_assembly 8.7× detour). Symmetric skip; universal, not RAS-keyed.
        if (e.get("_ledger_service") or cl._service_of(e.get("mechanism"))) == "assembly":
            _skipped_assembly += 1
            continue
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "fluid_loop")
        pa = resolve_endpoint(frm, parts)
        pb = resolve_endpoint(to, parts)

        # SELF-LOOP GUARD (universal): both endpoint tags fuzzy-resolved to the SAME
        # placed part — a zero-length line into one box, never a real run. This happens
        # when a tag has no dedicated part and falls onto the SAME consumer its partner
        # did (e.g. a RAS 'oxygen_supply → oxygen_cones' edge where both land on the one
        # 'Oxygenation System' part). Treat the SOURCE as an external feed (abstract) so
        # it draws as a real makeup/utility line from a battery-limit incomer INTO that
        # part, instead of collapsing to a degenerate self-loop. Never archetype-keyed.
        if pa is not None and pb is not None and pa is pb:
            pa = None

        # ABSTRACT endpoints (external supply / aggregate group): synthesise a
        # routable point (incomer marker, or matched-cluster centroid + branch drops).
        a_abstract = pa is None
        b_abstract = pb is None
        a_pt = b_pt = None
        a_branch, b_branch = [], []
        a_conn = b_conn = None
        if a_abstract:
            a_pt, a_branch, a_conn = _resolve_abstract_end(
                frm, parts, region_centres, bbox_mm, MAT, MO)
        if b_abstract:
            b_pt, b_branch, b_conn = _resolve_abstract_end(
                to, parts, region_centres, bbox_mm, MAT, MO)

        if (a_abstract and a_pt is None) or (b_abstract and b_pt is None):
            miss = []
            if (a_abstract and a_pt is None) or (pa is None and not a_abstract):
                miss.append(frm)
            if (b_abstract and b_pt is None) or (pb is None and not b_abstract):
                miss.append(to)
            unresolved.append((frm, to, mech, miss))
            print(f"[univ] topology edge {i} UNRESOLVED ({mech}): "
                  f"{frm} -> {to}  [missing: {', '.join(miss)}]")
            continue
        if (not a_abstract and pa.placed_xyz_mm is None) or \
                (not b_abstract and pb.placed_xyz_mm is None):
            unresolved.append((frm, to, mech, ["unplaced"]))
            continue

        # Nozzle selection from the edge's own label/endpoint text. Abstract ends
        # use their synthesised point directly (no shell → no nozzle/stub).
        edge_blob = f"{frm} {to} {e.get('label','')} {e.get('flow','')} {mech}"
        if a_abstract:
            a_xyz = a_pt
        else:
            a_xyz, a_key = _pick_nozzle(pa, "from", edge_blob)
            a_xyz = _maybe_stub(pa, a_key, a_xyz, mech, i, "a", MAT, MO)
            a_conn = pa.obj_anchor
        if b_abstract:
            b_xyz = b_pt
        else:
            b_xyz, b_key = _pick_nozzle(pb, "to", edge_blob)
            b_xyz = _maybe_stub(pb, b_key, b_xyz, mech, i, "b", MAT, MO)
            b_conn = pb.obj_anchor

        resolved.append({
            "i": i, "mech": mech, "a_xyz": a_xyz, "b_xyz": b_xyz,
            "a_abstract": a_abstract, "b_abstract": b_abstract,
            "a_conn": a_conn, "b_conn": b_conn, "b_branch": b_branch,
            "pa": None if a_abstract else pa, "pb": None if b_abstract else pb,
            "a_nm": frm if a_abstract else pa.name,
            "b_nm": to if b_abstract else pb.name,
            # carry the raw topology edge (its rating fields) so the emitter sizes
            # this run at its REAL diameter instead of the PIPE_DIA_MM constant.
            "edge": e,
        })

    # ── Build the RackPlan (spine in the free aisle) if the caller didn't pass one.
    # Process-plant + generic-assembly stack their banks in Y, so the SPINE runs
    # along X down the inter-bank aisle; make_rack_plan_for_rows finds that gap.
    if rack_plan is None and bbox_mm is not None:
        rack_plan = make_rack_plan_for_rows(
            bbox_mm, rack_base_z, equipment_xy_bboxes_mm(parts), axis="x")

    # STAGE 4: record every edge the spine router actually drew (resolved → emitted), so
    # wire_ports skips them (belt-and-braces against double-draw). The abstract-boundary
    # edges live here; the port-wirable part-to-part edges were deferred above.
    for r in resolved:
        _e = r.get("edge")
        if _e is not None:
            _SPINE_DRAWN_EDGE_IDS.add(id(_e))
    if _defer:
        print(f"[univ][wire] STAGE 4: spine router drew {len(resolved)} abstract-boundary "
              f"edge(s); DEFERRED {_deferred} part-to-part edge(s) to wire_ports "
              f"(each edge drawn once)"
              + (f"; SKIPPED {_skipped_assembly} assembly mount edge(s) (not pipes)"
                 if _skipped_assembly else ""))

    routed, emit_unresolved = _emit_routes_on_plan(
        resolved, rack_plan, rack_base_z, MAT, MO,
        pipe_module="mass_fluid_transport_process", tag="")
    unresolved.extend(emit_unresolved)
    return routed, unresolved


def _mech_pipe_mat(mech, MAT):
    """The cached pipe material for a mechanism (mechanism-coloured)."""
    mkey = f"u_pipe_{mech}"
    if mkey not in MAT:
        colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
        MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35, roughness=0.35)
    return MAT[mkey]


def _polyline_len_m(waypoints):
    """Total 3-D length of a routed polyline, in METRES (waypoints are mm). This is
    the run length connection_sizing needs for volt-drop / dP over THIS run."""
    total_mm = 0.0
    for p, q in zip(waypoints[:-1], waypoints[1:]):
        total_mm += math.sqrt((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
                              + (q[2] - p[2]) ** 2)
    return total_mm * fl.MM   # mm → metres (fl.MM = 0.001)


def _render_dia_floor(od_mm, mech):
    """Apply the RENDER-ONLY outer-diameter floor (does NOT touch the scheduled /
    costed ConnectionSpec — that already recorded the true sized diameter). The
    production PDF render keeps the true 12 mm floor for engineering fidelity; the
    light visual-judge INSPECT pass lifts the floor on ROUND PROCESS PIPES so a thin
    DN15 line reads as a legible pipe rather than a hair-thin thread at plant zoom
    (Tristan 2026-06-11). Cable-tray (electrical_bus) is excluded — its rendered
    width is a TRAY, already legible, and lifting it would bloat the busway."""
    od = max(od_mm, CONN_MIN_RENDER_DIA_MM)
    if _INSPECT_MODE:
        # legibility floor — EVERY run must read as a LINE, not a hair-thread (council
        # 2026-06-16: 34 electrical/signal runs rendered at 3-7 mm). Cables floored a
        # touch thinner than process pipe so a cable still reads as a cable.
        _floor = 60.0 if mech in ("electrical_bus", "signal", "data_link", "control_signal") else INSPECT_MIN_PIPE_DIA_MM
        od = max(od, _floor)
    return od


def _sized_dia_mm(nm, mech, waypoints, edge, carried_value=None, role=None):
    """THE sizing chokepoint (kills PIPE_DIA_MM = 190). Measure the routed-polyline
    length, ask connection_sizing.size_connection for the REAL connection size from
    the edge's rating, record the ConnectionSpec (for the schedule) and RETURN the
    outer diameter the cylinder/tray is drawn at, in MILLIMETRES (prim_pipe_run +
    _draw_cable_tray apply the × fl.MM mm→Blender-unit conversion internally).

      edge          : the topology edge dict carrying constraint_kind / required_value
                      / required_unit / required_margin_factor / material_context
                      / mechanism. May be None / rating-less for a derived fan-out
                      with no parent rating — then we fall back to a SMALL default
                      diameter (NOT 190) and note it in the spec.
      carried_value : OVERRIDE rating for THIS segment (a trunk = Σ load; a tap =
                      total/N) — passed straight to size_connection.
      role          : 'trunk' | 'branch' | None, stamped on the spec for the schedule.

    Material/colour stays by-mechanism (the caller owns it); ONLY the diameter
    changes. A 1562 A DC bus renders fat, a drip line thin — by arithmetic, not a
    constant."""
    import copy
    length_m = _polyline_len_m(waypoints)
    e = dict(edge) if isinstance(edge, dict) else {}
    e.setdefault("mechanism", mech)
    
    if waypoints and len(waypoints) >= 2:
        e["static_head_m"] = max(0.0, (waypoints[-1][2] - waypoints[0][2]) / 1000.0)

    # The edge must carry a rating to be sized. If it has neither an explicit
    # required_value nor an override carried_value, fall back to a small default.
    has_rating = (carried_value is not None) or (e.get("required_value") is not None)

    # Memo key: the rating-determining inputs + a 0.5 m length bucket (length only
    # shifts volt-drop %, not the chosen size, so coarse bucketing is safe). Identical
    # rack taps hit the cache → the physics tool runs once, not once per rack.
    sig = (mech, e.get("constraint_kind"), e.get("required_value"),
           e.get("required_unit"), e.get("required_margin_factor"),
           e.get("material_context"), carried_value, round(length_m * 2) / 2.0,
           round(e.get("static_head_m", 0.0), 1))
    cached = _SIZING_CACHE.get(sig)
    if cached is not None:
        spec = copy.deepcopy(cached)
        spec["length_m"] = round(length_m, 2)   # keep THIS run's exact length
    elif not has_rating and not e.get("constraint_kind"):
        # No rating + no constraint_kind ⇒ nothing to size from. Small fallback dia.
        spec = cs._spec(
            kind="unsized", mechanism=mech,
            size_label="(no rating — fallback)",
            outer_dia_mm=CONN_FALLBACK_DIA_MM,
            material_qty_desc=f"{mech} run, {length_m:.1f} m (no rating)",
            tool_used="(fallback — derived edge carried no parent rating)",
            assumptions=["no constraint_kind / required_value on this edge or its "
                         "parent fan-out; drawn at the small fallback diameter "
                         f"({CONN_FALLBACK_DIA_MM:g} mm), NOT the old 190 mm"],
            notes="un-rated edge — small fallback diameter (NOT 190)",
        )
        spec["from_part"] = e.get("from_part")
        spec["to_part"] = e.get("to_part")
        spec["length_m"] = round(length_m, 2)
        _SIZING_CACHE[sig] = copy.deepcopy(spec)
    else:
        try:
            # PHASE D — size + RESPOND to out-of-spec: size_connection_to_spec runs
            # D1 (auto-upsize: climb CSA / add a parallel conductor / next DN until
            # in-spec, so a long run renders FATTER) and D2 (when upsizing is
            # excessive, attach a design_recommendation = local step-down / relocate).
            spec = cs.size_connection_to_spec(e, length_m, carried_value=carried_value)
        except Exception as ex:  # noqa: BLE001 — never let sizing kill a run
            print(f"[univ][conn] sizing FAILED for {nm} ({mech}): {ex}; fallback dia")
            spec = cs._spec(kind="unsized", mechanism=mech,
                            size_label="(sizing error — fallback)",
                            outer_dia_mm=CONN_FALLBACK_DIA_MM,
                            notes=f"sizing error: {ex}")
            spec["length_m"] = round(length_m, 2)
        _SIZING_CACHE[sig] = copy.deepcopy(spec)
    spec["run_name"] = nm
    # THIS run's own endpoints (a cache hit shares physics, NOT the from/to labels —
    # each rack tap reaches a different consumer).
    if e.get("from_part") is not None:
        spec["from_part"] = e.get("from_part")
    if e.get("to_part") is not None:
        spec["to_part"] = e.get("to_part")
    # A cached Phase-D2 design_recommendation baked the CACHED run's endpoints into
    # its "Run X→Y:" prefix; re-point it to THIS run's endpoints so a shared-physics
    # tap doesn't recommend a step-down naming the wrong consumer.
    rec = spec.get("design_recommendation")
    if rec and rec.startswith("Run ") and ":" in rec:
        tail = rec.split(":", 1)[1]
        spec["design_recommendation"] = (
            f"Run {spec.get('from_part') or '?'}→{spec.get('to_part') or '?'}:{tail}")
    if role:
        spec["role"] = role
    # Stash the edge's material_context (the SERVICE description) on the spec so the
    # route-manifest export (joined to _ROUTE_LOG by run_name) can carry the service +
    # derive the same draw_pid line number. Additive: nothing else reads this key.
    if e.get("material_context") is not None:
        spec.setdefault("material_context", e.get("material_context"))
    _CONN_SPECS.append(spec)

    od = spec.get("outer_dia_mm")
    if od is None or not (od > 0):
        od = CONN_FALLBACK_DIA_MM
    od = _render_dia_floor(od, mech)       # keep the thinnest run visible/legible
    # Return in MILLIMETRES — the unit prim_pipe_run + _draw_cable_tray consume
    # (they apply the × fl.MM mm→Blender-unit conversion internally).
    return od


def _draw_run(nm, mech, waypoints, a_xyz, b_xyz, MAT, MO, pipe_module,
              conn=(), own_parts=(), log=True, edge=None, carried_value=None,
              role=None):
    """Draw ONE routed run (cable-tray for electrical, round pipe otherwise) at its
    REAL sized diameter and log it for the route audit. Shared by the per-edge path,
    the passthrough path, the TRUNK and the TAP — so every emitted polyline gets the
    identical geometry + the identical self-audit coverage + the identical
    rating-driven sizing. `edge`/`carried_value`/`role` drive _sized_dia_mm."""
    dia_mm = _sized_dia_mm(nm, mech, waypoints, edge, carried_value=carried_value,
                           role=role)
    if mech == "electrical_bus":
        _draw_cable_tray(nm, waypoints, MAT, MO, dia_mm=dia_mm)
    else:
        fl.prim_pipe_run(nm, waypoints, dia_mm,
                         material=_mech_pipe_mat(mech, MAT),
                         flanges=True, connect=tuple(c for c in conn if c is not None),
                         module=pipe_module, module_objects=MO)
    if log:
        _route_log_add(nm, mech, waypoints, a_xyz, b_xyz, own_parts=own_parts)


def _spine_pt(rack_plan, along_v, slot):
    """The point ON this run's spine lane + tier at along-spine coordinate
    `along_v` (clamped into the spine span)."""
    a = rack_plan._clamp_along(along_v)
    off = rack_plan.lane_offset(slot)
    tz = rack_plan.tier_z(slot)
    if rack_plan.axis == "x":
        return (a, rack_plan.spine_pos + off, tz)
    return (rack_plan.spine_pos + off, a, tz)


# ═══════════════════════════════════════════════════════════════════════════
# PHASE D2 ACTUATION (scene side) — render the inserted sub-distribution + the
# re-routed step-down hierarchy. Pure logic is connection_sizing.size_d2_actuation;
# here we DRAW it (the box marker + the thin MV feeder + the short LV branches) and
# RECORD every re-sized spec in _CONN_SPECS so the schedule + cost pick them up.
# Gated by CONN_D2_ACTUATE (default OFF) at the call site.
# ═══════════════════════════════════════════════════════════════════════════

def _draw_presized_run(nm, mech, waypoints, spec, MAT, MO, pipe_module,
                       own_parts=()):
    """Draw ONE run at a PRE-SIZED ConnectionSpec's diameter (the D2-actuation re-sized
    feeder / busway / branch), record THAT spec in _CONN_SPECS (so it is scheduled +
    costed), and log it for the route audit. Mirrors _draw_run but does NOT re-size —
    the diameter + spec come from connection_sizing.size_d2_actuation, which already
    measured the right length per run (long MV feeder vs short LV branch)."""
    import copy
    s = copy.deepcopy(spec)
    # keep THIS polyline's measured length on the recorded spec (the actuation sized
    # it at the SAME length we route here, but record the exact rendered run length).
    s["length_m"] = round(_polyline_len_m(waypoints), 2)
    s["run_name"] = nm
    _CONN_SPECS.append(s)
    od = s.get("outer_dia_mm")
    if od is None or not (od > 0):
        od = CONN_FALLBACK_DIA_MM
    od = _render_dia_floor(od, mech)
    if mech == "electrical_bus":
        _draw_cable_tray(nm, waypoints, MAT, MO, dia_mm=od)
    else:
        fl.prim_pipe_run(nm, waypoints, od, material=_mech_pipe_mat(mech, MAT),
                         flanges=True, module=pipe_module, module_objects=MO)
    a_xy = (waypoints[0][0], waypoints[0][1])
    b_xy = (waypoints[-1][0], waypoints[-1][1])
    _route_log_add(nm, mech, waypoints, a_xy, b_xy, own_parts=own_parts)


def _emit_sub_distribution_box(nm, centre_xyz, sub_distribution, MAT, MO,
                               pipe_module):
    """Render the inserted SUB-DISTRIBUTION as a small panel/transformer kiosk box at
    `centre_xyz` (near the consumer cluster) and record it in _CONN_SPECS as a costed
    'transformer' row (priced by kVA via the existing connection_schedule path). The
    box SITS ON THE FLOOR (its base at z=0), between the source hub and the far
    consumers — a visible marker that the long LV run was re-designed into a step-down.
    Returns the top-centre point (the feeder lands here / the local busway leaves here).
    """
    w, d, h = SUBDIST_BOX_MM
    cx, cy = float(centre_xyz[0]), float(centre_xyz[1])
    base_z = 0.0
    loc = ((cx) * fl.MM, (cy) * fl.MM, (base_z + h / 2.0) * fl.MM)
    size = (w * fl.MM, d * fl.MM, h * fl.MM)
    mkey = "u_subdist_mat"
    if mkey not in MAT:
        MAT[mkey] = fl.make_mat("m_u_subdist", SUBDIST_COLOUR, metallic=0.3, roughness=0.5)
    fl.add_box(nm, loc, size, MAT[mkey], module=pipe_module, module_objects=MO)
    # Record a transformer spec so the schedule prints + costs the sub-distribution as
    # the packaged step-down unit it is (connection_schedule prices role=transformer by
    # kVA). Shape mirrors size_distribution_tree's `transformer` dict consumed there.
    sd_spec = cs._spec(
        kind="transformer", mechanism="electrical_bus",
        carried_rating=sub_distribution.get("transformer_kva"), carried_unit="kVA",
        size_label=(f"{sub_distribution.get('primary_voltage_v'):g}/"
                    f"{sub_distribution.get('secondary_voltage_v'):g} V sub-distribution"),
        outer_dia_mm=None, within_spec=True,
        spec_limit="step-down transformer (sub-distribution)",
        material_qty_desc=sub_distribution.get("note"),
        tool_used=sub_distribution.get("tool_used"),
        assumptions=["D2 ACTUATION: local sub-distribution inserted near the consumer "
                     "cluster — the long LV run is re-designed as MV feeder + short LV "
                     "branches (connection_sizing.size_d2_actuation)"],
        notes=sub_distribution.get("note"),
    )
    sd_spec["role"] = "transformer"
    sd_spec["from_part"] = "(primary)"
    sd_spec["to_part"] = "(secondary)"
    sd_spec["transformer_kva"] = sub_distribution.get("transformer_kva")
    sd_spec["primary_voltage_v"] = sub_distribution.get("primary_voltage_v")
    sd_spec["secondary_voltage_v"] = sub_distribution.get("secondary_voltage_v")
    sd_spec["primary_current_a"] = sub_distribution.get("primary_current_a")
    sd_spec["secondary_current_a"] = sub_distribution.get("secondary_current_a")
    sd_spec["run_name"] = nm
    _CONN_SPECS.append(sd_spec)
    return (cx, cy, base_z + h)


def _actuate_trunk_group(group, rack_plan, slot, rack_base_z, MAT, MO, pipe_module,
                         tag, trunk_spec, trunk_len_m):
    """D2 ACTUATION geometry: REPLACE an infeasible long-LV trunk fan-out with a
    step-down hierarchy that comes IN-SPEC —
      1. a SUB-DISTRIBUTION box near the consumer cluster centroid;
      2. ONE thin MV FEEDER from the source hub to the sub-distribution (sized for the
         total, stepped up to MV → low current → in-spec over the long haul);
      3. a SHORT LV local busway from the sub-distribution along the cluster;
      4. SHORT LV TAPS from the busway to each consumer.
    All re-sized by connection_sizing.size_d2_actuation (the pure logic) over the REAL
    LOCAL tap lengths, then drawn at those sizes + recorded in _CONN_SPECS. Returns the
    number of runs emitted (box + feeder + busway + N taps). Universal — keyed on the
    D2 condition, never archetype."""
    mech = group["mech"]
    origin = group["origin_xyz"]
    consumers = group["consumers"]
    along = rack_plan._along
    tz = rack_plan.tier_z(slot)

    # ── SUB-DISTRIBUTION placement: the consumer-cluster centroid (X,Y). It sits
    #    BETWEEN the source hub and the far consumers because the centroid of the
    #    consumers is, by construction, in the middle of the cluster the hub feeds.
    cxs = [float(c["xyz"][0]) for c in consumers]
    cys = [float(c["xyz"][1]) for c in consumers]
    sd_centre = (sum(cxs) / len(cxs), sum(cys) / len(cys))

    # ── The LV-side system voltage the consumers run at (for the actuation maths).
    #    Honour the D3 what-if knob so the forced-D2 demo runs at its 48 V; else read
    #    the trunk spec's own inferred system voltage.
    lv_v = trunk_spec.get("system_voltage_v") or cs.DEFAULT_SYSTEM_VOLTAGE_V
    _lv_knob = os.environ.get("CONN_TEST_LV_VOLTAGE_V")
    if _lv_knob:
        try:
            v = float(_lv_knob)
            if v > 0:
                lv_v = v
        except (TypeError, ValueError):
            pass

    # ── The REAL short local length of each tap = the routed sub-distribution→consumer
    #    distance (centroid box top → consumer drop), in metres. This is what makes the
    #    branches in-spec: they are genuinely local now.
    sd_top_xy = sd_centre
    branch_local_lengths = []
    for c in consumers:
        cx, cy, cz = (float(v) for v in c["xyz"])
        # over to the consumer's along-coord on the lane, cross, drop — same shape the
        # taps will actually take; its length is the local branch length.
        dx = abs(cx - sd_top_xy[0]); dy = abs(cy - sd_top_xy[1])
        local_len = (dx + dy) * fl.MM + (SUBDIST_BOX_MM[2] * fl.MM)  # +box height drop
        branch_local_lengths.append(max(0.5, local_len))

    # ── The local LV busway span = the cluster extent along the row, in metres.
    cons_al = [along(c["xyz"]) for c in consumers]
    busway_span_mm = (max(cons_al) - min(cons_al)) if len(cons_al) > 1 else 0.0
    local_busway_m = max(1.0, busway_span_mm * fl.MM)

    # ── Re-design (pure logic): the sub-distribution kVA, the MV feeder, the short
    #    LV busway + branches — all re-sized IN-SPEC.
    branch_edges = [c.get("edge") or {} for c in consumers]
    act = cs.size_d2_actuation(
        hub_edge=group.get("trunk_edge") or {},
        total_value=cs._f(trunk_spec.get("carried_rating")),
        branch_edges=branch_edges,
        long_haul_m=trunk_len_m,
        lv_voltage_v=lv_v,
        branch_local_lengths=branch_local_lengths,
        local_busway_m=local_busway_m,
        sub_distribution_name=f"{group['origin_nm']}_subdist",
    )

    emitted = 0
    # 1. SUB-DISTRIBUTION box at the cluster centroid.
    sd_nm = f"u_subdist_{tag}{slot}_{mech}"
    sd_top = _emit_sub_distribution_box(sd_nm, sd_centre, act["sub_distribution"],
                                        MAT, MO, pipe_module)
    emitted += 1

    # 2. FEEDER: source hub (origin) → sub-distribution top. Thin MV — routed on spine.
    feeder_a = (origin[0], origin[1], origin[2])
    feeder_b = (sd_top[0], sd_top[1], tz)
    feeder_wp = route_on_spine(rack_plan, slot, feeder_a, feeder_b,
                               a_abstract=True, b_abstract=True, own=())
    # land the feeder on the sub-distribution top.
    feeder_wp = list(feeder_wp) + [(sd_top[0], sd_top[1], sd_top[2])]
    feeder_nm = f"u_feeder_{tag}{slot}_{mech}"
    try:
        _draw_presized_run(feeder_nm, mech, feeder_wp, act["feeder"], MAT, MO,
                           pipe_module)
        emitted += 1
    except Exception as ex:  # noqa: BLE001
        print(f"[univ] D2 feeder {feeder_nm} FAILED: {ex}")

    # 3. LOCAL LV BUSWAY: sub-distribution → along the consumer row (short local span),
    #    on this group's lane + tier (parallel to other busways, no crossing).
    if act.get("local_busway") is not None:
        far_al = max(cons_al, key=lambda v: abs(v - along(sd_top)))
        if rack_plan.axis == "x":
            bus_a = (sd_top[0], sd_top[1], sd_top[2])
            bus_b = (rack_plan._clamp_along(far_al), sd_top[1], tz)
        else:
            bus_a = (sd_top[0], sd_top[1], sd_top[2])
            bus_b = (sd_top[0], rack_plan._clamp_along(far_al), tz)
        busway_wp = route_on_spine(rack_plan, slot, bus_a, bus_b,
                                   a_abstract=True, b_abstract=True, own=())
        busway_nm = f"u_localbus_{tag}{slot}_{mech}"
        try:
            _draw_presized_run(busway_nm, mech, busway_wp, act["local_busway"],
                               MAT, MO, pipe_module)
            emitted += 1
        except Exception as ex:  # noqa: BLE001
            print(f"[univ] D2 local busway {busway_nm} FAILED: {ex}")

    # 4. SHORT LV TAPS: the local busway → each consumer (over + cross + drop), each at
    #    its re-sized LOCAL branch spec.
    for k, c in enumerate(consumers):
        cx, cy, cz = (float(v) for v in c["xyz"])
        tap_on_bus = _spine_pt(rack_plan, along(c["xyz"]), slot)
        if rack_plan.axis == "x":
            raw = [tap_on_bus, (cx, tap_on_bus[1], tz), (cx, cy, tz), (cx, cy, cz)]
        else:
            raw = [tap_on_bus, (tap_on_bus[0], cy, tz), (cx, cy, tz), (cx, cy, cz)]
        tap_wp = [raw[0]]
        for p in raw[1:]:
            if max(abs(p[0] - tap_wp[-1][0]), abs(p[1] - tap_wp[-1][1]),
                   abs(p[2] - tap_wp[-1][2])) > 1.0:
                tap_wp.append(p)
        tap_nm = f"u_subtap_{tag}{slot}_{mech}_{k}"
        try:
            _draw_presized_run(tap_nm, mech, tap_wp, act["branches"][k], MAT, MO,
                               pipe_module, own_parts=(c.get("pb"),))
            emitted += 1
        except Exception as ex:  # noqa: BLE001
            print(f"[univ] D2 sub-tap {tap_nm} FAILED: {ex}")

    res = "RESOLVED (0 out-of-spec)" if act.get("resolved") else "PARTIAL"
    sd = act["sub_distribution"]
    print(f"[univ][D2-ACTUATE] {tag}{slot} ({mech}): inserted {group['origin_nm']}"
          f"_subdist {sd['transformer_kva']:g} kVA {sd['primary_voltage_v']:g}V→"
          f"{sd['secondary_voltage_v']:g}V near cluster; feeder "
          f"{act['feeder']['size_label']} (Vd {act['feeder']['drop_pct_or_velocity']}%) "
          f"+ {len(consumers)} short LV branches — {res}")
    return emitted


def _actuate_passthrough_run(r, waypoints, rack_plan, slot, rack_base_z, MAT, MO,
                             pipe_module, tag, edge_i, run_spec):
    """D2 ACTUATION for a SINGLE long-LV passthrough electrical run (a point-to-point
    edge, NOT a fan-out): insert a sub-distribution NEAR THE DESTINATION, run a thin MV
    feeder from the source to it, and ONE short LV branch from the sub-distribution to
    the destination. Resolves the infeasible long run in-spec. Returns runs emitted
    (box + feeder + branch). Mirrors _actuate_trunk_group with a single consumer."""
    mech = r["mech"]
    a_xyz, b_xyz = r["a_xyz"], r["b_xyz"]
    edge = r.get("edge") or {}
    # SUB-DISTRIBUTION near the DESTINATION (b). Offset it slightly back toward the
    # source so it sits BETWEEN source and load (not inside the destination part).
    sd_centre = (0.85 * float(b_xyz[0]) + 0.15 * float(a_xyz[0]),
                 0.85 * float(b_xyz[1]) + 0.15 * float(a_xyz[1]))

    lv_v = run_spec.get("system_voltage_v") or cs.DEFAULT_SYSTEM_VOLTAGE_V
    _lv_knob = os.environ.get("CONN_TEST_LV_VOLTAGE_V")
    if _lv_knob:
        try:
            v = float(_lv_knob)
            if v > 0:
                lv_v = v
        except (TypeError, ValueError):
            pass

    total = cs._f(run_spec.get("carried_rating"))
    long_haul_m = _polyline_len_m(waypoints)
    # the one branch's REAL short local length = sub-distribution → destination.
    dx = abs(float(b_xyz[0]) - sd_centre[0]); dy = abs(float(b_xyz[1]) - sd_centre[1])
    local_len = max(0.5, (dx + dy) * fl.MM + SUBDIST_BOX_MM[2] * fl.MM)

    act = cs.size_d2_actuation(
        hub_edge=edge,
        total_value=total,
        branch_edges=[edge],
        long_haul_m=long_haul_m,
        lv_voltage_v=lv_v,
        branch_local_lengths=[local_len],
        local_busway_m=None,   # single consumer → no separate local busway
        sub_distribution_name=f"{r.get('b_nm') or 'load'}_subdist",
    )

    emitted = 0
    tz = rack_plan.tier_z(slot) if rack_plan is not None else rack_base_z
    sd_nm = f"u_subdist_{tag}{edge_i}_{mech}"
    sd_top = _emit_sub_distribution_box(sd_nm, sd_centre, act["sub_distribution"],
                                        MAT, MO, pipe_module)
    emitted += 1

    # FEEDER: source (a) → sub-distribution top (thin MV).
    feeder_a = (float(a_xyz[0]), float(a_xyz[1]), float(a_xyz[2]))
    if rack_plan is not None:
        feeder_wp = route_on_spine(rack_plan, slot, feeder_a,
                                   (sd_top[0], sd_top[1], tz),
                                   a_abstract=r.get("a_abstract", False),
                                   b_abstract=True, own=())
    else:
        feeder_wp = route_rack(feeder_a, (sd_top[0], sd_top[1], tz), rack_base_z)
    feeder_wp = list(feeder_wp) + [(sd_top[0], sd_top[1], sd_top[2])]
    feeder_nm = f"u_feeder_{tag}{edge_i}_{mech}"
    try:
        _draw_presized_run(feeder_nm, mech, feeder_wp, act["feeder"], MAT, MO,
                           pipe_module, own_parts=(r.get("pa"),))
        emitted += 1
    except Exception as ex:  # noqa: BLE001
        print(f"[univ] D2 passthrough feeder {feeder_nm} FAILED: {ex}")

    # SHORT LV BRANCH: sub-distribution → destination (b).
    branch_b = (float(b_xyz[0]), float(b_xyz[1]), float(b_xyz[2]))
    br_wp = [(sd_top[0], sd_top[1], sd_top[2]),
             (sd_top[0], sd_top[1], tz),
             (branch_b[0], branch_b[1], tz),
             branch_b]
    dedup = [br_wp[0]]
    for p in br_wp[1:]:
        if max(abs(p[0] - dedup[-1][0]), abs(p[1] - dedup[-1][1]),
               abs(p[2] - dedup[-1][2])) > 1.0:
            dedup.append(p)
    branch_nm = f"u_subbranch_{tag}{edge_i}_{mech}"
    try:
        _draw_presized_run(branch_nm, mech, dedup, act["branches"][0], MAT, MO,
                           pipe_module, own_parts=(r.get("pb"),))
        emitted += 1
    except Exception as ex:  # noqa: BLE001
        print(f"[univ] D2 passthrough branch {branch_nm} FAILED: {ex}")

    sd = act["sub_distribution"]
    res = "RESOLVED (0 out-of-spec)" if act.get("resolved") else "PARTIAL"
    print(f"[univ][D2-ACTUATE] {tag}{edge_i} ({mech}) passthrough {r['a_nm']}→{r['b_nm']}: "
          f"inserted {sd['transformer_kva']:g} kVA {sd['primary_voltage_v']:g}V→"
          f"{sd['secondary_voltage_v']:g}V near load; feeder {act['feeder']['size_label']} "
          f"(Vd {act['feeder']['drop_pct_or_velocity']}%) + 1 short LV branch "
          f"{act['branches'][0]['size_label']} (Vd {act['branches'][0]['drop_pct_or_velocity']}%) "
          f"— {res}")
    return emitted


def _emit_trunk_group(group, rack_plan, slot, rack_base_z, MAT, MO, pipe_module,
                      tag):
    """Emit ONE fan-out group as a HEADER/BUSWAY: a single TRUNK along the row of
    consumers (on this group's own spine lane + tier) + a SHORT orthogonal TAP
    from the trunk to EACH consumer (over the spine to the consumer's along-coord,
    cross to the consumer, drop). NOT N full runs back to the hub.

    The trunk runs from the ORIGIN (hub for a supply, collector for a return) ALONG
    the spine to the FARTHEST consumer's along-coord. Each tap leaves the trunk at
    the point on the lane NEAREST its consumer — a short over + cross + drop. The
    whole busway sits on ONE lane + ONE tier so SUPPLY and RETURN trunks (different
    mechanisms) are parallel, never crossing. Returns the number of runs emitted."""
    mech = group["mech"]
    origin = group["origin_xyz"]
    consumers = group["consumers"]
    emitted = 0
    if rack_plan is None:
        # No spine to thread a trunk down → fall back to per-consumer runs (legacy).
        for k, c in enumerate(consumers):
            nm = f"u_route_{tag}trunk{slot}_{mech}_tap{k}"
            wp = route_rack(origin, c["xyz"], rack_base_z + RACK_TIER_PITCH_MM * (k % 4))
            try:
                _draw_run(nm, mech, wp, origin, c["xyz"], MAT, MO, pipe_module,
                          edge=c.get("edge"), role="branch")
                emitted += 1
            except Exception as ex:  # noqa: BLE001
                print(f"[univ] trunk tap {nm} FAILED: {ex}")
        return emitted

    along = rack_plan._along
    o_al = along(origin)
    cons_al = [along(c["xyz"]) for c in consumers]
    # the trunk spans from the origin's along-coord to the FARTHEST consumer along
    # the row (so it physically runs ALONG the whole row of consumers).
    far_al = max(cons_al + [o_al], key=lambda v: abs(v - o_al))
    tz = rack_plan.tier_z(slot)
    o_far_pt = (origin[0], origin[1], origin[2])
    # a synthetic far end at the spine cross-position + the farthest along-coord,
    # at the origin's own cross-coord projected onto the row — used only to drive
    # route_on_spine so the trunk gets the riser→spine-lane→along-row geometry.
    if rack_plan.axis == "x":
        far_pt = (rack_plan._clamp_along(far_al), origin[1], tz)
    else:
        far_pt = (origin[0], rack_plan._clamp_along(far_al), tz)
    # TRUNK: origin → along the row to the far end, on this group's lane + tier.
    # Both ends abstract = route straight onto the spine lane (no own-bbox).
    trunk_wp = route_on_spine(rack_plan, slot, o_far_pt, far_pt,
                              a_abstract=True, b_abstract=True, own=())
    trunk_nm = f"u_trunk_{tag}{slot}_{mech}"

    # ── PHASE D2 ACTUATION (gated, default OFF) ──────────────────────────────────
    # If this is an ELECTRICAL fan-out whose trunk is a D2 case (a long high-current
    # LV run size_connection_to_spec can only RECOMMEND re-designing), and actuation is
    # enabled, ACT: replace the infeasible long trunk + long taps with a sub-distribution
    # + thin MV feeder + short LV branches (all re-sized in-spec). The infeasible run is
    # gone; nothing below this block runs for this group.
    trunk_edge_for_d2 = group.get("trunk_edge")
    if (CONN_D2_ACTUATE and mech == "electrical_bus"
            and isinstance(trunk_edge_for_d2, dict)
            and trunk_edge_for_d2.get("required_value") is not None):
        try:
            trunk_len_m = _polyline_len_m(trunk_wp)
            # size the trunk to learn its D2 status (size_connection_to_spec honours the
            # CONN_TEST_LONG_RUN_M injection, so the forced-long case is recognised). Cheap:
            # the same call inside _draw_run would hit the sizing cache.
            t_eval = cs.size_connection_to_spec(dict(trunk_edge_for_d2), trunk_len_m,
                                                carried_value=None)
            if cs.d2_actuation_applicable(t_eval):
                return _actuate_trunk_group(group, rack_plan, slot, rack_base_z, MAT, MO,
                                            pipe_module, tag, t_eval, trunk_len_m)
        except Exception as ex:  # noqa: BLE001 — actuation must never crash the run;
            # fall through to the normal trunk+taps on any failure.
            print(f"[univ][D2-ACTUATE] {tag}{slot} ({mech}) actuation skipped: {ex}")

    try:
        # the TRUNK carries the SUMMED load (group['trunk_edge']) → renders FATTER
        # than any tap. role='trunk' for the schedule.
        _draw_run(trunk_nm, mech, trunk_wp, o_far_pt, far_pt, MAT, MO, pipe_module,
                  edge=group.get("trunk_edge"), role="trunk")
        emitted += 1
        print(f"[univ] TRUNK {tag}{slot} ({mech}): {group['origin_nm']} "
              f"busway along {len(consumers)} consumers")
    except Exception as ex:  # noqa: BLE001
        print(f"[univ] trunk {trunk_nm} FAILED: {ex}")
    # TAPS: short over + cross + drop from the trunk lane to each consumer. The tap
    # leaves the trunk at the consumer's OWN along-coord (so it is the shortest
    # branch), runs across to the consumer XY, then drops. Each is logged so the
    # over-equipment / crossing audit covers it; the consumer's own part bbox is
    # excluded (the drop lands on its own footprint).
    for k, c in enumerate(consumers):
        cx, cy, cz = (float(v) for v in c["xyz"])
        tap_on_trunk = _spine_pt(rack_plan, along(c["xyz"]), slot)
        if rack_plan.axis == "x":
            # trunk lane is at Y=spine_pos+off; go: trunk → over to consumer X (already
            # there) → cross in Y to consumer → drop. Build orthogonal waypoints.
            raw = [tap_on_trunk,
                   (cx, tap_on_trunk[1], tz),   # align in X over to the consumer's X
                   (cx, cy, tz),                # cross in Y to the consumer
                   (cx, cy, cz)]                # drop onto the consumer
        else:
            raw = [tap_on_trunk,
                   (tap_on_trunk[0], cy, tz),   # align in Y
                   (cx, cy, tz),                # cross in X
                   (cx, cy, cz)]                # drop
        tap_wp = [raw[0]]
        for p in raw[1:]:
            if max(abs(p[0] - tap_wp[-1][0]), abs(p[1] - tap_wp[-1][1]),
                   abs(p[2] - tap_wp[-1][2])) > 1.0:
                tap_wp.append(p)
        tap_nm = f"u_tap_{tag}{slot}_{mech}_{k}"
        try:
            # each TAP carries one consumer's share (c['edge'] = total/N) → thinner
            # than the trunk. role='branch' for the schedule.
            _draw_run(tap_nm, mech, tap_wp, (tap_on_trunk[0], tap_on_trunk[1]),
                      (cx, cy), MAT, MO, pipe_module, own_parts=(c.get("pb"),),
                      edge=c.get("edge"), role="branch")
            emitted += 1
        except Exception as ex:  # noqa: BLE001
            print(f"[univ] tap {tap_nm} FAILED: {ex}")
    return emitted


def _emit_routes_on_plan(resolved, rack_plan, rack_base_z, MAT, MO,
                         pipe_module="mass_fluid_transport_process", tag=""):
    """Shared PASS-2 emitter for EVERY family. `resolved` = list of edge dicts with
    keys i, mech, a_xyz, b_xyz, a_abstract, b_abstract, a_conn, b_conn, b_branch,
    pa, pb, a_nm, b_nm.

    TRUNK-AND-BRANCH (2026-06-11): the derived per-consumer fan-out edges are first
    grouped by group_fanout_trunks — a HUB feeding >= TRUNK_MIN_CONSUMERS consumers
    of one mechanism becomes ONE TRUNK (header/busway) along the row + a SHORT TAP
    to each consumer, instead of N independent full runs (the dense bundle). Each
    mechanism (DC bus / water-supply / water-return / coolant-supply / coolant-
    return / LED-power) gets its OWN trunk lane + tier (parallel, no crossing).
    PASSTHROUGH edges (single loads, BoP→BoP, hub→HVAC, the electrical-chain stages,
    collector→hub) keep the normal per-edge route. One trunk + N taps reads as a
    real busway; the route audit covers the trunk + every tap.

    Assigns lanes + tiers on `rack_plan` (one shot, one slot per trunk + one per
    passthrough edge). Returns (routed_count, unresolved)."""
    unresolved = []
    groups, passthrough = group_fanout_trunks(resolved)
    if groups:
        print(f"[univ][trunk] {len(groups)} fan-out group(s) → trunk+taps: "
              + ", ".join(f"{g['mech']}×{len(g['consumers'])}" for g in groups)
              + f"; {len(passthrough)} passthrough edge(s)")

    # SLOTS: one per passthrough edge, then one per trunk group. The lane/tier
    # assignment runs over ALL slots so every trunk + every passthrough gets a
    # distinct lane + tier (parallel busways, zero same-Z crossings).
    n_pass = len(passthrough)
    if rack_plan is not None and (passthrough or groups):
        intervals = []
        for r in passthrough:
            a_al = rack_plan._clamp_along(rack_plan._along(r["a_xyz"]))
            b_al = rack_plan._clamp_along(rack_plan._along(r["b_xyz"]))
            intervals.append((min(a_al, b_al), max(a_al, b_al)))
        for g in groups:
            o_al = rack_plan._clamp_along(rack_plan._along(g["origin_xyz"]))
            c_al = [rack_plan._clamp_along(rack_plan._along(c["xyz"]))
                    for c in g["consumers"]]
            lo, hi = min([o_al] + c_al), max([o_al] + c_al)
            intervals.append((lo, hi))
        rack_plan.assign(intervals)

    routed = 0
    # ── PASSTHROUGH edges: the existing per-edge direct-or-spine route. ──────────
    for slot, r in enumerate(passthrough):
        i, mech = r["i"], r["mech"]
        a_xyz, b_xyz = r["a_xyz"], r["b_xyz"]
        pa, pb = r.get("pa"), r.get("pb")
        # PER-EDGE WALL-CLOCK BUDGET: record the start time so the try-block below
        # can detect if waypoint computation + Blender geometry creation exceeds
        # EDGE_ROUTER_BUDGET_S. Checked at the first draw call; if overrun the edge
        # falls back to a minimal straight-line route instead of hanging. This is the
        # universal guard against pathological edges (e.g. very long cross-plant runs
        # that generate hundreds of cable-tray rung objects on a large scene).
        _edge_t0 = time.monotonic()
        if rack_plan is not None:
            own_bb = [bb for bb in (part_xy_bbox_mm(pa) if pa else None,
                                    part_xy_bbox_mm(pb) if pb else None)
                      if bb is not None]
            # SHORT LOCAL edge between two concrete nearby parts → try a direct L
            # jumper first (no detour to the central spine); only if that L would
            # CLIP other equipment do we fall back to the shared spine. Long edges
            # and abstract endpoints always take the spine.
            straight = math.hypot(b_xyz[0] - a_xyz[0], b_xyz[1] - a_xyz[1])
            waypoints = None
            if (not r["a_abstract"] and not r["b_abstract"]
                    and straight <= RACK_DIRECT_MAX_MM):
                waypoints = _direct_route(rack_plan, slot, a_xyz, b_xyz, own_bb)
            if waypoints is None:
                waypoints = route_on_spine(rack_plan, slot, a_xyz, b_xyz,
                                           r["a_abstract"], r["b_abstract"], own=own_bb)
        else:   # no layout to thread a spine through → legacy per-pipe route
            waypoints = route_rack(a_xyz, b_xyz,
                                   rack_base_z + RACK_TIER_PITCH_MM * (slot % 4))
        # Check budget after waypoint computation (before any Blender mesh ops).
        # If the routing itself already took too long, replace with a minimal
        # two-point fallback so the drawing step runs fast.
        if time.monotonic() - _edge_t0 > EDGE_ROUTER_BUDGET_S:
            print(f"[univ] WARN edge {tag}{i} fell back to straight-line "
                  f"(router budget exceeded in waypoint computation — "
                  f"{time.monotonic() - _edge_t0:.1f}s > {EDGE_ROUTER_BUDGET_S}s): "
                  f"{r.get('a_nm')} -> {r.get('b_nm')}")
            tz_fb = rack_plan.tier_z(slot) if rack_plan is not None else \
                (rack_base_z + RACK_TIER_PITCH_MM * (slot % 4))
            waypoints = [a_xyz, (a_xyz[0], a_xyz[1], tz_fb),
                         (b_xyz[0], b_xyz[1], tz_fb), b_xyz]
        nm = f"u_route_{tag}{i}_{mech}"
        try:
            # ── PHASE D2 ACTUATION on a PASSTHROUGH electrical run (gated, default OFF).
            # A single long high-current LV point-to-point run (e.g. rack_block→pcs at
            # 1953 A / 300 m / 48 V) is a D2 case too; ACT on it — insert a sub-distribution
            # near the DESTINATION, feed it thin MV from the source, short LV branch to the
            # one consumer. Resolves the run in-spec; nothing below runs for this edge.
            if (CONN_D2_ACTUATE and mech == "electrical_bus"
                    and isinstance(r.get("edge"), dict)
                    and r["edge"].get("required_value") is not None):
                t_eval = cs.size_connection_to_spec(dict(r["edge"]),
                                                    _polyline_len_m(waypoints))
                if cs.d2_actuation_applicable(t_eval):
                    n_act = _actuate_passthrough_run(
                        r, waypoints, rack_plan, slot, rack_base_z, MAT, MO,
                        pipe_module, tag, i, t_eval)
                    routed += n_act
                    continue
            # SIZE this passthrough run at its REAL diameter from the edge rating (the
            # raw topology edge carried on the resolved dict). One size for the whole
            # run; the cable tray / pipe both honour it.
            dia_mm = _sized_dia_mm(nm, mech, waypoints, r.get("edge"))
            # BUDGET CHECK before the Blender geometry draw (the geometry creation can
            # itself hang on a large scene with a very long cable-tray leg producing
            # hundreds of bpy.ops rung objects). If the edge has already consumed its
            # budget (routing + sizing), replace waypoints with a minimal fallback NOW
            # so the draw step is always fast. This is the outer guard; CABLE_TRAY_MAX_RUNGS
            # is the inner guard that caps each individual leg's rung count.
            _elapsed = time.monotonic() - _edge_t0
            if _elapsed > EDGE_ROUTER_BUDGET_S:
                print(f"[univ] WARN edge {tag}{i} fell back to straight-line "
                      f"(router budget exceeded before draw — "
                      f"{_elapsed:.1f}s > {EDGE_ROUTER_BUDGET_S}s): "
                      f"{r.get('a_nm')} -> {r.get('b_nm')}")
                tz_fb = rack_plan.tier_z(slot) if rack_plan is not None else \
                    (rack_base_z + RACK_TIER_PITCH_MM * (slot % 4))
                waypoints = [a_xyz, (a_xyz[0], a_xyz[1], tz_fb),
                             (b_xyz[0], b_xyz[1], tz_fb), b_xyz]
            if mech == "electrical_bus":
                _draw_cable_tray(nm, waypoints, MAT, MO, dia_mm=dia_mm)
                # branch drops to the top matched loads — TAP off the spine at the
                # point NEAREST each load (short lateral + drop), not the run end.
                for j, drop in enumerate(r.get("b_branch", [])):
                    if rack_plan is not None:
                        bwp = [_spine_pt(rack_plan, drop[0] if rack_plan.axis == "x"
                                         else drop[1], slot),
                               (drop[0], drop[1],
                                rack_plan.tier_z(slot)), drop]
                    else:
                        bwp = route_rack((waypoints[-1][0], waypoints[-1][1],
                                          waypoints[-1][2]), drop, rack_base_z)
                    _draw_cable_tray(f"{nm}_branch{j}", bwp, MAT, MO, dia_mm=dia_mm)
                _route_log_add(nm, mech, waypoints, a_xyz, b_xyz, own_parts=(pa, pb))
                routed += 1
                print(f"[univ] routed edge {tag}{i} ({mech}) CABLE-TRAY: "
                      f"{r['a_nm']}  ->  {r['b_nm']}  "
                      f"(+{len(r.get('b_branch', []))} load drops)")
            else:
                conn = tuple(c for c in (r.get("a_conn"), r.get("b_conn"))
                             if c is not None)
                fl.prim_pipe_run(nm, waypoints, dia_mm,
                                 material=_mech_pipe_mat(mech, MAT),
                                 flanges=True, connect=conn,
                                 module=pipe_module, module_objects=MO)
                _route_log_add(nm, mech, waypoints, a_xyz, b_xyz, own_parts=(pa, pb))
                routed += 1
                print(f"[univ] routed edge {tag}{i} ({mech}): "
                      f"{r['a_nm']}  ->  {r['b_nm']}")
        except Exception as ex:  # noqa: BLE001 — never let one bad route kill the run
            unresolved.append((r["a_nm"], r["b_nm"], mech, [f"route_error:{ex}"]))
            print(f"[univ] edge {tag}{i} route FAILED: {ex}")

    # ── TRUNK GROUPS: ONE busway + N short taps per fan-out group. ───────────────
    for gi, g in enumerate(groups):
        slot = n_pass + gi
        try:
            routed += _emit_trunk_group(g, rack_plan, slot, rack_base_z,
                                        MAT, MO, pipe_module, tag)
        except Exception as ex:  # noqa: BLE001
            print(f"[univ] trunk group {gi} ({g['mech']}) FAILED: {ex}")
    return routed, unresolved


# ═══════════════════════════════════════════════════════════════════════════
# GEOMETRY-FAMILY STRATEGIES — place_process_plant (default) + place_rack_farm
# ───────────────────────────────────────────────────────────────────────────
# Both strategies take the SAME signature and return the SAME tuple so main()
# can dispatch on the family and keep the INSPECT/PDF render + summary common:
#   (bbox_mm, region_centres, frame_top_mm, routed, unresolved)
# place_process_plant is the verbatim original pipeline (regions on an open
# braced skid + overhead pipe rack); place_rack_farm is the BESS pipeline (rows
# of battery racks in a container + a balance-of-plant lineup + coolant/bus runs).
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1 — DETERMINISTIC LINEAR LAYOUT (BLENDER_LINEAR_LAYOUT=1)
# ───────────────────────────────────────────────────────────────────────────
# Lay EVERY part in ONE straight row along +X, ordered by process sequence, then
# return the SAME 5-tuple as the family placers so main()'s manifests + inspect
# render are common. This is STAGE 1 of Tristan's 4-stage connection-points plan:
#   (1) correct parts, all in one line in process order   ← THIS function
#   (2) add connection ports        (3) wire port-to-port
#   (4) fold the line into a compact layout
# So it deliberately builds NO skid frame, NO pipe rack and routes NO topology —
# those are the later (fold/wire) stages. It reuses build_part verbatim (the part
# GEOMETRY / materials / lighting are GOOD and unchanged) and only sets each
# part's POSITION. Universal: pure sort-by-rank + lay-in-X, no per-class logic.
# ═══════════════════════════════════════════════════════════════════════════
def _linear_sort_key(p):
    """Stable process-order key: region_rank ascending (upstream→downstream),
    then a deterministic tie-break so two parts at the same rank always land in
    the same order across runs. The tie-break is the part's tag/identity — its
    module_id + region_key + lower-cased name — so the row is byte-reproducible."""
    rank = int(getattr(p, "region_rank", REGION_PRIORITY_DEFAULT) or REGION_PRIORITY_DEFAULT)
    tag = f"{getattr(p, 'module_id', '')}|{getattr(p, 'region_key', '')}|{str(p.name).lower()}"
    return (rank, tag)


def place_all_linear(parts, MAT, MO):
    """STAGE 1 linear override. Sort parts by (region_rank, tag) and place each
    sequentially along +X, centred on the Y axis (y=0), sitting on the deck datum
    (z=DECK_Z_MM, the same floor the production placers use), with NO overlap:
    the X cursor advances by half the previous footprint + LINEAR_PART_GAP_MM +
    half this footprint. Returns (bbox_mm, region_centres, frame_top_mm=0,
    routed=0, unresolved=[]) — the family-placer tuple, but with no frame / rack /
    routing (Stage 1 only). Each part keeps its exact geometry; only its position
    changes. Reserves the FULL footprint (footprint_mm already accounts for a
    qty-N vessel/machine grid) so a replicated array never overlaps its neighbour.

    BUILDING-SHELL EXCLUSION: the plant-scale envelope shells (floor slab / portal
    frame / wall + roof cladding / foundations — `_layout_is_envelope`, the SAME
    test production uses) are NOT laid in the row. They are 25-29 m squares that
    would dwarf every process part and make the "row of parts in order" unreadable;
    production never lays them in-line either — it re-centres them on the finished
    equipment so they ENCLOSE the plant. We do the same: place each shell CENTRED on
    the row's bbox AFTER the row is built (still placed, still in the BoM, just not a
    giant in-line square). Universal + deterministic (footprint-keyed, no per-class)."""
    row_parts = [p for p in parts if not _layout_is_envelope(p)]
    shell_parts = [p for p in parts if _layout_is_envelope(p)]
    ordered = sorted(row_parts, key=_linear_sort_key)
    region_centres = {}
    x_cursor = 0.0
    prev_half_x = None
    n_placed = 0
    print(f"[univ][linear] STAGE 1 linear layout ON — {len(ordered)} process parts in "
          f"ONE row along +X (sorted by region_rank, then tag); gap "
          f"{LINEAR_PART_GAP_MM/1000:.1f} m; NO frame/rack/routing"
          + (f"; {len(shell_parts)} building-shell part(s) centred on the row (NOT "
             f"in-line)" if shell_parts else ""))
    for p in ordered:
        fx, fy, _fz = footprint_mm(resolved_dims_mm(p))
        half_x = fx / 2.0
        if prev_half_x is None:
            x_cursor = half_x            # first part: its centre is half its width in
        else:
            x_cursor += prev_half_x + LINEAR_PART_GAP_MM + half_x
        # build the part at (x_cursor, y=0) on the deck floor — geometry untouched.
        asm, anchors = build_part(p, x_cursor, 0.0, DECK_Z_MM, MAT, MO)
        p.obj_anchor, p.anchors = asm, anchors
        p.placed_xyz_mm = anchors["centre"]
        # one "region centre" per region_key (first part seen in that region wins) so
        # the manifest's region map still resolves; in a single row this is indicative.
        region_centres.setdefault(p.region_key, (x_cursor, 0.0))
        print(f"[univ][linear]   #{n_placed:02d} rank={int(getattr(p,'region_rank',0)):>3} "
              f"x={x_cursor/1000:7.2f} m  fp={fx/1000:.2f}×{fy/1000:.2f} m  "
              f"[{p.module_id}] {p.name}")
        prev_half_x = half_x
        n_placed += 1

    # ROW bbox from the placed PROCESS-part EXTENTS (centre ± half-footprint per
    # axis) so the inspect cameras frame the WHOLE row + its depth.
    min_x, max_x = 1e12, -1e12
    min_y, max_y = 1e12, -1e12
    for p in ordered:
        if not p.placed_xyz_mm:
            continue
        cx, cy = p.placed_xyz_mm[0], p.placed_xyz_mm[1]
        fx, fy, _ = footprint_mm(resolved_dims_mm(p))
        min_x = min(min_x, cx - fx / 2); max_x = max(max_x, cx + fx / 2)
        min_y = min(min_y, cy - fy / 2); max_y = max(max_y, cy + fy / 2)
    if max_x < -1e11:                      # no process parts placed (degenerate)
        min_x = max_x = min_y = max_y = 0.0
    print(f"[univ][linear] process-row bbox (mm): x0={min_x:.0f} x1={max_x:.0f} "
          f"(length {(max_x-min_x)/1000:.1f} m × depth {(max_y-min_y)/1000:.1f} m, "
          f"{n_placed} parts)")
    # BUILDING-SHELL parts: RECORD each CENTRED on the finished process row WITHOUT a
    # solid mesh — exactly production's treatment (it notes the shell is already
    # represented by the enclosing skid-frame wireframe, so drawing its 850 m² solid
    # slab would only OBSCURE the equipment in every view). The part is still placed
    # (placed_xyz_mm set → it appears in the parts-manifest + BoM); it is simply not a
    # giant in-line square that would swamp the row. The bbox is NOT extended to the
    # shell footprint here — the process ROW is the subject the cameras frame.
    if shell_parts and max_x > -1e11:
        scx = (min_x + max_x) / 2.0
        scy = (min_y + max_y) / 2.0
        for p in shell_parts:
            p.placed_xyz_mm = (scx, scy, DECK_Z_MM)
            p.anchors = _box_anchors(scx, scy, DECK_Z_MM, 0.0)
            region_centres.setdefault(p.region_key, (scx, scy))
            fx, fy, _ = footprint_mm(resolved_dims_mm(p))
            print(f"[univ][linear]   shell (centred, no mesh) "
                  f"fp={fx/1000:.1f}×{fy/1000:.1f} m  [{p.module_id}] {p.name}")
    bbox = {"x0": min_x - 800, "x1": max_x + 800,
            "y0": min_y - 800, "y1": max_y + 800}
    print(f"[univ][linear] full bbox (mm): {bbox}")
    # frame_top=0, routed=0, unresolved=[] — Stage 1 builds none of those.
    return bbox, region_centres, 0.0, 0, []


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2 — NAMED IN/OUT CONNECTION PORTS (4-stage connection-points plan)
# ───────────────────────────────────────────────────────────────────────────
# Stage 1 laid every part in process order; Stage 2 (this) gives EACH placed part
# its named connection PORTS — one per distinct (service, direction) the LEDGER says
# the part has — positioned on the part's SURFACE from its placed centre + footprint,
# and STORED as durable coordinates on the part (`p.ports`) so Stage 3 can wire the
# line port-to-port and Stage 4 can fold it. It does NOT route any pipe (Stage 3) or
# move any part (Stage 4) — it only ADDS short stubs / small terminal markers + records
# their tip/face coordinates.
#
# UNIVERSAL + LAYOUT-AGNOSTIC: ports derive ONLY from (a) the ledger adjacency for the
# part's NAME (its inputs[]/outputs[] services) and (b) the part's placed centre + dims.
# It therefore works under BOTH place_all_linear AND the production family placers, and
# on ANY archetype — a part with only a power tie gets only a power terminal, a
# flow-through process part gets water in + out, a gas source gets an O₂/air nozzle, etc.
# No RAS-only / per-class hardcoding.
#
# PORT GEOMETRY by service + direction (so an IN and an OUT never share a face):
#   • water / process  — IN on the −X wall, OUT on the +X wall, at the shell (opposite
#     faces, the natural left→right process through-flow). For a TANK/vertical vessel the
#     OUT drops to a bottom-draw elevation and the IN sits high (top-return), per a real
#     recirc tank. Fluid ports use _spawn_nozzle_stub → the flanged look + the stub TIP.
#   • thermal          — like water but on the ±Y faces (so a thermal loop's ports never
#     collide with the ±X process water ports on the same vessel).
#   • oxygen / air     — an UPPER side nozzle on the +Y face near the top head (a gas
#     header tie-in), IN vs OUT offset along +Y so two gas ports don't overlap.
#   • power            — a SMALL terminal box LOW on the −Y face (a clearly-small marker,
#     never a generic cube). IN vs OUT (rare) split low/high.
#   • signal           — a SMALL terminal box LOW on the +Y face (opposite power so the
#     instrument gland and the power gland read separately).
#   • assembly         — a mount/part-of relation, NOT a routable connection → no port.
#
# Object NAMING rides the part's own build_part prefix (`u_<slug>`) so (1) the Stage-4
# bank/CRAFT shifts move the ports WITH the part (they match the part prefix), and (2)
# the INSPECT recolour keys `_port_`/`_term_`/`_neck`/`_flange` to access-steel grey, so
# a port reads as deliberate steelwork, not an unmatched blob.
# ═══════════════════════════════════════════════════════════════════════════

# How far a port stub / terminal sits PROUD of the part's footprint wall [mm], so the
# stub clearly stands off the shell rather than buried in it.
PORT_STANDOFF_MM = 120.0
# Nominal bore [mm] a fluid port stub is drawn at when the ledger edge carries no size
# (Stage 3 re-sizes the real run; this is only the geometric stub neck). Deliberately
# modest so it reads as a tie-in point, not a fat process main.
PORT_FLUID_DIA_MM = 200.0
# Terminal marker box size [mm] — a SMALL junction/terminal box (≤0.3 m per the brief),
# clearly a terminal, never a generic equipment cube.
PORT_TERMINAL_MM = (260.0, 200.0, 240.0)
# Shapes whose default (edge-less) port is electrical (a small terminal), not fluid.
_PORT_ELECTRICAL_SHAPES = {"cabinet", "cabinet_small", "transformer_box", "box",
                           "instrument"}

# A DRY material-handling / storage / ancillary / door STATION — kit that consumes only
# POWER (a motor/drive/door operator), never a process fluid. Used by the no-ledger-edge
# port fallback so a dry station with no edges gets a POWER terminal, not a spurious
# water in/out (Tristan 2026-06-21: the 6 RAS dry stations — Feed Storage + Distribution,
# Grading/Harvest, Mortality Handling, Live-Fish Handling, Biosecurity, Roller/Personnel
# Doors — are power-only). UNIVERSAL — name-keyed handling/storage/door vocabulary, no
# class table; a genuine flow-through PROCESS part (tank/filter/pump) never matches.
_DRY_ANCILLARY_RE = re.compile(
    r"feed|grad|harvest|mortalit|live.?fish|biosecur|\bdoor|roller|personnel|"
    r"storage|handling|store\b|forklift|conveyor|hopper|loading|packing|crane|hoist",
    re.IGNORECASE)
# A WET-PROCESS station that ALSO carries a handling/storage word but genuinely moves a
# fluid/slurry (e.g. "Solids / Sludge Handling System", "Effluent Storage Tank") — it
# must KEEP its water ports, so it overrides the dry match. Narrow wet-stream vocabulary.
_WET_PROCESS_RE = re.compile(
    r"sludge|solids|slurry|effluent|waste.?water|sediment|backwash|brine|"
    r"\btank\b|reservoir|sump|clarifier|thicken|dewater|decant",
    re.IGNORECASE)


def _is_dry_ancillary(name):
    """A DRY material-handling / storage / ancillary / door STATION (power-only) — the
    no-edge port fallback's test. True when the name matches the dry-station vocabulary
    AND does NOT match a genuine wet-stream word (so a Sludge/Solids Handling unit, an
    Effluent Storage tank, etc. stay water). Universal, name-keyed, no class table."""
    n = str(name or "")
    return bool(_DRY_ANCILLARY_RE.search(n) and not _WET_PROCESS_RE.search(n))


def _terminal_marker(nm, face_xyz_mm, MAT, mod, MO, kind="power"):
    """A SMALL terminal/junction box marking a power or signal tie-in. The box is
    drawn CENTRED on `face_xyz_mm` (a point already stood a standoff proud of the
    part's wall) and that point is RETURNED as the cable-land coordinate Stage 3 uses.
    Universal: a fixed-small box (≤0.3 m) so it is unmistakably a terminal, never a
    generic equipment cube; coloured access-steel-grey by the INSPECT `_term_` rule."""
    w, d, h = PORT_TERMINAL_MM
    fx, fy, fz = (float(c) for c in face_xyz_mm)
    term_mat = _nozzle_mat(MAT)
    fl.add_box(f"{nm}_term_{kind}",
               (fx * fl.MM, fy * fl.MM, fz * fl.MM),
               (w * fl.MM, d * fl.MM, h * fl.MM),
               term_mat, module=mod, module_objects=MO)
    return (fx, fy, fz)


def _required_ports_for(part, adj_entry, wet_plant=True):
    """The set of (service, direction) ports a part needs, from its ledger adjacency.
    direction ∈ {"in","out"}. `adj_entry` = ledger adjacency[name] or None.
    Universal fallback when the part has NO ledger edges: on a WET / process-fluid
    plant a flow-through PROCESS part gets water in+out; a pure electrical/control
    part (or ANY part on a DRY plant — satellite/aero/BESS — with no fluid topology)
    gets a single power_in. `wet_plant` (M1, 2026-06-23) gates the water default on a
    PHYSICAL signal (fluid edges present), so a dry archetype never grows a spurious
    water in/out. Default True preserves the wet-plant behaviour for legacy callers."""
    wanted = []
    seen = set()

    def _add(svc, direction):
        if not svc or svc == "assembly":
            return                                    # assembly = mount, not a port
        key = (svc, direction)
        if key not in seen:
            seen.add(key)
            wanted.append(key)

    if adj_entry:
        for i in adj_entry.get("inputs", []) or []:
            _add(i.get("service"), "in")
        for o in adj_entry.get("outputs", []) or []:
            _add(o.get("service"), "out")
    if wanted:
        return wanted
    # ── no ledger edges → a sensible UNIVERSAL default by part character ──
    # A DRY material-handling / storage / ancillary / door STATION consumes only POWER
    # (a motor / drive / door operator), never a process fluid — give it a power feed,
    # NOT a spurious water in/out (Tristan 2026-06-21). Detected by the dry-station
    # vocabulary (handling / storage / door / feed / grading / mortality …) OR an
    # electrical SHAPE. A genuine flow-through PROCESS part with no edges still gets
    # water in+out. Universal — name/shape-keyed, no class table.
    if part.shape in _PORT_ELECTRICAL_SHAPES \
            or _is_dry_ancillary(getattr(part, "name", "")) \
            or not wet_plant:
        # cabinet / instrument / dry station → power feed; AND on a DRY plant (no fluid
        # topology) EVERY no-edge part defaults to power, never a spurious water in/out.
        _add("power", "in")
    else:
        _add("water", "in"); _add("water", "out")     # flow-through process default (WET plant)
    return wanted


def add_connection_ports(parts, MAT, MO, ledger_adj):
    """STAGE 2. Give EVERY placed part its named in/out connection ports + store each
    as a durable coordinate on the part (`p.ports`). Keys off the part's PLACED centre +
    footprint + the LEDGER adjacency only — so it is layout-agnostic (works under the
    Stage-1 linear row AND the production placers) and universal (no per-class logic).

    `ledger_adj` = the connection ledger's per-part adjacency dict (build_adjacency):
    {part_name: {"inputs":[{from,mechanism,service}], "outputs":[{to,...}]}}. The dict is
    keyed by the SAME resolved part names as Part.name, so the lookup is exact.

    For each part it computes the required (service, direction) ports, positions each on
    the part's surface by service+direction, draws a flanged stub (fluid) or a small
    terminal box (power/signal), and records the stub-TIP / terminal-face point in
    p.ports[f"{service}_{dir}"]. Returns (n_parts_with_ports, n_ports_total)."""
    adj = ledger_adj or {}
    n_with, n_ports = 0, 0
    # WET-plant signal (M1, 2026-06-23): the design has a process-FLUID topology iff any
    # ledger adjacency edge is a water/fluid service. On a DRY plant (satellite / aero /
    # BESS — zero fluid edges) the no-edge port fallback defaults to POWER, not a spurious
    # water in/out. Physical signal (ledger fluid edges), never an archetype-name string.
    def _adj_has_water(entry):
        for d in ("inputs", "outputs"):
            for e in (entry.get(d) or []):
                if str(e.get("service") or "").lower() == "water":
                    return True
        return False
    wet_plant = any(_adj_has_water(e) for e in adj.values())
    for p in parts:
        if not getattr(p, "placed_xyz_mm", None):
            continue                                  # never placed → nothing to port
        # building-shell envelope parts carry no mesh in the layout (placed centred, no
        # solid) → they are not a connectable process item; skip (no port, no record).
        if _layout_is_envelope(p):
            continue
        wanted = _required_ports_for(p, adj.get(p.name), wet_plant)
        if not wanted:
            continue
        # placed footprint extents (mm) → port positions on the walls. footprint_mm
        # already reserves a qty-N grid; for ports we want the SINGLE-unit shell, so
        # take the per-unit footprint (the representative instance the routing uses).
        rd = resolved_dims_mm(p)
        rd_unit = dict(rd); rd_unit["_qty"] = 1
        fx, fy, h = footprint_mm(rd_unit)
        cx, cy, _cz = p.placed_xyz_mm
        anc = p.anchors or _box_anchors(cx, cy, DECK_Z_MM, h)
        z_top = anc.get("top", (cx, cy, DECK_Z_MM + h))[2]
        z_bot = anc.get("bottom", (cx, cy, DECK_Z_MM))[2]
        z_ctr = anc.get("centre", (cx, cy, DECK_Z_MM + h * 0.5))[2]
        hx, hy = fx / 2.0, fy / 2.0
        is_vessel = p.shape in _VESSEL_KIND
        nm = _part_prefix(p.name)
        prt = {}
        # offsets so two ports of the SAME service+face (e.g. a gas in AND out, or a
        # power in AND out) don't land on top of each other.
        gas_seen = 0
        pwr_seen = 0
        sig_seen = 0
        for svc, direction in wanted:
            pkey = f"{svc}_{direction}"
            if pkey in prt:                           # already placed this exact port
                continue
            if svc in ("water", "thermal"):
                # process fluid: IN/OUT on OPPOSITE faces. water on ±X, thermal on ±Y so
                # the two services never collide on the same vessel.
                if svc == "water":
                    sign = -1.0 if direction == "in" else 1.0
                    base_x = cx + sign * (hx + PORT_STANDOFF_MM)
                    if is_vessel:
                        # tank/vessel: bottom-DRAW out, top-RETURN in (a real recirc tank)
                        z = (z_bot + (z_ctr - z_bot) * 0.30) if direction == "out" \
                            else (z_ctr + (z_top - z_ctr) * 0.55)
                    else:
                        z = z_ctr
                    tip = _spawn_nozzle_stub(f"{nm}_port_{pkey}", (base_x, cy, z),
                                             (sign, 0.0, 0.0), PORT_FLUID_DIA_MM,
                                             MAT, mod=p.module_id, MO=MO)
                else:  # thermal on ±Y
                    sign = -1.0 if direction == "in" else 1.0
                    base_y = cy + sign * (hy + PORT_STANDOFF_MM)
                    tip = _spawn_nozzle_stub(f"{nm}_port_{pkey}", (cx, base_y, z_ctr),
                                             (0.0, sign, 0.0), PORT_FLUID_DIA_MM,
                                             MAT, mod=p.module_id, MO=MO)
                prt[pkey] = tuple(float(c) for c in tip)
            elif svc in ("oxygen", "air"):
                # gas header tie-in: an UPPER nozzle on the +Y face near the top head.
                # stagger successive gas ports along +Y so in/out (or O₂+air) separate.
                off = gas_seen * (PORT_FLUID_DIA_MM * 2.2)
                gas_seen += 1
                base_y = cy + hy + PORT_STANDOFF_MM
                z = z_ctr + (z_top - z_ctr) * 0.60
                tip = _spawn_nozzle_stub(
                    f"{nm}_port_{pkey}", (cx + off, base_y, z),
                    (0.0, 1.0, 0.0), PORT_FLUID_DIA_MM * 0.8,
                    MAT, mod=p.module_id, MO=MO)
                prt[pkey] = tuple(float(c) for c in tip)
            elif svc == "power":
                # SMALL terminal box low on the −Y face. in low / out (rare) a touch higher.
                z = z_bot + (z_ctr - z_bot) * (0.25 + 0.30 * pwr_seen)
                pwr_seen += 1
                # land the terminal low on the −Y wall, a standoff proud of the shell.
                face = (cx - hx * 0.45, cy - (hy + PORT_STANDOFF_MM * 0.5), z)
                pt = _terminal_marker(f"{nm}_port_{pkey}", face,
                                      MAT, mod=p.module_id, MO=MO, kind="power")
                prt[pkey] = pt
            elif svc == "signal":
                # SMALL terminal box low on the +Y face (opposite the power gland).
                z = z_bot + (z_ctr - z_bot) * (0.25 + 0.30 * sig_seen)
                sig_seen += 1
                face = (cx + hx * 0.45, cy + (hy + PORT_STANDOFF_MM * 0.5), z)
                pt = _terminal_marker(f"{nm}_port_{pkey}", face,
                                      MAT, mod=p.module_id, MO=MO, kind="signal")
                prt[pkey] = pt
        if prt:
            p.ports = prt
            n_with += 1
            n_ports += len(prt)
    print(f"[univ][ports] STAGE 2 connection ports — {n_with}/{len(parts)} parts "
          f"ported, {n_ports} ports total (fluid stubs + small terminals; "
          f"stored on part.ports for Stage-3 wiring)")
    return n_with, n_ports


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3 — WIRE THE LINE PORT-TO-PORT (4-stage connection-points plan)
# ───────────────────────────────────────────────────────────────────────────
# Stage 1 laid every part in process order; Stage 2 stored each part's named in/out
# connection PORTS on p.ports[f"{service}_{dir}"]. Stage 3 (this) ROUTES every LEDGER
# edge as a real pipe FROM the source part's `<service>_out` port TO the destination
# part's `<service>_in` port — the durable coordinates Stage 2 stored — so the whole
# row reads as ONE long CONNECTED line with NOTHING floating: every pipe starts
# EXACTLY on a source-port coordinate and ends EXACTLY on a destination-port
# coordinate (never a part centre, never thin air).
#
# UNIVERSAL: it keys ONLY off (a) the finalized LEDGER edge list (from_part/to_part/
# mechanism + its rating), (b) cl._service_of(mechanism) to pick the port pair, and
# (c) p.ports. No RAS-only / per-class table. It runs after add_connection_ports and
# works under the Stage-1 linear row (the deliverable to SEE) AND, when explicitly
# enabled, the production placers.
#
# PATH: a clean Manhattan 3-segment route — RISE from the source port up to an
# overhead clearance Z (above the taller of the two ports + a per-service tier
# stagger so parallel services don't co-incide), run ACROSS to above the destination
# port, then DROP onto the destination port. Reads as one connected run and clears
# the equipment tops it spans. Drawn through the SAME _draw_run chokepoint the
# production router uses, so each wired run is sized at its REAL bore from the edge
# rating (_sized_dia_mm), coloured by mechanism (_mech_pipe_mat — water=blue,
# power=red cable-tray, thermal=orange, signal=green, O₂=teal, air=cyan), recorded in
# _CONN_SPECS (the schedule) + _ROUTE_LOG (the audit). Object names ride a `u_wire_`
# prefix registered in the INSPECT recolour + the synthetic-manifest skip so a wired
# run keeps its mechanism colour and is never mistaken for an equipment block.
#
# MISSING-PORT FALLBACK (never skip a real edge silently): for an edge of service S,
# the source port is p.ports['S_out']; if that exact key is absent, fall back to the
# nearest available port of service S (any 'S_*'), then to ANY port on the part — and
# LOG the substitution. An edge is only LEFT UNWIRED when an endpoint resolves to no
# placed-and-ported part at all (an abstract battery-limit boundary — grid / drain /
# atmosphere — which has no physical part to land on); those are logged too.
# ═══════════════════════════════════════════════════════════════════════════

# Ledger SERVICE → the render `mechanism` _draw_run/_mech_pipe_mat colour by + decide
# cable-tray vs round pipe. The ledger's raw `mechanism` is usually already a
# colour-known key (fluid_loop/electrical_bus/thermal/signal/air/oxygen), but routing
# the WIRE by the SERVICE (not the raw mechanism) keeps the palette coherent across
# any archetype's mechanism spellings and guarantees power → the cable-tray branch.
_WIRE_SERVICE_MECH = {
    "water":   "fluid_loop",      # blue round pipe
    "thermal": "thermal",         # orange round pipe
    "power":   "electrical_bus",  # red CABLE TRAY (the _draw_run electrical branch)
    "signal":  "signal",          # green round pipe (thin)
    "oxygen":  "oxygen",          # teal round pipe
    "air":     "air",             # cyan round pipe
}
# Stable per-service tier index so the overhead "across" leg of each service sits at a
# distinct elevation band (water below, power above it, etc.) and parallel mains that
# share the row span never co-incide / cross at the same height.
_WIRE_SERVICE_TIER = {"water": 0, "thermal": 1, "oxygen": 2, "air": 3,
                      "power": 4, "signal": 5}


def _pick_port(part, service, direction):
    """Return (port_xyz, port_key, how) for `part`'s (service, direction) connection
    point — the coordinate Stage 2 stored on part.ports — with a never-skip fallback:
      1. EXACT  part.ports['<service>_<direction>']                      → how='exact'
      2. SAME-SERVICE any part.ports['<service>_*'] (prefer the right dir if only the
         other dir exists, else either)                                  → how='service'
      3. ANY   any port on the part                                      → how='any'
    Returns (None, None, 'none') when the part has no ports at all (caller logs it)."""
    ports = getattr(part, "ports", None) or {}
    if not ports:
        return None, None, "none"
    exact = f"{service}_{direction}"
    if exact in ports:
        return tuple(ports[exact]), exact, "exact"
    # same service, opposite/either direction
    svc_keys = [k for k in ports if k.startswith(f"{service}_")]
    if svc_keys:
        # prefer the requested direction's twin if present, else the first stable one
        svc_keys.sort()
        return tuple(ports[svc_keys[0]]), svc_keys[0], "service"
    # any port — last resort so a real edge is NEVER dropped for want of an exact port
    any_keys = sorted(ports.keys())
    return tuple(ports[any_keys[0]]), any_keys[0], "any"


# Per-RUN micro-stagger [mm] WITHIN a service tier: successive runs of the SAME service
# (e.g. the 20+ signal leads off the distribution busbar) step up by this so they don't
# all cross at one overhead height (the same-Z-crossing tangle). A small band — N runs
# spread over N×this — kept under the service-tier pitch so services stay separated.
WIRE_RUN_STAGGER_MM = 110.0
WIRE_RUN_STAGGER_LEVELS = 6    # cycle the per-run offset over this many levels per service


def _wire_path(src_xyz, dst_xyz, service, run_idx=0, overhead_base_z=None):
    """Build the orthogonal Manhattan waypoint path (mm) FROM the source port TO the
    destination port: RISE straight up from src to an overhead clearance Z → run
    ACROSS (in X then Y) at that Z → DROP straight down onto dst. The across-leg runs
    at a shared OVERHEAD-DECK Z (overhead_base_z = the equipment-bulk top + clearance,
    like a real overhead pipe rack) so a port-to-port run FLIES ABOVE the equipment it
    spans (e.g. the tall tank farm) instead of draping across the tank tops; it is
    lifted further by a per-SERVICE tier stagger (services don't co-incide) plus a
    per-RUN micro-stagger (run_idx) so two runs of the SAME service that share a span
    sit at distinct heights (cuts the same-Z-crossing tangle). The deck never drops
    below either port (a run between two tall nozzles stays at its own height + clear).
    Endpoints are EXACTLY the two port coordinates (the run starts on the source port,
    ends on the destination port — nothing floats). Degenerate near-coincident ports
    get a direct 2-pt run."""
    sx, sy, sz = (float(c) for c in src_xyz)
    dx, dy, dz = (float(c) for c in dst_xyz)
    tier = _WIRE_SERVICE_TIER.get(service, 0) * WIRE_SERVICE_TIER_MM
    run_off = (run_idx % WIRE_RUN_STAGGER_LEVELS) * WIRE_RUN_STAGGER_MM
    # base overhead deck: the shared equipment-bulk top (if supplied), but never below
    # the taller of the two ports + clearance (so a tall-to-tall run isn't pushed down).
    deck = max(sz, dz) + WIRE_OVERHEAD_CLEAR_MM
    # Only LONG runs are lifted to the shared overhead rack; a short/local run keeps its
    # own low deck so it connects port-to-port directly (no fly-over-the-plant detour).
    _span = abs(sx - dx) + abs(sy - dy)
    if overhead_base_z is not None and _span > WIRE_LOCAL_DIRECT_MAX_MM:
        deck = max(deck, float(overhead_base_z))
    z_cross = deck + tier + run_off
    pts = [(sx, sy, sz)]                       # start ON the source port
    if abs(sx - dx) < 1.0 and abs(sy - dy) < 1.0:
        pts.append((dx, dy, dz))              # ports stacked → straight drop/rise
        return pts
    pts.append((sx, sy, z_cross))             # rise to the overhead lane
    if abs(sx - dx) > 1.0:
        pts.append((dx, sy, z_cross))         # across in X
    if abs(sy - dy) > 1.0:
        pts.append((dx, dy, z_cross))         # across in Y
    pts.append((dx, dy, dz))                  # drop ONTO the destination port
    return pts


# A SOURCE that feeds this many destinations of the SAME service is a FAN-OUT — route it
# as a SHARED TRAY (one trunk + drop spurs) rather than N independent flying runs, which
# is the spaghetti Tristan flagged on dense plants (a Distribution Busbar → 30 instruments,
# SCADA → N signal_ins). Below this count, the per-edge port-to-port path reads fine.
WIRE_FANOUT_MIN = 999   # (was 3) Tristan 2026-06-22 chose DIRECT port-to-port: every edge
# draws its own source-port→dest-port run that visibly LANDS on the port, instead of an
# aggregated shared TRUNK that flies to a 40 m spine and feeds drop-spurs (which read as
# "the pipe doesn't connect to the part"). Set high to disable the shared-tray fan-out.


def _tray_paths(src_xyz, dests_xyz, service, overhead_base_z=None, tier_idx=0):
    """SHARED-TRAY router for a fan-out (one source port → many same-service dest ports).

    Lays ONE overhead TRUNK from the source port along the equipment-bulk rack to a tray
    SPINE that spans the destinations, then a short DROP SPUR from the spine down onto each
    destination port. Reads as a real cable tray / pipe-rack branch (a trunk with taps)
    instead of N independent flying runs. Still PORT-TO-PORT: the trunk STARTS exactly on
    the source port; each spur ENDS exactly on a destination port — nothing floats.

    Geometry (all mm, Manhattan):
      • spine axis = the destination span's LONGER plan extent (X or Y), at the dest
        centroid's other-axis coordinate, at the overhead deck Z + this service's tier;
      • trunk = source port → rise to deck → across to the spine's NEAR end → run the full
        spine length to its FAR end (so the trunk physically overflies every tap point);
      • spur(d) = the spine point directly above dest d → drop straight onto dest d's port.

    Returns (trunk_pts, [(dest_xyz, spur_pts), …]) — `trunk_pts` drawn once; each spur drawn
    as its own short run. The deck never sits below the tallest port + clearance."""
    sx, sy, sz = (float(c) for c in src_xyz)
    dests = [tuple(float(c) for c in d) for d in dests_xyz]
    tier = _WIRE_SERVICE_TIER.get(service, tier_idx) * WIRE_SERVICE_TIER_MM
    deck = max([sz] + [d[2] for d in dests]) + WIRE_OVERHEAD_CLEAR_MM
    # Lift the tray spine to the shared overhead rack ONLY when the fan-out genuinely spans
    # the plant; a LOCAL cluster of destinations keeps a low spine so the spurs drop a short
    # way onto their ports (not a plant-wide trunk at 6.4 m for nearby parts).
    _tray_span = max(max(d[0] for d in dests) - min(d[0] for d in dests),
                     max(d[1] for d in dests) - min(d[1] for d in dests))
    if overhead_base_z is not None and _tray_span > WIRE_LOCAL_DIRECT_MAX_MM:
        deck = max(deck, float(overhead_base_z))
    z_spine = deck + tier
    xs = [d[0] for d in dests]
    ys = [d[1] for d in dests]
    # spine runs along the axis the destinations spread furthest along; the spine's OTHER
    # coordinate is the dest centroid (so spurs drop roughly straight down, short + tidy).
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    if span_x >= span_y:
        axis = "x"
        a0, a1 = min(xs), max(xs)
        spine_other = cy
        near = (a0, spine_other, z_spine) if abs(a0 - sx) <= abs(a1 - sx) else (a1, spine_other, z_spine)
        far = (a1, spine_other, z_spine) if near[0] == a0 else (a0, spine_other, z_spine)
    else:
        axis = "y"
        a0, a1 = min(ys), max(ys)
        spine_other = cx
        near = (spine_other, a0, z_spine) if abs(a0 - sy) <= abs(a1 - sy) else (spine_other, a1, z_spine)
        far = (spine_other, a1, z_spine) if near[1] == a0 else (spine_other, a0, z_spine)
    # TRUNK: source port → up to deck → across to the spine NEAR end → along to the FAR end.
    trunk = [(sx, sy, sz), (sx, sy, z_spine)]
    if (abs(near[0] - sx) > 1.0) or (abs(near[1] - sy) > 1.0):
        # corner into the spine line: move in the non-spine axis first, then onto the end.
        if axis == "x":
            trunk.append((sx, spine_other, z_spine))   # square up to the spine's Y lane
        else:
            trunk.append((spine_other, sy, z_spine))   # square up to the spine's X lane
        trunk.append(near)
    trunk.append(far)                                  # run the full spine span
    # SPUR: the spine point directly above each dest → drop onto the dest port.
    spurs = []
    for d in dests:
        if axis == "x":
            tap = (d[0], spine_other, z_spine)
        else:
            tap = (spine_other, d[1], z_spine)
        spur = [tap]
        if abs(tap[0] - d[0]) > 1.0 or abs(tap[1] - d[1]) > 1.0:
            spur.append((d[0], d[1], z_spine))         # square up over the port
        spur.append((d[0], d[1], d[2]))                # drop ONTO the port
        spurs.append((d, spur))
    return trunk, spurs


def wire_ports(parts, ledger_topology, MAT, MO, out_dir=None):
    """STAGE 3. Route every LEDGER edge PORT-TO-PORT so the laid-out parts read as one
    connected line with nothing floating, and collect each routed run's real path
    length for the downstream velocity / volt-drop / cost maths.

    `ledger_topology` = the finalized connection list (cl.finalize_ledger output) —
    each edge a dict {from_part, to_part, mechanism, constraint_kind, required_value,
    required_unit, required_margin_factor, material_context, …}. For each edge:
      • service  = the edge's _ledger_service or cl._service_of(mechanism); an
        'assembly' edge is a MOUNT (part-of), not a routable connection → skipped.
      • source   = from_part.ports['<service>_out'] (fallback via _pick_port);
        dest     = to_part.ports['<service>_in']  (fallback via _pick_port).
      • a Manhattan rise→across→drop path is drawn through _draw_run (sized at the
        edge's real bore, mechanism-coloured, scheduled + audited) named u_wire_*.
    An edge whose endpoint is an abstract battery-limit boundary (no placed/ported
    part) is LEFT UNWIRED and logged. Writes wired-lengths.json (per-run length +
    totals) when out_dir is given. Returns the summary dict.

    SHARED TRAYS (2026-06-21, Tristan): when ONE source feeds ≥WIRE_FANOUT_MIN (3)
    destinations of the SAME service — a Distribution Busbar → N instrument power_ins, a
    SCADA/Main Controller → N signal_ins — those edges are NOT drawn as N independent
    flying runs (the spaghetti on a dense plant, e.g. CO₂ ~170 edges). Instead the group
    is routed as ONE overhead TRUNK from the source port along the rack to a tray SPINE
    spanning the destinations, with a short DROP SPUR from the spine onto each dest port
    (see _tray_paths). Still port-to-port: trunk starts on the source's <service>_out,
    each spur ends on a dest's <service>_in. Groups smaller than the threshold keep the
    per-edge port-to-port path. LENGTH RULE for the cost/volt-drop maths: each edge in a
    trayed group is charged its OWN spur length PLUS its equal share of the shared trunk
    (trunk_len / N) — so Σ(edge lengths) == trunk + Σ(spurs) exactly (no double-count, no
    under-count), while a single fat trunk is physically drawn once. Universal — keys only
    off (from_part, service, dest-count), no class table."""
    by_name = {p.name: p for p in parts}
    wired, skipped, fallbacks, already = [], [], 0, 0
    n_edges = len(ledger_topology or [])
    pipe_module = "mass_fluid_transport_process"   # the routing module bucket
    _svc_run_count = {}   # per-service counter → per-run Z micro-stagger (anti-tangle)
    # OVERHEAD DECK: route the across-legs above the EQUIPMENT BULK (non-tall parts —
    # tanks/skids; stacks/flares excluded via is_tall_for_frame so the deck isn't dragged
    # up to a flare tip) + clearance, so every port-to-port run FLIES OVER the tank farm
    # like a real overhead rack instead of draping across the tank tops. None → fall back
    # to the per-run "taller-port + clearance" height (the original behaviour).
    _bulk_tops = [p.anchors["top"][2] for p in parts
                  if getattr(p, "anchors", None) and "top" in p.anchors
                  and not is_tall_for_frame(p)]
    overhead_base_z = (max(_bulk_tops) + WIRE_OVERHEAD_CLEAR_MM) if _bulk_tops else None
    if overhead_base_z is not None:
        print(f"[univ][wire]   overhead deck Z = {overhead_base_z:.0f} mm "
              f"(equipment-bulk top + {WIRE_OVERHEAD_CLEAR_MM:.0f} mm clearance)")
    # ── PHASE A — RESOLVE every edge to its src/dst ports (NO draw yet) so fan-outs can
    #    be grouped. A record carries everything PHASE B needs to draw it (per-edge OR as
    #    part of a shared tray). Edges that resolve to no port are skipped here exactly as
    #    before (abstract boundary / assembly / unported endpoint) — never drawn.
    resolved = []        # [{idx,e,frm,to,mech,service,src_part,dst_part,src_xyz,...}]
    for idx, e in enumerate(ledger_topology or []):
        frm = e.get("from_part")
        to = e.get("to_part")
        mech = e.get("mechanism")
        service = e.get("_ledger_service") or cl._service_of(mech)
        edge_lbl = f"{frm}→{to} [{mech}/{service}]"
        # STAGE 4 double-draw guard: an edge the centre-based spine router already drew
        # (an abstract battery-limit edge it routes; wire_ports can't land on it anyway)
        # must NOT be re-drawn here. id()-keyed on the SAME topology list both engines
        # share. Belt-and-braces — the partition predicate already excludes these.
        if id(e) in _SPINE_DRAWN_EDGE_IDS:
            already += 1
            continue
        if service == "assembly":
            skipped.append({"edge": edge_lbl, "reason": "assembly mount (not a routable connection)"})
            continue
        # HERO DECLUTTER (Tristan 2026-06-22): a 3-D hero does NOT draw every instrument
        # power + signal SPUR — the thin red(power)/green(signal) lines to sensing/control
        # sub-components are the "random lines from nowhere to nowhere, going through the
        # tanks" (that wiring belongs on the P&ID, not the 3-D model). Skip any edge whose
        # endpoint is a PURE INSTRUMENT. DEFAULT ON; BLENDER_WIRE_INSTRUMENTS=1 restores it.
        # HERO-ONLY (not _INSPECT_MODE): only the materialed hero declutters the I&C wiring; the
        # INSPECT=1 technical render KEEPS it so the parts-ledger + P&ID + the connectivity audit
        # see the instrument↔measured associations (Tristan 2026-06-22 — hiding broke coverage).
        if (not _INSPECT_MODE) and os.environ.get("BLENDER_WIRE_INSTRUMENTS", "").strip().lower() \
                not in ("1", "true", "yes", "on"):
            _fp, _tp = by_name.get(frm), by_name.get(to)
            # (a) any spur to/from a sub-component (instrument/control), AND (b) any SIGNAL/
            # CONTROL/DATA cable at all — instrument & control wiring belongs on the P&ID, not
            # the 3-D hero; drawing it is the thin-line clutter (Tristan 2026-06-22). Fluid +
            # power-to-principals stay. Universal — mechanism/module keyed, no class table.
            if (_fp is not None and _is_subcomponent_part(_fp)) \
                    or (_tp is not None and _is_subcomponent_part(_tp)) \
                    or str(mech).lower() in ("signal", "control", "data"):
                skipped.append({"edge": edge_lbl, "reason": "hero-declutter: I&C/sub-component spur"})
                continue
        src_part = by_name.get(frm)
        dst_part = by_name.get(to)
        # An endpoint with no placed-and-ported part is an abstract battery-limit
        # boundary (grid / drain / atmosphere) — there is no physical port to land on.
        if src_part is None or dst_part is None or not getattr(src_part, "ports", None) \
                or not getattr(dst_part, "ports", None):
            why = ("source is an abstract boundary / unported part"
                   if (src_part is None or not getattr(src_part, "ports", None))
                   else "destination is an abstract boundary / unported part")
            skipped.append({"edge": edge_lbl, "reason": why})
            continue
        src_xyz, src_key, src_how = _pick_port(src_part, service, "out")
        dst_xyz, dst_key, dst_how = _pick_port(dst_part, service, "in")
        if src_xyz is None or dst_xyz is None:        # belt-and-braces (ports dict empty)
            skipped.append({"edge": edge_lbl, "reason": "no usable port on an endpoint"})
            continue
        if src_how != "exact" or dst_how != "exact":
            fallbacks += 1
            print(f"[univ][wire]   port FALLBACK {edge_lbl}: "
                  f"src={src_key}({src_how}) dst={dst_key}({dst_how}) "
                  f"— wanted {service}_out / {service}_in")
        resolved.append({
            "idx": idx, "e": e, "frm": frm, "to": to, "mech": mech, "service": service,
            "edge_lbl": edge_lbl, "src_part": src_part, "dst_part": dst_part,
            "src_xyz": src_xyz, "dst_xyz": dst_xyz, "src_key": src_key, "dst_key": dst_key,
            "src_how": src_how, "dst_how": dst_how,
        })

    # ── group the resolved edges by (from_part, service). A group with ≥WIRE_FANOUT_MIN
    #    destinations is a FAN-OUT → one SHARED TRAY (trunk + drop spurs). Smaller groups
    #    keep the per-edge port-to-port path. Group identity is the SOURCE PORT coordinate
    #    (so two distinct sources of the same name can't merge) keyed by (frm, service).
    from collections import OrderedDict
    groups = OrderedDict()
    for r in resolved:
        groups.setdefault((r["frm"], r["service"]), []).append(r)
    n_fanout_groups = sum(1 for g in groups.values() if len(g) >= WIRE_FANOUT_MIN)

    def _record(r, nm, waypoints, length_m, mode):
        """Draw ONE run + append its wired-record. Shared by per-edge + spur draws."""
        render_mech = _WIRE_SERVICE_MECH.get(r["service"], "fluid_loop")
        edge_for_size = dict(r["e"])
        edge_for_size.setdefault("from_part", r["frm"])
        edge_for_size.setdefault("to_part", r["to"])
        _draw_run(nm, render_mech, waypoints, waypoints[0], waypoints[-1], MAT, MO,
                  pipe_module, conn=(r["src_part"].obj_anchor, r["dst_part"].obj_anchor),
                  own_parts=(r["src_part"], r["dst_part"]), log=True, edge=edge_for_size)
        wired.append({
            "run_name": nm, "from_part": r["frm"], "to_part": r["to"],
            "mechanism": r["mech"], "service": r["service"],
            "src_port": r["src_key"], "dst_port": r["dst_key"],
            "port_match": "exact" if (r["src_how"] == "exact" and r["dst_how"] == "exact") else "fallback",
            "route_mode": mode,
            "length_m": round(length_m, 3),
            "waypoints_mm": [[round(c, 1) for c in w] for w in waypoints],
        })

    n_trayed = 0
    # Tray threshold is SERVICE-AWARE (Tristan 2026-06-22): FLUID stays DIRECT port-to-port so
    # every pipe visibly lands on its part (WIRE_FANOUT_MIN=999), but SIGNAL / ELECTRICAL fan-outs
    # (16 instruments → 1 controller, busbar → N loads) BUNDLE into a marshalled cable TRAY — one
    # neat run instead of 16 thin cables crisscrossing the plant. Cables are thin + many-to-one, so
    # a tray is the realistic + tidy answer; pipes are few + must connect, so direct.
    _CABLE_SERVICES = ("signal", "electric", "power", "data", "control", "bus")

    def _is_cable(svc):
        s = str(svc or "").lower()
        return any(t in s for t in _CABLE_SERVICES)

    for (frm, service), grp in groups.items():
        _thr = 3 if _is_cable(service) else WIRE_FANOUT_MIN
        if len(grp) >= _thr:
            # ── SHARED TRAY: one trunk from the (single) source port → spurs to each dest.
            src_xyz = grp[0]["src_xyz"]      # same source port for the whole group
            dests = [r["dst_xyz"] for r in grp]
            try:
                trunk, spurs = _tray_paths(src_xyz, dests, service,
                                           overhead_base_z=overhead_base_z)
            except Exception as ex:
                print(f"[univ][wire]   WARN tray build failed for {frm}/{service} "
                      f"({ex}); falling back to per-edge runs")
                grp_fallback = True
            else:
                grp_fallback = False
                trunk_len_m = _polyline_len_m(trunk)
                # LENGTH RULE: each edge is charged its OWN spur + an equal share of the
                # shared trunk (trunk_len / N) → Σ(edge lengths) == trunk + Σ(spurs).
                share_m = trunk_len_m / float(len(grp))
                # draw the trunk ONCE (named on the source), then each spur (named on its
                # dest) — both through _draw_run so each is sized/scheduled/audited.
                tnm = f"u_wire_trunk_{_part_prefix(str(frm))}_{service}"
                render_mech = _WIRE_SERVICE_MECH.get(service, "fluid_loop")
                try:
                    _draw_run(tnm, render_mech, trunk, trunk[0], trunk[-1], MAT, MO,
                              pipe_module,
                              conn=(grp[0]["src_part"].obj_anchor, None),
                              own_parts=(grp[0]["src_part"],), log=True,
                              edge=dict(grp[0]["e"]))
                except Exception as ex:
                    print(f"[univ][wire]   WARN trunk draw failed for {frm}/{service}: {ex}")
                # spurs come back in the SAME ORDER as `dests` (== grp order) — zip 1:1.
                for r, (_d, spur) in zip(grp, spurs):
                    snm = f"u_wire_{r['idx']:03d}_{_part_prefix(str(r['to']))}_{service}_spur"
                    spur_len_m = _polyline_len_m(spur)
                    try:
                        _record(r, snm, spur, spur_len_m + share_m, "tray_spur")
                    except Exception as ex:
                        print(f"[univ][wire]   WARN spur draw failed for {r['edge_lbl']}: {ex}")
                        skipped.append({"edge": r["edge_lbl"], "reason": f"draw error: {ex}"})
                n_trayed += 1
                print(f"[univ][wire]   SHARED TRAY {frm} → {len(grp)}× {service} "
                      f"(trunk {trunk_len_m * fl.MM:.1f} m + {len(grp)} spurs)")
            if not grp_fallback:
                continue
        # ── per-edge port-to-port path (small group OR a tray that failed to build).
        for r in grp:
            _run_i = _svc_run_count.get(service, 0)
            _svc_run_count[service] = _run_i + 1
            waypoints = _wire_path(r["src_xyz"], r["dst_xyz"], service, run_idx=_run_i,
                                   overhead_base_z=overhead_base_z)
            nm = f"u_wire_{r['idx']:03d}_{_part_prefix(str(frm))}_{service}"
            try:
                _record(r, nm, waypoints, _polyline_len_m(waypoints), "per_edge")
            except Exception as ex:   # never let one run kill the wiring pass
                print(f"[univ][wire]   WARN draw failed for {r['edge_lbl']}: {ex}")
                skipped.append({"edge": r["edge_lbl"], "reason": f"draw error: {ex}"})
                continue
    total_m = round(sum(w["length_m"] for w in wired), 2)
    by_service = {}
    for w in wired:
        by_service.setdefault(w["service"], 0.0)
        by_service[w["service"]] += w["length_m"]
    by_service = {k: round(v, 2) for k, v in sorted(by_service.items())}
    summary = {"schema": "wired-lengths/2",
               "edges_total": n_edges,
               "edges_wired": len(wired),
               "edges_skipped": len(skipped),
               "edges_drawn_by_spine": already,   # Stage 4: abstract-boundary edges the spine router drew
               "port_fallbacks": fallbacks,
               "fanout_groups_trayed": n_trayed,  # fan-outs routed as a SHARED TRAY (trunk + spurs)
               "fanout_groups_detected": n_fanout_groups,
               "total_routed_length_m": total_m,
               "length_m_by_service": by_service,
               "skipped": skipped,
               "runs": wired}
    print(f"[univ][wire] STAGE 3/4 port-to-port wiring — {len(wired)}/{n_edges} ledger "
          f"edges WIRED port-to-port ({fallbacks} via a port fallback), "
          f"{already} already drawn by the spine router (abstract boundary), "
          f"{len(skipped)} left unwired (abstract boundary / assembly); "
          f"{n_trayed} fan-out(s) routed as a SHARED TRAY; "
          f"total routed length {total_m:.1f} m")
    if by_service:
        print(f"[univ][wire]   routed length by service (m): {by_service}")
    if skipped:
        for s in skipped[:12]:
            print(f"[univ][wire]   UNWIRED {s['edge']}: {s['reason']}")
    if out_dir:
        try:
            with open(os.path.join(out_dir, "wired-lengths.json"), "w") as wf:
                json.dump(summary, wf, indent=1)
            print(f"[univ][wire]   wrote wired-lengths.json — {len(wired)} runs, "
                  f"{total_m:.1f} m total → {os.path.join(out_dir, 'wired-lengths.json')}")
        except Exception as we:
            print(f"[univ][wire]   WARN could not write wired-lengths.json: {we}")
    return summary


# ═══════════════════════════════════════════════════════════════════════════
# UNIVERSAL LAYOUT OPTIMISER hook (opt-in: LAYOUT_OPTIMISE=1) — re-flow the placed
# equipment to layout_optimiser.py's deterministic CRAFT minimum-weighted-pipe-run
# layout AFTER place_all, then let the skid frame + pipe rack + routing re-derive on
# the tighter layout. The connection LEDGER is the weighted input; Blender only
# measures. Class-agnostic; any failure leaves the original placement untouched.
# ═══════════════════════════════════════════════════════════════════════════
def _shift_part_xy(p, dx_mm, dy_mm, moved):
    """Translate ONE already-placed part in plan by (dx,dy) mm: its Blender meshes
    (matched by build_part's name PREFIX), its anchors, and placed_xyz_mm — the
    2-D, per-part analogue of the bank-compaction Y-shift (_shift_objects_by_prefix).
    `moved` is shared across the whole re-flow so a SHORTER-prefix part can never
    re-grab a LONGER-prefix part's already-shifted objects (callers process the
    longest prefix first → every object is claimed by its true owner). obj_anchor is
    a Blender-object handle and rides the mesh move; nothing else to update."""
    dxb, dyb = dx_mm * fl.MM, dy_mm * fl.MM
    pref = _part_prefix(p.name)
    # The qty-N array MANIFOLD (build_part's supply/drain/power headers + drops) is named
    # "u_pipe_<nm>_*" (a u_pipe_ prefix so it stays OUT of the equipment bbox) — so it does
    # NOT start with the part prefix and was LEFT BEHIND when the array moved, hanging in
    # mid-air as a floating "comb" (Tristan 2026-06-22). Move it WITH its array too.
    manifold_pref = "u_pipe_" + pref
    for obj in bpy.data.objects:
        if not (obj.name.startswith(pref) or obj.name.startswith(manifold_pref)):
            continue
        try:
            oid = obj.as_pointer()
        except (AttributeError, ReferenceError):
            oid = id(obj)
        if oid in moved:
            continue
        moved.add(oid)
        try:
            obj.location[0] += dxb
            obj.location[1] += dyb
        except (AttributeError, TypeError, IndexError):
            pass
    x, y, z = p.placed_xyz_mm
    p.placed_xyz_mm = (x + dx_mm, y + dy_mm, z)
    if p.anchors:
        p.anchors = {k: (v[0] + dx_mm, v[1] + dy_mm, v[2]) for k, v in p.anchors.items()}


def _layout_is_envelope(p):
    """The building-SHELL test, identical to place_all's _is_envelope_part: a
    plant-scale shell (≥200 m² OR ≥25 m × ≥6 m) that is NOT a vessel. These enclose
    the plant (slab/frame) and are re-centred on the equipment bbox, never re-flowed."""
    fx, fy, _ = footprint_mm(resolved_dims_mm(p))
    return (p.shape not in _VESSEL_KIND
            and (fx * fy >= 200e6 or (max(fx, fy) >= 25000 and min(fx, fy) >= 6000)))


_FIELD_INSTRUMENT_MODULES = {"sensing_instrumentation", "safety_protection"}


def _is_subcomponent_part(p):
    """UNIVERSAL test (no class table): a part that is a SUB-COMPONENT — an instrument,
    sensor, alarm, safety device, or control/LV-electrical part — that should be mounted on
    its parent / housed in the control cabinet, NOT placed + wired as standalone principal
    equipment (Tristan 2026-06-22). Keyed on the decomposition MODULE + a generic control
    vocabulary, so it holds for any archetype's I&C + control system."""
    if getattr(p, "_consolidated", False):
        return True
    if p.module_id in ("sensing_instrumentation", "safety_protection",
                       "control_compute_communication"):
        return True
    nm = (p.name or "").lower()
    if p.module_id == "power_distribution" and any(t in nm for t in _CONTROL_NAME_TOKENS) \
            and not any(k in nm for k in _CONTROL_KEEP_TOKENS):
        return True
    return False
_MOUNT_HOST_MODULES = {"mass_fluid_transport_process", "water_treatment_system",
                       "environmental_interface", "actuation_kinematics"}


def _ground_floaters(parts):
    """UNIVERSAL 'nothing floats' pass (Tristan 2026-06-22). Any EQUIPMENT part whose drawn
    mesh BOTTOM hangs > 700 mm above the deck datum is dropped straight down so it sits on the
    deck. Pipes / routes / frame / the deck itself are excluded (they legitimately fly). Keyed
    on the Z gap only — no class table. Returns the count grounded + names."""
    _V = __import__("mathutils").Vector
    skip = ("u_pipe_", "u_route_", "u_wire_", "u_skid_", "u_ground_", "u_rack_",
            "u_grid_", "u_datum_", "u_dim_")
    # group objects by part prefix → each part's mesh-bottom across all its objects
    grounded = []
    for p in parts:
        pref = _part_prefix(p.name)
        objs = [o for o in bpy.data.objects
                if o.name.startswith(pref) and getattr(o, "type", None) == "MESH"
                and o.data is not None and not any(o.name.startswith(s) for s in skip)]
        if not objs:
            continue
        zmin = None
        for o in objs:
            for c in o.bound_box:
                wz = (o.matrix_world @ _V(c)).z * 1000.0
                zmin = wz if zmin is None else min(zmin, wz)
        if zmin is not None and zmin > DECK_Z_MM + 700.0:
            dz = (DECK_Z_MM - zmin) * fl.MM        # drop so the bottom rests on the deck
            for o in objs:
                o.location = (o.location[0], o.location[1], o.location[2] + dz)
            if getattr(p, "placed_xyz_mm", None):
                p.placed_xyz_mm = (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                                   p.placed_xyz_mm[2] + dz / fl.MM)
            grounded.append(p.name)
    # SECOND pass — UNOWNED elevated stray meshes (port stubs / markers not tracked by any
    # part, so the per-part loop above misses them; these are the tiny far-left floaters in
    # the corner views). Anything that is NOT a flying service (pipe/route/wire/frame/deck) and
    # hangs >0.7 m above the deck is dropped onto it.
    part_prefs = tuple(_part_prefix(p.name) for p in parts)
    strays = 0
    for o in list(bpy.data.objects):
        if getattr(o, "type", None) != "MESH" or o.data is None:
            continue
        nm = o.name
        if any(nm.startswith(s) for s in skip) or nm.startswith("u_control_cabinet"):
            continue
        if any(nm.startswith(pp) for pp in part_prefs):
            continue                              # owned by a part (handled above)
        zmin = min(((o.matrix_world @ _V(c)).z * 1000.0 for c in o.bound_box), default=DECK_Z_MM)
        if zmin > DECK_Z_MM + 700.0:
            o.location = (o.location[0], o.location[1], o.location[2] + (DECK_Z_MM - zmin) * fl.MM)
            strays += 1
    if grounded or strays:
        print(f"[univ][layout] grounded {len(grounded)} floating part(s) + {strays} unowned "
              f"stray mesh(es) onto the deck: {grounded[:8]}")
    return len(grounded) + strays


def _hide_field_instruments(parts):
    """HERO declutter (Tristan 2026-06-22, chose 'hide them in the hero'): drop the small
    field instruments (shape=='instrument') from the 3-D model — once their wiring is
    suppressed they read as orphan cubes 'dangling nowhere', and a 3-D plant hero belongs to
    the principal equipment; the instruments live on the P&ID + BoM, not the model. They stay
    in `parts` (BoM unaffected). DEFAULT ON; SHOW_FIELD_INSTRUMENTS=1 keeps them. Universal —
    shape-keyed, no class table."""
    if os.environ.get("SHOW_FIELD_INSTRUMENTS", "").strip().lower() in ("1", "true", "yes", "on"):
        return 0
    # NON-PHYSICAL / building-feature items that should NOT be standalone boxes on the deck: a
    # media/resin FILL lives INSIDE its vessel; doors/louvres are building fabric, not plant kit
    # (Tristan 2026-06-22 "random squares"). Hidden from the 3-D model; stay in the BoM.
    _NONPHYS = re.compile(r"\b(carrier media|media|resin|biofilm|fill|charge|coating|"
                          r"door|personnel|louvre|cladding|insulation|paint|spares|software|"
                          r"licen[cs]e|service|warranty|training)\b", re.I)
    n = 0
    for p in parts:
        nm = p.name or ""
        if getattr(p, "shape", None) == "instrument" or _NONPHYS.search(nm):
            if _delete_part_meshes(p):
                n += 1
            p._consolidated = True   # so the coverage/route checks skip it (no mesh anyway)
    if n:
        print(f"[univ][layout] hid {n} field-instrument / non-physical item(s) from the hero "
              f"(on the P&ID/BoM, not the 3-D model)")
    return n


def _delete_part_meshes(p):
    """Remove every BLENDER object a part created (matched by build_part's name prefix +
    its qty-N manifold u_pipe_ prefix). Returns the count removed."""
    pref = _part_prefix(p.name)
    mpref = "u_pipe_" + pref
    n = 0
    for obj in list(bpy.data.objects):
        if obj.name.startswith(pref) or obj.name.startswith(mpref):
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
                n += 1
            except (RuntimeError, ReferenceError):
                pass
    return n


def _scale_part_mesh(p, factor):
    """Uniformly scale every BLENDER object of a part about the part's placed centre by
    `factor` — used to shrink an oversized instrument so it reads as a small field device,
    not a tank. Centre (placed_xyz) is unchanged."""
    if factor <= 0 or abs(factor - 1.0) < 1e-3 or not getattr(p, "placed_xyz_mm", None):
        return
    pref = _part_prefix(p.name)
    c = (p.placed_xyz_mm[0] * fl.MM, p.placed_xyz_mm[1] * fl.MM, p.placed_xyz_mm[2] * fl.MM)
    for obj in bpy.data.objects:
        if not obj.name.startswith(pref):
            continue
        obj.scale = tuple(s * factor for s in obj.scale)
        obj.location = tuple(c[i] + (obj.location[i] - c[i]) * factor for i in range(3))


_CONTROL_MODULES = {"control_compute_communication"}
_CONTROL_NAME_TOKENS = ("busbar", "breaker", "relay", "switchgear", "switch", "gateway",
                        "ups", "controller", "scada", "i/o", "i o", "io module", "module",
                        "power supply", "panel", "cabinet", "interlock", "network",
                        "distribution board", "plc", "rtu", "marshalling",
                        "fuse", "surge", "protector", "isolator", "contactor", "starter",
                        "vfd", "drive", "distribution busbar", "protective")
_CONTROL_KEEP_TOKENS = ("generator", "genset", "transformer", "diesel", "alternator",
                        "switchboard mv", "inverter")   # real principal electrical plant


def _consolidate_control_cabinet(parts, MAT, MO):
    """Tristan 2026-06-22: the control system is ONE cabinet, not 10 scattered boxes each
    individually wired. Collapse every control sub-component (the I&C + small LV electrical
    parts — busbar, breaker, relay, I/O, switch, gateway, UPS, controller, SCADA) into a
    SINGLE control-cabinet enclosure: delete their individual meshes, draw one cabinet, and
    move their placed_xyz onto the cabinet so the slab + wiring treat them as one unit. Real
    principal plant (generator/transformer) is NEVER consolidated. Returns the count folded."""
    def _is_control(p):
        nm = (p.name or "").lower()
        if any(k in nm for k in _CONTROL_KEEP_TOKENS):
            return False
        if p.module_id in _CONTROL_MODULES:
            return True
        if p.module_id == "power_distribution" and any(t in nm for t in _CONTROL_NAME_TOKENS):
            return True
        return False
    ctrl = [p for p in parts if _is_control(p) and getattr(p, "placed_xyz_mm", None)]
    if len(ctrl) < 2:
        return 0
    # cabinet footprint at the control cluster's edge of the plant (its own centroid)
    cx = sum(p.placed_xyz_mm[0] for p in ctrl) / len(ctrl)
    cy = sum(p.placed_xyz_mm[1] for p in ctrl) / len(ctrl)
    n_units = len(ctrl)
    cab_w = max(3000.0, min(8000.0, 900.0 * math.ceil(n_units / 2)))   # 2 tiers of bays
    cab_d, cab_h = 1400.0, 2200.0
    for p in ctrl:
        _delete_part_meshes(p)
        p.placed_xyz_mm = (cx, cy, cab_h / 2.0 + DECK_Z_MM)   # records now point at the cabinet
        p._consolidated = True
    mat = MAT.get("m_control_cabinet")
    if mat is None:
        mat = fl.make_mat("m_control_cabinet", (0.62, 0.64, 0.68), metallic=0.55, roughness=0.45)
        MAT["m_control_cabinet"] = mat
    base_z = DECK_Z_MM + cab_h / 2.0
    _cab = fl.add_box("u_control_cabinet", (cx * fl.MM, cy * fl.MM, base_z * fl.MM),
                      (cab_w * fl.MM, cab_d * fl.MM, cab_h * fl.MM), mat, module=None, module_objects=MO)
    _cab.dimensions = (cab_w * fl.MM, cab_d * fl.MM, cab_h * fl.MM)   # add_box halves; set true size
    # thin plinth so it reads as standing on the deck
    _pl = fl.add_box("u_control_cabinet_plinth", (cx * fl.MM, cy * fl.MM, (DECK_Z_MM + 75.0) * fl.MM),
                     ((cab_w + 150) * fl.MM, (cab_d + 150) * fl.MM, 150.0 * fl.MM),
                     MAT.get("m_skid", mat), module=None, module_objects=MO)
    _pl.dimensions = ((cab_w + 150) * fl.MM, (cab_d + 150) * fl.MM, 150.0 * fl.MM)
    bpy.context.view_layer.update()
    print(f"[univ][layout] consolidated {n_units} control sub-component(s) into ONE control "
          f"cabinet ({cab_w/1000:.1f}×{cab_d/1000:.1f}×{cab_h/1000:.1f} m) at "
          f"({cx/1000:.1f}, {cy/1000:.1f})")
    return n_units


def _colocate_field_instruments(parts):
    """Move each FIELD INSTRUMENT (sensing_instrumentation) ONTO the process equipment it
    monitors so it reads as field-mounted — instead of a sparse instrument band 12 m off the
    plant whose signal headers hang in mid-air (Tristan 2026-06-22: 'random pipes floating in
    the air … nowhere to nowhere'). The optimiser clusters I&C by signal weight (all → the
    controller), so it drifts away from the process; this pulls each instrument back onto its
    HOST: the process-equipment part with the best NAME-TOKEN overlap (round-robin fallback),
    at the host centre + a golden-angle radial offset so several instruments on one host don't
    stack. Runs BEFORE routing so the signal runs become short local drops onto the host.
    Universal — keys on module + name tokens, no class table."""
    hosts = [p for p in parts
             if p.module_id in _MOUNT_HOST_MODULES
             and getattr(p, "placed_xyz_mm", None) is not None
             and not _layout_is_envelope(p) and p.shape != "instrument"]
    insts = [p for p in parts
             if p.module_id in _FIELD_INSTRUMENT_MODULES
             and getattr(p, "placed_xyz_mm", None) is not None]
    if not hosts or not insts:
        return 0
    # plant centroid — instruments mount on the host's PLANT-FACING side so they never stick
    # out past an edge host into empty floor (Tristan 2026-06-22: the LOX alarm jutting far
    # left, isolated). Bias the mount angle toward the centroid + a small spread.
    pcx = sum(h.placed_xyz_mm[0] for h in hosts) / len(hosts)
    pcy = sum(h.placed_xyz_mm[1] for h in hosts) / len(hosts)
    moved, n, host_load = set(), 0, {}
    for i, ip in enumerate(insts):
        itok = set(ip.match_tokens)
        best, bov = None, 0
        for h in hosts:
            ov = len(itok & set(h.match_tokens))
            if ov > bov:
                bov, best = ov, h
        if best is None:
            best = hosts[i % len(hosts)]          # no token match → spread round-robin
        k = host_load.get(best.name, 0)
        host_load[best.name] = k + 1
        hx, hy, _hz = best.placed_xyz_mm
        _inward = math.atan2(pcy - hy, pcx - hx)   # direction host → plant centre
        ang = _inward + (k - 1) * 0.45             # small fan around the inward direction
        # SHRINK an oversized instrument first (a level switch / alarm wrongly sized as a
        # 3 m vessel reads as a floating TANK — Tristan 2026-06-22). Field devices are small.
        _ifx, _ify, _ = footprint_mm(resolved_dims_mm(ip))
        _imax = max(_ifx, _ify)
        if _imax > 900.0:
            _scale_part_mesh(ip, 700.0 / _imax)
        # mount at the HOST EDGE (host footprint radius + 600 mm) so it sits ON the host,
        # not floating 2 m off-centre inside/beside a big vessel.
        _hfx, _hfy, _ = footprint_mm(resolved_dims_mm(best))
        _r = max(_hfx, _hfy) / 2.0 + 600.0
        tx, ty = hx + _r * math.cos(ang), hy + _r * math.sin(ang)
        ix, iy, _iz = ip.placed_xyz_mm
        dx, dy = tx - ix, ty - iy
        if abs(dx) >= 1.0 or abs(dy) >= 1.0:
            _shift_part_xy(ip, dx, dy, moved)
        # GROUND it in Z — a field instrument hung at its old mid-air Z reads as a floating
        # box (Tristan 2026-06-22). Drop its meshes so the part sits ~0.5 m off the deck.
        _pref = _part_prefix(ip.name)
        _dz = (DECK_Z_MM + 500.0) - ip.placed_xyz_mm[2]
        if abs(_dz) > 1.0:
            for _o in bpy.data.objects:
                if _o.name.startswith(_pref):
                    _o.location = (_o.location[0], _o.location[1], _o.location[2] + _dz * fl.MM)
            ip.placed_xyz_mm = (ip.placed_xyz_mm[0], ip.placed_xyz_mm[1], DECK_Z_MM + 500.0)
        n += 1
    if n:
        print(f"[univ][layout] co-located {n} field instrument(s) onto process equipment "
              f"(was a floating instrument band)")
    return n


def _apply_layout_optimiser(parts, topology, bbox):
    """Re-flow the placed EQUIPMENT to layout_optimiser's deterministic CRAFT
    minimum-weighted-pipe-run layout, shifting each part's meshes + anchors in place;
    re-centre the building shell on the new equipment bbox. Routing re-derives on the
    new positions (route_topology reads part.anchors), so the result is shorter runs +
    a tighter footprint. Returns the recomputed bbox dict."""
    equip = [p for p in parts
             if getattr(p, "placed_xyz_mm", None) is not None
             and not _layout_is_envelope(p)]
    if len(equip) < 3:
        return bbox
    nodes = [{"name": p.name,
              "dims_mm": list(footprint_mm(resolved_dims_mm(p))[:2])} for p in equip]
    nameset = {p.name for p in equip}

    def _resolve(s):
        s = str(s or "")
        if s in nameset:
            return s
        st = set(re.split(r"[^a-z0-9]+", s.lower()))
        best, bov = None, 0
        for nm in nameset:
            ov = len(st & set(re.split(r"[^a-z0-9]+", nm.lower())))
            if ov > bov:
                best, bov = nm, ov
        return best if bov >= 1 else s

    opt, _fp = lo.optimise(nodes, topology, name_resolve=_resolve, log=lambda *a: None)
    common = [p for p in equip if p.name in opt]
    if len(common) < 3:
        return bbox
    # Align the optimiser's own positive-quadrant frame to the CURRENT plant centroid
    # so the plant stays where the camera frames it (only the RELATIVE layout changed).
    cxo = sum(opt[p.name][0] for p in common) / len(common)
    cyo = sum(opt[p.name][1] for p in common) / len(common)
    cxc = sum(p.placed_xyz_mm[0] for p in common) / len(common)
    cyc = sum(p.placed_xyz_mm[1] for p in common) / len(common)
    # LONGEST prefix first → collision-safe with the shared moved-set (see _shift_part_xy).
    common.sort(key=lambda q: len(_part_prefix(q.name)), reverse=True)
    moved, n_moved = set(), 0
    for p in common:
        nx = opt[p.name][0] - cxo + cxc
        ny = opt[p.name][1] - cyo + cyc
        dx, dy = nx - p.placed_xyz_mm[0], ny - p.placed_xyz_mm[1]
        if abs(dx) < 1.0 and abs(dy) < 1.0:
            continue
        _shift_part_xy(p, dx, dy, moved)
        n_moved += 1

    # Recompute equipment extents, then re-centre the building shell on them (mirrors
    # place_all's envelope handling) so the skid frame + bbox still enclose the plant.
    def _fp_half(p):
        fx, fy, _ = footprint_mm(resolved_dims_mm(p))
        return fx / 2.0, fy / 2.0
    xs0 = min(p.placed_xyz_mm[0] - _fp_half(p)[0] for p in equip)
    xs1 = max(p.placed_xyz_mm[0] + _fp_half(p)[0] for p in equip)
    ys0 = min(p.placed_xyz_mm[1] - _fp_half(p)[1] for p in equip)
    ys1 = max(p.placed_xyz_mm[1] + _fp_half(p)[1] for p in equip)
    ecx, ecy = (xs0 + xs1) / 2.0, (ys0 + ys1) / 2.0
    for p in parts:
        if _layout_is_envelope(p) and getattr(p, "placed_xyz_mm", None) is not None:
            z = p.placed_xyz_mm[2]
            p.placed_xyz_mm = (ecx, ecy, z)
            hx, hy = _fp_half(p)
            xs0 = min(xs0, ecx - hx); xs1 = max(xs1, ecx + hx)
            ys0 = min(ys0, ecy - hy); ys1 = max(ys1, ecy + hy)
    print(f"[univ][layout] CRAFT re-flow: moved {n_moved}/{len(common)} equipment parts; "
          f"footprint {(xs1 - xs0) / 1000.0:.1f}×{(ys1 - ys0) / 1000.0:.1f} m")
    return {"x0": xs0 - 800, "x1": xs1 + 800, "y0": ys0 - 800, "y1": ys1 + 800}


def _plant_extent_mm(parts):
    """(x0,x1,y0,y1, tallest_top_z) over every placed part's FOOTPRINT — the building/boundary
    helpers size off this. Excludes nothing (the shell must enclose the whole plant)."""
    xs, ys, tops = [], [], []
    for p in parts:
        if not getattr(p, "placed_xyz_mm", None):
            continue
        cx, cy = p.placed_xyz_mm[0], p.placed_xyz_mm[1]
        fx, fy, fz = footprint_mm(resolved_dims_mm(p))
        xs += [cx - fx / 2, cx + fx / 2]
        ys += [cy - fy / 2, cy + fy / 2]
        tops.append(p.placed_xyz_mm[2] + fz / 2)
    if not xs:
        return None
    return min(xs), max(xs), min(ys), max(ys), max(tops)


def build_plant_shell(parts, MAT, MO):
    """Build the EXTERNAL BUILDING ENVELOPE around the plant (Tristan 2026-06-22: "build the
    external building … show two blenders, the building from the outside and with no roof or
    walls"). 4 opaque clad walls + a roof + a roller door, sized from the equipment footprint +
    a 2.5 m clearance aisle and headroom above the tallest equipment. Gated by BLENDER_PLANT_
    SHELL=1 — the CUTAWAY render leaves it off; the EXTERIOR render turns it on. Universal."""
    ext = _plant_extent_mm(parts)
    if ext is None:
        return 0
    MM = fl.MM
    x0e, x1e, y0e, y1e, top = ext
    clr, t = 2500.0, 300.0
    x0, x1, y0, y1 = x0e - clr, x1e + clr, y0e - clr, y1e + clr
    H = max(top + 2500.0, 7000.0)                 # headroom above the tallest equipment
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, d = x1 - x0, y1 - y0
    z0 = DECK_Z_MM
    def _mat(key, rgb, **kw):
        m = MAT.get(key) or fl.make_mat(key, rgb, **kw)
        MAT[key] = m
        return m
    wall = _mat("m_shell_wall", (0.74, 0.77, 0.82), metallic=0.20, roughness=0.55)   # clad steel
    trim = _mat("m_shell_trim", (0.30, 0.34, 0.42), metallic=0.40, roughness=0.45)   # dark trim
    roof = _mat("m_shell_roof", (0.44, 0.47, 0.52), metallic=0.30, roughness=0.55)
    door = _mat("m_shell_door", (0.34, 0.36, 0.40), metallic=0.35, roughness=0.45)
    glass = _mat("m_shell_glass", (0.32, 0.50, 0.62), metallic=0.10, roughness=0.10)
    plinth = _mat("m_shell_plinth", (0.26, 0.28, 0.32), metallic=0.10, roughness=0.8)

    def _b(name, c, sz, m):
        o = fl.add_box(name, (c[0] * MM, c[1] * MM, c[2] * MM),
                       (sz[0] * MM, sz[1] * MM, sz[2] * MM), m, module=None, module_objects=MO)
        o.dimensions = (sz[0] * MM, sz[1] * MM, sz[2] * MM)   # add_box halves; set true size
        return o
    # ── walls ──
    _b("u_shell_wall_N", (cx, y1, z0 + H / 2), (w + t, t, H), wall)
    _b("u_shell_wall_S", (cx, y0, z0 + H / 2), (w + t, t, H), wall)
    _b("u_shell_wall_E", (x1, cy, z0 + H / 2), (t, d, H), wall)
    _b("u_shell_wall_W", (x0, cy, z0 + H / 2), (t, d, H), wall)
    # ── dark PLINTH base course (proud of the cladding) ──
    pl_h, pr = 900.0, t + 200.0
    _b("u_shell_plinth_N", (cx, y1, z0 + pl_h / 2), (w + t + 200, pr, pl_h), plinth)
    _b("u_shell_plinth_S", (cx, y0, z0 + pl_h / 2), (w + t + 200, pr, pl_h), plinth)
    _b("u_shell_plinth_E", (x1, cy, z0 + pl_h / 2), (pr, d + 200, pl_h), plinth)
    _b("u_shell_plinth_W", (x0, cy, z0 + pl_h / 2), (pr, d + 200, pl_h), plinth)
    # ── CONTINUOUS GLAZING band (clerestory) at ~0.62 H ──
    gz, gh = z0 + H * 0.62, 1600.0
    _b("u_shell_glaze_N", (cx, y1, gz), (w * 0.86, t + 120, gh), glass)
    _b("u_shell_glaze_S", (cx, y0, gz), (w * 0.55, t + 120, gh), glass)   # front: shorter (door)
    _b("u_shell_glaze_E", (x1, cy, gz), (t + 120, d * 0.86, gh), glass)
    _b("u_shell_glaze_W", (x0, cy, gz), (t + 120, d * 0.86, gh), glass)
    # ── vertical CLADDING SEAMS (proud battens every ~4.5 m) so walls read as profiled ──
    seam = 140.0
    nx = max(2, int(w / 4500))
    for i in range(nx + 1):
        sx = x0 + (w * i / nx)
        _b(f"u_shell_seamN_{i}", (sx, y1, z0 + H / 2 + 200), (seam, t + 80, H - 1200), trim)
        _b(f"u_shell_seamS_{i}", (sx, y0, z0 + H / 2 + 200), (seam, t + 80, H - 1200), trim)
    ny = max(2, int(d / 4500))
    for j in range(ny + 1):
        sy = y0 + (d * j / ny)
        _b(f"u_shell_seamE_{j}", (x1, sy, z0 + H / 2 + 200), (t + 80, seam, H - 1200), trim)
        _b(f"u_shell_seamW_{j}", (x0, sy, z0 + H / 2 + 200), (t + 80, seam, H - 1200), trim)
    # ── CORNER trims ──
    for (ccx, ccy, tag) in ((x0, y0, "SW"), (x1, y0, "SE"), (x0, y1, "NW"), (x1, y1, "NE")):
        _b(f"u_shell_corner_{tag}", (ccx, ccy, z0 + H / 2), (t + 220, t + 220, H), trim)
    # ── low-pitch GABLE roof along the longer axis, with eaves overhang + ridge + fascia ──
    ov = 900.0
    pitch = math.radians(11.0)
    import mathutils as _mu
    STEPS = 7
    if w >= d:                                   # ridge runs along X → gable ends at x0/x1
        half, length = d / 2.0, w + 2 * ov
        slope, rise = half / math.cos(pitch), half * math.tan(pitch)
        for sgn, tag in ((1, "N"), (-1, "S")):
            o = _b(f"u_shell_roof_{tag}", (cx, cy + sgn * half / 2.0, z0 + H + rise / 2.0),
                   (length, slope, t * 0.8), roof)
            o.rotation_euler = (-sgn * pitch, 0.0, 0.0)
        _b("u_shell_ridge", (cx, cy, z0 + H + rise + 150), (length, 360, 360), trim)
        for gx, gtag in ((x0, "W"), (x1, "E")):  # stepped triangular gable in-fill
            for s in range(STEPS):
                f = (s + 0.5) / STEPS
                _b(f"u_shell_gable_{gtag}_{s}", (gx, cy, z0 + H + f * rise),
                   (t, d * (1 - f), rise / STEPS + 60), wall)
    else:                                        # ridge runs along Y → gable ends at y0/y1
        half, length = w / 2.0, d + 2 * ov
        slope, rise = half / math.cos(pitch), half * math.tan(pitch)
        for sgn, tag in ((1, "E"), (-1, "W")):
            o = _b(f"u_shell_roof_{tag}", (cx + sgn * half / 2.0, cy, z0 + H + rise / 2.0),
                   (slope, length, t * 0.8), roof)
            o.rotation_euler = (0.0, sgn * pitch, 0.0)
        _b("u_shell_ridge", (cx, cy, z0 + H + rise + 150), (360, length, 360), trim)
        for gy, gtag in ((y0, "S"), (y1, "N")):
            for s in range(STEPS):
                f = (s + 0.5) / STEPS
                _b(f"u_shell_gable_{gtag}_{s}", (cx, gy, z0 + H + f * rise),
                   (w * (1 - f), t, rise / STEPS + 60), wall)
    # ── ROLLER door + PERSONNEL door on the front (S) wall ──
    _b("u_shell_rollerdoor", (cx - 3000, y0 - t * 0.4, z0 + 2300.0), (5200.0, t * 1.6, 4600.0), door)
    _b("u_shell_persondoor", (cx + 3200, y0 - t * 0.4, z0 + 1150.0), (1200.0, t * 1.6, 2300.0), door)
    # ── #9 ARCHITECTURAL DETAIL (Tristan 2026-06-22; NOT in parts) ──
    eave_z = z0 + H
    for ey, gt in ((y0, "S"), (y1, "N")):                 # eave gutters
        _b(f"u_shell_gutter_{gt}", (cx, ey, eave_z + 90), (w + 2 * t, 280, 240), trim)
    dn = _mat("m_shell_downpipe", (0.50, 0.52, 0.56), metallic=0.5, roughness=0.5)
    for dx, dy, dt in ((x0, y0, "SW"), (x1, y0, "SE"), (x0, y1, "NW"), (x1, y1, "NE")):
        fl.add_cyl(f"u_shell_downpipe_{dt}", (dx * MM, dy * MM, (z0 + H / 2) * MM),
                   0.11, H * MM, dn, module=None, module_objects=MO)
    rl = _mat("m_shell_rooflight", (0.72, 0.83, 0.92), metallic=0.0, roughness=0.06)
    for sgn in (1, -1):                                    # ridge rooflight strips
        for k in range(3):
            if w >= d:
                _b(f"u_shell_rl_{sgn}_{k}", (x0 + w * (k + 1) / 4, cy + sgn * d * 0.22,
                   eave_z + rise * 0.55), (w * 0.11, d * 0.20, 140), rl)
            else:
                _b(f"u_shell_rl_{sgn}_{k}", (cx + sgn * w * 0.22, y0 + d * (k + 1) / 4,
                   eave_z + rise * 0.55), (w * 0.20, d * 0.11, 140), rl)
    _b("u_shell_doortrack", (cx - 3000, y0 - t * 0.5, z0 + 4750), (5600, t * 1.8, 280), trim)
    _b("u_shell_signage", (cx, y0 - t * 0.6, z0 + H * 0.80),
       (min(w * 0.45, 9000), t * 0.5, 1500), _mat("m_shell_sign", (0.18, 0.34, 0.54),
                                                   metallic=0.2, roughness=0.5))
    for k in range(5):                                     # louvre vent bank (E wall)
        _b(f"u_shell_louvre_{k}", (x1 + t * 0.3, cy - 2400 + k * 1200, z0 + H * 0.72),
           (t * 0.6, 900, 180), trim)

    # ── #8 SITE CONTEXT + SCALE (Tristan 2026-06-22; NOT in parts) ──
    tar = _mat("m_site_tarmac", (0.17, 0.18, 0.20), metallic=0.0, roughness=0.92)
    _b("u_site_tarmac", (cx, cy, z0 - 70), (w + 30000, d + 30000, 80), tar)
    _b("u_site_road", (cx, y0 - d / 2 - 11000, z0 - 45),
       (9000, 16000, 90), _mat("m_site_road", (0.13, 0.14, 0.16), metallic=0.0, roughness=0.93))
    hivis = _mat("m_site_hivis", (0.96, 0.55, 0.05), metallic=0.0, roughness=0.7)
    trouser = _mat("m_site_trouser", (0.20, 0.22, 0.28), metallic=0.0, roughness=0.7)
    skin = _mat("m_site_skin", (0.78, 0.60, 0.50), metallic=0.0, roughness=0.6)
    for i, (px, py) in enumerate(((cx - 1500, y0 - 3800), (cx + 1200, y0 - 5400),
                                  (cx - 9000, y0 - 4200))):
        fl.add_cyl(f"u_site_person{i}_legs", (px * MM, py * MM, (z0 + 350) * MM),
                   0.15, 700 * MM, trouser, module=None, module_objects=MO)
        _b(f"u_site_person{i}_torso", (px, py, z0 + 1250), (520, 360, 850), hivis)
        fl.add_sphere(f"u_site_person{i}_head", (px * MM, py * MM, (z0 + 1780) * MM),
                      0.16, skin, module=None, module_objects=MO)
    # forklift near the road
    fx, fy = cx + 10000, y0 - 8000
    ylw = _mat("m_site_forklift", (0.95, 0.74, 0.05), metallic=0.3, roughness=0.5)
    _b("u_site_fl_body", (fx, fy, z0 + 950), (1500, 2700, 1500), ylw)
    _b("u_site_fl_cab", (fx, fy + 300, z0 + 2150), (1350, 1500, 1100), trim)
    _b("u_site_fl_mast", (fx, fy - 1550, z0 + 1600), (1300, 220, 3200), trim)
    for s in (-1, 1):
        _b(f"u_site_fl_fork{s}", (fx + s * 420, fy - 2100, z0 + 170), (170, 1500, 130), trim)
    print(f"[univ][shell] ARCHITECTURAL building envelope {w/1000.0:.1f}×{d/1000.0:.1f} m, "
          f"eave {H/1000.0:.1f} m + pitched roof + #9 detail (gutters/downpipes/rooflights/"
          f"signage/louvres) + #8 site (tarmac/road/people/forklift)")
    return 1


def draw_boundary_services(parts, MAT, MO):
    """Draw the EXTERNAL service connections crossing the building boundary (Tristan 2026-06-22:
    "water coming from outside in as the main inlet, and electricity"): a WATER inlet, an
    EFFLUENT discharge, and the POWER feed — each a service-coloured pipe from the relevant
    equipment out to a marker beyond the plant edge. Universal — name-keyed, no class table."""
    ext = _plant_extent_mm(parts)
    if ext is None:
        return 0
    MM, OUT = fl.MM, 7000.0
    x0, x1, y0, y1, _top = ext
    placed = [p for p in parts if getattr(p, "placed_xyz_mm", None)
              and not getattr(p, "_consolidated", False)]
    n = 0

    def _find(keys):
        for p in placed:
            if any(k in (p.name or "").lower() for k in keys):
                return p
        return None

    def _stub(part, mech, label, edge):
        nonlocal n
        if part is None:
            return
        px, py, _pz = part.placed_xyz_mm
        m = _mech_pipe_mat(mech, MAT)
        z = 800.0
        if edge in ("x0", "x1"):
            ex = (x0 - OUT) if edge == "x0" else (x1 + OUT)
            fl.add_cyl(f"u_boundary_{label}", ((ex + px) / 2 * MM, py * MM, z * MM),
                       0.22, abs(px - ex) * MM, m, module=None, module_objects=MO,
                       rotation=(0, math.radians(90), 0))
            mkx, mky = ex, py
        else:
            ey = (y0 - OUT) if edge == "y0" else (y1 + OUT)
            fl.add_cyl(f"u_boundary_{label}", (px * MM, (ey + py) / 2 * MM, z * MM),
                       0.22, abs(py - ey) * MM, m, module=None, module_objects=MO,
                       rotation=(math.radians(90), 0, 0))
            mkx, mky = px, ey
        mk = fl.add_box(f"u_boundary_{label}_marker", (mkx * MM, mky * MM, (z + 300) * MM),
                        (1000.0 * MM, 1000.0 * MM, 1600.0 * MM), m, module=None, module_objects=MO)
        mk.dimensions = (1000.0 * MM, 1000.0 * MM, 1600.0 * MM)
        n += 1

    _stub(_find(("intake", "make-up", "makeup", "make up")), "fluid_supply", "water_in", "x0")
    _stub(_find(("effluent", "discharge")), "fluid_return", "effluent_out", "x1")
    _stub(_find(("generator", "genset", "diesel", "transformer", "main breaker", "incomer")),
          "electrical_bus", "power", "y1")
    if n:
        print(f"[univ][boundary] {n} external service connection(s): water-in / effluent-out / power")
    return n


def add_ground_slab(parts, MAT, MO, bbox_mm=None):
    """STAGE 4. Lay a flat reinforced-concrete DECK under the plant so it visibly SITS
    ON A FLOOR (Tristan 2026-06-21: "everything floating in the air, no floor showing").

    The slab spans the EQUIPMENT footprint (equipment_bbox_mm — the equipment bulk, NOT
    the tall frame/stacks, so the apron hugs the plant) + GROUND_SLAB_MARGIN_MM apron on
    every side; its TOP sits at DECK_Z_MM (the datum every part's underside rests on, so
    the equipment sits ON the slab — no z-fight, nothing buried) and it extends
    GROUND_SLAB_THICK_MM downward. Concrete-grey matte. Named u_ground_slab so it is
    skipped by the parts-manifest (it is the deck, not an equipment item) and recoloured
    as the deck in the INSPECT pass. Universal — footprint-keyed, no per-class logic.

    Returns the slab object."""
    # The FLOOR must sit under EVERY placed part (Tristan 2026-06-22: "the slab does not cover
    # the entire space"). footprint_mm under-reports a qty-N ARRAY's extent (it returned a
    # single-unit footprint, so the slab mis-centred and the tank farm hung off it). So span
    # the ACTUAL drawn EQUIPMENT MESH world-bboxes (the real geometry), + apron — guaranteed
    # to cover everything regardless of array/footprint quirks.
    _SKIP = ("u_pipe_", "u_route_", "u_wire_", "u_skid_", "u_ground_", "u_grid_",
             "u_datum_", "u_dim_", "u_rack_")
    _x0 = _x1 = _y0 = _y1 = None
    try:
        _V = __import__("mathutils").Vector
        for obj in bpy.data.objects:
            if getattr(obj, "type", None) != "MESH" or obj.data is None:
                continue
            if any(obj.name.startswith(s) for s in _SKIP):
                continue
            mw = obj.matrix_world
            for c in obj.bound_box:
                w = mw @ _V(c)
                wx, wy = w.x * 1000.0, w.y * 1000.0
                _x0 = wx if _x0 is None else min(_x0, wx)
                _x1 = wx if _x1 is None else max(_x1, wx)
                _y0 = wy if _y0 is None else min(_y0, wy)
                _y1 = wy if _y1 is None else max(_y1, wy)
    except Exception:
        _x0 = None
    _m = GROUND_SLAB_MARGIN_MM
    if _x0 is None:
        eb = equipment_bbox_mm(parts, margin_mm=GROUND_SLAB_MARGIN_MM)
    else:
        eb = {"x0": _x0 - _m, "x1": _x1 + _m, "y0": _y0 - _m, "y1": _y1 + _m}
    # DEFINITIVE per-part coverage test (Tristan 2026-06-22: stop reporting slab SIZE, test
    # that every part actually STANDS on it). Any part whose footprint pokes past eb → the
    # slab is EXPANDED to include it, then we assert zero uncovered. No part may dangle.
    for _p in parts:
        if not getattr(_p, "placed_xyz_mm", None):
            continue
        _cx, _cy = _p.placed_xyz_mm[0], _p.placed_xyz_mm[1]
        _fx, _fy, _ = footprint_mm(resolved_dims_mm(_p))
        eb["x0"] = min(eb["x0"], _cx - _fx / 2 - _m)
        eb["x1"] = max(eb["x1"], _cx + _fx / 2 + _m)
        eb["y0"] = min(eb["y0"], _cy - _fy / 2 - _m)
        eb["y1"] = max(eb["y1"], _cy + _fy / 2 + _m)
    _uncov = [getattr(_p, "name", "?") for _p in parts if getattr(_p, "placed_xyz_mm", None)
              and not (eb["x0"] <= _p.placed_xyz_mm[0] <= eb["x1"]
                       and eb["y0"] <= _p.placed_xyz_mm[1] <= eb["y1"])]
    print(f"[univ][ground] per-part slab coverage: {len(parts)} parts, "
          f"{len(_uncov)} centre(s) off slab" + (f" → {_uncov[:6]}" if _uncov else " (all on)"))
    w = max(1000.0, eb["x1"] - eb["x0"])
    d = max(1000.0, eb["y1"] - eb["y0"])
    cx = (eb["x0"] + eb["x1"]) / 2.0
    cy = (eb["y0"] + eb["y1"]) / 2.0
    # TOP at DECK_Z_MM → the box centre is half the thickness BELOW the deck datum, so the
    # equipment (underside at DECK_Z_MM) sits exactly on the slab top with no overlap.
    z_centre = DECK_Z_MM - GROUND_SLAB_THICK_MM / 2.0
    mkey = "u_ground_slab_mat"
    if mkey not in MAT:
        MAT[mkey] = fl.make_mat("m_u_ground_slab", fl._to_linear(GROUND_SLAB_COLOUR),
                                kind="concrete")
    slab = fl.add_box(
        "u_ground_slab",
        (cx * fl.MM, cy * fl.MM, z_centre * fl.MM),
        (w * fl.MM, d * fl.MM, GROUND_SLAB_THICK_MM * fl.MM),
        MAT[mkey], module="structure_containment", module_objects=MO)
    # add_box produces HALF the requested size here (confirmed: 55.7 m → obj.dimensions 27.8 m
    # = exactly half; root cause of the deck never covering the tanks — Tristan 2026-06-22).
    # Force the true size by setting obj.dimensions directly (version-independent).
    slab.dimensions = (w * fl.MM, d * fl.MM, GROUND_SLAB_THICK_MM * fl.MM)
    bpy.context.view_layer.update()
    _sd = tuple(round(v / fl.MM) for v in slab.dimensions)
    _sl = tuple(round(v / fl.MM) for v in slab.location)
    print(f"[univ][ground] STAGE 4 floor — REQUESTED {w/1000.0:.1f}×{d/1000.0:.1f} m at "
          f"({cx/1000.0:.1f},{cy/1000.0:.1f}); ACTUAL obj.dimensions={_sd} mm location={_sl} mm "
          f"(if ACTUAL≈half the request, add_box is halving boxes)")
    # DEFINITIVE coverage test against the ACTUAL DRAWN MESHES (not part records — those kept
    # disagreeing with the render). Any equipment mesh whose XY footprint pokes past the drawn
    # slab is named; the slab is then re-grown + redrawn to swallow it, and we re-test. No
    # equipment may overhang the deck. (Tristan 2026-06-22: "it blatantly doesn't cover it".)
    try:
        _SK2 = _SKIP + ("u_control_cabinet",)   # cabinet sits on the deck, judged by centre
        def _offslab(gx0, gx1, gy0, gy1):
            """meshes whose ORIGIN (drawn XY centre) falls outside the KNOWN slab rectangle.
            Uses object translation, NOT bound_box (bound_box read HALF the real size here —
            that bug made the check shrink a correct slab; Tristan 2026-06-22)."""
            bad = []
            for o in bpy.data.objects:
                if getattr(o, "type", None) != "MESH" or o.data is None:
                    continue
                if o.name.startswith("u_ground_") or any(o.name.startswith(s) for s in _SK2):
                    continue                      # the slab itself + pipes/frame/rack (above deck)
                t = o.matrix_world.translation
                mcx, mcy = t.x * 1000.0, t.y * 1000.0
                if not (gx0 <= mcx <= gx1 and gy0 <= mcy <= gy1):
                    bad.append((o.name, round(mcx), round(mcy)))
            return bad
        # slab rectangle is KNOWN from the draw (cx,cy,w,d) — no bound_box guesswork.
        gx0, gx1, gy0, gy1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
        bad = _offslab(gx0, gx1, gy0, gy1)
        for _it in range(4):
            if not bad:
                break
            for _nm, mcx, mcy in bad:
                gx0 = min(gx0, mcx - _m); gx1 = max(gx1, mcx + _m)
                gy0 = min(gy0, mcy - _m); gy1 = max(gy1, mcy + _m)
            cx, cy = (gx0 + gx1) / 2.0, (gy0 + gy1) / 2.0
            w, d = gx1 - gx0, gy1 - gy0
            for o in list(bpy.data.objects):       # REDRAW (delete + re-add), never rescale
                if o.name.startswith("u_ground_slab"):
                    bpy.data.objects.remove(o, do_unlink=True)
            slab = fl.add_box("u_ground_slab", (cx * fl.MM, cy * fl.MM, z_centre * fl.MM),
                              (w * fl.MM, d * fl.MM, GROUND_SLAB_THICK_MM * fl.MM),
                              MAT[mkey], module="structure_containment", module_objects=MO)
            slab.dimensions = (w * fl.MM, d * fl.MM, GROUND_SLAB_THICK_MM * fl.MM)  # add_box halves
            bpy.context.view_layer.update()
            bad = _offslab(gx0, gx1, gy0, gy1)
        if bad:
            print(f"[univ][ground] coverage STILL OFF — {len(bad)} equipment mesh centre(s) off:")
            for _nm, mcx, mcy in bad[:12]:
                print(f"   OFF-SLAB {_nm} centre=({mcx},{mcy})")
        else:
            print(f"[univ][ground] coverage VERIFIED — 0 equipment centres off the deck "
                  f"({w/1000.0:.1f}×{d/1000.0:.1f} m at ({cx/1000.0:.1f},{cy/1000.0:.1f}))")
    except Exception as _e:
        print(f"[univ][ground] coverage check skipped: {_e}")
    return slab


def place_process_plant(parts, regions, topology, MAT, MO):
    """PROCESS-PLANT strategy (the original, e-fuel-tuned pipeline). Lay the
    physical parts out as a process TRAIN driven by the CONNECTIVITY GRAPH (the
    flow topology) — each stage adjacent to the stage it feeds, feed→reaction→
    separation→upgrading→product reading left→right, with the non-flow regions
    (utilities / electrical / control / instruments) pushed to a back row — on a
    TALL braced open skid that hugs the equipment bulk, then build the overhead
    pipe-rack structure and route every topology edge as an overhead-rack run
    (round process pipe / copper cable tray). Returns
    (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    # 4. place parts — GRAPH-DRIVEN flow layout (the process train). Compute the
    #    flow order + periphery from the connectivity graph, hand it to place_all,
    #    and always reset the global so no other family/call sees it. Empty flow
    #    train (a design with no usable flow edge) → place_all's rank fallback.
    global _PLANT_FLOW_PLAN
    flow_regions, periphery = flow_order_regions(parts, topology)
    print(f"[univ][flow] flow order (feed→product): {flow_regions}")
    print(f"[univ][flow] periphery (non-flow → back row): {periphery}")
    _PLANT_FLOW_PLAN = (flow_regions, periphery) if flow_regions else None
    try:
        bbox, region_centres = place_all(parts, regions, MAT, MO)
    finally:
        _PLANT_FLOW_PLAN = None
    print(f"[univ] plant bbox (mm): {bbox}")

    # 4b. UNIVERSAL LAYOUT OPTIMISER (DEFAULT-ON 2026-06-22, Tristan's call; LAYOUT_OPTIMISE=0
    #     to disable). Re-flow the placed equipment to the deterministic CRAFT minimum-weighted-
    #     pipe-run layout (the connection ledger is the weighted input) so connected parts sit
    #     NEAR each other — the skid frame + pipe rack + routing below re-derive from the (now
    #     tighter) bbox + anchors. Validated on RAS: pipe run −36% (2860→1828 m), same-elevation
    #     crossings 45→10, footprint +2% (just more square) — the decisive fix for the
    #     "spread-out plant → long flying pipe runs" clutter. try/except below makes it a no-op
    #     on any layout it can't improve. Only reached on the process-plant placement path.
    if os.environ.get("LAYOUT_OPTIMISE", "1").strip().lower() not in ("0", "false", "no", "off"):
        try:
            bbox = _apply_layout_optimiser(parts, topology, bbox)
            print(f"[univ] plant bbox after layout-optimise (mm): {bbox}")
        except Exception as _e:
            print(f"[univ][layout] optimiser skipped (error): {_e}")
    # Field instruments → onto their host equipment (kills the floating instrument band).
    # Runs whenever the layout is active (independent of the optimiser env gate) so the
    # signal 'combs' never hang in space. Kill: CHAIN_SKIP_INSTRUMENT_COLOCATE=1.
    if os.environ.get("CHAIN_SKIP_INSTRUMENT_COLOCATE", "") in ("", "0", "false", "no"):
        try:
            _colocate_field_instruments(parts)
        except Exception as _e:
            print(f"[univ][layout] instrument co-locate skipped (error): {_e}")
    # Control system → ONE cabinet (Tristan 2026-06-22). HERO-ONLY (not _INSPECT_MODE): the
    # INSPECT=1 technical render keeps the individual control parts so the single-line + P&ID +
    # ledger see the full electrical system (consolidating them in the chain render emptied the
    # SLD + broke connectivity). Universal: keys on the I&C/control modules. Kill: CHAIN_SKIP_
    # CONTROL_CABINET=1.
    if (not _INSPECT_MODE) and os.environ.get("CHAIN_SKIP_CONTROL_CABINET", "") in ("", "0", "false", "no"):
        try:
            _consolidate_control_cabinet(parts, MAT, MO)
        except Exception as _e:
            print(f"[univ][layout] control-cabinet consolidate skipped (error): {_e}")
    # HIDE field instruments — HERO-ONLY. INSPECT=1 keeps them so the BoM/P&ID/ledger + the
    # instrument-coverage audit are intact; only the materialed hero hides them.
    if not _INSPECT_MODE:
        try:
            _hide_field_instruments(parts)
        except Exception as _e:
            print(f"[univ][layout] hide-instruments skipped (error): {_e}")
    # UNIVERSAL 'nothing floats' — drop any equipment mesh hanging above the deck onto it.
    try:
        _ground_floaters(parts)
    except Exception as _e:
        print(f"[univ][layout] ground-floaters skipped (error): {_e}")

    # 5. TALL braced skid frame that HUGS THE EQUIPMENT BULK (Fix 1, FRAME FIT).
    #    BOTH the footprint AND the height target come from the NON-tall equipment
    #    only (is_tall_for_frame excludes stacks/flares/slim towers); those tall
    #    items poke THROUGH the roof rather than dragging the frame up + out.
    equip_bbox = equipment_bbox_mm(parts, margin_mm=0.0)   # frame adds FRAME_MARGIN
    equip_tops = [p.anchors["top"][2] for p in parts
                  if p.anchors and not is_tall_for_frame(p)]
    tallest = max(equip_tops) if equip_tops else SKID_FRAME_MIN_HEIGHT_MM
    frame_h = max(SKID_FRAME_MIN_HEIGHT_MM, tallest * SKID_FRAME_HEIGHT_FRAC)
    # The SKID FRAME + PIPE RACK are thin decorative steel (u_skid_*rail*/cross + u_rack_
    # stringers). On a clean hero they render as a spray of thin "random lines" lying on the
    # floor + overhead (Tristan 2026-06-22: "random lines … not connected to anything") — the
    # slab already grounds the plant and pipes route port-to-port independently of the rack,
    # so the skeleton adds clutter, not meaning. DEFAULT OFF; BLENDER_SKID_FRAME=1 restores it.
    if os.environ.get("BLENDER_SKID_FRAME", "").strip().lower() in ("1", "true", "yes", "on"):
        build_skid_frame(equip_bbox, frame_h, MAT, MO)
        build_pipe_rack(equip_bbox, frame_h, MAT, MO)

    # 6. route topology on a real OVERHEAD PIPE-RACK SPINE. FLOW LAYOUT: the spine
    #    runs through the MIDDLE of the process TRAIN (the flow regions) so flow
    #    taps are short — _make_rack_plan_for_flow_train bisects the train, NOT the
    #    train↔periphery aisle (which sits far behind the row and would force every
    #    flow run to detour up to it). Falls back to the published inter-bank aisle
    #    when no flow train was placed. Reset the train handoff afterwards.
    global _PLANT_FLOW_TRAIN_REGIONS
    rack_base_z = rack_elevation_mm(frame_h)
    try:
        rack_plan = _make_rack_plan_for_flow_train(bbox, rack_base_z, parts, axis="x")
        routed, unresolved = route_topology(topology, parts, MAT, MO,
                                            frame_top_mm=frame_h,
                                            region_centres=region_centres,
                                            bbox_mm=bbox, rack_plan=rack_plan)
    finally:
        _PLANT_FLOW_TRAIN_REGIONS = None
    print(f"[univ] topology routed = {routed}/{len(topology)}; "
          f"unresolved = {len(unresolved)}")
    return bbox, region_centres, frame_h, routed, unresolved


# ═══════════════════════════════════════════════════════════════════════════
# GENERIC-ASSEMBLY strategy (2026-06-11) — the UNIVERSAL default for ANY
# archetype that fits no specific family: a robot, an AUV, a small medical
# device, a vehicle. The goal is a SENSIBLE generic render — parts grouped by
# their owning MODULE, each drawn at its real size (its classified shape if that
# shape is sensible, else a neutral BOX sized to the real dims), the modules laid
# out as compact bays, the topology drawn as routed connectors between the parts,
# and a LIGHT optional bounding frame (a thin floor pad + a low perimeter rail) —
# NOT the tall braced process skid, NOT the overhead pipe rack, NOT forced
# vessels. NEUTRAL inspect colours keyed by MODULE index so the assembly reads as
# grouped-by-subsystem (M1 blue, M2 teal, …), not by process-vessel type.
# ───────────────────────────────────────────────────────────────────────────
# DENSITY: parts pack tighter than the plant (a device is small + dense, not a
# plant on a skid). A LOW floor + perimeter rail keeps it reading as one assembled
# unit without the tall-frame occlusion. Topology routes JUST above the equipment.
# ═══════════════════════════════════════════════════════════════════════════

GA_FRAME_MARGIN_MM   = 500.0   # clearance from the equipment bulk to the light frame
GA_FRAME_RAIL_MM     = 90.0    # section of the low floor pad / perimeter rail members
GA_ROUTE_CLEARANCE_MM = 700.0  # topology routes this far above the tallest equipment
GA_FRAME_MIN_HEIGHT_MM = 1200.0  # a flat assembly still gets a shallow frame box
# Module-index INSPECT palette — a neutral, evenly-spaced, light-mode set so each
# MODULE reads as one colour group (the assembly's subsystems), distinct by hue but
# all low-saturation so SHAPE still reads. Cycled by module index; universal.
GA_MODULE_COLOURS = [
    (0.42, 0.55, 0.72),   # M-index 0 — blue-steel
    (0.30, 0.66, 0.62),   # 1 — teal
    (0.80, 0.72, 0.56),   # 2 — tan
    (0.62, 0.58, 0.74),   # 3 — muted violet
    (0.56, 0.70, 0.50),   # 4 — sage green
    (0.82, 0.62, 0.46),   # 5 — terracotta
    (0.50, 0.64, 0.78),   # 6 — sky steel
    (0.74, 0.66, 0.40),   # 7 — ochre
    (0.46, 0.68, 0.70),   # 8 — sea grey-teal
    (0.70, 0.56, 0.62),   # 9 — dusty rose
    (0.58, 0.62, 0.50),   # 10 — olive grey
    (0.52, 0.56, 0.66),   # 11 — slate
]
# A part whose classified shape is a PROCESS-PLANT vessel/tower/stack/tank should
# NOT render as a vessel in a generic assembly (a robot's "controller cabinet" is
# fine as a cabinet, but a stray "tank"/"column"/"reactor"/"stack" classification
# on a device part would draw a chemical vessel). These shapes are RE-MAPPED to a
# neutral BOX (sized to the same dims) so the generic render never shows a vessel.
GA_VESSEL_SHAPES = {"tall_column", "tall_vessel", "vertical_vessel",
                    "horizontal_vessel", "tank", "stack", "inline_spool"}
# Below this layout scale the assembly is a small DEVICE — render its rotating
# machines (pump/compressor) as boxes too, because build_machine floors the body
# at ~400 mm and would balloon a few-mm device pump. A machine-scale assembly
# (robot/AGV) stays above this and keeps its machines as machines.
GA_MACHINE_AS_BOX_BELOW_SCALE = 0.30

# Module-level handoffs (set by place_generic_assembly for the INSPECT recolour +
# the contract quantities), mirroring the other placers' module-level pattern.
_GA_QUANTITIES = None
_GA_PART_MODULE_COLOUR = {}   # part-object-prefix → module-index rgb (INSPECT)

# The plant-scale layout constants (MIN_REGION_WIDTH 3.5 m, BANK pitch 8 m, the
# big/med/small block DYs …) assume METRE-scale process vessels. A centimetre-scale
# DEVICE (an insulin pump: 13 mm median part) laid with those constants scatters a
# handful of specks across a 14 m empty frame. The generic placer therefore SCALES
# the layout spacing to the parts' characteristic size, so a small device packs into
# a small bench + a big machine keeps the roomy plant-grade spacing. These are the
# layout globals it scales (a copy is restored after place_all).
# DECK_Z_MM (the 300 mm skid-deck datum every part sits on) is scaled too — a
# 14 mm pod on a fixed 300 mm deck floats on a tall stand above its own floor pad.
_GA_SCALED_GLOBALS = ("MIN_REGION_WIDTH_MM", "MAX_REGION_WIDTH_MM", "REGION_GAP_MM",
                      "PART_GAP_MM", "BIG_BLOCK_DY_MM", "MED_BLOCK_DY_MM",
                      "BANK_LANE_PITCH_MM", "BANK_COMPACT_GAP_MM", "FRAME_MARGIN_MM",
                      "DECK_Z_MM")
GA_LAYOUT_REF_MM   = 800.0   # the part footprint-side the plant constants assume
GA_LAYOUT_SCALE_MIN = 0.08   # floor: a tiny device still spaces parts ≥ 8% of plant
GA_LAYOUT_SCALE_MAX = 1.0    # never UP-scale past the plant-grade spacing


def _ga_layout_scale(parts):
    """Scale factor for the generic-assembly layout spacing = the parts' MEDIAN
    footprint-side ÷ the plant reference (GA_LAYOUT_REF_MM), clamped to
    [GA_LAYOUT_SCALE_MIN, GA_LAYOUT_SCALE_MAX]. A device whose parts are ~13 mm
    gets ~0.08 (a tight bench); a machine whose parts are ~800 mm gets 1.0 (the
    full plant-grade spacing). Deterministic + universal — derived from geometry,
    no per-class data."""
    import statistics as _st
    sides = []
    for p in parts:
        fx, fy, _ = footprint_mm(resolved_dims_mm(p))
        sides.append((max(1.0, fx) * max(1.0, fy)) ** 0.5)
    if not sides:
        return 1.0
    med = _st.median(sides)
    return max(GA_LAYOUT_SCALE_MIN, min(GA_LAYOUT_SCALE_MAX, med / GA_LAYOUT_REF_MM))


def _ga_module_index_map(parts):
    """Map each MODULE id present in the parts to a stable 0-based index, in
    FIRST-APPEARANCE order across the parts list (which already follows the
    authored module order). Deterministic + universal."""
    order = []
    for p in parts:
        if p.module_id not in order:
            order.append(p.module_id)
    return {mid: i for i, mid in enumerate(order)}


def place_generic_assembly(parts, regions, topology, MAT, MO):
    """GENERIC-ASSEMBLY strategy — the universal default. Lay the parts grouped by
    MODULE region using the SHARED region/banking layout (place_all), each part
    built at its real size by build_part (its classified shape, EXCEPT process
    vessels/towers/tanks which are re-mapped to a neutral sized box so a device
    never shows a chemical vessel), wrap the bulk in a LIGHT floor pad + low
    perimeter rail (not the tall skid / pipe rack), and route every topology edge
    as a connector between the resolved part anchors at a low overhead elevation.
    Same return tuple as the other strategies:
    (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    # 1. RE-MAP shapes that would render WRONG in a generic assembly to a neutral
    #    sized box (dims preserved → footprint + silhouette unchanged, only the shape
    #    family changes). TWO cases:
    #      (a) process VESSELS/towers/tanks — a stray 'tank'/'column'/'reactor'
    #          classification on a device part must never draw a chemical vessel.
    #      (b) at DEVICE SCALE, rotating MACHINES (pump/compressor) — build_machine
    #          floors the body at ~400 mm, so a 6 mm 'lead-screw micro pump' would
    #          balloon into a 0.4-0.8 m machine among 14 mm parts. A box honours the
    #          real 6 mm dims. A machine-scale assembly (robot/AGV, scale≈1) keeps
    #          its machines AS machines (a real pump/motor reads better as a machine).
    scale = _ga_layout_scale(parts)
    device_scale = scale < GA_MACHINE_AS_BOX_BELOW_SCALE
    remap_shapes = set(GA_VESSEL_SHAPES)
    if device_scale:
        remap_shapes |= {"pump", "compressor"}
    remapped = 0
    for p in parts:
        if p.shape in remap_shapes:
            p.shape = "box"
            remapped += 1
    midx = _ga_module_index_map(parts)
    print(f"[univ][generic] {len(parts)} parts in {len(midx)} module groups; "
          f"re-mapped {remapped} vessel/machine-shaped part(s) to neutral box "
          f"(device_scale={device_scale})")

    # 2. LAYOUT — reuse the shared region/banking placement, but SCALE its spacing
    #    constants to the parts' size (so a centimetre device packs into a small
    #    bench instead of scattering across a metre-scale empty frame). place_all
    #    groups parts by region into compact, square-ish bays (big parts back, medium
    #    middle, small front), builds each via build_part (setting anchors + placed
    #    centre), and returns the equipment bbox + region centres. No plant assumption
    #    lives in place_all — it is pure grouped layout — so it is exactly right here.
    saved = {k: globals()[k] for k in _GA_SCALED_GLOBALS}
    try:
        for k in _GA_SCALED_GLOBALS:
            globals()[k] = saved[k] * scale
        print(f"[univ][generic] layout scale = {scale:.3f} "
              f"(MIN_REGION_WIDTH {globals()['MIN_REGION_WIDTH_MM']/1000:.2f} m, "
              f"REGION_GAP {globals()['REGION_GAP_MM']/1000:.2f} m, "
              f"BANK_PITCH {globals()['BANK_LANE_PITCH_MM']/1000:.2f} m)")
        bbox, region_centres = place_all(parts, regions, MAT, MO)
    finally:
        for k in _GA_SCALED_GLOBALS:
            globals()[k] = saved[k]
    print(f"[univ][generic] assembly bbox (mm): {bbox}")

    # 3. LIGHT bounding frame — a thin floor pad + a low perimeter rail that HUGS
    #    the equipment outline (NOT the tall braced skid + overhead pipe rack). It
    #    reads as the bench/baseplate the assembly sits on. Named u_skid_* so the
    #    INSPECT recolour renders it as the faint wireframe (equipment shows above).
    #    The frame-height floor + route clearance SCALE with the assembly (a 14 mm
    #    pod must not sit under a 1.2 m roof) but never below a small absolute floor.
    equip_bbox = equipment_bbox_mm(parts, margin_mm=0.0)
    equip_tops = [p.anchors["top"][2] for p in parts if p.anchors]
    tallest = max(equip_tops) if equip_tops else GA_FRAME_MIN_HEIGHT_MM
    frame_min_h = max(120.0, GA_FRAME_MIN_HEIGHT_MM * scale)
    frame_top_mm = max(frame_min_h, tallest + GA_FRAME_RAIL_MM * scale)
    _build_generic_frame(equip_bbox, frame_top_mm, MAT, MO, scale=scale)

    # 4. TOPOLOGY — route every edge as a connector between the resolved part
    #    anchors, at a LOW overhead elevation just above the equipment (there is no
    #    tall frame to hang an overhead rack from). Reuses the shared route_topology
    #    (nozzle pick + mechanism colours + abstract-endpoint resolver) so a robot's
    #    power/data/control edges + an AUV's electrical/control edges all draw. The
    #    pipe DIAMETER + per-run Z stagger SCALE with the assembly so a cm-scale
    #    device's connectors don't render as a 190 mm tube dwarfing the parts.
    route_top_mm = tallest + max(120.0, GA_ROUTE_CLEARANCE_MM * scale)
    # Scale the ROUTING constants too (lane/tier pitch, min leg, lane span, the
    # direct-jumper threshold) so a centimetre-scale device's spine geometry shrinks
    # with it — a fixed 300 mm riser / 13 m direct cap would dwarf a 14 mm pod.
    # Scale the sized-connection FALLBACK + MIN-RENDER diameters with the assembly
    # too (a cm-scale device's un-rated data/control connectors must shrink with it —
    # a fixed 60 mm fallback / 12 mm floor would dwarf a 14 mm pod). A device's edges
    # are mostly data/control (no flow rating) so they take the fallback path; scaling
    # it keeps them proportional. Rated edges (rare on a device) still size from the
    # real diameter, which is already physically scaled.
    _GA_ROUTE_GLOBALS = ("PIPE_DIA_MM", "RACK_TIER_PITCH_MM", "RACK_LANE_PITCH_MM",
                         "RACK_LATERAL_MIN_MM", "RACK_LANE_SPAN_MM", "RACK_DIRECT_MAX_MM",
                         "CONN_FALLBACK_DIA_MM", "CONN_MIN_RENDER_DIA_MM")
    _GA_ROUTE_FLOORS = {"PIPE_DIA_MM": 12.0, "RACK_TIER_PITCH_MM": 20.0,
                        "RACK_LANE_PITCH_MM": 24.0, "RACK_LATERAL_MIN_MM": 20.0,
                        "RACK_LANE_SPAN_MM": 160.0, "RACK_DIRECT_MAX_MM": 200.0,
                        "CONN_FALLBACK_DIA_MM": 6.0, "CONN_MIN_RENDER_DIA_MM": 3.0}
    route_saved = {k: globals()[k] for k in _GA_ROUTE_GLOBALS}
    try:
        for k in _GA_ROUTE_GLOBALS:
            globals()[k] = max(_GA_ROUTE_FLOORS[k], route_saved[k] * scale)
        routed, unresolved = route_topology(topology, parts, MAT, MO,
                                            frame_top_mm=route_top_mm,
                                            region_centres=region_centres,
                                            bbox_mm=bbox)
    finally:
        for k in _GA_ROUTE_GLOBALS:
            globals()[k] = route_saved[k]
    print(f"[univ][generic] topology routed = {routed}/{len(topology)}; "
          f"unresolved = {len(unresolved)} (pipe dia "
          f"{max(12.0, route_saved['PIPE_DIA_MM'] * scale):.0f} mm)")

    # 5. record each part-object prefix → its MODULE-index colour for the INSPECT
    #    recolour (so the assembly reads grouped by subsystem, not by vessel type).
    global _GA_PART_MODULE_COLOUR
    _GA_PART_MODULE_COLOUR = {}
    for p in parts:
        rgb = GA_MODULE_COLOURS[midx[p.module_id] % len(GA_MODULE_COLOURS)]
        _GA_PART_MODULE_COLOUR[_part_prefix(p.name)] = rgb

    return bbox, region_centres, frame_top_mm, routed, unresolved


def _build_generic_frame(bbox_mm, frame_top_mm, MAT, MO, scale=1.0):
    """A LIGHT bench/baseplate for a generic assembly: a thin floor pad (perimeter
    base rails + a few cross members, via the lib skid primitive) PLUS a single low
    perimeter rail at frame_top so the assembly reads as ONE unit sitting on a
    bench — WITHOUT the tall braced posts / X-bracing / overhead pipe-rack of the
    process skid. Named u_skid_* so apply_inspection_materials renders it as the
    faint wireframe the equipment shows through. The rail section + floor margin
    SCALE with the assembly so a 14 mm device doesn't sit in a 90 mm-bar cage.
    Universal + deterministic."""
    margin = max(40.0, GA_FRAME_MARGIN_MM * scale)
    x0, x1 = bbox_mm["x0"] - margin, bbox_mm["x1"] + margin
    y0, y1 = bbox_mm["y0"] - margin, bbox_mm["y1"] + margin
    w, d = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    m = max(8.0, GA_FRAME_RAIL_MM * scale)
    sid = STRUCTURE_MODULE_ID
    if sid not in MO:
        MO[sid] = []
    steel = fl.make_mat("m_ga_steel", (0.45, 0.47, 0.52), metallic=0.7, roughness=0.45)
    deck = fl.make_mat("m_ga_deck", (0.30, 0.34, 0.40), metallic=0.4, roughness=0.5)

    # Thin floor pad (base rails + cross members + a deck) — the bench the assembly
    # sits on. Low height so it never occludes the equipment.
    base_h = max(40.0, m * 2)
    fl.prim_skid_frame("u_skid_base", w, d, base_h, (cx, cy, 0.0),
                       material=steel, material_deck=deck,
                       n_cross_members=max(2, int(w / max(400.0, 2600.0 * scale))),
                       module=sid, module_objects=MO)

    def _mm3(t):
        return tuple(c * fl.MM for c in t)

    # 4 short corner posts + a single low perimeter rail at frame_top — a light
    # cage outline, no bracing. Skipped if the assembly is essentially flat.
    H = max(base_h + m, frame_top_mm)
    if H - base_h > m * 1.5:
        for px in (x0 + m / 2, x1 - m / 2):
            for py in (y0 + m / 2, y1 - m / 2):
                fl.add_box(f"u_skid_post_{px:.0f}_{py:.0f}",
                           _mm3((px, py, base_h + (H - base_h) / 2)),
                           _mm3((m, m, H - base_h)), steel,
                           module=sid, module_objects=MO)
        for (sx, sy, sw, sd) in [(cx, y0 + m / 2, w, m), (cx, y1 - m / 2, w, m),
                                 (x0 + m / 2, cy, m, d), (x1 - m / 2, cy, m, d)]:
            fl.add_box(f"u_skid_toprail_{sx:.0f}_{sy:.0f}",
                       _mm3((sx, sy, H - m / 2)), _mm3((sw, sd, m)),
                       steel, module=sid, module_objects=MO)
    print(f"[univ][generic] light frame: {w/1000:.1f}×{d/1000:.1f} m floor pad, "
          f"{H/1000:.1f} m perimeter rail")


# ── RACK-FARM strategy config (mm) ─────────────────────────────────────────
# A battery energy storage system reads as ROWS OF TALL NARROW RACK CABINETS in
# neat lines with AISLES between them, inside a shipping-container enclosure, with
# the power-conversion + thermal balance-of-plant lined up along one end. These
# constants set that look; all derived from the engineering contract's rack grid
# (rack_count / cells_per_rack / parallel_strings) so the count is data-driven.
RACK_W_MM          = 600.0    # one battery rack cabinet width (along the row)
RACK_D_MM          = 850.0    # rack depth (front-to-back)
RACK_H_MM          = 2200.0   # rack height (tall narrow cabinet, like the templates)
RACK_PITCH_MM      = 720.0    # centre-to-centre pitch within a row (rack_w + gap)
RACK_AISLE_MM      = 1500.0   # walking aisle between back-to-back rack rows
RACK_ROW_GAP_MM    = 1500.0   # end gap before the balance-of-plant lineup
RACK_MAX_PER_ROW   = 10       # cap a single row's length; wrap to more rows beyond
BOP_LANE_W_MM      = 2400.0   # depth of the balance-of-plant lane along the end wall
BOP_GAP_MM         = 500.0    # gap between successive BoP skids in the lineup
CONTAINER_MARGIN_MM = 700.0   # clearance from racks+BoP bulk to the container walls
CONTAINER_WALL_MM  = 90.0     # container wall/roof thickness
# Default rack grid when the contract is silent (so an unparametrised BESS still
# renders sensibly) — a single 40-ft-container-ish 2-row × N layout.
RACK_FALLBACK_COUNT = 14
# ── Rack MODULE-DETAIL config (Fix 2, 2026-06-10) ───────────────────────────
# A solid blue rack read as a block. Real battery racks are a stack of discrete
# pack/battery modules behind a doored frame. We divide the rack's cell height
# into N stacked modules separated by thin gaps, each module a recessed dark box
# with a slim front fascia, + a thin front-door frame around the whole face — so
# the silhouette reads as a battery rack, not a monolith. N is data-driven from
# cells_per_rack (clamped to a sensible 6-10), else RACK_MODULES_DEFAULT.
RACK_MODULE_MIN     = 6       # fewest module shelves drawn in a rack
RACK_MODULE_MAX     = 10      # most module shelves drawn in a rack
RACK_MODULES_DEFAULT = 8      # when cells_per_rack is silent
# Compute-rack SLED count (denser than battery modules — the 1U/2U server look).
RACK_SLED_MIN       = 8
RACK_SLED_MAX       = 14
RACK_SLED_BONUS     = 3       # sleds = module-count + this, clamped to MIN..MAX
# Compute-sled FRONT-FACE detail (Task 2026-06-11): each server sled gets a thin
# full-width front BEZEL + a small row of status-LED dots + a row of drive-bay
# slots so a rack reads as STACKED 1U/2U SERVERS, not a plain cabinet. Counts
# capped so 14 racks × ~11 sleds stays sane (instanced, a few details per sled).
RACK_SLED_N_LEDS    = 3       # status-LED dots per sled (left cluster, emissive)
RACK_SLED_N_BAYS    = 4       # drive-bay slots per sled (right row)
# Hard cap on the number of FACE-DETAIL objects (bezel + LEDs + bays) per rack;
# once hit, remaining sleds get the bezel only (still reads as a stacked server),
# so a tall (14-sled) rack can't blow the object budget.
RACK_COMPUTE_FACE_DETAIL_CAP = 110
RACK_MODULE_GAP_MM  = 26.0    # thin gap between successive stacked modules
RACK_DOOR_FRAME_MM  = 45.0    # thickness of the front-door frame stiles/rails
RACK_TOP_RESERVE_MM = 360.0   # head/foot reserve of the cabinet not given to modules


def _derive_rack_grid(quantities, parts):
    """Decide (n_racks, n_rows, racks_per_row) for the rack farm, deterministically.
    Primary signal: the engineering contract's rack_count (and parallel_strings_total
    as a cross-check). Fallback: count the parts whose NAME marks them a rack/module
    (so an unparametrised design still gets a sane grid), else RACK_FALLBACK_COUNT.
    Rows are chosen so each row is ≤ RACK_MAX_PER_ROW and the grid stays compact
    (≈ as many rows as keep racks_per_row ≤ a container-ish 8-10). Returns the
    triple + the basis string for logging."""
    rc = qval(quantities, "rack_count")
    if rc is None:
        rc = qval(quantities, "parallel_strings_total")
        basis = "parallel_strings_total" if rc is not None else None
    else:
        basis = "rack_count"
    if rc is None:
        # count rack/module-named parts as a proxy (excludes cells, which are the
        # thousands we deliberately do NOT render one-by-one)
        rack_named = sum(1 for p in parts
                         if re.search(r"\brack\b|\bmodule\b", str(p.name), re.IGNORECASE)
                         and not re.search(r"\bcell\b", str(p.name), re.IGNORECASE))
        rc = rack_named if rack_named >= 4 else RACK_FALLBACK_COUNT
        basis = f"name-count({rack_named})" if rack_named >= 4 else "fallback"
    n_racks = max(2, int(round(rc)))
    # pick rows: minimise rows while keeping racks_per_row ≤ RACK_MAX_PER_ROW.
    n_rows = max(1, math.ceil(n_racks / RACK_MAX_PER_ROW))
    racks_per_row = math.ceil(n_racks / n_rows)
    return n_racks, n_rows, racks_per_row, basis


def _rack_module_count(cells_per_rack):
    """How many stacked battery-module shelves to draw in ONE rack. Data-driven
    from cells_per_rack (more cells → more shelves) clamped to RACK_MODULE_MIN..
    RACK_MODULE_MAX; RACK_MODULES_DEFAULT when the contract is silent. Universal —
    a server/switchgear rack-farm with no cell count just gets the default."""
    if not cells_per_rack or cells_per_rack <= 0:
        return RACK_MODULES_DEFAULT
    # ~ one shelf per 30-40 prismatic cells, clamped to the readable band.
    n = int(round(cells_per_rack / 36.0))
    return max(RACK_MODULE_MIN, min(RACK_MODULE_MAX, n))


def _build_compute_sled_face(nm, cam_face_y, cx, mcz, mod_w, mod_h, bezel_mat,
                             led_mat, bay_mat, rack_mod, MO, with_detail=True):
    """The CAMERA-FACING (−Y) face of ONE server sled, so a compute rack reads as
    STACKED 1U/2U SERVERS rather than a plain cabinet (Task 2026-06-11). The hero /
    iso / front inspection cameras all view the rack block from the −Y side, so the
    server detail MUST go on the −Y face (the +Y face is the hidden BACK). Builds:
      • a thin FULL-WIDTH front BEZEL plate proud of the sled face in −Y (the
        dominant 'a server lives in this slot' cue);
      • a small left cluster of RACK_SLED_N_LEDS status-LED dots (named '…_led{k}'
        so the INSPECT recolour makes them GLOW — the lit activity/power LEDs);
      • a right row of RACK_SLED_N_BAYS drive-BAY slots (the 2.5"/3.5" carriers).
    `cam_face_y` = the sled's −Y face plane (mm); detail projects in −Y toward the
    camera. `with_detail=False` draws the bezel ONLY (past the per-rack detail cap so
    a tall rack stays within budget). Instanced — a handful of boxes per sled."""
    bezel_t = 60.0                                   # bezel depth (proud of the face)
    by = cam_face_y - bezel_t / 2                     # bezel centre, proud in −Y
    bezel_h = mod_h * 0.86                            # near-full sled height
    bezel_w = mod_w * 0.96                            # near-full sled width
    # ── full-width front bezel plate (the dominant stacked-server cue) ──
    fl.add_box(f"{nm}_bezel",
               (cx * fl.MM, by * fl.MM, mcz * fl.MM),
               (bezel_w * fl.MM, bezel_t * fl.MM, bezel_h * fl.MM),
               bezel_mat, module=rack_mod, module_objects=MO)
    if not with_detail:
        return
    face_y = cam_face_y - bezel_t - 20.0             # LEDs/bays sit PROUD of the bezel
    # ── status-LED dots (left cluster) — chunky discs, emissive in INSPECT ──
    led_x0 = cx - bezel_w * 0.42                      # LED cluster at the LEFT edge
    led_r = max(0.016, mod_h * 0.10 * fl.MM)          # readable at rack-farm zoom
    led_pitch = bezel_w * 0.085
    for k in range(RACK_SLED_N_LEDS):
        lx = led_x0 + k * led_pitch
        fl.add_cyl(f"{nm}_led{k}",
                   (lx * fl.MM, face_y * fl.MM, mcz * fl.MM),
                   led_r, 44.0 * fl.MM, led_mat,
                   module=rack_mod, module_objects=MO,
                   rotation=(math.radians(90), 0, 0))
    # ── drive-bay slots (right row) — recessed vertical carriers, clearly proud ──
    bay_x0 = cx - bezel_w * 0.04                      # bays span the centre→right
    bay_span = bezel_w * 0.56
    bay_pitch = bay_span / RACK_SLED_N_BAYS
    bay_w = bay_pitch * 0.66                          # slot width (< pitch → reveal)
    for k in range(RACK_SLED_N_BAYS):
        bx = bay_x0 + (k + 0.5) * bay_pitch
        fl.add_box(f"{nm}_bay{k}",
                   (bx * fl.MM, face_y * fl.MM, mcz * fl.MM),
                   (bay_w * fl.MM, 40.0 * fl.MM, bezel_h * 0.66 * fl.MM),
                   bay_mat, module=rack_mod, module_objects=MO)


def _build_battery_rack(nm, cx, y_row, deck_z_mm, cells_per_rack,
                        frame_mat, cell_mat, busbar_mat, steel, MAT,
                        rack_mod, MO, flavour="battery"):
    """One RACK CABINET WITH horizontal-division detail (Fix 2, 2026-06-10;
    generalised to compute racks 2026-06-10). The divisions must read from EVERY
    judge camera (front-elevation looks at the rack BACK, side + iso see the ±Y
    faces at an angle), so the detail is built CAMERA-AGNOSTIC: a vertical stack of
    N full-depth, full-width horizontal UNITS separated by thin DARK spacer bands
    that span the whole rack depth — a viewer from ANY direction sees unit bands cut
    by dark shelf-lines, never a monolith. On top: a thin front-door frame (stiles +
    rails) + a slim fascia strip per unit on the +Y face + a vertical bus/cable
    spine + a plinth.

    `flavour` selects the SAME rows-of-cabinets geometry with role-appropriate skin:
      • 'battery' — battery-blue MODULES + a copper DC bus stripe (a BESS rack).
      • 'compute' — light-grey SERVER SLEDS + a slim dark cable spine (a server
        rack: the bands read as horizontal 1U/2U sleds, the dominant data-centre
        cue). Same geometry, swapped material + bus colour. The unit count is the
        sled count (a touch denser than battery modules).
      • 'generic' — neutral cabinet bays, grey skin.
    Deterministic + universal: keyed only on the rack constants + cells_per_rack."""
    # ── flavour skin: module/sled body colour + bus colour ──
    if flavour == "compute":
        body_mat = _bop_secondary_mat(MAT, "sled", (0.62, 0.64, 0.68), 0.55, 0.42)
        bus_mat = _bop_secondary_mat(MAT, "cablespine", (0.14, 0.15, 0.18), 0.30, 0.55)
        # server-face detail materials: dark bezel plate, lit-green status LEDs
        # (emissive in INSPECT via the _led recolour), dark recessed drive bays.
        bezel_mat = _bop_secondary_mat(MAT, "sledbezel", (0.20, 0.21, 0.24), 0.35, 0.50)
        led_mat = _bop_secondary_mat(MAT, "sledled", (0.30, 0.95, 0.45), 0.20, 0.30)
        bay_mat = _bop_secondary_mat(MAT, "sledbay", (0.10, 0.11, 0.13), 0.30, 0.55)
    elif flavour == "generic":
        body_mat = _bop_secondary_mat(MAT, "genbay", (0.50, 0.52, 0.56), 0.45, 0.45)
        bus_mat = busbar_mat
    else:  # battery
        body_mat = frame_mat
        bus_mat = busbar_mat
    w, d, h = RACK_W_MM, RACK_D_MM, RACK_H_MM
    cz_mid = deck_z_mm + h / 2
    front_y = y_row + d / 2                        # the +Y cabinet face plane
    # ── thin dark base shell so the rack edges/corners read even at the gap lines ──
    fl.add_box(f"{nm}_frame",
               (cx * fl.MM, y_row * fl.MM, cz_mid * fl.MM),
               (w * fl.MM, d * fl.MM, h * fl.MM),
               cell_mat, module=rack_mod, module_objects=MO)

    # ── stacked horizontal UNITS (full depth/width) with dark gap bands between ──
    # battery → MODULES; compute → SERVER SLEDS (denser, the 1U/2U look).
    n_mod = _rack_module_count(cells_per_rack)
    if flavour == "compute":
        n_mod = max(RACK_SLED_MIN, min(RACK_SLED_MAX, n_mod + RACK_SLED_BONUS))
    usable_h = max(h - RACK_TOP_RESERVE_MM, h * 0.5)
    z0 = deck_z_mm + (h - usable_h) / 2          # bottom of the unit stack
    slot_h = usable_h / n_mod                     # pitch of one shelf
    mod_h = max(40.0, slot_h - RACK_MODULE_GAP_MM)  # unit body height (< slot → gap)
    mod_w = w - 24.0                              # near-full width (slim side reveal)
    mod_d = d + 12.0                              # proud of ±Y faces so it's the skin
    face_detail_objs = 0          # running per-rack compute face-detail budget
    per_sled_detail = 1 + RACK_SLED_N_LEDS + RACK_SLED_N_BAYS  # bezel + LEDs + bays
    for i in range(n_mod):
        mcz = z0 + slot_h * (i + 0.5)
        # unit body (battery-blue module / grey server sled) — visible on every face
        fl.add_box(f"{nm}_mod{i}",
                   (cx * fl.MM, y_row * fl.MM, mcz * fl.MM),
                   (mod_w * fl.MM, mod_d * fl.MM, mod_h * fl.MM),
                   body_mat, module=rack_mod, module_objects=MO)
        if flavour == "compute":
            # POPULATED SERVER SLED: full-width bezel + status-LED row + drive bays
            # on the −Y (CAMERA-FACING) face so the rack reads as stacked 1U/2U
            # servers. Past the per-rack detail cap, draw the bezel only (still a
            # stacked-server silhouette). cam_face_y = the sled's −Y body face.
            want_detail = (face_detail_objs + per_sled_detail
                           <= RACK_COMPUTE_FACE_DETAIL_CAP)
            _build_compute_sled_face(
                f"{nm}_s{i}", y_row - mod_d / 2, cx, mcz, mod_w, mod_h,
                bezel_mat, led_mat, bay_mat, rack_mod, MO,
                with_detail=want_detail)
            face_detail_objs += per_sled_detail if want_detail else 1
        else:
            # slim dark fascia/handle strip across the +Y face of this unit
            # (battery module handle) — the front-of-unit cue
            fl.add_box(f"{nm}_fascia{i}",
                       (cx * fl.MM, (front_y + 8.0) * fl.MM,
                        (mcz + mod_h * 0.28) * fl.MM),
                       (mod_w * 0.7 * fl.MM, 26.0 * fl.MM, mod_h * 0.16 * fl.MM),
                       cell_mat, module=rack_mod, module_objects=MO)

    # ── thin front-door frame: 2 stiles (sides) + 2 rails (top/bottom) on +Y ──
    fy = front_y + 18.0                           # door frame proud of module faces
    door_h = usable_h + 80.0
    door_cz = z0 + usable_h / 2
    for sx in (-(w / 2 - RACK_DOOR_FRAME_MM / 2), (w / 2 - RACK_DOOR_FRAME_MM / 2)):
        fl.add_box(f"{nm}_doorstile{'L' if sx < 0 else 'R'}",
                   ((cx + sx) * fl.MM, fy * fl.MM, door_cz * fl.MM),
                   (RACK_DOOR_FRAME_MM * fl.MM, RACK_DOOR_FRAME_MM * fl.MM,
                    door_h * fl.MM),
                   steel, module=rack_mod, module_objects=MO)
    for sz, tag in ((door_cz + usable_h / 2, "T"), (door_cz - usable_h / 2, "B")):
        fl.add_box(f"{nm}_doorrail{tag}",
                   (cx * fl.MM, fy * fl.MM, sz * fl.MM),
                   ((w - RACK_DOOR_FRAME_MM) * fl.MM, RACK_DOOR_FRAME_MM * fl.MM,
                    RACK_DOOR_FRAME_MM * fl.MM),
                   steel, module=rack_mod, module_objects=MO)

    # vertical bus/cable spine up the front (+Y) face — copper DC bus (battery) or
    # a slim dark cable-management spine (compute).
    fl.add_box(f"{nm}_bus",
               (cx * fl.MM, (front_y + 24.0) * fl.MM, cz_mid * fl.MM),
               (60 * fl.MM, 40 * fl.MM, (h - 360) * fl.MM),
               bus_mat, module=rack_mod, module_objects=MO)
    # plinth
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, y_row * fl.MM, (deck_z_mm + 70) * fl.MM),
               ((w + 40) * fl.MM, (d + 40) * fl.MM, 140 * fl.MM),
               steel, module=rack_mod, module_objects=MO)


# ═══════════════════════════════════════════════════════════════════════════
# BALANCE-OF-PLANT SHAPE BUILDERS (Fix 1, 2026-06-10)
# ───────────────────────────────────────────────────────────────────────────
# The BoP lineup used to draw EVERY skid as a plain box (the chiller alone had a
# couple of fan cylinders). These deterministic, UNIVERSAL builders give each BoP
# role its real silhouette, picked by ROLE in the lineup loop (no per-state
# hardcoding). All consume the same (role-centre cx/cy, footprint depth/width,
# height, base deck Z, body material, shared steel) so the lineup loop stays a
# thin dispatcher. They mirror the hand-coded bess-utility-scale-9shot.py idioms
# (transformer tank + bushings + radiators + conservator; PCS/switchgear cabinet
# lineups with vent louvres; chiller box + fan array) parametrically.
# ═══════════════════════════════════════════════════════════════════════════

def _bop_secondary_mat(MAT, key, rgb, metallic=0.45, roughness=0.40):
    """Cache + return a shared secondary material (bushings, fins, louvres, fans)
    for the BoP builders so repeated calls don't churn the material list."""
    mk = f"u_rf_bop_{key}"
    if mk not in MAT:
        MAT[mk] = fl.make_mat(f"m_rf_bop_{key}", rgb, metallic=metallic,
                              roughness=roughness)
    return MAT[mk]


def _add_vent_louvres(nm, cx, cy_front, base_z_mm, w_mm, h_mm, mat, mod, MO,
                      n=5):
    """A row of horizontal louvre slats across a cabinet's +Y front face — the
    universal 'vented electrical cabinet' cue. Thin boxes stepped up the face."""
    band_h = h_mm * 0.62
    z0 = base_z_mm + h_mm * 0.18
    slat_w = w_mm * 0.80
    for i in range(n):
        zc = z0 + band_h * (i + 0.5) / n
        fl.add_box(f"{nm}_louvre{i}",
                   (cx * fl.MM, cy_front * fl.MM, zc * fl.MM),
                   (slat_w * fl.MM, 24.0 * fl.MM, (band_h / n) * 0.45 * fl.MM),
                   mat, module=mod, module_objects=MO)


def _build_bop_cabinet_lineup(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat,
                              steel, MAT, mod, MO, n_sections=3, louvres=True,
                              louvre_rgb=(0.18, 0.20, 0.24)):
    """A tall cabinet LINEUP of n_sections side-by-side bays (PCS / inverter /
    switchgear). Each bay = a cabinet body with a thin reveal gap between bays + a
    plinth; optional vent louvres on the +Y front. Bays are laid along X within
    the role's width window so the role still occupies its single lineup slot."""
    n = max(1, int(n_sections))
    reveal = 30.0
    bay_w = (w_mm - reveal * (n - 1)) / n
    cy_front = cy + d_mm / 2 - 12.0
    x_left = cx - w_mm / 2
    for i in range(n):
        bx = x_left + bay_w / 2 + i * (bay_w + reveal)
        fl.add_box(f"{nm}_bay{i}",
                   (bx * fl.MM, cy * fl.MM, (base_z_mm + h_mm / 2) * fl.MM),
                   (bay_w * fl.MM, d_mm * fl.MM, h_mm * fl.MM),
                   mat, module=mod, module_objects=MO)
        if louvres:
            lv = _bop_secondary_mat(MAT, "louvre", louvre_rgb, 0.30, 0.55)
            _add_vent_louvres(f"{nm}_bay{i}", bx, cy_front, base_z_mm, bay_w, h_mm,
                              lv, mod, MO, n=5)
    # continuous plinth under the lineup
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 60) * fl.MM),
               ((w_mm + 60) * fl.MM, (d_mm + 60) * fl.MM, 120 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_bop_transformer(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat,
                           steel, MAT, mod, MO):
    """Oil-filled MV step-up transformer: oil-tank box + a row of 3 HV bushings
    (porcelain cylinders on the lid) + radiator fin banks (thin vertical plates)
    on BOTH ±Y sides + a horizontal oil conservator drum across the top. Mirrors
    the 9shot transformer idiom, parametric to the role footprint."""
    tank_h = h_mm * 0.82
    # oil tank
    fl.add_box(f"{nm}_tank",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + tank_h / 2) * fl.MM),
               (w_mm * fl.MM, d_mm * fl.MM, tank_h * fl.MM),
               mat, module=mod, module_objects=MO)
    # 3 HV bushings on the lid (porcelain grey-white)
    porc = _bop_secondary_mat(MAT, "porcelain", (0.86, 0.86, 0.82), 0.10, 0.45)
    bsh_h = h_mm * 0.34
    for i in range(3):
        bx = cx - w_mm * 0.28 + i * (w_mm * 0.28)
        fl.add_cyl(f"{nm}_bushing{i}",
                   (bx * fl.MM, cy * fl.MM, (base_z_mm + tank_h + bsh_h / 2) * fl.MM),
                   max(0.045, w_mm * 0.045 * fl.MM), bsh_h * fl.MM,
                   porc, module=mod, module_objects=MO)
    # radiator fin banks (a row of thin vertical plates) on each ±Y side
    fin = _bop_secondary_mat(MAT, "radiator", (0.36, 0.38, 0.42), 0.55, 0.40)
    n_fins = 7
    fin_h = tank_h * 0.78
    fin_zc = base_z_mm + tank_h * 0.50
    fin_proj = d_mm * 0.16          # how far fins stick out past the tank face
    for side in (-1, 1):
        cy_face = cy + side * (d_mm / 2 + fin_proj / 2)
        for i in range(n_fins):
            fx = cx - w_mm * 0.38 + i * (w_mm * 0.76 / (n_fins - 1))
            fl.add_box(f"{nm}_fin{'P' if side > 0 else 'M'}{i}",
                       (fx * fl.MM, cy_face * fl.MM, fin_zc * fl.MM),
                       (28.0 * fl.MM, fin_proj * fl.MM, fin_h * fl.MM),
                       fin, module=mod, module_objects=MO)
    # horizontal oil conservator drum across the top (axis along X)
    fl.add_cyl(f"{nm}_conservator",
               (cx * fl.MM, (cy - d_mm * 0.12) * fl.MM,
                (base_z_mm + tank_h + h_mm * 0.14) * fl.MM),
               max(0.10, d_mm * 0.14 * fl.MM), w_mm * 0.62 * fl.MM,
               _bop_secondary_mat(MAT, "conservator", (0.30, 0.34, 0.42), 0.50, 0.40),
               module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))
    # plinth / bund slab
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 60) * fl.MM),
               ((w_mm + 120) * fl.MM, (d_mm + 120) * fl.MM, 120 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_bop_chiller(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat,
                       steel, MAT, MO, mod):
    """Liquid chiller / HVAC unit: a skid box + a FAN ARRAY on the roof (a row of
    recessed fan rings) + two coolant pipe stubs out the +Y face. The fan array is
    the dominant heat-rejection cue (vs the old two lone cylinders)."""
    fl.add_box(f"{nm}_skid",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + h_mm / 2) * fl.MM),
               (w_mm * fl.MM, d_mm * fl.MM, h_mm * fl.MM), mat,
               module=mod, module_objects=MO)
    # roof FAN ARRAY: 2-4 fans depending on the skid length
    n_fans = max(2, min(4, int(round(w_mm / 600.0))))
    fan_r = min(w_mm / n_fans, d_mm) * 0.36
    fan_mat = _bop_secondary_mat(MAT, "fan", (0.16, 0.17, 0.20), 0.30, 0.50)
    ring_mat = _bop_secondary_mat(MAT, "fanring", (0.46, 0.48, 0.52), 0.55, 0.40)
    x0 = cx - w_mm / 2 + (w_mm / n_fans) / 2
    for i in range(n_fans):
        fx = x0 + i * (w_mm / n_fans)
        # shroud ring (torus) + fan disc just inside it
        fl.add_torus(f"{nm}_fanring{i}",
                     (fx * fl.MM, cy * fl.MM, (base_z_mm + h_mm + 20) * fl.MM),
                     fan_r * fl.MM, max(0.02, fan_r * 0.14) * fl.MM,
                     ring_mat, module=mod, module_objects=MO)
        fl.add_cyl(f"{nm}_fan{i}",
                   (fx * fl.MM, cy * fl.MM, (base_z_mm + h_mm + 10) * fl.MM),
                   fan_r * 0.82 * fl.MM, 70.0 * fl.MM,
                   fan_mat, module=mod, module_objects=MO)
    # two coolant pipe stubs out the front (+Y) face (flow + return)
    pipe_mat = _bop_secondary_mat(MAT, "coolant", (0.40, 0.52, 0.62), 0.45, 0.35)
    for sx in (-w_mm * 0.22, w_mm * 0.22):
        fl.add_cyl(f"{nm}_pipe{'L' if sx < 0 else 'R'}",
                   ((cx + sx) * fl.MM, (cy + d_mm / 2 + 90) * fl.MM,
                    (base_z_mm + h_mm * 0.4) * fl.MM),
                   max(0.05, min(w_mm, d_mm) * 0.06 * fl.MM), 180.0 * fl.MM,
                   pipe_mat, module=mod, module_objects=MO,
                   rotation=(math.radians(90), 0, 0))
    # plinth
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 55) * fl.MM),
               ((w_mm + 50) * fl.MM, (d_mm + 50) * fl.MM, 110 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_bop_wall_cabinet(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat,
                            steel, MAT, mod, MO):
    """A small floor-standing controller cabinet (BMS / EMS / fire panel): a slim
    cabinet body + a thin front door frame + a small top vent grille. The compact
    'control box' silhouette, distinct from the tall power-cabinet lineup."""
    fl.add_box(f"{nm}_body",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + h_mm / 2) * fl.MM),
               (w_mm * fl.MM, d_mm * fl.MM, h_mm * fl.MM), mat,
               module=mod, module_objects=MO)
    # thin recessed door panel on the +Y face
    fl.add_box(f"{nm}_door",
               (cx * fl.MM, (cy + d_mm / 2 - 18) * fl.MM,
                (base_z_mm + h_mm * 0.52) * fl.MM),
               (w_mm * 0.82 * fl.MM, 26.0 * fl.MM, h_mm * 0.76 * fl.MM),
               _bop_secondary_mat(MAT, "cabdoor", (0.26, 0.30, 0.38), 0.40, 0.45),
               module=mod, module_objects=MO)
    # small top vent grille
    grille = _bop_secondary_mat(MAT, "grille", (0.20, 0.22, 0.26), 0.30, 0.55)
    for i in range(3):
        zc = base_z_mm + h_mm * 0.86 + i * (h_mm * 0.04)
        fl.add_box(f"{nm}_vent{i}",
                   (cx * fl.MM, (cy + d_mm / 2 - 14) * fl.MM, zc * fl.MM),
                   (w_mm * 0.6 * fl.MM, 18.0 * fl.MM, h_mm * 0.018 * fl.MM),
                   grille, module=mod, module_objects=MO)
    # plinth
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 50) * fl.MM),
               ((w_mm + 40) * fl.MM, (d_mm + 40) * fl.MM, 100 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_bop_fire(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat,
                    steel, MAT, mod, MO):
    """Fire-suppression skid: a small cabinet + 2-3 vertical agent cylinders
    (red bottles) standing on top/beside it. The classic clean-agent bottle bank."""
    cab_h = h_mm * 0.55
    fl.add_box(f"{nm}_cabinet",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + cab_h / 2) * fl.MM),
               (w_mm * fl.MM, d_mm * fl.MM, cab_h * fl.MM), mat,
               module=mod, module_objects=MO)
    # agent bottles standing on the cabinet lid
    bot = _bop_secondary_mat(MAT, "agentbottle", (0.80, 0.16, 0.12), 0.30, 0.42)
    bot_h = h_mm * 0.46
    for i in range(3):
        bx = cx - w_mm * 0.28 + i * (w_mm * 0.28)
        fl.add_cyl(f"{nm}_bottle{i}",
                   (bx * fl.MM, cy * fl.MM, (base_z_mm + cab_h + bot_h / 2) * fl.MM),
                   max(0.05, w_mm * 0.085 * fl.MM), bot_h * fl.MM,
                   bot, module=mod, module_objects=MO)
    # plinth
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 50) * fl.MM),
               ((w_mm + 40) * fl.MM, (d_mm + 40) * fl.MM, 100 * fl.MM),
               steel, module=mod, module_objects=MO)


def place_rack_farm(parts, regions, topology, MAT, MO):
    """RACK-FARM strategy (BESS / battery energy storage). Render the design as a
    real battery system: ROWS OF BATTERY RACKS (tall narrow cabinets) in neat lines
    with aisles, the power-conversion + thermal balance-of-plant skids lined up
    along one end wall, the whole lot enclosed in a shipping-container-like shell,
    and the electrical/thermal topology routed as DC-bus cable trays + coolant pipes
    to the chiller. The thousands of cells are AGGREGATED into the racks (never
    drawn one-by-one). Same return tuple as place_process_plant:
    (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    quantities = {}
    # quantities live on the orchestratorContract; topology was sliced from the
    # same place, but we re-read the contract here via the module-level _STATE set
    # by main() so the placer stays a pure function of (parts, topology, contract).
    quantities = _RACKFARM_QUANTITIES or {}
    # FLAVOUR (battery | compute | generic) set by detect_geometry_family. A compute
    # rack farm renders SERVER racks + a compute BoP (cooling/CRAC + PDU + network +
    # UPS) instead of PCS/transformer/chiller; battery is the original BESS path.
    flavour = _RACK_FLAVOUR or "battery"

    n_racks, n_rows, racks_per_row, basis = _derive_rack_grid(quantities, parts)
    cells_per_rack = qval(quantities, "cells_per_rack")
    cell_count = qval(quantities, "cell_count")
    unit_word = "sleds" if flavour == "compute" else "modules/cells"
    print(f"[univ][rackfarm] flavour = {flavour}; rack grid: {n_racks} racks "
          f"= {n_rows} row(s) × {racks_per_row} "
          f"(basis: {basis}); cells_per_rack={cells_per_rack}, "
          f"cell_count={cell_count} aggregated into the racks as {unit_word} "
          f"(not drawn individually)")

    steel = _steel_mat(MAT)
    # rack body colour per flavour: battery-blue for a BESS, server-grey for compute.
    if flavour == "compute":
        rack_frame_mat = _bop_secondary_mat(MAT, "sled", (0.62, 0.64, 0.68), 0.55, 0.42)
    elif flavour == "generic":
        rack_frame_mat = _bop_secondary_mat(MAT, "genbay", (0.50, 0.52, 0.56), 0.45, 0.45)
    else:
        rack_frame_mat = MAT.get("battery") or fl.make_mat(
            "m_rf_rack", (0.02, 0.14, 1.00), metallic=0.05, roughness=0.45)
    if "u_rf_cell" not in MAT:
        MAT["u_rf_cell"] = fl.make_mat("m_rf_cell", (0.02, 0.025, 0.05),
                                       metallic=0.10, roughness=0.55)
    cell_mat = MAT["u_rf_cell"]
    if "u_rf_busbar" not in MAT:
        MAT["u_rf_busbar"] = fl.make_mat("m_rf_busbar", (1.00, 0.45, 0.00),
                                         metallic=0.30, roughness=0.40)
    busbar_mat = MAT["u_rf_busbar"]

    # ── 1. ROWS OF RACKS ────────────────────────────────────────────────────
    # Lay rows along X. Successive rows step back in +Y, separated by an aisle.
    # Each rack is a tall narrow cabinet (frame shell + recessed dark cell stack +
    # a copper bus stripe up the front) so the row reads as a battery line-up, like
    # the BESS templates. The cells are AGGREGATED into that one recessed volume —
    # we never instantiate the thousands of prismatic cells.
    rack_mod = "energy_storage_source"
    if rack_mod not in MO:
        MO[rack_mod] = []
    row_pitch = RACK_D_MM + RACK_AISLE_MM
    row_len_mm = racks_per_row * RACK_PITCH_MM
    rack_anchor_by_index = []     # (cx, cy, top_z) per placed rack, for bus routing
    placed = 0
    for row in range(n_rows):
        y_row = row * row_pitch
        n_this = min(racks_per_row, n_racks - placed)
        for col in range(n_this):
            cx = col * RACK_PITCH_MM
            nm = f"u_rf_rack_r{row}_c{col}"
            _build_battery_rack(nm, cx, y_row, DECK_Z_MM, cells_per_rack,
                                rack_frame_mat, cell_mat, busbar_mat, steel, MAT,
                                rack_mod, MO, flavour=flavour)
            rack_anchor_by_index.append((cx, y_row, DECK_Z_MM + RACK_H_MM))
        placed += n_this

    racks_x0 = -RACK_W_MM / 2
    racks_x1 = (racks_per_row - 1) * RACK_PITCH_MM + RACK_W_MM / 2
    racks_y0 = -RACK_D_MM / 2
    racks_y1 = (n_rows - 1) * row_pitch + RACK_D_MM / 2

    # ── 2. BALANCE-OF-PLANT LINEUP along the +X end wall ────────────────────
    # PCS / inverter, switchgear, transformer, BMS controller and the THERMAL gear
    # (chiller / HVAC) skidded in a lineup beyond the rack rows (like the template's
    # external chiller + PCS + transformer + RMU + control lineup). We pull the real
    # parts from the design by their module / name so the lineup reflects the BoM.
    bop_x = racks_x1 + RACK_ROW_GAP_MM
    bop_y_centre = (racks_y0 + racks_y1) / 2
    bop_items = _select_bop_items(parts, flavour)
    region_centres = {}
    bop_anchor = {}               # role → (cx, cy, top_z) for topology routing
    cursor_y = bop_y_centre - (sum(it[2] for it in bop_items)
                               + BOP_GAP_MM * max(0, len(bop_items) - 1)) / 2.0
    bop_y_lo = cursor_y           # actual lineup Y extent (for the enclosure fit)
    bop_y_hi = cursor_y
    for role, part_or_none, depth_mm, w_mm, h_mm, rgb in bop_items:
        cx = bop_x + w_mm / 2
        cy = cursor_y + depth_mm / 2
        bop_y_hi = cursor_y + depth_mm   # running far edge of the lineup
        nm = f"u_rf_bop_{role}"
        mat = MAT.get(f"u_rf_bop_{role}") or fl.make_mat(
            f"m_rf_bop_{role}", rgb, metallic=0.35, roughness=0.42)
        MAT[f"u_rf_bop_{role}"] = mat
        mod = part_or_none.module_id if part_or_none else "energy_conversion_transduction"
        if mod not in MO:
            MO[mod] = []
        # Fix 1 (2026-06-10): dispatch each BoP role to its REAL-SHAPE builder
        # (keyed by role, no per-state hardcoding) so the lineup is real gear, not
        # plain blocks. depth_mm = Y footprint, w_mm = X footprint along the wall.
        if role == "transformer":
            _build_bop_transformer(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                   mat, steel, MAT, mod, MO)
        elif role == "pcs":
            _build_bop_cabinet_lineup(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                      mat, steel, MAT, mod, MO, n_sections=3,
                                      louvres=True)
        elif role == "switchgear":
            _build_bop_cabinet_lineup(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                      mat, steel, MAT, mod, MO, n_sections=2,
                                      louvres=True, louvre_rgb=(0.22, 0.24, 0.28))
        elif role in ("chiller", "cooling"):   # BESS chiller / compute CRAC-CRAH
            _build_bop_chiller(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                               mat, steel, MAT, MO, mod)
        elif role in ("pdu", "ups"):           # compute power: tall cabinet lineup
            _build_bop_cabinet_lineup(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                      mat, steel, MAT, mod, MO, n_sections=2,
                                      louvres=True, louvre_rgb=(0.22, 0.24, 0.28))
        elif role == "fire":
            _build_bop_fire(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                            mat, steel, MAT, mod, MO)
        else:  # bms_ctrl / network / any other controller role → small wall cabinet
            _build_bop_wall_cabinet(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                    mat, steel, MAT, mod, MO)
        bop_anchor[role] = (cx, cy, DECK_Z_MM + h_mm)
        region_centres[role] = (cx, cy)
        cursor_y += depth_mm + BOP_GAP_MM
    bop_x1 = bop_x + max((it[3] for it in bop_items), default=BOP_LANE_W_MM)

    # ── 3. CONTAINER ENCLOSURE around racks + aisles + BoP ──────────────────
    # A shipping-container-like shell (floor + roof + 4 walls) sized to the rack
    # block + the BoP lineup + margin, REPLACING the open process skid. In INSPECT
    # mode apply_inspection_materials renders u_skid_* as the faint wireframe, so we
    # name the enclosure with that prefix and it reads as the same faint cage that
    # lets the interior show.
    enc_x0 = racks_x0 - CONTAINER_MARGIN_MM
    enc_x1 = bop_x1 + CONTAINER_MARGIN_MM
    # Fit the enclosure to the ACTUAL Y extent of BOTH the rack block AND the BoP
    # lineup (which can be taller than the racks once enough BoP skids are present —
    # the old BOP_LANE_W_MM heuristic let the end skids poke out of the container).
    enc_y0 = min(racks_y0, bop_y_lo) - CONTAINER_MARGIN_MM
    enc_y1 = max(racks_y1, bop_y_hi) + CONTAINER_MARGIN_MM
    enc_w = enc_x1 - enc_x0
    enc_d = enc_y1 - enc_y0
    enc_h = RACK_H_MM + 2 * CONTAINER_MARGIN_MM
    enc_cx = (enc_x0 + enc_x1) / 2
    enc_cy = (enc_y0 + enc_y1) / 2
    _build_container_enclosure(enc_cx, enc_cy, DECK_Z_MM, enc_w, enc_d, enc_h, MAT, MO)
    frame_top_mm = DECK_Z_MM + enc_h
    print(f"[univ][rackfarm] container enclosure: {enc_w/1000:.1f}×{enc_d/1000:.1f} m "
          f"footprint, {enc_h/1000:.1f} m tall; BoP lineup of {len(bop_items)} skids")

    # ── 4. TOPOLOGY: electrical bus (racks→DC bus→PCS→transformer) as cable
    #    trays + thermal (PCS/racks→heat rejection) as coolant pipes to the chiller.
    #    Reuse the existing overhead-rack router + cable-tray / pipe primitives.
    bbox = {"x0": enc_x0, "x1": enc_x1, "y0": enc_y0, "y1": enc_y1}
    routed, unresolved = _route_rack_farm_topology(
        topology, parts, rack_anchor_by_index, bop_anchor, region_centres,
        frame_top_mm, bbox, MAT, MO)
    print(f"[univ][rackfarm] topology routed = {routed}/{len(topology)}; "
          f"unresolved = {len(unresolved)}")

    # region_centres also carries the rack block centroid for completeness
    region_centres["rack_block"] = ((racks_x0 + racks_x1) / 2, (racks_y0 + racks_y1) / 2)
    return bbox, region_centres, frame_top_mm, routed, unresolved


# Module-level handoff of the contract quantities to place_rack_farm (set in main()
# right before dispatch). Kept module-level rather than threading a new arg through
# the shared placer signature, so place_process_plant's signature is unchanged.
_RACKFARM_QUANTITIES = None


# Balance-of-plant roles for the rack-farm lineup, in lineup order. Each entry:
#   (role, name_regex, depth_mm, width_mm, height_mm, rgb)
# The placer matches the FIRST design part whose name hits the regex (to reflect
# the actual BoM + tag the skid to that part's module); if none match, the skid is
# still drawn (a real BESS always has these) so the lineup reads complete.
_BOP_ROLES = [
    ("pcs",         r"\bpcs\b|inverter",                 1100.0, 1300.0, 1900.0, (0.45, 0.55, 0.68)),
    ("switchgear",  r"switchgear|breaker|\brmu\b|main bus|ac main",
                                                          900.0, 1000.0, 2000.0, (0.30, 0.34, 0.40)),
    ("transformer", r"transformer",                      1500.0, 1300.0, 1300.0, (0.02, 0.22, 1.00)),
    ("bms_ctrl",    r"\bbms\b|ems |\bems\b|controller|scada",
                                                          700.0, 700.0, 1800.0, (0.05, 0.42, 1.00)),
    ("chiller",     r"chiller|hvac|cooling unit|air handler|condens",
                                                          1000.0, 1600.0, 1400.0, (0.95, 0.84, 0.55)),
    # fire suppression skid (clean-agent bottle bank) — always drawn (Fix 3)
    ("fire",        r"fire|suppress|aerosol|novec|fm[- ]?200|clean[- ]?agent",
                                                          700.0, 800.0, 1700.0, (0.80, 0.20, 0.16)),
]

# Balance-of-plant roles for a COMPUTE rack farm (a server room / edge node): the
# data-centre BoP — cooling (CRAC/CRAH), power distribution (PDU), network switch,
# and a UPS — instead of the BESS PCS/transformer/chiller. Same (role, regex,
# depth, width, height, rgb) shape; each role dispatches to an existing BoP builder
# (cooling→chiller/fan-array, pdu/ups→cabinet lineup, network→wall cabinet).
_BOP_ROLES_COMPUTE = [
    ("cooling",  r"crac|crah|cooling|air handler|hvac|condens|chiller|precision air",
                                                          1000.0, 1600.0, 1400.0, (0.72, 0.80, 0.88)),
    ("pdu",      r"\bpdu\b|power distribution|busway|rack power|power strip",
                                                          700.0, 900.0, 2000.0, (0.34, 0.38, 0.44)),
    ("network",  r"network|switch|\btor\b|leaf|spine|router|fabric|sfp|uplink",
                                                          600.0, 700.0, 1500.0, (0.30, 0.46, 0.40)),
    ("ups",      r"\bups\b|uninterrupt|battery backup|\bpsu\b|rectifier|power supply",
                                                          900.0, 1100.0, 1900.0, (0.40, 0.44, 0.52)),
    # data centres carry clean-agent fire suppression too — always drawn.
    ("fire",     r"fire|suppress|aerosol|novec|fm[- ]?200|clean[- ]?agent",
                                                          700.0, 800.0, 1700.0, (0.80, 0.20, 0.16)),
]


def _select_bop_items(parts, flavour="battery"):
    """Build the balance-of-plant lineup list, picking the role table by FLAVOUR:
    the BESS lineup (_BOP_ROLES: PCS / switchgear / transformer / BMS / chiller /
    fire) for a battery or generic rack farm, or the data-centre lineup
    (_BOP_ROLES_COMPUTE: cooling / PDU / network / UPS / fire) for a compute rack
    farm. For each role, find the first matching design part (to reflect the BoM +
    carry its module tag); the skid is drawn whether or not a part matches (a real
    system always has these), so the lineup reads complete. Returns
    [(role, part_or_None, depth_mm, width_mm, height_mm, rgb), …] in lineup order."""
    table = _BOP_ROLES_COMPUTE if flavour == "compute" else _BOP_ROLES
    items = []
    for role, rx, depth, w, h, rgb in table:
        rxc = re.compile(rx, re.IGNORECASE)
        match = next((p for p in parts if rxc.search(str(p.name))), None)
        items.append((role, match, depth, w, h, rgb))
    return items


def _build_container_enclosure(cx, cy, base_z_mm, w_mm, d_mm, h_mm, MAT, MO):
    """Shipping-container-like enclosure (floor + roof + 4 walls), tagged with the
    STRUCTURE_MODULE_ID and named u_skid_* so INSPECT mode renders it as the SAME
    faint wireframe the process-skid frame uses (interior reads through it). cx/cy =
    footprint centre (mm); base_z_mm = floor underside. Deterministic + universal."""
    enc_mat = fl.make_mat("m_rf_container", (0.55, 0.56, 0.58),
                          metallic=0.30, roughness=0.50)
    sid = STRUCTURE_MODULE_ID
    if sid not in MO:
        MO[sid] = []
    t = CONTAINER_WALL_MM

    def _mm3(t3):
        return tuple(c * fl.MM for c in t3)

    # floor + roof
    fl.add_box("u_skid_rf_floor", _mm3((cx, cy, base_z_mm + t / 2)),
               _mm3((w_mm, d_mm, t)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_rf_roof", _mm3((cx, cy, base_z_mm + h_mm - t / 2)),
               _mm3((w_mm, d_mm, t)), enc_mat, module=sid, module_objects=MO)
    # 4 walls (back = -Y solid; front = +Y; both ends). Front wall kept so the
    # enclosure reads as a closed container; INSPECT renders all of them faint.
    wall_h = h_mm - 2 * t
    fl.add_box("u_skid_rf_wall_back", _mm3((cx, cy - d_mm / 2 + t / 2, base_z_mm + h_mm / 2)),
               _mm3((w_mm, t, wall_h)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_rf_wall_front", _mm3((cx, cy + d_mm / 2 - t / 2, base_z_mm + h_mm / 2)),
               _mm3((w_mm, t, wall_h)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_rf_wall_left", _mm3((cx - w_mm / 2 + t / 2, cy, base_z_mm + h_mm / 2)),
               _mm3((t, d_mm, wall_h)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_rf_wall_right", _mm3((cx + w_mm / 2 - t / 2, cy, base_z_mm + h_mm / 2)),
               _mm3((t, d_mm, wall_h)), enc_mat, module=sid, module_objects=MO)


def _route_rack_farm_topology(topology, parts, rack_anchors, bop_anchor,
                              region_centres, frame_top_mm, bbox, MAT, MO):
    """Route the BESS topology, reusing the existing overhead-rack router + the
    cable-tray (electrical) and pipe (thermal/fluid) primitives. We resolve each
    edge endpoint against the rack-farm anchors FIRST (a rack/cell/dc-bus end → the
    rack-block bus point; a pcs/transformer/chiller/heat-rejection end → its BoP
    skid anchor), then fall back to the generic part resolver for anything else.
    electrical_bus → copper cable tray; thermal / fluid_loop → coolant pipe to the
    chiller. Returns (routed, unresolved)."""
    rack_z = rack_elevation_mm(frame_top_mm)
    # DC bus collector point = centroid of the rack tops (where rack buses gather)
    if rack_anchors:
        bx = sum(a[0] for a in rack_anchors) / len(rack_anchors)
        by = sum(a[1] for a in rack_anchors) / len(rack_anchors)
        bz = max(a[2] for a in rack_anchors)
        rack_bus_pt = (bx, by, bz)
    else:
        rack_bus_pt = ((bbox["x0"] + bbox["x1"]) / 2, (bbox["y0"] + bbox["y1"]) / 2,
                       DECK_Z_MM + RACK_H_MM)

    ROLE_RE = {
        "pcs":         re.compile(r"\bpcs\b|inverter|dc[_ ]?bus|dc[- ]?link", re.IGNORECASE),
        "transformer": re.compile(r"transformer|\bgrid\b|enclosure_atmosphere|atmosphere", re.IGNORECASE),
        "chiller":     re.compile(r"chiller|heat[_ ]?reject|cooling|hvac|coolant|thermal", re.IGNORECASE),
        "switchgear":  re.compile(r"switchgear|breaker|\brmu\b", re.IGNORECASE),
        "bms_ctrl":    re.compile(r"\bbms\b|\bems\b|controller|scada", re.IGNORECASE),
    }
    # Non-LETTER boundaries so underscore-joined endpoints (lfp_cell_string,
    # battery_rack, dc_module) match — \b fails between two word chars incl. '_'.
    RACK_END_RE = re.compile(
        r"(?<![a-z])(?:rack|cell|string|module|pack|battery)(?![a-z])",
        re.IGNORECASE)

    def _resolve(endpoint_name):
        """Return ((x,y,z) mm point, is_rack_aggregate) for a topology endpoint,
        rack-farm aware. is_rack_aggregate flags the endpoint as the WHOLE rack
        block (its single centroid bus point) so the caller can DROP the aggregate
        explicit edge in favour of the derived per-rack fan-out."""
        nm = str(endpoint_name)
        if RACK_END_RE.search(nm) and not re.search(r"transformer|pcs|inverter", nm, re.IGNORECASE):
            return rack_bus_pt, True
        for role, rx in ROLE_RE.items():
            if rx.search(nm) and role in bop_anchor:
                return bop_anchor[role], False
        # generic part fallback (the process-plant resolver)
        p = resolve_endpoint(nm, parts)
        if p is not None and p.placed_xyz_mm is not None:
            return (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                    p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2]), False
        return None, False

    # ── Build the BESS equipment bboxes (rack block cells + BoP skids) so the rack
    # spine can sit in the maintenance aisle + the over-equipment audit has targets.
    bess_bboxes = []
    for ax, ay, atop in (rack_anchors or []):
        bess_bboxes.append((ax - RACK_W_MM / 2, ay - RACK_D_MM / 2,
                            ax + RACK_W_MM / 2, ay + RACK_D_MM / 2, atop))
    for role, (bx, by, btop) in (bop_anchor or {}).items():
        bess_bboxes.append((bx - BOP_LANE_W_MM / 2, by - BOP_LANE_W_MM / 2,
                            bx + BOP_LANE_W_MM / 2, by + BOP_LANE_W_MM / 2, btop))
    # Spine along X (rows run along X) in the free aisle; the racks are short cabinets
    # so cable trays at rack-top clear them — the audit's 3D-clearance handles that.
    plan = make_rack_plan_for_rows(bbox, rack_z, bess_bboxes, axis="x")

    resolved = []
    unresolved = []
    for i, e in enumerate(topology):
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "fluid_loop")
        a, a_agg = _resolve(frm)
        b, b_agg = _resolve(to)
        if a is None or b is None:
            miss = [n for n, pt in ((frm, a), (to, b)) if pt is None]
            unresolved.append((frm, to, mech, miss))
            print(f"[univ][rackfarm] edge {i} UNRESOLVED ({mech}): {frm} -> {to} "
                  f"[missing: {', '.join(miss)}]")
            continue
        # AGGREGATE rack edge (e.g. lfp_cell_string → dc_bus): the derived per-rack
        # fan-out below DRAWS the real version (DC bus → each of the 15 racks), so we
        # DROP the single-centroid explicit edge — it would just be a redundant line
        # to the rack-block midpoint, the exact "ONE bus run not per-rack" defect.
        if a_agg or b_agg:
            print(f"[univ][rackfarm] edge {i} ({mech}) {frm} -> {to} is a rack "
                  f"aggregate — superseded by derived per-rack fan-out")
            continue
        # rack-farm endpoints are AGGREGATE points (rack bus / BoP anchor), not single
        # Part objects, so a_abstract/b_abstract = True (route straight to/from them,
        # no own-bbox exclusion) — they sit ABOVE the racks so the tray clears them.
        resolved.append({
            "i": i, "mech": mech, "a_xyz": a, "b_xyz": b,
            "a_abstract": True, "b_abstract": True,
            "a_conn": None, "b_conn": None, "b_branch": [],
            "pa": None, "pb": None, "a_nm": frm, "b_nm": to,
            # carry the raw topology edge (rating fields) for real diameter sizing.
            "edge": e,
        })

    # ── UNIVERSAL per-rack flow DERIVATION: DC bus → each rack (+ PCS/transformer),
    #    chiller → each rack → coolant-return → chiller. The consumers are the
    #    rack anchors the placer emitted; hubs/collectors are found by ROLE on the
    #    BoM parts (with the BoP skids as anchor fallbacks). Routed on the SAME
    #    spine engine so the fan-out is clean (lanes/tiers, audited). A rack farm
    #    always has electrical + thermal; fluid is added if the parts evidence it.
    mech_present = _mechanisms_present_in(topology, parts,
                                          extra=("electrical", "thermal"))
    hubs, collectors = _bop_anchors_to_families(bop_anchor, parts)
    # downstream electrical chain (role-keyed): rack block → PCS → transformer for a
    # BESS; the compute flavour has no PCS/transformer so the chain is empty (just
    # the PDU → racks fan-out). Built from the BoP anchors the placer already sited.
    e_chain = [(r, bop_anchor[r]) for r in ("pcs", "transformer")
               if r in bop_anchor]
    derived = derive_flows(parts, rack_anchors, topology, mech_present,
                           hub_anchors=bop_anchor, hubs=hubs, collectors=collectors,
                           electrical_chain=e_chain)
    print(f"[univ][rackfarm] derived per-unit flows = {len(derived)} "
          f"(mechanisms: {sorted(mech_present)}; hubs: "
          f"{ {k: v[0] for k, v in hubs.items()} }; e-chain: {[r for r, _ in e_chain]})")
    resolved.extend(derived)

    routed, emit_unresolved = _emit_routes_on_plan(
        resolved, plan, rack_z, MAT, MO,
        pipe_module="mass_fluid_transport_process", tag="rf_")
    unresolved.extend(emit_unresolved)
    return routed, unresolved


# ═══════════════════════════════════════════════════════════════════════════
# PANEL-ARRAY (GROW-RACK) STRATEGY — vertical farm (2026-06-10)
# ───────────────────────────────────────────────────────────────────────────
# A vertical farm reads as ROWS OF MULTI-TIER GROW RACKS inside a grow room: each
# rack is a tall shelving frame carrying N stacked horizontal GROW-TRAY shelves
# (the green canopy) with a thin flat LED PANEL fixture under each shelf to light
# the tier below. Racks line up in rows separated by maintenance aisles (the
# warehouse grow-room layout from vertical-farm-9shot.py). The climate / nutrient /
# CO2 / control balance-of-plant lines up along one end wall, and the whole lot
# sits in a grow-ROOM shell (the faint INSPECT wireframe). The thousands of
# individual plants/trays are AGGREGATED into the tier shelves + canopy slabs —
# we draw one canopy per tier, never per-plant. Same return tuple + dispatch idiom
# as place_rack_farm so main()'s INSPECT/PDF render + summary stay common.
#
# Tags every object with the design's actual VF DOMAIN module ids
# (growing_canopy / lighting_array / climate_control / irrigation_nutrient /
# structure_containment …) — NOT the canonical function taxonomy — per the
# VF-template module-id gotcha (drawer: vertical-farm-9shot.py, 2026-05-28).
# ═══════════════════════════════════════════════════════════════════════════

# ── Grow-rack geometry (mm) ────────────────────────────────────────────────
GR_RACK_LEN_MM     = 2400.0   # one grow rack run length (the 2.5 m tray span, along X)
GR_RACK_DEPTH_MM   = 1050.0   # rack depth front-to-back (Y) — the trolley depth
GR_TIER_PITCH_MM   = 500.0    # vertical pitch between successive grow-tier shelves
GR_TIER_BASE_MM    = 420.0    # height of the lowest tier shelf above the deck
GR_TIER_DEFAULT    = 8        # tiers per rack when the contract is silent (6-10 band)
GR_TIER_MIN        = 4        # clamp floor for derived tier count
GR_TIER_MAX        = 12       # clamp ceiling for derived tier count
GR_TRAY_THICK_MM   = 55.0     # grow-tray pan thickness
GR_CANOPY_THICK_MM = 90.0     # green canopy slab thickness sitting on the tray
GR_CANOPY_INSET_MM = 130.0    # canopy inset from the tray edges (margin all round)
GR_LED_THICK_MM    = 26.0     # LED lit-panel face thickness (thin flat board)
GR_LED_HOUSE_MM    = 60.0     # LED housing-frame depth (thin dark surround)
GR_LED_DROP_MM     = 150.0    # LED panel hangs this far under the shelf above
GR_LED_INSET_MM    = 90.0     # LED panel inset from the shelf footprint edges
GR_FRAME_POST_MM   = 60.0     # square section of the rack corner posts
GR_SHELF_RAIL_MM   = 45.0     # horizontal shelf-rail section at each tier
GR_TRAY_PAN_LIP_MM = 28.0     # tray-pan side-wall height above the pan floor
GR_CANOPY_DETAIL   = "channels"  # per-tier crop detail: "channels" (NFT rows) /
                                 # "pucks" (plant grid). channels = cheapest.
GR_N_CHANNELS      = 5        # NFT/hydroponic channels drawn per grow tray
GR_PUCK_COLS       = 6        # plant-puck grid columns (when detail = "pucks")
GR_PUCK_ROWS       = 3        # plant-puck grid rows    (when detail = "pucks")
# Hard cap on crop-detail objects PER RACK so per-rack object counts stay sane
# (channels: n_tiers × GR_N_CHANNELS; a 12-tier rack = 60; pucks would be
# n_tiers × cols × rows = 216 at 12 tiers, so pucks auto-thin above this cap).
GR_CROP_DETAIL_CAP = 90
GR_RACK_PITCH_MM   = GR_RACK_DEPTH_MM + 1200.0   # row centre-to-centre = depth + aisle
GR_AISLE_MM        = 1200.0   # maintenance aisle between rack rows
GR_RACK_GAP_X_MM   = 400.0    # gap between racks placed end-to-end along a row
GR_MAX_PER_ROW     = 4        # racks per row before wrapping to another row
GR_ROW_GAP_END_MM  = 1600.0   # gap before the balance-of-plant lineup at the +X end
GR_BOP_GAP_MM      = 500.0    # gap between successive BoP skids in the end lineup
GR_ROOM_MARGIN_MM  = 800.0    # clearance from rack/BoP bulk to the grow-room walls
GR_ROOM_WALL_MM    = 90.0     # grow-room wall/roof thickness
# Default rack count when the contract has no trolley/rack count.
GR_RACK_FALLBACK   = 8


def _derive_grow_grid(quantities, parts):
    """Decide (n_racks, n_tiers, n_rows, racks_per_row) for the grow farm,
    deterministically, from the engineering contract. Primary signals:
      • rack count  ← trolley_count  (each mobile trolley = one grow rack), else
        rack_count, else a part-name count of grow racks/trolleys, else fallback.
      • tier count  ← tiers_per_trolley / tiers / levels / layers, clamped to the
        readable GR_TIER_MIN..GR_TIER_MAX band, else GR_TIER_DEFAULT.
    Rows wrap at GR_MAX_PER_ROW so the footprint stays grow-room-shaped. Returns
    the quad + a basis string for logging. Universal — any grow design with a
    trolley/tier count gets a faithful grid; a silent one gets a sane default."""
    rc = qval(quantities, "trolley_count")
    basis = "trolley_count" if rc is not None else None
    if rc is None:
        rc = qval(quantities, "rack_count")
        basis = "rack_count" if rc is not None else None
    if rc is None:
        grow_named = sum(
            1 for p in parts
            if re.search(r"\b(growing trolley|grow rack|growing rack|trolley)\b",
                         str(p.name), re.IGNORECASE))
        rc = grow_named if grow_named >= 2 else GR_RACK_FALLBACK
        basis = f"name-count({grow_named})" if grow_named >= 2 else "fallback"
    n_racks = max(1, int(round(rc)))

    tiers = None
    for key in ("tiers_per_trolley", "tiers_per_rack", "tiers", "levels",
                "layers", "grow_tiers", "shelf_count"):
        tiers = qval(quantities, key)
        if tiers is not None:
            tier_basis = key
            break
    if tiers is None or tiers <= 0:
        n_tiers = GR_TIER_DEFAULT
        tier_basis = "default"
    else:
        n_tiers = max(GR_TIER_MIN, min(GR_TIER_MAX, int(round(tiers))))

    n_rows = max(1, math.ceil(n_racks / GR_MAX_PER_ROW))
    racks_per_row = math.ceil(n_racks / n_rows)
    return n_racks, n_tiers, n_rows, racks_per_row, f"{basis}; tiers={tier_basis}"


def _build_grow_rack(nm, cx, y_row, deck_z_mm, n_tiers,
                     frame_mat, tray_mat, canopy_mat, led_mat,
                     led_house_mat, channel_mat, castor_mat, MAT, MO):
    """ONE multi-tier mobile grow rack, built to READ as a real grow rack:
      • FRAME — 4 corner uprights + top/base perimeter rails + per-tier
        horizontal shelf rails (front/back/sides) so each tier is an open framed
        shelf, not a floating slab; industrial CASTORS at the 4 base corners
        (the mobile-trolley cue).
      • GROW BED per tier — a shallow tray PAN + a green CANOPY slab + light crop
        DETAIL (a few NFT/hydroponic CHANNELS along the tray, or a sparse grid of
        plant PUCKS) so the bed reads as growing, not a painted slab. Crop detail
        is cheap instanced shapes, capped per rack (GR_CROP_DETAIL_CAP).
      • LIGHTING per tier — a bright emissive LED lit FACE + a thin dark HOUSING
        frame, inset under the shelf above, so the lit tiers are unmistakable.
    Built CAMERA-AGNOSTIC (full-width/full-depth shelves) so the tier stack reads
    from every judge camera. Deterministic + universal: keyed only on the rack
    constants + n_tiers. Tags:
      growing_canopy  ← frame + shelf rails + tray pans + canopy + crop detail + castors
      lighting_array  ← LED lit faces + housings."""
    w, d = GR_RACK_LEN_MM, GR_RACK_DEPTH_MM
    # Top-tier headroom: leave room for the top tier's canopy + its LED panel +
    # the LED housing in clear air (so the topmost lit panel doesn't jam onto the
    # top canopy — matches the inter-tier clearance the lower tiers get).
    top_z = deck_z_mm + GR_TIER_BASE_MM + GR_TIER_PITCH_MM * (n_tiers - 1) \
        + GR_CANOPY_THICK_MM + 320.0
    frame_h = top_z - deck_z_mm
    cmod = "growing_canopy"
    lmod = "lighting_array"
    for mod in (cmod, lmod):
        if mod not in MO:
            MO[mod] = []

    # ── shelving FRAME: 4 corner uprights + top/base perimeter rails ──────────
    px = w / 2 - GR_FRAME_POST_MM / 2
    py = d / 2 - GR_FRAME_POST_MM / 2
    for sx in (-px, px):
        for sy in (-py, py):
            fl.add_box(f"{nm}_post_{'L' if sx < 0 else 'R'}{'B' if sy < 0 else 'F'}",
                       ((cx + sx) * fl.MM, (y_row + sy) * fl.MM,
                        (deck_z_mm + frame_h / 2) * fl.MM),
                       (GR_FRAME_POST_MM * fl.MM, GR_FRAME_POST_MM * fl.MM,
                        frame_h * fl.MM),
                       frame_mat, module=cmod, module_objects=MO)
    # top + base perimeter rails (thin) — read the rack as a framed shelving unit
    for zf, tag in ((deck_z_mm + frame_h - GR_FRAME_POST_MM / 2, "top"),
                    (deck_z_mm + GR_FRAME_POST_MM / 2, "base")):
        fl.add_box(f"{nm}_railX_{tag}",
                   (cx * fl.MM, (y_row - py) * fl.MM, zf * fl.MM),
                   (w * fl.MM, GR_FRAME_POST_MM * fl.MM, GR_FRAME_POST_MM * fl.MM),
                   frame_mat, module=cmod, module_objects=MO)
        fl.add_box(f"{nm}_railX2_{tag}",
                   (cx * fl.MM, (y_row + py) * fl.MM, zf * fl.MM),
                   (w * fl.MM, GR_FRAME_POST_MM * fl.MM, GR_FRAME_POST_MM * fl.MM),
                   frame_mat, module=cmod, module_objects=MO)

    # geometry shared by every tier
    shelf_w = w - GR_FRAME_POST_MM * 2 + GR_SHELF_RAIL_MM   # rail runs span the posts
    shelf_d = d - GR_FRAME_POST_MM * 2 + GR_SHELF_RAIL_MM
    tray_w = w - GR_FRAME_POST_MM * 2 - 30.0
    tray_d = d - GR_FRAME_POST_MM * 2 - 30.0
    # choose crop detail + auto-thin so per-rack object count stays under the cap
    detail = GR_CANOPY_DETAIL
    if detail == "pucks" and n_tiers * GR_PUCK_COLS * GR_PUCK_ROWS > GR_CROP_DETAIL_CAP:
        detail = "channels"   # pucks too dense for a tall rack → fall back to channels
    crop_drawn = 0

    # ── N stacked grow-tier SHELVES ──────────────────────────────────────────
    for k in range(n_tiers):
        z_shelf = deck_z_mm + GR_TIER_BASE_MM + GR_TIER_PITCH_MM * k

        # (a) Fix 3 — per-tier horizontal shelf RAILS (front + back + 2 sides),
        #     so each tier reads as an open framed shelf the tray rests on (not a
        #     floating slab). Tagged STRUCTURE-of-the-canopy (growing_canopy).
        rz = z_shelf - GR_TRAY_PAN_LIP_MM
        for sy in (-py, py):
            fl.add_box(f"{nm}_shelfrailX_{k}_{'B' if sy < 0 else 'F'}",
                       (cx * fl.MM, (y_row + sy) * fl.MM, rz * fl.MM),
                       (shelf_w * fl.MM, GR_SHELF_RAIL_MM * fl.MM,
                        GR_SHELF_RAIL_MM * fl.MM),
                       frame_mat, module=cmod, module_objects=MO)
        for sx in (-px, px):
            fl.add_box(f"{nm}_shelfrailY_{k}_{'L' if sx < 0 else 'R'}",
                       ((cx + sx) * fl.MM, y_row * fl.MM, rz * fl.MM),
                       (GR_SHELF_RAIL_MM * fl.MM, shelf_d * fl.MM,
                        GR_SHELF_RAIL_MM * fl.MM),
                       frame_mat, module=cmod, module_objects=MO)

        # (b) Fix 2 — grow-tray PAN (thin floor) — the shallow shelf the crop
        #     sits in (no longer a thick slab; the green canopy is what reads).
        fl.add_box(f"{nm}_traypan{k}",
                   (cx * fl.MM, y_row * fl.MM, z_shelf * fl.MM),
                   (tray_w * fl.MM, tray_d * fl.MM, GR_TRAY_THICK_MM * fl.MM),
                   tray_mat, module=cmod, module_objects=MO)

        # (c) Fix 2 — green CANOPY slab on the tray (the leafy-greens grow area).
        canopy_w = tray_w - GR_CANOPY_INSET_MM
        canopy_d = tray_d - GR_CANOPY_INSET_MM
        canopy_z = z_shelf + GR_TRAY_THICK_MM / 2 + GR_CANOPY_THICK_MM / 2
        fl.add_box(f"{nm}_canopy{k}",
                   (cx * fl.MM, y_row * fl.MM, canopy_z * fl.MM),
                   (canopy_w * fl.MM, canopy_d * fl.MM, GR_CANOPY_THICK_MM * fl.MM),
                   canopy_mat, module=cmod, module_objects=MO)

        # (d) Fix 2 — light crop DETAIL across the canopy so it reads as a growing
        #     bed, not a painted slab: a few NFT/hydroponic CHANNELS running along
        #     the tray, OR a sparse grid of plant PUCKS. Cheap instanced shapes,
        #     capped per rack. Skipped if the cap is already hit.
        if crop_drawn < GR_CROP_DETAIL_CAP:
            top_canopy = canopy_z + GR_CANOPY_THICK_MM / 2
            if detail == "pucks":
                pw = canopy_w / (GR_PUCK_COLS + 1)
                pd = canopy_d / (GR_PUCK_ROWS + 1)
                puck_r = min(pw, pd) * 0.28
                for ci in range(GR_PUCK_COLS):
                    for ri in range(GR_PUCK_ROWS):
                        if crop_drawn >= GR_CROP_DETAIL_CAP:
                            break
                        bxp = cx - canopy_w / 2 + pw * (ci + 1)
                        byp = y_row - canopy_d / 2 + pd * (ri + 1)
                        fl.add_cyl(f"{nm}_puck{k}_{ci}_{ri}",
                                   (bxp * fl.MM, byp * fl.MM,
                                    (top_canopy + 18.0) * fl.MM),
                                   max(0.012, puck_r * fl.MM), 70.0 * fl.MM,
                                   canopy_mat, module=cmod, module_objects=MO)
                        crop_drawn += 1
            else:  # "channels" — rows of NFT/hydroponic gullies along the tray X
                ch_pitch = canopy_d / GR_N_CHANNELS
                ch_w = ch_pitch * 0.46
                ch_len = canopy_w * 0.96
                for ci in range(GR_N_CHANNELS):
                    if crop_drawn >= GR_CROP_DETAIL_CAP:
                        break
                    byc = y_row - canopy_d / 2 + ch_pitch * (ci + 0.5)
                    fl.add_box(f"{nm}_channel{k}_{ci}",
                               (cx * fl.MM, byc * fl.MM,
                                (top_canopy + 12.0) * fl.MM),
                               (ch_len * fl.MM, ch_w * fl.MM, 50.0 * fl.MM),
                               channel_mat, module=cmod, module_objects=MO)
                    crop_drawn += 1

        # (e) Fix 1 — LED PANEL fixture hung UNDER the NEXT shelf up, lighting
        #     THIS tier's canopy: a BIG bright emissive lit FACE + a thin dark
        #     HOUSING frame, slightly inset under the shelf so the lit tier is
        #     unmistakable. The face spans nearly the full tray footprint and
        #     sits in clear air above the canopy (well below the shelf above) so
        #     the glow is never occluded. Top tier's panel hangs from the top rail.
        led_z = z_shelf + GR_LED_DROP_MM + GR_CANOPY_THICK_MM + 40.0
        led_ceiling = z_shelf + GR_TIER_PITCH_MM - GR_LED_HOUSE_MM - 30.0
        if k == n_tiers - 1:
            led_ceiling = deck_z_mm + frame_h - GR_LED_HOUSE_MM - 90.0
        led_z = min(led_z, led_ceiling)               # never poke through the shelf above
        led_w = tray_w - GR_LED_INSET_MM * 2          # broad — almost the full shelf
        led_d = tray_d - GR_LED_INSET_MM * 2
        # thin dark housing as a PERIMETER FRAME around the lit face (NOT a solid
        # lid — a full slab would occlude the bright panel from the top camera and
        # read as a dark rack from above). 4 thin bars hugging the panel edge.
        hz = led_z + GR_LED_THICK_MM / 2 + GR_LED_HOUSE_MM / 2 - 6.0
        hbar = 46.0
        for sy in (-1, 1):
            fl.add_box(f"{nm}_ledhouse{k}_{'B' if sy < 0 else 'F'}",
                       (cx * fl.MM, (y_row + sy * (led_d / 2 + hbar / 2)) * fl.MM,
                        hz * fl.MM),
                       ((led_w + 2 * hbar) * fl.MM, hbar * fl.MM,
                        GR_LED_HOUSE_MM * fl.MM),
                       led_house_mat, module=lmod, module_objects=MO)
        for sx in (-1, 1):
            fl.add_box(f"{nm}_ledhouse{k}_{'L' if sx < 0 else 'R'}",
                       ((cx + sx * (led_w / 2 + hbar / 2)) * fl.MM, y_row * fl.MM,
                        hz * fl.MM),
                       (hbar * fl.MM, led_d * fl.MM, GR_LED_HOUSE_MM * fl.MM),
                       led_house_mat, module=lmod, module_objects=MO)
        # bright lit face (emissive in INSPECT via the _ledpanel recolour branch).
        # Open underside + open top (perimeter-only housing) → the glow reads from
        # the top camera AND as a bright band in the tier gap from iso/side.
        fl.add_box(f"{nm}_ledpanel{k}",
                   (cx * fl.MM, y_row * fl.MM, led_z * fl.MM),
                   (led_w * fl.MM, led_d * fl.MM, GR_LED_THICK_MM * fl.MM),
                   led_mat, module=lmod, module_objects=MO)

    # ── industrial castors at the 4 base corners (the mobile-trolley cue) ──
    cradius, cheight = 65.0, 130.0
    for sx in (-px + 50.0, px - 50.0):
        for sy in (-py + 50.0, py - 50.0):
            fl.add_cyl(f"{nm}_castor_{'L' if sx < 0 else 'R'}{'B' if sy < 0 else 'F'}",
                       ((cx + sx) * fl.MM, (y_row + sy) * fl.MM,
                        (deck_z_mm + cheight / 2) * fl.MM),
                       cradius * fl.MM, cheight * fl.MM, castor_mat,
                       module=cmod, module_objects=MO,
                       rotation=(math.radians(90), 0, 0))
    return top_z


# ── Balance-of-plant roles for the grow farm, in lineup order ──────────────
#   (role, name_regex, depth_mm, width_mm, height_mm, module_id, rgb)
# The placer matches the FIRST design part whose name hits the regex (to reflect
# the BoM + tag the skid to that part's module); if none match, the skid is still
# drawn (a real VF always has climate + nutrient + CO2 + control) so the lineup
# reads complete.
_GROW_BOP_ROLES = [
    ("hvac",     r"\bhvac\b|\bahu\b|\bdx\b|air handler|circulation fan|dehumidif|cooling unit|condens",
                 1200.0, 1700.0, 2000.0, "climate_control", (0.00, 0.70, 0.88)),
    ("nutrient", r"fertigation|nutrient|stock tank|dosing|reservoir|\bph\b|irrigation",
                 1500.0, 1600.0, 1700.0, "irrigation_nutrient", (0.00, 0.50, 0.95)),
    ("co2",      r"\bco2\b|carbon dioxide",
                 700.0, 700.0, 1700.0, "climate_control", (0.78, 0.80, 0.84)),
    ("control",  r"\bplc\b|\bpanel\b|distribution|breaker|switch|edge|controller|busbar|\bpsu\b",
                 700.0, 900.0, 1900.0, "electrical_distribution", (0.18, 0.20, 0.26)),
    ("water",    r"steril|effluent|\buv\b|filter|drain|sand|recirculation",
                 700.0, 800.0, 1500.0, "effluent_treatment", (0.40, 0.30, 0.85)),
]


def _select_grow_bop_items(parts):
    """Build the grow-room balance-of-plant lineup list. For each role, find the
    first matching design part (to reflect the BoM + carry its module tag); the
    skid is drawn whether or not a part matches. Returns
    [(role, part_or_None, depth_mm, width_mm, height_mm, module_id, rgb), …]."""
    items = []
    for role, rx, depth, w, h, mod, rgb in _GROW_BOP_ROLES:
        rxc = re.compile(rx, re.IGNORECASE)
        match = next((p for p in parts if rxc.search(str(p.name))), None)
        items.append((role, match, depth, w, h, mod, rgb))
    return items


def _build_grow_bop_hvac(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat, steel,
                         MAT, mod, MO):
    """Climate / air-handling unit: a tall AHU box + a roof supply DUCT stub + a
    pair of circulation-fan rings on the +Y face + a plinth. The dominant climate
    cue along the end wall."""
    fl.add_box(f"{nm}_ahu",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + h_mm / 2) * fl.MM),
               (w_mm * fl.MM, d_mm * fl.MM, h_mm * fl.MM), mat,
               module=mod, module_objects=MO)
    # roof supply duct stub running back over the racks (-X direction)
    duct = _bop_secondary_mat(MAT, "ductwork", (0.55, 0.78, 0.88), 0.25, 0.45)
    fl.add_box(f"{nm}_duct",
               ((cx - w_mm * 0.30) * fl.MM, cy * fl.MM,
                (base_z_mm + h_mm + 120.0) * fl.MM),
               (w_mm * 1.4 * fl.MM, d_mm * 0.4 * fl.MM, 240.0 * fl.MM),
               duct, module=mod, module_objects=MO)
    # two circulation-fan shroud rings on the +Y front face
    ring = _bop_secondary_mat(MAT, "ahufanring", (0.46, 0.48, 0.52), 0.55, 0.40)
    fan = _bop_secondary_mat(MAT, "ahufan", (0.16, 0.17, 0.20), 0.30, 0.50)
    fan_r = min(w_mm * 0.24, h_mm * 0.22)
    for sx in (-w_mm * 0.24, w_mm * 0.24):
        fl.add_torus(f"{nm}_fanring_{'L' if sx < 0 else 'R'}",
                     ((cx + sx) * fl.MM, (cy + d_mm / 2 + 20.0) * fl.MM,
                      (base_z_mm + h_mm * 0.55) * fl.MM),
                     fan_r * fl.MM, max(0.02, fan_r * 0.14) * fl.MM, ring,
                     module=mod, module_objects=MO,
                     rotation=(math.radians(90), 0, 0))
        fl.add_cyl(f"{nm}_fan_{'L' if sx < 0 else 'R'}",
                   ((cx + sx) * fl.MM, (cy + d_mm / 2 + 10.0) * fl.MM,
                    (base_z_mm + h_mm * 0.55) * fl.MM),
                   fan_r * 0.82 * fl.MM, 60.0 * fl.MM, fan,
                   module=mod, module_objects=MO,
                   rotation=(math.radians(90), 0, 0))
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 55) * fl.MM),
               ((w_mm + 50) * fl.MM, (d_mm + 50) * fl.MM, 110 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_grow_bop_nutrient(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat, steel,
                             MAT, mod, MO):
    """Nutrient / fertigation skid: an open frame carrying 2-3 vertical nutrient
    TANKS (blue cylinders) + a low DOSING-PUMP manifold block + a plinth. The
    water+nutrient cue (vs the air HVAC and the gas CO2)."""
    # 2-3 vertical nutrient tanks
    tank = _bop_secondary_mat(MAT, "ntank", (0.00, 0.55, 1.00), 0.10, 0.34)
    n_tanks = 3
    tank_r = min(w_mm / (n_tanks + 1), d_mm * 0.40) * 0.5
    tank_h = h_mm * 0.86
    for i in range(n_tanks):
        bx = cx - w_mm * 0.30 + i * (w_mm * 0.30)
        fl.add_cyl(f"{nm}_tank{i}",
                   (bx * fl.MM, (cy - d_mm * 0.12) * fl.MM,
                    (base_z_mm + tank_h / 2 + 90.0) * fl.MM),
                   max(0.12, tank_r * fl.MM), tank_h * fl.MM, tank,
                   module=mod, module_objects=MO)
    # dosing-pump manifold block (low, in front, +Y)
    fl.add_box(f"{nm}_dosing",
               (cx * fl.MM, (cy + d_mm * 0.28) * fl.MM,
                (base_z_mm + h_mm * 0.20) * fl.MM),
               (w_mm * 0.7 * fl.MM, d_mm * 0.3 * fl.MM, h_mm * 0.36 * fl.MM),
               mat, module=mod, module_objects=MO)
    # a couple of dosing pump heads on the manifold
    pumphd = _bop_secondary_mat(MAT, "dosepump", (1.00, 0.85, 0.00), 0.10, 0.42)
    for i in range(3):
        bx = cx - w_mm * 0.22 + i * (w_mm * 0.22)
        fl.add_cyl(f"{nm}_pumphd{i}",
                   (bx * fl.MM, (cy + d_mm * 0.40) * fl.MM,
                    (base_z_mm + h_mm * 0.30) * fl.MM),
                   60.0 * fl.MM, 150.0 * fl.MM, pumphd, module=mod, module_objects=MO)
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 55) * fl.MM),
               ((w_mm + 50) * fl.MM, (d_mm + 50) * fl.MM, 110 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_grow_bop_co2(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat, steel,
                        MAT, mod, MO):
    """CO2 dosing: a tall pressurised CO2 BOTTLE/tank (light grey cylinder) on a
    small base skid + a regulator/solenoid box at its neck. The gas-dosing cue."""
    bot_r = min(w_mm, d_mm) * 0.34
    bot_h = h_mm * 0.80
    fl.add_cyl(f"{nm}_bottle",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + bot_h / 2 + 120.0) * fl.MM),
               max(0.12, bot_r * fl.MM), bot_h * fl.MM, mat,
               module=mod, module_objects=MO)
    # domed cap
    cap = fl.add_sphere(f"{nm}_cap",
                        (cx * fl.MM, cy * fl.MM, (base_z_mm + bot_h + 120.0) * fl.MM),
                        bot_r * fl.MM, mat, module=mod, module_objects=MO)
    cap.scale = (1.0, 1.0, 0.5)
    # regulator / solenoid box at the neck
    reg = _bop_secondary_mat(MAT, "co2reg", (1.00, 0.85, 0.00), 0.10, 0.42)
    fl.add_box(f"{nm}_regulator",
               ((cx + bot_r * 1.1) * fl.MM, cy * fl.MM,
                (base_z_mm + bot_h * 0.9) * fl.MM),
               (180.0 * fl.MM, 160.0 * fl.MM, 200.0 * fl.MM), reg,
               module=mod, module_objects=MO)
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 50) * fl.MM),
               ((w_mm + 40) * fl.MM, (d_mm + 40) * fl.MM, 100 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_grow_bop_water(nm, cx, cy, base_z_mm, w_mm, d_mm, h_mm, mat, steel,
                          MAT, mod, MO):
    """Water / effluent treatment skid: a filter housing box + a vertical UV
    steriliser barrel + a plinth. The recirculation-water-cleanup cue."""
    fl.add_box(f"{nm}_filter",
               ((cx - w_mm * 0.20) * fl.MM, cy * fl.MM,
                (base_z_mm + h_mm * 0.45) * fl.MM),
               (w_mm * 0.5 * fl.MM, d_mm * 0.7 * fl.MM, h_mm * 0.82 * fl.MM), mat,
               module=mod, module_objects=MO)
    # vertical UV steriliser barrel
    uv = _bop_secondary_mat(MAT, "uvbarrel", (0.55, 0.35, 1.00), 0.20, 0.35)
    fl.add_cyl(f"{nm}_uv",
               ((cx + w_mm * 0.24) * fl.MM, cy * fl.MM,
                (base_z_mm + h_mm * 0.5 + 80.0) * fl.MM),
               max(0.07, min(w_mm, d_mm) * 0.10 * fl.MM), h_mm * 0.78 * fl.MM, uv,
               module=mod, module_objects=MO)
    fl.add_box(f"{nm}_plinth",
               (cx * fl.MM, cy * fl.MM, (base_z_mm + 50) * fl.MM),
               ((w_mm + 40) * fl.MM, (d_mm + 40) * fl.MM, 100 * fl.MM),
               steel, module=mod, module_objects=MO)


def _build_grow_room_enclosure(cx, cy, base_z_mm, w_mm, d_mm, h_mm, MAT, MO):
    """Grow-ROOM / building shell (floor + roof + 4 walls), tagged with the VF
    STRUCTURE module id and named u_skid_* so INSPECT renders it as the SAME faint
    wireframe the process-skid + container use (interior reads through it). cx/cy =
    footprint centre (mm); base_z_mm = floor underside. Deterministic + universal."""
    enc_mat = fl.make_mat("m_grow_room", (0.55, 0.56, 0.58),
                          metallic=0.20, roughness=0.55)
    sid = STRUCTURE_MODULE_ID
    if sid not in MO:
        MO[sid] = []
    t = GR_ROOM_WALL_MM

    def _mm3(t3):
        return tuple(c * fl.MM for c in t3)

    fl.add_box("u_skid_grow_floor", _mm3((cx, cy, base_z_mm + t / 2)),
               _mm3((w_mm, d_mm, t)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_grow_roof", _mm3((cx, cy, base_z_mm + h_mm - t / 2)),
               _mm3((w_mm, d_mm, t)), enc_mat, module=sid, module_objects=MO)
    wall_h = h_mm - 2 * t
    fl.add_box("u_skid_grow_wall_back",
               _mm3((cx, cy - d_mm / 2 + t / 2, base_z_mm + h_mm / 2)),
               _mm3((w_mm, t, wall_h)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_grow_wall_front",
               _mm3((cx, cy + d_mm / 2 - t / 2, base_z_mm + h_mm / 2)),
               _mm3((w_mm, t, wall_h)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_grow_wall_left",
               _mm3((cx - w_mm / 2 + t / 2, cy, base_z_mm + h_mm / 2)),
               _mm3((t, d_mm, wall_h)), enc_mat, module=sid, module_objects=MO)
    fl.add_box("u_skid_grow_wall_right",
               _mm3((cx + w_mm / 2 - t / 2, cy, base_z_mm + h_mm / 2)),
               _mm3((t, d_mm, wall_h)), enc_mat, module=sid, module_objects=MO)


def _route_panel_array_topology(topology, parts, rack_anchor_by_index, bop_anchor,
                                 frame_top_mm, bbox, MAT, MO):
    """Route the grow-farm topology, reusing the overhead-rack router + the
    cable-tray (electrical: LED power) and pipe (fluid: nutrient/water + air/
    thermal: climate) primitives. Resolve each edge endpoint against the grow-farm
    anchors FIRST (a grow/tray/canopy/led end → the rack-block bus point; a
    climate/nutrient/co2/control/water end → its BoP skid anchor), then fall back
    to the generic part resolver. electrical_bus → copper cable tray; thermal /
    fluid_loop → coloured pipe. Returns (routed, unresolved)."""
    rack_z = rack_elevation_mm(frame_top_mm)
    if rack_anchor_by_index:
        bx = sum(a[0] for a in rack_anchor_by_index) / len(rack_anchor_by_index)
        by = sum(a[1] for a in rack_anchor_by_index) / len(rack_anchor_by_index)
        bz = max(a[2] for a in rack_anchor_by_index)
        rack_bus_pt = (bx, by, bz)
    else:
        rack_bus_pt = ((bbox["x0"] + bbox["x1"]) / 2, (bbox["y0"] + bbox["y1"]) / 2,
                       DECK_Z_MM + 2400.0)

    ROLE_RE = {
        "hvac":     re.compile(r"\bhvac\b|\bahu\b|\bdx\b|evaporator|air|climate|"
                               r"thermal|cooling|condens|refriger|dehumidif|reheat",
                               re.IGNORECASE),
        "nutrient": re.compile(r"fertigation|nutrient|dosing|reservoir|\bph\b|"
                               r"irrigation|drip", re.IGNORECASE),
        "co2":      re.compile(r"\bco2\b|carbon dioxide", re.IGNORECASE),
        "control":  re.compile(r"\bplc\b|distribution|\bpanel\b|breaker|controller|"
                               r"\bpsu\b", re.IGNORECASE),
        "water":    re.compile(r"steril|effluent|\buv\b|filter|drain|recirculation|"
                               r"\bvalve\b", re.IGNORECASE),
    }
    # Non-LETTER boundaries (not \b) so UNDERSCORE-joined topology endpoints match:
    # \b sits between two word chars at 'led_array' (the '_a' is mid-word) so \barray\b
    # never fires on 'led_array'. (?<![a-z]) / (?![a-z]) treat '_' as a separator.
    GROW_END_RE = re.compile(
        r"(?<![a-z])(?:grow|growing|tray|canopy|led|tier|crop|plant|propagation|"
        r"array|trolley)(?![a-z])", re.IGNORECASE)

    def _resolve(endpoint_name):
        """Return ((x,y,z), kind) where kind ∈ {"rack","bop","part","none"} so the
        caller can DROP a grow-aggregate edge (replaced by the derived per-rack
        loop) and skip an unresolvable one rather than misrouting it to the centroid."""
        nm = str(endpoint_name)
        if GROW_END_RE.search(nm):
            return rack_bus_pt, "rack"
        for role, rx in ROLE_RE.items():
            if rx.search(nm) and role in bop_anchor:
                return bop_anchor[role], "bop"
        p = resolve_endpoint(nm, parts)
        if p is not None and p.placed_xyz_mm is not None:
            return (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                    p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2]), "part"
        return None, "none"

    # ── Build the grow-room equipment bboxes (grow-rack block + BoP skids) so the
    # rack spine sits in the maintenance aisle + the over-equipment audit has targets.
    gr_bboxes = []
    for ax, ay, atop in (rack_anchor_by_index or []):
        gr_bboxes.append((ax - GR_RACK_LEN_MM / 2, ay - GR_RACK_DEPTH_MM / 2,
                          ax + GR_RACK_LEN_MM / 2, ay + GR_RACK_DEPTH_MM / 2, atop))
    for role, (bx, by, btop) in (bop_anchor or {}).items():
        gr_bboxes.append((bx - BOP_LANE_W_MM / 2, by - BOP_LANE_W_MM / 2,
                          bx + BOP_LANE_W_MM / 2, by + BOP_LANE_W_MM / 2, btop))
    plan = make_rack_plan_for_rows(bbox, rack_z, gr_bboxes, axis="x")

    resolved = []
    unresolved = []
    for i, e in enumerate(topology):
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "fluid_loop")
        a, a_kind = _resolve(frm)
        b, b_kind = _resolve(to)
        # A GROW-aggregate endpoint (led_array / canopy / trolley) is the WHOLE rack
        # block — the derived per-rack loop below draws the real fan-out, so DROP the
        # single-centroid explicit edge (the "ONE bus, no water loop" defect).
        if a_kind == "rack" or b_kind == "rack":
            print(f"[univ][panelarray] edge {i} ({mech}) {frm} -> {to} is a grow "
                  f"aggregate — superseded by derived per-rack fan-out")
            continue
        if a is None or b is None:
            miss = [n for n, k in ((frm, a_kind), (to, b_kind)) if k == "none"]
            unresolved.append((frm, to, mech, miss))
            print(f"[univ][panelarray] edge {i} UNRESOLVED ({mech}): {frm} -> {to} "
                  f"[missing: {', '.join(miss)}]")
            continue
        resolved.append({
            "i": i, "mech": mech, "a_xyz": a, "b_xyz": b,
            "a_abstract": True, "b_abstract": True,
            "a_conn": None, "b_conn": None, "b_branch": [],
            "pa": None, "pb": None, "a_nm": frm, "b_nm": to,
            # carry the raw topology edge (rating fields) for real diameter sizing.
            "edge": e,
        })

    # ── UNIVERSAL per-rack flow DERIVATION: panel → each grow rack (+ HVAC) for the
    #    LED power; fertigation reservoir → each rack → return-drainage-grid →
    #    reservoir for the closed WATER loop; HVAC/AHU → each rack for climate. The
    #    consumers are the grow-rack anchors the placer emitted; hubs/collectors are
    #    found by ROLE on the BoM parts. A VF always has electrical + fluid; thermal
    #    is added when an HVAC/AHU hub is present.
    mech_present = _mechanisms_present_in(topology, parts,
                                          extra=("electrical", "fluid"))
    hubs, collectors = _bop_anchors_to_families(bop_anchor, parts)
    derived = derive_flows(parts, rack_anchor_by_index, topology, mech_present,
                           hub_anchors=bop_anchor, hubs=hubs, collectors=collectors)
    print(f"[univ][panelarray] derived per-unit flows = {len(derived)} "
          f"(mechanisms: {sorted(mech_present)}; hubs: "
          f"{ {k: v[0] for k, v in hubs.items()} }; "
          f"collectors: { {k: v[0] for k, v in collectors.items()} })")
    resolved.extend(derived)

    routed, emit_unresolved = _emit_routes_on_plan(
        resolved, plan, rack_z, MAT, MO,
        pipe_module="irrigation_nutrient", tag="pa_")
    unresolved.extend(emit_unresolved)
    return routed, unresolved


# Module-level handoff of the contract quantities to place_panel_array (set in
# main() right before dispatch), mirroring _RACKFARM_QUANTITIES so the shared
# placer signature stays unchanged.
_PANELARRAY_QUANTITIES = None


def place_panel_array(parts, regions, topology, MAT, MO):
    """PANEL-ARRAY (grow-rack) strategy — vertical farm. Render the design as a
    real grow room: ROWS OF MULTI-TIER GROW RACKS (stacked grow trays + green
    canopy + an LED panel per tier) with maintenance aisles, the climate /
    nutrient / CO2 / control / water balance-of-plant lined up along one end wall,
    the whole lot inside a grow-room shell. The thousands of plants are AGGREGATED
    into the tier canopies (never drawn one-by-one). Same return tuple as the other
    strategies: (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    quantities = _PANELARRAY_QUANTITIES or {}
    n_racks, n_tiers, n_rows, racks_per_row, basis = _derive_grow_grid(
        quantities, parts)
    tray_count = qval(quantities, "tray_count")
    canopy_area = qval(quantities, "canopy_area_m2")
    print(f"[univ][panelarray] grow grid: {n_racks} racks "
          f"= {n_rows} row(s) × {racks_per_row}, {n_tiers} tiers/rack "
          f"= {n_racks * n_tiers} grow trays "
          f"(basis: {basis}); tray_count(contract)={tray_count}, "
          f"canopy_area_m2={canopy_area} — trays/canopy aggregated per tier "
          f"(one canopy slab + one LED panel per tier, not per plant)")

    steel = _steel_mat(MAT)
    if "u_gr_frame" not in MAT:
        MAT["u_gr_frame"] = fl.make_mat("m_gr_frame", (0.80, 0.82, 0.85),
                                        metallic=0.55, roughness=0.34)
    frame_mat = MAT["u_gr_frame"]
    if "u_gr_tray" not in MAT:
        MAT["u_gr_tray"] = fl.make_mat("m_gr_tray", (0.78, 0.80, 0.83),
                                       metallic=0.50, roughness=0.36)
    tray_mat = MAT["u_gr_tray"]
    if "u_gr_canopy" not in MAT:
        MAT["u_gr_canopy"] = fl.make_mat("m_gr_canopy", (0.06, 0.55, 0.12),
                                         metallic=0.0, roughness=0.62)
    canopy_mat = MAT["u_gr_canopy"]
    if "u_gr_led" not in MAT:
        # bright white-blue LED lit FACE (emissive so it reads as a lit fixture
        # in the PDF pass; INSPECT pass re-applies an emissive matte via the
        # _ledpanel recolour branch). Strong emission so the lit tiers glow.
        MAT["u_gr_led"] = fl.make_mat("m_gr_led", (0.74, 0.86, 1.00),
                                      metallic=0.0, roughness=0.28,
                                      emission_strength=3.0)
    led_mat = MAT["u_gr_led"]
    if "u_gr_ledhouse" not in MAT:
        # thin dark housing frame around the lit LED face
        MAT["u_gr_ledhouse"] = fl.make_mat("m_gr_ledhouse", (0.20, 0.22, 0.26),
                                           metallic=0.45, roughness=0.42)
    led_house_mat = MAT["u_gr_ledhouse"]
    if "u_gr_channel" not in MAT:
        # NFT/hydroponic channel — pale white-grey gully running along the tray
        MAT["u_gr_channel"] = fl.make_mat("m_gr_channel", (0.86, 0.90, 0.94),
                                          metallic=0.10, roughness=0.40)
    channel_mat = MAT["u_gr_channel"]
    if "u_gr_castor" not in MAT:
        # dark rubber/steel castor wheel at the rack base
        MAT["u_gr_castor"] = fl.make_mat("m_gr_castor", (0.16, 0.17, 0.20),
                                         metallic=0.30, roughness=0.55)
    castor_mat = MAT["u_gr_castor"]

    # ── 1. ROWS OF MULTI-TIER GROW RACKS ────────────────────────────────────
    rack_pitch_x = GR_RACK_LEN_MM + GR_RACK_GAP_X_MM
    row_pitch = GR_RACK_PITCH_MM
    rack_anchor_by_index = []     # (cx, cy, top_z) per placed rack, for routing
    placed = 0
    rack_tops = []
    for row in range(n_rows):
        y_row = row * row_pitch
        n_this = min(racks_per_row, n_racks - placed)
        for col in range(n_this):
            cx = col * rack_pitch_x
            nm = f"u_gr_rack_r{row}_c{col}"
            top_z = _build_grow_rack(nm, cx, y_row, DECK_Z_MM, n_tiers,
                                     frame_mat, tray_mat, canopy_mat, led_mat,
                                     led_house_mat, channel_mat, castor_mat,
                                     MAT, MO)
            rack_anchor_by_index.append((cx, y_row, top_z))
            rack_tops.append(top_z)
        placed += n_this

    racks_x0 = -GR_RACK_LEN_MM / 2
    racks_x1 = (racks_per_row - 1) * rack_pitch_x + GR_RACK_LEN_MM / 2
    racks_y0 = -GR_RACK_DEPTH_MM / 2
    racks_y1 = (n_rows - 1) * row_pitch + GR_RACK_DEPTH_MM / 2
    rack_top_max = max(rack_tops) if rack_tops else DECK_Z_MM + 2400.0

    # ── 2. BALANCE-OF-PLANT LINEUP along the +X end wall ────────────────────
    bop_x = racks_x1 + GR_ROW_GAP_END_MM
    bop_y_centre = (racks_y0 + racks_y1) / 2
    bop_items = _select_grow_bop_items(parts)
    region_centres = {}
    bop_anchor = {}
    cursor_y = bop_y_centre - (sum(it[2] for it in bop_items)
                               + GR_BOP_GAP_MM * max(0, len(bop_items) - 1)) / 2.0
    bop_y_lo = cursor_y
    bop_y_hi = cursor_y
    for role, part_or_none, depth_mm, w_mm, h_mm, role_mod, rgb in bop_items:
        cx = bop_x + w_mm / 2
        cy = cursor_y + depth_mm / 2
        bop_y_hi = cursor_y + depth_mm
        nm = f"u_gr_bop_{role}"
        mat = MAT.get(f"u_gr_bop_{role}") or fl.make_mat(
            f"m_gr_bop_{role}", rgb, metallic=0.30, roughness=0.42)
        MAT[f"u_gr_bop_{role}"] = mat
        # prefer the matched part's module tag; else the role's default VF module
        mod = part_or_none.module_id if part_or_none else role_mod
        if mod not in MO:
            MO[mod] = []
        if role == "hvac":
            _build_grow_bop_hvac(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                 mat, steel, MAT, mod, MO)
        elif role == "nutrient":
            _build_grow_bop_nutrient(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                     mat, steel, MAT, mod, MO)
        elif role == "co2":
            _build_grow_bop_co2(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                mat, steel, MAT, mod, MO)
        elif role == "water":
            _build_grow_bop_water(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                  mat, steel, MAT, mod, MO)
        else:  # control → small wall cabinet (reuse the rack-farm builder)
            _build_bop_wall_cabinet(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                    mat, steel, MAT, mod, MO)
        bop_anchor[role] = (cx, cy, DECK_Z_MM + h_mm)
        region_centres[role] = (cx, cy)
        cursor_y += depth_mm + GR_BOP_GAP_MM
    bop_x1 = bop_x + max((it[3] for it in bop_items), default=BOP_LANE_W_MM)

    # ── 3. GROW-ROOM ENCLOSURE around racks + aisles + BoP ──────────────────
    enc_x0 = racks_x0 - GR_ROOM_MARGIN_MM
    enc_x1 = bop_x1 + GR_ROOM_MARGIN_MM
    enc_y0 = min(racks_y0, bop_y_lo) - GR_ROOM_MARGIN_MM
    enc_y1 = max(racks_y1, bop_y_hi) + GR_ROOM_MARGIN_MM
    enc_w = enc_x1 - enc_x0
    enc_d = enc_y1 - enc_y0
    # room is tall enough to clear the tallest rack OR the tallest BoP skid
    bop_top = max((DECK_Z_MM + it[4] for it in bop_items), default=DECK_Z_MM)
    enc_h = max(rack_top_max, bop_top) - DECK_Z_MM + 2 * GR_ROOM_MARGIN_MM
    enc_cx = (enc_x0 + enc_x1) / 2
    enc_cy = (enc_y0 + enc_y1) / 2
    _build_grow_room_enclosure(enc_cx, enc_cy, DECK_Z_MM, enc_w, enc_d, enc_h,
                               MAT, MO)
    frame_top_mm = DECK_Z_MM + enc_h
    print(f"[univ][panelarray] grow-room enclosure: {enc_w/1000:.1f}×{enc_d/1000:.1f} m "
          f"footprint, {enc_h/1000:.1f} m tall; BoP lineup of {len(bop_items)} skids")

    # ── 4. TOPOLOGY: LED power (electrical) + nutrient/water (fluid) + climate
    #    (air/thermal) routed as cable trays + coloured pipes via the shared router.
    bbox = {"x0": enc_x0, "x1": enc_x1, "y0": enc_y0, "y1": enc_y1}
    routed, unresolved = _route_panel_array_topology(
        topology, parts, rack_anchor_by_index, bop_anchor, frame_top_mm, bbox,
        MAT, MO)
    print(f"[univ][panelarray] topology routed = {routed}/{len(topology)}; "
          f"unresolved = {len(unresolved)}")

    region_centres["rack_block"] = ((racks_x0 + racks_x1) / 2,
                                    (racks_y0 + racks_y1) / 2)
    return bbox, region_centres, frame_top_mm, routed, unresolved


# ═══════════════════════════════════════════════════════════════════════════
# TOWER-MACHINE STRATEGY — wind turbine + similar tower archetypes (2026-06-10)
# ───────────────────────────────────────────────────────────────────────────
# The 5th geometry family. A wind turbine is NOT an aircraft (no fuselage/wing),
# NOT a process plant (no vessels), NOT a rack farm (no cabinet rows): it is a
# FREE-STANDING TALL TOWER carrying a nacelle + a 3-blade rotor on a hub, on a
# foundation, with a power-conversion balance-of-plant lineup at the base. So
# tower_machine builds NO skid frame and NO enclosure (like aero) — it renders the
# MACHINE itself on a faint ground plane:
#   • a tall TAPERED TOWER tube (wide base → narrow top), grey;
#   • a NACELLE box at the tower top (the gearbox/generator housing), grey;
#   • a 3-blade ROTOR on a HUB at the FRONT (+X) of the nacelle: a hub cone + N
#     long tapered aerofoil blades at 360/N° spacing, white;
#   • a FOUNDATION pad/plinth at the base (concrete-grey);
#   • a BoP lineup (converter / transformer / switchgear / SCADA) as a small row
#     of cabinets at the tower base, by role.
# All geometry is millimetre-based (× fl.MM). Objects are named u_tm_* so
# apply_inspection_materials recolours them by role in INSPECT. Same return tuple
# as the other strategies. Deterministic + universal — sizes come from the contract
# quantities (rotor_diameter_m / hub_height_m / blade_count / blade_root_chord_m)
# with sane fallbacks, so it works on any tower machine, not just this turbine.
# ═══════════════════════════════════════════════════════════════════════════

# ── Tower-machine geometry fallbacks (mm) when the contract is silent ──
TM_HUB_HEIGHT_FALLBACK_MM   = 50000.0   # tower/hub height
TM_ROTOR_DIA_FALLBACK_MM    = 45000.0   # rotor diameter (blade tip to tip)
TM_BLADE_COUNT_FALLBACK     = 3
TM_TOWER_BASE_DIA_FRAC      = 0.085     # tower base diameter ≈ this × hub height
TM_TOWER_TOP_DIA_FRAC       = 0.55      # tower top diameter ≈ this × base diameter
TM_NACELLE_LEN_FRAC         = 0.10      # nacelle length ≈ this × rotor diameter
TM_NACELLE_W_FRAC           = 0.55      # nacelle width/height ≈ this × its length
TM_HUB_DIA_FRAC             = 0.055     # hub diameter ≈ this × rotor diameter
TM_BLADE_ROOT_CHORD_FRAC    = 0.10      # blade root chord ≈ this × rotor radius (fallback)
TM_BOP_GAP_MM               = 600.0     # gap between base BoP cabinets
TM_BOP_STANDOFF_MM          = 6000.0    # BoP lineup offset from the tower centre (−Y)


def _tm_palette(MAT):
    """Cache + return the tower-machine materials (used for the PDF/non-INSPECT
    render; INSPECT recolours by name). Tower/nacelle light grey, blades white,
    hub grey, foundation concrete-grey."""
    P = {}
    def mk(key, rgb, met=0.30, rough=0.45):
        mk2 = f"u_tm_{key}"
        if mk2 not in MAT:
            MAT[mk2] = fl.make_mat(f"m_tm_{key}", rgb, metallic=met, roughness=rough)
        return MAT[mk2]
    P["tower"]   = mk("tower",   (0.82, 0.83, 0.85), 0.35, 0.42)
    P["nacelle"] = mk("nacelle", (0.80, 0.81, 0.84), 0.40, 0.40)
    P["blade"]   = mk("blade",   (0.95, 0.95, 0.96), 0.05, 0.45)
    P["hub"]     = mk("hub",     (0.66, 0.68, 0.72), 0.45, 0.40)
    P["found"]   = mk("found",   (0.62, 0.61, 0.58), 0.0,  0.85)
    return P


def _tm_basis_euler(c_hat, n_hat, r_hat):
    """Euler angles (XYZ) for a box whose LOCAL axes (x=chord, y=thickness, z=span)
    map to the given WORLD orthonormal basis (c_hat, n_hat, r_hat). Built from the
    rotation matrix whose columns are those basis vectors → .to_euler(). mathutils
    is Blender-only, imported lazily like the rest of this module."""
    import mathutils
    m = mathutils.Matrix((
        (c_hat[0], n_hat[0], r_hat[0]),
        (c_hat[1], n_hat[1], r_hat[1]),
        (c_hat[2], n_hat[2], r_hat[2]),
    ))
    return m.to_euler()


def _tm_build_blade(nm, hub_xyz_mm, angle_rad, length_mm, root_chord_mm, mat,
                    mod, MO):
    """One tapered, TWISTED aerofoil BLADE radiating from the hub centre in the
    rotor plane (the Y–Z plane; the rotor faces +X). `angle_rad` sets the blade's
    clock position around the hub axis. Built as a chain of flat AEROFOIL sections
    (boxes: chord ≫ thickness) root→tip so it reads as a real wind blade — a fat,
    rounded, near-cylindrical root; a broad max-chord shoulder; a long taper to a
    thin tip; and a continuous TWIST that feathers the chord from a steep root
    pitch toward flat-in-plane at the tip. Deterministic; geometry only.

    Frame per segment at radius r (all unit world vectors):
      • r_hat = radial/span direction = (0, cos θ, sin θ)  → box local +Z (length)
      • t_hat = in-plane tangential   = (0, -sin θ, cos θ)
      • the chord lies in the X–t_hat plane, tilted by the local twist φ(r):
          c_hat = cos φ · X̂ + sin φ · t_hat                → box local +X (chord)
      • n_hat = r_hat × c_hat (thickness normal)             → box local +Y (thin)
    """
    hx, hy, hz = hub_xyz_mm
    ry, rz = math.cos(angle_rad), math.sin(angle_rad)     # radial (span) unit
    ty, tz = -math.sin(angle_rad), math.cos(angle_rad)    # in-plane tangential unit
    r_hat = (0.0, ry, rz)
    t_hat = (0.0, ty, tz)
    x_hat = (1.0, 0.0, 0.0)

    # planform: max chord sits just outboard of the root (~22% span), then tapers.
    # twist: steep at the root (blade is pitched + cambered into the wind), ~flat
    # in-plane at the tip. Both are smooth functions of the span fraction f∈[0,1].
    root_twist = math.radians(20.0)    # root chord pitched ~20° out of the rotor plane
    tip_twist  = math.radians(3.0)     # tip nearly flat-in-plane (feathered)
    tc_ratio   = 0.16                  # aerofoil thickness / chord (fat root section)

    def chord_at(f):
        # 0→max over the first 22% (root build-up), then linear taper to a thin tip.
        if f < 0.22:
            base = 0.42 + (1.0 - 0.42) * (f / 0.22)        # 0.42·c → 1.00·c
        else:
            base = 1.0 - 0.80 * ((f - 0.22) / 0.78)        # 1.00·c → 0.20·c
        return max(root_chord_mm * 0.10, root_chord_mm * base)

    def twist_at(f):
        return root_twist + (tip_twist - root_twist) * (f ** 0.7)

    # ── 1. rounded blade ROOT — a short cylinder (circular root stub) at the hub ──
    root_len = length_mm * 0.10
    root_r = root_chord_mm * 0.30
    rcx = hx
    rcy = hy + ry * (root_len / 2.0)
    rcz = hz + rz * (root_len / 2.0)
    # cylinder axis = +Z locally; spin it onto the radial direction via the basis.
    root_eul = _tm_basis_euler(x_hat, t_hat, r_hat)
    fl.add_cyl(f"{nm}_root", (rcx * fl.MM, rcy * fl.MM, rcz * fl.MM),
               root_r * fl.MM, root_len * fl.MM, mat,
               module=mod, module_objects=MO, rotation=root_eul)

    # ── 2. aerofoil SECTIONS from the root stub out to the tip ──
    n_seg = 9
    span0 = root_len
    aero_len = length_mm - root_len
    seg_len = aero_len / n_seg
    for s in range(n_seg):
        r0 = span0 + s * seg_len
        rc = r0 + seg_len / 2.0
        f = rc / length_mm                              # span fraction at seg centre
        chord = chord_at(f)
        thick = max(root_chord_mm * 0.02, chord * tc_ratio * (1.0 - 0.4 * f))
        phi = twist_at(f)
        # chord unit vector in the X–tangential plane, tilted by the local twist
        cphi, sphi = math.cos(phi), math.sin(phi)
        c_hat = (cphi * 1.0, sphi * ty, sphi * tz)
        # thickness normal = r_hat × c_hat (orthonormal; both are unit + perpendicular)
        n_hat = (
            r_hat[1] * c_hat[2] - r_hat[2] * c_hat[1],
            r_hat[2] * c_hat[0] - r_hat[0] * c_hat[2],
            r_hat[0] * c_hat[1] - r_hat[1] * c_hat[0],
        )
        nmag = math.sqrt(n_hat[0] ** 2 + n_hat[1] ** 2 + n_hat[2] ** 2) or 1.0
        n_hat = (n_hat[0] / nmag, n_hat[1] / nmag, n_hat[2] / nmag)
        cx = hx                                          # blade stays in the hub's X
        cy = hy + ry * rc
        cz = hz + rz * rc
        eul = _tm_basis_euler(c_hat, n_hat, r_hat)
        # the box is the flat aerofoil section: chord (local X) ≫ thickness (local Y),
        # span = seg_len (local Z). The twisted basis gives a real twisted blade.
        fl.add_box(f"{nm}_seg{s}",
                   (cx * fl.MM, cy * fl.MM, cz * fl.MM),
                   (chord * fl.MM, thick * fl.MM, seg_len * 1.04 * fl.MM), mat,
                   module=mod, module_objects=MO, rotation=eul)
    # ── 3. a small rounded TIP cap so the blade doesn't end on a hard rectangle ──
    f_tip = 1.0
    tip_chord = chord_at(0.985)
    tip_phi = twist_at(f_tip)
    tcphi, tsphi = math.cos(tip_phi), math.sin(tip_phi)
    tc_hat = (tcphi, tsphi * ty, tsphi * tz)
    tn = (
        r_hat[1] * tc_hat[2] - r_hat[2] * tc_hat[1],
        r_hat[2] * tc_hat[0] - r_hat[0] * tc_hat[2],
        r_hat[0] * tc_hat[1] - r_hat[1] * tc_hat[0],
    )
    tnm = math.sqrt(tn[0] ** 2 + tn[1] ** 2 + tn[2] ** 2) or 1.0
    tn = (tn[0] / tnm, tn[1] / tnm, tn[2] / tnm)
    tip_eul = _tm_basis_euler(tc_hat, tn, r_hat)
    tcx, tcy, tcz = hx, hy + ry * length_mm, hz + rz * length_mm
    fl.add_box(f"{nm}_tip", (tcx * fl.MM, tcy * fl.MM, tcz * fl.MM),
               (tip_chord * 0.7 * fl.MM, tip_chord * 0.10 * fl.MM,
                length_mm * 0.03 * fl.MM), mat,
               module=mod, module_objects=MO, rotation=tip_eul)


def place_tower_machine(parts, regions, topology, MAT, MO):
    """TOWER-MACHINE strategy (wind turbine + similar tower archetypes). Renders the
    machine itself in FREE SPACE on a faint ground plane: a tapered tower tube + a
    nacelle at the top + a 3-blade rotor on a hub at the nacelle front + a foundation
    pad at the base + a BoP cabinet lineup at the tower base. Sizes come from the
    contract (rotor_diameter_m / hub_height_m / blade_count / blade_root_chord_m)
    with fallbacks. Same return tuple as the other strategies:
    (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    quantities = _TOWERMACHINE_QUANTITIES or {}
    P = _tm_palette(MAT)

    # ── 1. derive dimensions from the engineering contract ──
    hub_h = (qval(quantities, "hub_height_m") or 0) * 1000.0 or TM_HUB_HEIGHT_FALLBACK_MM
    rotor_d = (qval(quantities, "rotor_diameter_m") or 0) * 1000.0 or TM_ROTOR_DIA_FALLBACK_MM
    n_blades = int(qval(quantities, "blade_count") or TM_BLADE_COUNT_FALLBACK)
    n_blades = max(2, min(5, n_blades))
    root_chord = (qval(quantities, "blade_root_chord_m") or 0) * 1000.0 \
        or (rotor_d / 2) * TM_BLADE_ROOT_CHORD_FRAC
    base_dia = hub_h * TM_TOWER_BASE_DIA_FRAC
    top_dia = base_dia * TM_TOWER_TOP_DIA_FRAC
    nac_len = rotor_d * TM_NACELLE_LEN_FRAC
    nac_w = nac_len * TM_NACELLE_W_FRAC
    hub_dia = rotor_d * TM_HUB_DIA_FRAC
    blade_len = (rotor_d / 2) - hub_dia / 2
    print(f"[univ][tower] turbine: hub_height={hub_h/1000:.1f} m, "
          f"rotor_dia={rotor_d/1000:.1f} m, {n_blades} blades "
          f"(len {blade_len/1000:.1f} m, root chord {root_chord/1000:.2f} m); "
          f"tower base Ø{base_dia/1000:.2f}→top Ø{top_dia/1000:.2f} m; "
          f"nacelle {nac_len/1000:.1f}×{nac_w/1000:.2f} m")

    tm_mod = "energy_conversion_transduction"
    if tm_mod not in MO:
        MO[tm_mod] = []
    struct_mod = STRUCTURE_MODULE_ID
    if struct_mod not in MO:
        MO[struct_mod] = []

    # ── 2. FOUNDATION — a circular concrete pad + a raised pedestal/plinth ──
    #    Wide low octagonal-ish pad (gravity base) + a shorter raised pedestal the
    #    tower flange bolts onto, so the base reads as a real concrete foundation.
    found_dia = base_dia * 2.6
    found_h = max(900.0, base_dia * 0.50)
    fl.add_cyl("u_tm_found_pad",
               (0.0, 0.0, (DECK_Z_MM + found_h / 2) * fl.MM),
               (found_dia / 2) * fl.MM, found_h * fl.MM, P["found"],
               module=struct_mod, module_objects=MO)
    # raised pedestal (smaller drum) on top of the pad
    ped_dia = base_dia * 1.45
    ped_h = found_h * 0.55
    fl.add_cyl("u_tm_found_pedestal",
               (0.0, 0.0, (DECK_Z_MM + found_h + ped_h / 2) * fl.MM),
               (ped_dia / 2) * fl.MM, ped_h * fl.MM, P["found"],
               module=struct_mod, module_objects=MO)
    base_z = DECK_Z_MM + found_h + ped_h    # tower springs from the pedestal top
    # tower base flange (steel ring) bolted to the pedestal
    steel_mat = _steel_mat(MAT)
    fl.add_cyl("u_tm_tower_baseflange",
               (0.0, 0.0, (base_z + base_dia * 0.04) * fl.MM),
               (base_dia / 2 * 1.12) * fl.MM, (base_dia * 0.08) * fl.MM, steel_mat,
               module=struct_mod, module_objects=MO)

    # ── 3. TOWER — a tall TAPERED tube (frustum), wide base → narrow top ──
    fl.add_frustum("u_tm_tower",
                   (0.0, 0.0, (base_z + hub_h / 2) * fl.MM),
                   (base_dia / 2) * fl.MM, (top_dia / 2) * fl.MM,
                   hub_h * fl.MM, P["tower"],
                   module=struct_mod, module_objects=MO, vertices=32)
    tower_top_z = base_z + hub_h
    # ── 3a. base access DOOR on the +X face of the tower ──
    door_w = base_dia * 0.34
    door_h = min(hub_h * 0.045, base_dia * 0.85)
    door_z = base_z + door_h / 2 + base_dia * 0.10
    # the tower radius at the door height (frustum interpolation)
    r_door = (base_dia / 2) + ((top_dia - base_dia) / 2) * ((door_z - base_z) / hub_h)
    door_mat = _bop_secondary_mat(MAT, "towerdoor", (0.30, 0.32, 0.36), 0.40, 0.45)
    fl.add_box("u_tm_tower_door",
               ((r_door * 0.92) * fl.MM, 0.0, door_z * fl.MM),
               ((base_dia * 0.10) * fl.MM, door_w * fl.MM, door_h * fl.MM),
               door_mat, module=struct_mod, module_objects=MO)
    # ── 3b. a couple of flange RINGS up the tower (section joints) ──
    n_flange = 2
    for fi in range(1, n_flange + 1):
        fz = base_z + hub_h * (fi / (n_flange + 1))
        r_fl = (base_dia / 2) + ((top_dia - base_dia) / 2) * ((fz - base_z) / hub_h)
        fl.add_cyl(f"u_tm_tower_flange{fi}",
                   (0.0, 0.0, fz * fl.MM),
                   (r_fl * 1.06) * fl.MM, (base_dia * 0.045) * fl.MM, steel_mat,
                   module=struct_mod, module_objects=MO)

    # ── 4. NACELLE — a STREAMLINED housing on the yaw bearing atop the tower ──
    #    Rotor faces +X, so the nacelle front (where the spinner mounts) is +X and
    #    its gearbox/generator tail tapers down toward the REAR (−X). Body box +
    #    tapered rear fairing + a rounded front cap. Sits on a yaw bearing collar.
    nac_cz = tower_top_z + nac_w * 0.62        # nacelle centreline a touch above the top
    body_len = nac_len * 0.72
    body_cx = -nac_len * 0.04                   # body biased slightly aft of the yaw axis
    fl.add_box("u_tm_nacelle",
               (body_cx * fl.MM, 0.0, nac_cz * fl.MM),
               (body_len * fl.MM, nac_w * fl.MM, nac_w * 0.92 * fl.MM), P["nacelle"],
               module=tm_mod, module_objects=MO)
    # tapered REAR fairing (−X): the generator/cooling tail narrows aft
    rear_x = body_cx - body_len / 2.0
    rear_len = nac_len * 0.26
    fl.add_frustum("u_tm_nacelle_tail",
                   ((rear_x - rear_len / 2.0) * fl.MM, 0.0, nac_cz * fl.MM),
                   (nac_w * 0.30) * fl.MM, (nac_w * 0.46) * fl.MM, rear_len * fl.MM,
                   P["nacelle"], module=tm_mod, module_objects=MO, vertices=20,
                   rotation=(0, math.radians(-90), 0))
    # rounded FRONT cap (+X) blending the nacelle nose toward the spinner mount
    front_x = body_cx + body_len / 2.0
    front_len = nac_len * 0.12
    fl.add_frustum("u_tm_nacelle_nose",
                   ((front_x + front_len / 2.0) * fl.MM, 0.0, nac_cz * fl.MM),
                   (nac_w * 0.46) * fl.MM, (nac_w * 0.34) * fl.MM, front_len * fl.MM,
                   P["nacelle"], module=tm_mod, module_objects=MO, vertices=20,
                   rotation=(0, math.radians(90), 0))
    # small roof anemometer mast (a turbine signature) on the nacelle tail
    fl.add_cyl("u_tm_nacelle_met",
               ((rear_x) * fl.MM, 0.0, (nac_cz + nac_w * 0.5 + nac_w * 0.18) * fl.MM),
               (nac_w * 0.018) * fl.MM, (nac_w * 0.36) * fl.MM, P["hub"],
               module=tm_mod, module_objects=MO)
    # YAW BEARING collar where the nacelle sits on the tower top
    fl.add_cyl("u_tm_yaw",
               (0.0, 0.0, (tower_top_z + nac_w * 0.10) * fl.MM),
               (top_dia / 2 * 1.22) * fl.MM, (nac_w * 0.20) * fl.MM, P["hub"],
               module=tm_mod, module_objects=MO)

    # ── 5. HUB (spinner) + ROTOR at the nacelle FRONT (+X) ──
    #    A spinner = a CONE at the front of the nacelle; the blades radiate from the
    #    spinner base. Build a hub BARREL (the blade-attach drum) + a long nose CONE.
    spinner_base_x = front_x + front_len + hub_dia * 0.20
    hub_xyz = (spinner_base_x, 0.0, nac_cz)     # blades radiate from the barrel centre
    # hub barrel (blades bolt to this drum)
    fl.add_cyl("u_tm_hub",
               (spinner_base_x * fl.MM, 0.0, nac_cz * fl.MM),
               (hub_dia / 2) * fl.MM, (hub_dia * 0.62) * fl.MM, P["hub"],
               module=tm_mod, module_objects=MO,
               rotation=(0, math.radians(90), 0))
    # spinner NOSE cone pointing +X from the barrel front
    nose_len = hub_dia * 1.15
    fl.add_frustum("u_tm_spinner",
                   ((spinner_base_x + hub_dia * 0.31 + nose_len / 2.0) * fl.MM, 0.0,
                    nac_cz * fl.MM),
                   (hub_dia / 2 * 1.02) * fl.MM, (hub_dia * 0.06) * fl.MM,
                   nose_len * fl.MM, P["hub"],
                   module=tm_mod, module_objects=MO, vertices=24,
                   rotation=(0, math.radians(90), 0))
    # N blades at 360/N° around the hub axis (rotor plane = Y–Z, faces +X). Each
    # blade root nests into the barrel; offset the start radius to the barrel edge.
    blade_root_r = hub_dia * 0.42
    for b in range(n_blades):
        ang = (2 * math.pi / n_blades) * b + math.pi / 2   # first blade points up
        # start the blade at the barrel surface, not the hub centre, so the root
        # bolts into the spinner rather than overlapping the nacelle.
        bx = hub_xyz[0]
        by = hub_xyz[1] + math.cos(ang) * blade_root_r
        bz = hub_xyz[2] + math.sin(ang) * blade_root_r
        _tm_build_blade(f"u_tm_blade{b}", (bx, by, bz), ang,
                        blade_len - blade_root_r, root_chord, P["blade"], tm_mod, MO)

    # ── 6. faint GROUND PLANE far below (context; named u_skid_* → faint wire) ──
    plane_extent = max(rotor_d, found_dia) * 1.4
    plane_mat = fl.make_mat("m_tm_ground", (0.62, 0.64, 0.68),
                            metallic=0.0, roughness=0.85)
    fl.add_box("u_skid_tm_ground",
               (0.0, 0.0, (DECK_Z_MM - 20.0) * fl.MM),
               (plane_extent * fl.MM, plane_extent * fl.MM, 40.0 * fl.MM),
               plane_mat, module=struct_mod, module_objects=MO)

    # ── 7. BoP lineup at the tower base (converter/transformer/switchgear/SCADA) ──
    region_centres = {}
    bop_anchor = {}
    bop_items = _select_tm_bop_items(parts)
    steel = _steel_mat(MAT)
    # The cabinet footprints in _TM_BOP_ROLES are realistic absolute sizes (~1.3-3 m)
    # but a lone ~2 m cabinet is visually lost beside a 52 m tower. Scale the lineup
    # up DETERMINISTICALLY toward the upper-realistic end, tied to the tower base
    # diameter, so it reads as a recognisable down-tower equipment cluster at the
    # hero/iso scale for ANY tower-machine size (kept ≤2.4× so it stays plausible).
    bop_scale = max(1.0, min(2.4, base_dia / 2400.0))
    # lay the cabinets in a row in −Y, hugging the foundation, along X about centre.
    bop_y = -(found_dia / 2 + TM_BOP_STANDOFF_MM * 0.5)
    s_items = [(role, p, d * bop_scale, w * bop_scale, h * bop_scale, rgb)
               for (role, p, d, w, h, rgb) in bop_items]
    gap = TM_BOP_GAP_MM * bop_scale
    total_w = sum(it[3] for it in s_items) + gap * max(0, len(s_items) - 1)
    cursor_x = -total_w / 2
    for role, part_or_none, depth_mm, w_mm, h_mm, rgb in s_items:
        cx = cursor_x + w_mm / 2
        cy = bop_y
        nm = f"u_tm_bop_{role}"
        mat = MAT.get(f"u_tm_bop_{role}") or fl.make_mat(
            f"m_tm_bop_{role}", rgb, metallic=0.35, roughness=0.42)
        MAT[f"u_tm_bop_{role}"] = mat
        mod = part_or_none.module_id if part_or_none else tm_mod
        if mod not in MO:
            MO[mod] = []
        if role == "transformer":
            _build_bop_transformer(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                   mat, steel, MAT, mod, MO)
        elif role in ("converter", "switchgear"):
            _build_bop_cabinet_lineup(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                      mat, steel, MAT, mod, MO, n_sections=2,
                                      louvres=True)
        else:  # scada / controller → small wall cabinet
            _build_bop_wall_cabinet(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                                    mat, steel, MAT, mod, MO)
        bop_anchor[role] = (cx, cy, DECK_Z_MM + h_mm)
        region_centres[role] = (cx, cy)
        cursor_x += w_mm + gap

    # ── 8. bbox + frame_top + topology ──
    half = max(rotor_d / 2, found_dia / 2) + 1000.0
    bbox = {"x0": -half, "x1": half,
            "y0": min(-half, bop_y - 2000.0), "y1": half}
    frame_top_mm = nac_cz + rotor_d / 2 + 1000.0   # blade-tip-up clearance
    region_centres["tower"] = (0.0, 0.0)
    region_centres["nacelle"] = (0.0, 0.0)

    routed, unresolved = _route_tower_machine_topology(
        topology, parts, hub_xyz, (0.0, 0.0, nac_cz),
        (0.0, 0.0, base_z + 1500.0), bop_anchor, frame_top_mm, bbox, MAT, MO)
    print(f"[univ][tower] BoP lineup of {len(bop_items)} cabinets; "
          f"topology routed = {routed}/{len(topology)}; unresolved = {len(unresolved)}")
    return bbox, region_centres, frame_top_mm, routed, unresolved


# Module-level handoff of the contract quantities to place_tower_machine (set in
# main() right before dispatch), mirroring _RACKFARM_QUANTITIES.
_TOWERMACHINE_QUANTITIES = None


# Balance-of-plant roles for a tower machine's base lineup, in order. Each entry:
#   (role, name_regex, depth_mm, width_mm, height_mm, rgb). The placer matches the
# first design part whose name hits the regex (to tag the cabinet to its module);
# the cabinet is drawn whether or not a part matches (a turbine always has a
# converter + transformer + switchgear + SCADA at the base).
_TM_BOP_ROLES = [
    ("converter",   r"converter|inverter|\bigbt\b|power module|frequency converter|rectifier",
                                                          1100.0, 1300.0, 1900.0, (0.45, 0.55, 0.68)),
    ("transformer", r"transformer",                      1500.0, 1300.0, 1300.0, (0.30, 0.40, 0.62)),
    ("switchgear",  r"switchgear|breaker|\brmu\b|grid.?side|ac main|main bus",
                                                          900.0, 1000.0, 2000.0, (0.34, 0.38, 0.44)),
    ("scada",       r"scada|\bplc\b|controller|control cabinet|turbine plc|condition monitor",
                                                          700.0, 800.0, 1800.0, (0.30, 0.46, 0.40)),
]


def _select_tm_bop_items(parts):
    """Build the tower-machine base BoP lineup. For each role in _TM_BOP_ROLES, find
    the first matching design part (to reflect the BoM + carry its module tag); the
    cabinet is drawn whether or not a part matches. Returns
    [(role, part_or_None, depth_mm, width_mm, height_mm, rgb), …]."""
    items = []
    for role, rx, depth, w, h, rgb in _TM_BOP_ROLES:
        rxc = re.compile(rx, re.IGNORECASE)
        match = next((p for p in parts if rxc.search(str(p.name))), None)
        items.append((role, match, depth, w, h, rgb))
    return items


def _route_tower_machine_topology(topology, parts, hub_pt, nacelle_pt, base_pt,
                                  bop_anchor, frame_top_mm, bbox, MAT, MO):
    """Route the turbine topology as thin electrical/data CABLE runs down the tower
    to the base BoP. Endpoints resolve against the turbine anchors first (rotor/
    blade/pitch → hub; nacelle/gearbox/generator/yaw → nacelle; tower/base/grid →
    base; converter/transformer/switchgear/scada → their BoP cabinet), then fall
    back to the generic part resolver. Fewer edges may resolve; the count is
    reported. Returns (routed, unresolved)."""
    HUB_RE  = re.compile(r"\brotor\b|\bblade\b|\bpitch\b|\bhub\b|aerodynamic", re.IGNORECASE)
    NAC_RE  = re.compile(r"nacelle|gearbox|generator|\byaw\b|main shaft|bedplate|drivetrain", re.IGNORECASE)
    BASE_RE = re.compile(r"\btower\b|\bbase\b|\bgrid\b|foundation|down.?tower|cable", re.IGNORECASE)
    ROLE_RE = {
        "converter":   re.compile(r"converter|inverter|\bigbt\b|rectifier|power module", re.IGNORECASE),
        "transformer": re.compile(r"transformer|\bgrid\b", re.IGNORECASE),
        "switchgear":  re.compile(r"switchgear|breaker|\brmu\b", re.IGNORECASE),
        "scada":       re.compile(r"scada|\bplc\b|controller|condition monitor", re.IGNORECASE),
    }

    def _resolve(endpoint_name):
        nm = str(endpoint_name)
        for role, rx in ROLE_RE.items():
            if rx.search(nm) and role in bop_anchor:
                return bop_anchor[role]
        if HUB_RE.search(nm):
            return hub_pt
        if NAC_RE.search(nm):
            return nacelle_pt
        if BASE_RE.search(nm):
            return base_pt
        p = resolve_endpoint(nm, parts)
        if p is not None and p.placed_xyz_mm is not None:
            return (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                    p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2])
        return None

    routed = 0
    unresolved = []
    for i, e in enumerate(topology):
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "electrical_bus")
        a = _resolve(frm)
        b = _resolve(to)
        if a is None or b is None:
            miss = [n for n, pt in ((frm, a), (to, b)) if pt is None]
            unresolved.append((frm, to, mech, miss))
            continue
        # route down-tower: a simple 3-point L (source → above-base → base point)
        waypoints = [a, (b[0], b[1], min(a[2], nacelle_pt[2])), b]
        nm = f"u_tm_route_{i}_{mech}"
        try:
            # SIZE the down-tower run at its real diameter from the edge rating.
            dia_mm = _sized_dia_mm(nm, mech, waypoints, e)
            if mech in ("electrical_bus", "data_link", "control_signal", "signal"):
                _draw_cable_tray(nm, waypoints, MAT, MO, dia_mm=dia_mm)
            else:
                colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
                mkey = f"u_pipe_{mech}"
                if mkey not in MAT:
                    MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35, roughness=0.35)
                fl.prim_pipe_run(nm, waypoints, dia_mm, material=MAT[mkey],
                                 flanges=True, module="mass_fluid_transport_process",
                                 module_objects=MO)
            _route_log_add(nm, mech, waypoints, a, b)   # audit coverage (down-tower)
            routed += 1
        except Exception as ex:  # noqa: BLE001 — never let one bad route kill the run
            unresolved.append((frm, to, mech, [f"route_error:{ex}"]))
            print(f"[univ][tower] edge {i} route FAILED: {ex}")
    return routed, unresolved


# ═══════════════════════════════════════════════════════════════════════════
# AERO-BODY STRATEGY — aircraft + spacecraft (flight vehicles, 2026-06-10)
# ───────────────────────────────────────────────────────────────────────────
# The LAST of the four geometry families. Unlike process_plant / rack_farm /
# panel_array — all of which sit equipment INSIDE a skid / container / grow room —
# a flight vehicle flies in FREE SPACE. So aero_body builds NO skid frame and NO
# enclosure: it renders the VEHICLE itself — a central fuselage/bus carrying its
# wings / solar arrays / propellers / antennas / booms — on an OPTIONAL faint
# ground plane (aircraft only; a satellite floats). The placer dispatches on the
# detected SUBTYPE:
#   • aircraft  → a long slender fuselage along +X, a high-aspect-ratio wing
#     spanning ±Y mounted high, a tail/empennage aft, propulsion pods + propellers
#     spread along the wing, thin solar cells tiled on the wing upper surface, a
#     gondola/payload pod under the fuselage, landing skids; remaining classified
#     parts (avionics / battery / payload / sensors / antennas) placed in/under/on
#     the fuselage by their module + name role.
#   • spacecraft → a central BUS box, two deployed solar-array wings on booms ±Y,
#     antennas (dish + horns) on the nadir (−Z) face, reaction wheels / thrusters
#     (copper cylinders) on the bus, payload optics on a face, deployable booms;
#     remaining parts placed on/around the bus.
# All geometry is millimetre-based (× fl.MM) like every other strategy. Objects are
# named u_aero_* so apply_inspection_materials recolours them by role in INSPECT.
# Same return tuple as the other strategies: (bbox, region_centres, frame_top_mm,
# routed, unresolved). Deterministic + universal — sizes come from the contract
# quantities (wingspan_m / chord_m / wing_area_m2 for the aircraft; mass_kg /
# solar_array_area_m2 / radiator_area_m2 for the spacecraft) with sane fallbacks.
# ═══════════════════════════════════════════════════════════════════════════

# Module-level handoff of the contract quantities + subtype to place_aero_body
# (set in main() right before dispatch), mirroring _RACKFARM_QUANTITIES so the
# shared placer signature stays unchanged.
_AERO_QUANTITIES = None

# Module-level HERO-FRAMING hint, set by a placer that wants the INSPECT hero
# camera tuned away from the default deck-equipment framing. None → render_inspection
# uses its standard (industrial-deck) hero. A placer sets a dict:
#   {"zoom": <float>,        # ortho_scale multiplier vs the bbox-fit iso (smaller = tighter)
#    "center_z_frac": <0-1>, # hero target height as a fraction of the z-extent (0.5 = mid)
#    "exclude_prefixes": (…)}# object-name prefixes to EXCLUDE from the bbox used for framing
# Read once in render_inspection. The aero family sets this so a small satellite /
# a thin 35 m aircraft frames TIGHT and centred (not lost in a bbox-fit void).
_HERO_HINT = None

# ── Aircraft (HAPS) geometry defaults (mm) — overridden by contract quantities ──
AC_FUSELAGE_DIA_MM   = 900.0    # fuselage pod diameter — slender but LEGIBLE against
                                # a 35 m wing (0.46-0.62 m reads as an invisible thread)
AC_WING_THICK_MM     = 150.0    # wing skin thickness (a readable high-aspect aerofoil)
AC_WING_SPAN_FALLBACK_MM = 25000.0   # wingspan when the contract is silent
AC_WING_CHORD_FALLBACK_MM = 1600.0   # wing chord when the contract is silent
AC_FUS_LEN_FRAC      = 0.34     # fuselage length ≈ this × wingspan (slender body)
AC_SOLAR_THICK_MM    = 18.0     # PV laminate thickness on the wing upper surface
AC_PROP_DIA_MM       = 3200.0   # propeller disc diameter (large, reads on a 35 m span)
AC_POD_DIA_MM        = 520.0    # motor-pod / nacelle diameter (substantial, legible)
AC_N_PROPS_DEFAULT   = 6        # propeller count when no motor count is given

# ── Spacecraft (satellite) geometry defaults (mm) ──
SC_BUS_FALLBACK_MM   = 900.0    # bus cube side when no size derivable
SC_PANEL_THICK_MM    = 28.0     # solar-array panel thickness
SC_ARRAY_PANELS      = 3        # panels per array wing (per side)
SC_BOOM_DIA_MM       = 70.0     # solar-array deploy boom diameter
SC_DISH_DIA_MM       = 520.0    # high-gain dish diameter


def _aero_mat(MAT, key, rgb, metallic=0.30, roughness=0.45, emission=0.0):
    """Cache + return a shared aero material so repeated calls don't churn the
    material list. Keyed u_aero_<key>."""
    mk = f"u_aero_{key}"
    if mk not in MAT:
        MAT[mk] = fl.make_mat(f"m_aero_{key}", rgb, metallic=metallic,
                              roughness=roughness, emission_strength=emission)
    return MAT[mk]


def _aero_palette(MAT):
    """The shared aero-body material set (PRODUCTION render colours; the INSPECT
    pass recolours u_aero_* by role separately). Light-grey skins, grey structure,
    dark-blue solar, dark props, copper thrusters."""
    return {
        "skin":     _aero_mat(MAT, "skin",     (0.80, 0.82, 0.86), 0.25, 0.42),
        "structure":_aero_mat(MAT, "structure",(0.55, 0.57, 0.61), 0.45, 0.40),
        "solar":    _aero_mat(MAT, "solar",    (0.03, 0.06, 0.42), 0.20, 0.30),
        "cellgrid": _aero_mat(MAT, "cellgrid", (0.42, 0.52, 0.84), 0.25, 0.40),
        "prop":     _aero_mat(MAT, "prop",     (0.05, 0.06, 0.09), 0.10, 0.42),
        "antenna":  _aero_mat(MAT, "antenna",  (0.82, 0.84, 0.88), 0.30, 0.40),
        "thruster": _aero_mat(MAT, "thruster", (0.72, 0.45, 0.20), 0.65, 0.35),
        "payload":  _aero_mat(MAT, "payload",  (0.12, 0.14, 0.18), 0.30, 0.30),
        "avionics": _aero_mat(MAT, "avionics", (0.22, 0.42, 0.78), 0.25, 0.40),
        "radiator": _aero_mat(MAT, "radiator", (0.88, 0.89, 0.92), 0.20, 0.40),
        "mli":      _aero_mat(MAT, "mli",      (0.86, 0.74, 0.30), 0.30, 0.45),
        "skid":     _aero_mat(MAT, "skid",     (0.60, 0.62, 0.66), 0.55, 0.40),
    }


# Roles the remaining classified parts are binned into, by NAME, so a part lands
# in a SENSIBLE place on the vehicle rather than scattered on a deck.
_AERO_SENSOR_RE  = re.compile(r"sensor|imu|ins|pitot|air.?data|gnss|gps|star.?track|"
                              r"sun.?sensor|camera|eo/?ir|imager|optical|lens|"
                              r"\bvane\b|magnetometer", re.IGNORECASE)
_AERO_ANTENNA_RE = re.compile(r"antenna|dish|transceiver|transmitter|helical|patch|"
                              r"isoflux|satcom|s-?band|x-?band|comm|telemetry|"
                              r"data.?link|rf\b", re.IGNORECASE)
_AERO_AVIONICS_RE = re.compile(r"comput|avionic|controller|flight.?control|autopilot|"
                               r"\bobc\b|\bfpga\b|processor|board|\bplc\b|"
                               r"data.?handl|\bbus\b.?regulat|pcdu|\bcdh\b|"
                               r"\becu\b|software|\bplc\b|encrypt|memory", re.IGNORECASE)
_AERO_BATTERY_RE = re.compile(r"battery|\bcell\b|\bbms\b|\bpack\b|power.?module|"
                              r"\bpcdu\b|\beps\b|\bpsu\b|regulat|converter|mppt|"
                              r"isolation.?diode|isolation.?relay|contactor", re.IGNORECASE)
_AERO_PAYLOAD_RE = re.compile(r"payload|instrument|imager|camera|sensor.?bench|"
                              r"optical.?bench|\bmx-?\d", re.IGNORECASE)
_AERO_THRUSTER_RE = re.compile(r"thruster|reaction.?wheel|magnetorquer|propellant|"
                               r"\bppu\b|xenon|hydrazine|latch.?valve|flow.?control",
                               re.IGNORECASE)


def _qmm(quantities, key, default_mm):
    """A length quantity in metres → mm, with a mm fallback. Reads the {value:…}
    shape (or a bare number). Universal helper for the aero placers."""
    v = qval(quantities, key)
    return (v * 1000.0) if (v is not None and v > 0) else default_mm


# ───────────────────────────────────────────────────────────────────────────
# AIRCRAFT (HAPS) — fuselage along +X, wing spanning ±Y, mounted high
# ───────────────────────────────────────────────────────────────────────────

def _aero_build_fuselage(cx, cz, length_mm, dia_mm, P, MO, mod="structure_containment"):
    """A long slender fuselage along +X: a cylindrical centre body + a tapered
    nose (−X) + a tapered tail cone (+X). Returns the fuselage extents + an anchor
    dict for placing avionics/battery inside + the tail-attach point. All mm."""
    if mod not in MO:
        MO[mod] = []
    R = dia_mm / 2.0
    ln = length_mm * 0.20      # nose
    lt = length_mm * 0.24      # tail cone
    lb = length_mm - ln - lt   # straight body
    x0 = cx - length_mm / 2.0
    body_xc = x0 + ln + lb / 2.0
    # straight body (axis X)
    fl.add_cyl("u_aero_fuselage_body", (body_xc * fl.MM, 0.0, cz * fl.MM),
               R * fl.MM, lb * fl.MM, P["skin"], module=mod, module_objects=MO,
               rotation=(0, math.radians(90), 0))
    # nose cone (−X) + tail cone (+X)
    fl.add_frustum("u_aero_fuselage_nose",
                   ((x0 + ln / 2.0) * fl.MM, 0.0, cz * fl.MM),
                   R * 0.30 * fl.MM, R * fl.MM, ln * fl.MM, P["skin"],
                   module=mod, module_objects=MO, rotation=(0, math.radians(-90), 0))
    fl.add_frustum("u_aero_fuselage_tail",
                   ((x0 + ln + lb + lt / 2.0) * fl.MM, 0.0, cz * fl.MM),
                   R * fl.MM, R * 0.18 * fl.MM, lt * fl.MM, P["skin"],
                   module=mod, module_objects=MO, rotation=(0, math.radians(-90), 0))
    return {
        "x0": x0, "x1": x0 + length_mm, "R": R, "cz": cz,
        "nose": (x0 + ln * 0.4, 0.0, cz),
        "tail": (x0 + length_mm, 0.0, cz),
        "body_x0": x0 + ln, "body_x1": x0 + ln + lb,
        "belly": cz - R, "crown": cz + R,
    }


def _aero_build_wing(fus, span_mm, chord_mm, P, MO, mod="aerodynamic_wing"):
    """A high-aspect-ratio wing spanning ±Y, mounted HIGH on the fuselage crown so
    it visibly crosses the body as one continuous member. Skin box + two full-span
    spar cylinders + tip caps. Returns the wing plane (z, chord centre, span) for
    tiling solar cells + hanging propulsion pods. All mm."""
    if mod not in MO:
        MO[mod] = []
    # wing sits just above the fuselage crown (high-wing), at the fuselage mid-X
    wx = (fus["body_x0"] + fus["body_x1"]) / 2.0
    wz = fus["crown"] + AC_WING_THICK_MM * 0.4
    skin = fl.add_box("u_aero_wing_skin", (wx * fl.MM, 0.0, wz * fl.MM),
                      (chord_mm * fl.MM, span_mm * fl.MM, AC_WING_THICK_MM * fl.MM),
                      P["skin"], module=mod, module_objects=MO)  # noqa: F841
    # two spanwise spars (front + rear) running the full span
    for j, cxo in enumerate((-chord_mm * 0.26, chord_mm * 0.24)):
        fl.add_cyl(f"u_aero_wing_spar{j}",
                   ((wx + cxo) * fl.MM, 0.0, (wz - 2.0) * fl.MM),
                   AC_WING_THICK_MM * 0.34 * fl.MM, span_mm * 0.99 * fl.MM,
                   P["structure"], module=mod, module_objects=MO,
                   rotation=(math.radians(90), 0, 0))
    # tip caps (winglet-ish end plates) so the span reads as a finished wing
    for sy, side in ((-span_mm / 2.0, "L"), (span_mm / 2.0, "R")):
        fl.add_box(f"u_aero_wing_tip_{side}",
                   (wx * fl.MM, sy * fl.MM, (wz + AC_WING_THICK_MM * 0.6) * fl.MM),
                   (chord_mm * 0.78 * fl.MM, AC_WING_THICK_MM * fl.MM,
                    AC_WING_THICK_MM * 2.4 * fl.MM),
                   P["structure"], module=mod, module_objects=MO)
    return {"x": wx, "z": wz, "chord": chord_mm, "span": span_mm,
            "le_x": wx - chord_mm / 2.0, "te_x": wx + chord_mm / 2.0,
            "top_z": wz + AC_WING_THICK_MM / 2.0}


def _aero_build_solar_on_wing(wing, n_cells_chord, P, MO, mod="solar_array_skin"):
    """Tile dark-blue PV CELLS across the wing UPPER surface (the full-span HAPS
    solar skin) as a visible GRID — discrete cells with thin light-blue grid lines
    between them, so the wing reads as a tiled cell array rather than one flat dark
    slab. AGGREGATED (readable cells, not the thousands of laminate cells). The grid
    spacing is sized so individual cells read at the vehicle scale. All mm."""
    if mod not in MO:
        MO[mod] = []
    span = wing["span"]
    chord = wing["chord"]
    z = wing["top_z"] + AC_SOLAR_THICK_MM / 2.0
    n_span = max(16, int(span / 900.0))          # cells along the span (finer)
    cell_w = span / n_span                        # along Y (pitch)
    rows = max(3, int(n_cells_chord) + 1)         # ≥3 cell rows across the chord
    band = (chord * 0.86) / rows                  # along X (chord pitch)
    x0 = wing["x"] - chord * 0.43
    for r in range(rows):
        xc = x0 + band * (r + 0.5)
        for s in range(n_span):
            yc = -span / 2.0 + cell_w * (s + 0.5)
            # discrete cell with a small gap (the gap shows the grid_mat beneath)
            fl.add_box(f"u_aero_solar_r{r}_s{s}",
                       (xc * fl.MM, yc * fl.MM, z * fl.MM),
                       (band * 0.84 * fl.MM, cell_w * 0.84 * fl.MM,
                        AC_SOLAR_THICK_MM * fl.MM),
                       P["solar"], module=mod, module_objects=MO)
    # light-blue grid ribs UNDER the cells (the busbar/interconnect grid) — a few
    # spanwise lines + chordwise lines so the tiling reads even where cells abut.
    grid_mat = P["cellgrid"]
    gz = z - AC_SOLAR_THICK_MM * 0.25
    for r in range(rows + 1):
        gx = x0 + band * r
        fl.add_box(f"u_aero_solarcell_x{r}",
                   (gx * fl.MM, wing["x"] * 0.0 * fl.MM, gz * fl.MM),
                   (band * 0.10 * fl.MM, span * 0.98 * fl.MM,
                    AC_SOLAR_THICK_MM * 0.6 * fl.MM), grid_mat,
                   module=mod, module_objects=MO)
    n_grid_span = min(n_span, 24)
    for g in range(n_grid_span + 1):
        gy = -span / 2.0 + span * g / n_grid_span
        fl.add_box(f"u_aero_solarcell_y{g}",
                   ((x0 + band * rows / 2.0) * fl.MM, gy * fl.MM, gz * fl.MM),
                   (band * rows * 0.98 * fl.MM, cell_w * 0.10 * fl.MM,
                    AC_SOLAR_THICK_MM * 0.6 * fl.MM), grid_mat,
                   module=mod, module_objects=MO)


def _aero_build_props(wing, fus, n_props, P, MO, mod="propulsion_motor_prop"):
    """Distributed propulsion: N motor PODS hung on the wing leading edge, each
    with a PROPELLER disc forward of it, spread symmetrically across the span (the
    HAPS distributed-electric layout). Returns the list of pod anchors. All mm."""
    if mod not in MO:
        MO[mod] = []
    span = wing["span"]
    n = max(2, int(n_props))
    # symmetric span stations, skipping the very centre (fuselage) + the tips
    usable = span * 0.86
    pod_dia = AC_POD_DIA_MM
    # props sit FORWARD of the leading edge + slightly BELOW wing level so they are
    # NOT occluded by the wing skin in the iso/hero views (a tractor layout).
    prop_z = wing["z"] - pod_dia * 0.5
    le_x = wing["le_x"]
    R = AC_PROP_DIA_MM / 2.0
    anchors = []
    for i in range(n):
        frac = (i + 0.5) / n
        yc = -usable / 2.0 + usable * frac
        # motor NACELLE (capsule along X) projecting FORWARD from under the leading
        # edge, with a tapered rear fairing so it reads as a real nacelle.
        podx = le_x - pod_dia * 1.0
        nac_len = pod_dia * 2.6
        fl.add_cyl(f"u_aero_pod{i}", (podx * fl.MM, yc * fl.MM, prop_z * fl.MM),
                   pod_dia / 2.0 * fl.MM, nac_len * fl.MM, P["structure"],
                   module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))
        # tapered rear fairing of the nacelle (points aft, +X)
        fl.add_frustum(f"u_aero_podtail{i}",
                       ((podx + nac_len * 0.5 + pod_dia * 0.5) * fl.MM, yc * fl.MM,
                        prop_z * fl.MM),
                       pod_dia / 2.0 * fl.MM, pod_dia * 0.12 * fl.MM, pod_dia * fl.MM,
                       P["structure"], module=mod, module_objects=MO,
                       rotation=(0, math.radians(90), 0))
        # short pylon from the nacelle up to the wing leading edge (visible mount)
        fl.add_box(f"u_aero_podpylon{i}",
                   ((le_x) * fl.MM, yc * fl.MM,
                    ((prop_z + wing["z"]) / 2.0) * fl.MM),
                   (pod_dia * 0.5 * fl.MM, pod_dia * 0.45 * fl.MM,
                    abs(wing["z"] - prop_z) * fl.MM),
                   P["structure"], module=mod, module_objects=MO)
        # PROPELLER, well forward of the nacelle nose so the full disc reads clear of
        # the wing: a SPINNER cone (−X) + a hub + 3 chunky blades in the Y–Z plane
        # (axis = X, a tractor prop).
        hub_x = podx - nac_len * 0.55
        fl.add_cyl(f"u_aero_prophub{i}", (hub_x * fl.MM, yc * fl.MM, prop_z * fl.MM),
                   pod_dia * 0.30 * fl.MM, pod_dia * 0.5 * fl.MM, P["prop"],
                   module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))
        # spinner cone pointing forward (−X)
        fl.add_frustum(f"u_aero_propspinner{i}",
                       ((hub_x - pod_dia * 0.45) * fl.MM, yc * fl.MM, prop_z * fl.MM),
                       pod_dia * 0.30 * fl.MM, pod_dia * 0.02 * fl.MM, pod_dia * 0.6 * fl.MM,
                       P["prop"], module=mod, module_objects=MO,
                       rotation=(0, math.radians(-90), 0))
        for b in range(3):
            theta = 2 * math.pi * b / 3.0
            rmid = R * 0.54
            yy = yc + rmid * math.cos(theta)
            zz = prop_z + rmid * math.sin(theta)
            # chunky tapered blade: wider at root, oriented radially, slight pitch
            fl.add_box(f"u_aero_propblade{i}_{b}",
                       (hub_x * fl.MM, yy * fl.MM, zz * fl.MM),
                       (R * 0.10 * fl.MM, R * 0.16 * fl.MM, R * 0.98 * fl.MM),
                       P["prop"], module=mod, module_objects=MO,
                       rotation=(math.radians(18), -theta, 0))
        anchors.append((hub_x, yc, prop_z))
    return anchors


def _aero_build_tail(fus, P, MO, mod="aerodynamic_wing"):
    """Twin tail booms extending aft (+X) from the wing region to a V-tail at the
    end (the HAPS empennage). All mm."""
    if mod not in MO:
        MO[mod] = []
    boom_len = (fus["x1"] - fus["body_x1"]) + (fus["body_x1"] - fus["body_x0"]) * 0.45
    boom_x0 = fus["body_x1"] - (fus["body_x1"] - fus["body_x0"]) * 0.10
    boom_dia = AC_FUSELAGE_DIA_MM * 0.16
    sep = AC_FUSELAGE_DIA_MM * 1.6     # boom separation in Y
    end_x = boom_x0 + boom_len
    for sy, side in ((-sep / 2.0, "L"), (sep / 2.0, "R")):
        fl.add_cyl(f"u_aero_tailboom_{side}",
                   ((boom_x0 + boom_len / 2.0) * fl.MM, sy * fl.MM, fus["cz"] * fl.MM),
                   boom_dia / 2.0 * fl.MM, boom_len * fl.MM, P["structure"],
                   module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))
        # canted V-tail fin at the boom end
        fin_h = AC_FUSELAGE_DIA_MM * 1.7
        fl.add_box(f"u_aero_vtail_{side}",
                   (end_x * fl.MM, sy * fl.MM, (fus["cz"] + fin_h * 0.45) * fl.MM),
                   (AC_FUSELAGE_DIA_MM * 1.5 * fl.MM, AC_WING_THICK_MM * 0.8 * fl.MM,
                    fin_h * fl.MM), P["skin"], module=mod, module_objects=MO,
                   rotation=(0, math.radians(0), math.radians(24 if sy < 0 else -24)))
    # horizontal stabiliser tying the two booms at the tail
    fl.add_box("u_aero_hstab",
               (end_x * fl.MM, 0.0, fus["cz"] * fl.MM),
               (AC_FUSELAGE_DIA_MM * 1.4 * fl.MM, (sep + AC_FUSELAGE_DIA_MM) * fl.MM,
                AC_WING_THICK_MM * 0.7 * fl.MM), P["skin"],
               module=mod, module_objects=MO)
    return {"end": (end_x, 0.0, fus["cz"])}


def _aero_build_gondola(fus, P, MO, mod="payload_thermal_imager"):
    """A payload gondola/pod slung UNDER the fuselage belly (where the EO/IR
    imager + science payload ride), + a pair of belly landing skids. Returns the
    gondola anchor so payload parts cluster there. All mm."""
    if mod not in MO:
        MO[mod] = []
    R = fus["R"]
    gx = (fus["body_x0"] + fus["body_x1"]) / 2.0 + R * 1.2
    gz = fus["belly"] - R * 0.9
    fl.add_cyl("u_aero_gondola", (gx * fl.MM, 0.0, gz * fl.MM),
               R * 0.7 * fl.MM, R * 2.4 * fl.MM, P["payload"],
               module=mod, module_objects=MO, rotation=(0, math.radians(90), 0))
    # a gimbal ball at the gondola nose (the EO/IR turret)
    fl.add_sphere("u_aero_gondola_turret",
                  ((gx - R * 1.2) * fl.MM, 0.0, (gz - R * 0.2) * fl.MM),
                  R * 0.5 * fl.MM, P["payload"], module=mod, module_objects=MO)
    # belly landing skids (two longitudinal skis on short struts)
    smod = "structure_containment"
    if smod not in MO:
        MO[smod] = []
    for sy, side in ((-R * 0.8, "L"), (R * 0.8, "R")):
        skid_z = fus["belly"] - R * 1.7
        fl.add_cyl(f"u_aero_skid_{side}",
                   ((fus["body_x0"] + fus["body_x1"]) / 2.0 * fl.MM, sy * fl.MM,
                    skid_z * fl.MM),
                   R * 0.10 * fl.MM, (fus["body_x1"] - fus["body_x0"]) * 0.7 * fl.MM,
                   P["skid"], module=smod, module_objects=MO,
                   rotation=(0, math.radians(90), 0))
        for sxo in (-0.32, 0.32):
            sx = (fus["body_x0"] + fus["body_x1"]) / 2.0 + sxo * (fus["body_x1"] - fus["body_x0"])
            fl.add_cyl(f"u_aero_skidstrut_{side}_{sxo:+.2f}",
                       (sx * fl.MM, sy * fl.MM, (fus["belly"] - R * 0.85) * fl.MM),
                       R * 0.05 * fl.MM, R * 1.7 * fl.MM, P["skid"],
                       module=smod, module_objects=MO)
    return {"anchor": (gx, 0.0, gz)}


def _aero_place_aircraft(parts, quantities, P, MO):
    """Build the HAPS aircraft + bin the remaining classified parts onto it. Returns
    (bbox_mm, region_centres, vehicle_anchors). Free-space — no skid frame."""
    span = _qmm(quantities, "wingspan_m", AC_WING_SPAN_FALLBACK_MM)
    chord = _qmm(quantities, "chord_m", AC_WING_CHORD_FALLBACK_MM)
    fus_len = max(span * AC_FUS_LEN_FRAC, chord * 3.0)
    cz = max(3000.0, span * 0.12)   # fly the vehicle above z=0 (free space)
    # 1. fuselage
    fus = _aero_build_fuselage(0.0, cz, fus_len, AC_FUSELAGE_DIA_MM, P, MO)
    # 2. high-aspect wing
    wing = _aero_build_wing(fus, span, chord, P, MO)
    # 3. tail / empennage
    tail = _aero_build_tail(fus, P, MO)
    # 4. distributed propulsion pods + propellers. Count from the propeller words
    #    (summing their quantity modifiers) — a HAPS "CF folding propeller ×6"
    #    gives 6; clamp to a readable even 4-8. Default when the BoM is silent.
    prop_qty = sum(p.qty for p in parts
                   if re.search(r"propeller|brushless.?(drive.?)?motor|\besc\b",
                                str(p.name), re.IGNORECASE))
    if prop_qty >= 2:
        n_props = max(4, min(8, prop_qty if prop_qty % 2 == 0 else prop_qty + 1))
    else:
        n_props = AC_N_PROPS_DEFAULT
    prop_anchors = _aero_build_props(wing, fus, n_props, P, MO)
    # 5. PV solar skin on the wing
    _aero_build_solar_on_wing(wing, n_cells_chord=2, P=P, MO=MO)
    # 6. payload gondola + landing skids
    gond = _aero_build_gondola(fus, P, MO)

    # ── bin the remaining classified parts onto the airframe by role ──
    anchors = {"fuselage": fus, "wing": wing, "tail": tail, "gondola": gond,
               "prop_anchors": prop_anchors}
    _aero_bin_parts_aircraft(parts, fus, wing, gond, P, MO)

    region_centres = {
        "wing": (wing["x"], 0.0), "fuselage": ((fus["x0"] + fus["x1"]) / 2.0, 0.0),
        "tail": (tail["end"][0], 0.0), "gondola": (gond["anchor"][0], 0.0),
    }
    # bbox from the actual built extents (span dominates Y; fuselage+tail dominate X)
    bbox = {"x0": fus["x0"] - chord, "x1": tail["end"][0] + chord,
            "y0": -span / 2.0 - chord, "y1": span / 2.0 + chord}
    return bbox, region_centres, anchors, cz


def _aero_bin_parts_aircraft(parts, fus, wing, gond, P, MO):
    """Place each remaining classified part (the avionics / sensors / antennas /
    battery / payload BoM that the airframe builders did not already represent) at
    a SENSIBLE airframe station by its NAME role — small boxes/cylinders inside or
    on the fuselage, under the nose, on the crown, or in the gondola — rather than
    scattering them on a deck. Deterministic + universal (role regexes only)."""
    R = fus["R"]
    bx0, bx1 = fus["body_x0"], fus["body_x1"]
    cz = fus["cz"]
    # running cursors so multiple parts of a role stack neatly along the fuselage
    cur = {"avionics": bx0 + (bx1 - bx0) * 0.20, "battery": bx0 + (bx1 - bx0) * 0.40,
           "sensor": fus["nose"][0], "antenna": bx0 + (bx1 - bx0) * 0.30,
           "payload": gond["anchor"][0], "other": bx0 + (bx1 - bx0) * 0.55}
    step = max(120.0, (bx1 - bx0) * 0.06)
    for p in parts:
        nm = str(p.name)
        # skip the structural/aero parts the builders already drew as the airframe
        if re.search(r"\bwing\b|fuselage|\bspar\b|\brib\b|propeller|\bv-?tail\b|"
                     r"tail.?boom|\bpylon\b|monocoque|\bskin\b|elevon|landing.?skid|"
                     r"motor|nacelle|solar|pv\b|laminate|cart|trolley|console|"
                     r"\bgcs\b|ground.?(station|dish)|basestation",
                     nm, re.IGNORECASE):
            continue
        pref = _aero_part_prefix(p.name)
        if _AERO_SENSOR_RE.search(nm):
            role, x, y, z = "sensor", cur["sensor"], 0.0, fus["belly"] + R * 0.2
            cur["sensor"] -= step * 0.5
        elif _AERO_ANTENNA_RE.search(nm):
            role, x, y, z = "antenna", cur["antenna"], 0.0, fus["crown"] + R * 0.5
            cur["antenna"] += step
        elif _AERO_BATTERY_RE.search(nm):
            role, x, y, z = "battery", cur["battery"], 0.0, cz
            cur["battery"] += step
        elif _AERO_PAYLOAD_RE.search(nm):
            role, x, y, z = "payload", cur["payload"], 0.0, gond["anchor"][2]
            cur["payload"] += step * 0.6
        elif _AERO_AVIONICS_RE.search(nm):
            role, x, y, z = "avionics", cur["avionics"], 0.0, cz + R * 0.2
            cur["avionics"] += step
        else:
            role, x, y, z = "other", cur["other"], R * 0.4, cz
            cur["other"] += step
        _aero_emit_part_glyph(pref, role, x, y, z, R, P, MO, p)


def _aero_part_prefix(name):
    """Object-name prefix for a binned aero part — distinct u_aero_p_ namespace so
    the INSPECT recolour maps it by ROLE, and it never collides with the airframe
    builders' fixed names."""
    return "u_aero_p_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:34]


def _aero_emit_part_glyph(pref, role, x, y, z, R, P, MO, part):
    """Emit ONE small glyph for a binned part: an antenna as a dish+mast, a sensor
    as a small turret, a thruster/reaction-wheel as a copper cylinder, everything
    else as a compact avionics box. Tagged to the part's own module. All mm."""
    mod = part.module_id
    if mod not in MO:
        MO[mod] = []
    if role == "antenna":
        # a small dish on a short mast (HGA / patch antenna)
        fl.add_cyl(pref + "_mast", (x * fl.MM, y * fl.MM, z * fl.MM),
                   R * 0.04 * fl.MM, R * 0.7 * fl.MM, P["antenna"],
                   module=mod, module_objects=MO)
        dish = fl.add_sphere(pref + "_dish", (x * fl.MM, y * fl.MM, (z + R * 0.45) * fl.MM),
                             R * 0.34 * fl.MM, P["antenna"], module=mod, module_objects=MO)
        dish.scale = (1.0, 1.0, 0.32)
    elif role == "sensor":
        fl.add_cyl(pref + "_turret", (x * fl.MM, y * fl.MM, z * fl.MM),
                   R * 0.22 * fl.MM, R * 0.30 * fl.MM, P["payload"],
                   module=mod, module_objects=MO, rotation=(math.radians(90), 0, 0))
        fl.add_sphere(pref + "_lens", (x * fl.MM, y * fl.MM, (z - R * 0.2) * fl.MM),
                      R * 0.14 * fl.MM, P["payload"], module=mod, module_objects=MO)
    elif role == "thruster":
        fl.add_cyl(pref + "_body", (x * fl.MM, y * fl.MM, z * fl.MM),
                   R * 0.16 * fl.MM, R * 0.4 * fl.MM, P["thruster"],
                   module=mod, module_objects=MO)
    elif role == "payload":
        fl.add_box(pref + "_box", (x * fl.MM, y * fl.MM, z * fl.MM),
                   (R * 0.7 * fl.MM, R * 0.7 * fl.MM, R * 0.6 * fl.MM), P["payload"],
                   module=mod, module_objects=MO)
    elif role == "battery":
        fl.add_box(pref + "_tray", (x * fl.MM, y * fl.MM, z * fl.MM),
                   (R * 0.6 * fl.MM, R * 1.2 * fl.MM, R * 0.5 * fl.MM), P["avionics"],
                   module=mod, module_objects=MO)
    else:  # avionics / other → a compact box
        fl.add_box(pref + "_box", (x * fl.MM, y * fl.MM, z * fl.MM),
                   (R * 0.55 * fl.MM, R * 0.7 * fl.MM, R * 0.45 * fl.MM), P["avionics"],
                   module=mod, module_objects=MO)


# ───────────────────────────────────────────────────────────────────────────
# SPACECRAFT (satellite) — central bus, deployed arrays ±Y, antennas on nadir
# ───────────────────────────────────────────────────────────────────────────

def _aero_build_bus(side_mm, P, MO, mod="structure_containment"):
    """The central satellite BUS: a box body + a thrust-tube cylinder through its
    centre (the primary load path) + an ESPA/separation ring at the −Z (launch)
    face. Returns the bus extents + face anchors. cz floats the bus above z=0 so
    the arrays/antennas have room. All mm."""
    if mod not in MO:
        MO[mod] = []
    cz = side_mm * 1.4          # float the bus above the ground plane (free space)
    half = side_mm / 2.0
    fl.add_box("u_aero_bus_body", (0.0, 0.0, cz * fl.MM),
               (side_mm * fl.MM, side_mm * fl.MM, side_mm * fl.MM), P["mli"],
               module=mod, module_objects=MO)
    # thrust tube through the bus centre (axis Z)
    fl.add_cyl("u_aero_bus_thrusttube", (0.0, 0.0, cz * fl.MM),
               side_mm * 0.22 * fl.MM, side_mm * 1.02 * fl.MM, P["structure"],
               module=mod, module_objects=MO)
    # ESPA / separation ring at the −Z launch face
    fl.add_cyl("u_aero_bus_sepring", (0.0, 0.0, (cz - half - side_mm * 0.08) * fl.MM),
               side_mm * 0.30 * fl.MM, side_mm * 0.14 * fl.MM, P["structure"],
               module=mod, module_objects=MO)
    return {"cz": cz, "half": half, "side": side_mm,
            "nadir": cz - half, "zenith": cz + half,
            "plusY": half, "minusY": -half, "plusX": half, "minusX": -half}


def _aero_build_solar_wings(bus, area_m2, P, MO, mod="energy_conversion_transduction"):
    """Two DEPLOYED solar-array wings on yokes either side (±Y) of the bus — flat,
    SUN-FACING multi-panel arrays (the satellite's defining silhouette). Both wings
    are built by the SAME loop with a mirrored sign, so they are identical mirror-
    images. CRITICAL (2026-06-11): the panels lie FLAT — their broad face is the
    X–Y plane (normal +Z), the array steps OUTBOARD along Y, and each panel is a
    thin laminate in Z. A previous build oriented the panels normal-to-X (thin in
    X); a 3/4 iso camera then saw one wing face-on and the other raking-edge-on, so
    the +Y wing collapsed into a solid "beam" while the −Y wing read as panels.
    Flat panels read identically from ANY azimuth. Panel size from the array area
    (split across the two wings × N panels). Thin LIGHT-BLUE cell-grid lines are
    scribed on each panel so it reads as a cell array, not a slab. All mm."""
    if mod not in MO:
        MO[mod] = []
    side = bus["side"]
    # total array area (m²) → per-panel size. Fall back to a sensible wing. Use a
    # few panels per wing so the array reads as a finished multi-panel blanket.
    n_per_wing = SC_ARRAY_PANELS
    area_mm2 = (area_m2 * 1e6) if area_m2 and area_m2 > 0 else (side * side * 6.0)
    n_panels_total = 2 * n_per_wing
    panel_area = area_mm2 / n_panels_total
    # panel width (along the SPAN, Y) ~1.5× its depth (along the body axis, X), the
    # usual deployable-blanket aspect; both clamped so a tiny array still reads.
    panel_x = max(side * 0.85, math.sqrt(panel_area / 1.5))   # depth along X (body)
    panel_y = max(side * 0.55, panel_area / panel_x)          # width along Y (span)
    cz = bus["cz"]
    grid_mat = P["cellgrid"]
    tips = []
    for sgn, side_tag in ((-1, "L"), (1, "R")):
        # yoke / deploy boom out from the bus +Y/−Y face to the inboard panel edge
        boom_len = side * 0.55
        boom_y0 = sgn * bus["half"]
        fl.add_cyl(f"u_aero_arrayboom_{side_tag}",
                   (0.0, (boom_y0 + sgn * boom_len / 2.0) * fl.MM, cz * fl.MM),
                   SC_BOOM_DIA_MM / 2.0 * fl.MM, boom_len * fl.MM, P["structure"],
                   module="mass_fluid_transport_process", module_objects=MO,
                   rotation=(math.radians(90), 0, 0))
        y_inner = boom_y0 + sgn * boom_len
        gap = panel_y * 0.06
        for k in range(n_per_wing):
            # panel centre marches OUTBOARD along Y; panel lies FLAT (broad face up)
            yc = y_inner + sgn * (gap + panel_y * (k + 0.5) + gap * k)
            fl.add_box(f"u_aero_arraypanel_{side_tag}{k}",
                       (0.0, yc * fl.MM, cz * fl.MM),
                       (panel_x * fl.MM, panel_y * 0.94 * fl.MM,
                        SC_PANEL_THICK_MM * fl.MM), P["solar"],
                       module=mod, module_objects=MO)
            # cell-grid lines scribed on the +Z face (thin raised ribs): a few along
            # X (string boundaries) + a few along Y (cell rows) so the panel reads
            # as a tiled cell blanket rather than a flat slab.
            ztop = cz + SC_PANEL_THICK_MM * 0.5
            nx = 3
            for g in range(1, nx):
                gx = -panel_x * 0.5 + panel_x * g / nx
                fl.add_box(f"u_aero_arraycellx_{side_tag}{k}_{g}",
                           (gx * fl.MM, yc * fl.MM, ztop * fl.MM),
                           (panel_x * 0.012 * fl.MM, panel_y * 0.9 * fl.MM,
                            SC_PANEL_THICK_MM * 0.5 * fl.MM), grid_mat,
                           module=mod, module_objects=MO)
            ny = 4
            for g in range(1, ny):
                gy = yc - panel_y * 0.45 + (panel_y * 0.9) * g / ny
                fl.add_box(f"u_aero_arraycelly_{side_tag}{k}_{g}",
                           (0.0, gy * fl.MM, ztop * fl.MM),
                           (panel_x * 0.92 * fl.MM, panel_y * 0.012 * fl.MM,
                            SC_PANEL_THICK_MM * 0.5 * fl.MM), grid_mat,
                           module=mod, module_objects=MO)
        tips.append((0.0, y_inner + sgn * (panel_y * n_per_wing + gap * n_per_wing), cz))
    full_span = 2.0 * (boom_len + panel_y * n_per_wing + gap * n_per_wing) + side
    return {"tips": tips, "span": full_span, "panel_h": panel_x}


def _aero_build_antennas(bus, parts, P, MO, mod="control_compute_communication"):
    """Communications antennas on the NADIR (−Z, Earth-facing) face: a real
    parabolic high-gain DISH (a shallow curved reflector cap + a feed arm carrying
    a feed horn at the focus, on a short gimbal mast) + a couple of small CONE horn
    antennas. The dish points −Z (Earth). Counts taken from the antenna-named parts
    (so the BoM is reflected) with a sensible minimum. All mm."""
    if mod not in MO:
        MO[mod] = []
    side = bus["side"]
    nadir = bus["nadir"]
    dx = side * 0.20            # dish offset toward +X on the nadir deck
    R = SC_DISH_DIA_MM / 2.0    # dish rim radius
    mast_z0 = nadir
    mast_len = side * 0.22
    dish_z = nadir - mast_len   # reflector vertex plane
    # short gimbal mast from the nadir deck to the dish back
    fl.add_cyl("u_aero_hga_mast", (dx * fl.MM, 0.0, (mast_z0 - mast_len * 0.5) * fl.MM),
               side * 0.035 * fl.MM, mast_len * fl.MM, P["structure"],
               module=mod, module_objects=MO)
    # PARABOLIC REFLECTOR — a shallow frustum (wide rim toward −Z, narrow back)
    # gives a real dish silhouette (a flattened sphere read as a featureless blob).
    rim_depth = R * 0.42
    fl.add_frustum("u_aero_hga_dish",
                   (dx * fl.MM, 0.0, (dish_z - rim_depth * 0.5) * fl.MM),
                   R * 0.30 * fl.MM, R * fl.MM, rim_depth * fl.MM, P["antenna"],
                   module=mod, module_objects=MO, rotation=(0, 0, 0), vertices=40)
    # back disc closing the reflector (so it does not read hollow from behind)
    fl.add_cyl("u_aero_hga_dishback",
               (dx * fl.MM, 0.0, (dish_z - rim_depth * 0.04) * fl.MM),
               R * 0.30 * fl.MM, R * 0.06 * fl.MM, P["antenna"],
               module=mod, module_objects=MO)
    # tripod-style feed ARM from the rim out to the focus + a feed horn cone
    focus_z = dish_z - rim_depth - R * 0.55
    fl.add_cyl("u_aero_hga_feedarm",
               ((dx + R * 0.36) * fl.MM, 0.0, (dish_z - rim_depth * 0.5) * fl.MM),
               side * 0.02 * fl.MM, R * 1.5 * fl.MM, P["structure"],
               module=mod, module_objects=MO, rotation=(math.radians(22), 0, 0))
    fl.add_frustum("u_aero_hga_feed",
                   (dx * fl.MM, 0.0, focus_z * fl.MM),
                   side * 0.05 * fl.MM, side * 0.025 * fl.MM, side * 0.12 * fl.MM,
                   P["antenna"], module=mod, module_objects=MO)
    # two small CONE horn antennas across the nadir face
    for i, sx in enumerate((-side * 0.26, -side * 0.04)):
        fl.add_frustum(f"u_aero_horn{i}",
                       (sx * fl.MM, side * 0.24 * fl.MM, (nadir - side * 0.16) * fl.MM),
                       side * 0.035 * fl.MM, side * 0.085 * fl.MM, side * 0.22 * fl.MM,
                       P["antenna"], module=mod, module_objects=MO,
                       rotation=(0, 0, 0))
    return {"hga": (dx, 0.0, dish_z - rim_depth)}


def _aero_build_adcs_thrusters(bus, parts, P, MO):
    """Reaction wheels + thrusters as small COPPER cylinders on the bus, plus the
    propellant tank inside the bus footprint. Counts from the part names. All mm."""
    side = bus["side"]
    cz = bus["cz"]
    amod = "control_compute_communication"
    pmod = "mass_fluid_transport_process"
    for m in (amod, pmod):
        if m not in MO:
            MO[m] = []
    # 3-4 reaction wheels in a pyramid on the +Z deck (zenith)
    n_rw = sum(p.qty for p in parts if re.search(r"reaction.?wheel", str(p.name), re.IGNORECASE))
    n_rw = max(3, min(4, n_rw or 4))
    for i in range(n_rw):
        ang = 2 * math.pi * i / n_rw
        rx = side * 0.22 * math.cos(ang)
        ry = side * 0.22 * math.sin(ang)
        fl.add_cyl(f"u_aero_reactionwheel{i}",
                   (rx * fl.MM, ry * fl.MM, (bus["zenith"] - side * 0.12) * fl.MM),
                   side * 0.10 * fl.MM, side * 0.12 * fl.MM, P["thruster"],
                   module=amod, module_objects=MO)
    # magnetorquer rods along two bus edges
    for i, (ax, ay, rot) in enumerate(((1, 0, (0, math.radians(90), 0)),
                                       (0, 1, (math.radians(90), 0, 0)))):
        fl.add_cyl(f"u_aero_magnetorquer{i}",
                   (0.0, 0.0, (cz + side * 0.30) * fl.MM),
                   side * 0.03 * fl.MM, side * 0.7 * fl.MM, P["thruster"],
                   module=amod, module_objects=MO, rotation=rot)
    # thruster CLUSTER on the −Z (nadir) face — a tidy pod of copper nozzle cones
    # firing aft, grouped near the −X side so they read as one cluster and don't
    # collide with the dish (which sits toward +X). Each thruster = a short copper
    # body + a flared NOZZLE-BELL cone pointing −Z (the EP + monoprop thrusters).
    n_th = sum(p.qty for p in parts if re.search(r"thruster", str(p.name), re.IGNORECASE))
    n_th = max(2, min(4, n_th or 4))
    cluster_x = -side * 0.10           # cluster centred slightly −X (dish is +X)
    spread = side * 0.12               # tight cluster spacing
    for i in range(n_th):
        sx = cluster_x + (-1 if i % 2 == 0 else 1) * spread
        sy = (-1 if i < 2 else 1) * spread
        fl.add_cyl(f"u_aero_thruster{i}",
                   (sx * fl.MM, sy * fl.MM, (bus["nadir"] + side * 0.01) * fl.MM),
                   side * 0.045 * fl.MM, side * 0.14 * fl.MM, P["thruster"],
                   module=pmod, module_objects=MO)
        # flared nozzle bell on the −Z end (narrow throat → wide exit, points −Z)
        fl.add_frustum(f"u_aero_thrusterbell{i}",
                       (sx * fl.MM, sy * fl.MM, (bus["nadir"] - side * 0.10) * fl.MM),
                       side * 0.105 * fl.MM, side * 0.035 * fl.MM, side * 0.14 * fl.MM,
                       P["thruster"], module=pmod, module_objects=MO,
                       rotation=(0, 0, 0))
    # propellant tank (sphere) inside the bus
    fl.add_sphere("u_aero_propellant_tank", (0.0, 0.0, cz * fl.MM),
                  side * 0.26 * fl.MM, P["structure"], module=pmod, module_objects=MO)


def _aero_build_radiators(bus, parts, P, MO, mod="environmental_interface"):
    """Body-mounted radiator panels on the ±X faces + a deorbit drag-sail stub on
    the zenith deck (when present in the BoM). The thermal + EOL cues. All mm."""
    if mod not in MO:
        MO[mod] = []
    side = bus["side"]
    cz = bus["cz"]
    for sgn, tag in ((-1, "minusX"), (1, "plusX")):
        fl.add_box(f"u_aero_radiator_{tag}",
                   ((sgn * (bus["half"] + side * 0.03)) * fl.MM, 0.0, cz * fl.MM),
                   (side * 0.05 * fl.MM, side * 0.92 * fl.MM, side * 0.92 * fl.MM),
                   P["radiator"], module=mod, module_objects=MO)
    # deorbit drag sail — a thin square membrane CENTRED over the bus on a short
    # mast, with two diagonal deployment booms (the EOL cue). Centred (not hung off
    # a corner) + mast-mounted so it reads as a deployed sail, not a stray deck panel.
    if any(re.search(r"drag.?sail|deorbit", str(p.name), re.IGNORECASE) for p in parts):
        smod = "safety_protection"
        if smod not in MO:
            MO[smod] = []
        sail = side * 1.0
        sail_z = bus["zenith"] + side * 0.55
        # mast from the zenith deck up to the sail
        fl.add_cyl("u_aero_dragsail_mast", (0.0, 0.0, (bus["zenith"] + side * 0.27) * fl.MM),
                   side * 0.03 * fl.MM, side * 0.55 * fl.MM, P["structure"],
                   module=smod, module_objects=MO)
        # two diagonal deployment booms under the membrane (an X)
        for rotz in (math.radians(45), math.radians(-45)):
            fl.add_cyl("u_aero_dragsail_boom_%d" % int(math.degrees(rotz)),
                       (0.0, 0.0, (sail_z - 6.0) * fl.MM),
                       side * 0.02 * fl.MM, sail * 1.34 * fl.MM, P["structure"],
                       module=smod, module_objects=MO,
                       rotation=(math.radians(90), 0, rotz))
        # the membrane itself (thin, gold MLI), centred over the bus
        fl.add_box("u_aero_dragsail",
                   (0.0, 0.0, sail_z * fl.MM),
                   (sail * fl.MM, sail * fl.MM, 8.0 * fl.MM),
                   P["mli"], module=smod, module_objects=MO)


def _aero_place_spacecraft(parts, quantities, P, MO):
    """Build the satellite + bin remaining parts onto the bus. Returns
    (bbox_mm, region_centres, vehicle_anchors, cz). Free-space — no enclosure."""
    # bus side from mass (heavier ≈ bigger) with an array-area cross-check + fallback
    mass = qval(quantities, "mass_kg") or qval(quantities, "total_system_mass_kg")
    if mass and mass > 0:
        # crude: a small-sat of M kg ≈ a bus of side ~ (M/120)^(1/3) m, clamped
        side = max(600.0, min(2000.0, (mass / 120.0) ** (1.0 / 3.0) * 1000.0))
    else:
        side = SC_BUS_FALLBACK_MM
    array_area = qval(quantities, "solar_array_area_m2")

    bus = _aero_build_bus(side, P, MO)
    arrays = _aero_build_solar_wings(bus, array_area, P, MO)
    ant = _aero_build_antennas(bus, parts, P, MO)
    _aero_build_adcs_thrusters(bus, parts, P, MO)
    _aero_build_radiators(bus, parts, P, MO)

    # bin remaining parts onto / around the bus faces
    _aero_bin_parts_spacecraft(parts, bus, P, MO)

    region_centres = {"bus": (0.0, 0.0), "array_L": (0.0, -arrays["span"] / 4.0),
                      "array_R": (0.0, arrays["span"] / 4.0)}
    span_y = arrays["span"]
    bbox = {"x0": -side * 1.2, "x1": side * 1.2,
            "y0": -span_y / 2.0 - side, "y1": span_y / 2.0 + side}
    anchors = {"bus": bus, "arrays": arrays, "antennas": ant}
    return bbox, region_centres, anchors, bus["cz"]


def _aero_bin_parts_spacecraft(parts, bus, P, MO):
    """Place the remaining classified satellite parts (avionics / sensors / battery
    / payload that the bus builders did not already represent) ON the bus faces by
    NAME role — sensors + payload optics on the zenith/sun-facing deck, avionics +
    battery as boxes mounted to the bus walls — rather than scattering them. All
    mm; deterministic + universal."""
    side = bus["side"]
    cz = bus["cz"]
    half = bus["half"]
    # IMPORTANT: keep binned boxes WITHIN the bus footprint in Y (|y| < half) so
    # they never project out along the ±Y array-deploy corridor (the arrays own ±Y;
    # a box poking into that corridor reads as junk welded to the array root).
    # Sensors/payload ride the +Z (zenith) deck; avionics + battery tuck against the
    # bus on the zenith deck at a small ∓Y offset, stacked along X.
    cur = {"sensor": -side * 0.28, "avionics": -side * 0.28, "battery": -side * 0.28,
           "payload": -side * 0.28, "other": -side * 0.28}
    step = side * 0.20
    span_x = side * 0.62               # keep the row inside the deck
    for p in parts:
        nm = str(p.name)
        # skip the parts the bus builders already drew
        if re.search(r"\bbus\b.?structure|thrust.?tube|separation.?ring|espa|"
                     r"solar.?(array|panel|cell)|array.?drive|yoke|hold-?down|"
                     r"reaction.?wheel|magnetorquer|thruster|propellant|antenna|"
                     r"dish|isoflux|high-?gain|transmitter|transceiver|radiator|"
                     r"drag.?sail|heat.?pipe|\bmli\b|thermal.?strap|umbilical",
                     nm, re.IGNORECASE):
            continue
        pref = _aero_part_prefix(p.name)
        if _AERO_SENSOR_RE.search(nm) or _AERO_PAYLOAD_RE.search(nm):
            # star trackers / sun sensors / optical bench on the zenith deck
            role = "payload" if _AERO_PAYLOAD_RE.search(nm) else "sensor"
            x = max(-span_x, min(span_x, cur[role]))
            y, z = side * 0.24, bus["zenith"] + side * 0.05
            cur[role] += step
        elif _AERO_BATTERY_RE.search(nm):
            role = "battery"
            x = max(-span_x, min(span_x, cur["battery"]))
            y, z = -side * 0.22, bus["zenith"] + side * 0.05
            cur["battery"] += step
        else:
            role = "avionics"
            x = max(-span_x, min(span_x, cur["avionics"]))
            # stagger avionics across two short rows (±Y) so they read as discrete
            # boxes on the deck rather than merging into one wide blue slab.
            row = int(round((cur["avionics"] + side * 0.28) / step)) % 2
            y, z = (side * 0.10 if row else -side * 0.10), bus["zenith"] + side * 0.05
            cur["avionics"] += step
        _aero_emit_part_glyph(pref, role, x, y, z, side * 0.34, P, MO, p)


# ── faint ground plane (aircraft only) ──────────────────────────────────────
def _aero_build_ground_plane(bbox, base_z_mm, MO):
    """A faint, large ground plane far BELOW an aircraft (optional context so the
    vehicle doesn't float in a void). Named u_skid_* so INSPECT renders it as the
    SAME faint wireframe the other families' skids use. A SATELLITE gets none (it
    floats in space). Deterministic; geometry only."""
    sid = STRUCTURE_MODULE_ID
    if sid not in MO:
        MO[sid] = []
    cx = (bbox["x0"] + bbox["x1"]) / 2.0
    cy = (bbox["y0"] + bbox["y1"]) / 2.0
    w = (bbox["x1"] - bbox["x0"]) * 1.6
    d = (bbox["y1"] - bbox["y0"]) * 1.6
    plane_mat = fl.make_mat("m_aero_ground", (0.62, 0.64, 0.68),
                            metallic=0.0, roughness=0.85)
    fl.add_box("u_skid_aero_ground",
               (cx * fl.MM, cy * fl.MM, base_z_mm * fl.MM),
               (w * fl.MM, d * fl.MM, 40.0 * fl.MM), plane_mat,
               module=sid, module_objects=MO)


def _aero_route_topology(topology, parts, anchors, subtype, frame_top_mm, bbox,
                         MAT, MO):
    """Route the aero-body topology — mostly ELECTRICAL / DATA edges (solar → bus →
    loads, payload → comms) — as thin CABLE RUNS / booms, NOT fluid pipe. Reuses the
    overhead-rack router for orthogonal runs but at the VEHICLE scale. Endpoints
    resolve against the vehicle anchors first (solar/array/wing → the array/wing
    centroid; battery/bus/pack → the fuselage/bus centre; motor/propulsion → a prop
    pod; antenna/comms/payload → the antenna/gondola), then fall back to the generic
    part resolver. It is fine if FEWER edges resolve — we report the count. Returns
    (routed, unresolved)."""
    # Build a small role→point map from whichever vehicle was built.
    role_pts = {}
    if subtype == "aircraft":
        fus = anchors["fuselage"]; wing = anchors["wing"]; gond = anchors["gondola"]
        bus_pt = ((fus["body_x0"] + fus["body_x1"]) / 2.0, 0.0, fus["cz"])
        role_pts = {
            "solar": (wing["x"], 0.0, wing["top_z"]),
            "array": (wing["x"], 0.0, wing["top_z"]),
            "wing":  (wing["x"], 0.0, wing["top_z"]),
            "battery": bus_pt, "pack": bus_pt, "bus": bus_pt,
            "payload": gond["anchor"], "gondola": gond["anchor"],
            "motor": (anchors["prop_anchors"][0] if anchors["prop_anchors"] else bus_pt),
            "propuls": (anchors["prop_anchors"][0] if anchors["prop_anchors"] else bus_pt),
            "antenna": (fus["body_x1"], 0.0, fus["crown"] + fus["R"]),
        }
        default_pt = bus_pt
    else:
        bus = anchors["bus"]; arrays = anchors["arrays"]; ant = anchors["antennas"]
        bus_pt = (0.0, 0.0, bus["cz"])
        role_pts = {
            "solar": (arrays["tips"][0] if arrays["tips"] else bus_pt),
            "array": (arrays["tips"][0] if arrays["tips"] else bus_pt),
            "battery": bus_pt, "pack": bus_pt, "bus": bus_pt, "pcdu": bus_pt,
            "eps": bus_pt, "payload": (0.0, bus["side"] * 0.28, bus["zenith"]),
            "antenna": ant["hga"], "comms": ant["hga"], "transmit": ant["hga"],
            "thruster": (0.0, 0.0, bus["nadir"]), "propuls": (0.0, 0.0, bus["nadir"]),
        }
        default_pt = bus_pt

    # shared run elevation = just above the vehicle (the wing top / bus zenith),
    # so the harness rises clear of the body then runs to the target — a real loom.
    vehicle_top = (anchors["wing"]["top_z"] if subtype == "aircraft"
                   else anchors["bus"]["zenith"])
    rack_z = max(frame_top_mm, vehicle_top)

    def _resolve(name):
        low = str(name).lower()
        for key, pt in role_pts.items():
            if key in low and pt:
                return pt
        p = resolve_endpoint(name, parts)
        if p is not None and p.placed_xyz_mm is not None:
            return (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                    p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2])
        return default_pt

    routed = 0
    unresolved = []
    for i, e in enumerate(topology):
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "electrical_bus")
        a = _resolve(frm)
        b = _resolve(to)
        if a is None or b is None:
            unresolved.append((frm, to, mech, ["unresolved"]))
            print(f"[univ][aero] edge {i} UNRESOLVED ({mech}): {frm} -> {to}")
            continue
        # thin cable run on a shared elevation just above the vehicle
        rz = rack_z + 1.0 * (routed % 3) * 80.0
        waypoints = route_rack(a, b, rz)
        nm = f"u_aero_route_{i}_{mech}"
        try:
            # aero edges are electrical/data → cable tray; only an explicit fluid/
            # thermal loop (rare here) draws as a pipe, sized from its rating.
            if mech in ("fluid_loop", "thermal"):
                colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
                mkey = f"u_pipe_{mech}"
                if mkey not in MAT:
                    MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35,
                                            roughness=0.35)
                dia_mm = _sized_dia_mm(nm, mech, waypoints, e)
                fl.prim_pipe_run(nm, waypoints, dia_mm, material=MAT[mkey],
                                 flanges=False, module="mass_fluid_transport_process",
                                 module_objects=MO)
            else:
                _draw_aero_cable(nm, waypoints, MAT, MO)
            _route_log_add(nm, mech, waypoints, a, b)   # audit coverage (harness)
            routed += 1
            print(f"[univ][aero] routed edge {i} ({mech}): {frm} -> {to}")
        except Exception as ex:  # noqa: BLE001
            unresolved.append((frm, to, mech, [f"route_error:{ex}"]))
            print(f"[univ][aero] edge {i} route FAILED: {ex}")
    return routed, unresolved


def _draw_aero_cable(nm, waypoints_mm, MAT, MO):
    """A THIN copper cable run (round, slim) along the orthogonal waypoints — the
    aero-scale harness between solar/bus/loads. Distinct from the fat industrial
    cable tray; here the runs are slim wires on a flight vehicle. All mm."""
    if "u_aero_cable" not in MAT:
        MAT["u_aero_cable"] = fl.make_mat("m_aero_cable", (1.00, 0.50, 0.05),
                                          metallic=0.45, roughness=0.40)
    cab = MAT["u_aero_cable"]
    for a, b in zip(waypoints_mm[:-1], waypoints_mm[1:]):
        ax, ay, az = (float(c) for c in a)
        bx, by, bz = (float(c) for c in b)
        dx, dy, dz = bx - ax, by - ay, bz - az
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        if ln < 1.0:
            continue
        cx, cy, cz = (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2
        if abs(dz) >= abs(dx) and abs(dz) >= abs(dy):
            rot = (0, 0, 0)
        elif abs(dx) >= abs(dy):
            rot = (0, math.radians(90), 0)
        else:
            rot = (math.radians(90), 0, 0)
        fl.add_cyl(f"{nm}_seg{int(cx)}_{int(cy)}_{int(cz)}",
                   (cx * fl.MM, cy * fl.MM, cz * fl.MM),
                   45.0 * fl.MM, ln * fl.MM, cab,
                   module="mass_fluid_transport_process", module_objects=MO,
                   rotation=rot)


def place_aero_body(parts, regions, topology, MAT, MO, subtype=None):
    """AERO-BODY strategy — a FLIGHT VEHICLE in FREE SPACE (no skid / container /
    grow room). Dispatches on the detected SUBTYPE: 'aircraft' builds a HAPS-style
    solar aircraft (fuselage + high-aspect wing + tail + distributed props + PV skin
    + payload gondola + skids), 'spacecraft' builds a satellite (central bus +
    deployed solar-array wings + nadir antennas + reaction wheels/thrusters +
    radiators). The remaining classified parts are placed sensibly ON/IN the body
    by their role. Topology routes as thin electrical/data CABLE runs/booms (not
    fluid pipe); fewer edges may resolve — the count is reported. Same return tuple
    as the other strategies: (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    quantities = _AERO_QUANTITIES or {}
    subtype = subtype or "aircraft"
    P = _aero_palette(MAT)
    global _HERO_HINT

    if subtype == "spacecraft":
        bbox, region_centres, anchors, cz = _aero_place_spacecraft(
            parts, quantities, P, MO)
        print(f"[univ][aero] SPACECRAFT bus side ≈ "
              f"{anchors['bus']['side']/1000:.2f} m, array span ≈ "
              f"{anchors['arrays']['span']/1000:.1f} m; antennas on nadir face")
        frame_top_mm = anchors["bus"]["zenith"] + anchors["bus"]["side"] * 0.6
        # HERO: frame the whole spacecraft TIGHT + centred. Exclude the deorbit
        # drag-sail (a large thin membrane on a long mast that otherwise inflates
        # the frame so the bus + arrays read tiny).
        _HERO_HINT = {"zoom": 0.92, "center_z_frac": 0.5,
                      "exclude_prefixes": ("u_aero_dragsail",)}
    else:
        bbox, region_centres, anchors, cz = _aero_place_aircraft(
            parts, quantities, P, MO)
        wing = anchors["wing"]
        print(f"[univ][aero] AIRCRAFT wingspan ≈ {wing['span']/1000:.1f} m, "
              f"chord ≈ {wing['chord']/1000:.2f} m, fuselage along X; "
              f"distributed props + PV wing skin")
        # optional faint ground plane FAR below the aircraft (context, not a skid)
        _aero_build_ground_plane(bbox, base_z_mm=-cz * 0.4, MO=MO)
        frame_top_mm = wing["top_z"] + (bbox["x1"] - bbox["x0"]) * 0.05
        # HERO: a 35 m thin aircraft reads tiny at bbox-fit. Frame TIGHT on the
        # airframe at wing height, and EXCLUDE the faint ground plane (it is 1.6×
        # the airframe each way → it dominates the bbox and shrinks the vehicle).
        _HERO_HINT = {"zoom": 0.80, "center_z_frac": 0.62,
                      "exclude_prefixes": ("u_skid_aero_ground",)}

    # topology as thin cable runs / booms (electrical/data dominate)
    routed, unresolved = _aero_route_topology(
        topology, parts, anchors, subtype, frame_top_mm, bbox, MAT, MO)
    print(f"[univ][aero] topology routed = {routed}/{len(topology)}; "
          f"unresolved = {len(unresolved)}")
    return bbox, region_centres, frame_top_mm, routed, unresolved


# ═══════════════════════════════════════════════════════════════════════════
# Lighting + skid frame + main
# ═══════════════════════════════════════════════════════════════════════════

def add_flat_lights(bbox_mm):
    """FLAT, EVEN, low-shadow studio rig for CAD LEGIBILITY (Tristan 2026-06-10).

    The first cut used fl.add_lights() — a single KEY SUN with shadows ON — which
    threw long diagonal shadows across the deck that obscured the geometry. This
    rig instead:
      • sets a BRIGHT neutral world so ambient fills every shadow (the dominant
        light is the omnidirectional world, not a directional sun),
      • adds four soft AREA fills (above + three sides) for gentle modelling,
      • adds NO shadow-casting sun, and force-disables every Eevee shadow flag so
        the spatial AND hero passes render shadow-free (run_render_pipeline only
        kills shadows for the per-module pass; the hero/spatial passes inherit
        init_scene's use_soft_shadows=True otherwise).
    The geometry reads clearly from every camera; this is legibility, not style.
    """
    cx = (bbox_mm["x0"] + bbox_mm["x1"]) / 2 * fl.MM
    cy = (bbox_mm["y0"] + bbox_mm["y1"]) / 2 * fl.MM
    span = max(bbox_mm["x1"] - bbox_mm["x0"], bbox_mm["y1"] - bbox_mm["y0"]) * fl.MM
    cz = span * 0.20

    # Neutral mid-grey world for AMBIENT FILL (not a bleaching flood). Kept near
    # the lib's proven 0.55-0.58 grey so the saturated equipment + steel frame
    # keep CONTRAST under AgX — a brighter world washed the spatial/hero passes
    # to a pale grey (the directional fills below do the modelling instead).
    world = bpy.data.worlds.new("world_flat")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    # Darker backdrop (~0.42 display grey) so the lit, saturated equipment +
    # galvanised steel SEPARATE from the background instead of bleaching into it
    # under AgX. A flat bright world washed the wide spatial/hero passes to a
    # pale, low-contrast grey; a darker world + strong directional fills (below)
    # keeps the geometry crisp and CLEARLY VISIBLE — the legibility goal.
    bg.inputs["Color"].default_value = (*fl._to_linear((0.42, 0.43, 0.47)), 1.0)
    bg.inputs["Strength"].default_value = 0.85

    # Four soft AREA fills (big) — above + 3 sides — the PRIMARY shadowless
    # modelling light. Strong so the equipment is brightly + evenly lit against
    # the darker world (high contrast, zero cast shadows).
    sz = max(30.0, span * 1.2)
    # PROVEN even-fill studio rig (the CO2/SAF renders that look great use exactly this —
    # do NOT replace with a single directional key; the crispness comes from equipment
    # DETAIL under even light, not from dramatic shading).
    fills = [
        ("fl_fill_top",   (cx, cy, cz + span * 1.1), sz, 600),
        ("fl_fill_front", (cx, cy - span * 1.0, cz + span * 0.4), sz, 340),
        ("fl_fill_left",  (cx - span * 1.0, cy, cz + span * 0.4), sz, 280),
        ("fl_fill_right", (cx + span * 1.0, cy, cz + span * 0.4), sz, 280),
    ]
    for nm, loc, size, energy in fills:
        bpy.ops.object.light_add(type="AREA", location=loc)
        a = bpy.context.active_object
        a.name = nm
        a.data.energy = energy
        a.data.size = size
        # aim each fill at the plant centre
        d = (cx - loc[0], cy - loc[1], cz - loc[2])
        a.rotation_euler = __import__("mathutils").Vector(d).to_track_quat("-Z", "Y").to_euler()
        try:
            a.data.use_shadow = False
        except AttributeError:
            pass

    # Force every Eevee shadow flag OFF for ALL passes (kills the diagonal wash).
    eevee = getattr(bpy.context.scene, "eevee", None)
    if eevee is not None:
        for attr in ("use_shadow", "use_shadows", "use_shadow_high_bitdepth",
                     "use_soft_shadows", "use_gtao"):
            try:
                setattr(eevee, attr, attr == "use_gtao")  # keep AO, drop cast shadows
            except (AttributeError, TypeError):
                continue


def build_skid_frame(bbox_mm, frame_height_mm, MAT, MO):
    """Give the plant a CLEAN, MINIMAL structural skid that reads as CONTEXT, not a
    cage (Tristan visual-judge 2026-06-11: the old dense X-braced truss "caged" the
    plant and obscured the equipment). The frame is now: a low base + deck (via
    prim_skid_frame) + thin corner & intermediate posts rising to ~the tallest
    vessel + a faint top perimeter rail. NO diagonal X cross-bracing, NO end
    sway-braces — those triangulated members were the busy scaffolding that
    dominated the image. The equipment is the focus; the frame is a subordinate
    outline that gives scale + a footprint. Genuinely tall columns / flare stacks
    still tower ABOVE the frame top (real open-air skids)."""
    x0, x1 = bbox_mm["x0"] - FRAME_MARGIN_MM, bbox_mm["x1"] + FRAME_MARGIN_MM
    y0, y1 = bbox_mm["y0"] - FRAME_MARGIN_MM, bbox_mm["y1"] + FRAME_MARGIN_MM
    w = x1 - x0
    d = y1 - y0
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    H = max(SKID_FRAME_MIN_HEIGHT_MM, frame_height_mm)   # frame top height (mm)
    # MATTE light-grey, NOT polished steel: a metallic 0.85 frame made every thin beam
    # catch the world + the area fills and POP as a bright sketch-line (the "weird lines"
    # Tristan flagged), and a wireframe enclosure of bright reflective edges competed
    # with the equipment. Low metallic + high roughness + a lighter near-world grey lets
    # the structure READ as subordinate steelwork that recedes, so the tanks + pipes lead
    # the value hierarchy (#147 frame subordination). (2026-06-20.)
    steel = fl.make_mat("m_skid_steel", (0.47, 0.48, 0.51), metallic=0.08, roughness=0.78)
    deck = fl.make_mat("m_skid_deck", (0.22, 0.26, 0.32), metallic=0.55, roughness=0.40)
    # Thin posts/rails (SKID_POST_MM is sized for the dark-deck PDF where the frame
    # is solid steel; in the light INSPECT pass it is a faint subordinate outline,
    # so a slimmer section reads cleaner without vanishing).
    m = SKID_POST_MM * 0.62
    sid = STRUCTURE_MODULE_ID

    # Base rails + cross members + deck (a LOW base frame from the lib primitive) —
    # the clean pad the equipment sits on.
    base_h = max(600, m * 4)
    fl.prim_skid_frame("u_skid_base", w, d, base_h, (cx, cy, 0.0),
                       material=steel, material_deck=deck,
                       n_cross_members=max(2, int(w / 4000)),
                       module=sid, module_objects=MO)
    deck_z = base_h

    def _mm3(t):
        return tuple(c * fl.MM for c in t)

    # Vertical posts: 4 corners + a FEW intermediate posts along each long (X) face
    # (sparser than before — wide bays read as a light open outline, not a fence).
    n_inter = max(1, int(w / 9000))             # intermediate posts per long face
    xs = [x0 + m / 2] + [x0 + (k + 1) * w / (n_inter + 1) for k in range(n_inter)] + [x1 - m / 2]
    post_h = H - base_h
    for px in xs:
        for py in (y0 + m / 2, y1 - m / 2):
            fl.add_box(f"u_skid_post_{px:.0f}_{py:.0f}",
                       _mm3((px, py, deck_z + post_h / 2)),
                       _mm3((m, m, post_h)), steel, module=sid, module_objects=MO)
    # Faint top perimeter rail (front, back, both ends) at the frame top — the only
    # horizontal up top, so the frame closes as a clean box without cross members.
    for (sx, sy, sw, sd) in [(cx, y0 + m / 2, w, m), (cx, y1 - m / 2, w, m),
                             (x0 + m / 2, cy, m, d), (x1 - m / 2, cy, m, d)]:
        fl.add_box(f"u_skid_toprail_{sx:.0f}_{sy:.0f}",
                   _mm3((sx, sy, H - m / 2)), _mm3((sw, sd, m)),
                   steel, module=sid, module_objects=MO)
    print(f"[univ] skid frame: {w/1000:.1f}×{d/1000:.1f} m footprint, "
          f"{H/1000:.1f} m tall, {len(xs)} post bays, clean minimal (no X-bracing)")


# ═══════════════════════════════════════════════════════════════════════════
# CAD-INSPECTION RENDER MODE (INSPECT=1) — the FAST visual-judge surface
# ───────────────────────────────────────────────────────────────────────────
# A clean, bright, light-background "CAD drawing on white" pass that REPLACES the
# dark navy-deck PDF pipeline when env INSPECT=1. Goals (Tristan 2026-06-10,
# light-mode only): (1) light neutral-grey world + Standard view transform so the
# image reads bright; (2) even shadowless fill so geometry reads by silhouette;
# (3) distinct FLAT MATTE colour per part TYPE (keyed by the classifier `shape`)
# with the skid frame de-emphasised to a thin semi-transparent wireframe so the
# equipment is FULLY VISIBLE through it — no ghosting, whole plant solid; (4) four
# bbox-fit cameras (iso / top / front / side). Deterministic + universal: colours
# key off part type, cameras fit the scene bbox, so it works for ANY archetype.
# ═══════════════════════════════════════════════════════════════════════════

def _part_prefix(name):
    """Reproduce build_part()'s object-name prefix EXACTLY so we can map every
    object a part created back to that part's classifier shape. Must stay in
    lock-step with build_part: nm = "u_" + slug(name)[:40]."""
    return "u_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40]


def _inspect_colour_for_part(part):
    """The flat-matte INSPECT colour for one part, keyed by its classifier shape,
    with a NAME-based override to the tan bed/dryer/filter family (those resolve
    to the vertical_vessel shape so shape alone can't separate them)."""
    if INSPECT_BED_RE.search(str(part.name)):
        return INSPECT_BED_COLOUR
    return INSPECT_TYPE_COLOUR.get(part.shape, INSPECT_DEFAULT_COLOUR)


# Flat-matte INSPECT colours for the rack-farm object families (keyed by the
# build_part-independent u_rf_* object names). Cells dark, rack frame battery-blue,
# bus copper, BoP skids by role. Matched by substring on the object name.
_INSPECT_RACKFARM = [
    # ── RACK sub-parts: MORE SPECIFIC keys MUST precede the "_rack_" catch-all
    #    (every rack object name contains "_rack_"). The MODULE bodies are the
    #    visible battery-blue front faces; the recessed shell ("_frame") + the
    #    fascia strips are DARK so the gaps read as shadow shelf-lines (Fix 2). ──
    ("_cells",        (0.10, 0.12, 0.22)),   # (legacy) cell stack = dark navy
    ("_frame",        (0.09, 0.11, 0.20)),   # recessed cabinet shell = dark navy
    ("_fascia",       (0.07, 0.09, 0.16)),   # module handle/terminal strip = darkest
    ("_mod",          (0.20, 0.32, 0.82)),   # battery MODULE body = battery blue
    ("_doorstile",    (0.46, 0.48, 0.52)),   # door frame stile = steel grey
    ("_doorrail",     (0.46, 0.48, 0.52)),   # door frame rail = steel grey
    ("_bus",          (0.95, 0.55, 0.10)),   # rack DC bus stripe = copper-orange
    ("_plinth",       (0.50, 0.52, 0.55)),   # plinth = mid grey steel
    ("_rack_",        (0.18, 0.30, 0.78)),   # rack frame = battery blue (fallback)
    # ── BoP role sub-parts: distinct keys for the high-signal detail parts so a
    #    bushing reads porcelain, a fire bottle red, a fan dark — placed BEFORE the
    #    role body keys (which are substrings of the detail names). ──
    ("_bushing",      (0.86, 0.86, 0.82)),   # transformer HV bushing = porcelain
    ("_fin",          (0.34, 0.36, 0.40)),   # transformer radiator fin = dark steel
    ("_conservator",  (0.30, 0.34, 0.42)),   # transformer oil conservator = steel
    ("_bottle",       (0.82, 0.16, 0.12)),   # fire-suppression agent bottle = red
    ("_fanring",      (0.46, 0.48, 0.52)),   # chiller fan shroud ring = steel
    ("_fan",          (0.16, 0.17, 0.20)),   # chiller fan disc = dark
    ("_louvre",       (0.20, 0.22, 0.26)),   # cabinet vent louvre = dark slat
    ("bop_pcs",       (0.40, 0.50, 0.66)),   # PCS / inverter = steel blue-grey
    ("bop_switchgear",(0.42, 0.44, 0.50)),   # switchgear = dark grey
    ("bop_transformer",(0.20, 0.34, 0.80)),  # transformer = deep blue
    ("bop_bms_ctrl",  (0.20, 0.46, 0.92)),   # BMS / EMS controller = bright blue
    ("bop_chiller",   (0.80, 0.72, 0.50)),   # chiller / thermal = tan
    ("bop_fire",      (0.80, 0.20, 0.16)),   # fire-suppression skid = red
    # compute BoP roles (a server-room lineup) — distinct from the BESS bodies
    ("bop_cooling",   (0.72, 0.80, 0.88)),   # CRAC / CRAH cooling = pale blue-grey
    ("bop_pdu",       (0.36, 0.40, 0.46)),   # power distribution = dark grey
    ("bop_network",   (0.28, 0.50, 0.42)),   # network switch = green-grey
    ("bop_ups",       (0.42, 0.46, 0.54)),   # UPS = steel grey
]

# COMPUTE-flavour overrides for the shared rack object keys (same object names as a
# battery rack, but a server rack must read GREY, not battery-blue, with a dark
# cable spine rather than a copper DC bus). Consulted by _inspect_rackfarm_colour
# when the detected flavour is 'compute'. Battery/generic keep the table above.
_INSPECT_RACKFARM_COMPUTE = {
    # populated-server FACE detail (MORE SPECIFIC keys first; _led also glows via
    # the emissive special-case in the u_rf_ recolour branch). These turn a plain
    # sled into a stacked 1U/2U server: dark bezel + lit status LEDs + drive bays.
    "_bezel":  (0.18, 0.19, 0.22),   # sled front bezel plate = dark
    "_led":    (0.30, 0.95, 0.45),   # status-LED dot = lit green (fallback colour)
    "_bay":    (0.10, 0.11, 0.13),   # drive-bay slot = darkest recess
    "_frame":  (0.16, 0.17, 0.20),   # recessed cabinet shell = neutral dark
    "_fascia": (0.12, 0.13, 0.15),   # sled bezel strip = darkest (shelf-line)
    "_mod":    (0.66, 0.68, 0.72),   # server SLED body = light grey
    "_rack_":  (0.60, 0.62, 0.66),   # rack frame fallback = grey
    "_bus":    (0.16, 0.17, 0.20),   # cable-management spine = dark
}


def _inspect_rackfarm_colour(name):
    """Flat-matte INSPECT colour for a rack-farm object, by its name role. When the
    detected rack FLAVOUR is 'compute', the shared rack keys (_mod / _rack_ / _bus)
    map to server-grey + a dark cable spine instead of battery-blue + copper bus, so
    a compute rack reads as a SERVER rack in the judge surface. Falls back to the
    battery-blue rack colour for any unmatched u_rf_* helper."""
    if _RACK_FLAVOUR == "compute":
        for key, rgb in _INSPECT_RACKFARM_COMPUTE.items():
            if key in name:
                return rgb
    for key, rgb in _INSPECT_RACKFARM:
        if key in name:
            return rgb
    return (0.18, 0.30, 0.78)


# Flat-matte INSPECT colours for the panel-array / grow-rack object families
# (keyed by the u_gr_* object names). Grow trays/canopy GREEN, LED panels bright
# white-blue, rack frames light grey, water/nutrient tanks blue, HVAC mid-grey.
# MORE SPECIFIC keys MUST precede catch-alls (every rack object contains "_rack_";
# detail parts like "_tank"/"_fan" are substrings of role bodies). Matched by
# substring on the object name, in order.
_INSPECT_PANELARRAY = [
    # ── grow-rack sub-parts (MORE SPECIFIC keys first) ──
    ("_channel",    (0.86, 0.90, 0.94)),   # NFT/hydroponic channel = pale white-grey
    ("_puck",       (0.18, 0.72, 0.22)),   # plant puck / net-pot crop = vivid green
    ("_canopy",     (0.10, 0.62, 0.16)),   # green canopy / grow area = GREEN
    ("_traypan",    (0.74, 0.77, 0.81)),   # grow-tray pan = light steel grey
    ("_tray",       (0.78, 0.80, 0.83)),   # grow-tray (fallback) = light steel grey
    ("_ledhouse",   (0.22, 0.24, 0.28)),   # LED panel housing frame = dark fixture
    ("_ledpanel",   (0.74, 0.86, 1.00)),   # LED lit face (emissive; this is fallback)
    ("_led",        (0.72, 0.86, 1.00)),   # LED (legacy/fallback) = bright white-blue
    ("_shelfrail",  (0.70, 0.72, 0.76)),   # per-tier shelf rail = light grey
    ("_post",       (0.74, 0.76, 0.80)),   # rack frame post = light grey
    ("_railx",      (0.74, 0.76, 0.80)),   # rack frame rail = light grey
    ("_castor",     (0.18, 0.19, 0.22)),   # castor wheel = dark
    ("_rack_",      (0.74, 0.76, 0.80)),   # rack frame fallback = light grey
    # ── BoP role detail parts (precede the role bodies) ──
    ("_ductwork",   (0.55, 0.78, 0.88)),   # HVAC duct = pale blue
    ("_duct",       (0.55, 0.78, 0.88)),   # HVAC duct = pale blue
    ("_ahufanring", (0.46, 0.48, 0.52)),   # AHU fan shroud = steel
    ("_ahufan",     (0.16, 0.17, 0.20)),   # AHU fan disc = dark
    ("_fanring",    (0.46, 0.48, 0.52)),
    ("_fan",        (0.16, 0.17, 0.20)),
    ("_tank",       (0.10, 0.40, 0.92)),   # nutrient tank = blue
    ("_dosing",     (0.00, 0.45, 0.85)),   # dosing manifold = mid blue
    ("_pumphd",     (1.00, 0.82, 0.10)),   # dosing pump head = yellow
    ("_regulator",  (1.00, 0.82, 0.10)),   # CO2 regulator = yellow
    ("_bottle",     (0.80, 0.82, 0.86)),   # CO2 bottle = light grey
    ("_cap",        (0.80, 0.82, 0.86)),   # CO2 bottle cap = light grey
    ("_filter",     (0.55, 0.58, 0.66)),   # water filter housing = grey
    ("_uv",         (0.55, 0.35, 1.00)),   # UV steriliser barrel = violet
    ("_door",       (0.26, 0.30, 0.38)),   # control cabinet door = dark
    ("_vent",       (0.20, 0.22, 0.26)),   # control cabinet vent = dark
    ("_body",       (0.30, 0.32, 0.40)),   # control cabinet body = dark grey
    ("_plinth",     (0.50, 0.52, 0.55)),   # plinth = mid grey steel
    # ── BoP role bodies (matched by u_gr_bop_<role>) ──
    ("bop_hvac",     (0.55, 0.58, 0.64)),  # HVAC body = mid grey
    ("bop_nutrient", (0.10, 0.42, 0.92)),  # nutrient skid body = blue
    ("bop_co2",      (0.80, 0.82, 0.86)),  # CO2 body = light grey
    ("bop_control",  (0.30, 0.32, 0.40)),  # control body = dark grey
    ("bop_water",    (0.45, 0.34, 0.85)),  # water/effluent body = violet
]


def _inspect_panelarray_colour(name):
    """Flat-matte INSPECT colour for a panel-array / grow-rack object, by its name
    role. Falls back to a light grey frame colour for any unmatched u_gr_* helper."""
    for key, rgb in _INSPECT_PANELARRAY:
        if key in name:
            return rgb
    return (0.74, 0.76, 0.80)


# Flat-matte INSPECT colours for the TOWER-MACHINE object families (keyed by the
# u_tm_* object names). Tower/nacelle LIGHT GREY, blades WHITE, hub/yaw GREY,
# foundation CONCRETE-GREY, BoP cabinets by role. MORE SPECIFIC keys MUST precede
# catch-alls; the BoP detail keys (bushing/fin/louvre…) are shared with the
# rack-farm builders so reuse the same colours. Matched by substring, in order.
_INSPECT_TOWERMACHINE = [
    # ── BoP role detail parts (precede role bodies + the broad turbine keys) ──
    ("_bushing",      (0.86, 0.86, 0.82)),   # transformer HV bushing = porcelain
    ("_fin",          (0.34, 0.36, 0.40)),   # transformer radiator fin = dark steel
    ("_conservator",  (0.30, 0.34, 0.42)),   # transformer oil conservator = steel
    ("_louvre",       (0.20, 0.22, 0.26)),   # cabinet vent louvre = dark slat
    ("_door",         (0.26, 0.30, 0.38)),   # control cabinet door = dark
    ("_vent",         (0.20, 0.22, 0.26)),   # control cabinet vent = dark
    ("bop_converter", (0.40, 0.50, 0.66)),   # converter cabinet = steel blue-grey
    ("bop_transformer",(0.28, 0.38, 0.62)),  # transformer = blue-grey
    ("bop_switchgear",(0.34, 0.38, 0.44)),   # switchgear = dark grey
    ("bop_scada",     (0.30, 0.46, 0.40)),   # SCADA / control = green-grey
    # ── turbine geometry (after BoP so a bop_* body never matches these) ──
    #    SPECIFIC compound keys MUST precede the broad role keys: _tower_door must
    #    beat _tower, _tower_*flange must beat _tower, _spinner is its own grey.
    ("_tower_door",   (0.30, 0.32, 0.36)),   # base access door = dark steel
    ("_baseflange",   (0.58, 0.60, 0.64)),   # tower base flange = mid steel
    ("_tower_flange", (0.58, 0.60, 0.64)),   # tower section flange ring = mid steel
    ("_blade",        (0.95, 0.95, 0.96)),   # rotor blade (root/seg/tip) = WHITE
    ("_spinner",      (0.66, 0.68, 0.72)),   # spinner nose cone = grey
    ("_hub",          (0.66, 0.68, 0.72)),   # rotor hub barrel = grey
    ("_yaw",          (0.60, 0.62, 0.66)),   # yaw bearing collar = grey
    ("_nacelle",      (0.80, 0.81, 0.84)),   # nacelle housing (+tail/nose/met) = light grey
    ("_pedestal",     (0.60, 0.59, 0.56)),   # foundation pedestal = concrete grey
    ("_tower",        (0.82, 0.83, 0.85)),   # tower tube = light grey
    ("_found",        (0.62, 0.61, 0.58)),   # foundation pad = concrete grey
    ("_plinth",       (0.50, 0.52, 0.55)),   # BoP plinth = mid grey steel
]


def _inspect_towermachine_colour(name):
    """Flat-matte INSPECT colour for a tower-machine object, by its name role.
    Falls back to the tower light grey for any unmatched u_tm_* helper."""
    for key, rgb in _INSPECT_TOWERMACHINE:
        if key in name:
            return rgb
    return (0.82, 0.83, 0.85)


# Flat-matte INSPECT colours for the AERO-BODY object families (keyed by the
# u_aero_* object names). Fuselage/bus LIGHT GREY, wing/structure GREY, solar
# panels DARK BLUE, propellers DARK, antennas LIGHT GREY, thrusters/reaction-wheels
# COPPER, payload dark, avionics blue. MORE SPECIFIC keys MUST precede catch-alls
# (every binned-part object starts u_aero_p_; detail keys like _dish/_lens are
# substrings of the body names). Matched by substring on the object name, in order.
_INSPECT_AERO = [
    # ── solar (dark blue) — FIRST so it wins over any structure key ──
    ("_arraycell",    (0.40, 0.50, 0.82)),   # satellite array cell-grid lines = light blue
    ("_solarcell",    (0.40, 0.50, 0.82)),   # aircraft wing cell-grid lines = light blue
    ("_solar",        (0.05, 0.08, 0.45)),   # aircraft wing PV cells = dark blue
    ("_arraypanel",   (0.05, 0.08, 0.45)),   # satellite array panel = dark blue
    ("_arrayboom",    (0.55, 0.57, 0.61)),   # array deploy boom = grey structure
    # ── propellers / props (dark) ──
    ("_propblade",    (0.05, 0.06, 0.09)),   # propeller blade = near-black
    ("_propspinner",  (0.10, 0.11, 0.14)),   # propeller spinner cone = dark
    ("_prophub",      (0.10, 0.11, 0.14)),   # propeller hub = dark
    ("_podtail",      (0.55, 0.57, 0.61)),   # nacelle rear fairing = grey structure
    ("_pod",          (0.55, 0.57, 0.61)),   # motor pod / nacelle = grey structure
    # ── thrusters / reaction wheels / magnetorquers (copper) ──
    ("_thrusterbell", (0.78, 0.50, 0.24)),   # thruster nozzle bell = copper
    ("_thruster",     (0.72, 0.45, 0.20)),   # thruster body = copper
    ("_reactionwheel",(0.74, 0.47, 0.22)),   # reaction wheel = copper
    ("_magnetorquer", (0.74, 0.47, 0.22)),   # magnetorquer rod = copper
    ("_propellant",   (0.62, 0.64, 0.68)),   # propellant tank = grey
    # ── antennas (light grey) ──
    ("_hga_dish",     (0.84, 0.86, 0.90)),   # high-gain dish reflector + back = light grey
    ("_hga_feed",     (0.78, 0.80, 0.84)),   # dish feed arm + feed horn = grey
    ("_hga_mast",     (0.78, 0.80, 0.84)),
    ("_horn",         (0.82, 0.84, 0.88)),   # horn / patch antenna = light grey
    ("_dish",         (0.84, 0.86, 0.90)),   # binned-part dish = light grey
    ("_mast",         (0.78, 0.80, 0.84)),
    # ── radiators / MLI / drag sail ──
    ("_radiator",     (0.88, 0.89, 0.92)),   # radiator panel = near-white
    ("_dragsail_mast",(0.55, 0.57, 0.61)),   # drag-sail mast = grey structure
    ("_dragsail_boom",(0.55, 0.57, 0.61)),   # drag-sail boom = grey structure
    ("_dragsail",     (0.86, 0.74, 0.30)),   # deorbit drag sail membrane = gold MLI
    # ── payload / sensors (dark) ──
    ("_turret",       (0.12, 0.14, 0.18)),   # sensor turret = dark
    ("_lens",         (0.08, 0.10, 0.14)),   # sensor / camera lens = darkest
    ("_gondola",      (0.14, 0.16, 0.20)),   # payload gondola = dark
    # ── landing skids (grey) ──
    ("_skid",         (0.60, 0.62, 0.66)),   # landing skid / strut = grey
    ("_skidstrut",    (0.60, 0.62, 0.66)),
    # ── fuselage / bus bodies (LIGHT GREY) ──
    ("_fuselage",     (0.80, 0.82, 0.86)),   # fuselage body / nose / tail = light grey
    ("_bus_body",     (0.86, 0.74, 0.30)),   # satellite bus (MLI-wrapped) = gold
    ("_bus_thrusttube",(0.55, 0.57, 0.61)),  # thrust tube = grey structure
    ("_bus_sepring",  (0.55, 0.57, 0.61)),   # separation / ESPA ring = grey
    # ── wing + tail + structure (grey) ──
    ("_wing_skin",    (0.74, 0.77, 0.82)),   # wing skin = light steel grey
    ("_wing_spar",    (0.55, 0.57, 0.61)),   # wing spar = grey structure
    ("_wing_tip",     (0.60, 0.62, 0.66)),   # wing tip cap = grey
    ("_vtail",        (0.74, 0.77, 0.82)),   # V-tail fin = light grey
    ("_hstab",        (0.74, 0.77, 0.82)),   # horizontal stab = light grey
    ("_tailboom",     (0.55, 0.57, 0.61)),   # tail boom = grey structure
    ("_podpylon",     (0.55, 0.57, 0.61)),   # pod pylon = grey
    # ── binned-part body glyphs (by role suffix) ──
    ("_p_",           (0.30, 0.46, 0.80)),   # binned avionics/other box = blue
]


def _inspect_aero_colour(name):
    """Flat-matte INSPECT colour for an aero-body object, by its name role. Falls
    back to light grey for any unmatched u_aero_* helper. The binned-part role is
    carried in the GLYPH suffix (_dish/_turret/_tray/_box) so a part lands on the
    right colour even though its prefix is the part name."""
    low = name.lower()
    for key, rgb in _INSPECT_AERO:
        if key in low:
            return rgb
    return (0.74, 0.76, 0.80)


def apply_inspection_materials(parts):
    """Re-skin the whole scene for the CAD-inspection pass (NON-destructive to
    geometry — only materials change):
      • EVERY object a part built (matched by the part's name prefix) → a single
        FLAT MATTE colour for that part's TYPE, so each part reads as one solid
        silhouette (no per-sub-part steel/lagging/orange-tip distractions).
      • The skid frame (u_skid_*) → a thin DARK semi-transparent wireframe-look
        material + a Wireframe modifier on box members, so equipment is fully
        visible THROUGH the frame (the tall frame no longer occludes the hero).
      • Routed pipes (u_route_*) keep their mechanism colours but are flattened to
        matte (kill the gloss that muddied them).
    Returns a count dict for the run summary."""
    # 1. Build prefix → colour map from the parts list (LONGEST prefix first so a
    #    short prefix never shadows a more specific longer one — deterministic).
    #    GENERIC-ASSEMBLY override: when place_generic_assembly populated the
    #    per-part MODULE-index colour map, key each part to its MODULE colour (so the
    #    assembly reads grouped by subsystem) instead of its shape-type colour.
    ga_colour = _GA_PART_MODULE_COLOUR or {}
    pref_colour = []
    for p in parts:
        pref = _part_prefix(p.name)
        colour = ga_colour.get(pref) or _inspect_colour_for_part(p)
        pref_colour.append((pref, colour))
    pref_colour.sort(key=lambda t: len(t[0]), reverse=True)

    # 2. One cached matte material per distinct colour (dedupe by rounded rgb).
    mat_cache = {}

    def _matte(rgb):
        key = tuple(round(c, 3) for c in rgb)
        if key not in mat_cache:
            mat_cache[key] = fl.make_mat(
                f"m_inspect_{key[0]:.2f}_{key[1]:.2f}_{key[2]:.2f}",
                fl._to_linear(rgb), metallic=0.0, roughness=0.78)
        return mat_cache[key]

    # Emissive matte for LIT fixtures (e.g. grow-rack LED panels) — same flat
    # CAD look but glows, so a "lit tier" reads as unmistakably illuminated even
    # in the otherwise-shadowless INSPECT pass (a plain pale-blue matte slab
    # reads as a faint grey gap and was missed). strength tuned to glow clearly
    # against the 0.85 light deck without blooming out the green canopy above.
    def _emissive(rgb, strength=2.6):
        key = ("emit", tuple(round(c, 3) for c in rgb), round(strength, 2))
        if key not in mat_cache:
            mat_cache[key] = fl.make_mat(
                f"m_inspect_emit_{rgb[0]:.2f}_{rgb[1]:.2f}_{rgb[2]:.2f}",
                fl._to_linear(rgb), metallic=0.0, roughness=0.30,
                emission_strength=strength)
        return mat_cache[key]

    # 3. Frame material: mid-grey, thin, semi-transparent edges so it never
    #    occludes. Kept LIGHT + low-alpha so the diagonal pipe braces (which are
    #    thin cylinders, not wireframed) recede into the deck rather than reading
    #    as bold black X's in the elevation views.
    frame_mat = fl.make_mat("m_inspect_frame", fl._to_linear((0.45, 0.47, 0.52)),
                            metallic=0.0, roughness=0.7, alpha=0.16)
    # Pipe-rack STRUCTURE (Fix 2): a light structural grey, fully opaque but
    # subordinate — reads as a real rack the pipes rest on without competing with
    # the equipment. Distinct from the de-emphasised skid frame (which is a near-
    # transparent wireframe) so the rack is the thing the eye sees under the runs.
    rack_mat = fl.make_mat("m_inspect_rack", fl._to_linear((0.70, 0.72, 0.75)),
                           metallic=0.0, roughness=0.72)

    n_equip = n_frame = n_pipe = n_rack = n_unmatched = 0
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or obj.data is None:
            continue
        nm = obj.name
        # ── Pipe-rack structure → solid light structural grey (Fix 2) ──
        if nm.startswith("u_rack_"):
            obj.data.materials.clear()
            obj.data.materials.append(rack_mat)
            n_rack += 1
            continue
        # ── Frame → thin wireframe + semi-transparent dark edges ──
        if nm.startswith("u_skid_"):
            obj.data.materials.clear()
            obj.data.materials.append(frame_mat)
            # Wireframe modifier turns solid box members into thin edge bars so
            # equipment is visible through the frame. Pipe-based braces are
            # already thin; a wireframe on them would vanish, so only box posts/
            # rails/deck (which carry many faces) get it — detected by face count.
            try:
                if len(obj.data.polygons) <= 12:  # a box (cube=6, low-poly rail)
                    mod = obj.modifiers.new("inspect_wire", "WIREFRAME")
                    mod.thickness = 0.06
                    mod.use_replace = True
            except (AttributeError, RuntimeError):
                pass
            n_frame += 1
            continue
        # ── Routed pipes + TRUNK/TAP busways → keep mechanism colour, just flatten
        #    to matte. u_trunk_*/u_tap_* are the header-and-branch runs (a trunk
        #    along the consumer row + a short tap per consumer); they already carry
        #    the mechanism colour from _mech_pipe_mat / the cable-tray material, so —
        #    exactly like u_route_* — we keep that colour and only kill the gloss
        #    (NOT recolour them neutral-grey via the unmatched fallback). ──
        if nm.startswith("u_route_") or nm.startswith("u_trunk_") \
                or nm.startswith("u_tap_") or nm.startswith("u_pipe_") \
                or nm.startswith("u_wire_"):
            for m in obj.data.materials:
                if m is None:
                    continue
                bsdf = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
                if bsdf is not None:
                    try:
                        bsdf.inputs["Metallic"].default_value = 0.0
                        bsdf.inputs["Roughness"].default_value = 0.8
                    except (KeyError, AttributeError):
                        pass
            n_pipe += 1
            continue
        # ── Electrical incomer marker (Fix 1) → copper-orange matte, like the
        #    cable tray, so the external supply reads as ONE electrical system ──
        if nm.startswith("u_incomer_"):
            obj.data.materials.clear()
            obj.data.materials.append(_matte((1.00, 0.45, 0.00)))
            n_pipe += 1
            continue
        # ── GROUND SLAB (Stage 4: add_ground_slab) → a flat concrete-grey deck the
        #    plant visibly SITS on. A touch darker than the 0.85 world so the floor
        #    reads as a distinct surface under the equipment, but light enough to
        #    stay subordinate (it must not compete with the plant). Not a Part →
        #    would otherwise fall to the neutral-grey unmatched bucket. ──
        if nm.startswith("u_ground_"):
            obj.data.materials.clear()
            obj.data.materials.append(_matte(GROUND_SLAB_COLOUR))
            n_frame += 1            # counted with structure (it is the deck), not equip
            continue
        # ── RACK-FARM geometry (u_rf_*) → flat matte by sub-part role, so the
        #    rows of racks + the BoP lineup read by colour in the judging surface
        #    (these objects aren't owned by a Part, so they'd otherwise fall to the
        #    neutral-grey unmatched bucket). Keyed by the object-name suffix/role. ──
        if nm.startswith("u_rf_"):
            obj.data.materials.clear()
            # Compute-sled status LEDs ("_led") GLOW (emissive) so a rack reads as
            # POPULATED servers with lit activity/power indicators — a flat-matte
            # green dot reads as a dull speck in the shadowless INSPECT pass (same
            # root-cause as the grow-rack LED panel). Everything else flat-matte.
            if "_led" in nm:
                obj.data.materials.append(_emissive((0.32, 0.98, 0.48), strength=2.4))
            else:
                obj.data.materials.append(_matte(_inspect_rackfarm_colour(nm)))
            n_equip += 1
            continue
        # ── PANEL-ARRAY / grow-rack geometry (u_gr_*) → flat matte by sub-part
        #    role, so the rows of grow racks + canopy + LED panels + the BoP lineup
        #    read by colour in the judging surface (these objects aren't owned by a
        #    Part, so they'd otherwise fall to the neutral-grey unmatched bucket).
        #    Keyed by the object-name suffix/role (canopy green, LED white-blue). ──
        if nm.startswith("u_gr_"):
            obj.data.materials.clear()
            # The LED panel lit FACE glows (emissive) so the lit tiers are
            # unmistakable; its thin housing frame ("_ledhouse") stays a matte
            # dark fixture body. Everything else flat-matte by sub-part role.
            if "_ledpanel" in nm:
                obj.data.materials.append(_emissive((0.74, 0.86, 1.00)))
            else:
                obj.data.materials.append(_matte(_inspect_panelarray_colour(nm)))
            n_equip += 1
            continue
        # ── TOWER-MACHINE geometry (u_tm_*) → flat matte by role: tower/nacelle
        #    light grey, blades white, hub/yaw grey, foundation concrete, BoP by
        #    role. Routed cables (u_tm_route_) keep their copper colour. These
        #    objects aren't owned by a Part, so they'd otherwise fall to the
        #    neutral-grey unmatched bucket. ──
        if nm.startswith("u_tm_"):
            if nm.startswith("u_tm_route_"):
                tm_colour = (1.00, 0.50, 0.05)   # cable run = copper-orange
            else:
                tm_colour = _inspect_towermachine_colour(nm)
            obj.data.materials.clear()
            obj.data.materials.append(_matte(tm_colour))
            n_equip += 1
            continue
        # ── AERO-BODY geometry (u_aero_*) → flat matte by role: fuselage/bus light
        #    grey, wing/structure grey, solar dark blue, props dark, antennas light
        #    grey, thrusters copper. Covers BOTH the airframe builders' fixed names
        #    AND the binned-part glyphs (u_aero_p_*). Routed aero cables (u_aero_route_)
        #    keep their copper colour (matched by _p_? no — handled here as copper). ──
        if nm.startswith("u_aero_"):
            if nm.startswith("u_aero_route_"):
                ar_colour = (1.00, 0.50, 0.05)   # cable harness = copper-orange
            else:
                ar_colour = _inspect_aero_colour(nm)
            obj.data.materials.clear()
            obj.data.materials.append(_matte(ar_colour))
            n_equip += 1
            continue
        # ── Access / connection STEEL → deliberate mid structural-grey ──
        #    Platforms, caged ladders, nozzle stubs + manways. Some of these carry
        #    a VESSEL prefix (so they'd inherit the vessel skin from the fallback
        #    below) and some carry no part prefix at all (u_ladhoop_/u_ladstr_/
        #    u_stub_, which would fall to the neutral-grey unmatched bucket). Both
        #    are intentional steelwork — colour them explicitly BEFORE the part
        #    fallback so they read as steel and leave the unmatched count. ──
        if "watersurf" in nm:                    # open-tank water surface → dark teal
            obj.data.materials.clear()
            obj.data.materials.append(_matte((0.10, 0.34, 0.42)))
            n_equip += 1
            continue
        if INSPECT_ACCESS_STEEL_RE.search(nm):
            obj.data.materials.clear()
            obj.data.materials.append(_matte(INSPECT_ACCESS_STEEL_COLOUR))
            n_equip += 1
            continue
        # ── Equipment → flat matte colour by the owning part's TYPE ──
        colour = None
        for pref, c in pref_colour:
            if nm.startswith(pref):
                colour = c
                break
        if colour is None:
            # Not a part, not frame, not a route (e.g. a stray helper) — give it a
            # neutral light grey so it never renders black on the light deck.
            colour = INSPECT_DEFAULT_COLOUR
            n_unmatched += 1
        else:
            n_equip += 1
        obj.data.materials.clear()
        obj.data.materials.append(_matte(colour))

    print(f"[univ][inspect] recoloured equip={n_equip} frame={n_frame} "
          f"pipe={n_pipe} rack={n_rack} unmatched={n_unmatched}")
    return {"equip": n_equip, "frame": n_frame, "pipe": n_pipe,
            "rack": n_rack, "unmatched": n_unmatched}


def add_inspection_lights():
    """Bright, EVEN, shadowless world + fills for the CAD-inspection pass, on a
    LIGHT neutral-grey background with a NON-AgX view transform (AgX desaturates +
    darkens these mid values into a muddy wash). Standard preferred; Filmic only
    as a fallback if Standard is unavailable. Reuses the same shadowless area-fill
    philosophy as add_flat_lights but tuned BRIGHT for a white-ish deck."""
    scene = bpy.context.scene

    # Light neutral-grey world (~0.85 display) — the "paper" of the CAD drawing.
    world = bpy.data.worlds.new("world_inspect")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*fl._to_linear((0.85, 0.85, 0.87)), 1.0)
    bg.inputs["Strength"].default_value = 1.0

    # View transform: Standard (or Filmic-low) — NEVER AgX for this pass.
    chosen = None
    for vt in ("Standard", "Filmic"):
        try:
            scene.view_settings.view_transform = vt
            chosen = vt
            break
        except (TypeError, ValueError):
            continue
    if chosen == "Filmic":
        # Filmic darkens; nudge exposure up + pick the flattest look so it reads
        # close to Standard's bright, low-contrast CAD appearance.
        try:
            scene.view_settings.look = "Filmic - Very Low Contrast"
        except (TypeError, ValueError):
            pass
        scene.view_settings.exposure = 0.6
    else:
        scene.view_settings.exposure = 0.0
    try:
        scene.view_settings.gamma = 1.0
    except (AttributeError, TypeError):
        pass

    # Even, soft, SHADOWLESS fill from above + four sides — no sun, no shadows.
    # A high world strength already lifts ambient; these add gentle modelling so
    # cylinders/boxes don't read perfectly flat. Aimed at world origin (the
    # cameras frame the bbox; lights need only be roughly centred + large).
    for nm, loc, energy in [
        ("ins_fill_top",   (0.0, 0.0, 60.0), 140),
        ("ins_fill_front", (0.0, -55.0, 30.0), 80),
        ("ins_fill_back",  (0.0, 55.0, 30.0), 70),
        ("ins_fill_left",  (-55.0, 0.0, 30.0), 80),
        ("ins_fill_right", (55.0, 0.0, 30.0), 70),
    ]:
        bpy.ops.object.light_add(type="AREA", location=loc)
        a = bpy.context.active_object
        a.name = nm
        a.data.energy = energy
        a.data.size = 80.0
        d = (-loc[0], -loc[1], -loc[2])
        a.rotation_euler = mathutils_vec(d).to_track_quat("-Z", "Y").to_euler()
        try:
            a.data.use_shadow = False
        except AttributeError:
            pass

    # A DOMINANT directional SUN with shadows OFF (Tristan 2026-06-22: "no shading … all
    # blobby"). It shades every surface by its NORMAL — a clear light→dark gradient across a
    # cylinder/sphere so equipment reads as SOLID 3-D FORM, not a flat silhouette — while
    # use_shadow=False keeps the deck free of the cast shadow-lines that read as stray pipes.
    bpy.ops.object.light_add(type="SUN", location=(0.0, 0.0, 90.0))
    _sun = bpy.context.active_object
    _sun.name = "ins_sun"
    _sun.data.energy = 3.2
    for _a, _v in (("use_shadow", False), ("angle", 0.15)):
        try:
            setattr(_sun.data, _a, _v)
        except (AttributeError, TypeError):
            pass
    _sun.rotation_euler = mathutils_vec((-0.55, -0.7, -1.0)).to_track_quat("-Z", "Y").to_euler()

    # Force every Eevee shadow flag OFF (no cast shadows anywhere); keep AO for a
    # touch of crevice definition. Fast settings (32-64 samples) for judging speed.
    eevee = getattr(scene, "eevee", None)
    if eevee is not None:
        for attr in ("use_shadow", "use_shadows", "use_shadow_high_bitdepth",
                     "use_soft_shadows"):
            try:
                setattr(eevee, attr, False)
            except (AttributeError, TypeError):
                continue
        for attr, val in (("use_gtao", True), ("gtao_distance", 0.3),
                          ("gtao_factor", 0.6), ("use_bloom", False),
                          ("taa_render_samples", 48)):
            try:
                setattr(eevee, attr, val)
            except (AttributeError, TypeError):
                continue
    return chosen


def mathutils_vec(t):
    """Local import shim (mathutils is Blender-only) → a Vector."""
    return __import__("mathutils").Vector(t)


def _scene_bbox_excluding(prefixes):
    """Scene bbox (metres) over all MESH objects whose name does NOT start with any
    of `prefixes`. Used by the HERO camera to ignore context geometry (a faint
    aircraft ground plane, a satellite drag-sail) that would otherwise inflate the
    frame and shrink the actual vehicle. Returns (cx,cy,cz, dx,dy,dz) or None."""
    import mathutils
    pre = tuple(prefixes or ())
    xs, ys, zs = [], [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data is None:
            continue
        if pre and obj.name.startswith(pre):
            continue
        for c in obj.bound_box:
            w = obj.matrix_world @ mathutils.Vector(c)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        return None
    xmn, xmx = min(xs), max(xs)
    ymn, ymx = min(ys), max(ys)
    zmn, zmx = min(zs), max(zs)
    return ((xmn + xmx) / 2, (ymn + ymx) / 2, (zmn + zmx) / 2,
            xmx - xmn, ymx - ymn, zmx - zmn)


def render_inspection(out_dir, bbox):
    """Render the four CLEAN CAD-inspection views (iso / top / front / side),
    each ORTHOGRAPHIC and fit to the scene bbox with a small margin. Bright,
    light-background, flat-matte, shadowless — the fast judging surface. Writes
    inspect-iso.png / inspect-top.png / inspect-front.png / inspect-side.png to
    out_dir. Fast Eevee, 1600×1100. Skips the PDF hero + per-module passes.

    `bbox` is the plant bbox in MM (the place_all return). We fit to the ACTUAL
    geometry bbox (which includes the tall frame + stacks) via compute_scene_bbox
    so nothing is cropped, regardless of archetype."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene

    # Speed + light-mode output settings.
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False  # solid light world behind the plant

    # Fit to the TRUE geometry extent (frame + stacks included), not just the
    # equipment bbox, so tall columns are never clipped. Fall back to the passed
    # mm bbox (converted to metres) if the scene query finds nothing.
    try:
        (xmn, xmx), (ymn, ymx), (zmn, zmx) = fl.compute_scene_bbox()
    except (ValueError, RuntimeError):
        xmn, xmx = bbox["x0"] * fl.MM, bbox["x1"] * fl.MM
        ymn, ymx = bbox["y0"] * fl.MM, bbox["y1"] * fl.MM
        zmn, zmx = 0.0, 8.0
    cx, cy, cz = (xmn + xmx) / 2, (ymn + ymx) / 2, (zmn + zmx) / 2
    dx, dy, dz = xmx - xmn, ymx - ymn, zmx - zmn
    max_dim = max(dx, dy, dz, 1.0)
    margin = 1.10  # 10% breathing room around the plant
    # Iterative visual loop (task #89, visual_converge.py): INSPECT_FRAME_SCALE
    # reframes between rounds — >1 adds breathing room (fixes a CLIPPED / TOO_LARGE
    # render), <1 pulls the camera in (fixes a TOO_SMALL render). Default 1.0 = base.
    try:
        margin *= max(0.6, min(2.0, float(os.environ.get("INSPECT_FRAME_SCALE", "1.0"))))
    except ValueError:
        pass
    radius = max_dim * 3.0  # ortho cameras: distance only sets clipping, not scale

    aspect = scene.render.resolution_x / scene.render.resolution_y  # 1600/1100≈1.45

    def _ortho_scale(width, height):
        """ortho_scale must cover the LARGER of (content width, content height ×
        aspect) so neither axis is cropped in a 1.45:1 frame."""
        return max(width, height * aspect) * margin

    # The bbox-FIT iso ortho_scale (fits the whole plant + frame). The hero camera
    # below reuses the same view direction but a SMALLER ortho_scale so equipment
    # detail (nozzles / trays / rack / cable bus) reads — a "pulled-closer" iso.
    iso_scale = _ortho_scale(math.hypot(dx, dy), dz + math.hypot(dx, dy) * 0.5)
    HERO_ZOOM = 0.70  # hero fills the frame at 0.70× the bbox-fit scale (≈1.43× bigger)

    # ── HERO framing ── default: a "pulled-closer" iso biased down to the deck
    # equipment. A placer (e.g. the aero family) may set _HERO_HINT to reframe a
    # free-space vehicle TIGHT + centred and to EXCLUDE context geometry (ground
    # plane / drag-sail) from the framing bbox so the vehicle is not lost in a void.
    hero_cx, hero_cy = cx, cy
    hero_target_z = zmn + dz * 0.30
    hero_dx, hero_dy, hero_dz = dx, dy, dz
    hero_zoom = HERO_ZOOM
    hint = _HERO_HINT
    if hint:
        ex = _scene_bbox_excluding(hint.get("exclude_prefixes"))
        if ex is not None:
            hero_cx, hero_cy, _hcz, hero_dx, hero_dy, hero_dz = ex
            hero_target_z = (_hcz - hero_dz / 2.0) + hero_dz * hint.get("center_z_frac", 0.5)
        else:
            hero_target_z = zmn + dz * hint.get("center_z_frac", 0.5)
        hero_zoom = hint.get("zoom", HERO_ZOOM)
    # hero ortho_scale fits the (possibly vehicle-only) hero bbox at the hero zoom
    hero_iso_scale = _ortho_scale(math.hypot(hero_dx, hero_dy),
                                  hero_dz + math.hypot(hero_dx, hero_dy) * 0.5)
    hero_radius = max(hero_dx, hero_dy, hero_dz, 1.0) * 3.0

    cams = [
        # HERO — 3/4 isometric pulled CLOSER (same elev ~35° / az ~45° as the iso,
        # ortho_scale shrunk by the hero zoom so the subject fills the frame + detail
        # reads). Tristan judges visually (2026-06-10): the bbox-fit iso made the
        # plant/vehicle look small + lost the detail. KEEP the bbox-fit iso too.
        {
            "name": "inspect-hero",
            "loc": (hero_cx + hero_radius * 0.60, hero_cy - hero_radius * 0.60,
                    hero_target_z + hero_radius * 0.55),
            "target": (hero_cx, hero_cy, hero_target_z),
            "ortho_scale": hero_iso_scale * hero_zoom,
        },
        # Isometric 3/4 from a high angle (elev ~35°, azimuth ~45°) that sees INTO
        # the plant. ortho_scale from the plant's diagonal footprint + height.
        {
            "name": "inspect-iso",
            "loc": (cx + radius * 0.62, cy - radius * 0.62, cz + radius * 0.70),
            "target": (cx, cy, cz),
            "ortho_scale": iso_scale,
        },
        # Top orthographic (plan) — looking straight down −Z.
        {
            "name": "inspect-top",
            "loc": (cx, cy, zmx + radius),
            "target": (cx, cy, cz),
            "ortho_scale": _ortho_scale(dx, dy),
        },
        # Front elevation orthographic — looking along +Y (from −Y toward +Y).
        {
            "name": "inspect-front",
            "loc": (cx, ymn - radius, cz),
            "target": (cx, cy, cz),
            "ortho_scale": _ortho_scale(dx, dz),
        },
        # Right-side elevation orthographic — looking along −X (from +X).
        {
            "name": "inspect-side",
            "loc": (xmx + radius, cy, cz),
            "target": (cx, cy, cz),
            "ortho_scale": _ortho_scale(dy, dz),
        },
    ]

    # STAGE 1 LINEAR LAYOUT (BLENDER_LINEAR_LAYOUT=1): add a dedicated LINE camera
    # that frames the WHOLE long-thin row broadside (looking along +Y from in front,
    # the row running left→right across the frame) so the single-row process order
    # is unmistakable. The standard iso/top/front cameras already auto-fit to the
    # row's bbox; this one is the canonical "down-the-line" elevation. Same bright
    # materials + lighting as the rest of the inspection set (only the camera differs).
    if LINEAR_LAYOUT_ON:
        # ortho_scale must span the full ROW LENGTH (dx) — _ortho_scale already takes
        # the larger of (width, height×aspect), so passing (dx, dz) frames the length.
        line_scale = _ortho_scale(dx, dz)
        line_radius = max(dx, dy, dz, 1.0) * 3.0
        cams.append({
            # broadside elevation, lifted a touch off the deck so cylindrical parts
            # read as 3-D (a tiny down-tilt) while the row stays left→right.
            "name": "inspect-line",
            "loc": (cx, ymn - line_radius, cz + dz * 0.25),
            "target": (cx, cy, cz),
            "ortho_scale": line_scale,
        })

    for cam in cams:
        fl.clear_cameras()
        c = fl.setup_camera(cam["loc"], cam["target"], cam["ortho_scale"], focal=50)
        # Generous clip range so a big plant is never near/far-plane clipped.
        c.data.clip_start = max(0.01, radius * 0.001)
        c.data.clip_end = radius * 8.0
        out_path = os.path.join(out_dir, cam["name"] + ".png")
        scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)
        print(f"[univ][inspect] wrote {out_path}  "
              f"(ortho_scale={cam['ortho_scale']:.1f} m)")


def load_state(path):
    with open(path, "r") as f:
        return json.load(f)


def parse_argv():
    argv = sys.argv
    after = argv[argv.index("--") + 1:] if "--" in argv else []
    state_path = (after[0] if after else os.environ.get("STATE_JSON")
                  or "out/oxccu-saf-v21/state.json")
    out_dir = os.environ.get("BLENDER_OUT_DIR",
                             str(Path(__file__).resolve().parent / "out-universal"))
    return state_path, out_dir


def main():
    state_path, out_dir = parse_argv()
    print(f"[univ] state={state_path}")
    print(f"[univ] out  ={out_dir}")
    state = load_state(state_path)

    # Tell connection_sizing the plant SALINITY (for the marine→duplex pipe-material rule). Read
    # from the contract; absent / fresh-water leaves it None so a non-marine plant is unchanged.
    try:
        _csq = ((state.get("orchestratorContract") or state.get("engineeringContract") or {})
                .get("quantities") or {})
        _sal = _csq.get("salinity_ppt")
        _sal = _sal.get("value") if isinstance(_sal, dict) else _sal
        cs._PLANT_SALINITY_PPT = float(_sal) if _sal is not None else None
    except (TypeError, ValueError):
        cs._PLANT_SALINITY_PPT = None

    # Default the HERO-framing hint to None so a non-aero family always uses the
    # standard deck-equipment hero (only the aero placer opts into a custom frame).
    # Guards against a stale hint if the interpreter is ever reused across runs.
    global _HERO_HINT
    _HERO_HINT = None

    fl.init_scene()
    MAT = fl.make_default_palette()

    # 1. extract physical parts
    parts, dropped = extract_parts(state)
    print(f"[univ] physical parts kept = {len(parts)}; "
          f"non-physical dropped = {len(dropped)}")
    if dropped:
        print(f"[univ] dropped: {', '.join(dropped)}")

    # Fix 4: cap undimensioned-height columns/towers/stacks to TALL_CAP_FACTOR ×
    # the tallest DIMENSIONED vessel, so a silent default can't become a spike.
    cap = compute_undim_tall_cap(parts)
    undim_tall = [p.name for p in parts
                  if p.shape in _CAPPABLE_TALL_SHAPES
                  and _dimensioned_height_mm(p) is None]
    print(f"[univ] undimensioned-tall cap = "
          f"{(cap/1000 if cap else float('inf')):.1f} m "
          f"(= {TALL_CAP_FACTOR}× tallest dimensioned vessel); "
          f"capped parts: {undim_tall or 'none'}")

    # 2. order regions in process flow
    contract = state.get("orchestratorContract", {}) or {}
    base_topology = contract.get("topology", []) or []
    quantities = contract.get("quantities", {}) or {}
    # ── LEDGER DRIVES THE CONNECTIONS (Tristan 2026-06-20) ───────────────────────────
    # The contract authors the process topology; the universal completion closes the
    # graph (the recirc loop's return leg, every part's required power/signal/service
    # ties). Then connection_ledger.finalize_ledger is the AUTHORITY: it validates that
    # EVERY edge resolves to a real placed part (no nothing-to-nothing pipes), drops
    # spurious dry-ancillary water/thermal ties to a tank, and dedupes per (from,to,svc).
    # Blender renders EXACTLY this authored list and measures its lengths — it never
    # invents a connection the ledger did not author. The authoritative graph is written
    # to connection-ledger.json (which part → what → with what); the BoM costs THAT.
    _candidate = list(base_topology) + augment_topology_cross_module(state, base_topology, parts)
    _candidate = _candidate + augment_topology_connect_orphans(state, _candidate, parts)
    # UNIVERSAL direction-closer: the orphan connector gives each part an OUTPUT only; this
    # adds the missing INPUT to every flow-through part from its nearest process-upstream
    # source, so the graph is complete (serial, not a star, not a guess).
    _candidate = _candidate + cl.close_flow_directions(parts, _candidate, log=lambda m: print(m))
    # air-movers (blower/fan) feed their aeration consumer by an AIR line, not a water tie
    # to the tank; sub-components (screen/backwash/media) tie to their PARENT, not the tank.
    _candidate = _candidate + cl.close_air_directions(parts, _candidate, log=lambda m: print(m))
    # O₂ actuators (emergency-O₂ solenoid + diffuser, dissolved-O₂ control valve) that have
    # no process feed are supplied from their nearest O₂ source (LOX/oxygen-supply/header)
    # by an OXYGEN line — the physically-correct tie, so they stop reading as missing_input.
    _candidate = _candidate + cl.close_oxygen_directions(parts, _candidate, log=lambda m: print(m))
    # WET-plant signal (M1, 2026-06-23): the design carries a process-FLUID topology iff
    # any candidate edge is a fluid service. Bind it onto the required-services classifier
    # so the power-direction closer + the completeness audit agree that a DRY archetype
    # (satellite / aero / BESS / generic_assembly — no fluid edges) needs NO process water,
    # rather than flagging/closing a spurious water tie. Physical signal (fluid edges),
    # never an archetype-name string. A RAS / wet plant has fluid edges → wet → unchanged.
    _plant_is_wet = any(_edge_service(e.get('mechanism')) == 'water' for e in _candidate)

    def _required_services_wet(name, module, function):
        return _REQUIRED_SERVICES(name, module, function, _plant_is_wet)
    # every part that REQUIRES power but shows no supply gets a feed from the distribution
    # hub — closes the completeness audit's 'missing [power]' concern (e.g. a blower with
    # no power feed). Uses the SAME _REQUIRED_SERVICES the audit reads, so it fills exactly
    # the gaps the audit flags.
    _candidate = _candidate + cl.close_power_directions(parts, _candidate, _required_services_wet,
                                                        log=lambda m: print(m))
    _candidate = _candidate + cl.close_subcomponents(parts, _candidate, log=lambda m: print(m))
    # final boundary connector: sinks fed from their producer + discharged to disposal;
    # feed-stage/product units with no in-plant neighbour tied to the battery limit.
    _candidate = _candidate + cl.close_boundaries(parts, _candidate, log=lambda m: print(m))
    # FINAL self-healing net — whatever the strict completeness audit would STILL flag is
    # terminated to its nearest in-plant partner (else the battery limit), so EVERY part
    # shows each required input + output and the ledger is provably complete. Driven by the
    # same audit it satisfies (Tristan 2026-06-24: "all connector points are connected").
    _candidate = _candidate + cl.close_residual_completeness(parts, _candidate,
                                                             _required_services_wet, log=lambda m: print(m))
    topology, _ledger_dropped = cl.finalize_ledger(_candidate, parts, resolve_endpoint,
                                                   log=lambda m: print(m))
    # STRICT completeness gate — every part must SHOW its required input + output (Tristan
    # 2026-06-20). A concern = a part not fully connected; it is written to the ledger
    # artifact so the deterministic suite can FAIL on it (no 80%-coverage absorption).
    _ledger_concerns = cl.audit_completeness(parts, topology, _required_services_wet,
                                             log=lambda m: print(m))
    # Per-part adjacency (the traceable "which part connects to what") + referential
    # integrity (every reference names a real part on both ends) — Tristan 2026-06-20.
    _ledger_adj = cl.build_adjacency(topology)
    _ledger_integrity = cl.audit_referential_integrity(
        topology, {p.name for p in parts}, log=lambda m: print(m))
    try:
        _ledger_path = os.path.join(out_dir, "connection-ledger.json")
        with open(_ledger_path, "w") as _lf:
            json.dump({"schema": "connection-ledger/1", "count": len(topology),
                       "note": "Ledger-authored connections (part→part→service). Blender "
                               "measures the lengths; the BoM costs these. `adjacency` is "
                               "the per-part trace (inputs/outputs by name).",
                       "rows": cl.ledger_rows(topology),
                       "dropped": [{"from": d[0], "to": d[1], "mechanism": d[2], "reason": d[3]}
                                   for d in _ledger_dropped],
                       "completeness": {"n_concerns": len(_ledger_concerns),
                                        "concerns": _ledger_concerns},
                       "adjacency": _ledger_adj,
                       "referential_integrity": {"n_violations": len(_ledger_integrity),
                                                  "violations": _ledger_integrity}},
                      _lf, indent=1)
        print(f"[ledger] wrote connection-ledger.json — {len(topology)} authored "
              f"connection(s), {len(_ledger_dropped)} dropped, "
              f"{len(_ledger_concerns)} completeness concern(s), "
              f"{len(_ledger_integrity)} integrity violation(s) → {_ledger_path}")
    except Exception as _le:
        print(f"[ledger] WARN could not write connection-ledger.json: {_le}")
    regions, region_edges = order_regions(parts, topology)
    print(f"[univ] region order (L->R): {regions}")

    # 3. module dict for the render pipeline (real module ids + structure)
    module_ids = sorted(set(p.module_id for p in parts) | {STRUCTURE_MODULE_ID,
                        "mass_fluid_transport_process"})
    MO = fl.make_module_dict(module_ids)

    # 4-6. GEOMETRY-FAMILY DISPATCH — pick + run the placement strategy:
    #      aero_body (FLIGHT VEHICLE: a HAPS aircraft or a satellite in FREE SPACE —
    #      central fuselage/bus + wings/solar-arrays + props/thrusters + antennas, NO
    #      skid/container), tower_machine (WIND TURBINE: tower + nacelle + 3-blade
    #      rotor + foundation + base BoP, free-standing), panel_array (VF: rows of
    #      multi-tier grow racks + canopy + LED panels + climate/nutrient BoP),
    #      rack_farm (battery OR compute: rows of racks in a container + BoP lineup +
    #      bus/coolant runs), or process_plant (the default: regions on an open skid +
    #      overhead pipe rack). All return the SAME tuple so the INSPECT/PDF render
    #      below is common.
    modules = state.get("moduleDecomposition", {}).get("modules", [])
    product_class = product_class_of(state)
    family = detect_geometry_family(parts, modules, product_class)
    _route_log_reset()   # fresh route log so audit_routes() sees only this run
    if LINEAR_LAYOUT_ON:
        # STAGE 1 (BLENDER_LINEAR_LAYOUT=1) — universal DETERMINISTIC linear layout:
        # every part in ONE row along +X in process order. Bypasses the family
        # placers, skid frame, pipe rack and routing (those belong to the later
        # fold/wire stages). Returns the same 5-tuple so the render below is common.
        print(f"[univ] BLENDER_LINEAR_LAYOUT=1 — overriding the '{family}' placer "
              f"with the Stage-1 single-row linear layout")
        bbox, region_centres, frame_h, routed, unresolved = place_all_linear(
            parts, MAT, MO)
    elif family == "aero_body":
        global _AERO_QUANTITIES
        _AERO_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_aero_body(
            parts, regions, topology, MAT, MO, subtype=_AERO_SUBTYPE)
    elif family == "tower_machine":
        global _TOWERMACHINE_QUANTITIES
        _TOWERMACHINE_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_tower_machine(
            parts, regions, topology, MAT, MO)
    elif family == "panel_array":
        global _PANELARRAY_QUANTITIES
        _PANELARRAY_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_panel_array(
            parts, regions, topology, MAT, MO)
    elif family == "rack_farm":
        global _RACKFARM_QUANTITIES
        _RACKFARM_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_rack_farm(
            parts, regions, topology, MAT, MO)
    elif family == "generic_assembly":
        global _GA_QUANTITIES
        _GA_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_generic_assembly(
            parts, regions, topology, MAT, MO)
    else:
        bbox, region_centres, frame_h, routed, unresolved = place_process_plant(
            parts, regions, topology, MAT, MO)

    # ── STAGE 4 GROUND SLAB — the FLOOR the plant sits on ──
    # Tristan 2026-06-21: the universal render had "everything floating in the air, no
    # floor showing". Lay a concrete deck under the plant (top at DECK_Z_MM, the datum
    # every part sits on) so the equipment visibly stands ON a floor. SKIPPED for the
    # FREE-SPACE families: an aircraft/satellite (aero_body) floats with its own faint
    # context ground plane, and a wind turbine (tower_machine) springs from its own
    # foundation pad — a deck slab under either would be wrong. ON for the deck-standing
    # families (process_plant, generic_assembly, rack_farm, panel_array) + the linear
    # row. Opt out with BLENDER_GROUND_SLAB=0. Universal — footprint-keyed, additive.
    _NO_SLAB_FAMILIES = ("aero_body", "tower_machine")
    _slab_on = os.environ.get("BLENDER_GROUND_SLAB", "1").strip().lower() \
        not in ("0", "false", "no", "off")
    if _slab_on and (LINEAR_LAYOUT_ON or family not in _NO_SLAB_FAMILIES):
        try:
            add_ground_slab(parts, MAT, MO, bbox_mm=bbox)
        except Exception as _ge:    # the floor is additive — never fail the whole render
            print(f"[univ][ground] WARN add_ground_slab skipped: {_ge}")
    elif not _slab_on:
        print("[univ][ground] BLENDER_GROUND_SLAB=0 — floor suppressed")
    else:
        print(f"[univ][ground] floor skipped for free-space family '{family}'")

    # EXTERNAL service connections (water-in / effluent-out / power) crossing the plant edge —
    # HERO-ONLY (not _INSPECT_MODE) so the chain's technical render/ledger is unchanged.
    if not _INSPECT_MODE:
        try:
            draw_boundary_services(parts, MAT, MO)
        except Exception as _be:
            print(f"[univ][boundary] skipped: {_be}")
    # NOTE: the BUILDING ENVELOPE is NOT built here — it is added as a SECOND render pass in the
    # INSPECT=0 branch (interior first, then shell + exterior) so BOTH drawings come from the
    # SAME scene build. Rendering them as two separate processes gave different layouts (the
    # placement is not deterministic across processes), so the water services landed in different
    # places between the exterior + interior drawings (Tristan 2026-06-22).

    # ── STAGE 2 (4-stage connection-points plan) — NAMED IN/OUT CONNECTION PORTS ──
    # Now that every part is PLACED (placed_xyz_mm + anchors set above by whichever
    # placer ran — the Stage-1 linear row OR a production family placer), give each
    # part its named connection ports from the LEDGER adjacency + its placed centre +
    # dims, and store the tip/face coordinates on part.ports for Stage-3 wiring. This is
    # layout-agnostic (fires for ANY placer) and universal (ports derive from the ledger
    # services, not per-class). It only ADDS short stubs / small terminals + records
    # their coordinates — it routes NO pipe (Stage 3) and moves NO part (Stage 4).
    # Default ON (ports are always wanted); set BLENDER_CONNECTION_PORTS=0 to suppress.
    _ports_on = os.environ.get("BLENDER_CONNECTION_PORTS", "1").strip().lower() \
        not in ("0", "false", "no", "off")
    if _ports_on:
        try:
            add_connection_ports(parts, MAT, MO, _ledger_adj)
        except Exception as _pe:    # ports are additive — never fail the whole render
            print(f"[univ][ports] WARN add_connection_ports skipped: {_pe}")
        # OPT-IN verification dump (BLENDER_DUMP_PORTS=1): write every part's ports dict
        # to ports-debug.json so Stage 2 can be inspected without a Blender session. Pure
        # diagnostic — never written in production. The KEY deliverable (part.ports) is the
        # in-memory record Stage 3 consumes; this just serialises it for review.
        if os.environ.get("BLENDER_DUMP_PORTS", "").strip().lower() in ("1", "true", "yes", "on"):
            try:
                _dump = {p.name: {k: [round(float(c), 1) for c in v]
                                  for k, v in (p.ports or {}).items()}
                         for p in parts if getattr(p, "ports", None)}
                with open(os.path.join(out_dir, "ports-debug.json"), "w") as _pf:
                    json.dump({"schema": "ports-debug/1",
                               "n_parts_with_ports": len(_dump),
                               "n_ports_total": sum(len(v) for v in _dump.values()),
                               "ports": _dump}, _pf, indent=1)
                print(f"[univ][ports] BLENDER_DUMP_PORTS=1 → wrote ports-debug.json "
                      f"({len(_dump)} parts)")
            except Exception as _de:
                print(f"[univ][ports] WARN ports-debug dump failed: {_de}")
    else:
        print("[univ][ports] BLENDER_CONNECTION_PORTS=0 — Stage-2 ports suppressed")

    # ── STAGE 3/4 (4-stage connection-points plan) — WIRE THE LINE PORT-TO-PORT ──
    # Route EVERY ledger edge as a real pipe from the source part's <service>_out port
    # to the destination part's <service>_in port (the coordinates Stage 2 stored on
    # part.ports), so the laid-out parts read as ONE long connected line with nothing
    # floating, and collect each run's real routed length (→ wired-lengths.json) for
    # the velocity / volt-drop / cost maths.
    #
    # STAGE 4 (2026-06-21): now DEFAULT-ON for the PRODUCTION compact layout — but ONLY
    # for the families whose placer routes through the DEFERRING route_topology path
    # (process_plant + generic_assembly) or the linear row (which draws no pipe itself).
    # For those, route_topology already deferred the part-to-part edges (see
    # _SPINE_DRAWN_EDGE_IDS), so wire_ports is the SOLE drawer of them — port-to-port,
    # no double-draw. The bespoke-routing families (aero_body / tower_machine /
    # panel_array / rack_farm) draw their OWN specialised runs (aero arms, rack busways,
    # per-rack taps) that are NOT port-based and do NOT participate in the deferral —
    # wiring on top would double-draw, so they stay on their existing routing unless the
    # operator explicitly forces BLENDER_WIRE_PORTS=1. Escape hatch BLENDER_WIRE_PORTS=0
    # restores pure centre-based routing everywhere.
    # Runs through _draw_run, so each wired run is sized + scheduled + audited like any
    # routed run (audit_routes / reconcile_route_specs / write_connection_schedule below
    # therefore include the wired runs). Requires Stage-2 ports.
    _PORT_WIRING_FAMILIES = ("process_plant", "generic_assembly")
    _wire_flag = _wire_ports_on(LINEAR_LAYOUT_ON)
    _explicit = os.environ.get("BLENDER_WIRE_PORTS", "").strip().lower() in (
        "1", "true", "yes", "on")
    # Family participates in port-to-port wiring when it deferred (process_plant /
    # generic_assembly), under the linear layout, OR the operator forced it explicitly.
    _family_wires = (LINEAR_LAYOUT_ON or family in _PORT_WIRING_FAMILIES or _explicit)
    if _ports_on and _wire_flag and _family_wires:
        try:
            wire_ports(parts, topology, MAT, MO, out_dir=out_dir)
        except Exception as _we:   # additive — never fail the whole render
            print(f"[univ][wire] WARN wire_ports skipped: {_we}")
        try:
            audit_connection_geometry(parts)   # prove every line lands on a part at both ends
        except Exception as _ae:
            print(f"[univ][conn-audit] skipped: {_ae}")
    elif not _ports_on:
        print("[univ][wire] STAGE 3/4 skipped — Stage-2 ports are off (need ports to wire)")
    elif _wire_flag and not _family_wires:
        print(f"[univ][wire] STAGE 4 port-to-port wiring SKIPPED for family '{family}' "
              f"(bespoke router draws its own runs; set BLENDER_WIRE_PORTS=1 to force)")
    else:
        print("[univ][wire] STAGE 3/4 port-to-port wiring OFF (BLENDER_WIRE_PORTS=0)")

    # ── ROUTE AUDIT — the harsh self-check on the pipe routing (Tristan 2026-06-11).
    # Computes over-equipment segments / max detour ratio / same-elevation crossings
    # from the emitted polylines + equipment footprints; writes route-audit.json.
    route_metrics = audit_routes(parts, out_dir)

    # ── ROUTE → COSTED-SPEC RECONCILIATION (council 2026-06-16) — two routing-cost
    # fixes applied to _CONN_SPECS in place BEFORE the schedule + manifest read them,
    # so the COST and the DRAWINGS are repaired from ONE source: (1) drop fluid pipes
    # routed onto a pure instrument; (2) cap a detour's COSTED length at 2.5× the
    # straight-line endpoint distance + 5 m. Universal + deterministic; a no-op on a
    # plant with no instrument pipes + sane short routes.
    route_reconcile = reconcile_route_specs(parts)

    # ── CONNECTION SCHEDULE (Phase C) — the BoM feedback. Every run was sized at its
    # REAL diameter from its rating; collect the ConnectionSpecs into the distribution
    # schedule (cable-m by CSA, pipe-m by DN, duct-m by size) + flag out-of-spec runs.
    conn_schedule = write_connection_schedule(out_dir)

    # ── PARTS-POSITION MANIFEST — the data the GA + isometric drawings consume.
    # Every part is now placed (placed_xyz_mm + anchors set above); project that
    # into parts-manifest.json. PURE EXPORT — always writes, disturbs nothing on
    # the render / route / schedule paths.
    parts_manifest = write_parts_manifest(out_dir, parts, state)

    # ── ROUTE-WAYPOINT MANIFEST — the data the PIPING ISOMETRIC drawing consumes.
    # Joins the routed polylines (_ROUTE_LOG) to their sized specs (_CONN_SPECS) and
    # writes route-manifest.json (one entry per drawn connection: waypoints + fittings
    # + DN + service + endpoints). PURE EXPORT — gated by ROUTE_SKIP_MANIFEST so a run
    # with vs without proves the renders / route-audit / schedule are unchanged.
    route_manifest = write_route_manifest(out_dir)

    # ── INSPECT MODE (default ON) — the FAST visual-judge surface ──
    # When INSPECT=1 (the loop's default), render the CLEAN CAD-inspection set
    # (bright light deck, flat-matte by part type, de-emphasised frame, four
    # bbox-fit ortho cameras) and SKIP the dark PDF hero + ghosted per-module
    # passes entirely (speed). Set INSPECT=0 to restore the production PDF render.
    inspect = os.environ.get("INSPECT", "1").strip().lower() not in (
        "0", "false", "no", "off", "")
    if inspect:
        print("[univ] INSPECT mode ON — clean CAD-inspection render "
              "(set INSPECT=0 for the PDF pipeline)")
        # 7. flat-matte type colours + de-emphasised wireframe frame.
        skin = apply_inspection_materials(parts)
        # 8. bright light-grey world + shadowless fills + Standard view transform.
        vt = add_inspection_lights()
        print(f"[univ][inspect] view_transform={vt}")
        # 9. four bbox-fit cameras → inspect-{iso,top,front,side}.png.
        render_inspection(out_dir, bbox)
        print("[univ][inspect] DONE — "
              "inspect-iso/top/front/side.png in " + out_dir)
        _inspect_summary = skin
    else:
        # 7. STUDIO lighting — the EXACT visual treatment the bespoke <class>-9shot.py
        #    templates use (Tristan 2026-06-13: "it is just a choice of colour and
        #    lighting and shading and crispness ... nothing to do with the layout").
        #    The bespoke recipe (co2-mineralisation-9shot.py:593-594) is:
        #        fl.add_lights(target_centre=..., fill_energy=240, fill_size=14)
        #        fl.make_world_white()
        #        fl.run_render_pipeline(...)
        #    = a KEY SUN (soft cast shadow, grounds the form) + AREA fills + a
        #    shadow-catcher ground plane + a bright studio world. The old
        #    add_flat_lights (2026-06-10 dark 0.42 shadowless rig) is what made the
        #    universal render dark/muddy vs the bespoke one — the SHAPE_MAT colours are
        #    already saturated, they just rendered dark under the flat rig. Swap in the
        #    bespoke studio rig, sized to THIS scene's bbox. UNIVERSAL — no per-class.
        cx = (bbox["x0"] + bbox["x1"]) / 2 * fl.MM
        cy = (bbox["y0"] + bbox["y1"]) / 2 * fl.MM
        span = max(bbox["x1"] - bbox["x0"], bbox["y1"] - bbox["y0"]) * fl.MM
        fl.add_lights(target_centre=(cx, cy, span * 0.28),
                      fill_energy=240, fill_size=max(14.0, span * 0.6))
        fl.make_world_white()
        # ── #2 SKY ENVIRONMENT (Tristan 2026-06-22) — replace the flat grey world with a
        #    procedural Nishita sky so metals/water reflect a real sky + get graduated ambient
        #    (the single biggest realism jump). Low strength so it lifts + reflects without
        #    blowing out; the add_lights() sun stays the controlled key. Universal, no file.
        _scn = bpy.context.scene
        try:
            _sw = bpy.data.worlds.new("world_sky")
            _scn.world = _sw
            _sw.use_nodes = True
            _nt = _sw.node_tree
            for _n in list(_nt.nodes):
                _nt.nodes.remove(_n)
            _sky = _nt.nodes.new("ShaderNodeTexSky")
            for _a, _v in (("sky_type", "NISHITA"), ("sun_elevation", math.radians(58)),
                           ("sun_rotation", math.radians(130)), ("sun_intensity", 0.25),
                           ("air_density", 1.4), ("dust_density", 1.6)):
                try:
                    setattr(_sky, _a, _v)
                except (AttributeError, TypeError):
                    pass
            _bg = _nt.nodes.new("ShaderNodeBackground")
            _bg.inputs["Strength"].default_value = 0.14   # subtle — just reflection + gradient,
            #                                               not a wash (0.45 blew the metals out)
            _ow = _nt.nodes.new("ShaderNodeOutputWorld")
            _nt.links.new(_sky.outputs[0], _bg.inputs[0])
            _nt.links.new(_bg.outputs[0], _ow.inputs[0])
        except Exception as _we:
            print(f"[univ][render] sky world skipped: {_we}")
        # ── #3 QUALITY (Tristan 2026-06-22) — higher resolution + samples + AO. The early
        #    setup set 2400×1600/64; bump here (nothing resets between) for a crisper final.
        try:
            _scn.render.resolution_x, _scn.render.resolution_y = 3000, 2000
            _ev = getattr(_scn, "eevee", None)
            if _ev is not None:
                for _a, _v in (("taa_render_samples", 160), ("use_gtao", True),
                               ("gtao_distance", 0.6), ("gtao_factor", 1.0)):
                    try:
                        setattr(_ev, _a, _v)
                    except (AttributeError, TypeError):
                        pass
        except Exception as _qe:
            print(f"[univ][render] quality bump skipped: {_qe}")
        # Purge DELETED objects from the module-objects lists — the control-cabinet
        # consolidation + phantom-route deletion removed meshes still referenced in MO, and
        # run_render_pipeline's palette pass would hit a removed StructRNA (ReferenceError).
        def _alive(o):
            try:
                return o.name in bpy.data.objects
            except (ReferenceError, RuntimeError):
                return False
        for _k in list(MO.keys()):
            MO[_k] = [_o for _o in MO[_k] if _alive(_o)]
        # 8. render the production PDF set (hero + per-module) — the INTERIOR LAYOUT (no shell).
        fl.run_render_pipeline(out_dir, MO,
                               structure_module_id=STRUCTURE_MODULE_ID,
                               hero_open_frame=True)
        # 8b. EXTERIOR pass — add the building shell to the SAME scene + render again to a
        #     subdir, so the architectural exterior + the interior layout are the IDENTICAL
        #     plant (two separate processes diverge — placement isn't deterministic across
        #     processes; Tristan 2026-06-22 caught the services in different places). Gated by
        #     BLENDER_PLANT_SHELL=1 so the chain's default render stays interior-only.
        if os.environ.get("BLENDER_PLANT_SHELL", "").strip().lower() in ("1", "true", "yes", "on"):
            try:
                build_plant_shell(parts, MAT, MO)
                for _k in list(MO.keys()):
                    MO[_k] = [_o for _o in MO[_k] if _alive(_o)]
                _extdir = os.path.join(out_dir, "exterior")
                os.makedirs(_extdir, exist_ok=True)
                fl.run_render_pipeline(_extdir, MO,
                                       structure_module_id=STRUCTURE_MODULE_ID,
                                       hero_open_frame=True)
                print(f"[univ][shell] EXTERIOR render set (same layout) → {_extdir}")
            except Exception as _se:
                print(f"[univ][shell] exterior pass skipped: {_se}")
        _inspect_summary = None

    # final summary line for the caller
    print("[univ] SUMMARY "
          + json.dumps({
              "geometry_family": family,
              "aero_subtype": _AERO_SUBTYPE,
              "physical_parts": len(parts),
              "dropped": len(dropped),
              "topology_total": len(topology),
              "topology_routed": routed,
              "topology_unresolved": [u[:3] for u in unresolved],
              "regions": regions,
              "route_audit": route_metrics,
              "route_reconcile": {k: route_reconcile[k] for k in
                                  ("instrument_edges_dropped", "routes_capped",
                                   "length_saved_m", "gbp_saved")},
              "connection_schedule_totals": conn_schedule.get("totals"),
              "parts_manifest_count": parts_manifest.get("count"),
              "route_manifest_count": route_manifest.get("count"),
              "inspect": _inspect_summary,
          }))


if __name__ == "__main__":
    main()
