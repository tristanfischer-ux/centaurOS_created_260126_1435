#!/usr/bin/env python3
"""Wire extracted FPK literature claims into canonical physics-tree leaves.

INTENT: Literature extraction is useful to the design only when every claim has
an auditable, exact component link. This front keeps literature advisory:
claim references never close race holds or upgrade ship readiness.

Usage:
  python3 scripts/fe-front-wire-fpk-claims.py \
    --twin out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TWIN = ROOT / "out" / "formula-e-front-mgu-20260729-1432"
DEFAULT_DB = Path.home() / ".forge-truth" / "forge-truth.db"
DEFAULT_PRODUCT_CLASS = "formula_e_front_mgu"
REPORT_NAME = "JLR-FE-FRONT-FPK-CLAIM-WIRING.json"


def _atomic_write_json(path: Path, value: object) -> None:
    """Write JSON through an adjacent temporary file and atomic rename."""
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temp.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def _leaf_ids(part_index: list[dict[str, Any]]) -> set[str]:
    """Return childless canonical node IDs from the flattened tree index."""
    parent_ids = {
        str(entry["parent_id"])
        for entry in part_index
        if entry.get("parent_id") is not None
    }
    return {
        str(entry["id"])
        for entry in part_index
        if entry.get("id") is not None and str(entry["id"]) not in parent_ids
    }


def _claim_ref(row: sqlite3.Row) -> dict[str, Any]:
    """Build a compact, source-bearing reference without implying closure."""
    doi = row["doi"]
    source_url = row["source_url"]
    provenance = (
        "PEER_LITERATURE"
        if (isinstance(doi, str) and doi.strip())
        or (isinstance(source_url, str) and source_url.strip())
        else "ESTIMATE_UNVALIDATED"
    )
    return {
        "claim_id": int(row["id"]),
        "document_id": int(row["document_id"]),
        "topic_id": row["topic_id"],
        "claim_kind": row["claim_kind"],
        "symbol": row["symbol"],
        "expression": row["expression"],
        "value_text": row["value_text"],
        "unit": row["unit"],
        "material_grade": row["material_grade"],
        "elements": row["elements"],
        "density_kg_m3": row["density_kg_m3"],
        "excerpt": row["excerpt"],
        "page_hint": row["page_hint"],
        "confidence": row["confidence"],
        "source_detail": row["source_detail"],
        "doi": doi,
        "source_url": source_url,
        "provenance": provenance,
        # GOTCHA: Literature can guide a design, but never resolves FIA,
        # dyno, HIL, supplier, FEA, or CFD evidence holds by itself.
        "closure_effect": "NONE",
    }


def _load_claim_rows(
    db_path: Path,
    *,
    product_class: str,
) -> tuple[int, int, list[sqlite3.Row]]:
    """Load eligible claims and aggregate skip counts from forge-truth."""
    if not db_path.is_file():
        raise FileNotFoundError(f"missing literature database: {db_path}")
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        counts = con.execute(
            """
            SELECT
              COUNT(*) AS claims_total,
              SUM(CASE WHEN claim_kind = 'no_claim' THEN 1 ELSE 0 END)
                AS claims_no_claim
            FROM fpk_extracted_claims
            WHERE product_class = ?
            """,
            (product_class,),
        ).fetchone()
        rows = con.execute(
            """
            SELECT
              c.id,
              c.document_id,
              c.component_id,
              c.topic_id,
              c.claim_kind,
              c.symbol,
              c.expression,
              c.value_text,
              c.unit,
              c.material_grade,
              c.elements,
              c.density_kg_m3,
              c.excerpt,
              c.page_hint,
              c.confidence,
              c.source_detail,
              d.source_url,
              (
                SELECT MAX(cl.doi)
                FROM fpk_component_literature cl
                WHERE cl.document_id = c.document_id
                  AND cl.doi IS NOT NULL
                  AND trim(cl.doi) <> ''
              ) AS doi
            FROM fpk_extracted_claims c
            LEFT JOIN pretraining_spec_documents d ON d.id = c.document_id
            WHERE c.product_class = ?
              AND c.claim_kind <> 'no_claim'
            ORDER BY c.id
            """,
            (product_class,),
        ).fetchall()
        return (
            int(counts["claims_total"] or 0),
            int(counts["claims_no_claim"] or 0),
            rows,
        )
    finally:
        con.close()


def wire_twin(
    *,
    twin: Path,
    db_path: Path,
    product_class: str = DEFAULT_PRODUCT_CLASS,
    stamped_at: str | None = None,
) -> dict[str, Any]:
    """Attach exact component claims to canonical leaves and write the report.

    Args:
        twin: Twin directory containing ``state.json``.
        db_path: forge-truth SQLite database.
        product_class: Claim namespace to read.
        stamped_at: Optional deterministic timestamp for tests.

    Returns:
        The complete claim-wiring report.

    Raises:
        FileNotFoundError: If the twin state or database is absent.
        ValueError: If the twin lacks a valid FPK physics-tree part index.
    """
    state_path = twin / "state.json"
    if not state_path.is_file():
        raise FileNotFoundError(f"missing twin state: {state_path}")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    physics_tree = state.get("fpkPhysicsTree")
    if not isinstance(physics_tree, dict):
        raise ValueError("state.fpkPhysicsTree must be an object")
    part_index = physics_tree.get("part_index")
    if not isinstance(part_index, list) or not all(
        isinstance(entry, dict) for entry in part_index
    ):
        raise ValueError("state.fpkPhysicsTree.part_index must be an object array")

    leaf_ids = _leaf_ids(part_index)
    claims_total, claims_no_claim, rows = _load_claim_rows(
        db_path,
        product_class=product_class,
    )

    matched: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unmatched_rows: list[sqlite3.Row] = []
    eligible_by_kind: Counter[str] = Counter()
    wired_by_kind: Counter[str] = Counter()
    for row in rows:
        kind = str(row["claim_kind"])
        eligible_by_kind[kind] += 1
        component_id = row["component_id"]
        if isinstance(component_id, str) and component_id in leaf_ids:
            ref = _claim_ref(row)
            matched[component_id].append(ref)
            wired_by_kind[kind] += 1
        else:
            unmatched_rows.append(row)

    # DECISION: Exact canonical IDs only. Alias/fuzzy matching would turn LLM
    # component hints into hidden engineering assertions.
    for entry in part_index:
        entry.pop("claim_refs", None)
        node_id = entry.get("id")
        if isinstance(node_id, str) and node_id in matched:
            entry["claim_refs"] = matched[node_id]

    now = stamped_at or datetime.now(ZoneInfo("Europe/London")).isoformat(
        timespec="seconds"
    )
    counts = {
        "tree_nodes": len(part_index),
        "tree_leaves": len(leaf_ids),
        "claims_total": claims_total,
        "claims_no_claim_skipped": claims_no_claim,
        "claims_eligible": len(rows),
        "claims_wired": sum(len(refs) for refs in matched.values()),
        "claims_unmatched": len(unmatched_rows),
        "claim_components_total": len(
            {
                str(row["component_id"])
                for row in rows
                if row["component_id"] is not None
            }
        ),
        "leaves_with_claim_refs": len(matched),
        "leaves_without_claim_refs": len(leaf_ids) - len(matched),
    }
    unmatched_component_ids = sorted(
        {
            str(row["component_id"])
            if row["component_id"] is not None
            else "<NULL>"
            for row in unmatched_rows
        }
    )
    report = {
        "schema": "fpk-claim-wiring/v1",
        "stamped_at": now,
        "source": "scripts/fe-front-wire-fpk-claims.py",
        "product_class": product_class,
        "database": str(db_path),
        "twin": str(twin),
        "matching_policy": "EXACT_COMPONENT_ID_TO_CHILDLESS_PHYSICS_TREE_LEAF",
        "provenance_policy": (
            "PEER_LITERATURE only with DOI or source_url; "
            "otherwise ESTIMATE_UNVALIDATED"
        ),
        "closure_effect": "NONE",
        "ship_ok": False,
        "counts": counts,
        "eligible_claims_by_kind": dict(sorted(eligible_by_kind.items())),
        "wired_claims_by_kind": dict(sorted(wired_by_kind.items())),
        "matched_component_ids": sorted(matched),
        "unmatched_component_ids": unmatched_component_ids,
        "claim_refs_by_component": {
            component_id: refs
            for component_id, refs in sorted(matched.items())
        },
        "unmatched_claims": [
            {
                "claim_id": int(row["id"]),
                "document_id": int(row["document_id"]),
                "component_id": row["component_id"],
                "claim_kind": row["claim_kind"],
                "closure_effect": "NONE",
            }
            for row in unmatched_rows
        ],
    }
    report_path = twin / REPORT_NAME
    summary = {
        key: report[key]
        for key in (
            "schema",
            "stamped_at",
            "source",
            "matching_policy",
            "provenance_policy",
            "closure_effect",
            "ship_ok",
            "counts",
            "eligible_claims_by_kind",
            "wired_claims_by_kind",
            "matched_component_ids",
            "unmatched_component_ids",
        )
    }
    summary["report"] = REPORT_NAME
    state["fpkClaimWiring"] = summary

    twin.mkdir(parents=True, exist_ok=True)
    _atomic_write_json(report_path, report)
    _atomic_write_json(state_path, state)
    return report


def main() -> int:
    """Run claim wiring from the command line."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--product-class", default=DEFAULT_PRODUCT_CLASS)
    args = parser.parse_args()
    try:
        report = wire_twin(
            twin=args.twin,
            db_path=args.db,
            product_class=args.product_class,
        )
    except (FileNotFoundError, ValueError, json.JSONDecodeError, sqlite3.Error) as error:
        print(f"[fpk-claim-wiring] ERROR: {error}", file=sys.stderr)
        return 1

    counts = report["counts"]
    print(
        "[fpk-claim-wiring] "
        f"leaves={counts['tree_leaves']} "
        f"with_refs={counts['leaves_with_claim_refs']} "
        f"claims={counts['claims_total']} "
        f"eligible={counts['claims_eligible']} "
        f"wired={counts['claims_wired']} "
        f"unmatched={counts['claims_unmatched']} "
        f"no_claim_skipped={counts['claims_no_claim_skipped']}"
    )
    print(f"[fpk-claim-wiring] report={args.twin / REPORT_NAME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
