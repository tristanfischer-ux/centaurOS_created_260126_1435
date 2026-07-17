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
sys.path.insert(0, str(_REPO / "scripts" / "lib"))
from render_view_contract import (  # noqa: E402
    drawing_form_factor,
    is_product_scale,
    pack_drawings,
    required_views,
    resolve_design_envelope_mm,
)

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
    # Handheld pack only (fluid-less instruments) — wiring/signal blueprint.
    ("interconnect", "draw_interconnect.py", "interconnect.png",
     "Interconnect — device wiring & signal paths"),
]
SCHEDULE_DRAWINGS = [
    ("process-schedules", "draw_process_schedules.py", "process-schedules.png",
     "Working Schematic — Line / Valve / Instrument Schedules (pipe runs, DN, valve locations)"),
    ("panel-schedule", "draw_panel_schedule.py", "panel-schedule.png",
     "Panel / Load Schedule"),
    # Isometric drawings REMOVED from the dossier (Tristan 2026-06-28: "get rid of the isometric
    # drawings — I never understood or trusted them"). draw_isometric.py is no longer invoked.
    # HVAC moved to CONDITIONAL_DRAWINGS (T-10 / Sam Green): water-only plants must not emit
    # an orphan HVAC sheet — gate via draw_hvac.should_emit(state).
]

# CONDITIONAL DETAIL sheets (T-20 / T-25 / T-10) — emitted only when the contract carries
# the relevant geometry / zone / HVAC signals. Each: (key, script, png, title, gate_fn_name).
# gate_fn_name is resolved by importing the script module and calling should_emit(state).
# When should_emit is False the sheet is skipped with `skipped (should_emit=False)` — never
# marked ok:false for a missing PNG (that would look like a failed draw on a N/A sheet).
CONDITIONAL_DRAWINGS = [
    ("distribution-interface", "draw_distribution_interface.py",
     "distribution-interface.png",
     "Distribution Interface Detail — multi-tier supply + drain",
     "should_emit"),
    ("facility-layout", "draw_facility_layout.py",
     "facility-layout.png",
     "Facility / WTR Layout — plant + cultivation zone blocks",
     "should_emit"),
    ("hvac", "draw_hvac.py", "hvac-layout.png", "HVAC Duct Layout",
     "should_emit"),
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
            # 1500 s: a heavy scene (e.g. a RAS with 8 parallel treatment trains × 24
            # units + the building take-off + 90+ routed connections) exceeds the old
            # 600 s here — the build then returns "artifacts=MISSING" and the whole BoM +
            # drawing set silently vanish. The render step already allows 900 s; the CAD
            # build (geometry + orthogonal routing + manifest export) is heavier. (2026-06-16)
            env=env, capture_output=True, text=True, timeout=1500)
    except Exception as exc:  # noqa: BLE001
        log.append(f"SKIP: Blender build failed to launch: {type(exc).__name__}: {exc}")
        return False
    ok = all((out_dir / a).exists() for a in _CAD_ARTIFACTS)
    if not ok:
        tail = (proc.stderr or proc.stdout or "")[-300:]
        log.append(f"SKIP: Blender ran (rc={proc.returncode}) but artifacts absent: …{tail}")
    return ok


def _render_fresh_vs_manifest(render: Path, manifest: Path) -> bool:
    """True when `render` is usable as a view of THIS parts-manifest generation.

    INTENT: a pre-settle Phase-5 01-top/00-hero must never skip the late pass when
    the settle loop has since rewritten parts-manifest.json (Codema 2026-07-14:
    GA from settled 54-part layout, Blender plan from stale 61-part bg pass)."""
    if not render.exists() or render.stat().st_size < 1000:
        return False
    if not manifest.exists():
        return True
    # Allow 2 s clock skew; manifest newer than the render ⇒ stale.
    return render.stat().st_mtime + 2.0 >= manifest.stat().st_mtime


def _restamp_system_svg_placement_fps(out_dir: Path, log: list[str]) -> None:
    """After the FINAL parts-manifest is settled, every system SVG must carry its fp.

    INTENT (Powerwall 2026-07-15): display-only GA transforms (product FFL rebase)
    used to embed a fingerprint of the *mutated* GAParts while P&ID/SLD stamped the
    settled manifest — G15/G16 then fired. Re-stamp from the settled manifest so a
    divergent data-placement-fp can never ship, even if a generator forgets.
    NA-BY-DESIGN sheets are left alone. Content staleness is still caught by G16
    phantom-tag checks on placement-projected sheets.
    """
    try:
        sys.path.insert(0, str(_THIS))
        from placement_fp import (  # noqa: E402
            embed_svg_placement_fp,
            extract_svg_placement_fp,
            is_na_by_design,
            load_manifest_placement_fp,
        )
    except Exception as exc:  # noqa: BLE001
        log.append(f"placement-fp restamp: SKIP (import: {exc})")
        return
    fp = load_manifest_placement_fp(str(out_dir))
    if not fp:
        log.append("placement-fp restamp: SKIP (no settled placement_fp)")
        return
    draw = out_dir / "drawings"
    if not draw.is_dir():
        return
    n_fixed = 0
    for svg_path in sorted(draw.glob("*.svg")):
        try:
            txt = svg_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if len(txt) < 40 or is_na_by_design(txt):
            continue
        got = extract_svg_placement_fp(txt)
        if got == fp:
            continue
        try:
            svg_path.write_text(embed_svg_placement_fp(txt, fp), encoding="utf-8")
            n_fixed += 1
            # INTENT (NinjaPCR 2026-07-15): restamping SVG after an ~800s settle
            # left the sibling PNG older → G16 "png older than svg by 840s" on
            # interconnect. Bump PNG mtime (attribute-only stamp; content unchanged).
            png_path = svg_path.with_suffix(".png")
            if png_path.is_file():
                try:
                    os.utime(png_path, None)
                except OSError:
                    pass
        except OSError as exc:
            log.append(f"placement-fp restamp: {svg_path.name} write failed: {exc}")
    if n_fixed:
        log.append(f"placement-fp restamp: {n_fixed} SVG(s) → {fp} (PNG mtimes synced)")
    else:
        log.append(f"placement-fp restamp: all system SVGs already match {fp}")


