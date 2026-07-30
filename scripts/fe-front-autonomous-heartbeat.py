#!/usr/bin/env python3
"""Write / update autonomous heartbeat + STATUS line for the 10-min watchdog."""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTO = ROOT / "out/formula-e-front-mgu-20260729-1432/_autonomous"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", required=True)
    ap.add_argument("--state", default="RUNNING")
    ap.add_argument("--step", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--next", dest="next_step", default="")
    args = ap.parse_args()
    AUTO.mkdir(parents=True, exist_ok=True)
    now = time.time()
    iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    hb = {
        "updated_at": iso,
        "updated_at_unix": int(now),
        "phase": args.phase,
        "state": args.state,
        "step": args.step,
        "note": args.note,
    }
    (AUTO / "heartbeat.json").write_text(json.dumps(hb, indent=2), encoding="utf-8")
    if args.next_step:
        (AUTO / "next_step.txt").write_text(args.next_step.strip() + "\n", encoding="utf-8")
    status = AUTO / "STATUS.md"
    line = f"- `{iso}` phase={args.phase} state={args.state} step={args.step} {args.note}\n"
    if not status.exists():
        status.write_text(
            "# FPK autonomous 1–9 STATUS\n\n"
            f"Started {iso}\n\n## Log\n\n",
            encoding="utf-8",
        )
    with status.open("a", encoding="utf-8") as f:
        f.write(line)
    # clear wake if we are alive
    wake = AUTO / "wake_signal"
    if wake.exists() and args.state == "RUNNING":
        wake.unlink(missing_ok=True)
    print(json.dumps(hb))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
