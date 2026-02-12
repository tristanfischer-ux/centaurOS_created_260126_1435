"""
ForgeOS Component Geometry Library — Tier 3: Drones
====================================================
Propellers with twist, FPV cameras, ESCs, GPS modules,
battery packs, antennas, VTX, receivers, frame plates.
"""

import cadquery as cq
import math


def propeller_airfoil(params):
    """
    Propeller with simplified airfoil twist — not flat paddles.
    Two blades with thickness taper and slight chord twist.
    
    params:
        diameter:    Propeller diameter
        pitch:       Pitch in inches (affects twist angle)
        blade_count: Number of blades (2 or 3)
        hub_d:       Hub diameter
        hub_h:       Hub height
        shaft_d:     Shaft bore diameter
    """
    dia = params.get("diameter", 127.0)  # 5 inch
    blade_count = params.get("blade_count", 2)
    hub_d = params.get("hub_d", 12.0)
    hub_h = params.get("hub_h", 8.0)
    shaft_d = params.get("shaft_d", 5.0)

    blade_l = dia / 2.0 - hub_d / 2.0
    max_chord = dia * 0.08  # Blade width ~8% of diameter

    # Hub
    hub = cq.Workplane("XY").circle(hub_d / 2.0).extrude(hub_h)
    bore = cq.Workplane("XY").workplane(offset=-0.5).circle(shaft_d / 2.0).extrude(hub_h + 1)
    hub = hub.cut(bore)

    # Self-tightening nut feature (hex recess on top)
    nut_recess = (
        cq.Workplane("XY")
        .workplane(offset=hub_h - 3)
        .polygon(6, shaft_d * 1.8)
        .extrude(3.5)
    )
    hub = hub.cut(nut_recess)

    # Blades — each blade built as tapered sections
    # Using multiple rectangular extrusions at different heights to approximate twist
    blades = None
    for b in range(blade_count):
        base_angle = 360.0 * b / blade_count
        blade = None
        
        # Build blade from 4 sections (root to tip)
        sections = 4
        for s in range(sections):
            frac = (s + 0.5) / sections  # 0.125, 0.375, 0.625, 0.875
            r = hub_d / 2.0 + frac * blade_l
            chord = max_chord * (1.0 - 0.3 * frac)  # Taper toward tip
            thickness = max(2.0 * (1.0 - 0.5 * frac), 0.8)  # Thin toward tip
            section_l = blade_l / sections
            
            angle_rad = math.radians(base_angle)
            cx = r * math.cos(angle_rad)
            cy = r * math.sin(angle_rad)
            
            section = (
                cq.Workplane("XY")
                .workplane(offset=hub_h / 2.0 - thickness / 2.0)
                .transformed(offset=(cx, cy, 0))
                .transformed(rotate=(0, 0, base_angle))
                .sketch()
                .rect(section_l, chord)
                .vertices().fillet(min(chord / 2 - 0.3, section_l / 2 - 0.3))
                .finalize()
                .extrude(thickness)
            )
            if blade is None:
                blade = section
            else:
                blade = blade.union(section)
        
        if blades is None:
            blades = blade
        else:
            blades = blades.union(blade)

    prop = hub
    if blades is not None:
        prop = prop.union(blades)
    return prop


