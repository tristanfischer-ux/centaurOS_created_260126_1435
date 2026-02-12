-- ============================================================
-- ForgeOS Component Geometry Library — Seed Data
-- Migration: 20260212300001_seed_component_library
-- ============================================================
-- Seeds 21 geometry types, 10 mounting standards, 6 catalogue parts.
-- CadQuery function source code stored as dollar-quoted strings.


-- ─── Tier 1: Universal Primitives (14 types) ────────────────

INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'hex_bolt',
    'Hex Head Bolt (ISO 4014)',
    'universal',
    'fastener',
$CADQUERY$
def hex_bolt(params):
    """
    ISO 4014 / DIN 931 hex head bolt.
    Recognisable: hexagonal head with chamfered edges, threaded shank.
    """
    d = params.get("thread_d", 3.0)
    L = params.get("thread_l", 10.0)
    head_af = params.get("head_d", round(d * 1.7, 1))
    head_h = params.get("head_h", round(d * 0.65, 1))
    head_ar = head_af / math.sqrt(3)

    head = (
        cq.Workplane("XY")
        .workplane(offset=0)
        .polygon(6, head_af * 2 / math.sqrt(3))
        .extrude(head_h)
    )

    head_top = (
        cq.Workplane("XY")
        .workplane(offset=head_h - 0.3)
        .circle(head_ar - 0.3)
        .extrude(0.3)
    )
    head = head.union(head_top)

    shank = (
        cq.Workplane("XY")
        .workplane(offset=-L)
        .circle(d / 2.0)
        .extrude(L)
    )

    thread_pitch = {2: 0.4, 2.5: 0.45, 3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75}.get(d, 0.5)
    thread_rings = None
    num_rings = int(L / thread_pitch)
    for i in range(min(num_rings, 40)):
        z = -L + i * thread_pitch + thread_pitch / 2.0
        ring = (
            cq.Workplane("XY")
            .workplane(offset=z)
            .circle(d / 2.0 + 0.05)
            .circle(d / 2.0 - 0.15)
            .extrude(thread_pitch * 0.3)
        )
        if thread_rings is None:
            thread_rings = ring
        else:
            thread_rings = thread_rings.union(ring)

    bolt = head.union(shank)
    if thread_rings is not None:
        bolt = bolt.union(thread_rings)

    return bolt
$CADQUERY$,
    '{"thread_d": {"type": "number", "default": 3.0, "min": 1.6, "max": 24, "unit": "mm", "description": "Nominal thread diameter"}, "thread_l": {"type": "number", "default": 10.0, "min": 3, "max": 200, "unit": "mm", "description": "Thread/shank length"}, "head_d": {"type": "number", "default": null, "unit": "mm", "description": "Head across-flats (auto-calculated if omitted)"}, "head_h": {"type": "number", "default": null, "unit": "mm", "description": "Head height (auto-calculated if omitted)"}}'::jsonb,
    '[{"name": "thread", "type": "thread", "position": "bottom"}, {"name": "head_seat", "type": "bolt_circle", "position": "top"}]'::jsonb,
    ARRAY['metal', 'steel', 'zinc'],
    '#C0C0C0',
    'ISO 4014 / DIN 931 hex head bolt. Recognisable: hexagonal head with chamfered edges, threaded shank.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'hex_nut',
    'Hex Nut (ISO 4032)',
    'universal',
    'fastener',
$CADQUERY$
def hex_nut(params):
    """
    ISO 4032 hex nut.
    Recognisable: hexagonal body with chamfered faces, threaded bore.
    """
    d = params.get("thread_d", 3.0)
    af = params.get("nut_af", round(d * 1.7, 1))
    h = params.get("nut_h", round(d * 0.8, 1))

    body = (
        cq.Workplane("XY")
        .polygon(6, af * 2 / math.sqrt(3))
        .extrude(h)
    )

    bore = (
        cq.Workplane("XY")
        .workplane(offset=-0.5)
        .circle(d / 2.0)
        .extrude(h + 1)
    )
    nut = body.cut(bore)

    ar = af / math.sqrt(3)
    for z_off in [0, h - 0.2]:
        chamf = (
            cq.Workplane("XY")
            .workplane(offset=z_off)
            .circle(ar + 0.5)
            .circle(ar - 0.2)
            .extrude(0.2)
        )
        nut = nut.cut(chamf)

    return nut
$CADQUERY$,
    '{"thread_d": {"type": "number", "default": 3.0, "min": 1.6, "max": 24, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'steel', 'zinc'],
    '#C0C0C0',
    'ISO 4032 hex nut. Recognisable: hexagonal body with chamfered faces, threaded bore.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'socket_head_cap_screw',
    'Socket Head Cap Screw (ISO 4762)',
    'universal',
    'fastener',
$CADQUERY$
def socket_head_cap_screw(params):
    """
    ISO 4762 socket head cap screw (Allen bolt).
    Recognisable: cylindrical head with hex socket, threaded shank.
    """
    d = params.get("thread_d", 3.0)
    L = params.get("thread_l", 10.0)
    hd = params.get("head_d", round(d * 1.5 + 1, 1))
    hh = params.get("head_h", max(d, 2.0))
    saf = params.get("socket_af", round(hd * 0.5, 1))

    head = (
        cq.Workplane("XY")
        .circle(hd / 2.0)
        .extrude(hh)
    )

    socket = (
        cq.Workplane("XY")
        .workplane(offset=hh - hh * 0.6)
        .polygon(6, saf * 2 / math.sqrt(3))
        .extrude(hh * 0.6 + 0.5)
    )
    head = head.cut(socket)

    shank = (
        cq.Workplane("XY")
        .workplane(offset=-L)
        .circle(d / 2.0)
        .extrude(L)
    )

    return head.union(shank)
$CADQUERY$,
    '{"thread_d": {"type": "number", "default": 3.0, "min": 1.6, "max": 24, "unit": "mm"}, "thread_l": {"type": "number", "default": 10.0, "min": 3, "max": 200, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'steel', 'black_oxide'],
    '#1A1A1A',
    'ISO 4762 socket head cap screw (Allen bolt). Recognisable: cylindrical head with hex socket, threaded shank.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'washer',
    'Plain Washer (ISO 7089)',
    'universal',
    'fastener',
$CADQUERY$
def washer(params):
    """Plain washer (ISO 7089)."""
    bore = params.get("bore_d", 3.4)
    od = params.get("od", 7.0)
    t = params.get("thickness", 0.5)

    outer = cq.Workplane("XY").circle(od / 2.0).extrude(t)
    inner = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(t + 0.2)
    return outer.cut(inner)
