#!/usr/bin/env python3
"""Single-flight loop: extract formulas + materials + summaries from papers
we cannot download as open full text (abstract-only / no PDF path).

INTENT: Tristan 2026-07-30 — for paywalled / non-open papers still in the
catalogue, mine the abstract for useful engineering knowledge and a short
summary. Separate lock from fulltext extract-loop so both can run in parallel
on different OpenRouter models.

Usage:
  python3 scripts/ingest/fpk-abstract-extract-loop.py --batch 20 --max-hours 8
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
    with (AUTO / "abstract-extract-loop.log").open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def acquire_lock() -> object | None:
    AUTO.mkdir(parents=True, exist_ok=True)
    lock_path = AUTO / "abstract-extract-loop.lock"
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
    ap.add_argument("--batch", type=int, default=20)
    ap.add_argument("--sleep-sec", type=int, default=12)
    ap.add_argument("--max-hours", type=float, default=8.0)
    ap.add_argument("--idle-stop", type=int, default=6)
    ap.add_argument(
        "--model",
        default="google/gemini-2.5-flash",
        help="OpenRouter model for abstract batches (keep distinct from fulltext GLM)",
    )
    args = ap.parse_args()

    lock_fh = acquire_lock()
    if lock_fh is None:
        return 0
    (AUTO / "abstract-extract.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")
    (AUTO / "abstract-extract-loop.pid").write_text(
        str(os.getpid()) + "\n", encoding="utf-8"
    )

    t0 = time.time()
    idle = 0
    rounds = 0
    while (time.time() - t0) / 3600.0 < args.max_hours:
        rounds += 1
        log(f"abstract-extract round={rounds} limit={args.batch} model={args.model}")
        try:
            proc = subprocess.run(
                [
                    sys.executable,
                    str(EXTRACTOR),
                    "--mode",
                    "abstract-only",
                    "--limit",
                    str(args.batch),
                    "--model",
                    args.model,
                ],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=max(600, args.batch * 60),
            )
            tail = ((proc.stdout or "") + (proc.stderr or ""))[-700:]
            log(f"exit={proc.returncode} {tail.replace(chr(10), ' | ')}")
            if "[extract] mode=abstract-only" in (proc.stdout or "") and "docs=0" in (
                proc.stdout or ""
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
            log(f"idle_stop={args.idle_stop} — done")
            break
        time.sleep(args.sleep_sec)

    log("abstract-extract loop exit")
    try:
        import fcntl

        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)
    except Exception:
        pass
    lock_fh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
