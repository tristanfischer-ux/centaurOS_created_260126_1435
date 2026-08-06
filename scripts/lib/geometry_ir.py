#!/usr/bin/env python3
"""Anvil geometry intermediate representation (IR) — assembly.json schema.

See docs/plans/ANVIL-GEOMETRY-KERNEL-CAD-FIRST-DESIGN-2026-08-06.md
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

SCHEMA = "anvil.geometry_assembly/1"
GEOMETRY_KINDS = frozenset(
    {"solid", "path", "consumable_no_mesh", "open", "envelope_only"}
)
FAMILIES = frozenset(
    {"box", "cylinder", "board", "flange_port", "path_sweep", "envelope"}
)


def empty_assembly(twin_slug: str = "") -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "units": "mm",
        "twin": twin_slug,
        "frame": {
            "origin": "site_min",
            "note": "World frame origin-shifted to site min for export",
            "site_min_mm": [0.0, 0.0, 0.0],
        },
        "components": [],
        "paths": [],
        "holds": [],
        "consumables": [],
    }


def sanitize_name(tag: str, name: str = "") -> str:
    raw = f"{tag}_{name}" if name else str(tag)
    s = re.sub(r"[^A-Za-z0-9_]+", "_", raw).strip("_")
    return (s or "part")[:80]


def validate_ir(doc: dict[str, Any]) -> list[str]:
    """Return list of validation problems (empty = OK)."""
    problems: list[str] = []
    if not isinstance(doc, dict):
        return ["IR is not an object"]
    if doc.get("schema") != SCHEMA:
        problems.append(f"unexpected schema {doc.get('schema')!r}")
    for key in ("components", "paths", "holds", "consumables"):
        if key not in doc:
            problems.append(f"missing {key}")
        elif not isinstance(doc[key], list):
            problems.append(f"{key} must be a list")
    for c in doc.get("components") or []:
        if not isinstance(c, dict):
            problems.append("component not an object")
            continue
        if not c.get("tag"):
            problems.append("component missing tag")
        gk = c.get("geometry_kind")
        if gk not in GEOMETRY_KINDS:
            problems.append(f"bad geometry_kind {gk!r} on {c.get('tag')}")
        if gk in ("solid", "envelope_only") and c.get("family") not in FAMILIES:
            # path_sweep only for paths
            if c.get("family") != "path_sweep":
                problems.append(
                    f"bad family {c.get('family')!r} on solid {c.get('tag')}"
                )
    for p in doc.get("paths") or []:
        if not isinstance(p, dict):
            continue
        if not p.get("id"):
            problems.append("path missing id")
        if not p.get("centreline_mm"):
            problems.append(f"path {p.get('id')} missing centreline")
    return problems


def save_ir(path: Path, doc: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")


def load_ir(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def geometry_dir(twin: Path) -> Path:
    return Path(twin) / "geometry"


def principal_tags_from_state(state: dict, pm: Optional[dict] = None) -> list[dict[str, Any]]:
    """Enumerate principal-like items from BoM + manifest (universal)."""
    by_tag: dict[str, dict[str, Any]] = {}
    for row in state.get("requirementsBom") or []:
        if not isinstance(row, dict):
            continue
        tag = str(row.get("tag") or "").strip()
        if not tag:
            continue
        by_tag[tag] = {
            "tag": tag,
            "name": str(row.get("requirement") or row.get("name") or tag),
            "source": "bom",
            "part": str(row.get("part") or row.get("mpn") or ""),
            "status": str(row.get("status") or ""),
        }
    # ledger equipment
    # (caller may pass; also try not to require file here)
    if pm:
        for p in pm.get("parts") or []:
            if not isinstance(p, dict):
                continue
            tag = str(p.get("tag") or p.get("equipment_tag") or "").strip()
            if not tag:
                continue
            if tag not in by_tag:
                by_tag[tag] = {
                    "tag": tag,
                    "name": str(p.get("name") or tag),
                    "source": "manifest",
                    "part": "",
                    "status": "",
                }
            by_tag[tag]["pos_mm"] = p.get("pos_mm")
            by_tag[tag]["dims_mm"] = p.get("dims_mm")
            by_tag[tag]["shape"] = p.get("shape")
    return list(by_tag.values())


def _selftest() -> None:
    a = empty_assembly("t")
    a["components"].append(
        {
            "tag": "X-1",
            "name": "Box",
            "geometry_kind": "solid",
            "family": "box",
            "params_mm": {"w": 10, "d": 10, "h": 10},
            "pose": {"origin_mm": [0, 0, 0], "rotation_rpy_deg": [0, 0, 0]},
            "status": "PLACED",
        }
    )
    assert not validate_ir(a)
    assert sanitize_name("X-1", "Hello World") == "X_1_Hello_World"
    print("geometry_ir selftest OK")


if __name__ == "__main__":
    _selftest()