$CADQUERY$,
    '{"bore_d": {"type": "number", "default": 3.4, "unit": "mm"}, "od": {"type": "number", "default": 7.0, "unit": "mm"}, "thickness": {"type": "number", "default": 0.5, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'steel'],
    '#C0C0C0',
    'Plain washer (ISO 7089).',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'heat_set_insert',
    'Heat-Set Threaded Insert',
    'universal',
    'fastener',
$CADQUERY$
def heat_set_insert(params):
    """
    Brass heat-set threaded insert for 3D printing.
    Recognisable: knurled outer barrel with internal thread.
    """
    d = params.get("thread_d", 3.0)
    od = params.get("od", d + 1.6)
    length = params.get("length", d * 1.5 + 1)

    barrel = cq.Workplane("XY").circle(od / 2.0).extrude(length)

    bore = cq.Workplane("XY").workplane(offset=-0.1).circle(d / 2.0 * 0.85).extrude(length + 0.2)
    barrel = barrel.cut(bore)

    knurl = None
    groove_count = max(int(length / 1.0), 3)
    for i in range(groove_count):
        z = i * (length / groove_count) + 0.3
        groove = (
            cq.Workplane("XY")
            .workplane(offset=z)
            .circle(od / 2.0 + 0.1)
            .circle(od / 2.0 - 0.15)
            .extrude(0.3)
        )
        if knurl is None:
            knurl = groove
        else:
            knurl = knurl.union(groove)

    insert = barrel
    if knurl is not None:
        insert = insert.union(knurl)

    taper = (
        cq.Workplane("XY")
        .workplane(offset=-0.5)
        .circle(od / 2.0 + 0.5)
        .extrude(0.5)
    )
    insert = insert.cut(taper)

    return insert
$CADQUERY$,
    '{"thread_d": {"type": "number", "default": 3.0, "min": 2, "max": 8, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'brass'],
    '#B8860B',
    'Brass heat-set threaded insert for 3D printing. Recognisable: knurled outer barrel with internal thread.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'standoff',
    'PCB Standoff / Spacer',
    'universal',
    'fastener',
$CADQUERY$
def standoff(params):
    """PCB standoff / spacer (hex or round)."""
    od = params.get("od", 5.0)
    h = params.get("height", 6.0)
    bore = params.get("bore_d", 2.5)
    is_hex = params.get("hex", True)
    thread_d = params.get("thread_d", 0)

    if is_hex:
        body = cq.Workplane("XY").polygon(6, od * 2 / math.sqrt(3)).extrude(h)
    else:
        body = cq.Workplane("XY").circle(od / 2.0).extrude(h)

    hole = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(h + 0.2)
    body = body.cut(hole)

    if thread_d > 0:
        for z_base in [0, h - 2]:
            thread_boss = (
                cq.Workplane("XY")
                .workplane(offset=z_base)
                .circle(thread_d / 2.0 + 0.3)
                .circle(thread_d / 2.0)
                .extrude(2)
            )
            body = body.union(thread_boss)

    return body
$CADQUERY$,
    '{"od": {"type": "number", "default": 5.0, "unit": "mm"}, "height": {"type": "number", "default": 6.0, "unit": "mm"}, "bore_d": {"type": "number", "default": 2.5, "unit": "mm"}, "hex": {"type": "boolean", "default": true}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'steel', 'nylon'],
    '#C0C0C0',
    'PCB standoff / spacer (hex or round).',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ball_bearing',
    'Deep Groove Ball Bearing',
    'universal',
    'bearing',
$CADQUERY$
def ball_bearing(params):
    """
    Deep groove ball bearing (e.g. 608, 683, MR105).
    Recognisable: outer race, inner race, visible ball cage, shields.
    """
    bore = params.get("id", 5.0)
    od = params.get("od", 16.0)
    w = params.get("width", 5.0)
    shielded = params.get("shielded", True)

    outer = cq.Workplane("XY").circle(od / 2.0).extrude(w)
    outer_bore = cq.Workplane("XY").workplane(offset=-0.1).circle(od / 2.0 - 1.5).extrude(w + 0.2)
    outer_race = outer.cut(outer_bore)

    inner = cq.Workplane("XY").circle(bore / 2.0 + 1.5).extrude(w)
    inner_bore = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(w + 0.2)
    inner_race = inner.cut(inner_bore)

    ball_pcd = (bore / 2.0 + 1.5 + od / 2.0 - 1.5) / 2.0
    ball_d = (od / 2.0 - 1.5 - bore / 2.0 - 1.5) * 0.7

    num_balls = max(int(ball_pcd * math.pi / (ball_d * 1.5)), 5)
    num_balls = min(num_balls, 12)
    balls = None
    for i in range(num_balls):
        angle = 2 * math.pi * i / num_balls
        bx = ball_pcd * math.cos(angle)
        by = ball_pcd * math.sin(angle)
        ball = (
            cq.Workplane("XY")
            .workplane(offset=w / 2.0 - ball_d / 2.0)
            .transformed(offset=(bx, by, 0))
            .circle(ball_d / 2.0)
            .extrude(ball_d)
        )
        if balls is None:
            balls = ball
        else:
            balls = balls.union(ball)

    bearing = outer_race.union(inner_race)
    if balls is not None:
        bearing = bearing.union(balls)

    if shielded:
        for z_off in [0.3, w - 0.6]:
            shield = (
                cq.Workplane("XY")
                .workplane(offset=z_off)
                .circle(od / 2.0 - 0.5)
                .circle(bore / 2.0 + 0.8)
                .extrude(0.3)
            )
            bearing = bearing.union(shield)

    return bearing
$CADQUERY$,
    '{"id": {"type": "number", "default": 5.0, "unit": "mm", "description": "Bore diameter"}, "od": {"type": "number", "default": 16.0, "unit": "mm", "description": "Outer diameter"}, "width": {"type": "number", "default": 5.0, "unit": "mm"}, "shielded": {"type": "boolean", "default": true}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'steel', 'rotating'],
    '#A0A0A0',
    'Deep groove ball bearing (e.g. 608, 683, MR105). Recognisable: outer race, inner race, visible ball cage, shields.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'sleeve_bearing',
    'Plain Sleeve Bearing / Bushing',
    'universal',
    'bearing',
