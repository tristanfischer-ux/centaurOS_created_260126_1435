"""
ForgeOS — Procurement & Cost Data
===================================
Overlay dict keyed by component slug.
Merge into PHYSICAL_PROPERTIES at runtime.
"""

PROCUREMENT_DATA = {
    # T1 Original
    "hex_bolt": {"typical_unit_cost_gbp": 0.03, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]},
    "hex_nut": {"typical_unit_cost_gbp": 0.02, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]},
    "socket_head_cap_screw": {"typical_unit_cost_gbp": 0.05, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]},
    "washer": {"typical_unit_cost_gbp": 0.01, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]},
    "heat_set_insert": {"typical_unit_cost_gbp": 0.08, "lead_time_days": 3, "common_suppliers": ["Ruthex", "CNC Kitchen", "McMaster"]},
    "standoff": {"typical_unit_cost_gbp": 0.10, "lead_time_days": 1, "common_suppliers": ["RS", "Wurth", "Harwin"]},
    "ball_bearing": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 1, "common_suppliers": ["RS", "SKF", "Simply Bearings"]},
    "sleeve_bearing": {"typical_unit_cost_gbp": 0.50, "lead_time_days": 1, "common_suppliers": ["RS", "Igus", "GGB"]},
    "usb_c_receptacle": {"typical_unit_cost_gbp": 0.30, "lead_time_days": 5, "common_suppliers": ["Molex", "TE", "LCSC"]},
    "barrel_jack": {"typical_unit_cost_gbp": 0.15, "lead_time_days": 3, "common_suppliers": ["RS", "CUI", "LCSC"]},
    "jst_connector": {"typical_unit_cost_gbp": 0.08, "lead_time_days": 3, "common_suppliers": ["RS", "JST", "LCSC"]},
    "round_tube": {"typical_unit_cost_gbp": 2.50, "lead_time_days": 3, "common_suppliers": ["Metals4U", "Aluminiumwarehouse"]},
    "square_tube": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 3, "common_suppliers": ["Metals4U", "Aluminiumwarehouse"]},
    "l_bracket": {"typical_unit_cost_gbp": 0.40, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]},
    # T1 Expansion
    "compression_spring": {"typical_unit_cost_gbp": 0.15, "lead_time_days": 3, "common_suppliers": ["RS", "Lee Spring", "Misumi"]},
    "torsion_spring": {"typical_unit_cost_gbp": 0.20, "lead_time_days": 5, "common_suppliers": ["RS", "Lee Spring"]},
    "shaft": {"typical_unit_cost_gbp": 1.50, "lead_time_days": 3, "common_suppliers": ["Metals4U", "Misumi", "Simply Bearings"]},
    "shaft_coupling_jaw": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Ruland"]},
    "spur_gear": {"typical_unit_cost_gbp": 2.50, "lead_time_days": 5, "common_suppliers": ["RS", "Misumi", "HPC Gears"]},
    "timing_pulley": {"typical_unit_cost_gbp": 1.80, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Gates"]},
    "lead_screw": {"typical_unit_cost_gbp": 4.00, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Igus"]},
    "linear_rail": {"typical_unit_cost_gbp": 6.00, "lead_time_days": 5, "common_suppliers": ["RS", "Misumi", "Hiwin"]},
    "o_ring": {"typical_unit_cost_gbp": 0.05, "lead_time_days": 1, "common_suppliers": ["RS", "Seals Direct"]},
    "circlip": {"typical_unit_cost_gbp": 0.05, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]},
    "dowel_pin": {"typical_unit_cost_gbp": 0.10, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Accu"]},
    "keyway_key": {"typical_unit_cost_gbp": 0.15, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi"]},
    "aluminium_extrusion": {"typical_unit_cost_gbp": 3.50, "lead_time_days": 3, "common_suppliers": ["Ooznest", "OpenBuilds", "Misumi"]},
    "corner_bracket_extrusion": {"typical_unit_cost_gbp": 0.60, "lead_time_days": 1, "common_suppliers": ["Ooznest", "OpenBuilds"]},
    "t_nut": {"typical_unit_cost_gbp": 0.08, "lead_time_days": 1, "common_suppliers": ["Ooznest", "OpenBuilds", "Misumi"]},
    "din_rail": {"typical_unit_cost_gbp": 2.00, "lead_time_days": 1, "common_suppliers": ["RS", "Phoenix Contact"]},
    "rivet": {"typical_unit_cost_gbp": 0.02, "lead_time_days": 1, "common_suppliers": ["RS", "Screwfix"]},
    "threaded_rod": {"typical_unit_cost_gbp": 1.50, "lead_time_days": 1, "common_suppliers": ["RS", "Screwfix", "Metals4U"]},
    "set_screw": {"typical_unit_cost_gbp": 0.03, "lead_time_days": 1, "common_suppliers": ["RS", "Accu", "Misumi"]},
    "levelling_foot": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Essentra"]},
    "rubber_foot": {"typical_unit_cost_gbp": 0.10, "lead_time_days": 1, "common_suppliers": ["RS", "Essentra"]},
    "cable_gland": {"typical_unit_cost_gbp": 0.25, "lead_time_days": 1, "common_suppliers": ["RS", "Lapp", "Wiska"]},
    "hinge_butt": {"typical_unit_cost_gbp": 0.50, "lead_time_days": 1, "common_suppliers": ["RS", "Misumi", "Screwfix"]},
    "p_clip": {"typical_unit_cost_gbp": 0.10, "lead_time_days": 1, "common_suppliers": ["RS", "Screwfix"]},
    "compression_fitting": {"typical_unit_cost_gbp": 1.50, "lead_time_days": 1, "common_suppliers": ["Screwfix", "Plumbworld"]},
    "push_fit_connector": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 1, "common_suppliers": ["RS", "Festo", "John Guest"]},
    "thrust_washer": {"typical_unit_cost_gbp": 0.30, "lead_time_days": 3, "common_suppliers": ["RS", "Igus"]},
    # T2 Original
    "brushless_motor_outrunner": {"typical_unit_cost_gbp": 8.00, "lead_time_days": 5, "common_suppliers": ["HobbyKing", "T-Motor"]},
    "brushless_motor_pancake": {"typical_unit_cost_gbp": 15.00, "lead_time_days": 7, "common_suppliers": ["T-Motor", "Allied Motion"]},
    "stepper_motor_nema": {"typical_unit_cost_gbp": 8.00, "lead_time_days": 3, "common_suppliers": ["RS", "StepperOnline", "OMC"]},
    "pcb_board": {"typical_unit_cost_gbp": 2.00, "lead_time_days": 7, "common_suppliers": ["JLCPCB", "PCBWay", "Aisler"]},
    "tactile_switch": {"typical_unit_cost_gbp": 0.05, "lead_time_days": 3, "common_suppliers": ["RS", "Omron", "LCSC"]},
    "axial_fan": {"typical_unit_cost_gbp": 2.50, "lead_time_days": 3, "common_suppliers": ["RS", "Noctua", "Sunon"]},
    "centrifugal_pump": {"typical_unit_cost_gbp": 8.00, "lead_time_days": 5, "common_suppliers": ["RS", "Amazon", "Kamoer"]},
    # T2 Expansion
    "servo_motor": {"typical_unit_cost_gbp": 2.00, "lead_time_days": 3, "common_suppliers": ["RS", "HobbyKing", "Amazon"]},
    "dc_gearmotor": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 5, "common_suppliers": ["RS", "Pololu", "Amazon"]},
    "solenoid_linear": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 5, "common_suppliers": ["RS", "Mecalectro"]},
    "relay_module": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 3, "common_suppliers": ["RS", "Omron", "Finder"]},
    "voltage_regulator_module": {"typical_unit_cost_gbp": 1.50, "lead_time_days": 3, "common_suppliers": ["RS", "Amazon", "LCSC"]},
    "oled_display": {"typical_unit_cost_gbp": 2.00, "lead_time_days": 5, "common_suppliers": ["RS", "Amazon", "Pimoroni"]},
    "limit_switch": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 1, "common_suppliers": ["RS", "Omron", "Cherry"]},
    "heatsink_extruded": {"typical_unit_cost_gbp": 1.50, "lead_time_days": 3, "common_suppliers": ["RS", "Misumi", "Fischer"]},
    "terminal_block": {"typical_unit_cost_gbp": 0.20, "lead_time_days": 3, "common_suppliers": ["RS", "Phoenix Contact", "Wago"]},
    "led_indicator": {"typical_unit_cost_gbp": 0.03, "lead_time_days": 3, "common_suppliers": ["RS", "LCSC", "Kingbright"]},
    "piezo_buzzer": {"typical_unit_cost_gbp": 0.20, "lead_time_days": 3, "common_suppliers": ["RS", "Murata", "LCSC"]},
    "rotary_encoder": {"typical_unit_cost_gbp": 0.50, "lead_time_days": 3, "common_suppliers": ["RS", "Alps", "Bourns"]},
    "battery_holder_18650": {"typical_unit_cost_gbp": 0.40, "lead_time_days": 3, "common_suppliers": ["RS", "Keystone", "LCSC"]},
    # T3 Vertical Farming
    "nft_channel": {"typical_unit_cost_gbp": 8.00, "lead_time_days": 7, "common_suppliers": ["CropKing", "Nutriculture"]},
    "led_grow_light_bar": {"typical_unit_cost_gbp": 25.00, "lead_time_days": 7, "common_suppliers": ["Samsung LED", "HLG", "Digikey"]},
    "grow_tray": {"typical_unit_cost_gbp": 5.00, "lead_time_days": 3, "common_suppliers": ["Nutriculture", "Amazon"]},
    "net_pot": {"typical_unit_cost_gbp": 0.05, "lead_time_days": 3, "common_suppliers": ["GroWell", "Amazon"]},
    "nutrient_reservoir": {"typical_unit_cost_gbp": 15.00, "lead_time_days": 3, "common_suppliers": ["Nutriculture", "IWS"]},
    "sensor_probe": {"typical_unit_cost_gbp": 15.00, "lead_time_days": 5, "common_suppliers": ["Atlas Scientific", "DFRobot"]},
    "drip_emitter": {"typical_unit_cost_gbp": 0.10, "lead_time_days": 3, "common_suppliers": ["Netafim", "Jain"]},
    "vertical_tower_section": {"typical_unit_cost_gbp": 4.00, "lead_time_days": 7, "common_suppliers": ["Mr. Stacky"]},
    # T3 Drones
    "propeller_airfoil": {"typical_unit_cost_gbp": 2.00, "lead_time_days": 3, "common_suppliers": ["HQProp", "Gemfan", "T-Motor"]},
    "fpv_camera": {"typical_unit_cost_gbp": 15.00, "lead_time_days": 5, "common_suppliers": ["Caddx", "RunCam", "Foxeer"]},
    "esc_board": {"typical_unit_cost_gbp": 10.00, "lead_time_days": 5, "common_suppliers": ["SpeedyBee", "T-Motor", "Holybro"]},
    "gps_module": {"typical_unit_cost_gbp": 12.00, "lead_time_days": 5, "common_suppliers": ["Holybro", "Matek", "u-blox"]},
    "lipo_battery_pack": {"typical_unit_cost_gbp": 18.00, "lead_time_days": 3, "common_suppliers": ["Tattu", "CNHL", "GNB"]},
    "cylindrical_cell_18650": {"typical_unit_cost_gbp": 3.50, "lead_time_days": 5, "common_suppliers": ["Nkon", "Fogstar"]},
    "sma_antenna": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 3, "common_suppliers": ["TBS", "ImmersionRC", "RS"]},
    "frame_plate": {"typical_unit_cost_gbp": 12.00, "lead_time_days": 5, "common_suppliers": ["iFlight", "Diatone", "Armattan"]},
    # T3 BSF
    "breeding_cage": {"typical_unit_cost_gbp": 40.00, "lead_time_days": 14, "common_suppliers": ["Custom fabrication"]},
    "egg_collection_plate": {"typical_unit_cost_gbp": 0.20, "lead_time_days": 1, "common_suppliers": ["Custom cut"]},
    "larvae_rearing_tray": {"typical_unit_cost_gbp": 3.00, "lead_time_days": 5, "common_suppliers": ["Custom mould"]},
    "ventilation_louvre": {"typical_unit_cost_gbp": 5.00, "lead_time_days": 5, "common_suppliers": ["Vent-Axia", "Manrose"]},
    "harvesting_screen": {"typical_unit_cost_gbp": 15.00, "lead_time_days": 7, "common_suppliers": ["MeshDirect", "Locker Group"]},
    # T3 Brine
    "pressure_vessel": {"typical_unit_cost_gbp": 5000.00, "lead_time_days": 60, "common_suppliers": ["Custom fabrication"]},
    "hydrocyclone": {"typical_unit_cost_gbp": 2000.00, "lead_time_days": 30, "common_suppliers": ["Weir Minerals", "FLSmidth"]},
    "crystalliser_vessel": {"typical_unit_cost_gbp": 15000.00, "lead_time_days": 90, "common_suppliers": ["Custom fabrication"]},
    "filter_press_plate": {"typical_unit_cost_gbp": 80.00, "lead_time_days": 14, "common_suppliers": ["Andritz", "MSE"]},
    "product_hopper": {"typical_unit_cost_gbp": 500.00, "lead_time_days": 21, "common_suppliers": ["Custom fabrication"]},
    "pipe_flange": {"typical_unit_cost_gbp": 8.00, "lead_time_days": 5, "common_suppliers": ["RS", "Prochem", "BSS"]},
    "control_valve": {"typical_unit_cost_gbp": 300.00, "lead_time_days": 21, "common_suppliers": ["Fisher/Emerson", "Samson", "Spirax"]},
    # T3 EPS
    "eps_block": {"typical_unit_cost_gbp": 25.00, "lead_time_days": 3, "common_suppliers": ["Jablite", "Sundolitt"]},
    "hot_wire_cutter_frame": {"typical_unit_cost_gbp": 60.00, "lead_time_days": 7, "common_suppliers": ["Proxxon", "Custom"]},
    "reinforcing_mesh_panel": {"typical_unit_cost_gbp": 1.50, "lead_time_days": 3, "common_suppliers": ["Weber", "Sto", "Baumit"]},
    "corner_bead": {"typical_unit_cost_gbp": 0.80, "lead_time_days": 3, "common_suppliers": ["Weber", "Sto", "Baumit"]},
    "anchor_bracket": {"typical_unit_cost_gbp": 0.12, "lead_time_days": 3, "common_suppliers": ["Ejot", "Fischer", "SFS"]},
    "surface_texture_panel": {"typical_unit_cost_gbp": 6.00, "lead_time_days": 7, "common_suppliers": ["EPS Facades", "SPS Envirowall"]},
    # T3 CubeSat
    "cubesat_frame": {"typical_unit_cost_gbp": 800.00, "lead_time_days": 30, "common_suppliers": ["ISIS", "Pumpkin", "Endurosat"]},
    "solar_panel_cubesat": {"typical_unit_cost_gbp": 1500.00, "lead_time_days": 60, "common_suppliers": ["ISIS", "DHV", "SpectroLab"]},
    "reaction_wheel": {"typical_unit_cost_gbp": 3000.00, "lead_time_days": 60, "common_suppliers": ["CubeSpace", "NewSpace Systems"]},
    "magnetorquer": {"typical_unit_cost_gbp": 500.00, "lead_time_days": 30, "common_suppliers": ["ISIS", "NewSpace Systems"]},
    "star_tracker": {"typical_unit_cost_gbp": 5000.00, "lead_time_days": 60, "common_suppliers": ["CubeSpace", "Berlin Space Tech"]},
    "patch_antenna_cubesat": {"typical_unit_cost_gbp": 1000.00, "lead_time_days": 30, "common_suppliers": ["ISIS", "Endurosat"]},
    "deployable_antenna": {"typical_unit_cost_gbp": 2000.00, "lead_time_days": 45, "common_suppliers": ["ISIS", "Endurosat"]},
    "separation_spring": {"typical_unit_cost_gbp": 15.00, "lead_time_days": 14, "common_suppliers": ["Lee Spring", "custom"]},
    "kill_switch": {"typical_unit_cost_gbp": 5.00, "lead_time_days": 7, "common_suppliers": ["Omron", "C&K"]},
    "cold_gas_thruster": {"typical_unit_cost_gbp": 8000.00, "lead_time_days": 90, "common_suppliers": ["Vacco", "NanoAvionics", "Enpulsion"]},
}


def merge_procurement(physical_properties):
    """Merge procurement data into PHYSICAL_PROPERTIES dict."""
    for slug, proc in PROCUREMENT_DATA.items():
        if slug in physical_properties:
            physical_properties[slug]["procurement"] = proc
