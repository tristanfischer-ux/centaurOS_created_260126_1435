"""pv-module-residential-9shot.py — residential 350-450 W mono-PERC PV module engineering template."""
import bpy
import os
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-pv-module-residential-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 1.7
D = 1.0
H = 0.04

MO = fl.make_module_dict([
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "environmental_interface",
    "power_distribution",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
])

MAT = fl.make_default_palette()
MAT.update({
    "pv_cell": fl.make_mat("m_pv_cell_mono_blue", (0.00, 0.05, 0.95), metallic=0.0, roughness=0.32),
    "pv_cell_dark": fl.make_mat("m_pv_cell_dark", (0.00, 0.01, 0.18), metallic=0.0, roughness=0.38),
    "glass": fl.make_mat("m_tempered_glass_cyan", (0.00, 0.85, 1.00), metallic=0.0, roughness=0.08, alpha=0.24),
    "eva_white": fl.make_mat("m_eva_backsheet_white", (1.00, 1.00, 1.00), metallic=0.0, roughness=0.45),
    "black_polymer": fl.make_mat("m_black_polymer_sat", (0.00, 0.00, 0.08), metallic=0.0, roughness=0.60),
    "silver_bus": fl.make_mat("m_silver_bus_saturated", (0.78, 0.92, 1.00), metallic=0.6, roughness=0.28),
    "junction_orange": fl.make_mat("m_junction_orange", (1.00, 0.32, 0.00), metallic=0.0, roughness=0.45),
    "warning_red": fl.make_mat("m_warning_red", (1.00, 0.00, 0.00), metallic=0.0, roughness=0.50),
    "sealant": fl.make_mat("m_sealant_teal", (0.00, 0.95, 0.85), metallic=0.0, roughness=0.55),
    "label_yellow": fl.make_mat("m_label_yellow", (1.00, 0.80, 0.00), metallic=0.0, roughness=0.48),
    "rfid_green": fl.make_mat("m_rfid_green", (0.00, 1.00, 0.18), metallic=0.0, roughness=0.45),
})

FRAME_W = 0.035
INNER_W = W - 2 * FRAME_W
INNER_D = D - 2 * FRAME_W
Z_FRONT = H + 0.001

# ═══════ Module — structure_containment ═══════
fl.add_box("pv_frame_long_north", (W / 2, D / 2 - FRAME_W / 2, H / 2), (W, FRAME_W, H), MAT["aluminium"], module="structure_containment", module_objects=MO)
fl.add_box("pv_frame_long_south", (W / 2, -D / 2 + FRAME_W / 2, H / 2), (W, FRAME_W, H), MAT["aluminium"], module="structure_containment", module_objects=MO)
fl.add_box("pv_frame_short_west", (FRAME_W / 2, 0, H / 2), (FRAME_W, D, H), MAT["aluminium"], module="structure_containment", module_objects=MO)
fl.add_box("pv_frame_short_east", (W - FRAME_W / 2, 0, H / 2), (FRAME_W, D, H), MAT["aluminium"], module="structure_containment", module_objects=MO)

fl.add_box("pv_front_tempered_glass", (W / 2, 0, H + 0.002), (INNER_W, INNER_D, 0.004), MAT["glass"], module="structure_containment", module_objects=MO)
fl.add_box("pv_rear_composite_backsheet", (W / 2, 0, 0.002), (INNER_W, INNER_D, 0.004), MAT["eva_white"], module="structure_containment", module_objects=MO)

fl.add_box("pv_inner_lip_north", (W / 2, D / 2 - FRAME_W - 0.004, H - 0.004), (INNER_W, 0.008, 0.008), MAT["aluminium"], module="structure_containment", module_objects=MO)
fl.add_box("pv_inner_lip_south", (W / 2, -D / 2 + FRAME_W + 0.004, H - 0.004), (INNER_W, 0.008, 0.008), MAT["aluminium"], module="structure_containment", module_objects=MO)
fl.add_box("pv_inner_lip_west", (FRAME_W + 0.004, 0, H - 0.004), (0.008, INNER_D, 0.008), MAT["aluminium"], module="structure_containment", module_objects=MO)
fl.add_box("pv_inner_lip_east", (W - FRAME_W - 0.004, 0, H - 0.004), (0.008, INNER_D, 0.008), MAT["aluminium"], module="structure_containment", module_objects=MO)

for i, (cx, cy) in enumerate([
    (0.022, D / 2 - 0.022),
    (W - 0.022, D / 2 - 0.022),
    (0.022, -D / 2 + 0.022),
    (W - 0.022, -D / 2 + 0.022),
]):
    fl.add_box(f"pv_frame_corner_block_{i}", (cx, cy, H / 2), (0.044, 0.044, H), MAT["aluminium"], module="structure_containment", module_objects=MO)

