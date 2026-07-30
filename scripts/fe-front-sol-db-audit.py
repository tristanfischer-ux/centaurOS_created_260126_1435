#!/usr/bin/env python3
"""Sol categorical audit: FPK materials/formulas/geometry in DB, used, growing.

INTENT: After fe-front-prove-db-knowledge.py builds a deterministic evidence
matrix, Sol adversarially audits that the growing forge-truth DB actually:
  (1) contains materials, formulas, and geometry for formula_e_front_mgu
  (2) is READ by design paths (wire + DB-first material + claim lookup)
  (3) grows over time (writeback / harvest / fulltext)

Deterministic bars decide PASS/FAIL; Sol cannot invent a pass.
Ship readiness stays FAIL while race holds are open.

Usage:
  python3 scripts/fe-front-sol-db-audit.py
  python3 scripts/fe-front-sol-db-audit.py --skip-sol
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
sys.path.insert(0, str(ROOT / "scripts/lib"))
from council_models import COUNCIL_MODELS  # noqa: E402


def ensure_proof(
    twin: Path,
    *,
    skip_writeback: bool = False,
    reuse_proof: bool = False,
) -> dict[str, Any]:
    proof_path = twin / "JLR-FE-FRONT-FPK-DB-KNOWLEDGE-PROOF.json"
    if reuse_proof and proof_path.is_file():
        proof = json.loads(proof_path.read_text(encoding="utf-8"))
        if proof.get("schema", "").startswith("fpk-db-knowledge-proof/v"):
            return proof
    cmd = [
        sys.executable,
        str(ROOT / "scripts/fe-front-prove-db-knowledge.py"),
        "--twin",
        str(twin),
    ]
    if skip_writeback:
        cmd.append("--skip-writeback")
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=600)
    if not proof_path.is_file():
        raise RuntimeError(
            f"proof missing after prove script (exit={proc.returncode}): "
            f"{proc.stderr[-1500:]}"
        )
    return json.loads(proof_path.read_text(encoding="utf-8"))


def build_matrix(proof: dict[str, Any]) -> dict[str, Any]:
    bars = proof.get("bars") or {}
    return {
        "schema": "fpk-db-sol-audit-matrix/v2",
        "proved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "twin": proof.get("twin"),
        "database": proof.get("database"),
        "deterministic_useful": bool(proof.get("useful")),
        "bars": bars,
        "bars_pass_count": sum(1 for v in bars.values() if v),
        "bars_total": len(bars),
        "after": proof.get("after"),
        "delta": proof.get("delta"),
        "grew_this_cycle": proof.get("grew_this_cycle"),
        "growth_ledger": proof.get("growth_ledger"),
        "packs_present": proof.get("packs_present"),
        "formula_catalogue_floor": proof.get("formula_catalogue_floor"),
        "python_consumer": proof.get("python_consumer"),
        "typescript_consumer": {
            "ok": (proof.get("typescript_consumer") or {}).get("ok"),
            "exit_code": (proof.get("typescript_consumer") or {}).get("exit_code"),
            "stamp": (proof.get("typescript_consumer") or {}).get("stamp"),
        },
        "floors": proof.get("floors"),
        "wire_floor_eval": proof.get("wire_floor_eval"),
        "wire_summary": (proof.get("wire") or {}).get("summary"),
        "writeback_summary": (proof.get("writeback") or {}).get("summary"),
        "freshness_fpk": {
            k: (proof.get("growing_db_freshness") or {}).get("tables", {}).get(k)
            for k in (
                "fpk_extracted_claims",
                "fpk_component_literature",
                "material_prices",
                "pretraining_extracted_specs",
                "pretraining_spec_documents",
            )
        },
        "honesty_notes": proof.get("honesty"),
        "anti_goodhart": [
            "historically-large corpus alone does NOT pass growth",
            "wire exit 0 alone does NOT pass use (floors on claims_wired/leaves)",
            "prove SELECT alone does NOT pass use — TS+Python production consumers required",
            "material MAX(updated) alone does NOT clear staleness — per-row stale_n==0 required",
            "Sol must FAIL weak/contradictory evidence even if deterministic_useful",
        ],
        "question_under_audit": (
            "Are FPK materials, formulas, and geometry in the growing DB; "
            "is the DB used by production design consumers; and does the DB "
            "get bigger over time (this-cycle or ledger)?"
        ),
    }


def call_sol(api_key: str, matrix: dict[str, Any]) -> dict[str, Any]:
    system = """You are Sol — adversarial auditor for Jaguar Land Rover Formula E FPK
