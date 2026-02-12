"""
ForgeOS Component Geometry Library — Tier 2: Electromechanical
==============================================================
Motors, PCBs, switches, fans, pumps — the powered components
that appear in most electronic/mechanical products.
"""

import cadquery as cq
import math


def brushless_motor_outrunner(params):
    """
    Brushless DC outrunner motor (e.g. drone motor, gimbal motor).
    Recognisable: wide bell housing with magnets, stator windings visible,
    mounting flange with bolt circle, protruding shaft.
    
    params:
        od:          Stator outer diameter
        height:      Total motor height (base to bell top)
        shaft_d:     Shaft diameter
        shaft_h:     Shaft protrusion above bell
        bolt_pcd:    Bolt circle diameter
        bolt_count:  Number of mounting bolts (typically 4)
        bolt_size:   Bolt diameter (e.g. 3.0 for M3)
        bell_extend: Bell extends past stator (outrunner style)
    """
    od = params.get("od", 28.0)
    h = params.get("height", 14.0)
    shaft_d = params.get("shaft_d", 5.0)
    shaft_h = params.get("shaft_h", 8.0)
    bolt_pcd = params.get("bolt_pcd", 19.0)
    bolt_count = params.get("bolt_count", 4)
    bolt_size = params.get("bolt_size", 3.0)
    bell_ext = params.get("bell_extend", 2.0)

    # Mount flange (base plate with bolt holes)
    flange_h = 2.0
    flange = (
        cq.Workplane("XY")
        .circle(od / 2.0 + 1)
        .extrude(flange_h)
    )
    # Bolt holes
    for i in range(bolt_count):
        angle = 2 * math.pi * i / bolt_count + math.pi / bolt_count
        bx = bolt_pcd / 2.0 * math.cos(angle)
        by = bolt_pcd / 2.0 * math.sin(angle)
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(bx, by, 0))
            .circle(bolt_size / 2.0)
            .extrude(flange_h + 1)
        )
        flange = flange.cut(hole)

    # Stator core (inner cylinder with winding slots)
    stator_od = od - bell_ext * 2 - 1
    stator_h = h - flange_h - 2
    stator = (
        cq.Workplane("XY")
        .workplane(offset=flange_h)
        .circle(stator_od / 2.0)
        .extrude(stator_h)
    )
    # Stator bore
    stator_bore = (
        cq.Workplane("XY")
        .workplane(offset=flange_h - 0.1)
        .circle(shaft_d / 2.0 + 2)
        .extrude(stator_h + 0.2)
    )
    stator = stator.cut(stator_bore)

    # Winding slots (cut notches around stator to show teeth)
    slot_count = 12
    for i in range(slot_count):
        angle = 2 * math.pi * i / slot_count
        sx = (stator_od / 2.0 - 1.5) * math.cos(angle)
        sy = (stator_od / 2.0 - 1.5) * math.sin(angle)
        slot = (
            cq.Workplane("XY")
            .workplane(offset=flange_h + 0.5)
            .transformed(offset=(sx, sy, 0))
            .circle(1.0)
            .extrude(stator_h - 1)
        )
        stator = stator.cut(slot)

    # Bell housing (outrunner — larger cylinder over stator)
    bell_od = od + bell_ext
    bell_h = stator_h + 1
    bell = (
        cq.Workplane("XY")
        .workplane(offset=h - bell_h)
        .circle(bell_od / 2.0)
        .extrude(bell_h)
    )
    bell_inner = (
        cq.Workplane("XY")
        .workplane(offset=h - bell_h - 0.1)
        .circle(bell_od / 2.0 - 1.5)
        .extrude(bell_h - 1)
    )
    bell = bell.cut(bell_inner)

    # Top cap of bell
    bell_cap = (
        cq.Workplane("XY")
        .workplane(offset=h - 1.5)
        .circle(bell_od / 2.0)
        .circle(shaft_d / 2.0 + 1)
        .extrude(1.5)
    )
    bell = bell.union(bell_cap)

    # Ventilation holes in bell (3-4 around circumference)
    vent_count = 4
    for i in range(vent_count):
        angle = 2 * math.pi * i / vent_count
        vx = (bell_od / 2.0 - 0.5) * math.cos(angle)
        vy = (bell_od / 2.0 - 0.5) * math.sin(angle)
        vent = (
            cq.Workplane("XY")
            .workplane(offset=h - bell_h + 2)
            .transformed(offset=(vx, vy, 0))
            .circle(2.0)
            .extrude(bell_h - 5)
        )
        bell = bell.cut(vent)

    # Shaft
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=h)
        .circle(shaft_d / 2.0)
        .extrude(shaft_h)
    )

    # Bearing boss (visible at top center)
    bearing_boss = (
        cq.Workplane("XY")
        .workplane(offset=h)
        .circle(shaft_d / 2.0 + 2)
        .circle(shaft_d / 2.0 + 0.5)
        .extrude(1.5)
    )

    motor = flange.union(stator).union(bell).union(bell_cap).union(shaft).union(bearing_boss)
    return motor


