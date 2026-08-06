#!/usr/bin/env python3
"""Dual-class pack smoke (Anvil U7) — FE motor + instrument packs.

Validates on-disk design packs when present; skips soft when a class is missing
so CI without twins still runs the pure-library assertions.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from pack_layout import (  # noqa: E402
    ELECTROMAGNETICS_DIR,
    validate_pack_root,
    is_forbidden_pack_path,
)
from em_capability import electromagnetics_pack_applicable  # noqa: E402


def _latest_pack(glob_pat: str) -> Path | None:
    packs = sorted(
        (ROOT / "out").glob(glob_pat),
        key=lambda p: p.stat().st_mtime if p.is_dir() else 0,
        reverse=True,
    )
    return packs[0] if packs else None


def test_forbidden_segment_helper() -> None:
    assert is_forbidden_pack_path("em-honesty/x.png")
    assert not is_forbidden_pack_path(f"{ELECTROMAGNETICS_DIR}/x.png")


def test_motor_pack_if_present() -> None:
    """Any motor/MGU design pack — not only one FE revision stamp."""
    pack = _latest_pack("**/*formula-e*design-pack")
    if pack is None:
        pack = _latest_pack("**/*mgu*design-pack")
    if pack is None or not pack.is_dir():
        print("skip: no motor design pack on disk")
        return
    problems = validate_pack_root(pack)
    assert not problems, f"motor pack layout: {problems}"
    assert not (pack / "em-honesty").exists()
    if (pack / ELECTROMAGNETICS_DIR).is_dir():
        assert any((pack / ELECTROMAGNETICS_DIR).iterdir())
    twin = pack.parent
    decision = electromagnetics_pack_applicable(
        str(twin),
        {"product_class": "formula_e_front_mgu", "isInstrumentDevice": False},
    )
    print(f"motor pack OK: {pack.name} em_decision={decision['applicable']}")


def test_instrument_pack_if_present() -> None:
    """Any instrument design pack (bioreactor, colorimeter, …) — class-agnostic."""
    pack = _latest_pack("**/*benchtop*design-pack")
    if pack is None:
        pack = _latest_pack("**/*instrument*design-pack")
    if pack is None or not pack.is_dir():
        print("skip: no instrument design pack on disk")
        return
    problems = validate_pack_root(pack)
    assert not problems, f"instrument pack layout: {problems}"
    assert not (pack / "em-honesty").exists()
    em = pack / ELECTROMAGNETICS_DIR
    if em.is_dir():
        names = {p.name for p in em.iterdir()}
        for bad in ("01-dual-torque-bars.png", "FE-FRONT-PATH-B-EM-HONESTY-PACK.pdf"):
            assert bad not in names, f"instrument pack must not invent motor field plots: {bad}"
    twin = pack.parent
    decision = electromagnetics_pack_applicable(
        str(twin),
        {"isInstrumentDevice": True, "product_class": "benchtop_instrument"},
    )
    assert decision["applicable"] is False
    assert decision["run_motor_phases"] is False
    print(f"instrument pack OK: {pack.name}")


def test_capability_matrix_pure() -> None:
    """Motor vs instrument capability matrix without requiring packs on disk."""
    import tempfile
    from pathlib import Path as P

    with tempfile.TemporaryDirectory() as td:
        # instrument
        d = electromagnetics_pack_applicable(td, {"isInstrumentDevice": True})
        assert d["run_motor_phases"] is False
        # bare dir — no EM
        d2 = electromagnetics_pack_applicable(td, {"product_class": "unknown_plant"})
        assert d2["applicable"] is False
        # synthetic motor twin
        ms = P(td) / "_motor_stack"
        ms.mkdir()
        (ms / "em_fia_front_kit_case_PATH_B_DEC009.json").write_text("{}")
        d3 = electromagnetics_pack_applicable(
            td, {"product_class": "formula_e_front_mgu", "isInstrumentDevice": False}
        )
        assert d3["applicable"] is True
        assert d3["run_motor_phases"] is True


def test_send_pack_chrome_if_present() -> None:
    """P0 chrome on latest packs when build_send_pack has been applied."""
    from pack_layout import validate_send_pack_chrome
    for glob_pat in ("**/*formula-e*design-pack", "**/*benchtop*design-pack"):
        pack = _latest_pack(glob_pat)
        if not pack:
            continue
        if not (pack / "README-FIRST.txt").is_file():
            print(f"skip chrome strict: {pack.name} (pre-P0 pack)")
            continue
        problems = validate_send_pack_chrome(pack)
        assert not problems, f"chrome: {pack.name}: {problems}"
        assert "em-honesty" not in (pack / "README-FIRST.txt").read_text()
        print(f"chrome OK: {pack.name}")


def test_illustrated_cover_discover_and_emit() -> None:
    """Cover v2: discover figures + emit illustrated HTML (temp pack)."""
    import base64
    import tempfile
    from build_pack_cover import discover_pack_figures, write_illustrated_cover

    png_1x1 = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    with tempfile.TemporaryDirectory() as td:
        pack = Path(td)
        (pack / "renders").mkdir()
        (pack / "renders" / "00-hero.png").write_bytes(png_1x1)
        (pack / "renders" / "08-product-ghost-shell.png").write_bytes(png_1x1)
        (pack / "drawings").mkdir()
        (pack / "drawings" / "general-arrangement.png").write_bytes(png_1x1)
        figs = discover_pack_figures(pack)
        assert len(figs) >= 3
        r = write_illustrated_cover(
            pack,
            product_title="Illust Selftest",
            pack_revision="V0",
            twin_id="selftest",
            decision_bullets=["Figure embed works."],
            figures=figs,
        )
        html = Path(r["illustrated_html"]).read_text(encoding="utf-8")
        assert "data:image" in html
        assert "Product hero" in html
        print("illustrated cover selftest OK", r["embedded_bytes"], "bytes")


def test_bio_pack_has_illustrated_cover_if_present() -> None:
    """Live bio pack should ship multi-MB illustrated cover after cover v2."""
    pack = _latest_pack("**/*benchtop*design-pack")
    if not pack or not pack.is_dir():
        print("skip: no bio pack")
        return
    ill = pack / "00-COVER-NARRATIVE-illustrated.html"
    if not ill.is_file():
        print(f"skip illustrated: {pack.name} (pre-cover-v2)")
        return
    size = ill.stat().st_size
    text = ill.read_text(encoding="utf-8", errors="replace")
    assert "data:image" in text, "illustrated cover must embed figures"
    # With real renders, expect multi-hundred-KB minimum; soft floor avoids flaking
    # on CI without large assets.
    if (pack / "renders" / "00-hero.png").is_file() and (
        pack / "renders" / "00-hero.png"
    ).stat().st_size > 100_000:
        assert size > 200_000, f"illustrated cover too thin: {size} bytes"
    print(f"bio illustrated cover OK: {pack.name} ({size // 1024} KB)")


if __name__ == "__main__":
    test_forbidden_segment_helper()
    test_capability_matrix_pure()
    test_motor_pack_if_present()
    test_instrument_pack_if_present()
    test_send_pack_chrome_if_present()
    test_illustrated_cover_discover_and_emit()
    test_bio_pack_has_illustrated_cover_if_present()
    print("test_dual_class_pack_smoke OK")

