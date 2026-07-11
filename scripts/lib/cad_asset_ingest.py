#!/usr/bin/env python3
"""Validated background acquisition for queued CAD database misses."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol

from cad_asset_resolver import CadAssetResolver


@dataclass(frozen=True)
class CadCandidate:
    manufacturer: str
    mpn: str
    family: str
    source_file: Path
    source_url: str
    licence: str
    bbox_mm: tuple[float, float, float]


class CadProvider(Protocol):
    name: str

    def search(self, attempt: dict) -> Optional[CadCandidate]:
        ...


@dataclass(frozen=True)
class IngestResult:
    attempted: int
    resolved: int
    rejected: int
    not_found: int
    failed: int


_ALLOWED_EXTENSIONS = {".stl", ".step", ".stp", ".glb"}
_REJECTED_LICENCES = {"", "UNKNOWN", "UNLICENSED", "NOASSERTION"}


def validate_candidate(candidate: CadCandidate) -> tuple[bool, str]:
    if not candidate.source_file.exists():
        return False, "candidate file does not exist"
    if candidate.source_file.suffix.lower() not in _ALLOWED_EXTENSIONS:
        return False, f"unsupported CAD extension {candidate.source_file.suffix}"
    if candidate.source_file.stat().st_size <= 16:
        return False, "candidate CAD file is empty/truncated"
    if candidate.licence.strip().upper() in _REJECTED_LICENCES:
        return False, "licence missing or unacceptable"
    if not candidate.source_url.strip():
        return False, "source URL missing"
    if len(candidate.bbox_mm) != 3 or any(
            not isinstance(value, (int, float)) or value <= 0
            for value in candidate.bbox_mm):
        return False, "bbox must contain three positive dimensions"
    return True, ""


class LocalCadDirectoryProvider:
    """Search a curated local mirror populated by approved external ingest jobs."""

    name = "local-curated"

    def __init__(
        self,
        roots: list[str | Path],
        licence: str,
        source_prefix: str,
        family: Optional[str] = None,
    ):
        self.roots = [Path(root).expanduser() for root in roots]
        self.licence = licence
        self.source_prefix = source_prefix.rstrip("/")
        self.family = family

    @staticmethod
    def _normalise(value: object) -> str:
        return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())

    def search(self, attempt: dict) -> Optional[CadCandidate]:
        mpn_norm = str(attempt.get("mpn_norm") or "")
        if not mpn_norm:
            return None
        for root in self.roots:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if not path.is_file() or path.suffix.lower() not in _ALLOWED_EXTENSIONS:
                    continue
                if mpn_norm not in self._normalise(path.stem):
                    continue
                # Local mirrors must provide validated bbox metadata alongside
                # the model; never guess units/dimensions from file coordinates.
                bbox_path = path.with_suffix(path.suffix + ".bbox")
                if not bbox_path.exists():
                    continue
                try:
                    bbox = tuple(float(x) for x in bbox_path.read_text().split(","))
                except (OSError, ValueError):
                    continue
                if len(bbox) != 3:
                    continue
                return CadCandidate(
                    manufacturer=str(attempt.get("manufacturer_norm") or ""),
                    mpn=str(attempt.get("mpn_norm") or ""),
                    family=self.family or str(attempt.get("family") or ""),
                    source_file=path,
                    source_url=f"{self.source_prefix}/{path.name}",
                    licence=self.licence,
                    bbox_mm=(bbox[0], bbox[1], bbox[2]),
                )
        return None


class KiCadLocalProvider(LocalCadDirectoryProvider):
    """Resolve exact MPN STEP files from the official installed KiCad library."""

    name = "kicad-official"

    def __init__(self, roots: list[str | Path]):
        super().__init__(
            roots=roots,
            licence="CC-BY-SA-4.0-WITH-KICAD-EXCEPTION",
            source_prefix="https://gitlab.com/kicad/libraries/kicad-packages3D",
        )

    def search(self, attempt: dict) -> Optional[CadCandidate]:
        mpn_norm = str(attempt.get("mpn_norm") or "")
        if not mpn_norm:
            return None
        try:
            import cadquery as cq
        except ImportError:
            return None
        for root in self.roots:
            if not root.exists():
                continue
            for path in root.rglob("*.step"):
                if mpn_norm not in self._normalise(path.stem):
                    continue
                try:
                    shape = cq.importers.importStep(str(path))
                    bbox = shape.val().BoundingBox()
                    bbox_mm = (float(bbox.xlen), float(bbox.ylen), float(bbox.zlen))
                except Exception:  # noqa: BLE001 — corrupt model is ignored
                    continue
                return CadCandidate(
                    manufacturer=str(attempt.get("manufacturer_norm") or ""),
                    mpn=str(attempt.get("mpn_norm") or ""),
                    family=str(attempt.get("family") or ""),
                    source_file=path,
                    source_url=f"{self.source_prefix}/{path.name}",
                    licence=self.licence,
                    bbox_mm=bbox_mm,
                )
        return None


class CadAssetIngestWorker:
    """Process pending misses once, writing only validated published assets."""

    def __init__(self, resolver: CadAssetResolver, providers: list[CadProvider]):
        if resolver.read_only:
            raise ValueError("ingest worker requires a writable CAD resolver")
        self.resolver = resolver
        self.providers = providers

    def run_once(self, limit: int = 25) -> IngestResult:
        attempts = self.resolver.pending_search_attempts(limit)
        resolved = rejected = not_found = failed = 0
        for attempt in attempts:
            candidate = None
            provider_name = ""
            try:
                for provider in self.providers:
                    provider_name = provider.name
                    candidate = provider.search(attempt)
                    if candidate is not None:
                        break
                if candidate is None:
                    not_found += 1
                    self.resolver.mark_search_attempt(
                        attempt["identity_key"],
                        "not_found",
                        "no approved provider returned a candidate",
                    )
                    continue
                valid, reason = validate_candidate(candidate)
                if not valid:
                    rejected += 1
                    self.resolver.mark_search_attempt(
                        attempt["identity_key"],
                        "rejected",
                        f"{provider_name}: {reason}",
                    )
                    continue
                self.resolver.register_verified_asset(
                    manufacturer=candidate.manufacturer,
                    mpn=candidate.mpn,
                    family=candidate.family,
                    source_file=candidate.source_file,
                    source_url=candidate.source_url,
                    licence=candidate.licence,
                    bbox_mm=candidate.bbox_mm,
                )
                self.resolver.mark_search_attempt(
                    attempt["identity_key"], "resolved")
                resolved += 1
            except Exception as exc:  # noqa: BLE001 — batch continues; failure is recorded
                failed += 1
                self.resolver.mark_search_attempt(
                    attempt["identity_key"],
                    "failed",
                    f"{provider_name or 'provider'}: {type(exc).__name__}: {exc}",
                )
        return IngestResult(
            attempted=len(attempts),
            resolved=resolved,
            rejected=rejected,
            not_found=not_found,
            failed=failed,
        )

