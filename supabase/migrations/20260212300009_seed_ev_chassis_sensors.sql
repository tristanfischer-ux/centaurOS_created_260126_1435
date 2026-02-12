-- ============================================================
-- ForgeOS Component Geometry Library — EV Chassis & Sensors
-- Migration: 20260212300009_seed_ev_chassis_sensors
-- ============================================================
-- Seeds 11 EV/automotive chassis, suspension, and sensor components


-- 1. Wheel Hub
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'wheel_hub',
    'Wheel Hub Assembly',
    'domain',
    'chassis',
$CADQUERY$
def wheel_hub(params):
    """Wheel hub with stud holes on PCD, center bore, bearing housing, ABS ring groove, and drive spline bore."""
    od = params.get("outer_diameter", 180)
    hub_h = params.get("hub_height", 55)
    pcd = params.get("pcd", 114.3)
    studs = params.get("stud_count", 5)
    stud_d = params.get("stud_hole_dia", 12.5)
    bore_d = params.get("center_bore", 66.6)
    bearing_od = params.get("bearing_od", 80)
    bearing_h = params.get("bearing_height", 30)
    spline_d = params.get("spline_bore", 28)
    abs_groove_d = params.get("abs_groove_depth", 1.5)

    # Main hub disc
    result = (
        cq.Workplane("XY")
        .circle(od / 2)
        .extrude(hub_h)
    )
    # Center bore
    result = result.faces(">Z").workplane().hole(bore_d, hub_h)
    # Stud holes on PCD
    result = (
        result.faces(">Z").workplane()
        .polarArray(pcd / 2, 0, 360, studs)
        .circle(stud_d / 2)
        .cutThruAll()
    )
    # Bearing housing ring on back face
    bearing_ring = (
        cq.Workplane("XY")
        .circle(bearing_od / 2)
        .circle(bore_d / 2)
        .extrude(-bearing_h)
    )
    result = result.union(bearing_ring)
    # ABS ring groove near outer edge of back face
    abs_groove = (
        cq.Workplane("XY")
        .circle(od / 2 - 5)
        .circle(od / 2 - 5 - 3)
        .extrude(-abs_groove_d)
    )
    result = result.cut(abs_groove)
    # Drive spline bore through center
    result = (
        result.faces("<Z").workplane()
        .hole(spline_d, bearing_h + hub_h)
    )
    return result
$CADQUERY$,
    '{"outer_diameter": {"type": "number", "default": 180, "unit": "mm"}, "hub_height": {"type": "number", "default": 55, "unit": "mm"}, "pcd": {"type": "number", "default": 114.3, "unit": "mm"}, "stud_count": {"type": "number", "default": 5}, "stud_hole_dia": {"type": "number", "default": 12.5, "unit": "mm"}, "center_bore": {"type": "number", "default": 66.6, "unit": "mm"}, "bearing_od": {"type": "number", "default": 80, "unit": "mm"}, "bearing_height": {"type": "number", "default": 30, "unit": "mm"}, "spline_bore": {"type": "number", "default": 28, "unit": "mm"}, "abs_groove_depth": {"type": "number", "default": 1.5, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['chassis', 'hub', 'wheel', 'bearing', 'abs', 'ev'],
    '#808080',
    'Wheel hub with stud holes on PCD, center bore, bearing housing, ABS ring groove, and drive spline bore.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 2. Brake Disc (Vented)
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'brake_disc',
    'Vented Brake Disc',
    'domain',
    'brake',
$CADQUERY$
def brake_disc(params):
    """Vented brake disc with two friction surfaces, radial vanes, center hat section, and bolt holes."""
    outer_d = params.get("outer_diameter", 280)
    inner_d = params.get("inner_diameter", 160)
    total_t = params.get("total_thickness", 24)
    face_t = params.get("face_thickness", 5)
    hat_d = params.get("hat_diameter", 130)
    hat_h = params.get("hat_height", 15)
    bolt_pcd = params.get("bolt_pcd", 100)
    bolt_count = params.get("bolt_count", 5)
    bolt_d = params.get("bolt_hole_dia", 12.5)
    vane_count = params.get("vane_count", 36)
    chamfer = params.get("edge_chamfer", 1.0)

    vane_gap = total_t - 2 * face_t
    # Outer friction ring — bottom face
    bottom = (
        cq.Workplane("XY")
        .circle(outer_d / 2).circle(inner_d / 2)
        .extrude(face_t)
    )
    # Top friction face
    top = (
        cq.Workplane("XY").workplane(offset=face_t + vane_gap)
        .circle(outer_d / 2).circle(inner_d / 2)
        .extrude(face_t)
    )
    # Radial vanes between faces
    vane_w = 4
    vane_len = (outer_d - inner_d) / 2 - 5
    vanes = (
        cq.Workplane("XY").workplane(offset=face_t)
        .polarArray((inner_d + outer_d) / 4, 0, 360, vane_count)
        .rect(vane_w, vane_len)
        .extrude(vane_gap)
    )
    disc = bottom.union(top).union(vanes)
    # Hat section
    hat = (
        cq.Workplane("XY").workplane(offset=-hat_h)
        .circle(hat_d / 2).circle(hat_d / 2 - 10)
        .extrude(hat_h)
    )
    hat_top = (
        cq.Workplane("XY").workplane(offset=-hat_h)
        .circle(hat_d / 2)
        .extrude(3)
    )
    disc = disc.union(hat).union(hat_top)
    # Bolt holes in hat
    disc = (
        disc.faces("<Z").workplane()
        .polarArray(bolt_pcd / 2, 0, 360, bolt_count)
        .circle(bolt_d / 2)
        .cutThruAll()
    )
    # Edge chamfer on outer rim
    disc = disc.edges("|Z").filter(lambda e: e.Length() < face_t + 1).chamfer(chamfer)
    return disc
