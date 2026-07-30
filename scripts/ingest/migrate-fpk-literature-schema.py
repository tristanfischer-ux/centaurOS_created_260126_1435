#!/usr/bin/env python3
"""Migrate forge-truth.db for FPK literature corpus (Anvil expert rail).

Tables:
  fpk_literature_topics       — research topics ↔ component_ids
  fpk_component_literature    — component ↔ document association
  fpk_extracted_claims        — formulas / materials / physics / FE methods
  extends pretraining_spec_documents via source_type='fpk_literature'

Usage:
  python3 scripts/ingest/migrate-fpk-literature-schema.py
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB = Path.home() / ".forge-truth" / "forge-truth.db"


def main() -> int:
    if not DB.exists():
        raise SystemExit(f"missing {DB}")
    con = sqlite3.connect(DB)
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS fpk_literature_topics (
          topic_id TEXT PRIMARY KEY,
          product_class TEXT NOT NULL,
          name TEXT NOT NULL,
          assembly TEXT,
          component_ids_json TEXT NOT NULL,
          queries_json TEXT NOT NULL,
          min_papers INTEGER NOT NULL DEFAULT 10,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fpk_component_literature (
          id INTEGER PRIMARY KEY,
          product_class TEXT NOT NULL,
          component_id TEXT NOT NULL,
          topic_id TEXT,
          document_id INTEGER NOT NULL,
          doi TEXT,
          contribution TEXT,  -- formula|material|physics|geometry|manufacturing|fea|thermal|electrical
          relevance REAL,
          peer_reviewed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(product_class, component_id, document_id, contribution)
        );
        CREATE INDEX IF NOT EXISTS idx_fpk_comp_lit_component
          ON fpk_component_literature(product_class, component_id);
        CREATE INDEX IF NOT EXISTS idx_fpk_comp_lit_doc
          ON fpk_component_literature(document_id);

        CREATE TABLE IF NOT EXISTS fpk_extracted_claims (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL,
          product_class TEXT NOT NULL,
          component_id TEXT,
          topic_id TEXT,
          claim_kind TEXT NOT NULL,  -- formula|material|physics|geometry|manufacturing|fea|chemistry|thermal|electrical
          symbol TEXT,
          expression TEXT,
          value_text TEXT,
          unit TEXT,
          material_grade TEXT,
          elements TEXT,
          density_kg_m3 REAL,
          excerpt TEXT,
          page_hint TEXT,
          confidence REAL,
          source_detail TEXT,
          embed_hash TEXT,
          embedding BLOB,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_fpk_claims_kind
          ON fpk_extracted_claims(claim_kind, product_class);
        CREATE INDEX IF NOT EXISTS idx_fpk_claims_component
          ON fpk_extracted_claims(component_id);
        CREATE INDEX IF NOT EXISTS idx_fpk_claims_doc
          ON fpk_extracted_claims(document_id);

        CREATE TABLE IF NOT EXISTS fpk_literature_harvest_log (
          id INTEGER PRIMARY KEY,
          topic_id TEXT NOT NULL,
          query TEXT,
          source TEXT,  -- openalex|crossref|semantic_scholar|manual
          doi TEXT,
          openalex_id TEXT,
          title TEXT,
          year INTEGER,
          is_oa INTEGER,
          peer_reviewed_hint INTEGER,
          document_id INTEGER,
          status TEXT,
          detail TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        """
    )
    con.commit()
    # verify
    tables = [
        r[0]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fpk_%'"
        ).fetchall()
    ]
    print("fpk literature tables:", sorted(tables))
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
