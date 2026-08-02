#!/usr/bin/env python3
"""Instrument form grammar — function → beautiful, inevitable, *desirable* form.

INTENT: sealed optical/electronic instruments look right because each feature is
forced by use-physics + human factors + material honesty + industrial design +
desirability grammar — never by pasting a gold silhouette.

Apple HIG (via human_factors_instrument) is the hand/eye floor.
This module is beauty + desirability: silhouette hierarchy, edge language,
accessory forms, cutaway density, optical-axis legibility.

FLOW: constants here + hfi → `_instrument_form_rule_mm` + interior layout
   → exterior meshes + cutaway story → vision critic rubric.
"""

from __future__ import annotations

import re

import human_factors_instrument as hfi

# Re-export hand/eye floors so callers can `import instrument_form_grammar as ifg`
DISPLAY_ACTIVE_MIN_W_MM = hfi.DISPLAY_ACTIVE_MIN_W_MM
DISPLAY_ACTIVE_MIN_H_MM = hfi.DISPLAY_ACTIVE_MIN_H_MM
DISPLAY_ACTIVE_PREF_W_MM = hfi.DISPLAY_ACTIVE_PREF_W_MM
DISPLAY_ACTIVE_PREF_H_MM = hfi.DISPLAY_ACTIVE_PREF_H_MM
BUTTON_MIN_DIAMETER_MM = hfi.BUTTON_MIN_DIAMETER_MM
BUTTON_PREF_DIAMETER_MM = hfi.BUTTON_PREF_DIAMETER_MM
BUTTON_MIN_GAP_MM = hfi.BUTTON_MIN_GAP_MM
BUTTON_PREF_GAP_MM = hfi.BUTTON_PREF_GAP_MM
HANDHELD_MAX_EDGE_MM = hfi.HANDHELD_MAX_EDGE_MM
VIEWING_DISTANCE_MM_DESIGN = hfi.VIEWING_DISTANCE_MM_DESIGN

# ── Material honesty (sRGB 0–1) ───────────────────────────────────────────
# DEMO FIX (2026-07-23, Tristan: "black on black"): instrument body lightened
# from near-black charcoal (0.065) to warm mid-light grey (0.62) for demo-slide
# visibility. World background brightened to match (see forge_blender_lib.py).
# View transform switched from AgX (designed for charcoal silhouette) to
# Standard (linear — appropriate for a mid-grey product on a light backdrop).
MAT_BODY_POLYMER = (0.47, 0.48, 0.50)         # true mid grey; 0.62 clipped to near-white on the hero top face under the softbox key (2026-07-23); reads clearly grey in BOTH hero + 04 while the dark front panel keeps contrast
MAT_DECK_A_SURFACE = (0.40, 0.42, 0.45)       # front panel a touch darker than the body for contrast; was (0.08, 0.084, 0.092)
MAT_DISPLAY_GLASS = (0.012, 0.015, 0.028)
MAT_DISPLAY_BEZEL = (0.045, 0.048, 0.055)
# Keys must read against charcoal deck — gold PyBadge uses mid-grey tactile pads.
MAT_BUTTON_KEY = (0.22, 0.23, 0.26)
MAT_FR4 = (0.05, 0.42, 0.20)
MAT_PAD_GOLD = (0.72, 0.62, 0.18)
MAT_SCREW = (0.05, 0.05, 0.06)
MAT_WELL_BORE = (0.01, 0.01, 0.01)
MAT_CAP = (0.05, 0.052, 0.058)                 # deeper black lid (not grey knob)
MAT_COIN_CELL = (0.62, 0.63, 0.66)
MAT_DETECTOR = (0.12, 0.13, 0.18)
MAT_LED_EMIT = (1.0, 0.55, 0.05)
MAT_BEAM = (1.0, 0.78, 0.15)
MAT_OPTICAL_BENCH = (0.18, 0.19, 0.22)
MAT_CUVETTE_FLUID = (0.92, 0.78, 0.12)         # sample presence (desirable = in use)
MAT_CUVETTE_WALL = (0.75, 0.82, 0.88)
MAT_RUBBER_FOOT = (0.04, 0.04, 0.045)
MAT_STATUS_LED = (0.15, 0.85, 0.35)
MAT_CUTAWAY_SHELL = (0.10, 0.11, 0.12)         # translucent cutaway body cue

# ── Fitts / control taxonomy ──────────────────────────────────────────────
BUTTON_SHAPE = "square"
# Proud enough that 3/4 product shots read a D-pad, not a flush texture.
BUTTON_TRAVEL_MM = 3.2
# INTENT (2219/2237 SIGHT): keys without a deck recess cast a soft-shadow gap
# even when nested. Centre near deck_top (nest≈0) + cut a well under each key
# so the crown reads seated, not hovering. Crown ≈ travel/2 above deck.
BUTTON_NEST_FRAC = 0.05
BUTTON_WELL_DEPTH_MM = 1.4
BUTTON_WELL_OVERSIZE = 1.18
SCREW_HEAD_DIAMETER_MM = 3.2
SCREW_HEAD_HEIGHT_MM = 1.2
DISPLAY_BEZEL_MARGIN_MM = 2.5
DISPLAY_GLASS_THICKNESS_MM = 1.6

# ── Optical use-physics floors ────────────────────────────────────────────
CUVETTE_BODY_CLEAR_H_MM = 38.0
OPTICAL_CUBE_MIN_PLAN_MM = 36.0
OPTICAL_CUBE_MAX_ASPECT = 1.45
WELL_RIM_OVERSIZE_MM = 4.0
CABLE_CHANNEL_MIN_W_MM = 4.0

# ── Render presentation (product photography) ─────────────────────────────
# Soft studio world + softbox lights live in forge_blender_lib
# (make_instrument_studio_world / add_instrument_studio_lights). Defaults:
INSTRUMENT_CYCLES_SAMPLES_DEFAULT = 128
# 2026-07-25: 3600×2400 (8.6M px) × CPU Cycles × the glass-heavy material pass OOM-crashed
# the multi-view render partway (the 00-hero CUTAWAY + module pages went MISSING, so the
# Renders tab shipped no internal image). 2400×1600 (3.8M px) cuts peak memory ~2.3× — still
# far sharper than the Excel/PDF embed size — so all ~25 views (inspect + product + hero +
# ghost + modules) complete in one process. Pairs with the Cycles bounce/tile caps in
# forge_blender_lib.init_scene_cycles_hero.
INSTRUMENT_RENDER_RESOLUTION = (2400, 1600)
# INTENT (2026-08-01 Tristan): FE traction pack planetary teeth are physically
# fine (m≈0.6 mm) — correct design, not a bug. At 2400×1600 the same framing
# gives ~9 px of tooth depth on a planet, which reads as "striations". Double
# the pixels at IDENTICAL camera framing so the teeth resolve; do NOT enlarge
# the gears (that would be a fake design change). Traction packs are metal-
# heavy (not the glass-heavy instrument OOM case that forced 2400 for sealed
# instruments). Override: BLENDER_RENDER_RESOLUTION=WxH.
TRACTION_RENDER_RESOLUTION = (4800, 3200)
TRACTION_CATALOGUE_RENDER_RESOLUTION = (7200, 4800)
# GOTCHA: never lift exposure for instruments — softboxes already model the
# form; +0.15 crushed charcoal to clay-white (2026-07-13).
INSTRUMENT_EXPOSURE_LIFT = 0.0
INSTRUMENT_EXPOSURE_BIAS = 0.0               # softboxes model form; bias crush → featureless black
# Softbox energies (Watts) — sized for ~150 mm charcoal polymer, not plants.
# Target sealed exterior body-face mean ≈90–110 (gold ≈103).
INSTRUMENT_STUDIO_KEY_ENERGY = 18.0
INSTRUMENT_STUDIO_FILL_ENERGY = 7.0
INSTRUMENT_STUDIO_RIM_ENERGY = 32.0
INSTRUMENT_STUDIO_BOUNCE_ENERGY = 2.5
INSTRUMENT_STUDIO_WORLD_STRENGTH = 0.30
INSTRUMENT_STUDIO_GROUND_SRGB = (0.52, 0.53, 0.55)
# INTENT (2026-07-29): contact-shadow plane hugs the product. e×8 (~3.6 m under a
# ~0.4 m pack) made GLB/USDZ viewers open from miles away. Thin apron only.
INSTRUMENT_STUDIO_GROUND_APRON = 1.12


def instrument_studio_ground_size_m(extent_m: float,
                                   apron: float | None = None) -> float:
    """Edge length (metres) for the instrument studio contact-shadow plane.

    @param extent_m Characteristic product extent in metres (max edge).
    @param apron Multiplier over extent (≥1). Defaults to INSTRUMENT_STUDIO_GROUND_APRON.
    @returns Plane edge length in metres for Blender ``primitive_plane_add(size=)``.
    """
    e = max(0.08, float(extent_m))
    a = INSTRUMENT_STUDIO_GROUND_APRON if apron is None else float(apron)
    return e * max(1.0, a)
# SIGHT band for a sealed exterior BODY-FACE patch (8-bit mean RGB).
# Updated 2026-07-23: TRUE mid-grey body (0.47 sRGB ≈ 120/255 unlit; lit face
# ~130–200 under the softbox key). Band must reject BOTH near-black (charcoal
# regression) AND near-white (0.62 clipped the hero top face to ~230+).
TARGET_BODY_LUM_MEAN_MAX = 210.0
TARGET_BODY_LUM_MEAN_MIN = 90.0
# Legacy aliases (centre-crop stats — prefer body_luminance_ok mean band).
TARGET_BODY_LUM_P50_MAX = 215
TARGET_BODY_LUM_P50_MIN = 80
TARGET_BODY_LUM_P10_MAX = 200
TARGET_BODY_LUM_P10_MIN = 25

