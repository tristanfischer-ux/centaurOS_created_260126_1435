#!/usr/bin/env python3
"""
export_a1_pdfs.py — render the engineering drawings as NATIVE A1 PDFs (Tristan 2026-06-22).

Each drawing is produced as a content-sized SVG (drawings/*.svg). This wraps each one into a
true ISO A1 landscape page (841 × 594 mm), scaled-to-fit + centred on white, and writes a
vector PDF via cairosvg. Universal — any drawing SVG in the run's drawings/ dir.

USAGE
    .venv/bin/python scripts/export_a1_pdfs.py out/<run> [name1 name2 ...]

Default set: general-arrangement, pid, block-flow-diagram, single-line-diagram, hvac-layout.
"""
from __future__ import annotations
import os
import re
import sys

import cairosvg

A1_W_MM, A1_H_MM = 841.0, 594.0          # ISO A1 landscape
PX_PER_MM = 96.0 / 25.4                    # 96 dpi user units
MARGIN = 0.94                              # fit to 94 % of the page (title-block breathing room)

DEFAULT_NAMES = [
    "general-arrangement", "pid", "block-flow-diagram",
    "single-line-diagram", "hvac-layout",
]


def _content_dims(svg: str) -> tuple[float, float]:
    """Content width/height in user units — from viewBox, else width/height attrs."""
    m = re.search(r'viewBox\s*=\s*"[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"', svg)
    if m:
        return float(m.group(1)), float(m.group(2))
    w = re.search(r'<svg[^>]*\bwidth\s*=\s*"([\d.]+)', svg)
    h = re.search(r'<svg[^>]*\bheight\s*=\s*"([\d.]+)', svg)
    return (float(w.group(1)) if w else 1080.0), (float(h.group(1)) if h else 760.0)


def svg_to_a1_pdf(svg_path: str, pdf_path: str) -> bool:
    with open(svg_path, "r", encoding="utf-8") as fh:
        svg = fh.read()
    cw, ch = _content_dims(svg)
    if cw <= 0 or ch <= 0:
        return False
    pw, ph = A1_W_MM * PX_PER_MM, A1_H_MM * PX_PER_MM
    s = min(pw / cw, ph / ch) * MARGIN
    tx, ty = (pw - cw * s) / 2.0, (ph - ch * s) / 2.0
    # strip the prolog + the outer <svg> open/close, keep the inner drawing
    inner = re.sub(r"^\s*<\?xml[^>]*\?>", "", svg).strip()
    inner = re.sub(r"<svg\b[^>]*>", "", inner, count=1)
    inner = inner.rsplit("</svg>", 1)[0]
    page = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{A1_W_MM}mm" height="{A1_H_MM}mm" '
        f'viewBox="0 0 {pw:.1f} {ph:.1f}">'
        f'<rect x="0" y="0" width="{pw:.1f}" height="{ph:.1f}" fill="white"/>'
        f'<g transform="translate({tx:.1f},{ty:.1f}) scale({s:.5f})">{inner}</g>'
        f'</svg>'
    )
    cairosvg.svg2pdf(bytestring=page.encode("utf-8"), write_to=pdf_path)
    return True


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: export_a1_pdfs.py out/<run> [names...]")
        return 2
    run = argv[0]
    names = argv[1:] or DEFAULT_NAMES
    ddir = os.path.join(run, "drawings")
    made = []
    for nm in names:
        svg = os.path.join(ddir, f"{nm}.svg")
        if not os.path.exists(svg):
            print(f"  skip (no svg): {nm}")
            continue
        pdf = os.path.join(ddir, f"{nm}-A1.pdf")
        if svg_to_a1_pdf(svg, pdf):
            kb = os.path.getsize(pdf) // 1024
            print(f"  A1 PDF: {nm}-A1.pdf  ({kb} KB)")
            made.append(pdf)
    print(f"DONE — {len(made)} A1 PDF(s) in {ddir}")
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