def brushless_motor_pancake(params):
    """
    Pancake / gimbal brushless motor — flat, wide, low-profile.
    Used in camera gimbals, direct-drive turntables.
    
    params:
        od:      Outer diameter
        height:  Total height
        bore_d:  Center bore diameter (for hollow shaft)
        bolt_pcd: Mounting bolt circle
    """
    od = params.get("od", 35.0)
    h = params.get("height", 8.0)
    bore = params.get("bore_d", 14.0)
    bolt_pcd = params.get("bolt_pcd", 25.0)

    # Stator (inner ring)
    stator = (
        cq.Workplane("XY")
        .circle(od / 2.0 - 3)
        .circle(bore / 2.0 + 2)
        .extrude(h - 2)
    )

    # Rotor ring (outer ring, thinner)
    rotor = (
        cq.Workplane("XY")
        .workplane(offset=1)
        .circle(od / 2.0)
        .circle(od / 2.0 - 2.5)
        .extrude(h - 2)
    )

    # Base plate
    base = (
        cq.Workplane("XY")
        .circle(od / 2.0 - 1)
        .circle(bore / 2.0)
        .extrude(1)
    )

    motor = stator.union(rotor).union(base)

    # Bolt holes
    for i in range(3):
        angle = 2 * math.pi * i / 3
        bx = bolt_pcd / 2.0 * math.cos(angle)
        by = bolt_pcd / 2.0 * math.sin(angle)
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(bx, by, 0))
            .circle(1.5)
            .extrude(h + 1)
        )
        motor = motor.cut(hole)

    return motor


