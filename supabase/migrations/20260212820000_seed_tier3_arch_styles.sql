-- ============================================================
-- ForgeOS Component Geometry Library — Tier 3: Architectural Styles
-- Migration: 20260212800000_seed_tier3_arch_styles
-- ============================================================
-- Seeds 30 domain-specific geometry types for UK architectural style
-- components across 8 periods: Georgian (6), Victorian (5), Tudor (4),
-- Arts & Crafts (3), Neo-Classical (3), Art Deco (3), Brutalist (2),
-- Contemporary (4).


-- 1. georgian_sash_window
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'georgian_sash_window',
    'Georgian Sash Window (6/6)',
    'domain',
    'georgian',
$CADQUERY$
def georgian_sash_window(params):
    """Georgian sash window (6-over-6 glazing bars)."""
    w = params.get("width", 1050.0)
    h = params.get("height", 1800.0)
    frame_w = params.get("frame_width", 70.0)
    glazing_bar = params.get("glazing_bar_width", 22.0)

    # Outer frame (box frame)
    outer = cq.Workplane("XY").box(w, frame_w, h)
    inner_cut = (cq.Workplane("XY")
                 .box(w - 2*frame_w, frame_w + 10, h - 2*frame_w))
    frame = outer.cut(inner_cut)
    # Meeting rail (horizontal, mid height)
    meeting = cq.Workplane("XY").box(w - 2*frame_w, frame_w * 0.6, 30)
    # Glazing bars (6-over-6: 2 vertical + 2 horizontal per sash)
    for sash_z in [-(h/4), h/4]:  # lower and upper sash
        sash_h = h/2 - frame_w - 15
        # Vertical bars (2, dividing into 3 panes)
        for vx in [-(w - 2*frame_w)/3, (w - 2*frame_w)/3]:
            vbar = (cq.Workplane("XY")
                    .transformed(offset=(vx * 0.5, 0, sash_z))
                    .box(glazing_bar, glazing_bar, sash_h))
            frame = frame.union(vbar)
        # Horizontal bars (2, dividing into 3 rows)
        for hz_off in [-sash_h/3, sash_h/3]:
            hbar = (cq.Workplane("XY")
                    .transformed(offset=(0, 0, sash_z + hz_off * 0.5))
                    .box(w - 2*frame_w, glazing_bar, glazing_bar))
            frame = frame.union(hbar)
    # Stone cill
    cill = (cq.Workplane("XY")
            .transformed(offset=(0, -20, -(h/2 + 15)))
            .box(w + 100, frame_w + 40, 30))
    return frame.union(meeting).union(cill)
$CADQUERY$,
    '{"width": {"type": "number", "default": 1050.0, "unit": "mm"}, "height": {"type": "number", "default": 1800.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,glass,Georgian}',
    '#F5F5DC',
    'Georgian sash window (6-over-6 glazing bars).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 2. georgian_fanlight
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'georgian_fanlight',
    'Georgian Fanlight',
    'domain',
    'georgian',
$CADQUERY$
def georgian_fanlight(params):
    """Georgian fanlight (semi-circular over door)."""
    w = params.get("width", 900.0)
    radius = w / 2
    depth = params.get("depth", 50.0)
    bar_w = params.get("bar_width", 18.0)

    # Semi-circular frame
    outer = (cq.Workplane("XZ")
             .transformed(offset=(0, 0, 0))
             .circle(radius).extrude(depth))
    # Cut to semicircle (remove bottom half)
    cut = (cq.Workplane("XZ")
           .transformed(offset=(0, -(radius + 1), 0))
           .box(w + 10, depth + 10, radius + 2))
    frame = outer.cut(cut)
    # Inner cutout (glazed area)
    inner = (cq.Workplane("XZ")
             .circle(radius - 25).extrude(depth + 2).translate((0, -1, 0)))
    inner_cut = (cq.Workplane("XZ")
                 .transformed(offset=(0, -(radius + 1), 0))
                 .box(w + 10, depth + 12, radius + 2))
    inner = inner.cut(inner_cut)
    frame = frame.cut(inner)
    # Radial glazing bars (typically 5-7 rays)
    rays = params.get("rays", 7)
    for i in range(rays):
        angle = 180.0 * i / (rays - 1)
        rad = math.radians(angle)
        ex = (radius - 30) * math.cos(rad)
        ez = (radius - 30) * math.sin(rad)
        bar_len = radius - 30
        bar = (cq.Workplane("XZ")
               .transformed(offset=(ex/2, 0, ez/2))
               .transformed(rotate=(0, -(angle - 90), 0))
               .box(bar_len, depth * 0.5, bar_w))
        frame = frame.union(bar)
    return frame
$CADQUERY$,
    '{"width": {"type": "number", "default": 900.0, "unit": "mm"}, "rays": {"type": "integer", "default": 7}}'::jsonb,
    '[]'::jsonb,
    '{timber,glass,Georgian}',
    '#F5F5DC',
    'Georgian fanlight (semi-circular over door).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 3. georgian_dentil_cornice
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'georgian_dentil_cornice',
    'Georgian Dentil Cornice',
    'domain',
    'georgian',
$CADQUERY$
def georgian_dentil_cornice(params):
    """Georgian dentil cornice (projecting moulding with tooth blocks)."""
    length = params.get("length", 3000.0)
    projection = params.get("projection", 200.0)
    height = params.get("height", 150.0)
    dentil_w = params.get("dentil_width", 30.0)
    dentil_gap = params.get("dentil_gap", 20.0)

    # Main corona (projecting flat)
    corona = (cq.Workplane("XY").workplane(offset=height)
              .box(length, projection, 25))
    # Bed mould (sloped underside)
    bed = (cq.Workplane("XY").workplane(offset=height - 30)
           .box(length, projection * 0.7, 20))
    # Dentil course
    dentil_count = int(length / (dentil_w + dentil_gap))
    dentil_band = None
    for i in range(min(dentil_count, 50)):
        dx = -(length/2 - dentil_w/2) + i * (dentil_w + dentil_gap)
        dentil = (cq.Workplane("XY").workplane(offset=height - 55)
                  .transformed(offset=(dx, -(projection * 0.15), 0))
                  .box(dentil_w, projection * 0.4, 25))
        dentil_band = dentil if dentil_band is None else dentil_band.union(dentil)
    # Frieze (plain band below)
    frieze = cq.Workplane("XY").box(length, 20, height - 60)
    result = corona.union(bed)
    if dentil_band:
        result = result.union(dentil_band)
    return result.union(frieze)
$CADQUERY$,
    '{"length": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{stone,plaster,Georgian}',
    '#F0E6D0',
    'Georgian dentil cornice (projecting moulding with tooth blocks).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 4. georgian_panelled_door
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'georgian_panelled_door',
    'Georgian 6-Panel Door',
    'domain',
    'georgian',
$CADQUERY$
def georgian_panelled_door(params):
    """Georgian 6-panel door with pilaster surround."""
    w = params.get("width", 900.0)
    h = params.get("height", 2100.0)
    t = params.get("thickness", 44.0)

    # Door leaf
    door = cq.Workplane("XY").box(w, t, h)
    # 6 panels (2 columns, 3 rows) — raised and fielded
    panel_w = (w - 120) / 2
    panel_heights = [h * 0.2, h * 0.3, h * 0.2]  # bottom, middle, top
    pz = -(h/2 - 60)
    for row, ph in enumerate(panel_heights):
        for col in [-1, 1]:
            px = col * (panel_w/2 + 15)
            # Recessed panel
            recess = (cq.Workplane("XY")
                      .transformed(offset=(px, -(t/2 + 2), pz + ph/2))
                      .box(panel_w - 10, 8, ph - 15))
            door = door.cut(recess)
            # Same on other side
            recess2 = (cq.Workplane("XY")
                       .transformed(offset=(px, (t/2 + 2), pz + ph/2))
                       .box(panel_w - 10, 8, ph - 15))
            door = door.cut(recess2)
        pz += ph + 30
    # Pilaster surround (2 columns + entablature)
    for side in [-1, 1]:
        pilaster = (cq.Workplane("XY")
                    .transformed(offset=(side * (w/2 + 35), 10, h/2))
                    .box(70, 40, h))
        door = door.union(pilaster)
    # Entablature
    entab = (cq.Workplane("XY")
             .transformed(offset=(0, 10, h + 30))
             .box(w + 140, 60, 60))
    return door.union(entab)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{timber,Georgian}',
    '#2F2F2F',
    'Georgian 6-panel door with pilaster surround.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 5. georgian_quoin
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'georgian_quoin',
    'Georgian Stone Quoin',
    'domain',
    'georgian',
$CADQUERY$
def georgian_quoin(params):
    """Stone quoin block (alternating long/short at corner)."""
    long_l = params.get("long_length", 400.0)
    short_l = params.get("short_length", 200.0)
    height = params.get("height", 225.0)
    depth = params.get("depth", 100.0)

    # Long quoin (header)
    long_q = cq.Workplane("XY").box(long_l, depth, height)
    # Chamfered edges (rusticated)
    for edge_x in [-(long_l/2 - 5), long_l/2 - 5]:
        for edge_z in [-(height/2 - 5), height/2 - 5]:
            chamfer = (cq.Workplane("XY")
                       .transformed(offset=(edge_x, -(depth/2), edge_z))
                       .box(12, 8, 12))
            long_q = long_q.cut(chamfer)
    return long_q
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{stone,Georgian}',
    '#D4C4A0',
    'Stone quoin block (alternating long/short at corner).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 6. georgian_iron_railing
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'georgian_iron_railing',
    'Georgian Wrought Iron Railing',
    'domain',
    'georgian',
