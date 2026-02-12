"""
ForgeOS Component Geometry Library — Tier 3: Portal Frame Buildings
=====================================================================
Primary steelwork (rafters, columns, haunches), secondary steelwork
(purlins, side rails, bracing), connections (end plates, base plates,
splice plates), cladding (profiled sheet, composite panel, rooflights),
industrial doors (roller shutter, sectional), drainage, and fixings.
UK steel construction per SCI P252, BS EN 1993, BCSA guidance.
"""

import cadquery as cq
import math


# ═════════════════════════════════════════════════════════════
# PRIMARY STRUCTURE
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# SECONDARY STEELWORK
# ═════════════════════════════════════════════════════════════

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


def purlin_zed_simple(params):
    """Simplified Z purlin using boxes."""
    depth = params.get("depth", 200.0)
    flange = params.get("flange_width", 65.0)
    t = params.get("thickness", 2.0)
    length = params.get("length", 2000.0)

    web = cq.Workplane("XY").box(t, length, depth)
    top_f = (cq.Workplane("XY")
             .transformed(offset=(-(flange/2 - t/2), 0, depth/2 - t/2))
             .box(flange, length, t))
    bot_f = (cq.Workplane("XY")
             .transformed(offset=(flange/2 - t/2, 0, -(depth/2 - t/2)))
             .box(flange, length, t))
    return web.union(top_f).union(bot_f)


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


# ═════════════════════════════════════════════════════════════
# CONNECTIONS
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# CLADDING & ENVELOPE
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# DOORS
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# DRAINAGE
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# FIXINGS & ACCESSORIES
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# REGISTRY
# ═════════════════════════════════════════════════════════════

