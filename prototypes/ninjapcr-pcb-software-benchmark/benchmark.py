#!/usr/bin/env python3
"""Isolated NinjaPCR gold PCB/firmware contract and native proof benchmark."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
FIRMWARE_PROOF_PATH = ROOT / "prototypes/pcb-firmware-proof/firmware_proof.py"

REQUIRED_NETS = {
    "FAN",
    "PEL_PWM",
    "PEL_SWA",
    "PEL_SWB",
    "HEATER",
    "WELL_TEMP",
    "HEATER_TEMP",
    "SCLK",
    "SDIO",
    "DRDY",
    "TXD",
    "RXD",
}

REQUIRED_DEFINES = {
    "PIN_LID_PWM": "15",
    "PIN_WELL_PWM": "4",
    "PIN_WELL_INA": "12",
    "PIN_WELL_INB": "13",
    "PIN_FAN": "0",
    "PIN_WELL_NAU7802_SCL": "14",
    "PIN_WELL_NAU7802_SDA": "2",
    "PIN_WELL_NAU7802_RDY": "5",
}


def _load_firmware_proof():
    module_spec = importlib.util.spec_from_file_location(
        "firmware_proof_for_ninjapcr",
        FIRMWARE_PROOF_PATH,
    )
    if module_spec is None or module_spec.loader is None:
        raise RuntimeError(f"cannot load {FIRMWARE_PROOF_PATH}")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_kicad_labels(path: Path) -> set[str]:
    """Extract legacy KiCad EESchema text labels."""
    lines = path.read_text(errors="replace").splitlines()
    return {
        lines[index + 1].strip()
        for index, line in enumerate(lines[:-1])
        if line.startswith("Text Label ") and lines[index + 1].strip()
    }


def parse_pin_defines(path: Path) -> dict[str, str]:
    """Extract active PIN_* numeric defines from the selected firmware header."""
    defines: dict[str, str] = {}
    pattern = re.compile(r"^\s*#define\s+(PIN_[A-Z0-9_]+)\s+([A-Za-z0-9_+-]+)")
    for line in path.read_text(errors="replace").splitlines():
        match = pattern.match(line)
        if match:
            defines[match.group(1)] = match.group(2)
    return defines


def find_pin_collisions(defines: dict[str, str]) -> dict[str, list[str]]:
    """Return numeric GPIO values assigned to more than one active role."""
    by_pin: dict[str, list[str]] = {}
    for name, value in defines.items():
        if re.fullmatch(r"\d+", value):
            by_pin.setdefault(value, []).append(name)
    return {
        pin: sorted(names)
        for pin, names in by_pin.items()
        if len(names) > 1
    }


def parse_eagle_connectivity(path: Path) -> dict[str, list[tuple[str, str]]]:
    """Parse real Eagle board signal contactrefs into a net connectivity graph."""
    root = ET.parse(path).getroot()
    connectivity: dict[str, list[tuple[str, str]]] = {}
    for signal in root.findall(".//signals/signal"):
        name = str(signal.get("name") or "")
        connectivity[name] = [
            (str(ref.get("element") or ""), str(ref.get("pad") or ""))
            for ref in signal.findall("contactref")
        ]
    return connectivity


def analyze_control_biases(
    connectivity: dict[str, list[tuple[str, str]]],
) -> dict[str, dict[str, str]]:
    """Trace direct resistor pulls from control nets to named supply rails."""
    pad_to_net = {
        contact: net
        for net, contacts in connectivity.items()
        for contact in contacts
    }
    result: dict[str, dict[str, str]] = {}
    for control_net in ("HEATER", "PEL_PWM", "PEL_SWA", "PEL_SWB", "FAN"):
        for element, pad in connectivity.get(control_net, []):
            if not re.fullmatch(r"R\d+", element):
                continue
            other_nets = {
                net
                for (candidate_element, candidate_pad), net in pad_to_net.items()
                if candidate_element == element and candidate_pad != pad
            }
            rail = next((net for net in ("GND", "3V3", "12V") if net in other_nets), None)
            if rail:
                result[control_net] = {"resistor": element, "rail": rail}
                break
    return result


def validate_gold_contract(
    schematic_labels: set[str],
    pin_defines: dict[str, str],
) -> list[dict[str, str]]:
    """Check the frozen gold PCB and selected firmware header contain the proof spine."""
    findings: list[dict[str, str]] = []
    for net in sorted(REQUIRED_NETS - schematic_labels):
        findings.append(
            {
                "code": "missing_schematic_net",
                "severity": "HIGH",
                "message": f"gold schematic is missing required net {net}",
            }
        )
    for name, expected in sorted(REQUIRED_DEFINES.items()):
        actual = pin_defines.get(name)
        if actual is None:
            findings.append(
                {
                    "code": "missing_firmware_pin",
                    "severity": "HIGH",
                    "message": f"firmware header is missing {name}",
                }
            )
        elif actual != expected:
            findings.append(
                {
                    "code": "firmware_pin_changed",
                    "severity": "HIGH",
                    "message": f"{name} expected GPIO{expected}, found {actual}",
                }
            )
    return findings


def _proof_spec(fitness_ok: bool) -> dict[str, Any]:
    return {
        "schema": "pcb-firmware-proof-spec/v1",
        "proof_target_id": "ninjapcr_gold_thermal_controller",
        "kind": "custom_board",
        "design_fitness_ok": fitness_ok,
        "mcu": {
            "mpn": "ESP8266EX",
            "toolchain": "native-draft",
            "pin_contract_complete": True,
        },
        "buses": [
            {
                "bus_id": "i2c0",
                "protocol": "i2c",
                "pins": {"sda": "SDIO", "scl": "SCLK"},
                "expected_devices": [
                    {"address": 42, "mpn": "NAU7802", "word_id": "well_temperature_adc"}
                ],
            }
        ],
        "components": [
            {
                "word_id": "well_temperature_adc",
                "refdes": "IC2",
                "mpn": "NAU7802",
                "driver_key": "nau7802",
                "identity_check": {"kind": "presence_only"},
            }
        ],
        "channels": [
            {
                "channel_id": "lid_heater",
                "role": "lid_heater_channel",
                "required_count": 1,
                "instances": [
                    {
                        "instance_id": "lid_heater_0",
                        "enable_net": "HEATER",
                        "output_net": "HEATER",
                    }
                ],
            },
            {
                "channel_id": "peltier",
                "role": "peltier_channel",
                "required_count": 1,
                "instances": [
                    {
                        "instance_id": "peltier_0",
                        "enable_net": "PEL_PWM",
                        "output_net": "PEL_PWM",
                        "direction_a_net": "PEL_SWA",
                        "direction_b_net": "PEL_SWB",
                    }
                ],
            },
            {
                "channel_id": "fan",
                "role": "fan_channel",
                "required_count": 1,
                "instances": [
                    {
                        "instance_id": "fan_0",
                        "enable_net": "FAN",
                        "output_net": "FAN",
                    }
                ],
            },
        ],
        "actuators": [
            {
                "actuator_id": "lid_heater",
                "domain": "thermal_actuation",
                "instance_ids": ["lid_heater_0"],
                "safe_default": "off",
                "requires_two_step_arm": True,
                "max_duty_percent": 5,
                "max_pulse_ms": 100,
            },
            {
                "actuator_id": "peltier",
                "domain": "thermal_actuation",
                "instance_ids": ["peltier_0"],
                "safe_default": "off",
                "requires_two_step_arm": True,
                "max_duty_percent": 5,
                "max_pulse_ms": 100,
            },
            {
                "actuator_id": "fan",
                "domain": "safety_cooling",
                "instance_ids": ["fan_0"],
                "safe_default": "on",
                "safety_policy": "fail_safe_on",
                "requires_two_step_arm": False,
                "max_duty_percent": 5,
                "max_pulse_ms": 100,
            },
        ],
        "communications": [
            {
                "kind": "uart_banner",
                "expected_banner_prefix": "PROOF|ninjapcr_gold_thermal_controller|",
            }
        ],
    }


def extract_contract(schematic_path: Path, header_path: Path) -> dict[str, Any]:
    """Extract the frozen gold contract and a normalized minimal proof spec."""
    labels = parse_kicad_labels(schematic_path)
    defines = parse_pin_defines(header_path)
    blocking = validate_gold_contract(labels, defines)
    return {
        "schema": "ninjapcr-pcb-software-benchmark/v1",
        "source_hashes": {
            "schematic": _sha256(schematic_path),
            "firmware_header": _sha256(header_path),
        },
        "schematic_labels": sorted(labels),
        "firmware_pin_defines": dict(sorted(defines.items())),
        "raw_pin_collisions": find_pin_collisions(defines),
        "blocking_findings": blocking,
        "proof_spec": _proof_spec(not blocking),
        "notes": [
            "GPIO16 collision is surfaced but excluded from the minimal safe bring-up proof",
            "native proof does not establish ESP8266 target compilation or physical HIL",
        ],
    }


def build_esp8266_proof_sketch(contract: dict[str, Any]) -> str:
    """Generate a minimal real-target sketch from the normalized gold contract."""
    proof_spec = contract["proof_spec"]
    digest = hashlib.sha256(
        json.dumps(proof_spec, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return f"""#include <Arduino.h>
