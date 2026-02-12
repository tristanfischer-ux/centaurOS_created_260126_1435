-- ============================================================
-- ForgeOS Component Geometry Library — Tier 3: CubeSats
-- Migration: 20260212300003_seed_tier3_cubesat
-- ============================================================
-- Seeds 10 domain-specific geometry types for CubeSat components.

-- 1. cubesat_frame
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cubesat_frame',
    'CubeSat Frame / Chassis',
    'domain',
    'structure',
$CADQUERY$
def cubesat_frame(params):
    """
    CubeSat structural frame / chassis (1U, 2U, 3U, 6U).
    Rail-based skeleton per CubeSat Design Spec (CDS).
    100mm × 100mm cross-section, height = units × ~113.5mm.
    Rails at 4 corners with access panels between.
    
    params:
        units:      CubeSat size (1, 2, 3, 6)
        rail_w:     Rail width (8.5mm CDS standard)
        rail_depth: Rail depth
        wall:       Panel thickness
        sep_spring_d: Separation spring pocket diameter
    """
    units = params.get("units", 1)
    rail_w = params.get("rail_w", 8.5)
    rail_depth = params.get("rail_depth", 8.5)
    wall = params.get("wall", 1.5)
    sep_d = params.get("sep_spring_d", 6.0)

    # CDS dimensions
    cross = 100.0  # 100mm × 100mm cross-section
    height = units * 113.5  # ~113.5mm per U
    half = cross / 2.0

    # 4 corner rails (full height)
    frame = None
    for cx, cy in [(-half + rail_w/2, -half + rail_depth/2),
                   (-half + rail_w/2, half - rail_depth/2),
                   (half - rail_w/2, -half + rail_depth/2),
                   (half - rail_w/2, half - rail_depth/2)]:
        rail = (cq.Workplane("XY")
                .transformed(offset=(cx, cy, height/2))
                .box(rail_w, rail_depth, height))
        frame = rail if frame is None else frame.union(rail)

    # Top and bottom panels (with center cutout for PCB access)
    for z_off in [0, height - wall]:
        panel = (cq.Workplane("XY")
                 .workplane(offset=z_off)
                 .sketch().rect(cross, cross).finalize()
                 .extrude(wall))
        cutout = (cq.Workplane("XY")
                  .workplane(offset=z_off - 0.5)
                  .sketch().rect(cross - rail_w * 2 - 4, cross - rail_depth * 2 - 4)
                  .vertices().fillet(3).finalize()
                  .extrude(wall + 1))
        panel = panel.cut(cutout)
        frame = frame.union(panel)

    # Mid-shelf rails (cross braces at each U boundary)
    for u in range(1, units):
        z = u * 113.5
        for is_x in [True, False]:
            brace_l = cross - rail_w * 2
            if is_x:
                brace = (cq.Workplane("XY")
                         .workplane(offset=z - wall/2)
                         .sketch().rect(brace_l, rail_depth).finalize()
                         .extrude(wall))
            else:
                brace = (cq.Workplane("XY")
                         .workplane(offset=z - wall/2)
                         .sketch().rect(rail_w, brace_l).finalize()
                         .extrude(wall))
            frame = frame.union(brace)

    # Separation spring pockets (4 corners, bottom face)
    for cx, cy in [(-half + rail_w/2, -half + rail_depth/2),
                   (-half + rail_w/2, half - rail_depth/2),
                   (half - rail_w/2, -half + rail_depth/2),
                   (half - rail_w/2, half - rail_depth/2)]:
        pocket = (cq.Workplane("XY")
                  .workplane(offset=-0.5)
                  .transformed(offset=(cx, cy, 0))
                  .circle(sep_d / 2.0)
                  .extrude(4))
        frame = frame.cut(pocket)

    # M3 mounting holes along rails (4 per rail, evenly spaced)
    for cx, cy in [(-half + rail_w/2, -half + rail_depth/2),
                   (-half + rail_w/2, half - rail_depth/2),
                   (half - rail_w/2, -half + rail_depth/2),
                   (half - rail_w/2, half - rail_depth/2)]:
        for i in range(4):
            z = (i + 0.5) * (height / 4)
            # Holes through Y-face of rail
            hole = (cq.Workplane("XY")
                    .workplane(offset=z)
                    .transformed(offset=(cx, cy, 0))
                    .transformed(rotate=(90, 0, 0))
                    .circle(1.5)
                    .extrude(rail_depth + 1))
            frame = frame.cut(hole)

    return frame
