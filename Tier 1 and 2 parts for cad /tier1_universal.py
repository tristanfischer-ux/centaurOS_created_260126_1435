"""
ForgeOS Component Geometry Library — Tier 1: Universal Primitives
=================================================================
Every function:
  - Takes a `params` dict
  - Returns a cq.Workplane centered at origin, base at Z=0
  - Uses only safe CadQuery operations
  - Produces geometry that is VISUALLY RECOGNISABLE as the real part
"""

import cadquery as cq
import math


# ============================================================
# FASTENERS
# ============================================================

def hex_bolt(params):
    """
    ISO 4014 / DIN 931 hex head bolt.
    Recognisable: hexagonal head with chamfered edges, threaded shank.
    
    params:
        thread_d:    Nominal thread diameter (e.g. 3.0 for M3)
        thread_l:    Thread/shank length
        head_d:      Head across-flats diameter (default: ~1.7× thread_d)
        head_h:      Head height (default: ~0.65× thread_d)
        drive_depth: Hex socket depth (0 for external hex)
    """
    d = params.get("thread_d", 3.0)
    L = params.get("thread_l", 10.0)
    # ISO metric defaults
    head_af = params.get("head_d", round(d * 1.7, 1))  # across flats
    head_h = params.get("head_h", round(d * 0.65, 1))
    head_ar = head_af / math.sqrt(3)  # across corners (circumradius)

    # Head — hexagonal prism
    head = (
        cq.Workplane("XY")
        .workplane(offset=0)
        .polygon(6, head_af * 2 / math.sqrt(3))  # circumscribed radius
        .extrude(head_h)
    )

    # Head top chamfer — cut a cone to bevel the edges
    chamfer_cone = (
        cq.Workplane("XY")
        .workplane(offset=head_h)
        .circle(head_ar + 1)
        .workplane(offset=head_ar * 0.2)
        .circle(0.01)
        .loft()
    )
    # Instead of loft (risky), use a cylinder cut at angle — simpler
    # Just add a small flat on top
    head_top = (
        cq.Workplane("XY")
        .workplane(offset=head_h - 0.3)
        .circle(head_ar - 0.3)
        .extrude(0.3)
    )
    head = head.union(head_top)

    # Shank — cylindrical
    shank = (
        cq.Workplane("XY")
        .workplane(offset=-L)
        .circle(d / 2.0)
        .extrude(L)
    )

    # Thread indication — shallow helical grooves approximated by rings
    thread_pitch = {2: 0.4, 2.5: 0.45, 3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75}.get(d, 0.5)
    thread_rings = None
    num_rings = int(L / thread_pitch)
    for i in range(min(num_rings, 40)):  # Cap at 40 to avoid slowness
        z = -L + i * thread_pitch + thread_pitch / 2.0
        ring = (
            cq.Workplane("XY")
            .workplane(offset=z)
            .circle(d / 2.0 + 0.05)
            .circle(d / 2.0 - 0.15)
            .extrude(thread_pitch * 0.3)
        )
        if thread_rings is None:
            thread_rings = ring
        else:
            thread_rings = thread_rings.union(ring)

    bolt = head.union(shank)
    if thread_rings is not None:
        bolt = bolt.union(thread_rings)

    return bolt


def hex_nut(params):
    """
    ISO 4032 hex nut.
    Recognisable: hexagonal body with chamfered faces, threaded bore.
    
    params:
        thread_d:  Nominal thread diameter
        nut_af:    Across-flats (default: ~1.7× thread_d)
        nut_h:     Height (default: ~0.8× thread_d)
    """
    d = params.get("thread_d", 3.0)
    af = params.get("nut_af", round(d * 1.7, 1))
    h = params.get("nut_h", round(d * 0.8, 1))

    # Hex body
    body = (
        cq.Workplane("XY")
        .polygon(6, af * 2 / math.sqrt(3))
        .extrude(h)
    )

    # Threaded bore
    bore = (
        cq.Workplane("XY")
        .workplane(offset=-0.5)
        .circle(d / 2.0)
        .extrude(h + 1)
    )
    nut = body.cut(bore)

    # Chamfer top and bottom faces (small flat ring)
    ar = af / math.sqrt(3)
    for z_off in [0, h - 0.2]:
        chamf = (
            cq.Workplane("XY")
            .workplane(offset=z_off)
            .circle(ar + 0.5)
            .circle(ar - 0.2)
            .extrude(0.2)
        )
        nut = nut.cut(chamf)

    return nut


