#!/usr/bin/env python3
"""Harvest peer-reviewed FPK literature into forge-truth (OpenAlex + Crossref).

INTENT (Tristan 2026-07-29): Anvil must be the world expert on FPKs. Every
subcomponent research topic gets ≥10 high-quality papers, associated to
physics-tree component_ids, stored in pretraining_spec_documents +
fpk_component_literature for FTS + vector lookup.

Live APIs stay INGEST-ONLY (CHAIN-AS-DB-CONSUMER).

Usage:
  python3 scripts/ingest/migrate-fpk-literature-schema.py
  python3 scripts/ingest/harvest-fpk-literature.py --min 10
  python3 scripts/ingest/harvest-fpk-literature.py --topic sic_traction_inverter
  python3 scripts/ingest/harvest-fpk-literature.py --status
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
TOPICS_PATH = ROOT / "scripts/ingest/fpk-literature-topics.json"
DB_PATH = Path.home() / ".forge-truth" / "forge-truth.db"
UA = "ForgeOS-FPK-Literature/1.0 (mailto:research@fractionalforge.local)"
OPENALEX = "https://api.openalex.org/works"
CROSSREF = "https://api.crossref.org/works"
DEFAULT_PDF_DIR = Path.home() / ".forge-truth" / "fpk-pdfs"
MAX_OA_PDF_BYTES = 50 * 1024 * 1024
MAX_OA_PDF_BATCH = 100


def http_get_json(url: str, timeout: float = 45.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def http_get_pdf(url: str, timeout: float = 60.0) -> bytes:
    """Download one bounded PDF and reject HTML/error bodies."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/pdf"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content_length = int(resp.headers.get("Content-Length") or 0)
        if content_length > MAX_OA_PDF_BYTES:
            raise ValueError(f"PDF exceeds {MAX_OA_PDF_BYTES} bytes")
        body = resp.read(MAX_OA_PDF_BYTES + 1)
    if len(body) > MAX_OA_PDF_BYTES:
        raise ValueError(f"PDF exceeds {MAX_OA_PDF_BYTES} bytes")
    if not body.startswith(b"%PDF-"):
        raise ValueError("response is not a PDF")
    return body


def openalex_work(openalex_id: str) -> dict[str, Any]:
    """Fetch one OpenAlex work by its stable W identifier."""
    work_id = openalex_id.rstrip("/").rsplit("/", 1)[-1]
    if not re.fullmatch(r"W\d+", work_id):
        raise ValueError(f"invalid OpenAlex work id: {openalex_id}")
    return http_get_json(f"{OPENALEX}/{work_id}")


def oa_pdf_url_from_work(work: dict[str, Any]) -> str | None:
    """Return a direct PDF URL only for OpenAlex-declared OA works."""
    open_access = work.get("open_access")
    if not isinstance(open_access, dict) or not open_access.get("is_oa"):
        return None
    locations = [
        work.get("best_oa_location"),
        work.get("primary_location"),
        *(work.get("locations") or []),
    ]
    for location in locations:
        if not isinstance(location, dict):
            continue
        pdf_url = location.get("pdf_url")
        if isinstance(pdf_url, str) and pdf_url.startswith(("https://", "http://")):
            return pdf_url
    return None


