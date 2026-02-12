-- ============================================================
-- ForgeOS Component Geometry Library — Tier 3: Portal Frame Buildings
-- Migration: 20260212600000_seed_tier3_portal
-- ============================================================
-- Seeds 28 domain-specific geometry types for steel portal frame
-- building components.  UK steel construction per SCI P252,
-- BS EN 1993, BCSA guidance.

-- 1. portal_rafter
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'portal_rafter',
    'Portal Frame Rafter (UKB)',
    'domain',
    'primary_structure',
$CADQUERY$
def portal_rafter(params):
    """Portal frame rafter (I-section, UKB)."""
    length = params.get("length", 3000.0)  # half span typically
    depth = params.get("depth", 457.0)  # 457x191 UKB
    flange_w = params.get("flange_width", 191.0)
    flange_t = params.get("flange_thickness", 17.7)
    web_t = params.get("web_thickness", 11.0)

    # I-section extrusion
    # Top flange
    tf = (cq.Workplane("XY").workplane(offset=depth/2 - flange_t/2)
          .box(length, flange_w, flange_t))
    # Bottom flange
    bf = (cq.Workplane("XY").workplane(offset=-(depth/2 - flange_t/2))
          .box(length, flange_w, flange_t))
    # Web
    web = cq.Workplane("XY").box(length, web_t, depth - 2*flange_t)
    # Bolt holes at each end (typical 4-bolt pattern)
    for end_x in [-(length/2 - 50), length/2 - 50]:
        for bz in [depth/4, -depth/4]:
            for by in [-40, 40]:
                hole = (cq.Workplane("XY")
                        .transformed(offset=(end_x, by, bz))
                        .transformed(rotate=(0, 90, 0))
                        .circle(13).extrude(flange_w + 10).translate((0, -(flange_w/2 + 5), 0)))
    return tf.union(bf).union(web)
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}, "depth": {"type": "number", "default": 457.0, "unit": "mm", "enum": [305, 356, 406, 457, 533, 610]}}'::jsonb,
    '[]'::jsonb,
    '{steel,structural}',
    '#708090',
    'Portal frame rafter (I-section, UKB).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 2. portal_column
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'portal_column',
    'Portal Frame Column (UKB)',
    'domain',
    'primary_structure',
$CADQUERY$
def portal_column(params):
    """Portal frame column (UKB section with base plate zone)."""
    height = params.get("height", 6000.0)
    depth = params.get("depth", 457.0)
    flange_w = params.get("flange_width", 191.0)
    flange_t = params.get("flange_thickness", 17.7)
    web_t = params.get("web_thickness", 11.0)

    # I-section (vertical)
    tf = (cq.Workplane("XY")
          .transformed(offset=(0, depth/2 - flange_t/2, height/2))
          .box(flange_w, flange_t, height))
    bf = (cq.Workplane("XY")
          .transformed(offset=(0, -(depth/2 - flange_t/2), height/2))
          .box(flange_w, flange_t, height))
    web = (cq.Workplane("XY")
           .transformed(offset=(0, 0, height/2))
           .box(web_t, depth - 2*flange_t, height))
    # Cap plate (top, for rafter connection)
    cap = (cq.Workplane("XY").workplane(offset=height)
           .box(flange_w + 20, depth + 40, 20))
    return tf.union(bf).union(web).union(cap)
$CADQUERY$,
    '{"height": {"type": "number", "default": 6000.0, "unit": "mm"}, "depth": {"type": "number", "default": 457.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,structural}',
    '#708090',
    'Portal frame column (UKB section with base plate zone).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 3. base_plate
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'base_plate',
    'Column Base Plate',
    'domain',
    'primary_structure',
$CADQUERY$
def base_plate(params):
    """Column base plate with holding down bolt holes."""
    plate_w = params.get("plate_width", 400.0)
    plate_d = params.get("plate_depth", 500.0)
    plate_t = params.get("plate_thickness", 25.0)
    bolt_holes = params.get("bolt_holes", 4)
    bolt_d = params.get("bolt_diameter", 24.0)

    plate = cq.Workplane("XY").box(plate_w, plate_d, plate_t)
    # Bolt holes (symmetrical pattern)
    positions = []
    if bolt_holes == 4:
        positions = [(-plate_w/2 + 50, -plate_d/2 + 50), (-plate_w/2 + 50, plate_d/2 - 50),
                     (plate_w/2 - 50, -plate_d/2 + 50), (plate_w/2 - 50, plate_d/2 - 50)]
    elif bolt_holes == 6:
        positions = [(-plate_w/2 + 50, -plate_d/2 + 50), (-plate_w/2 + 50, 0), (-plate_w/2 + 50, plate_d/2 - 50),
                     (plate_w/2 - 50, -plate_d/2 + 50), (plate_w/2 - 50, 0), (plate_w/2 - 50, plate_d/2 - 50)]
    for bx, by in positions:
        hole = (cq.Workplane("XY").workplane(offset=-1)
                .transformed(offset=(bx, by, 0))
                .circle(bolt_d/2 + 3).extrude(plate_t + 2))  # clearance hole
        plate = plate.cut(hole)
    # Stiffener plates (2, aligned with column web)
    for by in [-plate_d/4, plate_d/4]:
        stiff = (cq.Workplane("XY").workplane(offset=plate_t)
                 .transformed(offset=(0, by, 0))
                 .box(10, plate_d * 0.4, 100))
        plate = plate.union(stiff)
    return plate
$CADQUERY$,
    '{"plate_width": {"type": "number", "default": 400.0, "unit": "mm"}, "bolt_holes": {"type": "integer", "default": 4, "enum": [4, 6]}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Column base plate with holding down bolt holes.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 4. eaves_haunch
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'eaves_haunch',
    'Eaves Haunch',
    'domain',
    'primary_structure',
$CADQUERY$
def eaves_haunch(params):
    """Eaves haunch (tapered cut from rafter section)."""
    length = params.get("length", 1500.0)  # ~10% of span
    depth_deep = params.get("depth_deep", 900.0)  # at column
    depth_shallow = params.get("depth_shallow", 457.0)  # at rafter
    flange_w = params.get("flange_width", 191.0)
    flange_t = params.get("flange_thickness", 17.7)
    web_t = params.get("web_thickness", 11.0)

    # Tapered web (trapezoidal in side view)
    # Build as a box and cut away the taper
    web = cq.Workplane("XY").box(length, web_t, depth_deep)
    # Cut the taper from bottom
    taper_cut = (cq.Workplane("XZ")
                 .moveTo(-length/2, -depth_deep/2)
                 .lineTo(length/2, -depth_deep/2)
                 .lineTo(length/2, -(depth_shallow/2))
                 .lineTo(-length/2, -depth_deep/2)
                 .close()
                 .extrude(web_t + 2)
                 .translate((0, -(web_t/2 + 1), 0)))
    # Top flange (full length)
    tf = (cq.Workplane("XY").workplane(offset=depth_deep/2 - flange_t/2)
          .box(length, flange_w, flange_t))
    # Bottom flange (tapered, simplified as full length at deep end)
    bf = (cq.Workplane("XY").workplane(offset=-(depth_deep/2 - flange_t/2))
          .box(length, flange_w, flange_t))
    # Stiffener plates at deep end
    stiff = (cq.Workplane("XY")
             .transformed(offset=(-(length/2 - 5), 0, 0))
             .box(10, flange_w, depth_deep - 2*flange_t))
    return tf.union(bf).union(web).union(stiff)
$CADQUERY$,
    '{"length": {"type": "number", "default": 1500.0, "unit": "mm"}, "depth_deep": {"type": "number", "default": 900.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,structural}',
    '#708090',
    'Eaves haunch (tapered cut from rafter section).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 5. apex_bracket
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'apex_bracket',
    'Apex / Ridge Bracket Plate',
    'domain',
    'connection',