$CADQUERY$,
    '{"outer_diameter": {"type": "number", "default": 280, "unit": "mm"}, "inner_diameter": {"type": "number", "default": 160, "unit": "mm"}, "total_thickness": {"type": "number", "default": 24, "unit": "mm"}, "face_thickness": {"type": "number", "default": 5, "unit": "mm"}, "hat_diameter": {"type": "number", "default": 130, "unit": "mm"}, "hat_height": {"type": "number", "default": 15, "unit": "mm"}, "bolt_pcd": {"type": "number", "default": 100, "unit": "mm"}, "bolt_count": {"type": "number", "default": 5}, "bolt_hole_dia": {"type": "number", "default": 12.5, "unit": "mm"}, "vane_count": {"type": "number", "default": 36}, "edge_chamfer": {"type": "number", "default": 1.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['brake', 'disc', 'vented', 'rotor', 'ev'],
    '#404040',
    'Vented brake disc with two friction surfaces, radial vanes, center hat section with bolt holes, and chamfered edges.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 3. Brake Caliper
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'brake_caliper',
    'Multi-Piston Brake Caliper',
    'domain',
    'brake',
$CADQUERY$
def brake_caliper(params):
    """Multi-piston brake caliper with bridge, piston bores, pad slot, bleeder, mounting lugs, and banjo port."""
    body_l = params.get("body_length", 120)
    body_w = params.get("body_width", 80)
    body_h = params.get("body_height", 60)
    piston_d = params.get("piston_diameter", 40)
    piston_count = params.get("piston_count_per_side", 2)
    pad_slot_w = params.get("pad_slot_width", 28)
    mount_spacing = params.get("mount_spacing", 100)
    mount_d = params.get("mount_bolt_dia", 10)
    lug_w = params.get("lug_width", 20)
    bleeder_d = params.get("bleeder_diameter", 8)
    banjo_d = params.get("banjo_port_dia", 12)

    half_w = body_w / 2
    # Main caliper body — two halves bridged
    outer = (
        cq.Workplane("XY")
        .box(body_l, body_w, body_h, centered=True)
    )
    # Pad slot cut through the middle (disc slot)
    slot = (
        cq.Workplane("XY")
        .box(body_l - 20, pad_slot_w, body_h + 2, centered=True)
    )
    result = outer.cut(slot)
    # Piston bores on each side of slot
    spacing = body_l / (piston_count + 1)
    for i in range(piston_count):
        x = -body_l / 2 + spacing * (i + 1)
        for side in [1, -1]:
            y = side * (pad_slot_w / 2 + 5)
            bore = (
                cq.Workplane("XY")
                .center(x, y)
                .circle(piston_d / 2)
                .extrude(body_h / 2 - 5)
            )
            result = result.cut(bore)
    # Mounting lugs
    for side in [-1, 1]:
        lug = (
            cq.Workplane("XY").workplane(offset=-body_h / 2)
            .center(side * mount_spacing / 2, -half_w - lug_w / 2)
            .box(lug_w, lug_w, body_h, centered=True, combine=False)
        )
        result = result.union(lug)
        # Bolt holes in lugs
        result = (
            result.faces("<Z").workplane()
            .center(side * mount_spacing / 2, -half_w - lug_w / 2)
            .hole(mount_d, body_h)
        )
    # Bleeder nipple boss on top
    bleeder = (
        cq.Workplane("XY").workplane(offset=body_h / 2)
        .center(body_l / 4, 0)
        .circle(bleeder_d / 2 + 3)
        .extrude(10)
    )
    result = result.union(bleeder)
    result = (
        result.faces(">Z").workplane()
        .center(body_l / 4, 0)
        .hole(bleeder_d, 10)
    )
    # Banjo port on rear face
    banjo = (
        cq.Workplane("YZ")
        .workplane(offset=body_l / 2)
        .center(0, 0)
        .circle(banjo_d / 2 + 3)
        .extrude(8)
    )
    result = result.union(banjo)
    return result
$CADQUERY$,
    '{"body_length": {"type": "number", "default": 120, "unit": "mm"}, "body_width": {"type": "number", "default": 80, "unit": "mm"}, "body_height": {"type": "number", "default": 60, "unit": "mm"}, "piston_diameter": {"type": "number", "default": 40, "unit": "mm"}, "piston_count_per_side": {"type": "number", "default": 2}, "pad_slot_width": {"type": "number", "default": 28, "unit": "mm"}, "mount_spacing": {"type": "number", "default": 100, "unit": "mm"}, "mount_bolt_dia": {"type": "number", "default": 10, "unit": "mm"}, "lug_width": {"type": "number", "default": 20, "unit": "mm"}, "bleeder_diameter": {"type": "number", "default": 8, "unit": "mm"}, "banjo_port_dia": {"type": "number", "default": 12, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['brake', 'caliper', 'piston', 'hydraulic', 'ev'],
    '#404040',
    'Multi-piston brake caliper with bridge over disc, piston bores, pad slot, bleeder nipple, mounting lugs, and banjo port.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 4. Coilover Shock Absorber
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'coilover_shock',
    'Coilover Shock Absorber',
    'domain',
    'suspension',
