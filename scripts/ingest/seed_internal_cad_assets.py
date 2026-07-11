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
    """Publish the initial Powerwall-visible family assets."""
    electromechanical = _load_module(
        "tier2_electromechanical.py", "forge_tier2_electromechanical")
    expansion = _load_module("tier2_expansion.py", "forge_tier2_expansion")
    universal = _load_module("tier1_expansion.py", "forge_tier1_expansion")

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
    return published


def main() -> int:
    db_path = Path(os.environ.get(
        "FORGE_TRUTH_DB", "~/.forge-truth/forge-truth.db")).expanduser()
    asset_root = Path(os.environ.get(
        "FORGE_CAD_ASSET_ROOT", "~/.forge-truth/cad-assets")).expanduser()
    resolver = CadAssetResolver(db_path=db_path, asset_root=asset_root)
    published = seed_assets(resolver)
    print(f"[cad-assets] published {len(published)} family assets: {', '.join(published)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
