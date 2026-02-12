"""
ForgeOS Component Geometry Library — Tier 2 Expansion
======================================================
Additional electromechanical: servos, gearmotors, solenoids,
relays, power supplies, displays, limit switches, heatsinks,
terminal blocks, LED indicators, buzzers, encoders, battery holders.
"""

import cadquery as cq
import math


def servo_motor(params):
    """Hobby RC servo motor with output horn and mounting ears."""
    body_l = params.get("body_l", 40.0)
    body_w = params.get("body_w", 20.0)
    body_h = params.get("body_h", 36.0)
    horn_l = params.get("horn_length", 18.0)

    # Main body
    body = (cq.Workplane("XY")
            .sketch().rect(body_l, body_w).vertices().fillet(1.5).finalize()
            .extrude(body_h))
    # Mounting ears (flanges at ~2/3 height)
    ear_z = body_h * 0.65
    ears = (cq.Workplane("XY").workplane(offset=ear_z)
            .sketch().rect(body_l + 14, body_w).vertices().fillet(1).finalize()
            .extrude(2.5))
    # Ear mounting holes
    for x in [-(body_l/2 + 5), body_l/2 + 5]:
        h = (cq.Workplane("XY").workplane(offset=ear_z - 0.5)
             .transformed(offset=(x, 0, 0)).circle(2).extrude(3.5))
        ears = ears.cut(h)
    # Output shaft boss (top, offset to one side)
    boss = (cq.Workplane("XY").workplane(offset=body_h)
            .transformed(offset=(body_l/2 - 7, 0, 0))
            .circle(6).extrude(4))
    shaft = (cq.Workplane("XY").workplane(offset=body_h + 4)
             .transformed(offset=(body_l/2 - 7, 0, 0))
             .circle(2.5).extrude(3))
    # Horn (single arm)
    horn = (cq.Workplane("XY").workplane(offset=body_h + 7)
            .transformed(offset=(body_l/2 - 7, 0, 0))
            .sketch().rect(horn_l * 2, 5).vertices().fillet(2).finalize()
            .extrude(2))
    horn_hub = (cq.Workplane("XY").workplane(offset=body_h + 7)
                .transformed(offset=(body_l/2 - 7, 0, 0))
                .circle(4).extrude(2))
    # Wire (bottom)
    wire = (cq.Workplane("XY")
            .transformed(offset=(-(body_l/2 - 5), 0, body_h * 0.3))
            .box(3, 6, 3))
    return body.union(ears).union(boss).union(shaft).union(horn).union(horn_hub).union(wire)


def dc_gearmotor(params):
    """Small DC geared motor (N20 / GA12 style)."""
    motor_d = params.get("motor_d", 12.0)
    motor_l = params.get("motor_l", 15.0)
    gearbox_w = params.get("gearbox_w", 10.0)
    gearbox_l = params.get("gearbox_l", 10.0)
    shaft_d = params.get("shaft_d", 3.0)
    shaft_l = params.get("shaft_l", 10.0)

    # Motor can (cylindrical)
    motor = cq.Workplane("XY").circle(motor_d/2).extrude(motor_l)
    # Rear cap (with terminals)
    rear_cap = (cq.Workplane("XY").workplane(offset=-2)
                .circle(motor_d/2 - 0.5).extrude(2))
    # Terminal pins
    for y in [-2, 2]:
        pin = (cq.Workplane("XY").workplane(offset=-4)
               .transformed(offset=(0, y, 0))
               .box(0.5, 0.5, 2))
        rear_cap = rear_cap.union(pin)
    # Gearbox (rectangular, on front)
    gearbox = (cq.Workplane("XY").workplane(offset=motor_l)
               .sketch().rect(gearbox_w, gearbox_l).vertices().fillet(1).finalize()
               .extrude(gearbox_l))
    # Output shaft (with D-flat)
    output = (cq.Workplane("XY").workplane(offset=motor_l + gearbox_l)
              .circle(shaft_d/2).extrude(shaft_l))
    # D-flat
    flat = (cq.Workplane("XY").workplane(offset=motor_l + gearbox_l - 0.5)
            .transformed(offset=(0, shaft_d/2, 0))
            .box(shaft_d, 1, shaft_l + 1))
    return motor.union(rear_cap).union(gearbox).union(output).cut(flat)