def download_oa_pdfs(
    con: sqlite3.Connection,
    *,
    pdf_dir: Path,
    limit: int,
    fetch_work: Callable[[str], dict[str, Any]] = openalex_work,
    fetch_pdf: Callable[[str], bytes] = http_get_pdf,
) -> dict[str, int]:
    """Download a bounded batch of OpenAlex-confirmed OA PDFs.

    Args:
        con: Open forge-truth connection.
        pdf_dir: Durable PDF destination.
        limit: Maximum documents for this invocation, hard-capped at 100.
        fetch_work: Injectable OpenAlex metadata reader.
        fetch_pdf: Injectable bounded PDF reader.

    Returns:
        Counts for eligible, downloaded, unavailable, and failed documents.
    """
    bounded_limit = max(0, min(int(limit), MAX_OA_PDF_BATCH))
    rows = con.execute(
        """
        SELECT
          h.document_id,
          MAX(h.openalex_id) AS openalex_id,
          MIN(h.id) AS harvest_log_id
        FROM fpk_literature_harvest_log h
        JOIN pretraining_spec_documents d ON d.id = h.document_id
        WHERE h.is_oa = 1
          AND h.openalex_id IS NOT NULL
          AND trim(h.openalex_id) <> ''
          AND (d.file_path IS NULL OR trim(d.file_path) = '')
        GROUP BY h.document_id
        ORDER BY h.document_id
        LIMIT ?
        """,
        (bounded_limit,),
    ).fetchall()
    result = {
        "eligible": len(rows),
        "downloaded": 0,
        "unavailable": 0,
        "failed": 0,
    }
    pdf_dir.mkdir(parents=True, exist_ok=True)
    for document_id, openalex_id, log_id in rows:
        try:
            work = fetch_work(str(openalex_id))
            pdf_url = oa_pdf_url_from_work(work)
            if not pdf_url:
                result["unavailable"] += 1
                con.execute(
                    """
                    UPDATE fpk_literature_harvest_log
                    SET status = 'oa_pdf_unavailable',
                        detail = 'OpenAlex OA work has no direct pdf_url'
                    WHERE id = ?
                    """,
                    (log_id,),
                )
                continue
            body = fetch_pdf(pdf_url)
            if not body.startswith(b"%PDF-"):
                raise ValueError("response is not a PDF")
            destination = pdf_dir / f"fpk-{int(document_id)}.pdf"
            temp = destination.with_suffix(f".{os.getpid()}.tmp")
            try:
                temp.write_bytes(body)
                os.replace(temp, destination)
            finally:
                temp.unlink(missing_ok=True)
            con.execute(
                """
                UPDATE pretraining_spec_documents
                SET file_path = ?,
                    downloaded_at = datetime('now'),
                    extraction_status = 'pdf_downloaded'
                WHERE id = ?
                """,
                (str(destination), document_id),
            )
            con.execute(
                """
                UPDATE fpk_literature_harvest_log
                SET status = 'oa_pdf_downloaded',
                    detail = ?
                WHERE id = ?
                """,
                (pdf_url[:500], log_id),
            )
            result["downloaded"] += 1
        except Exception as error:
            result["failed"] += 1
            con.execute(
                """
                UPDATE fpk_literature_harvest_log
                SET status = 'oa_pdf_error',
                    detail = ?
                WHERE id = ?
                """,
                (str(error)[:500], log_id),
            )
        finally:
            con.commit()
    return result


def load_topics() -> dict[str, Any]:
    return json.loads(TOPICS_PATH.read_text())


def ensure_topics(con: sqlite3.Connection, blob: dict[str, Any]) -> None:
    pc = blob["product_class"]
    for t in blob["topics"]:
        con.execute(
            """
            INSERT INTO fpk_literature_topics
              (topic_id, product_class, name, assembly, component_ids_json, queries_json, min_papers)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(topic_id) DO UPDATE SET
              name=excluded.name,
              assembly=excluded.assembly,
              component_ids_json=excluded.component_ids_json,
              queries_json=excluded.queries_json,
              min_papers=excluded.min_papers
            """,
            (
                t["id"],
                pc,
                t["name"],
                t.get("assembly"),
                json.dumps(t.get("components") or []),
                json.dumps(t.get("queries") or []),
                int(blob.get("min_papers_per_topic") or 10),
            ),
        )
    con.commit()


def openalex_search(query: str, per_page: int = 25) -> list[dict[str, Any]]:
    params = {
        "search": query,
        "filter": "type:article|review,language:en",
        "per-page": str(per_page),
        "sort": "cited_by_count:desc",
        "mailto": "research@fractionalforge.local",
    }
    url = OPENALEX + "?" + urllib.parse.urlencode(params)
    data = http_get_json(url)
    return list(data.get("results") or [])


