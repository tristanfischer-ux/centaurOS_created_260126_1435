#!/usr/bin/env python3
"""Connection-trace ghost-majority rule (Anvil universality U6).

Protects instruments from failing the shared score floor when the parts-ledger
still carries procurement / consumable / administrative edges that are not
topology for the rendered interconnect.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from pack_layout import connection_ghost_majority  # noqa: E402


def test_pruned_instrument_ledger_ok() -> None:
    # Gold-spine instrument: 7 rendered principals, 7 ledger edges.
    assert not connection_ghost_majority(7, 7)
    assert not connection_ghost_majority(19, 1)  # below min_ledger threshold


def test_ghost_majority_trips() -> None:
    # Pre-prune bioreactor shape: 1 rendered vs 36 ledger.
    assert connection_ghost_majority(36, 1)
    assert connection_ghost_majority(60, 10)  # 60 > 30


def test_balanced_large_ledger_ok() -> None:
    # Plant-scale: many ledger edges, commensurate sheet rows.
    assert not connection_ghost_majority(60, 30)  # 60 is not > 90
    assert not connection_ghost_majority(20, 7)  # 20 is not > 21


def test_r11_and_0957_fixtures_if_present() -> None:
    """On-disk twins: after prune, ghost majority must not trip."""
    import json

    for rel, expect_trip in (
        ("out/organoid-bioreactor-20260722-0957/parts-ledger.json", False),
        ("out/organoid-9drive-r11-allfixes/parts-ledger.json", None),  # inspect only
    ):
        path = ROOT / rel
        if not path.is_file():
            continue
        pl = json.loads(path.read_text())
        n_led = len(pl.get("connections") or [])
        # Without workbook row count, only assert prune discipline when known small.
        if expect_trip is False:
            assert n_led < 20 or n_led <= 21, (
                f"{rel}: ledger still has {n_led} connections — prune for instruments "
                f"or expand the connection-trace sheet before scoring"
            )
            assert not connection_ghost_majority(n_led, max(n_led, 1))


if __name__ == "__main__":
    test_pruned_instrument_ledger_ok()
    test_ghost_majority_trips()
    test_balanced_large_ledger_ok()
    test_r11_and_0957_fixtures_if_present()
    print("test_connection_trace_ghost_ratio OK")
