#!/usr/bin/env python3
"""a1_print.py — print-ready ISO A1 PDF export with LEGIBILITY-DRIVEN pagination.

Tristan (issues 15-17, 2026-07-02): the P&ID / BFD / single-line render as content-sized
SVGs that the workbook embeds as PNGs — viewed at any real page size the text is
microscopic ("too tiny to see — should be an A1 page PDF"). The G1 aspect gate fixed
SHAPE, not READABILITY: a 2:1 drawing can still print with 1.4 mm lettering.

This module turns any drawing SVG into one or more TRUE ISO A1 LANDSCAPE (841 × 594 mm)
vector PDF sheets, choosing the SMALLEST sheet count whose print scale keeps the
drawing's smallest lettering ≥ 2.5 mm on paper (ISO 3098 minimum lettering height).
Standard drawing practice: when one sheet is not enough, the drawing is tiled onto
"SHEET k OF N" pages with dashed MATCH LINES at every split, never shrunk further.

  print scale   mm_per_px = min(content_w_mm / window_px_w, content_h_mm / window_px_h)
  legibility    min_font_px × mm_per_px ≥ 2.5 mm  →  smallest (cols × rows) grid wins
  pagination    row-major tiles with a small overlap at interior edges + match lines

PDF via cairosvg (the repo's existing SVG→PNG family: cairosvg → rsvg-convert → Chrome);
added to .venv 2026-07-02. Export is ADDITIVE — the SVG master is never modified, so a
drawing already meeting the bar on one sheet keeps a byte-identical SVG.

Artifacts (next to the SVG, for the Excel exporter's owner to link):
  <base>-A1.pdf                sheet 1
  <base>-A1-sheet<k>.pdf       sheets 2..N (multi-sheet drawings only)
  <base>-A1.json               print manifest: px size, grid, scale, min text height —
                               read by drawing_gates.py G1 (min-text-height check).

Pure planning helpers (`plan_sheets`, `sheet_scale_mm_per_px`, `min_font_px`) are
deterministic + stdlib-only, so the gate + selftests can prove the catch without cairo.
British spelling. `--selftest` exercises the plan invariants.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

# ── ISO A1 landscape page + printable window ────────────────────────────────────────
A1_W_MM = 841.0
A1_H_MM = 594.0
MARGIN_MM = 20.0                          # border all round (title strip in the bottom one)
CONTENT_W_MM = A1_W_MM - 2 * MARGIN_MM    # 801 mm
CONTENT_H_MM = A1_H_MM - 2 * MARGIN_MM    # 554 mm
MIN_TEXT_MM = 2.5                         # ISO 3098 minimum lettering height on paper
OVERLAP_FRAC = 0.02                       # tile overlap at each interior edge (match-line context)
MAX_COLS = 8
MAX_ROWS = 4

_FONT_RE = re.compile(r'font-size\s*[:=]\s*"?([\d.]+)')
_W_RE = re.compile(r'<svg[^>]*\bwidth\s*=\s*"([\d.]+)')
_H_RE = re.compile(r'<svg[^>]*\bheight\s*=\s*"([\d.]+)')
_VB_RE = re.compile(r'<svg[^>]*viewBox\s*=\s*"[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"')


def svg_px_dims(svg_text: str):
    """(width, height) of the drawing in SVG user units — width/height attrs, else viewBox."""
    mw, mh = _W_RE.search(svg_text), _H_RE.search(svg_text)
    if mw and mh:
        return float(mw.group(1)), float(mh.group(1))
    mv = _VB_RE.search(svg_text)
    if mv:
        return float(mv.group(1)), float(mv.group(2))
    return None


def min_font_px(svg_text: str):
    """The drawing's smallest lettering, in SVG user units (font-size attrs + CSS)."""
    sizes = [float(s) for s in _FONT_RE.findall(svg_text) if float(s) > 0]
    return min(sizes) if sizes else None


