"""distribution-transformer-9shot.py — pad-mounted oil-filled distribution transformer, 11/0.4 kV typical.

Hand-coded ForgeOS Blender template for a 500–2500 kVA sealed steel distribution
transformer. Envelope 1800 × 1500 × 2200 mm. Includes tank, HV cable box,
LV terminal compartment, radiators on two sides, bushings, busbars, tap changer,
pressure relief, gauges, oil fittings, ground bar, lifting lugs, and service
hardware.

Outputs: 1 hero + 3 spatial + per-module pages.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P distribution-transformer-9shot.py
"""
import os
import sys
import math
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-distribution-transformer-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 1.8
D = 1.5
H = 2.2

MODULE_IDS = [
    "structure_containment",
    "energy_conversion_transduction",
    "environmental_interface",
    "power_distribution",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
    "hmi_ergonomics",
    "mass_fluid_transport_process",
]
MO = fl.make_module_dict(MODULE_IDS)

MAT = fl.make_default_palette()
MAT.update({
    "tank_green":     fl.make_mat("m_tx_tank_green",     (0.18, 0.34, 0.24), metallic=0.45, roughness=0.48),
    "cabinet_grey":   fl.make_mat("m_tx_cabinet_grey",   (0.42, 0.46, 0.45), metallic=0.45, roughness=0.52),
    "dark_frame":     fl.make_mat("m_tx_dark_frame",     (0.08, 0.10, 0.09), metallic=0.55, roughness=0.45),
    "core_steel":     fl.make_mat("m_tx_core_steel",     (0.10, 0.16, 0.22), metallic=0.65, roughness=0.35),
    "winding_hv":     fl.make_mat("m_tx_winding_hv",     (0.12, 0.28, 1.00), metallic=0.05, roughness=0.38),
    "winding_lv":     fl.make_mat("m_tx_winding_lv",     (1.00, 0.42, 0.00), metallic=0.15, roughness=0.35),
    "porcelain":      fl.make_mat("m_tx_porcelain",      (0.93, 0.86, 0.68), metallic=0.00, roughness=0.42),
    "rubber":         fl.make_mat("m_tx_rubber",         (0.02, 0.025, 0.03), metallic=0.00, roughness=0.78),
    "oil":            fl.make_mat("m_tx_oil",            (1.00, 0.72, 0.08), metallic=0.00, roughness=0.18, alpha=0.48),
    "radiator":       fl.make_mat("m_tx_radiator",       (0.00, 0.72, 0.92), metallic=0.18, roughness=0.40),
    "gauge_green":    fl.make_mat("m_tx_gauge_green",    (0.00, 0.92, 0.10), metallic=0.00, roughness=0.45),
    "label_white":    fl.make_mat("m_tx_label_white",    (0.96, 0.96, 0.90), metallic=0.00, roughness=0.55),
    "warning_yellow": fl.make_mat("m_tx_warning_yellow", (1.00, 0.78, 0.00), metallic=0.00, roughness=0.45),
})

TANK_W = 1.40
TANK_D = 1.05
TANK_H = 1.65
TANK_X = W / 2
TANK_Y = 0.0
TANK_Z0 = 0.15
TANK_ZC = TANK_Z0 + TANK_H / 2
TANK_Z1 = TANK_Z0 + TANK_H
WALL = 0.035

# ═══════ Module — structure_containment ═══════
fl.add_box("tx_concrete_pad", (W/2, 0, 0.075), (2.15, 1.85, 0.15), MAT["powerdist"], "structure_containment", MO)
fl.add_box("tx_base_skid_L", (W/2, -0.44, 0.19), (1.65, 0.08, 0.08), MAT["dark_frame"], "structure_containment", MO)
fl.add_box("tx_base_skid_R", (W/2, 0.44, 0.19), (1.65, 0.08, 0.08), MAT["dark_frame"], "structure_containment", MO)