$CADQUERY$
def sleeve_bearing(params):
    """Plain sleeve / bushing bearing."""
    bore = params.get("id", 6.0)
    od = params.get("od", 10.0)
    length = params.get("length", 8.0)
    flanged = params.get("flange", False)

    body = cq.Workplane("XY").circle(od / 2.0).extrude(length)
    hole = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(length + 0.2)
    bushing = body.cut(hole)

    if flanged:
        flange_d = od * 1.4
        flange = (
            cq.Workplane("XY")
            .circle(flange_d / 2.0)
            .circle(bore / 2.0)
            .extrude(1.5)
        )
        bushing = bushing.union(flange)

    return bushing
$CADQUERY$,
    '{"id": {"type": "number", "default": 6.0, "unit": "mm"}, "od": {"type": "number", "default": 10.0, "unit": "mm"}, "length": {"type": "number", "default": 8.0, "unit": "mm"}, "flange": {"type": "boolean", "default": false}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'bronze', 'rotating'],
    '#CD853F',
    'Plain sleeve / bushing bearing.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'usb_c_receptacle',
    'USB Type-C Receptacle',
    'universal',
    'connector',
$CADQUERY$
def usb_c_receptacle(params):
    """
    USB Type-C female receptacle.
    Recognisable: obround opening, metal shell, PCB pins.
    """
    sl = params.get("shell_l", 7.35)
    sw = params.get("shell_w", 8.94)
    sh = params.get("shell_h", 3.26)

    shell = (
        cq.Workplane("XY")
        .sketch()
        .rect(sw, sl)
        .vertices().fillet(1.2)
        .finalize()
        .extrude(sh)
    )

    cavity = (
        cq.Workplane("XY")
        .workplane(offset=0.3)
        .sketch()
        .rect(sw - 0.8, sl - 0.8)
        .vertices().fillet(0.8)
        .finalize()
        .extrude(sh)
    )
    connector = shell.cut(cavity)

    tongue = (
        cq.Workplane("XY")
        .workplane(offset=sh * 0.3)
        .transformed(offset=(0, 0.5, 0))
        .sketch()
        .rect(sw - 2.0, sl - 2.0)
        .vertices().fillet(0.5)
        .finalize()
        .extrude(sh * 0.15)
    )
    connector = connector.union(tongue)

    for x_off in [-sw / 2.0 + 1, sw / 2.0 - 1]:
        tab = (
            cq.Workplane("XY")
            .workplane(offset=-1.5)
            .transformed(offset=(x_off, 0, 0))
            .box(0.8, 2.0, 1.5)
        )
        connector = connector.union(tab)

    return connector
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'electrical'],
    '#808080',
    'USB Type-C female receptacle. Recognisable: obround opening, metal shell, PCB pins.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'barrel_jack',
    'DC Barrel Jack Connector',
    'universal',
    'connector',
$CADQUERY$
def barrel_jack(params):
    """
    DC barrel jack connector (e.g. 5.5x2.1mm).
    Recognisable: cylindrical barrel with center pin.
    """
    bod = params.get("barrel_od", 5.5)
    pin = params.get("pin_d", 2.1)
    length = params.get("length", 11.0)
    panel = params.get("panel_mount", True)

    barrel = cq.Workplane("XY").circle(bod / 2.0 + 1.5).extrude(length)
    bore = cq.Workplane("XY").workplane(offset=2).circle(bod / 2.0).extrude(length)
    body = barrel.cut(bore)

    center_pin = (
        cq.Workplane("XY")
        .workplane(offset=3)
        .circle(pin / 2.0)
        .extrude(length - 3)
    )
    body = body.union(center_pin)

    if panel:
        flange = (
            cq.Workplane("XY")
            .workplane(offset=length - 2)
            .circle(bod / 2.0 + 3)
            .circle(bod / 2.0 + 1.5)
            .extrude(2)
        )
        body = body.union(flange)

    for y_off in [-3, 0, 3]:
        pin_term = (
            cq.Workplane("XY")
            .workplane(offset=-3)
            .transformed(offset=(0, y_off, 0))
            .box(0.8, 0.8, 3)
        )
        body = body.union(pin_term)

    return body
$CADQUERY$,
    '{"barrel_od": {"type": "number", "default": 5.5, "unit": "mm"}, "pin_d": {"type": "number", "default": 2.1, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['plastic', 'electrical'],
    '#1A1A1A',
    'DC barrel jack connector (e.g. 5.5x2.1mm). Recognisable: cylindrical barrel with center pin.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'jst_connector',
    'JST-XH / JST-PH Connector',
    'universal',
    'connector',
$CADQUERY$
def jst_connector(params):
    """
    JST-XH / JST-PH style PCB header connector.
    Recognisable: rectangular housing with pin grid.
    """
    pins = params.get("pins", 4)
    pitch = params.get("pitch", 2.5)
    conn_type = params.get("type", "header")

    width = (pins - 1) * pitch + 4.0
    depth = 6.0
    height = 7.0 if conn_type == "header" else 6.5

    body = (
        cq.Workplane("XY")
        .sketch()
        .rect(width, depth)
        .vertices().fillet(0.5)
        .finalize()
        .extrude(height)
    )

    cavity = (
        cq.Workplane("XY")
        .workplane(offset=height - 4)
        .sketch()
        .rect(width - 1.6, depth - 1.6)
        .vertices().fillet(0.3)
        .finalize()
        .extrude(4.5)
    )
    body = body.cut(cavity)

    pin_start_x = -((pins - 1) * pitch) / 2.0
    for i in range(pins):
        px = pin_start_x + i * pitch
        if conn_type == "header":
            pin = (
                cq.Workplane("XY")
                .workplane(offset=-3)
                .transformed(offset=(px, 0, 0))
                .box(0.6, 0.6, height + 3)
            )
        else:
            pin = (
                cq.Workplane("XY")
                .workplane(offset=1)
                .transformed(offset=(px, 0, 0))
                .box(0.5, 0.5, height - 2)
            )
        body = body.union(pin)

    latch = (
        cq.Workplane("XY")
        .workplane(offset=height - 3)
        .transformed(offset=(0, depth / 2.0, 0))
        .box(4, 1.5, 2)
    )
    body = body.union(latch)

    return body
$CADQUERY$,
    '{"pins": {"type": "integer", "default": 4, "min": 2, "max": 8}, "pitch": {"type": "number", "default": 2.5, "unit": "mm"}, "type": {"type": "string", "default": "header", "enum": ["header", "housing"]}}'::jsonb,
    '[]'::jsonb,
    ARRAY['plastic', 'electrical'],
    '#F5F5DC',
    'JST-XH / JST-PH style PCB header connector. Recognisable: rectangular housing with pin grid.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'round_tube',
    'Round Tube / Pipe',
    'universal',
    'tube',