$CADQUERY$,
    '{"units": {"type": "integer", "default": 1, "enum": [1, 2, 3, 6], "description": "CubeSat size in U"}, "rail_w": {"type": "number", "default": 8.5, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['aluminium', 'structural', 'space'],
    '#C0C0C0',
    'CubeSat structural frame / chassis (1U, 2U, 3U, 6U).',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 2. solar_panel_cubesat
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'solar_panel_cubesat',
    'CubeSat Solar Panel',
    'domain',
    'power',
$CADQUERY$
def solar_panel_cubesat(params):
    """
    CubeSat solar panel — body-mounted or deployable.
    FR4/Aluminium substrate with visible solar cell grid.
    
    params:
        width:       Panel width (100mm for 1U face)
        height:      Panel height
        thickness:   Substrate thickness
        cell_rows:   Number of solar cell rows
        cell_cols:   Number of solar cell columns
        cell_gap:    Gap between cells
        has_hinge:   Include deployment hinge
    """
    w = params.get("width", 100.0)
    h = params.get("height", 113.5)
    t = params.get("thickness", 1.6)
    rows = params.get("cell_rows", 3)
    cols = params.get("cell_cols", 2)
    gap = params.get("cell_gap", 2.0)
    has_hinge = params.get("has_hinge", False)

    # Substrate
    substrate = (cq.Workplane("XY")
                 .sketch().rect(w, h).vertices().fillet(1).finalize()
                 .extrude(t))

    # Solar cells (raised rectangles on top face)
    cell_w = (w - gap * (cols + 1)) / cols
    cell_h = (h - gap * (rows + 1)) / rows
    cells = None
    for r in range(rows):
        for c in range(cols):
            cx = -(w/2) + gap + c * (cell_w + gap) + cell_w/2
            cy = -(h/2) + gap + r * (cell_h + gap) + cell_h/2
            cell = (cq.Workplane("XY")
                    .workplane(offset=t)
                    .transformed(offset=(cx, cy, 0))
                    .sketch().rect(cell_w, cell_h).finalize()
                    .extrude(0.3))
            cells = cell if cells is None else cells.union(cell)

    panel = substrate
    if cells is not None:
        panel = panel.union(cells)

    # Connector pads (bottom edge)
    conn = (cq.Workplane("XY")
            .workplane(offset=-1)
            .transformed(offset=(0, -(h/2 - 5), 0))
            .box(10, 6, 1))
    panel = panel.union(conn)

    # Deployment hinge (optional)
    if has_hinge:
        hinge_barrel = (cq.Workplane("XY")
                        .workplane(offset=t/2)
                        .transformed(offset=(0, h/2 + 2, 0))
                        .transformed(rotate=(0, 90, 0))
                        .circle(2)
                        .extrude(w - 10))
        panel = panel.union(hinge_barrel)

    # Corner mounting holes
    for x, y in [(-w/2 + 4, -h/2 + 4), (-w/2 + 4, h/2 - 4),
                 (w/2 - 4, -h/2 + 4), (w/2 - 4, h/2 - 4)]:
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x, y, 0))
                .circle(1.3)
                .extrude(t + 1.5))
        panel = panel.cut(hole)

    return panel
$CADQUERY$,
    '{"width": {"type": "number", "default": 100.0, "unit": "mm"}, "height": {"type": "number", "default": 113.5, "unit": "mm"}, "cell_rows": {"type": "integer", "default": 3}, "cell_cols": {"type": "integer", "default": 2}, "has_hinge": {"type": "boolean", "default": false}}'::jsonb,
    '[]'::jsonb,
    ARRAY['solar', 'photovoltaic', 'space'],
    '#191970',
    'CubeSat solar panel — body-mounted or deployable.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 3. reaction_wheel
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'reaction_wheel',
    'Reaction Wheel Assembly',
    'domain',
    'adcs',