# ═══════ Module — environmental_interface ═══════
fl.add_box("pv_perimeter_gasket_north", (W / 2, D / 2 - FRAME_W - 0.002, H + 0.005), (INNER_W, 0.006, 0.006), MAT["sealant"], module="environmental_interface", module_objects=MO)
fl.add_box("pv_perimeter_gasket_south", (W / 2, -D / 2 + FRAME_W + 0.002, H + 0.005), (INNER_W, 0.006, 0.006), MAT["sealant"], module="environmental_interface", module_objects=MO)
fl.add_box("pv_perimeter_gasket_west", (FRAME_W + 0.002, 0, H + 0.005), (0.006, INNER_D, 0.006), MAT["sealant"], module="environmental_interface", module_objects=MO)
fl.add_box("pv_perimeter_gasket_east", (W - FRAME_W - 0.002, 0, H + 0.005), (0.006, INNER_D, 0.006), MAT["sealant"], module="environmental_interface", module_objects=MO)

for i, x in enumerate([0.20, 0.45, 0.70, 0.95, 1.20, 1.45]):
    fl.add_box(f"pv_frame_drain_slot_{i}", (x, -D / 2 + 0.004, 0.012), (0.045, 0.004, 0.010), MAT["black_polymer"], module="environmental_interface", module_objects=MO)

