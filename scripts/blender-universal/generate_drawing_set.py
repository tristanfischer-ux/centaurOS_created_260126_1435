#!/usr/bin/env python3
"""
scripts/blender-universal/generate_drawing_set.py

DRIVER (W2.1a) — turn a dossier state.json into the full design-and-construction
drawing set, then emit a manifest the PDF renderer consumes in LEAD-AND-WEAVE
order (Tristan 2026-06-11): the 3 SYSTEM drawings open Part 2; the schedules /
details weave into the Part-2 manufacturing layer; the cable schedule is the
connection-schedule.json rendered as a table by the renderer.

USAGE
    python3 generate_drawing_set.py <state.json> [out_dir]
        out_dir defaults to dirname(state.json) (the dossier's own folder).

WHAT IT DOES
    1. Ensure the routed-CAD artifacts exist in out_dir — connection-schedule.json,
       route-manifest.json, parts-manifest.json. These come from the Blender scene
       build (build_universal_scene.py, which runs INSIDE Blender). If they are all
       present we REUSE them (no Blender needed — the common re-render case). If any
       is missing and `blender` is on PATH we build them once; if Blender is absent
       we skip the geometry-dependent drawings gracefully (the dossier still renders,
       minus those drawings — same philosophy as the renderer's existsSync gate).
    2. Run each pure-Python drawing generator (draw_*.py) as an isolated subprocess
       with (out_dir, state_path), so one generator failing never kills the set.
    3. Write `<out_dir>/drawing-manifest.json` listing every drawing, grouped
       system vs schedule, with its PNG path + ok flag — the renderer's contract.

DESIGN
    - Pure orchestration; deterministic; no fabricated data.
    - Each generator is sandboxed (subprocess + timeout); a crash is recorded, not
      propagated. The manifest is always written (possibly all-failed) so the
      renderer has a single, uniform thing to read.
    - British spelling throughout.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

_THIS = Path(__file__).resolve().parent
_REPO = _THIS.parent.parent

# The routed-CAD artifacts the drawing generators consume (produced by the
# Blender scene build). All three present ⇒ reuse; any missing ⇒ (re)build.
_CAD_ARTIFACTS = ("connection-schedule.json", "route-manifest.json",
                  "parts-manifest.json")

# The drawing generators, in LEAD-AND-WEAVE groups. Each: (key, script, png,
# human title). isometric-index is the per-line iso register's key sheet.
SYSTEM_DRAWINGS = [
    ("general-arrangement", "draw_ga.py", "general-arrangement.png",
     "General Arrangement"),
    ("single-line", "draw_single_line.py", "single-line-diagram.png",
     "Single-Line Electrical Diagram"),
    ("pid", "draw_pid.py", "pid.png",
     "Piping & Instrumentation Diagram"),
]
SCHEDULE_DRAWINGS = [
    ("process-schedules", "draw_process_schedules.py", "process-schedules.png",
     "Process Schedules — line / valve / instrument"),
    ("panel-schedule", "draw_panel_schedule.py", "panel-schedule.png",
     "Panel / Load Schedule"),
    ("hvac", "draw_hvac.py", "hvac-layout.png", "HVAC Duct Layout"),
    ("isometric", "draw_isometric.py", "isometric-index.png",
     "Piping Isometrics"),
]


def _blender_bin() -> str | None:
    return shutil.which("blender") or (
        "/opt/homebrew/bin/blender"
        if os.path.exists("/opt/homebrew/bin/blender") else None)


def _venv_python() -> str:
    cand = _REPO / ".venv" / "bin" / "python"
    return str(cand) if cand.exists() else sys.executable


def ensure_cad_artifacts(state_path: Path, out_dir: Path,
                         log: list[str]) -> bool:
    """Make sure the routed-CAD artifacts exist in out_dir. Reuse if all present;
    else build via headless Blender. Returns True if the artifacts are available
    (reused or built), False if they could not be produced (Blender absent)."""
    have = all((out_dir / a).exists() for a in _CAD_ARTIFACTS)
    if have:
        log.append(f"reuse: CAD artifacts already in {out_dir}")
        return True
    blender = _blender_bin()
    if not blender:
        log.append("SKIP: CAD artifacts missing and `blender` not on PATH — "
                   "geometry-dependent drawings will be skipped")
        return False
    log.append(f"build: running headless Blender to produce CAD artifacts → {out_dir}")
    env = dict(os.environ, BLENDER_OUT_DIR=str(out_dir), STATE_JSON=str(state_path))
    try:
        proc = subprocess.run(
            [blender, "--background", "--python",
             str(_THIS / "build_universal_scene.py"), "--", str(state_path)],
            env=env, capture_output=True, text=True, timeout=600)
    except Exception as exc:  # noqa: BLE001
        log.append(f"SKIP: Blender build failed to launch: {type(exc).__name__}: {exc}")
        return False
    ok = all((out_dir / a).exists() for a in _CAD_ARTIFACTS)
    if not ok:
        tail = (proc.stderr or proc.stdout or "")[-300:]
        log.append(f"SKIP: Blender ran (rc={proc.returncode}) but artifacts absent: …{tail}")
    return ok


def _run_generator(script: str, out_dir: Path, state_path: Path,
                   png_name: str, log: list[str]) -> bool:
    """Run one draw_*.py as an isolated subprocess; return whether its PNG landed."""
    png = out_dir / "drawings" / png_name
    # Remove a stale PNG so a silent failure can't masquerade as success.
    try:
        if png.exists():
            png.unlink()
    except OSError:
        pass
    try:
        proc = subprocess.run(
            [_venv_python(), str(_THIS / script), str(out_dir), str(state_path)],
            capture_output=True, text=True, timeout=240)
    except Exception as exc:  # noqa: BLE001
        log.append(f"  {script}: launch failed: {type(exc).__name__}: {exc}")
        return False
    if png.exists() and png.stat().st_size > 1000:
        return True
    tail = (proc.stderr or proc.stdout or "").strip()[-200:]
    log.append(f"  {script}: no PNG (rc={proc.returncode}) …{tail}")
    return False


def generate_drawing_set(state_path: str | Path,
                         out_dir: str | Path | None = None) -> dict:
    """Generate the drawing set + write drawing-manifest.json. Returns the manifest."""
    state_path = Path(state_path).resolve()
    out_dir = Path(out_dir).resolve() if out_dir else state_path.parent
    (out_dir / "drawings").mkdir(parents=True, exist_ok=True)
    log: list[str] = []

    have_cad = ensure_cad_artifacts(state_path, out_dir, log)

    def _group(rows: list[tuple]) -> list[dict]:
        out = []
        for key, script, png_name, title in rows:
            ok = have_cad and _run_generator(script, out_dir, state_path, png_name, log)
            out.append({
                "key": key, "title": title, "script": script,
                "png": f"drawings/{png_name}",
                "png_abs": str(out_dir / "drawings" / png_name),
                "ok": ok,
            })
        return out

    system = _group(SYSTEM_DRAWINGS)
    schedules = _group(SCHEDULE_DRAWINGS)
    n_ok = sum(1 for d in system + schedules if d["ok"])

    # The universal-CAD HERO render for the dossier cover + per-module fallback
    # (build_universal_scene.py writes inspect-iso.png to out_dir). The chain reads
    # manifest["hero"] → state.cad_hero_image_path so the new Blender image lands in
    # the PDF where a class has no template (e.g. e-fuel). Prefer the iso view.
    hero_abs = None
    for cand in ("inspect-iso.png", "inspect-hero.png", "cad-hero.png"):
        p = out_dir / cand
        if p.exists() and p.stat().st_size > 1000:
            hero_abs = str(p)
            break

    manifest = {
        "schema": "drawing-set/v1",
        "placement": "lead-and-weave",
        "out_dir": str(out_dir),
        "state": str(state_path),
        "cad_artifacts_available": have_cad,
        # 3 system drawings OPEN Part 2.
        "system_drawings": system,
        # schedules/details WEAVE into the Part-2 manufacturing layer.
        "schedule_drawings": schedules,
        # the universal-CAD hero render → state.cad_hero_image_path (cover + module fallback).
        "hero": hero_abs,
        # the cable schedule is the connection schedule rendered as a table.
        "cable_schedule_source": ("connection-schedule.json"
                                  if (out_dir / "connection-schedule.json").exists()
                                  else None),
        "generated_ok": n_ok,
        "total": len(system) + len(schedules),
        "log": log,
    }
    (out_dir / "drawing-manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    state_path = argv[0]
    out_dir = argv[1] if len(argv) > 1 else None
    m = generate_drawing_set(state_path, out_dir)
    print(f"[drawing-set] {m['generated_ok']}/{m['total']} drawings generated "
          f"(CAD artifacts {'available' if m['cad_artifacts_available'] else 'ABSENT'})")
    for d in m["system_drawings"]:
        print(f"  [system]   {'✓' if d['ok'] else '✗'} {d['title']}  ({d['png']})")
    for d in m["schedule_drawings"]:
        print(f"  [schedule] {'✓' if d['ok'] else '✗'} {d['title']}  ({d['png']})")
    if any("SKIP" in l or "failed" in l for l in m["log"]):
        print("  log:")
        for l in m["log"]:
            print(f"    · {l}")
    print(f"  → manifest: {Path(m['out_dir']) / 'drawing-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
