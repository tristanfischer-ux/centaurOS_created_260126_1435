#!/usr/bin/env python3
"""ga_glance_audit.py — DETERMINISTIC "5-second glance" audit of a delivered GA SVG.

INTENT (Tristan 2026-07-14): fingerprint gates (G15/G16) can ALL-PASS while the
sheet still fails a chartered-engineer glance — empty "door removed" elevations,
title-block metres that round a handheld to 0.1×0.1×0.1 m, form markers missing.
This module audits the DELIVERED SVG text (what the PNG was rasterised from),
not state.json intent. OPERATING-FRAME §0.5 SIGHT: render-then-reingest.

UPDATED (2026-07-14): instrument Assembly is a cover-removed stack-up (PCB +
optics + tags). "Cover removed" is HONEST when equipment tags are present;
FORBIDDEN when the sheet is only an empty form silhouette.

UNIVERSAL — keyed on claims present in the SVG + product/instrument signals,
never a product noun. Every finding names the SOURCE stage to fix.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class GaGlanceFinding:
    code: str
    detail: str
    fix_stage: str


_DOOR_REMOVED_RE = re.compile(
    r"door\s+removed|looking\s+in|cutaway\s+orientation|cover\s+removed|"
    r"assembly\s+internals",
    re.I)
_ENVELOPE_RE = re.compile(
    r"(?:product|Overall\s+plant)\s+envelope\s+"
    r"([\d.]+)\s*m\s*\(L\)\s*[×x]\s*"
    r"([\d.]+)\s*m\s*\(W\)\s*[×x]\s*"
    r"([\d.]+)\s*m\s*\(H\)",
    re.I,
)
_EQUIP_TAG_RE = re.compile(r">\s*([A-Z]{1,3}-\d{2,4})\s*<")
_TITLE_COUNT_RE = re.compile(r"·\s*(\d+)\s+equipment items", re.I)
_SCHEDULE_TAG_RE = re.compile(
    r">\s*([A-Z]{1,3}-\d{2,4}(?:…[A-Z]{1,3}-\d{2,4})?)\s*<", re.I)


def _count_form_markers(svg: str) -> dict:
    """Count instrument form-rule silhouette markers on the delivered sheet."""
    return {
        "optical": len(re.findall(r">\s*OPTICAL\s*<", svg, re.I)),
        "ui_deck": len(re.findall(r">\s*UI\s*DECK\s*<", svg, re.I)),
        "display_fill": len(re.findall(r'fill="#c8e6d8"', svg, re.I)),
        "pcb": len(re.findall(r'data-glance="(?:front|top)-pcb"', svg, re.I)),
        # Button squares from form rule: small none-fill rects ~ button size.
        "small_none_rects": len(re.findall(
            r'<rect[^>]*fill="none"[^>]*stroke="#5b6470"', svg, re.I)),
        # Thermocycler / PCR form (NinjaPCR 2026-07-15) — not optical.
        "sample_block": len(re.findall(
            r'data-glance="(?:front|top)-sample-block"|SAMPLE\s*BLOCK', svg, re.I)),
        "tec": len(re.findall(r'data-glance="top-tec"|>\s*TEC\s*<', svg, re.I)),
        "lid": len(re.findall(r'data-glance="front-lid"|>\s*LID\s*<', svg, re.I)),
    }


def _dimension_mm_candidates(svg: str) -> list[float]:
    """Collect plausible overall dimension labels (mm) from the SVG."""
    vals: list[float] = []
    for m in re.finditer(r">(\d{2,4})</text>", svg):
        try:
            v = float(m.group(1))
        except (TypeError, ValueError):
            continue
        # Handheld / bench overall dims live in this band; plant spans are larger.
        if 40.0 <= v <= 2500.0:
            vals.append(v)
    return vals


def _equipment_tag_count(svg: str) -> int:
    return len(_EQUIP_TAG_RE.findall(svg))


def _unique_equipment_tags(svg: str) -> list[str]:
    return sorted(set(_EQUIP_TAG_RE.findall(svg)))


def _title_equipment_count(svg: str) -> Optional[int]:
    m = _TITLE_COUNT_RE.search(svg or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except (TypeError, ValueError):
        return None


def _schedule_row_count(svg: str) -> int:
    """Count principal rows in the equipment schedule panel.

    The schedule lists each tag once as a left-column cell; elevation callouts
    also use the same tag pattern. Prefer the title-block count vs unique tags
    when the schedule header is present; fall back to unique tags on the sheet.
    """
    if "EQUIPMENT SCHEDULE" not in (svg or "").upper() and "Equipment schedule" not in (svg or ""):
        return len(_unique_equipment_tags(svg))
    # Unique tags on an instrument Assembly after zone-collapse ≈ schedule rows.
    return len(_unique_equipment_tags(svg))


def _dense_tag_ladder(svg: str) -> bool:
    """True when the same equipment tag is stamped too many times.

    INTENT: G9 IoU misses ~12 px ladders (no bbox overlap). A well-behaved
    instrument sheet stamps each principal ≤4× (schedule + top + front + side).
    A dense elevation ladder reprints the same tag 6+ times — zone-collapse
    must keep FRONT/SIDE ≤1 tag per zone.
    """
    from collections import Counter
    tags = _EQUIP_TAG_RE.findall(svg or "")
    if not tags:
        return False
    counts = Counter(tags)
    return max(counts.values()) >= 6


def audit_ga_svg(
    svg_text: str,
    *,
    is_instrument_device: bool = False,
    is_product_scale: bool = False,
    requires_optical_silhouette: bool | None = None,
) -> list[GaGlanceFinding]:
    """PURE glance audit — findings a 5-second human look would raise.

    @description Reads the delivered GA SVG. Returns [] when the sheet clears
                 the glance checks. Never touches the filesystem.
    @param svg_text Full general-arrangement.svg contents.
    @param is_instrument_device Handheld / optical instrument signal.
    @param is_product_scale Sealed cabinet / product (non-plant) signal.
    @param requires_optical_silhouette When False, skip OPTICAL chamber demand
           (lab_electronics / bench_power / non-optical forms). When None,
           default True for backward-compatible optical-family selftests.
    @returns List of GaGlanceFinding (empty = glance PASS).
    """
    if not svg_text or len(svg_text) < 80:
        return [GaGlanceFinding(
            "ga_missing",
            "general-arrangement.svg missing or empty — nothing to glance",
            "draw_ga.generate_ga",
        )]
    findings: list[GaGlanceFinding] = []
    product = bool(is_instrument_device or is_product_scale)
    tag_hits = _equipment_tag_count(svg_text)
    claims_cutaway = bool(_DOOR_REMOVED_RE.search(svg_text))

    # ── 1. Cutaway / cover-removed claim vs delivered geometry ─────────────
    # Instrument Assembly MAY claim cover-removed when BoM tags are on the sheet.
    # Claiming cover-removed over an empty form silhouette is the Goodhart lie.
    if is_instrument_device and claims_cutaway and tag_hits < 3:
        findings.append(GaGlanceFinding(
            "cutaway_claim_without_parts",
            "instrument GA claims 'cover removed / assembly internals' but has "
            f"only {tag_hits} equipment tag(s) — that promises a stack-up "
            "(PCB + optics) the sheet does not draw",
            "draw_ga._seat_instrument_parts_in_form + FRONT/TOP part draw",
        ))
    elif product and (not is_instrument_device) and claims_cutaway:
        if tag_hits < 2:
            findings.append(GaGlanceFinding(
                "door_removed_empty_elevation",
                "GA claims 'door removed · looking in' but has no equipment tags "
                "— empty elevation fails the glance",
                "draw_ga FRONT elevation content + subtitle honesty",
            ))

    # ── 2. Title-block envelope units ──────────────────────────────────────
    env = _ENVELOPE_RE.search(svg_text)
    dims = _dimension_mm_candidates(svg_text)
    if product and env and dims:
        el, ew, eh = (float(env.group(1)), float(env.group(2)), float(env.group(3)))
        drawn_max = max(dims)
        if drawn_max < 500.0 and "m (L)" in env.group(0):
            findings.append(GaGlanceFinding(
                "envelope_vs_dimension_mismatch",
                f"title-block prints metres ({el:.1f}×{ew:.1f}×{eh:.1f} m) for a "
                f"sub-500 mm product (sheet shows {drawn_max:.0f} mm) — glance "
                f"rejects the title block; print the envelope in millimetres",
                "draw_ga._draw_title_block (print product envelope in mm)",
            ))

    # ── 3. Instrument form / assembly markers ──────────────────────────────
    if is_instrument_device:
        markers = _count_form_markers(svg_text)
        is_thermocycler = (
            markers.get("sample_block", 0) >= 1
            or bool(re.search(r"SAMPLE\s*BLOCK|thermocycler|\bpcr\b", svg_text, re.I))
        )
        if is_thermocycler:
            # INTENT (NinjaPCR 2026-07-15): PCR form is sample-block/TEC/lid —
            # optical/UI-deck/D-pad requirements are colorimeter-family only.
            if markers.get("sample_block", 0) < 1:
                findings.append(GaGlanceFinding(
                    "thermocycler_missing_sample_block",
                    "thermocycler GA has no SAMPLE BLOCK marker — tube-block "
                    "orientation is missing",
                    "draw_ga._draw_thermocycler_form_silhouettes",
                ))
            if markers.get("tec", 0) < 1 and markers.get("lid", 0) < 1:
                findings.append(GaGlanceFinding(
                    "thermocycler_missing_tec_or_lid",
                    "thermocycler GA has neither TEC nor LID cue — thermal stack "
                    "is unreadable",
                    "draw_ga._draw_thermocycler_form_silhouettes",
                ))
        else:
            # INTENT (2026-07-28): draw_ga only stamps OPTICAL when
            # exterior_signature_families contains optical-tower. Lab electronics /
            # bench power instruments must NOT fail for a missing optical chamber.
            _need_optical = (
                True if requires_optical_silhouette is None
                else bool(requires_optical_silhouette)
            )
            if _need_optical and markers["optical"] < 1:
                findings.append(GaGlanceFinding(
                    "instrument_missing_optical_silhouette",
                    "instrument GA has no OPTICAL form-rule marker — sheet cannot "
                    "orient the optical chamber",
                    "draw_ga._draw_instrument_form_silhouettes",
                ))
            if markers["ui_deck"] < 1 and markers["display_fill"] < 1:
                findings.append(GaGlanceFinding(
                    "instrument_missing_ui_silhouette",
                    "instrument GA has neither UI DECK nor display fill — HMI plane absent",
                    "draw_ga._draw_instrument_form_silhouettes",
                ))
            if markers["small_none_rects"] < 4:
                findings.append(GaGlanceFinding(
                    "instrument_missing_dpad",
                    f"instrument GA has {markers['small_none_rects']} button-scale squares "
                    f"(need ≥4 for a D-pad) — TOP fails the Blender HMI glance",
                    "draw_ga._draw_instrument_form_silhouettes button_locs",
                ))
        # Assembly stack-up: when cover-removed is claimed, PCB plane + tags required.
        if claims_cutaway:
            if markers["pcb"] < 1:
                findings.append(GaGlanceFinding(
                    "instrument_assembly_missing_pcb",
                    "instrument Assembly claims cover-removed but has no PCB plane "
                    "(data-glance front-pcb / top-pcb) — the board stack-up is invisible",
                    "draw_ga._draw_instrument_form_silhouettes assembly_cutaway",
                ))
            if tag_hits < 3:
                findings.append(GaGlanceFinding(
                    "instrument_assembly_missing_tags",
                    f"instrument Assembly has only {tag_hits} equipment tag(s) — "
                    "a real assembly drawing names the PCB / optics / HMI parts",
                    "draw_ga FRONT/TOP part draw after _seat_instrument_parts_in_form",
                ))
        # Exterior-form path still needs FRONT-scoped HMI stamps (optical family only).
        if (not is_thermocycler) and "product form" in svg_text.lower():
            has_front_display = 'data-glance="front-display"' in svg_text
            has_front_ui = (
                'data-glance="front-ui-deck"' in svg_text
                or 'data-glance="front-ui-label"' in svg_text
            )
            if not has_front_display or not has_front_ui:
                findings.append(GaGlanceFinding(
                    "instrument_front_missing_hmi",
                    "FRONT claims 'product form · matches Blender exterior' but has no "
                    "FRONT-scoped HMI (data-glance front-display / front-ui-*)",
                    "draw_ga._draw_instrument_form_silhouettes FRONT HMI band",
                ))

        # ── 4. Dense tag ladder (G9-blind ~12 px pitch) ─────────────────────
        if claims_cutaway and _dense_tag_ladder(svg_text):
            from collections import Counter
            _top = Counter(_EQUIP_TAG_RE.findall(svg_text)).most_common(1)[0]
            findings.append(GaGlanceFinding(
                "instrument_dense_tag_ladder",
                f"tag {_top[0]} stamped {_top[1]}× (threshold 6) — a dense "
                "elevation ladder fails the glance even when G9 IoU is zero; "
                "collapse to ≤1 tag per zone (PCB / Optical / HMI)",
                "draw_ga._instrument_zone_tag_items",
            ))

        # ── 5. Title count vs schedule honesty ───────────────────────────────
        title_n = _title_equipment_count(svg_text)
        sched_n = _schedule_row_count(svg_text)
        if title_n is not None and sched_n > 0 and title_n > sched_n + 2:
            findings.append(GaGlanceFinding(
                "title_count_vs_schedule_mismatch",
                f"title block claims {title_n} equipment items but the sheet "
                f"names ~{sched_n} unique principal tag(s) — Goodhart title vs "
                "schedule; title count must match the equipment schedule",
                "draw_ga._draw_title_block meta['count'] from _principal_schedule_rows",
            ))

    return findings


def ga_glance_coherent(
    svg_text: str,
    *,
    is_instrument_device: bool = False,
    is_product_scale: bool = False,
    requires_optical_silhouette: bool | None = None,
) -> tuple[bool, str]:
    """Gate-shaped wrapper — (ok, detail) for drawing_gates G17."""
    findings = audit_ga_svg(
        svg_text,
        is_instrument_device=is_instrument_device,
        is_product_scale=is_product_scale,
        requires_optical_silhouette=requires_optical_silhouette,
    )
    if not findings:
        return True, "GA clears deterministic 5-second glance checks"
    detail = "; ".join(f"{f.code}: {f.detail}" for f in findings[:3])
    if len(findings) > 3:
        detail += f" (+{len(findings) - 3} more)"
    return False, detail


def _selftest() -> None:
    """proveCatch: empty cutaway lie fires; assembly with PCB+tags passes."""
    # BAD: cover-removed claim + optical form + NO part tags (the Goodhart lie).
    bad = '''<svg width="1000" height="1000">
      <text>FRONT (cover removed · assembly internals)</text>
      <text>product envelope 0.2 m (L) × 0.1 m (W) × 0.1 m (H) · 34 equipment items.</text>
      <text>183</text><text>145</text><text>120</text>
      <text>OPTICAL</text>
      <rect fill="#c8e6d8" width="40" height="20"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <text>UI DECK</text>
    </svg>'''
    bad_f = audit_ga_svg(bad, is_instrument_device=True, is_product_scale=True)
    codes = {f.code for f in bad_f}
    assert "cutaway_claim_without_parts" in codes, codes
    assert "envelope_vs_dimension_mismatch" in codes, codes

    # GOOD assembly: cover removed + tags + PCB plane + form markers + mm envelope.
    # Title count matches unique tags (no Goodhart 34-vs-4).
    good_asm = '''<svg width="1000" height="1000">
      <text>FRONT (cover removed · assembly internals)</text>
      <text>product envelope 183 × 145 × 120 mm (L×W×H) · 4 equipment items.</text>
      <text>EQUIPMENT SCHEDULE</text>
      <text>183</text><text>145</text><text>120</text>
      <text>OPTICAL</text><text>UI DECK</text>
      <text>I-113</text><text>X-112</text><text>I-114</text><text>I-108</text>
      <rect fill="#c8e6d8" width="40" height="20" data-glance="front-display"/>
      <rect fill="#e8eef5" data-glance="front-ui-deck"/>
      <rect fill="#c5e1a5" data-glance="front-pcb"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
    </svg>'''
    good_f = audit_ga_svg(good_asm, is_instrument_device=True, is_product_scale=True)
    assert good_f == [], [f.code for f in good_f]

    # proveCatch: title 36 vs ~4 unique tags MUST fail (colorimeter Goodhart).
    bad_count = good_asm.replace("· 4 equipment items", "· 36 equipment items")
    bad_c = audit_ga_svg(bad_count, is_instrument_device=True, is_product_scale=True)
    assert any(f.code == "title_count_vs_schedule_mismatch" for f in bad_c), [f.code for f in bad_c]

    # proveCatch: same tag stamped 6+ times = dense ladder.
    ladder = good_asm + "".join(f"<text>I-201</text>" for _ in range(6))
    lad_f = audit_ga_svg(ladder, is_instrument_device=True, is_product_scale=True)
    assert any(f.code == "instrument_dense_tag_ladder" for f in lad_f), [f.code for f in lad_f]

    # GOOD exterior (empty-massing fallback): product form + HMI stamps, no cutaway.
    good_ext = '''<svg width="1000" height="1000">
      <text>FRONT (product form · matches Blender exterior)</text>
      <text>product envelope 183 × 145 × 120 mm (L×W×H) · 0 equipment items.</text>
      <text>183</text><text>145</text><text>120</text>
      <text>OPTICAL</text><text>UI DECK</text>
      <rect fill="#c8e6d8" width="40" height="20" data-glance="front-display"/>
      <rect fill="#e8eef5" data-glance="front-ui-deck"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
      <rect fill="none" stroke="#5b6470" width="17" height="17"/>
    </svg>'''
    assert audit_ga_svg(good_ext, is_instrument_device=True) == []

    # Missing OPTICAL on instrument must fire (optical-family default).
    no_opt = good_ext.replace("OPTICAL", "CHAMBER")
    no_f = audit_ga_svg(no_opt, is_instrument_device=True)
    assert any(f.code == "instrument_missing_optical_silhouette" for f in no_f)

    # proveCatch: lab_electronics / bench_power must NOT demand OPTICAL.
    no_opt_ok = audit_ga_svg(
        no_opt, is_instrument_device=True, requires_optical_silhouette=False,
    )
    assert not any(f.code == "instrument_missing_optical_silhouette" for f in no_opt_ok), [
        f.code for f in no_opt_ok
    ]

    ok, _ = ga_glance_coherent(bad, is_instrument_device=True, is_product_scale=True)
    assert ok is False
    ok2, _ = ga_glance_coherent(good_asm, is_instrument_device=True, is_product_scale=True)
    assert ok2 is True
    print("ga_glance_audit _selftest: OK (empty-cutaway lie + assembly PCB+tags)")


if __name__ == "__main__":
    _selftest()