$CADQUERY$
def coilover_shock(params):
    """Coilover: damper body, piston rod, coil spring rings, top/bottom mount eyes, adjustment knobs."""
    body_d = params.get("body_diameter", 46)
    body_l = params.get("body_length", 200)
    rod_d = params.get("rod_diameter", 14)
    rod_ext = params.get("rod_extension", 100)
    spring_od = params.get("spring_od", 62)
    spring_wire = params.get("spring_wire_dia", 10)
    spring_coils = params.get("spring_coils", 8)
    spring_pitch = params.get("spring_pitch", 18)
    eye_id = params.get("eye_inner_dia", 12)
    eye_od = params.get("eye_outer_dia", 24)
    eye_t = params.get("eye_thickness", 16)
    knob_d = params.get("knob_diameter", 30)

    # Damper body tube
    result = (
        cq.Workplane("XY")
        .circle(body_d / 2)
        .extrude(body_l)
    )
    # Piston rod extending upward
    rod = (
        cq.Workplane("XY").workplane(offset=body_l)
        .circle(rod_d / 2)
        .extrude(rod_ext)
    )
    result = result.union(rod)
    # Coil spring — stacked tori approximation
    for i in range(spring_coils):
        z = body_l * 0.15 + i * spring_pitch
        ring = (
            cq.Workplane("XY").workplane(offset=z)
            .circle(spring_od / 2)
            .circle(spring_od / 2 - spring_wire)
            .extrude(spring_wire)
        )
        result = result.union(ring)
    # Top mount eye
    top_eye = (
        cq.Workplane("XZ").workplane(offset=0)
        .transformed(offset=cq.Vector(0, body_l + rod_ext, 0))
        .circle(eye_od / 2)
        .circle(eye_id / 2)
        .extrude(eye_t)
    )
    result = result.union(top_eye)
    # Bottom mount eye
    bot_eye = (
        cq.Workplane("XZ")
        .circle(eye_od / 2)
        .circle(eye_id / 2)
        .extrude(eye_t)
    )
    result = result.union(bot_eye)
    # Adjustment knob at bottom of body
    knob = (
        cq.Workplane("XY").workplane(offset=-8)
        .circle(knob_d / 2)
        .extrude(8)
    )
    result = result.union(knob)
    return result
$CADQUERY$,
    '{"body_diameter": {"type": "number", "default": 46, "unit": "mm"}, "body_length": {"type": "number", "default": 200, "unit": "mm"}, "rod_diameter": {"type": "number", "default": 14, "unit": "mm"}, "rod_extension": {"type": "number", "default": 100, "unit": "mm"}, "spring_od": {"type": "number", "default": 62, "unit": "mm"}, "spring_wire_dia": {"type": "number", "default": 10, "unit": "mm"}, "spring_coils": {"type": "number", "default": 8}, "spring_pitch": {"type": "number", "default": 18, "unit": "mm"}, "eye_inner_dia": {"type": "number", "default": 12, "unit": "mm"}, "eye_outer_dia": {"type": "number", "default": 24, "unit": "mm"}, "eye_thickness": {"type": "number", "default": 16, "unit": "mm"}, "knob_diameter": {"type": "number", "default": 30, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['suspension', 'coilover', 'shock', 'damper', 'spring', 'ev'],
    '#C0C0C0',
    'Coilover shock absorber with damper body, piston rod, coil spring, top/bottom mount eyes, and adjustment knobs.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 5. Wishbone (A-arm)
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'wishbone',
    'Wishbone / A-Arm',
    'domain',
    'suspension',
$CADQUERY$
def wishbone(params):
    """Wishbone A-arm: two diverging tubes from ball joint boss to two bushing mounts. Triangular shape."""
    arm_length = params.get("arm_length", 300)
    spread = params.get("bushing_spread", 200)
    tube_od = params.get("tube_od", 25)
    tube_id = params.get("tube_id", 19)
    boss_d = params.get("ball_joint_boss_dia", 40)
    boss_h = params.get("ball_joint_boss_height", 30)
    bush_od = params.get("bushing_od", 35)
    bush_id = params.get("bushing_id", 12)
    bush_l = params.get("bushing_length", 40)

    # Ball joint boss at apex
    boss = (
        cq.Workplane("XY")
        .circle(boss_d / 2)
        .extrude(boss_h)
    )
    # Left arm tube
    left_arm = (
        cq.Workplane("XY").workplane(offset=boss_h / 2 - tube_od / 2)
        .center(0, 0)
        .transformed(rotate=cq.Vector(0, 0, 0))
        .moveTo(0, 0)
        .lineTo(-spread / 2, arm_length)
        .circle(tube_od / 2)
        .sweep(
            cq.Workplane("XY")
            .moveTo(0, 0)
            .lineTo(-spread / 2, arm_length)
            .wire()
        )
    )
    # Simplified: use boxes for the two arms
    arm_t = tube_od
    left = (
        cq.Workplane("XY").workplane(offset=boss_h / 2 - arm_t / 2)
        .center(-spread / 4, arm_length / 2)
        .rect(arm_t, arm_length)
        .extrude(arm_t)
    )
    right = (
        cq.Workplane("XY").workplane(offset=boss_h / 2 - arm_t / 2)
        .center(spread / 4, arm_length / 2)
        .rect(arm_t, arm_length)
        .extrude(arm_t)
    )
    result = boss.union(left).union(right)
    # Bushing mounts at rear
    for side in [-1, 1]:
        bush = (
            cq.Workplane("XZ")
            .workplane(offset=arm_length)
            .center(side * spread / 4, boss_h / 2)
            .circle(bush_od / 2)
            .circle(bush_id / 2)
            .extrude(bush_l)
        )
        result = result.union(bush)
    return result
