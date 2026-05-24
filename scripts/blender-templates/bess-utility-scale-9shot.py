"""bess-utility-scale-9shot.py — utility-scale BESS installation through the forge_blender_lib pipeline."""
import bpy
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()
POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-bess-utility-scale-9shot")))

W = 15.0
D = 5.0
H = 3.0

MO = fl.make_module_dict([
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "environmental_interface",
    "mass_fluid_transport_process",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
    "hmi_ergonomics",
])

MAT = fl.make_default_palette()
MAT["pad_concrete"] = fl.make_mat("m_pad_concrete", (0.72, 0.74, 0.76), metallic=0.0, roughness=0.85)
MAT["container_white"] = fl.make_mat("m_container_white", (0.92, 0.94, 0.96), metallic=0.25, roughness=0.48)
MAT["fence_galv"] = fl.make_mat("m_fence_galv", (0.65, 0.70, 0.76), metallic=0.65, roughness=0.35)
MAT["pcs_green"] = fl.make_mat("m_pcs_green", (0.00, 0.72, 0.38), metallic=0.15, roughness=0.45)
MAT["transformer_blue"] = fl.make_mat("m_transformer_blue", (0.02, 0.22, 1.00), metallic=0.25, roughness=0.38)
MAT["oil_orange"] = fl.make_mat("m_oil_orange", (1.00, 0.38, 0.00), metallic=0.10, roughness=0.42)
MAT["mv_purple"] = fl.make_mat("m_mv_purple", (0.72, 0.00, 1.00), metallic=0.05, roughness=0.45)
MAT["porcelain"] = fl.make_mat("m_porcelain", (0.98, 0.86, 0.62), metallic=0.0, roughness=0.32)
MAT["trench_dark"] = fl.make_mat("m_trench_dark", (0.06, 0.07, 0.09), metallic=0.0, roughness=0.7)
MAT["coolant_cyan"] = fl.make_mat("m_coolant_cyan", (0.00, 0.86, 1.00), metallic=0.15, roughness=0.35)
MAT["warning_yellow"] = fl.make_mat("m_warning_yellow", (1.00, 0.72, 0.00), metallic=0.0, roughness=0.45)
MAT["rack_blue"] = fl.make_mat("m_rack_blue", (0.02, 0.14, 1.00), metallic=0.05, roughness=0.45)
MAT["cell_black"] = fl.make_mat("m_cell_black", (0.02, 0.025, 0.04), metallic=0.10, roughness=0.55)
MAT["walkway_magenta"] = fl.make_mat("m_walkway_magenta", (1.00, 0.00, 0.62), metallic=0.20, roughness=0.45)

BAT_XS = [2.6, 7.5, 12.4]
BAT_Y = -0.95
BAT_L = 4.2
BAT_D = 2.15
BAT_H = 2.72
PCS_X = 4.0
PCS_Y = 1.55
TR_X = 8.55
TR_Y = 1.58
RMU_X = 10.65
RMU_Y = 1.55
CTRL_X = 13.1
CTRL_Y = 1.25

