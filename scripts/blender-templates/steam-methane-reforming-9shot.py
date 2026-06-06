"""smr-9shot.py — ~5,000 Nm3/h STEAM-METHANE-REFORMING (SMR) hydrogen plant.

Conventional grey/blue-H2 SMR train: natural gas is desulphurised, mixed with
process steam and reformed over a nickel catalyst in a fired REFORMER FURNACE
(the signature SMR kit — a big refractory-lined radiant box packed with vertical
catalyst tubes, vented through a tall flue STACK). The reformate's waste heat
raises steam in a convection/waste-heat section + STEAM DRUM; carbon monoxide is
then converted to more hydrogen across a high-temperature + low-temperature
SHIFT reactor pair; finally a PRESSURE-SWING-ADSORPTION (PSA) unit — a cluster
of tall adsorber vessels, the other unmistakable SMR signature — purifies the
hydrogen to >99.99%, venting the CO2-rich tail gas back to the reformer burners.
Hydrogen product compression, an MV transformer, a DCS/SIS control bank and full
H2 + CO gas-detection / relief complete the plant.

The two RECOGNISABLE SIGNATURES are the fired reformer + tall stack and the PSA
adsorber bank, so both are made prominent in the hero (mirrors how the FT
reactor + fractionation column dominate the e-fuel hero).

Field-erected OPEN structural-steel SKID (NOT an enclosed container) — the same
idiom as e-fuel-synthesis-9shot.py + co2-mineralisation-9shot.py: braced open
frame + skid deck + service walkway + an elevated access platform around the
reformer + a caged ladder. hero_open_frame=True paints the frame SOLID
galvanised steel in the hero pass.

Process units modelled (left -> right along +X, by process flow):
  M1 feed pre-treatment — natural-gas feed knock-out + a lead/lag DESULPHURISER
     (hydrotreater + ZnO guard beds), feed-gas preheat coil, process-steam tie-in
  M2 reforming — the fired REFORMER FURNACE (radiant box + visible vertical
     catalyst tubes + a tall flue STACK + burner front + convection coil bank),
     the HERO, with a STEAM DRUM + waste-heat boiler alongside
  M3 shift conversion — high-temperature (HT) + low-temperature (LT) SHIFT
     reactors (two squat catalyst vessels) + an interstage process-gas cooler
  M4 hydrogen purification — the PSA adsorber BANK (a cluster of 4 tall adsorber
     vessels on a common skid — the signature) + a tail-gas buffer drum
  M5 product + utilities — H2 product COMPRESSOR, a closed-loop cooling-water dry-
     cooler skid, a demin-water tank, an MV/LV cast-resin TRANSFORMER
  M6 control & safety — DCS + SIS control cabinets, H2 + CO GAS DETECTORS, optical
     flame detectors at the reformer, PRVs, ESD valves (flammable H2 + toxic CO)

Geometry is tagged into the 11 canonical module ids so the hero reads complete
and every per-module page is rich.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P smr-9shot.py
"""
import bpy
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()
POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-smr-9shot")))

# Envelope. A 5,000 Nm3/h SMR hydrogen plant is a long field-erected skid with a
# tall fired reformer (~4 m radiant box) + a taller flue stack and a cluster of
# tall PSA adsorbers — larger than the CO2 skid, comparable to the e-fuel plant.
W = 14.0    # skid length (+X)
D = 4.0     # skid depth (Y)
H = 6.5     # frame height

MO = fl.make_module_dict([
    "structure_containment",
    "energy_conversion_transduction",
    "environmental_interface",
    "mass_fluid_transport_process",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
    "hmi_ergonomics",
    "actuation_kinematics",
])

MAT = fl.make_default_palette()
# Form-factor-specific palette (sRGB; make_mat handles the linear conversion).
MAT["furnace_steel"]  = fl.make_mat("m_furnace_steel",  (0.55, 0.40, 0.34), metallic=0.30, roughness=0.55)
MAT["radiant_hot"]    = fl.make_mat("m_radiant_hot",    (0.85, 0.32, 0.12), metallic=0.20, roughness=0.50)
MAT["catalyst_tube"]  = fl.make_mat("m_catalyst_tube",  (0.80, 0.50, 0.30), metallic=0.45, roughness=0.40)
MAT["stack_steel"]    = fl.make_mat("m_stack_steel",    (0.50, 0.50, 0.54), metallic=0.45, roughness=0.45)
MAT["shift_blue"]     = fl.make_mat("m_shift_blue",     (0.00, 0.40, 0.95), metallic=0.25, roughness=0.34)
MAT["psa_steel"]      = fl.make_mat("m_psa_steel",      (0.74, 0.78, 0.84), metallic=0.50, roughness=0.32)
MAT["psa_cap"]        = fl.make_mat("m_psa_cap",        (0.10, 0.52, 0.92), metallic=0.30, roughness=0.36)
MAT["vessel_cyan"]    = fl.make_mat("m_vessel_cyan",    (0.00, 0.72, 0.92), metallic=0.20, roughness=0.35)
MAT["compressor_blu"] = fl.make_mat("m_compressor_blu", (0.10, 0.45, 0.95), metallic=0.45, roughness=0.32)
MAT["column_steel"]   = fl.make_mat("m_column_steel",   (0.80, 0.82, 0.86), metallic=0.55, roughness=0.34)
MAT["water_tank_blue"] = fl.make_mat("m_water_tank_blue", (0.20, 0.45, 0.85), metallic=0.10, roughness=0.44)
MAT["pump_orange"]    = fl.make_mat("m_pump_orange",    (1.00, 0.40, 0.00), metallic=0.10, roughness=0.42)
MAT["pipe_feed"]      = fl.make_mat("m_pipe_feed",      (0.55, 0.70, 0.55), metallic=0.30, roughness=0.35)
MAT["pipe_h2"]        = fl.make_mat("m_pipe_h2",        (0.45, 0.70, 0.95), metallic=0.35, roughness=0.25)
MAT["pipe_syngas"]    = fl.make_mat("m_pipe_syngas",    (0.55, 0.45, 0.35), metallic=0.25, roughness=0.42)
MAT["pipe_steam"]     = fl.make_mat("m_pipe_steam",     (0.90, 0.55, 0.55), metallic=0.30, roughness=0.40)
MAT["pipe_water"]     = fl.make_mat("m_pipe_water",     (0.10, 0.40, 0.85), metallic=0.30, roughness=0.30)
MAT["valve_green"]    = fl.make_mat("m_valve_green",    (0.00, 0.95, 0.12), metallic=0.10, roughness=0.42)
MAT["warning_red"]    = fl.make_mat("m_warning_red",    (1.00, 0.00, 0.00), metallic=0.00, roughness=0.45)
MAT["walkway"]        = fl.make_mat("m_walkway",        (0.20, 0.24, 0.30), metallic=0.55, roughness=0.40)
MAT["insulation"]     = fl.make_mat("m_insulation",     (0.86, 0.84, 0.74), metallic=0.00, roughness=0.62)
MAT["white_label"]    = fl.make_mat("m_white_label",    (0.96, 0.96, 0.92), metallic=0.00, roughness=0.60)

