#!/usr/bin/env python3
"""form_converge_loop.py — Blender-only form→gold convergence (NO full chain).

INTENT: hundreds of cheap design loops. Frozen state.json + form grammar +
Blender placement → deterministic mesh checklist (and optional framing).
Edit SOURCE rules when a checklist stem is missing; tweak camera/frame when
geometry exists but the shot is wrong. Never paste gold MPNs.

Usage:
  python3 scripts/blender-universal/form_converge_loop.py \\
    out/poseidon-20260715-2126/state.json \\
    out/poseidon-form-loop \\
    --channels 4 --max 8 --samples 24

FLOW:
  render (build_universal_scene) → score mesh checklist from parts-manifest /
  object dump → if missing stems, STOP (SOURCE fix required) → else reframe
  via INSPECT_FRAME_SCALE like visual_converge → until checklist+framing pass.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

_THIS = Path(__file__).resolve().parent
_ROOT = _THIS.parents[1]
sys.path.insert(0, str(_THIS))
sys.path.insert(0, str(_ROOT / "scripts" / "lib"))

import instrument_form_grammar as ifg  # noqa: E402
import render_quality_score as rqs  # noqa: E402

BLENDER = os.environ.get("BLENDER_BIN") or "/Applications/Blender.app/Contents/MacOS/Blender"
if not Path(BLENDER).exists():
    BLENDER = os.environ.get("BLENDER_BIN") or "/opt/homebrew/bin/blender"


def _channel_count_from_state(state_path: Path, override: int | None) -> int:
    if override and override > 0:
        return int(override)
    state = json.loads(state_path.read_text())
    for blob in (
        (state.get("orchestratorContract") or {}).get("quantities") or {},
        (state.get("engineeringContract") or {}).get("quantities") or {},
    ):
        ch = blob.get("channel_count")
        if isinstance(ch, dict):
            v = ch.get("value")
        else:
            v = ch
        if v is not None and float(v) > 0:
            return max(1, int(round(float(v))))
    return 4


def _render(state_path: Path, out_dir: Path, *, samples: int, frame_scale: float,
            inspect: bool) -> bool:
    env = dict(
        os.environ,
        BLENDER_OUT_DIR=str(out_dir),
        STATE_JSON=str(state_path),
        INSPECT="1" if inspect else "0",
        INSPECT_FRAME_SCALE=f"{frame_scale:.3f}",
        BLENDER_CYCLES_SAMPLES=str(samples),
        BLENDER_PRESENTATION_BEVEL="1",
    )
    cmd = [
        BLENDER, "--background", "--python",
        str(_THIS / "build_universal_scene.py"),
        "--", str(state_path),
    ]
    try:
        r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=600)
        (out_dir / "form-converge-blender.log").write_text(
            (r.stdout or "")[-8000:] + "\n---STDERR---\n" + (r.stderr or "")[-8000:]
        )
        return r.returncode == 0
    except Exception as exc:
        (out_dir / "form-converge-blender.log").write_text(f"render exception: {exc}")
        return False


def _mesh_names_from_out(out_dir: Path) -> list[str]:
    """Prefer form-meshes.json from placer; fall back to manifests / log scrape."""
    names: list[str] = []
    fm = out_dir / "form-meshes.json"
    if fm.exists():
        try:
            data = json.loads(fm.read_text())
            names.extend(str(x) for x in (data.get("meshes") or []))
        except Exception:
            pass
    for cand in (
        out_dir / "parts-manifest.json",
        out_dir / "blender-parts-manifest.json",
        out_dir / "scene-objects.json",
    ):
        if not cand.exists():
            continue
        try:
            data = json.loads(cand.read_text())
        except Exception:
            continue
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict):
                    names.append(str(row.get("name") or row.get("id") or ""))
                else:
                    names.append(str(row))
        elif isinstance(data, dict):
            for k, v in data.items():
                names.append(str(k))
                if isinstance(v, list):
                    for row in v:
                        if isinstance(row, dict):
                            names.append(str(row.get("name") or ""))
    log = out_dir / "form-converge-blender.log"
    if log.exists():
        for line in log.read_text(errors="ignore").splitlines():
            if "u_se_sp_" in line:
                for tok in line.replace(",", " ").replace("'", " ").split():
                    if tok.startswith("u_se_sp_"):
                        names.append(tok.strip("[]()"))
    # Also scrape any .txt object lists
    for p in out_dir.glob("*object*.txt"):
        for line in p.read_text(errors="ignore").splitlines():
            if "u_se_sp_" in line:
                names.append(line.strip())
    return sorted({n for n in names if n})


def _adjust_frame(frame_scale: float, findings: list) -> tuple[float, str | None]:
    codes = {f["code"] for f in findings}
    if "CLIPPED" in codes or "TOO_LARGE" in codes:
        return min(2.2, frame_scale * 1.18), "reframe_wider"
    if "TOO_SMALL" in codes:
        return max(0.55, frame_scale * 0.85), "reframe_closer"
    return frame_scale, None


def run(
    state_path: Path,
    out_dir: Path,
    *,
    channel_count: int,
    max_rounds: int = 8,
    samples: int = 24,
    frame_threshold: float = 0.80,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    frame_scale = 1.05
    trajectory: list[dict] = []
    converged = False
    for rnd in range(1, max_rounds + 1):
        # First rounds: inspect (fast). Last success pass: shaded if checklist ok.
        inspect = True
        ok = _render(
            state_path, out_dir, samples=samples, frame_scale=frame_scale, inspect=inspect)
        meshes = _mesh_names_from_out(out_dir)
        checklist_ok, missing = ifg.syringe_pump_checklist_ok(meshes, channel_count)
        iso = out_dir / "inspect-iso.png"
        hero = out_dir / "00-hero.png"
        score_img = iso if iso.exists() else hero
        framing = None
        if score_img and score_img.exists():
            framing = rqs.score_image(score_img)
        entry = {
            "round": rnd,
            "render_ok": ok,
            "frame_scale": round(frame_scale, 3),
            "checklist_ok": checklist_ok,
            "missing_stems": missing,
            "mesh_count_sp": sum(1 for n in meshes if n.startswith("u_se_sp_")),
            "framing_score": None if not framing else framing.get("score"),
            "framing_findings": [] if not framing else [f["code"] for f in framing["findings"]],
        }
        trajectory.append(entry)
        print(f"[form-converge] round {rnd}: checklist={'PASS' if checklist_ok else 'FAIL'} "
              f"missing={len(missing)} meshes_sp={entry['mesh_count_sp']} "
              f"frame={entry['framing_score']}")
        if not checklist_ok:
            # SOURCE gap — looping frame scale cannot invent missing form parts.
            break
        if framing and framing["score"] >= frame_threshold:
            # Final shaded product pass for SIGHT.
            _render(state_path, out_dir, samples=max(samples, 64),
                    frame_scale=frame_scale, inspect=False)
            converged = True
            break
        if framing:
            new_scale, op = _adjust_frame(frame_scale, framing["findings"])
            if op is None or abs(new_scale - frame_scale) < 1e-3:
                _render(state_path, out_dir, samples=max(samples, 64),
                        frame_scale=frame_scale, inspect=False)
                converged = checklist_ok
                break
            frame_scale = new_scale
        else:
            break

    report = {
        "schema": "form-convergence-report/v1",
        "form": "syringe_pump",
        "channel_count": channel_count,
        "converged": converged,
        "rounds": len(trajectory),
        "trajectory": trajectory,
        "gold_why": "docs/plans/GOLD-WHY-syringe-pump-form.md",
        "note": (
            "Checklist PASS means OPEN N-channel lead-screw grammar is present. "
            "Compare 00-hero/04-product-exterior to out/_gold-poseidon-showcase/."
        ),
    }
    (out_dir / "form-convergence-report.json").write_text(json.dumps(report, indent=2))
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("state_json", nargs="?", default="")
    ap.add_argument("out_dir", nargs="?", default="")
    ap.add_argument("--channels", type=int, default=0)
    ap.add_argument("--max", type=int, default=8)
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--threshold", type=float, default=0.80)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        ifg._selftest()
        ok, miss = ifg.syringe_pump_checklist_ok([], 2)
        assert not ok and miss
        print("form_converge_loop --selftest OK")
        return 0
    if not args.state_json or not args.out_dir:
        ap.error("state_json and out_dir required (unless --selftest)")
    state = Path(args.state_json).resolve()
    out = Path(args.out_dir).resolve()
    n = _channel_count_from_state(state, args.channels or None)
    report = run(
        state, out, channel_count=n, max_rounds=args.max,
        samples=args.samples, frame_threshold=args.threshold,
    )
    print(json.dumps({
        "converged": report["converged"],
        "rounds": report["rounds"],
        "last": report["trajectory"][-1] if report["trajectory"] else None,
    }, indent=2))
    return 0 if report["converged"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
