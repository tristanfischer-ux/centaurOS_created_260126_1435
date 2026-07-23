#!/usr/bin/env python3
"""
@file prove-pcb-fix-claims.py
@description Adversarial proveCatch for PCB fixpack13–16 claims against a solo
(or chain) out dir. Fail-closed: exit 2 on any unproven claim.

Usage:
  python3 scripts/prove-pcb-fix-claims.py out/pcb-solo-organoid-fixpack15
  python3 scripts/prove-pcb-fix-claims.py out/pcb-solo-organoid-fixpack15 \\
      --state /path/to/source/state.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

DESIG_RE = re.compile(r"^[A-Z]{1,3}\d+$")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("solo_dir", type=Path, help="pcb-solo (or chain) out dir")
    ap.add_argument(
        "--state",
        type=Path,
        default=None,
        help="optional source state.json for live architecture re-derive",
    )
    ap.add_argument(
        "--repo",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repo root (for jest / chain source / selftest)",
    )
    args = ap.parse_args()
    solo: Path = args.solo_dir.resolve()
    repo: Path = args.repo.resolve()
    fails: list[str] = []
    passes: list[str] = []

    def fail(msg: str) -> None:
        fails.append(msg)
        print(f"FAIL  {msg}")

    def ok(msg: str) -> None:
        passes.append(msg)
        print(f"PASS  {msg}")

    if not solo.is_dir():
        print(f"FAIL  solo dir missing: {solo}")
        return 2
    summary_path = solo / "pcb-solo-summary.json"
    if not summary_path.exists():
        # chain bakes may only have state.json — accept state.pcb snapshot
        state_path = solo / "state.json"
        if not state_path.exists():
            print("FAIL  neither pcb-solo-summary.json nor state.json present")
            return 2
        state = json.loads(state_path.read_text())
        summary = {
            "architecture": (state.get("pcb") or {}).get("architecture") or {},
            "pipeline": (state.get("pcb") or {}).get("pipeline") or {},
            "firmwareProof": (state.get("pcb") or {}).get("firmwareProof") or {},
            "designFitness": (state.get("pcb") or {}).get("designFitness") or {},
        }
    else:
        summary = json.loads(summary_path.read_text())

    # ── A: dual NTC parked ─────────────────────────────────────────────
    wa_req = None
    for b in summary.get("architecture", {}).get("boards", []) or []:
        if b.get("boardId") == "wet_actuation" or "heater" in str(b.get("role") or ""):
            wa_req = b.get("requiredWordIds") or []
    if wa_req is None:
        fail("A: wet_actuation board missing from architecture")
    else:
        if "temperature_sensor_word" in wa_req:
            fail(f"A: temperature_sensor_word still required: {wa_req}")
        else:
            ok("A: temperature_sensor_word not in requiredWordIds")
        if "culture_temperature_probe_word" not in wa_req:
            fail(f"A: culture_temperature_probe_word missing: {wa_req}")
        else:
            ok("A: culture_temperature_probe_word required")

    net = solo / "pcb-project" / "wet_actuation" / "build" / "default.net"
    if not net.exists():
        fail("A: heater netlist missing")
    else:
        t = net.read_text(errors="ignore")
        if "NTCG" in t:
            fail("A: NTCG still in heater netlist")
        else:
            ok("A: no NTCG in heater netlist")
        if "TMP1075" not in t:
            fail("A: TMP1075 missing from heater netlist")
        else:
            ok("A: TMP1075 in heater netlist")

    state_for_derive = args.state
    if state_for_derive and state_for_derive.exists():
        r = subprocess.run(
            [
                "npx",
                "tsx",
                "-e",
                f"""
