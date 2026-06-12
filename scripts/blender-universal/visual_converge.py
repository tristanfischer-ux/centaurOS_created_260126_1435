#!/usr/bin/env python3
"""visual_converge.py — ITERATIVE Blender visual-improve loop (task #89).

Tristan: "the Blender model needs to be able to go through multiple iterations."
Before this, the CAD render was SINGLE-PASS scored only by a thin blank-image gate.
This loop closes render -> critique -> improve into a measured convergence:

    render (build_universal_scene.py, INSPECT_FRAME_SCALE env)
      -> deterministic score (render_quality_score.py: object-fraction, clipping,
         centring) -> if a FRAMING defect (TOO_SMALL / CLIPPED / TOO_LARGE) apply
         the named operator (reframe closer/wider via INSPECT_FRAME_SCALE)
      -> re-render -> score, up to MAX_ROUNDS, until the score passes the threshold
         or no framing-fixable defect remains.

Emits visual-convergence-report.json {rounds, converged, trajectory, final} so the
dossier can state the VISUAL side's rounds-to-converge alongside the engineering
convergence (convergence-report.json). The render is sub-minute, so iterating is cheap.

Usage:  python3 visual_converge.py <state.json> <out_dir> [--max N] [--threshold S]
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
from pathlib import Path

_THIS = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS))
import render_quality_score as rqs  # noqa: E402  sibling

BLENDER = os.environ.get("BLENDER_BIN") or "/opt/homebrew/bin/blender"
THRESHOLD = 0.85
MAX_ROUNDS = 3


def _render(state_path: Path, out_dir: Path, frame_scale: float) -> bool:
    """One Blender INSPECT render at the given framing scale. Returns success."""
    env = dict(os.environ, BLENDER_OUT_DIR=str(out_dir), STATE_JSON=str(state_path),
               INSPECT="1", INSPECT_FRAME_SCALE=f"{frame_scale:.3f}")
    try:
        subprocess.run([BLENDER, "--background", "--python",
                        str(_THIS / "build_universal_scene.py"), "--", str(state_path)],
                       env=env, check=True, capture_output=True, timeout=420)
        return True
    except Exception:
        return False


def _adjust(frame_scale: float, findings: list) -> tuple[float, str | None]:
    """Map the score's findings to a framing operator. CLIPPED/TOO_LARGE need MORE
    breathing room; TOO_SMALL needs the camera pulled IN. OFF_CENTRE/SPARSE are not
    framing-fixable here (they need a geometry/_HERO_HINT change) → stop."""
    codes = {f["code"] for f in findings}
    if "CLIPPED" in codes or "TOO_LARGE" in codes:
        return min(2.0, frame_scale * 1.18), "reframe_wider"
    if "TOO_SMALL" in codes:
        return max(0.6, frame_scale * 0.85), "reframe_closer"
    return frame_scale, None


def run(state_path, out_dir, max_rounds: int = MAX_ROUNDS, threshold: float = THRESHOLD) -> dict:
    state_path = Path(state_path).resolve()
    out_dir = Path(out_dir).resolve()
    iso = out_dir / "inspect-iso.png"
    frame_scale = 1.0
    trajectory: list[dict] = []
    converged = False
    for rnd in range(1, max_rounds + 1):
        ok = _render(state_path, out_dir, frame_scale)
        if not ok or not iso.exists():
            trajectory.append({"round": rnd, "frame_scale": round(frame_scale, 3), "render_ok": False})
            break
        sc = rqs.score_image(iso)
        trajectory.append({
            "round": rnd, "frame_scale": round(frame_scale, 3), "score": sc["score"],
            "object_fraction": sc["object_fraction"], "clip_fraction": sc["clip_fraction"],
            "centre_offset": sc["centre_offset"], "findings": [f["code"] for f in sc["findings"]],
        })
        if sc["score"] >= threshold:
            converged = True
            break
        new_scale, op = _adjust(frame_scale, sc["findings"])
        if op is None or abs(new_scale - frame_scale) < 1e-3:
            break  # nothing framing-fixable remains
        frame_scale = new_scale
    report = {
        "schema": "visual-convergence-report/v1",
        "loop": "render -> score -> reframe -> re-render",
        "converged": converged,
        "rounds": len(trajectory),
        "final_score": trajectory[-1].get("score") if trajectory else None,
        "final_frame_scale": round(frame_scale, 3),
        "threshold": threshold,
        "trajectory": trajectory,
    }
    (out_dir / "visual-convergence-report.json").write_text(json.dumps(report, indent=1))
    return report


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 0
    sp, od = argv[0], argv[1]
    mx = MAX_ROUNDS
    th = THRESHOLD
    if "--max" in argv:
        mx = int(argv[argv.index("--max") + 1])
    if "--threshold" in argv:
        th = float(argv[argv.index("--threshold") + 1])
    rep = run(sp, od, mx, th)
    print(f"[visual-converge] {rep['rounds']} round(s), converged={rep['converged']}, "
          f"final score {rep['final_score']}, frame_scale {rep['final_frame_scale']}")
    for t in rep["trajectory"]:
        print(f"  round {t['round']}: scale {t['frame_scale']} score {t.get('score')} "
              f"frac {t.get('object_fraction')} {t.get('findings')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
