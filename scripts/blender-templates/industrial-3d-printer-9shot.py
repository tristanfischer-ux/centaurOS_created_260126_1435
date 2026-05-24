"""industrial-3d-printer-9shot.py — industrial enclosed FDM/FFF 3D printer template."""
import bpy
import os
import math
import sys
from pathlib import Path

POC_DIR = Path(__file__).parent
sys.path.insert(0, str(POC_DIR))
import forge_blender_lib as fl

fl.init_scene()

OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-industrial-3d-printer-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 1.0
D = 1.0
H = 1.5

CHAMBER_FLOOR = 0.38
CHAMBER_TOP = 1.34
WALL_T = 0.030

MODULE_IDS = [
    "structure_containment",
    "actuation_kinematics",
    "energy_conversion_transduction",
    "sensing_instrumentation",
    "control_compute_communication",
    "safety_protection",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
    "environmental_interface",
    "mass_fluid_transport_process",
]
MO = fl.make_module_dict(MODULE_IDS)

MAT = fl.make_default_palette()
MAT.update({
    "printhead":      fl.make_mat("m_printhead",      (0.95, 0.22, 0.02), metallic=0.25, roughness=0.35),
    "hotend":         fl.make_mat("m_hotend",         (1.00, 0.42, 0.00), metallic=0.35, roughness=0.25),
    "build_plate":    fl.make_mat("m_build_plate",    (0.18, 0.22, 0.28), metallic=0.55, roughness=0.28),
    "heater":         fl.make_mat("m_heater",         (1.00, 0.20, 0.00), metallic=0.0, roughness=0.45),
    "filament":       fl.make_mat("m_filament",       (0.98, 0.05, 0.75), metallic=0.0, roughness=0.38),
    "spool":          fl.make_mat("m_spool",          (0.20, 0.85, 1.00), metallic=0.0, roughness=0.45),
    "gantry":         fl.make_mat("m_gantry",         (0.45, 0.70, 0.95), metallic=0.35, roughness=0.35),
    "rail":           fl.make_mat("m_linear_rail",    (0.08, 0.10, 0.13), metallic=0.65, roughness=0.25),
    "belt":           fl.make_mat("m_belt",           (0.02, 0.025, 0.03), metallic=0.0, roughness=0.70),
    "glass":          fl.make_mat("m_smoked_glass",   (0.20, 0.30, 0.38), metallic=0.0, roughness=0.18, alpha=0.45),
    "filter_media":   fl.make_mat("m_filter_media",   (0.00, 0.80, 0.95), metallic=0.0, roughness=0.55),
    "dryer":          fl.make_mat("m_filament_dryer", (0.68, 0.18, 1.00), metallic=0.0, roughness=0.45),
    "rubber":         fl.make_mat("m_rubber",         (0.015, 0.018, 0.022), metallic=0.0, roughness=0.85),
    "warning":        fl.make_mat("m_warning_label",  (1.00, 0.68, 0.00), metallic=0.0, roughness=0.50),
})


