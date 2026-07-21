#!/usr/bin/env python3
"""Minimum working envelope — as small as possible, still does the work.

INTENT (Tristan 2026-07-14): a product's size must come from a UNIVERSAL reason,
never a class table and never mass÷density fantasy air. The reason is:

  envelope = the smallest axis-aligned box that packs every functional part
             the design needs to do its job, plus wall/clearance margins,
             and that clears human-factors floors (readable display, finger keys).

Brief `max_dimensions_mm` is a HARD CEILING (must fit), not a target to fill.
Mass-derived landscape boxes (aggregator `derived_device_scale`) are a last-resort
hint only — they must never outrank a packed working envelope.

UNIVERSAL — keyed on functional roles (optical path, display, compute board),
never a product noun. Colorimeter / photometer / handheld meter all share the
same pack grammar. Gold open-photometer shapes are a TRAINING check that the
reasons produce a real pocket instrument — never a silhouette paste.

FLOW:
  BoM principals + optical_path_mm + human_factors floors
  → minimum_working_envelope_mm()
  → resolve_design_envelope_mm() / deriveDeviceScaleEnclosure (TS mirror)
  → form rule places features ON that envelope (does not invent a bigger one)
"""
from __future__ import annotations

import re
from typing import Any, Iterable, Optional

import human_factors_instrument as hfi

# Wall + assembly clearance around the packed functional stack.
_CLEARANCE_MM = 6.0
# Thin closed-product body under the UI deck (PCB + battery slab).
_BODY_ELECTRONICS_H_MM = 28.0
# Optical chamber floors — same physics as instrument_form_rule (cuvette + baffles).
_CHAMBER_PLAN_FLOOR_MM = 36.0
_CHAMBER_H_FLOOR_MM = 38.0

_OPTICAL_ROLE_RE = re.compile(
    r"optical|collimat|cuvette|wavelength|baffle|detector|photodiode|"
    r"led\s*source|source\s*board|monochromat|sample\s*holder",
    re.I,
)
_COMPUTE_ROLE_RE = re.compile(
    r"compute\s*ui|microcontroller|\bmcu\b|pcb|main\s*board|logic\s*board",
    re.I,
)
_DISPLAY_ROLE_RE = re.compile(
    r"display|hmi|screen|readout|touchscreen",
    re.I,
)


def _optical_path_mm_from_state(state: dict) -> float:
    """Read optical path length from contract quantities / brief (mm)."""
    for contract_key in ("orchestratorContract", "engineeringContract"):
        q = (state.get(contract_key) or {}).get("quantities") or {}
        if not isinstance(q, dict):
            continue
        for key in ("optical_path_length_mm", "optical_path_mm", "path_length_mm"):
            raw = q.get(key)
            val = raw.get("value") if isinstance(raw, dict) else raw
            try:
                n = float(val)
            except (TypeError, ValueError):
                continue
            if n > 0:
                return max(5.0, n)
    # Brief target_performance metrics
    metrics = (
        ((state.get("parsedBrief") or {}).get("constraints") or {})
        .get("target_performance") or {}
    )
    if isinstance(metrics, dict):
        for m in metrics.get("metrics") or []:
            if not isinstance(m, dict):
                continue
            name = str(m.get("name") or m.get("metric") or "").lower()
            if "optical" in name and "path" in name:
                try:
                    return max(5.0, float(m.get("value")))
                except (TypeError, ValueError):
                    pass
    return 10.0


def _part_names_from_state(state: dict) -> list[str]:
    names: list[str] = []
    for b in state.get("requirementsBom") or []:
        if not isinstance(b, dict):
            continue
        if str(b.get("status") or "").upper() == "SUB-COMPONENT":
            continue
        nm = str(b.get("requirement") or b.get("name_human") or "").split("·")[0].strip()
        if nm:
            names.append(nm)
    return names


def _roles_present(names: Iterable[str]) -> dict[str, bool]:
    blob = " | ".join(names)
    return {
        "optical": bool(_OPTICAL_ROLE_RE.search(blob)),
        "compute": bool(_COMPUTE_ROLE_RE.search(blob)),
        "display": bool(_DISPLAY_ROLE_RE.search(blob)) or bool(_COMPUTE_ROLE_RE.search(blob)),
    }


