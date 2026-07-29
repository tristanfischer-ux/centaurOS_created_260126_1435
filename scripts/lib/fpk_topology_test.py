#!/usr/bin/env python3
"""Regression tests for the front-FPK topology freeze contract."""
from __future__ import annotations

import copy
import unittest

from fpk_topology import (
    REQUIRED_EDGE_IDS,
    build_fpk_topology,
    evaluate_topology,
    prove_catch,
)


class FpkTopologyTest(unittest.TestCase):
    def setUp(self) -> None:
        routed_node_ids = (
            "sic_half_bridge_1",
            "sic_half_bridge_2",
            "sic_half_bridge_3",
            "ac_bus_u",
            "ac_bus_v",
            "ac_bus_w",
            "phase_coil_u",
            "phase_coil_v",
            "phase_coil_w",
            "mcu_cold_plate",
            "motor_cooling_jacket",
            "resolver",
            "resolver_excitation_demod",
            "oem_inverter_control_board",
        )
        self.state = {
            "orchestratorContract": {
                "quantities": {
                    "front_bay_envelope_w_mm": {"value": 343},
                    "front_bay_envelope_d_mm": {"value": 259},
                    "front_bay_envelope_h_mm": {"value": 267},
                    "rotor_airgap_diameter_mm": {"value": 121.98},
                    "stack_length_mm": {"value": 97.58},
                    "gear_ratio": {"value": 8.0},
                    "mgu_shaft_torque_nm": {"value": 119.7},
                    "phase_current_design_a": {"value": 535},
                }
            },
            "fpkPhysicsTree": {
                "part_index": [{"id": node_id} for node_id in routed_node_ids],
            },
        }

    def test_builds_every_required_bay_relative_edge(self) -> None:
        topology = build_fpk_topology(self.state)

        self.assertEqual(topology["required_count"], len(REQUIRED_EDGE_IDS))
        self.assertEqual(topology["required_count"], 17)
        self.assertEqual(topology["routed_count"], 7)
        self.assertEqual(
            {edge["id"] for edge in topology["edges"]},
            set(REQUIRED_EDGE_IDS),
        )
        self.assertTrue(all(edge["route"]["frame"] == "front_fpk_bay" for edge in topology["edges"]))
        self.assertTrue(all("xyz_mm" not in str(edge).lower() for edge in topology["edges"]))
        self.assertTrue(all("bay_relative" in edge["route"] for edge in topology["edges"]))
        self.assertEqual(topology["race_hold"]["status"], "OPEN")
        self.assertFalse(topology["claims"]["fia_port_xyz"])
        self.assertEqual(len(topology["rev_hash"]), 64)

    def test_external_interfaces_stay_open_without_fia_coordinates(self) -> None:
        topology = build_fpk_topology(self.state)
        by_id = {edge["id"]: edge for edge in topology["edges"]}

        for edge_id in (
            "HV_DC_POS",
            "HV_DC_NEG",
            "COOLANT_IN",
            "COOLANT_OUT",
            "LV_POWER",
            "CAN_FD",
        ):
            self.assertFalse(by_id[edge_id]["routed"])
            self.assertEqual(
                by_id[edge_id]["route"]["status"],
                "OPEN_INTERFACE_ICD",
            )
            self.assertEqual(
                by_id[edge_id]["route"]["bay_relative"]["external_endpoint"],
                None,
            )

    def test_revision_hash_is_deterministic(self) -> None:
        first = build_fpk_topology(self.state)
        second = build_fpk_topology(copy.deepcopy(self.state))

        self.assertEqual(first["rev_hash"], second["rev_hash"])

    def test_missing_hv_dc_minus_fires(self) -> None:
        topology = build_fpk_topology(self.state)
        edges = [edge for edge in topology["edges"] if edge["id"] != "HV_DC_NEG"]

        verdict = evaluate_topology(edges)

        self.assertFalse(verdict["ok"])
        self.assertIn("HV_DC_NEG", verdict["missing_required_edges"])

    def test_missing_coolant_in_fires(self) -> None:
        topology = build_fpk_topology(self.state)
        edges = copy.deepcopy(topology["edges"])
        edges = [edge for edge in edges if edge["id"] != "COOLANT_IN"]

        verdict = evaluate_topology(edges)

        self.assertFalse(verdict["ok"])
        self.assertIn("COOLANT_IN", verdict["missing_required_edges"])

    def test_prove_catch_demonstrates_both_failures(self) -> None:
        result = prove_catch()

        self.assertTrue(result["ok"])
        self.assertTrue(result["missing_hv_dc_neg"]["fired"])
        self.assertTrue(result["missing_coolant_in"]["fired"])


if __name__ == "__main__":
    unittest.main()