def crossref_search(query: str, rows: int = 20) -> list[dict[str, Any]]:
    params = {
        "query": query,
        "rows": str(rows),
        "filter": "type:journal-article,has-abstract:true",
        "mailto": "research@fractionalforge.local",
    }
    url = CROSSREF + "?" + urllib.parse.urlencode(params)
    data = http_get_json(url)
    return list((data.get("message") or {}).get("items") or [])


def normalize_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    d = doi.strip()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d, flags=re.I)
    return d.lower() if d else None


def work_from_openalex(w: dict[str, Any]) -> dict[str, Any] | None:
    doi = normalize_doi(w.get("doi"))
    title = None
    if isinstance(w.get("title"), str):
        title = w["title"]
    elif isinstance(w.get("display_name"), str):
        title = w["display_name"]
    if not title:
        return None
    year = w.get("publication_year")
    abstract = ""
    # OpenAlex inverted index abstract
    inv = w.get("abstract_inverted_index")
    if isinstance(inv, dict) and inv:
        positions: list[tuple[int, str]] = []
        for word, idxs in inv.items():
            for i in idxs:
                positions.append((int(i), word))
        positions.sort()
        abstract = " ".join(word for _, word in positions)
    loc = w.get("primary_location") or {}
    pdf_url = None
    landing = None
    if isinstance(loc, dict):
        landing = loc.get("landing_page_url")
        pdf_url = (loc.get("pdf_url") if loc.get("is_oa") else None) or None
    oa = w.get("open_access") or {}
    is_oa = bool(oa.get("is_oa")) if isinstance(oa, dict) else False
    if not pdf_url and isinstance(oa, dict):
        pdf_url = oa.get("oa_url")
    cited = int(w.get("cited_by_count") or 0)
    # peer-reviewed hint: journal article with DOI + venue
    primary = w.get("primary_location") or {}
    source = (primary.get("source") or {}) if isinstance(primary, dict) else {}
    peer = 1 if (doi and (source.get("type") in ("journal", None) or cited >= 5)) else 0
    if w.get("type") in ("article", "review") and doi:
        peer = 1
    return {
        "doi": doi,
        "openalex_id": w.get("id"),
        "title": title.strip(),
        "year": int(year) if year else None,
        "abstract": abstract[:12000],
        "landing_url": landing or (f"https://doi.org/{doi}" if doi else w.get("id")),
        "pdf_url": pdf_url,
        "is_oa": 1 if is_oa else 0,
        "cited_by": cited,
        "peer_reviewed_hint": peer,
        "source": "openalex",
        "venue": source.get("display_name") if isinstance(source, dict) else None,
    }


def work_from_crossref(it: dict[str, Any]) -> dict[str, Any] | None:
    doi = normalize_doi(it.get("DOI"))
    titles = it.get("title") or []
    title = titles[0] if titles else None
    if not title:
        return None
    year = None
    for key in ("published-print", "published-online", "created"):
        parts = (it.get(key) or {}).get("date-parts") or []
        if parts and parts[0]:
            year = parts[0][0]
            break
    abstract = it.get("abstract") or ""
    if abstract:
        abstract = re.sub(r"<[^>]+>", " ", abstract)
        abstract = re.sub(r"\s+", " ", abstract).strip()
    return {
        "doi": doi,
        "openalex_id": None,
        "title": title.strip(),
        "year": int(year) if year else None,
        "abstract": abstract[:12000],
        "landing_url": f"https://doi.org/{doi}" if doi else None,
        "pdf_url": None,
        "is_oa": 0,
        "cited_by": int(it.get("is-referenced-by-count") or 0),
        "peer_reviewed_hint": 1 if doi else 0,
        "source": "crossref",
        "venue": (it.get("container-title") or [None])[0],
    }