$CADQUERY$
def apex_bracket(params):
    """Ridge / apex connection plate."""
    depth = params.get("rafter_depth", 457.0)
    plate_t = params.get("plate_thickness", 20.0)
    bolt_rows = params.get("bolt_rows", 6)

    plate_h = depth + 100
    plate_w = 200.0

    plate = cq.Workplane("XY").box(plate_w, plate_t, plate_h)
    # Bolt holes (2 columns)
    for row in range(bolt_rows):
        bz = -(plate_h/2 - 40) + row * (plate_h - 80) / max(bolt_rows - 1, 1)
        for bx in [-40, 40]:
            hole = (cq.Workplane("XY")
                    .transformed(offset=(bx, 0, bz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(13).extrude(plate_t + 10).translate((0, -(plate_t/2 + 5), 0)))
            plate = plate.cut(hole)
    return plate
$CADQUERY$,
    '{"rafter_depth": {"type": "number", "default": 457.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Ridge / apex connection plate.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 6. crane_beam
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'crane_beam',
    'Crane Beam / Gantry Girder',
    'domain',
    'primary_structure',
$CADQUERY$
def crane_beam(params):
    """Crane beam / gantry girder (compound section)."""
    length = params.get("length", 6000.0)
    main_depth = params.get("main_depth", 610.0)
    flange_w = params.get("flange_width", 229.0)
    flange_t = params.get("flange_thickness", 19.6)
    web_t = params.get("web_thickness", 11.0)
    rail_height = params.get("rail_height", 65.0)

    # Main I-section
    tf = (cq.Workplane("XY").workplane(offset=main_depth/2 - flange_t/2)
          .box(length, flange_w, flange_t))
    bf = (cq.Workplane("XY").workplane(offset=-(main_depth/2 - flange_t/2))
          .box(length, flange_w, flange_t))
    web = cq.Workplane("XY").box(length, web_t, main_depth - 2*flange_t)
    # Surge plate (channel on top flange for lateral loads)
    surge = (cq.Workplane("XY").workplane(offset=main_depth/2 + 50)
             .box(length, 8, 100))
    # Crane rail on top
    rail = (cq.Workplane("XY").workplane(offset=main_depth/2 + flange_t/2)
            .box(length, 60, rail_height))
    # Rail clips (every 500mm)
    for i in range(int(length / 500)):
        cx = -(length/2 - 250) + i * 500
        clip = (cq.Workplane("XY").workplane(offset=main_depth/2 + flange_t/2 + rail_height/2)
                .transformed(offset=(cx, 0, 0))
                .box(40, 100, rail_height))
        bore = (cq.Workplane("XY").workplane(offset=main_depth/2 + flange_t/2 + rail_height/2)
                .transformed(offset=(cx, 0, 0))
                .box(30, 62, rail_height + 2))
        clip = clip.cut(bore)
        rail = rail.union(clip)
    # End plate stiffeners
    for ex in [-(length/2 - 5), length/2 - 5]:
        stiff = (cq.Workplane("XY")
                 .transformed(offset=(ex, 0, 0))
                 .box(10, flange_w, main_depth - 2*flange_t))
        web = web.union(stiff)
    return tf.union(bf).union(web).union(surge).union(rail)
$CADQUERY$,
    '{"length": {"type": "number", "default": 6000.0, "unit": "mm"}, "main_depth": {"type": "number", "default": 610.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,structural,crane}',
    '#708090',
    'Crane beam / gantry girder (compound section).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 7. purlin_zed
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'purlin_zed',
    'Zed Purlin (Cold-Formed)',
    'domain',
    'secondary',
$CADQUERY$
def purlin_zed(params):
    """Cold-formed Zed purlin."""
    depth = params.get("depth", 200.0)
    flange = params.get("flange_width", 65.0)
    lip = params.get("lip", 20.0)
    t = params.get("thickness", 2.0)
    length = params.get("length", 2000.0)

    # Z-profile extruded
    profile = (cq.Workplane("XZ")
               .moveTo(0, -depth/2)
               .lineTo(flange, -depth/2)  # bottom flange
               .lineTo(flange, -depth/2 + lip)  # bottom lip
               .lineTo(flange - t, -depth/2 + lip)
               .lineTo(flange - t, -depth/2 + t)
               .lineTo(t, -depth/2 + t)
               .lineTo(t, depth/2 - t)
               .lineTo(-flange + t, depth/2 - t)
               .lineTo(-flange + t, depth/2 - lip)
               .lineTo(-flange, depth/2 - lip)
               .lineTo(-flange, depth/2)
               .lineTo(0, depth/2)
               .close()
               .extrude(length))
    # Bolt holes at ends (2 per end in web)
    for end_y in [30, length - 30]:
        for bz in [-depth/4, depth/4]:
            hole = (cq.Workplane("XY").workplane(offset=bz)
                    .transformed(offset=(0, end_y, 0))
                    .circle(9).extrude(t + 2).translate((-(t/2 + 1), 0, 0)))
    return purlin_zed_simple(params) if False else profile
$CADQUERY$,
    '{"depth": {"type": "number", "default": 200.0, "unit": "mm", "enum": [142, 172, 202, 232, 262]}, "length": {"type": "number", "default": 2000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,cold_formed}',
    '#A0A0A0',
    'Cold-formed Zed purlin.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 8. side_rail
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'side_rail',
    'Side Rail / Cladding Rail',
    'domain',
    'secondary',
$CADQUERY$
def side_rail(params):
    """Side rail / cladding rail (Zed or C section)."""
    depth = params.get("depth", 175.0)
    flange = params.get("flange_width", 65.0)
    t = params.get("thickness", 1.8)
    length = params.get("length", 2000.0)

    web = cq.Workplane("XY").box(t, length, depth)
    top_f = (cq.Workplane("XY")
             .transformed(offset=(-(flange/2 - t/2), 0, depth/2 - t/2))
             .box(flange, length, t))
    bot_f = (cq.Workplane("XY")
             .transformed(offset=(flange/2 - t/2, 0, -(depth/2 - t/2)))
             .box(flange, length, t))
    return web.union(top_f).union(bot_f)
$CADQUERY$,
    '{"depth": {"type": "number", "default": 175.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,cold_formed}',
    '#A0A0A0',
    'Side rail / cladding rail (Zed or C section).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 9. eaves_beam
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'eaves_beam',
    'Eaves Beam (PFC)',
    'domain',
    'secondary',
$CADQUERY$
def eaves_beam(params):
    """Eaves beam (PFC or angle at eaves level)."""
    length = params.get("length", 6000.0)
    depth = params.get("depth", 230.0)
    flange_w = params.get("flange_width", 90.0)
    flange_t = params.get("flange_thickness", 14.0)
    web_t = params.get("web_thickness", 7.5)

    # PFC (parallel flange channel)
    web = cq.Workplane("XY").box(length, web_t, depth)
    tf = (cq.Workplane("XY")
          .transformed(offset=(0, flange_w/2 - web_t/2, depth/2 - flange_t/2))
          .box(length, flange_w, flange_t))
    bf = (cq.Workplane("XY")
          .transformed(offset=(0, flange_w/2 - web_t/2, -(depth/2 - flange_t/2)))
          .box(length, flange_w, flange_t))
    return web.union(tf).union(bf)
$CADQUERY$,
    '{"length": {"type": "number", "default": 6000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,structural}',
    '#708090',
    'Eaves beam (PFC or angle at eaves level).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 10. cross_bracing
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cross_bracing',
    'Cross Bracing (Flat Bar)',
    'domain',
    'secondary',
$CADQUERY$
def cross_bracing(params):
    """Cross bracing (flat bar or rod, X pattern)."""
    bay_width = params.get("bay_width", 6000.0)
    bay_height = params.get("bay_height", 6000.0)
    bar_w = params.get("bar_width", 60.0)
    bar_t = params.get("bar_thickness", 10.0)

    diag = math.sqrt(bay_width**2 + bay_height**2)
    angle = math.degrees(math.atan2(bay_height, bay_width))

    # Two diagonal bars crossing
    bar1 = (cq.Workplane("XY")
            .transformed(offset=(0, 0, 0))
            .transformed(rotate=(0, 0, angle))
            .box(diag, bar_w, bar_t))
    bar2 = (cq.Workplane("XY")
            .transformed(offset=(0, 0, 0))
            .transformed(rotate=(0, 0, -angle))
            .box(diag, bar_w, bar_t))
    # Gusset plates at corners (4)
    for x, z in [(-bay_width/2, -bay_height/2), (-bay_width/2, bay_height/2),
                 (bay_width/2, -bay_height/2), (bay_width/2, bay_height/2)]:
        gusset = (cq.Workplane("XY")
                  .transformed(offset=(x, 0, z))
                  .box(200, bar_t, 200))
        bar1 = bar1.union(gusset)
    return bar1.union(bar2)
$CADQUERY$,
    '{"bay_width": {"type": "number", "default": 6000.0, "unit": "mm"}, "bay_height": {"type": "number", "default": 6000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,bracing}',
    '#808080',
    'Cross bracing (flat bar or rod, X pattern).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 11. gable_post
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'gable_post',
    'Gable Post (UC Section)',
    'domain',
    'secondary',
$CADQUERY$
def gable_post(params):
    """Gable end post (vertical column in gable wall)."""
    height = params.get("height", 6000.0)
    depth = params.get("depth", 203.0)  # 203x203 UC
    flange_w = params.get("flange_width", 203.0)
    flange_t = params.get("flange_thickness", 12.5)
    web_t = params.get("web_thickness", 7.8)

    tf = (cq.Workplane("XY")
          .transformed(offset=(0, depth/2 - flange_t/2, height/2))
          .box(flange_w, flange_t, height))
    bf = (cq.Workplane("XY")
          .transformed(offset=(0, -(depth/2 - flange_t/2), height/2))
          .box(flange_w, flange_t, height))
    web = (cq.Workplane("XY")
           .transformed(offset=(0, 0, height/2))
           .box(web_t, depth - 2*flange_t, height))
    # Base plate (simple)
    bp = cq.Workplane("XY").box(flange_w + 40, depth + 40, 15)
    return tf.union(bf).union(web).union(bp)
$CADQUERY$,
    '{"height": {"type": "number", "default": 6000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,structural}',
    '#708090',
    'Gable end post (vertical column in gable wall).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 12. sag_rod
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'sag_rod',
    'Anti-Sag Rod',
    'domain',
    'secondary',
$CADQUERY$
def sag_rod(params):
    """Anti-sag rod for purlins."""
    length = params.get("length", 1500.0)
    rod_d = params.get("rod_diameter", 12.0)

    rod = cq.Workplane("XY").circle(rod_d/2).extrude(length)
    # Threaded ends with nuts (simplified)
    for z in [-10, length]:
        nut = (cq.Workplane("XY").workplane(offset=z)
               .polygon(6, rod_d * 2).extrude(10))
        rod = rod.union(nut)
    return rod
$CADQUERY$,
    '{"length": {"type": "number", "default": 1500.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,bracing}',
    '#A0A0A0',
    'Anti-sag rod for purlins.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 13. end_plate_connection
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'end_plate_connection',
    'Bolted End Plate (Moment)',
    'domain',
    'connection',
$CADQUERY$
def end_plate_connection(params):
    """Bolted end plate (moment connection)."""
    plate_w = params.get("plate_width", 250.0)
    plate_h = params.get("plate_height", 550.0)
    plate_t = params.get("plate_thickness", 25.0)
    bolt_rows = params.get("bolt_rows", 6)
    bolt_d = params.get("bolt_diameter", 24.0)

    plate = cq.Workplane("XY").box(plate_w, plate_t, plate_h)
    # Bolt holes (2 per row)
    for row in range(bolt_rows):
        bz = -(plate_h/2 - 40) + row * (plate_h - 80) / max(bolt_rows - 1, 1)
        for bx in [-(plate_w/4), plate_w/4]:
            hole = (cq.Workplane("XY")
                    .transformed(offset=(bx, 0, bz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(bolt_d/2 + 1).extrude(plate_t + 10).translate((0, -(plate_t/2 + 5), 0)))
            plate = plate.cut(hole)
    return plate
$CADQUERY$,
    '{"plate_height": {"type": "number", "default": 550.0, "unit": "mm"}, "bolt_rows": {"type": "integer", "default": 6}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Bolted end plate (moment connection).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 14. fin_plate
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'fin_plate',
    'Fin Plate (Shear Connection)',
    'domain',
    'connection',
$CADQUERY$
def fin_plate(params):
    """Fin plate (simple shear connection)."""
    plate_w = params.get("plate_width", 100.0)
    plate_h = params.get("plate_height", 300.0)
    plate_t = params.get("plate_thickness", 10.0)
    bolts = params.get("bolts", 3)
    bolt_d = params.get("bolt_diameter", 20.0)

    plate = cq.Workplane("XY").box(plate_w, plate_t, plate_h)
    for i in range(bolts):
        bz = -(plate_h/2 - 40) + i * (plate_h - 80) / max(bolts - 1, 1)
        hole = (cq.Workplane("XY")
                .transformed(offset=(plate_w/4, 0, bz))
                .transformed(rotate=(90, 0, 0))
                .circle(bolt_d/2 + 1).extrude(plate_t + 10).translate((0, -(plate_t/2 + 5), 0)))
        plate = plate.cut(hole)
    return plate
$CADQUERY$,
    '{"bolts": {"type": "integer", "default": 3, "enum": [2, 3, 4, 5]}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Fin plate (simple shear connection).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 15. splice_plate
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'splice_plate',
    'Splice Plate (Pair)',
    'domain',
    'connection',
$CADQUERY$
def splice_plate(params):
    """Splice plate (rafter or column splice — pair of plates)."""
    plate_w = params.get("plate_width", 200.0)
    plate_h = params.get("plate_height", 400.0)
    plate_t = params.get("plate_thickness", 12.0)
    bolt_rows = params.get("bolt_rows", 4)
    bolt_d = params.get("bolt_diameter", 20.0)
    gap = params.get("gap", 60.0)  # gap between plates (web thickness)

    result = None
    for side in [-1, 1]:
        py = side * (gap/2 + plate_t/2)
        plate = (cq.Workplane("XY")
                 .transformed(offset=(0, py, 0))
                 .box(plate_w, plate_t, plate_h))
        for row in range(bolt_rows):
            bz = -(plate_h/2 - 40) + row * (plate_h - 80) / max(bolt_rows - 1, 1)
            for bx in [-(plate_w/4), plate_w/4]:
                hole = (cq.Workplane("XY")
                        .transformed(offset=(bx, py, bz))
                        .transformed(rotate=(90, 0, 0))
                        .circle(bolt_d/2 + 1).extrude(plate_t + 10).translate((0, -(plate_t/2 + 5), 0)))
                plate = plate.cut(hole)
        result = plate if result is None else result.union(plate)
    return result
$CADQUERY$,
    '{"bolt_rows": {"type": "integer", "default": 4}}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Splice plate (rafter or column splice — pair of plates).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 16. holding_down_bolt
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'holding_down_bolt',
    'Holding Down Bolt (Cast-In)',
    'domain',
    'connection',
$CADQUERY$
def holding_down_bolt(params):
    """Holding down bolt assembly (cast-in L-bolt)."""
    bolt_d = params.get("bolt_diameter", 24.0)
    embed_l = params.get("embedment_length", 450.0)
    proj_l = params.get("projection_length", 150.0)
    hook_l = params.get("hook_length", 100.0)

    # Vertical shaft
    shaft = cq.Workplane("XY").circle(bolt_d/2).extrude(embed_l + proj_l)
    # Hook at bottom (L-bend)
    hook = (cq.Workplane("XY").workplane(offset=-10)
            .transformed(offset=(hook_l/2, 0, 0))
            .circle(bolt_d/2).extrude(hook_l))
    hook = hook.translate((0, 0, 0))  # L-bend simplified as horizontal extension
    hook2 = (cq.Workplane("XY")
             .transformed(offset=(hook_l, 0, 0))
             .circle(bolt_d/2).extrude(30))
    # Nut + washer at top
    nut = (cq.Workplane("XY").workplane(offset=embed_l + proj_l)
           .polygon(6, bolt_d * 2).extrude(bolt_d * 0.8))
    washer = (cq.Workplane("XY").workplane(offset=embed_l + proj_l - 3)
              .circle(bolt_d * 1.2).extrude(3))
    # Grout sleeve (tube)
    sleeve = (cq.Workplane("XY").workplane(offset=embed_l - 50)
              .circle(bolt_d * 1.5).circle(bolt_d * 1.5 - 2).extrude(50 + proj_l - 10))
    return shaft.union(hook2).union(nut).union(washer).union(sleeve)
$CADQUERY$,
    '{"bolt_diameter": {"type": "number", "default": 24.0, "unit": "mm", "enum": [16, 20, 24, 30]}}'::jsonb,
    '[]'::jsonb,
    '{steel,foundation}',
    '#808080',
    'Holding down bolt assembly (cast-in L-bolt).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 17. purlin_cleat
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'purlin_cleat',
    'Purlin Cleat (Angle Bracket)',
    'domain',
    'connection',
$CADQUERY$
def purlin_cleat(params):
    """Purlin cleat (angle bracket bolted to rafter)."""
    cleat_h = params.get("cleat_height", 120.0)
    cleat_w = params.get("cleat_width", 100.0)
    t = params.get("thickness", 10.0)
    bolt_d = params.get("bolt_diameter", 16.0)

    # L-angle
    vert = cq.Workplane("XY").box(cleat_w, t, cleat_h)
    horiz = (cq.Workplane("XY")
             .transformed(offset=(0, -(cleat_h/2 - t/2), -(cleat_h/2 - t/2)))
             .box(cleat_w, cleat_h, t))
    cleat = vert.union(horiz)
    # Bolt holes in vertical leg (for rafter web)
    for bz in [-cleat_h/4, cleat_h/4]:
        hole = (cq.Workplane("XY")
                .transformed(offset=(0, 0, bz))
                .transformed(rotate=(90, 0, 0))
                .circle(bolt_d/2 + 1).extrude(t + 10).translate((0, -(t/2 + 5), 0)))
        cleat = cleat.cut(hole)
    # Bolt holes in horizontal leg (for purlin)
    for bx in [-cleat_w/4, cleat_w/4]:
        hole = (cq.Workplane("XY")
                .transformed(offset=(bx, -(cleat_h/2 - t/2), -(cleat_h/2 - t/2)))
                .circle(bolt_d/2 + 1).extrude(t + 10).translate((0, 0, -(t/2 + 5))))
        cleat = cleat.cut(hole)
    return cleat
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,connection}',
    '#808080',
    'Purlin cleat (angle bracket bolted to rafter).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 18. profiled_roof_sheet
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'profiled_roof_sheet',
    'Trapezoidal Roof Sheet',
    'domain',
    'cladding',
$CADQUERY$
def profiled_roof_sheet(params):
    """Trapezoidal profiled steel roof sheet."""
    length = params.get("length", 3000.0)
    cover_w = params.get("cover_width", 1000.0)
    pitch = params.get("rib_pitch", 200.0)
    rib_h = params.get("rib_height", 32.0)
    t = params.get("thickness", 0.7)

    ribs = int(cover_w / pitch)
    result = None
    for i in range(ribs):
        rx = -(cover_w/2) + (i + 0.5) * pitch
        # Trough
        trough = (cq.Workplane("XY")
                  .transformed(offset=(rx - pitch/4, 0, 0))
                  .box(pitch/2, length, t))
        # Crest
        crest = (cq.Workplane("XY")
                 .transformed(offset=(rx + pitch/4, 0, rib_h))
                 .box(pitch/2, length, t))
        # Web (angled, simplified as vertical)
        web_l = (cq.Workplane("XY")
                 .transformed(offset=(rx, 0, rib_h/2))
                 .box(t, length, rib_h))
        part = trough.union(crest).union(web_l)
        result = part if result is None else result.union(part)
    return result
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}, "rib_height": {"type": "number", "default": 32.0, "unit": "mm", "enum": [25, 32, 35]}}'::jsonb,
    '[]'::jsonb,
    '{steel,cladding,roofing}',
    '#A0A0B0',
    'Trapezoidal profiled steel roof sheet.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 19. composite_panel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'composite_panel',
    'Insulated Composite Panel',
    'domain',
    'cladding',
$CADQUERY$
def composite_panel(params):
    """Insulated composite / sandwich panel (PIR core)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 1000.0)
    thickness = params.get("thickness", 80.0)
    outer_t = params.get("outer_skin_thickness", 0.5)
    inner_t = params.get("inner_skin_thickness", 0.4)

    # Outer skin (micro-ribbed)
    outer = (cq.Workplane("XY").workplane(offset=thickness/2 - outer_t/2)
             .box(width, length, outer_t))
    # Core (PIR insulation)
    core = cq.Workplane("XY").box(width, length, thickness - outer_t - inner_t)
    # Inner skin (lightly profiled)
    inner = (cq.Workplane("XY").workplane(offset=-(thickness/2 - inner_t/2))
             .box(width, length, inner_t))
    # Side joint (tongue & groove)
    tongue = (cq.Workplane("XY")
              .transformed(offset=(width/2 + 5, 0, 0))
              .box(10, length, thickness * 0.6))
    groove = (cq.Workplane("XY")
              .transformed(offset=(-(width/2 + 5), 0, 0))
              .box(10, length, thickness * 0.6))
    groove_cut = (cq.Workplane("XY")
                  .transformed(offset=(-(width/2 + 5), 0, 0))
                  .box(8, length + 2, thickness * 0.55))
    groove = groove.cut(groove_cut)
    return outer.union(core).union(inner).union(tongue).union(groove)
$CADQUERY$,
    '{"thickness": {"type": "number", "default": 80.0, "unit": "mm", "enum": [40, 60, 80, 100, 120]}}'::jsonb,
    '[]'::jsonb,
    '{steel,PIR,insulation}',
    '#D0D0D0',
    'Insulated composite / sandwich panel (PIR core).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 20. rooflight_panel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'rooflight_panel',
    'GRP Rooflight Panel',
    'domain',
    'cladding',
$CADQUERY$
def rooflight_panel(params):
    """GRP translucent rooflight panel (profile-matched)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 1000.0)
    t = params.get("thickness", 1.5)
    rib_h = params.get("rib_height", 32.0)
    rib_pitch = params.get("rib_pitch", 200.0)

    # Same profile as roof sheet but single skin
    ribs = int(width / rib_pitch)
    result = None
    for i in range(ribs):
        rx = -(width/2) + (i + 0.5) * rib_pitch
        trough = (cq.Workplane("XY")
                  .transformed(offset=(rx - rib_pitch/4, 0, 0))
                  .box(rib_pitch/2, length, t))
        crest = (cq.Workplane("XY")
                 .transformed(offset=(rx + rib_pitch/4, 0, rib_h))
                 .box(rib_pitch/2, length, t))
        web = (cq.Workplane("XY")
               .transformed(offset=(rx, 0, rib_h/2))
               .box(t, length, rib_h))
        part = trough.union(crest).union(web)
        result = part if result is None else result.union(part)
    return result
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{GRP,translucent,roofing}',
    '#E0F0FF',
    'GRP translucent rooflight panel (profile-matched).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 21. ridge_flashing
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ridge_flashing',
    'Ridge Flashing',
    'domain',
    'cladding',