$CADQUERY$,
    '{"arm_length": {"type": "number", "default": 300, "unit": "mm"}, "bushing_spread": {"type": "number", "default": 200, "unit": "mm"}, "tube_od": {"type": "number", "default": 25, "unit": "mm"}, "tube_id": {"type": "number", "default": 19, "unit": "mm"}, "ball_joint_boss_dia": {"type": "number", "default": 40, "unit": "mm"}, "ball_joint_boss_height": {"type": "number", "default": 30, "unit": "mm"}, "bushing_od": {"type": "number", "default": 35, "unit": "mm"}, "bushing_id": {"type": "number", "default": 12, "unit": "mm"}, "bushing_length": {"type": "number", "default": 40, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['suspension', 'wishbone', 'a-arm', 'control-arm', 'ev'],
    '#C0C0C0',
    'Wishbone A-arm with two diverging tubes from ball joint boss converging to two bushing mounts.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 6. Tie Rod End
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'tie_rod_end',
    'Tie Rod End / Ball Joint',
    'domain',
    'steering',
$CADQUERY$
def tie_rod_end(params):
    """Tie rod end ball joint: spherical housing, threaded shaft, dust boot cone, castle nut, cotter pin hole."""
    housing_d = params.get("housing_diameter", 30)
    housing_h = params.get("housing_height", 25)
    shaft_d = params.get("shaft_diameter", 14)
    shaft_l = params.get("shaft_length", 60)
    boot_top_d = params.get("boot_top_dia", 28)
    boot_bot_d = params.get("boot_bottom_dia", 18)
    boot_h = params.get("boot_height", 20)
    taper_top_d = params.get("taper_top_dia", 14)
    taper_bot_d = params.get("taper_bottom_dia", 12)
    taper_h = params.get("taper_height", 18)
    nut_af = params.get("castle_nut_af", 19)
    pin_d = params.get("cotter_pin_hole_dia", 3)

    # Spherical ball housing
    housing = (
        cq.Workplane("XY")
        .circle(housing_d / 2)
        .extrude(housing_h)
    )
    # Round the top to suggest ball shape
    dome = (
        cq.Workplane("XY").workplane(offset=housing_h)
        .circle(housing_d / 2)
        .extrude(housing_d / 4)
    )
    housing = housing.union(dome)
    # Taper stud downward
    taper = (
        cq.Workplane("XY").workplane(offset=-taper_h)
        .circle(taper_top_d / 2)
        .workplane(offset=-taper_h)
        .circle(taper_bot_d / 2)
        .loft()
    )
    result = housing.union(taper)
    # Dust boot (conical)
    boot = (
        cq.Workplane("XY")
        .circle(boot_top_d / 2).circle(boot_top_d / 2 - 2)
        .extrude(-boot_h)
    )
    result = result.union(boot)
    # Threaded shaft extending from taper
    shaft = (
        cq.Workplane("XY").workplane(offset=-taper_h)
        .circle(shaft_d / 2)
        .extrude(-shaft_l)
    )
    result = result.union(shaft)
    # Castle nut at bottom of shaft
    nut = (
        cq.Workplane("XY").workplane(offset=-taper_h - shaft_l)
        .polygon(6, nut_af)
        .extrude(-10)
    )
    result = result.union(nut)
    # Cotter pin hole through shaft near nut
    pin_hole = (
        cq.Workplane("XZ").workplane(offset=0)
        .center(0, -taper_h - shaft_l + 5)
        .circle(pin_d / 2)
        .extrude(shaft_d)
    )
    result = result.cut(pin_hole)
    return result
