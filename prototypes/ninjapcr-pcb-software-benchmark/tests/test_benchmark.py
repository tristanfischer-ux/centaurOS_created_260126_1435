"""TDD contract for the isolated NinjaPCR gold PCB/software benchmark."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "prototypes/ninjapcr-pcb-software-benchmark/benchmark.py"
SCHEMATIC = ROOT / "out/_gold-ninjapcr-repo/kicad/NinjaPCR/NinjaPCB_ver2.3.sch"
EAGLE_BOARD = ROOT / "out/_gold-ninjapcr-repo/eagle/NinjaPCB_ver2.2.brd"
HEADER = ROOT / "out/_gold-ninjapcr-repo/arduino/NinjaPCR/board_conf_ninjapcrwifi.h"


def load_module():
    if not MODULE_PATH.exists():
        return None
    spec = importlib.util.spec_from_file_location("ninjapcr_benchmark", MODULE_PATH)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NinjaPcrBenchmarkTest(unittest.TestCase):
    def setUp(self) -> None:
        self.benchmark = load_module()
        self.assertIsNotNone(self.benchmark, "RED: benchmark.py is not implemented")

    def test_extracts_required_gold_schematic_nets(self) -> None:
        labels = self.benchmark.parse_kicad_labels(SCHEMATIC)
        self.assertTrue(
            {"FAN", "PEL_PWM", "PEL_SWA", "PEL_SWB", "HEATER", "WELL_TEMP", "HEATER_TEMP"}.issubset(labels)
        )

    def test_extracts_gold_firmware_pin_defines(self) -> None:
        defines = self.benchmark.parse_pin_defines(HEADER)
        self.assertEqual("15", defines["PIN_LID_PWM"])
        self.assertEqual("4", defines["PIN_WELL_PWM"])
        self.assertEqual("0", defines["PIN_FAN"])
        self.assertEqual("14", defines["PIN_WELL_NAU7802_SCL"])
        self.assertEqual("2", defines["PIN_WELL_NAU7802_SDA"])

    def test_surfaces_gpio16_collision_in_gold_header(self) -> None:
        defines = self.benchmark.parse_pin_defines(HEADER)
        collisions = self.benchmark.find_pin_collisions(defines)
        self.assertIn("16", collisions)
        self.assertIn("PIN_WIFI_MODE", collisions["16"])
        self.assertIn("PIN_THERMISTOR_RANGE_SWITCH", collisions["16"])
        self.assertIn("PIN_WELL_HIGH_TEMP", collisions["16"])

    def test_parses_real_eagle_signal_contactrefs(self) -> None:
        connectivity = self.benchmark.parse_eagle_connectivity(EAGLE_BOARD)
        self.assertIn(("ESP1", "19"), connectivity["PEL_PWM"])
        self.assertIn(("IC2", "P$14"), connectivity["SDIO"])
        self.assertIn(("IC2", "P$13"), connectivity["SCLK"])

    def test_derives_hardware_boot_bias_evidence(self) -> None:
        connectivity = self.benchmark.parse_eagle_connectivity(EAGLE_BOARD)
        biases = self.benchmark.analyze_control_biases(connectivity)
        self.assertEqual("GND", biases["HEATER"]["rail"])
        self.assertEqual("3V3", biases["FAN"]["rail"])

    def test_builds_valid_minimal_proof_spec(self) -> None:
        result = self.benchmark.extract_contract(SCHEMATIC, HEADER)
        self.assertEqual([], result["blocking_findings"])
        self.assertEqual(3, len(result["proof_spec"]["channels"]))
        self.assertTrue(result["source_hashes"]["schematic"])
        self.assertTrue(result["source_hashes"]["firmware_header"])

    def test_missing_required_net_blocks_contract(self) -> None:
        labels = self.benchmark.parse_kicad_labels(SCHEMATIC)
        labels.remove("PEL_PWM")
        findings = self.benchmark.validate_gold_contract(
            labels,
            self.benchmark.parse_pin_defines(HEADER),
        )
        self.assertIn("missing_schematic_net", [item["code"] for item in findings])

    def test_proof_input_hash_changes_when_design_changes(self) -> None:
        baseline = self.benchmark.extract_contract(SCHEMATIC, HEADER, EAGLE_BOARD)
        with tempfile.TemporaryDirectory(prefix="ninjapcr-mutation-") as tmp:
            mutated = Path(tmp) / "mutated.sch"
            mutated.write_text(SCHEMATIC.read_text() + "\n# mutation\n")
            changed = self.benchmark.extract_contract(mutated, HEADER, EAGLE_BOARD)
        self.assertNotEqual(baseline["proof_input_hash"], changed["proof_input_hash"])

    def test_native_worked_example_compiles_and_runs(self) -> None:
        with tempfile.TemporaryDirectory(prefix="ninjapcr-fw-benchmark-") as tmp:
            result = self.benchmark.run_benchmark(SCHEMATIC, HEADER, Path(tmp), EAGLE_BOARD)
            self.assertTrue(result["proof_result"]["ok"], result)
            transcript = Path(result["proof_result"]["artifacts"]["transcript_path"]).read_text()
            self.assertIn("CHECK bus_binding PASS bus=i2c0", transcript)
            self.assertIn("CHECK actuation_safe_default PASS actuator=peltier", transcript)
            self.assertIn("CHECK actuation_safe_default PASS actuator=lid_heater", transcript)
            self.assertIn("CHECK actuation_safe_default PASS actuator=fan", transcript)
            self.assertTrue(result["behavioral_proof"]["ok"], result)
            self.assertEqual("on", result["behavioral_proof"]["safe_states"]["fan"])

    def test_esp8266_proof_sketch_binds_safe_gold_pins(self) -> None:
        source = self.benchmark.build_esp8266_proof_sketch(
            self.benchmark.extract_contract(SCHEMATIC, HEADER)
        )
        self.assertIn("constexpr uint8_t PIN_LID_HEATER = 15;", source)
        self.assertIn("constexpr uint8_t PIN_PELTIER_PWM = 4;", source)
        self.assertIn("constexpr uint8_t PIN_FAN = 0;", source)
        self.assertIn("digitalWrite(PIN_LID_HEATER, LOW);", source)
        self.assertIn("digitalWrite(PIN_PELTIER_PWM, HIGH);", source)
        self.assertIn("digitalWrite(PIN_PELTIER_A, HIGH);", source)
        self.assertIn("digitalWrite(PIN_PELTIER_B, HIGH);", source)
        self.assertIn("digitalWrite(PIN_FAN, HIGH);", source)
        self.assertIn("Wire.begin(PIN_NAU_SDA, PIN_NAU_SCL);", source)
        self.assertIn('Serial.println("PROOF|ninjapcr_gold_thermal_controller|', source)


if __name__ == "__main__":
    unittest.main()
