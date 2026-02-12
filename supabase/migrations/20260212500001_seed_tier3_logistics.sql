-- ============================================================
-- ForgeOS Component Geometry Library — Tier 3: Factory Logistics
-- Migration: 20260212500001_seed_tier3_logistics
-- ============================================================
-- Seeds 27 domain-specific geometry types for industrial intralogistics:
-- conveyors, AMR/AGV, AS/RS, sortation, picking/packing, storage,
-- dock equipment, and controls/sensing.

-- 1. belt_conveyor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'belt_conveyor',
    'Belt Conveyor',
    'domain',
    'conveyor',
$CADQUERY$
def belt_conveyor(params):
    """Belt conveyor (flat or incline)."""
    length = params.get("length", 3000.0)
    width = params.get("belt_width", 600.0)
    height = params.get("frame_height", 750.0)
    belt_t = params.get("belt_thickness", 5.0)
    frame_h = 80.0

    # Side frames (2 C-channels)
    result = None
    for side in [-1, 1]:
        frame = (cq.Workplane("XY")
                 .transformed(offset=(0, side * (width/2 + 20), height/2))
                 .box(length, 3, height))
        top_lip = (cq.Workplane("XY")
                   .transformed(offset=(0, side * (width/2 + 10), height))
                   .box(length, 20, 3))
        result = frame.union(top_lip) if result is None else result.union(frame).union(top_lip)
    # Belt (top run)
    belt = (cq.Workplane("XY")
            .transformed(offset=(0, 0, height + belt_t/2))
            .box(length - 20, width, belt_t))
    # Head drum
    head = (cq.Workplane("XY").workplane(offset=height)
            .transformed(offset=(length/2 - 40, 0, 0))
            .transformed(rotate=(90, 0, 0))
            .circle(40).extrude(width + 20).translate((0, -(width/2 + 10), 0)))
    # Tail drum
    tail = (cq.Workplane("XY").workplane(offset=height)
            .transformed(offset=(-(length/2 - 40), 0, 0))
            .transformed(rotate=(90, 0, 0))
            .circle(30).extrude(width + 20).translate((0, -(width/2 + 10), 0)))
    # Legs (4)
    for x in [-(length/2 - 100), length/2 - 100]:
        for y in [-(width/2 + 15), width/2 + 15]:
            leg = (cq.Workplane("XY")
                   .transformed(offset=(x, y, height/2))
                   .box(40, 40, height))
            result = result.union(leg)
    # Drive motor (head end)
    motor = (cq.Workplane("XY")
             .transformed(offset=(length/2 - 40, width/2 + 80, height))
             .box(150, 120, 100))
    return result.union(belt).union(head).union(tail).union(motor)
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}, "belt_width": {"type": "number", "default": 600.0, "unit": "mm", "enum": [400, 500, 600, 800, 1000, 1200]}}'::jsonb,
    '[]'::jsonb,
    '{steel,rubber,conveyor}',
    '#2F4F4F',
    'Belt conveyor (flat or incline).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 2. roller_conveyor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'roller_conveyor',
    'Roller Conveyor (Powered/Gravity)',
    'domain',
    'conveyor',
$CADQUERY$
def roller_conveyor(params):
    """Powered or gravity roller conveyor."""
    length = params.get("length", 3000.0)
    width = params.get("roller_width", 500.0)
    height = params.get("frame_height", 750.0)
    roller_d = params.get("roller_diameter", 50.0)
    pitch = params.get("roller_pitch", 100.0)
    powered = params.get("powered", True)

    # Side frames
    result = None
    for side in [-1, 1]:
        frame = (cq.Workplane("XY")
                 .transformed(offset=(0, side * (width/2 + 15), height - 40))
                 .box(length, 3, 80))
        result = frame if result is None else result.union(frame)
    # Rollers
    roller_count = min(int(length / pitch), 25)  # limit for performance
    for i in range(roller_count):
        rx = -(length/2 - pitch/2) + i * pitch
        roller = (cq.Workplane("XY").workplane(offset=height)
                  .transformed(offset=(rx, 0, 0))
                  .transformed(rotate=(90, 0, 0))
                  .circle(roller_d/2).extrude(width).translate((0, -(width/2), 0)))
        result = result.union(roller)
    # Legs (4)
    for x in [-(length/2 - 80), length/2 - 80]:
        for y in [-(width/2 + 10), width/2 + 10]:
            leg = (cq.Workplane("XY")
                   .transformed(offset=(x, y, (height - 80)/2))
                   .box(40, 40, height - 80))
            result = result.union(leg)
    # Drive (if powered)
    if powered:
        motor = (cq.Workplane("XY")
                 .transformed(offset=(length/2 - 60, width/2 + 60, height - 60))
                 .box(120, 80, 80))
        result = result.union(motor)
    return result
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}, "roller_width": {"type": "number", "default": 500.0, "unit": "mm"}, "powered": {"type": "boolean", "default": true}}'::jsonb,
    '[]'::jsonb,
    '{steel,conveyor}',
    '#808080',
    'Powered or gravity roller conveyor.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 3. spiral_conveyor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'spiral_conveyor',
    'Spiral Conveyor',
    'domain',
    'conveyor',
$CADQUERY$
def spiral_conveyor(params):
    """Spiral/helix conveyor for vertical transport."""
    outer_d = params.get("outer_diameter", 1500.0)
    inner_d = params.get("inner_diameter", 600.0)
    height = params.get("height", 3000.0)
    belt_w = params.get("belt_width", 400.0)
    turns = params.get("turns", 3)

    # Central column
    column = cq.Workplane("XY").circle(inner_d/2).extrude(height)
    col_bore = cq.Workplane("XY").circle(inner_d/2 - 5).extrude(height)
    column = column.cut(col_bore)
    # Helical slats (simplified as stacked ring segments)
    segments_per_turn = 12
    total_segments = turns * segments_per_turn
    for i in range(total_segments):
        angle = i * (360.0 / segments_per_turn)
        z = i * (height / total_segments)
        r_mid = (inner_d/2 + outer_d/2) / 2
        ax = r_mid * math.cos(math.radians(angle))
        ay = r_mid * math.sin(math.radians(angle))
        slat = (cq.Workplane("XY").workplane(offset=z)
                .transformed(offset=(ax, ay, 0))
                .transformed(rotate=(0, 0, angle))
                .box(belt_w, belt_w * 0.3, 5))
        column = column.union(slat)
    # Top/bottom frames
    for z in [0, height]:
        ring = (cq.Workplane("XY").workplane(offset=z)
                .circle(outer_d/2).circle(inner_d/2 + 10).extrude(15))
        column = column.union(ring)
    return column
$CADQUERY$,
    '{"outer_diameter": {"type": "number", "default": 1500.0, "unit": "mm"}, "height": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,conveyor}',
    '#708090',
    'Spiral/helix conveyor for vertical transport.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 4. ball_transfer_table
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ball_transfer_table',
    'Ball Transfer Table',
    'domain',
    'conveyor',
$CADQUERY$
def ball_transfer_table(params):
    """Ball transfer table (omnidirectional)."""
    w = params.get("width", 600.0)
    l = params.get("length", 600.0)
    height = params.get("height", 750.0)
    ball_d = params.get("ball_diameter", 30.0)
    pitch = params.get("ball_pitch", 75.0)

    # Table plate
    table = (cq.Workplane("XY").workplane(offset=height)
             .box(l, w, 5))
    # Ball units
    cols = int(l / pitch)
    rows = int(w / pitch)
    for i in range(cols):
        for j in range(rows):
            bx = -(l/2 - pitch/2) + i * pitch
            by = -(w/2 - pitch/2) + j * pitch
            ball = (cq.Workplane("XY").workplane(offset=height + 5)
                    .transformed(offset=(bx, by, 0))
                    .sphere(ball_d/2))
            housing = (cq.Workplane("XY").workplane(offset=height - 10)
                       .transformed(offset=(bx, by, 0))
                       .circle(ball_d/2 + 3).extrude(15))
            table = table.union(ball).union(housing)
    # Legs
    for x in [-(l/2 - 30), l/2 - 30]:
        for y in [-(w/2 - 30), w/2 - 30]:
            leg = (cq.Workplane("XY")
                   .transformed(offset=(x, y, height/2))
                   .box(40, 40, height))
            table = table.union(leg)
    return table