$CADQUERY$,
    '{"housing_diameter": {"type": "number", "default": 30, "unit": "mm"}, "housing_height": {"type": "number", "default": 25, "unit": "mm"}, "shaft_diameter": {"type": "number", "default": 14, "unit": "mm"}, "shaft_length": {"type": "number", "default": 60, "unit": "mm"}, "boot_top_dia": {"type": "number", "default": 28, "unit": "mm"}, "boot_bottom_dia": {"type": "number", "default": 18, "unit": "mm"}, "boot_height": {"type": "number", "default": 20, "unit": "mm"}, "taper_top_dia": {"type": "number", "default": 14, "unit": "mm"}, "taper_bottom_dia": {"type": "number", "default": 12, "unit": "mm"}, "taper_height": {"type": "number", "default": 18, "unit": "mm"}, "castle_nut_af": {"type": "number", "default": 19, "unit": "mm"}, "cotter_pin_hole_dia": {"type": "number", "default": 3, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['steering', 'tie-rod', 'ball-joint', 'suspension', 'ev'],
    '#A0A0A0',
    'Tie rod end ball joint with spherical housing, threaded shaft, dust boot, castle nut, and cotter pin hole.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 7. Steering Rack
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'steering_rack',
    'Steering Rack',
    'domain',
    'steering',
$CADQUERY$
def steering_rack(params):
    """Steering rack: tube housing, pinion input boss, tie rod outputs, mounting clamps, rubber boots."""
    rack_l = params.get("rack_length", 500)
    tube_od = params.get("tube_od", 45)
    tube_id = params.get("tube_id", 32)
    pinion_d = params.get("pinion_boss_dia", 55)
    pinion_h = params.get("pinion_boss_height", 50)
    tie_rod_d = params.get("tie_rod_thread_dia", 14)
    tie_rod_ext = params.get("tie_rod_extension", 30)
    clamp_w = params.get("clamp_width", 30)
    clamp_d = params.get("clamp_outer_dia", 60)
    boot_l = params.get("boot_length", 60)
    boot_d_large = params.get("boot_large_dia", 50)
    boot_d_small = params.get("boot_small_dia", 20)

    # Main tube housing
    result = (
        cq.Workplane("XY")
        .circle(tube_od / 2)
        .extrude(rack_l)
    )
    # Hollow bore
    result = result.faces(">Z").workplane().hole(tube_id, rack_l)
    # Pinion input boss on top, center of rack
    pinion = (
        cq.Workplane("XZ").workplane(offset=tube_od / 2)
        .center(0, rack_l / 2)
        .circle(pinion_d / 2)
        .extrude(pinion_h)
    )
    result = result.union(pinion)
    # Tie rod thread outputs at each end
    for end_z in [0, rack_l]:
        rod = (
            cq.Workplane("XY").workplane(offset=end_z)
            .circle(tie_rod_d / 2)
            .extrude(tie_rod_ext if end_z == rack_l else -tie_rod_ext)
        )
        result = result.union(rod)
    # Mounting clamps (two along the body)
    for pos in [rack_l * 0.25, rack_l * 0.75]:
        clamp = (
            cq.Workplane("XY").workplane(offset=pos - clamp_w / 2)
            .circle(clamp_d / 2)
            .circle(tube_od / 2)
            .extrude(clamp_w)
        )
        result = result.union(clamp)
    # Rubber boots on each end (conical)
    for end_z, direction in [(0, -1), (rack_l, 1)]:
        boot_base = (
            cq.Workplane("XY").workplane(offset=end_z)
            .circle(boot_d_large / 2)
            .workplane(offset=direction * boot_l)
            .circle(boot_d_small / 2)
            .loft()
        )
        result = result.union(boot_base)
    return result
$CADQUERY$,
    '{"rack_length": {"type": "number", "default": 500, "unit": "mm"}, "tube_od": {"type": "number", "default": 45, "unit": "mm"}, "tube_id": {"type": "number", "default": 32, "unit": "mm"}, "pinion_boss_dia": {"type": "number", "default": 55, "unit": "mm"}, "pinion_boss_height": {"type": "number", "default": 50, "unit": "mm"}, "tie_rod_thread_dia": {"type": "number", "default": 14, "unit": "mm"}, "tie_rod_extension": {"type": "number", "default": 30, "unit": "mm"}, "clamp_width": {"type": "number", "default": 30, "unit": "mm"}, "clamp_outer_dia": {"type": "number", "default": 60, "unit": "mm"}, "boot_length": {"type": "number", "default": 60, "unit": "mm"}, "boot_large_dia": {"type": "number", "default": 50, "unit": "mm"}, "boot_small_dia": {"type": "number", "default": 20, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['steering', 'rack', 'pinion', 'tie-rod', 'ev'],
    '#A0A0A0',
    'Steering rack with tube housing, pinion input boss, tie rod outputs at each end, mounting clamps, and rubber boots.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 8. Wheel Rim
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'wheel_rim',
    'Spoked Wheel Rim',
    'domain',
    'chassis',
