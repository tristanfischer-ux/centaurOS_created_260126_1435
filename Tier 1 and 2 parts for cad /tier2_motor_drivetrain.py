"""ForgeOS Tier 2 motor/drivetrain CAD families.

Default stator and rotor dimensions are training benchmarks derived from
Pyleecan's Apache-2.0 IPMSM_B definition at revision
7937d675fb77701ac8f2c65816b583cb29270e12. The planetary defaults follow the
cq_gears Apache-2.0 three-planet example at revision
e73874cf17a25447a99b1e7c22a4d5af38560e9c. The serpentine cold plate is
ForgeOS source-owned geometry; PINNeAPPle revision 78c635… is an Apache-2.0
training check only. These are universal parametric geometries, not
original-equipment-manufacturer or race-vehicle parts.
"""

from __future__ import annotations

import argparse
import cmath
import math
import tempfile
from pathlib import Path

import cadquery as cq


PYLEECAN_IPMSM_B_SOURCE = (
    "https://github.com/Eomys/pyleecan/blob/"
    "7937d675fb77701ac8f2c65816b583cb29270e12/"
    "pyleecan/Data/Machine/IPMSM_B.json"
)
CQ_GEARS_PLANETARY_SOURCE = (
    "https://github.com/meadiode/cq_gears/blob/"
    "e73874cf17a25447a99b1e7c22a4d5af38560e9c/"
    "examples/ring_gears_and_planetary_gearsets.ipynb"
)
# PINNeAPPle is an Apache-2.0 training check (simple through-channel), not the
# geometry we emit — ForgeOS owns the serpentine builder below.
PINNEAPPLE_COLD_PLATE_TRAINING_CHECK = (
    "https://github.com/barrosyan/PINNeAPPle/blob/"
    "78c6357e5aa38802c99f8c3329dea6c13606ca5e/"
    "pinneapple_design/geometry/gen/cadquery_gen.py"
)

# IPMSM_B HoleM53 W4 (radians) — V-pocket opening angle.
_IPMSM_B_V_ANGLE_RAD = 1.16599


def _number(params: dict[str, object], name: str, default: float) -> float:
    """Read one finite positive dimensional parameter."""
    value = float(params.get(name, default))
    if value <= 0.0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _optional_non_negative(
    params: dict[str, object], name: str, default: float
) -> float:
    """Read a dimensional parameter that may be zero (air gap / clearance)."""
    value = float(params.get(name, default))
    if value < 0.0:
        raise ValueError(f"{name} must be greater than or equal to zero")
    return value


def ipmsm_stator_lamination(params: dict[str, object]) -> cq.Workplane:
    """Build a slotted interior-PM motor stator lamination.

    INTENT: provide recognisable, dimension-driven motor iron for electromagnetic
    training and package-layout work without copying a proprietary silhouette.
    """
    outer_diameter = _number(params, "outer_diameter", 269.24)
    bore_diameter = _number(params, "bore_diameter", 161.90)
    thickness = _number(params, "lamination_thickness", 0.50)
    slot_opening = _number(params, "slot_opening", 1.93)
    slot_width = _number(params, "slot_width", 8.00)
    slot_neck_depth = _number(params, "slot_neck_depth", 1.00)
    slot_depth = _number(params, "slot_depth", 34.30)
    slot_count = int(params.get("slot_count", 48))

    if outer_diameter <= bore_diameter:
        raise ValueError("outer_diameter must exceed bore_diameter")
    if slot_count < 3:
        raise ValueError("slot_count must be at least 3")
    if slot_width < slot_opening:
        raise ValueError("slot_width must be at least slot_opening")
    if slot_depth <= slot_neck_depth:
        raise ValueError("slot_depth must exceed slot_neck_depth")

    outer_radius = outer_diameter / 2.0
    bore_radius = bore_diameter / 2.0
    radial_build = outer_radius - bore_radius
    minimum_yoke = max(2.0, radial_build * 0.05)
    if slot_depth >= radial_build - minimum_yoke:
        raise ValueError(
            "slot_depth must leave a continuous outer yoke of at least "
            f"{minimum_yoke:.2f} mm"
        )

    lamination = (
        cq.Workplane("XY")
        .circle(outer_radius)
        .circle(bore_radius)
        .extrude(thickness)
    )

    # DECISION: a tapered radial pocket captures the functional slot opening,
    # neck, copper area and yoke without reproducing Pyleecan's SlotW11 code.
    start_radius = bore_radius - 0.25
    neck_radius = bore_radius + slot_neck_depth
    end_radius = bore_radius + slot_depth
    slot_profile = [
        (start_radius, -slot_opening / 2.0),
        (neck_radius, -slot_opening / 2.0),
        (end_radius, -slot_width / 2.0),
        (end_radius, slot_width / 2.0),
        (neck_radius, slot_opening / 2.0),
        (start_radius, slot_opening / 2.0),
    ]

    for index in range(slot_count):
        angle = 360.0 * index / slot_count
        cutter = (
            cq.Workplane("XY")
            .workplane(offset=-0.1)
            .transformed(rotate=(0.0, 0.0, angle))
            .polyline(slot_profile)
            .close()
            .extrude(thickness + 0.2)
        )
        lamination = lamination.cut(cutter)

    return lamination