def _window_px(dim_px: float, n: int) -> float:
    """Worst-case sheet WINDOW along one axis for an n-way split: the tile plus the
    overlap claimed at each interior edge (middle tiles of a ≥3-split carry two)."""
    tile = dim_px / n
    n_overlaps = 0 if n == 1 else (1 if n == 2 else 2)
    return tile * (1.0 + OVERLAP_FRAC * n_overlaps)


def sheet_scale_mm_per_px(w_px: float, h_px: float, cols: int, rows: int) -> float:
    """UNIFORM print scale (mm of paper per SVG px) for a cols×rows A1 tiling —
    fit the worst-case sheet window into the printable A1 area."""
    return min(CONTENT_W_MM / _window_px(w_px, cols),
               CONTENT_H_MM / _window_px(h_px, rows))


def plan_sheets(w_px: float, h_px: float, font_px) -> dict:
    """Choose the SMALLEST (cols × rows) A1 grid whose print scale keeps the smallest
    lettering ≥ MIN_TEXT_MM. Bigger scale (more sheets) — NEVER shrink content.
    Deterministic: candidates ordered by (sheet count, rows, cols)."""
    cands = sorted(((c * r, r, c) for c in range(1, MAX_COLS + 1)
                    for r in range(1, MAX_ROWS + 1)))
    best = None
    for _n, r, c in cands:
        s = sheet_scale_mm_per_px(w_px, h_px, c, r)
        text_mm = (font_px * s) if font_px else None
        cand = {"cols": c, "rows": r, "sheets": c * r, "mm_per_px": s,
                "min_text_mm": text_mm,
                "meets_bar": (text_mm is None) or (text_mm >= MIN_TEXT_MM)}
        if cand["meets_bar"]:
            return cand
        if best is None or (cand["min_text_mm"] or 0) > (best["min_text_mm"] or 0):
            best = cand
    return best  # nothing meets the bar even at MAX grid — honest: meets_bar=False


def _strip_outer_svg(svg_text: str) -> str:
    """The drawing's inner markup — prolog + outer <svg …>…</svg> removed (the same
    idiom as scripts/export_a1_pdfs.py)."""
    inner = re.sub(r"^\s*<\?xml[^>]*\?>", "", svg_text).strip()
    inner = re.sub(r"<svg\b[^>]*>", "", inner, count=1)
    return inner.rsplit("</svg>", 1)[0]