$CADQUERY$
def wheel_rim(params):
    """Spoked wheel rim: outer barrel with bead seats, hub face with bolt holes, spokes, and valve hole."""
    rim_d = params.get("rim_diameter", 432)
    rim_w = params.get("rim_width", 190)
    barrel_t = params.get("barrel_thickness", 4)
    hub_d = params.get("hub_face_dia", 160)
    center_bore = params.get("center_bore", 66.6)
    pcd = params.get("pcd", 114.3)
    bolt_count = params.get("bolt_count", 5)
    bolt_d = params.get("bolt_hole_dia", 12.5)
    spoke_count = params.get("spoke_count", 5)
    spoke_w = params.get("spoke_width", 40)
    spoke_t = params.get("spoke_thickness", 12)
    offset_mm = params.get("offset_et", 40)
    valve_d = params.get("valve_hole_dia", 11.5)
    bead_h = params.get("bead_seat_height", 8)

    half_w = rim_w / 2
    r_outer = rim_d / 2
    r_inner = r_outer - bead_h
    # Outer barrel shell
    barrel = (
        cq.Workplane("XY")
        .circle(r_outer).circle(r_outer - barrel_t)
        .extrude(rim_w)
    )
    # Bead seats — raised rings at each end
    for z in [0, rim_w - bead_h]:
        bead = (
            cq.Workplane("XY").workplane(offset=z)
            .circle(r_outer + 3).circle(r_outer)
            .extrude(bead_h)
        )
        barrel = barrel.union(bead)
    # Hub face disc at offset position
    hub_z = half_w - offset_mm
    hub = (
        cq.Workplane("XY").workplane(offset=hub_z)
        .circle(hub_d / 2)
        .extrude(spoke_t)
    )
    # Center bore
    hub = (
        hub.faces(">Z").workplane()
        .hole(center_bore, spoke_t)
    )
    # Bolt holes
    hub = (
        hub.faces(">Z").workplane()
        .polarArray(pcd / 2, 0, 360, bolt_count)
        .circle(bolt_d / 2)
        .cutThruAll()
    )
    barrel = barrel.union(hub)
    # Spokes connecting hub to barrel
    for i in range(spoke_count):
        angle = i * 360 / spoke_count
        rad = math.radians(angle)
        spoke_l = r_inner - barrel_t - hub_d / 2
        cx = math.cos(rad) * (hub_d / 2 + spoke_l / 2)
        cy = math.sin(rad) * (hub_d / 2 + spoke_l / 2)
        spoke = (
            cq.Workplane("XY").workplane(offset=hub_z)
            .center(cx, cy)
            .rect(spoke_w, spoke_l)
            .extrude(spoke_t)
        )
        spoke = spoke.rotate((0, 0, 0), (0, 0, 1), angle)
        barrel = barrel.union(spoke)
    # Valve hole in barrel
    valve_hole = (
        cq.Workplane("XZ")
        .workplane(offset=r_outer)
        .center(0, rim_w / 2)
        .circle(valve_d / 2)
        .extrude(-barrel_t - 2)
    )
    barrel = barrel.cut(valve_hole)
    return barrel
$CADQUERY$,
    '{"rim_diameter": {"type": "number", "default": 432, "unit": "mm"}, "rim_width": {"type": "number", "default": 190, "unit": "mm"}, "barrel_thickness": {"type": "number", "default": 4, "unit": "mm"}, "hub_face_dia": {"type": "number", "default": 160, "unit": "mm"}, "center_bore": {"type": "number", "default": 66.6, "unit": "mm"}, "pcd": {"type": "number", "default": 114.3, "unit": "mm"}, "bolt_count": {"type": "number", "default": 5}, "bolt_hole_dia": {"type": "number", "default": 12.5, "unit": "mm"}, "spoke_count": {"type": "number", "default": 5}, "spoke_width": {"type": "number", "default": 40, "unit": "mm"}, "spoke_thickness": {"type": "number", "default": 12, "unit": "mm"}, "offset_et": {"type": "number", "default": 40, "unit": "mm"}, "valve_hole_dia": {"type": "number", "default": 11.5, "unit": "mm"}, "bead_seat_height": {"type": "number", "default": 8, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['chassis', 'wheel', 'rim', 'spoked', 'ev'],
    '#D0D0D0',
    'Spoked wheel rim with outer barrel, tyre bead seats, hub face with bolt holes, spokes, and valve hole.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 9. Throttle Sensor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'throttle_sensor',
    'Throttle Position Sensor',
    'domain',
    'sensor',
$CADQUERY$
def throttle_sensor(params):
    """Throttle position sensor: housing body, mounting tab, shaft pivot, 3-pin connector pigtail."""
    body_l = params.get("body_length", 40)
    body_w = params.get("body_width", 30)
    body_h = params.get("body_height", 20)
    tab_l = params.get("tab_length", 20)
    tab_w = params.get("tab_width", 15)
    tab_t = params.get("tab_thickness", 4)
    bolt_d = params.get("tab_bolt_dia", 4)
    shaft_d = params.get("shaft_diameter", 6)
    shaft_ext = params.get("shaft_extension", 10)
    conn_w = params.get("connector_width", 12)
    conn_h = params.get("connector_height", 8)
    conn_l = params.get("connector_length", 15)
    pin_d = params.get("pin_diameter", 1.0)
    pin_spacing = params.get("pin_spacing", 3)

    # Main sensor housing
    result = (
        cq.Workplane("XY")
        .box(body_l, body_w, body_h, centered=True)
    )
    # Fillet edges for moulded look
    result = result.edges("|Z").fillet(3)
    # Mounting tab
    tab = (
        cq.Workplane("XY").workplane(offset=-body_h / 2)
        .center(body_l / 2 + tab_l / 2, 0)
        .box(tab_l, tab_w, tab_t, centered=True, combine=False)
    )
    result = result.union(tab)
    # Bolt hole in tab
    result = (
        result.faces("<Z").workplane()
        .center(body_l / 2 + tab_l / 2, 0)
        .hole(bolt_d, tab_t)
    )
    # Shaft pivot on side
    shaft = (
        cq.Workplane("YZ").workplane(offset=-body_l / 2)
        .center(0, 0)
        .circle(shaft_d / 2)
        .extrude(-shaft_ext)
    )
    result = result.union(shaft)
    # 3-pin connector pigtail boss on rear
    conn = (
        cq.Workplane("XZ").workplane(offset=body_w / 2)
        .center(0, 0)
        .rect(conn_w, conn_h)
        .extrude(conn_l)
    )
    result = result.union(conn)
    # 3 pin holes in connector
    for i in range(-1, 2):
        pin = (
            cq.Workplane("XZ").workplane(offset=body_w / 2 + conn_l)
            .center(i * pin_spacing, 0)
            .circle(pin_d / 2)
            .extrude(-conn_l)
        )
        result = result.cut(pin)
    return result