$CADQUERY$
def reaction_wheel(params):
    """
    Reaction wheel assembly for CubeSat attitude control.
    Motor + flywheel + housing.
    
    params:
        housing_w:   Housing width (square)
        housing_h:   Housing height
        wheel_d:     Flywheel diameter
        wheel_t:     Flywheel thickness
        shaft_d:     Motor shaft diameter
    """
    hw = params.get("housing_w", 40.0)
    hh = params.get("housing_h", 20.0)
    wd = params.get("wheel_d", 35.0)
    wt = params.get("wheel_t", 8.0)
    sd = params.get("shaft_d", 3.0)

    # Housing base plate
    base = (cq.Workplane("XY")
            .sketch().rect(hw, hw).vertices().fillet(2).finalize()
            .extrude(3))

    # Motor body (cylindrical, centered)
    motor_d = 15.0
    motor_h = hh - wt - 3
    motor = (cq.Workplane("XY")
             .workplane(offset=3)
             .circle(motor_d / 2.0)
             .extrude(motor_h))

    # Flywheel (heavy rim + hub)
    wheel_z = 3 + motor_h
    # Hub
    hub = (cq.Workplane("XY")
           .workplane(offset=wheel_z)
           .circle(motor_d / 2.0 + 2)
           .extrude(wt))
    # Rim (heavy outer ring)
    rim = (cq.Workplane("XY")
           .workplane(offset=wheel_z)
           .circle(wd / 2.0)
           .circle(wd / 2.0 - 3)
           .extrude(wt))
    # Spokes (4)
    spokes = None
    for angle in [0, 90, 180, 270]:
        rad = math.radians(angle)
        sx = (wd / 4.0) * math.cos(rad)
        sy = (wd / 4.0) * math.sin(rad)
        spoke = (cq.Workplane("XY")
                 .workplane(offset=wheel_z)
                 .transformed(offset=(sx, sy, 0))
                 .transformed(rotate=(0, 0, angle))
                 .sketch().rect(wd / 2.0 - motor_d / 2.0, 2).finalize()
                 .extrude(wt))
        spokes = spoke if spokes is None else spokes.union(spoke)

    # Housing walls (open top)
    walls = (cq.Workplane("XY")
             .sketch().rect(hw, hw).vertices().fillet(2).finalize()
             .extrude(hh))
    walls_inner = (cq.Workplane("XY")
                   .workplane(offset=3)
                   .sketch().rect(hw - 3, hw - 3).vertices().fillet(1.5).finalize()
                   .extrude(hh))
    housing_walls = walls.cut(walls_inner)

    # Mounting holes (4 corners)
    rw = base.union(motor).union(hub).union(rim)
    if spokes is not None:
        rw = rw.union(spokes)
    rw = rw.union(housing_walls)

    for x, y in [(-hw/2 + 3, -hw/2 + 3), (-hw/2 + 3, hw/2 - 3),
                 (hw/2 - 3, -hw/2 + 3), (hw/2 - 3, hw/2 - 3)]:
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x, y, 0))
                .circle(1.3)
                .extrude(4))
        rw = rw.cut(hole)

    return rw
$CADQUERY$,
    '{"housing_w": {"type": "number", "default": 40.0, "unit": "mm"}, "housing_h": {"type": "number", "default": 20.0, "unit": "mm"}, "wheel_d": {"type": "number", "default": 35.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['mechanical', 'rotating', 'space'],
    '#2F4F4F',
    'Reaction wheel assembly for CubeSat attitude control.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 4. magnetorquer
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'magnetorquer',
    'Magnetorquer Rod',
    'domain',
    'adcs',
