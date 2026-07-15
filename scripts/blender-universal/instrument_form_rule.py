"""Shared instrument exterior form-rule (Blender + GA).

INTENT (colorimeter 2026-07-14): Blender closed-product and the GA must show the
SAME composition — UI deck left, optical cube right, keys on the deck, harness
into the cable channel. One pure function; no bpy.
"""
from __future__ import annotations

import sys
from pathlib import Path

_LIB = Path(__file__).resolve().parent.parent / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))
import instrument_form_grammar as ifg  # noqa: E402


def instrument_form_rule_mm(
    W: float,
    D: float,
    H: float,
    base_z: float,
    tt: float,
    optical_path_mm: float | None = None,
) -> dict:
    """Function-driven exterior for sealed optical/electronic instruments.

    UNIVERSAL — keyed on isInstrumentDevice + optical_path_mm / envelope, never a
    product noun. The silhouette is NOT arbitrary: each feature is a use-physics
    consequence that real open photometers share (IO Rodeo Open Colorimeter is
    the TRAINING check that those reasons produce a real-looking object):

    1. STEPPED L-body — MCU/display/battery live under a low UI deck; the optical
       path needs a separate light-tight CUBE. The step is the joint between those
       two volumes (serviceability + stray-light isolation), not decoration.
    2. CHUNKY optical cube — plan tracks cuvette outer + baffle walls; height
       clears a standard cuvette body (~45 mm). Aspect is near-cubic so the
       chamber reads as the optical heart, not a skinny appliance chimney.
    3. Square well + circular rim — seats the cuvette and a removable ambient-light
       CAP (Beer–Lambert I₀ needs room light blocked).
    4. Source module on the optical-axis face — horizontal beam through the sample;
       window-scale replaceable board with corner fasteners (wavelength swap).
    5. Cable CHANNEL at the cube↔body joint — swappable LED module plugs from
       outside; harness enters a molded slot, never floats mid-deck.
    6. Recessed display + D-pad on the UI deck — operated looking down; closed
       product hides the compute board (FR4 is cutaway-only). Display active
       area and button diameters follow Apple HIG → mm floors (see
       human_factors_instrument.py): readable at ~350 mm, finger targets ≥7 mm.
    7. Visible top-plate fasteners — additive-manufactured enclosure language.

    Envelope W/D/H already come from design_envelope_* (landscape). This rule
    only places the functional features on that envelope.
    """
    path = float(optical_path_mm if optical_path_mm is not None else 10.0)
    path = max(5.0, path)
    # Square cuvette outer ≈ path + ~2.5 mm walls; chamber adds baffle each side.
    cuvette_outer = path + 2.5
    # Chunky cube: must dominate the right side of a handheld, not a thin spike.
    chamber_plan = min(max(cuvette_outer + 18.0, 36.0), min(W, D) * 0.52)
    # Standard spectrophotometry cuvette body ~45 mm tall; keep the cube CHUNKY
    # (h/w ≲ 1.35) so it reads as an optical block, not a chimney.
    chamber_h = max(38.0, min(48.0, 32.0 + path * 1.2))
    # Optical cube on the RIGHT — leaves a contiguous LEFT UI deck (eyes + hands).
    tower_loc = (W * 0.30, D * 0.08, base_z + H + chamber_h / 2)
    tower_size = (chamber_plan, chamber_plan * 0.96, chamber_h)
    tw, td, th = tower_size
    tx, ty, tz = tower_loc
    tower_front_y = ty - td / 2 - max(1.0, tt * 0.15)
    # Source module ≈ optical window + mount/connector margin — NOT a face plate.
    window = max(path * 1.2, 8.0)
    led_w = min(tw * 0.70, max(window * 2.2, 14.0))
    led_h = min(th * 0.42, max(window * 2.0, 14.0))
    led_d = 1.8
    # DECISION (2026-07-14): UI XY is keyed to the SAME deck box the closed-product
    # mesh uses (centre 0, D·0.02; size W·0.86 × D·0.82) — raw ±W/±D put the D-pad
    # off the deck lip and made keys look like they float beside the body.
    deck_cx, deck_cy = 0.0, D * 0.02
    deck_half_w, deck_half_d = W * 0.86 / 2.0, D * 0.82 / 2.0
    deck_top_z = base_z + H
    # INTENT: reserve a LEFT HMI cluster FIRST, then size the glass into the
    # remaining span. TRIED: size display as max(PREF, 0.40·W / 0.70·ui_span) then
    # squeeze keys into the leftover — glass ate ~73 mm on a 183 mm handheld,
    # D-pad pitch collapsed, keys overlapped, Blender read as 3 orphan cubes.
    btn_d = max(ifg.BUTTON_MIN_DIAMETER_MM, min(ifg.BUTTON_PREF_DIAMETER_MM, min(W, D) * 0.075))
    btn_pitch = btn_d + ifg.BUTTON_PREF_GAP_MM
    # Cross width (3 centres) + A/B column + gaps to deck lip / glass.
    cluster_w = btn_pitch * 3.15 + btn_d * 0.5
    ui_left = deck_cx - deck_half_w + btn_d * 0.7
    tower_left = tx - tw / 2
    # Glass lives between the cluster and the optical cube.
    glass_budget = max(ifg.DISPLAY_ACTIVE_MIN_W_MM, tower_left - ui_left - cluster_w - 10.0)
    disp_w = min(glass_budget, max(ifg.DISPLAY_ACTIVE_PREF_W_MM, min(W * 0.28, glass_budget)))
    disp_w = max(ifg.DISPLAY_ACTIVE_MIN_W_MM, min(disp_w, glass_budget))
    disp_h = max(ifg.DISPLAY_ACTIVE_MIN_H_MM, min(D * 0.28, max(ifg.DISPLAY_ACTIVE_PREF_H_MM, disp_w * 0.65)))
    display_size = (disp_w, disp_h, ifg.DISPLAY_GLASS_THICKNESS_MM)
    cluster_right = ui_left + cluster_w
    display_loc = (
        cluster_right + 4.0 + disp_w / 2.0,
        deck_cy - deck_half_d * 0.06,
        deck_top_z + max(1.2, ifg.DISPLAY_GLASS_THICKNESS_MM),
    )
    # Keep glass clear of the optical cube lip.
    max_disp_cx = tower_left - disp_w / 2.0 - 3.0
    if display_loc[0] > max_disp_cx:
        display_loc = (max_disp_cx, display_loc[1], display_loc[2])
    bezel_size = ifg.display_bezel_size_mm(display_size)
    # GOTCHA: centre at half travel ⇒ key bottom = deck top. Any extra +Z reads as
    # "floating cubes" on the closed product and the cutaway hero.
    btn_z = deck_top_z + ifg.BUTTON_TRAVEL_MM / 2.0
    dx, dy, _dz = display_loc
    # D-pad + A/B column entirely left of the glass (matches GA TOP diamond).
    dpad_x = ui_left + btn_pitch
    ab_x = dpad_x + btn_pitch * 2.05
    # Never invade the glass; if the budget was wrong, shift cluster left — do NOT
    # collapse pitch below a finger-clear gap (overlap = "oddly aligned" keys).
    disp_left = dx - disp_w * 0.5
    if ab_x + btn_d * 0.55 > disp_left - 1.0:
        shift = (ab_x + btn_d * 0.55) - (disp_left - 1.0)
        dpad_x -= shift
        ab_x -= shift
    dpad_y = dy
    min_y = deck_cy - deck_half_d + btn_d * 0.7
    max_y = deck_cy + deck_half_d - btn_d * 0.7
    dpad_y = max(min_y + btn_pitch, min(max_y - btn_pitch, dpad_y))

    button_locs = [
        (dpad_x, dpad_y + btn_pitch, btn_z),                 # up
        (dpad_x, dpad_y - btn_pitch, btn_z),                 # down
        (dpad_x - btn_pitch, dpad_y, btn_z),                 # left
        (dpad_x + btn_pitch, dpad_y, btn_z),                 # right
        (ab_x, dpad_y + btn_pitch * 0.55, btn_z),            # A
        (ab_x, dpad_y - btn_pitch * 0.55, btn_z),            # B
    ]
    # Cap parks BESIDE the instrument on the ground plane (gold open-photometer
    # product photo: lid off so the cuvette well reads; accessory on the table).
    # Flange+grip geometry comes from ifg.ambient_cap_parts_mm (desirability grammar).
    well_loc = (tx, ty, base_z + H + chamber_h + 1.2)
    well_size = (cuvette_outer * 0.95, cuvette_outer * 0.95, 4.0)
    rim_od = min(tw * 0.72, max(well_size[0] + 10.0, 20.0))
    rim_loc = (tx, ty, base_z + H + chamber_h + 0.8)
    cap_parts = ifg.ambient_cap_parts_mm(rim_od)
    # DECISION: no proud "cap nest" disk on the UI deck — a 27 mm cylinder next to
    # the D-pad reads as a fifth control and broke GA↔Blender likeness. Nest is a
    # soft stow cue behind the optical cube (service face), not a left-deck knob.
    cap_nest_loc = (
        tx - tw * 0.15,
        ty + td * 0.55,
        deck_top_z + ifg.CAP_NEST_DEPTH_MM / 2.0,
    )
    cap_loc = (
        -W * 0.55,
        -D * 0.95,
        base_z + cap_parts["flange_h_mm"] / 2,
    )
    # Cable channel: molded slot at the cube↔body joint on the operator-facing flank.
    cable_slot_loc = (
        tx - tw / 2 - 2.0,
        tower_front_y + 2.5,
        base_z + H + min(12.0, chamber_h * 0.22),
    )
    cable_slot_size = (5.0, 8.0, 12.0)
    screw_locs = [
        (-W * 0.40, -D * 0.32, base_z + H + 1.0),
        (-W * 0.40, D * 0.28, base_z + H + 1.0),
        (W * 0.08, -D * 0.32, base_z + H + 1.0),
        (W * 0.08, D * 0.28, base_z + H + 1.0),
    ]
    status_led_loc = (
        dx + display_size[0] * 0.42,
        dy + display_size[1] * 0.55,
        base_z + H + 1.4,
    )
    return {
        "optical_path_mm": path,
        "tower_loc": tower_loc,
        "tower_size": tower_size,
        "well_loc": well_loc,
        "well_size": well_size,
        "rim_loc": rim_loc,
        "rim_od_mm": rim_od,
        "rim_h_mm": 2.0,
        "cap_loc": cap_loc,
        "cap_nest_loc": cap_nest_loc,
        "cap_nest_od_mm": cap_parts["flange_od_mm"] + ifg.CAP_NEST_CLEARANCE_MM,
        "cap_nest_depth_mm": ifg.CAP_NEST_DEPTH_MM,
        "cap_flange_od_mm": cap_parts["flange_od_mm"],
        "cap_flange_h_mm": cap_parts["flange_h_mm"],
        "cap_grip_od_mm": cap_parts["grip_od_mm"],
        "cap_grip_h_mm": cap_parts["grip_h_mm"],
        # Back-compat aggregate for older callers
        "cap_od_mm": cap_parts["flange_od_mm"],
        "cap_h_mm": cap_parts["total_h_mm"],
        "cable_slot_loc": cable_slot_loc,
        "cable_slot_size": cable_slot_size,
        "led_pcb_loc": (tx, tower_front_y, base_z + H + chamber_h * 0.42),
        "led_pcb_size": (led_w, led_d, led_h),
        "top_display_loc": display_loc,
        "top_display_size": display_size,
        "display_bezel_size": bezel_size,
        "button_locs": button_locs,
        "button_diameter_mm": btn_d,
        "button_shape": ifg.BUTTON_SHAPE,
        "screw_locs": screw_locs,
        "screw_head_diameter_mm": ifg.SCREW_HEAD_DIAMETER_MM,
        "screw_head_height_mm": ifg.SCREW_HEAD_HEIGHT_MM,
        "step_shelf_loc": (tx, ty, base_z + H + ifg.STEP_SHELF_HEIGHT_MM / 2),
        "step_shelf_size": (tw * 1.12, td * 1.10, ifg.STEP_SHELF_HEIGHT_MM),
        "status_led_loc": status_led_loc,
        "foot_locs": ifg.foot_locs_mm(W, D, base_z),
        "viewing_distance_mm": ifg.VIEWING_DISTANCE_MM_DESIGN,
        "deck_loc": (deck_cx, deck_cy, base_z + H * 0.89),
        "deck_size": (W * 0.86, D * 0.82, H * 0.22),
        "body_size": (W, D, H),
        "total_height_mm": H + chamber_h,
    }