$CADQUERY$
def round_tube(params):
    """Round tube / pipe section."""
    od = params.get("od", 25.0)
    wall = params.get("wall", 2.0)
    length = params.get("length", 100.0)

    outer = cq.Workplane("XY").circle(od / 2.0).extrude(length)
    inner = cq.Workplane("XY").workplane(offset=-0.1).circle(od / 2.0 - wall).extrude(length + 0.2)
    return outer.cut(inner)
$CADQUERY$,
    '{"od": {"type": "number", "default": 25.0, "unit": "mm"}, "wall": {"type": "number", "default": 2.0, "unit": "mm"}, "length": {"type": "number", "default": 100.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'structural'],
    '#B0B0B0',
    'Round tube / pipe section.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'square_tube',
    'Square / Rectangular Tube',
    'universal',
    'tube',
$CADQUERY$
def square_tube(params):
    """Square / rectangular tube section."""
    w = params.get("width", 20.0)
    h = params.get("height", w)
    wall = params.get("wall", 2.0)
    length = params.get("length", 100.0)
    cr = params.get("corner_r", wall)

    outer = (
        cq.Workplane("XY")
        .sketch().rect(w, h).vertices().fillet(cr).finalize()
        .extrude(length)
    )
    inner = (
        cq.Workplane("XY")
        .workplane(offset=-0.1)
        .sketch().rect(w - wall * 2, h - wall * 2).vertices().fillet(max(cr - wall, 0.5)).finalize()
        .extrude(length + 0.2)
    )
    return outer.cut(inner)
$CADQUERY$,
    '{"width": {"type": "number", "default": 20.0, "unit": "mm"}, "height": {"type": "number", "default": 20.0, "unit": "mm"}, "wall": {"type": "number", "default": 2.0, "unit": "mm"}, "length": {"type": "number", "default": 100.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'structural'],
    '#B0B0B0',
    'Square / rectangular tube section.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'l_bracket',
    'L-Bracket (Sheet Metal)',
    'universal',
    'bracket',
$CADQUERY$
def l_bracket(params):
    """L-shaped sheet metal bracket with mounting holes."""
    a = params.get("leg_a", 30.0)
    b = params.get("leg_b", 30.0)
    w = params.get("width", 20.0)
    t = params.get("thickness", 2.0)

    leg_v = (
        cq.Workplane("XY")
        .transformed(offset=(t / 2, 0, a / 2))
        .box(t, w, a)
    )

    leg_h = (
        cq.Workplane("XY")
        .transformed(offset=(b / 2, 0, t / 2))
        .box(b, w, t)
    )

    bracket = leg_v.union(leg_h)

    hole_d = params.get("hole_d", 3.4)
    if hole_d > 0:
        h1 = (
            cq.Workplane("XY")
            .workplane(offset=a * 0.65)
            .transformed(offset=(0, 0, 0))
            .transformed(rotate=(0, 90, 0))
            .circle(hole_d / 2.0)
            .extrude(t + 2)
        )
        h2 = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(b * 0.65, 0, 0))
            .circle(hole_d / 2.0)
            .extrude(t + 1)
        )
        bracket = bracket.cut(h1).cut(h2)

    return bracket
$CADQUERY$,
    '{"leg_a": {"type": "number", "default": 30.0, "unit": "mm"}, "leg_b": {"type": "number", "default": 30.0, "unit": "mm"}, "width": {"type": "number", "default": 20.0, "unit": "mm"}, "thickness": {"type": "number", "default": 2.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'structural', 'sheet_metal'],
    '#B0B0B0',
    'L-shaped sheet metal bracket with mounting holes.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- ─── Tier 2: Electromechanical (7 types) ────────────────────

INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'brushless_motor_outrunner',
    'Brushless Motor (Outrunner)',
    'electromechanical',
    'motor',
$CADQUERY$
def brushless_motor_outrunner(params):
    """
    Brushless DC outrunner motor (e.g. drone motor, gimbal motor).
    Recognisable: wide bell housing with magnets, stator windings visible,
    mounting flange with bolt circle, protruding shaft.
    """
    od = params.get("od", 28.0)
    h = params.get("height", 14.0)
    shaft_d = params.get("shaft_d", 5.0)
    shaft_h = params.get("shaft_h", 8.0)
    bolt_pcd = params.get("bolt_pcd", 19.0)
    bolt_count = params.get("bolt_count", 4)
    bolt_size = params.get("bolt_size", 3.0)
    bell_ext = params.get("bell_extend", 2.0)

    flange_h = 2.0
    flange = (
        cq.Workplane("XY")
        .circle(od / 2.0 + 1)
        .extrude(flange_h)
    )
    for i in range(bolt_count):
        angle = 2 * math.pi * i / bolt_count + math.pi / bolt_count
        bx = bolt_pcd / 2.0 * math.cos(angle)
        by = bolt_pcd / 2.0 * math.sin(angle)
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(bx, by, 0))
            .circle(bolt_size / 2.0)
            .extrude(flange_h + 1)
        )
        flange = flange.cut(hole)

    stator_od = od - bell_ext * 2 - 1
    stator_h = h - flange_h - 2
    stator = (
        cq.Workplane("XY")
        .workplane(offset=flange_h)
        .circle(stator_od / 2.0)
        .extrude(stator_h)
    )
    stator_bore = (
        cq.Workplane("XY")
        .workplane(offset=flange_h - 0.1)
        .circle(shaft_d / 2.0 + 2)
        .extrude(stator_h + 0.2)
    )
    stator = stator.cut(stator_bore)

    slot_count = 12
    for i in range(slot_count):
        angle = 2 * math.pi * i / slot_count
        sx = (stator_od / 2.0 - 1.5) * math.cos(angle)
        sy = (stator_od / 2.0 - 1.5) * math.sin(angle)
        slot = (
            cq.Workplane("XY")
            .workplane(offset=flange_h + 0.5)
            .transformed(offset=(sx, sy, 0))
            .circle(1.0)
            .extrude(stator_h - 1)
        )
        stator = stator.cut(slot)

    bell_od = od + bell_ext
    bell_h = stator_h + 1
    bell = (
        cq.Workplane("XY")
        .workplane(offset=h - bell_h)
        .circle(bell_od / 2.0)
        .extrude(bell_h)
    )
    bell_inner = (
        cq.Workplane("XY")
        .workplane(offset=h - bell_h - 0.1)
        .circle(bell_od / 2.0 - 1.5)
        .extrude(bell_h - 1)
    )
    bell = bell.cut(bell_inner)

    bell_cap = (
        cq.Workplane("XY")
        .workplane(offset=h - 1.5)
        .circle(bell_od / 2.0)
        .circle(shaft_d / 2.0 + 1)
        .extrude(1.5)
    )
    bell = bell.union(bell_cap)

    vent_count = 4
    for i in range(vent_count):
        angle = 2 * math.pi * i / vent_count
        vx = (bell_od / 2.0 - 0.5) * math.cos(angle)
        vy = (bell_od / 2.0 - 0.5) * math.sin(angle)
        vent = (
            cq.Workplane("XY")
            .workplane(offset=h - bell_h + 2)
            .transformed(offset=(vx, vy, 0))
            .circle(2.0)
            .extrude(bell_h - 5)
        )
        bell = bell.cut(vent)

    shaft = (
        cq.Workplane("XY")
        .workplane(offset=h)
        .circle(shaft_d / 2.0)
        .extrude(shaft_h)
    )

    bearing_boss = (
        cq.Workplane("XY")
        .workplane(offset=h)
        .circle(shaft_d / 2.0 + 2)
        .circle(shaft_d / 2.0 + 0.5)
        .extrude(1.5)
    )

    motor = flange.union(stator).union(bell).union(bell_cap).union(shaft).union(bearing_boss)
    return motor