$CADQUERY$
def magnetorquer(params):
    """
    Magnetorquer rod for CubeSat attitude control.
    Solenoid coil wound on ferrite/air core.
    
    params:
        length:      Rod length
        core_d:      Core diameter
        coil_od:     Coil outer diameter
        coil_l:      Coil winding length
        bracket_w:   Mounting bracket width
    """
    length = params.get("length", 70.0)
    core_d = params.get("core_d", 5.0)
    coil_od = params.get("coil_od", 10.0)
    coil_l = params.get("coil_l", 55.0)
    bracket_w = params.get("bracket_w", 14.0)

    # Core rod (full length)
    core = cq.Workplane("XY").circle(core_d / 2.0).extrude(length)

    # Coil winding (centered, represented as cylinder with ridges)
    coil_start = (length - coil_l) / 2.0
    coil = (cq.Workplane("XY")
            .workplane(offset=coil_start)
            .circle(coil_od / 2.0)
            .extrude(coil_l))

    # Winding ridges (visual texture)
    ridge_count = min(int(coil_l / 2), 20)
    for i in range(ridge_count):
        z = coil_start + (i + 0.5) * (coil_l / ridge_count)
        ridge = (cq.Workplane("XY")
                 .workplane(offset=z)
                 .circle(coil_od / 2.0 + 0.3)
                 .circle(coil_od / 2.0)
                 .extrude(0.8))
        coil = coil.union(ridge)

    # End brackets (mounting)
    for z_off in [2, length - bracket_w - 2]:
        bracket = (cq.Workplane("XY")
                   .workplane(offset=z_off)
                   .sketch().rect(bracket_w, bracket_w).vertices().fillet(1.5).finalize()
                   .extrude(bracket_w / 3))
        # Mounting hole
        hole = (cq.Workplane("XY")
                .workplane(offset=z_off - 0.5)
                .transformed(offset=(bracket_w / 3, 0, 0))
                .circle(1.3)
                .extrude(bracket_w / 3 + 1))
        bracket = bracket.cut(hole)
        coil = coil.union(bracket)

    # Wire termination pads
    for y_off in [-coil_od / 2 - 2, coil_od / 2 + 2]:
        pad = (cq.Workplane("XY")
               .workplane(offset=coil_start)
               .transformed(offset=(0, y_off, 0))
               .box(4, 3, 2))
        coil = coil.union(pad)

    return core.union(coil)
$CADQUERY$,
    '{"length": {"type": "number", "default": 70.0, "unit": "mm"}, "core_d": {"type": "number", "default": 5.0, "unit": "mm"}, "coil_od": {"type": "number", "default": 10.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['electromagnetic', 'coil', 'space'],
    '#8B0000',
    'Magnetorquer rod for CubeSat attitude control.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 5. star_tracker
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'star_tracker',
    'Star Tracker / Sun Sensor',
    'domain',
    'adcs',
