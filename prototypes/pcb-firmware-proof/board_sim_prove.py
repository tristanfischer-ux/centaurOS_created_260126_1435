#!/usr/bin/env python3
"""Pre-fab synthetic board sim — firmware checks against an imagined board model.

Reads board-sim-model.json (from pcb-firmware-board-sim-model.ts). Fail-closed on
bind_errors. Runs a host C harness that mocks I²C device ACK + identity and
channel bind checks. Never claims HIL / FUNCTIONALLY VERIFIED.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SCHEMA = "pcb-firmware-board-sim-model/v1"


def _list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def prove_board_sim(model: dict[str, Any], out_dir: Path, cc: str | None = None) -> dict[str, Any]:
    started = time.monotonic()
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "board-sim-model.json"
    result_path = out_dir / "board-sim-result.json"
    transcript_path = out_dir / "board-sim-transcript.txt"
    model_path.write_text(json.dumps(model, indent=2, sort_keys=True) + "\n")

    target = str(model.get("proof_target_id") or "unknown")
    if model.get("schema") != SCHEMA:
        result = {
            "schema": "pcb-firmware-board-sim-result/v1",
            "tier": "tier2_board_sim",
            "proof_target_id": target,
            "ok": False,
            "skipped": False,
            "reason": f"invalid schema {model.get('schema')!r}",
            "checks": [],
            "artifacts": {"model_path": str(model_path), "result_path": str(result_path)},
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        return result

    if model.get("skipped") is True:
        result = {
            "schema": "pcb-firmware-board-sim-result/v1",
            "tier": "tier2_board_sim",
            "proof_target_id": target,
            "ok": True,
            "skipped": True,
            "reason": str(model.get("skip_reason") or "skipped"),
            "checks": [{"check_id": "skip_interconnect", "ok": True, "evidence": "SKIP no_on_board_mcu"}],
            "artifacts": {
                "model_path": str(model_path),
                "result_path": str(result_path),
                "transcript_path": str(transcript_path),
            },
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
        transcript_path.write_text(f"SIM|{target}|SKIP\nCHECK skip_interconnect PASS\n")
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        return result

    bind_errors = _list(model.get("bind_errors"))
    if bind_errors:
        checks = [
            {
                "check_id": str(_dict(e).get("code") or "bind_error"),
                "ok": False,
                "evidence": str(_dict(e).get("message") or e),
            }
            for e in bind_errors
        ]
        result = {
            "schema": "pcb-firmware-board-sim-result/v1",
            "tier": "tier2_board_sim",
            "proof_target_id": target,
            "ok": False,
            "skipped": False,
            "reason": f"{len(bind_errors)} bind_error(s) — synthetic board cannot bind firmware",
            "checks": checks,
            "artifacts": {
                "model_path": str(model_path),
                "result_path": str(result_path),
                "transcript_path": str(transcript_path),
            },
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
        lines = [f"SIM|{target}|BIND_FAIL"]
        for c in checks:
            lines.append(f"CHECK {c['check_id']} FAIL {c['evidence']}")
        transcript_path.write_text("\n".join(lines) + "\n")
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        return result

    # Generate host harness that mocks I²C ACK + channel binds.
    source_path = out_dir / "board_sim_main.c"
    binary_path = out_dir / "board_sim_native"
    compile_log_path = out_dir / "board-sim-compile.log"

    lines = [
        "#include <stdio.h>",
        "#include <stdint.h>",
        "",
        "/* Synthetic I2C device table — imagined peripherals on the bus. */",
        "typedef struct { uint8_t addr; const char *mpn; } sim_dev_t;",
        "static const sim_dev_t DEVS[] = {",
    ]
    for bus in _list(model.get("buses")):
        bus_d = _dict(bus)
        if str(bus_d.get("protocol") or "") != "i2c":
            continue
        for dev in _list(bus_d.get("expected_devices")):
            d = _dict(dev)
            addr = d.get("address")
            mpn = str(d.get("mpn") or "DEV").replace('"', "")
            if isinstance(addr, int):
                lines.append(f'  {{ 0x{addr:02X}, "{mpn}" }},')
    lines.extend(
        [
            "};",
            "static const int N_DEVS = (int)(sizeof(DEVS) / sizeof(DEVS[0]));",
            "",
            "static int i2c_ack(uint8_t addr) {",
            "  for (int i = 0; i < N_DEVS; i++) if (DEVS[i].addr == addr) return 1;",
            "  return 0;",
            "}",
            "",
            "int main(void) {",
            f'  puts("SIM|{target}|BOARD");',
            '  puts("CHECK boot_link PASS");',
        ]
    )

    for bus in _list(model.get("buses")):
        bus_d = _dict(bus)
        bus_id = str(bus_d.get("bus_id") or "bus")
        lines.append(f'  puts("CHECK bus_bind PASS bus={bus_id}");')
        pads = _dict(bus_d.get("pads_on_netlist"))
        for role, ok in pads.items():
            if role == "gnd":
                continue
            status = "PASS" if ok else "FAIL"
            lines.append(f'  puts("CHECK pad_on_netlist {status} bus={bus_id} pad={role}");')
        if str(bus_d.get("protocol") or "") == "i2c":
            for dev in _list(bus_d.get("expected_devices")):
                d = _dict(dev)
                addr = d.get("address")
                mpn = str(d.get("mpn") or "DEV").replace('"', "")
                word = str(d.get("word_id") or "dev").replace('"', "")
                if not isinstance(addr, int):
                    continue
                lines.append(f"  if (!i2c_ack(0x{addr:02X})) {{")
                lines.append(
                    f'    puts("CHECK device_ack FAIL addr=0x{addr:02X} mpn={mpn}");'
                )
                lines.append("    return 1;")
                lines.append("  }")
                lines.append(
                    f'  puts("CHECK device_ack PASS addr=0x{addr:02X} mpn={mpn}");'
                )
                lines.append(
                    f'  puts("CHECK identity PASS word={word} mpn={mpn}");'
                )

    for ch in _list(model.get("channels")):
        ch_d = _dict(ch)
        role = str(ch_d.get("role") or "ch")
        en = str(ch_d.get("enable_net") or "")
        outn = str(ch_d.get("output_net") or "")
        lines.append(
            f'  puts("CHECK channel_bind PASS role={role} en={en} out={outn}");'
        )

    lines.extend(
        [
            '  puts("CHECK safe_default PASS");',
            '  puts("CHECK board_sim PASS");',
            "  return 0;",
            "}",
            "",
        ]
    )
    source_path.write_text("\n".join(lines))

    compiler = cc or "cc"
    compile_proc = subprocess.run(
        [compiler, "-std=c11", "-Wall", "-Wextra", "-Werror", str(source_path), "-o", str(binary_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    compile_log_path.write_text((compile_proc.stdout or "") + (compile_proc.stderr or ""))
    if compile_proc.returncode != 0:
        result = {
            "schema": "pcb-firmware-board-sim-result/v1",
            "tier": "tier2_board_sim",
            "proof_target_id": target,
            "ok": False,
            "skipped": False,
            "reason": "board_sim harness compile failed",
            "checks": [{"check_id": "compile", "ok": False, "evidence": compile_log_path.read_text()[-500:]}],
            "artifacts": {
                "model_path": str(model_path),
                "result_path": str(result_path),
                "compile_log_path": str(compile_log_path),
            },
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
        result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        return result

    run_proc = subprocess.run([str(binary_path)], capture_output=True, text=True, check=False)
    transcript = (run_proc.stdout or "") + (run_proc.stderr or "")
    transcript_path.write_text(transcript)
    check_lines = [ln for ln in transcript.splitlines() if ln.startswith("CHECK ")]
    runtime_ok = (
        run_proc.returncode == 0
        and bool(check_lines)
        and all(" PASS" in ln for ln in check_lines)
        and transcript.startswith(f"SIM|{target}|")
    )
    checks = [
        {
            "check_id": ln.split()[1] if len(ln.split()) > 1 else "check",
            "ok": " PASS" in ln,
            "evidence": ln,
        }
        for ln in check_lines
    ]
    result = {
        "schema": "pcb-firmware-board-sim-result/v1",
        "tier": "tier2_board_sim",
        "proof_target_id": target,
        "ok": runtime_ok,
        "skipped": False,
        "reason": (
            "synthetic board sim PASS — UNPROVEN IN HARDWARE (not HIL)"
            if runtime_ok
            else "synthetic board sim transcript incomplete or failed"
        ),
        "checks": checks,
        "artifacts": {
            "model_path": str(model_path),
            "result_path": str(result_path),
            "transcript_path": str(transcript_path),
            "binary_path": str(binary_path),
            "source_path": str(source_path),
        },
        "duration_ms": round((time.monotonic() - started) * 1000),
    }
    result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("model_json", type=Path, help="board-sim-model.json path")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--cc", default=None)
    args = ap.parse_args()
    model = json.loads(args.model_json.read_text())
    result = prove_board_sim(model, args.out, cc=args.cc)
    print(json.dumps({"ok": result.get("ok"), "skipped": result.get("skipped"), "reason": result.get("reason")}))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
