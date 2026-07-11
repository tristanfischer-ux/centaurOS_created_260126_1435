#!/usr/bin/env python3
"""Tests for queued CAD miss acquisition and validated writeback."""

import tempfile
import unittest
from pathlib import Path

from cad_asset_ingest import CadAssetIngestWorker, CadCandidate
from cad_asset_resolver import CadAssetResolver


class FakeProvider:
    name = "fake"

    def __init__(self, candidate):
        self.candidate = candidate

    def search(self, attempt):
        return self.candidate


class CadAssetIngestWorkerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.resolver = CadAssetResolver(root / "truth.db", root / "assets")
        self.source = root / "fan.stl"
        self.source.write_bytes(b"solid acquired-fan\nendsolid acquired-fan\n")

    def tearDown(self):
        self.temp.cleanup()

    def test_pending_miss_is_acquired_validated_and_reused(self):
        self.assertIsNone(
            self.resolver.resolve("Sunon", "PF80251B1-000U-S99", "axial_fan"))
        candidate = CadCandidate(
            manufacturer="Sunon",
            mpn="PF80251B1-000U-S99",
            family="axial_fan",
            source_file=self.source,
            source_url="https://manufacturer.example/fan.step",
            licence="MANUFACTURER-CAD",
            bbox_mm=(80.0, 25.0, 80.0),
        )
        worker = CadAssetIngestWorker(
            self.resolver, [FakeProvider(candidate)])

        result = worker.run_once()

        self.assertEqual(result.resolved, 1)
        resolved = self.resolver.resolve(
            "Sunon", "PF80251B1-000U-S99", "axial_fan",
            queue_on_miss=False)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.resolution_tier, "exact")

    def test_unlicensed_candidate_is_rejected_without_publication(self):
        self.assertIsNone(
            self.resolver.resolve("Unknown", "BAD-1", "axial_fan"))
        candidate = CadCandidate(
            manufacturer="Unknown",
            mpn="BAD-1",
            family="axial_fan",
            source_file=self.source,
            source_url="https://anonymous.example/model.stl",
            licence="UNKNOWN",
            bbox_mm=(80.0, 25.0, 80.0),
        )
        worker = CadAssetIngestWorker(
            self.resolver, [FakeProvider(candidate)])

        result = worker.run_once()

        self.assertEqual(result.rejected, 1)
        self.assertIsNone(self.resolver.resolve(
            "Unknown", "BAD-1", "axial_fan", queue_on_miss=False))


if __name__ == "__main__":
    unittest.main()
