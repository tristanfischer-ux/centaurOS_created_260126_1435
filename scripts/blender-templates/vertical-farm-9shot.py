"""vertical-farm-9shot.py — 8-tier indoor vertical farm growing rack with nutrient, lighting, climate, CO2, and control systems.

Source: vertical-farm class template. Envelope 4.0 × 2.0 × 3.0 m main rack,
with external chiller skid at -X and CO2 enrichment cylinder at +X. Stainless
rack, 8 grow trays, LED arrays, irrigation manifolds, reservoir, sensors,
control cabinet, safety and service features. 11 modules.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P vertical-farm-9shot.py
"""
import bpy
import os
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()
POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-vertical-farm-9shot")))

W = 4.0
D = 2.0
H = 3.0

YF = -D / 2
YB = D / 2
TIER_COUNT = 8
TIER_ZS = [0.35 + i * 0.31 for i in range(TIER_COUNT)]

MO = fl.make_module_dict([
    "structure_containment",
    "energy_conversion_transduction",
    "environmental_interface",
    "mass_fluid_transport_process",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
    "actuation_kinematics",
])

MAT = fl.make_default_palette()
# Form-factor extensions
MAT["galv"]          = fl.make_mat("m_galv_steel",       (0.62, 0.66, 0.70), metallic=0.65, roughness=0.35)
MAT["tray"]          = fl.make_mat("m_grow_tray",        (0.20, 0.62, 1.00), metallic=0.35, roughness=0.38)
MAT["crop"]          = fl.make_mat("m_crop_green",       (0.00, 0.92, 0.08), metallic=0.0, roughness=0.55)
MAT["rootmat"]       = fl.make_mat("m_rootmat",          (0.78, 0.42, 0.02), metallic=0.0, roughness=0.65)
MAT["led_red"]       = fl.make_mat("m_led_red",          (1.00, 0.00, 0.03), metallic=0.0, roughness=0.35)
MAT["led_blue"]      = fl.make_mat("m_led_blue",         (0.00, 0.10, 1.00), metallic=0.0, roughness=0.35)
MAT["led_white"]     = fl.make_mat("m_led_white",        (1.00, 0.85, 0.05), metallic=0.0, roughness=0.30)
MAT["pipe_abs"]      = fl.make_mat("m_black_abs_pipe",   (0.01, 0.012, 0.018), metallic=0.0, roughness=0.45)
MAT["nutrient"]      = fl.make_mat("m_nutrient",         (0.00, 0.42, 1.00), metallic=0.0, roughness=0.35, alpha=0.55)
MAT["uv"]            = fl.make_mat("m_uv_steriliser",    (0.62, 0.00, 1.00), metallic=0.0, roughness=0.30)
MAT["duct"]          = fl.make_mat("m_climate_duct",     (0.00, 0.78, 0.95), metallic=0.2, roughness=0.35)
MAT["co2"]           = fl.make_mat("m_co2_cylinder",     (0.00, 0.75, 0.20), metallic=0.45, roughness=0.35)
MAT["filter"]        = fl.make_mat("m_air_filter",       (1.00, 0.55, 0.00), metallic=0.0, roughness=0.50)
MAT["wire"]          = fl.make_mat("m_cable_black",      (0.02, 0.02, 0.025), metallic=0.0, roughness=0.55)


# ═══════ Module — structure_containment (rack, tier frames, trays) ═════════
# Four galvanised 50 × 50 mm corner posts
for x, y in [(0.05, YF + 0.05), (W - 0.05, YF + 0.05), (0.05, YB - 0.05), (W - 0.05, YB - 0.05)]:
    fl.add_box(f"vf1_post_{x:.2f}_{y:.2f}", (x, y, H / 2), (0.05, 0.05, H), MAT["galv"], "structure_containment", MO)