$CADQUERY$
def ridge_flashing(params):
    """Ridge flashing (bent steel sheet)."""
    length = params.get("length", 3000.0)
    girth = params.get("girth", 450.0)  # total width unfolded
    t = params.get("thickness", 0.7)
    pitch_deg = params.get("pitch_degrees", 6.0)

    half_w = girth / 2
    # Two angled planes meeting at ridge
    left = (cq.Workplane("XY")
            .transformed(offset=(-(half_w/2), 0, 0))
            .transformed(rotate=(0, pitch_deg, 0))
            .box(half_w, length, t))
    right = (cq.Workplane("XY")
             .transformed(offset=(half_w/2, 0, 0))
             .transformed(rotate=(0, -pitch_deg, 0))
             .box(half_w, length, t))
    return left.union(right)
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,flashing}',
    '#A0A0B0',
    'Ridge flashing (bent steel sheet).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 22. roller_shutter_door
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'roller_shutter_door',
    'Roller Shutter Door',
    'domain',
    'doors',
$CADQUERY$
def roller_shutter_door(params):
    """Industrial roller shutter door."""
    w = params.get("width", 4000.0)
    h = params.get("height", 4500.0)
    slat_h = params.get("slat_height", 75.0)
    slat_t = params.get("slat_thickness", 1.0)

    # Guide channels (2 vertical)
    result = None
    for side in [-1, 1]:
        guide = (cq.Workplane("XY")
                 .transformed(offset=(side * (w/2 + 30), 0, h/2))
                 .box(60, 60, h))
        guide_slot = (cq.Workplane("XY")
                      .transformed(offset=(side * (w/2 + 10), 0, h/2))
                      .box(20, 40, h + 2))
        guide = guide.cut(guide_slot)
        result = guide if result is None else result.union(guide)
    # Curtain (slats)
    slat_count = min(int(h / slat_h), 30)  # limit for performance
    for i in range(slat_count):
        sz = slat_h/2 + i * slat_h
        slat = (cq.Workplane("XY")
                .transformed(offset=(0, 0, sz))
                .box(w, slat_t, slat_h - 2))
        result = result.union(slat)
    # Hood / barrel housing (top)
    barrel_r = max(w * 0.02, 150)
    hood = (cq.Workplane("XY").workplane(offset=h + barrel_r)
            .transformed(rotate=(0, 90, 0))
            .circle(barrel_r).extrude(w + 80).translate((-(w/2 + 40), 0, 0)))
    # Hood cover
    hood_cover = (cq.Workplane("XY")
                  .transformed(offset=(0, 0, h + barrel_r))
                  .box(w + 80, barrel_r * 2 + 20, barrel_r * 2 + 20))
    hood_inner = (cq.Workplane("XY")
                  .transformed(offset=(0, 0, h + barrel_r))
                  .box(w + 82, barrel_r * 2 + 10, barrel_r * 2 + 10))
    hood_cover = hood_cover.cut(hood_inner)
    return result.union(hood).union(hood_cover)