$CADQUERY$
def georgian_iron_railing(params):
    """Wrought iron railing panel (with finials)."""
    width = params.get("width", 1200.0)
    height = params.get("height", 1050.0)
    bar_d = params.get("bar_diameter", 16.0)
    spacing = params.get("bar_spacing", 115.0)

    # Top rail
    top = (cq.Workplane("XY").workplane(offset=height)
           .box(width, 30, 25))
    # Bottom rail
    bot = cq.Workplane("XY").box(width, 30, 25)
    # Vertical bars
    bar_count = int(width / spacing)
    result = top.union(bot)
    for i in range(bar_count):
        bx = -(width/2 - spacing/2) + i * spacing
        bar = (cq.Workplane("XY")
               .transformed(offset=(bx, 0, height/2))
               .box(bar_d, bar_d, height))
        # Spear finial (simplified)
        finial = (cq.Workplane("XY").workplane(offset=height + 12)
                  .transformed(offset=(bx, 0, 0))
                  .box(bar_d + 4, bar_d + 4, 25))
        finial_top = (cq.Workplane("XY").workplane(offset=height + 37)
                      .transformed(offset=(bx, 0, 0))
                      .box(bar_d, bar_d, 15))
        result = result.union(bar).union(finial).union(finial_top)
    return result
$CADQUERY$,
    '{"width": {"type": "number", "default": 1200.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{iron,Georgian}',
    '#1C1C1C',
    'Wrought iron railing panel (with finials).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 7. victorian_bay_window
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'victorian_bay_window',
    'Victorian Canted Bay Window',
    'domain',
    'victorian',
$CADQUERY$
def victorian_bay_window(params):
    """Victorian canted bay window (3-sided)."""
    width = params.get("width", 2400.0)
    depth = params.get("depth", 600.0)
    height = params.get("height", 2400.0)
    sill_h = params.get("sill_height", 200.0)
    cant_angle = params.get("cant_degrees", 45.0)

    # Front panel
    front = (cq.Workplane("XY")
             .transformed(offset=(0, -(depth), height/2))
             .box(width * 0.5, 10, height))
    # Side panels (2, angled)
    for side in [-1, 1]:
        sx = side * width * 0.35
        panel = (cq.Workplane("XY")
                 .transformed(offset=(sx, -(depth * 0.5), height/2))
                 .transformed(rotate=(0, 0, side * cant_angle))
                 .box(depth * 0.8, 10, height))
        front = front.union(panel)
    # Base / corbel
    base = (cq.Workplane("XY")
            .transformed(offset=(0, -(depth * 0.5), -10))
            .box(width * 0.8, depth + 20, 20))
    # Roof (lead flat or pitched)
    roof = (cq.Workplane("XY")
            .transformed(offset=(0, -(depth * 0.5), height + 10))
            .box(width * 0.8 + 40, depth + 40, 20))
    # Window openings (3)
    for panel_x in [-width * 0.35, 0, width * 0.35]:
        opening = (cq.Workplane("XY")
                   .transformed(offset=(panel_x, -(depth * 0.7), height * 0.5))
                   .box(width * 0.2, 15, height * 0.6))
        front = front.cut(opening)
    return front.union(base).union(roof)
$CADQUERY$,
    '{"width": {"type": "number", "default": 2400.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,glass,Victorian}',
    '#F5F5DC',
    'Victorian canted bay window (3-sided).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 8. victorian_ridge_tile
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'victorian_ridge_tile',
    'Victorian Crested Ridge Tile',
    'domain',
    'victorian',
$CADQUERY$
def victorian_ridge_tile(params):
    """Decorative Victorian ridge tile (crested)."""
    length = params.get("length", 450.0)
    width = params.get("width", 250.0)
    height = params.get("height", 180.0)

    # Half-round base
    base = (cq.Workplane("XZ")
            .transformed(rotate=(0, 90, 0))
            .circle(width/2).extrude(length))
    # Cut flat bottom
    cut_bottom = (cq.Workplane("XY").workplane(offset=-(width/2 + 1))
                  .box(length + 2, width + 2, width))
    base = base.cut(cut_bottom)
    # Decorative crest (simplified pointed finials along ridge)
    crest_count = 3
    for i in range(crest_count):
        cx = -(length/3) + i * (length/3)
        crest = (cq.Workplane("XY").workplane(offset=width/2)
                 .transformed(offset=(cx, 0, 0))
                 .box(30, 15, height - width/2))
        # Pointed top
        point = (cq.Workplane("XY").workplane(offset=height - 10)
                 .transformed(offset=(cx, 0, 0))
                 .box(20, 10, 20))
        base = base.union(crest).union(point)
    return base
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{clay,Victorian}',
    '#8B4513',
    'Decorative Victorian ridge tile (crested).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 9. victorian_porch_column
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'victorian_porch_column',
    'Victorian Turned Porch Column',
    'domain',
    'victorian',
$CADQUERY$
def victorian_porch_column(params):
    """Turned timber porch column (lathe-turned profile)."""
    height = params.get("height", 2200.0)
    diameter = params.get("diameter", 100.0)

    # Base plinth (square)
    plinth = cq.Workplane("XY").box(diameter * 1.3, diameter * 1.3, height * 0.08)
    # Main shaft (circular)
    shaft = (cq.Workplane("XY").workplane(offset=height * 0.08)
             .circle(diameter/2).extrude(height * 0.7))
    # Necking ring (decorative band near top)
    neck = (cq.Workplane("XY").workplane(offset=height * 0.75)
            .circle(diameter/2 + 8).extrude(15))
    # Capital (flared top)
    capital = (cq.Workplane("XY").workplane(offset=height * 0.78)
               .circle(diameter/2).workplane(offset=height * 0.1)
               .circle(diameter * 0.7).loft())
    # Abacus (square cap)
    abacus = (cq.Workplane("XY").workplane(offset=height * 0.88)
              .box(diameter * 1.4, diameter * 1.4, height * 0.04))
    return plinth.union(shaft).union(neck).union(capital).union(abacus)
$CADQUERY$,
    '{"height": {"type": "number", "default": 2200.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,Victorian}',
    '#F5F5DC',
    'Turned timber porch column (lathe-turned profile).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 10. victorian_bargeboard
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'victorian_bargeboard',
    'Victorian Ornate Bargeboard',
    'domain',
    'victorian',
$CADQUERY$
def victorian_bargeboard(params):
    """Ornate Victorian bargeboard (decorative gable trim)."""
    length = params.get("length", 2500.0)
    depth = params.get("depth", 250.0)
    t = params.get("thickness", 25.0)

    # Main board
    board = cq.Workplane("XY").box(length, t, depth)
    # Scalloped bottom edge (simplified as repeating cutouts)
    scallop_count = int(length / 120)
    for i in range(min(scallop_count, 20)):
        sx = -(length/2 - 60) + i * 120
        scallop = (cq.Workplane("XY")
                   .transformed(offset=(sx, 0, -(depth/2 + 15)))
                   .circle(40).extrude(t + 2).translate((0, -(t/2 + 1), 0)))
        board = board.cut(scallop)
    # Pendant (drop finial at apex)
    pendant = (cq.Workplane("XY")
               .transformed(offset=(0, -(t/2 + 10), -(depth/2 + 30)))
               .box(30, 20, 60))
    return board.union(pendant)
$CADQUERY$,
    '{"length": {"type": "number", "default": 2500.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{timber,Victorian}',
    '#F5F5DC',
    'Ornate Victorian bargeboard (decorative gable trim).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 11. victorian_tile_hanging
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'victorian_tile_hanging',
    'Victorian Decorative Tile Hanging',
    'domain',
    'victorian',
$CADQUERY$
def victorian_tile_hanging(params):
    """Decorative tile hanging panel (clay plain tiles)."""
    width = params.get("width", 600.0)
    height = params.get("height", 600.0)
    tile_w = params.get("tile_width", 165.0)
    tile_h_exposed = params.get("tile_exposure", 100.0)
    tile_t = params.get("tile_thickness", 12.0)
    profile = params.get("profile", "plain")  # plain, scallop, club

    rows = int(height / tile_h_exposed)
    cols = int(width / tile_w) + 1
    result = None
    for r in range(min(rows, 6)):
        for c in range(min(cols, 4)):
            tx = -(width/2 - tile_w/2) + c * tile_w + (r % 2) * (tile_w/2)  # staggered
            tz = -(height/2 - tile_h_exposed/2) + r * tile_h_exposed
            tile = (cq.Workplane("XY")
                    .transformed(offset=(tx, -(r * 0.5), tz))
                    .box(tile_w, tile_t, tile_h_exposed + 65))
            result = tile if result is None else result.union(tile)
    return result
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{clay,Victorian}',
    '#A0522D',
    'Decorative tile hanging panel (clay plain tiles).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 12. tudor_half_timber
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tudor_half_timber',
    'Tudor Half-Timber Frame Panel',
    'domain',
    'tudor',
