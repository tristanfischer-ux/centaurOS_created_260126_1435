#!/usr/bin/env python3
"""Regression tests for the universal Excel-bound Blender view contract."""

import unittest

from render_view_contract import (
    perspective_distance_for_extent,
    presentation_bevel_width_m,
    required_views,
    resolve_design_envelope_mm,
)


def _quantity(value):
    return {"value": value, "unit": "mm", "source": "brief"}


class RenderViewContractTest(unittest.TestCase):
    def test_contract_envelope_wins_over_brief_and_volume(self):
        state = {
            "orchestratorContract": {"quantities": {
                "design_envelope_width_mm": _quantity(609),
                "design_envelope_depth_mm": _quantity(193),
                "design_envelope_height_mm": _quantity(1105),
                "enclosure_volume_m3": {"value": 0.14},
            }},
            "parsedBrief": {"constraints": {
                "max_dimensions_mm": {"w": 500, "d": 500, "h": 500},
            }},
        }
        self.assertEqual(resolve_design_envelope_mm(state), (609.0, 193.0, 1105.0))

    def test_brief_envelope_is_safe_fallback(self):
        state = {
            "orchestratorContract": {"quantities": {
                "enclosure_volume_m3": {"value": 0.14},
            }},
            "parsedBrief": {"constraints": {
                "max_dimensions_mm": {"w": 609, "d": 193, "h": 1105},
            }},
        }
        self.assertEqual(resolve_design_envelope_mm(state), (609.0, 193.0, 1105.0))

    def test_wall_product_excludes_plant_plan_and_underground_side(self):
        state = {
            "orchestratorContract": {"quantities": {
                "design_envelope_width_mm": _quantity(609),
                "design_envelope_depth_mm": _quantity(193),
                "design_envelope_height_mm": _quantity(1105),
                "enclosure_volume_m3": {"value": 0.14},
            }},
        }
        views = required_views(state)
        ids = [view.view_id for view in views]
        self.assertEqual(
            ids,
            ["product_exterior", "product_cutaway", "product_left",
             "product_right", "product_service"],
        )
        self.assertNotIn("plant_plan", ids)
        self.assertNotIn("underground_side", ids)

    def test_plant_keeps_plan_and_side_views(self):
        state = {
            "orchestratorContract": {"quantities": {
                "enclosure_volume_m3": {"value": 80.0},
            }},
        }
        ids = [view.view_id for view in required_views(state)]
        self.assertEqual(ids[:3], ["plant_hero", "plant_plan", "plant_side"])

    def test_perspective_distance_fits_tall_product_with_margin(self):
        distance = perspective_distance_for_extent(
            extent=1.105,
            focal_mm=62,
            sensor_mm=24,
            frame_fraction=0.75,
        )
        self.assertGreater(distance, 3.0)
        self.assertLess(distance, 5.0)

    def test_presentation_bevel_scales_but_stays_bounded(self):
        self.assertAlmostEqual(
            presentation_bevel_width_m((0.609, 0.193, 1.105)),
            0.002,
        )
        self.assertAlmostEqual(
            presentation_bevel_width_m((0.010, 0.010, 0.020)),
            0.0002,
        )
        self.assertAlmostEqual(
            presentation_bevel_width_m((2.0, 4.0, 8.0)),
            0.006,
        )


if __name__ == "__main__":
    unittest.main()
