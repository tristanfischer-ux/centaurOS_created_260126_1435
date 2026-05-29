#!/usr/bin/env python3
"""
One-time backfill of historical BESS/VF council scores that were run ad-hoc
and never written to the canonical log.

Source: OVERNIGHT-TRACKER / TRACKER documents (now captured here permanently).

Run ONCE to seed ~/Downloads/engine-evidence/council-scores.jsonl.
Subsequent runs are safe — they append duplicates, so run only once.
After running, verify with:

    python3 scripts/backfill-council-scores.py --dry-run
    python3 scripts/backfill-council-scores.py

Usage:
    python3 scripts/backfill-council-scores.py [--dry-run]

    --dry-run   Print the records that would be written but do not write.
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# Make `scripts/lib/council_score_log` importable when run from repo root.
_repo_root = Path(__file__).parent.parent
sys.path.insert(0, str(_repo_root))

# Import using the hyphenated filename via importlib (Python module names
# cannot contain hyphens, so we load the file directly).
import importlib.util as _ilu

_spec = _ilu.spec_from_file_location(
    "council_score_log",
    Path(__file__).parent / "lib" / "council-score-log.py",
)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
record_council_score = _mod.record_council_score

LOG_PATH = _mod.LOG_PATH

# ─── Historical data ───────────────────────────────────────────────────────
# Source: OVERNIGHT-TRACKER and TRACKER documents.
# mean values are as recorded in the trackers; per-seat breakdown was not
# recorded at the time.
#
# Format: (run_tag, product_class, mean, source_doc, approx_ts)
HISTORICAL_SCORES = [
    # L-series BESS runs (from OVERNIGHT-TRACKER)
    ("L43",     "bess", 4.90, "OVERNIGHT-TRACKER", "2026-05-01T00:00:00Z"),
    ("L45",     "bess", 3.50, "OVERNIGHT-TRACKER", "2026-05-03T00:00:00Z"),
    ("L46",     "bess", 6.55, "OVERNIGHT-TRACKER", "2026-05-04T00:00:00Z"),
    ("L47",     "bess", 5.55, "OVERNIGHT-TRACKER", "2026-05-05T00:00:00Z"),
    ("L48",     "bess", 7.07, "OVERNIGHT-TRACKER", "2026-05-06T00:00:00Z"),
    ("L54",     "bess", 8.49, "OVERNIGHT-TRACKER", "2026-05-12T00:00:00Z"),
    ("L55",     "bess", 5.87, "OVERNIGHT-TRACKER", "2026-05-13T00:00:00Z"),
    ("L56",     "bess", 6.70, "OVERNIGHT-TRACKER", "2026-05-14T00:00:00Z"),
    ("L59",     "bess", 4.50, "TRACKER",           "2026-05-17T00:00:00Z"),
    ("L60",     "bess", 4.95, "TRACKER",           "2026-05-18T00:00:00Z"),
    # VF run (from TRACKER)
    ("iter-63", "bess", 7.45, "TRACKER",           "2026-05-21T00:00:00Z"),
]


def build_record(run_tag: str, product_class: str, mean: float, source: str, ts: str) -> dict:
    passed = mean >= 8.0
    return {
        "ts": ts,
        "product_class": product_class,
        "run_tag": run_tag,
        "pdf_path": None,
        "chain_commit_sha": None,
        "seats": {},
        "mean": mean,
        "gate": 8.0,
        "pass": passed,
        "notes": f"per-seat not recorded — backfilled from {source}",
        "backfilled": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill historical council scores to the canonical JSONL log."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print records without writing to disk.",
    )
    args = parser.parse_args()

    records = [
        build_record(run_tag, pc, mean, src, ts)
        for run_tag, pc, mean, src, ts in HISTORICAL_SCORES
    ]

    if args.dry_run:
        print(f"[DRY RUN] Would append {len(records)} records to {LOG_PATH}")
        for r in records:
            print(json.dumps(r))
        return

    for r in records:
        record_council_score(r)

    # Count lines now in the log (may include pre-existing entries)
    total_lines = 0
    if LOG_PATH.exists():
        with LOG_PATH.open("r", encoding="utf-8") as f:
            total_lines = sum(1 for line in f if line.strip())

    print(f"Backfill complete. Wrote {len(records)} records.")
    print(f"Log now contains {total_lines} total lines: {LOG_PATH}")


if __name__ == "__main__":
    main()
