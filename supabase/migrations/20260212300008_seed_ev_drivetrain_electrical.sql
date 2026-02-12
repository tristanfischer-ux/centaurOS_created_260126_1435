-- ============================================================
-- ForgeOS Component Geometry Library — EV Drivetrain & Electrical
-- Migration: 20260212300008_seed_ev_drivetrain_electrical
-- ============================================================
-- Seeds 12 EV/automotive drivetrain and electrical components
--
-- Components:
--   1. hub_motor            (motor)
--   2. mid_drive_motor      (motor)
--   3. traction_motor       (motor)
--   4. motor_controller_ev  (electrical)
--   5. reduction_gearbox    (drivetrain)
--   6. cv_joint             (drivetrain)
--   7. chain_sprocket       (drivetrain)
--   8. battery_module_ev    (battery)
--   9. bms_board            (electrical)
--  10. charging_port        (connector)
--  11. hv_contactor         (electrical)
--  12. wiring_connector_deutsch (connector)
-- ============================================================

-- 1. Hub Motor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'hub_motor',
    'Hub Motor (E-Bike)',
    'domain',
    'motor',
$CADQUERY$
def hub_motor(params):
    """Cylindrical hub motor with spoke holes, axle bore, and cable exit."""
    od = params.get("od", 200)
    width = params.get("width", 50)
    shell_t = params.get("shell_thickness", 4)
    axle_d = params.get("axle_diameter", 14)
    spoke_count = params.get("spoke_count", 36)
    spoke_hole_d = params.get("spoke_hole_diameter", 3)
    spoke_pcd = params.get("spoke_pcd", 80)

    r = od / 2
    # Outer shell cylinder
    shell = (cq.Workplane("XY")
        .circle(r).circle(r - shell_t)
        .extrude(width))
    # End caps
    cap = (cq.Workplane("XY")
        .circle(r).circle(axle_d / 2 + 4)
        .extrude(shell_t))
    cap_top = cap.translate((0, 0, width - shell_t))
    shell = shell.union(cap).union(cap_top)
    # Axle bore is already open via inner circle
    # Spoke holes on both flanges
    for z in [shell_t / 2, width - shell_t / 2]:
        holes = (cq.Workplane("XY").workplane(offset=z)
            .polarArray(spoke_pcd / 2, 0, 360, spoke_count)
            .circle(spoke_hole_d / 2).extrude(shell_t + 1, both=True))
        shell = shell.cut(holes)
    # Cable exit flat
    cable_exit = (cq.Workplane("XZ")
        .workplane(offset=r - 2)
        .rect(12, width * 0.4).extrude(6))
    shell = shell.cut(cable_exit)
    return shell
$CADQUERY$,
    '{"od": {"type": "number", "default": 200, "unit": "mm"}, "width": {"type": "number", "default": 50, "unit": "mm"}, "shell_thickness": {"type": "number", "default": 4, "unit": "mm"}, "axle_diameter": {"type": "number", "default": 14, "unit": "mm"}, "spoke_count": {"type": "number", "default": 36}, "spoke_hole_diameter": {"type": "number", "default": 3, "unit": "mm"}, "spoke_pcd": {"type": "number", "default": 80, "unit": "mm"}}'::jsonb,
    '[{"name": "axle", "type": "bore", "diameter_mm": 14}, {"name": "spokes", "type": "bolt_circle", "count": 36, "pcd_mm": 80}]'::jsonb,
    ARRAY['hub_motor', 'e-bike', 'wheel_motor', '500W', 'bldc'],
    '#404040',
    'Cylindrical hub motor with spoke holes, axle bore, and cable exit. Typical 500W 26-inch e-bike motor with 36 spoke holes and 14mm axle.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 2. Mid Drive Motor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'mid_drive_motor',
    'Mid-Drive Motor (Bafang-style)',
    'domain',
    'motor',
$CADQUERY$
def mid_drive_motor(params):
    """Bafang-style bottom bracket mid-drive motor with gearbox housing and chainring output."""
    motor_d = params.get("motor_diameter", 90)
    motor_l = params.get("motor_length", 80)
    gear_w = params.get("gearbox_width", 110)
    gear_h = params.get("gearbox_height", 100)
    gear_d = params.get("gearbox_depth", 55)
    bb_d = params.get("bb_tube_diameter", 34)
    bb_l = params.get("bb_tube_length", 68)
    chainring_od = params.get("chainring_od", 170)
    chainring_t = params.get("chainring_thickness", 3)

    # Motor cylinder
    motor = (cq.Workplane("YZ")
        .circle(motor_d / 2).extrude(motor_l))
    # Gearbox housing
    gearbox = (cq.Workplane("XY")
        .rect(gear_w, gear_d).extrude(gear_h)
        .edges("|Z").fillet(6)
        .translate((0, 0, -gear_h / 2 + motor_d / 2)))
    result = motor.union(gearbox)
    # Bottom bracket tube
    bb_tube = (cq.Workplane("YZ")
        .circle(bb_d / 2).extrude(bb_l)
        .translate((-bb_l / 2 + gear_w / 2, 0, -gear_h / 2 + motor_d / 2)))
    result = result.union(bb_tube)
    # Chainring disc
    chainring = (cq.Workplane("YZ")
        .circle(chainring_od / 2).circle(chainring_od / 2 - 12)
        .extrude(chainring_t)
        .translate((gear_w / 2 + 5, 0, -gear_h / 2 + motor_d / 2)))
    result = result.union(chainring)
    # Connector boss
    connector = (cq.Workplane("XZ")
        .workplane(offset=-gear_d / 2)
        .rect(20, 14).extrude(8)
        .translate((20, 0, -gear_h / 2 + motor_d / 2 + gear_h - 10)))
    result = result.union(connector)
    return result