def solenoid_linear(params):
    """Linear push/pull solenoid."""
    body_d = params.get("body_d", 15.0)
    body_l = params.get("body_l", 20.0)
    plunger_d = params.get("plunger_d", 5.0)
    plunger_l = params.get("plunger_l", 8.0)

    # Coil body (cylindrical)
    body = cq.Workplane("XY").circle(body_d/2).extrude(body_l)
    # Mounting ears
    for y in [-(body_d/2 + 2), body_d/2 + 2]:
        ear = (cq.Workplane("XY")
               .transformed(offset=(0, y, body_l/2))
               .box(12, 4, body_l * 0.6))
        hole = (cq.Workplane("XY").workplane(offset=-0.5)
                .transformed(offset=(0, y, 0)).circle(1.5).extrude(body_l + 1))
        body = body.union(ear).cut(hole)
    # Plunger
    plunger = (cq.Workplane("XY").workplane(offset=body_l)
               .circle(plunger_d/2).extrude(plunger_l))
    # Terminal wires
    for x in [-3, 3]:
        wire = (cq.Workplane("XY").workplane(offset=-3)
                .transformed(offset=(x, 0, 0)).box(0.8, 0.8, 3))
        body = body.union(wire)
    return body.union(plunger)


def relay_module(params):
    """Electromechanical relay (sugar cube style)."""
    body_l = params.get("body_l", 19.0)
    body_w = params.get("body_w", 15.0)
    body_h = params.get("body_h", 15.0)

    body = (cq.Workplane("XY")
            .sketch().rect(body_l, body_w).vertices().fillet(1).finalize()
            .extrude(body_h))
    # Pins (2 rows of 4)
    for ix in range(4):
        for iy in range(2):
            px = -(body_l/2 - 3) + ix * (body_l - 6) / 3
            py = -(body_w/2 - 3) + iy * (body_w - 6)
            pin = (cq.Workplane("XY").workplane(offset=-3)
                   .transformed(offset=(px, py, 0)).box(0.6, 0.6, 3))
            body = body.union(pin)
    # Indicator window (top)
    window = (cq.Workplane("XY").workplane(offset=body_h - 0.5)
              .sketch().rect(5, 3).finalize().extrude(1))
    body = body.cut(window)
    return body


def voltage_regulator_module(params):
    """DC-DC buck/boost converter module (LM2596 style)."""
    pcb_l = params.get("pcb_l", 43.0)
    pcb_w = params.get("pcb_w", 21.0)
    pcb_t = 1.6

    pcb = (cq.Workplane("XY")
           .sketch().rect(pcb_l, pcb_w).vertices().fillet(1.5).finalize()
           .extrude(pcb_t))
    # Inductor (toroidal, large component)
    inductor = (cq.Workplane("XY").workplane(offset=pcb_t)
                .transformed(offset=(-8, 0, 0))
                .circle(6).extrude(5))
    # Electrolytic caps (2)
    for x in [8, 16]:
        cap = (cq.Workplane("XY").workplane(offset=pcb_t)
               .transformed(offset=(x, 0, 0))
               .circle(4).extrude(8))
        pcb = pcb.union(cap)
    # IC
    ic = (cq.Workplane("XY").workplane(offset=pcb_t)
          .transformed(offset=(0, -5, 0)).box(8, 5, 3))
    # Screw terminals (in/out)
    for x in [-(pcb_l/2 - 5), pcb_l/2 - 5]:
        term = (cq.Workplane("XY").workplane(offset=pcb_t)
                .transformed(offset=(x, 0, 0)).box(8, 7, 8))
        pcb = pcb.union(term)
    # Adjustment pot
    pot = (cq.Workplane("XY").workplane(offset=pcb_t)
           .transformed(offset=(-2, 6, 0)).circle(2).extrude(3))
    return pcb.union(inductor).union(ic).union(pot)