def _line_circle_intersections(
    start: complex, end: complex, radius: float
) -> list[complex]:
    """Return intersections of the infinite line through start/end with |z|=radius."""
    dx = end.real - start.real
    dy = end.imag - start.imag
    a = dx * dx + dy * dy
    if a <= 0.0:
        return []
    b = 2.0 * (start.real * dx + start.imag * dy)
    c = start.real * start.real + start.imag * start.imag - radius * radius
    discriminant = b * b - 4.0 * a * c
    if discriminant < 0.0:
        return []
    root = math.sqrt(discriminant)
    points: list[complex] = []
    for sign in (1.0, -1.0):
        t = (-b + sign * root) / (2.0 * a)
        points.append(complex(start.real + t * dx, start.imag + t * dy))
    return points


def _pick_outer_quadrant_point(candidates: list[complex]) -> complex:
    """Pick the HoleM53 outer-bridge point in the lower-right quadrant."""
    for point in candidates:
        if point.imag < 0.0 and point.real > 0.0:
            return point
    raise ValueError("V-pocket outer bridge intersection not found")


def _hole_m53_pocket_polygons(
    *,
    outer_radius: float,
    slot_depth: float,
    bridge_thickness: float,
    magnet_pocket_width: float,
    magnet_pocket_depth: float,
    magnet_recess: float,
    v_angle_rad: float,
    tip_width: float,
    magnet_to_tip: float,
) -> list[list[tuple[float, float]]]:
    """Build one-pole magnet and tip void outlines from HoleM53 dimensions.

    INTENT: reproduce the IPMSM_B V-pocket envelope as training geometry using
    the published Apache-2.0 dimensional relationships, not OEM CAD.
    """
    # GOTCHA: these symbols match Pyleecan HoleM53 names so the 8-pole benchmark
    # can be checked against IPMSM_B.json without importing pyleecan.
    h0 = slot_depth
    h1 = bridge_thickness
    h2 = magnet_pocket_depth
    h3 = magnet_recess
    w1 = tip_width
    w2 = magnet_to_tip
    w3 = magnet_pocket_width
    w4 = v_angle_rad

    z7 = outer_radius - h0 - 1j * (w1 / 2.0)
    z6 = z7 - 1j * (h2 - h3) * math.cos(w4)
    z8 = z7 + (h2 - h3) * math.sin(w4)
    rotation = cmath.exp(-1j * w4)
    z5 = w2 * rotation + z6
    z4 = (w2 - 1j * h3) * rotation + z6
    z3 = (w2 + w3 - 1j * h3) * rotation + z6
    z2 = (w2 + w3) * rotation + z6
    z9 = (w2 + 1j * (h2 - h3)) * rotation + z6
    z10 = (w2 + w3 + 1j * (h2 - h3)) * rotation + z6
    z11 = _pick_outer_quadrant_point(
        _line_circle_intersections(z8, z10, outer_radius - h1)
    )
    z1 = _pick_outer_quadrant_point(
        _line_circle_intersections(z2, z6, outer_radius - h1)
    )

    def as_xy(point: complex) -> tuple[float, float]:
        return (point.real, point.imag)

    left_magnet = [as_xy(z3), as_xy(z4), as_xy(z9), as_xy(z10)]
    right_magnet = [
        as_xy(z3.conjugate()),
        as_xy(z4.conjugate()),
        as_xy(z9.conjugate()),
        as_xy(z10.conjugate()),
    ]
    tip = [as_xy(z6), as_xy(z7), as_xy(z6.conjugate())]
    # Outer flux-barrier voids between magnet and radial bridge.
    # Outer flux-barrier voids between magnet and radial bridge.
    left_bridge_air = [as_xy(z1), as_xy(z2), as_xy(z10), as_xy(z11)]
    right_bridge_air = [
        as_xy(z1.conjugate()),
        as_xy(z2.conjugate()),
        as_xy(z10.conjugate()),
        as_xy(z11.conjugate()),
    ]
    # z5 is the HoleM53 tip-air anchor when magnet_to_tip (W2) > 0.
    _ = z5
    return [left_magnet, right_magnet, tip, left_bridge_air, right_bridge_air]


