"""ForgeOS Tier 2 motor/drivetrain CAD families.

The default stator dimensions are a training benchmark derived from Pyleecan's
Apache-2.0 IPMSM_B definition at revision
7937d675fb77701ac8f2c65816b583cb29270e12. This is universal parametric
geometry, not an original-equipment-manufacturer or race-vehicle part.
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import cadquery as cq


PYLEECAN_IPMSM_B_SOURCE = (
    "https://github.com/Eomys/pyleecan/blob/"
    "7937d675fb77701ac8f2c65816b583cb29270e12/"
    "pyleecan/Data/Machine/IPMSM_B.json"
)


def _number(params: dict[str, object], name: str, default: float) -> float:
    """Read one finite positive dimensional parameter."""
    value = float(params.get(name, default))
    if value <= 0.0:
        raise ValueError(f"{name} must be greater than zero")
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
    }
}


def _selftest() -> int:
    """Export both exchange formats and prove the generated solids are substantial."""
    model = ipmsm_stator_lamination({})
    bbox = model.val().BoundingBox()
    assert model.solids().size() == 1
    assert abs(bbox.xlen - 269.24) < 0.1
    assert abs(bbox.ylen - 269.24) < 0.1
    assert abs(bbox.zlen - 0.50) < 0.01

    with tempfile.TemporaryDirectory(prefix="forge-ipmsm-stator-") as temp_dir:
        output_dir = Path(temp_dir)
        step_path = output_dir / "ipmsm_stator_lamination.step"
        stl_path = output_dir / "ipmsm_stator_lamination.stl"
        cq.exporters.export(model, str(step_path))
        cq.exporters.export(model, str(stl_path), tolerance=0.05)
        assert step_path.stat().st_size > 1024
        assert stl_path.stat().st_size > 1024
        print(
            "[ipmsm-stator] selftest PASS: "
            f"STEP={step_path.stat().st_size} bytes, "
            f"STL={stl_path.stat().st_size} bytes"
        )
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
