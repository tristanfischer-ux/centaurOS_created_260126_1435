"""
ForgeOS — UK House Component Physical Properties
==================================================
Engineering data for all 37 residential building components.
UK standards (Building Regs Part L/F/B, BS EN, FENSA, HETAS, Gas Safe).
"""

HOUSE_PHYSICAL_PROPERTIES = {

    # ═══ KITCHEN ═══

    "kitchen_base_cabinet": {
        "mass": {"material": "16_18mm_melamine_chipboard_carcass_MDF_door", "density_kg_m3": 650,
                 "typical_mass_kg": {"300mm": 12, "500mm": 18, "600mm": 20, "800mm": 26, "1000mm": 32}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 40]},
        "mechanical": {
            "shelf_load_kg": 25,
            "hinge_type": "110_deg_soft_close_clip_on",
            "hinge_cycles": 80000,
            "drawer_runner": "full_extension_ball_bearing_30kg",
        },
        "interface": {"carcass_connection": "cam_and_dowel_or_confirmat", "wall_fix": "L_bracket_to_rail",
                      "plinth": "150mm_clip_on", "worktop_fix": "corner_bracket_from_below"},
        "procurement": {"typical_unit_cost_gbp": 80.00, "lead_time_days": 14,
                        "common_suppliers": ["Howdens", "Wickes", "Wren", "DIY Kitchens", "Ikea"]},
    },

    "kitchen_wall_cabinet": {
        "mass": {"material": "16_18mm_melamine_chipboard", "density_kg_m3": 650,
                 "typical_mass_kg": {"300mm": 8, "500mm": 12, "600mm": 14}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 40]},
        "mechanical": {"shelf_load_kg": 15, "wall_bracket_load_kg": 50, "hinge_type": "soft_close"},
        "interface": {"wall_fix": "cabinet_hanger_bracket_or_rail", "wall_type": "masonry_or_stud"},
        "procurement": {"typical_unit_cost_gbp": 60.00, "lead_time_days": 14,
                        "common_suppliers": ["Howdens", "Wickes", "Wren", "DIY Kitchens"]},
    },

    "kitchen_tall_cabinet": {
        "mass": {"material": "18mm_melamine_chipboard", "density_kg_m3": 650,
                 "typical_mass_kg": {"600mm_larder": 45, "600mm_oven_housing": 40}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 40]},
        "mechanical": {"shelf_load_kg": 20, "hinge_type": "170_deg_soft_close"},
        "interface": {"wall_fix": "L_bracket_top_and_mid", "plinth": "150mm_clip_on"},
        "procurement": {"typical_unit_cost_gbp": 150.00, "lead_time_days": 14,
                        "common_suppliers": ["Howdens", "Wickes", "Wren"]},
    },

    "kitchen_worktop": {
        "mass": {"material": {"laminate": {"density_kg_m3": 700, "mass_per_m_kg": 17},
                              "quartz": {"density_kg_m3": 2400, "mass_per_m_kg": 60},
                              "granite": {"density_kg_m3": 2700, "mass_per_m_kg": 67},
                              "solid_surface": {"density_kg_m3": 1700, "mass_per_m_kg": 42}}},
        "electrical": None,
        "thermal": {"max_surface_temp_c": {"laminate": 180, "quartz": 150, "granite": 300}},
        "mechanical": {
            "thickness_mm": {"laminate": [28, 38, 40], "quartz": [20, 30], "granite": [20, 30]},
            "impact_resistance": {"laminate": "moderate", "quartz": "high", "granite": "high"},
            "scratch_resistance_mohs": {"laminate": 3, "quartz": 7, "granite": 6},
        },
        "interface": {"joint": "mason_mitre_or_butt_with_bolts", "upstand": "matching_or_tile",
                      "overhang_front_mm": 25, "overhang_end_mm": 25},
        "procurement": {"typical_unit_cost_gbp_per_m": {"laminate": 30, "quartz": 200, "granite": 250},
                        "lead_time_days": {"laminate": 7, "quartz": 21, "granite": 28},
                        "common_suppliers": ["Howdens", "Worktop Express", "Caesarstone", "Silestone"]},
    },

    "kitchen_sink_belfast": {
        "mass": {"material": "fireclay_ceramic", "density_kg_m3": 2300,
                 "typical_mass_kg": {"single_600mm": 30, "double_800mm": 45}},
        "electrical": None,
        "thermal": {"max_temp_c": 280, "thermal_shock_resistant": True},
        "mechanical": {"hardness_mohs": 7, "chip_resistance": "high"},
        "interface": {"waste": "90mm_basket_strainer_BSP", "overflow": "integrated_slot",
                      "tap_holes": "drilled_in_worktop_not_sink", "mounting": "undermount_or_sit_on"},
        "procurement": {"typical_unit_cost_gbp": 200.00, "lead_time_days": 7,
                        "common_suppliers": ["RAK", "Rangemaster", "Shaws", "Villeroy & Boch"]},
    },

    "kitchen_mixer_tap": {
        "mass": {"material": "brass_body_chrome_finish", "density_kg_m3": 8500,
                 "typical_mass_g": {"standard_mono": 800, "pull_out_spray": 1200, "boiling_water": 2500}},
        "electrical": {"boiling_water_tap_w": 1500, "voltage_v": 240},
        "thermal": {"max_water_temp_c": {"standard": 65, "boiling": 100}},
        "mechanical": {
            "flow_rate_lpm": {"standard": 8, "eco": 5},
            "cartridge": "35mm_or_40mm_ceramic_disc",
            "operating_pressure_bar": [0.5, 5.0],
            "lifecycle_operations": 500000,
        },
        "interface": {"connection": "15mm_flexible_tails_G3_8", "hole_diameter_mm": 35,
                      "deck_thickness_mm": [5, 45]},
        "procurement": {"typical_unit_cost_gbp": 80.00, "lead_time_days": 5,
                        "common_suppliers": ["Grohe", "Bristan", "Franke", "Quooker"]},
    },

    "induction_hob": {
        "mass": {"material": "vitroceramic_glass_top_copper_coils_steel_housing", "density_kg_m3": None,
                 "typical_mass_kg": {"60cm_4zone": 10, "80cm_5zone": 13}},
        "electrical": {
            "voltage_v": 240,
            "connection": "hardwired_30A_or_32A",
            "power_total_w": {"4_zone": 7200, "5_zone": 11000},
            "power_per_zone_w": {"small": 1200, "medium": 1800, "large": 2200, "boost": 3700},
            "energy_rating": "A+",
            "standby_w": 0.5,
        },
        "thermal": {"operating_temp_c": [10, 40], "glass_surface_max_c": 90},
        "mechanical": {"glass_type": "SCHOTT_CERAN", "cutout_mm": {"60cm": "560x490", "80cm": "750x490"}},
        "interface": {"power": "hardwired_6mm2_cable_30A_MCB", "controls": "touch_slider_9_levels"},
        "procurement": {"typical_unit_cost_gbp": 300.00, "lead_time_days": 5,
                        "common_suppliers": ["Bosch", "Neff", "AEG", "Siemens", "Samsung"]},
    },

    "built_in_oven": {
        "mass": {"material": "steel_housing_enamel_liner_glass_door", "density_kg_m3": None,
                 "typical_mass_kg": 30},
        "electrical": {
            "voltage_v": 240, "connection": "hardwired_or_13A_plug",
            "power_w": {"single": 3000, "double": 5000}, "energy_rating": "A+",
        },
        "thermal": {
            "max_temp_c": 275, "max_temp_pyrolytic_c": 480,
            "door_layers": {"double_glazed": 2, "triple_glazed": 3, "quad_glazed": 4},
            "cool_door_temp_c": 30,
        },
        "mechanical": {"cavity_volume_l": {"single": 65, "double_upper": 35, "double_lower": 65},
                       "cutout_mm": "560x560x550"},
        "interface": {"power": "hardwired_or_13A_fused_spur", "shelf_runners": "telescopic"},
        "procurement": {"typical_unit_cost_gbp": 300.00, "lead_time_days": 5,
                        "common_suppliers": ["Bosch", "Neff", "AEG", "Hotpoint", "Rangemaster"]},
    },

    "extractor_hood": {
        "mass": {"material": "stainless_steel_or_painted_steel", "density_kg_m3": None,
                 "typical_mass_kg": {"chimney_60cm": 12, "chimney_90cm": 16, "integrated": 5}},
        "electrical": {"voltage_v": 240, "power_w": {"motor": 250, "LED_lights": 6}, "connection": "13A_plug"},
        "thermal": {"operating_temp_c": [10, 40]},
        "mechanical": {
            "extraction_rate_m3h": {"60cm": 400, "90cm": 600},
            "noise_db": {"low": 45, "high": 65, "boost": 72},
            "filter": "aluminium_grease_5_layer_washable",
            "duct_diameter_mm": [120, 150],
        },
        "interface": {"duct": "120mm_or_150mm_round_or_flat", "recirculation": "charcoal_filter_option"},
        "procurement": {"typical_unit_cost_gbp": 150.00, "lead_time_days": 5,
                        "common_suppliers": ["Elica", "Neff", "CDA", "Siemens"]},
    },

    # ═══ BATHROOM ═══

    "bath_freestanding": {
        "mass": {"material": {"acrylic": {"density_kg_m3": 1180, "typical_mass_kg": 30},
                              "cast_iron": {"density_kg_m3": 7200, "typical_mass_kg": 120},
                              "stone_resin": {"density_kg_m3": 1800, "typical_mass_kg": 55}}},
        "electrical": None,
        "thermal": {"heat_retention_mins_to_lose_5C": {"acrylic": 30, "cast_iron": 45, "stone_resin": 40}},
        "mechanical": {
            "capacity_l": {"1500mm": 160, "1700mm": 195, "1800mm": 220},
            "filled_weight_kg": {"1700mm_acrylic": 225, "1700mm_cast_iron": 315},
            "floor_load_kn_m2": {"acrylic_filled": 2.5, "cast_iron_filled": 3.5},
        },
        "interface": {"waste": "click_clack_or_chain_plug_40mm", "overflow": "concealed_or_exposed",
                      "tap_holes": {"deck_mounted": 1, "wall_mounted": 0}},
        "procurement": {"typical_unit_cost_gbp": 400.00, "lead_time_days": 7,
                        "common_suppliers": ["BC Designs", "Burlington", "Crosswater", "Victoria + Albert"]},
    },

    "shower_tray": {
        "mass": {"material": {"stone_resin": {"density_kg_m3": 1800, "typical_mass_kg": 18},
                              "acrylic": {"density_kg_m3": 1180, "typical_mass_kg": 8}}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 50]},
        "mechanical": {
            "height_mm": [25, 40, 90],
            "anti_slip": "EN_14527_Class_C",
            "point_load_capacity_kg": 200,
        },
        "interface": {"waste": "90mm_fast_flow_trap", "trap_depth_mm": [50, 90]},
        "procurement": {"typical_unit_cost_gbp": 120.00, "lead_time_days": 5,
                        "common_suppliers": ["Crosswater", "Simpsons", "JT", "Mira"]},
    },

    "shower_screen": {
        "mass": {"material": "8mm_toughened_safety_glass_BS_EN_12150", "density_kg_m3": 2500,
                 "typical_mass_kg": {"800mm": 20, "1000mm": 25, "1200mm": 30}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 50]},
        "mechanical": {
            "glass_thickness_mm": [6, 8, 10],
            "coating": "easy_clean_nano_coating",
            "type": ["fixed_panel", "hinged", "sliding", "bi_fold"],
        },
        "interface": {"wall_channel": "U_channel_or_wall_bracket", "seal": "magnetic_or_blade"},
        "procurement": {"typical_unit_cost_gbp": 200.00, "lead_time_days": 7,
                        "common_suppliers": ["Merlyn", "Simpsons", "Lakes", "Crosswater"]},
    },

    "wc_close_coupled": {
        "mass": {"material": "vitreous_china", "density_kg_m3": 2400,
                 "typical_mass_kg": {"standard": 28, "rimless": 26, "wall_hung": 20}},
        "electrical": None,
        "thermal": {"operating_temp_c": [2, 40]},
        "mechanical": {
            "flush_volume_l": {"full": 6, "half": 4},  # Building Regs G2
            "trap": "S_trap_or_P_trap",
            "seat": "thermoset_soft_close",
            "flush_mechanism": "dual_flush_valve",
        },
        "interface": {"water_supply": "15mm_flexible_bottom_entry_or_side",
                      "waste": "110mm_soil_pipe_BS_EN_12056", "floor_fix": "2x_M8_bolts"},
        "procurement": {"typical_unit_cost_gbp": 150.00, "lead_time_days": 5,
                        "common_suppliers": ["Ideal Standard", "Roca", "RAK", "Duravit", "Villeroy & Boch"]},
    },

    "basin_countertop": {
        "mass": {"material": {"ceramic": {"density_kg_m3": 2300, "typical_mass_kg": 6},
                              "stone_resin": {"density_kg_m3": 1800, "typical_mass_kg": 5}}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 50]},
        "mechanical": {"waste": "click_clack_32mm", "overflow": "internal_slot_or_none"},
        "interface": {"tap_holes": "0_1_or_3_hole", "waste_connection": "32mm_bottle_trap"},
        "procurement": {"typical_unit_cost_gbp": 80.00, "lead_time_days": 5,
                        "common_suppliers": ["Crosswater", "Duravit", "RAK", "Roca"]},
    },

    "vanity_unit": {
        "mass": {"material": "18mm_moisture_resistant_MDF_or_plywood", "density_kg_m3": 750,
                 "typical_mass_kg": {"600mm": 18, "800mm": 25, "1000mm": 32}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 40], "moisture_resistance": "required"},
        "mechanical": {"soft_close_hinges": True, "drawer_runner_load_kg": 20},
        "interface": {"basin": "countertop_or_inset", "wall_fix": "concealed_bracket",
                      "plumbing_cutout": "rear_panel"},
        "procurement": {"typical_unit_cost_gbp": 200.00, "lead_time_days": 14,
                        "common_suppliers": ["Roper Rhodes", "Burlington", "Crosswater", "Britton"]},
    },

    "towel_radiator": {
        "mass": {"material": "mild_steel_chrome_plated_or_powder_coated", "density_kg_m3": 7850,
                 "typical_mass_kg": {"500x800": 6, "500x1200": 9, "600x1600": 14}},
        "electrical": {"voltage_v": 240, "element_w": [150, 300, 600], "dual_fuel": True},
        "thermal": {
            "btu_output": {"500x800": 1200, "500x1200": 2000, "600x1600": 3500},
            "watt_output": {"500x800": 350, "500x1200": 586, "600x1600": 1025},
            "delta_t_50": True,
        },
        "mechanical": {"bar_diameter_mm": [22, 25, 30], "rail_diameter_mm": [32, 38],
                       "working_pressure_bar": 6, "test_pressure_bar": 9},
        "interface": {"valve_connection": "15mm_BSP_bottom_corner", "valve_type": "angled_or_straight",
                      "wall_fix": "concealed_bracket_4_point"},
        "procurement": {"typical_unit_cost_gbp": 80.00, "lead_time_days": 5,
                        "common_suppliers": ["Reina", "Vogue", "Tissino", "Zehnder"]},
    },

    # ═══ FURNITURE ═══

    "bed_frame": {
        "mass": {"material": {"pine": 15, "oak": 30, "upholstered": 40, "metal": 20},
                 "typical_mass_kg": 25},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {
            "mattress_size_mm": {"single": "900x1900", "double": "1350x1900",
                                 "king": "1500x2000", "super_king": "1800x2000"},
            "max_user_weight_kg": 200,
            "slat_spacing_mm": [50, 70],
            "headboard_height_mm": [600, 1200],
        },
        "interface": {"assembly": "bolt_together_M8", "slat_holders": "plastic_cap_or_flexible"},
        "procurement": {"typical_unit_cost_gbp": 300.00, "lead_time_days": 14,
                        "common_suppliers": ["Warren Evans", "Dreams", "Ikea", "John Lewis"]},
    },

    "wardrobe_hinged": {
        "mass": {"material": "18mm_melamine_chipboard_or_solid_wood", "density_kg_m3": 650,
                 "typical_mass_kg": {"2_door_1200mm": 55, "3_door_1800mm": 80}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {"rail_load_kg_per_m": 30, "shelf_load_kg": 20, "hinge_type": "soft_close"},
        "interface": {"assembly": "cam_and_dowel", "wall_tip_restraint": "L_bracket_required"},
        "procurement": {"typical_unit_cost_gbp": 300.00, "lead_time_days": 14,
                        "common_suppliers": ["Ikea", "John Lewis", "Sharps", "Hammonds"]},
    },

    "chest_of_drawers": {
        "mass": {"material": "melamine_chipboard_or_solid_wood", "density_kg_m3": 650,
                 "typical_mass_kg": {"4_drawer": 25, "5_drawer": 30, "6_drawer": 35}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {"drawer_load_kg": 15, "runner_type": "ball_bearing_full_extension"},
        "interface": {"assembly": "cam_and_dowel", "wall_tip_restraint": "L_bracket_required"},
        "procurement": {"typical_unit_cost_gbp": 150.00, "lead_time_days": 7,
                        "common_suppliers": ["Ikea", "Dunelm", "Furniture Village"]},
    },

    "dining_table": {
        "mass": {"material": {"oak_solid": 50, "oak_veneer": 35, "pine": 25, "MDF_painted": 30},
                 "typical_mass_kg": 40},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {
            "seating_capacity": {"1200mm": 4, "1600mm": 6, "1800mm": 8, "2400mm": 10},
            "top_load_kg": 100,
            "extendable": {"butterfly_leaf": True, "draw_leaf": True},
        },
        "interface": {"assembly": "knock_down_bolts_or_fixed", "leg_levellers": "adjustable_feet"},
        "procurement": {"typical_unit_cost_gbp": 400.00, "lead_time_days": 14,
                        "common_suppliers": ["Oak Furnitureland", "John Lewis", "Ikea", "Habitat"]},
    },

    "desk": {
        "mass": {"material": "melamine_MDF_steel_frame", "density_kg_m3": None,
                 "typical_mass_kg": {"1200mm": 25, "1400mm": 30, "1600mm": 35}},
        "electrical": {"cable_management": True, "grommet_holes": [1, 2]},
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {"desktop_load_kg": 80, "height_mm": [720, 730],
                       "sit_stand": {"min_mm": 650, "max_mm": 1250, "motor_w": 150}},
        "interface": {"assembly": "bolt_together", "cable_tray": "mesh_or_plastic_clip_on"},
        "procurement": {"typical_unit_cost_gbp": 200.00, "lead_time_days": 7,
                        "common_suppliers": ["Ikea", "FlexiSpot", "John Lewis", "Argos"]},
    },

    # ═══ DOORS ═══

    "internal_door": {
        "mass": {"material": {"hollow_core": {"density_kg_m3": 300, "typical_mass_kg": 10},
                              "solid_core": {"density_kg_m3": 550, "typical_mass_kg": 18},
                              "FD30_fire": {"density_kg_m3": 650, "typical_mass_kg": 25}}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {
            "standard_sizes_mm": {"1'9": "457x1981", "2'0": "510x1981", "2'3": "610x1981",
                                  "2'6": "686x1981", "2'9": "762x1981", "3'0": "838x1981"},
            "thickness_mm": [35, 40, 44],
            "fire_rating": {"none": 0, "FD30": 30, "FD60": 60},
            "acoustic_rw_db": {"hollow": 22, "solid": 28, "FD30": 32},
        },
        "interface": {"hinge": "76mm_butt_hinge_x3", "handle": "lever_on_rose_or_backplate",
                      "latch": "tubular_mortice_64mm", "frame": "softwood_lining_set_32x115mm"},
        "procurement": {"typical_unit_cost_gbp": 40.00, "lead_time_days": 3,
                        "common_suppliers": ["Howdens", "Premdor", "JB Kind", "Deanta", "Wickes"]},
    },

    "composite_front_door": {
        "mass": {"material": "GRP_skin_polyurethane_foam_core_timber_subframe", "density_kg_m3": None,
                 "typical_mass_kg": 45},
        "electrical": None,
        "thermal": {"u_value_w_m2k": [1.0, 1.4], "building_regs": "Part_L_max_1.8"},
        "mechanical": {
            "thickness_mm": 44,
            "security": "PAS_24_enhanced_security",
            "lock": "multi_point_locking_3_5_hooks",
            "cylinder": "TS007_3_star_anti_snap",
            "weather_seal": "double_rebated_compression",
        },
        "interface": {"frame": "70mm_UPVC_or_timber_outer_frame", "threshold": "aluminium_low_threshold",
                      "letter_plate": "272x70mm_BS_EN_13724"},
        "procurement": {"typical_unit_cost_gbp": 800.00, "lead_time_days": 21,
                        "common_suppliers": ["Solidor", "Rockdoor", "Endurance", "Distinction"]},
    },

    "bifold_door": {
        "mass": {"material": "aluminium_6063_T6_powder_coated_double_glazed", "density_kg_m3": None,
                 "typical_mass_kg_per_panel": 45},
        "electrical": None,
        "thermal": {
            "u_value_w_m2k": {"overall": [1.3, 1.6], "glass_centre": [1.0, 1.1]},
            "glass": "argon_filled_low_e_soft_coat_24mm_or_28mm_unit",
            "building_regs": "Part_L_max_1.6_for_doors",
        },
        "mechanical": {
            "max_panel_width_mm": 1200,
            "max_panel_weight_kg": 100,
            "panel_count": [2, 3, 4, 5, 6, 7],
            "configurations": ["all_left", "all_right", "split_2_1", "split_3_2"],
            "track": "stainless_steel_bottom_running",
            "security": "PAS_24",
        },
        "interface": {"track": "recessed_threshold_or_low_threshold_24mm",
                      "frame": "outerframe_thermally_broken", "handle": "D_handle_with_multi_point_lock"},
        "procurement": {"typical_unit_cost_gbp_per_panel": 500.00, "lead_time_days": 28,
                        "common_suppliers": ["Origin", "Schuco", "Smart Systems", "AluK", "Korniche"]},
    },

    "sliding_pocket_door": {
        "mass": {"material": "timber_or_MDF_door_leaf_steel_track_cassette", "density_kg_m3": None,
                 "typical_mass_kg": {"door_leaf": 15, "cassette_kit": 12}},
        "electrical": None,
        "thermal": {"operating_temp_c": [5, 30]},
        "mechanical": {
            "max_door_weight_kg": 80,
            "track_type": "ball_bearing_soft_close",
            "cassette_wall_thickness_mm": 100,
            "door_thickness_mm": [35, 40, 44],
        },
        "interface": {"cassette": "galvanised_steel_stud_frame", "track": "aluminium_concealed_header",
                      "pull": "recessed_flush_pull_or_edge_pull"},
        "procurement": {"typical_unit_cost_gbp": 200.00, "lead_time_days": 14,
                        "common_suppliers": ["Eclisse", "JB Kind Pocket", "Deanta", "Selo"]},
    },

    # ═══ WINDOWS ═══

    "casement_window": {
        "mass": {"material": {"UPVC": {"density_kg_m3": 1400, "typical_mass_kg": 25},
                              "aluminium": {"density_kg_m3": 2700, "typical_mass_kg": 20},
                              "timber": {"density_kg_m3": 500, "typical_mass_kg": 22}}},
        "electrical": None,
        "thermal": {
            "u_value_w_m2k": {"UPVC_A_rated": 1.4, "aluminium_TB": 1.5, "timber": 1.4},
            "glass": "argon_filled_low_e_24mm_sealed_unit",
            "building_regs": "Part_L_max_1.6",
            "energy_rating": "A_to_A++",
        },
        "mechanical": {
            "opening": "side_hung_top_hung_or_fixed",
            "max_sash_weight_kg": 35,
            "friction_stay": "EGRESS_compliant_where_required",
            "weather": "BS_6375_severe_exposure",
            "security": "PAS_24_shootbolt_locking",
        },
        "interface": {"fix_to_masonry": "frame_fix_M10_Fischer_or_similar",
                      "fix_to_timber": "150mm_screws", "seal": "expanding_foam_and_silicone",
                      "trickle_vent": "5000mm2_equivalent_area_Part_F"},
        "procurement": {"typical_unit_cost_gbp": 250.00, "lead_time_days": 21,
                        "common_suppliers": ["Anglian", "Everest", "Internorm", "Velfac", "Rationel"]},
    },

    "sash_window": {
        "mass": {"material": {"timber": {"density_kg_m3": 500, "typical_mass_kg": 30},
                              "UPVC_sash": {"density_kg_m3": 1400, "typical_mass_kg": 28}}},
        "electrical": None,
        "thermal": {
            "u_value_w_m2k": {"slim_double": 1.5, "slim_triple": 1.0},
            "glass": "slim_double_glazed_14mm_unit_heritage",
            "building_regs": "Part_L_max_1.6",
        },
        "mechanical": {
            "balance": "spiral_balance_or_sash_cord_and_weight",
            "tilt_for_cleaning": True,
            "max_sash_weight_kg": 40,
            "security": "Brighton_fastener_and_sash_stop",
            "listed_building": "heritage_slim_glazing_bars_available",
        },
        "interface": {"frame": "box_frame_recessed_into_reveal", "seal": "brush_pile_draught_seal"},
        "procurement": {"typical_unit_cost_gbp": 500.00, "lead_time_days": 42,
                        "common_suppliers": ["Timber Windows", "Bereco", "George Barnsdale", "Bygone"]},
    },

    "roof_window": {
        "mass": {"material": "timber_core_aluminium_external_cladding", "density_kg_m3": None,
                 "typical_mass_kg": {"780x980": 18, "780x1180": 22, "1140x1180": 30}},
        "electrical": {"voltage_v": 240, "electric_operation_w": 40, "rain_sensor": True},
        "thermal": {
            "u_value_w_m2k": {"double": 1.3, "triple": 1.0},
            "building_regs": "Part_L_max_1.6_roof",
            "solar_heat_gain_g_value": 0.5,
        },
        "mechanical": {
            "opening": ["centre_pivot", "top_hung", "conservation"],
            "pitch_range_deg": {"centre_pivot": [15, 90], "top_hung": [15, 55]},
            "ventilation_flap": True,
        },
        "interface": {"flashing_kit": "required_tile_or_slate_profile", "blind": "internal_roller_or_venetian",
                      "lining_kit": "insulated_reveals"},
        "procurement": {"typical_unit_cost_gbp": 350.00, "lead_time_days": 7,
                        "common_suppliers": ["Velux", "Fakro", "RoofLITE", "Keylite"]},
    },

    # ═══ ELECTRICAL ═══

    "light_switch": {
        "mass": {"material": "polycarbonate_or_metal_clad", "density_kg_m3": None,
                 "typical_mass_g": {"1_gang_plastic": 40, "2_gang_chrome": 80}},
        "electrical": {
            "voltage_v": 240, "current_max_a": 10, "rating_w": {"incandescent": 2400, "LED": 300},
            "type": ["rocker", "toggle", "dimmer", "smart"],
            "dimmer_trailing_edge": True,
        },
        "thermal": {"operating_temp_c": [0, 40]},
        "mechanical": {"lifecycle_operations": 40000, "ip_rating": {"standard": "IP20", "bathroom": "IP44"}},
        "interface": {"backbox": "25mm_or_35mm_metal", "wiring": "loop_in_or_3_plate",
                      "standard": "BS_1363_BS_EN_60669"},
        "procurement": {"typical_unit_cost_gbp": 5.00, "lead_time_days": 1,
                        "common_suppliers": ["BG", "MK", "Schneider Lisse", "Hamilton", "Knightsbridge"]},
    },

    "double_socket": {
        "mass": {"material": "polycarbonate_or_brushed_chrome_faceplate", "density_kg_m3": None,
                 "typical_mass_g": {"plastic": 90, "metal": 150}},
        "electrical": {
            "voltage_v": 240, "current_per_socket_a": 13,
            "fuse_a": 13, "type": "BS_1363",
            "usb": {"type_A_2.1A": True, "type_C_PD_30W": True},
        },
        "thermal": {"operating_temp_c": [0, 40]},
        "mechanical": {"lifecycle_operations": 10000, "ip_rating": {"standard": "IP20", "outdoor": "IP66"},
                       "shuttered": True},
        "interface": {"backbox": "35mm_metal_or_dry_lining", "wiring": "ring_main_2.5mm2_T_E",
                      "standard": "BS_1363_BS_EN_60083"},
        "procurement": {"typical_unit_cost_gbp": 4.00, "lead_time_days": 1,
                        "common_suppliers": ["BG", "MK", "Schneider Lisse", "Scolmore", "Knightsbridge"]},
    },

    "downlight": {
        "mass": {"material": "die_cast_aluminium_body_LED_COB", "density_kg_m3": None,
                 "typical_mass_g": {"fixed_non_fire": 80, "tilt_fire_rated": 180}},
        "electrical": {
            "voltage_v": 240, "power_w": [4, 5, 6, 8, 10],
            "lumens": {"5W": 450, "8W": 700, "10W": 900},
            "cct_k": [2700, 3000, 4000],
            "cri": 90,
            "dimmable": True,
            "driver": "integrated_or_remote",
        },
        "thermal": {"operating_temp_c": [0, 40], "ic_rated": "insulation_coverable",
                    "fire_rating_minutes": [0, 30, 60, 90]},
        "mechanical": {
            "cutout_mm": [62, 68, 70, 75, 85, 100],
            "ip_rating": {"bathroom_zone_1": "IP65", "kitchen": "IP44", "general": "IP20"},
            "bezel": ["fixed", "tilt_20deg", "adjustable_30deg"],
        },
        "interface": {"connector": "loop_in_loop_out_push_fit", "ceiling_fix": "spring_clip"},
        "procurement": {"typical_unit_cost_gbp": 8.00, "lead_time_days": 1,
                        "common_suppliers": ["JCC", "Aurora", "Integral LED", "Philips", "Collingwood"]},
    },

    # ═══ PLUMBING & HEATING ═══

    "panel_radiator": {
        "mass": {"material": "cold_rolled_steel_1.2mm", "density_kg_m3": 7850,
                 "typical_mass_kg": {"600x600_T11": 6, "600x1000_T22": 18, "600x1400_T22": 26}},
        "electrical": None,
        "thermal": {
            "output_watts_delta_t50": {"600x600_T11": 440, "600x1000_T22": 1400, "600x1400_T22": 2000,
                                       "700x1200_T22": 2200},
            "output_btu": {"600x1000_T22": 4778, "600x1400_T22": 6824},
            "flow_temp_c": [55, 60, 70, 75],
        },
        "mechanical": {
            "working_pressure_bar": 6,
            "test_pressure_bar": 9,
            "type": {"T11": "single_panel_single_convector", "T21": "double_panel_single_convector",
                     "T22": "double_panel_double_convector"},
        },
        "interface": {"valve_connection": "15mm_BSP_bottom_opposite_end",
                      "valve_spacing_mm": {"600mm": 500, "1000mm": 900},
                      "wall_bracket": "top_hook_and_bottom_cradle"},
        "procurement": {"typical_unit_cost_gbp": 50.00, "lead_time_days": 3,
                        "common_suppliers": ["Stelrad", "Kudox", "Quinn", "Henrad", "Myson"]},
    },

    "trv_valve": {
        "mass": {"material": "brass_body_DR62_plastic_head", "density_kg_m3": None,
                 "typical_mass_g": 180},
        "electrical": {"smart_trv_voltage_v": 3.0, "smart_trv_batteries": "2xAA", "smart_protocol": ["Zigbee", "Z-Wave"]},
        "thermal": {
            "range_c": [8, 28],
            "settings": {"frost": 6, "1": 12, "2": 16, "3": 20, "4": 24, "5": 28},
            "response_time_mins": 20,
        },
        "mechanical": {
            "connection": "15mm_angled_or_straight",
            "kv_value_m3h": 0.65,
            "max_differential_pressure_bar": 0.6,
        },
        "interface": {"head_fitting": "M30x1.5_snap_on", "body_connection": "15mm_compression"},
        "procurement": {"typical_unit_cost_gbp": 10.00, "lead_time_days": 1,
                        "common_suppliers": ["Drayton", "Honeywell", "Danfoss", "Tado"]},
    },

    "combi_boiler": {
        "mass": {"material": "steel_casing_stainless_steel_heat_exchanger", "density_kg_m3": None,
                 "typical_mass_kg": {"24kW": 30, "30kW": 34, "35kW": 38}},
        "electrical": {"voltage_v": 240, "power_w": 130, "connection": "fused_spur_3A"},
        "thermal": {
            "ch_output_kw": [24, 28, 30, 35, 40],
            "dhw_output_kw": [24, 30, 35, 40],
            "dhw_flow_rate_lpm_35C_rise": {"24kW": 9.8, "30kW": 12.3, "35kW": 14.3},
            "efficiency_erp": {"A_rated": 94},
            "flue": "concentric_60_100mm_or_80_125mm",
            "condensing": True,
        },
        "mechanical": {
            "working_pressure_bar": 3,
            "max_pressure_bar": 6,
            "expansion_vessel_l": [8, 10, 12],
            "dimensions_typical_mm": "440x350x740",
        },
        "interface": {
            "gas": "22mm_BS_EN_1775", "flow_return": "22mm_compression",
            "dhw": "15mm_compression", "condensate": "22mm_plastic_to_drain",
            "flue": "60_100_concentric", "controls": "OpenTherm_or_relay",
        },
        "procurement": {"typical_unit_cost_gbp": 700.00, "lead_time_days": 3,
                        "common_suppliers": ["Worcester Bosch", "Vaillant", "Ideal", "Baxi", "Viessmann"]},
    },

    # ═══ BUILDING FABRIC ═══

    "roof_tile": {
        "mass": {"material": {"concrete": {"density_kg_m3": 2300, "mass_per_tile_kg": 4.5},
                              "clay": {"density_kg_m3": 1900, "mass_per_tile_kg": 2.8}}},
        "electrical": None,
        "thermal": {"operating_temp_c": [-20, 70]},
        "mechanical": {
            "cover_width_mm": 300,
            "headlap_mm": [75, 100],
            "min_pitch_deg": {"interlocking": 22.5, "plain_tile": 35},
            "tiles_per_m2": {"interlocking": 10, "plain_tile": 60},
            "nail_fix": "every_tile_on_exposed_sites_or_every_5th",
            "BS_standard": "BS_EN_490_concrete_BS_EN_1304_clay",
        },
        "interface": {"batten": "25x50mm_treated_SW_at_gauge", "underlay": "BS_747_1F_or_breathable"},
        "procurement": {"typical_unit_cost_gbp_per_tile": {"concrete": 0.60, "clay": 1.50},
                        "lead_time_days": 5,
                        "common_suppliers": ["Marley", "Redland", "Russell", "Sandtoft"]},
    },

    "gutter_profile": {
        "mass": {"material": {"UPVC": {"density_kg_m3": 1400, "mass_per_m_g": 350},
                              "cast_iron": {"density_kg_m3": 7200, "mass_per_m_g": 3500},
                              "aluminium": {"density_kg_m3": 2700, "mass_per_m_g": 800}}},
        "electrical": None,
        "thermal": {"operating_temp_c": [-20, 60]},
        "mechanical": {
            "flow_capacity_lps": {"112mm_half_round": 0.9, "125mm_ogee": 1.2, "150mm_deep": 2.2},
            "fall_mm_per_m": [2, 3],
            "max_run_without_outlet_m": 15,
            "BS_standard": "BS_EN_607_half_round_BS_EN_12200_UPVC",
        },
        "interface": {"bracket": "fascia_or_rafter_bracket_at_600_800mm", "outlet": "68mm_or_75mm_round"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"UPVC": 3, "aluminium": 12, "cast_iron": 25},
                        "lead_time_days": 3,
                        "common_suppliers": ["FloPlast", "Brett Martin", "Lindab", "Hargreaves"]},
    },

    "steel_lintel": {
        "mass": {"material": "galvanised_steel_S275_1.2mm_3mm", "density_kg_m3": 7850,
                 "typical_mass_kg_per_m": {"standard_load": 5, "heavy_duty": 12}},
        "electrical": None,
        "thermal": {"psi_value_w_mk": [0.05, 0.15], "insulation": "integral_EPS_or_mineral_wool"},
        "mechanical": {
            "safe_load_kn_per_m": {"1200mm_SL": 16, "1800mm_SL": 11, "2400mm_SL": 8},
            "bearing_mm": 150,
            "cavity_widths_mm": [50, 65, 75, 85, 100],
            "BS_standard": "BS_EN_845_2",
        },
        "interface": {"inner_leaf": "block_or_timber_frame", "outer_leaf": "brick_or_stone",
                      "dpc_tray": "integral_or_separate"},
        "procurement": {"typical_unit_cost_gbp": 25.00, "lead_time_days": 3,
                        "common_suppliers": ["IG Lintels", "Catnic", "Birtley", "Stressline"]},
    },
}