# ── FUNCTIONAL PART-STACK PACK (organoid-bioreactor 2150, R4 2026-07-21) ──────
# INTENT: the optical/UI pack above sizes a box for a display + optical path +
# electronics slab ONLY. A benchtop instrument that ALSO carries large mechanical /
# fluidic parts (a magnetic stir drive, a peristaltic pump, a vial-holder fixture,
# a culture vessel) does NOT fit that pocket box — the real placed part stack then
# sprawls FAR outside the declared enclosure (the organoid: a 102 mm packed envelope
# vs a 221 mm placed part stack = 2.2× phenotype sprawl; the parts are correctly
# device-scaled, the ENVELOPE was blind to them). The honest envelope is the smallest
# box that packs EVERY functional part, so the delivered scene ≈ the enclosure.
#
# UNIVERSAL: keyed on functional-role nouns (the SAME role vocabulary the render
# placer sizes parts from in build_universal_scene._instrument_proxy_dim), never a
# product-name table. A design with only pocket electronics packs to the same small
# box as before (the mechanical rules match nothing → no growth); a design carrying
# a stir drive / pump / vial holder grows the envelope to honestly contain them.

# Role → representative device-scale footprint (w_mm, d_mm) for the LARGER mechanical
# / fluidic / thermal parts an instrument's optical-UI pack ignores. Mirrors the
# device-scale sizes in build_universal_scene._instrument_proxy_dim (F1b) so the
# envelope and the placer agree on ONE part size. Only parts that materially drive
# the footprint (≥ ~40 mm long edge) are listed — small SMD parts never grow a box.
_MECHANICAL_PART_FOOTPRINTS_MM: tuple[tuple[str, tuple[float, float]], ...] = (
    (r"magnetic\s*stir|stir(?:rer)?\s*(?:drive|bar|plate)|stirrer\b", (120.0, 100.0)),
    (r"peristaltic\s*pump|dosing\s*pump|metering\s*pump|micro\s*pump", (110.0, 80.0)),
    (r"vial\s*holder|tube\s*(?:rack|holder)|vial\s*rack|sample\s*rack|holder\s*fixture", (90.0, 60.0)),
    (r"heatsink|heat\s*sink", (50.0, 40.0)),
    (r"sample\s*block|thermal\s*block|tube\s*block", (60.0, 40.0)),
    (r"culture\s*vessel|bioreactor\s*vessel|glass\s*vessel|reaction\s*vessel", (38.0, 38.0)),
    (r"culture\s*(?:vial|tube|flask)|erlenmeyer|conical\s*flask", (25.0, 25.0)),
    (r"media\s*tubing|tubing\s*set|perfusion\s*line|fluid\s*line|dosing\s*line", (60.0, 40.0)),
    (r"thermal\s*insulation|insulation\s*(?:jacket|sleeve|wrap)|lagging", (60.0, 40.0)),
    (r"front\s*panel\s*connector|connector\s*ports|panel\s*ports", (99.0, 8.0)),
    (r"low\s*voltage\s*dc\s*supply|dc\s*supply|power\s*supply\s*brick", (48.0, 32.0)),
    (r"flexure\s*stage|stage\s*body|flexure\s*body", (85.0, 85.0)),
)


