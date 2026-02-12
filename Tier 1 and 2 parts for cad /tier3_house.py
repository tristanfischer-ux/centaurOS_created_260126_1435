"""
ForgeOS Component Geometry Library — Tier 3: UK House
======================================================
Kitchen units, bathroom fittings, furniture, doors, windows,
electrical, plumbing/heating, and building fabric components.
Parametric CadQuery geometry for all standard UK residential items.
"""

import cadquery as cq
import math


# ═════════════════════════════════════════════════════════════
# KITCHEN
# ═════════════════════════════════════════════════════════════

def kitchen_base_cabinet(params):
    """Standard kitchen base cabinet (carcass + door)."""
    w = params.get("width", 600.0)
    d = params.get("depth", 570.0)
    h = params.get("height", 720.0)
    panel_t = params.get("panel_thickness", 18.0)

    # Carcass (open front box)
    outer = cq.Workplane("XY").box(w, d, h)
    inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, panel_t/2))
             .box(w - 2*panel_t, d - panel_t, h - panel_t))
    carcass = outer.cut(inner)
    # Door (front face)
    door = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - panel_t/2 - 1), 0))
            .box(w - 4, panel_t, h - 4))
    # Handle (bar style)
    handle = (cq.Workplane("XY")
              .transformed(offset=(w/2 - 30, -(d/2 + 8), h/4))
              .box(12, 16, 150))
    # Shelf
    shelf = (cq.Workplane("XY").transformed(offset=(0, 0, 0))
             .box(w - 2*panel_t - 2, d - panel_t - 10, panel_t))
    # Plinth recess at bottom
    plinth = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - 50), -(h/2 - 75)))
              .box(w + 2, 100, 150))
    return carcass.union(door).union(handle).union(shelf).cut(plinth)


def kitchen_wall_cabinet(params):
    """Wall-mounted kitchen cabinet."""
    w = params.get("width", 600.0)
    d = params.get("depth", 330.0)
    h = params.get("height", 720.0)
    panel_t = 18.0

    outer = cq.Workplane("XY").box(w, d, h)
    inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, 0))
             .box(w - 2*panel_t, d - panel_t, h - 2*panel_t))
    carcass = outer.cut(inner)
    door = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - panel_t/2 - 1), 0))
            .box(w - 4, panel_t, h - 4))
    handle = (cq.Workplane("XY")
              .transformed(offset=(w/2 - 30, -(d/2 + 8), -(h/4)))
              .box(12, 16, 150))
    # Two shelves
    for z in [-h/6, h/6]:
        shelf = (cq.Workplane("XY").transformed(offset=(0, 0, z))
                 .box(w - 2*panel_t - 2, d - panel_t - 5, panel_t))
        carcass = carcass.union(shelf)
    return carcass.union(door).union(handle)


def kitchen_tall_cabinet(params):
    """Tall larder/oven housing cabinet."""
    w = params.get("width", 600.0)
    d = params.get("depth", 570.0)
    h = params.get("height", 2150.0)
    panel_t = 18.0

    outer = cq.Workplane("XY").box(w, d, h)
    inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, panel_t/2))
             .box(w - 2*panel_t, d - panel_t, h - panel_t))
    carcass = outer.cut(inner)
    # Two doors (upper and lower)
    for z_offset, door_h in [(h/4, h/2 - 10), (-(h/4), h/2 - 10)]:
        door = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - panel_t/2 - 1), z_offset))
                .box(w - 4, panel_t, door_h))
        handle = (cq.Workplane("XY")
                  .transformed(offset=(w/2 - 30, -(d/2 + 8), z_offset))
                  .box(12, 16, 150))
        carcass = carcass.union(door).union(handle)
    # Internal shelves (4)
    for i in range(4):
        z = -(h/2 - panel_t) + (i + 1) * (h - 2*panel_t) / 5
        shelf = (cq.Workplane("XY").transformed(offset=(0, 0, z))
                 .box(w - 2*panel_t - 2, d - panel_t - 10, panel_t))
        carcass = carcass.union(shelf)
    return carcass


def kitchen_worktop(params):
    """Kitchen worktop slab."""
    w = params.get("width", 3000.0)
    d = params.get("depth", 620.0)
    t = params.get("thickness", 40.0)
    edge = params.get("edge_profile", "square")  # square, bevelled, bullnose

    top = cq.Workplane("XY").box(w, d, t)
    if edge == "bullnose":
        top = (cq.Workplane("XY")
               .sketch().rect(w, d).vertices().fillet(t/2 - 1).finalize()
               .extrude(t))
    # Front drip groove (underside)
    groove = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - 15), -(t/2 - 2)))
              .box(w - 20, 2, 2))
    return top.cut(groove)


def kitchen_sink_belfast(params):
    """Belfast / Butler sink (fireclay)."""
    w = params.get("width", 600.0)
    d = params.get("depth", 460.0)
    h = params.get("height", 220.0)
    wall_t = params.get("wall_thickness", 25.0)

    outer = (cq.Workplane("XY")
             .sketch().rect(w, d).vertices().fillet(15).finalize()
             .extrude(h))
    inner = (cq.Workplane("XY").workplane(offset=wall_t)
             .sketch().rect(w - 2*wall_t, d - 2*wall_t).vertices().fillet(10).finalize()
             .extrude(h))
    sink = outer.cut(inner)
    # Front apron (slightly proud)
    apron = (cq.Workplane("XY").transformed(offset=(0, -(d/2 + 3), 0))
             .sketch().rect(w + 6, 6).vertices().fillet(3).finalize()
             .extrude(h))
    # Overflow hole
    overflow = (cq.Workplane("XY").workplane(offset=h - 40)
                .transformed(offset=(0, -(d/2 - wall_t + 1), 0))
                .circle(12).extrude(wall_t + 2))
    # Waste hole (bottom centre)
    waste = (cq.Workplane("XY").workplane(offset=-1)
             .circle(45).extrude(wall_t + 2))
    return sink.union(apron).cut(overflow).cut(waste)


def kitchen_mixer_tap(params):
    """Kitchen mixer tap (deck-mounted)."""
    spout_h = params.get("spout_height", 250.0)
    spout_reach = params.get("spout_reach", 200.0)

    # Base plate
    base = cq.Workplane("XY").circle(25).extrude(10)
    # Body column
    column = cq.Workplane("XY").workplane(offset=10).circle(18).extrude(spout_h - 40)
    # Spout arm (curved, simplified as angled)
    spout = (cq.Workplane("XY").workplane(offset=spout_h - 30)
             .transformed(offset=(0, -spout_reach/2, 0))
             .transformed(rotate=(15, 0, 0))
             .circle(10).extrude(spout_reach))
    # Spout outlet
    outlet = (cq.Workplane("XY").workplane(offset=spout_h - 20)
              .transformed(offset=(0, -spout_reach + 20, 0))
              .circle(8).extrude(15))
    # Lever handle
    lever = (cq.Workplane("XY").workplane(offset=spout_h - 50)
             .transformed(offset=(30, 0, 0))
             .box(60, 12, 8))
    return base.union(column).union(spout).union(outlet).union(lever)


def induction_hob(params):
    """Induction hob (4 or 5 zone)."""
    w = params.get("width", 590.0)
    d = params.get("depth", 520.0)
    h = params.get("height", 55.0)
    zones = params.get("zones", 4)

    # Glass panel
    body = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(8).finalize()
            .extrude(h))
    # Frame lip
    lip = (cq.Workplane("XY").workplane(offset=h)
           .sketch().rect(w + 4, d + 4).vertices().fillet(9).finalize()
           .extrude(2))
    lip_inner = (cq.Workplane("XY").workplane(offset=h - 0.5)
                 .sketch().rect(w - 4, d - 4).vertices().fillet(6).finalize()
                 .extrude(3))
    lip = lip.cut(lip_inner)
    # Heating zones (ring marks on surface)
    if zones == 4:
        zone_pos = [(-w/4 + 20, d/4 - 10, 100), (w/4 - 20, d/4 - 10, 80),
                    (-w/4 + 20, -(d/4 - 10), 80), (w/4 - 20, -(d/4 - 10), 120)]
    else:  # 5 zone
        zone_pos = [(-w/4 + 20, d/4, 100), (w/4 - 20, d/4, 80),
                    (0, 0, 60),
                    (-w/4 + 20, -(d/4), 80), (w/4 - 20, -(d/4), 120)]
    for zx, zy, zr in zone_pos:
        ring = (cq.Workplane("XY").workplane(offset=h)
                .transformed(offset=(zx, zy, 0))
                .circle(zr/2).circle(zr/2 - 3).extrude(0.5))
        body = body.union(ring)
    # Touch controls (front strip)
    controls = (cq.Workplane("XY").workplane(offset=h)
                .transformed(offset=(0, -(d/2 - 30), 0))
                .box(w * 0.6, 20, 0.5))
    return body.union(lip).union(controls)