$CADQUERY$
def star_tracker(params):
    """
    Star tracker / sun sensor for CubeSat attitude determination.
    Small optical sensor with baffle and mounting base.
    
    params:
        base_w:     Mounting base width
        base_h:     Mounting base height
        base_t:     Base thickness
        baffle_d:   Baffle outer diameter
        baffle_l:   Baffle length
        aperture_d: Optical aperture diameter
    """
    bw = params.get("base_w", 30.0)
    bh = params.get("base_h", 30.0)
    bt = params.get("base_t", 5.0)
    bd = params.get("baffle_d", 20.0)
    bl = params.get("baffle_l", 25.0)
    ad = params.get("aperture_d", 12.0)

    # Mounting base
    base = (cq.Workplane("XY")
            .sketch().rect(bw, bh).vertices().fillet(2).finalize()
            .extrude(bt))

    # Baffle tube (cylindrical, rising from base)
    baffle = (cq.Workplane("XY")
              .workplane(offset=bt)
              .circle(bd / 2.0)
              .extrude(bl))
    baffle_inner = (cq.Workplane("XY")
                    .workplane(offset=bt - 0.5)
                    .circle(bd / 2.0 - 1.5)
                    .extrude(bl + 1))
    baffle = baffle.cut(baffle_inner)

    # Internal baffles (light rejection rings)
    for i in range(3):
        z = bt + (i + 1) * (bl / 4)
        ring_d = bd - 3 - i * 2  # Progressively narrowing
        ring = (cq.Workplane("XY")
                .workplane(offset=z)
                .circle(bd / 2.0 - 1.5)
                .circle(ring_d / 2.0)
                .extrude(1))
        baffle = baffle.union(ring)

    # Aperture lens (glass element at top)
    lens = (cq.Workplane("XY")
            .workplane(offset=bt + bl)
            .circle(ad / 2.0)
            .extrude(1.5))

    # Sensor PCB (inside base)
    sensor_pcb = (cq.Workplane("XY")
                  .workplane(offset=bt - 3)
                  .sketch().rect(bw - 6, bh - 6).finalize()
                  .extrude(1.6))

    # Connector (side of base)
    conn = (cq.Workplane("XY")
            .workplane(offset=bt / 2 - 2)
            .transformed(offset=(bw / 2 + 3, 0, 0))
            .box(6, 8, 4))

    # Mounting holes
    tracker = base.union(baffle).union(lens).union(sensor_pcb).union(conn)
    for x, y in [(-bw/2 + 3, -bh/2 + 3), (-bw/2 + 3, bh/2 - 3),
                 (bw/2 - 3, -bh/2 + 3), (bw/2 - 3, bh/2 - 3)]:
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x, y, 0))
                .circle(1.3)
                .extrude(bt + 1))
        tracker = tracker.cut(hole)

    return tracker
$CADQUERY$,
    '{"base_w": {"type": "number", "default": 30.0, "unit": "mm"}, "baffle_d": {"type": "number", "default": 20.0, "unit": "mm"}, "baffle_l": {"type": "number", "default": 25.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['optical', 'sensor', 'space'],
    '#1A1A1A',
    'Star tracker / sun sensor for CubeSat attitude determination.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 6. patch_antenna_cubesat
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'patch_antenna_cubesat',
    'CubeSat Patch Antenna',
    'domain',
    'comms',
$CADQUERY$
def patch_antenna_cubesat(params):
    """
    Patch antenna for CubeSat comms (UHF/S-band).
    Ground plane + dielectric + radiating patch.
    
    params:
        ground_w:   Ground plane width
        ground_h:   Ground plane height
        patch_w:    Radiating patch width
        patch_h:    Radiating patch height
        dielectric_t: Dielectric thickness
        ground_t:   Ground plane thickness
    """
    gw = params.get("ground_w", 90.0)
    gh = params.get("ground_h", 90.0)
    pw = params.get("patch_w", 60.0)
    ph = params.get("patch_h", 60.0)
    dt = params.get("dielectric_t", 3.0)
    gt = params.get("ground_t", 0.8)

    # Ground plane (aluminium)
    ground = (cq.Workplane("XY")
              .sketch().rect(gw, gh).vertices().fillet(2).finalize()
              .extrude(gt))

    # Dielectric substrate
    dielectric = (cq.Workplane("XY")
                  .workplane(offset=gt)
                  .sketch().rect(gw - 2, gh - 2).vertices().fillet(1.5).finalize()
                  .extrude(dt))

    # Radiating patch (copper on top)
    patch = (cq.Workplane("XY")
             .workplane(offset=gt + dt)
             .sketch().rect(pw, ph).finalize()
             .extrude(0.035))  # 35μm copper

    # Feed point (SMA connector on bottom)
    sma_base = (cq.Workplane("XY")
                .workplane(offset=-6)
                .transformed(offset=(pw / 4, 0, 0))
                .circle(3.175)
                .extrude(6))
    # SMA hex nut
    sma_hex = (cq.Workplane("XY")
               .workplane(offset=-3)
               .transformed(offset=(pw / 4, 0, 0))
               .polygon(6, 8)
               .extrude(3))

    # Mounting holes
    ant = ground.union(dielectric).union(patch).union(sma_base).union(sma_hex)
    for x, y in [(-gw/2 + 4, -gh/2 + 4), (-gw/2 + 4, gh/2 - 4),
                 (gw/2 - 4, -gh/2 + 4), (gw/2 - 4, gh/2 - 4)]:
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x, y, 0))
                .circle(1.6)
                .extrude(gt + dt + 1))
        ant = ant.cut(hole)

    return ant