def upsert_document(con: sqlite3.Connection, work: dict[str, Any], product_class: str) -> int:
    """Insert/update pretraining_spec_documents; return document_id."""
    url = work.get("landing_url") or work.get("pdf_url") or work.get("openalex_id")
    if not url:
        raise ValueError("no url")
    body = "\n\n".join(
        x
        for x in [
            work.get("title") or "",
            f"Venue: {work.get('venue')}" if work.get("venue") else "",
            f"DOI: {work.get('doi')}" if work.get("doi") else "",
            f"Year: {work.get('year')}" if work.get("year") else "",
            f"Cited-by: {work.get('cited_by')}" if work.get("cited_by") is not None else "",
            work.get("abstract") or "",
        ]
        if x
    )
    file_hash = hashlib.sha256(
        ((work.get("doi") or url) + "|" + (work.get("title") or "")).encode()
    ).hexdigest()

    row = con.execute(
        "SELECT id FROM pretraining_spec_documents WHERE source_url = ? LIMIT 1",
        (url,),
    ).fetchone()
    if row:
        doc_id = int(row[0])
        con.execute(
            """
            UPDATE pretraining_spec_documents
            SET product_class = ?,
                product_name = ?,
                manufacturer = ?,
                document_type = 'article',
                source_type = 'fpk_literature',
                extraction_status = 'abstract_only',
                extracted_full_text = ?,
                extracted_at = datetime('now')
            WHERE id = ?
            """,
            (
                product_class,
                work.get("title"),
                work.get("venue") or "peer_literature",
                body,
                doc_id,
            ),
        )
    else:
        cur = con.execute(
            """
            INSERT INTO pretraining_spec_documents
              (product_class, manufacturer, product_name, source_url, document_type,
               pages, file_hash, extraction_status, extracted_at, source_type,
               extracted_full_text)
            VALUES (?, ?, ?, ?, 'article', NULL, ?, 'abstract_only', datetime('now'),
                    'fpk_literature', ?)
            """,
            (
                product_class,
                work.get("venue") or "peer_literature",
                work.get("title"),
                url,
                file_hash,
                body,
            ),
        )
        doc_id = int(cur.lastrowid)

    # FTS refresh
    con.execute(
        "DELETE FROM pretraining_spec_documents_fts WHERE document_id = ?",
        (doc_id,),
    )
    try:
        con.execute(
            """
            INSERT INTO pretraining_spec_documents_fts
              (document_id, product_class, title, body)
            VALUES (?, ?, ?, ?)
            """,
            (doc_id, product_class, work.get("title") or "", body),
        )
    except sqlite3.OperationalError:
        # FTS table may need recreate — migrate script creates it via class-ref
        pass
    return doc_id