$CADQUERY$,
    '{"width": {"type": "number", "default": 600.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,conveyor}',
    '#C0C0C0',
    'Ball transfer table (omnidirectional).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 5. amr_platform
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'amr_platform',
    'AMR Platform (Goods-to-Person)',
    'domain',
    'amr',
$CADQUERY$
def amr_platform(params):
    """Autonomous Mobile Robot platform (goods-to-person)."""
    w = params.get("width", 680.0)
    l = params.get("length", 900.0)
    h = params.get("height", 300.0)
    payload_kg = params.get("payload_kg", 300)

    # Base chassis
    chassis = (cq.Workplane("XY")
               .sketch().rect(l, w).vertices().fillet(30).finalize()
               .extrude(h * 0.5))
    # Top lifting platform
    top = (cq.Workplane("XY").workplane(offset=h * 0.5)
           .sketch().rect(l - 20, w - 20).vertices().fillet(25).finalize()
           .extrude(h * 0.3))
    # Lifting mechanism recess
    lift = (cq.Workplane("XY").workplane(offset=h * 0.8)
            .sketch().rect(l - 60, w - 60).vertices().fillet(20).finalize()
            .extrude(h * 0.2))
    # Drive wheels (2 differential, centre)
    for side in [-1, 1]:
        wheel = (cq.Workplane("XY").workplane(offset=30)
                 .transformed(offset=(0, side * (w/2 + 10), 0))
                 .transformed(rotate=(90, 0, 0))
                 .circle(60).extrude(20).translate((0, -(10 if side > 0 else -30), 0)))
        chassis = chassis.union(wheel)
    # Caster wheels (4 corners)
    for x in [-(l/2 - 60), l/2 - 60]:
        for y in [-(w/2 - 60), w/2 - 60]:
            caster = (cq.Workplane("XY")
                      .transformed(offset=(x, y, 15))
                      .circle(25).extrude(15))
            chassis = chassis.union(caster)
    # LiDAR dome (top)
    lidar = (cq.Workplane("XY").workplane(offset=h)
             .transformed(offset=(l/3, 0, 0))
             .circle(35).extrude(30))
    return chassis.union(top).union(lift).union(lidar)
$CADQUERY$,
    '{"payload_kg": {"type": "number", "default": 300, "enum": [100, 300, 600, 1000, 1500]}}'::jsonb,
    '[]'::jsonb,
    '{steel,robot,AMR}',
    '#2F4F8F',
    'Autonomous Mobile Robot platform (goods-to-person).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 6. pallet_agv
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pallet_agv',
    'Pallet AGV / AMR Forklift',
    'domain',
    'amr',
$CADQUERY$
def pallet_agv(params):
    """Pallet AGV (autonomous forklift / pallet mover)."""
    w = params.get("width", 900.0)
    l = params.get("length", 1800.0)
    h = params.get("height", 350.0)
    fork_l = params.get("fork_length", 1200.0)

    # Body
    body = (cq.Workplane("XY")
            .sketch().rect(l * 0.5, w).vertices().fillet(20).finalize()
            .extrude(h))
    # Forks (2)
    for fy in [-250, 250]:
        fork = (cq.Workplane("XY")
                .transformed(offset=(l * 0.25 + fork_l/2, fy, 40))
                .box(fork_l, 100, 50))
        taper = (cq.Workplane("XY")
                 .transformed(offset=(l * 0.25 + fork_l - 25, fy, 20))
                 .box(50, 100, 10))
        body = body.union(fork).union(taper)
    # Mast (vertical)
    mast = (cq.Workplane("XY")
            .transformed(offset=(l * 0.25 - 20, 0, h + 300))
            .box(80, w * 0.6, 600))
    # Drive wheels
    for side in [-1, 1]:
        wheel = (cq.Workplane("XY").workplane(offset=50)
                 .transformed(offset=(-(l * 0.1), side * (w/2 + 10), 0))
                 .transformed(rotate=(90, 0, 0))
                 .circle(80).extrude(25).translate((0, -(12 if side > 0 else -37), 0)))
        body = body.union(wheel)
    # LiDAR
    lidar = (cq.Workplane("XY").workplane(offset=h)
             .transformed(offset=(-(l * 0.2), 0, 0))
             .circle(35).extrude(25))
    return body.union(mast).union(lidar)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,robot,AGV}',
    '#FF8C00',
    'Pallet AGV (autonomous forklift / pallet mover).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 7. sorting_robot
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'sorting_robot',
    'Tilt-Tray Sorting Robot',
    'domain',
    'sortation',
$CADQUERY$
def sorting_robot(params):
    """Tilt-tray / crossbelt sorting robot on track."""
    w = params.get("width", 500.0)
    l = params.get("length", 600.0)
    h = params.get("height", 200.0)

    # Carriage base
    base = (cq.Workplane("XY")
            .sketch().rect(l, w).vertices().fillet(10).finalize()
            .extrude(h * 0.4))
    # Tilt tray
    tray = (cq.Workplane("XY").workplane(offset=h * 0.4)
            .sketch().rect(l - 20, w - 20).vertices().fillet(8).finalize()
            .extrude(h * 0.3))
    tray_walls = (cq.Workplane("XY").workplane(offset=h * 0.7)
                  .sketch().rect(l - 20, w - 20).vertices().fillet(8).finalize()
                  .extrude(h * 0.3))
    tray_inner = (cq.Workplane("XY").workplane(offset=h * 0.7 - 1)
                  .sketch().rect(l - 30, w - 30).vertices().fillet(6).finalize()
                  .extrude(h * 0.3 + 2))
    tray_walls = tray_walls.cut(tray_inner)
    # Wheels (4 flanged)
    for x in [-(l/2 - 30), l/2 - 30]:
        for y in [-(w/2 - 30), w/2 - 30]:
            wheel = (cq.Workplane("XY")
                     .transformed(offset=(x, y, 15))
                     .circle(15).extrude(10))
            base = base.union(wheel)
    return base.union(tray).union(tray_walls)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,robot}',
    '#4682B4',
    'Tilt-tray / crossbelt sorting robot on track.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 8. miniload_crane
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'miniload_crane',
    'Mini-Load AS/RS Crane',
    'domain',
    'asrs',
$CADQUERY$
def miniload_crane(params):
    """Mini-load AS/RS crane (tote/bin stacker)."""
    mast_h = params.get("mast_height", 6000.0)
    travel_l = params.get("travel_length", 2000.0)
    w = params.get("width", 600.0)

    # Mast (twin column)
    for mx in [-150, 150]:
        col = (cq.Workplane("XY")
               .transformed(offset=(mx, 0, mast_h/2))
               .box(80, 60, mast_h))
        if mx == -150:
            result = col
        else:
            result = result.union(col)
    # Cross ties (top and bottom)
    for z in [100, mast_h - 100]:
        tie = (cq.Workplane("XY")
               .transformed(offset=(0, 0, z))
               .box(300, 60, 50))
        result = result.union(tie)
    # Carriage (moves vertically)
    carriage = (cq.Workplane("XY")
                .transformed(offset=(0, 0, mast_h * 0.4))
                .box(350, 80, 200))
    # Extractor (telescopic fork)
    extractor = (cq.Workplane("XY")
                 .transformed(offset=(0, w/2, mast_h * 0.4))
                 .box(300, w, 20))
    # Base rail carriage
    base = (cq.Workplane("XY")
            .box(travel_l * 0.3, 200, 80))
    # Rail wheels
    for x in [-travel_l * 0.1, travel_l * 0.1]:
        wheel = (cq.Workplane("XY")
                 .transformed(offset=(x, 0, -20))
                 .circle(40).extrude(15))
        base = base.union(wheel)
    return result.union(carriage).union(extractor).union(base)