knowledge databases (forge-truth growing DB).

You receive a DETERMINISTIC evidence matrix. TWO SEPARATE verdicts:

A) db_knowledge_verdict — ONLY about whether:
   (1) materials, formulas, and geometry for formula_e_front_mgu are PRESENT in DB
   (2) design paths READ the DB via production consumers (Python fpk_db_consumer
       AND TypeScript lookupFpkClaims/getMaterialPrice) + wire with real floors
   (3) the DB GROWS this cycle OR the growth ledger shows a real increase
       (historically-large alone is NOT enough — reject that Goodhart)
   You are adversarial: if bars look weak, evidence contradictory, TS consumer
   failed, wire floors missing, or growth is only historical size, you MUST
   FAIL or CONDITIONAL and set categorical_proof_accepted=false.
   If matrix.deterministic_useful is true AND evidence supports every bar with
   no contradiction, PASS + categorical_proof_accepted=true.
   Do NOT fail A for missing CFD/FEA/HIL/dyno — those are ship holds.

B) ship_readiness_verdict — overall dossier readiness to manufacture/race.
   This SHOULD remain FAIL while CFD/FEA/HIL/dyno/FIA XYZ holds are open.

Also:
1) Flag any bar that claims PASS but evidence is weak (sol_bar_verdict WEAK/FAIL).
2) Name gaps in DB coverage (advisory; does not auto-fail A if deterministic_useful).
3) Confirm the growing-DB loop is real (writeback/harvest → larger stores → reads).