$CADQUERY$,
    '{"motor_diameter": {"type": "number", "default": 90, "unit": "mm"}, "motor_length": {"type": "number", "default": 80, "unit": "mm"}, "gearbox_width": {"type": "number", "default": 110, "unit": "mm"}, "gearbox_height": {"type": "number", "default": 100, "unit": "mm"}, "gearbox_depth": {"type": "number", "default": 55, "unit": "mm"}, "bb_tube_diameter": {"type": "number", "default": 34, "unit": "mm"}, "bb_tube_length": {"type": "number", "default": 68, "unit": "mm"}, "chainring_od": {"type": "number", "default": 170, "unit": "mm"}, "chainring_thickness": {"type": "number", "default": 3, "unit": "mm"}}'::jsonb,
    '[{"name": "bottom_bracket", "type": "tube", "diameter_mm": 34, "length_mm": 68}, {"name": "chainring", "type": "sprocket", "od_mm": 170}]'::jsonb,
    ARRAY['mid_drive', 'bafang', 'e-bike', 'bottom_bracket', 'torque_sensor'],
    '#404040',
    'Bafang-style bottom bracket mid-drive motor with rectangular gearbox housing, motor cylinder, chainring output, BB tube, and signal connector.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 3. Traction Motor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'traction_motor',
    'EV Traction Motor (IPM/PMSM)',
    'domain',
    'motor',
$CADQUERY$
def traction_motor(params):
    """Large EV traction motor with cooling ribs, mounting flange, splined output shaft, and resolver plug."""
    od = params.get("od", 250)
    length = params.get("length", 280)
    shell_t = params.get("shell_thickness", 6)
    flange_od = params.get("flange_od", 290)
    flange_t = params.get("flange_thickness", 15)
    shaft_d = params.get("shaft_diameter", 30)
    shaft_l = params.get("shaft_protrusion", 50)
    rib_count = params.get("rib_count", 24)
    rib_h = params.get("rib_height", 5)
    bolt_count = params.get("flange_bolt_count", 8)
    bolt_pcd = params.get("flange_bolt_pcd", 270)
    bolt_d = params.get("flange_bolt_diameter", 10)

    r = od / 2
    # Main housing cylinder
    body = (cq.Workplane("XY")
        .circle(r).circle(r - shell_t)
        .extrude(length))
    # Cooling ribs on outer surface
    for i in range(rib_count):
        angle = i * (360 / rib_count)
        rib = (cq.Workplane("XY")
            .transformed(rotate=(0, 0, angle))
            .center(r + rib_h / 2, 0)
            .rect(rib_h, 3).extrude(length - flange_t))
        body = body.union(rib)
    # Mounting flange at drive end
    flange = (cq.Workplane("XY")
        .circle(flange_od / 2).circle(shaft_d / 2 + 8)
        .extrude(flange_t))
    # Flange bolt holes
    flange_holes = (cq.Workplane("XY")
        .polarArray(bolt_pcd / 2, 0, 360, bolt_count)
        .circle(bolt_d / 2).extrude(flange_t))
    flange = flange.cut(flange_holes)
    body = body.union(flange)
    # Output shaft
    shaft = (cq.Workplane("XY")
        .circle(shaft_d / 2).extrude(shaft_l)
        .translate((0, 0, -shaft_l)))
    body = body.union(shaft)
    # Resolver plug boss
    resolver = (cq.Workplane("XZ")
        .workplane(offset=r)
        .center(0, length - 30)
        .circle(10).extrude(12))
    body = body.union(resolver)
    return body
$CADQUERY$,
    '{"od": {"type": "number", "default": 250, "unit": "mm"}, "length": {"type": "number", "default": 280, "unit": "mm"}, "shell_thickness": {"type": "number", "default": 6, "unit": "mm"}, "flange_od": {"type": "number", "default": 290, "unit": "mm"}, "flange_thickness": {"type": "number", "default": 15, "unit": "mm"}, "shaft_diameter": {"type": "number", "default": 30, "unit": "mm"}, "shaft_protrusion": {"type": "number", "default": 50, "unit": "mm"}, "rib_count": {"type": "number", "default": 24}, "flange_bolt_count": {"type": "number", "default": 8}, "flange_bolt_pcd": {"type": "number", "default": 270, "unit": "mm"}}'::jsonb,
    '[{"name": "mounting_flange", "type": "bolt_circle", "count": 8, "pcd_mm": 270, "bolt_mm": 10}, {"name": "output_shaft", "type": "splined_shaft", "diameter_mm": 30}, {"name": "resolver", "type": "connector", "diameter_mm": 20}]'::jsonb,
    ARRAY['traction_motor', 'IPM', 'PMSM', 'EV', 'liquid_cooled', 'splined_shaft'],
    '#404040',
    'Large EV traction motor (IPM/PMSM) with cooling ribs, mounting flange with bolt holes, splined output shaft, and resolver plug. Suitable for 50-200kW applications.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 4. Motor Controller (EV)
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'motor_controller_ev',
    'EV Motor Controller',
    'domain',
    'electrical',
