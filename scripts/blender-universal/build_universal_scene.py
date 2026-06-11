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
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender-templates"))
import forge_blender_lib as fl


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
BANK_COMPACT_GAP_MM = 3600  # clear gap between adjacent compacted bank lanes — a REAL
                            # pipe-rack maintenance AISLE (was 1.6 m, too tight for the
                            # overhead rack spine + lanes; 3.6 m gives the spine a
                            # genuine corridor so cross-laterals only span one bank)
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

# ── 6. Pipe palette by mechanism ───────────────────────────────────────────
# Pipe radius ~1.7× (Tristan 2026-06-10): the runs read as thin wires. 110→190 mm.
PIPE_DIA_MM = 190           # nominal routed-pipe diameter (substantial pipe run)
MECH_COLOUR = {             # sRGB; make_mat handles linear conversion
    "fluid_loop":    (0.42, 0.52, 0.62),   # steel blue-grey
    "thermal":       (0.85, 0.25, 0.20),   # red (hot/steam)
    "electrical_bus":(1.00, 0.45, 0.00),   # copper/orange
    "mechanical":    (0.55, 0.56, 0.60),   # grey
    "data":          (0.30, 0.65, 0.45),   # green
    "control":       (0.55, 0.50, 0.35),   # muted
}
MECH_DEFAULT_COLOUR = (0.50, 0.52, 0.56)

# ── 7. Material palette for the geometry by shape family ───────────────────
SHAPE_MAT = {
    "tall_column":       ("col",      (0.80, 0.82, 0.86), 0.55, 0.34),
    "tall_vessel":       ("reactor",  (0.00, 0.40, 0.95), 0.25, 0.34),
    "vertical_vessel":   ("vessel",   (0.00, 0.72, 0.92), 0.20, 0.35),
    "horizontal_vessel": ("vessel",   (0.00, 0.72, 0.92), 0.20, 0.35),
    "compressor":        ("comp",     (0.10, 0.45, 0.95), 0.45, 0.32),
    "pump":              ("pump",     (1.00, 0.40, 0.00), 0.10, 0.42),
    "tank":              ("tank",     (0.00, 0.55, 0.34), 0.10, 0.44),
    "stack":             ("stack",    (0.50, 0.50, 0.54), 0.45, 0.45),
    "package_box":       ("pkg",      (0.55, 0.40, 0.34), 0.30, 0.52),
    "skid_box":          ("skidbox",  (0.45, 0.62, 0.78), 0.30, 0.42),
    "transformer_box":   ("xfmr",     (0.30, 0.34, 0.40), 0.45, 0.45),
    "cabinet":           ("cab",      (0.20, 0.24, 0.30), 0.45, 0.45),
    "cabinet_small":     ("cabs",     (0.22, 0.26, 0.32), 0.40, 0.45),
    "gantry":            ("gantry",   (0.55, 0.56, 0.60), 0.55, 0.42),
    "inline_spool":      ("spool",    (0.45, 0.70, 0.95), 0.35, 0.30),
    "instrument":        ("instr",    (0.00, 0.92, 0.10), 0.10, 0.45),
    "box":               ("box",      (0.55, 0.56, 0.58), 0.30, 0.50),
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
    r"_neck\b|_flange\b|_manway\b|_ntop\b|_nbot\b",  # vessel nozzle stubs + manway
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
                 "obj_anchor", "placed_xyz_mm", "anchors")

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


def classify_shape(name, form):
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
                shape = classify_shape(name, form)
                parts.append(Part(name, module_id, region_key, rank, shape, dim, qty, form))
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


def token_overlap(a_tokens, b_tokens):
    """Count of shared discriminating tokens, but REQUIRE that distinctive
    qualifier tokens (h2/co2/hot/cold/saf/naphtha) match when present on the
    query — so 'h2_feed_compressor' never resolves onto the CO2 compressor."""
    a, b = set(a_tokens), set(b_tokens)
    DISCRIMINATORS = {"h2", "co2", "hot", "cold", "saf", "naphtha", "recycle",
                      "feed", "product", "tail", "syncrude"}
    qd = a & DISCRIMINATORS
    if qd and not (qd & b):
        return 0  # a required discriminator is absent on the candidate
    return len(a & b)


# ═══════════════════════════════════════════════════════════════════════════
# Geometry construction per part
# ═══════════════════════════════════════════════════════════════════════════

