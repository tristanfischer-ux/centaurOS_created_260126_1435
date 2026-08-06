#!/usr/bin/env python3
"""G-DRAW-SYNC — top-view GA sheet drawn from geometry IR (CAD master).

Drawings consume assembly.json poses — they do not invent placement.
When geometry/ is present, emit drawings/ga-geometry-from-ir.svg|.png.
"""
from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _load_ir(twin: Path) -> Optional[dict]:
    p = twin / "geometry" / "assembly.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _comp_bbox_xy(comp: dict) -> tuple[float, float, float, float]:
    """Return xmin, ymin, xmax, ymax in IR mm."""
    o = (comp.get("pose") or {}).get("origin_mm") or [0, 0, 0]
    ox, oy = float(o[0]), float(o[1])
    p = comp.get("params_mm") or {}
    family = str(comp.get("family") or "box")
    if family in ("cylinder", "flange_port"):
        dia = float(p.get("dia") or p.get("d") or 20)
        r = dia / 2
        return ox - r, oy - r, ox + r, oy + r
    w = float(p.get("w") or 20)
    d = float(p.get("d") or 20)
    return ox - w / 2, oy - d / 2, ox + w / 2, oy + d / 2


def build_ga_svg(ir: dict, *, title: str = "") -> str:
    comps = [
        c
        for c in (ir.get("components") or [])
        if isinstance(c, dict)
        and c.get("geometry_kind") in ("solid", "envelope_only")
    ]
    paths = [
        p
        for p in (ir.get("paths") or [])
        if isinstance(p, dict) and p.get("status") == "ROUTED"
    ]
    holds = [h for h in (ir.get("holds") or []) if isinstance(h, dict)]

    # Bounds
    xs: list[float] = []
    ys: list[float] = []
    for c in comps:
        x0, y0, x1, y1 = _comp_bbox_xy(c)
        xs.extend([x0, x1])
        ys.extend([y0, y1])
    for p in paths:
        for pt in p.get("centreline_mm") or []:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                xs.append(float(pt[0]))
                ys.append(float(pt[1]))
    if not xs:
        xs, ys = [0, 100], [0, 100]
    pad = 20.0
    xmin, xmax = min(xs) - pad, max(xs) + pad
    ymin, ymax = min(ys) - pad, max(ys) + pad
    W = max(1.0, xmax - xmin)
    D = max(1.0, ymax - ymin)

    # SVG canvas
    cw, ch = 1100, 800
    margin = 60
    scale = min((cw - 2 * margin) / W, (ch - 2 * margin - 40) / D)

    def sx(x: float) -> float:
        return margin + (x - xmin) * scale

    def sy(y: float) -> float:
        # flip Y for screen
        return margin + 30 + (ymax - y) * scale

    twin = ir.get("twin") or "assembly"
    title = title or f"GA from geometry IR — {twin}"
    n_open = len(holds)
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{cw}" height="{ch}" '
        f'viewBox="0 0 {cw} {ch}">',
        f'<rect width="100%" height="100%" fill="#fafafa"/>',
        f'<text x="{margin}" y="28" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="16" font-weight="600" fill="#111">{_esc(title)}</text>',
        f'<text x="{margin}" y="48" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="11" fill="#444">CAD master · solids={len(comps)} '
        f"paths={len(paths)} OPEN holds={n_open} · G-DRAW-SYNC from "
        f"geometry/assembly.json (not freehand)</text>",
        # frame
        f'<rect x="{margin}" y="{margin+30}" width="{W*scale}" height="{D*scale}" '
        f'fill="none" stroke="#ccc" stroke-width="1"/>',
    ]

    # paths first (under solids)
    for p in paths:
        pts = p.get("centreline_mm") or []
        if len(pts) < 2:
            continue
        d_attr = []
        for i, pt in enumerate(pts):
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                continue
            cmd = "M" if i == 0 else "L"
            d_attr.append(f"{cmd}{sx(float(pt[0])):.1f},{sy(float(pt[1])):.1f}")
        if d_attr:
            kind = str(p.get("kind") or "")
            colour = "#2563eb" if re.search(r"fluid|water|media", kind, re.I) else (
                "#ea580c" if re.search(r"power|electrical|dc", kind, re.I) else "#16a34a"
            )
            lines.append(
                f'<path d="{" ".join(d_attr)}" fill="none" stroke="{colour}" '
                f'stroke-width="2" stroke-opacity="0.85"/>'
            )

    # solids
    for c in comps:
        x0, y0, x1, y1 = _comp_bbox_xy(c)
        family = str(c.get("family") or "box")
        role = str(c.get("role") or "")
        fill = {
            "enclosure": "#94a3b8",
            "vessel": "#7dd3fc",
            "pcb": "#86efac",
            "motor": "#fdba74",
            "thermal": "#fca5a5",
            "pump": "#c4b5fd",
        }.get(role, "#e2e8f0")
        if c.get("geometry_kind") == "envelope_only":
            fill = "#fef3c7"
        tag = _esc(str(c.get("tag") or ""))
        if family in ("cylinder", "flange_port"):
            cx = (x0 + x1) / 2
            cy = (y0 + y1) / 2
            rx = (x1 - x0) / 2 * scale
            ry = (y1 - y0) / 2 * scale
            lines.append(
                f'<ellipse cx="{sx(cx):.1f}" cy="{sy(cy):.1f}" '
                f'rx="{max(2,rx):.1f}" ry="{max(2,ry):.1f}" '
                f'fill="{fill}" stroke="#334155" stroke-width="1"/>'
            )
            lines.append(
                f'<text x="{sx(cx):.1f}" y="{sy(cy)-4:.1f}" '
                f'text-anchor="middle" font-family="Helvetica,Arial,sans-serif" '
                f'font-size="9" fill="#0f172a">{tag}</text>'
            )
        else:
            lines.append(
                f'<rect x="{sx(x0):.1f}" y="{sy(y1):.1f}" '
                f'width="{max(2,(x1-x0)*scale):.1f}" '
                f'height="{max(2,(y1-y0)*scale):.1f}" '
                f'fill="{fill}" stroke="#334155" stroke-width="1"/>'
            )
            lines.append(
                f'<text x="{sx((x0+x1)/2):.1f}" y="{sy((y0+y1)/2):.1f}" '
                f'text-anchor="middle" dominant-baseline="middle" '
                f'font-family="Helvetica,Arial,sans-serif" font-size="9" '
                f'fill="#0f172a">{tag}</text>'
            )

    # legend
    ly = ch - 28
    lines.append(
        f'<text x="{margin}" y="{ly}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="10" fill="#64748b">Legend: blue=fluid · orange=power · '
        f"green=signal · yellow=envelope-only · tags from BoM</text>"
    )
    lines.append("</svg>")
    return "\n".join(lines) + "\n"


