#!/usr/bin/env python3
"""Pure form-factor-aware contract for Blender views delivered in Excel."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan, isfinite, tan
from typing import Optional


@dataclass(frozen=True)
class ViewSpec:
    """One canonical Blender image required by the delivered workbook."""

    view_id: str
    filename: str
    title: str
    caption: str
    required: bool = True


def _quantity_value(state: dict, key: str) -> Optional[float]:
    for contract_key in ("orchestratorContract", "engineeringContract"):
        quantities = (state.get(contract_key) or {}).get("quantities")
        if not isinstance(quantities, dict):
            continue
        raw = quantities.get(key)
        value = raw.get("value") if isinstance(raw, dict) else raw
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if isfinite(parsed):
            return parsed
    return None


def _positive_triplet(values: tuple[object, object, object]) -> Optional[tuple[float, float, float]]:
    parsed = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if not isfinite(number) or number <= 0:
            return None
        parsed.append(number)
    return parsed[0], parsed[1], parsed[2]


def resolve_design_envelope_mm(state: dict) -> Optional[tuple[float, float, float]]:
    """Resolve W/D/H from one authoritative precedence chain."""
    contract_dims = _positive_triplet((
        _quantity_value(state, "design_envelope_width_mm"),
        _quantity_value(state, "design_envelope_depth_mm"),
        _quantity_value(state, "design_envelope_height_mm"),
    ))
    if contract_dims:
        return contract_dims

    brief_dims = (
        ((state.get("parsedBrief") or {}).get("constraints") or {})
        .get("max_dimensions_mm") or {}
    )
    brief_triplet = _positive_triplet(
        (brief_dims.get("w"), brief_dims.get("d"), brief_dims.get("h")))
    if brief_triplet:
        return brief_triplet

    volume = _quantity_value(state, "enclosure_volume_m3")
    if volume is not None and 0 < volume < 1:
        side_mm = (volume ** (1.0 / 3.0)) * 1000.0
        return side_mm, side_mm, side_mm
    return None


def is_product_scale(state: dict) -> bool:
    """True for a cabinet/appliance-sized enclosure, never by class slug."""
    volume = _quantity_value(state, "enclosure_volume_m3")
    if volume is not None and 0 < volume < 1:
        return True
    envelope = resolve_design_envelope_mm(state)
    return bool(envelope and max(envelope) <= 2000)


def perspective_distance_for_extent(
    extent: float,
    focal_mm: float,
    sensor_mm: float = 24.0,
    frame_fraction: float = 0.75,
) -> float:
    """Camera distance that fits an extent into a chosen fraction of the frame."""
    if extent <= 0 or focal_mm <= 0 or sensor_mm <= 0:
        raise ValueError("extent, focal_mm and sensor_mm must be positive")
    if not 0 < frame_fraction < 1:
        raise ValueError("frame_fraction must be between 0 and 1")
    field_of_view = 2.0 * atan(sensor_mm / (2.0 * focal_mm))
    return extent / (2.0 * tan(field_of_view / 2.0) * frame_fraction)


def presentation_bevel_width_m(dimensions: tuple[float, float, float]) -> float:
    """Scale-relative manufactured edge radius for presentation meshes."""
    positive = [float(value) for value in dimensions if float(value) > 0]
    if len(positive) != 3:
        raise ValueError("three positive dimensions are required")
    cap = 0.002 if max(positive) < 2.0 else 0.006
    return max(0.0002, min(cap, min(positive) * 0.015))


_PRODUCT_VIEWS = (
    ViewSpec(
        "product_exterior", "04-product-exterior.png",
        "Exterior — front three-quarter",
        "Closed product exterior from the primary service face.",
    ),
    ViewSpec(
        "product_cutaway", "00-hero.png",
        "Interior — cutaway three-quarter",
        "Open service-face cutaway showing the principal internal architecture.",
    ),
    ViewSpec(
        "product_left", "05-product-left.png",
        "Exterior — left three-quarter",
        "Left-side product view showing enclosure depth and mounting relationship.",
    ),
    ViewSpec(
        "product_right", "06-product-right.png",
        "Exterior — right three-quarter",
        "Right-side product view showing enclosure depth and service clearances.",
    ),
    ViewSpec(
        "product_service", "07-product-service.png",
        "Service interfaces",
        "Close view of cable entries, connectors, glands and maintenance access.",
    ),
)

_PLANT_VIEWS = (
    ViewSpec(
        "plant_hero", "00-hero.png", "Interior — hero isometric",
        "Three-quarter overview of the principal plant equipment.",
    ),
    ViewSpec(
        "plant_plan", "01-top.png", "Interior — plan",
        "Top-down plant arrangement view.",
    ),
    ViewSpec(
        "plant_side", "inspect-side.png", "Interior — side elevation",
        "Side elevation, including below-grade equipment where applicable.",
    ),
    ViewSpec(
        "plant_corner", "03-corner-BL.png", "Interior — opposite corner",
        "Opposite-corner view revealing equipment hidden in the hero view.",
        required=False,
    ),
)


def required_views(state: dict) -> list[ViewSpec]:
    """Return the ordered Excel-bound view set for the physical form factor."""
    return list(_PRODUCT_VIEWS if is_product_scale(state) else _PLANT_VIEWS)