# Silhouette: clear secondary volume (optical cube) ≥ this fraction of body height.
CUBE_TO_BODY_HEIGHT_MIN = 0.55
# L-step under the cube must read as a joint, not a hairline.
STEP_SHELF_HEIGHT_MM = 8.0
# Ambient-light CAP is an ACCESSORY lid (flange + grip), never a rotary knob.
CAP_STYLE = "ambient_lid"          # flange disk + narrower grip cylinder
CAP_FLANGE_OVERSIZE = 1.18         # flange OD / seating rim OD
CAP_GRIP_RATIO = 0.62              # grip OD / flange OD
CAP_FLANGE_H_MM = 2.5
CAP_GRIP_H_MM = 9.0
# Park nest: shallow deck recess so the cap reads "belongs here," not "knob on top."
CAP_NEST_DEPTH_MM = 1.2
CAP_NEST_CLEARANCE_MM = 1.5
# Rubber feet — every desirable handheld sits on soft feet, not a raw polymer belly.
FOOT_DIAMETER_MM = 8.0
FOOT_HEIGHT_MM = 2.2
FOOT_INSET_FRAC = 0.12             # inset from each plan edge
# Status LED — tiny alive cue next to the glass (product is powered / ready).
STATUS_LED_DIAMETER_MM = 2.2
# Edge language: presentation bevel already exists; soft-touch deck contrast is required.
DECK_CONTRAST_REQUIRED = True

# ── Interior layout (cutaway desirability) ────────────────────────────────
INTERIOR_PCB_THICKNESS_MM = 1.6
INTERIOR_COIN_CELL_R_MM = 10.0
INTERIOR_COIN_CELL_H_MM = 3.2
INTERIOR_BEAM_CROSS_MM = 5.0       # thick enough to read at thumbnail
INTERIOR_SOURCE_TO_DETECTOR = True
# Cutaway must not read as an empty box — minimum distinct story meshes.
INTERIOR_MIN_STORY_MESHES = 8
# Cutaway optical cube cue is translucent so the beam reads through it.
CUTAWAY_CUBE_ALPHA = 0.35
# Authenticity: plain axis-aligned boxes must not dominate the cutaway story.
# Authentic = CAD family import OR compound primitive (cyl/sphere/hollow/pipe).
INTERIOR_MAX_PLAIN_BOX_FRACTION = 0.40
INTERIOR_MIN_AUTHENTIC_MESHES = 5
# forge-truth CAD families for instrument cutaways (seeded via seed_internal_cad_assets).
CAD_FAMILY_INSTRUMENT_PCB = "instrument_pcb"
CAD_FAMILY_PCB_BOARD = "pcb_board"
CAD_FAMILY_COIN_CELL = "coin_cell"
CAD_FAMILY_CUVETTE = "square_cuvette"
CAD_FAMILY_LED = "led_emitter"
CAD_FAMILY_PHOTODIODE = "photodiode_to_can"


def interior_authenticity_ok(stats: dict) -> bool:
    """proveCatch: cutaway story is not mostly axis-aligned cuboids.

    @param stats Dict with n_story, n_plain_box, n_authentic (from placement).
    @returns True when density + authenticity floors hold.
    """
    n = int(stats.get("n_story", 0) or 0)
    n_box = int(stats.get("n_plain_box", 0) or 0)
    n_auth = int(stats.get("n_authentic", 0) or 0)
    if n < INTERIOR_MIN_STORY_MESHES:
        return False
    if n_auth < INTERIOR_MIN_AUTHENTIC_MESHES:
        return False
    return (n_box / max(1, n)) <= INTERIOR_MAX_PLAIN_BOX_FRACTION


def button_plan_size_mm(diameter_mm: float) -> tuple[float, float, float]:
    """Square tactile key outer size from the HIG diameter."""
    d = max(BUTTON_MIN_DIAMETER_MM, float(diameter_mm))
    return (d, d, BUTTON_TRAVEL_MM)


# INTENT (2026-07-17 SIGHT colorimeter-2053/2219): closed-product tip may clear
# the rim so the shot reads "in use", but MUST NOT free-stand as a pale column
# above the optical cube (vision: "floating detached cylinder"). 2219 still
# showed an 11 mm stub above the tower — keep tip ≤4 mm above rim.
EXTERIOR_CUVETTE_PROUD_MM = 3.5
EXTERIOR_CUVETTE_MAX_PROUD_MM = 5.0


def exterior_cuvette_seat_mm(
    well_xy: tuple[float, float],
    rim_top_z: float,
    tower_top_z: float,
    tower_h_mm: float,
    well_plan_mm: float,
) -> dict:
    """Seat the closed-product cuvette insert + fluid inside the optical cube.

    @description Tip clears the rim by EXTERIOR_CUVETTE_PROUD_MM; body nests into
                 the cube so fluid_bottom stays below tower_top (no floating column).
                 Exterior fluid is optional (hide_exterior_fluid) — yellow sample
                 above the collar was the 2053 "detached cylinder" cue.
    @returns Dict with cuv_h, cuv_xy, cuv_loc (x,y,z), fluid_loc, fluid_size,
             hide_exterior_fluid.
    """
    cuv_h = min(float(tower_h_mm) * 0.55, 24.0)
    cuv_xy = max(7.5, float(well_plan_mm) * 0.85)
    proud = float(EXTERIOR_CUVETTE_PROUD_MM)
    cuv_z = float(rim_top_z) + proud - cuv_h / 2.0
    # Fluid stays deep in the well — never a free-standing blob above the cube.
    fluid_h = cuv_h * 0.35
    fluid_z = float(tower_top_z) - float(tower_h_mm) * 0.18
    fluid_bottom = fluid_z - fluid_h / 2.0
    if fluid_bottom > float(tower_top_z) - 2.0:
        shift = fluid_bottom - (float(tower_top_z) - 2.0)
        fluid_z -= shift
    # Tip must clear rim by ≤ MAX; if seat math drifts, pull the glass down.
    cuv_top = cuv_z + cuv_h / 2.0
    if cuv_top - float(rim_top_z) > EXTERIOR_CUVETTE_MAX_PROUD_MM:
        cuv_z -= (cuv_top - float(rim_top_z) - EXTERIOR_CUVETTE_PROUD_MM)
    wx, wy = well_xy
    return {
        "cuv_h": cuv_h,
        "cuv_xy": cuv_xy,
        "cuv_loc": (wx, wy, cuv_z),
        "fluid_loc": (wx, wy, fluid_z),
        "fluid_size": (cuv_xy * 0.65, cuv_xy * 0.65, fluid_h),
        "proud_mm": proud,
        "cuv_top_z": cuv_z + cuv_h / 2.0,
        "fluid_bottom_z": fluid_z - fluid_h / 2.0,
        # DECISION (2219 SIGHT): hide yellow fluid on closed exterior — glass tip
        # in the rim is enough "in use"; fluid column was the vision cylinder.
        "hide_exterior_fluid": True,
    }


def display_bezel_size_mm(display_size: tuple[float, float, float]) -> tuple[float, float, float]:
    """Bezel frame slightly larger than the active glass."""
    w, h, _t = display_size
    m = DISPLAY_BEZEL_MARGIN_MM
    return (w + 2.0 * m, h + 2.0 * m, max(1.0, _t * 0.6))


def ambient_cap_parts_mm(rim_od_mm: float) -> dict:
    """Ambient-light lid geometry — flange + grip (not a single knob cylinder).

    @description Beer–Lambert accessory: seats on the well rim. Flange reads as a
                 lid; narrower grip reads as "lift me," not "turn me."
    @param rim_od_mm Circular seating rim outer diameter.
    @returns Dict with flange_od/h and grip_od/h in mm.
    """
    flange_od = float(rim_od_mm) * CAP_FLANGE_OVERSIZE
    grip_od = flange_od * CAP_GRIP_RATIO
    return {
        "flange_od_mm": flange_od,
        "flange_h_mm": CAP_FLANGE_H_MM,
        "grip_od_mm": grip_od,
        "grip_h_mm": CAP_GRIP_H_MM,
        "total_h_mm": CAP_FLANGE_H_MM + CAP_GRIP_H_MM,
    }


def foot_locs_mm(W: float, D: float, base_z: float) -> list[tuple[float, float, float]]:
    """Four rubber feet inset from the plan corners (desirable product sit)."""
    inset_x = W * FOOT_INSET_FRAC
    inset_y = D * FOOT_INSET_FRAC
    z = base_z - FOOT_HEIGHT_MM * 0.45
    return [
        (-W / 2 + inset_x, -D / 2 + inset_y, z),
        (W / 2 - inset_x, -D / 2 + inset_y, z),
        (-W / 2 + inset_x, D / 2 - inset_y, z),
        (W / 2 - inset_x, D / 2 - inset_y, z),
    ]


def material_roles_ok() -> bool:
    """proveCatch: glass darker than body; FR4 green; cap darker than deck."""
    glass_luma = sum(MAT_DISPLAY_GLASS) / 3.0
    body_luma = sum(MAT_BODY_POLYMER) / 3.0
    cap_luma = sum(MAT_CAP) / 3.0
    deck_luma = sum(MAT_DECK_A_SURFACE) / 3.0
    fr4_g = MAT_FR4[1]
    return (
        glass_luma < body_luma
        and fr4_g > 0.30
        and MAT_FR4[0] < 0.15
        and cap_luma < deck_luma
    )


def desirability_silhouette_ok(body_h_mm: float, cube_h_mm: float, step_h_mm: float) -> bool:
    """proveCatch: optical cube and L-step read as intentional secondary volume."""
    if body_h_mm <= 0:
        return False
    return (
        cube_h_mm / body_h_mm >= CUBE_TO_BODY_HEIGHT_MIN
        and step_h_mm >= STEP_SHELF_HEIGHT_MM * 0.85
    )


