#!/usr/bin/env python3
"""Structure *selected* literature formula snippets into runnable canon rows.

POLICY (Tristan 2026-07-30):
  We do NOT turn every formula-tagged snippet into executable code.
  Most paper snippets are incomplete, unit-ambiguous, or context-bound.
  We only structure formulas that:
    (1) have a non-empty expression,
    (2) map to a known physics-tree component or calculator pack keyword,
    (3) pass a cheap parse / symbol sanity check,
  and write them as fpk_executable:literature:* rows for dualSearch + Anvil.

The ~16 calculator packs remain the authority for design maths.
Literature formulas are supporting evidence / candidate closures.

Usage:
  python3 scripts/ingest/structure-fpk-high-value-formulas.py --limit 200
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DB = Path.home() / ".forge-truth" / "forge-truth.db"
PRODUCT_CLASS = "formula_e_front_mgu"
SOURCE_PREFIX = "fpk_executable:literature:"

# Keywords that indicate a snippet is worth structuring for FPK design.
PACK_KEYWORDS = (
    "torque",
    "power",
    "current",
    "voltage",
    "flux",
    "inductance",
    "capacit",
    "loss",
    "thermal",
    "resistance",
    "speed",
    "omega",
    "rpm",
    "gear",
    "ratio",
    "cool",
    "nusselt",
    "reynolds",
    "pressure",
    "stress",
    "magnet",
    "b_r",
    "remanen",
    "efficiency",
    "fill factor",
    "slot",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def looks_runnable(expression: str) -> bool:
    expr = (expression or "").strip()
    if len(expr) < 3 or len(expr) > 240:
        return False
    # Must look like a relation or algebraic expression, not prose.
    if not re.search(r"[=≈~]|\\frac|/|\*|×|\^", expr):
        return False
    # Reject pure prose sentences.
    if expr.count(" ") > 24:
        return False
    return True


def keyword_hit(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in PACK_KEYWORDS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """
        SELECT id, document_id, component_id, topic_id, symbol, expression,
               value_text, unit, excerpt, confidence, source_detail
        FROM fpk_extracted_claims
        WHERE claim_kind = 'formula'
          AND expression IS NOT NULL AND trim(expression) != ''
          AND COALESCE(source_detail,'') NOT LIKE 'fpk_executable:%'
        ORDER BY COALESCE(confidence,0) DESC, id DESC
        LIMIT ?
        """,
        (args.limit * 4,),  # oversample then filter
    ).fetchall()

    selected: list[sqlite3.Row] = []
    for r in rows:
        blob = " ".join(
            str(x or "")
            for x in (r["symbol"], r["expression"], r["value_text"], r["excerpt"])
        )
        if looks_runnable(str(r["expression"])) and keyword_hit(blob):
            selected.append(r)
        if len(selected) >= args.limit:
            break

    report = {
        "schema": "fpk-structure-high-value-formulas/v1",
        "stamped_at": utc_now(),
        "policy": "NOT all formula snippets; only high-value runnable candidates",
        "scanned": len(rows),
        "selected": len(selected),
        "dry_run": args.dry_run,
        "samples": [],
    }

    if args.dry_run:
        for r in selected[:20]:
            report["samples"].append(
                {
                    "id": r["id"],
                    "symbol": r["symbol"],
                    "expression": (r["expression"] or "")[:120],
                    "component_id": r["component_id"],
                }
            )
        print(json.dumps(report, indent=2))
        return 0

    # Ensure a literature-structured canon doc exists
    doc_url = "internal://forgeos/fpk-literature-structured-formulas"
    row = con.execute(
        "SELECT id FROM pretraining_spec_documents WHERE source_url = ?",
        (doc_url,),
    ).fetchone()
    if row:
        doc_id = row[0]
    else:
        cur = con.execute(
            """
            INSERT INTO pretraining_spec_documents
              (product_class, manufacturer, product_name, source_url, document_type,
               extraction_status, extracted_full_text, source_type, extracted_at)
            VALUES (?, 'ForgeOS', ?, ?, 'executable_canon', 'fulltext', ?,
                    'fpk_literature', datetime('now'))
            """,
            (
                PRODUCT_CLASS,
                "FPK literature structured formulas (selected)",
                doc_url,
                "Selected literature formulas structured for search/Anvil — not all snippets.",
            ),
        )
        doc_id = cur.lastrowid

    # Replace previous literature-structured specs for this doc
    con.execute(
        "DELETE FROM pretraining_extracted_specs WHERE document_id = ? AND spec_key LIKE 'fpk:executable:literature:%'",
        (doc_id,),
    )
    written = 0
    for r in selected:
        expr = str(r["expression"] or "")
        symbol = str(r["symbol"] or f"lit_{r['id']}")
        key = f"fpk:executable:literature:{symbol}:{r['id']}"
        excerpt = (r["excerpt"] or expr)[:500]
        con.execute(
            """
            INSERT OR IGNORE INTO pretraining_extracted_specs
              (document_id, spec_key, spec_value, spec_unit, raw_excerpt,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (
                doc_id,
                key,
                expr[:500],
                r["unit"],
                excerpt,
            ),
        )
        # Mirror as a tagged claim for provenance search
        con.execute(
            """
            INSERT INTO fpk_extracted_claims
              (document_id, product_class, component_id, topic_id, claim_kind,
               symbol, expression, value_text, unit, excerpt, confidence,
               source_detail)
            VALUES (?, ?, ?, ?, 'formula', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc_id,
                PRODUCT_CLASS,
                r["component_id"],
                r["topic_id"],
                symbol,
                expr,
                r["value_text"],
                r["unit"],
                excerpt,
                min(float(r["confidence"] or 0.5), 0.7),
                f"{SOURCE_PREFIX}{r['id']}",
            ),
        )
        written += 1
        if len(report["samples"]) < 15:
            report["samples"].append(
                {"id": r["id"], "symbol": symbol, "expression": expr[:120]}
            )

    con.commit()
    report["written"] = written
    report["document_id"] = doc_id
    out = (
        ROOT
        / "out/formula-e-front-mgu-20260729-1432/_autonomous/structure-high-value-formulas.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
