#!/usr/bin/env python3
"""Geometry completeness gates (G-BOM-GEO, G-CONN-3D, G-STEP)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


def evaluate_completeness(
    ir: dict[str, Any],
    *,
    principal_tags: list[str],
    principal_edges: Optional[list[dict[str, Any]]] = None,
    step_path: Optional[Path] = None,
) -> dict[str, Any]:
    """Score BoM↔geometry coverage. HIGH missing principals bind domain grade later."""
    principals = set(str(t) for t in principal_tags if t)
    solid_tags = {
        str(c.get("tag"))
        for c in (ir.get("components") or [])
        if isinstance(c, dict)
        and c.get("geometry_kind") in ("solid", "envelope_only")
        and c.get("status") != "OPEN"
    }
    open_tags = {
        str(h.get("tag"))
        for h in (ir.get("holds") or [])
        if isinstance(h, dict) and h.get("tag")
    }
    open_tags |= {
        str(c.get("tag"))
        for c in (ir.get("components") or [])
        if isinstance(c, dict) and c.get("geometry_kind") == "open"
    }
    consumable_tags = {
        str(c.get("tag"))
        for c in (ir.get("consumables") or [])
        if isinstance(c, dict) and c.get("tag")
    }
    path_ids = {
        str(p.get("id"))
        for p in (ir.get("paths") or [])
        if isinstance(p, dict) and p.get("status") == "ROUTED"
    }
    path_tags_covered = set()
    for p in ir.get("paths") or []:
        if not isinstance(p, dict):
            continue
        if p.get("from_tag"):
            path_tags_covered.add(str(p["from_tag"]))
        if p.get("to_tag"):
            path_tags_covered.add(str(p["to_tag"]))

    missing = sorted(
        t
        for t in principals
        if t not in solid_tags
        and t not in open_tags
        and t not in consumable_tags
    )

    defects: list[str] = []
    high = 0
    med = 0
    score = 10.0

    if missing:
        high += 1
        score = min(score, 4.0)
        defects.append(
            f"G-BOM-GEO HIGH: {len(missing)} principal(s) have no solid/path/hold: "
            + ", ".join(missing[:8])
            + ("…" if len(missing) > 8 else "")
        )

    edges = principal_edges or []
    n_edges = len(edges)
    routed = 0
    held = 0
    edge_missing = []
    for e in edges:
        eid = str(e.get("id") or e.get("edge_id") or "")
        status = str(e.get("geometry_status") or "")
        if eid and eid in path_ids:
            routed += 1
        elif status == "OPEN" or e.get("held_open"):
            held += 1
        else:
            # unrouted principal edge
            edge_missing.append(eid or f"{e.get('from')}->{e.get('to')}")
    if edge_missing and n_edges:
        # only HIGH if majority unrouted without holds
        if len(edge_missing) > max(1, n_edges // 4):
            high += 1
            score = min(score, 4.0)
            defects.append(
                f"G-CONN-3D HIGH: {len(edge_missing)}/{n_edges} principal edges "
                f"unrouted and not OPEN — e.g. {edge_missing[0]}"
            )
        else:
            med += 1
            score = min(score, 7.0)
            defects.append(
                f"G-CONN-3D MED: {len(edge_missing)} principal edge(s) unrouted"
            )

    step_ok = None
    if step_path is not None:
        step_ok = Path(step_path).is_file() and Path(step_path).stat().st_size > 200
        if not step_ok:
            med += 1
            score = min(score, 7.0)
            defects.append("G-STEP MED: assembly.step missing or empty")

    n_solid = len(solid_tags)
    n_open = len(open_tags)
    n_cons = len(consumable_tags)
    # Unique principal coverage — a tag may appear as both solid (envelope)
    # and OPEN hold note; never count twice or exceed n_principals.
    covered = (solid_tags | open_tags | consumable_tags) & principals
    n_covered = len(covered)
    n_prin = len(principals) or 1
    coverage = n_covered / n_prin
    if coverage < 0.8 and not missing:
        # soft if tags from loose set
        med += 1
        score = min(score, 8.0)

    score = max(0.0, round(score, 1))
    return {
        "schema": "anvil.geometry_completeness/1",
        "n_principals": len(principals),
        "n_solid": n_solid,
        "n_path": len(path_ids),
        "n_consumable": n_cons,
        "n_open_holds": n_open,
        "n_covered_unique": n_covered,
        "missing": missing,
        "path_coverage": {
            "principal_edges": n_edges,
            "routed": routed,
            "held_open": held,
            "unrouted": len(edge_missing),
        },
        "step_ok": step_ok,
        "score": score,
        "high_count": high,
        "med_count": med,
        "binding_high": high > 0,
        "defects": defects[:12],
        "detail": (
            f"geometry completeness {score}/10 "
            f"(principals {n_covered}/{len(principals)} covered unique; "
            f"solid={n_solid} open={n_open} consumable={n_cons}; "
            f"OPEN holds are deliberate coverage, not silent omission)"
        ),
    }


def save_completeness(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def _selftest() -> None:
    ir = {
        "schema": "anvil.geometry_assembly/1",
        "components": [
            {"tag": "A", "geometry_kind": "solid", "family": "box", "status": "PLACED"},
            {"tag": "B", "geometry_kind": "open", "status": "OPEN"},
        ],
        "paths": [],
        "holds": [],
        "consumables": [{"tag": "C"}],
    }
    r = evaluate_completeness(ir, principal_tags=["A", "B", "C", "D"])
    assert r["binding_high"] is True
    assert "D" in r["missing"]
    r2 = evaluate_completeness(ir, principal_tags=["A", "B", "C"])
    assert r2["binding_high"] is False
    print("geometry_completeness selftest OK", r["score"], r2["score"])


if __name__ == "__main__":
    _selftest()
