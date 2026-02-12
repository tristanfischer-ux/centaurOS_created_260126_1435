"""
ForgeOS Component Geometry Library — Tier 3: Vertical Farming
=============================================================
NFT channels, LED bars, grow trays, net pots, reservoirs,
sensors, drippers, and vertical tower sections.
"""

import cadquery as cq
import math


def nft_channel(params):
    """
    NFT (Nutrient Film Technique) grow channel / gutter.
    Aluminium U-channel with nutrient flow, plant holes on top.
    
    params:
        length:     Channel length
        width:      Channel outer width
        height:     Channel height (depth)
        wall:       Wall thickness
        hole_d:     Plant hole diameter
        hole_spacing: Center-to-center spacing of plant holes
        end_caps:   Boolean, include end caps with drain
    """
    L = params.get("length", 1200.0)
    W = params.get("width", 100.0)
    H = params.get("height", 60.0)
    wall = params.get("wall", 1.5)
    hole_d = params.get("hole_d", 50.0)
    hole_sp = params.get("hole_spacing", 200.0)
    end_caps = params.get("end_caps", True)

    # Outer shell — U-channel
    outer = (
        cq.Workplane("XY")
        .sketch().rect(L, W).vertices().fillet(3).finalize()
        .extrude(H)
    )
    inner = (
        cq.Workplane("XY")
        .workplane(offset=wall)
        .sketch().rect(L - wall * 2, W - wall * 2).vertices().fillet(2).finalize()
        .extrude(H)
    )
    channel = outer.cut(inner)

    # Lid with plant holes
    lid = (
        cq.Workplane("XY")
        .workplane(offset=H - wall)
        .sketch().rect(L, W).vertices().fillet(3).finalize()
        .extrude(wall)
    )

    # Plant holes
    num_holes = max(int((L - hole_sp) / hole_sp) + 1, 1)
    start_x = -(num_holes - 1) * hole_sp / 2.0
    for i in range(num_holes):
        hx = start_x + i * hole_sp
        hole = (
            cq.Workplane("XY")
            .workplane(offset=H - wall - 0.5)
            .transformed(offset=(hx, 0, 0))
            .circle(hole_d / 2.0)
            .extrude(wall + 1)
        )
        lid = lid.cut(hole)

    channel = channel.union(lid)

    # End caps with drain fitting
    if end_caps:
        for x_pos in [-(L / 2.0 - wall / 2.0), L / 2.0 - wall / 2.0]:
            cap = (
                cq.Workplane("XY")
                .workplane(offset=0)
                .transformed(offset=(x_pos, 0, 0))
                .sketch().rect(wall, W - wall * 2).finalize()
                .extrude(H - wall)
            )
            channel = channel.union(cap)

        # Drain outlet (one end, bottom)
        drain = (
            cq.Workplane("XY")
            .workplane(offset=wall + 5)
            .transformed(offset=(L / 2.0, 0, 0))
            .transformed(rotate=(0, 90, 0))
            .circle(10)
            .extrude(15)
        )
        drain_bore = (
            cq.Workplane("XY")
            .workplane(offset=wall + 5)
            .transformed(offset=(L / 2.0 - 1, 0, 0))
            .transformed(rotate=(0, 90, 0))
            .circle(8)
            .extrude(20)
        )
        channel = channel.union(drain).cut(drain_bore)

    return channel