# Base and top perimeter rails
for name, loc, size in [
    ("vf1_base_front", (W / 2, YF + 0.05, 0.08), (W, 0.05, 0.08)),
    ("vf1_base_back",  (W / 2, YB - 0.05, 0.08), (W, 0.05, 0.08)),
    ("vf1_base_left",  (0.05, 0.0, 0.08),        (0.05, D, 0.08)),
    ("vf1_base_right", (W - 0.05, 0.0, 0.08),    (0.05, D, 0.08)),
    ("vf1_top_front",  (W / 2, YF + 0.05, H - 0.05), (W, 0.05, 0.06)),
    ("vf1_top_back",   (W / 2, YB - 0.05, H - 0.05), (W, 0.05, 0.06)),
    ("vf1_top_left",   (0.05, 0.0, H - 0.05),        (0.05, D, 0.06)),
    ("vf1_top_right",  (W - 0.05, 0.0, H - 0.05),    (0.05, D, 0.06)),
]:
    fl.add_box(name, loc, size, MAT["galv"], "structure_containment", MO)

# Tier rails and grow trays
for i, z in enumerate(TIER_ZS):
    fl.add_box(f"vf1_tier_{i}_front_rail", (W / 2, YF + 0.06, z), (W - 0.10, 0.035, 0.045), MAT["galv"], "structure_containment", MO)
    fl.add_box(f"vf1_tier_{i}_back_rail",  (W / 2, YB - 0.06, z), (W - 0.10, 0.035, 0.045), MAT["galv"], "structure_containment", MO)
    fl.add_box(f"vf1_tier_{i}_left_rail",  (0.10, 0.0, z),        (0.035, D - 0.12, 0.045), MAT["galv"], "structure_containment", MO)
    fl.add_box(f"vf1_tier_{i}_right_rail", (W - 0.10, 0.0, z),    (0.035, D - 0.12, 0.045), MAT["galv"], "structure_containment", MO)
    fl.add_box(f"vf1_grow_tray_{i}", (W / 2, 0.0, z + 0.035), (3.88, 1.86, 0.06), MAT["tray"], "structure_containment", MO)
    fl.add_box(f"vf1_rootmat_{i}", (W / 2, 0.0, z + 0.075), (3.70, 1.65, 0.025), MAT["rootmat"], "structure_containment", MO)

# Diagonal rear bracing, simplified as sloped rectangular tubes
fl.add_box("vf1_rear_diag_A", (W / 2, YB - 0.03, 1.50), (4.20, 0.030, 0.045), MAT["galv"], "structure_containment", MO, rotation=(0, math.radians(37), 0))
fl.add_box("vf1_rear_diag_B", (W / 2, YB - 0.06, 1.50), (4.20, 0.030, 0.045), MAT["galv"], "structure_containment", MO, rotation=(0, math.radians(-37), 0))


# ═══════ Module — energy_conversion_transduction (LEDs, pumps, UV, chiller) ═
# Three-colour LED light bars above every tier
for i, z in enumerate(TIER_ZS):
    lz = z + 0.22
    fl.add_box(f"vf2_led_red_{i}",   (W / 2, -0.55, lz), (3.65, 0.055, 0.030), MAT["led_red"], "energy_conversion_transduction", MO)
    fl.add_box(f"vf2_led_blue_{i}",  (W / 2,  0.00, lz), (3.65, 0.055, 0.030), MAT["led_blue"], "energy_conversion_transduction", MO)
    fl.add_box(f"vf2_led_white_{i}", (W / 2,  0.55, lz), (3.65, 0.055, 0.030), MAT["led_white"], "energy_conversion_transduction", MO)