$CADQUERY$
def motor_controller_ev(params):
    """Aluminium controller box with heatsink fins, HV bus bar studs, phase terminals, and signal connector."""
    box_l = params.get("length", 220)
    box_w = params.get("width", 180)
    box_h = params.get("height", 60)
    wall_t = params.get("wall_thickness", 4)
    fin_count = params.get("fin_count", 16)
    fin_h = params.get("fin_height", 15)
    fin_t = params.get("fin_thickness", 2)
    flange_w = params.get("flange_width", 18)
    stud_d = params.get("stud_diameter", 8)

    # Main box
    body = (cq.Workplane("XY")
        .rect(box_l, box_w).extrude(box_h)
        .edges("|Z").fillet(4))
    # Hollow interior
    cavity = (cq.Workplane("XY").workplane(offset=wall_t)
        .rect(box_l - wall_t * 2, box_w - wall_t * 2)
        .extrude(box_h - wall_t))
    body = body.cut(cavity)
    # Heatsink fins on bottom
    fin_spacing = (box_l - 20) / fin_count
    for i in range(fin_count):
        x = -box_l / 2 + 10 + i * fin_spacing + fin_spacing / 2
        fin = (cq.Workplane("XY")
            .center(x, 0)
            .rect(fin_t, box_w - 20).extrude(-fin_h))
        body = body.union(fin)
    # Mounting flanges with holes (4 corners)
    for sx in [-1, 1]:
        for sy in [-1, 1]:
            ear = (cq.Workplane("XY")
                .center(sx * (box_l / 2 + flange_w / 2), sy * (box_w / 2 - 15))
                .rect(flange_w, 30).extrude(wall_t))
            hole = (cq.Workplane("XY")
                .center(sx * (box_l / 2 + flange_w / 2), sy * (box_w / 2 - 15))
                .circle(3).extrude(wall_t))
            body = body.union(ear).cut(hole)
    # HV bus bar studs (2x on one end)
    for sy_off in [-25, 25]:
        stud = (cq.Workplane("XY").workplane(offset=box_h)
            .center(box_l / 2 - 20, sy_off)
            .circle(stud_d / 2).extrude(15))
        body = body.union(stud)
    # Phase output terminals (3x on other end)
    for idx, sy_off in enumerate([-30, 0, 30]):
        term = (cq.Workplane("XY").workplane(offset=box_h)
            .center(-box_l / 2 + 20, sy_off)
            .circle(stud_d / 2).extrude(12))
        body = body.union(term)
    # Signal connector
    conn = (cq.Workplane("XZ")
        .workplane(offset=box_w / 2)
        .center(0, box_h / 2)
        .rect(30, 14).extrude(10))
    body = body.union(conn)
    return body
$CADQUERY$,
    '{"length": {"type": "number", "default": 220, "unit": "mm"}, "width": {"type": "number", "default": 180, "unit": "mm"}, "height": {"type": "number", "default": 60, "unit": "mm"}, "wall_thickness": {"type": "number", "default": 4, "unit": "mm"}, "fin_count": {"type": "number", "default": 16}, "fin_height": {"type": "number", "default": 15, "unit": "mm"}, "stud_diameter": {"type": "number", "default": 8, "unit": "mm"}}'::jsonb,
    '[{"name": "hv_bus_studs", "type": "stud", "count": 2, "diameter_mm": 8}, {"name": "phase_terminals", "type": "stud", "count": 3, "diameter_mm": 8}, {"name": "signal_connector", "type": "rectangular", "width_mm": 30, "height_mm": 14}]'::jsonb,
    ARRAY['motor_controller', 'inverter', 'FOC', 'heatsink', 'IGBT', 'EV'],
    '#808080',
    'Aluminium EV motor controller box with heatsink fins, HV bus bar studs, 3-phase output terminals, signal connector, and mounting flanges.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 5. Reduction Gearbox
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'reduction_gearbox',
    'EV Reduction Gearbox',
    'domain',
    'drivetrain',
$CADQUERY$
def reduction_gearbox(params):
    """Aluminium gearbox housing with input flange, output half-shaft spline, oil plugs, and mounting ears."""
    body_l = params.get("length", 200)
    body_w = params.get("width", 180)
    body_h = params.get("height", 160)
    wall_t = params.get("wall_thickness", 6)
    input_d = params.get("input_flange_diameter", 120)
    input_t = params.get("input_flange_thickness", 12)
    output_d = params.get("output_shaft_diameter", 28)
    output_l = params.get("output_shaft_length", 40)
    ear_w = params.get("ear_width", 25)
    plug_d = params.get("plug_diameter", 18)

    # Main housing box with fillets
    housing = (cq.Workplane("XY")
        .rect(body_l, body_w).extrude(body_h)
        .edges("|Z").fillet(12)
        .edges(">Z or <Z").fillet(6))
    # Hollow interior
    cavity = (cq.Workplane("XY").workplane(offset=wall_t)
        .rect(body_l - wall_t * 2, body_w - wall_t * 2)
        .extrude(body_h - wall_t * 2)
        .edges("|Z").fillet(8))
    housing = housing.cut(cavity)
    # Input flange (front face)
    in_flange = (cq.Workplane("XZ")
        .workplane(offset=-body_w / 2)
        .circle(input_d / 2).extrude(-input_t))
    in_bore = (cq.Workplane("XZ")
        .workplane(offset=-body_w / 2)
        .circle(output_d / 2 + 2).extrude(-input_t))
    housing = housing.union(in_flange).cut(in_bore)
    # Output half-shaft stub
    out_shaft = (cq.Workplane("XZ")
        .workplane(offset=body_w / 2)
        .circle(output_d / 2).extrude(output_l))
    housing = housing.union(out_shaft)
    # Mounting ears (4x)
    for sx in [-1, 1]:
        for sz in [wall_t, body_h - wall_t]:
            ear = (cq.Workplane("XY").workplane(offset=sz)
                .center(sx * (body_l / 2 + ear_w / 2), 0)
                .rect(ear_w, 40).extrude(wall_t))
            hole = (cq.Workplane("XY").workplane(offset=sz)
                .center(sx * (body_l / 2 + ear_w / 2), 0)
                .circle(5).extrude(wall_t))
            housing = housing.union(ear).cut(hole)
    # Oil fill plug boss (top)
    fill = (cq.Workplane("XY").workplane(offset=body_h)
        .center(30, 0).circle(plug_d / 2).extrude(8))
    housing = housing.union(fill)
    # Oil drain plug boss (bottom)
    drain = (cq.Workplane("XY")
        .center(-30, 0).circle(plug_d / 2).extrude(-8))
    housing = housing.union(drain)
    return housing
