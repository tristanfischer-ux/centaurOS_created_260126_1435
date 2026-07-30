#!/usr/bin/env python3
"""P7 — stamp state.fpkExcelLivePlan + optional Excel rebuild."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from fpk_excel_live_plan import stamp_excel_live_plan  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--twin",
        type=Path,
        default=ROOT / "out" / "formula-e-front-mgu-20260729-1432",
    )
    ap.add_argument(
        "--rebuild-excel",
        action="store_true",
        help="Run build-excel-export.py after stamping plan",
    )
    args = ap.parse_args()
    if not (args.twin / "state.json").is_file():
        print(f"missing {args.twin / 'state.json'}", file=sys.stderr)
        return 1

    out = stamp_excel_live_plan(args.twin)
    rebuilt = False
    excel_path = None
    if args.rebuild_excel and out.get("has_fpk_power_trace"):
        excel_script = ROOT / "scripts" / "build-excel-export.py"
        dossier = args.twin / "dossier.xlsx"
        mtime_before = dossier.stat().st_mtime if dossier.is_file() else 0.0
        proc = subprocess.run(
            [sys.executable, str(excel_script), str(args.twin)],
            capture_output=True,
            text=True,
            check=False,
        )
        if dossier.is_file() and dossier.stat().st_mtime > mtime_before:
            rebuilt = True
            excel_path = str(dossier)
            out["excel_rebuilt"] = True
            out["excel_path"] = excel_path
            out["excel_exit_code"] = proc.returncode
        elif proc.returncode != 0:
            print(proc.stderr or proc.stdout, file=sys.stderr)
            out["excel_rebuild_error"] = proc.returncode

    print(json.dumps(out, indent=2))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
