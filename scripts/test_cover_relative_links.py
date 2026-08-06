#!/usr/bin/env python3
"""Cover HTML must use pack-relative links only (Anvil U4)."""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from build_pack_cover import build_pack_cover, assert_relative_hrefs  # noqa: E402


def test_generated_cover_hrefs_relative() -> None:
    with tempfile.TemporaryDirectory() as td:
        pack = Path(td)
        (pack / "MANIFEST.txt").write_text("dossier.xlsx\nrenders/00-hero.png\n")
        (pack / "dossier.xlsx").write_bytes(b"PK\x03\x04fake")
        (pack / "renders").mkdir()
        (pack / "renders" / "00-hero.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        out = build_pack_cover(
            pack_dir=pack,
            product_title="Test Instrument",
            twin_id="test-twin-001",
            pack_revision="V0.1",
            ship_ok=False,
            decision_bullets=["Concept pack for regression only."],
            folder_map=[
                ("Inventory", "MANIFEST.txt", "File list"),
                ("Renders", "renders/00-hero.png", "Hero view"),
                ("Workbook", "dossier.xlsx", "Engineering dossier"),
            ],
            brand="Anvil",
        )
        html_path = Path(out["html"])
        assert html_path.is_file()
        problems = assert_relative_hrefs(html_path, pack)
        assert not problems, problems
        text = html_path.read_text()
        assert "/Users/" not in text
        assert "file://" not in text


def test_absolute_path_detected() -> None:
    with tempfile.TemporaryDirectory() as td:
        pack = Path(td)
        bad = pack / "bad.html"
        bad.write_text('<a href="/Users/tristan/secret/dossier.xlsx">x</a>')
        problems = assert_relative_hrefs(bad, pack)
        assert problems, "should flag absolute machine path"


_ABS_RX = re.compile(r"""(?:href|src)\s*=\s*["'](/Users/|file://|[A-Za-z]:\\)""", re.I)


def test_fe_cover_if_present() -> None:
    packs = sorted(
        (ROOT / "out").glob("**/20260805-2049-V1.299-formula-e-front-mgu-design-pack"),
    )
    if not packs:
        print("skip: no FE V1.299 pack")
        return
    pack = packs[0]
    for name in ("00-COVER-NARRATIVE.html", "00-COVER-CLICK-INDEX.html"):
        p = pack / name
        if not p.is_file():
            continue
        text = p.read_text(errors="replace")
        assert not _ABS_RX.search(text), f"{p} still has absolute href/src"
        assert "/Users/" not in text


if __name__ == "__main__":
    test_generated_cover_hrefs_relative()
    test_absolute_path_detected()
    test_fe_cover_if_present()
    print("test_cover_relative_links OK")
