"""Regression tests for educational motor/drivetrain CadQuery families."""

from __future__ import annotations

import importlib.util
import math
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("tier2_motor_drivetrain.py")
SPEC = importlib.util.spec_from_file_location("tier2_motor_drivetrain", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load CAD family module: {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class IpmsmStatorLaminationTests(unittest.TestCase):
    """Prove the first training family is parametric and physically slotted."""

    def test_default_lamination_has_expected_envelope_and_removed_slots(self) -> None:
        model = MODULE.ipmsm_stator_lamination({})
        bbox = model.val().BoundingBox()

        self.assertAlmostEqual(bbox.xlen, 269.24, places=1)
        self.assertAlmostEqual(bbox.ylen, 269.24, places=1)
        self.assertAlmostEqual(bbox.zlen, 0.5, places=2)
        self.assertEqual(model.solids().size(), 1)

        unslotted_volume = (
            math.pi
            * ((269.24 / 2.0) ** 2 - (161.9 / 2.0) ** 2)
            * 0.5
        )
        self.assertLess(model.val().Volume(), unslotted_volume * 0.93)

    def test_invalid_slot_depth_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "slot_depth"):
            MODULE.ipmsm_stator_lamination(
                {
                    "outer_diameter": 100.0,
                    "bore_diameter": 80.0,
                    "slot_depth": 12.0,
                }
            )


if __name__ == "__main__":
    unittest.main()