def fpv_camera(params):
    """
    FPV / micro camera module.
    Recognisable: square PCB with round lens barrel, mounting tabs.
    
    params:
        size:      Camera size (e.g. 19 for micro, 28 for mini)
        lens_d:    Lens barrel diameter
        lens_l:    Lens protrusion
        pcb_t:     PCB thickness
    """
    size = params.get("size", 19.0)
    lens_d = params.get("lens_d", 14.0)
    lens_l = params.get("lens_l", 18.0)
    pcb_t = params.get("pcb_t", 1.6)

    # PCB (square)
    pcb = (
        cq.Workplane("XY")
        .sketch().rect(size, size).vertices().fillet(1).finalize()
        .extrude(pcb_t)
    )

    # Sensor chip (center of PCB, rear side)
    sensor = (
        cq.Workplane("XY")
        .workplane(offset=-2)
        .box(size * 0.5, size * 0.5, 2)
    )

    # Lens barrel (front)
    lens_body = (
        cq.Workplane("XY")
        .workplane(offset=pcb_t)
        .circle(lens_d / 2.0)
        .extrude(lens_l)
    )
    # Lens glass (front element)
    lens_glass = (
        cq.Workplane("XY")
        .workplane(offset=pcb_t + lens_l)
        .circle(lens_d / 2.0 - 1)
        .extrude(1)
    )
    # Focus ring
    focus_ring = (
        cq.Workplane("XY")
        .workplane(offset=pcb_t + lens_l * 0.4)
        .circle(lens_d / 2.0 + 1)
        .circle(lens_d / 2.0)
        .extrude(5)
    )

    # Mounting holes (2 side tabs)
    cam = pcb.union(sensor).union(lens_body).union(lens_glass).union(focus_ring)
    for y_off in [-(size / 2.0 + 2), size / 2.0 + 2]:
        tab = (
            cq.Workplane("XY")
            .transformed(offset=(0, y_off, 0))
            .sketch().rect(6, 4).vertices().fillet(1).finalize()
            .extrude(pcb_t)
        )
        hole = (
            cq.Workplane("XY")
            .workplane(offset=-0.5)
            .transformed(offset=(0, y_off, 0))
            .circle(1)
            .extrude(pcb_t + 1)
        )
        cam = cam.union(tab).cut(hole)

    return cam


def esc_board(params):
    """
    Electronic Speed Controller PCB.
    Small square board with FETs, capacitor, and signal/power pads.
    
    params:
        width:     Board width
        height:    Board height  
        thickness: PCB thickness
        mounting_pattern: Bolt hole spacing
    """
    w = params.get("width", 27.0)
    h = params.get("height", 27.0)
    t = params.get("thickness", 1.6)
    mp = params.get("mounting_pattern", 20.0)

    # PCB
    pcb = (
        cq.Workplane("XY")
        .sketch().rect(w, h).vertices().fillet(1.5).finalize()
        .extrude(t)
    )

    # Mounting holes (4-corner 20×20 pattern)
    half_mp = mp / 2.0
    for x, y in [(-half_mp, -half_mp), (-half_mp, half_mp), (half_mp, -half_mp), (half_mp, half_mp)]:
        hole = cq.Workplane("XY").workplane(offset=-0.5).transformed(offset=(x, y, 0)).circle(1.1).extrude(t + 1)
        pcb = pcb.cut(hole)

    # FET packages (3 large ones for 3-phase)
    for x_off in [-6, 0, 6]:
        fet = (
            cq.Workplane("XY")
            .workplane(offset=t)
            .transformed(offset=(x_off, -4, 0))
            .box(5, 6, 2)
        )
        pcb = pcb.union(fet)

    # Bulk capacitor
    cap = (
        cq.Workplane("XY")
        .workplane(offset=t)
        .transformed(offset=(0, 6, 0))
        .circle(4)
        .extrude(8)
    )
    pcb = pcb.union(cap)

    # Signal connector pad area
    conn = (
        cq.Workplane("XY")
        .workplane(offset=t)
        .transformed(offset=(w / 2 - 3, 0, 0))
        .box(4, 10, 1)
    )
    pcb = pcb.union(conn)

    return pcb