# ── Plant layout anchors (skid runs along +X) ─────────────────────────────
# Feed pre-treatment far-left; the fired reformer + stack + steam drum centre-
# left (a hero); HT/LT shift centre; the PSA adsorber bank centre-right (the
# other hero); product compression + utilities right. Y: back row +Y, front
# row -Y, walkway at -Y edge.
DECK_Z = 0.30                       # skid-deck datum (equipment bottoms sit here)

# M1 feed pre-treatment (x 0.6 .. 2.4)
FEED_KO_X, FEED_KO_Y = 1.0, -1.20
DESULPH_X, DESULPH_Y = 1.4, 1.05    # lead/lag hydrotreater + ZnO guard beds

# M2 reformer furnace (the hero centre-left)
REFORMER_X, REFORMER_Y = 4.3, 0.45
REFORMER_W = 2.0                    # radiant box width (X)
REFORMER_D = 1.5                    # radiant box depth (Y)
REFORMER_BOX_Z = DECK_Z + 2.0      # radiant-box centre height
REFORMER_BOX_H = 3.4               # radiant-box height
STACK_X, STACK_Y = 5.3, 0.45       # flue stack (tall)
STACK_R = 0.34
STACK_TOP = DECK_Z + 7.8           # the flue tip is the tallest point (real stacks)
STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z = 4.3, -1.25, DECK_Z + 3.6

# M3 shift conversion (x 6.4 .. 7.8)
HT_SHIFT_X, HT_SHIFT_Y = 6.7, 1.05
HT_SHIFT_R = 0.50
HT_SHIFT_Z = DECK_Z + 1.5
LT_SHIFT_X, LT_SHIFT_Y = 6.7, -1.05
LT_SHIFT_R = 0.50
LT_SHIFT_Z = DECK_Z + 1.4
SHIFT_COOLER_X, SHIFT_COOLER_Y, SHIFT_COOLER_Z = 7.7, 0.0, DECK_Z + 1.7

# M4 PSA hydrogen purification (x 8.4 .. 10.4) — a 4-vessel adsorber bank
PSA_X0 = 8.9                        # centre of the first adsorber column
PSA_DX = 0.95                       # spacing between adsorbers (X)
PSA_Y_FRONT = -0.55                 # two rows: front + back
PSA_Y_BACK = 0.55
PSA_R = 0.40
PSA_BOTTOM = DECK_Z + 0.55
PSA_TOP = PSA_BOTTOM + 3.3
PSA_Z = (PSA_BOTTOM + PSA_TOP) / 2.0
PSA_H = PSA_TOP - PSA_BOTTOM
TAILGAS_DRUM_X, TAILGAS_DRUM_Y = 10.4, 1.10

# M5 product + utilities (x 10.8 .. 13.4)
H2_COMP_X, H2_COMP_Y = 11.2, -1.30
COOLING_X, COOLING_Y = 12.2, -1.10
DEMIN_TANK_X, DEMIN_TANK_Y, DEMIN_TANK_Z = 12.6, 1.05, DECK_Z + 0.85
TRANSFORMER_X, TRANSFORMER_Y = 13.0, 1.85


# ═══════ Module — structure_containment: OPEN SKID FRAME, deck, walkway, ladder
# This plant is a FIELD-ERECTED open structural-steel SKID — corner/intermediate
# posts + perimeter rails + diagonal cross-bracing on a structural deck, NOT an
# enclosed/glass container. hero_open_frame=True paints these members SOLID
# galvanised steel in the hero so the frame reads as braced steelwork.