def _sheet_svg(inner: str, w_px: float, h_px: float, cols: int, rows: int,
               ci: int, ri: int, scale: float, title: str, base: str) -> str:
    """One A1 page: white sheet + border, the (ci,ri) content window scaled-to-plan,
    dashed MATCH LINES at every interior cut, and a footer title strip."""
    tile_w, tile_h = w_px / cols, h_px / rows
    ov_w, ov_h = OVERLAP_FRAC * tile_w, OVERLAP_FRAC * tile_h
    # window = the tile plus overlap on each INTERIOR edge (clamped to the drawing)
    x0 = max(0.0, ci * tile_w - (ov_w if ci > 0 else 0.0))
    x1 = min(w_px, (ci + 1) * tile_w + (ov_w if ci < cols - 1 else 0.0))
    y0 = max(0.0, ri * tile_h - (ov_h if ri > 0 else 0.0))
    y1 = min(h_px, (ri + 1) * tile_h + (ov_h if ri < rows - 1 else 0.0))
    ww, wh = x1 - x0, y1 - y0
    k = ri * cols + ci + 1
    n = cols * rows

    # match-line annotations live in CONTENT coordinates so they print at true scale.
    ml_font = 3.2 / scale            # 3.2 mm on paper
    dash = f"{6.0 / scale:.2f},{4.0 / scale:.2f}"
    marks = []
    if ci > 0:                        # left cut → continues on the sheet to the left
        cx = ci * tile_w
        marks.append(f'<line x1="{cx:.2f}" y1="{y0:.2f}" x2="{cx:.2f}" y2="{y1:.2f}" '
                     f'stroke="#b91c1c" stroke-width="{0.4 / scale:.2f}" stroke-dasharray="{dash}"/>')
        marks.append(f'<text x="{cx - 2.0 / scale:.2f}" y="{y0 + 6.0 / scale:.2f}" font-size="{ml_font:.2f}" '
                     f'fill="#b91c1c" text-anchor="end" transform="rotate(-90 {cx - 2.0 / scale:.2f} {y0 + 6.0 / scale:.2f})" '
                     f'font-family="Helvetica, Arial, sans-serif">MATCH LINE — SEE SHEET {k - 1}</text>')
    if ci < cols - 1:                 # right cut → continues on the next sheet
        cx = (ci + 1) * tile_w
        marks.append(f'<line x1="{cx:.2f}" y1="{y0:.2f}" x2="{cx:.2f}" y2="{y1:.2f}" '
                     f'stroke="#b91c1c" stroke-width="{0.4 / scale:.2f}" stroke-dasharray="{dash}"/>')
        marks.append(f'<text x="{cx + 4.0 / scale:.2f}" y="{y0 + 6.0 / scale:.2f}" font-size="{ml_font:.2f}" '
                     f'fill="#b91c1c" text-anchor="end" transform="rotate(-90 {cx + 4.0 / scale:.2f} {y0 + 6.0 / scale:.2f})" '
                     f'font-family="Helvetica, Arial, sans-serif">MATCH LINE — SEE SHEET {k + 1}</text>')
    if ri > 0:                        # top cut → continues on the sheet above
        cy = ri * tile_h
        marks.append(f'<line x1="{x0:.2f}" y1="{cy:.2f}" x2="{x1:.2f}" y2="{cy:.2f}" '
                     f'stroke="#b91c1c" stroke-width="{0.4 / scale:.2f}" stroke-dasharray="{dash}"/>')
        marks.append(f'<text x="{x0 + 6.0 / scale:.2f}" y="{cy - 2.0 / scale:.2f}" font-size="{ml_font:.2f}" '
                     f'fill="#b91c1c" font-family="Helvetica, Arial, sans-serif">'
                     f'MATCH LINE — SEE SHEET {k - cols}</text>')
    if ri < rows - 1:                 # bottom cut → continues on the sheet below
        cy = (ri + 1) * tile_h
        marks.append(f'<line x1="{x0:.2f}" y1="{cy:.2f}" x2="{x1:.2f}" y2="{cy:.2f}" '
                     f'stroke="#b91c1c" stroke-width="{0.4 / scale:.2f}" stroke-dasharray="{dash}"/>')
        marks.append(f'<text x="{x0 + 6.0 / scale:.2f}" y="{cy + 5.0 / scale:.2f}" font-size="{ml_font:.2f}" '
                     f'fill="#b91c1c" font-family="Helvetica, Arial, sans-serif">'
                     f'MATCH LINE — SEE SHEET {k + cols}</text>')

    # XML-escape the human title ("Piping & Instrumentation Diagram" carries a raw &).
    footer = (f"{html.escape(title or base)} — A1 SHEET {k} OF {n} · PRINT SCALE 1 px = {scale:.4f} mm "
              f"· ISO A1 LANDSCAPE 841 × 594 mm · DO NOT SCALE DOWN — PAGINATED FOR "
              f"≥ {MIN_TEXT_MM:g} mm LETTERING")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{A1_W_MM:g}mm" height="{A1_H_MM:g}mm" viewBox="0 0 {A1_W_MM:g} {A1_H_MM:g}">'
        f'<rect x="0" y="0" width="{A1_W_MM:g}" height="{A1_H_MM:g}" fill="white"/>'
        f'<rect x="{MARGIN_MM / 2:g}" y="{MARGIN_MM / 2:g}" width="{A1_W_MM - MARGIN_MM:g}" '
        f'height="{A1_H_MM - MARGIN_MM:g}" fill="none" stroke="#0f172a" stroke-width="0.5"/>'
        # the content window: a nested <svg> viewBox crops + scales the drawing to plan
        f'<svg x="{MARGIN_MM:g}" y="{MARGIN_MM:g}" width="{CONTENT_W_MM:g}" height="{CONTENT_H_MM:g}" '
        f'viewBox="{x0:.2f} {y0:.2f} {ww:.2f} {wh:.2f}" preserveAspectRatio="xMidYMid meet">'
        f'{inner}{"".join(marks)}</svg>'
        f'<text x="{MARGIN_MM:g}" y="{A1_H_MM - 7.5:g}" font-size="4.2" fill="#0f172a" '
        f'font-family="Helvetica, Arial, sans-serif">{footer}</text>'
        f'</svg>')


