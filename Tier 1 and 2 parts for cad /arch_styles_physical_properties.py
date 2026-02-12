"""
ForgeOS — Architectural Styles Physical Properties
=====================================================
Georgian | Victorian | Tudor | Arts & Crafts | Neo-Classical
Art Deco | Edwardian/Brutalist | Contemporary
"""

ARCH_STYLES_PHYSICAL_PROPERTIES = {

    # ═══ GEORGIAN ═══

    "georgian_sash_window": {
        "mass": {"material": "softwood_or_hardwood_frame_float_glass", "density_kg_m3": None,
                 "typical_mass_kg": {"1050x1800_6o6": 45, "900x1500_6o6": 35}},
        "electrical": None,
        "thermal": {"U_value_w_m2k": {"single_glazed_original": 4.8, "slim_double_glazed_retrofit": 1.4},
                    "draft_proofing": "perimeter_brush_or_compression_seal"},
        "mechanical": {
            "glazing_bar_pattern": ["6_over_6", "3_over_6", "2_over_2", "1_over_1"],
            "operation": "vertical_sliding_sash_with_cords_weights_or_spiral_balance",
            "glass": {"original": "crown_or_cylinder_glass", "replacement": "slim_unit_heritage_double_glazing"},
            "proportions": "height_to_width_1.6_to_1.8_golden_ratio_derived",
            "listing_note": "Listed_buildings_require_like_for_like_LBC",
        },
        "interface": {"box_frame": "concealed_weight_pockets_in_reveals", "cill": "stone_projecting_with_throating",
                      "furniture": "sash_lifts_fasteners_pulleys"},
        "procurement": {"typical_unit_cost_gbp": {"softwood_single": 800, "hardwood_double": 2500, "heritage_slim_DG": 3500},
                        "lead_time_days": 42,
                        "common_suppliers": ["Ventrolla", "Mumford & Wood", "The Sash Window Workshop", "Masterframe"]},
    },

    "georgian_fanlight": {
        "mass": {"material": "timber_frame_leaded_or_glazing_bar_glass", "typical_mass_kg": 15},
        "electrical": None,
        "thermal": {"U_value_w_m2k": {"single": 4.8, "double_heritage": 1.6}},
        "mechanical": {"rays": [5, 7, 9, 11, 13], "pattern": ["radial", "spider_web", "batswing", "elliptical"],
                       "opening": "typically_fixed_non_opening"},
        "interface": {"fix": "built_into_door_frame_head", "transom_bar": "separates_fanlight_from_door"},
        "procurement": {"typical_unit_cost_gbp": 1200, "lead_time_days": 42,
                        "common_suppliers": ["Mumford & Wood", "specialist_joinery"]},
    },

    "georgian_dentil_cornice": {
        "mass": {"material": {"stone_Bath_Portland": {"density_kg_m3": 2200}, "stucco_render": {"density_kg_m3": 1800},
                              "GRP_reproduction": {"density_kg_m3": 1600}},
                 "typical_mass_kg_per_m": {"stone": 30, "stucco": 15, "GRP": 5}},
        "electrical": None,
        "thermal": {},
        "mechanical": {
            "elements": ["corona", "cymatium", "dentil_course", "bed_mould", "frieze"],
            "dentil_proportions": "width_equals_gap_or_2_to_3_ratio",
            "projection_mm": [150, 200, 300],
        },
        "interface": {"fix": {"stone": "dowelled_and_cramped", "GRP": "stainless_screws_to_timber_grounds"}},
        "procurement": {"typical_unit_cost_gbp_per_m": {"stone": 200, "stucco": 80, "GRP": 60}, "lead_time_days": 28,
                        "common_suppliers": ["Haddonstone", "Chilstone", "Aristocast", "Stevensons of Norwich"]},
    },

    "georgian_panelled_door": {
        "mass": {"material": "softwood_or_hardwood_solid_timber", "density_kg_m3": 500, "typical_mass_kg": 35},
        "electrical": None,
        "thermal": {"U_value_w_m2k": 3.0},
        "mechanical": {
            "panels": [4, 6, 8], "panel_type": "raised_and_fielded_or_flat",
            "thickness_mm": [44, 54], "surround": ["architrave", "pilaster_and_entablature", "porch"],
            "ironmongery": "brass_lever_letterbox_knocker",
        },
        "interface": {"frame": "hardwood_or_softwood_rebated", "threshold": "hardwood_or_stone_step"},
        "procurement": {"typical_unit_cost_gbp": {"softwood": 600, "hardwood_with_surround": 2500},
                        "lead_time_days": 28,
                        "common_suppliers": ["LPD Doors", "Todd Doors", "specialist_joinery"]},
    },

    "georgian_quoin": {
        "mass": {"material": {"Bath_stone": {"density_kg_m3": 2100}, "Portland_stone": {"density_kg_m3": 2300},
                              "cast_stone": {"density_kg_m3": 2200}},
                 "typical_mass_kg_per_block": {"400x225x100": 20}},
        "electrical": None, "thermal": {"lambda_w_mk": 1.5},
        "mechanical": {
            "pattern": "alternating_long_short_headers_and_stretchers",
            "finish": ["rubbed_ashlar", "rusticated_chamfered", "vermiculated"],
            "mortar": "NHL_3.5_lime_mortar_for_historic",
        },
        "interface": {"bond": "toothed_into_main_walling", "mortar_joint_mm": [3, 6]},
        "procurement": {"typical_unit_cost_gbp_per_block": {"natural": 40, "cast": 15}, "lead_time_days": 21,
                        "common_suppliers": ["Hartham Park", "Portland Stone Firms", "Haddonstone"]},
    },

    "georgian_iron_railing": {
        "mass": {"material": "wrought_iron_or_mild_steel_galv_painted", "density_kg_m3": 7850,
                 "typical_mass_kg_per_m": 20},
        "electrical": None, "thermal": {},
        "mechanical": {
            "bar_centres_mm": 115, "max_gap_100mm_Building_Regs_K": True,
            "finial_types": ["spear", "fleur_de_lis", "urn", "ball"],
            "height_mm": [900, 1050, 1200],
            "finish": "hot_dip_galvanised_plus_primer_plus_gloss",
        },
        "interface": {"fix": "cast_into_stone_plinth_with_lead_or_resin", "gate": "matching_style"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"reproduction_steel": 150, "wrought_iron": 400},
                        "lead_time_days": 42,
                        "common_suppliers": ["Metalcraft", "Alpha Rail", "British Spirals & Castings"]},
    },

    # ═══ VICTORIAN ═══

    "victorian_bay_window": {
        "mass": {"material": "timber_frame_masonry_or_rendered_base", "typical_mass_kg": {"canted_single_storey": 200}},
        "electrical": None,
        "thermal": {"U_value_w_m2k": {"original_single": 4.5, "upgraded_double": 1.4}},
        "mechanical": {
            "types": ["canted_3_sided", "square_3_sided", "curved_bow", "oriel_first_floor"],
            "angle_degrees": [30, 45, 60],
            "structural_support": {"ground_floor": "foundation_below", "first_floor": "corbelled_or_gallows_bracket"},
        },
        "interface": {"roof": "lead_flat_or_GRP_with_code_5_flashing"},
        "procurement": {"typical_unit_cost_gbp": {"timber_new": 5000, "uPVC_replacement": 2500}, "lead_time_days": 42,
                        "common_suppliers": ["specialist_joinery", "Residence_Collection"]},
    },

    "victorian_ridge_tile": {
        "mass": {"material": "hand_made_clay_or_machine_clay", "density_kg_m3": 1900, "typical_mass_kg": 3},
        "electrical": None, "thermal": {},
        "mechanical": {
            "types": ["half_round", "angular", "crested", "ornamental_with_finials"],
            "length_mm": [300, 450], "bedding": "1_3_lime_sand_mortar_or_dry_ridge_system",
        },
        "interface": {"bedding": "mortar_or_mechanical_dry_fix_BS_8612"},
        "procurement": {"typical_unit_cost_gbp": {"plain": 5, "crested": 15, "finial_terminal": 40}, "lead_time_days": 14,
                        "common_suppliers": ["Dreadnought Tiles", "Keymer", "Tudor Roof Tiles", "Marley"]},
    },

    "victorian_porch_column": {
        "mass": {"material": "softwood_turned_or_hardwood_or_cast_iron", "density_kg_m3": {"timber": 500, "cast_iron": 7200},
                 "typical_mass_kg": {"timber_2200": 8, "cast_iron_2200": 40}},
        "electrical": None, "thermal": {},
        "mechanical": {"diameter_mm": [75, 100, 125, 150], "profile": "lathe_turned_with_entasis",
                       "treatment": "primed_and_painted_or_stained"},
        "interface": {"base": "plinth_on_dwarf_wall", "top": "abacus_under_beam"},
        "procurement": {"typical_unit_cost_gbp": {"timber": 80, "cast_iron_repro": 250}, "lead_time_days": 21,
                        "common_suppliers": ["Richard Burbidge", "George Edwards", "Heritage Cast Iron"]},
    },

    "victorian_bargeboard": {
        "mass": {"material": "softwood_or_Western_Red_Cedar", "density_kg_m3": 420, "typical_mass_kg_per_m": 3},
        "electrical": None, "thermal": {},
        "mechanical": {"patterns": ["scalloped", "pierced", "fretwork", "Gothic_trefoil"],
                       "treatment": "painted_or_stained", "pendant": "drop_finial_at_apex"},
        "interface": {"fix": "screwed_to_rafter_feet_or_barge_rafter"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"simple": 15, "ornate_fretwork": 50}, "lead_time_days": 21,
                        "common_suppliers": ["specialist_joinery", "The House Nameplate Company"]},
    },

    "victorian_tile_hanging": {
        "mass": {"material": "clay_plain_tiles_hand_or_machine_made", "density_kg_m3": 1900,
                 "mass_per_m2_kg": {"plain": 60, "with_battens": 65}},
        "electrical": None,
        "thermal": {"additional_weather_protection": True},
        "mechanical": {
            "tile_size_mm": {"plain": "265x165", "club": "265x165_rounded", "scallop": "265x165_fish_scale"},
            "gauge_mm": [90, 100, 110], "lap_mm": [35, 65],
            "battens": "25x50mm_treated_at_gauge_centres",
        },
        "interface": {"underlay": "breather_membrane", "nailing": "2_nails_per_tile_every_tile_on_walls"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"machine": 40, "handmade": 70}, "lead_time_days": 14,
                        "common_suppliers": ["Dreadnought", "Keymer", "Sahtas", "Marley Eternit"]},
    },

    # ═══ TUDOR ═══

    "tudor_half_timber": {
        "mass": {"material": "green_oak_or_air_dried_oak", "density_kg_m3": {"green": 800, "air_dried": 650},
                 "typical_mass_kg_per_m2_wall": 40},
        "electrical": None,
        "thermal": {"U_value_w_m2k": "poor_without_insulation_consider_internal_IWI"},
        "mechanical": {
            "timber_sizes_mm": {"posts": "150x150", "rails": "150x100", "braces": "100x100"},
            "joints": ["mortise_and_tenon", "pegged", "half_lap", "scarf"],
            "infill": ["brick_nogging", "wattle_and_daub", "lime_plaster_on_lath"],
            "surface_treatment": "none_or_linseed_oil_lime_wash_infill_panels",
        },
        "interface": {"foundation": "padstone_or_plinth_wall", "pegging": "oak_drawbore_pegs"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"new_green_oak": 300, "reclaimed_oak": 500},
                        "lead_time_days": 56,
                        "common_suppliers": ["Oakwrights", "Border Oak", "Carpenter Oak", "T J Crump"]},
    },

    "tudor_herringbone_brick": {
        "mass": {"material": "handmade_clay_brick_soft_mud", "density_kg_m3": 1800,
                 "mass_per_m2_kg": 100},
        "electrical": None, "thermal": {},
        "mechanical": {"brick_size_mm": "215x102.5x65_or_Tudor_size_230x110x50",
                       "pattern": "herringbone_45_degree_within_timber_panels",
                       "mortar": "NHL_2_lime_putty_mortar_flush_pointing"},
        "interface": {"timber_frame": "bricks_wedged_into_grooves_in_timber_or_against_oak_pegs"},
        "procurement": {"typical_unit_cost_gbp_per_m2": 80, "lead_time_days": 14,
                        "common_suppliers": ["Michelmersh", "Imperial Bricks", "York Handmade"]},
    },

    "tudor_mullioned_window": {
        "mass": {"material": {"natural_stone": {"density_kg_m3": 2200}, "cast_stone": {"density_kg_m3": 2200}},
                 "typical_mass_kg": {"3_light_stone": 80}},
        "electrical": None,
        "thermal": {"U_value_w_m2k": {"leaded_single": 5.0, "secondary_glazing": 2.5}},
        "mechanical": {
            "lights": [2, 3, 4, 5, 6],
            "elements": ["mullion", "transom", "king_mullion", "hood_mould_label"],
            "glazing": "leaded_lights_diamond_or_rectangular_quarries",
            "opening": "iron_casement_within_stone_frame",
        },
        "interface": {"fix": "built_into_masonry_or_timber_frame_reveals"},
        "procurement": {"typical_unit_cost_gbp": {"cast_stone_3_light": 1500, "natural_stone": 4000},
                        "lead_time_days": 42,
                        "common_suppliers": ["Haddonstone", "Chilstone", "specialist_mason"]},
    },

    "tudor_chimney_stack": {
        "mass": {"material": "handmade_brick", "density_kg_m3": 1800,
                 "typical_mass_kg": {"3_flue_3m": 1200}},
        "electrical": None,
        "thermal": {"thermal_mass": "significant_heat_retention"},
        "mechanical": {
            "decorative_patterns": ["diaper_pattern", "spiral_twist", "star_pattern", "octagonal"],
            "string_courses": "projecting_bands_at_intervals",
            "chimney_pots": "ornamental_octagonal_or_cylindrical",
        },
        "interface": {"flashing": "code_5_lead_stepped_and_back_gutter", "DPC": "engineering_brick_or_slate"},
        "procurement": {"typical_unit_cost_gbp": {"plain_3_flue": 3000, "decorative": 8000}, "lead_time_days": 28,
                        "common_suppliers": ["specialist_bricklayer", "Michelmersh"]},
    },

    # ═══ ARTS & CRAFTS ═══

    "ac_catslide_dormer": {
        "mass": {"material": "timber_frame_tile_or_slate_clad", "typical_mass_kg": 150},
        "electrical": None,
        "thermal": {"insulation": "between_and_over_rafters"},
        "mechanical": {"roof_form": "swept_catslide_extending_main_roof_down",
                       "cheeks": "tile_hung_or_rendered", "window": "casement_leaded_or_plain"},
        "interface": {"roof": "tiles_continuous_from_main_roof", "flashing": "lead_soakers_and_stepped"},
        "procurement": {"typical_unit_cost_gbp": 5000, "lead_time_days": 28,
                        "common_suppliers": ["Specialist_carpenter_roofer"]},
    },

    "ac_inglenook_surround": {
        "mass": {"material": {"stone_surround": {"density_kg_m3": 2200}, "oak_beam": {"density_kg_m3": 650}},
                 "typical_mass_kg": 500},
        "electrical": None, "thermal": {"thermal_mass": "very_high_stone_and_brick"},
        "mechanical": {
            "opening_mm": {"width": [1200, 1500, 1800], "height": [900, 1050, 1200]},
            "beam": "massive_oak_bressummer_250x200mm_min",
            "seats": "stone_benches_within_recess",
            "fireback": "cast_iron_decorative",
        },
        "interface": {"flue": "large_gathering_to_flue_above", "hearth": "stone_or_brick_500mm_projection"},
        "procurement": {"typical_unit_cost_gbp": 8000, "lead_time_days": 56,
                        "common_suppliers": ["Specialist_stonemason", "Reclaimed_Materials"]},
    },

    "ac_leaded_casement": {
        "mass": {"material": "oak_or_softwood_frame_lead_came_glass", "typical_mass_kg": 12},
        "electrical": None,
        "thermal": {"U_value_w_m2k": {"single_leaded": 5.2, "secondary_glazed": 2.8}},
        "mechanical": {
            "lead_came": "H_section_6mm_cast_or_milled",
            "quarries": ["diamond", "rectangular", "bullseye_roundel"],
            "casement_stay": "wrought_iron_peg_type",
            "furniture": "black_wrought_iron_cockspur_fastener",
        },
        "interface": {"frame": "oak_rebated_and_weathered", "hinge": "wrought_iron_hook_and_band"},
        "procurement": {"typical_unit_cost_gbp": {"leaded_casement": 800, "stained_glass": 2000}, "lead_time_days": 42,
                        "common_suppliers": ["Specialist_leaded_light_workshop", "Leadbitter Glass"]},
    },

    # ═══ NEO-CLASSICAL ═══

    "classical_column": {
        "mass": {"material": {"Portland_stone": {"density_kg_m3": 2300}, "cast_stone": {"density_kg_m3": 2200},
                              "GRP_hollow": {"density_kg_m3": 200}},
                 "typical_mass_kg": {"stone_3m_300d": 500, "GRP_3m_300d": 30}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "orders": {
                "Doric": {"height_to_diameter": 8, "no_base": "Greek_Doric", "flutes": 20},
                "Ionic": {"height_to_diameter": 9, "volute_capital": True, "flutes": 24},
                "Corinthian": {"height_to_diameter": 10, "acanthus_capital": True, "flutes": 24},
            },
            "entasis": "slight_convex_curve_1_to_150_ratio",
            "structural": {"stone": "load_bearing", "GRP": "decorative_cladding_only"},
        },
        "interface": {"base": "attic_base_on_plinth", "entablature": "architrave_frieze_cornice_above"},
        "procurement": {"typical_unit_cost_gbp": {"cast_stone_3m": 3000, "GRP_3m": 600, "Portland_stone_3m": 15000},
                        "lead_time_days": {"stone": 84, "cast": 42, "GRP": 28},
                        "common_suppliers": ["Haddonstone", "Chilstone", "Architectural Heritage", "Kolumba"]},
    },

    "classical_pediment": {
        "mass": {"material": "stone_cast_stone_or_GRP", "typical_mass_kg": {"stone_4m": 600, "GRP_4m": 50}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "types": ["triangular", "segmental_arc", "broken_pediment", "swan_neck"],
            "pitch": "tympanum_pitch_12_to_18_degrees",
            "tympanum_decoration": ["plain", "coat_of_arms", "relief_sculpture"],
            "raking_cornice": "matches_horizontal_cornice_profile",
        },
        "interface": {"supported_on": "columns_or_pilasters", "fix": "dowelled_and_cramped"},
        "procurement": {"typical_unit_cost_gbp": {"cast_stone_4m": 5000, "GRP": 2000}, "lead_time_days": 42,
                        "common_suppliers": ["Haddonstone", "Stevensons of Norwich"]},
    },

    "classical_balustrade": {
        "mass": {"material": "stone_cast_stone_or_GRP", "density_kg_m3": {"stone": 2200, "GRP": 200},
                 "typical_mass_kg_per_m": {"stone": 80, "GRP": 8}},
        "electrical": None, "thermal": {},
        "mechanical": {
            "baluster_profiles": ["vase_turned", "bottle", "colonnette", "square_panelled"],
            "baluster_spacing_mm": [110, 130, 150],
            "height_mm": [750, 900, 1050],
            "building_regs": "100mm_max_gap_Part_K_if_guarding",
        },
        "interface": {"base": "continuous_plinth", "coping": "weathered_top_rail_with_drip"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"cast_stone": 200, "GRP": 60, "natural_stone": 600},
                        "lead_time_days": 28,
                        "common_suppliers": ["Haddonstone", "Chilstone", "Aristocast"]},
    },

    # ═══ ART DECO ═══

    "deco_crittall_window": {
        "mass": {"material": "hot_rolled_steel_W20_profile_16_20mm", "density_kg_m3": 7850,
                 "typical_mass_kg_per_m2": 25},
        "electrical": None,
        "thermal": {"U_value_w_m2k": {"single_original": 5.7, "heritage_double_thermal_break": 1.6},
                    "thermal_break": "polyamide_insert_in_modern_reproductions"},
        "mechanical": {
            "profile": "W20_hot_rolled_T_section_20mm_face_width",
            "glazing": {"original": "6mm_single", "replacement": "slim_14mm_heritage_DG"},
            "opening_lights": "side_hung_or_top_hung_casement",
            "finish": "galvanised_plus_powder_coat_RAL_7016_or_7021",
        },
        "interface": {"sub_frame": "steel_or_timber_outer_frame", "putty": "metal_casement_putty_or_dry_glazed"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"single": 500, "heritage_DG": 900},
                        "lead_time_days": 56,
                        "common_suppliers": ["Crittall Windows", "Steel Window Association members", "Clement"]},
    },

    "deco_sunburst_panel": {
        "mass": {"material": {"bronze": {"density_kg_m3": 8900}, "cast_aluminium": {"density_kg_m3": 2700},
                              "GRP_gilded": {"density_kg_m3": 1600}},
                 "typical_mass_kg": {"800mm_bronze": 15, "800mm_GRP": 3}},
        "electrical": {"backlighting": "optional_LED_warm_white_2700K"},
        "thermal": {},
        "mechanical": {"rays": [7, 9, 11, 13], "finish": ["polished_bronze", "gilt", "chrome", "painted"],
                       "motif": "sunrise_or_fountain_radiating_from_base_centre"},
        "interface": {"fix": "concealed_stud_fix_to_wall_or_above_door"},
        "procurement": {"typical_unit_cost_gbp": {"GRP": 300, "cast_aluminium": 1000, "bronze": 5000},
                        "lead_time_days": 42,
                        "common_suppliers": ["specialist_foundry", "Architectural_Metalworkers"]},
    },

    "deco_stepped_parapet": {
        "mass": {"material": "rendered_brick_or_concrete_or_faience", "density_kg_m3": 2000,
                 "typical_mass_kg_per_m": 200},
        "electrical": None,
        "thermal": {},
        "mechanical": {
            "steps": [2, 3, 4, 5], "symmetry": "symmetrical_ziggurat_or_asymmetric",
            "finish": ["smooth_render", "faience_tile", "terrazzo", "Vitrolite_glass"],
            "coping": "precast_concrete_or_stone_with_drip",
        },
        "interface": {"DPC": "under_coping", "flashing": "lead_or_GRP_behind_parapet"},
        "procurement": {"typical_unit_cost_gbp_per_m": 300, "lead_time_days": 28,
                        "common_suppliers": ["Specialist_renderer", "precast_manufacturer"]},
    },

    # ═══ BRUTALIST / MODERNIST ═══

    "brise_soleil": {
        "mass": {"material": {"concrete": {"density_kg_m3": 2400}, "aluminium": {"density_kg_m3": 2700},
                              "timber_accoya": {"density_kg_m3": 510}},
                 "typical_mass_kg_per_m2": {"concrete": 60, "aluminium": 8, "timber": 12}},
        "electrical": {"motorised_option": "24V_actuator_for_adjustable_louvres"},
        "thermal": {"solar_shading_g_factor_reduction": "0.3_to_0.5_depending_on_blade_angle",
                    "compliance": "Part_L_overheating_TM59"},
        "mechanical": {
            "blade_types": ["fixed_horizontal", "fixed_vertical", "adjustable_louvre", "perforated"],
            "blade_pitch_deg": [0, 15, 30, 45],
            "material": ["precast_concrete", "extruded_aluminium", "Accoya_timber", "terracotta"],
        },
        "interface": {"fix": "steel_outrigger_brackets_to_structure", "drainage": "drip_detail_at_blade_tip"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"aluminium": 200, "concrete": 300, "timber": 250},
                        "lead_time_days": 42,
                        "common_suppliers": ["Levolux", "Duco", "Renson", "Colt International"]},
    },

    "brutalist_balcony": {
        "mass": {"material": "reinforced_concrete_C32_40", "density_kg_m3": 2400,
                 "typical_mass_kg": {"3x1.5m_200mm": 2160}},
        "electrical": None,
        "thermal": {"thermal_bridge": "critical_Psi_0.5_to_1.0_requires_thermal_break",
                    "thermal_break_products": ["Schock_Isokorb", "Halfen_HIT"]},
        "mechanical": {
            "cantilever_mm": [1000, 1200, 1500, 2000],
            "slab_thickness_mm": [150, 180, 200, 250],
            "rebar": "T16_at_150_top_T12_at_200_bottom",
            "drainage": "1_in_60_fall_to_front_drip_edge",
            "finish": ["board_marked_fair_face", "bush_hammered", "smooth_shutter", "exposed_aggregate"],
        },
        "interface": {"thermal_break": "Isokorb_or_similar_BS_EN_ISO_10211", "waterproofing": "liquid_applied_membrane"},
        "procurement": {"typical_unit_cost_gbp": {"in_situ_concrete": 3000, "precast": 4000}, "lead_time_days": {"in_situ": 14, "precast": 28},
                        "common_suppliers": ["Specialist_RC_contractor", "Techrete", "Trent Concrete"]},
    },

    # ═══ CONTEMPORARY ═══

    "zinc_standing_seam_panel": {
        "mass": {"material": "titanium_zinc_EN_988", "density_kg_m3": 7150,
                 "mass_per_m2_kg": {"0.7mm": 5.0, "0.8mm": 5.7}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 110, "substrate": "plywood_18mm_on_breather_membrane"},
        "mechanical": {
            "thickness_mm": [0.65, 0.7, 0.8],
            "seam_height_mm": [25, 38, 65],
            "panel_width_mm": [330, 430, 530, 600],
            "finish": ["natural_pre_weathered", "ANTHRA_ZINC", "QUARTZ_ZINC", "AZENGAR"],
            "min_pitch_deg": 3,
            "expansion_mm_per_10m": 11,
        },
        "interface": {"clip": "stainless_steel_fixed_and_sliding_clips", "substrate": "18mm_plywood_on_counter_battens"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"material": 35, "installed": 120}, "lead_time_days": 14,
                        "common_suppliers": ["VMZINC", "Rheinzink", "Elzinc", "NedZink"]},
    },

    "frameless_glass_balustrade": {
        "mass": {"material": "toughened_laminated_glass_10_1.52_10mm", "density_kg_m3": 2500,
                 "typical_mass_kg_per_m2": 54},
        "electrical": None, "thermal": {},
        "mechanical": {
            "glass_type": "toughened_laminated_21.52mm_BS_EN_12150_BS_EN_14449",
            "height_mm": [1100, 1200],
            "channel": "aluminium_U_channel_base_fixed_or_side_fixed",
            "handrail": ["none", "stainless_circular_48mm", "stainless_rectangular"],
            "loading": "0.74kN_m_line_load_BS_EN_1991_1_1_barrier",
        },
        "interface": {"base_fix": "M12_resin_anchors_to_slab_edge", "channel": "grout_or_resin_packed"},
        "procurement": {"typical_unit_cost_gbp_per_m": {"base_fix_no_rail": 300, "base_fix_with_rail": 400},
                        "lead_time_days": 21,
                        "common_suppliers": ["Q-railing", "Balconette", "SHS Products", "Sadev"]},
    },

    "corten_panel": {
        "mass": {"material": "weathering_steel_BS_EN_10025_5_S355J2WP", "density_kg_m3": 7850,
                 "mass_per_m2_kg": {"2mm": 15.7, "3mm": 23.5, "4mm": 31.4}},
        "electrical": None,
        "thermal": {"lambda_w_mk": 50},
        "mechanical": {
            "thickness_mm": [2, 3, 4, 6],
            "weathering": "stable_rust_patina_forms_over_6_to_24_months",
            "staining_risk": "runoff_stains_adjacent_materials_manage_with_drainage",
            "perforated_option": True,
            "bending": "CNC_folded_to_profile",
        },
        "interface": {"fix": "stainless_steel_secret_fix_brackets_to_aluminium_subframe",
                      "subframe": "aluminium_T_or_L_rail_system"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"flat_3mm": 80, "folded_cassette": 150}, "lead_time_days": 28,
                        "common_suppliers": ["SSAB", "ArcelorMittal", "Hadley Group", "Kingspan Benchmark"]},
    },

    "perforated_metal_screen": {
        "mass": {"material": "aluminium_alloy_5005_or_3003_H14_or_anodised", "density_kg_m3": 2700,
                 "mass_per_m2_kg": {"2mm_30pct_open": 3.8, "3mm_40pct_open": 4.9}},
        "electrical": {"backlighting": "optional_LED_RGB_or_warm_white"},
        "thermal": {"solar_shading": "reduces_g_value_proportional_to_open_area"},
        "mechanical": {
            "thickness_mm": [2, 3, 4],
            "hole_pattern": ["round", "square", "slot", "hexagonal", "decorative_bespoke"],
            "open_area_pct": [20, 30, 40, 50, 60],
            "finish": ["mill", "anodised", "PPC_RAL", "PVDF", "sublimation_timber_effect"],
            "wind_load_design": "BS_EN_1991_1_4_Cp_per_open_area",
        },
        "interface": {"fix": "aluminium_Z_bracket_or_channel_system", "expansion": "slotted_holes_for_thermal_movement"},
        "procurement": {"typical_unit_cost_gbp_per_m2": {"standard_round": 80, "bespoke_pattern": 200},
                        "lead_time_days": 28,
                        "common_suppliers": ["RMIG", "Locker Group", "Metal Perforators", "Arrow Metal"]},
    },
}