import {{ readFileSync }} from "fs"
import {{ derivePcbArchitecture }} from "./src/lib/pdf-engine-v2/lib/pcb/pcb-architecture.ts"
const state = JSON.parse(readFileSync({json.dumps(str(state_for_derive))}, "utf8"))
const plan = derivePcbArchitecture(state)
const a = plan.assignments.find(x => x.wordId === "temperature_sensor_word")
console.log(JSON.stringify(a))
""",
            ],
            capture_output=True,
            text=True,
            cwd=str(repo),
        )
        live = None
        for line in (r.stdout or "").splitlines():
            if line.strip().startswith("{"):
                try:
                    live = json.loads(line)
                    break
                except json.JSONDecodeError:
                    pass
        if not live:
            fail(f"A: live derive failed: {(r.stderr or r.stdout)[:240]}")
        elif live.get("placement") != "off_board_module":
            fail(f"A: live placement={live}")
        elif "superseded_by_on_board_digital_temperature_ic" not in (live.get("reasons") or []):
            fail(f"A: wrong reason {live}")
        else:
            ok("A: live derive parks NTC (superseded_by_on_board_digital_temperature_ic)")

    # ── B: real designators ────────────────────────────────────────────
    for board in ("wet_lab_hat", "od_optics", "wet_actuation"):
        npath = solo / "pcb-project" / board / "build" / "default.net"
        if not npath.exists():
            fail(f"B: netlist missing {board}")
            continue
        refs = set(re.findall(r'\(ref "([^"]+)"\)', npath.read_text(errors="ignore")))
        bad = [r for r in refs if not DESIG_RE.match(r)]
        if bad:
            fail(f"B: {board} non-designator refs: {bad}")
        else:
            ok(f"B: {board} {len(refs)} designator refs")

    # ── C: pos union ───────────────────────────────────────────────────
    def parse_pos(path: Path) -> list[str]:
        rows: list[str] = []
        if not path.exists():
            return rows
        for line in path.read_text().splitlines():
            if not line.strip() or line.startswith("#") or line.startswith("##"):
                continue
            parts = line.split()
            if len(parts) >= 6 and DESIG_RE.match(parts[0]):
                rows.append(parts[0])
        return rows

    agg = parse_pos(solo / "pcb" / "positions.csv")
    per = {
        b: parse_pos(solo / "pcb-boards" / b / "pcb" / "positions.csv")
        for b in ("wet_lab_hat", "od_optics", "wet_actuation")
    }
    if not agg:
        fail("C: aggregate positions.csv empty/missing")
    else:
        ok(f"C: aggregate pos rows={len(agg)}")
    sum_per = sum(len(v) for v in per.values())
    if abs(len(agg) - sum_per) > 2:
        fail(f"C: agg {len(agg)} != sum {sum_per}")
    else:
        ok(f"C: agg≈sum ({len(agg)} vs {sum_per})")
    for board, refs_pos in per.items():
        npath = solo / "pcb-project" / board / "build" / "default.net"
        if not npath.exists():
            continue
        refs = set(re.findall(r'\(ref "([^"]+)"\)', npath.read_text(errors="ignore")))
        elec = {r for r in refs if re.match(r"^(U|C|R|J|Q|D|F|L|SW)\d+", r)}
        missing = sorted(elec - set(refs_pos))
        if missing:
            fail(f"C: {board} missing from pos: {missing}")
        else:
            ok(f"C: {board} {len(elec)} electronic refs ⊆ pos")

    # ── D: Tier-1 ──────────────────────────────────────────────────────
    t1 = (summary.get("firmwareProof") or {}).get("tier1") or {}
    elf = Path(t1.get("elfPath") or "")
    if not t1.get("ok"):
        fail(f"D: tier1.ok false: {t1}")
    else:
        ok("D: tier1.ok true")
    if not elf.exists():
        # try canonical path
        elf = solo / "firmware-proof" / "_tier1" / "mcu-project" / "tier1_proof.elf"
    if not elf.exists():
        fail(f"D: elf missing ({elf})")
    else:
        ok(f"D: elf exists ({elf.stat().st_size} B)")
        fo = subprocess.run(["file", str(elf)], capture_output=True, text=True).stdout
        if "ELF" not in fo or "ARM" not in fo:
            fail(f"D: not ARM ELF: {fo.strip()}")
        else:
            ok(f"D: ARM ELF — {fo.strip().split(': ', 1)[-1][:80]}")
    pm = solo / "firmware-proof" / "_tier1" / "mcu-project" / "pinmap.h"
    main_c = solo / "firmware-proof" / "_tier1" / "mcu-project" / "main.c"
    pin_asserts = solo / "firmware-proof" / "_tier1" / "mcu-project" / "pin_asserts.inc"
    if pm.exists():
        pmt = pm.read_text()
        if "PA22" not in pmt or "PA23" not in pmt:
            fail("D: pinmap missing PA22/PA23")
        else:
            ok("D: pinmap PA22/PA23")
        if "typedef struct { char _; } GND" in pmt or "GND_TOKEN" in pmt:
            fail("D: GND TOKEN/typedef present")
        else:
            ok("D: no GND TOKEN")
        if "PA22__" in pmt:
            fail("D: uniquify leak PA22__")
        else:
            ok("D: no uniquify leak")
    else:
        fail("D: pinmap.h missing")
    # GOTCHA (fixpack20): TOKEN static checks live in pin_asserts.inc (copied tree + bind).
    _pin_bind = pin_asserts if pin_asserts.exists() else main_c
    if _pin_bind.exists() and "_forge_pin_" in _pin_bind.read_text():
        ok("D: pin TOKEN static checks (pin_asserts.inc)")
    else:
        fail("D: pin_asserts.inc / main.c missing TOKEN static checks")
    chain = (repo / "scripts" / "serial-design-chain-v2.tsx").read_text()
    if "probeTier1McuCompile" not in chain:
        fail("D: chain missing probeTier1McuCompile")
    else:
        ok("D: chain wires probeTier1McuCompile")

    # ── D2: Tier-2 synthetic board sim (pre-fab) ───────────────────────
    t2 = (summary.get("firmwareProof") or {}).get("tier2") or {}
    if t2.get("skipped") and not t2.get("ok"):
        fail(f"D2: tier2 skipped-without-ok: {t2}")
    elif not t2.get("ok"):
        fail(f"D2: tier2.ok false: {t2.get('reason') or t2}")
    else:
        ok("D2: tier2.ok true (synthetic board sim)")
    model = solo / "firmware-proof" / "_tier2" / "board-sim-model.json"
    transcript = solo / "firmware-proof" / "_tier2" / "board-sim-transcript.txt"
    if not model.exists():
        fail("D2: board-sim-model.json missing")
    else:
        mj = json.loads(model.read_text())
        if mj.get("schema") != "pcb-firmware-board-sim-model/v1":
            fail(f"D2: bad model schema {mj.get('schema')}")
        else:
            ok("D2: board-sim-model schema")
        errs = mj.get("bind_errors") or []
        if errs and not mj.get("skipped"):
            fail(f"D2: model still has bind_errors: {errs[:3]}")
        else:
            ok("D2: model bind_errors empty (or skipped)")
    if not transcript.exists():
        fail("D2: board-sim-transcript.txt missing")
    else:
        tt = transcript.read_text()
        if "CHECK board_sim PASS" not in tt and "CHECK skip_interconnect PASS" not in tt:
            fail(f"D2: transcript missing board_sim PASS: {tt[:200]}")
        else:
            ok("D2: transcript has board_sim/skip PASS")
    if "runTier2BoardSim" not in chain:
        fail("D2: chain missing runTier2BoardSim")
    else:
        ok("D2: chain wires runTier2BoardSim")

    # ── D3: Tier-3 real MCU sim (QEMU Cortex-M semihosting) ────────────
    t3 = (summary.get("firmwareProof") or {}).get("tier3") or {}
    if t3.get("skipped") and not t3.get("ok"):
        # qemu missing is skip — do not invent PASS, but solo with qemu must pass
        fail(f"D3: tier3 skipped (need qemu-system-arm): {t3.get('reason')}")
    elif not t3.get("ok"):
        fail(f"D3: tier3.ok false: {t3.get('reason') or t3}")
    else:
        ok("D3: tier3.ok true (QEMU Cortex-M ELF ran)")
    t3_tr = solo / "firmware-proof" / "_tier3" / "mcu-sim-transcript.txt"
    if t3.get("transcriptPath"):
        t3_tr = Path(t3["transcriptPath"])
    if not t3_tr.exists():
        fail("D3: mcu-sim-transcript.txt missing")
    else:
        tt3 = t3_tr.read_text(errors="ignore")
        if "MCU_SIM|" not in tt3:
            fail(f"D3: transcript missing MCU_SIM| banner: {tt3[:200]}")
        else:
            ok("D3: transcript has MCU_SIM| (from virtual MCU, not Mac puts theatre)")
        if "CHECK mcu_sim PASS" not in tt3:
            fail("D3: transcript missing CHECK mcu_sim PASS")
        else:
            ok("D3: CHECK mcu_sim PASS")
        if "CHECK i2c_read PASS" not in tt3:
            fail("D3: transcript missing CHECK i2c_read PASS (virtual I²C not exercised)")
        else:
            ok("D3: CHECK i2c_read PASS (firmware probed virtual devices)")
        if "CHECK gpio_pad PASS" in tt3 and "virt_i2c_read8" not in (
            (solo / "firmware-proof" / "_tier3" / "_emit" / "mcu-project" / "main.c").read_text()
            if (solo / "firmware-proof" / "_tier3" / "_emit" / "mcu-project" / "main.c").exists()
            else ""
        ):
            # Prefer emit path; also accept tier1 project
            pass
    main_c_candidates = [
        solo / "firmware-proof" / "_tier3" / "_emit" / "mcu-project" / "main.c",
        solo / "firmware-proof" / "_tier1" / "mcu-project" / "main.c",
    ]
    main_c = next((p for p in main_c_candidates if p.exists()), None)
    if not main_c:
        fail("D3: main.c missing for virt_i2c_read8 audit")
    else:
        mt = main_c.read_text()
        if "virt_i2c_read8" not in mt:
            fail("D3: main.c lacks virt_i2c_read8 — still CHECK PASS theatre")
        else:
            ok("D3: main.c calls virt_i2c_read8")
    sim_elf = solo / "firmware-proof" / "_tier3" / "_emit" / "mcu-project" / "tier1_proof_sim.elf"
    if not sim_elf.exists():
        sim_elf = solo / "firmware-proof" / "_tier1" / "mcu-project" / "tier1_proof_sim.elf"
    if not sim_elf.exists():
        fail("D3: tier1_proof_sim.elf missing")
    else:
        fo = subprocess.run(["file", str(sim_elf)], capture_output=True, text=True).stdout
        if "ELF" not in fo or "ARM" not in fo:
            fail(f"D3: sim elf not ARM ELF: {fo.strip()}")
        else:
            ok("D3: sim ELF is ARM")
    if "probeTier3McuSim" not in chain:
        fail("D3: chain missing probeTier3McuSim")
    else:
        ok("D3: chain wires probeTier3McuSim")
    # INTENT (fixpack20): firmware must live in the git main tree, not only under out/.
    fw_tree = repo / "firmware" / "pcb-bringup"
    if not (fw_tree / "main.c").exists() or not (fw_tree / "virt_i2c.c").exists():
        fail("D3: firmware/pcb-bringup missing from git tree (first-class firmware required)")
    else:
        fw_main = (fw_tree / "main.c").read_text(errors="ignore")
        if "virt_i2c_read8" not in fw_main:
            fail("D3: firmware/pcb-bringup/main.c lacks virt_i2c_read8")
        else:
            ok("D3: firmware/pcb-bringup first-class tree present")
        if main_c and "firmware/pcb-bringup" not in main_c.read_text(errors="ignore"):
            fail("D3: emitted main.c not copied from firmware/pcb-bringup (still TS-embedded?)")
        elif main_c:
            ok("D3: emitted main.c sourced from firmware/pcb-bringup")
    # Adversarial: host mock is Mach-O; MCU sim evidence is ARM ELF + MCU_SIM transcript
    host_mock = solo / "firmware-proof" / "_tier2" / "board_sim_native"
    if host_mock.exists():
        hm = subprocess.run(["file", str(host_mock)], capture_output=True, text=True).stdout
        if "Mach-O" not in hm:
            fail(f"D3: expected host-bind mock to be Mach-O, got: {hm.strip()}")
        else:
            ok("D3: host-bind mock is Mach-O (distinct from ARM MCU sim)")

    # ── E: HAT first-pass 110 ──────────────────────────────────────────
    # GOTCHA: pipeline.errors also carries DRC residual notes (USB annular) —
    # those are not placement-grow failures. Only flag placement/grow strings.
    errs = (summary.get("pipeline") or {}).get("errors") or []
    hat_errs = [
        e for e in errs
        if "wet_lab_hat" in e
        and ("placement" in e.lower() or "grew" in e.lower())
    ]
    if hat_errs:
        fail(f"E: HAT placement errors: {hat_errs}")
    else:
        ok("E: zero HAT placement grow errors")
    sight = solo / "pcb-solo-sight.md"
    if sight.exists():
        m = re.search(r"### wet_lab_hat.*?size:\s*(\d+)×(\d+)", sight.read_text(), re.S)
        if not m:
            fail("E: cannot parse HAT size")
        else:
            w, h = int(m.group(1)), int(m.group(2))
            if (w, h) != (110, 110):
                fail(f"E: HAT size {w}×{h}, expected 110×110")
            else:
                ok("E: HAT 110×110")
    if any("grew to" in e and "wet_lab_hat" in e for e in errs):
        fail("E: HAT still grew")
    else:
        ok("E: HAT did not grow")

    # ── E2: OD should also converge without grow when pad-true EW shift works
    od_errs = [e for e in errs if "od_optics" in e and "placement" in e]
    if od_errs:
        fail(f"E2: od_optics still has placement grow/errors: {od_errs}")
    else:
        ok("E2: od_optics zero placement errors")

    # ── F: pipeline selftest ───────────────────────────────────────────
    st = subprocess.run(
        ["python3", str(repo / "src/lib/pdf-engine-v2/lib/pcb/pcb_pipeline_runner.py"), "--selftest"],
        capture_output=True,
        text=True,
    )
    if st.returncode != 0:
        fail(f"F: pipeline --selftest failed: {(st.stderr or st.stdout)[-300:]}")
    else:
        ok("F: pipeline --selftest OK")

    print("\n======== PROOF SUMMARY ========")
    print(f"PASS {len(passes)}  FAIL {len(fails)}")
    if fails:
        print("UNPROVEN:")
        for f in fails:
            print(" -", f)
        return 2
    print("ALL CLAIMS PROVEN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
