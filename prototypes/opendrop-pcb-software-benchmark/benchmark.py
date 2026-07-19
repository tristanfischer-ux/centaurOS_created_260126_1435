#!/usr/bin/env python3
"""Isolated OpenDrop gold PCB/firmware contract and native proof benchmark.

Not wired into the ForgeOS chain. Status when green:
  FAB-READY SOFTWARE PROOF — UNPROVEN IN HARDWARE
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
FIRMWARE_PROOF_PATH = ROOT / "prototypes/pcb-firmware-proof/firmware_proof.py"

REQUIRED_GLABELS = {
    "V_HV",
    "V_HV_C",
    "GND_C",
    "V_USB",
    "CLK",
    "DI",
    "LE",
    "BL",
    "FEEDBACK",
}

REQUIRED_DEFINES = {
    "LE_pin",
    "CLK_pin",
    "DI_pin",
    "BL_pin",
    "BOOST_pin",
    "ENABLE_A_pin",
    "ENABLE_B_pin",
    "VSENS_pin",
    "FEEDBACK_pin",
}


def _load_firmware_proof():
    module_spec = importlib.util.spec_from_file_location(
        "firmware_proof_for_opendrop",
        FIRMWARE_PROOF_PATH,
    )
    if module_spec is None or module_spec.loader is None:
        raise RuntimeError(f"cannot load {FIRMWARE_PROOF_PATH}")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_kicad_glabels(path: Path) -> set[str]:
    """Extract EESchema Text GLabel names (OpenDrop V4 main board style)."""
    lines = path.read_text(errors="replace").splitlines()
    labels: set[str] = set()
    for index, line in enumerate(lines[:-1]):
        if line.startswith("Text GLabel ") and lines[index + 1].strip():
            labels.add(lines[index + 1].strip())
    return labels


def parse_pin_defines(path: Path) -> dict[str, str]:
    """Extract active *_pin numeric/token defines from hardware_def.h."""
    defines: dict[str, str] = {}
    pattern = re.compile(r"^\s*#define\s+([A-Za-z0-9_]*_pin)\s+(.+)$")
    for line in path.read_text(errors="replace").splitlines():
        stripped = line.split("//", 1)[0].strip()
        match = pattern.match(stripped)
        if match:
            defines[match.group(1)] = match.group(2).strip()
    return defines


def validate_gold_contract(
    labels: set[str],
    defines: dict[str, str],
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for net in sorted(REQUIRED_GLABELS):
        if net not in labels:
            findings.append(
                {"code": "missing_schematic_net", "message": f"missing GLabel {net}"}
            )
    for name in sorted(REQUIRED_DEFINES):
        if name not in defines:
            findings.append(
                {"code": "missing_pin_define", "message": f"missing #define {name}"}
            )
    return findings


def build_proof_spec(defines: dict[str, str]) -> dict[str, Any]:
    """Minimal HV-controller bring-up contract: electrode bus + HV safe-off."""
    return {
        "schema": "pcb-firmware-proof-spec/v1",
        "proof_target_id": "hv_controller_main",
        "kind": "custom_board",
        "design_fitness_ok": True,
        "mcu": {
            "mpn": "ATSAMD21G18A",
            "toolchain": "native-draft",
            "pin_contract_complete": True,
        },
        "buses": [
            {
                "bus_id": "electrode_shift",
                "protocol": "bitbang_shift",
                "pins": {
                    "clk": f"GPIO{defines.get('CLK_pin', '24')}",
                    "di": f"GPIO{defines.get('DI_pin', '23')}",
                    "le": f"GPIO{defines.get('LE_pin', '1')}",
                    "bl": f"GPIO{defines.get('BL_pin', '9')}",
                },
                "expected_devices": [
                    {
                        "address": 0,
                        "mpn": "HV507_SHIFT_CHAIN",
                        "word_id": "electrode_switch_chain",
                    }
                ],
            }
        ],
        "components": [
            {
                "word_id": "electrode_switch_chain",
                "refdes": "U_HVSW",
                "mpn": "HV507_FAMILY",
                "driver_key": "hv_shift_register",
                "identity_check": {
                    "kind": "presence",
                    "register": "0x00",
                    "mask": "0xFF",
                    "expected": "0x01",
                },
            }
        ],
        "channels": [
            {
                "channel_id": "electrode_control_bus",
                "role": "electrode_switch_channel",
                "required_count": 1,
                "instances": [
                    {
                        "instance_id": "electrode_bus_0",
                        "enable_net": "BL",
                        "output_net": "DI",
                    }
                ],
            },
            {
                "channel_id": "hv_boost_enable",
                "role": "hv_enable_channel",
                "required_count": 1,
                "instances": [
                    {
                        "instance_id": "hv_boost_0",
                        "enable_net": "BOOST",
                        "output_net": "V_HV",
                    }
                ],
            },
        ],
        "actuators": [
            {
                "actuator_id": "hv_rail",
                "domain": "high_voltage",
                "instance_ids": ["hv_boost_0", "electrode_bus_0"],
                "safe_default": "off",
                "requires_two_step_arm": True,
                "max_duty_percent": 5,
                "max_pulse_ms": 100,
            }
        ],
        "communications": [
            {
                "kind": "uart_banner",
                "expected_banner_prefix": "PROOF|hv_controller_main|",
            }
        ],
    }


def extract_contract(schematic: Path, header: Path) -> dict[str, Any]:
    labels = parse_kicad_glabels(schematic)
    defines = parse_pin_defines(header)
    findings = validate_gold_contract(labels, defines)
    proof_spec = build_proof_spec(defines)
    payload = {
        "blocking_findings": findings,
        "proof_spec": proof_spec,
        "source_hashes": {
            "schematic": _sha256(schematic),
            "firmware_header": _sha256(header),
        },
        "glabels_found": sorted(labels & REQUIRED_GLABELS),
        "pin_defines_found": {k: defines[k] for k in REQUIRED_DEFINES if k in defines},
    }
    payload["proof_input_hash"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return payload


def run_benchmark(schematic: Path, header: Path, out_dir: Path) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    contract = extract_contract(schematic, header)
    (out_dir / "contract.json").write_text(json.dumps(contract, indent=2) + "\n")
    if contract["blocking_findings"]:
        return {
            "ok": False,
            "contract": contract,
            "proof_result": {"ok": False, "findings": contract["blocking_findings"]},
        }

    firmware_proof = _load_firmware_proof()
    spec_path = out_dir / "pcb-firmware-proof-spec.json"
    spec_path.write_text(json.dumps(contract["proof_spec"], indent=2) + "\n")
    proof_out = out_dir / "native-proof"
    result = firmware_proof.prove_spec(contract["proof_spec"], proof_out)
    (out_dir / "proof-result.json").write_text(json.dumps(result, indent=2) + "\n")
    return {"ok": bool(result.get("ok")), "contract": contract, "proof_result": result}


def default_gold_paths() -> tuple[Path, Path]:
    candidates = [
        ROOT,
        Path(str(ROOT).removesuffix("-cursor-pcb")),
        Path("/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel"),
    ]
    for base in candidates:
        schematic = (
            base
            / "out/_gold-opendrop-repo/OpenDropV4/Electronics/OpenDropV4_MainBoard/PCB/OpenDropV4.sch"
        )
        header = (
            base
            / "out/_gold-opendrop-repo/OpenDropV4/Software/Libraries/OpenDrop/hardware_def.h"
        )
        if schematic.exists() and header.exists():
            return schematic, header
    raise FileNotFoundError("OpenDrop gold schematic/header not found")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schematic", type=Path, default=None)
    parser.add_argument("--header", type=Path, default=None)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    schematic, header = (
        (args.schematic, args.header)
        if args.schematic and args.header
        else default_gold_paths()
    )
    result = run_benchmark(schematic, header, args.out)
    print(json.dumps({"ok": result["ok"], "out": str(args.out)}, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