def _functional_stack_footprint_mm(names: Iterable[str]) -> Optional[tuple[float, float]]:
    """Landscape (width_mm, depth_mm) that shelf-packs the design's LARGE functional
    parts, or None when the design carries no footprint-driving mechanical/fluidic part.

    Deterministic area shelf-pack: sum each matched part's footprint area, take a
    landscape box of that area at a ~1.4:1 aspect, but never narrower than the widest
    single part (a 120 mm stir drive must fit on one shelf). Universal, no product
    table — a pocket electronics instrument matches nothing here and stays small."""
    foots: list[tuple[float, float]] = []
    for nm in names:
        low = str(nm or "").lower()
        for pattern, (w_mm, d_mm) in _MECHANICAL_PART_FOOTPRINTS_MM:
            if re.search(pattern, low, re.I):
                foots.append((float(w_mm), float(d_mm)))
                break
    if not foots:
        return None
    total_area = sum(w * d for w, d in foots)
    widest = max(w for w, _ in foots)
    deepest = max(d for _, d in foots)
    # Shelf-pack allowance: the render placer lays these parts (plus the smaller SMD
    # kit) on a compact grid whose extent tracks the SUMMED footprint area closely
    # (verified on the organoid: Σ large-part area 35,236 mm² vs the placed 221×165 mm
    # = 36,465 mm² stack — ~1:1). So reserve only a small ~1.05× tessellation slack and
    # shape it to the instrument landscape aspect (W:D ≈ 1.34, the placed stack's own
    # ratio). The box must still be at least as wide/deep as the widest single part.
    packed_area = total_area * 1.05
    import math as _math
    width = max(widest, _math.sqrt(packed_area * 1.34))
    depth = max(deepest, packed_area / max(width, 1.0))
    if depth > width:
        width, depth = depth, width
    return (round(width, 1), round(depth, 1))


def minimum_working_envelope_mm(
    *,
    optical_path_mm: float = 10.0,
    has_optical: bool = True,
    has_display: bool = True,
    clearance_mm: float = _CLEARANCE_MM,
) -> tuple[float, float, float]:
    """Smallest body L×W×H (mm) that still packs the functional work.

    INTENT: body envelope only — the optical cube may sit ON the body via the
    form rule (`total_height_mm = H + chamber_h`). Body must still be wide enough
    for UI deck + optical footprint side-by-side on the top plane (top-operated).

    Pack grammar (role-keyed, never a product noun):
      - Optical chamber plan ≥ cuvette outer + baffles (path-driven)
      - UI deck ≥ Apple-derived display + D-pad cluster
      - Body height ≥ thin electronics slab under the deck
      - Clearance walls around the packed stack

    @returns (width_mm, depth_mm, height_mm) body envelope
    """
    path = max(5.0, float(optical_path_mm))
    clr = max(2.0, float(clearance_mm))

    # Optical chamber (same floors as instrument_form_rule).
    cuvette_outer = path + 2.5
    chamber_plan = max(_CHAMBER_PLAN_FLOOR_MM, cuvette_outer + 18.0)
    chamber_h = max(_CHAMBER_H_FLOOR_MM, min(48.0, 32.0 + path * 1.2))

    # UI cluster: preferred display + D-pad (3 buttons) + A/B column + gaps.
    disp_w = hfi.DISPLAY_ACTIVE_PREF_W_MM
    disp_h = hfi.DISPLAY_ACTIVE_PREF_H_MM
    btn = hfi.BUTTON_PREF_DIAMETER_MM
    pitch = btn + hfi.BUTTON_PREF_GAP_MM
    cluster_w = pitch * 3.15 + btn * 0.5
    ui_w = cluster_w + 4.0 + disp_w + 8.0  # cluster | gap | glass | lip
    ui_d = max(disp_h + btn * 2.2 + 10.0, pitch * 3.0 + 12.0)

    if has_optical and has_display:
        # Side-by-side top plane: UI deck left, optical footprint right.
        width = ui_w + chamber_plan + clr * 2.0
        depth = max(ui_d, chamber_plan * 0.96) + clr * 2.0
        # Body under the deck — electronics only; cube rides on top via form rule.
        height = _BODY_ELECTRONICS_H_MM + clr
    elif has_optical:
        width = chamber_plan + clr * 2.0
        depth = chamber_plan * 0.96 + clr * 2.0
        height = max(chamber_h * 0.55, _BODY_ELECTRONICS_H_MM) + clr
    else:
        # Pure electronics handheld (no optical path).
        width = ui_w + clr * 2.0
        depth = ui_d + clr * 2.0
        height = _BODY_ELECTRONICS_H_MM + clr

    # Never invent appliance scale — hand/pocket long-edge floor from HIG module.
    width = min(width, hfi.HANDHELD_MAX_EDGE_MM)
    depth = min(depth, hfi.HANDHELD_MAX_EDGE_MM)
    # Keep landscape: W ≥ D ≥ H for top-operated instruments.
    if depth > width:
        width, depth = depth, width
    if height > depth:
        height = min(height, depth * 0.55)

    return (round(width, 1), round(depth, 1), round(height, 1))