def socket_head_cap_screw(params):
    """
    ISO 4762 socket head cap screw (Allen bolt).
    Recognisable: cylindrical head with hex socket, threaded shank.
    
    params:
        thread_d:  Nominal thread diameter
        thread_l:  Shank length
        head_d:    Head diameter (default: ~1.5× thread_d)
        head_h:    Head height (default: ~thread_d)
        socket_af: Hex socket across-flats (default: ~0.5× head_d)
    """
    d = params.get("thread_d", 3.0)
    L = params.get("thread_l", 10.0)
    hd = params.get("head_d", round(d * 1.5 + 1, 1))
    hh = params.get("head_h", max(d, 2.0))
    saf = params.get("socket_af", round(hd * 0.5, 1))

    # Cylindrical head
    head = (
        cq.Workplane("XY")
        .circle(hd / 2.0)
        .extrude(hh)
    )

    # Hex socket recess
    socket = (
        cq.Workplane("XY")
        .workplane(offset=hh - hh * 0.6)
        .polygon(6, saf * 2 / math.sqrt(3))
        .extrude(hh * 0.6 + 0.5)
    )
    head = head.cut(socket)

    # Shank
    shank = (
        cq.Workplane("XY")
        .workplane(offset=-L)
        .circle(d / 2.0)
        .extrude(L)
    )

    return head.union(shank)


def washer(params):
    """
    Plain washer (ISO 7089).
    
    params:
        bore_d:   Inner diameter
        od:       Outer diameter
        thickness: Washer thickness
    """
    bore = params.get("bore_d", 3.4)
    od = params.get("od", 7.0)
    t = params.get("thickness", 0.5)

    outer = cq.Workplane("XY").circle(od / 2.0).extrude(t)
    inner = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(t + 0.2)
    return outer.cut(inner)


def heat_set_insert(params):
    """
    Brass heat-set threaded insert for 3D printing.
    Recognisable: knurled outer barrel with internal thread.
    
    params:
        thread_d:  Internal thread diameter (M2, M2.5, M3, etc.)
        od:        Outer diameter of insert
        length:    Insert length
    """
    d = params.get("thread_d", 3.0)
    od = params.get("od", d + 1.6)
    length = params.get("length", d * 1.5 + 1)

    # Outer barrel
    barrel = cq.Workplane("XY").circle(od / 2.0).extrude(length)

    # Internal thread bore
    bore = cq.Workplane("XY").workplane(offset=-0.1).circle(d / 2.0 * 0.85).extrude(length + 0.2)
    barrel = barrel.cut(bore)

    # Knurl pattern — circumferential grooves
    knurl = None
    groove_count = max(int(length / 1.0), 3)
    for i in range(groove_count):
        z = i * (length / groove_count) + 0.3
        groove = (
            cq.Workplane("XY")
            .workplane(offset=z)
            .circle(od / 2.0 + 0.1)
            .circle(od / 2.0 - 0.15)
            .extrude(0.3)
        )
        if knurl is None:
            knurl = groove
        else:
            knurl = knurl.union(groove)

    insert = barrel
    if knurl is not None:
        insert = insert.union(knurl)

    # Chamfered entry (tapered tip for easier insertion)
    taper = (
        cq.Workplane("XY")
        .workplane(offset=-0.5)
        .circle(od / 2.0 + 0.5)
        .extrude(0.5)
    )
    insert = insert.cut(taper)

    return insert