$CADQUERY$,
    '{"length": {"type": "number", "default": 200, "unit": "mm"}, "width": {"type": "number", "default": 180, "unit": "mm"}, "height": {"type": "number", "default": 160, "unit": "mm"}, "wall_thickness": {"type": "number", "default": 6, "unit": "mm"}, "input_flange_diameter": {"type": "number", "default": 120, "unit": "mm"}, "output_shaft_diameter": {"type": "number", "default": 28, "unit": "mm"}, "output_shaft_length": {"type": "number", "default": 40, "unit": "mm"}, "plug_diameter": {"type": "number", "default": 18, "unit": "mm"}}'::jsonb,
    '[{"name": "input_flange", "type": "flange", "diameter_mm": 120}, {"name": "output_shaft", "type": "splined_shaft", "diameter_mm": 28}, {"name": "oil_fill", "type": "plug", "diameter_mm": 18}, {"name": "oil_drain", "type": "plug", "diameter_mm": 18}]'::jsonb,
    ARRAY['gearbox', 'reduction', 'helical', 'EV_drivetrain', 'single_speed'],
    '#808080',
    'Aluminium EV reduction gearbox housing with input flange, output half-shaft spline, oil fill/drain plugs, and mounting ears. Single-speed helical, ratio 7-12:1.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 6. CV Joint
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cv_joint',
    'CV Joint (Rzeppa)',
    'domain',
    'drivetrain',
$CADQUERY$
def cv_joint(params):
    """Rzeppa-style CV joint with outer race, ball grooves, boot, and shaft stub."""
    outer_od = params.get("outer_od", 80)
    outer_id = params.get("outer_id", 55)
    outer_l = params.get("outer_length", 50)
    shaft_d = params.get("shaft_diameter", 25)
    shaft_l = params.get("shaft_length", 80)
    boot_large_d = params.get("boot_large_diameter", 78)
    boot_small_d = params.get("boot_small_diameter", 35)
    boot_l = params.get("boot_length", 60)
    groove_count = params.get("groove_count", 6)
    ball_d = params.get("ball_diameter", 16)

    # Outer race (cup shape)
    outer = (cq.Workplane("XY")
        .circle(outer_od / 2).circle(outer_id / 2)
        .extrude(outer_l))
    # Close one end of outer race
    cap = (cq.Workplane("XY").workplane(offset=outer_l)
        .circle(outer_od / 2).circle(shaft_d / 2 + 2)
        .extrude(6))
    outer = outer.union(cap)
    # Ball grooves on inner surface
    for i in range(groove_count):
        angle = i * (360 / groove_count)
        groove = (cq.Workplane("XY").workplane(offset=outer_l / 2)
            .transformed(rotate=(0, 0, angle))
            .center((outer_id / 2 + outer_od / 2) / 2, 0)
            .sphere(ball_d / 2 + 1))
        outer = outer.cut(groove)
    # Shaft stub from closed end
    shaft = (cq.Workplane("XY").workplane(offset=outer_l + 6)
        .circle(shaft_d / 2).extrude(shaft_l))
    outer = outer.union(shaft)
    # Boot (conical bellows shape — simplified as cone)
    boot = (cq.Workplane("XY")
        .circle(boot_large_d / 2).extrude(3)
        .union(
            cq.Workplane("XY").workplane(offset=-boot_l)
            .circle(boot_small_d / 2).extrude(3)
        ))
    # Connect boot with tapered cylinder
    boot_body = (cq.Workplane("XY")
        .circle(boot_large_d / 2)
        .workplane(offset=-boot_l)
        .circle(boot_small_d / 2)
        .loft())
    boot_inner = (cq.Workplane("XY")
        .circle(boot_large_d / 2 - 3)
        .workplane(offset=-boot_l)
        .circle(boot_small_d / 2 - 3)
        .loft())
    boot_shell = boot_body.cut(boot_inner)
    outer = outer.union(boot_shell)
    return outer
$CADQUERY$,
    '{"outer_od": {"type": "number", "default": 80, "unit": "mm"}, "outer_id": {"type": "number", "default": 55, "unit": "mm"}, "outer_length": {"type": "number", "default": 50, "unit": "mm"}, "shaft_diameter": {"type": "number", "default": 25, "unit": "mm"}, "shaft_length": {"type": "number", "default": 80, "unit": "mm"}, "boot_large_diameter": {"type": "number", "default": 78, "unit": "mm"}, "boot_small_diameter": {"type": "number", "default": 35, "unit": "mm"}, "boot_length": {"type": "number", "default": 60, "unit": "mm"}, "groove_count": {"type": "number", "default": 6}, "ball_diameter": {"type": "number", "default": 16, "unit": "mm"}}'::jsonb,
    '[{"name": "shaft_spline", "type": "splined_shaft", "diameter_mm": 25}, {"name": "outer_race", "type": "cup", "od_mm": 80}]'::jsonb,
    ARRAY['cv_joint', 'rzeppa', 'constant_velocity', 'half_shaft', 'drivetrain'],
    '#808080',
    'Rzeppa-style CV joint with outer race, ball grooves, inner race, conical rubber boot (bellows), and splined shaft stub. Max angle 47 degrees.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 7. Chain Sprocket
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'chain_sprocket',
    'Chain Sprocket',
    'domain',
    'drivetrain',
