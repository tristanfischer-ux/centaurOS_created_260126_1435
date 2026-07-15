#!/usr/bin/env python3
"""draw_distribution_interface.py — UNIVERSAL multi-tier distribution INTERFACE detail.

T-20 / Sam Green SME: when a plant delivers to multi-level cultivation / distribution
geometry (contract carries `distribution_levels_per_branch` ≥ 2, or equivalent
levels/tiers/layers signal), emit a DETAIL sheet projecting:
  · levels per branch (tiers)
  · position pitch along the row
  · supply + drain per tier

The rack FRAME itself may be out of scope — the INTERFACE (pipe / valve / drain
geometry at each tier) is in scope. UNIVERSAL: any class with multi-level
distribution geometry gets the sheet; a single-level / no-geometry plant is a
no-op (generator returns not_applicable).

INPUT: state.json (contract quantities). No Blender / CAD artifacts required.
OUTPUT: drawings/distribution-interface.svg (+ .png when a rasteriser is available).
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

_THIS = Path(__file__).resolve().parent
if str(_THIS) not in sys.path:
    sys.path.insert(0, str(_THIS))

try:
    import drawing_titleblock as _tb
except ImportError:
    _tb = None  # type: ignore


INK = "#1a1a1a"
EQ_INK = "#10243e"
MUTED = "#5b6573"
SUPPLY_INK = "#1d4ed8"
DRAIN_INK = "#7c2d12"
FILL_BG = "#fafafa"
GRID = "#e5e7eb"


class SVG:
    def __init__(self, w: float, h: float):
        self.w, self.h = w, h
        self.parts: list[str] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def rect(self, x, y, w, h, stroke=INK, width=1.2, fill="none", rx=0):
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" fill="{fill}"'
                 f'{f" rx=\"{rx}\"" if rx else ""}/>')

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.2, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}"{d}/>')

    def text(self, x, y, s, size=10, anchor="start", fill=INK, weight="normal"):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" '
                 f'text-anchor="{anchor}" fill="{fill}" font-weight="{weight}" '
                 f'font-family="Helvetica,Arial,sans-serif">{_esc(s)}</text>')

    def circle(self, cx, cy, r, stroke=INK, width=1.2, fill="none"):
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" fill="{fill}"/>')

    def render(self) -> str:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
                f'<rect width="100%" height="100%" fill="white"/>'
                + "".join(self.parts) + "</svg>")


def _esc(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _qty(state: dict, *keys) -> float:
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities") or {}
        if not isinstance(q, dict):
            continue
        for k in keys:
            if k in q:
                v = q[k]
                val = v.get("value") if isinstance(v, dict) else v
                try:
                    return float(val)
                except (TypeError, ValueError):
                    continue
    return 0.0


def distribution_geometry(state: dict) -> Optional[dict]:
    """Extract multi-tier distribution geometry from contract quantities.

    Returns None when levels < 2 (single-level / no geometry → not applicable).
    UNIVERSAL signals — never a class name.
    """
    levels = int(round(_qty(state, "distribution_levels_per_branch",
                            "layers_per_tunnel", "tiers_per_rack",
                            "distribution_tiers")))
    if levels < 2:
        return None
    pitch = _qty(state, "distribution_position_pitch_mm", "container_length_mm") or 2760.0
    width = _qty(state, "distribution_position_width_mm", "container_width_mm") or 1290.0
    valve_dn = int(round(_qty(state, "distribution_zone_valve_dn_mm") or 65))
    risers = int(round(_qty(state, "distribution_risers_per_branch") or 2))
    positions = int(round(_qty(state, "distribution_positions_per_zone") or 30))
    rows = int(round(_qty(state, "distribution_zone_rows") or 2))
    return {
        "levels": levels,
        "pitch_mm": pitch,
        "width_mm": width,
        "valve_dn_mm": valve_dn,
        "risers": risers,
        "positions_per_zone": positions,
        "zone_rows": rows,
    }


def build_interface_svg(geo: dict, archetype: str = "process_plant") -> str:
    """Render a DETAIL sheet: elevation of N tiers with supply + drain per level."""
    levels = geo["levels"]
    pitch = geo["pitch_mm"]
    width = geo["width_mm"]
    valve_dn = geo["valve_dn_mm"]
    risers = geo["risers"]

    margin = 48
    title_h = 110
    tier_h = 72
    content_h = levels * tier_h + 80
    width_px = 920
    height_px = margin + 40 + content_h + title_h
    svg = SVG(width_px, height_px)

    svg.text(margin, 36, "DISTRIBUTION INTERFACE DETAIL", size=16, weight="bold",
             fill=EQ_INK)
    svg.text(margin, 54,
             f"{levels} levels · pitch {pitch:.0f} mm · position width {width:.0f} mm · "
             f"DN{valve_dn} zone valves · {risers} riser(s) per branch",
             size=9.5, fill=MUTED)
    svg.text(margin, 70,
             "Supply + drain per tier — rack frame out of scope; the pipe/valve "
             "interface is in scope. Not for construction.",
             size=8.8, fill=MUTED)

    # legend
    lx = width_px - 220
    svg.line(lx, 40, lx + 28, 40, stroke=SUPPLY_INK, width=2.2)
    svg.text(lx + 34, 44, "Supply (pressurised)", size=8.2, fill=MUTED)
    svg.line(lx, 56, lx + 28, 56, stroke=DRAIN_INK, width=2.2, dash="4,3")
    svg.text(lx + 34, 60, "Drain (gravity return)", size=8.2, fill=MUTED)

    # draw tiers top→bottom (level N at top)
    origin_x = margin + 80
    origin_y = 100
    branch_w = 520
    for i in range(levels):
        # level index: top = highest tier
        lvl = levels - i
        y = origin_y + i * tier_h
        # bench / tray outline (the INTERFACE plane — not the rack frame)
        svg.rect(origin_x, y, branch_w, 36, stroke=EQ_INK, width=1.3, fill=FILL_BG, rx=2)
        svg.text(origin_x - 8, y + 22, f"L{lvl}", size=11, anchor="end",
                 weight="bold", fill=EQ_INK)
        svg.text(origin_x + 10, y + 22,
                 f"tier interface · {geo['positions_per_zone']} positions "
                 f"({geo['zone_rows']} rows)",
                 size=8.5, fill=MUTED)
        # supply header along the back of the tier
        sy = y + 8
        svg.line(origin_x + 8, sy, origin_x + branch_w - 8, sy,
                 stroke=SUPPLY_INK, width=2.0)
        # zone valve mark mid-span
        vx = origin_x + branch_w / 2
        svg.circle(vx, sy, 5, stroke=SUPPLY_INK, width=1.4, fill="white")
        svg.text(vx, sy - 10, f"XV DN{valve_dn}", size=7.2, anchor="middle", fill=SUPPLY_INK)
        # drain collector along the front
        dy = y + 28
        svg.line(origin_x + 8, dy, origin_x + branch_w - 8, dy,
                 stroke=DRAIN_INK, width=1.8, dash="4,3")
        svg.text(origin_x + branch_w - 8, dy + 12, "drain → pit",
                 size=7.0, anchor="end", fill=DRAIN_INK)

    # riser stubs on the left
    riser_x = origin_x - 36
    svg.line(riser_x, origin_y, riser_x, origin_y + (levels - 1) * tier_h + 36,
             stroke=SUPPLY_INK, width=2.4)
    svg.text(riser_x, origin_y - 8, f"DN riser ×{risers}", size=8.0,
             anchor="middle", fill=SUPPLY_INK)
    for i in range(levels):
        y = origin_y + i * tier_h + 8
        svg.line(riser_x, y, origin_x, y, stroke=SUPPLY_INK, width=1.4)

    # pitch dimension under the stack
    dim_y = origin_y + levels * tier_h + 20
    svg.line(origin_x, dim_y, origin_x + min(branch_w, pitch / 10), dim_y,
             stroke=MUTED, width=1.0)
    svg.text(origin_x + 4, dim_y + 14,
             f"position pitch ≈ {pitch:.0f} mm (along row)", size=8.2, fill=MUTED)

    # title block
    y0 = height_px - title_h + 20
    svg.line(margin, y0, width_px - margin, y0, stroke=INK, width=1.4)
    svg.text(margin, y0 + 22, "FRACTIONAL FORGE · ForgeOS", size=11, weight="bold")
    svg.text(margin, y0 + 40,
             f"DISTRIBUTION INTERFACE — {_humanise(archetype)}",
             size=13, weight="bold", fill=EQ_INK)
    svg.text(margin, y0 + 56,
             "Detail sheet · multi-tier supply + drain interface · not for construction.",
             size=8.8, fill=MUTED)
    if _tb is not None:
        svg.text(margin, y0 + 72, _tb.TOLERANCE_NOTE, size=8.0, fill=MUTED)
    return svg.render()


def _humanise(s: str) -> str:
    return (s or "process_plant").replace("_", " ").strip().title()


def _archetype(state: dict) -> str:
    for ck in ("parsedBrief", "engineeringContract", "orchestratorContract"):
        c = state.get(ck) or {}
        pc = c.get("product_class") or c.get("productClass")
        if pc:
            return str(pc)
    return "process_plant"


def should_emit(state: dict) -> bool:
    return distribution_geometry(state) is not None


def generate(out_dir: str, state_path: Optional[str] = None,
             rasterise_png: bool = True) -> dict:
    out = Path(out_dir)
    state_p = Path(state_path) if state_path else out / "state.json"
    state = json.loads(state_p.read_text()) if state_p.is_file() else {}
    geo = distribution_geometry(state)
    draw_dir = out / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "distribution-interface.svg"
    png_path = draw_dir / "distribution-interface.png"
    if geo is None:
        # honest not-applicable — remove stale artefacts so the manifest doesn't
        # claim a sheet that no longer applies
        for p in (svg_path, png_path):
            if p.exists():
                p.unlink()
        return {"ok": False, "not_applicable": True,
                "reason": "no multi-tier distribution geometry "
                          "(distribution_levels_per_branch < 2)"}
    arch = _archetype(state)
    svg_text = build_interface_svg(geo, arch)
    # Stamp settled parts-manifest fingerprint (G16 — all drawings one generation).
    try:
        from placement_fp import embed_svg_placement_fp, load_manifest_placement_fp
        _fp = load_manifest_placement_fp(str(out_dir))
        if _fp:
            svg_text = embed_svg_placement_fp(svg_text, _fp)
    except Exception as _fpe:  # noqa: BLE001
        print(f"[draw] placement_fp stamp skipped: {_fpe}")
    svg_path.write_text(svg_text)
    png_ok = False
    if rasterise_png:
        png_ok = _rasterise(svg_path, png_path)
    return {
        "ok": True, "not_applicable": False, "archetype": arch,
        "levels": geo["levels"], "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
    }


def _rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=int(920 * scale), output_height=int(700 * scale),
                         background_color="white")
        if png_path.is_file() and png_path.stat().st_size > 500:
            return True
    except Exception:
        pass
    rsvg = shutil.which("rsvg-convert")
    if rsvg:
        try:
            subprocess.run([rsvg, "-w", str(920 * scale), "-b", "white",
                            "-o", str(png_path), str(svg_path)],
                           check=True, capture_output=True, timeout=60)
            return png_path.is_file() and png_path.stat().st_size > 500
        except Exception:
            pass
    return False


def _selftest() -> int:
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    # proveCatch — multi-tier geometry emits the sheet with N levels + supply/drain
    multi = {"orchestratorContract": {"product_class": "water_treatment",
                                      "quantities": {
                                          "distribution_levels_per_branch": {"value": 5},
                                          "distribution_position_pitch_mm": {"value": 2760},
                                          "distribution_position_width_mm": {"value": 1290},
                                          "distribution_zone_valve_dn_mm": {"value": 65},
                                          "distribution_risers_per_branch": {"value": 2},
                                          "distribution_positions_per_zone": {"value": 30},
                                          "distribution_zone_rows": {"value": 2},
                                      }}}
    geo = distribution_geometry(multi)
    chk("multi_tier_detected", geo is not None and geo["levels"] == 5)
    svg = build_interface_svg(geo, "water_treatment")
    chk("emits_all_five_levels", all(f">L{i}<" in svg or f"L{i}" in svg
                                     for i in range(1, 6)))
    chk("emits_supply_legend", "Supply" in svg)
    chk("emits_drain_legend", "Drain" in svg)
    chk("emits_valve_dn", "DN65" in svg)
    chk("should_emit_true", should_emit(multi) is True)

    # proveNoFalsePositive — single-level / no geometry → not applicable
    single = {"orchestratorContract": {"quantities": {
        "distribution_levels_per_branch": {"value": 1},
    }}}
    chk("single_level_silent", distribution_geometry(single) is None)
    chk("should_emit_false_single", should_emit(single) is False)
    bess = {"orchestratorContract": {"quantities": {
        "battery_rack_count": {"value": 14},
    }}}
    chk("bess_silent", distribution_geometry(bess) is None)
    chk("should_emit_false_bess", should_emit(bess) is False)

    for f in fails:
        print(f"[dist-iface][selftest] FAIL {f}")
    print(f"[dist-iface][selftest] {'PASS' if not fails else 'FAIL'} "
          f"({len(fails)} failure(s))")
    return 1 if fails else 0


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] in ("--selftest", "selftest"):
        return _selftest()
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    summary = generate(out_dir, state_path)
    if summary.get("not_applicable"):
        print(f"[dist-iface] not applicable — {summary.get('reason')}")
        return 0
    print(f"[dist-iface] levels={summary.get('levels')} SVG → {summary.get('svg')}")
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