$CADQUERY$
def tudor_half_timber(params):
    """Tudor exposed half-timber frame (oak)."""
    width = params.get("width", 3000.0)
    height = params.get("height", 2700.0)
    timber_w = params.get("timber_width", 150.0)
    timber_d = params.get("timber_depth", 100.0)

    # Vertical posts (3: 2 ends + 1 centre)
    result = None
    for px in [-(width/2 - timber_w/2), 0, width/2 - timber_w/2]:
        post = (cq.Workplane("XY")
                .transformed(offset=(px, 0, height/2))
                .box(timber_w, timber_d, height))
        result = post if result is None else result.union(post)
    # Top rail
    top = (cq.Workplane("XY")
           .transformed(offset=(0, 0, height - timber_w/2))
           .box(width, timber_d, timber_w))
    # Bottom rail
    bot = (cq.Workplane("XY")
           .transformed(offset=(0, 0, timber_w/2))
           .box(width, timber_d, timber_w))
    # Mid rail
    mid = (cq.Workplane("XY")
           .transformed(offset=(0, 0, height * 0.45))
           .box(width, timber_d, timber_w))
    # Diagonal braces (St Andrew's cross in each panel)
    for panel_x in [-(width/4), width/4]:
        panel_w = width/2 - timber_w
        panel_h = height - 2 * timber_w
        diag = math.sqrt(panel_w**2 + (panel_h/2)**2)
        angle = math.degrees(math.atan2(panel_h/2, panel_w))
        brace = (cq.Workplane("XY")
                 .transformed(offset=(panel_x, 0, height * 0.5))
                 .transformed(rotate=(0, angle, 0))
                 .box(diag * 0.8, timber_d * 0.6, timber_w * 0.6))
        result = result.union(brace)
    return result.union(top).union(bot).union(mid)
$CADQUERY$,
    '{"width": {"type": "number", "default": 3000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{oak,Tudor}',
    '#5C3317',
    'Tudor exposed half-timber frame (oak).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 13. tudor_herringbone_brick
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tudor_herringbone_brick',
    'Tudor Herringbone Brick Nogging',
    'domain',
    'tudor',
$CADQUERY$
def tudor_herringbone_brick(params):
    """Tudor herringbone brick nogging (infill between timbers)."""
    width = params.get("width", 600.0)
    height = params.get("height", 600.0)
    brick_l = params.get("brick_length", 215.0)
    brick_h = params.get("brick_height", 65.0)
    brick_d = params.get("brick_depth", 102.5)

    # Simplified: create angled brick pattern
    result = None
    rows = int(height / (brick_h + 10))
    for r in range(min(rows, 8)):
        for c in range(3):
            bx = -(width/3) + c * (width/3)
            bz = -(height/2 - brick_h) + r * (brick_h + 10)
            angle = 45 if (r + c) % 2 == 0 else -45
            brick = (cq.Workplane("XY")
                     .transformed(offset=(bx, 0, bz))
                     .transformed(rotate=(0, angle, 0))
                     .box(brick_l, brick_d, brick_h))
            result = brick if result is None else result.union(brick)
    return result
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{brick,Tudor}',
    '#8B4513',
    'Tudor herringbone brick nogging (infill between timbers).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 14. tudor_mullioned_window
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tudor_mullioned_window',
    'Tudor Stone Mullioned Window',
    'domain',
    'tudor',
$CADQUERY$
def tudor_mullioned_window(params):
    """Tudor stone mullioned window (2 or 3 lights)."""
    lights = params.get("lights", 3)
    light_w = params.get("light_width", 350.0)
    h = params.get("height", 900.0)
    mullion_w = params.get("mullion_width", 80.0)
    surround_w = params.get("surround_width", 100.0)
    depth = params.get("depth", 100.0)

    total_w = lights * light_w + (lights - 1) * mullion_w + 2 * surround_w
    # Surround (stone frame)
    outer = cq.Workplane("XY").box(total_w, depth, h + 2*surround_w)
    inner_w = lights * light_w + (lights - 1) * mullion_w
    inner = (cq.Workplane("XY")
             .box(inner_w, depth + 10, h))
    frame = outer.cut(inner)
    # Mullions
    for m in range(lights - 1):
        mx = -(inner_w/2 - light_w) + m * (light_w + mullion_w) + light_w/2
        mullion = (cq.Workplane("XY")
                   .transformed(offset=(mx, 0, 0))
                   .box(mullion_w, depth, h))
        frame = frame.union(mullion)
    # Transom (horizontal bar at 2/3 height)
    transom = (cq.Workplane("XY")
               .transformed(offset=(0, 0, h * 0.15))
               .box(inner_w, depth, mullion_w * 0.7))
    # Hood mould (label mould) above
    hood = (cq.Workplane("XY")
            .transformed(offset=(0, -(depth/2 + 10), h/2 + surround_w + 20))
            .box(total_w + 40, 20, 30))
    return frame.union(transom).union(hood)
$CADQUERY$,
    '{"lights": {"type": "integer", "default": 3, "enum": [2, 3, 4, 5]}}'::jsonb,
    '[]'::jsonb,
    '{stone,glass,Tudor}',
    '#D4C4A0',
    'Tudor stone mullioned window (2 or 3 lights).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 15. tudor_chimney_stack
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tudor_chimney_stack',
    'Tudor Decorated Chimney Stack',
    'domain',
    'tudor',
$CADQUERY$
def tudor_chimney_stack(params):
    """Tudor massive chimney stack with decorative pots."""
    width = params.get("width", 900.0)
    depth = params.get("depth", 600.0)
    height = params.get("height", 3000.0)
    flues = params.get("flues", 3)

    # Main shaft (brick)
    shaft = cq.Workplane("XY").box(width, depth, height)
    # Decorative string courses (3 projecting bands)
    for bz in [height * 0.3, height * 0.6, height * 0.85]:
        band = (cq.Workplane("XY")
                .transformed(offset=(0, 0, bz))
                .box(width + 30, depth + 30, 30))
        shaft = shaft.union(band)
    # Chimney pots (octagonal, ornate)
    pot_spacing = width / (flues + 1)
    for i in range(flues):
        px = -(width/2 - pot_spacing) + i * pot_spacing
        pot = (cq.Workplane("XY").workplane(offset=height)
               .transformed(offset=(px, 0, 0))
               .polygon(8, 120).extrude(250))
        # Rolled top
        roll = (cq.Workplane("XY").workplane(offset=height + 250)
                .transformed(offset=(px, 0, 0))
                .circle(70).extrude(30))
        shaft = shaft.union(pot).union(roll)
    return shaft
$CADQUERY$,
    '{"flues": {"type": "integer", "default": 3}}'::jsonb,
    '[]'::jsonb,
    '{brick,Tudor}',
    '#8B4513',
    'Tudor massive chimney stack with decorative pots.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 16. ac_catslide_dormer
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ac_catslide_dormer',
    'Arts & Crafts Catslide Dormer',
    'domain',
    'arts_crafts',
$CADQUERY$
def ac_catslide_dormer(params):
    """Arts & Crafts catslide dormer (long swept roof)."""
    width = params.get("width", 1200.0)
    height = params.get("height", 1500.0)
    depth = params.get("depth", 800.0)

    # Front face (with window opening)
    front = (cq.Workplane("XY")
             .transformed(offset=(0, -(depth/2), height * 0.4))
             .box(width, 20, height * 0.8))
    # Window opening
    window = (cq.Workplane("XY")
              .transformed(offset=(0, -(depth/2), height * 0.45))
              .box(width * 0.6, 30, height * 0.45))
    front = front.cut(window)
    # Side cheeks (2)
    for side in [-1, 1]:
        cheek = (cq.Workplane("XY")
                 .transformed(offset=(side * width/2, 0, height * 0.4))
                 .box(20, depth, height * 0.8))
        front = front.union(cheek)
    # Catslide roof (long slope)
    roof = (cq.Workplane("XY")
            .transformed(offset=(0, depth * 0.2, height * 0.85))
            .transformed(rotate=(15, 0, 0))
            .box(width + 40, depth * 1.5, 20))
    return front.union(roof)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{timber,tile,Arts_Crafts}',
    '#8B7355',
    'Arts & Crafts catslide dormer (long swept roof).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 17. ac_inglenook_surround
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ac_inglenook_surround',
    'Arts & Crafts Inglenook Surround',
    'domain',
    'arts_crafts',
$CADQUERY$
def ac_inglenook_surround(params):
    """Arts & Crafts inglenook fireplace surround."""
    width = params.get("width", 1800.0)
    height = params.get("height", 1500.0)
    depth = params.get("depth", 600.0)
    opening_w = params.get("opening_width", 1200.0)
    opening_h = params.get("opening_height", 1000.0)

    # Main surround (stone or brick)
    surround = cq.Workplane("XY").box(width, depth, height)
    # Fire opening
    opening = (cq.Workplane("XY")
               .transformed(offset=(0, -(depth/2 + 5), -(height/2 - opening_h/2)))
               .box(opening_w, depth + 10, opening_h))
    surround = surround.cut(opening)
    # Oak beam lintel
    beam = (cq.Workplane("XY")
            .transformed(offset=(0, -(depth/3), opening_h/2 - height/2 + 75))
            .box(width + 100, 200, 150))
    # Bench seats (2, inside recess)
    for side in [-1, 1]:
        seat = (cq.Workplane("XY")
                .transformed(offset=(side * (opening_w/2 + 100), -(depth/4), -(height/2 - 200)))
                .box(200, depth * 0.5, 50))
        surround = surround.union(seat)
    return surround.union(beam)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{stone,oak,Arts_Crafts}',
    '#808080',
    'Arts & Crafts inglenook fireplace surround.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 18. ac_leaded_casement
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'ac_leaded_casement',
    'Arts & Crafts Leaded Casement',
    'domain',
    'arts_crafts',