def oled_display(params):
    """Small OLED/LCD display module (0.96" or 1.3")."""
    pcb_w = params.get("pcb_w", 27.0)
    pcb_h = params.get("pcb_h", 28.0)
    display_w = params.get("display_w", 22.0)
    display_h = params.get("display_h", 11.0)

    pcb = (cq.Workplane("XY")
           .sketch().rect(pcb_w, pcb_h).vertices().fillet(1).finalize()
           .extrude(1.6))
    # Display glass
    display = (cq.Workplane("XY").workplane(offset=1.6)
               .transformed(offset=(0, (pcb_h - display_h)/2 - 3, 0))
               .sketch().rect(display_w, display_h).finalize()
               .extrude(1.5))
    # FPC connector
    fpc = (cq.Workplane("XY").workplane(offset=1.6)
           .transformed(offset=(0, -(pcb_h/2 - 4), 0))
           .box(pcb_w - 4, 3, 1))
    # Header pins (I2C: 4 pins)
    for i in range(4):
        pin = (cq.Workplane("XY").workplane(offset=-6)
               .transformed(offset=(-(3 * 2.54/2) + i * 2.54, -(pcb_h/2 - 2), 0))
               .box(0.6, 0.6, 6))
        pcb = pcb.union(pin)
    return pcb.union(display).union(fpc)


def limit_switch(params):
    """Microswitch / limit switch with lever actuator."""
    body_l = params.get("body_l", 20.0)
    body_w = params.get("body_w", 10.0)
    body_h = params.get("body_h", 6.0)
    lever_l = params.get("lever_length", 25.0)

    body = (cq.Workplane("XY")
            .sketch().rect(body_l, body_w).vertices().fillet(0.5).finalize()
            .extrude(body_h))
    # Plunger button
    button = (cq.Workplane("XY").workplane(offset=body_h)
              .transformed(offset=(body_l/2 - 3, 0, 0))
              .circle(1.5).extrude(1.5))
    # Lever arm
    lever = (cq.Workplane("XY").workplane(offset=body_h + 1)
             .transformed(offset=(body_l/2 - 3 + lever_l/2, 0, 0))
             .sketch().rect(lever_l, 3).vertices().fillet(1).finalize()
             .extrude(0.5))
    # Roller at end
    roller = (cq.Workplane("XY").workplane(offset=body_h)
              .transformed(offset=(body_l/2 - 3 + lever_l, 0, 0))
              .circle(2).extrude(3))
    # Solder terminals (3: COM, NO, NC)
    for i in range(3):
        pin = (cq.Workplane("XY").workplane(offset=-4)
               .transformed(offset=(-(body_l/2 - 4) + i * 5, 0, 0))
               .box(0.5, 3, 4))
        body = body.union(pin)
    # Mounting holes
    for x in [-(body_l/2 - 3), body_l/2 - 3]:
        h = (cq.Workplane("XY").workplane(offset=-0.5)
             .transformed(offset=(x, 0, 0)).circle(1.2).extrude(body_h + 1))
        body = body.cut(h)
    return body.union(button).union(lever).union(roller)


def heatsink_extruded(params):
    """Extruded aluminium fin heatsink."""
    length = params.get("length", 40.0)
    width = params.get("width", 40.0)
    base_h = params.get("base_height", 3.0)
    fin_h = params.get("fin_height", 15.0)
    fin_count = params.get("fin_count", 10)
    fin_t = params.get("fin_thickness", 1.0)

    base = (cq.Workplane("XY")
            .sketch().rect(length, width).finalize()
            .extrude(base_h))
    fin_spacing = width / (fin_count + 1)
    for i in range(fin_count):
        fy = -(width/2) + (i + 1) * fin_spacing
        fin = (cq.Workplane("XY").workplane(offset=base_h)
               .transformed(offset=(0, fy, 0))
               .sketch().rect(length, fin_t).finalize()
               .extrude(fin_h))
        base = base.union(fin)
    # Mounting holes
    for x, y in [(-length/2 + 5, 0), (length/2 - 5, 0)]:
        h = (cq.Workplane("XY").workplane(offset=-0.5)
             .transformed(offset=(x, y, 0)).circle(1.6).extrude(base_h + 1))
        base = base.cut(h)
    return base


