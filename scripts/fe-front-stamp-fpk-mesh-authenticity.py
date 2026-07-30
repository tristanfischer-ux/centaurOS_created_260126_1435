#!/usr/bin/env python3
"""P6 — stamp mesh authenticity + ontology FFF coverage from form-meshes.json."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from fpk_blender_coverage import stamp_coverage  # noqa: E402
from fpk_mesh_authenticity import stamp_mesh_authenticity  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--twin",
        type=Path,
        default=ROOT / "out" / "formula-e-front-mgu-20260729-1432",
    )
    args = ap.parse_args()
    if not (args.twin / "state.json").is_file():
        print(f"missing {args.twin / 'state.json'}", file=sys.stderr)
        return 1
    out = stamp_mesh_authenticity(args.twin)
    state = json.loads((args.twin / "state.json").read_text(encoding="utf-8"))
    cov = stamp_coverage(args.twin, state)
    (args.twin / "state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(json.dumps({"authenticity": out, "ontology_coverage": {
        "score": cov.get("score"),
        "ok": cov.get("ok"),
        "missing_count": cov.get("missing_count"),
        "missing_ids": [m["part_id"] for m in cov.get("missing") or []],
    }}, indent=2))
    # Authenticity ok required; ontology coverage warns (exit 2) until re-render.
    if not out.get("ok"):
        return 1
    return 0 if cov.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