def standoff(params):
    """
    PCB standoff / spacer (hex or round).
    
    params:
        od:       Outer diameter or across-flats (hex)
        height:   Standoff height
        bore_d:   Through-hole diameter
        hex:      Boolean, True for hex shape (default True)
        thread_d: Thread size for tapped ends (0 for plain bore)
    """
    od = params.get("od", 5.0)
    h = params.get("height", 6.0)
    bore = params.get("bore_d", 2.5)
    is_hex = params.get("hex", True)
    thread_d = params.get("thread_d", 0)

    if is_hex:
        body = cq.Workplane("XY").polygon(6, od * 2 / math.sqrt(3)).extrude(h)
    else:
        body = cq.Workplane("XY").circle(od / 2.0).extrude(h)

    # Through bore
    hole = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(h + 0.2)
    body = body.cut(hole)

    # Tapped ends (thread indication rings)
    if thread_d > 0:
        for z_base in [0, h - 2]:
            thread_boss = (
                cq.Workplane("XY")
                .workplane(offset=z_base)
                .circle(thread_d / 2.0 + 0.3)
                .circle(thread_d / 2.0)
                .extrude(2)
            )
            body = body.union(thread_boss)

    return body


# ============================================================
# BEARINGS
# ============================================================

def ball_bearing(params):
    """
    Deep groove ball bearing (e.g. 608, 683, MR105).
    Recognisable: outer race, inner race, visible ball cage, shields.
    
    params:
        id:       Inner diameter (bore)
        od:       Outer diameter
        width:    Bearing width
        shielded: Boolean (True for ZZ shielded, False for open)
    """
    bore = params.get("id", 5.0)
    od = params.get("od", 16.0)
    w = params.get("width", 5.0)
    shielded = params.get("shielded", True)

    # Outer race
    outer = cq.Workplane("XY").circle(od / 2.0).extrude(w)
    outer_bore = cq.Workplane("XY").workplane(offset=-0.1).circle(od / 2.0 - 1.5).extrude(w + 0.2)
    outer_race = outer.cut(outer_bore)

    # Inner race
    inner = cq.Workplane("XY").circle(bore / 2.0 + 1.5).extrude(w)
    inner_bore = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(w + 0.2)
    inner_race = inner.cut(inner_bore)

    # Ball track (middle annulus visible on open bearings)
    ball_pcd = (bore / 2.0 + 1.5 + od / 2.0 - 1.5) / 2.0
    ball_d = (od / 2.0 - 1.5 - bore / 2.0 - 1.5) * 0.7

    # Balls — place 6-8 around the track
    num_balls = max(int(ball_pcd * math.pi / (ball_d * 1.5)), 5)
    num_balls = min(num_balls, 12)
    balls = None
    for i in range(num_balls):
        angle = 2 * math.pi * i / num_balls
        bx = ball_pcd * math.cos(angle)
        by = ball_pcd * math.sin(angle)
        ball = (
            cq.Workplane("XY")
            .workplane(offset=w / 2.0 - ball_d / 2.0)
            .transformed(offset=(bx, by, 0))
            .circle(ball_d / 2.0)
            .extrude(ball_d)
        )
        if balls is None:
            balls = ball
        else:
            balls = balls.union(ball)

    bearing = outer_race.union(inner_race)
    if balls is not None:
        bearing = bearing.union(balls)

    # Shields (if shielded)
    if shielded:
        for z_off in [0.3, w - 0.6]:
            shield = (
                cq.Workplane("XY")
                .workplane(offset=z_off)
                .circle(od / 2.0 - 0.5)
                .circle(bore / 2.0 + 0.8)
                .extrude(0.3)
            )
            bearing = bearing.union(shield)

    return bearing


def sleeve_bearing(params):
    """
    Plain sleeve / bushing bearing.
    
    params:
        id:     Inner diameter
        od:     Outer diameter
        length: Bearing length
        flange: Boolean (flanged bushing)
    """
    bore = params.get("id", 6.0)
    od = params.get("od", 10.0)
    length = params.get("length", 8.0)
    flanged = params.get("flange", False)

    body = cq.Workplane("XY").circle(od / 2.0).extrude(length)
    hole = cq.Workplane("XY").workplane(offset=-0.1).circle(bore / 2.0).extrude(length + 0.2)
    bushing = body.cut(hole)

    if flanged:
        flange_d = od * 1.4
        flange = (
            cq.Workplane("XY")
            .circle(flange_d / 2.0)
            .circle(bore / 2.0)
            .extrude(1.5)
        )
        bushing = bushing.union(flange)

    return bushing