$CADQUERY$,
    '{"mast_height": {"type": "number", "default": 6000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,automation}',
    '#FF4500',
    'Mini-load AS/RS crane (tote/bin stacker).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 9. vlm_unit
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'vlm_unit',
    'Vertical Lift Module (VLM)',
    'domain',
    'asrs',
$CADQUERY$
def vlm_unit(params):
    """Vertical Lift Module (Kardex Shuttle-style)."""
    w = params.get("width", 2500.0)
    d = params.get("depth", 850.0)
    h = params.get("height", 6000.0)
    tray_count = params.get("tray_count", 20)

    # Two towers (front and rear)
    result = None
    for ty in [-(d/2 + 50), d/2 + 50]:
        tower = (cq.Workplane("XY")
                 .transformed(offset=(0, ty, h/2))
                 .box(w, 80, h))
        result = tower if result is None else result.union(tower)
    # Access opening (front, waist height)
    opening_h = 400
    opening_z = 1000
    front_panel = (cq.Workplane("XY")
                   .transformed(offset=(0, -(d/2 + 90 + 10), h/2))
                   .box(w, 20, h))
    cutout = (cq.Workplane("XY")
              .transformed(offset=(0, -(d/2 + 90 + 10), opening_z))
              .box(w - 100, 30, opening_h))
    front_panel = front_panel.cut(cutout)
    result = result.union(front_panel)
    # Trays (sample, inside towers)
    tray_spacing = (h - 200) / max(tray_count, 1)
    for i in range(min(tray_count, 10)):
        tz = 100 + i * tray_spacing
        tray = (cq.Workplane("XY")
                .transformed(offset=(0, 0, tz))
                .box(w - 100, d, 3))
        result = result.union(tray)
    # Extractor (central lift)
    extractor = (cq.Workplane("XY")
                 .transformed(offset=(0, 0, opening_z))
                 .box(w - 80, d + 20, 30))
    return result.union(extractor)
$CADQUERY$,
    '{"height": {"type": "number", "default": 6000.0, "unit": "mm"}, "tray_count": {"type": "integer", "default": 20}}'::jsonb,
    '[]'::jsonb,
    '{steel,automation}',
    '#708090',
    'Vertical Lift Module (Kardex Shuttle-style).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 10. shuttle_car
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'shuttle_car',
    'Pallet Shuttle Car',
    'domain',
    'asrs',
$CADQUERY$
def shuttle_car(params):
    """Shuttle car (multi-deep pallet shuttle)."""
    w = params.get("width", 900.0)
    l = params.get("length", 1400.0)
    h = params.get("height", 120.0)

    # Chassis
    chassis = (cq.Workplane("XY")
               .sketch().rect(l, w).vertices().fillet(15).finalize()
               .extrude(h))
    # Lifting fingers (2 pairs, for pallet underside)
    for fx in [-(l/4), l/4]:
        for fy in [-(w/3), w/3]:
            finger = (cq.Workplane("XY").workplane(offset=h)
                      .transformed(offset=(fx, fy, 0))
                      .box(200, 80, 15))
            chassis = chassis.union(finger)
    # Drive wheels (4 flanged)
    for x in [-(l/2 - 50), l/2 - 50]:
        for y in [-(w/2 - 30), w/2 - 30]:
            wheel = (cq.Workplane("XY")
                     .transformed(offset=(x, y, -10))
                     .circle(30).extrude(15))
            chassis = chassis.union(wheel)
    # Sensors (front + rear)
    for x in [-(l/2 + 10), l/2 + 10]:
        sensor = (cq.Workplane("XY")
                  .transformed(offset=(x, 0, h/2))
                  .box(20, 40, 20))
        chassis = chassis.union(sensor)
    return chassis
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,automation}',
    '#FF8C00',
    'Shuttle car (multi-deep pallet shuttle).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 11. cube_storage_robot
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cube_storage_robot',
    'Cube Storage Robot (AutoStore-style)',
    'domain',
    'asrs',
$CADQUERY$
def cube_storage_robot(params):
    """Cube storage robot (AutoStore-style grid robot)."""
    w = params.get("width", 650.0)
    l = params.get("length", 650.0)
    h = params.get("height", 350.0)

    # Body
    body = (cq.Workplane("XY")
            .sketch().rect(l, w).vertices().fillet(15).finalize()
            .extrude(h))
    # Grid wheels (2 sets perpendicular for X/Y travel)
    for direction in ["X", "Y"]:
        for side in [-1, 1]:
            if direction == "X":
                wx = 0
                wy = side * (w/2)
                wheel = (cq.Workplane("XY")
                         .transformed(offset=(wx, wy, -10))
                         .transformed(rotate=(90, 0, 0))
                         .circle(30).extrude(15))
            else:
                wx = side * (l/2)
                wy = 0
                wheel = (cq.Workplane("XY")
                         .transformed(offset=(wx, wy, -10))
                         .transformed(rotate=(0, 90, 0))
                         .circle(30).extrude(15))
            body = body.union(wheel)
    # Bin gripper (internal cavity for lowering)
    grip_cavity = (cq.Workplane("XY").workplane(offset=20)
                   .sketch().rect(l - 80, w - 80).finalize()
                   .extrude(h - 40))
    body = body.cut(grip_cavity)
    # Gripper bands (4 internal)
    for gy in [-(w/2 - 60), w/2 - 60]:
        band = (cq.Workplane("XY").workplane(offset=30)
                .transformed(offset=(0, gy, 0))
                .box(l - 100, 10, h - 60))
        body = body.union(band)
    return body
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,robot}',
    '#DC143C',
    'Cube storage robot (AutoStore-style grid robot).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 12. scissor_lift_table
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'scissor_lift_table',
    'Scissor Lift Table',
    'domain',
    'lift',
$CADQUERY$
def scissor_lift_table(params):
    """Scissor lift table (hydraulic)."""
    platform_w = params.get("platform_width", 1200.0)
    platform_l = params.get("platform_length", 2000.0)
    collapsed_h = params.get("collapsed_height", 250.0)
    raised_h = params.get("raised_height", 1000.0)

    # Base frame
    base = (cq.Workplane("XY")
            .box(platform_l, platform_w, 50))
    # Platform (top)
    platform = (cq.Workplane("XY").workplane(offset=collapsed_h)
                .box(platform_l, platform_w, 10))
    # Scissor arms (simplified X pattern)
    arm_w = 60
    for side_y in [-(platform_w/3), platform_w/3]:
        arm1 = (cq.Workplane("XY")
                .transformed(offset=(0, side_y, collapsed_h/2))
                .transformed(rotate=(0, 30, 0))
                .box(collapsed_h * 1.5, arm_w, 8))
        arm2 = (cq.Workplane("XY")
                .transformed(offset=(0, side_y, collapsed_h/2))
                .transformed(rotate=(0, -30, 0))
                .box(collapsed_h * 1.5, arm_w, 8))
        base = base.union(arm1).union(arm2)
    # Hydraulic cylinder
    cyl = (cq.Workplane("XY")
           .transformed(offset=(-(platform_l/3), 0, collapsed_h * 0.3))
           .transformed(rotate=(0, 15, 0))
           .circle(30).extrude(collapsed_h * 0.8))
    return base.union(platform).union(cyl)
$CADQUERY$,
    '{"platform_width": {"type": "number", "default": 1200.0, "unit": "mm"}, "platform_length": {"type": "number", "default": 2000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,hydraulic}',
    '#FFD700',
    'Scissor lift table (hydraulic).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 13. goods_lift
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'goods_lift',
    'Mezzanine Goods Lift',
    'domain',
    'lift',
