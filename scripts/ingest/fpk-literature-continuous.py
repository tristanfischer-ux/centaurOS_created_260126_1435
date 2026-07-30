#!/usr/bin/env python3
"""Continuous FPK OA fulltext download until Unpaywall-exhaustion.

INTENT: Keep downloading/scraping until there are no remaining DOI candidates
that aren't marked no_oa_pdf_url / download_failed. Paywalled remainder stays
catalogued (abstract + DOI) — that is honest 100% of *resolvable OA*, not
magical access to IEEE paywalls.

Usage:
  python3 scripts/ingest/fpk-literature-continuous.py
  python3 scripts/ingest/fpk-literature-continuous.py --batch 50 --max-idle-batches 3
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
AUTO = TWIN / "_autonomous"
DOWNLOADER = ROOT / "scripts/ingest/download-fpk-oa-fulltext.py"
EXTRACTOR = ROOT / "scripts/ingest/extract-fpk-literature-claims.py"


def iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    AUTO.mkdir(parents=True, exist_ok=True)
    line = f"[{iso()}] {msg}"
    print(line, flush=True)
    with (AUTO / "literature-continuous.log").open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def run_batch(limit: int) -> dict:
    proc = subprocess.run(
        [sys.executable, str(DOWNLOADER), "--limit", str(limit)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=3600,
    )
    summary = {"exit": proc.returncode, "ok": 0, "fail": 0, "processed": 0}
    art = TWIN / "JLR-FE-FRONT-FPK-FULLTEXT-DOWNLOAD.json"
    if art.is_file():
        try:
            summary.update(json.loads(art.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            pass
    # also scrape stdout for OK counts
    out = (proc.stdout or "") + (proc.stderr or "")
    summary["stdout_tail"] = out[-800:]
    return summary


def run_extract(limit: int) -> dict:
    proc = subprocess.run(
        [sys.executable, str(EXTRACTOR), "--limit", str(limit)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=1800,
    )
    return {
        "exit": proc.returncode,
        "stdout_tail": ((proc.stdout or "") + (proc.stderr or ""))[-800:],
    }


def prove() -> dict:
    proc = subprocess.run(
        [sys.executable, str(DOWNLOADER), "--prove"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    art = TWIN / "JLR-FE-FRONT-FPK-FULLTEXT-PROOF.json"
    if art.is_file():
        try:
            return json.loads(art.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"useful": False, "exit": proc.returncode}


def acquire_lock() -> object | None:
    """Single continuous downloader — avoid OpenAlex 429 storms from twins."""
    AUTO.mkdir(parents=True, exist_ok=True)
    lock_path = AUTO / "literature-continuous.lock"
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
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument(
        "--extract-batch",
        type=int,
        default=0,
        help="0 = download-only (preferred; extract-loop owns LLM extract)",
    )
    ap.add_argument(
        "--max-idle-batches",
        type=int,
        default=3,
        help="Stop after N consecutive batches with ok==0 (OA exhausted)",
    )
    ap.add_argument("--sleep-sec", type=int, default=30)
    ap.add_argument("--max-hours", type=float, default=10.0)
    args = ap.parse_args()

    lock_fh = acquire_lock()
    if lock_fh is None:
        return 0
    (AUTO / "literature-continuous.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")
    (AUTO / "fulltext.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")

    t0 = time.time()
    idle = 0
    batches = 0
    total_ok = 0
    stop_reason = "max_hours"
    while True:
        elapsed_h = (time.time() - t0) / 3600.0
        if elapsed_h >= args.max_hours:
            log(f"STOP max_hours={args.max_hours}")
            stop_reason = "max_hours"
            break
        batches += 1
        log(f"download batch={batches} limit={args.batch}")
        try:
            summary = run_batch(args.batch)
        except subprocess.TimeoutExpired:
            log("batch TIMEOUT — treat as fail, continue")
            summary = {"ok": 0, "fail": args.batch, "exit": 124}
        except Exception as exc:  # noqa: BLE001
            log(f"batch ERROR {exc}")
            summary = {"ok": 0, "fail": 0, "exit": 1}
        ok = int(summary.get("ok") or 0)
        fail = int(summary.get("fail") or 0)
        total_ok += ok
        log(f"batch done ok={ok} fail={fail} total_ok={total_ok}")
        # Extract is owned by fpk-extract-loop.py (avoids 30min LLM timeouts here).
        if args.extract_batch > 0:
            try:
                ex = run_extract(args.extract_batch)
                log(f"extract exit={ex.get('exit')}")
            except Exception as exc:  # noqa: BLE001
                log(f"extract ERROR {exc}")
        if ok == 0:
            idle += 1
            log(f"idle_batches={idle}/{args.max_idle_batches}")
            if idle >= args.max_idle_batches:
                log("STOP OA exhaustion (consecutive zero-ok batches)")
                stop_reason = "oa_exhaustion"
                break
        else:
            idle = 0
        time.sleep(args.sleep_sec)

    stats = prove()
    (AUTO / "literature-continuous-final.json").write_text(
        json.dumps(
            {
                "finished_at": iso(),
                "batches": batches,
                "total_ok": total_ok,
                "stop_reason": stop_reason,
                "proof": stats,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    log(
        f"DONE fulltext_ge_5k={stats.get('fulltext_ge_5k')} useful={stats.get('useful')} "
        f"stop={stop_reason}"
    )
    _ = lock_fh
    return 0 if stats.get("useful") else 1


if __name__ == "__main__":
    raise SystemExit(main())
