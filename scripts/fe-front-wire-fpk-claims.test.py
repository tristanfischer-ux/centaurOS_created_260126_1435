#!/usr/bin/env python3
"""Regression tests for deterministic FPK literature-to-physics wiring."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("fe-front-wire-fpk-claims.py")
SPEC = importlib.util.spec_from_file_location("fe_front_wire_fpk_claims", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FpkClaimWiringTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.twin = root / "twin"
        self.twin.mkdir()
        self.db_path = root / "forge-truth.db"
        self._seed_db()
        state = {
            "fpkPhysicsTree": {
                "tree": {"id": "root"},
                "part_index": [
                    {"id": "root", "parent_id": None},
                    {"id": "matched_leaf", "parent_id": "root"},
                    {"id": "empty_leaf", "parent_id": "root"},
                ],
            },
            "raceHolds": [{"id": "HOLD-1", "status": "OPEN"}],
        }
        (self.twin / "state.json").write_text(json.dumps(state))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _seed_db(self) -> None:
        con = sqlite3.connect(self.db_path)
        con.executescript(
            """
            CREATE TABLE pretraining_spec_documents (
              id INTEGER PRIMARY KEY,
              source_url TEXT
            );
            CREATE TABLE fpk_component_literature (
              document_id INTEGER,
              component_id TEXT,
              doi TEXT
            );
            CREATE TABLE fpk_extracted_claims (
              id INTEGER PRIMARY KEY,
              document_id INTEGER NOT NULL,
              product_class TEXT NOT NULL,
              component_id TEXT,
              topic_id TEXT,
              claim_kind TEXT NOT NULL,
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
              source_detail TEXT
            );
            INSERT INTO pretraining_spec_documents VALUES
              (10, 'https://doi.org/10.1000/peer'),
              (11, NULL);
            INSERT INTO fpk_component_literature VALUES
              (10, 'matched_leaf', '10.1000/peer');
            INSERT INTO fpk_extracted_claims VALUES
              (1, 10, 'formula_e_front_mgu', 'matched_leaf', 'motor', 'thermal',
               'R_th', 'dT / Q', '0.12', 'K/W', NULL, NULL, NULL,
               'peer excerpt', 'p. 4', 0.9, 'extract:10'),
              (2, 11, 'formula_e_front_mgu', 'matched_leaf', 'motor', 'material',
               NULL, NULL, 'candidate resin', NULL, 'PEEK', NULL, NULL,
               'estimate excerpt', NULL, 0.5, 'extract:11'),
              (3, 10, 'formula_e_front_mgu', 'missing_leaf', 'motor', 'physics',
               NULL, NULL, 'unmatched', NULL, NULL, NULL, NULL,
               'unmatched excerpt', NULL, 0.7, 'extract:10'),
              (4, 10, 'formula_e_front_mgu', 'matched_leaf', 'motor', 'no_claim',
               NULL, NULL, 'NO_ENGINEERING_CLAIM', NULL, NULL, NULL, NULL,
               NULL, NULL, 0.0, 'extract:10');
            """
        )
        con.commit()
        con.close()

    def test_wires_exact_leaf_claims_without_closing_race_holds(self) -> None:
        result = MODULE.wire_twin(
            twin=self.twin,
            db_path=self.db_path,
            stamped_at="2026-07-29T20:00:00+01:00",
        )

        self.assertEqual(result["counts"]["claims_total"], 4)
        self.assertEqual(result["counts"]["claims_eligible"], 3)
        self.assertEqual(result["counts"]["claims_wired"], 2)
        self.assertEqual(result["counts"]["claims_unmatched"], 1)
        self.assertEqual(result["counts"]["leaves_with_claim_refs"], 1)
        self.assertEqual(result["unmatched_component_ids"], ["missing_leaf"])

        state = json.loads((self.twin / "state.json").read_text())
        by_id = {
            entry["id"]: entry
            for entry in state["fpkPhysicsTree"]["part_index"]
        }
        refs = by_id["matched_leaf"]["claim_refs"]
        self.assertEqual([ref["claim_id"] for ref in refs], [1, 2])
        self.assertEqual(refs[0]["provenance"], "PEER_LITERATURE")
        self.assertEqual(refs[1]["provenance"], "ESTIMATE_UNVALIDATED")
        self.assertTrue(all(ref["closure_effect"] == "NONE" for ref in refs))
        self.assertNotIn("claim_refs", by_id["root"])
        self.assertEqual(state["raceHolds"], [{"id": "HOLD-1", "status": "OPEN"}])
        self.assertFalse(state["fpkClaimWiring"]["ship_ok"])

        report = json.loads(
            (self.twin / "JLR-FE-FRONT-FPK-CLAIM-WIRING.json").read_text()
        )
        self.assertEqual(report["claim_refs_by_component"]["matched_leaf"], refs)

    def test_replaces_stale_refs_idempotently(self) -> None:
        MODULE.wire_twin(
            twin=self.twin,
            db_path=self.db_path,
            stamped_at="2026-07-29T20:00:00+01:00",
        )
        first = json.loads((self.twin / "state.json").read_text())
        first["fpkPhysicsTree"]["part_index"][1]["claim_refs"].append(
            {"claim_id": 999, "closure_effect": "CLOSE"}
        )
        (self.twin / "state.json").write_text(json.dumps(first))

        MODULE.wire_twin(
            twin=self.twin,
            db_path=self.db_path,
            stamped_at="2026-07-29T20:01:00+01:00",
        )

        second = json.loads((self.twin / "state.json").read_text())
        refs = second["fpkPhysicsTree"]["part_index"][1]["claim_refs"]
        self.assertEqual([ref["claim_id"] for ref in refs], [1, 2])
        self.assertTrue(all(ref["closure_effect"] == "NONE" for ref in refs))


if __name__ == "__main__":
    unittest.main()
