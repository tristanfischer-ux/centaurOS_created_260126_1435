"""pv-string-inverter-9shot.py — 5–30 kW wall-mounted PV string inverter, IP65 cabinet.

Typical residential/commercial string inverter envelope 650 × 300 × 800 mm.
Aluminium wall cabinet with rear/top heatsink fins, front LCD/buttons,
bottom MC4 DC inputs, AC output terminal block, Wi-Fi antenna, MPPT boards,
DSP controller, IGBT power stage, DC-link capacitors, AC magnetics, EMI filter,
cooling fan, sensing, safety and service features.

Outputs: 1 hero + 3 spatial + per-module pages.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P pv-string-inverter-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-pv-string-inverter-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 0.65
D = 0.3
H = 0.8

MODULE_IDS = [
    "structure_containment",
    "energy_conversion_transduction",
    "environmental_interface",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "hmi_ergonomics",
    "maintenance_serviceability",
]
MO = fl.make_module_dict(MODULE_IDS)

MAT = fl.make_default_palette()
MAT.update({
    "pv_mppt":        fl.make_mat("m_pv_mppt",        (0.00, 0.22, 1.00), metallic=0.0, roughness=0.42),
    "pv_power":       fl.make_mat("m_pv_power",       (0.75, 0.00, 1.00), metallic=0.0, roughness=0.45),
    "pv_dc_link":     fl.make_mat("m_pv_dc_link",     (0.00, 0.82, 1.00), metallic=0.15, roughness=0.30),
    "pv_magnetic":    fl.make_mat("m_pv_magnetic",    (1.00, 0.28, 0.00), metallic=0.10, roughness=0.45),
    "pv_emi":         fl.make_mat("m_pv_emi",         (1.00, 0.00, 0.18), metallic=0.0, roughness=0.50),
    "pv_terminal":    fl.make_mat("m_pv_terminal",    (0.08, 0.09, 0.12), metallic=0.35, roughness=0.45),
    "pv_lcd":         fl.make_mat("m_pv_lcd",         (0.00, 0.38, 1.00), metallic=0.0, roughness=0.25),
    "pv_button":      fl.make_mat("m_pv_button",      (0.00, 0.95, 0.20), metallic=0.0, roughness=0.40),
    "pv_seal":        fl.make_mat("m_pv_seal",        (0.02, 0.03, 0.04), metallic=0.0, roughness=0.80),
    "pv_wifi":        fl.make_mat("m_pv_wifi",        (0.02, 0.05, 0.12), metallic=0.30, roughness=0.45),
    "pv_fan":         fl.make_mat("m_pv_fan",         (0.03, 0.04, 0.06), metallic=0.05, roughness=0.55),
    "pv_label":       fl.make_mat("m_pv_label",       (1.00, 0.05, 0.55), metallic=0.0, roughness=0.50),
    "pv_gasket":      fl.make_mat("m_pv_gasket",      (0.00, 0.00, 0.00), metallic=0.0, roughness=0.85),
})

WALL = 0.018
FRONT_Y = -D / 2
BACK_Y = D / 2
MID_Y = 0.0

# ═══════ Module — structure_containment ═══════
fl.add_box("pvs_wall_mount_backplate", (W / 2, BACK_Y + 0.035, H / 2), (W + 0.08, 0.025, H + 0.08), MAT["powerdist"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_back_panel", (W / 2, BACK_Y - WALL / 2, H / 2), (W, WALL, H), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_front_door_skin", (W / 2, FRONT_Y + WALL / 2, H / 2), (W, WALL, H), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_left_side", (WALL / 2, MID_Y, H / 2), (WALL, D, H), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_right_side", (W - WALL / 2, MID_Y, H / 2), (WALL, D, H), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_top_cap", (W / 2, MID_Y, H - WALL / 2), (W, D, WALL), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_bottom_cap", (W / 2, MID_Y, WALL / 2), (W, D, WALL), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_front_display_recess_top", (W / 2, FRONT_Y - 0.004, 0.64), (0.42, 0.010, 0.025), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_front_display_recess_bottom", (W / 2, FRONT_Y - 0.004, 0.48), (0.42, 0.010, 0.025), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_front_display_recess_left", (0.135, FRONT_Y - 0.004, 0.56), (0.025, 0.010, 0.18), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("pvs_front_display_recess_right", (0.515, FRONT_Y - 0.004, 0.56), (0.025, 0.010, 0.18), MAT["enclosure"], module="structure_containment", module_objects=MO)
for i, x in enumerate([0.11, 0.25, 0.40, 0.54]):
    fl.add_box(f"pvs_internal_mount_rail_{i}", (x, BACK_Y - 0.035, H / 2), (0.018, 0.035, H - 0.12), MAT["powerdist"], module="structure_containment", module_objects=MO)
for i, (x, z) in enumerate([(0.07, 0.08), (0.58, 0.08), (0.07, 0.72), (0.58, 0.72)]):
    fl.add_cyl(f"pvs_panel_standoff_{i}", (x, BACK_Y - 0.055, z), 0.012, 0.030, MAT["stainless"], module="structure_containment", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pvs_bottom_gland_plate", (W / 2, MID_Y, -0.010), (0.50, 0.22, 0.018), MAT["enclosure"], module="structure_containment", module_objects=MO)

# ═══════ Module — energy_conversion_transduction ═══════
for i, x in enumerate([0.17, 0.325, 0.48]):
    fl.add_box(f"pvs_mppt_pcb_{i}", (x, -0.020, 0.57), (0.125, 0.008, 0.22), MAT["pv_mppt"], module="energy_conversion_transduction", module_objects=MO)
    fl.add_box(f"pvs_mppt_inductor_{i}", (x - 0.035, -0.040, 0.50), (0.040, 0.035, 0.045), MAT["pv_magnetic"], module="energy_conversion_transduction", module_objects=MO)
    fl.add_box(f"pvs_mppt_mosfet_bank_{i}", (x + 0.035, -0.044, 0.62), (0.050, 0.030, 0.080), MAT["pv_power"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pvs_igbt_power_module", (0.325, 0.060, 0.365), (0.280, 0.055, 0.130), MAT["pv_power"], module="energy_conversion_transduction", module_objects=MO)
for i, x in enumerate([0.215, 0.260, 0.305, 0.350, 0.395, 0.440]):
    fl.add_box(f"pvs_igbt_die_{i}", (x, 0.025, 0.385), (0.030, 0.018, 0.080), MAT["inverter"], module="energy_conversion_transduction", module_objects=MO)
for i, x in enumerate([0.19, 0.245, 0.300, 0.355, 0.410, 0.465]):
    fl.add_cyl(f"pvs_dc_link_cap_{i}", (x, -0.045, 0.315), 0.022, 0.115, MAT["pv_dc_link"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pvs_hf_transformer_core", (0.185, 0.005, 0.210), (0.110, 0.095, 0.110), MAT["pv_magnetic"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pvs_transformer_winding_A", (0.185, -0.055, 0.210), (0.080, 0.020, 0.085), MAT["copper"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pvs_transformer_winding_B", (0.185, 0.065, 0.210), (0.080, 0.020, 0.085), MAT["copper"], module="energy_conversion_transduction", module_objects=MO)
for i, x in enumerate([0.355, 0.455, 0.555]):
    fl.add_cyl(f"pvs_ac_filter_inductor_{i}", (x, 0.010, 0.205), 0.034, 0.075, MAT["pv_magnetic"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pvs_ac_output_relay", (0.515, -0.050, 0.285), (0.080, 0.055, 0.060), MAT["inverter"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pvs_snubber_network", (0.120, -0.055, 0.360), (0.070, 0.040, 0.050), MAT["pv_dc_link"], module="energy_conversion_transduction", module_objects=MO)

# ═══════ Module — environmental_interface ═══════
for i in range(12):
    x = 0.075 + i * 0.045
    fl.add_box(f"pvs_rear_heatsink_fin_{i}", (x, BACK_Y + 0.040, 0.405), (0.010, 0.070, 0.650), MAT["heatsink"], module="environmental_interface", module_objects=MO)
fl.add_box("pvs_rear_heatsink_base", (W / 2, BACK_Y + 0.012, 0.405), (W - 0.08, 0.018, 0.670), MAT["heatsink"], module="environmental_interface", module_objects=MO)
for i in range(6):
    x = 0.145 + i * 0.070
    fl.add_box(f"pvs_top_heatsink_fin_{i}", (x, 0.035, H + 0.022), (0.012, 0.200, 0.045), MAT["thermal"], module="environmental_interface", module_objects=MO)
fl.add_box("pvs_power_cold_plate", (0.325, 0.095, 0.365), (0.320, 0.018, 0.160), MAT["heatsink"], module="environmental_interface", module_objects=MO)
fl.add_cyl("pvs_internal_cooling_fan_ring", (0.525, 0.060, 0.565), 0.065, 0.025, MAT["pv_fan"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("pvs_internal_cooling_fan_hub", (0.525, 0.045, 0.565), 0.018, 0.030, MAT["ctrl_black"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
for i, ang in enumerate([0, 60, 120, 180, 240, 300]):
    fl.add_box(f"pvs_fan_blade_{i}", (0.525, 0.030, 0.565), (0.012, 0.006, 0.090), MAT["pv_fan"], module="environmental_interface", module_objects=MO, rotation=(0, math.radians(ang), 0))
for i in range(5):
    fl.add_box(f"pvs_bottom_vent_slot_{i}", (0.455 + i * 0.025, FRONT_Y - 0.004, 0.090), (0.016, 0.006, 0.075), MAT["thermal"], module="environmental_interface", module_objects=MO)
for i, x in enumerate([0.245, 0.325, 0.405]):
    fl.add_box(f"pvs_thermal_pad_{i}", (x, 0.081, 0.365), (0.060, 0.006, 0.100), MAT["thermal"], module="environmental_interface", module_objects=MO)
fl.add_cyl("pvs_ip_breather_vent", (0.090, FRONT_Y - 0.010, 0.120), 0.018, 0.012, MAT["thermal"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("pvs_condensate_drain", (0.570, MID_Y, -0.022), 0.012, 0.018, MAT["thermal"], module="environmental_interface", module_objects=MO)

# ═══════ Module — power_distribution ═══════
for i, x in enumerate([0.120, 0.185, 0.250, 0.315]):
    fl.add_cyl(f"pvs_mc4_dc_input_pos_{i}", (x, -0.060, -0.045), 0.014, 0.090, MAT["pv_terminal"], module="power_distribution", module_objects=MO)
    fl.add_cyl(f"pvs_mc4_dc_input_ring_{i}", (x, -0.060, -0.002), 0.018, 0.018, MAT["pv_seal"], module="power_distribution", module_objects=MO)
for i, x in enumerate([0.390, 0.455]):
    fl.add_cyl(f"pvs_mc4_dc_input_neg_{i}", (x, -0.060, -0.045), 0.014, 0.090, MAT["pv_terminal"], module="power_distribution", module_objects=MO)
    fl.add_cyl(f"pvs_mc4_neg_ring_{i}", (x, -0.060, -0.002), 0.018, 0.018, MAT["pv_seal"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_dc_combiner_busbar_pos", (0.270, -0.065, 0.145), (0.290, 0.018, 0.018), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_dc_combiner_busbar_neg", (0.270, -0.090, 0.120), (0.290, 0.018, 0.018), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_ac_terminal_block", (0.505, -0.075, 0.115), (0.145, 0.050, 0.060), MAT["pv_terminal"], module="power_distribution", module_objects=MO)
for i, x in enumerate([0.455, 0.505, 0.555]):
    fl.add_box(f"pvs_ac_terminal_screw_{i}", (x, -0.105, 0.130), (0.026, 0.010, 0.014), MAT["stainless"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_pe_earth_bar", (0.525, 0.090, 0.080), (0.150, 0.016, 0.020), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_cyl("pvs_ac_cable_gland", (0.525, 0.055, -0.042), 0.026, 0.085, MAT["pv_seal"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_dc_to_power_bus_pos", (0.245, -0.045, 0.235), (0.018, 0.020, 0.200), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_dc_to_power_bus_neg", (0.285, -0.045, 0.235), (0.018, 0.020, 0.200), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pvs_ac_output_busbar", (0.480, -0.030, 0.190), (0.120, 0.020, 0.018), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_cyl("pvs_internal_harness_bundle", (0.585, -0.015, 0.395), 0.008, 0.420, MAT["copper"], module="power_distribution", module_objects=MO)

# ═══════ Module — control_compute_communication ═══════
fl.add_box("pvs_dsp_control_board", (0.485, -0.040, 0.585), (0.130, 0.008, 0.180), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("pvs_gate_driver_board", (0.485, -0.050, 0.420), (0.115, 0.008, 0.105), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("pvs_comms_board", (0.135, -0.055, 0.675), (0.100, 0.008, 0.075), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("pvs_wifi_radio_module", (0.090, -0.065, 0.630), (0.055, 0.010, 0.040), MAT["pv_wifi"], module="control_compute_communication", module_objects=MO)
fl.add_cyl("pvs_external_wifi_antenna", (W + 0.035, FRONT_Y + 0.045, 0.565), 0.007, 0.190, MAT["pv_wifi"], module="control_compute_communication", module_objects=MO)
fl.add_cyl("pvs_wifi_antenna_hinge", (W + 0.020, FRONT_Y + 0.045, 0.465), 0.018, 0.030, MAT["pv_wifi"], module="control_compute_communication", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("pvs_rs485_terminal", (0.120, -0.080, 0.590), (0.065, 0.026, 0.030), MAT["pv_terminal"], module="control_compute_communication", module_objects=MO)
fl.add_box("pvs_rtc_backup_cell", (0.555, -0.055, 0.665), (0.040, 0.018, 0.040), MAT["battery"], module="control_compute_communication", module_objects=MO)
fl.add_box("pvs_flat_flex_to_hmi", (0.325, FRONT_Y + 0.030, 0.540), (0.180, 0.004, 0.025), MAT["control"], module="control_compute_communication", module_objects=MO)

# ═══════ Module — safety_protection ═══════
fl.add_cyl("pvs_front_dc_isolator_knob", (0.115, FRONT_Y - 0.020, 0.335), 0.042, 0.026, MAT["safety"], module="safety_protection", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pvs_dc_isolator_body", (0.115, -0.055, 0.335), (0.095, 0.060, 0.095), MAT["safety"], module="safety_protection", module_objects=MO)
for i, x in enumerate([0.135, 0.195, 0.255]):
    fl.add_box(f"pvs_string_fuse_holder_{i}", (x, -0.070, 0.185), (0.040, 0.040, 0.090), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("pvs_dc_spd_module", (0.335, -0.070, 0.175), (0.065, 0.045, 0.095), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("pvs_ac_spd_module", (0.420, -0.070, 0.115), (0.060, 0.045, 0.070), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("pvs_emi_filter_can", (0.395, 0.055, 0.105), (0.095, 0.060, 0.060), MAT["pv_emi"], module="safety_protection", module_objects=MO)
fl.add_box("pvs_grounding_strap", (0.565, 0.040, 0.115), (0.020, 0.110, 0.006), MAT["copper"], module="safety_protection", module_objects=MO)
fl.add_box("pvs_door_interlock_switch", (0.605, FRONT_Y + 0.020, 0.705), (0.026, 0.025, 0.040), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("pvs_surge_mov_stack", (0.360, -0.035, 0.260), 0.019, 0.050, MAT["safety"], module="safety_protection", module_objects=MO)

# ═══════ Module — sensing_instrumentation ═══════
for i, x in enumerate([0.200, 0.270, 0.340]):
    fl.add_cyl(f"pvs_hall_current_sensor_{i}", (x, -0.052, 0.250), 0.020, 0.018, MAT["sensor"], module="sensing_instrumentation", module_objects=MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.185, 0.325, 0.465]):
    fl.add_box(f"pvs_voltage_sense_divider_{i}", (x, -0.070, 0.455), (0.050, 0.014, 0.024), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
for i, (x, z) in enumerate([(0.245, 0.410), (0.325, 0.410), (0.405, 0.410)]):
    fl.add_cyl(f"pvs_heatsink_thermistor_{i}", (x, 0.078, z), 0.010, 0.010, MAT["sensor"], module="sensing_instrumentation", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pvs_internal_temp_humidity_sensor", (0.565, -0.055, 0.500), (0.040, 0.014, 0.030), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("pvs_arc_fault_detector", (0.080, -0.060, 0.245), (0.055, 0.020, 0.055), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("pvs_residual_current_ct", (0.515, -0.040, 0.215), 0.026, 0.020, MAT["sensor"], module="sensing_instrumentation", module_objects=MO, rotation=(math.radians(90), 0, 0))

# ═══════ Module — hmi_ergonomics ═══════
fl.add_box("pvs_lcd_bezel", (0.325, FRONT_Y - 0.010, 0.580), (0.270, 0.012, 0.105), MAT["ctrl_black"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("pvs_lcd_screen", (0.325, FRONT_Y - 0.018, 0.585), (0.220, 0.006, 0.072), MAT["pv_lcd"], module="hmi_ergonomics", module_objects=MO)
for i, x in enumerate([0.250, 0.300, 0.350, 0.400]):
    fl.add_cyl(f"pvs_front_button_{i}", (x, FRONT_Y - 0.018, 0.482), 0.015, 0.010, MAT["pv_button"], module="hmi_ergonomics", module_objects=MO, rotation=(math.radians(90), 0, 0))
for i, (x, mat) in enumerate([(0.500, MAT["sensor"]), (0.535, MAT["maint"]), (0.570, MAT["safety"])]):
    fl.add_cyl(f"pvs_status_led_{i}", (x, FRONT_Y - 0.018, 0.650), 0.010, 0.008, mat, module="hmi_ergonomics", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pvs_brand_badge", (0.180, FRONT_Y - 0.016, 0.690), (0.120, 0.005, 0.035), MAT["pv_label"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("pvs_front_power_flow_icon", (0.470, FRONT_Y - 0.016, 0.515), (0.090, 0.005, 0.030), MAT["hmi"], module="hmi_ergonomics", module_objects=MO)
fl.add_torus("pvs_isolator_grip_ring", (0.115, FRONT_Y - 0.035, 0.335), 0.047, 0.006, MAT["maint"], module="hmi_ergonomics", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pvs_qr_pairing_label", (0.515, FRONT_Y - 0.016, 0.460), (0.070, 0.005, 0.045), MAT["pv_label"], module="hmi_ergonomics", module_objects=MO)

# ═══════ Module — maintenance_serviceability ═══════
fl.add_box("pvs_door_handle", (0.590, FRONT_Y - 0.020, 0.400), (0.030, 0.018, 0.180), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
for i, z in enumerate([0.235, 0.400, 0.565]):
    fl.add_cyl(f"pvs_left_hinge_barrel_{i}", (-0.010, FRONT_Y + 0.030, z), 0.014, 0.055, MAT["maint"], module="maintenance_serviceability", module_objects=MO)
for i, (x, z) in enumerate([(0.075, 0.055), (0.575, 0.055), (0.075, 0.745), (0.575, 0.745)]):
    fl.add_cyl(f"pvs_captive_door_screw_{i}", (x, FRONT_Y - 0.015, z), 0.011, 0.008, MAT["maint"], module="maintenance_serviceability", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pvs_service_usb_flap", (0.470, FRONT_Y - 0.017, 0.405), (0.060, 0.006, 0.035), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pvs_wiring_schedule_label", (0.325, FRONT_Y - 0.016, 0.190), (0.230, 0.005, 0.065), MAT["pv_label"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pvs_torque_label", (0.520, FRONT_Y - 0.016, 0.285), (0.090, 0.005, 0.050), MAT["pv_label"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pvs_desiccant_service_pack", (0.085, 0.060, 0.625), (0.050, 0.018, 0.070), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
for i, x in enumerate([0.180, 0.470]):
    fl.add_torus(f"pvs_wall_keyhole_slot_{i}", (x, BACK_Y + 0.050, 0.700), 0.026, 0.004, MAT["maint"], module="maintenance_serviceability", module_objects=MO, rotation=(math.radians(90), 0, 0))

fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")