def ipmsm_rotor_magnet_carrier(params: dict[str, object]) -> cq.Workplane:
    """Build an interior-PM rotor lamination with V-magnet pockets.

    INTENT: complete the stator air-gap pair with a dimensioned magnet carrier
    so packaging and electromagnetic training share one Apache-2.0 benchmark.
    """
    outer_diameter = _number(params, "outer_diameter", 160.40)
    shaft_diameter = _number(params, "shaft_diameter", 110.64)
    thickness = _number(params, "lamination_thickness", 0.50)
    bridge_thickness = _number(params, "bridge_thickness", 1.50)
    magnet_pocket_width = _number(params, "magnet_pocket_width", 17.00)
    magnet_pocket_depth = _number(params, "magnet_pocket_depth", 6.50)
    magnet_recess = _number(params, "magnet_recess", 1.00)
    slot_depth = _number(params, "slot_depth", 18.00)
    tip_width = _optional_non_negative(params, "tip_width", 0.0)
    magnet_to_tip = _optional_non_negative(params, "magnet_to_tip", 0.0)
    pole_pairs = int(params.get("pole_pairs", 4))
    if "v_angle_deg" in params:
        v_angle_rad = math.radians(_number(params, "v_angle_deg", 66.806))
    else:
        v_angle_rad = float(params.get("v_angle_rad", _IPMSM_B_V_ANGLE_RAD))
        if v_angle_rad <= 0.0:
            raise ValueError("v_angle_rad must be greater than zero")

    if outer_diameter <= shaft_diameter:
        raise ValueError("outer_diameter must exceed shaft_diameter")
    if pole_pairs < 1:
        raise ValueError("pole_pairs must be at least 1")
    if magnet_pocket_depth <= magnet_recess:
        raise ValueError("magnet_pocket_depth must exceed magnet_recess")
    if v_angle_rad >= math.pi / 2.0:
        raise ValueError("v_angle must stay below 90 degrees")

    outer_radius = outer_diameter / 2.0
    shaft_radius = shaft_diameter / 2.0
    if bridge_thickness >= outer_radius - shaft_radius:
        raise ValueError("bridge_thickness leaves no radial build for magnets")
    if slot_depth >= outer_radius - shaft_radius - bridge_thickness:
        raise ValueError(
            "slot_depth must leave a continuous shaft web inside the V tip"
        )

    pole_count = pole_pairs * 2
    polygons = _hole_m53_pocket_polygons(
        outer_radius=outer_radius,
        slot_depth=slot_depth,
        bridge_thickness=bridge_thickness,
        magnet_pocket_width=magnet_pocket_width,
        magnet_pocket_depth=magnet_pocket_depth,
        magnet_recess=magnet_recess,
        v_angle_rad=v_angle_rad,
        tip_width=tip_width,
        magnet_to_tip=magnet_to_tip,
    )
    innermost = min(math.hypot(x, y) for poly in polygons for x, y in poly)
    if innermost <= shaft_radius:
        raise ValueError("V-pockets would break through the shaft bore")

    lamination = (
        cq.Workplane("XY")
        .circle(outer_radius)
        .circle(shaft_radius)
        .extrude(thickness)
    )

    for index in range(pole_count):
        angle = 360.0 * index / pole_count
        for polygon in polygons:
            cutter = (
                cq.Workplane("XY")
                .workplane(offset=-0.1)
                .transformed(rotate=(0.0, 0.0, angle))
                .polyline(polygon)
                .close()
                .extrude(thickness + 0.2)
            )
            lamination = lamination.cut(cutter)

    return lamination