def built_in_oven(params):
    """Single built-in oven (60cm)."""
    w = params.get("width", 595.0)
    d = params.get("depth", 550.0)
    h = params.get("height", 595.0)

    # Outer housing
    body = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(5).finalize()
            .extrude(h))
    # Door (front, glass)
    door = (cq.Workplane("XY").transformed(offset=(0, -(d/2 + 2), 0))
            .box(w - 10, 8, h - 10))
    # Glass window
    window = (cq.Workplane("XY").transformed(offset=(0, -(d/2 + 6), h * 0.1))
              .box(w - 60, 3, h * 0.5))
    # Handle bar
    handle = (cq.Workplane("XY")
              .transformed(offset=(0, -(d/2 + 18), h/2 - 30))
              .box(w - 80, 10, 12))
    # Control panel (top strip)
    panel = (cq.Workplane("XY")
             .transformed(offset=(0, -(d/2 + 3), h/2 - 10))
             .box(w - 20, 6, 50))
    # Control knobs (2)
    for x in [-80, 80]:
        knob = (cq.Workplane("XY")
                .transformed(offset=(x, -(d/2 + 12), h/2 - 10))
                .circle(15).extrude(8))
        panel = panel.union(knob)
    return body.union(door).union(window).union(handle).union(panel)


def extractor_hood(params):
    """Chimney extractor hood."""
    w = params.get("width", 600.0)
    d = params.get("depth", 500.0)
    canopy_h = params.get("canopy_height", 120.0)
    chimney_h = params.get("chimney_height", 600.0)
    chimney_w = params.get("chimney_width", 340.0)

    # Canopy (tapered)
    canopy = (cq.Workplane("XY")
              .sketch().rect(w, d).vertices().fillet(5).finalize()
              .extrude(canopy_h))
    # Grease filter recess
    filter_r = (cq.Workplane("XY").workplane(offset=-1)
                .sketch().rect(w - 40, d - 40).finalize()
                .extrude(15))
    canopy = canopy.cut(filter_r)
    # Chimney section
    chimney = (cq.Workplane("XY").workplane(offset=canopy_h)
               .sketch().rect(chimney_w, d - 60).vertices().fillet(3).finalize()
               .extrude(chimney_h))
    # Control buttons (front bottom of canopy)
    for i in range(4):
        btn = (cq.Workplane("XY")
               .transformed(offset=(-60 + i*40, -(d/2 + 3), canopy_h/2))
               .circle(6).extrude(4))
        canopy = canopy.union(btn)
    # Light recesses (2)
    for x in [-w/4, w/4]:
        light = (cq.Workplane("XY").workplane(offset=-1)
                 .transformed(offset=(x, 0, 0))
                 .circle(25).extrude(15))
        canopy = canopy.cut(light)
    return canopy.union(chimney)


# ═════════════════════════════════════════════════════════════
# BATHROOM
# ═════════════════════════════════════════════════════════════

def bath_freestanding(params):
    """Freestanding bath (roll-top or modern)."""
    l = params.get("length", 1700.0)
    w = params.get("width", 750.0)
    h = params.get("height", 580.0)
    wall_t = params.get("wall_thickness", 8.0)

    outer = (cq.Workplane("XY")
             .sketch().ellipse(l/2, w/2).finalize()
             .extrude(h))
    inner = (cq.Workplane("XY").workplane(offset=wall_t)
             .sketch().ellipse(l/2 - wall_t, w/2 - wall_t).finalize()
             .extrude(h))
    bath = outer.cut(inner)
    # Rim (rolled edge)
    rim = (cq.Workplane("XY").workplane(offset=h - 5)
           .sketch().ellipse(l/2 + 5, w/2 + 5).finalize()
           .extrude(10))
    rim_inner = (cq.Workplane("XY").workplane(offset=h - 6)
                 .sketch().ellipse(l/2 - 5, w/2 - 5).finalize()
                 .extrude(12))
    rim = rim.cut(rim_inner)
    # Waste hole
    waste = (cq.Workplane("XY").workplane(offset=-1)
             .circle(25).extrude(wall_t + 2))
    # Overflow
    overflow = (cq.Workplane("XY").workplane(offset=h - 80)
                .transformed(offset=(0, -(w/2 - wall_t + 1), 0))
                .circle(15).extrude(wall_t + 2))
    return bath.union(rim).cut(waste).cut(overflow)


def shower_tray(params):
    """Shower tray (low profile)."""
    w = params.get("width", 900.0)
    d = params.get("depth", 900.0)
    h = params.get("height", 25.0)

    tray = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(15).finalize()
            .extrude(h))
    # Central depression for drainage
    recess = (cq.Workplane("XY").workplane(offset=h - 3)
              .sketch().rect(w - 30, d - 30).vertices().fillet(12).finalize()
              .extrude(4))
    # Waste hole (offset)
    waste = (cq.Workplane("XY").workplane(offset=-1)
             .transformed(offset=(0, -(d/4), 0))
             .circle(45).extrude(h + 2))
    # Anti-slip texture (raised dots)
    for ix in range(-3, 4):
        for iy in range(-3, 4):
            dot = (cq.Workplane("XY").workplane(offset=h - 3)
                   .transformed(offset=(ix * 80, iy * 80, 0))
                   .circle(3).extrude(1))
            tray = tray.union(dot)
    return tray.cut(recess).cut(waste)


def shower_screen(params):
    """Fixed or hinged shower screen (glass panel)."""
    w = params.get("width", 800.0)
    h = params.get("height", 1950.0)
    glass_t = params.get("glass_thickness", 8.0)
    frame_w = params.get("frame_width", 25.0)

    # Glass panel
    glass = (cq.Workplane("XY")
             .sketch().rect(w, glass_t).vertices().fillet(2).finalize()
             .extrude(h))
    # Wall-side frame channel
    frame = (cq.Workplane("XY")
             .transformed(offset=(-(w/2 + frame_w/2), 0, 0))
             .box(frame_w, frame_w, h))
    # Top stabiliser bar
    stab = (cq.Workplane("XY").workplane(offset=h - frame_w/2)
            .transformed(offset=(0, -300, 0))
            .transformed(rotate=(0, 0, 0))
            .box(w, frame_w, frame_w))
    # Seal strip (bottom)
    seal = (cq.Workplane("XY").workplane(offset=-10)
            .box(w, glass_t + 4, 10))
    return glass.union(frame).union(stab).union(seal)


