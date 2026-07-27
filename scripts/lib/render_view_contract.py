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
    alternates: tuple = ()   # fallback filenames if `filename` is absent (first existing wins)


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


def _volume_source_detail_triplet(state: dict) -> Optional[tuple[float, float, float]]:
    """Parse explicit W×D×H m dimensions from enclosure_volume_m3.source_detail.

    INTENT (2026-07-23): the engineer writes "0.18×0.14×0.16 m compact benchtop
    envelope" in source_detail to express the CONTRACT design intent.  When no
    brief max_dimensions_mm exists AND no explicit design_envelope_*_mm exists,
    this is the tightest authoritative ceiling we have.  Convert to mm and return
    as a (W, D, H) triplet so resolve_design_envelope_mm can cap the physics-computed
    minimum_working_envelope when it grows wider than the stated contract footprint.

    Matches: "0.18×0.14×0.16 m", "0.18x0.14x0.16m", "180×140×160 mm", etc.
    Returns None when no parseable pattern is found.
    """
    raw = _quantity_raw(state, "enclosure_volume_m3")
    if not isinstance(raw, dict):
        return None
    detail = str(raw.get("source_detail") or "")
    # Try metres first: three floats separated by × or x followed by ' m' or 'm'
    m = re.search(
        r"([0-9]+(?:\.[0-9]+)?)\s*[×xX*]\s*([0-9]+(?:\.[0-9]+)?)\s*[×xX*]\s*([0-9]+(?:\.[0-9]+)?)\s*m\b",
        detail,
    )
    if m:
        vals = (float(m.group(1)) * 1000.0, float(m.group(2)) * 1000.0, float(m.group(3)) * 1000.0)
        return _positive_triplet(vals)
    # Try millimetres: three integers/floats followed by 'mm'
    m2 = re.search(
        r"([0-9]+(?:\.[0-9]+)?)\s*[×xX*]\s*([0-9]+(?:\.[0-9]+)?)\s*[×xX*]\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b",
        detail,
    )
    if m2:
        vals2 = (float(m2.group(1)), float(m2.group(2)), float(m2.group(3)))
        return _positive_triplet(vals2)
    return None


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
            # Engineer-stated contract envelope from enclosure_volume_m3.source_detail
            # (e.g. "0.18×0.14×0.16 m compact benchtop envelope").  Only applied when
            # no explicit contract pin or brief ceiling is active — it is the fallback
            # authoritative ceiling so the physics pack cannot balloon past the stated
            # footprint.  Height is intentionally taken as min(packed_h, vol_h) so a
            # tall heat-stack that fits the stated height is never silently truncated.
            if not (contract_dims and not derived) and not brief_triplet:
                vol_ceil = _volume_source_detail_triplet(state)
                if vol_ceil:
                    bw, bd, bh = body
                    vw, vd, vh = vol_ceil
                    body = (min(bw, vw), min(bd, vd), min(bh, vh))
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


def form_factor_honesty_findings(state: dict) -> list[dict]:
    """Detect container / plant-scale claims on wall or device products.

    INTENT (encode checklist §1.7–1.8 / P1-7): Powerwall false-ship class —
    container metadata on a sealed_cabinet / handheld must block SHIPS.
    Keyed on form factor + envelope quantities, never a product noun.

    @returns List of finding dicts with code/message (empty = honest).
    """
    findings: list[dict] = []
    ff = drawing_form_factor(state)
    if ff == "plant":
        return findings
    env = resolve_design_envelope_mm(state)
    max_edge = max(env) if env else None
    vol = _quantity_value(state, "enclosure_volume_m3")
    container_count = _quantity_value(state, "container_count")
    container_len = _quantity_value(state, "container_internal_length_m")
    # Shipping-container signals in quantity keys / bases.
    blob_parts: list[str] = []
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = ((state.get(ck) or {}).get("quantities") or {})
        if not isinstance(qs, dict):
            continue
        for k, v in qs.items():
            blob_parts.append(str(k))
            if isinstance(v, dict):
                blob_parts.append(str(v.get("source_detail") or ""))
                blob_parts.append(str(v.get("basis") or ""))
    blob = " ".join(blob_parts).lower()
    iso_claim = bool(re.search(
        r"\b(?:40|20)[\s-]?ft\b|\biso[\s-]?container\b|\bshipping container\b|"
        r"\bcontainerised\b|\bcontainerized\b",
        blob,
    ))
    # Device / wall cabinet: small envelope must not carry ISO furniture.
    small = (
        (vol is not None and 0 < vol < 2.0)
        or (max_edge is not None and max_edge <= 2500.0)
        or ff == "handheld"
    )
    if small and container_count is not None and float(container_count) >= 1.0:
        # Utility BESS legitimately has container_count; wall/device volumes don't.
        if vol is not None and vol < 2.0:
            findings.append({
                "code": "CONTAINER_COUNT_ON_PRODUCT",
                "message": (
                    f"form={ff} enclosure_volume_m3={vol} but container_count="
                    f"{container_count} — shipping-container metadata on a "
                    "wall/device product (false-ship class)"
                ),
            })
    if small and container_len is not None and float(container_len) >= 5.0:
        findings.append({
            "code": "ISO_LENGTH_ON_PRODUCT",
            "message": (
                f"form={ff} claims container_internal_length_m={container_len} "
                "on a product-scale envelope"
            ),
        })
    if small and iso_claim and ff == "handheld":
        findings.append({
            "code": "ISO_PROSE_ON_HANDHELD",
            "message": "ISO/shipping-container prose on a handheld instrument form",
        })
    return findings


