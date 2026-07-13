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


def _quantity_raw(state: dict, key: str) -> object:
    for contract_key in ("orchestratorContract", "engineeringContract"):
        quantities = (state.get(contract_key) or {}).get("quantities")
        if not isinstance(quantities, dict):
            continue
        raw = quantities.get(key)
        if raw is not None:
            return raw
    return None


def _quantity_value(state: dict, key: str) -> Optional[float]:
    raw = _quantity_raw(state, key)
    if raw is None:
        return None
    value = raw.get("value") if isinstance(raw, dict) else raw
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if isfinite(parsed):
        return parsed
    return None


def _quantity_source(state: dict, key: str) -> str:
    raw = _quantity_raw(state, key)
    if not isinstance(raw, dict):
        return ""
    provenance = raw.get("provenance") if isinstance(raw.get("provenance"), dict) else {}
    return str(raw.get("source") or provenance.get("source") or raw.get("condition") or "")


def _instrument_landscape_from_volume(volume_m3: float) -> tuple[float, float, float]:
    side_mm = (volume_m3 ** (1.0 / 3.0)) * 1000.0
    return side_mm * 1.40, side_mm * 1.15, side_mm * 0.62


def _is_handheld_landscape(dims: tuple[float, float, float]) -> bool:
    w, d, h = dims
    return w > d > h and h <= d * 0.72


def _is_derived_device_envelope(state: dict) -> bool:
    sources = " ".join(
        _quantity_source(state, key)
        for key in (
            "design_envelope_width_mm",
            "design_envelope_depth_mm",
            "design_envelope_height_mm",
        )
    ).lower()
    return "derived_device_scale" in sources or "synthesised" in sources


def _quantity_triplet(state: dict, *keys: str) -> Optional[tuple[float, float, float]]:
    parsed = tuple(_quantity_value(state, key) for key in keys)
    if any(value is None for value in parsed):
        return None
    return _positive_triplet(parsed)


def _brief_envelope_triplet(state: dict) -> Optional[tuple[float, float, float]]:
    brief_dims = (
        ((state.get("parsedBrief") or {}).get("constraints") or {})
        .get("max_dimensions_mm") or {}
    )
    return _positive_triplet(
        (brief_dims.get("w"), brief_dims.get("d"), brief_dims.get("h")))


def _resolve_instrument_contract_dims(
    state: dict,
    contract_dims: tuple[float, float, float],
) -> tuple[float, float, float]:
    if not state.get("isInstrumentDevice"):
        return contract_dims
    if _is_handheld_landscape(contract_dims):
        return contract_dims
    volume = _quantity_value(state, "enclosure_volume_m3")
    if volume is not None and 0 < volume < 1 and _is_derived_device_envelope(state):
        # DECISION: derived device-scale dimensions are a sizing hint, not a brief pin.
        # If they drift tall/boxy, keep the same volume but restore the handheld
        # instrument aspect. Brief max_dimensions_mm still wins below.
        return _instrument_landscape_from_volume(volume)
    return contract_dims


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
    contract_dims = _quantity_triplet(
        state,
        "design_envelope_width_mm",
        "design_envelope_depth_mm",
        "design_envelope_height_mm",
    )
    if contract_dims:
        if (
            state.get("isInstrumentDevice")
            and _is_derived_device_envelope(state)
            and not _is_handheld_landscape(contract_dims)
        ):
            brief_triplet = _brief_envelope_triplet(state)
            if brief_triplet:
                return brief_triplet
        return _resolve_instrument_contract_dims(state, contract_dims)

    brief_triplet = _brief_envelope_triplet(state)
    if brief_triplet:
        return brief_triplet

    volume = _quantity_value(state, "enclosure_volume_m3")
    if volume is not None and 0 < volume < 1:
        # A device-scale optical/electronic INSTRUMENT is a benchtop/handheld unit —
        # WIDE and FLAT (a display face + optical port on top), never a tall cube.
        # A cube-of-volume reads as a floor-standing cabinet in the hero (the exact
        # 2026-07-12 Open Colorimeter regression: a 126 mm cube rendered as a BESS
        # cabinet). Reshape the same volume to a landscape aspect (W > D > H) keyed on
        # the authoritative device flag; volume is preserved (1.40·1.15·0.62 ≈ 1.00).
        # Universal — a plant/cabinet product never carries isInstrumentDevice.
        if state.get("isInstrumentDevice"):
            return _instrument_landscape_from_volume(volume)
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


