#!/usr/bin/env python3
"""draw_facility_layout.py — UNIVERSAL facility / WTR layout sheet (T-25).

When a product has cultivation / distribution zones OUT OF SCOPE of the water /
treatment plant room, emit a facility-level plan that shows:
  · the WTR / process-plant equipment envelope (from parts-manifest when present)
  · off-page blocks for each out-of-scope cultivation / delivery zone group

UNIVERSAL: keyed on cultivation / distribution zone signals in the contract
(`distribution_delivery_groups`, `cultivation_container_count`,
`distribution_branch_runs`, nursery zone counts) — never a class name.
A plant with no cultivation/distribution zones is a no-op (not_applicable).

INPUT: state.json + optional parts-manifest.json (enrichment).
OUTPUT: drawings/facility-layout.svg (+ .png when a rasteriser is available).
"""
from __future__ import annotations

import json
import math
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
ZONE_FILL = "#f0f7ff"
ZONE_STROKE = "#3b82f6"
PLANT_FILL = "#fff7ed"
PLANT_STROKE = "#ff4500"
GRID = "#e5e7eb"
FILL_BG = "#fafafa"


class SVG:
    def __init__(self, w: float, h: float):
        self.w, self.h = w, h
        self.parts: list[str] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def rect(self, x, y, w, h, stroke=INK, width=1.2, fill="none", rx=0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" fill="{fill}"{d}'
                 f'{f" rx=\"{rx}\"" if rx else ""}/>')

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.2, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}"{d}/>')

    def text(self, x, y, s, size=10, anchor="start", fill=INK, weight="normal"):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" '
                 f'text-anchor="{anchor}" fill="{fill}" font-weight="{weight}" '
                 f'font-family="Helvetica,Arial,sans-serif">{_esc(s)}</text>')

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


def facility_zones(state: dict) -> Optional[dict]:
    """Detect cultivation / distribution zones that sit outside the plant room.

    Returns None when no zone signal exists (BESS / once-through / no cultivation).
    """
    groups = int(round(_qty(state, "distribution_delivery_groups",
                            "fertigation_dosing_pump_count")))
    nursery = int(round(_qty(state, "nursery_fertigation_dosing_pump_count",
                             "nursery_zone_count")))
    containers = int(round(_qty(state, "cultivation_container_count")))
    branches = int(round(_qty(state, "distribution_branch_runs")))
    levels = int(round(_qty(state, "distribution_levels_per_branch")))
    has_cultivation = containers >= 1 or branches >= 1 or levels >= 2
    if groups < 1 and nursery < 1 and not has_cultivation:
        return None
    # a lone in-plant pump with no cultivation signal is not a facility layout
    if groups <= 1 and nursery < 1 and not has_cultivation:
        return None
    if groups < 1 and has_cultivation:
        groups = max(1, int(round(_qty(state, "fertigation_dosing_pump_count") or 1)))
    zones = []
    for i in range(max(groups, 0)):
        zones.append({"key": f"delivery_group_{i + 1}",
                      "label": f"Delivery group {i + 1} — cultivation (out of scope)"})
    if nursery >= 1:
        zones.append({"key": "nursery",
                      "label": "Nursery zone — cultivation (out of scope)"})
    return {
        "zones": zones,
        "containers": containers,
        "branches": branches,
        "levels": levels,
        "groups": groups,
        "nursery": nursery,
    }


