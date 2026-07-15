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
import os
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


def _delivered_manifest_paths(run_dir: str) -> list[str]:
    """Every parts-manifest.json a delivered drawing might read.

    EXCLUDE internal isolated-pass sub-dirs (a '_'-prefixed dir by convention, e.g. the early
    settle loop's outDir/_loop/parts-manifest.json). That manifest is written at an EARLIER,
    pre-final-layout state and NO delivered drawing reads it — GA, the render AND parts_ledger
    all consume the ROOT canonical parts-manifest (generate_drawing_set snapshots/restores it).
    Comparing the delivered manifest against this throwaway is a FALSE divergence.
    """
    import glob
    paths = sorted(glob.glob(os.path.join(run_dir, "**", "parts-manifest.json"), recursive=True))
    return [p for p in paths
            if not any(seg.startswith("_") for seg in os.path.relpath(p, run_dir).split(os.sep)[:-1])]


def publish_canonical_manifests(run_dir: str) -> dict:
    """SOURCE FIX for LAYOUT DIVERGENCE (Tristan 2026-07-14 / CORE FIX PRINCIPLE).

    INTENT: shaded-hero / early Blender passes write a SECOND parts-manifest under
    e.g. blender/renders/ with a pre-settle placement. Excel floors Renders + Assembly
    at 0 when those disagree with the root canon. ONE placement must be the only story —
    after the root canon is settled (or restored), overwrite every non-'_' mirror copy
    with the root bytes so GA / render / ledger cannot disagree by path.

    Returns {ok, published, skipped, detail}. Idempotent.
    """
    import shutil
    root = os.path.join(run_dir, "parts-manifest.json")
    if not os.path.isfile(root):
        return {"ok": False, "published": [], "skipped": [],
                "detail": "no root parts-manifest.json"}
    published: list[str] = []
    skipped: list[str] = []
    # Placement-coupled siblings — keep mirrors coherent with the same restore rule.
    siblings = ("parts-manifest.json", "route-manifest.json",
                "connection-schedule.json", "edge-manifest.json")
    for path in _delivered_manifest_paths(run_dir):
        if os.path.abspath(path) == os.path.abspath(root):
            continue
        mirror_dir = os.path.dirname(path)
        for name in siblings:
            src = os.path.join(run_dir, name)
            dst = os.path.join(mirror_dir, name)
            if not os.path.isfile(src):
                skipped.append(dst)
                continue
            try:
                shutil.copy2(src, dst)
                published.append(dst)
            except OSError as exc:
                skipped.append(f"{dst}:{exc}")
    return {
        "ok": True,
        "published": published,
        "skipped": skipped,
        "detail": (f"published {len(published)} mirror file(s) from root canon"
                   if published else "no non-root delivered manifests to sync"),
    }


def manifest_divergence(run_dir: str) -> dict:
    """SIGHT: if a run holds ≥2 parts-manifest.json that DISAGREE on where the parts ARE, the drawings
    can disagree — GA reads one manifest, the render the other → "GA-top ≠ render-top" (Tristan's GA2).
    Deterministic, UNIVERSAL: compares part CENTRES (pos_mm) across every manifest in the run; >10% of
    common parts at different positions = divergence. The fix is ONE canonical placement → ONE manifest
    that GA + render + parts_ledger all consume (no re-place after the render) — see
    publish_canonical_manifests()."""
    paths = _delivered_manifest_paths(run_dir)
    if len(paths) < 2:
        return {"manifests": len(paths), "diverged": False, "score": 10, "status": "PASS", "detail": ""}
    layouts = []
    for p in paths:
        try:
            with open(p, "r", encoding="utf-8") as fh:
                d = json.load(fh)
            lay = {}
            for x in _parts(d):
                if isinstance(x, dict):
                    key = str(x.get("tag") or x.get("name") or "")
                    pos = x.get("pos_mm") or [0, 0, 0]
                    lay[key] = tuple(round(float(c)) for c in pos[:3])
            layouts.append((p, lay))
        except Exception:  # noqa: BLE001
            continue
    if len(layouts) < 2:
        return {"manifests": len(paths), "diverged": False, "score": 10, "status": "PASS", "detail": ""}
    base_p, base = layouts[0]
    worst = None
    for p, lay in layouts[1:]:
        common = set(base) & set(lay)
        if not common:
            continue
        moved = sum(1 for k in common if base[k] != lay[k])
        frac = moved / len(common)
        if frac > 0.10 and (worst is None or frac > worst[0]):
            worst = (frac, moved, len(common), p)
    if worst:
        _d = lambda pp: (os.path.basename(os.path.dirname(pp)) or "root")  # noqa: E731
        return {"manifests": len(paths), "diverged": True, "score": 0, "status": "FAIL",
                "detail": (f"{worst[1]}/{worst[2]} parts at DIFFERENT positions between "
                           f"{_d(base_p)}/parts-manifest and {_d(worst[3])}/parts-manifest — GA and the "
                           f"render can show different layouts depending which they read"),
                "fix": "ONE canonical placement → ONE parts-manifest that GA + render + parts_ledger all consume "
                       "(publish_canonical_manifests after settle/restore)"}
    return {"manifests": len(paths), "diverged": False, "score": 10, "status": "PASS", "detail": ""}