def _svg_to_png(svg_path: Path, png_path: Path) -> bool:
    """Best-effort PNG via rsvg-convert / inkscape / cairosvg."""
    if shutil.which("rsvg-convert"):
        r = subprocess.run(
            ["rsvg-convert", "-o", str(png_path), str(svg_path)],
            capture_output=True,
            timeout=30,
        )
        return r.returncode == 0 and png_path.is_file()
    if shutil.which("inkscape"):
        r = subprocess.run(
            [
                "inkscape",
                str(svg_path),
                "--export-type=png",
                f"--export-filename={png_path}",
            ],
            capture_output=True,
            timeout=60,
        )
        return r.returncode == 0 and png_path.is_file()
    try:
        import cairosvg  # type: ignore

        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path))
        return png_path.is_file()
    except Exception:
        return False


def sync_drawings_from_ir(twin: Path) -> dict[str, Any]:
    """Write drawings/ga-geometry-from-ir.* from geometry/assembly.json."""
    twin = Path(twin)
    ir = _load_ir(twin)
    if not ir:
        return {"ok": False, "reason": "no geometry/assembly.json"}
    draw = twin / "drawings"
    draw.mkdir(parents=True, exist_ok=True)
    svg = build_ga_svg(ir)
    svg_path = draw / "ga-geometry-from-ir.svg"
    svg_path.write_text(svg, encoding="utf-8")
    png_path = draw / "ga-geometry-from-ir.png"
    png_ok = _svg_to_png(svg_path, png_path)
    meta = {
        "schema": "anvil.geometry_draw_sync/1",
        "source": "geometry/assembly.json",
        "svg": str(svg_path.relative_to(twin)),
        "png": str(png_path.relative_to(twin)) if png_ok else None,
        "n_components": len(ir.get("components") or []),
        "n_paths": len(
            [p for p in (ir.get("paths") or []) if isinstance(p, dict) and p.get("status") == "ROUTED"]
        ),
    }
    (draw / "ga-geometry-from-ir.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    # index note
    idx = draw / "G-DRAW-SYNC.md"
    idx.write_text(
        "# G-DRAW-SYNC — drawings from CAD master\n\n"
        "This sheet is projected from `geometry/assembly.json` (kernel IR).\n"
        "Placement authority is the geometry kernel / STEP — not freehand SVG.\n\n"
        f"- SVG: `{meta['svg']}`\n"
        f"- PNG: `{meta['png'] or '(svg only — install rsvg-convert for PNG)'}`\n"
        f"- Solids: {meta['n_components']} · Paths: {meta['n_paths']}\n",
        encoding="utf-8",
    )
    return {"ok": True, **meta}


def _selftest() -> None:
    ir = {
        "twin": "t",
        "components": [
            {
                "tag": "A",
                "family": "box",
                "geometry_kind": "solid",
                "role": "enclosure",
                "params_mm": {"w": 40, "d": 30, "h": 10},
                "pose": {"origin_mm": [20, 15, 0]},
            },
            {
                "tag": "B",
                "family": "cylinder",
                "geometry_kind": "solid",
                "role": "vessel",
                "params_mm": {"dia": 20, "len": 40},
                "pose": {"origin_mm": [60, 20, 0]},
            },
        ],
        "paths": [
            {
                "id": "p1",
                "kind": "fluid",
                "status": "ROUTED",
                "centreline_mm": [[20, 15, 5], [60, 20, 5]],
            }
        ],
        "holds": [],
    }
    svg = build_ga_svg(ir)
    assert "<svg" in svg and "tag" not in svg or "A" in svg
    assert "A" in svg and "B" in svg
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        twin = Path(td)
        (twin / "geometry").mkdir()
        (twin / "geometry" / "assembly.json").write_text(json.dumps(ir))
        r = sync_drawings_from_ir(twin)
        assert r["ok"]
        assert (twin / "drawings" / "ga-geometry-from-ir.svg").is_file()
    print("geometry_draw_sync selftest OK")


if __name__ == "__main__":
    _selftest()
