#!/usr/bin/env python3
"""Pack layout schema + forbidden segments (Anvil universality)."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from pack_layout import (  # noqa: E402
    ELECTROMAGNETICS_DIR,
    FORBIDDEN_PACK_SEGMENTS,
    electromagnetics_dest,
    is_forbidden_pack_path,
)


def test_electromagnetics_dir_name() -> None:
    assert ELECTROMAGNETICS_DIR == "electromagnetics"
    assert "em-honesty" in FORBIDDEN_PACK_SEGMENTS


def test_forbidden_paths() -> None:
    assert is_forbidden_pack_path("em-honesty/01-dual-torque-bars.png")
    assert is_forbidden_pack_path("foo/em-honesty/bar.png")
    assert not is_forbidden_pack_path("electromagnetics/01-dual-torque-bars.png")
    assert not is_forbidden_pack_path("renders/00-hero.png")


def test_dest_helper() -> None:
    assert electromagnetics_dest("x.png") == "electromagnetics/x.png"


def test_fe_pack_on_disk_if_present() -> None:
    """Optional: latest FE pack must not contain em-honesty/ after rename."""
    packs = sorted(
        Path(ROOT / "out").glob("**/20260805-2049-V1.299-formula-e-front-mgu-design-pack"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not packs:
        print("skip: no FE V1.299 pack on disk")
        return
    pack = packs[0]
    assert not (pack / "em-honesty").exists(), f"{pack} still has em-honesty/"
    assert (pack / "electromagnetics").is_dir(), f"{pack} missing electromagnetics/"


if __name__ == "__main__":
    test_electromagnetics_dir_name()
    test_forbidden_paths()
    test_dest_helper()
    test_fe_pack_on_disk_if_present()
    print("test_pack_layout_schema OK")
