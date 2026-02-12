"""
ForgeOS Component Geometry Library — Tier 3: Timber Frame Buildings
=====================================================================
UK platform timber frame per TRADA / STA / BS EN 1995 (EC5).
Structural frame, floor system, roof trusses, sheathing, insulation,
external envelope, connections and fixings.
C16/C24 graded softwood, regularised sections.
"""

import cadquery as cq
import math


# ═════════════════════════════════════════════════════════════
# STRUCTURAL FRAME
# ═════════════════════════════════════════════════════════════

def sole_plate(params):
    """Sole plate (bottom rail, treated C16/C24 on DPC)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 140.0)  # wall thickness
    depth = params.get("depth", 38.0)

    plate = cq.Workplane("XY").box(length, width, depth)
    # DPC strip underneath (polythene)
    dpc = (cq.Workplane("XY").workplane(offset=-1)
           .box(length + 20, width + 20, 1))
    # Holding-down bolt holes (at 1200mm centres)
    bolt_count = max(int(length / 1200), 2)
    for i in range(bolt_count):
        bx = -(length/2 - 100) + i * (length - 200) / max(bolt_count - 1, 1)
        hole = (cq.Workplane("XY").workplane(offset=-2)
                .transformed(offset=(bx, 0, 0))
                .circle(8).extrude(depth + 4))
        plate = plate.cut(hole)
    return plate.union(dpc)


def wall_stud(params):
    """Wall stud (C16/C24 regularised)."""
    height = params.get("height", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    stud = (cq.Workplane("XY")
            .transformed(offset=(0, 0, height/2))
            .box(depth, width, height))
    return stud


def head_plate(params):
    """Top / head plate (double, for load distribution)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    # Lower plate
    lower = cq.Workplane("XY").box(length, width, depth)
    # Upper plate (staggered joints in practice)
    upper = (cq.Workplane("XY").workplane(offset=depth)
             .box(length, width, depth))
    return lower.union(upper)