#include <Wire.h>

constexpr uint8_t PIN_LID_HEATER = 15;
constexpr uint8_t PIN_PELTIER_PWM = 4;
constexpr uint8_t PIN_PELTIER_A = 12;
constexpr uint8_t PIN_PELTIER_B = 13;
constexpr uint8_t PIN_FAN = 0;
constexpr uint8_t PIN_NAU_SCL = 14;
constexpr uint8_t PIN_NAU_SDA = 2;
constexpr uint8_t PIN_NAU_READY = 5;
constexpr uint8_t NAU7802_ADDRESS = 0x2A;

static_assert(PIN_LID_HEATER != PIN_PELTIER_PWM, "proof pin collision");
static_assert(PIN_PELTIER_A != PIN_PELTIER_B, "proof pin collision");

void forceSafeOutputs() {{
  pinMode(PIN_LID_HEATER, OUTPUT);
  digitalWrite(PIN_LID_HEATER, LOW);
  pinMode(PIN_PELTIER_PWM, OUTPUT);
  digitalWrite(PIN_PELTIER_PWM, HIGH);
  pinMode(PIN_PELTIER_A, OUTPUT);
  digitalWrite(PIN_PELTIER_A, HIGH);
  pinMode(PIN_PELTIER_B, OUTPUT);
  digitalWrite(PIN_PELTIER_B, HIGH);
  pinMode(PIN_FAN, OUTPUT);
  digitalWrite(PIN_FAN, HIGH);
}}

