"""vertical-farm-9shot.py — 8-tier indoor vertical farm rack, 4 × 2 × 3 m."""
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

W = 4.0
D = 2.0
H = 3.0

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
MAT["tray_steel"]      = fl.make_mat("m_tray_steel",      (0.82, 0.84, 0.86), metallic=0.65, roughness=0.32)
MAT["crop_leaf"]       = fl.make_mat("m_crop_leaf",       (0.00, 0.95, 0.12), metallic=0.0, roughness=0.62)
MAT["nutrient"]        = fl.make_mat("m_nutrient",        (0.00, 0.72, 1.00), metallic=0.1, roughness=0.28, alpha=0.72)
MAT["pipe_blue"]       = fl.make_mat("m_pipe_blue",       (0.00, 0.25, 1.00), metallic=0.2, roughness=0.38)
MAT["pipe_return"]     = fl.make_mat("m_pipe_return",     (0.00, 0.95, 0.85), metallic=0.2, roughness=0.38)
MAT["led_board"]       = fl.make_mat("m_led_board",       (0.04, 0.05, 0.08), metallic=0.2, roughness=0.45)
MAT["led_red"]         = fl.make_mat("m_led_red",         (1.00, 0.00, 0.04), metallic=0.0, roughness=0.30)
MAT["led_blue"]        = fl.make_mat("m_led_blue",        (0.05, 0.10, 1.00), metallic=0.0, roughness=0.30)
MAT["led_white"]       = fl.make_mat("m_led_white",       (1.00, 0.96, 0.72), metallic=0.0, roughness=0.25)
MAT["duct"]            = fl.make_mat("m_climate_duct",    (0.00, 0.82, 1.00), metallic=0.25, roughness=0.36)
MAT["air_nozzle"]      = fl.make_mat("m_air_nozzle",      (0.00, 1.00, 0.55), metallic=0.1, roughness=0.36)
MAT["driver"]          = fl.make_mat("m_led_driver",      (0.72, 0.00, 1.00), metallic=0.1, roughness=0.45)
MAT["control_cab"]     = fl.make_mat("m_control_cab",     (1.00, 0.55, 0.00), metallic=0.15, roughness=0.45)
MAT["screen_glow"]     = fl.make_mat("m_screen_glow",     (0.00, 0.45, 1.00), metallic=0.0, roughness=0.20)
MAT["service_magenta"] = fl.make_mat("m_service_magenta", (1.00, 0.00, 0.65), metallic=0.0, roughness=0.42)
MAT["valve_yellow"]    = fl.make_mat("m_valve_yellow",    (1.00, 0.85, 0.00), metallic=0.05, roughness=0.42)
MAT["warning_red"]     = fl.make_mat("m_warning_red",     (1.00, 0.00, 0.00), metallic=0.0, roughness=0.45)


# ═══════ Module — structure_containment ═════════════════════════════════════
# STRICT: only the rack skeleton — four corner posts and horizontal cross-beams.
POST = 0.05
for x, y in [(POST/2, -D/2 + POST/2), (W - POST/2, -D/2 + POST/2),
             (POST/2, D/2 - POST/2), (W - POST/2, D/2 - POST/2)]:
    fl.add_box(f"vf1_corner_post_{x:.2f}_{y:.2f}", (x, y, H/2),
               (POST, POST, H), MAT["stainless"], "structure_containment", MO)

for z in [0.30, 0.90, 1.50, 2.10, 2.70]:
    fl.add_box(f"vf1_front_xbeam_{z:.2f}", (W/2, -D/2 + POST/2, z),
               (W - POST, POST, POST), MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"vf1_rear_xbeam_{z:.2f}", (W/2, D/2 - POST/2, z),
               (W - POST, POST, POST), MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"vf1_left_ybeam_{z:.2f}", (POST/2, 0, z),
               (POST, D - POST, POST), MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"vf1_right_ybeam_{z:.2f}", (W - POST/2, 0, z),
               (POST, D - POST, POST), MAT["stainless"], "structure_containment", MO)


# ═══════ Module — mass_fluid_transport_process ══════════════════════════════
TIERS = [0.40, 0.70, 1.00, 1.30, 1.60, 1.90, 2.20, 2.50]