fl.add_box("tx_tank_bottom_panel", (TANK_X, TANK_Y, TANK_Z0 + WALL/2), (TANK_W, TANK_D, WALL), MAT["tank_green"], "structure_containment", MO)
fl.add_box("tx_tank_top_panel", (TANK_X, TANK_Y, TANK_Z1 - WALL/2), (TANK_W, TANK_D, WALL), MAT["tank_green"], "structure_containment", MO)
fl.add_box("tx_tank_left_panel", (TANK_X - TANK_W/2 + WALL/2, TANK_Y, TANK_ZC), (WALL, TANK_D, TANK_H), MAT["tank_green"], "structure_containment", MO)
fl.add_box("tx_tank_right_panel", (TANK_X + TANK_W/2 - WALL/2, TANK_Y, TANK_ZC), (WALL, TANK_D, TANK_H), MAT["tank_green"], "structure_containment", MO)
fl.add_box("tx_tank_front_panel", (TANK_X, TANK_Y - TANK_D/2 + WALL/2, TANK_ZC), (TANK_W, WALL, TANK_H), MAT["tank_green"], "structure_containment", MO)
fl.add_box("tx_tank_rear_panel", (TANK_X, TANK_Y + TANK_D/2 - WALL/2, TANK_ZC), (TANK_W, WALL, TANK_H), MAT["tank_green"], "structure_containment", MO)
fl.add_box("tx_raised_top_lid", (TANK_X, TANK_Y, TANK_Z1 + 0.035), (1.50, 1.12, 0.07), MAT["tank_green"], "structure_containment", MO)

for i, (x, y) in enumerate([
    (TANK_X - TANK_W/2 + 0.05, -TANK_D/2 + 0.05),
    (TANK_X + TANK_W/2 - 0.05, -TANK_D/2 + 0.05),
    (TANK_X - TANK_W/2 + 0.05, TANK_D/2 - 0.05),
    (TANK_X + TANK_W/2 - 0.05, TANK_D/2 - 0.05),
]):
    fl.add_box(f"tx_corner_post_{i}", (x, y, TANK_ZC), (0.055, 0.055, TANK_H), MAT["dark_frame"], "structure_containment", MO)