def minimum_working_envelope_from_state(state: dict) -> Optional[tuple[float, float, float]]:
    """Derive the packed envelope from a design state, or None if not an instrument.

    @description Only fires for isInstrumentDevice. Brief max_dimensions_mm is
                 NOT applied here — the caller caps / breaches separately.
    """
    if not state.get("isInstrumentDevice"):
        return None
    names = _part_names_from_state(state)
    roles = _roles_present(names) if names else {
        "optical": True, "compute": True, "display": True,
    }
    # A device flagged instrument with empty BoM still packs the default work
    # (optical + display) — never falls back to mass air.
    body = minimum_working_envelope_mm(
        optical_path_mm=_optical_path_mm_from_state(state),
        has_optical=roles.get("optical", True),
        has_display=roles.get("display", True) or roles.get("compute", True),
    )
    # R4 (2026-07-21): grow the envelope to honestly PACK the design's large
    # mechanical / fluidic parts (stir drive, pump, vial holder, culture vessel) —
    # otherwise the placed part stack sprawls outside the declared enclosure (the
    # organoid phenotype 2.2× sprawl). Universal: a pocket-electronics instrument
    # carries no such part → stack is None → body is unchanged. The 155 mm handheld
    # cap in minimum_working_envelope_mm is a POCKET floor for the optical-UI pack;
    # a benchtop device whose real parts exceed it is benchtop-scale, not handheld,
    # so the part-stack pack legitimately raises W/D above the handheld cap.
    stack = _functional_stack_footprint_mm(names)
    if stack is not None:
        bw, bd, bh = body
        sw, sd = stack
        # Body clearance walls around the packed part stack (both faces).
        sw += _CLEARANCE_MM * 2.0
        sd += _CLEARANCE_MM * 2.0
        w = max(bw, sw)
        d = max(bd, sd)
        # Height: the mechanical stack (stir drive ~60 mm etc.) sits in the body, so
        # the enclosure body is taller than the thin electronics slab. Scale the body
        # height with how much the footprint grew, capped so a wide-flat pack does not
        # mint a cube; the proud vessel on TOP is handled by the 1.8× phenotype tol.
        h = max(bh, min(0.42 * min(w, d), 90.0))
        if d > w:
            w, d = d, w
        body = (round(w, 1), round(d, 1), round(h, 1))
    return body


def apply_brief_ceiling(
    packed: tuple[float, float, float],
    brief_max: Optional[tuple[float, float, float]],
) -> tuple[tuple[float, float, float], bool]:
    """Brief max is a ceiling. Packed work must fit; we never inflate to fill it.

    @returns ((w,d,h), breached) — if breached, returns packed (honest size) and True.
    """
    if not brief_max:
        return packed, False
    bw, bd, bh = brief_max
    pw, pd, ph = packed
    if pw <= bw + 0.5 and pd <= bd + 0.5 and ph <= bh + 0.5:
        # Fits — stay at packed (as small as possible), do not grow to brief.
        return packed, False
    return packed, True