$CADQUERY$
def ac_leaded_casement(params):
    """Arts & Crafts leaded light casement window."""
    w = params.get("width", 600.0)
    h = params.get("height", 900.0)
    lead_pitch = params.get("lead_pitch", 80.0)

    # Timber frame
    outer = cq.Workplane("XY").box(w, 55, h)
    inner = cq.Workplane("XY").box(w - 80, 60, h - 80)
    frame = outer.cut(inner)
    # Leaded lights (diamond pattern — horizontal leads)
    leads_h = int(h / lead_pitch)
    for i in range(min(leads_h, 10)):
        lz = -(h/2 - 50) + i * lead_pitch
        lead = (cq.Workplane("XY")
                .transformed(offset=(0, 0, lz))
                .box(w - 90, 6, 4))
        frame = frame.union(lead)
    # Vertical leads
    leads_v = int(w / lead_pitch)
    for i in range(min(leads_v, 7)):
        lx = -(w/2 - 50) + i * lead_pitch
        lead = (cq.Workplane("XY")
                .transformed(offset=(lx, 0, 0))
                .box(4, 6, h - 90))
        frame = frame.union(lead)
    # Iron casement stay
    stay = (cq.Workplane("XY")
            .transformed(offset=(w * 0.2, -(30), -(h * 0.15)))
            .box(150, 8, 6))
    return frame.union(stay)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{timber,lead,glass,Arts_Crafts}',
    '#8B7355',
    'Arts & Crafts leaded light casement window.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 19. classical_column
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'classical_column',
    'Classical Column (Doric/Ionic/Corinthian)',
    'domain',
    'neo_classical',
$CADQUERY$
def classical_column(params):
    """Classical column (Doric, Ionic, or Corinthian)."""
    height = params.get("height", 3000.0)
    diameter = params.get("diameter", 300.0)
    order = params.get("order", "Doric")

    # Base (Attic base for Ionic/Corinthian)
    base_h = diameter * 0.5
    if order != "Doric":
        base = cq.Workplane("XY").circle(diameter * 0.55).extrude(base_h * 0.3)
        torus = (cq.Workplane("XY").workplane(offset=base_h * 0.3)
                 .circle(diameter * 0.5).extrude(base_h * 0.2))
        scotia = (cq.Workplane("XY").workplane(offset=base_h * 0.5)
                  .circle(diameter * 0.45).extrude(base_h * 0.5))
        base = base.union(torus).union(scotia)
    else:
        base = cq.Workplane("XY").circle(diameter * 0.55).extrude(base_h * 0.5)
    # Shaft (with entasis — slight taper)
    shaft_h = height - base_h - diameter * 1.2
    shaft = (cq.Workplane("XY").workplane(offset=base_h)
             .circle(diameter/2).workplane(offset=shaft_h)
             .circle(diameter * 0.42).loft())
    # Capital
    cap_h = diameter * 0.7
    if order == "Doric":
        echinus = (cq.Workplane("XY").workplane(offset=height - cap_h)
                   .circle(diameter * 0.42).workplane(offset=cap_h * 0.6)
                   .circle(diameter * 0.55).loft())
        abacus = (cq.Workplane("XY").workplane(offset=height - cap_h * 0.4)
                  .box(diameter * 1.1, diameter * 1.1, cap_h * 0.4))
        base = base.union(echinus).union(abacus)
    elif order == "Ionic":
        echinus = (cq.Workplane("XY").workplane(offset=height - cap_h)
                   .circle(diameter * 0.42).workplane(offset=cap_h * 0.5)
                   .circle(diameter * 0.5).loft())
        # Volute scrolls (simplified as boxes)
        for side in [-1, 1]:
            volute = (cq.Workplane("XY").workplane(offset=height - cap_h * 0.3)
                      .transformed(offset=(side * diameter * 0.5, 0, 0))
                      .circle(diameter * 0.2).extrude(cap_h * 0.3))
            base = base.union(volute)
        abacus = (cq.Workplane("XY").workplane(offset=height - cap_h * 0.15)
                  .box(diameter * 1.2, diameter * 0.8, cap_h * 0.15))
        base = base.union(echinus).union(abacus)
    else:  # Corinthian
        bell = (cq.Workplane("XY").workplane(offset=height - cap_h)
                .circle(diameter * 0.42).workplane(offset=cap_h * 0.8)
                .circle(diameter * 0.55).loft())
        abacus = (cq.Workplane("XY").workplane(offset=height - cap_h * 0.2)
                  .box(diameter * 1.2, diameter * 1.2, cap_h * 0.2))
        base = base.union(bell).union(abacus)
    return base.union(shaft)
$CADQUERY$,
    '{"height": {"type": "number", "default": 3000.0, "unit": "mm"}, "order": {"type": "string", "default": "Doric", "enum": ["Doric", "Ionic", "Corinthian"]}}'::jsonb,
    '[]'::jsonb,
    '{stone,Classical}',
    '#F0E6D0',
    'Classical column (Doric, Ionic, or Corinthian).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 20. classical_pediment
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'classical_pediment',
    'Classical Pediment',
    'domain',
    'neo_classical',
$CADQUERY$
def classical_pediment(params):
    """Classical pediment (triangular or segmental)."""
    width = params.get("width", 4000.0)
    height = params.get("height", 800.0)
    depth = params.get("depth", 200.0)
    pediment_type = params.get("type", "triangular")

    if pediment_type == "triangular":
        # Tympanum (triangle)
        tympanum = (cq.Workplane("XZ")
                    .moveTo(-(width/2), 0)
                    .lineTo(0, height)
                    .lineTo(width/2, 0)
                    .close()
                    .extrude(depth))
    else:
        # Segmental (arc)
        tympanum = (cq.Workplane("XY")
                    .box(width, depth, height * 0.7))
    # Cornice (raking, on sloped edges)
    cornice_base = (cq.Workplane("XY").workplane(offset=-20)
                    .box(width + 60, depth + 40, 20))
    return tympanum.union(cornice_base)
$CADQUERY$,
    '{"type": {"type": "string", "default": "triangular", "enum": ["triangular", "segmental"]}}'::jsonb,
    '[]'::jsonb,
    '{stone,Classical}',
    '#F0E6D0',
    'Classical pediment (triangular or segmental).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 21. classical_balustrade
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'classical_balustrade',
    'Classical Balustrade',
    'domain',
    'neo_classical',
$CADQUERY$
def classical_balustrade(params):
    """Balustrade with turned balusters."""
    length = params.get("length", 2000.0)
    height = params.get("height", 900.0)
    baluster_d = params.get("baluster_diameter", 60.0)
    spacing = params.get("baluster_spacing", 130.0)

    # Top rail
    top = (cq.Workplane("XY").workplane(offset=height)
           .box(length, baluster_d * 1.5, baluster_d))
    # Bottom rail / plinth
    plinth = cq.Workplane("XY").box(length, baluster_d * 1.5, baluster_d * 0.8)
    # Balusters
    count = int(length / spacing)
    result = top.union(plinth)
    for i in range(count):
        bx = -(length/2 - spacing/2) + i * spacing
        # Vase-shaped baluster (simplified as cylinder with bulge)
        shaft = (cq.Workplane("XY").workplane(offset=baluster_d * 0.8)
                 .transformed(offset=(bx, 0, 0))
                 .circle(baluster_d/2 * 0.4).extrude(height - 2 * baluster_d))
        # Belly (wider middle)
        belly = (cq.Workplane("XY").workplane(offset=height * 0.4)
                 .transformed(offset=(bx, 0, 0))
                 .circle(baluster_d/2).extrude(height * 0.2))
        result = result.union(shaft).union(belly)
    return result
$CADQUERY$,
    '{"length": {"type": "number", "default": 2000.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{stone,Classical}',
    '#F0E6D0',
    'Balustrade with turned balusters.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 22. deco_crittall_window
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'deco_crittall_window',
    'Art Deco Crittall Steel Window',
    'domain',
    'art_deco',
$CADQUERY$
def deco_crittall_window(params):
    """Art Deco Crittall steel window (multi-pane)."""
    w = params.get("width", 1200.0)
    h = params.get("height", 1500.0)
    bar_w = params.get("bar_width", 25.0)
    cols = params.get("columns", 3)
    rows = params.get("rows", 4)

    # Outer frame (slim steel)
    outer = cq.Workplane("XY").box(w, bar_w, h)
    inner = cq.Workplane("XY").box(w - 2*bar_w, bar_w + 10, h - 2*bar_w)
    frame = outer.cut(inner)
    # Grid bars
    pane_w = (w - (cols + 1) * bar_w) / cols
    pane_h = (h - (rows + 1) * bar_w) / rows
    for c in range(cols - 1):
        bx = -(w/2 - bar_w) + (c + 1) * (pane_w + bar_w)
        vbar = (cq.Workplane("XY")
                .transformed(offset=(bx, 0, 0))
                .box(bar_w, bar_w, h - 2*bar_w))
        frame = frame.union(vbar)
    for r in range(rows - 1):
        bz = -(h/2 - bar_w) + (r + 1) * (pane_h + bar_w)
        hbar = (cq.Workplane("XY")
                .transformed(offset=(0, 0, bz))
                .box(w - 2*bar_w, bar_w, bar_w))
        frame = frame.union(hbar)
    return frame
