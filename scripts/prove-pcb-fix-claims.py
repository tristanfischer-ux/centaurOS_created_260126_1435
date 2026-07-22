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
    if main_c.exists() and "_forge_pin_" in main_c.read_text():
        ok("D: main.c TOKEN static checks")
    else:
        fail("D: main.c missing TOKEN static checks")
    chain = (repo / "scripts" / "serial-design-chain-v2.tsx").read_text()
    if "probeTier1McuCompile" not in chain:
        fail("D: chain missing probeTier1McuCompile")
    else:
        ok("D: chain wires probeTier1McuCompile")

    # ── E: HAT first-pass 110 ──────────────────────────────────────────
    errs = (summary.get("pipeline") or {}).get("errors") or []
    hat_errs = [e for e in errs if "wet_lab_hat" in e]
    if hat_errs:
        fail(f"E: HAT placement errors: {hat_errs}")
    else:
        ok("E: zero HAT placement errors")
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
