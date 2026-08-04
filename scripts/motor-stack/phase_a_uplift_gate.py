#!/usr/bin/env python3
"""Phase A uplift gate — machine-check progress against council-amended plan.

Exit 0 only if W0 truth + Jack spine artefacts are present and coherent.
Does not mint ship_ok. Safe to run in CI / workflow after each wave.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    # W0 twin stamps
    q = json.loads((twin / "state.json").read_text())["orchestratorContract"]["quantities"]
    mean = float(q["last_sign_consistent_kit_case_fe_mean_nm"]["value"])
    arch = float(q["architecture_duty_shaft_torque_nm"]["value"])
    bind = float(q["binding_duty_shaft_torque_nm"]["value"])
    ck("fe_mean_path_b", abs(mean - 122.099939) < 0.01, str(mean))
    ck("arch_duty", abs(arch - 104.098914) < 0.01, str(arch))
    ck("bind_duty", abs(bind - 125.214912) < 0.01, str(bind))
    ck("ship_ok_false", json.loads((twin / "state.json").read_text()).get("ship_ok") is False)
    ck(
        "product_basis",
        q["mgu_fe_shaft_torque_nm"]["basis"] == "option_screen_product_not_kit_case_fe",
    )

    # bar-b freshness
    barb = twin / "bar-b-register-freshness.json"
    ck("barb_report", barb.is_file())
    if barb.is_file():
        br = json.loads(barb.read_text())
        ck("barb_ok", br.get("ok") is True, str(br.get("stale_count")))
        la = br.get("live_artefacts") or {}
        ck("barb_em_source", la.get("em_source") == "PATH_B_DEC009", str(la.get("em_source")))
        ck("barb_mean", abs(float(la.get("mean_tq") or 0) - 122.099939) < 0.01)

    # jack pack spine
    jack = twin / "_motor_stack" / "jack_em_pack"
    for name in (
        "00-verdict-one-pager.png",
        "00b-open-by-design.png",
        "00c-how-to-read-pack.png",
        "01-dual-torque-bars.png",
        "06-thermal-duty-storyboard.png",
        "07-pcb-honesty-sheet.png",
        "08-system-block-diagram.png",
        "09-inverter-mass-budget.png",
        "FE-FRONT-PATH-B-EM-HONESTY-PACK.pdf",
    ):
        ck(f"jack_{name}", (jack / name).is_file(), str(jack / name))

    # tracker addendum
    tr = (REPO / "docs/plans/JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md").read_text()
    ck("tracker_addendum", "ADDENDUM 2026-08-04" in tr and "122.100" in tr)

    # coherence
    r = subprocess.run(
        [
            sys.executable,
            str(REPO / "scripts/lib/check_deliverable_coherence.py"),
            "--twin",
            str(twin),
            "--enforce",
        ],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    ck("coherence", r.returncode == 0, (r.stdout or r.stderr)[-200:])

    if fails:
        print("phase_a_uplift_gate FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("phase_a_uplift_gate: OK")
    print(
        json.dumps(
            {
                "mean": mean,
                "arch": arch,
                "bind": bind,
                "mean_over_arch": mean / arch,
                "mean_over_bind": mean / bind,
                "ship_ok": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
