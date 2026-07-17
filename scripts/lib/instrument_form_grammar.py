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
MAT_BODY_POLYMER = (0.10, 0.105, 0.115)
MAT_DECK_A_SURFACE = (0.12, 0.125, 0.135)     # slightly lighter top operating plane
MAT_DISPLAY_GLASS = (0.015, 0.02, 0.035)
MAT_DISPLAY_BEZEL = (0.06, 0.065, 0.075)
MAT_BUTTON_KEY = (0.08, 0.08, 0.09)
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
MAT_CUTAWAY_SHELL = (0.14, 0.15, 0.17)         # translucent cutaway body cue

# ── Fitts / control taxonomy ──────────────────────────────────────────────
BUTTON_SHAPE = "square"
BUTTON_TRAVEL_MM = 2.4
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

# ── Desirability grammar (universal) ──────────────────────────────────────
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
INTERIOR_BEAM_CROSS_MM = 5.0       # thick enough to read at thumbnail
INTERIOR_SOURCE_TO_DETECTOR = True
# Cutaway must not read as an empty box — minimum distinct story meshes.
INTERIOR_MIN_STORY_MESHES = 8
# Cutaway optical cube cue is translucent so the beam reads through it.
CUTAWAY_CUBE_ALPHA = 0.35


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


def _selftest() -> None:
    """proveCatch: grammar floors are stable; accessory cap ≠ knob; silhouette holds."""
    hfi._selftest()
    assert BUTTON_SHAPE == "square"
    assert CAP_STYLE == "ambient_lid"
    assert material_roles_ok(), "material honesty table inverted"
    bx, by, bz = button_plan_size_mm(BUTTON_PREF_DIAMETER_MM)
    assert bx >= BUTTON_MIN_DIAMETER_MM and by >= BUTTON_MIN_DIAMETER_MM
    assert bz == BUTTON_TRAVEL_MM
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
    print("instrument_form_grammar _selftest: OK (beauty + desirability + use-physics)")


if __name__ == "__main__":
    _selftest()