$CADQUERY$,
    '{"columns": {"type": "integer", "default": 3}, "rows": {"type": "integer", "default": 4}}'::jsonb,
    '[]'::jsonb,
    '{steel,glass,Art_Deco}',
    '#2F2F2F',
    'Art Deco Crittall steel window (multi-pane).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 23. deco_sunburst_panel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'deco_sunburst_panel',
    'Art Deco Sunburst Panel',
    'domain',
    'art_deco',
$CADQUERY$
def deco_sunburst_panel(params):
    """Art Deco sunburst / sunrise decorative panel."""
    width = params.get("width", 800.0)
    height = params.get("height", 400.0)
    t = params.get("thickness", 20.0)
    rays = params.get("rays", 11)

    # Semi-circle base
    base = (cq.Workplane("XZ")
            .circle(width/2).extrude(t))
    cut = (cq.Workplane("XZ")
           .transformed(offset=(0, 0, -(width/2 + 1)))
           .box(width + 10, t + 10, width + 2))
    base = base.cut(cut)
    # Rays (radiating from centre bottom)
    for i in range(rays):
        angle = 180.0 * i / (rays - 1)
        rad = math.radians(angle)
        ray_len = width * 0.4
        ex = ray_len * math.cos(rad) / 2
        ez = ray_len * math.sin(rad) / 2
        ray = (cq.Workplane("XZ")
               .transformed(offset=(ex, 0, ez))
               .transformed(rotate=(0, -(angle - 90), 0))
               .box(ray_len, t * 0.6, 12))
        base = base.union(ray)
    return base
$CADQUERY$,
    '{"rays": {"type": "integer", "default": 11}}'::jsonb,
    '[]'::jsonb,
    '{metal,Art_Deco}',
    '#FFD700',
    'Art Deco sunburst / sunrise decorative panel.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 24. deco_stepped_parapet
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'deco_stepped_parapet',
    'Art Deco Stepped Parapet',
    'domain',
    'art_deco',
$CADQUERY$
def deco_stepped_parapet(params):
    """Art Deco stepped parapet (ziggurat profile)."""
    width = params.get("width", 3000.0)
    base_h = params.get("base_height", 600.0)
    steps = params.get("steps", 3)
    step_h = params.get("step_height", 200.0)
    step_w = params.get("step_width", 300.0)
    t = params.get("thickness", 200.0)

    # Base parapet wall
    result = cq.Workplane("XY").box(width, t, base_h)
    # Stepped centre (ziggurat)
    for s in range(steps):
        sw = width * 0.4 - s * step_w
        sh = base_h + (s + 1) * step_h
        step = (cq.Workplane("XY")
                .transformed(offset=(0, 0, sh/2))
                .box(max(sw, step_w), t, sh))
        result = result.union(step)
    return result
$CADQUERY$,
    '{"steps": {"type": "integer", "default": 3}}'::jsonb,
    '[]'::jsonb,
    '{concrete,Art_Deco}',
    '#F0E6D0',
    'Art Deco stepped parapet (ziggurat profile).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 25. brise_soleil
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'brise_soleil',
    'Brise-Soleil (Sun Shading)',
    'domain',
    'brutalist',
$CADQUERY$
def brise_soleil(params):
    """Concrete or metal brise-soleil (sun shading fins)."""
    width = params.get("width", 3000.0)
    height = params.get("height", 1500.0)
    fin_count = params.get("fin_count", 8)
    fin_depth = params.get("fin_depth", 300.0)
    fin_t = params.get("fin_thickness", 30.0)

    fin_spacing = height / fin_count
    result = None
    for i in range(fin_count):
        fz = -(height/2 - fin_spacing/2) + i * fin_spacing
        fin = (cq.Workplane("XY")
               .transformed(offset=(0, -(fin_depth/2), fz))
               .box(width, fin_depth, fin_t))
        result = fin if result is None else result.union(fin)
    # End brackets (2 vertical supports)
    for side in [-1, 1]:
        bracket = (cq.Workplane("XY")
                   .transformed(offset=(side * (width/2 + 15), -(fin_depth/4), 0))
                   .box(30, fin_depth/2, height))
        result = result.union(bracket)
    return result
$CADQUERY$,
    '{"fin_count": {"type": "integer", "default": 8}}'::jsonb,
    '[]'::jsonb,
    '{concrete,aluminium,Modernist}',
    '#808080',
    'Concrete or metal brise-soleil (sun shading fins).',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 26. brutalist_balcony
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'brutalist_balcony',
    'Cantilevered Concrete Balcony',
    'domain',
    'brutalist',
$CADQUERY$
def brutalist_balcony(params):
    """Cantilevered concrete balcony slab."""
    width = params.get("width", 3000.0)
    depth = params.get("depth", 1500.0)
    slab_t = params.get("slab_thickness", 200.0)

    # Slab
    slab = cq.Workplane("XY").box(width, depth, slab_t)
    # Drip edge (underside groove)
    drip = (cq.Workplane("XY")
            .transformed(offset=(0, -(depth/2 - 30), -(slab_t/2 + 3)))
            .box(width - 20, 10, 6))
    slab = slab.cut(drip)
    # Upstand (balcony edge wall)
    upstand = (cq.Workplane("XY")
               .transformed(offset=(0, -(depth/2 - 50), slab_t/2 + 500))
               .box(width, 100, 1000))
    # Board-marked texture on upstand face (simplified grooves)
    for gz in range(5):
        groove = (cq.Workplane("XY")
                  .transformed(offset=(0, -(depth/2 + 5), slab_t/2 + 200 + gz * 200))
                  .box(width + 2, 3, 3))
        upstand = upstand.cut(groove)
    return slab.union(upstand)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{concrete,Brutalist}',
    '#A0A0A0',
    'Cantilevered concrete balcony slab.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 27. zinc_standing_seam_panel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'zinc_standing_seam_panel',
    'Zinc Standing Seam Panel',
    'domain',
    'contemporary',
$CADQUERY$
def zinc_standing_seam_panel(params):
    """Zinc standing seam cladding panel."""
    length = params.get("length", 3000.0)
    width = params.get("panel_width", 430.0)
    t = params.get("thickness", 0.7)
    seam_h = params.get("seam_height", 25.0)

    # Flat pan
    pan = cq.Workplane("XY").box(width, t, length)
    # Standing seams (both edges)
    for side in [-1, 1]:
        seam = (cq.Workplane("XY")
                .transformed(offset=(side * (width/2), 0, 0))
                .box(t, seam_h, length))
        fold = (cq.Workplane("XY")
                .transformed(offset=(side * (width/2 + 5), seam_h - t/2, 0))
                .box(10, t, length))
        pan = pan.union(seam).union(fold)
    return pan
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{zinc,Contemporary}',
    '#A0B0C0',
    'Zinc standing seam cladding panel.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 28. frameless_glass_balustrade
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'frameless_glass_balustrade',
    'Frameless Glass Balustrade',
    'domain',
    'contemporary',
$CADQUERY$
def frameless_glass_balustrade(params):
    """Frameless structural glass balustrade."""
    width = params.get("width", 1500.0)
    height = params.get("height", 1100.0)
    glass_t = params.get("glass_thickness", 21.5)  # 10+1.52+10 laminated
    channel_h = params.get("channel_height", 100.0)

    # Glass panel
    glass = (cq.Workplane("XY")
             .transformed(offset=(0, 0, height/2 + channel_h))
             .box(width, glass_t, height))
    # Base channel (aluminium U-channel)
    channel = (cq.Workplane("XY")
               .transformed(offset=(0, 0, channel_h/2))
               .box(width + 20, glass_t + 30, channel_h))
    channel_slot = (cq.Workplane("XY")
                    .transformed(offset=(0, 0, channel_h/2 + 5))
                    .box(width + 22, glass_t + 5, channel_h))
    channel = channel.cut(channel_slot)
    # Handrail (circular stainless on top)
    rail = (cq.Workplane("XY")
            .transformed(offset=(0, 0, height + channel_h + 25))
            .transformed(rotate=(0, 90, 0))
            .circle(20).extrude(width).translate((-(width/2), 0, 0)))
    return glass.union(channel).union(rail)
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{glass,stainless,Contemporary}',
    '#E0F0FF',
    'Frameless structural glass balustrade.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 29. corten_panel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'corten_panel',
    'Corten Steel Cladding Panel',
    'domain',
    'contemporary',
