"""e-fuel-synthesis-9shot.py — ~1,000 t/yr Power-to-Liquid Fischer-Tropsch SAF plant.

First-commercial OXCCU-style PtL train that hydrogenates biogenic CO2 with
renewable H2 directly to jet-range paraffins over a shaped iron catalyst
(CO2 + 3 H2 -> -CH2- + 2 H2O; iron does the in-situ water-gas-shift, so there
is NO separate reverse-WGS reactor — single-step synthesis), recovers the
exotherm as raised steam, separates + recycles the tail gas to near-extinction,
then upgrades + fractionates the syncrude into an on-spec SAF cut + naphtha.

Field-erected OPEN structural-steel SKID (NOT an enclosed container) — the same
idiom as co2-mineralisation-9shot.py: braced open frame + skid deck + service
walkway + an elevated access platform around the tall reactor + a caged ladder.
hero_open_frame=True paints the frame SOLID galvanised steel in the hero pass.

Process units modelled (left -> right along +X, by process flow):
  M1 feedstock receipt & conditioning — CO2 twin-tower dryer, sulphur/oxygen
     guard beds, renewable-H2 buffer, CO2 + H2 FEED COMPRESSORS to ~25 bar
  M2 synthesis — fired/electric FEED PREHEATER (furnace + stack), the HERO
     multitubular fixed-bed FISCHER-TROPSCH REACTOR (visible tube bundle hint +
     tubesheet domes + insulation lagging) with a STEAM DRUM alongside
  M3 separation & recycle — hot + cold horizontal 3-phase SEPARATORS, effluent
     product cooler, tail-gas RECYCLE COMPRESSOR, recycle knock-out drum
  M4 upgrading & fractionation — hydrocracker + isomerisation reactors + a tall
     trayed FRACTIONATION COLUMN with reboiler + overhead condenser + reflux drum
  M5 utilities & offsites — waste-heat steam generator, cooling-water skid, N2 +
     instrument-air packages, MV/LV TRANSFORMER, a THERMAL OXIDISER / flare stack
  M6 product storage & loading — SAF + NAPHTHA API-650 storage TANKS + a road-
     tanker LOADING GANTRY with a loading arm + custody metering skid
  M7 control & safety — DCS + SIS control cabinets, H2/CO/flammable GAS DETECTORS,
     flame detectors, ESD valves (pyrophoric reduced-iron catalyst + toxic CO)

Geometry is tagged into the canonical module ids the e_fuel_synthesis design
actually uses (mass_fluid_transport_process, energy_conversion_transduction,
environmental_interface, maintenance_serviceability, control_compute_communication)
plus the remaining canonical ids (structure_containment for the hero frame,
power_distribution, safety_protection, sensing_instrumentation, hmi_ergonomics,
actuation_kinematics) so the hero reads complete and every module page is rich.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P e-fuel-synthesis-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-e-fuel-synthesis-9shot")))

# Envelope. A 1,000 t/yr FT PtL plant is a long field-erected skid with a tall
# FT reactor (~3.8 m) and a tall fractionation column — much larger than the
# CO2 skid. The skid runs along +X; the fractionation column is the tallest
# process vessel and the thermal-oxidiser flare stack is taller still.
W = 14.0    # skid length (+X)
D = 4.0     # skid depth (Y)
H = 7.0     # frame height

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
MAT["column_steel"]   = fl.make_mat("m_column_steel",   (0.80, 0.82, 0.86), metallic=0.55, roughness=0.34)
MAT["reactor_blue"]   = fl.make_mat("m_reactor_blue",   (0.00, 0.40, 0.95), metallic=0.25, roughness=0.34)
MAT["vessel_cyan"]    = fl.make_mat("m_vessel_cyan",    (0.00, 0.72, 0.92), metallic=0.20, roughness=0.35)
MAT["compressor_blu"] = fl.make_mat("m_compressor_blu", (0.10, 0.45, 0.95), metallic=0.45, roughness=0.32)
MAT["saf_tank_green"] = fl.make_mat("m_saf_tank_green", (0.00, 0.60, 0.34), metallic=0.10, roughness=0.44)
MAT["naphtha_tank"]   = fl.make_mat("m_naphtha_tank",   (0.30, 0.55, 0.30), metallic=0.10, roughness=0.46)
MAT["furnace_steel"]  = fl.make_mat("m_furnace_steel",  (0.55, 0.40, 0.34), metallic=0.30, roughness=0.55)
MAT["flare_steel"]    = fl.make_mat("m_flare_steel",    (0.50, 0.50, 0.54), metallic=0.45, roughness=0.45)
MAT["flare_tip"]      = fl.make_mat("m_flare_tip",      (1.00, 0.35, 0.00), metallic=0.10, roughness=0.50)
MAT["pump_orange"]    = fl.make_mat("m_pump_orange",    (1.00, 0.40, 0.00), metallic=0.10, roughness=0.42)
MAT["pipe_feed"]      = fl.make_mat("m_pipe_feed",      (0.20, 0.80, 0.95), metallic=0.35, roughness=0.25)
MAT["pipe_h2"]        = fl.make_mat("m_pipe_h2",        (0.45, 0.70, 0.95), metallic=0.35, roughness=0.25)
MAT["pipe_syncrude"]  = fl.make_mat("m_pipe_syncrude",  (0.45, 0.35, 0.20), metallic=0.25, roughness=0.42)
MAT["pipe_steam"]     = fl.make_mat("m_pipe_steam",     (0.90, 0.55, 0.55), metallic=0.30, roughness=0.40)
MAT["pipe_product"]   = fl.make_mat("m_pipe_product",   (0.00, 0.60, 0.34), metallic=0.30, roughness=0.30)
MAT["valve_green"]    = fl.make_mat("m_valve_green",    (0.00, 0.95, 0.12), metallic=0.10, roughness=0.42)
MAT["warning_red"]    = fl.make_mat("m_warning_red",    (1.00, 0.00, 0.00), metallic=0.00, roughness=0.45)
MAT["walkway"]        = fl.make_mat("m_walkway",        (0.20, 0.24, 0.30), metallic=0.55, roughness=0.40)
MAT["insulation"]     = fl.make_mat("m_insulation",     (0.86, 0.84, 0.74), metallic=0.00, roughness=0.62)
MAT["white_label"]    = fl.make_mat("m_white_label",    (0.96, 0.96, 0.92), metallic=0.00, roughness=0.60)

# ── Plant layout anchors (skid runs along +X) ─────────────────────────────
# Feedstock conditioning far-left; preheater + FT reactor centre (the hero);
# separation centre-right; upgrading + fractionation column right; utilities +
# storage farther right. Y: back row +Y, front row -Y, walkway at -Y edge.
DECK_Z = 0.30                       # skid-deck datum (equipment bottoms sit here)

# M1 feedstock conditioning (x 0.6 .. 2.6)
CO2_DRYER_X = 1.0
GUARD_BED_X = 1.0
H2_BUFFER_X = 1.9
CO2_COMP_X, CO2_COMP_Y = 0.95, -1.30
H2_COMP_X, H2_COMP_Y = 2.05, -1.30

# M2 preheater + FT reactor (the hero centre)
PREHEATER_X, PREHEATER_Y = 3.5, 1.05
FT_REACTOR_X, FT_REACTOR_Y = 5.0, 0.0
FT_R = 0.62
FT_BOTTOM = DECK_Z + 0.95
FT_TOP = FT_BOTTOM + 3.9
FT_Z = (FT_BOTTOM + FT_TOP) / 2.0
FT_H = FT_TOP - FT_BOTTOM
STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z = 5.0, -1.25, FT_TOP - 0.4

# M3 separation + recycle (x 6.2 .. 8.0)
HOT_SEP_X, HOT_SEP_Y, HOT_SEP_Z = 6.9, 1.05, DECK_Z + 0.70
COLD_SEP_X, COLD_SEP_Y, COLD_SEP_Z = 6.9, -1.15, DECK_Z + 0.70
PRODUCT_COOLER_X, PRODUCT_COOLER_Y, PRODUCT_COOLER_Z = 7.9, 0.0, DECK_Z + 1.7
RECYCLE_COMP_X, RECYCLE_COMP_Y = 7.7, -1.30

# M4 upgrading + fractionation (x 8.4 .. 10.6)
HYDROCRACKER_X, HYDROCRACKER_Y = 8.7, 1.10
HYDROCRACKER_R = 0.40
HYDROCRACKER_Z = DECK_Z + 1.9
ISOMERISER_X, ISOMERISER_Y = 8.7, -1.05
ISOMERISER_R = 0.36
ISOMERISER_Z = DECK_Z + 1.7
FRAC_COL_X, FRAC_COL_Y = 9.9, 0.0      # the tall fractionation column (skyline)
FRAC_R = 0.52
FRAC_BOTTOM = DECK_Z + 0.55
FRAC_TOP = FRAC_BOTTOM + 7.5            # protrudes ABOVE the H=7.0 frame (real
FRAC_Z = (FRAC_BOTTOM + FRAC_TOP) / 2.0  # columns tower over the pipe rack)
FRAC_H = FRAC_TOP - FRAC_BOTTOM

# M5 utilities + offsites (x 10.8 .. 12.2)
STEAM_GEN_X, STEAM_GEN_Y, STEAM_GEN_Z = 11.0, 1.10, DECK_Z + 1.0
COOLING_X, COOLING_Y = 11.2, -1.10
TRANSFORMER_X, TRANSFORMER_Y = 12.0, 1.20
FLARE_X, FLARE_Y = 12.2, -1.30         # thermal oxidiser / flare stack (tallest)
FLARE_R = 0.28
FLARE_TOP = DECK_Z + 8.4               # the flare tip is the tallest point, well
                                        # clear of the H=7.0 frame (real stacks)

# M6 product storage + loading (x 12.6 .. 13.6)
SAF_TANK_X, SAF_TANK_Y = 13.0, 1.05
NAPHTHA_TANK_X, NAPHTHA_TANK_Y = 13.0, -1.05
TANK_R = 0.85
TANK_Z = DECK_Z + 0.95
TANK_H = 1.55
GANTRY_X, GANTRY_Y = 13.55, 0.0


# ═══════ Module — structure_containment: OPEN SKID FRAME, deck, walkway, ladder
# This plant is a FIELD-ERECTED open structural-steel SKID — corner/intermediate
# posts + perimeter rails + diagonal cross-bracing on a structural deck, NOT an
# enclosed/glass container. hero_open_frame=True paints these members SOLID
# galvanised steel in the hero so the frame reads as braced steelwork.

# ── Skid BASE: structural sole-plate channels + longitudinal bearers ─────────
for name, loc, size in [
    ("ef1_base_front_channel", (W / 2, -1.92, 0.10), (W, 0.18, 0.20)),
    ("ef1_base_rear_channel", (W / 2, 1.92, 0.10), (W, 0.18, 0.20)),
    ("ef1_base_left_channel", (0.09, 0.0, 0.10), (0.18, D, 0.20)),
    ("ef1_base_right_channel", (W - 0.09, 0.0, 0.10), (0.18, D, 0.20)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)
# Three longitudinal I-beam bearers (the spine the vessels bolt down to).
for by in (-1.05, 0.0, 1.05):
    fl.add_box(f"ef1_base_bearer_{by:+.2f}", (W / 2, by, 0.13), (W - 0.3, 0.15, 0.18),
               MAT["stainless"], "structure_containment", MO)
# Transverse deck cross-members tie the bearers (skid deck grid).
for i, x in enumerate([0.8, 2.2, 3.6, 5.0, 6.4, 7.8, 9.2, 10.6, 12.0, 13.2]):
    fl.add_box(f"ef1_base_crossmember_{i}", (x, 0.0, 0.13), (0.12, 3.7, 0.16),
               MAT["stainless"], "structure_containment", MO)
# Skid deck plate (the clear datum the plant sits on).
fl.add_box("ef1_skid_deck", (W / 2, 0.0, 0.225), (W - 0.3, 3.7, 0.05),
           MAT["walkway"], "structure_containment", MO)
# Fork/crane lift lugs at the base corners.
for i, (lx, ly) in enumerate([(0.25, -1.92), (0.25, 1.92), (W - 0.25, -1.92), (W - 0.25, 1.92)]):
    fl.add_box(f"ef1_skid_lift_lug_{i}", (lx, ly, 0.28), (0.20, 0.12, 0.12),
               MAT["stainless"], "structure_containment", MO)

# ── Open frame: corner + intermediate posts (140 mm box section) ─────────────
for i, x in enumerate([0.12, 3.5, 5.0, 7.0, 9.9, W - 0.12]):
    for y in (-1.92, 1.92):
        fl.add_box(f"ef1_post_{i}_{y:+.2f}", (x, y, H / 2), (0.14, 0.14, H),
                   MAT["stainless"], "structure_containment", MO)
# Top perimeter frame.
for name, loc, size in [
    ("ef1_top_front_channel", (W / 2, -1.92, H - 0.07), (W, 0.13, 0.13)),
    ("ef1_top_rear_channel", (W / 2, 1.92, H - 0.07), (W, 0.13, 0.13)),
    ("ef1_top_left_channel", (0.07, 0.0, H - 0.07), (0.13, D, 0.13)),
    ("ef1_top_right_channel", (W - 0.07, 0.0, H - 0.07), (0.13, D, 0.13)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)
# Two mid-height perimeter tie rings (brace the tall vessels + frame the bays).
for z in (2.4, 4.6):
    fl.add_box(f"ef1_mid_tie_front_{z:.1f}", (W / 2, -1.92, z), (W, 0.09, 0.09),
               MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"ef1_mid_tie_rear_{z:.1f}", (W / 2, 1.92, z), (W, 0.09, 0.09),
               MAT["stainless"], "structure_containment", MO)

# ── Diagonal CROSS-BRACING — the unambiguous "open structural frame" signal ──
# V-braces in the two end bays (front + rear faces) drawn between EXACT frame
# node points so the members snap to the corners (the rotation-maths version
# overshoots). A braced open frame reads instantly as structural steelwork.
BRACE_R = 0.045
Z_BOT = 0.22
Z_TOP = H - 0.14
for bx0, bx1, tag in [(0.14, 3.5, "L"), (W - 3.5, W - 0.14, "R")]:
    bxm = (bx0 + bx1) / 2
    for face_y in (-1.92, 1.92):
        fl.add_pipe(f"ef1_brace_{tag}_a_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx0, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
        fl.add_pipe(f"ef1_brace_{tag}_b_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx1, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
# Sway diagonal across each open end face (bottom-front -> top-rear corner).
for ex in (0.14, W - 0.14):
    fl.add_pipe(f"ef1_brace_end_{ex:.2f}",
                [(ex, -1.92, Z_BOT), (ex, 1.92, Z_TOP)], BRACE_R,
                MAT["stainless"], "structure_containment", MO)

# ── Service walkway on -Y side at deck height (open grating) ─────────────────
fl.add_box("ef1_service_walkway_plate", (W / 2, -1.70, DECK_Z + 0.04), (W - 0.6, 0.50, 0.05),
           MAT["walkway"], "structure_containment", MO)
for i in range(36):
    x = 0.45 + i * 0.37
    fl.add_box(f"ef1_walkway_grating_{i}", (x, -1.70, DECK_Z + 0.07), (0.05, 0.48, 0.012),
               MAT["stainless"], "structure_containment", MO)

# ── Elevated operator ACCESS PLATFORM around the tall FT reactor ─────────────
# Open grated platform with toe-board + 2-rail handrail so operators reach the
# reactor's upper manway; the caged ladder lands on its front-left corner.
PLAT_Z = 2.55
fl.add_box("ef1_reactor_platform", (FT_REACTOR_X, 0.0, PLAT_Z), (2.0, 3.0, 0.06),
           MAT["walkway"], "structure_containment", MO)
for i in range(13):
    gx = (FT_REACTOR_X - 0.92) + i * 0.155
    fl.add_box(f"ef1_platform_grating_{i}", (gx, 0.0, PLAT_Z + 0.035), (0.05, 2.94, 0.012),
               MAT["stainless"], "structure_containment", MO)
for i, (px, py) in enumerate([(FT_REACTOR_X - 0.9, -1.4), (FT_REACTOR_X + 0.9, -1.4),
                              (FT_REACTOR_X - 0.9, 1.4), (FT_REACTOR_X + 0.9, 1.4)]):
    fl.add_box(f"ef1_platform_support_{i}", (px, py, DECK_Z + (PLAT_Z - DECK_Z) / 2),
               (0.09, 0.09, PLAT_Z - DECK_Z), MAT["stainless"], "structure_containment", MO)
# Toe-board kick-plate around the platform edge.
for name, loc, size in [
    ("ef1_platform_toe_front", (FT_REACTOR_X, -1.48, PLAT_Z + 0.12), (2.0, 0.03, 0.14)),
    ("ef1_platform_toe_rear", (FT_REACTOR_X, 1.48, PLAT_Z + 0.12), (2.0, 0.03, 0.14)),
    ("ef1_platform_toe_right", (FT_REACTOR_X + 0.98, 0.0, PLAT_Z + 0.12), (0.03, 3.0, 0.14)),
]:
    fl.add_box(name, loc, size, MAT["walkway"], "structure_containment", MO)
# Handrail posts + runs around the platform (front + ends + back; back-left open to ladder).
rail_posts = [(FT_REACTOR_X - 0.9, -1.4), (FT_REACTOR_X + 0.9, -1.4),
              (FT_REACTOR_X - 0.9, 1.4), (FT_REACTOR_X + 0.9, 1.4),
              (FT_REACTOR_X, -1.4), (FT_REACTOR_X, 1.4),
              (FT_REACTOR_X - 0.9, 0.0), (FT_REACTOR_X + 0.9, 0.0)]
for i, (x, y) in enumerate(rail_posts):
    fl.add_cyl(f"ef1_platform_rail_post_{i}", (x, y, PLAT_Z + 0.55), 0.022, 1.06,
               MAT["stainless"], "structure_containment", MO)
for name, loc, size in [
    ("ef1_platform_rail_top_front", (FT_REACTOR_X, -1.4, PLAT_Z + 1.05), (1.8, 0.028, 0.028)),
    ("ef1_platform_rail_mid_front", (FT_REACTOR_X, -1.4, PLAT_Z + 0.55), (1.8, 0.025, 0.025)),
    ("ef1_platform_rail_top_rear", (FT_REACTOR_X, 1.4, PLAT_Z + 1.05), (1.8, 0.028, 0.028)),
    ("ef1_platform_rail_top_right", (FT_REACTOR_X + 0.9, 0.0, PLAT_Z + 1.05), (0.028, 2.8, 0.028)),
    ("ef1_platform_rail_mid_right", (FT_REACTOR_X + 0.9, 0.0, PLAT_Z + 0.55), (0.025, 2.8, 0.025)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction: FT reactor + preheater + ════
#         steam-raising (M2) AND upgrading reactors + fractionation column (M4)
# This is the chemical CONVERSION core: the single-step FT synthesis where
# CO2 is hydrogenated to jet-range paraffins, plus the downstream hydroprocessing
# + fractionation that finish the SAF cut.

# ── THE HERO PIECE: single-step multitubular FISCHER-TROPSCH reactor ─────────
# Tall fixed-bed vessel: shell + insulation lagging + top/bottom tubesheet domes
# + a visible TUBE-BUNDLE hint (a ring of vertical tubes peeking above the top
# tubesheet, the unmistakable multitubular cue) + a boiling-water STEAM DRUM
# alongside raising the exotherm steam. Painted reactor-blue, the prominent
# centre object.
fl.add_cyl("ef2_ft_reactor_shell", (FT_REACTOR_X, FT_REACTOR_Y, FT_Z),
           FT_R, FT_H, MAT["reactor_blue"], "energy_conversion_transduction", MO)
fl.add_cyl("ef2_ft_reactor_lagging", (FT_REACTOR_X, FT_REACTOR_Y, FT_Z),
           FT_R + 0.06, FT_H * 0.92, MAT["insulation"], "energy_conversion_transduction", MO)
# Top + bottom tubesheet domes (hemispherical heads).
fl.add_sphere("ef2_ft_reactor_top_dome", (FT_REACTOR_X, FT_REACTOR_Y, FT_TOP),
              FT_R, MAT["reactor_blue"], "energy_conversion_transduction", MO)
fl.add_sphere("ef2_ft_reactor_bottom_dome", (FT_REACTOR_X, FT_REACTOR_Y, FT_BOTTOM),
              FT_R, MAT["reactor_blue"], "energy_conversion_transduction", MO)
# Tubesheet collars (flanged rings) at top + bottom — read as the tubesheets.
for z in (FT_TOP - 0.05, FT_BOTTOM + 0.05):
    fl.add_cyl(f"ef2_ft_tubesheet_{z:.2f}", (FT_REACTOR_X, FT_REACTOR_Y, z),
               FT_R + 0.07, 0.10, MAT["column_steel"], "energy_conversion_transduction", MO)
# Visible TUBE-BUNDLE hint: a concentric ring of slim vertical tubes standing
# proud of the top tubesheet (the multitubular fixed-bed cue).
for j in range(12):
    ang = (j / 12) * 2 * math.pi
    tx = FT_REACTOR_X + 0.40 * math.cos(ang)
    ty = FT_REACTOR_Y + 0.40 * math.sin(ang)
    fl.add_cyl(f"ef2_ft_tube_{j}", (tx, ty, FT_TOP + 0.22), 0.028, 0.40,
               MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_cyl("ef2_ft_tube_centre", (FT_REACTOR_X, FT_REACTOR_Y, FT_TOP + 0.22), 0.030, 0.40,
           MAT["column_steel"], "energy_conversion_transduction", MO)
# Reactor support skirt down to the deck.
fl.add_cyl("ef2_ft_reactor_skirt", (FT_REACTOR_X, FT_REACTOR_Y, DECK_Z + 0.55), FT_R * 0.92, 0.85,
           MAT["stainless"], "energy_conversion_transduction", MO)
# Boiling-water STEAM DRUM alongside (horizontal vessel raising the exotherm steam).
fl.add_cyl("ef2_steam_drum", (STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z), 0.34, 1.7,
           MAT["column_steel"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
for sy in (STEAM_DRUM_Y - 0.85, STEAM_DRUM_Y + 0.85):
    fl.add_sphere(f"ef2_steam_drum_head_{sy:+.2f}", (STEAM_DRUM_X, sy, STEAM_DRUM_Z), 0.34,
                  MAT["column_steel"], "energy_conversion_transduction", MO)
# Steam-drum support saddles + downcomer/riser stubs to the reactor jacket.
for sy in (STEAM_DRUM_Y - 0.5, STEAM_DRUM_Y + 0.5):
    fl.add_box(f"ef2_steam_drum_saddle_{sy:+.2f}", (STEAM_DRUM_X, sy, DECK_Z + 0.5),
               (0.5, 0.07, (STEAM_DRUM_Z - DECK_Z - 0.5) * 2), MAT["stainless"],
               "energy_conversion_transduction", MO)
fl.add_pipe("ef2_steam_riser", [
    (FT_REACTOR_X, FT_REACTOR_Y, FT_TOP - 0.3), (FT_REACTOR_X, STEAM_DRUM_Y, FT_TOP - 0.3),
    (STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z + 0.2)], 0.05, MAT["pipe_steam"],
    "energy_conversion_transduction", MO)
fl.add_pipe("ef2_steam_downcomer", [
    (STEAM_DRUM_X + 0.2, STEAM_DRUM_Y, STEAM_DRUM_Z - 0.25),
    (FT_REACTOR_X + 0.2, STEAM_DRUM_Y, FT_BOTTOM + 0.3),
    (FT_REACTOR_X + 0.2, FT_REACTOR_Y, FT_BOTTOM + 0.3)], 0.045, MAT["pipe_steam"],
    "energy_conversion_transduction", MO)

# ── Combined-feed PREHEATER: a fired-heater / furnace box with a stack ───────
fl.add_box("ef2_feed_preheater_box", (PREHEATER_X, PREHEATER_Y, DECK_Z + 1.0),
           (1.1, 1.0, 1.8), MAT["furnace_steel"], "energy_conversion_transduction", MO)
fl.add_box("ef2_feed_preheater_lagging", (PREHEATER_X, PREHEATER_Y, DECK_Z + 1.0),
           (1.16, 1.06, 1.7), MAT["insulation"], "energy_conversion_transduction", MO)
# Convection-section stack rising from the preheater.
fl.add_cyl("ef2_preheater_stack", (PREHEATER_X + 0.35, PREHEATER_Y, DECK_Z + 2.8), 0.22, 1.9,
           MAT["furnace_steel"], "energy_conversion_transduction", MO)
fl.add_torus("ef2_preheater_stack_cap", (PREHEATER_X + 0.35, PREHEATER_Y, DECK_Z + 3.75), 0.22, 0.04,
             MAT["stainless"], "energy_conversion_transduction", MO)
# Burner front + coil-pass nozzles on the preheater face.
fl.add_cyl("ef2_preheater_burner", (PREHEATER_X, PREHEATER_Y - 0.55, DECK_Z + 0.5), 0.18, 0.30,
           MAT["furnace_steel"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
# Catalyst-activation electric startup heater (small vessel beside the reactor).
fl.add_cyl("ef2_catalyst_activation_heater", (FT_REACTOR_X - 0.95, FT_REACTOR_Y + 0.9, DECK_Z + 0.9),
           0.22, 1.2, MAT["thermal"], "energy_conversion_transduction", MO)

# ── M4: hydrocracker + isomerisation reactors (HP trickle-bed vessels) ───────
fl.add_cyl("ef2_hydrocracker_shell", (HYDROCRACKER_X, HYDROCRACKER_Y, HYDROCRACKER_Z),
           HYDROCRACKER_R, 2.6, MAT["vessel_cyan"], "energy_conversion_transduction", MO)
fl.add_sphere("ef2_hydrocracker_top", (HYDROCRACKER_X, HYDROCRACKER_Y, HYDROCRACKER_Z + 1.3),
              HYDROCRACKER_R, MAT["vessel_cyan"], "energy_conversion_transduction", MO)
fl.add_sphere("ef2_hydrocracker_bot", (HYDROCRACKER_X, HYDROCRACKER_Y, HYDROCRACKER_Z - 1.3),
              HYDROCRACKER_R, MAT["vessel_cyan"], "energy_conversion_transduction", MO)
fl.add_cyl("ef2_hydrocracker_skirt", (HYDROCRACKER_X, HYDROCRACKER_Y, DECK_Z + 0.45),
           HYDROCRACKER_R * 0.9, 0.7, MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_cyl("ef2_isomeriser_shell", (ISOMERISER_X, ISOMERISER_Y, ISOMERISER_Z),
           ISOMERISER_R, 2.2, MAT["vessel_cyan"], "energy_conversion_transduction", MO)
fl.add_sphere("ef2_isomeriser_top", (ISOMERISER_X, ISOMERISER_Y, ISOMERISER_Z + 1.1),
              ISOMERISER_R, MAT["vessel_cyan"], "energy_conversion_transduction", MO)
fl.add_sphere("ef2_isomeriser_bot", (ISOMERISER_X, ISOMERISER_Y, ISOMERISER_Z - 1.1),
              ISOMERISER_R, MAT["vessel_cyan"], "energy_conversion_transduction", MO)
fl.add_cyl("ef2_isomeriser_skirt", (ISOMERISER_X, ISOMERISER_Y, DECK_Z + 0.45),
           ISOMERISER_R * 0.9, 0.7, MAT["stainless"], "energy_conversion_transduction", MO)

# ── M4: the tall trayed FRACTIONATION COLUMN (SAF / naphtha / residue split) ──
# The skyline object: a tall packed/trayed tower with visible tray rings, top +
# bottom heads, an overhead condenser + reflux drum up top, a thermosiphon
# reboiler at the base, all field-erected on a plinth.
fl.add_cyl("ef2_frac_column_shell", (FRAC_COL_X, FRAC_COL_Y, FRAC_Z),
           FRAC_R, FRAC_H, MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_cyl("ef2_frac_column_lagging", (FRAC_COL_X, FRAC_COL_Y, FRAC_Z),
           FRAC_R + 0.05, FRAC_H * 0.95, MAT["insulation"], "energy_conversion_transduction", MO)
fl.add_sphere("ef2_frac_column_top_head", (FRAC_COL_X, FRAC_COL_Y, FRAC_TOP), FRAC_R,
              MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_frustum("ef2_frac_column_bottom_head", (FRAC_COL_X, FRAC_COL_Y, FRAC_BOTTOM - 0.22),
               FRAC_R, FRAC_R * 0.4, 0.44, MAT["column_steel"], "energy_conversion_transduction", MO)
# Visible tray support rings up the column face (the trayed-tower cue) — spaced
# the full height of the now-taller column.
for i, z in enumerate([1.0, 1.7, 2.4, 3.1, 3.8, 4.5, 5.2, 5.9, 6.6, 7.1]):
    fl.add_torus(f"ef2_frac_tray_ring_{i}", (FRAC_COL_X, FRAC_COL_Y, FRAC_BOTTOM + z),
                 FRAC_R + 0.03, 0.022, MAT["stainless"], "energy_conversion_transduction", MO)
# Column support skirt to the deck.
fl.add_cyl("ef2_frac_column_skirt", (FRAC_COL_X, FRAC_COL_Y, DECK_Z + 0.30), FRAC_R * 0.95, 0.5,
           MAT["stainless"], "energy_conversion_transduction", MO)
# Overhead condenser + reflux drum up top.
fl.add_cyl("ef2_frac_overhead_condenser", (FRAC_COL_X + 0.8, FRAC_COL_Y, FRAC_TOP - 0.4), 0.26, 1.1,
           MAT["thermal"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ef2_frac_reflux_drum", (FRAC_COL_X + 0.8, FRAC_COL_Y, FRAC_TOP - 1.3), 0.28, 1.0,
           MAT["column_steel"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
# Thermosiphon reboiler at the column base (fed by the FT raised steam).
fl.add_cyl("ef2_frac_reboiler", (FRAC_COL_X + 0.7, FRAC_COL_Y, DECK_Z + 0.7), 0.30, 1.2,
           MAT["thermal"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_sphere("ef2_frac_reboiler_head", (FRAC_COL_X + 1.3, FRAC_COL_Y, DECK_Z + 0.7), 0.30,
              MAT["thermal"], "energy_conversion_transduction", MO)


# ═══════ Module — mass_fluid_transport_process: compressors, separators, ═════
#         pumps, fractionation feed/draw pumps, knock-out drums, process pipes
# (M1 feed compressors/dryer/buffer + M3 separators/recycle compressor/pumps.)

# ── M1 FEED COMPRESSORS — reciprocating CO2 + H2 process-gas compressors ─────
# A reciprocating compressor reads as: a horizontal crankcase/cylinder block on
# a baseframe + a motor + suction/discharge bottles. (The co2 template has none —
# these compressors are a defining feature of a PtL plant.)
def add_recip_compressor(tag, cx, cy, mat):
    bz = DECK_Z + 0.30
    # Baseframe skid.
    fl.add_box(f"{tag}_baseframe", (cx, cy, bz - 0.10), (1.5, 0.7, 0.20),
               MAT["stainless"], "mass_fluid_transport_process", MO)
    # Crankcase + cylinder block (horizontal).
    fl.add_box(f"{tag}_crankcase", (cx - 0.25, cy, bz + 0.30), (0.7, 0.6, 0.55), mat,
               "mass_fluid_transport_process", MO)
    # Two horizontal cylinders (the recip cylinders).
    for k, yo in enumerate((-0.18, 0.18)):
        fl.add_cyl(f"{tag}_cylinder_{k}", (cx + 0.45, cy + yo, bz + 0.30), 0.16, 0.7, mat,
                   "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
    # Suction + discharge pulsation bottles (vertical cylinders on top).
    for k, xo in enumerate((0.30, 0.62)):
        fl.add_cyl(f"{tag}_bottle_{k}", (cx + xo, cy, bz + 0.85), 0.12, 0.55,
                   MAT["compressor_blu"], "mass_fluid_transport_process", MO)
    # Drive MOTOR coupled to the crankcase (tag the rotating drive to actuation).
    fl.add_cyl(f"{tag}_motor", (cx - 0.95, cy, bz + 0.30), 0.26, 0.7, MAT["motor"],
               "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"{tag}_motor_coupling", (cx - 0.6, cy, bz + 0.30), 0.10, 0.18, MAT["maint"],
               "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))

add_recip_compressor("ef3_co2_feed_compressor", CO2_COMP_X, CO2_COMP_Y, MAT["compressor_blu"])
add_recip_compressor("ef3_h2_feed_compressor", H2_COMP_X, H2_COMP_Y, MAT["compressor_blu"])

# CO2 twin-tower regenerative dryer (two tall slim towers + a skid).
for k, xo in enumerate((-0.28, 0.28)):
    fl.add_cyl(f"ef3_co2_dryer_tower_{k}", (CO2_DRYER_X + xo, 1.0, DECK_Z + 1.1), 0.22, 2.0,
               MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
    fl.add_sphere(f"ef3_co2_dryer_head_{k}", (CO2_DRYER_X + xo, 1.0, DECK_Z + 2.1), 0.22,
                  MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_box("ef3_co2_dryer_skid", (CO2_DRYER_X, 1.0, DECK_Z + 0.18), (0.9, 0.8, 0.30),
           MAT["stainless"], "mass_fluid_transport_process", MO)
# Sulphur/oxygen guard beds (lead/lag pair of squat vessels behind the dryer).
for k, xo in enumerate((-0.30, 0.30)):
    fl.add_cyl(f"ef3_guard_bed_{k}", (GUARD_BED_X + xo, 1.65, DECK_Z + 0.75), 0.26, 1.2,
               MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
    fl.add_sphere(f"ef3_guard_bed_top_{k}", (GUARD_BED_X + xo, 1.65, DECK_Z + 1.35), 0.26,
                  MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
# Renewable-H2 buffer receiver (horizontal vessel on saddles).
fl.add_cyl("ef3_h2_buffer_vessel", (H2_BUFFER_X, -0.5, DECK_Z + 0.65), 0.42, 2.2,
           MAT["compressor_blu"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
for xo in (-0.7, 0.7):
    fl.add_sphere(f"ef3_h2_buffer_head_{xo:+.1f}", (H2_BUFFER_X + xo, -0.5, DECK_Z + 0.65), 0.42,
                  MAT["compressor_blu"], "mass_fluid_transport_process", MO)
    fl.add_box(f"ef3_h2_buffer_saddle_{xo:+.1f}", (H2_BUFFER_X + xo * 0.6, -0.5, DECK_Z + 0.25),
               (0.10, 0.7, 0.5), MAT["stainless"], "mass_fluid_transport_process", MO)
# Feed-gas blending static mixer (short fat in-line spool).
fl.add_cyl("ef3_feed_blending_mixer", (2.7, -0.5, DECK_Z + 0.85), 0.18, 0.6, MAT["pipe_feed"],
           "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))

# ── M3 hot + cold horizontal 3-PHASE SEPARATORS ──────────────────────────────
for tag, sx, sy, sz, mat in [
    ("ef3_hot_separator", HOT_SEP_X, HOT_SEP_Y, HOT_SEP_Z, MAT["vessel_cyan"]),
    ("ef3_cold_separator", COLD_SEP_X, COLD_SEP_Y, COLD_SEP_Z, MAT["vessel_cyan"]),
]:
    fl.add_cyl(f"{tag}_shell", (sx, sy, sz), 0.42, 2.0, mat,
               "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
    for xo in (-1.0, 1.0):
        fl.add_sphere(f"{tag}_head_{xo:+.1f}", (sx + xo, sy, sz), 0.42, mat,
                      "mass_fluid_transport_process", MO)
        fl.add_box(f"{tag}_saddle_{xo:+.1f}", (sx + xo * 0.6, sy, DECK_Z + 0.32),
                   (0.12, 0.8, (sz - DECK_Z - 0.32) * 2), MAT["stainless"],
                   "mass_fluid_transport_process", MO)
# Effluent product cooler (shell-and-tube, elevated horizontal).
fl.add_cyl("ef3_product_cooler", (PRODUCT_COOLER_X, PRODUCT_COOLER_Y, PRODUCT_COOLER_Z), 0.30, 1.8,
           MAT["thermal"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_sphere("ef3_product_cooler_head", (PRODUCT_COOLER_X + 0.9, PRODUCT_COOLER_Y, PRODUCT_COOLER_Z),
              0.30, MAT["thermal"], "mass_fluid_transport_process", MO)
# Recycle knock-out drum (vertical) protecting the recycle compressor.
fl.add_cyl("ef3_recycle_ko_drum", (RECYCLE_COMP_X - 0.7, RECYCLE_COMP_Y + 0.2, DECK_Z + 0.85),
           0.26, 1.3, MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_sphere("ef3_recycle_ko_drum_top", (RECYCLE_COMP_X - 0.7, RECYCLE_COMP_Y + 0.2, DECK_Z + 1.5),
              0.26, MAT["vessel_cyan"], "mass_fluid_transport_process", MO)

# ── M3 TAIL-GAS RECYCLE COMPRESSOR — single-stage centrifugal package ────────
# A centrifugal compressor reads as a volute casing + suction/discharge nozzles
# on a baseframe + a motor coupled through a gearbox.
fl.add_box("ef3_recycle_comp_baseframe", (RECYCLE_COMP_X, RECYCLE_COMP_Y, DECK_Z + 0.20),
           (1.4, 0.7, 0.20), MAT["stainless"], "mass_fluid_transport_process", MO)
fl.add_cyl("ef3_recycle_comp_casing", (RECYCLE_COMP_X + 0.25, RECYCLE_COMP_Y, DECK_Z + 0.55), 0.34, 0.55,
           MAT["compressor_blu"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
# Suction nozzle (axial) + discharge nozzle (radial volute scroll).
fl.add_cyl("ef3_recycle_comp_suction", (RECYCLE_COMP_X + 0.25, RECYCLE_COMP_Y - 0.45, DECK_Z + 0.55),
           0.16, 0.35, MAT["pipe_syncrude"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ef3_recycle_comp_discharge", (RECYCLE_COMP_X + 0.25, RECYCLE_COMP_Y, DECK_Z + 0.95),
           0.13, 0.40, MAT["pipe_syncrude"], "mass_fluid_transport_process", MO)
# Drive motor + gearbox (rotating drive -> actuation).
fl.add_cyl("ef3_recycle_comp_motor", (RECYCLE_COMP_X - 0.45, RECYCLE_COMP_Y, DECK_Z + 0.55), 0.24, 0.7,
           MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_box("ef3_recycle_comp_gearbox", (RECYCLE_COMP_X - 0.05, RECYCLE_COMP_Y, DECK_Z + 0.55),
           (0.30, 0.40, 0.40), MAT["maint"], "actuation_kinematics", MO)

# ── Process PUMPS along the -Y walkway (process water, product, reflux, loading)
pump_specs = [
    ("ef3_process_water_pump", 6.5, -1.62, MAT["pump_orange"]),
    ("ef3_product_pump_a", 9.4, -1.62, MAT["pipe_product"]),
    ("ef3_product_pump_b", 10.0, -1.62, MAT["pipe_product"]),
    ("ef3_reflux_pump", 10.6, -1.62, MAT["pump_orange"]),
]
for tag, px, py, mat in pump_specs:
    fl.add_cyl(f"{tag}", (px, py, DECK_Z + 0.22), 0.16, 0.42, mat,
               "mass_fluid_transport_process", MO)
    fl.add_cyl(f"{tag}_motor", (px, py + 0.28, DECK_Z + 0.22), 0.12, 0.34, MAT["motor"],
               "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))

# ── Major process PIPE runs (feed / syncrude / tail-gas recycle / product) ───
# Feed: compressed CO2 + H2 -> blending mixer -> preheater -> FT reactor.
fl.add_pipe("ef3_co2_feed_to_mixer", [
    (CO2_COMP_X + 0.7, CO2_COMP_Y, DECK_Z + 0.7), (CO2_COMP_X + 0.7, -0.5, DECK_Z + 0.7),
    (2.7, -0.5, DECK_Z + 0.85)], 0.055, MAT["pipe_feed"], "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_h2_feed_to_mixer", [
    (H2_COMP_X + 0.7, H2_COMP_Y, DECK_Z + 0.5), (2.7, H2_COMP_Y, DECK_Z + 0.5),
    (2.7, -0.5, DECK_Z + 0.65)], 0.045, MAT["pipe_h2"], "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_feed_to_preheater", [
    (2.9, -0.5, DECK_Z + 0.85), (PREHEATER_X, -0.5, DECK_Z + 0.85),
    (PREHEATER_X, PREHEATER_Y, DECK_Z + 0.4)], 0.06, MAT["pipe_feed"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_preheater_to_reactor", [
    (PREHEATER_X, PREHEATER_Y, DECK_Z + 1.9), (PREHEATER_X, FT_REACTOR_Y, DECK_Z + 1.9),
    (FT_REACTOR_X, FT_REACTOR_Y, FT_TOP + 0.1)], 0.06, MAT["pipe_feed"],
    "mass_fluid_transport_process", MO)
# Reactor effluent -> hot separator -> product cooler -> cold separator.
fl.add_pipe("ef3_reactor_to_hot_sep", [
    (FT_REACTOR_X, FT_REACTOR_Y, FT_BOTTOM - 0.1), (FT_REACTOR_X, HOT_SEP_Y, DECK_Z + 1.4),
    (HOT_SEP_X, HOT_SEP_Y, HOT_SEP_Z + 0.4)], 0.06, MAT["pipe_syncrude"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_hot_sep_to_cooler", [
    (HOT_SEP_X + 0.6, HOT_SEP_Y, HOT_SEP_Z), (PRODUCT_COOLER_X, HOT_SEP_Y, HOT_SEP_Z),
    (PRODUCT_COOLER_X, PRODUCT_COOLER_Y, PRODUCT_COOLER_Z)], 0.05, MAT["pipe_syncrude"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_cooler_to_cold_sep", [
    (PRODUCT_COOLER_X, PRODUCT_COOLER_Y, PRODUCT_COOLER_Z - 0.4),
    (PRODUCT_COOLER_X, COLD_SEP_Y, DECK_Z + 1.3), (COLD_SEP_X, COLD_SEP_Y, COLD_SEP_Z + 0.4)],
    0.05, MAT["pipe_syncrude"], "mass_fluid_transport_process", MO)
# Tail-gas recycle: cold separator -> KO drum -> recycle compressor -> reactor feed.
fl.add_pipe("ef3_tailgas_to_recycle", [
    (COLD_SEP_X, COLD_SEP_Y, COLD_SEP_Z + 0.4), (COLD_SEP_X, RECYCLE_COMP_Y, DECK_Z + 1.6),
    (RECYCLE_COMP_X - 0.7, RECYCLE_COMP_Y + 0.2, DECK_Z + 1.5)], 0.05, MAT["pipe_syncrude"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_recycle_to_feed", [
    (RECYCLE_COMP_X + 0.25, RECYCLE_COMP_Y, DECK_Z + 1.15), (RECYCLE_COMP_X + 0.25, -0.5, DECK_Z + 1.6),
    (2.7, -0.5, DECK_Z + 1.0)], 0.045, MAT["pipe_syncrude"], "mass_fluid_transport_process", MO)
# Syncrude -> upgrading -> fractionation column.
fl.add_pipe("ef3_syncrude_to_upgrading", [
    (COLD_SEP_X, COLD_SEP_Y, DECK_Z + 0.4), (HYDROCRACKER_X, COLD_SEP_Y, DECK_Z + 0.4),
    (HYDROCRACKER_X, HYDROCRACKER_Y, HYDROCRACKER_Z + 1.3)], 0.05, MAT["pipe_syncrude"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_upgrading_to_column", [
    (HYDROCRACKER_X, HYDROCRACKER_Y, DECK_Z + 1.0), (FRAC_COL_X, HYDROCRACKER_Y, DECK_Z + 1.0),
    (FRAC_COL_X, FRAC_COL_Y, FRAC_BOTTOM + 1.5)], 0.05, MAT["pipe_syncrude"],
    "mass_fluid_transport_process", MO)
# Product SAF + naphtha draws -> storage tanks.
fl.add_pipe("ef3_saf_to_tank", [
    (FRAC_COL_X, FRAC_COL_Y, FRAC_BOTTOM + 4.0), (FRAC_COL_X, SAF_TANK_Y, DECK_Z + 2.2),
    (SAF_TANK_X, SAF_TANK_Y, TANK_Z + 0.5)], 0.045, MAT["pipe_product"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("ef3_naphtha_to_tank", [
    (FRAC_COL_X, FRAC_COL_Y, FRAC_TOP - 1.0), (FRAC_COL_X, NAPHTHA_TANK_Y, DECK_Z + 2.6),
    (NAPHTHA_TANK_X, NAPHTHA_TANK_Y, TANK_Z + 0.5)], 0.04, MAT["pipe_product"],
    "mass_fluid_transport_process", MO)


# ═══════ Module — environmental_interface: thermal oxidiser, steam system, ═══
#         cooling water, N2 / instrument air, MV transformer (M5 offsites)

# ── THERMAL OXIDISER / FLARE STACK (tallest object) — purge destruction ──────
# Enclosed ground combustor: a refractory-lined combustion chamber + a tall
# stack with a flared tip; the purge line ties in from the recycle system.
fl.add_cyl("ef5_thermal_oxidiser_chamber", (FLARE_X, FLARE_Y, DECK_Z + 0.9), 0.55, 1.7,
           MAT["furnace_steel"], "environmental_interface", MO)
fl.add_cyl("ef5_thermal_oxidiser_chamber_lagging", (FLARE_X, FLARE_Y, DECK_Z + 0.9), 0.60, 1.6,
           MAT["insulation"], "environmental_interface", MO)
fl.add_cyl("ef5_flare_stack", (FLARE_X, FLARE_Y, (DECK_Z + 1.75 + FLARE_TOP) / 2),
           FLARE_R, FLARE_TOP - (DECK_Z + 1.75), MAT["flare_steel"], "environmental_interface", MO)
# Flared tip (a wider frustum + a torus ring) at the top.
fl.add_frustum("ef5_flare_tip", (FLARE_X, FLARE_Y, FLARE_TOP + 0.18), FLARE_R, FLARE_R + 0.14, 0.36,
               MAT["flare_tip"], "environmental_interface", MO)
fl.add_torus("ef5_flare_tip_ring", (FLARE_X, FLARE_Y, FLARE_TOP + 0.36), FLARE_R + 0.10, 0.04,
             MAT["flare_tip"], "environmental_interface", MO)
# Stack guy-wire stub lugs (read as a guyed/derrick stack).
for ang in (0, 120, 240):
    lx = FLARE_X + 0.5 * math.cos(math.radians(ang))
    ly = FLARE_Y + 0.5 * math.sin(math.radians(ang))
    fl.add_pipe(f"ef5_flare_guy_{ang}", [(FLARE_X, FLARE_Y, FLARE_TOP - 0.4), (lx, ly, DECK_Z + 0.3)],
                0.012, MAT["stainless"], "environmental_interface", MO)

# ── Waste-heat steam generator (boiling-water HX recovering the FT exotherm) ──
fl.add_cyl("ef5_waste_heat_steam_gen", (STEAM_GEN_X, STEAM_GEN_Y, STEAM_GEN_Z), 0.40, 2.0,
           MAT["thermal"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
for xo in (-1.0, 1.0):
    fl.add_sphere(f"ef5_steam_gen_head_{xo:+.1f}", (STEAM_GEN_X + xo, STEAM_GEN_Y, STEAM_GEN_Z), 0.40,
                  MAT["thermal"], "environmental_interface", MO)
    fl.add_box(f"ef5_steam_gen_saddle_{xo:+.1f}", (STEAM_GEN_X + xo * 0.6, STEAM_GEN_Y, DECK_Z + 0.45),
               (0.12, 0.7, (STEAM_GEN_Z - DECK_Z - 0.45) * 2), MAT["stainless"],
               "environmental_interface", MO)

# ── Closed-loop cooling-water skid: a finned dry-cooler bank + circulation pumps
for i in range(6):
    y = COOLING_Y - 0.45 + i * 0.16
    fl.add_box(f"ef5_cooling_finbank_{i}", (COOLING_X, y, DECK_Z + 1.3), (1.0, 0.07, 1.4),
               MAT["heatsink"], "environmental_interface", MO)
fl.add_box("ef5_cooling_skid_frame", (COOLING_X, COOLING_Y, DECK_Z + 0.5), (1.1, 1.2, 0.5),
           MAT["stainless"], "environmental_interface", MO)
for k, fy in enumerate((COOLING_Y - 0.3, COOLING_Y + 0.3)):
    fl.add_cyl(f"ef5_cooling_fan_{k}", (COOLING_X, fy, DECK_Z + 2.1), 0.22, 0.14, MAT["ctrl_black"],
               "environmental_interface", MO)
    fl.add_torus(f"ef5_cooling_fan_guard_{k}", (COOLING_X, fy, DECK_Z + 2.18), 0.22, 0.012,
                 MAT["stainless"], "environmental_interface", MO)
# N2 generation / inerting skid (PSA twin towers + skid).
for k, xo in enumerate((-0.22, 0.22)):
    fl.add_cyl(f"ef5_n2_tower_{k}", (10.9 + xo, -1.65, DECK_Z + 0.95), 0.16, 1.4,
               MAT["vessel_cyan"], "environmental_interface", MO)
fl.add_box("ef5_n2_skid", (10.9, -1.65, DECK_Z + 0.18), (0.7, 0.55, 0.30), MAT["stainless"],
           "environmental_interface", MO)
# Instrument-air package (compressor + receiver + dryer, a compact box + bottle).
fl.add_box("ef5_instrument_air_pkg", (12.5, -1.65, DECK_Z + 0.45), (0.8, 0.55, 0.7),
           MAT["powerdist"], "environmental_interface", MO)
fl.add_cyl("ef5_instrument_air_receiver", (12.5, -1.4, DECK_Z + 0.95), 0.14, 0.9, MAT["vessel_cyan"],
           "environmental_interface", MO)

# ── MV/LV distribution TRANSFORMER (cast-resin, on a plinth) ─────────────────
fl.add_box("ef5_transformer_plinth", (TRANSFORMER_X, TRANSFORMER_Y, DECK_Z + 0.10), (1.2, 1.0, 0.20),
           MAT["stainless"], "environmental_interface", MO)
fl.add_box("ef5_transformer_tank", (TRANSFORMER_X, TRANSFORMER_Y, DECK_Z + 0.85), (1.0, 0.8, 1.3),
           MAT["powerdist"], "environmental_interface", MO)
# Transformer cooling fins down each long side.
for i in range(7):
    yo = -0.34 + i * 0.11
    fl.add_box(f"ef5_transformer_fin_{i}", (TRANSFORMER_X - 0.52, TRANSFORMER_Y + yo, DECK_Z + 0.85),
               (0.08, 0.04, 1.1), MAT["heatsink"], "environmental_interface", MO)
# HV bushings on top (three porcelain stacks).
for k, xo in enumerate((-0.25, 0.0, 0.25)):
    fl.add_cyl(f"ef5_transformer_bushing_{k}", (TRANSFORMER_X + xo, TRANSFORMER_Y, DECK_Z + 1.65), 0.05, 0.35,
               MAT["white_label"], "environmental_interface", MO)
# Purge line tying the recycle purge into the thermal oxidiser.
fl.add_pipe("ef5_purge_to_oxidiser", [
    (RECYCLE_COMP_X + 0.25, RECYCLE_COMP_Y, DECK_Z + 1.2), (RECYCLE_COMP_X + 0.25, FLARE_Y, DECK_Z + 1.0),
    (FLARE_X, FLARE_Y, DECK_Z + 1.4)], 0.035, MAT["pipe_syncrude"], "environmental_interface", MO)


# ═══════ Module — maintenance_serviceability: SAF + naphtha TANKS + loading ══
#         gantry (M6) AND the ladder / drains / lifting eyes / spares

# ── SAF + NAPHTHA API-650 storage TANKS (vertical, dished tops, bunded) ──────
for tag, tx, ty, mat in [
    ("ef6_saf_storage_tank", SAF_TANK_X, SAF_TANK_Y, MAT["saf_tank_green"]),
    ("ef6_naphtha_storage_tank", NAPHTHA_TANK_X, NAPHTHA_TANK_Y, MAT["naphtha_tank"]),
]:
    fl.add_cyl(f"{tag}_shell", (tx, ty, TANK_Z), TANK_R, TANK_H, mat,
               "maintenance_serviceability", MO)
    # Shallow cone roof.
    fl.add_frustum(f"{tag}_roof", (tx, ty, TANK_Z + TANK_H / 2 + 0.18), TANK_R, 0.10, 0.36, mat,
                   "maintenance_serviceability", MO)
    # Wind-girder ring + a winding stair stub (read as an API 650 tank).
    fl.add_torus(f"{tag}_wind_girder", (tx, ty, TANK_Z + TANK_H / 2 - 0.2), TANK_R + 0.03, 0.03,
                 MAT["stainless"], "maintenance_serviceability", MO)
    # Bund wall ring around each tank (low containment kerb).
    fl.add_torus(f"{tag}_bund", (tx, ty, DECK_Z + 0.25), TANK_R + 0.45, 0.06,
                 MAT["warning_red"], "maintenance_serviceability", MO)

# ── Road-tanker LOADING GANTRY with a loading arm + canopy ───────────────────
# Two portal posts + an overhead beam + a swinging loading arm reaching down to
# the tanker fill point + a custody-metering skid at the base.
for k, gy in enumerate((-0.7, 0.7)):
    fl.add_box(f"ef6_gantry_post_{k}", (GANTRY_X, gy, DECK_Z + 1.3), (0.14, 0.14, 2.6),
               MAT["stainless"], "maintenance_serviceability", MO)
fl.add_box("ef6_gantry_beam", (GANTRY_X, 0.0, DECK_Z + 2.55), (0.16, 1.6, 0.16),
           MAT["stainless"], "maintenance_serviceability", MO)
# Loading arm: a horizontal swing pipe + a vertical drop pipe + the loading head.
fl.add_pipe("ef6_loading_arm", [
    (GANTRY_X, 0.0, DECK_Z + 2.4), (GANTRY_X - 0.6, 0.0, DECK_Z + 2.4),
    (GANTRY_X - 0.6, 0.0, DECK_Z + 1.4)], 0.05, MAT["pipe_product"], "maintenance_serviceability", MO)
fl.add_cyl("ef6_loading_head", (GANTRY_X - 0.6, 0.0, DECK_Z + 1.3), 0.09, 0.25, MAT["pump_orange"],
           "maintenance_serviceability", MO)
# Custody-transfer metering skid + a SAF additisation skid at the gantry base.
fl.add_box("ef6_metering_skid", (GANTRY_X, 1.3, DECK_Z + 0.45), (0.6, 0.5, 0.7), MAT["stainless"],
           "maintenance_serviceability", MO)
fl.add_box("ef6_additisation_skid", (GANTRY_X, -1.3, DECK_Z + 0.45), (0.6, 0.5, 0.7), MAT["stainless"],
           "maintenance_serviceability", MO)

# ── CAGED VERTICAL ACCESS LADDER from skid deck UP to the reactor platform ───
# The platform is a SECOND LEVEL (grating top z=2.55) so the access route MUST
# be visible: a caged fixed ladder on the -Y face under the platform left bay,
# stiles continuing ~0.9 m above the landing, a step-through landing + a hooped
# safety cage.
LAD_X = FT_REACTOR_X - 0.9
LAD_Y = -1.96
LAD_W = 0.26
LAD_FOOT = DECK_Z + 0.05
LAD_LAND = PLAT_Z
LAD_TOP = LAD_LAND + 0.90
lad_mid = (LAD_FOOT + LAD_TOP) / 2.0
lad_h = LAD_TOP - LAD_FOOT
for sx in (LAD_X - LAD_W / 2, LAD_X + LAD_W / 2):
    fl.add_cyl(f"ef10_ladder_stile_{sx:.2f}", (sx, LAD_Y, lad_mid), 0.024, lad_h,
               MAT["maint"], "maintenance_serviceability", MO)
n_rungs = int((LAD_LAND - LAD_FOOT) / 0.28) + 1
for i in range(n_rungs):
    z = LAD_FOOT + i * 0.28
    fl.add_cyl(f"ef10_ladder_rung_{i}", (LAD_X, LAD_Y, z), 0.016, LAD_W,
               MAT["maint"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
cage_r = 0.26
cage_cy = LAD_Y - 0.10
cage_hoop_z = [DECK_Z + 1.1, DECK_Z + 1.55, DECK_Z + 2.0, LAD_LAND]
for i, z in enumerate(cage_hoop_z):
    fl.add_torus(f"ef10_ladder_cage_hoop_{i}", (LAD_X, cage_cy, z), cage_r, 0.012,
                 MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
for j, ang in enumerate([-70, -35, 0, 35, 70]):
    sx = LAD_X + cage_r * math.sin(math.radians(ang))
    sy = cage_cy - cage_r * math.cos(math.radians(ang))
    fl.add_cyl(f"ef10_ladder_cage_stringer_{j}", (sx, sy, (DECK_Z + 1.1 + LAD_LAND) / 2), 0.009,
               LAD_LAND - (DECK_Z + 1.1), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ef10_ladder_landing_plate", (LAD_X, -1.6, LAD_LAND + 0.02), (LAD_W + 0.22, 0.5, 0.05),
           MAT["maint"], "maintenance_serviceability", MO)
# Manual drain valves at the base of the major vessels.
for i, (x, y) in enumerate([
    (FT_REACTOR_X, FT_REACTOR_Y), (FRAC_COL_X, FRAC_COL_Y), (HOT_SEP_X, HOT_SEP_Y),
    (COLD_SEP_X, COLD_SEP_Y), (SAF_TANK_X, SAF_TANK_Y), (NAPHTHA_TANK_X, NAPHTHA_TANK_Y),
    (HYDROCRACKER_X, HYDROCRACKER_Y)]):
    fl.add_cyl(f"ef10_drain_valve_{i}", (x, y - 0.3, DECK_Z + 0.22), 0.032, 0.08, MAT["maint"],
               "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Lifting eyes on the tall-vessel heads for crane maintenance.
for i, (x, y, z) in enumerate([(FT_REACTOR_X, FT_REACTOR_Y, FT_TOP + 0.65),
                               (FRAC_COL_X, FRAC_COL_Y, FRAC_TOP + 0.30),
                               (HYDROCRACKER_X, HYDROCRACKER_Y, HYDROCRACKER_Z + 1.65)]):
    fl.add_torus(f"ef10_lifting_eye_{i}", (x, y, z), 0.06, 0.014, MAT["maint"],
                 "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Spare catalyst drum + tool tray on the walkway.
fl.add_cyl("ef10_spare_catalyst_drum", (4.0, -1.62, DECK_Z + 0.35), 0.20, 0.55, MAT["white_label"],
           "maintenance_serviceability", MO)
fl.add_box("ef10_tool_tray", (8.3, -1.62, DECK_Z + 0.35), (0.6, 0.2, 0.06), MAT["maint"],
           "maintenance_serviceability", MO)


# ═══════ Module — power_distribution: MV switchgear, LV board, busbars, trays ═
fl.add_box("ef8_mv_switchgear", (12.0, 1.85, DECK_Z + 0.9), (1.0, 0.5, 1.6),
           MAT["powerdist"], "power_distribution", MO)
fl.add_box("ef8_lv_main_board", (11.0, 1.85, DECK_Z + 0.85), (1.0, 0.45, 1.5),
           MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.55, 0.70, 0.85]):
    fl.add_box(f"ef8_busbar_{i}", (11.5, 1.78, DECK_Z + z), (1.2, 0.025, 0.025),
               MAT["copper"], "power_distribution", MO)
# Cable-tray spine running the length of the skid at high level feeding drives.
fl.add_box("ef8_cable_tray_spine", (W / 2, 1.78, H - 0.6), (W - 1.0, 0.16, 0.10),
           MAT["powerdist"], "power_distribution", MO)
fl.add_box("ef8_cable_tray_drop_comp", (CO2_COMP_X, -0.9, DECK_Z + 1.6), (0.12, 0.10, 2.8),
           MAT["powerdist"], "power_distribution", MO)
# Earth/grounding bar along the front sole-plate.
fl.add_box("ef8_grounding_bar", (W / 2, -1.85, DECK_Z + 0.05), (W - 1.0, 0.03, 0.03),
           MAT["copper"], "power_distribution", MO)
# VSD drive cabinets for the big compressor motors.
for k, cx in enumerate((CO2_COMP_X, H2_COMP_X, RECYCLE_COMP_X)):
    fl.add_box(f"ef8_vsd_cabinet_{k}", (cx, 1.85, DECK_Z + 0.8), (0.5, 0.4, 1.4),
               MAT["powerdist"], "power_distribution", MO)


# ═══════ Module — control_compute_communication: DCS + SIS cabinets, network ═
# Floor-standing control + marshalling cabinets on the front edge (the local
# equipment room). DCS pair + SIS + I/O racks + a comms antenna. The cabinet
# DOORS + screens face OUTWARD (-Y, toward the operator walkway) so the front
# camera sees a legible control-panel bank, not edge-on slabs.
CAB_Y = -1.78
CAB_FRONT = CAB_Y - 0.235               # outer (walkway-facing) door plane
for k, cx in enumerate((4.55, 5.2, 5.85)):
    fl.add_box(f"ef5c_control_cabinet_{k}", (cx, CAB_Y, DECK_Z + 0.95), (0.62, 0.46, 1.7),
               MAT["control"], "control_compute_communication", MO)
    # Door split-line + handle so each reads as a cabinet door.
    fl.add_box(f"ef5c_cabinet_handle_{k}", (cx + 0.24, CAB_FRONT, DECK_Z + 0.95), (0.03, 0.03, 0.5),
               MAT["stainless"], "control_compute_communication", MO)
# DCS + SIS + I/O + fire&gas FACES on the outward doors (clearly visible panels).
fl.add_box("ef5c_dcs_controller", (4.55, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("ef5c_sis_controller", (5.2, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("ef5c_io_rack", (5.85, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("ef5c_fire_gas_panel", (5.85, CAB_FRONT, DECK_Z + 0.55), (0.40, 0.02, 0.32),
           MAT["control"], "control_compute_communication", MO)
# Indicator LED strips below each panel.
for k, cx in enumerate((4.55, 5.2, 5.85)):
    fl.add_box(f"ef5c_led_strip_{k}", (cx, CAB_FRONT, DECK_Z + 0.85), (0.40, 0.02, 0.05),
               MAT["sensor"], "control_compute_communication", MO)
fl.add_box("ef5c_ethernet_switch", (4.55, CAB_FRONT, DECK_Z + 1.72), (0.30, 0.02, 0.14),
           MAT["powerdist"], "control_compute_communication", MO)
fl.add_cyl("ef5c_comms_antenna", (5.85, CAB_Y, DECK_Z + 2.15), 0.014, 0.40,
           MAT["antenna"], "control_compute_communication", MO)


# ═══════ Module — safety_protection: PRVs, gas/flame detection, ESD, relief ══
# Pressure-relief valves on the high-pressure synthesis loop + columns + drums.
for tag, x, y, z in [
    ("ft_reactor", FT_REACTOR_X, FT_REACTOR_Y, FT_TOP + 0.5),
    ("steam_drum", STEAM_DRUM_X, STEAM_DRUM_Y, STEAM_DRUM_Z + 0.5),
    ("hot_sep", HOT_SEP_X, HOT_SEP_Y, HOT_SEP_Z + 0.55),
    ("cold_sep", COLD_SEP_X, COLD_SEP_Y, COLD_SEP_Z + 0.55),
    ("frac_column", FRAC_COL_X, FRAC_COL_Y, FRAC_TOP + 0.45),
    ("hydrocracker", HYDROCRACKER_X, HYDROCRACKER_Y, HYDROCRACKER_Z + 1.5),
    ("recycle_ko", RECYCLE_COMP_X - 0.7, RECYCLE_COMP_Y + 0.2, DECK_Z + 1.7),
]:
    fl.add_cyl(f"ef6s_{tag}_prv", (x, y, z), 0.05, 0.20, MAT["warning_red"],
               "safety_protection", MO)
# H2/CO/flammable-hydrocarbon GAS DETECTORS across the synthesis + separation
# areas (the reduced iron catalyst is pyrophoric + CO is toxic — show detectors
# at head height AND low level for the heavier-than-air CO).
gas_pts = [
    (CO2_COMP_X, -1.85, DECK_Z + 1.4), (FT_REACTOR_X, -1.85, DECK_Z + 1.4),
    (HOT_SEP_X, -1.85, DECK_Z + 1.4), (FRAC_COL_X, -1.85, DECK_Z + 1.4),
    (GANTRY_X, -1.85, DECK_Z + 1.4), (FT_REACTOR_X, FT_REACTOR_Y, FT_TOP + 0.3),
    (CO2_COMP_X, CO2_COMP_Y, DECK_Z + 0.35), (RECYCLE_COMP_X, RECYCLE_COMP_Y, DECK_Z + 0.35),
]
for i, (x, y, z) in enumerate(gas_pts):
    fl.add_box(f"ef6s_gas_detector_{i}", (x, y, z), (0.10, 0.06, 0.07),
               MAT["warning_red"], "safety_protection", MO)
# Optical flame detectors at the reactor, oxidiser + loading areas (angled boxes).
for i, (x, y, z) in enumerate([
    (FT_REACTOR_X + 0.9, FT_REACTOR_Y, FT_TOP), (FLARE_X, FLARE_Y - 0.6, DECK_Z + 2.0),
    (GANTRY_X - 0.8, 0.0, DECK_Z + 2.0)]):
    fl.add_box(f"ef6s_flame_detector_{i}", (x, y, z), (0.12, 0.10, 0.10),
               MAT["warning_red"], "safety_protection", MO)
# Emergency stop on the outward control-cabinet door.
fl.add_cyl("ef6s_estop_mushroom", (4.55, -1.78 - 0.245, DECK_Z + 1.6), 0.055, 0.04, MAT["safety"],
           "safety_protection", MO, rotation=(math.radians(90), 0, 0))
# Rupture disc on the FT reactor + a bund wall along the tank-farm front.
fl.add_cyl("ef6s_reactor_rupture_disc", (FT_REACTOR_X + FT_R, FT_REACTOR_Y, FT_Z + 0.4),
           0.07, 0.12, MAT["warning_red"], "safety_protection", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — sensing_instrumentation: level/pressure/temp/flow/analysers ═
# Column + reactor dP + temperature.
for tag, x, y, ztop in [("frac", FRAC_COL_X, FRAC_COL_Y, FRAC_TOP), ("ft", FT_REACTOR_X, FT_REACTOR_Y, FT_TOP)]:
    fl.add_box(f"ef4_{tag}_dp_transmitter", (x - 0.6, y, ztop - 1.0), (0.10, 0.07, 0.14),
               MAT["sensor"], "sensing_instrumentation", MO)
    fl.add_cyl(f"ef4_{tag}_temp_probe", (x, y - 0.6, ztop - 2.0), 0.014, 0.22,
               MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"ef4_{tag}_pressure_gauge", (x - 0.55, y, ztop - 2.6), 0.06, 0.03,
               MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
# Multipoint reactor thermowell assembly (the FT exotherm hot-spot tracker).
fl.add_cyl("ef4_reactor_thermowell", (FT_REACTOR_X - 0.3, FT_REACTOR_Y, FT_Z), 0.03, FT_H * 0.9,
           MAT["sensor"], "sensing_instrumentation", MO)
# Separator level transmitters.
for tag, sx, sy, sz in [("hot_sep", HOT_SEP_X, HOT_SEP_Y, HOT_SEP_Z), ("cold_sep", COLD_SEP_X, COLD_SEP_Y, COLD_SEP_Z)]:
    fl.add_box(f"ef4_{tag}_level_tx", (sx + 0.55, sy, sz + 0.2), (0.07, 0.06, 0.14),
               MAT["sensor"], "sensing_instrumentation", MO)
# Tank level radars.
for tag, tx, ty in [("saf", SAF_TANK_X, SAF_TANK_Y), ("naphtha", NAPHTHA_TANK_X, NAPHTHA_TANK_Y)]:
    fl.add_cyl(f"ef4_{tag}_tank_radar", (tx, ty, TANK_Z + TANK_H / 2 + 0.55), 0.06, 0.16,
               MAT["sensor"], "sensing_instrumentation", MO)
# Coriolis flow meters on the feed, syncrude + product lines + a product analyser.
for i, (x, y, z) in enumerate([(2.9, -0.5, DECK_Z + 0.85), (COLD_SEP_X - 0.5, COLD_SEP_Y, DECK_Z + 0.4),
                               (FRAC_COL_X - 0.5, SAF_TANK_Y, DECK_Z + 2.2)]):
    fl.add_box(f"ef4_flow_meter_{i}", (x, y, z), (0.12, 0.09, 0.14),
               MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("ef4_product_analyser", (FRAC_COL_X - 0.7, FRAC_COL_Y, FRAC_TOP - 1.5), (0.12, 0.08, 0.18),
           MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — actuation_kinematics: control valves (compressor/pump drives ═
#         are tagged here at the equipment above)
# Pneumatic control valves on the key process lines.
valve_specs = [
    ("feed_ratio_valve", 2.9, -0.5, DECK_Z + 0.85, MAT["pipe_feed"]),
    ("preheater_inlet_valve", PREHEATER_X, -0.5, DECK_Z + 0.85, MAT["pipe_feed"]),
    ("reactor_inlet_valve", FT_REACTOR_X, FT_REACTOR_Y, FT_TOP + 0.1, MAT["pipe_feed"]),
    ("purge_control_valve", RECYCLE_COMP_X + 0.25, RECYCLE_COMP_Y, DECK_Z + 1.2, MAT["pipe_syncrude"]),
    ("syncrude_valve", COLD_SEP_X, COLD_SEP_Y, DECK_Z + 0.4, MAT["pipe_syncrude"]),
    ("saf_draw_valve", FRAC_COL_X, SAF_TANK_Y, DECK_Z + 2.2, MAT["pipe_product"]),
    ("loading_valve", GANTRY_X - 0.6, 0.0, DECK_Z + 1.5, MAT["pipe_product"]),
]
for tag, x, y, z, mat in valve_specs:
    fl.add_box(f"ef9_{tag}_body", (x, y, z), (0.12, 0.12, 0.10), MAT["valve_green"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"ef9_{tag}_actuator", (x, y, z + 0.12), 0.07, 0.12, MAT["ctrl_black"],
               "actuation_kinematics", MO)
# Fail-safe ESD valves (larger, on the isolation points) — actuated.
for i, (x, y, z) in enumerate([
    (FT_REACTOR_X, FT_REACTOR_Y, FT_BOTTOM - 0.3), (CO2_COMP_X + 0.7, CO2_COMP_Y, DECK_Z + 0.7),
    (H2_COMP_X + 0.7, H2_COMP_Y, DECK_Z + 0.5), (GANTRY_X - 0.6, 0.0, DECK_Z + 1.0)]):
    fl.add_box(f"ef9_esd_valve_{i}", (x, y, z), (0.16, 0.16, 0.14), MAT["safety"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"ef9_esd_actuator_{i}", (x, y, z + 0.15), 0.10, 0.16, MAT["ctrl_black"],
               "actuation_kinematics", MO)


# ═══════ Module — hmi_ergonomics: local HMI panel, buttons, status beacon ════
# Mounted on the OUTWARD (walkway-facing, -Y) cabinet door alongside the DCS/SIS.
HMI_FRONT = -1.78 - 0.245
fl.add_box("ef3h_hmi_bezel", (5.2, HMI_FRONT, DECK_Z + 1.85), (0.38, 0.03, 0.30),
           MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("ef3h_hmi_screen", (5.2, HMI_FRONT - 0.01, DECK_Z + 1.85), (0.32, 0.006, 0.23),
           MAT["hmi"], "hmi_ergonomics", MO)
for i, (xo, mat) in enumerate([(-0.12, MAT["sensor"]), (0.0, MAT["control"]), (0.12, MAT["safety"])]):
    fl.add_cyl(f"ef3h_operator_button_{i}", (5.2 + xo, HMI_FRONT, DECK_Z + 1.58), 0.024, 0.016, mat,
               "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for i, mat in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"ef3h_status_beacon_{i}", (5.85, -1.78, DECK_Z + 2.4 + i * 0.07), 0.045, 0.06, mat,
               "hmi_ergonomics", MO)
fl.add_box("ef3h_instruction_placard", (4.55, HMI_FRONT, DECK_Z + 0.45), (0.24, 0.006, 0.14),
           MAT["white_label"], "hmi_ergonomics", MO)


fl.add_lights(target_centre=(W / 2, 0, H / 2), fill_energy=320, fill_size=22)
fl.make_world_white()
# hero_open_frame=True: this is a FIELD-ERECTED open structural-steel SKID
# (columns + reactor + tanks on a braced steel frame), NOT an enclosed/glass
# container — paint the frame SOLID steel in the hero so it reads as braced
# open steelwork on a skid deck, not a translucent shipping box.
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment",
                       hero_open_frame=True)
