#!/usr/bin/env python3
"""determinism_check.py — PROVE the universal Blender layout is deterministic (#86).

Renders ONE state.json through build_universal_scene.py TWICE (separate Blender processes)
and asserts the two runs produce BIT-IDENTICAL part positions AND connection edges. The
layout MUST be deterministic — Blender placement is the single source of truth the GA + every
2-D drawing read from, so a wandering layout means the whole dossier's geometry drifts run-to-run
(the GA≠render divergence + the render-tab scoring treadmill). Tristan 2026-06-29.

WHY THIS GUARD EXISTS: Blender's bundled Python FORCES hash randomisation ON and IGNORES
PYTHONHASHSEED (verified), so any set/dict-of-strings iteration in the placement path orders
differently each process. A single unsorted tie-break (a ledger endpoint closer, the CRAFT
optimiser's node order) silently re-introduces non-determinism. This check catches that the
moment it returns.

USAGE
    python3 scripts/blender-universal/determinism_check.py <state.json> [blender_bin]
        exit 0  → identical across both runs (deterministic)
        exit 1  → positions or edges differ (a non-deterministic regression — FIX before ship)
        exit 2  → could not run (missing state / blender)

Default blender_bin: $BLENDER_BIN, else /opt/homebrew/bin/blender, else `blender` on PATH.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_SCENE = os.path.join(_HERE, "build_universal_scene.py")


def _blender_bin() -> str:
    cand = os.environ.get("BLENDER_BIN") or "/opt/homebrew/bin/blender"
    if os.path.exists(cand):
        return cand
    found = shutil.which("blender")
    return found or cand


def _render(state_path: str, out_dir: str, blender: str) -> bool:
    os.makedirs(out_dir, exist_ok=True)
    env = dict(os.environ, BLENDER_OUT_DIR=out_dir)
    r = subprocess.run(
        [blender, "--background", "--factory-startup", "--python", _SCENE, "--", state_path],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return os.path.exists(os.path.join(out_dir, "parts-manifest.json"))


def _pos_set(out_dir: str):
    p = os.path.join(out_dir, "parts-manifest.json")
    parts = (json.load(open(p)).get("parts") or []) if os.path.exists(p) else []
    return sorted(tuple(round(v, 1) for v in (q.get("pos_mm") or [])) for q in parts)


def _edge_set(out_dir: str):
    p = os.path.join(out_dir, "connection-ledger.json")
    rows = (json.load(open(p)).get("rows") or []) if os.path.exists(p) else []
    return sorted((str(r.get("from_part")), str(r.get("to_part")), str(r.get("mechanism"))) for r in rows)


def main(argv) -> int:
    if not argv:
        print(__doc__)
        return 2
    state_path = argv[0]
    if not os.path.exists(state_path):
        print(f"[determinism] ERROR: no state.json at {state_path}")
        return 2
    blender = argv[1] if len(argv) > 1 else _blender_bin()
    if not (os.path.exists(blender) or shutil.which(blender)):
        print(f"[determinism] ERROR: blender not found ({blender}) — set BLENDER_BIN")
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        a, b = os.path.join(tmp, "a"), os.path.join(tmp, "b")
        if not _render(state_path, a, blender) or not _render(state_path, b, blender):
            print("[determinism] ERROR: a render produced no parts-manifest.json")
            return 2
        pa, pb = _pos_set(a), _pos_set(b)
        ea, eb = _edge_set(a), _edge_set(b)

    pos_ok, edge_ok = (pa == pb), (ea == eb)
    if pos_ok and edge_ok:
        print(f"[determinism] OK — {len(pa)} parts + {len(ea)} edges BIT-IDENTICAL across two renders")
        return 0
    if not edge_ok:
        only_a = set(ea) - set(eb)
        print(f"[determinism] FAIL: connection edges differ ({len(set(ea) ^ set(eb))} symmetric-diff) "
              f"— a ledger endpoint-closer tie-break is non-deterministic. e.g. {list(only_a)[:3]}")
    if not pos_ok:
        print(f"[determinism] FAIL: part positions differ ({len(set(pa) ^ set(pb))} symmetric-diff) "
              f"— the placement / layout-optimiser is non-deterministic.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
