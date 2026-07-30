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


class IpmsmRotorMagnetCarrierTests(unittest.TestCase):
    """Prove the V-pocket rotor matches IPMSM_B dims and keeps iron webs."""

    def test_default_carrier_has_expected_envelope_and_pockets(self) -> None:
        model = MODULE.ipmsm_rotor_magnet_carrier({})
        bbox = model.val().BoundingBox()

        self.assertAlmostEqual(bbox.xlen, 160.40, places=1)
        self.assertAlmostEqual(bbox.ylen, 160.40, places=1)
        self.assertAlmostEqual(bbox.zlen, 0.5, places=2)
        self.assertEqual(model.solids().size(), 1)

        annulus_volume = (
            math.pi
            * ((160.40 / 2.0) ** 2 - (110.64 / 2.0) ** 2)
            * 0.5
        )
        volume = model.val().Volume()
        self.assertLess(volume, annulus_volume * 0.95)
        self.assertGreater(volume, annulus_volume * 0.70)

    def test_pockets_preserve_bridge_and_shaft_web(self) -> None:
        polygons = MODULE._hole_m53_pocket_polygons(
            outer_radius=80.20,
            slot_depth=18.00,
            bridge_thickness=1.50,
            magnet_pocket_width=17.00,
            magnet_pocket_depth=6.50,
            magnet_recess=1.00,
            v_angle_rad=MODULE._IPMSM_B_V_ANGLE_RAD,
            tip_width=0.0,
            magnet_to_tip=0.0,
        )
        innermost = min(math.hypot(x, y) for poly in polygons for x, y in poly)
        self.assertGreater(innermost, 110.64 / 2.0)
        # Z1 / Z11 sit on the outer bridge circle (Rext - H1).
        bridge_radius = 80.20 - 1.50
        for poly in (polygons[3], polygons[4]):
            self.assertAlmostEqual(math.hypot(*poly[0]), bridge_radius, places=1)
            self.assertAlmostEqual(math.hypot(*poly[-1]), bridge_radius, places=1)
        outermost = max(math.hypot(x, y) for poly in polygons for x, y in poly)
        self.assertLessEqual(outermost, bridge_radius + 0.05)

    def test_invalid_slot_depth_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "slot_depth"):
            MODULE.ipmsm_rotor_magnet_carrier(
                {
                    "outer_diameter": 100.0,
                    "shaft_diameter": 80.0,
                    "bridge_thickness": 1.0,
                    "slot_depth": 20.0,
                }
            )


class PlanetaryGearsetTests(unittest.TestCase):
    """Prove planetary tooth rules and default rebuild."""

    def test_default_gearset_builds_multiple_solids(self) -> None:
        try:
            model = MODULE.planetary_gearset({})
        except ImportError as exc:
            raise unittest.SkipTest(str(exc)) from exc

        bbox = model.val().BoundingBox()
        self.assertGreaterEqual(model.solids().size(), 4)
        self.assertGreater(bbox.xlen, 40.0)
        self.assertGreater(bbox.ylen, 40.0)
        self.assertAlmostEqual(bbox.zlen, 10.0, places=0)

    def test_incompatible_tooth_counts_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "divisible by planet_count"):
            MODULE.planetary_gearset(
                {
                    "sun_teeth": 13,
                    "planet_teeth": 18,
                    "planet_count": 3,
                }
            )


if __name__ == "__main__":
    unittest.main()
