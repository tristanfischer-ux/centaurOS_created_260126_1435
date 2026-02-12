"""
ForgeOS Component Geometry Library — Tier 3: Architectural Styles
==================================================================
Style-defining components for UK architectural periods.
Each style has ~7 signature elements modelled as parametric CadQuery geometry.
These are the distinctive elements that define a style — not generic building
components (those are in tier3_house / tier3_timber_frame / tier3_portal).

Georgian | Victorian | Tudor | Arts & Crafts | Neo-Classical
Art Deco | Edwardian | Brutalist/Modernist | Contemporary
"""

import cadquery as cq
import math


# ═════════════════════════════════════════════════════════════
# GEORGIAN (1714-1830)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# VICTORIAN (1837-1901)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# TUDOR (1485-1603)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# ARTS & CRAFTS (1880-1920)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# NEO-CLASSICAL / PALLADIAN
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# ART DECO (1920-1940)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# BRUTALIST / MODERNIST (1950s-1970s)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# CONTEMPORARY UK (2000+)
# ═════════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════
# REGISTRY
# ═════════════════════════════════════════════════════════════

TIER3_ARCH_STYLES = {
    # ── Georgian ──
    "georgian_sash_window": {
        "function": georgian_sash_window, "name": "Georgian Sash Window (6/6)", "category": "georgian",
        "default_colour": "#F5F5DC", "visual_tags": ["timber", "glass", "Georgian"],
        "param_schema": {"width": {"type": "number", "default": 1050.0, "unit": "mm"},
                         "height": {"type": "number", "default": 1800.0, "unit": "mm"}},
    },
    "georgian_fanlight": {
        "function": georgian_fanlight, "name": "Georgian Fanlight", "category": "georgian",
        "default_colour": "#F5F5DC", "visual_tags": ["timber", "glass", "Georgian"],
        "param_schema": {"width": {"type": "number", "default": 900.0, "unit": "mm"},
                         "rays": {"type": "integer", "default": 7}},
    },
    "georgian_dentil_cornice": {
        "function": georgian_dentil_cornice, "name": "Georgian Dentil Cornice", "category": "georgian",
        "default_colour": "#F0E6D0", "visual_tags": ["stone", "plaster", "Georgian"],
        "param_schema": {"length": {"type": "number", "default": 3000.0, "unit": "mm"}},
    },
    "georgian_panelled_door": {
        "function": georgian_panelled_door, "name": "Georgian 6-Panel Door", "category": "georgian",
        "default_colour": "#2F2F2F", "visual_tags": ["timber", "Georgian"],
        "param_schema": {},
    },
    "georgian_quoin": {
        "function": georgian_quoin, "name": "Georgian Stone Quoin", "category": "georgian",
        "default_colour": "#D4C4A0", "visual_tags": ["stone", "Georgian"],
        "param_schema": {},
    },
    "georgian_iron_railing": {
        "function": georgian_iron_railing, "name": "Georgian Wrought Iron Railing", "category": "georgian",
        "default_colour": "#1C1C1C", "visual_tags": ["iron", "Georgian"],
        "param_schema": {"width": {"type": "number", "default": 1200.0, "unit": "mm"}},
    },
    # ── Victorian ──
    "victorian_bay_window": {
        "function": victorian_bay_window, "name": "Victorian Canted Bay Window", "category": "victorian",
        "default_colour": "#F5F5DC", "visual_tags": ["timber", "glass", "Victorian"],
        "param_schema": {"width": {"type": "number", "default": 2400.0, "unit": "mm"}},
    },
    "victorian_ridge_tile": {
        "function": victorian_ridge_tile, "name": "Victorian Crested Ridge Tile", "category": "victorian",
        "default_colour": "#8B4513", "visual_tags": ["clay", "Victorian"],
        "param_schema": {},
    },
    "victorian_porch_column": {
        "function": victorian_porch_column, "name": "Victorian Turned Porch Column", "category": "victorian",
        "default_colour": "#F5F5DC", "visual_tags": ["timber", "Victorian"],
        "param_schema": {"height": {"type": "number", "default": 2200.0, "unit": "mm"}},
    },
    "victorian_bargeboard": {
        "function": victorian_bargeboard, "name": "Victorian Ornate Bargeboard", "category": "victorian",
        "default_colour": "#F5F5DC", "visual_tags": ["timber", "Victorian"],
        "param_schema": {"length": {"type": "number", "default": 2500.0, "unit": "mm"}},
    },
    "victorian_tile_hanging": {
        "function": victorian_tile_hanging, "name": "Victorian Decorative Tile Hanging", "category": "victorian",
        "default_colour": "#A0522D", "visual_tags": ["clay", "Victorian"],
        "param_schema": {},
    },
    # ── Tudor ──
    "tudor_half_timber": {
        "function": tudor_half_timber, "name": "Tudor Half-Timber Frame Panel", "category": "tudor",
        "default_colour": "#5C3317", "visual_tags": ["oak", "Tudor"],
        "param_schema": {"width": {"type": "number", "default": 3000.0, "unit": "mm"}},
    },
    "tudor_herringbone_brick": {
        "function": tudor_herringbone_brick, "name": "Tudor Herringbone Brick Nogging", "category": "tudor",
        "default_colour": "#8B4513", "visual_tags": ["brick", "Tudor"],
        "param_schema": {},
    },
    "tudor_mullioned_window": {
        "function": tudor_mullioned_window, "name": "Tudor Stone Mullioned Window", "category": "tudor",
        "default_colour": "#D4C4A0", "visual_tags": ["stone", "glass", "Tudor"],
        "param_schema": {"lights": {"type": "integer", "default": 3, "enum": [2, 3, 4, 5]}},
    },
    "tudor_chimney_stack": {
        "function": tudor_chimney_stack, "name": "Tudor Decorated Chimney Stack", "category": "tudor",
        "default_colour": "#8B4513", "visual_tags": ["brick", "Tudor"],
        "param_schema": {"flues": {"type": "integer", "default": 3}},
    },
    # ── Arts & Crafts ──
    "ac_catslide_dormer": {
        "function": ac_catslide_dormer, "name": "Arts & Crafts Catslide Dormer", "category": "arts_crafts",
        "default_colour": "#8B7355", "visual_tags": ["timber", "tile", "Arts_Crafts"],
        "param_schema": {},
    },
    "ac_inglenook_surround": {
        "function": ac_inglenook_surround, "name": "Arts & Crafts Inglenook Surround", "category": "arts_crafts",
        "default_colour": "#808080", "visual_tags": ["stone", "oak", "Arts_Crafts"],
        "param_schema": {},
    },
    "ac_leaded_casement": {
        "function": ac_leaded_casement, "name": "Arts & Crafts Leaded Casement", "category": "arts_crafts",
        "default_colour": "#8B7355", "visual_tags": ["timber", "lead", "glass", "Arts_Crafts"],
        "param_schema": {},
    },
    # ── Neo-Classical ──
    "classical_column": {
        "function": classical_column, "name": "Classical Column (Doric/Ionic/Corinthian)", "category": "neo_classical",
        "default_colour": "#F0E6D0", "visual_tags": ["stone", "Classical"],
        "param_schema": {"height": {"type": "number", "default": 3000.0, "unit": "mm"},
                         "order": {"type": "string", "default": "Doric", "enum": ["Doric", "Ionic", "Corinthian"]}},
    },
    "classical_pediment": {
        "function": classical_pediment, "name": "Classical Pediment", "category": "neo_classical",
        "default_colour": "#F0E6D0", "visual_tags": ["stone", "Classical"],
        "param_schema": {"type": {"type": "string", "default": "triangular", "enum": ["triangular", "segmental"]}},
    },
    "classical_balustrade": {
        "function": classical_balustrade, "name": "Classical Balustrade", "category": "neo_classical",
        "default_colour": "#F0E6D0", "visual_tags": ["stone", "Classical"],
        "param_schema": {"length": {"type": "number", "default": 2000.0, "unit": "mm"}},
    },
    # ── Art Deco ──
    "deco_crittall_window": {
        "function": deco_crittall_window, "name": "Art Deco Crittall Steel Window", "category": "art_deco",
        "default_colour": "#2F2F2F", "visual_tags": ["steel", "glass", "Art_Deco"],
        "param_schema": {"columns": {"type": "integer", "default": 3}, "rows": {"type": "integer", "default": 4}},
    },
    "deco_sunburst_panel": {
        "function": deco_sunburst_panel, "name": "Art Deco Sunburst Panel", "category": "art_deco",
        "default_colour": "#FFD700", "visual_tags": ["metal", "Art_Deco"],
        "param_schema": {"rays": {"type": "integer", "default": 11}},
    },
    "deco_stepped_parapet": {
        "function": deco_stepped_parapet, "name": "Art Deco Stepped Parapet", "category": "art_deco",
        "default_colour": "#F0E6D0", "visual_tags": ["concrete", "Art_Deco"],
        "param_schema": {"steps": {"type": "integer", "default": 3}},
    },
    # ── Brutalist / Modernist ──
    "brise_soleil": {
        "function": brise_soleil, "name": "Brise-Soleil (Sun Shading)", "category": "brutalist",
        "default_colour": "#808080", "visual_tags": ["concrete", "aluminium", "Modernist"],
        "param_schema": {"fin_count": {"type": "integer", "default": 8}},
    },
    "brutalist_balcony": {
        "function": brutalist_balcony, "name": "Cantilevered Concrete Balcony", "category": "brutalist",
        "default_colour": "#A0A0A0", "visual_tags": ["concrete", "Brutalist"],
        "param_schema": {},
    },
    # ── Contemporary ──
    "zinc_standing_seam_panel": {
        "function": zinc_standing_seam_panel, "name": "Zinc Standing Seam Panel", "category": "contemporary",
        "default_colour": "#A0B0C0", "visual_tags": ["zinc", "Contemporary"],
        "param_schema": {},
    },
    "frameless_glass_balustrade": {
        "function": frameless_glass_balustrade, "name": "Frameless Glass Balustrade", "category": "contemporary",
        "default_colour": "#E0F0FF", "visual_tags": ["glass", "stainless", "Contemporary"],
        "param_schema": {},
    },
    "corten_panel": {
        "function": corten_panel, "name": "Corten Steel Cladding Panel", "category": "contemporary",
        "default_colour": "#8B4513", "visual_tags": ["corten", "Contemporary"],
        "param_schema": {},
    },
    "perforated_metal_screen": {
        "function": perforated_metal_screen, "name": "Perforated Metal Screen", "category": "contemporary",
        "default_colour": "#C0C0C0", "visual_tags": ["aluminium", "Contemporary"],
        "param_schema": {"hole_diameter": {"type": "number", "default": 20.0, "unit": "mm"}},
    },
}