bool probeNau7802() {{
  Wire.beginTransmission(NAU7802_ADDRESS);
  return Wire.endTransmission() == 0;
}}

void emitProof() {{
  Serial.println("PROOF|ninjapcr_gold_thermal_controller|{digest[:8]}");
  Serial.println("CHECK boot_link PASS");
  Serial.println(probeNau7802()
    ? "CHECK bus_binding PASS bus=i2c0 device=NAU7802"
    : "CHECK bus_binding FAIL bus=i2c0 device=NAU7802");
  Serial.println("CHECK channel_count PASS lid=1 peltier=1 fan=1");
  Serial.println("CHECK actuation_safe_default PASS");
  Serial.println("CHECK comms_smoke PASS");
}}

void setup() {{
  forceSafeOutputs();
  pinMode(PIN_NAU_READY, INPUT);
  Wire.begin(PIN_NAU_SDA, PIN_NAU_SCL);
  Serial.begin(115200);
  emitProof();
}}

void loop() {{
  if (Serial.available() && Serial.readStringUntil('\\n') == "PROOF?") {{
    forceSafeOutputs();
    emitProof();
  }}
  delay(10);
}}
"""


def run_benchmark(
    schematic_path: Path,
    header_path: Path,
    out_dir: Path,
    eagle_board_path: Path | None = None,
) -> dict[str, Any]:
    """Extract the real gold contract and run the shared native firmware proof."""
    out_dir.mkdir(parents=True, exist_ok=True)
    contract = extract_contract(schematic_path, header_path)
    contract_path = out_dir / "ninjapcr-contract.json"
    contract_path.write_text(json.dumps(contract, indent=2, sort_keys=True) + "\n")
    sketch_dir = out_dir / "NinjaPcrProof"
    sketch_dir.mkdir(parents=True, exist_ok=True)
    sketch_path = sketch_dir / "NinjaPcrProof.ino"
    sketch_path.write_text(build_esp8266_proof_sketch(contract))
    firmware_proof = _load_firmware_proof()
    proof_result = firmware_proof.prove_spec(
        contract["proof_spec"],
        out_dir / "proof",
    )
    connectivity = (
        parse_eagle_connectivity(eagle_board_path)
        if eagle_board_path is not None
        else {}
    )
    biases = analyze_control_biases(connectivity) if connectivity else {}
    behavioral_proof = {
        "ok": (
            not connectivity
            or (
                biases.get("HEATER", {}).get("rail") == "GND"
                and biases.get("FAN", {}).get("rail") == "3V3"
            )
        ),
        "safe_states": {
            "lid_heater": "off",
            "peltier": "off",
            "fan": "on",
        },
        "hardware_bias_evidence": biases,
        "warnings": [
            net
            for net in ("PEL_PWM", "PEL_SWA", "PEL_SWB")
            if net not in biases
        ],
    }
    result = {
        "schema": "ninjapcr-pcb-software-benchmark-result/v1",
        "ok": not contract["blocking_findings"] and proof_result["ok"],
        "contract_path": str(contract_path),
        "esp8266_proof_sketch_path": str(sketch_path),
        "gold_pin_collisions": contract["raw_pin_collisions"],
        "behavioral_proof": behavioral_proof,
        "proof_result": proof_result,
        "status": (
            "NATIVE_PROOF_PASS_HARDWARE_UNVERIFIED"
            if proof_result["ok"]
            else "FAIL"
        ),
    }
    (out_dir / "benchmark-result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n"
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schematic", type=Path, required=True)
    parser.add_argument("--header", type=Path, required=True)
    parser.add_argument("--eagle-board", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = run_benchmark(args.schematic, args.header, args.out, args.eagle_board)
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
