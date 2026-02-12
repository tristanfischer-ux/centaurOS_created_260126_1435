-- ============================================================
-- ForgeOS Component Geometry Library — Tier 3: UK Timber Frame Buildings
-- Migration: 20260212700000_seed_tier3_timber_frame
-- ============================================================
-- Seeds 32 domain-specific geometry types for UK platform timber frame
-- building components per TRADA / STA / BS EN 1995 (EC5).
-- Categories: structural_frame (7), floor (6), roof (5), sheathing (1),
--   membrane (2), insulation (2), envelope (4), connection (5)

-- ============================================================
-- STRUCTURAL FRAME — 7 components
-- ============================================================

-- 1. sole_plate
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'sole_plate',
    'Sole Plate (Treated, on DPC)',
    'domain',
    'structural_frame',
$CADQUERY$
def sole_plate(params):
    """Sole plate (bottom rail, treated C16/C24 on DPC)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    plate = cq.Workplane("XY").box(length, width, depth)
    dpc = (cq.Workplane("XY").workplane(offset=-1)
           .box(length + 20, width + 20, 1))
    bolt_count = max(int(length / 1200), 2)
    for i in range(bolt_count):
        bx = -(length/2 - 100) + i * (length - 200) / max(bolt_count - 1, 1)
        hole = (cq.Workplane("XY").workplane(offset=-2)
                .transformed(offset=(bx, 0, 0))
                .circle(8).extrude(depth + 4))
        plate = plate.cut(hole)
    return plate.union(dpc)
$CADQUERY$,
    '{"length": {"type": "number", "default": 2400.0, "unit": "mm"}, "width": {"type": "number", "default": 140.0, "unit": "mm", "enum": [89, 140, 184, 235]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Sole plate (bottom rail, treated C16/C24 on DPC).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 2. wall_stud
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'wall_stud',
    'Wall Stud (C16/C24)',
    'domain',
    'structural_frame',
$CADQUERY$
def wall_stud(params):
    """Wall stud (C16/C24 regularised)."""
    height = params.get("height", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    stud = (cq.Workplane("XY")
            .transformed(offset=(0, 0, height/2))
            .box(depth, width, height))
    return stud
$CADQUERY$,
    '{"height": {"type": "number", "default": 2400.0, "unit": "mm"}, "width": {"type": "number", "default": 140.0, "unit": "mm", "enum": [89, 140, 184, 235]}, "depth": {"type": "number", "default": 38.0, "unit": "mm", "enum": [38, 47]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#C4A882',
    'Wall stud (C16/C24 regularised).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 3. head_plate
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'head_plate',
    'Head Plate (Double)',
    'domain',
    'structural_frame',
$CADQUERY$
def head_plate(params):
    """Top / head plate (double, for load distribution)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    lower = cq.Workplane("XY").box(length, width, depth)
    upper = (cq.Workplane("XY").workplane(offset=depth)
             .box(length, width, depth))
    return lower.union(upper)
$CADQUERY$,
    '{"length": {"type": "number", "default": 2400.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Top / head plate (double, for load distribution).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 4. nogging
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'nogging',
    'Nogging / Dwang',
    'domain',
    'structural_frame',