def led_grow_light_bar(params):
    """
    Linear LED grow light bar with heatsink and lens array.
    Recognisable: long aluminium extrusion with LED strip and diffuser.
    
    params:
        length:     Bar length
        width:      Heatsink width
        height:     Total height (heatsink + LEDs + lens)
        led_count:  Number of LED modules
        fin_count:  Number of heatsink fins
    """
    L = params.get("length", 1000.0)
    W = params.get("width", 40.0)
    H = params.get("height", 25.0)
    led_count = params.get("led_count", 20)
    fin_count = params.get("fin_count", 15)

    # Heatsink base plate
    base_h = 4.0
    base = (
        cq.Workplane("XY")
        .sketch().rect(L, W).finalize()
        .extrude(base_h)
    )

    # Heatsink fins (on top)
    fin_h = H - base_h - 5
    fin_t = 1.0
    fin_spacing = W / (fin_count + 1)
    fins = None
    for i in range(fin_count):
        fy = -(W / 2.0) + (i + 1) * fin_spacing
        fin = (
            cq.Workplane("XY")
            .workplane(offset=base_h)
            .transformed(offset=(0, fy, 0))
            .sketch().rect(L - 4, fin_t).finalize()
            .extrude(fin_h)
        )
        if fins is None:
            fins = fin
        else:
            fins = fins.union(fin)

    # LED PCB strip (bottom face)
    pcb = (
        cq.Workplane("XY")
        .workplane(offset=-1.6)
        .sketch().rect(L - 10, W - 10).finalize()
        .extrude(1.6)
    )

    # LED modules
    led_spacing = (L - 40) / max(led_count - 1, 1)
    leds = None
    start_x = -(led_count - 1) * led_spacing / 2.0
    for i in range(led_count):
        lx = start_x + i * led_spacing
        led = (
            cq.Workplane("XY")
            .workplane(offset=-1.6 - 2)
            .transformed(offset=(lx, 0, 0))
            .box(5, 5, 2)
        )
        if leds is None:
            leds = led
        else:
            leds = leds.union(led)

    # Diffuser lens (below LEDs)
    lens = (
        cq.Workplane("XY")
        .workplane(offset=-1.6 - 2 - 2)
        .sketch().rect(L - 6, W - 6).vertices().fillet(2).finalize()
        .extrude(2)
    )

    bar = base
    if fins is not None:
        bar = bar.union(fins)
    bar = bar.union(pcb)
    if leds is not None:
        bar = bar.union(leds)
    bar = bar.union(lens)

    # End caps with mounting holes
    for x_off in [-(L / 2.0 - 2), L / 2.0 - 2]:
        cap = (
            cq.Workplane("XY")
            .workplane(offset=-4)
            .transformed(offset=(x_off, 0, 0))
            .sketch().rect(4, W).vertices().fillet(2).finalize()
            .extrude(H + 4)
        )
        hole = (
            cq.Workplane("XY")
            .workplane(offset=H / 2.0)
            .transformed(offset=(x_off, 0, 0))
            .transformed(rotate=(0, 90, 0))
            .circle(2.5)
            .extrude(6)
        )
        bar = bar.union(cap).cut(hole)

    return bar


def grow_tray(params):
    """
    Shallow flood/drain grow tray with drainage fittings.
    
    params:
        length:   Tray length
        width:    Tray width
        depth:    Tray depth (wall height)
        wall:     Wall thickness
        drain_d:  Drain fitting diameter
    """
    L = params.get("length", 600.0)
    W = params.get("width", 400.0)
    D = params.get("depth", 50.0)
    wall = params.get("wall", 3.0)
    drain_d = params.get("drain_d", 20.0)

    outer = (
        cq.Workplane("XY")
        .sketch().rect(L, W).vertices().fillet(5).finalize()
        .extrude(D)
    )
    inner = (
        cq.Workplane("XY")
        .workplane(offset=wall)
        .sketch().rect(L - wall * 2, W - wall * 2).vertices().fillet(3).finalize()
        .extrude(D)
    )
    tray = outer.cut(inner)

    # Drain fitting (bottom corner)
    drain = (
        cq.Workplane("XY")
        .workplane(offset=-10)
        .transformed(offset=(L / 2.0 - 40, W / 2.0 - 40, 0))
        .circle(drain_d / 2.0)
        .extrude(wall + 12)
    )
    drain_bore = (
        cq.Workplane("XY")
        .workplane(offset=-11)
        .transformed(offset=(L / 2.0 - 40, W / 2.0 - 40, 0))
        .circle(drain_d / 2.0 - 2)
        .extrude(wall + 14)
    )
    tray = tray.union(drain).cut(drain_bore)

    # Lip / rim (reinforced top edge)
    rim = (
        cq.Workplane("XY")
        .workplane(offset=D - 2)
        .sketch().rect(L + 10, W + 10).vertices().fillet(6).finalize()
        .extrude(2)
    )
    rim_inner = (
        cq.Workplane("XY")
        .workplane(offset=D - 2.5)
        .sketch().rect(L - 2, W - 2).vertices().fillet(4).finalize()
        .extrude(3)
    )
    tray = tray.union(rim).cut(rim_inner)

    return tray