# Nutrient circulation pump, UV steriliser, and chiller active devices
fl.add_cyl("vf2_main_pump_motor", (0.55, YF + 0.28, 0.22), 0.11, 0.22, MAT["motor"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("vf2_pump_volute", (0.77, YF + 0.28, 0.22), 0.13, 0.10, MAT["aluminium"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("vf2_uv_steriliser_tube", (1.25, YF + 0.25, 0.25), 0.055, 0.70, MAT["uv"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("vf2_chiller_compressor", (-0.95, -0.15, 0.55), 0.20, 0.42, MAT["compressor"], "energy_conversion_transduction", MO)
for j, fy in enumerate([-0.22, 0.22]):
    fl.add_cyl(f"vf2_chiller_fan_{j}", (-1.55, fy, 0.88), 0.18, 0.045, MAT["motor"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — environmental_interface (climate ducting, filters, chiller) ═
# External chiller skid at -X end
fl.add_box("vf7_chiller_skid_base", (-1.05, 0.0, 0.08), (1.50, 0.80, 0.12), MAT["stainless"], "environmental_interface", MO)
fl.add_box("vf7_chiller_cabinet", (-1.05, 0.0, 0.78), (1.45, 0.76, 1.35), MAT["enclosure"], "environmental_interface", MO)
fl.add_box("vf7_chiller_louver_front", (-1.78, 0.0, 0.85), (0.025, 0.62, 0.52), MAT["filter"], "environmental_interface", MO)
fl.add_box("vf7_chiller_service_panel", (-0.32, 0.0, 0.78), (0.025, 0.60, 1.00), MAT["maint"], "environmental_interface", MO)

# Supply and return air ducts across the top
fl.add_cyl("vf7_top_supply_duct", (W / 2, YB + 0.10, H - 0.16), 0.075, W + 0.40, MAT["duct"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("vf7_top_return_duct", (W / 2, YF - 0.10, H - 0.16), 0.075, W + 0.40, MAT["duct"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("vf7_chiller_supply_hose", (-0.30, YB + 0.10, 2.45), 0.045, 0.85, MAT["duct"], "environmental_interface", MO)
fl.add_cyl("vf7_chiller_return_hose", (-0.30, YF - 0.10, 2.45), 0.045, 0.85, MAT["duct"], "environmental_interface", MO)

# Lower filtered intakes
for i, x in enumerate([0.70, 2.00, 3.30]):
    fl.add_box(f"vf7_bottom_intake_filter_{i}", (x, YF - 0.035, 0.32), (0.50, 0.030, 0.20), MAT["filter"], "environmental_interface", MO)


# ═══════ Module — mass_fluid_transport_process (reservoir, piping, CO2) ═════
# Nutrient reservoir at bottom and visible solution layer
fl.add_box("vf11_reservoir_tank", (2.00, YF + 0.35, 0.28), (0.80, 0.60, 0.50), MAT["stainless"], "mass_fluid_transport_process", MO)
fl.add_box("vf11_reservoir_solution", (2.00, YF + 0.35, 0.36), (0.74, 0.54, 0.22), MAT["nutrient"], "mass_fluid_transport_process", MO)

# Vertical supply and return pipes on opposite sides
fl.add_cyl("vf11_supply_riser", (0.18, YF + 0.18, 1.45), 0.030, 2.55, MAT["pipe_abs"], "mass_fluid_transport_process", MO)
fl.add_cyl("vf11_return_riser", (W - 0.18, YB - 0.18, 1.45), 0.035, 2.55, MAT["pipe_abs"], "mass_fluid_transport_process", MO)

# Drip irrigation manifolds under each tray
for i, z in enumerate(TIER_ZS):
    fl.add_cyl(f"vf11_drip_manifold_{i}", (W / 2, YF + 0.23, z + 0.12), 0.014, 3.55, MAT["pipe_abs"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
    for j, x in enumerate([0.75, 1.50, 2.25, 3.00]):
        fl.add_sphere(f"vf11_drip_emitter_{i}_{j}", (x, YF + 0.23, z + 0.095), 0.018, MAT["nutrient"], "mass_fluid_transport_process", MO)

# CO2 enrichment cylinder at +X end with regulator
fl.add_cyl("vf11_co2_cylinder", (4.42, 0.72, 0.72), 0.16, 1.28, MAT["co2"], "mass_fluid_transport_process", MO)
fl.add_cyl("vf11_co2_valve_regulator", (4.42, 0.72, 1.42), 0.055, 0.10, MAT["powerdist"], "mass_fluid_transport_process", MO)
fl.add_cyl("vf11_co2_feed_line", (4.10, 0.72, 1.40), 0.012, 0.65, MAT["pipe_abs"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — control_compute_communication (cabinet, PLC, comms) ══════
# Side-mounted control cabinet
fl.add_box("vf5_control_cabinet", (4.18, -0.35, 1.05), (0.40, 0.30, 0.80), MAT["powerdist"], "control_compute_communication", MO)
fl.add_box("vf5_plc_controller", (4.00, -0.35, 1.20), (0.05, 0.20, 0.22), MAT["control"], "control_compute_communication", MO)
fl.add_box("vf5_led_driver_stack", (4.00, -0.35, 0.88), (0.05, 0.22, 0.30), MAT["inverter"], "control_compute_communication", MO)
fl.add_box("vf5_io_module", (4.00, -0.35, 1.48), (0.05, 0.18, 0.16), MAT["control"], "control_compute_communication", MO)
fl.add_box("vf5_edge_gateway", (4.00, -0.35, 1.68), (0.05, 0.16, 0.12), MAT["fc"], "control_compute_communication", MO)
fl.add_cyl("vf5_wifi_antenna", (4.18, -0.35, 1.58), 0.008, 0.22, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("vf5_camera_compute_node", (3.60, YB + 0.08, 2.55), (0.18, 0.07, 0.12), MAT["control"], "control_compute_communication", MO)


# ═══════ Module — safety_protection (guards, estop, leak and CO2 safety) ═══
fl.add_cyl("vf6_estop_button", (4.00, -0.51, 1.22), 0.045, 0.030, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("vf6_front_guard_mesh", (W / 2, YF - 0.025, 1.55), (3.80, 0.020, 2.45), MAT["safety"], "safety_protection", MO)
fl.add_box("vf6_leak_containment_pan", (W / 2, 0.0, 0.035), (3.90, 1.90, 0.045), MAT["safety"], "safety_protection", MO)
fl.add_box("vf6_co2_alarm", (3.70, YB + 0.05, 1.85), (0.10, 0.035, 0.10), MAT["safety"], "safety_protection", MO)
fl.add_box("vf6_co2_cylinder_chain", (4.42, 0.56, 0.90), (0.36, 0.025, 0.035), MAT["safety"], "safety_protection", MO)
for z in [0.85, 1.75, 2.65]:
    fl.add_box(f"vf6_door_interlock_{z:.2f}", (0.18, YF - 0.035, z), (0.08, 0.025, 0.055), MAT["safety"], "safety_protection", MO)


# ═══════ Module — sensing_instrumentation (tier climate, PAR, EC/pH) ═══════
# Temp/humidity and PAR sensors per tier
for i, z in enumerate(TIER_ZS):
    fl.add_box(f"vf4_temp_humidity_{i}", (0.35, YB - 0.18, z + 0.18), (0.08, 0.045, 0.055), MAT["sensor"], "sensing_instrumentation", MO)
    fl.add_sphere(f"vf4_par_sensor_{i}", (3.65, 0.0, z + 0.18), 0.035, MAT["sensor"], "sensing_instrumentation", MO)

# Reservoir instrumentation
fl.add_cyl("vf4_ec_probe", (1.86, YF + 0.35, 0.62), 0.012, 0.30, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("vf4_ph_probe", (2.05, YF + 0.35, 0.62), 0.012, 0.30, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("vf4_level_sensor", (2.22, YF + 0.35, 0.58), 0.018, 0.24, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vf4_flow_meter", (0.55, YF + 0.18, 0.58), (0.16, 0.08, 0.08), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_sphere("vf4_leak_detector", (2.85, YF + 0.45, 0.08), 0.035, MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — power_distribution (mains, drivers, trays, cabling) ══════
fl.add_box("vf8_mains_disconnect", (4.00, -0.35, 0.62), (0.055, 0.18, 0.18), MAT["safety"], "power_distribution", MO)
fl.add_box("vf8_ac_busbar", (4.00, -0.35, 0.78), (0.055, 0.24, 0.035), MAT["copper"], "power_distribution", MO)
fl.add_box("vf8_dc_busbar", (4.00, -0.35, 1.02), (0.055, 0.24, 0.035), MAT["copper"], "power_distribution", MO)
fl.add_cyl("vf8_mains_cable_entry", (4.18, -0.35, 0.35), 0.030, 0.35, MAT["wire"], "power_distribution", MO)
fl.add_box("vf8_vertical_cable_tray", (3.92, YB + 0.08, 1.55), (0.10, 0.06, 2.50), MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate(TIER_ZS):
    fl.add_box(f"vf8_tier_junction_box_{i}", (3.78, YB - 0.10, z + 0.20), (0.11, 0.06, 0.08), MAT["powerdist"], "power_distribution", MO)
fl.add_box("vf8_chiller_power_whip", (-0.32, -0.36, 0.50), (0.35, 0.035, 0.035), MAT["wire"], "power_distribution", MO)


# ═══════ Module — hmi_ergonomics (screen, buttons, beacons, operator cues) ══
fl.add_box("vf3_hmi_bezel", (4.00, -0.505, 1.38), (0.24, 0.018, 0.18), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("vf3_hmi_screen", (4.00, -0.517, 1.38), (0.20, 0.006, 0.13), MAT["hmi"], "hmi_ergonomics", MO)
for i, c in enumerate([MAT["sensor"], MAT["control"], MAT["safety"]]):
    fl.add_cyl(f"vf3_hmi_button_{i}", (3.94 + i * 0.06, -0.52, 1.22), 0.016, 0.012, c, "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for i, c in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"vf3_status_beacon_{i}", (4.18, -0.35, 1.92 + i * 0.055), 0.032, 0.045, c, "hmi_ergonomics", MO)
fl.add_box("vf3_operator_label_panel", (0.90, YF - 0.04, 1.68), (0.45, 0.018, 0.18), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("vf3_scan_badge_reader", (3.75, YF - 0.04, 1.20), (0.12, 0.020, 0.08), MAT["hmi"], "hmi_ergonomics", MO)


# ═══════ Module — maintenance_serviceability (access, drains, handles) ═════
fl.add_box("vf10_service_step", (0.45, YF - 0.42, 0.12), (0.65, 0.32, 0.10), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vf10_foldout_work_shelf", (4.00, -0.62, 0.92), (0.35, 0.18, 0.035), MAT["maint"], "maintenance_serviceability", MO)
fl.add_cyl("vf10_reservoir_drain_valve", (2.40, YF + 0.08, 0.22), 0.025, 0.08, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("vf10_cleanout_cap", (1.66, YF + 0.35, 0.56), 0.055, 0.025, MAT["maint"], "maintenance_serviceability", MO)
for z in [0.95, 1.55, 2.15]:
    fl.add_torus(f"vf10_front_pull_handle_{z:.2f}", (0.24, YF - 0.045, z), 0.060, 0.010, MAT["maint"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
fl.add_box("vf10_spare_nozzle_clip", (3.25, YF - 0.035, 0.65), (0.30, 0.025, 0.08), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vf10_filter_service_drawer", (-1.78, 0.0, 0.42), (0.035, 0.50, 0.18), MAT["maint"], "maintenance_serviceability", MO)


# ═══════ Module — actuation_kinematics (valves, dosing, dampers, fan drives) ═
# Solenoid valves controlling each tier manifold
for i, z in enumerate(TIER_ZS):
    fl.add_box(f"vf9_solenoid_valve_{i}", (0.32, YF + 0.20, z + 0.12), (0.09, 0.07, 0.055), MAT["control"], "actuation_kinematics", MO)

# Dosing pump rollers and climate dampers
for i, x in enumerate([1.70, 1.88, 2.06]):
    fl.add_cyl(f"vf9_dosing_pump_head_{i}", (x, YF + 0.02, 0.62), 0.050, 0.040, MAT["maint"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("vf9_supply_damper_actuator", (0.55, YB + 0.10, 2.76), (0.12, 0.10, 0.08), MAT["motor"], "actuation_kinematics", MO)
fl.add_box("vf9_return_damper_actuator", (3.45, YF - 0.10, 2.76), (0.12, 0.10, 0.08), MAT["motor"], "actuation_kinematics", MO)
fl.add_cyl("vf9_chiller_fan_shaft", (-1.55, 0.0, 0.88), 0.025, 0.55, MAT["aluminium"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("vf9_pump_coupling", (0.66, YF + 0.28, 0.22), 0.045, 0.09, MAT["maint"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))


# ─── Lighting + world + render ─────────────────────────────────────────────
fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")