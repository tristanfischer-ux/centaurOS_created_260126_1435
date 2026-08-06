#!/usr/bin/env python3
"""Anvil universality invariants — plant and instrument share rules, not product names.

Proves:
  * plant drivers quarantined only when isInstrumentDevice
  * EM phases only for motor capability
  * non-physical edges dropped only for instruments
  * catalogue function-class bans are noun-keyed
  * pack paths never em-honesty/
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from catalogue_function_class import audit_part_identity, audit_parts_iterable  # noqa: E402
from em_capability import electromagnetics_pack_applicable  # noqa: E402
from instrument_connection_kinds import (  # noqa: E402
    edge_is_nonphysical,
    prune_nonphysical_instrument_edges,
)
from instrument_plant_gate import quarantine_plant_drivers  # noqa: E402
from pack_layout import is_forbidden_pack_path, ELECTROMAGNETICS_DIR  # noqa: E402
from topology_prune import connection_ghost_majority, prune_instrument_ghost_connections  # noqa: E402


def test_plant_keeps_sale_price() -> None:
    st = {
        "isInstrumentDevice": False,
        "orchestratorContract": {"quantities": {"sale_price": {"value": 10}, "lcoe": {"value": 1}}},
    }
    r = quarantine_plant_drivers(st, mutate=True)
    assert r["quarantined"] == []
    assert "sale_price" in st["orchestratorContract"]["quantities"]


def test_instrument_quarantines_plant_keeps_product() -> None:
    st = {
        "isInstrumentDevice": True,
        "orchestratorContract": {
            "quantities": {
                "sale_price": {"value": 10},
                "lcoe": {"value": 1},
                "working_volume_ml": {"value": 20},
                "optical_path_length_mm": {"value": 10},
            }
        },
    }
    r = quarantine_plant_drivers(st, mutate=True)
    assert "sale_price" in r["quarantined"] or "lcoe" in r["quarantined"]
    q = st["orchestratorContract"]["quantities"]
    assert "working_volume_ml" in q
    assert "optical_path_length_mm" in q
    assert "sale_price" not in q


def test_em_instrument_vs_motor() -> None:
    with tempfile.TemporaryDirectory() as td:
        d_i = electromagnetics_pack_applicable(td, {"isInstrumentDevice": True})
        assert d_i["run_motor_phases"] is False
        ms = Path(td) / "_motor_stack"
        ms.mkdir()
        (ms / "em_generic_kit_case_PATH_B.json").write_text("{}")
        d_m = electromagnetics_pack_applicable(
            td, {"isInstrumentDevice": False, "product_class": "traction_mgu"}
        )
        assert d_m["applicable"] is True
        assert d_m["run_motor_phases"] is True


def test_nonphysical_edges_instrument_only() -> None:
    conns = [
        {"from_part": "Ferrite", "to_part": "Thermal Interface Pad", "kind": "power"},
        {"from_part": "Pump", "to_part": "Vessel", "kind": "water"},
    ]
    k, n = prune_nonphysical_instrument_edges([], conns, is_instrument=True)
    assert n >= 1
    k2, n2 = prune_nonphysical_instrument_edges([], conns, is_instrument=False)
    assert n2 == 0 and len(k2) == 2


def test_catalogue_noun_rules_not_class_table() -> None:
    assert audit_part_identity(
        name="Magnetic Stirrer Drive", part="Nidec Fan F280A-24"
    )
    assert audit_part_identity(
        name="Flow Sensor", manufacturer="TI", part_number="ADS1114"
    )
    # plant pump may pin a pump MPN
    assert not audit_part_identity(
        name="Process Circulation Pump", manufacturer="Grundfos", part_number="CRN5"
    )


def test_pack_path_forbidden() -> None:
    assert is_forbidden_pack_path("em-honesty/x.png")
    assert not is_forbidden_pack_path(f"{ELECTROMAGNETICS_DIR}/x.png")


def test_ghost_majority_shared() -> None:
    assert connection_ghost_majority(36, 1)
    assert not connection_ghost_majority(7, 7)
    kept, n = prune_instrument_ghost_connections(
        [{"name": "Compute UI Module", "tag": "X1"}, {"name": "Vessel", "tag": "X2"}],
        [
            {"from_part": "Ghost", "to_part": "Other", "kind": "power"},
            {"from_part": "Compute UI Module", "to_part": "Vessel", "kind": "signal"},
        ],
    )
    assert n >= 1
    assert any(c["from_part"] == "Compute UI Module" for c in kept)


if __name__ == "__main__":
    test_plant_keeps_sale_price()
    test_instrument_quarantines_plant_keeps_product()
    test_em_instrument_vs_motor()
    test_nonphysical_edges_instrument_only()
    test_catalogue_noun_rules_not_class_table()
    test_pack_path_forbidden()
    test_ghost_majority_shared()
    print("test_anvil_universality_invariants OK")
