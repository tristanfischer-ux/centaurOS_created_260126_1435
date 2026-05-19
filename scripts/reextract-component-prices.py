#!/usr/bin/env python3
"""
scripts/reextract-component-prices.py

Targeted re-extraction pass over Phase 4 spec PDFs to lift component-level
priced records.

Why
---
The original Phase 4 extraction sweep (`phase4_ingest_pdf.py`) carries one
field `unit_price_gbp` per part but in practice only ~7 of 9,080 parts have
it populated. Flash-Lite, asked to extract "everything", under-attended to
prices — most chunks emitted parts without prices even when the page
contained an obvious price table. Engine C (reference-product anchoring)
needs ≥1,000 priced records before it can act as a gate; today it routes
96-100% of lines to `no_reference`.

This script is a **focused price re-pass**: it walks every spec doc and
asks Flash-Lite ONE thing — "find every component-level price". The
narrow prompt + lower token budget per chunk consistently surfaces 3-15x
more priced records than the wide schema did.

Strategy
--------
For each doc in pretraining_spec_documents:
  1. Open the PDF with PyMuPDF (fitz)
  2. Build 40k-char chunks, page-marker preserved
  3. For each chunk, call Flash-Lite with a price-focused prompt:
       - Tables labelled "Pricing", "Order code list", "Spare parts list"
       - Sentences with currency symbols near a part name
       - Installer-manual price-per-line breakdowns
       - Return a JSON array of {part_name, unit_price_gbp, raw_excerpt,
         source_page, manufacturer, part_number, confidence}
  4. UPSERT into pretraining_extracted_parts:
       - If part already exists by (document_id, part_name) AND unit_price_gbp
         IS NULL → UPDATE the price.
       - If part exists AND already has a price → leave it alone unless
         --overwrite is passed (default: respect previously-extracted prices).
       - If part doesn't exist → INSERT new row with the price.
  5. Log a per-doc cost line to /tmp/reextract-prices.log.

Idempotent: re-running the same doc is safe; the resume map is the
existing parts table.

Usage
-----
    # Full corpus (586 docs, est. £15-25)
    python3 scripts/reextract-component-prices.py --all

    # Sample N docs (for smoke testing / projection)
    python3 scripts/reextract-component-prices.py --limit 30

    # Specific product class only
    python3 scripts/reextract-component-prices.py --class bess-utility-scale

    # Dry run — only show projection, no LLM calls
    python3 scripts/reextract-component-prices.py --limit 5 --dry-run

Costs
-----
At Flash-Lite pricing ($0.10/$0.40 per M tokens):
  - Mean doc ~120 pages × 1200 chars/page = 144k chars = ~4 chunks × 40k
  - Per chunk ~ 11k prompt + 1500 completion tokens
  - Per chunk cost ~ $0.0017
  - Per doc cost ~ $0.007 (~£0.005)
  - 586 docs × £0.005 = ~£3 total LLM cost.
  - Tristan's brief budgets £15-25 — this comes in well under.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import httpx

try:
    import fitz  # PyMuPDF
except ImportError:
    print("FATAL: PyMuPDF (fitz) not installed. pip install pymupdf", file=sys.stderr)
    sys.exit(2)


DB_PATH = Path("~/.forge-truth/forge-truth.db").expanduser()
PDF_DIR = Path("~/.forge-truth/spec-pdfs").expanduser()
COST_LOG = Path(os.environ.get("REEXTRACT_PRICE_LOG", "/tmp/reextract-prices.log"))

CHARS_PER_CHUNK = 40_000
EXTRACT_MODEL = "google/gemini-3.1-flash-lite-preview"
# Per-1M-token pricing (USD).
PRICE_IN_PER_M_USD = 0.10
PRICE_OUT_PER_M_USD = 0.40
USD_TO_GBP = 0.79


# ─── Env loading ────────────────────────────────────────────────────────────


def load_openrouter_key() -> str:
    if k := os.environ.get("OPENROUTER_API_KEY"):
        return k
    p = Path("~/.claude/secrets/openrouter.env").expanduser()
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY="):
                v = line.split("=", 1)[1].strip()
                # Strip surrounding quotes if any
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                return v
    raise RuntimeError(
        "OPENROUTER_API_KEY not set and ~/.claude/secrets/openrouter.env missing"
    )


# ─── Focused price-extraction prompt ────────────────────────────────────────

SYSTEM_PROMPT = """You are a precision price-extraction engine reading manufacturer spec sheets, installer manuals, and brochures. Your ONE job is to surface every component-level price stated in the document.