$CADQUERY$,
    '{"od": {"type": "number", "default": 28.0, "min": 12, "max": 80, "unit": "mm"}, "height": {"type": "number", "default": 14.0, "min": 5, "max": 50, "unit": "mm"}, "shaft_d": {"type": "number", "default": 5.0, "unit": "mm"}, "shaft_h": {"type": "number", "default": 8.0, "unit": "mm"}, "bolt_pcd": {"type": "number", "default": 19.0, "unit": "mm"}, "bolt_count": {"type": "integer", "default": 4}, "bolt_size": {"type": "number", "default": 3.0, "unit": "mm"}}'::jsonb,
    '[{"name": "base_bolts", "type": "bolt_circle", "position": "bottom"}, {"name": "shaft_output", "type": "press_fit", "position": "top"}]'::jsonb,
    ARRAY['metal', 'aluminium', 'rotating', 'electrical'],
    '#404040',
    'Brushless DC outrunner motor. Recognisable: wide bell housing with magnets, stator windings visible, mounting flange with bolt circle, protruding shaft.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'brushless_motor_pancake',
    'Brushless Motor (Pancake / Gimbal)',
    'electromechanical',
    'motor',
$CADQUERY$
def brushless_motor_pancake(params):
    """
    Pancake / gimbal brushless motor - flat, wide, low-profile.
    Used in camera gimbals, direct-drive turntables.
    """
    od = params.get("od", 35.0)
    h = params.get("height", 8.0)
    bore = params.get("bore_d", 14.0)
    bolt_pcd = params.get("bolt_pcd", 25.0)

    stator = (
        cq.Workplane("XY")
        .circle(od / 2.0 - 3)
        .circle(bore / 2.0 + 2)
        .extrude(h - 2)
    )

    rotor = (
        cq.Workplane("XY")
        .workplane(offset=1)
        .circle(od / 2.0)
        .circle(od / 2.0 - 2.5)
        .extrude(h - 2)
    )

    base = (
        cq.Workplane("XY")
        .circle(od / 2.0 - 1)
        .circle(bore / 2.0)
        .extrude(1)
    )

    motor = stator.union(rotor).union(base)

    for i in range(3):
        angle = 2 * math.pi * i / 3
        bx = bolt_pcd / 2.0 * math.cos(angle)
        by = bolt_pcd / 2.0 * math.sin(angle)
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(bx, by, 0))
            .circle(1.5)
            .extrude(h + 1)
        )
        motor = motor.cut(hole)

    return motor
$CADQUERY$,
    '{"od": {"type": "number", "default": 35.0, "unit": "mm"}, "height": {"type": "number", "default": 8.0, "unit": "mm"}, "bore_d": {"type": "number", "default": 14.0, "unit": "mm"}, "bolt_pcd": {"type": "number", "default": 25.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'rotating', 'electrical'],
    '#303030',
    'Pancake / gimbal brushless motor - flat, wide, low-profile. Used in camera gimbals, direct-drive turntables.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'stepper_motor_nema',
    'NEMA Stepper Motor',
    'electromechanical',
    'motor',
$CADQUERY$
def stepper_motor_nema(params):
    """
    NEMA stepper motor (NEMA 17, NEMA 23, etc).
    Recognisable: square faceplate, round body, shaft with flat.
    """
    nema = params.get("nema_size", 17)

    nema_dims = {
        17: {"face": 42.3, "bolt_spacing": 31.0, "pilot_d": 22.0, "shaft_d": 5.0},
        23: {"face": 57.2, "bolt_spacing": 47.1, "pilot_d": 38.1, "shaft_d": 6.35},
        34: {"face": 86.0, "bolt_spacing": 69.6, "pilot_d": 73.0, "shaft_d": 12.7},
    }
    dims = nema_dims.get(nema, nema_dims[17])

    face = dims["face"]
    bolt_sp = dims["bolt_spacing"]
    pilot_d = dims["pilot_d"]
    shaft_d = params.get("shaft_d", dims["shaft_d"])
    body_l = params.get("body_l", face)
    shaft_l = params.get("shaft_l", 24.0)

    faceplate = (
        cq.Workplane("XY")
        .sketch()
        .rect(face, face)
        .vertices().fillet(3)
        .finalize()
        .extrude(5)
    )

    body = (
        cq.Workplane("XY")
        .workplane(offset=-body_l + 5)
        .circle(face / 2.0 - 1)
        .extrude(body_l - 5)
    )

    pilot = (
        cq.Workplane("XY")
        .workplane(offset=5)
        .circle(pilot_d / 2.0)
        .extrude(2)
    )

    shaft = (
        cq.Workplane("XY")
        .workplane(offset=5)
        .circle(shaft_d / 2.0)
        .extrude(shaft_l)
    )
    flat_cut = (
        cq.Workplane("XY")
        .workplane(offset=7)
        .transformed(offset=(shaft_d / 2.0, 0, 0))
        .box(shaft_d * 0.3, shaft_d + 1, shaft_l - 2)
    )
    shaft = shaft.cut(flat_cut)

    motor = faceplate.union(body).union(pilot).union(shaft)
    half_sp = bolt_sp / 2.0
    for x, y in [(-half_sp, -half_sp), (-half_sp, half_sp), (half_sp, -half_sp), (half_sp, half_sp)]:
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-1)
            .transformed(offset=(x, y, 0))
            .circle(1.5)
            .extrude(7)
        )
        motor = motor.cut(hole)

    rear_cap = (
        cq.Workplane("XY")
        .workplane(offset=-body_l + 5)
        .sketch()
        .rect(face - 4, face - 4)
        .vertices().fillet(2)
        .finalize()
        .extrude(-2)
    )
    motor = motor.union(rear_cap)

    conn = (
        cq.Workplane("XY")
        .workplane(offset=-body_l + 3)
        .transformed(offset=(0, face / 2.0 - 8, 0))
        .box(8, 6, 5)
    )
    motor = motor.union(conn)

    return motor