def stepper_motor_nema(params):
    """
    NEMA stepper motor (NEMA 17, NEMA 23, etc).
    Recognisable: square faceplate, round body, shaft with flat.
    
    params:
        nema_size:  NEMA size (17, 23, 34)
        body_l:     Body length (depth)
        shaft_d:    Shaft diameter
        shaft_l:    Shaft length
    """
    nema = params.get("nema_size", 17)
    
    # NEMA standard dimensions
    nema_dims = {
        17: {"face": 42.3, "bolt_spacing": 31.0, "pilot_d": 22.0, "shaft_d": 5.0},
        23: {"face": 57.2, "bolt_spacing": 47.1, "pilot_d": 38.1, "shaft_d": 6.35},
        34: {"face": 86.0, "bolt_spacing": 69.6, "pilot_d": 73.0, "shaft_d": 12.7},
    }
    dims = nema_dims.get(nema, nema_dims[17])
    
    face = dims["face"]
    bolt_sp = dims["bolt_spacing"]
    pilot_d = dims["pilot_d"]
    shaft_d = params.get("shaft_d", dims["shaft_d"])
    body_l = params.get("body_l", face)
    shaft_l = params.get("shaft_l", 24.0)

    # Square faceplate
    faceplate = (
        cq.Workplane("XY")
        .sketch()
        .rect(face, face)
        .vertices().fillet(3)
        .finalize()
        .extrude(5)
    )

    # Round body
    body = (
        cq.Workplane("XY")
        .workplane(offset=-body_l + 5)
        .circle(face / 2.0 - 1)
        .extrude(body_l - 5)
    )

    # Pilot boss (centering ring on face)
    pilot = (
        cq.Workplane("XY")
        .workplane(offset=5)
        .circle(pilot_d / 2.0)
        .extrude(2)
    )

    # Shaft (with D-flat)
    shaft = (
        cq.Workplane("XY")
        .workplane(offset=5)
        .circle(shaft_d / 2.0)
        .extrude(shaft_l)
    )
    # D-flat cut
    flat_cut = (
        cq.Workplane("XY")
        .workplane(offset=7)
        .transformed(offset=(shaft_d / 2.0, 0, 0))
        .box(shaft_d * 0.3, shaft_d + 1, shaft_l - 2)
    )
    shaft = shaft.cut(flat_cut)

    # Mounting holes (4 corners)
    motor = faceplate.union(body).union(pilot).union(shaft)
    half_sp = bolt_sp / 2.0
    for x, y in [(-half_sp, -half_sp), (-half_sp, half_sp), (half_sp, -half_sp), (half_sp, half_sp)]:
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-1)
            .transformed(offset=(x, y, 0))
            .circle(1.5)
            .extrude(7)
        )
        motor = motor.cut(hole)

    # Rear cap detail
    rear_cap = (
        cq.Workplane("XY")
        .workplane(offset=-body_l + 5)
        .sketch()
        .rect(face - 4, face - 4)
        .vertices().fillet(2)
        .finalize()
        .extrude(-2)
    )
    motor = motor.union(rear_cap)

    # Connector (rear)
    conn = (
        cq.Workplane("XY")
        .workplane(offset=-body_l + 3)
        .transformed(offset=(0, face / 2.0 - 8, 0))
        .box(8, 6, 5)
    )
    motor = motor.union(conn)

    return motor


def pcb_board(params):
    """
    Printed circuit board with mounting holes and component keep-outs.
    Recognisable: green (or black) FR4 board, copper traces, mounting holes.
    
    params:
        width:     Board width
        height:    Board height
        thickness: Board thickness (standard 1.6mm)
        corner_r:  Corner radius
        holes:     List of {"x": n, "y": n, "d": n} mounting holes
        components: List of {"x": n, "y": n, "w": n, "d": n, "h": n} placed ICs
    """
    w = params.get("width", 36.0)
    h = params.get("height", 36.0)
    t = params.get("thickness", 1.6)
    cr = params.get("corner_r", 2.0)

    # FR4 board
    board = (
        cq.Workplane("XY")
        .sketch()
        .rect(w, h)
        .vertices().fillet(cr)
        .finalize()
        .extrude(t)
    )

    # Mounting holes
    holes = params.get("holes", [
        {"x": -(w/2 - 3), "y": -(h/2 - 3), "d": 2.2},
        {"x": -(w/2 - 3), "y": (h/2 - 3), "d": 2.2},
        {"x": (w/2 - 3), "y": -(h/2 - 3), "d": 2.2},
        {"x": (w/2 - 3), "y": (h/2 - 3), "d": 2.2},
    ])
    for hole in holes:
        h_cut = (
            cq.Workplane("XY")
            .workplane(offset=-0.1)
            .transformed(offset=(hole["x"], hole["y"], 0))
            .circle(hole["d"] / 2.0)
            .extrude(t + 0.2)
        )
        board = board.cut(h_cut)

    # Component representations (ICs, caps, etc.)
    components = params.get("components", [])
    for comp in components:
        chip = (
            cq.Workplane("XY")
            .workplane(offset=t)
            .transformed(offset=(comp["x"], comp["y"], 0))
            .box(comp.get("w", 5), comp.get("d", 5), comp.get("h", 2))
        )
        board = board.union(chip)

    return board


