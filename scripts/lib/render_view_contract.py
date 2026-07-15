#!/usr/bin/env python3
"""Pure form-factor-aware contract for Blender views delivered in Excel."""

from __future__ import annotations

import re
from dataclasses import dataclass
from math import atan, isfinite, tan
from typing import FrozenSet, Literal, Optional

FormFactor = Literal["plant", "sealed_cabinet", "handheld"]

# INTENT (2026-07-14): one classifier for drawing packs + Excel NA — plant GA/P&ID
# is wrong as the primary surface for a fluid-less handheld; sealed cabinets keep
# product GA + electrical; plants keep the Codema set.
# Leading word-bound only — matches fluid_loop / air_supply, but not "pair"/"fair"
# (trailing \b would fail on underscores because _ is a word char).
_FLUID_MECH_RE = re.compile(r"(?<![a-z])(?:fluid|water|gas|steam|oxygen|air)(?![a-z])", re.I)

# Drawing keys that may emit per pack (see generate_drawing_set pack filter).
_PACK_PLANT: FrozenSet[str] = frozenset({
    "general-arrangement", "single-line", "pid", "bfd",
    "process-schedules", "panel-schedule",
    "hvac", "facility-layout", "distribution-interface",
})
_PACK_SEALED: FrozenSet[str] = frozenset({
    "general-arrangement", "single-line", "panel-schedule",
    "pid", "bfd",  # dry/energy stubs still allowed; generators decide content
    "process-schedules", "hvac",
})
# Fluid-less handheld primaries (Tristan 2026-07-14): Assembly + Interconnect only.
# Plant SLD / panel-schedule are PCB-tab territory for a single-board instrument —
# emitting them made the dossier feel like a miniature plant pack.
_PACK_HANDHELD: FrozenSet[str] = frozenset({
    "general-arrangement",  # reader title: Assembly
    "interconnect",
})
_PACK_HANDHELD_FLUID: FrozenSet[str] = frozenset({
    "general-arrangement", "interconnect",
    "pid", "bfd", "process-schedules",
    "single-line", "panel-schedule",
})


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


# INTENT: mass→volume device estimates often inflate internal air and produce an
# appliance-sized box (~180 mm) that no longer looks like a real handheld
# photometer. A top-operated optical instrument's long edge is dominated by
# (display/MCU module ≈ 90 mm) + (optical cube ≈ 40 mm) side-by-side — typically
# ≤155 mm. Clamp DERIVED envelopes only; brief-pinned max_dimensions_mm still win.
# Kept in sync with human_factors_instrument.HANDHELD_MAX_EDGE_MM (Apple/hand floor).
_HANDHELD_INSTRUMENT_MAX_EDGE_MM = 155.0


def _clamp_derived_handheld_envelope(
    dims: tuple[float, float, float],
) -> tuple[float, float, float]:
    w, d, h = dims
    longest = max(w, d, h)
    if longest <= _HANDHELD_INSTRUMENT_MAX_EDGE_MM:
        return dims
    scale = _HANDHELD_INSTRUMENT_MAX_EDGE_MM / longest
    return w * scale, d * scale, h * scale


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
        if _is_derived_device_envelope(state):
            return _clamp_derived_handheld_envelope(contract_dims)
        return contract_dims
    volume = _quantity_value(state, "enclosure_volume_m3")
    if volume is not None and 0 < volume < 1 and _is_derived_device_envelope(state):
        # DECISION: derived device-scale dimensions are a sizing hint, not a brief pin.
        # If they drift tall/boxy, keep the same volume but restore the handheld
        # instrument aspect. Brief max_dimensions_mm still wins below.
        return _clamp_derived_handheld_envelope(
            _instrument_landscape_from_volume(volume))
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
    """Resolve W/D/H from one authoritative precedence chain.

    INTENT (2026-07-14 Tristan): for instruments, size = the smallest box that
    still packs the functional work (display + optical path + electronics), never
    mass÷density fantasy air. Brief max_dimensions_mm is a CEILING, not a target
    to fill. Explicit non-derived contract dims (class builder) still win.
    """
    brief_triplet = _brief_envelope_triplet(state)
    contract_dims = _quantity_triplet(
        state,
        "design_envelope_width_mm",
        "design_envelope_depth_mm",
        "design_envelope_height_mm",
    )
    derived = _is_derived_device_envelope(state)

    # ── Instrument: minimum working pack beats mass-air derived boxes ─────
    if state.get("isInstrumentDevice"):
        try:
            from minimum_working_envelope import (  # type: ignore
                apply_brief_ceiling,
                minimum_working_envelope_from_state,
            )
            packed = minimum_working_envelope_from_state(state)
        except Exception:  # noqa: BLE001
            packed = None
        if packed is not None:
            # Explicit non-derived contract pin (a real design decision) wins.
            if contract_dims and not derived:
                body = contract_dims
            else:
                body = packed
            if brief_triplet:
                body, _breached = apply_brief_ceiling(body, brief_triplet)
            return body

    if contract_dims:
        if (
            state.get("isInstrumentDevice")
            and derived
            and not _is_handheld_landscape(contract_dims)
        ):
            if brief_triplet:
                return brief_triplet
        return _resolve_instrument_contract_dims(state, contract_dims)

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
            return _clamp_derived_handheld_envelope(
                _instrument_landscape_from_volume(volume))
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