def net_pot(params):
    """
    Hydroponic net pot / grow cup with mesh slots for root growth.
    
    params:
        top_d:    Top opening diameter
        bottom_d: Bottom diameter
        height:   Pot height
        rim_w:    Rim flange width
        slot_count: Number of mesh slots per ring
    """
    top_d = params.get("top_d", 50.0)
    bot_d = params.get("bottom_d", 35.0)
    h = params.get("height", 50.0)
    rim_w = params.get("rim_w", 5.0)
    slots = params.get("slot_count", 8)
    wall = 1.5

    # Tapered cup — built as concentric cylinders stepping down
    steps = 6
    cup = None
    for i in range(steps):
        z = i * (h / steps)
        frac = i / (steps - 1) if steps > 1 else 0
        d = top_d - (top_d - bot_d) * frac
        ring_outer = (
            cq.Workplane("XY")
            .workplane(offset=z)
            .circle(d / 2.0)
            .extrude(h / steps + 0.5)
        )
        ring_inner = (
            cq.Workplane("XY")
            .workplane(offset=z - 0.1)
            .circle(d / 2.0 - wall)
            .extrude(h / steps + 1)
        )
        ring = ring_outer.cut(ring_inner)
        if cup is None:
            cup = ring
        else:
            cup = cup.union(ring)

    # Bottom mesh (cross pattern)
    cross1 = (
        cq.Workplane("XY")
        .sketch().rect(bot_d - 4, wall).finalize()
        .extrude(wall)
    )
    cross2 = (
        cq.Workplane("XY")
        .sketch().rect(wall, bot_d - 4).finalize()
        .extrude(wall)
    )
    cup = cup.union(cross1).union(cross2)

    # Top rim / flange
    rim = (
        cq.Workplane("XY")
        .workplane(offset=h - 2)
        .circle((top_d + rim_w * 2) / 2.0)
        .circle(top_d / 2.0 - wall)
        .extrude(2)
    )
    cup = cup.union(rim)

    # Mesh slots (vertical cuts in the wall)
    for ring_z in [h * 0.25, h * 0.5, h * 0.75]:
        d_at_z = top_d - (top_d - bot_d) * (1 - ring_z / h)
        for j in range(slots):
            angle = 2 * math.pi * j / slots
            sx = (d_at_z / 2.0) * math.cos(angle)
            sy = (d_at_z / 2.0) * math.sin(angle)
            slot = (
                cq.Workplane("XY")
                .workplane(offset=ring_z - 3)
                .transformed(offset=(sx, sy, 0))
                .box(3, wall + 2, 6)
            )
            cup = cup.cut(slot)

    return cup


