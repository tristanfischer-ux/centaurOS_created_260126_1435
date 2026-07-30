#!/usr/bin/env python3
"""Unit contract for the FIA-bound voltage / field-weakening screen."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("em_fia_voltage_fw_screen.py")
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("em_fia_voltage_fw_screen", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load module spec for {MODULE_PATH}")
SCREEN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SCREEN
SPEC.loader.exec_module(SCREEN)


class FiaVoltageFwScreenContractTest(unittest.TestCase):
    """Protect twin voltage binding and permanent release-honesty invariants."""

    def setUp(self) -> None:
        quantities = {
            "continuous_power_kw": 250.0,
            "front_regen_electrical_cap_kw": 250.0,
            "dc_bus_voltage_v": 750.0,
            "dc_bus_min_voltage_v": 600.0,
            "dc_bus_max_voltage_v": 900.0,
            "max_rotor_speed_rpm": 19_500.0,
            "front_bay_envelope_w_mm": 343.0,
            "front_bay_envelope_d_mm": 259.0,
            "front_bay_envelope_h_mm": 267.0,
            "fpk_mass_cap_kg": 32.0,
            "stack_length_mm": 97.58,
            "turns_per_coil": 4.0,
            "turns_per_phase": 14.0,
            "winding_parallel_paths": 2.0,
            "stator_slots": 24.0,
            "phase_current_design_a": 535.0,
        }
        concentric = {
            "housing_od_mm": 176.7,
            "housing_len_mm": 140.5,
            "stator_od_mm": 164.7,
            "stator_id_mm": 123.4,
            "rotor_od_mm": 122.0,
            "rotor_id_mm": 92.7,
            "airgap_mm": 0.7,
            "stack_len_mm": 97.58,
        }
        self.inputs = SCREEN.inputs_from_sections(quantities, concentric)
        self.geometry = SCREEN.derive_fia_geometry(self.inputs)

    def test_screen_uses_twin_bus_window_and_max_speed(self) -> None:
        result = SCREEN.run_voltage_screen(
            self.inputs,
            self.geometry,
            open_circuit_rms_airgap_flux_density_t=0.2041942345,
        )

        self.assertEqual(
            [row["dc_bus_voltage_v"] for row in result.max_speed_bus_cases],
            [600.0, 750.0, 900.0],
        )
        self.assertEqual(result.max_speed_rpm, 19_500.0)
        self.assertAlmostEqual(
            result.max_speed_bus_cases[0]["available_line_line_rms_voltage_v"],
            600.0 * (3.0**0.5) / (2.0 * (2.0**0.5)),
            places=6,
        )
        self.assertEqual(result.speed_points[-1]["speed_rpm"], 19_500.0)
        self.assertGreater(result.estimated_back_emf_line_line_rms_v_at_max_speed, 0.0)

    def test_absurd_open_circuit_flux_proves_field_weakening_catch(self) -> None:
        nominal = SCREEN.run_voltage_screen(
            self.inputs,
            self.geometry,
            open_circuit_rms_airgap_flux_density_t=0.2041942345,
        )
        absurd_flux = SCREEN.run_voltage_screen(
            self.inputs,
            self.geometry,
            open_circuit_rms_airgap_flux_density_t=2.5,
        )

        self.assertFalse(nominal.field_weakening_indicated_at_max_speed)
        self.assertTrue(absurd_flux.field_weakening_indicated_at_max_speed)
        self.assertGreater(
            absurd_flux.worst_case_voltage_utilisation,
            nominal.worst_case_voltage_utilisation,
        )

    def test_artifact_stays_partial_and_keeps_torque_map_open(self) -> None:
        result = SCREEN.run_voltage_screen(
            self.inputs,
            self.geometry,
            open_circuit_rms_airgap_flux_density_t=0.2041942345,
        )
        artifact = SCREEN.build_artifact(
            inputs=self.inputs,
            geometry=self.geometry,
            result=result,
            source_state_sha256="synthetic-state",
            source_twin="synthetic-twin",
            em_case_path="synthetic-em-case.json",
            em_case_input_quantities_sha256="synthetic-inputs",
        )

        self.assertEqual(artifact["status"], "PARTIAL")
        self.assertFalse(artifact["ship_ok"])
        self.assertEqual(artifact["voltage_fw_screen"]["status"], "PARTIAL")
        self.assertEqual(artifact["torque_map"]["status"], "OPEN")
        self.assertEqual(artifact["field_weakening_map"]["status"], "OPEN")
        self.assertFalse(artifact["coverage"]["closed_torque_map"])
        self.assertFalse(artifact["coverage"]["closed_field_weakening_map"])


if __name__ == "__main__":
    unittest.main()