$CADQUERY$
def goods_lift(params):
    """Mezzanine goods lift (hydraulic or screw-driven)."""
    platform_w = params.get("platform_width", 1500.0)
    platform_d = params.get("platform_depth", 2000.0)
    travel = params.get("travel", 3000.0)

    # Guide columns (4 corners)
    result = None
    for x in [-(platform_w/2 + 40), platform_w/2 + 40]:
        for y in [-(platform_d/2 + 40), platform_d/2 + 40]:
            col = (cq.Workplane("XY")
                   .transformed(offset=(x, y, travel/2))
                   .box(80, 80, travel + 100))
            result = col if result is None else result.union(col)
    # Platform
    platform = (cq.Workplane("XY").workplane(offset=50)
                .box(platform_w, platform_d, 60))
    # Safety toe guards (3 sides)
    for side in ["left", "right", "rear"]:
        if side == "left":
            guard = (cq.Workplane("XY").transformed(offset=(-(platform_w/2 - 5), 0, 200))
                     .box(10, platform_d, 400))
        elif side == "right":
            guard = (cq.Workplane("XY").transformed(offset=(platform_w/2 - 5, 0, 200))
                     .box(10, platform_d, 400))
        else:
            guard = (cq.Workplane("XY").transformed(offset=(0, platform_d/2 - 5, 200))
                     .box(platform_w, 10, 400))
        result = result.union(guard)
    # Hydraulic ram (single central)
    ram = (cq.Workplane("XY")
           .transformed(offset=(0, platform_d/2 + 60, travel/2))
           .circle(50).extrude(travel))
    return result.union(platform).union(ram)
$CADQUERY$,
    '{"travel": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,hydraulic}',
    '#708090',
    'Mezzanine goods lift (hydraulic or screw-driven).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 14. crossbelt_sorter_cell
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'crossbelt_sorter_cell',
    'Crossbelt Sorter Cell',
    'domain',
    'sortation',
$CADQUERY$
def crossbelt_sorter_cell(params):
    """Crossbelt sorter cell (single carriage)."""
    w = params.get("width", 600.0)
    l = params.get("length", 400.0)
    h = params.get("height", 150.0)
    belt_w = params.get("belt_width", 350.0)

    # Carriage frame
    frame = cq.Workplane("XY").box(l, w, h * 0.5)
    # Crossbelt (perpendicular to travel direction)
    belt = (cq.Workplane("XY").workplane(offset=h * 0.5)
            .box(belt_w, w - 20, 5))
    # Rollers at belt ends (2)
    for bx in [-(belt_w/2 - 10), belt_w/2 - 10]:
        roller = (cq.Workplane("XY").workplane(offset=h * 0.5)
                  .transformed(offset=(bx, 0, 0))
                  .transformed(rotate=(90, 0, 0))
                  .circle(15).extrude(w - 30).translate((0, -(w/2 - 15), 0)))
        frame = frame.union(roller)
    # Track wheels (2 pairs)
    for x in [-(l/2 - 20), l/2 - 20]:
        wheel = (cq.Workplane("XY")
                 .transformed(offset=(x, 0, -10))
                 .circle(20).extrude(12))
        frame = frame.union(wheel)
    return frame.union(belt)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,sortation}',
    '#4682B4',
    'Crossbelt sorter cell (single carriage).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 15. pop_up_wheel_diverter
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pop_up_wheel_diverter',
    'Pop-Up Wheel Diverter',
    'domain',
    'sortation',
$CADQUERY$
def pop_up_wheel_diverter(params):
    """Pop-up wheel diverter (inline with conveyor)."""
    w = params.get("width", 400.0)
    l = params.get("length", 300.0)
    h = params.get("height", 80.0)
    wheel_d = params.get("wheel_diameter", 50.0)

    # Base plate (sits between conveyor rollers)
    base = cq.Workplane("XY").box(l, w, 20)
    # Pop-up wheel rows (3 rows of angled wheels)
    for row in range(3):
        rx = -(l/3) + row * (l/3)
        for col in range(4):
            cy = -(w/2 - 60) + col * ((w - 120) / 3)
            wheel = (cq.Workplane("XY").workplane(offset=20)
                     .transformed(offset=(rx, cy, 0))
                     .transformed(rotate=(0, 0, 30))
                     .transformed(rotate=(90, 0, 0))
                     .circle(wheel_d/2).extrude(15))
            base = base.union(wheel)
    # Pneumatic actuator (underneath)
    actuator = (cq.Workplane("XY").workplane(offset=-30)
                .box(l * 0.6, w * 0.4, 30))
    return base.union(actuator)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,sortation}',
    '#808080',
    'Pop-up wheel diverter (inline with conveyor).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 16. pick_to_light_module
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pick_to_light_module',
    'Pick-to-Light Module',
    'domain',
    'picking',
$CADQUERY$
def pick_to_light_module(params):
    """Pick-to-light display module."""
    w = params.get("width", 80.0)
    h = params.get("height", 50.0)
    d = params.get("depth", 35.0)

    body = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(3).finalize()
            .extrude(h))
    # Display window (7-segment)
    display = (cq.Workplane("XY")
               .transformed(offset=(0, -(d/2 + 1), h * 0.6))
               .box(w * 0.6, 2, h * 0.25))
    # Button (confirm pick)
    button = (cq.Workplane("XY")
              .transformed(offset=(0, -(d/2 + 3), h * 0.25))
              .circle(8).extrude(4))
    # LED strip (top)
    led = (cq.Workplane("XY")
           .transformed(offset=(0, -(d/2 + 1), h - 5))
           .box(w - 10, 3, 8))
    # Rail mount (rear)
    mount = (cq.Workplane("XY")
             .transformed(offset=(0, d/2 + 5, h/2))
             .box(w * 0.8, 10, 15))
    return body.union(display).union(button).union(led).union(mount)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{plastic,LED,picking}',
    '#00FF00',
    'Pick-to-light display module.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 17. packing_bench
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'packing_bench',
    'Packing Bench / Workstation',
    'domain',
    'packing',
$CADQUERY$
def packing_bench(params):
    """Packing bench / workstation."""
    w = params.get("width", 1800.0)
    d = params.get("depth", 750.0)
    h = params.get("height", 850.0)

    # Worktop
    top = (cq.Workplane("XY").workplane(offset=h)
           .box(w, d, 30))
    # Frame legs (4 tubular steel)
    result = top
    for x in [-(w/2 - 30), w/2 - 30]:
        for y in [-(d/2 - 30), d/2 - 30]:
            leg = (cq.Workplane("XY")
                   .transformed(offset=(x, y, h/2))
                   .box(40, 40, h))
            result = result.union(leg)
    # Lower shelf
    shelf = (cq.Workplane("XY").workplane(offset=200)
             .box(w - 20, d - 20, 20))
    # Overhead gantry (for tape dispenser, scale)
    gantry_h = 600
    for x in [-(w/2 - 30), w/2 - 30]:
        post = (cq.Workplane("XY").workplane(offset=h + 30)
                .transformed(offset=(x, d/2 - 30, 0))
                .box(30, 30, gantry_h))
        result = result.union(post)
    bar = (cq.Workplane("XY").workplane(offset=h + gantry_h)
           .transformed(offset=(0, d/2 - 30, 0))
           .box(w, 30, 30))
    # Scale platform (built into bench)
    scale = (cq.Workplane("XY").workplane(offset=h + 30)
             .transformed(offset=(w/3, 0, 0))
             .box(400, 400, 5))
    return result.union(shelf).union(bar).union(scale)
$CADQUERY$,
    '{"width": {"type": "number", "default": 1800.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,MDF,packing}',
    '#C0C0C0',
    'Packing bench / workstation.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 18. stretch_wrapper
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'stretch_wrapper',
    'Pallet Stretch Wrapper',
    'domain',
    'packing',
