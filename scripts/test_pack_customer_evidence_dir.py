#!/usr/bin/env python3
"""Ensure customer-facing EM evidence packs ship as electromagnetics/, not em-honesty/.

Regression: Tristan 2026-08-06 — "honesty" folder name reads as special pleading
on external packs. Universal rename in build-excel-export + full-clean-rerun.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SOURCES = [
    ROOT / "scripts" / "build-excel-export.py",
    ROOT / "scripts" / "fe-front-full-clean-rerun.sh",
]


def test_no_em_honesty_in_pack_ship_paths() -> None:
    for path in SOURCES:
        text = path.read_text(encoding="utf-8")
        # Allow historical mentions only inside comments that explain the rename
        bare = [
            m.group(0)
            for m in re.finditer(r"em-honesty[/']?", text)
            if "was em-honesty" not in text[max(0, m.start() - 40) : m.end() + 40]
            and "legacy" not in text[max(0, m.start() - 80) : m.end() + 40].lower()
        ]
        # filter comment-only lines
        bad = []
        for line in text.splitlines():
            if "em-honesty" not in line:
                continue
            stripped = line.strip()
            if stripped.startswith("#") and ("was " in stripped or "legacy" in stripped.lower() or "renamed" in stripped.lower()):
                continue
            if "was em-honesty" in line:
                continue
            bad.append(stripped[:120])
        assert not bad, f"{path.name} still ships em-honesty:\n" + "\n".join(bad)


def test_electromagnetics_is_default_ship_dir() -> None:
    text = (ROOT / "scripts" / "build-excel-export.py").read_text(encoding="utf-8")
    assert 'electromagnetics/' in text
    assert text.count("electromagnetics/") >= 5


if __name__ == "__main__":
    test_no_em_honesty_in_pack_ship_paths()
    test_electromagnetics_is_default_ship_dir()
    print("test_pack_customer_evidence_dir OK")
