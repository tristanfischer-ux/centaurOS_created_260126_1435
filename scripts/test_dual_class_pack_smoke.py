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


def test_fe_pack_if_present() -> None:
    pack = _latest_pack("**/20260805-2049-V1.299-formula-e-front-mgu-design-pack")
    if pack is None:
        pack = _latest_pack("**/*formula-e-front-mgu-design-pack")
    if pack is None or not pack.is_dir():
        print("skip: no FE design pack on disk")
        return
    problems = validate_pack_root(pack)
    assert not problems, f"FE pack layout: {problems}"
    assert not (pack / "em-honesty").exists()
    # FE with Path B should ship electromagnetics when pack was built post-rename
    if (pack / ELECTROMAGNETICS_DIR).is_dir():
        assert any((pack / ELECTROMAGNETICS_DIR).iterdir())
    twin = pack.parent
    decision = electromagnetics_pack_applicable(
        str(twin),
        {"product_class": "formula_e_front_mgu", "isInstrumentDevice": False},
    )
    # Twin may still hold motor stack even if pack was slim
    print(f"FE pack OK: {pack.name} em_decision={decision['applicable']}")


def test_bioreactor_pack_if_present() -> None:
    pack = _latest_pack("**/20260806-0402-V1.10-benchtop-bioreactor-design-pack")
    if pack is None:
        pack = _latest_pack("**/*benchtop-bioreactor-design-pack")
    if pack is None or not pack.is_dir():
        print("skip: no bioreactor design pack on disk")
        return
    problems = validate_pack_root(pack)
    assert not problems, f"bioreactor pack layout: {problems}"
    assert not (pack / "em-honesty").exists()
    # Instrument: electromagnetics/ should be absent (or N/A only)
    em = pack / ELECTROMAGNETICS_DIR
    if em.is_dir():
        names = {p.name for p in em.iterdir()}
        # May only contain README-not-applicable — never field plots
        for bad in ("01-dual-torque-bars.png", "FE-FRONT-PATH-B-EM-HONESTY-PACK.pdf"):
            assert bad not in names, f"instrument pack must not invent {bad}"
    twin = pack.parent
    decision = electromagnetics_pack_applicable(
        str(twin),
        {"isInstrumentDevice": True, "product_class": "benchtop_bioreactor"},
    )
    assert decision["applicable"] is False
    assert decision["run_motor_phases"] is False
    print(f"bioreactor pack OK: {pack.name}")


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


if __name__ == "__main__":
    test_forbidden_segment_helper()
    test_capability_matrix_pure()
    test_fe_pack_if_present()
    test_bioreactor_pack_if_present()
    print("test_dual_class_pack_smoke OK")