# ============================================================
# CONNECTORS
# ============================================================

def usb_c_receptacle(params):
    """
    USB Type-C female receptacle.
    Recognisable: obround opening, metal shell, PCB pins.
    
    params:
        shell_l:  Shell length (default 7.35mm per spec)
        shell_w:  Shell width (default 8.94mm)
        shell_h:  Shell height (default 3.26mm)
    """
    sl = params.get("shell_l", 7.35)
    sw = params.get("shell_w", 8.94)
    sh = params.get("shell_h", 3.26)

    # Metal shell (outer)
    shell = (
        cq.Workplane("XY")
        .sketch()
        .rect(sw, sl)
        .vertices().fillet(1.2)
        .finalize()
        .extrude(sh)
    )

    # Inner cavity (obround)
    cavity = (
        cq.Workplane("XY")
        .workplane(offset=0.3)
        .sketch()
        .rect(sw - 0.8, sl - 0.8)
        .vertices().fillet(0.8)
        .finalize()
        .extrude(sh)
    )
    connector = shell.cut(cavity)

    # Tongue (center contact board)
    tongue = (
        cq.Workplane("XY")
        .workplane(offset=sh * 0.3)
        .transformed(offset=(0, 0.5, 0))
        .sketch()
        .rect(sw - 2.0, sl - 2.0)
        .vertices().fillet(0.5)
        .finalize()
        .extrude(sh * 0.15)
    )
    connector = connector.union(tongue)

    # PCB solder tabs (bottom)
    for x_off in [-sw / 2.0 + 1, sw / 2.0 - 1]:
        tab = (
            cq.Workplane("XY")
            .workplane(offset=-1.5)
            .transformed(offset=(x_off, 0, 0))
            .box(0.8, 2.0, 1.5)
        )
        connector = connector.union(tab)

    return connector


def barrel_jack(params):
    """
    DC barrel jack connector (e.g. 5.5×2.1mm).
    Recognisable: cylindrical barrel with center pin.
    
    params:
        barrel_od:   Outer barrel diameter (default 5.5)
        pin_d:       Center pin diameter (default 2.1)
        length:      Connector depth (default 11)
        panel_mount:  Boolean, include panel nut
    """
    bod = params.get("barrel_od", 5.5)
    pin = params.get("pin_d", 2.1)
    length = params.get("length", 11.0)
    panel = params.get("panel_mount", True)

    # Outer barrel
    barrel = cq.Workplane("XY").circle(bod / 2.0 + 1.5).extrude(length)
    bore = cq.Workplane("XY").workplane(offset=2).circle(bod / 2.0).extrude(length)
    body = barrel.cut(bore)

    # Center pin
    center_pin = (
        cq.Workplane("XY")
        .workplane(offset=3)
        .circle(pin / 2.0)
        .extrude(length - 3)
    )
    body = body.union(center_pin)

    # Panel mount flange
    if panel:
        flange = (
            cq.Workplane("XY")
            .workplane(offset=length - 2)
            .circle(bod / 2.0 + 3)
            .circle(bod / 2.0 + 1.5)
            .extrude(2)
        )
        body = body.union(flange)

    # Solder terminals (rear)
    for y_off in [-3, 0, 3]:
        pin_term = (
            cq.Workplane("XY")
            .workplane(offset=-3)
            .transformed(offset=(0, y_off, 0))
            .box(0.8, 0.8, 3)
        )
        body = body.union(pin_term)

    return body