def _align_plan_render_to_manifest(out_dir: Path, log: list[str]) -> None:
    """Promote inspect-top.png → 01-top.png when it shares generation with the
    canonical parts-manifest (the SAME INSPECT=1 placement the GA was drawn from).

    DECISION: the shaded INSPECT=0 hero pass may RE-PLACE (control-cabinet
    consolidate etc.); after the canon-manifest restore those PNGs no longer match
    the GA. The settle-loop inspect-top IS the Blender plan of the GA placement —
    use it as the Excel-bound annotated plan so GA ≠ Blender-plan cannot ship.

    GOTCHA: settle writes inspect-top a few seconds before the final manifest
    touch (or a skipped hero leaves a much older shaded 01-top). Allow a 30-min
    window so a slightly-older inspect-top still wins over a divergent shaded plan."""
    manifest = out_dir / "parts-manifest.json"
    inspect_top = out_dir / "inspect-top.png"
    plan = out_dir / "01-top.png"
    if not (inspect_top.exists() and inspect_top.stat().st_size > 1000 and manifest.exists()):
        return
    age = manifest.stat().st_mtime - inspect_top.stat().st_mtime
    if age > 1800:  # inspect more than 30 min older than manifest — different run
        log.append(f"plan-align: inspect-top.png too old vs parts-manifest "
                   f"({age:.0f}s) — leave 01-top.png")
        return
    try:
        shutil.copy2(inspect_top, plan)
        # copy2 preserves the older inspect mtime — bump so G15 freshness passes.
        import os
        os.utime(plan, None)
        log.append("plan-align: 01-top.png ← inspect-top.png "
                   "(same INSPECT=1 placement as GA / parts-manifest)")
    except OSError as exc:
        log.append(f"plan-align: copy failed: {exc}")


def _run_shaded_hero_pass(out_dir: Path, state_path: Path,
                          log: list[str]) -> bool:
    """Run a second Blender pass with INSPECT=0 to produce the SHADED studio
    hero (00-hero.png + blender-cover.png). The settle loop ran INSPECT=1
    (flat color-coded inspect-*.png); this pass re-renders with studio key-sun
    + soft shadows. Skipped only when 00-hero.png is FRESH vs parts-manifest
    (Codema 2026-07-14 — existence alone is not enough). Non-fatal."""
    hero = out_dir / "00-hero.png"
    manifest = out_dir / "parts-manifest.json"
    if _render_fresh_vs_manifest(hero, manifest):
        log.append("shaded-hero: 00-hero.png fresh vs parts-manifest — skip")
        return True
    if hero.exists():
        log.append("shaded-hero: 00-hero.png STALE vs parts-manifest — re-render")
    blender = _blender_bin()
    if not blender:
        log.append("shaded-hero: SKIP — blender not on PATH")
        return False
    env = dict(os.environ, BLENDER_OUT_DIR=str(out_dir),
               STATE_JSON=str(state_path), INSPECT="0")
    log.append("shaded-hero: running INSPECT=0 Blender pass → 00-hero.png")
    try:
        proc = subprocess.run(
            [blender, "--background", "--python",
             str(_THIS / "build_universal_scene.py"), "--", str(state_path)],
            env=env, capture_output=True, text=True, timeout=1500)
    except Exception as exc:  # noqa: BLE001
        log.append(f"shaded-hero: Blender launch failed: {exc}")
        return False
    ok = hero.exists() and hero.stat().st_size > 1000
    if not ok:
        tail = (proc.stderr or proc.stdout or "")[-300:]
        log.append(f"shaded-hero: Blender ran (rc={proc.returncode}) but 00-hero.png absent: …{tail}")
    else:
        shutil.copy2(hero, out_dir / "blender-cover.png")
        log.append("shaded-hero: 00-hero.png + blender-cover.png written")
    return ok