def link_components(
    con: sqlite3.Connection,
    *,
    product_class: str,
    topic_id: str,
    component_ids: list[str],
    document_id: int,
    work: dict[str, Any],
) -> None:
    for cid in component_ids:
        for contribution in ("physics", "material", "formula", "manufacturing"):
            con.execute(
                """
                INSERT OR IGNORE INTO fpk_component_literature
                  (product_class, component_id, topic_id, document_id, doi,
                   contribution, relevance, peer_reviewed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product_class,
                    cid,
                    topic_id,
                    document_id,
                    work.get("doi"),
                    contribution,
                    min(1.0, 0.4 + 0.01 * float(work.get("cited_by") or 0)),
                    int(work.get("peer_reviewed_hint") or 0),
                ),
            )


def harvest_topic(
    con: sqlite3.Connection,
    blob: dict[str, Any],
    topic: dict[str, Any],
    *,
    min_papers: int,
    sleep_s: float,
) -> dict[str, int]:
    pc = blob["product_class"]
    topic_id = topic["id"]
    components = list(topic.get("components") or [])
    queries = list(topic.get("queries") or [])
    seen_doi: set[str] = set()
    seen_title: set[str] = set()
    added = 0
    skipped = 0

    # existing count for topic
    existing = con.execute(
        """
        SELECT COUNT(DISTINCT document_id) FROM fpk_component_literature
        WHERE topic_id = ?
        """,
        (topic_id,),
    ).fetchone()[0]
    if existing >= min_papers:
        return {"added": 0, "skipped": 0, "existing": int(existing), "done": 1}

    works: list[dict[str, Any]] = []
    for q in queries:
        try:
            for w in openalex_search(q, per_page=25):
                nw = work_from_openalex(w)
                if nw:
                    works.append(nw)
            time.sleep(sleep_s)
        except Exception as e:
            con.execute(
                """
                INSERT INTO fpk_literature_harvest_log
                  (topic_id, query, source, status, detail)
                VALUES (?, ?, 'openalex', 'error', ?)
                """,
                (topic_id, q, str(e)[:500]),
            )
        try:
            for it in crossref_search(q, rows=15):
                nw = work_from_crossref(it)
                if nw:
                    works.append(nw)
            time.sleep(sleep_s)
        except Exception as e:
            con.execute(
                """
                INSERT INTO fpk_literature_harvest_log
                  (topic_id, query, source, status, detail)
                VALUES (?, ?, 'crossref', 'error', ?)
                """,
                (topic_id, q, str(e)[:500]),
            )

    # rank: peer-reviewed + citations
    works.sort(
        key=lambda w: (
            int(w.get("peer_reviewed_hint") or 0),
            int(w.get("cited_by") or 0),
            int(bool(w.get("abstract"))),
        ),
        reverse=True,
    )

    for work in works:
        doi = work.get("doi")
        title_key = re.sub(r"\W+", " ", (work.get("title") or "").lower()).strip()
        if doi and doi in seen_doi:
            skipped += 1
            continue
        if title_key and title_key in seen_title:
            skipped += 1
            continue
        if doi:
            seen_doi.add(doi)
        if title_key:
            seen_title.add(title_key)

        try:
            doc_id = upsert_document(con, work, pc)
            link_components(
                con,
                product_class=pc,
                topic_id=topic_id,
                component_ids=components,
                document_id=doc_id,
                work=work,
            )
            con.execute(
                """
                INSERT INTO fpk_literature_harvest_log
                  (topic_id, query, source, doi, openalex_id, title, year,
                   is_oa, peer_reviewed_hint, document_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ingested')
                """,
                (
                    topic_id,
                    queries[0] if queries else "",
                    work.get("source"),
                    work.get("doi"),
                    work.get("openalex_id"),
                    work.get("title"),
                    work.get("year"),
                    work.get("is_oa"),
                    work.get("peer_reviewed_hint"),
                    doc_id,
                ),
            )
            added += 1
        except Exception as e:
            con.execute(
                """
                INSERT INTO fpk_literature_harvest_log
                  (topic_id, query, source, doi, title, status, detail)
                VALUES (?, ?, ?, ?, ?, 'error', ?)
                """,
                (
                    topic_id,
                    "",
                    work.get("source"),
                    work.get("doi"),
                    work.get("title"),
                    str(e)[:500],
                ),
            )
            skipped += 1

        total_now = con.execute(
            "SELECT COUNT(DISTINCT document_id) FROM fpk_component_literature WHERE topic_id = ?",
            (topic_id,),
        ).fetchone()[0]
        if total_now >= min_papers * 2:
            # gather a surplus for quality filtering later
            break

    con.commit()
    total = con.execute(
        "SELECT COUNT(DISTINCT document_id) FROM fpk_component_literature WHERE topic_id = ?",
        (topic_id,),
    ).fetchone()[0]
    return {
        "added": added,
        "skipped": skipped,
        "existing": int(existing),
        "total": int(total),
        "done": 1 if total >= min_papers else 0,
    }


def status(con: sqlite3.Connection, blob: dict[str, Any]) -> None:
    min_p = int(blob.get("min_papers_per_topic") or 10)
    print(f"{'topic_id':40} {'docs':>5} {'peer':>5} {'ok':>3}")
    ok_n = 0
    for t in blob["topics"]:
        tid = t["id"]
        docs = con.execute(
            "SELECT COUNT(DISTINCT document_id) FROM fpk_component_literature WHERE topic_id=?",
            (tid,),
        ).fetchone()[0]
        peer = con.execute(
            """
            SELECT COUNT(DISTINCT document_id) FROM fpk_component_literature
            WHERE topic_id=? AND peer_reviewed=1
            """,
            (tid,),
        ).fetchone()[0]
        flag = "✓" if docs >= min_p else "·"
        if docs >= min_p:
            ok_n += 1
        print(f"{tid:40} {docs:5} {peer:5} {flag:>3}")
    print(
        f"\ntopics meeting ≥{min_p}: {ok_n}/{len(blob['topics'])}  |  "
        f"docs total: "
        f"{con.execute('SELECT COUNT(DISTINCT document_id) FROM fpk_component_literature').fetchone()[0]}"
    )
    oa = con.execute(
        """
        SELECT
          COUNT(DISTINCT CASE WHEN h.is_oa = 1 THEN h.document_id END),
          COUNT(DISTINCT CASE
            WHEN h.is_oa = 1
             AND d.file_path IS NOT NULL
             AND trim(d.file_path) <> ''
            THEN h.document_id
          END)
        FROM fpk_literature_harvest_log h
        LEFT JOIN pretraining_spec_documents d ON d.id = h.document_id
        """
    ).fetchone()
    print(f"OA PDFs: downloaded={int(oa[1] or 0)}/{int(oa[0] or 0)} eligible works")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", default="", help="single topic_id")
    ap.add_argument("--min", type=int, default=10, help="min papers per topic")
    ap.add_argument("--sleep", type=float, default=0.35)
    ap.add_argument("--status", action="store_true")
    ap.add_argument(
        "--oa-pdf",
        action="store_true",
        help="download a bounded batch of OpenAlex-confirmed OA PDFs",
    )
    ap.add_argument("--oa-limit", type=int, default=10)
    ap.add_argument("--pdf-dir", type=Path, default=DEFAULT_PDF_DIR)
    args = ap.parse_args()

    if not DB_PATH.exists():
        raise SystemExit(f"missing {DB_PATH}")
    blob = load_topics()
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA busy_timeout=10000")
    # ensure schema
    from importlib.util import module_from_spec, spec_from_file_location

    mig = ROOT / "scripts/ingest/migrate-fpk-literature-schema.py"
    spec = spec_from_file_location("mig", mig)
    mod = module_from_spec(spec)  # type: ignore[arg-type]
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    mod.main()

    ensure_topics(con, blob)
    # ensure FTS exists
    con.executescript(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS pretraining_spec_documents_fts
        USING fts5(
          document_id UNINDEXED,
          product_class,
          title,
          body,
          tokenize = 'porter unicode61'
        );
        """
    )

    if args.status:
        status(con, blob)
        con.close()
        return 0

    if args.oa_pdf:
        result = download_oa_pdfs(
            con,
            pdf_dir=args.pdf_dir,
            limit=args.oa_limit,
        )
        print(
            "[oa-pdf] "
            f"eligible={result['eligible']} "
            f"downloaded={result['downloaded']} "
            f"unavailable={result['unavailable']} "
            f"failed={result['failed']} "
            f"dir={args.pdf_dir}"
        )
        status(con, blob)
        con.close()
        return 0

    topics = blob["topics"]
    if args.topic:
        topics = [t for t in topics if t["id"] == args.topic]
        if not topics:
            raise SystemExit(f"unknown topic {args.topic}")

    for t in topics:
        print(f"[harvest] topic={t['id']} …", flush=True)
        try:
            r = harvest_topic(
                con, blob, t, min_papers=args.min, sleep_s=args.sleep
            )
            print(
                f"  → added={r.get('added')} total={r.get('total', r.get('existing'))} "
                f"done={r.get('done')}",
                flush=True,
            )
        except Exception as e:
            print(f"  → ERROR {e}", flush=True)
            con.rollback()

    status(con, blob)
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
