#!/usr/bin/env python3
"""
Embed the four pretraining_extracted_* tables into BLOB columns.

Model
-----
text-embedding-3-small at 1536 dims, via OpenAI direct.
(OpenRouter does not expose Voyage embeddings or OpenAI embedding models.)

Cost
----
~$0.02 / 1M tokens. 30k rows * ~60 tokens = ~1.8M tokens = ~$0.04.

Idempotent
----------
Each row gets `embed_hash = sha256(compose_text(row))[:32]`.
Rows whose embed_hash already matches are skipped.

Concurrency
-----------
8 concurrent batches of 256 inputs each.

Usage
-----
  source .env.local && python3 scripts/rag/embed.py             # all four tables
  source .env.local && python3 scripts/rag/embed.py --only specs  # one table
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Callable, Iterable

import numpy as np
from openai import OpenAI

DB = Path.home() / ".forge-truth" / "forge-truth.db"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
BATCH_SIZE = 256
MAX_CONCURRENCY = 8
COST_PER_1M_TOKENS_USD = 0.02
USD_PER_GBP = 1.27  # rough; cost is sub-pound either way
LOG = Path("/tmp/rag-embedding-cost.log")


# ---------- text composers ------------------------------------------------

def _clean(s: object) -> str:
    if s is None:
        return ""
    return str(s).strip()


def compose_parts(row: sqlite3.Row) -> str:
    head = " ".join(
        x for x in (
            _clean(row["part_name"]),
            _clean(row["manufacturer"]),
            _clean(row["part_number"]),
        ) if x
    )
    excerpt = _clean(row["raw_excerpt"])
    return (head + (" | " + excerpt if excerpt else "")).strip() or "[empty]"


def compose_specs(row: sqlite3.Row) -> str:
    head = " ".join(
        x for x in (
            _clean(row["spec_key"]),
            _clean(row["spec_value"]),
            _clean(row["spec_unit"]),
        ) if x
    )
    excerpt = _clean(row["raw_excerpt"])
    return (head + (" | " + excerpt if excerpt else "")).strip() or "[empty]"


def compose_suppliers(row: sqlite3.Row) -> str:
    head = _clean(row["company_name"])
    excerpt = _clean(row["raw_excerpt"])
    return (head + (" | " + excerpt if excerpt else "")).strip() or "[empty]"


def compose_standards(row: sqlite3.Row) -> str:
    head = _clean(row["standard_name"])
    excerpt = _clean(row["raw_excerpt"])
    return (head + (" | " + excerpt if excerpt else "")).strip() or "[empty]"


TABLE_SPECS: dict[str, tuple[Callable[[sqlite3.Row], str], str]] = {
    "pretraining_extracted_parts": (
        compose_parts,
        "id, part_name, manufacturer, part_number, raw_excerpt",
    ),
    "pretraining_extracted_specs": (
        compose_specs,
        "id, spec_key, spec_value, spec_unit, raw_excerpt",
    ),
    "pretraining_extracted_suppliers": (
        compose_suppliers,
        "id, company_name, raw_excerpt",
    ),
    "pretraining_extracted_standards": (
        compose_standards,
        "id, standard_name, raw_excerpt",
    ),
}

# Hard cap per input — keeps tokens predictable.
MAX_CHARS = 4000


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:32]


# ---------- embedding worker ---------------------------------------------

class EmbedRunner:
    def __init__(self, client: OpenAI):
        self.client = client
        self.tokens_used = 0
        self.calls = 0

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        # Truncate over-long inputs.
        clipped = [t[:MAX_CHARS] for t in texts]
        # Retry once on transient failure.
        for attempt in range(3):
            try:
                res = self.client.embeddings.create(
                    model=EMBED_MODEL,
                    input=clipped,
                    dimensions=EMBED_DIM,
                )
                self.tokens_used += res.usage.total_tokens
                self.calls += 1
                # OpenAI guarantees order matches `input`.
                return [d.embedding for d in res.data]
            except Exception as exc:  # noqa: BLE001
                wait = 2 ** attempt
                print(f"  embed_batch retry {attempt + 1}/3 after {wait}s: {exc}", file=sys.stderr)
                time.sleep(wait)
        raise RuntimeError("embed_batch failed after 3 attempts")


# ---------- pipeline per-table -------------------------------------------

def chunked(seq: list, n: int) -> Iterable[list]:
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def embed_table(con: sqlite3.Connection, runner: EmbedRunner, table: str) -> dict:
    composer, cols = TABLE_SPECS[table]
    con.row_factory = sqlite3.Row

    # 1. Pull (id, composed_text, expected_hash, existing_hash).
    rows = con.execute(
        f"SELECT {cols}, embed_hash AS _existing_hash, embedding IS NOT NULL AS _has_emb FROM {table}"
    ).fetchall()
    todo: list[tuple[int, str, str]] = []  # (id, text, hash)
    skipped = 0
    for r in rows:
        text = composer(r)
        h = _hash(text)
        if r["_existing_hash"] == h and r["_has_emb"]:
            skipped += 1
            continue
        todo.append((r["id"], text, h))

    total = len(rows)
    print(f"[{table}] total={total} to_embed={len(todo)} already_current={skipped}")
    if not todo:
        return {"table": table, "total": total, "embedded": 0, "skipped": skipped}

    # 2. Embed in batches concurrently.
    start = time.time()
    batches = list(chunked(todo, BATCH_SIZE))
    embeddings_by_id: dict[int, bytes] = {}

    def _run(batch: list[tuple[int, str, str]]) -> list[tuple[int, str, bytes]]:
        texts = [t for _, t, _ in batch]
        vecs = runner.embed_batch(texts)
        out = []
        for (rid, _txt, h), vec in zip(batch, vecs):
            blob = np.asarray(vec, dtype=np.float32).tobytes()
            out.append((rid, h, blob))
        return out

    done = 0
    with cf.ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
        futures = {pool.submit(_run, b): b for b in batches}
        for fut in cf.as_completed(futures):
            for rid, h, blob in fut.result():
                embeddings_by_id[rid] = blob
            done += 1
            if done % 10 == 0 or done == len(batches):
                elapsed = time.time() - start
                rate = (done * BATCH_SIZE) / elapsed if elapsed else 0
                print(f"  [{table}] batch {done}/{len(batches)} "
                      f"({len(embeddings_by_id)} rows, {rate:.0f} rows/s)")

    # 3. Write back. Recompute hash from todo (already done).
    write_rows = [(blob, h, rid) for rid, _t, h in todo for blob in [embeddings_by_id[rid]]]
    with con:
        con.executemany(
            f"UPDATE {table} SET embedding = ?, embed_hash = ? WHERE id = ?",
            write_rows,
        )

    return {
        "table": table,
        "total": total,
        "embedded": len(todo),
        "skipped": skipped,
        "wall_s": time.time() - start,
    }


# ---------- main ----------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(TABLE_SPECS.keys()), help="run a single table")
    args = ap.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set", file=sys.stderr)
        return 1

    client = OpenAI(api_key=api_key)
    runner = EmbedRunner(client)

    con = sqlite3.connect(str(DB))
    # Performance: WAL + bigger cache.
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA cache_size=-65536")  # 64 MB

    overall_start = time.time()
    tables = [args.only] if args.only else list(TABLE_SPECS.keys())
    results = []
    for t in tables:
        results.append(embed_table(con, runner, t))
    con.close()

    overall_s = time.time() - overall_start
    usd = runner.tokens_used / 1_000_000 * COST_PER_1M_TOKENS_USD
    gbp = usd / USD_PER_GBP

    print("\n=== summary ===")
    for r in results:
        print(f"  {r['table']}: embedded={r.get('embedded', 0)} skipped={r.get('skipped', 0)} total={r['total']}")
    print(f"  tokens={runner.tokens_used:,}  calls={runner.calls}")
    print(f"  cost ≈ ${usd:.4f} ≈ £{gbp:.4f}")
    print(f"  wall_clock = {overall_s:.1f}s")

    with LOG.open("a") as f:
        f.write(
            f"{time.strftime('%Y-%m-%d %H:%M:%S')} model={EMBED_MODEL} dim={EMBED_DIM} "
            f"tokens={runner.tokens_used} calls={runner.calls} "
            f"usd={usd:.4f} gbp={gbp:.4f} wall_s={overall_s:.1f}\n"
        )
        for r in results:
            f.write(
                f"  {r['table']}: embedded={r.get('embedded', 0)} "
                f"skipped={r.get('skipped', 0)} total={r['total']} "
                f"table_wall_s={r.get('wall_s', 0):.1f}\n"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