def sealed_exterior_view_names(is_instrument_device: bool) -> frozenset[str]:
    """Blender view names that render the CLOSED product shell (not cutaway internals).

    INTENT: a sealed handheld/benchtop INSTRUMENT is operated and sold as a closed
    product — the customer-facing artefact is the exterior (top deck + sample port),
    not an open electronics bay. Cabinets/wall products still use a cutaway 00-hero
    so internals read; instruments close 00-hero too. 07-product-service follows the
    same rule (USB/service on the exterior, never zone-stacked grey slabs).
    """
    views = {"04-product-exterior", "05-product-left", "06-product-right"}
    if is_instrument_device:
        # DECISION: instrument 00-hero is the CLOSED product. A cutaway hero is the
        # wrong deliverable language for a handheld optical instrument — it invents
        # a "cabinet with the door off" story the product does not have.
        views = views | {"00-hero", "07-product-service"}
    return frozenset(views)


def _selftest() -> None:
    """proveCatch for the instrument landscape-envelope reshape (2026-07-12).

    A device-scale optical instrument with only a volume (no explicit dims) MUST
    resolve to a WIDE-and-FLAT benchtop envelope (W > D > H), never a tall cube —
    a cube rendered as a floor-standing cabinet (the Open Colorimeter regression).
    A non-instrument sealed product keeps the cube fallback.
    """
    vol_state = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": 0.002}}}
    # instrument → landscape
    inst = dict(vol_state, isInstrumentDevice=True)
    w, d, h = resolve_design_envelope_mm(inst)
    assert w > d > h, f"instrument envelope must be landscape W>D>H, got {(w, d, h)}"
    assert abs(w * d * h / 1e9 - 0.002) < 2e-4, "landscape reshape must preserve volume"
    # non-instrument → cube (unchanged)
    cube = resolve_design_envelope_mm(dict(vol_state))
    assert cube and abs(cube[0] - cube[2]) < 1e-6, f"non-instrument stays a cube, got {cube}"
    # explicit contract dims still win when they are already handheld-like.
    pinned = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": 0.002,
        "design_envelope_width_mm": 140, "design_envelope_depth_mm": 110,
        "design_envelope_height_mm": 55}}, "isInstrumentDevice": True}
    assert resolve_design_envelope_mm(pinned) == (140.0, 110.0, 55.0), (
        "explicit handheld dims must win")
    # derived non-handheld dims are not a pin: keep volume, restore handheld aspect.
    derived_tall = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": 0.002,
        "design_envelope_width_mm": {
            "value": 140, "source": "derived_device_scale"},
        "design_envelope_depth_mm": {
            "value": 110, "source": "derived_device_scale"},
        "design_envelope_height_mm": {
            "value": 180, "source": "derived_device_scale"}}}, "isInstrumentDevice": True}
    dt = resolve_design_envelope_mm(derived_tall)
    assert dt and dt[0] > dt[1] > dt[2], f"derived instrument dims must reshape, got {dt}"
    assert abs(dt[0] * dt[1] * dt[2] / 1e9 - 0.002) < 2e-4, (
        "derived reshape must preserve volume")
    derived_brief = dict(
        derived_tall,
        parsedBrief={"constraints": {"max_dimensions_mm": {"w": 140, "d": 110, "h": 55}}},
    )
    assert resolve_design_envelope_mm(derived_brief) == (140.0, 110.0, 55.0), (
        "brief dimensions must win over derived non-handheld instrument hints")
    assert "07-product-service" in sealed_exterior_view_names(True), (
        "instrument service view must use closed exterior, not cutaway slabs")
    assert "00-hero" in sealed_exterior_view_names(True), (
        "instrument 00-hero must be the closed product (not a cabinet cutaway)")
    assert "00-hero" not in sealed_exterior_view_names(False), (
        "cabinet/plant 00-hero stays cutaway")
    assert "07-product-service" not in sealed_exterior_view_names(False), (
        "plant/cabinet service view stays cutaway")
    print("render_view_contract _selftest: OK (instrument landscape envelope proven)")


if __name__ == "__main__":
    _selftest()

