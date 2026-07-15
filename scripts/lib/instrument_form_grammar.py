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
    print("instrument_form_grammar _selftest: OK (beauty + desirability + use-physics)")


if __name__ == "__main__":
    _selftest()
