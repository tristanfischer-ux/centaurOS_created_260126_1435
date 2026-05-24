"""chiller-9shot.py — typical 100-300 kW commercial air-cooled chiller.

Outdoor skid 2.5 × 1.5 × 2.0 m with twin top axial fans, vertical
microchannel condenser coils, dual scroll compressors, brazed-plate evaporator,
R-454B refrigerant circuit, hydronic supply/return connections, side control
panel, safety devices, sensors and service access features. 10 modules.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P chiller-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-chiller-9shot")))

W = 2.5
D = 1.5
H = 2.0

X0, X1 = 0.0, W
YF, YB = -D/2, D/2
Z0, Z1 = 0.0, H

FAN1_X, FAN2_X = 0.78, 1.72
FAN_Y = 0.0
FAN_Z = H - 0.080

COMP1_X, COMP2_X = 0.78, 1.15
COMP_Y = -0.20
COMP_Z = 0.55

EVAP_X, EVAP_Y, EVAP_Z = 1.70, -0.33, 0.50
CTRL_X, CTRL_Y, CTRL_Z = 2.32, -0.52, 1.03
WATER_X = 2.56

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
])

MAT = fl.make_default_palette()
MAT["galv"]       = fl.make_mat("m_chiller_galvanised_steel", (0.56, 0.58, 0.60), metallic=0.55, roughness=0.38)
MAT["frame"]      = fl.make_mat("m_chiller_dark_frame",        (0.10, 0.12, 0.14), metallic=0.45, roughness=0.45)
MAT["grille"]     = fl.make_mat("m_chiller_black_grille",      (0.015, 0.018, 0.022), metallic=0.30, roughness=0.45)
MAT["coil_fin"]   = fl.make_mat("m_chiller_coil_fin_cyan",     (0.00, 0.58, 1.00), metallic=0.35, roughness=0.28)
MAT["coil_tube"]  = fl.make_mat("m_chiller_copper_tube",       (1.00, 0.42, 0.00), metallic=0.25, roughness=0.32)
MAT["r454b"]      = fl.make_mat("m_chiller_r454b_orange",      (1.00, 0.22, 0.00), metallic=0.00, roughness=0.45)
MAT["water_blue"] = fl.make_mat("m_chiller_water_blue",        (0.00, 0.42, 1.00), metallic=0.15, roughness=0.30)
MAT["brass"]      = fl.make_mat("m_chiller_valve_brass",       (1.00, 0.62, 0.05), metallic=0.45, roughness=0.30)
MAT["rubber"]     = fl.make_mat("m_chiller_black_rubber",      (0.01, 0.01, 0.012), metallic=0.00, roughness=0.82)
MAT["label"]      = fl.make_mat("m_chiller_warning_label",     (1.00, 0.55, 0.00), metallic=0.00, roughness=0.40)
MAT["foam"]       = fl.make_mat("m_chiller_dark_air_seal",     (0.035, 0.04, 0.045), metallic=0.00, roughness=0.85)
MAT["white_abs"]  = fl.make_mat("m_chiller_white_abs",         (0.96, 0.97, 0.98), metallic=0.00, roughness=0.50)


# ═══════ Module — structure_containment (skid, cabinet frame, fan shrouds) ═══
fl.add_box("ch1_heavy_skid_base", (W/2, 0, 0.055), (W, D, 0.110), MAT["frame"], "structure_containment", MO)
fl.add_box("ch1_front_skid_channel", (W/2, YF - 0.035, 0.135), (W, 0.070, 0.090), MAT["frame"], "structure_containment", MO)
fl.add_box("ch1_rear_skid_channel", (W/2, YB + 0.035, 0.135), (W, 0.070, 0.090), MAT["frame"], "structure_containment", MO)
fl.add_box("ch1_left_end_skid_channel", (-0.035, 0, 0.135), (0.070, D, 0.090), MAT["frame"], "structure_containment", MO)
fl.add_box("ch1_right_end_skid_channel", (W + 0.035, 0, 0.135), (0.070, D, 0.090), MAT["frame"], "structure_containment", MO)

for x in [0.08, W - 0.08]:
    for y in [YF + 0.08, YB - 0.08]:
        fl.add_box(f"ch1_corner_upright_{x:.2f}_{y:.2f}", (x, y, H/2), (0.080, 0.080, H - 0.14), MAT["galv"], "structure_containment", MO)

for x in [0.72, 1.28, 1.84]:
    fl.add_box(f"ch1_internal_vertical_frame_{x:.2f}", (x, YF + 0.055, H/2), (0.055, 0.070, H - 0.20), MAT["galv"], "structure_containment", MO)
    fl.add_box(f"ch1_rear_vertical_frame_{x:.2f}", (x, YB - 0.055, H/2), (0.055, 0.070, H - 0.20), MAT["galv"], "structure_containment", MO)

for z in [0.25, 1.05, 1.88]:
    fl.add_box(f"ch1_front_longitudinal_rail_{z:.2f}", (W/2, YF + 0.035, z), (W - 0.12, 0.055, 0.055), MAT["galv"], "structure_containment", MO)
    fl.add_box(f"ch1_rear_longitudinal_rail_{z:.2f}", (W/2, YB - 0.035, z), (W - 0.12, 0.055, 0.055), MAT["galv"], "structure_containment", MO)

fl.add_box("ch1_left_end_panel_lower", (0.025, 0, 0.58), (0.050, D - 0.20, 0.60), MAT["galv"], "structure_containment", MO)
fl.add_box("ch1_right_end_panel_lower", (W - 0.025, 0, 0.58), (0.050, D - 0.20, 0.60), MAT["galv"], "structure_containment", MO)
fl.add_box("ch1_top_crossdeck_plate", (W/2, 0, H - 0.035), (W - 0.20, D - 0.24, 0.070), MAT["galv"], "structure_containment", MO)

for fx, name in [(FAN1_X, "left"), (FAN2_X, "right")]:
    fl.add_torus(f"ch1_{name}_fan_shroud_outer_ring", (fx, FAN_Y, H + 0.010), 0.515, 0.020, MAT["grille"], "structure_containment", MO)
    fl.add_torus(f"ch1_{name}_fan_shroud_inner_ring", (fx, FAN_Y, H + 0.016), 0.315, 0.012, MAT["grille"], "structure_containment", MO)
    for i in range(8):
        a = i * math.pi / 4
        fl.add_box(f"ch1_{name}_fan_guard_spoke_{i}", (fx, FAN_Y, H + 0.020),
                   (1.000, 0.018, 0.018), MAT["grille"], "structure_containment", MO,
                   rotation=(0, 0, a))

for i in range(5):
    fl.add_box(f"ch1_front_protective_grille_rail_{i}", (W/2, YF - 0.012, 0.45 + i * 0.26),
               (W - 0.24, 0.020, 0.030), MAT["grille"], "structure_containment", MO)
    fl.add_box(f"ch1_rear_protective_grille_rail_{i}", (W/2, YB + 0.012, 0.45 + i * 0.26),
               (W - 0.24, 0.020, 0.030), MAT["grille"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction (fans, motors, compressors) ═
for cx, nm in [(COMP1_X, "a"), (COMP2_X, "b")]:
    fl.add_cyl(f"ch2_scroll_compressor_{nm}_body", (cx, COMP_Y, COMP_Z), 0.145, 0.560, MAT["compressor"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"ch2_scroll_compressor_{nm}_top_cap", (cx, COMP_Y, COMP_Z + 0.300), 0.132, 0.050, MAT["ctrl_black"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"ch2_scroll_compressor_{nm}_foot_ring", (cx, COMP_Y, COMP_Z - 0.300), 0.170, 0.040, MAT["rubber"], "energy_conversion_transduction", MO)
    fl.add_box(f"ch2_scroll_compressor_{nm}_terminal_box", (cx + 0.140, COMP_Y - 0.020, COMP_Z + 0.040),
               (0.075, 0.115, 0.130), MAT["powerdist"], "energy_conversion_transduction", MO)

for fx, name in [(FAN1_X, "left"), (FAN2_X, "right")]:
    fl.add_cyl(f"ch2_{name}_axial_fan_motor", (fx, FAN_Y, FAN_Z - 0.070), 0.105, 0.130, MAT["motor"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"ch2_{name}_axial_fan_hub", (fx, FAN_Y, FAN_Z + 0.020), 0.090, 0.055, MAT["rotor_cap"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"ch2_{name}_motor_shaft", (fx, FAN_Y, FAN_Z - 0.150), 0.025, 0.120, MAT["stainless"], "energy_conversion_transduction", MO)
    fl.add_box(f"ch2_{name}_motor_mount_crossbar_x", (fx, FAN_Y, FAN_Z - 0.160), (0.760, 0.035, 0.035), MAT["stainless"], "energy_conversion_transduction", MO)
    fl.add_box(f"ch2_{name}_motor_mount_crossbar_y", (fx, FAN_Y, FAN_Z - 0.160), (0.035, 0.760, 0.035), MAT["stainless"], "energy_conversion_transduction", MO)
    for i in range(6):
        a = i * math.tau / 6
        bx = fx + math.cos(a) * 0.205
        by = FAN_Y + math.sin(a) * 0.205
        fl.add_box(f"ch2_{name}_wide_fan_blade_{i}", (bx, by, FAN_Z + 0.015),
                   (0.430, 0.075, 0.020), MAT["rotor_cap"], "energy_conversion_transduction", MO,
                   rotation=(0, 0, a + math.radians(17)))

fl.add_box("ch2_dual_vfd_power_module", (1.92, -0.49, 0.98), (0.250, 0.075, 0.360), MAT["inverter"], "energy_conversion_transduction", MO)
fl.add_box("ch2_compressor_mounting_rail", (0.97, COMP_Y, 0.220), (0.760, 0.120, 0.060), MAT["stainless"], "energy_conversion_transduction", MO)


# ═══════ Module — environmental_interface (condenser coils and airflow) ═════
fl.add_box("ch3_front_microchannel_condenser_core", (W/2, YF + 0.030, 1.05), (2.18, 0.060, 1.38), MAT["coil_fin"], "environmental_interface", MO)
fl.add_box("ch3_rear_microchannel_condenser_core", (W/2, YB - 0.030, 1.05), (2.18, 0.060, 1.38), MAT["coil_fin"], "environmental_interface", MO)
fl.add_box("ch3_left_end_microchannel_coil", (0.060, 0.0, 1.08), (0.060, 1.08, 1.25), MAT["coil_fin"], "environmental_interface", MO)

for i in range(11):
    x = 0.30 + i * 0.19
    fl.add_box(f"ch3_front_vertical_fin_bank_{i}", (x, YF - 0.012, 1.05),
               (0.012, 0.026, 1.32), MAT["heatsink"], "environmental_interface", MO)
    fl.add_box(f"ch3_rear_vertical_fin_bank_{i}", (x, YB + 0.012, 1.05),
               (0.012, 0.026, 1.32), MAT["heatsink"], "environmental_interface", MO)

for z in [0.52, 0.78, 1.04, 1.30, 1.56]:
    fl.add_cyl(f"ch3_front_copper_coil_tube_{z:.2f}", (W/2, YF - 0.030, z),
               0.010, 2.06, MAT["coil_tube"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"ch3_rear_copper_coil_tube_{z:.2f}", (W/2, YB + 0.030, z),
               0.010, 2.06, MAT["coil_tube"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))

fl.add_box("ch3_left_air_seal_baffle", (0.34, -0.48, 1.12), (0.050, 0.220, 1.25), MAT["foam"], "environmental_interface", MO)
fl.add_box("ch3_center_air_divider_baffle", (1.25, 0.0, 1.20), (0.050, 1.12, 1.18), MAT["foam"], "environmental_interface", MO)
fl.add_box("ch3_right_air_seal_baffle", (2.16, 0.48, 1.12), (0.050, 0.220, 1.25), MAT["foam"], "environmental_interface", MO)
fl.add_box("ch3_sloped_condensate_drain_pan", (W/2, 0.0, 0.245), (2.22, 1.16, 0.040), MAT["stainless"], "environmental_interface", MO,
           rotation=(math.radians(2.5), 0, 0))


# ═══════ Module — mass_fluid_transport_process (R-454B and water circuit) ═══
fl.add_box("ch4_brazed_plate_evaporator_stack", (EVAP_X, EVAP_Y, EVAP_Z), (0.520, 0.180, 0.320), MAT["stainless"], "mass_fluid_transport_process", MO)
for i in range(6):
    fl.add_box(f"ch4_evaporator_plate_layer_{i}", (EVAP_X - 0.210 + i * 0.084, EVAP_Y - 0.098, EVAP_Z),
               (0.018, 0.030, 0.300), MAT["heatsink"], "mass_fluid_transport_process", MO)

fl.add_cyl("ch4_water_supply_header", (2.18, -0.34, 0.60), 0.050, 0.700, MAT["water_blue"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("ch4_water_return_header", (2.18, -0.34, 0.40), 0.050, 0.700, MAT["water_blue"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("ch4_external_supply_nozzle", (WATER_X, -0.34, 0.60), 0.065, 0.150, MAT["water_blue"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("ch4_external_return_nozzle", (WATER_X, -0.34, 0.40), 0.065, 0.150, MAT["water_blue"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_torus("ch4_supply_flange_ring", (2.62, -0.34, 0.60), 0.080, 0.010, MAT["brass"], "mass_fluid_transport_process", MO,
             rotation=(0, math.radians(90), 0))
fl.add_torus("ch4_return_flange_ring", (2.62, -0.34, 0.40), 0.080, 0.010, MAT["brass"], "mass_fluid_transport_process", MO,
             rotation=(0, math.radians(90), 0))

fl.add_cyl("ch4_discharge_line_comp_a", (0.92, -0.20, 0.88), 0.017, 0.640, MAT["coil_tube"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("ch4_discharge_line_comp_b", (1.30, -0.20, 0.86), 0.017, 0.520, MAT["coil_tube"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("ch4_liquid_line_from_coil", (1.58, 0.16, 0.80), 0.012, 0.780, MAT["coil_tube"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("ch4_suction_manifold_to_compressors", (1.27, -0.28, 0.66), 0.026, 0.900, MAT["coil_tube"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("ch4_dual_electronic_expansion_valve_block", (1.45, -0.10, 0.74), (0.160, 0.080, 0.090), MAT["r454b"], "mass_fluid_transport_process", MO)
fl.add_cyl("ch4_filter_drier_shell", (1.25, 0.12, 0.78), 0.035, 0.210, MAT["stainless"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
for x in [1.08, 1.62]:
    fl.add_cyl(f"ch4_r454b_orange_service_sleeve_{x:.2f}", (x, 0.12, 0.78),
               0.020, 0.055, MAT["r454b"], "mass_fluid_transport_process", MO,
               rotation=(0, math.radians(90), 0))


# ═══════ Module — control_compute_communication (controller and gateway) ════
fl.add_box("ch5_weatherproof_control_cabinet", (CTRL_X, CTRL_Y, CTRL_Z), (0.300, 0.120, 0.760), MAT["powerdist"], "control_compute_communication", MO)
fl.add_box("ch5_main_controller_pcb", (CTRL_X, CTRL_Y - 0.065, 1.16), (0.230, 0.014, 0.200), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("ch5_io_expansion_board", (CTRL_X, CTRL_Y - 0.067, 0.94), (0.220, 0.014, 0.160), MAT["control"], "control_compute_communication", MO)
fl.add_box("ch5_chiller_microprocessor", (CTRL_X - 0.055, CTRL_Y - 0.076, 1.17), (0.060, 0.012, 0.060), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("ch5_bacnet_modbus_gateway", (CTRL_X + 0.060, CTRL_Y - 0.076, 1.05), (0.075, 0.012, 0.055), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("ch5_short_cellular_antenna", (CTRL_X + 0.115, CTRL_Y - 0.060, 1.44), 0.007, 0.170, MAT["antenna"], "control_compute_communication", MO)
for i in range(4):
    fl.add_box(f"ch5_vfd_heatsink_fin_{i}", (CTRL_X - 0.090 + i * 0.030, CTRL_Y - 0.080, 0.78),
               (0.010, 0.050, 0.155), MAT["heatsink"], "control_compute_communication", MO)


# ═══════ Module — safety_protection (relief, switches, guards, labels) ══════
fl.add_cyl("ch6_refrigerant_relief_valve_body", (1.55, -0.19, 0.95), 0.030, 0.080, MAT["safety"], "safety_protection", MO)
fl.add_cyl("ch6_relief_vent_riser", (1.55, -0.19, 1.08), 0.012, 0.210, MAT["safety"], "safety_protection", MO)
fl.add_box("ch6_high_pressure_cutout_switch", (1.38, -0.25, 0.91), (0.060, 0.040, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_box("ch6_low_pressure_cutout_switch", (1.05, -0.28, 0.69), (0.060, 0.040, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_box("ch6_r454b_leak_detector", (0.42, YF - 0.020, 0.44), (0.090, 0.020, 0.060), MAT["safety"], "safety_protection", MO)
fl.add_box("ch6_emergency_stop_station", (2.36, YF - 0.030, 1.42), (0.095, 0.030, 0.075), MAT["safety"], "safety_protection", MO)
fl.add_box("ch6_main_earth_bond_bar", (2.12, YF + 0.045, 0.28), (0.180, 0.020, 0.016), MAT["copper"], "safety_protection", MO)
fl.add_box("ch6_r454b_a2l_warning_label", (0.70, YF - 0.026, 0.34), (0.180, 0.008, 0.075), MAT["label"], "safety_protection", MO)


# ═══════ Module — sensing_instrumentation (pressure, temp, flow sensors) ═════
fl.add_cyl("ch7_suction_pressure_transducer", (1.05, -0.34, 0.72), 0.016, 0.065, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("ch7_discharge_pressure_transducer", (1.35, -0.29, 0.92), 0.016, 0.065, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("ch7_supply_water_temp_probe", (2.36, -0.34, 0.65), 0.010, 0.090, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("ch7_return_water_temp_probe", (2.36, -0.34, 0.35), 0.010, 0.090, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("ch7_water_flow_switch", (2.06, -0.45, 0.52), (0.085, 0.040, 0.065), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("ch7_ambient_air_sensor", (0.20, YB + 0.028, 1.43), (0.060, 0.020, 0.060), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("ch7_left_fan_tach_sensor", (FAN1_X - 0.110, FAN_Y + 0.110, FAN_Z + 0.055), 0.014, 0.035, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("ch7_right_fan_tach_sensor", (FAN2_X - 0.110, FAN_Y + 0.110, FAN_Z + 0.055), 0.014, 0.035, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("ch7_freeze_protection_probe", (EVAP_X - 0.26, EVAP_Y - 0.10, EVAP_Z - 0.08), (0.070, 0.018, 0.035), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — power_distribution (mains, bus, fuses, glands) ════════════
fl.add_box("ch8_main_disconnect_switch", (2.12, YF + 0.080, 1.10), (0.160, 0.080, 0.180), MAT["powerdist"], "power_distribution", MO)
fl.add_box("ch8_three_phase_mains_terminal", (2.10, YF + 0.080, 0.55), (0.180, 0.075, 0.090), MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.48, 0.54, 0.60]):
    fl.add_box(f"ch8_copper_busbar_phase_{i}", (2.10, YF + 0.030, z), (0.210, 0.014, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_box("ch8_dual_compressor_contactor_bank", (1.90, YF + 0.085, 0.78), (0.190, 0.075, 0.150), MAT["powerdist"], "power_distribution", MO)
fl.add_box("ch8_control_transformer", (1.90, YF + 0.085, 0.52), (0.120, 0.080, 0.110), MAT["ctrl_black"], "power_distribution", MO)
fl.add_box("ch8_fuse_holder_row", (2.28, YF + 0.085, 0.78), (0.135, 0.060, 0.110), MAT["safety"], "power_distribution", MO)
fl.add_cyl("ch8_large_power_cable_gland", (2.18, YF - 0.035, 0.33), 0.035, 0.070, MAT["powerdist"], "power_distribution", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("ch8_control_cable_gland", (2.30, YF - 0.035, 0.33), 0.022, 0.070, MAT["powerdist"], "power_distribution", MO,
           rotation=(math.radians(90), 0, 0))


# ═══════ Module — hmi_ergonomics (side HMI, labels, indicators) ═════════════
fl.add_box("ch9_hmi_display_bezel", (2.36, YF - 0.028, 1.28), (0.190, 0.014, 0.120), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("ch9_hmi_lcd_screen", (2.36, YF - 0.036, 1.28), (0.155, 0.008, 0.080), MAT["hmi"], "hmi_ergonomics", MO)
for i, c in enumerate([MAT["sensor"], MAT["control"], MAT["safety"]]):
    fl.add_cyl(f"ch9_hmi_status_button_{i}", (2.30 + i * 0.055, YF - 0.038, 1.17),
               0.016, 0.012, c, "hmi_ergonomics", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_box("ch9_model_nameplate", (0.32, YF - 0.026, 1.62), (0.240, 0.008, 0.080), MAT["white_abs"], "hmi_ergonomics", MO)
fl.add_box("ch9_commissioning_qr_label", (0.32, YF - 0.028, 1.48), (0.090, 0.008, 0.090), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("ch9_remote_alarm_beacon", (2.18, YF - 0.028, 1.38), 0.026, 0.026, MAT["control"], "hmi_ergonomics", MO,
           rotation=(math.radians(90), 0, 0))


# ═══════ Module — maintenance_serviceability (doors, handles, ports) ════════
fl.add_box("ch10_large_control_panel_door", (2.35, YF - 0.018, 1.00), (0.330, 0.018, 0.860), MAT["maint"], "maintenance_serviceability", MO)
fl.add_torus("ch10_control_panel_pull_handle", (2.47, YF - 0.036, 1.04), 0.055, 0.008, MAT["maint"], "maintenance_serviceability", MO,
             rotation=(0, math.radians(90), 0))
fl.add_box("ch10_compressor_access_panel", (0.92, YF - 0.018, 0.63), (0.620, 0.018, 0.540), MAT["maint"], "maintenance_serviceability", MO)
fl.add_torus("ch10_compressor_panel_handle", (1.18, YF - 0.038, 0.64), 0.050, 0.008, MAT["maint"], "maintenance_serviceability", MO,
             rotation=(0, math.radians(90), 0))
fl.add_box("ch10_evaporator_service_panel", (1.72, YF - 0.018, 0.62), (0.480, 0.018, 0.500), MAT["maint"], "maintenance_serviceability", MO)
fl.add_cyl("ch10_liquid_line_service_port_cap", (1.66, YF - 0.052, 0.82), 0.026, 0.040, MAT["maint"], "maintenance_serviceability", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("ch10_suction_service_port_cap", (1.10, YF - 0.052, 0.70), 0.032, 0.045, MAT["maint"], "maintenance_serviceability", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("ch10_lifting_lug_front_left", (0.18, YF - 0.040, 0.24), (0.080, 0.030, 0.080), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ch10_lifting_lug_front_right", (W - 0.18, YF - 0.040, 0.24), (0.080, 0.030, 0.080), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ch10_document_pouch_inside_door", (2.28, YF - 0.040, 0.72), (0.180, 0.010, 0.090), MAT["white_abs"], "maintenance_serviceability", MO)


# ─── Lighting + world + render ─────────────────────────────────────────────
fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")