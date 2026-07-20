#!/usr/bin/env python3
"""A4.2 (2026-07-20) — the growing-DB operator freshness surface.

Reads ~/.forge-truth/forge-truth.db (READONLY) and reports, per corpus table, the
row count + the most-recent write (max_ts) + its age in days, so the chain can emit
``state.growingDb`` and the Excel 'Growing DB — last activity' row can show whether
the self-building DB is actually growing (and flag the materials table stale > 28 d).

Pure + deterministic: `now` is injected (never an implicit clock), so the same DB +
same now gives the same summary — unit-testable. Every table/column is optional; a
missing table or column reports ``present: false`` rather than raising, so the surface
degrades gracefully on an older DB (e.g. pre-A4.1, before created_at/updated_at exist).

CLI:  python3 scripts/lib/growing_db_freshness.py [--json] [--db PATH]
Test: python3 scripts/lib/growing_db_freshness.py --selftest
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone

DEFAULT_DB = os.path.expanduser("~/.forge-truth/forge-truth.db")
MATERIALS_STALE_DAYS = 28

# (table, timestamp column) — the write recency signal for each growing store.
_TABLE_TS = [
    ("pretraining_extracted_parts", "discovered_at"),
    ("pretraining_extracted_specs", "updated_at"),
    ("pretraining_extracted_standards", "updated_at"),
    ("distributor_cascade_cache", "fetched_at"),
    ("material_prices", "updated"),
]


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_ts(s: str | None) -> datetime | None:
    """Lenient parse of the corpus's mixed timestamp shapes (full ISO, ISO+Z, or a
    bare YYYY-MM-DD). Returns a tz-aware UTC datetime, or None if unparseable."""
    if not s:
        return None
    t = str(s).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(t)
    except ValueError:
        try:
            dt = datetime.strptime(str(s).strip()[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _has_table(cur, table: str) -> bool:
    return cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _cols(cur, table: str) -> set:
    return {r[1] for r in cur.execute(f"PRAGMA table_info('{table}')")}


def compute_freshness(db_path: str = DEFAULT_DB,
                      now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    out: dict = {"db_path": db_path, "now": _iso(now), "present": False, "tables": {}}
    if not os.path.exists(db_path):
        return out
    out["present"] = True
    try:
        out["db_mtime"] = _iso(datetime.fromtimestamp(os.path.getmtime(db_path), timezone.utc))
    except OSError:
        out["db_mtime"] = None
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cur = con.cursor()
    try:
        for table, col in _TABLE_TS:
            entry: dict = {"present": False, "ts_column": col}
            if _has_table(cur, table) and col in _cols(cur, table):
                entry["present"] = True
                n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                mx = cur.execute(f"SELECT MAX({col}) FROM {table}").fetchone()[0]
                entry["n"] = n
                entry["max_ts"] = mx
                dt = _parse_ts(mx)
                entry["age_days"] = (round((now - dt).total_seconds() / 86400.0, 1)
                                     if dt else None)
                # distributor cache also reports hit/expired quality
                if table == "distributor_cascade_cache":
                    entry["hits"] = cur.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE miss=0").fetchone()[0]
                    entry["expired"] = cur.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE expires_at < ?",
                        (_iso(now),)).fetchone()[0]
                # materials go stale — flag > 28 d so the operator refreshes (A5)
                if table == "material_prices":
                    entry["stale"] = bool(entry["age_days"] is not None
                                          and entry["age_days"] > MATERIALS_STALE_DAYS)
            out["tables"][table] = entry
    finally:
        con.close()
    # convenience roll-up: the freshest activity across the growing stores
    ages = [t["age_days"] for t in out["tables"].values()
            if t.get("present") and t.get("age_days") is not None]
    out["min_age_days"] = min(ages) if ages else None
    out["any_stale"] = any(t.get("stale") for t in out["tables"].values())
    return out


def _selftest() -> int:
    import tempfile

    fails: list[str] = []

    def chk(cond, msg):
        if not cond:
            fails.append(msg)

    tmp = tempfile.mkdtemp()
    db = os.path.join(tmp, "t.db")
    con = sqlite3.connect(db)
    c = con.cursor()
    c.execute("CREATE TABLE pretraining_extracted_parts (id INT, discovered_at TEXT)")
    c.executemany("INSERT INTO pretraining_extracted_parts VALUES (?,?)",
                  [(1, "2026-05-18T00:00:00Z"), (2, "2026-07-19T05:00:20Z"), (3, None)])
    c.execute("CREATE TABLE material_prices (material TEXT, updated TEXT)")
    c.executemany("INSERT INTO material_prices VALUES (?,?)",
                  [("steel", "2026-05-30"), ("copper", "2026-05-30")])
    c.execute("CREATE TABLE distributor_cascade_cache "
              "(id INT, fetched_at TEXT, expires_at TEXT, miss INT)")
    c.executemany("INSERT INTO distributor_cascade_cache VALUES (?,?,?,?)",
                  [(1, "2026-07-01T00:00:00Z", "2026-08-01T00:00:00Z", 0),
                   (2, "2026-06-01T00:00:00Z", "2026-06-15T00:00:00Z", 1)])
    con.commit(); con.close()

    now = datetime(2026, 7, 20, tzinfo=timezone.utc)
    f = compute_freshness(db, now=now)
    chk(f["present"] is True, "present should be True for an existing DB")
    p = f["tables"]["pretraining_extracted_parts"]
    chk(p["n"] == 3, f"parts n should be 3, got {p.get('n')}")
    chk(p["max_ts"] == "2026-07-19T05:00:20Z", f"parts max_ts wrong: {p.get('max_ts')}")
    # 2026-07-19T05:00 → 2026-07-20T00:00 = 18h59m ≈ 0.8 d (freshest write recency)
    chk(p["age_days"] == 0.8, f"parts age should be ~0.8 d, got {p.get('age_days')}")
    m = f["tables"]["material_prices"]
    chk(m["stale"] is True, "materials updated 2026-05-30 vs now 2026-07-20 (>28d) must be stale")
    d = f["tables"]["distributor_cascade_cache"]
    chk(d["hits"] == 1 and d["expired"] == 1,
        f"cache hits/expired wrong: {d.get('hits')}/{d.get('expired')}")
    chk(f["any_stale"] is True, "any_stale should be True (materials)")
    chk(f["min_age_days"] == 0.8, f"min_age should be 0.8 (freshest = parts), got {f.get('min_age_days')}")

    # graceful degradation: a DB missing the timestamp column reports present:false, no raise
    db2 = os.path.join(tmp, "old.db")
    con = sqlite3.connect(db2)
    con.execute("CREATE TABLE pretraining_extracted_specs (id INT, spec_key TEXT)")  # no updated_at
    con.commit(); con.close()
    f2 = compute_freshness(db2, now=now)
    chk(f2["tables"]["pretraining_extracted_specs"]["present"] is False,
        "a table missing its ts column must report present:false, not raise")

    # missing DB file → present:false, no raise
    f3 = compute_freshness(os.path.join(tmp, "nope.db"), now=now)
    chk(f3["present"] is False, "a missing DB file must report present:false")

    if fails:
        print("[growing-db-freshness][selftest] FAIL:")
        for x in fails:
            print("  ✗ " + x)
        return 1
    print("[growing-db-freshness] _selftest passed — freshness summary "
          "(counts, max_ts, age, materials-stale, cache hits/expired, graceful degrade)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="print the summary as JSON")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    import json
    summary = compute_freshness(args.db)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(f"[growing-db] {args.db} — freshest activity "
              f"{summary.get('min_age_days')} d ago; any_stale={summary.get('any_stale')}")
        for t, e in summary.get("tables", {}).items():
            if e.get("present"):
                extra = " STALE" if e.get("stale") else ""
                print(f"  {t:34s} n={e.get('n'):>7} max={e.get('max_ts')} "
                      f"({e.get('age_days')} d){extra}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