# ═══════ Module — structure_containment ═══════
# Base plinth and machine cabinet shell
fl.add_box("i3dp_plinth", (W/2, D/2, 0.04), (1.08, 1.08, 0.08), MAT["powerdist"], "structure_containment", MO)
fl.add_box("i3dp_base_pan", (W/2, D/2, 0.19), (W, D, 0.28), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_bottom_floor", (W/2, D/2, CHAMBER_FLOOR), (W, D, WALL_T), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_roof_panel", (W/2, D/2, H - WALL_T/2), (W, D, WALL_T), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_left_panel", (WALL_T/2, D/2, H/2), (WALL_T, D, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_right_panel", (W - WALL_T/2, D/2, H/2), (WALL_T, D, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_back_panel", (W/2, D - WALL_T/2, H/2), (W, WALL_T, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_front_lower_panel", (W/2, WALL_T/2, 0.20), (W, WALL_T, 0.34), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_front_header", (W/2, WALL_T/2, 1.43), (W, WALL_T, 0.14), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_front_left_jamb", (0.10, WALL_T/2, 0.90), (0.12, WALL_T, 0.96), MAT["enclosure"], "structure_containment", MO)
fl.add_box("i3dp_front_right_jamb", (0.90, WALL_T/2, 0.90), (0.12, WALL_T, 0.96), MAT["enclosure"], "structure_containment", MO)
# Smoked transparent build-chamber door and side windows
fl.add_box("i3dp_front_glass_door", (W/2, 0.010, 0.92), (0.70, 0.012, 0.86), MAT["glass"], "structure_containment", MO)
fl.add_box("i3dp_left_window", (0.010, D/2, 0.92), (0.012, 0.62, 0.74), MAT["glass"], "structure_containment", MO)
fl.add_box("i3dp_right_window", (0.990, D/2, 0.92), (0.012, 0.62, 0.74), MAT["glass"], "structure_containment", MO)
# Extruded aluminium structural frame
for x in [0.06, 0.94]:
    for y in [0.06, 0.94]:
        fl.add_box(f"i3dp_corner_extrusion_{x:.2f}_{y:.2f}", (x, y, H/2), (0.035, 0.035, H), MAT["aluminium"], "structure_containment", MO)
for z in [0.38, 1.34, 1.47]:
    fl.add_box(f"i3dp_front_crossmember_{z:.2f}", (W/2, 0.055, z), (0.88, 0.035, 0.035), MAT["aluminium"], "structure_containment", MO)
    fl.add_box(f"i3dp_back_crossmember_{z:.2f}", (W/2, 0.945, z), (0.88, 0.035, 0.035), MAT["aluminium"], "structure_containment", MO)
    fl.add_box(f"i3dp_left_crossmember_{z:.2f}", (0.055, D/2, z), (0.035, 0.88, 0.035), MAT["aluminium"], "structure_containment", MO)
    fl.add_box(f"i3dp_right_crossmember_{z:.2f}", (0.945, D/2, z), (0.035, 0.88, 0.035), MAT["aluminium"], "structure_containment", MO)
# Leveling feet
for x in [0.12, 0.88]:
    for y in [0.12, 0.88]:
        fl.add_cyl(f"i3dp_leveling_foot_{x:.2f}_{y:.2f}", (x, y, -0.015), 0.045, 0.030, MAT["rubber"], "structure_containment", MO)


# ═══════ Module — actuation_kinematics ═══════
# Z-axis guide posts and lead screws
for x in [0.18, 0.82]:
    for y in [0.18, 0.82]:
        fl.add_cyl(f"i3dp_z_guide_{x:.2f}_{y:.2f}", (x, y, 0.86), 0.012, 0.92, MAT["rail"], "actuation_kinematics", MO)
for x in [0.24, 0.76]:
    fl.add_cyl(f"i3dp_z_leadscrew_{x:.2f}", (x, 0.86, 0.86), 0.010, 0.90, MAT["copper"], "actuation_kinematics", MO)
# XY gantry rails
fl.add_box("i3dp_x_gantry_beam", (W/2, 0.50, 1.18), (0.72, 0.035, 0.035), MAT["gantry"], "actuation_kinematics", MO)
fl.add_box("i3dp_x_linear_rail", (W/2, 0.47, 1.205), (0.66, 0.012, 0.012), MAT["rail"], "actuation_kinematics", MO)
fl.add_box("i3dp_y_left_rail", (0.18, D/2, 1.18), (0.035, 0.70, 0.035), MAT["gantry"], "actuation_kinematics", MO)
fl.add_box("i3dp_y_right_rail", (0.82, D/2, 1.18), (0.035, 0.70, 0.035), MAT["gantry"], "actuation_kinematics", MO)
fl.add_box("i3dp_y_left_linear", (0.18, D/2, 1.215), (0.012, 0.64, 0.012), MAT["rail"], "actuation_kinematics", MO)
fl.add_box("i3dp_y_right_linear", (0.82, D/2, 1.215), (0.012, 0.64, 0.012), MAT["rail"], "actuation_kinematics", MO)
# Belt runs and pulleys
fl.add_box("i3dp_x_belt_front", (W/2, 0.435, 1.245), (0.68, 0.010, 0.010), MAT["belt"], "actuation_kinematics", MO)
fl.add_box("i3dp_x_belt_back", (W/2, 0.535, 1.245), (0.68, 0.010, 0.010), MAT["belt"], "actuation_kinematics", MO)
for x in [0.18, 0.82]:
    for y in [0.18, 0.82]:
        fl.add_cyl(f"i3dp_xy_pulley_{x:.2f}_{y:.2f}", (x, y, 1.23), 0.030, 0.018, MAT["rail"], "actuation_kinematics", MO)
# Stepper motors
fl.add_box("i3dp_x_stepper", (0.15, 0.50, 1.16), (0.07, 0.07, 0.07), MAT["motor"], "actuation_kinematics", MO)
fl.add_box("i3dp_y_stepper", (0.86, 0.18, 1.16), (0.07, 0.07, 0.07), MAT["motor"], "actuation_kinematics", MO)
for x in [0.24, 0.76]:
    fl.add_box(f"i3dp_z_stepper_{x:.2f}", (x, 0.90, 0.35), (0.07, 0.07, 0.07), MAT["motor"], "actuation_kinematics", MO)


# ═══════ Module — energy_conversion_transduction ═══════
# Heated build plate and print-head thermal/mechanical conversion components
fl.add_box("i3dp_build_plate_carrier", (W/2, D/2, 0.56), (0.68, 0.68, 0.035), MAT["aluminium"], "energy_conversion_transduction", MO)
fl.add_box("i3dp_heated_bed", (W/2, D/2, 0.595), (0.62, 0.62, 0.030), MAT["build_plate"], "energy_conversion_transduction", MO)
fl.add_box("i3dp_bed_heater_trace", (W/2, D/2, 0.615), (0.56, 0.56, 0.006), MAT["heater"], "energy_conversion_transduction", MO)
for x in [0.26, 0.74]:
    for y in [0.26, 0.74]:
        fl.add_cyl(f"i3dp_bed_level_knob_{x:.2f}_{y:.2f}", (x, y, 0.525), 0.026, 0.020, MAT["maint"], "energy_conversion_transduction", MO)
# Print head carriage, extruder, hotend and nozzle
fl.add_box("i3dp_printhead_carriage", (0.52, 0.48, 1.13), (0.13, 0.09, 0.10), MAT["printhead"], "energy_conversion_transduction", MO)
fl.add_cyl("i3dp_extruder_drive", (0.48, 0.48, 1.17), 0.035, 0.035, MAT["motor"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_filament_drive_block", (0.55, 0.48, 1.18), (0.050, 0.055, 0.055), MAT["printhead"], "energy_conversion_transduction", MO)
fl.add_cyl("i3dp_hotend_heatbreak", (0.52, 0.48, 1.065), 0.014, 0.060, MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_cyl("i3dp_hotend_heater_block", (0.52, 0.48, 1.020), 0.026, 0.035, MAT["hotend"], "energy_conversion_transduction", MO)
fl.add_cyl("i3dp_nozzle", (0.52, 0.48, 0.990), 0.010, 0.035, MAT["copper"], "energy_conversion_transduction", MO)
fl.add_cyl("i3dp_part_cooling_fan", (0.59, 0.46, 1.105), 0.035, 0.018, MAT["ctrl_black"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
# Filament spools and filament path
for i, x in enumerate([0.28, 0.50, 0.72]):
    fl.add_torus(f"i3dp_filament_spool_{i}", (x, 0.965, 1.39), 0.075, 0.018, MAT["spool"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"i3dp_spool_core_{i}", (x, 0.965, 1.39), 0.030, 0.030, MAT["ctrl_black"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("i3dp_filament_tube_A", (0.45, 0.73, 1.30), 0.006, 0.48, MAT["filament"], "energy_conversion_transduction", MO, rotation=(math.radians(72), 0, 0))
fl.add_cyl("i3dp_filament_tube_B", (0.52, 0.58, 1.21), 0.006, 0.26, MAT["filament"], "energy_conversion_transduction", MO, rotation=(math.radians(55), 0, math.radians(8)))


# ═══════ Module — sensing_instrumentation ═══════
fl.add_box("i3dp_bed_thermistor", (0.35, 0.35, 0.625), (0.025, 0.020, 0.008), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_nozzle_thermistor", (0.555, 0.48, 1.020), (0.014, 0.010, 0.014), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_filament_runout_sensor", (0.18, 0.90, 1.30), (0.060, 0.040, 0.050), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_chamber_temp_sensor", (0.08, 0.88, 1.10), (0.035, 0.025, 0.030), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_door_closed_sensor", (0.14, 0.030, 1.18), (0.025, 0.018, 0.030), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_x_home_switch", (0.17, 0.44, 1.23), (0.030, 0.016, 0.020), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_y_home_switch", (0.84, 0.18, 1.23), (0.030, 0.016, 0.020), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("i3dp_z_probe", (0.575, 0.52, 1.045), (0.018, 0.018, 0.070), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("i3dp_chamber_camera_lens", (0.12, 0.12, 1.22), 0.018, 0.014, MAT["lens"], "sensing_instrumentation", MO, rotation=(math.radians(45), 0, math.radians(-35)))
fl.add_box("i3dp_camera_body", (0.105, 0.105, 1.22), (0.045, 0.035, 0.035), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — control_compute_communication ═══════
fl.add_box("i3dp_main_controller_pcb", (0.72, 0.90, 0.20), (0.20, 0.010, 0.15), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("i3dp_motion_controller", (0.48, 0.90, 0.20), (0.16, 0.010, 0.11), MAT["control"], "control_compute_communication", MO)
for i, x in enumerate([0.36, 0.43, 0.50, 0.57, 0.64]):
    fl.add_box(f"i3dp_stepper_driver_{i}", (x, 0.885, 0.30), (0.045, 0.020, 0.055), MAT["inverter"], "control_compute_communication", MO)
    fl.add_box(f"i3dp_driver_heatsink_{i}", (x, 0.867, 0.30), (0.040, 0.010, 0.050), MAT["heatsink"], "control_compute_communication", MO)
fl.add_box("i3dp_wifi_module", (0.84, 0.90, 0.30), (0.055, 0.010, 0.035), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("i3dp_wifi_antenna", (0.88, 0.95, 0.38), 0.004, 0.16, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("i3dp_usb_service_mcu", (0.82, 0.90, 0.145), (0.075, 0.010, 0.035), MAT["control"], "control_compute_communication", MO)
fl.add_box("i3dp_led_controller", (0.25, 0.06, 1.40), (0.11, 0.010, 0.035), MAT["control"], "control_compute_communication", MO)


# ═══════ Module — safety_protection ═══════
fl.add_cyl("i3dp_front_estop_button", (0.86, 0.006, 1.15), 0.035, 0.020, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("i3dp_estop_yellow_collar", (0.86, 0.012, 1.15), 0.048, 0.010, MAT["warning"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_door_interlock_latch", (0.83, 0.032, 1.04), (0.045, 0.025, 0.060), MAT["safety"], "safety_protection", MO)
fl.add_box("i3dp_thermal_fuse_bed", (0.66, 0.34, 0.625), (0.035, 0.018, 0.010), MAT["safety"], "safety_protection", MO)
fl.add_box("i3dp_thermal_fuse_hotend", (0.49, 0.43, 1.035), (0.018, 0.012, 0.018), MAT["safety"], "safety_protection", MO)
fl.add_box("i3dp_ac_breaker", (0.15, 0.90, 0.20), (0.070, 0.020, 0.11), MAT["safety"], "safety_protection", MO)
fl.add_box("i3dp_mains_relay", (0.25, 0.90, 0.20), (0.080, 0.020, 0.08), MAT["safety"], "safety_protection", MO)
fl.add_box("i3dp_smoke_sensor", (0.88, 0.80, 1.28), (0.055, 0.035, 0.030), MAT["safety"], "safety_protection", MO)
fl.add_box("i3dp_ground_bond_strap", (0.50, 0.94, 0.08), (0.30, 0.012, 0.006), MAT["copper"], "safety_protection", MO)
for i, x in enumerate([0.18, 0.32, 0.46]):
    fl.add_box(f"i3dp_warning_label_{i}", (x, 0.006, 0.24), (0.090, 0.004, 0.040), MAT["warning"], "safety_protection", MO)


# ═══════ Module — power_distribution ═══════
fl.add_box("i3dp_ac_inlet_socket", (0.08, 0.965, 0.12), (0.060, 0.020, 0.055), MAT["ctrl_black"], "power_distribution", MO)
fl.add_box("i3dp_24v_psu", (0.24, 0.72, 0.17), (0.24, 0.13, 0.10), MAT["powerdist"], "power_distribution", MO)
fl.add_box("i3dp_48v_psu", (0.52, 0.72, 0.17), (0.24, 0.13, 0.10), MAT["powerdist"], "power_distribution", MO)
fl.add_box("i3dp_bed_heater_ssr", (0.74, 0.72, 0.17), (0.10, 0.09, 0.075), MAT["inverter"], "power_distribution", MO)
fl.add_box("i3dp_dc_busbar_pos", (0.48, 0.80, 0.30), (0.50, 0.018, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_box("i3dp_dc_busbar_neg", (0.48, 0.84, 0.30), (0.50, 0.018, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_cyl("i3dp_bed_power_cable", (0.50, 0.63, 0.44), 0.008, 0.34, MAT["copper"], "power_distribution", MO)
fl.add_cyl("i3dp_head_harness_vertical", (0.70, 0.50, 0.95), 0.007, 0.58, MAT["copper"], "power_distribution", MO)
fl.add_cyl("i3dp_head_harness_loop", (0.61, 0.49, 1.18), 0.007, 0.22, MAT["copper"], "power_distribution", MO, rotation=(0, math.radians(72), 0))
for x in [0.34, 0.46, 0.58, 0.70]:
    fl.add_box(f"i3dp_cable_terminal_{x:.2f}", (x, 0.86, 0.33), (0.045, 0.025, 0.025), MAT["copper"], "power_distribution", MO)


# ═══════ Module — hmi_ergonomics ═══════
fl.add_box("i3dp_touchscreen_bezel", (0.72, 0.004, 1.06), (0.22, 0.012, 0.15), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_box("i3dp_touchscreen", (0.72, -0.003, 1.06), (0.19, 0.006, 0.115), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("i3dp_print_pause_button", (0.61, -0.004, 0.92), (0.055, 0.008, 0.035), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("i3dp_job_knob_body", (0.79, 0.006, 0.92), (0.050, 0.012, 0.050), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("i3dp_job_knob", (0.79, -0.004, 0.92), 0.026, 0.012, MAT["hmi"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_status_led_bar", (0.50, -0.004, 1.39), (0.48, 0.007, 0.030), MAT["hmi"], "hmi_ergonomics", MO)
for i, x in enumerate([0.30, 0.38, 0.46, 0.54, 0.62, 0.70]):
    fl.add_cyl(f"i3dp_status_led_{i}", (x, -0.008, 1.39), 0.012, 0.006, MAT["sensor" if i < 4 else "warning"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_door_pull_handle", (0.50, -0.006, 0.82), (0.24, 0.018, 0.045), MAT["maint"], "hmi_ergonomics", MO)
fl.add_torus("i3dp_door_handle_grip", (0.50, -0.018, 0.82), 0.080, 0.008, MAT["maint"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — maintenance_serviceability ═══════
fl.add_box("i3dp_service_panel_left_seam", (0.006, 0.50, 0.20), (0.004, 0.70, 0.010), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("i3dp_service_panel_right_seam", (0.994, 0.50, 0.20), (0.004, 0.70, 0.010), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("i3dp_left_service_handle", (0.000, 0.55, 0.24), (0.010, 0.10, 0.035), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("i3dp_right_service_handle", (1.000, 0.55, 0.24), (0.010, 0.10, 0.035), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("i3dp_usb_ethernet_service_port", (0.30, -0.004, 0.14), (0.090, 0.006, 0.040), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("i3dp_filter_access_latch", (0.88, 0.965, 1.18), (0.070, 0.010, 0.035), MAT["maint"], "maintenance_serviceability", MO)
for x in [0.20, 0.80]:
    fl.add_cyl(f"i3dp_roof_lift_eye_{x:.2f}", (x, 0.50, 1.56), 0.030, 0.025, MAT["maint"], "maintenance_serviceability", MO)
for i, x in enumerate([0.18, 0.30, 0.42, 0.54]):
    fl.add_box(f"i3dp_qr_service_label_{i}", (x, -0.004, 0.07), (0.070, 0.004, 0.032), MAT["maint"], "maintenance_serviceability", MO)


# ═══════ Module — environmental_interface ═══════
fl.add_box("i3dp_hepa_carbon_filter", (0.82, 0.92, 1.16), (0.22, 0.040, 0.16), MAT["filter_media"], "environmental_interface", MO)
fl.add_cyl("i3dp_chamber_exhaust_fan", (0.82, 0.94, 1.31), 0.065, 0.035, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_exhaust_duct", (0.82, 0.985, 1.31), (0.18, 0.030, 0.080), MAT["thermal"], "environmental_interface", MO)
fl.add_box("i3dp_intake_louver_left", (0.08, 0.020, 0.22), (0.09, 0.012, 0.12), MAT["thermal"], "environmental_interface", MO)
fl.add_box("i3dp_intake_louver_right", (0.92, 0.020, 0.22), (0.09, 0.012, 0.12), MAT["thermal"], "environmental_interface", MO)
for i in range(5):
    fl.add_box(f"i3dp_louver_slat_{i}", (0.08, 0.010, 0.18 + i * 0.025), (0.10, 0.008, 0.006), MAT["ctrl_black"], "environmental_interface", MO)
    fl.add_box(f"i3dp_louver_slat_R_{i}", (0.92, 0.010, 0.18 + i * 0.025), (0.10, 0.008, 0.006), MAT["ctrl_black"], "environmental_interface", MO)
fl.add_box("i3dp_chamber_heater", (0.16, 0.86, 0.58), (0.12, 0.030, 0.070), MAT["heater"], "environmental_interface", MO)
fl.add_cyl("i3dp_recirculation_fan", (0.17, 0.88, 0.70), 0.050, 0.030, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_acoustic_foam_back", (0.50, 0.955, 0.86), (0.72, 0.010, 0.62), MAT["thermal"], "environmental_interface", MO)


# ═══════ Module — mass_fluid_transport_process ═══════
# Filament storage/drying and material-feed path
fl.add_box("i3dp_filament_dryer_cabinet", (0.16, 0.50, 0.25), (0.22, 0.42, 0.22), MAT["dryer"], "mass_fluid_transport_process", MO)
fl.add_box("i3dp_dryer_heated_shelf", (0.16, 0.50, 0.29), (0.18, 0.34, 0.018), MAT["heater"], "mass_fluid_transport_process", MO)
fl.add_cyl("i3dp_dryer_spool_A", (0.16, 0.42, 0.25), 0.070, 0.050, MAT["spool"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("i3dp_dryer_spool_B", (0.16, 0.58, 0.25), 0.070, 0.050, MAT["spool"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_desiccant_pack", (0.16, 0.70, 0.18), (0.16, 0.055, 0.040), MAT["filter_media"], "mass_fluid_transport_process", MO)
fl.add_cyl("i3dp_feed_tube_from_dryer", (0.23, 0.62, 0.68), 0.007, 0.82, MAT["filament"], "mass_fluid_transport_process", MO, rotation=(math.radians(16), 0, math.radians(-8)))
fl.add_cyl("i3dp_feed_tube_to_printhead", (0.38, 0.58, 1.08), 0.007, 0.38, MAT["filament"], "mass_fluid_transport_process", MO, rotation=(math.radians(45), 0, math.radians(-18)))
fl.add_box("i3dp_filament_buffer", (0.30, 0.84, 1.18), (0.11, 0.055, 0.070), MAT["dryer"], "mass_fluid_transport_process", MO)
fl.add_cyl("i3dp_buffer_drive_wheel", (0.30, 0.815, 1.18), 0.026, 0.018, MAT["motor"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("i3dp_purge_waste_bin", (0.78, 0.16, 0.48), (0.13, 0.13, 0.10), MAT["maint"], "mass_fluid_transport_process", MO)


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")