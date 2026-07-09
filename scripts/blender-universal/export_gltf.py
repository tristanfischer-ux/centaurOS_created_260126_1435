#!/usr/bin/env python3
"""export_gltf.py — write a lightweight glTF/GLB preview from a run's parts-manifest.

Tristan 2026-07-09: CAD model is a SEPARATE download (not in Excel). STEP is the
authoritative solid (export_step.py); this writes a browser-friendly GLB of the
same parametric primitives so a client can orbit the plant without CAD software.

Geometry mirrors export_step.py's shape classification (boxes / cylinders) as
triangle meshes — APPROXIMATIONS, not B-rep. Units: metres in glTF (manifest is mm).

Usage:
    .venv/bin/python scripts/blender-universal/export_gltf.py <run_dir>
        → writes <run_dir>/cad/<run-basename>-model.glb
    .venv/bin/python scripts/blender-universal/export_gltf.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import tempfile
from typing import Any

HORIZONTAL_SHAPES = {"horizontal_vessel", "inline_spool"}
ROUND_SHAPES = {
    "tank", "vertical_vessel", "tall_vessel", "tall_column", "stack",
    "horizontal_vessel", "inline_spool",
}


def _box_mesh(w: float, d: float, h: float) -> tuple[list[float], list[int]]:
    """Axis-aligned box centred on origin; dims in metres. Returns (xyz, indices)."""
    hx, hy, hz = w / 2.0, d / 2.0, h / 2.0
    verts = [
        -hx, -hy, -hz,  hx, -hy, -hz,  hx,  hy, -hz, -hx,  hy, -hz,
        -hx, -hy,  hz,  hx, -hy,  hz,  hx,  hy,  hz, -hx,  hy,  hz,
    ]
    idx = [
        0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
    ]
    return verts, idx


def _cyl_mesh(dia: float, length: float, *, horizontal: bool, segments: int = 16) -> tuple[list[float], list[int]]:
    """Cylinder centred on origin; vertical (Z) or horizontal (X). Dims in metres."""
    r = dia / 2.0
    half = length / 2.0
    verts: list[float] = []
    idx: list[int] = []
    for i in range(segments):
        a = 2.0 * math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        if horizontal:
            # axis +X; circle in YZ
            verts.extend([ -half, r * c, r * s,  half, r * c, r * s ])
        else:
            verts.extend([ r * c, r * s, -half,  r * c, r * s,  half ])
    # side quads
    for i in range(segments):
        a = 2 * i
        b = 2 * ((i + 1) % segments)
        idx.extend([a, b, a + 1, b, b + 1, a + 1])
    return verts, idx


def _part_mesh(part: dict[str, Any]) -> tuple[list[float], list[int]] | None:
    dims = part.get("dims_mm") or {}
    shape = str(part.get("shape") or "")
    if "dia" in dims and "len" in dims:
        dia_m = float(dims["dia"]) / 1000.0
        len_m = float(dims["len"]) / 1000.0
        if dia_m <= 0 or len_m <= 0:
            return None
        return _cyl_mesh(dia_m, len_m, horizontal=shape in HORIZONTAL_SHAPES)
    w = float(dims.get("w") or dims.get("width") or 0) / 1000.0
    d = float(dims.get("d") or dims.get("depth") or 0) / 1000.0
    h = float(dims.get("h") or dims.get("height") or 0) / 1000.0
    if w <= 0 or d <= 0 or h <= 0:
        return None
    return _box_mesh(w, d, h)


def _translate(verts: list[float], pos_mm: list[float]) -> list[float]:
    ox, oy, oz = (float(pos_mm[0]) / 1000.0, float(pos_mm[1]) / 1000.0, float(pos_mm[2]) / 1000.0)
    out: list[float] = []
    for i in range(0, len(verts), 3):
        out.extend([verts[i] + ox, verts[i + 1] + oy, verts[i + 2] + oz])
    return out


def build_scene(parts: list[dict[str, Any]]) -> tuple[list[float], list[int], list[dict[str, Any]]]:
    """Merge all part meshes into one buffer; return (positions, indices, node_meta)."""
    all_v: list[float] = []
    all_i: list[int] = []
    meta: list[dict[str, Any]] = []
    v_base = 0
    for p in parts:
        mesh = _part_mesh(p)
        if mesh is None:
            continue
        verts, idx = mesh
        pos = p.get("pos_mm") or [0, 0, 0]
        verts = _translate(verts, pos)
        all_v.extend(verts)
        all_i.extend([j + v_base for j in idx])
        n_verts = len(verts) // 3
        meta.append({
            "name": f"{p.get('equipment_tag') or p.get('tag') or 'part'} — {p.get('name') or ''}".strip(" —"),
            "v_start": v_base,
            "v_count": n_verts,
            "i_start": len(all_i) - len(idx),
            "i_count": len(idx),
        })
        v_base += n_verts
    return all_v, all_i, meta


def write_glb(positions: list[float], indices: list[int], out_path: str) -> dict[str, Any]:
    """Minimal single-mesh GLB (no materials beyond default)."""
    if not positions or not indices:
        raise ValueError("empty mesh — nothing to export")

    pos_bytes = struct.pack(f"<{len(positions)}f", *positions)
    # pad to 4-byte
    if len(pos_bytes) % 4:
        pos_bytes += b"\x00" * (4 - len(pos_bytes) % 4)
    idx_bytes = struct.pack(f"<{len(indices)}I", *indices)
    if len(idx_bytes) % 4:
        idx_bytes += b"\x00" * (4 - len(idx_bytes) % 4)

    bin_blob = pos_bytes + idx_bytes
    pos_min = [min(positions[i::3]) for i in range(3)]
    pos_max = [max(positions[i::3]) for i in range(3)]

    gltf: dict[str, Any] = {
        "asset": {"version": "2.0", "generator": "ForgeOS export_gltf.py"},
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(idx_bytes), "target": 34963},
        ],
        "accessors": [
            {
                "bufferView": 0, "componentType": 5126, "count": len(positions) // 3,
                "type": "VEC3", "min": pos_min, "max": pos_max,
            },
            {
                "bufferView": 1, "componentType": 5125, "count": len(indices),
                "type": "SCALAR",
            },
        ],
        "meshes": [{
            "primitives": [{
                "attributes": {"POSITION": 0},
                "indices": 1,
                "mode": 4,
            }],
        }],
        "nodes": [{"mesh": 0, "name": "plant"}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    if len(json_bytes) % 4:
        json_bytes += b" " * (4 - len(json_bytes) % 4)

    # GLB container
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_blob)
    with open(out_path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        fh.write(json_bytes)
        fh.write(struct.pack("<I4s", len(bin_blob), b"BIN\x00"))
        fh.write(bin_blob)
    return {"bytes": os.path.getsize(out_path), "vertices": len(positions) // 3, "triangles": len(indices) // 3}


def write_gltf(run_dir: str, out_path: str | None = None) -> tuple[str, dict[str, Any]]:
    run_dir = os.path.abspath(run_dir)
    manifest_path = os.path.join(run_dir, "parts-manifest.json")
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"parts-manifest.json missing in {run_dir}")
    manifest = json.load(open(manifest_path))
    parts = manifest.get("parts") or []
    product = os.path.basename(run_dir.rstrip("/"))
    if out_path is None:
        out_path = os.path.join(run_dir, "cad", f"{product}-model.glb")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    positions, indices, meta = build_scene(parts)
    stats = write_glb(positions, indices, out_path)
    stats["parts_meshed"] = len(meta)
    stats["manifest_count"] = manifest.get("count", len(parts))
    return out_path, stats


def selftest() -> int:
    tmp = tempfile.mkdtemp(prefix="export-gltf-selftest-")
    manifest = {
        "schema": "parts-manifest/1",
        "count": 2,
        "parts": [
            {"tag": "t1", "equipment_tag": "TK-101", "name": "Tank",
             "shape": "tank", "pos_mm": [0, 0, 1850],
             "dims_mm": {"dia": 3700.0, "len": 3700.0}},
            {"tag": "b1", "equipment_tag": "SK-101", "name": "Skid",
             "shape": "box", "pos_mm": [5000, 0, 500],
             "dims_mm": {"w": 2000.0, "d": 1500.0, "h": 1000.0}},
        ],
    }
    json.dump(manifest, open(os.path.join(tmp, "parts-manifest.json"), "w"))
    path, stats = write_gltf(tmp)
    assert os.path.exists(path) and stats["bytes"] > 100, stats
    with open(path, "rb") as fh:
        magic = fh.read(4)
    assert magic == b"glTF", magic
    # proveCatch: empty parts → must raise
    json.dump({"schema": "parts-manifest/1", "count": 0, "parts": []},
              open(os.path.join(tmp, "parts-manifest.json"), "w"))
    try:
        write_gltf(tmp, out_path=os.path.join(tmp, "empty.glb"))
        print("  FAIL export_gltf proveCatch: empty parts must raise"); return 1
    except ValueError:
        pass
    print(f"[selftest] PASS — GLB {stats['bytes']} bytes, "
          f"{stats['parts_meshed']} parts, {stats['triangles']} tris ({tmp})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("run_dir", nargs="?", help="run output dir containing parts-manifest.json")
    ap.add_argument("--out", help="explicit output .glb path")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.run_dir:
        ap.error("run_dir required (or --selftest)")
    path, stats = write_gltf(args.run_dir, out_path=args.out)
    print(f"[export_gltf] wrote {path}  ({stats['bytes']:,} bytes)  "
          f"parts={stats['parts_meshed']}/{stats['manifest_count']}  "
          f"tris={stats['triangles']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