$CADQUERY$
def corten_panel(params):
    """Corten (weathering) steel cladding panel."""
    width = params.get("width", 1200.0)
    height = params.get("height", 600.0)
    t = params.get("thickness", 3.0)

    panel = cq.Workplane("XY").box(width, t, height)
    # Folded edges (4 sides)
    for side_x in [-1, 1]:
        fold = (cq.Workplane("XY")
                .transformed(offset=(side_x * (width/2), 15, 0))
                .box(t, 30, height))
        panel = panel.union(fold)
    for side_z in [-1, 1]:
        fold = (cq.Workplane("XY")
                .transformed(offset=(0, 15, side_z * (height/2)))
                .box(width, 30, t))
        panel = panel.union(fold)
    # Secret fix brackets (2 rear)
    for bz in [-(height/4), height/4]:
        bracket = (cq.Workplane("XY")
                   .transformed(offset=(0, 25, bz))
                   .box(60, 20, 40))
        panel = panel.union(bracket)
    return panel
$CADQUERY$,
    '{}'::jsonb,
    '[]'::jsonb,
    '{corten,Contemporary}',
    '#8B4513',
    'Corten (weathering) steel cladding panel.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 30. perforated_metal_screen
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'perforated_metal_screen',
    'Perforated Metal Screen',
    'domain',
    'contemporary',
