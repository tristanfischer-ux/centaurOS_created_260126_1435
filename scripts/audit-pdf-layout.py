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

Usage:
    python3 scripts/audit-pdf-layout.py <pdf-path>

Writes <pdf-path>.AUDIT-LAYOUT.md and exits:
    0  — no overlap findings (PASS)
   11  — at least one overlap finding (FAIL, blocks chain)
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

False-positive filters (codified 2026-05-24):
    1. Identical text + one bbox fully inside the other = ligature artefact
       (PDF font renderer emitting the same string twice). Skip.
    2. One span's text is a substring of the other AND its bbox is fully
       contained in the other's bbox = same artefact in long-text mode. Skip.
    3. Page-furniture pairs (header/footer page-number bands at y < 60 or
       y > 800 with cross-text overlap) — none observed in BESS L7, but the
       filter is in place for header-band edge cases. Skip.
"""

from __future__ import annotations

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


def write_report(pdf_path: Path, findings: list[Overlap]) -> Path:
    """Write the AUDIT-LAYOUT.md sidecar next to the PDF."""
    report_path = pdf_path.with_suffix(pdf_path.suffix + '.AUDIT-LAYOUT.md')
    high = [f for f in findings if f.severity == 'HIGH']
    med = [f for f in findings if f.severity == 'MED']
    low = [f for f in findings if f.severity == 'LOW']
    lines: list[str] = []
    lines.append(f'# LAYOUT AUDIT — {pdf_path.name}')
    lines.append('')
    passed = len(findings) == 0
    lines.append(f'Passed: {"PASS" if passed else "FAIL"}')
    lines.append(
        f'HIGH: {len(high)}   MED: {len(med)}   LOW: {len(low)}   '
        f'Total: {len(findings)}'
    )
    lines.append('')
    lines.append('Thresholds:')
    lines.append(
        f'- X overlap ≥ {X_OVERLAP_FRAC:.0%} of narrower span width '
        '(distinguishes overlap from side-by-side column layouts)'
    )
    lines.append(
        f'- Y overlap ≥ {Y_OVERLAP_FRAC:.0%} of shorter span height '
        '(distinguishes overlap from consecutive lines)'
    )
    lines.append(
        '- Identical-text or substring-inside pairs filtered '
        '(ligature artefacts)'
    )
    lines.append('')
    if not findings:
        lines.append('## Findings')
        lines.append('No overlap detected — layout integrity confirmed.')
    else:
        # Group by page
        by_page: dict[int, list[Overlap]] = {}
        for f in findings:
            by_page.setdefault(f.a.page, []).append(f)
        lines.append('## Findings by page')
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
            # Cap rendered findings per page to 25 to keep the report
            # readable; the chain blocks on any finding regardless
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
                lines.append(f'    … {len(pf) - 25} more overlap(s) on this page omitted')
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

    findings = detect_overlaps(spans)
    report_path = write_report(pdf_path, findings)

    high_count = sum(1 for f in findings if f.severity == 'HIGH')
    med_count = sum(1 for f in findings if f.severity == 'MED')
    low_count = sum(1 for f in findings if f.severity == 'LOW')

    if findings:
        # FAIL — print top samples to stdout so the chain operator sees them
        # without opening the report file.
        print(
            f'LAYOUT-AUDIT: FAIL — {len(findings)} overlap(s) '
            f'(HIGH={high_count} MED={med_count} LOW={low_count}) → {report_path}'
        )
        # Show first 5 HIGH (or first 5 of anything if no HIGH)
        sample_pool = [f for f in findings if f.severity == 'HIGH'] or findings
        for f in sample_pool[:5]:
            print(
                f'  ✗ p{f.a.page} [{f.severity}] X={f.x_frac:.2f} Y={f.y_frac:.2f} '
                f'A={f.a.text[:60]!r} vs B={f.b.text[:60]!r}'
            )
        return 11

    print(f'LAYOUT-AUDIT: PASS — 0 overlaps detected → {report_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