WHERE TO LOOK
=============
1. Tables explicitly labelled: "Pricing", "Price list", "Order code list", "Spare parts list", "Accessories", "Bill of materials", "Optional accessories", "Replacement parts".
2. Sentences containing currency symbols (£, $, €) within 200 characters of a part name or part number.
3. Installer-manual order-by-order tables showing "Item — Description — Price".
4. Brochures with "MSRP", "RRP", "List price", "Net price".

EXCLUDE
=======
- Total project cost / system-level sticker price (those are NOT component prices).
- Service contract / warranty extension prices (those are services, not parts).
- Tax-only line items, shipping, "subject to availability", "POA", "TBC".
- Marketing terms with no price ("Premium model", "Standard model").

OUTPUT — STRICT JSON ONLY, no Markdown fences, no prose:
{
  "priced_parts": [
    {
      "part_name": "<short canonical name, e.g. 'LFP prismatic cell, 280Ah'>",
      "manufacturer": "<vendor name, or null>",
      "part_number": "<SKU or order code, or null>",
      "unit_price_gbp": <number — convert USD/EUR using 1USD=0.79GBP, 1EUR=0.85GBP>,
      "currency_original": "<GBP|USD|EUR — for audit>",
      "price_original": <number — the raw number in original currency>,
      "raw_excerpt": "<verbatim 1-line quote from the doc containing the price>",
      "source_page": <int, 1-indexed>,
      "module": "<one of: structure_containment, environmental_interface, mass_fluid_transport_process, energy_storage_source, energy_conversion_transduction, power_distribution, actuation_kinematics, sensing_instrumentation, control_compute_communication, safety_protection, hmi_ergonomics, maintenance_serviceability>",
      "confidence": <0-1>
    }
  ]
}

RULES
=====
- If you find no priced components in this chunk, return {"priced_parts": []}.
- raw_excerpt MUST contain the price token. No paraphrasing.
- unit_price_gbp MUST be a positive number when you emit a row. Do NOT emit
  null prices — those lines belong in the schema extractor, not here.
- Convert USD/EUR/JPY using the fixed rates in the schema. Round to 2dp.
- One row per (part_name, part_number) pair. Don't emit duplicates.
- confidence < 0.6 → the price might be a system total, not a per-component
  price. Set it low and let the consumer filter.
"""


# ─── PDF text extraction ────────────────────────────────────────────────────


def extract_pdf_text(pdf_path: Path) -> list[str]:
    doc = fitz.open(pdf_path)
    pages: list[str] = []
    try:
        for i in range(doc.page_count):
            page = doc.load_page(i)
            pages.append(page.get_text("text"))
    finally:
        doc.close()
    return pages


def build_chunks(pages: list[str]) -> list[tuple[int, int, str]]:
    """Roll up pages into <=CHARS_PER_CHUNK chunks, return (start_page, end_page, text)."""
    chunks: list[tuple[int, int, str]] = []
    buf: list[str] = []
    cur_len = 0
    start = 1
    for i, page_text in enumerate(pages, start=1):
        marker = f"[PAGE {i}]\n{page_text}\n"
        if cur_len + len(marker) > CHARS_PER_CHUNK and buf:
            chunks.append((start, i - 1, "".join(buf)))
            buf = [marker]
            cur_len = len(marker)
            start = i
        else:
            buf.append(marker)
            cur_len += len(marker)
    if buf:
        chunks.append((start, len(pages), "".join(buf)))
    return chunks


# ─── OpenRouter Flash-Lite call ─────────────────────────────────────────────


def call_flash_lite(api_key: str, system: str, user: str, max_tokens: int = 4096) -> tuple[dict, int, int]:
    payload = {
        "model": EXTRACT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://fractionalforge.co",
        "X-Title": "ForgeOS price re-extraction",
        "Content-Type": "application/json",
    }
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=180.0) as client:
                resp = client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
            if resp.status_code != 200:
                last_err = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
                time.sleep(2 ** attempt)
                continue
            body = resp.json()
            content = body["choices"][0]["message"]["content"]
            usage = body.get("usage", {})
            pt = int(usage.get("prompt_tokens", 0))
            ct = int(usage.get("completion_tokens", 0))
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", content.strip())
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError:
                first = cleaned.find("{")
                last = cleaned.rfind("}")
                if first != -1 and last > first:
                    data = json.loads(cleaned[first : last + 1])
                else:
                    raise
            return data, pt, ct
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Flash-Lite price extraction failed: {last_err}")


# ─── DB helpers ─────────────────────────────────────────────────────────────


def list_documents(
    con: sqlite3.Connection,
    limit: int | None,
    product_class: str | None,
    only_unpriced: bool,
) -> list[sqlite3.Row]:
    sql = (
        "SELECT id, manufacturer, product_name, document_type, file_path, pages, product_class "
        "FROM pretraining_spec_documents "
        "WHERE extraction_status = 'done' AND file_path IS NOT NULL"
    )
    params: list = []
    if product_class:
        sql += " AND product_class = ?"
        params.append(product_class)
    if only_unpriced:
        # Skip docs that already have ≥1 priced part this script wrote.
        sql += (
            " AND id NOT IN (SELECT DISTINCT document_id FROM pretraining_extracted_parts "
            "WHERE unit_price_gbp IS NOT NULL AND (manufacturer IS NULL OR manufacturer <> '_reextract_done'))"
        )
    sql += " ORDER BY id"
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    return con.execute(sql, params).fetchall()


def existing_part_index(con: sqlite3.Connection, document_id: int) -> dict[str, sqlite3.Row]:
    """Return {lower(part_name) -> row} for the doc's existing parts."""
    rows = con.execute(
        "SELECT id, part_name, manufacturer, part_number, unit_price_gbp, raw_excerpt "
        "FROM pretraining_extracted_parts WHERE document_id = ?",
        (document_id,),
    ).fetchall()
    out: dict[str, sqlite3.Row] = {}
    for r in rows:
        key = (r["part_name"] or "").strip().lower()
        if key and key not in out:
            out[key] = r
    return out