def _mat_for(shape, MAT):
    key, rgb, met, rough = SHAPE_MAT.get(shape, SHAPE_MAT["box"])
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
    # MANWAY: a fat short flanged disc at ~mid height on the +Y face
    mw_r = max(r * 0.55, MANWAY_DIA_MM * fl.MM / 2)
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
        # SQUAT large-diameter cylinder, FLAT bottom on a low plinth, shallow
        # cone/dome roof. Emphatically NOT a sphere.
        body_h = length_mm * fl.MM
        plinth_h = max(0.10, r * 0.10)
        z_bot = base_z_mm * fl.MM + plinth_h
        # ground plinth ring
        fl.add_cyl(f"{nm}_plinth", (x_mm * fl.MM, y_mm * fl.MM, base_z_mm * fl.MM + plinth_h / 2),
                   r * 1.08, plinth_h, steel, module=mod, module_objects=MO)
        shell = fl.add_cyl(f"{nm}_shell", (x_mm * fl.MM, y_mm * fl.MM, z_bot + body_h / 2),
                           r, body_h, mat, module=mod, module_objects=MO)
        # shallow cone roof (frustum, low rise ~0.12 D)
        roof_h = dia_mm * fl.MM * 0.12
        fl.add_frustum(f"{nm}_roof", (x_mm * fl.MM, y_mm * fl.MM, z_bot + body_h + roof_h / 2),
                       r, r * 0.18, roof_h, mat, module=mod, module_objects=MO, vertices=32)
        # wind-girder ring near the top (the API-650 tank cue)
        fl.add_torus(f"{nm}_windgirder", (x_mm * fl.MM, y_mm * fl.MM, z_bot + body_h * 0.82),
                     r + 0.02, max(0.02, r * 0.04), steel, module=mod, module_objects=MO)
        anchors = {"top": (x_mm, y_mm, (z_bot + body_h + roof_h) / fl.MM),
                   "bottom": (x_mm, y_mm, z_bot / fl.MM),
                   "centre": (x_mm, y_mm, (z_bot + body_h / 2) / fl.MM)}
        # Fix 1: a manway + low/high side nozzles read the squat tank as a vessel.
        _add_vessel_nozzles(nm, anchors, dia_mm, "tank", MAT, mod, MO)
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


def resolved_dims_mm(part):
    """Return a concrete (kind, geometry-dict) in MM, from explicit dim if
    present else the type default for the shape. Footprint is used by the
    placer to space parts."""
    shape = part.shape
    d = part.dim
    # cylinder-like dim available
    if d and d["kind"] == "cyl":
        dia = d.get("dia_mm", TYPE_DEFAULTS_MM.get(shape, {}).get("dia", 800))
        ln = d.get("len_mm")
        # Fix 4: a dia-only tall part (no explicit height) gets the type-default
        # height — CAP it so it can't spike past the real dimensioned vessels.
        if ln is None and shape in _CAPPABLE_TALL_SHAPES:
            ln = _capped_default_height(shape)
        return {"shape": shape, "dia_mm": dia, "len_mm": ln,
                "explicit": d.get("len_mm") is not None}
    if d and d["kind"] == "box":
        return {"shape": shape, "w_mm": d["w_mm"], "d_mm": d["d_mm"],
                "h_mm": d["h_mm"], "explicit": True}
    if d and d["kind"] == "area":
        # area → derive a square package footprint (sqrt), height ~ 0.4× side
        side = max(1000.0, math.sqrt(d["area_m2"]) * 1000)
        return {"shape": shape, "w_mm": side, "d_mm": side, "h_mm": side * 0.45,
                "explicit": True}
    # no explicit dim → type default
    td = dict(TYPE_DEFAULTS_MM.get(shape, TYPE_DEFAULTS_MM["box"]))
    # Fix 4: clamp an undimensioned column/tower/stack's default height.
    if shape in _CAPPABLE_TALL_SHAPES and "height" in td:
        td["height"] = _capped_default_height(shape)
    td["shape"] = shape
    td["explicit"] = False
    return td


def _capped_default_height(shape):
    """The TYPE_DEFAULTS height for `shape`, clamped to the scene cap (Fix 4)."""
    base = TYPE_DEFAULTS_MM.get(shape, {}).get("height", 9000)
    if _UNDIM_TALL_CAP_MM is not None:
        return min(base, _UNDIM_TALL_CAP_MM)
    return base


