#!/usr/bin/env python3
"""
scripts/blender-universal/drawing_titleblock.py

SHARED TITLE-BLOCK METADATA for the 8 pure-Python drawing generators
(draw_*.py). One source of truth for the two deterministic title-block fields
that were previously hardcoded as placeholders in five of the eight drawings:

    REV  — the document revision.  "P1" (Preliminary issue 1) for every drawing,
           so the whole set carries a consistent, honest preliminary revision
           rather than an "—   (placeholder)" literal.

    issue_date(out_dir) — a DETERMINISTIC issue date (YYYY-MM-DD) derived from
           the run's OWN artifacts (newest mtime of state.json / the convergence
           report / the connection schedule; fallback out_dir mtime).  NOT a live
           clock, so re-rendering the same run yields the same date.  Returns ''
           only when nothing is readable (the block then shows '—', never the
           literal placeholder).

This is the helper that already lived verbatim in draw_single_line.py /
draw_pid.py, lifted here so all eight generators share ONE implementation.
The generators run as isolated subprocesses from this directory and already
import sibling modules, so `import drawing_titleblock as _tb` works.

British spelling throughout.
"""
from __future__ import annotations

import datetime
from pathlib import Path

# Document revision for the whole drawing set — preliminary issue.  Deterministic
# (not a live clock); a single constant so every drawing's title block agrees.
REV = "P1"


def issue_date(out_dir) -> str:
    """A DETERMINISTIC issue date (YYYY-MM-DD) for the title block, derived from the run's
    OWN artifacts — NOT a live clock — so re-rendering the same run gives the same date.
    Prefers the newest of the chain's authoritative outputs (state.json, the convergence
    report, the connection schedule); falls back to the out_dir mtime. Returns '' only if
    nothing is readable (the block then shows '—' rather than the literal placeholder)."""
    if not out_dir:
        return ""
    best = None
    for name in ("state.json", "convergence-report.json", "connection-schedule.json"):
        p = Path(out_dir) / name
        try:
            if p.is_file():
                m = p.stat().st_mtime
                best = m if best is None else max(best, m)
        except OSError:
            pass
    if best is None:
        try:
            best = Path(out_dir).stat().st_mtime
        except OSError:
            return ""
    try:
        return datetime.date.fromtimestamp(best).isoformat()
    except (OverflowError, OSError, ValueError):
        return ""