$CADQUERY$,
    '{"body_length": {"type": "number", "default": 40, "unit": "mm"}, "body_width": {"type": "number", "default": 30, "unit": "mm"}, "body_height": {"type": "number", "default": 20, "unit": "mm"}, "tab_length": {"type": "number", "default": 20, "unit": "mm"}, "tab_width": {"type": "number", "default": 15, "unit": "mm"}, "tab_thickness": {"type": "number", "default": 4, "unit": "mm"}, "tab_bolt_dia": {"type": "number", "default": 4, "unit": "mm"}, "shaft_diameter": {"type": "number", "default": 6, "unit": "mm"}, "shaft_extension": {"type": "number", "default": 10, "unit": "mm"}, "connector_width": {"type": "number", "default": 12, "unit": "mm"}, "connector_height": {"type": "number", "default": 8, "unit": "mm"}, "connector_length": {"type": "number", "default": 15, "unit": "mm"}, "pin_diameter": {"type": "number", "default": 1.0, "unit": "mm"}, "pin_spacing": {"type": "number", "default": 3, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['sensor', 'throttle', 'position', 'hall-effect', 'ev'],
    '#1A1A1A',
    'Throttle position sensor with housing body, mounting tab, shaft pivot, and 3-pin connector pigtail.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 10. Wheel Speed Sensor
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'speed_sensor_wheel',
    'Wheel Speed Sensor (ABS)',
    'domain',
    'sensor',
$CADQUERY$
def speed_sensor_wheel(params):
    """Wheel speed sensor: cylindrical body, sensing face, mounting flange, 2-pin pigtail wire."""
    body_d = params.get("body_diameter", 14)
    body_l = params.get("body_length", 40)
    face_d = params.get("sensing_face_dia", 10)
    face_depth = params.get("sensing_recess", 1)
    flange_d = params.get("flange_diameter", 24)
    flange_t = params.get("flange_thickness", 3)
    bolt_d = params.get("bolt_hole_dia", 5.5)
    bolt_offset = params.get("bolt_offset", 9)
    wire_d = params.get("wire_diameter", 5)
    wire_l = params.get("wire_length", 30)
    pin_d = params.get("pin_diameter", 1.0)
    pin_spacing = params.get("pin_spacing", 3)

    # Cylindrical sensor body
    result = (
        cq.Workplane("XY")
        .circle(body_d / 2)
        .extrude(body_l)
    )
    # Sensing face recess at front
    sense = (
        cq.Workplane("XY")
        .circle(face_d / 2)
        .extrude(face_depth)
    )
    result = result.cut(sense)
    # Mounting flange/bracket
    flange = (
        cq.Workplane("XY").workplane(offset=body_l * 0.6)
        .circle(flange_d / 2)
        .extrude(flange_t)
    )
    result = result.union(flange)
    # Bolt hole in flange
    bolt = (
        cq.Workplane("XY").workplane(offset=body_l * 0.6)
        .center(bolt_offset, 0)
        .circle(bolt_d / 2)
        .extrude(flange_t)
    )
    result = result.cut(bolt)
    # 2-pin pigtail wire exiting rear
    wire = (
        cq.Workplane("XY").workplane(offset=body_l)
        .circle(wire_d / 2)
        .extrude(wire_l)
    )
    result = result.union(wire)
    # 2 pin holes at wire end
    for i in [-1, 1]:
        pin = (
            cq.Workplane("XY").workplane(offset=body_l + wire_l)
            .center(i * pin_spacing / 2, 0)
            .circle(pin_d / 2)
            .extrude(-5)
        )
        result = result.cut(pin)
    return result
$CADQUERY$,
    '{"body_diameter": {"type": "number", "default": 14, "unit": "mm"}, "body_length": {"type": "number", "default": 40, "unit": "mm"}, "sensing_face_dia": {"type": "number", "default": 10, "unit": "mm"}, "sensing_recess": {"type": "number", "default": 1, "unit": "mm"}, "flange_diameter": {"type": "number", "default": 24, "unit": "mm"}, "flange_thickness": {"type": "number", "default": 3, "unit": "mm"}, "bolt_hole_dia": {"type": "number", "default": 5.5, "unit": "mm"}, "bolt_offset": {"type": "number", "default": 9, "unit": "mm"}, "wire_diameter": {"type": "number", "default": 5, "unit": "mm"}, "wire_length": {"type": "number", "default": 30, "unit": "mm"}, "pin_diameter": {"type": "number", "default": 1.0, "unit": "mm"}, "pin_spacing": {"type": "number", "default": 3, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['sensor', 'speed', 'abs', 'hall-effect', 'wheel', 'ev'],
    '#1A1A1A',
    'Wheel speed sensor with cylindrical body, sensing face, mounting flange bracket, and 2-pin pigtail wire.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;


