"""
ForgeOS Component Geometry Library — Tier 3: BSF / Brine / EPS
===============================================================
Black Soldier Fly breeding, Brine processing, EPS architectural.
"""

import cadquery as cq
import math


# ============================================================
# BLACK SOLDIER FLY (BSF) BREEDING
# ============================================================

def breeding_cage(params):
    """Mesh breeding cage / enclosure — frame with mesh panels."""
    L = params.get("length", 600.0)
    W = params.get("width", 400.0)
    H = params.get("height", 500.0)
    tube = params.get("frame_tube", 20.0)

    # Build rectangular box frame from 12 edges
    frame = None
    # 4 bottom edges
    for start, end in [((0,0),(L,0)),((L,0),(L,W)),((L,W),(0,W)),((0,W),(0,0))]:
        mx = (start[0]+end[0])/2 - L/2
        my = (start[1]+end[1])/2 - W/2
        dx = end[0]-start[0]; dy = end[1]-start[1]
        seg_l = math.sqrt(dx*dx+dy*dy)
        ang = math.degrees(math.atan2(dy, dx))
        bar = (cq.Workplane("XY").transformed(offset=(mx,my,tube/2)).transformed(rotate=(0,0,ang))
               .sketch().rect(seg_l+tube, tube).finalize().extrude(tube))
        frame = bar if frame is None else frame.union(bar)
    # 4 top edges
    for start, end in [((0,0),(L,0)),((L,0),(L,W)),((L,W),(0,W)),((0,W),(0,0))]:
        mx = (start[0]+end[0])/2 - L/2
        my = (start[1]+end[1])/2 - W/2
        dx = end[0]-start[0]; dy = end[1]-start[1]
        seg_l = math.sqrt(dx*dx+dy*dy)
        ang = math.degrees(math.atan2(dy, dx))
        bar = (cq.Workplane("XY").workplane(offset=H-tube).transformed(offset=(mx,my,tube/2)).transformed(rotate=(0,0,ang))
               .sketch().rect(seg_l+tube, tube).finalize().extrude(tube))
        frame = frame.union(bar)
    # 4 verticals
    for cx, cy in [(-L/2+tube/2,-W/2+tube/2),(-L/2+tube/2,W/2-tube/2),(L/2-tube/2,-W/2+tube/2),(L/2-tube/2,W/2-tube/2)]:
        vert = cq.Workplane("XY").transformed(offset=(cx,cy,H/2)).box(tube, tube, H)
        frame = frame.union(vert)
    # Door opening (front face)
    door = (cq.Workplane("XY").workplane(offset=tube).transformed(offset=(0,-W/2,0))
            .sketch().rect(L*0.5, H-tube*3).vertices().fillet(3).finalize().extrude(tube+2))
    frame = frame.cut(door)
    return frame


def egg_collection_plate(params):
    """Corrugated egg collection plate for BSF oviposition."""
    L = params.get("length", 200.0)
    W = params.get("width", 50.0)
    H = params.get("height", 25.0)
    t = params.get("thickness", 2.0)
    corrugations = params.get("corrugations", 8)

    base = cq.Workplane("XY").sketch().rect(L, W).finalize().extrude(t)
    ridge_spacing = L / (corrugations + 1)
    for i in range(corrugations):
        rx = -(L/2) + (i+1) * ridge_spacing
        ridge = (cq.Workplane("XY").workplane(offset=t).transformed(offset=(rx, 0, 0))
                 .sketch().rect(t, W-4).finalize().extrude(H - t))
        base = base.union(ridge)
    return base


def larvae_rearing_tray(params):
    """Shallow rearing tray with drainage holes and handles."""
    L = params.get("length", 600.0)
    W = params.get("width", 400.0)
    D = params.get("depth", 80.0)
    wall = params.get("wall", 3.0)

    outer = cq.Workplane("XY").sketch().rect(L, W).vertices().fillet(5).finalize().extrude(D)
    inner = cq.Workplane("XY").workplane(offset=wall).sketch().rect(L-wall*2, W-wall*2).vertices().fillet(3).finalize().extrude(D)
    tray = outer.cut(inner)
    # Drain holes
    hole_sp = 30
    for ix in range(int(L/hole_sp)-1):
        for iy in range(int(W/hole_sp)-1):
            hx = -(L/2) + (ix+1)*hole_sp
            hy = -(W/2) + (iy+1)*hole_sp
            h = cq.Workplane("XY").workplane(offset=-0.5).transformed(offset=(hx,hy,0)).circle(2).extrude(wall+1)
            tray = tray.cut(h)
    # Handles
    for x_off in [-(L/2+5), L/2+5]:
        handle = (cq.Workplane("XY").workplane(offset=D-20).transformed(offset=(x_off, 0, 0))
                  .sketch().rect(8, 60).vertices().fillet(3).finalize().extrude(15))
        tray = tray.union(handle)
    return tray


