#!/usr/bin/env python3
"""CATEGORICAL PROOF: FPK materials/formulas/geometry in forge-truth, USED, GROWING.

Bars are intentionally strict (anti-Goodhart):
  PRESENT — executable canon covers all Sol formula packs; geometry+materials present
  USED    — production consumers (Python fpk_db_consumer + TS lookupFpkClaims/
            getMaterialPrice) return hits; wire attaches a real floor of claims
  GROWS   — this-cycle net row growth OR growth-ledger shows increase vs prior entry
            (historically-large alone is NOT enough)

Honesty: never closes HIL/dyno/FIA holds.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TWIN = ROOT / "out" / "formula-e-front-mgu-20260729-1432"
DB = Path.home() / ".forge-truth" / "forge-truth.db"
NODE22 = Path("/opt/homebrew/opt/node@22/bin/node")
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
import growing_db_freshness as gdf  # noqa: E402
from fpk_db_consumer import stamp_fpk_db_reads  # noqa: E402


def _expected_formula_floor() -> tuple[int, int]:
    """Return (min_exec_formulas, min_packs) from writeback catalogue size."""
    import importlib.util

    mod = ROOT / "scripts/ingest/writeback-fpk-executable-knowledge.py"
    spec = importlib.util.spec_from_file_location("fpk_wb", mod)
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    formulas = getattr(m, "FPK_FORMULAS", [])
    packs = getattr(m, "FORMULA_PACKS_FOR_DB", [])
    return len(formulas), len(packs)


def _snapshot(con: sqlite3.Connection) -> dict[str, int]:
    return {
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
        "executable_claims": con.execute(
            "SELECT COUNT(*) FROM fpk_extracted_claims "
            "WHERE source_detail LIKE 'fpk_executable:%'"
        ).fetchone()[0],
        "executable_formulas": con.execute(
            "SELECT COUNT(*) FROM fpk_extracted_claims "
            "WHERE source_detail LIKE 'fpk_executable:%' AND claim_kind='formula'"
        ).fetchone()[0],
        "specs_fpk": con.execute(
            "SELECT COUNT(*) FROM pretraining_extracted_specs WHERE spec_key LIKE 'fpk:%'"
        ).fetchone()[0],
        "materials": con.execute("SELECT COUNT(*) FROM material_prices").fetchone()[0],
        "lit_docs": con.execute(
            "SELECT COUNT(*) FROM pretraining_spec_documents "
            "WHERE source_type='fpk_literature'"
        ).fetchone()[0],
        "fulltext": con.execute(
            "SELECT COUNT(*) FROM pretraining_spec_documents "
            "WHERE source_type='fpk_literature' AND extraction_status='fulltext'"
        ).fetchone()[0],
        "comp_links": con.execute(
            "SELECT COUNT(*) FROM fpk_component_literature"
        ).fetchone()[0],
    }


def _ledger_path(twin: Path) -> Path:
    return twin / "fpk-db-growth-ledger.jsonl"


def _read_ledger(twin: Path) -> list[dict[str, Any]]:
    path = _ledger_path(twin)
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def _append_ledger(twin: Path, snap: dict[str, int]) -> None:
    path = _ledger_path(twin)
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        **snap,
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")


def _growth_vs_ledger(
    rows: list[dict[str, Any]],
    current: dict[str, int],
    *,
    window_hours: int = 24,
) -> dict[str, Any]:
    """Growth = current > oldest ledger tip inside the recent window.

    INTENT: Capture (a) this-cycle writeback, (b) between-run fulltext/extract
    growth, and (c) same-day progress after a big writeback — without accepting
    "corpus is large" forever. After ``window_hours`` of flatline, the bar fails
    until something grows again.
    """
    keys = (
        "claims",
        "executable_claims",
        "executable_formulas",
        "fulltext",
        "materials",
        "specs_fpk",
        "comp_links",
        "lit_docs",
    )
    now = datetime.now(timezone.utc)
    window: list[dict[str, Any]] = []
    for r in rows:
        ts = r.get("ts")
        if not isinstance(ts, str):
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_h = (now - dt).total_seconds() / 3600.0
        if age_h <= window_hours:
            window.append(r)
    baseline = window[0] if window else (rows[-1] if rows else None)
    if not baseline:
        return {
            "ok": False,
            "reason": "no ledger baseline",
            "increases": {},
            "window_hours": window_hours,
        }
    increases = {
        k: {"from": baseline.get(k), "to": current.get(k)}
        for k in keys
        if isinstance(current.get(k), int)
        and isinstance(baseline.get(k), int)
        and current[k] > baseline[k]
    }
    return {
        "ok": bool(increases),
        "increases": increases,
        "baseline_ts": baseline.get("ts"),
        "window_hours": window_hours,
        "window_entries": len(window),
    }


def _run_writeback(twin: Path, db: Path) -> dict[str, Any]:
    cmd = [
        sys.executable,
        str(ROOT / "scripts/ingest/writeback-fpk-executable-knowledge.py"),
        "--twin",
        str(twin),
        "--db",
        str(db),
    ]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=120)
    payload: dict[str, Any] = {
        "exit_code": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-2000:],
        "stderr_tail": (proc.stderr or "")[-1000:],
    }
    wb = twin / "JLR-FE-FRONT-FPK-DB-WRITEBACK.json"
    if wb.is_file():
        try:
            payload["summary"] = json.loads(wb.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            payload["summary_error"] = str(exc)
    return payload


def _run_wire(twin: Path, db: Path) -> dict[str, Any]:
    cmd = [
        sys.executable,
        str(ROOT / "scripts/fe-front-wire-fpk-claims.py"),
        "--twin",
        str(twin),
        "--db",
        str(db),
    ]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=180)
    out: dict[str, Any] = {
        "exit_code": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-1500:],
    }
    report = twin / "JLR-FE-FRONT-FPK-CLAIM-WIRING.json"
    if report.is_file():
        try:
            data = json.loads(report.read_text(encoding="utf-8"))
            counts = data.get("counts") or {}
            out["summary"] = {
                "claims_total": counts.get("claims_total"),
                "claims_eligible": counts.get("claims_eligible"),
                "claims_wired": counts.get("claims_wired"),
                "leaves_with_claim_refs": counts.get("leaves_with_claim_refs"),
                "tree_leaves": counts.get("tree_leaves"),
                "claims_unmatched": counts.get("claims_unmatched"),
                "wired_claims_by_kind": data.get("wired_claims_by_kind"),
            }
        except json.JSONDecodeError as exc:
            out["report_error"] = str(exc)
    return out


def _run_ts_stamp(twin: Path) -> dict[str, Any]:
    """Invoke real TypeScript consumers under Node 22 (better-sqlite3 ABI)."""
    node = NODE22 if NODE22.is_file() else Path(shutil.which("node") or "")
    if not node.is_file():
        return {"ok": False, "error": "node binary missing"}
    # GOTCHA: system node is often v25; better-sqlite3 is built for Node 22.
    # Prefer PATH-scoped npx tsx under node@22.
    env = {
        **os.environ,
        "PATH": f"{node.parent}:{os.environ.get('PATH', '')}",
        "NODE_OPTIONS": "",
    }
    cmd = [
        "npx",
        "--yes",
        "tsx",
        str(ROOT / "scripts/fe-front-stamp-fpk-db-reads.ts"),
        "--twin",
        str(twin),
    ]
    proc = subprocess.run(
        cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=180, env=env
    )
    out: dict[str, Any] = {
        "exit_code": proc.returncode,
        "node": str(node),
        "stdout_tail": (proc.stdout or "")[-1500:],
        "stderr_tail": (proc.stderr or "")[-1500:],
    }
    art = twin / "JLR-FE-FRONT-FPK-DB-READS-TS.json"
    if art.is_file():
        try:
            data = json.loads(art.read_text(encoding="utf-8"))
            out["stamp"] = data
            out["ok"] = bool(data.get("ok"))
        except json.JSONDecodeError as exc:
            out["ok"] = False
            out["parse_error"] = str(exc)
    else:
        out["ok"] = False
        out["error"] = out.get("error") or "TS stamp artefact missing"
    return out


def prove(twin: Path, db: Path, *, skip_writeback: bool = False) -> dict[str, Any]:
    proved_at = datetime.now(ZoneInfo("Europe/London")).isoformat(timespec="seconds")
    formula_floor, pack_floor = _expected_formula_floor()

    prior_rows = _read_ledger(twin)

    con = sqlite3.connect(str(db))
    before = _snapshot(con)
    con.close()

    writeback: dict[str, Any] = {"skipped": True}
    if not skip_writeback:
        writeback = _run_writeback(twin, db)

    con = sqlite3.connect(str(db))
    after = _snapshot(con)
    # Pack coverage: executable formula symbols should include each pack_id
    pack_ids = con.execute(
        """
        SELECT DISTINCT substr(symbol, 1, instr(symbol, '::')-1) AS pack
        FROM fpk_extracted_claims
        WHERE source_detail LIKE 'fpk_executable:%'
          AND claim_kind='formula'
          AND symbol LIKE '%::%'
        """
    ).fetchall()
    packs_present = {r[0] for r in pack_ids if r[0]}
    con.close()

    py_reads = stamp_fpk_db_reads(db_path=db)
    (twin / "JLR-FE-FRONT-FPK-DB-READS-PY.json").write_text(
        json.dumps(py_reads, indent=2, default=str) + "\n", encoding="utf-8"
    )
    ts_reads = _run_ts_stamp(twin)
    wire = _run_wire(twin, db)
    freshness = gdf.compute_freshness(str(db))

    delta = {k: after[k] - before[k] for k in before}
    grew_this_cycle = any(delta[k] > 0 for k in delta)
    ledger = _growth_vs_ledger(prior_rows, after, window_hours=24)
    if grew_this_cycle:
        ledger = {
            **ledger,
            "ok": True,
            "this_cycle": {k: delta[k] for k in delta if delta[k] > 0},
        }
    _append_ledger(twin, after)

    wire_summary = wire.get("summary") or {}
    claims_wired = int(wire_summary.get("claims_wired") or 0)
    leaves_with = int(wire_summary.get("leaves_with_claim_refs") or 0)
    mat_stale_n = (freshness.get("tables") or {}).get("material_prices", {}).get("stale_n")

    # Floors declared in the proof so Sol can audit the comparison, not guess.
    floors = {
        "material_price_hits": 6,
        "python_formula_claims": 10,
        "python_geometry_claims": 5,
        "executable_formulas": max(40, formula_floor - 5),
        "formula_packs": pack_floor,
        "geometry_claims": 15,
        "executable_claims": formula_floor,
        "claims_wired": 200,
        "leaves_with_claim_refs": 15,
        "material_stale_n": 0,
    }
    wire_floor_eval = {
        "claims_wired": claims_wired,
        "claims_wired_floor": floors["claims_wired"],
        "claims_wired_pass": claims_wired >= floors["claims_wired"],
        "leaves_with_claim_refs": leaves_with,
        "leaves_with_claim_refs_floor": floors["leaves_with_claim_refs"],
        "leaves_with_claim_refs_pass": leaves_with >= floors["leaves_with_claim_refs"],
        "wire_exit_code": wire.get("exit_code"),
    }

    bars = {
        "materials_in_db": py_reads["material_price_hit_count"] >= floors["material_price_hits"],
        "formulas_cover_sol_packs": (
            after["executable_formulas"] >= floors["executable_formulas"]
            and len(packs_present) >= floors["formula_packs"]
        ),
        "geometry_in_db": after["claims_geometry"] >= floors["geometry_claims"],
        "executable_canon_present": after["executable_claims"] >= floors["executable_claims"],
        "python_consumer_used": (
            py_reads["material_price_hit_count"] >= floors["material_price_hits"]
            and len(py_reads["formula_claims"]) >= floors["python_formula_claims"]
            and len(py_reads["geometry_claims"]) >= floors["python_geometry_claims"]
        ),
        "typescript_consumer_used": bool(ts_reads.get("ok")),
        "wire_path_used_db": (
            wire.get("exit_code") == 0
            and wire_floor_eval["claims_wired_pass"]
            and wire_floor_eval["leaves_with_claim_refs_pass"]
        ),
        "grew_this_cycle_or_ledger": grew_this_cycle or bool(ledger.get("ok")),
        "materials_not_stale": mat_stale_n == floors["material_stale_n"],
        "freshness_surface_sees_fpk": bool(
            freshness.get("tables", {}).get("fpk_extracted_claims", {}).get("present")
        ),
    }
    useful = all(bars.values())

    return {
        "schema": "fpk-db-knowledge-proof/v2",
        "proved_at": proved_at,
        "database": str(db),
        "twin": str(twin),
        "formula_catalogue_floor": formula_floor,
        "formula_pack_floor": pack_floor,
        "floors": floors,
        "wire_floor_eval": wire_floor_eval,
        "packs_present": sorted(packs_present),
        "before": before,
        "after": after,
        "delta": delta,
        "grew_this_cycle": grew_this_cycle,
        "growth_ledger": ledger,
        "writeback": writeback,
        "python_consumer": {
            "material_price_hit_count": py_reads["material_price_hit_count"],
            "formula_claim_count": len(py_reads["formula_claims"]),
            "geometry_claim_count": len(py_reads["geometry_claims"]),
            "by_component": py_reads["by_component"],
            "consumer": py_reads["consumer"],
        },
        "typescript_consumer": ts_reads,
        "wire": wire,
        "growing_db_freshness": freshness,
        "bars": bars,
        "useful": useful,
        "honesty": (
            "DB presence/use/growth is proven only when production consumers fire "
            "and growth is this-cycle or ledger-backed. Ship readiness remains "
            "blocked by HIL/dyno/FIA/CFD/FEA holds."
        ),
    }


def write_artefacts(twin: Path, proof: dict[str, Any]) -> None:
    twin.mkdir(parents=True, exist_ok=True)
    (twin / "JLR-FE-FRONT-FPK-DB-KNOWLEDGE-PROOF.json").write_text(
        json.dumps(proof, indent=2, default=str) + "\n", encoding="utf-8"
    )
    bars = proof["bars"]
    lines = [
        "# JLR FE Front FPK — DB knowledge proof v2 (CATEGORICAL, anti-Goodhart)",
        "",
        f"Proved at: `{proof['proved_at']}`",
        f"Database: `{proof['database']}`",
        f"**USEFUL:** `{proof['useful']}`",
        "",
        "## Bars",
        "",
    ]
    for k, v in bars.items():
        lines.append(f"- `{k}`: **{'PASS' if v else 'FAIL'}**")
    lines += [
        "",
        "## Growth",
        "",
        f"- This-cycle growth: `{proof['grew_this_cycle']}` Δ=`{proof['delta']}`",
        f"- Ledger: `{proof['growth_ledger']}`",
        f"- Executable formulas: `{proof['after']['executable_formulas']}` "
        f"(floor {proof['formula_catalogue_floor']})",
        f"- Packs present: `{len(proof['packs_present'])}` / "
        f"{proof['formula_pack_floor']} → {proof['packs_present']}",
        "",
        "## Use (production consumers)",
        "",
        f"- Python consumer: `{proof['python_consumer']}`",
        f"- TypeScript consumer ok: `{proof['typescript_consumer'].get('ok')}` "
        f"exit=`{proof['typescript_consumer'].get('exit_code')}`",
        f"- Wire: `{proof['wire'].get('summary')}`",
        "",
        "## Honesty",
        "",
        proof["honesty"],
        "",
    ]
    (twin / "JLR-FE-FRONT-FPK-DB-KNOWLEDGE-PROOF.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )

    state_path = twin / "state.json"
    if state_path.is_file():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["fpkDbUsage"] = {
            "schema": proof["schema"],
            "proved_at": proof["proved_at"],
            "useful": proof["useful"],
            "bars": proof["bars"],
            "after": proof["after"],
            "delta": proof["delta"],
            "grew_this_cycle": proof["grew_this_cycle"],
            "growth_ledger": proof["growth_ledger"],
            "python_consumer": proof["python_consumer"],
            "typescript_consumer_ok": (proof.get("typescript_consumer") or {}).get("ok"),
            "wire_summary": (proof.get("wire") or {}).get("summary"),
            "honesty": proof["honesty"],
        }
        state["growingDb"] = proof["growing_db_freshness"]
        state["fpkDbReads"] = proof["python_consumer"]
        tmp = state_path.with_name(f".state.json.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(state, indent=2, default=str) + "\n", encoding="utf-8")
        os.replace(tmp, state_path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--skip-writeback", action="store_true")
    args = ap.parse_args()
    proof = prove(args.twin, args.db, skip_writeback=args.skip_writeback)
    write_artefacts(args.twin, proof)
    print(
        json.dumps(
            {
                "useful": proof["useful"],
                "bars": proof["bars"],
                "delta": proof["delta"],
                "grew_this_cycle": proof["grew_this_cycle"],
                "ledger": proof["growth_ledger"],
                "ts_ok": (proof.get("typescript_consumer") or {}).get("ok"),
            },
            indent=2,
            default=str,
        )
    )
    return 0 if proof["useful"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
