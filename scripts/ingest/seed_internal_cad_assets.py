#!/usr/bin/env python3
"""Generate verified family CAD from the existing CadQuery library and write it back."""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from pathlib import Path

import cadquery as cq

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from cad_asset_resolver import CadAssetResolver  # noqa: E402


def _load_module(filename: str, module_name: str):
    path = REPO_ROOT / "Tier 1 and 2 parts for cad " / filename
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load CAD module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _bbox_mm(shape) -> tuple[float, float, float]:
    bbox = shape.val().BoundingBox()
    return float(bbox.xlen), float(bbox.ylen), float(bbox.zlen)


def seed_assets(resolver: CadAssetResolver) -> list[str]:
    """Publish internal families and licensed educational CAD references."""
    electromechanical = _load_module(
        "tier2_electromechanical.py", "forge_tier2_electromechanical")
    expansion = _load_module("tier2_expansion.py", "forge_tier2_expansion")
    universal = _load_module("tier1_expansion.py", "forge_tier1_expansion")
    motor_drivetrain = _load_module(
        "tier2_motor_drivetrain.py", "forge_tier2_motor_drivetrain")

    definitions = [
        (
            "lfp_prismatic_cell",
            electromechanical.lfp_prismatic_cell,
            {
                "width": 148.0,
                "depth": 27.0,
                "height": 102.0,
                "corner_r": 3.0,
                "terminal_d": 12.0,
                "terminal_h": 6.0,
            },
        ),
        (
            "axial_fan",
            electromechanical.axial_fan,
            {"size": 80.0, "depth": 25.0, "blade_count": 7, "hole_d": 4.3},
        ),
        (
            "pcb_board",
            electromechanical.pcb_board,
            {
                "width": 430.0,
                "height": 250.0,
                "thickness": 1.6,
                "corner_r": 4.0,
                "components": [
                    {"x": -140, "y": 50, "w": 45, "d": 45, "h": 9},
                    {"x": -70, "y": 50, "w": 35, "d": 35, "h": 7},
                    {"x": 30, "y": 55, "w": 60, "d": 35, "h": 12},
                    {"x": 130, "y": 50, "w": 45, "d": 25, "h": 18},
                    {"x": -110, "y": -55, "w": 30, "d": 20, "h": 25},
                    {"x": -55, "y": -55, "w": 30, "d": 20, "h": 25},
                    {"x": 0, "y": -55, "w": 30, "d": 20, "h": 25},
                    {"x": 100, "y": -55, "w": 70, "d": 25, "h": 12},
                ],
            },
        ),
        (
            "heatsink_extruded",
            expansion.heatsink_extruded,
            {
                "length": 220.0,
                "width": 150.0,
                "base_height": 8.0,
                "fin_height": 48.0,
                "fin_count": 14,
                "fin_thickness": 2.0,
            },
        ),
        (
            "terminal_block",
            expansion.terminal_block,
            {"positions": 12, "pitch": 5.08, "body_h": 12.0},
        ),
        (
            "cable_gland",
            universal.cable_gland,
            {
                "thread_d": 20.0,
                "thread_length": 12.0,
                "body_d": 28.0,
                "cable_d": 10.0,
            },
        ),
        # Instrument-scale families (sealed optical/electronic cutaways).
        (
            "instrument_pcb",
            electromechanical.pcb_board,
            {
                "width": 55.0,
                "height": 40.0,
                "thickness": 1.6,
                "corner_r": 1.5,
                "components": [
                    {"x": -12, "y": 8, "w": 10, "d": 10, "h": 2.2},
                    {"x": 8, "y": 6, "w": 14, "d": 8, "h": 1.8},
                    {"x": -8, "y": -10, "w": 8, "d": 6, "h": 3.5},
                    {"x": 12, "y": -8, "w": 6, "d": 6, "h": 2.0},
                ],
            },
        ),
        (
            "coin_cell",
            electromechanical.coin_cell,
            {"diameter": 20.0, "height": 3.2},
        ),
        (
            "square_cuvette",
            electromechanical.square_cuvette,
            {"outer": 12.5, "wall": 1.25, "height": 45.0},
        ),
        (
            "led_emitter",
            electromechanical.led_emitter,
            {"body_d": 5.0, "body_h": 7.0, "lens_r": 2.4},
        ),
        (
            "photodiode_to_can",
            electromechanical.photodiode_to_can,
            {"can_d": 8.0, "can_h": 5.5, "flange_od": 10.8, "flange_h": 0.8},
        ),
    ]
    licensed_family_definitions = [
        (
            "ipmsm_stator_lamination",
            motor_drivetrain.ipmsm_stator_lamination,
            {
                "outer_diameter": 269.24,
                "bore_diameter": 161.90,
                "lamination_thickness": 0.50,
                "slot_count": 48,
                "slot_opening": 1.93,
                "slot_width": 8.00,
                "slot_neck_depth": 1.00,
                "slot_depth": 34.30,
            },
            motor_drivetrain.PYLEECAN_IPMSM_B_SOURCE,
            "Apache-2.0",
        ),
        (
            "ipmsm_rotor_magnet_carrier",
            motor_drivetrain.ipmsm_rotor_magnet_carrier,
            {
                "outer_diameter": 160.40,
                "shaft_diameter": 110.64,
                "lamination_thickness": 0.50,
                "pole_pairs": 4,
                "bridge_thickness": 1.50,
                "magnet_pocket_width": 17.00,
                "magnet_pocket_depth": 6.50,
                "magnet_recess": 1.00,
                "slot_depth": 18.00,
            },
            motor_drivetrain.PYLEECAN_IPMSM_B_SOURCE,
            "Apache-2.0",
        ),
        (
            "planetary_gearset",
            motor_drivetrain.planetary_gearset,
            {
                "module": 1.0,
                "sun_teeth": 12,
                "planet_teeth": 18,
                "width": 10.0,
                "rim_width": 3.0,
                "planet_count": 3,
                "bore_diameter": 6.0,
            },
            motor_drivetrain.CQ_GEARS_PLANETARY_SOURCE,
            "Apache-2.0",
        ),
    ]
    # DECISION: the OpenMotor STEP is registered only against its exact educational
    # identity. It must never become a generic traction-motor family fallback.
    exact_reference_definitions = [
        (
            "open_propulsion_motor_reference",
            "OpenMotor",
            "CIAG-2-28-125-25",
            REPO_ROOT / "assets" / "edu-training-cad" / "openmotor-ciag-125"
            / "CIAG_2_28_125_25.step",
            (
                "https://github.com/eMotres/OpenMotor-Hardware/blob/"
                "1e1e56d7cf64ea393793ca5c06189251f87b6e98/"
                "CAD/CIAG_2_28%20125_25.step"
            ),
            "CERN-OHL-W-2.0",
            (138.393, 138.393, 53.500),
        ),
    ]

    published = []
    with tempfile.TemporaryDirectory() as temp_dir:
        for family, builder, params in definitions:
            shape = builder(params)
            output = Path(temp_dir) / f"{family}.stl"
            cq.exporters.export(shape, str(output), tolerance=0.1, angularTolerance=0.1)
            resolver.register_verified_asset(
                manufacturer="ForgeOS",
                mpn=f"FAMILY-{family.upper().replace('_', '-')}",
                family=family,
                source_file=output,
                source_url=f"internal://component_geometry_types/{family}",
                licence="INTERNAL-PARAMETRIC",
                bbox_mm=_bbox_mm(shape),
                is_family_asset=True,
            )
            published.append(family)
        for family, builder, params, source_url, licence in licensed_family_definitions:
            shape = builder(params)
            output = Path(temp_dir) / f"{family}.stl"
            cq.exporters.export(shape, str(output), tolerance=0.05, angularTolerance=0.1)
            resolver.register_verified_asset(
                manufacturer="ForgeOS Training Geometry",
                mpn=f"FAMILY-{family.upper().replace('_', '-')}",
                family=family,
                source_file=output,
                source_url=source_url,
                licence=licence,
                bbox_mm=_bbox_mm(shape),
                is_family_asset=True,
            )
            published.append(family)
        for (
            family,
            manufacturer,
            mpn,
            source_file,
            source_url,
            licence,
            bbox_mm,
        ) in exact_reference_definitions:
            if not source_file.is_file() or source_file.stat().st_size <= 1024:
                raise RuntimeError(f"Educational CAD reference is missing: {source_file}")
            resolver.register_verified_asset(
                manufacturer=manufacturer,
                mpn=mpn,
                family=family,
                source_file=source_file,
                source_url=source_url,
                licence=licence,
                bbox_mm=bbox_mm,
                is_family_asset=False,
            )
            published.append(f"{family}:{mpn}")
    return published


def main() -> int:
    db_path = Path(os.environ.get(
        "FORGE_TRUTH_DB", "~/.forge-truth/forge-truth.db")).expanduser()
    asset_root = Path(os.environ.get(
        "FORGE_CAD_ASSET_ROOT", "~/.forge-truth/cad-assets")).expanduser()
    resolver = CadAssetResolver(db_path=db_path, asset_root=asset_root)
    published = seed_assets(resolver)
    print(f"[cad-assets] published {len(published)} CAD assets: {', '.join(published)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