def ventilation_louvre(params):
    """Angled slat ventilation panel."""
    W = params.get("width", 200.0)
    H = params.get("height", 150.0)
    depth = params.get("depth", 30.0)
    slat_count = params.get("slat_count", 8)
    frame_t = params.get("frame_thickness", 3.0)

    frame = cq.Workplane("XY").sketch().rect(W, H).vertices().fillet(2).finalize().extrude(depth)
    frame_inner = cq.Workplane("XY").workplane(offset=-0.5).sketch().rect(W-frame_t*2, H-frame_t*2).vertices().fillet(1).finalize().extrude(depth+1)
    panel = frame.cut(frame_inner)
    slat_h = (H - frame_t*2) / (slat_count + 1)
    for i in range(slat_count):
        sy = -(H/2 - frame_t) + (i+1) * slat_h
        slat = (cq.Workplane("XY").transformed(offset=(0, sy, depth/2))
                .transformed(rotate=(30, 0, 0))
                .box(W - frame_t*2 - 2, slat_h * 0.8, 1.5))
        panel = panel.union(slat)
    return panel


def harvesting_screen(params):
    """Sieve / harvesting screen — mesh grid in a frame."""
    L = params.get("length", 500.0)
    W = params.get("width", 300.0)
    frame_h = params.get("frame_height", 40.0)
    frame_t = params.get("frame_thickness", 5.0)

    outer = cq.Workplane("XY").sketch().rect(L, W).vertices().fillet(3).finalize().extrude(frame_h)
    inner = cq.Workplane("XY").workplane(offset=-0.5).sketch().rect(L-frame_t*2, W-frame_t*2).vertices().fillet(2).finalize().extrude(frame_h+1)
    frame = outer.cut(inner)
    # Mesh grid bars
    mesh = None
    num_long = min(int(W / 50) + 1, 12)
    num_trans = min(int(L / 50) + 1, 20)
    inner_l = L - frame_t*2
    inner_w = W - frame_t*2
    for i in range(num_long):
        y = -(inner_w/2) + (i+0.5) * (inner_w/num_long)
        bar = cq.Workplane("XY").transformed(offset=(0, y, 0.5)).box(inner_l, 0.8, 1)
        mesh = bar if mesh is None else mesh.union(bar)
    for i in range(num_trans):
        x = -(inner_l/2) + (i+0.5) * (inner_l/num_trans)
        bar = cq.Workplane("XY").workplane(offset=1).transformed(offset=(x, 0, 0.5)).box(0.8, inner_w, 1)
        mesh = mesh.union(bar)
    frame = frame.union(mesh)
    return frame


# ============================================================
# BRINE MINING (from RO waste water)
# ============================================================

def pressure_vessel(params):
    """Cylindrical pressure vessel with flanged ends and nozzle."""
    od = params.get("od", 600.0)
    length = params.get("length", 2000.0)
    wall = params.get("wall", 8.0)
    flange_d = params.get("flange_d", od + 80)
    flange_t = params.get("flange_t", 20.0)
    nozzle_d = params.get("nozzle_d", 100.0)

    shell = cq.Workplane("XY").circle(od/2).extrude(length)
    shell_inner = cq.Workplane("XY").workplane(offset=wall).circle(od/2 - wall).extrude(length - wall*2)
    vessel = shell.cut(shell_inner)
    # Flanges
    for z_off in [0, length - flange_t]:
        flange = cq.Workplane("XY").workplane(offset=z_off).circle(flange_d/2).circle(od/2 + 5).extrude(flange_t)
        bolt_pcd = (od/2 + flange_d/2) / 2 + 10
        for i in range(12):
            ang = 2*math.pi*i/12
            bx = bolt_pcd * math.cos(ang); by = bolt_pcd * math.sin(ang)
            h = cq.Workplane("XY").workplane(offset=z_off-1).transformed(offset=(bx,by,0)).circle(8).extrude(flange_t+2)
            flange = flange.cut(h)
        vessel = vessel.union(flange)
    # Side nozzle
    nozzle = (cq.Workplane("XY").workplane(offset=length/2 - nozzle_d/2)
              .transformed(offset=(0, od/2, 0)).transformed(rotate=(90,0,0))
              .circle(nozzle_d/2).extrude(80))
    nozzle_bore = (cq.Workplane("XY").workplane(offset=length/2 - nozzle_d/2)
                   .transformed(offset=(0, od/2-5, 0)).transformed(rotate=(90,0,0))
                   .circle(nozzle_d/2-wall).extrude(90))
    vessel = vessel.union(nozzle).cut(nozzle_bore)
    return vessel