def planetary_gearset(params: dict[str, object]) -> cq.Workplane:
    """Build a parametric sun/planet/ring gearset for drivetrain training.

    INTENT: promote the educational cq_gears planetary example into a reusable
    forge-truth family with tooth counts, module, and face width as inputs.

    DECISION: cq_gears stays an optional import so stator/rotor families remain
    usable in the always-on CadQuery library without that dependency.
    """
    try:
        from cq_gears import PlanetaryGearset
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise ImportError(
            "planetary_gearset requires cq_gears "
            "(pip install -r assets/edu-training-cad/cq-gears-planetary/"
            "requirements.txt)"
        ) from exc

    module = _number(params, "module", 1.0)
    sun_teeth = int(params.get("sun_teeth", 12))
    planet_teeth = int(params.get("planet_teeth", 18))
    width = _number(params, "width", 10.0)
    rim_width = _number(params, "rim_width", 3.0)
    planet_count = int(params.get("planet_count", 3))
    bore_diameter = _number(params, "bore_diameter", 6.0)
    backlash = _optional_non_negative(params, "backlash", 0.0)
    pressure_angle = _number(params, "pressure_angle_deg", 20.0)

    if sun_teeth < 6:
        raise ValueError("sun_teeth must be at least 6")
    if planet_teeth < 6:
        raise ValueError("planet_teeth must be at least 6")
    if planet_count < 2:
        raise ValueError("planet_count must be at least 2")

    ring_teeth = sun_teeth + planet_teeth * 2
    # GOTCHA: even planet spacing needs (sun + planet) divisible by planet count
    # for clean meshing; reject rather than emit a silently broken set.
    if (sun_teeth + planet_teeth) % planet_count != 0:
        raise ValueError(
            "sun_teeth + planet_teeth must be divisible by planet_count "
            "for evenly spaced planets"
        )
    if ring_teeth % planet_count != 0 and sun_teeth % planet_count != 0:
        raise ValueError(
            "tooth counts are incompatible with equal planet spacing"
        )

    gearset = PlanetaryGearset(
        module=module,
        sun_teeth_number=sun_teeth,
        planet_teeth_number=planet_teeth,
        width=width,
        rim_width=rim_width,
        n_planets=planet_count,
        pressure_angle=pressure_angle,
        backlash=backlash,
        bore_d=bore_diameter,
    )
    return cq.Workplane("XY").gear(gearset)


def cold_plate_serpentine_hydraulics(params: dict[str, object]) -> dict[str, float | int]:
    """Emit rectangular-channel hydraulic scalars for the serpentine family.

    INTENT: packaging and early thermal seeds need Dh without claiming a CFD
    result — Dh = 2·w·d/(w+d) for a rectangular milled channel.
    """
    channel_width = _number(params, "channel_width", 5.345)
    channel_depth = _number(params, "channel_depth", 1.336)
    pitch = _number(params, "channel_pitch", 8.0)
    pass_count = int(params.get("pass_count", 8))
    if pass_count < 2:
        raise ValueError("pass_count must be at least 2")
    hydraulic_diameter = (
        2.0 * channel_width * channel_depth / (channel_width + channel_depth)
    )
    return {
        "pass_count": pass_count,
        "channel_width_mm": channel_width,
        "channel_depth_mm": channel_depth,
        "channel_pitch_mm": pitch,
        "hydraulic_diameter_mm": hydraulic_diameter,
        "fin_wall_mm": pitch - channel_width,
    }


def _resolve_cold_plate_params(
    params: dict[str, object],
) -> dict[str, float | int]:
    """Validate envelope / channel / port rules for the serpentine plate."""
    length = _number(params, "plate_length", 180.0)
    width = _number(params, "plate_width", 100.0)
    thickness = _number(params, "plate_thickness", 10.0)
    wall = _number(params, "wall", 3.0)
    channel_width = _number(params, "channel_width", 5.345)
    channel_depth = _number(params, "channel_depth", 1.336)
    pitch = _number(params, "channel_pitch", 8.0)
    pass_count = int(params.get("pass_count", 8))
    port_diameter = _number(params, "port_diameter", 6.0)
    default_port_spacing = (pass_count - 1) * pitch if pass_count >= 2 else pitch
    port_spacing = float(params.get("port_spacing", default_port_spacing))

    if pass_count < 2:
        raise ValueError("pass_count must be at least 2")
    if pitch <= channel_width:
        raise ValueError("channel_pitch must exceed channel_width (positive fin wall)")
    if channel_depth + wall > thickness:
        raise ValueError(
            "channel_depth + wall must not exceed plate_thickness "
            "(no floor breakout)"
        )
    channel_span = (pass_count - 1) * pitch + channel_width
    if channel_span + 2.0 * wall > width:
        raise ValueError(
            "pass_count/pitch/channel_width do not fit plate_width with wall margin"
        )
    if length < 2.0 * wall + 2.0 * channel_width:
        raise ValueError("plate_length too short for wall margins and end turns")
    if port_diameter >= thickness:
        raise ValueError("port_diameter must be less than plate_thickness")
    if abs(port_spacing - (pass_count - 1) * pitch) > 0.05:
        raise ValueError(
            "port_spacing must match (pass_count - 1) * channel_pitch "
            "so ports land on the serpentine ends"
        )
    # Side-port cylinder must keep a positive floor under the lowest point.
    z_mid = thickness / 2.0 - channel_depth / 2.0
    port_floor = z_mid - port_diameter / 2.0
    if port_floor < -thickness / 2.0 + wall * 0.25:
        raise ValueError(
            "port_diameter would break through the plate floor at the side ports"
        )

    return {
        "plate_length": length,
        "plate_width": width,
        "plate_thickness": thickness,
        "wall": wall,
        "channel_width": channel_width,
        "channel_depth": channel_depth,
        "channel_pitch": pitch,
        "pass_count": pass_count,
        "port_diameter": port_diameter,
        "port_spacing": port_spacing,
    }