$CADQUERY$
def chain_sprocket(params):
    """Toothed disc sprocket with center bore and bolt circle."""
    teeth = params.get("teeth", 44)
    pitch = params.get("pitch", 12.7)
    thickness = params.get("thickness", 6)
    bore_d = params.get("bore_diameter", 30)
    bolt_count = params.get("bolt_count", 4)
    bolt_pcd = params.get("bolt_pcd", 58)
    bolt_d = params.get("bolt_hole_diameter", 6)

    pcd = teeth * pitch / math.pi
    tip_r = pcd / 2 + pitch * 0.3
    root_r = pcd / 2 - pitch * 0.3
    # Base disc at root diameter
    body = (cq.Workplane("XY")
        .circle(root_r).circle(bore_d / 2)
        .extrude(thickness))
    # Add simplified teeth as small bumps
    for i in range(teeth):
        angle_rad = i * 2 * math.pi / teeth
        cx = (tip_r - 1) * math.cos(angle_rad)
        cy = (tip_r - 1) * math.sin(angle_rad)
        tooth = (cq.Workplane("XY")
            .center(cx, cy)
            .circle(pitch * 0.25).extrude(thickness))
        body = body.union(tooth)
    # Bolt circle holes
    if bolt_count > 0:
        holes = (cq.Workplane("XY")
            .polarArray(bolt_pcd / 2, 0, 360, bolt_count)
            .circle(bolt_d / 2).extrude(thickness))
        body = body.cut(holes)
    # Lightening holes between bolt circle and bore
    if root_r > bolt_pcd / 2 + 15:
        light_holes = (cq.Workplane("XY")
            .polarArray((bolt_pcd / 2 + bore_d / 2) / 2, 0, 360, bolt_count)
            .circle(8).extrude(thickness))
        body = body.cut(light_holes)
    return body
$CADQUERY$,
    '{"teeth": {"type": "number", "default": 44}, "pitch": {"type": "number", "default": 12.7, "unit": "mm"}, "thickness": {"type": "number", "default": 6, "unit": "mm"}, "bore_diameter": {"type": "number", "default": 30, "unit": "mm"}, "bolt_count": {"type": "number", "default": 4}, "bolt_pcd": {"type": "number", "default": 58, "unit": "mm"}, "bolt_hole_diameter": {"type": "number", "default": 6, "unit": "mm"}}'::jsonb,
    '[{"name": "center_bore", "type": "bore", "diameter_mm": 30}, {"name": "bolt_circle", "type": "bolt_circle", "count": 4, "pcd_mm": 58}]'::jsonb,
    ARRAY['sprocket', 'chain', 'roller_chain', 'drivetrain', '12.7mm_pitch'],
    '#808080',
    'Toothed chain sprocket disc with center bore, bolt circle, and optional lightening holes. 12.7mm pitch (bicycle/go-kart), 44T default.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 8. Battery Module (EV)
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'battery_module_ev',
    'EV Battery Module',
    'domain',
    'battery',
$CADQUERY$
def battery_module_ev(params):
    """Rectangular prismatic battery pack with cell dividers, busbar strip, sense connector, and cooling plate."""
    pack_l = params.get("length", 300)
    pack_w = params.get("width", 180)
    pack_h = params.get("height", 100)
    wall_t = params.get("wall_thickness", 2)
    cell_count = params.get("cell_count", 8)
    divider_t = params.get("divider_thickness", 1.5)
    busbar_h = params.get("busbar_height", 4)
    cool_t = params.get("cooling_plate_thickness", 6)

    # Steel case (hollow box)
    case_outer = (cq.Workplane("XY")
        .rect(pack_l, pack_w).extrude(pack_h)
        .edges("|Z").fillet(3))
    case_inner = (cq.Workplane("XY").workplane(offset=cool_t)
        .rect(pack_l - wall_t * 2, pack_w - wall_t * 2)
        .extrude(pack_h - wall_t - cool_t))
    case = case_outer.cut(case_inner)
    # Cell dividers on top surface
    cell_spacing = (pack_l - wall_t * 2) / cell_count
    for i in range(1, cell_count):
        x = -pack_l / 2 + wall_t + i * cell_spacing
        div = (cq.Workplane("XY").workplane(offset=pack_h - wall_t)
            .center(x, 0)
            .rect(divider_t, pack_w - wall_t * 4).extrude(wall_t + 2))
        case = case.union(div)
    # Busbar strip on top
    busbar = (cq.Workplane("XY").workplane(offset=pack_h)
        .rect(pack_l - 20, 15).extrude(busbar_h)
        .translate((0, pack_w / 2 - 20, 0)))
    case = case.union(busbar)
    # Sense wiring connector boss
    conn = (cq.Workplane("XZ")
        .workplane(offset=pack_w / 2)
        .center(pack_l / 2 - 30, pack_h - 15)
        .rect(22, 12).extrude(8))
    case = case.union(conn)
    # Cooling plate visual (bottom, slightly recessed)
    cool = (cq.Workplane("XY")
        .rect(pack_l - 10, pack_w - 10).extrude(cool_t))
    case = case.union(cool)
    return case
