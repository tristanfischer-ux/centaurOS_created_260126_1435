#!/usr/bin/env python3
"""Spawn a long-lived worker in a new session so Cursor/shell teardown cannot reap it.

Usage:
  python3 scripts/fe-front-spawn-detached.py --pid-file PATH --log PATH -- CMD [ARGS...]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pid-file", type=Path, required=True)
    ap.add_argument("--log", type=Path, required=True)
    ap.add_argument("--cwd", type=Path, default=None)
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    args = ap.parse_args()
    cmd = list(args.cmd)
    if cmd and cmd[0] == "--":
        cmd = cmd[1:]
    if not cmd:
        print("missing command after --", file=sys.stderr)
        return 2
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.pid_file.parent.mkdir(parents=True, exist_ok=True)
    log_fh = args.log.open("a", encoding="utf-8")
    env = os.environ.copy()
    proc = subprocess.Popen(
        cmd,
        cwd=str(args.cwd) if args.cwd else None,
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
        env=env,
    )
    args.pid_file.write_text(str(proc.pid) + "\n", encoding="utf-8")
    print(proc.pid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
