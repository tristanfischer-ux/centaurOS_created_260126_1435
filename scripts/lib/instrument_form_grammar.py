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
# GOTCHA: under product softboxes, display-sRGB ≥0.10 lifts to clay-grey after
# AgX (2026-07-13: body crop median ~150 vs gold ~103). Gold open-photometer
# charcoal is near-black polymer — keep body ≈0.06–0.07 display. Too dark
# (≤0.04 + heavy negative exposure) crushes to featureless black.
MAT_BODY_POLYMER = (0.065, 0.068, 0.075)
MAT_DECK_A_SURFACE = (0.08, 0.084, 0.092)     # slightly lighter top operating plane
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
INSTRUMENT_RENDER_RESOLUTION = (3600, 2400)
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
# SIGHT band for a sealed exterior BODY-FACE patch (8-bit mean RGB).
TARGET_BODY_LUM_MEAN_MAX = 130.0
TARGET_BODY_LUM_MEAN_MIN = 70.0
# Legacy aliases (centre-crop stats — prefer body_luminance_ok mean band).
TARGET_BODY_LUM_P50_MAX = 130
TARGET_BODY_LUM_P50_MIN = 55
TARGET_BODY_LUM_P10_MAX = 100
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
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return True  # skip when imaging libs unavailable in CI
    im = np.asarray(Image.open(png_path).convert("RGB"), dtype=np.float32)
    h, w, _ = im.shape
    # Front/side body face on the sealed 3/4 product shot.
    patch = im[h * 42 // 100 : h * 58 // 100, w * 32 // 100 : w * 55 // 100]
    mean = float(patch.mean())
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
TIPBACK_LID_OPEN_RX_DEG = -45.0

# Product-camera framing for tip-back lids (fractions of envelope height / depth).
# RULE: elevate eye + bias look-at toward the rear hinge so outer-face controls read.
TIPBACK_LID_CAM_EXT_Z = 2.10
TIPBACK_LID_CAM_SIDE_Z = 1.85
TIPBACK_LID_CAM_TGT_Z = 0.95
TIPBACK_LID_CAM_TGT_Y_FRAC = 0.12
TIPBACK_LID_CAM_HERO_Z = 1.55
TIPBACK_LID_CAM_HERO_TGT_Z = 0.85
TIPBACK_LID_CAM_HERO_TGT_Y_FRAC = 0.10
TIPBACK_LID_CAM_FRONT_DIST_SCALE = 0.92
TIPBACK_LID_CAM_HERO_DIST_SCALE = 0.85

# Vision: outer-face lid controls are clearest on the sealed product exterior,
# not the cutaway hero (foreshortens the tip-back knob).
TIPBACK_LID_VISION_IMAGE_CANDIDATES = (
    "04-product-exterior.png",
    "00-hero.png",
    "blender-cover.png",
    "07-product-service.png",
)


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
# Product cams: taller than wide OPEN array — slight pull-in + mid look-at.
LM_CAM_EXT_Z = 0.95
LM_CAM_SIDE_Z = 0.85
LM_CAM_TGT_Z = 0.42
LM_CAM_FRONT_DIST_SCALE = 0.88
LM_CAM_H_EFF_SCALE = 1.35
LM_CAM_DIST_K = 0.90
LM_CAM_FRAME = 0.88
LM_CAM_CENTRE_FRAC = 0.45


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
        "detect": "is_optical_via_instrument_device",  # sealed instrument path
        "glance_id": "optical_handheld",
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


def resolve_form_family(
    *,
    product_class: str = "",
    part_blob: str = "",
    is_instrument: bool = True,
) -> str | None:
    """Return form family id for this brief/parts — never a product noun branch.

    @returns 'syringe_pump' | 'lab_microscope' | 'thermocycler' | 'optical_handheld' | None
    """
    if is_syringe_pump_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "syringe_pump"
    if is_lab_microscope_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "lab_microscope"
    if is_thermocycler_form(
        product_class=product_class, part_blob=part_blob, is_instrument=is_instrument
    ):
        return "thermocycler"
    if is_instrument:
        return "optical_handheld"
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
    assert tipback_lid_open_rx_deg() < 0.0, (
        "Blender +Y=rear tip-back open must be −Rx (front edge rises)")
    _cam = tipback_lid_product_cam_fractions()
    assert _cam["ext_z"] > _cam["tgt_z"] > 0.5, (
        "tip-back product cam must look down onto the open lid, not the deck")
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
    assert sum(MAT_BODY_POLYMER) / 3.0 <= 0.08, "body must stay charcoal under softboxes"
    assert INSTRUMENT_EXPOSURE_LIFT == 0.0, "never lift instrument exposure"
    assert INSTRUMENT_EXPOSURE_BIAS <= 0.0
    assert INSTRUMENT_STUDIO_KEY_ENERGY <= 22.0, "softbox key must not wash charcoal"
    assert TARGET_BODY_LUM_MEAN_MIN >= 60.0
    assert TARGET_BODY_LUM_MEAN_MAX <= 135.0
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
    assert resolve_form_family(product_class="lab_microscope") == "lab_microscope"
    assert resolve_form_family(product_class="openflexure") == "lab_microscope"
    assert FORM_FAMILIES["lab_microscope"]["glance_id"] == "lab_microscope"
    print("instrument_form_grammar _selftest: OK (beauty + desirability + use-physics)")


if __name__ == "__main__":
    _selftest()
