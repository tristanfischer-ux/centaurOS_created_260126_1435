#!/usr/bin/env python3
"""seed-forge-truth-curated-parts.py — UNIVERSAL portable seed for verified PCB MPNs.

Reads scripts/data/curated-verified-parts.json and upserts into
~/.forge-truth/forge-truth.db pretraining_extracted_parts so
resolveVerifiedComponentIdentity can find catalogue rows on any machine.

Idempotent. Never deletes. Does not claim supplier fab readiness.

Usage:
  python3 scripts/seed-forge-truth-curated-parts.py
  python3 scripts/seed-forge-truth-curated-parts.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SEED = REPO / "scripts" / "data" / "curated-verified-parts.json"
DB = Path.home() / ".forge-truth" / "forge-truth.db"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--seed", type=Path, default=SEED)
    args = ap.parse_args()
    if not args.seed.is_file():
        print(f"[seed] missing {args.seed}", file=sys.stderr)
        return 2
    data = json.loads(args.seed.read_text())
    parts = data.get("parts") or []
    if not parts:
        print("[seed] empty parts list")
        return 0
    if not args.db.is_file():
        print(f"[seed] forge-truth.db not found at {args.db} — create via normal ingest first", file=sys.stderr)
        return 2
    con = sqlite3.connect(str(args.db))
    cur = con.cursor()
    now = datetime.now(timezone.utc).isoformat()
    doc = cur.execute(
        "select document_id from pretraining_extracted_parts where document_id is not null limit 1"
    ).fetchone()
    doc_id = int(doc[0]) if doc else 1
    inserted = skipped = 0
    for p in parts:
        mpn = str(p.get("part_number") or "").strip()
        mfg = str(p.get("manufacturer") or "").strip()
        if not mpn:
            continue
        exists = cur.execute(
            "select 1 from pretraining_extracted_parts where part_number = ? limit 1",
            (mpn,),
        ).fetchone()
        if exists:
            skipped += 1
            continue
        if args.dry_run:
            print(f"[dry-run] would insert {mfg} {mpn}")
            inserted += 1
            continue
        cur.execute(
            """insert into pretraining_extracted_parts
            (document_id, part_name, manufacturer, part_number, quantity,
             raw_excerpt, confidence, component_class, discovered_at, discovery_source)
            values (?,?,?,?,1,?,0.9,?,?,?)""",
            (
                doc_id,
                str(p.get("part_name") or mpn),
                mfg,
                mpn,
                str(p.get("raw_excerpt") or "curated verified part seed"),
                str(p.get("component_class") or "electronic_ic"),
                now,
                "scripts/seed-forge-truth-curated-parts.py",
            ),
        )
        inserted += 1
        print(f"[seed] inserted {mfg} {mpn}")
    if not args.dry_run:
        con.commit()
    con.close()
    print(f"[seed] done inserted={inserted} skipped_existing={skipped} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
