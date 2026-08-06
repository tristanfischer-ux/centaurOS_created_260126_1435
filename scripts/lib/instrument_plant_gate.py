#!/usr/bin/env python3
"""Hard gate: plant-economic drivers must not contaminate instrument frames (U5).

Before Inputs densify / financial scoring, instruments quarantine sale-price,
feedstock, LCOE and plant-capacity drivers unless explicitly wired to an
instrument capital model.

Does not invent finance — only removes or relocates orphan plant keys so they
cannot score as live Inputs.
"""
from __future__ import annotations

import copy
from typing import Any, Final

# Re-export the same forbidden set used by pack_layout tests.
try:
    from pack_layout import (  # type: ignore
        INSTRUMENT_FORBIDDEN_PLANT_DRIVERS,
        instrument_plant_driver_leaks,
    )
except ImportError:  # pragma: no cover — package path when scripts/lib on sys.path
    from scripts.lib.pack_layout import (  # type: ignore
        INSTRUMENT_FORBIDDEN_PLANT_DRIVERS,
        instrument_plant_driver_leaks,
    )

# Quantity / driver bags scanned for leaks.
_BAG_PATHS: Final[tuple[tuple[str, ...], ...]] = (
    ("economic_drivers",),
    ("financial_drivers",),
    ("inputs_drivers",),
    ("orchestratorContract", "quantities"),
    ("engineeringContract", "quantities"),
)

# Keys that may remain on instrument capital / product path (not plant LCOE).
# UNIVERSAL: cost + product performance quantities — never sale_price / feedstock / lcoe.
_INSTRUMENT_CAPITAL_ALLOW: Final[frozenset[str]] = frozenset({
    "unit_cost_ceiling_gbp",
    "bom_cost_midpoint_gbp",
    "bom_cost_floor_gbp",
    "raw_materials_bom_gbp",
    "assembled_bom_total_gbp",
    "grand_total_gbp",
    "working_volume_ml",
    "working_volume_min_ml",
    "culture_temperature_c",
    "culture_temperature_degc",
    "vessel_working_volume_ml",
    "vessel_working_volume_min_ml",
    "culture_thermal_setpoint_achieved_c",
})

# Prefixes that are product performance (keep) vs plant-econ (already in forbidden set).
_INSTRUMENT_KEEP_PREFIXES: Final[tuple[str, ...]] = (
    "working_volume", "culture_temp", "vessel_", "optical_", "agitation_",
    "peak_heater", "peak_electrical", "enclosure_", "temperature_stability",
    "bom_cost", "assembled_bom", "unit_cost", "raw_materials",
)


def _get_bag(state: dict, path: tuple[str, ...]) -> Any:
    cur: Any = state
    for p in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
    return cur


def _set_bag(state: dict, path: tuple[str, ...], value: Any) -> None:
    cur: Any = state
    for p in path[:-1]:
        nxt = cur.get(p)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[p] = nxt
        cur = nxt
    cur[path[-1]] = value


def collect_driver_keys(state: dict) -> list[str]:
    keys: list[str] = []
    for path in _BAG_PATHS:
        bag = _get_bag(state, path)
        if isinstance(bag, dict):
            keys.extend(str(k) for k in bag.keys())
        elif isinstance(bag, list):
            for row in bag:
                if isinstance(row, dict) and "key" in row:
                    keys.append(str(row["key"]))
    return keys


def quarantine_plant_drivers(
    state: dict,
    *,
    mutate: bool = True,
) -> dict[str, Any]:
    """Quarantine forbidden plant drivers on instrument twins.

    Returns report:
      is_instrument, leaks_before, quarantined, state (possibly mutated copy)
    """
    out_state = state if mutate else copy.deepcopy(state)
    is_inst = bool(out_state.get("isInstrumentDevice"))
    if not is_inst:
        return {
            "is_instrument": False,
            "leaks_before": [],
            "quarantined": [],
            "state": out_state,
            "blocked": False,
        }

    leaks = instrument_plant_driver_leaks(True, collect_driver_keys(out_state))
    quarantined: list[str] = []
    vault = out_state.setdefault("_quarantined_plant_drivers", {})
    if not isinstance(vault, dict):
        vault = {}
        out_state["_quarantined_plant_drivers"] = vault

    for path in _BAG_PATHS:
        bag = _get_bag(out_state, path)
        if not isinstance(bag, dict):
            continue
        for k in list(bag.keys()):
            kl = str(k).lower()
            if kl in _INSTRUMENT_CAPITAL_ALLOW or str(k) in _INSTRUMENT_CAPITAL_ALLOW:
                continue
            if any(kl.startswith(pref) for pref in _INSTRUMENT_KEEP_PREFIXES):
                continue
            if kl in INSTRUMENT_FORBIDDEN_PLANT_DRIVERS or any(
                kl == f or kl.startswith(f + "_") for f in INSTRUMENT_FORBIDDEN_PLANT_DRIVERS
            ):
                vault[f"{'.'.join(path)}.{k}"] = bag.pop(k)
                quarantined.append(str(k))

    leaks_after = instrument_plant_driver_leaks(True, collect_driver_keys(out_state))
    return {
        "is_instrument": True,
        "leaks_before": leaks,
        "quarantined": sorted(set(quarantined)),
        "leaks_after": leaks_after,
        "state": out_state,
        "blocked": bool(leaks_after),  # still blocked if anything remains
    }


def assert_instrument_frame_clean(state: dict) -> None:
    """Raise ValueError if an instrument still carries plant LCOE drivers."""
    report = quarantine_plant_drivers(state, mutate=False)
    if report["blocked"] or report["leaks_before"]:
        # After quarantine on a copy — if leaks_before non-empty, callers must quarantine.
        remaining = report.get("leaks_after") or report["leaks_before"]
        if remaining:
            raise ValueError(
                "instrument plant-driver gate: plant-economic keys still present on "
                f"isInstrumentDevice twin: {remaining}"
            )


if __name__ == "__main__":
    plant = {
        "isInstrumentDevice": False,
        "orchestratorContract": {
            "quantities": {"sale_price": {"value": 1}, "lcoe": {"value": 2}}
        },
    }
    r = quarantine_plant_drivers(plant, mutate=False)
    assert r["quarantined"] == []

    inst = {
        "isInstrumentDevice": True,
        "orchestratorContract": {
            "quantities": {
                "sale_price": {"value": 22},
                "lcoe": {"value": 0.1},
                "working_volume_ml": {"value": 20},
            }
        },
        "economic_drivers": {"feedstock_price": 1.0, "annual_volume": 1000},
    }
    r2 = quarantine_plant_drivers(inst, mutate=True)
    assert "sale_price" in r2["quarantined"] or "lcoe" in r2["quarantined"]
    q = inst["orchestratorContract"]["quantities"]
    assert "sale_price" not in q and "lcoe" not in q
    assert "working_volume_ml" in q
    assert "feedstock_price" not in inst.get("economic_drivers", {})
    print("instrument_plant_gate selftest OK", r2["quarantined"])