def tactile_switch(params):
    """
    Through-hole tactile push button switch (6×6mm standard).
    Recognisable: square base, round button cap, 4 legs.
    
    params:
        base_w:    Base width (6mm standard)
        base_h:    Base height
        button_d:  Button cap diameter
        button_h:  Button protrusion
        pin_l:     Pin length below base
    """
    bw = params.get("base_w", 6.0)
    bh = params.get("base_h", 3.5)
    bd = params.get("button_d", 3.5)
    btn_h = params.get("button_h", 2.5)
    pin_l = params.get("pin_l", 3.5)

    # Body
    body = (
        cq.Workplane("XY")
        .sketch()
        .rect(bw, bw)
        .vertices().fillet(0.5)
        .finalize()
        .extrude(bh)
    )

    # Button cap
    cap = (
        cq.Workplane("XY")
        .workplane(offset=bh)
        .circle(bd / 2.0)
        .extrude(btn_h)
    )

    switch = body.union(cap)

    # 4 pins
    pin_inset = bw / 2.0 - 0.8
    for x, y in [(-pin_inset, -pin_inset), (-pin_inset, pin_inset),
                 (pin_inset, -pin_inset), (pin_inset, pin_inset)]:
        pin = (
            cq.Workplane("XY")
            .workplane(offset=-pin_l)
            .transformed(offset=(x, y, 0))
            .box(0.5, 0.5, pin_l)
        )
        switch = switch.union(pin)

    return switch


def axial_fan(params):
    """
    Axial cooling fan (e.g. 40mm, 80mm, 120mm).
    Recognisable: square frame with round opening, fan blades visible, mounting holes.
    
    params:
        size:       Frame size (e.g. 40, 80, 120mm)
        depth:      Fan depth
        blade_count: Number of fan blades
        hole_d:     Mounting hole diameter
    """
    size = params.get("size", 40.0)
    depth = params.get("depth", 10.0)
    blades = params.get("blade_count", 7)
    hole_d = params.get("hole_d", 3.5)

    # Frame — square with round bore
    frame = (
        cq.Workplane("XY")
        .sketch()
        .rect(size, size)
        .vertices().fillet(3)
        .finalize()
        .extrude(depth)
    )
    bore = (
        cq.Workplane("XY")
        .workplane(offset=-0.1)
        .circle(size / 2.0 - 2)
        .extrude(depth + 0.2)
    )
    frame = frame.cut(bore)

    # Hub (center)
    hub_d = size * 0.25
    hub = (
        cq.Workplane("XY")
        .workplane(offset=1)
        .circle(hub_d / 2.0)
        .extrude(depth - 2)
    )

    # Fan blades (simplified — rectangular paddles from hub to frame)
    blade_r = size / 2.0 - 3
    blade_w = size * 0.08
    fan_blades = None
    for i in range(blades):
        angle = 360.0 * i / blades
        blade = (
            cq.Workplane("XY")
            .workplane(offset=depth / 2.0 - 0.5)
            .transformed(offset=(hub_d / 2.0 + (blade_r - hub_d / 2.0) / 2.0, 0, 0))
            .transformed(rotate=(0, 0, angle))
            .sketch()
            .rect(blade_r - hub_d / 2.0, blade_w)
            .vertices().fillet(min(blade_w / 2 - 0.3, 1.0))
            .finalize()
            .extrude(1.0)
        )
        if fan_blades is None:
            fan_blades = blade
        else:
            fan_blades = fan_blades.union(blade)

    fan = frame.union(hub)
    if fan_blades is not None:
        fan = fan.union(fan_blades)

    # Mounting holes (4 corners)
    hole_inset = size / 2.0 - 3.5
    for x, y in [(-hole_inset, -hole_inset), (-hole_inset, hole_inset),
                 (hole_inset, -hole_inset), (hole_inset, hole_inset)]:
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(x, y, 0))
            .circle(hole_d / 2.0)
            .extrude(depth + 1)
        )
        fan = fan.cut(hole)

    return fan


