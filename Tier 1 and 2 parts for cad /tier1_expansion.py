"""
ForgeOS Component Geometry Library — Tier 1 Expansion
======================================================
Additional universal mechanical components: springs, shafts,
couplings, linear motion, gears, seals, hardware, extrusions.
"""

import cadquery as cq
import math


# ─── SPRINGS & ELASTIC ────────────────────────────────────

def compression_spring(params):
    """Compression spring — stacked coil rings."""
    od = params.get("od", 10.0)
    wire_d = params.get("wire_d", 1.2)
    free_length = params.get("free_length", 25.0)
    coils = params.get("active_coils", 8)

    pitch = free_length / (coils + 2)  # +2 for dead coils
    spring = None
    for i in range(coils + 2):
        z = i * pitch
        ring = (cq.Workplane("XY").workplane(offset=z)
                .circle(od/2).circle(od/2 - wire_d).extrude(wire_d))
        spring = ring if spring is None else spring.union(ring)
    # Flat end coils (ground ends)
    for z in [0, (coils + 1) * pitch]:
        end = (cq.Workplane("XY").workplane(offset=z)
               .circle(od/2).circle(od/2 - wire_d * 1.5).extrude(wire_d))
        spring = spring.union(end)
    return spring


def torsion_spring(params):
    """Torsion spring with two straight legs."""
    od = params.get("od", 12.0)
    wire_d = params.get("wire_d", 1.0)
    coils = params.get("coils", 4)
    leg_l = params.get("leg_length", 15.0)

    body_h = coils * wire_d * 1.5
    body = None
    for i in range(coils):
        z = i * wire_d * 1.5
        ring = (cq.Workplane("XY").workplane(offset=z)
                .circle(od/2).circle(od/2 - wire_d).extrude(wire_d))
        body = ring if body is None else body.union(ring)
    # Legs
    leg1 = (cq.Workplane("XY").workplane(offset=0)
            .transformed(offset=(od/2, 0, 0))
            .box(wire_d, leg_l, wire_d))
    leg2 = (cq.Workplane("XY").workplane(offset=body_h - wire_d)
            .transformed(offset=(-od/2, 0, 0))
            .box(wire_d, leg_l, wire_d))
    return body.union(leg1).union(leg2)


# ─── SHAFTS & POWER TRANSMISSION ─────────────────────────

def shaft(params):
    """Round shaft with optional keyway and shoulder."""
    d = params.get("diameter", 8.0)
    length = params.get("length", 100.0)
    keyway = params.get("keyway", False)
    key_w = params.get("key_width", d / 4)
    key_depth = params.get("key_depth", d / 8)
    shoulder = params.get("shoulder", False)
    shoulder_d = params.get("shoulder_d", d * 1.5)
    shoulder_l = params.get("shoulder_l", 5.0)

    s = cq.Workplane("XY").circle(d/2).extrude(length)
    if keyway:
        kw = (cq.Workplane("XY").workplane(offset=-0.5)
              .transformed(offset=(0, d/2 - key_depth/2, 0))
              .box(key_w, key_depth, length * 0.7))
        s = s.cut(kw)
    if shoulder:
        sh = (cq.Workplane("XY").workplane(offset=length/2 - shoulder_l/2)
              .circle(shoulder_d/2).extrude(shoulder_l))
        s = s.union(sh)
    return s


def shaft_coupling_jaw(params):
    """Flexible jaw coupling (two hubs + spider)."""
    od = params.get("od", 25.0)
    length = params.get("length", 30.0)
    bore = params.get("bore", 5.0)

    hub_l = length * 0.4
    # Hub A
    hub_a = cq.Workplane("XY").circle(od/2).extrude(hub_l)
    bore_a = cq.Workplane("XY").workplane(offset=-0.5).circle(bore/2).extrude(hub_l + 1)
    hub_a = hub_a.cut(bore_a)
    # Jaw teeth on hub A (3 teeth)
    for i in range(3):
        ang = i * 120
        rad = math.radians(ang)
        tx = (od/2 - 3) * math.cos(rad)
        ty = (od/2 - 3) * math.sin(rad)
        tooth = (cq.Workplane("XY").workplane(offset=hub_l)
                 .transformed(offset=(tx, ty, 0))
                 .circle(3).extrude(length * 0.2))
        hub_a = hub_a.union(tooth)
    # Hub B
    hub_b = cq.Workplane("XY").workplane(offset=length - hub_l).circle(od/2).extrude(hub_l)
    bore_b = cq.Workplane("XY").workplane(offset=length - hub_l - 0.5).circle(bore/2).extrude(hub_l + 1)
    hub_b = hub_b.cut(bore_b)
    for i in range(3):
        ang = i * 120 + 60
        rad = math.radians(ang)
        tx = (od/2 - 3) * math.cos(rad)
        ty = (od/2 - 3) * math.sin(rad)
        tooth = (cq.Workplane("XY").workplane(offset=length - hub_l - length * 0.2)
                 .transformed(offset=(tx, ty, 0))
                 .circle(3).extrude(length * 0.2))
        hub_b = hub_b.union(tooth)
    # Set screw holes
    for z_off in [hub_l/2, length - hub_l/2]:
        hole = (cq.Workplane("XY").workplane(offset=z_off)
                .transformed(offset=(od/2, 0, 0))
                .transformed(rotate=(0, 90, 0))
                .circle(1.5).extrude(od/2 + 2))
        hub_a = hub_a.cut(hole)
    return hub_a.union(hub_b)


