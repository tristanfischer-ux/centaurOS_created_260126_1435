"""bess-9shot.py — BESS through the forge_blender_lib pipeline.

Replaces the old bess-camera-orbit.py + composite-orbit.py greyscale-desaturate
flow that produced grey backgrounds (Tristan 2026-05-17 flagged 4 times). Uses
the same translucent-enclosure + Freestyle-outline pipeline as the other 9
form factors so all 10 products read consistently.

Geometry inlined from bess-hero-bakeoff.py / bess-camera-orbit.py (same scene).

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P bess-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-bess-9shot")))

# Container geometry constants (same as bess-camera-orbit.py)
L = 12.192
W = 2.438
H = 2.591

DOOR_BAY_X1 = 1.30
BATT_BAY_X0 = 1.40
BATT_BAY_X1 = 9.05
PCS_BAY_X0 = 9.15
PCS_BAY_X1 = 12.05
RACK_COLS = 9
RACK_ROWS = 2
RACK_D = 0.80
RACK_W = 0.60
RACK_H = 2.20

MO = fl.make_module_dict([
    "structure_containment", "energy_storage_source", "energy_conversion_transduction",
    "environmental_interface", "mass_fluid_transport_process", "power_distribution",
    "control_compute_communication", "safety_protection", "sensing_instrumentation",
    "maintenance_serviceability", "hmi_ergonomics",
])

# Use forge_blender_lib default palette (already brand-aligned)
MAT = fl.make_default_palette()
# BESS-specific aliases / additions
MAT["chiller"] = fl.make_mat("m_chiller", (0.95, 0.84, 0.55), metallic=0.4, roughness=0.5)
MAT["cell_dark"] = fl.make_mat("m_cells", (0.10, 0.12, 0.22), metallic=0.1, roughness=0.6)
MAT["pcs"] = fl.make_mat("m_pcs", (0.45, 0.55, 0.68), metallic=0.85, roughness=0.3)
MAT["coolant_orange"] = fl.make_mat("m_coolant_orange", (1.00, 0.45, 0.05), metallic=0.5, roughness=0.4)
MAT["ems_yellow"] = fl.make_mat("m_ems_yellow", (1.00, 0.78, 0.00), metallic=0.0, roughness=0.5)
MAT["floor"] = fl.make_mat("m_floor", (0.78, 0.80, 0.82), metallic=0.0, roughness=0.9)


# ═══════ Module 1 — structure_containment ═══════
fl.add_box("sm1_floor", (L/2, 0, 0.05), (L, W, 0.10), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_roof", (L/2, 0, H - 0.05), (L, W, 0.10), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_back", (L/2, -W/2 + 0.025, H/2), (L, 0.05, H - 0.2), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_endL", (0.025, 0, H/2), (0.05, W, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_endR", (L - 0.025, 0, H/2), (0.05, W, H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_partition_W", (DOOR_BAY_X1 + 0.05, 0, H/2 - 0.05), (0.05, W - 0.10, H - 0.20), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_partition_E", (BATT_BAY_X1 + 0.05, 0, H/2 - 0.05), (0.05, W - 0.10, H - 0.20), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_insulation", (L/2, -W/2 + 0.10, H/2), (L - 0.2, 0.04, H - 0.30), MAT["enclosure"], "structure_containment", MO)
fl.add_box("sm1_rail_back", (L/2, -W/2 + 0.45, 0.12), (L - 0.5, 0.06, 0.04), MAT["powerdist"], "structure_containment", MO)
fl.add_box("sm1_rail_front", (L/2, +W/2 - 0.45, 0.12), (L - 0.5, 0.06, 0.04), MAT["powerdist"], "structure_containment", MO)


# ═══════ Module 4 — energy_storage_source (18 racks 9x2) ═══════
rack_pitch = (BATT_BAY_X1 - BATT_BAY_X0) / RACK_COLS
for cx in range(RACK_COLS):
    x = BATT_BAY_X0 + rack_pitch * (cx + 0.5)
    for ry in range(RACK_ROWS):
        sign = -1 if ry == 0 else 1
        y_centre = sign * (W / 2 - RACK_W / 2 - 0.05)
        z_floor = 0.10
        fl.add_box(f"rack_{cx + 1:02d}_{ry + 1}_frame", (x, y_centre, RACK_H/2 + z_floor),
                   (RACK_D, RACK_W, RACK_H), MAT["battery"], "energy_storage_source", MO)
        fl.add_box(f"rack_{cx + 1:02d}_{ry + 1}_cells", (x, y_centre, RACK_H/2 + z_floor),
                   (RACK_D - 0.12, RACK_W - 0.12, RACK_H - 0.40), MAT["cell_dark"], "energy_storage_source", MO)
        bus_y = y_centre + sign * (RACK_W/2 - 0.04)
        fl.add_box(f"rack_{cx + 1:02d}_{ry + 1}_busbar", (x, bus_y, RACK_H/2 + z_floor),
                   (0.05, 0.04, RACK_H - 0.40), MAT["copper"], "energy_storage_source", MO)
        fl.add_box(f"rack_{cx + 1:02d}_{ry + 1}_coldplate", (x, y_centre, z_floor + 0.08),
                   (RACK_D - 0.10, RACK_W - 0.10, 0.025), MAT["aluminium"], "energy_storage_source", MO)
        fl.add_box(f"rack_{cx + 1:02d}_{ry + 1}_heater", (x, y_centre, z_floor + 0.04),
                   (RACK_D - 0.20, RACK_W - 0.20, 0.015), MAT["safety"], "energy_storage_source", MO)


# ═══════ Module 2 — environmental_interface (external chiller -X end) ═══════
chiller_cx = -1.0
fl.add_box("sm2_compressor", (chiller_cx, 0, 0.7), (1.5, 0.8, 1.4), MAT["chiller"], "environmental_interface", MO)
fl.add_cyl("sm2_fan_shroud_L", (chiller_cx - 0.35, 0, 1.46), 0.22, 0.04, MAT["aluminium"], "environmental_interface", MO)
fl.add_cyl("sm2_fan_shroud_R", (chiller_cx + 0.35, 0, 1.46), 0.22, 0.04, MAT["aluminium"], "environmental_interface", MO)
fl.add_cyl("sm2_fan_hub_L", (chiller_cx - 0.35, 0, 1.49), 0.06, 0.05, MAT["ctrl_black"], "environmental_interface", MO)
fl.add_cyl("sm2_fan_hub_R", (chiller_cx + 0.35, 0, 1.49), 0.06, 0.05, MAT["ctrl_black"], "environmental_interface", MO)
for fan_idx, fx in enumerate([chiller_cx - 0.35, chiller_cx + 0.35]):
    for blade_idx in range(5):
        ang = math.radians(blade_idx * 72)
        fl.add_box(f"sm2_blade_{fan_idx}_{blade_idx}",
                   (fx + 0.10 * math.cos(ang), 0.10 * math.sin(ang), 1.48),
                   (0.16, 0.025, 0.01), MAT["ctrl_black"], "environmental_interface", MO)
for i in range(8):
    fl.add_box(f"sm2_coil_{i + 1}", (chiller_cx, -0.41, 0.20 + i * 0.13),
               (1.42, 0.02, 0.08), MAT["aluminium"], "environmental_interface", MO)
fl.add_box("sm2_air_handler", (chiller_cx + 0.95, 0, 0.40), (0.4, 0.6, 0.7), MAT["aluminium"], "environmental_interface", MO)
# Coolant pump moved here per Phase 1 ontology fix
fl.add_box("sm2_coolant_pump_skid", (0.85, 0, 2.30), (0.4, 0.5, 0.30), MAT["coolant_orange"], "environmental_interface", MO)


# ═══════ Module 5 — energy_conversion_transduction (PCS inside +X bay) ═══════
fl.add_box("sm5_inverter", (PCS_BAY_X0 + 0.5, -0.55, 1.0), (0.85, 0.95, 1.90), MAT["pcs"], "energy_conversion_transduction", MO)
fl.add_box("sm5_ac_filter", (PCS_BAY_X0 + 0.5, +0.55, 0.8), (0.85, 0.95, 1.50), MAT["pcs"], "energy_conversion_transduction", MO)
fl.add_box("sm5_transformer", (PCS_BAY_X1 - 0.5, 0, 0.55), (0.85, 1.80, 1.05), MAT["powerdist"], "energy_conversion_transduction", MO)
fl.add_box("sm5_ctrl_board", (PCS_BAY_X0 + 0.5, -0.55, 2.05), (0.40, 0.30, 0.10), MAT["pcb"], "energy_conversion_transduction", MO)


# ═══════ Module 10 — mass_fluid_transport_process (manifolds + piping) ═══════
fl.add_box("sm10_manifold_in", (BATT_BAY_X0 + 0.05, 0, 2.42), (0.05, W - 0.40, 0.05), MAT["coolant_orange"], "mass_fluid_transport_process", MO)
fl.add_box("sm10_manifold_out", (BATT_BAY_X1 - 0.05, 0, 2.42), (0.05, W - 0.40, 0.05), MAT["coolant_orange"], "mass_fluid_transport_process", MO)
fl.add_box("sm10_pipe_supply", ((BATT_BAY_X0 + BATT_BAY_X1)/2, -0.10, 2.42),
           (BATT_BAY_X1 - BATT_BAY_X0 - 0.2, 0.05, 0.05), MAT["coolant_orange"], "mass_fluid_transport_process", MO)
fl.add_box("sm10_pipe_return", ((BATT_BAY_X0 + BATT_BAY_X1)/2, +0.10, 2.42),
           (BATT_BAY_X1 - BATT_BAY_X0 - 0.2, 0.05, 0.05), MAT["coolant_orange"], "mass_fluid_transport_process", MO)
fl.add_cyl("sm10_exp_tank", (0.65, -0.7, 2.35), 0.10, 0.40, MAT["coolant_orange"], "mass_fluid_transport_process", MO)
fl.add_box("sm10_qs_sensor", (BATT_BAY_X1 - 0.20, 0.7, 2.42), (0.08, 0.06, 0.08), MAT["sensor"], "mass_fluid_transport_process", MO)


# ═══════ Module 6 — power_distribution ═══════
fl.add_box("sm6_dc_bus_neg", ((BATT_BAY_X0 + BATT_BAY_X1)/2, -1.05, 2.10),
           (BATT_BAY_X1 - BATT_BAY_X0, 0.04, 0.06), MAT["copper"], "power_distribution", MO)
fl.add_box("sm6_dc_bus_pos", ((BATT_BAY_X0 + BATT_BAY_X1)/2, +1.05, 2.10),
           (BATT_BAY_X1 - BATT_BAY_X0, 0.04, 0.06), MAT["copper"], "power_distribution", MO)
fl.add_box("sm6_ac_panel", (0.5, -0.85, 1.2), (0.30, 0.30, 1.2), MAT["powerdist"], "power_distribution", MO)
fl.add_box("sm6_cable_transit", (0.25, 0.75, 0.2), (0.10, 0.40, 0.20), MAT["powerdist"], "power_distribution", MO)
fl.add_box("sm6_earth_tape", (L/2, -W/2 + 0.20, 0.06), (L - 0.3, 0.03, 0.005), MAT["copper"], "power_distribution", MO)
fl.add_box("sm6_insulation_mon", (0.5, 0.85, 1.6), (0.20, 0.10, 0.20), MAT["powerdist"], "power_distribution", MO)


# ═══════ Module 8 — control_compute_communication (EMS bay + BMS moved here) ═══════
fl.add_box("sm8_ems", (0.5, 0, 1.80), (0.30, 0.50, 0.30), MAT["ems_yellow"], "control_compute_communication", MO)
fl.add_box("sm8_ems_display", (0.34, 0, 1.85), (0.02, 0.30, 0.16), MAT["ctrl_black"], "control_compute_communication", MO)
for i, c in enumerate([MAT["safety"], MAT["maint"], MAT["sensor"]]):
    fl.add_cyl(f"sm8_ems_led_{i}", (0.34, -0.10 + i * 0.10, 1.72), 0.012, 0.005, c, "control_compute_communication", MO)
fl.add_box("sm8_ems_dinrail", (0.5, 0, 1.65), (0.04, 0.46, 0.025), MAT["aluminium"], "control_compute_communication", MO)
fl.add_box("sm8_scada", (0.5, -0.40, 1.80), (0.20, 0.20, 0.25), MAT["ems_yellow"], "control_compute_communication", MO)
fl.add_box("sm8_switch", (0.5, +0.40, 1.80), (0.30, 0.20, 0.08), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("sm8_ups", (0.5, 0, 0.40), (0.30, 0.40, 0.80), MAT["ctrl_black"], "control_compute_communication", MO)
# BMS master + slave PCBs moved here per Phase 1 ontology fix
for cx in range(RACK_COLS):
    x = BATT_BAY_X0 + rack_pitch * (cx + 0.5)
    for ry in range(RACK_ROWS):
        sign = -1 if ry == 0 else 1
        y_centre = sign * (W/2 - RACK_W/2 - 0.05)
        bms_y = y_centre - sign * (RACK_W/2 - 0.04)
        fl.add_box(f"bms_slave_{cx + 1:02d}_{ry + 1}", (x, bms_y, 1.2 + 0.10),
                   (RACK_D - 0.30, 0.02, 0.6), MAT["pcb"], "control_compute_communication", MO)
        fl.add_box(f"bms_master_{cx + 1:02d}_{ry + 1}", (x, y_centre, RACK_H + 0.10 - 0.10),
                   (0.20, 0.20, 0.10), MAT["ctrl_black"], "control_compute_communication", MO)


# ═══════ Module 9 — safety_protection (fire suppression, e-stop) ═══════
for i in range(4):
    cx = PCS_BAY_X1 - 0.15
    cy_pos = -W/2 + 0.30 + i * 0.45
    fl.add_cyl(f"sm9_cyl_{i + 1}", (cx, cy_pos, 0.70), 0.08, 1.20, MAT["safety"], "safety_protection", MO)
    fl.add_cyl(f"sm9_cyl_{i + 1}_valve", (cx, cy_pos, 1.36), 0.10, 0.06, MAT["ctrl_black"], "safety_protection", MO)
    fl.add_cyl(f"sm9_cyl_{i + 1}_horn", (cx, cy_pos, 1.42), 0.045, 0.04, MAT["aluminium"], "safety_protection", MO)
for i in range(6):
    dx = BATT_BAY_X0 + 0.3 + i * 1.3
    fl.add_cyl(f"sm9_detector_{i + 1}", (dx, -0.5, H - 0.12), 0.05, 0.04, MAT["safety"], "safety_protection", MO)
fl.add_cyl("sm9_estop", (-0.10, -0.40, 1.40), 0.05, 0.03, MAT["safety"], "safety_protection", MO)
fl.add_box("sm9_smoke_relay", (PCS_BAY_X1 - 0.15, +0.40, 2.20), (0.15, 0.10, 0.15), MAT["safety"], "safety_protection", MO)
# Deflagration vents MOVED to structure_containment per Phase 1 ontology fix


# Deflagration vents now in structure_containment (post-ontology-fix)
for i in range(4):
    vx = BATT_BAY_X0 + 0.5 + i * 1.8
    fl.add_box(f"sm1_vent_{i + 1}", (vx, 0.4, H - 0.08), (0.60, 0.50, 0.04), MAT["safety"], "structure_containment", MO)


# ═══════ Module 7 — sensing_instrumentation ═══════
for i in range(12):
    sx = BATT_BAY_X0 + 0.3 + i * 0.65
    fl.add_box(f"sm7_tempsensor_{i + 1}", (sx, W/2 - 0.12, H - 0.20), (0.08, 0.05, 0.05), MAT["sensor"], "sensing_instrumentation", MO)
for i in range(4):
    sx = BATT_BAY_X0 + 0.6 + i * 1.8
    fl.add_cyl(f"sm7_h2_{i + 1}", (sx, 0.6, H - 0.18), 0.05, 0.08, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("sm7_flow_in", (BATT_BAY_X0 + 0.20, -0.10, 2.42), (0.10, 0.06, 0.10), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("sm7_flow_out", (BATT_BAY_X1 - 0.20, +0.10, 2.42), (0.10, 0.06, 0.10), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ Module 11 — maintenance_serviceability ═══════
fl.add_box("sm11_door_panel", (-0.08, 0, 1.0), (0.04, 1.0, 1.6), MAT["enclosure"], "maintenance_serviceability", MO)
fl.add_box("sm11_door_handle", (-0.12, 0.45, 1.0), (0.03, 0.04, 0.20), MAT["powerdist"], "maintenance_serviceability", MO)
for i in range(6):
    lx = BATT_BAY_X0 + 0.5 + i * 1.3
    fl.add_box(f"sm11_led_{i + 1}", (lx, 0, H - 0.06), (1.2, 0.10, 0.03), MAT["maint"], "maintenance_serviceability", MO)


# ═══════ Module 3 — hmi_ergonomics ═══════
fl.add_box("sm3_hmi_bezel", (-0.09, 0, 1.6), (0.02, 0.44, 0.34), MAT["powerdist"], "hmi_ergonomics", MO)
fl.add_box("sm3_hmi_screen", (-0.105, 0, 1.6), (0.02, 0.38, 0.28), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_cyl("sm3_beacon_R", (0.30, 0, H + 0.10), 0.04, 0.10, MAT["safety"], "hmi_ergonomics", MO)
fl.add_cyl("sm3_beacon_Y", (0.30, 0, H + 0.22), 0.04, 0.10, MAT["ems_yellow"], "hmi_ergonomics", MO)
fl.add_cyl("sm3_beacon_G", (0.30, 0, H + 0.34), 0.04, 0.10, MAT["sensor"], "hmi_ergonomics", MO)


fl.add_lights(target_centre=(L/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")