def drawing_form_factor(state: dict) -> FormFactor:
    """Classify the drawing pack: handheld · sealed_cabinet · plant.

    Handheld wins over product_scale when isInstrumentDevice is set (colorimeter).
    Powerwall is sealed_cabinet (product_scale, not instrument).
    """
    if bool(state.get("isInstrumentDevice")):
        return "handheld"
    if is_product_scale(state):
        return "sealed_cabinet"
    return "plant"


def is_fluid_less_instrument(state: dict) -> bool:
    """True when a handheld instrument has no process-fluid topology edges.

    Mirrors the Excel VERIFIED-NA predicate in build-excel-export.py so the
    drawing set and the workbook cannot disagree.
    """
    if not bool(state.get("isInstrumentDevice")):
        return False
    topo = (
        ((state.get("orchestratorContract") or {}).get("topology"))
        or ((state.get("engineeringContract") or {}).get("topology"))
        or []
    )
    for e in topo:
        if not isinstance(e, dict):
            continue
        if _FLUID_MECH_RE.search(str(e.get("mechanism") or "")):
            return False
    return True


def pack_drawings(state: dict) -> FrozenSet[str]:
    """Drawing keys this form factor may emit.

    Fluid-less handhelds exclude plant process sheets entirely (no NA stubs).
    A handheld that somehow carries a fluid edge keeps pid/bfd/process-schedules.
    """
    ff = drawing_form_factor(state)
    if ff == "handheld":
        return _PACK_HANDHELD if is_fluid_less_instrument(state) else _PACK_HANDHELD_FLUID
    if ff == "sealed_cabinet":
        return _PACK_SEALED
    return _PACK_PLANT


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

    INTENT: product exterior shots (04–07) show the closed handheld — top deck,
    sample well, source board, loom. Excel's "Interior — cutaway" is `00-hero.png`
    (_PRODUCT_VIEWS.product_cutaway) and MUST stay a true cutaway so the optical
    bench + PCB story is delivered. Closing 00-hero hid that story and contradicted
    the Excel label (instrument-form-beauty rule, 2026-07-13).

    DECISION: instruments close 04/05/06/07 only; 00-hero remains open cutaway.
    Cabinets keep the same exterior trio; their 00-hero was already cutaway.
    """
    views = {"04-product-exterior", "05-product-left", "06-product-right"}
    if is_instrument_device:
        # Service face is still the closed product (USB / cable entries), not zone slabs.
        views = views | {"07-product-service"}
    return frozenset(views)


def _selftest() -> None:
    """proveCatch for the instrument landscape-envelope reshape (2026-07-12).

    A device-scale optical instrument with only a volume (no explicit dims) MUST
    resolve to a WIDE-and-FLAT benchtop envelope (W > D > H), never a tall cube —
    a cube rendered as a floor-standing cabinet (the Open Colorimeter regression).
    A non-instrument sealed product keeps the cube fallback.
    """
    vol_state = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": 0.002}}}
    # instrument → landscape (and clamped to handheld max edge when derived volume is airy)
    inst = dict(vol_state, isInstrumentDevice=True)
    w, d, h = resolve_design_envelope_mm(inst)
    assert w > d > h, f"instrument envelope must be landscape W>D>H, got {(w, d, h)}"
    assert max(w, d, h) <= _HANDHELD_INSTRUMENT_MAX_EDGE_MM + 1e-6, (
        f"derived instrument envelope must clamp to handheld scale, got {(w, d, h)}")
    # non-instrument → cube (unchanged)
    cube = resolve_design_envelope_mm(dict(vol_state))
    assert cube and abs(cube[0] - cube[2]) < 1e-6, f"non-instrument stays a cube, got {cube}"
    # explicit NON-derived contract dims still win (a real design pin).
    pinned = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": 0.002,
        "design_envelope_width_mm": 140, "design_envelope_depth_mm": 110,
        "design_envelope_height_mm": 55}}, "isInstrumentDevice": True}
    assert resolve_design_envelope_mm(pinned) == (140.0, 110.0, 55.0), (
        "explicit handheld dims must win")
    # derived mass-air dims LOSE to minimum working pack (as small as possible).
    derived_tall = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": 0.002,
        "optical_path_length_mm": {"value": 10},
        "design_envelope_width_mm": {
            "value": 140, "source": "derived_device_scale"},
        "design_envelope_depth_mm": {
            "value": 110, "source": "derived_device_scale"},
        "design_envelope_height_mm": {
            "value": 180, "source": "derived_device_scale"}},
        "requirementsBom": [
            {"requirement": "Compute UI Module"},
            {"requirement": "LED Source Board"},
            {"requirement": "Cuvette Holder"},
        ]}, "isInstrumentDevice": True}
    dt = resolve_design_envelope_mm(derived_tall)
    assert dt and dt[0] > dt[1] > dt[2], f"packed instrument must be landscape W>D>H, got {dt}"
    assert max(dt) <= _HANDHELD_INSTRUMENT_MAX_EDGE_MM + 1e-6, (
        f"packed envelope must stay handheld scale, got {dt}")
    assert dt[0] < 160.0, f"pack must beat mass-air 183 mm width, got {dt}"
    # Oversized landscape derived (colorimeter 0.3 kg÷150) → pack, not clamp-of-183.
    derived_wide = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": 0.002,
        "optical_path_length_mm": {"value": 10},
        "design_envelope_width_mm": {
            "value": 183, "condition": "derived_device_scale — synthesised landscape"},
        "design_envelope_depth_mm": {
            "value": 145, "condition": "derived_device_scale — synthesised landscape"},
        "design_envelope_height_mm": {
            "value": 76, "condition": "derived_device_scale — synthesised landscape"}},
        "requirementsBom": [
            {"requirement": "Compute UI Module"},
            {"requirement": "LED Source Board"},
            {"requirement": "Cuvette Holder"},
        ]}, "isInstrumentDevice": True}
    dw = resolve_design_envelope_mm(derived_wide)
    assert dw and dw[0] < 160.0, f"mass-air 183 must lose to working pack, got {dw}"
    # Brief max is a CEILING — pack that fits under brief stays packed (no inflate).
    derived_brief = dict(
        derived_wide,
        parsedBrief={"constraints": {"max_dimensions_mm": {"w": 140, "d": 110, "h": 55}}},
    )
    db = resolve_design_envelope_mm(derived_brief)
    assert db == dw, f"brief ceiling must not inflate pack toward brief, got {db} vs {dw}"
    assert "07-product-service" in sealed_exterior_view_names(True), (
        "instrument service view must use closed exterior, not cutaway slabs")
    assert "00-hero" not in sealed_exterior_view_names(True), (
        "instrument 00-hero must stay the Excel Interior cutaway (structured optical bench)")
    assert "04-product-exterior" in sealed_exterior_view_names(True), (
        "instrument product exterior stays closed")
    assert "00-hero" not in sealed_exterior_view_names(False), (
        "cabinet/plant 00-hero stays cutaway")
    assert "07-product-service" not in sealed_exterior_view_names(False), (
        "plant/cabinet service view stays cutaway")
    # proveCatch (2026-07-14): form-factor packs — handheld vs sealed cabinet vs plant.
    _hh = {"isInstrumentDevice": True, "orchestratorContract": {
        "topology": [{"from": "a", "to": "b", "mechanism": "electrical_bus"}],
        "quantities": {"enclosure_volume_m3": 0.002}}}
    assert drawing_form_factor(_hh) == "handheld"
    assert is_fluid_less_instrument(_hh)
    assert "interconnect" in pack_drawings(_hh)
    assert "pid" not in pack_drawings(_hh)
    assert "bfd" not in pack_drawings(_hh)
    assert "panel-schedule" not in pack_drawings(_hh)
    assert "process-schedules" not in pack_drawings(_hh)
    # thermal / electrical_bus alone must NOT flip fluid-less → plant pack
    # (NinjaPCR: thermal edges are air-path, not process-water pipes).
    _hh_thermal = {"isInstrumentDevice": True, "orchestratorContract": {
        "topology": [{"mechanism": "thermal"}, {"mechanism": "electrical_bus"}]}}
    assert is_fluid_less_instrument(_hh_thermal)
    assert "panel-schedule" not in pack_drawings(_hh_thermal)
    _hh_fluid = {"isInstrumentDevice": True, "orchestratorContract": {
        "topology": [{"from": "a", "to": "b", "mechanism": "fluid_loop"}]}}
    assert not is_fluid_less_instrument(_hh_fluid)
    assert "pid" in pack_drawings(_hh_fluid)
    _cab = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": 0.13}}}
    assert drawing_form_factor(_cab) == "sealed_cabinet"
    assert "interconnect" not in pack_drawings(_cab)
    assert "general-arrangement" in pack_drawings(_cab)
    _plant = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": 40.0}}}
    assert drawing_form_factor(_plant) == "plant"
    assert "pid" in pack_drawings(_plant)
    print("render_view_contract _selftest: OK (instrument landscape + form-factor packs)")


if __name__ == "__main__":
    _selftest()