$CADQUERY$,
    '{"ground_w": {"type": "number", "default": 90.0, "unit": "mm"}, "patch_w": {"type": "number", "default": 60.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['copper', 'antenna', 'space'],
    '#DAA520',
    'Patch antenna for CubeSat comms (UHF/S-band).',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 7. deployable_antenna
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'deployable_antenna',
    'Deployable Tape-Spring Antenna',
    'domain',
    'comms',
$CADQUERY$
def deployable_antenna(params):
    """
    Deployable tape-spring antenna (stowed configuration).
    Canister with coiled antenna element and deployment mechanism.
    
    params:
        canister_w:  Canister width
        canister_h:  Canister height
        canister_d:  Canister depth
        element_count: Number of antenna elements (1-4)
        element_w:   Element tape width
    """
    cw = params.get("canister_w", 90.0)
    ch = params.get("canister_h", 15.0)
    cd = params.get("canister_d", 90.0)
    elements = params.get("element_count", 4)
    ew = params.get("element_w", 5.0)

    # Main canister body
    canister = (cq.Workplane("XY")
                .sketch().rect(cw, cd).vertices().fillet(3).finalize()
                .extrude(ch))

    # Lid
    lid = (cq.Workplane("XY")
           .workplane(offset=ch)
           .sketch().rect(cw + 2, cd + 2).vertices().fillet(3.5).finalize()
           .extrude(1.5))
    canister = canister.union(lid)

    # Antenna element exit slots
    slot_positions = []
    if elements >= 1:
        slot_positions.append((0, -cd/2))  # Front
    if elements >= 2:
        slot_positions.append((0, cd/2))   # Back
    if elements >= 3:
        slot_positions.append((-cw/2, 0))  # Left
    if elements >= 4:
        slot_positions.append((cw/2, 0))   # Right

    for sx, sy in slot_positions:
        # Exit slot in canister wall
        if abs(sy) > abs(sx):  # Front/back face
            slot = (cq.Workplane("XY")
                    .workplane(offset=ch / 2 - ew / 2)
                    .transformed(offset=(sx, sy, 0))
                    .box(ew + 2, 4, ew))
        else:  # Left/right face
            slot = (cq.Workplane("XY")
                    .workplane(offset=ch / 2 - ew / 2)
                    .transformed(offset=(sx, sy, 0))
                    .box(4, ew + 2, ew))
        canister = canister.cut(slot)

    # Burn wire restraint (thin line across lid)
    wire = (cq.Workplane("XY")
            .workplane(offset=ch + 1.5)
            .sketch().rect(cw - 10, 0.3).finalize()
            .extrude(0.3))
    canister = canister.union(wire)

    # Mounting holes
    for x, y in [(-cw/2 + 4, -cd/2 + 4), (-cw/2 + 4, cd/2 - 4),
                 (cw/2 - 4, -cd/2 + 4), (cw/2 - 4, cd/2 - 4)]:
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x, y, 0))
                .circle(1.3)
                .extrude(ch + 3))
        canister = canister.cut(hole)

    return canister
$CADQUERY$,
    '{"canister_w": {"type": "number", "default": 90.0, "unit": "mm"}, "element_count": {"type": "integer", "default": 4, "enum": [1, 2, 4]}}'::jsonb,
    '[]'::jsonb,
    ARRAY['mechanical', 'antenna', 'deployable', 'space'],
    '#A0A0A0',
    'Deployable tape-spring antenna (stowed configuration).',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 8. separation_spring
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'separation_spring',
    'Separation / Deployment Spring',
    'domain',
    'deployment',
