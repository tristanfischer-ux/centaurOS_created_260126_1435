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

sys.path.insert(0, str(_ROOT / "scripts" / "lib"))
import form_render_glance as frg  # noqa: E402
from vision_route_fix import (  # noqa: E402
    run_loop as vision_run_loop,
    to_env as vision_knobs_to_env,
)

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
            inspect: bool, studio_knobs: dict | None = None) -> bool:
    env = dict(
        os.environ,
        BLENDER_OUT_DIR=str(out_dir),
        STATE_JSON=str(state_path),
        INSPECT="1" if inspect else "0",
        INSPECT_FRAME_SCALE=f"{frame_scale:.3f}",
        BLENDER_CYCLES_SAMPLES=str(samples),
        BLENDER_PRESENTATION_BEVEL="1",
    )
    # INTENT: presentation-only softbox/frame nudges from vision_route_fix.
    # Never mutates geometry. Exposure ≤0 enforced inside Blender resolve.
    if studio_knobs:
        knobs = dict(studio_knobs)
        knobs["frame_scale"] = float(frame_scale)
        env.update(vision_knobs_to_env(knobs))
        env["INSPECT_FRAME_SCALE"] = f"{float(frame_scale):.3f}"
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


def _presentation_nudge(
    out_dir: Path,
    *,
    hero: Path,
    source_audit_clear: bool,
    knobs0: dict | None = None,
) -> dict:
    """Measure body luminance → run vision_route_fix once (no ship PASS).

    Returns a dict suitable for trajectory + optional studio_knobs for re-render.
    """
    lum = ifg.body_luminance_mean(str(hero)) if hero.exists() else None
    result = vision_run_loop(
        body_luminance=lum,
        evidence_complete=lum is not None,
        source_audit_clear=source_audit_clear,
        knobs0=knobs0,
        max_iters=1,
    )
    payload = result.to_dict()
    payload["body_luminance"] = lum
    (out_dir / "vision-route-fix.json").write_text(
        json.dumps(payload, indent=2))
    return payload


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
            for pfx in ("u_se_sp_", "u_se_lm_", "u_se_tc_"):
                if pfx in line:
                    for tok in line.replace(",", " ").replace("'", " ").split():
                        if tok.startswith(pfx):
                            names.append(tok.strip("[]()"))
    # Also scrape any .txt object lists
    for p in out_dir.glob("*object*.txt"):
        for line in p.read_text(errors="ignore").splitlines():
            if any(x in line for x in ("u_se_sp_", "u_se_lm_", "u_se_tc_")):
                names.append(line.strip())
    return sorted({n for n in names if n})


