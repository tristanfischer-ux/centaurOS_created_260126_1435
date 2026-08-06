#!/usr/bin/env python3
"""Driver: full hero re-render suite under ANVIL_GEOMETRY_MASTER=kernel.

Runs Blender headless on each twin, copies PNGs into pack renders/ when present.

Usage:
  .venv/bin/python scripts/geometry-kernel-hero-render.py <twin> [<twin> ...]
  .venv/bin/python scripts/geometry-kernel-hero-render.py --bio-fe
  .venv/bin/python scripts/geometry-kernel-hero-render.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLENDER_CANDIDATES = [
    os.environ.get("BLENDER_BIN"),
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "blender",
]
SCRIPT = ROOT / "scripts" / "blender-universal" / "render_kernel_heroes.py"


def find_blender() -> str:
    for c in BLENDER_CANDIDATES:
        if not c:
            continue
        p = Path(c)
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
        which = shutil.which(c)
        if which:
            return which
    raise SystemExit("Blender not found — set BLENDER_BIN")


def run_twin(twin: Path, *, cycles: bool = False, timeout: int = 3600) -> dict:
    twin = Path(twin).resolve()
    blender = find_blender()
    env = os.environ.copy()
    env["ANVIL_GEOMETRY_MASTER"] = "kernel"
    if cycles:
        env["BLENDER_HERO_CYCLES"] = "1"
    # Ensure geometry is fresh before Blender
    py = ROOT / ".venv" / "bin" / "python"
    if not py.is_file():
        py = Path(sys.executable)
    subprocess.run(
        [str(py), str(ROOT / "scripts" / "geometry-kernel-build.py"), str(twin)],
        cwd=str(ROOT),
        check=False,
        timeout=600,
    )
    cmd = [
        blender,
        "--background",
        "--python",
        str(SCRIPT),
        "--",
        str(twin),
    ]
    t0 = time.time()
    log_path = twin / "kernel-hero-render.log"
    with open(log_path, "w", encoding="utf-8") as log:
        r = subprocess.run(
            cmd,
            cwd=str(ROOT),
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
    elapsed = time.time() - t0
    man_path = twin / "kernel-hero-manifest.json"
    man = {}
    if man_path.is_file():
        man = json.loads(man_path.read_text(encoding="utf-8"))
    written = man.get("written") or []
    sizes = {}
    for name in written:
        p = twin / name
        if p.is_file():
            sizes[name] = p.stat().st_size
    # Copy into any design packs under twin
    pack_copied = []
    for pack in twin.glob("*-design-pack"):
        if not pack.is_dir():
            continue
        dest = pack / "renders"
        dest.mkdir(parents=True, exist_ok=True)
        for name in written:
            src = twin / name
            if src.is_file():
                shutil.copy2(src, dest / name)
                pack_copied.append(f"{pack.name}/{name}")
        # also top-level 00-hero for chrome discover
        if (twin / "00-hero.png").is_file():
            shutil.copy2(twin / "00-hero.png", pack / "00-hero.png")
    return {
        "twin": twin.name,
        "returncode": r.returncode,
        "elapsed_s": round(elapsed, 1),
        "n_written": len(written),
        "sizes": sizes,
        "hero_bytes": sizes.get("00-hero.png"),
        "log": str(log_path),
        "pack_copied": len(pack_copied),
        "ok": r.returncode == 0 and bool(sizes.get("00-hero.png", 0) > 10_000),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("twins", nargs="*", help="twin directories")
    ap.add_argument("--bio-fe", action="store_true", help="bio + FE default twins")
    ap.add_argument(
        "--cycles",
        action="store_true",
        default=None,
        help="Force Cycles for 00-hero (default already on via ANVIL_KERNEL_HERO_CYCLES=1)",
    )
    ap.add_argument("--eevee", action="store_true", help="Disable Cycles (fast draft)")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--timeout", type=int, default=3600)
    ap.add_argument("--force", action="store_true", help="Force re-render even if fresh")
    args = ap.parse_args(argv)

    if args.selftest:
        r = subprocess.run(
            [sys.executable, str(SCRIPT), "--selftest"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        print(r.stdout or r.stderr)
        return r.returncode

    twins: list[Path] = [Path(t) for t in args.twins]
    if args.bio_fe:
        twins.extend(
            [
                ROOT / "out" / "organoid-9drive-r11-allfixes",
                ROOT / "out" / "formula-e-front-mgu-20260729-1432",
            ]
        )
    twins = [t for t in twins if t.is_dir()]
    if not twins:
        ap.error("no twin dirs")

    if args.force:
        os.environ["ANVIL_KERNEL_HERO_FORCE"] = "1"
    if args.eevee:
        os.environ["ANVIL_KERNEL_HERO_CYCLES"] = "0"
        os.environ["BLENDER_HERO_CYCLES"] = "0"
        cycles = False
    elif args.cycles:
        os.environ["ANVIL_KERNEL_HERO_CYCLES"] = "1"
        cycles = True
    else:
        # default polish: Cycles on
        os.environ.setdefault("ANVIL_KERNEL_HERO_CYCLES", "1")
        cycles = os.environ.get("ANVIL_KERNEL_HERO_CYCLES", "1") not in ("0", "false", "no")
    os.environ.setdefault("ANVIL_FILM_DENSE", "1")

    results = []
    for t in twins:
        print(f"=== kernel hero render: {t.name} (cycles={cycles}) ===")
        try:
            res = run_twin(t, cycles=cycles, timeout=args.timeout)
        except subprocess.TimeoutExpired:
            res = {"twin": t.name, "ok": False, "error": "timeout"}
        except Exception as exc:
            res = {"twin": t.name, "ok": False, "error": str(exc)}
        results.append(res)
        print(json.dumps(res, indent=2))

    summary = ROOT / "out" / "kernel-hero-render-summary.json"
    summary.write_text(json.dumps({"results": results}, indent=2) + "\n")
    print(f"summary → {summary}")
    return 0 if all(r.get("ok") for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