def nutrient_reservoir(params):
    """
    Rectangular nutrient solution reservoir tank with lid.
    
    params:
        length:   Tank length
        width:    Tank width
        height:   Tank height
        wall:     Wall thickness
        inlet_d:  Inlet fitting diameter
        outlet_d: Outlet fitting diameter
    """
    L = params.get("length", 500.0)
    W = params.get("width", 300.0)
    H = params.get("height", 250.0)
    wall = params.get("wall", 4.0)
    inlet_d = params.get("inlet_d", 20.0)
    outlet_d = params.get("outlet_d", 25.0)

    # Tank body
    outer = (
        cq.Workplane("XY")
        .sketch().rect(L, W).vertices().fillet(8).finalize()
        .extrude(H)
    )
    inner = (
        cq.Workplane("XY")
        .workplane(offset=wall)
        .sketch().rect(L - wall * 2, W - wall * 2).vertices().fillet(6).finalize()
        .extrude(H - wall)
    )
    tank = outer.cut(inner)

    # Lid
    lid = (
        cq.Workplane("XY")
        .workplane(offset=H)
        .sketch().rect(L + 6, W + 6).vertices().fillet(9).finalize()
        .extrude(wall)
    )
    # Lid lip (fits inside tank)
    lip = (
        cq.Workplane("XY")
        .workplane(offset=H - 8)
        .sketch().rect(L - wall * 2 - 2, W - wall * 2 - 2).vertices().fillet(5).finalize()
        .extrude(8)
    )
    lip_inner = (
        cq.Workplane("XY")
        .workplane(offset=H - 9)
        .sketch().rect(L - wall * 2 - 6, W - wall * 2 - 6).vertices().fillet(4).finalize()
        .extrude(10)
    )
    lid = lid.union(lip).cut(lip_inner)
    tank = tank.union(lid)

    # Inlet fitting (top side)
    inlet = (
        cq.Workplane("XY")
        .workplane(offset=H - 40)
        .transformed(offset=(0, W / 2.0, 0))
        .transformed(rotate=(90, 0, 0))
        .circle(inlet_d / 2.0)
        .extrude(15)
    )
    inlet_bore = (
        cq.Workplane("XY")
        .workplane(offset=H - 40)
        .transformed(offset=(0, W / 2.0 - 2, 0))
        .transformed(rotate=(90, 0, 0))
        .circle(inlet_d / 2.0 - 2)
        .extrude(20)
    )
    tank = tank.union(inlet).cut(inlet_bore)

    # Outlet fitting (bottom side, opposite end)
    outlet = (
        cq.Workplane("XY")
        .workplane(offset=wall + 15)
        .transformed(offset=(0, -(W / 2.0), 0))
        .transformed(rotate=(90, 0, 0))
        .circle(outlet_d / 2.0)
        .extrude(-15)
    )
    outlet_bore = (
        cq.Workplane("XY")
        .workplane(offset=wall + 15)
        .transformed(offset=(0, -(W / 2.0) + 2, 0))
        .transformed(rotate=(90, 0, 0))
        .circle(outlet_d / 2.0 - 2)
        .extrude(-20)
    )
    tank = tank.union(outlet).cut(outlet_bore)

    return tank


def sensor_probe(params):
    """
    pH / EC / dissolved oxygen sensor probe.
    Cylindrical probe body with sensing tip and cable gland.
    
    params:
        probe_d:    Probe body diameter
        probe_l:    Probe length
        tip_d:      Sensing tip diameter
        tip_l:      Sensing tip length
        cable_d:    Cable diameter
    """
    pd = params.get("probe_d", 12.0)
    pl = params.get("probe_l", 120.0)
    td = params.get("tip_d", 10.0)
    tl = params.get("tip_l", 15.0)
    cd = params.get("cable_d", 5.0)

    # Probe body
    body = cq.Workplane("XY").circle(pd / 2.0).extrude(pl)

    # Sensing tip (narrower, rounded)
    tip = (
        cq.Workplane("XY")
        .workplane(offset=-tl)
        .circle(td / 2.0)
        .extrude(tl)
    )
    # Rounded end
    tip_cap = (
        cq.Workplane("XY")
        .workplane(offset=-tl - td / 3.0)
        .circle(td / 2.0)
        .extrude(td / 3.0)
    )

    # Cable gland (top)
    gland = (
        cq.Workplane("XY")
        .workplane(offset=pl)
        .circle(pd / 2.0 + 2)
        .extrude(8)
    )
    cable = (
        cq.Workplane("XY")
        .workplane(offset=pl + 8)
        .circle(cd / 2.0)
        .extrude(20)
    )

    # Reference electrode ring (visible band near tip)
    ref_ring = (
        cq.Workplane("XY")
        .workplane(offset=-3)
        .circle(pd / 2.0 + 0.3)
        .circle(pd / 2.0 - 0.3)
        .extrude(3)
    )

    probe = body.union(tip).union(tip_cap).union(gland).union(cable).union(ref_ring)
    return probe