def jst_connector(params):
    """
    JST-XH / JST-PH style PCB header connector.
    Recognisable: rectangular housing with pin grid.
    
    params:
        pins:    Number of pins (2-8)
        pitch:   Pin pitch (2.5 for XH, 2.0 for PH)
        type:    'header' (male PCB mount) or 'housing' (female cable end)
    """
    pins = params.get("pins", 4)
    pitch = params.get("pitch", 2.5)
    conn_type = params.get("type", "header")

    width = (pins - 1) * pitch + 4.0
    depth = 6.0
    height = 7.0 if conn_type == "header" else 6.5

    # Housing body
    body = (
        cq.Workplane("XY")
        .sketch()
        .rect(width, depth)
        .vertices().fillet(0.5)
        .finalize()
        .extrude(height)
    )

    # Pin cavity (hollowed top)
    cavity = (
        cq.Workplane("XY")
        .workplane(offset=height - 4)
        .sketch()
        .rect(width - 1.6, depth - 1.6)
        .vertices().fillet(0.3)
        .finalize()
        .extrude(4.5)
    )
    body = body.cut(cavity)

    # Pins
    pin_start_x = -((pins - 1) * pitch) / 2.0
    for i in range(pins):
        px = pin_start_x + i * pitch
        if conn_type == "header":
            # Through-hole pins extending below
            pin = (
                cq.Workplane("XY")
                .workplane(offset=-3)
                .transformed(offset=(px, 0, 0))
                .box(0.6, 0.6, height + 3)
            )
        else:
            # Internal socket pins
            pin = (
                cq.Workplane("XY")
                .workplane(offset=1)
                .transformed(offset=(px, 0, 0))
                .box(0.5, 0.5, height - 2)
            )
        body = body.union(pin)

    # Latch tab on one side
    latch = (
        cq.Workplane("XY")
        .workplane(offset=height - 3)
        .transformed(offset=(0, depth / 2.0, 0))
        .box(4, 1.5, 2)
    )
    body = body.union(latch)

    return body


# ============================================================
# TUBES AND PIPES
# ============================================================

def round_tube(params):
    """
    Round tube / pipe section.
    
    params:
        od:     Outer diameter
        wall:   Wall thickness
        length: Tube length
    """
    od = params.get("od", 25.0)
    wall = params.get("wall", 2.0)
    length = params.get("length", 100.0)

    outer = cq.Workplane("XY").circle(od / 2.0).extrude(length)
    inner = cq.Workplane("XY").workplane(offset=-0.1).circle(od / 2.0 - wall).extrude(length + 0.2)
    return outer.cut(inner)


def square_tube(params):
    """
    Square / rectangular tube section.
    
    params:
        width:  Outer width
        height: Outer height (default = width for square)
        wall:   Wall thickness
        length: Tube length
        corner_r: External corner radius
    """
    w = params.get("width", 20.0)
    h = params.get("height", w)
    wall = params.get("wall", 2.0)
    length = params.get("length", 100.0)
    cr = params.get("corner_r", wall)

    outer = (
        cq.Workplane("XY")
        .sketch().rect(w, h).vertices().fillet(cr).finalize()
        .extrude(length)
    )
    inner = (
        cq.Workplane("XY")
        .workplane(offset=-0.1)
        .sketch().rect(w - wall * 2, h - wall * 2).vertices().fillet(max(cr - wall, 0.5)).finalize()
        .extrude(length + 0.2)
    )
    return outer.cut(inner)


# ============================================================
# SHEET METAL BRACKETS
# ============================================================

def l_bracket(params):
    """
    L-shaped sheet metal bracket with mounting holes.
    
    params:
        leg_a:    Length of first leg
        leg_b:    Length of second leg
        width:    Bracket width (perpendicular to L)
        thickness: Material thickness
        hole_d:   Mounting hole diameter (0 for no holes)
    """
    a = params.get("leg_a", 30.0)
    b = params.get("leg_b", 30.0)
    w = params.get("width", 20.0)
    t = params.get("thickness", 2.0)

    # Vertical leg
    leg_v = (
        cq.Workplane("XY")
        .transformed(offset=(t / 2, 0, a / 2))
        .box(t, w, a)
    )

    # Horizontal leg
    leg_h = (
        cq.Workplane("XY")
        .transformed(offset=(b / 2, 0, t / 2))
        .box(b, w, t)
    )

    bracket = leg_v.union(leg_h)

    # Mounting holes
    hole_d = params.get("hole_d", 3.4)
    if hole_d > 0:
        # Hole in vertical leg
        h1 = (
            cq.Workplane("XY")
            .workplane(offset=a * 0.65)
            .transformed(offset=(0, 0, 0))
            .transformed(rotate=(0, 90, 0))
            .circle(hole_d / 2.0)
            .extrude(t + 2)
        )
        # Hole in horizontal leg
        h2 = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(b * 0.65, 0, 0))
            .circle(hole_d / 2.0)
            .extrude(t + 1)
        )
        bracket = bracket.cut(h1).cut(h2)

    return bracket


