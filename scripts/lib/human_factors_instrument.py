#!/usr/bin/env python3
"""Human-factors floors for sealed optical/electronic instruments.

INTENT: form follows function AND the human body. Apple HIG (typography ≥11 pt,
hit targets ≥44×44 pt, legibility at typical viewing distance) is translated into
physical millimetres for enclosure CAD / Blender form rules. Gold open-photometer
shape is the TRAINING check that these reasons produce a real-looking object —
never a product-named silhouette paste.

Sources:
  - https://developer.apple.com/design/tips/  (11 pt text; 44×44 pt hit targets)
  - https://developer.apple.com/design/human-interface-guidelines/typography
  - Anthropometry: adult fingertip pad ~16–20 mm; handheld viewing ~300–400 mm

FLOW: constants here → `_instrument_form_rule_mm` (build_universal_scene.py)
   → proveCatch in this module + instrument form selftest.
"""

from __future__ import annotations

# ── Apple HIG logical floors ──────────────────────────────────────────────
# Apple Design Tips: text ≥ 11 pt at typical viewing distance (no zoom).
APPLE_MIN_TEXT_PT = 11
# iOS body / primary content comfort default commonly cited in HIG tables.
APPLE_BODY_TEXT_PT = 17
# Apple Design Tips: controls ≥ 44×44 pt.
APPLE_MIN_HIT_TARGET_PT = 44
# Classic iPhone logical density (~163 points per inch). 44 pt ≈ 6.9 mm physical.
APPLE_POINTS_PER_INCH = 163.0

# ── Viewing distance (eye) ────────────────────────────────────────────────
# Handheld / benchtop instrument held or sitting on bench in front of the user.
VIEWING_DISTANCE_MM_MIN = 300.0
VIEWING_DISTANCE_MM_MAX = 400.0
VIEWING_DISTANCE_MM_DESIGN = 350.0

# ── Display active area (eye → readable glass) ────────────────────────────
# Floor sized so primary numeric/status text can render at ≥11 pt-equivalent
# without zoom at VIEWING_DISTANCE_MM_DESIGN. Preferred band approaches a
# readable handheld UI block (~1.5–2" class).
DISPLAY_ACTIVE_MIN_W_MM = 28.0
DISPLAY_ACTIVE_MIN_H_MM = 18.0
DISPLAY_ACTIVE_PREF_W_MM = 36.0
DISPLAY_ACTIVE_PREF_H_MM = 24.0

# ── Tactile targets (hand) ────────────────────────────────────────────────
# 44 pt @ 163 ppi ≈ 6.9 mm → floor 7.0 mm; prefer 9 mm when the deck allows.
BUTTON_MIN_DIAMETER_MM = 7.0
BUTTON_PREF_DIAMETER_MM = 9.0
# Clear gap between adjacent button rims so a finger can hit one without its neighbour.
BUTTON_MIN_GAP_MM = 2.0
BUTTON_PREF_GAP_MM = 3.0

# ── Envelope (hand + top operating plane) ─────────────────────────────────
# Derived (non-brief-pinned) handheld long edge — display/MCU + optical cube.
HANDHELD_MAX_EDGE_MM = 155.0


def apple_hit_target_mm(points: float = APPLE_MIN_HIT_TARGET_PT) -> float:
    """Convert Apple hit-target points to approximate physical millimetres.

    @description Uses classic ~163 ppi point density (original iPhone lineage)
                 so 44 pt ≈ 6.9 mm — the HIG floor for a finger tap.
    @param points Apple logical points (default 44).
    @returns Approximate physical size in millimetres.
    """
    inches = float(points) / APPLE_POINTS_PER_INCH
    return inches * 25.4


def display_active_area_ok(width_mm: float, height_mm: float, *, prefer: bool = False) -> bool:
    """True when an active display area meets the Apple-derived readability floor.

    @description Floor is DISPLAY_ACTIVE_MIN_*; prefer=True requires PREF_* band.
    @param width_mm Active glass width.
    @param height_mm Active glass height.
    @param prefer When True, require the comfortable lab-readout band.
    @returns Whether the area clears the chosen band.
    """
    w, h = float(width_mm), float(height_mm)
    if prefer:
        return w >= DISPLAY_ACTIVE_PREF_W_MM and h >= DISPLAY_ACTIVE_PREF_H_MM
    return w >= DISPLAY_ACTIVE_MIN_W_MM and h >= DISPLAY_ACTIVE_MIN_H_MM


def button_diameter_ok(diameter_mm: float, *, prefer: bool = False) -> bool:
    """True when a tactile control meets the Apple 44 pt → mm floor.

    @param diameter_mm Button diameter (or min cross-section).
    @param prefer When True, require the preferred ≥9 mm band.
    @returns Whether the control clears the chosen band.
    """
    d = float(diameter_mm)
    return d >= (BUTTON_PREF_DIAMETER_MM if prefer else BUTTON_MIN_DIAMETER_MM)


def _selftest() -> None:
    """proveCatch: Apple HIG floors translate to stable physical constants."""
    hit_mm = apple_hit_target_mm(44)
    assert 6.5 <= hit_mm <= 7.5, f"44 pt should be ~6.9 mm, got {hit_mm:.2f}"
    assert abs(BUTTON_MIN_DIAMETER_MM - 7.0) < 1e-9
    assert BUTTON_MIN_DIAMETER_MM >= hit_mm - 0.2, (
        "tactile floor must not undercut Apple 44 pt physical size")
    assert display_active_area_ok(28.0, 18.0)
    assert not display_active_area_ok(20.0, 12.0), "sub-floor display must fail"
    assert display_active_area_ok(36.0, 24.0, prefer=True)
    assert button_diameter_ok(7.0)
    assert not button_diameter_ok(3.0), "cosmetic pegs must fail the hand floor"
    assert VIEWING_DISTANCE_MM_MIN <= VIEWING_DISTANCE_MM_DESIGN <= VIEWING_DISTANCE_MM_MAX
    assert HANDHELD_MAX_EDGE_MM == 155.0
    print("human_factors_instrument _selftest: OK (Apple HIG → mm floors)")


if __name__ == "__main__":
    _selftest()
