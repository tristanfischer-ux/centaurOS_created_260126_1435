"""ForgeOS Tier 2 motor/drivetrain CAD families.

Default stator and rotor dimensions are training benchmarks derived from
Pyleecan's Apache-2.0 IPMSM_B definition at revision
7937d675fb77701ac8f2c65816b583cb29270e12. The planetary defaults follow the
cq_gears Apache-2.0 three-planet example at revision
e73874cf17a25447a99b1e7c22a4d5af38560e9c. The serpentine cold plate is
ForgeOS source-owned geometry; PINNeAPPle revision 78c635… is an Apache-2.0
training check only. The motor water-jacket helical family is ForgeOS
source-owned annular-channel geometry for packaging / hydraulic screening —
not cast-case release CAD. These are universal parametric geometries, not
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

    # DECISION (2026-07-30): defaults match the FIA front-kit strength-driven
    # packaging resize (ISO 6336 screen FoS ≥ 1.2): m=1.0, face=58, S/P=18/54,
    # 4 planets, ratio 8. Older 12/18/10/3 training seeds remain valid when passed
    # explicitly as params.
    module = _number(params, "module", 1.0)
    sun_teeth = int(params.get("sun_teeth", 18))
    planet_teeth = int(params.get("planet_teeth", 54))
    width = _number(params, "width", 58.0)
    rim_width = _number(params, "rim_width", 3.0)
    planet_count = int(params.get("planet_count", 4))
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
    # GOTCHA: even planet spacing needs (sun + planet) and (sun + ring)
    # divisible by planet count. Do NOT require sun%n and ring%n individually
    # (FIA kit S/P/R=18/54/126 with n=4: 18%4≠0 but (18+126)%4==0 — valid).
    if (sun_teeth + planet_teeth) % planet_count != 0:
        raise ValueError(
            "sun_teeth + planet_teeth must be divisible by planet_count "
            "for evenly spaced planets"
        )
    if (sun_teeth + ring_teeth) % planet_count != 0:
        raise ValueError(
            "sun_teeth + ring_teeth must be divisible by planet_count "
            "for evenly spaced planets"
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


def _resolve_post_diff_final_drive_params(
    params: dict[str, object],
) -> dict[str, float | int]:
    """Validate the dual post-differential helical-stage geometry."""
    normal_module = _number(params, "normal_module", 1.15)
    pinion_teeth = int(params.get("pinion_teeth", 18))
    wheel_teeth = int(params.get("wheel_teeth", 72))
    width = _number(params, "width", 22.0)
    helix_angle = _number(params, "helix_angle_deg", 20.0)
    pressure_angle = _number(params, "pressure_angle_deg", 20.0)
    input_bore = _number(params, "input_bore_diameter", 12.0)
    output_bore = _number(params, "output_bore_diameter", 20.0)
    diff_clear_span = _number(params, "diff_clear_span", 108.0)
    backlash = _optional_non_negative(params, "backlash", 0.05)
    ratio_target = _number(params, "ratio_target", 4.0)
    ratio_tolerance = _number(params, "ratio_tolerance", 0.10)
    pair_count = int(params.get("pair_count", 2))

    if pinion_teeth < 12 or wheel_teeth < 12:
        raise ValueError("pinion_teeth and wheel_teeth must each be at least 12")
    if pair_count != 2:
        raise ValueError(
            "pair_count must be 2 so both differential outputs retain reduction"
        )
    if helix_angle >= 45.0:
        raise ValueError("helix_angle_deg must stay below 45 degrees")
    ratio = wheel_teeth / pinion_teeth
    if abs(ratio - ratio_target) > ratio_tolerance:
        raise ValueError(
            f"tooth-count ratio {ratio:.4f} does not match ratio_target "
            f"{ratio_target:.4f} within ratio_tolerance {ratio_tolerance:.4f}"
        )

    transverse_module = normal_module / math.cos(math.radians(helix_angle))
    pinion_root_diameter = transverse_module * max(pinion_teeth - 2.5, 1.0)
    wheel_root_diameter = transverse_module * max(wheel_teeth - 2.5, 1.0)
    if input_bore >= pinion_root_diameter:
        raise ValueError("input_bore_diameter must stay inside the pinion root")
    if output_bore >= wheel_root_diameter:
        raise ValueError("output_bore_diameter must stay inside the wheel root")

    return {
        "normal_module": normal_module,
        "transverse_module": transverse_module,
        "pinion_teeth": pinion_teeth,
        "wheel_teeth": wheel_teeth,
        "width": width,
        "helix_angle_deg": helix_angle,
        "pressure_angle_deg": pressure_angle,
        "input_bore_diameter": input_bore,
        "output_bore_diameter": output_bore,
        "diff_clear_span": diff_clear_span,
        "backlash": backlash,
        "ratio": ratio,
        "ratio_target": ratio_target,
        "ratio_tolerance": ratio_tolerance,
        "pair_count": pair_count,
        "center_distance": transverse_module * (pinion_teeth + wheel_teeth) / 2.0,
    }


def post_diff_final_drive_helical_metrics(
    params: dict[str, object],
) -> dict[str, float | int]:
    """Emit ratio and pitch geometry for the dual post-differential stage.

    INTENT: Keep the analytical packaging screen and rebuildable tooth geometry
    tied to the same ratio-four, 18:72 dimensional contract.
    """
    p = _resolve_post_diff_final_drive_params(params)
    transverse_module = float(p["transverse_module"])
    return {
        "pair_count": int(p["pair_count"]),
        "ratio": float(p["ratio"]),
        "normal_module_mm": float(p["normal_module"]),
        "transverse_module_mm": transverse_module,
        "pinion_teeth": int(p["pinion_teeth"]),
        "wheel_teeth": int(p["wheel_teeth"]),
        "pinion_pitch_diameter_mm": transverse_module * int(p["pinion_teeth"]),
        "wheel_pitch_diameter_mm": transverse_module * int(p["wheel_teeth"]),
        "center_distance_mm": float(p["center_distance"]),
        "face_width_mm": float(p["width"]),
        "diff_clear_span_mm": float(p["diff_clear_span"]),
    }


def post_diff_final_drive_helical(params: dict[str, object]) -> cq.Workplane:
    """Build two mirrored 4:1 parallel-axis helical gear pairs.

    INTENT: Provide real tooth geometry for the reduction after an open
    differential, so each side output retains differential action while gaining
    the selected ratio. This is concept CAD for packaging and interfaces, not
    ISO 6336/AGMA strength, bearing-life, lubrication, or release authority.

    DECISION: cq_gears ``SpurGear`` generates both spur and helical solids; signed
    helix angles provide opposite hands within each external mesh. The two pairs
    sit on opposite sides of the differential clear span.
    """
    try:
        from cq_gears import SpurGear
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise ImportError(
            "post_diff_final_drive_helical requires cq_gears "
            "(pip install -r assets/edu-training-cad/cq-gears-planetary/"
            "requirements.txt)"
        ) from exc

    p = _resolve_post_diff_final_drive_params(params)
    transverse_module = float(p["transverse_module"])
    width = float(p["width"])
    center_distance = float(p["center_distance"])
    diff_clear_span = float(p["diff_clear_span"])
    pressure_angle = float(p["pressure_angle_deg"])
    helix_angle = float(p["helix_angle_deg"])
    backlash = float(p["backlash"])

    solids: list[cq.Shape] = []
    for side_index, z_offset in enumerate(
        (-diff_clear_span / 2.0 - width, diff_clear_span / 2.0)
    ):
        hand = 1.0 if side_index == 0 else -1.0
        pinion = (
            cq.Workplane("XY")
            .gear(
                SpurGear(
                    module=transverse_module,
                    teeth_number=int(p["pinion_teeth"]),
                    width=width,
                    pressure_angle=pressure_angle,
                    helix_angle=hand * helix_angle,
                    backlash=backlash,
                    bore_d=float(p["input_bore_diameter"]),
                )
            )
            .translate((0.0, 0.0, z_offset))
        )
        wheel = (
            cq.Workplane("XY")
            .gear(
                SpurGear(
                    module=transverse_module,
                    teeth_number=int(p["wheel_teeth"]),
                    width=width,
                    pressure_angle=pressure_angle,
                    helix_angle=-hand * helix_angle,
                    backlash=backlash,
                    bore_d=float(p["output_bore_diameter"]),
                )
            )
            .translate((0.0, center_distance, z_offset))
        )
        solids.extend((pinion.val(), wheel.val()))

    return cq.Workplane(obj=cq.Compound.makeCompound(solids))


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


def motor_water_jacket_helical_hydraulics(
    params: dict[str, object],
) -> dict[str, float | int]:
    """Emit rectangular-channel hydraulic scalars for the helical jacket family.

    INTENT: packaging and OpenFOAM duct screens need Dh and developed length
    without claiming conjugate heat transfer or winding temperatures.
    """
    p = _resolve_motor_water_jacket_params(params)
    channel_width = float(p["channel_width"])
    channel_depth = float(p["channel_depth"])
    hydraulic_diameter = (
        2.0 * channel_width * channel_depth / (channel_width + channel_depth)
    )
    r_mid = float(p["channel_mean_radius"])
    pitch = float(p["helix_pitch"])
    turns = float(p["helix_turns"])
    one_turn_length = math.hypot(2.0 * math.pi * r_mid, pitch)
    developed_length = one_turn_length * turns
    return {
        "helix_turns": int(p["helix_turns"]),
        "channel_width_mm": channel_width,
        "channel_depth_mm": channel_depth,
        "hydraulic_diameter_mm": hydraulic_diameter,
        "channel_mean_diameter_mm": 2.0 * r_mid,
        "helix_pitch_mm": pitch,
        "one_turn_developed_length_mm": one_turn_length,
        "developed_length_mm": developed_length,
        "flow_topology": 1,  # series single helical channel (int flag for exporters)
    }


def _resolve_motor_water_jacket_params(
    params: dict[str, object],
) -> dict[str, float | int]:
    """Validate annular envelope / helical channel rules for the jacket family.

    Defaults track a compact traction housing envelope (OD≈176.7 mm,
    L≈140.5 mm, stator OD≈164.7 mm) — universal sizing seeds, not a named
    product family.
    """
    housing_od = _number(params, "housing_outer_diameter", 176.7)
    jacket_id = _number(params, "jacket_inner_diameter", 164.7)
    axial_length = _number(params, "axial_length", 140.5)
    channel_width = _number(params, "channel_width", 8.0)
    channel_depth = _number(params, "channel_depth", 3.5)
    outer_shell = _number(params, "outer_shell", 1.25)
    helix_turns = float(params.get("helix_turns", 5))
    end_margin = _number(params, "end_margin", 8.0)
    port_diameter = _number(params, "port_diameter", 8.0)
    segment_count = int(params.get("segment_count", 56))

    if helix_turns < 2.0:
        raise ValueError("helix_turns must be at least 2")
    if segment_count < 24:
        raise ValueError("segment_count must be at least 24 for a continuous channel")
    if jacket_id >= housing_od:
        raise ValueError("jacket_inner_diameter must be less than housing_outer_diameter")
    radial_wall = (housing_od - jacket_id) / 2.0
    if channel_depth + outer_shell >= radial_wall:
        raise ValueError(
            "channel_depth + outer_shell must leave a positive inner bridge "
            "inside the annular wall"
        )
    inner_bridge = radial_wall - channel_depth - outer_shell
    if inner_bridge < 0.4:
        raise ValueError("inner bridge under channel is too thin (<0.4 mm)")
    if 2.0 * end_margin >= axial_length:
        raise ValueError("end_margin leaves no active helical length")
    active_length = axial_length - 2.0 * end_margin
    pitch = active_length / helix_turns
    if pitch <= channel_width + 1.0:
        raise ValueError(
            "helix pitch must exceed channel_width with land clearance "
            "(reduce helix_turns or channel_width)"
        )
    if port_diameter >= axial_length / 2.0:
        raise ValueError("port_diameter too large for axial_length")
    if port_diameter > radial_wall * 1.8:
        raise ValueError("port_diameter would oversize relative to annular wall")

    channel_mean_radius = jacket_id / 2.0 + inner_bridge + channel_depth / 2.0
    return {
        "housing_outer_diameter": housing_od,
        "jacket_inner_diameter": jacket_id,
        "axial_length": axial_length,
        "channel_width": channel_width,
        "channel_depth": channel_depth,
        "outer_shell": outer_shell,
        "inner_bridge": inner_bridge,
        "radial_wall": radial_wall,
        "helix_turns": helix_turns,
        "end_margin": end_margin,
        "helix_pitch": pitch,
        "active_length": active_length,
        "port_diameter": port_diameter,
        "segment_count": segment_count,
        "channel_mean_radius": channel_mean_radius,
    }


def motor_water_jacket_helical(params: dict[str, object]) -> cq.Workplane:
    """Build an annular motor water-jacket with a helical coolant channel.

    INTENT: give forge-truth a parametric liquid jacket family for packaging,
    cooling cutaways, and hydraulic screening. ForgeOS source-owned — not a
    cast-case release solid and not OEM / race-team CAD.

    The channel is approximated as overlapping pitched boxes along a helix so
    CadQuery stays robust without a fragile Frenet sweep. Inlet/outlet ports
    are radial holes at the helix termini.
    """
    p = _resolve_motor_water_jacket_params(params)
    housing_od = float(p["housing_outer_diameter"])
    jacket_id = float(p["jacket_inner_diameter"])
    axial_length = float(p["axial_length"])
    channel_width = float(p["channel_width"])
    channel_depth = float(p["channel_depth"])
    helix_turns = float(p["helix_turns"])
    end_margin = float(p["end_margin"])
    active_length = float(p["active_length"])
    pitch = float(p["helix_pitch"])
    port_diameter = float(p["port_diameter"])
    segment_count = int(p["segment_count"])
    r_mid = float(p["channel_mean_radius"])

    shell = (
        cq.Workplane("XY")
        .circle(housing_od / 2.0)
        .circle(jacket_id / 2.0)
        .extrude(axial_length)
    )

    total_angle = 2.0 * math.pi * helix_turns
    pitch_angle = math.atan2(pitch, 2.0 * math.pi * r_mid)
    seg_len = (
        math.hypot(r_mid * total_angle / segment_count, active_length / segment_count)
        * 1.25
    )

    cutter: cq.Workplane | None = None
    for index in range(segment_count):
        t = (index + 0.5) / segment_count
        angle = total_angle * t
        z = end_margin + active_length * t
        segment = (
            cq.Workplane("XY")
            .transformed(
                rotate=(math.degrees(pitch_angle), 0.0, math.degrees(angle)),
                offset=(r_mid * math.cos(angle), r_mid * math.sin(angle), z),
            )
            .box(
                channel_depth + 0.35,
                seg_len,
                channel_width,
                centered=(True, True, True),
            )
        )
        cutter = segment if cutter is None else cutter.union(segment)

    assert cutter is not None
    jacket = shell.cut(cutter)

    # Radial ports at helix start / end (into the channel band).
    for angle, z_port in (
        (0.0, end_margin),
        (total_angle, end_margin + active_length),
    ):
        ux = math.cos(angle)
        uy = math.sin(angle)
        port = (
            cq.Workplane("XY")
            .transformed(
                rotate=(0.0, 90.0, math.degrees(angle)),
                offset=(
                    (housing_od / 2.0) * ux,
                    (housing_od / 2.0) * uy,
                    z_port,
                ),
            )
            .circle(port_diameter / 2.0)
            .extrude(-(float(p["radial_wall"]) + 0.4))
        )
        jacket = jacket.cut(port)

    return jacket


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
                "type": "integer", "default": 18, "min": 6
            },
            "planet_teeth": {
                "type": "integer", "default": 54, "min": 6
            },
            "width": {
                "type": "number", "default": 58.0, "min": 1.0, "unit": "mm"
            },
            "rim_width": {
                "type": "number", "default": 3.0, "min": 0.5, "unit": "mm"
            },
            "planet_count": {
                "type": "integer", "default": 4, "min": 2
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
    "post_diff_final_drive_helical": {
        "function": post_diff_final_drive_helical,
        "name": "Post-Differential Final Drive — Dual Helical",
        "category": "drivetrain",
        "default_colour": "#989898",
        "visual_tags": [
            "gear",
            "helical",
            "final_drive",
            "post_differential",
            "drivetrain",
            "training_geometry",
        ],
        "param_schema": {
            "normal_module": {
                "type": "number", "default": 1.15, "min": 0.2, "unit": "mm"
            },
            "pinion_teeth": {
                "type": "integer", "default": 18, "min": 12
            },
            "wheel_teeth": {
                "type": "integer", "default": 72, "min": 12
            },
            "width": {
                "type": "number", "default": 22.0, "min": 2.0, "unit": "mm"
            },
            "helix_angle_deg": {
                "type": "number", "default": 20.0, "min": 1.0, "unit": "deg"
            },
            "pressure_angle_deg": {
                "type": "number", "default": 20.0, "min": 14.5, "unit": "deg"
            },
            "input_bore_diameter": {
                "type": "number", "default": 12.0, "min": 1.0, "unit": "mm"
            },
            "output_bore_diameter": {
                "type": "number", "default": 20.0, "min": 1.0, "unit": "mm"
            },
            "diff_clear_span": {
                "type": "number", "default": 108.0, "min": 20.0, "unit": "mm"
            },
            "backlash": {
                "type": "number", "default": 0.05, "min": 0.0, "unit": "mm"
            },
            "ratio_target": {
                "type": "number", "default": 4.0, "min": 1.0
            },
            "ratio_tolerance": {
                "type": "number", "default": 0.10, "min": 0.001
            },
            "pair_count": {
                "type": "integer", "default": 2, "min": 2, "max": 2
            },
        },
        "mounting_interfaces": [
            {
                "name": "differential_side_output_bores",
                "type": "dual_concentric_bore",
                "position": "pinion_axes_opposite_sides",
            },
            {
                "name": "halfshaft_output_bores",
                "type": "dual_concentric_bore",
                "position": "wheel_axes_opposite_sides",
            },
        ],
        "training_provenance": {
            "source_url": CQ_GEARS_PLANETARY_SOURCE,
            "source_revision": "e73874cf17a25447a99b1e7c22a4d5af38560e9c",
            "licence": "Apache-2.0",
            "use": (
                "cq_gears tooth generator with ForgeOS-owned dual-stage layout; "
                "ratio-four concept CAD, not customer or release geometry"
            ),
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
    "motor_water_jacket_helical": {
        "function": motor_water_jacket_helical,
        "name": "Motor Water Jacket Helical",
        "category": "thermal",
        "default_colour": "#8FA8B8",
        "visual_tags": [
            "aluminium",
            "water_jacket",
            "helical",
            "motor",
            "training_geometry",
        ],
        "param_schema": {
            "housing_outer_diameter": {
                "type": "number", "default": 176.7, "min": 40.0, "unit": "mm"
            },
            "jacket_inner_diameter": {
                "type": "number", "default": 164.7, "min": 20.0, "unit": "mm"
            },
            "axial_length": {
                "type": "number", "default": 140.5, "min": 30.0, "unit": "mm"
            },
            "channel_width": {
                "type": "number", "default": 8.0, "min": 1.0, "unit": "mm"
            },
            "channel_depth": {
                "type": "number", "default": 3.5, "min": 0.5, "unit": "mm"
            },
            "outer_shell": {
                "type": "number", "default": 1.25, "min": 0.4, "unit": "mm"
            },
            "helix_turns": {
                "type": "number", "default": 5.0, "min": 2.0
            },
            "end_margin": {
                "type": "number", "default": 8.0, "min": 2.0, "unit": "mm"
            },
            "port_diameter": {
                "type": "number", "default": 8.0, "min": 2.0, "unit": "mm"
            },
            "segment_count": {
                "type": "integer", "default": 56, "min": 24
            },
        },
        "mounting_interfaces": [
            {
                "name": "coolant_inlet",
                "type": "port",
                "position": "radial_helix_start",
            },
            {
                "name": "coolant_outlet",
                "type": "port",
                "position": "radial_helix_end",
            },
            {
                "name": "stator_bore",
                "type": "concentric_bore",
                "position": "inner_diameter",
            },
        ],
        "training_provenance": {
            "source_url": None,
            "source_revision": None,
            "licence": "ForgeOS-source-owned",
            "use": (
                "ForgeOS source-owned helical jacket blank for packaging / "
                "hydraulic screening — not cast-case release CAD"
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
    # Defaults: FIA kit strength resize — S/P/R=18/54/126, n=4, face=58.
    assert solid_count >= 5
    assert bbox.zlen >= 57.0
    # Ring tip ≈ module*(ring+2.5) ≈ 128.5 mm → bbox > 100 mm.
    assert bbox.xlen > 100.0
    assert bbox.ylen > 100.0

    step_size, stl_size = _export_and_assert_substantial(
        model, "planetary_gearset", temp_root
    )
    print(
        "[planetary-gearset] selftest PASS: "
        f"solids={solid_count}, STEP={step_size} bytes, STL={stl_size} bytes"
    )


def _selftest_post_diff_final_drive(temp_root: Path) -> None:
    """Prove ratio-four dual meshes fit the screened envelope and export."""
    metrics = post_diff_final_drive_helical_metrics({})
    assert metrics["pair_count"] == 2
    assert abs(float(metrics["ratio"]) - 4.0) < 1e-9

    model = post_diff_final_drive_helical({})
    bbox = model.val().BoundingBox()
    assert model.solids().size() == 4
    # Packaging-screen axes: lateral width=Z, short edge=X, height=Y.
    assert bbox.zlen <= 192.0
    assert bbox.xlen <= 172.2782
    assert bbox.ylen <= 132.0

    try:
        post_diff_final_drive_helical(
            {"pinion_teeth": 19, "wheel_teeth": 72, "ratio_target": 4.0}
        )
        raise AssertionError("expected ratio mismatch rejection")
    except ValueError as exc:
        assert "ratio" in str(exc).lower()

    step_size, stl_size = _export_and_assert_substantial(
        model, "post_diff_final_drive_helical", temp_root
    )
    print(
        "[post-diff-final-drive-helical] selftest PASS: "
        f"ratio={metrics['ratio']:.3f}, solids=4, "
        f"envelope={bbox.zlen:.1f}×{bbox.xlen:.1f}×{bbox.ylen:.1f} mm, "
        f"STEP={step_size} bytes, STL={stl_size} bytes"
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


def _selftest_water_jacket(temp_root: Path) -> None:
    """Prove annular helix, positive bridges, Dh / developed length, STEP/STL."""
    hyd = motor_water_jacket_helical_hydraulics({})
    assert int(hyd["helix_turns"]) == 5
    expected_dh = 2.0 * 8.0 * 3.5 / (8.0 + 3.5)
    assert abs(float(hyd["hydraulic_diameter_mm"]) - expected_dh) < 1e-6
    assert float(hyd["developed_length_mm"]) > float(hyd["one_turn_developed_length_mm"])

    model = motor_water_jacket_helical({})
    bbox = model.val().BoundingBox()
    assert model.solids().size() == 1
    assert abs(bbox.xlen - 176.7) < 0.3
    assert abs(bbox.ylen - 176.7) < 0.3
    assert abs(bbox.zlen - 140.5) < 0.3

    solid_volume = model.val().Volume()
    envelope_volume = math.pi * ((176.7 / 2.0) ** 2 - (164.7 / 2.0) ** 2) * 140.5
    assert solid_volume < envelope_volume * 0.95
    assert solid_volume > envelope_volume * 0.55

    try:
        motor_water_jacket_helical(
            {"channel_depth": 5.5, "outer_shell": 1.0, "housing_outer_diameter": 176.7,
             "jacket_inner_diameter": 164.7}
        )
        raise AssertionError("expected inner-bridge rejection")
    except ValueError as exc:
        assert "bridge" in str(exc).lower() or "outer_shell" in str(exc)

    try:
        motor_water_jacket_helical({"helix_turns": 20, "channel_width": 8.0})
        raise AssertionError("expected pitch/width rejection")
    except ValueError as exc:
        assert "pitch" in str(exc).lower() or "channel_width" in str(exc)

    step_size, stl_size = _export_and_assert_substantial(
        model, "motor_water_jacket_helical", temp_root
    )
    print(
        "[motor-water-jacket-helical] selftest PASS: "
        f"Dh={hyd['hydraulic_diameter_mm']:.3f} mm, "
        f"L_dev={hyd['developed_length_mm']:.1f} mm, "
        f"STEP={step_size} bytes, STL={stl_size} bytes"
    )


def _selftest() -> int:
    """Run all educational motor/drivetrain family self-tests."""
    with tempfile.TemporaryDirectory(prefix="forge-motor-drivetrain-") as temp_dir:
        temp_root = Path(temp_dir)
        _selftest_stator(temp_root)
        _selftest_rotor(temp_root)
        _selftest_planetary(temp_root)
        _selftest_post_diff_final_drive(temp_root)
        _selftest_cold_plate(temp_root)
        _selftest_water_jacket(temp_root)
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