def wc_close_coupled(params):
    """Close-coupled WC (pan + cistern)."""
    pan_w = params.get("pan_width", 360.0)
    pan_d = params.get("pan_depth", 660.0)
    seat_h = params.get("seat_height", 410.0)
    cistern_h = params.get("cistern_height", 380.0)

    # Pan (simplified oval bowl)
    pan = (cq.Workplane("XY")
           .sketch().ellipse(pan_d/2, pan_w/2).finalize()
           .extrude(seat_h))
    pan_bore = (cq.Workplane("XY").workplane(offset=seat_h - 120)
                .sketch().ellipse(pan_d/2 - 25, pan_w/2 - 25).finalize()
                .extrude(121))
    pan = pan.cut(pan_bore)
    # Pedestal base
    base = (cq.Workplane("XY")
            .sketch().ellipse(pan_d/3, pan_w/2 - 20).finalize()
            .extrude(5))
    # Cistern (box behind pan)
    cistern = (cq.Workplane("XY").workplane(offset=seat_h - 40)
               .transformed(offset=(pan_d/4, 0, 0))
               .sketch().rect(200, pan_w - 20).vertices().fillet(15).finalize()
               .extrude(cistern_h))
    # Lid
    lid = (cq.Workplane("XY").workplane(offset=seat_h + cistern_h - 40)
           .transformed(offset=(pan_d/4, 0, 0))
           .sketch().rect(205, pan_w - 15).vertices().fillet(16).finalize()
           .extrude(10))
    # Flush button (dual)
    for dx in [-12, 12]:
        btn = (cq.Workplane("XY").workplane(offset=seat_h + cistern_h - 29)
               .transformed(offset=(pan_d/4 + dx, 0, 0))
               .circle(12).extrude(5))
        lid = lid.union(btn)
    # Seat
    seat = (cq.Workplane("XY").workplane(offset=seat_h)
            .sketch().ellipse(pan_d/2 + 5, pan_w/2 + 5).finalize()
            .extrude(8))
    seat_hole = (cq.Workplane("XY").workplane(offset=seat_h - 1)
                 .sketch().ellipse(pan_d/2 - 20, pan_w/2 - 20).finalize()
                 .extrude(10))
    seat = seat.cut(seat_hole)
    return pan.union(base).union(cistern).union(lid).union(seat)


def basin_countertop(params):
    """Countertop basin (round or oval)."""
    d = params.get("diameter", 420.0)
    h = params.get("height", 150.0)
    wall_t = params.get("wall_thickness", 8.0)

    outer = cq.Workplane("XY").circle(d/2).extrude(h)
    inner = (cq.Workplane("XY").workplane(offset=wall_t)
             .circle(d/2 - wall_t).extrude(h))
    basin = outer.cut(inner)
    # Rim
    rim = (cq.Workplane("XY").workplane(offset=h - 3)
           .circle(d/2 + 3).circle(d/2 - 3).extrude(6))
    # Waste
    waste = (cq.Workplane("XY").workplane(offset=-1)
             .circle(32).extrude(wall_t + 2))
    # Tap hole (rear)
    tap_hole = (cq.Workplane("XY").workplane(offset=-1)
                .transformed(offset=(0, d/2 - 30, 0))
                .circle(18).extrude(wall_t + 2))
    return basin.union(rim).cut(waste).cut(tap_hole)


def vanity_unit(params):
    """Bathroom vanity unit (cabinet + basin top)."""
    w = params.get("width", 800.0)
    d = params.get("depth", 460.0)
    h = params.get("height", 820.0)
    panel_t = 18.0

    # Cabinet
    cab = cq.Workplane("XY").box(w, d, h - 30)
    cab_inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, panel_t/2))
                 .box(w - 2*panel_t, d - panel_t, h - 30 - panel_t))
    cab = cab.cut(cab_inner)
    # Two doors
    door_w = (w - 6) / 2
    for dx in [-(door_w/2 + 1), door_w/2 + 1]:
        door = (cq.Workplane("XY")
                .transformed(offset=(dx, -(d/2 - panel_t/2 - 1), 0))
                .box(door_w, panel_t, h - 40))
        handle = (cq.Workplane("XY")
                  .transformed(offset=(dx + (door_w/2 - 25) * (-1 if dx < 0 else 1),
                                       -(d/2 + 8), 0))
                  .box(10, 14, 100))
        cab = cab.union(door).union(handle)
    # Basin top (with integrated bowl)
    top = (cq.Workplane("XY").workplane(offset=(h - 30)/2)
           .box(w, d, 30))
    bowl = (cq.Workplane("XY").workplane(offset=(h - 30)/2 - 5)
            .sketch().ellipse(w/3, d/3).finalize()
            .extrude(30))
    top = top.cut(bowl)
    return cab.union(top)


def towel_radiator(params):
    """Heated towel rail (ladder style)."""
    w = params.get("width", 500.0)
    h = params.get("height", 1200.0)
    bars = params.get("bars", 12)
    bar_d = params.get("bar_diameter", 22.0)
    rail_d = params.get("rail_diameter", 32.0)

    # Vertical rails (2)
    result = None
    for x in [-(w/2), w/2]:
        rail = (cq.Workplane("XY")
                .transformed(offset=(x, 0, 0))
                .circle(rail_d/2).extrude(h))
        result = rail if result is None else result.union(rail)
    # Horizontal bars
    spacing = (h - 60) / (bars - 1)
    for i in range(bars):
        z = 30 + i * spacing
        bar = (cq.Workplane("XY").workplane(offset=z)
               .transformed(offset=(0, 0, 0))
               .transformed(rotate=(0, 90, 0))
               .circle(bar_d/2).extrude(w))
        bar = bar.translate((-w/2, 0, 0))
        result = result.union(bar)
    # Wall brackets (4)
    for x in [-(w/2 - 5), w/2 - 5]:
        for z in [h * 0.2, h * 0.8]:
            bracket = (cq.Workplane("XY").workplane(offset=z)
                       .transformed(offset=(x, rail_d, 0))
                       .box(rail_d + 10, 40, rail_d + 10))
            result = result.union(bracket)
    return result


# ═════════════════════════════════════════════════════════════
# FURNITURE
# ═════════════════════════════════════════════════════════════

def bed_frame(params):
    """Bed frame (divan base or platform)."""
    size = params.get("size", "double")
    sizes = {"single": (900, 1900), "double": (1350, 1900), "king": (1500, 2000), "super_king": (1800, 2000)}
    w, l = sizes.get(size, (1350, 1900))
    h = params.get("height", 280.0)
    headboard_h = params.get("headboard_height", 600.0)

    # Base platform
    base = (cq.Workplane("XY")
            .sketch().rect(w, l).vertices().fillet(5).finalize()
            .extrude(h))
    # Legs (4)
    for x, y in [(-w/2 + 40, -l/2 + 40), (-w/2 + 40, l/2 - 40),
                 (w/2 - 40, -l/2 + 40), (w/2 - 40, l/2 - 40)]:
        leg = (cq.Workplane("XY").workplane(offset=-60)
               .transformed(offset=(x, y, 0))
               .circle(25).extrude(60))
        base = base.union(leg)
    # Side rails
    for x in [-(w/2), w/2]:
        rail = (cq.Workplane("XY")
                .transformed(offset=(x, 0, h/2 - 20))
                .box(20, l - 20, h - 40))
        base = base.union(rail)
    # Headboard
    hb = (cq.Workplane("XY").workplane(offset=h)
          .transformed(offset=(0, l/2, 0))
          .box(w, 30, headboard_h))
    return base.union(hb)


def wardrobe_hinged(params):
    """Freestanding wardrobe (2 or 3 door hinged)."""
    w = params.get("width", 1200.0)
    d = params.get("depth", 580.0)
    h = params.get("height", 2000.0)
    doors = params.get("doors", 2)
    panel_t = 18.0

    # Carcass
    outer = cq.Workplane("XY").box(w, d, h)
    inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, 0))
             .box(w - 2*panel_t, d - panel_t, h - 2*panel_t))
    carcass = outer.cut(inner)
    # Doors
    door_w = (w - (doors + 1) * 3) / doors
    for i in range(doors):
        dx = -(w/2) + 3 + (i + 0.5) * (door_w + 3)
        door = (cq.Workplane("XY")
                .transformed(offset=(dx, -(d/2 - panel_t/2 - 1), 0))
                .box(door_w, panel_t, h - 10))
        handle = (cq.Workplane("XY")
                  .transformed(offset=(dx + door_w/2 - 25, -(d/2 + 8), 0))
                  .box(10, 14, 120))
        carcass = carcass.union(door).union(handle)
    # Rail (internal)
    rail = (cq.Workplane("XY").workplane(offset=h/2 - 100)
            .transformed(offset=(0, 0, 0))
            .transformed(rotate=(0, 90, 0))
            .circle(12).extrude(w - 2*panel_t - 10))
    rail = rail.translate((-(w/2 - panel_t - 5), 0, 0))
    # Shelf (top)
    shelf = (cq.Workplane("XY").workplane(offset=h/2 - 60)
             .box(w - 2*panel_t - 2, d - panel_t - 10, panel_t))
    return carcass.union(rail).union(shelf)


