#!/usr/bin/env python3
"""Instrument form grammar — function → beautiful, inevitable form.

INTENT: sealed optical/electronic instruments look right because each feature is
forced by use-physics + human factors + material honesty + industrial design —
never by pasting a gold silhouette. Apple HIG (via human_factors_instrument)
is the hand/eye floor; this module is the rest of the beauty stack.

Sources encoded:
  - Apple Design Tips / HIG → hand/eye floors (delegated to hfi)
  - Optical photometry practice (Beer–Lambert) → cube, well, rim, parkable cap
  - Fitts's law → control cluster next to display, primary actions reachable
  - ISO 7250 / anthropometry practice → top operating plane, thumb arc
  - Dieter Rams → as few parts as function needs; honest materials; quiet UI
  - Manufacturing language → visible AM fasteners, consistent fillet band
  - Loom grammar → connector → strain relief → dressed loom → cable channel

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
# Role → colour. FR4 never pretends to be glass; glass never pretends to be polymer.
MAT_BODY_POLYMER = (0.10, 0.105, 0.115)
MAT_DISPLAY_GLASS = (0.015, 0.02, 0.035)       # dark LCD at rest
MAT_DISPLAY_BEZEL = (0.06, 0.065, 0.075)
MAT_BUTTON_KEY = (0.08, 0.08, 0.09)            # hard tactile key (not a rivet)
MAT_FR4 = (0.05, 0.42, 0.20)
MAT_PAD_GOLD = (0.72, 0.62, 0.18)
MAT_SCREW = (0.05, 0.05, 0.06)
MAT_WELL_BORE = (0.01, 0.01, 0.01)
MAT_CAP = (0.07, 0.075, 0.085)
MAT_COIN_CELL = (0.62, 0.63, 0.66)
MAT_DETECTOR = (0.12, 0.13, 0.18)
MAT_LED_EMIT = (1.0, 0.62, 0.08)
MAT_BEAM = (1.0, 0.72, 0.12)
MAT_OPTICAL_BENCH = (0.18, 0.19, 0.22)

# ── Fitts / control taxonomy ──────────────────────────────────────────────
# D-pad LEFT of glass (navigate); A/B RIGHT of glass (commit) — thumb while looking down.
BUTTON_SHAPE = "square"  # gold open-photometers use square tactile keys, not pegs
BUTTON_TRAVEL_MM = 2.4
SCREW_HEAD_DIAMETER_MM = 3.2
SCREW_HEAD_HEIGHT_MM = 1.2
DISPLAY_BEZEL_MARGIN_MM = 2.5
DISPLAY_GLASS_THICKNESS_MM = 1.6

# ── Optical use-physics floors ────────────────────────────────────────────
CUVETTE_BODY_CLEAR_H_MM = 38.0          # standard spectrophotometry cuvette class
OPTICAL_CUBE_MIN_PLAN_MM = 36.0
OPTICAL_CUBE_MAX_ASPECT = 1.45          # h/w — chunky block, not chimney
WELL_RIM_OVERSIZE_MM = 4.0             # rim OD − well plan (cap seating)
CABLE_CHANNEL_MIN_W_MM = 4.0

# ── Interior layout (cutaway beauty) ──────────────────────────────────────
# Single composition: UI volume (left) + optical volume (right) share one deck.
INTERIOR_PCB_THICKNESS_MM = 1.6
INTERIOR_COIN_CELL_R_MM = 10.0
INTERIOR_BEAM_CROSS_MM = 3.5
# Detector sits opposite the source across the cuvette (transmittance axis).
INTERIOR_SOURCE_TO_DETECTOR = True


def button_plan_size_mm(diameter_mm: float) -> tuple[float, float, float]:
    """Square (or round-equivalent) tactile key outer size from the HIG diameter.

    @description Square keys match open-photometer practice; size = HIG diameter.
    @param diameter_mm Finger-target diameter from the form rule.
    @returns (sx, sy, sz) box extents in mm for a top-deck key.
    """
    d = max(BUTTON_MIN_DIAMETER_MM, float(diameter_mm))
    return (d, d, BUTTON_TRAVEL_MM)


def display_bezel_size_mm(display_size: tuple[float, float, float]) -> tuple[float, float, float]:
    """Bezel frame slightly larger than the active glass (Rams: frame the content).

    @param display_size (active_w, active_h, glass_t).
    @returns Bezel outer box size.
    """
    w, h, _t = display_size
    m = DISPLAY_BEZEL_MARGIN_MM
    return (w + 2.0 * m, h + 2.0 * m, max(1.0, _t * 0.6))


def material_roles_ok() -> bool:
    """proveCatch: glass darker than body polymer; FR4 is green, not glass-grey."""
    glass_luma = sum(MAT_DISPLAY_GLASS) / 3.0
    body_luma = sum(MAT_BODY_POLYMER) / 3.0
    fr4_g = MAT_FR4[1]
    return glass_luma < body_luma and fr4_g > 0.30 and MAT_FR4[0] < 0.15


def _selftest() -> None:
    """proveCatch: grammar floors are stable and Apple floors remain the hand/eye base."""
    hfi._selftest()
    assert BUTTON_SHAPE == "square"
    assert material_roles_ok(), "material honesty table inverted"
    bx, by, bz = button_plan_size_mm(BUTTON_PREF_DIAMETER_MM)
    assert bx >= BUTTON_MIN_DIAMETER_MM and by >= BUTTON_MIN_DIAMETER_MM
    assert bz == BUTTON_TRAVEL_MM
    bez = display_bezel_size_mm((36.0, 24.0, 1.6))
    assert bez[0] > 36.0 and bez[1] > 24.0
    assert OPTICAL_CUBE_MIN_PLAN_MM >= 36.0
    assert CUVETTE_BODY_CLEAR_H_MM >= 38.0
    assert SCREW_HEAD_DIAMETER_MM >= 2.5, "AM fasteners must read at product scale"
    print("instrument_form_grammar _selftest: OK (beauty + use-physics + materials)")


if __name__ == "__main__":
    _selftest()