# A part whose TYPE is electrical-connection / power / control but whose 3-D SHAPE is a process VESSEL
# body is a wrong-shape mis-render — the council's typed-shape defect (2026-06-27). The exemplar: a
# "3 Phase Power Input" rendered as a `horizontal_vessel` (a 2.7 m cylinder = a stray red beam shooting
# off the platform). Deterministic + universal: no archetype logic, just type-noun vs shape-class.
import re as _re
_ELEC_TYPE_RX = _re.compile(
    r"power\s+(?:input|supply|feed|inlet|connection|distribution|point)|"
    r"(?:incoming|incomer|main)\s+(?:supply|feed|power)|\bincomer\b|\d\s*[- ]?phase\s+power|"
    r"three[- ]?phase\s+power|electrical\s+(?:supply|input|feed|connection|intake)|"
    r"\bbusbar\b|bus[- ]?bar|distribution\s+board|consumer\s+unit|\bisolator\b", _re.I)
_VESSEL_BODY_SHAPES = {
    "horizontal_vessel", "vertical_vessel", "tank", "column", "tall_column", "cone_vessel",
    "drum", "sphere", "skid_box", "stack",
}


def shape_type_mismatches(manifest) -> dict:
    """Flag every part whose NAME is an electrical-connection/power part but whose SHAPE is a process
    VESSEL body — a wrong-shape mis-render (the stray-beam class). Returns {count, parts, status}.
    status FAIL when count>0 (the render cannot be a clean pass with a power feed drawn as a vessel)."""
    out = []
    for p in _parts(manifest):
        if not isinstance(p, dict):
            continue
        nm = str(p.get("name") or "")
        shp = str(p.get("shape") or "")
        if _ELEC_TYPE_RX.search(nm) and shp in _VESSEL_BODY_SHAPES:
            out.append({"name": nm, "shape": shp, "fix": "an electrical/power-connection part must be a cabinet/box, not a process vessel"})
    return {"count": len(out), "parts": out, "status": "FAIL" if out else "PASS"}


_MICRO_COMPONENT_NAME_RX = _re.compile(
    r"\b(?:ferrite|emc[_ -]?bead|bead\b|polyfuse|poly[_ -]?fuse|tvs\b|"
    r"esd[_ -]?protect|varistor|\bmov\b|input[_ -]?fuse|dc[_ -]?input[_ -]?fuse|"
    r"thermal[_ -]?cutoff)\b", _re.I,
)