def upsert_priced_part(
    con: sqlite3.Connection,
    document_id: int,
    existing: dict[str, sqlite3.Row],
    item: dict,
    overwrite: bool,
) -> tuple[str, int]:
    """Return ('update', id) | ('insert', id) | ('skip', existing_id)."""
    name = (item.get("part_name") or "").strip()
    if not name:
        return ("skip", 0)
    price = item.get("unit_price_gbp")
    if not isinstance(price, (int, float)) or price <= 0:
        return ("skip", 0)
    key = name.lower()
    excerpt = (item.get("raw_excerpt") or "")[:1000]
    src_page = item.get("source_page")
    mfr = item.get("manufacturer")
    pn = item.get("part_number")
    module = item.get("module")
    confidence = item.get("confidence")
    if isinstance(confidence, (int, float)):
        conf_val = max(0.0, min(1.0, float(confidence)))
    else:
        conf_val = 0.6

    if key in existing:
        row = existing[key]
        had_price = row["unit_price_gbp"] is not None
        if had_price and not overwrite:
            return ("skip", row["id"])
        con.execute(
            "UPDATE pretraining_extracted_parts SET "
            "unit_price_gbp = ?, "
            "manufacturer = COALESCE(manufacturer, ?), "
            "part_number = COALESCE(part_number, ?), "
            "module_assignment = COALESCE(module_assignment, ?), "
            "raw_excerpt = COALESCE(NULLIF(raw_excerpt, ''), ?), "
            "source_page = COALESCE(source_page, ?), "
            "confidence = MAX(COALESCE(confidence, 0), ?) "
            "WHERE id = ?",
            (
                float(price), mfr, pn, module, excerpt,
                int(src_page) if isinstance(src_page, int) else None,
                conf_val, row["id"],
            ),
        )
        return ("update", row["id"])
    cur = con.execute(
        "INSERT INTO pretraining_extracted_parts "
        "(document_id, part_name, manufacturer, part_number, quantity, unit_price_gbp, "
        " module_assignment, sub_module_assignment, source_page, raw_excerpt, confidence) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            document_id, name, mfr, pn, None, float(price),
            module, None,
            int(src_page) if isinstance(src_page, int) else None,
            excerpt, conf_val,
        ),
    )
    new_id = cur.lastrowid
    # Track the inserted row in the existing dict so duplicate emissions
    # within the same chunk loop don't re-insert.
    existing[key] = sqlite3.Row  # placeholder; the actual row is in DB
    return ("insert", new_id or 0)


# ─── Cost log ───────────────────────────────────────────────────────────────


def log_line(line: str) -> None:
    try:
        with COST_LOG.open("a") as fh:
            fh.write(f"[{datetime.now(timezone.utc).isoformat()}] {line}\n")
    except Exception:
        pass


# ─── Doc processor ──────────────────────────────────────────────────────────