def _svg2pdf_deterministic(page_bytes: bytes, write_to: str) -> None:
    """cairosvg svg2pdf with a PINNED /CreationDate — cairo stamps wall-clock time into
    the PDF by default, which breaks the same-run-same-bytes determinism guarantee
    (verified: two identical runs differed ONLY in the ObjStm CreationDate). Falls back
    to plain svg2pdf if the cairocffi metadata hook is unavailable (older cairo)."""
    import cairosvg  # type: ignore
    try:
        import cairocffi  # type: ignore

        class _PinnedDateCairoPDF(cairocffi.PDFSurface):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.set_metadata(cairocffi.PDF_METADATA_CREATE_DATE,
                                  "2000-01-01T00:00:00Z")

        class _PinnedDatePDFSurface(cairosvg.surface.PDFSurface):
            surface_class = _PinnedDateCairoPDF

        _PinnedDatePDFSurface.convert(bytestring=page_bytes, write_to=write_to)
    except (ImportError, AttributeError):
        cairosvg.svg2pdf(bytestring=page_bytes, write_to=write_to)


def export_a1(svg_path, base: str, title: str = "") -> dict:
    """Write the A1 print set for one drawing SVG: <base>-A1.pdf (+ -sheet<k>.pdf) and
    the <base>-A1.json print manifest, next to the SVG. Returns the manifest dict.
    ADDITIVE + non-fatal by contract: never touches the SVG; a missing cairosvg still
    writes the manifest (pdf_ok=false) so the G1 gate can score the miss honestly."""
    svg_path = Path(svg_path)
    svg_text = svg_path.read_text()
    dims = svg_px_dims(svg_text)
    if not dims or dims[0] <= 0 or dims[1] <= 0:
        raise ValueError(f"no usable dimensions in {svg_path.name}")
    w_px, h_px = dims
    font = min_font_px(svg_text)
    plan = plan_sheets(w_px, h_px, font)
    cols, rows, scale = plan["cols"], plan["rows"], plan["mm_per_px"]

    inner = _strip_outer_svg(svg_text)
    out_dir = svg_path.parent
    pdfs, pdf_ok, pdf_err = [], True, None
    try:
        for ri in range(rows):
            for ci in range(cols):
                k = ri * cols + ci + 1
                name = f"{base}-A1.pdf" if k == 1 else f"{base}-A1-sheet{k}.pdf"
                page = _sheet_svg(inner, w_px, h_px, cols, rows, ci, ri, scale, title, base)
                _svg2pdf_deterministic(page.encode("utf-8"), str(out_dir / name))
                pdfs.append(name)
    except Exception as ex:  # noqa: BLE001 — the PDF is additive; record + score, never crash
        pdf_ok, pdf_err = False, f"{type(ex).__name__}: {ex}"

    manifest = {
        "schema": "a1-print/v1",
        "drawing": base,
        "title": title,
        "svg": svg_path.name,
        "svg_px": [round(w_px, 1), round(h_px, 1)],
        "min_font_px": round(font, 2) if font else None,
        "grid": [cols, rows],
        "sheets": plan["sheets"],
        "mm_per_px": round(scale, 5),
        "min_text_mm": round(plan["min_text_mm"], 2) if plan["min_text_mm"] else None,
        "min_text_bar_mm": MIN_TEXT_MM,
        "meets_bar": plan["meets_bar"],
        "page": "A1 landscape 841x594 mm",
        "pdf_ok": pdf_ok,
        "pdf_error": pdf_err,
        "pdfs": pdfs,
    }
    (out_dir / f"{base}-A1.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def _selftest() -> int:
    """Plan invariants — the pure maths the G1 min-text gate + the generators rely on."""
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    # P1 proveCatch — a 12000-px-wide strip with 10 px text is ILLEGIBLE on one A1 …
    one = sheet_scale_mm_per_px(12000, 2000, 1, 1) * 10
    chk("P1.single_sheet_fails", one < MIN_TEXT_MM)
    # … and the planner paginates it UP to legibility (4×1 here: 3 sheets is still
    # 10 px × 801/4080 ≈ 1.96 mm < 2.5 — the planner must not stop early).
    p = plan_sheets(12000, 2000, 10)
    chk("P1.paginated_passes", p["meets_bar"] and p["min_text_mm"] >= MIN_TEXT_MM)
    chk("P1.three_sheets_insufficient", sheet_scale_mm_per_px(12000, 2000, 3, 1) * 10 < MIN_TEXT_MM)
    chk("P1.smallest_grid", p["sheets"] == 4 and p["cols"] == 4 and p["rows"] == 1)
    # P2 — an already-legible sheet stays SINGLE (pagination is a no-op).
    p1 = plan_sheets(1810, 800, 8.5)
    chk("P2.small_single_sheet", p1["sheets"] == 1 and p1["meets_bar"])
    # P3 — pagination raises the SCALE monotonically (never shrinks content).
    chk("P3.scale_monotone", sheet_scale_mm_per_px(12000, 2000, 4, 1)
        > sheet_scale_mm_per_px(12000, 2000, 1, 1))
    # P4 — determinism: same input, same plan.
    chk("P4.deterministic", plan_sheets(3420, 1914, 6.2) == plan_sheets(3420, 1914, 6.2))
    # P5 — a TALL drawing splits on rows, not cols.
    pt = plan_sheets(2000, 12000, 10)
    chk("P5.tall_splits_rows", pt["rows"] > 1 and pt["cols"] == 1)
    # P6 — no text ⇒ one sheet, bar trivially met.
    p0 = plan_sheets(5000, 3000, None)
    chk("P6.no_text_single", p0["sheets"] == 1 and p0["meets_bar"])
    # P7 — parser helpers.
    chk("P7.dims", svg_px_dims('<svg xmlns="x" width="320" height="200">') == (320.0, 200.0))
    chk("P7.font", min_font_px('<text font-size="7.5"/><text style="font-size:6.2px"/>') == 6.2)
    # P8 — a title with a raw '&' ("Piping & Instrumentation Diagram") must still yield
    # well-formed sheet XML (the exact defect the first codema-v52 export tripped on).
    import xml.etree.ElementTree as _ET
    try:
        _ET.fromstring(_sheet_svg("<g/>", 4000, 2000, 2, 2, 0, 0, 0.4,
                                  "Piping & Instrumentation Diagram", "pid"))
        chk("P8.title_ampersand_escaped", True)
    except _ET.ParseError:
        chk("P8.title_ampersand_escaped", False)

    for f in fails:
        print(f"[a1-print][selftest] FAIL {f}")
    print(f"[a1-print][selftest] {'PASS' if not fails else 'FAIL'} ({len(fails)} failure(s))")
    return 1 if fails else 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        raise SystemExit(_selftest())
    print(__doc__)