def chest_of_drawers(params):
    """Chest of drawers."""
    w = params.get("width", 800.0)
    d = params.get("depth", 450.0)
    h = params.get("height", 900.0)
    drawer_count = params.get("drawers", 4)
    panel_t = 18.0

    # Carcass
    outer = cq.Workplane("XY").box(w, d, h)
    inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, panel_t/2))
             .box(w - 2*panel_t, d - panel_t, h - panel_t))
    carcass = outer.cut(inner)
    # Drawer fronts
    drawer_h = (h - panel_t - (drawer_count + 1) * 4) / drawer_count
    for i in range(drawer_count):
        dz = -(h/2 - panel_t/2) + 4 + (i + 0.5) * (drawer_h + 4)
        front = (cq.Workplane("XY")
                 .transformed(offset=(0, -(d/2 - panel_t/2 - 1), dz))
                 .box(w - 6, panel_t, drawer_h))
        # Handle
        handle = (cq.Workplane("XY")
                  .transformed(offset=(0, -(d/2 + 8), dz))
                  .box(80, 14, 10))
        carcass = carcass.union(front).union(handle)
    # Legs
    for x in [-(w/2 - 30), w/2 - 30]:
        for y in [-(d/2 - 30), d/2 - 30]:
            leg = (cq.Workplane("XY").workplane(offset=-(h/2 + 50))
                   .transformed(offset=(x, y, 0))
                   .circle(15).extrude(50))
            carcass = carcass.union(leg)
    return carcass


def dining_table(params):
    """Dining table (rectangular)."""
    w = params.get("width", 1600.0)
    d = params.get("depth", 900.0)
    top_t = params.get("top_thickness", 30.0)
    h = params.get("height", 750.0)
    leg_w = params.get("leg_width", 60.0)

    # Top
    top = (cq.Workplane("XY").workplane(offset=h - top_t)
           .sketch().rect(w, d).vertices().fillet(15).finalize()
           .extrude(top_t))
    # Legs (4)
    result = top
    for x, y in [(-w/2 + 60, -d/2 + 60), (-w/2 + 60, d/2 - 60),
                 (w/2 - 60, -d/2 + 60), (w/2 - 60, d/2 - 60)]:
        leg = (cq.Workplane("XY")
               .transformed(offset=(x, y, (h - top_t)/2))
               .box(leg_w, leg_w, h - top_t))
        result = result.union(leg)
    # Apron rails
    for x in [-(w/2 - 60), w/2 - 60]:
        rail = (cq.Workplane("XY")
                .transformed(offset=(x, 0, h - top_t - 50))
                .box(leg_w, d - 2*60, 80))
        result = result.union(rail)
    return result


def desk(params):
    """Office desk with cable management."""
    w = params.get("width", 1400.0)
    d = params.get("depth", 700.0)
    h = params.get("height", 730.0)
    top_t = 25.0

    top = (cq.Workplane("XY").workplane(offset=h - top_t)
           .sketch().rect(w, d).vertices().fillet(8).finalize()
           .extrude(top_t))
    # Cable grommet
    grommet = (cq.Workplane("XY").workplane(offset=h - top_t - 1)
               .transformed(offset=(w/3, -(d/3), 0))
               .circle(30).extrude(top_t + 2))
    top = top.cut(grommet)
    # Legs (rectangular tube, 2 side frames)
    for x in [-(w/2 - 30), w/2 - 30]:
        leg_front = (cq.Workplane("XY")
                     .transformed(offset=(x, -(d/2 - 30), (h - top_t)/2))
                     .box(50, 25, h - top_t))
        leg_rear = (cq.Workplane("XY")
                    .transformed(offset=(x, d/2 - 30, (h - top_t)/2))
                    .box(50, 25, h - top_t))
        cross = (cq.Workplane("XY")
                 .transformed(offset=(x, 0, 100))
                 .box(50, d - 60, 25))
        top = top.union(leg_front).union(leg_rear).union(cross)
    # Cable tray (underside)
    tray = (cq.Workplane("XY").workplane(offset=h - top_t - 60)
            .transformed(offset=(0, d/3, 0))
            .box(w * 0.6, 80, 40))
    return top.union(tray)


# ═════════════════════════════════════════════════════════════
# DOORS
# ═════════════════════════════════════════════════════════════

def internal_door(params):
    """Internal door (panel or flush)."""
    w = params.get("width", 762.0)  # 2'6" standard
    h = params.get("height", 1981.0)  # 6'6"
    t = params.get("thickness", 35.0)
    panels = params.get("panels", 4)

    door = cq.Workplane("XY").box(w, t, h)
    if panels > 0:
        panel_h = (h - 100) / panels - 30
        for i in range(panels):
            pz = -(h/2 - 50) + (i + 0.5) * ((h - 100) / panels)
            recess = (cq.Workplane("XY")
                      .transformed(offset=(0, -(t/2 - 5), pz))
                      .sketch().rect(w - 120, panel_h).vertices().fillet(5).finalize()
                      .extrude(6))
            recess2 = (cq.Workplane("XY")
                       .transformed(offset=(0, t/2 - 5, pz))
                       .sketch().rect(w - 120, panel_h).vertices().fillet(5).finalize()
                       .extrude(6))
            door = door.cut(recess).cut(recess2)
    # Handle position cutout
    handle_hole = (cq.Workplane("XY")
                   .transformed(offset=(w/2 - 60, 0, 0))
                   .circle(27).extrude(t + 10).translate((0, -(t/2 + 5), 0)))
    # Hinge recesses (3)
    for z in [-(h/2 - 150), 0, h/2 - 150]:
        hinge = (cq.Workplane("XY")
                 .transformed(offset=(-(w/2 - 5), -(t/2 - 3), z))
                 .box(80, 3, 100))
        door = door.cut(hinge)
    return door


def composite_front_door(params):
    """Composite front door with glazed panels."""
    w = params.get("width", 920.0)
    h = params.get("height", 2085.0)
    t = params.get("thickness", 44.0)

    door = (cq.Workplane("XY")
            .sketch().rect(w, t).vertices().fillet(3).finalize()
            .extrude(h))
    # Glazed panel (upper half)
    glass_w = w - 180
    glass_h = h * 0.4
    glass = (cq.Workplane("XY").workplane(offset=h * 0.55)
             .transformed(offset=(0, -(t/2 - 8), 0))
             .box(glass_w, 5, glass_h))
    # Letter box recess
    letter = (cq.Workplane("XY").workplane(offset=h * 0.35)
              .transformed(offset=(0, -(t/2 - 4), 0))
              .box(250, 8, 40))
    # Threshold (bottom)
    threshold = (cq.Workplane("XY").workplane(offset=-5)
                 .box(w + 20, t + 30, 10))
    return door.union(glass).cut(letter).union(threshold)


def bifold_door(params):
    """Bifold door set (aluminium framed, patio)."""
    panels = params.get("panels", 3)
    panel_w = params.get("panel_width", 900.0)
    h = params.get("height", 2100.0)
    frame_w = params.get("frame_width", 50.0)
    glass_t = 28.0  # double glazed

    total_w = panels * panel_w
    result = None
    for i in range(panels):
        px = -(total_w/2) + (i + 0.5) * panel_w
        # Frame
        frame = (cq.Workplane("XY")
                 .transformed(offset=(px, 0, h/2))
                 .box(panel_w, frame_w, h))
        frame_inner = (cq.Workplane("XY")
                       .transformed(offset=(px, 0, h/2))
                       .box(panel_w - 2*frame_w, frame_w - 10, h - 2*frame_w))
        panel_geom = frame.cut(frame_inner)
        # Glass
        glass = (cq.Workplane("XY")
                 .transformed(offset=(px, 0, h/2))
                 .box(panel_w - 2*frame_w, glass_t, h - 2*frame_w))
        panel_geom = panel_geom.union(glass)
        # Hinge knuckles between panels
        if i < panels - 1:
            for z in [h * 0.2, h * 0.5, h * 0.8]:
                knuckle = (cq.Workplane("XY").workplane(offset=z)
                           .transformed(offset=(px + panel_w/2, 0, 0))
                           .circle(8).extrude(30))
                panel_geom = panel_geom.union(knuckle)
        result = panel_geom if result is None else result.union(panel_geom)
    # Bottom track
    track = (cq.Workplane("XY")
             .box(total_w + 20, frame_w + 20, 15))
    # Top track
    top_track = (cq.Workplane("XY").workplane(offset=h)
                 .box(total_w + 20, frame_w + 20, 20))
    return result.union(track).union(top_track)