def nogging(params):
    """Nogging / horizontal dwang (bracing between studs)."""
    stud_centres = params.get("stud_centres", 600.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    # Nogging fits between studs (length = centres - stud thickness)
    nog_length = stud_centres - depth
    nog = cq.Workplane("XY").box(nog_length, width, depth)
    return nog


def corner_post(params):
    """Corner post assembly (3-stud or L-shaped)."""
    height = params.get("height", 2400.0)
    width = params.get("width", 140.0)
    depth = params.get("depth", 38.0)

    # Main stud
    main = (cq.Workplane("XY")
            .transformed(offset=(0, 0, height/2))
            .box(depth, width, height))
    # Return stud (perpendicular wall)
    ret = (cq.Workplane("XY")
           .transformed(offset=(depth/2 + width/2, depth/2 - width/2, height/2))
           .box(width, depth, height))
    # Packing stud (between for drywall fix)
    pack = (cq.Workplane("XY")
            .transformed(offset=(depth/2 + depth/2, 0, height/2))
            .box(depth, width, height))
    return main.union(ret).union(pack)


def timber_lintel(params):
    """Lintel (solid timber, paired C24, or flitch beam)."""
    span = params.get("span", 1200.0)
    depth = params.get("depth", 225.0)
    thickness = params.get("thickness", 90.0)  # 2x 38 + spacer or 3x38
    bearing = params.get("bearing", 150.0)
    flitch = params.get("flitch", False)

    total_length = span + 2 * bearing
    # Outer timbers (2x)
    left = (cq.Workplane("XY")
            .transformed(offset=(0, -(thickness/2 - 19), 0))
            .box(total_length, 38, depth))
    right = (cq.Workplane("XY")
             .transformed(offset=(0, (thickness/2 - 19), 0))
             .box(total_length, 38, depth))
    result = left.union(right)
    if flitch:
        # Steel flitch plate (6mm between timbers)
        steel = cq.Workplane("XY").box(total_length, 6, depth - 10)
        result = result.union(steel)
    else:
        # Spacer / packing
        spacer = cq.Workplane("XY").box(total_length, thickness - 76, depth)
        result = result.union(spacer)
    # Bolt holes through (M12 at 400mm centres)
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


def ring_beam(params):
    """Ring beam / wall plate (at roof level, for truss bearing)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 100.0)
    depth = params.get("depth", 50.0)

    beam = cq.Workplane("XY").box(length, width, depth)
    # Strap holddown holes (at 1200mm max)
    count = max(int(length / 1200), 2)
    for i in range(count):
        bx = -(length/2 - 100) + i * (length - 200) / max(count - 1, 1)
        hole = (cq.Workplane("XY").workplane(offset=-1)
                .transformed(offset=(bx, 0, 0))
                .circle(5).extrude(depth + 2))
        beam = beam.cut(hole)
    return beam


# ═════════════════════════════════════════════════════════════
# FLOOR SYSTEM
# ═════════════════════════════════════════════════════════════

def floor_joist_solid(params):
    """Solid timber floor joist (C16/C24)."""
    length = params.get("length", 4000.0)
    depth = params.get("depth", 220.0)
    width = params.get("width", 47.0)

    joist = (cq.Workplane("XY")
             .transformed(offset=(0, 0, depth/2))
             .box(length, width, depth))
    return joist


def engineered_i_joist(params):
    """Engineered I-joist (TJI / JJI style)."""
    length = params.get("length", 4800.0)
    depth = params.get("depth", 300.0)
    flange_w = params.get("flange_width", 47.0)
    flange_h = params.get("flange_height", 38.0)
    web_t = params.get("web_thickness", 9.0)  # OSB web

    # Top flange (LVL or solid)
    tf = (cq.Workplane("XY")
          .transformed(offset=(0, 0, depth - flange_h/2))
          .box(length, flange_w, flange_h))
    # Bottom flange
    bf = (cq.Workplane("XY")
          .transformed(offset=(0, 0, flange_h/2))
          .box(length, flange_w, flange_h))
    # Web (OSB or plywood)
    web = (cq.Workplane("XY")
           .transformed(offset=(0, 0, depth/2))
           .box(length, web_t, depth - 2*flange_h))
    return tf.union(bf).union(web)


def metal_web_joist(params):
    """Metal web joist (Posi-Joist / easi-joist style)."""
    length = params.get("length", 5000.0)
    depth = params.get("depth", 254.0)
    chord_w = params.get("chord_width", 47.0)
    chord_h = params.get("chord_height", 35.0)

    # Top chord (C16 timber)
    tc = (cq.Workplane("XY")
          .transformed(offset=(0, 0, depth - chord_h/2))
          .box(length, chord_w, chord_h))
    # Bottom chord
    bc = (cq.Workplane("XY")
          .transformed(offset=(0, 0, chord_h/2))
          .box(length, chord_w, chord_h))
    # Metal V-webs (galvanised steel, at ~300mm centres)
    web_count = min(int(length / 300), 15)
    for i in range(web_count):
        wx = -(length/2 - 200) + i * (length - 400) / max(web_count - 1, 1)
        # V-shape simplified as two angled bars
        for angle in [30, -30]:
            bar = (cq.Workplane("XY")
                   .transformed(offset=(wx, 0, depth/2))
                   .transformed(rotate=(0, angle, 0))
                   .box(depth * 0.7, 1.5, 30))
            tc = tc.union(bar)
    return tc.union(bc)


def rim_board(params):
    """Rim board / band board (closes floor joist ends)."""
    length = params.get("length", 2400.0)
    depth = params.get("depth", 220.0)
    thickness = params.get("thickness", 38.0)

    board = (cq.Workplane("XY")
             .transformed(offset=(0, 0, depth/2))
             .box(length, thickness, depth))
    return board


def herringbone_strut(params):
    """Herringbone strutting (solid timber or proprietary metal)."""
    joist_depth = params.get("joist_depth", 220.0)
    joist_centres = params.get("joist_centres", 400.0)
    metal = params.get("metal", True)

    gap = joist_centres - 47  # joist width
    if metal:
        # Metal herringbone (galvanised pressed steel)
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
        # Solid timber herringbone (38x38)
        diag = math.sqrt(gap**2 + (joist_depth - 20)**2)
        angle = math.degrees(math.atan2(joist_depth - 20, gap))
        bar1 = (cq.Workplane("XY")
                .transformed(rotate=(0, angle, 0))
                .box(diag, 38, 38))
        bar2 = (cq.Workplane("XY")
                .transformed(rotate=(0, -angle, 0))
                .box(diag, 38, 38))
        return bar1.union(bar2)


def joist_hanger(params):
    """Joist hanger (galvanised steel, face-fix or masonry)."""
    joist_w = params.get("joist_width", 47.0)
    joist_d = params.get("joist_depth", 220.0)
    steel_t = params.get("steel_thickness", 2.5)

    # Back plate (fixes to header/wall)
    back = cq.Workplane("XY").box(joist_w + 60, steel_t, joist_d + 30)
    # Bottom plate
    bottom = (cq.Workplane("XY")
              .transformed(offset=(0, -(joist_w/2 + steel_t/2), -(joist_d/2 + steel_t/2 - 15)))
              .box(joist_w + 10, joist_w + steel_t, steel_t))
    # Side flanges (2)
    for side in [-1, 1]:
        flange = (cq.Workplane("XY")
                  .transformed(offset=(side * (joist_w/2 + steel_t/2), -(joist_w/2 + steel_t/2), 0))
                  .box(steel_t, joist_w + steel_t, joist_d))
        back = back.union(flange)
    # Nail holes in back plate
    for bx in [-(joist_w/2 + 20), joist_w/2 + 20]:
        for bz in [-(joist_d/4), 0, joist_d/4]:
            hole = (cq.Workplane("XY")
                    .transformed(offset=(bx, 0, bz))
                    .transformed(rotate=(90, 0, 0))
                    .circle(2.5).extrude(steel_t + 4).translate((0, -(steel_t/2 + 2), 0)))
            back = back.cut(hole)
    return back.union(bottom)


# ═════════════════════════════════════════════════════════════
# ROOF STRUCTURE
# ═════════════════════════════════════════════════════════════

def trussed_rafter(params):
    """Trussed rafter (Fink/W pattern, factory fabricated)."""
    span = params.get("span", 7200.0)
    pitch_deg = params.get("pitch_degrees", 22.5)
    chord_w = params.get("chord_width", 35.0)
    chord_h = params.get("chord_height", 72.0)

    rise = (span/2) * math.tan(math.radians(pitch_deg))
    rafter_len = (span/2) / math.cos(math.radians(pitch_deg))

    # Bottom chord (horizontal)
    bc = cq.Workplane("XY").box(span, chord_w, chord_h)
    # Left rafter (top chord)
    lr = (cq.Workplane("XY")
          .transformed(offset=(-(span/4), 0, rise/2))
          .transformed(rotate=(0, -pitch_deg, 0))
          .box(rafter_len, chord_w, chord_h))
    # Right rafter
    rr = (cq.Workplane("XY")
          .transformed(offset=(span/4, 0, rise/2))
          .transformed(rotate=(0, pitch_deg, 0))
          .box(rafter_len, chord_w, chord_h))
    # W-webs (Fink pattern — 4 diagonals)
    web_points = [
        (-(span/4), 0, span/4, rise/2),  # left outer
        (span/4, 0, -(span/4), rise/2),  # right outer (mirrored)
        (-(span/4), 0, 0, rise),  # left inner to apex
        (span/4, 0, 0, rise),  # right inner to apex
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


def cut_rafter(params):
    """Cut roof rafter (site-cut C24)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 47.0)
    depth = params.get("depth", 150.0)

    rafter = cq.Workplane("XY").box(length, width, depth)
    # Birdsmouth cut at bearing end (simplified notch)
    seat_cut = params.get("birdsmouth_seat", 50.0)
    plumb_cut = params.get("birdsmouth_plumb", 38.0)
    notch = (cq.Workplane("XY")
             .transformed(offset=(-(length/2 - plumb_cut/2), 0, -(depth/2 - seat_cut/2)))
             .box(plumb_cut, width + 2, seat_cut))
    return rafter.cut(notch)


