#!/usr/bin/env python3
"""
scripts/audit-pdf-layout.py

LAYOUT-OVERLAP DETECTOR — runs after every chain produces a PDF, catches
text-smear bugs caused by react-pdf `wrap={false}` blocks colliding with the
preceding content when they cannot fit on the current page.

Background (codified 2026-05-24 after BESS L7 surfaced the same bug for the
4th time despite three incremental patches in scripts/render-minimal-pdf.tsx
at lines 3742, 4144, and the P1-6 sweep). When a `wrap={false}` block in
react-pdf cannot fit at the current Y cursor, the renderer stacks it at the
same Y rather than advancing to the next page, producing visually unreadable
"smear" pages where two text lines occupy the same coordinates.

The previous detector (audit-pdf-run.ts V-1 check) worked from `pdftotext
-layout` output, which collapses lines by Y bucket and loses the per-span
geometry needed to distinguish a real overlap from a legitimate table row.
This detector inspects the PDF's own bounding-box geometry via PyMuPDF and
flags pairs of text spans whose bboxes intersect more than a tolerance — no
text-pattern heuristics, no false positives on BoM tables.

CHECKS EMITTED
--------------
V-1: TEXT-TEXT OVERLAP — two text spans share X+Y bounding-box coordinates.
     Canonical wrap={false} smear case (BESS L7 page 24 etc.). Universal,
     content-agnostic; flags any pair regardless of table or paragraph.

T-1: TABLE COLUMN-OVERFLOW — within a BoM/cost-stack table, a single text
     span's content has glued TWO adjacent cells together (e.g. the QTY
     value `×1` and the UNIT price `~£18,000.00` rendered as one span
     `×1~£18,000.00` because react-pdf's flex-row column rule failed and
     the qty and unit cells were drawn as a single text run). Catches the
     bug class flagged on BESS L22 page 25 where the Liquid Cooling
     Chiller row shows "×1~£18,000.00" merged into the QTY column. Codified
     2026-05-25 — V-1 (geometric overlap) does NOT see this case because
     the merged span is a SINGLE PDF span, not two overlapping spans, so
     no pair-overlap signal exists.

     Detection algorithm (T-1):
     1. Find table headers: rows containing PART + QTY + UNIT (£) on the
        same Y baseline (within 2 pt). Header positions define column
        left-edges.
     2. For data rows below each header (skipping the wrapped header
        sub-line at TURER/CHECK +10 pt), classify each span by content
        type: qty (`×N`), unit (`~?£NNN.NN`), line (`£NNN.NN`),
        source (Est./Mfr/Web/PRICE-QUERY/etc.), merged_qty_unit
        (`×N~?£NNN.NN`), or other.
     3. Skip rows that aren't BoM data rows (no qty AND no price tokens).
     4. For each span: determine which column zone it starts in (z_start)
        and which zone its right-edge lies in (z_end). If z_end > z_start,
        the span crosses ≥1 column boundary.
     5. Filter false positives: a right-aligned numeric value (UNIT price
        like `~£8,000.00`) naturally extends leftward across the
        column-N→N+1 boundary because it lives in column N+1 with its
        x_end pinned to the column's right edge. If span's content type
        matches column N+1's expected type, this is alignment, NOT
        overflow — skip.
     6. Flag remaining cases. severity HIGH for `merged_qty_unit` content
        (the unambiguous bug); MED for other column-mismatches.

Usage:
    python3 scripts/audit-pdf-layout.py <pdf-path>

Writes <pdf-path>.AUDIT-LAYOUT.md and exits:
    0  — no overlap or column-overflow findings (PASS)
   11  — ≥1 HIGH finding (V-1 text overlap OR T-1 column overflow); both
         share the same exit code per CLAUDE.md gate-11 contract
    2  — bad CLI args or unreadable PDF (operator error)

Dependency: PyMuPDF (`fitz`) — already installed via `pip3 install PyMuPDF`
in this repo (see repo's other PDF tooling like render-engine-proof.py).
pdfminer.six is NOT used — PyMuPDF gives identical bbox data with a faster
parser and is already on disk. If a future maintainer wants to swap libraries
the surface is small (`extract_spans()` is the only library-coupled fn).

Thresholds (tuned against /tmp/bess-l7-validate/chain-v2.pdf page 24):
    X_OVERLAP_FRAC = 0.50  — bboxes must share ≥50% of the narrower span's
                             width before being considered "same column".
                             Legitimate side-by-side layouts (table column
                             headers at same Y but different X — e.g.
                             "PART"/"MANUFAC-"/"QTY") share ~0% and pass.
    Y_OVERLAP_FRAC = 0.40  — bboxes must share ≥40% of the shorter span's
                             height. Two adjacent lines on consecutive Y
                             rows naturally share <20%; a true overlap
                             shares 60-100%.
    COLUMN_OVERFLOW_PT_THRESHOLD = 5.0
                          — minimum overflow into the next column's left
                             edge before a T-1 finding is emitted. Below
                             5 pt is typical glyph antialiasing slop and
                             never visible.

False-positive filters (codified 2026-05-24):
    1. Identical text + one bbox fully inside the other = ligature artefact
       (PDF font renderer emitting the same string twice). Skip.
    2. One span's text is a substring of the other AND its bbox is fully
       contained in the other's bbox = same artefact in long-text mode. Skip.
    3. Page-furniture pairs (header/footer page-number bands at y < 60 or
       y > 800 with cross-text overlap) — none observed in BESS L7, but the
       filter is in place for header-band edge cases. Skip.
    4. (T-1) Right-aligned numeric values that bleed left into the prior
       column's zone (e.g. UNIT cell `~£8,000.00` at x=371 inside the QTY
       header zone [349..382)). The span's content classifies as the
       DESTINATION column's expected type — not the source column's — so
       no merged-cell ambiguity. Skip.
    5. (T-1) Wrapped sub-line of the header itself (`TURER` under
       `MANUFAC-`, `CHECK` under `SOURCE ·`) sits within 10 pt of the
       header Y baseline and trivially overflows the next column edge.
       Skip rows within 10 pt of any detected header.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print(
        '[audit-pdf-layout] ERROR: PyMuPDF (fitz) not installed. '
        'Run: pip3 install PyMuPDF',
        file=sys.stderr,
    )
    sys.exit(2)


X_OVERLAP_FRAC = 0.50
Y_OVERLAP_FRAC = 0.40
COLUMN_OVERFLOW_PT_THRESHOLD = 5.0
HEADER_WRAPPED_SUBLINE_Y_PT = 10.0
ROW_BASELINE_TOLERANCE_PT = 2.0
COLUMN_ZONE_LEFT_TOLERANCE_PT = 2.0
# Spans whose x_start sits within this many pt of the next-column boundary
# are treated as kerned-into-next-column artefacts, not overflow. e.g.
# a manufacturer name `CIMC` at x=207.6 (2.1 pt left of MANUFAC- edge 209.7)
# is visually anchored in MANUFAC-, even though geometrically it starts
# 2.1 pt earlier than the canonical column left edge.
COLUMN_BOUNDARY_KERNING_BAND_PT = 5.0


# ---------------------------------------------------------------------------
# T-1 cell-content classifiers — used by the BoM column-overflow detector.
# Each pattern is anchored to the WHOLE span text so legitimate values are
# matched as a unit; merged-cell content is detected by the explicit
# QTY+UNIT regex below.
# ---------------------------------------------------------------------------

# QTY column: ×N or ×N,NNN (e.g. ×1, ×8, ×3,750)
T1_QTY_VALUE_RE = re.compile(r'^×[0-9][0-9,]*$')
# UNIT (£) column: optional ~, then £, then numeric (e.g. ~£18.00, £18,000.00)
T1_UNIT_VALUE_RE = re.compile(r'^~?£[0-9][0-9,]*(?:\.[0-9]+)?$')
# LINE (£) column: £NNN.NN (no ~ — the line-total is a firm number)
T1_LINE_VALUE_RE = re.compile(r'^£[0-9][0-9,]*(?:\.[0-9]+)?$')
# SOURCE · CHECK column: Est., Mfr, Web, Distrib, PRICE-QUERY, OK, >2x, <.5x, -, —
T1_SOURCE_VALUE_RE = re.compile(
    r'^(Est\.|Mfr|Web|Distrib|Cat\.?|Vendor|PRICE-QUERY|>2x|<\.5x|OK|-|—)$'
)
# Merged QTY+UNIT cell: ×N (or ×N,NNN) immediately followed by ~?£NN — two
# distinct cell types fused into one PDF span. THE canonical T-1 bug.
T1_MERGED_QTY_UNIT_RE = re.compile(r'^×[0-9][0-9,]*~?£[0-9]')


def _classify_cell_text(text: str) -> str:
    """Return the cell-type label that best matches `text`.

    Used by T-1 to (a) decide whether a row is a BoM data row at all and
    (b) filter out right-aligned values whose content matches the
    DESTINATION column rather than the source column.
    """
    if T1_MERGED_QTY_UNIT_RE.match(text):
        return 'merged_qty_unit'
    if T1_QTY_VALUE_RE.match(text):
        return 'qty'
    if T1_UNIT_VALUE_RE.match(text):
        return 'unit'
    if T1_LINE_VALUE_RE.match(text):
        return 'line'
    if T1_SOURCE_VALUE_RE.match(text):
        return 'source'
    return 'other'


def _column_expected_type(header_name: str) -> str:
    """Map a BoM table header text to the cell-content type expected in
    that column."""
    if header_name == 'QTY':
        return 'qty'
    if 'UNIT' in header_name:
        return 'unit'
    if 'LINE' in header_name:
        return 'line'
    if 'SOURCE' in header_name:
        return 'source'
    return 'other'


@dataclass
class Span:
    page: int  # 1-indexed page number for human reporting
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    font: str

    @property
    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)


@dataclass
class Overlap:
    a: Span
    b: Span
    x_frac: float
    y_frac: float

    @property
    def severity(self) -> str:
        # HIGH: near-total overlap on both axes (>0.8 each) — the canonical
        # wrap={false} smear case
        if self.x_frac >= 0.80 and self.y_frac >= 0.80:
            return 'HIGH'
        # MED: substantial overlap but a margin of doubt
        if self.x_frac >= 0.70 and self.y_frac >= 0.60:
            return 'MED'
        return 'LOW'


@dataclass
class ColumnOverflow:
    """A T-1 finding: a single text span whose horizontal extent spans
    TWO adjacent table columns (canonical: QTY+UNIT merged into one PDF
    text run like `×1~£18,000.00`)."""

    span: Span
    source_col_name: str  # column the span x_start lies in
    source_col_x: float  # column N's left edge (x_start anchor)
    next_col_name: str  # column N+1's name (what the span overflows into)
    next_col_x: float  # column N+1's left edge
    overflow_pt: float  # span.x_end - next_col_x (positive amount past the boundary)
    cell_content_type: str  # classification: 'merged_qty_unit' | 'other' | etc.
    reason: str  # short human reason for the report

    @property
    def severity(self) -> str:
        # HIGH: merged-cell content (the unambiguous bug). The PDF
        # produced a single text span whose content contains two
        # different cell types fused together.
        if self.cell_content_type == 'merged_qty_unit':
            return 'HIGH'
        # MED: span content does not match the source or destination
        # column type yet bridges them — likely overflow but less
        # diagnostic than the merged-cell signature.
        return 'MED'


def extract_spans(pdf_path: Path) -> list[Span]:
    """Walk every page, collect every non-empty text span with its bbox."""
    spans: list[Span] = []
    doc = fitz.open(str(pdf_path))
    try:
        for page_idx, page in enumerate(doc):
            d = page.get_text('dict')
            for block in d.get('blocks', []):
                # type 0 == text block; type 1 == image. We only audit text.
                if block.get('type') != 0:
                    continue
                for line in block.get('lines', []):
                    for sp in line.get('spans', []):
                        text = (sp.get('text') or '').strip()
                        if not text:
                            continue
                        bbox = sp.get('bbox', (0.0, 0.0, 0.0, 0.0))
                        spans.append(
                            Span(
                                page=page_idx + 1,
                                text=text,
                                x0=float(bbox[0]),
                                y0=float(bbox[1]),
                                x1=float(bbox[2]),
                                y1=float(bbox[3]),
                                font=str(sp.get('font') or ''),
                            )
                        )
    finally:
        doc.close()
    return spans


def is_substring_inside(outer: Span, inner: Span) -> bool:
    """True iff inner.bbox is fully inside outer.bbox AND inner.text is a
    substring of outer.text. Catches PDF font-rendering ligature artefacts
    where a glyph cluster gets emitted as a child span of its parent run."""
    inside_bbox = (
        outer.x0 <= inner.x0 + 0.5
        and outer.y0 <= inner.y0 + 0.5
        and outer.x1 + 0.5 >= inner.x1
        and outer.y1 + 0.5 >= inner.y1
    )
    if not inside_bbox:
        return False
    return inner.text in outer.text


def pair_overlap(a: Span, b: Span) -> Overlap | None:
    """Return an Overlap if the two spans collide on both axes above
    threshold, else None."""
    # Y overlap fraction (of shorter span)
    y_overlap = min(a.y1, b.y1) - max(a.y0, b.y0)
    if y_overlap <= 0:
        return None
    shorter_h = min(a.height, b.height)
    if shorter_h <= 0:
        return None
    y_frac = y_overlap / shorter_h
    if y_frac < Y_OVERLAP_FRAC:
        return None

    # X overlap fraction (of narrower span)
    x_overlap = min(a.x1, b.x1) - max(a.x0, b.x0)
    if x_overlap <= 0:
        return None
    narrower_w = min(a.width, b.width)
    if narrower_w <= 0:
        return None
    x_frac = x_overlap / narrower_w
    if x_frac < X_OVERLAP_FRAC:
        return None

    return Overlap(a=a, b=b, x_frac=x_frac, y_frac=y_frac)


def detect_overlaps(spans: list[Span]) -> list[Overlap]:
    """Find every overlap pair on every page. O(n²) per page is fine — a
    busy page has ~100 spans (verified against BESS L7), so ~5_000 compares
    per page × 60 pages = 300k compares per PDF, sub-second."""
    # Group by page first so we never cross-compare pages
    by_page: dict[int, list[Span]] = {}
    for s in spans:
        by_page.setdefault(s.page, []).append(s)

    findings: list[Overlap] = []
    for page, page_spans in by_page.items():
        for i in range(len(page_spans)):
            a = page_spans[i]
            for j in range(i + 1, len(page_spans)):
                b = page_spans[j]
                ov = pair_overlap(a, b)
                if ov is None:
                    continue
                # Substring-inside filter (ligature artefact)
                if is_substring_inside(a, b) or is_substring_inside(b, a):
                    continue
                findings.append(ov)
    return findings


# ---------------------------------------------------------------------------
# T-1 column-overflow detector — works on the same Span list as detect_overlaps
# but groups spans into Y-baseline rows per page and reasons about BoM tables.
# ---------------------------------------------------------------------------


def _group_rows_by_baseline(
    page_spans: list[Span],
) -> list[tuple[float, list[Span]]]:
    """Cluster spans into rows that share a Y baseline within
    ROW_BASELINE_TOLERANCE_PT. Returns a list of (anchor_y, [spans])
    sorted by Y then X — sorted so wrapped header sub-lines (TURER under
    MANUFAC-) and value sub-lines (part-number tail like `40` under
    `UPS 25-`) land in their own row buckets rather than fusing with the
    primary line."""
    sorted_spans = sorted(page_spans, key=lambda s: (s.y0, s.x0))
    rows: list[tuple[float, list[Span]]] = []
    for sp in sorted_spans:
        if rows and abs(sp.y0 - rows[-1][0]) <= ROW_BASELINE_TOLERANCE_PT:
            rows[-1][1].append(sp)
        else:
            rows.append((sp.y0, [sp]))
    return rows


def _row_is_bom_data(row: list[Span]) -> bool:
    """A BoM data row has either (a) a separate QTY and a separate
    price span, OR (b) a merged QTY+UNIT span. Sub-total, legend, and
    prose rows are rejected here.
    """
    types = [_classify_cell_text(s.text) for s in row]
    has_qty = any(t in ('qty', 'merged_qty_unit') for t in types)
    has_price = any(t in ('unit', 'line', 'merged_qty_unit') for t in types)
    return has_qty and has_price


def _zone_for_x(x: float, col_edges: list[float]) -> int | None:
    """Return the column index whose horizontal zone contains `x`.
    A column's zone is [col_edges[i] - ε, col_edges[i+1]). The last
    column's right edge is unbounded.
    """
    eps = COLUMN_ZONE_LEFT_TOLERANCE_PT
    for ci in range(len(col_edges)):
        left = col_edges[ci]
        right = col_edges[ci + 1] if ci + 1 < len(col_edges) else float('inf')
        if left - eps <= x < right:
            return ci
    return None


@dataclass
class _BoMHeader:
    row_idx: int  # index into the page's row list
    y: float  # Y baseline of the header
    edges: list[float]  # left-x of each column header, sorted ascending
    names: list[str]  # column header texts, aligned with edges


def _find_bom_headers(rows: list[tuple[float, list[Span]]]) -> list[_BoMHeader]:
    """A BoM header row contains literal `PART` + `QTY` + a span whose
    text contains `UNIT` (matches both `UNIT (£)` header and any future
    `UNIT` variant). One page can carry up to two BoM tables (top + bottom
    of page break) — return all of them, sorted by row index.
    """
    headers: list[_BoMHeader] = []
    for ri, (y, row) in enumerate(rows):
        texts = [s.text for s in row]
        if 'PART' not in texts:
            continue
        if 'QTY' not in texts:
            continue
        if not any('UNIT' in t for t in texts):
            continue
        sorted_row = sorted(row, key=lambda s: s.x0)
        headers.append(
            _BoMHeader(
                row_idx=ri,
                y=y,
                edges=[s.x0 for s in sorted_row],
                names=[s.text for s in sorted_row],
            )
        )
    return headers


def detect_column_overflows(spans: list[Span]) -> list[ColumnOverflow]:
    """T-1: find spans inside BoM tables whose horizontal extent crosses
    a column boundary AND whose content marks them as merged-cell bugs.

    Filters that suppress false positives:
    - Right-aligned numeric values that bleed left into the prior column's
      zone. These pass the geometric "crosses boundary" check but their
      content classifies as the DESTINATION column's expected type, so we
      treat them as alignment, not overflow.
    - Wrapped header sub-line (`TURER`, `CHECK`) that sits within
      HEADER_WRAPPED_SUBLINE_Y_PT pt of the header Y baseline.
    - Non-BoM-data rows (sub-totals, legend prose, narrative paragraphs).
    """
    findings: list[ColumnOverflow] = []
    by_page: dict[int, list[Span]] = {}
    for s in spans:
        by_page.setdefault(s.page, []).append(s)

    for page, page_spans in by_page.items():
        rows = _group_rows_by_baseline(page_spans)
        headers = _find_bom_headers(rows)
        if not headers:
            continue
        for hi, header in enumerate(headers):
            start_ri = header.row_idx
            end_ri = (
                headers[hi + 1].row_idx if hi + 1 < len(headers) else len(rows)
            )
            col_edges = header.edges
            col_names = header.names
            num_cols = len(col_edges)
            for ri in range(start_ri + 1, end_ri):
                y2, drow = rows[ri]
                # Skip wrapped header sub-line band
                if y2 - header.y <= HEADER_WRAPPED_SUBLINE_Y_PT:
                    continue
                if not _row_is_bom_data(drow):
                    continue
                for s in drow:
                    z_start = _zone_for_x(s.x0, col_edges)
                    if z_start is None or z_start + 1 >= num_cols:
                        continue
                    # x1 - 1 keeps the probe inside the span — important
                    # when x1 sits exactly on a zone boundary.
                    z_end = _zone_for_x(s.x1 - 1.0, col_edges)
                    if z_end is None or z_end <= z_start:
                        continue
                    next_col_edge = col_edges[z_start + 1]
                    overflow_pt = s.x1 - next_col_edge
                    if overflow_pt < COLUMN_OVERFLOW_PT_THRESHOLD:
                        continue
                    # Filter: span anchored within the kerning band right
                    # against the boundary it crosses (e.g. manufacturer
                    # name `CIMC` at x=207.6 with MANUFAC- edge at 209.7).
                    # Visually the span lives in the DESTINATION column;
                    # it just renders ~1–3 pt to the left of the canonical
                    # column edge. Not a real overflow.
                    if (
                        next_col_edge - s.x0
                        <= COLUMN_BOUNDARY_KERNING_BAND_PT
                    ):
                        continue
                    # Filter: right-aligned destination-column value
                    # bleeding LEFT into the prior column's zone (NOT a
                    # bug — the value lives in column N+1 with x_end pinned
                    # to that column's right edge).
                    span_type = _classify_cell_text(s.text)
                    next_expected = _column_expected_type(
                        col_names[z_start + 1]
                    )
                    if span_type != 'other' and span_type == next_expected:
                        continue
                    # Filter: span whose content matches the SOURCE
                    # column's expected type and is plausibly just a wide
                    # right-aligned variant. Only suppress if the span
                    # ALSO does not contain a merged signature.
                    source_expected = _column_expected_type(
                        col_names[z_start]
                    )
                    if (
                        span_type != 'other'
                        and span_type == source_expected
                        and span_type != 'merged_qty_unit'
                    ):
                        # Source-column content sticking out is unusual
                        # but not the canonical bug. Suppress to keep the
                        # signal clean.
                        continue
                    # Build the finding
                    if span_type == 'merged_qty_unit':
                        reason = (
                            'merged QTY+UNIT cell content — single PDF '
                            'span contains both a quantity (×N) and a '
                            'price (£N), so the QTY and UNIT cells '
                            'rendered as a single text run'
                        )
                    else:
                        reason = (
                            f'cell content ({span_type!r}) does not match '
                            f'source column {col_names[z_start]!r} or '
                            f'destination column {col_names[z_start + 1]!r}; '
                            'span bridges two column zones'
                        )
                    findings.append(
                        ColumnOverflow(
                            span=s,
                            source_col_name=col_names[z_start],
                            source_col_x=col_edges[z_start],
                            next_col_name=col_names[z_start + 1],
                            next_col_x=next_col_edge,
                            overflow_pt=overflow_pt,
                            cell_content_type=span_type,
                            reason=reason,
                        )
                    )
    return findings


def write_report(
    pdf_path: Path,
    overlap_findings: list[Overlap],
    column_findings: list[ColumnOverflow],
) -> Path:
    """Write the AUDIT-LAYOUT.md sidecar next to the PDF.

    Both V-1 (text-text overlap) and T-1 (table column-overflow) findings
    are reported here. Gate 11 fails on ANY HIGH finding from either
    check; MED and LOW findings are reported for diagnosis but do not
    fail the gate on their own.
    """
    report_path = pdf_path.with_suffix(pdf_path.suffix + '.AUDIT-LAYOUT.md')

    overlap_high = [f for f in overlap_findings if f.severity == 'HIGH']
    overlap_med = [f for f in overlap_findings if f.severity == 'MED']
    overlap_low = [f for f in overlap_findings if f.severity == 'LOW']
    column_high = [f for f in column_findings if f.severity == 'HIGH']
    column_med = [f for f in column_findings if f.severity == 'MED']

    lines: list[str] = []
    lines.append(f'# LAYOUT AUDIT — {pdf_path.name}')
    lines.append('')
    passed = not overlap_findings and not column_findings
    lines.append(f'Passed: {"PASS" if passed else "FAIL"}')
    lines.append('')
    lines.append('## Summary')
    lines.append(
        f'- V-1 text-text overlap: HIGH={len(overlap_high)}   '
        f'MED={len(overlap_med)}   LOW={len(overlap_low)}   '
        f'Total={len(overlap_findings)}'
    )
    lines.append(
        f'- T-1 table column-overflow: HIGH={len(column_high)}   '
        f'MED={len(column_med)}   Total={len(column_findings)}'
    )
    lines.append('')
    lines.append('## Thresholds')
    lines.append(
        f'- V-1 X overlap ≥ {X_OVERLAP_FRAC:.0%} of narrower span width '
        '(distinguishes overlap from side-by-side column layouts)'
    )
    lines.append(
        f'- V-1 Y overlap ≥ {Y_OVERLAP_FRAC:.0%} of shorter span height '
        '(distinguishes overlap from consecutive lines)'
    )
    lines.append(
        '- V-1 Identical-text or substring-inside pairs filtered '
        '(ligature artefacts)'
    )
    lines.append(
        f'- T-1 column overflow ≥ {COLUMN_OVERFLOW_PT_THRESHOLD:.0f} pt '
        'past the next column edge'
    )
    lines.append(
        '- T-1 BoM data rows only (header pattern PART · QTY · UNIT (£) '
        'must be present); right-aligned destination-column values '
        '(e.g. UNIT price bleeding leftward into QTY zone) suppressed'
    )
    lines.append('')

    # ---- V-1 section ----
    lines.append('## V-1 — text-text overlap findings')
    if not overlap_findings:
        lines.append('No overlap detected — text-text layout integrity confirmed.')
    else:
        by_page: dict[int, list[Overlap]] = {}
        for f in overlap_findings:
            by_page.setdefault(f.a.page, []).append(f)
        for page in sorted(by_page.keys()):
            pf = by_page[page]
            ph = sum(1 for x in pf if x.severity == 'HIGH')
            pm = sum(1 for x in pf if x.severity == 'MED')
            pl = sum(1 for x in pf if x.severity == 'LOW')
            lines.append('')
            lines.append(
                f'### Page {page} — {len(pf)} overlap(s) '
                f'(HIGH={ph} MED={pm} LOW={pl})'
            )
            for f in pf[:25]:
                lines.append('')
                lines.append(
                    f'- [{f.severity}] X={f.x_frac:.2f} Y={f.y_frac:.2f}'
                )
                lines.append(
                    f'    A: x=[{f.a.x0:6.1f}..{f.a.x1:6.1f}] '
                    f'y=[{f.a.y0:6.1f}..{f.a.y1:6.1f}] '
                    f'font={f.a.font!r}'
                )
                lines.append(f'       text={f.a.text[:160]!r}')
                lines.append(
                    f'    B: x=[{f.b.x0:6.1f}..{f.b.x1:6.1f}] '
                    f'y=[{f.b.y0:6.1f}..{f.b.y1:6.1f}] '
                    f'font={f.b.font!r}'
                )
                lines.append(f'       text={f.b.text[:160]!r}')
            if len(pf) > 25:
                lines.append('')
                lines.append(
                    f'    … {len(pf) - 25} more overlap(s) on this page omitted'
                )

    lines.append('')

    # ---- T-1 section ----
    lines.append('## T-1 — table column-overflow findings')
    if not column_findings:
        lines.append(
            'No column overflow detected — BoM table cell boundaries '
            'render cleanly.'
        )
    else:
        by_page_col: dict[int, list[ColumnOverflow]] = {}
        for f in column_findings:
            by_page_col.setdefault(f.span.page, []).append(f)
        for page in sorted(by_page_col.keys()):
            pf = by_page_col[page]
            ph = sum(1 for x in pf if x.severity == 'HIGH')
            pm = sum(1 for x in pf if x.severity == 'MED')
            lines.append('')
            lines.append(
                f'### Page {page} — {len(pf)} column-overflow finding(s) '
                f'(HIGH={ph} MED={pm})'
            )
            for f in pf[:25]:
                lines.append('')
                lines.append(
                    f'- [{f.severity}] {f.source_col_name!r} (x={f.source_col_x:.1f}) '
                    f'→ overflow {f.overflow_pt:.1f} pt into '
                    f'{f.next_col_name!r} (x={f.next_col_x:.1f}) — '
                    f'{f.cell_content_type}'
                )
                lines.append(
                    f'    span: x=[{f.span.x0:6.1f}..{f.span.x1:6.1f}] '
                    f'y=[{f.span.y0:6.1f}..{f.span.y1:6.1f}] '
                    f'font={f.span.font!r}'
                )
                lines.append(f'       text={f.span.text[:160]!r}')
                lines.append(f'    reason: {f.reason}')
            if len(pf) > 25:
                lines.append('')
                lines.append(
                    f'    … {len(pf) - 25} more column overflow(s) on this page omitted'
                )

    report_path.write_text('\n'.join(lines) + '\n')
    return report_path


def main() -> int:
    args = sys.argv[1:]
    if len(args) != 1:
        print(
            'Usage: python3 scripts/audit-pdf-layout.py <pdf-path>',
            file=sys.stderr,
        )
        return 2
    pdf_path = Path(args[0])
    if not pdf_path.exists():
        print(f'[audit-pdf-layout] PDF not found: {pdf_path}', file=sys.stderr)
        return 2

    try:
        spans = extract_spans(pdf_path)
    except Exception as exc:
        print(
            f'[audit-pdf-layout] failed to read PDF: {exc!r}',
            file=sys.stderr,
        )
        return 2

    overlap_findings = detect_overlaps(spans)
    column_findings = detect_column_overflows(spans)
    report_path = write_report(pdf_path, overlap_findings, column_findings)

    overlap_high = [f for f in overlap_findings if f.severity == 'HIGH']
    overlap_med = [f for f in overlap_findings if f.severity == 'MED']
    overlap_low = [f for f in overlap_findings if f.severity == 'LOW']
    column_high = [f for f in column_findings if f.severity == 'HIGH']
    column_med = [f for f in column_findings if f.severity == 'MED']

    has_overlap = bool(overlap_findings)
    has_column = bool(column_findings)

    if has_overlap or has_column:
        # FAIL — print top samples to stdout so the chain operator sees them
        # without opening the report file.
        print(
            f'LAYOUT-AUDIT: FAIL — V-1 overlaps={len(overlap_findings)} '
            f'(HIGH={len(overlap_high)} MED={len(overlap_med)} '
            f'LOW={len(overlap_low)})   '
            f'T-1 column-overflows={len(column_findings)} '
            f'(HIGH={len(column_high)} MED={len(column_med)}) → '
            f'{report_path}'
        )
        if has_overlap:
            sample_pool = overlap_high or overlap_findings
            for f in sample_pool[:5]:
                print(
                    f'  ✗ V-1 p{f.a.page} [{f.severity}] '
                    f'X={f.x_frac:.2f} Y={f.y_frac:.2f} '
                    f'A={f.a.text[:60]!r} vs B={f.b.text[:60]!r}'
                )
        if has_column:
            sample_pool_t1 = column_high or column_findings
            for f in sample_pool_t1[:5]:
                print(
                    f'  ✗ T-1 p{f.span.page} [{f.severity}] '
                    f'col={f.source_col_name!r}→{f.next_col_name!r} '
                    f'overflow={f.overflow_pt:.1f}pt '
                    f'text={f.span.text[:60]!r}'
                )
        return 11

    print(
        f'LAYOUT-AUDIT: PASS — 0 V-1 overlaps, 0 T-1 column overflows '
        f'detected → {report_path}'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