def sliding_pocket_door(params):
    """Sliding pocket door (internal, single)."""
    w = params.get("width", 826.0)
    h = params.get("height", 2040.0)
    t = params.get("thickness", 35.0)

    # Door leaf
    door = cq.Workplane("XY").box(w, t, h)
    # Track housing (top, concealed header)
    track = (cq.Workplane("XY").workplane(offset=h/2 + 15)
             .box(w * 2 + 50, 80, 30))
    # Track rail
    rail = (cq.Workplane("XY").workplane(offset=h/2 + 5)
            .transformed(offset=(0, 0, 0))
            .box(w * 2, 5, 5))
    # Roller carriages (2)
    for x in [-w/3, w/3]:
        roller = (cq.Workplane("XY").workplane(offset=h/2 + 2)
                  .transformed(offset=(x, 0, 0))
                  .box(30, 20, 15))
        rail = rail.union(roller)
    # Finger pull (recessed)
    pull = (cq.Workplane("XY")
            .transformed(offset=(w/2 - 30, -(t/2 - 5), 0))
            .box(15, 5, 120))
    door = door.cut(pull)
    return door.union(track).union(rail)


# ═════════════════════════════════════════════════════════════
# WINDOWS
# ═════════════════════════════════════════════════════════════

def casement_window(params):
    """Casement window (UPVC or aluminium)."""
    w = params.get("width", 1200.0)
    h = params.get("height", 1050.0)
    frame_w = params.get("frame_width", 70.0)
    sash_w = params.get("sash_width", 50.0)

    # Outer frame
    frame = cq.Workplane("XY").box(w, frame_w, h)
    frame_inner = cq.Workplane("XY").box(w - 2*frame_w, frame_w - 10, h - 2*frame_w)
    frame = frame.cut(frame_inner)
    # Mullion (centre vertical)
    mullion = (cq.Workplane("XY")
               .box(sash_w, frame_w, h - 2*frame_w))
    # Opening sash frames (2)
    for side in [-1, 1]:
        sash_x = side * (w/4)
        sash_outer = (cq.Workplane("XY")
                      .transformed(offset=(sash_x, -5, 0))
                      .box(w/2 - frame_w - sash_w/2, sash_w, h - 2*frame_w - 4))
        sash_inner = (cq.Workplane("XY")
                      .transformed(offset=(sash_x, -5, 0))
                      .box(w/2 - frame_w - sash_w/2 - 2*sash_w, sash_w - 10, h - 2*frame_w - 4 - 2*sash_w))
        sash = sash_outer.cut(sash_inner)
        frame = frame.union(sash)
    frame = frame.union(mullion)
    # Glazing bars (simplified)
    glass_t = 24.0
    for side in [-1, 1]:
        glass = (cq.Workplane("XY")
                 .transformed(offset=(side * w/4, 0, 0))
                 .box(w/2 - frame_w - sash_w, glass_t, h - 2*frame_w - 2*sash_w))
        frame = frame.union(glass)
    # Cill (external)
    cill = (cq.Workplane("XY").workplane(offset=-(h/2 + 5))
            .box(w + 60, frame_w + 40, 25))
    return frame.union(cill)


def sash_window(params):
    """Vertical sliding sash window (traditional UK)."""
    w = params.get("width", 900.0)
    h = params.get("height", 1500.0)
    frame_w = params.get("frame_width", 70.0)
    sash_w = params.get("sash_width", 45.0)

    # Box frame
    frame = cq.Workplane("XY").box(w, frame_w + 30, h)
    frame_inner = cq.Workplane("XY").box(w - 2*frame_w, frame_w + 10, h - frame_w)
    frame = frame.cut(frame_inner)
    # Lower sash (slides up)
    lower_sash = (cq.Workplane("XY")
                  .transformed(offset=(0, -3, -(h/4)))
                  .box(w - 2*frame_w + 10, sash_w, h/2 + 10))
    lower_inner = (cq.Workplane("XY")
                   .transformed(offset=(0, -3, -(h/4)))
                   .box(w - 2*frame_w - 2*sash_w + 10, sash_w - 8, h/2 - 2*sash_w + 10))
    lower = lower_sash.cut(lower_inner)
    # Meeting rail (where sashes overlap)
    meeting = (cq.Workplane("XY")
               .box(w - 2*frame_w + 10, sash_w + 5, 15))
    # Upper sash
    upper_sash = (cq.Workplane("XY")
                  .transformed(offset=(0, 3, h/4))
                  .box(w - 2*frame_w + 10, sash_w, h/2 + 10))
    upper_inner = (cq.Workplane("XY")
                   .transformed(offset=(0, 3, h/4))
                   .box(w - 2*frame_w - 2*sash_w + 10, sash_w - 8, h/2 - 2*sash_w + 10))
    upper = upper_sash.cut(upper_inner)
    # Cill
    cill = (cq.Workplane("XY").workplane(offset=-(h/2 + 5))
            .box(w + 50, frame_w + 40, 25))
    # Horns (sash projections at bottom of upper sash)
    return frame.union(lower).union(meeting).union(upper).union(cill)


def roof_window(params):
    """Velux-style roof window."""
    w = params.get("width", 780.0)
    h = params.get("height", 1180.0)
    frame_w = params.get("frame_width", 40.0)

    # Frame (timber + cladding)
    frame = cq.Workplane("XY").box(w, 80, h)
    frame_inner = cq.Workplane("XY").box(w - 2*frame_w, 60, h - 2*frame_w)
    frame = frame.cut(frame_inner)
    # Sash
    sash = (cq.Workplane("XY").transformed(offset=(0, -5, 0))
            .box(w - 2*frame_w + 10, 40, h - 2*frame_w + 10))
    sash_inner = (cq.Workplane("XY").transformed(offset=(0, -5, 0))
                  .box(w - 2*frame_w - 40, 20, h - 2*frame_w - 40))
    sash = sash.cut(sash_inner)
    # Glazing
    glass = (cq.Workplane("XY").transformed(offset=(0, -5, 0))
             .box(w - 2*frame_w - 40, 24, h - 2*frame_w - 40))
    # Flashing kit (simplified surround)
    flashing = (cq.Workplane("XY")
                .box(w + 40, 5, h + 40))
    flashing_inner = cq.Workplane("XY").box(w - 10, 6, h - 10)
    flashing = flashing.cut(flashing_inner)
    # Handle bar (bottom)
    handle = (cq.Workplane("XY")
              .transformed(offset=(0, -25, -(h/2 - frame_w - 10)))
              .box(w * 0.5, 12, 15))
    return frame.union(sash).union(glass).union(flashing).union(handle)


# ═════════════════════════════════════════════════════════════
# ELECTRICAL
# ═════════════════════════════════════════════════════════════

def light_switch(params):
    """Light switch (1/2/3 gang, UK pattern)."""
    gangs = params.get("gangs", 2)
    plate_w = params.get("plate_width", 86.0)
    plate_h = params.get("plate_height", 86.0 if gangs <= 2 else 146.0)

    plate = (cq.Workplane("XY")
             .sketch().rect(plate_w, plate_h).vertices().fillet(3).finalize()
             .extrude(8))
    for i in range(gangs):
        gy = 0 if gangs == 1 else -(plate_h/2 - 30) + i * (plate_h - 60) / max(gangs - 1, 1)
        # Rocker
        rocker = (cq.Workplane("XY").workplane(offset=8)
                  .transformed(offset=(0, gy, 0))
                  .sketch().rect(20, 12).vertices().fillet(2).finalize()
                  .extrude(4))
        plate = plate.union(rocker)
    # Screw holes (2)
    for y in [-(plate_h/2 - 10), plate_h/2 - 10]:
        h_s = (cq.Workplane("XY").workplane(offset=-1)
               .transformed(offset=(0, y, 0)).circle(2).extrude(10))
        plate = plate.cut(h_s)
    return plate