def terminal_block(params):
    """Screw terminal block / barrier strip."""
    positions = params.get("positions", 4)
    pitch = params.get("pitch", 5.08)
    body_h = params.get("body_h", 10.0)

    body_l = positions * pitch
    body_w = 8.0
    body = (cq.Workplane("XY")
            .sketch().rect(body_l, body_w).finalize()
            .extrude(body_h))
    # Screw heads (top)
    for i in range(positions):
        sx = -(body_l/2) + (i + 0.5) * pitch
        screw = (cq.Workplane("XY").workplane(offset=body_h)
                 .transformed(offset=(sx, 0, 0))
                 .circle(2).extrude(1))
        slot = (cq.Workplane("XY").workplane(offset=body_h + 0.5)
                .transformed(offset=(sx, 0, 0))
                .sketch().rect(3, 0.5).finalize().extrude(1))
        body = body.union(screw).cut(slot)
    # Wire entry holes (front)
    for i in range(positions):
        sx = -(body_l/2) + (i + 0.5) * pitch
        hole = (cq.Workplane("XY").workplane(offset=body_h * 0.4)
                .transformed(offset=(sx, body_w/2, 0))
                .transformed(rotate=(90, 0, 0))
                .circle(1.3).extrude(body_w + 1))
        body = body.cut(hole)
    # PCB pins
    for i in range(positions):
        sx = -(body_l/2) + (i + 0.5) * pitch
        pin = (cq.Workplane("XY").workplane(offset=-3)
               .transformed(offset=(sx, 0, 0)).box(0.6, 0.6, 3))
        body = body.union(pin)
    return body


def led_indicator(params):
    """Panel-mount LED indicator (3mm or 5mm)."""
    led_d = params.get("led_d", 5.0)
    body_l = params.get("body_length", 8.0)

    # LED dome
    dome = cq.Workplane("XY").circle(led_d/2).extrude(body_l - led_d/3)
    # Rounded top
    top = (cq.Workplane("XY").workplane(offset=body_l - led_d/3)
           .circle(led_d/2).extrude(led_d/3))
    # Flange (base)
    flange = (cq.Workplane("XY").workplane(offset=-1)
              .circle(led_d/2 + 1).extrude(1))
    # Legs
    for x in [-0.8, 0.8]:
        leg = (cq.Workplane("XY").workplane(offset=-8)
               .transformed(offset=(x, 0, 0)).box(0.5, 0.5, 7))
        flange = flange.union(leg)
    return dome.union(top).union(flange)


def piezo_buzzer(params):
    """Piezo buzzer / sounder."""
    d = params.get("diameter", 12.0)
    h = params.get("height", 7.0)

    body = cq.Workplane("XY").circle(d/2).extrude(h)
    # Sound hole
    hole = (cq.Workplane("XY").workplane(offset=h - 0.5)
            .circle(d/4).extrude(1))
    body = body.cut(hole)
    # Pins
    for x in [-1.27, 1.27]:
        pin = (cq.Workplane("XY").workplane(offset=-4)
               .transformed(offset=(x, 0, 0)).box(0.5, 0.5, 4))
        body = body.union(pin)
    return body