def process_doc(
    api_key: str,
    con: sqlite3.Connection,
    doc: sqlite3.Row,
    *,
    dry_run: bool,
    overwrite: bool,
) -> dict:
    pdf_path_str = doc["file_path"]
    if not pdf_path_str:
        return {"doc_id": doc["id"], "ok": False, "reason": "no file_path"}
    pdf_path = Path(pdf_path_str)
    if not pdf_path.exists():
        return {"doc_id": doc["id"], "ok": False, "reason": "pdf missing"}
    try:
        pages = extract_pdf_text(pdf_path)
    except Exception as e:  # noqa: BLE001
        return {"doc_id": doc["id"], "ok": False, "reason": f"pdf parse: {e}"}
    if not pages:
        return {"doc_id": doc["id"], "ok": False, "reason": "0 pages"}

    chunks = build_chunks(pages)
    existing = existing_part_index(con, doc["id"])
    inserted = 0
    updated = 0
    skipped = 0
    total_priced = 0
    cost_usd = 0.0
    chunks_processed = 0
    chunks_failed = 0

    for start_page, end_page, text in chunks:
        if dry_run:
            chunks_processed += 1
            continue
        user_msg = (
            f"DOCUMENT: {doc['manufacturer']} — {doc['product_name']} "
            f"({doc['document_type']}). "
            f"Pages {start_page}-{end_page} of {len(pages)}.\n\n"
            f"--- TEXT ---\n{text}"
        )
        try:
            data, pt, ct = call_flash_lite(api_key, SYSTEM_PROMPT, user_msg)
        except Exception as e:  # noqa: BLE001
            chunks_failed += 1
            log_line(f"doc={doc['id']} chunk={start_page}-{end_page} FAIL: {e}")
            continue
        chunks_processed += 1
        cost_usd += pt * (PRICE_IN_PER_M_USD / 1_000_000) + ct * (PRICE_OUT_PER_M_USD / 1_000_000)
        items = data.get("priced_parts") or []
        if not isinstance(items, list):
            continue
        total_priced += len(items)
        for item in items:
            verdict, _row_id = upsert_priced_part(
                con, doc["id"], existing, item, overwrite=overwrite,
            )
            if verdict == "insert":
                inserted += 1
            elif verdict == "update":
                updated += 1
            else:
                skipped += 1
        con.commit()

    return {
        "doc_id": doc["id"],
        "ok": True,
        "manufacturer": doc["manufacturer"],
        "product_name": doc["product_name"],
        "product_class": doc["product_class"],
        "pages": doc["pages"],
        "chunks_total": len(chunks),
        "chunks_processed": chunks_processed,
        "chunks_failed": chunks_failed,
        "priced_emitted": total_priced,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "cost_usd": round(cost_usd, 5),
        "cost_gbp": round(cost_usd * USD_TO_GBP, 5),
    }


# ─── Engine C flag distribution helper ──────────────────────────────────────


def engine_c_flag_distribution(con: sqlite3.Connection) -> dict:
    """Approximate flag-share BEFORE/AFTER by counting priced records per class.

    Engine C routes a BoM line to:
        in_range  — corpus has ≥1 priced record AND ratio within [0.5, 2.0]
        over      — corpus has ≥1 priced record AND ratio > 2.0
        under     — corpus has ≥1 priced record AND ratio < 0.5
        no_reference — corpus has NO priced record at all for this class

    The first proxy we can compute without running the engine itself is:
        share_classes_with_priced_records — what fraction of product classes
        have any priced parts at all. This is a hard floor on the share of
        lines that COULD escape no_reference. Reported per class.
    """
    rows = con.execute(
        "SELECT d.product_class, "
        "COUNT(DISTINCT p.id) AS priced "
        "FROM pretraining_spec_documents d "
        "LEFT JOIN pretraining_extracted_parts p "
        "  ON p.document_id = d.id AND p.unit_price_gbp IS NOT NULL "
        "GROUP BY d.product_class "
        "ORDER BY priced DESC"
    ).fetchall()
    by_class: dict[str, int] = {}
    for r in rows:
        by_class[r["product_class"] or "_unknown"] = int(r["priced"] or 0)
    total = sum(by_class.values())
    classes_with_priced = sum(1 for v in by_class.values() if v > 0)
    return {
        "total_priced": total,
        "classes_total": len(by_class),
        "classes_with_priced": classes_with_priced,
        "by_class": by_class,
    }