def double_socket(params):
    """UK 13A double socket outlet."""
    w = params.get("width", 147.0)
    h = params.get("height", 86.0)

    plate = (cq.Workplane("XY")
             .sketch().rect(w, h).vertices().fillet(3).finalize()
             .extrude(8))
    # Two socket faces
    for dx in [-30, 30]:
        # Pin holes (L, N, E)
        for dy, pw, ph in [(8, 8, 4), (-8, 8, 4), (0, 4, 8)]:
            pin = (cq.Workplane("XY").workplane(offset=7)
                   .transformed(offset=(dx, dy, 0))
                   .sketch().rect(pw, ph).finalize()
                   .extrude(3))
            plate = plate.cut(pin)
        # Switch rocker
        sw = (cq.Workplane("XY").workplane(offset=8)
              .transformed(offset=(dx, -(h/2 - 18), 0))
              .sketch().rect(12, 8).vertices().fillet(1).finalize()
              .extrude(3))
        plate = plate.union(sw)
    # Screw holes
    for y in [-(h/2 - 10), h/2 - 10]:
        s = (cq.Workplane("XY").workplane(offset=-1)
             .transformed(offset=(0, y, 0)).circle(2).extrude(10))
        plate = plate.cut(s)
    return plate


def downlight(params):
    """Recessed LED downlight (GU10 or integrated)."""
    od = params.get("od", 85.0)
    depth = params.get("depth", 70.0)
    bezel_w = params.get("bezel_width", 5.0)

    # Can
    can = cq.Workplane("XY").circle(od/2 - bezel_w).extrude(depth)
    can_i = (cq.Workplane("XY").workplane(offset=3)
             .circle(od/2 - bezel_w - 2).extrude(depth))
    can = can.cut(can_i)
    # Bezel (front ring)
    bezel = (cq.Workplane("XY").workplane(offset=-3)
             .circle(od/2).circle(od/2 - bezel_w - 5).extrude(3))
    # LED module (inside)
    led = (cq.Workplane("XY").workplane(offset=depth - 10)
           .circle(15).extrude(8))
    # Spring clips (2)
    for ang in [0, 180]:
        r = math.radians(ang)
        cx = (od/2 - 3) * math.cos(r)
        cy = (od/2 - 3) * math.sin(r)
        clip = (cq.Workplane("XY").workplane(offset=depth/2)
                .transformed(offset=(cx, cy, 0))
                .box(3, 20, depth * 0.6))
        can = can.union(clip)
    return can.union(bezel).union(led)


# ═════════════════════════════════════════════════════════════
# PLUMBING & HEATING
# ═════════════════════════════════════════════════════════════

def panel_radiator(params):
    """Panel radiator (Type 11/21/22)."""
    w = params.get("width", 1000.0)
    h = params.get("height", 600.0)
    panels = params.get("panels", 2)  # 1=Type 11, 2=Type 22
    panel_t = 25.0
    gap = 30.0

    total_d = panels * panel_t + (panels - 1) * gap
    result = None
    for p in range(panels):
        py = -(total_d/2) + p * (panel_t + gap) + panel_t/2
        panel = (cq.Workplane("XY")
                 .transformed(offset=(0, py, h/2))
                 .box(w, panel_t, h))
        # Waterway channels (vertical grooves on front)
        for i in range(int(w / 50)):
            gx = -(w/2 - 25) + i * 50
            groove = (cq.Workplane("XY")
                      .transformed(offset=(gx, py - panel_t/2, h/2))
                      .box(30, 5, h - 40))
            panel = panel.cut(groove)
        result = panel if result is None else result.union(panel)
    # Convector fins between panels (if Type 21/22)
    if panels == 2:
        for i in range(int(w / 8)):
            fx = -(w/2 - 4) + i * 8
            fin = (cq.Workplane("XY")
                   .transformed(offset=(fx, 0, h/2))
                   .box(1, gap - 4, h - 60))
            result = result.union(fin)
    # Valve connections (bottom, each end)
    for x in [-(w/2 - 40), w/2 - 40]:
        conn = (cq.Workplane("XY")
                .transformed(offset=(x, 0, -5))
                .circle(10).extrude(20))
        result = result.union(conn)
    # Wall brackets (2)
    for x in [-(w/3), w/3]:
        bracket = (cq.Workplane("XY")
                   .transformed(offset=(x, total_d/2 + 15, h * 0.7))
                   .box(40, 30, 8))
        result = result.union(bracket)
    return result


def trv_valve(params):
    """Thermostatic radiator valve (TRV)."""
    body_d = params.get("body_d", 30.0)

    # Valve body (elbow)
    body = cq.Workplane("XY").circle(body_d/2).extrude(50)
    # Inlet (bottom)
    inlet = (cq.Workplane("XY").workplane(offset=-15)
             .circle(10).extrude(15))
    # Outlet (side)
    outlet = (cq.Workplane("XY").workplane(offset=25)
              .transformed(offset=(body_d/2 + 10, 0, 0))
              .transformed(rotate=(0, 90, 0))
              .circle(10).extrude(20))
    # Thermostatic head
    head = (cq.Workplane("XY").workplane(offset=50)
            .circle(18).extrude(50))
    # Control ring (numbered)
    ring = (cq.Workplane("XY").workplane(offset=85)
            .circle(20).circle(18).extrude(8))
    return body.union(inlet).union(outlet).union(head).union(ring)


def combi_boiler(params):
    """Wall-hung combi boiler."""
    w = params.get("width", 440.0)
    d = params.get("depth", 350.0)
    h = params.get("height", 740.0)

    body = (cq.Workplane("XY")
            .sketch().rect(w, d).vertices().fillet(8).finalize()
            .extrude(h))
    # Front panel (with display)
    panel = (cq.Workplane("XY")
             .transformed(offset=(0, -(d/2 + 1), h * 0.3))
             .box(w - 10, 3, h * 0.4))
    # Display window
    display = (cq.Workplane("XY")
               .transformed(offset=(0, -(d/2 + 3), h * 0.55))
               .box(80, 5, 30))
    # Controls
    for dx in [-40, 40]:
        knob = (cq.Workplane("XY")
                .transformed(offset=(dx, -(d/2 + 6), h * 0.35))
                .circle(12).extrude(6))
        panel = panel.union(knob)
    # Pipe connections (bottom: flow, return, mains in, hot out, gas)
    pipe_x = [-80, -40, 0, 40, 80]
    for px in pipe_x:
        pipe = (cq.Workplane("XY").workplane(offset=-20)
                .transformed(offset=(px, 0, 0))
                .circle(11).extrude(20))
        body = body.union(pipe)
    # Flue (top)
    flue = (cq.Workplane("XY").workplane(offset=h)
            .circle(30).extrude(50))
    return body.union(panel).union(display).union(flue)


# ═════════════════════════════════════════════════════════════
# BUILDING FABRIC
# ═════════════════════════════════════════════════════════════

def roof_tile(params):
    """Concrete or clay roof tile (interlocking)."""
    w = params.get("width", 330.0)
    l = params.get("length", 420.0)
    t = params.get("thickness", 12.0)

    tile = (cq.Workplane("XY")
            .sketch().rect(w, l).finalize()
            .extrude(t))
    # Interlock rib (left side)
    rib = (cq.Workplane("XY")
           .transformed(offset=(-(w/2 + 3), 0, t/2))
           .box(6, l, t + 4))
    # Headlap overlap area (top)
    headlap = (cq.Workplane("XY")
               .transformed(offset=(0, l/2 - 35, t/2 + 2))
               .box(w, 70, 4))
    # Nail holes (2)
    for x in [-50, 50]:
        nh = (cq.Workplane("XY").workplane(offset=-1)
              .transformed(offset=(x, l/2 - 50, 0))
              .circle(2.5).extrude(t + 2))
        tile = tile.cut(nh)
    # Nibs (2 hanging nibs on underside)
    for x in [-40, 40]:
        nib = (cq.Workplane("XY").workplane(offset=-6)
               .transformed(offset=(x, l/2 - 10, 0))
               .box(15, 8, 6))
        tile = tile.union(nib)
    return tile.union(rib).union(headlap)