def spur_gear(params):
    """Simplified spur gear with tooth profile."""
    module_m = params.get("module", 1.0)
    teeth = params.get("teeth", 20)
    width = params.get("width", 8.0)
    bore = params.get("bore", 5.0)

    pitch_d = module_m * teeth
    od = pitch_d + 2 * module_m
    root_d = pitch_d - 2.5 * module_m

    # Base disc at root diameter
    gear = cq.Workplane("XY").circle(od/2).extrude(width)
    # Cut tooth gaps (simplified as radial slots)
    for i in range(teeth):
        ang = 2 * math.pi * i / teeth + math.pi / teeth
        gap_x = (pitch_d/2) * math.cos(ang)
        gap_y = (pitch_d/2) * math.sin(ang)
        gap = (cq.Workplane("XY").workplane(offset=-0.5)
               .transformed(offset=(gap_x, gap_y, 0))
               .transformed(rotate=(0, 0, math.degrees(ang)))
               .box(module_m * 1.2, module_m * 2.5, width + 1))
        gear = gear.cut(gap)
    # Bore
    gear = gear.cut(cq.Workplane("XY").workplane(offset=-0.5).circle(bore/2).extrude(width + 1))
    # Hub
    hub = cq.Workplane("XY").circle(bore + 3).extrude(width)
    bore_cut = cq.Workplane("XY").workplane(offset=-0.5).circle(bore/2).extrude(width + 1)
    return gear.union(hub).cut(bore_cut)


def timing_pulley(params):
    """GT2/HTD timing belt pulley."""
    teeth = params.get("teeth", 20)
    pitch = params.get("pitch", 2.0)  # GT2 = 2mm
    width = params.get("belt_width", 6.0)
    bore = params.get("bore", 5.0)

    pitch_d = teeth * pitch / math.pi
    od = pitch_d + 1.0
    flange_d = od + 3.0

    # Toothed section
    body = cq.Workplane("XY").circle(od/2).extrude(width)
    # Flanges
    flange_bot = cq.Workplane("XY").circle(flange_d/2).extrude(1)
    flange_top = cq.Workplane("XY").workplane(offset=width).circle(flange_d/2).extrude(1)
    # Bore
    bore_cut = cq.Workplane("XY").workplane(offset=-1).circle(bore/2).extrude(width + 3)
    # Set screw
    ss = (cq.Workplane("XY").workplane(offset=width/2)
          .transformed(offset=(od/2 + 1, 0, 0))
          .transformed(rotate=(0, 90, 0))
          .circle(1.5).extrude(od/2 + 3))
    return body.union(flange_bot).union(flange_top).cut(bore_cut).cut(ss)


def lead_screw(params):
    """Lead screw (trapezoidal thread) with nut."""
    screw_d = params.get("screw_d", 8.0)
    length = params.get("length", 200.0)
    lead = params.get("lead", 2.0)
    nut_od = params.get("nut_od", 22.0)
    nut_l = params.get("nut_length", 15.0)
    nut_flange_d = params.get("nut_flange_d", 30.0)

    # Screw shaft
    screw = cq.Workplane("XY").circle(screw_d/2).extrude(length)
    # Thread rings (visual indication)
    num_rings = min(int(length / lead), 40)
    for i in range(num_rings):
        z = i * lead + lead/2
        ring = (cq.Workplane("XY").workplane(offset=z)
                .circle(screw_d/2 + 0.3).circle(screw_d/2).extrude(lead * 0.4))
        screw = screw.union(ring)
    # Nut (at mid-point)
    nut_z = length / 2 - nut_l / 2
    nut = (cq.Workplane("XY").workplane(offset=nut_z)
           .circle(nut_od/2).extrude(nut_l))
    # Nut flange
    flange = (cq.Workplane("XY").workplane(offset=nut_z)
              .circle(nut_flange_d/2).extrude(3))
    # Flange mounting holes
    for i in range(4):
        ang = math.radians(i * 90 + 45)
        fx = (nut_flange_d/2 - 4) * math.cos(ang)
        fy = (nut_flange_d/2 - 4) * math.sin(ang)
        fh = (cq.Workplane("XY").workplane(offset=nut_z - 0.5)
              .transformed(offset=(fx, fy, 0)).circle(1.6).extrude(4))
        flange = flange.cut(fh)
    return screw.union(nut).union(flange)