def gps_module(params):
    """
    GPS/GNSS module with ceramic patch antenna.
    Recognisable: square PCB with prominent white ceramic patch on top.
    
    params:
        pcb_w:     PCB width
        pcb_h:     PCB height
        patch_w:   Patch antenna width
        patch_h:   Patch antenna height (thickness)
    """
    pw = params.get("pcb_w", 25.0)
    ph = params.get("pcb_h", 25.0)
    aw = params.get("patch_w", 18.0)
    ah = params.get("patch_h", 5.0)

    # PCB
    pcb = (
        cq.Workplane("XY")
        .sketch().rect(pw, ph).vertices().fillet(1.5).finalize()
        .extrude(1.6)
    )

    # Ceramic patch antenna (centered on top)
    patch = (
        cq.Workplane("XY")
        .workplane(offset=1.6)
        .sketch().rect(aw, aw).finalize()
        .extrude(ah)
    )

    # Connector (bottom edge, JST or solder pads)
    conn = (
        cq.Workplane("XY")
        .workplane(offset=-3)
        .transformed(offset=(0, -(ph / 2 - 3), 0))
        .box(8, 5, 3)
    )

    # Mounting holes
    gps = pcb.union(patch).union(conn)
    for x, y in [(-pw / 2 + 2.5, -ph / 2 + 2.5), (pw / 2 - 2.5, -ph / 2 + 2.5),
                 (-pw / 2 + 2.5, ph / 2 - 2.5), (pw / 2 - 2.5, ph / 2 - 2.5)]:
        hole = cq.Workplane("XY").workplane(offset=-0.5).transformed(offset=(x, y, 0)).circle(1.1).extrude(2.7)
        gps = gps.cut(hole)

    return gps


def lipo_battery_pack(params):
    """
    LiPo pouch-cell battery pack (e.g. 4S 1500mAh).
    Recognisable: flat rectangular pack with label, balance lead, XT60 connector.
    
    params:
        length:  Pack length
        width:   Pack width
        height:  Pack height (thickness)
        cells:   Cell count (affects balance lead pins)
    """
    L = params.get("length", 105.0)
    W = params.get("width", 35.0)
    H = params.get("height", 32.0)
    cells = params.get("cells", 4)

    # Main pack body (heat-shrink wrapped)
    body = (
        cq.Workplane("XY")
        .sketch().rect(L, W).vertices().fillet(3).finalize()
        .extrude(H)
    )

    # XT60 connector (front face)
    xt60 = (
        cq.Workplane("XY")
        .workplane(offset=H / 2 - 4)
        .transformed(offset=(-(L / 2 + 5), 0, 0))
        .sketch().rect(10, 8).vertices().fillet(1).finalize()
        .extrude(8)
    )
    # XT60 pins
    for y_off in [-2, 2]:
        pin = (
            cq.Workplane("XY")
            .workplane(offset=H / 2 - 2)
            .transformed(offset=(-(L / 2 + 10), y_off, 0))
            .circle(1.5)
            .extrude(5)
        )
        xt60 = xt60.union(pin)

    # Balance lead (side, small JST-XH)
    bal_w = (cells + 1) * 2.5 + 2
    balance = (
        cq.Workplane("XY")
        .workplane(offset=H - 3)
        .transformed(offset=(L / 2 - 15, W / 2 + 3, 0))
        .box(bal_w, 6, 3)
    )

    pack = body.union(xt60).union(balance)
    return pack


def cylindrical_cell_18650(params):
    """
    18650 cylindrical Li-ion cell.
    
    params:
        diameter:   Cell diameter (18mm standard)
        length:     Cell length (65mm standard)
        positive_d: Positive terminal button diameter
    """
    d = params.get("diameter", 18.0)
    l = params.get("length", 65.0)
    pos_d = params.get("positive_d", 6.0)

    # Cell body
    body = cq.Workplane("XY").circle(d / 2.0).extrude(l)

    # Positive terminal (raised button)
    pos = (
        cq.Workplane("XY")
        .workplane(offset=l)
        .circle(pos_d / 2.0)
        .extrude(1.5)
    )

    # Insulation ring (top)
    insul = (
        cq.Workplane("XY")
        .workplane(offset=l - 0.5)
        .circle(d / 2.0)
        .circle(d / 2.0 - 1)
        .extrude(0.5)
    )

    # Negative terminal (flat bottom, slight recess)
    neg_ring = (
        cq.Workplane("XY")
        .circle(d / 2.0)
        .circle(d / 2.0 - 1.5)
        .extrude(0.3)
    )

    cell = body.union(pos).union(insul).union(neg_ring)
    return cell


