"""TDD contract for the isolated OpenDrop gold PCB/software benchmark."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
GOLD_ROOT = ROOT if (ROOT / "out/_gold-opendrop-repo").exists() else Path(
    str(ROOT).removesuffix("-cursor-pcb")
)
MODULE_PATH = ROOT / "prototypes/opendrop-pcb-software-benchmark/benchmark.py"
SCHEMATIC = (
    GOLD_ROOT
    / "out/_gold-opendrop-repo/OpenDropV4/Electronics/OpenDropV4_MainBoard/PCB/OpenDropV4.sch"
)
HEADER = (
    GOLD_ROOT
    / "out/_gold-opendrop-repo/OpenDropV4/Software/Libraries/OpenDrop/hardware_def.h"
)


def load_module():
    if not MODULE_PATH.exists():
        return None
    spec = importlib.util.spec_from_file_location("opendrop_benchmark", MODULE_PATH)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OpenDropBenchmarkTest(unittest.TestCase):
    def setUp(self) -> None:
        self.benchmark = load_module()
        self.assertIsNotNone(self.benchmark, "benchmark.py is not implemented")
        if not SCHEMATIC.exists() or not HEADER.exists():
            self.skipTest("OpenDrop gold checkout missing")

    def test_extracts_required_hv_and_bus_glabels(self) -> None:
        labels = self.benchmark.parse_kicad_glabels(SCHEMATIC)
        self.assertTrue(
            {"V_HV", "V_HV_C", "V_USB", "CLK", "DI", "LE", "BL"}.issubset(labels)
        )

    def test_extracts_gold_hardware_def_pins(self) -> None:
        defines = self.benchmark.parse_pin_defines(HEADER)
        self.assertIn("BOOST_pin", defines)
        self.assertIn("CLK_pin", defines)
        self.assertIn("ENABLE_A_pin", defines)

    def test_builds_valid_minimal_proof_spec(self) -> None:
        result = self.benchmark.extract_contract(SCHEMATIC, HEADER)
        self.assertEqual([], result["blocking_findings"])
        self.assertEqual("hv_controller_main", result["proof_spec"]["proof_target_id"])
        self.assertEqual("high_voltage", result["proof_spec"]["actuators"][0]["domain"])
        self.assertEqual("off", result["proof_spec"]["actuators"][0]["safe_default"])

    def test_missing_required_net_blocks_contract(self) -> None:
        labels = self.benchmark.parse_kicad_glabels(SCHEMATIC)
        labels.remove("V_HV")
        findings = self.benchmark.validate_gold_contract(
            labels,
            self.benchmark.parse_pin_defines(HEADER),
        )
        self.assertIn("missing_schematic_net", [item["code"] for item in findings])

    def test_missing_boost_safe_off_define_blocks_contract(self) -> None:
        defines = self.benchmark.parse_pin_defines(HEADER)
        del defines["BOOST_pin"]
        findings = self.benchmark.validate_gold_contract(
            self.benchmark.parse_kicad_glabels(SCHEMATIC),
            defines,
        )
        self.assertIn("missing_pin_define", [item["code"] for item in findings])

    def test_unsafe_hv_default_fails_firmware_validate(self) -> None:
        firmware_proof = self.benchmark._load_firmware_proof()
        spec = self.benchmark.build_proof_spec(self.benchmark.parse_pin_defines(HEADER))
        spec["actuators"][0]["safe_default"] = "on"
        findings = firmware_proof.validate_spec(spec)
        self.assertTrue(any(item["code"] == "unsafe_actuation_default" for item in findings))

    def test_native_worked_example_compiles_and_runs(self) -> None:
        with tempfile.TemporaryDirectory(prefix="opendrop-fw-benchmark-") as tmp:
            result = self.benchmark.run_benchmark(SCHEMATIC, HEADER, Path(tmp))
            self.assertTrue(result["ok"], result)
            transcript = Path(result["proof_result"]["artifacts"]["transcript_path"]).read_text()
            self.assertIn("PROOF|hv_controller_main|", transcript)


if __name__ == "__main__":
    unittest.main()