def linear_rail(params):
    """MGN linear guide rail with carriage block."""
    rail_w = params.get("rail_width", 9.0)
    rail_h = params.get("rail_height", 6.5)
    rail_l = params.get("rail_length", 150.0)
    carriage_w = params.get("carriage_width", 20.0)
    carriage_l = params.get("carriage_length", 28.0)
    carriage_h = params.get("carriage_height", 10.0)

    # Rail (long bar with groove)
    rail = (cq.Workplane("XY")
            .sketch().rect(rail_l, rail_w).finalize()
            .extrude(rail_h))
    # Top groove
    groove = (cq.Workplane("XY").workplane(offset=rail_h - 1)
              .sketch().rect(rail_l + 1, rail_w * 0.3).finalize()
              .extrude(1.5))
    rail = rail.cut(groove)
    # Rail mounting holes
    hole_sp = 20.0
    num_holes = int(rail_l / hole_sp) - 1
    for i in range(num_holes):
        hx = -(rail_l/2) + (i + 1) * hole_sp
        h = (cq.Workplane("XY").workplane(offset=-0.5)
             .transformed(offset=(hx, 0, 0)).circle(1.5).extrude(rail_h + 1))
        rail = rail.cut(h)
    # Carriage block (rides on rail)
    carriage = (cq.Workplane("XY")
                .workplane(offset=rail_h)
                .sketch().rect(carriage_l, carriage_w).vertices().fillet(1.5).finalize()
                .extrude(carriage_h))
    # Carriage mounting holes (4 corner pattern)
    cp_x = carriage_l / 2 - 4
    cp_y = carriage_w / 2 - 4
    for x, y in [(-cp_x, -cp_y), (-cp_x, cp_y), (cp_x, -cp_y), (cp_x, cp_y)]:
        ch = (cq.Workplane("XY").workplane(offset=rail_h - 0.5)
              .transformed(offset=(x, y, 0)).circle(1.5).extrude(carriage_h + 1))
        carriage = carriage.cut(ch)
    return rail.union(carriage)


# ─── SEALS & RETENTION ────────────────────────────────────

def o_ring(params):
    """Toroidal O-ring seal."""
    id_val = params.get("id", 20.0)
    cs = params.get("cross_section", 2.5)

    # Build as annular disc (torus approximation via revolution not available,
    # so we use a circular cross-section ring)
    mean_r = id_val / 2 + cs / 2
    ring = None
    segments = 24
    for i in range(segments):
        ang = 2 * math.pi * i / segments
        cx = mean_r * math.cos(ang)
        cy = mean_r * math.sin(ang)
        seg = (cq.Workplane("XY")
               .transformed(offset=(cx, cy, cs/2))
               .circle(cs/2).extrude(0.5))
        ring = seg if ring is None else ring.union(seg)
    # Fill in as solid ring
    outer = cq.Workplane("XY").circle(mean_r + cs/2).extrude(cs)
    inner = cq.Workplane("XY").workplane(offset=-0.5).circle(mean_r - cs/2).extrude(cs + 1)
    return outer.cut(inner)


def circlip(params):
    """External circlip / retaining ring (C-shaped)."""
    shaft_d = params.get("shaft_d", 10.0)
    thickness = params.get("thickness", 1.0)
    od = shaft_d + 3.0
    gap_angle = 30  # degrees

    ring = cq.Workplane("XY").circle(od/2).circle(shaft_d/2 + 0.2).extrude(thickness)
    # Cut the gap
    gap = (cq.Workplane("XY").workplane(offset=-0.5)
           .transformed(offset=(0, od/2, 0))
           .box(od * math.sin(math.radians(gap_angle/2)) * 2, od/2, thickness + 1))
    ring = ring.cut(gap)
    # Lug holes (for plier installation)
    for x_off in [-shaft_d/2 - 0.5, shaft_d/2 + 0.5]:
        lug = (cq.Workplane("XY").workplane(offset=-0.5)
               .transformed(offset=(x_off, od/2 - 1.5, 0))
               .circle(0.6).extrude(thickness + 1))
        ring = ring.cut(lug)
    return ring


def dowel_pin(params):
    """Precision dowel pin for alignment."""
    d = params.get("diameter", 5.0)
    length = params.get("length", 20.0)
    chamfer = min(0.5, d * 0.1)

    pin = cq.Workplane("XY").circle(d/2).extrude(length)
    # Chamfer top and bottom via small tapered rings
    for z in [-0.1, length - chamfer]:
        cham = (cq.Workplane("XY").workplane(offset=z)
                .circle(d/2 + 0.1).extrude(chamfer + 0.2))
        pin = pin.cut(
            cq.Workplane("XY").workplane(offset=z)
            .circle(d/2 + 0.5).circle(d/2).extrude(chamfer + 0.2)
        )
    return pin


def keyway_key(params):
    """Shaft key (square or rectangular, DIN 6885)."""
    width = params.get("width", 3.0)
    height = params.get("height", 3.0)
    length = params.get("length", 12.0)

    key = (cq.Workplane("XY")
           .sketch().rect(length, width).finalize()
           .extrude(height))
    return key


# ─── EXTRUSIONS & STRUCTURAL ─────────────────────────────

