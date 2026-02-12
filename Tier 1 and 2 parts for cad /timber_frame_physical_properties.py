"""
ForgeOS — UK Timber Frame Building Physical Properties
========================================================
Per TRADA, STA Robust Details, BS EN 1995 (EC5), BS EN 338.
"""

TIMBER_FRAME_PHYSICAL_PROPERTIES = {

    "sole_plate": {
        "mass": {"material": "C16_C24_treated_regularised_softwood", "density_kg_m3": {"C16": 370, "C24": 420},
                 "mass_per_m_kg": {"38x140": 2.0, "38x89": 1.3}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.13},
        "mechanical": {"grade": "C16_or_C24_BS_EN_338", "treatment": "UC2_or_UC3_preservative_BS_8417",
                       "DPC": "min_150mm_above_external_ground_level"},
        "interface": {"fix_to_foundation": "M12_holding_down_bolts_at_max_2400mm_centres",
                      "DPC": "polythene_sheet_under_plate", "stud_fix": "skew_nailed_or_framing_nail"},
        "procurement": {"typical_unit_cost_gbp_per_m": 3.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins", "BSW Timber"]},
    },

    "wall_stud": {
        "mass": {"material": "C16_C24_regularised_kiln_dried", "density_kg_m3": {"C16": 370, "C24": 420},
                 "mass_per_m_kg": {"38x89": 1.3, "38x140": 2.0, "47x140": 2.5, "38x184": 2.6, "38x235": 3.3}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.13, "U_value_contribution": "thermal_bridge_per_BS_EN_ISO_10211"},
        "mechanical": {
            "grade": "C16_or_C24_BS_EN_338",
            "bending_strength_mpa": {"C16": 16, "C24": 24},
            "compression_parallel_mpa": {"C16": 17, "C24": 21},
            "E_mean_gpa": {"C16": 8.0, "C24": 11.0},
            "centres_mm": [400, 600],
            "max_stud_height_m": {"38x89": 2.4, "38x140": 3.0, "47x140": 3.6},
        },
        "interface": {"fix_to_plates": "2x_90mm_nails_skew_or_framing_nailer", "notch_bore": "max_0.25D_notch_0.25D_hole"},
        "procurement": {"typical_unit_cost_gbp_per_m": 2.50, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins", "BSW", "James Jones"]},
    },

    "head_plate": {
        "mass": {"material": "C16_C24_regularised", "density_kg_m3": {"C16": 370, "C24": 420},
                 "mass_per_m_kg_double": {"2x38x140": 4.0}},
        "electrical": None, "thermal": {"lambda_w_mk": 0.13},
        "mechanical": {"double_plate": "required_for_platform_frame_load_distribution",
                       "joint_offset": "min_600mm_stagger_between_upper_and_lower_plates"},
        "interface": {"stud_fix": "nailed_through_from_above", "upper_to_lower": "nailed_at_300mm_centres"},
        "procurement": {"typical_unit_cost_gbp_per_m": 5.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },

    "nogging": {
        "mass": {"material": "C16_offcuts_or_regularised", "density_kg_m3": 370, "typical_mass_kg": 0.4},
        "electrical": None, "thermal": {},
        "mechanical": {"function": ["bracing", "plasterboard_edge_support", "stiffening"],
                       "rows": "1_at_mid_height_minimum_2_for_tall_walls"},
        "interface": {"fix": "skew_nailed_or_staggered_for_end_nailing"},
        "procurement": {"typical_unit_cost_gbp": 0.50, "lead_time_days": 3,
                        "common_suppliers": ["Same_as_studs"]},
    },

    "corner_post": {
        "mass": {"material": "C16_C24_3_stud_assembly", "density_kg_m3": 370,
                 "typical_mass_kg_per_m": 6.0},
        "electrical": None, "thermal": {"thermal_bridge": "consider_additional_insulation_return"},
        "mechanical": {"assembly": "3_stud_or_2_stud_plus_packing", "function": "intersecting_wall_connection"},
        "interface": {"nailed_assembly": "75mm_nails_at_300_staggered"},
        "procurement": {"typical_unit_cost_gbp_per_m": 7.50, "lead_time_days": 3,
                        "common_suppliers": ["Same_as_studs"]},
    },

    "timber_lintel": {
        "mass": {"material": "C24_or_glulam_GL24h", "density_kg_m3": {"C24_solid": 420, "glulam_GL24h": 385},
                 "typical_mass_kg_per_m": {"2x38x225": 6.5, "flitch_90x225": 12}},
        "electrical": None, "thermal": {"lambda_w_mk": {"timber": 0.13, "steel_flitch": 50}},
        "mechanical": {
            "span_table": "TRADA_span_tables_or_engineer_design",
            "max_span_mm": {"2x38x225_C24": 2100, "flitch_90x225": 3000, "glulam_135x270": 4500},
            "bearing_mm": 150,
            "padstone": "not_normally_required_for_timber_frame",
        },
        "interface": {"fix": "M12_bolts_at_max_600mm_centres_staggered", "cripple_studs": "above_and_below"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"solid": 8, "flitch": 25, "glulam": 40}, "lead_time_days": 7,
                        "common_suppliers": ["James Jones", "Boise Cascade", "Metsä Wood"]},
    },

    "ring_beam": {
        "mass": {"material": "C16_or_C24", "density_kg_m3": 370, "mass_per_m_kg": {"100x50": 1.8}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "roof_truss_bearing_and_lateral_restraint",
                       "strap": "galvanised_steel_strap_from_ring_beam_to_wall_frame"},
        "interface": {"fix_to_head_plate": "nailed_or_bolted", "truss_fix": "truss_clip_or_skew_nailed"},
        "procurement": {"typical_unit_cost_gbp_per_m": 2.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },

    "floor_joist_solid": {
        "mass": {"material": "C16_C24_regularised", "density_kg_m3": {"C16": 370, "C24": 420},
                 "mass_per_m_kg": {"47x145": 2.6, "47x170": 3.0, "47x195": 3.4, "47x220": 3.9, "47x245": 4.3}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.13},
        "mechanical": {
            "span_m": {"47x145_C24_400cc": 2.8, "47x170_C24_400cc": 3.4, "47x195_C24_400cc": 3.9,
                       "47x220_C24_400cc": 4.4, "47x245_C24_400cc": 4.9},
            "centres_mm": [400, 450, 600],
            "notch_max": "0.125D_at_supports_only",
            "hole_max": "0.25D_in_neutral_zone",
        },
        "interface": {"support": "joist_hanger_or_bearing_on_head_plate", "strutting": "at_mid_span_if_over_2.5m"},
        "procurement": {"typical_unit_cost_gbp_per_m": 3.50, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins", "BSW"]},
    },

    "engineered_i_joist": {
        "mass": {"material": "LVL_flanges_OSB_web", "density_kg_m3": None,
                 "mass_per_m_kg": {"200mm": 2.5, "240mm": 3.0, "300mm": 3.8, "360mm": 4.3, "400mm": 4.8}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.13},
        "mechanical": {
            "span_m": {"200_400cc": 3.5, "240_400cc": 4.5, "300_400cc": 5.5, "360_400cc": 6.5, "400_400cc": 7.5},
            "web_stiffener": "required_at_supports_and_concentrated_loads",
            "no_notching": "never_notch_or_bore_flanges",
            "hole_in_web": "manufacturer_approved_sizes_and_locations_only",
        },
        "interface": {"hanger": "proprietary_I_joist_hanger", "blocking": "full_depth_blocking_at_supports"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"240mm": 5, "300mm": 7, "400mm": 9}, "lead_time_days": 7,
                        "common_suppliers": ["James Jones JJI", "Metsä Wood Finnjoist", "Boise Cascade"]},
    },

    "metal_web_joist": {
        "mass": {"material": "C16_timber_chords_galvanised_steel_V_webs",
                 "mass_per_m_kg": {"195mm": 2.2, "254mm": 2.8, "302mm": 3.2, "356mm": 3.8}},
        "electrical": None,
        "thermal": {"lambda_w_mk": "low_thermal_bridging_open_web"},
        "mechanical": {
            "span_m": {"195_400cc": 4.0, "254_400cc": 5.5, "302_400cc": 6.5, "356_400cc": 7.5},
            "services": "services_pass_through_open_webs_no_drilling",
            "hole_in_chord": "never",
        },
        "interface": {"hanger": "standard_joist_hanger", "restraint": "blocking_and_herringbone"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"254mm": 8, "302mm": 10, "356mm": 13}, "lead_time_days": 14,
                        "common_suppliers": ["MiTek Posi-Joist", "Wolf Systems", "ITW Alpine"]},
    },

    "rim_board": {
        "mass": {"material": "C16_C24_or_LVL", "density_kg_m3": 420, "mass_per_m_kg": {"38x220": 3.5}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "closes_floor_cavity_at_external_wall_line", "fire": "maintains_floor_fire_compartment"},
        "interface": {"fix": "nailed_to_joist_ends_and_sole_plate"},
        "procurement": {"typical_unit_cost_gbp_per_m": 3.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },

    "herringbone_strut": {
        "mass": {"material": {"metal": "galvanised_steel_1mm", "timber": "38x38_C16"},
                 "typical_mass_g": {"metal_pair": 200, "timber_pair": 400}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "prevents_joist_rotation_distributes_load",
                       "spacing": "at_mid_span_if_span_over_2.5m_and_at_third_points_if_over_4.5m"},
        "interface": {"fix": {"metal": "nail_each_end_to_joist", "timber": "skew_nail_to_joist"}},
        "procurement": {"typical_unit_cost_gbp": {"metal": 0.80, "timber": 0.40}, "lead_time_days": 3,
                        "common_suppliers": ["Simpson Strong-Tie", "Expamet"]},
    },

    "joist_hanger": {
        "mass": {"material": "galvanised_steel_2_2.5mm_Z275", "density_kg_m3": 7850,
                 "typical_mass_g": {"standard_47x220": 250, "heavy_75x220": 400}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "safe_load_kn": {"standard_47x220": 6.5, "heavy_75x220": 12.0},
            "nail_type": "3.75x30mm_galv_connector_nails",
            "nails_required": {"back_plate": 6, "flanges": 4},
            "standard": "BS_EN_14545_or_ETA",
        },
        "interface": {"types": ["face_fix", "masonry", "concealed", "adjustable"]},
        "procurement": {"typical_unit_cost_gbp": 2.50, "lead_time_days": 3,
                        "common_suppliers": ["Simpson Strong-Tie", "BPC", "Expamet", "ITW Alpine"]},
    },

    "trussed_rafter": {
        "mass": {"material": "C16_C24_with_galvanised_nail_plates", "density_kg_m3": 370,
                 "typical_mass_kg": {"7.2m_fink_22.5deg": 35, "9m_fink_30deg": 55}},
        "electrical": None,
        "thermal": {"loft_insulation_above_ceiling_tie": "400mm_mineral_wool_0.11_U_value"},
        "mechanical": {
            "span_m": [4.8, 6, 7.2, 8.4, 9.6, 10.8, 12],
            "pitch_deg": [15, 17.5, 22.5, 30, 35, 40, 45],
            "centres_mm": [600],
            "design": "BS_EN_14250_or_manufacturer_design",
            "bracing": "longitudinal_diagonal_and_chevron_per_BS_5268_3",
        },
        "interface": {"bearing": "min_75mm_on_wall_plate", "fix": "truss_clip_or_skew_nail",
                      "bracing": "25x100_diagonal_bracing_at_45deg"},
        "procurement": {"typical_unit_cost_gbp": {"7.2m": 60, "9.0m": 90, "12m": 140}, "lead_time_days": 14,
                        "common_suppliers": ["MiTek", "Wolf Systems", "Donaldson Timber", "Scotts of Thrapston"]},
    },

    "cut_rafter": {
        "mass": {"material": "C24_regularised", "density_kg_m3": 420,
                 "mass_per_m_kg": {"47x100": 2.0, "47x125": 2.5, "47x150": 3.0, "47x175": 3.5, "47x200": 4.0}},
        "electrical": None, "thermal": {},
        "mechanical": {"birdsmouth": "max_one_third_rafter_depth", "bearing_on_wall_plate": "min_38mm_seat_cut",
                       "span_tables": "BS_EN_1995_or_TRADA"},
        "interface": {"ridge_fix": "nailed_to_ridge_board", "wall_plate": "birdsmouth_and_skew_nail"},
        "procurement": {"typical_unit_cost_gbp_per_m": 3.50, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },

    "ridge_board": {
        "mass": {"material": "C16_or_C24", "density_kg_m3": 370, "mass_per_m_kg": {"32x200": 2.4}},
        "electrical": None, "thermal": {},
        "mechanical": {"depth": "min_equal_to_rafter_plumb_cut_depth",
                       "function": "alignment_not_structural_in_traditional_couple_close"},
        "interface": {"rafter_fix": "nailed_through_ridge"},
        "procurement": {"typical_unit_cost_gbp_per_m": 3.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },

    "ceiling_joist": {
        "mass": {"material": "C16", "density_kg_m3": 370,
                 "mass_per_m_kg": {"47x100": 1.7, "47x125": 2.2, "47x50": 0.9}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "ceiling_support_loft_access_insulation_support",
                       "load": "non_habitable_loft_0.25kN_m2_plus_insulation"},
        "interface": {"fix": "nailed_to_wall_plate_and_rafter_foot"},
        "procurement": {"typical_unit_cost_gbp_per_m": 2.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },

    "gable_ladder": {
        "mass": {"material": "C16_38x38_treated", "density_kg_m3": 370, "typical_mass_kg": 5},
        "electrical": None, "thermal": {},
        "mechanical": {"overhang_mm": [300, 450, 600], "function": "supports_verge_soffit_and_bargeboard"},
        "interface": {"fix": "nailed_to_last_truss_and_gable_wall"},
        "procurement": {"typical_unit_cost_gbp_per_m": 4.00, "lead_time_days": 3,
                        "common_suppliers": ["Site_fabricated_or_truss_manufacturer"]},
    },

    "osb_sheathing": {
        "mass": {"material": "OSB_3_oriented_strand_board_BS_EN_300", "density_kg_m3": 600,
                 "mass_per_sheet_kg": {"9mm_1200x2400": 16, "11mm_1200x2400": 19, "15mm_1200x2400": 26}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.13, "vapour_resistance_MNs_g": {"9mm": 30, "11mm": 36}},
        "mechanical": {
            "racking_resistance_kn_m": {"9mm_2.4m_panel": 1.68, "11mm_2.4m_panel": 2.10},
            "nail_fixing": "63mm_ring_shank_at_150mm_perimeter_300mm_internal",
            "structural_use": "racking_and_diaphragm_action_per_BS_EN_12369",
        },
        "interface": {"fix": "63mm_ring_shank_nails_to_studs", "gap": "3mm_expansion_gap_between_boards"},
        "procurement": {"typical_unit_cost_gbp_per_sheet": {"9mm": 8, "11mm": 10, "15mm": 14}, "lead_time_days": 3,
                        "common_suppliers": ["Norbord", "Egger", "Kronospan", "Smartply"]},
    },

    "breather_membrane": {
        "mass": {"material": "spunbond_polypropylene_or_microporous_film", "typical_mass_g_per_m2": 120},
        "electrical": None,
        "thermal": {"sd_value_m": [0.02, 0.2], "vapour_open": True,
                    "water_resistance_W1": "BS_EN_13859_1"},
        "mechanical": {"tensile_strength_kn_m": [0.15, 0.5], "UV_resistance_months": [3, 4],
                       "BBA_certified": True},
        "interface": {"fix": "stapled_to_sheathing_lapped_150mm", "tape": "butyl_tape_at_joints_and_penetrations"},
        "procurement": {"typical_unit_cost_gbp_per_m2": 1.00, "lead_time_days": 3,
                        "common_suppliers": ["DuPont Tyvek", "Protect", "A Proctor Roofshield", "Siga"]},
    },

    "vcl_membrane": {
        "mass": {"material": "polyethylene_500_gauge_or_intelligent_variable", "typical_mass_g_per_m2": {"polythene": 90, "intelligent": 130}},
        "electrical": None,
        "thermal": {"sd_value_m": {"polythene": 50, "intelligent_Intello": [0.25, 10]},
                    "function": "prevents_interstitial_condensation"},
        "mechanical": {"standard": "BS_EN_13984"},
        "interface": {"fix": "stapled_to_studs_warm_side_of_insulation", "seal": "tape_all_joints_and_penetrations"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"polythene": 0.50, "intelligent": 3.00}, "lead_time_days": 3,
                        "common_suppliers": ["Visqueen", "pro clima Intello", "Siga Majpell", "A Proctor"]},
    },

    "mineral_wool_batt": {
        "mass": {"material": "glass_or_rock_mineral_wool", "density_kg_m3": {"glass_wool": 15, "rock_wool": 30},
                 "mass_per_m2_kg": {"100mm_glass": 1.5, "140mm_glass": 2.1, "140mm_rock": 4.2}},
        "electrical": None,
        "thermal": {
            "lambda_w_mk": {"glass_0.032": 0.032, "glass_0.035": 0.035, "rock_0.034": 0.034, "rock_0.037": 0.037},
            "U_value_140mm_wall": 0.27,
        },
        "mechanical": {"fire_class": "A1_non_combustible_BS_EN_13501", "compression_recovery": "friction_fit",
                       "width_mm": {"for_400cc": 370, "for_600cc": 570}},
        "interface": {"friction_fit": "cut_10mm_oversize", "fill": "no_gaps_no_compression"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"140mm_glass": 4, "140mm_rock": 7}, "lead_time_days": 3,
                        "common_suppliers": ["Knauf", "Isover/Saint-Gobain", "Rockwool", "Superglass"]},
    },

    "pir_insulation_board": {
        "mass": {"material": "polyisocyanurate_foil_faced", "density_kg_m3": 32,
                 "mass_per_m2_kg": {"50mm": 1.6, "75mm": 2.4, "100mm": 3.2}},
        "electrical": None,
        "thermal": {
            "lambda_w_mk": [0.021, 0.022],
            "U_value_50mm_addition": "significant_upgrade_when_added_externally",
        },
        "mechanical": {"compressive_strength_kpa": 150, "fire_class": "B_s1_d0_or_C_s2_d0",
                       "foil_facing": "low_emissivity_reflective"},
        "interface": {"fix": "adhesive_and_mechanical_fix", "joint": "tongue_groove_or_taped"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"50mm": 8, "75mm": 12, "100mm": 16}, "lead_time_days": 3,
                        "common_suppliers": ["Celotex", "Kingspan Kooltherm", "Recticel", "Xtratherm"]},
    },

    "timber_cladding_board": {
        "mass": {"material": {"larch": {"density_kg_m3": 470}, "western_red_cedar": {"density_kg_m3": 370},
                              "treated_softwood": {"density_kg_m3": 420}},
                 "mass_per_m2_kg": {"19mm_larch": 8.9, "19mm_cedar": 7.0}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.13},
        "mechanical": {
            "profiles": ["shiplap", "TGV", "featheredge", "channel", "open_rainscreen"],
            "durability_class": {"larch": 3, "cedar": 2, "treated_softwood": "UC3_Use_Class_3"},
            "fire": "consider_BS_9991_for_boundary_distance",
        },
        "interface": {"fix": "stainless_steel_ring_shank_nails_to_battens",
                      "batten": "25x50mm_treated_vertical_at_600mm",
                      "ventilated_cavity": "min_25mm_behind_cladding"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"larch": 15, "cedar": 25, "treated": 10}, "lead_time_days": 7,
                        "common_suppliers": ["Russwood", "Silva Timber", "Vincent Timber", "Marley Eternit"]},
    },

    "render_carrier_board": {
        "mass": {"material": "cement_particle_board_or_magnesium_oxide", "density_kg_m3": 1200,
                 "mass_per_m2_kg": {"12mm": 14}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.23},
        "mechanical": {"substrate_for": "through_colour_render_or_EWI_system",
                       "moisture_resistance": "high",
                       "standard": "BBA_certified_as_render_carrier"},
        "interface": {"fix": "stainless_screws_to_studs_through_sheathing",
                      "render_system": "basecoat_mesh_topcoat_EWI"},
        "procurement": {"typical_unit_cost_gbp_per_m2": 8.00, "lead_time_days": 7,
                        "common_suppliers": ["Cembrit", "Magply", "Viroc", "Euroform"]},
    },

    "cavity_closer": {
        "mass": {"material": "uPVC_or_EPS_insulated", "density_kg_m3": 30,
                 "typical_mass_g_per_m": 200},
        "electrical": None,
        "thermal": {"lambda_w_mk": 0.033, "function": "closes_cavity_at_openings_maintaining_thermal_line"},
        "mechanical": {"width_mm": [25, 50, 65, 75, 100]},
        "interface": {"fix": "clip_to_frame_or_screw_fix", "around": "window_door_reveals_heads_cills"},
        "procurement": {"typical_unit_cost_gbp_per_m": 3.00, "lead_time_days": 3,
                        "common_suppliers": ["Manthorpe", "Cavity Trays", "Timloc"]},
    },

    "wall_tie": {
        "mass": {"material": "stainless_steel_grade_304_or_316", "density_kg_m3": 7900,
                 "typical_mass_g": {"helical": 25, "wire_butterfly": 15}},
        "electrical": None,
        "thermal": {"thermal_bridging": "low_point_contact"},
        "mechanical": {
            "tensile_kn": {"helical": 1.5, "channel": 2.0},
            "embedment_masonry_mm": 62.5,
            "type": ["helical_screw_in", "channel_clip", "wire_butterfly"],
            "spacing": "2.5_per_m2_min_or_450mm_vert_x_900mm_horiz",
            "standard": "BS_EN_845_1_BS_5628",
        },
        "interface": {"inner_fix": "screw_into_stud_through_sheathing", "drip": "required_in_cavity"},
        "procurement": {"typical_unit_cost_gbp": 0.50, "lead_time_days": 3,
                        "common_suppliers": ["Ancon", "Leviat", "Heli-fix", "Wienerberger"]},
    },

    "framing_anchor": {
        "mass": {"material": "galvanised_steel_2.5mm_Z275", "density_kg_m3": 7850, "typical_mass_g": 80},
        "electrical": None, "thermal": {},
        "mechanical": {"capacity_kn": {"standard_60x40": 4.5}, "nail_type": "3.75x30mm_galv_connector_nails",
                       "standard": "BS_EN_14545_or_ETA"},
        "interface": {"fix": "nailed_both_faces"},
        "procurement": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 3,
                        "common_suppliers": ["Simpson Strong-Tie", "BPC", "Expamet"]},
    },

    "holddown_strap": {
        "mass": {"material": "galvanised_steel_2.5mm_x_30mm_Z275", "density_kg_m3": 7850,
                 "mass_per_m_g": 600},
        "electrical": None, "thermal": {},
        "mechanical": {
            "tensile_kn": {"30x2.5mm": 8.0, "30x5mm": 20.0},
            "function": "lateral_restraint_wall_to_floor_roof_to_wall",
            "standard": "BS_EN_14545_Building_Regs_Part_A",
            "strap_over_min_studs": 2,
        },
        "interface": {"fix": "nailed_with_connector_nails_min_8_per_strap"},
        "procurement": {"typical_unit_cost_gbp": 2.00, "lead_time_days": 3,
                        "common_suppliers": ["Simpson Strong-Tie", "BPC", "Expamet"]},
    },

    "nail_plate": {
        "mass": {"material": "galvanised_steel_1mm_punched_teeth", "density_kg_m3": 7850,
                 "typical_mass_g": {"100x150": 50}},
        "electrical": None, "thermal": {},
        "mechanical": {"function": "truss_node_connection_factory_pressed",
                       "capacity": "manufacturer_design_per_BS_EN_14250",
                       "tooth_length_mm": [8, 10, 12]},
        "interface": {"applied": "factory_hydraulic_press_both_faces_of_joint"},
        "procurement": {"typical_unit_cost_gbp": 0.30, "lead_time_days": 7,
                        "common_suppliers": ["MiTek", "ITW Alpine", "Wolf Systems"]},
    },

    "timber_connector": {
        "mass": {"material": "malleable_cast_iron_or_pressed_steel", "density_kg_m3": 7200,
                 "typical_mass_g": {"64mm_shear_plate": 150, "75mm_split_ring": 100}},
        "electrical": None, "thermal": {},
        "mechanical": {"shear_capacity_kn": {"64mm_shear_plate_M12": 12, "75mm_split_ring_M12": 15},
                       "bolt": "M12_or_M16_grade_4.6",
                       "standard": "BS_EN_1995_1_1_clause_8.9"},
        "interface": {"groove": "routed_into_timber_face_with_jig"},
        "procurement": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 7,
                        "common_suppliers": ["Simpson Strong-Tie", "Rothoblaas"]},
    },

    "service_batten": {
        "mass": {"material": "C16_or_treated_softwood", "density_kg_m3": 370,
                 "mass_per_m_kg": {"25x50": 0.5, "38x50": 0.7, "50x50": 0.9}},
        "electrical": None,
        "thermal": {"function": "creates_service_void_avoids_VCL_penetration"},
        "mechanical": {"depth_mm": [25, 38, 50], "function": "horizontal_battens_for_socket_runs_and_switch_drops"},
        "interface": {"fix": "screwed_through_VCL_to_studs", "seal": "VCL_sealed_behind_battens"},
        "procurement": {"typical_unit_cost_gbp_per_m": 1.00, "lead_time_days": 3,
                        "common_suppliers": ["Jewson", "Travis Perkins"]},
    },
}