# ============================================================
# REGISTRY — Maps slug to function + parameter schema
# ============================================================

TIER1_REGISTRY = {
    "hex_bolt": {
        "function": hex_bolt,
        "name": "Hex Head Bolt (ISO 4014)",
        "category": "fastener",
        "default_colour": "#C0C0C0",
        "visual_tags": ["metal", "steel", "zinc"],
        "param_schema": {
            "thread_d": {"type": "number", "default": 3.0, "min": 1.6, "max": 24, "unit": "mm", "description": "Nominal thread diameter"},
            "thread_l": {"type": "number", "default": 10.0, "min": 3, "max": 200, "unit": "mm", "description": "Thread/shank length"},
            "head_d": {"type": "number", "default": None, "unit": "mm", "description": "Head across-flats (auto-calculated if omitted)"},
            "head_h": {"type": "number", "default": None, "unit": "mm", "description": "Head height (auto-calculated if omitted)"},
        },
        "mounting_interfaces": [
            {"name": "thread", "type": "thread", "position": "bottom"},
            {"name": "head_seat", "type": "bolt_circle", "position": "top"},
        ],
    },
    "hex_nut": {
        "function": hex_nut,
        "name": "Hex Nut (ISO 4032)",
        "category": "fastener",
        "default_colour": "#C0C0C0",
        "visual_tags": ["metal", "steel", "zinc"],
        "param_schema": {
            "thread_d": {"type": "number", "default": 3.0, "min": 1.6, "max": 24, "unit": "mm"},
        },
    },
    "socket_head_cap_screw": {
        "function": socket_head_cap_screw,
        "name": "Socket Head Cap Screw (ISO 4762)",
        "category": "fastener",
        "default_colour": "#1A1A1A",
        "visual_tags": ["metal", "steel", "black_oxide"],
        "param_schema": {
            "thread_d": {"type": "number", "default": 3.0, "min": 1.6, "max": 24, "unit": "mm"},
            "thread_l": {"type": "number", "default": 10.0, "min": 3, "max": 200, "unit": "mm"},
        },
    },
    "washer": {
        "function": washer,
        "name": "Plain Washer (ISO 7089)",
        "category": "fastener",
        "default_colour": "#C0C0C0",
        "visual_tags": ["metal", "steel"],
        "param_schema": {
            "bore_d": {"type": "number", "default": 3.4, "unit": "mm"},
            "od": {"type": "number", "default": 7.0, "unit": "mm"},
            "thickness": {"type": "number", "default": 0.5, "unit": "mm"},
        },
    },
    "heat_set_insert": {
        "function": heat_set_insert,
        "name": "Heat-Set Threaded Insert",
        "category": "fastener",
        "default_colour": "#B8860B",
        "visual_tags": ["metal", "brass"],
        "param_schema": {
            "thread_d": {"type": "number", "default": 3.0, "min": 2, "max": 8, "unit": "mm"},
        },
    },
    "standoff": {
        "function": standoff,
        "name": "PCB Standoff / Spacer",
        "category": "fastener",
        "default_colour": "#C0C0C0",
        "visual_tags": ["metal", "steel", "nylon"],
        "param_schema": {
            "od": {"type": "number", "default": 5.0, "unit": "mm"},
            "height": {"type": "number", "default": 6.0, "unit": "mm"},
            "bore_d": {"type": "number", "default": 2.5, "unit": "mm"},
            "hex": {"type": "boolean", "default": True},
        },
    },
    "ball_bearing": {
        "function": ball_bearing,
        "name": "Deep Groove Ball Bearing",
        "category": "bearing",
        "default_colour": "#A0A0A0",
        "visual_tags": ["metal", "steel", "rotating"],
        "param_schema": {
            "id": {"type": "number", "default": 5.0, "unit": "mm", "description": "Bore diameter"},
            "od": {"type": "number", "default": 16.0, "unit": "mm", "description": "Outer diameter"},
            "width": {"type": "number", "default": 5.0, "unit": "mm"},
            "shielded": {"type": "boolean", "default": True},
        },
    },
    "sleeve_bearing": {
        "function": sleeve_bearing,
        "name": "Plain Sleeve Bearing / Bushing",
        "category": "bearing",
        "default_colour": "#CD853F",
        "visual_tags": ["metal", "bronze", "rotating"],
        "param_schema": {
            "id": {"type": "number", "default": 6.0, "unit": "mm"},
            "od": {"type": "number", "default": 10.0, "unit": "mm"},
            "length": {"type": "number", "default": 8.0, "unit": "mm"},
            "flange": {"type": "boolean", "default": False},
        },
    },
    "usb_c_receptacle": {
        "function": usb_c_receptacle,
        "name": "USB Type-C Receptacle",
        "category": "connector",
        "default_colour": "#808080",
        "visual_tags": ["metal", "electrical"],
        "param_schema": {},
    },
    "barrel_jack": {
        "function": barrel_jack,
        "name": "DC Barrel Jack Connector",
        "category": "connector",
        "default_colour": "#1A1A1A",
        "visual_tags": ["plastic", "electrical"],
        "param_schema": {
            "barrel_od": {"type": "number", "default": 5.5, "unit": "mm"},
            "pin_d": {"type": "number", "default": 2.1, "unit": "mm"},
        },
    },
    "jst_connector": {
        "function": jst_connector,
        "name": "JST-XH / JST-PH Connector",
        "category": "connector",
        "default_colour": "#F5F5DC",
        "visual_tags": ["plastic", "electrical"],
        "param_schema": {
            "pins": {"type": "integer", "default": 4, "min": 2, "max": 8},
            "pitch": {"type": "number", "default": 2.5, "unit": "mm"},
            "type": {"type": "string", "default": "header", "enum": ["header", "housing"]},
        },
    },
    "round_tube": {
        "function": round_tube,
        "name": "Round Tube / Pipe",
        "category": "tube",
        "default_colour": "#B0B0B0",
        "visual_tags": ["metal", "structural"],
        "param_schema": {
            "od": {"type": "number", "default": 25.0, "unit": "mm"},
            "wall": {"type": "number", "default": 2.0, "unit": "mm"},
            "length": {"type": "number", "default": 100.0, "unit": "mm"},
        },
    },
    "square_tube": {
        "function": square_tube,
        "name": "Square / Rectangular Tube",
        "category": "tube",
        "default_colour": "#B0B0B0",
        "visual_tags": ["metal", "structural"],
        "param_schema": {
            "width": {"type": "number", "default": 20.0, "unit": "mm"},
            "height": {"type": "number", "default": 20.0, "unit": "mm"},
            "wall": {"type": "number", "default": 2.0, "unit": "mm"},
            "length": {"type": "number", "default": 100.0, "unit": "mm"},
        },
    },
    "l_bracket": {
        "function": l_bracket,
        "name": "L-Bracket (Sheet Metal)",
        "category": "bracket",
        "default_colour": "#B0B0B0",
        "visual_tags": ["metal", "structural", "sheet_metal"],
        "param_schema": {
            "leg_a": {"type": "number", "default": 30.0, "unit": "mm"},
            "leg_b": {"type": "number", "default": 30.0, "unit": "mm"},
            "width": {"type": "number", "default": 20.0, "unit": "mm"},
            "thickness": {"type": "number", "default": 2.0, "unit": "mm"},
        },
    },
}