$CADQUERY$
def stretch_wrapper(params):
    """Pallet stretch wrapper (turntable type)."""
    turntable_d = params.get("turntable_diameter", 1650.0)
    mast_h = params.get("mast_height", 2500.0)

    # Turntable
    table = cq.Workplane("XY").circle(turntable_d/2).extrude(30)
    # Drive underneath
    drive = (cq.Workplane("XY").workplane(offset=-40)
             .circle(turntable_d/3).extrude(40))
    # Mast (vertical, side-mounted)
    mast = (cq.Workplane("XY")
            .transformed(offset=(turntable_d/2 + 60, 0, mast_h/2))
            .box(80, 80, mast_h))
    # Film carriage (on mast)
    carriage = (cq.Workplane("XY")
                .transformed(offset=(turntable_d/2 + 120, 0, mast_h * 0.4))
                .box(100, 200, 300))
    # Film roll
    roll = (cq.Workplane("XY")
            .transformed(offset=(turntable_d/2 + 180, 0, mast_h * 0.4))
            .circle(75).extrude(120).translate((0, -60, 0)))
    # Ramp
    ramp = (cq.Workplane("XY")
            .transformed(offset=(-(turntable_d/2 + 200), 0, 15))
            .box(400, turntable_d * 0.8, 30))
    return table.union(drive).union(mast).union(carriage).union(roll).union(ramp)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,packing}',
    '#4682B4',
    'Pallet stretch wrapper (turntable type).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 19. pallet_rack_upright
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pallet_rack_upright',
    'Pallet Rack Upright Frame',
    'domain',
    'storage',
$CADQUERY$
def pallet_rack_upright(params):
    """Pallet racking upright frame."""
    h = params.get("height", 6000.0)
    d = params.get("depth", 1100.0)
    w = params.get("width", 80.0)

    # Two vertical posts
    for dy in [-(d/2), d/2]:
        post = (cq.Workplane("XY")
                .transformed(offset=(0, dy, h/2))
                .box(w, w, h))
        post_bore = (cq.Workplane("XY")
                     .transformed(offset=(0, dy, h/2))
                     .box(w - 4, w - 4, h + 2))
        post = post.cut(post_bore)
        if dy < 0:
            result = post
        else:
            result = result.union(post)
    # Diagonal bracing
    brace_count = int(h / 500)
    for i in range(brace_count):
        bz = 250 + i * 500
        if i % 2 == 0:
            brace = (cq.Workplane("XY")
                     .transformed(offset=(0, 0, bz))
                     .transformed(rotate=(30, 0, 0))
                     .box(3, d * 0.7, 30))
        else:
            brace = (cq.Workplane("XY")
                     .transformed(offset=(0, 0, bz))
                     .transformed(rotate=(-30, 0, 0))
                     .box(3, d * 0.7, 30))
        result = result.union(brace)
    # Horizontal ties
    for bz in [100, h - 100]:
        tie = (cq.Workplane("XY")
               .transformed(offset=(0, 0, bz))
               .box(3, d - w, 30))
        result = result.union(tie)
    # Base plates and anchor bolts
    for dy in [-(d/2), d/2]:
        bp = (cq.Workplane("XY")
              .transformed(offset=(0, dy, 0))
              .box(120, 120, 5))
        result = result.union(bp)
    return result
$CADQUERY$,
    '{"height": {"type": "number", "default": 6000.0, "unit": "mm", "enum": [3000, 4500, 6000, 8000, 10000, 12000]}}'::jsonb,
    '[]'::jsonb,
    '{steel,racking}',
    '#4169E1',
    'Pallet racking upright frame.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 20. pallet_rack_beam
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pallet_rack_beam',
    'Pallet Rack Beam (Pair)',
    'domain',
    'storage',
$CADQUERY$
def pallet_rack_beam(params):
    """Pallet racking beam (pair)."""
    length = params.get("length", 2700.0)
    beam_h = params.get("beam_height", 100.0)
    beam_t = params.get("beam_thickness", 1.5)

    # Box beam profile
    outer = cq.Workplane("XY").box(length, 50, beam_h)
    inner = cq.Workplane("XY").box(length - 10, 50 - 2*beam_t, beam_h - 2*beam_t)
    beam = outer.cut(inner)
    # End connectors (hook-in tabs, both ends)
    for ex in [-(length/2 + 15), length/2 + 15]:
        tab = (cq.Workplane("XY")
               .transformed(offset=(ex, 0, 0))
               .box(30, 50, beam_h + 20))
        for hz in [-beam_h/3, beam_h/3]:
            hook = (cq.Workplane("XY")
                    .transformed(offset=(ex, 0, hz))
                    .box(10, 55, 15))
            tab = tab.cut(hook)
        beam = beam.union(tab)
    # Safety pin holes
    for ex in [-(length/2 + 5), length/2 + 5]:
        pin = (cq.Workplane("XY")
               .transformed(offset=(ex, 0, -(beam_h/2 + 5)))
               .circle(3).extrude(55).translate((0, -27, 0)))
        beam = beam.cut(pin)
    return beam
$CADQUERY$,
    '{"length": {"type": "number", "default": 2700.0, "unit": "mm", "enum": [1800, 2250, 2700, 3300, 3600]}}'::jsonb,
    '[]'::jsonb,
    '{steel,racking}',
    '#FF8C00',
    'Pallet racking beam (pair).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 21. eur_pallet
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'eur_pallet',
    'EUR / UK Pallet',
    'domain',
    'storage',
$CADQUERY$
def eur_pallet(params):
    """EUR pallet (1200x800) or UK pallet (1200x1000)."""
    ptype = params.get("type", "EUR")
    sizes = {"EUR": (1200, 800), "UK": (1200, 1000)}
    l, w = sizes.get(ptype, (1200, 800))
    board_t = 22.0
    block_h = 78.0

    # Top deck boards (5)
    result = None
    board_w = [100, 145, 145, 145, 100]
    bx = -w/2
    for bw in board_w:
        bx += bw/2
        board = (cq.Workplane("XY").workplane(offset=block_h + board_t)
                 .transformed(offset=(0, bx, 0))
                 .box(l, bw, board_t))
        result = board if result is None else result.union(board)
        bx += bw/2 + (w - sum(board_w)) / 4
    # Bottom deck boards (3)
    for by in [-(w/2 - 50), 0, w/2 - 50]:
        board = (cq.Workplane("XY")
                 .transformed(offset=(0, by, board_t/2))
                 .box(l, 100, board_t))
        result = result.union(board)
    # Blocks (9 - 3x3 grid)
    for bx in [-(l/2 - 50), 0, l/2 - 50]:
        for by in [-(w/2 - 50), 0, w/2 - 50]:
            block = (cq.Workplane("XY").workplane(offset=board_t)
                     .transformed(offset=(bx, by, 0))
                     .box(100, 100, block_h))
            result = result.union(block)
    return result
$CADQUERY$,
    '{"type": {"type": "string", "default": "EUR", "enum": ["EUR", "UK"]}}'::jsonb,
    '[]'::jsonb,
    '{timber,pallet}',
    '#8B7355',
    'EUR pallet (1200x800) or UK pallet (1200x1000).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 22. picking_tote
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'picking_tote',
    'Picking Tote / Bin',
    'domain',
    'storage',