def hydrocyclone(params):
    """Conical hydrocyclone separator — cylindrical body tapering to cone."""
    body_d = params.get("body_d", 300.0)
    body_h = params.get("body_h", 400.0)
    cone_h = params.get("cone_h", 600.0)
    wall = params.get("wall", 5.0)
    inlet_d = params.get("inlet_d", 60.0)
    overflow_d = params.get("overflow_d", 80.0)
    underflow_d = params.get("underflow_d", 40.0)

    # Cylindrical section
    cyl = cq.Workplane("XY").circle(body_d/2).extrude(body_h)
    cyl_inner = cq.Workplane("XY").workplane(offset=wall).circle(body_d/2 - wall).extrude(body_h - wall)
    body = cyl.cut(cyl_inner)
    # Cone (stepped rings)
    cone = None
    steps = 8
    for i in range(steps):
        frac = i / steps
        z = -frac * cone_h
        d = body_d * (1 - frac * 0.85)
        ring = cq.Workplane("XY").workplane(offset=z - cone_h/steps).circle(d/2).extrude(cone_h/steps + 1)
        ring_inner = cq.Workplane("XY").workplane(offset=z - cone_h/steps - 0.5).circle(d/2 - wall).extrude(cone_h/steps + 2)
        ring = ring.cut(ring_inner)
        cone = ring if cone is None else cone.union(ring)
    body = body.union(cone)
    # Tangential inlet
    inlet = (cq.Workplane("XY").workplane(offset=body_h - 50)
             .transformed(offset=(body_d/2, 0, 0)).transformed(rotate=(0,90,0))
             .circle(inlet_d/2).extrude(60))
    body = body.union(inlet)
    # Vortex finder (overflow)
    vf = cq.Workplane("XY").workplane(offset=body_h).circle(overflow_d/2).extrude(80)
    vf_bore = cq.Workplane("XY").workplane(offset=body_h - 50).circle(overflow_d/2 - wall).extrude(130 + 50)
    body = body.union(vf).cut(vf_bore)
    # Underflow spigot
    uf = cq.Workplane("XY").workplane(offset=-cone_h - 40).circle(underflow_d/2).extrude(40)
    body = body.union(uf)
    return body


def crystalliser_vessel(params):
    """Crystalliser — tall cylinder with conical bottom and draft tube."""
    od = params.get("od", 800.0)
    cyl_h = params.get("cylinder_height", 1500.0)
    cone_h = params.get("cone_height", 600.0)
    wall = params.get("wall", 6.0)
    draft_od = params.get("draft_tube_od", 300.0)

    # Cylindrical shell
    shell = cq.Workplane("XY").circle(od/2).extrude(cyl_h)
    shell_inner = cq.Workplane("XY").workplane(offset=wall).circle(od/2 - wall).extrude(cyl_h - wall)
    vessel = shell.cut(shell_inner)
    # Conical bottom (stepped)
    steps = 6
    for i in range(steps):
        frac = (i + 1) / steps
        z = -frac * cone_h
        d = od * (1 - frac * 0.7)
        ring = cq.Workplane("XY").workplane(offset=z).circle(d/2).extrude(cone_h/steps + 1)
        ring_inner = cq.Workplane("XY").workplane(offset=z - 0.5).circle(d/2 - wall).extrude(cone_h/steps + 2)
        vessel = vessel.union(ring.cut(ring_inner))
    # Draft tube (internal, centered)
    draft = cq.Workplane("XY").workplane(offset=cyl_h * 0.2).circle(draft_od/2).extrude(cyl_h * 0.6)
    draft_inner = cq.Workplane("XY").workplane(offset=cyl_h * 0.2 - 1).circle(draft_od/2 - wall).extrude(cyl_h * 0.6 + 2)
    vessel = vessel.union(draft.cut(draft_inner))
    # Top flange
    flange = cq.Workplane("XY").workplane(offset=cyl_h).circle(od/2 + 30).circle(od/2 - wall).extrude(15)
    vessel = vessel.union(flange)
    return vessel