$CADQUERY$
def perforated_metal_screen(params):
    """Perforated metal screen / brise-soleil panel."""
    width = params.get("width", 1500.0)
    height = params.get("height", 3000.0)
    t = params.get("thickness", 3.0)
    hole_d = params.get("hole_diameter", 20.0)
    pitch = params.get("hole_pitch", 30.0)

    panel = cq.Workplane("XY").box(width, t, height)
    # Perforations (limited for performance)
    cols = min(int(width / pitch), 12)
    rows = min(int(height / pitch), 15)
    for c in range(cols):
        for r in range(rows):
            hx = -(width/2 - pitch) + c * pitch
            hz = -(height/2 - pitch) + r * pitch
            hole = (cq.Workplane("XY")
                    .transformed(offset=(hx, 0, hz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(hole_d/2).extrude(t + 4).translate((0, -(t/2 + 2), 0)))
            panel = panel.cut(hole)
    return panel
$CADQUERY$,
    '{"hole_diameter": {"type": "number", "default": 20.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{aluminium,Contemporary}',
    '#C0C0C0',
    'Perforated metal screen / brise-soleil panel.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- ============================================================
-- PHYSICAL PROPERTIES + PROCUREMENT ENRICHMENT
-- ============================================================


UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "softwood_or_hardwood_frame_float_glass", "density_kg_m3": null, "typical_mass_kg": {"1050x1800_6o6": 45, "900x1500_6o6": 35}}, "electrical": null, "thermal": {"U_value_w_m2k": {"single_glazed_original": 4.8, "slim_double_glazed_retrofit": 1.4}, "draft_proofing": "perimeter_brush_or_compression_seal"}, "mechanical": {"glazing_bar_pattern": ["6_over_6", "3_over_6", "2_over_2", "1_over_1"], "operation": "vertical_sliding_sash_with_cords_weights_or_spiral_balance", "glass": {"original": "crown_or_cylinder_glass", "replacement": "slim_unit_heritage_double_glazing"}, "proportions": "height_to_width_1.6_to_1.8_golden_ratio_derived", "listing_note": "Listed_buildings_require_like_for_like_LBC"}, "interface": {"box_frame": "concealed_weight_pockets_in_reveals", "cill": "stone_projecting_with_throating", "furniture": "sash_lifts_fasteners_pulleys"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"softwood_single": 800, "hardwood_double": 2500, "heritage_slim_DG": 3500}, "lead_time_days": 42, "common_suppliers": ["Ventrolla", "Mumford & Wood", "The Sash Window Workshop", "Masterframe"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'georgian_sash_window';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "timber_frame_leaded_or_glazing_bar_glass", "typical_mass_kg": 15}, "electrical": null, "thermal": {"U_value_w_m2k": {"single": 4.8, "double_heritage": 1.6}}, "mechanical": {"rays": [5, 7, 9, 11, 13], "pattern": ["radial", "spider_web", "batswing", "elliptical"], "opening": "typically_fixed_non_opening"}, "interface": {"fix": "built_into_door_frame_head", "transom_bar": "separates_fanlight_from_door"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 1200, "lead_time_days": 42, "common_suppliers": ["Mumford & Wood", "specialist_joinery"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'georgian_fanlight';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"stone_Bath_Portland": {"density_kg_m3": 2200}, "stucco_render": {"density_kg_m3": 1800}, "GRP_reproduction": {"density_kg_m3": 1600}}, "typical_mass_kg_per_m": {"stone": 30, "stucco": 15, "GRP": 5}}, "electrical": null, "thermal": {}, "mechanical": {"elements": ["corona", "cymatium", "dentil_course", "bed_mould", "frieze"], "dentil_proportions": "width_equals_gap_or_2_to_3_ratio", "projection_mm": [150, 200, 300]}, "interface": {"fix": {"stone": "dowelled_and_cramped", "GRP": "stainless_screws_to_timber_grounds"}}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"stone": 200, "stucco": 80, "GRP": 60}, "lead_time_days": 28, "common_suppliers": ["Haddonstone", "Chilstone", "Aristocast", "Stevensons of Norwich"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'georgian_dentil_cornice';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "softwood_or_hardwood_solid_timber", "density_kg_m3": 500, "typical_mass_kg": 35}, "electrical": null, "thermal": {"U_value_w_m2k": 3.0}, "mechanical": {"panels": [4, 6, 8], "panel_type": "raised_and_fielded_or_flat", "thickness_mm": [44, 54], "surround": ["architrave", "pilaster_and_entablature", "porch"], "ironmongery": "brass_lever_letterbox_knocker"}, "interface": {"frame": "hardwood_or_softwood_rebated", "threshold": "hardwood_or_stone_step"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"softwood": 600, "hardwood_with_surround": 2500}, "lead_time_days": 28, "common_suppliers": ["LPD Doors", "Todd Doors", "specialist_joinery"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'georgian_panelled_door';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"Bath_stone": {"density_kg_m3": 2100}, "Portland_stone": {"density_kg_m3": 2300}, "cast_stone": {"density_kg_m3": 2200}}, "typical_mass_kg_per_block": {"400x225x100": 20}}, "electrical": null, "thermal": {"lambda_w_mk": 1.5}, "mechanical": {"pattern": "alternating_long_short_headers_and_stretchers", "finish": ["rubbed_ashlar", "rusticated_chamfered", "vermiculated"], "mortar": "NHL_3.5_lime_mortar_for_historic"}, "interface": {"bond": "toothed_into_main_walling", "mortar_joint_mm": [3, 6]}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_block": {"natural": 40, "cast": 15}, "lead_time_days": 21, "common_suppliers": ["Hartham Park", "Portland Stone Firms", "Haddonstone"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'georgian_quoin';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "wrought_iron_or_mild_steel_galv_painted", "density_kg_m3": 7850, "typical_mass_kg_per_m": 20}, "electrical": null, "thermal": {}, "mechanical": {"bar_centres_mm": 115, "max_gap_100mm_Building_Regs_K": true, "finial_types": ["spear", "fleur_de_lis", "urn", "ball"], "height_mm": [900, 1050, 1200], "finish": "hot_dip_galvanised_plus_primer_plus_gloss"}, "interface": {"fix": "cast_into_stone_plinth_with_lead_or_resin", "gate": "matching_style"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"reproduction_steel": 150, "wrought_iron": 400}, "lead_time_days": 42, "common_suppliers": ["Metalcraft", "Alpha Rail", "British Spirals & Castings"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'georgian_iron_railing';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "timber_frame_masonry_or_rendered_base", "typical_mass_kg": {"canted_single_storey": 200}}, "electrical": null, "thermal": {"U_value_w_m2k": {"original_single": 4.5, "upgraded_double": 1.4}}, "mechanical": {"types": ["canted_3_sided", "square_3_sided", "curved_bow", "oriel_first_floor"], "angle_degrees": [30, 45, 60], "structural_support": {"ground_floor": "foundation_below", "first_floor": "corbelled_or_gallows_bracket"}}, "interface": {"roof": "lead_flat_or_GRP_with_code_5_flashing"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"timber_new": 5000, "uPVC_replacement": 2500}, "lead_time_days": 42, "common_suppliers": ["specialist_joinery", "Residence_Collection"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'victorian_bay_window';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "hand_made_clay_or_machine_clay", "density_kg_m3": 1900, "typical_mass_kg": 3}, "electrical": null, "thermal": {}, "mechanical": {"types": ["half_round", "angular", "crested", "ornamental_with_finials"], "length_mm": [300, 450], "bedding": "1_3_lime_sand_mortar_or_dry_ridge_system"}, "interface": {"bedding": "mortar_or_mechanical_dry_fix_BS_8612"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"plain": 5, "crested": 15, "finial_terminal": 40}, "lead_time_days": 14, "common_suppliers": ["Dreadnought Tiles", "Keymer", "Tudor Roof Tiles", "Marley"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'victorian_ridge_tile';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "softwood_turned_or_hardwood_or_cast_iron", "density_kg_m3": {"timber": 500, "cast_iron": 7200}, "typical_mass_kg": {"timber_2200": 8, "cast_iron_2200": 40}}, "electrical": null, "thermal": {}, "mechanical": {"diameter_mm": [75, 100, 125, 150], "profile": "lathe_turned_with_entasis", "treatment": "primed_and_painted_or_stained"}, "interface": {"base": "plinth_on_dwarf_wall", "top": "abacus_under_beam"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"timber": 80, "cast_iron_repro": 250}, "lead_time_days": 21, "common_suppliers": ["Richard Burbidge", "George Edwards", "Heritage Cast Iron"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'victorian_porch_column';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "softwood_or_Western_Red_Cedar", "density_kg_m3": 420, "typical_mass_kg_per_m": 3}, "electrical": null, "thermal": {}, "mechanical": {"patterns": ["scalloped", "pierced", "fretwork", "Gothic_trefoil"], "treatment": "painted_or_stained", "pendant": "drop_finial_at_apex"}, "interface": {"fix": "screwed_to_rafter_feet_or_barge_rafter"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"simple": 15, "ornate_fretwork": 50}, "lead_time_days": 21, "common_suppliers": ["specialist_joinery", "The House Nameplate Company"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'victorian_bargeboard';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "clay_plain_tiles_hand_or_machine_made", "density_kg_m3": 1900, "mass_per_m2_kg": {"plain": 60, "with_battens": 65}}, "electrical": null, "thermal": {"additional_weather_protection": true}, "mechanical": {"tile_size_mm": {"plain": "265x165", "club": "265x165_rounded", "scallop": "265x165_fish_scale"}, "gauge_mm": [90, 100, 110], "lap_mm": [35, 65], "battens": "25x50mm_treated_at_gauge_centres"}, "interface": {"underlay": "breather_membrane", "nailing": "2_nails_per_tile_every_tile_on_walls"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"machine": 40, "handmade": 70}, "lead_time_days": 14, "common_suppliers": ["Dreadnought", "Keymer", "Sahtas", "Marley Eternit"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'victorian_tile_hanging';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "green_oak_or_air_dried_oak", "density_kg_m3": {"green": 800, "air_dried": 650}, "typical_mass_kg_per_m2_wall": 40}, "electrical": null, "thermal": {"U_value_w_m2k": "poor_without_insulation_consider_internal_IWI"}, "mechanical": {"timber_sizes_mm": {"posts": "150x150", "rails": "150x100", "braces": "100x100"}, "joints": ["mortise_and_tenon", "pegged", "half_lap", "scarf"], "infill": ["brick_nogging", "wattle_and_daub", "lime_plaster_on_lath"], "surface_treatment": "none_or_linseed_oil_lime_wash_infill_panels"}, "interface": {"foundation": "padstone_or_plinth_wall", "pegging": "oak_drawbore_pegs"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"new_green_oak": 300, "reclaimed_oak": 500}, "lead_time_days": 56, "common_suppliers": ["Oakwrights", "Border Oak", "Carpenter Oak", "T J Crump"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'tudor_half_timber';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "handmade_clay_brick_soft_mud", "density_kg_m3": 1800, "mass_per_m2_kg": 100}, "electrical": null, "thermal": {}, "mechanical": {"brick_size_mm": "215x102.5x65_or_Tudor_size_230x110x50", "pattern": "herringbone_45_degree_within_timber_panels", "mortar": "NHL_2_lime_putty_mortar_flush_pointing"}, "interface": {"timber_frame": "bricks_wedged_into_grooves_in_timber_or_against_oak_pegs"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": 80, "lead_time_days": 14, "common_suppliers": ["Michelmersh", "Imperial Bricks", "York Handmade"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'tudor_herringbone_brick';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"natural_stone": {"density_kg_m3": 2200}, "cast_stone": {"density_kg_m3": 2200}}, "typical_mass_kg": {"3_light_stone": 80}}, "electrical": null, "thermal": {"U_value_w_m2k": {"leaded_single": 5.0, "secondary_glazing": 2.5}}, "mechanical": {"lights": [2, 3, 4, 5, 6], "elements": ["mullion", "transom", "king_mullion", "hood_mould_label"], "glazing": "leaded_lights_diamond_or_rectangular_quarries", "opening": "iron_casement_within_stone_frame"}, "interface": {"fix": "built_into_masonry_or_timber_frame_reveals"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"cast_stone_3_light": 1500, "natural_stone": 4000}, "lead_time_days": 42, "common_suppliers": ["Haddonstone", "Chilstone", "specialist_mason"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'tudor_mullioned_window';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "handmade_brick", "density_kg_m3": 1800, "typical_mass_kg": {"3_flue_3m": 1200}}, "electrical": null, "thermal": {"thermal_mass": "significant_heat_retention"}, "mechanical": {"decorative_patterns": ["diaper_pattern", "spiral_twist", "star_pattern", "octagonal"], "string_courses": "projecting_bands_at_intervals", "chimney_pots": "ornamental_octagonal_or_cylindrical"}, "interface": {"flashing": "code_5_lead_stepped_and_back_gutter", "DPC": "engineering_brick_or_slate"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"plain_3_flue": 3000, "decorative": 8000}, "lead_time_days": 28, "common_suppliers": ["specialist_bricklayer", "Michelmersh"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'tudor_chimney_stack';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "timber_frame_tile_or_slate_clad", "typical_mass_kg": 150}, "electrical": null, "thermal": {"insulation": "between_and_over_rafters"}, "mechanical": {"roof_form": "swept_catslide_extending_main_roof_down", "cheeks": "tile_hung_or_rendered", "window": "casement_leaded_or_plain"}, "interface": {"roof": "tiles_continuous_from_main_roof", "flashing": "lead_soakers_and_stepped"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 5000, "lead_time_days": 28, "common_suppliers": ["Specialist_carpenter_roofer"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'ac_catslide_dormer';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"stone_surround": {"density_kg_m3": 2200}, "oak_beam": {"density_kg_m3": 650}}, "typical_mass_kg": 500}, "electrical": null, "thermal": {"thermal_mass": "very_high_stone_and_brick"}, "mechanical": {"opening_mm": {"width": [1200, 1500, 1800], "height": [900, 1050, 1200]}, "beam": "massive_oak_bressummer_250x200mm_min", "seats": "stone_benches_within_recess", "fireback": "cast_iron_decorative"}, "interface": {"flue": "large_gathering_to_flue_above", "hearth": "stone_or_brick_500mm_projection"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": 8000, "lead_time_days": 56, "common_suppliers": ["Specialist_stonemason", "Reclaimed_Materials"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'ac_inglenook_surround';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "oak_or_softwood_frame_lead_came_glass", "typical_mass_kg": 12}, "electrical": null, "thermal": {"U_value_w_m2k": {"single_leaded": 5.2, "secondary_glazed": 2.8}}, "mechanical": {"lead_came": "H_section_6mm_cast_or_milled", "quarries": ["diamond", "rectangular", "bullseye_roundel"], "casement_stay": "wrought_iron_peg_type", "furniture": "black_wrought_iron_cockspur_fastener"}, "interface": {"frame": "oak_rebated_and_weathered", "hinge": "wrought_iron_hook_and_band"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"leaded_casement": 800, "stained_glass": 2000}, "lead_time_days": 42, "common_suppliers": ["Specialist_leaded_light_workshop", "Leadbitter Glass"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'ac_leaded_casement';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"Portland_stone": {"density_kg_m3": 2300}, "cast_stone": {"density_kg_m3": 2200}, "GRP_hollow": {"density_kg_m3": 200}}, "typical_mass_kg": {"stone_3m_300d": 500, "GRP_3m_300d": 30}}, "electrical": null, "thermal": {}, "mechanical": {"orders": {"Doric": {"height_to_diameter": 8, "no_base": "Greek_Doric", "flutes": 20}, "Ionic": {"height_to_diameter": 9, "volute_capital": true, "flutes": 24}, "Corinthian": {"height_to_diameter": 10, "acanthus_capital": true, "flutes": 24}}, "entasis": "slight_convex_curve_1_to_150_ratio", "structural": {"stone": "load_bearing", "GRP": "decorative_cladding_only"}}, "interface": {"base": "attic_base_on_plinth", "entablature": "architrave_frieze_cornice_above"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"cast_stone_3m": 3000, "GRP_3m": 600, "Portland_stone_3m": 15000}, "lead_time_days": {"stone": 84, "cast": 42, "GRP": 28}, "common_suppliers": ["Haddonstone", "Chilstone", "Architectural Heritage", "Kolumba"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'classical_column';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "stone_cast_stone_or_GRP", "typical_mass_kg": {"stone_4m": 600, "GRP_4m": 50}}, "electrical": null, "thermal": {}, "mechanical": {"types": ["triangular", "segmental_arc", "broken_pediment", "swan_neck"], "pitch": "tympanum_pitch_12_to_18_degrees", "tympanum_decoration": ["plain", "coat_of_arms", "relief_sculpture"], "raking_cornice": "matches_horizontal_cornice_profile"}, "interface": {"supported_on": "columns_or_pilasters", "fix": "dowelled_and_cramped"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"cast_stone_4m": 5000, "GRP": 2000}, "lead_time_days": 42, "common_suppliers": ["Haddonstone", "Stevensons of Norwich"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'classical_pediment';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "stone_cast_stone_or_GRP", "density_kg_m3": {"stone": 2200, "GRP": 200}, "typical_mass_kg_per_m": {"stone": 80, "GRP": 8}}, "electrical": null, "thermal": {}, "mechanical": {"baluster_profiles": ["vase_turned", "bottle", "colonnette", "square_panelled"], "baluster_spacing_mm": [110, 130, 150], "height_mm": [750, 900, 1050], "building_regs": "100mm_max_gap_Part_K_if_guarding"}, "interface": {"base": "continuous_plinth", "coping": "weathered_top_rail_with_drip"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"cast_stone": 200, "GRP": 60, "natural_stone": 600}, "lead_time_days": 28, "common_suppliers": ["Haddonstone", "Chilstone", "Aristocast"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'classical_balustrade';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "hot_rolled_steel_W20_profile_16_20mm", "density_kg_m3": 7850, "typical_mass_kg_per_m2": 25}, "electrical": null, "thermal": {"U_value_w_m2k": {"single_original": 5.7, "heritage_double_thermal_break": 1.6}, "thermal_break": "polyamide_insert_in_modern_reproductions"}, "mechanical": {"profile": "W20_hot_rolled_T_section_20mm_face_width", "glazing": {"original": "6mm_single", "replacement": "slim_14mm_heritage_DG"}, "opening_lights": "side_hung_or_top_hung_casement", "finish": "galvanised_plus_powder_coat_RAL_7016_or_7021"}, "interface": {"sub_frame": "steel_or_timber_outer_frame", "putty": "metal_casement_putty_or_dry_glazed"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"single": 500, "heritage_DG": 900}, "lead_time_days": 56, "common_suppliers": ["Crittall Windows", "Steel Window Association members", "Clement"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'deco_crittall_window';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"bronze": {"density_kg_m3": 8900}, "cast_aluminium": {"density_kg_m3": 2700}, "GRP_gilded": {"density_kg_m3": 1600}}, "typical_mass_kg": {"800mm_bronze": 15, "800mm_GRP": 3}}, "electrical": {"backlighting": "optional_LED_warm_white_2700K"}, "thermal": {}, "mechanical": {"rays": [7, 9, 11, 13], "finish": ["polished_bronze", "gilt", "chrome", "painted"], "motif": "sunrise_or_fountain_radiating_from_base_centre"}, "interface": {"fix": "concealed_stud_fix_to_wall_or_above_door"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"GRP": 300, "cast_aluminium": 1000, "bronze": 5000}, "lead_time_days": 42, "common_suppliers": ["specialist_foundry", "Architectural_Metalworkers"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'deco_sunburst_panel';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "rendered_brick_or_concrete_or_faience", "density_kg_m3": 2000, "typical_mass_kg_per_m": 200}, "electrical": null, "thermal": {}, "mechanical": {"steps": [2, 3, 4, 5], "symmetry": "symmetrical_ziggurat_or_asymmetric", "finish": ["smooth_render", "faience_tile", "terrazzo", "Vitrolite_glass"], "coping": "precast_concrete_or_stone_with_drip"}, "interface": {"DPC": "under_coping", "flashing": "lead_or_GRP_behind_parapet"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": 300, "lead_time_days": 28, "common_suppliers": ["Specialist_renderer", "precast_manufacturer"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'deco_stepped_parapet';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": {"concrete": {"density_kg_m3": 2400}, "aluminium": {"density_kg_m3": 2700}, "timber_accoya": {"density_kg_m3": 510}}, "typical_mass_kg_per_m2": {"concrete": 60, "aluminium": 8, "timber": 12}}, "electrical": {"motorised_option": "24V_actuator_for_adjustable_louvres"}, "thermal": {"solar_shading_g_factor_reduction": "0.3_to_0.5_depending_on_blade_angle", "compliance": "Part_L_overheating_TM59"}, "mechanical": {"blade_types": ["fixed_horizontal", "fixed_vertical", "adjustable_louvre", "perforated"], "blade_pitch_deg": [0, 15, 30, 45], "material": ["precast_concrete", "extruded_aluminium", "Accoya_timber", "terracotta"]}, "interface": {"fix": "steel_outrigger_brackets_to_structure", "drainage": "drip_detail_at_blade_tip"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"aluminium": 200, "concrete": 300, "timber": 250}, "lead_time_days": 42, "common_suppliers": ["Levolux", "Duco", "Renson", "Colt International"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'brise_soleil';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "reinforced_concrete_C32_40", "density_kg_m3": 2400, "typical_mass_kg": {"3x1.5m_200mm": 2160}}, "electrical": null, "thermal": {"thermal_bridge": "critical_Psi_0.5_to_1.0_requires_thermal_break", "thermal_break_products": ["Schock_Isokorb", "Halfen_HIT"]}, "mechanical": {"cantilever_mm": [1000, 1200, 1500, 2000], "slab_thickness_mm": [150, 180, 200, 250], "rebar": "T16_at_150_top_T12_at_200_bottom", "drainage": "1_in_60_fall_to_front_drip_edge", "finish": ["board_marked_fair_face", "bush_hammered", "smooth_shutter", "exposed_aggregate"]}, "interface": {"thermal_break": "Isokorb_or_similar_BS_EN_ISO_10211", "waterproofing": "liquid_applied_membrane"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp": {"in_situ_concrete": 3000, "precast": 4000}, "lead_time_days": {"in_situ": 14, "precast": 28}, "common_suppliers": ["Specialist_RC_contractor", "Techrete", "Trent Concrete"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'brutalist_balcony';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "titanium_zinc_EN_988", "density_kg_m3": 7150, "mass_per_m2_kg": {"0.7mm": 5.0, "0.8mm": 5.7}}, "electrical": null, "thermal": {"lambda_w_mk": 110, "substrate": "plywood_18mm_on_breather_membrane"}, "mechanical": {"thickness_mm": [0.65, 0.7, 0.8], "seam_height_mm": [25, 38, 65], "panel_width_mm": [330, 430, 530, 600], "finish": ["natural_pre_weathered", "ANTHRA_ZINC", "QUARTZ_ZINC", "AZENGAR"], "min_pitch_deg": 3, "expansion_mm_per_10m": 11}, "interface": {"clip": "stainless_steel_fixed_and_sliding_clips", "substrate": "18mm_plywood_on_counter_battens"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"material": 35, "installed": 120}, "lead_time_days": 14, "common_suppliers": ["VMZINC", "Rheinzink", "Elzinc", "NedZink"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'zinc_standing_seam_panel';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "toughened_laminated_glass_10_1.52_10mm", "density_kg_m3": 2500, "typical_mass_kg_per_m2": 54}, "electrical": null, "thermal": {}, "mechanical": {"glass_type": "toughened_laminated_21.52mm_BS_EN_12150_BS_EN_14449", "height_mm": [1100, 1200], "channel": "aluminium_U_channel_base_fixed_or_side_fixed", "handrail": ["none", "stainless_circular_48mm", "stainless_rectangular"], "loading": "0.74kN_m_line_load_BS_EN_1991_1_1_barrier"}, "interface": {"base_fix": "M12_resin_anchors_to_slab_edge", "channel": "grout_or_resin_packed"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m": {"base_fix_no_rail": 300, "base_fix_with_rail": 400}, "lead_time_days": 21, "common_suppliers": ["Q-railing", "Balconette", "SHS Products", "Sadev"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'frameless_glass_balustrade';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "weathering_steel_BS_EN_10025_5_S355J2WP", "density_kg_m3": 7850, "mass_per_m2_kg": {"2mm": 15.7, "3mm": 23.5, "4mm": 31.4}}, "electrical": null, "thermal": {"lambda_w_mk": 50}, "mechanical": {"thickness_mm": [2, 3, 4, 6], "weathering": "stable_rust_patina_forms_over_6_to_24_months", "staining_risk": "runoff_stains_adjacent_materials_manage_with_drainage", "perforated_option": true, "bending": "CNC_folded_to_profile"}, "interface": {"fix": "stainless_steel_secret_fix_brackets_to_aluminium_subframe", "subframe": "aluminium_T_or_L_rail_system"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"flat_3mm": 80, "folded_cassette": 150}, "lead_time_days": 28, "common_suppliers": ["SSAB", "ArcelorMittal", "Hadley Group", "Kingspan Benchmark"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'corten_panel';

UPDATE component_geometry_types SET
    physical_properties = '{"mass": {"material": "aluminium_alloy_5005_or_3003_H14_or_anodised", "density_kg_m3": 2700, "mass_per_m2_kg": {"2mm_30pct_open": 3.8, "3mm_40pct_open": 4.9}}, "electrical": {"backlighting": "optional_LED_RGB_or_warm_white"}, "thermal": {"solar_shading": "reduces_g_value_proportional_to_open_area"}, "mechanical": {"thickness_mm": [2, 3, 4], "hole_pattern": ["round", "square", "slot", "hexagonal", "decorative_bespoke"], "open_area_pct": [20, 30, 40, 50, 60], "finish": ["mill", "anodised", "PPC_RAL", "PVDF", "sublimation_timber_effect"], "wind_load_design": "BS_EN_1991_1_4_Cp_per_open_area"}, "interface": {"fix": "aluminium_Z_bracket_or_channel_system", "expansion": "slotted_holes_for_thermal_movement"}}'::jsonb,
    procurement = '{"typical_unit_cost_gbp_per_m2": {"standard_round": 80, "bespoke_pattern": 200}, "lead_time_days": 28, "common_suppliers": ["RMIG", "Locker Group", "Metal Perforators", "Arrow Metal"]}'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'perforated_metal_screen';