def body_luminance_mean(png_path: str) -> float | None:
    """Body-face mean luminance (8-bit RGB mean) for directional routing.

    INTENT: vision_route_fix needs the numeric value — boolean ok alone
    cannot distinguish clay (>130) from crushed (<70). Same patch as
    body_luminance_ok. Returns None if imaging libs / file unavailable.
    """
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return None
    try:
        im = np.asarray(Image.open(png_path).convert("RGB"), dtype=np.float32)
    except OSError:
        return None
    h, w, _ = im.shape
    patch = im[h * 42 // 100 : h * 58 // 100, w * 32 // 100 : w * 55 // 100]
    return float(patch.mean())


def body_luminance_ok(
    png_path: str,
    *,
    mean_max: float = 130.0,
    mean_min: float = 70.0,
) -> bool:
    """proveCatch: product-body patch stays charcoal (not clay, not crushed).

    INTENT: SIGHT after render — gold open-photometer body ≈103 mean; clay-wash
    ≈150+; crushed ≈30–50. Sample the LOWER-CENTRE product face — NOT a full
    centre crop (dark studio void tanks the median and false-fails).
    """
    mean = body_luminance_mean(png_path)
    if mean is None:
        return True  # skip when imaging libs unavailable in CI
    return mean_min <= mean <= mean_max


# ── Thermocycler / PCR benchtop form (tip-back hinged lid) ────────────────
# INTENT: a SECOND instrument form family beside the optical handheld.
# Keyed on class slug + thermal/sample-block part vocabulary — never
# `if product == "ninjapcr"`. Brand nouns below are TRAINING synonyms only
# (briefs that say "NinjaPCR class" still mean this form).
#
# Physical rule: hinged lid opens tip-back (−Rx in Blender: +Y = rear) so the
# outer-face pressure knob faces up/rear; product cams must look DOWN onto that
# face or the knob is occluded behind the lid slab.

THERMOCYCLER_CLASS_RE = re.compile(
    r"thermocycler|thermal[_ -]?cycler|\bpcr\b", re.I)
# TRAINING synonyms → same form (not product-specific branches).
THERMOCYCLER_CLASS_ALIAS_RE = re.compile(r"ninjapcr|openpcr", re.I)
THERMOCYCLER_PART_RE = re.compile(
    r"peltier|tec[_ -]?module|sample[_ -]?block|thermal[_ -]?block|pcr[_ -]?tube|"
    r"tube[_ -]?well|heatsink[_ -]?fan", re.I)

# Blender hinge: −Rx raises the lid front edge (y<0); +Rx dumps it into the cavity.
# DECISION (2026-07-17 NinjaPCR lid-crop SIGHT): −45° tipped the outer face so
# far toward +Y/rear that the star only read as jagged spikes on the lid lip.
# −38° keeps the cavity + platen readable while leaving more outer-face area
# toward the high product cam (ext_z≈2.1).
TIPBACK_LID_OPEN_RX_DEG = -38.0

# Product-camera framing for tip-back lids (fractions of envelope height / depth).
# RULE: elevate eye + bias look-at toward the rear hinge so outer-face controls read.
TIPBACK_LID_CAM_EXT_Z = 2.10
TIPBACK_LID_CAM_SIDE_Z = 1.85
TIPBACK_LID_CAM_TGT_Z = 0.95
TIPBACK_LID_CAM_TGT_Y_FRAC = 0.12
# INTENT (2026-07-17 NinjaPCR 1257): cutaway hero height occupancy was 0.43
# (drawing_gates floor 0.45). Pull hero in + slight look-down so wood box +
# tip-back lid fill the frame without cropping the star knob.
# DECISION: 0.70 unproven on cold run; 0.43→0.45 is thin — 0.62 + proveCatch ≤0.65.
TIPBACK_LID_CAM_HERO_Z = 1.38
TIPBACK_LID_CAM_HERO_TGT_Z = 0.78
TIPBACK_LID_CAM_HERO_TGT_Y_FRAC = 0.10
TIPBACK_LID_CAM_FRONT_DIST_SCALE = 0.88
# INTENT (NinjaPCR 1257/2302): product_cutaway height occupancy 0.43→0.445 on
# 00-hero — tipback lid needs a closer hero. 0.55 still lands 0.445 raw (float
# dust vs 0.45 floor). 0.50 clears with margin without clipping the deck knob.
TIPBACK_LID_CAM_HERO_DIST_SCALE = 0.50

# Vision: outer-face lid controls are clearest on the sealed product exterior,
# not the cutaway hero (foreshortens the tip-back knob).
TIPBACK_LID_VISION_IMAGE_CANDIDATES = (
    "04-product-exterior.png",
    "00-hero.png",
    "blender-cover.png",
    "07-product-service.png",
)


def is_bench_power_instrument_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> bool:
    """True for multi-channel source/sink bench power instruments (not PCR).

    @description Universal form gate keyed on channel power + precision AFE +
                 thermal/mains signals — NEVER a cell_cycler product class.
                 Must win before is_thermocycler_form: bare Peltier/heatsink-fan
                 part vocab would otherwise select tip-back PCR skin.
    """
    if not is_instrument:
        return False
    pc = product_class or ""
    blob = part_blob or ""
    # Authoritative class/alias tokens (training synonyms only — not a new class table).
    if re.search(
        r"cell[_ -]?cycler|battery[_ -]?cycler|source[_ -]?sink|"
        r"electronic[_ -]?load|channel[_ -]?cycler",
        pc,
        re.I,
    ):
        return True
    has_channel_power = bool(re.search(
        r"source[_ -]?sink|linear[_ -]?discharge|pass[_ -]?bank|"
        r"channel[_ -]?power|hardware[_ -]?cutout|over[_ -]?under[_ -]?voltage|"
        r"discharge[_ -]?load|charge[_ -]?current",
        blob,
        re.I,
    ))
    has_precision_afe = bool(re.search(
        r"\bafe\b|kelvin|precision[_ -]?adc|current[_ -]?shunt|"
        r"precision[_ -]?voltage[_ -]?reference",
        blob,
        re.I,
    ))
    has_thermal_or_mains = bool(re.search(
        r"peltier|tec[_ -]?module|cell[_ -]?bay|iec[_ -]?c14|"
        r"isolated[_ -]?ac[_ -]?dc|mains[_ -]?fuse",
        blob,
        re.I,
    ))
    # Need channel power + measurement; thermal/mains confirms instrument envelope.
    return has_channel_power and has_precision_afe and has_thermal_or_mains


# INTENT (2026-07-29): traction MGU+MCU+gear packs are sealed product-scale
# cabinets with rotating-machine morphology — never optical-handheld / lab-electronics.
# Noun signal on class + part vocab + contract quantities (phase current / shaft torque).
TRACTION_DRIVE_CLASS_RE = re.compile(
    r"\bmgu\b|_mgu\b|mgu_|motor[_ -]?generator|traction|powertrain|"
    r"drive[_ -]?unit|ev[_ -]?drive|rear[_ -]?mgu|front[_ -]?mgu|"
    r"\bfpk\b|ipmsm",
    re.I,
)


def is_traction_bay_fill_form(*, product_class: str = "") -> bool:
    """True when packaging bay volume IS the exterior form (front-axle FPK class).

    INTENT: Front MGU shape is forced by the available front-axle bay (wishbones,
    uprights, steering, crash structure, halfshaft height). That is a different
    morphology from an open rear cradle cassette in manufacturer volume.
    Universal — keyed on front/fpk nouns, never a Lucid silhouette paste.
    """
    pc = product_class or ""
    return bool(re.search(r"front[_ -]?mgu|front[_ -]?powertrain|\bfpk\b", pc, re.I))
TRACTION_DRIVE_PART_RE = re.compile(
    r"traction[_ -]?ipmsm|sic[_ -]?traction|reduction[_ -]?gear|"
    r"mgu[_ -]?cold[_ -]?plate|output[_ -]?shaft|hv[_ -]?dc[_ -]?connector|"
    r"phase[_ -]?current[_ -]?sensor|motor[_ -]?generator|ipmsm",
    re.I,
)


def is_traction_drive_pack_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    quantities: dict | None = None,
) -> bool:
    """True for sealed traction MGU+MCU+gear packs (universal noun/quantity signal).

    @description Form gate for motor housing + shaft + gearbox + inverter brick
                 morphology. Never product-named. Class/part vocab wins; contract
                 quantities (shaft torque / phase current ≥100 A) corroborate when
                 class slug is thin. Independent of isInstrumentDevice — traction
                 packs are plantish-product sealed cabinets, not lab instruments.
    """
    pc = product_class or ""
    blob = part_blob or ""
    if TRACTION_DRIVE_CLASS_RE.search(pc):
        return True
    if TRACTION_DRIVE_PART_RE.search(blob):
        return True
    q = quantities or {}
    def _qv(key: str) -> float:
        raw = q.get(key)
        if isinstance(raw, dict):
            try:
                return float(raw.get("value"))
            except (TypeError, ValueError):
                return float("nan")
        try:
            return float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return float("nan")
    torque = _qv("mgu_shaft_torque_nm")
    iph = _qv("phase_current_max_a")
    if (torque == torque and torque > 0) or (iph == iph and iph >= 100):
        # Quantity-only path still needs a traction noun somewhere so a random
        # high-current plant does not flip (CORE FIX PRINCIPLE — noun signal).
        return bool(re.search(r"mgu|traction|ipmsm|inverter|gear", blob + " " + pc, re.I))
    return False


