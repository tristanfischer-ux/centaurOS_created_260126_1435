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
    enclosure_volume_m3: float | None = None,
    product_bbox_mm: tuple[float, float] | None = None,
) -> ImageQualityResult:
    """Reject blank, tiny or edge-only renders before workbook embedding.

    A COMPACT benchtop/handheld product legitimately has a smooth, low-edge surface (a matte
    polymer box) — a service view of it can sit below the plant-tuned 0.002 edge-density floor
    while still FILLING the frame (high occupancy). The occupancy floors are what actually catch
    a blank/tiny render, so scale ONLY the edge-density floor down by device size. Keyed on the
    enclosure volume, never a product noun. (benchtop_bioreactor service view 0.0016 SIGHT, 2026-07-19)

    ASPECT-AWARE OCCUPANCY (organoid bioreactor 2026-07-22): a wide/landscape product (e.g.
    W=221 mm, H=96 mm) rendered correctly fills the frame on its dominant (width) axis —
    width_occupancy=0.96, height_occupancy=0.41. A HEIGHT-only floor of 0.45 false-fails it.
    Fix: when product_bbox_mm (width_mm, height_mm) shows the product is landscape (width ≥
    height × 1.25), measure the occupancy floor against the DOMINANT dimension
    (max(width_occ, height_occ)) rather than height alone. A genuinely tiny render still fails
    because BOTH dimensions would be low. product_bbox_mm = (bbox_width_mm, bbox_height_mm)
    from parts-manifest bbox_mm (length_mm is x-span, height_mm is z-span).
    """
    if enclosure_volume_m3 is not None and enclosure_volume_m3 > 0:
        if enclosure_volume_m3 < 0.02:        # handheld (< 20 L)
            min_edge_density = min(min_edge_density, 0.0010)
        elif enclosure_volume_m3 < 0.2:       # benchtop instrument (< 200 L)
            min_edge_density = min(min_edge_density, 0.0013)

    # Determine if the product is landscape (dominant dimension is width).
    # Threshold 1.25: only clearly wider-than-tall products switch to dominant-axis check.
    _is_landscape = False
    if product_bbox_mm is not None:
        _bbox_w, _bbox_h = product_bbox_mm
        if _bbox_w > 0 and _bbox_h > 0 and _bbox_w >= _bbox_h * 1.25:
            _is_landscape = True

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
    # DECISION: gate on the same rounding the message shows — a value that
    # displays as meeting the floor must pass (float dust must not fail a ship).
    # GOTCHA (OpenFlexure 2026-07-18): edge density 0.00196 printed as
    # "0.0020 below 0.0020" with a raw `<` compare — same dust class at 4dp.
    def _below_floor(value: float, floor: float, *, ndigits: int) -> bool:
        return round(value, ndigits) < round(floor, ndigits)

    reasons = []
    if _below_floor(edge_density, min_edge_density, ndigits=4):
        reasons.append(
            f"edge density {edge_density:.4f} below {min_edge_density:.4f}")
    if _below_floor(width_occupancy, min_width_occupancy, ndigits=2):
        reasons.append(
            f"width occupancy {width_occupancy:.2f} below {min_width_occupancy:.2f}")
    if _is_landscape:
        # Landscape product: a correctly-framed wide render fills the dominant (width) axis.
        # Gate on max(width_occ, height_occ) so a well-framed wide product passes while a
        # genuinely tiny render (both dims low) still fails.
        dominant_occupancy = max(width_occupancy, height_occupancy)
        if _below_floor(dominant_occupancy, min_height_occupancy, ndigits=2):
            reasons.append(
                f"dominant occupancy {dominant_occupancy:.2f} below {min_height_occupancy:.2f} "
                f"(landscape product {product_bbox_mm[0]:.0f}×{product_bbox_mm[1]:.0f} mm, "
                f"width_occ={width_occupancy:.2f} height_occ={height_occupancy:.2f})")
    else:
        if _below_floor(height_occupancy, min_height_occupancy, ndigits=2):
            reasons.append(
                f"height occupancy {height_occupancy:.2f} below {min_height_occupancy:.2f}")
    return ImageQualityResult(
        passed=not reasons,
        edge_density=edge_density,
        width_occupancy=width_occupancy,
        height_occupancy=height_occupancy,
        reasons=tuple(reasons),
    )

