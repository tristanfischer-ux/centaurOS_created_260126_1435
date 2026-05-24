"""fuel-cell-power-module-9shot.py — PEM fuel cell power module cabinet template.

Hand-coded ForgeOS Blender template for a typical 5-100 kW PEM fuel cell power
module. Envelope 1.2 × 0.8 × 1.6 m. Cabinet contains PEM stack, hydrogen
manifold, air compressor, humidifier, coolant loop, radiator, DC-DC converter,
cold-start battery, controls, sensors, safety devices, and operator HMI.

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

FRONT = -D / 2
BACK = D / 2
CX = W / 2

STACK_X = 0.48
STACK_Y = -0.08
STACK_Z = 0.72
STACK_W = 0.60
STACK_D = 0.40
STACK_H = 0.40

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
MAT["cabinet_window"] = fl.make_mat("m_fc_window_cyan", (0.00, 0.85, 1.00), metallic=0.0, roughness=0.25, alpha=0.28)
MAT["pem_plate"] = fl.make_mat("m_pem_plate_blue", (0.00, 0.18, 1.00), metallic=0.25, roughness=0.38)
MAT["pem_membrane"] = fl.make_mat("m_pem_membrane_red", (1.00, 0.04, 0.00), metallic=0.0, roughness=0.50)
MAT["h2"] = fl.make_mat("m_hydrogen_teal", (0.00, 1.00, 0.82), metallic=0.0, roughness=0.35)
MAT["air"] = fl.make_mat("m_air_cyan", (0.00, 0.62, 1.00), metallic=0.0, roughness=0.35)
MAT["coolant"] = fl.make_mat("m_coolant_blue", (0.02, 0.22, 1.00), metallic=0.15, roughness=0.30)
MAT["humidifier"] = fl.make_mat("m_humidifier_violet", (0.72, 0.00, 1.00), metallic=0.0, roughness=0.45)
MAT["radiator_core"] = fl.make_mat("m_radiator_core_cyan", (0.00, 0.90, 1.00), metallic=0.30, roughness=0.32)
MAT["dc_converter"] = fl.make_mat("m_dc_converter_purple", (0.82, 0.00, 1.00), metallic=0.0, roughness=0.42)
MAT["battery_cell"] = fl.make_mat("m_fc_battery_blue", (0.00, 0.10, 1.00), metallic=0.0, roughness=0.42)
MAT["ion_filter"] = fl.make_mat("m_ion_filter_green", (0.00, 1.00, 0.18), metallic=0.0, roughness=0.45)
MAT["warning"] = fl.make_mat("m_warning_amber", (1.00, 0.55, 0.00), metallic=0.0, roughness=0.45)


# ═══════ Module — structure_containment (cabinet shell, frame, panels only) ═
fl.add_box("fcm1_base_plinth", (CX, 0, 0.04), (W, D, 0.08), MAT["stainless"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_top_cap", (CX, 0, H - 0.035), (W, D, 0.07), MAT["stainless"], module="structure_containment", module_objects=MO)
for i, (x, y) in enumerate([(0.035, FRONT + 0.035), (W - 0.035, FRONT + 0.035), (0.035, BACK - 0.035), (W - 0.035, BACK - 0.035)]):
    fl.add_box(f"fcm1_corner_post_{i}", (x, y, H / 2), (0.045, 0.045, H), MAT["stainless"], module="structure_containment", module_objects=MO)
for name, loc, size in [
    ("fcm1_front_top_rail", (CX, FRONT + 0.025, H - 0.18), (W - 0.08, 0.035, 0.045)),
    ("fcm1_front_bottom_rail", (CX, FRONT + 0.025, 0.20), (W - 0.08, 0.035, 0.045)),
    ("fcm1_back_top_rail", (CX, BACK - 0.025, H - 0.18), (W - 0.08, 0.035, 0.045)),
    ("fcm1_back_bottom_rail", (CX, BACK - 0.025, 0.20), (W - 0.08, 0.035, 0.045)),
    ("fcm1_left_mid_rail", (0.035, 0, 0.92), (0.045, D - 0.08, 0.040)),
    ("fcm1_right_mid_rail", (W - 0.035, 0, 0.92), (0.045, D - 0.08, 0.040)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_back_panel", (CX, BACK - 0.012, 0.82), (W - 0.12, 0.024, 1.22), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_left_lower_panel", (0.012, 0, 0.46), (0.024, D - 0.12, 0.70), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_right_lower_panel", (W - 0.012, 0, 0.46), (0.024, D - 0.12, 0.70), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_front_door_window", (CX, FRONT - 0.004, 0.92), (0.92, 0.010, 0.92), MAT["cabinet_window"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_door_vertical_stile_L", (0.17, FRONT - 0.006, 0.92), (0.035, 0.020, 0.98), MAT["stainless"], module="structure_containment", module_objects=MO)
fl.add_box("fcm1_door_vertical_stile_R", (1.03, FRONT - 0.006, 0.92), (0.035, 0.020, 0.98), MAT["stainless"], module="structure_containment", module_objects=MO)


# ═══════ Module — energy_storage_source (cold-start battery + supercap) ═════
fl.add_box("fcm2_battery_tray", (0.90, 0.19, 0.28), (0.42, 0.26, 0.05), MAT["powerdist"], module="energy_storage_source", module_objects=MO)
for i in range(5):
    fl.add_box(f"fcm2_lfp_cell_{i}", (0.74 + i * 0.08, 0.19, 0.38), (0.060, 0.22, 0.16), MAT["battery_cell"], module="energy_storage_source", module_objects=MO)
fl.add_box("fcm2_battery_bms", (1.08, 0.19, 0.43), (0.10, 0.20, 0.08), MAT["control"], module="energy_storage_source", module_objects=MO)
fl.add_cyl("fcm2_supercap_A", (0.77, 0.35, 0.55), 0.035, 0.22, MAT["battery_cell"], module="energy_storage_source", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fcm2_supercap_B", (0.93, 0.35, 0.55), 0.035, 0.22, MAT["battery_cell"], module="energy_storage_source", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("fcm2_precharge_resistor", (1.08, 0.33, 0.56), (0.10, 0.035, 0.035), MAT["warning"], module="energy_storage_source", module_objects=MO)
fl.add_box("fcm2_battery_service_disconnect", (0.62, 0.31, 0.45), (0.06, 0.07, 0.08), MAT["safety"], module="energy_storage_source", module_objects=MO)


# ═══════ Module — energy_conversion_transduction (PEM stack + compressor) ══
fl.add_box("fcm3_stack_lower_rail", (STACK_X, STACK_Y, STACK_Z - STACK_H / 2 - 0.035), (STACK_W + 0.10, 0.055, 0.050), MAT["stainless"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("fcm3_stack_upper_rail", (STACK_X, STACK_Y, STACK_Z + STACK_H / 2 + 0.035), (STACK_W + 0.10, 0.055, 0.050), MAT["stainless"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("fcm3_stack_left_endplate", (STACK_X - STACK_W / 2 - 0.025, STACK_Y, STACK_Z), (0.050, STACK_D, STACK_H + 0.05), MAT["pem_plate"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("fcm3_stack_right_endplate", (STACK_X + STACK_W / 2 + 0.025, STACK_Y, STACK_Z), (0.050, STACK_D, STACK_H + 0.05), MAT["pem_plate"], module="energy_conversion_transduction", module_objects=MO)
for i in range(12):
    x = STACK_X - STACK_W / 2 + 0.045 + i * (STACK_W - 0.09) / 11
    mat = MAT["pem_membrane"] if i % 2 == 0 else MAT["pem_plate"]
    fl.add_box(f"fcm3_pem_cell_plate_{i:02d}", (x, STACK_Y, STACK_Z), (0.018, STACK_D * 0.94, STACK_H * 0.92), mat, module="energy_conversion_transduction", module_objects=MO)
for i, (y, z) in enumerate([(STACK_Y - 0.18, STACK_Z - 0.16), (STACK_Y + 0.18, STACK_Z - 0.16), (STACK_Y - 0.18, STACK_Z + 0.16), (STACK_Y + 0.18, STACK_Z + 0.16)]):
    fl.add_cyl(f"fcm3_stack_tie_rod_{i}", (STACK_X, y, z), 0.012, STACK_W + 0.15, MAT["stainless"], module="energy_conversion_transduction", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fcm3_air_compressor_body", (0.88, -0.22, 0.62), 0.115, 0.28, MAT["motor"], module="energy_conversion_transduction", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fcm3_air_compressor_impeller_housing", (1.04, -0.22, 0.62), 0.145, 0.075, MAT["air"], module="energy_conversion_transduction", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("fcm3_compressor_inverter", (0.86, -0.35, 0.46), (0.22, 0.06, 0.12), MAT["inverter"], module="energy_conversion_transduction", module_objects=MO)
fl.add_cyl("fcm3_recirc_blower", (0.30, 0.26, 0.58), 0.075, 0.16, MAT["motor"], module="energy_conversion_transduction", module_objects=MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — environmental_interface (cooling, intake, exhaust, mounts) ═
fl.add_box("fcm4_radiator_core", (0.31, BACK - 0.045, 1.03), (0.42, 0.045, 0.52), MAT["radiator_core"], module="environmental_interface", module_objects=MO)
for i in range(8):
    fl.add_box(f"fcm4_radiator_fin_{i}", (0.14 + i * 0.050, BACK - 0.078, 1.03), (0.012, 0.018, 0.50), MAT["heatsink"], module="environmental_interface", module_objects=MO)
for i, x in enumerate([0.22, 0.40]):
    fl.add_cyl(f"fcm4_radiator_fan_{i}", (x, BACK - 0.105, 1.03), 0.105, 0.030, MAT["ctrl_black"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("fcm4_air_intake_filter", (0.97, FRONT - 0.020, 1.02), (0.28, 0.040, 0.22), MAT["air"], module="environmental_interface", module_objects=MO)
fl.add_box("fcm4_intake_louver_top", (0.97, FRONT - 0.045, 1.12), (0.30, 0.018, 0.026), MAT["stainless"], module="environmental_interface", module_objects=MO)
fl.add_box("fcm4_intake_louver_mid", (0.97, FRONT - 0.045, 1.02), (0.30, 0.018, 0.026), MAT["stainless"], module="environmental_interface", module_objects=MO)
fl.add_box("fcm4_intake_louver_bot", (0.97, FRONT - 0.045, 0.92), (0.30, 0.018, 0.026), MAT["stainless"], module="environmental_interface", module_objects=MO)
fl.add_cyl("fcm4_top_exhaust_stack", (0.78, 0.12, H + 0.04), 0.060, 0.16, MAT["thermal"], module="environmental_interface", module_objects=MO)
fl.add_cyl("fcm4_exhaust_rain_cap", (0.78, 0.12, H + 0.14), 0.085, 0.025, MAT["stainless"], module="environmental_interface", module_objects=MO)
for i, (x, y) in enumerate([(0.12, FRONT + 0.09), (1.08, FRONT + 0.09), (0.12, BACK - 0.09), (1.08, BACK - 0.09)]):
    fl.add_cyl(f"fcm4_vibration_mount_{i}", (x, y, -0.015), 0.040, 0.030, MAT["safety"], module="environmental_interface", module_objects=MO)
fl.add_cyl("fcm4_condensate_drain_tube", (0.66, FRONT - 0.015, 0.18), 0.012, 0.09, MAT["thermal"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — mass_fluid_transport_process (H2, air, water, coolant) ════
fl.add_cyl("fcm5_h2_inlet_port", (W + 0.025, 0.18, 1.26), 0.030, 0.070, MAT["h2"], module="mass_fluid_transport_process", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("fcm5_h2_manifold", (0.72, 0.22, 1.24), (0.58, 0.050, 0.055), MAT["h2"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_cyl("fcm5_h2_regulator", (1.00, 0.22, 1.31), 0.055, 0.050, MAT["h2"], module="mass_fluid_transport_process", module_objects=MO)
for i, x in enumerate([0.48, 0.62, 0.76, 0.90]):
    fl.add_cyl(f"fcm5_h2_solenoid_valve_{i}", (x, 0.22, 1.31), 0.030, 0.055, MAT["control"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_cyl("fcm5_h2_feed_line_to_stack", (0.58, 0.07, 1.02), 0.010, 0.48, MAT["h2"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_cyl("fcm5_air_feed_pipe", (0.92, -0.16, 0.88), 0.018, 0.52, MAT["air"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_cyl("fcm5_humidifier_canister", (0.24, -0.28, 1.03), 0.070, 0.30, MAT["humidifier"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_cyl("fcm5_water_separator", (0.30, -0.27, 0.36), 0.060, 0.24, MAT["thermal"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_cyl("fcm5_cooling_pump", (0.62, 0.31, 0.34), 0.060, 0.14, MAT["coolant"], module="mass_fluid_transport_process", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fcm5_coolant_supply_line", (0.45, 0.29, 0.52), 0.012, 0.38, MAT["coolant"], module="mass_fluid_transport_process", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fcm5_coolant_return_line", (0.44, 0.34, 0.93), 0.012, 0.40, MAT["coolant"], module="mass_fluid_transport_process", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("fcm5_deion_filter", (0.77, 0.34, 0.46), (0.10, 0.07, 0.18), MAT["ion_filter"], module="mass_fluid_transport_process", module_objects=MO)


# ═══════ Module — power_distribution (DC output, converter, bus, protection) ═
fl.add_box("fcm6_dc_dc_converter", (0.88, 0.03, 0.92), (0.32, 0.24, 0.18), MAT["dc_converter"], module="power_distribution", module_objects=MO)
for i in range(7):
    fl.add_box(f"fcm6_converter_heatsink_fin_{i}", (0.76 + i * 0.040, -0.105, 1.04), (0.018, 0.030, 0.16), MAT["heatsink"], module="power_distribution", module_objects=MO)
fl.add_box("fcm6_positive_busbar", (0.67, 0.02, 0.84), (0.46, 0.018, 0.018), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("fcm6_negative_busbar", (0.67, 0.07, 0.80), (0.46, 0.018, 0.018), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("fcm6_main_contactor_pos", (1.06, 0.03, 0.78), (0.08, 0.07, 0.10), MAT["powerdist"], module="power_distribution", module_objects=MO)
fl.add_box("fcm6_main_contactor_neg", (1.06, 0.13, 0.78), (0.08, 0.07, 0.10), MAT["powerdist"], module="power_distribution", module_objects=MO)
fl.add_box("fcm6_hv_fuse", (0.98, -0.11, 0.78), (0.12, 0.045, 0.055), MAT["safety"], module="power_distribution", module_objects=MO)
fl.add_cyl("fcm6_dc_output_positive", (W + 0.018, -0.09, 0.70), 0.026, 0.055, MAT["copper"], module="power_distribution", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("fcm6_dc_output_negative", (W + 0.018, -0.18, 0.70), 0.026, 0.055, MAT["powerdist"], module="power_distribution", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("fcm6_ground_bond_strap", (1.08, BACK - 0.06, 0.20), (0.12, 0.020, 0.012), MAT["copper"], module="power_distribution", module_objects=MO)


# ═══════ Module — control_compute_communication (controller and comms) ══════
fl.add_box("fcm7_main_ecu", (0.19, BACK - 0.11, 1.18), (0.20, 0.08, 0.24), MAT["control"], module="control_compute_communication", module_objects=MO)
for i in range(3):
    fl.add_box(f"fcm7_pcb_stack_{i}", (0.19, BACK - 0.18, 0.82 + i * 0.075), (0.18, 0.11, 0.014), MAT["pcb"], module="control_compute_communication", module_objects=MO)
fl.add_box("fcm7_io_module", (0.19, BACK - 0.11, 0.60), (0.16, 0.08, 0.16), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("fcm7_can_gateway", (0.19, BACK - 0.11, 1.43), (0.12, 0.075, 0.08), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_cyl("fcm7_antenna_stub", (0.19, BACK - 0.11, 1.53), 0.006, 0.12, MAT["antenna"], module="control_compute_communication", module_objects=MO)
fl.add_box("fcm7_data_logger", (0.36, BACK - 0.11, 1.40), (0.10, 0.075, 0.10), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("fcm7_low_voltage_psu", (0.36, BACK - 0.11, 0.58), (0.12, 0.08, 0.10), MAT["inverter"], module="control_compute_communication", module_objects=MO)


# ═══════ Module — safety_protection (H2 safety, pressure, interlocks) ═══════
fl.add_cyl("fcm8_h2_shutoff_valve", (1.08, 0.22, 1.20), 0.040, 0.070, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("fcm8_pressure_relief_valve", (0.54, 0.22, 1.38), 0.035, 0.070, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("fcm8_roof_burst_disc_vent", (0.64, 0.29, H + 0.018), 0.055, 0.035, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("fcm8_flame_arrestor_block", (0.72, 0.29, 1.48), (0.11, 0.08, 0.07), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("fcm8_front_door_interlock_top", (0.12, FRONT - 0.020, 1.20), (0.040, 0.025, 0.055), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("fcm8_front_door_interlock_bot", (0.12, FRONT - 0.020, 0.42), (0.040, 0.025, 0.055), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("fcm8_insulation_monitor", (0.98, BACK - 0.11, 0.58), (0.11, 0.08, 0.08), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("fcm8_estop_mushroom", (0.36, FRONT - 0.030, 1.28), 0.042, 0.025, MAT["safety"], module="safety_protection", module_objects=MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — sensing_instrumentation (gas, temp, pressure, current) ════
fl.add_box("fcm9_h2_leak_sensor_top", (0.50, 0.00, 1.45), (0.065, 0.045, 0.045), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("fcm9_h2_leak_sensor_manifold", (0.92, 0.28, 1.40), (0.060, 0.045, 0.045), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("fcm9_stack_pressure_sensor_anode", (0.44, 0.16, 1.12), 0.022, 0.045, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("fcm9_stack_pressure_sensor_cathode", (0.61, -0.25, 1.03), 0.022, 0.045, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
for i, x in enumerate([0.24, 0.40, 0.56, 0.72]):
    fl.add_cyl(f"fcm9_stack_temp_probe_{i}", (x, STACK_Y - STACK_D / 2 - 0.030, STACK_Z - 0.08 + i * 0.045), 0.009, 0.075, MAT["sensor"], module="sensing_instrumentation", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("fcm9_current_transducer", (0.82, 0.02, 0.75), (0.060, 0.055, 0.060), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("fcm9_coolant_flow_meter", (0.56, 0.34, 0.62), 0.025, 0.070, MAT["sensor"], module="sensing_instrumentation", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("fcm9_exhaust_humidity_sensor", (0.76, 0.11, 1.43), (0.050, 0.045, 0.050), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)


# ═══════ Module — maintenance_serviceability (access, drain, handles, rails) ═
fl.add_box("fcm10_stack_service_slide_L", (STACK_X, STACK_Y - STACK_D / 2 - 0.075, STACK_Z - 0.25), (STACK_W + 0.16, 0.030, 0.035), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("fcm10_stack_service_slide_R", (STACK_X, STACK_Y + STACK_D / 2 + 0.075, STACK_Z - 0.25), (STACK_W + 0.16, 0.030, 0.035), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_cyl("fcm10_front_door_handle", (1.05, FRONT - 0.035, 0.94), 0.018, 0.22, MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("fcm10_air_filter_pull_tab", (1.12, FRONT - 0.055, 1.02), (0.045, 0.025, 0.13), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_cyl("fcm10_coolant_fill_cap", (0.68, 0.34, 1.28), 0.035, 0.030, MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_cyl("fcm10_condensate_drain_valve", (0.46, FRONT - 0.030, 0.20), 0.025, 0.055, MAT["maint"], module="maintenance_serviceability", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("fcm10_service_label_plate", (0.24, FRONT - 0.026, 0.28), (0.20, 0.012, 0.10), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_torus("fcm10_lifting_eye_left", (0.22, 0.00, H + 0.025), 0.040, 0.008, MAT["maint"], module="maintenance_serviceability", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_torus("fcm10_lifting_eye_right", (0.98, 0.00, H + 0.025), 0.040, 0.008, MAT["maint"], module="maintenance_serviceability", module_objects=MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — hmi_ergonomics (screen, controls, indicators) ════════════
fl.add_box("fcm11_hmi_bezel", (0.22, FRONT - 0.032, 1.32), (0.24, 0.018, 0.18), MAT["enclosure"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("fcm11_hmi_screen", (0.22, FRONT - 0.044, 1.32), (0.195, 0.008, 0.125), MAT["hmi"], module="hmi_ergonomics", module_objects=MO)
for i, mat in enumerate([MAT["sensor"], MAT["control"], MAT["safety"]]):
    fl.add_cyl(f"fcm11_pushbutton_{i}", (0.16 + i * 0.06, FRONT - 0.050, 1.16), 0.017, 0.014, mat, module="hmi_ergonomics", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("fcm11_status_nameplate", (0.22, FRONT - 0.045, 1.05), (0.22, 0.008, 0.055), MAT["warning"], module="hmi_ergonomics", module_objects=MO)
fl.add_cyl("fcm11_beacon_base", (0.34, FRONT + 0.06, H + 0.015), 0.035, 0.030, MAT["powerdist"], module="hmi_ergonomics", module_objects=MO)
for i, mat in enumerate([MAT["safety"], MAT["warning"], MAT["sensor"]]):
    fl.add_cyl(f"fcm11_beacon_lens_{i}", (0.34, FRONT + 0.06, H + 0.055 + i * 0.042), 0.030, 0.035, mat, module="hmi_ergonomics", module_objects=MO)
fl.add_torus("fcm11_operator_pull_handle", (0.91, FRONT - 0.035, 1.17), 0.055, 0.010, MAT["maint"], module="hmi_ergonomics", module_objects=MO, rotation=(0, math.radians(90), 0))


fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")