$CADQUERY$
def separation_spring(params):
    """
    CubeSat separation / deployment spring.
    Compression spring in cylindrical housing.
    
    params:
        od:        Spring outer diameter
        length:    Compressed length
        wire_d:    Spring wire diameter
        coils:     Number of active coils
        housing_d: Housing cylinder OD
    """
    od = params.get("od", 8.0)
    length = params.get("length", 15.0)
    wire_d = params.get("wire_d", 1.0)
    coils = params.get("coils", 6)
    housing_d = params.get("housing_d", 12.0)

    # Housing cylinder
    housing = cq.Workplane("XY").circle(housing_d / 2.0).extrude(length + 3)
    housing_bore = (cq.Workplane("XY")
                    .workplane(offset=1.5)
                    .circle(housing_d / 2.0 - 1.5)
                    .extrude(length + 2))
    housing = housing.cut(housing_bore)

    # Spring coils (stacked rings)
    coil_pitch = length / coils
    spring = None
    for i in range(coils):
        z = 1.5 + (i + 0.5) * coil_pitch
        ring = (cq.Workplane("XY")
                .workplane(offset=z - wire_d / 2)
                .circle(od / 2.0)
                .circle(od / 2.0 - wire_d)
                .extrude(wire_d))
        spring = ring if spring is None else spring.union(ring)

    # Plunger cap
    plunger = (cq.Workplane("XY")
               .workplane(offset=length + 1)
               .circle(housing_d / 2.0 - 0.5)
               .extrude(2))

    result = housing
    if spring is not None:
        result = result.union(spring)
    result = result.union(plunger)
    return result
$CADQUERY$,
    '{"od": {"type": "number", "default": 8.0, "unit": "mm"}, "length": {"type": "number", "default": 15.0, "unit": "mm"}, "coils": {"type": "integer", "default": 6}}'::jsonb,
    '[]'::jsonb,
    ARRAY['steel', 'spring', 'space'],
    '#A0A0A0',
    'CubeSat separation / deployment spring.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 9. kill_switch
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'kill_switch',
    'Deployment Kill Switch',
    'domain',
    'safety',
$CADQUERY$
def kill_switch(params):
    """
    CubeSat deployment kill switch / inhibit switch.
    Plunger switch actuated by deployer rail contact.
    
    params:
        body_w:    Switch body width
        body_h:    Switch body height
        body_d:    Switch body depth
        plunger_d: Plunger diameter
        plunger_l: Plunger travel length
    """
    bw = params.get("body_w", 10.0)
    bh = params.get("body_h", 6.0)
    bd = params.get("body_d", 6.0)
    pd = params.get("plunger_d", 3.0)
    pl = params.get("plunger_l", 2.0)

    # Body
    body = (cq.Workplane("XY")
            .sketch().rect(bw, bh).vertices().fillet(0.5).finalize()
            .extrude(bd))

    # Plunger
    plunger = (cq.Workplane("XY")
               .workplane(offset=bd)
               .circle(pd / 2.0)
               .extrude(pl))

    # Plunger button cap
    cap = (cq.Workplane("XY")
           .workplane(offset=bd + pl)
           .circle(pd / 2.0 + 0.5)
           .extrude(0.5))

    # Solder pins (bottom, 2 pins)
    for x_off in [-bw / 4, bw / 4]:
        pin = (cq.Workplane("XY")
               .workplane(offset=-3)
               .transformed(offset=(x_off, 0, 0))
               .box(0.5, 0.5, 3))
        body = body.union(pin)

    # Mounting tabs
    for x_off in [-(bw / 2 + 2), bw / 2 + 2]:
        tab = (cq.Workplane("XY")
               .transformed(offset=(x_off, 0, bd / 2))
               .box(4, bh, 1))
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x_off, 0, 0))
                .circle(0.8)
                .extrude(bd + 1))
        body = body.union(tab).cut(hole)

    return body.union(plunger).union(cap)
$CADQUERY$,
    '{"body_w": {"type": "number", "default": 10.0, "unit": "mm"}, "body_h": {"type": "number", "default": 6.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['electronic', 'switch', 'space'],
    '#FF0000',
    'CubeSat deployment kill switch / inhibit switch.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 10. cold_gas_thruster
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'cold_gas_thruster',
    'Cold Gas Propulsion Module',
    'domain',
    'propulsion',
