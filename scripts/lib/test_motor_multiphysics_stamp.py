"""Regression tests for motor-stack CAD authority and blocker honesty."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.lib.motor_multiphysics_stamp import (
    BLOCKER_ID_POST_DIFF_FINAL_DRIVE,
    build_cad_authority,
    build_stamp_payload,
    collect_architecture_blockers,
    render_markdown,
    write_sidecar,
)


class HardwareCorrelationBenchPrepTests(unittest.TestCase):
    """Prove software preparation stays distinct from physical correlation."""

    def test_existing_dyno_and_flow_models_make_bench_prep_ready_not_passed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fpk-bench-prep-") as tmp:
            twin = Path(tmp)
            stack = twin / "_motor_stack"
            stack.mkdir()
            for name in (
                "em_fia_front_kit_case.json",
                "em_fia_mtpa_screen.json",
                "em_fia_voltage_fw_screen.json",
                "openfoam_fia_cold_plate_case.json",
                "openfoam_fia_water_jacket_case.json",
            ):
                (stack / name).write_text("{}\n", encoding="utf-8")

            payload = build_stamp_payload(twin_dir=twin)
            hardware = payload["hardwareCorrelation"]
            holds = {row["hold_id"]: row for row in hardware["holds"]}

            self.assertTrue(all(row["status"] == "OPEN" for row in holds.values()))
            self.assertTrue(all(row["ship_ok"] is False for row in holds.values()))
            self.assertFalse(hardware["ship_ok"])
            self.assertFalse(payload["ship_ok"])
            self.assertEqual(
                holds["DYNO_TORQUE_EFFICIENCY_MAP"]["software_prep_status"],
                "READY_FOR_BENCH",
            )
            self.assertEqual(
                holds["FLOW_BENCH_JACKET_AND_COLD_PLATE"]["software_prep_status"],
                "READY_FOR_BENCH",
            )
            self.assertEqual(
                holds["HIL_POPULATED_INVERTER"]["software_prep_status"],
                "NOT_READY",
            )
            for hold in holds.values():
                self.assertTrue(hold["predicted_model_refs"])
                self.assertTrue(
                    all(
                        ref.startswith("_motor_stack/")
                        for ref in hold["predicted_model_refs"]
                    )
                )
                self.assertTrue(hold["measurement_recipe"])
                self.assertTrue(hold["acceptance_band"])

            markdown = render_markdown(payload)
            self.assertIn("Software-only bench preparation", markdown)
            self.assertIn("PASS needs physical data", markdown)
            self.assertIn("READY_FOR_BENCH", markdown)

            write_sidecar(twin, payload)
            prep_path = stack / "hardware_correlation_bench_prep.json"
            self.assertTrue(prep_path.is_file())
            prep = json.loads(prep_path.read_text(encoding="utf-8"))
            self.assertEqual(prep["status"], "OPEN")
            self.assertFalse(prep["ship_ok"])
            self.assertTrue(
                all(row["status"] == "OPEN" for row in prep["holds"])
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
                                "closure_gate": {
                                    "blender_interface_status": "PARTIAL",
                                    "blender_meshes_defined": True,
                                    "blocker_may_clear": False,
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
        self.assertEqual(blocker["blender_interface_status"], "PARTIAL")
        self.assertTrue(blocker["blender_meshes_defined"])
        self.assertFalse(blocker["closure_eligible"])
        self.assertIn("Blender placer syncs", blocker["summary"])


class CadAuthorityParametricFamilyTests(unittest.TestCase):
    """Prove new front-drive principals list parametric families without release authority."""

    def test_cad_authority_lists_nine_parametric_families_with_zero_release_coverage(
        self,
    ) -> None:
        cad = build_cad_authority(stamped_at="2026-07-30T00:00:00Z")

        self.assertEqual(cad["parametric_family_count"], 9)
        self.assertEqual(cad["release_authority_coverage"], 0.0)
        self.assertFalse(cad["ship_ok"])

    def test_new_principal_families_register_without_release_authority(self) -> None:
        cad = build_cad_authority(stamped_at="2026-07-30T00:00:00Z")
        by_id = {row["component_id"]: row for row in cad["components"]}

        expected = {
            "traction_drive_housing": "integrated_drive_case_shell",
            "laminated_dc_bus": "laminated_dc_bus_stack",
            "vehicle_interface_connectors": "vehicle_interface_port_cluster",
        }
        for component_id, cad_family in expected.items():
            component = by_id[component_id]
            self.assertEqual(component["authority_level"], "parametric_family")
            self.assertEqual(component["source_type"], "cadquery_family")
            self.assertEqual(component["cad_family"], cad_family)
            self.assertFalse(component["release_authority"])


if __name__ == "__main__":
    unittest.main()
