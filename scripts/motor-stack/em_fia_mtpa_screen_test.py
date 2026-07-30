#!/usr/bin/env python3
"""Unit contract for the FIA-bound denser MTPA screen."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("em_fia_mtpa_screen.py")
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("em_fia_mtpa_screen", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load module spec for {MODULE_PATH}")
SCREEN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SCREEN
SPEC.loader.exec_module(SCREEN)


class FiaMtpaScreenContractTest(unittest.TestCase):
    """Protect grid-density and release-honesty invariants."""

    def setUp(self) -> None:
        quantities = {
            "continuous_power_kw": 250.0,
            "front_regen_electrical_cap_kw": 250.0,
            "dc_bus_voltage_v": 750.0,
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
        self.duty = SCREEN.analytical_duty_check(self.inputs)

    def test_default_and_fast_grids_are_cartesian_and_denser_than_smoke(self) -> None:
        default = SCREEN.select_grid(fast=False)
        fast = SCREEN.select_grid(fast=True)

        self.assertEqual(len(default.current_angles_electrical_deg), 7)
        self.assertEqual(len(default.rotor_positions_mechanical_deg), 5)
        self.assertEqual(default.n_points, 35)
        self.assertEqual(len(fast.current_angles_electrical_deg), 2)
        self.assertEqual(len(fast.rotor_positions_mechanical_deg), 2)
        self.assertEqual(fast.n_points, 4)
        self.assertGreater(fast.n_points, SCREEN.SMOKE_POINT_COUNT)

    def test_rotor_position_advances_stator_excitation_to_hold_dq_angle(self) -> None:
        self.assertEqual(
            SCREEN.phase_excitation_angle_electrical_deg(-45.0, 0.0),
            -45.0,
        )
        self.assertEqual(
            SCREEN.phase_excitation_angle_electrical_deg(-45.0, 15.0),
            15.0,
        )

    def test_mocked_fast_grid_stays_partial_and_keeps_torque_map_open(self) -> None:
        grid = SCREEN.select_grid(fast=True)

        def fake_solve(assumptions: object) -> object:
            angle = float(assumptions.current_angle_electrical_deg)
            torque = 100.0 - abs(angle + 45.0) * 0.1
            return SCREEN.LoadedMagneticResult(
                peak_airgap_flux_density_t=1.25,
                rms_airgap_flux_density_t=0.72,
                mean_airgap_flux_density_t=0.61,
                minimum_airgap_flux_density_t=0.08,
                torque_nm=-torque,
            )

        points, summary = SCREEN.run_screen_grid(
            self.geometry,
            Path("/mock/femmcli"),
            remanence_t=1.2,
            duty=self.duty,
            inputs=self.inputs,
            grid=grid,
            solve_point=fake_solve,
        )
        artifact = SCREEN.build_artifact(
            inputs=self.inputs,
            geometry=self.geometry,
            duty=self.duty,
            grid=grid,
            points=points,
            summary=summary,
            solver_identity={"name": "mocked unit solver", "version": "test"},
            source_state_sha256="synthetic-selftest",
            source_twin="synthetic-selftest",
            runtime_seconds=0.01,
        )

        self.assertEqual(len(points), 4)
        self.assertEqual(summary["n_points"], 4)
        self.assertGreater(summary["n_points"], SCREEN.SMOKE_POINT_COUNT)
        self.assertEqual(artifact["status"], "PARTIAL")
        self.assertFalse(artifact["ship_ok"])
        self.assertEqual(artifact["mtpa_screen"]["status"], "PARTIAL")
        self.assertEqual(artifact["torque_map"]["status"], "OPEN")
        self.assertFalse(artifact["coverage"]["closed_torque_map"])
        self.assertTrue(artifact["coverage"]["denser_than_smoke"])


if __name__ == "__main__":
    unittest.main()