def filter_press_plate(params):
    """Single filter press plate with recess and feed/filtrate ports."""
    size = params.get("size", 400.0)
    thickness = params.get("thickness", 40.0)
    feed_d = params.get("feed_hole_d", 50.0)
    corner_r = params.get("corner_r", 10.0)

    plate = cq.Workplane("XY").sketch().rect(size, size).vertices().fillet(corner_r).finalize().extrude(thickness)
    recess = cq.Workplane("XY").workplane(offset=5).sketch().rect(size-40, size-40).vertices().fillet(5).finalize().extrude(thickness - 10)
    plate = plate.cut(recess)
    # Feed hole
    feed = cq.Workplane("XY").workplane(offset=-1).transformed(offset=(size/2-30, size/2-30, 0)).circle(feed_d/2).extrude(thickness+2)
    plate = plate.cut(feed)
    # Filtrate hole
    filt = cq.Workplane("XY").workplane(offset=-1).transformed(offset=(-(size/2-30), -(size/2-30), 0)).circle(feed_d/2 * 0.7).extrude(thickness+2)
    plate = plate.cut(filt)
    # Handle lugs
    for x in [-size/2 + 25, size/2 - 25]:
        lug = cq.Workplane("XY").transformed(offset=(x, size/2 + 8, thickness/2)).box(30, 16, thickness)
        lug_hole = cq.Workplane("XY").workplane(offset=-1).transformed(offset=(x, size/2 + 8, 0)).circle(6).extrude(thickness+2)
        plate = plate.union(lug).cut(lug_hole)
    return plate


def product_hopper(params):
    """Product bin / hopper with sloped bottom for discharge."""
    top_l = params.get("top_length", 600.0)
    top_w = params.get("top_width", 400.0)
    height = params.get("height", 500.0)
    slope_h = params.get("slope_height", 300.0)
    outlet_d = params.get("outlet_d", 80.0)
    wall = params.get("wall", 3.0)

    # Rectangular top section
    top = cq.Workplane("XY").sketch().rect(top_l, top_w).finalize().extrude(height)
    top_inner = cq.Workplane("XY").workplane(offset=wall).sketch().rect(top_l-wall*2, top_w-wall*2).finalize().extrude(height-wall)
    hopper = top.cut(top_inner)
    # Sloped bottom (pyramid frustum via stepped rectangles)
    steps = 5
    for i in range(steps):
        frac = (i+1)/steps
        z = -frac * slope_h
        sl = top_l * (1 - frac * 0.7)
        sw = top_w * (1 - frac * 0.7)
        ring = cq.Workplane("XY").workplane(offset=z).sketch().rect(sl, sw).finalize().extrude(slope_h/steps + 1)
        ring_inner = cq.Workplane("XY").workplane(offset=z-0.5).sketch().rect(sl-wall*2, sw-wall*2).finalize().extrude(slope_h/steps + 2)
        hopper = hopper.union(ring.cut(ring_inner))
    # Discharge outlet
    outlet = cq.Workplane("XY").workplane(offset=-slope_h - 30).circle(outlet_d/2).extrude(30)
    outlet_bore = cq.Workplane("XY").workplane(offset=-slope_h - 31).circle(outlet_d/2 - wall).extrude(32)
    hopper = hopper.union(outlet).cut(outlet_bore)
    # Support legs (4)
    for x, y in [(-top_l/2+30, -top_w/2+30), (-top_l/2+30, top_w/2-30),
                 (top_l/2-30, -top_w/2+30), (top_l/2-30, top_w/2-30)]:
        leg = cq.Workplane("XY").workplane(offset=-slope_h - 230).transformed(offset=(x, y, 0)).box(30, 30, 200)
        hopper = hopper.union(leg)
    return hopper