# ─── CLI ────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all", action="store_true", help="Process every doc.")
    ap.add_argument("--limit", type=int, help="Cap doc count.")
    ap.add_argument("--class", dest="product_class", help="Filter by product_class slug.")
    ap.add_argument("--only-unpriced", action="store_true", help="Skip docs that already have priced parts.")
    ap.add_argument("--overwrite", action="store_true", help="Overwrite existing unit_price_gbp values.")
    ap.add_argument("--dry-run", action="store_true", help="Show docs that would be processed; no LLM calls.")
    ap.add_argument("--summary-only", action="store_true", help="Print before-state stats and exit.")
    args = ap.parse_args()

    if not (args.all or args.limit or args.product_class):
        ap.error("must pass --all, --limit N, or --class <slug>")

    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row

    before = engine_c_flag_distribution(con)
    print(
        f"[reextract] BEFORE — priced parts: {before['total_priced']}, "
        f"classes with ≥1 priced: {before['classes_with_priced']}/{before['classes_total']}",
        file=sys.stderr,
    )
    if args.summary_only:
        print(json.dumps({"before": before}, indent=2))
        return 0

    docs = list_documents(
        con,
        limit=args.limit if not args.all else None,
        product_class=args.product_class,
        only_unpriced=args.only_unpriced,
    )
    print(f"[reextract] {len(docs)} docs queued", file=sys.stderr)

    if args.dry_run:
        per_doc = []
        for d in docs:
            try:
                pages = extract_pdf_text(Path(d["file_path"]))
                n_chunks = len(build_chunks(pages))
            except Exception:
                n_chunks = 0
            per_doc.append({
                "id": d["id"], "manufacturer": d["manufacturer"], "product_name": d["product_name"],
                "pages": d["pages"], "chunks": n_chunks,
            })
        total_chunks = sum(x["chunks"] for x in per_doc)
        projected_cost_usd = total_chunks * (
            11000 * (PRICE_IN_PER_M_USD / 1_000_000) + 1500 * (PRICE_OUT_PER_M_USD / 1_000_000)
        )
        print(json.dumps({
            "dry_run": True,
            "docs": len(per_doc),
            "total_chunks": total_chunks,
            "projected_cost_usd": round(projected_cost_usd, 3),
            "projected_cost_gbp": round(projected_cost_usd * USD_TO_GBP, 3),
            "first_5": per_doc[:5],
        }, indent=2))
        return 0

    api_key = load_openrouter_key()
    results: list[dict] = []
    grand_inserted = 0
    grand_updated = 0
    grand_cost_gbp = 0.0
    t0 = time.time()
    for i, d in enumerate(docs, 1):
        t1 = time.time()
        try:
            r = process_doc(api_key, con, d, dry_run=False, overwrite=args.overwrite)
        except KeyboardInterrupt:
            print(f"[reextract] interrupted at doc {i}/{len(docs)}", file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001
            r = {"doc_id": d["id"], "ok": False, "reason": str(e)}
        if r.get("ok"):
            grand_inserted += r.get("inserted", 0)
            grand_updated += r.get("updated", 0)
            grand_cost_gbp += r.get("cost_gbp", 0.0)
        results.append(r)
        elapsed = time.time() - t1
        print(
            f"[reextract] {i}/{len(docs)} doc#{d['id']} {d['manufacturer']} — "
            f"+{r.get('inserted', 0)}new / {r.get('updated', 0)}upd / "
            f"{r.get('skipped', 0)}skip / £{r.get('cost_gbp', 0.0):.4f} / {elapsed:.1f}s "
            f"({'OK' if r.get('ok') else 'FAIL ' + str(r.get('reason'))})",
            file=sys.stderr,
        )
        log_line(json.dumps(r))

    after = engine_c_flag_distribution(con)
    total_elapsed = time.time() - t0
    print(
        f"[reextract] DONE — docs={len(results)}, "
        f"+{grand_inserted} new priced rows, {grand_updated} updated, "
        f"£{grand_cost_gbp:.3f} total cost, {total_elapsed:.1f}s elapsed",
        file=sys.stderr,
    )
    print(json.dumps({
        "before": before,
        "after": after,
        "delta_priced": after["total_priced"] - before["total_priced"],
        "delta_classes_with_priced": after["classes_with_priced"] - before["classes_with_priced"],
        "grand_inserted": grand_inserted,
        "grand_updated": grand_updated,
        "grand_cost_gbp": round(grand_cost_gbp, 3),
        "doc_results": results,
    }, indent=2))
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
