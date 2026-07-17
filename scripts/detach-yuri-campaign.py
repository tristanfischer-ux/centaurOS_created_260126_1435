#!/usr/bin/env python3
"""Detach yuri-campaign-watch.sh into a new session (survives Cursor shell exit)."""
from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    lock = root / "out" / "logs" / "yuri-campaign.lockdir"
    if lock.exists():
        pid_file = lock / "pid"
        old = pid_file.read_text(encoding="utf-8").strip() if pid_file.exists() else "?"
        # Stale lock if PID dead
        try:
            os.kill(int(old), 0)
            print(f"already locked by live pid {old}")
            return 0
        except (ProcessLookupError, ValueError, PermissionError):
            import shutil
            shutil.rmtree(lock, ignore_errors=True)
    log = root / "out" / "logs" / "yuri-campaign-watch-stdout.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PATH"] = "/opt/homebrew/opt/node@22/bin:" + env.get("PATH", "")
    env.setdefault("PCB_STAGE", "1")
    with open(log, "a", encoding="utf-8") as fh:
        fh.write(f"\n--- detach-yuri-campaign {time.strftime('%Y-%m-%dT%H:%M:%S')} ---\n")
        fh.flush()
        proc = subprocess.Popen(
            ["bash", str(root / "scripts" / "yuri-campaign-watch.sh")],
            cwd=str(root),
            env=env,
            stdout=fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    (root / "out" / "logs" / "yuri-campaign-detach.pid").write_text(
        str(proc.pid), encoding="utf-8"
    )
    print(proc.pid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
