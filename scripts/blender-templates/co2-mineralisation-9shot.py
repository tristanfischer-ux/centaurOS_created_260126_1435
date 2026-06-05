"""co2-mineralisation-9shot.py — 1 tonne/day CO2 capture + mineralisation skid.

Envelope 6.0 x 2.4 x 4.0 m. Process skid combining a monoethanolamine (MEA)
amine-scrubbing capture train with a calcium/potassium mineralisation train:

  - MEA absorber column (tall, packed) — CO2 capture from flue gas
  - MEA stripper / regenerator column (tall, packed) + reboiler — CO2 release
  - Carbonation reactor (pressure vessel) — CO2 + Ca feedstock -> CaCO3
  - CaCO3 cake filter / centrifuge + hot-air dryer — solids dewatering + drying
  - K2SO4 crystalliser (agitated vessel) — by-product crystallisation
  - Rich / lean MEA storage tanks + MEA recovery distillation column
  - Process pumps, pipework, instrumentation, skid base frame

Visually: a process skid with two tall columns + several vessels + tanks +
balance-of-plant, modelled with forge_blender_lib helpers only. Same 9-shot
(hero + per-module) convention as the other templates — geometry is tagged
into the 11 canonical modules and run_render_pipeline produces every image.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P co2-mineralisation-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-co2-mineralisation-9shot")))

# Envelope. Larger than the electrolyser skid: 1 t/day amine plant needs tall
# columns (~3.5 m active height) on a long skid base.
W = 6.0
D = 2.4
H = 4.0

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
# Form-factor-specific palette (sRGB; make_mat handles the rest).
MAT["column_steel"]    = fl.make_mat("m_column_steel",    (0.80, 0.82, 0.86), metallic=0.55, roughness=0.34)
MAT["reactor_blue"]    = fl.make_mat("m_reactor_blue",    (0.00, 0.40, 0.95), metallic=0.20, roughness=0.36)
MAT["vessel_cyan"]     = fl.make_mat("m_vessel_cyan",     (0.00, 0.78, 0.95), metallic=0.20, roughness=0.35)
MAT["mea_tank_green"]  = fl.make_mat("m_mea_tank_green",  (0.00, 0.62, 0.32), metallic=0.10, roughness=0.42)
MAT["crystalliser"]    = fl.make_mat("m_crystalliser",   (0.62, 0.05, 0.95), metallic=0.10, roughness=0.42)
MAT["centrifuge"]      = fl.make_mat("m_centrifuge",     (0.55, 0.58, 0.62), metallic=0.65, roughness=0.30)
MAT["dryer_amber"]     = fl.make_mat("m_dryer_amber",    (1.00, 0.55, 0.00), metallic=0.10, roughness=0.42)
MAT["pump_orange"]     = fl.make_mat("m_pump_orange",    (1.00, 0.30, 0.00), metallic=0.10, roughness=0.42)
MAT["pipe_co2"]        = fl.make_mat("m_pipe_co2",       (0.20, 0.85, 0.95), metallic=0.35, roughness=0.25)
MAT["pipe_amine"]      = fl.make_mat("m_pipe_amine",     (0.00, 0.62, 0.32), metallic=0.30, roughness=0.28)
MAT["pipe_slurry"]     = fl.make_mat("m_pipe_slurry",    (0.45, 0.42, 0.40), metallic=0.25, roughness=0.40)
MAT["valve_green"]     = fl.make_mat("m_valve_green",    (0.00, 0.95, 0.12), metallic=0.10, roughness=0.42)
MAT["warning_red"]     = fl.make_mat("m_warning_red",    (1.00, 0.00, 0.00), metallic=0.00, roughness=0.45)
MAT["walkway"]         = fl.make_mat("m_walkway",        (0.20, 0.24, 0.30), metallic=0.55, roughness=0.40)
MAT["insulation"]      = fl.make_mat("m_insulation",     (0.86, 0.84, 0.74), metallic=0.00, roughness=0.62)
MAT["white_label"]     = fl.make_mat("m_white_label",    (0.96, 0.96, 0.92), metallic=0.00, roughness=0.60)

# ── Plant layout anchors (skid runs along +X) ────────────────────────────
# Two tall columns at the left of the skid, mineralisation train centre,
# tanks + recovery at the right. Columns are tall (active ~3.4 m).
ABSORBER_X, ABSORBER_Y = 0.85, -0.55
STRIPPER_X, STRIPPER_Y = 0.85, 0.55
COLUMN_R = 0.30
COLUMN_BOTTOM = 0.55
COLUMN_TOP = 3.75
COLUMN_Z = (COLUMN_BOTTOM + COLUMN_TOP) / 2.0
COLUMN_H = COLUMN_TOP - COLUMN_BOTTOM

REACTOR_X, REACTOR_Y, REACTOR_Z = 2.35, -0.45, 1.10
REACTOR_R = 0.55
REACTOR_H = 1.40

CENTRIFUGE_X, CENTRIFUGE_Y, CENTRIFUGE_Z = 3.35, 0.55, 0.95
DRYER_X, DRYER_Y, DRYER_Z = 4.25, 0.55, 1.05
CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z = 3.40, -0.55, 1.15
CRYSTALLISER_R = 0.42
CRYSTALLISER_H = 1.30

RICH_TANK_X, RICH_TANK_Y = 5.25, -0.55
LEAN_TANK_X, LEAN_TANK_Y = 5.25, 0.55
TANK_R = 0.45
TANK_Z = 0.90
TANK_H = 1.50
RECOVERY_X, RECOVERY_Y, RECOVERY_Z = 4.55, -0.55, 2.10  # MEA recovery distillation


# ═══════ Module — structure_containment: OPEN SKID FRAME, deck, walkway, ladder
# This plant is a TRANSPORTABLE SKID MODULE — an OPEN structural-steel skid
# frame (corner posts + perimeter rails + diagonal cross-bracing on a structural
# deck), NOT an enclosed/glass container. The hero pass paints these members
# SOLID galvanised steel (hero_open_frame=True at run_render_pipeline) so the
# frame reads as braced steelwork, not a translucent shipping box.

# ── Skid BASE: structural sole-plate channels + longitudinal bearers ─────────
# Perimeter sole-plate (the equipment sits ON this skid deck — a clear datum).
for name, loc, size in [
    ("co1_base_front_channel", (W / 2, -1.12, 0.08), (W, 0.14, 0.18)),
    ("co1_base_rear_channel", (W / 2, 1.12, 0.08), (W, 0.14, 0.18)),
    ("co1_base_left_channel", (0.07, 0.0, 0.08), (0.14, D, 0.18)),
    ("co1_base_right_channel", (W - 0.07, 0.0, 0.08), (0.14, D, 0.18)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)

# Two longitudinal I-beam bearers running the length of the skid (the spine the
# vessels are bolted down to) — reads as the structural deck the plant sits on.
for by in (-0.62, 0.62):
    fl.add_box(f"co1_base_bearer_{by:+.2f}", (W / 2, by, 0.10), (W - 0.2, 0.12, 0.16),
               MAT["stainless"], "structure_containment", MO)
# Transverse deck cross-members tie the two bearers (skid deck grid).
for i, x in enumerate([0.6, 1.4, 2.2, 3.0, 3.8, 4.6, 5.4]):
    fl.add_box(f"co1_base_crossmember_{i}", (x, 0.0, 0.10), (0.10, 2.20, 0.14),
               MAT["stainless"], "structure_containment", MO)
# ISO-style fork/crane lift lugs at the four base corners (transportable skid).
for i, (lx, ly) in enumerate([(0.18, -1.12), (0.18, 1.12), (W - 0.18, -1.12), (W - 0.18, 1.12)]):
    fl.add_box(f"co1_skid_lift_lug_{i}", (lx, ly, 0.20), (0.16, 0.10, 0.10),
               MAT["stainless"], "structure_containment", MO)

# ── Open frame: corner + intermediate posts (90 mm box section) ──────────────
for i, (x, y) in enumerate([
    (0.09, -1.12), (0.09, 1.12), (3.0, -1.12), (3.0, 1.12),
    (W - 0.09, -1.12), (W - 0.09, 1.12),
]):
    fl.add_box(f"co1_corner_post_{i}", (x, y, H / 2), (0.10, 0.10, H),
               MAT["stainless"], "structure_containment", MO)

# Top perimeter frame.
for name, loc, size in [
    ("co1_top_front_channel", (W / 2, -1.12, H - 0.05), (W, 0.10, 0.10)),
    ("co1_top_rear_channel", (W / 2, 1.12, H - 0.05), (W, 0.10, 0.10)),
    ("co1_top_left_channel", (0.05, 0.0, H - 0.05), (0.10, D, 0.10)),
    ("co1_top_right_channel", (W - 0.05, 0.0, H - 0.05), (0.10, D, 0.10)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)

# Mid-height perimeter tie ring (braces the tall columns + frames the bays).
fl.add_box("co1_mid_tie_front", (W / 2, -1.12, 2.0), (W, 0.07, 0.07),
           MAT["stainless"], "structure_containment", MO)
fl.add_box("co1_mid_tie_rear", (W / 2, 1.12, 2.0), (W, 0.07, 0.07),
           MAT["stainless"], "structure_containment", MO)

# ── Diagonal CROSS-BRACING — the unambiguous "open structural frame" signal ──
# Knee/V braces in the two end bays (front + rear faces) + a sway brace on each
# open end. Drawn with add_pipe between EXACT frame node points so the members
# snap to the corners and never overshoot the bay (the rotation-maths version
# overshot). A braced open frame reads instantly as structural steelwork.
BRACE_R = 0.035
Z_BOT = 0.18      # brace foot just above the sole-plate
Z_TOP = H - 0.10  # brace head just below the top rail
# Front + rear faces: a V-brace (apex at mid-span bottom-rail, feet at the two
# top corners) in the LEFT end bay (x 0.1→1.0) and RIGHT end bay (x 5.0→5.9).
for bx0, bx1, tag in [(0.12, 1.0, "L"), (W - 1.0, W - 0.12, "R")]:
    bxm = (bx0 + bx1) / 2
    for face_y in (-1.12, 1.12):
        # diagonal up-left and up-right forming an inverted-V (knee brace pair)
        fl.add_pipe(f"co1_brace_{tag}_a_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx0, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
        fl.add_pipe(f"co1_brace_{tag}_b_{face_y:+.2f}",
                    [(bxm, face_y, Z_BOT), (bx1, face_y, Z_TOP)], BRACE_R,
                    MAT["stainless"], "structure_containment", MO)
# Two open ends (left x≈0.10, right x≈W-0.10): a single sway diagonal across the
# end face (bottom-front corner → top-rear corner) so the ends read as braced.
for ex in (0.12, W - 0.12):
    fl.add_pipe(f"co1_brace_end_{ex:.2f}",
                [(ex, -1.12, Z_BOT), (ex, 1.12, Z_TOP)], BRACE_R,
                MAT["stainless"], "structure_containment", MO)

# ── Service walkway on -Y side at deck height (open grating) ─────────────────
fl.add_box("co1_service_walkway_plate", (W / 2, -0.95, 0.24), (5.7, 0.42, 0.05),
           MAT["walkway"], "structure_containment", MO)
for i in range(18):
    x = 0.3 + i * 0.32
    fl.add_box(f"co1_walkway_grating_{i}", (x, -0.95, 0.275), (0.04, 0.40, 0.012),
               MAT["stainless"], "structure_containment", MO)

# ── Elevated operator ACCESS PLATFORM around the two tall columns ────────────
# (NOT a container floor — an open grated platform so operators reach the upper
# column trays/manways. Built with open grating + toe-board + 2-rail handrail so
# it unambiguously reads as a walk-on platform, and the access ladder lands on
# its front-left corner.)
PLAT_Z = 2.05            # grating top-surface datum
fl.add_box("co1_column_platform", (0.85, 0.0, PLAT_Z), (1.3, 2.0, 0.05),
           MAT["walkway"], "structure_containment", MO)
# Open grating slats on the platform (see-through => clearly a platform deck).
for i in range(11):
    gx = 0.28 + i * 0.12
    fl.add_box(f"co1_platform_grating_{i}", (gx, 0.0, PLAT_Z + 0.03), (0.05, 1.96, 0.012),
               MAT["stainless"], "structure_containment", MO)
# Platform support brackets down to the skid deck (the platform is held UP).
for i, (px, py) in enumerate([(0.25, -0.95), (1.45, -0.95), (0.25, 0.95), (1.45, 0.95)]):
    fl.add_box(f"co1_platform_support_{i}", (px, py, PLAT_Z / 2 + 0.12), (0.07, 0.07, PLAT_Z - 0.24),
               MAT["stainless"], "structure_containment", MO)
# Toe-board kick-plate around the platform edge.
for name, loc, size in [
    ("co1_platform_toe_front", (0.85, -0.99, PLAT_Z + 0.10), (1.30, 0.02, 0.12)),
    ("co1_platform_toe_rear", (0.85, 0.99, PLAT_Z + 0.10), (1.30, 0.02, 0.12)),
    ("co1_platform_toe_left", (0.21, 0.0, PLAT_Z + 0.10), (0.02, 2.0, 0.12)),
]:
    fl.add_box(name, loc, size, MAT["walkway"], "structure_containment", MO)
# Handrail posts (corners + mid-span) at the platform perimeter.
rail_posts = [(0.25, -0.95), (0.25, 0.95), (1.45, -0.95), (1.45, 0.95),
              (0.85, -0.95), (0.85, 0.95), (0.25, 0.0), (1.45, 0.0)]
for i, (x, y) in enumerate(rail_posts):
    fl.add_cyl(f"co1_platform_handrail_post_{i}", (x, y, PLAT_Z + 0.50), 0.020, 0.95,
               MAT["stainless"], "structure_containment", MO)
# Top + mid handrail runs around the front + two ends (back left open to ladder).
for name, loc, size in [
    ("co1_platform_handrail_top_front", (0.85, -0.95, PLAT_Z + 0.95), (1.30, 0.025, 0.025)),
    ("co1_platform_handrail_mid_front", (0.85, -0.95, PLAT_Z + 0.50), (1.30, 0.022, 0.022)),
    ("co1_platform_handrail_top_rear", (0.85, 0.95, PLAT_Z + 0.95), (1.30, 0.025, 0.025)),
    ("co1_platform_handrail_mid_rear", (0.85, 0.95, PLAT_Z + 0.50), (1.30, 0.022, 0.022)),
    ("co1_platform_handrail_top_right", (1.45, 0.0, PLAT_Z + 0.95), (0.025, 2.0, 0.025)),
    ("co1_platform_handrail_mid_right", (1.45, 0.0, PLAT_Z + 0.50), (0.022, 2.0, 0.022)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction: columns + reactor ═════════
# (the chemical "energy"/transformation core: absorption, stripping, carbonation)
# Absorber column: tall packed tower with insulation lagging.
fl.add_cyl("co2_absorber_column_shell", (ABSORBER_X, ABSORBER_Y, COLUMN_Z),
           COLUMN_R, COLUMN_H, MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_cyl("co2_absorber_column_lagging", (ABSORBER_X, ABSORBER_Y, COLUMN_Z),
           COLUMN_R + 0.04, COLUMN_H * 0.96, MAT["insulation"], "energy_conversion_transduction", MO)
fl.add_sphere("co2_absorber_top_head", (ABSORBER_X, ABSORBER_Y, COLUMN_TOP), COLUMN_R,
              MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_frustum("co2_absorber_bottom_head", (ABSORBER_X, ABSORBER_Y, COLUMN_BOTTOM - 0.18),
               COLUMN_R, COLUMN_R * 0.4, 0.36, MAT["column_steel"],
               "energy_conversion_transduction", MO)
# Visible packed-bed support rings on the absorber front face.
for i, z in enumerate([1.2, 2.0, 2.8, 3.4]):
    fl.add_torus(f"co2_absorber_packing_ring_{i}", (ABSORBER_X, ABSORBER_Y, z),
                 COLUMN_R + 0.02, 0.018, MAT["stainless"],
                 "energy_conversion_transduction", MO)

# Stripper / regenerator column with steam reboiler at base.
fl.add_cyl("co2_stripper_column_shell", (STRIPPER_X, STRIPPER_Y, COLUMN_Z),
           COLUMN_R, COLUMN_H, MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_cyl("co2_stripper_column_lagging", (STRIPPER_X, STRIPPER_Y, COLUMN_Z),
           COLUMN_R + 0.04, COLUMN_H * 0.96, MAT["insulation"], "energy_conversion_transduction", MO)
fl.add_sphere("co2_stripper_top_head", (STRIPPER_X, STRIPPER_Y, COLUMN_TOP), COLUMN_R,
              MAT["column_steel"], "energy_conversion_transduction", MO)
fl.add_frustum("co2_stripper_bottom_head", (STRIPPER_X, STRIPPER_Y, COLUMN_BOTTOM - 0.18),
               COLUMN_R, COLUMN_R * 0.4, 0.36, MAT["column_steel"],
               "energy_conversion_transduction", MO)
for i, z in enumerate([1.2, 2.0, 2.8, 3.4]):
    fl.add_torus(f"co2_stripper_packing_ring_{i}", (STRIPPER_X, STRIPPER_Y, z),
                 COLUMN_R + 0.02, 0.018, MAT["stainless"],
                 "energy_conversion_transduction", MO)
# Reboiler — horizontal shell-and-tube heat-exchanger at stripper base.
fl.add_cyl("co2_stripper_reboiler", (1.55, STRIPPER_Y, 0.55), 0.22, 0.95,
           MAT["dryer_amber"], "energy_conversion_transduction", MO,
           rotation=(0, math.radians(90), 0))
fl.add_sphere("co2_reboiler_head", (2.04, STRIPPER_Y, 0.55), 0.22,
              MAT["dryer_amber"], "energy_conversion_transduction", MO)

# Carbonation reactor — agitated pressure vessel where CO2 + Ca feedstock -> CaCO3.
fl.add_cyl("co2_carbonation_reactor_shell", (REACTOR_X, REACTOR_Y, REACTOR_Z),
           REACTOR_R, REACTOR_H, MAT["reactor_blue"], "energy_conversion_transduction", MO)
fl.add_sphere("co2_carbonation_reactor_top_dome", (REACTOR_X, REACTOR_Y, REACTOR_Z + REACTOR_H / 2),
              REACTOR_R, MAT["reactor_blue"], "energy_conversion_transduction", MO)
fl.add_sphere("co2_carbonation_reactor_bottom_dome", (REACTOR_X, REACTOR_Y, REACTOR_Z - REACTOR_H / 2),
              REACTOR_R, MAT["reactor_blue"], "energy_conversion_transduction", MO)
# Reactor support skirt.
fl.add_cyl("co2_reactor_support_skirt", (REACTOR_X, REACTOR_Y, 0.40), REACTOR_R * 0.9, 0.55,
           MAT["stainless"], "energy_conversion_transduction", MO)


# ═══════ Module — mass_fluid_transport_process: tanks, recovery, pumps, pipe ═
# Rich-MEA and lean-MEA storage tanks (vertical, dished tops).
for tag, tx, ty, mat in [("rich", RICH_TANK_X, RICH_TANK_Y, MAT["mea_tank_green"]),
                         ("lean", LEAN_TANK_X, LEAN_TANK_Y, MAT["mea_tank_green"])]:
    fl.add_cyl(f"co11_{tag}_mea_storage_tank", (tx, ty, TANK_Z), TANK_R, TANK_H, mat,
               "mass_fluid_transport_process", MO)
    fl.add_sphere(f"co11_{tag}_mea_tank_top_dome", (tx, ty, TANK_Z + TANK_H / 2), TANK_R, mat,
                  "mass_fluid_transport_process", MO)
    for sy in (-0.18, 0.18):
        fl.add_box(f"co11_{tag}_tank_saddle_{sy:+.2f}", (tx, ty + sy, 0.12), (0.80, 0.06, 0.24),
                   MAT["stainless"], "mass_fluid_transport_process", MO)

# MEA recovery / reclaimer distillation column (elevated, small).
fl.add_cyl("co11_mea_recovery_column", (RECOVERY_X, RECOVERY_Y, RECOVERY_Z), 0.20, 1.30,
           MAT["column_steel"], "mass_fluid_transport_process", MO)
fl.add_sphere("co11_mea_recovery_top_head", (RECOVERY_X, RECOVERY_Y, RECOVERY_Z + 0.65), 0.20,
              MAT["column_steel"], "mass_fluid_transport_process", MO)

# K2SO4 crystalliser — agitated vessel producing the sulphate by-product.
fl.add_cyl("co11_k2so4_crystalliser_shell", (CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z),
           CRYSTALLISER_R, CRYSTALLISER_H, MAT["crystalliser"], "mass_fluid_transport_process", MO)
fl.add_frustum("co11_crystalliser_cone_bottom", (CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z - CRYSTALLISER_H / 2 - 0.18),
               CRYSTALLISER_R, 0.10, 0.40, MAT["crystalliser"], "mass_fluid_transport_process", MO)
fl.add_sphere("co11_crystalliser_top_dome", (CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z + CRYSTALLISER_H / 2),
              CRYSTALLISER_R, MAT["crystalliser"], "mass_fluid_transport_process", MO)

# Process pumps along the -Y walkway side (rich/lean amine + slurry transfer).
pump_specs = [
    ("rich_amine_pump", 1.35, -0.85, 0.30, MAT["pump_orange"]),
    ("lean_amine_pump", 2.20, -0.85, 0.30, MAT["pump_orange"]),
    ("slurry_transfer_pump", 3.10, -0.85, 0.30, MAT["pipe_slurry"]),
    ("filtrate_pump", 4.00, -0.85, 0.30, MAT["vessel_cyan"]),
]
for tag, px, py, pz, mat in pump_specs:
    fl.add_cyl(f"co11_{tag}", (px, py, pz), 0.16, 0.42, mat,
               "mass_fluid_transport_process", MO)
    fl.add_cyl(f"co11_{tag}_motor", (px, py + 0.24, pz), 0.11, 0.30, MAT["motor"],
               "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))

# Major process pipe runs (curved poly tubes via add_pipe).
fl.add_pipe("co11_flue_gas_to_absorber", [
    (0.0, ABSORBER_Y, 0.75), (0.45, ABSORBER_Y, 0.75), (ABSORBER_X, ABSORBER_Y, 0.75)],
    0.05, MAT["pipe_co2"], "mass_fluid_transport_process", MO)
fl.add_pipe("co11_rich_amine_absorber_to_stripper", [
    (ABSORBER_X, ABSORBER_Y, 0.62), (ABSORBER_X, 0.0, 0.62),
    (1.35, 0.0, 0.62), (1.35, -0.85, 0.50)], 0.035, MAT["pipe_amine"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("co11_lean_amine_stripper_to_absorber", [
    (STRIPPER_X, STRIPPER_Y, 0.62), (1.7, STRIPPER_Y, 0.62),
    (1.7, 0.0, 1.30), (ABSORBER_X + 0.1, 0.0, 3.4),
    (ABSORBER_X, ABSORBER_Y, 3.4)], 0.035, MAT["pipe_amine"],
    "mass_fluid_transport_process", MO)
fl.add_pipe("co11_co2_stripper_to_reactor", [
    (STRIPPER_X, STRIPPER_Y, 3.6), (STRIPPER_X, 0.0, 3.6),
    (REACTOR_X, 0.0, 3.6), (REACTOR_X, REACTOR_Y, REACTOR_Z + 0.7)],
    0.045, MAT["pipe_co2"], "mass_fluid_transport_process", MO)
fl.add_pipe("co11_reactor_slurry_to_centrifuge", [
    (REACTOR_X, REACTOR_Y, 0.45), (REACTOR_X, 0.0, 0.45),
    (CENTRIFUGE_X, 0.0, 0.45), (CENTRIFUGE_X, CENTRIFUGE_Y, CENTRIFUGE_Z - 0.3)],
    0.05, MAT["pipe_slurry"], "mass_fluid_transport_process", MO)
fl.add_pipe("co11_filtrate_to_crystalliser", [
    (CENTRIFUGE_X, CENTRIFUGE_Y, 0.6), (CENTRIFUGE_X, 0.0, 0.6),
    (CRYSTALLISER_X, 0.0, 0.6), (CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z + 0.4)],
    0.035, MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_pipe("co11_lean_tank_return", [
    (LEAN_TANK_X, LEAN_TANK_Y, 0.5), (3.0, LEAN_TANK_Y, 0.5),
    (STRIPPER_X, STRIPPER_Y, 0.5)], 0.03, MAT["pipe_amine"],
    "mass_fluid_transport_process", MO)


# ═══════ Module — environmental_interface: filter/centrifuge, dryer, cooler ══
# CaCO3 cake filter / centrifuge — horizontal solid-bowl unit.
fl.add_cyl("co7_caco3_centrifuge_bowl", (CENTRIFUGE_X, CENTRIFUGE_Y, CENTRIFUGE_Z), 0.32, 0.85,
           MAT["centrifuge"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_frustum("co7_centrifuge_inlet_cone", (CENTRIFUGE_X - 0.48, CENTRIFUGE_Y, CENTRIFUGE_Z),
               0.10, 0.30, 0.20, MAT["centrifuge"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))
fl.add_box("co7_centrifuge_cake_chute", (CENTRIFUGE_X, CENTRIFUGE_Y, CENTRIFUGE_Z - 0.55),
           (0.40, 0.40, 0.40), MAT["centrifuge"], "environmental_interface", MO)

# Hot-air rotary dryer drum (inclined horizontal cylinder) + hot-air fan.
fl.add_cyl("co7_caco3_dryer_drum", (DRYER_X, DRYER_Y, DRYER_Z), 0.34, 1.20,
           MAT["dryer_amber"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("co7_dryer_lagging", (DRYER_X, DRYER_Y, DRYER_Z), 0.38, 1.10,
           MAT["insulation"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("co7_dryer_hot_air_fan", (DRYER_X - 0.75, DRYER_Y, DRYER_Z), 0.18, 0.20,
           MAT["ctrl_black"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_torus("co7_dryer_fan_guard", (DRYER_X - 0.66, DRYER_Y, DRYER_Z), 0.18, 0.012,
             MAT["stainless"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("co7_dryer_exhaust_duct", (DRYER_X + 0.75, DRYER_Y, DRYER_Z + 0.55), 0.12, 1.00,
           MAT["thermal"], "environmental_interface", MO)

# Lean-amine cooler — plate heat-exchanger before amine returns to absorber.
for i in range(8):
    y = -0.30 + i * 0.03
    fl.add_box(f"co7_lean_cooler_plate_{i}", (2.20, y, 1.55), (0.46, 0.012, 0.70),
               MAT["thermal"], "environmental_interface", MO)
fl.add_box("co7_lean_cooler_frame", (2.20, -0.20, 1.55), (0.52, 0.30, 0.78),
           MAT["heatsink"], "environmental_interface", MO)


# ═══════ Module — power_distribution: motor feeds, heater feeds, busbars ═════
fl.add_box("co8_power_distribution_cabinet", (5.6, -0.95, 0.85), (0.40, 0.35, 1.40),
           MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.50, 0.62, 0.74]):
    fl.add_box(f"co8_main_busbar_{i}", (5.6, -0.74, z), (0.30, 0.020, 0.020),
               MAT["copper"], "power_distribution", MO)
# Cable tray spine running the length of the skid feeding pumps + heaters.
fl.add_box("co8_cable_tray_spine", (3.0, -0.78, 3.4), (5.4, 0.12, 0.08),
           MAT["powerdist"], "power_distribution", MO)
# Reboiler heater + dryer heater contactor boxes.
fl.add_box("co8_reboiler_heater_contactor", (1.55, 0.95, 0.50), (0.26, 0.18, 0.30),
           MAT["powerdist"], "power_distribution", MO)
fl.add_box("co8_dryer_heater_contactor", (DRYER_X, 0.95, 0.50), (0.26, 0.18, 0.30),
           MAT["powerdist"], "power_distribution", MO)
fl.add_box("co8_grounding_bar", (3.0, 1.10, 0.24), (5.4, 0.025, 0.025),
           MAT["copper"], "power_distribution", MO)


# ═══════ Module — control_compute_communication: control cabinet ════════════
fl.add_box("co5_control_cabinet", (5.6, 0.95, 0.90), (0.45, 0.35, 1.50),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("co5_plc_controller", (5.6, 0.76, 1.05), (0.30, 0.030, 0.30),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("co5_dcs_io_rack", (5.6, 0.76, 0.60), (0.30, 0.030, 0.26),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("co5_ethernet_switch", (5.6, 0.76, 1.45), (0.22, 0.030, 0.12),
           MAT["control"], "control_compute_communication", MO)
fl.add_cyl("co5_wireless_antenna", (5.6, 0.95, 1.78), 0.010, 0.28,
           MAT["antenna"], "control_compute_communication", MO)


# ═══════ Module — safety_protection: PRVs, gas detection, E-stop, relief ═════
# Pressure-relief valves on both columns, reactor, and crystalliser.
for tag, x, y, z in [
    ("absorber", ABSORBER_X, ABSORBER_Y, COLUMN_TOP + 0.12),
    ("stripper", STRIPPER_X, STRIPPER_Y, COLUMN_TOP + 0.12),
    ("reactor", REACTOR_X, REACTOR_Y, REACTOR_Z + REACTOR_H / 2 + 0.12),
    ("crystalliser", CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z + CRYSTALLISER_H / 2 + 0.12),
]:
    fl.add_cyl(f"co6_{tag}_prv", (x, y, z), 0.04, 0.16, MAT["warning_red"],
               "safety_protection", MO)
# CO2 leak / O2-depletion sensors at low and head level (CO2 is heavier than air).
for i, (x, y, z) in enumerate([
    (1.0, -1.05, 0.30), (3.0, -1.05, 0.30), (5.0, -1.05, 0.30),
    (REACTOR_X, REACTOR_Y, REACTOR_Z + 0.8), (STRIPPER_X, 0.0, 3.7)]):
    fl.add_box(f"co6_co2_gas_sensor_{i}", (x, y, z), (0.09, 0.05, 0.06),
               MAT["warning_red"], "safety_protection", MO)
# Emergency stop on the control cabinet.
fl.add_cyl("co6_estop_mushroom", (5.6, 0.76, 1.30), 0.05, 0.035, MAT["safety"],
           "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("co6_estop_collar", (5.6, 0.775, 1.30), 0.066, 0.015, MAT["control"],
           "safety_protection", MO, rotation=(math.radians(90), 0, 0))
# Rupture disc + amine-spill bund wall around the tank farm.
fl.add_cyl("co6_reactor_rupture_disc", (REACTOR_X + REACTOR_R, REACTOR_Y, REACTOR_Z + 0.4),
           0.06, 0.10, MAT["warning_red"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("co6_tank_bund_wall_front", (5.25, 0.0, 0.30), (1.3, 0.04, 0.50),
           MAT["warning_red"], "safety_protection", MO)


# ═══════ Module — sensing_instrumentation: level/pressure/temp/flow/pH ══════
# Column differential-pressure + temperature on both towers.
for tag, x, y in [("absorber", ABSORBER_X, ABSORBER_Y), ("stripper", STRIPPER_X, STRIPPER_Y)]:
    fl.add_box(f"co4_{tag}_dp_transmitter", (x - COLUMN_R - 0.06, y, 2.6), (0.08, 0.06, 0.12),
               MAT["sensor"], "sensing_instrumentation", MO)
    fl.add_cyl(f"co4_{tag}_temp_probe", (x, y - COLUMN_R - 0.02, 1.4), 0.012, 0.18,
               MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"co4_{tag}_pressure_gauge", (x - COLUMN_R - 0.04, y, 1.0), 0.05, 0.025,
               MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
# Reactor pH + level + temperature.
fl.add_box("co4_reactor_ph_analyser", (REACTOR_X - REACTOR_R - 0.06, REACTOR_Y, REACTOR_Z),
           (0.08, 0.06, 0.14), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("co4_reactor_level_transmitter", (REACTOR_X + REACTOR_R + 0.04, REACTOR_Y, REACTOR_Z + 0.2),
           (0.06, 0.05, 0.12), MAT["sensor"], "sensing_instrumentation", MO)
# Tank level radars.
for tag, tx, ty in [("rich", RICH_TANK_X, RICH_TANK_Y), ("lean", LEAN_TANK_X, LEAN_TANK_Y)]:
    fl.add_cyl(f"co4_{tag}_tank_level_radar", (tx, ty, TANK_Z + TANK_H / 2 + 0.18), 0.05, 0.14,
               MAT["sensor"], "sensing_instrumentation", MO)
# Coriolis flow meters on the main amine + slurry lines.
for i, (x, y, z) in enumerate([(1.7, -0.6, 0.62), (CENTRIFUGE_X - 0.2, 0.0, 0.45),
                               (CRYSTALLISER_X, 0.0, 0.6)]):
    fl.add_box(f"co4_flow_meter_{i}", (x, y, z), (0.10, 0.08, 0.12),
               MAT["sensor"], "sensing_instrumentation", MO)
# Dryer outlet moisture analyser.
fl.add_box("co4_dryer_moisture_analyser", (DRYER_X + 0.75, DRYER_Y, DRYER_Z + 0.2),
           (0.07, 0.05, 0.10), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — actuation_kinematics: control valves + agitator drives ════
# Pneumatic control valves on key process lines.
valve_specs = [
    ("flue_gas_inlet_valve", 0.45, ABSORBER_Y, 0.75, MAT["pipe_co2"]),
    ("rich_amine_valve", 1.35, -0.6, 0.55, MAT["pipe_amine"]),
    ("lean_amine_valve", 1.7, 0.3, 1.30, MAT["pipe_amine"]),
    ("co2_to_reactor_valve", REACTOR_X, 0.0, 3.6, MAT["pipe_co2"]),
    ("slurry_valve", CENTRIFUGE_X, 0.0, 0.45, MAT["pipe_slurry"]),
    ("filtrate_valve", CRYSTALLISER_X, 0.0, 0.6, MAT["vessel_cyan"]),
]
for tag, x, y, z, mat in valve_specs:
    fl.add_box(f"co9_{tag}_body", (x, y, z), (0.10, 0.10, 0.085), MAT["valve_green"],
               "actuation_kinematics", MO)
    fl.add_cyl(f"co9_{tag}_actuator", (x, y, z + 0.10), 0.06, 0.10, MAT["ctrl_black"],
               "actuation_kinematics", MO)
# Agitator drive motors on the carbonation reactor + crystalliser.
fl.add_cyl("co9_reactor_agitator_motor", (REACTOR_X, REACTOR_Y, REACTOR_Z + REACTOR_H / 2 + 0.45),
           0.14, 0.40, MAT["motor"], "actuation_kinematics", MO)
fl.add_cyl("co9_reactor_agitator_shaft", (REACTOR_X, REACTOR_Y, REACTOR_Z),
           0.025, REACTOR_H, MAT["maint"], "actuation_kinematics", MO)
fl.add_cyl("co9_crystalliser_agitator_motor",
           (CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z + CRYSTALLISER_H / 2 + 0.40),
           0.12, 0.34, MAT["motor"], "actuation_kinematics", MO)
fl.add_cyl("co9_crystalliser_agitator_shaft", (CRYSTALLISER_X, CRYSTALLISER_Y, CRYSTALLISER_Z),
           0.022, CRYSTALLISER_H, MAT["maint"], "actuation_kinematics", MO)
# Centrifuge drive motor.
fl.add_cyl("co9_centrifuge_drive_motor", (CENTRIFUGE_X + 0.6, CENTRIFUGE_Y, CENTRIFUGE_Z),
           0.13, 0.30, MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — maintenance_serviceability: ladder, drains, eyes, spares ══
# ── CAGED VERTICAL ACCESS LADDER from skid deck UP to the column platform ────
# The platform is a SECOND LEVEL (grating top at z=2.05) — so the access route
# MUST be visible (Tristan). This is a caged fixed ladder on the -Y face,
# aligned under the platform's left bay, with the stiles continuing ~0.9 m above
# the landing (standard step-off), a step-through landing onto the platform, and
# a hooped safety cage. Rendered in the maintenance accent so the access route
# pops against the steel frame.
LAD_X = 0.62                       # ladder centreline (under platform left bay)
LAD_Y = -1.16                      # just in front of the skid front rail (y=-1.12)
LAD_W = 0.24                       # stile gauge
LAD_FOOT = 0.20                    # bottom rung ~ skid deck
LAD_LAND = 2.05                    # landing = platform grating top
LAD_TOP = LAD_LAND + 0.90          # stiles continue above the landing
lad_mid = (LAD_FOOT + LAD_TOP) / 2.0
lad_h = LAD_TOP - LAD_FOOT
# Two side stiles (thicker so they read).
for sx in (LAD_X - LAD_W / 2, LAD_X + LAD_W / 2):
    fl.add_cyl(f"co10_ladder_stile_{sx:.2f}", (sx, LAD_Y, lad_mid), 0.022, lad_h,
               MAT["maint"], "maintenance_serviceability", MO)
# Rungs every ~0.28 m from deck to landing.
n_rungs = int((LAD_LAND - LAD_FOOT) / 0.28) + 1
for i in range(n_rungs):
    z = LAD_FOOT + i * 0.28
    fl.add_cyl(f"co10_ladder_rung_{i}", (LAD_X, LAD_Y, z), 0.016, LAD_W,
               MAT["maint"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
# Hooped safety CAGE — tidy concentric hoops (centred on the ladder line) from
# ~1.0 m up to the landing, tied by longitudinal stringers so it reads as a
# proper cylindrical cage, not loose loops. Radius just clears the rungs.
cage_r = 0.24
cage_cy = LAD_Y - 0.10          # hoop centre just outboard of the rungs
cage_hoop_z = [1.00, 1.35, 1.70, 2.05]
for i, z in enumerate(cage_hoop_z):
    fl.add_torus(f"co10_ladder_cage_hoop_{i}", (LAD_X, cage_cy, z), cage_r, 0.012,
                 MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Five cage stringers around the outboard semicircle tying the hoops vertically.
for j, ang in enumerate([-70, -35, 0, 35, 70]):
    sx = LAD_X + cage_r * math.sin(math.radians(ang))
    sy = cage_cy - cage_r * math.cos(math.radians(ang))
    fl.add_cyl(f"co10_ladder_cage_stringer_{j}", (sx, sy, (1.00 + 2.05) / 2), 0.009, 2.05 - 1.00,
               MAT["maint"], "maintenance_serviceability", MO)
# Step-through LANDING — a clear grated walk-on bridging the ladder top to the
# platform front edge (ladder face y=-1.16 → platform front edge y=-1.0). Made
# chunky + overlapping the platform so the route ladder→platform is unmistakable.
fl.add_box("co10_ladder_landing_plate", (LAD_X, -1.03, LAD_LAND + 0.02), (LAD_W + 0.20, 0.42, 0.05),
           MAT["maint"], "maintenance_serviceability", MO)
# Grab rails flanking the step-through (the gap in the platform handrail).
for sx in (LAD_X - LAD_W / 2 - 0.05, LAD_X + LAD_W / 2 + 0.05):
    fl.add_cyl(f"co10_ladder_gate_post_{sx:.2f}", (sx, -1.02, LAD_LAND + 0.48), 0.018, 0.96,
               MAT["maint"], "maintenance_serviceability", MO)
# Short top hand-hold hoop the operator grabs stepping off the ladder.
fl.add_torus("co10_ladder_stepoff_hoop", (LAD_X, -0.92, LAD_LAND + 0.95), 0.18, 0.014,
             MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Manual drain valves at the base of each vessel.
for i, (x, y) in enumerate([
    (ABSORBER_X, ABSORBER_Y), (STRIPPER_X, STRIPPER_Y), (REACTOR_X, REACTOR_Y),
    (CRYSTALLISER_X, CRYSTALLISER_Y), (RICH_TANK_X, RICH_TANK_Y), (LEAN_TANK_X, LEAN_TANK_Y)]):
    fl.add_cyl(f"co10_drain_valve_{i}", (x, y - 0.20, 0.22), 0.030, 0.07, MAT["maint"],
               "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Lifting eyes on column + reactor heads for crane maintenance.
for i, (x, y, z) in enumerate([(ABSORBER_X, ABSORBER_Y, COLUMN_TOP + 0.28),
                               (STRIPPER_X, STRIPPER_Y, COLUMN_TOP + 0.28),
                               (REACTOR_X, REACTOR_Y, REACTOR_Z + REACTOR_H / 2 + 0.30)]):
    fl.add_torus(f"co10_lifting_eye_{i}", (x, y, z), 0.05, 0.012, MAT["maint"],
                 "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
# Spare filter-cloth cartridge + tool tray on the walkway.
fl.add_box("co10_spare_filter_cartridge", (4.6, -0.85, 0.40), (0.18, 0.18, 0.40),
           MAT["white_label"], "maintenance_serviceability", MO)
fl.add_box("co10_tool_tray", (2.6, -1.02, 0.40), (0.50, 0.18, 0.06),
           MAT["maint"], "maintenance_serviceability", MO)


# ═══════ Module — hmi_ergonomics: HMI screen, buttons, status beacon ════════
fl.add_box("co3_hmi_bezel", (5.6, 0.78, 1.05), (0.32, 0.018, 0.24),
           MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("co3_hmi_screen", (5.6, 0.77, 1.05), (0.27, 0.006, 0.18),
           MAT["hmi"], "hmi_ergonomics", MO)
for i, (x, mat) in enumerate([(5.50, MAT["sensor"]), (5.60, MAT["control"]), (5.70, MAT["safety"])]):
    fl.add_cyl(f"co3_operator_button_{i}", (x, 0.77, 0.78), 0.02, 0.014, mat,
               "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for i, mat in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"co3_status_beacon_{i}", (5.6, 0.95, 1.70 + i * 0.06), 0.035, 0.05, mat,
               "hmi_ergonomics", MO)
fl.add_cyl("co3_beacon_base", (5.6, 0.95, 1.66), 0.040, 0.025, MAT["powerdist"],
           "hmi_ergonomics", MO)
fl.add_box("co3_front_instruction_placard", (5.35, 0.77, 0.35), (0.18, 0.006, 0.10),
           MAT["white_label"], "hmi_ergonomics", MO)


fl.add_lights(target_centre=(W / 2, 0, H / 2), fill_energy=240, fill_size=14)
fl.make_world_white()
# hero_open_frame=True: this is an OPEN transportable SKID (field-erected
# columns on a structural steel frame), NOT an enclosed/glass container — paint
# the frame SOLID steel in the hero so it reads as braced open steelwork on a
# skid deck, not a translucent shipping box with a floating floor.
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment",
                       hero_open_frame=True)