def cold_plate_serpentine(params: dict[str, object]) -> cq.Workplane:
    """Build a milled serpentine inverter cold-plate blank (training geometry).

    INTENT: give forge-truth a parametric liquid cold-plate family for packaging
    and render authenticity. PINNeAPPle's through-channel is the training check
    only — this builder is ForgeOS source-owned serpentine geometry, not Lucid
    or race-team CAD, and not a CFD-proven release part.

    Channel is open from the top face (cover not modelled). Inlet/outlet ports
    exit one short edge at the first and last pass centre-lines.
    """
    p = _resolve_cold_plate_params(params)
    length = float(p["plate_length"])
    width = float(p["plate_width"])
    thickness = float(p["plate_thickness"])
    wall = float(p["wall"])
    channel_width = float(p["channel_width"])
    channel_depth = float(p["channel_depth"])
    pitch = float(p["channel_pitch"])
    pass_count = int(p["pass_count"])
    port_diameter = float(p["port_diameter"])

    plate = cq.Workplane("XY").box(length, width, thickness)
    y0 = -((pass_count - 1) * pitch) / 2.0
    pass_length = length - 2.0 * wall
    # Mill floor sits channel_depth below the top face.
    mill_z = thickness / 2.0 - channel_depth

    def mill_rect(cx: float, cy: float, sx: float, sy: float) -> cq.Workplane:
        return (
            cq.Workplane("XY")
            .workplane(offset=mill_z)
            .center(cx, cy)
            .rect(sx, sy)
            .extrude(channel_depth + 0.15)
        )

    cutter: cq.Workplane | None = None
    for index in range(pass_count):
        y = y0 + index * pitch
        segment = mill_rect(0.0, y, pass_length, channel_width)
        cutter = segment if cutter is None else cutter.union(segment)
        if index >= pass_count - 1:
            continue
        # End turn: even passes turn at +X, odd at -X.
        x_turn = (length / 2.0 - wall - channel_width / 2.0) * (
            1.0 if index % 2 == 0 else -1.0
        )
        y_turn = y + pitch / 2.0
        turn = mill_rect(x_turn, y_turn, channel_width, pitch + channel_width)
        cutter = cutter.union(turn)

    assert cutter is not None
    plate = plate.cut(cutter)

    # Side ports on the -X face into the first and last pass ends (even pass_count
    # puts both serpentine termini on the same short edge).
    z_mid = thickness / 2.0 - channel_depth / 2.0
    for y_port in (y0, y0 + (pass_count - 1) * pitch):
        port = (
            cq.Workplane("YZ")
            .workplane(offset=-length / 2.0 - 0.05)
            .center(y_port, z_mid)
            .circle(port_diameter / 2.0)
            .extrude(wall + channel_width + 0.2)
        )
        plate = plate.cut(port)

    return plate