$CADQUERY$
def cold_gas_thruster(params):
    """
    Cold gas propulsion module for CubeSat orbit manoeuvres.
    Pressure tank + solenoid valve + nozzle.
    
    params:
        tank_d:    Propellant tank diameter
        tank_l:    Tank length
        nozzle_d:  Nozzle exit diameter
        nozzle_l:  Nozzle length
        valve_d:   Solenoid valve diameter
    """
    td = params.get("tank_d", 30.0)
    tl = params.get("tank_l", 60.0)
    nd = params.get("nozzle_d", 5.0)
    nl = params.get("nozzle_l", 12.0)
    vd = params.get("valve_d", 10.0)

    # Pressure tank (cylinder with domed ends)
    tank = cq.Workplane("XY").circle(td / 2.0).extrude(tl)
    # Dome caps (hemisphere approximation)
    dome_top = (cq.Workplane("XY")
                .workplane(offset=tl)
                .circle(td / 2.0)
                .extrude(td / 4))
    dome_bot = (cq.Workplane("XY")
                .workplane(offset=-(td / 4))
                .circle(td / 2.0)
                .extrude(td / 4))
    tank = tank.union(dome_top).union(dome_bot)

    # Fill valve (top, small fitting)
    fill = (cq.Workplane("XY")
            .workplane(offset=tl + td / 4)
            .circle(3)
            .extrude(5))
    tank = tank.union(fill)

    # Solenoid valve (side)
    valve = (cq.Workplane("XY")
             .workplane(offset=tl * 0.3)
             .transformed(offset=(td / 2, 0, 0))
             .transformed(rotate=(0, 90, 0))
             .circle(vd / 2.0)
             .extrude(15))
    # Valve coil
    valve_coil = (cq.Workplane("XY")
                  .workplane(offset=tl * 0.3)
                  .transformed(offset=(td / 2 + 8, 0, 0))
                  .transformed(rotate=(0, 90, 0))
                  .circle(vd / 2.0 + 2)
                  .circle(vd / 2.0)
                  .extrude(8))
    tank = tank.union(valve).union(valve_coil)

    # Nozzle (converging-diverging, simplified)
    # Converging section
    nozzle_conv = (cq.Workplane("XY")
                   .workplane(offset=tl * 0.3)
                   .transformed(offset=(td / 2 + 15, 0, 0))
                   .transformed(rotate=(0, 90, 0))
                   .circle(vd / 2.0 - 1)
                   .extrude(nl / 2))
    # Diverging section (wider exit)
    nozzle_div = (cq.Workplane("XY")
                  .workplane(offset=tl * 0.3)
                  .transformed(offset=(td / 2 + 15 + nl / 2, 0, 0))
                  .transformed(rotate=(0, 90, 0))
                  .circle(nd / 2.0)
                  .extrude(nl / 2))
    tank = tank.union(nozzle_conv).union(nozzle_div)

    # Mounting bracket
    bracket = (cq.Workplane("XY")
               .workplane(offset=0)
               .sketch().rect(td + 10, 15).vertices().fillet(2).finalize()
               .extrude(3))
    for x_off in [-(td / 2 + 3), td / 2 + 3]:
        hole = (cq.Workplane("XY")
                .workplane(offset=-0.5)
                .transformed(offset=(x_off, 0, 0))
                .circle(1.5)
                .extrude(4))
        bracket = bracket.cut(hole)
    tank = tank.union(bracket)

    return tank
$CADQUERY$,
    '{"tank_d": {"type": "number", "default": 30.0, "unit": "mm"}, "tank_l": {"type": "number", "default": 60.0, "unit": "mm"}, "nozzle_d": {"type": "number", "default": 5.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['metal', 'pressure', 'propulsion', 'space'],
    '#708090',
    'Cold gas propulsion module for CubeSat orbit manoeuvres.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;
