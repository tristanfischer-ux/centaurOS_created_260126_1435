"""hydrogen-electrolyser-9shot.py — PEM water electrolyser skid, 100 kW to 1 MW.

Envelope 3.0 × 1.5 × 2.5 m. Steel skid with PEM stack, AC-DC rectifier,
H2/O2 water separators, DI water polishing, circulation pump, heat exchanger,
gas dryer, output buffer, safety venting, analyser, controls and HMI.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P hydrogen-electrolyser-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-hydrogen-electrolyser-9shot")))

W = 3.0
D = 1.5
H = 2.5

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
MAT["pem_stack"]    = fl.make_mat("m_pem_stack",    (0.00, 0.48, 1.00), metallic=0.1, roughness=0.35)
MAT["membrane"]     = fl.make_mat("m_membrane",     (0.92, 0.00, 1.00), metallic=0.0, roughness=0.45)
MAT["h2_gas"]       = fl.make_mat("m_h2_gas",       (0.00, 0.95, 1.00), metallic=0.0, roughness=0.25)
MAT["o2_gas"]       = fl.make_mat("m_o2_gas",       (0.00, 0.90, 0.18), metallic=0.0, roughness=0.35)
MAT["di_water"]     = fl.make_mat("m_di_water",     (0.00, 0.35, 1.00), metallic=0.2, roughness=0.25)
MAT["dryer"]        = fl.make_mat("m_dryer",        (1.00, 0.35, 0.00), metallic=0.1, roughness=0.40)
MAT["separator"]    = fl.make_mat("m_separator",    (0.88, 0.92, 0.96), metallic=0.65, roughness=0.28)
MAT["rectifier"]    = fl.make_mat("m_rectifier",    (0.58, 0.00, 1.00), metallic=0.15, roughness=0.42)
MAT["valve"]        = fl.make_mat("m_valve",        (1.00, 0.10, 0.55), metallic=0.1, roughness=0.40)
MAT["pipe_h2"]      = fl.make_mat("m_pipe_h2",      (0.00, 0.85, 1.00), metallic=0.25, roughness=0.35)
MAT["pipe_o2"]      = fl.make_mat("m_pipe_o2",      (0.00, 1.00, 0.20), metallic=0.25, roughness=0.35)
MAT["pipe_water"]   = fl.make_mat("m_pipe_water",   (0.00, 0.25, 1.00), metallic=0.25, roughness=0.35)
MAT["filter"]       = fl.make_mat("m_filter",       (1.00, 0.75, 0.00), metallic=0.05, roughness=0.45)
MAT["panel_glass"]  = fl.make_mat("m_panel_glass",  (0.02, 0.12, 0.28), metallic=0.1, roughness=0.18)
MAT["warning"]      = fl.make_mat("m_warning",      (1.00, 0.62, 0.00), metallic=0.0, roughness=0.45)


# ═══════ Module — structure_containment (skid frame + enclosure shell) ══════
fl.add_box("he1_skid_base", (W/2, 0, 0.06), (W, D, 0.12), MAT["stainless"], "structure_containment", MO)
for x, y in [(0.08, -D/2+0.08), (W-0.08, -D/2+0.08), (0.08, D/2-0.08), (W-0.08, D/2-0.08)]:
    fl.add_box(f"he1_corner_post_{x:.2f}_{y:.2f}", (x, y, H/2), (0.06, 0.06, H), MAT["stainless"], "structure_containment", MO)
for spec in [
    ("he1_top_rail_front", (W/2, -D/2+0.06, H-0.05), (W-0.12, 0.05, 0.06)),
    ("he1_top_rail_back",  (W/2,  D/2-0.06, H-0.05), (W-0.12, 0.05, 0.06)),
    ("he1_top_rail_left",  (0.06, 0, H-0.05),         (0.05, D-0.12, 0.06)),
    ("he1_top_rail_right", (W-0.06, 0, H-0.05),       (0.05, D-0.12, 0.06)),
    ("he1_mid_rail_front", (W/2, -D/2+0.04, 1.25),    (W-0.12, 0.04, 0.05)),
    ("he1_mid_rail_back",  (W/2,  D/2-0.04, 1.25),    (W-0.12, 0.04, 0.05)),
]:
    fl.add_box(*spec, MAT["stainless"], "structure_containment", MO)
for x in [0.55, 1.50, 2.45]:
    fl.add_box(f"he1_roof_crossmember_{x:.2f}", (x, 0, H-0.04), (0.05, D-0.18, 0.05), MAT["stainless"], "structure_containment", MO)
fl.add_box("he1_left_service_door_frame", (0.35, -D/2-0.005, 1.15), (0.55, 0.025, 1.85), MAT["enclosure"], "structure_containment", MO)
fl.add_box("he1_right_louver_panel", (2.35, D/2+0.005, 1.20), (0.90, 0.025, 1.75), MAT["enclosure"], "structure_containment", MO)
fl.add_box("he1_control_cabinet_shell", (2.72, -0.42, 1.05), (0.42, 0.52, 1.85), MAT["enclosure"], "structure_containment", MO)
fl.add_box("he1_service_walkplate", (1.50, -0.69, 0.16), (2.70, 0.10, 0.035), MAT["stainless"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction (PEM stack conversion) ═════
STACK_X, STACK_Y = 0.86, -0.12
STACK_Z = 1.16
fl.add_box("he2_pem_stack_cell_block", (STACK_X, STACK_Y, STACK_Z), (0.60, 0.40, 1.55), MAT["pem_stack"], "energy_conversion_transduction", MO)
fl.add_box("he2_stack_front_endplate", (STACK_X, STACK_Y-0.225, STACK_Z), (0.66, 0.045, 1.72), MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_box("he2_stack_rear_endplate", (STACK_X, STACK_Y+0.225, STACK_Z), (0.66, 0.045, 1.72), MAT["stainless"], "energy_conversion_transduction", MO)
for i in range(12):
    y = STACK_Y - 0.18 + i * 0.033
    fl.add_box(f"he2_bipolar_plate_{i:02d}", (STACK_X, y, STACK_Z), (0.64, 0.008, 1.60), MAT["membrane"], "energy_conversion_transduction", MO)
for x in [STACK_X-0.34, STACK_X+0.34]:
    for z in [0.45, 1.87]:
        fl.add_cyl(f"he2_stack_tie_rod_{x:.2f}_{z:.2f}", (x, STACK_Y, z), 0.015, 0.52, MAT["stainless"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("he2_dc_positive_lug", (STACK_X-0.22, STACK_Y-0.28, 1.95), (0.12, 0.05, 0.10), MAT["copper"], "energy_conversion_transduction", MO)
fl.add_box("he2_dc_negative_lug", (STACK_X+0.22, STACK_Y-0.28, 1.95), (0.12, 0.05, 0.10), MAT["copper"], "energy_conversion_transduction", MO)
fl.add_box("he2_stack_compression_frame_top", (STACK_X, STACK_Y, 2.05), (0.78, 0.52, 0.08), MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_box("he2_stack_compression_frame_bottom", (STACK_X, STACK_Y, 0.25), (0.78, 0.52, 0.08), MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_cyl("he2_top_water_manifold", (STACK_X, STACK_Y+0.30, 1.96), 0.030, 0.66, MAT["pipe_water"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("he2_bottom_return_manifold", (STACK_X, STACK_Y+0.30, 0.34), 0.030, 0.66, MAT["pipe_water"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — mass_fluid_transport_process (water + gas process train) ══
H2_X, O2_X = 1.65, 2.03
SEP_Y = 0.26
for name, x, mat in [("h2", H2_X, MAT["h2_gas"]), ("o2", O2_X, MAT["o2_gas"])]:
    fl.add_cyl(f"he3_{name}_water_separator_vessel", (x, SEP_Y, 1.05), 0.15, 1.50, MAT["separator"], "mass_fluid_transport_process", MO)
    fl.add_cyl(f"he3_{name}_separator_top_cap", (x, SEP_Y, 1.82), 0.152, 0.05, mat, "mass_fluid_transport_process", MO)
    fl.add_cyl(f"he3_{name}_separator_bottom_cap", (x, SEP_Y, 0.28), 0.152, 0.05, MAT["di_water"], "mass_fluid_transport_process", MO)
    fl.add_box(f"he3_{name}_level_sight_glass", (x+0.155, SEP_Y-0.02, 1.05), (0.020, 0.030, 0.95), MAT["panel_glass"], "mass_fluid_transport_process", MO)
fl.add_cyl("he3_di_polisher_column", (0.45, 0.42, 0.85), 0.12, 1.05, MAT["filter"], "mass_fluid_transport_process", MO)
fl.add_cyl("he3_circulation_pump_body", (0.60, 0.42, 0.26), 0.105, 0.22, MAT["di_water"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_box("he3_plate_heat_exchanger", (1.18, 0.44, 0.55), (0.36, 0.18, 0.48), MAT["thermal"], "mass_fluid_transport_process", MO)
for i in range(6):
    fl.add_box(f"he3_heat_exchanger_plate_{i}", (1.18 - 0.135 + i*0.054, 0.335, 0.55), (0.020, 0.035, 0.50), MAT["heatsink"], "mass_fluid_transport_process", MO)
fl.add_cyl("he3_gas_dryer_tower_a", (2.38, 0.28, 0.98), 0.10, 1.20, MAT["dryer"], "mass_fluid_transport_process", MO)
fl.add_cyl("he3_gas_dryer_tower_b", (2.62, 0.28, 0.98), 0.10, 1.20, MAT["dryer"], "mass_fluid_transport_process", MO)
fl.add_cyl("he3_h2_output_buffer_tank", (2.50, 0.58, 0.62), 0.16, 0.72, MAT["h2_gas"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("he3_h2_header_stack_to_separator", (1.25, 0.08, 1.82), 0.018, 0.82, MAT["pipe_h2"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(72), 0))
fl.add_cyl("he3_o2_header_stack_to_separator", (1.48, 0.47, 1.70), 0.018, 0.92, MAT["pipe_o2"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(82), 0))
fl.add_cyl("he3_water_feed_line", (0.75, 0.44, 0.55), 0.016, 0.72, MAT["pipe_water"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("he3_h2_dryer_to_buffer_line", (2.50, 0.40, 1.30), 0.016, 0.50, MAT["pipe_h2"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.44, 0.62, 1.34, 1.64, 2.20]):
    fl.add_box(f"he3_process_valve_{i}", (x, 0.61, 1.15 if i > 2 else 0.62), (0.060, 0.060, 0.060), MAT["valve"], "mass_fluid_transport_process", MO)


# ═══════ Module — power_distribution (AC feed, rectifier, DC bus) ══════════
fl.add_box("he4_ac_transformer", (0.48, -0.47, 0.55), (0.54, 0.50, 0.72), MAT["powerdist"], "power_distribution", MO)
fl.add_box("he4_rectifier_cabinet", (1.34, -0.48, 0.82), (0.62, 0.48, 1.12), MAT["rectifier"], "power_distribution", MO)
fl.add_box("he4_rectifier_heatsink", (1.34, -0.735, 0.86), (0.56, 0.035, 0.82), MAT["heatsink"], "power_distribution", MO)
for i in range(7):
    fl.add_box(f"he4_heatsink_fin_{i}", (1.07 + i*0.09, -0.775, 0.86), (0.018, 0.08, 0.82), MAT["heatsink"], "power_distribution", MO)
for i, z in enumerate([1.50, 1.58, 1.66]):
    fl.add_box(f"he4_ac_busbar_{i}", (0.92, -0.52, z), (0.70, 0.018, 0.018), MAT["copper"], "power_distribution", MO)
fl.add_box("he4_dc_positive_bus", (1.08, -0.25, 1.92), (0.74, 0.026, 0.030), MAT["copper"], "power_distribution", MO)
fl.add_box("he4_dc_negative_bus", (1.08, -0.20, 1.82), (0.74, 0.026, 0.030), MAT["copper"], "power_distribution", MO)
fl.add_box("he4_main_breaker", (0.30, -0.73, 1.28), (0.22, 0.08, 0.28), MAT["safety"], "power_distribution", MO)
fl.add_box("he4_emc_filter_choke", (0.68, -0.70, 1.28), (0.26, 0.12, 0.24), MAT["ctrl_black"], "power_distribution", MO)
fl.add_cyl("he4_grounding_bar", (1.50, -0.72, 0.18), 0.014, 0.72, MAT["copper"], "power_distribution", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — control_compute_communication (PLC, IO, SCADA) ═══════════
fl.add_box("he5_plc_controller", (2.72, -0.47, 1.40), (0.24, 0.08, 0.34), MAT["control"], "control_compute_communication", MO)
fl.add_box("he5_remote_io_rack", (2.72, -0.47, 1.02), (0.28, 0.08, 0.25), MAT["control"], "control_compute_communication", MO)
for i in range(5):
    fl.add_box(f"he5_io_slice_{i}", (2.60 + i*0.06, -0.525, 1.02), (0.045, 0.035, 0.23), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("he5_scada_edge_pc", (2.72, -0.47, 0.67), (0.26, 0.08, 0.24), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("he5_ethernet_switch", (2.72, -0.47, 1.78), (0.22, 0.07, 0.12), MAT["control"], "control_compute_communication", MO)
fl.add_box("he5_cell_voltage_monitor", (1.28, -0.09, 2.14), (0.42, 0.07, 0.10), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("he5_telemetry_antenna", (2.72, -0.47, 2.08), 0.006, 0.22, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("he5_fiber_patch_panel", (2.72, -0.47, 1.92), (0.26, 0.05, 0.08), MAT["hmi"], "control_compute_communication", MO)


# ═══════ Module — safety_protection (relief, venting, isolation) ═══════════
for name, x, mat in [("h2", H2_X, MAT["h2_gas"]), ("o2", O2_X, MAT["o2_gas"])]:
    fl.add_cyl(f"he6_{name}_prv_body", (x, SEP_Y, 1.97), 0.035, 0.08, MAT["safety"], "safety_protection", MO)
    fl.add_cyl(f"he6_{name}_vent_riser", (x, SEP_Y+0.10, 2.25), 0.018, 0.44, mat, "safety_protection", MO)
fl.add_cyl("he6_common_roof_vent_header", (2.06, 0.36, 2.42), 0.024, 0.92, MAT["safety"], "safety_protection", MO, rotation=(0, math.radians(90), 0))
fl.add_box("he6_h2_flame_arrestor", (2.82, 0.36, 2.42), (0.12, 0.12, 0.10), MAT["safety"], "safety_protection", MO)
fl.add_cyl("he6_stack_burst_disk", (0.54, -0.12, 2.00), 0.032, 0.035, MAT["safety"], "safety_protection", MO)
fl.add_box("he6_dc_isolation_contactor", (1.65, -0.24, 1.90), (0.16, 0.12, 0.16), MAT["safety"], "safety_protection", MO)
fl.add_cyl("he6_front_estop", (2.72, -0.765, 1.35), 0.050, 0.030, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("he6_door_interlock_left", (0.62, -0.765, 1.55), (0.05, 0.025, 0.06), MAT["safety"], "safety_protection", MO)
fl.add_box("he6_door_interlock_control", (2.50, -0.765, 1.55), (0.05, 0.025, 0.06), MAT["safety"], "safety_protection", MO)
fl.add_box("he6_hazard_label_h2", (2.30, -0.765, 1.82), (0.18, 0.010, 0.12), MAT["warning"], "safety_protection", MO)


# ═══════ Module — sensing_instrumentation (pressure, flow, gas analysis) ═══
for i, x in enumerate([H2_X, O2_X]):
    fl.add_cyl(f"he7_pressure_transmitter_{i}", (x-0.18, SEP_Y, 1.58), 0.030, 0.055, MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"he7_level_transmitter_{i}", (x+0.19, SEP_Y, 0.90), 0.022, 0.050, MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_box("he7_h2_gas_analyser", (2.40, -0.10, 1.70), (0.28, 0.18, 0.22), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("he7_o2_in_h2_monitor", (2.70, -0.10, 1.70), (0.22, 0.16, 0.18), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("he7_stack_temp_probe_top", (0.45, -0.12, 1.70), 0.012, 0.24, MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("he7_stack_temp_probe_bottom", (0.45, -0.12, 0.70), 0.012, 0.24, MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_box("he7_water_conductivity_sensor", (0.42, 0.58, 0.62), (0.09, 0.06, 0.07), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("he7_flowmeter_water", (0.96, 0.58, 0.62), (0.09, 0.06, 0.14), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("he7_flowmeter_h2_output", (2.70, 0.58, 0.90), (0.08, 0.06, 0.16), MAT["sensor"], "sensing_instrumentation", MO)
for i, loc in enumerate([(0.22, 0.67, 2.10), (1.40, 0.67, 2.10), (2.55, 0.67, 2.10)]):
    fl.add_cyl(f"he7_h2_leak_detector_{i}", loc, 0.035, 0.025, MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — maintenance_serviceability (access, drains, lifting) ═════
for x in [0.55, 1.45, 2.35]:
    fl.add_torus(f"he8_lifting_eye_{x:.2f}", (x, -0.58, H-0.03), 0.055, 0.010, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("he8_stack_slide_rail_left", (0.86, -0.40, 0.22), (0.80, 0.035, 0.050), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("he8_stack_slide_rail_right", (0.86, 0.16, 0.22), (0.80, 0.035, 0.050), MAT["maint"], "maintenance_serviceability", MO)
fl.add_cyl("he8_water_drain_port", (0.42, 0.73, 0.23), 0.025, 0.055, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("he8_separator_blowdown_h2", (H2_X, 0.48, 0.24), 0.020, 0.18, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("he8_separator_blowdown_o2", (O2_X, 0.48, 0.24), 0.020, 0.18, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("he8_filter_cartridge_access", (0.45, 0.72, 1.15), (0.22, 0.025, 0.32), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("he8_calibration_port_panel", (2.48, -0.73, 1.08), (0.28, 0.020, 0.18), MAT["maint"], "maintenance_serviceability", MO)
for i in range(4):
    fl.add_cyl(f"he8_quick_connect_{i}", (2.38 + i*0.08, -0.76, 0.82), 0.018, 0.030, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module — hmi_ergonomics (operator interface) ══════════════════════
fl.add_box("he9_hmi_bezel", (2.72, -0.785, 1.63), (0.34, 0.018, 0.26), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("he9_hmi_touchscreen", (2.72, -0.798, 1.63), (0.29, 0.006, 0.20), MAT["hmi"], "hmi_ergonomics", MO)
for i, c in enumerate([MAT["sensor"], MAT["control"], MAT["safety"], MAT["warning"]]):
    fl.add_cyl(f"he9_operator_pushbutton_{i}", (2.59 + i*0.085, -0.795, 1.42), 0.018, 0.014, c, "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("he9_status_label_strip", (2.72, -0.795, 1.28), (0.34, 0.006, 0.06), MAT["ctrl_black"], "hmi_ergonomics", MO)
for i, c in enumerate([MAT["safety"], MAT["warning"], MAT["sensor"]]):
    fl.add_cyl(f"he9_stacklight_segment_{i}", (2.88, -0.42, 2.08 + i*0.055), 0.035, 0.045, c, "hmi_ergonomics", MO)
fl.add_cyl("he9_stacklight_base", (2.88, -0.42, 2.03), 0.040, 0.035, MAT["powerdist"], "hmi_ergonomics", MO)
for z in [0.90, 1.40]:
    fl.add_torus(f"he9_front_door_pull_{z:.1f}", (0.36, -0.785, z), 0.060, 0.010, MAT["maint"], "hmi_ergonomics", MO, rotation=(0, math.radians(90), 0))


# ═══════ Module — actuation_kinematics (pumps, valves, dampers) ════════════
fl.add_cyl("he10_circulation_pump_motor", (0.78, 0.42, 0.26), 0.090, 0.20, MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("he10_feed_pump_motor", (0.30, 0.38, 0.30), 0.070, 0.18, MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("he10_feed_pump_head", (0.43, 0.38, 0.30), 0.060, 0.08, MAT["maint"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
for i, x in enumerate([1.50, 1.78, 2.06, 2.34]):
    fl.add_cyl(f"he10_pneumatic_valve_actuator_{i}", (x, 0.60, 1.32), 0.035, 0.08, MAT["control"], "actuation_kinematics", MO)
    fl.add_box(f"he10_valve_stem_{i}", (x, 0.60, 1.24), (0.018, 0.018, 0.12), MAT["stainless"], "actuation_kinematics", MO)
fl.add_cyl("he10_cooling_loop_modulating_valve", (1.18, 0.64, 0.82), 0.042, 0.075, MAT["control"], "actuation_kinematics", MO)
fl.add_box("he10_vent_damper_actuator", (2.42, 0.73, 2.08), (0.12, 0.05, 0.09), MAT["control"], "actuation_kinematics", MO)
for z in [0.75, 1.35, 1.95]:
    fl.add_cyl(f"he10_service_door_hinge_{z:.2f}", (0.08, -0.765, z), 0.018, 0.080, MAT["maint"], "actuation_kinematics", MO)


# ═══════ Module — environmental_interface (cooling, ventilation, isolation) ═
fl.add_box("he11_side_louver_bank", (2.35, 0.775, 1.25), (0.70, 0.020, 0.90), MAT["thermal"], "environmental_interface", MO)
for i in range(7):
    fl.add_box(f"he11_louver_slat_{i}", (2.35, 0.795, 0.88 + i*0.12), (0.72, 0.018, 0.025), MAT["heatsink"], "environmental_interface", MO, rotation=(math.radians(8), 0, 0))
fl.add_cyl("he11_roof_exhaust_fan", (2.35, 0.20, 2.50), 0.18, 0.08, MAT["thermal"], "environmental_interface", MO)
fl.add_torus("he11_fan_guard_ring", (2.35, 0.20, 2.55), 0.18, 0.010, MAT["ctrl_black"], "environmental_interface", MO)
for i in range(4):
    fl.add_box(f"he11_fan_guard_spoke_{i}", (2.35, 0.20, 2.555), (0.34, 0.012, 0.010), MAT["ctrl_black"], "environmental_interface", MO, rotation=(0, 0, math.radians(i*45)))
fl.add_box("he11_cooling_water_inlet_panel", (1.20, 0.775, 0.32), (0.30, 0.020, 0.18), MAT["fluid_water"], "environmental_interface", MO)
fl.add_box("he11_cooling_water_outlet_panel", (1.58, 0.775, 0.32), (0.30, 0.020, 0.18), MAT["thermal"], "environmental_interface", MO)
for x, y in [(0.18, -0.58), (1.00, -0.58), (2.00, -0.58), (2.82, -0.58), (0.18, 0.58), (1.00, 0.58), (2.00, 0.58), (2.82, 0.58)]:
    fl.add_cyl(f"he11_vibration_mount_{x:.2f}_{y:.2f}", (x, y, -0.01), 0.045, 0.030, MAT["ctrl_black"], "environmental_interface", MO)
fl.add_box("he11_condensate_tray", (1.55, 0.62, 0.13), (1.20, 0.18, 0.045), MAT["thermal"], "environmental_interface", MO)

fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")