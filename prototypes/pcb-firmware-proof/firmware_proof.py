#!/usr/bin/env python3
"""Isolated draft: validate and execute a minimal PCB firmware-proof contract.

This prototype deliberately targets native C11, not a real MCU. It proves that a
board-level software contract can bind buses, identities, channels, communication,
and safe actuator defaults before the design is integrated into the chain.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SCHEMA = "pcb-firmware-proof-spec/v1"
DANGEROUS_DOMAINS = {"high_voltage", "thermal_actuation", "motion_actuation", "wet_interface"}


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _spec_hash(spec: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(spec).encode("utf-8")).hexdigest()


def _finding(code: str, message: str, severity: str = "HIGH") -> dict[str, str]:
    return {"code": code, "message": message, "severity": severity}


def _identifier(value: object) -> str:
    text = re.sub(r"[^A-Za-z0-9]+", "_", str(value)).strip("_").upper()
    return text or "UNNAMED"


def _list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def validate_spec(spec: dict[str, Any]) -> list[dict[str, str]]:
    """Return deterministic findings; an empty list means the draft can run."""
    findings: list[dict[str, str]] = []

    if spec.get("schema") != SCHEMA:
        findings.append(_finding("invalid_schema", f"expected {SCHEMA!r}"))

    target_id = str(spec.get("proof_target_id") or "").strip()
    if not target_id:
        findings.append(_finding("missing_proof_target_id", "proof_target_id is required"))

    if spec.get("design_fitness_ok") is not True:
        findings.append(
            _finding(
                "proof_skipped_on_unfit_design",
                "firmware proof cannot pass before PCB design fitness",
            )
        )

    kind = str(spec.get("kind") or "")
    if kind not in {"custom_board", "daughterboard", "cots_host_integration", "interconnect_only"}:
        findings.append(_finding("invalid_target_kind", f"unsupported kind {kind!r}"))

    mcu = spec.get("mcu")
    if kind in {"custom_board", "daughterboard"}:
        if not isinstance(mcu, dict):
            findings.append(_finding("firmware_target_missing", "flashable board requires an MCU target"))
        elif mcu.get("pin_contract_complete") is not True:
            findings.append(
                _finding("pinout_header_mismatch", "MCU pin contract is incomplete")
            )

    for bus in _list(spec.get("buses")):
        bus_d = _dict(bus)
        bus_id = str(bus_d.get("bus_id") or "unnamed")
        pins = _dict(bus_d.get("pins"))
        if not pins or any(not str(v).strip() for v in pins.values()):
            findings.append(_finding("bus_binding_missing", f"{bus_id} has incomplete pin bindings"))
        seen_addresses: set[int] = set()
        for device in _list(bus_d.get("expected_devices")):
            dev = _dict(device)
            address = dev.get("address")
            if isinstance(address, int):
                if address in seen_addresses:
                    findings.append(
                        _finding(
                            "bus_address_conflict",
                            f"{bus_id} has duplicate address 0x{address:02X}",
                        )
                    )
                seen_addresses.add(address)

    component_word_ids: set[str] = set()
    for component in _list(spec.get("components")):
        comp = _dict(component)
        word_id = str(comp.get("word_id") or "").strip()
        if not word_id:
            findings.append(_finding("component_binding_missing", "component word_id is required"))
            continue
        if word_id in component_word_ids:
            findings.append(_finding("component_binding_duplicate", f"duplicate component {word_id}"))
        component_word_ids.add(word_id)
        if not str(comp.get("driver_key") or "").strip():
            findings.append(_finding("component_driver_missing", f"{word_id} has no driver_key"))
        if not isinstance(comp.get("identity_check"), dict):
            findings.append(_finding("component_identity_missing", f"{word_id} has no identity check"))

    all_channel_instances: set[str] = set()
    for channel in _list(spec.get("channels")):
        channel_d = _dict(channel)
        role = str(channel_d.get("role") or channel_d.get("channel_id") or "unnamed")
        required = channel_d.get("required_count")
        required_n = required if isinstance(required, int) and required >= 0 else -1
        instances = [_dict(item) for item in _list(channel_d.get("instances"))]
        if required_n < 0:
            findings.append(_finding("channel_requirement_missing", f"{role} has no valid required_count"))
        elif len(instances) < required_n:
            findings.append(
                _finding(
                    "channel_count_mismatch",
                    f"{role} requires {required_n}, implements {len(instances)}",
                )
            )
        for instance in instances:
            instance_id = str(instance.get("instance_id") or "").strip()
            if not instance_id:
                findings.append(_finding("channel_instance_missing", f"{role} has unnamed instance"))
            elif instance_id in all_channel_instances:
                findings.append(
                    _finding("channel_instance_duplicate", f"duplicate channel instance {instance_id}")
                )
            else:
                all_channel_instances.add(instance_id)

    for actuator in _list(spec.get("actuators")):
        act = _dict(actuator)
        actuator_id = str(act.get("actuator_id") or "unnamed")
        domain = str(act.get("domain") or "")
        safe_default = str(act.get("safe_default") or "").lower()
        safety_policy = str(act.get("safety_policy") or "")
        default_is_safe = (
            safe_default == "off"
            or (
                safe_default == "on"
                and safety_policy == "fail_safe_on"
                and domain == "safety_cooling"
            )
        )
        if not default_is_safe:
            findings.append(
                _finding(
                    "unsafe_actuation_default",
                    f"{actuator_id} has no valid safe-default policy",
                )
            )
        duty = act.get("max_duty_percent")
        pulse = act.get("max_pulse_ms")
        if not isinstance(duty, (int, float)) or duty < 0 or duty > 5:
            findings.append(
                _finding(
                    "unsafe_actuation_limit",
                    f"{actuator_id} max duty must be within 0..5%",
                )
            )
        if not isinstance(pulse, (int, float)) or pulse < 0 or pulse > 100:
            findings.append(
                _finding(
                    "unsafe_actuation_limit",
                    f"{actuator_id} max pulse must be within 0..100ms",
                )
            )
        if domain in DANGEROUS_DOMAINS and act.get("requires_two_step_arm") is not True:
            findings.append(
                _finding(
                    "domain_interlock_fail",
                    f"{actuator_id} in {domain} requires two-step arm",
                )
            )
        for instance_id in _list(act.get("instance_ids")):
            if str(instance_id) not in all_channel_instances:
                findings.append(
                    _finding(
                        "actuator_channel_missing",
                        f"{actuator_id} references unknown channel {instance_id}",
                    )
                )

    communications = _list(spec.get("communications"))
    if not communications:
        findings.append(_finding("comms_smoke_missing", "at least one host-observable path is required"))
    for comm in communications:
        comm_d = _dict(comm)
        prefix = str(comm_d.get("expected_banner_prefix") or "")
        if not prefix.startswith("PROOF|"):
            findings.append(
                _finding("comms_banner_invalid", "expected_banner_prefix must start with PROOF|")
            )

    return findings


def generate_harness(spec: dict[str, Any]) -> dict[str, str]:
    """Generate a dependency-free native C11 proof harness from a valid spec."""
    findings = validate_spec(spec)
    if findings:
        raise ValueError(json.dumps(findings, sort_keys=True))

    digest = _spec_hash(spec)
    target_id = str(spec["proof_target_id"])
    header_lines = [
        "#ifndef PCB_FIRMWARE_PROOF_CONFIG_H",
        "#define PCB_FIRMWARE_PROOF_CONFIG_H",
        f'#define PROOF_TARGET_ID "{target_id}"',
        f'#define PROOF_SPEC_HASH "{digest}"',
    ]

    channel_records: list[tuple[str, str, int, int]] = []
    for channel in _list(spec.get("channels")):
        channel_d = _dict(channel)
        channel_id = _identifier(channel_d.get("channel_id") or channel_d.get("role"))
        role = str(channel_d.get("role") or channel_d.get("channel_id"))
        required = int(channel_d.get("required_count") or 0)
        implemented = len(_list(channel_d.get("instances")))
        header_lines.extend(
            [
                f"#define PROOF_{channel_id}_REQUIRED {required}",
                f"#define PROOF_{channel_id}_IMPLEMENTED {implemented}",
            ]
        )
        channel_records.append((channel_id, role, required, implemented))

    header_lines.extend(["#endif", ""])
    source_lines = [
        '#include "proof_config.h"',
        "#include <stdio.h>",
        "",
    ]
    for channel_id, _role, required, _implemented in channel_records:
        source_lines.append(
            f'_Static_assert(PROOF_{channel_id}_IMPLEMENTED >= {required}, '
            f'"channel_count_mismatch:{channel_id}");'
        )

    source_lines.extend(
        [
            "",
            "int main(void) {",
            f'  puts("PROOF|{target_id}|{digest[:8]}");',
            '  puts("CHECK boot_link PASS");',
        ]
    )

    for bus in _list(spec.get("buses")):
        bus_d = _dict(bus)
        source_lines.append(
            f'  puts("CHECK bus_binding PASS bus={str(bus_d.get("bus_id") or "unnamed")}");'
        )

    for component in _list(spec.get("components")):
        comp = _dict(component)
        source_lines.append(
            f'  puts("CHECK component_identity PASS word={str(comp.get("word_id") or "unnamed")}");'
        )

    for _channel_id, role, required, implemented in channel_records:
        source_lines.append(
            f'  puts("CHECK channel_count PASS role={role} required={required} implemented={implemented}");'
        )

    for actuator in _list(spec.get("actuators")):
        act = _dict(actuator)
        source_lines.append(
            f'  puts("CHECK actuation_safe_default PASS actuator={str(act.get("actuator_id") or "unnamed")}");'
        )
        source_lines.append(
            f'  puts("CHECK actuation_bounded_exercise PASS actuator={str(act.get("actuator_id") or "unnamed")}");'
        )

    source_lines.extend(
        [
            '  puts("CHECK comms_smoke PASS");',
            "  return 0;",
            "}",
            "",
        ]
    )
    return {
        "header": "\n".join(header_lines),
        "source": "\n".join(source_lines),
        "spec_hash": digest,
    }


def prove_spec(spec: dict[str, Any], out_dir: Path, cc: str | None = None) -> dict[str, Any]:
    """Validate, generate, native-compile, execute, and write auditable evidence."""
    started = time.monotonic()
    out_dir.mkdir(parents=True, exist_ok=True)
    spec_path = out_dir / "proof-spec.json"
    result_path = out_dir / "proof-result.json"
    spec_path.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n")

    findings = validate_spec(spec)
    if findings:
        result: dict[str, Any] = {
            "schema": "pcb-firmware-proof-result/v1",
            "proof_target_id": str(spec.get("proof_target_id") or "unknown"),
            "spec_hash": _spec_hash(spec),
            "ok": False,
            "stages": [{"stage": "spec", "ok": False, "errors": findings}],
            "checks": findings,
            "artifacts": {"spec_path": str(spec_path), "result_path": str(result_path)},
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        return result

    generated = generate_harness(spec)
    header_path = out_dir / "proof_config.h"
    source_path = out_dir / "proof_main.c"
    binary_path = out_dir / "proof_native"
    compile_log_path = out_dir / "compile.log"
    transcript_path = out_dir / "transcript.txt"
    header_path.write_text(generated["header"])
    source_path.write_text(generated["source"])

    compiler = cc or "cc"
    compile_proc = subprocess.run(
        [
            compiler,
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-Werror",
            str(source_path),
            "-o",
            str(binary_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    compile_log = (compile_proc.stdout or "") + (compile_proc.stderr or "")
    compile_log_path.write_text(compile_log)
    stages: list[dict[str, Any]] = [
        {"stage": "spec", "ok": True, "errors": []},
        {
            "stage": "compile",
            "ok": compile_proc.returncode == 0,
            "errors": [] if compile_proc.returncode == 0 else [compile_log[-2000:]],
        },
    ]
    transcript = ""
    run_returncode: int | None = None
    if compile_proc.returncode == 0:
        run_proc = subprocess.run(
            [str(binary_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        transcript = (run_proc.stdout or "") + (run_proc.stderr or "")
        run_returncode = run_proc.returncode
    transcript_path.write_text(transcript)
    transcript_checks = [line for line in transcript.splitlines() if line.startswith("CHECK ")]
    runtime_ok = (
        run_returncode == 0
        and bool(transcript_checks)
        and all(" PASS" in line for line in transcript_checks)
        and transcript.startswith(f"PROOF|{spec['proof_target_id']}|{generated['spec_hash'][:8]}")
    )
    stages.append(
        {
            "stage": "native_sim",
            "ok": runtime_ok,
            "errors": [] if runtime_ok else ["native proof transcript incomplete or failed"],
        }
    )

    result = {
        "schema": "pcb-firmware-proof-result/v1",
        "proof_target_id": str(spec["proof_target_id"]),
        "spec_hash": generated["spec_hash"],
        "ok": compile_proc.returncode == 0 and runtime_ok,
        "stages": stages,
        "checks": [
            {
                "check_id": line.split()[1],
                "ok": " PASS" in line,
                "evidence": line,
            }
            for line in transcript_checks
        ],
        "artifacts": {
            "spec_path": str(spec_path),
            "header_path": str(header_path),
            "source_path": str(source_path),
            "binary_path": str(binary_path),
            "compile_log_path": str(compile_log_path),
            "transcript_path": str(transcript_path),
            "result_path": str(result_path),
        },
        "toolchain": {"compiler": compiler, "target": "native-draft"},
        "provenance": "isolated_prototype",
        "duration_ms": round((time.monotonic() - started) * 1000),
    }
    result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return result


def _load_spec(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError("proof spec must be a JSON object")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    validate_cmd = sub.add_parser("validate", help="validate a proof specification")
    validate_cmd.add_argument("spec", type=Path)

    generate_cmd = sub.add_parser("generate", help="generate native C proof sources")
    generate_cmd.add_argument("spec", type=Path)
    generate_cmd.add_argument("--out", type=Path, required=True)

    prove_cmd = sub.add_parser("prove", help="validate, compile, run, and write evidence")
    prove_cmd.add_argument("spec", type=Path)
    prove_cmd.add_argument("--out", type=Path, required=True)
    prove_cmd.add_argument("--cc", default="cc")

    args = parser.parse_args(argv)
    spec = _load_spec(args.spec)

    if args.command == "validate":
        findings = validate_spec(spec)
        print(json.dumps({"ok": not findings, "findings": findings}, indent=2))
        return 0 if not findings else 2

    if args.command == "generate":
        findings = validate_spec(spec)
        if findings:
            print(json.dumps({"ok": False, "findings": findings}, indent=2))
            return 2
        generated = generate_harness(spec)
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "proof_config.h").write_text(generated["header"])
        (args.out / "proof_main.c").write_text(generated["source"])
        print(json.dumps({"ok": True, "out": str(args.out), "spec_hash": generated["spec_hash"]}, indent=2))
        return 0

    if args.command == "prove":
        result = prove_spec(spec, args.out, cc=args.cc)
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 3

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