$CADQUERY$
def picking_tote(params):
    """Picking bin / tote (stackable)."""
    l = params.get("length", 600.0)
    w = params.get("width", 400.0)
    h = params.get("height", 280.0)
    wall_t = params.get("wall_thickness", 3.0)

    outer = (cq.Workplane("XY")
             .sketch().rect(l, w).vertices().fillet(10).finalize()
             .extrude(h))
    inner = (cq.Workplane("XY").workplane(offset=wall_t)
             .sketch().rect(l - 2*wall_t, w - 2*wall_t).vertices().fillet(8).finalize()
             .extrude(h))
    tote = outer.cut(inner)
    # Reinforcement rim (top)
    rim = (cq.Workplane("XY").workplane(offset=h - 5)
           .sketch().rect(l + 10, w + 10).vertices().fillet(12).finalize()
           .extrude(10))
    rim_inner = (cq.Workplane("XY").workplane(offset=h - 6)
                 .sketch().rect(l - 5, w - 5).vertices().fillet(8).finalize()
                 .extrude(12))
    rim = rim.cut(rim_inner)
    # Handles (2 end slots)
    for lx in [-(l/2 + 3), l/2 + 3]:
        handle_cut = (cq.Workplane("XY")
                      .transformed(offset=(lx, 0, h * 0.7))
                      .box(wall_t + 6, w * 0.4, h * 0.15))
        tote = tote.cut(handle_cut)
    # Stacking lugs (4 corners, inside bottom)
    for x in [-(l/2 - 15), l/2 - 15]:
        for y in [-(w/2 - 15), w/2 - 15]:
            lug = (cq.Workplane("XY").workplane(offset=wall_t)
                   .transformed(offset=(x, y, 0))
                   .box(20, 20, 15))
            tote = tote.union(lug)
    return tote.union(rim)
$CADQUERY$,
    '{"length": {"type": "number", "default": 600.0, "unit": "mm"}, "width": {"type": "number", "default": 400.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{plastic,tote}',
    '#4169E1',
    'Picking bin / tote (stackable).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 23. dock_leveller
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'dock_leveller',
    'Hydraulic Dock Leveller',
    'domain',
    'dock',
$CADQUERY$
def dock_leveller(params):
    """Hydraulic dock leveller."""
    w = params.get("width", 2000.0)
    l = params.get("length", 3000.0)
    platform_t = params.get("platform_thickness", 12.0)

    # Main platform (diamond plate)
    platform = cq.Workplane("XY").box(l, w, platform_t)
    # Lip (hinged extension at truck end)
    lip = (cq.Workplane("XY")
           .transformed(offset=(l/2 + 200, 0, -20))
           .box(400, w - 40, platform_t))
    # Hinge (lip to platform)
    hinge = (cq.Workplane("XY")
             .transformed(offset=(l/2, 0, 0))
             .transformed(rotate=(90, 0, 0))
             .circle(10).extrude(w - 50).translate((0, -(w/2 - 25), 0)))
    # Pit frame
    frame_h = 400
    for side in [-1, 1]:
        frame_side = (cq.Workplane("XY")
                      .transformed(offset=(0, side * (w/2 + 10), -(frame_h/2 + platform_t/2)))
                      .box(l + 80, 20, frame_h))
        platform = platform.union(frame_side)
    # Rear header
    rear = (cq.Workplane("XY")
            .transformed(offset=(-(l/2 + 10), 0, -(frame_h/2 + platform_t/2)))
            .box(20, w + 40, frame_h))
    # Hydraulic cylinder (under platform)
    cyl = (cq.Workplane("XY")
           .transformed(offset=(0, 0, -(frame_h/2)))
           .transformed(rotate=(0, 10, 0))
           .circle(40).extrude(l * 0.5))
    return platform.union(lip).union(hinge).union(rear).union(cyl)
$CADQUERY$,
    '{"width": {"type": "number", "default": 2000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,dock}',
    '#708090',
    'Hydraulic dock leveller.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 24. dock_bumper
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'dock_bumper',
    'Rubber Dock Bumper',
    'domain',
    'dock',