$CADQUERY$,
    '{"width": {"type": "number", "default": 4000.0, "unit": "mm"}, "height": {"type": "number", "default": 4500.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,industrial,doors}',
    '#808080',
    'Industrial roller shutter door.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 23. sectional_overhead_door
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'sectional_overhead_door',
    'Sectional Overhead Door',
    'domain',
    'doors',
$CADQUERY$
def sectional_overhead_door(params):
    """Sectional overhead door (insulated panels)."""
    w = params.get("width", 4000.0)
    h = params.get("height", 4200.0)
    panel_count = params.get("panels", 5)
    panel_t = params.get("panel_thickness", 42.0)

    panel_h = h / panel_count
    result = None
    for i in range(panel_count):
        pz = panel_h/2 + i * panel_h
        panel = (cq.Workplane("XY")
                 .transformed(offset=(0, 0, pz))
                 .box(w - 10, panel_t, panel_h - 5))
        # Embossed lines (Georgian style)
        for lx in [-(w/4), 0, w/4]:
            line = (cq.Workplane("XY")
                    .transformed(offset=(lx, -(panel_t/2 + 0.5), pz))
                    .box(2, 1, panel_h - 20))
            panel = panel.union(line)
        result = panel if result is None else result.union(panel)
    # Side tracks (2)
    for side in [-1, 1]:
        track = (cq.Workplane("XY")
                 .transformed(offset=(side * (w/2 + 20), -(panel_t/2), h/2))
                 .box(40, 40, h + 200))
        result = result.union(track)
    # Horizontal tracks (ceiling mounted, 2)
    for side in [-1, 1]:
        h_track = (cq.Workplane("XY")
                   .transformed(offset=(side * (w/2 + 20), -(h/2 + panel_t), h + 50))
                   .box(40, h, 40))
        result = result.union(h_track)
    return result
