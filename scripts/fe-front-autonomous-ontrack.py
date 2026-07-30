#!/usr/bin/env python3
"""Frequent plan on-track auditor (real timer loop — not an LLM).

INTENT: Every INTERVAL seconds, verify autonomous FPK work is still advancing
the council-revised plan. If stalled, write wake_signal + STATUS + optional
resume commands. Complements the 5-min watchdog with a tighter progress check.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
AUTO = TWIN / "_autonomous"
HB = AUTO / "heartbeat.json"
LOG = AUTO / "ontrack.log"
STATUS = AUTO / "STATUS.md"
WAKE = AUTO / "wake_signal"
MATRIX = AUTO / "requirements-matrix.json"
STATE = TWIN / "state.json"
PLAN = ROOT / "docs/plans/JLR-FE-FRONT-FPK-AUTONOMOUS-1-9-2026-07-29.md"

INTERVAL = int(os.environ.get("ONTRACK_INTERVAL_SEC", "120"))  # every 2 min
STALL_SEC = int(os.environ.get("ONTRACK_STALL_SEC", "300"))  # 5 min no progress


def iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    AUTO.mkdir(parents=True, exist_ok=True)
    line = f"[{iso()}] {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def read_json(p: Path) -> dict:
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def snapshot() -> dict:
    state = read_json(STATE)
    matrix = read_json(MATRIX)
    hb = read_json(HB)
    claims = 0
    pending = 0
    fulltext_docs = 0
    pdfs_on_disk = 0
    db = Path.home() / ".forge-truth/forge-truth.db"
    if db.exists():
        try:
            con = sqlite3.connect(str(db))
            claims = con.execute("SELECT COUNT(*) FROM fpk_extracted_claims").fetchone()[0]
            pending = con.execute(
                """SELECT COUNT(*) FROM pretraining_spec_documents d
                   WHERE d.source_type='fpk_literature'
                   AND d.id NOT IN (SELECT DISTINCT document_id FROM fpk_extracted_claims)"""
            ).fetchone()[0]
            fulltext_docs = con.execute(
                """SELECT COUNT(*) FROM pretraining_spec_documents
                   WHERE source_type='fpk_literature'
                     AND extraction_status='fulltext'
                     AND length(COALESCE(extracted_full_text,'')) >= 5000"""
            ).fetchone()[0]
            con.close()
        except Exception as e:
            log(f"db_err {e}")
    pdf_dir = Path.home() / ".forge-truth/fpk-pdfs"
    if pdf_dir.is_dir():
        pdfs_on_disk = len(list(pdf_dir.glob("*.pdf")))
    topo = state.get("fpkTopology") or {}
    reqs = {r["id"]: r.get("status") for r in (matrix.get("requirements") or [])}
    progress = {
        "t": int(time.time()),
        "claims": claims,
        "pending_docs": pending,
        "fulltext_docs": fulltext_docs,
        "pdfs_on_disk": pdfs_on_disk,
        "topo_routed": topo.get("routed_count") or 0,
        "topo_required": topo.get("required_count") or 17,
        "physics_nodes": ((state.get("fpkPhysicsTree") or {}).get("coverage") or {}).get(
            "node_count"
        ),
        "ship_ok": state.get("ship_ok"),
        "hb_phase": hb.get("phase"),
        "hb_step": hb.get("step"),
        "hb_age": int(time.time()) - int(hb.get("updated_at_unix") or 0),
        "reqs": reqs,
        "watchdog_alive": _pid_alive(AUTO / "watchdog.pid"),
        "fulltext_alive": _pid_alive(AUTO / "fulltext.pid"),
        "extract_alive": _pid_alive(AUTO / "extract.pid"),
    }
    return progress


def _pid_alive(pidfile: Path) -> bool:
    if not pidfile.exists():
        return False
    try:
        pid = int(pidfile.read_text().strip())
    except Exception:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def write_progress(p: dict) -> None:
    (AUTO / "ontrack_snapshot.json").write_text(json.dumps(p, indent=2), encoding="utf-8")
    # monotonic progress key
    key = f"{p.get('claims')}|{p.get('topo_routed')}|{p.get('physics_nodes')}|{p.get('hb_step')}"
    (AUTO / "ontrack_progress_key.txt").write_text(key + "\n", encoding="utf-8")


def last_progress_key() -> str:
    p = AUTO / "ontrack_progress_key.txt"
    return p.read_text().strip() if p.exists() else ""


def ensure_watchdog() -> None:
    if _pid_alive(AUTO / "watchdog.pid"):
        return
    log("WATCHDOG_DEAD → relaunch")
    env = os.environ.copy()
    env["WATCHDOG_INTERVAL_SEC"] = "300"
    env["WATCHDOG_STALE_SEC"] = "600"
    with (AUTO / "watchdog.stdout").open("a") as out:
        proc = subprocess.Popen(
            ["bash", str(ROOT / "scripts/fe-front-autonomous-watchdog.sh")],
            cwd=str(ROOT),
            env=env,
            stdout=out,
            stderr=out,
            start_new_session=True,
        )
    (AUTO / "watchdog.pid").write_text(str(proc.pid) + "\n", encoding="utf-8")


def ensure_ensure_loop() -> None:
    """10-min re-ensure loop — survives agent session death."""
    if _pid_alive(AUTO / "ensure-loop.pid"):
        return
    log("ENSURE_LOOP_DEAD → relaunch")
    script = str(ROOT / "scripts/fe-front-autonomous-ensure.sh")
    cmd = (
        f'while true; do sleep 600; "{script}" '
        f'>>"{AUTO}/ensure-loop.log" 2>&1 || true; done'
    )
    with (AUTO / "ensure-loop.log").open("a") as out:
        proc = subprocess.Popen(
            ["bash", "-c", cmd],
            cwd=str(ROOT),
            stdout=out,
            stderr=out,
            start_new_session=True,
        )
    (AUTO / "ensure-loop.pid").write_text(str(proc.pid) + "\n", encoding="utf-8")


def ensure_fulltext() -> None:
    """Keep continuous OA download alive — not a thrashing one-shot --limit 40."""
    if _pid_alive(AUTO / "literature-continuous.pid") or _pid_alive(AUTO / "fulltext.pid"):
        return
    log("FULLTEXT_IDLE → relaunch fpk-literature-continuous.py")
    with (TWIN / "_fpk_literature_continuous.stdout").open("a") as out:
        proc = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "scripts/ingest/fpk-literature-continuous.py"),
                "--batch",
                "25",
                "--extract-batch",
                "80",
                "--max-idle-batches",
                "4",
                "--max-hours",
                "10",
                "--sleep-sec",
                "30",
            ],
            cwd=str(ROOT),
            stdout=out,
            stderr=out,
            start_new_session=True,
        )
    (AUTO / "literature-continuous.pid").write_text(str(proc.pid) + "\n", encoding="utf-8")
    (AUTO / "fulltext.pid").write_text(str(proc.pid) + "\n", encoding="utf-8")


def ensure_extract() -> None:
    if _pid_alive(AUTO / "extract.pid"):
        return
    snap = snapshot()
    if (snap.get("pending_docs") or 0) <= 0:
        return
    log(f"EXTRACT_IDLE pending={snap.get('pending_docs')} → relaunch --limit 80")
    with (TWIN / "_fpk_literature_extract.log").open("a") as out:
        proc = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "scripts/ingest/extract-fpk-literature-claims.py"),
                "--limit",
                "80",
            ],
            cwd=str(ROOT),
            stdout=out,
            stderr=out,
            start_new_session=True,
        )
    (AUTO / "extract.pid").write_text(str(proc.pid) + "\n", encoding="utf-8")


def append_status(msg: str) -> None:
    with STATUS.open("a", encoding="utf-8") as f:
        f.write(f"\n## ONTRACK {iso()}\n- {msg}\n")


def main_loop() -> int:
    AUTO.mkdir(parents=True, exist_ok=True)
    (AUTO / "ontrack.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")
    log(f"ontrack start interval={INTERVAL}s stall={STALL_SEC}s plan={PLAN.name}")
    last_change = time.time()
    last_key = last_progress_key()
    stall_count = 0

    while True:
        try:
            ensure_watchdog()
            ensure_ensure_loop()
            ensure_fulltext()
            ensure_extract()
            p = snapshot()
            write_progress(p)
            key = (
                f"{p.get('claims')}|{p.get('topo_routed')}|{p.get('physics_nodes')}|"
                f"{p.get('hb_step')}"
            )
            if key != last_key:
                last_key = key
                last_change = time.time()
                stall_count = 0
                log(
                    f"PROGRESS claims={p['claims']} pending={p['pending_docs']} "
                    f"topo={p['topo_routed']}/{p['topo_required']} hb_age={p['hb_age']}s "
                    f"wd={p['watchdog_alive']} ex={p['extract_alive']} phase={p['hb_phase']}"
                )
            else:
                stalled_for = int(time.time() - last_change)
                log(
                    f"CHECK claims={p['claims']} pending={p['pending_docs']} "
                    f"topo={p['topo_routed']}/{p['topo_required']} stalled_for={stalled_for}s "
                    f"wd={p['watchdog_alive']} ex={p['extract_alive']}"
                )
                if stalled_for >= STALL_SEC:
                    stall_count += 1
                    WAKE.write_text(
                        json.dumps(
                            {
                                "reason": "ontrack_stall",
                                "stalled_for_s": stalled_for,
                                "stall_count": stall_count,
                                "snapshot": p,
                                "at": iso(),
                                "resume": [
                                    "REQ-2 literature extract / quality filter",
                                    "wire claims into fpk_physics_tree claim_refs",
                                    "OA PDF harvest if still OPEN",
                                    "P1b safety stub if empty",
                                ],
                            },
                            indent=2,
                        ),
                        encoding="utf-8",
                    )
                    append_status(
                        f"STALL {stalled_for}s count={stall_count} — wake_signal written; "
                        f"claims={p['claims']} topo={p['topo_routed']}/{p['topo_required']}"
                    )
                    log(f"STALL wake written count={stall_count}")
                    if stall_count >= 3:
                        append_status(
                            "STALLED — 3 stalls; keep supervisors alive; need model unstick or human"
                        )
                        hb = read_json(HB)
                        hb.update(
                            {
                                "state": "STALLED",
                                "updated_at": iso(),
                                "updated_at_unix": int(time.time()),
                                "note": "ontrack: 3 stalls",
                            }
                        )
                        HB.write_text(json.dumps(hb, indent=2), encoding="utf-8")

            off = []
            if not p.get("watchdog_alive"):
                off.append("watchdog_dead")
            if (p.get("pending_docs") or 0) > 100 and not p.get("extract_alive"):
                off.append("extract_should_run")
            if (p.get("topo_routed") or 0) < (p.get("topo_required") or 17):
                off.append("topology_incomplete")
            if p.get("reqs", {}).get("REQ-2") == "OPEN":
                off.append("REQ-2_open")
            (AUTO / "ontrack_gaps.json").write_text(
                json.dumps({"at": iso(), "gaps": off, "snapshot": p}, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            # NEVER die — log and keep the timer loop alive
            log(f"LOOP_ERROR {type(e).__name__}: {e}")
            append_status(f"ontrack LOOP_ERROR {type(e).__name__}: {e} — continuing")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        AUTO.mkdir(parents=True, exist_ok=True)
        ensure_watchdog()
        ensure_ensure_loop()
        ensure_extract()
        p = snapshot()
        write_progress(p)
        print(json.dumps(p, indent=2))
        raise SystemExit(0)
    try:
        raise SystemExit(main_loop())
    except KeyboardInterrupt:
        log("ontrack stop")
        raise SystemExit(0)