def rotary_encoder(params):
    """Rotary encoder with push-button and knob."""
    body_d = params.get("body_d", 12.0)
    body_h = params.get("body_h", 7.0)
    shaft_d = params.get("shaft_d", 6.0)
    shaft_l = params.get("shaft_l", 15.0)

    body = cq.Workplane("XY").circle(body_d/2).extrude(body_h)
    # Locating tab
    tab = (cq.Workplane("XY")
           .transformed(offset=(0, body_d/2 + 1, body_h/2))
           .box(3, 2, body_h * 0.6))
    # Shaft (D-flat)
    shaft_cyl = (cq.Workplane("XY").workplane(offset=body_h)
                 .circle(shaft_d/2).extrude(shaft_l))
    flat = (cq.Workplane("XY").workplane(offset=body_h - 0.5)
            .transformed(offset=(0, shaft_d/2, 0))
            .box(shaft_d, 1, shaft_l + 1))
    shaft_cyl = shaft_cyl.cut(flat)
    # Mounting nut + washer area
    thread = (cq.Workplane("XY").workplane(offset=body_h)
              .circle(body_d/2 - 1).extrude(2))
    # 5 pins (A, B, C, SW1, SW2)
    for i in range(5):
        px = -(2 * 2.54) + i * 2.54
        pin = (cq.Workplane("XY").workplane(offset=-5)
               .transformed(offset=(px, 0, 0)).box(0.5, 0.5, 5))
        body = body.union(pin)
    return body.union(tab).union(shaft_cyl).union(thread)


def battery_holder_18650(params):
    """18650 battery holder clip (single or dual)."""
    cells = params.get("cells", 1)
    cell_d = 18.5  # slightly oversized for clearance
    cell_l = 65.5

    total_w = cells * (cell_d + 2) + 2
    body = (cq.Workplane("XY")
            .sketch().rect(cell_l + 4, total_w).vertices().fillet(2).finalize()
            .extrude(cell_d / 2 + 2))
    # Cell cradles
    for c in range(cells):
        cy = -(total_w/2) + (c + 0.5) * (cell_d + 2) + 1
        cradle = (cq.Workplane("XY").workplane(offset=2)
                  .transformed(offset=(0, cy, 0))
                  .sketch().rect(cell_l, cell_d).vertices().fillet(cell_d/2 - 0.5).finalize()
                  .extrude(cell_d))
        body = body.cut(cradle)
        # Spring contact (negative end)
        spring = (cq.Workplane("XY").workplane(offset=cell_d/2)
                  .transformed(offset=(-(cell_l/2 + 0.5), cy, 0))
                  .box(2, 4, 5))
        body = body.union(spring)
        # Flat contact (positive end)
        flat_c = (cq.Workplane("XY").workplane(offset=cell_d/2)
                  .transformed(offset=(cell_l/2 + 0.5, cy, 0))
                  .box(1, 4, 4))
        body = body.union(flat_c)
    # Wire terminals
    for x in [-(cell_l/2 + 1), cell_l/2 + 1]:
        wire = (cq.Workplane("XY").workplane(offset=-3)
                .transformed(offset=(x, 0, 0)).box(2, 3, 3))
        body = body.union(wire)
    return body


# ─── REGISTRY ─────────────────────────────────────────────