def drip_emitter(params):
    """
    Irrigation drip emitter — inline or button type.
    Small flow-restricting device for precise water delivery.
    
    params:
        body_d:   Body diameter
        body_l:   Body length
        barb_d:   Barb fitting diameter (inlet/outlet)
        barb_l:   Barb length
    """
    bd = params.get("body_d", 15.0)
    bl = params.get("body_l", 20.0)
    barb_d = params.get("barb_d", 6.0)
    barb_l = params.get("barb_l", 12.0)

    # Main body (disc shape)
    body = cq.Workplane("XY").circle(bd / 2.0).extrude(bl)

    # Inlet barb
    barb_in = (
        cq.Workplane("XY")
        .workplane(offset=bl)
        .circle(barb_d / 2.0)
        .extrude(barb_l)
    )
    # Barb ridges
    for z in range(0, int(barb_l), 3):
        ridge = (
            cq.Workplane("XY")
            .workplane(offset=bl + z)
            .circle(barb_d / 2.0 + 0.8)
            .extrude(1)
        )
        barb_in = barb_in.union(ridge)

    # Outlet barb
    barb_out = (
        cq.Workplane("XY")
        .workplane(offset=-barb_l)
        .circle(barb_d / 2.0)
        .extrude(barb_l)
    )
    for z in range(0, int(barb_l), 3):
        ridge = (
            cq.Workplane("XY")
            .workplane(offset=-barb_l + z)
            .circle(barb_d / 2.0 + 0.8)
            .extrude(1)
        )
        barb_out = barb_out.union(ridge)

    # Through bore
    bore = (
        cq.Workplane("XY")
        .workplane(offset=-barb_l - 1)
        .circle(barb_d / 2.0 - 1.5)
        .extrude(bl + barb_l * 2 + 2)
    )

    emitter = body.union(barb_in).union(barb_out).cut(bore)
    return emitter


def vertical_tower_section(params):
    """
    Stackable vertical grow tower section.
    Cylinder with offset planting pockets around circumference.
    
    params:
        od:          Tower outer diameter
        height:      Section height
        wall:        Wall thickness
        pocket_count: Number of planting pockets per section
        pocket_d:    Pocket opening diameter
    """
    od = params.get("od", 160.0)
    h = params.get("height", 200.0)
    wall = params.get("wall", 4.0)
    pockets = params.get("pocket_count", 4)
    pocket_d = params.get("pocket_d", 50.0)

    # Main cylinder
    outer = cq.Workplane("XY").circle(od / 2.0).extrude(h)
    inner = cq.Workplane("XY").workplane(offset=wall).circle(od / 2.0 - wall).extrude(h - wall * 2)
    tower = outer.cut(inner)

    # Planting pockets (protruding cups with holes)
    for i in range(pockets):
        angle = 2 * math.pi * i / pockets
        z_offset = (i + 0.5) * (h / pockets)
        px = (od / 2.0 + pocket_d / 3.0) * math.cos(angle)
        py = (od / 2.0 + pocket_d / 3.0) * math.sin(angle)

        pocket = (
            cq.Workplane("XY")
            .workplane(offset=z_offset - pocket_d / 2.0)
            .transformed(offset=(px, py, 0))
            .circle(pocket_d / 2.0)
            .extrude(pocket_d)
        )
        pocket_bore = (
            cq.Workplane("XY")
            .workplane(offset=z_offset - pocket_d / 2.0 + 2)
            .transformed(offset=(px, py, 0))
            .circle(pocket_d / 2.0 - 2)
            .extrude(pocket_d)
        )
        tower = tower.union(pocket).cut(pocket_bore)

    # Stacking interface — male lip at top
    lip = (
        cq.Workplane("XY")
        .workplane(offset=h)
        .circle(od / 2.0 - wall - 1)
        .circle(od / 2.0 - wall - 3)
        .extrude(8)
    )
    # Female socket at bottom
    socket = (
        cq.Workplane("XY")
        .workplane(offset=-1)
        .circle(od / 2.0 - wall)
        .circle(od / 2.0 - wall - 3)
        .extrude(9)
    )
    tower = tower.union(lip).cut(socket)

    return tower