$CADQUERY$,
    '{"nema_size": {"type": "integer", "default": 17, "enum": [17, 23, 34]}, "body_l": {"type": "number", "default": 40.0, "unit": "mm"}, "shaft_d": {"type": "number", "default": 5.0, "unit": "mm"}, "shaft_l": {"type": "number", "default": 24.0, "unit": "mm"}}'::jsonb,
    '[{"name": "faceplate_bolts", "type": "bolt_grid", "position": "front"}, {"name": "shaft_output", "type": "press_fit", "position": "front"}]'::jsonb,
    ARRAY['metal', 'rotating', 'electrical'],
    '#1A1A1A',
    'NEMA stepper motor (NEMA 17, NEMA 23, etc). Recognisable: square faceplate, round body, shaft with flat.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pcb_board',
    'Printed Circuit Board',
    'electromechanical',
    'pcb',
$CADQUERY$
def pcb_board(params):
    """
    Printed circuit board with mounting holes and component keep-outs.
    Recognisable: green FR4 board, copper traces, mounting holes.
    """
    w = params.get("width", 36.0)
    h = params.get("height", 36.0)
    t = params.get("thickness", 1.6)
    cr = params.get("corner_r", 2.0)

    board = (
        cq.Workplane("XY")
        .sketch()
        .rect(w, h)
        .vertices().fillet(cr)
        .finalize()
        .extrude(t)
    )

    holes = params.get("holes", [
        {"x": -(w/2 - 3), "y": -(h/2 - 3), "d": 2.2},
        {"x": -(w/2 - 3), "y": (h/2 - 3), "d": 2.2},
        {"x": (w/2 - 3), "y": -(h/2 - 3), "d": 2.2},
        {"x": (w/2 - 3), "y": (h/2 - 3), "d": 2.2},
    ])
    for hole in holes:
        h_cut = (
            cq.Workplane("XY")
            .workplane(offset=-0.1)
            .transformed(offset=(hole["x"], hole["y"], 0))
            .circle(hole["d"] / 2.0)
            .extrude(t + 0.2)
        )
        board = board.cut(h_cut)

    components = params.get("components", [])
    for comp in components:
        chip = (
            cq.Workplane("XY")
            .workplane(offset=t)
            .transformed(offset=(comp["x"], comp["y"], 0))
            .box(comp.get("w", 5), comp.get("d", 5), comp.get("h", 2))
        )
        board = board.union(chip)

    return board
$CADQUERY$,
    '{"width": {"type": "number", "default": 36.0, "unit": "mm"}, "height": {"type": "number", "default": 36.0, "unit": "mm"}, "thickness": {"type": "number", "default": 1.6, "unit": "mm"}, "corner_r": {"type": "number", "default": 2.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['pcb', 'electronic', 'fr4'],
    '#006400',
    'Printed circuit board with mounting holes and component keep-outs.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tactile_switch',
    'Tactile Push Button Switch',
    'electromechanical',
    'switch',
$CADQUERY$
def tactile_switch(params):
    """
    Through-hole tactile push button switch (6x6mm standard).
    Recognisable: square base, round button cap, 4 legs.
    """
    bw = params.get("base_w", 6.0)
    bh = params.get("base_h", 3.5)
    bd = params.get("button_d", 3.5)
    btn_h = params.get("button_h", 2.5)
    pin_l = params.get("pin_l", 3.5)

    body = (
        cq.Workplane("XY")
        .sketch()
        .rect(bw, bw)
        .vertices().fillet(0.5)
        .finalize()
        .extrude(bh)
    )

    cap = (
        cq.Workplane("XY")
        .workplane(offset=bh)
        .circle(bd / 2.0)
        .extrude(btn_h)
    )

    switch = body.union(cap)

    pin_inset = bw / 2.0 - 0.8
    for x, y in [(-pin_inset, -pin_inset), (-pin_inset, pin_inset),
                 (pin_inset, -pin_inset), (pin_inset, pin_inset)]:
        pin = (
            cq.Workplane("XY")
            .workplane(offset=-pin_l)
            .transformed(offset=(x, y, 0))
            .box(0.5, 0.5, pin_l)
        )
        switch = switch.union(pin)

    return switch
$CADQUERY$,
    '{"base_w": {"type": "number", "default": 6.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['plastic', 'electrical'],
    '#2F2F2F',
    'Through-hole tactile push button switch (6x6mm standard). Recognisable: square base, round button cap, 4 legs.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'axial_fan',
    'Axial Cooling Fan',
    'electromechanical',
    'fan',
$CADQUERY$
def axial_fan(params):
    """
    Axial cooling fan (e.g. 40mm, 80mm, 120mm).
    Recognisable: square frame with round opening, fan blades visible, mounting holes.
    """
    size = params.get("size", 40.0)
    depth = params.get("depth", 10.0)
    blades = params.get("blade_count", 7)
    hole_d = params.get("hole_d", 3.5)

    frame = (
        cq.Workplane("XY")
        .sketch()
        .rect(size, size)
        .vertices().fillet(3)
        .finalize()
        .extrude(depth)
    )
    bore = (
        cq.Workplane("XY")
        .workplane(offset=-0.1)
        .circle(size / 2.0 - 2)
        .extrude(depth + 0.2)
    )
    frame = frame.cut(bore)

    hub_d = size * 0.25
    hub = (
        cq.Workplane("XY")
        .workplane(offset=1)
        .circle(hub_d / 2.0)
        .extrude(depth - 2)
    )

    blade_r = size / 2.0 - 3
    blade_w = size * 0.08
    fan_blades = None
    for i in range(blades):
        angle = 360.0 * i / blades
        blade = (
            cq.Workplane("XY")
            .workplane(offset=depth / 2.0 - 0.5)
            .transformed(offset=(hub_d / 2.0 + (blade_r - hub_d / 2.0) / 2.0, 0, 0))
            .transformed(rotate=(0, 0, angle))
            .sketch()
            .rect(blade_r - hub_d / 2.0, blade_w)
            .vertices().fillet(min(blade_w / 2 - 0.3, 1.0))
            .finalize()
            .extrude(1.0)
        )
        if fan_blades is None:
            fan_blades = blade
        else:
            fan_blades = fan_blades.union(blade)

    fan = frame.union(hub)
    if fan_blades is not None:
        fan = fan.union(fan_blades)

    hole_inset = size / 2.0 - 3.5
    for x, y in [(-hole_inset, -hole_inset), (-hole_inset, hole_inset),
                 (hole_inset, -hole_inset), (hole_inset, hole_inset)]:
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(x, y, 0))
            .circle(hole_d / 2.0)
            .extrude(depth + 1)
        )
        fan = fan.cut(hole)

    return fan
