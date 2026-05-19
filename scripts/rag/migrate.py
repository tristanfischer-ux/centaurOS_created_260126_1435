#!/usr/bin/env python3
"""
Idempotent schema migration: add `embedding BLOB` + `embed_hash TEXT` columns
to the four pretraining_extracted_* tables and a covering index on embed_hash.

Storage layout
--------------
- `embedding`  : raw bytes of np.float32 vector (dim=EMBED_DIM = 1536)
- `embed_hash` : sha256(text)[:32]  — used to skip re-embedding on rerun

Run:  python3 scripts/rag/migrate.py
"""
import sqlite3
import sys
from pathlib import Path

DB = Path.home() / ".forge-truth" / "forge-truth.db"

TABLES = [
    "pretraining_extracted_parts",
    "pretraining_extracted_specs",
    "pretraining_extracted_suppliers",
    "pretraining_extracted_standards",
]


def column_exists(con: sqlite3.Connection, table: str, col: str) -> bool:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == col for r in rows)


def add_column_if_missing(con: sqlite3.Connection, table: str, col: str, decl: str) -> bool:
    if column_exists(con, table, col):
        return False
    con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    return True


def main() -> int:
    if not DB.exists():
        print(f"ERROR: db not found at {DB}", file=sys.stderr)
        return 1
    con = sqlite3.connect(str(DB))
    try:
        for t in TABLES:
            added_emb = add_column_if_missing(con, t, "embedding", "BLOB")
            added_hash = add_column_if_missing(con, t, "embed_hash", "TEXT")
            con.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{t}_embed_hash ON {t}(embed_hash)"
            )
            print(
                f"{t}: embedding {'added' if added_emb else 'present'}, "
                f"embed_hash {'added' if added_hash else 'present'}, index ok"
            )
        con.commit()
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