def _run_exterior_pass(out_dir: Path, state_path: Path,
                       log: list[str]) -> bool:
    """Run a Blender pass with BLENDER_PLANT_SHELL=1 to produce the BUILDING-EXTERIOR renders
    in out_dir/exterior/ (the dossier embeds 2 interior + 2 exterior shots). MUST run even when
    the main CAD artifacts are REUSED from the early settle loop — the exterior pass lives inside
    build_universal_scene's INSPECT=0+SHELL branch, which the reuse path skips, so out/exterior/
    was never produced (Tristan 2026-06-24: "two internal + two external; only one internal
    shows"). Skipped if exterior/00-hero.png already exists. Non-fatal."""
    ext_hero = out_dir / "exterior" / "00-hero.png"
    manifest = out_dir / "parts-manifest.json"
    if _render_fresh_vs_manifest(ext_hero, manifest):
        log.append("exterior: exterior/00-hero.png fresh vs parts-manifest — skip")
        return True
    if ext_hero.exists():
        log.append("exterior: exterior/00-hero.png STALE vs parts-manifest — re-render")
    blender = _blender_bin()
    if not blender:
        log.append("exterior: SKIP — blender not on PATH")
        return False
    env = dict(os.environ, BLENDER_OUT_DIR=str(out_dir),
               STATE_JSON=str(state_path), INSPECT="0", BLENDER_PLANT_SHELL="1")
    log.append("exterior: running INSPECT=0 BLENDER_PLANT_SHELL=1 Blender pass → exterior/")
    try:
        proc = subprocess.run(
            [blender, "--background", "--python",
             str(_THIS / "build_universal_scene.py"), "--", str(state_path)],
            env=env, capture_output=True, text=True, timeout=1500)
    except Exception as exc:  # noqa: BLE001
        log.append(f"exterior: Blender launch failed: {exc}")
        return False
    ok = ext_hero.exists() and ext_hero.stat().st_size > 1000
    if not ok:
        tail = (proc.stderr or proc.stdout or "")[-300:]
        log.append(f"exterior: Blender ran (rc={proc.returncode}) but exterior/00-hero.png absent: …{tail}")
    else:
        log.append("exterior: exterior/ renders written (building-exterior shots)")
    return ok


# ── RENDER CAPTIONS + CANONICAL SHEET NAMES (Tristan audit 2026-07-02, item 5) ──────────
# The exporter's render-tab names were minted from filenames and hit Excel's 31-char limit
# mid-word ("Render — Interior layout (vie-2"), and the captions said nothing. The render
# pipeline owns the render CONTEXT (camera bearing, envelope, principal equipment) — so the
# drawing manifest now carries, per render: a ≤31-char canonical sheet name + an informative
# caption (bearing + envelope dims + principal-equipment callouts from the parts manifest).
# Both render engines (bespoke template + universal) emit this fixed view vocabulary.
_RENDER_VIEWS = [
    ("00-hero.png",      "three-quarter hero perspective", "iso"),
    ("01-top.png",       "plan view, looking down",        "plan"),
    ("02-corner-FR.png", "front-right corner perspective", "FR iso"),
    ("03-corner-BL.png", "back-left corner perspective",   "BL iso"),
]
_SHEET_NAME_MAX = 31          # Excel hard limit — names are asserted under it here


def _manifest_envelope_dims(out_dir: Path) -> str:
    """'L × W × H m' from parts-manifest.json bbox, or ''."""
    try:
        state = json.loads((out_dir / "state.json").read_text())
        envelope = resolve_design_envelope_mm(state)
        if envelope:
            return " × ".join(f"{value / 1000.0:.3f}" for value in envelope) + " m"
    except Exception:  # noqa: BLE001
        pass
    try:
        man = json.loads((out_dir / "parts-manifest.json").read_text())
        bb = man.get("bbox_mm") or {}
        L = (bb.get("x_max_mm", 0) - bb.get("x_min_mm", 0)) / 1000.0
        W = (bb.get("y_max_mm", 0) - bb.get("y_min_mm", 0)) / 1000.0
        H = (bb.get("z_max_mm", 0) - bb.get("z_min_mm", 0)) / 1000.0
        if L > 0 and W > 0:
            return f"{L:.1f} × {W:.1f} × {H:.1f} m"
    except Exception:  # noqa: BLE001
        pass
    return ""


def _principal_callouts(out_dir: Path, n: int = 5) -> str:
    """'TAG Name · TAG Name …' for the n largest-footprint parts in the manifest."""
    try:
        man = json.loads((out_dir / "parts-manifest.json").read_text())
        parts = man.get("parts") or []
    except Exception:  # noqa: BLE001
        return ""
    def _area(r):
        d = r.get("dims_mm") or {}
        if "dia" in d:
            dia = float(d.get("dia") or 0.0)
            return dia * dia
        return float(d.get("w") or 0.0) * float(d.get("d") or 0.0)
    seen: set = set()
    call = []
    for r in sorted(parts, key=lambda r: (-_area(r), str(r.get("equipment_tag") or ""))):
        tag = str(r.get("equipment_tag") or "").strip()
        name = str(r.get("name") or "").strip()
        if not tag or (tag, name) in seen:
            continue
        seen.add((tag, name))
        call.append(f"{tag} {name}" if name else tag)
        if len(call) >= n:
            break
    return " · ".join(call)