def footprint_mm(rd):
    """(footprint_x_mm, footprint_y_mm, top_z_mm-ish height) for spacing."""
    shape = rd["shape"]
    if shape in ("tall_column", "tall_vessel", "vertical_vessel", "tank", "stack"):
        dia = rd.get("dia_mm", 800)
        h = rd.get("len_mm") or rd.get("height", TYPE_DEFAULTS_MM[shape].get("height", 3000))
        return dia, dia, h
    if shape == "horizontal_vessel":
        dia = rd.get("dia_mm", 700)
        ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["length"]
        return ln, dia * 1.8, dia
    if shape in ("compressor", "pump", "package_box", "skid_box",
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
    mat, _ = _mat_for(shape, MAT)
    mod = part.module_id
    rd = resolved_dims_mm(part)
    nm = "u_" + re.sub(r"[^a-z0-9]+", "_", part.name.lower()).strip("_")[:40]

    # ── PROCESS VESSELS: shell + dished heads + kind-specific support ──
    if shape in _VESSEL_KIND:
        kind = _VESSEL_KIND[shape]
        if shape == "tank":
            dia = rd.get("dia_mm", 3000)
            ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["height"]
        elif shape == "horizontal_vessel":
            dia = rd.get("dia_mm", 700)
            ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape]["length"]
        else:
            dia = rd.get("dia_mm", 800)
            ln = rd.get("len_mm") or TYPE_DEFAULTS_MM[shape].get("height", 3000)
        asm, anchors = build_vessel(nm, kind, dia, ln, x_mm, y_mm, base_z_mm, mat,
                                    mod, MO, MAT, lagged=(shape in _LAGGED_SHAPES))
        if shape == "tall_column":  # add visible tray rings up the column
            _add_tray_rings(nm, anchors, dia, MAT, mod, MO)
        # Fix 3: access platforms + caged ladder on tall columns/towers.
        if shape in ("tall_column", "tall_vessel"):
            _add_platforms_and_ladder(nm, anchors["top"], anchors["bottom"],
                                      dia, MAT, mod, MO)
        return asm, anchors

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

    if shape in ("compressor", "pump"):
        w = rd.get("w_mm", TYPE_DEFAULTS_MM[shape]["w"])
        h = rd.get("h_mm", TYPE_DEFAULTS_MM[shape]["h"])
        body_d = max(400, h * 0.7)
        asm, anchors = build_machine(nm, body_d, w, x_mm, y_mm, base_z_mm, mat,
                                     mod, MO, MAT)
        return asm, anchors

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
    big_dx, _ = _shelf_pack(big, x_left, big_y, target_width, DECK_Z_MM,
                            PART_GAP_MM, MAT, MO, y_dir=+1)
    med_dx, _ = _shelf_pack(medium, x_left, med_y, target_width, DECK_Z_MM,
                            PART_GAP_MM, MAT, MO, y_dir=+1)
    _place_grid(small, x_left, target_width, small_y, DECK_Z_MM, MAT, MO)
    return max(big_dx, med_dx, target_width, MIN_REGION_WIDTH_MM)


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