Return STRICT JSON:
{
  "db_knowledge_verdict": "PASS" | "CONDITIONAL" | "FAIL",
  "ship_readiness_verdict": "PASS" | "CONDITIONAL" | "FAIL",
  "verdict": "PASS" | "CONDITIONAL" | "FAIL",
  "confidence": 0-100,
  "bar_audits": [
    {"bar":"...", "sol_verdict":"PASS|FAIL|WEAK", "why":"..."}
  ],
  "coverage_gaps": ["..."],
  "growth_assessment": "...",
  "usage_assessment": "...",
  "categorical_proof_accepted": true/false,
  "top_findings": ["..."],
  "required_fixes_before_ship": ["..."]
}
Set "verdict" equal to db_knowledge_verdict.
No markdown outside JSON.
"""
    body = {
        "model": COUNCIL_MODELS["sol"],
        "temperature": 0.15,
        "max_tokens": 5000,
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": "Audit this FPK growing-DB evidence matrix:\n"
                + json.dumps(matrix, indent=2, default=str),
            },
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.local",
            "X-Title": "ForgeOS FPK Sol DB Audit",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    content = data["choices"][0]["message"].get("content") or ""
    text = str(content).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start < 0:
        return {"parse_error": True, "raw": text[:2000]}
    from json import JSONDecoder

    try:
        obj, _ = JSONDecoder().raw_decode(text, start)
        return obj if isinstance(obj, dict) else {"parse_error": True, "raw": text[:2000]}
    except json.JSONDecodeError:
        return {"parse_error": True, "raw": text[:2000]}


def write_artefacts(twin: Path, matrix: dict[str, Any], sol: dict[str, Any] | None) -> None:
    twin.mkdir(parents=True, exist_ok=True)
    (twin / "JLR-FE-FRONT-FPK-SOL-DB-AUDIT.json").write_text(
        json.dumps({"matrix": matrix, "sol": sol}, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    lines = [
        "# JLR FE Front FPK — Sol DB knowledge audit (CATEGORICAL PROOF)",
        "",
        f"Proved at: `{matrix['proved_at']}`",
        f"Sol model: `{COUNCIL_MODELS['sol']}`",
        "",
        "## Deterministic verdict",
        "",
        f"- Bars PASS: **{matrix['bars_pass_count']}** / **{matrix['bars_total']}**",
        f"- **DETERMINISTIC USEFUL:** `{matrix['deterministic_useful']}`",
        f"- Claims after: `{matrix['after']}`",
        f"- Delta this cycle: `{matrix['delta']}`",
        f"- Grew this cycle: `{matrix.get('grew_this_cycle')}`",
        f"- Growth ledger: `{matrix.get('growth_ledger')}`",
        f"- Packs present: `{len(matrix.get('packs_present') or [])}` "
        f"/ floor {matrix.get('formula_catalogue_floor')}",
        f"- TS consumer ok: `{(matrix.get('typescript_consumer') or {}).get('ok')}`",
        "",
    ]
    for k, v in (matrix.get("bars") or {}).items():
        lines.append(f"- `{k}`: **{'PASS' if v else 'FAIL'}**")
    if sol and not sol.get("parse_error"):
        lines += [
            "",
            "## Sol audit",
            "",
            f"- DB-knowledge verdict: **{sol.get('db_knowledge_verdict') or sol.get('verdict')}** "
            f"(confidence {sol.get('confidence')})",
            f"- Ship-readiness verdict: **{sol.get('ship_readiness_verdict', 'n/a')}**",
            f"- Categorical proof accepted by Sol: **{sol.get('categorical_proof_accepted')}**",
            f"- Growth: {sol.get('growth_assessment')}",
            f"- Usage: {sol.get('usage_assessment')}",
            "",
            "### Sol bar audits",
            "",
        ]
        for b in sol.get("bar_audits") or []:
            lines.append(
                f"- `{b.get('bar')}`: **{b.get('sol_verdict')}** — {b.get('why')}"
            )
        if sol.get("coverage_gaps"):
            lines += ["", "### Coverage gaps (advisory)", ""]
            for g in sol["coverage_gaps"]:
                lines.append(f"- {g}")
        if sol.get("top_findings"):
            lines += ["", "### Top findings", ""]
            for f in sol["top_findings"]:
                lines.append(f"- {f}")
        if sol.get("required_fixes_before_ship"):
            lines += ["", "### Required before ship", ""]
            for f in sol["required_fixes_before_ship"]:
                lines.append(f"- {f}")
    elif sol and sol.get("parse_error"):
        lines += ["", "## Sol audit", "", "PARSE ERROR — see JSON raw.", ""]
    else:
        lines += ["", "## Sol audit", "", "_Skipped (`--skip-sol`)._", ""]
    lines += [
        "",
        "## Honesty",
        "",
        matrix.get("honesty_notes") or "",
        "",
    ]
    (twin / "JLR-FE-FRONT-FPK-SOL-DB-AUDIT.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )

    state_path = twin / "state.json"
    if state_path.is_file():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["fpkDbAudit"] = {
            "proved_at": matrix["proved_at"],
            "deterministic_useful": matrix["deterministic_useful"],
            "bars": matrix["bars"],
            "sol_model": COUNCIL_MODELS["sol"],
            "db_knowledge_verdict": (sol or {}).get("db_knowledge_verdict")
            or (sol or {}).get("verdict"),
            "ship_readiness_verdict": (sol or {}).get("ship_readiness_verdict"),
            "categorical_proof_accepted": (sol or {}).get("categorical_proof_accepted"),
            "confidence": (sol or {}).get("confidence"),
            "skipped_sol": sol is None,
        }
        tmp = state_path.with_name(f".state.json.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(state, indent=2, default=str) + "\n", encoding="utf-8")
        os.replace(tmp, state_path)


def load_key() -> str:
    if os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    for p in (ROOT / ".env.local", ROOT / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin", type=Path, default=TWIN)
    ap.add_argument("--skip-sol", action="store_true")
    ap.add_argument("--skip-writeback", action="store_true")
    ap.add_argument(
        "--reuse-proof",
        action="store_true",
        help="Audit existing JLR-FE-FRONT-FPK-DB-KNOWLEDGE-PROOF.json (no re-prove)",
    )
    args = ap.parse_args()

    proof = ensure_proof(
        args.twin,
        skip_writeback=args.skip_writeback,
        reuse_proof=args.reuse_proof,
    )
    matrix = build_matrix(proof)
    sol = None
    if not args.skip_sol:
        key = load_key()
        if not key:
            print("OPENROUTER_API_KEY missing — writing matrix only", file=sys.stderr)
            write_artefacts(args.twin, matrix, None)
            return 2
        sol = call_sol(key, matrix)
    write_artefacts(args.twin, matrix, sol)

    det_ok = matrix["deterministic_useful"]
    sol_ok = True
    if sol and not sol.get("parse_error"):
        sol_ok = bool(sol.get("categorical_proof_accepted")) and (
            (sol.get("db_knowledge_verdict") or sol.get("verdict")) == "PASS"
        )
    print(
        json.dumps(
            {
                "deterministic_useful": det_ok,
                "sol_ok": sol_ok if sol else None,
                "db_knowledge_verdict": (sol or {}).get("db_knowledge_verdict"),
                "ship_readiness_verdict": (sol or {}).get("ship_readiness_verdict"),
                "bars_pass": f"{matrix['bars_pass_count']}/{matrix['bars_total']}",
            },
            indent=2,
        )
    )
    if not det_ok:
        return 1
    if sol and not sol_ok:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
