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
        self.assertEqual(len(SCREEN.FW_SPEED_FRACTIONS), 7)
        self.assertEqual(len(SCREEN.CURRENT_MAGNITUDE_FRACTIONS), 3)


if __name__ == "__main__":
    unittest.main()
