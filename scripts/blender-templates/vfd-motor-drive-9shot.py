"""vfd-motor-drive-9shot.py — wall-mounted variable-frequency motor drive, Siemens Sinamics / ABB ACS580 class.

Envelope 400 × 250 × 600 mm. IP21 metal cabinet with front HMI keypad, display,
status LEDs, bottom terminal bay, internal rectifier / DC link / IGBT power stack,
control electronics, sensing, protection, and forced-air cooling.

Outputs: 1 hero + 3 spatial + 9 module pages = 13 PNGs.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P vfd-motor-drive-9shot.py
"""
import bpy
import os
import math
import mathutils
import sys
from pathlib import Path

POC_DIR = Path(__file__).parent
sys.path.insert(0, str(POC_DIR))
import forge_blender_lib as fl

fl.init_scene()

OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-vfd-motor-drive-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 0.4
D = 0.25
H = 0.6

WALL_T = 0.012
BACK_T = 0.018
FRONT_Y = 0.0
BACK_Y = D

MO = fl.make_module_dict([
    "structure_containment",
    "energy_conversion_transduction",
    "environmental_interface",
    "sensing_instrumentation",
    "control_compute_communication",
    "safety_protection",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
])

MAT = fl.make_default_palette()
MAT.update({
    "emi_filter":     fl.make_mat("m_vfd_emi_filter",     (0.08, 0.20, 1.00), metallic=0.05, roughness=0.45),
    "rectifier":      fl.make_mat("m_vfd_rectifier",      (0.95, 0.10, 0.95), metallic=0.1, roughness=0.40),
    "dc_cap":         fl.make_mat("m_vfd_dc_cap",         (0.02, 0.10, 0.95), metallic=0.1, roughness=0.35),
    "igbt":           fl.make_mat("m_vfd_igbt",           (0.60, 0.00, 1.00), metallic=0.15, roughness=0.42),
    "reactor":        fl.make_mat("m_vfd_reactor",        (1.00, 0.35, 0.00), metallic=0.05, roughness=0.45),
    "terminal":       fl.make_mat("m_vfd_terminal",       (0.05, 0.07, 0.10), metallic=0.1, roughness=0.55),
    "keypad":         fl.make_mat("m_vfd_keypad",         (0.00, 0.35, 1.00), metallic=0.0, roughness=0.38),
    "display":        fl.make_mat("m_vfd_display",        (0.00, 0.85, 1.00), metallic=0.0, roughness=0.22),
    "button":         fl.make_mat("m_vfd_button",         (1.00, 0.55, 0.00), metallic=0.0, roughness=0.40),
    "led_green":      fl.make_mat("m_vfd_led_green",      (0.00, 1.00, 0.12), metallic=0.0, roughness=0.25),
    "led_red":        fl.make_mat("m_vfd_led_red",        (1.00, 0.00, 0.00), metallic=0.0, roughness=0.25),
    "fan":            fl.make_mat("m_vfd_fan_black",      (0.02, 0.025, 0.035), metallic=0.2, roughness=0.45),
    "insulator":      fl.make_mat("m_vfd_insulator",      (0.98, 0.92, 0.55), metallic=0.0, roughness=0.55),
    "warning":        fl.make_mat("m_vfd_warning_label",  (1.00, 0.80, 0.00), metallic=0.0, roughness=0.45),
    "ribbon":         fl.make_mat("m_vfd_ribbon",         (0.90, 0.90, 0.96), metallic=0.0, roughness=0.60),
})