# ── Skid BASE: structural sole-plate channels + longitudinal bearers ─────────
for name, loc, size in [
    ("smr1_base_front_channel", (W / 2, -1.92, 0.10), (W, 0.18, 0.20)),
    ("smr1_base_rear_channel", (W / 2, 1.92, 0.10), (W, 0.18, 0.20)),
    ("smr1_base_left_channel", (0.09, 0.0, 0.10), (0.18, D, 0.20)),
    ("smr1_base_right_channel", (W - 0.09, 0.0, 0.10), (0.18, D, 0.20)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)
# Three longitudinal I-beam bearers (the spine the equipment bolts down to).
for by in (-1.05, 0.0, 1.05):
    fl.add_box(f"smr1_base_bearer_{by:+.2f}", (W / 2, by, 0.13), (W - 0.3, 0.15, 0.18),
               MAT["stainless"], "structure_containment", MO)
# Transverse deck cross-members tie the bearers (skid deck grid).
for i, x in enumerate([0.8, 2.2, 3.6, 5.0, 6.4, 7.8, 9.2, 10.6, 12.0, 13.2]):
    fl.add_box(f"smr1_base_crossmember_{i}", (x, 0.0, 0.13), (0.12, 3.7, 0.16),
               MAT["stainless"], "structure_containment", MO)
# Skid deck plate (the clear datum the plant sits on).
fl.add_box("smr1_skid_deck", (W / 2, 0.0, 0.225), (W - 0.3, 3.7, 0.05),
           MAT["walkway"], "structure_containment", MO)
# Fork/crane lift lugs at the base corners.
for i, (lx, ly) in enumerate([(0.25, -1.92), (0.25, 1.92), (W - 0.25, -1.92), (W - 0.25, 1.92)]):
    fl.add_box(f"smr1_skid_lift_lug_{i}", (lx, ly, 0.28), (0.20, 0.12, 0.12),
               MAT["stainless"], "structure_containment", MO)

# ── Open frame: corner + intermediate posts (140 mm box section) ─────────────
for i, x in enumerate([0.12, 4.3, 6.7, 8.9, 11.2, W - 0.12]):
    for y in (-1.92, 1.92):
        fl.add_box(f"smr1_post_{i}_{y:+.2f}", (x, y, H / 2), (0.14, 0.14, H),
                   MAT["stainless"], "structure_containment", MO)
# Top perimeter frame.
for name, loc, size in [
    ("smr1_top_front_channel", (W / 2, -1.92, H - 0.07), (W, 0.13, 0.13)),
    ("smr1_top_rear_channel", (W / 2, 1.92, H - 0.07), (W, 0.13, 0.13)),
    ("smr1_top_left_channel", (0.07, 0.0, H - 0.07), (0.13, D, 0.13)),
    ("smr1_top_right_channel", (W - 0.07, 0.0, H - 0.07), (0.13, D, 0.13)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)
# Two mid-height perimeter tie rings (brace the tall reformer + PSA columns).
for z in (2.3, 4.4):
    fl.add_box(f"smr1_mid_tie_front_{z:.1f}", (W / 2, -1.92, z), (W, 0.09, 0.09),
               MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"smr1_mid_tie_rear_{z:.1f}", (W / 2, 1.92, z), (W, 0.09, 0.09),
               MAT["stainless"], "structure_containment", MO)

# ── Diagonal CROSS-BRACING — the unambiguous "open structural frame" signal ──
# V-braces in the two end bays (front + rear faces) drawn between EXACT frame
# node points so the members snap to the corners (the rotation-maths version
# overshoots). A braced open frame reads instantly as structural steelwork.
BRACE_R = 0.045
Z_BOT = 0.22
Z_TOP = H - 0.14
for bx0, bx1, tag in [(0.14, 4.3, "L"), (W - 2.8, W - 0.14, "R")]:
    bxm = (bx0 + bx1) / 2
    for face_y in (-1.92, 1.92):
        fl.add_pipe(f"smr1_brace_{tag}_a_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx0, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
        fl.add_pipe(f"smr1_brace_{tag}_b_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx1, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
# Sway diagonal across each open end face (bottom-front -> top-rear corner).
for ex in (0.14, W - 0.14):
    fl.add_pipe(f"smr1_brace_end_{ex:.2f}",
                [(ex, -1.92, Z_BOT), (ex, 1.92, Z_TOP)], BRACE_R,
                MAT["stainless"], "structure_containment", MO)

# ── Service walkway on -Y side at deck height (open grating) ─────────────────
fl.add_box("smr1_service_walkway_plate", (W / 2, -1.70, DECK_Z + 0.04), (W - 0.6, 0.50, 0.05),
           MAT["walkway"], "structure_containment", MO)
for i in range(36):
    x = 0.45 + i * 0.37
    fl.add_box(f"smr1_walkway_grating_{i}", (x, -1.70, DECK_Z + 0.07), (0.05, 0.48, 0.012),
               MAT["stainless"], "structure_containment", MO)

# ── Elevated operator ACCESS PLATFORM around the reformer furnace ────────────
# Open grated platform with toe-board + 2-rail handrail so operators reach the
# reformer's upper tube manifold + the steam drum; the caged ladder lands on
# its front-left corner.
PLAT_Z = 2.55
fl.add_box("smr1_reformer_platform", (REFORMER_X, 0.0, PLAT_Z), (2.4, 3.0, 0.06),
           MAT["walkway"], "structure_containment", MO)
for i in range(15):
    gx = (REFORMER_X - 1.12) + i * 0.16
    fl.add_box(f"smr1_platform_grating_{i}", (gx, 0.0, PLAT_Z + 0.035), (0.05, 2.94, 0.012),
               MAT["stainless"], "structure_containment", MO)
for i, (px, py) in enumerate([(REFORMER_X - 1.1, -1.4), (REFORMER_X + 1.1, -1.4),
                              (REFORMER_X - 1.1, 1.4), (REFORMER_X + 1.1, 1.4)]):
    fl.add_box(f"smr1_platform_support_{i}", (px, py, DECK_Z + (PLAT_Z - DECK_Z) / 2),
               (0.09, 0.09, PLAT_Z - DECK_Z), MAT["stainless"], "structure_containment", MO)
# Toe-board kick-plate around the platform edge.
for name, loc, size in [
    ("smr1_platform_toe_front", (REFORMER_X, -1.48, PLAT_Z + 0.12), (2.4, 0.03, 0.14)),
    ("smr1_platform_toe_rear", (REFORMER_X, 1.48, PLAT_Z + 0.12), (2.4, 0.03, 0.14)),
    ("smr1_platform_toe_right", (REFORMER_X + 1.18, 0.0, PLAT_Z + 0.12), (0.03, 3.0, 0.14)),
]:
    fl.add_box(name, loc, size, MAT["walkway"], "structure_containment", MO)
# Handrail posts + runs around the platform (back-left open to the ladder).
rail_posts = [(REFORMER_X - 1.1, -1.4), (REFORMER_X + 1.1, -1.4),
              (REFORMER_X - 1.1, 1.4), (REFORMER_X + 1.1, 1.4),
              (REFORMER_X, -1.4), (REFORMER_X, 1.4),
              (REFORMER_X - 1.1, 0.0), (REFORMER_X + 1.1, 0.0)]
for i, (x, y) in enumerate(rail_posts):
    fl.add_cyl(f"smr1_platform_rail_post_{i}", (x, y, PLAT_Z + 0.55), 0.022, 1.06,
               MAT["stainless"], "structure_containment", MO)
for name, loc, size in [
    ("smr1_platform_rail_top_front", (REFORMER_X, -1.4, PLAT_Z + 1.05), (2.2, 0.028, 0.028)),
    ("smr1_platform_rail_mid_front", (REFORMER_X, -1.4, PLAT_Z + 0.55), (2.2, 0.025, 0.025)),
    ("smr1_platform_rail_top_rear", (REFORMER_X, 1.4, PLAT_Z + 1.05), (2.2, 0.028, 0.028)),
    ("smr1_platform_rail_top_right", (REFORMER_X + 1.1, 0.0, PLAT_Z + 1.05), (0.028, 2.8, 0.028)),
    ("smr1_platform_rail_mid_right", (REFORMER_X + 1.1, 0.0, PLAT_Z + 0.55), (0.025, 2.8, 0.025)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction: fired REFORMER FURNACE + ════
#         stack + steam-raising (M2) AND the HT/LT SHIFT reactors (M3)
# This is the chemical CONVERSION core: the endothermic steam-methane reforming
# (CH4 + H2O -> CO + 3 H2) driven by the fired radiant box, plus the exothermic
# water-gas shift (CO + H2O -> CO2 + H2) that converts the CO to extra hydrogen.

# ── THE HERO PIECE: fired REFORMER FURNACE (radiant box + catalyst tubes) ────
# A big refractory-lined radiant box (furnace-steel + a hot radiant accent band)
# packed with a visible row of VERTICAL CATALYST TUBES poking through the roof
# (the unmistakable top-fired reformer cue) + a burner front + a tall flue STACK
# with a convection coil bank. Painted as a fired furnace, the prominent object.
fl.add_box("smr2_reformer_radiant_box", (REFORMER_X, REFORMER_Y, REFORMER_BOX_Z),
           (REFORMER_W, REFORMER_D, REFORMER_BOX_H), MAT["furnace_steel"],
           "energy_conversion_transduction", MO)
fl.add_box("smr2_reformer_radiant_lagging", (REFORMER_X, REFORMER_Y, REFORMER_BOX_Z),
           (REFORMER_W + 0.10, REFORMER_D + 0.10, REFORMER_BOX_H * 0.94), MAT["insulation"],
           "energy_conversion_transduction", MO)
# A hot radiant accent band low on the box (reads as the fired radiant section).
fl.add_box("smr2_reformer_radiant_band", (REFORMER_X, REFORMER_Y - REFORMER_D / 2 - 0.06,
           REFORMER_BOX_Z - REFORMER_BOX_H / 2 + 0.6),
           (REFORMER_W - 0.2, 0.05, 0.7), MAT["radiant_hot"],
           "energy_conversion_transduction", MO)
# Visible VERTICAL CATALYST TUBES poking proud of the radiant-box roof — two
# rows of 5 (the top-fired reformer signature).
TUBE_TOP_Z = REFORMER_BOX_Z + REFORMER_BOX_H / 2
for row, ty in enumerate((REFORMER_Y - 0.40, REFORMER_Y + 0.40)):
    for k in range(5):
        tx = REFORMER_X - 0.8 + k * 0.4
        fl.add_cyl(f"smr2_catalyst_tube_{row}_{k}", (tx, ty, TUBE_TOP_Z + 0.30), 0.075, 0.70,
                   MAT["catalyst_tube"], "energy_conversion_transduction", MO)
# Top inlet manifold (pigtails) feeding the catalyst tubes.
fl.add_cyl("smr2_reformer_inlet_manifold", (REFORMER_X, REFORMER_Y, TUBE_TOP_Z + 0.72), 0.10, REFORMER_W - 0.4,
           MAT["column_steel"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
# Bottom outlet collector header (the hot reformate manifold under the box).
fl.add_cyl("smr2_reformer_outlet_header", (REFORMER_X, REFORMER_Y, DECK_Z + 0.5), 0.14, REFORMER_W - 0.2,
           MAT["pipe_syngas"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
# Burner front: a row of burner nozzles on the -Y face of the radiant box.
for k in range(4):
    bx = REFORMER_X - 0.6 + k * 0.4
    fl.add_cyl(f"smr2_reformer_burner_{k}", (bx, REFORMER_Y - REFORMER_D / 2 - 0.10,
               REFORMER_BOX_Z - REFORMER_BOX_H / 2 + 0.5), 0.10, 0.24, MAT["radiant_hot"],
               "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))

# ── Tall flue STACK with a convection coil bank (the recognisable skyline) ───
fl.add_cyl("smr2_flue_stack", (STACK_X, STACK_Y, (DECK_Z + 3.0 + STACK_TOP) / 2),
           STACK_R, STACK_TOP - (DECK_Z + 3.0), MAT["stack_steel"],
           "energy_conversion_transduction", MO)
fl.add_torus("smr2_flue_stack_cap", (STACK_X, STACK_Y, STACK_TOP), STACK_R, 0.05,
             MAT["stainless"], "energy_conversion_transduction", MO)
# Convection section box at the stack base (waste-heat recovery coils).
fl.add_box("smr2_convection_section", (STACK_X, STACK_Y, DECK_Z + 2.3), (0.9, 1.3, 2.2),
           MAT["furnace_steel"], "energy_conversion_transduction", MO)
fl.add_box("smr2_convection_lagging", (STACK_X, STACK_Y, DECK_Z + 2.3), (0.96, 1.36, 2.1),
           MAT["insulation"], "energy_conversion_transduction", MO)
# Stack guy-wire stub lugs (read as a guyed stack).
for ang in (0, 120, 240):
    lx = STACK_X + 0.5 * math.cos(math.radians(ang))
    ly = STACK_Y + 0.5 * math.sin(math.radians(ang))
    fl.add_pipe(f"smr2_stack_guy_{ang}", [(STACK_X, STACK_Y, STACK_TOP - 0.6), (lx, ly, DECK_Z + 3.0)],
                0.012, MAT["stainless"], "energy_conversion_transduction", MO)

# ── Boiling-water STEAM DRUM + waste-heat boiler (recover the reformate heat) ─
fl.add_cyl("smr2_steam_drum", (STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z), 0.38, 2.0,
           MAT["column_steel"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
for xo in (-1.0, 1.0):
    fl.add_sphere(f"smr2_steam_drum_head_{xo:+.1f}", (STEAM_DRUM_X + xo, STEAM_DRUM_Y, STEAM_DRUM_Z), 0.38,
                  MAT["column_steel"], "energy_conversion_transduction", MO)
    fl.add_box(f"smr2_steam_drum_saddle_{xo:+.1f}", (STEAM_DRUM_X + xo * 0.6, STEAM_DRUM_Y, DECK_Z + 0.5),
               (0.5, 0.07, (STEAM_DRUM_Z - DECK_Z - 0.5) * 2), MAT["stainless"],
               "energy_conversion_transduction", MO)
# Steam riser/downcomer tying the drum to the convection waste-heat boiler.
fl.add_pipe("smr2_steam_riser", [
    (STACK_X, STACK_Y, DECK_Z + 3.2), (STACK_X, STEAM_DRUM_Y, DECK_Z + 3.6),
    (STEAM_DRUM_X + 0.5, STEAM_DRUM_Y, STEAM_DRUM_Z + 0.2)], 0.05, MAT["pipe_steam"],
    "energy_conversion_transduction", MO)

# ── HT + LT SHIFT reactors (two squat catalyst vessels) ──────────────────────
for tag, sx, sy, sr, sz, mat in [
    ("smr2_ht_shift", HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_R, HT_SHIFT_Z, MAT["shift_blue"]),
    ("smr2_lt_shift", LT_SHIFT_X, LT_SHIFT_Y, LT_SHIFT_R, LT_SHIFT_Z, MAT["shift_blue"]),
]:
    fl.add_cyl(f"{tag}_shell", (sx, sy, sz), sr, 1.8, mat, "energy_conversion_transduction", MO)
    fl.add_sphere(f"{tag}_top", (sx, sy, sz + 0.9), sr, mat, "energy_conversion_transduction", MO)
    fl.add_frustum(f"{tag}_bottom", (sx, sy, sz - 0.9 - 0.18), sr, sr * 0.4, 0.36, mat,
                   "energy_conversion_transduction", MO)
    fl.add_cyl(f"{tag}_skirt", (sx, sy, DECK_Z + 0.35), sr * 0.9, 0.5, MAT["stainless"],
               "energy_conversion_transduction", MO)


# ═══════ Module — mass_fluid_transport_process: PSA bank, desulphuriser, ═════
#         knock-out drums, H2 compressor, pumps, process pipework (M1+M4+M5)

# ── THE OTHER HERO: PSA adsorber BANK — 4 tall vessels on a common skid ──────
# A cluster of tall slim adsorber columns (steel shells + blue domed caps + tray
# support rings + a common base skid). The PSA bank is the unmistakable H2-plant
# signature, so it is grouped tightly + made prominent.
psa_positions = [
    (PSA_X0, PSA_Y_FRONT), (PSA_X0 + PSA_DX, PSA_Y_FRONT),
    (PSA_X0, PSA_Y_BACK), (PSA_X0 + PSA_DX, PSA_Y_BACK),
]
fl.add_box("smr3_psa_skid", (PSA_X0 + PSA_DX / 2, 0.0, DECK_Z + 0.20),
           (PSA_DX + 1.0, 1.6, 0.30), MAT["stainless"], "mass_fluid_transport_process", MO)
for k, (px, py) in enumerate(psa_positions):
    fl.add_cyl(f"smr3_psa_adsorber_{k}", (px, py, PSA_Z), PSA_R, PSA_H,
               MAT["psa_steel"], "mass_fluid_transport_process", MO)
    fl.add_sphere(f"smr3_psa_adsorber_cap_{k}", (px, py, PSA_TOP), PSA_R,
                  MAT["psa_cap"], "mass_fluid_transport_process", MO)
    fl.add_frustum(f"smr3_psa_adsorber_bottom_{k}", (px, py, PSA_BOTTOM - 0.16), PSA_R, PSA_R * 0.5, 0.32,
                   MAT["psa_steel"], "mass_fluid_transport_process", MO)
    # A couple of bed support rings up each adsorber (reads as a packed column).
    for i, z in enumerate([1.0, 2.0]):
        fl.add_torus(f"smr3_psa_ring_{k}_{i}", (px, py, PSA_BOTTOM + z), PSA_R + 0.02, 0.016,
                     MAT["stainless"], "mass_fluid_transport_process", MO)
# The PSA switching-valve skid (the dense valve manifold that sequences the beds)
# sits low between the columns — many actuated valves (tagged to actuation below).
fl.add_box("smr3_psa_valve_manifold", (PSA_X0 + PSA_DX / 2, 0.0, DECK_Z + 0.55),
           (PSA_DX + 0.6, 0.5, 0.4), MAT["column_steel"], "mass_fluid_transport_process", MO)

# ── M1 feed pre-treatment: NG knock-out + DESULPHURISER (lead/lag beds) ──────
fl.add_cyl("smr3_ng_feed_knockout", (FEED_KO_X, FEED_KO_Y, DECK_Z + 0.85), 0.30, 1.3,
           MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_sphere("smr3_ng_feed_knockout_top", (FEED_KO_X, FEED_KO_Y, DECK_Z + 1.5), 0.30,
              MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
# Lead/lag desulphuriser (hydrotreater + ZnO guard) — a pair of tall vessels.
for k, xo in enumerate((-0.35, 0.35)):
    fl.add_cyl(f"smr3_desulphuriser_{k}", (DESULPH_X + xo, DESULPH_Y, DECK_Z + 1.1), 0.30, 2.0,
               MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
    fl.add_sphere(f"smr3_desulphuriser_top_{k}", (DESULPH_X + xo, DESULPH_Y, DECK_Z + 2.1), 0.30,
                  MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_box("smr3_desulphuriser_skid", (DESULPH_X, DESULPH_Y, DECK_Z + 0.18), (1.1, 0.85, 0.30),
           MAT["stainless"], "mass_fluid_transport_process", MO)

# ── Tail-gas buffer drum (vertical, PSA purge to the reformer burners) ───────
fl.add_cyl("smr3_tailgas_drum", (TAILGAS_DRUM_X, TAILGAS_DRUM_Y, DECK_Z + 0.95), 0.34, 1.5,
           MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_sphere("smr3_tailgas_drum_top", (TAILGAS_DRUM_X, TAILGAS_DRUM_Y, DECK_Z + 1.7), 0.34,
              MAT["vessel_cyan"], "mass_fluid_transport_process", MO)

# ── H2 PRODUCT COMPRESSOR — reciprocating process-gas compressor ─────────────
def add_recip_compressor(tag, cx, cy, mat):
    bz = DECK_Z + 0.30
    fl.add_box(f"{tag}_baseframe", (cx, cy, bz - 0.10), (1.5, 0.7, 0.20),
               MAT["stainless"], "mass_fluid_transport_process", MO)
    fl.add_box(f"{tag}_crankcase", (cx - 0.25, cy, bz + 0.30), (0.7, 0.6, 0.55), mat,
               "mass_fluid_transport_process", MO)
    for k, yo in enumerate((-0.18, 0.18)):
        fl.add_cyl(f"{tag}_cylinder_{k}", (cx + 0.45, cy + yo, bz + 0.30), 0.16, 0.7, mat,
                   "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
    for k, xo in enumerate((0.30, 0.62)):
        fl.add_cyl(f"{tag}_bottle_{k}", (cx + xo, cy, bz + 0.85), 0.12, 0.55,
                   MAT["compressor_blu"], "mass_fluid_transport_process", MO)
    fl.add_cyl(f"{tag}_motor", (cx - 0.95, cy, bz + 0.30), 0.26, 0.7, MAT["motor"],
               "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"{tag}_motor_coupling", (cx - 0.6, cy, bz + 0.30), 0.10, 0.18, MAT["maint"],
               "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))

add_recip_compressor("smr3_h2_product_compressor", H2_COMP_X, H2_COMP_Y, MAT["compressor_blu"])

# ── Process PUMPS along the -Y walkway (boiler feedwater, condensate, cooling) ─
pump_specs = [
    ("smr3_bfw_pump", 3.0, -1.62, MAT["pump_orange"]),
    ("smr3_condensate_pump", 7.5, -1.62, MAT["pipe_water"]),
    ("smr3_cooling_water_pump", 12.0, -1.62, MAT["pump_orange"]),
]
for tag, px, py, mat in pump_specs:
    fl.add_cyl(f"{tag}", (px, py, DECK_Z + 0.22), 0.16, 0.42, mat,
               "mass_fluid_transport_process", MO)
    fl.add_cyl(f"{tag}_motor", (px, py + 0.28, DECK_Z + 0.22), 0.12, 0.34, MAT["motor"],
               "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))

# ── Major process PIPE runs (feed / steam / reformate / shifted gas / H2) ────
# NG feed -> desulphuriser -> reformer tube inlet manifold.
fl.add_pipe("smr3_ng_to_desulph", [
    (FEED_KO_X, FEED_KO_Y, DECK_Z + 0.5), (FEED_KO_X, DESULPH_Y, DECK_Z + 0.5),
    (DESULPH_X - 0.35, DESULPH_Y, DECK_Z + 0.4)], 0.045, MAT["pipe_feed"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("smr3_desulph_to_reformer", [
    (DESULPH_X + 0.35, DESULPH_Y, DECK_Z + 2.0), (REFORMER_X, DESULPH_Y, TUBE_TOP_Z + 0.72),
    (REFORMER_X, REFORMER_Y, TUBE_TOP_Z + 0.72)], 0.05, MAT["pipe_feed"],
    "mass_fluid_transport_process", MO)
# Hot reformate: reformer outlet header -> HT shift.
fl.add_pipe("smr3_reformate_to_ht_shift", [
    (REFORMER_X + REFORMER_W / 2, REFORMER_Y, DECK_Z + 0.5), (HT_SHIFT_X, REFORMER_Y, DECK_Z + 0.5),
    (HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_Z + 0.9)], 0.05, MAT["pipe_syngas"],
    "mass_fluid_transport_process", MO)
# HT shift -> interstage cooler -> LT shift.
fl.add_pipe("smr3_ht_to_cooler", [
    (HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_Z - 0.9), (SHIFT_COOLER_X, HT_SHIFT_Y, DECK_Z + 1.3),
    (SHIFT_COOLER_X, SHIFT_COOLER_Y, SHIFT_COOLER_Z)], 0.045, MAT["pipe_syngas"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("smr3_cooler_to_lt", [
    (SHIFT_COOLER_X, SHIFT_COOLER_Y, SHIFT_COOLER_Z - 0.4), (LT_SHIFT_X, SHIFT_COOLER_Y, DECK_Z + 1.2),
    (LT_SHIFT_X, LT_SHIFT_Y, LT_SHIFT_Z + 0.9)], 0.045, MAT["pipe_syngas"],
    "mass_fluid_transport_process", MO)
# Shifted gas: LT shift -> PSA bank.
fl.add_pipe("smr3_lt_to_psa", [
    (LT_SHIFT_X, LT_SHIFT_Y, LT_SHIFT_Z - 0.9), (PSA_X0, LT_SHIFT_Y, DECK_Z + 0.6),
    (PSA_X0, PSA_Y_FRONT, PSA_BOTTOM)], 0.045, MAT["pipe_syngas"],
    "mass_fluid_transport_process", MO)
# Pure H2: PSA tops -> H2 product compressor.
fl.add_pipe("smr3_psa_to_h2_comp", [
    (PSA_X0 + PSA_DX, PSA_Y_BACK, PSA_TOP + 0.2), (PSA_X0 + PSA_DX, H2_COMP_Y, DECK_Z + 2.4),
    (H2_COMP_X - 0.95, H2_COMP_Y, DECK_Z + 0.6)], 0.04, MAT["pipe_h2"],
    "mass_fluid_transport_process", MO)
# PSA tail gas -> tail-gas drum -> back to reformer burners.
fl.add_pipe("smr3_psa_tailgas_to_drum", [
    (PSA_X0 + PSA_DX, PSA_Y_BACK, PSA_BOTTOM), (TAILGAS_DRUM_X, PSA_Y_BACK, DECK_Z + 0.6),
    (TAILGAS_DRUM_X, TAILGAS_DRUM_Y, DECK_Z + 1.0)], 0.045, MAT["pipe_syngas"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("smr3_tailgas_to_burners", [
    (TAILGAS_DRUM_X, TAILGAS_DRUM_Y, DECK_Z + 0.5), (REFORMER_X, TAILGAS_DRUM_Y, DECK_Z + 0.7),
    (REFORMER_X, REFORMER_Y - REFORMER_D / 2 - 0.10, DECK_Z + 0.7)], 0.04, MAT["pipe_syngas"],
    "mass_fluid_transport_process", MO)


# ═══════ Module — environmental_interface: cooling-water, demin-water tank, ═══
#         MV transformer (M5 utilities + offsites)

# ── Closed-loop cooling-water dry-cooler skid (finned bank + fans) ──────────
for i in range(6):
    y = COOLING_Y - 0.45 + i * 0.16
    fl.add_box(f"smr7_cooling_finbank_{i}", (COOLING_X, y, DECK_Z + 1.3), (1.0, 0.07, 1.4),
               MAT["heatsink"], "environmental_interface", MO)
fl.add_box("smr7_cooling_skid_frame", (COOLING_X, COOLING_Y, DECK_Z + 0.5), (1.1, 1.2, 0.5),
           MAT["stainless"], "environmental_interface", MO)
for k, fy in enumerate((COOLING_Y - 0.3, COOLING_Y + 0.3)):
    fl.add_cyl(f"smr7_cooling_fan_{k}", (COOLING_X, fy, DECK_Z + 2.1), 0.22, 0.14, MAT["ctrl_black"],
               "environmental_interface", MO)
    fl.add_torus(f"smr7_cooling_fan_guard_{k}", (COOLING_X, fy, DECK_Z + 2.18), 0.22, 0.012,
                 MAT["stainless"], "environmental_interface", MO)

# ── Demin / boiler feedwater make-up tank (vertical, dished top) ────────────
fl.add_cyl("smr7_demin_water_tank", (DEMIN_TANK_X, DEMIN_TANK_Y, DEMIN_TANK_Z), 0.55, 1.5,
           MAT["water_tank_blue"], "environmental_interface", MO)
fl.add_sphere("smr7_demin_water_tank_top", (DEMIN_TANK_X, DEMIN_TANK_Y, DEMIN_TANK_Z + 0.75), 0.55,
              MAT["water_tank_blue"], "environmental_interface", MO)
# Interstage shift-gas process cooler (shell-and-tube, elevated horizontal).
fl.add_cyl("smr7_shift_interstage_cooler", (SHIFT_COOLER_X, SHIFT_COOLER_Y, SHIFT_COOLER_Z), 0.28, 1.6,
           MAT["thermal"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_sphere("smr7_shift_cooler_head", (SHIFT_COOLER_X + 0.8, SHIFT_COOLER_Y, SHIFT_COOLER_Z), 0.28,
              MAT["thermal"], "environmental_interface", MO)

# ── MV/LV distribution TRANSFORMER (cast-resin, on a plinth) ────────────────
fl.add_box("smr7_transformer_plinth", (TRANSFORMER_X, TRANSFORMER_Y, DECK_Z + 0.10), (1.2, 1.0, 0.20),
           MAT["stainless"], "environmental_interface", MO)
fl.add_box("smr7_transformer_tank", (TRANSFORMER_X, TRANSFORMER_Y, DECK_Z + 0.85), (1.0, 0.8, 1.3),
           MAT["powerdist"], "environmental_interface", MO)
for i in range(7):
    yo = -0.34 + i * 0.11
    fl.add_box(f"smr7_transformer_fin_{i}", (TRANSFORMER_X - 0.52, TRANSFORMER_Y + yo, DECK_Z + 0.85),
               (0.08, 0.04, 1.1), MAT["heatsink"], "environmental_interface", MO)
for k, xo in enumerate((-0.25, 0.0, 0.25)):
    fl.add_cyl(f"smr7_transformer_bushing_{k}", (TRANSFORMER_X + xo, TRANSFORMER_Y, DECK_Z + 1.65), 0.05, 0.35,
               MAT["white_label"], "environmental_interface", MO)


# ═══════ Module — power_distribution: MV switchgear, LV board, busbars, VSDs ══
fl.add_box("smr8_mv_switchgear", (13.0, 1.85, DECK_Z + 0.9), (1.0, 0.5, 1.6),
           MAT["powerdist"], "power_distribution", MO)
fl.add_box("smr8_lv_main_board", (12.0, 1.85, DECK_Z + 0.85), (1.0, 0.45, 1.5),
           MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.55, 0.70, 0.85]):
    fl.add_box(f"smr8_busbar_{i}", (12.5, 1.78, DECK_Z + z), (1.2, 0.025, 0.025),
               MAT["copper"], "power_distribution", MO)
# Cable-tray spine running the length of the skid at high level feeding drives.
fl.add_box("smr8_cable_tray_spine", (W / 2, 1.78, H - 0.6), (W - 1.0, 0.16, 0.10),
           MAT["powerdist"], "power_distribution", MO)
# Earth/grounding bar along the front sole-plate.
fl.add_box("smr8_grounding_bar", (W / 2, -1.85, DECK_Z + 0.05), (W - 1.0, 0.03, 0.03),
           MAT["copper"], "power_distribution", MO)
# VSD drive cabinets for the H2 compressor + cooling fans + feedwater pumps.
for k, cx in enumerate((H2_COMP_X, COOLING_X, 3.0)):
    fl.add_box(f"smr8_vsd_cabinet_{k}", (cx, 1.85, DECK_Z + 0.8), (0.5, 0.4, 1.4),
               MAT["powerdist"], "power_distribution", MO)


# ═══════ Module — control_compute_communication: DCS + SIS cabinets, network ═
# Floor-standing control + marshalling cabinets on the front edge (the local
# equipment room). DCS + SIS + I/O racks + a comms antenna. The cabinet DOORS +
# screens face OUTWARD (-Y, toward the operator walkway) so the front camera
# sees a legible control-panel bank, not edge-on slabs.
CAB_Y = -1.78
CAB_FRONT = CAB_Y - 0.235               # outer (walkway-facing) door plane
for k, cx in enumerate((8.5, 9.15, 9.8)):
    fl.add_box(f"smr5c_control_cabinet_{k}", (cx, CAB_Y, DECK_Z + 0.95), (0.62, 0.46, 1.7),
               MAT["control"], "control_compute_communication", MO)
    fl.add_box(f"smr5c_cabinet_handle_{k}", (cx + 0.24, CAB_FRONT, DECK_Z + 0.95), (0.03, 0.03, 0.5),
               MAT["stainless"], "control_compute_communication", MO)
fl.add_box("smr5c_dcs_controller", (8.5, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("smr5c_sis_controller", (9.15, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("smr5c_io_rack", (9.8, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("smr5c_gas_panel", (9.8, CAB_FRONT, DECK_Z + 0.55), (0.40, 0.02, 0.32),
           MAT["control"], "control_compute_communication", MO)
for k, cx in enumerate((8.5, 9.15, 9.8)):
    fl.add_box(f"smr5c_led_strip_{k}", (cx, CAB_FRONT, DECK_Z + 0.85), (0.40, 0.02, 0.05),
               MAT["sensor"], "control_compute_communication", MO)
fl.add_box("smr5c_ethernet_switch", (8.5, CAB_FRONT, DECK_Z + 1.72), (0.30, 0.02, 0.14),
           MAT["powerdist"], "control_compute_communication", MO)
fl.add_cyl("smr5c_comms_antenna", (9.8, CAB_Y, DECK_Z + 2.15), 0.014, 0.40,
           MAT["antenna"], "control_compute_communication", MO)


# ═══════ Module — safety_protection: PRVs, H2/CO gas + flame detection, ESD ══
# Pressure-relief valves on the high-pressure synthesis + shift + PSA + drums.
for tag, x, y, z in [
    ("steam_drum", STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z + 0.5),
    ("ht_shift", HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_Z + 1.0),
    ("lt_shift", LT_SHIFT_X, LT_SHIFT_Y, LT_SHIFT_Z + 1.0),
    ("psa", PSA_X0, PSA_Y_FRONT, PSA_TOP + 0.5),
    ("tailgas", TAILGAS_DRUM_X, TAILGAS_DRUM_Y, DECK_Z + 1.7),
]:
    fl.add_cyl(f"smr6_{tag}_prv", (x, y, z), 0.05, 0.20, MAT["warning_red"],
               "safety_protection", MO)
# H2 + CO GAS DETECTORS. H2 is lighter than air (detectors HIGH, at the roof) +
# CO is a toxic combustion product, so detectors at head height AND at high
# level across the reformer + shift + PSA + compressor areas.
gas_pts = [
    (REFORMER_X, -1.85, DECK_Z + 1.4), (HT_SHIFT_X, -1.85, DECK_Z + 1.4),
    (PSA_X0 + PSA_DX / 2, -1.85, DECK_Z + 1.4), (H2_COMP_X, -1.85, DECK_Z + 1.4),
    (REFORMER_X, REFORMER_Y, H - 0.5), (PSA_X0 + PSA_DX / 2, 0.0, PSA_TOP + 0.3),
    (H2_COMP_X, H2_COMP_Y, DECK_Z + 1.6), (TAILGAS_DRUM_X, TAILGAS_DRUM_Y, DECK_Z + 1.9),
]
for i, (x, y, z) in enumerate(gas_pts):
    fl.add_box(f"smr6_gas_detector_{i}", (x, y, z), (0.10, 0.06, 0.07),
               MAT["warning_red"], "safety_protection", MO)
# Optical flame detectors at the reformer burner front + the stack base.
for i, (x, y, z) in enumerate([
    (REFORMER_X - 1.0, REFORMER_Y - 1.0, DECK_Z + 2.0), (STACK_X, STACK_Y - 0.8, DECK_Z + 2.2)]):
    fl.add_box(f"smr6_flame_detector_{i}", (x, y, z), (0.12, 0.10, 0.10),
               MAT["warning_red"], "safety_protection", MO)
# Emergency stop on the outward control-cabinet door.
fl.add_cyl("smr6_estop_mushroom", (8.5, CAB_FRONT, DECK_Z + 1.6), 0.055, 0.04, MAT["safety"],
           "safety_protection", MO, rotation=(math.radians(90), 0, 0))
# Rupture disc on the HT shift + a bund kerb under the desulphuriser feed area.
fl.add_cyl("smr6_ht_shift_rupture_disc", (HT_SHIFT_X + HT_SHIFT_R, HT_SHIFT_Y, HT_SHIFT_Z + 0.4),
           0.07, 0.12, MAT["warning_red"], "safety_protection", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — sensing_instrumentation: level/pressure/temp/flow/analysers ═
# Reformer outlet temperature (the key reforming-approach measurement) + a
# multipoint tube-wall thermowell.
fl.add_cyl("smr4_reformer_outlet_temp", (REFORMER_X, REFORMER_Y - REFORMER_D / 2 - 0.06, DECK_Z + 0.7),
           0.016, 0.24, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("smr4_reformer_tube_thermowell", (REFORMER_X - REFORMER_W / 2 - 0.06, REFORMER_Y, REFORMER_BOX_Z),
           0.03, REFORMER_BOX_H * 0.8, MAT["sensor"], "sensing_instrumentation", MO)
# Shift-reactor bed temperature + dP (the shift conversion is temperature-led).
for tag, x, y, sr, sz in [("ht", HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_R, HT_SHIFT_Z),
                          ("lt", LT_SHIFT_X, LT_SHIFT_Y, LT_SHIFT_R, LT_SHIFT_Z)]:
    fl.add_box(f"smr4_{tag}_shift_dp_tx", (x - sr - 0.06, y, sz + 0.3), (0.08, 0.06, 0.12),
               MAT["sensor"], "sensing_instrumentation", MO)
    fl.add_cyl(f"smr4_{tag}_shift_temp", (x, y - sr - 0.02, sz), 0.012, 0.18,
               MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
# H2-product purity analyser on the PSA outlet (the >99.99% spec check).
fl.add_box("smr4_h2_purity_analyser", (PSA_X0 + PSA_DX, PSA_Y_BACK + 0.3, PSA_TOP - 0.4),
           (0.12, 0.08, 0.18), MAT["sensor"], "sensing_instrumentation", MO)
# Steam-drum level + tank level radar.
fl.add_box("smr4_steam_drum_level_tx", (STEAM_DRUM_X + 1.0, STEAM_DRUM_Y, STEAM_DRUM_Z + 0.2),
           (0.07, 0.06, 0.14), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("smr4_demin_tank_radar", (DEMIN_TANK_X, DEMIN_TANK_Y, DEMIN_TANK_Z + 0.85), 0.06, 0.16,
           MAT["sensor"], "sensing_instrumentation", MO)
# Coriolis flow meters on the NG feed, steam + H2 product lines.
for i, (x, y, z) in enumerate([(FEED_KO_X + 0.4, FEED_KO_Y, DECK_Z + 0.5),
                               (PSA_X0 + PSA_DX, H2_COMP_Y + 0.3, DECK_Z + 1.0)]):
    fl.add_box(f"smr4_flow_meter_{i}", (x, y, z), (0.12, 0.09, 0.14),
               MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — actuation_kinematics: PSA switching valves + control/ESD ═══
#         (compressor + pump drives are tagged here at the equipment above)
# THE PSA SWITCHING VALVES — a tight bank of fast-acting actuated valves on the
# valve manifold that sequence the adsorber beds (the defining PSA actuation).
for k in range(6):
    vx = PSA_X0 - 0.3 + k * (PSA_DX + 0.6) / 5
    fl.add_box(f"smr9_psa_switch_valve_{k}", (vx, -0.30, DECK_Z + 0.75), (0.14, 0.14, 0.12),
               MAT["valve_green"], "actuation_kinematics", MO)
    fl.add_cyl(f"smr9_psa_switch_actuator_{k}", (vx, -0.30, DECK_Z + 0.90), 0.08, 0.16, MAT["ctrl_black"],
               "actuation_kinematics", MO)
# Other pneumatic control valves on the key process lines.
valve_specs = [
    ("feed_control_valve", DESULPH_X, DESULPH_Y, DECK_Z + 2.0, MAT["pipe_feed"]),
    ("reformer_inlet_valve", REFORMER_X, REFORMER_Y, TUBE_TOP_Z + 0.72, MAT["pipe_feed"]),
    ("ht_shift_inlet_valve", HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_Z + 0.9, MAT["pipe_syngas"]),
    ("steam_control_valve", STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z + 0.4, MAT["pipe_steam"]),
]
for tag, x, y, z, mat in valve_specs:
    fl.add_box(f"smr9_{tag}_body", (x, y, z), (0.12, 0.12, 0.10), MAT["valve_green"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"smr9_{tag}_actuator", (x, y, z + 0.12), 0.07, 0.12, MAT["ctrl_black"],
               "actuation_kinematics", MO)
# Fail-safe ESD valves (larger, on the isolation points) — actuated.
for i, (x, y, z) in enumerate([
    (REFORMER_X, REFORMER_Y, DECK_Z + 0.5), (PSA_X0, PSA_Y_FRONT, PSA_BOTTOM),
    (H2_COMP_X + 0.62, H2_COMP_Y, DECK_Z + 0.85)]):
    fl.add_box(f"smr9_esd_valve_{i}", (x, y, z), (0.16, 0.16, 0.14), MAT["safety"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"smr9_esd_actuator_{i}", (x, y, z + 0.15), 0.10, 0.16, MAT["ctrl_black"],
               "actuation_kinematics", MO)


# ═══════ Module — maintenance_serviceability: ladder, drains, lifting eyes ════
# ── CAGED VERTICAL ACCESS LADDER from skid deck UP to the reformer platform ──
# The platform is a SECOND LEVEL (grating top z=2.55) so the access route MUST
# be visible: a caged fixed ladder on the -Y face under the platform left bay,
# stiles continuing ~0.9 m above the landing, a step-through landing + a hooped
# safety cage.
LAD_X = REFORMER_X - 1.1
LAD_Y = -1.96
LAD_W = 0.26
LAD_FOOT = DECK_Z + 0.05
LAD_LAND = PLAT_Z
LAD_TOP = LAD_LAND + 0.90
lad_mid = (LAD_FOOT + LAD_TOP) / 2.0
lad_h = LAD_TOP - LAD_FOOT
for sx in (LAD_X - LAD_W / 2, LAD_X + LAD_W / 2):
    fl.add_cyl(f"smr10_ladder_stile_{sx:.2f}", (sx, LAD_Y, lad_mid), 0.024, lad_h,
               MAT["maint"], "maintenance_serviceability", MO)
n_rungs = int((LAD_LAND - LAD_FOOT) / 0.28) + 1
for i in range(n_rungs):
    z = LAD_FOOT + i * 0.28
    fl.add_cyl(f"smr10_ladder_rung_{i}", (LAD_X, LAD_Y, z), 0.016, LAD_W,
               MAT["maint"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
cage_r = 0.26
cage_cy = LAD_Y - 0.10
cage_hoop_z = [DECK_Z + 1.1, DECK_Z + 1.55, DECK_Z + 2.0, LAD_LAND]
for i, z in enumerate(cage_hoop_z):
    fl.add_torus(f"smr10_ladder_cage_hoop_{i}", (LAD_X, cage_cy, z), cage_r, 0.012,
                 MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
for j, ang in enumerate([-70, -35, 0, 35, 70]):
    sx = LAD_X + cage_r * math.sin(math.radians(ang))
    sy = cage_cy - cage_r * math.cos(math.radians(ang))
    fl.add_cyl(f"smr10_ladder_cage_stringer_{j}", (sx, sy, (DECK_Z + 1.1 + LAD_LAND) / 2), 0.009,
               LAD_LAND - (DECK_Z + 1.1), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("smr10_ladder_landing_plate", (LAD_X, -1.6, LAD_LAND + 0.02), (LAD_W + 0.22, 0.5, 0.05),
           MAT["maint"], "maintenance_serviceability", MO)
# Manual drain valves at the base of the major vessels.
for i, (x, y) in enumerate([
    (HT_SHIFT_X, HT_SHIFT_Y), (LT_SHIFT_X, LT_SHIFT_Y), (PSA_X0, PSA_Y_FRONT),
    (PSA_X0 + PSA_DX, PSA_Y_BACK), (DEMIN_TANK_X, DEMIN_TANK_Y), (TAILGAS_DRUM_X, TAILGAS_DRUM_Y)]):
    fl.add_cyl(f"smr10_drain_valve_{i}", (x, y - 0.3, DECK_Z + 0.22), 0.032, 0.08, MAT["maint"],
               "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Lifting eyes on the tall-vessel heads for crane maintenance.
for i, (x, y, z) in enumerate([(REFORMER_X, REFORMER_Y, TUBE_TOP_Z + 1.1),
                               (PSA_X0, PSA_Y_FRONT, PSA_TOP + 0.3),
                               (HT_SHIFT_X, HT_SHIFT_Y, HT_SHIFT_Z + 1.1)]):
    fl.add_torus(f"smr10_lifting_eye_{i}", (x, y, z), 0.06, 0.014, MAT["maint"],
                 "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Spare catalyst drum (reformer-tube + shift catalyst is consumable) + tool tray.
fl.add_cyl("smr10_spare_catalyst_drum", (2.6, -1.62, DECK_Z + 0.35), 0.22, 0.60, MAT["white_label"],
           "maintenance_serviceability", MO)
fl.add_box("smr10_tool_tray", (10.6, -1.62, DECK_Z + 0.35), (0.6, 0.2, 0.06), MAT["maint"],
           "maintenance_serviceability", MO)


# ═══════ Module — hmi_ergonomics: local HMI panel, buttons, status beacon ════
# Mounted on the OUTWARD (walkway-facing, -Y) cabinet door alongside the DCS/SIS.
HMI_FRONT = CAB_Y - 0.245
fl.add_box("smr3h_hmi_bezel", (9.15, HMI_FRONT, DECK_Z + 1.85), (0.38, 0.03, 0.30),
           MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("smr3h_hmi_screen", (9.15, HMI_FRONT - 0.01, DECK_Z + 1.85), (0.32, 0.006, 0.23),
           MAT["hmi"], "hmi_ergonomics", MO)
for i, (xo, mat) in enumerate([(-0.12, MAT["sensor"]), (0.0, MAT["control"]), (0.12, MAT["safety"])]):
    fl.add_cyl(f"smr3h_operator_button_{i}", (9.15 + xo, HMI_FRONT, DECK_Z + 1.58), 0.024, 0.016, mat,
               "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for i, mat in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"smr3h_status_beacon_{i}", (9.8, CAB_Y, DECK_Z + 2.4 + i * 0.07), 0.045, 0.06, mat,
               "hmi_ergonomics", MO)
fl.add_box("smr3h_instruction_placard", (8.5, HMI_FRONT, DECK_Z + 0.45), (0.24, 0.006, 0.14),
           MAT["white_label"], "hmi_ergonomics", MO)


fl.add_lights(target_centre=(W / 2, 0, H / 2), fill_energy=320, fill_size=22)
fl.make_world_white()
# hero_open_frame=True: this is a FIELD-ERECTED open structural-steel SKID
# (fired reformer + stack + shift reactors + PSA bank on a braced steel frame),
# NOT an enclosed/glass container — paint the frame SOLID steel in the hero so
# it reads as braced open steelwork on a skid deck, not a translucent box.
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment",
                       hero_open_frame=True)