# ═══════ Module 1 — structure_containment: pad, container shells, frames, fence ═══════
fl.add_box("sm1_concrete_pad", (W/2, 0, 0.03), (W, D, 0.06), MAT["pad_concrete"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_front_cable_kerb", (W/2, D/2 - 0.10, 0.12), (W - 0.5, 0.12, 0.18), MAT["pad_concrete"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_rear_cable_kerb", (W/2, -D/2 + 0.10, 0.12), (W - 0.5, 0.12, 0.18), MAT["pad_concrete"], module="structure_containment", module_objects=MO)

for idx, x in enumerate(BAT_XS):
    fl.add_box(f"sm1_battery_container_{idx+1}_shell", (x, BAT_Y, BAT_H/2 + 0.08), (BAT_L, BAT_D, BAT_H), MAT["container_white"], module="structure_containment", module_objects=MO)
    fl.add_box(f"sm1_battery_container_{idx+1}_roof_cap", (x, BAT_Y, BAT_H + 0.12), (BAT_L + 0.08, BAT_D + 0.08, 0.08), MAT["enclosure"], module="structure_containment", module_objects=MO)
    fl.add_box(f"sm1_battery_container_{idx+1}_front_frame", (x, BAT_Y + BAT_D/2 + 0.035, 1.42), (BAT_L, 0.07, 2.58), MAT["enclosure"], module="structure_containment", module_objects=MO)
    fl.add_box(f"sm1_battery_container_{idx+1}_left_post", (x - BAT_L/2 + 0.06, BAT_Y, 1.45), (0.08, BAT_D + 0.10, 2.70), MAT["enclosure"], module="structure_containment", module_objects=MO)
    fl.add_box(f"sm1_battery_container_{idx+1}_right_post", (x + BAT_L/2 - 0.06, BAT_Y, 1.45), (0.08, BAT_D + 0.10, 2.70), MAT["enclosure"], module="structure_containment", module_objects=MO)

fl.add_box("sm1_pcs_skid_shell", (PCS_X, PCS_Y, 1.34), (3.6, 1.25, 2.55), MAT["container_white"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_pcs_base_frame", (PCS_X, PCS_Y, 0.16), (3.85, 1.45, 0.20), MAT["enclosure"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_transformer_bund_wall", (TR_X, TR_Y, 0.22), (2.25, 1.55, 0.32), MAT["pad_concrete"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_rmu_cabinet_shell", (RMU_X, RMU_Y, 1.10), (0.95, 0.85, 2.05), MAT["container_white"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_control_cabin_shell", (CTRL_X, CTRL_Y, 1.38), (2.75, 1.85, 2.65), MAT["container_white"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_control_cabin_roof", (CTRL_X, CTRL_Y, 2.76), (2.90, 2.00, 0.12), MAT["enclosure"], module="structure_containment", module_objects=MO)

for i, x in enumerate([0.25, 3.0, 6.0, 9.0, 12.0, 14.75]):
    fl.add_cyl(f"sm1_fence_front_post_{i+1}", (x, D/2 - 0.08, 0.85), 0.035, 1.60, MAT["fence_galv"], module="structure_containment", module_objects=MO)
    fl.add_cyl(f"sm1_fence_rear_post_{i+1}", (x, -D/2 + 0.08, 0.85), 0.035, 1.60, MAT["fence_galv"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_fence_front_top_rail", (W/2, D/2 - 0.08, 1.55), (W - 0.35, 0.035, 0.035), MAT["fence_galv"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_fence_front_mid_rail", (W/2, D/2 - 0.08, 0.85), (W - 0.35, 0.030, 0.030), MAT["fence_galv"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_fence_rear_top_rail", (W/2, -D/2 + 0.08, 1.55), (W - 0.35, 0.035, 0.035), MAT["fence_galv"], module="structure_containment", module_objects=MO)
fl.add_box("sm1_fence_rear_mid_rail", (W/2, -D/2 + 0.08, 0.85), (W - 0.35, 0.030, 0.030), MAT["fence_galv"], module="structure_containment", module_objects=MO)

# ═══════ Module 4 — energy_storage_source: rack strings inside three containers ═══════
for ci, x0 in enumerate(BAT_XS):
    for bay in range(4):
        rx = x0 - 1.45 + bay * 0.95
        fl.add_box(f"sm4_container_{ci+1}_rack_{bay+1}_A", (rx, BAT_Y - 0.40, 1.28), (0.72, 0.36, 2.10), MAT["rack_blue"], module="energy_storage_source", module_objects=MO)
        fl.add_box(f"sm4_container_{ci+1}_rack_{bay+1}_B", (rx, BAT_Y + 0.40, 1.28), (0.72, 0.36, 2.10), MAT["rack_blue"], module="energy_storage_source", module_objects=MO)
        fl.add_box(f"sm4_container_{ci+1}_cell_stack_{bay+1}_A", (rx, BAT_Y - 0.40, 1.28), (0.60, 0.28, 1.78), MAT["cell_black"], module="energy_storage_source", module_objects=MO)
        fl.add_box(f"sm4_container_{ci+1}_cell_stack_{bay+1}_B", (rx, BAT_Y + 0.40, 1.28), (0.60, 0.28, 1.78), MAT["cell_black"], module="energy_storage_source", module_objects=MO)
    fl.add_box(f"sm4_container_{ci+1}_dc_combiner_string", (x0 + 1.72, BAT_Y, 1.45), (0.20, 0.85, 1.60), MAT["battery"], module="energy_storage_source", module_objects=MO)
    fl.add_box(f"sm4_container_{ci+1}_rack_bus_positive", (x0, BAT_Y + 0.73, 2.28), (BAT_L - 0.55, 0.045, 0.06), MAT["copper"], module="energy_storage_source", module_objects=MO)
    fl.add_box(f"sm4_container_{ci+1}_rack_bus_negative", (x0, BAT_Y - 0.73, 2.18), (BAT_L - 0.55, 0.045, 0.06), MAT["copper"], module="energy_storage_source", module_objects=MO)

# ═══════ Module 5 — energy_conversion_transduction: PCS, transformer, filters ═══════
fl.add_box("sm5_pcs_inverter_stack_A", (PCS_X - 1.15, PCS_Y, 1.30), (0.72, 0.95, 2.10), MAT["pcs_green"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("sm5_pcs_inverter_stack_B", (PCS_X - 0.35, PCS_Y, 1.30), (0.72, 0.95, 2.10), MAT["pcs_green"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("sm5_pcs_lcl_filter", (PCS_X + 0.55, PCS_Y, 1.05), (0.72, 0.95, 1.60), MAT["inverter"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("sm5_pcs_aux_transformer", (PCS_X + 1.28, PCS_Y, 0.82), (0.52, 0.86, 1.14), MAT["transformer_blue"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("sm5_mv_transformer_tank", (TR_X, TR_Y, 1.08), (1.85, 1.10, 1.62), MAT["transformer_blue"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("sm5_transformer_radiator_L", (TR_X, TR_Y - 0.65, 1.18), (1.65, 0.10, 1.25), MAT["heatsink"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("sm5_transformer_radiator_R", (TR_X, TR_Y + 0.65, 1.18), (1.65, 0.10, 1.25), MAT["heatsink"], module="energy_conversion_transduction", module_objects=MO)
for i in range(3):
    fl.add_cyl(f"sm5_transformer_bushing_{i+1}", (TR_X - 0.55 + i * 0.55, TR_Y, 2.05), 0.065, 0.48, MAT["porcelain"], module="energy_conversion_transduction", module_objects=MO)
fl.add_cyl("sm5_transformer_oil_conservator", (TR_X, TR_Y - 0.10, 2.34), 0.16, 1.10, MAT["oil_orange"], module="energy_conversion_transduction", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_torus("sm5_transformer_oil_gauge", (TR_X + 0.95, TR_Y, 1.62), 0.12, 0.012, MAT["oil_orange"], module="energy_conversion_transduction", module_objects=MO)

# ═══════ Module 2 — environmental_interface: HVAC, ventilation, weather exposure ═══════
for ci, x in enumerate(BAT_XS):
    fl.add_box(f"sm2_container_{ci+1}_hvac_plenum", (x - 1.45, BAT_Y + BAT_D/2 + 0.16, 2.10), (0.72, 0.26, 0.48), MAT["thermal"], module="environmental_interface", module_objects=MO)
    fl.add_cyl(f"sm2_container_{ci+1}_hvac_fan_A", (x - 1.62, BAT_Y + BAT_D/2 + 0.30, 2.12), 0.11, 0.04, MAT["ctrl_black"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"sm2_container_{ci+1}_hvac_fan_B", (x - 1.28, BAT_Y + BAT_D/2 + 0.30, 2.12), 0.11, 0.04, MAT["ctrl_black"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
    fl.add_box(f"sm2_container_{ci+1}_intake_louvre", (x + 1.42, BAT_Y + BAT_D/2 + 0.08, 1.55), (0.62, 0.05, 0.52), MAT["aluminium"], module="environmental_interface", module_objects=MO)
fl.add_box("sm2_pcs_rooftop_cooling_unit", (PCS_X, PCS_Y, 2.72), (1.60, 1.00, 0.35), MAT["thermal"], module="environmental_interface", module_objects=MO)
fl.add_cyl("sm2_pcs_rooftop_fan_L", (PCS_X - 0.42, PCS_Y, 2.93), 0.18, 0.06, MAT["ctrl_black"], module="environmental_interface", module_objects=MO)
fl.add_cyl("sm2_pcs_rooftop_fan_R", (PCS_X + 0.42, PCS_Y, 2.93), 0.18, 0.06, MAT["ctrl_black"], module="environmental_interface", module_objects=MO)
fl.add_box("sm2_control_cabin_mini_split", (CTRL_X - 0.85, CTRL_Y - 1.02, 1.85), (0.78, 0.18, 0.48), MAT["thermal"], module="environmental_interface", module_objects=MO)
fl.add_box("sm2_rain_hood_controls", (CTRL_X + 0.75, CTRL_Y - 1.02, 2.20), (0.65, 0.24, 0.15), MAT["aluminium"], module="environmental_interface", module_objects=MO)

# ═══════ Module 10 — mass_fluid_transport_process: coolant loops and manifolds ═══════
for ci, x in enumerate(BAT_XS):
    fl.add_box(f"sm10_container_{ci+1}_supply_header", (x, BAT_Y - 0.90, 2.36), (BAT_L - 0.35, 0.055, 0.055), MAT["coolant_cyan"], module="mass_fluid_transport_process", module_objects=MO)
    fl.add_box(f"sm10_container_{ci+1}_return_header", (x, BAT_Y + 0.90, 2.46), (BAT_L - 0.35, 0.055, 0.055), MAT["coolant_cyan"], module="mass_fluid_transport_process", module_objects=MO)
    fl.add_box(f"sm10_container_{ci+1}_glycol_pump", (x + 1.72, BAT_Y - 0.70, 0.62), (0.28, 0.28, 0.46), MAT["coolant_cyan"], module="mass_fluid_transport_process", module_objects=MO)
    fl.add_cyl(f"sm10_container_{ci+1}_expansion_pot", (x + 1.42, BAT_Y - 0.72, 1.02), 0.13, 0.52, MAT["coolant_cyan"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_box("sm10_common_supply_trunk", (W/2, -2.05, 0.24), (W - 2.2, 0.08, 0.08), MAT["coolant_cyan"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_box("sm10_common_return_trunk", (W/2, -1.84, 0.24), (W - 2.2, 0.08, 0.08), MAT["coolant_cyan"], module="mass_fluid_transport_process", module_objects=MO)
fl.add_box("sm10_pcs_condensate_drain", (PCS_X, 2.15, 0.18), (2.2, 0.05, 0.05), MAT["fluid_water"], module="mass_fluid_transport_process", module_objects=MO)

# ═══════ Module 6 — power_distribution: RMU internals, trenches, DC and MV routing ═══════
fl.add_box("sm6_main_dc_trench", (W/2, -0.08, 0.09), (W - 1.0, 0.30, 0.10), MAT["trench_dark"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_mv_trench_to_transformer", (TR_X, 0.80, 0.10), (0.30, 1.85, 0.11), MAT["trench_dark"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_control_fibre_trench", (CTRL_X - 2.15, 0.50, 0.12), (3.90, 0.12, 0.08), MAT["antenna"], module="power_distribution", module_objects=MO)
for ci, x in enumerate(BAT_XS):
    fl.add_box(f"sm6_container_{ci+1}_dc_drop_pos", (x, -0.35, 0.22), (0.07, 1.10, 0.08), MAT["copper"], module="power_distribution", module_objects=MO)
    fl.add_box(f"sm6_container_{ci+1}_dc_drop_neg", (x + 0.18, -0.35, 0.22), (0.07, 1.10, 0.08), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_pcs_dc_input_bus", (PCS_X - 0.45, 0.72, 0.30), (0.12, 1.55, 0.10), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_pcs_ac_output_bus", (PCS_X + 0.90, 0.88, 0.34), (0.14, 1.45, 0.12), MAT["mv_purple"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_rmu_breaker_stack", (RMU_X, RMU_Y, 1.15), (0.55, 0.55, 1.45), MAT["powerdist"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_rmu_cable_terminations", (RMU_X, RMU_Y - 0.12, 0.42), (0.70, 0.24, 0.42), MAT["mv_purple"], module="power_distribution", module_objects=MO)
fl.add_cyl("sm6_site_earth_rod", (0.55, 2.15, 0.45), 0.035, 0.82, MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("sm6_earth_grid_strip", (W/2, 2.15, 0.08), (W - 1.0, 0.035, 0.025), MAT["copper"], module="power_distribution", module_objects=MO)

# ═══════ Module 8 — control_compute_communication: EMS, SCADA, comms ═══════
fl.add_box("sm8_ems_rack", (CTRL_X - 0.72, CTRL_Y, 1.18), (0.46, 0.62, 1.78), MAT["control"], module="control_compute_communication", module_objects=MO)
fl.add_box("sm8_scada_server", (CTRL_X - 0.15, CTRL_Y, 1.10), (0.42, 0.58, 1.45), MAT["pcb"], module="control_compute_communication", module_objects=MO)
fl.add_box("sm8_network_switch", (CTRL_X + 0.42, CTRL_Y - 0.22, 1.82), (0.46, 0.18, 0.12), MAT["ctrl_black"], module="control_compute_communication", module_objects=MO)
fl.add_box("sm8_site_router", (CTRL_X + 0.42, CTRL_Y + 0.20, 1.82), (0.36, 0.20, 0.14), MAT["antenna"], module="control_compute_communication", module_objects=MO)
fl.add_box("sm8_control_ups", (CTRL_X + 0.82, CTRL_Y, 0.62), (0.45, 0.50, 0.88), MAT["ctrl_black"], module="control_compute_communication", module_objects=MO)
fl.add_cyl("sm8_lte_antenna_mast", (CTRL_X + 1.15, CTRL_Y + 0.75, 3.02), 0.025, 1.10, MAT["antenna"], module="control_compute_communication", module_objects=MO)
fl.add_box("sm8_lte_panel_antenna", (CTRL_X + 1.15, CTRL_Y + 0.75, 3.55), (0.10, 0.05, 0.36), MAT["antenna"], module="control_compute_communication", module_objects=MO)
for ci, x in enumerate(BAT_XS):
    fl.add_box(f"sm8_container_{ci+1}_bms_gateway", (x - 1.72, BAT_Y + 0.83, 1.76), (0.22, 0.10, 0.42), MAT["pcb"], module="control_compute_communication", module_objects=MO)

# ═══════ Module 9 — safety_protection: fire suppression, vents, access safety ═══════
for ci, x in enumerate(BAT_XS):
    fl.add_cyl(f"sm9_container_{ci+1}_aerosol_bottle_A", (x - 1.62, BAT_Y - 0.72, 0.78), 0.08, 1.10, MAT["safety"], module="safety_protection", module_objects=MO)
    fl.add_cyl(f"sm9_container_{ci+1}_aerosol_bottle_B", (x + 1.62, BAT_Y - 0.72, 0.78), 0.08, 1.10, MAT["safety"], module="safety_protection", module_objects=MO)
    fl.add_box(f"sm9_container_{ci+1}_deflagration_vent_A", (x - 0.80, BAT_Y, 2.90), (0.64, 0.48, 0.05), MAT["safety"], module="safety_protection", module_objects=MO)
    fl.add_box(f"sm9_container_{ci+1}_deflagration_vent_B", (x + 0.80, BAT_Y, 2.90), (0.64, 0.48, 0.05), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("sm9_pcs_fire_cylinder", (PCS_X + 1.55, PCS_Y - 0.42, 0.86), 0.10, 1.25, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("sm9_site_estop_gate", (0.45, D/2 - 0.18, 1.15), (0.18, 0.08, 0.18), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("sm9_pcs_estop", (PCS_X - 1.75, PCS_Y - 0.66, 1.25), (0.16, 0.06, 0.16), MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_cyl("sm9_control_beacon_red", (CTRL_X - 1.15, CTRL_Y - 0.92, 2.95), 0.055, 0.12, MAT["safety"], module="safety_protection", module_objects=MO)
fl.add_box("sm9_arc_flash_label_rmu", (RMU_X, RMU_Y - 0.44, 1.46), (0.36, 0.025, 0.24), MAT["warning_yellow"], module="safety_protection", module_objects=MO)

# ═══════ Module 7 — sensing_instrumentation: gas, temperature, metering, weather ═══════
for ci, x in enumerate(BAT_XS):
    fl.add_box(f"sm7_container_{ci+1}_temp_sensor_L", (x - 1.20, BAT_Y + 0.98, 2.32), (0.08, 0.04, 0.07), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
    fl.add_box(f"sm7_container_{ci+1}_temp_sensor_R", (x + 1.20, BAT_Y + 0.98, 2.32), (0.08, 0.04, 0.07), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
    fl.add_cyl(f"sm7_container_{ci+1}_h2_sensor", (x, BAT_Y + 0.86, 2.45), 0.055, 0.06, MAT["sensor"], module="sensing_instrumentation", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_torus("sm7_pcs_dc_current_transducer", (PCS_X - 0.45, 0.16, 0.55), 0.13, 0.018, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("sm7_mv_metering_box", (RMU_X + 0.42, RMU_Y - 0.44, 1.82), (0.18, 0.08, 0.30), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("sm7_weather_station_mast", (14.20, -2.05, 1.90), 0.025, 3.20, MAT["stainless"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("sm7_anemometer_head", (14.20, -2.05, 3.55), 0.10, 0.06, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("sm7_pyranometer", (14.02, -2.05, 3.25), (0.16, 0.16, 0.06), MAT["lens"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("sm7_transformer_oil_temp_probe", (TR_X + 0.96, TR_Y + 0.28, 1.55), (0.07, 0.07, 0.20), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)

# ═══════ Module 11 — maintenance_serviceability: doors, lighting, walkways, ladders ═══════
fl.add_box("sm11_front_service_walkway", (W/2, 0.42, 0.13), (W - 1.0, 0.46, 0.06), MAT["walkway_magenta"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("sm11_pcs_service_platform", (PCS_X, 2.28, 0.16), (3.45, 0.34, 0.08), MAT["walkway_magenta"], module="maintenance_serviceability", module_objects=MO)
for ci, x in enumerate(BAT_XS):
    fl.add_box(f"sm11_container_{ci+1}_double_door_L", (x - 0.34, BAT_Y + BAT_D/2 + 0.075, 1.28), (0.56, 0.04, 1.95), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
    fl.add_box(f"sm11_container_{ci+1}_double_door_R", (x + 0.34, BAT_Y + BAT_D/2 + 0.075, 1.28), (0.56, 0.04, 1.95), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
    fl.add_box(f"sm11_container_{ci+1}_door_handle", (x + 0.02, BAT_Y + BAT_D/2 + 0.11, 1.26), (0.05, 0.04, 0.34), MAT["powerdist"], module="maintenance_serviceability", module_objects=MO)
    fl.add_box(f"sm11_container_{ci+1}_led_strip", (x, BAT_Y + BAT_D/2 + 0.10, 2.48), (1.15, 0.04, 0.045), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("sm11_pcs_door_panel", (PCS_X - 1.55, PCS_Y - 0.66, 1.32), (0.52, 0.05, 1.90), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("sm11_control_cabin_door", (CTRL_X - 0.95, CTRL_Y - 0.97, 1.20), (0.58, 0.055, 1.95), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("sm11_transformer_ladder_rail_L", (TR_X + 1.08, TR_Y + 0.48, 0.92), (0.035, 0.035, 1.48), MAT["stainless"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("sm11_transformer_ladder_rail_R", (TR_X + 1.08, TR_Y + 0.68, 0.92), (0.035, 0.035, 1.48), MAT["stainless"], module="maintenance_serviceability", module_objects=MO)
for rung in range(4):
    fl.add_box(f"sm11_transformer_ladder_rung_{rung+1}", (TR_X + 1.08, TR_Y + 0.58, 0.35 + rung * 0.34), (0.04, 0.26, 0.035), MAT["stainless"], module="maintenance_serviceability", module_objects=MO)

# ═══════ Module 3 — hmi_ergonomics: operator panels, indicators, signage ═══════
fl.add_box("sm3_control_hmi_bezel", (CTRL_X - 0.15, CTRL_Y - 0.98, 1.52), (0.52, 0.04, 0.36), MAT["powerdist"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("sm3_control_hmi_screen", (CTRL_X - 0.15, CTRL_Y - 1.01, 1.52), (0.44, 0.035, 0.28), MAT["hmi"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("sm3_pcs_local_hmi", (PCS_X - 1.25, PCS_Y - 0.66, 1.65), (0.30, 0.045, 0.24), MAT["hmi"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("sm3_rmu_mimic_panel", (RMU_X, RMU_Y - 0.44, 1.20), (0.46, 0.035, 0.34), MAT["hmi"], module="hmi_ergonomics", module_objects=MO)
fl.add_cyl("sm3_gate_status_lamp_R", (0.72, D/2 - 0.18, 1.62), 0.045, 0.08, MAT["safety"], module="hmi_ergonomics", module_objects=MO)
fl.add_cyl("sm3_gate_status_lamp_G", (0.86, D/2 - 0.18, 1.62), 0.045, 0.08, MAT["sensor"], module="hmi_ergonomics", module_objects=MO)
fl.add_box("sm3_site_id_sign", (1.55, D/2 - 0.14, 1.22), (0.78, 0.04, 0.36), MAT["warning_yellow"], module="hmi_ergonomics", module_objects=MO)

fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")