$CADQUERY$
def dock_bumper(params):
    """Rubber dock bumper (truck bay protection)."""
    w = params.get("width", 450.0)
    h = params.get("height", 250.0)
    d = params.get("depth", 100.0)

    body = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(15).finalize()
            .extrude(h))
    # Bolt holes (4)
    for bx in [-(w/3), w/3]:
        for bz in [h * 0.25, h * 0.75]:
            hole = (cq.Workplane("XY")
                    .transformed(offset=(bx, 0, bz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(8).extrude(d + 10).translate((0, -(d/2 + 5), 0)))
            body = body.cut(hole)
    return body
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{rubber,dock}',
    '#2F2F2F',
    'Rubber dock bumper (truck bay protection).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 25. barcode_scanner_fixed
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'barcode_scanner_fixed',
    'Fixed-Mount Barcode Scanner',
    'domain',
    'controls',
$CADQUERY$
def barcode_scanner_fixed(params):
    """Fixed-mount industrial barcode scanner."""
    w = params.get("width", 80.0)
    h = params.get("height", 55.0)
    d = params.get("depth", 60.0)

    body = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(5).finalize()
            .extrude(h))
    # Scan window (front)
    window = (cq.Workplane("XY")
              .transformed(offset=(0, -(d/2 + 1), h * 0.5))
              .box(w * 0.7, 2, h * 0.4))
    # Indicator LEDs (top)
    for dx in [-15, 0, 15]:
        led = (cq.Workplane("XY").workplane(offset=h)
               .transformed(offset=(dx, 0, 0))
               .circle(3).extrude(2))
        body = body.union(led)
    # Mounting bracket (L-shaped)
    bracket_h = (cq.Workplane("XY")
                 .transformed(offset=(0, d/2 + 10, h/2))
                 .box(w, 20, h))
    bracket_v = (cq.Workplane("XY")
                 .transformed(offset=(0, d/2 + 25, h + 5))
                 .box(w, 30, 10))
    # Cable exit (rear)
    cable = (cq.Workplane("XY")
             .transformed(offset=(0, d/2 + 5, h * 0.3))
             .circle(6).extrude(15))
    return body.union(window).union(bracket_h).union(bracket_v).union(cable)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{plastic,sensing}',
    '#2F2F2F',
    'Fixed-mount industrial barcode scanner.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 26. light_curtain
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'light_curtain',
    'Safety Light Curtain',
    'domain',
    'controls',
$CADQUERY$
def light_curtain(params):
    """Safety light curtain (sender + receiver pair)."""
    h = params.get("height", 1200.0)
    body_w = params.get("body_width", 30.0)
    body_d = params.get("body_depth", 35.0)
    gap = params.get("gap", 1500.0)

    result = None
    for side in [-1, 1]:
        gx = side * (gap/2)
        col = (cq.Workplane("XY")
               .transformed(offset=(gx, 0, h/2))
               .box(body_w, body_d, h))
        # Lens strip (front face)
        lens = (cq.Workplane("XY")
                .transformed(offset=(gx, -(body_d/2 + 1), h/2))
                .box(body_w * 0.6, 2, h - 20))
        # End caps
        for z in [10, h - 10]:
            cap = (cq.Workplane("XY")
                   .transformed(offset=(gx, 0, z))
                   .box(body_w + 4, body_d + 4, 15))
            col = col.union(cap)
        # Mounting bracket (top and bottom)
        for z in [0, h]:
            bracket = (cq.Workplane("XY")
                       .transformed(offset=(gx, body_d/2 + 15, z))
                       .box(body_w, 30, 20))
            col = col.union(bracket)
        part = col.union(lens)
        result = part if result is None else result.union(part)
    return result
$CADQUERY$,
    '{"height": {"type": "number", "default": 1200.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{aluminium,safety}',
    '#FFD700',
    'Safety light curtain (sender + receiver pair).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 27. estop_button
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'estop_button',
    'Emergency Stop Button',
    'domain',
    'controls',
$CADQUERY$
def estop_button(params):
    """Emergency stop mushroom button."""
    body_d = params.get("body_diameter", 40.0)
    head_d = params.get("head_diameter", 60.0)

    # Contact block (behind panel)
    block = cq.Workplane("XY").box(40, 40, 40)
    # Bezel (panel mount)
    bezel = (cq.Workplane("XY").workplane(offset=40)
             .circle(body_d/2 + 5).extrude(5))
    # Mushroom head
    head = (cq.Workplane("XY").workplane(offset=45)
            .circle(head_d/2).extrude(20))
    dome = (cq.Workplane("XY").workplane(offset=65)
            .circle(head_d/2).workplane(offset=10).circle(head_d/3).loft())
    return block.union(bezel).union(head).union(dome)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{plastic,safety}',
    '#FF0000',
    'Emergency stop mushroom button.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- Physical Properties + Procurement Enrichment
-- ============================================================

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "mild_steel_frame_PVC_or_PU_belt", "typical_mass_kg_per_m": {"400mm": 25, "600mm": 35, "800mm": 45, "1200mm": 65}}, "electrical": {"voltage_v": [240, 415], "motor_kw": [0.37, 0.55, 0.75, 1.1, 1.5, 2.2]}, "thermal": {"belt_max_temp_c": {"PVC": 80, "PU": 90, "silicone": 200}}, "mechanical": {"speed_m_min": [5, 10, 20, 30, 60], "load_kg_m": {"light": 25, "medium": 50, "heavy": 100}}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"light": 400, "medium": 600, "heavy": 900}, "lead_time_days": 21, "common_suppliers": ["Interroll", "Hytrol", "L.A.C. Conveyors", "Conveyor Units", "Transnorm"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'belt_conveyor';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "mild_steel_frame_galvanised_rollers", "typical_mass_kg_per_m": {"gravity_500mm": 15, "powered_500mm": 25, "powered_600mm": 35}}, "electrical": {"voltage_v": 24, "motor_per_zone_w": [10, 20, 40]}, "thermal": {"operating_temp_c": [-10, 50]}, "mechanical": {"roller_d_mm": [50, 60, 80], "pitch_mm": [75, 100, 125]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"gravity": 150, "MDR": 400}, "lead_time_days": 14, "common_suppliers": ["Interroll", "Itoh Denki", "L.A.C.", "Dematic"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'roller_conveyor';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_frame_plastic_slat_belt", "typical_mass_kg": {"1500mm_OD_3m": 500}}, "electrical": {"voltage_v": 415, "motor_kw": [1.5, 2.2, 3.0]}, "thermal": {"operating_temp_c": [-25, 60]}, "mechanical": {"elevation_m": [1.5, 3, 5, 8, 12], "throughput_uph": [1000, 2000, 3000]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 15000, "lead_time_days": 42, "common_suppliers": ["Ambaflex", "Ryson", "Apollo VTS", "Transnorm"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'spiral_conveyor';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_frame_steel_ball_units", "typical_mass_kg": {"600x600": 25, "900x900": 45}}, "electrical": null, "thermal": {"operating_temp_c": [0, 50]}, "mechanical": {"ball_d_mm": [25, 30, 38], "load_per_unit_kg": [15, 30, 70]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 300, "lead_time_days": 7, "common_suppliers": ["Alwayse", "ISB", "Conveyor Units"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'ball_transfer_table';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_chassis_HDPE_covers", "typical_mass_kg": {"300kg": 80, "600kg": 130, "1500kg": 250}}, "electrical": {"battery": {"type": "LFP", "voltage_v": 48, "capacity_kwh": [1.5, 3, 5]}}, "thermal": {"operating_temp_c": [0, 40]}, "mechanical": {"payload_kg": [100, 300, 600, 1000, 1500], "speed_m_s": [1.0, 1.5, 2.0], "navigation": ["SLAM_LiDAR", "QR_code", "natural_feature"]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"300kg": 25000, "600kg": 40000, "1500kg": 65000}, "lead_time_days": 56, "common_suppliers": ["Locus Robotics", "6 River Systems", "MiR", "OTTO Motors", "Geek+"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'amr_platform';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_chassis", "typical_mass_kg": {"1t": 500, "2t": 800}}, "electrical": {"battery": {"type": "LFP", "voltage_v": 48, "capacity_kwh": [8, 15, 25]}}, "thermal": {"operating_temp_c": [-10, 45]}, "mechanical": {"payload_kg": [1000, 1500, 2000, 3000], "lift_height_mm": [200, 1500, 3000, 6000]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 60000, "lead_time_days": 84, "common_suppliers": ["Jungheinrich", "KUKA", "Dematic", "Toyota AGV", "Vecna"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'pallet_agv';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "aluminium_frame_tilt_tray", "typical_mass_kg_per_cell": 15}, "electrical": {"voltage_v": 24, "power_per_cell_w": 50}, "thermal": {"operating_temp_c": [5, 40]}, "mechanical": {"tray_capacity_kg": [5, 15, 30], "sort_rate_items_hr": [5000, 10000, 15000]}}'::jsonb,
    procurement = '{"typical_system_cost_gbp": 500000, "lead_time_days": 180, "common_suppliers": ["Beumer", "Vanderlande", "Dematic", "Interroll"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'sorting_robot';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_mast_aluminium_carriage", "typical_mass_kg": 800}, "electrical": {"voltage_v": 415, "drive_kw": {"hoist": 5, "travel": 8}}, "thermal": {"operating_temp_c": [0, 40]}, "mechanical": {"payload_kg": [50, 100, 150], "height_m": [6, 8, 10, 12, 15], "throughput_totes_hr": [120, 200, 300]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 120000, "lead_time_days": 180, "common_suppliers": ["Dematic", "SSI Schaefer", "Swisslog", "TGW", "Knapp"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'miniload_crane';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_frame_steel_trays", "typical_mass_kg": {"6m": 3000, "10m": 5000}}, "electrical": {"voltage_v": 240, "motor_kw": [2.2, 4]}, "thermal": {"operating_temp_c": [5, 40]}, "mechanical": {"tray_payload_kg": [250, 500, 1000], "height_m": [3, 6, 8, 10, 12, 16]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"6m": 25000, "10m": 40000}, "lead_time_days": 56, "common_suppliers": ["Kardex", "Hanel", "Modula", "SSI Schaefer Logimat"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'vlm_unit';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_chassis_lithium_battery", "typical_mass_kg": 120}, "electrical": {"battery": {"type": "LFP_or_supercapacitor", "voltage_v": 48}}, "thermal": {"operating_temp_c": [-25, 40]}, "mechanical": {"payload_kg": [1000, 1500], "speed_m_s": [1.5, 4.0], "depth_positions": [2, 4, 6, 10, 20]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 15000, "lead_time_days": 90, "common_suppliers": ["Dematic", "SSI Schaefer", "Swisslog", "Mecalux"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'shuttle_car';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "aluminium_frame_LFP_battery", "typical_mass_kg": 35}, "electrical": {"battery": {"type": "LFP", "voltage_v": 48, "runtime_h": 16}}, "thermal": {"operating_temp_c": [2, 35]}, "mechanical": {"bin_payload_kg": 30, "speed_m_s": 3.1, "grid_cell_mm": 650}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 10000, "lead_time_days": 120, "common_suppliers": ["AutoStore", "Ocado Technology"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'cube_storage_robot';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "mild_steel_hydraulic", "typical_mass_kg": {"1t": 350, "2t": 600}}, "electrical": {"voltage_v": [240, 415], "motor_kw": [1.1, 2.2, 3.0]}, "thermal": {"operating_temp_c": [0, 40]}, "mechanical": {"capacity_kg": [500, 1000, 2000, 4000], "travel_mm": [500, 750, 1000, 1500, 2000]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"1t": 2000, "2t": 3500}, "lead_time_days": 21, "common_suppliers": ["Edmolift", "Southworth", "Bolzoni", "Sax Lift"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'scissor_lift_table';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_structure_hydraulic_or_chain", "typical_mass_kg": 800}, "electrical": {"voltage_v": 415, "motor_kw": [3, 5.5, 7.5]}, "thermal": {"operating_temp_c": [0, 40]}, "mechanical": {"capacity_kg": [500, 1000, 2000, 5000], "travel_m": [2, 3, 5, 8, 12]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"2m_1t": 8000, "5m_2t": 15000}, "lead_time_days": 42, "common_suppliers": ["Safetech", "Transdek", "PFlow", "Merrit"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'goods_lift';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "aluminium_carriage_PU_belt", "typical_mass_kg_per_cell": 12}, "electrical": {"voltage_v": 24, "motor_per_cell_w": 50}, "thermal": {"operating_temp_c": [5, 40]}, "mechanical": {"cell_length_mm": [400, 500, 600], "max_item_kg": [30, 50], "sort_rate_hr": 15000}}'::jsonb,
    procurement = '{"typical_system_cost_gbp": 800000, "lead_time_days": 270, "common_suppliers": ["Beumer", "Vanderlande", "Interroll", "Honeywell Intelligrated"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'crossbelt_sorter_cell';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_frame_PU_wheels", "typical_mass_kg": 25}, "electrical": {"voltage_v": 24, "actuator": "pneumatic_or_electric"}, "thermal": {"operating_temp_c": [0, 45]}, "mechanical": {"divert_angle_deg": [30, 45, 90], "max_item_kg": 50}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 1500, "lead_time_days": 14, "common_suppliers": ["Hytrol", "Interroll", "Itoh Denki"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'pop_up_wheel_diverter';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "ABS_housing_LED", "typical_mass_g": 120}, "electrical": {"voltage_v": 24, "power_w": 1, "comms": "RS485_CAN_or_wireless"}, "thermal": {"operating_temp_c": [0, 45]}, "mechanical": {"display": "3_digit_7seg_or_OLED"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 40, "lead_time_days": 14, "common_suppliers": ["Lightning Pick", "Bastian", "SSI Schaefer"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'pick_to_light_module';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_frame_MDF_or_ESD_top", "typical_mass_kg": {"1500mm": 50, "1800mm": 65, "2100mm": 80}}, "electrical": {"voltage_v": 240, "sockets": 4}, "thermal": {"operating_temp_c": [5, 40]}, "mechanical": {"load_kg": 300, "height_adj_mm": [700, 1000]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 600, "lead_time_days": 14, "common_suppliers": ["Spaceguard", "Stormax", "Lista", "Treston"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'packing_bench';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_turntable_and_mast", "typical_mass_kg": {"turntable": 450, "rotary_arm": 600}}, "electrical": {"voltage_v": 415, "motor_kw": {"turntable": 0.75, "carriage": 0.37}}, "thermal": {"operating_temp_c": [0, 40]}, "mechanical": {"turntable_d_mm": [1500, 1650, 1800], "max_load_kg": [1500, 2000, 2500]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"turntable": 4000, "rotary_arm": 8000}, "lead_time_days": 21, "common_suppliers": ["Robopac", "Lantech", "Aetna Group", "Wulftec"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'stretch_wrapper';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "cold_rolled_galvanised_steel_2_2.5mm", "density_kg_m3": 7850, "mass_per_m_kg": {"90mm_post": 4.5, "100mm_post": 5.5}}, "electrical": null, "thermal": {"operating_temp_c": [-25, 50]}, "mechanical": {"height_mm": [3000, 4500, 6000, 8000, 10000, 12000], "depth_mm": [800, 900, 1100]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"3m": 30, "6m": 55, "10m": 90}, "lead_time_days": 14, "common_suppliers": ["Dexion", "Link51", "Mecalux", "SSI Schaefer", "AR Racking"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'pallet_rack_upright';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "cold_rolled_steel_1.5_2.0mm_powder_coated", "density_kg_m3": 7850, "mass_per_beam_kg": {"2700x100": 12, "2700x125": 15, "3600x150": 22}}, "electrical": null, "thermal": {"operating_temp_c": [-25, 50]}, "mechanical": {"UDL_per_pair_kg": {"2700x100": 2000, "2700x125": 3000, "3600x150": 3500}}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_pair": {"2700": 20, "3600": 28}, "lead_time_days": 14, "common_suppliers": ["Dexion", "Link51", "Mecalux", "SSI Schaefer"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'pallet_rack_beam';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "softwood_timber_heat_treated_ISPM15", "density_kg_m3": 500, "typical_mass_kg": {"EUR_1200x800": 25, "UK_1200x1000": 30}}, "electrical": null, "thermal": {"operating_temp_c": [-30, 60]}, "mechanical": {"static_load_kg": {"EUR": 4000, "UK": 4000}, "dynamic_load_kg": {"EUR": 1500, "UK": 1500}}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"EUR_new": 12, "UK_CHEP_rental": 1.50}, "lead_time_days": 3, "common_suppliers": ["CHEP", "EPAL", "LPR", "IPP Logipal"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'eur_pallet';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "polypropylene_PP_or_HDPE", "density_kg_m3": 950, "typical_mass_kg": {"400x300x220": 0.8, "600x400x280": 1.5, "600x400x340": 1.8}}, "electrical": null, "thermal": {"operating_temp_c": [-20, 60]}, "mechanical": {"stack_load_kg": 25, "nesting_ratio_pct": 70}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"400x300": 4, "600x400": 7}, "lead_time_days": 7, "common_suppliers": ["SSI Schaefer", "Bito", "Linpac Allibert", "utz"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'picking_tote';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "steel_platform_12mm_diamond_plate_hydraulic", "density_kg_m3": 7850, "typical_mass_kg": {"6t_2x3m": 700, "9t_2x3.5m": 900}}, "electrical": {"voltage_v": 415, "motor_kw": [2.2, 3]}, "thermal": {"operating_temp_c": [-20, 50]}, "mechanical": {"capacity_kg": [6000, 9000, 12000]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"6t_hydraulic": 3000, "9t_hydraulic": 4500}, "lead_time_days": 28, "common_suppliers": ["Hormann", "Assa Abloy", "Stertil", "Thorworld"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'dock_leveller';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "moulded_rubber_EPDM_or_recycled", "density_kg_m3": 1100, "typical_mass_kg": {"450x250x100": 12, "500x300x100": 16}}, "electrical": null, "thermal": {"operating_temp_c": [-30, 70]}, "mechanical": {"energy_absorption_kj": {"standard": 5, "heavy_duty": 15}}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 60, "lead_time_days": 5, "common_suppliers": ["Hormann", "Stertil", "Thorworld", "Dura"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'dock_bumper';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "aluminium_die_cast_housing_IP65", "typical_mass_g": {"compact": 150, "industrial": 350}}, "electrical": {"voltage_v": 24, "power_w": [5, 10], "interface": ["Ethernet_IP", "PROFINET", "RS232", "USB"]}, "thermal": {"operating_temp_c": [0, 50]}, "mechanical": {"type": ["1D_laser", "2D_imager", "DPM_reader"]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"1D": 200, "2D": 500}, "lead_time_days": 5, "common_suppliers": ["Cognex", "Sick", "Keyence", "Datalogic", "Zebra"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'barcode_scanner_fixed';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "aluminium_extrusion_IP65", "typical_mass_g_per_100mm": 50}, "electrical": {"voltage_v": 24, "power_w": [3, 8], "output": "OSSD_dual_channel_SIL3_PLe"}, "thermal": {"operating_temp_c": [0, 55]}, "mechanical": {"resolution_mm": [14, 20, 30, 40, 50, 90], "range_m": [0.3, 6, 12, 20]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_pair": {"300mm": 250, "900mm": 500, "1500mm": 750}, "lead_time_days": 7, "common_suppliers": ["Sick", "Keyence", "Banner", "Leuze", "Omron"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'light_curtain';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "plastic_housing_PA66_or_metal_die_cast", "typical_mass_g": 100}, "electrical": {"voltage_v": [24, 240], "contacts": "1NC_1NC_or_2NC", "current_a": 10}, "thermal": {"operating_temp_c": [-25, 70]}, "mechanical": {"head_d_mm": [40, 60], "actuator": "mushroom_head_push_lock_turn_release"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 8, "lead_time_days": 1, "common_suppliers": ["Schneider", "Siemens", "ABB", "Eaton", "Pilz"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'estop_button';