def aluminium_extrusion(params):
    """V-slot / T-slot aluminium extrusion profile (2020, 2040, 4040)."""
    size = params.get("size", 20.0)  # 20 for 2020
    width = params.get("width", 20.0)  # 20 for 2020, 40 for 2040
    length = params.get("length", 200.0)
    slot_w = params.get("slot_width", 6.0)
    slot_depth = params.get("slot_depth", 6.0)

    # Outer profile
    profile = (cq.Workplane("XY")
               .sketch().rect(length, width).finalize()
               .extrude(size))
    # Center bore
    bore = (cq.Workplane("XY").workplane(offset=-0.5)
            .sketch().rect(length + 1, 4.2).finalize()
            .extrude(size + 1))
    # Slots on each face (4 for 2020, 6 for 2040 etc)
    # Top and bottom slots (along length)
    for z_off in [-0.5, size - slot_depth + 0.5]:
        slot = (cq.Workplane("XY").workplane(offset=z_off)
                .sketch().rect(length + 1, slot_w).finalize()
                .extrude(slot_depth))
        profile = profile.cut(slot)
    # Side slots
    for y_off in [-(width/2 - slot_depth/2 + 0.5), width/2 - slot_depth/2 + 0.5]:
        slot = (cq.Workplane("XY")
                .transformed(offset=(0, y_off, size/2))
                .box(length + 1, slot_depth, slot_w))
        profile = profile.cut(slot)
    # Internal web cutouts (lightening)
    profile = profile.cut(bore)
    return profile


def corner_bracket_extrusion(params):
    """90-degree corner bracket for aluminium extrusion."""
    size = params.get("size", 20.0)
    thickness = params.get("thickness", 4.0)
    length = params.get("length", 20.0)

    # L-shape
    leg_a = (cq.Workplane("XY")
             .transformed(offset=(size/2, 0, thickness/2))
             .box(size, length, thickness))
    leg_b = (cq.Workplane("XY")
             .transformed(offset=(thickness/2, 0, size/2))
             .box(thickness, length, size))
    bracket = leg_a.union(leg_b)
    # Gusset (diagonal brace)
    gusset = (cq.Workplane("XY")
              .transformed(offset=(size*0.35, 0, size*0.35))
              .transformed(rotate=(0, 45, 0))
              .box(size * 0.5, length, thickness * 0.7))
    bracket = bracket.union(gusset)
    # Slot holes (for T-nuts)
    for x, z in [(size/2, thickness/2), (thickness/2, size/2)]:
        hole = (cq.Workplane("XY")
                .transformed(offset=(x, 0, z))
                .transformed(rotate=(90, 0, 0))
                .sketch().rect(5.5, 3.5).vertices().fillet(1).finalize()
                .extrude(length + 1))
        bracket = bracket.cut(hole)
    return bracket


def t_nut(params):
    """T-nut / hammer nut for aluminium extrusion slot."""
    slot_w = params.get("slot_width", 6.0)
    nut_l = params.get("length", 10.0)
    nut_w = params.get("width", 10.0)
    thickness = params.get("thickness", 4.0)
    thread = params.get("thread_d", 5.0)

    # T-shaped cross section
    # Wide base (sits in slot)
    base = (cq.Workplane("XY")
            .sketch().rect(nut_l, slot_w - 0.5).finalize()
            .extrude(thickness / 2))
    # Narrow top (pokes through slot opening)
    top = (cq.Workplane("XY").workplane(offset=thickness / 2)
           .sketch().rect(nut_l, nut_w).finalize()
           .extrude(thickness / 2))
    nut = base.union(top)
    # Thread hole
    hole = (cq.Workplane("XY").workplane(offset=-0.5)
            .circle(thread / 2).extrude(thickness + 1))
    nut = nut.cut(hole)
    return nut


def din_rail(params):
    """35mm DIN rail (top-hat profile) section."""
    length = params.get("length", 200.0)
    rail_w = params.get("width", 35.0)
    rail_h = params.get("height", 7.5)
    lip = params.get("lip_width", 5.0)
    thickness = params.get("thickness", 1.0)

    # Top-hat profile: flat base with turned-up edges
    base = (cq.Workplane("XY")
            .sketch().rect(length, rail_w).finalize()
            .extrude(thickness))
    # Side walls
    for y_off in [-(rail_w/2 - thickness/2), rail_w/2 - thickness/2]:
        wall = (cq.Workplane("XY")
                .transformed(offset=(0, y_off, rail_h/2))
                .box(length, thickness, rail_h))
        base = base.union(wall)
    # Inward lips
    for y_off in [-(rail_w/2 - lip/2), rail_w/2 - lip/2]:
        lip_part = (cq.Workplane("XY").workplane(offset=rail_h - thickness)
                    .transformed(offset=(0, y_off, 0))
                    .sketch().rect(length, lip).finalize()
                    .extrude(thickness))
        base = base.union(lip_part)
    # Mounting slots
    slot_sp = 25.0
    num_slots = int(length / slot_sp) - 1
    for i in range(num_slots):
        sx = -(length/2) + (i + 1) * slot_sp
        slot = (cq.Workplane("XY").workplane(offset=-0.5)
                .transformed(offset=(sx, 0, 0))
                .sketch().rect(6, 12).vertices().fillet(2).finalize()
                .extrude(thickness + 1))
        base = base.cut(slot)
    return base