$CADQUERY$
def nogging(params):
    """Nogging / horizontal dwang (bracing between studs)."""
    stud_centres = params.get("stud_centres", 600.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    nog_length = stud_centres - depth
    nog = cq.Workplane("XY").box(nog_length, width, depth)
    return nog
$CADQUERY$,
    '{"stud_centres": {"type": "number", "default": 600.0, "unit": "mm", "enum": [400, 600]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#C4A882',
    'Nogging / horizontal dwang (bracing between studs).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 5. corner_post
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'corner_post',
    'Corner Post Assembly',
    'domain',
    'structural_frame',
$CADQUERY$
def corner_post(params):
    """Corner post assembly (3-stud or L-shaped)."""
    height = params.get("height", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    main = (cq.Workplane("XY")
            .transformed(offset=(0, 0, height/2))
            .box(depth, width, height))
    ret = (cq.Workplane("XY")
           .transformed(offset=(depth/2 + width/2, depth/2 - width/2, height/2))
           .box(width, depth, height))
    pack = (cq.Workplane("XY")
            .transformed(offset=(depth/2 + depth/2, 0, height/2))
            .box(depth, width, height))
    return main.union(ret).union(pack)
$CADQUERY$,
    '{"height": {"type": "number", "default": 2400.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Corner post assembly (3-stud or L-shaped).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 6. timber_lintel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'timber_lintel',
    'Timber Lintel (Solid/Flitch)',
    'domain',
    'structural_frame',
$CADQUERY$
def timber_lintel(params):
    """Lintel (solid timber, paired C24, or flitch beam)."""
    span = params.get("span", 1200.0)
    depth = params.get("depth", 225.0)
    thickness = params.get("thickness", 90.0)
    bearing = params.get("bearing", 150.0)
    flitch = params.get("flitch", False)

    total_length = span + 2 * bearing
    left = (cq.Workplane("XY")
            .transformed(offset=(0, -(thickness/2 - 19), 0))
            .box(total_length, 38, depth))
    right = (cq.Workplane("XY")
             .transformed(offset=(0, (thickness/2 - 19), 0))
             .box(total_length, 38, depth))
    result = left.union(right)
    if flitch:
        steel = cq.Workplane("XY").box(total_length, 6, depth - 10)
        result = result.union(steel)
    else:
        spacer = cq.Workplane("XY").box(total_length, thickness - 76, depth)
        result = result.union(spacer)
    bolt_count = max(int(total_length / 400), 2)
    for i in range(bolt_count):
        bx = -(total_length/2 - 75) + i * (total_length - 150) / max(bolt_count - 1, 1)
        for bz in [-(depth/3), depth/3]:
            hole = (cq.Workplane("XY")
                    .transformed(offset=(bx, 0, bz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(7).extrude(thickness + 10).translate((0, -(thickness/2 + 5), 0)))
            result = result.cut(hole)
    return result
$CADQUERY$,
    '{"span": {"type": "number", "default": 1200.0, "unit": "mm"}, "flitch": {"type": "boolean", "default": false}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#A08060',
    'Lintel (solid timber, paired C24, or flitch beam).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 7. ring_beam
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ring_beam',
    'Ring Beam / Wall Plate',
    'domain',
    'structural_frame',
$CADQUERY$
def ring_beam(params):
    """Ring beam / wall plate (at roof level, for truss bearing)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 100.0)
    depth = params.get("depth", 50.0)

    beam = cq.Workplane("XY").box(length, width, depth)
    count = max(int(length / 1200), 2)
    for i in range(count):
        bx = -(length/2 - 100) + i * (length - 200) / max(count - 1, 1)
        hole = (cq.Workplane("XY").workplane(offset=-1)
                .transformed(offset=(bx, 0, 0))
                .circle(5).extrude(depth + 2))
        beam = beam.cut(hole)
    return beam
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Ring beam / wall plate (at roof level, for truss bearing).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- FLOOR SYSTEM — 6 components
-- ============================================================

-- 8. floor_joist_solid
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'floor_joist_solid',
    'Solid Timber Floor Joist',
    'domain',
    'floor',
$CADQUERY$
def floor_joist_solid(params):
    """Solid timber floor joist (C16/C24)."""
    length = params.get("length", 4000.0)
    depth = params.get("depth", 220.0)
    width = params.get("width", 47.0)

    joist = (cq.Workplane("XY")
             .transformed(offset=(0, 0, depth/2))
             .box(length, width, depth))
    return joist
$CADQUERY$,
    '{"length": {"type": "number", "default": 4000.0, "unit": "mm"}, "depth": {"type": "number", "default": 220.0, "unit": "mm", "enum": [145, 170, 195, 220, 245]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#C4A882',
    'Solid timber floor joist (C16/C24).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 9. engineered_i_joist
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'engineered_i_joist',
    'Engineered I-Joist (TJI)',
    'domain',
    'floor',
$CADQUERY$
def engineered_i_joist(params):
    """Engineered I-joist (TJI / JJI style)."""
    length = params.get("length", 4800.0)
    depth = params.get("depth", 300.0)
    flange_w = params.get("flange_width", 47.0)
    flange_h = params.get("flange_height", 38.0)
    web_t = params.get("web_thickness", 9.0)

    tf = (cq.Workplane("XY")
          .transformed(offset=(0, 0, depth - flange_h/2))
          .box(length, flange_w, flange_h))
    bf = (cq.Workplane("XY")
          .transformed(offset=(0, 0, flange_h/2))
          .box(length, flange_w, flange_h))
    web = (cq.Workplane("XY")
           .transformed(offset=(0, 0, depth/2))
           .box(length, web_t, depth - 2*flange_h))
    return tf.union(bf).union(web)
$CADQUERY$,
    '{"length": {"type": "number", "default": 4800.0, "unit": "mm"}, "depth": {"type": "number", "default": 300.0, "unit": "mm", "enum": [200, 240, 300, 360, 400]}}'::jsonb,
    '[]'::jsonb,
    '{timber,OSB,engineered}',
    '#A08060',
    'Engineered I-joist (TJI / JJI style).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 10. metal_web_joist
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'metal_web_joist',
    'Metal Web Joist (Posi-Joist)',
    'domain',
    'floor',
$CADQUERY$
def metal_web_joist(params):
    """Metal web joist (Posi-Joist / easi-joist style)."""
    length = params.get("length", 5000.0)
    depth = params.get("depth", 254.0)
    chord_w = params.get("chord_width", 47.0)
    chord_h = params.get("chord_height", 35.0)

    tc = (cq.Workplane("XY")
          .transformed(offset=(0, 0, depth - chord_h/2))
          .box(length, chord_w, chord_h))
    bc = (cq.Workplane("XY")
          .transformed(offset=(0, 0, chord_h/2))
          .box(length, chord_w, chord_h))
    web_count = min(int(length / 300), 15)
    for i in range(web_count):
        wx = -(length/2 - 200) + i * (length - 400) / max(web_count - 1, 1)
        for angle in [30, -30]:
            bar = (cq.Workplane("XY")
                   .transformed(offset=(wx, 0, depth/2))
                   .transformed(rotate=(0, angle, 0))
                   .box(depth * 0.7, 1.5, 30))
            tc = tc.union(bar)
    return tc.union(bc)
$CADQUERY$,
    '{"length": {"type": "number", "default": 5000.0, "unit": "mm"}, "depth": {"type": "number", "default": 254.0, "unit": "mm", "enum": [195, 219, 254, 302, 356]}}'::jsonb,
    '[]'::jsonb,
    '{timber,steel,engineered}',
    '#C0C0C0',
    'Metal web joist (Posi-Joist / easi-joist style).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 11. rim_board
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'rim_board',
    'Rim Board / Band Board',
    'domain',
    'floor',
$CADQUERY$
def rim_board(params):
    """Rim board / band board (closes floor joist ends)."""
    length = params.get("length", 2400.0)
    depth = params.get("depth", 220.0)
    thickness = params.get("thickness", 38.0)

    board = (cq.Workplane("XY")
             .transformed(offset=(0, 0, depth/2))
             .box(length, thickness, depth))
    return board
$CADQUERY$,
    '{"depth": {"type": "number", "default": 220.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Rim board / band board (closes floor joist ends).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 12. herringbone_strut
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'herringbone_strut',
    'Herringbone Strutting',
    'domain',
    'floor',
$CADQUERY$
def herringbone_strut(params):
    """Herringbone strutting (solid timber or proprietary metal)."""
    joist_depth = params.get("joist_depth", 220.0)
    joist_centres = params.get("joist_centres", 400.0)
    metal = params.get("metal", True)

    gap = joist_centres - 47
    if metal:
        bar_t = 1.0
        bar_w = 20.0
        diag = math.sqrt(gap**2 + joist_depth**2)
        angle = math.degrees(math.atan2(joist_depth, gap))
        bar1 = (cq.Workplane("XY")
                .transformed(rotate=(0, angle, 0))
                .box(diag, bar_w, bar_t))
        bar2 = (cq.Workplane("XY")
                .transformed(rotate=(0, -angle, 0))
                .box(diag, bar_w, bar_t))
        return bar1.union(bar2)
    else:
        diag = math.sqrt(gap**2 + (joist_depth - 20)**2)
        angle = math.degrees(math.atan2(joist_depth - 20, gap))
        bar1 = (cq.Workplane("XY")
                .transformed(rotate=(0, angle, 0))
                .box(diag, 38, 38))
        bar2 = (cq.Workplane("XY")
                .transformed(rotate=(0, -angle, 0))
                .box(diag, 38, 38))
        return bar1.union(bar2)
$CADQUERY$,
    '{"joist_depth": {"type": "number", "default": 220.0, "unit": "mm"}, "metal": {"type": "boolean", "default": true}}'::jsonb,
    '[]'::jsonb,
    '{steel,bracing}',
    '#C0C0C0',
    'Herringbone strutting (solid timber or proprietary metal).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 13. joist_hanger
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'joist_hanger',
    'Joist Hanger (Galvanised)',
    'domain',
    'floor',
$CADQUERY$
def joist_hanger(params):
    """Joist hanger (galvanised steel, face-fix or masonry)."""
    joist_w = params.get("joist_width", 47.0)
    joist_d = params.get("joist_depth", 220.0)
    steel_t = params.get("steel_thickness", 2.5)

    back = cq.Workplane("XY").box(joist_w + 60, steel_t, joist_d + 30)
    bottom = (cq.Workplane("XY")
              .transformed(offset=(0, -(joist_w/2 + steel_t/2), -(joist_d/2 + steel_t/2 - 15)))
              .box(joist_w + 10, joist_w + steel_t, steel_t))
    for side in [-1, 1]:
        flange = (cq.Workplane("XY")
                  .transformed(offset=(side * (joist_w/2 + steel_t/2), -(joist_w/2 + steel_t/2), 0))
                  .box(steel_t, joist_w + steel_t, joist_d))
        back = back.union(flange)
    for bx in [-(joist_w/2 + 20), joist_w/2 + 20]:
        for bz in [-(joist_d/4), 0, joist_d/4]:
            hole = (cq.Workplane("XY")
                    .transformed(offset=(bx, 0, bz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(2.5).extrude(steel_t + 4).translate((0, -(steel_t/2 + 2), 0)))
            back = back.cut(hole)
    return back.union(bottom)
$CADQUERY$,
    '{"joist_width": {"type": "number", "default": 47.0, "unit": "mm", "enum": [38, 47, 50, 63, 75]}, "joist_depth": {"type": "number", "default": 220.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#C0C0C0',
    'Joist hanger (galvanised steel, face-fix or masonry).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- ROOF STRUCTURE — 5 components
-- ============================================================

-- 14. trussed_rafter
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'trussed_rafter',
    'Trussed Rafter (Fink/W)',
    'domain',
    'roof',
$CADQUERY$
def trussed_rafter(params):
    """Trussed rafter (Fink/W pattern, factory fabricated)."""
    span = params.get("span", 7200.0)
    pitch_deg = params.get("pitch_degrees", 22.5)
    chord_w = params.get("chord_width", 35.0)
    chord_h = params.get("chord_height", 72.0)

    rise = (span/2) * math.tan(math.radians(pitch_deg))
    rafter_len = (span/2) / math.cos(math.radians(pitch_deg))

    bc = cq.Workplane("XY").box(span, chord_w, chord_h)
    lr = (cq.Workplane("XY")
          .transformed(offset=(-(span/4), 0, rise/2))
          .transformed(rotate=(0, -pitch_deg, 0))
          .box(rafter_len, chord_w, chord_h))
    rr = (cq.Workplane("XY")
          .transformed(offset=(span/4, 0, rise/2))
          .transformed(rotate=(0, pitch_deg, 0))
          .box(rafter_len, chord_w, chord_h))
    web_points = [
        (-(span/4), 0, span/4, rise/2),
        (span/4, 0, -(span/4), rise/2),
        (-(span/4), 0, 0, rise),
        (span/4, 0, 0, rise),
    ]
    for x1, z1, x2, z2 in web_points:
        dx = x2 - x1
        dz = z2 - z1
        wl = math.sqrt(dx**2 + dz**2)
        wa = math.degrees(math.atan2(dz, dx))
        web = (cq.Workplane("XY")
               .transformed(offset=((x1+x2)/2, 0, (z1+z2)/2))
               .transformed(rotate=(0, -wa, 0))
               .box(wl, chord_w, chord_h * 0.6))
        bc = bc.union(web)
    return bc.union(lr).union(rr)
$CADQUERY$,
    '{"span": {"type": "number", "default": 7200.0, "unit": "mm"}, "pitch_degrees": {"type": "number", "default": 22.5, "enum": [15, 17.5, 22.5, 30, 35, 40, 45]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural,roof}',
    '#C4A882',
    'Trussed rafter (Fink/W pattern, factory fabricated).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 15. cut_rafter
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cut_rafter',
    'Cut Roof Rafter (C24)',
    'domain',
    'roof',
$CADQUERY$
def cut_rafter(params):
    """Cut roof rafter (site-cut C24)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 47.0)
    depth = params.get("depth", 150.0)

    rafter = cq.Workplane("XY").box(length, width, depth)
    seat_cut = params.get("birdsmouth_seat", 50.0)
    plumb_cut = params.get("birdsmouth_plumb", 38.0)
    notch = (cq.Workplane("XY")
             .transformed(offset=(-(length/2 - plumb_cut/2), 0, -(depth/2 - seat_cut/2)))
             .box(plumb_cut, width + 2, seat_cut))
    return rafter.cut(notch)
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}, "depth": {"type": "number", "default": 150.0, "unit": "mm", "enum": [100, 125, 150, 175, 200]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#C4A882',
    'Cut roof rafter (site-cut C24).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 16. ridge_board
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ridge_board',
    'Ridge Board',
    'domain',
    'roof',
$CADQUERY$
def ridge_board(params):
    """Ridge board (C16/C24 or engineered)."""
    length = params.get("length", 6000.0)
    depth = params.get("depth", 200.0)
    thickness = params.get("thickness", 32.0)

    board = cq.Workplane("XY").box(length, thickness, depth)
    return board
$CADQUERY$,
    '{"depth": {"type": "number", "default": 200.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Ridge board (C16/C24 or engineered).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 17. ceiling_joist
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ceiling_joist',
    'Ceiling Joist / Binder',
    'domain',
    'roof',
$CADQUERY$
def ceiling_joist(params):
    """Ceiling joist / binder (C16)."""
    length = params.get("length", 4000.0)
    depth = params.get("depth", 100.0)
    width = params.get("width", 47.0)

    joist = cq.Workplane("XY").box(length, width, depth)
    return joist
$CADQUERY$,
    '{"depth": {"type": "number", "default": 100.0, "unit": "mm", "enum": [50, 75, 100, 125]}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#C4A882',
    'Ceiling joist / binder (C16).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 18. gable_ladder
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'gable_ladder',
    'Gable Ladder Frame',
    'domain',
    'roof',
$CADQUERY$
def gable_ladder(params):
    """Gable ladder frame (verge overhang support)."""
    overhang = params.get("overhang", 450.0)
    height = params.get("height", 2000.0)
    rung_spacing = params.get("rung_spacing", 600.0)

    result = None
    for ox in [-overhang/2 + 19, overhang/2 - 19]:
        outrigger = (cq.Workplane("XY")
                     .transformed(offset=(ox, 0, height/2))
                     .box(38, 38, height))
        result = outrigger if result is None else result.union(outrigger)
    rung_count = int(height / rung_spacing)
    for i in range(rung_count + 1):
        rz = i * rung_spacing
        rung = (cq.Workplane("XY")
                .transformed(offset=(0, 0, rz))
                .box(overhang - 76, 38, 38))
        result = result.union(rung)
    return result
$CADQUERY$,
    '{"overhang": {"type": "number", "default": 450.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,structural}',
    '#8B7355',
    'Gable ladder frame (verge overhang support).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- SHEATHING & MEMBRANES — 3 components
-- ============================================================

-- 19. osb_sheathing
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'osb_sheathing',
    'OSB/3 Sheathing Board',
    'domain',
    'sheathing',
$CADQUERY$
def osb_sheathing(params):
    """OSB/3 structural sheathing board."""
    width = params.get("width", 1200.0)
    height = params.get("height", 2400.0)
    thickness = params.get("thickness", 9.0)

    board = cq.Workplane("XY").box(width, thickness, height)
    return board
$CADQUERY$,
    '{"thickness": {"type": "number", "default": 9.0, "unit": "mm", "enum": [9, 11, 15, 18]}}'::jsonb,
    '[]'::jsonb,
    '{OSB,board}',
    '#B8A070',
    'OSB/3 structural sheathing board.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 20. breather_membrane
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'breather_membrane',
    'Breather Membrane',
    'domain',
    'membrane',
$CADQUERY$
def breather_membrane(params):
    """Breather membrane (vapour-open, external face)."""
    width = params.get("width", 1500.0)
    length = params.get("length", 3000.0)
    t = 0.5

    sheet = (cq.Workplane("XY")
             .transformed(offset=(0, 0, length/2))
             .box(width, t, length))
    tape = (cq.Workplane("XY")
            .transformed(offset=(0, -1, length - 50))
            .box(width, 1, 100))
    return sheet.union(tape)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{membrane,vapour_open}',
    '#404040',
    'Breather membrane (vapour-open, external face).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 21. vcl_membrane
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'vcl_membrane',
    'Vapour Control Layer',
    'domain',
    'membrane',
$CADQUERY$
def vcl_membrane(params):
    """Vapour control layer (warm side, polythene or intelligent)."""
    width = params.get("width", 2700.0)
    height = params.get("height", 2400.0)
    t = 0.25

    sheet = (cq.Workplane("XY")
             .transformed(offset=(0, 0, height/2))
             .box(width, t, height))
    return sheet
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{membrane,vapour_barrier}',
    '#4040FF',
    'Vapour control layer (warm side, polythene or intelligent).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- INSULATION — 2 components
-- ============================================================

-- 22. mineral_wool_batt
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'mineral_wool_batt',
    'Mineral Wool Batt Insulation',
    'domain',
    'insulation',
$CADQUERY$
def mineral_wool_batt(params):
    """Mineral wool batt insulation (between studs)."""
    width = params.get("width", 570.0)
    height = params.get("height", 1200.0)
    thickness = params.get("thickness", 140.0)

    batt = cq.Workplane("XY").box(width, thickness, height)
    return batt
$CADQUERY$,
    '{"thickness": {"type": "number", "default": 140.0, "unit": "mm", "enum": [50, 75, 100, 140, 150, 200]}}'::jsonb,
    '[]'::jsonb,
    '{insulation,mineral_wool}',
    '#FFD700',
    'Mineral wool batt insulation (between studs).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 23. pir_insulation_board
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'pir_insulation_board',
    'PIR Rigid Insulation Board',
    'domain',
    'insulation',
$CADQUERY$
def pir_insulation_board(params):
    """PIR rigid insulation board (Celotex/Kingspan style)."""
    width = params.get("width", 1200.0)
    length = params.get("length", 2400.0)
    thickness = params.get("thickness", 50.0)

    board = cq.Workplane("XY").box(width, thickness, length)
    tongue = (cq.Workplane("XY")
              .transformed(offset=(width/2 + 5, 0, 0))
              .box(10, thickness * 0.5, length))
    return board.union(tongue)
$CADQUERY$,
    '{"thickness": {"type": "number", "default": 50.0, "unit": "mm", "enum": [25, 30, 40, 50, 60, 75, 100, 120]}}'::jsonb,
    '[]'::jsonb,
    '{insulation,PIR}',
    '#FFE4B5',
    'PIR rigid insulation board (Celotex/Kingspan style).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- EXTERNAL ENVELOPE — 4 components
-- ============================================================

-- 24. timber_cladding_board
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'timber_cladding_board',
    'Timber Cladding Board',
    'domain',
    'envelope',
$CADQUERY$
def timber_cladding_board(params):
    """Timber cladding board (larch, cedar, or treated softwood)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 150.0)
    thickness = params.get("thickness", 19.0)
    profile = params.get("profile", "shiplap")

    board = cq.Workplane("XY").box(length, thickness, width)
    if profile == "shiplap":
        rebate = (cq.Workplane("XY")
                  .transformed(offset=(0, -(thickness/2 - 4), width/2 - 8))
                  .box(length + 2, 8, 16))
        board = board.cut(rebate)
    elif profile == "TGV":
        tongue = (cq.Workplane("XY")
                  .transformed(offset=(0, 0, width/2 + 4))
                  .box(length, thickness * 0.4, 8))
        board = board.union(tongue)
    return board
$CADQUERY$,
    '{"profile": {"type": "string", "default": "shiplap", "enum": ["shiplap", "TGV", "featheredge"]}}'::jsonb,
    '[]'::jsonb,
    '{timber,cladding}',
    '#8B6914',
    'Timber cladding board (larch, cedar, or treated softwood).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 25. render_carrier_board
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'render_carrier_board',
    'Render Carrier Board',
    'domain',
    'envelope',
$CADQUERY$
def render_carrier_board(params):
    """Render carrier board (cement particle board or similar)."""
    width = params.get("width", 1200.0)
    height = params.get("height", 2400.0)
    thickness = params.get("thickness", 12.0)

    board = cq.Workplane("XY").box(width, thickness, height)
    return board
$CADQUERY$,
    '{"thickness": {"type": "number", "default": 12.0, "unit": "mm", "enum": [9, 12, 15]}}'::jsonb,
    '[]'::jsonb,
    '{cement_board,render}',
    '#A0A0A0',
    'Render carrier board (cement particle board or similar).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 26. cavity_closer
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cavity_closer',
    'Cavity Closer',
    'domain',
    'envelope',
$CADQUERY$
def cavity_closer(params):
    """Cavity closer (insulated PVC or foam)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 50.0)
    depth = params.get("depth", 100.0)

    body = (cq.Workplane("XY")
            .transformed(offset=(0, 0, length/2))
            .box(depth, width, length))
    return body
$CADQUERY$,
    '{"width": {"type": "number", "default": 50.0, "unit": "mm", "enum": [25, 50, 65, 75, 100]}}'::jsonb,
    '[]'::jsonb,
    '{PVC,insulation}',
    '#808080',
    'Cavity closer (insulated PVC or foam).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 27. wall_tie
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'wall_tie',
    'Wall Tie (Timber Frame)',
    'domain',
    'envelope',
$CADQUERY$
def wall_tie(params):
    """Wall tie (connects outer masonry leaf to timber frame)."""
    length = params.get("length", 225.0)
    tie_type = params.get("tie_type", "helical")

    if tie_type == "helical":
        shaft = (cq.Workplane("XY")
                 .circle(2.5).extrude(length))
        drip = (cq.Workplane("XY").workplane(offset=length * 0.4)
                .transformed(offset=(0, -4, 0))
                .box(2, 8, 5))
        clip = (cq.Workplane("XY").workplane(offset=length - 10)
                .box(20, 10, 5))
        return shaft.union(drip).union(clip)
    else:
        wire_d = 4.0
        shaft = cq.Workplane("XY").circle(wire_d/2).extrude(length)
        twist = (cq.Workplane("XY").workplane(offset=length/2)
                 .box(30, 30, wire_d))
        return shaft.union(twist)
$CADQUERY$,
    '{"tie_type": {"type": "string", "default": "helical", "enum": ["helical", "butterfly"]}}'::jsonb,
    '[]'::jsonb,
    '{stainless_steel,fixing}',
    '#C0C0C0',
    'Wall tie (connects outer masonry leaf to timber frame).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- CONNECTIONS & FIXINGS — 5 components
-- ============================================================

-- 28. framing_anchor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'framing_anchor',
    'Framing Anchor / Angle Bracket',
    'domain',
    'connection',
$CADQUERY$
def framing_anchor(params):
    """Framing anchor / angle bracket (galvanised steel)."""
    height = params.get("height", 60.0)
    width = params.get("width", 40.0)
    t = params.get("thickness", 2.5)

    vert = cq.Workplane("XY").box(width, t, height)
    horiz = (cq.Workplane("XY")
             .transformed(offset=(0, -(height/2 - t/2), -(height/2 - t/2)))
             .box(width, height, t))
    bracket = vert.union(horiz)
    for bz in [-height/4, height/4]:
        hole = (cq.Workplane("XY")
                .transformed(offset=(0, 0, bz))
                .transformed(rotate=(90, 0, 0))
                .circle(2).extrude(t + 4).translate((0, -(t/2 + 2), 0)))
        bracket = bracket.cut(hole)
    for by in [-height/4, 0, height/4]:
        hole = (cq.Workplane("XY")
                .transformed(offset=(0, by - height/2 + t/2, -(height/2 - t/2)))
                .circle(2).extrude(t + 4).translate((0, 0, -(t/2 + 2))))
        bracket = bracket.cut(hole)
    return bracket
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#C0C0C0',
    'Framing anchor / angle bracket (galvanised steel).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 29. holddown_strap
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'holddown_strap',
    'Holddown / Restraint Strap',
    'domain',
    'connection',
$CADQUERY$
def holddown_strap(params):
    """Holddown / lateral restraint strap (galvanised steel)."""
    length = params.get("length", 1200.0)
    width = params.get("width", 30.0)
    t = params.get("thickness", 2.5)
    bend = params.get("bend", True)

    strap = cq.Workplane("XY").box(width, t, length)
    if bend:
        foot = (cq.Workplane("XY")
                .transformed(offset=(0, -(length * 0.1), -(length/2 - t/2)))
                .box(width, length * 0.2, t))
        strap = strap.union(foot)
    hole_count = int(length / 100)
    for i in range(hole_count):
        hz = -(length/2 - 50) + i * 100
        hole = (cq.Workplane("XY")
                .transformed(offset=(0, 0, hz))
                .transformed(rotate=(90, 0, 0))
                .circle(2.5).extrude(t + 4).translate((0, -(t/2 + 2), 0)))
        strap = strap.cut(hole)
    return strap
$CADQUERY$,
    '{"length": {"type": "number", "default": 1200.0, "unit": "mm", "enum": [600, 800, 1000, 1200]}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#C0C0C0',
    'Holddown / lateral restraint strap (galvanised steel).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 30. nail_plate
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'nail_plate',
    'Nail Plate / Truss Plate',
    'domain',
    'connection',
$CADQUERY$
def nail_plate(params):
    """Nail plate / truss plate (gang nail, for truss joints)."""
    width = params.get("width", 100.0)
    height = params.get("height", 150.0)
    t = params.get("thickness", 1.0)

    plate = cq.Workplane("XY").box(width, t, height)
    tooth_rows = int(height / 12)
    tooth_cols = int(width / 12)
    for r in range(min(tooth_rows, 10)):
        for c in range(min(tooth_cols, 8)):
            tx = -(width/2 - 8) + c * 12
            tz = -(height/2 - 8) + r * 15
            tooth = (cq.Workplane("XY")
                     .transformed(offset=(tx, -(t/2 + 3), tz))
                     .box(3, 6, 3))
            plate = plate.union(tooth)
    return plate
$CADQUERY$,
    '{"width": {"type": "number", "default": 100.0, "unit": "mm"}, "height": {"type": "number", "default": 150.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#C0C0C0',
    'Nail plate / truss plate (gang nail, for truss joints).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 31. timber_connector
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'timber_connector',
    'Timber Connector (Shear Plate)',
    'domain',
    'connection',
$CADQUERY$
def timber_connector(params):
    """Timber connector (shear plate or split ring)."""
    diameter = params.get("diameter", 64.0)
    t = params.get("thickness", 4.0)
    conn_type = params.get("type", "shear_plate")

    if conn_type == "shear_plate":
        plate = cq.Workplane("XY").circle(diameter/2).extrude(t)
        hole = cq.Workplane("XY").circle(10).extrude(t + 2)
        plate = plate.cut(hole)
        rim = cq.Workplane("XY").circle(diameter/2).circle(diameter/2 - 3).extrude(t + 2)
        return plate.union(rim)
    else:
        ring = cq.Workplane("XY").circle(diameter/2).circle(diameter/2 - 5).extrude(t)
        split = (cq.Workplane("XY")
                 .transformed(offset=(0, diameter/2 - 5, 0))
                 .box(3, 10, t + 2))
        return ring.cut(split)
$CADQUERY$,
    '{"diameter": {"type": "number", "default": 64.0, "unit": "mm", "enum": [50, 64, 75, 100]}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Timber connector (shear plate or split ring).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 32. service_batten
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'service_batten',
    'Service Batten / Counter-Batten',
    'domain',
    'services',
$CADQUERY$
def service_batten(params):
    """Service batten / counter-batten (creates service void)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 50.0)
    depth = params.get("depth", 25.0)

    batten = cq.Workplane("XY").box(length, depth, width)
    return batten
$CADQUERY$,
    '{"depth": {"type": "number", "default": 25.0, "unit": "mm", "enum": [25, 38, 50]}}'::jsonb,
    '[]'::jsonb,
    '{timber}',
    '#C4A882',
    'Service batten / counter-batten (creates service void).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- PHYSICAL PROPERTIES & PROCUREMENT — 32 updates
-- ============================================================

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_treated_regularised_softwood","density_kg_m3":{"C16":370,"C24":420},"mass_per_m_kg":{"38x140":2.0,"38x89":1.3}},"electrical":null,"thermal":{"lambda_w_mk":0.13},"mechanical":{"grade":"C16_or_C24_BS_EN_338","treatment":"UC2_or_UC3_preservative_BS_8417","DPC":"min_150mm_above_external_ground_level"},"interface":{"fix_to_foundation":"M12_holding_down_bolts_at_max_2400mm_centres","DPC":"polythene_sheet_under_plate","stud_fix":"skew_nailed_or_framing_nail"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":3.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins","BSW Timber"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'sole_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_regularised_kiln_dried","density_kg_m3":{"C16":370,"C24":420},"mass_per_m_kg":{"38x89":1.3,"38x140":2.0,"47x140":2.5,"38x184":2.6,"38x235":3.3}},"electrical":null,"thermal":{"lambda_w_mk":0.13,"U_value_contribution":"thermal_bridge_per_BS_EN_ISO_10211"},"mechanical":{"grade":"C16_or_C24_BS_EN_338","bending_strength_mpa":{"C16":16,"C24":24},"compression_parallel_mpa":{"C16":17,"C24":21},"E_mean_gpa":{"C16":8.0,"C24":11.0},"centres_mm":[400,600],"max_stud_height_m":{"38x89":2.4,"38x140":3.0,"47x140":3.6}},"interface":{"fix_to_plates":"2x_90mm_nails_skew_or_framing_nailer","notch_bore":"max_0.25D_notch_0.25D_hole"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":2.50,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins","BSW","James Jones"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'wall_stud';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_regularised","density_kg_m3":{"C16":370,"C24":420},"mass_per_m_kg_double":{"2x38x140":4.0}},"electrical":null,"thermal":{"lambda_w_mk":0.13},"mechanical":{"double_plate":"required_for_platform_frame_load_distribution","joint_offset":"min_600mm_stagger_between_upper_and_lower_plates"},"interface":{"stud_fix":"nailed_through_from_above","upper_to_lower":"nailed_at_300mm_centres"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":5.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'head_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_offcuts_or_regularised","density_kg_m3":370,"typical_mass_kg":0.4},"electrical":null,"thermal":{},"mechanical":{"function":["bracing","plasterboard_edge_support","stiffening"],"rows":"1_at_mid_height_minimum_2_for_tall_walls"},"interface":{"fix":"skew_nailed_or_staggered_for_end_nailing"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":0.50,"lead_time_days":3,"common_suppliers":["Same_as_studs"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'nogging';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_3_stud_assembly","density_kg_m3":370,"typical_mass_kg_per_m":6.0},"electrical":null,"thermal":{"thermal_bridge":"consider_additional_insulation_return"},"mechanical":{"assembly":"3_stud_or_2_stud_plus_packing","function":"intersecting_wall_connection"},"interface":{"nailed_assembly":"75mm_nails_at_300_staggered"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":7.50,"lead_time_days":3,"common_suppliers":["Same_as_studs"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'corner_post';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C24_or_glulam_GL24h","density_kg_m3":{"C24_solid":420,"glulam_GL24h":385},"typical_mass_kg_per_m":{"2x38x225":6.5,"flitch_90x225":12}},"electrical":null,"thermal":{"lambda_w_mk":{"timber":0.13,"steel_flitch":50}},"mechanical":{"span_table":"TRADA_span_tables_or_engineer_design","max_span_mm":{"2x38x225_C24":2100,"flitch_90x225":3000,"glulam_135x270":4500},"bearing_mm":150,"padstone":"not_normally_required_for_timber_frame"},"interface":{"fix":"M12_bolts_at_max_600mm_centres_staggered","cripple_studs":"above_and_below"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":{"solid":8,"flitch":25,"glulam":40},"lead_time_days":7,"common_suppliers":["James Jones","Boise Cascade","Metsä Wood"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'timber_lintel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_or_C24","density_kg_m3":370,"mass_per_m_kg":{"100x50":1.8}},"electrical":null,"thermal":{},"mechanical":{"function":"roof_truss_bearing_and_lateral_restraint","strap":"galvanised_steel_strap_from_ring_beam_to_wall_frame"},"interface":{"fix_to_head_plate":"nailed_or_bolted","truss_fix":"truss_clip_or_skew_nailed"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":2.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'ring_beam';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_regularised","density_kg_m3":{"C16":370,"C24":420},"mass_per_m_kg":{"47x145":2.6,"47x170":3.0,"47x195":3.4,"47x220":3.9,"47x245":4.3}},"electrical":null,"thermal":{"lambda_w_mk":0.13},"mechanical":{"span_m":{"47x145_C24_400cc":2.8,"47x170_C24_400cc":3.4,"47x195_C24_400cc":3.9,"47x220_C24_400cc":4.4,"47x245_C24_400cc":4.9},"centres_mm":[400,450,600],"notch_max":"0.125D_at_supports_only","hole_max":"0.25D_in_neutral_zone"},"interface":{"support":"joist_hanger_or_bearing_on_head_plate","strutting":"at_mid_span_if_over_2.5m"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":3.50,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins","BSW"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'floor_joist_solid';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"LVL_flanges_OSB_web","density_kg_m3":null,"mass_per_m_kg":{"200mm":2.5,"240mm":3.0,"300mm":3.8,"360mm":4.3,"400mm":4.8}},"electrical":null,"thermal":{"lambda_w_mk":0.13},"mechanical":{"span_m":{"200_400cc":3.5,"240_400cc":4.5,"300_400cc":5.5,"360_400cc":6.5,"400_400cc":7.5},"web_stiffener":"required_at_supports_and_concentrated_loads","no_notching":"never_notch_or_bore_flanges","hole_in_web":"manufacturer_approved_sizes_and_locations_only"},"interface":{"hanger":"proprietary_I_joist_hanger","blocking":"full_depth_blocking_at_supports"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":{"240mm":5,"300mm":7,"400mm":9},"lead_time_days":7,"common_suppliers":["James Jones JJI","Metsä Wood Finnjoist","Boise Cascade"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'engineered_i_joist';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_timber_chords_galvanised_steel_V_webs","mass_per_m_kg":{"195mm":2.2,"254mm":2.8,"302mm":3.2,"356mm":3.8}},"electrical":null,"thermal":{"lambda_w_mk":"low_thermal_bridging_open_web"},"mechanical":{"span_m":{"195_400cc":4.0,"254_400cc":5.5,"302_400cc":6.5,"356_400cc":7.5},"services":"services_pass_through_open_webs_no_drilling","hole_in_chord":"never"},"interface":{"hanger":"standard_joist_hanger","restraint":"blocking_and_herringbone"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":{"254mm":8,"302mm":10,"356mm":13},"lead_time_days":14,"common_suppliers":["MiTek Posi-Joist","Wolf Systems","ITW Alpine"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'metal_web_joist';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_or_LVL","density_kg_m3":420,"mass_per_m_kg":{"38x220":3.5}},"electrical":null,"thermal":{},"mechanical":{"function":"closes_floor_cavity_at_external_wall_line","fire":"maintains_floor_fire_compartment"},"interface":{"fix":"nailed_to_joist_ends_and_sole_plate"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":3.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'rim_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":{"metal":"galvanised_steel_1mm","timber":"38x38_C16"},"typical_mass_g":{"metal_pair":200,"timber_pair":400}},"electrical":null,"thermal":{},"mechanical":{"function":"prevents_joist_rotation_distributes_load","spacing":"at_mid_span_if_span_over_2.5m_and_at_third_points_if_over_4.5m"},"interface":{"fix":{"metal":"nail_each_end_to_joist","timber":"skew_nail_to_joist"}}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":{"metal":0.80,"timber":0.40},"lead_time_days":3,"common_suppliers":["Simpson Strong-Tie","Expamet"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'herringbone_strut';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_2_2.5mm_Z275","density_kg_m3":7850,"typical_mass_g":{"standard_47x220":250,"heavy_75x220":400}},"electrical":null,"thermal":{},"mechanical":{"safe_load_kn":{"standard_47x220":6.5,"heavy_75x220":12.0},"nail_type":"3.75x30mm_galv_connector_nails","nails_required":{"back_plate":6,"flanges":4},"standard":"BS_EN_14545_or_ETA"},"interface":{"types":["face_fix","masonry","concealed","adjustable"]}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":2.50,"lead_time_days":3,"common_suppliers":["Simpson Strong-Tie","BPC","Expamet","ITW Alpine"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'joist_hanger';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_C24_with_galvanised_nail_plates","density_kg_m3":370,"typical_mass_kg":{"7.2m_fink_22.5deg":35,"9m_fink_30deg":55}},"electrical":null,"thermal":{"loft_insulation_above_ceiling_tie":"400mm_mineral_wool_0.11_U_value"},"mechanical":{"span_m":[4.8,6,7.2,8.4,9.6,10.8,12],"pitch_deg":[15,17.5,22.5,30,35,40,45],"centres_mm":[600],"design":"BS_EN_14250_or_manufacturer_design","bracing":"longitudinal_diagonal_and_chevron_per_BS_5268_3"},"interface":{"bearing":"min_75mm_on_wall_plate","fix":"truss_clip_or_skew_nail","bracing":"25x100_diagonal_bracing_at_45deg"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":{"7.2m":60,"9.0m":90,"12m":140},"lead_time_days":14,"common_suppliers":["MiTek","Wolf Systems","Donaldson Timber","Scotts of Thrapston"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'trussed_rafter';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C24_regularised","density_kg_m3":420,"mass_per_m_kg":{"47x100":2.0,"47x125":2.5,"47x150":3.0,"47x175":3.5,"47x200":4.0}},"electrical":null,"thermal":{},"mechanical":{"birdsmouth":"max_one_third_rafter_depth","bearing_on_wall_plate":"min_38mm_seat_cut","span_tables":"BS_EN_1995_or_TRADA"},"interface":{"ridge_fix":"nailed_to_ridge_board","wall_plate":"birdsmouth_and_skew_nail"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":3.50,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cut_rafter';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_or_C24","density_kg_m3":370,"mass_per_m_kg":{"32x200":2.4}},"electrical":null,"thermal":{},"mechanical":{"depth":"min_equal_to_rafter_plumb_cut_depth","function":"alignment_not_structural_in_traditional_couple_close"},"interface":{"rafter_fix":"nailed_through_ridge"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":3.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'ridge_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16","density_kg_m3":370,"mass_per_m_kg":{"47x100":1.7,"47x125":2.2,"47x50":0.9}},"electrical":null,"thermal":{},"mechanical":{"function":"ceiling_support_loft_access_insulation_support","load":"non_habitable_loft_0.25kN_m2_plus_insulation"},"interface":{"fix":"nailed_to_wall_plate_and_rafter_foot"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":2.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'ceiling_joist';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_38x38_treated","density_kg_m3":370,"typical_mass_kg":5},"electrical":null,"thermal":{},"mechanical":{"overhang_mm":[300,450,600],"function":"supports_verge_soffit_and_bargeboard"},"interface":{"fix":"nailed_to_last_truss_and_gable_wall"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":4.00,"lead_time_days":3,"common_suppliers":["Site_fabricated_or_truss_manufacturer"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'gable_ladder';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"OSB_3_oriented_strand_board_BS_EN_300","density_kg_m3":600,"mass_per_sheet_kg":{"9mm_1200x2400":16,"11mm_1200x2400":19,"15mm_1200x2400":26}},"electrical":null,"thermal":{"lambda_w_mk":0.13,"vapour_resistance_MNs_g":{"9mm":30,"11mm":36}},"mechanical":{"racking_resistance_kn_m":{"9mm_2.4m_panel":1.68,"11mm_2.4m_panel":2.10},"nail_fixing":"63mm_ring_shank_at_150mm_perimeter_300mm_internal","structural_use":"racking_and_diaphragm_action_per_BS_EN_12369"},"interface":{"fix":"63mm_ring_shank_nails_to_studs","gap":"3mm_expansion_gap_between_boards"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_sheet":{"9mm":8,"11mm":10,"15mm":14},"lead_time_days":3,"common_suppliers":["Norbord","Egger","Kronospan","Smartply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'osb_sheathing';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"spunbond_polypropylene_or_microporous_film","typical_mass_g_per_m2":120},"electrical":null,"thermal":{"sd_value_m":[0.02,0.2],"vapour_open":true,"water_resistance_W1":"BS_EN_13859_1"},"mechanical":{"tensile_strength_kn_m":[0.15,0.5],"UV_resistance_months":[3,4],"BBA_certified":true},"interface":{"fix":"stapled_to_sheathing_lapped_150mm","tape":"butyl_tape_at_joints_and_penetrations"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":1.00,"lead_time_days":3,"common_suppliers":["DuPont Tyvek","Protect","A Proctor Roofshield","Siga"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'breather_membrane';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"polyethylene_500_gauge_or_intelligent_variable","typical_mass_g_per_m2":{"polythene":90,"intelligent":130}},"electrical":null,"thermal":{"sd_value_m":{"polythene":50,"intelligent_Intello":[0.25,10]},"function":"prevents_interstitial_condensation"},"mechanical":{"standard":"BS_EN_13984"},"interface":{"fix":"stapled_to_studs_warm_side_of_insulation","seal":"tape_all_joints_and_penetrations"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":{"polythene":0.50,"intelligent":3.00},"lead_time_days":3,"common_suppliers":["Visqueen","pro clima Intello","Siga Majpell","A Proctor"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'vcl_membrane';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"glass_or_rock_mineral_wool","density_kg_m3":{"glass_wool":15,"rock_wool":30},"mass_per_m2_kg":{"100mm_glass":1.5,"140mm_glass":2.1,"140mm_rock":4.2}},"electrical":null,"thermal":{"lambda_w_mk":{"glass_0.032":0.032,"glass_0.035":0.035,"rock_0.034":0.034,"rock_0.037":0.037},"U_value_140mm_wall":0.27},"mechanical":{"fire_class":"A1_non_combustible_BS_EN_13501","compression_recovery":"friction_fit","width_mm":{"for_400cc":370,"for_600cc":570}},"interface":{"friction_fit":"cut_10mm_oversize","fill":"no_gaps_no_compression"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":{"140mm_glass":4,"140mm_rock":7},"lead_time_days":3,"common_suppliers":["Knauf","Isover/Saint-Gobain","Rockwool","Superglass"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'mineral_wool_batt';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"polyisocyanurate_foil_faced","density_kg_m3":32,"mass_per_m2_kg":{"50mm":1.6,"75mm":2.4,"100mm":3.2}},"electrical":null,"thermal":{"lambda_w_mk":[0.021,0.022],"U_value_50mm_addition":"significant_upgrade_when_added_externally"},"mechanical":{"compressive_strength_kpa":150,"fire_class":"B_s1_d0_or_C_s2_d0","foil_facing":"low_emissivity_reflective"},"interface":{"fix":"adhesive_and_mechanical_fix","joint":"tongue_groove_or_taped"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":{"50mm":8,"75mm":12,"100mm":16},"lead_time_days":3,"common_suppliers":["Celotex","Kingspan Kooltherm","Recticel","Xtratherm"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'pir_insulation_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":{"larch":{"density_kg_m3":470},"western_red_cedar":{"density_kg_m3":370},"treated_softwood":{"density_kg_m3":420}},"mass_per_m2_kg":{"19mm_larch":8.9,"19mm_cedar":7.0}},"electrical":null,"thermal":{"lambda_w_mk":0.13},"mechanical":{"profiles":["shiplap","TGV","featheredge","channel","open_rainscreen"],"durability_class":{"larch":3,"cedar":2,"treated_softwood":"UC3_Use_Class_3"},"fire":"consider_BS_9991_for_boundary_distance"},"interface":{"fix":"stainless_steel_ring_shank_nails_to_battens","batten":"25x50mm_treated_vertical_at_600mm","ventilated_cavity":"min_25mm_behind_cladding"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":{"larch":15,"cedar":25,"treated":10},"lead_time_days":7,"common_suppliers":["Russwood","Silva Timber","Vincent Timber","Marley Eternit"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'timber_cladding_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"cement_particle_board_or_magnesium_oxide","density_kg_m3":1200,"mass_per_m2_kg":{"12mm":14}},"electrical":null,"thermal":{"lambda_w_mk":0.23},"mechanical":{"substrate_for":"through_colour_render_or_EWI_system","moisture_resistance":"high","standard":"BBA_certified_as_render_carrier"},"interface":{"fix":"stainless_screws_to_studs_through_sheathing","render_system":"basecoat_mesh_topcoat_EWI"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":8.00,"lead_time_days":7,"common_suppliers":["Cembrit","Magply","Viroc","Euroform"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'render_carrier_board';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"uPVC_or_EPS_insulated","density_kg_m3":30,"typical_mass_g_per_m":200},"electrical":null,"thermal":{"lambda_w_mk":0.033,"function":"closes_cavity_at_openings_maintaining_thermal_line"},"mechanical":{"width_mm":[25,50,65,75,100]},"interface":{"fix":"clip_to_frame_or_screw_fix","around":"window_door_reveals_heads_cills"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":3.00,"lead_time_days":3,"common_suppliers":["Manthorpe","Cavity Trays","Timloc"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cavity_closer';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"stainless_steel_grade_304_or_316","density_kg_m3":7900,"typical_mass_g":{"helical":25,"wire_butterfly":15}},"electrical":null,"thermal":{"thermal_bridging":"low_point_contact"},"mechanical":{"tensile_kn":{"helical":1.5,"channel":2.0},"embedment_masonry_mm":62.5,"type":["helical_screw_in","channel_clip","wire_butterfly"],"spacing":"2.5_per_m2_min_or_450mm_vert_x_900mm_horiz","standard":"BS_EN_845_1_BS_5628"},"interface":{"inner_fix":"screw_into_stud_through_sheathing","drip":"required_in_cavity"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":0.50,"lead_time_days":3,"common_suppliers":["Ancon","Leviat","Heli-fix","Wienerberger"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'wall_tie';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_2.5mm_Z275","density_kg_m3":7850,"typical_mass_g":80},"electrical":null,"thermal":{},"mechanical":{"capacity_kn":{"standard_60x40":4.5},"nail_type":"3.75x30mm_galv_connector_nails","standard":"BS_EN_14545_or_ETA"},"interface":{"fix":"nailed_both_faces"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":0.80,"lead_time_days":3,"common_suppliers":["Simpson Strong-Tie","BPC","Expamet"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'framing_anchor';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_2.5mm_x_30mm_Z275","density_kg_m3":7850,"mass_per_m_g":600},"electrical":null,"thermal":{},"mechanical":{"tensile_kn":{"30x2.5mm":8.0,"30x5mm":20.0},"function":"lateral_restraint_wall_to_floor_roof_to_wall","standard":"BS_EN_14545_Building_Regs_Part_A","strap_over_min_studs":2},"interface":{"fix":"nailed_with_connector_nails_min_8_per_strap"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":2.00,"lead_time_days":3,"common_suppliers":["Simpson Strong-Tie","BPC","Expamet"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'holddown_strap';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_1mm_punched_teeth","density_kg_m3":7850,"typical_mass_g":{"100x150":50}},"electrical":null,"thermal":{},"mechanical":{"function":"truss_node_connection_factory_pressed","capacity":"manufacturer_design_per_BS_EN_14250","tooth_length_mm":[8,10,12]},"interface":{"applied":"factory_hydraulic_press_both_faces_of_joint"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":0.30,"lead_time_days":7,"common_suppliers":["MiTek","ITW Alpine","Wolf Systems"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'nail_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"malleable_cast_iron_or_pressed_steel","density_kg_m3":7200,"typical_mass_g":{"64mm_shear_plate":150,"75mm_split_ring":100}},"electrical":null,"thermal":{},"mechanical":{"shear_capacity_kn":{"64mm_shear_plate_M12":12,"75mm_split_ring_M12":15},"bolt":"M12_or_M16_grade_4.6","standard":"BS_EN_1995_1_1_clause_8.9"},"interface":{"groove":"routed_into_timber_face_with_jig"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":3.00,"lead_time_days":7,"common_suppliers":["Simpson Strong-Tie","Rothoblaas"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'timber_connector';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"C16_or_treated_softwood","density_kg_m3":370,"mass_per_m_kg":{"25x50":0.5,"38x50":0.7,"50x50":0.9}},"electrical":null,"thermal":{"function":"creates_service_void_avoids_VCL_penetration"},"mechanical":{"depth_mm":[25,38,50],"function":"horizontal_battens_for_socket_runs_and_switch_drops"},"interface":{"fix":"screwed_through_VCL_to_studs","seal":"VCL_sealed_behind_battens"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":1.00,"lead_time_days":3,"common_suppliers":["Jewson","Travis Perkins"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'service_batten';