def centrifugal_pump(params):
    """
    Small centrifugal pump (inline or base-mount).
    Recognisable: volute casing, suction/discharge nozzles, motor housing.
    
    params:
        volute_od:    Volute outer diameter
        volute_h:     Volute height
        suction_d:    Suction port diameter
        discharge_d:  Discharge port diameter
        motor_od:     Motor housing diameter
        motor_l:      Motor housing length
    """
    v_od = params.get("volute_od", 60.0)
    v_h = params.get("volute_h", 30.0)
    s_d = params.get("suction_d", 20.0)
    d_d = params.get("discharge_d", 15.0)
    m_od = params.get("motor_od", 45.0)
    m_l = params.get("motor_l", 80.0)

    # Volute casing (snail shell approximation — offset cylinder)
    volute = (
        cq.Workplane("XY")
        .circle(v_od / 2.0)
        .extrude(v_h)
    )
    volute_inner = (
        cq.Workplane("XY")
        .workplane(offset=3)
        .circle(v_od / 2.0 - 4)
        .extrude(v_h - 6)
    )
    volute = volute.cut(volute_inner)

    # Suction nozzle (axial — pointing up from center)
    suction = (
        cq.Workplane("XY")
        .workplane(offset=v_h)
        .circle(s_d / 2.0)
        .extrude(s_d)
    )
    suction_bore = (
        cq.Workplane("XY")
        .workplane(offset=v_h - 1)
        .circle(s_d / 2.0 - 2)
        .extrude(s_d + 2)
    )
    suction = suction.cut(suction_bore)

    # Discharge nozzle (tangential — pointing out from side)
    discharge = (
        cq.Workplane("XY")
        .workplane(offset=v_h / 2.0 - d_d / 2.0)
        .transformed(offset=(v_od / 2.0 + d_d / 2.0, 0, 0))
        .circle(d_d / 2.0)
        .extrude(d_d)
    )
    discharge_bore = (
        cq.Workplane("XY")
        .workplane(offset=v_h / 2.0 - d_d / 2.0 + 2)
        .transformed(offset=(v_od / 2.0 + d_d / 2.0, 0, 0))
        .circle(d_d / 2.0 - 2)
        .extrude(d_d + 2)
    )
    discharge = discharge.cut(discharge_bore)

    # Motor housing (cylindrical, below volute)
    motor = (
        cq.Workplane("XY")
        .workplane(offset=-m_l)
        .circle(m_od / 2.0)
        .extrude(m_l)
    )

    # Motor mounting feet
    for y_off in [-(m_od / 2.0 + 5), m_od / 2.0 + 5]:
        foot = (
            cq.Workplane("XY")
            .workplane(offset=-m_l)
            .transformed(offset=(0, y_off, 0))
            .sketch()
            .rect(15, 10)
            .vertices().fillet(2)
            .finalize()
            .extrude(5)
        )
        # Bolt hole in foot
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-m_l - 0.5)
            .transformed(offset=(0, y_off, 0))
            .circle(3)
            .extrude(6)
        )
        foot = foot.cut(hole)
        motor = motor.union(foot)

    pump = volute.union(suction).union(discharge).union(motor)
    return pump


# ============================================================
# REGISTRY
# ============================================================