$CADQUERY$,
    '{"width": {"type": "number", "default": 4000.0, "unit": "mm"}, "height": {"type": "number", "default": 4200.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,insulated,doors}',
    '#C0C0C0',
    'Sectional overhead door (insulated panels).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 24. personnel_door_steel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'personnel_door_steel',
    'Steel Personnel Door',
    'domain',
    'doors',
$CADQUERY$
def personnel_door_steel(params):
    """Steel personnel door (single leaf, industrial)."""
    w = params.get("width", 920.0)
    h = params.get("height", 2085.0)
    t = params.get("thickness", 50.0)

    # Door leaf (insulated steel panel)
    door = cq.Workplane("XY").box(w, t, h)
    # Vision panel
    vision = (cq.Workplane("XY")
              .transformed(offset=(0, 0, h * 0.15))
              .box(w * 0.3, t + 10, h * 0.2))
    door = door.cut(vision)
    glass = (cq.Workplane("XY")
             .transformed(offset=(0, 0, h * 0.15))
             .box(w * 0.3 - 10, 6, h * 0.2 - 10))
    # Frame (pressed steel)
    frame_w = 60
    left = (cq.Workplane("XY")
            .transformed(offset=(-(w/2 + frame_w/2), 0, h/2))
            .box(frame_w, t + 20, h + 20))
    right = (cq.Workplane("XY")
             .transformed(offset=(w/2 + frame_w/2, 0, h/2))
             .box(frame_w, t + 20, h + 20))
    head = (cq.Workplane("XY")
            .transformed(offset=(0, 0, h + 10))
            .box(w + 2*frame_w, t + 20, frame_w))
    # Panic bar (push pad)
    panic = (cq.Workplane("XY")
             .transformed(offset=(0, -(t/2 + 15), h * 0.45))
             .box(w * 0.8, 30, 40))
    return door.union(glass).union(left).union(right).union(head).union(panic)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{steel,doors}',
    '#708090',
    'Steel personnel door (single leaf, industrial).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 25. valley_gutter
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'valley_gutter',
    'Valley / Box Gutter',
    'domain',
    'drainage',
$CADQUERY$
def valley_gutter(params):
    """Internal box / valley gutter."""
    length = params.get("length", 3000.0)
    width = params.get("width", 600.0)
    depth = params.get("depth", 150.0)
    t = params.get("thickness", 1.5)

    # U-shaped box gutter
    base = cq.Workplane("XY").box(width, length, t)
    left_wall = (cq.Workplane("XY")
                 .transformed(offset=(-(width/2 - t/2), 0, depth/2))
                 .box(t, length, depth))
    right_wall = (cq.Workplane("XY")
                  .transformed(offset=(width/2 - t/2, 0, depth/2))
                  .box(t, length, depth))
    # Outlet (round, at one end)
    outlet = (cq.Workplane("XY").workplane(offset=-1)
              .transformed(offset=(0, -(length/2 - 100), 0))
              .circle(50).extrude(t + 2))
    gutter = base.union(left_wall).union(right_wall)
    gutter = gutter.cut(outlet)
    # Overflow weir (at other end)
    weir = (cq.Workplane("XY")
            .transformed(offset=(0, length/2 - t/2, depth * 0.6))
            .box(width * 0.8, t, depth * 0.4))
    return gutter.union(weir)