def pipe_flange(params):
    """Pipe flange — slip-on or blind, with bolt holes."""
    pipe_od = params.get("pipe_od", 60.3)
    flange_od = params.get("flange_od", 150.0)
    thickness = params.get("thickness", 16.0)
    bolt_pcd = params.get("bolt_pcd", 115.0)
    bolt_count = params.get("bolt_count", 8)
    bolt_d = params.get("bolt_d", 14.0)
    blind = params.get("blind", False)

    disc = cq.Workplane("XY").circle(flange_od/2).extrude(thickness)
    if not blind:
        bore = cq.Workplane("XY").workplane(offset=-1).circle(pipe_od/2 - 3).extrude(thickness + 2)
        disc = disc.cut(bore)
    # Raised face
    rf = cq.Workplane("XY").workplane(offset=thickness).circle(pipe_od/2 + 10).extrude(2)
    disc = disc.union(rf)
    for i in range(bolt_count):
        ang = 2*math.pi*i/bolt_count
        bx = bolt_pcd/2 * math.cos(ang); by = bolt_pcd/2 * math.sin(ang)
        h = cq.Workplane("XY").workplane(offset=-1).transformed(offset=(bx,by,0)).circle(bolt_d/2).extrude(thickness+4)
        disc = disc.cut(h)
    if not blind:
        hub = cq.Workplane("XY").workplane(offset=-30).circle(pipe_od/2 + 5).extrude(30)
        hub_bore = cq.Workplane("XY").workplane(offset=-31).circle(pipe_od/2 - 3).extrude(32)
        disc = disc.union(hub).cut(hub_bore)
    return disc


def control_valve(params):
    """Globe control valve body with actuator housing."""
    body_d = params.get("body_d", 80.0)
    port_d = params.get("port_d", 50.0)
    body_h = params.get("body_h", 120.0)
    actuator_d = params.get("actuator_d", 60.0)
    actuator_h = params.get("actuator_h", 150.0)

    body = cq.Workplane("XY").circle(body_d/2).extrude(body_h)
    for y_off in [-(body_d/2 + 20), body_d/2 + 20]:
        port = (cq.Workplane("XY").workplane(offset=body_h/2 - port_d/2)
                .transformed(offset=(0, y_off, 0)).transformed(rotate=(90,0,0))
                .circle(port_d/2).extrude(abs(y_off) - body_d/2 + 5))
        body = body.union(port)
    bonnet = cq.Workplane("XY").workplane(offset=body_h).circle(body_d/2 * 0.7).extrude(20)
    stem = cq.Workplane("XY").workplane(offset=body_h + 20).circle(8).extrude(30)
    actuator = cq.Workplane("XY").workplane(offset=body_h + 50).circle(actuator_d/2).extrude(actuator_h)
    yoke = cq.Workplane("XY").workplane(offset=body_h + 20).sketch().rect(actuator_d + 10, 15).finalize().extrude(30)
    return body.union(bonnet).union(stem).union(actuator).union(yoke)


# ============================================================
# EPS ARCHITECTURAL PARTS
# ============================================================

def eps_block(params):
    """Raw EPS block / billet for CNC or hot-wire cutting."""
    L = params.get("length", 2400.0)
    W = params.get("width", 1200.0)
    H = params.get("height", 600.0)
    return cq.Workplane("XY").sketch().rect(L, W).finalize().extrude(H)


def hot_wire_cutter_frame(params):
    """Hot wire cutter U-frame for EPS profiling."""
    throat_w = params.get("throat_width", 600.0)
    throat_d = params.get("throat_depth", 400.0)
    tube_d = params.get("tube_diameter", 20.0)
    wire_d = params.get("wire_diameter", 0.5)

    base = (cq.Workplane("XY").transformed(offset=(0, 0, tube_d/2))
            .sketch().rect(throat_w + tube_d*2, tube_d).vertices().fillet(tube_d/2 - 0.5).finalize().extrude(tube_d))
    left = cq.Workplane("XY").transformed(offset=(-(throat_w/2 + tube_d/2), 0, throat_d/2 + tube_d)).box(tube_d, tube_d, throat_d)
    right = cq.Workplane("XY").transformed(offset=(throat_w/2 + tube_d/2, 0, throat_d/2 + tube_d)).box(tube_d, tube_d, throat_d)
    wire = cq.Workplane("XY").workplane(offset=throat_d + tube_d).sketch().rect(throat_w, wire_d).finalize().extrude(wire_d)
    handle = (cq.Workplane("XY").transformed(offset=(0, 0, -5))
              .sketch().rect(120, 30).vertices().fillet(10).finalize().extrude(10))
    return base.union(left).union(right).union(wire).union(handle)