TIER2_REGISTRY = {
    "brushless_motor_outrunner": {
        "function": brushless_motor_outrunner,
        "name": "Brushless Motor (Outrunner)",
        "category": "motor",
        "default_colour": "#404040",
        "visual_tags": ["metal", "aluminium", "rotating", "electrical"],
        "param_schema": {
            "od": {"type": "number", "default": 28.0, "min": 12, "max": 80, "unit": "mm"},
            "height": {"type": "number", "default": 14.0, "min": 5, "max": 50, "unit": "mm"},
            "shaft_d": {"type": "number", "default": 5.0, "unit": "mm"},
            "shaft_h": {"type": "number", "default": 8.0, "unit": "mm"},
            "bolt_pcd": {"type": "number", "default": 19.0, "unit": "mm"},
            "bolt_count": {"type": "integer", "default": 4},
            "bolt_size": {"type": "number", "default": 3.0, "unit": "mm"},
        },
        "mounting_interfaces": [
            {"name": "base_bolts", "type": "bolt_circle", "position": "bottom"},
            {"name": "shaft_output", "type": "press_fit", "position": "top"},
        ],
    },
    "brushless_motor_pancake": {
        "function": brushless_motor_pancake,
        "name": "Brushless Motor (Pancake / Gimbal)",
        "category": "motor",
        "default_colour": "#303030",
        "visual_tags": ["metal", "rotating", "electrical"],
        "param_schema": {
            "od": {"type": "number", "default": 35.0, "unit": "mm"},
            "height": {"type": "number", "default": 8.0, "unit": "mm"},
            "bore_d": {"type": "number", "default": 14.0, "unit": "mm"},
            "bolt_pcd": {"type": "number", "default": 25.0, "unit": "mm"},
        },
    },
    "stepper_motor_nema": {
        "function": stepper_motor_nema,
        "name": "NEMA Stepper Motor",
        "category": "motor",
        "default_colour": "#1A1A1A",
        "visual_tags": ["metal", "rotating", "electrical"],
        "param_schema": {
            "nema_size": {"type": "integer", "default": 17, "enum": [17, 23, 34]},
            "body_l": {"type": "number", "default": 40.0, "unit": "mm"},
            "shaft_d": {"type": "number", "default": 5.0, "unit": "mm"},
            "shaft_l": {"type": "number", "default": 24.0, "unit": "mm"},
        },
        "mounting_interfaces": [
            {"name": "faceplate_bolts", "type": "bolt_grid", "position": "front"},
            {"name": "shaft_output", "type": "press_fit", "position": "front"},
        ],
    },
    "pcb_board": {
        "function": pcb_board,
        "name": "Printed Circuit Board",
        "category": "pcb",
        "default_colour": "#006400",
        "visual_tags": ["pcb", "electronic", "fr4"],
        "param_schema": {
            "width": {"type": "number", "default": 36.0, "unit": "mm"},
            "height": {"type": "number", "default": 36.0, "unit": "mm"},
            "thickness": {"type": "number", "default": 1.6, "unit": "mm"},
            "corner_r": {"type": "number", "default": 2.0, "unit": "mm"},
        },
    },
    "tactile_switch": {
        "function": tactile_switch,
        "name": "Tactile Push Button Switch",
        "category": "switch",
        "default_colour": "#2F2F2F",
        "visual_tags": ["plastic", "electrical"],
        "param_schema": {
            "base_w": {"type": "number", "default": 6.0, "unit": "mm"},
        },
    },
    "axial_fan": {
        "function": axial_fan,
        "name": "Axial Cooling Fan",
        "category": "fan",
        "default_colour": "#1A1A1A",
        "visual_tags": ["plastic", "rotating", "electrical"],
        "param_schema": {
            "size": {"type": "number", "default": 40.0, "enum": [25, 30, 40, 50, 60, 80, 92, 120, 140], "unit": "mm"},
            "depth": {"type": "number", "default": 10.0, "unit": "mm"},
            "blade_count": {"type": "integer", "default": 7},
        },
    },
    "centrifugal_pump": {
        "function": centrifugal_pump,
        "name": "Centrifugal Pump",
        "category": "pump",
        "default_colour": "#4682B4",
        "visual_tags": ["metal", "cast_iron", "rotating"],
        "param_schema": {
            "volute_od": {"type": "number", "default": 60.0, "unit": "mm"},
            "volute_h": {"type": "number", "default": 30.0, "unit": "mm"},
            "motor_od": {"type": "number", "default": 45.0, "unit": "mm"},
            "motor_l": {"type": "number", "default": 80.0, "unit": "mm"},
        },
    },
}
