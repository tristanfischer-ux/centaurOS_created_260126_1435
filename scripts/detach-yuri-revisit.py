#!/usr/bin/env python3
"""Detach the Yuri REVISIT watch (unfinished products → ≥9 before new work)."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "out" / "logs" / "yuri-revisit-watch.log"
SCRIPT = ROOT / "scripts" / "yuri-revisit-watch.sh"


def main() -> int:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    # INTENT: new session so Cursor agent shell teardown cannot SIGTERM the queue.
    # GOTCHA: the watch script already tees to LOG — do NOT also redirect stdout
    # here or every line doubles in the log.
    proc = subprocess.Popen(
        ["bash", str(SCRIPT)],
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        env=os.environ.copy(),
    )
    print(proc.pid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
