#!/usr/bin/env python3
"""Download FULL open-access PDFs for FPK literature and scrape into forge-truth.

INTENT: Abstracts-only harvest is not literature work. This script:
  1) Resolves OA PDF URLs via Unpaywall (mailto) + OpenAlex best_oa_location
  2) Downloads PDFs to ~/.forge-truth/fpk-pdfs/
  3) Scrapes with pdftotext into pretraining_spec_documents.extracted_full_text
  4) Sets file_path + document_type=pdf + extraction_status=fulltext
  5) Rebuilds FTS so search uses full text

DOI comes from fpk_literature_harvest_log (spec docs have no doi column).
Title is product_name.

Usage:
  python3 scripts/ingest/download-fpk-oa-fulltext.py --limit 40
  python3 scripts/ingest/download-fpk-oa-fulltext.py --selftest
  python3 scripts/ingest/download-fpk-oa-fulltext.py --prove
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DB_PATH = Path(os.path.expanduser("~/.forge-truth/forge-truth.db"))
PDF_DIR = Path(os.path.expanduser("~/.forge-truth/fpk-pdfs"))
UA = "ForgeOS-FPK-Fulltext/1.0 (mailto:research@fractionalforge.com)"
UNPAYWALL_EMAIL = os.environ.get("UNPAYWALL_EMAIL", "research@fractionalforge.com")
OPENALEX_MAILTO = os.environ.get("OPENALEX_MAILTO", "research@fractionalforge.com")
TWIN_PROOF = Path(
    os.path.expanduser(
        "~/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432"
    )
)
# GOTCHA: OpenAlex 429s hard when we thrash; skip OpenAlex for cooldown window.
_OPENALEX_COOLDOWN_UNTIL = 0.0
_OPENALEX_429_COUNT = 0


def connect(db: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(db))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout=30000")
    return con


def http_json(url: str, timeout: float = 45.0) -> dict[str, Any] | None:
    global _OPENALEX_COOLDOWN_UNTIL, _OPENALEX_429_COUNT
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        print(f"  [http] fail {url[:80]}… — {e}", file=sys.stderr)
        if e.code == 429 and "openalex.org" in url:
            _OPENALEX_429_COUNT += 1
            # Back off 3–15 min depending on how hard we are hitting
            cool = min(900.0, 180.0 * max(1, _OPENALEX_429_COUNT))
            _OPENALEX_COOLDOWN_UNTIL = time.time() + cool
            print(f"  [openalex] 429 cooldown {cool:.0f}s", file=sys.stderr)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  [http] fail {url[:80]}… — {e}", file=sys.stderr)
        return None


def unpaywall_payload(doi: str) -> dict[str, Any] | None:
    doi = doi.strip()
    if not doi:
        return None
    url = (
        f"https://api.unpaywall.org/v2/{urllib.parse.quote(doi)}"
        f"?email={urllib.parse.quote(UNPAYWALL_EMAIL)}"
    )
    return http_json(url)


def unpaywall_pdf_urls(doi: str) -> list[str]:
    """Collect candidate PDF URLs from Unpaywall (best + all OA locations)."""
    data = unpaywall_payload(doi)
    if not data or not data.get("is_oa"):
        return []
    urls: list[str] = []
    locs = []
    if data.get("best_oa_location"):
        locs.append(data["best_oa_location"])
    locs.extend(data.get("oa_locations") or [])
    for loc in locs:
        if not isinstance(loc, dict):
            continue
        for key in ("url_for_pdf", "url"):
            u = loc.get(key)
            if isinstance(u, str) and u.startswith("http") and u not in urls:
                urls.append(u)
    return urls


def openalex_pdf(doi: str) -> str | None:
    global _OPENALEX_429_COUNT
    doi = doi.strip()
    if not doi:
        return None
    if time.time() < _OPENALEX_COOLDOWN_UNTIL:
        return None
    q = urllib.parse.quote(f"https://doi.org/{doi}")
    url = f"https://api.openalex.org/works/{q}?mailto={urllib.parse.quote(OPENALEX_MAILTO)}"
    data = http_json(url)
    if not data:
        return None
    _OPENALEX_429_COUNT = 0  # success clears streak
    loc = data.get("best_oa_location") or {}
    pdf = loc.get("pdf_url") or loc.get("url")
    if isinstance(pdf, str) and pdf.startswith("http"):
        return pdf
    return None


def crossref_container_title(doi: str) -> str | None:
    url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
    data = http_json(url)
    if not data:
        return None
    msg = data.get("message") or {}
    titles = msg.get("container-title") or []
    if titles and isinstance(titles[0], str):
        return titles[0]
    return None


_MDPI_SLUG_SPECIAL = {
    "world electric vehicle journal": "wevj",
    "international journal of molecular sciences": "ijms",
    "journal of manufacturing and materials processing": "jmmp",
    "electronics": "electronics",
    "energies": "energies",
    "sensors": "sensors",
    "materials": "materials",
    "machines": "machines",
    "metals": "metals",
    "nanomaterials": "nano",
    "lubricants": "lubricants",
    "batteries": "batteries",
    "aerospace": "aerospace",
    "applied sciences": "applsci",
    "symmetry": "sym",
    "chemengineering": "chemengineering",
    "micromachines": "mi",
    "molbank": "m",
    "nanoenergy advances": "nanoenergyadv",
    "vehicles": "vehicles",
    "actuators": "act",
    "processes": "pr",
}


def mdpi_res_candidates(doi: str, mdpi_pdf_url: str) -> list[str]:
    """INTENT: mdpi.com is Akamai-403 from many IPs; mdpi-res.com CDN is open.

    Unpaywall gives …/ISSN/vol/issue/art/pdf — Crossref gives journal title → slug.
    Try vol and zero-padded vol (wevj uses wevj-09-00009).
    """
    # GOTCHA: Unpaywall often appends ?version=… — strip query before match.
    m = re.match(
        r"https?://(?:www\.)?mdpi\.com/(\d{4}-\d{4})/(\d+)/(\d+)/(\d+)/pdf(?:\?.*)?$",
        mdpi_pdf_url.strip(),
    )
    if not m:
        return []
    _issn, vol, _issue, art = m.groups()
    title = crossref_container_title(doi) or ""
    slug = _MDPI_SLUG_SPECIAL.get(title.lower().strip())
    if not slug:
        slug = re.sub(r"[^a-z0-9]+", "", title.lower())
    if not slug:
        return []
    art5 = art.zfill(5)
    out: list[str] = []
    for v in (vol, vol.zfill(2)):
        base = f"{slug}-{v}-{art5}"
        out.append(
            f"https://mdpi-res.com/d_attachment/{slug}/{base}/article_deploy/{base}.pdf"
        )
    return out


def frontiers_pdf_candidates(doi: str) -> list[str]:
    """Frontiers serves /journals/<name>/articles/<doi>/pdf — also try short form."""
    if not doi.lower().startswith("10.3389/"):
        return []
    return [
        f"https://www.frontiersin.org/articles/{doi}/pdf",
        f"https://www.frontiersin.org/articles/{doi}/full.pdf",
    ]


def resolve_pdf_urls(doi: str) -> list[str]:
    urls: list[str] = []
    for u in unpaywall_pdf_urls(doi):
        if u not in urls:
            urls.append(u)
        if "mdpi.com" in u and "/pdf" in u:
            for alt in mdpi_res_candidates(doi, u):
                if alt not in urls:
                    urls.insert(0, alt)  # CDN first
    for alt in frontiers_pdf_candidates(doi):
        if alt not in urls:
            urls.append(alt)
    oa = openalex_pdf(doi)
    if oa and oa not in urls:
        urls.append(oa)
    return urls


def download_pdf(url: str, dest: Path) -> bool:
    """Download via curl -L (handles Frontiers redirects; urllib often 403s MDPI)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        r = subprocess.run(
            [
                "curl",
                "-fsSL",
                "--max-time",
                "120",
                "--max-filesize",
                "52428800",
                "-A",
                "Mozilla/5.0 (compatible; ForgeOS-FPK-Fulltext/1.0)",
                "-H",
                "Accept: application/pdf,*/*",
                "-o",
                str(tmp),
                url,
            ],
            capture_output=True,
            timeout=150,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"  [pdf] curl fail: {e}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False
    if r.returncode != 0 or not tmp.is_file():
        err = (r.stderr or b"").decode("utf-8", errors="replace")[:120]
        print(f"  [pdf] download fail ({r.returncode}): {err or url[:80]}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False
    data = tmp.read_bytes()
    if b"%PDF" not in data[:4000]:
        print(f"  [pdf] not a PDF ({len(data)} B): {url[:90]}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False
    idx = data.find(b"%PDF")
    data = data[idx:]
    if len(data) < 2000:
        tmp.unlink(missing_ok=True)
        return False
    dest.write_bytes(data)
    tmp.unlink(missing_ok=True)
    return True


def pdftotext_extract(pdf_path: Path) -> str:
    bin_path = os.environ.get("PDFTOTEXT_BIN", "pdftotext")
    try:
        r = subprocess.run(
            [bin_path, "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
            capture_output=True,
            timeout=120,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"  [pdftotext] {e}", file=sys.stderr)
        return ""
    if r.returncode != 0:
        return ""
    return (r.stdout or b"").decode("utf-8", errors="replace").strip()


def refresh_fts(con: sqlite3.Connection, doc_id: int, title: str, body: str) -> None:
    try:
        con.execute(
            "DELETE FROM pretraining_spec_documents_fts WHERE document_id = ?",
            (doc_id,),
        )
        con.execute(
            """
            INSERT INTO pretraining_spec_documents_fts
              (document_id, product_class, title, body)
            VALUES (?, 'formula_e_front_mgu', ?, ?)
            """,
            (doc_id, title or "", body or ""),
        )
        con.commit()
    except sqlite3.Error as e:
        print(f"  [fts] warning id={doc_id}: {e}", file=sys.stderr)


def candidates(con: sqlite3.Connection, limit: int) -> list[sqlite3.Row]:
    # INTENT: Prefer publisher prefixes that are usually OA (MDPI/Frontiers/
    # IEEE Access/OJPEL) so Unpaywall hit-rate stays useful. Skip DOIs already
    # marked no_oa_pdf_url so we don't re-burn rate limits on IEEE paywalls.
    rows = con.execute(
        """
        SELECT d.id AS id,
               d.product_name AS title,
               d.source_url AS source_url,
               d.file_path AS file_path,
               length(COALESCE(d.extracted_full_text,'')) AS text_len,
               h.doi AS doi,
               h.is_oa AS is_oa
        FROM pretraining_spec_documents d
        JOIN fpk_literature_harvest_log h ON h.document_id = d.id
        WHERE d.source_type = 'fpk_literature'
          AND h.doi IS NOT NULL AND TRIM(h.doi) != ''
          AND COALESCE(h.detail, '') NOT LIKE '%no_oa_pdf_url%'
          AND COALESCE(h.detail, '') NOT LIKE '%download_failed%'
          AND (
            d.file_path IS NULL OR TRIM(d.file_path) = ''
            OR length(COALESCE(d.extracted_full_text,'')) < 2500
            OR IFNULL(d.extraction_status, '') IN ('abstract_only', 'pending', '')
          )
        GROUP BY d.id
        ORDER BY
          CASE
            WHEN h.doi LIKE '10.3390/%' THEN 0
            WHEN h.doi LIKE '10.3389/%' THEN 1
            WHEN h.doi LIKE '10.1109/access%' THEN 2
            WHEN h.doi LIKE '10.1109/oj%' THEN 2
            WHEN h.doi LIKE '10.64470/%' THEN 2
            WHEN h.doi LIKE '10.1038/%' THEN 3
            WHEN h.doi LIKE '10.1007/%' THEN 4
            ELSE 9
          END,
          CASE WHEN d.file_path IS NULL OR TRIM(d.file_path) = '' THEN 0 ELSE 1 END,
          length(COALESCE(d.extracted_full_text,'')) ASC,
          d.id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return list(rows)


def process_one(con: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    doi = str(row["doi"] or "").strip()
    doc_id = int(row["id"])
    title = str(row["title"] or "")
    result: dict[str, Any] = {
        "id": doc_id,
        "doi": doi,
        "title": title[:120],
        "ok": False,
        "pdf_url": None,
        "file_path": None,
        "chars": 0,
        "error": None,
    }
    pdf_urls = resolve_pdf_urls(doi)
    if not pdf_urls:
        result["error"] = "no_oa_pdf_url"
        try:
            con.execute(
                """
                UPDATE fpk_literature_harvest_log
                SET detail = COALESCE(detail,'') || ' | no_oa_pdf_url'
                WHERE document_id = ? AND doi = ?
                """,
                (doc_id, doi),
            )
            con.commit()
        except sqlite3.Error:
            pass
        return result
    result["pdf_url"] = pdf_urls[0]
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", doi)[:120]
    dest = PDF_DIR / f"{safe}.pdf"
    if not dest.exists() or dest.stat().st_size < 2000:
        got = False
        for pdf_url in pdf_urls:
            result["pdf_url"] = pdf_url
            if download_pdf(pdf_url, dest):
                got = True
                break
        if not got:
            result["error"] = "download_failed"
            try:
                # DECISION: stamp once (not append forever) so pending drains honestly.
                con.execute(
                    """
                    UPDATE fpk_literature_harvest_log
                    SET detail = CASE
                      WHEN COALESCE(detail,'') LIKE '%download_failed%' THEN detail
                      WHEN TRIM(COALESCE(detail,'')) = '' THEN 'download_failed'
                      ELSE detail || ' | download_failed'
                    END
                    WHERE document_id = ? AND doi = ?
                    """,
                    (doc_id, doi),
                )
                con.commit()
            except sqlite3.Error:
                pass
            return result
    text = pdftotext_extract(dest)
    file_hash = hashlib.sha256(dest.read_bytes()).hexdigest()
    if len(text) < 800:
        result["error"] = f"scrape_too_short:{len(text)}"
        if dest.exists() and dest.stat().st_size >= 2000:
            con.execute(
                """
                UPDATE pretraining_spec_documents
                SET file_path = ?, document_type = 'pdf', file_hash = ?,
                    downloaded_at = datetime('now'),
                    extraction_status = 'pdf_image_or_short'
                WHERE id = ?
                """,
                (str(dest), file_hash, doc_id),
            )
            con.commit()
            result["file_path"] = str(dest)
        return result
    con.execute(
        """
        UPDATE pretraining_spec_documents
        SET file_path = ?,
            document_type = 'pdf',
            file_hash = ?,
            downloaded_at = datetime('now'),
            extraction_status = 'fulltext',
            extracted_full_text = ?,
            extracted_at = datetime('now')
        WHERE id = ?
        """,
        (str(dest), file_hash, text, doc_id),
    )
    con.commit()
    refresh_fts(con, doc_id, title, text)
    result["ok"] = True
    result["file_path"] = str(dest)
    result["chars"] = len(text)
    return result


def prove(con: sqlite3.Connection) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "fpk_docs": con.execute(
            "SELECT COUNT(*) FROM pretraining_spec_documents WHERE source_type='fpk_literature'"
        ).fetchone()[0],
        "with_file_path": con.execute(
            """
            SELECT COUNT(*) FROM pretraining_spec_documents
            WHERE source_type='fpk_literature'
              AND file_path IS NOT NULL AND TRIM(file_path) != ''
            """
        ).fetchone()[0],
        "extraction_status_fulltext": con.execute(
            """
            SELECT COUNT(*) FROM pretraining_spec_documents
            WHERE source_type='fpk_literature' AND extraction_status='fulltext'
            """
        ).fetchone()[0],
        "fulltext_ge_5k": con.execute(
            """
            SELECT COUNT(*) FROM pretraining_spec_documents
            WHERE source_type='fpk_literature'
              AND length(COALESCE(extracted_full_text,'')) >= 5000
            """
        ).fetchone()[0],
        "fulltext_ge_20k": con.execute(
            """
            SELECT COUNT(*) FROM pretraining_spec_documents
            WHERE source_type='fpk_literature'
              AND length(COALESCE(extracted_full_text,'')) >= 20000
            """
        ).fetchone()[0],
        "pdfs_on_disk": len(list(PDF_DIR.glob("*.pdf"))) if PDF_DIR.exists() else 0,
        "claims_from_fulltext_docs": 0,
        "sample_docs": [],
        "fts_hits": [],
    }
    samples = con.execute(
        """
        SELECT d.id, d.product_name AS title, h.doi, d.file_path,
               length(d.extracted_full_text) AS n,
               substr(d.extracted_full_text, 1, 220) AS head
        FROM pretraining_spec_documents d
        LEFT JOIN fpk_literature_harvest_log h ON h.document_id = d.id
        WHERE d.source_type='fpk_literature'
          AND length(COALESCE(d.extracted_full_text,'')) >= 5000
          AND d.file_path IS NOT NULL AND TRIM(d.file_path) != ''
        GROUP BY d.id
        ORDER BY length(d.extracted_full_text) DESC
        LIMIT 8
        """
    ).fetchall()
    stats["sample_docs"] = [
        {
            "id": r["id"],
            "title": r["title"],
            "doi": r["doi"],
            "file_path": r["file_path"],
            "chars": r["n"],
            "head": (r["head"] or "").replace("\n", " ")[:180],
            "file_exists": Path(r["file_path"]).is_file() if r["file_path"] else False,
            "file_bytes": (
                Path(r["file_path"]).stat().st_size
                if r["file_path"] and Path(r["file_path"]).is_file()
                else 0
            ),
        }
        for r in samples
    ]
    for table in ("fpk_extracted_claims", "pretraining_extracted_claims"):
        try:
            n = con.execute(
                f"""
                SELECT COUNT(*)
                FROM {table} c
                JOIN pretraining_spec_documents d ON d.id = c.document_id
                WHERE d.source_type = 'fpk_literature'
                  AND length(COALESCE(d.extracted_full_text,'')) >= 5000
                """
            ).fetchone()[0]
            stats["claims_from_fulltext_docs"] = n
            stats["claims_table"] = table
            break
        except sqlite3.Error:
            continue
    try:
        hits = con.execute(
            """
            SELECT document_id, title, length(body) AS n
            FROM pretraining_spec_documents_fts
            WHERE pretraining_spec_documents_fts MATCH
              'IGBT OR SiC OR "switching loss" OR inverter OR "DC link" OR coolant'
              AND length(body) >= 5000
            LIMIT 8
            """
        ).fetchall()
        stats["fts_hits"] = [
            {"document_id": h["document_id"], "title": h["title"], "chars": h["n"]}
            for h in hits
        ]
    except sqlite3.Error as e:
        stats["fts_error"] = str(e)
    # Disk verify: at least one sample PDF opens as PDF
    disk_ok = 0
    for s in stats["sample_docs"]:
        p = s.get("file_path")
        if p and Path(p).is_file():
            with open(p, "rb") as f:
                if f.read(5) == b"%PDF-":
                    disk_ok += 1
    stats["sample_pdf_magic_ok"] = disk_ok
    stats["useful"] = (
        stats["with_file_path"] >= 5
        and stats["fulltext_ge_5k"] >= 5
        and stats["sample_pdf_magic_ok"] >= 1
        and len(stats["fts_hits"]) >= 1
    )
    return stats


def selftest() -> int:
    urls = resolve_pdf_urls("10.3390/en13102417")
    assert urls, "expected OA urls"
    assert any("mdpi-res.com" in u for u in urls), urls[:3]
    dest = PDF_DIR / "_selftest_en13102417.pdf"
    assert download_pdf(urls[0], dest), urls[0]
    assert dest.stat().st_size > 100_000
    text = pdftotext_extract(dest)
    assert len(text) > 2000, len(text)
    print(f"SELFTEST OK mdpi-res download chars={len(text)} bytes={dest.stat().st_size}")
    return 0


def write_proof(stats: dict[str, Any]) -> None:
    if not TWIN_PROOF.is_dir():
        return
    (TWIN_PROOF / "JLR-FE-FRONT-FPK-FULLTEXT-PROOF.json").write_text(
        json.dumps(stats, indent=2), encoding="utf-8"
    )
    lines = [
        "# JLR FE Front FPK — Full-text literature PROOF",
        "",
        "Standing requirement: whitepapers are **downloaded**, **scraped**,",
        "**searchable**, and **used** — abstracts alone are not literature work.",
        "",
        f"- FPK docs in DB: **{stats['fpk_docs']}**",
        f"- With local `file_path` (PDF on disk): **{stats['with_file_path']}**",
        f"- `extraction_status=fulltext`: **{stats['extraction_status_fulltext']}**",
        f"- Fulltext ≥5k chars: **{stats['fulltext_ge_5k']}**",
        f"- Fulltext ≥20k chars: **{stats['fulltext_ge_20k']}**",
        f"- PDFs under `~/.forge-truth/fpk-pdfs/`: **{stats['pdfs_on_disk']}**",
        f"- Claims from fulltext docs: **{stats['claims_from_fulltext_docs']}**"
        + (f" (`{stats.get('claims_table')}`)" if stats.get("claims_table") else ""),
        f"- FTS hits (body ≥5k): **{len(stats.get('fts_hits') or [])}**",
        f"- Sample PDF magic `%PDF-` OK: **{stats.get('sample_pdf_magic_ok')}**",
        f"- **USEFUL bar:** `{stats.get('useful')}`",
        "",
        "## Sample fulltext documents",
        "",
    ]
    for s in stats.get("sample_docs") or []:
        lines.append(
            f"- id={s['id']} doi=`{s.get('doi')}` chars={s['chars']} "
            f"bytes={s.get('file_bytes')} exists={s.get('file_exists')}"
        )
        lines.append(f"  - {s.get('title')}")
        lines.append(f"  - `{s.get('file_path')}`")
        lines.append(f"  - head: {s.get('head')}")
        lines.append("")
    lines.append("## FTS smoke hits")
    lines.append("")
    for h in stats.get("fts_hits") or []:
        lines.append(f"- doc {h['document_id']}: {h.get('title')} ({h.get('chars')} chars)")
    lines.append("")
    lines.append("Pipeline: `download-fpk-oa-fulltext.py` → `extract-fpk-literature-claims.py`")
    lines.append(
        "→ `fe-front-wire-fpk-claims.py` → "
        "`fpk_db_consumer.py` / `fe-front-stamp-fpk-db-reads.ts`."
    )
    (TWIN_PROOF / "JLR-FE-FRONT-FPK-FULLTEXT-PROOF.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DB_PATH)
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument(
        "--sleep",
        type=float,
        default=float(os.environ.get("FPK_FULLTEXT_SLEEP", "1.25")),
        help="Per-DOI pause (raise under OpenAlex/Unpaywall pressure)",
    )
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--prove", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.db.is_file():
        print(f"DB missing: {args.db}", file=sys.stderr)
        return 2
    con = connect(args.db)
    if args.prove:
        stats = prove(con)
        write_proof(stats)
        print(json.dumps(stats, indent=2))
        return 0 if stats.get("useful") else 1
    rows = candidates(con, args.limit)
    print(f"[fpk-fulltext] candidates={len(rows)} limit={args.limit} pdf_dir={PDF_DIR}")
    ok = 0
    fail = 0
    results = []
    for i, row in enumerate(rows, 1):
        print(f"[{i}/{len(rows)}] doi={row['doi']} id={row['id']}")
        r = process_one(con, row)
        results.append(r)
        if r["ok"]:
            ok += 1
            print(f"  OK chars={r['chars']} path={r['file_path']}")
        else:
            fail += 1
            print(f"  FAIL {r.get('error')}")
        time.sleep(args.sleep)
    summary = {
        "processed": len(results),
        "ok": ok,
        "fail": fail,
        "results": results[:40],
        "prove": prove(con),
    }
    write_proof(summary["prove"])
    out = TWIN_PROOF / "JLR-FE-FRONT-FPK-FULLTEXT-DOWNLOAD.json"
    if out.parent.is_dir():
        out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"wrote {out}")
    print(json.dumps({"processed": len(results), "ok": ok, "fail": fail, "useful": summary["prove"].get("useful")}, indent=2))
    return 0 if ok > 0 or not rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