TIER3_VERTICAL_FARMING = {
    "nft_channel": {
        "function": nft_channel,
        "name": "NFT Grow Channel / Gutter",
        "category": "hydroponics",
        "default_colour": "#E0E0E0",
        "visual_tags": ["aluminium", "structural", "hydroponics"],
        "param_schema": {
            "length": {"type": "number", "default": 1200.0, "unit": "mm"},
            "width": {"type": "number", "default": 100.0, "unit": "mm"},
            "height": {"type": "number", "default": 60.0, "unit": "mm"},
            "hole_d": {"type": "number", "default": 50.0, "unit": "mm"},
            "hole_spacing": {"type": "number", "default": 200.0, "unit": "mm"},
        },
    },
    "led_grow_light_bar": {
        "function": led_grow_light_bar,
        "name": "LED Grow Light Bar",
        "category": "lighting",
        "default_colour": "#C0C0C0",
        "visual_tags": ["aluminium", "electrical", "lighting"],
        "param_schema": {
            "length": {"type": "number", "default": 1000.0, "unit": "mm"},
            "width": {"type": "number", "default": 40.0, "unit": "mm"},
            "led_count": {"type": "integer", "default": 20},
        },
    },
    "grow_tray": {
        "function": grow_tray,
        "name": "Grow Tray / Flood Table",
        "category": "hydroponics",
        "default_colour": "#2F4F2F",
        "visual_tags": ["plastic", "hydroponics"],
        "param_schema": {
            "length": {"type": "number", "default": 600.0, "unit": "mm"},
            "width": {"type": "number", "default": 400.0, "unit": "mm"},
            "depth": {"type": "number", "default": 50.0, "unit": "mm"},
        },
    },
    "net_pot": {
        "function": net_pot,
        "name": "Hydroponic Net Pot / Grow Cup",
        "category": "hydroponics",
        "default_colour": "#1A1A1A",
        "visual_tags": ["plastic", "hydroponics"],
        "param_schema": {
            "top_d": {"type": "number", "default": 50.0, "unit": "mm"},
            "height": {"type": "number", "default": 50.0, "unit": "mm"},
        },
    },
    "nutrient_reservoir": {
        "function": nutrient_reservoir,
        "name": "Nutrient Reservoir Tank",
        "category": "hydroponics",
        "default_colour": "#000080",
        "visual_tags": ["plastic", "hdpe", "hydroponics"],
        "param_schema": {
            "length": {"type": "number", "default": 500.0, "unit": "mm"},
            "width": {"type": "number", "default": 300.0, "unit": "mm"},
            "height": {"type": "number", "default": 250.0, "unit": "mm"},
        },
    },
    "sensor_probe": {
        "function": sensor_probe,
        "name": "pH / EC Sensor Probe",
        "category": "sensor",
        "default_colour": "#4169E1",
        "visual_tags": ["plastic", "electrical", "sensor"],
        "param_schema": {
            "probe_d": {"type": "number", "default": 12.0, "unit": "mm"},
            "probe_l": {"type": "number", "default": 120.0, "unit": "mm"},
        },
    },
    "drip_emitter": {
        "function": drip_emitter,
        "name": "Drip Irrigation Emitter",
        "category": "irrigation",
        "default_colour": "#8B4513",
        "visual_tags": ["plastic", "irrigation"],
        "param_schema": {
            "body_d": {"type": "number", "default": 15.0, "unit": "mm"},
            "barb_d": {"type": "number", "default": 6.0, "unit": "mm"},
        },
    },
    "vertical_tower_section": {
        "function": vertical_tower_section,
        "name": "Vertical Grow Tower Section",
        "category": "hydroponics",
        "default_colour": "#F5F5F5",
        "visual_tags": ["plastic", "structural", "hydroponics"],
        "param_schema": {
            "od": {"type": "number", "default": 160.0, "unit": "mm"},
            "height": {"type": "number", "default": 200.0, "unit": "mm"},
            "pocket_count": {"type": "integer", "default": 4},
            "pocket_d": {"type": "number", "default": 50.0, "unit": "mm"},
        },
    },
}