# ─── FIXINGS & HARDWARE ──────────────────────────────────

def rivet(params):
    """Blind / pop rivet."""
    body_d = params.get("body_d", 4.0)
    head_d = params.get("head_d", 8.0)
    grip_l = params.get("grip_length", 10.0)

    # Rivet body
    body = cq.Workplane("XY").circle(body_d/2).extrude(grip_l)
    # Head (domed)
    head = cq.Workplane("XY").workplane(offset=grip_l).circle(head_d/2).extrude(1.5)
    # Mandrel stub
    mandrel = cq.Workplane("XY").workplane(offset=grip_l + 1.5).circle(body_d/4).extrude(2)
    return body.union(head).union(mandrel)


def threaded_rod(params):
    """Threaded rod / studding with visible thread rings."""
    d = params.get("diameter", 8.0)
    length = params.get("length", 100.0)

    rod = cq.Workplane("XY").circle(d/2).extrude(length)
    pitch = d * 0.15 + 0.5
    num_rings = min(int(length / pitch), 50)
    for i in range(num_rings):
        z = i * pitch + pitch/2
        ring = (cq.Workplane("XY").workplane(offset=z)
                .circle(d/2 + 0.2).circle(d/2).extrude(pitch * 0.35))
        rod = rod.union(ring)
    return rod


def set_screw(params):
    """Set screw / grub screw (headless, hex socket)."""
    d = params.get("diameter", 3.0)
    length = params.get("length", 5.0)
    hex_size = d * 0.5

    body = cq.Workplane("XY").circle(d/2).extrude(length)
    # Hex socket
    socket = (cq.Workplane("XY").workplane(offset=length - d * 0.4)
              .polygon(6, hex_size).extrude(d * 0.5))
    body = body.cut(socket)
    # Cup point (concave tip)
    cup = (cq.Workplane("XY").workplane(offset=-0.5)
           .circle(d/3).extrude(1))
    body = body.cut(cup)
    return body


def levelling_foot(params):
    """Threaded adjustable levelling foot."""
    pad_d = params.get("pad_d", 30.0)
    thread_d = params.get("thread_d", 8.0)
    thread_l = params.get("thread_length", 20.0)

    # Rubber pad
    pad = cq.Workplane("XY").circle(pad_d/2).extrude(5)
    # Metal disc
    disc = cq.Workplane("XY").workplane(offset=5).circle(pad_d/2 - 2).extrude(3)
    # Threaded stud
    stud = cq.Workplane("XY").workplane(offset=8).circle(thread_d/2).extrude(thread_l)
    return pad.union(disc).union(stud)


def rubber_foot(params):
    """Adhesive rubber foot / bumper."""
    d = params.get("diameter", 12.0)
    h = params.get("height", 5.0)

    foot = cq.Workplane("XY").circle(d/2).extrude(h)
    # Slight dome on top
    dome = cq.Workplane("XY").workplane(offset=h).circle(d/2 - 1).extrude(1)
    return foot.union(dome)


def cable_gland(params):
    """Cable gland / grommet for panel pass-through."""
    thread_d = params.get("thread_d", 12.0)
    thread_l = params.get("thread_length", 10.0)
    body_d = params.get("body_d", 18.0)
    cable_d = params.get("cable_d", 6.0)

    # Body (hex section)
    body = cq.Workplane("XY").polygon(6, body_d).extrude(8)
    # Thread
    thread = cq.Workplane("XY").workplane(offset=-thread_l).circle(thread_d/2).extrude(thread_l)
    # Cap nut
    cap = cq.Workplane("XY").workplane(offset=8).circle(body_d/2 - 1).extrude(6)
    # Cable bore
    bore = cq.Workplane("XY").workplane(offset=-thread_l - 0.5).circle(cable_d/2).extrude(thread_l + 15)
    return body.union(thread).union(cap).cut(bore)