def _form_from_state(state_path: Path) -> str:
    """Resolve form family from frozen state — never a product-noun branch."""
    state = json.loads(state_path.read_text())
    pc = str(
        (state.get("keyMetrics") or {}).get("product_class")
        or (state.get("parsedBrief") or {}).get("product_class")
        or ""
    )
    part_blob = ""
    for m in ((state.get("moduleDecomposition") or {}).get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                part_blob += " " + str(w.get("name_human") or "")
    fam = ifg.resolve_form_family(
        product_class=pc, part_blob=part_blob, is_instrument=True
    )
    return fam or "syringe_pump"


def _checklist_for_form(form_id: str, meshes: list[str], channel_count: int) -> tuple[bool, list[str]]:
    if form_id == "lab_microscope":
        return ifg.lab_microscope_checklist_ok(meshes)
    if form_id == "syringe_pump":
        return ifg.syringe_pump_checklist_ok(meshes, channel_count)
    # Thermocycler / optical: no mesh checklist in this loop yet — framing+glance only.
    return (True, [])


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
    form_id: str | None = None,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    form_id = form_id or _form_from_state(state_path)
    frame_scale = 1.05
    trajectory: list[dict] = []
    converged = False
    for rnd in range(1, max_rounds + 1):
        # First rounds: inspect (fast). Last success pass: shaded if checklist ok.
        inspect = True
        ok = _render(
            state_path, out_dir, samples=samples, frame_scale=frame_scale, inspect=inspect)
        meshes = _mesh_names_from_out(out_dir)
        checklist_ok, missing = _checklist_for_form(form_id, meshes, channel_count)
        iso = out_dir / "inspect-iso.png"
        hero = out_dir / "00-hero.png"
        exterior = out_dir / "04-product-exterior.png"
        # DECISION: framing uses inspect-iso; form glance uses PRODUCT shots only
        # (inspect overlays are not twinship — encode checklist §3.4).
        score_img = iso if iso.exists() else hero
        framing = None
        if score_img and score_img.exists():
            framing = rqs.score_image(score_img)
        glance = None
        glance_img = hero if hero.exists() else exterior
        if checklist_ok and glance_img and glance_img.exists() and not str(glance_img).endswith(
            "inspect-iso.png"
        ):
            # Prefer shaded product; if only inspect hero exists mid-loop, still glance.
            glance = frg.score_form_glance(form_id, glance_img)
        _pfx = {
            "syringe_pump": "u_se_sp_",
            "lab_microscope": "u_se_lm_",
            "thermocycler": "u_se_tc_",
        }.get(form_id, "u_se_")
        entry = {
            "round": rnd,
            "form": form_id,
            "render_ok": ok,
            "frame_scale": round(frame_scale, 3),
            "checklist_ok": checklist_ok,
            "missing_stems": missing,
            "mesh_count_form": sum(1 for n in meshes if n.startswith(_pfx)),
            "framing_score": None if not framing else framing.get("score"),
            "framing_findings": [] if not framing else [f["code"] for f in framing["findings"]],
            "glance_ok": None if glance is None else glance.get("ok"),
            "glance_score": None if glance is None else glance.get("score"),
            "glance_findings": [] if not glance else [f["code"] for f in glance.get("findings") or []],
            "glance_metrics": None if not glance else glance.get("metrics"),
        }
        trajectory.append(entry)
        print(f"[form-converge] round {rnd} form={form_id}: "
              f"checklist={'PASS' if checklist_ok else 'FAIL'} "
              f"missing={len(missing)} meshes={entry['mesh_count_form']} "
              f"frame={entry['framing_score']} "
              f"glance={'PASS' if entry['glance_ok'] else ('FAIL' if entry['glance_ok'] is False else 'n/a')}"
              f"{(' ' + str(entry['glance_findings'])) if entry['glance_findings'] else ''}")
        if not checklist_ok:
            # SOURCE gap — looping frame scale cannot invent missing form parts.
            break
        if glance is not None and not glance.get("ok"):
            # SOURCE gap — glance codes name the constant/placer fix (not reframe).
            _render(state_path, out_dir, samples=max(samples, 64),
                    frame_scale=frame_scale, inspect=False)
            # Re-glance shaded hero; if still bad, stop (do not claim converged).
            if (out_dir / "00-hero.png").exists():
                glance2 = frg.score_form_glance(form_id, out_dir / "00-hero.png")
                entry["glance_ok"] = glance2.get("ok")
                entry["glance_score"] = glance2.get("score")
                entry["glance_findings"] = [f["code"] for f in glance2.get("findings") or []]
                entry["glance_metrics"] = glance2.get("metrics")
                (out_dir / "form-glance.json").write_text(json.dumps(glance2, indent=2))
                if glance2.get("ok") and framing:
                    codes = {f["code"] for f in framing.get("findings") or []}
                    needs_reframe = bool(codes & {"TOO_SMALL", "TOO_LARGE", "CLIPPED"})
                    converged = framing["score"] >= frame_threshold and not needs_reframe
                else:
                    converged = False
            break
        if framing:
            codes = {f["code"] for f in framing.get("findings") or []}
            # GOTCHA: score can clear threshold while TOO_SMALL remains — still reframe.
            needs_reframe = bool(codes & {"TOO_SMALL", "TOO_LARGE", "CLIPPED"})
            if framing["score"] >= frame_threshold and not needs_reframe:
                _render(state_path, out_dir, samples=max(samples, 64),
                        frame_scale=frame_scale, inspect=False)
                # Final shaded glance is mandatory for converge (layer 3).
                if (out_dir / "00-hero.png").exists():
                    glance_f = frg.score_form_glance(form_id, out_dir / "00-hero.png")
                    (out_dir / "form-glance.json").write_text(json.dumps(glance_f, indent=2))
                    entry["glance_ok"] = glance_f.get("ok")
                    entry["glance_findings"] = [f["code"] for f in glance_f.get("findings") or []]
                    converged = bool(glance_f.get("ok"))
                else:
                    converged = True
                break
            new_scale, op = _adjust_frame(frame_scale, framing["findings"])
            if op is None or abs(new_scale - frame_scale) < 1e-3:
                _render(state_path, out_dir, samples=max(samples, 64),
                        frame_scale=frame_scale, inspect=False)
                glance_f = None
                if (out_dir / "00-hero.png").exists():
                    glance_f = frg.score_form_glance(form_id, out_dir / "00-hero.png")
                    (out_dir / "form-glance.json").write_text(json.dumps(glance_f, indent=2))
                converged = (
                    checklist_ok and not needs_reframe
                    and (glance_f is None or bool(glance_f.get("ok")))
                )
                break
            frame_scale = new_scale
            continue
        break

    # INTENT (encode §0.3): never exit on inspect-only rounds without a shaded
    # form glance — framing can churn on TOO_SMALL while twinship is unmeasured.
    last_ok = bool(trajectory and trajectory[-1].get("checklist_ok"))
    if last_ok and not (out_dir / "00-hero.png").exists():
        _render(state_path, out_dir, samples=max(samples, 64),
                frame_scale=frame_scale, inspect=False)
    if last_ok and (out_dir / "00-hero.png").exists():
        glance_hero = frg.score_form_glance(form_id, out_dir / "00-hero.png")
        glance_ext = None
        if (out_dir / "04-product-exterior.png").exists():
            glance_ext = frg.score_form_glance(
                form_id, out_dir / "04-product-exterior.png")
        # DECISION: both product shots must pass for converge (gold twinship).
        # Iso ground residual: hero may clear via iso_crate_residual_ok when
        # exterior is clean and mechanism/HMI/harness metrics are strong.
        glance_final = glance_hero
        hero_ok = bool(glance_hero.get("ok")) or frg.iso_crate_residual_ok(glance_hero)
        ext_ok = glance_ext is None or bool(glance_ext.get("ok"))
        both_ok = hero_ok and ext_ok
        (out_dir / "form-glance.json").write_text(json.dumps({
            "hero": glance_hero,
            "exterior": glance_ext,
            "ok": both_ok,
        }, indent=2))
        if trajectory:
            trajectory[-1]["glance_ok"] = both_ok
            trajectory[-1]["glance_score"] = glance_hero.get("score")
            trajectory[-1]["glance_findings"] = [
                f["code"] for f in glance_hero.get("findings") or []
            ]
            if glance_ext and not glance_ext.get("ok"):
                trajectory[-1]["glance_findings"] += [
                    f"ext:{f['code']}" for f in glance_ext.get("findings") or []
                ]
            trajectory[-1]["glance_metrics"] = glance_hero.get("metrics")
        if not both_ok:
            converged = False
            print(f"[form-converge] final glance FAIL hero="
                  f"{[f['code'] for f in glance_hero.get('findings') or []]} "
                  f"ext={[] if not glance_ext else [f['code'] for f in glance_ext.get('findings') or []]}")
        else:
            print("[form-converge] final glance PASS (hero + exterior)")
            converged = True

    # INTENT: after SOURCE (checklist+glance) clear, close the Solvaix gap for
    # PRESENTATION only — body luminance → softbox/exposure knobs → one re-render.
    # Never sets ship_pass; never mutates geometry. Council-hardened 2026-07-29.
    presentation_report = None
    hero_path = out_dir / "00-hero.png"
    if last_ok and hero_path.exists() and form_id in (
        "optical_handheld", "thermocycler", "lab_microscope", "syringe_pump",
    ):
        presentation_report = _presentation_nudge(
            out_dir,
            hero=hero_path,
            source_audit_clear=bool(last_ok),
        )
        if trajectory:
            trajectory[-1]["presentation"] = {
                "reason": presentation_report.get("reason"),
                "converged": presentation_report.get("converged"),
                "ship_pass": presentation_report.get("ship_pass"),
                "body_luminance": presentation_report.get("body_luminance"),
                "final_knobs": presentation_report.get("final_knobs"),
            }
        if presentation_report.get("reason") == "awaiting_re_render":
            knobs = presentation_report.get("final_knobs") or {}
            fs = float(knobs.get("frame_scale", frame_scale))
            print(f"[form-converge] presentation nudge → re-render "
                  f"(key={knobs.get('key_energy')} lum="
                  f"{presentation_report.get('body_luminance')})")
            _render(
                state_path, out_dir,
                samples=max(samples, 64),
                frame_scale=fs,
                inspect=False,
                studio_knobs=knobs,
            )
            # Re-measure; do NOT claim ship PASS from this loop.
            presentation_report = _presentation_nudge(
                out_dir,
                hero=out_dir / "00-hero.png",
                source_audit_clear=True,
                knobs0=knobs,
            )
            if trajectory:
                trajectory[-1]["presentation_after"] = {
                    "reason": presentation_report.get("reason"),
                    "body_luminance": presentation_report.get("body_luminance"),
                    "final_knobs": presentation_report.get("final_knobs"),
                }
            print(f"[form-converge] presentation after: "
                  f"{presentation_report.get('reason')} "
                  f"lum={presentation_report.get('body_luminance')}")

    drawings = None
    if converged:
        drawings = _regen_drawings(state_path, out_dir)

    _gold_why = {
        "syringe_pump": "docs/plans/GOLD-WHY-syringe-pump-form.md",
        "lab_microscope": "docs/plans/GOLD-WHY-lab-microscope-form.md",
        "thermocycler": "docs/plans/GOLD-WHY-instrument-rules.md",
        "optical_handheld": "docs/plans/GOLD-WHY-instrument-rules.md",
    }.get(form_id, "docs/plans/GOLD-WHY-instrument-rules.md")
    report = {
        "schema": "form-convergence-report/v1",
        "form": form_id,
        "channel_count": channel_count,
        "converged": converged,
        "rounds": len(trajectory),
        "trajectory": trajectory,
        "presentation": presentation_report,
        "drawings": drawings,
        "gold_why": _gold_why,
        "encode_checklist": "docs/plans/UNIVERSAL-ENCODE-CHECKLIST-2026-07-16.md",
        "note": (
            "Converged = mesh checklist PASS + form_render_glance PASS (+ framing when available). "
            "Glance FAIL routes to form grammar / placer SOURCE (not reframe). "
            "Presentation nudge (vision_route_fix) may adjust softbox/frame after SOURCE "
            "clear — never invents ship PASS; never mutates geometry. "
            "On converge, generate_drawing_set regenerates GA/interconnect from new form."
        ),
    }
    (out_dir / "form-convergence-report.json").write_text(json.dumps(report, indent=2))
    (out_dir / "form-drawings-dirty").unlink(missing_ok=True)
    if converged:
        (out_dir / "form-drawings-stamped.json").write_text(
            json.dumps({"ok": True, "drawings": drawings}, indent=2)
        )
    else:
        (out_dir / "form-drawings-dirty").write_text(
            "form not converged — drawings stale relative to form SOURCE\n"
        )
    return report


def _regen_drawings(state_path: Path, out_dir: Path) -> dict:
    """Regenerate GA/interconnect after form converge (encode checklist §3.8 / P1-6)."""
    gen = _THIS / "generate_drawing_set.py"
    if not gen.exists():
        return {"ok": False, "error": "generate_drawing_set.py missing"}
    # Drop stale CAD manifests so ensure_cad_artifacts rebuilds from this out_dir
    # (Blender already wrote them in the form loop — keep them; only force drawing PNGs).
    cmd = [sys.executable, str(gen), str(state_path), str(out_dir)]
    env = dict(os.environ, BLENDER_OUT_DIR=str(out_dir), STATE_JSON=str(state_path), INSPECT="0")
    try:
        r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=900)
        (out_dir / "form-drawings-regen.log").write_text(
            (r.stdout or "")[-6000:] + "\n---STDERR---\n" + (r.stderr or "")[-6000:]
        )
        return {
            "ok": r.returncode == 0,
            "returncode": r.returncode,
            "log": "form-drawings-regen.log",
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


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
        # vision_route_fix first — council DECISIVE proveCatch (empty ≠ PASS)
        from vision_route_fix.vision_defect_schema import selftest as _vds
        from vision_route_fix.presentation_knobs import selftest as _vpk
        from vision_route_fix.vision_route_fix_loop import selftest as _vrl
        assert _vds() == 0 and _vpk() == 0 and _vrl() == 0
        ifg._selftest()
        ok, miss = ifg.syringe_pump_checklist_ok([], 2)
        assert not ok and miss
        lok, lmiss = ifg.lab_microscope_checklist_ok([])
        assert not lok and lmiss
        frg._selftest()
        assert ifg.resolve_form_family(product_class="syringe_pump") == "syringe_pump"
        assert ifg.resolve_form_family(product_class="ninjapcr") == "thermocycler"
        assert ifg.resolve_form_family(product_class="lab_microscope") == "lab_microscope"
        assert "syringe_pump" in ifg.FORM_FAMILIES and "lab_microscope" in ifg.FORM_FAMILIES
        print("form_converge_loop --selftest OK "
              "(vision_route_fix + form_render_glance + FORM_FAMILIES)")
        return 0
    if not args.state_json or not args.out_dir:
        ap.error("state_json and out_dir required (unless --selftest)")
    state = Path(args.state_json).resolve()
    out = Path(args.out_dir).resolve()
    n = _channel_count_from_state(state, args.channels or None)
    form_id = _form_from_state(state)
    report = run(
        state, out, channel_count=n, max_rounds=args.max,
        samples=args.samples, frame_threshold=args.threshold, form_id=form_id,
    )
    print(json.dumps({
        "converged": report["converged"],
        "rounds": report["rounds"],
        "last": report["trajectory"][-1] if report["trajectory"] else None,
    }, indent=2))
    return 0 if report["converged"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