def _selftest() -> None:
    """proveCatch: pack beats mass-air; brief ceiling does not inflate."""
    # Optical + display handheld with 10 mm path — must be pocket-scale, not 183 mm.
    w, d, h = minimum_working_envelope_mm(optical_path_mm=10.0)
    assert w <= hfi.HANDHELD_MAX_EDGE_MM, (w, d, h)
    assert d < w, (w, d, h)
    assert h < d, (w, d, h)
    assert w < 160.0, f"packed width must beat mass-air 183 mm, got {w}"
    assert w >= 90.0, f"must still fit display+optics, got {w}"
    # Longer optical path needs a wider/taller chamber contribution.
    w20, d20, h20 = minimum_working_envelope_mm(optical_path_mm=20.0)
    assert w20 >= w - 0.1, (w, w20)

    # Brief ceiling larger than pack → stay packed (do not fill the brief).
    packed = (110.0, 85.0, 34.0)
    out, breached = apply_brief_ceiling(packed, (200.0, 150.0, 80.0))
    assert out == packed and breached is False, (out, breached)

    # Brief smaller than pack → breached, still report honest packed size.
    out2, breached2 = apply_brief_ceiling(packed, (80.0, 60.0, 20.0))
    assert breached2 is True and out2 == packed, (out2, breached2)

    # State path: instrument + gold-spine names → optical+display pack.
    st = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"requirement": "Compute UI Module", "tag": "I-201"},
            {"requirement": "LED Source Board", "tag": "X-201"},
            {"requirement": "Cuvette Holder", "tag": "X-205"},
        ],
        "orchestratorContract": {
            "quantities": {
                "optical_path_length_mm": {"value": 10},
                "design_envelope_width_mm": {
                    "value": 183,
                    "condition": "derived_device_scale — synthesised landscape",
                },
            }
        },
    }
    env = minimum_working_envelope_from_state(st)
    assert env is not None and env[0] < 160, env

    # Non-instrument → None (plant untouched).
    assert minimum_working_envelope_from_state({"isInstrumentDevice": False}) is None

    # proveCatch: mass-air 183×145 must LOSE to packed when wired (caller test).
    mass_air = (182.7, 144.9, 75.6)
    assert env[0] < mass_air[0] and env[1] < mass_air[1], (env, mass_air)

    # ── R4 (2026-07-21): functional part-stack pack ──────────────────────────
    # proveCatch (organoid-bioreactor 2150): a benchtop bioreactor carries large
    # mechanical/fluidic parts (stir drive, pump, vial holder). The envelope MUST grow
    # to pack them — otherwise the placed stack sprawls ~2.2× outside the enclosure.
    _bio = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"requirement": "Magnetic Stirrer Drive"},
            {"requirement": "Dosing Peristaltic Pump"},
            {"requirement": "Vial Holder Fixture"},
            {"requirement": "Culture Vessel"},
            {"requirement": "Front Panel Connector Ports"},
            {"requirement": "Microcontroller Mcu"},
            {"requirement": "Heatsink Fan"},
            {"requirement": "Media Tubing Set"},
        ],
    }
    _bio_env = minimum_working_envelope_from_state(_bio)
    assert _bio_env is not None
    # The design's placed part stack is ~221 mm on its long edge; the enclosure must be
    # in the SAME class (≥ ~180 mm), not the 102 mm pocket box that sprawled at 2.2×.
    assert max(_bio_env) >= 180.0, (
        f"bioreactor envelope must pack its mechanical stack (≥180 mm), got {_bio_env}")
    # And it must not massively over-shoot the real stack (would render an empty box):
    assert max(_bio_env) <= 300.0, (
        f"bioreactor envelope must not inflate far past the part stack, got {_bio_env}")
    _stack = _functional_stack_footprint_mm(
        [b["requirement"] for b in _bio["requirementsBom"]])
    assert _stack is not None and max(_stack) >= 180.0, _stack
    # proveNoFalsePositive: a POCKET electronics instrument (no mechanical part) stays
    # pocket-scale — the part-stack pack must not fire on it.
    _pocket = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"requirement": "Compute UI Module"},
            {"requirement": "Microcontroller Mcu"},
            {"requirement": "USB Interface"},
            {"requirement": "Status LED"},
        ],
    }
    _pocket_env = minimum_working_envelope_from_state(_pocket)
    assert _pocket_env is not None and max(_pocket_env) < 160.0, (
        f"pocket electronics must stay small (no mechanical stack), got {_pocket_env}")
    assert _functional_stack_footprint_mm(
        [b["requirement"] for b in _pocket["requirementsBom"]]) is None, (
        "pocket electronics must carry NO footprint-driving mechanical part")

    print(
        f"minimum_working_envelope _selftest: OK "
        f"(10 mm path → {w}×{d}×{h} mm body; state → {env[0]}×{env[1]}×{env[2]} mm)"
    )


if __name__ == "__main__":
    _selftest()