$CADQUERY$,
    '{"size": {"type": "number", "default": 40.0, "enum": [25, 30, 40, 50, 60, 80, 92, 120, 140], "unit": "mm"}, "depth": {"type": "number", "default": 10.0, "unit": "mm"}, "blade_count": {"type": "integer", "default": 7}}'::jsonb,
    '[]'::jsonb,
    ARRAY['plastic', 'rotating', 'electrical'],
    '#1A1A1A',
    'Axial cooling fan (e.g. 40mm, 80mm, 120mm). Recognisable: square frame with round opening, fan blades visible, mounting holes.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'centrifugal_pump',
    'Centrifugal Pump',
    'electromechanical',
    'pump',
$CADQUERY$
def centrifugal_pump(params):
    """
    Small centrifugal pump (inline or base-mount).
    Recognisable: volute casing, suction/discharge nozzles, motor housing.
    """
    v_od = params.get("volute_od", 60.0)
    v_h = params.get("volute_h", 30.0)
    s_d = params.get("suction_d", 20.0)
    d_d = params.get("discharge_d", 15.0)
    m_od = params.get("motor_od", 45.0)
    m_l = params.get("motor_l", 80.0)

    volute = (
        cq.Workplane("XY")
        .circle(v_od / 2.0)
        .extrude(v_h)
    )
    volute_inner = (
        cq.Workplane("XY")
        .workplane(offset=3)
        .circle(v_od / 2.0 - 4)
        .extrude(v_h - 6)
    )
    volute = volute.cut(volute_inner)

    suction = (
        cq.Workplane("XY")
        .workplane(offset=v_h)
        .circle(s_d / 2.0)
        .extrude(s_d)
    )
    suction_bore = (
        cq.Workplane("XY")
        .workplane(offset=v_h - 1)
        .circle(s_d / 2.0 - 2)
        .extrude(s_d + 2)
    )
    suction = suction.cut(suction_bore)

    discharge = (
        cq.Workplane("XY")
        .workplane(offset=v_h / 2.0 - d_d / 2.0)
        .transformed(offset=(v_od / 2.0 + d_d / 2.0, 0, 0))
        .circle(d_d / 2.0)
        .extrude(d_d)
    )
    discharge_bore = (
        cq.Workplane("XY")
        .workplane(offset=v_h / 2.0 - d_d / 2.0 + 2)
        .transformed(offset=(v_od / 2.0 + d_d / 2.0, 0, 0))
        .circle(d_d / 2.0 - 2)
        .extrude(d_d + 2)
    )
    discharge = discharge.cut(discharge_bore)

    motor = (
        cq.Workplane("XY")
        .workplane(offset=-m_l)
        .circle(m_od / 2.0)
        .extrude(m_l)
    )

    for y_off in [-(m_od / 2.0 + 5), m_od / 2.0 + 5]:
        foot = (
            cq.Workplane("XY")
            .workplane(offset=-m_l)
            .transformed(offset=(0, y_off, 0))
            .sketch()
            .rect(15, 10)
            .vertices().fillet(2)
            .finalize()
            .extrude(5)
        )
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-m_l - 0.5)
            .transformed(offset=(0, y_off, 0))
            .circle(3)
            .extrude(6)
        )
        foot = foot.cut(hole)
        motor = motor.union(foot)

    pump = volute.union(suction).union(discharge).union(motor)
    return pump
$CADQUERY$,
    '{"volute_od": {"type": "number", "default": 60.0, "unit": "mm"}, "volute_h": {"type": "number", "default": 30.0, "unit": "mm"}, "motor_od": {"type": "number", "default": 45.0, "unit": "mm"}, "motor_l": {"type": "number", "default": 80.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'cast_iron', 'rotating'],
    '#4682B4',
    'Small centrifugal pump (inline or base-mount). Recognisable: volute casing, suction/discharge nozzles, motor housing.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- ─── Mounting Standards (10) ─────────────────────────────────

INSERT INTO mounting_standards (slug, name, interface_type, params, mates_with) VALUES
('bolt_circle_m2_9mm', 'M2 Bolt Circle dia 9mm (4-hole)', 'bolt_circle', '{"bolt_size": "M2", "pcd": 9.0, "count": 4, "bolt_length": 5}'::jsonb, ARRAY['m2_clearance_hole']),
('bolt_circle_m3_16mm', 'M3 Bolt Circle dia 16mm (4-hole)', 'bolt_circle', '{"bolt_size": "M3", "pcd": 16.0, "count": 4, "bolt_length": 8}'::jsonb, ARRAY['m3_clearance_hole']),
('bolt_circle_m3_19mm', 'M3 Bolt Circle dia 19mm (4-hole)', 'bolt_circle', '{"bolt_size": "M3", "pcd": 19.0, "count": 4, "bolt_length": 8}'::jsonb, ARRAY['m3_clearance_hole']),
('nema17_bolt_pattern', 'NEMA 17 Bolt Pattern (31mm spacing)', 'bolt_grid', '{"bolt_size": "M3", "spacing_x": 31.0, "spacing_y": 31.0, "rows": 2, "cols": 2}'::jsonb, ARRAY['m3_clearance_hole']),
('motor_shaft_5mm', '5mm Motor Shaft (D-flat)', 'press_fit', '{"shaft_d": 5.0, "flat_depth": 0.5, "engagement_length": 10}'::jsonb, ARRAY['5mm_bore_hub', '5mm_coupling']),
('motor_shaft_3_175mm', '3.175mm (1/8 inch) Motor Shaft', 'press_fit', '{"shaft_d": 3.175, "engagement_length": 8}'::jsonb, ARRAY['3mm_bore_hub']),
('usb_c_standard', 'USB Type-C Receptacle Interface', 'electrical', '{"type": "USB-C", "pins": 24, "data_rate": "USB 3.1"}'::jsonb, ARRAY['usb_c_plug']),
('jst_xh_4pin', 'JST-XH 4-Pin Interface', 'electrical', '{"type": "JST-XH", "pins": 4, "pitch": 2.5, "voltage_max": 250}'::jsonb, ARRAY['jst_xh_4pin_housing']),
('pcb_mounting_m2_5', 'PCB M2.5 Mounting (4-hole, 30.5mm)', 'bolt_grid', '{"bolt_size": "M2.5", "spacing_x": 30.5, "spacing_y": 30.5, "rows": 2, "cols": 2}'::jsonb, ARRAY['m2_5_standoff']),
('608_bearing_bore', '608 Bearing Seat (dia 22mm bore, dia 8mm shaft)', 'press_fit', '{"bore_d": 22.0, "shaft_d": 8.0, "width": 7.0}'::jsonb, ARRAY['608_bearing_housing', '8mm_shaft'])
ON CONFLICT (slug) DO NOTHING;