def ridge_board(params):
    """Ridge board (C16/C24 or engineered)."""
    length = params.get("length", 6000.0)
    depth = params.get("depth", 200.0)
    thickness = params.get("thickness", 32.0)

    board = cq.Workplane("XY").box(length, thickness, depth)
    return board


def ceiling_joist(params):
    """Ceiling joist / binder (C16)."""
    length = params.get("length", 4000.0)
    depth = params.get("depth", 100.0)
    width = params.get("width", 47.0)

    joist = cq.Workplane("XY").box(length, width, depth)
    return joist


def gable_ladder(params):
    """Gable ladder frame (verge overhang support)."""
    overhang = params.get("overhang", 450.0)
    height = params.get("height", 2000.0)
    rung_spacing = params.get("rung_spacing", 600.0)

    # Two outriggers (along verge)
    result = None
    for ox in [-overhang/2 + 19, overhang/2 - 19]:
        outrigger = (cq.Workplane("XY")
                     .transformed(offset=(ox, 0, height/2))
                     .box(38, 38, height))
        result = outrigger if result is None else result.union(outrigger)
    # Rungs (horizontal noggings)
    rung_count = int(height / rung_spacing)
    for i in range(rung_count + 1):
        rz = i * rung_spacing
        rung = (cq.Workplane("XY")
                .transformed(offset=(0, 0, rz))
                .box(overhang - 76, 38, 38))
        result = result.union(rung)
    return result