def is_thermocycler_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> bool:
    """True for benchtop PCR / thermocycler form — class or part vocabulary.

    @description Form gate for tip-back lid skin, thermal interior, and PCR
                 vision rubrics. RULE: class/alias slug is authoritative (even if
                 `isInstrumentDevice` was dropped from state). Part-vocabulary
                 match only applies on device-scale instruments — avoids a plant
                 BoM word containing "peltier" flipping a process plant into PCR
                 skin. Brand aliases are TRAINING synonyms for the form only.
    @param product_class Chain product_class slug / brief class token
    @param part_blob Concatenated part name_human text (peltier / sample block…)
    @param is_instrument Device-scale instrument flag (gates part-vocab path only)
    @returns True when this form family's rules should apply
    """
    pc = product_class or ""
    blob = part_blob or ""
    if THERMOCYCLER_CLASS_RE.search(pc) or THERMOCYCLER_CLASS_ALIAS_RE.search(pc):
        return True
    if not is_instrument:
        return False
    # GOTCHA (Pioreactor 0250): part vocab `peltier|tec_module` flipped a
    # benchtop_bioreactor into tip-back PCR skin (form-meshes=thermocycler).
    # Lab-electronics class slugs are authoritative — TEC/cartridge heater is
    # vial thermal control, not a PCR sample-block product.
    if LAB_ELECTRONICS_CLASS_RE.search(pc):
        return False
    # GOTCHA (2026-07-27 cell-cycler): Peltier + heatsink_fan also appear on
    # source/sink power instruments — those must never get tip-back PCR lids.
    if is_bench_power_instrument_form(
        product_class=pc, part_blob=blob, is_instrument=is_instrument,
    ):
        return False
    return bool(THERMOCYCLER_PART_RE.search(blob))


def tipback_lid_open_rx_deg() -> float:
    """Hinge open angle (deg) for tip-back PCR lids — always negative in Blender."""
    return float(TIPBACK_LID_OPEN_RX_DEG)


def tipback_lid_product_cam_fractions() -> dict:
    """Named camera fractions for tip-back hinged-lid product shots.

    @returns Dict of elevation / look-at fractions keyed for Blender product cams.
    """
    return {
        "ext_z": TIPBACK_LID_CAM_EXT_Z,
        "side_z": TIPBACK_LID_CAM_SIDE_Z,
        "tgt_z": TIPBACK_LID_CAM_TGT_Z,
        "tgt_y_frac": TIPBACK_LID_CAM_TGT_Y_FRAC,
        "hero_z": TIPBACK_LID_CAM_HERO_Z,
        "hero_tgt_z": TIPBACK_LID_CAM_HERO_TGT_Z,
        "hero_tgt_y_frac": TIPBACK_LID_CAM_HERO_TGT_Y_FRAC,
        "front_dist_scale": TIPBACK_LID_CAM_FRONT_DIST_SCALE,
        "hero_dist_scale": TIPBACK_LID_CAM_HERO_DIST_SCALE,
    }


def tipback_lid_vision_image_candidates() -> tuple[str, ...]:
    """Image preference order when outer-face lid controls must be judged."""
    return TIPBACK_LID_VISION_IMAGE_CANDIDATES


# ── Multi-channel linear dosing / syringe-pump form (OPEN array) ──────────
# INTENT: a THIRD instrument form family. Function forces N parallel
# stepper→leadscrew→carriage→plunger-clamp bays + a control spine.
# OPEN mechanism is the product face (maker instrument) — never a sealed
# empty cube. Brand aliases (poseidon) are TRAINING synonyms only.
#
# DECISION: keyed on class slug + motion/fluid part vocabulary, same
# discipline as is_thermocycler_form — never `if product == "poseidon"`.

SYRINGE_PUMP_CLASS_RE = re.compile(
    r"syringe[_ -]?pump|multi[_ -]?channel[_ -]?syringe|programmable[_ -]?syringe", re.I)
SYRINGE_PUMP_CLASS_ALIAS_RE = re.compile(r"\bposeidon\b", re.I)
SYRINGE_PUMP_PART_RE = re.compile(
    r"syringe|plunger|lead[_ -]?screw|leadscrew|carriage|guide[_ -]?rail|"
    r"stepper|nema\s*17|microstep|infus(?:e|ion)|withdraw", re.I)

# Parametric bay geometry (mm) — scales with channel_count, not brand.
SP_BAY_PITCH_MM = 78.0
SP_BAY_LENGTH_MM = 230.0          # motor → tip cradle (syringe stroke class)
SP_BAY_HEIGHT_MM = 78.0
SP_BASE_MARGIN_MM = 18.0
SP_CONSOLE_WIDTH_MM = 150.0
SP_CONSOLE_DEPTH_MM = 170.0
SP_CONSOLE_HEIGHT_MM = 85.0
SP_STEPPER_FACE_MM = 42.0         # NEMA17 face class
SP_RAIL_GAP_MM = 28.0
SP_SCREW_DIAMETER_MM = 8.0
SP_CARRIAGE_L_MM = 36.0
SP_CARRIAGE_TRAVEL_FRAC = 0.42    # carriage mid-stroke for readability
SP_SYRINGE_LENGTH_MM = 105.0
SP_SYRINGE_DIAMETER_MM = 20.0
SP_CLAMP_STAR_OD_MM = 24.0
SP_CLAMP_STAR_LOBES = 5
SP_COUPLER_LEN_MM = 18.0
SP_COUPLER_OD_MM = 16.0
# INTENT (gold convergent 2026-07-16): harness must read as a multi-conductor
# braid into the control spine — thin 4.5 mm stubs vanished in product cams.
SP_HARNESS_OD_MM = 7.5
SP_TUBING_OD_MM = 2.8
SP_CRADLE_ANGLE_DEG = 22.0       # tip cradle tips forward (gold printed aesthetic)
# Modular bay chassis — LOW side rails + 45° nose (gold open printed frame).
# GOTCHA (2026-07-16 SIGHT): side_h ≥58 mm closed into white crates and hid the
# lead-screw / blue carriage — gold keeps the mechanism as the product face.
SP_CHASSIS_WALL_T_MM = 4.5
SP_CHASSIS_FLOOR_H_MM = 5.0
SP_CHASSIS_NOSE_DEG = 45.0
# INTENT (gold twinship 2026-07-16): bulky printed U-channel ~NEMA height at
# the rear; mid-bay stays OPEN so lead-screw + blue carriage remain the face.
# Side height alone ≠ crate — crate is solid mid-grey fill (glance CRATE_WALLS).
SP_CHASSIS_SIDE_H_MM = 34.0
SP_CHASSIS_REAR_H_MM = 48.0  # motor shelf / rear bulk (gold printed bay)
# Tipped landscape tablet docked on console front (gold ~25–30° from vertical).
# GOTCHA (final6 SIGHT): tilt≥62° + under-top-plate dock hid the face in iso —
# tip less, park in front of the posts so screen is a cool billboard.
SP_DISPLAY_TILT_DEG = 58.0
SP_TABLET_W_MM = 160.0
SP_TABLET_H_MM = 108.0
SP_TABLET_T_MM = 10.0
SP_UI_BEZEL_MM = 4.0
SP_TABLET_YAW_DEG = -18.0  # yaw into 3/4 hero so screen ≠ edge shard
# Cam: tip more toward operator so HMI face (not bezel edge) fills the glance crop.
SP_CAM_EXT_Z = 0.36
# Microfluidic stage chip on console top (gold wet-path gather target).
SP_CHIP_W_MM = 78.0
SP_CHIP_D_MM = 52.0
SP_CHIP_H_MM = 6.0
SP_SYRINGE_TIP_OD_MM = 6.5  # yellow luer tip cue (gold wet-path affordance)
SP_CONSOLE_POST_OD_MM = 12.0  # open frame posts (gold modular console)
# Product cams: OPEN array is wide+low — optical-instrument h×1.92 inflation
# left height occupancy ~0.39 (drawing_gates floor 0.45). Pull in + lower look.
SP_CAM_SIDE_Z = 0.45
SP_CAM_TGT_Z = 0.25
SP_CAM_FRONT_DIST_SCALE = 0.72
SP_CAM_H_EFF_SCALE = 1.05        # vs optical instrument 1.92 (no cuvette tower)
SP_CAM_DIST_K = 0.82
SP_CAM_FRAME = 0.82
SP_CAM_CENTRE_FRAC = 0.34
# Service cam (07-product-service): default used max(w,d)/aspect which left
# height occupancy ~0.31 on a wide+low array. Pull in + raise look at console.
SP_CAM_SERVICE_DIST_K = 0.78
SP_CAM_SERVICE_FRAME = 0.88
SP_CAM_SERVICE_Z = 0.95
SP_CAM_SERVICE_Y_FRAC = 0.72
SP_CAM_SERVICE_X_FRAC = 0.35
SP_CAM_SERVICE_TGT_Z = 0.28

# Mesh-name prefixes for deterministic SIGHT (form_converge_loop).
SP_MESH_PREFIX = "u_se_sp_"
SP_CHANNEL_PREFIX = "u_se_sp_ch"

# ── Lab microscope / flexure-stage form (OPEN printable) ─────────────────
# INTENT: a FOURTH instrument form family. Function forces cream AM body +
# sample stage + ≥3 geared actuators (X/Y/focus) + optics tube + transmitted
# illumination. OPEN printable structure is the product face — never a sealed
# charcoal optical handheld. Brand aliases (openflexure) are TRAINING synonyms.
#
# DECISION: keyed on class slug + optics/motion part vocabulary — never
# `if product == "openflexure"`.

LAB_MICROSCOPE_CLASS_RE = re.compile(
    r"lab[_ -]?microscope|flexure[_ -]?stage[_ -]?microscope|"
    r"motorised[_ -]?inverted[_ -]?microscope|"
    r"motorized[_ -]?inverted[_ -]?microscope", re.I)
LAB_MICROSCOPE_CLASS_ALIAS_RE = re.compile(r"\bopenflexure\b", re.I)
LAB_MICROSCOPE_PART_RE = re.compile(
    r"microscope|rms|objective|flexure|brightfield|autofocus|"
    r"xy[\s_-]?stage|focus[\s_-]?(?:travel|actuator|motor)|condenser|"
    r"illumination|optics[\s_-]?tube|sangaboard", re.I)

