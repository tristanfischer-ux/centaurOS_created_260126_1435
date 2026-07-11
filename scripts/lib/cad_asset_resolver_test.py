#!/usr/bin/env python3
"""Tests for the DB-first, self-growing CAD asset resolver."""

import tempfile
import unittest
from pathlib import Path

from cad_asset_resolver import CadAssetResolver


class CadAssetResolverTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.resolver = CadAssetResolver(
            db_path=root / "truth.db",
            asset_root=root / "assets",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_miss_is_queued_once(self):
        self.assertIsNone(
            self.resolver.resolve("Sunon", "PF80251B1-000U-S99", "axial_fan"))
        self.assertIsNone(
            self.resolver.resolve("SUNON", "pf80251b1 000u s99", "axial_fan"))
        attempts = self.resolver.search_attempts()
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]["status"], "pending")

    def test_render_consumer_can_decline_write_on_miss(self):
        self.assertIsNone(self.resolver.resolve(
            "Unknown", "NO-CAD", "unknown_family", queue_on_miss=False))
        self.assertEqual(self.resolver.search_attempts(), [])

    def test_registered_exact_asset_is_returned_from_cache(self):
        source = Path(self.temp.name) / "fan.stl"
        source.write_bytes(b"solid verified-fan\nendsolid verified-fan\n")
        asset = self.resolver.register_verified_asset(
            manufacturer="Sunon",
            mpn="PF80251B1-000U-S99",
            family="axial_fan",
            source_file=source,
            source_url="internal://tier2/axial_fan",
            licence="PROPRIETARY-INTERNAL",
            bbox_mm=(80.0, 25.0, 80.0),
        )

        resolved = self.resolver.resolve(
            "Sunon", "PF80251B1-000U-S99", "axial_fan")

        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.asset_sha256, asset.asset_sha256)
        self.assertTrue(resolved.local_path.exists())
        self.assertEqual(resolved.resolution_tier, "exact")

    def test_family_asset_is_safe_fallback(self):
        source = Path(self.temp.name) / "family.stl"
        source.write_bytes(b"solid fan-family\nendsolid fan-family\n")
        self.resolver.register_verified_asset(
            manufacturer="ForgeOS",
            mpn="FAMILY-AXIAL-FAN-80",
            family="axial_fan",
            source_file=source,
            source_url="internal://tier2/axial_fan",
            licence="PROPRIETARY-INTERNAL",
            bbox_mm=(80.0, 25.0, 80.0),
            is_family_asset=True,
        )

        resolved = self.resolver.resolve(
            "Unknown", "UNKNOWN-FAN", "axial_fan")

        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.resolution_tier, "family")
        self.assertEqual(len(self.resolver.pending_search_attempts()), 1)

    def test_read_only_render_consumer_cannot_write(self):
        reader = CadAssetResolver(
            db_path=self.resolver.db_path,
            asset_root=self.resolver.asset_root,
            read_only=True,
        )
        source = Path(self.temp.name) / "blocked.stl"
        source.write_bytes(b"solid blocked\nendsolid blocked\n")
        with self.assertRaises(RuntimeError):
            reader.register_verified_asset(
                manufacturer="X",
                mpn="Y",
                family="blocked",
                source_file=source,
                source_url="internal://blocked",
                licence="TEST",
                bbox_mm=(1.0, 1.0, 1.0),
            )


if __name__ == "__main__":
    unittest.main()