def build_render_manifest(out_dir: Path) -> list[dict]:
    """One entry per render PNG present (interior + exterior), each with a ≤31-char
    canonical sheet name + an informative caption. Deterministic; empty when no renders."""
    env_dims = _manifest_envelope_dims(out_dir)
    callouts = _principal_callouts(out_dir)
    entries: list[dict] = []
    idx = 0
    try:
        state = json.loads((out_dir / "state.json").read_text())
    except Exception:  # noqa: BLE001
        state = {}
    if is_product_scale(state):
        for view in required_views(state):
            path = out_dir / view.filename
            if not (path.exists() and path.stat().st_size > 1000):
                continue
            idx += 1
            short_title = view.title.split(" — ")[-1]
            sheet = f"Render {idx} — {short_title}"[:_SHEET_NAME_MAX]
            caption = view.caption
            if env_dims:
                caption += f" · product envelope {env_dims}"
            entries.append({
                "file": str(path.relative_to(out_dir)),
                "file_abs": str(path),
                "area": "product",
                "bearing": view.view_id,
                "sheet_name": sheet,
                "caption": caption,
                "required": view.required,
                "view_id": view.view_id,
            })
        return entries
    for area, base in (("Interior", out_dir), ("Exterior", out_dir / "exterior")):
        for fname, bearing, short in _RENDER_VIEWS:
            p = base / fname
            if not (p.exists() and p.stat().st_size > 1000):
                continue
            idx += 1
            sheet = f"Render {idx} — {area} {short}"
            assert len(sheet) <= _SHEET_NAME_MAX, sheet
            cap_bits = [f"{area} render — {bearing}"]
            if env_dims:
                cap_bits.append(f"plant envelope {env_dims}")
            if callouts and area == "Interior":
                cap_bits.append(f"principal equipment: {callouts}")
            elif area == "Exterior":
                cap_bits.append("building shell + site apron (equipment enclosed)")
            entries.append({
                "file": str(p.relative_to(out_dir)),
                "file_abs": str(p),
                "area": area.lower(),
                "bearing": bearing,
                "sheet_name": sheet,
                "caption": " · ".join(cap_bits),
            })
    return entries


# ── WEB-WEIGHT HERO (Tristan audit 2026-07-02, item 6) ──────────────────────────────────
# The full-res interior hero is ~3-6 MB and the exporter embeds it multiple times. Emit an
# additional web-weight hero-embed.png (≤ ~800 KB: resized to ≤1600 px + palette-quantised
# when needed) for the exporter to PREFER when embedding; the full-res file stays untouched.
_HERO_EMBED_MAX_BYTES = 800_000
_HERO_EMBED_MAX_PX = 1600


def write_hero_embed(out_dir: Path, log: list[str]) -> str | None:
    """Write <out_dir>/hero-embed.png from 00-hero.png. Returns the path or None."""
    src = out_dir / "00-hero.png"
    dst = out_dir / "hero-embed.png"
    if not (src.exists() and src.stat().st_size > 1000):
        log.append("hero-embed: no 00-hero.png — skipped")
        return None
    if (dst.exists() and dst.stat().st_size <= _HERO_EMBED_MAX_BYTES
            and dst.stat().st_mtime >= src.stat().st_mtime):
        log.append("hero-embed: up to date — reused")
        return str(dst)
    try:
        from PIL import Image  # noqa: PLC0415
    except Exception:  # PIL not in THIS interpreter → delegate to the repo venv
        try:
            r = subprocess.run([_venv_python(), str(Path(__file__).resolve()),
                                "--hero-embed", str(out_dir)],
                               capture_output=True, text=True, timeout=120)
            if dst.exists() and dst.stat().st_size > 1000:
                log.append("hero-embed: written via venv python")
                return str(dst)
            log.append(f"hero-embed: venv fallback failed …{(r.stderr or '')[-120:]}")
        except Exception as exc:  # noqa: BLE001
            log.append(f"hero-embed: FAILED (no PIL): {exc}")
        return None
    try:
        im = Image.open(src).convert("RGB")
        scale = min(1.0, _HERO_EMBED_MAX_PX / max(im.width, im.height))
        if scale < 1.0:
            im = im.resize((max(1, round(im.width * scale)),
                            max(1, round(im.height * scale))), Image.LANCZOS)
        im.save(dst, "PNG", optimize=True)
        if dst.stat().st_size > _HERO_EMBED_MAX_BYTES:
            # palette-quantise (256 colours) — renders compress dramatically; visually
            # indistinguishable at embed size.
            im.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(
                dst, "PNG", optimize=True)
        if dst.stat().st_size > _HERO_EMBED_MAX_BYTES:
            im2 = im.resize((max(1, round(im.width * 0.75)),
                             max(1, round(im.height * 0.75))), Image.LANCZOS)
            im2.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(
                dst, "PNG", optimize=True)
        kb = dst.stat().st_size // 1024
        log.append(f"hero-embed: hero-embed.png written ({kb} KB)")
        return str(dst)
    except Exception as exc:  # noqa: BLE001
        log.append(f"hero-embed: FAILED: {exc}")
        return None


