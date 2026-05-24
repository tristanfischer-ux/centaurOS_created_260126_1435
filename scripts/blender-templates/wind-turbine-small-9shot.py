"""wind-turbine-small-9shot.py — small horizontal-axis wind turbine, full-fat Blender geometry through forge_blender_lib.

Source class: wind-turbine-small
Typical instance: 10–30 kW grid-tied or off-grid horizontal-axis turbine with
tubular steel tower, fibreglass nacelle, 3-blade rotor, tail vane, nacelle-top
meteorological instruments, base foundation, inverter cabinet, grounding, safety,
controls, and service access features.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P wind-turbine-small-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-wind-turbine-small-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

# Scale: 1 Blender unit = 1 metre.
W = 5.0
D = 5.0
H = 25.0

CX = W / 2
TOWER_X = CX
TOWER_Y = 0.0
TOWER_R = 0.20
PAD_Z = 0.25
TOWER_BASE_Z = 0.55
TOWER_TOP_Z = 20.65
NACELLE_Z = 21.38
HUB_Z = 21.42
HUB_Y = -0.86

MODULE_IDS = [
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "environmental_interface",
    "actuation_kinematics",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
]
MO = fl.make_module_dict(MODULE_IDS)

MAT = fl.make_default_palette()
MAT.update({
    "concrete": fl.make_mat("m_wts_concrete", (0.52, 0.55, 0.62), metallic=0.0, roughness=0.82),
    "tower_blue": fl.make_mat("m_wts_tower_blue", (0.10, 0.62, 1.00), metallic=0.45, roughness=0.38),
    "fiberglass_shell": fl.make_mat("m_wts_fiberglass_shell", (0.88, 0.98, 1.00), metallic=0.0, roughness=0.42),
    "blade_skin": fl.make_mat("m_wts_blade_skin", (0.92, 1.00, 0.96), metallic=0.0, roughness=0.36),
    "blade_tip": fl.make_mat("m_wts_blade_tip", (1.00, 0.08, 0.00), metallic=0.0, roughness=0.42),
    "guy_wire": fl.make_mat("m_wts_guy_wire", (0.03, 0.05, 0.08), metallic=0.75, roughness=0.32),
    "tail_vane": fl.make_mat("m_wts_tail_vane", (1.00, 0.35, 0.00), metallic=0.05, roughness=0.44),
    "gearbox": fl.make_mat("m_wts_gearbox", (0.00, 0.55, 1.00), metallic=0.35, roughness=0.36),
    "yaw_drive": fl.make_mat("m_wts_yaw_drive", (0.00, 0.85, 0.90), metallic=0.15, roughness=0.40),
    "service_yellow": fl.make_mat("m_wts_service_yellow", (1.00, 0.70, 0.00), metallic=0.0, roughness=0.46),
    "weather_orange": fl.make_mat("m_wts_weather_orange", (1.00, 0.20, 0.00), metallic=0.0, roughness=0.50),
    "cabinet_teal": fl.make_mat("m_wts_cabinet_teal", (0.00, 0.72, 0.80), metallic=0.25, roughness=0.48),
    "black_rubber": fl.make_mat("m_wts_black_rubber", (0.01, 0.015, 0.02), metallic=0.0, roughness=0.72),
})

# ═══════ MODULE — structure_containment ══════════════════════════════════
# Concrete foundation, segmented tubular tower, nacelle shell, tail support, guying, and base cabinet shell.
fl.add_box("wt3_concrete_foundation_pad", (CX, 0.0, PAD_Z),
           (3.00, 3.00, 0.50), MAT["concrete"], module="structure_containment", module_objects=MO)
fl.add_cyl("wt3_bolted_tower_plinth", (CX, 0.0, 0.72),
           0.42, 0.36, MAT["concrete"], module="structure_containment", module_objects=MO)
fl.add_cyl("wt3_tower_base_flange", (CX, 0.0, 0.93),
           0.34, 0.10, MAT["tower_blue"], module="structure_containment", module_objects=MO)

for i, z in enumerate([3.00, 8.00, 13.00, 18.00]):
    fl.add_cyl(f"wt3_tubular_tower_section_{i+1}", (CX, 0.0, z),
               TOWER_R, 4.95, MAT["tower_blue"], module="structure_containment", module_objects=MO)

for i, z in enumerate([5.50, 10.50, 15.50, 20.50]):
    fl.add_torus(f"wt3_tower_circumferential_flange_{i+1}", (CX, 0.0, z),
                 0.205, 0.018, MAT["stainless"], module="structure_containment", module_objects=MO)

fl.add_box("wt3_fiberglass_nacelle_shell", (CX, 0.03, NACELLE_Z),
           (1.05, 1.55, 1.10), MAT["fiberglass_shell"], module="structure_containment", module_objects=MO)
fl.add_cyl("wt3_rear_nacelle_cowling", (CX, 0.88, NACELLE_Z - 0.02),
           0.42, 0.36, MAT["fiberglass_shell"], module="structure_containment", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("wt3_front_bearing_shroud", (CX, -0.76, HUB_Z),
           0.33, 0.18, MAT["fiberglass_shell"], module="structure_containment", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("wt3_tail_boom_tube", (CX, 1.47, NACELLE_Z + 0.05),
           0.045, 1.25, MAT["tower_blue"], module="structure_containment", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wt3_tail_vane_panel", (CX, 2.18, NACELLE_Z + 0.10),
           (0.78, 0.055, 0.55), MAT["tail_vane"], module="structure_containment", module_objects=MO)
fl.add_box("wt3_grid_inverter_cabinet_shell", (4.18, -1.30, 1.05),
           (0.62, 0.48, 1.25), MAT["cabinet_teal"], module="structure_containment", module_objects=MO)

GUY_ATTACH_Z = 13.75
GUY_LEN = math.sqrt(2.15 ** 2 + (GUY_ATTACH_Z - 0.42) ** 2)
GUY_ANGLE = math.atan2(2.15, GUY_ATTACH_Z - 0.42)
for name, x, y, rot in [
    ("east", CX + 1.075, 0.0, (0, GUY_ANGLE, 0)),
    ("west", CX - 1.075, 0.0, (0, -GUY_ANGLE, 0)),
    ("north", CX, 1.075, (-GUY_ANGLE, 0, 0)),
    ("south", CX, -1.075, (GUY_ANGLE, 0, 0)),
]:
    fl.add_cyl(f"wt3_guy_wire_{name}", (x, y, (GUY_ATTACH_Z + 0.42) / 2),
               0.010, GUY_LEN, MAT["guy_wire"], module="structure_containment", module_objects=MO,
               rotation=rot)

for name, x, y in [
    ("east", 4.65, 0.0),
    ("west", 0.35, 0.0),
    ("north", CX, 2.15),
    ("south", CX, -2.15),
]:
    fl.add_box(f"wt3_guy_anchor_block_{name}", (x, y, 0.18),
               (0.32, 0.32, 0.24), MAT["concrete"], module="structure_containment", module_objects=MO)

# ═══════ MODULE — energy_storage_source ══════════════════════════════════
# Optional off-grid storage pack in base cabinet with service disconnect and BMS.
for i, z in enumerate([0.68, 0.94, 1.20]):
    fl.add_box(f"wt1_lfp_battery_module_{i+1}", (3.63, -1.30, z),
               (0.34, 0.34, 0.17), MAT["battery"], module="energy_storage_source", module_objects=MO)
    fl.add_box(f"wt1_battery_cell_busbar_{i+1}", (3.83, -1.30, z + 0.04),
               (0.025, 0.30, 0.035), MAT["copper"], module="energy_storage_source", module_objects=MO)

fl.add_box("wt1_battery_bms_board", (3.62, -1.02, 1.34),
           (0.30, 0.045, 0.18), MAT["pcb"], module="energy_storage_source", module_objects=MO)
fl.add_box("wt1_dc_storage_contactor", (3.86, -1.06, 0.72),
           (0.10, 0.08, 0.12), MAT["safety"], module="energy_storage_source", module_objects=MO)
fl.add_cyl("wt1_manual_battery_disconnect_socket", (4.18, -1.56, 1.38),
           0.060, 0.035, MAT["maint"], module="energy_storage_source", module_objects=MO,
           rotation=(math.radians(90), 0, 0))

# ═══════ MODULE — energy_conversion_transduction ═════════════════════════
# Rotor blades, hub, low-speed shaft, gearbox, generator, rectifier, and brake disc.
BLADE_LEN = 2.42
BLADE_CENTER = 1.26
for i, theta_deg in enumerate([0, 120, 240]):
    theta = math.radians(theta_deg)
    x = CX + math.sin(theta) * BLADE_CENTER
    z = HUB_Z + math.cos(theta) * BLADE_CENTER
    tx = CX + math.sin(theta) * (BLADE_LEN - 0.18)
    tz = HUB_Z + math.cos(theta) * (BLADE_LEN - 0.18)
    fl.add_box(f"wt2_fiberglass_blade_main_{i+1}", (x, HUB_Y, z),
               (0.20, 0.070, 2.28), MAT["blade_skin"], module="energy_conversion_transduction", module_objects=MO,
               rotation=(0, theta, 0))
    fl.add_box(f"wt2_swept_red_blade_tip_{i+1}", (tx, HUB_Y, tz),
               (0.13, 0.065, 0.42), MAT["blade_tip"], module="energy_conversion_transduction", module_objects=MO,
               rotation=(0, theta + math.radians(10), 0))

fl.add_cyl("wt2_rotor_hub", (CX, HUB_Y, HUB_Z),
           0.26, 0.26, MAT["rotor_cap"], module="energy_conversion_transduction", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("wt2_spinner_nose_cap", (CX, HUB_Y - 0.18, HUB_Z),
           0.21, 0.20, MAT["rotor_cap"], module="energy_conversion_transduction", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("wt2_low_speed_main_shaft", (CX, -0.43, HUB_Z),
           0.085, 0.82, MAT["stainless"], module="energy_conversion_transduction", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wt2_planetary_gearbox", (CX, -0.12, HUB_Z),
           (0.48, 0.42, 0.42), MAT["gearbox"], module="energy_conversion_transduction", module_objects=MO)
fl.add_cyl("wt2_permanent_magnet_generator", (CX, 0.38, HUB_Z),
           0.28, 0.55, MAT["motor"], module="energy_conversion_transduction", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("wt2_generator_rotor_endbell", (CX, 0.68, HUB_Z),
           0.22, 0.10, MAT["rotor_cap"], module="energy_conversion_transduction", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wt2_rectifier_module_nacelle", (CX + 0.32, 0.18, HUB_Z - 0.33),
           (0.22, 0.28, 0.12), MAT["inverter"], module="energy_conversion_transduction", module_objects=MO)
fl.add_cyl("wt2_mechanical_brake_disc", (CX, -0.62, HUB_Z),
           0.29, 0.025, MAT["stainless"], module="energy_conversion_transduction", module_objects=MO,
           rotation=(math.radians(90), 0, 0))

# ═══════ MODULE — environmental_interface ════════════════════════════════
# Weather sealing, ventilation, cooling fins, cabinet fan, drain, and thermal management.
for i, x in enumerate([2.16, 2.34, 2.66, 2.84]):
    fl.add_box(f"wt7_nacelle_side_louver_left_{i+1}", (x, -0.04, NACELLE_Z + 0.47),
               (0.12, 0.018, 0.035), MAT["weather_orange"], module="environmental_interface", module_objects=MO)

for i, z in enumerate([21.05, 21.18, 21.31, 21.44]):
    fl.add_box(f"wt7_nacelle_exhaust_louver_rear_{i+1}", (CX, 0.99, z),
               (0.42, 0.020, 0.035), MAT["thermal"], module="environmental_interface", module_objects=MO)

for i, x in enumerate([2.22, 2.32, 2.42, 2.58, 2.68, 2.78]):
    fl.add_box(f"wt7_generator_heatsink_fin_{i+1}", (x, 0.38, HUB_Z + 0.34),
               (0.030, 0.38, 0.16), MAT["heatsink"], module="environmental_interface", module_objects=MO)

fl.add_torus("wt7_nacelle_weather_gasket_front", (CX, -0.735, HUB_Z),
             0.35, 0.010, MAT["black_rubber"], module="environmental_interface", module_objects=MO,
             rotation=(math.radians(90), 0, 0))
fl.add_cyl("wt7_cabinet_cooling_fan", (4.18, -1.56, 1.02),
           0.13, 0.030, MAT["thermal"], module="environmental_interface", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wt7_cabinet_louver_bank", (4.18, -1.565, 0.68),
           (0.42, 0.018, 0.22), MAT["weather_orange"], module="environmental_interface", module_objects=MO)
fl.add_cyl("wt7_nacelle_condensate_drain", (CX + 0.39, 0.54, NACELLE_Z - 0.58),
           0.018, 0.12, MAT["thermal"], module="environmental_interface", module_objects=MO)
fl.add_box("wt7_tower_base_drain_slot", (CX, -0.205, 0.78),
           (0.22, 0.012, 0.035), MAT["thermal"], module="environmental_interface", module_objects=MO)

# ═══════ MODULE — actuation_kinematics ═══════════════════════════════════
# Yaw bearing, yaw motor, pinion, blade-root bearings, pitch/furling linkages, and tail hinge.
fl.add_torus("wt10_yaw_slew_bearing", (CX, 0.0, 20.78),
             0.34, 0.030, MAT["yaw_drive"], module="actuation_kinematics", module_objects=MO)
fl.add_cyl("wt10_yaw_drive_motor", (CX + 0.38, -0.04, 20.94),
           0.080, 0.30, MAT["motor"], module="actuation_kinematics", module_objects=MO)
fl.add_cyl("wt10_yaw_pinion_gear", (CX + 0.30, -0.04, 20.74),
           0.070, 0.070, MAT["copper"], module="actuation_kinematics", module_objects=MO)
for i, theta_deg in enumerate([0, 120, 240]):
    theta = math.radians(theta_deg)
    x = CX + math.sin(theta) * 0.30
    z = HUB_Z + math.cos(theta) * 0.30
    fl.add_torus(f"wt10_blade_root_bearing_{i+1}", (x, HUB_Y - 0.02, z),
                 0.095, 0.012, MAT["gimbal"], module="actuation_kinematics", module_objects=MO,
                 rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"wt10_pitch_furl_link_{i+1}", (CX + math.sin(theta) * 0.47, HUB_Y + 0.05, HUB_Z + math.cos(theta) * 0.47),
               0.014, 0.42, MAT["aluminium"], module="actuation_kinematics", module_objects=MO,
               rotation=(0, theta, 0))
fl.add_cyl("wt10_tail_yaw_hinge_pin", (CX, 0.96, NACELLE_Z + 0.04),
           0.055, 0.22, MAT["yaw_drive"], module="actuation_kinematics", module_objects=MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wt10_tail_furling_spring_pack", (CX + 0.28, 1.02, NACELLE_Z - 0.18),
           (0.12, 0.22, 0.10), MAT["gimbal"], module="actuation_kinematics", module_objects=MO)

# ═══════ MODULE — power_distribution ═════════════════════════════════════
# Down-tower cable, nacelle junctions, DC bus, inverter, AC disconnect, and grid conduit.
for i, z in enumerate([4.0, 8.0, 12.0, 16.0]):
    fl.add_cyl(f"wt8_down_tower_power_cable_{i+1}", (CX + 0.16, 0.02, z),
               0.025, 3.60, MAT["copper"], module="power_distribution", module_objects=MO)

fl.add_box("wt8_nacelle_junction_box", (CX - 0.32, 0.42, HUB_Z - 0.25),
           (0.20, 0.22, 0.16), MAT["powerdist"], module="power_distribution", module_objects=MO)
fl.add_box("wt8_slip_ring_bus", (CX - 0.30, 0.02, 20.86),
           (0.16, 0.16, 0.12), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("wt8_grid_tie_inverter_power_stage", (4.18, -1.30, 1.12),
           (0.42, 0.30, 0.34), MAT["inverter"], module="power_distribution", module_objects=MO)
fl.add_box("wt8_ac_disconnect_switchgear", (4.18, -1.30, 0.55),
           (0.38, 0.30, 0.20), MAT["powerdist"], module="power_distribution", module_objects=MO)
fl.add_cyl("wt8_buried_grid_conduit_stub", (3.45, -1.30, 0.20),
           0.045, 1.35, MAT["copper"], module="power_distribution", module_objects=MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("wt8_battery_dc_conduit", (3.84, -1.30, 0.46),
           0.032, 0.58, MAT["copper"], module="power_distribution", module_objects=MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("wt8_cabinet_copper_busbar_positive", (4.39, -1.30, 1.36),
           (0.035, 0.30, 0.040), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("wt8_cabinet_copper_busbar_negative", (3.97, -1.30, 1.36),
           (0.035, 0.30, 0.040), MAT["copper"], module="power_distribution", module_objects=MO)

# ═══════ MODULE — control_compute_communication ══════════════════════════
# Controller, yaw processor, MPPT/rectifier controls, modem, data logger, and telemetry antenna.
fl.add_box("wt5_turbine_main_controller", (4.18, -1.04, 1.36),
           (0.36, 0.055, 0.22), MAT["fc"], module="control_compute_communication", module_objects=MO)
fl.add_box("wt5_mppt_control_board", (4.18, -1.04, 1.03),
           (0.32, 0.050, 0.18), MAT["pcb"], module="control_compute_communication", module_objects=MO)
fl.add_box("wt5_yaw_control_module", (CX + 0.30, -0.28, HUB_Z - 0.18),
           (0.18, 0.16, 0.10), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("wt5_nacelle_data_logger", (CX - 0.28, -0.30, HUB_Z - 0.16),
           (0.16, 0.14, 0.08), MAT["fc"], module="control_compute_communication", module_objects=MO)
fl.add_box("wt5_scada_modem", (4.18, -1.04, 0.78),
           (0.30, 0.050, 0.12), MAT["antenna"], module="control_compute_communication", module_objects=MO)
fl.add_cyl("wt5_telemetry_antenna_mast", (4.46, -1.32, 1.95),
           0.012, 0.88, MAT["antenna"], module="control_compute_communication", module_objects=MO,
           rotation=(math.radians(8), 0, 0))
fl.add_cyl("wt5_nacelle_short_range_antenna", (CX - 0.35, 0.22, NACELLE_Z + 0.75),
           0.010, 0.45, MAT["antenna"], module="control_compute_communication", module_objects=MO,
           rotation=(math.radians(-10), 0, 0))
fl.add_box("wt5_status_gateway_led_bar", (4.18, -1.565, 1.50),
           (0.36, 0.018, 0.040), MAT["hmi"], module="control_compute_communication", module_objects=MO)

# ═══════ MODULE — safety_protection ══════════════════════════════════════
# Brake caliper, lightning protection, grounding, obstruction light, lockout, E-stop, and warnings.
fl.add_box("wt6_brake_caliper", (CX + 0.24, -0.62, HUB_Z - 0.05),
           (0.12, 0.10, 0.22), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_sphere("wt6_red_obstruction_light", (CX, 0.12, NACELLE_Z + 0.72),
              0.075, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("wt6_lightning_air_terminal", (CX + 0.38, 0.28, NACELLE_Z + 1.06),
           0.014, 0.66, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("wt6_external_ground_downconductor", (CX - 0.19, 0.0, 10.5),
           0.014, 19.6, MAT["copper"], module="safety_protection", module_objects=MO)
fl.add_cyl("wt6_ground_rod_at_pad", (1.08, -1.08, 0.16),
           0.020, 0.90, MAT["copper"], module="safety_protection", module_objects=MO,
           rotation=(0, math.radians(18), 0))
fl.add_box("wt6_cabinet_emergency_stop", (4.18, -1.565, 1.25),
           (0.16, 0.026, 0.16), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("wt6_rotor_lockout_pin", (CX - 0.28, -0.78, HUB_Z + 0.02),
           0.030, 0.30, MAT["safety"], module="safety_protection", module_objects=MO,
           rotation=(0, math.radians(90), 0))
for i, z in enumerate([2.30, 3.20, 4.10]):
    fl.add_torus(f"wt6_tower_warning_band_{i+1}", (CX, 0.0, z),
                 0.212, 0.012, MAT["service_yellow"], module="safety_protection", module_objects=MO)

# ═══════ MODULE — sensing_instrumentation ════════════════════════════════
# Anemometer, wind vane, RPM encoder, vibration, temperature, current sensors, and nacelle attitude.
fl.add_cyl("wt4_met_mast", (CX + 0.18, 0.15, NACELLE_Z + 0.86),
           0.018, 0.62, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("wt4_anemometer_crossbar", (CX + 0.18, 0.15, NACELLE_Z + 1.18),
           0.010, 0.42, MAT["sensor"], module="sensing_instrumentation", module_objects=MO,
           rotation=(0, math.radians(90), 0))
for i, dx in enumerate([-0.23, 0.00, 0.23]):
    fl.add_sphere(f"wt4_anemometer_cup_{i+1}", (CX + 0.18 + dx, 0.15, NACELLE_Z + 1.18),
                  0.045, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("wt4_wind_vane_post", (CX - 0.20, 0.12, NACELLE_Z + 0.90),
           0.014, 0.46, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("wt4_wind_vane_arrow", (CX - 0.20, 0.02, NACELLE_Z + 1.14),
           (0.08, 0.38, 0.035), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_torus("wt4_rotor_rpm_encoder_ring", (CX, HUB_Y + 0.12, HUB_Z),
             0.18, 0.008, MAT["sensor"], module="sensing_instrumentation", module_objects=MO,
             rotation=(math.radians(90), 0, 0))
fl.add_box("wt4_nacelle_vibration_sensor", (CX + 0.38, 0.02, NACELLE_Z - 0.38),
           (0.10, 0.08, 0.055), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("wt4_generator_temperature_probe", (CX - 0.18, 0.48, HUB_Z + 0.18),
           (0.08, 0.04, 0.04), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("wt4_output_current_ct", (4.02, -1.30, 0.90),
           0.065, 0.030, MAT["sensor"], module="sensing_instrumentation", module_objects=MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("wt4_tower_base_tilt_sensor", (CX + 0.16, -0.12, 1.18),
           (0.08, 0.06, 0.045), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)

# ═══════ MODULE — maintenance_serviceability ═════════════════════════════
# Access hatches, ladder, platform, grease points, lifting eyes, service labels, and cabinet door.
fl.add_box("wt9_tower_base_access_door", (CX, -0.205, 1.35),
           (0.32, 0.018, 0.72), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("wt9_nacelle_top_service_hatch", (CX, -0.05, NACELLE_Z + 0.56),
           (0.48, 0.42, 0.025), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("wt9_nacelle_side_inspection_hatch", (CX - 0.54, 0.05, NACELLE_Z),
           (0.020, 0.46, 0.34), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("wt9_inverter_cabinet_door_panel", (4.18, -1.565, 1.05),
           (0.50, 0.020, 1.05), MAT["maint"], module="maintenance_serviceability", module_objects=MO)

for side_x, name in [(CX - 0.255, "L"), (CX - 0.155, "R")]:
    fl.add_cyl(f"wt9_ladder_side_rail_{name}", (side_x, -0.24, 5.10),
               0.012, 8.30, MAT["service_yellow"], module="maintenance_serviceability", module_objects=MO)

for i, z in enumerate([1.40, 2.10, 2.80, 3.50, 4.20, 4.90, 5.60, 6.30, 7.00, 7.70, 8.40, 9.10]):
    fl.add_cyl(f"wt9_ladder_rung_{i+1}", (CX - 0.205, -0.24, z),
               0.010, 0.22, MAT["service_yellow"], module="maintenance_serviceability", module_objects=MO,
               rotation=(0, math.radians(90), 0))

fl.add_torus("wt9_service_platform_ring", (CX, 0.0, 19.72),
             0.56, 0.018, MAT["maint"], module="maintenance_serviceability", module_objects=MO)
for i, angle in enumerate([0, 90, 180, 270]):
    a = math.radians(angle)
    fl.add_cyl(f"wt9_platform_support_strut_{i+1}", (CX + math.cos(a) * 0.30, math.sin(a) * 0.30, 19.38),
               0.012, 0.72, MAT["maint"], module="maintenance_serviceability", module_objects=MO,
               rotation=(math.radians(18), 0, a))

for name, x, y in [("front_L", CX - 0.34, -0.45), ("front_R", CX + 0.34, -0.45),
                   ("rear_L", CX - 0.34, 0.52), ("rear_R", CX + 0.34, 0.52)]:
    fl.add_torus(f"wt9_nacelle_lifting_eye_{name}", (x, y, NACELLE_Z + 0.62),
                 0.050, 0.008, MAT["maint"], module="maintenance_serviceability", module_objects=MO)

for i, loc in enumerate([(CX + 0.26, -0.18, HUB_Z + 0.24), (CX - 0.23, 0.02, 20.82), (CX + 0.33, 0.72, HUB_Z)]):
    fl.add_cyl(f"wt9_grease_nipple_{i+1}", loc,
               0.020, 0.045, MAT["maint"], module="maintenance_serviceability", module_objects=MO,
               rotation=(math.radians(90), 0, 0))

fl.add_box("wt9_cabinet_service_label_plate", (4.18, -1.588, 1.62),
           (0.34, 0.012, 0.12), MAT["service_yellow"], module="maintenance_serviceability", module_objects=MO)
fl.add_cyl("wt9_manual_crank_socket", (CX + 0.50, 0.40, NACELLE_Z - 0.18),
           0.045, 0.030, MAT["maint"], module="maintenance_serviceability", module_objects=MO,
           rotation=(0, math.radians(90), 0))

fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")