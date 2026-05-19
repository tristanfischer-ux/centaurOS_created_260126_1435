#!/usr/bin/env python3
"""
JSON-output wrapper around scripts/rag/retrieve.py.

W1 RAG-at-emission layer (Stage 1.7) — designed to be invoked as a child
process from the TypeScript wrapper at
`src/lib/pdf-engine-v2/retrieve-references.ts`. Keeps retrieve.py untouched
(per the W1 brief constraint: "DO NOT modify retrieve.py").

Usage
-----
    python3 scripts/rag/retrieve_json.py \
        --query "<brief text>" \
        --k 5 \
        --tables pretraining_extracted_parts,pretraining_extracted_specs \
        [--classes module_a,module_b]

Output: a single JSON object on stdout:
    {
      "ok": true,
      "k": 5,
      "results": [
        {
          "table": "pretraining_extracted_parts",
          "id": 13113,
          "document_id": 583,
          "score": 0.662,
          "product_class": "bess-utility-scale",
          "manufacturer": "CATL",
          "product_name": "...",
          "module_assignment": "energy_storage_source",
          "sub_module_assignment": null,
          "part_name": "228Ah LFP Cell ...",
          "part_number": "...",
          "raw_excerpt": "228 LFP 53.7×173.9×204.6 ...",
          "spec_key": null,
          "spec_value": null,
          "spec_unit": null,
          "composed_text": "228Ah LFP Cell ... | ..."
        },
        ...
      ]
    }

On failure, exit code 0 with:
    { "ok": false, "error": "<message>", "results": [] }

This keeps the TS caller's error path simple — it always parses JSON.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

# Import the existing retrieval function — do NOT duplicate logic.
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR.parent.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR.parent.parent))

try:
    from scripts.rag.retrieve import (  # type: ignore
        retrieve_relevant_records,
        DEFAULT_DB,
    )
except Exception:  # pragma: no cover — fallback for direct invocations
    # Fall back to local import when CWD already places scripts on sys.path.
    sys.path.insert(0, str(SCRIPT_DIR))
    from retrieve import retrieve_relevant_records, DEFAULT_DB  # type: ignore


def _split_csv(value: str | None) -> list[str] | None:
    if not value:
        return None
    parts = [s.strip() for s in value.split(",") if s.strip()]
    return parts or None


def _enrich_with_document(
    db_path: Path,
    hits: list[dict],
) -> list[dict]:
    """Join document metadata (product_class, manufacturer, product_name) onto each hit."""
    if not hits:
        return hits
    doc_ids = sorted({int(h["document_id"]) for h in hits if h.get("document_id") is not None})
    if not doc_ids:
        return hits
    placeholders = ", ".join("?" * len(doc_ids))
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        cur = con.execute(
            f"SELECT id, product_class, manufacturer, product_name, source_url "
            f"FROM pretraining_spec_documents WHERE id IN ({placeholders})",
            tuple(doc_ids),
        )
        doc_map = {row["id"]: dict(row) for row in cur.fetchall()}
    finally:
        con.close()

    enriched: list[dict] = []
    for h in hits:
        doc = doc_map.get(int(h["document_id"])) or {}
        fields = h.get("fields") or {}
        enriched.append({
            "table": h["table"],
            "id": h["id"],
            "document_id": h["document_id"],
            "score": round(float(h["score"]), 4),
            "product_class": doc.get("product_class"),
            "manufacturer_doc": doc.get("manufacturer"),
            "product_name": doc.get("product_name"),
            "source_url": doc.get("source_url"),
            # Part-table fields (may be missing for specs/etc.)
            "part_name": fields.get("part_name"),
            "manufacturer": fields.get("manufacturer"),
            "part_number": fields.get("part_number"),
            "quantity": fields.get("quantity"),
            "unit_price_gbp": fields.get("unit_price_gbp"),
            "module_assignment": fields.get("module_assignment"),
            # Spec-table fields
            "spec_key": fields.get("spec_key"),
            "spec_value": fields.get("spec_value"),
            "spec_unit": fields.get("spec_unit"),
            # Supplier/standard fields (best-effort)
            "company_name": fields.get("company_name"),
            "role": fields.get("role"),
            "standard_name": fields.get("standard_name"),
            "scope": fields.get("scope"),
            # Common
            "raw_excerpt": fields.get("raw_excerpt"),
            "composed_text": h.get("text"),
        })
    return enriched


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument(
        "--tables",
        default="pretraining_extracted_parts,pretraining_extracted_specs",
        help="comma-separated table names",
    )
    ap.add_argument("--classes", default=None, help="comma-separated module_assignment filter (parts only)")
    args = ap.parse_args()

    tables = _split_csv(args.tables)
    classes = _split_csv(args.classes)

    try:
        hits = retrieve_relevant_records(
            query=args.query,
            k=max(1, int(args.k)),
            tables=tables,
            classes=classes,
        )
        enriched = _enrich_with_document(DEFAULT_DB, hits)
        json.dump({"ok": True, "k": len(enriched), "results": enriched}, sys.stdout)
        sys.stdout.write("\n")
        return 0
    except Exception as exc:  # broad catch — exit 0 with JSON error
        json.dump({"ok": False, "error": f"{type(exc).__name__}: {exc}", "results": []}, sys.stdout)
        sys.stdout.write("\n")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
