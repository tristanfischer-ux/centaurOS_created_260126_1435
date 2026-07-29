#!/usr/bin/env python3
"""Regression tests for bounded open-access FPK PDF ingestion."""
from __future__ import annotations

import importlib.util
import sqlite3
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("harvest-fpk-literature.py")
SPEC = importlib.util.spec_from_file_location("harvest_fpk_literature", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FpkOaPdfTest(unittest.TestCase):
    def test_openalex_search_uses_valid_or_filter(self) -> None:
        captured_url = ""

        def capture(url: str) -> dict[str, list[object]]:
            nonlocal captured_url
            captured_url = url
            return {"results": []}

        with patch.object(MODULE, "http_get_json", side_effect=capture):
            MODULE.openalex_search("traction inverter", per_page=1)

        params = urllib.parse.parse_qs(urllib.parse.urlparse(captured_url).query)
        self.assertEqual(params["filter"], ["type:article|review,language:en"])

    def test_selects_pdf_only_when_openalex_marks_work_open_access(self) -> None:
        closed = {
            "open_access": {"is_oa": False},
            "primary_location": {"pdf_url": "https://example.test/closed.pdf"},
        }
        opened = {
            "open_access": {"is_oa": True},
            "best_oa_location": {"pdf_url": "https://example.test/open.pdf"},
        }

        self.assertIsNone(MODULE.oa_pdf_url_from_work(closed))
        self.assertEqual(
            MODULE.oa_pdf_url_from_work(opened),
            "https://example.test/open.pdf",
        )

    def test_downloads_bounded_oa_rows_and_sets_file_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db_path = root / "forge-truth.db"
            pdf_dir = root / "pdfs"
            con = sqlite3.connect(db_path)
            con.executescript(
                """
                CREATE TABLE pretraining_spec_documents (
                  id INTEGER PRIMARY KEY,
                  file_path TEXT,
                  downloaded_at TEXT,
                  extraction_status TEXT
                );
                CREATE TABLE fpk_literature_harvest_log (
                  id INTEGER PRIMARY KEY,
                  document_id INTEGER,
                  openalex_id TEXT,
                  is_oa INTEGER,
                  status TEXT,
                  detail TEXT
                );
                INSERT INTO pretraining_spec_documents VALUES
                  (1, NULL, NULL, 'abstract_only'),
                  (2, NULL, NULL, 'abstract_only');
                INSERT INTO fpk_literature_harvest_log VALUES
                  (10, 1, 'https://openalex.org/W1', 1, 'ingested', NULL),
                  (11, 2, 'https://openalex.org/W2', 0, 'ingested', NULL);
                """
            )
            con.commit()

            result = MODULE.download_oa_pdfs(
                con,
                pdf_dir=pdf_dir,
                limit=5,
                fetch_work=lambda _openalex_id: {
                    "open_access": {"is_oa": True},
                    "primary_location": {
                        "pdf_url": "https://example.test/open.pdf"
                    },
                },
                fetch_pdf=lambda _url: b"%PDF-1.7\nfixture",
            )

            self.assertEqual(result["eligible"], 1)
            self.assertEqual(result["downloaded"], 1)
            row = con.execute(
                "SELECT file_path, extraction_status FROM pretraining_spec_documents WHERE id=1"
            ).fetchone()
            self.assertTrue(Path(row[0]).is_file())
            self.assertEqual(row[1], "pdf_downloaded")
            closed_row = con.execute(
                "SELECT file_path FROM pretraining_spec_documents WHERE id=2"
            ).fetchone()
            self.assertIsNone(closed_row[0])
            con.close()


if __name__ == "__main__":
    unittest.main()
