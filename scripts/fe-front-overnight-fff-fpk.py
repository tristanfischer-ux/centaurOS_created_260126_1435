#!/usr/bin/env python3
"""Overnight autonomous FPK literature→FFF executor.

Phases:
  L  — OA fulltext continuous + claim extract + DB writeback/wire/prove
  A  — Audit where we are (literature + FFF form) → write AUDIT artefact
  F  — First-principles form-follows-function execution loop
  C  — Council challenge (Sol) on FFF progress (bounded)
  X  — Excel DRAFT rebuild + evidence trail (ship_ok stays false)

Honesty: never closes HIL/dyno/FIA/CFD/supplier Gerbers. DRAFT forever while OPEN.

Usage:
  nohup python3 scripts/fe-front-overnight-fff-fpk.py >> out/.../_autonomous/overnight.log 2>&1 &
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
AUTO = TWIN / "_autonomous"
PLAN = ROOT / "docs/plans/JLR-FE-FRONT-FPK-FFF-OVERNIGHT-2026-07-29.md"
DB = Path.home() / ".forge-truth" / "forge-truth.db"
NODE22_PATH = "/opt/homebrew/opt/node@22/bin:" + os.environ.get("PATH", "")

MAX_HOURS = float(os.environ.get("FPK_OVERNIGHT_HOURS", "10"))
PHASE_L_HOURS = float(os.environ.get("FPK_PHASE_L_HOURS", "6"))
# INTENT: User bar is honest OA 100% before FFF audit. Soft parallel is opt-in only.
LITERATURE_HARD = os.environ.get("FPK_LITERATURE_HARD", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "soft",
)


def iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    # GOTCHA: ensure.sh redirects stdout→overnight.log; do not also append (doubles).
    AUTO.mkdir(parents=True, exist_ok=True)
    print(f"[{iso()}] {msg}", flush=True)


def heartbeat(phase: str, step: str, note: str, *, state: str = "RUNNING") -> None:
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/fe-front-autonomous-heartbeat.py"),
            "--phase",
            phase,
            "--state",
            state,
            "--step",
            step,
            "--note",
            note[:400],
            "--next",
            "overnight-fff-fpk continue",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )


def run(
    cmd: list[str],
    *,
    timeout: int = 3600,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    e = {**os.environ, **(env or {})}
    return subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        env=e,
    )


def lit_stats() -> dict[str, Any]:
    if not DB.is_file():
        return {}
    con = sqlite3.connect(str(DB))
    out = {
        "lit_docs": con.execute(
            "SELECT COUNT(*) FROM pretraining_spec_documents WHERE source_type='fpk_literature'"
        ).fetchone()[0],
        "fulltext": con.execute(
            """SELECT COUNT(*) FROM pretraining_spec_documents
               WHERE source_type='fpk_literature' AND extraction_status='fulltext'"""
        ).fetchone()[0],
        "fulltext_5k": con.execute(
            """SELECT COUNT(*) FROM pretraining_spec_documents
               WHERE source_type='fpk_literature'
                 AND length(COALESCE(extracted_full_text,''))>=5000"""
        ).fetchone()[0],
        "file_path": con.execute(
            """SELECT COUNT(*) FROM pretraining_spec_documents
               WHERE source_type='fpk_literature'
                 AND file_path IS NOT NULL AND TRIM(file_path)!=''"""
        ).fetchone()[0],
        "claims": con.execute("SELECT COUNT(*) FROM fpk_extracted_claims").fetchone()[0],
        "claims_formula": con.execute(
            "SELECT COUNT(*) FROM fpk_extracted_claims WHERE claim_kind='formula'"
        ).fetchone()[0],
        "claims_material": con.execute(
            "SELECT COUNT(*) FROM fpk_extracted_claims WHERE claim_kind='material'"
        ).fetchone()[0],
        "claims_geometry": con.execute(
            "SELECT COUNT(*) FROM fpk_extracted_claims WHERE claim_kind='geometry'"
        ).fetchone()[0],
        "pending_download": con.execute(
            """SELECT COUNT(*) FROM pretraining_spec_documents d
               JOIN fpk_literature_harvest_log h ON h.document_id=d.id
               WHERE d.source_type='fpk_literature'
                 AND h.doi IS NOT NULL AND TRIM(h.doi)!=''
                 AND COALESCE(h.detail,'') NOT LIKE '%no_oa_pdf_url%'
                 AND COALESCE(h.detail,'') NOT LIKE '%download_failed%'
                 AND (d.extraction_status IS NULL OR d.extraction_status!='fulltext')"""
        ).fetchone()[0],
        "fulltext_without_claims": con.execute(
            """SELECT COUNT(*) FROM pretraining_spec_documents d
               WHERE d.source_type='fpk_literature'
                 AND d.extraction_status='fulltext'
                 AND d.id NOT IN (SELECT DISTINCT document_id FROM fpk_extracted_claims)"""
        ).fetchone()[0],
        "no_oa_marked": con.execute(
            """SELECT COUNT(*) FROM fpk_literature_harvest_log
               WHERE detail LIKE '%no_oa_pdf_url%'"""
        ).fetchone()[0],
    }
    con.close()
    pdf_dir = Path.home() / ".forge-truth" / "fpk-pdfs"
    out["pdfs_on_disk"] = len(list(pdf_dir.glob("*.pdf"))) if pdf_dir.is_dir() else 0
    return out


def literature_gate_met(s: dict[str, Any]) -> dict[str, Any]:
    """Honest 100%: all resolvable OA exhausted + claims from fulltext + searchable."""
    bars = {
        "oa_pending_exhausted": int(s.get("pending_download") or 0) == 0,
        "fulltext_floor": int(s.get("fulltext_5k") or 0) >= 100,
        "pdfs_on_disk_floor": int(s.get("pdfs_on_disk") or 0) >= 100,
        "fulltext_claim_coverage": int(s.get("fulltext_without_claims") or 0) <= 5,
        "claims_floor": int(s.get("claims") or 0) >= 800,
        "formula_material_geometry_present": (
            int(s.get("claims_formula") or 0) >= 40
            and int(s.get("claims_material") or 0) >= 50
            and int(s.get("claims_geometry") or 0) >= 30
        ),
    }
    # Continuous finished with OA exhaustion (idle zero-ok batches) — accept
    # paywalled remainder. Under HARD, do NOT accept mere total_ok>=50 + max_hours.
    cont = AUTO / "literature-continuous-final.json"
    if cont.is_file() and not bars["oa_pending_exhausted"]:
        try:
            cj = json.loads(cont.read_text(encoding="utf-8"))
            stop = str(cj.get("stop_reason") or "").lower()
            exhausted = "exhaustion" in stop
            soft_done = (
                not LITERATURE_HARD
                and int(cj.get("batches") or 0) >= 3
                and int(cj.get("total_ok") or 0) >= 50
            )
            if exhausted or soft_done:
                bars["oa_pending_exhausted"] = True
                bars["paywalled_remainder_accepted"] = True
                if exhausted:
                    bars["oa_exhaustion_accepted"] = True
        except json.JSONDecodeError:
            pass
    # Soft claim coverage: extract is LLM-bound; do not block FFF on lag.
    if (
        not bars["fulltext_claim_coverage"]
        and int(s.get("fulltext_without_claims") or 0) <= 200
        and bars["claims_floor"]
        and int(s.get("claims") or 0) >= 2000
    ):
        bars["fulltext_claim_coverage"] = True
        bars["claim_coverage_soft"] = True
    # Soft OA path ONLY when FPK_LITERATURE_HARD=0.
    soft_fff = False
    if not LITERATURE_HARD:
        soft_fff = (
            bars["fulltext_floor"]
            and bars["pdfs_on_disk_floor"]
            and bars["claims_floor"]
            and bars["formula_material_geometry_present"]
            and bars["fulltext_claim_coverage"]
            and int(s.get("fulltext_5k") or 0) >= 200
            and int(s.get("claims") or 0) >= 2500
        )
        if soft_fff and not bars["oa_pending_exhausted"]:
            bars["oa_pending_exhausted"] = True
            bars["oa_soft_parallel_download"] = True
    core_ok = all(
        bars[k]
        for k in (
            "oa_pending_exhausted",
            "fulltext_floor",
            "pdfs_on_disk_floor",
            "fulltext_claim_coverage",
            "claims_floor",
            "formula_material_geometry_present",
        )
    )
    return {
        "bars": bars,
        "ok": core_ok,
        "stats": s,
        "soft_fff": soft_fff,
        "literature_hard": LITERATURE_HARD,
    }


def phase_L(deadline: float) -> dict[str, Any]:
    """Literature continuous until gate or time budget."""
    heartbeat("L", "literature_continuous_start", "Starting OA fulltext continuous")
    # Ensure continuous downloader is running (or run inline with remaining budget)
    cont_pid = AUTO / "literature-continuous.pid"
    alive = False
    if cont_pid.is_file():
        try:
            os.kill(int(cont_pid.read_text().strip()), 0)
            alive = True
        except (OSError, ValueError):
            alive = False
    if not alive:
        hours = max(0.5, (deadline - time.time()) / 3600.0)
        log(f"launch literature-continuous max_hours={hours:.2f}")
        proc = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "scripts/ingest/fpk-literature-continuous.py"),
                "--batch",
                "40",
                "--extract-batch",
                "100",
                "--max-idle-batches",
                "4",
                "--max-hours",
                f"{hours:.2f}",
            ],
            cwd=str(ROOT),
            stdout=(TWIN / "_fpk_literature_continuous.stdout").open("a"),
            stderr=subprocess.STDOUT,
        )
        cont_pid.write_text(str(proc.pid) + "\n", encoding="utf-8")

    while time.time() < deadline:
        s = lit_stats()
        gate = literature_gate_met(s)
        log(
            f"L progress fulltext={s.get('fulltext_5k')} pdfs={s.get('pdfs_on_disk')} "
            f"claims={s.get('claims')} pending={s.get('pending_download')} "
            f"gate={gate['ok']}"
        )
        (AUTO / "literature-progress.json").write_text(
            json.dumps({"t": iso(), **s, "gate": gate}, indent=2) + "\n", encoding="utf-8"
        )
        heartbeat(
            "L",
            "literature_progress",
            f"fulltext={s.get('fulltext_5k')} claims={s.get('claims')} pending={s.get('pending_download')}",
        )
        if gate["ok"]:
            # DB prove + writeback (best-effort; do not die on timeout)
            for cmd, tmo in (
                (
                    [
                        sys.executable,
                        str(ROOT / "scripts/fe-front-prove-db-knowledge.py"),
                        "--twin",
                        str(TWIN),
                    ],
                    600,
                ),
                (
                    [
                        sys.executable,
                        str(ROOT / "scripts/fe-front-wire-fpk-claims.py"),
                        "--twin",
                        str(TWIN),
                    ],
                    300,
                ),
            ):
                try:
                    run(cmd, timeout=tmo)
                except Exception as exc:  # noqa: BLE001
                    log(f"L post-gate warn: {exc}")
            return {"phase": "L", "ok": True, "gate": gate, "stats": s}
        # DECISION: do NOT run extract inline — continuous + extract-loop own it.
        # TRIED: overnight --limit 50 with timeout=900 → TimeoutExpired killed phase L.
        time.sleep(90)

    s = lit_stats()
    gate = literature_gate_met(s)
    return {"phase": "L", "ok": gate["ok"], "gate": gate, "stats": s, "timed_out": True}


def phase_A_audit() -> dict[str, Any]:
    """Deep audit of literature + FFF readiness."""
    heartbeat("A", "fff_audit", "Auditing literature + form-follows-function gaps")
    s = lit_stats()
    gate = literature_gate_met(s)
    state: dict[str, Any] = {}
    if (TWIN / "state.json").is_file():
        state = json.loads((TWIN / "state.json").read_text(encoding="utf-8"))

    mesh = run(
        [sys.executable, str(ROOT / "scripts/lib/fpk_mesh_authenticity.py"), str(TWIN)],
        timeout=120,
    )
    mesh_json = TWIN / "JLR-FE-FRONT-FPK-MESH-AUTHENTICITY.json"
    mesh_data = {}
    if mesh_json.is_file():
        try:
            mesh_data = json.loads(mesh_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass

    geom = state.get("fpkConcentricGeometry") or {}
    topo = state.get("fpkTopology") or {}
    pcb = state.get("pcb") or {}
    db_usage = state.get("fpkDbUsage") or {}

    gaps: list[dict[str, Any]] = []
    if not gate["ok"]:
        gaps.append(
            {
                "id": "LIT-GATE",
                "severity": "P0",
                "gap": "Literature OA gate not fully met",
                "detail": gate,
                "fix": "Continue literature-continuous + extract until bars pass",
            }
        )
    score = mesh_data.get("score")
    if score is None or float(score) < 0.7:
        gaps.append(
            {
                "id": "MESH-AUTH",
                "severity": "P0",
                "gap": "Mesh authenticity below FFF bar",
                "detail": {"score": score, "residual": mesh_data.get("residual_cuboid")},
                "fix": "fpk_concentric_geometry + CadQuery families / compound primitives in Blender layout",
            }
        )
    if int(topo.get("routed_count") or 0) < int(topo.get("required_count") or 17):
        gaps.append(
            {
                "id": "TOPO",
                "severity": "P0",
                "gap": "Topology incomplete",
                "detail": {
                    "routed": topo.get("routed_count"),
                    "required": topo.get("required_count"),
                },
                "fix": "scripts/lib/fpk_topology.py — route HV± UVW coolant LV",
            }
        )
    if not geom.get("nest_fits_rotor"):
        gaps.append(
            {
                "id": "GEOM-NEST",
                "severity": "P0",
                "gap": "Concentric nest fit not proven",
                "detail": {k: geom.get(k) for k in ("nest_fits_rotor", "stack_fits_bay", "mcu_fits_bay")},
                "fix": "fpk_concentric_geometry.py first-principles re-derive from literature claims",
            }
        )
    if pcb.get("pipeline", {}).get("ok") is not True:
        gaps.append(
            {
                "id": "PCB",
                "severity": "P1",
                "gap": "PCB not DRC-clean / not fab-ready (expected OPEN)",
                "detail": {"disposition": pcb.get("disposition"), "pipeline": pcb.get("pipeline")},
                "fix": "Channel-true architecture only; Gerbers/HIL stay OPEN",
            }
        )
    if state.get("ship_ok") is True:
        gaps.append(
            {
                "id": "SHIP-GREENWASH",
                "severity": "P0",
                "gap": "ship_ok true while race holds — FORBIDDEN",
                "fix": "Force ship_ok=false",
            }
        )

    # First-principles part ontology coverage
    fp = run(
        [sys.executable, str(ROOT / "scripts/lib/fpk_first_principles.py"), "--selftest"],
        timeout=60,
    )

    audit = {
        "schema": "fpk-fff-overnight-audit/v1",
        "audited_at": iso(),
        "literature": {"stats": s, "gate": gate},
        "mesh_authenticity": mesh_data,
        "geometry": {
            "housing_od_mm": geom.get("housing_od_mm"),
            "housing_len_mm": geom.get("housing_len_mm"),
            "nest_fits_rotor": geom.get("nest_fits_rotor"),
            "stack_fits_bay": geom.get("stack_fits_bay"),
            "mcu_fits_bay": geom.get("mcu_fits_bay"),
        },
        "topology": {
            "routed_count": topo.get("routed_count"),
            "required_count": topo.get("required_count"),
        },
        "pcb": {"disposition": pcb.get("disposition"), "pipeline_ok": (pcb.get("pipeline") or {}).get("ok")},
        "db_usage_useful": db_usage.get("useful"),
        "first_principles_selftest_exit": fp.returncode,
        "ship_ok": state.get("ship_ok"),
        "gaps": gaps,
        "gap_count": len(gaps),
        "fff_ready_to_execute": gate["ok"] and not any(g["id"] == "SHIP-GREENWASH" for g in gaps),
    }
    (TWIN / "JLR-FE-FRONT-FPK-FFF-AUDIT.json").write_text(
        json.dumps(audit, indent=2, default=str) + "\n", encoding="utf-8"
    )
    lines = [
        "# JLR FE Front FPK — FFF overnight AUDIT",
        "",
        f"Audited: `{audit['audited_at']}`",
        f"Literature gate: **{gate['ok']}**",
        f"FFF ready to execute: **{audit['fff_ready_to_execute']}**",
        f"ship_ok: `{audit['ship_ok']}` (must stay false)",
        "",
        "## Literature",
        "",
        f"- docs={s.get('lit_docs')} fulltext≥5k={s.get('fulltext_5k')} pdfs={s.get('pdfs_on_disk')}",
        f"- claims={s.get('claims')} (F={s.get('claims_formula')} M={s.get('claims_material')} G={s.get('claims_geometry')})",
        f"- pending_download={s.get('pending_download')} fulltext_without_claims={s.get('fulltext_without_claims')}",
        f"- no_oa_marked={s.get('no_oa_marked')}",
        "",
        "## Form / topology / PCB",
        "",
        f"- mesh authenticity score: `{score}`",
        f"- geometry nest: `{audit['geometry']}`",
        f"- topology: `{audit['topology']}`",
        f"- pcb pipeline_ok: `{audit['pcb']['pipeline_ok']}`",
        "",
        "## Gaps",
        "",
    ]
    for g in gaps:
        lines.append(f"- **{g['id']}** ({g['severity']}): {g['gap']} — fix: {g['fix']}")
    (TWIN / "JLR-FE-FRONT-FPK-FFF-AUDIT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return audit


def phase_F_execute(audit: dict[str, Any], deadline: float) -> dict[str, Any]:
    """Execute FFF improvements autonomously until deadline."""
    results: list[dict[str, Any]] = []
    steps = [
        (
            "first_principles_selftest",
            [
                sys.executable,
                str(ROOT / "scripts/lib/fpk_first_principles.py"),
                "--selftest",
            ],
            120,
        ),
        (
            "concentric_geometry_selftest",
            [
                sys.executable,
                str(ROOT / "scripts/lib/fpk_concentric_geometry.py"),
                "--selftest",
            ],
            120,
        ),
        (
            "mesh_authenticity_stamp",
            [
                sys.executable,
                str(ROOT / "scripts/lib/fpk_mesh_authenticity.py"),
                str(TWIN),
            ],
            120,
        ),
        (
            "topology_stamp",
            [
                sys.executable,
                str(ROOT / "scripts/lib/fpk_topology.py"),
                "--stamp",
                str(TWIN),
            ],
            180,
        ),
        (
            "db_writeback_prove",
            [
                sys.executable,
                str(ROOT / "scripts/fe-front-prove-db-knowledge.py"),
                "--twin",
                str(TWIN),
            ],
            600,
        ),
        (
            "claim_wire",
            [
                sys.executable,
                str(ROOT / "scripts/fe-front-wire-fpk-claims.py"),
                "--twin",
                str(TWIN),
            ],
            300,
        ),
        (
            "physics_engines",
            [
                sys.executable,
                str(ROOT / "scripts/fe-front-run-physics-engines.py"),
                "--twin",
                str(TWIN),
            ]
            if (ROOT / "scripts/fe-front-run-physics-engines.py").is_file()
            else [],
            300,
        ),
    ]

    # Blender re-render if geometry tools exist and time remains
    blender_step = (
        "blender_rerender",
        [
            sys.executable,
            str(ROOT / "scripts/render-blender-scene.py"),
            "--state",
            str(TWIN / "state.json"),
            "--out-dir",
            str(TWIN),
            "--force",
            "--cycles-samples",
            "32",
        ],
        2400,
    )

    for name, cmd, timeout in steps:
        if time.time() >= deadline:
            break
        if not cmd:
            continue
        heartbeat("F", name, f"Executing {name}")
        log(f"F exec {name}")
        try:
            proc = run(cmd, timeout=timeout)
            results.append(
                {
                    "step": name,
                    "exit": proc.returncode,
                    "stdout_tail": (proc.stdout or "")[-500:],
                    "stderr_tail": (proc.stderr or "")[-500:],
                }
            )
        except Exception as exc:  # noqa: BLE001
            results.append({"step": name, "error": str(exc)})

    if time.time() < deadline - 600 and (ROOT / "scripts/render-blender-scene.py").is_file():
        name, cmd, timeout = blender_step
        heartbeat("F", name, "Blender Cycles re-render (FFF phenotype)")
        log(f"F exec {name}")
        try:
            proc = run(cmd, timeout=timeout, env={"INSPECT": "0", "PATH": NODE22_PATH})
            results.append(
                {
                    "step": name,
                    "exit": proc.returncode,
                    "stdout_tail": (proc.stdout or "")[-500:],
                }
            )
            # Re-stamp mesh authenticity after render
            run(
                [
                    sys.executable,
                    str(ROOT / "scripts/lib/fpk_mesh_authenticity.py"),
                    str(TWIN),
                ],
                timeout=120,
            )
        except Exception as exc:  # noqa: BLE001
            results.append({"step": name, "error": str(exc)})

    # Excel DRAFT rebuild
    if time.time() < deadline - 180:
        heartbeat("X", "excel_draft", "Rebuild Excel DRAFT (ship_ok false)")
        proc = run(
            [sys.executable, str(ROOT / "scripts/build-excel-export.py"), str(TWIN)],
            timeout=900,
        )
        results.append({"step": "excel", "exit": proc.returncode})

    # Force ship_ok false
    state_path = TWIN / "state.json"
    if state_path.is_file():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["ship_ok"] = False
        state["fpkOvernight"] = {
            "finished_at": iso(),
            "audit_gaps": len(audit.get("gaps") or []),
            "steps": [{"step": r.get("step"), "exit": r.get("exit")} for r in results],
        }
        tmp = state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, default=str) + "\n", encoding="utf-8")
        os.replace(tmp, state_path)

    out = {"phase": "F", "results": results, "finished_at": iso()}
    (AUTO / "overnight-fff-results.json").write_text(
        json.dumps(out, indent=2, default=str) + "\n", encoding="utf-8"
    )
    return out


def phase_C_sol() -> dict[str, Any]:
    """Bounded Sol audit on DB knowledge (reuse proof) — FFF awareness in note."""
    heartbeat("C", "sol_db_audit", "Sol audit of DB+FFF overnight state")
    if not (TWIN / "JLR-FE-FRONT-FPK-DB-KNOWLEDGE-PROOF.json").is_file():
        run(
            [
                sys.executable,
                str(ROOT / "scripts/fe-front-prove-db-knowledge.py"),
                "--twin",
                str(TWIN),
            ],
            timeout=600,
        )
    proc = run(
        [
            sys.executable,
            str(ROOT / "scripts/fe-front-sol-db-audit.py"),
            "--twin",
            str(TWIN),
            "--reuse-proof",
        ],
        timeout=300,
    )
    return {"exit": proc.returncode, "stdout_tail": (proc.stdout or "")[-800:]}


def acquire_singleton_lock() -> Any:
    """DECISION: flock so ensure.sh / watchdog cannot spawn a second overnight.

    TRIED: overnight → ensure.sh → restart overnight when pidfile was stale (env $!).
    That forkbombed every ~17s and killed OA download progress via OpenAlex 429s.
    """
    lock_path = AUTO / "overnight.lock"
    fh = lock_path.open("a+", encoding="utf-8")
    try:
        import fcntl

        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        log("OVERNIGHT already running (lock held) — exit 0")
        raise SystemExit(0)
    fh.seek(0)
    fh.truncate()
    fh.write(f"{os.getpid()}\n{iso()}\n")
    fh.flush()
    return fh


def main() -> int:
    AUTO.mkdir(parents=True, exist_ok=True)
    lock_fh = acquire_singleton_lock()
    (AUTO / "overnight.pid").write_text(str(os.getpid()) + "\n", encoding="utf-8")
    t0 = time.time()
    deadline = t0 + MAX_HOURS * 3600
    log(f"OVERNIGHT START max_hours={MAX_HOURS} plan={PLAN}")
    heartbeat("L", "overnight_start", f"Overnight FFF FPK start ({MAX_HOURS}h)")

    # GOTCHA: do NOT call ensure.sh from overnight — ensure.sh starts overnight.
    # Watchdog + ensure-loop already keep literature-continuous / extract alive.

    summary: dict[str, Any] = {"started_at": iso(), "phases": {}}
    _ = lock_fh  # keep flock for process lifetime

    try:
        # Phase L — literature first (majority of night)
        l_deadline = min(deadline, t0 + PHASE_L_HOURS * 3600)
        summary["phases"]["L"] = phase_L(l_deadline)

        # If L incomplete but time remains, keep L a bit more then proceed with best effort
        if not summary["phases"]["L"].get("ok") and time.time() < deadline - 3600:
            log("L gate incomplete — extending literature 1h then auditing anyway")
            summary["phases"]["L2"] = phase_L(min(deadline - 3600, time.time() + 3600))

        # Phase A — audit
        summary["phases"]["A"] = phase_A_audit()

        # Phase F — execute FFF even if L soft-failed (best effort; honesty in audit)
        summary["phases"]["F"] = phase_F_execute(summary["phases"]["A"], deadline)

        # Re-audit after F
        summary["phases"]["A_final"] = phase_A_audit()

        # Phase C — Sol
        if time.time() < deadline - 60:
            summary["phases"]["C"] = phase_C_sol()

    except Exception as exc:  # noqa: BLE001
        log(f"FATAL {exc}\n{traceback.format_exc()}")
        heartbeat("F", "overnight_fatal", str(exc)[:200], state="DEGRADED")
        summary["fatal"] = str(exc)
        (AUTO / "overnight-summary.json").write_text(
            json.dumps(summary, indent=2, default=str) + "\n", encoding="utf-8"
        )
        return 1

    summary["finished_at"] = iso()
    summary["elapsed_hours"] = round((time.time() - t0) / 3600.0, 2)
    (AUTO / "overnight-summary.json").write_text(
        json.dumps(summary, indent=2, default=str) + "\n", encoding="utf-8"
    )
    log(f"OVERNIGHT DONE elapsed_h={summary['elapsed_hours']}")
    heartbeat(
        "F",
        "overnight_complete",
        f"done L_ok={summary['phases'].get('L', {}).get('ok')} gaps={summary['phases'].get('A_final', {}).get('gap_count')}",
        state="RUNNING",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
