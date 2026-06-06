"""dac-9shot.py — ~100 t CO2/day solid-sorbent DIRECT AIR CAPTURE plant.

Climeworks-class direct-air-capture train: large louvred AIR CONTACTOR fan
banks pull ambient air across amine-on-silica structured-sorbent beds; a
heated REGENERATION / CALCINER vessel drives off concentrated CO2 (temperature-
vacuum swing); the released CO2 is dried, compressed through a multi-stage
train and parked in a dense-phase CO2 BUFFER / STORAGE vessel. Steam/heat
supply, water handling, an MV transformer, a DCS/SIS control bank and full
gas-detection / relief complete the plant.

The SIGNATURE DAC kit is the fan / contactor array — a big bank of louvred,
fan-backed sorbent cells — so it is the prominent foreground object in the
hero, mirroring how the FT reactor dominates the e-fuel hero.

Field-erected OPEN structural-steel SKID (NOT an enclosed container) — the same
idiom as e-fuel-synthesis-9shot.py + co2-mineralisation-9shot.py: braced open
frame + skid deck + service walkway + an elevated access platform around the
regeneration vessel + a caged ladder. hero_open_frame=True paints the frame
SOLID galvanised steel in the hero pass.

Process units modelled (left -> right along +X, by process flow):
  M1 AIR CONTACTOR — a 3 x 3 bank of louvred sorbent cells, each a structured-
     packing bed behind a louvre face with an axial extraction FAN + guard ring
     (the recognisable DAC signature) on an elevated contactor gantry
  M2 regeneration — the heated REGENERATION / CALCINER vessel (insulation-lagged,
     temperature-vacuum-swing) that releases concentrated CO2, with a steam jacket
  M3 CO2 conditioning — CO2 twin-tower DRYER, a two-stage CO2 COMPRESSION train
     (reciprocating + centrifugal), inter/after coolers, a knock-out drum
  M4 CO2 storage — a dense-phase CO2 BUFFER / STORAGE bullet on saddles
  M5 utilities — steam/heat supply package, closed-loop water-handling dry-cooler
     skid, process-water tank, an MV/LV cast-resin TRANSFORMER
  M6 control & safety — DCS + SIS control cabinets, CO2 / O2-depletion GAS
     DETECTORS at low + head level, PRVs, ESD valves (asphyxiation + cryogenic
     dense-phase CO2 hazard)

Geometry is tagged into the 11 canonical module ids so the hero reads complete
and every per-module page is rich.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P dac-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-dac-9shot")))

# Envelope. A 100 t/day solid-sorbent DAC plant is a long field-erected skid
# dominated by a tall, wide AIR CONTACTOR fan bank (~4 m tall) with the
# regeneration vessel + CO2 conditioning + storage running off to the right.
W = 13.0    # skid length (+X)
D = 4.0     # skid depth (Y)
H = 6.0     # frame height

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
MAT["contactor_steel"] = fl.make_mat("m_contactor_steel", (0.62, 0.66, 0.72), metallic=0.55, roughness=0.36)
MAT["louvre_blue"]     = fl.make_mat("m_louvre_blue",     (0.10, 0.52, 0.92), metallic=0.30, roughness=0.38)
MAT["sorbent_teal"]    = fl.make_mat("m_sorbent_teal",    (0.00, 0.66, 0.62), metallic=0.10, roughness=0.50)
MAT["fan_hub"]         = fl.make_mat("m_fan_hub",         (0.10, 0.12, 0.18), metallic=0.40, roughness=0.40)
MAT["regen_orange"]    = fl.make_mat("m_regen_orange",    (1.00, 0.45, 0.00), metallic=0.20, roughness=0.42)
MAT["vessel_cyan"]     = fl.make_mat("m_vessel_cyan",     (0.00, 0.72, 0.92), metallic=0.20, roughness=0.35)
MAT["compressor_blu"]  = fl.make_mat("m_compressor_blu",  (0.10, 0.45, 0.95), metallic=0.45, roughness=0.32)
MAT["co2_tank_grey"]   = fl.make_mat("m_co2_tank_grey",   (0.78, 0.80, 0.84), metallic=0.35, roughness=0.34)
MAT["water_tank_blue"] = fl.make_mat("m_water_tank_blue", (0.20, 0.45, 0.85), metallic=0.10, roughness=0.44)
MAT["pump_orange"]     = fl.make_mat("m_pump_orange",     (1.00, 0.40, 0.00), metallic=0.10, roughness=0.42)
MAT["pipe_air"]        = fl.make_mat("m_pipe_air",        (0.55, 0.75, 0.90), metallic=0.30, roughness=0.35)
MAT["pipe_co2"]        = fl.make_mat("m_pipe_co2",        (0.20, 0.85, 0.95), metallic=0.35, roughness=0.25)
MAT["pipe_steam"]      = fl.make_mat("m_pipe_steam",      (0.90, 0.55, 0.55), metallic=0.30, roughness=0.40)
MAT["pipe_water"]      = fl.make_mat("m_pipe_water",      (0.10, 0.40, 0.85), metallic=0.30, roughness=0.30)
MAT["valve_green"]     = fl.make_mat("m_valve_green",     (0.00, 0.95, 0.12), metallic=0.10, roughness=0.42)
MAT["warning_red"]     = fl.make_mat("m_warning_red",     (1.00, 0.00, 0.00), metallic=0.00, roughness=0.45)
MAT["walkway"]         = fl.make_mat("m_walkway",         (0.20, 0.24, 0.30), metallic=0.55, roughness=0.40)
MAT["insulation"]      = fl.make_mat("m_insulation",      (0.86, 0.84, 0.74), metallic=0.00, roughness=0.62)
MAT["white_label"]     = fl.make_mat("m_white_label",     (0.96, 0.96, 0.92), metallic=0.00, roughness=0.60)

# ── Plant layout anchors (skid runs along +X) ─────────────────────────────
# The AIR CONTACTOR fan-bank occupies the left third (the hero); regeneration
# vessel centre; CO2 conditioning (dryer + compressors) centre-right; CO2
# storage + utilities right. Y: back row +Y, front row -Y, walkway at -Y edge.
DECK_Z = 0.30                       # skid-deck datum (equipment bottoms sit here)

# M1 air contactor (x 0.5 .. 4.5) — a 3 (X) x 3 (Z) WALL of big front-facing
# fan cells (the unmistakable Climeworks-style DAC signature). The big axial
# fan on each cell faces the -Y front (toward the operator walkway + the hero
# camera) so the bank reads as a wall of fans, not a striped cabinet.
CONTACTOR_X0 = 1.1                  # centre of the left-most cell column
CONTACTOR_DX = 1.45                 # spacing between cell columns (X)
CELL_W = 1.34                       # cell face width (X)
CELL_D = 1.05                       # cell depth (Y) — sorbent bed depth
CELL_H = 1.34                       # cell face height (Z)
CONTACTOR_Y = 0.75                  # contactor sits toward the back row
CONTACTOR_Z0 = DECK_Z + 1.05        # bottom row of cells starts above a plenum
CONTACTOR_DZ = 1.44                 # vertical spacing between cell rows (Z)
FAN_R = 0.60                        # big fan radius (fills most of the cell face)
N_CELL_X = 3
N_CELL_Z = 3

# M2 regeneration / calciner vessel (the heated CO2-release core). Sized so it
# reads as a substantial heated vessel WITHOUT occluding the signature fan wall
# in the energy_conversion module shot (the two share that module).
REGEN_X, REGEN_Y = 5.9, 0.0
REGEN_R = 0.62
REGEN_BOTTOM = DECK_Z + 0.85
REGEN_TOP = REGEN_BOTTOM + 2.4
REGEN_Z = (REGEN_BOTTOM + REGEN_TOP) / 2.0
REGEN_H = REGEN_TOP - REGEN_BOTTOM

# M3 CO2 conditioning (x 7.0 .. 9.6)
CO2_DRYER_X, CO2_DRYER_Y = 7.2, 1.15
CO2_COMP1_X, CO2_COMP1_Y = 7.6, -1.30   # 1st-stage reciprocating compressor
CO2_COMP2_X, CO2_COMP2_Y = 9.0, -1.30   # 2nd-stage centrifugal compressor
INTERCOOLER_X, INTERCOOLER_Y, INTERCOOLER_Z = 8.3, 1.10, DECK_Z + 1.7
KO_DRUM_X, KO_DRUM_Y = 8.3, -0.40

# M4 CO2 storage (x 10.0 .. 11.2) — a dense-phase CO2 bullet on saddles
CO2_BULLET_X, CO2_BULLET_Y, CO2_BULLET_Z = 10.6, 1.05, DECK_Z + 0.95

# M5 utilities (x 10.0 .. 12.4)
STEAM_PKG_X, STEAM_PKG_Y, STEAM_PKG_Z = 10.4, -1.10, DECK_Z + 1.0
COOLING_X, COOLING_Y = 11.6, -1.10
WATER_TANK_X, WATER_TANK_Y, WATER_TANK_Z = 12.2, 1.05, DECK_Z + 0.85
TRANSFORMER_X, TRANSFORMER_Y = 12.0, 1.85


# ═══════ Module — structure_containment: OPEN SKID FRAME, deck, walkway, ladder
# This plant is a FIELD-ERECTED open structural-steel SKID — corner/intermediate
# posts + perimeter rails + diagonal cross-bracing on a structural deck, NOT an
# enclosed/glass container. hero_open_frame=True paints these members SOLID
# galvanised steel in the hero so the frame reads as braced steelwork.

# ── Skid BASE: structural sole-plate channels + longitudinal bearers ─────────
for name, loc, size in [
    ("dac1_base_front_channel", (W / 2, -1.92, 0.10), (W, 0.18, 0.20)),
    ("dac1_base_rear_channel", (W / 2, 1.92, 0.10), (W, 0.18, 0.20)),
    ("dac1_base_left_channel", (0.09, 0.0, 0.10), (0.18, D, 0.20)),
    ("dac1_base_right_channel", (W - 0.09, 0.0, 0.10), (0.18, D, 0.20)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)
# Three longitudinal I-beam bearers (the spine the equipment bolts down to).
for by in (-1.05, 0.0, 1.05):
    fl.add_box(f"dac1_base_bearer_{by:+.2f}", (W / 2, by, 0.13), (W - 0.3, 0.15, 0.18),
               MAT["stainless"], "structure_containment", MO)
# Transverse deck cross-members tie the bearers (skid deck grid).
for i, x in enumerate([0.8, 2.2, 3.6, 5.0, 6.4, 7.8, 9.2, 10.6, 12.0]):
    fl.add_box(f"dac1_base_crossmember_{i}", (x, 0.0, 0.13), (0.12, 3.7, 0.16),
               MAT["stainless"], "structure_containment", MO)
# Skid deck plate (the clear datum the plant sits on).
fl.add_box("dac1_skid_deck", (W / 2, 0.0, 0.225), (W - 0.3, 3.7, 0.05),
           MAT["walkway"], "structure_containment", MO)
# Fork/crane lift lugs at the base corners.
for i, (lx, ly) in enumerate([(0.25, -1.92), (0.25, 1.92), (W - 0.25, -1.92), (W - 0.25, 1.92)]):
    fl.add_box(f"dac1_skid_lift_lug_{i}", (lx, ly, 0.28), (0.20, 0.12, 0.12),
               MAT["stainless"], "structure_containment", MO)

# ── Open frame: corner + intermediate posts (140 mm box section) ─────────────
for i, x in enumerate([0.12, 3.6, 5.6, 8.3, 10.6, W - 0.12]):
    for y in (-1.92, 1.92):
        fl.add_box(f"dac1_post_{i}_{y:+.2f}", (x, y, H / 2), (0.14, 0.14, H),
                   MAT["stainless"], "structure_containment", MO)
# Top perimeter frame.
for name, loc, size in [
    ("dac1_top_front_channel", (W / 2, -1.92, H - 0.07), (W, 0.13, 0.13)),
    ("dac1_top_rear_channel", (W / 2, 1.92, H - 0.07), (W, 0.13, 0.13)),
    ("dac1_top_left_channel", (0.07, 0.0, H - 0.07), (0.13, D, 0.13)),
    ("dac1_top_right_channel", (W - 0.07, 0.0, H - 0.07), (0.13, D, 0.13)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)
# Two mid-height perimeter tie rings (brace the tall contactor + vessels).
for z in (2.2, 4.2):
    fl.add_box(f"dac1_mid_tie_front_{z:.1f}", (W / 2, -1.92, z), (W, 0.09, 0.09),
               MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"dac1_mid_tie_rear_{z:.1f}", (W / 2, 1.92, z), (W, 0.09, 0.09),
               MAT["stainless"], "structure_containment", MO)

# ── Diagonal CROSS-BRACING — the unambiguous "open structural frame" signal ──
# V-braces in the two end bays (front + rear faces) drawn between EXACT frame
# node points so the members snap to the corners (the rotation-maths version
# overshoots). A braced open frame reads instantly as structural steelwork.
BRACE_R = 0.045
Z_BOT = 0.22
Z_TOP = H - 0.14
for bx0, bx1, tag in [(0.14, 3.6, "L"), (W - 3.0, W - 0.14, "R")]:
    bxm = (bx0 + bx1) / 2
    for face_y in (-1.92, 1.92):
        fl.add_pipe(f"dac1_brace_{tag}_a_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx0, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
        fl.add_pipe(f"dac1_brace_{tag}_b_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx1, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
# Sway diagonal across each open end face (bottom-front -> top-rear corner).
for ex in (0.14, W - 0.14):
    fl.add_pipe(f"dac1_brace_end_{ex:.2f}",
                [(ex, -1.92, Z_BOT), (ex, 1.92, Z_TOP)], BRACE_R,
                MAT["stainless"], "structure_containment", MO)

# ── Service walkway on -Y side at deck height (open grating) ─────────────────
fl.add_box("dac1_service_walkway_plate", (W / 2, -1.70, DECK_Z + 0.04), (W - 0.6, 0.50, 0.05),
           MAT["walkway"], "structure_containment", MO)
for i in range(34):
    x = 0.45 + i * 0.37
    fl.add_box(f"dac1_walkway_grating_{i}", (x, -1.70, DECK_Z + 0.07), (0.05, 0.48, 0.012),
               MAT["stainless"], "structure_containment", MO)

# ── Elevated operator ACCESS PLATFORM around the regeneration vessel ─────────
# Open grated platform with toe-board + 2-rail handrail so operators reach the
# regenerator's upper manway; the caged ladder lands on its front-left corner.
PLAT_Z = 2.35
fl.add_box("dac1_regen_platform", (REGEN_X, 0.0, PLAT_Z), (2.0, 3.0, 0.06),
           MAT["walkway"], "structure_containment", MO)
for i in range(13):
    gx = (REGEN_X - 0.92) + i * 0.155
    fl.add_box(f"dac1_platform_grating_{i}", (gx, 0.0, PLAT_Z + 0.035), (0.05, 2.94, 0.012),
               MAT["stainless"], "structure_containment", MO)
for i, (px, py) in enumerate([(REGEN_X - 0.9, -1.4), (REGEN_X + 0.9, -1.4),
                              (REGEN_X - 0.9, 1.4), (REGEN_X + 0.9, 1.4)]):
    fl.add_box(f"dac1_platform_support_{i}", (px, py, DECK_Z + (PLAT_Z - DECK_Z) / 2),
               (0.09, 0.09, PLAT_Z - DECK_Z), MAT["stainless"], "structure_containment", MO)
# Toe-board kick-plate around the platform edge.
for name, loc, size in [
    ("dac1_platform_toe_front", (REGEN_X, -1.48, PLAT_Z + 0.12), (2.0, 0.03, 0.14)),
    ("dac1_platform_toe_rear", (REGEN_X, 1.48, PLAT_Z + 0.12), (2.0, 0.03, 0.14)),
    ("dac1_platform_toe_right", (REGEN_X + 0.98, 0.0, PLAT_Z + 0.12), (0.03, 3.0, 0.14)),
]:
    fl.add_box(name, loc, size, MAT["walkway"], "structure_containment", MO)
# Handrail posts + runs around the platform (back-left open to the ladder).
rail_posts = [(REGEN_X - 0.9, -1.4), (REGEN_X + 0.9, -1.4),
              (REGEN_X - 0.9, 1.4), (REGEN_X + 0.9, 1.4),
              (REGEN_X, -1.4), (REGEN_X, 1.4),
              (REGEN_X - 0.9, 0.0), (REGEN_X + 0.9, 0.0)]
for i, (x, y) in enumerate(rail_posts):
    fl.add_cyl(f"dac1_platform_rail_post_{i}", (x, y, PLAT_Z + 0.55), 0.022, 1.06,
               MAT["stainless"], "structure_containment", MO)
for name, loc, size in [
    ("dac1_platform_rail_top_front", (REGEN_X, -1.4, PLAT_Z + 1.05), (1.8, 0.028, 0.028)),
    ("dac1_platform_rail_mid_front", (REGEN_X, -1.4, PLAT_Z + 0.55), (1.8, 0.025, 0.025)),
    ("dac1_platform_rail_top_rear", (REGEN_X, 1.4, PLAT_Z + 1.05), (1.8, 0.028, 0.028)),
    ("dac1_platform_rail_top_right", (REGEN_X + 0.9, 0.0, PLAT_Z + 1.05), (0.028, 2.8, 0.028)),
    ("dac1_platform_rail_mid_right", (REGEN_X + 0.9, 0.0, PLAT_Z + 0.55), (0.025, 2.8, 0.025)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction: AIR CONTACTOR fan-bank + ═══
#         regeneration / calciner vessel (the chemical capture + release core)
# This is the CONVERSION core of a DAC plant: ambient CO2 is captured on the
# sorbent in the contactor (mass + energy transfer across the bed) and released
# as a concentrated stream when the regenerator drives the temperature-vacuum
# swing. The fan-bank is the unmistakable DAC signature, so it is the prominent
# foreground object (mirrors the FT reactor's role in the e-fuel hero).

# ── THE HERO PIECE: AIR CONTACTOR fan-WALL (3 x 3 cells) ─────────────────────
# Each cell = a structured-sorbent bed box (sorbent-teal) behind a BIG axial
# intake FAN (shroud + hub + radiating blades + guard ring) on the -Y front
# face, plus a louvred exhaust on the +Y back face. The fan faces the operator
# walkway + the hero camera, so the bank reads as a WALL OF FANS — the
# unmistakable Climeworks-style DAC signature. A common structural collector
# plenum carries the whole bank.
# Contactor collector plenum behind the bank (the +Y duct the air exhausts into).
fl.add_box("dac2_contactor_plenum", (CONTACTOR_X0 + CONTACTOR_DX, CONTACTOR_Y + CELL_D / 2 + 0.30,
           CONTACTOR_Z0 + CONTACTOR_DZ),
           (N_CELL_X * CONTACTOR_DX + 0.1, 0.35, N_CELL_Z * CONTACTOR_DZ + 0.1),
           MAT["contactor_steel"], "energy_conversion_transduction", MO)
# Contactor support gantry legs lifting the bank off the deck (the bottom row
# sits at z≈1.05, so a 4-post gantry holds it up).
for i, (gx, gy) in enumerate([
    (CONTACTOR_X0 - 0.45, CONTACTOR_Y - 0.4), (CONTACTOR_X0 - 0.45, CONTACTOR_Y + 0.4),
    (CONTACTOR_X0 + 2 * CONTACTOR_DX + 0.45, CONTACTOR_Y - 0.4),
    (CONTACTOR_X0 + 2 * CONTACTOR_DX + 0.45, CONTACTOR_Y + 0.4)]):
    fl.add_box(f"dac2_contactor_gantry_leg_{i}", (gx, gy, DECK_Z + (CONTACTOR_Z0 - DECK_Z) / 2),
               (0.12, 0.12, CONTACTOR_Z0 - DECK_Z), MAT["stainless"],
               "energy_conversion_transduction", MO)
for ix in range(N_CELL_X):
    cx = CONTACTOR_X0 + ix * CONTACTOR_DX
    for iz in range(N_CELL_Z):
        cz = CONTACTOR_Z0 + iz * CONTACTOR_DZ
        tag = f"{ix}_{iz}"
        # Sorbent bed box (the structured-packing module — the cell body).
        fl.add_box(f"dac2_sorbent_cell_{tag}", (cx, CONTACTOR_Y, cz),
                   (CELL_W, CELL_D, CELL_H), MAT["sorbent_teal"],
                   "energy_conversion_transduction", MO)
        # Cell frame surround (reads as a discrete bolted module).
        fl.add_box(f"dac2_cell_frame_{tag}", (cx, CONTACTOR_Y, cz),
                   (CELL_W + 0.06, CELL_D + 0.02, CELL_H + 0.06), MAT["contactor_steel"],
                   "energy_conversion_transduction", MO)
        # BIG axial intake FAN on the -Y (front, camera-facing) face: a deep
        # shroud ring + a louvre-blue venturi mouth + a central hub + SIX
        # radiating blades + a guard ring. Sized to fill most of the cell face.
        fan_y = CONTACTOR_Y - CELL_D / 2 - 0.02
        fl.add_cyl(f"dac2_fan_shroud_{tag}", (cx, fan_y, cz),
                   FAN_R, 0.26, MAT["contactor_steel"], "energy_conversion_transduction", MO,
                   rotation=(math.radians(90), 0, 0))
        fl.add_torus(f"dac2_fan_mouth_{tag}", (cx, fan_y - 0.10, cz),
                     FAN_R - 0.05, 0.05, MAT["louvre_blue"], "energy_conversion_transduction", MO,
                     rotation=(math.radians(90), 0, 0))
        fl.add_cyl(f"dac2_fan_hub_{tag}", (cx, fan_y - 0.12, cz),
                   0.16, 0.18, MAT["fan_hub"], "energy_conversion_transduction", MO,
                   rotation=(math.radians(90), 0, 0))
        # Six radiating blades in the fan plane (the -Y face → blades span X-Z).
        for b in range(6):
            ang = b * math.pi / 3
            bx = cx + (FAN_R * 0.55) * math.cos(ang)
            bz = cz + (FAN_R * 0.55) * math.sin(ang)
            fl.add_box(f"dac2_fan_blade_{tag}_{b}", (bx, fan_y - 0.12, bz),
                       (FAN_R * 0.78, 0.04, 0.16), MAT["fan_hub"],
                       "energy_conversion_transduction", MO,
                       rotation=(0, math.radians(28), math.degrees(ang)))
        # Fan guard ring (torus) standing proud on the intake face.
        fl.add_torus(f"dac2_fan_guard_{tag}", (cx, fan_y - 0.16, cz),
                     FAN_R - 0.02, 0.022, MAT["stainless"], "energy_conversion_transduction", MO,
                     rotation=(math.radians(90), 0, 0))
        # Louvred exhaust on the +Y (back, outlet) face: 5 horizontal slats.
        for s in range(5):
            sz = cz - CELL_H / 2 + 0.15 + s * (CELL_H - 0.30) / 4
            fl.add_box(f"dac2_louvre_{tag}_{s}", (cx, CONTACTOR_Y + CELL_D / 2 + 0.03, sz),
                       (CELL_W - 0.10, 0.04, 0.12), MAT["louvre_blue"],
                       "energy_conversion_transduction", MO,
                       rotation=(math.radians(20), 0, 0))

# ── REGENERATION / CALCINER vessel (heated CO2-release core) ─────────────────
# A tall insulation-lagged vessel under temperature-vacuum swing: shell +
# lagging + top/bottom domes + a steam jacket + a visible heater band; this is
# where the captured CO2 is driven off concentrated.
fl.add_cyl("dac2_regen_vessel_shell", (REGEN_X, REGEN_Y, REGEN_Z),
           REGEN_R, REGEN_H, MAT["regen_orange"], "energy_conversion_transduction", MO)
fl.add_cyl("dac2_regen_vessel_lagging", (REGEN_X, REGEN_Y, REGEN_Z),
           REGEN_R + 0.07, REGEN_H * 0.90, MAT["insulation"], "energy_conversion_transduction", MO)
fl.add_sphere("dac2_regen_top_dome", (REGEN_X, REGEN_Y, REGEN_TOP), REGEN_R,
              MAT["regen_orange"], "energy_conversion_transduction", MO)
fl.add_sphere("dac2_regen_bottom_dome", (REGEN_X, REGEN_Y, REGEN_BOTTOM), REGEN_R,
              MAT["regen_orange"], "energy_conversion_transduction", MO)
# Steam jacket inlet/outlet collar bands (read as a heated jacket).
for z in (REGEN_BOTTOM + 0.5, REGEN_TOP - 0.5):
    fl.add_cyl(f"dac2_regen_jacket_band_{z:.2f}", (REGEN_X, REGEN_Y, z), REGEN_R + 0.10, 0.16,
               MAT["pipe_steam"], "energy_conversion_transduction", MO)
# Regenerator support skirt down to the deck.
fl.add_cyl("dac2_regen_skirt", (REGEN_X, REGEN_Y, DECK_Z + 0.45), REGEN_R * 0.92, 0.85,
           MAT["stainless"], "energy_conversion_transduction", MO)
# Electric trim / start-up heater band beside the regenerator.
fl.add_cyl("dac2_regen_trim_heater", (REGEN_X - 1.0, REGEN_Y + 0.9, DECK_Z + 0.9), 0.22, 1.2,
           MAT["thermal"], "energy_conversion_transduction", MO)


# ═══════ Module — mass_fluid_transport_process: CO2 dryer, compression train, ═
#         knock-out drum, pumps, process pipework (M3 conditioning + transport)

# ── CO2 twin-tower regenerative DRYER (two tall slim towers + a skid) ────────
for k, xo in enumerate((-0.28, 0.28)):
    fl.add_cyl(f"dac3_co2_dryer_tower_{k}", (CO2_DRYER_X + xo, CO2_DRYER_Y, DECK_Z + 1.1), 0.24, 2.0,
               MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
    fl.add_sphere(f"dac3_co2_dryer_head_{k}", (CO2_DRYER_X + xo, CO2_DRYER_Y, DECK_Z + 2.1), 0.24,
                  MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_box("dac3_co2_dryer_skid", (CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 0.18), (0.95, 0.85, 0.30),
           MAT["stainless"], "mass_fluid_transport_process", MO)

# ── CO2 COMPRESSION TRAIN — 1st-stage reciprocating + 2nd-stage centrifugal ──
# Reciprocating 1st stage: a horizontal crankcase/cylinder block + bottles + motor.
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
    # Drive MOTOR (rotating drive -> actuation).
    fl.add_cyl(f"{tag}_motor", (cx - 0.95, cy, bz + 0.30), 0.26, 0.7, MAT["motor"],
               "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"{tag}_motor_coupling", (cx - 0.6, cy, bz + 0.30), 0.10, 0.18, MAT["maint"],
               "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))

add_recip_compressor("dac3_co2_compressor_stage1", CO2_COMP1_X, CO2_COMP1_Y, MAT["compressor_blu"])

# 2nd-stage centrifugal CO2 compressor: volute casing + nozzles + motor/gearbox.
fl.add_box("dac3_co2_comp2_baseframe", (CO2_COMP2_X, CO2_COMP2_Y, DECK_Z + 0.20),
           (1.4, 0.7, 0.20), MAT["stainless"], "mass_fluid_transport_process", MO)
fl.add_cyl("dac3_co2_comp2_casing", (CO2_COMP2_X + 0.25, CO2_COMP2_Y, DECK_Z + 0.55), 0.34, 0.55,
           MAT["compressor_blu"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("dac3_co2_comp2_suction", (CO2_COMP2_X + 0.25, CO2_COMP2_Y - 0.45, DECK_Z + 0.55),
           0.16, 0.35, MAT["pipe_co2"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("dac3_co2_comp2_discharge", (CO2_COMP2_X + 0.25, CO2_COMP2_Y, DECK_Z + 0.95),
           0.13, 0.40, MAT["pipe_co2"], "mass_fluid_transport_process", MO)
fl.add_cyl("dac3_co2_comp2_motor", (CO2_COMP2_X - 0.45, CO2_COMP2_Y, DECK_Z + 0.55), 0.24, 0.7,
           MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_box("dac3_co2_comp2_gearbox", (CO2_COMP2_X - 0.05, CO2_COMP2_Y, DECK_Z + 0.55),
           (0.30, 0.40, 0.40), MAT["maint"], "actuation_kinematics", MO)

# ── Inter-stage knock-out drum (vertical) protecting the 2nd-stage compressor ─
fl.add_cyl("dac3_co2_ko_drum", (KO_DRUM_X, KO_DRUM_Y, DECK_Z + 0.85), 0.26, 1.3,
           MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_sphere("dac3_co2_ko_drum_top", (KO_DRUM_X, KO_DRUM_Y, DECK_Z + 1.5), 0.26,
              MAT["vessel_cyan"], "mass_fluid_transport_process", MO)

# ── Process PUMPS along the -Y walkway (sorbent wash water, condensate, water) ─
pump_specs = [
    ("dac3_wash_water_pump", 3.0, -1.62, MAT["pump_orange"]),
    ("dac3_condensate_pump", 8.3, -1.62, MAT["pipe_water"]),
    ("dac3_cooling_water_pump", 11.0, -1.62, MAT["pump_orange"]),
]
for tag, px, py, mat in pump_specs:
    fl.add_cyl(f"{tag}", (px, py, DECK_Z + 0.22), 0.16, 0.42, mat,
               "mass_fluid_transport_process", MO)
    fl.add_cyl(f"{tag}_motor", (px, py + 0.28, DECK_Z + 0.22), 0.12, 0.34, MAT["motor"],
               "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))

# ── Major process PIPE runs (captured CO2 / regen feed / steam / water) ──────
# Contactor sorbent transfer to the regenerator (concentrated capture stream).
fl.add_pipe("dac3_contactor_to_regen", [
    (CONTACTOR_X0 + 2 * CONTACTOR_DX, CONTACTOR_Y + CELL_D / 2 + 0.4, CONTACTOR_Z0),
    (REGEN_X, CONTACTOR_Y + CELL_D / 2 + 0.4, CONTACTOR_Z0),
    (REGEN_X, REGEN_Y, REGEN_TOP - 0.2)], 0.07, MAT["pipe_air"],
    "mass_fluid_transport_process", MO)
# Released concentrated CO2: regenerator -> dryer.
fl.add_pipe("dac3_regen_to_dryer", [
    (REGEN_X, REGEN_Y, REGEN_TOP + 0.1), (REGEN_X, CO2_DRYER_Y, REGEN_TOP + 0.1),
    (CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 2.1)], 0.05, MAT["pipe_co2"],
    "mass_fluid_transport_process", MO)
# Dryer -> 1st-stage compressor.
fl.add_pipe("dac3_dryer_to_comp1", [
    (CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 0.4), (CO2_DRYER_X, CO2_COMP1_Y, DECK_Z + 0.5),
    (CO2_COMP1_X - 0.95, CO2_COMP1_Y, DECK_Z + 0.5)], 0.045, MAT["pipe_co2"],
    "mass_fluid_transport_process", MO)
# 1st-stage -> knock-out drum -> 2nd-stage.
fl.add_pipe("dac3_comp1_to_ko", [
    (CO2_COMP1_X + 0.62, CO2_COMP1_Y, DECK_Z + 0.85), (KO_DRUM_X, CO2_COMP1_Y, DECK_Z + 1.0),
    (KO_DRUM_X, KO_DRUM_Y, DECK_Z + 1.5)], 0.045, MAT["pipe_co2"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("dac3_ko_to_comp2", [
    (KO_DRUM_X, KO_DRUM_Y, DECK_Z + 0.4), (CO2_COMP2_X - 0.95, KO_DRUM_Y, DECK_Z + 0.55),
    (CO2_COMP2_X + 0.25, CO2_COMP2_Y - 0.45, DECK_Z + 0.55)], 0.04, MAT["pipe_co2"],
    "mass_fluid_transport_process", MO)
# 2nd-stage discharge -> dense-phase CO2 storage bullet.
fl.add_pipe("dac3_comp2_to_storage", [
    (CO2_COMP2_X + 0.25, CO2_COMP2_Y, DECK_Z + 1.2), (CO2_COMP2_X + 0.25, CO2_BULLET_Y, DECK_Z + 1.6),
    (CO2_BULLET_X - 0.9, CO2_BULLET_Y, CO2_BULLET_Z)], 0.04, MAT["pipe_co2"],
    "mass_fluid_transport_process", MO)


# ═══════ Module — environmental_interface: CO2 storage, steam/heat supply, ════
#         cooling water, process-water tank, MV transformer (M4 + M5)

# ── Dense-phase CO2 BUFFER / STORAGE bullet (horizontal vessel on saddles) ───
fl.add_cyl("dac7_co2_storage_bullet", (CO2_BULLET_X, CO2_BULLET_Y, CO2_BULLET_Z), 0.55, 2.2,
           MAT["co2_tank_grey"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
for xo in (-1.0, 1.0):
    fl.add_sphere(f"dac7_co2_bullet_head_{xo:+.1f}", (CO2_BULLET_X + xo, CO2_BULLET_Y, CO2_BULLET_Z), 0.55,
                  MAT["co2_tank_grey"], "environmental_interface", MO)
    fl.add_box(f"dac7_co2_bullet_saddle_{xo:+.1f}", (CO2_BULLET_X + xo * 0.6, CO2_BULLET_Y, DECK_Z + 0.40),
               (0.14, 0.9, (CO2_BULLET_Z - DECK_Z - 0.40) * 2), MAT["stainless"],
               "environmental_interface", MO)

# ── Steam / heat supply package (the regeneration heat source) ──────────────
fl.add_box("dac7_steam_package_body", (STEAM_PKG_X, STEAM_PKG_Y, STEAM_PKG_Z), (1.3, 1.1, 1.8),
           MAT["regen_orange"], "environmental_interface", MO)
fl.add_box("dac7_steam_package_lagging", (STEAM_PKG_X, STEAM_PKG_Y, STEAM_PKG_Z), (1.36, 1.16, 1.7),
           MAT["insulation"], "environmental_interface", MO)
# Small flue stack off the steam package.
fl.add_cyl("dac7_steam_flue_stack", (STEAM_PKG_X + 0.4, STEAM_PKG_Y, DECK_Z + 2.6), 0.20, 1.8,
           MAT["contactor_steel"], "environmental_interface", MO)
fl.add_torus("dac7_steam_flue_cap", (STEAM_PKG_X + 0.4, STEAM_PKG_Y, DECK_Z + 3.5), 0.20, 0.04,
             MAT["stainless"], "environmental_interface", MO)
# Steam line to the regenerator jacket.
fl.add_pipe("dac7_steam_to_regen", [
    (STEAM_PKG_X, STEAM_PKG_Y, DECK_Z + 1.9), (STEAM_PKG_X, REGEN_Y, DECK_Z + 1.9),
    (REGEN_X, REGEN_Y, REGEN_BOTTOM + 0.5)], 0.05, MAT["pipe_steam"],
    "environmental_interface", MO)

# ── Closed-loop cooling-water dry-cooler skid (finned bank + fans) ──────────
for i in range(6):
    y = COOLING_Y - 0.45 + i * 0.16
    fl.add_box(f"dac7_cooling_finbank_{i}", (COOLING_X, y, DECK_Z + 1.3), (1.0, 0.07, 1.4),
               MAT["heatsink"], "environmental_interface", MO)
fl.add_box("dac7_cooling_skid_frame", (COOLING_X, COOLING_Y, DECK_Z + 0.5), (1.1, 1.2, 0.5),
           MAT["stainless"], "environmental_interface", MO)
for k, fy in enumerate((COOLING_Y - 0.3, COOLING_Y + 0.3)):
    fl.add_cyl(f"dac7_cooling_fan_{k}", (COOLING_X, fy, DECK_Z + 2.1), 0.22, 0.14, MAT["ctrl_black"],
               "environmental_interface", MO)
    fl.add_torus(f"dac7_cooling_fan_guard_{k}", (COOLING_X, fy, DECK_Z + 2.18), 0.22, 0.012,
                 MAT["stainless"], "environmental_interface", MO)

# ── Process-water / make-up water tank (vertical, dished top) ───────────────
fl.add_cyl("dac7_process_water_tank", (WATER_TANK_X, WATER_TANK_Y, WATER_TANK_Z), 0.55, 1.5,
           MAT["water_tank_blue"], "environmental_interface", MO)
fl.add_sphere("dac7_process_water_tank_top", (WATER_TANK_X, WATER_TANK_Y, WATER_TANK_Z + 0.75), 0.55,
              MAT["water_tank_blue"], "environmental_interface", MO)

# ── MV/LV distribution TRANSFORMER (cast-resin, on a plinth) ────────────────
fl.add_box("dac7_transformer_plinth", (TRANSFORMER_X, TRANSFORMER_Y, DECK_Z + 0.10), (1.2, 1.0, 0.20),
           MAT["stainless"], "environmental_interface", MO)
fl.add_box("dac7_transformer_tank", (TRANSFORMER_X, TRANSFORMER_Y, DECK_Z + 0.85), (1.0, 0.8, 1.3),
           MAT["powerdist"], "environmental_interface", MO)
for i in range(7):
    yo = -0.34 + i * 0.11
    fl.add_box(f"dac7_transformer_fin_{i}", (TRANSFORMER_X - 0.52, TRANSFORMER_Y + yo, DECK_Z + 0.85),
               (0.08, 0.04, 1.1), MAT["heatsink"], "environmental_interface", MO)
for k, xo in enumerate((-0.25, 0.0, 0.25)):
    fl.add_cyl(f"dac7_transformer_bushing_{k}", (TRANSFORMER_X + xo, TRANSFORMER_Y, DECK_Z + 1.65), 0.05, 0.35,
               MAT["white_label"], "environmental_interface", MO)


# ═══════ Module — power_distribution: MV switchgear, LV board, busbars, VSDs ══
fl.add_box("dac8_mv_switchgear", (11.0, 1.85, DECK_Z + 0.9), (1.0, 0.5, 1.6),
           MAT["powerdist"], "power_distribution", MO)
fl.add_box("dac8_lv_main_board", (10.0, 1.85, DECK_Z + 0.85), (1.0, 0.45, 1.5),
           MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.55, 0.70, 0.85]):
    fl.add_box(f"dac8_busbar_{i}", (10.5, 1.78, DECK_Z + z), (1.2, 0.025, 0.025),
               MAT["copper"], "power_distribution", MO)
# Cable-tray spine running the length of the skid at high level feeding the fans.
fl.add_box("dac8_cable_tray_spine", (W / 2, 1.78, H - 0.6), (W - 1.0, 0.16, 0.10),
           MAT["powerdist"], "power_distribution", MO)
# A high-level cable-tray drop feeding the contactor fan bank (lots of fan motors).
fl.add_box("dac8_cable_tray_drop_fans", (CONTACTOR_X0 + CONTACTOR_DX, 1.4, DECK_Z + 2.6),
           (0.12, 0.10, 2.8), MAT["powerdist"], "power_distribution", MO)
# Earth/grounding bar along the front sole-plate.
fl.add_box("dac8_grounding_bar", (W / 2, -1.85, DECK_Z + 0.05), (W - 1.0, 0.03, 0.03),
           MAT["copper"], "power_distribution", MO)
# VSD drive cabinets for the contactor fans + the big CO2 compressor motors.
for k, cx in enumerate((2.2, CO2_COMP1_X, CO2_COMP2_X)):
    fl.add_box(f"dac8_vsd_cabinet_{k}", (cx, 1.85, DECK_Z + 0.8), (0.5, 0.4, 1.4),
               MAT["powerdist"], "power_distribution", MO)


# ═══════ Module — control_compute_communication: DCS + SIS cabinets, network ═
# Floor-standing control + marshalling cabinets on the front edge (the local
# equipment room). DCS + SIS + I/O racks + a comms antenna. The cabinet DOORS +
# screens face OUTWARD (-Y, toward the operator walkway) so the front camera
# sees a legible control-panel bank, not edge-on slabs.
CAB_Y = -1.78
CAB_FRONT = CAB_Y - 0.235               # outer (walkway-facing) door plane
for k, cx in enumerate((4.7, 5.35, 6.0)):
    fl.add_box(f"dac5c_control_cabinet_{k}", (cx, CAB_Y, DECK_Z + 0.95), (0.62, 0.46, 1.7),
               MAT["control"], "control_compute_communication", MO)
    fl.add_box(f"dac5c_cabinet_handle_{k}", (cx + 0.24, CAB_FRONT, DECK_Z + 0.95), (0.03, 0.03, 0.5),
               MAT["stainless"], "control_compute_communication", MO)
fl.add_box("dac5c_dcs_controller", (4.7, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("dac5c_sis_controller", (5.35, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("dac5c_io_rack", (6.0, CAB_FRONT, DECK_Z + 1.25), (0.42, 0.02, 0.46),
           MAT["hmi"], "control_compute_communication", MO)
fl.add_box("dac5c_gas_panel", (6.0, CAB_FRONT, DECK_Z + 0.55), (0.40, 0.02, 0.32),
           MAT["control"], "control_compute_communication", MO)
for k, cx in enumerate((4.7, 5.35, 6.0)):
    fl.add_box(f"dac5c_led_strip_{k}", (cx, CAB_FRONT, DECK_Z + 0.85), (0.40, 0.02, 0.05),
               MAT["sensor"], "control_compute_communication", MO)
fl.add_box("dac5c_ethernet_switch", (4.7, CAB_FRONT, DECK_Z + 1.72), (0.30, 0.02, 0.14),
           MAT["powerdist"], "control_compute_communication", MO)
fl.add_cyl("dac5c_comms_antenna", (6.0, CAB_Y, DECK_Z + 2.15), 0.014, 0.40,
           MAT["antenna"], "control_compute_communication", MO)


# ═══════ Module — safety_protection: PRVs, CO2 gas detection, ESD, relief ════
# Pressure-relief valves on the regenerator + CO2 conditioning + storage.
for tag, x, y, z in [
    ("regen", REGEN_X, REGEN_Y, REGEN_TOP + 0.5),
    ("ko_drum", KO_DRUM_X, KO_DRUM_Y, DECK_Z + 1.7),
    ("co2_storage", CO2_BULLET_X, CO2_BULLET_Y, CO2_BULLET_Z + 0.6),
    ("dryer", CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 2.3),
]:
    fl.add_cyl(f"dac6_{tag}_prv", (x, y, z), 0.05, 0.20, MAT["warning_red"],
               "safety_protection", MO)
# CO2 / O2-depletion GAS DETECTORS. CO2 is heavier than air + an asphyxiant, so
# detectors at LOW level (deck) AND head height across the contactor +
# conditioning + storage areas.
gas_pts = [
    (CONTACTOR_X0 + CONTACTOR_DX, -1.85, DECK_Z + 1.4), (REGEN_X, -1.85, DECK_Z + 1.4),
    (CO2_COMP1_X, -1.85, DECK_Z + 1.4), (CO2_BULLET_X, -1.85, DECK_Z + 1.4),
    (CONTACTOR_X0 + CONTACTOR_DX, CONTACTOR_Y, DECK_Z + 0.35),
    (REGEN_X, REGEN_Y, DECK_Z + 0.35), (CO2_COMP1_X, CO2_COMP1_Y, DECK_Z + 0.35),
    (CO2_BULLET_X, CO2_BULLET_Y, DECK_Z + 0.35),
]
for i, (x, y, z) in enumerate(gas_pts):
    fl.add_box(f"dac6_gas_detector_{i}", (x, y, z), (0.10, 0.06, 0.07),
               MAT["warning_red"], "safety_protection", MO)
# Emergency stop on the outward control-cabinet door.
fl.add_cyl("dac6_estop_mushroom", (4.7, CAB_FRONT, DECK_Z + 1.6), 0.055, 0.04, MAT["safety"],
           "safety_protection", MO, rotation=(math.radians(90), 0, 0))
# Rupture disc on the regenerator + a bund kerb under the CO2 storage bullet.
fl.add_cyl("dac6_regen_rupture_disc", (REGEN_X + REGEN_R, REGEN_Y, REGEN_Z + 0.4),
           0.07, 0.12, MAT["warning_red"], "safety_protection", MO, rotation=(0, math.radians(90), 0))
fl.add_box("dac6_co2_storage_bund", (CO2_BULLET_X, CO2_BULLET_Y, DECK_Z + 0.30), (2.6, 1.4, 0.04),
           MAT["warning_red"], "safety_protection", MO)


# ═══════ Module — sensing_instrumentation: level/pressure/temp/flow/analysers ═
# Regenerator dP + temperature + pressure.
fl.add_box("dac4_regen_dp_transmitter", (REGEN_X - 0.8, REGEN_Y, REGEN_TOP - 1.0), (0.10, 0.07, 0.14),
           MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("dac4_regen_temp_probe", (REGEN_X, REGEN_Y - 0.8, REGEN_Z), 0.014, 0.22,
           MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("dac4_regen_pressure_gauge", (REGEN_X - 0.75, REGEN_Y, REGEN_Z - 0.6), 0.06, 0.03,
           MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
# Contactor inlet/outlet CO2 + humidity analysers (the capture-efficiency check).
for i, (x, y, z) in enumerate([
    (CONTACTOR_X0, CONTACTOR_Y - CELL_D / 2 - 0.2, CONTACTOR_Z0 + CONTACTOR_DZ),
    (CONTACTOR_X0 + 2 * CONTACTOR_DX, CONTACTOR_Y + CELL_D / 2 + 0.5, CONTACTOR_Z0 + 2 * CONTACTOR_DZ)]):
    fl.add_box(f"dac4_co2_analyser_{i}", (x, y, z), (0.12, 0.08, 0.16),
               MAT["sensor"], "sensing_instrumentation", MO)
# CO2-product purity analyser on the compressor discharge.
fl.add_box("dac4_co2_purity_analyser", (CO2_COMP2_X + 0.25, CO2_COMP2_Y - 0.2, DECK_Z + 1.4),
           (0.12, 0.08, 0.18), MAT["sensor"], "sensing_instrumentation", MO)
# Storage-bullet level + pressure.
fl.add_box("dac4_co2_storage_level_tx", (CO2_BULLET_X + 1.0, CO2_BULLET_Y, CO2_BULLET_Z + 0.2),
           (0.07, 0.06, 0.14), MAT["sensor"], "sensing_instrumentation", MO)
# Water-tank level radar.
fl.add_cyl("dac4_water_tank_radar", (WATER_TANK_X, WATER_TANK_Y, WATER_TANK_Z + 0.85), 0.06, 0.16,
           MAT["sensor"], "sensing_instrumentation", MO)
# Coriolis flow meters on the captured-CO2 + cooling-water lines.
for i, (x, y, z) in enumerate([(CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 0.4),
                               (COOLING_X - 0.5, COOLING_Y, DECK_Z + 0.5)]):
    fl.add_box(f"dac4_flow_meter_{i}", (x, y, z), (0.12, 0.09, 0.14),
               MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — actuation_kinematics: control + ESD valves (fan/compressor ══
#         drives are tagged here at the equipment above)
# Pneumatic control valves on the key process lines.
valve_specs = [
    ("capture_transfer_valve", REGEN_X, REGEN_Y, REGEN_TOP - 0.2, MAT["pipe_air"]),
    ("regen_co2_outlet_valve", REGEN_X, CO2_DRYER_Y, REGEN_TOP + 0.1, MAT["pipe_co2"]),
    ("dryer_outlet_valve", CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 0.4, MAT["pipe_co2"]),
    ("interstage_valve", KO_DRUM_X, KO_DRUM_Y, DECK_Z + 0.4, MAT["pipe_co2"]),
    ("steam_control_valve", STEAM_PKG_X, REGEN_Y, DECK_Z + 1.9, MAT["pipe_steam"]),
]
for tag, x, y, z, mat in valve_specs:
    fl.add_box(f"dac9_{tag}_body", (x, y, z), (0.12, 0.12, 0.10), MAT["valve_green"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"dac9_{tag}_actuator", (x, y, z + 0.12), 0.07, 0.12, MAT["ctrl_black"],
               "actuation_kinematics", MO)
# Fail-safe ESD valves (larger, on the isolation points) — actuated.
for i, (x, y, z) in enumerate([
    (REGEN_X, REGEN_Y, REGEN_BOTTOM - 0.3), (CO2_COMP2_X + 0.25, CO2_COMP2_Y, DECK_Z + 1.2),
    (CO2_BULLET_X - 0.9, CO2_BULLET_Y, CO2_BULLET_Z)]):
    fl.add_box(f"dac9_esd_valve_{i}", (x, y, z), (0.16, 0.16, 0.14), MAT["safety"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"dac9_esd_actuator_{i}", (x, y, z + 0.15), 0.10, 0.16, MAT["ctrl_black"],
               "actuation_kinematics", MO)


# ═══════ Module — maintenance_serviceability: ladder, drains, lifting eyes ════
# ── CAGED VERTICAL ACCESS LADDER from skid deck UP to the regen platform ─────
# The platform is a SECOND LEVEL (grating top z=2.35) so the access route MUST
# be visible: a caged fixed ladder on the -Y face under the platform left bay,
# stiles continuing ~0.9 m above the landing, a step-through landing + a hooped
# safety cage.
LAD_X = REGEN_X - 0.9
LAD_Y = -1.96
LAD_W = 0.26
LAD_FOOT = DECK_Z + 0.05
LAD_LAND = PLAT_Z
LAD_TOP = LAD_LAND + 0.90
lad_mid = (LAD_FOOT + LAD_TOP) / 2.0
lad_h = LAD_TOP - LAD_FOOT
for sx in (LAD_X - LAD_W / 2, LAD_X + LAD_W / 2):
    fl.add_cyl(f"dac10_ladder_stile_{sx:.2f}", (sx, LAD_Y, lad_mid), 0.024, lad_h,
               MAT["maint"], "maintenance_serviceability", MO)
n_rungs = int((LAD_LAND - LAD_FOOT) / 0.28) + 1
for i in range(n_rungs):
    z = LAD_FOOT + i * 0.28
    fl.add_cyl(f"dac10_ladder_rung_{i}", (LAD_X, LAD_Y, z), 0.016, LAD_W,
               MAT["maint"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
cage_r = 0.26
cage_cy = LAD_Y - 0.10
cage_hoop_z = [DECK_Z + 1.1, DECK_Z + 1.5, DECK_Z + 1.9, LAD_LAND]
for i, z in enumerate(cage_hoop_z):
    fl.add_torus(f"dac10_ladder_cage_hoop_{i}", (LAD_X, cage_cy, z), cage_r, 0.012,
                 MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
for j, ang in enumerate([-70, -35, 0, 35, 70]):
    sx = LAD_X + cage_r * math.sin(math.radians(ang))
    sy = cage_cy - cage_r * math.cos(math.radians(ang))
    fl.add_cyl(f"dac10_ladder_cage_stringer_{j}", (sx, sy, (DECK_Z + 1.1 + LAD_LAND) / 2), 0.009,
               LAD_LAND - (DECK_Z + 1.1), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("dac10_ladder_landing_plate", (LAD_X, -1.6, LAD_LAND + 0.02), (LAD_W + 0.22, 0.5, 0.05),
           MAT["maint"], "maintenance_serviceability", MO)
# Manual drain valves at the base of the major vessels.
for i, (x, y) in enumerate([
    (REGEN_X, REGEN_Y), (CO2_DRYER_X, CO2_DRYER_Y), (KO_DRUM_X, KO_DRUM_Y),
    (CO2_BULLET_X, CO2_BULLET_Y), (WATER_TANK_X, WATER_TANK_Y)]):
    fl.add_cyl(f"dac10_drain_valve_{i}", (x, y - 0.3, DECK_Z + 0.22), 0.032, 0.08, MAT["maint"],
               "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Lifting eyes on the tall-vessel heads + the contactor bank for crane maintenance.
for i, (x, y, z) in enumerate([(REGEN_X, REGEN_Y, REGEN_TOP + 0.65),
                               (CONTACTOR_X0 + CONTACTOR_DX, CONTACTOR_Y, CONTACTOR_Z0 + 2 * CONTACTOR_DZ + 0.8),
                               (CO2_DRYER_X, CO2_DRYER_Y, DECK_Z + 2.4)]):
    fl.add_torus(f"dac10_lifting_eye_{i}", (x, y, z), 0.06, 0.014, MAT["maint"],
                 "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Spare sorbent-cell cartridge + tool tray on the walkway (sorbent is consumable).
fl.add_box("dac10_spare_sorbent_cell", (3.6, -1.62, DECK_Z + 0.45), (0.7, 0.5, 0.7),
           MAT["white_label"], "maintenance_serviceability", MO)
fl.add_box("dac10_tool_tray", (6.6, -1.62, DECK_Z + 0.35), (0.6, 0.2, 0.06), MAT["maint"],
           "maintenance_serviceability", MO)


# ═══════ Module — hmi_ergonomics: local HMI panel, buttons, status beacon ════
# Mounted on the OUTWARD (walkway-facing, -Y) cabinet door alongside the DCS/SIS.
HMI_FRONT = CAB_Y - 0.245
fl.add_box("dac3h_hmi_bezel", (5.35, HMI_FRONT, DECK_Z + 1.85), (0.38, 0.03, 0.30),
           MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("dac3h_hmi_screen", (5.35, HMI_FRONT - 0.01, DECK_Z + 1.85), (0.32, 0.006, 0.23),
           MAT["hmi"], "hmi_ergonomics", MO)
for i, (xo, mat) in enumerate([(-0.12, MAT["sensor"]), (0.0, MAT["control"]), (0.12, MAT["safety"])]):
    fl.add_cyl(f"dac3h_operator_button_{i}", (5.35 + xo, HMI_FRONT, DECK_Z + 1.58), 0.024, 0.016, mat,
               "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for i, mat in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"dac3h_status_beacon_{i}", (6.0, CAB_Y, DECK_Z + 2.4 + i * 0.07), 0.045, 0.06, mat,
               "hmi_ergonomics", MO)
fl.add_box("dac3h_instruction_placard", (4.7, HMI_FRONT, DECK_Z + 0.45), (0.24, 0.006, 0.14),
           MAT["white_label"], "hmi_ergonomics", MO)


fl.add_lights(target_centre=(W / 2, 0, H / 2), fill_energy=320, fill_size=22)
fl.make_world_white()
# hero_open_frame=True: this is a FIELD-ERECTED open structural-steel SKID
# (contactor bank + regenerator + compressors on a braced steel frame), NOT an
# enclosed/glass container — paint the frame SOLID steel in the hero so it reads
# as braced open steelwork on a skid deck, not a translucent shipping box.
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment",
                       hero_open_frame=True)