LM_MESH_PREFIX = "u_se_lm_"
# Envelope (mm) — compact printed-stage research microscope class.
LM_ENV_W_MM = 200.0
LM_ENV_D_MM = 180.0
LM_ENV_H_MM = 240.0
LM_BODY_W_MM = 110.0
LM_BODY_D_MM = 110.0
LM_BODY_H_MM = 95.0
LM_STAGE_W_MM = 85.0
LM_STAGE_D_MM = 70.0
LM_STAGE_T_MM = 8.0
LM_SLIDE_W_MM = 76.0
LM_SLIDE_D_MM = 26.0
LM_SLIDE_T_MM = 1.6
LM_STEPPER_FACE_MM = 42.0
LM_LEADSCREW_OD_MM = 8.0
LM_OPTICS_TUBE_OD_MM = 32.0
LM_OPTICS_TUBE_H_MM = 70.0
LM_CONDENSER_OD_MM = 36.0
LM_ILLUM_ARM_H_MM = 70.0
LM_SBC_W_MM = 65.0
LM_SBC_D_MM = 30.0
# Cream FDM body (gold printed polymer) — not charcoal optical handheld.
# Slightly lifted cream so product-hero AgX still clears glance cream_frac.
LM_MAT_BODY_CREAM = (0.94, 0.90, 0.82)
LM_MAT_BODY_CREAM_DK = (0.82, 0.78, 0.70)
# Product cams: taller than wide OPEN array — pull in hard enough that
# drawing_gates render_view_quality clears height occupancy ≥0.45 and edge
# density ≥0.002 on cream-on-studio product shots (OpenFlexure 0101: 0.90/0.88
# landed h=0.44 + edge=0.0019 — float-dust FAIL). Closer than thermocycler tipback
# 0.50 hero; cream body has weak FIND_EDGES contrast so fill must be large.
# GOTCHA (0101 heal): dist_k=0.78 / tgt_z=0.38 cleared height but left edge
# 0.00190 (still <0.0020) AND vision "severely cropped at the bottom" — look-at
# was too high on the optics tube. Pull in + look lower + hero uses same pack
# (sealed-instrument 1.92× h_eff left 00-hero at h=0.30).
LM_CAM_EXT_Z = 1.05
LM_CAM_SIDE_Z = 0.88
LM_CAM_TGT_Z = 0.10
LM_CAM_FRONT_DIST_SCALE = 0.78
LM_CAM_H_EFF_SCALE = 1.12
LM_CAM_DIST_K = 0.88   # 2026-07-19 SIGHT: 0.68 zoomed ~1.5× too close → the body
LM_CAM_FRAME = 0.90    # bottom + side actuators cropped out of 04. Pull back + add margin.
LM_CAM_CENTRE_FRAC = 0.36
LM_CAM_HERO_Z = 0.88
LM_CAM_HERO_TGT_Z = 0.06
LM_CAM_HERO_DIST_SCALE = 0.92
LM_CAM_HERO_FRONT_DIST_SCALE = 0.78


def is_lab_microscope_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> bool:
    """True for benchtop flexure-stage / motorised research microscope form.

    @description Form gate for OPEN printable microscope (stage + actuators +
                 optics + illumination). Class/alias is authoritative; part-vocab
                 only on instruments — avoids plant BoM words flipping form.
    @param product_class Chain product_class slug / brief class token
    @param part_blob Concatenated part name_human text
    @param is_instrument Device-scale flag (gates part-vocab path only)
    @returns True when this form family's rules should apply
    """
    pc = product_class or ""
    blob = part_blob or ""
    if LAB_MICROSCOPE_CLASS_RE.search(pc) or LAB_MICROSCOPE_CLASS_ALIAS_RE.search(pc):
        return True
    if not is_instrument:
        return False
    # GOTCHA: bare "optics" matches OD/spectrophotometry on bioreactors
    # (pioreactor-20260717-0514 emitted form=lab_microscope). Require a
    # microscope-specific optic noun — not generic optics/LED photometry.
    has_optics = bool(re.search(
        r"microscope|objective|\brms\b|brightfield|condenser|flexure", blob, re.I))
    has_motion = bool(re.search(
        r"flexure|stage|stepper|autofocus|focus[\s_-]?actuator|\bxy[\s_-]?stage\b",
        blob, re.I))
    return has_optics and has_motion


def lab_microscope_envelope_mm() -> tuple[float, float, float]:
    """Benchtop envelope for printed flexure-stage microscope class."""
    return (LM_ENV_W_MM, LM_ENV_D_MM, LM_ENV_H_MM)


def lab_microscope_product_cam_fractions() -> dict:
    """Named camera fractions for OPEN flexure-microscope product shots."""
    return {
        "ext_z": LM_CAM_EXT_Z,
        "side_z": LM_CAM_SIDE_Z,
        "tgt_z": LM_CAM_TGT_Z,
        "front_dist_scale": LM_CAM_FRONT_DIST_SCALE,
        "h_eff_scale": LM_CAM_H_EFF_SCALE,
        "dist_k": LM_CAM_DIST_K,
        "frame": LM_CAM_FRAME,
        "centre_frac": LM_CAM_CENTRE_FRAC,
        "hero_z": LM_CAM_HERO_Z,
        "hero_tgt_z": LM_CAM_HERO_TGT_Z,
        "hero_dist_scale": LM_CAM_HERO_DIST_SCALE,
        "hero_front_dist_scale": LM_CAM_HERO_FRONT_DIST_SCALE,
    }


def lab_microscope_checklist() -> list[str]:
    """Deterministic mesh-name stems that must exist after placement."""
    stems = [
        f"{LM_MESH_PREFIX}body",
        f"{LM_MESH_PREFIX}stage",
        f"{LM_MESH_PREFIX}slide",
        f"{LM_MESH_PREFIX}optics_tube",
        f"{LM_MESH_PREFIX}illum_arm",
        f"{LM_MESH_PREFIX}condenser",
        f"{LM_MESH_PREFIX}led",
        f"{LM_MESH_PREFIX}sbc",
    ]
    for axis in ("x", "y", "z"):
        stems.extend([
            f"{LM_MESH_PREFIX}act_{axis}_tower",
            f"{LM_MESH_PREFIX}act_{axis}_stepper",
            f"{LM_MESH_PREFIX}act_{axis}_screw",
        ])
    return stems


def lab_microscope_checklist_ok(mesh_names: list[str]) -> tuple[bool, list[str]]:
    """proveCatch / converge score: every required stem is present."""
    names = list(mesh_names or [])
    missing: list[str] = []
    for stem in lab_microscope_checklist():
        if not any(n.startswith(stem) or stem in n for n in names):
            missing.append(stem)
    return (len(missing) == 0, missing)


# ── FORM_FAMILIES registry (encode checklist §2.14) ───────────────────────
# INTENT: one table so a new instrument form registers detect/checklist/cams/
# glance without copy-pasting product branches across Blender + critics.
# glance_id → scripts/lib/form_render_glance.GLANCE_BY_FORM
FORM_FAMILIES: dict[str, dict] = {
    "optical_handheld": {
        "detect": "is_optical_handheld_form",
        "glance_id": "optical_handheld",
        "gold_why": "docs/plans/GOLD-WHY-instrument-rules.md",
        "vision_images": ("04-product-exterior.png", "00-hero.png"),
    },
    "lab_electronics": {
        # INTENT (Rodeostat 0201): USB/AFE/EWOD instruments must NOT inherit the
        # optical-bench cuvette story. Detect = class + watt-scale contract.
        "detect": "is_lab_electronics_form",
        "glance_id": "lab_electronics",
        "gold_why": "docs/plans/GOLD-WHY-instrument-rules.md",
        "vision_images": ("04-product-exterior.png", "00-hero.png"),
    },
    # INTENT (2026-07-27 cell-cycler cold-v4): multi-channel source/sink + AFE +
    # Peltier bay must NOT inherit tip-back PCR lid (THERMOCYCLER_PART_RE matches
    # bare peltier|heatsink_fan). Sealed power-instrument envelope — never a class.
    "bench_power_instrument": {
        "detect": "is_bench_power_instrument_form",
        "glance_id": "lab_electronics",
        "gold_why": "docs/plans/GOLD-WHY-instrument-rules.md",
        "vision_images": ("04-product-exterior.png", "00-hero.png"),
    },
    "thermocycler": {
        "detect": "is_thermocycler_form",
        "glance_id": "thermocycler",
        "gold_why": "docs/plans/GOLD-WHY-instrument-rules.md",
        "vision_images_fn": "tipback_lid_vision_image_candidates",
        "cam_fractions_fn": "tipback_lid_product_cam_fractions",
    },
    "syringe_pump": {
        "detect": "is_syringe_pump_form",
        "glance_id": "syringe_pump",
        "checklist_fn": "syringe_pump_checklist",
        "cam_fractions_fn": "syringe_pump_product_cam_fractions",
        "gold_why": "docs/plans/GOLD-WHY-syringe-pump-form.md",
        "vision_images": ("00-hero.png", "04-product-exterior.png"),
        "encode_checklist": "docs/plans/UNIVERSAL-ENCODE-CHECKLIST-2026-07-16.md",
    },
    "lab_microscope": {
        "detect": "is_lab_microscope_form",
        "glance_id": "lab_microscope",
        "checklist_fn": "lab_microscope_checklist",
        "cam_fractions_fn": "lab_microscope_product_cam_fractions",
        "gold_why": "docs/plans/GOLD-WHY-lab-microscope-form.md",
        "vision_images": ("00-hero.png", "04-product-exterior.png"),
        "encode_checklist": "docs/plans/UNIVERSAL-ENCODE-CHECKLIST-2026-07-16.md",
    },
}


