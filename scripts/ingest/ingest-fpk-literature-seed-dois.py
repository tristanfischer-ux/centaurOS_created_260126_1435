#!/usr/bin/env python3
"""Ingest curator seed DOIs (Crossref) into FPK literature corpus."""
from __future__ import annotations

import json
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "scripts/ingest/fpk-literature-seed-dois.json"
DB = Path.home() / ".forge-truth" / "forge-truth.db"
TOPICS = ROOT / "scripts/ingest/fpk-literature-topics.json"

spec = importlib.util.spec_from_file_location(
    "harvest", ROOT / "scripts/ingest/harvest-fpk-literature.py"
)
H = importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)


def main() -> int:
    papers = json.loads(SEED.read_text()).get("papers") or []
    topics_blob = json.loads(TOPICS.read_text())
    pc = topics_blob["product_class"]
    con = sqlite3.connect(DB)
    H.ensure_topics(con, topics_blob)
    n = 0
    for p in papers:
        doi = H.normalize_doi(p.get("doi"))
        if not doi:
            continue
        url = "https://api.crossref.org/works/" + urllib.parse.quote(doi)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": H.UA})
            with urllib.request.urlopen(req, timeout=40) as resp:
                msg = json.loads(resp.read().decode()).get("message") or {}
            work = H.work_from_crossref(msg)
            if not work:
                continue
            work["peer_reviewed_hint"] = 1 if p.get("peer_reviewed") else work.get("peer_reviewed_hint")
            if p.get("title"):
                work["title"] = p["title"]
            doc_id = H.upsert_document(con, work, pc)
            comps = p.get("components") or []
            topic_ids = p.get("topic_ids") or ["formula_e_edu_systems"]
            for tid in topic_ids:
                # map topic components + explicit
                tcomps = comps[:]
                for t in topics_blob["topics"]:
                    if t["id"] == tid:
                        tcomps = list(dict.fromkeys(tcomps + list(t.get("components") or [])))
                H.link_components(
                    con,
                    product_class=pc,
                    topic_id=tid,
                    component_ids=tcomps or ["front_fpk"],
                    document_id=doc_id,
                    work=work,
                )
            con.execute(
                """
                INSERT INTO fpk_literature_harvest_log
                  (topic_id, query, source, doi, title, year, peer_reviewed_hint,
                   document_id, status, detail)
                VALUES (?, 'seed_doi', 'seed_curated', ?, ?, ?, 1, ?, 'ingested', ?)
                """,
                (
                    topic_ids[0],
                    doi,
                    work.get("title"),
                    work.get("year"),
                    doc_id,
                    p.get("why") or "",
                ),
            )
            con.commit()
            n += 1
            print(f"[seed] {doi} → doc {doc_id}")
            time.sleep(0.2)
        except Exception as e:
            print(f"[seed] FAIL {doi}: {e}")
            con.rollback()
    print(f"[seed] ingested {n}/{len(papers)}")
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