def form_factor_honesty_ok(state: dict) -> bool:
    """True when form-factor claims are coherent (no container-on-device false-ship)."""
    return len(form_factor_honesty_findings(state)) == 0


def is_fluid_less_instrument(state: dict) -> bool:
    """True when a handheld instrument has no process-fluid topology edges.

    Mirrors the Excel VERIFIED-NA predicate in build-excel-export.py so the
    drawing set and the workbook cannot disagree.

    GOTCHA (Pioreactor 0327): a 20 ml culture kit authors a real
    `dosing_pump → culture_vessel` fluid_loop for media tubing. That is
    on-device silicone hose — NOT a plant process train. Unlocking
    `_PACK_HANDHELD_FLUID` (P&ID/SLD/panel) floored Drawings + Verification
    while Rodeostat/Poseidon correctly ship Assembly+Interconnect only.
    Device-scale enclosures (<1 m³) stay fluid-less for the drawing pack.
    """
    if not bool(state.get("isInstrumentDevice")):
        return False
    enc = _quantity_value(state, "enclosure_volume_m3")
    if enc is not None and 0 < enc < 1.0:
        return True
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
        # 2026-07-25 (Tristan: "still no internal render image"): the cutaway slot used
        # 00-hero.png, but for a sealed instrument 00-hero renders the interior clutter
        # SUPPRESSED (or falls back to the closed 04 exterior) — an EMPTY translucent box,
        # not "the principal internal architecture" the caption promises. 08-product-ghost-
        # shell.png IS the see-inside render (translucent shell + opaque internals: display,
        # vessel, PCB, wiring, heatsink all visible). Use the ghost as the cutaway; fall back
        # to 00-hero only when the ghost pass did not run.
        "product_cutaway", "08-product-ghost-shell.png",
        "Interior — cutaway three-quarter",
        "Ghost-shell see-inside showing the principal internal architecture.",
        alternates=("00-hero.png",),
    ),
    ViewSpec(
        # Two further cutaway perspectives of the same ghost shell (Tristan 2026-07-27:
        # "show another cutaway render from two other perspectives — the side and the
        # back"). required=False DELIBERATELY: they are shown and bundled whenever the
        # ghost pass produced them, but a product whose ghost pass does not run (no sealed
        # shell) must not start failing the render gate for their absence. They also have
        # NO alternates — falling back to another image would put a non-cutaway under a
        # cutaway caption, which is the exact defect that made 00-hero an "empty
        # translucent box" under this same slot on 2026-07-25.
        "product_cutaway_side", "09-product-ghost-shell-side.png",
        "Interior — cutaway, side",
        "Ghost-shell see-inside from the side, showing the internal stack depth.",
        required=False,
    ),
    ViewSpec(
        "product_cutaway_back", "10-product-ghost-shell-back.png",
        "Interior — cutaway, rear",
        "Ghost-shell see-inside from the rear, showing service-side internals.",
        required=False,
    ),
    ViewSpec(
        # True ORTHOGRAPHIC elevations of the translucent shell, so they can be read
        # directly against the GA's plan/front/side views rather than only admired.
        "product_cutaway_top", "11-product-ghost-shell-top.png",
        "Interior — cutaway, top-down",
        "Ghost-shell see-inside looking down, showing the internal plan arrangement.",
        required=False,
    ),
    ViewSpec(
        "product_cutaway_front", "12-product-ghost-shell-front.png",
        "Interior — cutaway, front",
        "Ghost-shell see-inside from the front, showing the internal stack-up.",
        required=False,
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
    sample well, source board, loom. Excel's "Interior — cutaway" is the ghost-shell
    see-inside `08-product-ghost-shell.png` (_PRODUCT_VIEWS.product_cutaway, 2026-07-25;
    was 00-hero.png, which rendered an empty box for sealed instruments) and MUST stay a
    true see-inside so the optical bench + PCB + loom story is delivered.

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
    # proveCatch (Pioreactor 0327): device-scale + micro dosing fluid_loop stays
    # Assembly+Interconnect — must NOT unlock plant P&ID/SLD pack.
    _hh_lab = {"isInstrumentDevice": True, "orchestratorContract": {
        "topology": [{"from_part": "dosing_pump", "to_part": "culture_vessel",
                      "mechanism": "fluid_loop"}],
        "quantities": {"enclosure_volume_m3": {"value": 0.004}}}}
    assert is_fluid_less_instrument(_hh_lab)
    assert "pid" not in pack_drawings(_hh_lab)
    assert "panel-schedule" not in pack_drawings(_hh_lab)
    _cab = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": 0.13}}}
    assert drawing_form_factor(_cab) == "sealed_cabinet"
    assert "interconnect" not in pack_drawings(_cab)
    assert "general-arrangement" in pack_drawings(_cab)
    _plant = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": 40.0}}}
    assert drawing_form_factor(_plant) == "plant"
    assert "pid" in pack_drawings(_plant)
    # proveCatch (encode P1-7): container metadata on wall/device must FAIL honesty.
    _wall_lie = {
        "orchestratorContract": {
            "quantities": {
                "enclosure_volume_m3": 0.15,
                "container_count": {"value": 1, "source_detail": "single 40-ft ISO container"},
                "container_internal_length_m": {"value": 12.03},
            }
        }
    }
    assert drawing_form_factor(_wall_lie) == "sealed_cabinet"
    assert not form_factor_honesty_ok(_wall_lie), "container on wall cabinet must fail honesty"
    _codes = {f["code"] for f in form_factor_honesty_findings(_wall_lie)}
    assert "CONTAINER_COUNT_ON_PRODUCT" in _codes or "ISO_LENGTH_ON_PRODUCT" in _codes
    _hh_clean = {"isInstrumentDevice": True, "orchestratorContract": {
        "quantities": {"enclosure_volume_m3": 0.002}}}
    assert form_factor_honesty_ok(_hh_clean), "clean handheld must pass honesty"
    _plant_ok = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3": 40.0, "container_count": {"value": 1}}}}
    assert form_factor_honesty_ok(_plant_ok), "plant may claim containers"
    # proveCatch (2026-07-23 organoid-bioreactor): source_detail ceiling must prevent
    # physics-computed pack from ballooning past stated contract footprint.
    # Organoid: source_detail "0.18×0.14×0.16 m compact benchtop envelope" = (180,140,160)mm.
    # minimum_working_envelope returns (248.2, 188.2, 108.0) via functional stack.
    # After ceiling: (min(248.2,180), min(188.2,140), min(108,160)) = (180, 140, 108).
    _organoid_like = {
        "isInstrumentDevice": True,
        "parsedBrief": {"constraints": {"max_dimensions_mm": {"w": None, "d": None, "h": None, "source": "missing"}}},
        "orchestratorContract": {
            "quantities": {
                "enclosure_volume_m3": {
                    "value": 0.00403,
                    "source_detail": "0.18×0.14×0.16 m compact benchtop envelope",
                },
            },
        },
        "moduleDecomposition": [
            {"name": "Magnetic Stirrer Drive"},
            {"name": "Peristaltic Pump"},
            {"name": "Vial Holder"},
            {"name": "Heatsink"},
        ],
    }
    # _volume_source_detail_triplet must parse the pattern correctly
    _vsd = _volume_source_detail_triplet(_organoid_like)
    assert _vsd is not None, "must parse 0.18×0.14×0.16 m"
    assert abs(_vsd[0] - 180.0) < 1 and abs(_vsd[1] - 140.0) < 1, f"triplet wrong: {_vsd}"
    # resolve_design_envelope_mm must produce W ≤ 180 and D ≤ 140 (not 248×188)
    _env = resolve_design_envelope_mm(_organoid_like)
    assert _env is not None, "organoid-like must resolve envelope"
    assert _env[0] <= 181.0, f"W must be clamped to ≤180 mm, got {_env[0]:.1f}"
    assert _env[1] <= 141.0, f"D must be clamped to ≤140 mm, got {_env[1]:.1f}"
    print("render_view_contract _selftest: OK (instrument landscape + form-factor packs + honesty + source_detail ceiling)")


if __name__ == "__main__":
    _selftest()