# INTENT: sealed pocket/benchtop photometers — NOT every isInstrumentDevice.
# Class/alias authoritative; part-vocab only when instrument + optical nouns.
OPTICAL_HANDHELD_CLASS_RE = re.compile(
    r"optical[_ -]?handheld|optical[_ -]?instrument|colorimeter|colourimeter|"
    r"spectrophotometer|spectrometer|photometer|fluorometer|turbidity[_ -]?meter|"
    r"absorbance[_ -]?meter",
    re.I,
)
OPTICAL_HANDHELD_CLASS_ALIAS_RE = re.compile(
    r"open[_ -]?colorimeter|yuri[_ -]?0?1|handheld[_ -]?optical",
    re.I,
)
# Forms that must NEVER fall through to optical_handheld detect.
_OPTICAL_HANDHELD_EXCLUDE_RE = re.compile(
    r"bioreactor|pioreactor|ferment|potentiostat|rodeostat|thermo[_ -]?cycler|"
    r"\bpcr\b|microscope|flexure|opendrop|electrowetting|microfluid|"
    r"syringe[_ -]?pump|poseidon",
    re.I,
)


LAB_ELECTRONICS_CLASS_RE = re.compile(
    r"potentiostat|rodeostat|digital[_ -]?microfluidics|opendrop|electrowetting|"
    r"benchtop[_ -]?bioreactor|pioreactor|turbidostat|chemostat|"
    r"lab[_ -]?electronics|mixed[_ -]?signal",
    re.I,
)


def is_lab_electronics_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> bool:
    """True for sealed USB/bench electronics — AFE, EWOD, culture kit (not optical).

    @description Form gate for PCB-first instruments. Never selects when optical
                 handheld / microscope / thermocycler / syringe forms match.
    """
    pc = product_class or ""
    if not is_instrument:
        return False
    if is_optical_handheld_form(
        product_class=pc, part_blob=part_blob, is_instrument=is_instrument
    ):
        return False
    if is_lab_microscope_form(
        product_class=pc, part_blob=part_blob, is_instrument=is_instrument
    ):
        return False
    if is_thermocycler_form(
        product_class=pc, part_blob=part_blob, is_instrument=is_instrument
    ):
        return False
    if is_syringe_pump_form(
        product_class=pc, part_blob=part_blob, is_instrument=is_instrument
    ):
        return False
    return bool(LAB_ELECTRONICS_CLASS_RE.search(pc))


def is_optical_handheld_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> bool:
    """True for sealed handheld/benchtop optical photometers — not a catch-all.

    @description Form gate for cuvette/LED/photodiode instruments. Explicitly
                 excludes bioreactors, potentiostats, microscopes, etc. so
                 `isInstrumentDevice` alone never selects this family.
    """
    pc = product_class or ""
    blob = part_blob or ""
    if _OPTICAL_HANDHELD_EXCLUDE_RE.search(pc):
        return False
    if is_lab_microscope_form(
        product_class=pc, part_blob=blob, is_instrument=is_instrument
    ):
        return False
    if OPTICAL_HANDHELD_CLASS_RE.search(pc) or OPTICAL_HANDHELD_CLASS_ALIAS_RE.search(pc):
        return True
    if not is_instrument:
        return False
    # Part vocab: need a sealed photometry path — not OD-on-a-bioreactor alone.
    has_cuvette_path = bool(
        re.search(r"cuvette|sample[_ -]?chamber|optical[_ -]?path", blob, re.I)
    )
    has_photometry = bool(
        re.search(
            r"photodiode|phototransistor|spectrophot|colorimet|absorbance|"
            r"wavelength|monochrom",
            blob,
            re.I,
        )
    )
    return has_cuvette_path and has_photometry