for i, z in enumerate(TIERS):
    fl.add_box(f"vf11_grow_tray_{i}", (W/2, 0, z),
               (3.72, 1.56, 0.06), MAT["tray_steel"], "mass_fluid_transport_process", MO)
    fl.add_box(f"vf11_crop_canopy_{i}", (W/2, 0, z + 0.055),
               (3.35, 1.18, 0.035), MAT["crop_leaf"], "mass_fluid_transport_process", MO)
    fl.add_cyl(f"vf11_tier_feed_manifold_{i}", (W/2, -0.80, z + 0.055),
               0.012, 3.45, MAT["pipe_blue"], "mass_fluid_transport_process", MO,
               rotation=(0, math.radians(90), 0))

fl.add_cyl("vf11_vertical_supply_pipe", (0.12, -0.86, 1.45),
           0.030, 2.25, MAT["pipe_blue"], "mass_fluid_transport_process", MO)
fl.add_cyl("vf11_vertical_return_pipe", (3.88, 0.86, 1.45),
           0.030, 2.25, MAT["pipe_return"], "mass_fluid_transport_process", MO)
fl.add_box("vf11_nutrient_reservoir", (0.55, 0.66, 0.25),
           (0.80, 0.58, 0.50), MAT["nutrient"], "mass_fluid_transport_process", MO)


# ═══════ Module — environmental_interface ═══════════════════════════════════
for i, z in enumerate(TIERS):
    led_z = min(z + 0.155, H - 0.18)
    fl.add_box(f"vf7_led_array_board_{i}", (W/2, 0, led_z),
               (3.58, 1.36, 0.018), MAT["led_board"], "environmental_interface", MO)
    fl.add_box(f"vf7_led_red_bar_{i}", (W/2, -0.42, led_z + 0.018),
               (3.34, 0.052, 0.014), MAT["led_red"], "environmental_interface", MO)
    fl.add_box(f"vf7_led_blue_bar_{i}", (W/2, 0.00, led_z + 0.018),
               (3.34, 0.052, 0.014), MAT["led_blue"], "environmental_interface", MO)
    fl.add_box(f"vf7_led_white_bar_{i}", (W/2, 0.42, led_z + 0.018),
               (3.34, 0.052, 0.014), MAT["led_white"], "environmental_interface", MO)

fl.add_box("vf7_overhead_supply_duct_front", (W/2, -0.55, 2.88),
           (3.40, 0.18, 0.16), MAT["duct"], "environmental_interface", MO)
fl.add_box("vf7_overhead_supply_duct_rear", (W/2, 0.55, 2.88),
           (3.40, 0.18, 0.16), MAT["duct"], "environmental_interface", MO)
for j, x in enumerate([0.80, 1.60, 2.40, 3.20]):
    fl.add_cyl(f"vf7_air_nozzle_{j}", (x, -0.55 if j % 2 == 0 else 0.55, 2.76),
               0.055, 0.085, MAT["air_nozzle"], "environmental_interface", MO)


# ═══════ Module — energy_conversion_transduction ════════════════════════════
for i, z in enumerate([0.58, 1.18, 1.78, 2.38]):
    fl.add_box(f"vf2_led_driver_pair_{i}", (0.30, 0.86, z),
               (0.22, 0.12, 0.16), MAT["driver"], "energy_conversion_transduction", MO)
fl.add_box("vf2_ac_dc_converter", (3.42, -0.86, 0.36),
           (0.26, 0.16, 0.18), MAT["inverter"], "energy_conversion_transduction", MO)


# ═══════ Module — control_compute_communication ═════════════════════════════
fl.add_box("vf5_control_cabinet", (3.75, -0.70, 0.75),
           (0.40, 0.30, 0.80), MAT["control_cab"], "control_compute_communication", MO)
fl.add_box("vf5_plc_controller", (3.53, -0.70, 0.72),
           (0.035, 0.18, 0.28), MAT["control"], "control_compute_communication", MO)
