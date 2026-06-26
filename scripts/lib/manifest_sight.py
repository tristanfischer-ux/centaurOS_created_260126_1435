#!/usr/bin/env python3
"""
SIGHT primitive — default-size 'litter' detection in a parts-manifest.

Tristan 2026-06-26 ("how does the engine SEE what it's doing?"): the chain audits state.json (what it
INTENDED) but a human sees the RENDERED geometry (what it DELIVERED). This reads the DELIVERED geometry
(parts-manifest dims_mm) and MEASURES the defect a human catches by eye — renders "littered with lots of
tiny identical boxes / valves" — without a vision model. Deterministic, UNIVERSAL (no archetype logic).

The fingerprint: the Blender geometry generator assigns a small set of DEFAULT box sizes to parts whose
real dimensions it doesn't know, so many DISTINCT-named parts end up the EXACT same size. A cluster of
≥MIN_CLUSTER distinct names sharing one exact dims signature is default-size litter (5 valves of the
same size is plausible; a VFD + a leak sensor + a circuit breaker at identical mm is not — 5+ distinct
names at one exact size is the robust, false-positive-resistant signal).

Score: 10 at 0 % litter, → 0 as the littered fraction reaches LITTER_FLOOR. A render/GA tab cannot be a
genuine ≥8 while most of its objects are default boxes — this is the engine taking the 5-second glance
itself. The SOURCE fix is the generator deriving real per-part dims; this primitive is the SIGHT that
flags + scores it honestly until then.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from typing import Any

MIN_CLUSTER = 5        # ≥5 DISTINCT names at one exact dims signature ⇒ a default-size cluster
LITTER_FLOOR = 0.40    # littered fraction at which the score hits 0


def _parts(manifest: Any) -> list:
    if isinstance(manifest, dict):
        return manifest.get("parts") or manifest.get("objects") or manifest.get("items") or []
    return manifest if isinstance(manifest, list) else []


def default_size_litter(manifest: Any) -> dict:
    """Detect default-size litter. Returns {parts, clusters, litter_parts, litter_ratio, score, status,
    worst}. A cluster is one exact dims_mm signature shared by ≥MIN_CLUSTER DISTINCT part names."""
    parts = _parts(manifest)
    sig: dict = defaultdict(set)          # dims signature -> set of distinct names
    n = 0
    for p in parts:
        if not isinstance(p, dict):
            continue
        dm = p.get("dims_mm") or p.get("dims") or {}
        if not isinstance(dm, dict) or not dm:
            continue
        key = tuple(sorted((str(k), round(float(v))) for k, v in dm.items()
                           if isinstance(v, (int, float))))
        if not key:
            continue
        n += 1
        sig[key].add(str(p.get("name") or p.get("tag") or p.get("id") or ""))

    clusters = [{"dims": dict(k), "n_distinct": len(v), "names": sorted(v)}
                for k, v in sig.items() if len(v) >= MIN_CLUSTER]
    clusters.sort(key=lambda c: -c["n_distinct"])
    litter_names: set = set()
    for c in clusters:
        litter_names.update(c["names"])
    ratio = (len(litter_names) / n) if n else 0.0
    score = max(0, min(10, round(10 * (1 - ratio / LITTER_FLOOR)))) if n else None
    worst = clusters[0] if clusters else None
    return {
        "parts": n,
        "clusters": clusters,
        "litter_parts": len(litter_names),
        "litter_ratio": round(ratio, 3),
        "score": score,
        "status": ("PASS" if (score is not None and score >= 8) else "FAIL") if n else "UNSCORED",
        "worst": ({"n_distinct": worst["n_distinct"], "dims": worst["dims"],
                   "examples": worst["names"][:6]} if worst else None),
    }


def litter_from_path(manifest_path: str) -> dict:
    try:
        with open(manifest_path, "r", encoding="utf-8") as fh:
            return default_size_litter(json.load(fh))
    except Exception as exc:  # noqa: BLE001
        return {"parts": 0, "clusters": [], "litter_parts": 0, "litter_ratio": 0.0,
                "score": None, "status": "UNSCORED", "worst": None, "error": str(exc)}


def _selftest() -> int:
    bad = 0
    # proveCatch: 10 DISTINCT parts the generator gave the SAME default box → litter, FAIL.
    littered = {"parts": [{"name": f"thing_{i}", "dims_mm": {"w": 130, "d": 100, "h": 120}}
                          for i in range(10)]}
    r = default_size_litter(littered)
    if r["status"] != "FAIL" or r["litter_ratio"] < 0.9 or r["score"] != 0:
        print(f"  FAIL proveCatch: 10 identical-box parts must be FAIL/score 0 (got {r['status']}/{r['score']})")
        bad += 1
    # counter-case: distinct, physically-derived dims → not litter, PASS (no false-positive).
    clean = {"parts": [{"name": f"vessel_{i}", "dims_mm": {"w": 1000 + 250 * i, "d": 500 + 90 * i,
                                                           "h": 1800 + 50 * i}} for i in range(10)]}
    r = default_size_litter(clean)
    if r["status"] != "PASS" or r["litter_ratio"] > 0.05:
        print(f"  FAIL counter-case: distinct-dims parts must PASS (got {r['status']}, ratio {r['litter_ratio']})")
        bad += 1
    # a legitimate small repeat (4 same-size valves) must NOT trip the ≥5 threshold.
    legit = {"parts": ([{"name": f"valve_{i}", "dims_mm": {"w": 372, "d": 372, "h": 600}} for i in range(4)]
                       + [{"name": f"pump_{i}", "dims_mm": {"w": 600 + 100 * i, "d": 510, "h": 660}}
                          for i in range(6)])}
    r = default_size_litter(legit)
    if r["litter_parts"] != 0:
        print(f"  FAIL legit-repeat: 4 same-size valves must not be flagged (got {r['litter_parts']})")
        bad += 1
    print("manifest_sight selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(_selftest())
    if len(sys.argv) > 1:
        res = litter_from_path(sys.argv[1])
        print(json.dumps(res, indent=2)[:1500])