$CADQUERY$,
    '{"width": {"type": "number", "default": 600.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,drainage}',
    '#808080',
    'Internal box / valley gutter.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 26. industrial_downpipe
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'industrial_downpipe',
    'Industrial Downpipe',
    'domain',
    'drainage',
$CADQUERY$
def industrial_downpipe(params):
    """Large bore industrial downpipe."""
    length = params.get("length", 3000.0)
    diameter = params.get("diameter", 100.0)
    t = params.get("thickness", 1.5)

    pipe = cq.Workplane("XY").circle(diameter/2).circle(diameter/2 - t).extrude(length)
    # Socket at top
    socket = (cq.Workplane("XY").workplane(offset=length - 40)
              .circle(diameter/2 + 5).circle(diameter/2 + 2).extrude(40))
    # Pipe brackets (2)
    for z in [length * 0.25, length * 0.75]:
        bracket = (cq.Workplane("XY").workplane(offset=z)
                   .circle(diameter/2 + 10).circle(diameter/2 + 3).extrude(25))
        # Wall lug
        lug = (cq.Workplane("XY").workplane(offset=z + 5)
               .transformed(offset=(diameter/2 + 30, 0, 0))
               .box(40, 20, 15))
        pipe = pipe.union(bracket).union(lug)
    return pipe.union(socket)
$CADQUERY$,
    '{"diameter": {"type": "number", "default": 100.0, "unit": "mm", "enum": [75, 100, 150]}}'::jsonb,
    '[]'::jsonb,
    '{steel,drainage}',
    '#808080',
    'Large bore industrial downpipe.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 27. tek_screw
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tek_screw',
    'Self-Drilling Tek Screw',
    'domain',
    'fixings',
$CADQUERY$
def tek_screw(params):
    """Self-drilling tek screw (cladding fixing)."""
    length = params.get("length", 65.0)
    head_d = params.get("head_diameter", 16.0)
    shank_d = params.get("shank_diameter", 5.5)

    # Hex head
    head = (cq.Workplane("XY").workplane(offset=length)
            .polygon(6, head_d).extrude(8))
    # Washer (EPDM bonded)
    washer = (cq.Workplane("XY").workplane(offset=length - 2)
              .circle(head_d/2 + 2).extrude(4))
    # Shank
    shank = cq.Workplane("XY").circle(shank_d/2).extrude(length)
    # Drill point (simplified cone)
    point = (cq.Workplane("XY").workplane(offset=-5)
             .circle(shank_d/2).workplane(offset=-8).circle(0.5).loft())
    return head.union(washer).union(shank).union(point)
$CADQUERY$,
    '{"length": {"type": "number", "default": 65.0, "unit": "mm", "enum": [32, 45, 55, 65, 85]}}'::jsonb,
    '[]'::jsonb,
    '{steel,fixing}',
    '#C0C0C0',
    'Self-drilling tek screw (cladding fixing).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;

-- 28. smoke_vent
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'smoke_vent',
    'Smoke Vent / AOV Rooflight',
    'domain',
    'accessories',
$CADQUERY$
def smoke_vent(params):
    """Smoke vent / AOV rooflight (automatic opening)."""
    w = params.get("width", 1200.0)
    l = params.get("length", 1200.0)
    upstand_h = params.get("upstand_height", 300.0)

    # Upstand kerb
    kerb = (cq.Workplane("XY")
            .sketch().rect(w, l).finalize().extrude(upstand_h))
    kerb_inner = (cq.Workplane("XY").workplane(offset=5)
                  .sketch().rect(w - 10, l - 10).finalize()
                  .extrude(upstand_h))
    kerb = kerb.cut(kerb_inner)
    # Dome / flat glazed lid
    lid = (cq.Workplane("XY").workplane(offset=upstand_h)
           .sketch().rect(w + 20, l + 20).vertices().fillet(15).finalize()
           .extrude(15))
    # Actuator (pneumatic ram)
    ram = (cq.Workplane("XY").workplane(offset=upstand_h * 0.5)
           .transformed(offset=(w/2 - 30, 0, 0))
           .box(30, 20, upstand_h * 0.6))
    return kerb.union(lid).union(ram)
$CADQUERY$,
    '{"width": {"type": "number", "default": 1200.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{steel,polycarbonate,fire_safety}',
    '#D0D0D0',
    'Smoke vent / AOV rooflight (automatic opening).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;