# ═══════ Module — structure_containment ═══════
fl.add_box("vfd_backplate", (W/2, BACK_Y - BACK_T/2, H/2), (W, BACK_T, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_left_side", (WALL_T/2, D/2, H/2), (WALL_T, D, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_right_side", (W - WALL_T/2, D/2, H/2), (WALL_T, D, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_top_lid", (W/2, D/2, H - WALL_T/2), (W, D, WALL_T), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_bottom_gland_plate", (W/2, D/2, WALL_T/2), (W, D, WALL_T), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_front_door_left", (0.055, FRONT_Y + WALL_T/2, H/2), (0.11, WALL_T, H - 0.04), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_front_door_right", (W - 0.055, FRONT_Y + WALL_T/2, H/2), (0.11, WALL_T, H - 0.04), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_front_door_top", (W/2, FRONT_Y + WALL_T/2, H - 0.055), (W - 0.04, WALL_T, 0.09), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_front_door_bottom", (W/2, FRONT_Y + WALL_T/2, 0.07), (W - 0.04, WALL_T, 0.12), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_inner_chassis_L", (0.055, BACK_Y - 0.035, H/2), (0.018, 0.035, H - 0.08), MAT["powerdist"], "structure_containment", MO)
fl.add_box("vfd_inner_chassis_R", (W - 0.055, BACK_Y - 0.035, H/2), (0.018, 0.035, H - 0.08), MAT["powerdist"], "structure_containment", MO)
fl.add_box("vfd_middle_crossrail", (W/2, BACK_Y - 0.04, 0.28), (W - 0.08, 0.018, 0.025), MAT["powerdist"], "structure_containment", MO)
fl.add_box("vfd_terminal_bay_crossrail", (W/2, BACK_Y - 0.04, 0.135), (W - 0.08, 0.018, 0.025), MAT["powerdist"], "structure_containment", MO)
fl.add_box("vfd_wall_mount_flange_top", (W/2, BACK_Y + 0.012, H + 0.018), (0.16, 0.018, 0.035), MAT["enclosure"], "structure_containment", MO)
fl.add_box("vfd_wall_mount_flange_bottom", (W/2, BACK_Y + 0.012, -0.018), (0.16, 0.018, 0.035), MAT["enclosure"], "structure_containment", MO)
fl.add_cyl("vfd_mount_hole_top", (W/2, BACK_Y + 0.025, H + 0.018), 0.012, 0.006, MAT["powerdist"], "structure_containment", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("vfd_mount_hole_bottom", (W/2, BACK_Y + 0.025, -0.018), 0.012, 0.006, MAT["powerdist"], "structure_containment", MO, rotation=(math.radians(90), 0, 0))
for i, z in enumerate([0.20, 0.26, 0.32, 0.38, 0.44]):
    fl.add_box(f"vfd_ip21_louver_L_{i}", (0.018, FRONT_Y + 0.018, z), (0.004, 0.035, 0.010), MAT["enclosure"], "structure_containment", MO)
    fl.add_box(f"vfd_ip21_louver_R_{i}", (W - 0.018, FRONT_Y + 0.018, z), (0.004, 0.035, 0.010), MAT["enclosure"], "structure_containment", MO)

# ═══════ Module — energy_conversion_transduction ═══════
fl.add_box("vfd_emi_filter_block", (0.095, 0.155, 0.135), (0.090, 0.060, 0.060), MAT["emi_filter"], "energy_conversion_transduction", MO)
fl.add_box("vfd_rectifier_bridge", (0.105, 0.172, 0.255), (0.075, 0.050, 0.045), MAT["rectifier"], "energy_conversion_transduction", MO)
for i, x in enumerate([0.075, 0.105, 0.135]):
    fl.add_cyl(f"vfd_rectifier_diode_top_{i}", (x, 0.133, 0.285), 0.010, 0.022, MAT["rectifier"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"vfd_rectifier_diode_bottom_{i}", (x, 0.133, 0.225), 0.010, 0.022, MAT["rectifier"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.185, 0.225, 0.265, 0.305]):
    fl.add_cyl(f"vfd_dc_link_cap_{i}", (x, 0.155, 0.275), 0.018, 0.085, MAT["dc_cap"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"vfd_cap_top_vent_{i}", (x, 0.155, 0.320), 0.014, 0.004, MAT["aluminium"], "energy_conversion_transduction", MO)
fl.add_box("vfd_dc_link_bleeder_resistor", (0.285, 0.122, 0.342), (0.060, 0.012, 0.012), MAT["safety"], "energy_conversion_transduction", MO)
fl.add_box("vfd_igbt_power_module", (0.210, 0.205, 0.405), (0.150, 0.028, 0.095), MAT["igbt"], "energy_conversion_transduction", MO)
for i, x in enumerate([0.155, 0.190, 0.225, 0.260]):
    fl.add_cyl(f"vfd_igbt_mount_screw_{i}", (x, 0.188, 0.435), 0.006, 0.006, MAT["ctrl_black"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_brake_chopper_module", (0.330, 0.185, 0.405), (0.055, 0.030, 0.070), MAT["inverter"], "energy_conversion_transduction", MO)
fl.add_torus("vfd_output_ac_reactor_core", (0.303, 0.152, 0.205), 0.033, 0.010, MAT["reactor"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.277, 0.303, 0.329]):
    fl.add_cyl(f"vfd_reactor_winding_{i}", (x, 0.152, 0.205), 0.009, 0.060, MAT["copper"], "energy_conversion_transduction", MO)
fl.add_box("vfd_precharge_resistor", (0.170, 0.122, 0.335), (0.065, 0.014, 0.014), MAT["safety"], "energy_conversion_transduction", MO)

# ═══════ Module — environmental_interface ═══════
fl.add_box("vfd_heatsink_base", (0.210, BACK_Y - 0.010, 0.410), (0.180, 0.018, 0.145), MAT["heatsink"], "environmental_interface", MO)
for i, x in enumerate([0.135, 0.155, 0.175, 0.195, 0.215, 0.235, 0.255, 0.275]):
    fl.add_box(f"vfd_heatsink_fin_{i}", (x, BACK_Y + 0.008, 0.410), (0.006, 0.042, 0.145), MAT["heatsink"], "environmental_interface", MO)
fl.add_cyl("vfd_bottom_cooling_fan_ring", (0.305, FRONT_Y - 0.004, 0.085), 0.042, 0.012, MAT["fan"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
for a in [0, 45, 90, 135]:
    fl.add_box(f"vfd_bottom_fan_blade_{a}", (0.305, FRONT_Y - 0.012, 0.085), (0.060, 0.004, 0.010), MAT["fan"], "environmental_interface", MO, rotation=(0, math.radians(a), 0))
fl.add_cyl("vfd_top_exhaust_fan_ring", (0.302, FRONT_Y - 0.004, 0.515), 0.038, 0.012, MAT["fan"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
for a in [20, 65, 110, 155]:
    fl.add_box(f"vfd_top_fan_blade_{a}", (0.302, FRONT_Y - 0.012, 0.515), (0.054, 0.004, 0.009), MAT["fan"], "environmental_interface", MO, rotation=(0, math.radians(a), 0))
fl.add_box("vfd_air_duct_left", (0.065, 0.090, 0.405), (0.018, 0.050, 0.220), MAT["thermal"], "environmental_interface", MO)
fl.add_box("vfd_air_duct_right", (0.345, 0.090, 0.405), (0.018, 0.050, 0.220), MAT["thermal"], "environmental_interface", MO)
for i, x in enumerate([0.125, 0.160, 0.195, 0.230, 0.265]):
    fl.add_box(f"vfd_top_vent_slot_{i}", (x, 0.085, H + 0.004), (0.020, 0.095, 0.004), MAT["thermal"], "environmental_interface", MO)

# ═══════ Module — sensing_instrumentation ═══════
for i, x in enumerate([0.265, 0.305, 0.345]):
    fl.add_torus(f"vfd_output_current_sensor_{i}", (x, 0.107, 0.122), 0.014, 0.004, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_dc_bus_voltage_sense", (0.205, 0.112, 0.335), (0.050, 0.010, 0.018), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vfd_heatsink_ntc", (0.130, 0.185, 0.455), (0.018, 0.008, 0.014), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vfd_inlet_temp_sensor", (0.058, 0.070, 0.105), (0.016, 0.010, 0.014), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vfd_fan_tach_sensor", (0.350, 0.020, 0.090), (0.014, 0.010, 0.014), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vfd_phase_loss_detector", (0.102, 0.107, 0.195), (0.040, 0.010, 0.024), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("vfd_door_position_reed", (0.040, 0.028, 0.355), 0.006, 0.025, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vfd_control_io_analog_sense", (0.315, 0.080, 0.300), (0.045, 0.008, 0.020), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ Module — control_compute_communication ═══════
fl.add_box("vfd_main_control_pcb", (0.315, 0.075, 0.382), (0.100, 0.006, 0.145), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("vfd_dsp_controller", (0.315, 0.068, 0.405), (0.026, 0.006, 0.026), MAT["control"], "control_compute_communication", MO)
fl.add_box("vfd_memory_chip", (0.350, 0.068, 0.430), (0.020, 0.006, 0.014), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("vfd_rs485_comm_module", (0.285, 0.068, 0.465), (0.036, 0.006, 0.020), MAT["control"], "control_compute_communication", MO)
fl.add_box("vfd_isolated_dcdc_control_psu", (0.285, 0.070, 0.325), (0.040, 0.018, 0.026), MAT["inverter"], "control_compute_communication", MO)
fl.add_box("vfd_gate_driver_pcb", (0.185, 0.112, 0.478), (0.120, 0.006, 0.052), MAT["pcb"], "control_compute_communication", MO)
for i, x in enumerate([0.145, 0.175, 0.205, 0.235]):
    fl.add_box(f"vfd_gate_driver_optocoupler_{i}", (x, 0.105, 0.490), (0.014, 0.006, 0.012), MAT["control"], "control_compute_communication", MO)
fl.add_box("vfd_keypad_ribbon_cable", (0.214, 0.045, 0.475), (0.018, 0.010, 0.125), MAT["ribbon"], "control_compute_communication", MO)
fl.add_box("vfd_control_io_pcb", (0.322, 0.070, 0.245), (0.090, 0.006, 0.060), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("vfd_modbus_header", (0.348, 0.062, 0.245), (0.040, 0.008, 0.012), MAT["ctrl_black"], "control_compute_communication", MO)

# ═══════ Module — safety_protection ═══════
fl.add_box("vfd_input_fuse_L1", (0.064, 0.092, 0.082), (0.018, 0.024, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_input_fuse_L2", (0.094, 0.092, 0.082), (0.018, 0.024, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_input_fuse_L3", (0.124, 0.092, 0.082), (0.018, 0.024, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_dc_link_discharge_warning_cover", (0.245, 0.100, 0.345), (0.135, 0.006, 0.035), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_sto_relay_block", (0.335, 0.090, 0.185), (0.042, 0.026, 0.036), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_surge_mov_pack", (0.150, 0.100, 0.150), (0.040, 0.020, 0.030), MAT["safety"], "safety_protection", MO)
fl.add_cyl("vfd_pe_earth_stud", (0.052, 0.072, 0.045), 0.010, 0.014, MAT["copper"], "safety_protection", MO)
fl.add_box("vfd_arc_flash_barrier", (0.200, 0.095, 0.155), (0.006, 0.060, 0.120), MAT["insulator"], "safety_protection", MO)
fl.add_box("vfd_thermal_cutout_switch", (0.120, 0.184, 0.405), (0.020, 0.012, 0.018), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_control_terminal_esd_guard", (0.338, 0.052, 0.128), (0.076, 0.006, 0.018), MAT["safety"], "safety_protection", MO)

# ═══════ Module — power_distribution ═══════
for i, x in enumerate([0.060, 0.095, 0.130]):
    fl.add_box(f"vfd_input_terminal_{i}", (x, 0.030, 0.035), (0.026, 0.040, 0.032), MAT["terminal"], "power_distribution", MO)
    fl.add_box(f"vfd_input_copper_link_{i}", (x, 0.075, 0.090), (0.010, 0.055, 0.012), MAT["copper"], "power_distribution", MO)
for i, x in enumerate([0.245, 0.280, 0.315]):
    fl.add_box(f"vfd_output_terminal_{i}", (x, 0.030, 0.035), (0.026, 0.040, 0.032), MAT["terminal"], "power_distribution", MO)
    fl.add_box(f"vfd_output_copper_link_{i}", (x, 0.075, 0.142), (0.010, 0.055, 0.012), MAT["copper"], "power_distribution", MO)
fl.add_box("vfd_pe_terminal", (0.182, 0.030, 0.035), (0.030, 0.040, 0.032), MAT["copper"], "power_distribution", MO)
fl.add_box("vfd_control_io_terminal_strip", (0.325, 0.030, 0.110), (0.100, 0.030, 0.026), MAT["terminal"], "power_distribution", MO)
for i in range(8):
    fl.add_box(f"vfd_io_screw_{i}", (0.286 + i * 0.011, 0.012, 0.118), (0.006, 0.006, 0.006), MAT["aluminium"], "power_distribution", MO)
fl.add_box("vfd_dc_busbar_pos", (0.215, 0.117, 0.360), (0.160, 0.010, 0.012), MAT["copper"], "power_distribution", MO)
fl.add_box("vfd_dc_busbar_neg", (0.215, 0.137, 0.350), (0.160, 0.010, 0.012), MAT["copper"], "power_distribution", MO)
fl.add_box("vfd_inverter_phase_bus_U", (0.245, 0.112, 0.255), (0.010, 0.018, 0.145), MAT["copper"], "power_distribution", MO)
fl.add_box("vfd_inverter_phase_bus_V", (0.280, 0.112, 0.255), (0.010, 0.018, 0.145), MAT["copper"], "power_distribution", MO)
fl.add_box("vfd_inverter_phase_bus_W", (0.315, 0.112, 0.255), (0.010, 0.018, 0.145), MAT["copper"], "power_distribution", MO)
for i, x in enumerate([0.070, 0.115, 0.160, 0.250, 0.295, 0.340]):
    fl.add_cyl(f"vfd_bottom_cable_gland_{i}", (x, FRONT_Y + 0.010, 0.006), 0.012, 0.010, MAT["ctrl_black"], "power_distribution", MO)
fl.add_box("vfd_control_wire_loom", (0.350, 0.062, 0.188), (0.014, 0.014, 0.130), MAT["copper"], "power_distribution", MO)

# ═══════ Module — hmi_ergonomics ═══════
fl.add_box("vfd_keypad_bezel", (W/2, FRONT_Y - 0.006, 0.430), (0.160, 0.012, 0.170), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_box("vfd_lcd_display", (W/2, FRONT_Y - 0.014, 0.480), (0.115, 0.006, 0.045), MAT["display"], "hmi_ergonomics", MO)
for i, x in enumerate([0.165, 0.200, 0.235]):
    fl.add_cyl(f"vfd_soft_key_{i}", (x, FRONT_Y - 0.016, 0.432), 0.010, 0.006, MAT["button"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for r, z in enumerate([0.390, 0.360, 0.330]):
    for c, x in enumerate([0.165, 0.200, 0.235]):
        fl.add_cyl(f"vfd_keypad_button_{r}_{c}", (x, FRONT_Y - 0.016, z), 0.008, 0.006, MAT["button"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("vfd_run_led", (0.120, FRONT_Y - 0.015, 0.510), 0.007, 0.006, MAT["led_green"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("vfd_fault_led", (0.120, FRONT_Y - 0.015, 0.485), 0.007, 0.006, MAT["led_red"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("vfd_comm_led", (0.120, FRONT_Y - 0.015, 0.460), 0.007, 0.006, MAT["led_green"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_front_brand_badge", (0.200, FRONT_Y - 0.013, 0.555), (0.110, 0.004, 0.020), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("vfd_keypad_escape_label", (0.154, FRONT_Y - 0.017, 0.300), (0.030, 0.003, 0.012), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("vfd_keypad_enter_label", (0.246, FRONT_Y - 0.017, 0.300), (0.030, 0.003, 0.012), MAT["hmi"], "hmi_ergonomics", MO)

# ═══════ Module — maintenance_serviceability ═══════
fl.add_box("vfd_front_door_handle", (W - 0.045, FRONT_Y - 0.012, 0.330), (0.018, 0.012, 0.090), MAT["maint"], "maintenance_serviceability", MO)
for i, z in enumerate([0.095, 0.300, 0.505]):
    fl.add_cyl(f"vfd_left_hinge_pin_{i}", (0.014, FRONT_Y - 0.006, z), 0.008, 0.040, MAT["maint"], "maintenance_serviceability", MO)
for i, (x, z) in enumerate([(0.040, 0.565), (0.360, 0.565), (0.040, 0.045), (0.360, 0.045)]):
    fl.add_cyl(f"vfd_captive_screw_{i}", (x, FRONT_Y - 0.014, z), 0.008, 0.006, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_nameplate_label", (0.118, FRONT_Y - 0.013, 0.220), (0.100, 0.004, 0.035), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_warning_label_high_voltage", (0.275, FRONT_Y - 0.013, 0.220), (0.100, 0.004, 0.035), MAT["warning"], "maintenance_serviceability", MO)
fl.add_box("vfd_qr_service_label", (0.105, FRONT_Y - 0.014, 0.170), (0.035, 0.004, 0.035), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_usb_service_port", (0.290, FRONT_Y - 0.016, 0.300), (0.040, 0.006, 0.018), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_removable_terminal_cover", (W/2, FRONT_Y - 0.010, 0.085), (0.300, 0.008, 0.105), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_cover_pull_tab", (W/2, FRONT_Y - 0.018, 0.142), (0.050, 0.008, 0.014), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_spare_fuse_clip", (0.065, 0.055, 0.175), (0.050, 0.012, 0.018), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_service_clearance_arrow", (0.325, FRONT_Y - 0.014, 0.560), (0.055, 0.004, 0.014), MAT["maint"], "maintenance_serviceability", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")