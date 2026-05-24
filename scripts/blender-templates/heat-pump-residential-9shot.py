"""heat-pump-residential-9shot.py — typical 5-12 kW residential air-source heat pump outdoor unit.

Outdoor steel cabinet 1.1 × 0.4 × 0.85 m with top axial fan, rear
microchannel evaporator coil, scroll compressor, R290 refrigerant circuit,
side electronics enclosure, condensate tray, safety switches, sensors and
service access features. 10 modules.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P heat-pump-residential-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-heat-pump-residential-9shot")))

W = 1.1
D = 0.4
H = 0.85

X0, X1 = 0.0, W
YF, YB = -D/2, D/2
Z0, Z1 = 0.0, H

FAN_X, FAN_Y, FAN_Z = W * 0.48, 0.0, H - 0.095
COIL_X, COIL_Y, COIL_Z = W * 0.52, YB - 0.035, 0.43
COMP_X, COMP_Y, COMP_Z = 0.26, -0.04, 0.24
ELEC_X, ELEC_Y, ELEC_Z = 0.91, -0.03, 0.44

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
# Form-factor extensions — saturated engineering colours
MAT["galv"]       = fl.make_mat("m_galvanised_steel", (0.58, 0.60, 0.62), metallic=0.55, roughness=0.38)
MAT["grille"]     = fl.make_mat("m_black_grille",     (0.02, 0.025, 0.03), metallic=0.30, roughness=0.45)
MAT["r290"]       = fl.make_mat("m_r290_orange",      (1.00, 0.25, 0.00), metallic=0.00, roughness=0.45)
MAT["coil_fin"]   = fl.make_mat("m_coil_fin_blue",    (0.00, 0.55, 1.00), metallic=0.35, roughness=0.30)
MAT["coil_tube"]  = fl.make_mat("m_coil_tube_copper", (1.00, 0.42, 0.00), metallic=0.25, roughness=0.32)
MAT["rubber"]     = fl.make_mat("m_black_rubber",     (0.01, 0.01, 0.012), metallic=0.00, roughness=0.80)
MAT["condensate"] = fl.make_mat("m_condensate_blue",  (0.00, 0.75, 1.00), metallic=0.05, roughness=0.25, alpha=0.65)
MAT["label"]      = fl.make_mat("m_warning_label",    (1.00, 0.55, 0.00), metallic=0.00, roughness=0.40)
MAT["white_abs"]  = fl.make_mat("m_white_abs",        (0.96, 0.97, 0.98), metallic=0.00, roughness=0.50)
MAT["foam"]       = fl.make_mat("m_dark_foam",        (0.04, 0.05, 0.06), metallic=0.00, roughness=0.85)


# ═══════ Module — structure_containment (cabinet shell + grille frame) ══════
fl.add_box("hp1_base_plinth", (W/2, 0, 0.035), (W, D, 0.070), MAT["galv"], "structure_containment", MO)
fl.add_box("hp1_top_lid", (W/2, 0, H - 0.015), (W, D, 0.030), MAT["galv"], "structure_containment", MO)
fl.add_box("hp1_left_side_panel", (0.010, 0, H/2), (0.020, D, H), MAT["galv"], "structure_containment", MO)
fl.add_box("hp1_right_side_panel", (W - 0.010, 0, H/2), (0.020, D, H), MAT["galv"], "structure_containment", MO)
fl.add_box("hp1_front_lower_panel", (W/2, YF - 0.006, 0.18), (W, 0.012, 0.22), MAT["galv"], "structure_containment", MO)
fl.add_box("hp1_rear_coil_guard_frame", (W/2, YB + 0.006, H/2), (W, 0.012, H), MAT["galv"], "structure_containment", MO)

for sx, sy in [(0.035, YF + 0.025), (W - 0.035, YF + 0.025), (0.035, YB - 0.025), (W - 0.035, YB - 0.025)]:
    fl.add_box(f"hp1_corner_post_{sx:.2f}_{sy:.2f}", (sx, sy, H/2), (0.045, 0.045, H), MAT["galv"], "structure_containment", MO)

for z in [0.13, 0.35, 0.57, 0.79]:
    fl.add_box(f"hp1_front_grille_rail_{z:.2f}", (W/2, YF - 0.012, z), (W - 0.12, 0.014, 0.020), MAT["grille"], "structure_containment", MO)
for i in range(11):
    x = 0.10 + i * 0.09
    fl.add_box(f"hp1_front_grille_slat_{i}", (x, YF - 0.015, 0.49), (0.018, 0.012, 0.55), MAT["grille"], "structure_containment", MO)

for i in range(7):
    y = YF + 0.08 + i * 0.045
    fl.add_box(f"hp1_left_intake_louver_{i}", (0.004, y, 0.46), (0.012, 0.026, 0.48), MAT["grille"], "structure_containment", MO)
for i in range(7):
    y = YF + 0.08 + i * 0.045
    fl.add_box(f"hp1_right_service_louver_{i}", (W - 0.004, y, 0.46), (0.012, 0.026, 0.48), MAT["grille"], "structure_containment", MO)

fl.add_torus("hp1_top_fan_outer_ring", (FAN_X, FAN_Y, H + 0.006), 0.265, 0.010, MAT["grille"], "structure_containment", MO)
fl.add_torus("hp1_top_fan_inner_ring", (FAN_X, FAN_Y, H + 0.009), 0.145, 0.007, MAT["grille"], "structure_containment", MO)
for i in range(8):
    a = i * math.pi / 4
    fl.add_box(f"hp1_top_grille_spoke_{i}", (FAN_X, FAN_Y, H + 0.010),
               (0.520, 0.014, 0.012), MAT["grille"], "structure_containment", MO,
               rotation=(0, 0, a))


# ═══════ Module — energy_conversion_transduction (fan, motor, compressor) ═══
fl.add_cyl("hp2_scroll_compressor_body", (COMP_X, COMP_Y, COMP_Z), 0.110, 0.350, MAT["compressor"], "energy_conversion_transduction", MO)
fl.add_cyl("hp2_compressor_top_cap", (COMP_X, COMP_Y, COMP_Z + 0.185), 0.102, 0.030, MAT["ctrl_black"], "energy_conversion_transduction", MO)
fl.add_cyl("hp2_compressor_foot_ring", (COMP_X, COMP_Y, COMP_Z - 0.185), 0.125, 0.025, MAT["rubber"], "energy_conversion_transduction", MO)
fl.add_box("hp2_compressor_terminal_box", (COMP_X + 0.105, COMP_Y - 0.020, COMP_Z + 0.020),
           (0.050, 0.090, 0.100), MAT["powerdist"], "energy_conversion_transduction", MO)

fl.add_cyl("hp2_fan_motor", (FAN_X, FAN_Y, FAN_Z - 0.035), 0.070, 0.090, MAT["motor"], "energy_conversion_transduction", MO)
fl.add_cyl("hp2_fan_hub", (FAN_X, FAN_Y, FAN_Z + 0.018), 0.060, 0.035, MAT["rotor_cap"], "energy_conversion_transduction", MO)
for i in range(6):
    a = i * math.tau / 6
    bx = FAN_X + math.cos(a) * 0.115
    by = FAN_Y + math.sin(a) * 0.115
    fl.add_box(f"hp2_axial_fan_blade_{i}", (bx, by, FAN_Z + 0.010),
               (0.220, 0.052, 0.014), MAT["rotor_cap"], "energy_conversion_transduction", MO,
               rotation=(0, 0, a + math.radians(18)))

fl.add_cyl("hp2_blower_shaft", (FAN_X, FAN_Y, FAN_Z - 0.085), 0.018, 0.070, MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_box("hp2_motor_mount_crossbar_x", (FAN_X, FAN_Y, FAN_Z - 0.095), (0.560, 0.026, 0.026), MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_box("hp2_motor_mount_crossbar_y", (FAN_X, FAN_Y, FAN_Z - 0.095), (0.026, 0.360, 0.026), MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_box("hp2_inverter_power_module", (ELEC_X, ELEC_Y, 0.50), (0.180, 0.050, 0.180), MAT["inverter"], "energy_conversion_transduction", MO)


# ═══════ Module — environmental_interface (coil, air path, condensate) ══════
fl.add_box("hp3_evaporator_microchannel_core", (COIL_X, COIL_Y, COIL_Z),
           (0.980, 0.050, 0.720), MAT["coil_fin"], "environmental_interface", MO)
for i in range(15):
    x = 0.08 + i * 0.065
    fl.add_box(f"hp3_evap_vertical_fin_{i}", (x, COIL_Y - 0.030, COIL_Z),
               (0.009, 0.018, 0.700), MAT["heatsink"], "environmental_interface", MO)
for i in range(7):
    z = 0.14 + i * 0.095
    fl.add_cyl(f"hp3_evap_copper_tube_{i}", (COIL_X, COIL_Y - 0.055, z),
               0.008, 0.930, MAT["coil_tube"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))

fl.add_box("hp3_rear_air_filter_mesh", (COIL_X, YB + 0.018, COIL_Z), (1.000, 0.010, 0.730), MAT["grille"], "environmental_interface", MO)
fl.add_box("hp3_bottom_drip_tray", (W/2, 0.020, 0.090), (0.980, 0.310, 0.035), MAT["condensate"], "environmental_interface", MO)
fl.add_box("hp3_drip_tray_slope_plate", (W/2, 0.060, 0.118), (0.940, 0.240, 0.012), MAT["stainless"], "environmental_interface", MO,
           rotation=(math.radians(4), 0, 0))
fl.add_cyl("hp3_condensate_drain_stub", (0.090, YF - 0.030, 0.105),
           0.018, 0.060, MAT["condensate"], "environmental_interface", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("hp3_weather_lip_top_front", (W/2, YF - 0.030, H - 0.045), (1.050, 0.040, 0.030), MAT["galv"], "environmental_interface", MO)
fl.add_box("hp3_air_baffle_left", (0.120, -0.010, 0.520), (0.030, 0.260, 0.500), MAT["foam"], "environmental_interface", MO)
fl.add_box("hp3_air_baffle_right", (0.790, -0.010, 0.520), (0.030, 0.260, 0.500), MAT["foam"], "environmental_interface", MO)

for sx in [0.12, W - 0.12]:
    for sy in [YF + 0.05, YB - 0.05]:
        fl.add_cyl(f"hp3_vibration_damper_{sx:.2f}_{sy:.2f}", (sx, sy, -0.018),
                   0.040, 0.035, MAT["rubber"], "environmental_interface", MO)


# ═══════ Module — mass_fluid_transport_process (R290 refrigerant circuit) ═══
fl.add_cyl("hp4_suction_line_comp_to_accum", (0.390, -0.045, 0.275),
           0.014, 0.240, MAT["copper"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("hp4_suction_line_riser", (0.510, -0.045, 0.410),
           0.014, 0.270, MAT["copper"], "mass_fluid_transport_process", MO)
fl.add_cyl("hp4_suction_line_to_coil", (0.630, 0.045, 0.545),
           0.014, 0.310, MAT["copper"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp4_liquid_line_lower", (0.460, -0.120, 0.185),
           0.009, 0.420, MAT["copper"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("hp4_liquid_line_to_evap", (0.690, 0.020, 0.245),
           0.009, 0.300, MAT["copper"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))

fl.add_cyl("hp4_r290_orange_suction_sleeve", (0.520, -0.045, 0.550),
           0.020, 0.045, MAT["r290"], "mass_fluid_transport_process", MO)
fl.add_cyl("hp4_r290_orange_liquid_sleeve", (0.670, -0.120, 0.185),
           0.014, 0.045, MAT["r290"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("hp4_accumulator", (0.480, -0.105, 0.305),
           0.070, 0.230, MAT["stainless"], "mass_fluid_transport_process", MO)
fl.add_box("hp4_four_way_reversing_valve_body", (0.575, -0.110, 0.335),
           (0.145, 0.060, 0.070), MAT["r290"], "mass_fluid_transport_process", MO)
for i, dz in enumerate([-0.045, 0.045]):
    fl.add_cyl(f"hp4_reversing_valve_port_{i}", (0.575, -0.165, 0.335 + dz),
               0.013, 0.070, MAT["copper"], "mass_fluid_transport_process", MO,
               rotation=(math.radians(90), 0, 0))

fl.add_box("hp4_electronic_expansion_valve", (0.745, -0.040, 0.245),
           (0.055, 0.045, 0.060), MAT["r290"], "mass_fluid_transport_process", MO)
fl.add_cyl("hp4_filter_drier", (0.595, -0.120, 0.185),
           0.026, 0.120, MAT["stainless"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("hp4_service_outlet_liquid", (0.980, YF - 0.035, 0.210),
           0.018, 0.055, MAT["r290"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp4_service_outlet_suction", (0.980, YF - 0.035, 0.310),
           0.026, 0.055, MAT["r290"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))


# ═══════ Module — control_compute_communication (electronics enclosure) ═════
fl.add_box("hp5_electronics_enclosure", (ELEC_X, ELEC_Y, ELEC_Z),
           (0.300, 0.250, 0.400), MAT["powerdist"], "control_compute_communication", MO)
fl.add_box("hp5_inverter_pcb", (ELEC_X, ELEC_Y - 0.105, 0.500),
           (0.245, 0.012, 0.180), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("hp5_control_board", (ELEC_X, ELEC_Y - 0.107, 0.335),
           (0.205, 0.012, 0.125), MAT["control"], "control_compute_communication", MO)
fl.add_box("hp5_microcontroller_module", (ELEC_X - 0.050, ELEC_Y - 0.116, 0.340),
           (0.055, 0.010, 0.055), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("hp5_wifi_gateway", (ELEC_X + 0.070, ELEC_Y - 0.116, 0.390),
           (0.060, 0.010, 0.040), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("hp5_short_antenna", (ELEC_X + 0.120, ELEC_Y - 0.100, 0.665),
           0.005, 0.120, MAT["antenna"], "control_compute_communication", MO)
for i in range(5):
    fl.add_box(f"hp5_heatsink_fin_{i}", (ELEC_X - 0.090 + i * 0.025, ELEC_Y - 0.124, 0.555),
               (0.008, 0.040, 0.120), MAT["heatsink"], "control_compute_communication", MO)
fl.add_box("hp5_sensor_io_terminal_strip", (ELEC_X + 0.090, ELEC_Y - 0.116, 0.285),
           (0.120, 0.018, 0.035), MAT["control"], "control_compute_communication", MO)
fl.add_box("hp5_firmware_label", (ELEC_X, ELEC_Y - 0.131, 0.610),
           (0.135, 0.004, 0.045), MAT["label"], "control_compute_communication", MO)


# ═══════ Module — safety_protection (PRV, pressure switches, gas safety) ════
fl.add_cyl("hp6_prv_body", (0.640, -0.145, 0.420),
           0.025, 0.070, MAT["safety"], "safety_protection", MO)
fl.add_cyl("hp6_prv_vent_pipe", (0.640, -0.180, 0.465),
           0.010, 0.110, MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_high_pressure_switch", (0.610, -0.170, 0.365),
           (0.045, 0.030, 0.040), MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_low_pressure_switch", (0.430, -0.165, 0.265),
           (0.045, 0.030, 0.040), MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_r290_gas_detector", (0.120, YF - 0.018, 0.165),
           (0.070, 0.018, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_fan_guard_interlock", (FAN_X + 0.230, FAN_Y - 0.120, H + 0.026),
           (0.055, 0.035, 0.025), MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_electrical_earth_bond", (W - 0.125, YF + 0.015, 0.105),
           (0.100, 0.020, 0.012), MAT["copper"], "safety_protection", MO)
fl.add_box("hp6_r290_warning_label", (0.245, YF - 0.020, 0.235),
           (0.135, 0.006, 0.060), MAT["label"], "safety_protection", MO)


# ═══════ Module — sensing_instrumentation (temperature, pressure, ice) ══════
fl.add_cyl("hp7_suction_pressure_transducer", (0.455, -0.145, 0.385),
           0.015, 0.060, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("hp7_discharge_pressure_transducer", (0.575, -0.145, 0.405),
           0.015, 0.060, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("hp7_coil_temp_probe_upper", (0.330, COIL_Y - 0.060, 0.650),
           0.008, 0.100, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp7_coil_temp_probe_lower", (0.760, COIL_Y - 0.060, 0.250),
           0.008, 0.100, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("hp7_ambient_air_sensor", (0.085, YB + 0.025, 0.560),
           (0.045, 0.020, 0.045), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("hp7_ice_detection_sensor", (0.520, COIL_Y - 0.070, 0.130),
           (0.060, 0.020, 0.030), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("hp7_fan_tach_sensor", (FAN_X - 0.075, FAN_Y + 0.075, FAN_Z + 0.040),
           0.012, 0.030, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("hp7_condensate_level_sensor", (0.210, YF + 0.060, 0.135),
           (0.055, 0.018, 0.030), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — power_distribution (AC mains, DC bus, contactors) ═════════
fl.add_box("hp8_mains_terminal_block", (0.960, YF + 0.035, 0.160),
           (0.145, 0.055, 0.060), MAT["powerdist"], "power_distribution", MO)
for i, z in enumerate([0.130, 0.165, 0.200]):
    fl.add_box(f"hp8_copper_busbar_{i}", (0.905, YF + 0.018, z),
               (0.175, 0.012, 0.012), MAT["copper"], "power_distribution", MO)
fl.add_box("hp8_ac_contactor", (0.860, YF + 0.080, 0.255),
           (0.100, 0.070, 0.100), MAT["powerdist"], "power_distribution", MO)
fl.add_box("hp8_dc_link_capacitor_bank", (0.955, YF + 0.075, 0.405),
           (0.110, 0.060, 0.140), MAT["ctrl_black"], "power_distribution", MO)
fl.add_cyl("hp8_cable_gland_power", (1.035, YF - 0.030, 0.145),
           0.022, 0.045, MAT["powerdist"], "power_distribution", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp8_cable_gland_control", (0.970, YF - 0.030, 0.145),
           0.016, 0.045, MAT["powerdist"], "power_distribution", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("hp8_ground_bar", (0.960, YF + 0.025, 0.085),
           (0.140, 0.015, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_box("hp8_fuse_holder", (0.790, YF + 0.080, 0.160),
           (0.080, 0.055, 0.070), MAT["safety"], "power_distribution", MO)


# ═══════ Module — hmi_ergonomics (service UI, display, labels) ═════════════
fl.add_box("hp9_small_status_display_bezel", (W - 0.145, YF - 0.020, 0.620),
           (0.155, 0.012, 0.085), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("hp9_small_status_display_screen", (W - 0.145, YF - 0.026, 0.620),
           (0.125, 0.006, 0.055), MAT["hmi"], "hmi_ergonomics", MO)
for i, c in enumerate([MAT["sensor"], MAT["control"], MAT["safety"]]):
    fl.add_cyl(f"hp9_service_button_{i}", (W - 0.195 + i * 0.050, YF - 0.026, 0.545),
               0.013, 0.010, c, "hmi_ergonomics", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_box("hp9_brand_badge", (0.180, YF - 0.022, 0.690),
           (0.170, 0.006, 0.055), MAT["white_abs"], "hmi_ergonomics", MO)
fl.add_box("hp9_installation_qr_label", (0.180, YF - 0.023, 0.590),
           (0.075, 0.006, 0.075), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("hp9_status_beacon_green", (W - 0.070, YF - 0.018, 0.725),
           0.018, 0.020, MAT["sensor"], "hmi_ergonomics", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp9_status_beacon_amber", (W - 0.070, YF - 0.018, 0.680),
           0.018, 0.020, MAT["control"], "hmi_ergonomics", MO,
           rotation=(math.radians(90), 0, 0))


# ═══════ Module — maintenance_serviceability (ports, panels, handles) ═══════
fl.add_box("hp10_removable_service_door", (W - 0.145, YF - 0.018, 0.395),
           (0.270, 0.014, 0.390), MAT["maint"], "maintenance_serviceability", MO)
fl.add_torus("hp10_service_door_handle", (W - 0.055, YF - 0.030, 0.420),
             0.045, 0.007, MAT["maint"], "maintenance_serviceability", MO,
             rotation=(0, math.radians(90), 0))
for z in [0.210, 0.310]:
    fl.add_cyl(f"hp10_service_valve_cap_{z:.2f}", (1.030, YF - 0.050, z),
               0.025, 0.035, MAT["maint"], "maintenance_serviceability", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_box("hp10_filter_access_tab", (0.090, YB + 0.024, 0.760),
           (0.120, 0.012, 0.030), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("hp10_drain_cleanout_cover", (0.095, YF - 0.020, 0.115),
           (0.075, 0.012, 0.045), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("hp10_lifting_handle_left", (0.040, 0, 0.740),
           (0.018, 0.160, 0.040), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("hp10_lifting_handle_right", (W - 0.040, 0, 0.740),
           (0.018, 0.160, 0.040), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("hp10_spares_document_pouch", (W - 0.145, YF - 0.025, 0.245),
           (0.180, 0.008, 0.075), MAT["white_abs"], "maintenance_serviceability", MO)


# ─── Lighting + world + render ─────────────────────────────────────────────
fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")