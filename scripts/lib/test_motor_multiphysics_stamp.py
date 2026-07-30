"""Regression tests for motor-stack CAD authority and blocker honesty."""

from __future__ import annotations

import unittest

from scripts.lib.motor_multiphysics_stamp import (
    BLOCKER_ID_POST_DIFF_FINAL_DRIVE,
    build_cad_authority,
    collect_architecture_blockers,
)


class PostDiffFinalDriveBlockerTests(unittest.TestCase):
    """Prove software CAD progress cannot greenwash the release blocker."""

    def test_cad_authority_registers_post_diff_parametric_family(self) -> None:
        cad = build_cad_authority(stamped_at="2026-07-30T00:00:00Z")
        component = next(
            row
            for row in cad["components"]
            if row["component_id"] == "post_diff_final_drive"
        )

        self.assertEqual(component["authority_level"], "parametric_family")
        self.assertEqual(component["cad_family"], "post_diff_final_drive_helical")
        self.assertFalse(component["release_authority"])
        self.assertFalse(cad["ship_ok"])

    def test_bay_fit_plus_registered_family_records_seed_but_stays_open(self) -> None:
        motor = {
            "required_checks": {
                "gear_strength": {
                    "twin_bound_case": {
                        "bevel_differential_screen": {
                            "path": "_motor_stack/iso_bevel_fia_front_kit_case.json",
                            "minimum_strength_factor": 1.2172,
                            "residual_blocker": {
                                "blocker_id": BLOCKER_ID_POST_DIFF_FINAL_DRIVE,
                                "status": "OPEN",
                                "ratio_after_diff": 4.0,
                            },
                            "post_diff_final_drive_packaging_screen": {
                                "status": "PARTIAL",
                                "path": (
                                    "_motor_stack/"
                                    "post_diff_final_drive_packaging_screen.json"
                                ),
                                "bay_fit": True,
                                "envelope_mm": {
                                    "width_lateral": 192.0,
                                    "depth_short_edge": 172.2782,
                                    "height": 132.0,
                                },
                                # The older screen predates this source registration.
                                "parametric_family_exists": False,
                                "cad_family": None,
                            },
                        }
                    }
                }
            }
        }

        blockers = collect_architecture_blockers(motor)
        blocker = next(
            row
            for row in blockers
            if row["blocker_id"] == BLOCKER_ID_POST_DIFF_FINAL_DRIVE
        )

        self.assertEqual(blocker["status"], "OPEN")
        self.assertFalse(blocker["ship_ok"])
        self.assertTrue(blocker["cannot_greenwash"])
        self.assertTrue(blocker["software_packaging_screen_ok"])
        self.assertTrue(blocker["parametric_family_exists"])
        self.assertEqual(blocker["cad_family"], "post_diff_final_drive_helical")
        self.assertEqual(blocker["software_progress_status"], "SOFTWARE_SEEDED")
        self.assertFalse(blocker["closure_eligible"])
        self.assertIn("Blender/interface still OPEN", blocker["summary"])


if __name__ == "__main__":
    unittest.main()