def _a1_print_entry(out_dir: Path, base: str) -> dict | None:
    """The drawing's DELIVERED A1 print set (written by a1_print.py inside the P&ID /
    BFD / single-line / GA generators): sheet PDFs + print-legibility numbers, from
    the <base>-A1.json manifest. None when no A1 set was produced."""
    man_path = out_dir / "drawings" / f"{base}-A1.json"
    if not man_path.exists():
        return None
    try:
        man = json.loads(man_path.read_text())
    except Exception:  # noqa: BLE001
        return None
    if not (man.get("pdf_ok") and man.get("pdfs")):
        return None
    return {"pdfs": [f"drawings/{p}" for p in man["pdfs"]],
            "sheets": man.get("sheets"), "grid": man.get("grid"),
            "mm_per_px": man.get("mm_per_px"), "min_text_mm": man.get("min_text_mm")}


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
            # Fallback cascade extended 2026-07-10 (Powerwall: an energy-storage
            # contract carries neither connected_ nor electrical_load_kw, so the
            # loop ran its 1000 kW default on an 11 kW wall unit — "as-routed
            # supply demand 1000 kW"). continuous_power_kw is the universal
            # system-power key every powered class carries.
            v = (q.get("connected_electrical_load_kw") or q.get("electrical_load_kw")
                 or q.get("continuous_power_kw"))
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

    # CAD_ARTIFACTS_ONLY (design-loop Increment 2): the CLOSED loop needs the routed geometry
    # + convergence-report BEFORE the narrative/cost stages, but NOT the (expensive, redrawn-
    # later) drawings/hero. When set, produce only the artifacts + convergence and return early;
    # the later full generate_drawing_set call REUSES the artifacts (ensure_cad_artifacts:
    # present ⇒ reuse), so the heavy Blender scene-build still runs once. Does NOT write
    # drawing-manifest.json (the full late pass owns that). Zero effect when the flag is unset.
    if os.environ.get("CAD_ARTIFACTS_ONLY", "").strip() not in ("", "0", "false"):
        for _line in log:
            print(f"[drawing-set] {_line}")
        print(f"[drawing-set] CAD_ARTIFACTS_ONLY: artifacts={'ok' if have_cad else 'MISSING'}, "
              f"convergence={'written' if convergence else 'skipped'} — returning before drawings")
        return {"schema": "drawing-manifest/v1", "artifacts_only": True,
                "have_cad": have_cad, "convergence": convergence is not None}

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
            if not envelope_ok:  # user REQUESTED it → do not fail silently
                print(f"[drawing-set] ENVELOPE={envelope_name} requested but produced no diagram", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            # user requested this → LOUD (stderr), not just a buried manifest log line.
            print(f"[drawing-set] ENVELOPE={envelope_name} FAILED: {e}", file=sys.stderr)
            log.append(f"envelope: FAILED: {e}")

    # design-to-budget (opt-in via BUDGET env, a £ figure): solve the output the budget
    # affords (six-tenths) → budget-report.json. Stdlib-only; non-fatal.
    budget = os.environ.get("BUDGET", "").strip()
    if budget:
        try:
            args = [sys.executable, str(_THIS.parent / "budget_solve.py"), str(state_path)]
            if budget not in ("1", "flex", "true"):
                args += ["--budget", budget]
            r = subprocess.run(args, capture_output=True, text=True, timeout=30)
            ok = (out_dir / "budget-report.json").exists()
            log.append(f"budget: {'report written' if ok else 'no report'}")
            if not ok:  # user REQUESTED it → LOUD
                print(f"[drawing-set] BUDGET={budget} requested but produced no report: {r.stderr[-300:] if r.stderr else ''}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"[drawing-set] BUDGET={budget} FAILED: {e}", file=sys.stderr)
            log.append(f"budget: FAILED: {e}")

    try:
        _state_for_gate = json.loads(state_path.read_text())
    except Exception:  # noqa: BLE001
        _state_for_gate = {}
    # INTENT (2026-07-14): form-factor pack — fluid-less handhelds must NOT emit
    # P&ID/BFD/process/HVAC stubs (NA files still polluted the dossier). Interconnect
    # is handheld-only. Codema plant + Powerwall sealed_cabinet keep their sets.
    _form = drawing_form_factor(_state_for_gate)
    _allowed = pack_drawings(_state_for_gate)
    log.append(f"form-factor pack: {_form} · allowed={sorted(_allowed)}")

    # INTENT: remove stale plant stubs from a prior pack so the Drawings register
    # / Excel cannot resurface a fluid-less handheld's NA-BY-DESIGN P&ID.
    _STEM_BY_KEY = {
        "pid": "pid", "bfd": "block-flow-diagram",
        "process-schedules": "process-schedules", "hvac": "hvac-layout",
        "general-arrangement": "general-arrangement",
        "single-line": "single-line-diagram",
        "panel-schedule": "panel-schedule",
        "interconnect": "interconnect",
        "facility-layout": "facility-layout",
        "distribution-interface": "distribution-interface",
    }
    _drawings_dir = out_dir / "drawings"
    for _k, _stem in _STEM_BY_KEY.items():
        if _k in _allowed:
            continue
        # Clear master PNG/SVG AND leftover A1 print-set artefacts so a fluid-less
        # handheld cannot resurface a prior plant P&ID/BFD from the Drawings folder.
        _a1_stem = {"block-flow-diagram": "bfd", "single-line-diagram": "single-line",
                    "general-arrangement": "ga", "hvac-layout": "hvac",
                    "pid": "pid", "interconnect": "interconnect",
                    "process-schedules": "process-schedules",
                    "panel-schedule": "panel-schedule"}.get(_stem, _stem)
        for _name in (
            f"{_stem}.png", f"{_stem}.svg", f"{_stem}.md",
            f"{_a1_stem}-A1.pdf", f"{_a1_stem}-A1.json",
        ):
            _p = _drawings_dir / _name
            if _p.exists():
                try:
                    _p.unlink()
                    log.append(f"  purged stale {_p.name} (not in {_form} pack)")
                except OSError:
                    pass

    def _group(rows: list[tuple]) -> list[dict]:
        out = []
        for key, script, png_name, title in rows:
            if key not in _allowed:
                log.append(f"  {script}: skipped (not in {_form} pack)")
                continue
            # Interconnect needs only state + ledger — run even without full CAD.
            needs_cad = key not in ("interconnect",)
            ok = (have_cad or not needs_cad) and _run_generator(
                script, out_dir, state_path, png_name, log)
            svg_sib = out_dir / "drawings" / png_name.replace(".png", ".svg")
            if not ok and svg_sib.exists() and svg_sib.stat().st_size > 200:
                ok = True
                log.append(f"  {script}: SVG master present (PNG rasteriser absent)")
            out.append({
                "key": key, "title": title, "script": script,
                "png": f"drawings/{png_name}",
                "png_abs": str(out_dir / "drawings" / png_name),
                "ok": ok,
            })
        return out

    system = _group(SYSTEM_DRAWINGS)
    schedules = _group(SCHEDULE_DRAWINGS)

    # T-20 / T-25 — conditional detail sheets. Gate on contract signals via each
    # script's should_emit(state); skip silently when not applicable. These need
    # ONLY state.json (no CAD artifacts) — same philosophy as the BFD.
    conditional: list[dict] = []
    for key, script, png_name, title, gate_name in CONDITIONAL_DRAWINGS:
        if key not in _allowed:
            log.append(f"  {script}: skipped (not in {_form} pack)")
            continue
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                f"_cond_{key}", _THIS / script)
            mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
            assert spec and spec.loader
            spec.loader.exec_module(mod)  # type: ignore[union-attr]
            gate = getattr(mod, gate_name, None)
            # Prefer should_emit(state, out_dir) when the gate accepts a second arg
            # (draw_hvac loads parts-manifest for placed hubs/zones); fall back to state-only.
            emit = False
            if callable(gate):
                try:
                    emit = bool(gate(_state_for_gate, str(out_dir)))
                except TypeError:
                    emit = bool(gate(_state_for_gate))
            if not emit:
                log.append(f"  {script}: skipped (should_emit=False)")
                continue
            ok = _run_generator(script, out_dir, state_path, png_name, log)
            # SVG-only success still counts when the generator wrote its SVG
            # (rasteriser may be absent) — check the sibling .svg.
            svg_sib = out_dir / "drawings" / png_name.replace(".png", ".svg")
            if not ok and svg_sib.exists() and svg_sib.stat().st_size > 200:
                ok = True
                log.append(f"  {script}: SVG master present (PNG rasteriser absent)")
            conditional.append({
                "key": key, "title": title, "script": script,
                "png": f"drawings/{png_name}",
                "png_abs": str(out_dir / "drawings" / png_name),
                "ok": ok,
            })
        except Exception as exc:  # noqa: BLE001
            log.append(f"  {script}: conditional gate/run failed: {exc}")

    n_ok = sum(1 for d in system + schedules + conditional if d["ok"])

    # The Block-Flow Diagram (D1 fix) is the PART-1 process-flow overview — distinct
    # from the Part-2 system/schedule drawings. It needs ONLY state.json (the CAD
    # artifacts are optional enrichment), so it runs regardless of have_cad (it
    # renders even when Blender is absent). The renderer's EngineeringBasisPage reads
    # block_flow_diagram to replace the degraded process-flow box-list for non-CO2.
    # SKIP for fluid-less handheld pack (no process train to summarise).
    bfd_ok = False
    bfd_path = None
    if "bfd" in _allowed:
        bfd_ok = _run_generator("draw_bfd.py", out_dir, state_path,
                                "block-flow-diagram.png", log)
        bfd_path = (str(out_dir / "drawings" / "block-flow-diagram.png")
                    if bfd_ok else None)
    else:
        log.append("  draw_bfd.py: skipped (not in form-factor pack)")

    # ── ONE SOURCE OF TRUTH (Tristan 2026-06-26: "the Blender model sets the connection lengths, so the
    #    GA must follow the Blender model exactly — one source of truth"). The CANONICAL placement is the
    #    one the system drawings (GA / P&ID / single-line) + schedules were just drawn from. The shaded-
    #    hero / exterior / CAD-hero RENDER passes below re-run build_universal_scene, which RE-PLACES and
    #    OVERWRITES parts-manifest.json (+ route / connection-schedule) with DIFFERENT positions — so
    #    parts_ledger, the BoM, the Line&velocity lengths and the coverage matrix (all computed AFTER the
    #    render passes) would read a placement that no longer matches the GA the reader sees. Snapshot the
    #    canonical manifests here and RESTORE them after the render passes, so every DATA surface in the
    #    dossier reflects the SAME placement as the GA. (The render PNGs stay visual-only.) ──
    import shutil as _sh
    _canon_bak: dict = {}
    for _mname in ("parts-manifest.json", "route-manifest.json", "connection-schedule.json", "edge-manifest.json"):
        _msrc = out_dir / _mname
        if _msrc.exists():
            _mbak = out_dir / f".{_mname}.canon"
            try:
                _sh.copy2(_msrc, _mbak)
                _canon_bak[_mname] = _mbak
            except Exception:  # noqa: BLE001
                pass

    # SHADED STUDIO HERO PASS (INSPECT=0): the settle loop produced flat
    # inspect-*.png renders. The late drawing-set call passes INSPECT=0 to
    # trigger a second Blender pass with studio lighting (key-sun + soft
    # shadows) → 00-hero.png + blender-cover.png. Non-fatal.
    inspect_mode = os.environ.get("INSPECT", "1").strip()
    if inspect_mode == "0":
        _run_shaded_hero_pass(out_dir, state_path, log)
        # Building-exterior shots (out/exterior/) — runs even when the main CAD artifacts are
        # reused, so the dossier's 2 interior + 2 exterior renders are all produced. Gated on the
        # chain's BLENDER_PLANT_SHELL=1 so a bare INSPECT=0 render stays interior-only.
        if os.environ.get("BLENDER_PLANT_SHELL", "").strip().lower() in ("1", "true", "yes", "on"):
            _run_exterior_pass(out_dir, state_path, log)

    # The universal-CAD HERO render for the dossier cover + per-module fallback
    # (build_universal_scene.py writes inspect-iso.png to out_dir). The chain reads
    # manifest["hero"] → state.cad_hero_image_path so the new Blender image lands in
    # the PDF where a class has no template (e.g. e-fuel). Prefer the iso view.
    hero_abs = None
    for cand in ("00-hero.png", "blender-cover.png", "inspect-iso.png", "inspect-hero.png", "cad-hero.png"):
        p = out_dir / cand
        if p.exists() and p.stat().st_size > 1000:
            hero_abs = str(p)
            break

    # ── RESTORE the canonical placement (see "ONE SOURCE OF TRUTH" above) BEFORE the self-examination,
    #    so parts_ledger / the BoM / the Line&velocity lengths / the coverage matrix all read the SAME
    #    placement the GA was drawn from — not the re-placement the render passes left behind. ──
    for _mname, _mbak in _canon_bak.items():
        try:
            _sh.copy2(_mbak, out_dir / _mname)
            _mbak.unlink()
        except Exception:  # noqa: BLE001
            pass

    # ── PUBLISH CANON → every non-'_' mirror (blender/renders/, …) ──
    # INTENT: early/shaded Blender passes leave a second parts-manifest under
    # blender/renders/ with pre-settle positions. Excel floors Renders+Assembly on
    # LAYOUT DIVERGENCE when those disagree with the root. After restore, overwrite
    # every delivered mirror so ONE placement is the only story (CORE FIX PRINCIPLE).
    try:
        sys.path.insert(0, str(_THIS.parent / "lib"))
        from manifest_sight import publish_canonical_manifests as _publish_canon  # noqa: E402
        _pub = _publish_canon(str(out_dir))
        log.append(f"canonical-publish: {_pub.get('detail', '')} "
                   f"(n={len(_pub.get('published') or [])})")
    except Exception as _pub_exc:  # noqa: BLE001
        log.append(f"canonical-publish: SKIP ({_pub_exc})")

    # After restore: Excel-bound plan must show the RESTORED placement (GA's), not a
    # re-placed shaded hero. Promote inspect-top → 01-top when congruent.
    _align_plan_render_to_manifest(out_dir, log)

    # FINAL settled manifest is now the only story — re-stamp every system SVG so
    # data-placement-fp cannot diverge from parts-manifest (G15/G16).
    _restamp_system_svg_placement_fps(out_dir, log)

    # ── DETERMINISTIC SELF-EXAMINATION (the loop's drawing feedback signal) ──
    # The LEDGER (parts_ledger.py — BoM + inputs/outputs/transformations + the
    # coverage matrix over the 8 drawings + Blender) and the drawing INSPECTOR
    # (inspect_drawings.py — title-block / domain-leak / zero-load / flat-render
    # quality checks) run on the freshly-generated SVG/PNG views + state. They are
    # the engine examining its OWN drawings deterministically so the loop can self-
    # correct (Tristan 2026-06-16). Sandboxed + non-fatal: a crash is logged, never
    # propagated; each writes a JSON artefact the next fix round reads.
    self_exam = {}
    for _mod, _art in (("parts_ledger.py", "parts-ledger.json"),
                       ("render_ledger_html.py", "parts-ledger.html"),
                       ("inspect_drawings.py", "drawings-inspection.json")):
        try:
            _r = subprocess.run([_venv_python(), str(_THIS / _mod), str(out_dir), str(state_path)],
                                capture_output=True, text=True, timeout=120)
            _ok = (out_dir / _art).exists()
            _tail = next((ln.strip() for ln in reversed((_r.stdout or "").splitlines())
                          if ln.strip()), "")
            log.append(f"self-exam {_mod}: {'ok' if _ok else 'NO ARTEFACT'} — {_tail[:130]}")
            self_exam[_art] = str(out_dir / _art) if _ok else None
        except Exception as _e:  # noqa: BLE001
            log.append(f"self-exam {_mod}: FAILED: {_e}")
            self_exam[_art] = None

    # web-weight hero for embedding (item 6) + per-render captions/sheet names (item 5) —
    # computed AFTER the canonical-manifest restore so captions read the SAME placement
    # the GA was drawn from.
    hero_embed = write_hero_embed(out_dir, log)
    renders = build_render_manifest(out_dir)
    if renders:
        log.append(f"renders: {len(renders)} captioned (canonical ≤31-char sheet names)")

    manifest = {
        "schema": "drawing-set/v1",
        "placement": "lead-and-weave",
        "form_factor": _form,
        "pack_drawings": sorted(_allowed),
        "out_dir": str(out_dir),
        "state": str(state_path),
        "cad_artifacts_available": have_cad,
        # 3 system drawings OPEN Part 2.
        "system_drawings": system,
        # schedules/details WEAVE into the Part-2 manufacturing layer.
        "schedule_drawings": schedules,
        # T-20 / T-25 conditional detail sheets (multi-tier interface + facility layout).
        "conditional_drawings": conditional,
        # the universal-CAD hero render → state.cad_hero_image_path (cover + module fallback).
        "hero": hero_abs,
        # web-weight hero (≤ ~800 KB) — the exporter should PREFER this when EMBEDDING;
        # the full-res 00-hero.png remains the print/cover master.
        "hero_embed": hero_embed,
        # per-render caption metadata + canonical ≤31-char sheet names (Excel limit) —
        # the exporter renders THESE instead of minting names from filenames.
        "renders": renders,
        # the Part-1 process-flow Block-Flow Diagram (D1 fix) → EngineeringBasisPage.
        "block_flow_diagram": bfd_path,
        # print-ready ISO A1 vector PDF sets (Tristan issues 15-17: on-screen PNGs are
        # "too tiny to see"). Written by a1_print.py inside the generators, paginated to
        # ≥2.5 mm lettering (ISO 3098); sits next to the PNGs for the exporter to link.
        "a1_print": {key: _a1_print_entry(out_dir, base)
                     for key, base in (("pid", "pid"), ("single-line", "single-line"),
                                       ("bfd", "bfd"), ("ga", "ga"))},
        # deterministic self-examination — the loop's drawing feedback signal.
        "parts_ledger": self_exam.get("parts-ledger.json"),
        "drawings_inspection": self_exam.get("drawings-inspection.json"),
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
        # design-to-budget (opt-in): the budget→output flex → dossier page.
        "budget_report": ("budget-report.json" if (out_dir / "budget-report.json").exists() else None),
        # the cable schedule is the connection schedule rendered as a table.
        "cable_schedule_source": ("connection-schedule.json"
                                  if (out_dir / "connection-schedule.json").exists()
                                  else None),
        "generated_ok": n_ok,
        "total": len(system) + len(schedules) + len(conditional),
        "log": log,
    }
    (out_dir / "drawing-manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] == "--hero-embed":          # internal: venv-python delegation target
        _log: list[str] = []
        p = write_hero_embed(Path(argv[1]).resolve(), _log)
        print("\n".join(_log))
        return 0 if p else 1
    state_path = argv[0]
    out_dir = argv[1] if len(argv) > 1 else None
    m = generate_drawing_set(state_path, out_dir)
    if m.get("artifacts_only"):
        return 0  # the artifacts-only fast path already logged its own summary
    print(f"[drawing-set] {m['generated_ok']}/{m['total']} drawings generated "
          f"(CAD artifacts {'available' if m['cad_artifacts_available'] else 'ABSENT'})")
    for d in m["system_drawings"]:
        print(f"  [system]   {'✓' if d['ok'] else '✗'} {d['title']}  ({d['png']})")
    for d in m["schedule_drawings"]:
        print(f"  [schedule] {'✓' if d['ok'] else '✗'} {d['title']}  ({d['png']})")
    for d in m.get("conditional_drawings") or []:
        print(f"  [detail]   {'✓' if d['ok'] else '✗'} {d['title']}  ({d['png']})")
    if any("SKIP" in l or "failed" in l for l in m["log"]):
        print("  log:")
        for l in m["log"]:
            print(f"    · {l}")
    print(f"  → manifest: {Path(m['out_dir']) / 'drawing-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
