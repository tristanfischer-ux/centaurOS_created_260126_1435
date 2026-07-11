#!/usr/bin/env python3
"""Geometry guards for CAD families used by high-quality product renders."""

import importlib.util
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_tier2():
    path = REPO_ROOT / "Tier 1 and 2 parts for cad " / "tier2_electromechanical.py"
    spec = importlib.util.spec_from_file_location("tier2_geometry_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CadFamilyGeometryTest(unittest.TestCase):
    def test_lfp_cell_is_registered_and_has_terminals_in_bbox(self):
        module = _load_tier2()
        self.assertIn("lfp_prismatic_cell", module.TIER2_REGISTRY)
        shape = module.lfp_prismatic_cell({
            "width": 148.0,
            "depth": 27.0,
            "height": 102.0,
            "terminal_d": 12.0,
            "terminal_h": 6.0,
        })
        bbox = shape.val().BoundingBox()
        self.assertAlmostEqual(bbox.xlen, 148.0, delta=0.2)
        self.assertAlmostEqual(bbox.ylen, 27.0, delta=0.2)
        self.assertGreater(bbox.zlen, 108.0)


if __name__ == "__main__":
    unittest.main()
