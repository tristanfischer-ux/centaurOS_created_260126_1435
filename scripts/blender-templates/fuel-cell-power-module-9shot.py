"""fuel-cell-power-module-9shot.py — PEM fuel cell outdoor IP54 cabinet power module.

Envelope 1.2 × 0.8 × 1.6 m. All components are packed inside the cabinet:
transparent/ghostable outer shell, central PEM stack, compressor, humidifier,
cooling loop, DC-DC converter, cold-start battery, controls, sensing, safety,
service access, and front HMI.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P fuel-cell-power-module-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-fuel-cell-power-module-9shot")))

W = 1.2
D = 0.8
H = 1.6

MO = fl.make_module_dict([
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "environmental_interface",
    "mass_fluid_transport_process",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
    "hmi_ergonomics",
])

MAT = fl.make_default_palette()
MAT["cabinet_panel"] = fl.make_mat("m_fc_cabinet_panel", (0.82, 0.86, 0.90), metallic=0.15, roughness=0.42, alpha=0.32)
MAT["pem_stack"] = fl.make_mat("m_pem_stack_blue", (0.00, 0.22, 1.00), metallic=0.05, roughness=0.38)
MAT["pem_plate"] = fl.make_mat("m_pem_bipolar_plate", (0.00, 0.75, 1.00), metallic=0.10, roughness=0.35)
MAT["end_plate"] = fl.make_mat("m_pem_end_plate", (0.02, 0.05, 0.12), metallic=0.45, roughness=0.30)
MAT["tie_rod"] = fl.make_mat("m_pem_tie_rod", (0.95, 0.96, 0.98), metallic=0.80, roughness=0.25)
MAT["h2_green"] = fl.make_mat("m_hydrogen_green", (0.00, 1.00, 0.25), metallic=0.05, roughness=0.42)
MAT["air_cyan"] = fl.make_mat("m_process_air_cyan", (0.00, 0.88, 1.00), metallic=0.05, roughness=0.38)
MAT["coolant_blue"] = fl.make_mat("m_coolant_blue", (0.00, 0.22, 1.00), metallic=0.15, roughness=0.34)
MAT["radiator_dark"] = fl.make_mat("m_radiator_dark", (0.04, 0.07, 0.11), metallic=0.45, roughness=0.36)
MAT["dc_converter"] = fl.make_mat("m_dc_converter_violet", (0.70, 0.00, 1.00), metallic=0.10, roughness=0.46)
MAT["pcb_substrate"] = fl.make_mat("m_control_pcb_bright", (0.00, 0.85, 0.18), metallic=0.00, roughness=0.50)
MAT["insulator"] = fl.make_mat("m_orange_insulator", (1.00, 0.36, 0.00), metallic=0.00, roughness=0.48)
MAT["sensor_green"] = fl.make_mat("m_sensor_lime", (0.10, 1.00, 0.00), metallic=0.00, roughness=0.45)
MAT["service_magenta"] = fl.make_mat("m_service_magenta", (1.00, 0.00, 0.62), metallic=0.00, roughness=0.48)


# ═══════ Module — structure_containment: IP54 cabinet shell/frame only ═══════
fl.add_box("fc1_bottom_panel", (W/2, 0.0, 0.025), (W, D, 0.050), MAT["cabinet_panel"], "structure_containment", MO)
fl.add_box("fc1_top_panel", (W/2, 0.0, H - 0.025), (W, D, 0.050), MAT["cabinet_panel"], "structure_containment", MO)
fl.add_box("fc1_front_door_panel", (W/2, -D/2 + 0.015, H/2), (W, 0.030, H), MAT["cabinet_panel"], "structure_containment", MO)
fl.add_box("fc1_rear_panel", (W/2, D/2 - 0.015, H/2), (W, 0.030, H), MAT["cabinet_panel"], "structure_containment", MO)
fl.add_box("fc1_left_side_panel", (0.015, 0.0, H/2), (0.030, D, H), MAT["cabinet_panel"], "structure_containment", MO)
fl.add_box("fc1_right_side_panel", (W - 0.015, 0.0, H/2), (0.030, D, H), MAT["cabinet_panel"], "structure_containment", MO)

for i, (x, y) in enumerate([(0.055, -0.345), (W - 0.055, -0.345), (0.055, 0.345), (W - 0.055, 0.345)]):
    fl.add_box(f"fc1_corner_post_{i}", (x, y, H/2), (0.055, 0.055, H - 0.08), MAT["stainless"], "structure_containment", MO)

for i, y in enumerate([-0.34, 0.34]):
    fl.add_box(f"fc1_lower_skid_rail_{i}", (W/2, y, 0.080), (W - 0.12, 0.045, 0.060), MAT["stainless"], "structure_containment", MO)
    fl.add_box(f"fc1_upper_frame_rail_{i}", (W/2, y, H - 0.080), (W - 0.12, 0.040, 0.045), MAT["stainless"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction: PEM stack ════════════════
STACK_X, STACK_Y, STACK_Z = 0.62, 0.00, 0.82
fl.add_box("fc2_pem_stack_core_600x400x400", (STACK_X, STACK_Y, STACK_Z), (0.600, 0.400, 0.400), MAT["pem_stack"], "energy_conversion_transduction", MO)
fl.add_box("fc2_pem_left_end_plate", (STACK_X - 0.315, STACK_Y, STACK_Z), (0.030, 0.440, 0.440), MAT["end_plate"], "energy_conversion_transduction", MO)
fl.add_box("fc2_pem_right_end_plate", (STACK_X + 0.315, STACK_Y, STACK_Z), (0.030, 0.440, 0.440), MAT["end_plate"], "energy_conversion_transduction", MO)

for i in range(18):
    x = STACK_X - 0.250 + i * 0.029
    fl.add_box(f"fc2_bipolar_plate_{i:02d}", (x, STACK_Y, STACK_Z), (0.006, 0.425, 0.390), MAT["pem_plate"], "energy_conversion_transduction", MO)

for i, (y, z) in enumerate([(-0.190, STACK_Z - 0.190), (0.190, STACK_Z - 0.190), (-0.190, STACK_Z + 0.190), (0.190, STACK_Z + 0.190)]):
    fl.add_cyl(f"fc2_tie_rod_{i}", (STACK_X, y, z), 0.010, 0.680, MAT["tie_rod"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))

fl.add_box("fc2_anode_manifold", (STACK_X, -0.235, STACK_Z + 0.060), (0.520, 0.040, 0.090), MAT["h2_green"], "energy_conversion_transduction", MO)
fl.add_box("fc2_cathode_manifold", (STACK_X, 0.235, STACK_Z - 0.060), (0.520, 0.040, 0.090), MAT["air_cyan"], "energy_conversion_transduction", MO)
fl.add_box("fc2_coolant_manifold", (STACK_X, 0.000, STACK_Z - 0.245), (0.500, 0.090, 0.040), MAT["coolant_blue"], "energy_conversion_transduction", MO)


# ═══════ Module — mass_fluid_transport_process: air + H2 routing ═══════════
fl.add_cyl("fc3_air_compressor_250dia", (0.205, -0.115, 0.790), 0.125, 0.350, MAT["motor"], "mass_fluid_transport_process", MO)
fl.add_cyl("fc3_compressor_scroll_cover", (0.205, -0.115, 0.990), 0.105, 0.045, MAT["air_cyan"], "mass_fluid_transport_process", MO)
fl.add_cyl("fc3_air_filter_canister", (0.205, -0.265, 0.790), 0.060, 0.180, MAT["heatsink"], "mass_fluid_transport_process", MO)
fl.add_cyl("fc3_filter_to_compressor_duct", (0.205, -0.190, 0.790), 0.018, 0.155, MAT["air_cyan"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("fc3_compressor_to_stack_air_line", (0.390, 0.235, 0.760), 0.018, 0.350, MAT["air_cyan"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fc3_air_line_drop", (0.545, 0.235, 0.790), 0.014, 0.100, MAT["air_cyan"], "mass_fluid_transport_process", MO)
fl.add_cyl("fc3_exhaust_outlet_rear_wall", (0.660, 0.365, 1.080), 0.045, 0.060, MAT["air_cyan"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("fc3_exhaust_line_from_stack", (0.660, 0.300, 1.020), 0.016, 0.150, MAT["air_cyan"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))

fl.add_cyl("fc3_h2_inlet_port_right_wall", (1.165, -0.225, 0.540), 0.035, 0.050, MAT["h2_green"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fc3_h2_inlet_to_shutoff_line", (1.065, -0.225, 0.540), 0.014, 0.180, MAT["h2_green"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fc3_h2_line_to_humidifier_x", (1.015, -0.070, 0.690), 0.012, 0.290, MAT["h2_green"], "mass_fluid_transport_process", MO)
fl.add_cyl("fc3_h2_line_to_humidifier_y", (1.015, 0.020, 0.835), 0.012, 0.245, MAT["h2_green"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("fc3_humidifier_to_stack_h2_line", (0.850, -0.235, 0.900), 0.014, 0.320, MAT["h2_green"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_box("fc3_h2_purge_valve_block", (0.870, -0.290, 0.720), (0.075, 0.050, 0.060), MAT["h2_green"], "mass_fluid_transport_process", MO)
fl.add_cyl("fc3_purge_line_to_rear", (0.870, 0.030, 0.720), 0.010, 0.600, MAT["h2_green"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — environmental_interface: humidifier + cooling loop ═══════
fl.add_cyl("fc4_hydrogen_humidifier_150dia", (1.010, 0.105, 0.825), 0.075, 0.300, MAT["thermal"], "environmental_interface", MO)
fl.add_cyl("fc4_humidifier_top_cap", (1.010, 0.105, 0.990), 0.078, 0.030, MAT["h2_green"], "environmental_interface", MO)
fl.add_cyl("fc4_humidifier_bottom_cap", (1.010, 0.105, 0.660), 0.078, 0.030, MAT["h2_green"], "environmental_interface", MO)
fl.add_box("fc4_humidifier_water_jacket", (1.010, 0.105, 0.825), (0.170, 0.170, 0.180), MAT["coolant_blue"], "environmental_interface", MO)

fl.add_cyl("fc4_cooling_pump", (0.305, 0.205, 0.265), 0.070, 0.120, MAT["motor"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fc4_pump_impeller_housing", (0.365, 0.205, 0.265), 0.055, 0.045, MAT["coolant_blue"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_box("fc4_radiator_core", (0.745, 0.235, 0.290), (0.360, 0.055, 0.255), MAT["radiator_dark"], "environmental_interface", MO)

for i in range(9):
    x = 0.590 + i * 0.038
    fl.add_box(f"fc4_radiator_fin_{i}", (x, 0.198, 0.290), (0.012, 0.030, 0.280), MAT["heatsink"], "environmental_interface", MO)

fl.add_cyl("fc4_radiator_fan_ring", (0.745, 0.175, 0.290), 0.095, 0.020, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
for i, ang in enumerate([0, 60, 120]):
    fl.add_box(f"fc4_fan_blade_{i}", (0.745, 0.155, 0.290), (0.150, 0.008, 0.026), MAT["heatsink"], "environmental_interface", MO, rotation=(0, 0, math.radians(ang)))

fl.add_cyl("fc4_coolant_pump_to_stack", (0.455, 0.205, 0.410), 0.012, 0.300, MAT["coolant_blue"], "environmental_interface", MO)
fl.add_cyl("fc4_coolant_stack_to_radiator", (0.720, 0.235, 0.535), 0.012, 0.520, MAT["coolant_blue"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fc4_radiator_return_line", (0.540, 0.235, 0.220), 0.012, 0.390, MAT["coolant_blue"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_box("fc4_condensate_trap", (1.025, 0.245, 0.525), (0.100, 0.055, 0.095), MAT["thermal"], "environmental_interface", MO)


# ═══════ Module — power_distribution: DC conversion and HV bus ═════════════
fl.add_box("fc5_dc_dc_converter_body", (0.620, -0.020, 1.300), (0.300, 0.200, 0.080), MAT["dc_converter"], "power_distribution", MO)
fl.add_box("fc5_dc_converter_mount_plate", (0.620, -0.020, 1.245), (0.360, 0.250, 0.025), MAT["powerdist"], "power_distribution", MO)

for i in range(8):
    x = 0.495 + i * 0.036
    fl.add_box(f"fc5_dc_converter_heatsink_fin_{i}", (x, -0.020, 1.375), (0.012, 0.205, 0.080), MAT["heatsink"], "power_distribution", MO)

for i, y in enumerate([-0.060, 0.000, 0.060]):
    fl.add_box(f"fc5_hv_busbar_{i}", (0.620, y, 1.170), (0.500, 0.014, 0.018), MAT["copper"], "power_distribution", MO)

fl.add_box("fc5_main_contactor", (0.355, -0.205, 1.105), (0.110, 0.080, 0.090), MAT["powerdist"], "power_distribution", MO)
fl.add_box("fc5_precharge_contactor", (0.485, -0.205, 1.105), (0.090, 0.070, 0.080), MAT["powerdist"], "power_distribution", MO)
fl.add_box("fc5_hv_fuse", (0.620, -0.205, 1.105), (0.110, 0.055, 0.060), MAT["safety"], "power_distribution", MO)
fl.add_box("fc5_lv_terminal_block", (0.795, -0.205, 1.105), (0.130, 0.060, 0.070), MAT["insulator"], "power_distribution", MO)
fl.add_box("fc5_grounding_strap", (0.220, 0.330, 0.135), (0.250, 0.018, 0.010), MAT["copper"], "power_distribution", MO)


# ═══════ Module — energy_storage_source: cold-start battery ════════════════
fl.add_box("fc6_cold_start_battery", (0.595, -0.180, 0.205), (0.300, 0.200, 0.150), MAT["battery"], "energy_storage_source", MO)
fl.add_box("fc6_battery_top_label", (0.595, -0.180, 0.286), (0.240, 0.150, 0.010), MAT["insulator"], "energy_storage_source", MO)
fl.add_cyl("fc6_battery_positive_terminal", (0.500, -0.245, 0.300), 0.018, 0.026, MAT["safety"], "energy_storage_source", MO)
fl.add_cyl("fc6_battery_negative_terminal", (0.690, -0.245, 0.300), 0.018, 0.026, MAT["ctrl_black"], "energy_storage_source", MO)
fl.add_box("fc6_battery_hold_down_front", (0.595, -0.285, 0.230), (0.340, 0.018, 0.030), MAT["stainless"], "energy_storage_source", MO)
fl.add_box("fc6_battery_hold_down_rear", (0.595, -0.075, 0.230), (0.340, 0.018, 0.030), MAT["stainless"], "energy_storage_source", MO)


# ═══════ Module — control_compute_communication: PCB stack top-front ═══════
for i, z in enumerate([1.160, 1.205, 1.250, 1.295]):
    fl.add_box(f"fc7_control_pcb_{i}", (0.255, -0.265, z), (0.210, 0.140, 0.010), MAT["pcb_substrate"], "control_compute_communication", MO)

for i, (x, y) in enumerate([(0.165, -0.325), (0.345, -0.325), (0.165, -0.205), (0.345, -0.205)]):
    fl.add_cyl(f"fc7_pcb_standoff_{i}", (x, y, 1.230), 0.008, 0.175, MAT["tie_rod"], "control_compute_communication", MO)

fl.add_box("fc7_cpu_module", (0.250, -0.265, 1.308), (0.055, 0.050, 0.020), MAT["control"], "control_compute_communication", MO)
fl.add_box("fc7_isolated_io_module", (0.315, -0.265, 1.308), (0.065, 0.045, 0.020), MAT["control"], "control_compute_communication", MO)
fl.add_box("fc7_can_ethernet_module", (0.190, -0.265, 1.308), (0.055, 0.045, 0.020), MAT["hmi"], "control_compute_communication", MO)
fl.add_cyl("fc7_internal_antenna", (0.255, -0.338, 1.390), 0.006, 0.130, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("fc7_wire_harness_tray", (0.385, -0.300, 1.180), (0.045, 0.110, 0.260), MAT["ctrl_black"], "control_compute_communication", MO)


# ═══════ Module — sensing_instrumentation: leak, temp, pressure sensors ════
fl.add_box("fc8_h2_leak_sensor", (0.945, -0.305, 1.255), (0.070, 0.035, 0.055), MAT["sensor_green"], "sensing_instrumentation", MO)

for i, (x, z) in enumerate([(0.410, 0.660), (0.540, 1.000), (0.710, 0.660), (0.830, 1.000)]):
    fl.add_cyl(f"fc8_stack_temp_sensor_{i}", (x, -0.235, z), 0.010, 0.070, MAT["sensor_green"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))

fl.add_cyl("fc8_h2_pressure_sensor", (0.925, -0.255, 0.900), 0.026, 0.040, MAT["sensor_green"], "sensing_instrumentation", MO)
fl.add_box("fc8_air_flow_sensor", (0.495, 0.235, 0.760), (0.055, 0.050, 0.040), MAT["sensor_green"], "sensing_instrumentation", MO)
fl.add_box("fc8_coolant_flow_sensor", (0.610, 0.235, 0.535), (0.060, 0.045, 0.040), MAT["sensor_green"], "sensing_instrumentation", MO)
fl.add_cyl("fc8_stack_voltage_tap_harness", (0.620, -0.245, 0.985), 0.008, 0.500, MAT["sensor_green"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — safety_protection: PRV + emergency shutoff ═══════════════
fl.add_cyl("fc9_prv_on_h2_humidifier", (1.010, 0.105, 1.050), 0.030, 0.065, MAT["safety"], "safety_protection", MO)
fl.add_cyl("fc9_prv_vent_stub", (1.010, 0.175, 1.075), 0.012, 0.120, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("fc9_emergency_shutoff_valve_body", (1.010, -0.225, 0.540), (0.075, 0.070, 0.065), MAT["safety"], "safety_protection", MO)
fl.add_cyl("fc9_shutoff_valve_handle", (1.010, -0.225, 0.595), 0.040, 0.012, MAT["safety"], "safety_protection", MO)
fl.add_box("fc9_h2_flame_arrestor", (0.940, -0.225, 0.540), (0.070, 0.050, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("fc9_door_interlock_switch", (0.095, -0.350, 1.045), (0.050, 0.030, 0.070), MAT["safety"], "safety_protection", MO)
fl.add_cyl("fc9_internal_estop_contact_block", (0.190, -0.350, 1.405), 0.035, 0.030, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — maintenance_serviceability: panel, hinges, ports ═════════
fl.add_box("fc10_service_access_panel", (1.188, 0.030, 0.840), (0.008, 0.360, 0.560), MAT["service_magenta"], "maintenance_serviceability", MO)
for i, z in enumerate([0.610, 0.840, 1.070]):
    fl.add_cyl(f"fc10_service_panel_hinge_{i}", (1.175, -0.165, z), 0.014, 0.070, MAT["service_magenta"], "maintenance_serviceability", MO)
fl.add_cyl("fc10_service_panel_latch", (1.176, 0.210, 0.840), 0.025, 0.018, MAT["service_magenta"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
fl.add_torus("fc10_pull_handle_upper", (1.176, 0.150, 0.970), 0.045, 0.007, MAT["service_magenta"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
fl.add_torus("fc10_pull_handle_lower", (1.176, 0.150, 0.710), 0.045, 0.007, MAT["service_magenta"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))

for i, x in enumerate([0.430, 0.500, 0.570]):
    fl.add_cyl(f"fc10_drain_service_port_{i}", (x, -0.350, 0.185), 0.017, 0.030, MAT["service_magenta"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — hmi_ergonomics: front door touchscreen and indicators ═══
fl.add_box("fc11_hmi_bezel", (0.310, -0.393, 1.365), (0.260, 0.008, 0.180), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("fc11_hmi_touchscreen", (0.310, -0.398, 1.365), (0.215, 0.004, 0.135), MAT["hmi"], "hmi_ergonomics", MO)

for i, (x, mat) in enumerate([(0.230, MAT["sensor_green"]), (0.310, MAT["control"]), (0.390, MAT["safety"])]):
    fl.add_cyl(f"fc11_front_button_{i}", (x, -0.396, 1.230), 0.018, 0.012, mat, "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))

for i, (z, mat) in enumerate([(1.465, MAT["sensor_green"]), (1.510, MAT["control"]), (1.555, MAT["safety"])]):
    fl.add_cyl(f"fc11_status_light_{i}", (0.495, -0.392, z), 0.025, 0.030, mat, "hmi_ergonomics", MO)

fl.add_box("fc11_front_label_plate", (0.310, -0.397, 1.135), (0.230, 0.004, 0.035), MAT["ctrl_black"], "hmi_ergonomics", MO)


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")