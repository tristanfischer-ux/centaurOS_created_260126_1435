#!/usr/bin/env python3
"""Instrument must not score plant LCOE / feedstock drivers (Anvil U5)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from pack_layout import (  # noqa: E402
    INSTRUMENT_FORBIDDEN_PLANT_DRIVERS,
    instrument_plant_driver_leaks,
)


def test_plant_product_allows_drivers() -> None:
    leaks = instrument_plant_driver_leaks(
        False, ["sale_price", "lcoe", "working_volume_ml"]
    )
    assert leaks == []


def test_instrument_rejects_plant_drivers() -> None:
    leaks = instrument_plant_driver_leaks(
        True,
        [
            "working_volume_ml",
            "culture_temperature_c",
            "sale_price",
            "feedstock_price",
            "lcoe",
            "annual_volume",
        ],
    )
    assert set(leaks) == {
        "sale_price",
        "feedstock_price",
        "lcoe",
        "annual_volume",
    }


def test_forbidden_set_covers_lcoe_family() -> None:
    assert "lcoe" in INSTRUMENT_FORBIDDEN_PLANT_DRIVERS
    assert "sale_price" in INSTRUMENT_FORBIDDEN_PLANT_DRIVERS


def test_bioreactor_twins_if_present() -> None:
    """Live twins flagged isInstrumentDevice must not carry plant LCOE keys in
    their active economic-driver lists (when that artefact exists)."""
    import json

    for twin_name in (
        "organoid-bioreactor-20260722-0957",
        "organoid-9drive-r11-allfixes",
    ):
        twin = ROOT / "out" / twin_name
        state_path = twin / "state.json"
        if not state_path.is_file():
            # Some twins keep state only inside generator / excel cache — skip soft.
            continue
        state = json.loads(state_path.read_text())
        if not state.get("isInstrumentDevice"):
            continue
        # Collect driver-like keys from common econ bags if present.
        keys: list[str] = []
        for bag_name in ("economic_drivers", "financial_drivers", "inputs_drivers"):
            bag = state.get(bag_name) or {}
            if isinstance(bag, dict):
                keys.extend(bag.keys())
            elif isinstance(bag, list):
                for row in bag:
                    if isinstance(row, dict) and "key" in row:
                        keys.append(str(row["key"]))
        leaks = instrument_plant_driver_leaks(True, keys)
        assert not leaks, f"{twin_name}: plant drivers still live on instrument: {leaks}"


if __name__ == "__main__":
    test_plant_product_allows_drivers()
    test_instrument_rejects_plant_drivers()
    test_forbidden_set_covers_lcoe_family()
    test_bioreactor_twins_if_present()
    print("test_instrument_no_plant_lcoe_frame OK")
