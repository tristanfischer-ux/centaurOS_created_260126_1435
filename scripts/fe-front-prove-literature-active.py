#!/usr/bin/env python3
"""End-to-end PROOF that FPK whitepapers are downloaded, scraped, searchable, used.

Writes twin artefacts + stamps state.fpkLiteratureActive.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TWIN = ROOT / "out" / "formula-e-front-mgu-20260729-1432"
DB = Path.home() / ".forge-truth" / "forge-truth.db"
PDF_DIR = Path.home() / ".forge-truth" / "fpk-pdfs"


def prove(db: Path) -> dict[str, Any]:
    con = sqlite3.connect(str(db))
    con.row_factory = sqlite3.Row
    out: dict[str, Any] = {
        "schema": "fpk-literature-active-proof/v1",
        "proved_at": datetime.now(ZoneInfo("Europe/London")).isoformat(timespec="seconds"),
        "database": str(db),
        "pdf_dir": str(PDF_DIR),
    }
    out["fpk_docs"] = con.execute(
        "SELECT COUNT(*) FROM pretraining_spec_documents WHERE source_type='fpk_literature'"
    ).fetchone()[0]
    out["pdfs_with_file_path"] = con.execute(
        """
        SELECT COUNT(*) FROM pretraining_spec_documents
        WHERE source_type='fpk_literature'
          AND file_path IS NOT NULL AND TRIM(file_path) != ''
        """
    ).fetchone()[0]
    out["fulltext_status"] = con.execute(
        """
        SELECT COUNT(*) FROM pretraining_spec_documents
        WHERE source_type='fpk_literature' AND extraction_status='fulltext'
        """
    ).fetchone()[0]
    out["fulltext_ge_5k"] = con.execute(
        """
        SELECT COUNT(*) FROM pretraining_spec_documents
        WHERE source_type='fpk_literature'
          AND length(COALESCE(extracted_full_text,'')) >= 5000
        """
    ).fetchone()[0]
    out["pdfs_on_disk"] = len(list(PDF_DIR.glob("*.pdf"))) if PDF_DIR.is_dir() else 0

    samples = con.execute(
        """
        SELECT d.id, d.product_name AS title, h.doi, d.file_path,
               length(d.extracted_full_text) AS chars
        FROM pretraining_spec_documents d
        LEFT JOIN fpk_literature_harvest_log h ON h.document_id = d.id
        WHERE d.source_type='fpk_literature'
          AND d.extraction_status='fulltext'
          AND d.file_path IS NOT NULL
        GROUP BY d.id
        ORDER BY length(d.extracted_full_text) DESC
        LIMIT 10
        """
    ).fetchall()
    disk = []
    for r in samples:
        p = Path(r["file_path"] or "")
        magic = False
        nbytes = 0
        if p.is_file():
            nbytes = p.stat().st_size
            with p.open("rb") as f:
                magic = f.read(5) == b"%PDF-"
        disk.append(
            {
                "id": r["id"],
                "doi": r["doi"],
                "title": r["title"],
                "file_path": r["file_path"],
                "chars": r["chars"],
                "bytes": nbytes,
                "pdf_magic_ok": magic,
            }
        )
    out["sample_downloaded_fulltext"] = disk

    # Searchable: FTS over scraped body from downloaded docs
    fts = con.execute(
        """
        SELECT f.document_id, f.title, length(f.body) AS chars, d.file_path
        FROM pretraining_spec_documents_fts f
        JOIN pretraining_spec_documents d ON d.id = f.document_id
        WHERE f.pretraining_spec_documents_fts MATCH
          'SiC OR inverter OR "switching loss" OR demagnetization OR "cold plate" OR gearbox'
          AND d.source_type = 'fpk_literature'
          AND d.extraction_status = 'fulltext'
          AND d.file_path IS NOT NULL
          AND length(f.body) >= 5000
        LIMIT 10
        """
    ).fetchall()
    out["fts_hits_from_downloaded_pdfs"] = [
        {
            "document_id": r["document_id"],
            "title": r["title"],
            "chars": r["chars"],
            "file_path": r["file_path"],
        }
        for r in fts
    ]

    # Claims extracted from fulltext docs
    out["claims_total"] = con.execute("SELECT COUNT(*) FROM fpk_extracted_claims").fetchone()[0]
    out["claims_from_fulltext_pdfs"] = con.execute(
        """
        SELECT COUNT(*) FROM fpk_extracted_claims c
        JOIN pretraining_spec_documents d ON d.id = c.document_id
        WHERE d.extraction_status='fulltext'
          AND c.claim_kind != 'no_claim'
        """
    ).fetchone()[0]
    out["fulltext_docs_with_real_claims"] = con.execute(
        """
        SELECT COUNT(DISTINCT c.document_id) FROM fpk_extracted_claims c
        JOIN pretraining_spec_documents d ON d.id = c.document_id
        WHERE d.extraction_status='fulltext'
          AND c.claim_kind != 'no_claim'
        """
    ).fetchone()[0]

    claim_samples = con.execute(
        """
        SELECT c.id, c.component_id, c.claim_kind, c.symbol, c.expression,
               c.value_text, c.unit, c.excerpt, d.product_name AS title,
               d.file_path, length(d.extracted_full_text) AS chars
        FROM fpk_extracted_claims c
        JOIN pretraining_spec_documents d ON d.id = c.document_id
        WHERE d.extraction_status='fulltext'
          AND c.claim_kind != 'no_claim'
          AND c.component_id IS NOT NULL
        ORDER BY c.confidence DESC, c.id DESC
        LIMIT 12
        """
    ).fetchall()
    out["sample_claims_from_fulltext"] = [dict(r) for r in claim_samples]

    # Actively used: wiring report + state keys
    out["bars"] = {
        "downloaded_pdfs_ge_20": out["pdfs_with_file_path"] >= 20,
        "fulltext_scraped_ge_20": out["fulltext_ge_5k"] >= 20,
        "disk_pdf_magic": sum(1 for s in disk if s["pdf_magic_ok"]) >= 5,
        "fts_hits_from_downloads": len(out["fts_hits_from_downloaded_pdfs"]) >= 3,
        "claims_from_fulltext_ge_50": out["claims_from_fulltext_pdfs"] >= 50,
    }
    out["useful"] = all(out["bars"].values())
    con.close()
    return out


def stamp_state(twin: Path, proof: dict[str, Any], wiring: dict[str, Any] | None) -> None:
    state_path = twin / "state.json"
    if not state_path.is_file():
        return
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["fpkLiteratureActive"] = {
        "schema": "fpk-literature-active/v1",
        "useful": proof.get("useful"),
        "pdfs_with_file_path": proof.get("pdfs_with_file_path"),
        "fulltext_ge_5k": proof.get("fulltext_ge_5k"),
        "pdfs_on_disk": proof.get("pdfs_on_disk"),
        "claims_from_fulltext_pdfs": proof.get("claims_from_fulltext_pdfs"),
        "fulltext_docs_with_real_claims": proof.get("fulltext_docs_with_real_claims"),
        "fts_hits": len(proof.get("fts_hits_from_downloaded_pdfs") or []),
        "leaves_with_claim_refs": (wiring or {}).get("counts", {}).get(
            "leaves_with_claim_refs"
        ),
        "claims_wired": (wiring or {}).get("counts", {}).get("claims_wired"),
        "closure_effect": "NONE",
        "ship_ok": False,
        "proved_at": proof.get("proved_at"),
        "pipeline": [
            "download-fpk-oa-fulltext.py",
            "extract-fpk-literature-claims.py",
            "fe-front-wire-fpk-claims.py",
            "scripts/lib/fpk_db_consumer.py",
            "scripts/fe-front-stamp-fpk-db-reads.ts",
        ],
    }
    tmp = state_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, state_path)


def write_md(twin: Path, proof: dict[str, Any], wiring: dict[str, Any] | None) -> None:
    bars = proof.get("bars") or {}
    lines = [
        "# JLR FE Front FPK — Literature ACTIVE USE proof",
        "",
        f"Proved at: `{proof.get('proved_at')}`",
        "",
        "Requirement: whitepapers are **downloaded**, **scraped into the DB**,",
        "**searchable**, and **actively used** — abstracts alone are pointless.",
        "",
        "## Verdict",
        "",
        f"**USEFUL = `{proof.get('useful')}`**",
        "",
        "| Bar | Pass |",
        "|---|---|",
    ]
    for k, v in bars.items():
        lines.append(f"| `{k}` | {'PASS' if v else 'FAIL'} |")
    lines += [
        "",
        "## Corpus numbers",
        "",
        f"- FPK docs harvested: **{proof.get('fpk_docs')}**",
        f"- Local PDF `file_path` set: **{proof.get('pdfs_with_file_path')}**",
        f"- `extraction_status=fulltext` (≥ scraped): **{proof.get('fulltext_status')}**",
        f"- Fulltext ≥5k chars: **{proof.get('fulltext_ge_5k')}**",
        f"- PDFs on disk (`~/.forge-truth/fpk-pdfs/`): **{proof.get('pdfs_on_disk')}**",
        f"- Claims extracted from those fulltext PDFs: **{proof.get('claims_from_fulltext_pdfs')}**",
        f"- Fulltext docs that yielded real claims: **{proof.get('fulltext_docs_with_real_claims')}**",
        f"- Total claims in `fpk_extracted_claims`: **{proof.get('claims_total')}**",
    ]
    if wiring:
        c = wiring.get("counts") or {}
        lines += [
            "",
            "## Actively used in the twin",
            "",
            f"- Physics-tree leaves with claim refs: **{c.get('leaves_with_claim_refs')}**",
            f"- Claims wired (exact component_id → leaf): **{c.get('claims_wired')}**",
            f"- Matched component IDs: `{', '.join(wiring.get('matched_component_ids') or [])}`",
            f"- Closure effect: **NONE** (literature never closes HIL/dyno/FIA holds)",
            f"- `ship_ok`: **false** (honest)",
        ]
    lines += ["", "## Sample downloaded + scraped PDFs", ""]
    for s in proof.get("sample_downloaded_fulltext") or []:
        lines.append(
            f"- id={s['id']} doi=`{s.get('doi')}` chars={s['chars']} "
            f"bytes={s['bytes']} magic={s['pdf_magic_ok']}"
        )
        lines.append(f"  - {s.get('title')}")
        lines.append(f"  - `{s.get('file_path')}`")
    lines += ["", "## FTS hits from downloaded fulltext (not abstracts)", ""]
    for h in proof.get("fts_hits_from_downloaded_pdfs") or []:
        lines.append(
            f"- doc {h['document_id']}: {h.get('title')} ({h.get('chars')} chars)"
        )
        lines.append(f"  - `{h.get('file_path')}`")
    lines += ["", "## Sample claims mined from fulltext PDFs", ""]
    for c in proof.get("sample_claims_from_fulltext") or []:
        lines.append(
            f"- claim {c['id']} → `{c.get('component_id')}` [{c.get('claim_kind')}] "
            f"{c.get('symbol') or ''} {c.get('value_text') or c.get('expression') or ''}"
        )
        lines.append(f"  - from: {c.get('title')} ({c.get('chars')} chars scraped)")
        if c.get("excerpt"):
            lines.append(f"  - excerpt: {str(c['excerpt'])[:180]}")
    lines += [
        "",
        "## How to re-verify",
        "",
        "```bash",
        "python3 scripts/ingest/download-fpk-oa-fulltext.py --prove",
        "python3 scripts/fe-front-prove-literature-active.py --twin out/formula-e-front-mgu-20260729-1432",
        "ls ~/.forge-truth/fpk-pdfs | wc -l",
        "pdftotext ~/.forge-truth/fpk-pdfs/10.1109_access.2019.2907800.pdf - | wc -c",
        "```",
        "",
    ]
    (twin / "JLR-FE-FRONT-FPK-LITERATURE-ACTIVE-PROOF.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    ap.add_argument("--db", type=Path, default=DB)
    args = ap.parse_args()
    proof = prove(args.db)
    wiring_path = args.twin / "JLR-FE-FRONT-FPK-CLAIM-WIRING.json"
    wiring = None
    if wiring_path.is_file():
        wiring = json.loads(wiring_path.read_text(encoding="utf-8"))
    (args.twin / "JLR-FE-FRONT-FPK-LITERATURE-ACTIVE-PROOF.json").write_text(
        json.dumps(proof, indent=2) + "\n", encoding="utf-8"
    )
    write_md(args.twin, proof, wiring)
    stamp_state(args.twin, proof, wiring)
    print(json.dumps({"useful": proof["useful"], "bars": proof["bars"], **{k: proof[k] for k in [
        "pdfs_with_file_path", "fulltext_ge_5k", "pdfs_on_disk",
        "claims_from_fulltext_pdfs", "fulltext_docs_with_real_claims",
        "claims_total",
    ]}}, indent=2))
    print(f"wrote {args.twin / 'JLR-FE-FRONT-FPK-LITERATURE-ACTIVE-PROOF.md'}")
    return 0 if proof.get("useful") else 1


if __name__ == "__main__":
    raise SystemExit(main())
