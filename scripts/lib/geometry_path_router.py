#!/usr/bin/env python3
"""Principal connection path routing for geometry kernel (v1).

Straight + riser paths between component origins. Fails open with OPEN hold
rather than inventing snake-through-vessel geometry.
"""
from __future__ import annotations

import re
from typing import Any, Optional


def _origin(comp: dict[str, Any]) -> list[float]:
    pose = comp.get("pose") or {}
    o = pose.get("origin_mm") or [0, 0, 0]
    if isinstance(o, (list, tuple)) and len(o) >= 3:
        return [float(o[0]), float(o[1]), float(o[2])]
    return [0.0, 0.0, 0.0]


def default_section(kind: str) -> dict[str, Any]:
    k = (kind or "").lower()
    if "fluid" in k or "water" in k or "media" in k or "air" in k:
        return {"type": "tube", "id_mm": 4.0, "od_mm": 6.0}
    if "signal" in k or "data" in k or "can" in k:
        return {"type": "cable", "od_mm": 2.0}
    return {"type": "cable", "od_mm": 4.0}


def route_edge(
    *,
    edge_id: str,
    kind: str,
    from_tag: str,
    to_tag: str,
    from_origin: list[float],
    to_origin: list[float],
) -> dict[str, Any]:
    """v1: polyline with optional mid riser when Δz is large."""
    a = list(from_origin)
    b = list(to_origin)
    span = sum((b[i] - a[i]) ** 2 for i in range(3)) ** 0.5
    # Coincident endpoints are not a real route — hold OPEN rather than
    # declare ROUTED with a zero-length centreline.
    if span < 1e-3:
        return {
            "id": edge_id,
            "kind": kind,
            "from_tag": from_tag,
            "to_tag": to_tag,
            "section": default_section(kind),
            "centreline_mm": [a, b],
            "status": "OPEN",
            "router": "v1_straight_riser",
            "reason": "coincident endpoints — no path length",
        }
    centreline = [a]
    if abs(b[2] - a[2]) > 5.0:
        mid_z = (a[2] + b[2]) / 2.0
        centreline.append([a[0], a[1], mid_z])
        centreline.append([b[0], b[1], mid_z])
    centreline.append(b)
    # collapse duplicates
    cleaned = [centreline[0]]
    for p in centreline[1:]:
        if any(abs(p[i] - cleaned[-1][i]) > 1e-6 for i in range(3)):
            cleaned.append(p)
    return {
        "id": edge_id,
        "kind": kind,
        "from_tag": from_tag,
        "to_tag": to_tag,
        "section": default_section(kind),
        "centreline_mm": cleaned,
        "status": "ROUTED",
        "router": "v1_straight_riser",
    }


def load_principal_edges(
    connections: list,
    *,
    is_instrument: bool = False,
) -> list[dict[str, Any]]:
    """Normalise connection rows; drop non-physical instrument edges when possible."""
    try:
        from instrument_connection_kinds import edge_is_nonphysical
    except ImportError:
        edge_is_nonphysical = None  # type: ignore

    edges = []
    for i, c in enumerate(connections or []):
        if not isinstance(c, dict):
            continue
        fr = str(
            c.get("from")
            or c.get("from_name")
            or c.get("from_tag")
            or c.get("from_part")
            or c.get("fromPart")
            or ""
        )
        to = str(
            c.get("to")
            or c.get("to_name")
            or c.get("to_tag")
            or c.get("to_part")
            or c.get("toPart")
            or ""
        )
        kind = str(
            c.get("service")
            or c.get("kind")
            or c.get("medium")
            or c.get("mechanism")
            or "signal"
        )
        if not fr or not to:
            continue
        if is_instrument and edge_is_nonphysical is not None:
            if edge_is_nonphysical(fr, to, kind):
                continue
        # only route principal kinds (incl. electrical_bus / thermal coolant)
        if not re.search(
            r"power|fluid|water|media|signal|air|electrical|dc|bus|thermal|coolant|can",
            kind,
            re.I,
        ):
            # still allow generic if explicitly marked
            if not c.get("route_3d"):
                continue
        eid = str(c.get("id") or c.get("edge_id") or f"conn-{i}")
        edges.append(
            {
                "id": eid,
                "from": fr,
                "to": to,
                "kind": kind,
                "from_tag": c.get("from_tag") or fr,
                "to_tag": c.get("to_tag") or to,
            }
        )
    return edges


def route_all(
    edges: list[dict[str, Any]],
    components_by_name_or_tag: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (routed_paths, open_holds)."""
    paths = []
    holds = []

    def resolve(key: str) -> Optional[dict]:
        if key in components_by_name_or_tag:
            return components_by_name_or_tag[key]
        # fuzzy name match
        kl = key.lower()
        for k, v in components_by_name_or_tag.items():
            if kl == k.lower() or kl in str(v.get("name") or "").lower():
                return v
            if kl == str(v.get("tag") or "").lower():
                return v
        return None

    for e in edges:
        a = resolve(str(e.get("from_tag") or e.get("from")))
        b = resolve(str(e.get("to_tag") or e.get("to")))
        if not a or not b:
            holds.append(
                {
                    "tag": e.get("id"),
                    "geometry_kind": "open",
                    "reason": f"path endpoints unresolved: {e.get('from')} → {e.get('to')}",
                    "status": "OPEN",
                    "kind": "path",
                }
            )
            e["held_open"] = True
            e["geometry_status"] = "OPEN"
            continue
        path = route_edge(
            edge_id=str(e["id"]),
            kind=str(e.get("kind") or "signal"),
            from_tag=str(a.get("tag")),
            to_tag=str(b.get("tag")),
            from_origin=_origin(a),
            to_origin=_origin(b),
        )
        if path.get("status") == "OPEN":
            holds.append(
                {
                    "tag": e.get("id"),
                    "geometry_kind": "open",
                    "reason": path.get("reason") or "path not exportable",
                    "status": "OPEN",
                    "kind": "path",
                }
            )
            e["held_open"] = True
            e["geometry_status"] = "OPEN"
            continue
        paths.append(path)
    return paths, holds


def _selftest() -> None:
    p = route_edge(
        edge_id="c1",
        kind="fluid",
        from_tag="A",
        to_tag="B",
        from_origin=[0, 0, 0],
        to_origin=[100, 0, 50],
    )
    assert p["status"] == "ROUTED"
    assert len(p["centreline_mm"]) >= 2
    print("geometry_path_router selftest OK")


if __name__ == "__main__":
    _selftest()