-- ============================================================
-- Physical Properties + Procurement Data
-- Source: portal_physical_properties.py
-- ============================================================

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S355_JR_hot_rolled_UKB","density_kg_m3":7850,"mass_per_m_kg":{"305x165x40":40,"356x171x51":51,"406x178x60":60,"457x191x67":67,"533x210x82":82,"610x229x101":101}},"electrical":null,"thermal":{"fire_protection":{"intumescent_paint_30min":true,"board_60min":true}},"mechanical":{"yield_strength_mpa":355,"tensile_strength_mpa":510,"moment_capacity_knm":{"457x191x67":412,"533x210x82":590,"610x229x101":850},"plastic_modulus_cm3":{"457x191x67":1300,"533x210x82":1800,"610x229x101":2510},"section_class":"Class_1_plastic","lateral_torsional_buckling":"restrained_by_purlins"},"interface":{"connection_eaves":"extended_end_plate_moment","connection_apex":"flush_end_plate","purlin_fix":"cleat_bolted_M16","standard":"BS_EN_1993_1_1_EC3"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_tonne":1200.0,"lead_time_days":{"stock":5,"fabricated":28},"common_suppliers":["British Steel","ArcelorMittal","Tata Steel"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'portal_rafter';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S355_JR_hot_rolled_UKB","density_kg_m3":7850,"mass_per_m_kg":{"305x165x40":40,"356x171x51":51,"406x178x60":60,"457x191x67":67}},"electrical":null,"thermal":{"fire_protection":{"intumescent_30min":true,"board_60min":true}},"mechanical":{"yield_strength_mpa":355,"axial_capacity_kn":{"457x191x67_6m":1800},"stability":"in_plane_sway_out_of_plane_braced"},"interface":{"base":"nominally_pinned_or_fixed","rafter":"moment_connection_haunch"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_tonne":1200.0,"lead_time_days":28,"common_suppliers":["Severfield","William Hare","Billington"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'portal_column';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_plate","density_kg_m3":7850,"typical_mass_kg":{"pinned_4bolt":12,"fixed_6bolt":25}},"electrical":null,"thermal":{},"mechanical":{"plate_thickness_mm":[20,25,30,40,50],"concrete_bearing_strength_mpa":{"C30_37":15,"C40_50":20},"base_type":["nominally_pinned","moment_resisting"]},"interface":{"holding_down":"M16_M20_M24_M30_grade_8.8","grout":"non_shrink_25mm_50mm","foundation":"pad_or_strip_footing"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":40.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'base_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S355_cut_from_parent_UKB_section","density_kg_m3":7850,"typical_mass_kg":{"457_haunch_1.5m":70,"533_haunch_2m":120}},"electrical":null,"thermal":{},"mechanical":{"haunch_length":"typically_10pct_of_span","depth_at_column":"1.5_to_2x_rafter_depth","design_per":"SCI_P252_appendix"},"interface":{"rafter_weld":"fillet_weld_to_rafter","column_connection":"extended_end_plate_bolted"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":60.0,"lead_time_days":21,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'eaves_haunch';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_plate","density_kg_m3":7850,"typical_mass_kg":8},"electrical":null,"thermal":{},"mechanical":{"bolt_grade":"8.8","bolt_size":["M20","M24"],"design":"SCI_P252_flush_or_extended_end_plate"},"interface":{"bolts":"preloaded_or_non_preloaded"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":25.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'apex_bracket';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S355_UKB_plus_surge_plate_plus_rail","density_kg_m3":7850,"mass_per_m_kg":{"610x229x101_compound":130}},"electrical":{"crane_supply":"busbar_or_festoon_415V_3ph"},"thermal":{},"mechanical":{"crane_capacity_t":[5,10,20,40],"crane_class":{"light":"S3_HC3","medium":"S5_HC3","heavy":"S7_HC4"},"design_per":"BS_EN_1993_6_crane_supporting_structures","fatigue_assessment":"required_BS_EN_1993_1_9","deflection_limit":"span_over_600"},"interface":{"column_bracket":"bolted_welded","rail":"crane_rail_A45_A65_A100","rail_clip":"Gantrex_or_similar"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_tonne":1800.0,"lead_time_days":42,"common_suppliers":["Severfield","William Hare"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'crane_beam';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S390_cold_formed_galvanised_Z275","density_kg_m3":7850,"mass_per_m_kg":{"142_15":2.8,"172_15":3.4,"202_15":3.8,"232_20":5.8,"262_20":6.5}},"electrical":null,"thermal":{},"mechanical":{"span_m":{"single":[4,8],"double_sleeved":[6,12]},"load_capacity_kn_m":{"202x1.5_6m":2.5,"232x2.0_7m":3.8},"design_per":"BS_EN_1993_1_3"},"interface":{"fix_to_rafter":"M16_bolt_through_cleat","sleeve":"sleeved_at_internal_supports","sag_rod":"M12_at_mid_span_for_deep_purlins"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":6.0,"lead_time_days":7,"common_suppliers":["Metsec","Albion Sections","voestalpine","Steadmans"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'purlin_zed';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S390_cold_formed_galvanised_Z275","density_kg_m3":7850,"mass_per_m_kg":{"142_12":2.2,"172_15":3.4,"202_15":3.8}},"electrical":null,"thermal":{},"mechanical":{"span_m":[5,8],"wind_suction_kn_m2":[0.5,1.2]},"interface":{"fix_to_column":"M12_cleat_bolted"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":5.0,"lead_time_days":7,"common_suppliers":["Metsec","Albion Sections"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'side_rail';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_PFC_hot_rolled","density_kg_m3":7850,"mass_per_m_kg":{"230x90_PFC":32,"260x90_PFC":35}},"electrical":null,"thermal":{},"mechanical":{"function":"longitudinal_stability_and_gutter_support"},"interface":{"fix":"bolted_to_column_cap_plate"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":40.0,"lead_time_days":14,"common_suppliers":["Stock_section"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'eaves_beam';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_flat_bar_or_CHS","density_kg_m3":7850,"mass_per_m_kg":{"60x10_flat":4.7,"M20_rod":2.5,"60.3x3.2_CHS":4.5}},"electrical":null,"thermal":{},"mechanical":{"type":["flat_bar","angle","CHS","rod"],"function":"longitudinal_stability_wind_bracing","design":"tension_only_or_compression_strut"},"interface":{"gusset":"welded_gusset_plate_M16_M20_bolts"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":200.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'cross_bracing';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S355_UC_hot_rolled","density_kg_m3":7850,"mass_per_m_kg":{"152x152x23":23,"203x203x46":46}},"electrical":null,"thermal":{},"mechanical":{"function":"supports_gable_side_rails_and_wind_load","design":"propped_cantilever_or_simply_supported"},"interface":{"base":"pinned_base_plate","top":"slotted_connection_to_rafter_allows_deflection"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_tonne":1200.0,"lead_time_days":14,"common_suppliers":["Stock_section"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'gable_post';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_round_bar_threaded","density_kg_m3":7850,"typical_mass_kg_per_m":{"M12":0.89,"M16":1.58}},"electrical":null,"thermal":{},"mechanical":{"function":"prevents_lateral_sag_of_purlins","spacing":"mid_span_for_spans_over_6m"},"interface":{"fix":"threaded_through_purlin_web_with_nuts"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":3.0,"lead_time_days":3,"common_suppliers":["Stock_item"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'sag_rod';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_plate","density_kg_m3":7850,"typical_mass_kg":{"flush_457":10,"extended_457":15,"extended_533":20}},"electrical":null,"thermal":{},"mechanical":{"bolt_grade":"8.8","bolt_size":["M20","M24"],"moment_capacity_knm":{"6xM24_extended":450,"8xM24_extended":650},"design_per":"SCI_P398_Joints_in_Steel_Construction"},"interface":{"weld":"fillet_weld_to_beam_flanges_and_web"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":30.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'end_plate_connection';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_plate","density_kg_m3":7850,"typical_mass_kg":3},"electrical":null,"thermal":{},"mechanical":{"shear_capacity_kn":{"3xM20":220,"4xM20":300},"design":"SCI_P358_simple_connections"},"interface":{"weld":"fillet_weld_to_column_or_beam_web","bolts":"M16_M20_non_preloaded"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":12.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'fin_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_plate","density_kg_m3":7850,"typical_mass_kg":8},"electrical":null,"thermal":{},"mechanical":{"design":"moment_and_shear_splice_SCI_P398","bolt_grade":"8.8"},"interface":{"bolts":"preloaded_HSFG_or_non_preloaded"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":20.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'splice_plate';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"grade_8.8_galvanised","density_kg_m3":7850,"typical_mass_kg":{"M16x300":0.5,"M20x375":0.9,"M24x450":1.5,"M30x600":3.0}},"electrical":null,"thermal":{},"mechanical":{"type":["cast_in_L_bolt","cast_in_J_bolt","post_fixed_anchor"],"tension_capacity_kn":{"M16_8.8":88,"M20_8.8":137,"M24_8.8":198,"M30_8.8":314},"embedment":"15x_bolt_diameter_minimum","concrete_cone_breakout":"check_per_BS_EN_1992_4"},"interface":{"grout":"non_shrink_cementitious","template":"required_for_accuracy"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":5.0,"lead_time_days":3,"common_suppliers":["Ancon","Halfen","Lindapter"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'holding_down_bolt';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"S275_angle_or_plate","density_kg_m3":7850,"typical_mass_kg":1.5},"electrical":null,"thermal":{},"mechanical":{"fix":"2xM16_to_rafter_web","purlin_fix":"2xM16_through_purlin"},"interface":{"weld":"shop_welded_to_rafter_or_site_bolted"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":3.0,"lead_time_days":14,"common_suppliers":["Fabricator_supply"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'purlin_cleat';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_0.5_0.7mm_polyester_or_plastisol_coat","density_kg_m3":7850,"mass_per_m2_kg":{"0.5mm":4.5,"0.7mm":6.0}},"electrical":null,"thermal":{"u_value_composite_w_m2k":{"with_100mm_mineral_wool":0.35}},"mechanical":{"profile":{"TR32_1000":"32mm_rib_1000mm_cover","TR35_1000":"35mm_rib_1000mm_cover"},"span_m":{"0.5mm_single":[1.5,2.0],"0.7mm_single":[2.0,2.5]},"wind_uplift_kn_m2":[1.0,2.0]},"interface":{"fix":"tek_screw_5.5_or_6.3mm_with_EPDM_washer","lap":"one_corrugation_side_150mm_end"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":8.0,"lead_time_days":7,"common_suppliers":["Tata Steel","Kingspan","Corus","Steadmans"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'profiled_roof_sheet';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"steel_skins_PIR_or_mineral_wool_core","density_kg_m3":null,"mass_per_m2_kg":{"40mm_PIR":9,"60mm_PIR":10,"80mm_PIR":11,"100mm_PIR":12,"120mm_MW":18}},"electrical":null,"thermal":{"u_value_w_m2k":{"40mm_PIR":0.5,"60mm_PIR":0.35,"80mm_PIR":0.27,"100mm_PIR":0.22,"120mm_MW":0.27},"fire_rating":{"PIR":"LPS_1181_FM_approved","mineral_wool":"A1_non_combustible_BS_EN_13501"}},"mechanical":{"span_m":{"wall_80mm":[4,6],"roof_100mm":[3,5]},"secret_fix":true,"joint":"tongue_and_groove_weathertight"},"interface":{"fix_to_rail":"through_fix_or_secret_fix_bracket","seal":"factory_applied_mastic"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":30.0,"lead_time_days":21,"common_suppliers":["Kingspan","Tata Steel","Euroclad","CA Group"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'composite_panel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"GRP_glass_reinforced_polyester_3_layer","density_kg_m3":1800,"mass_per_m2_kg":3.5},"electrical":null,"thermal":{"u_value_w_m2k":{"single_skin":5.0,"triple_skin":2.5},"light_transmission_pct":[55,70]},"mechanical":{"profile":"matched_to_metal_roof_sheet","class_fragility":{"new":"Class_B_non_fragile_ACR_CP001","aged":"may_degrade_to_class_C"},"fire_rating":"BS_476_ext_SAA_or_ext_FAA"},"interface":{"fix":"same_as_metal_sheet","max_area_pct":"15pct_of_roof_area_typical"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m2":15.0,"lead_time_days":7,"common_suppliers":["Brett Martin","Ariel Plastics","Filon"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'rooflight_panel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_0.7mm_plastisol_coated","density_kg_m3":7850,"mass_per_m_kg":2.5},"electrical":null,"thermal":{},"mechanical":{"girth_mm":[350,450,600]},"interface":{"fix":"tek_screw_to_sheet_crest_at_450mm_centres","foam_filler":"profile_matched"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":5.0,"lead_time_days":5,"common_suppliers":["Same_as_cladding_supplier"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'ridge_flashing';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_slats_0.6_0.8mm","density_kg_m3":null,"typical_mass_kg":{"4x4.5m_single_skin":200,"5x5m_insulated":350}},"electrical":{"voltage_v":240,"motor_power_w":[370,750,1100],"control":"key_switch_remote_or_pull_chain"},"thermal":{"u_value_w_m2k":{"single_skin":7.0,"insulated_double":2.5}},"mechanical":{"wind_rating_class":{"1":"to_600Pa","2":"to_1200Pa","3":"to_2000Pa"},"cycle_rating":{"standard":25000,"high_usage":200000},"opening_speed_m_s":[0.15,0.3],"security":"LPS_1175_SR1_to_SR4"},"interface":{"guides":"galvanised_steel_U_channel","lintel":"structural_steel_or_RC","power":"13A_or_hardwired"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":2000.0,"lead_time_days":28,"common_suppliers":["Hormann","SWS","Gliderol","Aluroll"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'roller_shutter_door';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_skins_PU_foam_insulated_42mm","density_kg_m3":null,"typical_mass_kg":{"4x4.2m":250}},"electrical":{"voltage_v":240,"motor_power_w":[550,750],"control":"remote_keypad_loop"},"thermal":{"u_value_w_m2k":{"42mm_panel":1.2,"67mm_panel":0.8}},"mechanical":{"wind_rating_kpa":[1.0,2.0],"cycle_rating":{"standard":25000,"high_usage":100000},"spring_type":"torsion_spring_above_opening"},"interface":{"headroom_mm":{"standard_lift":350,"low_headroom":200},"side_room_mm":120}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":2500.0,"lead_time_days":28,"common_suppliers":["Hormann","Novoferm","Garador","Teckentrup"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'sectional_overhead_door';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_skin_PU_foam_core","density_kg_m3":null,"typical_mass_kg":40},"electrical":null,"thermal":{"u_value_w_m2k":1.5},"mechanical":{"security":"PAS_24_or_LPS_1175","fire_rating":{"FD30":30,"FD60":60,"FD120":120},"panic_hardware":"BS_EN_1125_push_bar_or_BS_EN_179_lever"},"interface":{"frame":"pressed_steel_sub_frame","closer":"overhead_door_closer_BS_EN_1154"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":500.0,"lead_time_days":14,"common_suppliers":["Metador","Sureclose","Lathams"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'personnel_door_steel';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_1.5_2.0mm_or_GRP_lined","density_kg_m3":7850,"mass_per_m_kg":{"600mm_1.5mm_steel":14}},"electrical":null,"thermal":{},"mechanical":{"design_rainfall_mm_hr":75,"fall_mm_per_m":[1,3],"overflow":"required_BS_EN_12056_3","width_mm":[450,600,750,900]},"interface":{"support":"valley_beam_or_rafter_connection","outlet":"100mm_150mm_round"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":40.0,"lead_time_days":14,"common_suppliers":["Fabricator_or_specialist"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'valley_gutter';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"galvanised_steel_or_aluminium","density_kg_m3":null,"mass_per_m_kg":{"75mm_steel":3,"100mm_steel":4.5,"150mm_steel":7}},"electrical":null,"thermal":{},"mechanical":{"flow_capacity_lps":{"75mm":3.5,"100mm":7.5,"150mm":20},"bracket_spacing_m":[2,3]},"interface":{"connection":"spigot_and_socket_or_ring_seal","outlet":"shoe_or_into_drain"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_m":15.0,"lead_time_days":7,"common_suppliers":["Lindab","Alumasc","Hargreaves"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'industrial_downpipe';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"carbon_steel_zinc_plated_or_stainless_A2_A4","density_kg_m3":7850,"mass_per_screw_g":{"5.5x32":5,"5.5x55":8,"5.5x65":10,"6.3x85":16}},"electrical":null,"thermal":{},"mechanical":{"pull_out_kn":{"into_1.5mm_steel":3.5,"into_2.0mm_steel":5.0},"pull_over_kn":{"16mm_washer":2.5},"shear_kn":{"5.5mm":3.0,"6.3mm":4.5},"washer":"16mm_EPDM_bonded_stainless_cap","drill_capacity_mm":{"5.5_light":[0.9,5.0],"6.3_heavy":[1.5,12.5]}},"interface":{"drive":"hex_8mm_or_10mm","spacing_mm":{"crest_fix":300,"trough_fix":200}}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp_per_100":8.0,"lead_time_days":1,"common_suppliers":["SFS","Ejot","BDN Fasteners","Swagefast"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'tek_screw';

UPDATE component_geometry_types SET
  physical_properties = '{"mass":{"material":"aluminium_frame_polycarbonate_dome_or_flat_glass","density_kg_m3":null,"typical_mass_kg":{"1.2x1.2m":45,"1.5x1.5m":60,"2.0x2.0m":80}},"electrical":{"voltage_v":240,"actuator":"pneumatic_CO2_or_electric_24V","fusible_link_temp_c":68,"control_panel":"BS_EN_12101_2_compliant"},"thermal":{"u_value_w_m2k":{"polycarbonate_triple":1.8,"flat_glass_double":1.4}},"mechanical":{"aerodynamic_free_area_m2":{"1.2x1.2m":1.0,"1.5x1.5m":1.6,"2.0x2.0m":2.8},"opening_angle_deg":[140,160],"wind_uplift_kpa":2.0,"opening_time_s":{"pneumatic":60,"electric":120},"design_standard":"BS_EN_12101_2_SHEVS","class":"SL500_or_SL750_snow_load"},"interface":{"kerb":"GRP_or_aluminium_upstand_min_150mm","fire_alarm":"linked_to_panel_zone_input","roof_opening":"builder_work_opening_with_kerb"}}'::jsonb,
  procurement = '{"typical_unit_cost_gbp":1500.0,"lead_time_days":28,"common_suppliers":["Bilco","Colt","Xtralite","Jet Cox"]}'::jsonb,
  data_source = 'training_estimate'
WHERE slug = 'smoke_vent';