def sma_antenna(params):
    """
    SMA antenna (dipole whip or stubby).
    Recognisable: threaded SMA base, antenna element.
    
    params:
        antenna_l:  Antenna element length
        antenna_d:  Antenna element diameter
        base_d:     SMA base diameter
        connector_type: 'sma' or 'rpsma'
    """
    ant_l = params.get("antenna_l", 50.0)
    ant_d = params.get("antenna_d", 5.0)
    base_d = params.get("base_d", 6.35)  # SMA standard

    # SMA connector base (threaded barrel)
    base = cq.Workplane("XY").circle(base_d / 2.0).extrude(8)

    # Thread indication
    for i in range(6):
        ring = (
            cq.Workplane("XY")
            .workplane(offset=i * 1.2 + 0.5)
            .circle(base_d / 2.0 + 0.2)
            .circle(base_d / 2.0)
            .extrude(0.4)
        )
        base = base.union(ring)

    # Hex nut section (for tightening)
    hex_nut = (
        cq.Workplane("XY")
        .workplane(offset=3)
        .polygon(6, base_d * 1.3)
        .extrude(3)
    )
    base = base.union(hex_nut)

    # Antenna element
    element = (
        cq.Workplane("XY")
        .workplane(offset=8)
        .circle(ant_d / 2.0)
        .extrude(ant_l)
    )

    # Tip cap
    tip = (
        cq.Workplane("XY")
        .workplane(offset=8 + ant_l)
        .circle(ant_d / 2.0 + 0.5)
        .extrude(3)
    )

    return base.union(element).union(tip)


def frame_plate(params):
    """
    Carbon fibre frame plate (top or bottom plate).
    Flat plate with arm cutouts, mounting holes, and camera bay.
    
    params:
        width:         Plate width (motor-to-motor Y)
        length:        Plate length (front-to-back X)
        thickness:     Plate thickness (typically 2-3mm CF)
        arm_width:     Motor arm width
        mounting_hole_d: Stack mounting hole diameter
        mounting_pattern: Stack mounting bolt spacing
    """
    W = params.get("width", 170.0)
    L = params.get("length", 200.0)
    t = params.get("thickness", 2.5)
    aw = params.get("arm_width", 14.0)
    mhd = params.get("mounting_hole_d", 3.0)
    mp = params.get("mounting_pattern", 30.5)

    # Main plate outline (simplified X shape)
    # Center body
    body = (
        cq.Workplane("XY")
        .sketch().rect(mp + 20, mp + 20).vertices().fillet(3).finalize()
        .extrude(t)
    )

    # Arms (4 extending diagonally)
    arm_l = max(W, L) / 2.0
    for angle in [45, 135, 225, 315]:
        rad = math.radians(angle)
        end_x = arm_l * math.cos(rad)
        end_y = arm_l * math.sin(rad)
        mid_x = end_x / 2.0
        mid_y = end_y / 2.0
        arm = (
            cq.Workplane("XY")
            .transformed(offset=(mid_x, mid_y, 0))
            .transformed(rotate=(0, 0, angle))
            .sketch().rect(arm_l, aw).vertices().fillet(2).finalize()
            .extrude(t)
        )
        body = body.union(arm)

        # Motor mount pad at end
        pad = (
            cq.Workplane("XY")
            .transformed(offset=(end_x, end_y, 0))
            .circle(12)
            .extrude(t)
        )
        body = body.union(pad)

        # Motor mounting holes
        for bolt_angle in range(4):
            ba = math.radians(bolt_angle * 90 + 45)
            bx = end_x + 8 * math.cos(ba)
            by = end_y + 8 * math.sin(ba)
            hole = cq.Workplane("XY").workplane(offset=-0.5).transformed(offset=(bx, by, 0)).circle(1.6).extrude(t + 1)
            body = body.cut(hole)

    # Stack mounting holes (center 30.5×30.5 pattern)
    half = mp / 2.0
    for x, y in [(-half, -half), (-half, half), (half, -half), (half, half)]:
        hole = cq.Workplane("XY").workplane(offset=-0.5).transformed(offset=(x, y, 0)).circle(mhd / 2.0).extrude(t + 1)
        body = body.cut(hole)

    # Camera bay slot (front)
    cam_slot = (
        cq.Workplane("XY")
        .workplane(offset=-0.5)
        .transformed(offset=(0, -mp / 2 - 5, 0))
        .sketch().rect(22, 8).vertices().fillet(2).finalize()
        .extrude(t + 1)
    )
    body = body.cut(cam_slot)

    return body


