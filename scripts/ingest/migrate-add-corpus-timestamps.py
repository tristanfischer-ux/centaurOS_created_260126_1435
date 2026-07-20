#!/usr/bin/env python3
"""A4 (2026-07-20) — add created_at/updated_at to the growing-DB corpus tables and
backfill honest historic dates, so the operator freshness surface (state.growingDb +
the Excel 'Growing DB last activity' row) can report a real per-table max age.

IDEMPOTENT + additive only:
  * ``pretraining_extracted_specs``      + created_at, updated_at (backfill from the
                                            parent pretraining_spec_documents.extracted_at)
  * ``pretraining_extracted_standards``  + created_at, updated_at (same parent backfill)
  * ``pretraining_extracted_parts``      + backfill NULL discovered_at with an HONEST
                                            historic seed sentinel (NOT datetime('now') —
                                            that would make 35k seed rows read as
                                            "discovered today" and poison the freshness
                                            signal this migration exists to feed).

The seed sentinel is the K10 baked-snapshot date (2026-05-18) — these rows were seeded
at or before that build; their true per-row discovery date is unrecoverable, so we mark
them with a single truthful historic date + a discovery_source provenance note. Because
the freshness surface reports the MOST-RECENT write (max_ts), an old sentinel never
inflates "last activity" — a genuine recent write still dominates.

Run:  python3 scripts/ingest/migrate-add-corpus-timestamps.py [--dry-run] [--db PATH]
"""
import argparse
import os
import sqlite3
import sys

DEFAULT_DB = os.path.expanduser("~/.forge-truth/forge-truth.db")
# The K10 baked-snapshot date — the honest "seeded at or before this build" marker for
# rows that predate row-level timestamps (their true discovery date is unrecoverable).
SEED_SENTINEL = "2026-05-18T00:00:00Z"
SEED_PROVENANCE = "backfill:pre-timestamp-seed (true date unknown, K10 baked snapshot)"


def _cols(cur, table):
    return {r[1] for r in cur.execute(f"PRAGMA table_info('{table}')")}


def _add_col(cur, table, col, decl, dry):
    if col in _cols(cur, table):
        print(f"  · {table}.{col} already present — skip")
        return False
    print(f"  {'WOULD ADD' if dry else 'ADD'} {table}.{col} {decl}")
    if not dry:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    return True


def _backfill_child_ts(cur, table, dry):
    """created_at/updated_at <- parent pretraining_spec_documents.extracted_at (join on
    document_id). Only fills rows still NULL — re-running never overwrites a real stamp."""
    has_cols = {"created_at", "updated_at"} <= _cols(cur, table)
    if not has_cols:
        # dry-run before the ADD COLUMN happens — every joinable row is a candidate.
        n = cur.execute(
            f"""SELECT COUNT(*) FROM {table} c
                JOIN pretraining_spec_documents d ON c.document_id = d.id
                WHERE d.extracted_at IS NOT NULL"""
        ).fetchone()[0]
    else:
        n = cur.execute(
            f"""SELECT COUNT(*) FROM {table} c
                JOIN pretraining_spec_documents d ON c.document_id = d.id
                WHERE d.extracted_at IS NOT NULL AND (c.created_at IS NULL OR c.updated_at IS NULL)"""
        ).fetchone()[0]
    print(f"  {'WOULD backfill' if dry else 'backfill'} {n} {table} row(s) from parent extracted_at")
    if not dry and n:
        cur.execute(
            f"""UPDATE {table}
                SET created_at = COALESCE(created_at,
                        (SELECT d.extracted_at FROM pretraining_spec_documents d WHERE d.id = {table}.document_id)),
                    updated_at = COALESCE(updated_at,
                        (SELECT d.extracted_at FROM pretraining_spec_documents d WHERE d.id = {table}.document_id))
                WHERE document_id IN (SELECT id FROM pretraining_spec_documents WHERE extracted_at IS NOT NULL)
                  AND (created_at IS NULL OR updated_at IS NULL)"""
        )


def _backfill_parts(cur, dry):
    n = cur.execute(
        "SELECT COUNT(*) FROM pretraining_extracted_parts WHERE discovered_at IS NULL"
    ).fetchone()[0]
    print(f"  {'WOULD backfill' if dry else 'backfill'} {n} parts row(s) with honest seed "
          f"sentinel {SEED_SENTINEL} (NOT datetime('now'))")
    if not dry and n:
        cur.execute(
            """UPDATE pretraining_extracted_parts
               SET discovered_at = ?,
                   discovery_source = COALESCE(NULLIF(discovery_source, ''), ?)
               WHERE discovered_at IS NULL""",
            (SEED_SENTINEL, SEED_PROVENANCE),
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--db", default=DEFAULT_DB)
    args = ap.parse_args()
    if not os.path.exists(args.db):
        print(f"[migrate] DB not found: {args.db}", file=sys.stderr)
        return 1
    print(f"[migrate] {'DRY-RUN — no writes' if args.dry_run else 'APPLYING'} on {args.db}")
    con = sqlite3.connect(args.db)
    cur = con.cursor()
    try:
        for tbl in ("pretraining_extracted_specs", "pretraining_extracted_standards"):
            _add_col(cur, tbl, "created_at", "TEXT", args.dry_run)
            _add_col(cur, tbl, "updated_at", "TEXT", args.dry_run)
            _backfill_child_ts(cur, tbl, args.dry_run)
        _backfill_parts(cur, args.dry_run)
        if not args.dry_run:
            con.commit()
            print("[migrate] committed.")
        else:
            print("[migrate] dry-run complete (no changes written).")
        # report post-state (or would-be) max timestamps
        for tbl, col in (("pretraining_extracted_specs", "updated_at"),
                         ("pretraining_extracted_standards", "updated_at"),
                         ("pretraining_extracted_parts", "discovered_at")):
            if col in _cols(cur, tbl):
                mx = cur.execute(f"SELECT MAX({col}), SUM({col} IS NULL) FROM {tbl}").fetchone()
                print(f"  {tbl}.{col}: max={mx[0]} · still-null={mx[1]}")
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
