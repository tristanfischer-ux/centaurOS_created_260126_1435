#!/usr/bin/env python3
"""
Retrieval helper for the Phase 4 RAG corpus.

Public API
----------
    retrieve_relevant_records(
        query: str,
        k: int = 5,
        tables: list[str] | None = None,
        classes: list[str] | None = None,     # reserved; module_assignment filter for parts
        db_path: Path | None = None,
    ) -> list[dict]

Each returned dict contains:
    {
        'table': str,              # source table name
        'id': int,                 # row id in that table
        'document_id': int,
        'score': float,            # cosine similarity in [-1, 1]
        'text': str,               # composed text used for embedding
        'fields': dict,            # raw row fields (subset relevant to caller)
    }

CLI usage
---------
    python3 scripts/rag/retrieve.py "containerised 5 MWh BESS, LFP cells, 1 MW PCS"
    python3 scripts/rag/retrieve.py "monobloc heat pump R290" --k 10
    python3 scripts/rag/retrieve.py "DC fast EV charger 150 kW" --tables pretraining_extracted_parts

Engine C / W1 callers should `from scripts.rag.retrieve import retrieve_relevant_records`.
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Iterable

import numpy as np
from openai import OpenAI

DEFAULT_DB = Path.home() / ".forge-truth" / "forge-truth.db"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536

ALL_TABLES = [
    "pretraining_extracted_parts",
    "pretraining_extracted_specs",
    "pretraining_extracted_suppliers",
    "pretraining_extracted_standards",
]

# Field shortlist returned in `fields` for each table.
TABLE_FIELDS: dict[str, list[str]] = {
    "pretraining_extracted_parts": [
        "id", "document_id", "part_name", "manufacturer", "part_number",
        "quantity", "unit_price_gbp", "module_assignment", "raw_excerpt",
    ],
    "pretraining_extracted_specs": [
        "id", "document_id", "spec_key", "spec_value", "spec_unit", "raw_excerpt",
    ],
    "pretraining_extracted_suppliers": [
        "id", "document_id", "company_name", "role", "website", "raw_excerpt",
    ],
    "pretraining_extracted_standards": [
        "id", "document_id", "standard_name", "scope", "raw_excerpt",
    ],
}


_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY not set")
        _client = OpenAI(api_key=key)
    return _client


def embed_query(query: str) -> np.ndarray:
    res = _get_client().embeddings.create(
        model=EMBED_MODEL,
        input=[query],
        dimensions=EMBED_DIM,
    )
    return np.asarray(res.data[0].embedding, dtype=np.float32)


def _compose_text_row(table: str, row: sqlite3.Row) -> str:
    """Reconstruct the text that was embedded (for display only)."""
    g = lambda k: (row[k] or "") if k in row.keys() else ""
    if table == "pretraining_extracted_parts":
        head = " ".join(x for x in (g("part_name"), g("manufacturer"), g("part_number")) if x)
    elif table == "pretraining_extracted_specs":
        head = " ".join(x for x in (g("spec_key"), g("spec_value"), g("spec_unit")) if x)
    elif table == "pretraining_extracted_suppliers":
        head = g("company_name") or ""
    elif table == "pretraining_extracted_standards":
        head = g("standard_name") or ""
    else:
        head = ""
    excerpt = g("raw_excerpt") or ""
    out = (str(head) + (" | " + str(excerpt) if excerpt else "")).strip()
    return out[:600]


def _load_table_matrix(
    con: sqlite3.Connection,
    table: str,
    classes: list[str] | None,
) -> tuple[np.ndarray, list[sqlite3.Row]]:
    """Load all (embedding, row) pairs for one table into memory."""
    fields = ", ".join(TABLE_FIELDS[table])
    where = "WHERE embedding IS NOT NULL"
    params: tuple = ()
    if classes and table == "pretraining_extracted_parts":
        placeholders = ", ".join("?" * len(classes))
        where += f" AND module_assignment IN ({placeholders})"
        params = tuple(classes)
    cur = con.execute(f"SELECT {fields}, embedding FROM {table} {where}", params)
    rows = cur.fetchall()
    if not rows:
        return np.empty((0, EMBED_DIM), dtype=np.float32), []
    vecs = np.empty((len(rows), EMBED_DIM), dtype=np.float32)
    for i, r in enumerate(rows):
        vecs[i] = np.frombuffer(r["embedding"], dtype=np.float32)
    return vecs, rows


def _normalise(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return mat / norms


def retrieve_relevant_records(
    query: str,
    k: int = 5,
    tables: list[str] | None = None,
    classes: list[str] | None = None,
    db_path: Path | None = None,
) -> list[dict]:
    """Return top-k records across the requested tables by cosine similarity."""
    if not query or not query.strip():
        raise ValueError("query must be non-empty")
    tables = tables or ALL_TABLES
    db_path = db_path or DEFAULT_DB

    q_vec = embed_query(query)
    q_vec = q_vec / (np.linalg.norm(q_vec) or 1.0)

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        # Heap of top-k across tables.
        all_hits: list[tuple[float, str, sqlite3.Row]] = []
        for t in tables:
            if t not in ALL_TABLES:
                raise ValueError(f"unknown table: {t}")
            mat, rows = _load_table_matrix(con, t, classes)
            if not rows:
                continue
            mat_n = _normalise(mat)
            scores = mat_n @ q_vec  # (N,)
            top_idx = np.argpartition(-scores, kth=min(k, len(scores) - 1))[:k]
            top_idx = top_idx[np.argsort(-scores[top_idx])]
            for idx in top_idx:
                all_hits.append((float(scores[idx]), t, rows[idx]))

        all_hits.sort(key=lambda x: -x[0])
        all_hits = all_hits[:k]

        results: list[dict] = []
        for score, t, row in all_hits:
            fields = {f: row[f] for f in TABLE_FIELDS[t]}
            results.append({
                "table": t,
                "id": row["id"],
                "document_id": row["document_id"],
                "score": score,
                "text": _compose_text_row(t, row),
                "fields": fields,
            })
        return results
    finally:
        con.close()


# ---------- CLI ----------------------------------------------------------

def _cli() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("query", nargs="?", help="natural-language query")
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument(
        "--tables",
        nargs="+",
        choices=ALL_TABLES,
        help="restrict to these tables (default: all four)",
    )
    ap.add_argument("--classes", nargs="+", help="module_assignment filter for parts")
    args = ap.parse_args()

    if not args.query:
        ap.print_help()
        return 2

    hits = retrieve_relevant_records(
        args.query,
        k=args.k,
        tables=args.tables,
        classes=args.classes,
    )
    print(f"\nQuery: {args.query}\nTop {len(hits)} of {args.k}:\n")
    for i, h in enumerate(hits, 1):
        print(f"  {i}. [{h['score']:+.3f}] ({h['table'].replace('pretraining_extracted_', '')}#{h['id']} doc={h['document_id']})")
        print(f"      {h['text'][:240]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