# ═════════════════════════════════════════════════════════════
# SHEATHING & MEMBRANES
# ═════════════════════════════════════════════════════════════

def osb_sheathing(params):
    """OSB/3 structural sheathing board."""
    width = params.get("width", 1200.0)
    height = params.get("height", 2400.0)
    thickness = params.get("thickness", 9.0)

    board = cq.Workplane("XY").box(width, thickness, height)
    return board


def breather_membrane(params):
    """Breather membrane (vapour-open, external face)."""
    width = params.get("width", 1500.0)  # roll width
    length = params.get("length", 3000.0)  # section
    t = 0.5

    sheet = (cq.Workplane("XY")
             .transformed(offset=(0, 0, length/2))
             .box(width, t, length))
    # Overlap tape strip (top/bottom)
    tape = (cq.Workplane("XY")
            .transformed(offset=(0, -1, length - 50))
            .box(width, 1, 100))
    return sheet.union(tape)


def vcl_membrane(params):
    """Vapour control layer (warm side, polythene or intelligent)."""
    width = params.get("width", 2700.0)
    height = params.get("height", 2400.0)
    t = 0.25

    sheet = (cq.Workplane("XY")
             .transformed(offset=(0, 0, height/2))
             .box(width, t, height))
    return sheet


# ═════════════════════════════════════════════════════════════
# INSULATION
# ═════════════════════════════════════════════════════════════

def mineral_wool_batt(params):
    """Mineral wool batt insulation (between studs)."""
    width = params.get("width", 570.0)  # friction fit between 600 centres
    height = params.get("height", 1200.0)
    thickness = params.get("thickness", 140.0)

    batt = cq.Workplane("XY").box(width, thickness, height)
    return batt


def pir_insulation_board(params):
    """PIR rigid insulation board (Celotex/Kingspan style)."""
    width = params.get("width", 1200.0)
    length = params.get("length", 2400.0)
    thickness = params.get("thickness", 50.0)

    board = cq.Workplane("XY").box(width, thickness, length)
    # Tongue & groove edges (2 sides)
    tongue = (cq.Workplane("XY")
              .transformed(offset=(width/2 + 5, 0, 0))
              .box(10, thickness * 0.5, length))
    return board.union(tongue)


# ═════════════════════════════════════════════════════════════
# EXTERNAL ENVELOPE
# ═════════════════════════════════════════════════════════════

