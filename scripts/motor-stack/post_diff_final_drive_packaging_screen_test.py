#!/usr/bin/env python3
"""Regression tests for the post-differential final-drive packaging screen."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("post_diff_final_drive_packaging_screen.py")
SPEC = importlib.util.spec_from_file_location(
    "post_diff_final_drive_packaging_screen",
    SCRIPT_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import packaging screen: {SCRIPT_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PostDiffFinalDrivePackagingScreenTest(unittest.TestCase):
    """Exercise nominal fit and fail-closed packaging behavior."""

    def test_nominal_twin_envelope_fits_but_never_releases(self) -> None:
        inputs = MODULE.TwinInputs(
            bay_width_mm=343.0,
            bay_depth_mm=259.0,
            bay_height_mm=267.0,
            diff_od_mm=120.0,
            diff_len_mm=108.0,
            ratio_after_diff=4.0,
        )

        screen = MODULE.estimate_packaging(inputs)
        artifact = MODULE.build_artifact(
            inputs=inputs,
            screen=screen,
            source_twin="synthetic",
            source_state_sha256="state-sha",
            source_bevel_sha256="bevel-sha",
        )

        self.assertTrue(screen.bay_fit)
        self.assertLess(screen.overall_depth_mm, 259.0)
        self.assertAlmostEqual(screen.ratio_from_teeth, 4.0)
        self.assertEqual(artifact["status"], "PARTIAL")
        self.assertFalse(artifact["ship_ok"])
        self.assertEqual(artifact["architecture_blocker"]["status"], "OPEN")
        self.assertFalse(artifact["closure_gate"]["parametric_family_exists"])
        self.assertFalse(artifact["closure_gate"]["blocker_may_clear"])

    def test_short_edge_overrun_keeps_open_blocker_with_evidence(self) -> None:
        inputs = MODULE.TwinInputs(
            bay_width_mm=343.0,
            bay_depth_mm=160.0,
            bay_height_mm=267.0,
            diff_od_mm=120.0,
            diff_len_mm=108.0,
            ratio_after_diff=4.0,
        )

        screen = MODULE.estimate_packaging(inputs)
        artifact = MODULE.build_artifact(
            inputs=inputs,
            screen=screen,
            source_twin="synthetic",
            source_state_sha256="state-sha",
            source_bevel_sha256="bevel-sha",
        )

        self.assertFalse(screen.bay_fit)
        self.assertLess(screen.short_edge_margin_mm, 0.0)
        self.assertFalse(artifact["bay_fit"])
        self.assertIn("does not fit", artifact["architecture_blocker"]["summary"])
        self.assertFalse(artifact["ship_ok"])


if __name__ == "__main__":
    unittest.main()