def place_all(parts, regions, MAT, MO):
    """Arrange the process regions in process-flow order across N SERPENTINE
    BANKS (lanes stacked in Y). Bank 0 flows left→right; bank 1 sits behind it
    (higher Y) flowing right→left; etc. This keeps the overall plant footprint
    roughly SQUARE — an 8-region, 70-part plant laid in a single lane is a ~55 m
    ribbon (aspect 5); folded into 2 banks it is a compact ~30 m × ~24 m skid
    (aspect ~1.3) that frames cleanly and reads as an assembled plant.

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

    # Pre-estimate each region's width, then split banks to BALANCE total width.
    region_parts = {rk: [p for p in parts if p.region_key == rk]
                    for rk in region_list}
    region_w = {rk: _estimate_region_width(region_parts[rk]) for rk in region_list}
    banks = _balanced_bank_split(region_list,
                                 [region_w[rk] for rk in region_list], n_banks)

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
    r"\bsupply\b|battery_limit|offsite", re.IGNORECASE)
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
        MAT["u_rack_steel"] = fl.make_mat("m_u_rack_steel", (0.62, 0.64, 0.67),
                                          metallic=0.55, roughness=0.50)
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


def _direct_route(plan, i, a_xyz, b_xyz, own):
    """A SHORT LOCAL jumper between two nearby parts: rise to this run's tier, run
    along X then Y (an L) at that tier, drop to the target — NO trip to the central
    spine. Used when the two endpoints are close AND the L-route is clear of OTHER
    equipment, so adjacent units get a direct pipe (how a real plant runs a local
    jumper) instead of a wasteful detour up to the rack aisle and back. The run still
    sits on its own TIER, so it never shares an elevation with another run. Returns
    the waypoints, or None if the direct L crosses other equipment (caller falls back
    to the spine)."""
    ax, ay, az = (float(c) for c in a_xyz)
    bx, by, bz = (float(c) for c in b_xyz)
    tz = plan.tier_z(i)
    # two orthogonal orderings (X-first vs Y-first); pick the clean one, preferring
    # the one whose horizontal legs avoid equipment.
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
        if best is None or over < best[0]:
            best = (over, pts)
    return best[1] if best and best[0] == 0 else None


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


def _route_log_reset():
    _ROUTE_LOG.clear()


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
    DISCRIMINATORS = {"h2", "co2", "hot", "cold", "saf", "naphtha", "recycle",
                      "feed", "product", "tail", "syncrude"}
    ep_disc = ep_folded & DISCRIMINATORS
    hits = []
    for p in parts:
        if p.placed_xyz_mm is None:
            continue
        pf = {_depluralise(t) for t in p.match_tokens}
        # honour the endpoint's chemical discriminators when it carries any
        if ep_disc and not (ep_disc & pf):
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


def _draw_cable_tray(nm, waypoints_mm, MAT, MO):
    """Draw an electrical run as a CABLE TRAY / bus-duct (copper-orange,
    RECTANGULAR cross-section) so it reads visually DISTINCT from round process
    pipe. Built as oriented boxes along each orthogonal leg + a couple of ladder
    rungs per leg (the tray look). Universal — pure geometry from the waypoints."""
    if "u_cable_tray" not in MAT:
        MAT["u_cable_tray"] = fl.make_mat("m_u_cable_tray", (1.00, 0.45, 0.00),
                                          metallic=0.45, roughness=0.40)
    tray = MAT["u_cable_tray"]
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
        # ladder rungs along the leg (skip risers — rungs read on the horizontals)
        if abs(dz) < max(abs(dx), abs(dy)):
            n_rung = max(2, int(ln / 1400))
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

    # ── PASS 1: resolve every edge to concrete 3D endpoints (collect, don't draw) ─
    resolved = []   # per drawable edge: dict of endpoints/metadata
    unresolved = []
    for i, e in enumerate(topology):
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "fluid_loop")
        pa = resolve_endpoint(frm, parts)
        pb = resolve_endpoint(to, parts)

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
        })

    # ── Build the RackPlan (spine in the free aisle) if the caller didn't pass one.
    # Process-plant + generic-assembly stack their banks in Y, so the SPINE runs
    # along X down the inter-bank aisle; make_rack_plan_for_rows finds that gap.
    if rack_plan is None and bbox_mm is not None:
        rack_plan = make_rack_plan_for_rows(
            bbox_mm, rack_base_z, equipment_xy_bboxes_mm(parts), axis="x")

    routed, emit_unresolved = _emit_routes_on_plan(
        resolved, rack_plan, rack_base_z, MAT, MO,
        pipe_module="mass_fluid_transport_process", tag="")
    unresolved.extend(emit_unresolved)
    return routed, unresolved


def _emit_routes_on_plan(resolved, rack_plan, rack_base_z, MAT, MO,
                         pipe_module="mass_fluid_transport_process", tag=""):
    """Shared PASS-2 emitter for EVERY family. `resolved` = list of edge dicts with
    keys i, mech, a_xyz, b_xyz, a_abstract, b_abstract, a_conn, b_conn, b_branch,
    pa, pb, a_nm, b_nm. Assigns each run a LANE + TIER on `rack_plan` (one shot),
    then for each: tries a DIRECT clean L-jumper for short concrete edges, else
    routes on the spine; draws a cable tray (electrical) or pipe; logs it for the
    route audit. Returns (routed_count, unresolved). One engine → every family gets
    the same orderly spine routing + the same self-audit coverage."""
    unresolved = []
    # assign lanes + tiers over the along-spine intervals of all edges
    if rack_plan is not None and resolved:
        intervals = []
        for r in resolved:
            a_al = rack_plan._clamp_along(rack_plan._along(r["a_xyz"]))
            b_al = rack_plan._clamp_along(rack_plan._along(r["b_xyz"]))
            intervals.append((min(a_al, b_al), max(a_al, b_al)))
        rack_plan.assign(intervals)

    routed = 0
    for slot, r in enumerate(resolved):
        i, mech = r["i"], r["mech"]
        a_xyz, b_xyz = r["a_xyz"], r["b_xyz"]
        colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
        mkey = f"u_pipe_{mech}"
        if mkey not in MAT:
            MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35, roughness=0.35)
        mat = MAT[mkey]
        pa, pb = r.get("pa"), r.get("pb")
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
        nm = f"u_route_{tag}{i}_{mech}"
        try:
            if mech == "electrical_bus":
                _draw_cable_tray(nm, waypoints, MAT, MO)
                # branch drops to the top matched loads — TAP off the spine at the
                # point NEAREST each load (short lateral + drop), not the run end.
                for j, drop in enumerate(r.get("b_branch", [])):
                    if rack_plan is not None:
                        if rack_plan.axis == "x":
                            tap = (rack_plan._clamp_along(drop[0]),
                                   rack_plan.spine_pos + rack_plan.lane_offset(slot),
                                   rack_plan.tier_z(slot))
                        else:
                            tap = (rack_plan.spine_pos + rack_plan.lane_offset(slot),
                                   rack_plan._clamp_along(drop[1]),
                                   rack_plan.tier_z(slot))
                        bwp = [tap, (drop[0], drop[1], tap[2]), drop]
                    else:
                        bwp = route_rack((waypoints[-1][0], waypoints[-1][1],
                                          waypoints[-1][2]), drop, rack_base_z)
                    _draw_cable_tray(f"{nm}_branch{j}", bwp, MAT, MO)
                _route_log_add(nm, mech, waypoints, a_xyz, b_xyz, own_parts=(pa, pb))
                routed += 1
                print(f"[univ] routed edge {tag}{i} ({mech}) CABLE-TRAY: "
                      f"{r['a_nm']}  ->  {r['b_nm']}  "
                      f"(+{len(r.get('b_branch', []))} load drops)")
            else:
                conn = tuple(c for c in (r.get("a_conn"), r.get("b_conn"))
                             if c is not None)
                fl.prim_pipe_run(nm, waypoints, PIPE_DIA_MM, material=mat,
                                 flanges=True, connect=conn,
                                 module=pipe_module, module_objects=MO)
                _route_log_add(nm, mech, waypoints, a_xyz, b_xyz, own_parts=(pa, pb))
                routed += 1
                print(f"[univ] routed edge {tag}{i} ({mech}): "
                      f"{r['a_nm']}  ->  {r['b_nm']}")
        except Exception as ex:  # noqa: BLE001 — never let one bad route kill the run
            unresolved.append((r["a_nm"], r["b_nm"], mech, [f"route_error:{ex}"]))
            print(f"[univ] edge {tag}{i} route FAILED: {ex}")
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

def place_process_plant(parts, regions, topology, MAT, MO):
    """PROCESS-PLANT strategy (the original, e-fuel-tuned pipeline). Lay the
    physical parts out as process REGIONS across serpentine banks on a TALL braced
    open skid that hugs the equipment bulk, build the overhead pipe-rack structure,
    and route every topology edge as an overhead-rack run (round process pipe /
    copper cable tray). Behaviour-identical to the pre-dispatch main(): the refactor
    only moved these steps into a function. Returns
    (bbox, region_centres, frame_top_mm, routed, unresolved)."""
    # 4. place parts
    bbox, region_centres = place_all(parts, regions, MAT, MO)
    print(f"[univ] plant bbox (mm): {bbox}")

    # 5. TALL braced skid frame that HUGS THE EQUIPMENT BULK (Fix 1, FRAME FIT).
    #    BOTH the footprint AND the height target come from the NON-tall equipment
    #    only (is_tall_for_frame excludes stacks/flares/slim towers); those tall
    #    items poke THROUGH the roof rather than dragging the frame up + out.
    equip_bbox = equipment_bbox_mm(parts, margin_mm=0.0)   # frame adds FRAME_MARGIN
    equip_tops = [p.anchors["top"][2] for p in parts
                  if p.anchors and not is_tall_for_frame(p)]
    tallest = max(equip_tops) if equip_tops else SKID_FRAME_MIN_HEIGHT_MM
    frame_h = max(SKID_FRAME_MIN_HEIGHT_MM, tallest * SKID_FRAME_HEIGHT_FRAC)
    build_skid_frame(equip_bbox, frame_h, MAT, MO)

    # 5b. PHYSICAL PIPE-RACK STRUCTURE (Fix 2): light grey beams + posts at the
    #     shared rack elevation so the overhead pipes visibly rest on a rack.
    build_pipe_rack(equip_bbox, frame_h, MAT, MO)

    # 6. route topology on a real OVERHEAD PIPE-RACK SPINE down the inter-bank AISLE.
    #    The placement KNOWS the aisle (the Y-gap between the serpentine banks,
    #    published by _compact_banks_in_y as _PLANT_BANK_AISLES); we site the spine
    #    there so the long runs travel in the corridor, never over equipment.
    rack_base_z = rack_elevation_mm(frame_h)
    rack_plan = _make_rack_plan_from_bank_aisle(bbox, rack_base_z, parts, axis="x")
    routed, unresolved = route_topology(topology, parts, MAT, MO,
                                        frame_top_mm=frame_h,
                                        region_centres=region_centres,
                                        bbox_mm=bbox, rack_plan=rack_plan)
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
    _GA_ROUTE_GLOBALS = ("PIPE_DIA_MM", "RACK_TIER_PITCH_MM", "RACK_LANE_PITCH_MM",
                         "RACK_LATERAL_MIN_MM", "RACK_LANE_SPAN_MM", "RACK_DIRECT_MAX_MM")
    _GA_ROUTE_FLOORS = {"PIPE_DIA_MM": 12.0, "RACK_TIER_PITCH_MM": 20.0,
                        "RACK_LANE_PITCH_MM": 24.0, "RACK_LATERAL_MIN_MM": 20.0,
                        "RACK_LANE_SPAN_MM": 160.0, "RACK_DIRECT_MAX_MM": 200.0}
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
    RACK_END_RE = re.compile(r"\brack\b|\bcell\b|string|\bmodule\b|\bpack\b|battery",
                             re.IGNORECASE)

    def _resolve(endpoint_name):
        """Return an (x,y,z) mm point for a topology endpoint, rack-farm aware."""
        nm = str(endpoint_name)
        if RACK_END_RE.search(nm) and not re.search(r"transformer|pcs|inverter", nm, re.IGNORECASE):
            return rack_bus_pt
        for role, rx in ROLE_RE.items():
            if rx.search(nm) and role in bop_anchor:
                return bop_anchor[role]
        # generic part fallback (the process-plant resolver)
        p = resolve_endpoint(nm, parts)
        if p is not None and p.placed_xyz_mm is not None:
            return (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                    p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2])
        return None

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
        a = _resolve(frm)
        b = _resolve(to)
        if a is None or b is None:
            miss = [n for n, pt in ((frm, a), (to, b)) if pt is None]
            unresolved.append((frm, to, mech, miss))
            print(f"[univ][rackfarm] edge {i} UNRESOLVED ({mech}): {frm} -> {to} "
                  f"[missing: {', '.join(miss)}]")
            continue
        # rack-farm endpoints are AGGREGATE points (rack bus / BoP anchor), not single
        # Part objects, so a_abstract/b_abstract = True (route straight to/from them,
        # no own-bbox exclusion) — they sit ABOVE the racks so the tray clears them.
        resolved.append({
            "i": i, "mech": mech, "a_xyz": a, "b_xyz": b,
            "a_abstract": True, "b_abstract": True,
            "a_conn": None, "b_conn": None, "b_branch": [],
            "pa": None, "pb": None, "a_nm": frm, "b_nm": to,
        })
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
    GROW_END_RE = re.compile(
        r"\bgrow\b|\bgrowing\b|\btray\b|\bcanopy\b|\bled\b|\btier\b|\bcrop\b|"
        r"\bplant\b|propagation|\barray\b|trolley", re.IGNORECASE)

    def _resolve(endpoint_name):
        nm = str(endpoint_name)
        if GROW_END_RE.search(nm):
            return rack_bus_pt
        for role, rx in ROLE_RE.items():
            if rx.search(nm) and role in bop_anchor:
                return bop_anchor[role]
        p = resolve_endpoint(nm, parts)
        if p is not None and p.placed_xyz_mm is not None:
            return (p.placed_xyz_mm[0], p.placed_xyz_mm[1],
                    p.anchors["top"][2] if p.anchors else p.placed_xyz_mm[2])
        # last resort: an unresolved climate/fluid endpoint routes to the rack
        # bus point so a 3-edge VF still draws all its services (never strand an
        # edge on a missing aggregate endpoint like 'condensate_loop').
        return rack_bus_pt

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
        a = _resolve(frm)
        b = _resolve(to)
        if a is None or b is None:
            miss = [n for n, pt in ((frm, a), (to, b)) if pt is None]
            unresolved.append((frm, to, mech, miss))
            print(f"[univ][panelarray] edge {i} UNRESOLVED ({mech}): {frm} -> {to} "
                  f"[missing: {', '.join(miss)}]")
            continue
        resolved.append({
            "i": i, "mech": mech, "a_xyz": a, "b_xyz": b,
            "a_abstract": True, "b_abstract": True,
            "a_conn": None, "b_conn": None, "b_branch": [],
            "pa": None, "pb": None, "a_nm": frm, "b_nm": to,
        })
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
            if mech in ("electrical_bus", "data_link", "control_signal", "signal"):
                _draw_cable_tray(nm, waypoints, MAT, MO)
            else:
                colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
                mkey = f"u_pipe_{mech}"
                if mkey not in MAT:
                    MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35, roughness=0.35)
                fl.prim_pipe_run(nm, waypoints, PIPE_DIA_MM, material=MAT[mkey],
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
            # thermal loop (rare here) draws as a pipe.
            if mech in ("fluid_loop", "thermal"):
                colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
                mkey = f"u_pipe_{mech}"
                if mkey not in MAT:
                    MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35,
                                            roughness=0.35)
                fl.prim_pipe_run(nm, waypoints, PIPE_DIA_MM * 0.5, material=MAT[mkey],
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
    """Wrap the whole plant in a TALL braced open structural-steel skid — the
    e-fuel-template idiom (Tristan 2026-06-10): a base + deck (via prim_skid_frame)
    PLUS vertical corner + intermediate posts rising to ~the tallest vessel, a top
    perimeter rail at that height, intermediate tie rings, and diagonal X
    cross-bracing on the two long (front/back) faces. The plant reads as ONE
    dense, enclosed unit rather than equipment scattered on a plate. Genuinely
    tall columns / flare stacks still tower ABOVE the frame top (real skids)."""
    x0, x1 = bbox_mm["x0"] - FRAME_MARGIN_MM, bbox_mm["x1"] + FRAME_MARGIN_MM
    y0, y1 = bbox_mm["y0"] - FRAME_MARGIN_MM, bbox_mm["y1"] + FRAME_MARGIN_MM
    w = x1 - x0
    d = y1 - y0
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    H = max(SKID_FRAME_MIN_HEIGHT_MM, frame_height_mm)   # frame top height (mm)
    steel = fl.make_mat("m_skid_steel", (0.40, 0.42, 0.46), metallic=0.85, roughness=0.42)
    deck = fl.make_mat("m_skid_deck", (0.22, 0.26, 0.32), metallic=0.55, roughness=0.40)
    m = SKID_POST_MM
    sid = STRUCTURE_MODULE_ID

    # Base rails + cross members + deck (a LOW base frame from the lib primitive).
    base_h = max(700, m * 4)
    fl.prim_skid_frame("u_skid_base", w, d, base_h, (cx, cy, 0.0),
                       material=steel, material_deck=deck,
                       n_cross_members=max(3, int(w / 2200)),
                       module=sid, module_objects=MO)
    deck_z = base_h

    def _mm3(t):
        return tuple(c * fl.MM for c in t)

    # Vertical posts: 4 corners + intermediate posts along each long (X) face.
    n_inter = max(1, int(w / 6000))             # intermediate posts per long face
    xs = [x0 + m / 2] + [x0 + (k + 1) * w / (n_inter + 1) for k in range(n_inter)] + [x1 - m / 2]
    post_h = H - base_h
    for px in xs:
        for py in (y0 + m / 2, y1 - m / 2):
            fl.add_box(f"u_skid_post_{px:.0f}_{py:.0f}",
                       _mm3((px, py, deck_z + post_h / 2)),
                       _mm3((m, m, post_h)), steel, module=sid, module_objects=MO)
    # Top perimeter rail (front, back, both ends) at the frame top.
    for (sx, sy, sw, sd) in [(cx, y0 + m / 2, w, m), (cx, y1 - m / 2, w, m),
                             (x0 + m / 2, cy, m, d), (x1 - m / 2, cy, m, d)]:
        fl.add_box(f"u_skid_toprail_{sx:.0f}_{sy:.0f}",
                   _mm3((sx, sy, H - m / 2)), _mm3((sw, sd, m)),
                   steel, module=sid, module_objects=MO)
    # One intermediate tie ring at mid height (front + back) — frames the bays.
    z_mid = deck_z + post_h * 0.5
    for py in (y0 + m / 2, y1 - m / 2):
        fl.add_box(f"u_skid_midtie_{py:.0f}", _mm3((cx, py, z_mid)),
                   _mm3((w, m * 0.7, m * 0.7)), steel, module=sid, module_objects=MO)

    # Diagonal X cross-bracing on each bay of the two long (front/back) faces.
    brace_r = m * 0.30 * fl.MM
    z_bot, z_top = deck_z + m, H - m
    for py in (y0 + m / 2, y1 - m / 2):
        for k in range(len(xs) - 1):
            bx0, bx1 = xs[k], xs[k + 1]
            # the two diagonals of the bay → an X
            fl.add_pipe(f"u_skid_brace_{py:.0f}_{k}_a",
                        [_mm3((bx0, py, z_bot)), _mm3((bx1, py, z_top))],
                        brace_r, steel, module=sid, module_objects=MO)
            fl.add_pipe(f"u_skid_brace_{py:.0f}_{k}_b",
                        [_mm3((bx1, py, z_bot)), _mm3((bx0, py, z_top))],
                        brace_r, steel, module=sid, module_objects=MO)
    # Sway brace across each open END face (bottom corner → top opposite corner).
    for px in (x0 + m / 2, x1 - m / 2):
        fl.add_pipe(f"u_skid_endbrace_{px:.0f}",
                    [_mm3((px, y0 + m / 2, z_bot)), _mm3((px, y1 - m / 2, z_top))],
                    brace_r, steel, module=sid, module_objects=MO)
    print(f"[univ] skid frame: {w/1000:.1f}×{d/1000:.1f} m footprint, "
          f"{H/1000:.1f} m tall, {len(xs)} post bays, X-braced both long faces")


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
        # ── Routed pipes → keep mechanism colour, just flatten to matte ──
        if nm.startswith("u_route_"):
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
        ("ins_fill_top",   (0.0, 0.0, 60.0), 220),
        ("ins_fill_front", (0.0, -55.0, 30.0), 130),
        ("ins_fill_back",  (0.0, 55.0, 30.0), 130),
        ("ins_fill_left",  (-55.0, 0.0, 30.0), 130),
        ("ins_fill_right", (55.0, 0.0, 30.0), 130),
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
    topology = contract.get("topology", []) or []
    quantities = contract.get("quantities", {}) or {}
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
    if family == "aero_body":
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

    # ── ROUTE AUDIT — the harsh self-check on the pipe routing (Tristan 2026-06-11).
    # Computes over-equipment segments / max detour ratio / same-elevation crossings
    # from the emitted polylines + equipment footprints; writes route-audit.json.
    route_metrics = audit_routes(parts, out_dir)

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
        # 7. FLAT, EVEN lighting for LEGIBILITY (Tristan 2026-06-10, priority 1):
        #    a single harsh sun threw long diagonal shadows that obscured the CAD.
        #    Replace with strong world ambient + soft fills from several directions,
        #    shadows OFF, so the geometry reads clearly from every camera. NOT for
        #    aesthetics — purely so the visual judge can see the shapes.
        add_flat_lights(bbox)
        # 8. render the production PDF set (dark navy deck, hero + per-module).
        fl.run_render_pipeline(out_dir, MO,
                               structure_module_id=STRUCTURE_MODULE_ID,
                               hero_open_frame=True)
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
              "inspect": _inspect_summary,
          }))


if __name__ == "__main__":
    main()
