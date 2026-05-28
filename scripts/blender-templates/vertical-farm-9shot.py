"""vertical-farm-9shot.py — containerised 100 m² leafy-greens vertical farm.

Models the BRIEF's actual product (baseline-10/07-vertical-farm.md):
  • a 40-foot HIGH-CUBE ISO container shell — 12.192 × 2.438 × 2.896 m —
    with rear access doors (the dominant object; the scene reads as a
    shipping container, NOT a free-standing rack);
  • 8 mobile trolleys rolled in along the container length, each with 5
    vertical growing tiers (≈2.5 × 1.0 m trays) → 8 × 5 = 40 trays = 100 m²;
  • an EXTERNAL vertigation skid (3.5 × 1.8 × 2.2 m) on an adjacent
    hardstand, connected by a 4-line hose bundle.

The previous template modelled a generic 4×2×3 m rack and tagged objects with
the CANONICAL function taxonomy (energy_conversion_transduction, etc.). The VF
design's modules are DOMAIN ids, so 11 of 12 module-<id>.png renders found no
match in the PDF renderer and fell back to the hero image. This rewrite tags
every object with the 12 DOMAIN module ids the VF design actually uses, so a
real per-module image renders for each module.

forge_blender_lib already carries the per-module best-view camera logic
(committed e75345690 / 2026-05-28); it frames each module from its own bbox, so
correct tagging is all that is needed — the cameras follow.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P vertical-farm-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-vertical-farm-9shot")))

# ─── 40-foot High-Cube ISO container envelope (ISO 668:2020 / ISO 1496-1) ──
# Brief: 12,192 × 2,438 × 2,896 mm. Wall thickness ~40 mm; the interior the
# trolleys + skid feed runs are sized into is the inner clear envelope.
L = 12.192          # length (X)  — door end at +X, blank end at -X
W = 2.438           # width  (Y)  — back wall at -Y, front access at +Y
H = 2.896           # height (Z)  — high-cube
WALL = 0.04         # wall / floor / roof thickness
IN_X0 = WALL
IN_X1 = L - WALL
IN_W = W - 2 * WALL          # interior clear width (≈2.358 m)
IN_H = H - 2 * WALL          # interior clear height

# Trolley layout: 8 trolleys rolled in along the length, against the back
# wall, leaving a worker walkway on the front (+Y) side. Each trolley carries
# 5 tiers of 2.5 × 1.0 m trays. The container's running length is shared
# between a rear door bay (harvest / wash zone at +X) and the trolley run.
TROLLEY_COUNT = 8
TIERS_PER_TROLLEY = 5
TRAY_L = 1.00       # tray runs across the container width direction-ish; the
TRAY_W = 0.95       # 2.5 × 1.0 m tray is laid with its 2.5 m span along X
TRAY_SPAN_X = 2.40  # usable 2.5 m tray footprint along the length (per trolley)
DOOR_BAY_X0 = 9.95  # rear door / harvest bay begins here (+X end)
TROLLEY_RUN_X0 = 0.45
TROLLEY_RUN_X1 = DOOR_BAY_X0 - 0.15   # trolleys occupy this length band
TROLLEY_PITCH = (TROLLEY_RUN_X1 - TROLLEY_RUN_X0) / TROLLEY_COUNT
TIER_Z = [0.42, 0.92, 1.42, 1.92, 2.42]   # 5 tier heights
TROLLEY_DEPTH_Y = 1.05                      # trolley depth across Y
TROLLEY_Y = -W / 2 + WALL + TROLLEY_DEPTH_Y / 2 + 0.04   # against back wall
AISLE_Y = +W / 2 - 0.45                                  # front walkway centre

# External vertigation skid (3.5 × 1.8 × 2.2 m) on a hardstand off the +X
# door end, set clear of the container so it reads as a separate unit.
SKID_L = 3.50
SKID_W = 1.80
SKID_H = 2.20
SKID_CX = L + 0.10 + SKID_W / 2        # placed off the rear-door (+X) end,
SKID_CY = -W / 2 + SKID_W / 2 - 0.20   # rotated so its 3.5 m runs along Y
SKID_Z0 = 0.0

# The 12 DOMAIN module ids the VF design uses (state.json moduleDecomposition).
# These MUST match verbatim so the PDF renderer finds module-<id>.png for each.
MO = fl.make_module_dict([
    "growing_canopy",
    "lighting_array",
    "climate_control",
    "irrigation_nutrient",
    "automation_sensing",
    "electrical_distribution",
    "data_compute_communication",
    "structure_containment",
    "worker_access_safety",
    "harvest_handling",
    "regulatory_compliance",
    "effluent_treatment",
])

# ─── Materials ─────────────────────────────────────────────────────────────
MAT = fl.make_default_palette()
MAT["container_steel"] = fl.make_mat("m_container_steel", (0.42, 0.55, 0.62), metallic=0.55, roughness=0.42)
MAT["floor_alu"]       = fl.make_mat("m_floor_alu",       (0.78, 0.80, 0.82), metallic=0.3, roughness=0.55)
MAT["door_steel"]      = fl.make_mat("m_door_steel",      (0.36, 0.48, 0.56), metallic=0.55, roughness=0.40)
MAT["trolley_frame"]   = fl.make_mat("m_trolley_frame",   (0.82, 0.84, 0.86), metallic=0.65, roughness=0.32)
MAT["castor"]          = fl.make_mat("m_castor",          (0.06, 0.07, 0.10), metallic=0.2, roughness=0.55)
MAT["tray_steel"]      = fl.make_mat("m_tray_steel",      (0.80, 0.82, 0.85), metallic=0.6, roughness=0.32)
MAT["crop_leaf"]       = fl.make_mat("m_crop_leaf",       (0.05, 0.55, 0.10), metallic=0.0, roughness=0.62)
MAT["led_board"]       = fl.make_mat("m_led_board",       (0.04, 0.05, 0.08), metallic=0.2, roughness=0.45)
MAT["led_bar"]         = fl.make_mat("m_led_bar",         (1.00, 0.92, 0.30), metallic=0.0, roughness=0.30, emission_strength=1.4)
MAT["led_driver"]      = fl.make_mat("m_led_driver",      (0.72, 0.55, 0.05), metallic=0.1, roughness=0.45)
MAT["hvac"]            = fl.make_mat("m_hvac",            (0.00, 0.80, 0.95), metallic=0.25, roughness=0.36)
MAT["duct"]            = fl.make_mat("m_duct",            (0.55, 0.78, 0.88), metallic=0.25, roughness=0.40)
MAT["co2_tank"]        = fl.make_mat("m_co2_tank",        (0.85, 0.86, 0.88), metallic=0.6, roughness=0.30)
MAT["pipe_supply"]     = fl.make_mat("m_pipe_supply",     (0.10, 0.40, 0.85), metallic=0.2, roughness=0.36)
MAT["pipe_return"]     = fl.make_mat("m_pipe_return",     (0.00, 0.72, 0.85), metallic=0.2, roughness=0.36)
MAT["nutrient"]        = fl.make_mat("m_nutrient",        (0.00, 0.55, 1.00), metallic=0.1, roughness=0.30, alpha=0.78)
MAT["valve"]           = fl.make_mat("m_valve",           (1.00, 0.85, 0.00), metallic=0.05, roughness=0.42)
MAT["sensor"]          = fl.make_mat("m_sensor",          (0.00, 0.92, 0.10), metallic=0.0, roughness=0.5)
MAT["plc"]             = fl.make_mat("m_plc",             (1.00, 0.55, 0.00), metallic=0.15, roughness=0.45)
MAT["panel"]           = fl.make_mat("m_panel",           (0.18, 0.20, 0.24), metallic=0.5, roughness=0.5)
MAT["conduit"]         = fl.make_mat("m_conduit",         (0.30, 0.32, 0.36), metallic=0.4, roughness=0.5)
MAT["ipc"]             = fl.make_mat("m_ipc",             (0.05, 0.42, 1.00), metallic=0.1, roughness=0.40)
MAT["screen_glow"]     = fl.make_mat("m_screen_glow",     (0.05, 0.55, 1.00), metallic=0.0, roughness=0.20, emission_strength=1.2)
MAT["estop"]           = fl.make_mat("m_estop",           (1.00, 0.00, 0.00), metallic=0.0, roughness=0.45)
MAT["signage"]         = fl.make_mat("m_signage",         (1.00, 0.78, 0.00), metallic=0.0, roughness=0.5)
MAT["fire_head"]       = fl.make_mat("m_fire_head",       (0.90, 0.05, 0.05), metallic=0.1, roughness=0.45)
MAT["uvc"]             = fl.make_mat("m_uvc",             (0.55, 0.35, 1.00), metallic=0.1, roughness=0.35, emission_strength=1.0)
MAT["bench"]           = fl.make_mat("m_bench",           (0.82, 0.84, 0.86), metallic=0.5, roughness=0.35)
MAT["washbasin"]       = fl.make_mat("m_washbasin",       (0.88, 0.90, 0.92), metallic=0.5, roughness=0.30)
MAT["qr_plate"]        = fl.make_mat("m_qr_plate",        (0.96, 0.96, 0.96), metallic=0.0, roughness=0.5)
MAT["skid_frame"]      = fl.make_mat("m_skid_frame",      (1.00, 0.45, 0.00), metallic=0.3, roughness=0.45)
MAT["ro_vessel"]       = fl.make_mat("m_ro_vessel",       (0.45, 0.70, 0.95), metallic=0.2, roughness=0.40)
MAT["filter_housing"]  = fl.make_mat("m_filter_housing",  (0.70, 0.74, 0.80), metallic=0.4, roughness=0.40)
MAT["uv_reactor"]      = fl.make_mat("m_uv_reactor",      (0.40, 0.30, 0.85), metallic=0.3, roughness=0.35)
MAT["hose"]            = fl.make_mat("m_hose",            (0.10, 0.12, 0.16), metallic=0.1, roughness=0.6)


# ═══════ Module — structure_containment ═════════════════════════════════════
# The dominant object: the 40-foot high-cube ISO container shell. Floor, roof,
# back wall, blank front-lower band (to leave the interior visible), two ends —
# the +X end is the rear DOOR end (modelled in worker_access_safety/harvest as
# the access route), the -X end is the blank end. Corrugated-look ribs add the
# unmistakable shipping-container read.
fl.add_box("struct_floor", (L / 2, 0, WALL / 2),
           (L, W, WALL), MAT["floor_alu"], "structure_containment", MO)
fl.add_box("struct_roof", (L / 2, 0, H - WALL / 2),
           (L, W, WALL), MAT["container_steel"], "structure_containment", MO)
fl.add_box("struct_back_wall", (L / 2, -W / 2 + WALL / 2, H / 2),
           (L, WALL, H), MAT["container_steel"], "structure_containment", MO)
fl.add_box("struct_end_blank", (WALL / 2, 0, H / 2),
           (WALL, W, H), MAT["container_steel"], "structure_containment", MO)
# Front (+Y) side: a low sill band + roof rail only, so the interior trolleys
# are visible from the front three-quarter hero view.
fl.add_box("struct_front_sill", (L / 2, +W / 2 - WALL / 2, 0.18),
           (L, WALL, 0.36), MAT["container_steel"], "structure_containment", MO)
fl.add_box("struct_front_header", (L / 2, +W / 2 - WALL / 2, H - 0.18),
           (L, WALL, 0.36), MAT["container_steel"], "structure_containment", MO)
# Corner castings (the four iconic ISO corner blocks) + corner posts.
for cxn in (WALL, L - WALL):
    for cyn in (-W / 2 + 0.08, W / 2 - 0.08):
        fl.add_box(f"struct_post_{cxn:.2f}_{cyn:.2f}", (cxn, cyn, H / 2),
                   (0.10, 0.10, H), MAT["container_steel"], "structure_containment", MO)
        for czn in (0.07, H - 0.07):
            fl.add_box(f"struct_corner_{cxn:.2f}_{cyn:.2f}_{czn:.2f}", (cxn, cyn, czn),
                       (0.18, 0.18, 0.14), MAT["door_steel"], "structure_containment", MO)
# Corrugation ribs on the back wall — vertical pilasters that make it read as a
# shipping container rather than a smooth box.
for i in range(24):
    rx = 0.30 + i * (L - 0.6) / 23
    fl.add_box(f"struct_rib_back_{i}", (rx, -W / 2 + WALL + 0.02, H / 2),
               (0.06, 0.05, H - 0.4), MAT["door_steel"], "structure_containment", MO)


# ═══════ Module — growing_canopy ════════════════════════════════════════════
# 8 mobile trolleys, each 5 tiers of 2.5 × 1.0 m trays of leafy-green canopy.
# 8 × 5 = 40 trays = 100 m². Trolleys run along the length against the back
# wall, on lockable industrial castors (rolled in/out via the rear doors).
for t in range(TROLLEY_COUNT):
    tx = TROLLEY_RUN_X0 + TROLLEY_PITCH * (t + 0.5)
    # Trolley uprights (4 corner posts of the mobile frame)
    for dxs in (-TRAY_SPAN_X / 2 + 0.06, TRAY_SPAN_X / 2 - 0.06):
        for dys in (-TROLLEY_DEPTH_Y / 2 + 0.05, TROLLEY_DEPTH_Y / 2 - 0.05):
            fl.add_box(f"trolley{t}_post_{dxs:.2f}_{dys:.2f}",
                       (tx + dxs, TROLLEY_Y + dys, (TIER_Z[0] + TIER_Z[-1]) / 2),
                       (0.05, 0.05, TIER_Z[-1] - TIER_Z[0] + 0.5),
                       MAT["trolley_frame"], "growing_canopy", MO)
    # Lockable industrial castors (4 per trolley)
    for dxs in (-TRAY_SPAN_X / 2 + 0.10, TRAY_SPAN_X / 2 - 0.10):
        for dys in (-TROLLEY_DEPTH_Y / 2 + 0.08, TROLLEY_DEPTH_Y / 2 - 0.08):
            fl.add_cyl(f"trolley{t}_castor_{dxs:.2f}_{dys:.2f}",
                       (tx + dxs, TROLLEY_Y + dys, 0.06), 0.05, 0.10,
                       MAT["castor"], "growing_canopy", MO,
                       rotation=(math.radians(90), 0, 0))
    # 5 tiers of trays + canopy
    for k, z in enumerate(TIER_Z):
        fl.add_box(f"trolley{t}_tray_{k}", (tx, TROLLEY_Y, z),
                   (TRAY_SPAN_X, TROLLEY_DEPTH_Y - 0.06, 0.05),
                   MAT["tray_steel"], "growing_canopy", MO)
        fl.add_box(f"trolley{t}_canopy_{k}", (tx, TROLLEY_Y, z + 0.07),
                   (TRAY_SPAN_X - 0.14, TROLLEY_DEPTH_Y - 0.18, 0.075),
                   MAT["crop_leaf"], "growing_canopy", MO)
# Seedling propagation rack (dedicated, smaller) at the blank (-X) end.
for k, z in enumerate([0.55, 0.95, 1.35]):
    fl.add_box(f"propagation_tray_{k}", (0.42, TROLLEY_Y, z),
               (0.55, TROLLEY_DEPTH_Y - 0.10, 0.045), MAT["tray_steel"], "growing_canopy", MO)
    fl.add_box(f"propagation_canopy_{k}", (0.42, TROLLEY_Y, z + 0.05),
               (0.45, TROLLEY_DEPTH_Y - 0.22, 0.045), MAT["crop_leaf"], "growing_canopy", MO)


# ═══════ Module — lighting_array ════════════════════════════════════════════
# Tunable-spectrum horticultural LED bars above each tier (80 bars across the
# 40 trays — 2 bars per tray here for visual density), + driver enclosures.
for t in range(TROLLEY_COUNT):
    tx = TROLLEY_RUN_X0 + TROLLEY_PITCH * (t + 0.5)
    for k, z in enumerate(TIER_Z):
        led_z = z + 0.30
        fl.add_box(f"led_board_{t}_{k}", (tx, TROLLEY_Y, led_z),
                   (TRAY_SPAN_X - 0.10, TROLLEY_DEPTH_Y - 0.20, 0.02),
                   MAT["led_board"], "lighting_array", MO)
        for j, dyb in enumerate([-0.22, 0.22]):
            fl.add_box(f"led_bar_{t}_{k}_{j}", (tx, TROLLEY_Y + dyb, led_z - 0.02),
                       (TRAY_SPAN_X - 0.20, 0.05, 0.012),
                       MAT["led_bar"], "lighting_array", MO)
# LED driver bank + DALI distribution box on the back wall (lighting_distribution)
for i, z in enumerate([0.85, 1.45, 2.05]):
    fl.add_box(f"led_driver_bank_{i}", (TROLLEY_RUN_X1 + 0.05, -W / 2 + WALL + 0.10, z),
               (0.35, 0.14, 0.18), MAT["led_driver"], "lighting_array", MO)
fl.add_box("dali_distribution_box", (TROLLEY_RUN_X1 + 0.05, -W / 2 + WALL + 0.10, 2.55),
           (0.30, 0.16, 0.22), MAT["led_driver"], "lighting_array", MO)


# ═══════ Module — climate_control ═══════════════════════════════════════════
# In-container DX HVAC + dehumidifier + CO2 dosing, ceiling/wall-mounted at the
# blank (-X) end above the propagation rack, plus a supply duct run along the
# roof. (29.5 kW DX cooling, COP 3.18; 19.9 kg/h dehumidifier; CO2 from 50 kg
# bulk tank — state.json.)
fl.add_box("hvac_dx_unit", (1.35, 0, H - 0.40),
           (1.5, W - 0.30, 0.55), MAT["hvac"], "climate_control", MO)
fl.add_box("hvac_reheat_coil", (1.35, +W / 2 - 0.30, H - 0.40),
           (1.4, 0.10, 0.45), MAT["duct"], "climate_control", MO)
fl.add_box("dehumidifier", (2.55, -W / 2 + WALL + 0.25, 0.55),
           (0.55, 0.45, 1.00), MAT["hvac"], "climate_control", MO)
# CO2 dosing: 50 kg bulk tank (vertical cylinder) + injection line
fl.add_cyl("co2_bulk_tank", (1.05, +W / 2 - 0.30, 0.85),
           0.22, 1.55, MAT["co2_tank"], "climate_control", MO)
fl.add_box("co2_dosing_valve", (1.05, +W / 2 - 0.30, 1.70),
           (0.18, 0.16, 0.14), MAT["valve"], "climate_control", MO)
# Chilled-water coil pump skid for the air-circulation loop
fl.add_box("air_circulation_fan", (1.35, -W / 2 + WALL + 0.30, H - 0.40),
           (0.45, 0.40, 0.45), MAT["duct"], "climate_control", MO)
# Roof supply + return ducts running the trolley length
fl.add_box("supply_duct", (5.5, +W / 2 - 0.35, H - 0.22),
           (8.0, 0.22, 0.20), MAT["duct"], "climate_control", MO)
fl.add_box("return_duct", (5.5, -W / 2 + WALL + 0.35, H - 0.22),
           (8.0, 0.22, 0.20), MAT["duct"], "climate_control", MO)
for j, dx in enumerate([3.0, 5.0, 7.0, 9.0]):
    fl.add_cyl(f"supply_diffuser_{j}", (dx, +W / 2 - 0.35, H - 0.34),
               0.07, 0.10, MAT["hvac"], "climate_control", MO)
# Freeze-protection trace heater band on the supply duct
fl.add_box("freeze_protection_trace", (5.5, +W / 2 - 0.35, H - 0.32),
           (7.8, 0.03, 0.03), MAT["hvac"], "climate_control", MO)


# ═══════ Module — irrigation_nutrient ═══════════════════════════════════════
# In-container fertigation DISTRIBUTION only — manifolds, valves, return
# collection running along the trolleys. (The nutrient CHEMISTRY/tanks live on
# the external skid, tagged below.) Plus an in-container buffer/recirculation
# header and the dosing-pump manifold feed point.
fl.add_cyl("fertigation_supply_header", (5.4, -W / 2 + WALL + 0.20, 2.55),
           0.035, 9.2, MAT["pipe_supply"], "irrigation_nutrient", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("fertigation_return_header", (5.4, -W / 2 + WALL + 0.30, 0.18),
           0.035, 9.2, MAT["pipe_return"], "irrigation_nutrient", MO,
           rotation=(0, math.radians(90), 0))
# Per-trolley feed drop + return + isolation valve
for t in range(TROLLEY_COUNT):
    tx = TROLLEY_RUN_X0 + TROLLEY_PITCH * (t + 0.5)
    fl.add_cyl(f"feed_drop_{t}", (tx - 0.30, -W / 2 + WALL + 0.20, 1.40),
               0.018, 2.30, MAT["pipe_supply"], "irrigation_nutrient", MO)
    fl.add_box(f"feed_valve_{t}", (tx - 0.30, -W / 2 + WALL + 0.22, 0.55),
               (0.09, 0.08, 0.08), MAT["valve"], "irrigation_nutrient", MO)
    # tier feed manifolds along each tray
    for k, z in enumerate(TIER_Z):
        fl.add_cyl(f"tier_manifold_{t}_{k}", (tx, TROLLEY_Y - TROLLEY_DEPTH_Y / 2 + 0.04, z + 0.06),
                   0.010, TRAY_SPAN_X - 0.10, MAT["pipe_supply"], "irrigation_nutrient", MO,
                   rotation=(0, math.radians(90), 0))
# In-container recirculation buffer header + aeration line (aeration_system)
fl.add_box("recirc_buffer_header", (9.3, -W / 2 + WALL + 0.25, 0.40),
           (0.30, 0.35, 0.60), MAT["nutrient"], "irrigation_nutrient", MO)
fl.add_cyl("aeration_line", (9.3, -W / 2 + WALL + 0.45, 0.40),
           0.012, 0.55, MAT["pipe_supply"], "irrigation_nutrient", MO)


# ═══════ Module — automation_sensing ════════════════════════════════════════
# Per-tier environmental sensor stack (temp / RH / CO2 / PAR) + water-chemistry
# sensors on the recirculation return + an in-container control/PLC enclosure.
for t in range(TROLLEY_COUNT):
    tx = TROLLEY_RUN_X0 + TROLLEY_PITCH * (t + 0.5)
    for k, z in enumerate(TIER_Z):
        fl.add_box(f"env_sensor_{t}_{k}", (tx + TRAY_SPAN_X / 2 - 0.08, TROLLEY_Y + TROLLEY_DEPTH_Y / 2 - 0.06, z + 0.12),
                   (0.07, 0.05, 0.05), MAT["sensor"], "automation_sensing", MO)
# Water-chemistry sensor cluster on the recirculation return header
for j, dz in enumerate([0.10, 0.22, 0.34]):
    fl.add_box(f"water_chem_sensor_{j}", (9.55, -W / 2 + WALL + 0.30, 0.18 + dz),
               (0.06, 0.05, 0.06), MAT["sensor"], "automation_sensing", MO)
# Control / PLC enclosure (sensor read + actuator dispatch + recipe execution)
fl.add_box("control_plc_enclosure", (DOOR_BAY_X0 + 0.15, -W / 2 + WALL + 0.22, 1.35),
           (0.40, 0.32, 0.85), MAT["plc"], "automation_sensing", MO)
fl.add_box("plc_din_rail", (DOOR_BAY_X0 + 0.15, -W / 2 + WALL + 0.06, 1.35),
           (0.30, 0.04, 0.70), MAT["panel"], "automation_sensing", MO)


# ═══════ Module — electrical_distribution ═══════════════════════════════════
# Wall-mounted main distribution panel (TP&N MCCB enclosure, 44 kW) + branch
# circuit conduit + insulation monitor. (30.3 kW at 400 V 3-phase — state.json.)
fl.add_box("main_distribution_panel", (DOOR_BAY_X0 + 0.55, -W / 2 + WALL + 0.20, 1.45),
           (0.45, 0.28, 1.30), MAT["panel"], "electrical_distribution", MO)
fl.add_box("mccb_door", (DOOR_BAY_X0 + 0.55, -W / 2 + WALL + 0.06, 1.45),
           (0.38, 0.03, 1.18), MAT["conduit"], "electrical_distribution", MO)
fl.add_box("insulation_monitor", (DOOR_BAY_X0 + 0.55, -W / 2 + WALL + 0.06, 2.20),
           (0.16, 0.05, 0.16), MAT["panel"], "electrical_distribution", MO)
# Branch-circuit conduit trunking along the back wall feeding lighting + HVAC
fl.add_box("branch_conduit_trunk", (5.2, -W / 2 + WALL + 0.06, 2.72),
           (9.3, 0.06, 0.08), MAT["conduit"], "electrical_distribution", MO)
for j, dx in enumerate([2.0, 4.0, 6.0, 8.0]):
    fl.add_box(f"branch_dropper_{j}", (dx, -W / 2 + WALL + 0.06, 2.30),
               (0.05, 0.05, 0.78), MAT["conduit"], "electrical_distribution", MO)


# ═══════ Module — data_compute_communication ═══════════════════════════════
# Industrial PC / edge controller + networking box near the control panel.
fl.add_box("edge_industrial_pc", (DOOR_BAY_X0 + 0.15, -W / 2 + WALL + 0.22, 2.05),
           (0.34, 0.30, 0.30), MAT["ipc"], "data_compute_communication", MO)
fl.add_box("edge_pc_screen", (DOOR_BAY_X0 + 0.15, -W / 2 + WALL + 0.07, 2.05),
           (0.24, 0.02, 0.18), MAT["screen_glow"], "data_compute_communication", MO)
fl.add_box("network_switch", (DOOR_BAY_X0 + 0.15, -W / 2 + WALL + 0.22, 2.40),
           (0.30, 0.20, 0.10), MAT["ipc"], "data_compute_communication", MO)
fl.add_cyl("cellular_antenna", (DOOR_BAY_X0 + 0.15, -W / 2 + WALL + 0.10, 2.62),
           0.012, 0.22, MAT["antenna"], "data_compute_communication", MO)


# ═══════ Module — worker_access_safety ══════════════════════════════════════
# The access route / aisle (a floor walkway strip on the front side), the rear
# DOOR leaves (the harvest-cycling access), E-stop + signage at the doors,
# fire-detection heads, and the UV-C sterilisation lamps (8 lamps).
fl.add_box("worker_walkway", (5.5, AISLE_Y, WALL + 0.005),
           (9.6, 0.55, 0.01), MAT["signage"], "worker_access_safety", MO)
# Rear access door leaves at the +X end (the personnel + harvest access)
fl.add_box("rear_door_left", (L - WALL / 2, -W / 4, H / 2),
           (WALL, W / 2 - 0.02, H - 0.10), MAT["door_steel"], "worker_access_safety", MO)
fl.add_box("rear_door_right", (L - WALL / 2, +W / 4, H / 2),
           (WALL, W / 2 - 0.02, H - 0.10), MAT["door_steel"], "worker_access_safety", MO)
for dyh, lbl in [(-0.40, "L"), (0.40, "R")]:
    fl.add_box(f"door_locking_bar_{lbl}", (L + 0.01, dyh, H / 2),
               (0.04, 0.05, H - 0.4), MAT["conduit"], "worker_access_safety", MO)
# E-stop at the door + hazard/escape signage
fl.add_cyl("door_estop", (DOOR_BAY_X0 + 0.05, +W / 2 - 0.20, 1.35),
           0.05, 0.04, MAT["estop"], "worker_access_safety", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("hazard_signage", (DOOR_BAY_X0 + 0.05, +W / 2 - 0.06, 1.70),
           (0.22, 0.03, 0.16), MAT["signage"], "worker_access_safety", MO)
fl.add_box("uvc_warning_signage", (DOOR_BAY_X0 + 0.05, +W / 2 - 0.06, 1.95),
           (0.22, 0.03, 0.12), MAT["signage"], "worker_access_safety", MO)
# Fire-detection heads (BS 5839) along the roof
for j, dx in enumerate([2.2, 5.2, 8.2, 10.6]):
    fl.add_cyl(f"fire_detection_head_{j}", (dx, 0.10, H - WALL - 0.04),
               0.06, 0.05, MAT["fire_head"], "worker_access_safety", MO)
# 8 UV-C sterilisation lamps along the canopy (4-log Botrytis dose, off-cycle)
for j in range(8):
    ux = TROLLEY_RUN_X0 + TROLLEY_PITCH * (j + 0.5)
    fl.add_cyl(f"uvc_lamp_{j}", (ux, AISLE_Y - 0.05, H - 0.45),
               0.025, 0.85, MAT["uvc"], "worker_access_safety", MO,
               rotation=(0, math.radians(90), 0))


# ═══════ Module — harvest_handling ══════════════════════════════════════════
# Sorting / packing bench + hand-wash station near the rear doors (the wet/
# clean food-handling zone inside the door bay).
fl.add_box("sorting_packing_bench", (DOOR_BAY_X0 + 1.15, +W / 2 - 0.45, 0.85),
           (1.6, 0.70, 0.05), MAT["bench"], "harvest_handling", MO)
for dxs in (-0.7, 0.7):
    for dys in (-0.30, 0.30):
        fl.add_box(f"bench_leg_{dxs:.1f}_{dys:.1f}",
                   (DOOR_BAY_X0 + 1.15 + dxs, +W / 2 - 0.45 + dys, 0.42),
                   (0.05, 0.05, 0.82), MAT["bench"], "harvest_handling", MO)
fl.add_box("bench_undershelf", (DOOR_BAY_X0 + 1.15, +W / 2 - 0.45, 0.30),
           (1.5, 0.60, 0.03), MAT["bench"], "harvest_handling", MO)
# Knee-operated hand-wash station (BRCGS) at the worker entry
fl.add_box("hand_wash_station", (DOOR_BAY_X0 + 0.25, +W / 2 - 0.30, 0.55),
           (0.45, 0.45, 0.45), MAT["washbasin"], "harvest_handling", MO)
fl.add_box("hand_wash_basin", (DOOR_BAY_X0 + 0.25, +W / 2 - 0.30, 0.80),
           (0.40, 0.40, 0.10), MAT["washbasin"], "harvest_handling", MO)
fl.add_cyl("hand_wash_tap", (DOOR_BAY_X0 + 0.25, +W / 2 - 0.45, 0.92),
           0.015, 0.18, MAT["bench"], "harvest_handling", MO)


# ═══════ Module — regulatory_compliance ═════════════════════════════════════
# A rating / certification plate + a per-tray QR-traceability plate on the
# container exterior (small, near the door end). Kept deliberately small but
# with real extent so the per-module camera frames it.
fl.add_box("rating_plate", (L - WALL - 0.02, -W / 2 + 0.45, 1.55),
           (0.06, 0.28, 0.20), MAT["qr_plate"], "regulatory_compliance", MO)
fl.add_box("certification_label", (L - WALL - 0.02, -W / 2 + 0.45, 1.30),
           (0.05, 0.24, 0.16), MAT["qr_plate"], "regulatory_compliance", MO)
fl.add_box("traceability_qr_plate", (DOOR_BAY_X0 + 0.05, +W / 2 - 0.06, 0.95),
           (0.18, 0.03, 0.18), MAT["qr_plate"], "regulatory_compliance", MO)


# ═══════ Module — effluent_treatment ════════════════════════════════════════
# Drainage filtration + inline UV recirculation steriliser. Placed at the door
# (+X) end as an in-container adjunct to the recirculation return, plus a UV
# reactor barrel. (476 kg/day water through the loop — state.json.)
fl.add_box("drainage_filtration_housing", (DOOR_BAY_X0 + 1.85, -W / 2 + WALL + 0.25, 0.55),
           (0.40, 0.40, 0.95), MAT["filter_housing"], "effluent_treatment", MO)
fl.add_cyl("particulate_filter_cartridge", (DOOR_BAY_X0 + 1.85, -W / 2 + WALL + 0.25, 0.55),
           0.14, 0.80, MAT["ro_vessel"], "effluent_treatment", MO)
fl.add_cyl("uv_recirculation_reactor", (DOOR_BAY_X0 + 2.45, -W / 2 + WALL + 0.30, 0.95),
           0.08, 1.10, MAT["uv_reactor"], "effluent_treatment", MO)
fl.add_box("uv_reactor_controller", (DOOR_BAY_X0 + 2.45, -W / 2 + WALL + 0.12, 1.55),
           (0.16, 0.10, 0.16), MAT["uvc"], "effluent_treatment", MO)
fl.add_cyl("effluent_return_pipe", (DOOR_BAY_X0 + 2.15, -W / 2 + WALL + 0.30, 1.55),
           0.025, 0.70, MAT["pipe_return"], "effluent_treatment", MO,
           rotation=(0, math.radians(90), 0))


# ═══════ EXTERNAL VERTIGATION SKID (3.5 × 1.8 × 2.2 m) ══════════════════════
# Adjacent on a hardstand off the rear-door end, connected by a 4-line hose
# bundle. Holds RO/DI + 2× 1000 L nutrient tanks + dosing pumps + UV. Skid
# parts tag to irrigation_nutrient (tanks/dosing/pumps/RO) and effluent_treatment
# (UV disinfection) as appropriate. The skid frame itself is tagged to
# structure_containment so the structural module reads as "container + skid set".
# Hardstand pad
fl.add_box("skid_hardstand", (SKID_CX, SKID_CY + SKID_L / 2 - SKID_W / 2, 0.02),
           (SKID_W + 0.4, SKID_L + 0.4, 0.04), MAT["floor_alu"], "structure_containment", MO)
# Skid frame (open structural frame, 3.5 m long along Y)
for dzs in (0.06, SKID_H - 0.06):
    fl.add_box(f"skid_frame_rail_{dzs:.2f}", (SKID_CX, SKID_CY + SKID_L / 2 - SKID_W / 2, dzs),
               (SKID_W, SKID_L, 0.08), MAT["skid_frame"], "structure_containment", MO)
for dxs in (-SKID_W / 2 + 0.05, SKID_W / 2 - 0.05):
    for dys in (-SKID_L / 2 + 0.05, SKID_L / 2 - 0.05):
        fl.add_box(f"skid_post_{dxs:.2f}_{dys:.2f}",
                   (SKID_CX + dxs, SKID_CY + SKID_L / 2 - SKID_W / 2 + dys, SKID_H / 2),
                   (0.07, 0.07, SKID_H), MAT["skid_frame"], "structure_containment", MO)
# 2× 1000 L nutrient tanks (primary + reserve) — irrigation_nutrient
for j, dy in enumerate([-0.55, 0.55]):
    fl.add_cyl(f"skid_nutrient_tank_{j}",
               (SKID_CX - 0.25, SKID_CY + SKID_L / 2 - SKID_W / 2 + dy - 0.35, 0.95),
               0.45, 1.50, MAT["nutrient"], "irrigation_nutrient", MO)
# RO/DI water-treatment vessel(s) — irrigation_nutrient
fl.add_cyl("skid_ro_vessel_1", (SKID_CX + 0.45, SKID_CY + SKID_L / 2 - SKID_W / 2 - 1.10, 0.85),
           0.16, 1.30, MAT["ro_vessel"], "irrigation_nutrient", MO)
fl.add_cyl("skid_ro_vessel_2", (SKID_CX + 0.45, SKID_CY + SKID_L / 2 - SKID_W / 2 - 0.70, 0.85),
           0.16, 1.30, MAT["ro_vessel"], "irrigation_nutrient", MO)
# Dosing pumps (A/B/Ca/Mg/micros + pH up/down) — irrigation_nutrient
for j in range(5):
    fl.add_cyl(f"skid_dosing_pump_{j}",
               (SKID_CX + 0.45, SKID_CY + SKID_L / 2 - SKID_W / 2 + 0.40 + j * 0.18, 0.45),
               0.05, 0.16, MAT["valve"], "irrigation_nutrient", MO)
# Circulation pumps — irrigation_nutrient
for j, dy in enumerate([0.10, 0.45]):
    fl.add_compound_motor(f"skid_circ_pump_{j}",
                          (SKID_CX - 0.45, SKID_CY + SKID_L / 2 - SKID_W / 2 + dy, 0.35),
                          0.10, 0.26, MAT["skid_frame"], material_shaft=MAT["bench"],
                          module="irrigation_nutrient", module_objects=MO,
                          rotation=(math.radians(90), 0, 0))
# Skid-side UV-C disinfection reactor — effluent_treatment
fl.add_cyl("skid_uv_disinfection", (SKID_CX + 0.50, SKID_CY + SKID_L / 2 - SKID_W / 2 + 1.30, 0.95),
           0.09, 1.30, MAT["uv_reactor"], "effluent_treatment", MO)
fl.add_box("skid_uv_controller", (SKID_CX + 0.50, SKID_CY + SKID_L / 2 - SKID_W / 2 + 1.30, 1.75),
           (0.16, 0.12, 0.16), MAT["uvc"], "effluent_treatment", MO)
# Skid-side weatherproof control enclosure — automation_sensing
fl.add_box("skid_plc_enclosure", (SKID_CX - 0.55, SKID_CY + SKID_L / 2 - SKID_W / 2 - 1.20, 1.20),
           (0.30, 0.24, 0.55), MAT["plc"], "automation_sensing", MO)
# 4-line hose bundle (nutrient supply, nutrient return, mains water, electrical+CAN)
# running from the skid into the container's rear-door end.
hose_y0 = SKID_CY + SKID_L / 2 - SKID_W / 2 - SKID_L / 2 + 0.2
for j, (dz, mat) in enumerate([
    (0.30, MAT["pipe_supply"]), (0.42, MAT["pipe_return"]),
    (0.54, MAT["ro_vessel"]), (0.66, MAT["hose"]),
]):
    fl.add_pipe(
        f"skid_hose_{j}",
        [
            (SKID_CX - SKID_W / 2 - 0.02, hose_y0, dz),
            (L + 0.30, hose_y0, dz),
            (L + 0.05, -W / 2 + 0.30 + j * 0.10, dz + 0.20),
        ],
        0.022, mat, module="irrigation_nutrient", module_objects=MO,
    )


# ─── Render ──────────────────────────────────────────────────────────────
fl.add_lights(target_centre=(L / 2, 0, H / 2), fill_energy=220, fill_size=12)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")
