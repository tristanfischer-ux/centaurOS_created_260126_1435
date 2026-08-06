#!/usr/bin/env python3
"""Pack-rebuild hooks: ensure geometry kernel + optional kernel hero film.

Called from build_send_pack.apply_send_pack_chrome so every Anvil send pack
can ship CAD master + film without a separate manual step.

Env:
  ANVIL_GEOMETRY_AUTO=1|0     (default 1) build geometry/ if missing or stale
  ANVIL_KERNEL_HERO=auto|1|0  (default auto) render hero suite when needed
  ANVIL_KERNEL_HERO_FORCE=1   force re-render even if 00-hero is fresh
  ANVIL_KERNEL_HERO_CYCLES=1  Cycles on 00-hero (default 1 in render script)
  ANVIL_FILM_DENSE=1          denser film meshes (default 1)

auto hero: run when Blender is available AND (no 00-hero OR 00-hero older than
geometry/assembly.json OR FORCE).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[2]


def _venv_python() -> str:
    py = ROOT / ".venv" / "bin" / "python"
    return str(py) if py.is_file() else sys.executable


def _find_blender() -> Optional[str]:
    for c in (
        os.environ.get("BLENDER_BIN"),
        "/Applications/Blender.app/Contents/MacOS/Blender",
        "blender",
    ):
        if not c:
            continue
        p = Path(c)
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
        which = shutil.which(c)
        if which:
            return which
    return None


def _truthy(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in (
        "1", "true", "yes", "on", "auto",
    )


def geometry_stale(twin: Path) -> bool:
    twin = Path(twin)
    step = twin / "geometry" / "assembly.step"
    ir = twin / "geometry" / "assembly.json"
    state = twin / "state.json"
    if not ir.is_file() or not step.is_file() or step.stat().st_size < 200:
        return True
    if state.is_file() and state.stat().st_mtime > ir.stat().st_mtime + 1:
        return True
    return False


def hero_stale(twin: Path) -> bool:
    twin = Path(twin)
    hero = twin / "00-hero.png"
    ir = twin / "geometry" / "assembly.json"
    if os.environ.get("ANVIL_KERNEL_HERO_FORCE", "").strip() in ("1", "true", "yes"):
        return True
    if not hero.is_file() or hero.stat().st_size < 50_000:
        return True
    if ir.is_file() and ir.stat().st_mtime > hero.stat().st_mtime + 1:
        return True
    man = twin / "kernel-hero-manifest.json"
    if not man.is_file():
        return True
    return False


def ensure_geometry_kernel(twin: Path, *, force: bool = False) -> dict[str, Any]:
    twin = Path(twin)
    if not force and not geometry_stale(twin):
        return {"ok": True, "skipped": True, "reason": "geometry fresh"}
    if not (twin / "state.json").is_file():
        return {"ok": False, "error": "no state.json"}
    cli = ROOT / "scripts" / "geometry-kernel-build.py"
    r = subprocess.run(
        [_venv_python(), str(cli), str(twin)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=600,
    )
    return {
        "ok": r.returncode == 0 and (twin / "geometry" / "assembly.json").is_file(),
        "returncode": r.returncode,
        "stdout_tail": (r.stdout or "")[-800:],
        "stderr_tail": (r.stderr or "")[-400:],
    }


def ensure_kernel_heroes(twin: Path, *, force: bool = False) -> dict[str, Any]:
    twin = Path(twin)
    mode = (os.environ.get("ANVIL_KERNEL_HERO") or "auto").strip().lower()
    if mode in ("0", "false", "no", "off"):
        return {"ok": True, "skipped": True, "reason": "ANVIL_KERNEL_HERO=0"}
    if mode == "auto" and not force and not hero_stale(twin):
        return {"ok": True, "skipped": True, "reason": "heroes fresh"}
    if mode not in ("1", "true", "yes", "on", "auto", "force"):
        return {"ok": True, "skipped": True, "reason": f"unknown mode {mode}"}

    blender = _find_blender()
    if not blender:
        return {"ok": False, "skipped": True, "reason": "blender not found"}

    # Ensure geometry first
    g = ensure_geometry_kernel(twin)
    if not g.get("ok") and not (twin / "geometry" / "assembly.json").is_file():
        return {"ok": False, "error": "geometry missing", "geometry": g}

    driver = ROOT / "scripts" / "geometry-kernel-hero-render.py"
    env = os.environ.copy()
    env["ANVIL_GEOMETRY_MASTER"] = "kernel"
    env.setdefault("ANVIL_KERNEL_HERO_CYCLES", "1")
    env.setdefault("ANVIL_FILM_DENSE", "1")
    r = subprocess.run(
        [_venv_python(), str(driver), str(twin)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=3600,
    )
    hero = twin / "00-hero.png"
    return {
        "ok": r.returncode == 0 and hero.is_file() and hero.stat().st_size > 50_000,
        "returncode": r.returncode,
        "hero_bytes": hero.stat().st_size if hero.is_file() else 0,
        "stdout_tail": (r.stdout or "")[-600:],
        "blender": blender,
    }


def ensure_geometry_and_heroes_for_pack(twin: Path) -> dict[str, Any]:
    """Entry used by send-pack chrome. Safe to call repeatedly."""
    twin = Path(twin)
    report: dict[str, Any] = {"twin": twin.name, "actions": []}

    auto = (os.environ.get("ANVIL_GEOMETRY_AUTO") or "1").strip().lower()
    if auto not in ("0", "false", "no", "off"):
        g = ensure_geometry_kernel(twin)
        report["kernel"] = g
        report["kernel_built"] = not g.get("skipped")
        report["kernel_ok"] = bool(g.get("ok"))
        if g.get("skipped"):
            report["actions"].append("geometry_kernel:fresh")
        elif g.get("ok"):
            report["actions"].append("geometry_kernel:built")
        else:
            report["actions"].append(f"geometry_kernel:fail:{g.get('error') or g.get('returncode')}")
    else:
        report["kernel_ok"] = (twin / "geometry" / "assembly.json").is_file()
        report["actions"].append("geometry_kernel:skipped_by_env")

    h = ensure_kernel_heroes(twin)
    report["hero"] = {k: h.get(k) for k in ("ok", "skipped", "reason", "hero_bytes", "returncode")}
    report["hero_ok"] = bool(h.get("ok"))
    report["hero_ran"] = not h.get("skipped")
    if h.get("skipped"):
        report["actions"].append(f"kernel_hero:{h.get('reason')}")
    elif h.get("ok"):
        report["actions"].append(f"kernel_hero:rendered:{h.get('hero_bytes')}B")
    else:
        report["actions"].append(f"kernel_hero:fail:{h.get('reason') or h.get('returncode')}")

    return report


def _selftest() -> None:
    assert geometry_stale  # callable
    # pure path: mode off
    os.environ["ANVIL_KERNEL_HERO"] = "0"
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        twin = Path(td)
        (twin / "state.json").write_text("{}")
        r = ensure_kernel_heroes(twin)
        assert r.get("skipped"), r
    os.environ.pop("ANVIL_KERNEL_HERO", None)
    print("geometry_pack_hooks selftest OK")


if __name__ == "__main__":
    _selftest()
