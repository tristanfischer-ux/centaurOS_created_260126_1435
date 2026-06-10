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
BANK_COMPACT_GAP_MM = 1600  # clear gap between adjacent compacted bank lanes (~1.6 m)
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
                dim = None
                for mc in mods:
                    if mc.get("kind") == "dimension":
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

# Vocabulary that marks a RACK-FARM archetype (battery/server/switchgear rows).
RACK_FARM_RE = re.compile(
    r"\bcell\b|\bcells\b|\brack\b|\bracks\b|\bmodule\b|\bbattery\b|\bcabinet\b|"
    r"\bserver\b|\bbusbar\b|\bbms\b|\bpcs\b|\binverter\b", re.IGNORECASE)
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


def detect_geometry_family(parts, modules):
    """Return the geometry FAMILY for this design — 'panel_array', 'rack_farm' or
    'process_plant' (aero_body is a later stub). Heuristic on the physical part
    NAMES (universal — no per-class hand-coding):

      • panel_array (VF grow-rack) FIRST: when the GROW vocabulary dominates AND
        the BATTERY-SYSTEM vocabulary does not — a vertical farm has grow-RACKS
        but they are NOT battery racks. Testing the grow vocab here lets it WIN
        over the generic "rack"/"module" token that would otherwise pull a VF into
        rack_farm. We require grow_hits to beat BOTH the battery markers and the
        process-vessel markers so a real plant/battery is never mis-routed.
      • rack_farm: the rack/cabinet vocabulary dominates the vessel/machine one
        (battery / server / switchgear rows).
      • process_plant: the default for any unknown archetype.

    Logs the decision + counts. Deterministic + universal — no per-class branch."""
    grow_hits = sum(1 for p in parts if PANEL_ARRAY_RE.search(str(p.name)))
    batt_hits = sum(1 for p in parts if BATTERY_SYSTEM_RE.search(str(p.name)))
    rack_hits = sum(1 for p in parts if RACK_FARM_RE.search(str(p.name)))
    proc_hits = sum(1 for p in parts if PROCESS_PLANT_RE.search(str(p.name)))
    # panel_array wins when grow vocab leads and the design is clearly NOT a
    # battery system (grow_hits > battery markers) and not a process plant.
    if grow_hits > 0 and grow_hits > batt_hits and grow_hits >= proc_hits:
        family = "panel_array"
    elif rack_hits > proc_hits:
        family = "rack_farm"
    else:
        family = "process_plant"
    print(f"[univ] geometry family = {family}  "
          f"(grow/panel name matches = {grow_hits}, "
          f"battery-system matches = {batt_hits}, "
          f"rack/cabinet matches = {rack_hits}, "
          f"vessel/machine matches = {proc_hits}, "
          f"of {len(parts)} physical parts)")
    return family


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

    # Pull each bank FORWARD (−Y) to close any EXCESS empty band in front of it —
    # but never push a bank backward (the shelf-packers already make banks deep;
    # forcing a bank back would only re-grow the footprint). A bank moves only when
    # the gap to the previous bank's back edge EXCEEDS BANK_COMPACT_GAP_MM; it then
    # closes to exactly that gap. The first bank stays put.
    ordered = sorted(extents.keys())
    prev_back = None
    moved = set()        # object pointers already shifted (guards prefix overlap)
    for b in ordered:
        lo, hi = extents[b]
        depth = hi - lo
        if prev_back is None:
            target_front = lo            # keep first bank where it is
        else:
            desired_front = prev_back + BANK_COMPACT_GAP_MM
            # only pull FORWARD to close excess space; never push back
            target_front = desired_front if lo > desired_front else lo
        shift = target_front - lo
        if shift < -1.0:
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
        prev_back = target_front + depth      # this bank's (possibly shifted) back edge


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
    Degenerate (<1 mm) legs are dropped so a stacked source/target stays clean."""
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
                   region_centres=None, bbox_mm=None):
    """Draw a routed CAD pipe for every resolvable edge as an OVERHEAD PIPE-RACK
    run (Fix 3): rise from the source nozzle to a shared rack elevation just below
    the frame roof, run ORTHOGONALLY along it (X then Y, no diagonals), then drop
    to the target nozzle. Nozzle pick is unchanged (top head for vapour/overhead/
    gas, bottom for liquid/bottoms) and mechanism colours are unchanged. Returns
    (routed_count, unresolved_list)."""
    routed = 0
    unresolved = []
    # Shared rack elevation: just below the frame roof if we know it, else a sane
    # default above the deck. Each routed run is nudged up one small tier so two
    # parallel pipes on the rack don't render as a single co-incident line.
    rack_base_z = rack_elevation_mm(frame_top_mm)
    for i, e in enumerate(topology):
        frm = e.get("from_part", "")
        to = e.get("to_part", "")
        mech = e.get("mechanism", "fluid_loop")
        pa = resolve_endpoint(frm, parts)
        pb = resolve_endpoint(to, parts)

        # Fix 1: when an endpoint is ABSTRACT (external supply / aggregate group)
        # resolve_endpoint returns None. Rather than skip the edge, synthesise a
        # routable point: an incomer marker for an external supply, or the matched-
        # cluster centroid (+ branch drops) for a group. a_pt/b_pt hold the chosen
        # 3D mm point; a_branch/b_branch hold any extra load drops; a_conn/b_conn
        # the assembly to link. Concrete parts keep the nozzle + stub path below.
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

        # Still unroutable after the abstract-resolver (a genuinely empty endpoint).
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

        colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
        mkey = f"u_pipe_{mech}"
        if mkey not in MAT:
            MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35, roughness=0.35)
        mat = MAT[mkey]

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

        # Overhead pipe-rack route at the SHARED rack elevation (Fix 3), tiered up
        # slightly per run so parallel pipes don't co-incide into one line.
        rack_z = rack_base_z + RACK_TIER_PITCH_MM * (routed % 4)
        waypoints = route_rack(a_xyz, b_xyz, rack_z)
        nm = f"u_route_{i}_{mech}"
        try:
            if mech == "electrical_bus":
                # Fix 1: electrical runs render as a CABLE TRAY / bus-duct (copper-
                # orange rectangular section) — visually distinct from round pipe.
                # Main run on the rack + a short branch drop to each top matched load.
                _draw_cable_tray(nm, waypoints, MAT, MO)
                rack_top = waypoints[-1] if waypoints else b_xyz
                for j, drop in enumerate(b_branch):
                    # branch from the rack down to the load's top anchor
                    bwp = route_rack((rack_top[0], rack_top[1], rack_top[2]),
                                     drop, rack_z)
                    _draw_cable_tray(f"{nm}_branch{j}", bwp, MAT, MO)
                routed += 1
                a_nm = frm if a_abstract else pa.name
                b_nm = to if b_abstract else pb.name
                print(f"[univ] routed edge {i} ({mech}) CABLE-TRAY: "
                      f"{a_nm}  ->  {b_nm}  (+{len(b_branch)} load drops)")
            else:
                conn = tuple(c for c in (a_conn, b_conn) if c is not None)
                fl.prim_pipe_run(nm, waypoints, PIPE_DIA_MM, material=mat,
                                 flanges=True, connect=conn,
                                 module="mass_fluid_transport_process",
                                 module_objects=MO)
                routed += 1
                a_nm = frm if a_abstract else pa.name
                b_nm = to if b_abstract else pb.name
                print(f"[univ] routed edge {i} ({mech}): {a_nm}  ->  {b_nm}")
        except Exception as ex:  # noqa: BLE001 — never let one bad route kill the run
            unresolved.append((frm, to, mech, [f"route_error:{ex}"]))
            print(f"[univ] edge {i} route FAILED: {ex}")
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

    # 6. route topology like a real OVERHEAD PIPE RACK (Fix 3): all runs share a
    #    rack elevation just below the frame roof. Pass the frame top so the rack
    #    sits beneath it (and ON the Fix-2 rack structure).
    routed, unresolved = route_topology(topology, parts, MAT, MO,
                                        frame_top_mm=frame_h,
                                        region_centres=region_centres,
                                        bbox_mm=bbox)
    print(f"[univ] topology routed = {routed}/{len(topology)}; "
          f"unresolved = {len(unresolved)}")
    return bbox, region_centres, frame_h, routed, unresolved


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


def _build_battery_rack(nm, cx, y_row, deck_z_mm, cells_per_rack,
                        frame_mat, cell_mat, busbar_mat, steel, MAT,
                        rack_mod, MO):
    """One battery rack cabinet WITH module detail (Fix 2, 2026-06-10). The shelf
    divisions must read from EVERY judge camera (front-elevation looks at the rack
    BACK, side + iso see the ±Y faces at an angle), so the detail is built CAMERA-
    AGNOSTIC: a vertical stack of N full-depth, full-width battery MODULES (battery-
    blue boxes) separated by thin DARK spacer bands that span the whole rack depth
    — so a viewer from ANY direction sees blue module bands cut by dark shelf-lines,
    never a monolith. On top: a thin front-door frame (stiles + rails) + a slim dark
    fascia/handle strip per module on the +Y face + the copper DC bus + a plinth.
    Deterministic + universal: keyed only on the rack constants + cells_per_rack."""
    w, d, h = RACK_W_MM, RACK_D_MM, RACK_H_MM
    cz_mid = deck_z_mm + h / 2
    front_y = y_row + d / 2                        # the +Y cabinet face plane
    # ── thin dark base shell so the rack edges/corners read even at the gap lines ──
    fl.add_box(f"{nm}_frame",
               (cx * fl.MM, y_row * fl.MM, cz_mid * fl.MM),
               (w * fl.MM, d * fl.MM, h * fl.MM),
               cell_mat, module=rack_mod, module_objects=MO)

    # ── stacked battery MODULES (full depth/width) with dark gap bands between ──
    n_mod = _rack_module_count(cells_per_rack)
    usable_h = max(h - RACK_TOP_RESERVE_MM, h * 0.5)
    z0 = deck_z_mm + (h - usable_h) / 2          # bottom of the module stack
    slot_h = usable_h / n_mod                     # pitch of one shelf
    mod_h = max(40.0, slot_h - RACK_MODULE_GAP_MM)  # module body height (< slot → gap)
    mod_w = w - 24.0                              # near-full width (slim side reveal)
    mod_d = d + 12.0                              # proud of ±Y faces so it's the skin
    for i in range(n_mod):
        mcz = z0 + slot_h * (i + 0.5)
        # battery-blue module body — the visible band on every face
        fl.add_box(f"{nm}_mod{i}",
                   (cx * fl.MM, y_row * fl.MM, mcz * fl.MM),
                   (mod_w * fl.MM, mod_d * fl.MM, mod_h * fl.MM),
                   frame_mat, module=rack_mod, module_objects=MO)
        # slim dark fascia/handle strip across the +Y face of this module
        fl.add_box(f"{nm}_fascia{i}",
                   (cx * fl.MM, (front_y + 8.0) * fl.MM, (mcz + mod_h * 0.28) * fl.MM),
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

    # copper bus stripe up the front (+Y) face — the rack DC bus
    fl.add_box(f"{nm}_bus",
               (cx * fl.MM, (front_y + 24.0) * fl.MM, cz_mid * fl.MM),
               (60 * fl.MM, 40 * fl.MM, (h - 360) * fl.MM),
               busbar_mat, module=rack_mod, module_objects=MO)
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

    n_racks, n_rows, racks_per_row, basis = _derive_rack_grid(quantities, parts)
    cells_per_rack = qval(quantities, "cells_per_rack")
    cell_count = qval(quantities, "cell_count")
    print(f"[univ][rackfarm] rack grid: {n_racks} racks "
          f"= {n_rows} row(s) × {racks_per_row} "
          f"(basis: {basis}); cells_per_rack={cells_per_rack}, "
          f"cell_count={cell_count} aggregated into the racks (not drawn individually)")

    steel = _steel_mat(MAT)
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
                                rack_mod, MO)
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
    bop_items = _select_bop_items(parts)
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
        elif role == "chiller":
            _build_bop_chiller(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                               mat, steel, MAT, MO, mod)
        elif role == "fire":
            _build_bop_fire(nm, cx, cy, DECK_Z_MM, w_mm, depth_mm, h_mm,
                            mat, steel, MAT, mod, MO)
        else:  # bms_ctrl + any other controller role → small wall cabinet
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


def _select_bop_items(parts):
    """Build the balance-of-plant lineup list. For each role in _BOP_ROLES, find the
    first matching design part (to reflect the BoM + carry its module tag); the skid
    is drawn whether or not a part matches (a real BESS always has PCS / switchgear /
    transformer / controller / thermal gear). Returns
    [(role, part_or_None, depth_mm, width_mm, height_mm, rgb), …] in lineup order."""
    items = []
    for role, rx, depth, w, h, rgb in _BOP_ROLES:
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

    routed = 0
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
        rack_zi = rack_z + RACK_TIER_PITCH_MM * (routed % 4)
        waypoints = route_rack(a, b, rack_zi)
        nm = f"u_route_rf_{i}_{mech}"
        try:
            if mech == "electrical_bus":
                _draw_cable_tray(nm, waypoints, MAT, MO)
            else:
                colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
                mkey = f"u_pipe_{mech}"
                if mkey not in MAT:
                    MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35, roughness=0.35)
                fl.prim_pipe_run(nm, waypoints, PIPE_DIA_MM, material=MAT[mkey],
                                 flanges=True,
                                 module="mass_fluid_transport_process",
                                 module_objects=MO)
            routed += 1
            print(f"[univ][rackfarm] routed edge {i} ({mech}): {frm} -> {to}")
        except Exception as ex:  # noqa: BLE001 — never let one bad route kill the run
            unresolved.append((frm, to, mech, [f"route_error:{ex}"]))
            print(f"[univ][rackfarm] edge {i} route FAILED: {ex}")
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
GR_LED_THICK_MM    = 40.0     # LED panel fixture thickness (thin flat board)
GR_LED_DROP_MM     = 150.0    # LED panel hangs this far under the shelf above
GR_FRAME_POST_MM   = 60.0     # square section of the rack corner posts
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
                     frame_mat, tray_mat, canopy_mat, led_mat, MAT, MO):
    """ONE multi-tier grow rack: a tall shelving FRAME (4 corner posts + a top
    rail ring) carrying N stacked horizontal GROW-TRAY shelves, each with a green
    CANOPY slab on top, and a thin flat LED PANEL fixture hung UNDER the shelf
    above to light this tier. The tray + canopy are the green grow area; the LED
    panel is the bright fixture. Built CAMERA-AGNOSTIC (full-width/full-depth
    shelves) so the tier stack reads from every judge camera. Deterministic +
    universal: keyed only on the rack constants + n_tiers. Tags:
      growing_canopy  ← frame + trays + canopy
      lighting_array  ← LED panels."""
    w, d = GR_RACK_LEN_MM, GR_RACK_DEPTH_MM
    top_z = deck_z_mm + GR_TIER_BASE_MM + GR_TIER_PITCH_MM * (n_tiers - 1) \
        + GR_CANOPY_THICK_MM + 180.0
    frame_h = top_z - deck_z_mm
    cmod = "growing_canopy"
    lmod = "lighting_array"
    for mod in (cmod, lmod):
        if mod not in MO:
            MO[mod] = []

    # ── shelving frame: 4 corner posts + top rail ring + base rail ring ──
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

    # ── N stacked grow-tier shelves: tray pan + green canopy + LED panel ──
    tray_w = w - GR_FRAME_POST_MM * 2 - 30.0
    tray_d = d - GR_FRAME_POST_MM * 2 - 30.0
    for k in range(n_tiers):
        z_shelf = deck_z_mm + GR_TIER_BASE_MM + GR_TIER_PITCH_MM * k
        # grow-tray pan (light steel) — the shelf the crop sits in
        fl.add_box(f"{nm}_tray{k}",
                   (cx * fl.MM, y_row * fl.MM, z_shelf * fl.MM),
                   (tray_w * fl.MM, tray_d * fl.MM, GR_TRAY_THICK_MM * fl.MM),
                   tray_mat, module=cmod, module_objects=MO)
        # green canopy slab sitting on the tray (the grow area / leafy greens)
        fl.add_box(f"{nm}_canopy{k}",
                   (cx * fl.MM, y_row * fl.MM,
                    (z_shelf + GR_TRAY_THICK_MM / 2 + GR_CANOPY_THICK_MM / 2) * fl.MM),
                   ((tray_w - GR_CANOPY_INSET_MM) * fl.MM,
                    (tray_d - GR_CANOPY_INSET_MM) * fl.MM, GR_CANOPY_THICK_MM * fl.MM),
                   canopy_mat, module=cmod, module_objects=MO)
        # LED panel fixture hung UNDER the NEXT shelf up, lighting THIS tier's
        # canopy (top tier's panel hangs from the top frame rail).
        led_z = z_shelf + GR_TIER_PITCH_MM - GR_LED_DROP_MM
        if k == n_tiers - 1:
            led_z = deck_z_mm + frame_h - GR_LED_DROP_MM - 60.0
        fl.add_box(f"{nm}_led{k}",
                   (cx * fl.MM, y_row * fl.MM, led_z * fl.MM),
                   ((tray_w - 60.0) * fl.MM, (tray_d - 200.0) * fl.MM,
                    GR_LED_THICK_MM * fl.MM),
                   led_mat, module=lmod, module_objects=MO)

    # ── industrial castors at the 4 base corners (the mobile-trolley cue) ──
    for sx in (-px + 40.0, px - 40.0):
        for sy in (-py + 40.0, py - 40.0):
            fl.add_cyl(f"{nm}_castor_{'L' if sx < 0 else 'R'}{'B' if sy < 0 else 'F'}",
                       ((cx + sx) * fl.MM, (y_row + sy) * fl.MM, (deck_z_mm + 50.0) * fl.MM),
                       50.0 * fl.MM, 100.0 * fl.MM, frame_mat,
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

    routed = 0
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
        rack_zi = rack_z + RACK_TIER_PITCH_MM * (routed % 4)
        waypoints = route_rack(a, b, rack_zi)
        nm = f"u_route_pa_{i}_{mech}"
        try:
            if mech == "electrical_bus":
                _draw_cable_tray(nm, waypoints, MAT, MO)
            else:
                colour = MECH_COLOUR.get(mech, MECH_DEFAULT_COLOUR)
                mkey = f"u_pipe_{mech}"
                if mkey not in MAT:
                    MAT[mkey] = fl.make_mat(f"m_{mkey}", colour, metallic=0.35,
                                            roughness=0.35)
                fl.prim_pipe_run(nm, waypoints, PIPE_DIA_MM, material=MAT[mkey],
                                 flanges=True, module="irrigation_nutrient",
                                 module_objects=MO)
            routed += 1
            print(f"[univ][panelarray] routed edge {i} ({mech}): {frm} -> {to}")
        except Exception as ex:  # noqa: BLE001 — never let one bad route kill the run
            unresolved.append((frm, to, mech, [f"route_error:{ex}"]))
            print(f"[univ][panelarray] edge {i} route FAILED: {ex}")
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
        # bright white-blue LED panel (emissive so it reads as a lit fixture)
        MAT["u_gr_led"] = fl.make_mat("m_gr_led", (0.70, 0.85, 1.00),
                                      metallic=0.0, roughness=0.30,
                                      emission_strength=1.4)
    led_mat = MAT["u_gr_led"]

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
]


def _inspect_rackfarm_colour(name):
    """Flat-matte INSPECT colour for a rack-farm object, by its name role. Falls
    back to the battery-blue rack colour for any unmatched u_rf_* helper."""
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
    # ── grow-rack sub-parts ──
    ("_canopy",     (0.10, 0.62, 0.16)),   # green canopy / grow area = GREEN
    ("_tray",       (0.78, 0.80, 0.83)),   # grow-tray pan = light steel grey
    ("_led",        (0.72, 0.86, 1.00)),   # LED panel fixture = bright white-blue
    ("_post",       (0.74, 0.76, 0.80)),   # rack frame post = light grey
    ("_railx",      (0.74, 0.76, 0.80)),   # rack frame rail = light grey
    ("_castor",     (0.20, 0.22, 0.26)),   # castor = dark
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
    pref_colour = []
    for p in parts:
        pref_colour.append((_part_prefix(p.name), _inspect_colour_for_part(p)))
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
            rf_colour = _inspect_rackfarm_colour(nm)
            obj.data.materials.clear()
            obj.data.materials.append(_matte(rf_colour))
            n_equip += 1
            continue
        # ── PANEL-ARRAY / grow-rack geometry (u_gr_*) → flat matte by sub-part
        #    role, so the rows of grow racks + canopy + LED panels + the BoP lineup
        #    read by colour in the judging surface (these objects aren't owned by a
        #    Part, so they'd otherwise fall to the neutral-grey unmatched bucket).
        #    Keyed by the object-name suffix/role (canopy green, LED white-blue). ──
        if nm.startswith("u_gr_"):
            gr_colour = _inspect_panelarray_colour(nm)
            obj.data.materials.clear()
            obj.data.materials.append(_matte(gr_colour))
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

    cams = [
        # HERO — 3/4 isometric pulled CLOSER (same elev ~35° / az ~45° as the iso,
        # 0.70× ortho_scale so the plant fills the frame + equipment detail reads).
        # Tristan judges visually (2026-06-10): the bbox-fit iso made the plant look
        # small + lost the nozzle/tray/rack detail. KEEP the bbox-fit iso too.
        {
            "name": "inspect-hero",
            # target biased DOWN to the equipment bulk (cz is inflated by the tall
            # flare/stack); the hero frames the deck equipment, the stack tip may
            # leave frame — that is fine, the hero is for equipment detail.
            "loc": (cx + radius * 0.60, cy - radius * 0.60, zmn + dz * 0.30 + radius * 0.55),
            "target": (cx, cy, zmn + dz * 0.30),
            "ortho_scale": iso_scale * HERO_ZOOM,
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
    #      panel_array (VF: rows of multi-tier grow racks + canopy + LED panels +
    #      climate/nutrient BoP in a grow room), rack_farm (BESS: rows of racks in a
    #      container + BoP lineup + bus/coolant runs), or process_plant (the default:
    #      regions on an open skid + overhead pipe rack). All return the SAME tuple
    #      so the INSPECT/PDF render below is common. aero_body is a later stub
    #      (→ process_plant).
    modules = state.get("moduleDecomposition", {}).get("modules", [])
    family = detect_geometry_family(parts, modules)
    if family == "panel_array":
        global _PANELARRAY_QUANTITIES
        _PANELARRAY_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_panel_array(
            parts, regions, topology, MAT, MO)
    elif family == "rack_farm":
        global _RACKFARM_QUANTITIES
        _RACKFARM_QUANTITIES = quantities
        bbox, region_centres, frame_h, routed, unresolved = place_rack_farm(
            parts, regions, topology, MAT, MO)
    else:
        bbox, region_centres, frame_h, routed, unresolved = place_process_plant(
            parts, regions, topology, MAT, MO)

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
              "physical_parts": len(parts),
              "dropped": len(dropped),
              "topology_total": len(topology),
              "topology_routed": routed,
              "topology_unresolved": [u[:3] for u in unresolved],
              "regions": regions,
              "inspect": _inspect_summary,
          }))


if __name__ == "__main__":
    main()
