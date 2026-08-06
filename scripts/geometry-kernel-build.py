#!/usr/bin/env python3
"""CLI: build Anvil geometry kernel (IR + paths + STEP) for a twin.

Usage:
  python3 scripts/geometry-kernel-build.py <twin_dir>
  python3 scripts/geometry-kernel-build.py <twin_dir> --strict
  python3 scripts/geometry-kernel-build.py <twin_dir> --no-step
  python3 scripts/geometry-kernel-build.py --selftest

Exit codes:
  0  IR written (and STEP if requested and available)
  2  missing inputs (no state.json)
  3  --strict and completeness binding_high (or STEP required and missing)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "scripts" / "lib"
if str(LIB) not in sys.path:
    sys.path.insert(0, str(LIB))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Anvil geometry kernel — CAD-first STEP master")
    ap.add_argument("twin", nargs="?", help="Twin directory with state.json")
    ap.add_argument("--strict", action="store_true", help="Exit 3 if completeness binding HIGH")
    ap.add_argument("--no-step", action="store_true", help="IR + completeness only")
    ap.add_argument("--no-paths", action="store_true", help="Skip path routing")
    ap.add_argument("--selftest", action="store_true", help="Run in-module selftests")
    ap.add_argument("--json", action="store_true", help="Print full report JSON")
    args = ap.parse_args(argv)

    if args.selftest:
        from geometry_ir import _selftest as t1
        from geometry_completeness import _selftest as t2
        from geometry_path_router import _selftest as t3
        from geometry_step_export import _selftest as t4
        from geometry_kernel import _selftest as t5
        from geometry_draw_sync import _selftest as t6
        from geometry_master import _selftest as t7
        from geometry_freecad_smoke import main as freecad_main
        from geometry_film_meshes import _selftest as t8
        from geometry_pack_hooks import _selftest as t9

        t1()
        t2()
        t3()
        t4()
        t5()
        t6()
        t7()
        t8()
        t9()
        assert freecad_main(["--selftest"]) == 0
        # film plan importer (no bpy required)
        import subprocess
        from pathlib import Path as _P

        imp = _P(__file__).resolve().parents[0] / "blender-universal" / "import_geometry_kernel.py"
        if not imp.is_file():
            imp = _P(__file__).resolve().parents[1] / "scripts" / "blender-universal" / "import_geometry_kernel.py"
        r = subprocess.run(
            [sys.executable, str(imp), "--selftest"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert r.returncode == 0, r.stderr or r.stdout
        print("geometry-kernel-build --selftest OK")
        return 0

    if not args.twin:
        ap.error("twin directory required (or --selftest)")

    twin = Path(args.twin).resolve()
    if not (twin / "state.json").is_file():
        print(f"error: missing {twin / 'state.json'}", file=sys.stderr)
        return 2

    from geometry_kernel import build_assembly_from_twin

    report = build_assembly_from_twin(
        twin,
        route_paths=not args.no_paths,
        export_step_file=not args.no_step,
    )
    comp = report.get("completeness") or {}
    step = report.get("step") or {}
    print(
        f"geometry: {twin.name}\n"
        f"  dir={report.get('geometry_dir')}\n"
        f"  solids={report.get('n_components')} paths={report.get('n_paths')} "
        f"holds={report.get('n_holds')}\n"
        f"  completeness={comp.get('score')}/10 binding_high={comp.get('binding_high')}\n"
        f"  step ok={step.get('ok')} bytes={step.get('bytes')} n_solids={step.get('n_solids')}\n"
        f"  print={report.get('print')}"
    )
    if comp.get("defects"):
        for d in comp["defects"][:6]:
            print(f"  · {d}")
    if args.json:
        print(json.dumps(report, indent=2, default=str))

    if args.strict and comp.get("binding_high"):
        print("error: --strict and completeness binding HIGH", file=sys.stderr)
        return 3
    if args.strict and not args.no_step and not step.get("ok"):
        print("error: --strict and STEP not ok", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
