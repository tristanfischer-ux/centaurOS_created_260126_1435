"""Contract tests for the isolated PCB firmware-proof draft."""

from __future__ import annotations

import copy
import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "firmware_proof.py"


def load_draft_module():
    if not MODULE_PATH.exists():
        return None
    spec = importlib.util.spec_from_file_location("firmware_proof", MODULE_PATH)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def good_spec() -> dict:
    return {
        "schema": "pcb-firmware-proof-spec/v1",
        "proof_target_id": "four_axis_motion_controller",
        "kind": "custom_board",
        "design_fitness_ok": True,
        "mcu": {
            "mpn": "ATmega328P-AU",
            "toolchain": "native-draft",
            "pin_contract_complete": True,
        },
        "buses": [
            {
                "bus_id": "i2c0",
                "protocol": "i2c",
                "pins": {"sda": "SDA", "scl": "SCL"},
                "expected_devices": [
                    {"address": 0x48, "mpn": "TMP117", "word_id": "temperature_sensor"},
                ],
            }
        ],
        "components": [
            {
                "word_id": "temperature_sensor",
                "refdes": "U2",
                "mpn": "TMP117MAIDRVR",
                "driver_key": "tmp117",
                "identity_check": {
                    "kind": "register",
                    "register": "0x0F",
                    "mask": "0xFFFF",
                    "expected": "0x0117",
                },
            }
        ],
        "channels": [
            {
                "channel_id": "motor_axis",
                "role": "stepper_channel",
                "required_count": 4,
                "instances": [
                    {"instance_id": "axis_0", "enable_net": "M0_EN", "output_net": "M0_STEP"},
                    {"instance_id": "axis_1", "enable_net": "M1_EN", "output_net": "M1_STEP"},
                    {"instance_id": "axis_2", "enable_net": "M2_EN", "output_net": "M2_STEP"},
                    {"instance_id": "axis_3", "enable_net": "M3_EN", "output_net": "M3_STEP"},
                ],
            }
        ],
        "actuators": [
            {
                "actuator_id": "motors",
                "domain": "motion_actuation",
                "instance_ids": ["axis_0", "axis_1", "axis_2", "axis_3"],
                "safe_default": "off",
                "requires_two_step_arm": True,
                "max_duty_percent": 5,
                "max_pulse_ms": 100,
            }
        ],
        "communications": [
            {
                "kind": "uart_banner",
                "expected_banner_prefix": "PROOF|four_axis_motion_controller|",
            }
        ],
    }


class FirmwareProofDraftTest(unittest.TestCase):
    def setUp(self) -> None:
        self.draft = load_draft_module()
        self.assertIsNotNone(
            self.draft,
            "RED: firmware_proof.py draft has not been implemented yet",
        )

    def test_good_spec_validates(self) -> None:
        findings = self.draft.validate_spec(good_spec())
        self.assertEqual([], findings)

    def test_rejects_unfit_pcb_design(self) -> None:
        spec = good_spec()
        spec["design_fitness_ok"] = False
        findings = self.draft.validate_spec(spec)
        self.assertIn("proof_skipped_on_unfit_design", [item["code"] for item in findings])

    def test_rejects_channel_underimplementation(self) -> None:
        spec = good_spec()
        spec["channels"][0]["instances"] = spec["channels"][0]["instances"][:1]
        findings = self.draft.validate_spec(spec)
        self.assertIn("channel_count_mismatch", [item["code"] for item in findings])

    def test_rejects_duplicate_i2c_addresses(self) -> None:
        spec = good_spec()
        spec["buses"][0]["expected_devices"].append(
            {"address": 0x48, "mpn": "ADS1115", "word_id": "adc"}
        )
        findings = self.draft.validate_spec(spec)
        self.assertIn("bus_address_conflict", [item["code"] for item in findings])

    def test_rejects_unsafe_actuator_defaults(self) -> None:
        spec = good_spec()
        spec["actuators"][0]["safe_default"] = "on"
        spec["actuators"][0]["max_duty_percent"] = 75
        findings = self.draft.validate_spec(spec)
        codes = [item["code"] for item in findings]
        self.assertIn("unsafe_actuation_default", codes)
        self.assertIn("unsafe_actuation_limit", codes)

    def test_accepts_fail_safe_cooling_default_on(self) -> None:
        spec = good_spec()
        spec["actuators"][0].update(
            {
                "domain": "safety_cooling",
                "safe_default": "on",
                "safety_policy": "fail_safe_on",
            }
        )
        findings = self.draft.validate_spec(spec)
        self.assertEqual([], findings)

    def test_generated_harness_has_static_count_and_banner(self) -> None:
        generated = self.draft.generate_harness(good_spec())
        self.assertIn("_Static_assert(PROOF_MOTOR_AXIS_IMPLEMENTED >= 4", generated["source"])
        self.assertIn("PROOF|four_axis_motion_controller|", generated["source"])
        self.assertEqual(64, len(generated["spec_hash"]))

    @unittest.skipUnless(shutil.which("cc"), "system C compiler unavailable")
    def test_prove_compiles_runs_and_writes_evidence(self) -> None:
        with tempfile.TemporaryDirectory(prefix="pcb-fw-proof-test-") as tmp:
            result = self.draft.prove_spec(good_spec(), Path(tmp), cc=shutil.which("cc"))
            self.assertTrue(result["ok"], result)
            self.assertTrue(Path(result["artifacts"]["source_path"]).exists())
            self.assertTrue(Path(result["artifacts"]["binary_path"]).exists())
            self.assertTrue(Path(result["artifacts"]["transcript_path"]).exists())
            transcript = Path(result["artifacts"]["transcript_path"]).read_text()
            self.assertIn("CHECK boot_link PASS", transcript)
            self.assertIn("CHECK bus_binding PASS bus=i2c0", transcript)
            self.assertIn("CHECK channel_count PASS role=stepper_channel required=4 implemented=4", transcript)
            self.assertIn("CHECK actuation_safe_default PASS actuator=motors", transcript)

    def test_cots_integration_does_not_require_mcu(self) -> None:
        spec = good_spec()
        spec["kind"] = "cots_host_integration"
        spec["mcu"] = None
        findings = self.draft.validate_spec(spec)
        self.assertEqual([], findings)


if __name__ == "__main__":
    unittest.main()