TIER3_PORTAL = {
    # Primary Structure
    "portal_rafter": {
        "function": portal_rafter, "name": "Portal Frame Rafter (UKB)", "category": "primary_structure",
        "default_colour": "#708090", "visual_tags": ["steel", "structural"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 457.0, "unit": "mm", "enum": [305, 356, 406, 457, 533, 610]}},
    },
    "portal_column": {
        "function": portal_column, "name": "Portal Frame Column (UKB)", "category": "primary_structure",
        "default_colour": "#708090", "visual_tags": ["steel", "structural"],
        "param_schema": {"height": {"type": "number", "default": 6000.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 457.0, "unit": "mm"}},
    },
    "base_plate": {
        "function": base_plate, "name": "Column Base Plate", "category": "primary_structure",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {"plate_width": {"type": "number", "default": 400.0, "unit": "mm"},
                         "bolt_holes": {"type": "integer", "default": 4, "enum": [4, 6]}},
    },
    "eaves_haunch": {
        "function": eaves_haunch, "name": "Eaves Haunch", "category": "primary_structure",
        "default_colour": "#708090", "visual_tags": ["steel", "structural"],
        "param_schema": {"length": {"type": "number", "default": 1500.0, "unit": "mm"},
                         "depth_deep": {"type": "number", "default": 900.0, "unit": "mm"}},
    },
    "apex_bracket": {
        "function": apex_bracket, "name": "Apex / Ridge Bracket Plate", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {"rafter_depth": {"type": "number", "default": 457.0, "unit": "mm"}},
    },
    "crane_beam": {
        "function": crane_beam, "name": "Crane Beam / Gantry Girder", "category": "primary_structure",
        "default_colour": "#708090", "visual_tags": ["steel", "structural", "crane"],
        "param_schema": {"length": {"type": "number", "default": 6000.0, "unit": "mm"},
                         "main_depth": {"type": "number", "default": 610.0, "unit": "mm"}},
    },
    # Secondary Steelwork
    "purlin_zed": {
        "function": purlin_zed, "name": "Zed Purlin (Cold-Formed)", "category": "secondary",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "cold_formed"],
        "param_schema": {"depth": {"type": "number", "default": 200.0, "unit": "mm", "enum": [142, 172, 202, 232, 262]},
                         "length": {"type": "number", "default": 2000.0, "unit": "mm"}},
    },
    "side_rail": {
        "function": side_rail, "name": "Side Rail / Cladding Rail", "category": "secondary",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "cold_formed"],
        "param_schema": {"depth": {"type": "number", "default": 175.0, "unit": "mm"}},
    },
    "eaves_beam": {
        "function": eaves_beam, "name": "Eaves Beam (PFC)", "category": "secondary",
        "default_colour": "#708090", "visual_tags": ["steel", "structural"],
        "param_schema": {"length": {"type": "number", "default": 6000.0, "unit": "mm"}},
    },
    "cross_bracing": {
        "function": cross_bracing, "name": "Cross Bracing (Flat Bar)", "category": "secondary",
        "default_colour": "#808080", "visual_tags": ["steel", "bracing"],
        "param_schema": {"bay_width": {"type": "number", "default": 6000.0, "unit": "mm"},
                         "bay_height": {"type": "number", "default": 6000.0, "unit": "mm"}},
    },
    "gable_post": {
        "function": gable_post, "name": "Gable Post (UC Section)", "category": "secondary",
        "default_colour": "#708090", "visual_tags": ["steel", "structural"],
        "param_schema": {"height": {"type": "number", "default": 6000.0, "unit": "mm"}},
    },
    "sag_rod": {
        "function": sag_rod, "name": "Anti-Sag Rod", "category": "secondary",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "bracing"],
        "param_schema": {"length": {"type": "number", "default": 1500.0, "unit": "mm"}},
    },
    # Connections
    "end_plate_connection": {
        "function": end_plate_connection, "name": "Bolted End Plate (Moment)", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {"plate_height": {"type": "number", "default": 550.0, "unit": "mm"},
                         "bolt_rows": {"type": "integer", "default": 6}},
    },
    "fin_plate": {
        "function": fin_plate, "name": "Fin Plate (Shear Connection)", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {"bolts": {"type": "integer", "default": 3, "enum": [2, 3, 4, 5]}},
    },
    "splice_plate": {
        "function": splice_plate, "name": "Splice Plate (Pair)", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {"bolt_rows": {"type": "integer", "default": 4}},
    },
    "holding_down_bolt": {
        "function": holding_down_bolt, "name": "Holding Down Bolt (Cast-In)", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "foundation"],
        "param_schema": {"bolt_diameter": {"type": "number", "default": 24.0, "unit": "mm", "enum": [16, 20, 24, 30]}},
    },
    "purlin_cleat": {
        "function": purlin_cleat, "name": "Purlin Cleat (Angle Bracket)", "category": "connection",
        "default_colour": "#808080", "visual_tags": ["steel", "connection"],
        "param_schema": {},
    },
    # Cladding
    "profiled_roof_sheet": {
        "function": profiled_roof_sheet, "name": "Trapezoidal Roof Sheet", "category": "cladding",
        "default_colour": "#A0A0B0", "visual_tags": ["steel", "cladding", "roofing"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"},
                         "rib_height": {"type": "number", "default": 32.0, "unit": "mm", "enum": [25, 32, 35]}},
    },
    "composite_panel": {
        "function": composite_panel, "name": "Insulated Composite Panel", "category": "cladding",
        "default_colour": "#D0D0D0", "visual_tags": ["steel", "PIR", "insulation"],
        "param_schema": {"thickness": {"type": "number", "default": 80.0, "unit": "mm", "enum": [40, 60, 80, 100, 120]}},
    },
    "rooflight_panel": {
        "function": rooflight_panel, "name": "GRP Rooflight Panel", "category": "cladding",
        "default_colour": "#E0F0FF", "visual_tags": ["GRP", "translucent", "roofing"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"}},
    },
    "ridge_flashing": {
        "function": ridge_flashing, "name": "Ridge Flashing", "category": "cladding",
        "default_colour": "#A0A0B0", "visual_tags": ["steel", "flashing"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"}},
    },
    # Doors
    "roller_shutter_door": {
        "function": roller_shutter_door, "name": "Roller Shutter Door", "category": "doors",
        "default_colour": "#808080", "visual_tags": ["steel", "industrial", "doors"],
        "param_schema": {"width": {"type": "number", "default": 4000.0, "unit": "mm"},
                         "height": {"type": "number", "default": 4500.0, "unit": "mm"}},
    },
    "sectional_overhead_door": {
        "function": sectional_overhead_door, "name": "Sectional Overhead Door", "category": "doors",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "insulated", "doors"],
        "param_schema": {"width": {"type": "number", "default": 4000.0, "unit": "mm"},
                         "height": {"type": "number", "default": 4200.0, "unit": "mm"}},
    },
    "personnel_door_steel": {
        "function": personnel_door_steel, "name": "Steel Personnel Door", "category": "doors",
        "default_colour": "#708090", "visual_tags": ["steel", "doors"],
        "param_schema": {},
    },
    # Drainage
    "valley_gutter": {
        "function": valley_gutter, "name": "Valley / Box Gutter", "category": "drainage",
        "default_colour": "#808080", "visual_tags": ["steel", "drainage"],
        "param_schema": {"width": {"type": "number", "default": 600.0, "unit": "mm"}},
    },
    "industrial_downpipe": {
        "function": industrial_downpipe, "name": "Industrial Downpipe", "category": "drainage",
        "default_colour": "#808080", "visual_tags": ["steel", "drainage"],
        "param_schema": {"diameter": {"type": "number", "default": 100.0, "unit": "mm", "enum": [75, 100, 150]}},
    },
    # Fixings & Accessories
    "tek_screw": {
        "function": tek_screw, "name": "Self-Drilling Tek Screw", "category": "fixings",
        "default_colour": "#C0C0C0", "visual_tags": ["steel", "fixing"],
        "param_schema": {"length": {"type": "number", "default": 65.0, "unit": "mm", "enum": [32, 45, 55, 65, 85]}},
    },
    "smoke_vent": {
        "function": smoke_vent, "name": "Smoke Vent / AOV Rooflight", "category": "accessories",
        "default_colour": "#D0D0D0", "visual_tags": ["steel", "polycarbonate", "fire_safety"],
        "param_schema": {"width": {"type": "number", "default": 1200.0, "unit": "mm"}},
    },
}
