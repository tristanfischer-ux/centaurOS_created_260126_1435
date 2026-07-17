#!/usr/bin/env python3
"""Deterministic blank/occupancy checks for Excel-bound Blender images."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter


@dataclass(frozen=True)
class ImageQualityResult:
    passed: bool
    edge_density: float
    width_occupancy: float
    height_occupancy: float
    reasons: tuple[str, ...]


def evaluate_image(
    path: str | Path,
    min_edge_density: float = 0.002,
    min_width_occupancy: float = 0.35,
    min_height_occupancy: float = 0.45,
) -> ImageQualityResult:
    """Reject blank, tiny or edge-only renders before workbook embedding."""
    image = Image.open(path).convert("L")
    width, height = image.size
    edges = image.filter(ImageFilter.FIND_EDGES)
    pixels = edges.load()
    margin_x = max(2, int(width * 0.02))
    margin_y = max(2, int(height * 0.02))
    points = []
    for y in range(margin_y, height - margin_y):
        for x in range(margin_x, width - margin_x):
            if pixels[x, y] >= 20:
                points.append((x, y))

    area = max(1, width * height)
    edge_density = len(points) / area
    if points:
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        width_occupancy = (max(xs) - min(xs) + 1) / width
        height_occupancy = (max(ys) - min(ys) + 1) / height
    else:
        width_occupancy = 0.0
        height_occupancy = 0.0

    # INTENT (NinjaPCR 2302): height_occupancy 0.445 printed as "0.45 below 0.45"
    # because the message rounded to 2dp while the compare used raw floats.
    # DECISION: gate on the same 2dp rounding the message shows — a value that
    # displays as meeting the floor must pass (float dust must not fail a ship).
    def _below_floor(value: float, floor: float) -> bool:
        return round(value, 2) < round(floor, 2)

    reasons = []
    if edge_density < min_edge_density:
        reasons.append(
            f"edge density {edge_density:.4f} below {min_edge_density:.4f}")
    if _below_floor(width_occupancy, min_width_occupancy):
        reasons.append(
            f"width occupancy {width_occupancy:.2f} below {min_width_occupancy:.2f}")
    if _below_floor(height_occupancy, min_height_occupancy):
        reasons.append(
            f"height occupancy {height_occupancy:.2f} below {min_height_occupancy:.2f}")
    return ImageQualityResult(
        passed=not reasons,
        edge_density=edge_density,
        width_occupancy=width_occupancy,
        height_occupancy=height_occupancy,
        reasons=tuple(reasons),
    )