def gutter_profile(params):
    """Gutter (half-round or ogee profile)."""
    profile = params.get("profile", "half_round")
    length = params.get("length", 500.0)
    width = params.get("width", 112.0)

    if profile == "half_round":
        # Half-round gutter using revolution
        outer = cq.Workplane("XY").circle(width/2).extrude(length)
        # Cut to half
        cutter = (cq.Workplane("XY").workplane(offset=-1)
                  .transformed(offset=(0, width/4, 0))
                  .box(width + 10, width/2 + 10, length + 2))
        outer = outer.cut(cutter)
        # Shell it
        inner = cq.Workplane("XY").circle(width/2 - 3).extrude(length)
        inner_cutter = (cq.Workplane("XY").workplane(offset=-1)
                        .transformed(offset=(0, width/4, 0))
                        .box(width + 10, width/2 + 10, length + 2))
        inner = inner.cut(inner_cutter)
        outer = outer.cut(inner)
    else:  # ogee simplified
        outer = (cq.Workplane("XY")
                 .sketch().rect(width, width/2).finalize()
                 .extrude(length))
        inner = (cq.Workplane("XY").workplane(offset=3)
                 .transformed(offset=(0, width/6, 0))
                 .sketch().rect(width - 6, width/2 - 6).finalize()
                 .extrude(length))
        outer = outer.cut(inner)
    # Bracket clip point
    clip = (cq.Workplane("XY").workplane(offset=length/2)
            .transformed(offset=(0, -(width/4 + 10), 0))
            .box(30, 20, 8))
    return outer.union(clip)


def steel_lintel(params):
    """Steel lintel (cavity wall)."""
    span = params.get("span", 1200.0)
    height = params.get("height", 140.0)
    flange_w = params.get("flange_width", 100.0)
    web_t = params.get("web_thickness", 3.0)

    # Web
    web = (cq.Workplane("XY")
           .box(span + 300, web_t, height))
    # Inner leaf flange (bottom, one side)
    inner = (cq.Workplane("XY")
             .transformed(offset=(0, -(flange_w/2 + web_t/2), -(height/2 - 1.5)))
             .box(span + 300, flange_w, 3))
    # Outer leaf flange (bottom, other side)
    outer = (cq.Workplane("XY")
             .transformed(offset=(0, flange_w/2 + web_t/2, -(height/2 - 1.5)))
             .box(span + 300, flange_w, 3))
    # DPC tray (top bend)
    tray = (cq.Workplane("XY")
            .transformed(offset=(0, -(flange_w/2 + web_t/2), height/2 - 1.5))
            .box(span + 300, flange_w + 30, 3))
    return web.union(inner).union(outer).union(tray)


# ═════════════════════════════════════════════════════════════
# REGISTRY
# ═════════════════════════════════════════════════════════════

