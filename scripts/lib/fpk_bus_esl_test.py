#!/usr/bin/env python3
"""Regression tests for analytical front-FPK bus ESL and cold-plate models."""
from __future__ import annotations

import unittest

from fpk_bus_esl import (
    build_fpk_esl_thermal,
    evaluate_cfd_open_gate,
    render_esl_thermal_markdown,
)
from fpk_physics_tree import build_fpk_physics_tree, flatten_tree


SEED_QUANTITIES = {
    "front_bay_envelope_w_mm": 343.0,
    "front_bay_envelope_d_mm": 259.0,
    "front_bay_envelope_h_mm": 267.0,
    "rotor_airgap_diameter_mm": 121.98,
    "stack_length_mm": 97.58,
    "gear_ratio": 8.0,
    "mgu_shaft_torque_nm": 119.7,
    "phase_current_design_a": 535.0,
    "dc_bus_voltage_v": 750.0,
    "continuous_power_kw": 250.0,
    "switching_freq_hz": 20_000.0,
    "inverter_dissipated_kw": 4.3,
    "coolant_flow_l_min": 12.0,
    "coolant_inlet_c": 60.0,
}


class FpkBusEslThermalTest(unittest.TestCase):
    def test_bus_esl_carries_geometry_methods_and_honest_uncertainty(self) -> None:
        bus, _ = build_fpk_esl_thermal(SEED_QUANTITIES)

        self.assertEqual(bus["provenance"], "ANALYTICAL_FROM_ASSUMED_GEOMETRY")
        self.assertFalse(bus["measured"])
        self.assertEqual(bus["material"]["grade"], "Cu-ETP")
        self.assertGreater(bus["conductor_geometry_mm"]["length"], 0.0)
        self.assertGreater(bus["return_geometry_mm"]["width"], 0.0)
        self.assertGreater(bus["edge_rate_assumption"]["equivalent_frequency_hz"], 1.0e6)
        self.assertIn("skin", bus["skin_proximity_note"].lower())
        self.assertIn("proximity", bus["skin_proximity_note"].lower())
        self.assertGreater(bus["joint_terminal_inductance_nh"]["total"], 0.0)
        self.assertIn("partial", bus["extraction_method"]["primary"].lower())
        self.assertIn("transmission-line", bus["extraction_method"]["hand_check"].lower())
        self.assertLess(bus["esl_nh_range"][0], bus["esl_nh_nominal"])
        self.assertGreater(bus["esl_nh_range"][1], bus["esl_nh_nominal"])

    def test_cold_plate_network_is_loss_seeded_and_keeps_cfd_open(self) -> None:
        _, thermal = build_fpk_esl_thermal(SEED_QUANTITIES)

        self.assertEqual(thermal["provenance"], "ANALYTICAL_FROM_ASSUMED_GEOMETRY")
        self.assertEqual(thermal["validation_status"], "ANALYTICAL_ONLY")
        self.assertAlmostEqual(thermal["heat_load_w"], 4300.0)
        self.assertGreaterEqual(thermal["channel_hydraulics"]["channel_count"], 4)
        self.assertGreater(thermal["channel_hydraulics"]["pressure_drop_pa"], 0.0)
        self.assertGreater(thermal["thermal_network"]["tim_rth_k_per_w"], 0.0)
        self.assertGreater(
            thermal["temperature_rise_k"]["source_interface_to_inlet"],
            0.0,
        )
        self.assertEqual({port["role"] for port in thermal["ports"]}, {"inlet", "outlet"})
        self.assertIn("CFD_cold_plate", thermal["open_until"])

    def test_prove_catch_cfd_open_refuses_ship_ok(self) -> None:
        gate = evaluate_cfd_open_gate(("CFD_cold_plate",), requested_ship_ok=True)

        self.assertTrue(gate["proveCatch_fired"])
        self.assertFalse(gate["ship_ok"])
        self.assertIn("CFD_cold_plate", gate["blocking_open"])

    def test_recursive_tree_consumes_canonical_p4_models(self) -> None:
        tree = build_fpk_physics_tree(SEED_QUANTITIES)
        nodes = {node.id: node for node in flatten_tree(tree)}
        bus = nodes["hv_dc_busbar_link"].physics
        cold_plate = nodes["mcu_cold_plate"].physics

        self.assertEqual(bus["provenance"], "ANALYTICAL_FROM_ASSUMED_GEOMETRY")
        self.assertGreater(bus["esl_nh_nominal"], 0.0)
        self.assertIn("esl_nh_range", bus)
        self.assertIn("joint_terminal_inductance_nh", bus)
        self.assertEqual(cold_plate["validation_status"], "ANALYTICAL_ONLY")
        self.assertIn("thermal_network", cold_plate)
        self.assertIn("temperature_rise_k", cold_plate)
        self.assertIn("CFD_cold_plate", nodes["mcu_cold_plate"].open_until)

    def test_twin_markdown_discloses_analytical_status_and_open_gate(self) -> None:
        bus, thermal = build_fpk_esl_thermal(SEED_QUANTITIES)
        gate = evaluate_cfd_open_gate(
            thermal["open_until"],
            requested_ship_ok=True,
        )
        report = render_esl_thermal_markdown(bus, thermal, gate)

        self.assertIn("ANALYTICAL_FROM_ASSUMED_GEOMETRY", report)
        self.assertIn("NEVER measured", report)
        self.assertIn("CFD_cold_plate", report)
        self.assertIn("ship_ok=false", report)
        self.assertIn("Second hand check", report)


if __name__ == "__main__":
    unittest.main()