def reinforcing_mesh_panel(params):
    """Fibreglass or steel reinforcing mesh for EPS render systems."""
    L = params.get("length", 1000.0)
    W = params.get("width", 500.0)
    wire_d = params.get("wire_diameter", 3.0)
    spacing = params.get("mesh_spacing", 50.0)

    mesh = None
    num_long = min(int(W / spacing) + 1, 15)
    num_trans = min(int(L / spacing) + 1, 25)
    for i in range(num_long):
        y = -(W/2) + i * (W / max(num_long-1, 1))
        wire = cq.Workplane("XY").transformed(offset=(0, y, wire_d/2)).sketch().rect(L, wire_d).vertices().fillet(wire_d/2 - 0.1).finalize().extrude(wire_d)
        mesh = wire if mesh is None else mesh.union(wire)
    for i in range(num_trans):
        x = -(L/2) + i * (L / max(num_trans-1, 1))
        wire = cq.Workplane("XY").workplane(offset=wire_d).transformed(offset=(x, 0, wire_d/2)).sketch().rect(wire_d, W).vertices().fillet(wire_d/2 - 0.1).finalize().extrude(wire_d)
        mesh = mesh.union(wire)
    return mesh


def corner_bead(params):
    """L-shaped corner bead / edge profile for EPS cladding systems."""
    leg_a = params.get("leg_a", 60.0)
    leg_b = params.get("leg_b", 60.0)
    length = params.get("length", 2400.0)
    thickness = params.get("thickness", 1.0)
    mesh_wing = params.get("mesh_wing", 40.0)

    v_leg = cq.Workplane("XY").transformed(offset=(thickness/2, 0, leg_a/2)).box(thickness, length, leg_a)
    h_leg = cq.Workplane("XY").transformed(offset=(leg_b/2, 0, thickness/2)).box(leg_b, length, thickness)
    bead = v_leg.union(h_leg)
    wing_v = cq.Workplane("XY").transformed(offset=(thickness + mesh_wing/2, 0, leg_a - mesh_wing/2)).box(mesh_wing, length, 0.5)
    wing_h = cq.Workplane("XY").transformed(offset=(leg_b - mesh_wing/2, 0, thickness + mesh_wing/2)).box(0.5, length, mesh_wing)
    return bead.union(wing_v).union(wing_h)


def anchor_bracket(params):
    """Mechanical EPS fixing anchor — disc head with expansion shaft."""
    disc_d = params.get("disc_diameter", 60.0)
    shaft_d = params.get("shaft_diameter", 8.0)
    shaft_l = params.get("shaft_length", 100.0)
    disc_t = params.get("disc_thickness", 2.0)

    disc = cq.Workplane("XY").circle(disc_d/2).extrude(disc_t)
    shaft = cq.Workplane("XY").workplane(offset=-shaft_l).circle(shaft_d/2).extrude(shaft_l)
    for y_off in [-shaft_d/3, shaft_d/3]:
        split = cq.Workplane("XY").workplane(offset=-shaft_l - 0.5).transformed(offset=(0, y_off, 0)).box(1, shaft_d/3, 15)
        shaft = shaft.cut(split)
    return disc.union(shaft)


def surface_texture_panel(params):
    """Decorative EPS facade panel with surface texture pattern."""
    L = params.get("length", 600.0)
    W = params.get("width", 400.0)
    thickness = params.get("thickness", 50.0)
    pattern = params.get("pattern", "ashlar")  # ashlar, rusticated, smooth

    panel = cq.Workplane("XY").sketch().rect(L, W).finalize().extrude(thickness)
    # Ashlar stone pattern — horizontal and vertical grooves
    if pattern == "ashlar":
        groove_d = 3.0
        # Horizontal courses
        course_h = 80
        num_courses = int(W / course_h)
        for i in range(1, num_courses):
            gy = -(W/2) + i * course_h
            groove = cq.Workplane("XY").workplane(offset=thickness - groove_d).transformed(offset=(0, gy, 0)).box(L, groove_d, groove_d + 1)
            panel = panel.cut(groove)
        # Vertical joints (staggered)
        joint_sp = 200
        for i in range(num_courses):
            gy = -(W/2) + i * course_h + course_h/2
            offset_x = (joint_sp/2) if i % 2 else 0
            for j in range(int(L / joint_sp) + 1):
                jx = -(L/2) + j * joint_sp + offset_x
                if -L/2 < jx < L/2:
                    joint = (cq.Workplane("XY").workplane(offset=thickness - groove_d)
                             .transformed(offset=(jx, gy, 0)).box(groove_d, course_h - groove_d, groove_d + 1))
                    panel = panel.cut(joint)
    return panel