$CADQUERY$,
    '{"length": {"type": "number", "default": 300, "unit": "mm"}, "width": {"type": "number", "default": 180, "unit": "mm"}, "height": {"type": "number", "default": 100, "unit": "mm"}, "wall_thickness": {"type": "number", "default": 2, "unit": "mm"}, "cell_count": {"type": "number", "default": 8}, "cooling_plate_thickness": {"type": "number", "default": 6, "unit": "mm"}}'::jsonb,
    '[{"name": "busbar", "type": "stud", "size": "M6"}, {"name": "sense_connector", "type": "rectangular", "width_mm": 22, "height_mm": 12}, {"name": "coolant", "type": "quick_disconnect"}]'::jsonb,
    ARRAY['battery_module', 'LFP', 'NMC', 'prismatic', 'EV', 'liquid_cooled'],
    '#2F4F4F',
    'Rectangular prismatic EV battery module: steel case with cell dividers, busbar strip, sense wiring connector, and cooling plate on bottom. 8S LFP or NMC default.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 9. BMS Board
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'bms_board',
    'Battery Management System (BMS) Board',
    'domain',
    'electrical',
$CADQUERY$
def bms_board(params):
    """PCB with MOSFETs, balance resistors, cell connector strip, signal connectors, and temp sensor pads."""
    pcb_l = params.get("pcb_length", 120)
    pcb_w = params.get("pcb_width", 60)
    pcb_t = params.get("pcb_thickness", 1.6)
    mosfet_count = params.get("mosfet_count", 4)
    resistor_count = params.get("balance_resistor_count", 16)
    mount_hole_d = params.get("mount_hole_diameter", 3.2)

    # PCB base
    pcb = (cq.Workplane("XY")
        .rect(pcb_l, pcb_w).extrude(pcb_t)
        .edges("|Z").fillet(1.5))
    # Mounting holes (4 corners)
    for sx in [-1, 1]:
        for sy in [-1, 1]:
            hole = (cq.Workplane("XY")
                .center(sx * (pcb_l / 2 - 4), sy * (pcb_w / 2 - 4))
                .circle(mount_hole_d / 2).extrude(pcb_t))
            pcb = pcb.cut(hole)
    # MOSFETs (TO-263 packages along one edge)
    for i in range(mosfet_count):
        x = -pcb_l / 2 + 15 + i * 18
        fet = (cq.Workplane("XY").workplane(offset=pcb_t)
            .center(x, -pcb_w / 2 + 12)
            .rect(10, 8).extrude(3))
        pcb = pcb.union(fet)
    # Balance resistors (small blocks along top edge)
    r_spacing = (pcb_l - 20) / max(resistor_count, 1)
    for i in range(resistor_count):
        x = -pcb_l / 2 + 10 + i * r_spacing
        res = (cq.Workplane("XY").workplane(offset=pcb_t)
            .center(x, pcb_w / 2 - 10)
            .rect(3, 1.5).extrude(1.5))
        pcb = pcb.union(res)
    # Cell connector strip (long header along one long edge)
    cell_conn = (cq.Workplane("XY").workplane(offset=pcb_t)
        .center(0, pcb_w / 2 - 3)
        .rect(pcb_l - 30, 5).extrude(8))
    pcb = pcb.union(cell_conn)
    # Signal connectors (2x JST-style on short edge)
    for y_off in [-10, 10]:
        conn = (cq.Workplane("YZ")
            .workplane(offset=pcb_l / 2)
            .center(y_off, pcb_t + 3)
            .rect(8, 6).extrude(5))
        pcb = pcb.union(conn)
    # Temperature sensor pads (2x small rectangles)
    for x_off in [-20, 20]:
        pad = (cq.Workplane("XY").workplane(offset=pcb_t)
            .center(x_off, 0)
            .rect(4, 3).extrude(1))
        pcb = pcb.union(pad)
    return pcb
$CADQUERY$,
    '{"pcb_length": {"type": "number", "default": 120, "unit": "mm"}, "pcb_width": {"type": "number", "default": 60, "unit": "mm"}, "pcb_thickness": {"type": "number", "default": 1.6, "unit": "mm"}, "mosfet_count": {"type": "number", "default": 4}, "balance_resistor_count": {"type": "number", "default": 16}, "mount_hole_diameter": {"type": "number", "default": 3.2, "unit": "mm"}}'::jsonb,
    '[{"name": "cell_connector", "type": "header", "pitch_mm": 2.54}, {"name": "signal_connectors", "type": "JST", "count": 2}, {"name": "mounting_holes", "type": "bolt_circle", "count": 4, "diameter_mm": 3.2}]'::jsonb,
    ARRAY['bms', 'battery_management', 'PCB', 'MOSFET', 'balance', 'cell_monitor'],
    '#006400',
    'Battery management system PCB with MOSFETs, passive balance resistors, cell connector strip, signal connectors, and temperature sensor pads. Supports 4-96S configurations.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 10. Charging Port
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'charging_port',
    'EV Charging Port (Type 2 / CCS2)',
    'domain',
    'connector',