fl.add_box("vf5_edge_grow_controller", (3.53, -0.70, 1.08),
           (0.035, 0.16, 0.18), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("vf5_wifi_antenna", (3.75, -0.70, 1.22),
           0.010, 0.18, MAT["antenna"], "control_compute_communication", MO)


# ═══════ Module — sensing_instrumentation ═══════════════════════════════════
for i, z in enumerate(TIERS):
    fl.add_box(f"vf4_tier_env_sensor_{i}", (3.62, 0.80, z + 0.10),
               (0.08, 0.04, 0.055), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — power_distribution ════════════════════════════════════════
fl.add_box("vf8_vertical_power_trunk", (3.54, -0.94, 1.48),
           (0.08, 0.055, 2.48), MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.52, 1.12, 1.72]):
    fl.add_box(f"vf8_copper_busbar_{i}", (3.54, -0.91, z),
               (0.065, 0.018, 0.42), MAT["copper"], "power_distribution", MO)
for j, z in enumerate([0.78, 1.68]):
    fl.add_box(f"vf8_led_cable_tray_{j}", (W/2, -0.92, z),
               (3.35, 0.035, 0.035), MAT["powerdist"], "power_distribution", MO)


# ═══════ Module — actuation_kinematics ══════════════════════════════════════
for i, x in enumerate([1.00, 1.32]):
    fl.add_cyl(f"vf9_pump_motor_{i}", (x, 0.78, 0.20),
               0.070, 0.16, MAT["motor"], "actuation_kinematics", MO,
               rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"vf9_pump_head_{i}", (x + 0.16, 0.78, 0.20),
               0.058, 0.055, MAT["maint"], "actuation_kinematics", MO,
               rotation=(0, math.radians(90), 0))
for i, z in enumerate([0.50, 1.10, 1.70, 2.30]):
    fl.add_box(f"vf9_solenoid_valve_bank_{i}", (0.23, -0.78, z),
               (0.13, 0.08, 0.07), MAT["valve_yellow"], "actuation_kinematics", MO)


# ═══════ Module — safety_protection ═════════════════════════════════════════
fl.add_cyl("vf6_estop_button", (3.535, -0.84, 1.00),
           0.045, 0.026, MAT["warning_red"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("vf6_estop_collar", (3.548, -0.84, 1.00),
           0.056, 0.014, MAT["maint"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("vf6_front_light_curtain_left", (0.16, -0.965, 1.45),
           (0.035, 0.025, 2.20), MAT["warning_red"], "safety_protection", MO)
fl.add_box("vf6_front_light_curtain_right", (3.84, -0.965, 1.45),
           (0.035, 0.025, 2.20), MAT["warning_red"], "safety_protection", MO)
fl.add_box("vf6_leak_detection_strip", (W/2, 0.94, 0.08),
           (3.20, 0.035, 0.025), MAT["warning_red"], "safety_protection", MO)


# ═══════ Module — hmi_ergonomics ════════════════════════════════════════════
fl.add_box("vf3_hmi_bezel", (3.538, -0.70, 0.98),
           (0.018, 0.20, 0.16), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("vf3_hmi_screen", (3.526, -0.70, 0.98),
           (0.010, 0.165, 0.115), MAT["screen_glow"], "hmi_ergonomics", MO)
for i, y in enumerate([-0.76, -0.70, -0.64]):
    fl.add_cyl(f"vf3_operator_button_{i}", (3.524, y, 0.83),
               0.018, 0.012, [MAT["sensor"], MAT["control"], MAT["warning_red"]][i], "hmi_ergonomics", MO,
               rotation=(0, math.radians(90), 0))
for i, c in enumerate([MAT["warning_red"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"vf3_status_beacon_{i}", (3.75, -0.70, 1.29 + i * 0.045),
               0.030, 0.035, c, "hmi_ergonomics", MO)


# ═══════ Module — maintenance_serviceability ════════════════════════════════
fl.add_box("vf10_service_panel_reservoir", (0.55, 0.965, 0.33),
           (0.52, 0.026, 0.28), MAT["service_magenta"], "maintenance_serviceability", MO)
for i, z in enumerate([0.85, 1.45, 2.05]):
    fl.add_torus(f"vf10_pull_handle_{i}", (3.92, 0.00, z),
                 major_radius=0.055, minor_radius=0.010,
                 material=MAT["service_magenta"], module="maintenance_serviceability", module_objects=MO,
                 rotation=(0, math.radians(90), 0))
fl.add_cyl("vf10_reservoir_drain_port", (0.88, 0.965, 0.16),
           0.026, 0.035, MAT["service_magenta"], "maintenance_serviceability", MO,
           rotation=(math.radians(90), 0, 0))


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")