def hinge_butt(params):
    """Butt hinge with pin barrel."""
    leaf_w = params.get("leaf_width", 25.0)
    leaf_h = params.get("leaf_height", 50.0)
    thickness = params.get("thickness", 1.5)
    pin_d = params.get("pin_d", 4.0)

    # Leaf A
    leaf_a = (cq.Workplane("XY")
              .sketch().rect(leaf_w, leaf_h).finalize()
              .extrude(thickness))
    # Leaf B
    leaf_b = (cq.Workplane("XY")
              .transformed(offset=(leaf_w, 0, 0))
              .sketch().rect(leaf_w, leaf_h).finalize()
              .extrude(thickness))
    # Pin barrel (knuckles)
    knuckle_count = 5
    kh = leaf_h / knuckle_count
    for i in range(knuckle_count):
        ky = -(leaf_h/2) + (i + 0.5) * kh
        knuckle = (cq.Workplane("XY").workplane(offset=thickness/2)
                   .transformed(offset=(leaf_w/2, ky, 0))
                   .transformed(rotate=(90, 0, 0))
                   .circle(pin_d).extrude(kh * 0.8))
        if i % 2 == 0:
            leaf_a = leaf_a.union(knuckle)
        else:
            leaf_b = leaf_b.union(knuckle)
    # Pin
    pin = (cq.Workplane("XY").workplane(offset=thickness/2)
           .transformed(offset=(leaf_w/2, 0, 0))
           .transformed(rotate=(90, 0, 0))
           .circle(pin_d/2).extrude(leaf_h))
    # Countersunk holes in leaves
    hinge = leaf_a.union(leaf_b).union(pin)
    for lx in [leaf_w/4, leaf_w + leaf_w * 3/4]:
        for ly_off in [-leaf_h/4, leaf_h/4]:
            hole = (cq.Workplane("XY").workplane(offset=-0.5)
                    .transformed(offset=(lx - leaf_w/2, ly_off, 0))
                    .circle(2).extrude(thickness + 1))
            hinge = hinge.cut(hole)
    return hinge


def p_clip(params):
    """P-clip / cable clamp for securing tubes or cables."""
    clamp_d = params.get("clamp_d", 10.0)
    thickness = params.get("thickness", 1.5)
    tab_w = params.get("tab_width", 12.0)

    # Semi-circular clamp
    clamp = (cq.Workplane("XY")
             .circle(clamp_d/2 + thickness)
             .circle(clamp_d/2)
             .extrude(tab_w))
    # Cut bottom half to make P-shape
    cut_box = (cq.Workplane("XY").workplane(offset=-0.5)
               .transformed(offset=(-(clamp_d/2 + thickness + 2), 0, 0))
               .box(clamp_d + thickness * 2 + 4, clamp_d + 10, tab_w + 1))
    # Actually keep top semicircle, add tab below
    # Tab
    tab = (cq.Workplane("XY")
           .transformed(offset=(0, -(clamp_d/2 + thickness + 4), tab_w/2))
           .box(thickness, 8, tab_w))
    # Mounting hole
    hole = (cq.Workplane("XY")
            .transformed(offset=(0, -(clamp_d/2 + thickness + 6), 0))
            .circle(2).extrude(tab_w + 1))
    return clamp.union(tab).cut(hole)


def compression_fitting(params):
    """Compression tube fitting (olives/ferrules)."""
    tube_od = params.get("tube_od", 10.0)
    body_od = params.get("body_od", 20.0)
    body_l = params.get("body_length", 25.0)

    # Body (hex center)
    body = cq.Workplane("XY").polygon(6, body_od).extrude(body_l * 0.4)
    # Inlet thread section
    inlet = (cq.Workplane("XY").workplane(offset=-body_l * 0.3)
             .circle(body_od * 0.4).extrude(body_l * 0.3))
    # Outlet thread section
    outlet = (cq.Workplane("XY").workplane(offset=body_l * 0.4)
              .circle(body_od * 0.4).extrude(body_l * 0.3))
    # Through bore
    bore = (cq.Workplane("XY").workplane(offset=-body_l * 0.3 - 1)
            .circle(tube_od/2 - 1).extrude(body_l + 2))
    # Compression nut (on one end)
    nut = (cq.Workplane("XY").workplane(offset=-body_l * 0.3 - 8)
           .polygon(6, body_od * 0.9).extrude(8))
    nut_bore = (cq.Workplane("XY").workplane(offset=-body_l * 0.3 - 9)
                .circle(tube_od/2 + 0.5).extrude(10))
    return body.union(inlet).union(outlet).cut(bore).union(nut).cut(nut_bore)


def push_fit_connector(params):
    """Pneumatic / water push-to-connect fitting."""
    tube_od = params.get("tube_od", 6.0)
    thread_d = params.get("thread_d", 10.0)
    body_d = params.get("body_d", 16.0)

    # Body
    body = cq.Workplane("XY").circle(body_d/2).extrude(15)
    # Thread section
    thread = cq.Workplane("XY").workplane(offset=-10).circle(thread_d/2).extrude(10)
    # Collet ring (push-to-release)
    collet = (cq.Workplane("XY").workplane(offset=15)
              .circle(tube_od/2 + 3).extrude(4))
    # Tube bore
    bore = (cq.Workplane("XY").workplane(offset=-11)
            .circle(tube_od/2).extrude(30))
    return body.union(thread).union(collet).cut(bore)