$CADQUERY$
def charging_port(params):
    """Type 2 / CCS2 inlet with panel-mount flange, pin arrangement, locking ring, and cable entry."""
    flange_od = params.get("flange_od", 100)
    flange_t = params.get("flange_thickness", 6)
    body_od = params.get("body_od", 65)
    body_depth = params.get("body_depth", 50)
    pin_d = params.get("pin_diameter", 5)
    lock_ring_od = params.get("lock_ring_od", 72)
    lock_ring_t = params.get("lock_ring_thickness", 4)
    mount_hole_d = params.get("mount_hole_diameter", 5)
    mount_pcd = params.get("mount_pcd", 85)
    mount_count = params.get("mount_hole_count", 4)
    cable_d = params.get("cable_entry_diameter", 28)

    # Panel mount flange
    flange = (cq.Workplane("XY")
        .circle(flange_od / 2).extrude(flange_t)
        .edges(">Z").fillet(1))
    # Mounting holes
    m_holes = (cq.Workplane("XY")
        .polarArray(mount_pcd / 2, 0, 360, mount_count)
        .circle(mount_hole_d / 2).extrude(flange_t))
    flange = flange.cut(m_holes)
    # Connector body (recessed behind flange)
    body = (cq.Workplane("XY")
        .circle(body_od / 2).extrude(-body_depth))
    flange = flange.union(body)
    # Pin cavity
    cavity = (cq.Workplane("XY")
        .circle(body_od / 2 - 4).extrude(-body_depth + 8))
    flange = flange.cut(cavity)
    # Type 2 pin arrangement (7 pins in circular pattern)
    pin_positions = [
        (0, 10), (8.5, 5), (8.5, -5), (0, -10),
        (-8.5, -5), (-8.5, 5), (0, 0)
    ]
    for px, py in pin_positions:
        pin = (cq.Workplane("XY").workplane(offset=-body_depth + 8)
            .center(px, py)
            .circle(pin_d / 2).extrude(12))
        flange = flange.union(pin)
    # DC pins for CCS2 (2 large pins below)
    for px in [-12, 12]:
        dc_pin = (cq.Workplane("XY").workplane(offset=-body_depth + 8)
            .center(px, -22)
            .circle(pin_d * 1.2).extrude(12))
        flange = flange.union(dc_pin)
    # Locking ring
    lock = (cq.Workplane("XY").workplane(offset=flange_t)
        .circle(lock_ring_od / 2).circle(lock_ring_od / 2 - 4)
        .extrude(lock_ring_t))
    flange = flange.union(lock)
    # Cable entry (rear)
    cable_entry = (cq.Workplane("XY").workplane(offset=-body_depth)
        .circle(cable_d / 2).extrude(-15))
    flange = flange.union(cable_entry)
    return flange
$CADQUERY$,
    '{"flange_od": {"type": "number", "default": 100, "unit": "mm"}, "body_od": {"type": "number", "default": 65, "unit": "mm"}, "body_depth": {"type": "number", "default": 50, "unit": "mm"}, "pin_diameter": {"type": "number", "default": 5, "unit": "mm"}, "mount_pcd": {"type": "number", "default": 85, "unit": "mm"}, "mount_hole_count": {"type": "number", "default": 4}, "lock_ring_od": {"type": "number", "default": 72, "unit": "mm"}, "cable_entry_diameter": {"type": "number", "default": 28, "unit": "mm"}}'::jsonb,
    '[{"name": "panel_mount", "type": "bolt_circle", "count": 4, "pcd_mm": 85}, {"name": "ac_pins", "type": "pin_array", "count": 7}, {"name": "dc_pins", "type": "pin_array", "count": 2}, {"name": "cable_entry", "type": "gland", "diameter_mm": 28}]'::jsonb,
    ARRAY['charging_port', 'type_2', 'CCS2', 'IEC_62196', 'panel_mount', 'EV_charging'],
    '#1A1A1A',
    'Type 2 / CCS2 EV charging inlet with panel-mount flange, 7 AC pins, 2 DC pins, locking ring, and rear cable entry. IP55 mated, supports up to 350kW DC.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 11. HV Contactor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'hv_contactor',
    'HV Contactor',
    'domain',
    'electrical',
$CADQUERY$
def hv_contactor(params):
    """Epoxy-sealed box contactor with HV stud terminals on top, coil terminals on side, and mounting bracket."""
    body_l = params.get("length", 60)
    body_w = params.get("width", 50)
    body_h = params.get("height", 55)
    stud_d = params.get("stud_diameter", 8)
    stud_h = params.get("stud_height", 18)
    stud_spacing = params.get("stud_spacing", 32)
    coil_pin_d = params.get("coil_pin_diameter", 3)
    bracket_t = params.get("bracket_thickness", 3)
    bracket_ext = params.get("bracket_extension", 12)

    # Main sealed body
    body = (cq.Workplane("XY")
        .rect(body_l, body_w).extrude(body_h)
        .edges("|Z").fillet(3)
        .edges(">Z").fillet(1.5))
    # HV stud terminals on top
    for sx in [-1, 1]:
        stud = (cq.Workplane("XY").workplane(offset=body_h)
            .center(sx * stud_spacing / 2, 0)
            .circle(stud_d / 2).extrude(stud_h))
        # Nut/washer disc
        washer = (cq.Workplane("XY").workplane(offset=body_h)
            .center(sx * stud_spacing / 2, 0)
            .circle(stud_d).extrude(3))
        body = body.union(stud).union(washer)
    # Coil terminals on side (2 small pins)
    for sy in [-8, 8]:
        coil = (cq.Workplane("XZ")
            .workplane(offset=body_w / 2)
            .center(0, body_h / 2 + sy)
            .circle(coil_pin_d / 2).extrude(10))
        body = body.union(coil)
    # Mounting bracket (L-shaped at base)
    bracket_base = (cq.Workplane("XY")
        .rect(body_l + bracket_ext * 2, body_w).extrude(bracket_t))
    body = body.union(bracket_base)
    # Bracket mounting holes
    for sx in [-1, 1]:
        hole = (cq.Workplane("XY")
            .center(sx * (body_l / 2 + bracket_ext / 2), 0)
            .circle(2.5).extrude(bracket_t))
        body = body.cut(hole)
    return body
