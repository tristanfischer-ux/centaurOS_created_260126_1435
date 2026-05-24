"""hydrogen-electrolyser-9shot.py — PEM water electrolyser skid, 100–500 kW.

Envelope 3.0 × 1.5 × 2.5 m. Packed skid with PEM stack, rectifier
transformer, H2/O2 separators, circulation pump, heat exchanger, dryer column,
DI polisher, external H2 buffer tank, control cabinet, safety, sensing,
maintenance, HMI, and actuation features.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P hydrogen-electrolyser-9shot.py
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
MAT["shell_panel"] = fl.make_mat("m_shell_panel", (0.78, 0.82, 0.88), metallic=0.0, roughness=0.50, alpha=0.28)
MAT["stack_blue"] = fl.make_mat("m_stack_blue", (0.00, 0.22, 1.00), metallic=0.05, roughness=0.38)
MAT["stack_plate"] = fl.make_mat("m_stack_plate", (0.10, 0.14, 0.20), metallic=0.45, roughness=0.32)
MAT["rectifier_slate"] = fl.make_mat("m_rectifier_slate", (0.18, 0.22, 0.32), metallic=0.35, roughness=0.48)
MAT["vessel_cyan"] = fl.make_mat("m_vessel_cyan", (0.00, 0.85, 1.00), metallic=0.20, roughness=0.35)
MAT["pump_orange"] = fl.make_mat("m_pump_orange", (1.00, 0.28, 0.00), metallic=0.10, roughness=0.42)
MAT["brass"] = fl.make_mat("m_brass", (1.00, 0.62, 0.08), metallic=0.50, roughness=0.30)
MAT["pipe_h2"] = fl.make_mat("m_pipe_h2", (0.00, 0.95, 1.00), metallic=0.35, roughness=0.25)
MAT["pipe_o2"] = fl.make_mat("m_pipe_o2", (0.00, 0.50, 1.00), metallic=0.35, roughness=0.25)
MAT["pipe_water"] = fl.make_mat("m_pipe_water_polisher", (0.00, 0.35, 1.00), metallic=0.30, roughness=0.28)
MAT["valve_green"] = fl.make_mat("m_valve_green", (0.00, 0.95, 0.12), metallic=0.10, roughness=0.42)
MAT["warning_red"] = fl.make_mat("m_warning_red", (1.00, 0.00, 0.00), metallic=0.0, roughness=0.45)
MAT["walkway"] = fl.make_mat("m_walkway", (0.20, 0.24, 0.30), metallic=0.55, roughness=0.40)
MAT["insulator"] = fl.make_mat("m_insulator", (0.62, 0.05, 0.95), metallic=0.0, roughness=0.55)
MAT["white_label"] = fl.make_mat("m_white_label", (0.96, 0.96, 0.92), metallic=0.0, roughness=0.60)


# ═══════ Module — structure_containment: skid frame, shell panels, roof ═════
# Base channel, held inside 0..3 m × -0.75..+0.75 m footprint.
for name, loc, size in [
    ("he1_base_front_channel", (W / 2, -0.675, 0.06), (W, 0.08, 0.12)),
    ("he1_base_rear_channel", (W / 2, 0.675, 0.06), (W, 0.08, 0.12)),
    ("he1_base_left_channel", (0.04, 0.0, 0.06), (0.08, D, 0.12)),
    ("he1_base_right_channel", (W - 0.04, 0.0, 0.06), (0.08, D, 0.12)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)

for i, x in enumerate([0.75, 1.50, 2.25]):
    fl.add_box(f"he1_base_crossmember_{i}", (x, 0.0, 0.12), (0.06, 1.34, 0.08),
               MAT["stainless"], "structure_containment", MO)

# Four 75 mm square corner posts, 2500 mm tall.
for i, (x, y) in enumerate([(0.075, -0.675), (0.075, 0.675), (2.925, -0.675), (2.925, 0.675)]):
    fl.add_box(f"he1_corner_post_{i}", (x, y, H / 2), (0.075, 0.075, H),
               MAT["stainless"], "structure_containment", MO)

# Top frame.
for name, loc, size in [
    ("he1_top_front_channel", (W / 2, -0.675, H - 0.04), (W, 0.07, 0.07)),
    ("he1_top_rear_channel", (W / 2, 0.675, H - 0.04), (W, 0.07, 0.07)),
    ("he1_top_left_channel", (0.04, 0.0, H - 0.04), (0.07, D, 0.07)),
    ("he1_top_right_channel", (W - 0.04, 0.0, H - 0.04), (0.07, D, 0.07)),
]:
    fl.add_box(name, loc, size, MAT["stainless"], "structure_containment", MO)

# Service walkway on -Y side, 0.4 m wide, within envelope.
fl.add_box("he1_service_walkway_plate", (W / 2, -0.55, 0.18), (2.78, 0.36, 0.05),
           MAT["walkway"], "structure_containment", MO)
for i, x in enumerate([0.25, 0.55, 0.85, 1.15, 1.45, 1.75, 2.05, 2.35, 2.65]):
    fl.add_box(f"he1_walkway_grating_{i}", (x, -0.55, 0.215), (0.035, 0.34, 0.012),
               MAT["stainless"], "structure_containment", MO)

# Three translucent side panels and translucent roof.
fl.add_box("he1_left_side_panel", (0.015, 0.0, 1.28), (0.03, 1.34, 2.24),
           MAT["shell_panel"], "structure_containment", MO)
fl.add_box("he1_right_side_panel", (2.985, 0.0, 1.28), (0.03, 1.34, 2.24),
           MAT["shell_panel"], "structure_containment", MO)
fl.add_box("he1_rear_side_panel", (W / 2, 0.735, 1.28), (2.78, 0.03, 2.24),
           MAT["shell_panel"], "structure_containment", MO)
fl.add_box("he1_translucent_roof", (W / 2, 0.0, 2.485), (2.88, 1.36, 0.03),
           MAT["shell_panel"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction ════════════════════════════
# PEM stack: explicit centre x=1.2, y=0, z=1.0; size 0.6×0.4×1.8 m.
fl.add_box("he2_pem_stack_active_block", (1.20, 0.0, 1.00), (0.60, 0.40, 1.80),
           MAT["stack_blue"], "energy_conversion_transduction", MO)
fl.add_box("he2_pem_stack_left_endplate", (0.88, 0.0, 1.00), (0.04, 0.46, 1.90),
           MAT["stack_plate"], "energy_conversion_transduction", MO)
fl.add_box("he2_pem_stack_right_endplate", (1.52, 0.0, 1.00), (0.04, 0.46, 1.90),
           MAT["stack_plate"], "energy_conversion_transduction", MO)

# Visible bipolar-plate edges on front face.
for i, x in enumerate([0.96, 1.02, 1.08, 1.14, 1.20, 1.26, 1.32, 1.38, 1.44]):
    fl.add_box(f"he2_stack_plate_line_{i}", (x, -0.213, 1.00), (0.010, 0.016, 1.72),
               MAT["stainless"], "energy_conversion_transduction", MO)

# Eight tie rods along stack X-axis.
tie_rod_points = [(-0.235, 0.18), (0.235, 0.18), (-0.235, 0.58), (0.235, 0.58),
                  (-0.235, 1.42), (0.235, 1.42), (-0.235, 1.82), (0.235, 1.82)]
for i, (y, z) in enumerate(tie_rod_points):
    fl.add_cyl(f"he2_stack_tie_rod_{i}", (1.20, y, z), 0.012, 0.76,
               MAT["stainless"], "energy_conversion_transduction", MO,
               rotation=(0, math.radians(90), 0))

# Rectifier transformer: explicit centre x=0.4, y=0.3, z=0.6.
fl.add_box("he2_rectifier_transformer", (0.40, 0.30, 0.60), (0.70, 0.70, 1.20),
           MAT["rectifier_slate"], "energy_conversion_transduction", MO)
for i, x in enumerate([0.18, 0.30, 0.42, 0.54, 0.66]):
    fl.add_box(f"he2_rectifier_cooling_fin_{i}", (x, -0.055, 0.62), (0.035, 0.025, 1.05),
               MAT["heatsink"], "energy_conversion_transduction", MO)
for i, y in enumerate([0.14, 0.30, 0.46]):
    fl.add_cyl(f"he2_transformer_winding_{i}", (0.40, y, 1.25), 0.055, 0.09,
               MAT["copper"], "energy_conversion_transduction", MO,
               rotation=(math.radians(90), 0, 0))

# External H2 buffer tank, explicitly just outside envelope edge at x=3.2.
fl.add_cyl("he2_external_h2_buffer_tank", (3.20, 0.0, 0.75), 0.20, 1.50,
           MAT["vessel_cyan"], "energy_conversion_transduction", MO)
for y in [-0.12, 0.12]:
    fl.add_box(f"he2_buffer_tank_saddle_{y:+.2f}", (3.20, y, 0.06), (0.38, 0.06, 0.12),
               MAT["stainless"], "energy_conversion_transduction", MO)


# ═══════ Module — mass_fluid_transport_process ══════════════════════════════
# H2-water and O2-water separators: explicit centres.
fl.add_cyl("he11_h2_water_separator", (2.00, -0.40, 0.75), 0.15, 1.50,
           MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
fl.add_cyl("he11_o2_water_separator", (2.00, 0.40, 0.75), 0.15, 1.50,
           MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
for name, y in [("h2", -0.40), ("o2", 0.40)]:
    fl.add_sphere(f"he11_{name}_separator_top_dome", (2.00, y, 1.51), 0.15,
                  MAT["vessel_cyan"], "mass_fluid_transport_process", MO)
    fl.add_sphere(f"he11_{name}_separator_bottom_dome", (2.00, y, -0.005), 0.15,
                  MAT["vessel_cyan"], "mass_fluid_transport_process", MO)

# KOH circulation pump: explicit centre x=0.7, y=-0.4, z=0.3.
fl.add_cyl("he11_koh_circulation_pump", (0.70, -0.40, 0.30), 0.15, 0.40,
           MAT["pump_orange"], "mass_fluid_transport_process", MO)
fl.add_cyl("he11_koh_pump_motor", (0.70, -0.18, 0.30), 0.10, 0.28,
           MAT["motor"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))

# Gas dryer and DI water polisher: explicit centres.
fl.add_cyl("he11_gas_dryer_column", (2.50, 0.0, 0.70), 0.10, 1.20,
           MAT["brass"], "mass_fluid_transport_process", MO)
fl.add_cyl("he11_di_water_polisher", (0.40, -0.50, 0.50), 0.15, 0.80,
           MAT["pipe_water"], "mass_fluid_transport_process", MO)

# Process piping, packed inside the skid envelope.
fl.add_cyl("he11_h2_stack_to_separator_line", (1.75, -0.40, 1.38), 0.018, 0.50,
           MAT["pipe_h2"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("he11_o2_stack_to_separator_line", (1.75, 0.40, 1.38), 0.018, 0.50,
           MAT["pipe_o2"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("he11_h2_separator_to_dryer_y_line", (2.25, -0.20, 1.28), 0.014, 0.40,
           MAT["pipe_h2"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("he11_h2_separator_to_dryer_x_line", (2.25, 0.0, 1.28), 0.014, 0.50,
           MAT["pipe_h2"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("he11_dryer_to_buffer_line", (2.85, 0.0, 1.22), 0.014, 0.70,
           MAT["pipe_h2"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("he11_koh_return_line", (0.95, -0.40, 0.72), 0.016, 0.50,
           MAT["pump_orange"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("he11_di_to_stack_line", (0.80, -0.50, 0.95), 0.014, 0.80,
           MAT["pipe_water"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("he11_o2_vent_line", (2.35, 0.40, 1.50), 0.014, 0.70,
           MAT["pipe_o2"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))


# ═══════ Module — environmental_interface ═══════════════════════════════════
# Heat exchanger plate pack: explicit centre x=0.7, y=+0.4, z=0.5.
for i, y in enumerate([0.295, 0.325, 0.355, 0.385, 0.415, 0.445, 0.475, 0.505]):
    fl.add_box(f"he7_heat_exchanger_plate_{i}", (0.70, y, 0.50), (0.50, 0.012, 0.80),
               MAT["thermal"], "environmental_interface", MO)
fl.add_box("he7_heat_exchanger_frame", (0.70, 0.40, 0.50), (0.56, 0.28, 0.86),
           MAT["heatsink"], "environmental_interface", MO)
fl.add_cyl("he7_cooling_fan", (0.70, 0.245, 0.82), 0.11, 0.035,
           MAT["ctrl_black"], "environmental_interface", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_torus("he7_cooling_fan_guard", (0.70, 0.225, 0.82), 0.11, 0.006,
             MAT["stainless"], "environmental_interface", MO,
             rotation=(math.radians(90), 0, 0))
for i, z in enumerate([0.24, 0.36, 0.64, 0.76]):
    fl.add_cyl(f"he7_heat_exchanger_port_{i}", (0.43, 0.40, z), 0.025, 0.10,
               MAT["pipe_water"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))

# Ventilation louvers on translucent roof/rear panel.
for i, x in enumerate([0.55, 0.75, 0.95, 2.05, 2.25, 2.45]):
    fl.add_box(f"he7_roof_vent_louver_{i}", (x, 0.22, 2.505), (0.14, 0.035, 0.010),
               MAT["thermal"], "environmental_interface", MO)


# ═══════ Module — power_distribution ════════════════════════════════════════
# AC power input and rectified DC busbars from transformer to PEM stack.
fl.add_box("he8_ac_power_input_box", (0.18, 0.62, 0.28), (0.22, 0.10, 0.22),
           MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.32, 0.40, 0.48]):
    fl.add_box(f"he8_ac_input_busbar_{i}", (0.34, 0.62, z), (0.34, 0.018, 0.018),
               MAT["copper"], "power_distribution", MO)
for i, y in enumerate([0.08, 0.17, 0.26]):
    fl.add_box(f"he8_dc_busbar_transformer_to_stack_{i}", (0.78, y, 1.38), (0.52, 0.026, 0.026),
               MAT["copper"], "power_distribution", MO)
for i, z in enumerate([0.55, 0.95, 1.35, 1.75]):
    fl.add_box(f"he8_stack_dc_vertical_bus_{i}", (0.86, 0.25, z), (0.030, 0.030, 0.30),
               MAT["copper"], "power_distribution", MO)
fl.add_box("he8_grounding_bar", (1.50, 0.69, 0.24), (2.40, 0.025, 0.025),
           MAT["copper"], "power_distribution", MO)
fl.add_box("he8_cable_tray", (1.55, 0.58, 2.05), (2.50, 0.10, 0.08),
           MAT["powerdist"], "power_distribution", MO)


# ═══════ Module — control_compute_communication ═════════════════════════════
# Control cabinet: explicit centre x=2.7, y=+0.5, z=0.6.
fl.add_box("he5_control_cabinet", (2.70, 0.50, 0.60), (0.50, 0.40, 1.20),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("he5_plc_controller", (2.70, 0.285, 0.72), (0.30, 0.030, 0.28),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("he5_safety_plc", (2.54, 0.285, 0.37), (0.12, 0.030, 0.18),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("he5_edge_gateway", (2.86, 0.285, 0.38), (0.12, 0.030, 0.16),
           MAT["control"], "control_compute_communication", MO)
fl.add_box("he5_ethernet_switch", (2.70, 0.285, 0.98), (0.22, 0.030, 0.12),
           MAT["control"], "control_compute_communication", MO)
fl.add_cyl("he5_wireless_antenna", (2.70, 0.50, 1.34), 0.008, 0.22,
           MAT["antenna"], "control_compute_communication", MO)


# ═══════ Module — safety_protection ═════════════════════════════════════════
# PRVs, H2 leak detection, flame arrestor, purge and emergency stop.
for name, y in [("h2", -0.40), ("o2", 0.40)]:
    fl.add_cyl(f"he6_{name}_separator_prv", (2.00, y, 1.67), 0.035, 0.12,
               MAT["warning_red"], "safety_protection", MO)
fl.add_cyl("he6_stack_prv", (1.20, -0.26, 1.95), 0.030, 0.10,
           MAT["warning_red"], "safety_protection", MO)
fl.add_cyl("he6_buffer_tank_prv", (3.20, 0.0, 1.62), 0.035, 0.10,
           MAT["warning_red"], "safety_protection", MO)
for i, (x, y) in enumerate([(1.40, -0.62), (2.35, -0.62), (2.55, 0.62)]):
    fl.add_box(f"he6_h2_leak_sensor_{i}", (x, y, 2.14), (0.08, 0.035, 0.05),
               MAT["warning_red"], "safety_protection", MO)
fl.add_cyl("he6_estop_mushroom", (2.70, 0.278, 1.08), 0.045, 0.030,
           MAT["safety"], "safety_protection", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("he6_estop_yellow_collar", (2.70, 0.292, 1.08), 0.060, 0.014,
           MAT["control"], "safety_protection", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("he6_blast_relief_panel_label", (1.55, 0.718, 1.72), (0.34, 0.010, 0.18),
           MAT["warning_red"], "safety_protection", MO)
fl.add_cyl("he6_flame_arrestor", (2.72, 0.0, 1.23), 0.040, 0.12,
           MAT["warning_red"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))


# ═══════ Module — sensing_instrumentation ═══════════════════════════════════
# Pressure gauges on separators, stack differential pressure, flow and quality sensors.
for i, (name, y) in enumerate([("h2", -0.40), ("o2", 0.40)]):
    fl.add_cyl(f"he4_{name}_pressure_gauge", (1.84, y, 1.20), 0.045, 0.025,
               MAT["sensor"], "sensing_instrumentation", MO,
               rotation=(0, math.radians(90), 0))
    fl.add_box(f"he4_{name}_flow_meter", (1.62, y, 1.38), (0.08, 0.07, 0.12),
               MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("he4_stack_dp_transmitter", (1.55, -0.25, 1.62), (0.08, 0.05, 0.10),
           MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("he4_stack_temperature_probe", (1.20, -0.235, 0.82), 0.012, 0.16,
           MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("he4_stack_conductivity_probe", (1.20, 0.235, 0.62), 0.012, 0.16,
           MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("he4_di_resistivity_monitor", (0.40, -0.34, 0.78), (0.07, 0.04, 0.10),
           MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("he4_cooling_water_flow_meter", (0.43, 0.24, 0.62), (0.08, 0.05, 0.10),
           MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("he4_dryer_dewpoint_sensor", (2.50, -0.12, 1.05), (0.06, 0.04, 0.08),
           MAT["sensor"], "sensing_instrumentation", MO)
for i, z in enumerate([0.35, 0.90, 1.35]):
    fl.add_box(f"he4_separator_level_sensor_{i}", (2.16, -0.40, z), (0.05, 0.04, 0.08),
               MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — actuation_kinematics ══════════════════════════════════════
# Solenoid valves on gas, water, KOH, and purge lines.
for i, (x, y, z, mat) in enumerate([
    (1.58, -0.40, 1.38, MAT["pipe_h2"]),
    (1.58, 0.40, 1.38, MAT["pipe_o2"]),
    (2.25, -0.40, 1.28, MAT["pipe_h2"]),
    (2.25, 0.40, 1.50, MAT["pipe_o2"]),
    (0.80, -0.50, 0.95, MAT["pipe_water"]),
    (0.95, -0.40, 0.72, MAT["pump_orange"]),
]):
    fl.add_box(f"he9_solenoid_valve_body_{i}", (x, y, z), (0.075, 0.075, 0.065),
               MAT["valve_green"], "actuation_kinematics", MO)
    fl.add_cyl(f"he9_solenoid_coil_{i}", (x, y, z + 0.055), 0.028, 0.055,
               MAT["ctrl_black"], "actuation_kinematics", MO)
fl.add_cyl("he9_pump_coupling", (0.70, -0.28, 0.30), 0.045, 0.13,
           MAT["maint"], "actuation_kinematics", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("he9_motorized_purge_damper", (2.72, 0.0, 1.35), (0.10, 0.06, 0.08),
           MAT["valve_green"], "actuation_kinematics", MO)


# ═══════ Module — maintenance_serviceability ════════════════════════════════
# Service access ladder on -Y walkway and maintenance valves/drains.
for x in [0.14, 0.26]:
    fl.add_cyl(f"he10_ladder_side_rail_{x:.2f}", (x, -0.705, 1.12), 0.012, 1.72,
               MAT["maint"], "maintenance_serviceability", MO)
for i, z in enumerate([0.34, 0.54, 0.74, 0.94, 1.14, 1.34, 1.54, 1.74]):
    fl.add_cyl(f"he10_ladder_rung_{i}", (0.20, -0.705, z), 0.010, 0.16,
               MAT["maint"], "maintenance_serviceability", MO,
               rotation=(0, math.radians(90), 0))
fl.add_box("he10_stack_service_access_panel", (1.20, -0.236, 1.10), (0.42, 0.018, 0.62),
           MAT["maint"], "maintenance_serviceability", MO)
for i, (x, y, z) in enumerate([(2.00, -0.40, 0.15), (2.00, 0.40, 0.15), (2.50, 0.0, 0.13),
                               (0.40, -0.50, 0.15), (0.70, -0.40, 0.16)]):
    fl.add_cyl(f"he10_manual_drain_valve_{i}", (x, y - 0.13, z), 0.025, 0.055,
               MAT["maint"], "maintenance_serviceability", MO,
               rotation=(math.radians(90), 0, 0))
for i, x in enumerate([1.00, 1.20, 1.40]):
    fl.add_cyl(f"he10_stack_lifting_eye_{i}", (x, 0.0, 1.96), 0.045, 0.010,
               MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("he10_spare_filter_cartridge", (0.26, -0.22, 0.28), (0.14, 0.14, 0.32),
           MAT["white_label"], "maintenance_serviceability", MO)
fl.add_box("he10_tool_tray", (2.28, -0.58, 0.34), (0.42, 0.16, 0.06),
           MAT["maint"], "maintenance_serviceability", MO)


# ═══════ Module — hmi_ergonomics ════════════════════════════════════════════
# HMI screen on control-cabinet front, plus buttons and status beacon.
fl.add_box("he3_hmi_bezel", (2.70, 0.292, 0.86), (0.30, 0.018, 0.22),
           MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("he3_hmi_screen", (2.70, 0.280, 0.86), (0.25, 0.006, 0.16),
           MAT["hmi"], "hmi_ergonomics", MO)
for i, (x, mat) in enumerate([(2.60, MAT["sensor"]), (2.70, MAT["control"]), (2.80, MAT["safety"])]):
    fl.add_cyl(f"he3_operator_button_{i}", (x, 0.278, 0.66), 0.018, 0.014,
               mat, "hmi_ergonomics", MO,
               rotation=(math.radians(90), 0, 0))
for i, mat in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"he3_status_beacon_{i}", (2.70, 0.50, 1.26 + i * 0.055), 0.032, 0.045,
               mat, "hmi_ergonomics", MO)
fl.add_cyl("he3_beacon_base", (2.70, 0.50, 1.215), 0.038, 0.025,
           MAT["powerdist"], "hmi_ergonomics", MO)
fl.add_box("he3_front_instruction_placard", (2.49, 0.280, 0.20), (0.16, 0.006, 0.08),
           MAT["white_label"], "hmi_ergonomics", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")