LV_Y = -0.665
fl.add_box("tx_lv_compartment_back", (W/2, -0.535, 0.88), (1.34, 0.035, 0.92), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_compartment_door_L", (0.57, -0.81, 0.88), (0.60, 0.035, 0.86), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_compartment_door_R", (1.23, -0.81, 0.88), (0.60, 0.035, 0.86), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_compartment_top", (W/2, LV_Y, 1.34), (1.38, 0.31, 0.035), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_compartment_bottom", (W/2, LV_Y, 0.42), (1.38, 0.31, 0.035), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_compartment_left", (0.20, LV_Y, 0.88), (0.035, 0.31, 0.92), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_compartment_right", (1.60, LV_Y, 0.88), (0.035, 0.31, 0.92), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_lv_door_centre_overlap", (W/2, -0.835, 0.88), (0.035, 0.025, 0.82), MAT["dark_frame"], "structure_containment", MO)

HV_Y = 0.675
fl.add_box("tx_hv_box_back", (W/2, 0.535, 0.76), (1.18, 0.035, 0.62), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_hv_box_door", (W/2, 0.83, 0.76), (1.18, 0.035, 0.58), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_hv_box_top", (W/2, HV_Y, 1.08), (1.22, 0.34, 0.035), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_hv_box_bottom", (W/2, HV_Y, 0.44), (1.22, 0.34, 0.035), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_hv_box_left", (0.29, HV_Y, 0.76), (0.035, 0.34, 0.62), MAT["cabinet_grey"], "structure_containment", MO)
fl.add_box("tx_hv_box_right", (1.51, HV_Y, 0.76), (0.035, 0.34, 0.62), MAT["cabinet_grey"], "structure_containment", MO)

# ═══════ Module — energy_conversion_transduction ═══════
for i, x in enumerate([0.58, 0.90, 1.22]):
    fl.add_box(f"tx_laminated_core_leg_{i}", (x, 0.03, 0.98), (0.13, 0.32, 1.16), MAT["core_steel"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"tx_lv_winding_{i}", (x, -0.03, 0.98), 0.155, 0.76, MAT["winding_lv"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"tx_hv_winding_{i}", (x, -0.03, 0.98), 0.205, 0.64, MAT["winding_hv"], "energy_conversion_transduction", MO)
fl.add_box("tx_core_top_yoke", (0.90, 0.03, 1.55), (0.86, 0.34, 0.12), MAT["core_steel"], "energy_conversion_transduction", MO)
fl.add_box("tx_core_bottom_yoke", (0.90, 0.03, 0.41), (0.86, 0.34, 0.12), MAT["core_steel"], "energy_conversion_transduction", MO)
fl.add_box("tx_upper_clamp_beam", (0.90, -0.20, 1.47), (0.95, 0.055, 0.075), MAT["stainless"], "energy_conversion_transduction", MO)
fl.add_box("tx_lower_clamp_beam", (0.90, -0.20, 0.49), (0.95, 0.055, 0.075), MAT["stainless"], "energy_conversion_transduction", MO)
for i, x in enumerate([0.42, 0.74, 1.06, 1.38]):
    fl.add_box(f"tx_pressboard_spacer_{i}", (x, -0.31, 0.98), (0.035, 0.055, 0.94), MAT["warning_yellow"], "energy_conversion_transduction", MO)

# ═══════ Module — environmental_interface ═══════
for side, x in [("L", 0.145), ("R", 1.655)]:
    for i in range(12):
        y = -0.43 + i * 0.078
        fl.add_box(f"tx_radiator_fin_{side}_{i}", (x, y, 1.02), (0.12, 0.020, 1.22), MAT["radiator"], "environmental_interface", MO)
    fl.add_cyl(f"tx_radiator_top_header_{side}", (x, 0, 1.66), 0.026, 0.96, MAT["radiator"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"tx_radiator_bottom_header_{side}", (x, 0, 0.38), 0.026, 0.96, MAT["radiator"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
    fl.add_box(f"tx_radiator_guard_top_{side}", (x, 0, 1.70), (0.145, 1.02, 0.025), MAT["dark_frame"], "environmental_interface", MO)
    fl.add_box(f"tx_radiator_guard_bottom_{side}", (x, 0, 0.34), (0.145, 1.02, 0.025), MAT["dark_frame"], "environmental_interface", MO)

fl.add_box("tx_roof_sun_shield", (W/2, 0, 1.94), (1.58, 1.18, 0.025), MAT["radiator"], "environmental_interface", MO)
for i, x in enumerate([0.34, 0.58, 0.82, 1.06, 1.30, 1.54]):
    fl.add_box(f"tx_sun_shield_standoff_{i}", (x, 0.45 if i % 2 else -0.45, 1.87), (0.035, 0.035, 0.12), MAT["dark_frame"], "environmental_interface", MO)
fl.add_box("tx_front_rain_lip", (W/2, -0.84, 1.37), (1.44, 0.055, 0.055), MAT["radiator"], "environmental_interface", MO)
fl.add_box("tx_hv_box_rain_lip", (W/2, 0.86, 1.12), (1.26, 0.055, 0.05), MAT["radiator"], "environmental_interface", MO)

# ═══════ Module — power_distribution ═══════
for i, x in enumerate([0.55, 0.90, 1.25]):
    fl.add_cyl(f"tx_hv_bushing_porcelain_{i}", (x, 0.86, 1.36), 0.055, 0.22, MAT["porcelain"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"tx_hv_bushing_cap_{i}", (x, 0.985, 1.36), 0.035, 0.055, MAT["copper"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"tx_hv_elbow_connector_{i}", (x, 0.96, 0.82), 0.060, 0.24, MAT["rubber"], "power_distribution", MO)
    fl.add_cyl(f"tx_hv_cable_drop_{i}", (x, 0.96, 0.56), 0.026, 0.42, MAT["rubber"], "power_distribution", MO)

for i, z in enumerate([1.08, 0.94, 0.80, 0.66]):
    mat = MAT["copper"] if i < 3 else MAT["aluminium"]
    fl.add_box(f"tx_lv_busbar_{i}", (0.90, -0.845, z), (1.05, 0.035, 0.035), mat, "power_distribution", MO)
    fl.add_box(f"tx_lv_cable_lug_L_{i}", (0.42, -0.89, z), (0.10, 0.050, 0.060), mat, "power_distribution", MO)
    fl.add_box(f"tx_lv_cable_lug_R_{i}", (1.38, -0.89, z), (0.10, 0.050, 0.060), mat, "power_distribution", MO)

fl.add_box("tx_neutral_link", (0.90, -0.89, 0.52), (0.82, 0.030, 0.035), MAT["aluminium"], "power_distribution", MO)
fl.add_box("tx_earth_bar_base", (0.90, -0.82, 0.27), (1.18, 0.030, 0.030), MAT["copper"], "power_distribution", MO)
for i, x in enumerate([0.36, 0.58, 0.80, 1.02, 1.24, 1.46]):
    fl.add_cyl(f"tx_earth_bar_bolt_{i}", (x, -0.84, 0.27), 0.014, 0.012, MAT["stainless"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("tx_internal_delta_link", (0.90, 0.26, 1.32), (0.82, 0.026, 0.026), MAT["copper"], "power_distribution", MO)

# ═══════ Module — safety_protection ═══════
fl.add_cyl("tx_pressure_relief_valve", (0.42, -0.28, 1.985), 0.060, 0.070, MAT["safety"], "safety_protection", MO)
fl.add_cyl("tx_prv_rain_cap", (0.42, -0.28, 2.045), 0.075, 0.020, MAT["warning_yellow"], "safety_protection", MO)
for i, x in enumerate([0.55, 0.90, 1.25]):
    fl.add_cyl(f"tx_surge_arrester_{i}", (x, 0.69, 1.27), 0.035, 0.24, MAT["safety"], "safety_protection", MO)
    fl.add_box(f"tx_arrester_ground_strap_{i}", (x, 0.64, 1.06), (0.018, 0.025, 0.30), MAT["copper"], "safety_protection", MO)
fl.add_box("tx_door_interlock_switch", (0.24, -0.848, 1.18), (0.05, 0.025, 0.05), MAT["safety"], "safety_protection", MO)
fl.add_box("tx_live_warning_placard", (1.36, -0.852, 1.26), (0.20, 0.010, 0.10), MAT["warning_yellow"], "safety_protection", MO)
fl.add_box("tx_arc_flash_label", (0.44, -0.852, 1.26), (0.18, 0.010, 0.09), MAT["safety"], "safety_protection", MO)
fl.add_cyl("tx_tank_earth_bond", (0.28, -0.55, 0.30), 0.012, 0.32, MAT["copper"], "safety_protection", MO, rotation=(0, math.radians(90), 0))

# ═══════ Module — sensing_instrumentation ═══════
fl.add_cyl("tx_pressure_gauge_body", (1.18, -0.50, 1.86), 0.065, 0.030, MAT["stainless"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("tx_pressure_gauge_face", (1.18, -0.535, 1.86), 0.055, 0.010, MAT["gauge_green"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("tx_oil_temp_indicator", (1.38, -0.535, 1.48), 0.060, 0.018, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("tx_oil_level_sight_glass", (0.32, -0.548, 1.42), (0.055, 0.012, 0.28), MAT["gauge_green"], "sensing_instrumentation", MO)
fl.add_box("tx_sight_glass_frame", (0.32, -0.555, 1.42), (0.085, 0.012, 0.32), MAT["stainless"], "sensing_instrumentation", MO)
for i, x in enumerate([0.58, 0.90, 1.22]):
    fl.add_cyl(f"tx_lv_current_sensor_{i}", (x, -0.875, 1.08), 0.032, 0.018, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("tx_buchholz_style_alarm_block", (0.70, 0.18, 1.78), (0.12, 0.07, 0.06), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("tx_top_temperature_probe", (1.35, 0.24, 1.83), 0.016, 0.18, MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ Module — maintenance_serviceability ═══════
for i, x in enumerate([0.34, 1.46]):
    fl.add_torus(f"tx_lifting_lug_{i}", (x, 0.38, 1.90), 0.055, 0.010, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.58, 1.22]):
    fl.add_box(f"tx_lv_door_handle_{i}", (x, -0.855, 0.94), (0.045, 0.020, 0.22), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("tx_lv_padlock_hasp_left", (0.84, -0.858, 0.72), (0.070, 0.018, 0.045), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("tx_lv_padlock_hasp_right", (0.96, -0.858, 0.72), (0.070, 0.018, 0.045), MAT["maint"], "maintenance_serviceability", MO)
fl.add_torus("tx_lv_padlock", (0.90, -0.875, 0.66), 0.040, 0.006, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("tx_hv_door_handle", (1.37, 0.852, 0.78), (0.045, 0.020, 0.18), MAT["maint"], "maintenance_serviceability", MO)
fl.add_torus("tx_hv_padlock", (0.90, 0.870, 0.54), 0.036, 0.006, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("tx_oil_drain_valve", (0.24, -0.46, 0.34), 0.030, 0.070, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("tx_oil_sampling_valve", (0.35, -0.46, 0.48), 0.022, 0.060, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("tx_oil_fill_cap", (1.47, 0.28, 1.89), 0.040, 0.045, MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("tx_removable_nameplate_screws", (1.03, -0.858, 1.20), (0.18, 0.010, 0.035), MAT["maint"], "maintenance_serviceability", MO)

# ═══════ Module — hmi_ergonomics ═══════
fl.add_cyl("tx_tap_changer_dial", (0.90, -0.555, 1.56), 0.105, 0.026, MAT["hmi"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("tx_tap_changer_pointer", (0.90, -0.574, 1.61), (0.022, 0.010, 0.085), MAT["warning_yellow"], "hmi_ergonomics", MO)
fl.add_cyl("tx_tap_changer_handle", (1.03, -0.572, 1.52), 0.020, 0.16, MAT["ctrl_black"], "hmi_ergonomics", MO, rotation=(0, math.radians(90), 0))
fl.add_box("tx_rating_nameplate", (0.90, -0.855, 1.20), (0.32, 0.010, 0.18), MAT["label_white"], "hmi_ergonomics", MO)
fl.add_box("tx_vector_group_label", (0.56, -0.855, 1.06), (0.20, 0.010, 0.08), MAT["label_white"], "hmi_ergonomics", MO)
fl.add_box("tx_phase_label_A", (0.55, -0.890, 1.16), (0.075, 0.006, 0.045), MAT["label_white"], "hmi_ergonomics", MO)
fl.add_box("tx_phase_label_B", (0.90, -0.890, 1.16), (0.075, 0.006, 0.045), MAT["label_white"], "hmi_ergonomics", MO)
fl.add_box("tx_phase_label_C", (1.25, -0.890, 1.16), (0.075, 0.006, 0.045), MAT["label_white"], "hmi_ergonomics", MO)
fl.add_box("tx_operating_instruction_plate", (1.31, -0.855, 0.58), (0.24, 0.010, 0.13), MAT["hmi"], "hmi_ergonomics", MO)

# ═══════ Module — mass_fluid_transport_process ═══════
fl.add_box("tx_main_oil_volume", (TANK_X, 0.02, 1.02), (1.18, 0.82, 1.36), MAT["oil"], "mass_fluid_transport_process", MO)
fl.add_box("tx_upper_oil_headspace", (TANK_X, 0.02, 1.68), (1.08, 0.74, 0.16), MAT["oil"], "mass_fluid_transport_process", MO)
for i, x in enumerate([0.48, 0.90, 1.32]):
    fl.add_box(f"tx_vertical_oil_duct_{i}", (x, -0.33, 1.02), (0.045, 0.040, 1.12), MAT["oil"], "mass_fluid_transport_process", MO)
for side, x in [("L", 0.22), ("R", 1.58)]:
    fl.add_cyl(f"tx_oil_to_radiator_upper_{side}", (x, 0.40, 1.55), 0.022, 0.25, MAT["oil"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"tx_oil_to_radiator_lower_{side}", (x, 0.40, 0.48), 0.022, 0.25, MAT["oil"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("tx_fill_pipe_internal", (1.47, 0.28, 1.78), 0.018, 0.22, MAT["oil"], "mass_fluid_transport_process", MO)
fl.add_cyl("tx_drain_pipe_internal", (0.28, -0.42, 0.35), 0.016, 0.25, MAT["oil"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("tx_oil_sampling_line", (0.38, -0.42, 0.48), (0.18, 0.020, 0.020), MAT["oil"], "mass_fluid_transport_process", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")