$CADQUERY$,
    '{"length": {"type": "number", "default": 60, "unit": "mm"}, "width": {"type": "number", "default": 50, "unit": "mm"}, "height": {"type": "number", "default": 55, "unit": "mm"}, "stud_diameter": {"type": "number", "default": 8, "unit": "mm"}, "stud_height": {"type": "number", "default": 18, "unit": "mm"}, "stud_spacing": {"type": "number", "default": 32, "unit": "mm"}, "coil_pin_diameter": {"type": "number", "default": 3, "unit": "mm"}, "bracket_thickness": {"type": "number", "default": 3, "unit": "mm"}}'::jsonb,
    '[{"name": "hv_studs", "type": "stud", "count": 2, "diameter_mm": 8, "spacing_mm": 32}, {"name": "coil_pins", "type": "pin", "count": 2, "diameter_mm": 3}, {"name": "mounting_bracket", "type": "bolt_hole", "count": 2}]'::jsonb,
    ARRAY['contactor', 'HV', 'relay', 'epoxy_sealed', 'bus_bar', 'EV_safety'],
    '#1A1A1A',
    'Epoxy-sealed HV contactor box with stud terminals on top, 12/24V coil terminals on side, and mounting bracket. Rated 200-800A continuous, up to 1000V.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 12. Wiring Connector (Deutsch DT)
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'wiring_connector_deutsch',
    'Deutsch DT Connector',
    'domain',
    'connector',
$CADQUERY$
def wiring_connector_deutsch(params):
    """Deutsch DT-series connector body with contacts, wedge lock slot, and wire seal."""
    pin_count = params.get("pin_count", 4)
    body_w = params.get("body_width", 22)
    body_h = params.get("body_height", 16)
    body_l = params.get("body_length", 28)
    contact_d = params.get("contact_diameter", 2.5)
    wire_seal_d = params.get("wire_seal_diameter", 5)
    latch_h = params.get("latch_height", 4)

    # Main connector body (rectangular with rounded edges)
    body = (cq.Workplane("XY")
        .rect(body_w, body_h).extrude(body_l)
        .edges("|Z").fillet(2)
        .edges("<Z or >Z").fillet(1))
    # Pin cavity (front face recess)
    cavity = (cq.Workplane("XY")
        .rect(body_w - 3, body_h - 3).extrude(8)
        .edges("|Z").fillet(1))
    body = body.cut(cavity)
    # Contact pins visible in cavity
    cols = 2 if pin_count <= 4 else 3
    rows = math.ceil(pin_count / cols)
    x_sp = (body_w - 8) / max(cols - 1, 1)
    y_sp = (body_h - 8) / max(rows - 1, 1)
    placed = 0
    for r in range(rows):
        for c in range(cols):
            if placed >= pin_count:
                break
            px = -((cols - 1) * x_sp) / 2 + c * x_sp
            py = -((rows - 1) * y_sp) / 2 + r * y_sp
            pin = (cq.Workplane("XY")
                .center(px, py)
                .circle(contact_d / 2).extrude(12))
            body = body.union(pin)
            placed += 1
    # Wire seal bores on rear face
    placed = 0
    for r in range(rows):
        for c in range(cols):
            if placed >= pin_count:
                break
            px = -((cols - 1) * x_sp) / 2 + c * x_sp
            py = -((rows - 1) * y_sp) / 2 + r * y_sp
            seal = (cq.Workplane("XY").workplane(offset=body_l - 6)
                .center(px, py)
                .circle(wire_seal_d / 2).extrude(6))
            body = body.cut(seal)
            placed += 1
    # Wedge lock slot (side slot)
    wedge = (cq.Workplane("XZ")
        .workplane(offset=-body_h / 2)
        .center(0, body_l / 2)
        .rect(body_w - 6, 3).extrude(3))
    body = body.cut(wedge)
    # Latch clip on top
    latch = (cq.Workplane("XY").workplane(offset=0)
        .center(0, body_h / 2)
        .rect(8, latch_h).extrude(body_l * 0.7)
        .translate((0, 0, body_l * 0.15)))
    body = body.union(latch)
    return body
$CADQUERY$,
    '{"pin_count": {"type": "number", "default": 4}, "body_width": {"type": "number", "default": 22, "unit": "mm"}, "body_height": {"type": "number", "default": 16, "unit": "mm"}, "body_length": {"type": "number", "default": 28, "unit": "mm"}, "contact_diameter": {"type": "number", "default": 2.5, "unit": "mm"}, "wire_seal_diameter": {"type": "number", "default": 5, "unit": "mm"}, "latch_height": {"type": "number", "default": 4, "unit": "mm"}}'::jsonb,
    '[{"name": "contacts", "type": "pin_array", "count": 4, "diameter_mm": 2.5}, {"name": "wire_seals", "type": "seal_array", "count": 4, "diameter_mm": 5}]'::jsonb,
    ARRAY['deutsch', 'DT', 'connector', 'waterproof', 'IP69K', 'automotive_wiring'],
    '#1A1A1A',
    'Deutsch DT-series connector with visible contacts, wedge lock slot, wire seals, and latch clip. IP69K mated, 13-25A per contact, MIL-STD vibration rated.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;
