#!/usr/bin/env python3
"""render_quality_score.py — DETERMINISTIC visual-quality score for a CAD render.

The render-quality GATE (render-quality-audit.ts) only checks "is the image blank"
(thin-image bytes). To drive an ITERATIVE visual-improve loop (task #89, Tristan:
"the Blender model needs to be able to go through multiple iterations") we need a
real, deterministic score that says WHAT is wrong with a render so the loop can fix
it and measure convergence — not a vibe.

Measures, from the rendered PNG (no LLM, no Blender):
  • object_fraction  — object bounding box area / image area. Too small = lost in
                       whitespace; too large = cramped / likely clipping.
  • clip_fraction    — object pixels touching the outer border. >0 = the model is
                       cut off at the frame edge.
  • centre_offset    — object bbox centre vs image centre (fraction of the diagonal).
  • fill_fraction    — object pixels / bbox area (solidity; very low = thin/sparse).
  • edge_density     — high-gradient pixels / bbox area — a CRUDE legibility proxy
                       (a tangled thin-pipe mess is mostly edges).

SCOPE — BE HONEST: this score covers FRAMING (size/clipping/centring) + a gross
CLUTTER proxy. It does NOT judge semantic correctness — whether the pipework is
coherent, whether a cage/scaffold is spuriously rendered, whether the geometry is
right. A render full of the "odd pipework" defect can still score 1.0. Semantic
visual quality needs the multimodal judge or a human; the visual loop's only
deterministic operator is REFRAME, so it fixes framing, NOT geometry.

Score in [0,1]; findings name the defect + the suggested operator (reframe / shrink
/ recentre / none) — 'none' = not fixable by reframing (a geometry issue).

Usage:  python3 render_quality_score.py <image.png> [--json]
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Targets (tuned for the INSPECT light render on a near-white background).
TARGET_FRAC_LO = 0.28      # below → object too small in frame (reframe closer)
TARGET_FRAC_HI = 0.82      # above → cramped / risks clipping (reframe wider)
CLIP_MAX = 0.004           # >0.4% of object pixels on the border → clipped
CENTRE_MAX = 0.12          # bbox centre within 12% of the diagonal of image centre
FILL_MIN = 0.10            # bbox <10% filled → thin/degenerate
BORDER_FRAC = 0.015        # outer 1.5% ring counts as "the frame edge"


def score_image(path: str | Path) -> dict:
    p = Path(path)
    img = Image.open(p).convert("RGB")
    a = np.asarray(img, dtype=np.float32)
    h, w, _ = a.shape
    # Background = median of the four corner patches (the inspect bg is ~uniform).
    cs = max(4, min(h, w) // 40)
    corners = np.concatenate([
        a[:cs, :cs].reshape(-1, 3), a[:cs, -cs:].reshape(-1, 3),
        a[-cs:, :cs].reshape(-1, 3), a[-cs:, -cs:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    # Object = pixels far enough from the background colour.
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    obj = dist > 28.0                          # ~11% of full-scale colour distance
    n_obj = int(obj.sum())
    findings: list[dict] = []
    if n_obj < (h * w) * 0.005:
        return {
            "schema": "render-quality-score/v1", "image": str(p),
            "score": 0.0, "object_fraction": 0.0, "clip_fraction": 0.0,
            "centre_offset": 0.0, "fill_fraction": 0.0,
            "findings": [{"code": "BLANK", "operator": "rebuild",
                          "message": "render is effectively blank (no object pixels)"}],
        }
    ys, xs = np.where(obj)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    bbox_area = (y1 - y0 + 1) * (x1 - x0 + 1)
    object_fraction = bbox_area / float(h * w)
    fill_fraction = n_obj / float(bbox_area)
    # clipping: object pixels inside the outer ring
    bh, bw = max(1, int(h * BORDER_FRAC)), max(1, int(w * BORDER_FRAC))
    border = np.zeros_like(obj)
    border[:bh, :] = border[-bh:, :] = border[:, :bw] = border[:, -bw:] = True
    clip_fraction = int((obj & border).sum()) / float(n_obj)
    # centring
    cy, cx = (y0 + y1) / 2.0, (x0 + x1) / 2.0
    diag = float(np.hypot(h, w))
    centre_offset = float(np.hypot(cy - h / 2.0, cx - w / 2.0)) / diag
    # CLUTTER / legibility proxy (honesty fix 2026-06-12): the framing metrics above say
    # NOTHING about whether the geometry READS — the "odd pipework / tangled / unclear at
    # the edges" complaint. Edge density inside the object bbox is a CRUDE but real proxy:
    # a clean set of separated volumes is mostly flat shading; a thin-pipe tangle is mostly
    # edges. It CANNOT tell "wrong pipework" from "lots of legitimate equipment" — semantic
    # quality needs the multimodal judge or a human. Reported + SOFT-flagged only.
    region = a[y0:y1 + 1, x0:x1 + 1]
    gray = region.mean(axis=2)
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    edge_density = float(((gx + gy) > 24.0).sum()) / max(1, gray.size)

    score = 1.0
    if object_fraction < TARGET_FRAC_LO:
        score -= min(0.5, (TARGET_FRAC_LO - object_fraction) * 1.5)
        findings.append({"code": "TOO_SMALL", "operator": "reframe_closer",
                         "message": f"object fills only {object_fraction*100:.0f}% of frame (target >= {TARGET_FRAC_LO*100:.0f}%)"})
    if object_fraction > TARGET_FRAC_HI:
        score -= min(0.4, (object_fraction - TARGET_FRAC_HI) * 2.0)
        findings.append({"code": "TOO_LARGE", "operator": "reframe_wider",
                         "message": f"object fills {object_fraction*100:.0f}% of frame (target <= {TARGET_FRAC_HI*100:.0f}%) — cramped"})
    if clip_fraction > CLIP_MAX:
        score -= min(0.5, clip_fraction * 12.0)
        findings.append({"code": "CLIPPED", "operator": "reframe_wider",
                         "message": f"{clip_fraction*100:.1f}% of object pixels touch the frame edge (cut off)"})
    if centre_offset > CENTRE_MAX:
        score -= min(0.25, (centre_offset - CENTRE_MAX) * 2.0)
        findings.append({"code": "OFF_CENTRE", "operator": "recentre",
                         "message": f"object centre is {centre_offset*100:.0f}% of the diagonal off image centre"})
    if fill_fraction < FILL_MIN:
        score -= 0.2
        findings.append({"code": "SPARSE", "operator": "none",
                         "message": f"bbox only {fill_fraction*100:.0f}% filled — thin/sparse geometry"})
    if edge_density > 0.34:
        score -= min(0.15, (edge_density - 0.34) * 1.2)
        findings.append({"code": "CLUTTERED", "operator": "none",
                         "message": f"edge density {edge_density*100:.0f}% — render reads busy/tangled (legibility PROXY, not a semantic pipework check)"})

    return {
        "schema": "render-quality-score/v1", "image": str(p),
        "score": round(max(0.0, score), 3),
        "object_fraction": round(object_fraction, 3),
        "clip_fraction": round(clip_fraction, 4),
        "centre_offset": round(centre_offset, 3),
        "fill_fraction": round(fill_fraction, 3),
        "edge_density": round(edge_density, 3),
        "findings": findings,
    }


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--json"]
    if not args:
        print(__doc__); raise SystemExit(0)
    res = score_image(args[0])
    if "--json" in sys.argv:
        print(json.dumps(res, indent=1))
    else:
        print(f"score {res['score']:.3f}  frac {res['object_fraction']:.2f}  "
              f"clip {res['clip_fraction']:.3f}  off {res['centre_offset']:.2f}  "
              f"fill {res['fill_fraction']:.2f}")
        for f in res["findings"]:
            print(f"  [{f['code']}] {f['message']}  -> {f['operator']}")
