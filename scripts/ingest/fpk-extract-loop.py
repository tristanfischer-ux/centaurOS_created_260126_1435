#!/usr/bin/env python3
"""Single-flight looping claim extract for FPK fulltext backlog.

INTENT: Drain fulltext_without_claims without competing with overnight or
spawning N parallel LLM extractors (OpenRouter thrash + TimeoutExpired deaths).
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
AUTO = TWIN / "_autonomous"
EXTRACTOR = ROOT / "scripts/ingest/extract-fpk-literature-claims.py"


def iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    AUTO.mkdir(parents=True, exist_ok=True)
    line = f"[{iso()}] {msg}"
    print(line, flush=True)
    with (AUTO / "extract-loop.log").open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def acquire_lock() -> object | None:
    AUTO.mkdir(parents=True, exist_ok=True)
    lock_path = AUTO / "extract-loop.lock"
    fh = lock_path.open("a+", encoding="utf-8")
    try:
        import fcntl

        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        log("already running (lock held) — exit 0")
        return None
    fh.seek(0)
    fh.truncate()
    fh.write(f"{os.getpid()}\n")
    fh.flush()
    return fh


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=12)
    ap.add_argument("--sleep-sec", type=int, default=20)
    ap.add_argument("--max-hours", type=float, default=10.0)
    ap.add_argument("--idle-stop", type=int, default=5)
    args = ap.parse_args()

    lock_fh = acquire_lock()
    if lock_fh is None:
        return 0
    (AUTO / "extract.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")
    (AUTO / "extract-loop.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")

    t0 = time.time()
    idle = 0
    rounds = 0
    while (time.time() - t0) / 3600.0 < args.max_hours:
        rounds += 1
        log(f"extract round={rounds} limit={args.batch}")
        try:
            proc = subprocess.run(
                [sys.executable, str(EXTRACTOR), "--limit", str(args.batch)],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=max(600, args.batch * 90),
            )
            tail = ((proc.stdout or "") + (proc.stderr or ""))[-600:]
            log(f"exit={proc.returncode} {tail.replace(chr(10), ' | ')}")
            # Heuristic: no docs processed → idle
            if "0 documents to process" in (proc.stdout or "") or (
                proc.returncode == 0 and "documents to process" in (proc.stdout or "")
                and "[extract] 0 documents" in (proc.stdout or "")
            ):
                idle += 1
            elif proc.returncode != 0:
                idle += 1
            else:
                idle = 0
        except subprocess.TimeoutExpired:
            log("TIMEOUT — continue next round")
            idle += 1
        except Exception as exc:  # noqa: BLE001
            log(f"ERROR {exc}")
            idle += 1
        if idle >= args.idle_stop:
            log(f"STOP idle={idle}")
            break
        time.sleep(args.sleep_sec)

    log(f"DONE rounds={rounds}")
    _ = lock_fh
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
