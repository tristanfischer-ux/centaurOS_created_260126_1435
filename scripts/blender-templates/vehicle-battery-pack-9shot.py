"""vehicle-battery-pack-9shot.py — EV skateboard battery pack through the forge_blender_lib pipeline.

Hand-coded ForgeOS engineering template for a 60–90 kWh vehicle battery pack:
aluminium tray + translucent lid, 12 internal modules, cold plates, coolant
manifolds, HV junction box, BMS/control electronics, sensing, safety hardware,
and serviceability features.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P vehicle-battery-pack-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-vehicle-battery-pack-9shot")))

# Vehicle battery pack envelope — metres
W = 1.8
D = 1.2
H = 0.15

MO = fl.make_module_dict([
    "structure_containment",
    "energy_storage_source",
    "environmental_interface",
    "mass_fluid_transport_process",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "power_distribution",
    "maintenance_serviceability",
])

MAT = fl.make_default_palette()
MAT["tray_alu"] = fl.make_mat("m_pack_tray_aluminium", (0.72, 0.76, 0.80), metallic=0.65, roughness=0.32)
MAT["lid_clear"] = fl.make_mat("m_pack_lid_translucent", (0.88, 0.93, 1.00), metallic=0.15, roughness=0.25, alpha=0.28)
MAT["seal_black"] = fl.make_mat("m_pack_seal_black", (0.01, 0.015, 0.02), metallic=0.0, roughness=0.72)
MAT["module_blue"] = fl.make_mat("m_module_saturated_blue", (0.00, 0.16, 1.00), metallic=0.0, roughness=0.42)
MAT["cell_pouch"] = fl.make_mat("m_cell_pouch_violet", (0.22, 0.04, 0.95), metallic=0.05, roughness=0.48)
MAT["cell_tab"] = fl.make_mat("m_cell_tab_copper", (1.00, 0.48, 0.00), metallic=0.25, roughness=0.34)
MAT["coolant"] = fl.make_mat("m_coolant_cyan", (0.00, 0.95, 1.00), metallic=0.05, roughness=0.32)
MAT["coolant_dark"] = fl.make_mat("m_coolant_dark_teal", (0.00, 0.45, 0.75), metallic=0.15, roughness=0.36)
MAT["hv_orange"] = fl.make_mat("m_hv_orange", (1.00, 0.28, 0.00), metallic=0.05, roughness=0.42)
MAT["hv_yellow"] = fl.make_mat("m_hv_yellow", (1.00, 0.74, 0.00), metallic=0.0, roughness=0.46)
MAT["bms_green"] = fl.make_mat("m_bms_green", (0.00, 0.92, 0.18), metallic=0.0, roughness=0.48)
MAT["sensor_lime"] = fl.make_mat("m_sensor_lime", (0.35, 1.00, 0.00), metallic=0.0, roughness=0.45)
MAT["service_magenta"] = fl.make_mat("m_service_magenta", (1.00, 0.00, 0.70), metallic=0.0, roughness=0.45)
MAT["mica"] = fl.make_mat("m_mica_barrier", (1.00, 0.18, 0.08), metallic=0.0, roughness=0.58)
MAT["rubber"] = fl.make_mat("m_rubber_black", (0.02, 0.025, 0.03), metallic=0.0, roughness=0.82)


# ═══════ Module 1 — structure_containment: tray, rails, lid, crash beams ═══════
fl.add_box("sc_bottom_tray_pan", (W/2, 0, 0.010), (W, D, 0.020), MAT["tray_alu"], "structure_containment", MO)
fl.add_box("sc_translucent_bolted_lid", (W/2, 0, H + 0.010), (W - 0.035, D - 0.035, 0.018), MAT["lid_clear"], "structure_containment", MO)
fl.add_box("sc_left_side_crash_rail", (W/2, -D/2 + 0.018, H/2), (W, 0.036, H), MAT["tray_alu"], "structure_containment", MO)
fl.add_box("sc_right_side_crash_rail", (W/2, D/2 - 0.018, H/2), (W, 0.036, H), MAT["tray_alu"], "structure_containment", MO)
fl.add_box("sc_front_crash_rail", (0.018, 0, H/2), (0.036, D, H), MAT["tray_alu"], "structure_containment", MO)
fl.add_box("sc_rear_crash_rail", (W - 0.018, 0, H/2), (0.036, D, H), MAT["tray_alu"], "structure_containment", MO)

for i, x in enumerate([0.58, 1.22]):
    fl.add_box(f"sc_crossmember_x_{i + 1}", (x, 0, H/2), (0.038, D - 0.12, H - 0.018), MAT["tray_alu"], "structure_containment", MO)

for i, y in enumerate([-0.30, 0.00, 0.30]):
    fl.add_box(f"sc_longitudinal_spine_{i + 1}", (W/2, y, H/2), (W - 0.20, 0.024, H - 0.024), MAT["tray_alu"], "structure_containment", MO)

for i, (x, y) in enumerate([(0.11, -0.49), (0.11, 0.49), (1.69, -0.49), (1.69, 0.49)]):
    fl.add_box(f"sc_corner_crush_box_{i + 1}", (x, y, H/2), (0.16, 0.14, H - 0.016), MAT["tray_alu"], "structure_containment", MO)

fl.add_box("sc_front_gasket_bead", (W/2, -D/2 + 0.052, H + 0.025), (W - 0.12, 0.014, 0.010), MAT["seal_black"], "structure_containment", MO)
fl.add_box("sc_rear_gasket_bead", (W/2, D/2 - 0.052, H + 0.025), (W - 0.12, 0.014, 0.010), MAT["seal_black"], "structure_containment", MO)
fl.add_box("sc_left_gasket_bead", (0.052, 0, H + 0.025), (0.014, D - 0.12, 0.010), MAT["seal_black"], "structure_containment", MO)
fl.add_box("sc_right_gasket_bead", (W - 0.052, 0, H + 0.025), (0.014, D - 0.12, 0.010), MAT["seal_black"], "structure_containment", MO)

bolt_positions = []
for x in [0.18, 0.42, 0.66, 0.90, 1.14, 1.38, 1.62]:
    bolt_positions.append((x, -D/2 + 0.070))
    bolt_positions.append((x, D/2 - 0.070))
for y in [-0.42, -0.21, 0.00, 0.21, 0.42]:
    bolt_positions.append((0.070, y))
    bolt_positions.append((W - 0.070, y))

for i, (x, y) in enumerate(bolt_positions):
    fl.add_cyl(f"sc_lid_bolt_{i + 1:02d}", (x, y, H + 0.030), 0.011, 0.010, MAT["stainless"], "structure_containment", MO)


# ═══════ Module 4 — energy_storage_source: 12 battery modules, cells, tabs ═══════
module_x = [0.36, 0.90, 1.44]
module_y = [-0.405, -0.135, 0.135, 0.405]
MOD_W = 0.405
MOD_D = 0.225
MOD_H = 0.082

for r, y in enumerate(module_y):
    for c, x in enumerate(module_x):
        idx = r * 3 + c + 1
        fl.add_box(f"ess_module_{idx:02d}_frame", (x, y, 0.070), (MOD_W, MOD_D, MOD_H), MAT["module_blue"], "energy_storage_source", MO)
        for cell_i in range(3):
            cx = x - 0.118 + cell_i * 0.118
            fl.add_box(f"ess_module_{idx:02d}_pouch_{cell_i + 1}", (cx, y, 0.076),
                       (0.092, MOD_D - 0.045, MOD_H - 0.022), MAT["cell_pouch"], "energy_storage_source", MO)
        fl.add_box(f"ess_module_{idx:02d}_cell_tabs", (x + MOD_W/2 - 0.026, y, 0.104),
                   (0.018, MOD_D - 0.052, 0.012), MAT["cell_tab"], "energy_storage_source", MO)


# ═══════ Module 2 — environmental_interface: splash, breather, drain, venting ═══════
fl.add_box("env_underbody_aero_splash_shield", (W/2, 0, -0.012), (W - 0.10, D - 0.10, 0.010), MAT["aluminium"], "environmental_interface", MO)
fl.add_box("env_rock_strike_plate_front", (0.30, 0, -0.004), (0.36, D - 0.16, 0.018), MAT["heatsink"], "environmental_interface", MO)
fl.add_box("env_desiccant_breather_body", (1.62, -D/2 - 0.030, 0.108), (0.090, 0.035, 0.045), MAT["thermal"], "environmental_interface", MO)
fl.add_cyl("env_pressure_equalization_membrane", (1.62, -D/2 - 0.052, 0.108), 0.022, 0.010, MAT["sensor"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("env_condensate_drain_port_L", (0.72, D/2 + 0.020, 0.030), 0.014, 0.030, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("env_condensate_drain_port_R", (1.08, D/2 + 0.020, 0.030), 0.014, 0.030, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module 10 — mass_fluid_transport_process: plates, manifolds, quick connects ═══════
for r, y in enumerate(module_y):
    for c, x in enumerate(module_x):
        idx = r * 3 + c + 1
        fl.add_box(f"mft_coldplate_{idx:02d}", (x, y, 0.031), (MOD_W - 0.040, MOD_D - 0.035, 0.010), MAT["coolant_dark"], "mass_fluid_transport_process", MO)
        fl.add_box(f"mft_serpentine_{idx:02d}", (x, y, 0.039), (MOD_W - 0.095, 0.018, 0.012), MAT["coolant"], "mass_fluid_transport_process", MO)

fl.add_box("mft_supply_manifold_side", (W/2, -D/2 + 0.090, 0.118), (W - 0.28, 0.030, 0.025), MAT["coolant"], "mass_fluid_transport_process", MO)
fl.add_box("mft_return_manifold_side", (W/2, D/2 - 0.090, 0.118), (W - 0.28, 0.030, 0.025), MAT["coolant"], "mass_fluid_transport_process", MO)
fl.add_box("mft_front_crossover_pipe", (0.215, 0, 0.116), (0.030, D - 0.24, 0.022), MAT["coolant"], "mass_fluid_transport_process", MO)
fl.add_box("mft_rear_crossover_pipe", (1.585, 0, 0.116), (0.030, D - 0.24, 0.022), MAT["coolant"], "mass_fluid_transport_process", MO)
fl.add_cyl("mft_coolant_in_quick_connect", (0.52, -D/2 - 0.038, 0.115), 0.020, 0.082, MAT["coolant"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("mft_coolant_out_quick_connect", (0.66, -D/2 - 0.038, 0.115), 0.020, 0.082, MAT["coolant_dark"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))


# ═══════ Module 8 — control_compute_communication: BMS, slaves, LV comms ═══════
fl.add_box("ctrl_bms_master_pcb", (0.125, 0.130, 0.118), (0.120, 0.145, 0.014), MAT["bms_green"], "control_compute_communication", MO)
fl.add_box("ctrl_gateway_ecu", (0.125, -0.130, 0.105), (0.105, 0.105, 0.045), MAT["control"], "control_compute_communication", MO)
fl.add_box("ctrl_low_voltage_connector", (0.020, 0.295, 0.106), (0.040, 0.100, 0.040), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("ctrl_can_lin_harness_spine", (W/2, 0.018, 0.132), (W - 0.38, 0.012, 0.010), MAT["control"], "control_compute_communication", MO)

for i, y in enumerate(module_y):
    fl.add_box(f"ctrl_row_slave_board_{i + 1}", (1.665, y, 0.112), (0.095, 0.120, 0.014), MAT["bms_green"], "control_compute_communication", MO)

for i, x in enumerate(module_x):
    fl.add_box(f"ctrl_column_comm_drop_{i + 1}", (x, 0.018, 0.125), (0.012, D - 0.40, 0.008), MAT["control"], "control_compute_communication", MO)


# ═══════ Module 9 — safety_protection: service disconnect, fuses, vents, barriers ═══════
fl.add_box("safe_orange_service_disconnect_plug", (0.125, 0.000, 0.150), (0.100, 0.145, 0.030), MAT["hv_orange"], "safety_protection", MO)
fl.add_box("safe_pyro_disconnect", (0.235, -0.205, 0.106), (0.070, 0.115, 0.045), MAT["safety"], "safety_protection", MO)
fl.add_box("safe_main_fuse_block", (0.235, 0.205, 0.106), (0.070, 0.115, 0.045), MAT["safety"], "safety_protection", MO)
fl.add_box("safe_hvil_loop_guard", (0.305, 0.000, 0.130), (0.040, 0.360, 0.016), MAT["safety"], "safety_protection", MO)

for i, y in enumerate([-0.405, -0.135, 0.135, 0.405]):
    fl.add_box(f"safe_mica_fire_barrier_row_{i + 1}", (0.63, y, 0.123), (0.020, 0.230, 0.050), MAT["mica"], "safety_protection", MO)
    fl.add_box(f"safe_pressure_relief_vent_{i + 1}", (1.48, y, H + 0.024), (0.105, 0.055, 0.010), MAT["safety"], "safety_protection", MO)

fl.add_cyl("safe_pack_isolation_post_neg", (0.275, -0.315, 0.125), 0.018, 0.035, MAT["safety"], "safety_protection", MO)
fl.add_cyl("safe_pack_isolation_post_pos", (0.275, 0.315, 0.125), 0.018, 0.035, MAT["safety"], "safety_protection", MO)


# ═══════ Module 7 — sensing_instrumentation: temperature, current, leak, pressure ═══════
for i, x in enumerate([0.36, 0.90, 1.44]):
    for j, y in enumerate([-0.405, 0.405]):
        fl.add_box(f"sens_temp_probe_{i + 1}_{j + 1}", (x - 0.155, y, 0.124), (0.032, 0.026, 0.014), MAT["sensor_lime"], "sensing_instrumentation", MO)

for i, y in enumerate([-0.405, -0.135, 0.135, 0.405]):
    fl.add_box(f"sens_voltage_tap_row_{i + 1}", (1.620, y, 0.132), (0.040, 0.100, 0.012), MAT["sensor"], "sensing_instrumentation", MO)

fl.add_torus("sens_hv_current_sensor_torus", (0.345, -0.115, 0.127), 0.036, 0.006, MAT["sensor_lime"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_box("sens_leak_detection_strip", (W/2, D/2 - 0.055, 0.026), (W - 0.30, 0.012, 0.008), MAT["sensor_lime"], "sensing_instrumentation", MO)
fl.add_box("sens_coolant_pressure_sensor", (0.585, -D/2 + 0.090, 0.143), (0.045, 0.030, 0.025), MAT["sensor_lime"], "sensing_instrumentation", MO)
fl.add_box("sens_pack_imu_crash_sensor", (1.690, 0.000, 0.118), (0.050, 0.050, 0.026), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module 6 — power_distribution: HVJB, busbars, contactors, connectors ═══════
fl.add_box("pdist_hv_junction_box", (0.135, 0, 0.082), (0.190, 0.520, 0.105), MAT["powerdist"], "power_distribution", MO)
fl.add_box("pdist_positive_contactor", (0.155, -0.105, 0.112), (0.075, 0.080, 0.040), MAT["hv_orange"], "power_distribution", MO)
fl.add_box("pdist_negative_contactor", (0.155, 0.105, 0.112), (0.075, 0.080, 0.040), MAT["hv_orange"], "power_distribution", MO)
fl.add_box("pdist_pos_busbar_spine", (W/2, -0.045, 0.137), (W - 0.46, 0.020, 0.012), MAT["copper"], "power_distribution", MO)
fl.add_box("pdist_neg_busbar_spine", (W/2, 0.045, 0.137), (W - 0.46, 0.020, 0.012), MAT["copper"], "power_distribution", MO)
fl.add_box("pdist_module_interconnect_front", (0.90, -0.270, 0.131), (1.10, 0.014, 0.010), MAT["copper"], "power_distribution", MO)
fl.add_box("pdist_module_interconnect_rear", (0.90, 0.270, 0.131), (1.10, 0.014, 0.010), MAT["copper"], "power_distribution", MO)
fl.add_cyl("pdist_hv_connector_pos", (-0.020, -0.105, 0.096), 0.026, 0.070, MAT["hv_orange"], "power_distribution", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("pdist_hv_connector_neg", (-0.020, 0.105, 0.096), 0.026, 0.070, MAT["hv_yellow"], "power_distribution", MO, rotation=(0, math.radians(90), 0))
fl.add_box("pdist_chassis_ground_braid", (W/2, D/2 - 0.040, 0.040), (W - 0.18, 0.012, 0.008), MAT["copper"], "power_distribution", MO)


# ═══════ Module 11 — maintenance_serviceability: handles, access marks, labels ═══════
fl.add_box("maint_service_access_label", (0.125, 0.000, H + 0.042), (0.135, 0.070, 0.006), MAT["service_magenta"], "maintenance_serviceability", MO)
fl.add_box("maint_qr_traceability_plate", (1.605, 0.455, H + 0.038), (0.075, 0.060, 0.006), MAT["service_magenta"], "maintenance_serviceability", MO)
fl.add_box("maint_front_lift_pad_L", (0.205, -0.480, -0.022), (0.115, 0.065, 0.018), MAT["rubber"], "maintenance_serviceability", MO)
fl.add_box("maint_front_lift_pad_R", (0.205, 0.480, -0.022), (0.115, 0.065, 0.018), MAT["rubber"], "maintenance_serviceability", MO)
fl.add_box("maint_rear_lift_pad_L", (1.595, -0.480, -0.022), (0.115, 0.065, 0.018), MAT["rubber"], "maintenance_serviceability", MO)
fl.add_box("maint_rear_lift_pad_R", (1.595, 0.480, -0.022), (0.115, 0.065, 0.018), MAT["rubber"], "maintenance_serviceability", MO)
fl.add_cyl("maint_pull_loop_service_disconnect", (0.125, 0.000, H + 0.070), 0.032, 0.012, MAT["service_magenta"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")