def timber_cladding_board(params):
    """Timber cladding board (larch, cedar, or treated softwood)."""
    length = params.get("length", 3000.0)
    width = params.get("width", 150.0)
    thickness = params.get("thickness", 19.0)
    profile = params.get("profile", "shiplap")

    board = cq.Workplane("XY").box(length, thickness, width)
    if profile == "shiplap":
        # Rebate on top edge
        rebate = (cq.Workplane("XY")
                  .transformed(offset=(0, -(thickness/2 - 4), width/2 - 8))
                  .box(length + 2, 8, 16))
        board = board.cut(rebate)
    elif profile == "TGV":
        # Tongue on one edge, groove on other
        tongue = (cq.Workplane("XY")
                  .transformed(offset=(0, 0, width/2 + 4))
                  .box(length, thickness * 0.4, 8))
        board = board.union(tongue)
    return board


def render_carrier_board(params):
    """Render carrier board (cement particle board or similar)."""
    width = params.get("width", 1200.0)
    height = params.get("height", 2400.0)
    thickness = params.get("thickness", 12.0)

    board = cq.Workplane("XY").box(width, thickness, height)
    return board


def cavity_closer(params):
    """Cavity closer (insulated PVC or foam)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 50.0)  # cavity width
    depth = params.get("depth", 100.0)

    body = (cq.Workplane("XY")
            .transformed(offset=(0, 0, length/2))
            .box(depth, width, length))
    return body


def wall_tie(params):
    """Wall tie (connects outer masonry leaf to timber frame)."""
    length = params.get("length", 225.0)
    tie_type = params.get("tie_type", "helical")  # helical or wire_butterfly

    if tie_type == "helical":
        # Helical stainless steel tie
        shaft = (cq.Workplane("XY")
                 .circle(2.5).extrude(length))
        # Drip point (mid length)
        drip = (cq.Workplane("XY").workplane(offset=length * 0.4)
                .transformed(offset=(0, -4, 0))
                .box(2, 8, 5))
        # Clip end (for timber frame)
        clip = (cq.Workplane("XY").workplane(offset=length - 10)
                .box(20, 10, 5))
        return shaft.union(drip).union(clip)
    else:
        # Wire butterfly tie
        wire_d = 4.0
        shaft = cq.Workplane("XY").circle(wire_d/2).extrude(length)
        # Butterfly twist in middle
        twist = (cq.Workplane("XY").workplane(offset=length/2)
                 .box(30, 30, wire_d))
        return shaft.union(twist)


# ═════════════════════════════════════════════════════════════
# CONNECTIONS & FIXINGS
# ═════════════════════════════════════════════════════════════

def framing_anchor(params):
    """Framing anchor / angle bracket (galvanised steel)."""
    height = params.get("height", 60.0)
    width = params.get("width", 40.0)
    t = params.get("thickness", 2.5)

    # L-shaped bracket
    vert = cq.Workplane("XY").box(width, t, height)
    horiz = (cq.Workplane("XY")
             .transformed(offset=(0, -(height/2 - t/2), -(height/2 - t/2)))
             .box(width, height, t))
    bracket = vert.union(horiz)
    # Nail holes
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


def holddown_strap(params):
    """Holddown / lateral restraint strap (galvanised steel)."""
    length = params.get("length", 1200.0)
    width = params.get("width", 30.0)
    t = params.get("thickness", 2.5)
    bend = params.get("bend", True)

    strap = cq.Workplane("XY").box(width, t, length)
    if bend:
        # 90-degree bend at one end (for wall-to-floor connection)
        foot = (cq.Workplane("XY")
                .transformed(offset=(0, -(length * 0.1), -(length/2 - t/2)))
                .box(width, length * 0.2, t))
        strap = strap.union(foot)
    # Nail holes along length
    hole_count = int(length / 100)
    for i in range(hole_count):
        hz = -(length/2 - 50) + i * 100
        hole = (cq.Workplane("XY")
                .transformed(offset=(0, 0, hz))
                .transformed(rotate=(90, 0, 0))
                .circle(2.5).extrude(t + 4).translate((0, -(t/2 + 2), 0)))
        strap = strap.cut(hole)
    return strap


def nail_plate(params):
    """Nail plate / truss plate (gang nail, for truss joints)."""
    width = params.get("width", 100.0)
    height = params.get("height", 150.0)
    t = params.get("thickness", 1.0)

    plate = cq.Workplane("XY").box(width, t, height)
    # Punched teeth (simplified as small projections)
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


def timber_connector(params):
    """Timber connector (shear plate or split ring)."""
    diameter = params.get("diameter", 64.0)
    t = params.get("thickness", 4.0)
    conn_type = params.get("type", "shear_plate")

    if conn_type == "shear_plate":
        # Round plate with centre bolt hole
        plate = cq.Workplane("XY").circle(diameter/2).extrude(t)
        # Centre hole
        hole = cq.Workplane("XY").circle(10).extrude(t + 2)
        plate = plate.cut(hole)
        # Rim (raised edge)
        rim = cq.Workplane("XY").circle(diameter/2).circle(diameter/2 - 3).extrude(t + 2)
        return plate.union(rim)
    else:
        # Split ring
        ring = cq.Workplane("XY").circle(diameter/2).circle(diameter/2 - 5).extrude(t)
        # Split (gap)
        split = (cq.Workplane("XY")
                 .transformed(offset=(0, diameter/2 - 5, 0))
                 .box(3, 10, t + 2))
        return ring.cut(split)


def service_batten(params):
    """Service batten / counter-batten (creates service void)."""
    length = params.get("length", 2400.0)
    width = params.get("width", 50.0)
    depth = params.get("depth", 25.0)

    batten = cq.Workplane("XY").box(length, depth, width)
    return batten


# ═════════════════════════════════════════════════════════════
# REGISTRY
# ═════════════════════════════════════════════════════════════

TIER3_TIMBER_FRAME = {
    # Structural Frame
    "sole_plate": {
        "function": sole_plate, "name": "Sole Plate (Treated, on DPC)", "category": "structural_frame",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"length": {"type": "number", "default": 2400.0, "unit": "mm"},
                         "width": {"type": "number", "default": 140.0, "unit": "mm", "enum": [89, 140, 184, 235]}},
    },
    "wall_stud": {
        "function": wall_stud, "name": "Wall Stud (C16/C24)", "category": "structural_frame",
        "default_colour": "#C4A882", "visual_tags": ["timber", "structural"],
        "param_schema": {"height": {"type": "number", "default": 2400.0, "unit": "mm"},
                         "width": {"type": "number", "default": 140.0, "unit": "mm", "enum": [89, 140, 184, 235]},
                         "depth": {"type": "number", "default": 38.0, "unit": "mm", "enum": [38, 47]}},
    },
    "head_plate": {
        "function": head_plate, "name": "Head Plate (Double)", "category": "structural_frame",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"length": {"type": "number", "default": 2400.0, "unit": "mm"}},
    },
    "nogging": {
        "function": nogging, "name": "Nogging / Dwang", "category": "structural_frame",
        "default_colour": "#C4A882", "visual_tags": ["timber", "structural"],
        "param_schema": {"stud_centres": {"type": "number", "default": 600.0, "unit": "mm", "enum": [400, 600]}},
    },
    "corner_post": {
        "function": corner_post, "name": "Corner Post Assembly", "category": "structural_frame",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"height": {"type": "number", "default": 2400.0, "unit": "mm"}},
    },
    "timber_lintel": {
        "function": timber_lintel, "name": "Timber Lintel (Solid/Flitch)", "category": "structural_frame",
        "default_colour": "#A08060", "visual_tags": ["timber", "structural"],
        "param_schema": {"span": {"type": "number", "default": 1200.0, "unit": "mm"},
                         "flitch": {"type": "boolean", "default": False}},
    },
    "ring_beam": {
        "function": ring_beam, "name": "Ring Beam / Wall Plate", "category": "structural_frame",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"}},
    },
    # Floor System
    "floor_joist_solid": {
        "function": floor_joist_solid, "name": "Solid Timber Floor Joist", "category": "floor",
        "default_colour": "#C4A882", "visual_tags": ["timber", "structural"],
        "param_schema": {"length": {"type": "number", "default": 4000.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 220.0, "unit": "mm", "enum": [145, 170, 195, 220, 245]}},
    },
    "engineered_i_joist": {
        "function": engineered_i_joist, "name": "Engineered I-Joist (TJI)", "category": "floor",
        "default_colour": "#A08060", "visual_tags": ["timber", "OSB", "engineered"],
        "param_schema": {"length": {"type": "number", "default": 4800.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 300.0, "unit": "mm", "enum": [200, 240, 300, 360, 400]}},
    },
    "metal_web_joist": {
        "function": metal_web_joist, "name": "Metal Web Joist (Posi-Joist)", "category": "floor",
        "default_colour": "#C0C0C0", "visual_tags": ["timber", "steel", "engineered"],
        "param_schema": {"length": {"type": "number", "default": 5000.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 254.0, "unit": "mm", "enum": [195, 219, 254, 302, 356]}},
    },
    "rim_board": {
        "function": rim_board, "name": "Rim Board / Band Board", "category": "floor",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"depth": {"type": "number", "default": 220.0, "unit": "mm"}},
    },
    "herringbone_strut": {
        "function": herringbone_strut, "name": "Herringbone Strutting", "category": "floor",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "bracing"],
        "param_schema": {"joist_depth": {"type": "number", "default": 220.0, "unit": "mm"},
                         "metal": {"type": "boolean", "default": True}},
    },
    "joist_hanger": {
        "function": joist_hanger, "name": "Joist Hanger (Galvanised)", "category": "floor",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "connection"],
        "param_schema": {"joist_width": {"type": "number", "default": 47.0, "unit": "mm", "enum": [38, 47, 50, 63, 75]},
                         "joist_depth": {"type": "number", "default": 220.0, "unit": "mm"}},
    },
    # Roof Structure
    "trussed_rafter": {
        "function": trussed_rafter, "name": "Trussed Rafter (Fink/W)", "category": "roof",
        "default_colour": "#C4A882", "visual_tags": ["timber", "structural", "roof"],
        "param_schema": {"span": {"type": "number", "default": 7200.0, "unit": "mm"},
                         "pitch_degrees": {"type": "number", "default": 22.5, "enum": [15, 17.5, 22.5, 30, 35, 40, 45]}},
    },
    "cut_rafter": {
        "function": cut_rafter, "name": "Cut Roof Rafter (C24)", "category": "roof",
        "default_colour": "#C4A882", "visual_tags": ["timber", "structural"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 150.0, "unit": "mm", "enum": [100, 125, 150, 175, 200]}},
    },
    "ridge_board": {
        "function": ridge_board, "name": "Ridge Board", "category": "roof",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"depth": {"type": "number", "default": 200.0, "unit": "mm"}},
    },
    "ceiling_joist": {
        "function": ceiling_joist, "name": "Ceiling Joist / Binder", "category": "roof",
        "default_colour": "#C4A882", "visual_tags": ["timber", "structural"],
        "param_schema": {"depth": {"type": "number", "default": 100.0, "unit": "mm", "enum": [50, 75, 100, 125]}},
    },
    "gable_ladder": {
        "function": gable_ladder, "name": "Gable Ladder Frame", "category": "roof",
        "default_colour": "#8B7355", "visual_tags": ["timber", "structural"],
        "param_schema": {"overhang": {"type": "number", "default": 450.0, "unit": "mm"}},
    },
    # Sheathing & Membranes
    "osb_sheathing": {
        "function": osb_sheathing, "name": "OSB/3 Sheathing Board", "category": "sheathing",
        "default_colour": "#B8A070", "visual_tags": ["OSB", "board"],
        "param_schema": {"thickness": {"type": "number", "default": 9.0, "unit": "mm", "enum": [9, 11, 15, 18]}},
    },
    "breather_membrane": {
        "function": breather_membrane, "name": "Breather Membrane", "category": "membrane",
        "default_colour": "#404040", "visual_tags": ["membrane", "vapour_open"],
        "param_schema": {},
    },
    "vcl_membrane": {
        "function": vcl_membrane, "name": "Vapour Control Layer", "category": "membrane",
        "default_colour": "#4040FF", "visual_tags": ["membrane", "vapour_barrier"],
        "param_schema": {},
    },
    # Insulation
    "mineral_wool_batt": {
        "function": mineral_wool_batt, "name": "Mineral Wool Batt Insulation", "category": "insulation",
        "default_colour": "#FFD700", "visual_tags": ["insulation", "mineral_wool"],
        "param_schema": {"thickness": {"type": "number", "default": 140.0, "unit": "mm", "enum": [50, 75, 100, 140, 150, 200]}},
    },
    "pir_insulation_board": {
        "function": pir_insulation_board, "name": "PIR Rigid Insulation Board", "category": "insulation",
        "default_colour": "#FFE4B5", "visual_tags": ["insulation", "PIR"],
        "param_schema": {"thickness": {"type": "number", "default": 50.0, "unit": "mm", "enum": [25, 30, 40, 50, 60, 75, 100, 120]}},
    },
    # External Envelope
    "timber_cladding_board": {
        "function": timber_cladding_board, "name": "Timber Cladding Board", "category": "envelope",
        "default_colour": "#8B6914", "visual_tags": ["timber", "cladding"],
        "param_schema": {"profile": {"type": "string", "default": "shiplap", "enum": ["shiplap", "TGV", "featheredge"]}},
    },
    "render_carrier_board": {
        "function": render_carrier_board, "name": "Render Carrier Board", "category": "envelope",
        "default_colour": "#A0A0A0", "visual_tags": ["cement_board", "render"],
        "param_schema": {"thickness": {"type": "number", "default": 12.0, "unit": "mm", "enum": [9, 12, 15]}},
    },
    "cavity_closer": {
        "function": cavity_closer, "name": "Cavity Closer", "category": "envelope",
        "default_colour": "#808080", "visual_tags": ["PVC", "insulation"],
        "param_schema": {"width": {"type": "number", "default": 50.0, "unit": "mm", "enum": [25, 50, 65, 75, 100]}},
    },
    "wall_tie": {
        "function": wall_tie, "name": "Wall Tie (Timber Frame)", "category": "envelope",
        "default_colour": "#C0C0C0", "visual_tags": ["stainless_steel", "fixing"],
        "param_schema": {"tie_type": {"type": "string", "default": "helical", "enum": ["helical", "butterfly"]}},
    },
    # Connections & Fixings
    "framing_anchor": {
        "function": framing_anchor, "name": "Framing Anchor / Angle Bracket", "category": "connection",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "connection"],
        "param_schema": {},
    },
    "holddown_strap": {
        "function": holddown_strap, "name": "Holddown / Restraint Strap", "category": "connection",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "connection"],
        "param_schema": {"length": {"type": "number", "default": 1200.0, "unit": "mm", "enum": [600, 800, 1000, 1200]}},
    },
    "nail_plate": {
        "function": nail_plate, "name": "Nail Plate / Truss Plate", "category": "connection",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "connection"],
        "param_schema": {"width": {"type": "number", "default": 100.0, "unit": "mm"},
                         "height": {"type": "number", "default": 150.0, "unit": "mm"}},
    },
    "timber_connector": {
        "function": timber_connector, "name": "Timber Connector (Shear Plate)", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {"diameter": {"type": "number", "default": 64.0, "unit": "mm", "enum": [50, 64, 75, 100]}},
    },
    "service_batten": {
        "function": service_batten, "name": "Service Batten / Counter-Batten", "category": "services",
        "default_colour": "#C4A882", "visual_tags": ["timber"],
        "param_schema": {"depth": {"type": "number", "default": 25.0, "unit": "mm", "enum": [25, 38, 50]}},
    },
}
