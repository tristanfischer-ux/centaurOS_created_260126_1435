#!/usr/bin/env python3
"""Unit contract for the FIA-bound hybrid torque-map screen."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("em_fia_torque_map_screen.py")
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("em_fia_torque_map_screen", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load module spec for {MODULE_PATH}")
SCREEN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SCREEN
SPEC.loader.exec_module(SCREEN)


class FiaTorqueMapScreenContractTest(unittest.TestCase):
    """Protect hybrid density and release-honesty invariants."""

    def test_selftest_prove_catch_passes(self) -> None:
        self.assertEqual(SCREEN.run_selftest(), 0)

    def test_current_scaling_is_linear(self) -> None:
        self.assertAlmostEqual(
            SCREEN._scale_torque_with_current(-100.0, 0.5),
            -50.0,
        )

    def test_fw_curve_point_count(self) -> None:
        self.assertEqual(len(SCREEN.FW_SPEED_FRACTIONS), 11)
        self.assertEqual(len(SCREEN.CURRENT_MAGNITUDE_FRACTIONS), 6)

    def test_angle_interpolation_adds_midpoints(self) -> None:
        femm = [
            {
                "current_angle_electrical_deg": -50.0,
                "rotor_position_mechanical_deg": 0.0,
                "torque_nm": -100.0,
                "peak_airgap_flux_density_t": 1.2,
            },
            {
                "current_angle_electrical_deg": -40.0,
                "rotor_position_mechanical_deg": 0.0,
                "torque_nm": -120.0,
                "peak_airgap_flux_density_t": 1.3,
            },
        ]
        interpolated = SCREEN.interpolate_angle_grid(femm)
        self.assertEqual(len(interpolated), 1)
        self.assertAlmostEqual(
            interpolated[0]["current_angle_electrical_deg"],
            -45.0,
        )
        self.assertAlmostEqual(interpolated[0]["torque_nm"], -110.0)


if __name__ == "__main__":
    unittest.main()