TIER2_EXPANSION = {
    "servo_motor": {
        "function": servo_motor, "name": "RC Servo Motor", "category": "actuator",
        "default_colour": "#2F4F4F", "visual_tags": ["plastic", "actuator"],
        "param_schema": {"body_l": {"type": "number", "default": 40.0, "unit": "mm"},
                         "body_w": {"type": "number", "default": 20.0, "unit": "mm"},
                         "horn_length": {"type": "number", "default": 18.0, "unit": "mm"}},
    },
    "dc_gearmotor": {
        "function": dc_gearmotor, "name": "DC Geared Motor (N20)", "category": "motor",
        "default_colour": "#C0C0C0", "visual_tags": ["metal", "motor"],
        "param_schema": {"motor_d": {"type": "number", "default": 12.0, "unit": "mm"},
                         "shaft_d": {"type": "number", "default": 3.0, "unit": "mm"}},
    },
    "solenoid_linear": {
        "function": solenoid_linear, "name": "Linear Solenoid", "category": "actuator",
        "default_colour": "#2F2F2F", "visual_tags": ["metal", "electromagnetic"],
        "param_schema": {"body_d": {"type": "number", "default": 15.0, "unit": "mm"},
                         "plunger_d": {"type": "number", "default": 5.0, "unit": "mm"}},
    },
    "relay_module": {
        "function": relay_module, "name": "Electromechanical Relay", "category": "switching",
        "default_colour": "#000080", "visual_tags": ["plastic", "electromagnetic"],
        "param_schema": {"body_l": {"type": "number", "default": 19.0, "unit": "mm"}},
    },
    "voltage_regulator_module": {
        "function": voltage_regulator_module, "name": "DC-DC Converter Module", "category": "power",
        "default_colour": "#006400", "visual_tags": ["pcb", "power"],
        "param_schema": {"pcb_l": {"type": "number", "default": 43.0, "unit": "mm"}},
    },
    "oled_display": {
        "function": oled_display, "name": "OLED Display Module", "category": "display",
        "default_colour": "#1A1A1A", "visual_tags": ["pcb", "display"],
        "param_schema": {"pcb_w": {"type": "number", "default": 27.0, "unit": "mm"},
                         "display_w": {"type": "number", "default": 22.0, "unit": "mm"}},
    },
    "limit_switch": {
        "function": limit_switch, "name": "Limit Switch / Microswitch", "category": "switch",
        "default_colour": "#1A1A1A", "visual_tags": ["plastic", "switch"],
        "param_schema": {"body_l": {"type": "number", "default": 20.0, "unit": "mm"},
                         "lever_length": {"type": "number", "default": 25.0, "unit": "mm"}},
    },
    "heatsink_extruded": {
        "function": heatsink_extruded, "name": "Extruded Fin Heatsink", "category": "thermal",
        "default_colour": "#1A1A1A", "visual_tags": ["aluminium", "thermal"],
        "param_schema": {"length": {"type": "number", "default": 40.0, "unit": "mm"},
                         "width": {"type": "number", "default": 40.0, "unit": "mm"},
                         "fin_count": {"type": "integer", "default": 10}},
    },
    "terminal_block": {
        "function": terminal_block, "name": "Screw Terminal Block", "category": "connector",
        "default_colour": "#006400", "visual_tags": ["plastic", "connector"],
        "param_schema": {"positions": {"type": "integer", "default": 4},
                         "pitch": {"type": "number", "default": 5.08, "unit": "mm"}},
    },
    "led_indicator": {
        "function": led_indicator, "name": "LED Indicator", "category": "indicator",
        "default_colour": "#FF0000", "visual_tags": ["led", "indicator"],
        "param_schema": {"led_d": {"type": "number", "default": 5.0, "unit": "mm", "enum": [3, 5, 8, 10]}},
    },
    "piezo_buzzer": {
        "function": piezo_buzzer, "name": "Piezo Buzzer", "category": "audio",
        "default_colour": "#1A1A1A", "visual_tags": ["plastic", "audio"],
        "param_schema": {"diameter": {"type": "number", "default": 12.0, "unit": "mm"}},
    },
    "rotary_encoder": {
        "function": rotary_encoder, "name": "Rotary Encoder", "category": "input",
        "default_colour": "#808080", "visual_tags": ["metal", "input"],
        "param_schema": {"body_d": {"type": "number", "default": 12.0, "unit": "mm"},
                         "shaft_d": {"type": "number", "default": 6.0, "unit": "mm"}},
    },
    "battery_holder_18650": {
        "function": battery_holder_18650, "name": "18650 Battery Holder", "category": "power",
        "default_colour": "#1A1A1A", "visual_tags": ["plastic", "power"],
        "param_schema": {"cells": {"type": "integer", "default": 1, "enum": [1, 2, 3, 4]}},
    },
}
