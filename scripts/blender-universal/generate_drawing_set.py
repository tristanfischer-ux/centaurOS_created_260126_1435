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


def run_convergence_report(state_path: Path, out_dir: Path, log: list[str]) -> dict | None:
    """W3.1/W3.2 — run the physics<->CAD economic-conductor convergence on the routed
    connection schedule and emit convergence-report.json, so the dossier can state
    'design converged in N iterations' (rounds-to-converge) instead of presenting a
    single un-iterated pass. Non-fatal: a failure never blocks the drawing set."""
    sched_path = out_dir / "connection-schedule.json"
    if not sched_path.exists():
        log.append("convergence: no connection-schedule.json — skipped (single-pass)")
        return None
    try:
        sys.path.insert(0, str(_THIS))
        import convergence_loop as cl  # sibling module
        sched = json.loads(sched_path.read_text())
        fluid, elec = cl.branches_from_schedule(sched)
        base_kw = 1000.0
        try:
            st = json.loads(state_path.read_text())
            q = (st.get("orchestratorContract") or {}).get("quantities") or {}
            v = q.get("connected_electrical_load_kw") or q.get("electrical_load_kw")
            if isinstance(v, dict):
                v = v.get("value")
            if isinstance(v, (int, float)) and v > 0:
                base_kw = float(v)
        except Exception:
            pass
        rep = cl.run_convergence(base_demand_kw=base_kw, fluid_branches=fluid, electrical_branches=elec)
        out = {
            "schema": "convergence-report/v1",
            "loop": "physics<->CAD economic-conductor + layout fixed point",
            "converged": rep.get("converged"),
            "iterations": rep.get("iterations"),
            "parasitic_kw": rep.get("parasitic_kw"),
            "parasitic_pct": rep.get("parasitic_pct"),
            "contraction_ratio": rep.get("contraction_ratio"),
            "base_demand_kw": base_kw,
            "fluid_branches": len(fluid),
            "electrical_branches": len(elec),
            "economic_lifetime_saving_gbp": (rep.get("optimisation") or {}).get("economic_lifetime_saving_gbp"),
            "trajectory": rep.get("trajectory"),
        }
        (out_dir / "convergence-report.json").write_text(json.dumps(out, indent=1))
        log.append(
            f"convergence: physics<->CAD converged={out['converged']} in {out['iterations']} iters "
            f"(parasitic {out['parasitic_kw']:.1f} kW, {out['parasitic_pct']:.2f}%); "
            f"economic-conductor saving £{(out['economic_lifetime_saving_gbp'] or 0):,.0f}")
        return out
    except Exception as e:  # noqa: BLE001 — non-fatal by design
        log.append(f"convergence: FAILED (non-fatal): {e}")
        return None


def generate_drawing_set(state_path: str | Path,
                         out_dir: str | Path | None = None) -> dict:
    """Generate the drawing set + write drawing-manifest.json. Returns the manifest."""
    state_path = Path(state_path).resolve()
    out_dir = Path(out_dir).resolve() if out_dir else state_path.parent
    (out_dir / "drawings").mkdir(parents=True, exist_ok=True)
    log: list[str] = []

    have_cad = ensure_cad_artifacts(state_path, out_dir, log)

    # W3.1/W3.2 — physics<->CAD convergence (rounds-to-converge) on the routed schedule.
    convergence = run_convergence_report(state_path, out_dir, log)

    # design-to-envelope (opt-in via ENVELOPE env, e.g. '40ft-hi-cube'): fit-audit +
    # containerisation diagram + envelope-fit-report.json. Non-fatal; only when requested.
    envelope_name = os.environ.get("ENVELOPE", "").strip()
    envelope_ok = False
    if envelope_name and have_cad:
        try:
            subprocess.run([_venv_python(), str(_THIS / "draw_envelope_pack.py"),
                            str(out_dir), str(state_path), "--env", envelope_name],
                           capture_output=True, text=True, timeout=150)
            envelope_ok = (out_dir / "drawings" / "envelope-packing.png").exists()
            log.append(f"envelope({envelope_name}): {'diagram + report written' if envelope_ok else 'no diagram'}")
        except Exception as e:  # noqa: BLE001
            log.append(f"envelope: FAILED (non-fatal): {e}")

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

    # The Block-Flow Diagram (D1 fix) is the PART-1 process-flow overview — distinct
    # from the Part-2 system/schedule drawings. It needs ONLY state.json (the CAD
    # artifacts are optional enrichment), so it runs regardless of have_cad (it
    # renders even when Blender is absent). The renderer's EngineeringBasisPage reads
    # block_flow_diagram to replace the degraded process-flow box-list for non-CO2.
    bfd_ok = _run_generator("draw_bfd.py", out_dir, state_path,
                            "block-flow-diagram.png", log)
    bfd_path = str(out_dir / "drawings" / "block-flow-diagram.png") if bfd_ok else None

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
        # the Part-1 process-flow Block-Flow Diagram (D1 fix) → EngineeringBasisPage.
        "block_flow_diagram": bfd_path,
        # W3.1/W3.2 physics<->CAD convergence (rounds-to-converge) → renderer surfaces it.
        "convergence_report": ("convergence-report.json"
                               if (out_dir / "convergence-report.json").exists() else None),
        "convergence": ({"converged": convergence.get("converged"),
                         "iterations": convergence.get("iterations"),
                         "economic_saving_gbp": convergence.get("economic_lifetime_saving_gbp")}
                        if convergence else None),
        # design-to-envelope (opt-in): the containerisation diagram + report → dossier page.
        "envelope_fit_report": ("envelope-fit-report.json"
                                if (out_dir / "envelope-fit-report.json").exists() else None),
        "envelope_packing_png": ("drawings/envelope-packing.png" if envelope_ok else None),
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