-- ─── Component Catalogue (6 example parts) ──────────────────

INSERT INTO component_catalogue (name, manufacturer, part_number, geometry_type_slug, geometry_params, mounting_points, weight_g, material, sources, tags) VALUES
(
    'EMAX ECO II 2807 1300KV',
    'EMAX',
    'ECO2-2807-1300',
    'brushless_motor_outrunner',
    '{"od": 34.5, "height": 13.5, "shaft_d": 5.0, "shaft_h": 8.0, "bolt_pcd": 19.0, "bolt_count": 4, "bolt_size": 3.0}'::jsonb,
    '[{"name": "base_mount", "standard_slug": "bolt_circle_m3_19mm", "position": {"x": 0, "y": 0, "z": 0}, "normal": {"x": 0, "y": 0, "z": -1}}, {"name": "shaft", "standard_slug": "motor_shaft_5mm", "position": {"x": 0, "y": 0, "z": 21.5}, "normal": {"x": 0, "y": 0, "z": 1}}]'::jsonb,
    38.0,
    'Aluminium / Copper',
    '[{"supplier": "GetFPV", "url": "https://www.getfpv.com/emax-eco-ii-2807", "price": 15.99, "currency": "USD", "in_stock": true}]'::jsonb,
    ARRAY['drone', 'motor', '7inch', 'long_range']
),
(
    'NEMA 17 Stepper - 42BYGH40 (1.8 deg)',
    'Generic',
    '42BYGH40',
    'stepper_motor_nema',
    '{"nema_size": 17, "body_l": 40.0, "shaft_d": 5.0, "shaft_l": 24.0}'::jsonb,
    '[{"name": "faceplate", "standard_slug": "nema17_bolt_pattern", "position": {"x": 0, "y": 0, "z": 5}, "normal": {"x": 0, "y": 0, "z": 1}}, {"name": "shaft", "standard_slug": "motor_shaft_5mm", "position": {"x": 0, "y": 0, "z": 29}, "normal": {"x": 0, "y": 0, "z": 1}}]'::jsonb,
    280.0,
    'Steel / Aluminium',
    '[{"supplier": "Amazon", "url": "https://amazon.co.uk/dp/B07TGJSVRK", "price": 8.99, "currency": "GBP", "in_stock": true}]'::jsonb,
    ARRAY['3d_printer', 'cnc', 'stepper', 'nema17']
),
(
    'M3x10 Socket Head Cap Screw (50pk)',
    'Generic',
    'ISO4762-M3x10-A2',
    'socket_head_cap_screw',
    '{"thread_d": 3.0, "thread_l": 10.0}'::jsonb,
    '[]'::jsonb,
    1.2,
    'A2 Stainless Steel',
    '[{"supplier": "Bolt Base", "url": "https://boltbase.co.uk/m3x10-shcs", "price": 3.49, "currency": "GBP", "in_stock": true}]'::jsonb,
    ARRAY['fastener', 'm3', 'stainless']
),
(
    '608-2RS Ball Bearing',
    'SKF',
    '608-2RS1',
    'ball_bearing',
    '{"id": 8.0, "od": 22.0, "width": 7.0, "shielded": true}'::jsonb,
    '[{"name": "bore", "standard_slug": "608_bearing_bore", "position": {"x": 0, "y": 0, "z": 0}, "normal": {"x": 0, "y": 0, "z": -1}}]'::jsonb,
    12.0,
    'Chrome Steel',
    '[{"supplier": "RS Components", "url": "https://uk.rs-online.com/web/p/608-2rs1", "price": 2.85, "currency": "GBP", "in_stock": true}]'::jsonb,
    ARRAY['bearing', 'skateboard', '3d_printer', '608']
),
(
    'Noctua NF-A4x10 FLX (40mm Fan)',
    'Noctua',
    'NF-A4x10-FLX',
    'axial_fan',
    '{"size": 40.0, "depth": 10.0, "blade_count": 7, "hole_d": 3.2}'::jsonb,
    '[]'::jsonb,
    9.0,
    'PBT + Fiberglass',
    '[{"supplier": "Amazon", "url": "https://amazon.co.uk/dp/B009NQLT0M", "price": 13.49, "currency": "GBP", "in_stock": true}]'::jsonb,
    ARRAY['fan', 'cooling', '40mm', 'quiet']
),
(
    'SpeedyBee F405 V4 Flight Controller',
    'SpeedyBee',
    'F405-V4',
    'pcb_board',
    '{"width": 36.0, "height": 36.0, "thickness": 1.6, "corner_r": 2.0, "holes": [{"x": -15.25, "y": -15.25, "d": 2.2}, {"x": -15.25, "y": 15.25, "d": 2.2}, {"x": 15.25, "y": -15.25, "d": 2.2}, {"x": 15.25, "y": 15.25, "d": 2.2}], "components": [{"x": 0, "y": 0, "w": 7, "d": 7, "h": 1.5}, {"x": -8, "y": 8, "w": 4, "d": 4, "h": 1.2}, {"x": 10, "y": -5, "w": 5, "d": 3, "h": 2}]}'::jsonb,
    '[{"name": "stack_mount", "standard_slug": "pcb_mounting_m2_5", "position": {"x": 0, "y": 0, "z": 0}, "normal": {"x": 0, "y": 0, "z": -1}}]'::jsonb,
    8.5,
    'FR4 PCB',
    '[{"supplier": "GetFPV", "url": "https://www.getfpv.com/speedybee-f405-v4", "price": 32.99, "currency": "USD", "in_stock": true}]'::jsonb,
    ARRAY['fc', 'flight_controller', 'drone', '30x30']
);