def absurd_micro_component_dims(manifest: Any, max_axis_mm: float = 80.0) -> dict:
    """SIGHT: a discrete electronic (ferrite bead, fuse, …) whose dims rival the
    product envelope is a BAD DIM echo — not a principal. Colorimeter shipped
    Ferrite Emc Bead at 260×200×434 mm (= site bbox) into the GA top-10 while
    Assembly still scored 10 on coverage alone (Tristan 2026-07-14).

    Returns {count, parts, status}. FAIL when count>0.
    """
    bad = []
    for p in _parts(manifest):
        if not isinstance(p, dict):
            continue
        nm = str(p.get("name") or p.get("tag") or "")
        if not _MICRO_COMPONENT_NAME_RX.search(nm):
            continue
        dm = p.get("dims_mm") or p.get("dims") or {}
        if isinstance(dm, dict) and dm:
            axes = [float(dm[k]) for k in ("w", "d", "h", "dia", "len")
                    if isinstance(dm.get(k), (int, float))]
        else:
            pos = p.get("pos_mm") or []
            axes = []
        if axes and max(axes) > max_axis_mm:
            bad.append({"name": nm, "dims_mm": dm, "max_axis_mm": max(axes)})
    return {"count": len(bad), "parts": bad,
            "status": "FAIL" if bad else "PASS"}


def litter_from_path(manifest_path: str) -> dict:
    try:
        with open(manifest_path, "r", encoding="utf-8") as fh:
            return default_size_litter(json.load(fh))
    except Exception as exc:  # noqa: BLE001
        return {"parts": 0, "clusters": [], "litter_parts": 0, "litter_ratio": 0.0,
                "score": None, "status": "UNSCORED", "worst": None, "error": str(exc)}


