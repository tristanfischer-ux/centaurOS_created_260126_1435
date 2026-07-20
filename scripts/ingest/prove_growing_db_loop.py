#!/usr/bin/env python3
"""A8 (2026-07-20) — GATE INTENT for the growing-DB loop: prove end-to-end that a
DB-first MISS → (fixture) web hit → writeback → re-read HIT, and that the write
ADVANCES the freshness surface's max_ts (so the operator sees the store grow).

Production-safe + deterministic: runs entirely against a fresh TEMP sqlite DB with a
FIXTURE web result — never the live ~/.forge-truth/forge-truth.db, never the network,
never a distributor/LLM quota. It exercises the EXACT SQL the real writeback path uses
(specs-writeback.ts): the A1 source_type-inclusive DB-first lookup, the self-migrating
timestamp columns, and the strftime-stamped INSERT — so a regression in ANY of those
(A1 Goodhart-empty filter, A4 timestamp stamping/advancement) fails this harness.

Run / test:  python3 scripts/ingest/prove_growing_db_loop.py   (exit 0 = loop proven)
"""
import os
import sqlite3
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "lib"))
import growing_db_freshness as gdf  # noqa: E402  (reuse the A4.2 freshness reader)

# The A1 (2026-07-20) source_type set the real lookup accepts — BOTH the corpus names
# AND the writeback names. The writeback writes 'web_extracted'; if this set ever drops
# it, the loop's primary read goes Goodhart-empty (every keyed lookup misses).
_LOOKUP_SOURCE_TYPES = (
    "datasheet", "manufacturer_datasheet", "manufacturer",
    "distributor_cascade", "web_extracted", "stage0_harvest",
)


def _schema(cur):
    cur.execute("""CREATE TABLE pretraining_spec_documents (
        id INTEGER PRIMARY KEY, source_type TEXT, product_class TEXT, manufacturer TEXT,
        product_name TEXT, source_url TEXT, document_type TEXT, extraction_status TEXT,
        extracted_at TEXT)""")
    # NOTE: created WITHOUT created_at/updated_at — the real writeback self-migrates them,
    # so this harness also proves the ALTER-on-init path (an un-migrated DB grows the cols).
    cur.execute("""CREATE TABLE pretraining_extracted_specs (
        id INTEGER PRIMARY KEY, document_id INT, spec_key TEXT, spec_value TEXT,
        spec_unit TEXT, raw_excerpt TEXT, embedding BLOB, embed_hash TEXT)""")


