"""bioreactor-9shot.py — 200 L single-use bioreactor skid for mAb production.

Source: iter-64-bioreactor-v4. Envelope 1.2 × 1.1 × 2.1 m. Skid-mounted vessel
with single-use bag, magnetic impeller, heating jacket + chilled cooling, HEPA
exhaust, peristaltic pumps, gas MFC rack. 11 modules.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P bioreactor-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-bioreactor-9shot")))

W = 1.20
D = 1.10
H = 2.10
VESSEL_X, VESSEL_Y = W * 0.55, D * 0.50
VESSEL_R = 0.32
VESSEL_BOTTOM = 0.55
VESSEL_TOP = 1.85

MO = fl.make_module_dict([
    "structure_containment", "energy_conversion_transduction",
    "sensing_instrumentation", "control_compute_communication",
    "safety_protection", "environmental_interface",
    "power_distribution", "maintenance_serviceability",
    "actuation_kinematics", "mass_fluid_transport_process",
    "hmi_ergonomics",
])

MAT = fl.make_default_palette()
# Form-factor extensions
MAT["bag"]       = fl.make_mat("m_bag",       (0.92, 0.93, 0.95), metallic=0.0, roughness=0.6, alpha=0.55)
MAT["jacket"]    = fl.make_mat("m_jacket",    (1.00, 0.30, 0.00), metallic=0.1, roughness=0.4)  # heating jacket orange
MAT["chiller"]   = fl.make_mat("m_chiller",   (0.10, 0.40, 0.85), metallic=0.4, roughness=0.4)  # chilled water blue
MAT["gas_mfc"]   = fl.make_mat("m_gas_mfc",   (0.62, 0.05, 0.95), metallic=0.0, roughness=0.5)  # MFC purple


# ═══════ Module — structure_containment (skid frame + vessel shell + door) ══
# Skid base (large flat plinth)
fl.add_box("br1_skid_base", (W/2, D/2, 0.06), (W, D, 0.12), MAT["stainless"], "structure_containment", MO)
# 4 corner posts (skid frame)
for sx, sy in [(0.08, 0.08), (W-0.08, 0.08), (0.08, D-0.08), (W-0.08, D-0.08)]:
    fl.add_box(f"br1_post_{sx:.2f}_{sy:.2f}", (sx, sy, H/2), (0.05, 0.05, H), MAT["stainless"], "structure_containment", MO)
# Top frame (rectangular ring at top)
for spec in [
    ("br1_top_frame_F", (W/2, 0.08, H - 0.05), (W - 0.16, 0.05, 0.05)),
    ("br1_top_frame_B", (W/2, D - 0.08, H - 0.05), (W - 0.16, 0.05, 0.05)),
    ("br1_top_frame_L", (0.08, D/2, H - 0.05), (0.05, D - 0.16, 0.05)),
    ("br1_top_frame_R", (W - 0.08, D/2, H - 0.05), (0.05, D - 0.16, 0.05)),
]:
    fl.add_box(*spec, MAT["stainless"], "structure_containment", MO)
# Vessel cylinder (stainless steel walls)
fl.add_cyl("br1_vessel_wall", (VESSEL_X, VESSEL_Y, (VESSEL_BOTTOM + VESSEL_TOP)/2),
           VESSEL_R, VESSEL_TOP - VESSEL_BOTTOM, MAT["stainless"], "structure_containment", MO)
# Vessel door (front-facing arc panel — simplified as a flat panel at front)
fl.add_box("br1_vessel_door", (VESSEL_X, VESSEL_Y - VESSEL_R - 0.005, (VESSEL_BOTTOM + VESSEL_TOP)/2),
           (VESSEL_R * 1.4, 0.012, VESSEL_TOP - VESSEL_BOTTOM - 0.10), MAT["stainless"], "structure_containment", MO)
fl.add_cyl("br1_door_handle", (VESSEL_X, VESSEL_Y - VESSEL_R - 0.020, 1.20),
           0.012, 0.080, MAT["maint"], "structure_containment", MO,
           rotation=(math.radians(90), 0, 0))
# Motor mount bracket (top of vessel)
fl.add_box("br1_motor_mount", (VESSEL_X, VESSEL_Y, VESSEL_TOP + 0.05),
           (VESSEL_R * 1.6, VESSEL_R * 1.6, 0.04), MAT["stainless"], "structure_containment", MO)
# Single-use bag (inside vessel, mostly translucent — visible through wall)
fl.add_cyl("br1_bag", (VESSEL_X, VESSEL_Y, (VESSEL_BOTTOM + VESSEL_TOP)/2 - 0.05),
           VESSEL_R - 0.02, VESSEL_TOP - VESSEL_BOTTOM - 0.15, MAT["bag"], "structure_containment", MO)


# ═══════ Module — energy_conversion_transduction ════════════════════════════
# Heating jacket (orange band around lower vessel)
fl.add_cyl("br2_heating_jacket", (VESSEL_X, VESSEL_Y, (VESSEL_BOTTOM + VESSEL_TOP)/2 - 0.30),
           VESSEL_R + 0.025, (VESSEL_TOP - VESSEL_BOTTOM) * 0.45, MAT["jacket"], "energy_conversion_transduction", MO)
# Chilled water cooling coil (blue band around upper vessel)
for i in range(6):
    z = (VESSEL_BOTTOM + VESSEL_TOP)/2 + 0.15 + i * 0.060
    fl.add_torus(f"br2_chiller_coil_{i}", (VESSEL_X, VESSEL_Y, z),
                 major_radius=VESSEL_R + 0.030, minor_radius=0.010,
                 material=MAT["chiller"], module="energy_conversion_transduction", module_objects=MO)
# Impeller servomotor (large cylinder on top)
fl.add_cyl("br2_impeller_motor", (VESSEL_X, VESSEL_Y, VESSEL_TOP + 0.25),
           0.12, 0.30, MAT["motor"], "energy_conversion_transduction", MO)
fl.add_cyl("br2_impeller_motor_cap", (VESSEL_X, VESSEL_Y, VESSEL_TOP + 0.42),
           0.12, 0.04, MAT["ctrl_black"], "energy_conversion_transduction", MO)
# 4 peristaltic pump stepper motors (cylinders mounted on rear panel)
for i, py in enumerate([0.20, 0.45, 0.70, 0.95]):
    fl.add_cyl(f"br2_pump_motor_{i}", (W - 0.10, py, 0.80),
               0.05, 0.08, MAT["motor"], "energy_conversion_transduction", MO,
               rotation=(0, math.radians(90), 0))


# ═══════ Module — actuation_kinematics ═══════════════════════════════════════
# Magnetic impeller drive (coupling at vessel base)
fl.add_cyl("br9_mag_drive", (VESSEL_X, VESSEL_Y, VESSEL_BOTTOM - 0.04),
           0.06, 0.08, MAT["motor"], "actuation_kinematics", MO)
# Peristaltic pump heads (4 round pump heads next to their motors)
for i, py in enumerate([0.20, 0.45, 0.70, 0.95]):
    fl.add_cyl(f"br9_pump_head_{i}", (W - 0.18, py, 0.80),
               0.045, 0.04, MAT["maint"], "actuation_kinematics", MO,
               rotation=(0, math.radians(90), 0))
# Pinch valve actuators (4 small cylinders on bag interface manifold)
for i in range(4):
    fl.add_cyl(f"br9_pinch_valve_{i}", (VESSEL_X - VESSEL_R - 0.10 + i * 0.05, VESSEL_Y + VESSEL_R + 0.08, 0.70),
               0.022, 0.05, MAT["control"], "actuation_kinematics", MO)
# Door hinge kinematics (visible hinges)
for hz in [0.80, 1.30, 1.80]:
    fl.add_cyl(f"br9_door_hinge_{hz:.1f}", (VESSEL_X - VESSEL_R - 0.02, VESSEL_Y - VESSEL_R - 0.005, hz),
               0.018, 0.060, MAT["maint"], "actuation_kinematics", MO)


# ═══════ Module — sensing_instrumentation ════════════════════════════════════
# Optical DO + pH transmitters (2 probes inserted through vessel wall)
fl.add_cyl("br4_do_probe", (VESSEL_X - VESSEL_R - 0.04, VESSEL_Y, 1.00),
           0.018, 0.20, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("br4_ph_probe", (VESSEL_X - VESSEL_R - 0.04, VESSEL_Y + 0.10, 1.00),
           0.018, 0.20, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(0, math.radians(90), 0))
# Weigh cell system (4 load cells under vessel base)
for sx, sy in [(VESSEL_X - 0.20, VESSEL_Y - 0.20), (VESSEL_X + 0.20, VESSEL_Y - 0.20),
               (VESSEL_X - 0.20, VESSEL_Y + 0.20), (VESSEL_X + 0.20, VESSEL_Y + 0.20)]:
    fl.add_cyl(f"br4_weigh_cell_{sx:.2f}_{sy:.2f}", (sx, sy, VESSEL_BOTTOM - 0.06),
               0.025, 0.04, MAT["sensor"], "sensing_instrumentation", MO)
# Temperature RTD array (3 probes inserted at different heights)
for i, rz in enumerate([0.75, 1.15, 1.55]):
    fl.add_cyl(f"br4_rtd_{i}", (VESSEL_X + VESSEL_R + 0.04, VESSEL_Y, rz),
               0.012, 0.18, MAT["sensor"], "sensing_instrumentation", MO,
               rotation=(0, math.radians(90), 0))
# Pressure monitoring (gauge on vessel top)
fl.add_cyl("br4_pressure_gauge", (VESSEL_X + 0.12, VESSEL_Y, VESSEL_TOP + 0.08),
           0.040, 0.025, MAT["sensor"], "sensing_instrumentation", MO)
# Bag integrity monitor (small sensor box on rear)
fl.add_box("br4_bag_integrity", (VESSEL_X, VESSEL_Y + VESSEL_R + 0.025, 1.10),
           (0.06, 0.04, 0.06), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module — control_compute_communication ════════════════════════════
# Main PLC controller (mounted in electrical cabinet on left side)
fl.add_box("br5_plc", (0.20, D - 0.15, 1.50),
           (0.18, 0.12, 0.30), MAT["control"], "control_compute_communication", MO)
# Network comm module (separate smaller box with antenna)
fl.add_box("br5_comm", (0.20, D - 0.15, 1.85),
           (0.10, 0.10, 0.10), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("br5_antenna", (0.20, D - 0.15, 1.96),
           0.005, 0.10, MAT["antenna"], "control_compute_communication", MO)
# Data logging module
fl.add_box("br5_data_log", (0.20, D - 0.15, 1.20),
           (0.10, 0.10, 0.20), MAT["control"], "control_compute_communication", MO)
# Motor drive controller (servo drives)
for i, mz in enumerate([0.40, 0.65]):
    fl.add_box(f"br5_motor_drive_{i}", (0.20, D - 0.15, mz),
               (0.14, 0.10, 0.20), MAT["control"], "control_compute_communication", MO)
# Watchdog diagnostics chip
fl.add_box("br5_watchdog", (0.20, D - 0.20, 1.05),
           (0.04, 0.04, 0.04), MAT["control"], "control_compute_communication", MO)


# ═══════ Module — safety_protection ══════════════════════════════════════
# Emergency stop button (red mushroom on front of cabinet)
fl.add_cyl("br6_estop", (0.20, 0.04, 1.50),
           0.040, 0.025, MAT["safety"], "safety_protection", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("br6_estop_collar", (0.20, 0.06, 1.50),
           0.050, 0.012, MAT["maint"], "safety_protection", MO,
           rotation=(math.radians(90), 0, 0))
# Heater overtemp protection (small red device on heating jacket)
fl.add_box("br6_overtemp", (VESSEL_X + VESSEL_R + 0.04, VESSEL_Y - VESSEL_R * 0.6, 0.80),
           (0.04, 0.06, 0.04), MAT["safety"], "safety_protection", MO)
# Overpressure protection (PRV on vessel top)
fl.add_cyl("br6_prv", (VESSEL_X - 0.12, VESSEL_Y, VESSEL_TOP + 0.10),
           0.035, 0.06, MAT["safety"], "safety_protection", MO)
# Interlock safety switches (door interlock — small block on door frame)
for hz in [0.80, 1.50]:
    fl.add_box(f"br6_door_interlock_{hz:.1f}", (VESSEL_X - VESSEL_R + 0.05, VESSEL_Y - VESSEL_R - 0.018, hz),
               (0.025, 0.018, 0.018), MAT["safety"], "safety_protection", MO)


# ═══════ Module — environmental_interface ════════════════════════════════
# Exhaust HEPA filter (top-mounted)
fl.add_cyl("br7_hepa_filter", (VESSEL_X, VESSEL_Y, VESSEL_TOP + 0.65),
           0.14, 0.20, MAT["heatsink"], "environmental_interface", MO)
fl.add_cyl("br7_hepa_outlet", (VESSEL_X, VESSEL_Y, VESSEL_TOP + 0.82),
           0.06, 0.06, MAT["thermal"], "environmental_interface", MO)
# IP54 cabinet seals (gasket strip around electrical cabinet)
fl.add_box("br7_cabinet_seal", (0.20, D - 0.20, 1.05),
           (0.20, 0.005, 1.20), MAT["safety"], "environmental_interface", MO)
# Vibration isolation mounts (rubber pads under skid)
for sx, sy in [(0.10, 0.10), (W-0.10, 0.10), (0.10, D-0.10), (W-0.10, D-0.10)]:
    fl.add_cyl(f"br7_vib_mount_{sx:.2f}_{sy:.2f}", (sx, sy, -0.01),
               0.040, 0.020, MAT["safety"], "environmental_interface", MO)
# Thermal insulation cladding (visible layer around heating jacket)
fl.add_cyl("br7_insulation", (VESSEL_X, VESSEL_Y, (VESSEL_BOTTOM + VESSEL_TOP)/2 - 0.30),
           VESSEL_R + 0.05, (VESSEL_TOP - VESSEL_BOTTOM) * 0.45, MAT["thermal"], "environmental_interface", MO)
# Condensate collection bottle (clear bottle at base, side)
fl.add_cyl("br7_condensate_bottle", (VESSEL_X + VESSEL_R + 0.15, VESSEL_Y + 0.20, 0.30),
           0.06, 0.20, MAT["thermal"], "environmental_interface", MO)


# ═══════ Module — power_distribution ════════════════════════════════════════
# Main electrical cabinet body (left side of skid)
fl.add_box("br8_cabinet", (0.18, D - 0.18, 0.90),
           (0.22, 0.20, 1.40), MAT["powerdist"], "power_distribution", MO)
# AC power routing (3-phase busbars at base of cabinet)
for i, by in enumerate([D - 0.20, D - 0.18, D - 0.16]):
    fl.add_box(f"br8_ac_busbar_{i}", (0.20, by, 0.30),
               (0.18, 0.012, 0.012), MAT["copper"], "power_distribution", MO)
# DC control bus
fl.add_box("br8_dc_bus", (0.20, D - 0.15, 1.40),
           (0.16, 0.020, 0.020), MAT["copper"], "power_distribution", MO)
# Gas distribution manifold (4 gas lines on right side)
fl.add_box("br8_gas_manifold", (W - 0.10, 0.40, 1.20),
           (0.10, 0.40, 0.10), MAT["gas_mfc"], "power_distribution", MO)
# EMC filtering + grounding (strap)
fl.add_box("br8_emc_ground", (0.18, D - 0.04, 0.20),
           (0.10, 0.02, 0.010), MAT["copper"], "power_distribution", MO)
# Facility utilities interface (panel at rear)
fl.add_box("br8_facility_interface", (W/2, D - 0.025, 0.20),
           (0.20, 0.012, 0.16), MAT["powerdist"], "power_distribution", MO)


# ═══════ Module — maintenance_serviceability ════════════════════════════════
# Sampling harvest manifold (set of small ports on front of vessel)
for i in range(3):
    fl.add_cyl(f"br10_sample_port_{i}", (VESSEL_X - 0.10 + i * 0.10, VESSEL_Y - VESSEL_R - 0.025, 0.90),
               0.018, 0.04, MAT["maint"], "maintenance_serviceability", MO,
               rotation=(math.radians(90), 0, 0))
# Calibration access panel (rectangular flap on vessel)
fl.add_box("br10_cal_panel", (VESSEL_X + VESSEL_R + 0.022, VESSEL_Y - 0.10, 1.20),
           (0.012, 0.20, 0.30), MAT["maint"], "maintenance_serviceability", MO)
# Removable bag cradle (visible bracket inside vessel base)
fl.add_box("br10_bag_cradle", (VESSEL_X, VESSEL_Y, VESSEL_BOTTOM + 0.03),
           (VESSEL_R * 1.4, VESSEL_R * 1.4, 0.04), MAT["maint"], "maintenance_serviceability", MO)
# CIP spray ball assembly (cylindrical fitting at top of vessel)
fl.add_cyl("br10_cip_sprayball", (VESSEL_X, VESSEL_Y, VESSEL_TOP - 0.08),
           0.035, 0.06, MAT["maint"], "maintenance_serviceability", MO)


# ═══════ Module — mass_fluid_transport_process ══════════════════════════════
# Gas MFC rack (4 mass flow controllers on right side)
for i in range(4):
    fl.add_box(f"br11_gas_mfc_{i}", (W - 0.20, 0.30 + i * 0.15, 1.40),
               (0.08, 0.10, 0.10), MAT["gas_mfc"], "mass_fluid_transport_process", MO)
# Peristaltic pump heads (already covered in actuation; shared)
# Chilled water valving (3 valves on rear)
for i in range(3):
    fl.add_box(f"br11_chiller_valve_{i}", (W/2 + i * 0.10 - 0.10, D - 0.05, 0.50),
               (0.06, 0.04, 0.06), MAT["chiller"], "mass_fluid_transport_process", MO)
# Sparger manifold (gas distribution tube at vessel base)
fl.add_torus("br11_sparger", (VESSEL_X, VESSEL_Y, VESSEL_BOTTOM + 0.06),
             major_radius=VESSEL_R * 0.6, minor_radius=0.008,
             material=MAT["gas_mfc"], module="mass_fluid_transport_process", module_objects=MO)
# Gas supply lines (4 thin tubes from MFC to sparger)
for i in range(4):
    fl.add_cyl(f"br11_gas_line_{i}", ((W - 0.20 + VESSEL_X)/2, 0.30 + i * 0.15, 1.10),
               0.006, 0.6, MAT["gas_mfc"], "mass_fluid_transport_process", MO,
               rotation=(0, math.radians(90), 0))


# ═══════ Module — hmi_ergonomics ════════════════════════════════════════════
HMI_X, HMI_Y, HMI_Z = 0.20, 0.04, 1.70
# HMI touchscreen panel (on front of cabinet)
fl.add_box("br3_hmi_bezel", (HMI_X, HMI_Y, HMI_Z),
           (0.22, 0.012, 0.16), MAT["enclosure"], "hmi_ergonomics", MO)
fl.add_box("br3_hmi_screen", (HMI_X, HMI_Y - 0.002, HMI_Z),
           (0.18, 0.004, 0.12), MAT["hmi"], "hmi_ergonomics", MO)
# Operator pushbuttons (3 buttons below screen)
for i, c in enumerate([MAT["sensor"], MAT["control"], MAT["safety"]]):
    fl.add_cyl(f"br3_btn_{i}", (HMI_X - 0.06 + i * 0.06, HMI_Y, 1.55),
               0.014, 0.010, c, "hmi_ergonomics", MO,
               rotation=(math.radians(90), 0, 0))
# Status indicator beacon (tower of 3 lights on top of cabinet)
for i, c in enumerate([MAT["safety"], MAT["control"], MAT["sensor"]]):
    fl.add_cyl(f"br3_beacon_{i}", (0.20, D - 0.15, H + 0.05 + i * 0.05),
               0.030, 0.04, c, "hmi_ergonomics", MO)
fl.add_cyl("br3_beacon_base", (0.20, D - 0.15, H + 0.02),
           0.035, 0.02, MAT["powerdist"], "hmi_ergonomics", MO)
# Ergonomic loading handles (2 handles on vessel door)
for hz in [1.00, 1.60]:
    fl.add_torus(f"br3_loading_handle_{hz:.1f}", (VESSEL_X, VESSEL_Y - VESSEL_R - 0.020, hz),
                 major_radius=0.060, minor_radius=0.010,
                 material=MAT["maint"], module="hmi_ergonomics", module_objects=MO,
                 rotation=(0, math.radians(90), 0))


# ─── Lighting + world + render ─────────────────────────────────────────────
fl.add_lights(target_centre=(W/2, D/2, H/2), fill_energy=80, fill_size=2.5)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")