def thrust_washer(params):
    """Thrust washer / thrust bearing disc."""
    od = params.get("od", 20.0)
    id_val = params.get("id", 10.0)
    thickness = params.get("thickness", 1.5)

    washer = cq.Workplane("XY").circle(od/2).circle(id_val/2).extrude(thickness)
    # Oil grooves (radial slots)
    for i in range(4):
        ang = math.radians(i * 90 + 22.5)
        gx = ((od + id_val) / 4) * math.cos(ang)
        gy = ((od + id_val) / 4) * math.sin(ang)
        groove = (cq.Workplane("XY").workplane(offset=thickness - 0.3)
                  .transformed(offset=(gx, gy, 0))
                  .transformed(rotate=(0, 0, math.degrees(ang)))
                  .box((od - id_val) / 2 - 2, 1, 0.5))
        washer = washer.cut(groove)
    return washer


# ─── REGISTRY ─────────────────────────────────────────────

TIER1_EXPANSION = {
    "compression_spring": {
        "function": compression_spring, "name": "Compression Spring", "category": "spring",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "spring"],
        "param_schema": {"od": {"type": "number", "default": 10.0, "unit": "mm"},
                         "wire_d": {"type": "number", "default": 1.2, "unit": "mm"},
                         "free_length": {"type": "number", "default": 25.0, "unit": "mm"},
                         "active_coils": {"type": "integer", "default": 8}},
    },
    "torsion_spring": {
        "function": torsion_spring, "name": "Torsion Spring", "category": "spring",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "spring"],
        "param_schema": {"od": {"type": "number", "default": 12.0, "unit": "mm"},
                         "coils": {"type": "integer", "default": 4}},
    },
    "shaft": {
        "function": shaft, "name": "Round Shaft", "category": "power_transmission",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "shaft"],
        "param_schema": {"diameter": {"type": "number", "default": 8.0, "unit": "mm"},
                         "length": {"type": "number", "default": 100.0, "unit": "mm"},
                         "keyway": {"type": "boolean", "default": False}},
    },
    "shaft_coupling_jaw": {
        "function": shaft_coupling_jaw, "name": "Jaw Shaft Coupling", "category": "power_transmission",
        "default_colour": "#C0C0C0", "visual_tags": ["aluminium", "coupling"],
        "param_schema": {"od": {"type": "number", "default": 25.0, "unit": "mm"},
                         "bore": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "spur_gear": {
        "function": spur_gear, "name": "Spur Gear", "category": "gear",
        "default_colour": "#808080", "visual_tags": ["steel", "gear"],
        "param_schema": {"module": {"type": "number", "default": 1.0},
                         "teeth": {"type": "integer", "default": 20},
                         "width": {"type": "number", "default": 8.0, "unit": "mm"},
                         "bore": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "timing_pulley": {
        "function": timing_pulley, "name": "Timing Belt Pulley", "category": "power_transmission",
        "default_colour": "#C0C0C0", "visual_tags": ["aluminium", "pulley"],
        "param_schema": {"teeth": {"type": "integer", "default": 20},
                         "pitch": {"type": "number", "default": 2.0, "unit": "mm"},
                         "bore": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "lead_screw": {
        "function": lead_screw, "name": "Lead Screw + Nut", "category": "linear_motion",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "lead_screw"],
        "param_schema": {"screw_d": {"type": "number", "default": 8.0, "unit": "mm"},
                         "length": {"type": "number", "default": 200.0, "unit": "mm"}},
    },
    "linear_rail": {
        "function": linear_rail, "name": "Linear Guide Rail + Carriage", "category": "linear_motion",
        "default_colour": "#808080", "visual_tags": ["steel", "linear_motion"],
        "param_schema": {"rail_width": {"type": "number", "default": 9.0, "unit": "mm"},
                         "rail_length": {"type": "number", "default": 150.0, "unit": "mm"}},
    },
    "o_ring": {
        "function": o_ring, "name": "O-Ring Seal", "category": "seal",
        "default_colour": "#1A1A1A", "visual_tags": ["rubber", "seal"],
        "param_schema": {"id": {"type": "number", "default": 20.0, "unit": "mm"},
                         "cross_section": {"type": "number", "default": 2.5, "unit": "mm"}},
    },
    "circlip": {
        "function": circlip, "name": "External Circlip", "category": "retention",
        "default_colour": "#404040", "visual_tags": ["steel", "retention"],
        "param_schema": {"shaft_d": {"type": "number", "default": 10.0, "unit": "mm"}},
    },
    "dowel_pin": {
        "function": dowel_pin, "name": "Dowel Pin", "category": "alignment",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "precision"],
        "param_schema": {"diameter": {"type": "number", "default": 5.0, "unit": "mm"},
                         "length": {"type": "number", "default": 20.0, "unit": "mm"}},
    },
    "keyway_key": {
        "function": keyway_key, "name": "Shaft Key (DIN 6885)", "category": "power_transmission",
        "default_colour": "#A0A0A0", "visual_tags": ["steel"],
        "param_schema": {"width": {"type": "number", "default": 3.0, "unit": "mm"},
                         "height": {"type": "number", "default": 3.0, "unit": "mm"},
                         "length": {"type": "number", "default": 12.0, "unit": "mm"}},
    },
    "aluminium_extrusion": {
        "function": aluminium_extrusion, "name": "Aluminium Extrusion (V-Slot)", "category": "structural",
        "default_colour": "#D0D0D0", "visual_tags": ["aluminium", "extrusion", "structural"],
        "param_schema": {"size": {"type": "number", "default": 20.0, "unit": "mm", "enum": [20, 30, 40]},
                         "width": {"type": "number", "default": 20.0, "unit": "mm"},
                         "length": {"type": "number", "default": 200.0, "unit": "mm"}},
    },
    "corner_bracket_extrusion": {
        "function": corner_bracket_extrusion, "name": "Extrusion Corner Bracket", "category": "structural",
        "default_colour": "#C0C0C0", "visual_tags": ["aluminium", "bracket"],
        "param_schema": {"size": {"type": "number", "default": 20.0, "unit": "mm"}},
    },
    "t_nut": {
        "function": t_nut, "name": "T-Nut (Extrusion Slot)", "category": "fastener",
        "default_colour": "#808080", "visual_tags": ["steel", "fastener"],
        "param_schema": {"slot_width": {"type": "number", "default": 6.0, "unit": "mm"},
                         "thread_d": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "din_rail": {
        "function": din_rail, "name": "DIN Rail (35mm)", "category": "structural",
        "default_colour": "#D0D0D0", "visual_tags": ["steel", "structural", "electrical"],
        "param_schema": {"length": {"type": "number", "default": 200.0, "unit": "mm"}},
    },
    "rivet": {
        "function": rivet, "name": "Blind Rivet", "category": "fastener",
        "default_colour": "#C0C0C0", "visual_tags": ["aluminium", "fastener"],
        "param_schema": {"body_d": {"type": "number", "default": 4.0, "unit": "mm"},
                         "grip_length": {"type": "number", "default": 10.0, "unit": "mm"}},
    },
    "threaded_rod": {
        "function": threaded_rod, "name": "Threaded Rod / Studding", "category": "fastener",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "threaded"],
        "param_schema": {"diameter": {"type": "number", "default": 8.0, "unit": "mm"},
                         "length": {"type": "number", "default": 100.0, "unit": "mm"}},
    },
    "set_screw": {
        "function": set_screw, "name": "Set Screw / Grub Screw", "category": "fastener",
        "default_colour": "#404040", "visual_tags": ["steel", "fastener"],
        "param_schema": {"diameter": {"type": "number", "default": 3.0, "unit": "mm"},
                         "length": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "levelling_foot": {
        "function": levelling_foot, "name": "Levelling Foot", "category": "structural",
        "default_colour": "#2F2F2F", "visual_tags": ["rubber", "steel"],
        "param_schema": {"pad_d": {"type": "number", "default": 30.0, "unit": "mm"},
                         "thread_d": {"type": "number", "default": 8.0, "unit": "mm"}},
    },
    "rubber_foot": {
        "function": rubber_foot, "name": "Rubber Bumper Foot", "category": "structural",
        "default_colour": "#1A1A1A", "visual_tags": ["rubber"],
        "param_schema": {"diameter": {"type": "number", "default": 12.0, "unit": "mm"},
                         "height": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "cable_gland": {
        "function": cable_gland, "name": "Cable Gland", "category": "enclosure",
        "default_colour": "#1A1A1A", "visual_tags": ["nylon", "enclosure"],
        "param_schema": {"thread_d": {"type": "number", "default": 12.0, "unit": "mm"},
                         "cable_d": {"type": "number", "default": 6.0, "unit": "mm"}},
    },
    "hinge_butt": {
        "function": hinge_butt, "name": "Butt Hinge", "category": "hardware",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "hinge"],
        "param_schema": {"leaf_width": {"type": "number", "default": 25.0, "unit": "mm"},
                         "leaf_height": {"type": "number", "default": 50.0, "unit": "mm"}},
    },
    "p_clip": {
        "function": p_clip, "name": "P-Clip / Cable Clamp", "category": "hardware",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "clamp"],
        "param_schema": {"clamp_d": {"type": "number", "default": 10.0, "unit": "mm"}},
    },
    "compression_fitting": {
        "function": compression_fitting, "name": "Compression Tube Fitting", "category": "plumbing",
        "default_colour": "#DAA520", "visual_tags": ["brass", "plumbing"],
        "param_schema": {"tube_od": {"type": "number", "default": 10.0, "unit": "mm"}},
    },
    "push_fit_connector": {
        "function": push_fit_connector, "name": "Push-Fit Connector", "category": "plumbing",
        "default_colour": "#E0E0E0", "visual_tags": ["plastic", "pneumatic"],
        "param_schema": {"tube_od": {"type": "number", "default": 6.0, "unit": "mm"}},
    },
    "thrust_washer": {
        "function": thrust_washer, "name": "Thrust Washer", "category": "bearing",
        "default_colour": "#808080", "visual_tags": ["bronze", "bearing"],
        "param_schema": {"od": {"type": "number", "default": 20.0, "unit": "mm"},
                         "id": {"type": "number", "default": 10.0, "unit": "mm"}},
    },
}