def _selftest() -> int:
    bad = 0
    # proveCatch the WRONG-SHAPE defect (Tristan 2026-06-27): a "3 Phase Power Input" rendered as a
    # horizontal_vessel (the stray red beam) MUST be flagged; a real vessel / a correctly-shaped
    # cabinet must NOT be (no false positive).
    _stm = shape_type_mismatches({"parts": [
        {"name": "3 Phase Power Input", "shape": "horizontal_vessel"},   # the defect → must flag
        {"name": "Main Power Supply", "shape": "cabinet"},               # correct electrical shape → clean
        {"name": "3-Phase Separator", "shape": "horizontal_vessel"},     # a real process vessel → clean
        {"name": "Reverse Osmosis Skid", "shape": "skid_box"},           # real → clean
    ]})
    if _stm["count"] != 1 or _stm["status"] != "FAIL" or _stm["parts"][0]["name"] != "3 Phase Power Input":
        print(f"  FAIL shape-type: a power input drawn as a horizontal_vessel must be the ONLY flag (got {_stm})"); bad += 1
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
    # proveCatch: two DELIVERED manifests in a run that disagree on positions → diverged/FAIL (GA2).
    # Use a NON-'_' sub-dir ('views') — a delivered placement a drawing would actually read.
    import tempfile as _tf
    with _tf.TemporaryDirectory() as _td:
        os.makedirs(os.path.join(_td, "views"), exist_ok=True)
        _a = {"parts": [{"tag": f"t{i}", "pos_mm": [i * 100, 0, 0], "dims_mm": {"w": 50, "d": 50, "h": 50}} for i in range(10)]}
        _b = {"parts": [{"tag": f"t{i}", "pos_mm": [i * 100 + 9000, 5000, 0], "dims_mm": {"w": 50, "d": 50, "h": 50}} for i in range(10)]}
        with open(os.path.join(_td, "parts-manifest.json"), "w") as fh:
            json.dump(_a, fh)
        with open(os.path.join(_td, "views", "parts-manifest.json"), "w") as fh:
            json.dump(_b, fh)
        r = manifest_divergence(_td)
        if not r["diverged"] or r["status"] != "FAIL":
            print(f"  FAIL divergence proveCatch: two disagreeing DELIVERED manifests must be FAIL (got {r})"); bad += 1
        # counter-case: identical second manifest → no divergence, PASS.
        with open(os.path.join(_td, "views", "parts-manifest.json"), "w") as fh:
            json.dump(_a, fh)
        r = manifest_divergence(_td)
        if r["diverged"]:
            print(f"  FAIL divergence counter-case: identical manifests must PASS (got {r})"); bad += 1
    # counter-case (the 2026-06-27 false-positive fix): a DIVERGING manifest in an INTERNAL '_loop'
    # isolated-pass sub-dir must be IGNORED (no delivered drawing reads it) → PASS, not FAIL.
    with _tf.TemporaryDirectory() as _td:
        os.makedirs(os.path.join(_td, "_loop"), exist_ok=True)
        _a = {"parts": [{"tag": f"t{i}", "pos_mm": [i * 100, 0, 0], "dims_mm": {"w": 50, "d": 50, "h": 50}} for i in range(10)]}
        _b = {"parts": [{"tag": f"t{i}", "pos_mm": [i * 100 + 9000, 5000, 0], "dims_mm": {"w": 50, "d": 50, "h": 50}} for i in range(10)]}
        with open(os.path.join(_td, "parts-manifest.json"), "w") as fh:
            json.dump(_a, fh)
        with open(os.path.join(_td, "_loop", "parts-manifest.json"), "w") as fh:
            json.dump(_b, fh)
        r = manifest_divergence(_td)
        if r["diverged"]:
            print(f"  FAIL _loop-exclusion: an internal _loop manifest must NOT count as divergence (got {r})"); bad += 1
    # proveCatch (2026-07-14): ferrite bead stamped at product-bbox size MUST FAIL.
    _ab = absurd_micro_component_dims({"parts": [
        {"name": "Ferrite Emc Bead", "dims_mm": {"w": 260, "d": 200, "h": 434}},
        {"name": "Cuvette Holder", "dims_mm": {"w": 32, "d": 28, "h": 42}},
        {"name": "Input Fuse", "dims_mm": {"w": 12, "d": 5, "h": 4}},
    ]})
    if _ab["count"] != 1 or _ab["status"] != "FAIL" or "Ferrite" not in _ab["parts"][0]["name"]:
        print(f"  FAIL absurd-micro proveCatch: bbox-sized ferrite must be the ONLY flag (got {_ab})"); bad += 1

    # proveCatch (2026-07-14): a stale blender/renders mirror that disagrees MUST FAIL, and
    # publish_canonical_manifests MUST overwrite it so divergence clears (colorimeter floor killer).
    with _tf.TemporaryDirectory() as _td:
        os.makedirs(os.path.join(_td, "blender", "renders"), exist_ok=True)
        _a = {"parts": [{"tag": f"t{i}", "name": f"p{i}", "pos_mm": [i * 100.0, 10.0, 20.0]}
                        for i in range(10)], "placement_fp": "canon"}
        _b = {"parts": [{"tag": f"t{i}", "name": f"p{i}", "pos_mm": [0.0, 0.0, 97.0]}
                        for i in range(10)]}
        with open(os.path.join(_td, "parts-manifest.json"), "w") as fh:
            json.dump(_a, fh)
        with open(os.path.join(_td, "blender", "renders", "parts-manifest.json"), "w") as fh:
            json.dump(_b, fh)
        r = manifest_divergence(_td)
        if not r["diverged"] or r["status"] != "FAIL":
            print(f"  FAIL renders-mirror proveCatch: disagreeing blender/renders must FAIL (got {r})"); bad += 1
        pub = publish_canonical_manifests(_td)
        if not pub.get("ok") or not pub.get("published"):
            print(f"  FAIL publish_canonical: must overwrite mirror (got {pub})"); bad += 1
        r2 = manifest_divergence(_td)
        if r2["diverged"]:
            print(f"  FAIL publish clears divergence: after publish must PASS (got {r2})"); bad += 1
        with open(os.path.join(_td, "blender", "renders", "parts-manifest.json")) as fh:
            mirrored = json.load(fh)
        if mirrored.get("placement_fp") != "canon":
            print(f"  FAIL publish bytes: mirror must carry root placement_fp (got {mirrored.get('placement_fp')})"); bad += 1
    print("manifest_sight selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(_selftest())
    if len(sys.argv) > 1:
        res = litter_from_path(sys.argv[1])
        print(json.dumps(res, indent=2)[:1500])