TIER2_MOTOR_DRIVETRAIN = {
    "ipmsm_stator_lamination": {
        "function": ipmsm_stator_lamination,
        "name": "IPMSM Stator Lamination",
        "category": "motor",
        "default_colour": "#808080",
        "visual_tags": [
            "electrical_steel",
            "ipmsm",
            "lamination",
            "motor",
            "training_geometry",
        ],
        "param_schema": {
            "outer_diameter": {
                "type": "number", "default": 269.24, "min": 20.0, "unit": "mm"
            },
            "bore_diameter": {
                "type": "number", "default": 161.90, "min": 5.0, "unit": "mm"
            },
            "lamination_thickness": {
                "type": "number", "default": 0.50, "min": 0.1, "unit": "mm"
            },
            "slot_count": {
                "type": "integer", "default": 48, "min": 3
            },
            "slot_opening": {
                "type": "number", "default": 1.93, "min": 0.2, "unit": "mm"
            },
            "slot_width": {
                "type": "number", "default": 8.00, "min": 0.5, "unit": "mm"
            },
            "slot_neck_depth": {
                "type": "number", "default": 1.00, "min": 0.1, "unit": "mm"
            },
            "slot_depth": {
                "type": "number", "default": 34.30, "min": 0.5, "unit": "mm"
            },
        },
        "mounting_interfaces": [
            {
                "name": "rotor_airgap_bore",
                "type": "concentric_bore",
                "position": "centre",
            }
        ],
        "training_provenance": {
            "source_url": PYLEECAN_IPMSM_B_SOURCE,
            "source_revision": "7937d675fb77701ac8f2c65816b583cb29270e12",
            "licence": "Apache-2.0",
            "use": "dimensioned regression benchmark; not customer geometry",
        },
    },
    "ipmsm_rotor_magnet_carrier": {
        "function": ipmsm_rotor_magnet_carrier,
        "name": "IPMSM Rotor Magnet Carrier",
        "category": "motor",
        "default_colour": "#808080",
        "visual_tags": [
            "electrical_steel",
            "ipmsm",
            "lamination",
            "magnet_carrier",
            "motor",
            "training_geometry",
        ],
        "param_schema": {
            "outer_diameter": {
                "type": "number", "default": 160.40, "min": 20.0, "unit": "mm"
            },
            "shaft_diameter": {
                "type": "number", "default": 110.64, "min": 5.0, "unit": "mm"
            },
            "lamination_thickness": {
                "type": "number", "default": 0.50, "min": 0.1, "unit": "mm"
            },
            "pole_pairs": {
                "type": "integer", "default": 4, "min": 1
            },
            "v_angle_deg": {
                "type": "number", "default": 66.806, "min": 5.0, "unit": "deg"
            },
            "bridge_thickness": {
                "type": "number", "default": 1.50, "min": 0.2, "unit": "mm"
            },
            "magnet_pocket_width": {
                "type": "number", "default": 17.00, "min": 1.0, "unit": "mm"
            },
            "magnet_pocket_depth": {
                "type": "number", "default": 6.50, "min": 0.5, "unit": "mm"
            },
            "magnet_recess": {
                "type": "number", "default": 1.00, "min": 0.1, "unit": "mm"
            },
            "slot_depth": {
                "type": "number", "default": 18.00, "min": 1.0, "unit": "mm"
            },
            "tip_width": {
                "type": "number", "default": 0.0, "min": 0.0, "unit": "mm"
            },
            "magnet_to_tip": {
                "type": "number", "default": 0.0, "min": 0.0, "unit": "mm"
            },
        },
        "mounting_interfaces": [
            {
                "name": "shaft_bore",
                "type": "concentric_bore",
                "position": "centre",
            }
        ],
        "training_provenance": {
            "source_url": PYLEECAN_IPMSM_B_SOURCE,
            "source_revision": "7937d675fb77701ac8f2c65816b583cb29270e12",
            "licence": "Apache-2.0",
            "use": "HoleM53 V-pocket dimensional benchmark; not customer geometry",
        },
    },
    "planetary_gearset": {
        "function": planetary_gearset,
        "name": "Planetary Gearset",
        "category": "drivetrain",
        "default_colour": "#A0A0A0",
        "visual_tags": [
            "gear",
            "planetary",
            "drivetrain",
            "training_geometry",
        ],
        "param_schema": {
            "module": {
                "type": "number", "default": 1.0, "min": 0.2, "unit": "mm"
            },
            "sun_teeth": {
                "type": "integer", "default": 12, "min": 6
            },
            "planet_teeth": {
                "type": "integer", "default": 18, "min": 6
            },
            "width": {
                "type": "number", "default": 10.0, "min": 1.0, "unit": "mm"
            },
            "rim_width": {
                "type": "number", "default": 3.0, "min": 0.5, "unit": "mm"
            },
            "planet_count": {
                "type": "integer", "default": 3, "min": 2
            },
            "bore_diameter": {
                "type": "number", "default": 6.0, "min": 0.5, "unit": "mm"
            },
            "backlash": {
                "type": "number", "default": 0.0, "min": 0.0, "unit": "mm"
            },
            "pressure_angle_deg": {
                "type": "number", "default": 20.0, "min": 14.5, "unit": "deg"
            },
        },
        "mounting_interfaces": [
            {
                "name": "sun_bore",
                "type": "concentric_bore",
                "position": "centre",
            }
        ],
        "training_provenance": {
            "source_url": CQ_GEARS_PLANETARY_SOURCE,
            "source_revision": "e73874cf17a25447a99b1e7c22a4d5af38560e9c",
            "licence": "Apache-2.0",
            "use": "parametric planetary training geometry; not customer geometry",
        },
    },
    "cold_plate_serpentine": {
        "function": cold_plate_serpentine,
        "name": "Serpentine Cold Plate",
        "category": "thermal",
        "default_colour": "#B0B0B0",
        "visual_tags": [
            "aluminium",
            "cold_plate",
            "serpentine",
            "inverter",
            "training_geometry",
        ],
        "param_schema": {
            "plate_length": {
                "type": "number", "default": 180.0, "min": 20.0, "unit": "mm"
            },
            "plate_width": {
                "type": "number", "default": 100.0, "min": 20.0, "unit": "mm"
            },
            "plate_thickness": {
                "type": "number", "default": 10.0, "min": 3.0, "unit": "mm"
            },
            "wall": {
                "type": "number", "default": 3.0, "min": 0.5, "unit": "mm"
            },
            "channel_width": {
                "type": "number", "default": 5.345, "min": 0.5, "unit": "mm"
            },
            "channel_depth": {
                "type": "number", "default": 1.336, "min": 0.3, "unit": "mm"
            },
            "channel_pitch": {
                "type": "number", "default": 8.0, "min": 1.0, "unit": "mm"
            },
            "pass_count": {
                "type": "integer", "default": 8, "min": 2
            },
            "port_diameter": {
                "type": "number", "default": 6.0, "min": 1.0, "unit": "mm"
            },
            "port_spacing": {
                "type": "number", "default": 56.0, "min": 1.0, "unit": "mm"
            },
        },
        "mounting_interfaces": [
            {
                "name": "coolant_inlet",
                "type": "port",
                "position": "short_edge_minus_x",
            },
            {
                "name": "coolant_outlet",
                "type": "port",
                "position": "short_edge_minus_x",
            },
            {
                "name": "module_mount_face",
                "type": "planar_face",
                "position": "top",
            },
        ],
        "training_provenance": {
            "source_url": PINNEAPPLE_COLD_PLATE_TRAINING_CHECK,
            "source_revision": "78c6357e5aa38802c99f8c3329dea6c13606ca5e",
            "licence": "Apache-2.0",
            "use": (
                "PINNeAPPle through-channel is a training check only; "
                "serpentine solid is ForgeOS source-owned — not release CAD"
            ),
        },
    },
}