TIER3_DRONES = {
    "propeller_airfoil": {
        "function": propeller_airfoil,
        "name": "Propeller (Airfoil Blades)",
        "category": "propulsion",
        "default_colour": "#2F2F2F",
        "visual_tags": ["composite", "rotating"],
        "param_schema": {
            "diameter": {"type": "number", "default": 127.0, "unit": "mm", "description": "5 inch = 127mm"},
            "blade_count": {"type": "integer", "default": 2, "enum": [2, 3]},
            "hub_d": {"type": "number", "default": 12.0, "unit": "mm"},
            "shaft_d": {"type": "number", "default": 5.0, "unit": "mm"},
        },
    },
    "fpv_camera": {
        "function": fpv_camera,
        "name": "FPV Camera Module",
        "category": "camera",
        "default_colour": "#1A1A1A",
        "visual_tags": ["electronic", "optical"],
        "param_schema": {
            "size": {"type": "number", "default": 19.0, "enum": [14, 19, 28], "unit": "mm"},
            "lens_d": {"type": "number", "default": 14.0, "unit": "mm"},
        },
    },
    "esc_board": {
        "function": esc_board,
        "name": "Electronic Speed Controller (ESC)",
        "category": "electronics",
        "default_colour": "#006400",
        "visual_tags": ["pcb", "electronic"],
        "param_schema": {
            "width": {"type": "number", "default": 27.0, "unit": "mm"},
            "mounting_pattern": {"type": "number", "default": 20.0, "unit": "mm"},
        },
    },
    "gps_module": {
        "function": gps_module,
        "name": "GPS / GNSS Module",
        "category": "electronics",
        "default_colour": "#006400",
        "visual_tags": ["pcb", "electronic", "antenna"],
        "param_schema": {
            "pcb_w": {"type": "number", "default": 25.0, "unit": "mm"},
            "patch_w": {"type": "number", "default": 18.0, "unit": "mm"},
        },
    },
    "lipo_battery_pack": {
        "function": lipo_battery_pack,
        "name": "LiPo Battery Pack",
        "category": "battery",
        "default_colour": "#FFD700",
        "visual_tags": ["battery", "power"],
        "param_schema": {
            "length": {"type": "number", "default": 105.0, "unit": "mm"},
            "width": {"type": "number", "default": 35.0, "unit": "mm"},
            "height": {"type": "number", "default": 32.0, "unit": "mm"},
            "cells": {"type": "integer", "default": 4, "enum": [2, 3, 4, 6]},
        },
    },
    "cylindrical_cell_18650": {
        "function": cylindrical_cell_18650,
        "name": "18650 Li-ion Cell",
        "category": "battery",
        "default_colour": "#228B22",
        "visual_tags": ["battery", "power"],
        "param_schema": {
            "diameter": {"type": "number", "default": 18.0, "unit": "mm"},
            "length": {"type": "number", "default": 65.0, "unit": "mm"},
        },
    },
    "sma_antenna": {
        "function": sma_antenna,
        "name": "SMA Antenna (Dipole / Whip)",
        "category": "antenna",
        "default_colour": "#1A1A1A",
        "visual_tags": ["metal", "electrical", "antenna"],
        "param_schema": {
            "antenna_l": {"type": "number", "default": 50.0, "unit": "mm"},
            "antenna_d": {"type": "number", "default": 5.0, "unit": "mm"},
        },
    },
    "frame_plate": {
        "function": frame_plate,
        "name": "Carbon Fibre Frame Plate",
        "category": "frame",
        "default_colour": "#1A1A1A",
        "visual_tags": ["carbon_fibre", "structural"],
        "param_schema": {
            "width": {"type": "number", "default": 170.0, "unit": "mm"},
            "length": {"type": "number", "default": 200.0, "unit": "mm"},
            "thickness": {"type": "number", "default": 2.5, "unit": "mm"},
        },
    },
}
