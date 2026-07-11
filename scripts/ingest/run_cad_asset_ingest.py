#!/usr/bin/env python3
"""Queue CAD misses from settled states, then resolve from approved local mirrors."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from cad_asset_ingest import (  # noqa: E402
    CadAssetIngestWorker,
    KiCadLocalProvider,
    LocalCadDirectoryProvider,
)
from cad_asset_resolver import CadAssetResolver  # noqa: E402


_FAMILIES = [
    (re.compile(r"prismatic|\blfp\b|battery[_\s-]?cells?\b|cell\s+pack", re.I),
     "lfp_prismatic_cell"),
    (re.compile(r"\bfan\b|blower", re.I), "axial_fan"),
    (re.compile(r"\bpcb\b|circuit\s+board|controller\s+board", re.I), "pcb_board"),
    (re.compile(r"heatsink|heat\s+sink|fin\s+bank", re.I), "heatsink_extruded"),
    (re.compile(r"cable\s+gland|grommet", re.I), "cable_gland"),
    (re.compile(r"terminal\s+block", re.I), "terminal_block"),
]


def family_for_name(name: str) -> str | None:
    for pattern, family in _FAMILIES:
        if pattern.search(name or ""):
            return family
    return None


def enqueue_state_misses(resolver: CadAssetResolver, state_path: Path) -> int:
    state = json.loads(state_path.read_text())
    queued_before = len(resolver.pending_search_attempts(100000))
    for part in state.get("partVerifications") or []:
        manufacturer = str(part.get("manufacturer") or "").strip()
        mpn = str(part.get("part_number") or "").strip()
        name = str(part.get("word_name") or "").strip()
        family = family_for_name(name)
        if not manufacturer or not mpn or not family:
            continue
        if re.search(r"\bTBD\b|unknown|generic|not\s+found", mpn, re.I):
            continue
        resolver.resolve(manufacturer, mpn, family, queue_on_miss=True)
    queued_after = len(resolver.pending_search_attempts(100000))
    return max(0, queued_after - queued_before)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", action="append", default=[])
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--curated-dir", action="append", default=[])
    args = parser.parse_args()

    db_path = Path(os.environ.get(
        "FORGE_TRUTH_DB", "~/.forge-truth/forge-truth.db")).expanduser()
    asset_root = Path(os.environ.get(
        "FORGE_CAD_ASSET_ROOT", "~/.forge-truth/cad-assets")).expanduser()
    resolver = CadAssetResolver(db_path, asset_root)

    queued = 0
    for raw_path in args.state:
        queued += enqueue_state_misses(resolver, Path(raw_path))

    kicad_root = Path(
        "/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels")
    providers = [KiCadLocalProvider([kicad_root])]
    curated = list(args.curated_dir)
    env_dirs = os.environ.get("FORGE_CAD_CURATED_DIRS", "")
    curated.extend(path for path in env_dirs.split(os.pathsep) if path)
    if curated:
        providers.append(LocalCadDirectoryProvider(
            curated,
            licence=os.environ.get("FORGE_CAD_CURATED_LICENCE", "NOASSERTION"),
            source_prefix=os.environ.get(
                "FORGE_CAD_CURATED_SOURCE", "file://curated-cad"),
        ))

    result = CadAssetIngestWorker(resolver, providers).run_once(args.limit)
    print(json.dumps({
        "queued": queued,
        "attempted": result.attempted,
        "resolved": result.resolved,
        "rejected": result.rejected,
        "not_found": result.not_found,
        "failed": result.failed,
    }))
    return 0 if result.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