fl.add_cyl("pv_rear_breather_vent_L", (0.26, D / 2 - 0.018, 0.012), 0.010, 0.004, MAT["sealant"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("pv_rear_breather_vent_R", (W - 0.26, D / 2 - 0.018, 0.012), 0.010, 0.004, MAT["sealant"], module="environmental_interface", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pv_rear_moisture_barrier_top", (W / 2, D / 2 - 0.050, 0.006), (W - 0.18, 0.012, 0.004), MAT["sealant"], module="environmental_interface", module_objects=MO)
fl.add_box("pv_rear_moisture_barrier_bottom", (W / 2, -D / 2 + 0.050, 0.006), (W - 0.18, 0.012, 0.004), MAT["sealant"], module="environmental_interface", module_objects=MO)

# ═══════ Module — energy_storage_source ═══════
CELL = 0.145
GAP_X = 0.008
GAP_Y = 0.010
START_X = (W - (10 * CELL + 9 * GAP_X)) / 2 + CELL / 2
START_Y = -(6 * CELL + 5 * GAP_Y) / 2 + CELL / 2

for row in range(10):
    for col in range(6):
        x = START_X + row * (CELL + GAP_X)
        y = START_Y + col * (CELL + GAP_Y)
        mat = MAT["pv_cell"] if (row + col) % 2 == 0 else MAT["pv_cell_dark"]
        fl.add_box(f"pv_mono_perc_cell_r{row:02d}_c{col:02d}", (x, y, Z_FRONT), (CELL, CELL, 0.002), mat, module="energy_storage_source", module_objects=MO)

# ═══════ Module — power_distribution ═══════
for col in range(6):
    y = START_Y + col * (CELL + GAP_Y)
    fl.add_box(f"pv_string_busbar_A_c{col}", (W / 2, y - 0.030, Z_FRONT + 0.003), (1.48, 0.006, 0.003), MAT["silver_bus"], module="power_distribution", module_objects=MO)
    fl.add_box(f"pv_string_busbar_B_c{col}", (W / 2, y + 0.030, Z_FRONT + 0.003), (1.48, 0.006, 0.003), MAT["silver_bus"], module="power_distribution", module_objects=MO)

fl.add_box("pv_positive_collector_ribbon", (W - 0.115, 0, Z_FRONT + 0.004), (0.014, 0.82, 0.004), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pv_negative_collector_ribbon", (0.115, 0, Z_FRONT + 0.004), (0.014, 0.82, 0.004), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pv_rear_pos_terminal_ribbon", (W / 2 + 0.045, 0.045, -0.004), (0.024, 0.075, 0.006), MAT["copper"], module="power_distribution", module_objects=MO)
fl.add_box("pv_rear_neg_terminal_ribbon", (W / 2 - 0.045, -0.045, -0.004), (0.024, 0.075, 0.006), MAT["copper"], module="power_distribution", module_objects=MO)

fl.add_cyl("pv_positive_dc_cable", (W / 2 + 0.245, 0.060, -0.034), 0.008, 0.360, MAT["ctrl_black"], module="power_distribution", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("pv_negative_dc_cable", (W / 2 - 0.245, -0.060, -0.034), 0.008, 0.360, MAT["ctrl_black"], module="power_distribution", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_box("pv_mc4_positive_connector", (W / 2 + 0.455, 0.060, -0.034), (0.070, 0.026, 0.026), MAT["black_polymer"], module="power_distribution", module_objects=MO)
fl.add_box("pv_mc4_negative_connector", (W / 2 - 0.455, -0.060, -0.034), (0.070, 0.026, 0.026), MAT["black_polymer"], module="power_distribution", module_objects=MO)
fl.add_torus("pv_pos_cable_gland_ring", (W / 2 + 0.095, 0.060, -0.034), 0.014, 0.003, MAT["sealant"], module="power_distribution", module_objects=MO, rotation=(0, math.radians(90), 0))
fl.add_torus("pv_neg_cable_gland_ring", (W / 2 - 0.095, -0.060, -0.034), 0.014, 0.003, MAT["sealant"], module="power_distribution", module_objects=MO, rotation=(0, math.radians(90), 0))

# ═══════ Module — energy_conversion_transduction ═══════
fl.add_box("pv_junction_box_body", (W / 2, 0, -0.018), (0.190, 0.125, 0.036), MAT["black_polymer"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pv_junction_box_cover", (W / 2, 0, -0.039), (0.205, 0.140, 0.006), MAT["junction_orange"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pv_junction_pcb", (W / 2, 0, -0.010), (0.155, 0.085, 0.004), MAT["pcb"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pv_potted_terminal_block_pos", (W / 2 + 0.050, 0.026, -0.006), (0.040, 0.030, 0.012), MAT["junction_orange"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pv_potted_terminal_block_mid", (W / 2, 0, -0.006), (0.040, 0.030, 0.012), MAT["junction_orange"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pv_potted_terminal_block_neg", (W / 2 - 0.050, -0.026, -0.006), (0.040, 0.030, 0.012), MAT["junction_orange"], module="energy_conversion_transduction", module_objects=MO)
fl.add_box("pv_potting_compound_fill", (W / 2, 0, -0.002), (0.145, 0.076, 0.006), MAT["thermal"], module="energy_conversion_transduction", module_objects=MO)

# ═══════ Module — safety_protection ═══════
for i, xoff in enumerate([-0.050, 0.000, 0.050]):
    fl.add_cyl(f"pv_bypass_diode_{i}", (W / 2 + xoff, 0, -0.001), 0.010, 0.024, MAT["warning_red"], module="safety_protection", module_objects=MO, rotation=(0, math.radians(90), 0))
    fl.add_box(f"pv_diode_heat_spreader_{i}", (W / 2 + xoff, 0.028, -0.004), (0.032, 0.012, 0.004), MAT["heatsink"], module="safety_protection", module_objects=MO)

fl.add_box("pv_frame_grounding_lug", (W - 0.085, -D / 2 + 0.018, 0.020), (0.040, 0.014, 0.010), MAT["warning_red"], module="safety_protection", module_objects=MO)
fl.add_cyl("pv_ground_screw_head", (W - 0.085, -D / 2 + 0.009, 0.020), 0.009, 0.004, MAT["stainless"], module="safety_protection", module_objects=MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pv_high_voltage_warning_label", (W / 2, D / 2 - 0.080, 0.008), (0.130, 0.040, 0.002), MAT["warning_red"], module="safety_protection", module_objects=MO)
fl.add_box("pv_polarity_isolation_barrier", (W / 2, 0, -0.006), (0.010, 0.100, 0.014), MAT["warning_red"], module="safety_protection", module_objects=MO)

# ═══════ Module — sensing_instrumentation ═══════
fl.add_box("pv_rfid_serial_tag", (0.245, D / 2 - 0.085, 0.009), (0.095, 0.030, 0.002), MAT["rfid_green"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("pv_flash_test_barcode", (0.420, D / 2 - 0.085, 0.009), (0.120, 0.024, 0.002), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("pv_pos_factory_test_pad", (W / 2 + 0.075, 0.050, -0.001), 0.008, 0.004, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_cyl("pv_neg_factory_test_pad", (W / 2 - 0.075, -0.050, -0.001), 0.008, 0.004, MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("pv_laminate_temperature_dot", (W / 2, D / 2 - 0.150, 0.008), (0.026, 0.026, 0.002), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)
fl.add_box("pv_el_inspection_reference_mark", (W - 0.260, D / 2 - 0.085, 0.009), (0.065, 0.022, 0.002), MAT["sensor"], module="sensing_instrumentation", module_objects=MO)

# ═══════ Module — maintenance_serviceability ═══════
fl.add_box("pv_rear_rating_plate_label", (W / 2, D / 2 - 0.145, 0.010), (0.260, 0.110, 0.002), MAT["label_yellow"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_qr_service_label", (W / 2 + 0.100, D / 2 - 0.145, 0.012), (0.042, 0.042, 0.002), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_serial_number_strip", (W / 2 - 0.075, D / 2 - 0.105, 0.012), (0.115, 0.018, 0.002), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_clamp_zone_left_top", (0.315, D / 2 - 0.010, 0.032), (0.120, 0.008, 0.006), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_clamp_zone_right_top", (W - 0.315, D / 2 - 0.010, 0.032), (0.120, 0.008, 0.006), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_clamp_zone_left_bottom", (0.315, -D / 2 + 0.010, 0.032), (0.120, 0.008, 0.006), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_clamp_zone_right_bottom", (W - 0.315, -D / 2 + 0.010, 0.032), (0.120, 0.008, 0.006), MAT["maint"], module="maintenance_serviceability", module_objects=MO)
fl.add_box("pv_lift_orientation_arrow", (0.135, D / 2 - 0.060, 0.011), (0.075, 0.024, 0.002), MAT["maint"], module="maintenance_serviceability", module_objects=MO)

fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")