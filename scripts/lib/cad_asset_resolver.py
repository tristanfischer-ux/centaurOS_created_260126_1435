#!/usr/bin/env python3
"""DB-first CAD asset resolver with validated writeback and local caching."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class ResolvedCadAsset:
    asset_sha256: str
    local_path: Path
    family: str
    bbox_mm: tuple[float, float, float]
    resolution_tier: str
    source_url: str
    licence: str


def _normalise(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())


class CadAssetResolver:
    """Resolve published CAD from the truth DB; queue one ingest attempt on miss."""

    def __init__(
        self,
        db_path: str | Path,
        asset_root: str | Path,
        read_only: bool = False,
    ):
        self.db_path = Path(db_path).expanduser()
        self.asset_root = Path(asset_root).expanduser()
        self.read_only = read_only
        if not read_only:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self.asset_root.mkdir(parents=True, exist_ok=True)
            self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        if self.read_only:
            connection = sqlite3.connect(
                f"file:{self.db_path}?mode=ro", uri=True)
        else:
            connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS cad_assets (
                    asset_sha256 TEXT PRIMARY KEY,
                    storage_path TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    licence TEXT NOT NULL,
                    bbox_mm_json TEXT NOT NULL,
                    verification_status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cad_part_mappings (
                    manufacturer_norm TEXT NOT NULL,
                    mpn_norm TEXT NOT NULL,
                    family TEXT NOT NULL,
                    asset_sha256 TEXT NOT NULL REFERENCES cad_assets(asset_sha256),
                    is_family_asset INTEGER NOT NULL DEFAULT 0,
                    confidence REAL NOT NULL DEFAULT 1.0,
                    PRIMARY KEY (manufacturer_norm, mpn_norm)
                );
                CREATE INDEX IF NOT EXISTS cad_part_mappings_family_idx
                    ON cad_part_mappings(family, is_family_asset);
                CREATE TABLE IF NOT EXISTS cad_search_attempts (
                    identity_key TEXT PRIMARY KEY,
                    manufacturer_norm TEXT NOT NULL,
                    mpn_norm TEXT NOT NULL,
                    family TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempted_at TEXT NOT NULL,
                    failure_reason TEXT
                );
                """
            )

    def _resolved_from_row(
        self,
        row: sqlite3.Row,
        resolution_tier: str,
    ) -> ResolvedCadAsset:
        bbox = tuple(float(value) for value in json.loads(row["bbox_mm_json"]))
        return ResolvedCadAsset(
            asset_sha256=row["asset_sha256"],
            local_path=Path(row["storage_path"]),
            family=row["family"],
            bbox_mm=(bbox[0], bbox[1], bbox[2]),
            resolution_tier=resolution_tier,
            source_url=row["source_url"],
            licence=row["licence"],
        )

    def resolve(
        self,
        manufacturer: str,
        mpn: str,
        family: str,
        queue_on_miss: bool = True,
    ) -> Optional[ResolvedCadAsset]:
        """Return exact/family published CAD, otherwise enqueue a single miss."""
        manufacturer_norm = _normalise(manufacturer)
        mpn_norm = _normalise(mpn)
        with self._connect() as connection:
            exact = connection.execute(
                """
                SELECT m.family, a.*
                FROM cad_part_mappings m
                JOIN cad_assets a USING (asset_sha256)
                WHERE m.manufacturer_norm = ? AND m.mpn_norm = ?
                  AND a.verification_status = 'verified'
                """,
                (manufacturer_norm, mpn_norm),
            ).fetchone()
            if exact:
                return self._resolved_from_row(exact, "exact")

            family_row = connection.execute(
                """
                SELECT m.family, a.*
                FROM cad_part_mappings m
                JOIN cad_assets a USING (asset_sha256)
                WHERE m.family = ? AND m.is_family_asset = 1
                  AND a.verification_status = 'verified'
                ORDER BY m.confidence DESC
                LIMIT 1
                """,
                (family,),
            ).fetchone()
            if family_row:
                return self._resolved_from_row(family_row, "family")

            if queue_on_miss and not self.read_only:
                identity_key = f"{manufacturer_norm}:{mpn_norm}:{family}"
                connection.execute(
                    """
                    INSERT OR IGNORE INTO cad_search_attempts
                        (identity_key, manufacturer_norm, mpn_norm, family,
                         status, attempted_at)
                    VALUES (?, ?, ?, ?, 'pending', ?)
                    """,
                    (
                        identity_key,
                        manufacturer_norm,
                        mpn_norm,
                        family,
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
        return None

    def register_verified_asset(
        self,
        manufacturer: str,
        mpn: str,
        family: str,
        source_file: str | Path,
        source_url: str,
        licence: str,
        bbox_mm: tuple[float, float, float],
        is_family_asset: bool = False,
    ) -> ResolvedCadAsset:
        """Publish a validated file and map its exact identity or family."""
        if self.read_only:
            raise RuntimeError("read-only CAD resolver cannot register assets")
        source_path = Path(source_file)
        digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
        suffix = source_path.suffix.lower() or ".cad"
        target_dir = self.asset_root / digest[:2] / digest
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"original{suffix}"
        if not target_path.exists():
            shutil.copy2(source_path, target_path)

        manufacturer_norm = _normalise(manufacturer)
        mpn_norm = _normalise(mpn)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO cad_assets
                    (asset_sha256, storage_path, source_url, licence,
                     bbox_mm_json, verification_status, created_at)
                VALUES (?, ?, ?, ?, ?, 'verified', ?)
                ON CONFLICT(asset_sha256) DO UPDATE SET
                    storage_path=excluded.storage_path,
                    source_url=excluded.source_url,
                    licence=excluded.licence,
                    bbox_mm_json=excluded.bbox_mm_json,
                    verification_status='verified'
                """,
                (
                    digest,
                    str(target_path),
                    source_url,
                    licence,
                    json.dumps(list(bbox_mm)),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            connection.execute(
                """
                INSERT INTO cad_part_mappings
                    (manufacturer_norm, mpn_norm, family, asset_sha256,
                     is_family_asset, confidence)
                VALUES (?, ?, ?, ?, ?, 1.0)
                ON CONFLICT(manufacturer_norm, mpn_norm) DO UPDATE SET
                    family=excluded.family,
                    asset_sha256=excluded.asset_sha256,
                    is_family_asset=excluded.is_family_asset,
                    confidence=excluded.confidence
                """,
                (
                    manufacturer_norm,
                    mpn_norm,
                    family,
                    digest,
                    1 if is_family_asset else 0,
                ),
            )
            connection.execute(
                """
                UPDATE cad_search_attempts
                SET status='resolved', failure_reason=NULL
                WHERE manufacturer_norm=? AND mpn_norm=? AND family=?
                """,
                (manufacturer_norm, mpn_norm, family),
            )
        return ResolvedCadAsset(
            asset_sha256=digest,
            local_path=target_path,
            family=family,
            bbox_mm=bbox_mm,
            resolution_tier="family" if is_family_asset else "exact",
            source_url=source_url,
            licence=licence,
        )

    def search_attempts(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM cad_search_attempts ORDER BY attempted_at"
            ).fetchall()
        return [dict(row) for row in rows]

