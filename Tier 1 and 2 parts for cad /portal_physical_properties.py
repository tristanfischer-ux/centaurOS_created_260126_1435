"""
ForgeOS — Portal Frame Building Physical Properties
=====================================================
UK steel construction per SCI P252, BS EN 1993-1-1, BCSA Blue Book.
"""

PORTAL_PHYSICAL_PROPERTIES = {

    "portal_rafter": {
        "mass": {"material": "S355_JR_hot_rolled_UKB", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"305x165x40": 40, "356x171x51": 51, "406x178x60": 60,
                                   "457x191x67": 67, "533x210x82": 82, "610x229x101": 101}},
        "electrical": None,
        "thermal": {"fire_protection": {"intumescent_paint_30min": True, "board_60min": True}},
        "mechanical": {
            "yield_strength_mpa": 355, "tensile_strength_mpa": 510,
            "moment_capacity_knm": {"457x191x67": 412, "533x210x82": 590, "610x229x101": 850},
            "plastic_modulus_cm3": {"457x191x67": 1300, "533x210x82": 1800, "610x229x101": 2510},
            "section_class": "Class_1_plastic",
            "lateral_torsional_buckling": "restrained_by_purlins",
        },
        "interface": {"connection_eaves": "extended_end_plate_moment", "connection_apex": "flush_end_plate",
                      "purlin_fix": "cleat_bolted_M16", "standard": "BS_EN_1993_1_1_EC3"},
        "procurement": {"typical_unit_cost_gbp_per_tonne": 1200.00, "lead_time_days": {"stock": 5, "fabricated": 28},
                        "common_suppliers": ["British Steel", "ArcelorMittal", "Tata Steel"]},
    },

    "portal_column": {
        "mass": {"material": "S355_JR_hot_rolled_UKB", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"305x165x40": 40, "356x171x51": 51, "406x178x60": 60, "457x191x67": 67}},
        "electrical": None,
        "thermal": {"fire_protection": {"intumescent_30min": True, "board_60min": True}},
        "mechanical": {
            "yield_strength_mpa": 355,
            "axial_capacity_kn": {"457x191x67_6m": 1800},
            "stability": "in_plane_sway_out_of_plane_braced",
        },
        "interface": {"base": "nominally_pinned_or_fixed", "rafter": "moment_connection_haunch"},
        "procurement": {"typical_unit_cost_gbp_per_tonne": 1200.00, "lead_time_days": 28,
                        "common_suppliers": ["Severfield", "William Hare", "Billington"]},
    },

    "base_plate": {
        "mass": {"material": "S275_plate", "density_kg_m3": 7850,
                 "typical_mass_kg": {"pinned_4bolt": 12, "fixed_6bolt": 25}},
        "electrical": None,
        "thermal": {},
        "mechanical": {
            "plate_thickness_mm": [20, 25, 30, 40, 50],
            "concrete_bearing_strength_mpa": {"C30_37": 15, "C40_50": 20},
            "base_type": ["nominally_pinned", "moment_resisting"],
        },
        "interface": {"holding_down": "M16_M20_M24_M30_grade_8.8", "grout": "non_shrink_25mm_50mm",
                      "foundation": "pad_or_strip_footing"},
        "procurement": {"typical_unit_cost_gbp": 40.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "eaves_haunch": {
        "mass": {"material": "S355_cut_from_parent_UKB_section", "density_kg_m3": 7850,
                 "typical_mass_kg": {"457_haunch_1.5m": 70, "533_haunch_2m": 120}},
        "electrical": None,
        "thermal": {},
        "mechanical": {
            "haunch_length": "typically_10pct_of_span",
            "depth_at_column": "1.5_to_2x_rafter_depth",
            "design_per": "SCI_P252_appendix",
        },
        "interface": {"rafter_weld": "fillet_weld_to_rafter", "column_connection": "extended_end_plate_bolted"},
        "procurement": {"typical_unit_cost_gbp": 60.00, "lead_time_days": 21,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "apex_bracket": {
        "mass": {"material": "S275_plate", "density_kg_m3": 7850, "typical_mass_kg": 8},
        "electrical": None, "thermal": {},
        "mechanical": {"bolt_grade": "8.8", "bolt_size": ["M20", "M24"],
                       "design": "SCI_P252_flush_or_extended_end_plate"},
        "interface": {"bolts": "preloaded_or_non_preloaded"},
        "procurement": {"typical_unit_cost_gbp": 25.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "crane_beam": {
        "mass": {"material": "S355_UKB_plus_surge_plate_plus_rail", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"610x229x101_compound": 130}},
        "electrical": {"crane_supply": "busbar_or_festoon_415V_3ph"},
        "thermal": {},
        "mechanical": {
            "crane_capacity_t": [5, 10, 20, 40],
            "crane_class": {"light": "S3_HC3", "medium": "S5_HC3", "heavy": "S7_HC4"},
            "design_per": "BS_EN_1993_6_crane_supporting_structures",
            "fatigue_assessment": "required_BS_EN_1993_1_9",
            "deflection_limit": "span_over_600",
        },
        "interface": {"column_bracket": "bolted_welded", "rail": "crane_rail_A45_A65_A100",
                      "rail_clip": "Gantrex_or_similar"},
        "procurement": {"typical_unit_cost_gbp_per_tonne": 1800.00, "lead_time_days": 42,
                        "common_suppliers": ["Severfield", "William Hare"]},
    },

    "purlin_zed": {
        "mass": {"material": "S390_cold_formed_galvanised_Z275", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"142_15": 2.8, "172_15": 3.4, "202_15": 3.8, "232_20": 5.8, "262_20": 6.5}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "span_m": {"single": [4, 8], "double_sleeved": [6, 12]},
            "load_capacity_kn_m": {"202x1.5_6m": 2.5, "232x2.0_7m": 3.8},
            "design_per": "BS_EN_1993_1_3",
        },
        "interface": {"fix_to_rafter": "M16_bolt_through_cleat", "sleeve": "sleeved_at_internal_supports",
                      "sag_rod": "M12_at_mid_span_for_deep_purlins"},
        "procurement": {"typical_unit_cost_gbp_per_m": 6.00, "lead_time_days": 7,
                        "common_suppliers": ["Metsec", "Albion Sections", "voestalpine", "Steadmans"]},
    },

    "side_rail": {
        "mass": {"material": "S390_cold_formed_galvanised_Z275", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"142_12": 2.2, "172_15": 3.4, "202_15": 3.8}},
        "electrical": None, "thermal": {},
        "mechanical": {"span_m": [5, 8], "wind_suction_kn_m2": [0.5, 1.2]},
        "interface": {"fix_to_column": "M12_cleat_bolted"},
        "procurement": {"typical_unit_cost_gbp_per_m": 5.00, "lead_time_days": 7,
                        "common_suppliers": ["Metsec", "Albion Sections"]},
    },

    "eaves_beam": {
        "mass": {"material": "S275_PFC_hot_rolled", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"230x90_PFC": 32, "260x90_PFC": 35}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "longitudinal_stability_and_gutter_support"},
        "interface": {"fix": "bolted_to_column_cap_plate"},
        "procurement": {"typical_unit_cost_gbp_per_m": 40.00, "lead_time_days": 14,
                        "common_suppliers": ["Stock_section"]},
    },

    "cross_bracing": {
        "mass": {"material": "S275_flat_bar_or_CHS", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"60x10_flat": 4.7, "M20_rod": 2.5, "60.3x3.2_CHS": 4.5}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "type": ["flat_bar", "angle", "CHS", "rod"],
            "function": "longitudinal_stability_wind_bracing",
            "design": "tension_only_or_compression_strut",
        },
        "interface": {"gusset": "welded_gusset_plate_M16_M20_bolts"},
        "procurement": {"typical_unit_cost_gbp": 200.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "gable_post": {
        "mass": {"material": "S355_UC_hot_rolled", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"152x152x23": 23, "203x203x46": 46}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "supports_gable_side_rails_and_wind_load",
                       "design": "propped_cantilever_or_simply_supported"},
        "interface": {"base": "pinned_base_plate", "top": "slotted_connection_to_rafter_allows_deflection"},
        "procurement": {"typical_unit_cost_gbp_per_tonne": 1200.00, "lead_time_days": 14,
                        "common_suppliers": ["Stock_section"]},
    },

    "sag_rod": {
        "mass": {"material": "S275_round_bar_threaded", "density_kg_m3": 7850,
                 "typical_mass_kg_per_m": {"M12": 0.89, "M16": 1.58}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "prevents_lateral_sag_of_purlins",
                       "spacing": "mid_span_for_spans_over_6m"},
        "interface": {"fix": "threaded_through_purlin_web_with_nuts"},
        "procurement": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 3,
                        "common_suppliers": ["Stock_item"]},
    },

    "end_plate_connection": {
        "mass": {"material": "S275_plate", "density_kg_m3": 7850,
                 "typical_mass_kg": {"flush_457": 10, "extended_457": 15, "extended_533": 20}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "bolt_grade": "8.8",
            "bolt_size": ["M20", "M24"],
            "moment_capacity_knm": {"6xM24_extended": 450, "8xM24_extended": 650},
            "design_per": "SCI_P398_Joints_in_Steel_Construction",
        },
        "interface": {"weld": "fillet_weld_to_beam_flanges_and_web"},
        "procurement": {"typical_unit_cost_gbp": 30.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "fin_plate": {
        "mass": {"material": "S275_plate", "density_kg_m3": 7850, "typical_mass_kg": 3},
        "electrical": None, "thermal": {},
        "mechanical": {
            "shear_capacity_kn": {"3xM20": 220, "4xM20": 300},
            "design": "SCI_P358_simple_connections",
        },
        "interface": {"weld": "fillet_weld_to_column_or_beam_web", "bolts": "M16_M20_non_preloaded"},
        "procurement": {"typical_unit_cost_gbp": 12.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "splice_plate": {
        "mass": {"material": "S275_plate", "density_kg_m3": 7850, "typical_mass_kg": 8},
        "electrical": None, "thermal": {},
        "mechanical": {"design": "moment_and_shear_splice_SCI_P398", "bolt_grade": "8.8"},
        "interface": {"bolts": "preloaded_HSFG_or_non_preloaded"},
        "procurement": {"typical_unit_cost_gbp": 20.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "holding_down_bolt": {
        "mass": {"material": "grade_8.8_galvanised", "density_kg_m3": 7850,
                 "typical_mass_kg": {"M16x300": 0.5, "M20x375": 0.9, "M24x450": 1.5, "M30x600": 3.0}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "type": ["cast_in_L_bolt", "cast_in_J_bolt", "post_fixed_anchor"],
            "tension_capacity_kn": {"M16_8.8": 88, "M20_8.8": 137, "M24_8.8": 198, "M30_8.8": 314},
            "embedment": "15x_bolt_diameter_minimum",
            "concrete_cone_breakout": "check_per_BS_EN_1992_4",
        },
        "interface": {"grout": "non_shrink_cementitious", "template": "required_for_accuracy"},
        "procurement": {"typical_unit_cost_gbp": 5.00, "lead_time_days": 3,
                        "common_suppliers": ["Ancon", "Halfen", "Lindapter"]},
    },

    "purlin_cleat": {
        "mass": {"material": "S275_angle_or_plate", "density_kg_m3": 7850, "typical_mass_kg": 1.5},
        "electrical": None, "thermal": {},
        "mechanical": {"fix": "2xM16_to_rafter_web", "purlin_fix": "2xM16_through_purlin"},
        "interface": {"weld": "shop_welded_to_rafter_or_site_bolted"},
        "procurement": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_supply"]},
    },

    "profiled_roof_sheet": {
        "mass": {"material": "galvanised_steel_0.5_0.7mm_polyester_or_plastisol_coat", "density_kg_m3": 7850,
                 "mass_per_m2_kg": {"0.5mm": 4.5, "0.7mm": 6.0}},
        "electrical": None,
        "thermal": {"u_value_composite_w_m2k": {"with_100mm_mineral_wool": 0.35}},
        "mechanical": {
            "profile": {"TR32_1000": "32mm_rib_1000mm_cover", "TR35_1000": "35mm_rib_1000mm_cover"},
            "span_m": {"0.5mm_single": [1.5, 2.0], "0.7mm_single": [2.0, 2.5]},
            "wind_uplift_kn_m2": [1.0, 2.0],
        },
        "interface": {"fix": "tek_screw_5.5_or_6.3mm_with_EPDM_washer", "lap": "one_corrugation_side_150mm_end"},
        "procurement": {"typical_unit_cost_gbp_per_m2": 8.00, "lead_time_days": 7,
                        "common_suppliers": ["Tata Steel", "Kingspan", "Corus", "Steadmans"]},
    },

    "composite_panel": {
        "mass": {"material": "steel_skins_PIR_or_mineral_wool_core", "density_kg_m3": None,
                 "mass_per_m2_kg": {"40mm_PIR": 9, "60mm_PIR": 10, "80mm_PIR": 11, "100mm_PIR": 12, "120mm_MW": 18}},
        "electrical": None,
        "thermal": {
            "u_value_w_m2k": {"40mm_PIR": 0.50, "60mm_PIR": 0.35, "80mm_PIR": 0.27,
                              "100mm_PIR": 0.22, "120mm_MW": 0.27},
            "fire_rating": {"PIR": "LPS_1181_FM_approved", "mineral_wool": "A1_non_combustible_BS_EN_13501"},
        },
        "mechanical": {
            "span_m": {"wall_80mm": [4, 6], "roof_100mm": [3, 5]},
            "secret_fix": True,
            "joint": "tongue_and_groove_weathertight",
        },
        "interface": {"fix_to_rail": "through_fix_or_secret_fix_bracket", "seal": "factory_applied_mastic"},
        "procurement": {"typical_unit_cost_gbp_per_m2": 30.00, "lead_time_days": 21,
                        "common_suppliers": ["Kingspan", "Tata Steel", "Euroclad", "CA Group"]},
    },

    "rooflight_panel": {
        "mass": {"material": "GRP_glass_reinforced_polyester_3_layer", "density_kg_m3": 1800,
                 "mass_per_m2_kg": 3.5},
        "electrical": None,
        "thermal": {"u_value_w_m2k": {"single_skin": 5.0, "triple_skin": 2.5},
                    "light_transmission_pct": [55, 70]},
        "mechanical": {
            "profile": "matched_to_metal_roof_sheet",
            "class_fragility": {"new": "Class_B_non_fragile_ACR_CP001", "aged": "may_degrade_to_class_C"},
            "fire_rating": "BS_476_ext_SAA_or_ext_FAA",
        },
        "interface": {"fix": "same_as_metal_sheet", "max_area_pct": "15pct_of_roof_area_typical"},
        "procurement": {"typical_unit_cost_gbp_per_m2": 15.00, "lead_time_days": 7,
                        "common_suppliers": ["Brett Martin", "Ariel Plastics", "Filon"]},
    },

    "ridge_flashing": {
        "mass": {"material": "galvanised_steel_0.7mm_plastisol_coated", "density_kg_m3": 7850,
                 "mass_per_m_kg": 2.5},
        "electrical": None, "thermal": {},
        "mechanical": {"girth_mm": [350, 450, 600]},
        "interface": {"fix": "tek_screw_to_sheet_crest_at_450mm_centres", "foam_filler": "profile_matched"},
        "procurement": {"typical_unit_cost_gbp_per_m": 5.00, "lead_time_days": 5,
                        "common_suppliers": ["Same_as_cladding_supplier"]},
    },

    "roller_shutter_door": {
        "mass": {"material": "galvanised_steel_slats_0.6_0.8mm", "density_kg_m3": None,
                 "typical_mass_kg": {"4x4.5m_single_skin": 200, "5x5m_insulated": 350}},
        "electrical": {"voltage_v": 240, "motor_power_w": [370, 750, 1100],
                       "control": "key_switch_remote_or_pull_chain"},
        "thermal": {"u_value_w_m2k": {"single_skin": 7.0, "insulated_double": 2.5}},
        "mechanical": {
            "wind_rating_class": {"1": "to_600Pa", "2": "to_1200Pa", "3": "to_2000Pa"},
            "cycle_rating": {"standard": 25000, "high_usage": 200000},
            "opening_speed_m_s": [0.15, 0.3],
            "security": "LPS_1175_SR1_to_SR4",
        },
        "interface": {"guides": "galvanised_steel_U_channel", "lintel": "structural_steel_or_RC",
                      "power": "13A_or_hardwired"},
        "procurement": {"typical_unit_cost_gbp": 2000.00, "lead_time_days": 28,
                        "common_suppliers": ["Hormann", "SWS", "Gliderol", "Aluroll"]},
    },

    "sectional_overhead_door": {
        "mass": {"material": "galvanised_steel_skins_PU_foam_insulated_42mm", "density_kg_m3": None,
                 "typical_mass_kg": {"4x4.2m": 250}},
        "electrical": {"voltage_v": 240, "motor_power_w": [550, 750], "control": "remote_keypad_loop"},
        "thermal": {"u_value_w_m2k": {"42mm_panel": 1.2, "67mm_panel": 0.8}},
        "mechanical": {
            "wind_rating_kpa": [1.0, 2.0],
            "cycle_rating": {"standard": 25000, "high_usage": 100000},
            "spring_type": "torsion_spring_above_opening",
        },
        "interface": {"headroom_mm": {"standard_lift": 350, "low_headroom": 200},
                      "side_room_mm": 120},
        "procurement": {"typical_unit_cost_gbp": 2500.00, "lead_time_days": 28,
                        "common_suppliers": ["Hormann", "Novoferm", "Garador", "Teckentrup"]},
    },

    "personnel_door_steel": {
        "mass": {"material": "galvanised_steel_skin_PU_foam_core", "density_kg_m3": None,
                 "typical_mass_kg": 40},
        "electrical": None,
        "thermal": {"u_value_w_m2k": 1.5},
        "mechanical": {
            "security": "PAS_24_or_LPS_1175",
            "fire_rating": {"FD30": 30, "FD60": 60, "FD120": 120},
            "panic_hardware": "BS_EN_1125_push_bar_or_BS_EN_179_lever",
        },
        "interface": {"frame": "pressed_steel_sub_frame", "closer": "overhead_door_closer_BS_EN_1154"},
        "procurement": {"typical_unit_cost_gbp": 500.00, "lead_time_days": 14,
                        "common_suppliers": ["Metador", "Sureclose", "Lathams"]},
    },

    "valley_gutter": {
        "mass": {"material": "galvanised_steel_1.5_2.0mm_or_GRP_lined", "density_kg_m3": 7850,
                 "mass_per_m_kg": {"600mm_1.5mm_steel": 14}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "design_rainfall_mm_hr": 75,
            "fall_mm_per_m": [1, 3],
            "overflow": "required_BS_EN_12056_3",
            "width_mm": [450, 600, 750, 900],
        },
        "interface": {"support": "valley_beam_or_rafter_connection", "outlet": "100mm_150mm_round"},
        "procurement": {"typical_unit_cost_gbp_per_m": 40.00, "lead_time_days": 14,
                        "common_suppliers": ["Fabricator_or_specialist"]},
    },

    "industrial_downpipe": {
        "mass": {"material": "galvanised_steel_or_aluminium", "density_kg_m3": None,
                 "mass_per_m_kg": {"75mm_steel": 3, "100mm_steel": 4.5, "150mm_steel": 7}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "flow_capacity_lps": {"75mm": 3.5, "100mm": 7.5, "150mm": 20},
            "bracket_spacing_m": [2, 3],
        },
        "interface": {"connection": "spigot_and_socket_or_ring_seal", "outlet": "shoe_or_into_drain"},
        "procurement": {"typical_unit_cost_gbp_per_m": 15.00, "lead_time_days": 7,
                        "common_suppliers": ["Lindab", "Alumasc", "Hargreaves"]},
    },

    "tek_screw": {
        "mass": {"material": "carbon_steel_zinc_plated_or_stainless_A2_A4", "density_kg_m3": 7850,
                 "mass_per_screw_g": {"5.5x32": 5, "5.5x55": 8, "5.5x65": 10, "6.3x85": 16}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "pull_out_kn": {"into_1.5mm_steel": 3.5, "into_2.0mm_steel": 5.0},
            "pull_over_kn": {"16mm_washer": 2.5},
            "shear_kn": {"5.5mm": 3.0, "6.3mm": 4.5},
            "washer": "16mm_EPDM_bonded_stainless_cap",
            "drill_capacity_mm": {"5.5_light": [0.9, 5.0], "6.3_heavy": [1.5, 12.5]},
        },
        "interface": {"drive": "hex_8mm_or_10mm", "spacing_mm": {"crest_fix": 300, "trough_fix": 200}},
        "procurement": {"typical_unit_cost_gbp_per_100": 8.00, "lead_time_days": 1,
                        "common_suppliers": ["SFS", "Ejot", "BDN Fasteners", "Swagefast"]},
    },

    "smoke_vent": {
        "mass": {"material": "aluminium_frame_polycarbonate_dome_or_flat_glass", "density_kg_m3": None,
                 "typical_mass_kg": {"1.2x1.2m": 45, "1.5x1.5m": 60, "2.0x2.0m": 80}},
        "electrical": {"voltage_v": 240, "actuator": "pneumatic_CO2_or_electric_24V",
                       "fusible_link_temp_c": 68, "control_panel": "BS_EN_12101_2_compliant"},
        "thermal": {"u_value_w_m2k": {"polycarbonate_triple": 1.8, "flat_glass_double": 1.4}},
        "mechanical": {
            "aerodynamic_free_area_m2": {"1.2x1.2m": 1.0, "1.5x1.5m": 1.6, "2.0x2.0m": 2.8},
            "opening_angle_deg": [140, 160],
            "wind_uplift_kpa": 2.0,
            "opening_time_s": {"pneumatic": 60, "electric": 120},
            "design_standard": "BS_EN_12101_2_SHEVS",
            "class": "SL500_or_SL750_snow_load",
        },
        "interface": {"kerb": "GRP_or_aluminium_upstand_min_150mm", "fire_alarm": "linked_to_panel_zone_input",
                      "roof_opening": "builder_work_opening_with_kerb"},
        "procurement": {"typical_unit_cost_gbp": 1500.00, "lead_time_days": 28,
                        "common_suppliers": ["Bilco", "Colt", "Xtralite", "Jet Cox"]},
    },
}