def _export_and_assert_substantial(
    model: cq.Workplane, family: str, temp_root: Path
) -> tuple[int, int]:
    """Write STEP/STL and require both files exceed 1 KB."""
    output_dir = temp_root / family
    output_dir.mkdir(parents=True, exist_ok=True)
    step_path = output_dir / f"{family}.step"
    stl_path = output_dir / f"{family}.stl"
    cq.exporters.export(model, str(step_path))
    cq.exporters.export(model, str(stl_path), tolerance=0.05)
    step_size = step_path.stat().st_size
    stl_size = stl_path.stat().st_size
    assert step_size > 1024, f"{family} STEP too small: {step_size}"
    assert stl_size > 1024, f"{family} STL too small: {stl_size}"
    return step_size, stl_size


def _selftest_stator(temp_root: Path) -> None:
    """Export both exchange formats and prove the generated solids are substantial."""
    model = ipmsm_stator_lamination({})
    bbox = model.val().BoundingBox()
    assert model.solids().size() == 1
    assert abs(bbox.xlen - 269.24) < 0.1
    assert abs(bbox.ylen - 269.24) < 0.1
    assert abs(bbox.zlen - 0.50) < 0.01
    step_size, stl_size = _export_and_assert_substantial(
        model, "ipmsm_stator_lamination", temp_root
    )
    print(
        "[ipmsm-stator] selftest PASS: "
        f"STEP={step_size} bytes, STL={stl_size} bytes"
    )


