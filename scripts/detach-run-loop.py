#!/usr/bin/env python3
"""Detach run-loop.sh into a new session so Cursor/agent shell teardown cannot SIGTERM it.

INTENT: full Yuri campaign chains die mid OpenRouter research when the launching
shell's process group is killed. start_new_session=True is the durable fix.

Usage:
  python3 scripts/detach-run-loop.py <brief.md> <board.json> <label>
Prints the child PID and exits immediately.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: detach-run-loop.py <brief.md> <board.json> <label>", file=sys.stderr)
        return 2
    brief, board, label = sys.argv[1:4]
    root = Path(__file__).resolve().parent.parent
    logp = root / "out" / "logs" / f"{label}-campaign.log"
    logp.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PATH"] = "/opt/homebrew/opt/node@22/bin:" + env.get("PATH", "")
    env.setdefault("PCB_STAGE", "1")
    # GOTCHA: parent shells often leave DESIGN_STAGE_CACHE_DIR from a prior product
    # (seen on OpenFlexure 1413 inheriting `.poseidon-stage-cache`). Force per-label.
    env["DESIGN_STAGE_CACHE_DIR"] = str(root / "out" / f".{label}-stage-cache")
    with open(logp, "a", encoding="utf-8") as fh:
        fh.write(f"\n--- detach-run-loop {time.strftime('%Y-%m-%dT%H:%M:%S')} {label} ---\n")
        fh.flush()
        proc = subprocess.Popen(
            ["bash", str(root / "scripts" / "run-loop.sh"), brief, board, label],
            cwd=str(root),
            env=env,
            stdout=fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    (root / "out" / "logs" / f"{label}-campaign.pid").write_text(str(proc.pid), encoding="utf-8")
    print(proc.pid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