def _plant_envelope_from_manifest(out_dir: Path) -> Optional[dict]:
    man = out_dir / "parts-manifest.json"
    if not man.is_file():
        return None
    try:
        data = json.loads(man.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    bbox = data.get("bbox_mm") or {}
    if not bbox:
        return None
    L = float(bbox.get("length_mm") or
              (bbox.get("x_max_mm", 0) - bbox.get("x_min_mm", 0)) or 0)
    W = float(bbox.get("width_mm") or
              (bbox.get("y_max_mm", 0) - bbox.get("y_min_mm", 0)) or 0)
    if L <= 0 or W <= 0:
        return None
    n = int(data.get("count") or len(data.get("parts") or []))
    return {"L_mm": L, "W_mm": W, "n_parts": n}


def build_facility_svg(zones: dict, envelope: Optional[dict],
                       archetype: str = "process_plant") -> str:
    margin = 48
    title_h = 110
    n_zones = len(zones["zones"])
    # plant block on the left; zone blocks in a column on the right
    plant_w, plant_h = 280, 220
    zone_w, zone_h = 300, 56
    gap = 40
    content_h = max(plant_h, n_zones * (zone_h + 14) + 20)
    width_px = margin + plant_w + gap + zone_w + margin + 40
    height_px = margin + 80 + content_h + title_h
    svg = SVG(width_px, height_px)

    svg.text(margin, 36, "FACILITY / WTR LAYOUT", size=16, weight="bold", fill=EQ_INK)
    svg.text(margin, 54,
             f"{n_zones} cultivation zone block(s) · "
             f"{zones.get('containers') or '—'} containers · "
             f"{zones.get('branches') or '—'} branch runs · "
             f"{zones.get('levels') or '—'} levels/branch",
             size=9.5, fill=MUTED)
    svg.text(margin, 70,
             "WTR / process plant in scope; cultivation zones shown as off-page "
             "blocks (supplied by others). Not for construction.",
             size=8.8, fill=MUTED)

    # plant envelope block
    px, py = margin, 100
    svg.rect(px, py, plant_w, plant_h, stroke=PLANT_STROKE, width=2.0,
             fill=PLANT_FILL, rx=4)
    svg.text(px + plant_w / 2, py + 28, "WATER / TREATMENT PLANT",
             size=11, anchor="middle", weight="bold", fill=EQ_INK)
    svg.text(px + plant_w / 2, py + 46, "(in scope)", size=9, anchor="middle",
             fill=MUTED)
    if envelope:
        svg.text(px + plant_w / 2, py + 80,
                 f"envelope ≈ {envelope['L_mm'] / 1000:.1f} × "
                 f"{envelope['W_mm'] / 1000:.1f} m",
                 size=9, anchor="middle", fill=MUTED)
        svg.text(px + plant_w / 2, py + 98,
                 f"{envelope['n_parts']} principal items (see GA)",
                 size=8.5, anchor="middle", fill=MUTED)
    else:
        svg.text(px + plant_w / 2, py + 80, "RO · storage · fertigation · recovery",
                 size=8.8, anchor="middle", fill=MUTED)
        svg.text(px + plant_w / 2, py + 98, "(see General Arrangement)",
                 size=8.5, anchor="middle", fill=MUTED)
    svg.text(px + plant_w / 2, py + plant_h - 20, "FF-GA-001",
             size=8, anchor="middle", fill=MUTED)

    # zone off-page blocks
    zx = px + plant_w + gap
    for i, z in enumerate(zones["zones"]):
        zy = py + i * (zone_h + 14)
        svg.rect(zx, zy, zone_w, zone_h, stroke=ZONE_STROKE, width=1.6,
                 fill=ZONE_FILL, rx=3, dash="6,3")
        svg.text(zx + 12, zy + 22, z["label"], size=9.5, weight="bold", fill=EQ_INK)
        svg.text(zx + 12, zy + 40, "off-page · see P&ID delivery connectors",
                 size=7.8, fill=MUTED)
        # connector stub from plant to zone
        svg.line(px + plant_w, py + plant_h / 2, zx, zy + zone_h / 2,
                 stroke=ZONE_STROKE, width=1.2, dash="4,3")

    # legend
    ly = py + content_h + 10
    svg.rect(margin, ly, 18, 12, stroke=PLANT_STROKE, width=1.4, fill=PLANT_FILL)
    svg.text(margin + 24, ly + 10, "In-scope plant room", size=8.2, fill=MUTED)
    svg.rect(margin + 180, ly, 18, 12, stroke=ZONE_STROKE, width=1.4,
             fill=ZONE_FILL, dash="4,2")
    svg.text(margin + 204, ly + 10, "Out-of-scope cultivation zone", size=8.2, fill=MUTED)

    # title block
    y0 = height_px - title_h + 20
    svg.line(margin, y0, width_px - margin, y0, stroke=INK, width=1.4)
    svg.text(margin, y0 + 22, "FRACTIONAL FORGE · ForgeOS", size=11, weight="bold")
    svg.text(margin, y0 + 40,
             f"FACILITY LAYOUT — {_humanise(archetype)}",
             size=13, weight="bold", fill=EQ_INK)
    svg.text(margin, y0 + 56,
             "Facility plan · WTR equipment + cultivation zone blocks · not for construction.",
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
    return facility_zones(state) is not None


def generate(out_dir: str, state_path: Optional[str] = None,
             rasterise_png: bool = True) -> dict:
    out = Path(out_dir)
    state_p = Path(state_path) if state_path else out / "state.json"
    state = json.loads(state_p.read_text()) if state_p.is_file() else {}
    zones = facility_zones(state)
    draw_dir = out / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "facility-layout.svg"
    png_path = draw_dir / "facility-layout.png"
    if zones is None:
        for p in (svg_path, png_path):
            if p.exists():
                p.unlink()
        return {"ok": False, "not_applicable": True,
                "reason": "no cultivation / distribution zone signal"}
    envelope = _plant_envelope_from_manifest(out)
    arch = _archetype(state)
    svg_text = build_facility_svg(zones, envelope, arch)
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
        "zones": len(zones["zones"]), "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
    }


def _rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=int(800 * scale), output_height=int(600 * scale),
                         background_color="white")
        if png_path.is_file() and png_path.stat().st_size > 500:
            return True
    except Exception:
        pass
    rsvg = shutil.which("rsvg-convert")
    if rsvg:
        try:
            subprocess.run([rsvg, "-w", str(800 * scale), "-b", "white",
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

    multi = {"orchestratorContract": {"product_class": "water_treatment",
                                      "quantities": {
                                          "distribution_delivery_groups": {"value": 2},
                                          "fertigation_dosing_pump_count": {"value": 2},
                                          "nursery_fertigation_dosing_pump_count": {"value": 1},
                                          "cultivation_container_count": {"value": 6000},
                                          "distribution_branch_runs": {"value": 20},
                                          "distribution_levels_per_branch": {"value": 5},
                                      }}}
    z = facility_zones(multi)
    chk("zones_detected", z is not None and len(z["zones"]) == 3)
    svg = build_facility_svg(z, {"L_mm": 18000, "W_mm": 12000, "n_parts": 24},
                             "water_treatment")
    chk("emits_plant_block", "WATER / TREATMENT PLANT" in svg)
    chk("emits_delivery_groups", "Delivery group 1" in svg and "Delivery group 2" in svg)
    chk("emits_nursery", "Nursery zone" in svg)
    chk("emits_out_of_scope", "out of scope" in svg.lower())
    chk("should_emit_true", should_emit(multi) is True)

    single = {"orchestratorContract": {"quantities": {
        "fertigation_dosing_pump_count": {"value": 1},
    }}}
    chk("single_unit_silent", facility_zones(single) is None)
    chk("should_emit_false_single", should_emit(single) is False)
    bess = {"orchestratorContract": {"quantities": {
        "battery_rack_count": {"value": 14},
        "pcs_inverter_count": {"value": 2},
    }}}
    chk("bess_silent", facility_zones(bess) is None)
    chk("should_emit_false_bess", should_emit(bess) is False)

    for f in fails:
        print(f"[facility][selftest] FAIL {f}")
    print(f"[facility][selftest] {'PASS' if not fails else 'FAIL'} "
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
        print(f"[facility] not applicable — {summary.get('reason')}")
        return 0
    print(f"[facility] zones={summary.get('zones')} SVG → {summary.get('svg')}")
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