def _selftest_rotor(temp_root: Path) -> None:
    """Prove the 8-pole IPMSM_B V-pocket carrier keeps bridge and shaft web."""
    model = ipmsm_rotor_magnet_carrier({})
    bbox = model.val().BoundingBox()
    assert model.solids().size() == 1
    assert abs(bbox.xlen - 160.40) < 0.1
    assert abs(bbox.ylen - 160.40) < 0.1
    assert abs(bbox.zlen - 0.50) < 0.01

    annulus_volume = math.pi * ((160.40 / 2.0) ** 2 - (110.64 / 2.0) ** 2) * 0.50
    carrier_volume = model.val().Volume()
    assert carrier_volume < annulus_volume * 0.95
    assert carrier_volume > annulus_volume * 0.70

    # Bridge + shaft-web geometry check against IPMSM_B HoleM53 defaults.
    polygons = _hole_m53_pocket_polygons(
        outer_radius=80.20,
        slot_depth=18.00,
        bridge_thickness=1.50,
        magnet_pocket_width=17.00,
        magnet_pocket_depth=6.50,
        magnet_recess=1.00,
        v_angle_rad=_IPMSM_B_V_ANGLE_RAD,
        tip_width=0.0,
        magnet_to_tip=0.0,
    )
    outer_faces = [math.hypot(x, y) for poly in polygons[:2] for x, y in poly]
    assert max(outer_faces) <= 80.20 - 1.50 + 0.05
    innermost = min(math.hypot(x, y) for poly in polygons for x, y in poly)
    assert innermost > 110.64 / 2.0

    step_size, stl_size = _export_and_assert_substantial(
        model, "ipmsm_rotor_magnet_carrier", temp_root
    )
    print(
        "[ipmsm-rotor] selftest PASS: "
        f"STEP={step_size} bytes, STL={stl_size} bytes, "
        f"volume_ratio={carrier_volume / annulus_volume:.3f}"
    )


def _selftest_planetary(temp_root: Path) -> None:
    """Prove tooth compatibility and substantial STEP/STL rebuild."""
    model = planetary_gearset({})
    bbox = model.val().BoundingBox()
    solid_count = model.solids().size()
    # Sun + ring + N planets (compound may report N+2 solids).
    assert solid_count >= 4
    assert bbox.zlen >= 9.5
    # Pitch geometry: ring teeth = sun + 2*planet = 48; OD roughly module*(ring+2).
    assert bbox.xlen > 40.0
    assert bbox.ylen > 40.0

    step_size, stl_size = _export_and_assert_substantial(
        model, "planetary_gearset", temp_root
    )
    print(
        "[planetary-gearset] selftest PASS: "
        f"solids={solid_count}, STEP={step_size} bytes, STL={stl_size} bytes"
    )


def _selftest_cold_plate(temp_root: Path) -> None:
    """Prove continuous serpentine, positive walls, Dh emission, STEP/STL >1 KB."""
    hyd = cold_plate_serpentine_hydraulics({})
    assert hyd["pass_count"] == 8
    assert hyd["fin_wall_mm"] > 0.0
    expected_dh = 2.0 * 5.345 * 1.336 / (5.345 + 1.336)
    assert abs(float(hyd["hydraulic_diameter_mm"]) - expected_dh) < 1e-6

    model = cold_plate_serpentine({})
    bbox = model.val().BoundingBox()
    assert model.solids().size() == 1
    assert abs(bbox.xlen - 180.0) < 0.1
    assert abs(bbox.ylen - 100.0) < 0.1
    assert abs(bbox.zlen - 10.0) < 0.1

    solid_volume = model.val().Volume()
    envelope_volume = 180.0 * 100.0 * 10.0
    assert solid_volume < envelope_volume * 0.98
    assert solid_volume > envelope_volume * 0.70

    # Reject channel floor breakout and zero fin wall.
    try:
        cold_plate_serpentine({"channel_depth": 9.0, "wall": 3.0, "plate_thickness": 10.0})
        raise AssertionError("expected floor-breakout rejection")
    except ValueError as exc:
        assert "floor" in str(exc).lower() or "plate_thickness" in str(exc)

    try:
        cold_plate_serpentine({"channel_width": 8.0, "channel_pitch": 8.0})
        raise AssertionError("expected pitch/width rejection")
    except ValueError as exc:
        assert "pitch" in str(exc).lower() or "channel_width" in str(exc)

    step_size, stl_size = _export_and_assert_substantial(
        model, "cold_plate_serpentine", temp_root
    )
    print(
        "[cold-plate-serpentine] selftest PASS: "
        f"Dh={hyd['hydraulic_diameter_mm']:.3f} mm, "
        f"STEP={step_size} bytes, STL={stl_size} bytes"
    )


def _selftest() -> int:
    """Run all educational motor/drivetrain family self-tests."""
    with tempfile.TemporaryDirectory(prefix="forge-motor-drivetrain-") as temp_dir:
        temp_root = Path(temp_dir)
        _selftest_stator(temp_root)
        _selftest_rotor(temp_root)
        _selftest_planetary(temp_root)
        _selftest_cold_plate(temp_root)
    return 0


def main() -> int:
    """Run command-line verification for this family module."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if not args.selftest:
        parser.print_help()
        return 2
    return _selftest()


if __name__ == "__main__":
    raise SystemExit(main())
