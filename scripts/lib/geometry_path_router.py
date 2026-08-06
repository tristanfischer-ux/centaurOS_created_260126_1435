#!/usr/bin/env python3
"""Principal connection path routing for geometry kernel.

v2: routes between *port faces* on component envelopes (not body origins).
Falls open with OPEN hold rather than inventing snake-through-vessel geometry.
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional


def _origin(comp: dict[str, Any]) -> list[float]:
    pose = comp.get("pose") or {}
    o = pose.get("origin_mm") or [0, 0, 0]
    if isinstance(o, (list, tuple)) and len(o) >= 3:
        return [float(o[0]), float(o[1]), float(o[2])]
    return [0.0, 0.0, 0.0]


def _half_extents(comp: dict[str, Any]) -> tuple[list[float], list[float]]:
    """Return (centre_mm, half_extents_mm) in world frame.

    IR convention: origin is bottom-centre of the solid (Z up from base).
    """
    o = _origin(comp)
    params = comp.get("params_mm") or {}
    family = str(comp.get("family") or "box")
    if family in ("cylinder", "flange_port"):
        dia = float(params.get("dia") or params.get("d") or 20)
        ln = float(params.get("len") or params.get("h") or 20)
        r = max(0.5, dia / 2.0)
        centre = [o[0], o[1], o[2] + ln / 2.0]
        half = [r, r, ln / 2.0]
        return centre, half
    w = float(params.get("w") or 20)
    d = float(params.get("d") or 20)
    h = float(params.get("h") or 15)
    centre = [o[0], o[1], o[2] + h / 2.0]
    half = [max(0.5, w / 2.0), max(0.5, d / 2.0), max(0.5, h / 2.0)]
    return centre, half


def port_on_envelope(
    comp: dict[str, Any],
    toward: list[float],
    *,
    kind: str = "signal",
) -> list[float]:
    """Point on the axis-aligned envelope face nearest the direction to *toward*.

    For fluid/power we prefer lateral faces (not top/bottom) when the horizontal
    component dominates; otherwise allow top/bottom exits.
    """
    centre, half = _half_extents(comp)
    dx = float(toward[0]) - centre[0]
    dy = float(toward[1]) - centre[1]
    dz = float(toward[2]) - centre[2]
    # Avoid zero vector
    if abs(dx) + abs(dy) + abs(dz) < 1e-9:
        dx = 1.0
    # Prefer side faces for cables/tubes when XY separation is meaningful
    prefer_lateral = re.search(r"power|fluid|water|media|signal|electrical|dc|bus|can", kind or "", re.I)
    ax, ay, az = abs(dx), abs(dy), abs(dz)
    if prefer_lateral and max(ax, ay) >= az * 0.5:
        # project onto XY side
        if ax >= ay:
            sx = 1.0 if dx >= 0 else -1.0
            return [centre[0] + sx * half[0], centre[1], centre[2]]
        sy = 1.0 if dy >= 0 else -1.0
        return [centre[0], centre[1] + sy * half[1], centre[2]]
    # full 3D face: largest relative component
    # scale direction so it hits the AABB
    # parametric: centre + t * dir hits face when |t*d_i| = half_i
    eps = 1e-12
    ts = []
    for d_i, h_i in ((dx, half[0]), (dy, half[1]), (dz, half[2])):
        if abs(d_i) > eps:
            ts.append(h_i / abs(d_i))
    t = min(ts) if ts else 0.0
    return [
        centre[0] + t * dx,
        centre[1] + t * dy,
        centre[2] + t * dz,
    ]


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
    from_port: Optional[list[float]] = None,
    to_port: Optional[list[float]] = None,
) -> dict[str, Any]:
    """Polyline with optional mid riser when Δz is large.

    Prefer explicit port points; fall back to origins (legacy).
    """
    a = list(from_port if from_port is not None else from_origin)
    b = list(to_port if to_port is not None else to_origin)
    span = math.sqrt(sum((b[i] - a[i]) ** 2 for i in range(3)))
    if span < 1e-3:
        return {
            "id": edge_id,
            "kind": kind,
            "from_tag": from_tag,
            "to_tag": to_tag,
            "section": default_section(kind),
            "centreline_mm": [a, b],
            "from_port_mm": a,
            "to_port_mm": b,
            "status": "OPEN",
            "router": "v2_port_face",
            "reason": "coincident endpoints — no path length",
        }
    centreline = [a]
    if abs(b[2] - a[2]) > 5.0:
        mid_z = (a[2] + b[2]) / 2.0
        centreline.append([a[0], a[1], mid_z])
        centreline.append([b[0], b[1], mid_z])
    centreline.append(b)
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
        "from_port_mm": a,
        "to_port_mm": b,
        "status": "ROUTED",
        "router": "v2_port_face" if from_port is not None else "v1_straight_riser",
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
        if not re.search(
            r"power|fluid|water|media|signal|air|electrical|dc|bus|thermal|coolant|can",
            kind,
            re.I,
        ):
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
        kind = str(e.get("kind") or "signal")
        # Port faces on envelopes toward each other
        a_c, _ = _half_extents(a)
        b_c, _ = _half_extents(b)
        from_port = port_on_envelope(a, b_c, kind=kind)
        to_port = port_on_envelope(b, a_c, kind=kind)
        path = route_edge(
            edge_id=str(e["id"]),
            kind=kind,
            from_tag=str(a.get("tag")),
            to_tag=str(b.get("tag")),
            from_origin=_origin(a),
            to_origin=_origin(b),
            from_port=from_port,
            to_port=to_port,
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
    # Port face: box at origin bottom, target to +X should hit +X face
    box = {
        "tag": "A",
        "family": "box",
        "params_mm": {"w": 20, "d": 10, "h": 10},
        "pose": {"origin_mm": [0, 0, 0]},
    }
    pt = port_on_envelope(box, [100, 0, 5], kind="signal")
    assert abs(pt[0] - 10.0) < 0.1, pt  # +X face at w/2
    assert abs(pt[1] - 0.0) < 0.1, pt

    p = route_edge(
        edge_id="c1",
        kind="fluid",
        from_tag="A",
        to_tag="B",
        from_origin=[0, 0, 0],
        to_origin=[100, 0, 50],
        from_port=[10, 0, 5],
        to_port=[90, 0, 25],
    )
    assert p["status"] == "ROUTED"
    assert p["router"] == "v2_port_face"
    assert len(p["centreline_mm"]) >= 2
    # endpoints are ports not origins
    assert p["centreline_mm"][0] == [10, 0, 5]
    assert p["centreline_mm"][-1] == [90, 0, 25]

    # route_all with two boxes
    b2 = {
        "tag": "B",
        "name": "Other",
        "family": "box",
        "params_mm": {"w": 20, "d": 10, "h": 10},
        "pose": {"origin_mm": [100, 0, 0]},
    }
    paths, holds = route_all(
        [{"id": "e1", "from": "A", "to": "B", "kind": "fluid", "from_tag": "A", "to_tag": "B"}],
        {"A": box, "B": b2},
    )
    assert len(paths) == 1
    assert paths[0]["router"] == "v2_port_face"
    # first point near right face of A, last near left face of B
    assert paths[0]["from_port_mm"][0] > 0
    assert paths[0]["to_port_mm"][0] < 100
    print("geometry_path_router selftest OK")


if __name__ == "__main__":
    _selftest()
