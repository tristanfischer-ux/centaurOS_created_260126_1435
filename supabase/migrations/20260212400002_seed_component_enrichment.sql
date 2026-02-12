-- ============================================================
-- ForgeOS: Seed physical_properties + procurement for all 105 components
-- Migration: 20260212400002_seed_component_enrichment
-- ============================================================
-- Data source: Claude engineering training knowledge.
-- All values are typical/default for standard component parameters.
-- Physical properties include: mass, electrical, thermal, mechanical, interface.
-- Procurement data includes: typical cost (GBP), lead time (days), common suppliers.

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_6063_T5", "density_kg_m3": 2700, "typical_mass_g": 22.0}, "electrical": {"resistivity_ohm_m": 3.3e-08}, "thermal": {"max_temp_c": 200, "min_temp_c": -80, "conductivity_w_mk": 200}, "mechanical": {"yield_strength_mpa": 145, "tensile_strength_mpa": 185, "moment_of_inertia_cm4": 0.7, "section_modulus_cm3": 0.7}, "interface": {"type": "t_slot_extrusion", "slot": "6mm", "profile": "2020", "standard": "Bosch_Rexroth"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.5, "lead_time_days": 3, "common_suppliers": ["Ooznest", "OpenBuilds", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'aluminium_extrusion';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_PA6_galvanised_screw", "density_kg_m3": 2000, "typical_mass_g": 15.0}, "electrical": null, "thermal": {"max_temp_c": 80, "min_temp_c": -30}, "mechanical": {"pull_out_force_kn": 0.5, "insulation_thickness_mm": "50-200", "substrate": ["concrete", "masonry", "timber_frame"]}, "interface": {"type": "mechanical_anchor", "drill_d_mm": 8, "drill_depth_mm": 40}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.12, "lead_time_days": 3, "common_suppliers": ["Ejot", "Fischer", "SFS"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'anchor_bracket';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "pbt_plastic_steel_bearing", "density_kg_m3": 1500, "typical_mass_g": 25.0}, "electrical": {"voltage_nom_v": 12.0, "voltage_range_v": [7, 13.8], "current_a": 0.15, "power_w": 1.8}, "thermal": {"max_temp_c": 70, "min_temp_c": -10}, "mechanical": {"airflow_cfm": 20, "static_pressure_mmh2o": 2.5, "noise_dba": 25, "rpm": 3000, "bearing_type": "sleeve", "mtbf_hours": 30000}, "interface": {"type": "fan_2pin", "connector": "JST_XH_2pin", "mounting": "M3_32mm"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.5, "lead_time_days": 3, "common_suppliers": ["RS", "Noctua", "Sunon"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'axial_fan';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_52100_chrome", "density_kg_m3": 7830, "typical_mass_g": 30.0}, "electrical": null, "thermal": {"max_temp_c": 120, "min_temp_c": -30, "grease": "lithium_ep2"}, "mechanical": {"dynamic_load_rating_kn": 5.1, "static_load_rating_kn": 2.4, "max_rpm": 28000, "radial_clearance_um": 8, "noise_db": 28}, "interface": {"type": "press_fit", "bore_tolerance": "k5", "od_tolerance": "H7", "standard": "ISO_15"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.8, "lead_time_days": 1, "common_suppliers": ["RS", "SKF", "Simply Bearings"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'ball_bearing';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "brass_nickel_plated", "density_kg_m3": 8500, "typical_mass_g": 3.0}, "electrical": {"voltage_max_v": 24.0, "current_max_a": 5.0, "contact_resistance_mohm": 50, "pins": 3}, "thermal": {"max_temp_c": 85, "min_temp_c": -25}, "mechanical": {"mating_cycles": 5000, "retention_force_n": 3.0}, "interface": {"type": "barrel_jack", "size": "5.5x2.1mm", "polarity": "center_positive"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.15, "lead_time_days": 3, "common_suppliers": ["RS", "CUI", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'barrel_jack';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "abs_spring_steel_contacts", "density_kg_m3": 1500, "typical_mass_g": 12.0}, "electrical": {"voltage_per_cell_v": 3.7, "max_current_a": 5.0, "contact_resistance_mohm": 20}, "thermal": {"max_temp_c": 60, "min_temp_c": -10}, "mechanical": {"spring_retention_force_n": 2.0}, "interface": {"type": "battery_holder", "cell": "18650", "termination": "solder_tab_or_wire"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.4, "lead_time_days": 3, "common_suppliers": ["RS", "Keystone", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'battery_holder_18650';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "mild_steel_powder_coated", "density_kg_m3": 7850, "typical_mass_g": 3500.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -20}, "mechanical": {"mesh_size_mm": 2.0, "ventilation_percent": 60}, "interface": {"type": "enclosure", "door": "hinged_latch"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 40.0, "lead_time_days": 14, "common_suppliers": ["Custom fabrication"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'breeding_cage';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_steel_copper_neodymium", "density_kg_m3": 4500, "typical_mass_g": 65.0}, "electrical": {"voltage_nom_v": 11.1, "voltage_range_v": [7.4, 14.8], "kv_rpm_per_v": 920, "current_no_load_a": 0.8, "current_max_a": 22.0, "power_max_w": 250, "resistance_mohm": 80, "poles": 14}, "thermal": {"max_temp_c": 180, "min_temp_c": -20, "max_winding_temp_c": 180}, "mechanical": {"torque_max_nm": 0.3, "max_rpm": 13600, "shaft_d_mm": 3.175, "shaft_type": "keyed"}, "interface": {"type": "bldc_3phase", "connector": "3.5mm_bullet", "mounting": "M3_4bolt_19mm"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 8.0, "lead_time_days": 5, "common_suppliers": ["HobbyKing", "T-Motor"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'brushless_motor_outrunner';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_steel_copper_neodymium", "density_kg_m3": 5000, "typical_mass_g": 120.0}, "electrical": {"voltage_nom_v": 24.0, "voltage_range_v": [12, 48], "kv_rpm_per_v": 200, "current_no_load_a": 0.3, "current_max_a": 5.0, "power_max_w": 100, "poles": 20}, "thermal": {"max_temp_c": 155, "min_temp_c": -20}, "mechanical": {"torque_max_nm": 0.5, "max_rpm": 4800}, "interface": {"type": "bldc_3phase", "encoder": "hall_3ch"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15.0, "lead_time_days": 7, "common_suppliers": ["T-Motor", "Allied Motion"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'brushless_motor_pancake';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_PA66_GF", "density_kg_m3": 1400, "typical_mass_g": 8.0}, "electrical": {"insulation_resistance_mohm": 5000}, "thermal": {"max_temp_c": 100, "min_temp_c": -40}, "mechanical": {"ip_rating": "IP68", "pull_out_force_n": 100}, "interface": {"type": "threaded", "thread": "M16x1.5", "cable_range_mm": "4-8", "standard": "EN_62444"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.25, "lead_time_days": 1, "common_suppliers": ["RS", "Lapp", "Wiska"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cable_gland';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_316L_EPDM_seal", "density_kg_m3": 4000, "typical_mass_g": 350.0}, "electrical": {"voltage_nom_v": 12.0, "voltage_range_v": [9, 15], "current_max_a": 2.5, "power_w": 25}, "thermal": {"max_temp_c": 60, "min_temp_c": 0, "fluid_temp_max_c": 60}, "mechanical": {"flow_rate_lpm": 10.0, "head_m": 3.0, "max_pressure_bar": 0.3, "impeller_rpm": 3000}, "interface": {"type": "pump", "inlet": "hose_barb_10mm", "outlet": "hose_barb_10mm"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 8.0, "lead_time_days": 5, "common_suppliers": ["RS", "Amazon", "Kamoer"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'centrifugal_pump';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "spring_steel_DIN_1.4310", "density_kg_m3": 7900, "typical_mass_g": 1.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40}, "mechanical": {"thrust_load_n": 1500, "hardness_hrc": "44-51"}, "interface": {"type": "retaining_ring", "standard": "DIN_471_external", "tool": "circlip_pliers"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.05, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'circlip';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "titanium_Ti6Al4V_stainless_valve", "density_kg_m3": 4500, "typical_mass_g": 120.0}, "electrical": {"valve_voltage_v": 5.0, "valve_current_a": 0.5, "power_per_pulse_w": 2.5, "control": "PWM_solenoid"}, "thermal": {"max_temp_c": 80, "min_temp_c": -20, "propellant_temp_range_c": [5, 50]}, "mechanical": {"thrust_mn": 50, "total_impulse_ns": 40, "specific_impulse_s": 65, "propellant": "R236fa_or_nitrogen", "tank_pressure_bar": 5.0, "delta_v_m_s": 10, "nozzle_expansion_ratio": 50}, "interface": {"type": "propulsion_module", "fill_valve": "Schrader", "mounting": "M3_bracket"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 8000.0, "lead_time_days": 90, "common_suppliers": ["Vacco", "NanoAvionics", "Enpulsion"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cold_gas_thruster';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "brass_CW617N", "density_kg_m3": 8430, "typical_mass_g": 35.0}, "electrical": null, "thermal": {"max_temp_c": 110, "min_temp_c": -20}, "mechanical": {"max_pressure_bar": 16, "tube_od_mm": 10, "burst_pressure_bar": 80}, "interface": {"type": "compression", "olive_material": "brass", "standard": "BS_EN_1254"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.5, "lead_time_days": 1, "common_suppliers": ["Screwfix", "Plumbworld"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'compression_fitting';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "music_wire_ASTM_A228", "density_kg_m3": 7850, "typical_mass_g": 3.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40}, "mechanical": {"spring_rate_n_mm": 2.5, "max_deflection_mm": 15.0, "max_load_n": 37.5, "free_length_mm": 25.0, "solid_height_mm": 10.0, "shear_modulus_gpa": 79.3}, "interface": {"type": "compression", "end_type": "closed_ground"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.15, "lead_time_days": 3, "common_suppliers": ["RS", "Lee Spring", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'compression_spring';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "cast_steel_WCB_stainless_trim", "density_kg_m3": 7500, "typical_mass_g": 5000.0}, "electrical": {"actuator_signal": "4-20mA_or_0-10V", "supply_air_bar": 6.0, "positioner": "electro_pneumatic"}, "thermal": {"max_temp_c": 200, "min_temp_c": -29}, "mechanical": {"cv": 15, "rangeability": "50:1", "characteristic": "equal_percentage", "shutoff_class": "IV", "packing": "PTFE_V-ring"}, "interface": {"type": "flanged", "standard": "EN_1092-1_PN16", "signal": "4-20mA_HART"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 300.0, "lead_time_days": 21, "common_suppliers": ["Fisher/Emerson", "Samson", "Spirax"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'control_valve';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "PVC_or_aluminium", "density_kg_m3": 1800, "typical_mass_g": 150.0}, "electrical": null, "thermal": {"max_temp_c": 60, "min_temp_c": -20}, "mechanical": {"impact_resistance": "medium", "mesh_bond_strength_n_m": 500}, "interface": {"type": "edge_profile", "adhesive": "basecoat_embedded"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.8, "lead_time_days": 3, "common_suppliers": ["Weber", "Sto", "Baumit"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'corner_bead';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_die_cast", "density_kg_m3": 2700, "typical_mass_g": 12.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40}, "mechanical": {"load_capacity_n": 500}, "interface": {"type": "bracket", "compatible_extrusion": "2020", "fastener": "M5_T-nut"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.6, "lead_time_days": 1, "common_suppliers": ["Ooznest", "OpenBuilds"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'corner_bracket_extrusion';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_316L_2205_duplex", "density_kg_m3": 7800, "typical_mass_g": 150000.0}, "electrical": null, "thermal": {"max_temp_c": 120, "min_temp_c": 10, "insulation": "mineral_wool_80mm"}, "mechanical": {"volume_m3": 0.7, "design_pressure_bar": 5, "agitator_power_kw": 2.2, "crystal_yield_kg_m3_h": 50}, "interface": {"type": "flanged", "agitator": "top_entry", "discharge": "bottom_cone_DN80"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15000.0, "lead_time_days": 90, "common_suppliers": ["Custom fabrication"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'crystalliser_vessel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_7075_T6_hard_anodised", "density_kg_m3": 2810, "typical_mass_g": 120.0}, "electrical": {"resistivity_ohm_m": 5.2e-08}, "thermal": {"max_temp_c": 200, "min_temp_c": -100, "conductivity_w_mk": 130, "cte_ppm_c": 23.6, "orbital_temp_range_c": [-40, 80]}, "mechanical": {"yield_strength_mpa": 503, "tensile_strength_mpa": 572, "random_vib_grms": 14.1, "quasi_static_load_g": 10, "first_natural_freq_hz": 90, "standard": "CubeSat_Design_Specification_Rev14"}, "interface": {"type": "cubesat_frame", "rails": "4_corner_8.5mm", "deployer": "P-POD_or_ISIPOD"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 800.0, "lead_time_days": 30, "common_suppliers": ["ISIS", "Pumpkin", "Endurosat"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cubesat_frame';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "lithium_ion_NMC", "density_kg_m3": 2700, "typical_mass_g": 48.0}, "electrical": {"voltage_nom_v": 3.6, "voltage_max_v": 4.2, "voltage_min_v": 2.5, "capacity_mah": 3000, "energy_wh": 10.8, "discharge_rate_max_a": 15, "charge_rate_a": 1.5, "internal_resistance_mohm": 35, "cycle_life": 500}, "thermal": {"max_temp_c": 60, "min_temp_c": -20, "thermal_runaway_c": 150}, "mechanical": {"weight_g": 48, "form_factor": "18650"}, "interface": {"type": "cell_cylindrical", "positive": "button_top", "negative": "flat"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.5, "lead_time_days": 5, "common_suppliers": ["Nkon", "Fogstar"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cylindrical_cell_18650';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_copper_brass_gears", "density_kg_m3": 5000, "typical_mass_g": 18.0}, "electrical": {"voltage_nom_v": 6.0, "voltage_range_v": [3, 12], "current_no_load_a": 0.05, "current_stall_a": 0.8, "power_w": 4.8}, "thermal": {"max_temp_c": 60, "min_temp_c": -10}, "mechanical": {"gear_ratio": "100:1", "output_rpm_6v": 60, "output_torque_nm": 0.3, "stall_torque_nm": 1.0, "shaft_d_mm": 3.0, "shaft_type": "D-flat"}, "interface": {"type": "dc_motor_2wire", "connector": "solder_tab"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.0, "lead_time_days": 5, "common_suppliers": ["RS", "Pololu", "Amazon"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'dc_gearmotor';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_tape_spring_aluminium_canister", "density_kg_m3": 3500, "typical_mass_g": 80.0}, "electrical": {"frequency_mhz": [145, 437], "gain_dbi": [0, 2.15], "impedance_ohm": 50, "vswr": 1.5, "polarisation": "linear"}, "thermal": {"max_temp_c": 100, "min_temp_c": -100}, "mechanical": {"stowed_height_mm": 15, "deployed_length_mm": 500, "deployment_mechanism": "burn_wire", "burn_time_s": 5, "burn_current_a": 2.0}, "interface": {"type": "sma_female", "deployment": "burn_wire_resistor", "elements": 4}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2000.0, "lead_time_days": 45, "common_suppliers": ["ISIS", "Endurosat"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'deployable_antenna';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_galvanised", "density_kg_m3": 7850, "typical_mass_g": 50.0}, "electrical": {"resistivity_ohm_m": 1.6e-07}, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"load_capacity_kg_m": 10.0}, "interface": {"type": "din_rail", "standard": "IEC_60715", "profile": "35mm_top_hat"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.0, "lead_time_days": 1, "common_suppliers": ["RS", "Phoenix Contact"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'din_rail';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_hardened_ground", "density_kg_m3": 7850, "typical_mass_g": 3.0}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"hardness_hrc": "58-62", "shear_strength_mpa": 800, "tolerance": "m6", "surface_finish_ra_um": 0.4}, "interface": {"type": "press_fit", "standard": "ISO_2338", "hole_tolerance": "H7"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.1, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'dowel_pin';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "polypropylene", "density_kg_m3": 900, "typical_mass_g": 2.0}, "electrical": null, "thermal": {"max_temp_c": 50, "min_temp_c": 2}, "mechanical": {"flow_rate_lph": 2.0, "operating_pressure_bar": "0.5-3.0", "flow_regulation": "pressure_compensating"}, "interface": {"type": "barbed_inline", "tube_id_mm": 4}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.1, "lead_time_days": 3, "common_suppliers": ["Netafim", "Jain"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'drip_emitter';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "corrugated_cardboard_or_wood", "density_kg_m3": 700, "typical_mass_g": 50.0}, "electrical": null, "thermal": {"max_temp_c": 50, "min_temp_c": 5}, "mechanical": {"corrugation_pitch_mm": 3.0, "gap_mm": 2.5}, "interface": {"type": "passive_collector", "replacement_cycle_days": 3}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.2, "lead_time_days": 1, "common_suppliers": ["Custom cut"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'egg_collection_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "expanded_polystyrene_EPS", "density_kg_m3": 20, "typical_mass_g": 34500.0}, "electrical": {"resistivity_ohm_m": 1e+16}, "thermal": {"conductivity_w_mk": 0.035, "r_value_m2_k_w_per_25mm": 0.71, "max_temp_c": 80, "min_temp_c": -200, "fire_class": "E_EN_13501", "self_extinguishing": true}, "mechanical": {"compressive_strength_kpa": 70, "flexural_strength_kpa": 150, "water_absorption_vol_percent": 2}, "interface": {"type": "block", "cutting": "hot_wire_or_CNC"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 25.0, "lead_time_days": 3, "common_suppliers": ["Jablite", "Sundolitt"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'eps_block';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "FR4_mosfet_copper", "density_kg_m3": 3000, "typical_mass_g": 6.0}, "electrical": {"voltage_range_v": [7.4, 25.2], "cells": "2S-6S", "current_continuous_a": 35, "current_burst_a": 45, "bec_voltage_v": 5.0, "bec_current_a": 2.0, "pwm_frequency_khz": 48, "protocols": ["DShot600", "DShot300", "Multishot", "OneShot"], "firmware": "BLHeli_32"}, "thermal": {"max_temp_c": 85, "min_temp_c": -10, "thermal_protection": true}, "mechanical": {}, "interface": {"type": "esc_3phase", "signal": "DShot600", "mounting": "20x20_M3_or_30.5x30.5_M3"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 10.0, "lead_time_days": 5, "common_suppliers": ["SpeedyBee", "T-Motor", "Holybro"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'esc_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "polypropylene_GF", "density_kg_m3": 1200, "typical_mass_g": 5000.0}, "electrical": null, "thermal": {"max_temp_c": 80, "min_temp_c": 5}, "mechanical": {"filter_area_m2_per_plate": 0.12, "chamber_depth_mm": 25, "max_pressure_bar": 16, "cake_moisture_percent": 25, "cloth": "polypropylene_5um"}, "interface": {"type": "filter_press", "feed": "corner_port", "filtrate": "corner_port"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 80.0, "lead_time_days": 14, "common_suppliers": ["Andritz", "MSE"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'filter_press_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "pcb_glass_lens_aluminium", "density_kg_m3": 2500, "typical_mass_g": 5.0}, "electrical": {"voltage_range_v": [3.3, 5.5], "current_ma": 120, "power_mw": 600, "output": "analog_NTSC_or_digital_HD", "resolution": "1200TVL_or_720p", "fov_deg": 155, "latency_ms": 5, "wdr": true}, "thermal": {"max_temp_c": 60, "min_temp_c": -10}, "mechanical": {"sensor_size_mm": 2.1, "lens_mount": "M12"}, "interface": {"type": "video_out", "connector": "JST_SH_3pin", "mounting": "14mm_or_19mm_standard"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15.0, "lead_time_days": 5, "common_suppliers": ["Caddx", "RunCam", "Foxeer"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'fpv_camera';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "carbon_fibre_3K_twill", "density_kg_m3": 1600, "typical_mass_g": 30.0}, "electrical": {"resistivity_ohm_m": 1.5e-05}, "thermal": {"max_temp_c": 150, "min_temp_c": -50}, "mechanical": {"tensile_strength_mpa": 600, "flexural_strength_mpa": 450, "elastic_modulus_gpa": 70, "thickness_mm": 2.0}, "interface": {"type": "frame_plate", "mounting": "M3_30.5mm_stack", "motor_mount": "M3_4bolt"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 12.0, "lead_time_days": 5, "common_suppliers": ["iFlight", "Diatone", "Armattan"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'frame_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "FR4_ceramic_antenna", "density_kg_m3": 2000, "typical_mass_g": 8.0}, "electrical": {"voltage_v": 3.3, "voltage_range_v": [2.7, 3.6], "current_acquisition_ma": 25, "current_tracking_ma": 18, "update_rate_hz": 10, "accuracy_m": 2.0, "constellations": ["GPS", "GLONASS", "Galileo", "BeiDou"], "channels": 72, "ttff_cold_s": 26}, "thermal": {"max_temp_c": 85, "min_temp_c": -40}, "mechanical": {}, "interface": {"type": "uart", "baud": 9600, "protocol": "NMEA_0183_UBX", "connector": "JST_GH_6pin"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 12.0, "lead_time_days": 5, "common_suppliers": ["Holybro", "Matek", "u-blox"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'gps_module';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "ABS_food_safe", "density_kg_m3": 1050, "typical_mass_g": 400.0}, "electrical": null, "thermal": {"max_temp_c": 60, "min_temp_c": 2}, "mechanical": {"max_load_kg": 20, "drain_flow_lpm": 5}, "interface": {"type": "tray", "drain": "19mm_barb"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 5.0, "lead_time_days": 3, "common_suppliers": ["Nutriculture", "Amazon"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'grow_tray';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_304_mesh", "density_kg_m3": 7900, "typical_mass_g": 800.0}, "electrical": null, "thermal": {"max_temp_c": 250, "min_temp_c": -40}, "mechanical": {"mesh_opening_mm": 5.0, "wire_d_mm": 0.8, "open_area_percent": 64}, "interface": {"type": "screen", "standard": "ISO_3310"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15.0, "lead_time_days": 7, "common_suppliers": ["MeshDirect", "Locker Group"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'harvesting_screen';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "brass_CZ121", "density_kg_m3": 8500, "typical_mass_g": 1.2}, "electrical": {"resistivity_ohm_m": 6.2e-08}, "thermal": {"max_temp_c": 260, "min_temp_c": -40, "install_temp_c": 220}, "mechanical": {"pull_out_force_n": 500, "torque_out_nm": 2.5, "thread_standard": "ISO_metric"}, "interface": {"type": "threaded", "thread": "M3x0.5", "install_method": "soldering_iron"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.08, "lead_time_days": 3, "common_suppliers": ["Ruthex", "CNC Kitchen", "McMaster"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'heat_set_insert';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_6063_T5", "density_kg_m3": 2700, "typical_mass_g": 30.0}, "electrical": null, "thermal": {"thermal_resistance_c_w": 5.0, "max_temp_c": 200, "surface_area_cm2": 120, "fin_efficiency": 0.85, "conductivity_w_mk": 200, "natural_convection_c_w": 8.0, "forced_convection_c_w": 3.0}, "mechanical": {}, "interface": {"type": "thermal_interface", "mounting": "M3_2bolt", "tim": "thermal_paste"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.5, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Fischer"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'heatsink_extruded';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_grade_8.8", "density_kg_m3": 7850, "typical_mass_g": 12.0}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"tensile_strength_mpa": 800, "yield_strength_mpa": 640, "proof_load_kn": 18.0, "thread_standard": "ISO_metric", "hardness_hrc": "22-32"}, "interface": {"type": "threaded", "thread": "M8x1.25", "drive": "hex_external", "standard": "ISO_4014"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.03, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'hex_bolt';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_grade_8", "density_kg_m3": 7850, "typical_mass_g": 5.5}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"proof_load_kn": 18.0, "thread_standard": "ISO_metric", "hardness_hrc": "22-32"}, "interface": {"type": "threaded", "thread": "M8x1.25", "standard": "ISO_4032"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.02, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'hex_nut';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_zinc_plated", "density_kg_m3": 7850, "typical_mass_g": 30.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40}, "mechanical": {"load_capacity_kg": 15, "rotation_deg": 270}, "interface": {"type": "hinge", "fastener": "M4_countersunk"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.5, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Screwfix"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'hinge_butt';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_tube_nichrome_wire", "density_kg_m3": 7850, "typical_mass_g": 800.0}, "electrical": {"wire_voltage_v": 12, "wire_current_a": 3, "wire_temp_c": 200, "wire_material": "NiCr_80/20", "wire_resistance_ohm_m": 6.5}, "thermal": {"max_temp_c": 200, "min_temp_c": -20}, "mechanical": {"cut_speed_mm_s": 20, "accuracy_mm": 0.5}, "interface": {"type": "tool", "power": "bench_PSU_12V"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 60.0, "lead_time_days": 7, "common_suppliers": ["Proxxon", "Custom"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'hot_wire_cutter_frame';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_316L_polyurethane_liner", "density_kg_m3": 6000, "typical_mass_g": 25000.0}, "electrical": null, "thermal": {"max_temp_c": 80, "min_temp_c": 5}, "mechanical": {"feed_pressure_bar": 2.0, "d50_cut_point_um": 25, "flow_rate_m3_h": 5, "pressure_drop_bar": 1.0, "separation_efficiency_percent": 95}, "interface": {"type": "flanged", "inlet": "DN50_tangential", "overflow": "DN40_vortex_finder", "underflow": "DN25_spigot"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2000.0, "lead_time_days": 30, "common_suppliers": ["Weir Minerals", "FLSmidth"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'hydrocyclone';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_pa66_gf", "density_kg_m3": 1400, "typical_mass_g": 0.5}, "electrical": {"voltage_max_v": 250.0, "current_max_a": 3.0, "contact_resistance_mohm": 20, "pins": 4}, "thermal": {"max_temp_c": 85, "min_temp_c": -25}, "mechanical": {"mating_cycles": 30, "retention_force_n": 2.0}, "interface": {"type": "jst_xh", "pitch_mm": 2.5, "wire_gauge_awg": "22-28"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.08, "lead_time_days": 3, "common_suppliers": ["RS", "JST", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'jst_connector';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_C45", "density_kg_m3": 7850, "typical_mass_g": 0.8}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"shear_strength_mpa": 400, "hardness_hrc": "20-25"}, "interface": {"type": "key", "standard": "DIN_6885_A", "fit": "P9_shaft_N9_hub"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.15, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'keyway_key';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_stainless_contacts", "density_kg_m3": 2000, "typical_mass_g": 1.5}, "electrical": {"voltage_max_v": 30, "current_max_a": 1.0, "contact_resistance_mohm": 100, "insulation_resistance_mohm": 100}, "thermal": {"max_temp_c": 85, "min_temp_c": -40}, "mechanical": {"actuation_force_n": 0.5, "overtravel_mm": 0.5, "lifecycle_ops": 10000}, "interface": {"type": "deployment_inhibit", "standard": "CDS_kill_switch", "count_required": 3}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 5.0, "lead_time_days": 7, "common_suppliers": ["Omron", "C&K"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'kill_switch';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "mild_steel_zinc_plated", "density_kg_m3": 7850, "typical_mass_g": 25.0}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"yield_strength_mpa": 235}, "interface": {"type": "bracket", "holes": "M5_clearance"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.4, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'l_bracket';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "HDPE_food_grade", "density_kg_m3": 960, "typical_mass_g": 1200.0}, "electrical": null, "thermal": {"max_temp_c": 60, "min_temp_c": 5}, "mechanical": {"volume_litres": 15, "max_load_kg": 20, "drain_hole_d_mm": 4}, "interface": {"type": "tray_stackable", "handles": true}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.0, "lead_time_days": 5, "common_suppliers": ["Custom mould"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'larvae_rearing_tray';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_304", "density_kg_m3": 8000, "typical_mass_g": 80.0}, "electrical": null, "thermal": {"max_temp_c": 250, "min_temp_c": -40}, "mechanical": {"lead_mm": 2.0, "pitch_mm": 2.0, "starts": 1, "efficiency_percent": 40, "backlash_mm": 0.1, "axial_load_capacity_n": 500, "critical_speed_rpm": 3000, "nut_material": "bronze_SAE_660"}, "interface": {"type": "lead_screw", "thread": "Tr8x2", "nut_mount": "flange_4xM3"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 4.0, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Igus"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'lead_screw';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_heatsink_pcb_led", "density_kg_m3": 2800, "typical_mass_g": 450.0}, "electrical": {"voltage_nom_v": 24.0, "voltage_range_v": [20, 28], "current_a": 1.5, "power_w": 36, "ppfd_umol_m2_s_at_30cm": 400, "spectrum": "full_spectrum_3500K", "led_count": 40, "led_type": "Samsung_LM301H", "efficacy_umol_j": 2.7}, "thermal": {"max_temp_c": 45, "junction_temp_max_c": 85, "thermal_resistance_c_w": 2.0}, "mechanical": {}, "interface": {"type": "dc_power", "connector": "MC4_or_barrel_jack", "dimming": "PWM_or_0-10V"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 25.0, "lead_time_days": 7, "common_suppliers": ["Samsung LED", "HLG", "Digikey"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'led_grow_light_bar';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "epoxy_gallium_arsenide", "density_kg_m3": 1800, "typical_mass_g": 0.3}, "electrical": {"forward_voltage_v": 2.0, "forward_current_ma": 20, "max_current_ma": 30, "reverse_voltage_v": 5, "wavelength_nm": 625, "luminous_intensity_mcd": 500, "viewing_angle_deg": 30}, "thermal": {"max_temp_c": 85, "min_temp_c": -40, "power_dissipation_mw": 75}, "mechanical": {}, "interface": {"type": "led", "mounting": "through_hole", "polarity": "anode_longer"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.03, "lead_time_days": 3, "common_suppliers": ["RS", "LCSC", "Kingbright"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'led_indicator';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_zinc_plated_rubber_pad", "density_kg_m3": 5000, "typical_mass_g": 45.0}, "electrical": null, "thermal": {"max_temp_c": 80, "min_temp_c": -20}, "mechanical": {"max_load_kg": 100, "vibration_damping_db": 10}, "interface": {"type": "threaded", "thread": "M8x1.25"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.8, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Essentra"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'levelling_foot';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_stainless_contacts", "density_kg_m3": 2000, "typical_mass_g": 4.0}, "electrical": {"voltage_max_v": 250, "current_max_a": 5.0, "contact_resistance_mohm": 50, "insulation_resistance_mohm": 100}, "thermal": {"max_temp_c": 85, "min_temp_c": -25}, "mechanical": {"actuation_force_n": 0.5, "differential_travel_mm": 0.5, "overtravel_mm": 1.0, "lifecycle_ops": 1000000}, "interface": {"type": "spdt", "terminals": "COM_NO_NC", "standard": "IEC_61058"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.8, "lead_time_days": 1, "common_suppliers": ["RS", "Omron", "Cherry"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'limit_switch';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_hardened_chrome", "density_kg_m3": 7850, "typical_mass_g": 65.0}, "electrical": null, "thermal": {"max_temp_c": 80, "min_temp_c": -20}, "mechanical": {"dynamic_load_rating_n": 2050, "static_load_rating_n": 3500, "preload": "light", "accuracy_class": "N", "max_speed_m_s": 3.0, "repeatability_um": 5, "friction_coefficient": 0.003}, "interface": {"type": "linear_guide", "size": "MGN9", "carriage": "MGN9H", "rail_holes": "M3_20mm_pitch"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 6.0, "lead_time_days": 5, "common_suppliers": ["RS", "Misumi", "Hiwin"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'linear_rail';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "lithium_polymer_aluminium_pouch", "density_kg_m3": 1800, "typical_mass_g": 180.0}, "electrical": {"voltage_nom_v": 11.1, "voltage_max_v": 12.6, "voltage_min_v": 9.0, "cells": 3, "capacity_mah": 1500, "energy_wh": 16.65, "discharge_rate_c": 75, "max_current_a": 112.5, "charge_rate_c": 2, "internal_resistance_mohm": 12}, "thermal": {"max_temp_c": 60, "min_temp_c": 0, "storage_temp_c": 22, "thermal_runaway_c": 150}, "mechanical": {"cycle_life": 300, "swell_percent_max": 5}, "interface": {"type": "battery_lipo", "power": "XT60", "balance": "JST_XH_4pin"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 18.0, "lead_time_days": 3, "common_suppliers": ["Tattu", "CNHL", "GNB"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'lipo_battery_pack';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "ferrite_core_copper_wire", "density_kg_m3": 4000, "typical_mass_g": 30.0}, "electrical": {"voltage_max_v": 5.0, "current_max_a": 0.2, "resistance_ohm": 25, "power_max_w": 1.0, "magnetic_moment_Am2": 0.2}, "thermal": {"max_temp_c": 80, "min_temp_c": -40}, "mechanical": {"residual_dipole_Am2": 0.001}, "interface": {"type": "h_bridge_driven", "protocol": "PWM_bipolar", "mounting": "bracket_M2"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 500.0, "lead_time_days": 30, "common_suppliers": ["ISIS", "NewSpace Systems"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'magnetorquer';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "HDPE_food_safe", "density_kg_m3": 960, "typical_mass_g": 5.0}, "electrical": null, "thermal": {"max_temp_c": 80, "min_temp_c": -10}, "mechanical": {"root_zone_volume_ml": 50}, "interface": {"type": "net_pot", "standard_sizes_mm": [25, 50, 75, 100, 150]}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.05, "lead_time_days": 3, "common_suppliers": ["GroWell", "Amazon"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'net_pot';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_6063_T5", "density_kg_m3": 2700, "typical_mass_g": 800.0}, "electrical": null, "thermal": {"max_temp_c": 60, "min_temp_c": 2}, "mechanical": {"flow_rate_lpm": 2.0, "slope_percent": 1.0, "max_load_kg_m": 10}, "interface": {"type": "channel", "inlet": "grommet_fit", "outlet": "13mm_barb"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 8.0, "lead_time_days": 7, "common_suppliers": ["CropKing", "Nutriculture"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'nft_channel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "HDPE_food_safe_UV_stabilised", "density_kg_m3": 960, "typical_mass_g": 3500.0}, "electrical": null, "thermal": {"max_temp_c": 50, "min_temp_c": 2, "uv_resistant": true}, "mechanical": {"volume_litres": 35, "max_pressure_bar": 0.1}, "interface": {"type": "tank", "inlet": "bulk_head_19mm", "outlet": "bulk_head_19mm", "lid": "removable"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15.0, "lead_time_days": 3, "common_suppliers": ["Nutriculture", "IWS"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'nutrient_reservoir';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nitrile_NBR_70A", "density_kg_m3": 1100, "typical_mass_g": 1.5}, "electrical": {"resistivity_ohm_m": 1000000000000.0}, "thermal": {"max_temp_c": 100, "min_temp_c": -30, "material_options": {"NBR": {"max_c": 100, "min_c": -30}, "FKM_Viton": {"max_c": 200, "min_c": -20}, "EPDM": {"max_c": 150, "min_c": -50}, "silicone": {"max_c": 200, "min_c": -60}}}, "mechanical": {"hardness_shore_a": 70, "compression_set_percent": 20, "max_pressure_bar": 200, "elongation_at_break_percent": 300}, "interface": {"type": "seal", "standard": "ISO_3601", "groove": "ISO_3601-2"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.05, "lead_time_days": 1, "common_suppliers": ["RS", "Seals Direct"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'o_ring';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "glass_pcb_flex", "density_kg_m3": 2000, "typical_mass_g": 3.0}, "electrical": {"voltage_v": 3.3, "voltage_range_v": [3.0, 5.5], "current_typical_ma": 15, "current_max_ma": 30, "resolution_px": "128x64", "pixel_size_mm": 0.15, "contrast_ratio": "10000:1", "viewing_angle_deg": 160}, "thermal": {"max_temp_c": 70, "min_temp_c": -20, "luminance_cd_m2": 120}, "mechanical": {"screen_size_inch": 0.96}, "interface": {"type": "i2c", "address": "0x3C", "protocol": "SSD1306", "connector": "4pin_header"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.0, "lead_time_days": 5, "common_suppliers": ["RS", "Amazon", "Pimoroni"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'oled_display';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_zinc_plated_rubber_lined", "density_kg_m3": 7850, "typical_mass_g": 3.0}, "electrical": {"insulation_v": 500}, "thermal": {"max_temp_c": 120, "min_temp_c": -30}, "mechanical": {"clamp_force_n": 20, "vibration_damping": true}, "interface": {"type": "clamp", "fastener": "M4"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.1, "lead_time_days": 1, "common_suppliers": ["RS", "Screwfix"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'p_clip';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "copper_FR4_aluminium_ground", "density_kg_m3": 2200, "typical_mass_g": 25.0}, "electrical": {"frequency_mhz": 437, "bandwidth_mhz": 5, "gain_dbi": 6.0, "impedance_ohm": 50, "vswr": 1.3, "polarisation": "RHCP", "efficiency_percent": 85, "power_handling_w": 2}, "thermal": {"max_temp_c": 100, "min_temp_c": -100}, "mechanical": {"radiation_pattern": "hemispheric"}, "interface": {"type": "sma_female", "feed": "probe_fed"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1000.0, "lead_time_days": 30, "common_suppliers": ["ISIS", "Endurosat"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'patch_antenna_cubesat';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "FR4_copper", "density_kg_m3": 1900, "typical_mass_g": 10.0}, "electrical": {"layers": 2, "copper_weight_oz": 1, "min_trace_mm": 0.15, "min_space_mm": 0.15, "dielectric_constant": 4.5, "breakdown_voltage_kv_mm": 20}, "thermal": {"max_temp_c": 130, "min_temp_c": -40, "tg_c": 170, "conductivity_w_mk": 0.3}, "mechanical": {"flexural_strength_mpa": 415, "thickness_mm": 1.6}, "interface": {"type": "pcb", "standard": "IPC_6012", "finish": "HASL_lead_free"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.0, "lead_time_days": 7, "common_suppliers": ["JLCPCB", "PCBWay", "Aisler"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'pcb_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "pzt_ceramic_abs_housing", "density_kg_m3": 2500, "typical_mass_g": 2.0}, "electrical": {"voltage_nom_v": 5.0, "voltage_range_v": [3, 12], "current_max_ma": 30, "frequency_hz": 2700, "sound_output_db_10cm": 85}, "thermal": {"max_temp_c": 70, "min_temp_c": -20}, "mechanical": {}, "interface": {"type": "buzzer_active", "drive": "dc_voltage", "mounting": "through_hole"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.2, "lead_time_days": 3, "common_suppliers": ["RS", "Murata", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'piezo_buzzer';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "carbon_steel_A105", "density_kg_m3": 7850, "typical_mass_g": 1500.0}, "electrical": null, "thermal": {"max_temp_c": 250, "min_temp_c": -29}, "mechanical": {"pressure_class": "PN16", "bolt_torque_nm": 80, "gasket": "spiral_wound_graphite"}, "interface": {"type": "flanged", "standard": "EN_1092-1", "face": "raised_face_RF"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 8.0, "lead_time_days": 5, "common_suppliers": ["RS", "Prochem", "BSS"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'pipe_flange';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_316L", "density_kg_m3": 8000, "typical_mass_g": 85000.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -20, "design_temp_c": 150}, "mechanical": {"design_pressure_bar": 10, "test_pressure_bar": 15, "corrosion_allowance_mm": 1.5, "weld_joint_efficiency": 0.85, "standard": "PD_5500_or_ASME_VIII"}, "interface": {"type": "flanged", "flange_standard": "EN_1092-1_PN16", "nozzles": ["DN50_inlet", "DN25_drain"]}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 5000.0, "lead_time_days": 60, "common_suppliers": ["Custom fabrication"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'pressure_vessel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_304", "density_kg_m3": 8000, "typical_mass_g": 35000.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -20}, "mechanical": {"volume_m3": 0.08, "discharge_angle_deg": 60, "max_load_kg": 200, "wall_friction_angle_deg": 25}, "interface": {"type": "hopper", "discharge": "DN80_butterfly_valve", "supports": "4_leg_welded"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 500.0, "lead_time_days": 21, "common_suppliers": ["Custom fabrication"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'product_hopper';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "carbon_fibre_nylon", "density_kg_m3": 1500, "typical_mass_g": 8.0}, "electrical": null, "thermal": {"max_temp_c": 100, "min_temp_c": -30}, "mechanical": {"thrust_g_at_100pct": 450, "pitch_inches": 4.5, "max_rpm": 25000, "dynamic_balance_g_mm": 0.5}, "interface": {"type": "prop_mount", "shaft": "5mm_self_tightening"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.0, "lead_time_days": 3, "common_suppliers": ["HQProp", "Gemfan", "T-Motor"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'propeller_airfoil';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "acetal_POM_brass_collet", "density_kg_m3": 2500, "typical_mass_g": 5.0}, "electrical": null, "thermal": {"max_temp_c": 60, "min_temp_c": 0}, "mechanical": {"max_pressure_bar": 10, "vacuum_bar": -0.95, "tube_od_mm": 6}, "interface": {"type": "push_fit", "thread": "R1/8_BSP", "fluid": "air_water"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.8, "lead_time_days": 1, "common_suppliers": ["RS", "Festo", "John Guest"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'push_fit_connector';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_flywheel_bldc_motor_aluminium_housing", "density_kg_m3": 5000, "typical_mass_g": 60.0}, "electrical": {"voltage_v": 5.0, "voltage_range_v": [3.3, 5.5], "current_idle_ma": 50, "current_peak_ma": 500, "power_idle_w": 0.25, "power_peak_w": 2.5}, "thermal": {"max_temp_c": 70, "min_temp_c": -30, "power_dissipation_w": 0.5}, "mechanical": {"momentum_mNms": 10, "torque_mNm": 1.0, "max_rpm": 6000, "jitter_arcsec": 5, "wheel_inertia_kg_m2": 1.5e-05}, "interface": {"type": "i2c_or_uart", "protocol": "custom_binary", "mounting": "M3_4bolt"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3000.0, "lead_time_days": 60, "common_suppliers": ["CubeSpace", "NewSpace Systems"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'reaction_wheel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "alkali_resistant_fibreglass", "density_kg_m3": 2500, "typical_mass_g": 300.0}, "electrical": {"resistivity_ohm_m": 10000000000.0}, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"tensile_strength_mpa": 1500, "mesh_opening_mm": 50, "weight_gsm": 160, "elongation_percent": 3}, "interface": {"type": "mesh_panel", "adhesive": "polymer_modified_basecoat"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.5, "lead_time_days": 3, "common_suppliers": ["Weber", "Sto", "Baumit"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'reinforcing_mesh_panel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_copper_contacts_steel", "density_kg_m3": 3000, "typical_mass_g": 10.0}, "electrical": {"coil_voltage_v": 5.0, "coil_current_a": 0.08, "coil_resistance_ohm": 62.5, "contact_voltage_max_v": 250, "contact_current_max_a": 10, "contact_arrangement": "SPDT", "contact_resistance_mohm": 100, "insulation_resistance_mohm": 1000, "dielectric_strength_vac": 1500}, "thermal": {"max_temp_c": 70, "min_temp_c": -20}, "mechanical": {"lifecycle_ops": 100000, "operate_time_ms": 10, "release_time_ms": 5}, "interface": {"type": "relay_spdt", "coil": "DC_5V", "pins": 8}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.8, "lead_time_days": 3, "common_suppliers": ["RS", "Omron", "Finder"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'relay_module';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_5052", "density_kg_m3": 2680, "typical_mass_g": 0.8}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40}, "mechanical": {"shear_strength_n": 1700, "tensile_strength_n": 1200, "grip_range_mm": "1.5-10.0"}, "interface": {"type": "rivet", "standard": "ISO_15983", "tool": "rivet_gun"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.02, "lead_time_days": 1, "common_suppliers": ["RS", "Screwfix"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'rivet';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "metal_plastic", "density_kg_m3": 3500, "typical_mass_g": 8.0}, "electrical": {"voltage_max_v": 5.0, "current_max_ma": 1, "pulses_per_revolution": 20, "output_type": "quadrature_AB", "switch": "momentary_push", "contact_resistance_mohm": 20}, "thermal": {"max_temp_c": 70, "min_temp_c": -20}, "mechanical": {"rotation": "continuous_360", "detents": 20, "push_force_n": 3.0}, "interface": {"type": "encoder_quadrature", "pins": "A_B_SW_VCC_GND", "mounting": "panel_M7_nut"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.5, "lead_time_days": 3, "common_suppliers": ["RS", "Alps", "Bourns"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'rotary_encoder';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_6063_T5", "density_kg_m3": 2700, "typical_mass_g": 50.0}, "electrical": {"resistivity_ohm_m": 3.3e-08}, "thermal": {"max_temp_c": 200, "min_temp_c": -80, "conductivity_w_mk": 200}, "mechanical": {"yield_strength_mpa": 145, "tensile_strength_mpa": 185, "elastic_modulus_gpa": 69}, "interface": {"type": "tube", "standard": "ISO_1127"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.5, "lead_time_days": 3, "common_suppliers": ["Metals4U", "Aluminiumwarehouse"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'round_tube';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "silicone_rubber_50A", "density_kg_m3": 1150, "typical_mass_g": 1.5}, "electrical": {"resistivity_ohm_m": 10000000000000.0}, "thermal": {"max_temp_c": 200, "min_temp_c": -50}, "mechanical": {"hardness_shore_a": 50, "compression_set_percent": 15, "friction_coefficient": 0.9}, "interface": {"type": "adhesive", "adhesive": "3M_VHB"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.1, "lead_time_days": 1, "common_suppliers": ["RS", "Essentra"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'rubber_foot';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "glass_epoxy_platinum_electrode", "density_kg_m3": 2200, "typical_mass_g": 30.0}, "electrical": {"voltage_v": 3.3, "current_ma": 5, "output": "analog_0-3V_or_I2C", "accuracy_ph": 0.01, "accuracy_ec_percent": 2, "response_time_s": 5}, "thermal": {"max_temp_c": 60, "min_temp_c": 0}, "mechanical": {"ip_rating": "IP68", "cable_length_m": 1.5}, "interface": {"type": "sensor", "protocol": "analog_or_I2C", "connector": "BNC_or_SMA"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15.0, "lead_time_days": 5, "common_suppliers": ["Atlas Scientific", "DFRobot"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'sensor_probe';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_302", "density_kg_m3": 7900, "typical_mass_g": 5.0}, "electrical": null, "thermal": {"max_temp_c": 250, "min_temp_c": -100}, "mechanical": {"spring_rate_n_mm": 3.0, "preload_n": 1.0, "separation_velocity_m_s": 0.5, "deployment_energy_mj": 50}, "interface": {"type": "compression_spring", "standard": "CDS_separation_spring"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 15.0, "lead_time_days": 14, "common_suppliers": ["Lee Spring", "custom"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'separation_spring';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_metal_gears_dc_motor", "density_kg_m3": 2500, "typical_mass_g": 55.0}, "electrical": {"voltage_nom_v": 6.0, "voltage_range_v": [4.8, 7.2], "current_idle_a": 0.01, "current_stall_a": 1.5, "power_w": 9.0}, "thermal": {"max_temp_c": 55, "min_temp_c": -10}, "mechanical": {"torque_nm_4_8v": 0.92, "torque_nm_6v": 1.12, "speed_deg_s_4_8v": 300, "speed_deg_s_6v": 375, "rotation_deg": 180, "gear_type": "metal", "dead_band_us": 2}, "interface": {"type": "pwm_servo", "signal": "PWM_50Hz_1000-2000us", "connector": "JR_3pin"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.0, "lead_time_days": 3, "common_suppliers": ["RS", "HobbyKing", "Amazon"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'servo_motor';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_grade_14.9", "density_kg_m3": 7850, "typical_mass_g": 0.3}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"clamping_force_n": 500, "hardness_hrc": "45-53", "point_type": "cup"}, "interface": {"type": "threaded", "thread": "M3x0.5", "drive": "hex_socket", "standard": "ISO_4029"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.03, "lead_time_days": 1, "common_suppliers": ["RS", "Accu", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'set_screw';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_EN8_C40", "density_kg_m3": 7850, "typical_mass_g": 40.0}, "electrical": null, "thermal": {"max_temp_c": 400, "min_temp_c": -40}, "mechanical": {"yield_strength_mpa": 340, "tensile_strength_mpa": 570, "hardness_hrc": "16-22", "surface_finish_ra_um": 0.8, "tolerance": "h6"}, "interface": {"type": "shaft", "keyway": "DIN_6885", "tolerance": "h6"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.5, "lead_time_days": 3, "common_suppliers": ["Metals4U", "Misumi", "Simply Bearings"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'shaft';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_6061_T6", "density_kg_m3": 2700, "typical_mass_g": 35.0}, "electrical": {"isolation_v": 500}, "thermal": {"max_temp_c": 100, "min_temp_c": -30}, "mechanical": {"torque_rating_nm": 3.0, "max_rpm": 8000, "angular_misalignment_deg": 1.0, "parallel_misalignment_mm": 0.2, "axial_misalignment_mm": 0.5, "torsional_stiffness_nm_rad": 200, "spider_material": "polyurethane_92A"}, "interface": {"type": "coupling_jaw", "bore_range_mm": "3-8", "set_screw": "M3"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.0, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Ruland"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'shaft_coupling_jaw';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "bronze_SAE_660", "density_kg_m3": 8800, "typical_mass_g": 8.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40, "pv_limit_mpa_ms": 1.8}, "mechanical": {"static_load_kn": 3.0, "max_speed_ms": 2.0, "friction_coefficient": 0.08}, "interface": {"type": "press_fit", "lubrication": "oil_impregnated"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.5, "lead_time_days": 1, "common_suppliers": ["RS", "Igus", "GGB"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'sleeve_bearing';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "brass_gold_plated_copper_wire", "density_kg_m3": 3000, "typical_mass_g": 5.0}, "electrical": {"frequency_ghz": [0.9, 5.8], "gain_dbi": 2.0, "impedance_ohm": 50, "vswr": 1.5, "polarisation": "linear_vertical", "bandwidth_mhz": 100}, "thermal": {"max_temp_c": 85, "min_temp_c": -40}, "mechanical": {}, "interface": {"type": "sma_male", "connector": "SMA_RP", "torque_nm": 0.9}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.0, "lead_time_days": 3, "common_suppliers": ["TBS", "ImmersionRC", "RS"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'sma_antenna';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_grade_12.9", "density_kg_m3": 7850, "typical_mass_g": 4.5}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"tensile_strength_mpa": 1220, "yield_strength_mpa": 1100, "proof_load_kn": 20.1, "hardness_hrc": "39-44"}, "interface": {"type": "threaded", "thread": "M5x0.8", "drive": "hex_socket", "standard": "ISO_4762"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.05, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'socket_head_cap_screw';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "GaInP_GaAs_Ge_triple_junction", "density_kg_m3": 2500, "typical_mass_g": 45.0}, "electrical": {"voltage_voc_v": 2.7, "voltage_vmp_v": 2.4, "current_isc_a": 0.52, "current_imp_a": 0.5, "power_per_cell_w": 1.2, "cells_series": 6, "panel_power_w": 7.2, "efficiency_percent": 30, "eol_degradation_percent": 15}, "thermal": {"noct_c": 55, "temp_coefficient_pmax_pct_c": -0.2, "operating_range_c": [-100, 100]}, "mechanical": {"radiation_tolerance_krad": 100}, "interface": {"type": "solar_panel", "connector": "micro_D_or_harwin", "bus": "unregulated"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1500.0, "lead_time_days": 60, "common_suppliers": ["ISIS", "DHV", "SpectroLab"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'solar_panel_cubesat';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_copper_coil", "density_kg_m3": 5500, "typical_mass_g": 25.0}, "electrical": {"voltage_nom_v": 12.0, "voltage_range_v": [9, 13.8], "current_a": 0.5, "resistance_ohm": 24, "power_w": 6.0, "duty_cycle_percent": 100}, "thermal": {"max_temp_c": 80, "min_temp_c": -20, "insulation_class": "B"}, "mechanical": {"force_n_0mm": 8.0, "force_n_4mm": 2.5, "stroke_mm": 8.0, "response_time_ms": 15}, "interface": {"type": "electromagnetic_2wire", "driver": "MOSFET_with_flyback_diode"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.0, "lead_time_days": 5, "common_suppliers": ["RS", "Mecalectro"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'solenoid_linear';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_20MnCr5_case_hardened", "density_kg_m3": 7850, "typical_mass_g": 15.0}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"module": 1.0, "pressure_angle_deg": 20, "surface_hardness_hrc": "58-62", "core_hardness_hrc": "30-35", "agma_quality": 8, "tooth_bending_strength_mpa": 250, "contact_stress_mpa": 1200}, "interface": {"type": "gear_mesh", "standard": "ISO_1328", "bore_tolerance": "H7"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 2.5, "lead_time_days": 5, "common_suppliers": ["RS", "Misumi", "HPC Gears"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'spur_gear';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "mild_steel_S235", "density_kg_m3": 7850, "typical_mass_g": 120.0}, "electrical": {"resistivity_ohm_m": 1.6e-07}, "thermal": {"max_temp_c": 400, "min_temp_c": -40, "conductivity_w_mk": 50}, "mechanical": {"yield_strength_mpa": 235, "tensile_strength_mpa": 360, "elastic_modulus_gpa": 200}, "interface": {"type": "tube_square", "standard": "EN_10210"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 3.0, "lead_time_days": 3, "common_suppliers": ["Metals4U", "Aluminiumwarehouse"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'square_tube';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "brass_CZ121", "density_kg_m3": 8500, "typical_mass_g": 2.0}, "electrical": {"resistivity_ohm_m": 6.2e-08}, "thermal": {"max_temp_c": 260, "min_temp_c": -40}, "mechanical": {"thread_standard": "ISO_metric"}, "interface": {"type": "threaded_both_ends", "thread": "M3x0.5"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.1, "lead_time_days": 1, "common_suppliers": ["RS", "Wurth", "Harwin"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'standoff';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_cmos_sensor_glass_optics", "density_kg_m3": 3000, "typical_mass_g": 35.0}, "electrical": {"voltage_v": 5.0, "voltage_range_v": [3.3, 5.5], "current_ma": 200, "power_w": 1.0}, "thermal": {"max_temp_c": 60, "min_temp_c": -30, "detector_dark_current_temp_c": -10}, "mechanical": {"accuracy_arcsec": 10, "update_rate_hz": 5, "fov_deg": 15, "sensitivity_mv": 6.0, "tracking_stars": 20, "lost_in_space_time_s": 3, "stray_light_rejection_deg": 45}, "interface": {"type": "uart_or_i2c", "protocol": "quaternion_output", "mounting": "M2_4bolt"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 5000.0, "lead_time_days": 60, "common_suppliers": ["CubeSpace", "Berlin Space Tech"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'star_tracker';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_copper_neodymium", "density_kg_m3": 5500, "typical_mass_g": 280.0}, "electrical": {"voltage_nom_v": 12.0, "voltage_range_v": [4.5, 48], "current_per_phase_a": 1.7, "phases": 2, "resistance_per_phase_ohm": 1.5, "inductance_per_phase_mh": 2.8, "step_angle_deg": 1.8, "steps_per_rev": 200}, "thermal": {"max_temp_c": 130, "min_temp_c": -20, "insulation_class": "B"}, "mechanical": {"holding_torque_nm": 0.44, "detent_torque_nm": 0.022, "rotor_inertia_gcm2": 54, "shaft_d_mm": 5.0, "max_rpm": 1000}, "interface": {"type": "stepper_bipolar", "connector": "JST_XH_4pin", "mounting": "NEMA17_M3_31mm"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 8.0, "lead_time_days": 3, "common_suppliers": ["RS", "StepperOnline", "OMC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'stepper_motor_nema';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "EPS_with_polymer_basecoat", "density_kg_m3": 25, "typical_mass_g": 300.0}, "electrical": null, "thermal": {"conductivity_w_mk": 0.035, "max_temp_c": 80, "min_temp_c": -40}, "mechanical": {"compressive_strength_kpa": 70, "bond_strength_kpa": 80}, "interface": {"type": "facade_panel", "adhesive": "polymer_modified_mortar"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 6.0, "lead_time_days": 7, "common_suppliers": ["EPS Facades", "SPS Envirowall"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'surface_texture_panel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_zinc_plated", "density_kg_m3": 7850, "typical_mass_g": 2.5}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"thread_strip_force_n": 3000}, "interface": {"type": "t_nut", "thread": "M5x0.8", "slot_width_mm": 6}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.08, "lead_time_days": 1, "common_suppliers": ["Ooznest", "OpenBuilds", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 't_nut';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_stainless_contacts", "density_kg_m3": 2000, "typical_mass_g": 0.5}, "electrical": {"voltage_max_v": 12.0, "current_max_a": 0.05, "contact_resistance_mohm": 100, "bounce_ms": 5, "insulation_resistance_mohm": 100}, "thermal": {"max_temp_c": 70, "min_temp_c": -20}, "mechanical": {"actuation_force_gf": 160, "travel_mm": 0.25, "lifecycle_presses": 100000, "tactile_feel": true}, "interface": {"type": "momentary_spst", "mounting": "through_hole", "pitch_mm": 6.5}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.05, "lead_time_days": 3, "common_suppliers": ["RS", "Omron", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'tactile_switch';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "nylon_PA66_brass_contacts", "density_kg_m3": 2000, "typical_mass_g": 5.0}, "electrical": {"voltage_max_v": 300, "current_max_a": 15, "wire_gauge_awg": "12-24", "contact_resistance_mohm": 10, "creepage_mm": 5.0}, "thermal": {"max_temp_c": 105, "min_temp_c": -40}, "mechanical": {"screw_torque_nm": 0.5, "strip_length_mm": 7}, "interface": {"type": "screw_terminal", "pitch_mm": 5.08, "mounting": "pcb_through_hole"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.2, "lead_time_days": 3, "common_suppliers": ["RS", "Phoenix Contact", "Wago"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'terminal_block';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_grade_4.8", "density_kg_m3": 7850, "typical_mass_g": 32.0}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"tensile_strength_mpa": 420, "yield_strength_mpa": 340, "proof_load_kn": 14.1}, "interface": {"type": "threaded", "thread": "M8x1.25", "standard": "DIN_976"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.5, "lead_time_days": 1, "common_suppliers": ["RS", "Screwfix", "Metals4U"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'threaded_rod';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "bronze_SAE_841", "density_kg_m3": 6800, "typical_mass_g": 4.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40, "pv_limit_mpa_ms": 1.8}, "mechanical": {"static_load_kn": 5.0, "friction_coefficient": 0.06, "max_speed_ms": 2.0}, "interface": {"type": "thrust_bearing", "lubrication": "oil_impregnated"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.3, "lead_time_days": 3, "common_suppliers": ["RS", "Igus"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'thrust_washer';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_6061_T6", "density_kg_m3": 2700, "typical_mass_g": 8.0}, "electrical": null, "thermal": {"max_temp_c": 120, "min_temp_c": -40}, "mechanical": {"belt_profile": "GT2", "pitch_mm": 2.0, "max_belt_tension_n": 50, "max_rpm": 12000}, "interface": {"type": "belt_drive", "belt_width_mm": 6, "set_screw": "M3"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.8, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Gates"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'timing_pulley';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "music_wire_ASTM_A228", "density_kg_m3": 7850, "typical_mass_g": 2.0}, "electrical": null, "thermal": {"max_temp_c": 200, "min_temp_c": -40}, "mechanical": {"spring_rate_nmm_deg": 0.15, "max_angle_deg": 90, "max_torque_nmm": 13.5}, "interface": {"type": "torsion", "leg_type": "straight"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.2, "lead_time_days": 5, "common_suppliers": ["RS", "Lee Spring"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'torsion_spring';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "stainless_steel_shell_lcp_body", "density_kg_m3": 2500, "typical_mass_g": 1.5}, "electrical": {"voltage_max_v": 20.0, "current_max_a": 5.0, "power_max_w": 100.0, "data_rate_gbps": 10.0, "contact_resistance_mohm": 30, "insulation_resistance_mohm": 100, "pins": 24}, "thermal": {"max_temp_c": 85, "min_temp_c": -40}, "mechanical": {"mating_cycles": 10000, "insertion_force_n": 8.0, "retention_force_n": 5.0}, "interface": {"type": "usb_type_c", "standard": "USB_3.1", "protocol": ["USB_PD", "USB_3.x", "DP_Alt"]}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.3, "lead_time_days": 5, "common_suppliers": ["Molex", "TE", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'usb_c_receptacle';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "aluminium_powder_coated", "density_kg_m3": 2700, "typical_mass_g": 200.0}, "electrical": null, "thermal": {"max_temp_c": 100, "min_temp_c": -20}, "mechanical": {"free_area_percent": 45, "blade_angle_deg": 30, "air_velocity_max_ms": 5}, "interface": {"type": "panel_mount", "sealing": "rubber_gasket"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 5.0, "lead_time_days": 5, "common_suppliers": ["Vent-Axia", "Manrose"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'ventilation_louvre';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "HDPE_food_safe", "density_kg_m3": 960, "typical_mass_g": 600.0}, "electrical": null, "thermal": {"max_temp_c": 60, "min_temp_c": 2}, "mechanical": {"pockets_per_section": 6, "stack_max": 8, "water_flow_lpm": 3}, "interface": {"type": "stack", "joint": "male_female_lip", "irrigation": "top_drip"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 4.0, "lead_time_days": 7, "common_suppliers": ["Mr. Stacky"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'vertical_tower_section';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "FR4_pcb_aluminium_electrolytic", "density_kg_m3": 2500, "typical_mass_g": 15.0}, "electrical": {"input_voltage_range_v": [4.5, 40], "output_voltage_range_v": [1.23, 37], "output_current_max_a": 3.0, "efficiency_percent": 92, "ripple_mv": 30, "line_regulation_percent": 0.5, "load_regulation_percent": 0.5, "switching_frequency_khz": 150}, "thermal": {"max_temp_c": 85, "min_temp_c": -40, "thermal_shutdown_c": 150}, "mechanical": {}, "interface": {"type": "dc_dc_buck", "adjustment": "potentiometer", "terminals": "screw"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 1.5, "lead_time_days": 3, "common_suppliers": ["RS", "Amazon", "LCSC"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'voltage_regulator_module';

UPDATE component_geometry_types SET
  physical_properties = '{"mass": {"material": "steel_zinc_plated", "density_kg_m3": 7850, "typical_mass_g": 1.5}, "electrical": null, "thermal": {"max_temp_c": 300, "min_temp_c": -40}, "mechanical": {"hardness_hv": "140-210", "load_capacity_kn": 8.0}, "interface": {"type": "washer", "standard": "ISO_7089"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp": 0.01, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'washer';