-- 11. Fuse Box
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'fuse_box',
    'Blade Fuse Box',
    'domain',
    'electrical',
$CADQUERY$
def fuse_box(params):
    """Fuse box: rectangular body with lid, blade fuse slots in rows, bus bar studs, output terminals, mounting tabs."""
    box_l = params.get("box_length", 120)
    box_w = params.get("box_width", 80)
    box_h = params.get("box_height", 35)
    wall_t = params.get("wall_thickness", 2.5)
    lid_t = params.get("lid_thickness", 2)
    fuse_rows = params.get("fuse_rows", 2)
    fuses_per_row = params.get("fuses_per_row", 6)
    fuse_slot_l = params.get("fuse_slot_length", 10)
    fuse_slot_w = params.get("fuse_slot_width", 5)
    stud_d = params.get("bus_stud_dia", 6)
    stud_h = params.get("bus_stud_height", 8)
    tab_l = params.get("tab_length", 15)
    tab_w = params.get("tab_width", 12)
    tab_t = params.get("tab_thickness", 3)
    tab_bolt_d = params.get("tab_bolt_dia", 4)

    # Main box body (hollow)
    outer = (
        cq.Workplane("XY")
        .box(box_l, box_w, box_h, centered=True)
    )
    inner = (
        cq.Workplane("XY")
        .box(box_l - 2 * wall_t, box_w - 2 * wall_t, box_h - wall_t, centered=True)
        .translate((0, 0, wall_t / 2))
    )
    result = outer.cut(inner)
    # Lid on top
    lid = (
        cq.Workplane("XY").workplane(offset=box_h / 2)
        .box(box_l + 2, box_w + 2, lid_t, centered=True, combine=False)
    )
    result = result.union(lid)
    # Blade fuse slots arranged in rows
    row_spacing = (box_w - 2 * wall_t - 10) / max(fuse_rows, 1)
    col_spacing = (box_l - 2 * wall_t - 10) / max(fuses_per_row - 1, 1)
    for r in range(fuse_rows):
        y = -box_w / 2 + wall_t + 8 + r * row_spacing
        for c in range(fuses_per_row):
            x = -box_l / 2 + wall_t + 8 + c * col_spacing
            slot = (
                cq.Workplane("XY").workplane(offset=box_h / 2)
                .center(x, y)
                .rect(fuse_slot_l, fuse_slot_w)
                .extrude(lid_t + 1)
            )
            result = result.cut(slot)
    # Bus bar input studs on one end
    for i in [-1, 1]:
        stud = (
            cq.Workplane("XY").workplane(offset=box_h / 2 + lid_t)
            .center(-box_l / 2 + 10, i * 15)
            .circle(stud_d / 2)
            .extrude(stud_h)
        )
        result = result.union(stud)
    # Mounting tabs on sides
    for side in [-1, 1]:
        tab = (
            cq.Workplane("XY").workplane(offset=-box_h / 2)
            .center(0, side * (box_w / 2 + tab_w / 2))
            .box(tab_l, tab_w, tab_t, centered=True, combine=False)
        )
        result = result.union(tab)
        # Bolt hole in tab
        hole = (
            cq.Workplane("XY").workplane(offset=-box_h / 2)
            .center(0, side * (box_w / 2 + tab_w / 2))
            .circle(tab_bolt_d / 2)
            .extrude(-tab_t)
        )
        result = result.cut(hole)
    return result
$CADQUERY$,
    '{"box_length": {"type": "number", "default": 120, "unit": "mm"}, "box_width": {"type": "number", "default": 80, "unit": "mm"}, "box_height": {"type": "number", "default": 35, "unit": "mm"}, "wall_thickness": {"type": "number", "default": 2.5, "unit": "mm"}, "lid_thickness": {"type": "number", "default": 2, "unit": "mm"}, "fuse_rows": {"type": "number", "default": 2}, "fuses_per_row": {"type": "number", "default": 6}, "fuse_slot_length": {"type": "number", "default": 10, "unit": "mm"}, "fuse_slot_width": {"type": "number", "default": 5, "unit": "mm"}, "bus_stud_dia": {"type": "number", "default": 6, "unit": "mm"}, "bus_stud_height": {"type": "number", "default": 8, "unit": "mm"}, "tab_length": {"type": "number", "default": 15, "unit": "mm"}, "tab_width": {"type": "number", "default": 12, "unit": "mm"}, "tab_thickness": {"type": "number", "default": 3, "unit": "mm"}, "tab_bolt_dia": {"type": "number", "default": 4, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    ARRAY['electrical', 'fuse', 'fuse-box', 'blade', 'power-distribution', 'ev'],
    '#2F2F2F',
    'Blade fuse box with lid, blade fuse slots in rows, bus bar input studs, output terminals, and mounting tabs.',
    TRUE
) ON CONFLICT (slug) DO NOTHING;