TIER3_HOUSE = {
    # Kitchen
    "kitchen_base_cabinet": {
        "function": kitchen_base_cabinet, "name": "Kitchen Base Cabinet", "category": "kitchen",
        "default_colour": "#F5F5F0", "visual_tags": ["melamine", "kitchen"],
        "param_schema": {"width": {"type": "number", "default": 600.0, "unit": "mm", "enum": [300, 400, 500, 600, 800, 900, 1000]},
                         "depth": {"type": "number", "default": 570.0, "unit": "mm"}},
    },
    "kitchen_wall_cabinet": {
        "function": kitchen_wall_cabinet, "name": "Kitchen Wall Cabinet", "category": "kitchen",
        "default_colour": "#F5F5F0", "visual_tags": ["melamine", "kitchen"],
        "param_schema": {"width": {"type": "number", "default": 600.0, "unit": "mm"}},
    },
    "kitchen_tall_cabinet": {
        "function": kitchen_tall_cabinet, "name": "Kitchen Tall/Larder Cabinet", "category": "kitchen",
        "default_colour": "#F5F5F0", "visual_tags": ["melamine", "kitchen"],
        "param_schema": {"width": {"type": "number", "default": 600.0, "unit": "mm"}},
    },
    "kitchen_worktop": {
        "function": kitchen_worktop, "name": "Kitchen Worktop", "category": "kitchen",
        "default_colour": "#E8E0D0", "visual_tags": ["granite", "quartz", "laminate", "kitchen"],
        "param_schema": {"width": {"type": "number", "default": 3000.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 620.0, "unit": "mm"},
                         "thickness": {"type": "number", "default": 40.0, "unit": "mm"}},
    },
    "kitchen_sink_belfast": {
        "function": kitchen_sink_belfast, "name": "Belfast / Butler Sink", "category": "kitchen",
        "default_colour": "#FFFFFF", "visual_tags": ["fireclay", "ceramic", "kitchen"],
        "param_schema": {"width": {"type": "number", "default": 600.0, "unit": "mm"}},
    },
    "kitchen_mixer_tap": {
        "function": kitchen_mixer_tap, "name": "Kitchen Mixer Tap", "category": "kitchen",
        "default_colour": "#C0C0C0", "visual_tags": ["chrome", "brass", "kitchen"],
        "param_schema": {"spout_height": {"type": "number", "default": 250.0, "unit": "mm"}},
    },
    "induction_hob": {
        "function": induction_hob, "name": "Induction Hob", "category": "kitchen",
        "default_colour": "#1A1A1A", "visual_tags": ["glass", "ceramic", "kitchen"],
        "param_schema": {"zones": {"type": "integer", "default": 4, "enum": [4, 5]}},
    },
    "built_in_oven": {
        "function": built_in_oven, "name": "Built-In Oven", "category": "kitchen",
        "default_colour": "#2F2F2F", "visual_tags": ["steel", "glass", "kitchen"],
        "param_schema": {},
    },
    "extractor_hood": {
        "function": extractor_hood, "name": "Chimney Extractor Hood", "category": "kitchen",
        "default_colour": "#C0C0C0", "visual_tags": ["stainless", "kitchen"],
        "param_schema": {"width": {"type": "number", "default": 600.0, "unit": "mm", "enum": [600, 700, 900]}},
    },
    # Bathroom
    "bath_freestanding": {
        "function": bath_freestanding, "name": "Freestanding Bath", "category": "bathroom",
        "default_colour": "#FFFFFF", "visual_tags": ["acrylic", "cast_iron", "bathroom"],
        "param_schema": {"length": {"type": "number", "default": 1700.0, "unit": "mm", "enum": [1500, 1600, 1700, 1800]}},
    },
    "shower_tray": {
        "function": shower_tray, "name": "Shower Tray (Low Profile)", "category": "bathroom",
        "default_colour": "#F0F0F0", "visual_tags": ["stone_resin", "acrylic", "bathroom"],
        "param_schema": {"width": {"type": "number", "default": 900.0, "unit": "mm", "enum": [760, 800, 900, 1000, 1200]}},
    },
    "shower_screen": {
        "function": shower_screen, "name": "Shower Screen (Walk-In)", "category": "bathroom",
        "default_colour": "#E0F0F0", "visual_tags": ["glass", "chrome", "bathroom"],
        "param_schema": {"width": {"type": "number", "default": 800.0, "unit": "mm"}},
    },
    "wc_close_coupled": {
        "function": wc_close_coupled, "name": "Close-Coupled WC", "category": "bathroom",
        "default_colour": "#FFFFFF", "visual_tags": ["vitreous_china", "bathroom"],
        "param_schema": {"seat_height": {"type": "number", "default": 410.0, "unit": "mm"}},
    },
    "basin_countertop": {
        "function": basin_countertop, "name": "Countertop Basin", "category": "bathroom",
        "default_colour": "#FFFFFF", "visual_tags": ["ceramic", "stone", "bathroom"],
        "param_schema": {"diameter": {"type": "number", "default": 420.0, "unit": "mm"}},
    },
    "vanity_unit": {
        "function": vanity_unit, "name": "Vanity Unit", "category": "bathroom",
        "default_colour": "#E0D8C8", "visual_tags": ["melamine", "solid_wood", "bathroom"],
        "param_schema": {"width": {"type": "number", "default": 800.0, "unit": "mm", "enum": [600, 800, 1000, 1200]}},
    },
    "towel_radiator": {
        "function": towel_radiator, "name": "Heated Towel Rail", "category": "bathroom",
        "default_colour": "#C0C0C0", "visual_tags": ["chrome", "steel", "bathroom"],
        "param_schema": {"width": {"type": "number", "default": 500.0, "unit": "mm"},
                         "height": {"type": "number", "default": 1200.0, "unit": "mm"},
                         "bars": {"type": "integer", "default": 12}},
    },
    # Furniture
    "bed_frame": {
        "function": bed_frame, "name": "Bed Frame", "category": "bedroom",
        "default_colour": "#8B7355", "visual_tags": ["timber", "upholstered", "bedroom"],
        "param_schema": {"size": {"type": "string", "default": "double", "enum": ["single", "double", "king", "super_king"]}},
    },
    "wardrobe_hinged": {
        "function": wardrobe_hinged, "name": "Wardrobe (Hinged)", "category": "bedroom",
        "default_colour": "#D2B48C", "visual_tags": ["melamine", "solid_wood", "bedroom"],
        "param_schema": {"width": {"type": "number", "default": 1200.0, "unit": "mm"},
                         "doors": {"type": "integer", "default": 2, "enum": [2, 3]}},
    },
    "chest_of_drawers": {
        "function": chest_of_drawers, "name": "Chest of Drawers", "category": "bedroom",
        "default_colour": "#D2B48C", "visual_tags": ["timber", "melamine", "bedroom"],
        "param_schema": {"drawers": {"type": "integer", "default": 4, "enum": [3, 4, 5, 6]}},
    },
    "dining_table": {
        "function": dining_table, "name": "Dining Table", "category": "dining",
        "default_colour": "#8B7355", "visual_tags": ["timber", "oak", "dining"],
        "param_schema": {"width": {"type": "number", "default": 1600.0, "unit": "mm"},
                         "depth": {"type": "number", "default": 900.0, "unit": "mm"}},
    },
    "desk": {
        "function": desk, "name": "Office Desk", "category": "study",
        "default_colour": "#C0B090", "visual_tags": ["melamine", "timber", "study"],
        "param_schema": {"width": {"type": "number", "default": 1400.0, "unit": "mm"}},
    },
    # Doors
    "internal_door": {
        "function": internal_door, "name": "Internal Door (Panelled)", "category": "doors",
        "default_colour": "#F5F5F0", "visual_tags": ["timber", "MDF", "doors"],
        "param_schema": {"width": {"type": "number", "default": 762.0, "unit": "mm", "enum": [610, 686, 762, 838]},
                         "panels": {"type": "integer", "default": 4, "enum": [0, 2, 4, 6]}},
    },
    "composite_front_door": {
        "function": composite_front_door, "name": "Composite Front Door", "category": "doors",
        "default_colour": "#2F4F4F", "visual_tags": ["GRP", "composite", "doors"],
        "param_schema": {"width": {"type": "number", "default": 920.0, "unit": "mm"}},
    },
    "bifold_door": {
        "function": bifold_door, "name": "Bifold Patio Door Set", "category": "doors",
        "default_colour": "#404040", "visual_tags": ["aluminium", "glass", "doors"],
        "param_schema": {"panels": {"type": "integer", "default": 3, "enum": [2, 3, 4, 5, 6]},
                         "panel_width": {"type": "number", "default": 900.0, "unit": "mm"}},
    },
    "sliding_pocket_door": {
        "function": sliding_pocket_door, "name": "Sliding Pocket Door", "category": "doors",
        "default_colour": "#F5F5F0", "visual_tags": ["timber", "MDF", "doors"],
        "param_schema": {"width": {"type": "number", "default": 826.0, "unit": "mm"}},
    },
    # Windows
    "casement_window": {
        "function": casement_window, "name": "Casement Window", "category": "windows",
        "default_colour": "#F5F5F5", "visual_tags": ["UPVC", "aluminium", "windows"],
        "param_schema": {"width": {"type": "number", "default": 1200.0, "unit": "mm"},
                         "height": {"type": "number", "default": 1050.0, "unit": "mm"}},
    },
    "sash_window": {
        "function": sash_window, "name": "Sash Window (Vertical Sliding)", "category": "windows",
        "default_colour": "#F5F5F5", "visual_tags": ["timber", "UPVC", "windows"],
        "param_schema": {"width": {"type": "number", "default": 900.0, "unit": "mm"},
                         "height": {"type": "number", "default": 1500.0, "unit": "mm"}},
    },
    "roof_window": {
        "function": roof_window, "name": "Roof Window (Velux-style)", "category": "windows",
        "default_colour": "#808080", "visual_tags": ["timber", "aluminium_clad", "windows"],
        "param_schema": {"width": {"type": "number", "default": 780.0, "unit": "mm"}},
    },
    # Electrical
    "light_switch": {
        "function": light_switch, "name": "Light Switch (UK)", "category": "electrical",
        "default_colour": "#F5F5F5", "visual_tags": ["plastic", "chrome", "electrical"],
        "param_schema": {"gangs": {"type": "integer", "default": 2, "enum": [1, 2, 3, 4]}},
    },
    "double_socket": {
        "function": double_socket, "name": "Double Socket (13A UK)", "category": "electrical",
        "default_colour": "#F5F5F5", "visual_tags": ["plastic", "chrome", "electrical"],
        "param_schema": {},
    },
    "downlight": {
        "function": downlight, "name": "Recessed LED Downlight", "category": "lighting",
        "default_colour": "#F5F5F5", "visual_tags": ["aluminium", "LED", "lighting"],
        "param_schema": {"od": {"type": "number", "default": 85.0, "unit": "mm", "enum": [68, 85, 100, 130]}},
    },
    # Plumbing / Heating
    "panel_radiator": {
        "function": panel_radiator, "name": "Panel Radiator (Type 22)", "category": "heating",
        "default_colour": "#F5F5F5", "visual_tags": ["steel", "heating"],
        "param_schema": {"width": {"type": "number", "default": 1000.0, "unit": "mm"},
                         "height": {"type": "number", "default": 600.0, "unit": "mm", "enum": [300, 450, 600, 700]},
                         "panels": {"type": "integer", "default": 2, "enum": [1, 2]}},
    },
    "trv_valve": {
        "function": trv_valve, "name": "Thermostatic Radiator Valve", "category": "heating",
        "default_colour": "#F5F5F5", "visual_tags": ["brass", "plastic", "heating"],
        "param_schema": {},
    },
    "combi_boiler": {
        "function": combi_boiler, "name": "Combi Boiler (Wall-Hung)", "category": "heating",
        "default_colour": "#F5F5F5", "visual_tags": ["steel", "heating"],
        "param_schema": {},
    },
    # Building Fabric
    "roof_tile": {
        "function": roof_tile, "name": "Interlocking Roof Tile", "category": "building_fabric",
        "default_colour": "#8B4513", "visual_tags": ["concrete", "clay", "roofing"],
        "param_schema": {},
    },
    "gutter_profile": {
        "function": gutter_profile, "name": "Gutter (Half-Round/Ogee)", "category": "building_fabric",
        "default_colour": "#2F2F2F", "visual_tags": ["UPVC", "cast_iron", "roofing"],
        "param_schema": {"profile": {"type": "string", "default": "half_round", "enum": ["half_round", "ogee"]}},
    },
    "steel_lintel": {
        "function": steel_lintel, "name": "Cavity Wall Steel Lintel", "category": "building_fabric",
        "default_colour": "#808080", "visual_tags": ["galvanised_steel", "structural"],
        "param_schema": {"span": {"type": "number", "default": 1200.0, "unit": "mm"}},
    },
}