# ============================================================
# REGISTRIES
# ============================================================

TIER3_BSF = {
    "breeding_cage": {
        "function": breeding_cage, "name": "BSF Breeding Cage", "category": "enclosure",
        "default_colour": "#808080", "visual_tags": ["metal", "structural", "mesh"],
        "param_schema": {
            "length": {"type": "number", "default": 600.0, "unit": "mm"},
            "width": {"type": "number", "default": 400.0, "unit": "mm"},
            "height": {"type": "number", "default": 500.0, "unit": "mm"},
        },
    },
    "egg_collection_plate": {
        "function": egg_collection_plate, "name": "BSF Egg Collection Plate", "category": "breeding",
        "default_colour": "#8B4513", "visual_tags": ["wood", "corrugated"],
        "param_schema": {
            "length": {"type": "number", "default": 200.0, "unit": "mm"},
            "corrugations": {"type": "integer", "default": 8},
        },
    },
    "larvae_rearing_tray": {
        "function": larvae_rearing_tray, "name": "Larvae Rearing Tray", "category": "breeding",
        "default_colour": "#696969", "visual_tags": ["plastic", "hdpe"],
        "param_schema": {
            "length": {"type": "number", "default": 600.0, "unit": "mm"},
            "width": {"type": "number", "default": 400.0, "unit": "mm"},
            "depth": {"type": "number", "default": 80.0, "unit": "mm"},
        },
    },
    "ventilation_louvre": {
        "function": ventilation_louvre, "name": "Ventilation Louvre Panel", "category": "hvac",
        "default_colour": "#C0C0C0", "visual_tags": ["aluminium", "structural"],
        "param_schema": {
            "width": {"type": "number", "default": 200.0, "unit": "mm"},
            "height": {"type": "number", "default": 150.0, "unit": "mm"},
            "slat_count": {"type": "integer", "default": 8},
        },
    },
    "harvesting_screen": {
        "function": harvesting_screen, "name": "Harvesting Screen / Sieve", "category": "processing",
        "default_colour": "#A0A0A0", "visual_tags": ["metal", "mesh"],
        "param_schema": {
            "length": {"type": "number", "default": 500.0, "unit": "mm"},
            "width": {"type": "number", "default": 300.0, "unit": "mm"},
        },
    },
}

TIER3_BRINE = {
    "pressure_vessel": {
        "function": pressure_vessel, "name": "Pressure Vessel", "category": "vessel",
        "default_colour": "#708090", "visual_tags": ["steel", "pressure", "vessel"],
        "param_schema": {
            "od": {"type": "number", "default": 600.0, "unit": "mm"},
            "length": {"type": "number", "default": 2000.0, "unit": "mm"},
            "wall": {"type": "number", "default": 8.0, "unit": "mm"},
        },
    },
    "hydrocyclone": {
        "function": hydrocyclone, "name": "Hydrocyclone Separator", "category": "separator",
        "default_colour": "#4682B4", "visual_tags": ["steel", "process"],
        "param_schema": {
            "body_d": {"type": "number", "default": 300.0, "unit": "mm"},
            "body_h": {"type": "number", "default": 400.0, "unit": "mm"},
            "cone_h": {"type": "number", "default": 600.0, "unit": "mm"},
        },
    },
    "crystalliser_vessel": {
        "function": crystalliser_vessel, "name": "Crystalliser Vessel", "category": "vessel",
        "default_colour": "#708090", "visual_tags": ["steel", "process", "vessel"],
        "param_schema": {
            "od": {"type": "number", "default": 800.0, "unit": "mm"},
            "cylinder_height": {"type": "number", "default": 1500.0, "unit": "mm"},
            "cone_height": {"type": "number", "default": 600.0, "unit": "mm"},
        },
    },
    "filter_press_plate": {
        "function": filter_press_plate, "name": "Filter Press Plate", "category": "filtration",
        "default_colour": "#4B0082", "visual_tags": ["polypropylene", "filtration"],
        "param_schema": {
            "size": {"type": "number", "default": 400.0, "unit": "mm"},
            "thickness": {"type": "number", "default": 40.0, "unit": "mm"},
        },
    },
    "product_hopper": {
        "function": product_hopper, "name": "Product Bin / Hopper", "category": "storage",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "structural"],
        "param_schema": {
            "top_length": {"type": "number", "default": 600.0, "unit": "mm"},
            "top_width": {"type": "number", "default": 400.0, "unit": "mm"},
            "height": {"type": "number", "default": 500.0, "unit": "mm"},
        },
    },
    "pipe_flange": {
        "function": pipe_flange, "name": "Pipe Flange", "category": "piping",
        "default_colour": "#A0A0A0", "visual_tags": ["steel", "piping"],
        "param_schema": {
            "pipe_od": {"type": "number", "default": 60.3, "unit": "mm"},
            "flange_od": {"type": "number", "default": 150.0, "unit": "mm"},
            "bolt_count": {"type": "integer", "default": 8},
            "blind": {"type": "boolean", "default": False},
        },
    },
    "control_valve": {
        "function": control_valve, "name": "Globe Control Valve", "category": "valve",
        "default_colour": "#696969", "visual_tags": ["steel", "cast", "valve"],
        "param_schema": {
            "body_d": {"type": "number", "default": 80.0, "unit": "mm"},
            "port_d": {"type": "number", "default": 50.0, "unit": "mm"},
            "actuator_d": {"type": "number", "default": 60.0, "unit": "mm"},
        },
    },
}