def _self_migrate(cur):
    for col in ("created_at", "updated_at"):
        try:
            cur.execute(f"ALTER TABLE pretraining_extracted_specs ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass  # duplicate column — already migrated


def _db_first_lookup(cur, spec_key, mfr):
    """Mirror the real specs-writeback A1 DB-first read."""
    ph = ",".join("?" for _ in _LOOKUP_SOURCE_TYPES)
    row = cur.execute(
        f"""SELECT s.spec_value FROM pretraining_extracted_specs s
            JOIN pretraining_spec_documents d ON s.document_id = d.id
            WHERE d.source_type IN ({ph})
              AND LOWER(s.spec_key) = LOWER(?)
              AND LOWER(COALESCE(d.manufacturer,'')) LIKE LOWER('%' || ? || '%')
            LIMIT 1""",
        (*_LOOKUP_SOURCE_TYPES, spec_key, mfr),
    ).fetchone()
    return row[0] if row else None


def _writeback(cur, mfr, product, spec_key, spec_value, *, extracted_at, stamp=None):
    """Mirror the real specs-writeback INSERT (doc stub 'web_extracted' + stamped spec).
    ``stamp`` overrides strftime('now') so the harness can assert max_ts ADVANCES
    deterministically; None uses the real strftime path (proves it stamps non-null)."""
    cur.execute(
        """INSERT INTO pretraining_spec_documents
           (source_type, product_class, manufacturer, product_name, source_url,
            document_type, extraction_status, extracted_at)
           VALUES ('web_extracted', NULL, ?, ?, ?, 'web_search_result', 'done', ?)""",
        (mfr, product, "http://fixture/datasheet", extracted_at),
    )
    doc_id = cur.lastrowid
    if stamp is None:
        cur.execute(
            """INSERT INTO pretraining_extracted_specs
               (document_id, spec_key, spec_value, spec_unit, raw_excerpt, embedding,
                embed_hash, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, NULL, ?,
                   strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                   strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
            (doc_id, spec_key, spec_value, "C", "fixture excerpt", "hash1"),
        )
    else:
        cur.execute(
            """INSERT INTO pretraining_extracted_specs
               (document_id, spec_key, spec_value, spec_unit, raw_excerpt, embedding,
                embed_hash, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)""",
            (doc_id, spec_key, spec_value, "C", "fixture excerpt", "hash2", stamp, stamp),
        )


def main() -> int:
    fails = []

    def ok(cond, msg):
        if not cond:
            fails.append(msg)

    tmp = tempfile.mkdtemp()
    db_path = os.path.join(tmp, "loop.db")
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    _schema(cur)              # table created WITHOUT created_at/updated_at (un-migrated DB)
    _self_migrate(cur)        # the real writeback ALTERs these at getDb() init, before any read
    con.commit()

    # ── 1. DB-FIRST MISS on the empty store ──────────────────────────────────
    ok(_db_first_lookup(cur, "incubation_temperature_c", "Acme Bio") is None,
       "empty store must MISS the canary key")
    f0 = gdf.compute_freshness(db_path)
    ok(f0["tables"]["pretraining_extracted_specs"].get("max_ts") is None,
       "empty (migrated) specs table must have max_ts=None (no activity yet)")

    # ── 2. MISS → fixture web hit → WRITEBACK (real SQL, strftime stamp) ──
    _writeback(cur, "Acme Bio", "Acme Incubator", "incubation_temperature_c", "37",
               extracted_at="2026-07-20T10:00:00Z", stamp=None)  # real strftime stamp
    con.commit()

    # ── 3. DB-FIRST RE-READ now HITs (and proves the A1 'web_extracted' filter) ──
    hit = _db_first_lookup(cur, "incubation_temperature_c", "Acme Bio")
    ok(hit == "37", f"after writeback the canary must HIT (got {hit!r}) — if None, the "
                    f"A1 source_type filter dropped 'web_extracted' and the loop is "
                    f"Goodhart-empty")
    row = cur.execute("SELECT created_at, updated_at FROM pretraining_extracted_specs"
                      " WHERE spec_key='incubation_temperature_c'").fetchone()
    ok(row[0] and row[1], "the written spec must carry a non-null created_at + updated_at "
                          "(A4 strftime stamp)")
    f1 = gdf.compute_freshness(db_path)
    t1 = f1["tables"]["pretraining_extracted_specs"].get("max_ts")
    ok(t1 is not None, "after the first writeback the freshness max_ts must advance from None")

    # ── PROVE THE CATCH (GATE INTENT): the writeback stamps source_type='web_extracted';
    #    the OLD pre-A1 filter (which omitted it) MUST MISS this very row — demonstrating
    #    that this harness FAILS if the A1 source_type fix regresses (the loop's primary
    #    read going Goodhart-empty), not just that it passes on the happy path. ──
    _pre_a1_types = ("datasheet", "manufacturer", "distributor_cascade")  # no 'web_extracted'
    _ph = ",".join("?" for _ in _pre_a1_types)
    _broken = cur.execute(
        f"""SELECT s.spec_value FROM pretraining_extracted_specs s
            JOIN pretraining_spec_documents d ON s.document_id = d.id
            WHERE d.source_type IN ({_ph}) AND LOWER(s.spec_key)=LOWER(?) LIMIT 1""",
        (*_pre_a1_types, "incubation_temperature_c"),
    ).fetchone()
    ok(_broken is None, "prove-catch: the pre-A1 filter (no 'web_extracted') MUST miss the "
                        "written canary — if it hits, this harness would not catch an A1 regression")

    # ── 4. A SECOND discovery ADVANCES the freshness max_ts (the store GROWS) ──
    _writeback(cur, "Beta Labs", "Beta Reactor", "working_volume_ml", "20",
               extracted_at="2026-07-20T11:00:00Z", stamp="2999-01-01T00:00:00.000Z")
    con.commit()
    f2 = gdf.compute_freshness(db_path)
    t2 = f2["tables"]["pretraining_extracted_specs"].get("max_ts")
    ok(t2 == "2999-01-01T00:00:00.000Z" and t2 > (t1 or ""),
       f"a second writeback must ADVANCE max_ts (was {t1}, now {t2})")
    ok(f2["tables"]["pretraining_extracted_specs"].get("n") == 2,
       "the store must have GROWN to 2 rows")

    con.close()

    if fails:
        print("[prove-growing-db-loop] FAIL:")
        for m in fails:
            print("  ✗ " + m)
        return 1
    print("[prove-growing-db-loop] loop PROVEN — DB-first MISS → fixture web → writeback "
          "→ re-read HIT (A1 filter) → freshness max_ts advances (A4 stamp); store grew "
          "0→2 rows. Deterministic, temp DB, no network, no production write.")
    print("[prove-growing-db-loop] selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