def resolve_form_family(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> str | None:
    """Return form family id for this brief/parts — never a product noun branch.

    @returns form family id or None
    """
    if is_syringe_pump_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "syringe_pump"
    if is_lab_microscope_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "lab_microscope"
    # Bench power BEFORE thermocycler: shared Peltier vocab must not tip-back PCR.
    if is_bench_power_instrument_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "bench_power_instrument"
    if is_thermocycler_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "thermocycler"
    # GOTCHA (Pioreactor 0121 / Rodeostat 0201): optical_handheld is NOT a
    # catch-all for isInstrumentDevice — lab electronics get their own family.
    if is_optical_handheld_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "optical_handheld"
    if is_lab_electronics_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "lab_electronics"
    return None


def is_syringe_pump_form(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> bool:
    """True for multi-channel benchtop linear syringe-dosing form.

    @description Form gate for OPEN parallel actuator array + control spine.
                 Class/alias is authoritative; part-vocab only on instruments.
    @param product_class Chain product_class slug
    @param part_blob Concatenated part name_human text
    @param is_instrument Device-scale flag (gates part-vocab path only)
    @returns True when this form family's rules should apply
    """
    pc = product_class or ""
    blob = part_blob or ""
    if SYRINGE_PUMP_CLASS_RE.search(pc) or SYRINGE_PUMP_CLASS_ALIAS_RE.search(pc):
        return True
    if not is_instrument:
        return False
    # Need syringe + linear-drive signal together (avoid plant "pump" alone).
    has_syringe = bool(re.search(r"syringe|plunger", blob, re.I))
    has_linear = bool(re.search(
        r"lead[_ -]?screw|leadscrew|carriage|stepper|nema", blob, re.I))
    return has_syringe and has_linear


def syringe_pump_product_cam_fractions() -> dict:
    """Named camera fractions for OPEN-array product shots (wide+low benchtop).

    @returns Dict of elevation / look-at / framing keys for Blender product cams.
    """
    return {
        "ext_z": SP_CAM_EXT_Z,
        "side_z": SP_CAM_SIDE_Z,
        "tgt_z": SP_CAM_TGT_Z,
        "front_dist_scale": SP_CAM_FRONT_DIST_SCALE,
        "h_eff_scale": SP_CAM_H_EFF_SCALE,
        "dist_k": SP_CAM_DIST_K,
        "frame": SP_CAM_FRAME,
        "centre_frac": SP_CAM_CENTRE_FRAC,
        "service_dist_k": SP_CAM_SERVICE_DIST_K,
        "service_frame": SP_CAM_SERVICE_FRAME,
        "service_z": SP_CAM_SERVICE_Z,
        "service_y_frac": SP_CAM_SERVICE_Y_FRAC,
        "service_x_frac": SP_CAM_SERVICE_X_FRAC,
        "service_tgt_z": SP_CAM_SERVICE_TGT_Z,
    }


def syringe_pump_envelope_mm(channel_count: int) -> tuple[float, float, float]:
    """Benchtop envelope forced by N bays + control console beside the array.

    @param channel_count Independent syringe drives (≥1)
    @returns (W, D, H) mm — width across channels, depth along stroke, height
    """
    n = max(1, int(channel_count))
    array_w = n * SP_BAY_PITCH_MM + 2.0 * SP_BASE_MARGIN_MM
    w = array_w + SP_CONSOLE_WIDTH_MM + SP_BASE_MARGIN_MM
    d = max(SP_BAY_LENGTH_MM, SP_CONSOLE_DEPTH_MM) + 2.0 * SP_BASE_MARGIN_MM
    h = max(SP_BAY_HEIGHT_MM, SP_CONSOLE_HEIGHT_MM) + SP_BASE_MARGIN_MM
    return (w, d, h)


def syringe_pump_channel_locs_mm(
    channel_count: int,
    *,
    origin_x: float = 0.0,
    origin_y: float = 0.0,
    base_z: float = 0.0,
) -> list[dict]:
    """Per-channel world anchors for stepper / screw / carriage / cradle.

    INTENT: convergent layout — channels share Y (stroke axis) and step in X.
    Control console sits at +X beyond the last bay (caller places separately).

    @returns List of dicts with loc keys in mm for one bay each.
    """
    n = max(1, int(channel_count))
    env_w, env_d, _env_h = syringe_pump_envelope_mm(n)
    array_w = n * SP_BAY_PITCH_MM
    # Array centred left of console; console occupies right band.
    array_cx = origin_x - SP_CONSOLE_WIDTH_MM / 2.0
    x0 = array_cx - array_w / 2.0 + SP_BAY_PITCH_MM / 2.0
    y_motor = origin_y + env_d * 0.28
    y_tip = origin_y - env_d * 0.32
    stroke = abs(y_motor - y_tip) - SP_STEPPER_FACE_MM
    locs: list[dict] = []
    for i in range(n):
        x = x0 + i * SP_BAY_PITCH_MM
        y_car = y_motor - SP_STEPPER_FACE_MM * 0.6 - stroke * SP_CARRIAGE_TRAVEL_FRAC
        locs.append({
            "index": i + 1,
            "x": x,
            "y_motor": y_motor,
            "y_tip": y_tip,
            "y_carriage": y_car,
            "z_axis": base_z + SP_BAY_HEIGHT_MM * 0.45,
            "z_base": base_z,
            "stroke_mm": stroke,
        })
    return locs


def syringe_pump_checklist(channel_count: int) -> list[str]:
    """Deterministic mesh-name stems that must exist after placement.

    @description form_converge_loop scores these without an LLM — hundreds of
                 Blender rounds stay cheap.
    """
    n = max(1, int(channel_count))
    # Global: base + console body/top/display + bundled harness trunk.
    stems = [
        f"{SP_MESH_PREFIX}base",
        f"{SP_MESH_PREFIX}console",
        f"{SP_MESH_PREFIX}console_top",
        f"{SP_MESH_PREFIX}console_tablet",
        f"{SP_MESH_PREFIX}console_display",
        f"{SP_MESH_PREFIX}console_chip",
        f"{SP_MESH_PREFIX}harness_trunk",
    ]
    for i in range(1, n + 1):
        p = f"{SP_CHANNEL_PREFIX}{i}_"
        stems.extend([
            f"{p}chassis_floor",
            f"{p}chassis_side_l",
            f"{p}chassis_side_r",
            f"{p}chassis_nose",
            f"{p}stepper",
            f"{p}coupler",
            f"{p}leadscrew",
            f"{p}carriage",
            f"{p}rail_a",
            f"{p}rail_b",
            f"{p}cradle",
            f"{p}cradle_v_a",
            f"{p}clamp_barrel",
            f"{p}clamp_plunger",
            f"{p}syringe",
            f"{p}tubing",
            f"{p}harness",
            f"{p}wire0",
            f"{p}wire1",
        ])
    return stems


def syringe_pump_checklist_ok(mesh_names: list[str], channel_count: int) -> tuple[bool, list[str]]:
    """proveCatch / converge score: every required stem is a prefix of some mesh."""
    names = list(mesh_names or [])
    missing: list[str] = []
    for stem in syringe_pump_checklist(channel_count):
        if not any(n.startswith(stem) or stem in n for n in names):
            missing.append(stem)
    return (len(missing) == 0, missing)


def _selftest() -> None:
    """proveCatch: grammar floors are stable; accessory cap ≠ knob; silhouette holds."""
    hfi._selftest()
    # proveCatch (2026-07-29): Formula E rear MGU pack must select traction form,
    # never optical-handheld — 0733 rendered a featureless instrument box.
    assert is_traction_drive_pack_form(product_class="formula_e_rear_mgu"), (
        "formula_e_rear_mgu class must select traction drive pack form")
    assert is_traction_drive_pack_form(product_class="formula_e_front_mgu"), (
        "formula_e_front_mgu class must select traction drive pack form")
    assert is_traction_bay_fill_form(product_class="formula_e_front_mgu"), (
        "front FPK class must select bay-fill morphology (axle packaging wins)")
    assert not is_traction_bay_fill_form(product_class="formula_e_rear_mgu"), (
        "rear manufacturer cassette is open-cradle, not front bay-fill")
    assert is_traction_drive_pack_form(
        product_class="",
        part_blob="Traction Ipmsm Motor Generator SiC Traction Inverter Reduction Gear Stage",
    ), "part vocabulary alone must select traction pack form"
    assert is_traction_drive_pack_form(
        product_class="consumer_electronics",
        part_blob="traction ipmsm mgu cold plate",
        quantities={"mgu_shaft_torque_nm": {"value": 77}, "phase_current_max_a": {"value": 530}},
    )
    assert not is_traction_drive_pack_form(product_class="colorimeter")
    assert not is_traction_drive_pack_form(
        product_class="bess",
        part_blob="battery module rack",
        quantities={"phase_current_max_a": {"value": 200}},
    ), "BESS + high current without traction nouns must NOT select traction form"
    # Thermocycler form: class alone (no brand), part vocab, aliases, negatives.
    assert is_thermocycler_form(product_class="thermocycler"), (
        "class slug thermocycler must select tip-back lid form without brand nouns")
    assert is_thermocycler_form(product_class="thermal_cycler")
    assert is_thermocycler_form(
        product_class="",
        part_blob="Peltier TEC module and aluminum sample block with tube wells",
    ), "part vocabulary alone must select the form when class is thin"
    assert is_thermocycler_form(product_class="ninjapcr"), (
        "TRAINING synonym must map to the same form — not a product branch")
    assert not is_thermocycler_form(product_class="colorimeter")
    assert is_thermocycler_form(product_class="thermocycler", is_instrument=False), (
        "class slug remains authoritative when isInstrumentDevice was dropped")
    assert not is_thermocycler_form(
        product_class="bess",
        part_blob="random peltier mention",
        is_instrument=False,
    ), "plant + part vocab must NOT select PCR form"
    # Bench power vs PCR tip-back (2026-07-27 cold-v4 clipboard hero):
    _bp_blob = (
        "Per Channel Linear Source Sink Stage | Per Channel Linear Discharge Pass Bank | "
        "Per Channel Precision Afe | Per Channel Kelvin Voltage Sense | Peltier Tec Module | "
        "Heatsink Fan Assembly | IEC C14 Fused Inlet | Per Channel Hardware Cutout"
    )
    assert is_bench_power_instrument_form(
        product_class="consumer_electronics", part_blob=_bp_blob, is_instrument=True,
    ), "source/sink + AFE + Peltier + C14 must select bench_power_instrument"
    assert not is_thermocycler_form(
        product_class="consumer_electronics", part_blob=_bp_blob, is_instrument=True,
    ), "bench power must NEVER select tip-back PCR form"
    assert resolve_form_family(
        product_class="consumer_electronics", part_blob=_bp_blob, is_instrument=True,
    ) == "bench_power_instrument"
    assert is_thermocycler_form(
        product_class="",
        part_blob="Peltier TEC module and aluminum sample block with tube wells",
        is_instrument=True,
    ), "genuine PCR sample-block vocab must still select thermocycler"
    assert tipback_lid_open_rx_deg() < 0.0, (
        "Blender +Y=rear tip-back open must be −Rx (front edge rises)")
    _cam = tipback_lid_product_cam_fractions()
    assert _cam["ext_z"] > _cam["tgt_z"] > 0.5, (
        "tip-back product cam must look down onto the open lid, not the deck")
    assert float(_cam["hero_dist_scale"]) <= 0.52, (
        "tip-back hero must pull in enough for cutaway height occupancy ≥0.45 "
        f"(got hero_dist_scale={_cam['hero_dist_scale']})")
    assert -0.05 <= float(BUTTON_NEST_FRAC) <= 0.15, (
        "D-pad nest frac must keep the key crown tactile without a hover gap")
    assert float(BUTTON_WELL_DEPTH_MM) >= 1.0, (
        "deck must cut a ≥1 mm well under each key (2237 soft-shadow float)")
    assert tipback_lid_vision_image_candidates()[0] == "04-product-exterior.png", (
        "outer-face lid controls: prefer sealed product exterior over cutaway hero")
    assert BUTTON_SHAPE == "square"
    assert CAP_STYLE == "ambient_lid"
    assert material_roles_ok(), "material honesty table inverted"
    bx, by, bz = button_plan_size_mm(BUTTON_PREF_DIAMETER_MM)
    assert bx >= BUTTON_MIN_DIAMETER_MM and by >= BUTTON_MIN_DIAMETER_MM
    assert bz == BUTTON_TRAVEL_MM
    assert BUTTON_TRAVEL_MM >= 3.0, "proud D-pad travel floor"
    assert sum(MAT_BUTTON_KEY) / 3.0 >= 0.18, "keys must contrast charcoal deck"
    # proveCatch (colorimeter-2053): seated cuvette must NOT free-stand above cube.
    _seat = exterior_cuvette_seat_mm(
        well_xy=(0.0, 0.0),
        rim_top_z=80.0,
        tower_top_z=78.0,
        tower_h_mm=44.0,
        well_plan_mm=12.0,
    )
    assert _seat["cuv_top_z"] - 80.0 <= EXTERIOR_CUVETTE_MAX_PROUD_MM + 1e-6, (
        f"cuvette tip too proud: {_seat['cuv_top_z'] - 80.0:.1f} mm")
    assert _seat["fluid_bottom_z"] <= 78.0 - 0.5, (
        f"fluid must nest under tower top, got bottom={_seat['fluid_bottom_z']:.1f}")
    assert _seat.get("hide_exterior_fluid") is True, (
        "closed exterior must hide yellow fluid (2219 floating-cylinder class)")
    assert _seat["cuv_top_z"] - 78.0 <= 8.0, (
        f"tip above tower must stay ≤8 mm, got {_seat['cuv_top_z'] - 78.0:.1f}")
    bez = display_bezel_size_mm((36.0, 24.0, 1.6))
    assert bez[0] > 36.0 and bez[1] > 24.0
    cap = ambient_cap_parts_mm(22.0)
    assert cap["flange_od_mm"] > cap["grip_od_mm"], "lid flange must outsize the grip"
    assert cap["grip_h_mm"] > cap["flange_h_mm"], "grip rises above flange (lift cue)"
    assert desirability_silhouette_ok(64.0, 40.0, STEP_SHELF_HEIGHT_MM)
    assert not desirability_silhouette_ok(64.0, 20.0, 2.0), "tiny cube / hairline step must fail"
    feet = foot_locs_mm(155.0, 123.0, 300.0)
    assert len(feet) == 4
    assert INTERIOR_BEAM_CROSS_MM >= 4.0, "beam must read at thumbnail"
    assert INTERIOR_MIN_STORY_MESHES >= 8
    assert 0.40 <= sum(MAT_BODY_POLYMER) / 3.0 <= 0.55, "body must be true mid grey — light enough for demo-slide visibility, dark enough not to clip white on the hero top face (2026-07-23)"
    assert INSTRUMENT_EXPOSURE_LIFT == 0.0, "never lift instrument exposure"
    assert INSTRUMENT_EXPOSURE_BIAS <= 0.0
    assert INSTRUMENT_STUDIO_KEY_ENERGY <= 22.0, "softbox key must not blow out mid-grey body"
    # proveCatch: studio ground hugs the product — e×8 made GLB open from miles away.
    _g = instrument_studio_ground_size_m(0.425)
    assert abs(_g - 0.425 * INSTRUMENT_STUDIO_GROUND_APRON) < 1e-9
    assert _g < 0.6, "ground must hug ~0.4 m product (not e×8 ≈ 3.4 m)"
    assert instrument_studio_ground_size_m(0.2, apron=0.5) == 0.2, "apron <1 clamps to 1×"
    assert TARGET_BODY_LUM_MEAN_MIN >= 60.0, "light-grey body min lum floor"
    assert TARGET_BODY_LUM_MEAN_MAX <= 240.0, "body must not blow out to paper white"
    # proveCatch: cuboid-dominated cutaway must fail; CAD-heavy must pass.
    assert not interior_authenticity_ok(
        {"n_story": 10, "n_plain_box": 9, "n_authentic": 1}
    ), "all-box cutaway must fail authenticity"
    assert interior_authenticity_ok(
        {"n_story": 12, "n_plain_box": 3, "n_authentic": 7}
    ), "authentic majority must pass"
    # Syringe-pump OPEN array form — class, alias, part vocab, negatives.
    assert is_syringe_pump_form(product_class="syringe_pump"), (
        "class slug syringe_pump must select OPEN linear-dosing form")
    assert is_syringe_pump_form(product_class="poseidon"), (
        "TRAINING synonym must map to the same form — not a product branch")
    assert is_syringe_pump_form(
        product_class="",
        part_blob="lead screw carriage and syringe plunger clamp with NEMA17 stepper",
    ), "syringe+linear part vocabulary must select the form"
    assert not is_syringe_pump_form(product_class="thermocycler")
    assert not is_syringe_pump_form(
        product_class="water_treatment",
        part_blob="circulation pump",
        is_instrument=False,
    ), "plant pump must NOT select syringe-pump form"
    _env = syringe_pump_envelope_mm(4)
    assert _env[0] > _env[1], "4-ch array must be wider than deep (channels across X)"
    _locs = syringe_pump_channel_locs_mm(4)
    assert len(_locs) == 4
    assert _locs[1]["x"] > _locs[0]["x"], "channels step in +X"
    _ok, _miss = syringe_pump_checklist_ok(
        ["u_se_sp_base", "u_se_sp_console", "u_se_sp_console_top",
         "u_se_sp_console_tablet", "u_se_sp_console_display",
         "u_se_sp_console_chip", "u_se_sp_harness_trunk"]
        + [f"u_se_sp_ch{i}_{s}" for i in range(1, 5)
           for s in ("chassis_floor", "chassis_side_l", "chassis_side_r", "chassis_nose",
                     "stepper", "coupler", "leadscrew", "carriage", "rail_a", "rail_b",
                     "cradle", "cradle_v_a", "clamp_barrel", "clamp_plunger",
                     "syringe", "tubing", "harness", "wire0", "wire1")],
        4,
    )
    assert _ok and not _miss, f"full mesh set must pass checklist, miss={_miss}"
    _bad, _miss2 = syringe_pump_checklist_ok(["u_se_sp_base"], 4)
    assert (not _bad) and len(_miss2) > 0, "empty channels must fail checklist"
    # proveCatch: gold-convergent geometry floors (modular chassis + tipped HMI).
    assert SP_CHASSIS_NOSE_DEG >= 40.0, "bay nose must read as printed 45° chamfer"
    assert SP_CHASSIS_SIDE_H_MM <= 40.0, "side rails must not seal into a full crate wall"
    assert SP_CHASSIS_REAR_H_MM >= SP_STEPPER_FACE_MM, "rear shelf must seat NEMA-class motor"
    assert 48.0 <= SP_DISPLAY_TILT_DEG <= 70.0, "tablet tip must match gold docked HMI band"
    assert SP_HARNESS_OD_MM >= 6.0, "harness braid must survive product-cam foreshortening"
    assert SP_CHIP_W_MM >= 40.0, "console chip must read as microfluidic stage, not a speck"
    assert SP_CAM_EXT_Z <= 0.75, "exterior cam must not crush tipped tablet into a bar"
    assert SP_SYRINGE_TIP_OD_MM >= 4.0, "luer tip must read against clear barrel"
    assert SP_CONSOLE_POST_OD_MM >= 8.0, "console posts must read as open modular frame"
    assert resolve_form_family(product_class="poseidon") == "syringe_pump"
    assert resolve_form_family(product_class="ninjapcr") == "thermocycler"
    assert FORM_FAMILIES["syringe_pump"]["glance_id"] == "syringe_pump"
    # Lab microscope OPEN flexure form — class, alias, part vocab, negatives.
    assert is_lab_microscope_form(product_class="lab_microscope"), (
        "class slug lab_microscope must select OPEN flexure microscope form")
    assert is_lab_microscope_form(product_class="openflexure"), (
        "TRAINING synonym must map to the same form — not a product branch")
    assert is_lab_microscope_form(
        product_class="",
        part_blob="RMS objective flexure XY stage stepper autofocus condenser",
    ), "optics+motion part vocabulary must select the form"
    assert not is_lab_microscope_form(product_class="colorimeter")
    assert not is_lab_microscope_form(product_class="thermocycler")
    assert not is_lab_microscope_form(
        product_class="bess",
        part_blob="random objective mention",
        is_instrument=False,
    ), "plant + thin optics vocab must NOT select microscope form"
    # proveCatch: pioreactor OD optics + steppers must NOT flip to microscope
    assert not is_lab_microscope_form(
        product_class="benchtop_bioreactor",
        part_blob="OD optics LED photometer stirring stepper stage vial",
    ), "bioreactor optics+stepper must NOT select lab_microscope form"
    assert not is_lab_microscope_form(
        product_class="pioreactor",
        part_blob="spectrophotometry optics stepper motor culture vial",
    ), "pioreactor alias + bare optics must NOT select microscope form"
    _lm_env = lab_microscope_envelope_mm()
    assert _lm_env[2] >= _lm_env[0] * 0.9, "microscope envelope is tall benchtop class"
    _lm_ok, _lm_miss = lab_microscope_checklist_ok([
        "u_se_lm_body", "u_se_lm_stage", "u_se_lm_slide",
        "u_se_lm_optics_tube", "u_se_lm_illum_arm", "u_se_lm_condenser",
        "u_se_lm_led", "u_se_lm_sbc",
        "u_se_lm_act_x_tower", "u_se_lm_act_x_stepper", "u_se_lm_act_x_screw",
        "u_se_lm_act_y_tower", "u_se_lm_act_y_stepper", "u_se_lm_act_y_screw",
        "u_se_lm_act_z_tower", "u_se_lm_act_z_stepper", "u_se_lm_act_z_screw",
    ])
    assert _lm_ok and not _lm_miss, f"full lm mesh set must pass, miss={_lm_miss}"
    _lm_bad, _lm_miss2 = lab_microscope_checklist_ok(["u_se_lm_body"])
    assert (not _lm_bad) and len(_lm_miss2) > 0, "empty actuators must fail checklist"
    assert sum(LM_MAT_BODY_CREAM) / 3.0 >= 0.80, "body must stay cream FDM, not charcoal"
    _lm_cam = lab_microscope_product_cam_fractions()
    assert float(_lm_cam["dist_k"]) <= 0.72, (
        "lab_microscope product cam must pull in enough for cream edge density "
        f"≥0.002 (got dist_k={_lm_cam['dist_k']})"
    )
    assert float(_lm_cam["frame"]) >= 0.94, (
        "lab_microscope product cam frame fill must be ≥0.94 for cream-edge density"
    )
    assert float(_lm_cam["tgt_z"]) <= 0.18, (
        "lab_microscope look-at must stay low enough that the base is not cropped "
        f"(got tgt_z={_lm_cam['tgt_z']})"
    )
    assert float(_lm_cam["hero_dist_scale"]) <= 0.95, (
        "lab_microscope hero must not use sealed-instrument zoom-out "
        f"(got hero_dist_scale={_lm_cam['hero_dist_scale']})"
    )
    assert resolve_form_family(product_class="lab_microscope") == "lab_microscope"
    assert resolve_form_family(product_class="openflexure") == "lab_microscope"
    assert FORM_FAMILIES["lab_microscope"]["glance_id"] == "lab_microscope"
    # proveCatch: optical_handheld is NOT the instrument catch-all
    assert is_optical_handheld_form(product_class="colorimeter")
    assert is_optical_handheld_form(product_class="optical_instrument")
    assert resolve_form_family(product_class="colorimeter") == "optical_handheld"
    assert not is_optical_handheld_form(product_class="benchtop_bioreactor")
    assert not is_optical_handheld_form(product_class="pioreactor")
    assert not is_optical_handheld_form(product_class="potentiostat")
    assert is_lab_electronics_form(product_class="potentiostat")
    assert is_lab_electronics_form(product_class="benchtop_bioreactor")
    assert is_lab_electronics_form(product_class="opendrop")
    assert resolve_form_family(product_class="benchtop_bioreactor") == "lab_electronics"
    assert resolve_form_family(product_class="potentiostat") == "lab_electronics"
    assert resolve_form_family(product_class="opendrop") == "lab_electronics"
    # proveCatch (Pioreactor 0250): peltier/TEC in part_blob must NOT flip culture kit
    # to tip-back thermocycler form (class slug is authoritative for lab electronics).
    assert not is_thermocycler_form(
        product_class="benchtop_bioreactor",
        part_blob="Peltier Tec Module Cartridge Heater Culture Vessel",
        is_instrument=True,
    ), "bioreactor + TEC must NOT select thermocycler form"
    assert resolve_form_family(
        product_class="pioreactor",
        part_blob="Peltier Tec Module Od Photodiode Peristaltic Pump",
        is_instrument=True,
    ) == "lab_electronics"
    # proveCatch (2026-08-01): traction hi-res is same aspect, strictly larger
    # than the instrument floor — more pixels, not a different crop.
    assert TRACTION_RENDER_RESOLUTION[0] > INSTRUMENT_RENDER_RESOLUTION[0]
    assert TRACTION_RENDER_RESOLUTION[1] > INSTRUMENT_RENDER_RESOLUTION[1]
    assert abs(
        TRACTION_RENDER_RESOLUTION[0] / TRACTION_RENDER_RESOLUTION[1]
        - INSTRUMENT_RENDER_RESOLUTION[0] / INSTRUMENT_RENDER_RESOLUTION[1]
    ) < 1e-9, "traction hi-res must keep the same framing aspect"
    assert TRACTION_CATALOGUE_RENDER_RESOLUTION[0] >= 7200
    print("instrument_form_grammar _selftest: OK (beauty + desirability + use-physics)")


if __name__ == "__main__":
    _selftest()
