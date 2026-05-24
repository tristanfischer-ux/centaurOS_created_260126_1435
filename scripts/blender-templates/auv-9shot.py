"""auv-9shot.py — 2-metre-class autonomous underwater vehicle.

Source: iter-64-auv-v4. Envelope 230 × 2100 × 230 mm (torpedo form). 10 modules.

Layout (x = length, y = width, z = vertical):
  Nose      (x  0.0–0.3): titanium nose + INS + DVL
  Forward   (x  0.3–0.7): pressure-tolerant masthead + GPS/Iridium + Wi-Fi
  Mid       (x  0.7–1.4): main pressure cylinder — battery + main computer
  Aft       (x  1.4–1.8): thruster + DC-DC + servos
  Tail cone (x  1.8–2.1): control fins + prop

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P auv-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-auv-9shot")))

L = 2.10
R = 0.115  # hull radius
CY = 0.0   # y-axis centerline of hull
CZ = 0.0   # z-axis centerline of hull

MO = fl.make_module_dict([
    "energy_storage_source", "energy_conversion_transduction",
    "structure_containment", "sensing_instrumentation",
    "control_compute_communication", "safety_protection",
    "environmental_interface", "power_distribution",
    "maintenance_serviceability", "actuation_kinematics",
])

MAT = fl.make_default_palette()
MAT["titanium"]   = fl.make_mat("m_titanium",   (0.65, 0.66, 0.68), metallic=0.7, roughness=0.4)
MAT["foam"]       = fl.make_mat("m_foam",       (0.92, 0.93, 0.95), metallic=0.0, roughness=0.6)
MAT["prop"]       = fl.make_mat("m_prop",       (0.18, 0.20, 0.25), metallic=0.0, roughness=0.6)


# ═══════ structure_containment ═══════════════════════════════════════════
# Forward titanium nose (cone)
fl.add_cyl("auv1_nose", (0.15, CY, CZ), R, 0.30, MAT["titanium"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
# Main pressure cylinder
fl.add_cyl("auv1_main_pressure_hull", (1.05, CY, CZ), R, 1.10, MAT["titanium"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
# Aft tail cone
fl.add_cyl("auv1_tail_cone", (1.95, CY, CZ), R, 0.30, MAT["titanium"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
# Syntactic foam buoyancy (visible band around forward section)
fl.add_cyl("auv1_buoyancy_foam", (0.50, CY, CZ), R + 0.005, 0.30, MAT["foam"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
# Thermal management cold plates (visible plate inside mid section)
fl.add_box("auv1_cold_plate", (1.05, CY, R - 0.025), (0.6, 0.18, 0.005), MAT["heatsink"], "structure_containment", MO)
# EMC grounding bus (copper strap along inner hull)
fl.add_cyl("auv1_emc_ground", (1.05, R - 0.025, 0), 0.004, 0.80, MAT["copper"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
# Internal desiccant system (visible bag)
fl.add_box("auv1_desiccant", (0.80, CY, -R + 0.020), (0.05, 0.04, 0.03), MAT["maint"], "structure_containment", MO)
# Launch recovery skid (handles + lift ring on top of hull)
fl.add_box("auv1_lift_ring_F", (0.30, CY, R + 0.005), (0.06, 0.04, 0.020), MAT["maint"], "structure_containment", MO)
fl.add_box("auv1_lift_ring_R", (1.50, CY, R + 0.005), (0.06, 0.04, 0.020), MAT["maint"], "structure_containment", MO)


# ═══════ sensing_instrumentation ══════════════════════════════════════════
# Inertial navigation system (INS) — gold-coloured precision instrument near nose
fl.add_box("auv4_ins", (0.40, CY, CZ + 0.02), (0.10, 0.10, 0.08), MAT["sensor"], "sensing_instrumentation", MO)
# Doppler velocity log (DVL) — 4-beam transducer cluster on bottom
fl.add_cyl("auv4_dvl_main", (0.20, CY, -R + 0.020), 0.040, 0.030, MAT["sensor"], "sensing_instrumentation", MO)
for i, (dx, dz) in enumerate([(-0.02, -0.02), (0.02, -0.02), (-0.02, 0.02), (0.02, 0.02)]):
    fl.add_cyl(f"auv4_dvl_beam_{i}", (0.20 + dx, CY + dz, -R + 0.005),
               0.010, 0.012, MAT["sensor"], "sensing_instrumentation", MO,
               rotation=(math.radians(20), math.radians(20), 0))
# Pressure depth sensor (small probe on top)
fl.add_cyl("auv4_depth_sensor", (0.30, CY, R + 0.005), 0.012, 0.025, MAT["sensor"], "sensing_instrumentation", MO)
# Leak detection circuit (sensor bar along bottom interior)
fl.add_box("auv4_leak_detect", (1.05, CY, -R + 0.015), (0.80, 0.02, 0.005), MAT["sensor"], "sensing_instrumentation", MO)
# Emergency acoustic pinger
fl.add_cyl("auv4_emergency_pinger", (1.80, CY, R - 0.020), 0.020, 0.030, MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ energy_storage_source ════════════════════════════════════════════
# Lithium cell stack (long rectangular pack inside mid section)
fl.add_box("auv2_lithium_stack", (1.00, CY, CZ - 0.030), (0.80, 0.16, 0.10), MAT["battery"], "energy_storage_source", MO)
# Oil compensation bladder (rubber bladder, soft form)
fl.add_cyl("auv2_oil_bladder", (1.00, CY, -R + 0.025), 0.030, 0.20, MAT["safety"], "energy_storage_source", MO,
           rotation=(0, math.radians(90), 0))
# Battery management system PCB
fl.add_box("auv2_bms", (0.80, CY + 0.06, CZ + 0.020), (0.10, 0.005, 0.060), MAT["pcb"], "energy_storage_source", MO)
# Battery housing (visible aluminium enclosure box around cells)
fl.add_box("auv2_battery_housing", (1.00, CY, CZ - 0.030), (0.82, 0.17, 0.11), MAT["aluminium"], "energy_storage_source", MO)


# ═══════ energy_conversion_transduction ═══════════════════════════════════
# Main thruster motor (in aft section, large cylinder)
fl.add_cyl("auv3_thruster_motor", (1.65, CY, CZ), 0.060, 0.20, MAT["motor"], "energy_conversion_transduction", MO,
           rotation=(0, math.radians(90), 0))
# Acoustic modem transducer (puck on bottom aft)
fl.add_cyl("auv3_acoustic_modem", (1.55, CY, -R + 0.015), 0.030, 0.020, MAT["compressor"], "energy_conversion_transduction", MO)
# Sonar transducer elements (cluster on bottom forward — for survey)
for i in range(3):
    fl.add_cyl(f"auv3_sonar_{i}", (0.55 + i * 0.06, CY, -R + 0.010), 0.018, 0.015, MAT["compressor"], "energy_conversion_transduction", MO)
# DC-DC power conversion
fl.add_box("auv3_dcdc", (1.40, CY - 0.04, CZ + 0.020), (0.10, 0.06, 0.040), MAT["inverter"], "energy_conversion_transduction", MO)


# ═══════ control_compute_communication ════════════════════════════════════
# Main vehicle computer (large box in mid)
fl.add_box("auv5_main_computer", (0.95, CY + 0.04, CZ + 0.040), (0.20, 0.06, 0.060), MAT["control"], "control_compute_communication", MO)
# GPS / Iridium masthead — small antenna sticking out top of forward section
fl.add_cyl("auv5_gps_mast", (0.55, CY, R + 0.080), 0.012, 0.16, MAT["antenna"], "control_compute_communication", MO)
fl.add_sphere("auv5_gps_dome", (0.55, CY, R + 0.18), 0.018, MAT["control"], "control_compute_communication", MO)
# Wi-Fi telemetry module
fl.add_box("auv5_wifi", (0.45, CY + 0.04, CZ + 0.030), (0.04, 0.06, 0.040), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("auv5_wifi_antenna", (0.45, CY + 0.07, CZ + 0.030), 0.003, 0.08, MAT["antenna"], "control_compute_communication", MO)
# Acoustic modem electronics
fl.add_box("auv5_modem_electronics", (1.55, CY + 0.04, CZ + 0.030), (0.10, 0.06, 0.040), MAT["control"], "control_compute_communication", MO)


# ═══════ safety_protection ═══════════════════════════════════════════════
# Emergency drop weight (red weight under hull, jettisonable)
fl.add_box("auv6_drop_weight", (1.30, CY, -R - 0.010), (0.08, 0.06, 0.030), MAT["safety"], "safety_protection", MO)
# Recovery strobe light (on top of tail cone)
fl.add_cyl("auv6_recovery_strobe", (1.85, CY, R + 0.020), 0.020, 0.030, MAT["safety"], "safety_protection", MO)
# VHF recovery beacon (whip antenna on top)
fl.add_cyl("auv6_vhf_antenna", (1.50, CY, R + 0.120), 0.005, 0.20, MAT["safety"], "safety_protection", MO)
# Smoke detector — N/A for AUV (underwater); represented as a tiny chip
fl.add_box("auv6_internal_alarm", (0.95, CY - 0.04, CZ + 0.040), (0.02, 0.02, 0.02), MAT["safety"], "safety_protection", MO)
# Emergency stop switch (magnet-actuated reed switch on external hull)
fl.add_box("auv6_estop", (0.80, CY, R + 0.002), (0.030, 0.030, 0.005), MAT["safety"], "safety_protection", MO)


# ═══════ environmental_interface ═════════════════════════════════════════
# Wet-mate connector set (visible bulkhead connectors on tail cone)
for i in range(3):
    fl.add_cyl(f"auv7_wetmate_{i}", (1.90, CY + 0.04 - i * 0.04, CZ + 0.040),
               0.018, 0.025, MAT["copper"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))
# Dynamic shaft seal (around thruster shaft)
fl.add_torus("auv7_shaft_seal", (1.78, CY, CZ), major_radius=0.030, minor_radius=0.006,
             material=MAT["thermal"], module="environmental_interface", module_objects=MO,
             rotation=(0, math.radians(90), 0))
# Hull O-ring seals (visible bands at hull joints)
for x_joint in [0.30, 1.60]:
    fl.add_torus(f"auv7_oring_{x_joint:.1f}", (x_joint, CY, CZ),
                 major_radius=R + 0.002, minor_radius=0.003,
                 material=MAT["safety"], module="environmental_interface", module_objects=MO,
                 rotation=(0, math.radians(90), 0))
# Thermal management pads
fl.add_box("auv7_thermal_pad", (1.05, CY, R - 0.030), (0.5, 0.10, 0.003), MAT["thermal"], "environmental_interface", MO)


# ═══════ power_distribution ══════════════════════════════════════════════
# Main power distribution board
fl.add_box("auv8_pdb", (1.20, CY, CZ + 0.030), (0.18, 0.10, 0.005), MAT["powerdist"], "power_distribution", MO)
# Payload power harness
fl.add_cyl("auv8_payload_harness", (0.50, CY + 0.06, CZ + 0.010), 0.005, 0.40, MAT["copper"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))
# Thruster power cable
fl.add_cyl("auv8_thruster_cable", (1.40, CY - 0.06, CZ + 0.010), 0.008, 0.30, MAT["copper"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))
# Avionics power harness
fl.add_cyl("auv8_avionics_harness", (1.00, CY + 0.06, CZ + 0.030), 0.005, 0.50, MAT["copper"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))


# ═══════ maintenance_serviceability ══════════════════════════════════════
# Modular payload bay interface (door panel on top of mid section)
fl.add_box("auv10_payload_bay_door", (0.95, CY, R + 0.005), (0.30, 0.18, 0.012), MAT["maint"], "maintenance_serviceability", MO)
# Trim weight system (visible weights on bottom)
for i in range(3):
    fl.add_box(f"auv10_trim_weight_{i}", (0.70 + i * 0.20, CY, -R - 0.005), (0.05, 0.04, 0.015), MAT["maint"], "maintenance_serviceability", MO)
# External charge port (cap on side of mid section)
fl.add_cyl("auv10_charge_port", (0.90, R - 0.005, CZ), 0.025, 0.012, MAT["maint"], "maintenance_serviceability", MO,
           rotation=(math.radians(90), 0, 0))
# Diagnostic interface (small port on tail cone)
fl.add_box("auv10_diag_port", (1.92, CY - 0.04, CZ + 0.040), (0.030, 0.030, 0.005), MAT["maint"], "maintenance_serviceability", MO)


# ═══════ actuation_kinematics ════════════════════════════════════════════
# Propeller (3-blade, at very tail)
PROP_X = 2.05
for i in range(3):
    ang = math.radians(i * 120)
    fl.add_box(f"auv9_prop_blade_{i}", (PROP_X, CY + 0.05 * math.cos(ang), CZ + 0.05 * math.sin(ang)),
               (0.015, 0.10, 0.012), MAT["prop"], "actuation_kinematics", MO,
               rotation=(math.radians(20), 0, ang))
fl.add_cyl("auv9_prop_hub", (PROP_X, CY, CZ), 0.025, 0.030, MAT["rotor_cap"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
# Rudder elevator servos (small motors mounted to fin roots)
for i, (dy, dz) in enumerate([(0, R - 0.005), (0, -R + 0.005), (R - 0.005, 0), (-R + 0.005, 0)]):
    fl.add_cyl(f"auv9_servo_{i}", (1.80, CY + dy, CZ + dz),
               0.018, 0.025, MAT["motor"], "actuation_kinematics", MO)
# Control fins (4 X-pattern around tail)
for i, ang_deg in enumerate([0, 90, 180, 270]):
    ang = math.radians(ang_deg)
    fy = CY + (R + 0.06) * math.cos(ang)
    fz = CZ + (R + 0.06) * math.sin(ang)
    fl.add_box(f"auv9_fin_{i}", (1.86, fy, fz),
               (0.12, 0.020, 0.10), MAT["titanium"], "actuation_kinematics", MO,
               rotation=(ang, 0, 0))
# Aileron spoiler servos (forward, on fins)
for i in range(2):
    fl.add_cyl(f"auv9_aileron_servo_{i}", (1.92, CY + 0.08, CZ + (-0.05 + i * 0.10)),
               0.012, 0.020, MAT["motor"], "actuation_kinematics", MO)


fl.add_lights(target_centre=(L/2, CY, CZ), fill_energy=80, fill_size=2.0)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment", flat_form_factor=True)