TIER3_EPS = {
    "eps_block": {
        "function": eps_block, "name": "EPS Block / Billet", "category": "material",
        "default_colour": "#F5F5F5", "visual_tags": ["foam", "eps", "insulation"],
        "param_schema": {
            "length": {"type": "number", "default": 2400.0, "unit": "mm"},
            "width": {"type": "number", "default": 1200.0, "unit": "mm"},
            "height": {"type": "number", "default": 600.0, "unit": "mm"},
        },
    },
    "hot_wire_cutter_frame": {
        "function": hot_wire_cutter_frame, "name": "Hot Wire Cutter Frame", "category": "tooling",
        "default_colour": "#FF4500", "visual_tags": ["metal", "tooling"],
        "param_schema": {
            "throat_width": {"type": "number", "default": 600.0, "unit": "mm"},
            "throat_depth": {"type": "number", "default": 400.0, "unit": "mm"},
        },
    },
    "reinforcing_mesh_panel": {
        "function": reinforcing_mesh_panel, "name": "Reinforcing Mesh Panel", "category": "reinforcement",
        "default_colour": "#FFD700", "visual_tags": ["fibreglass", "mesh"],
        "param_schema": {
            "length": {"type": "number", "default": 1000.0, "unit": "mm"},
            "width": {"type": "number", "default": 500.0, "unit": "mm"},
            "mesh_spacing": {"type": "number", "default": 50.0, "unit": "mm"},
        },
    },
    "corner_bead": {
        "function": corner_bead, "name": "Corner Bead / Edge Profile", "category": "trim",
        "default_colour": "#C0C0C0", "visual_tags": ["pvc", "aluminium", "trim"],
        "param_schema": {
            "leg_a": {"type": "number", "default": 60.0, "unit": "mm"},
            "leg_b": {"type": "number", "default": 60.0, "unit": "mm"},
            "length": {"type": "number", "default": 2400.0, "unit": "mm"},
        },
    },
    "anchor_bracket": {
        "function": anchor_bracket, "name": "EPS Fixing Anchor", "category": "fixing",
        "default_colour": "#FFA500", "visual_tags": ["nylon", "fixing"],
        "param_schema": {
            "disc_diameter": {"type": "number", "default": 60.0, "unit": "mm"},
            "shaft_length": {"type": "number", "default": 100.0, "unit": "mm"},
        },
    },
    "surface_texture_panel": {
        "function": surface_texture_panel, "name": "Surface Texture Panel", "category": "facade",
        "default_colour": "#DEB887", "visual_tags": ["eps", "facade", "architectural"],
        "param_schema": {
            "length": {"type": "number", "default": 600.0, "unit": "mm"},
            "width": {"type": "number", "default": 400.0, "unit": "mm"},
            "thickness": {"type": "number", "default": 50.0, "unit": "mm"},
            "pattern": {"type": "string", "default": "ashlar", "enum": ["ashlar", "rusticated", "smooth"]},
        },
    },
}
