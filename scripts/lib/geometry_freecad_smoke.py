#!/usr/bin/env python3
"""FreeCAD / OCCT open-smoke for geometry/assembly.step (free stack).

Success: STEP opens and has ≥1 solid body (or named product).
Prefers FreeCADCmd when installed; falls back to CadQuery/OCCT XCAF reader
(same stack as blender-universal/export_step.py) so CI works without FreeCAD.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional

FREECAD_CANDIDATES = [
    os.environ.get("FREECADCMD"),
    "/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd",
    "/Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd",
    "freecadcmd",
    "FreeCADCmd",
    "freecad",
]


def find_freecadcmd() -> Optional[str]:
    for c in FREECAD_CANDIDATES:
        if not c:
            continue
        p = Path(c)
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
        which = shutil.which(c)
        if which:
            return which
    return None


def _smoke_freecad(step_path: Path, freecadcmd: str) -> dict[str, Any]:
    """Run FreeCADCmd headless import.

    FreeCAD 1.1: pass a script path as argv (works) or ``-c exec(open(...))``.
    """
    step_lit = str(step_path.resolve())
    script = (
        "import sys\n"
        f"step = r'''{step_lit}'''\n"
        "try:\n"
        "    import FreeCAD\n"
        "    import Import\n"
        "    doc = FreeCAD.newDocument('smoke')\n"
        "    Import.insert(step, doc.Name)\n"
        "    objs = list(doc.Objects)\n"
        "    n = len(objs)\n"
        "    solids = 0\n"
        "    for o in objs:\n"
        "        try:\n"
        "            sh = o.Shape\n"
        "            if hasattr(sh, 'Solids') and sh.Solids:\n"
        "                solids += len(sh.Solids)\n"
        "            elif hasattr(sh, 'Volume') and sh.Volume and sh.Volume > 0:\n"
        "                solids += 1\n"
        "        except Exception:\n"
        "            pass\n"
        "    try:\n"
        "        FreeCAD.closeDocument(doc.Name)\n"
        "    except Exception:\n"
        "        pass\n"
        "    sys.stdout.write('FREECAD_SMOKE_OK %d %d\\n' % (n, solids))\n"
        "    sys.stdout.flush()\n"
        "except Exception as e:\n"
        "    sys.stdout.write('FREECAD_SMOKE_FAIL %s %s\\n' % (type(e).__name__, e))\n"
        "    sys.stdout.flush()\n"
        "    raise SystemExit(1)\n"
    )
    sp = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix="_fc_smoke.py", delete=False) as fh:
            fh.write(script)
            sp = fh.name
        # Prefer exec(open) via -c so stdout is captured reliably
        r = subprocess.run(
            [freecadcmd, "-c", f"exec(open(r'{sp}').read())"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        out = (r.stdout or "") + "\n" + (r.stderr or "")
        if "FREECAD_SMOKE_OK" not in out:
            # Fallback: run script as argv
            r2 = subprocess.run(
                [freecadcmd, sp],
                capture_output=True,
                text=True,
                timeout=180,
            )
            out = (r2.stdout or "") + "\n" + (r2.stderr or "") + "\n" + out
            r = r2
        ok = "FREECAD_SMOKE_OK" in out
        m = re.search(r"FREECAD_SMOKE_OK\s+(\d+)\s+(\d+)", out)
        return {
            "ok": ok,
            "backend": "freecadcmd",
            "freecadcmd": freecadcmd,
            "returncode": r.returncode,
            "n_objects": int(m.group(1)) if m else None,
            "n_solids": int(m.group(2)) if m else None,
            "log_tail": out[-2000:],
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "backend": "freecadcmd",
            "freecadcmd": freecadcmd,
            "error": "timeout",
        }
    finally:
        if sp:
            try:
                os.unlink(sp)
            except OSError:
                pass


def _smoke_occt(step_path: Path) -> dict[str, Any]:
    """Re-open STEP via OCCT XCAF (CadQuery stack) — no FreeCAD required."""
    try:
        # Prefer shared reader from export_step
        scripts = Path(__file__).resolve().parents[1]
        bu = scripts / "blender-universal"
        if str(bu) not in sys.path:
            sys.path.insert(0, str(bu))
        from export_step import read_step_assembly  # type: ignore

        leaves = read_step_assembly(str(step_path))
        names = [l.get("name") for l in leaves[:20]]
        return {
            "ok": len(leaves) > 0,
            "backend": "occt_xcaf",
            "n_leaves": len(leaves),
            "names": names,
        }
    except Exception as exc:
        # Minimal: file is ISO-10303 and has MANIFOLD or PRODUCT
        try:
            head = step_path.read_text(encoding="utf-8", errors="replace")[:200_000]
        except OSError as e:
            return {"ok": False, "backend": "text", "error": str(e)}
        ok = "ISO-10303" in head and (
            "MANIFOLD_SOLID_BREP" in head or "PRODUCT(" in head
        )
        n_prod = len(re.findall(r"PRODUCT\(", head))
        return {
            "ok": ok,
            "backend": "text_heuristic",
            "n_product": n_prod,
            "error": str(exc) if not ok else None,
        }


def smoke_open_step(step_path: str | Path, *, prefer_freecad: bool = True) -> dict[str, Any]:
    step_path = Path(step_path)
    if not step_path.is_file():
        return {"ok": False, "error": f"missing {step_path}"}
    if step_path.stat().st_size < 200:
        return {"ok": False, "error": "STEP too small"}

    results = []
    if prefer_freecad:
        fc = find_freecadcmd()
        if fc:
            r = _smoke_freecad(step_path, fc)
            results.append(r)
            if r.get("ok"):
                return {**r, "path": str(step_path), "bytes": step_path.stat().st_size}

    r2 = _smoke_occt(step_path)
    results.append(r2)
    return {
        **r2,
        "path": str(step_path),
        "bytes": step_path.stat().st_size,
        "attempts": [{"backend": x.get("backend"), "ok": x.get("ok")} for x in results],
    }


def smoke_twin(twin: str | Path) -> dict[str, Any]:
    twin = Path(twin)
    step = twin / "geometry" / "assembly.step"
    return smoke_open_step(step)


def main(argv: Optional[list[str]] = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="FreeCAD/OCCT STEP open smoke")
    ap.add_argument("target", nargs="?", help="twin dir or .step path")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        # synthetic tiny STEP via geometry_step_export if available
        lib = Path(__file__).resolve().parent
        if str(lib) not in sys.path:
            sys.path.insert(0, str(lib))
        try:
            from geometry_step_export import export_step

            with tempfile.TemporaryDirectory() as td:
                p = Path(td) / "t.step"
                r = export_step(
                    {
                        "twin": "smoke",
                        "components": [
                            {
                                "tag": "X",
                                "name": "Box",
                                "export_name": "X_Box",
                                "geometry_kind": "solid",
                                "family": "box",
                                "params_mm": {"w": 10, "d": 10, "h": 5},
                                "pose": {"origin_mm": [0, 0, 0]},
                            }
                        ],
                        "paths": [],
                    },
                    p,
                )
                assert r.get("ok"), r
                s = smoke_open_step(p)
                assert s.get("ok"), s
                print("geometry_freecad_smoke selftest OK", s.get("backend"), s.get("n_leaves") or s.get("n_solids"))
                return 0
        except Exception as exc:
            print("geometry_freecad_smoke selftest FAIL", exc)
            return 1

    if not args.target:
        ap.error("target twin or step required")
    t = Path(args.target)
    report = smoke_twin(t) if t.is_dir() else smoke_open_step(t)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(
            f"smoke ok={report.get('ok')} backend={report.get('backend')} "
            f"path={report.get('path')} bytes={report.get('bytes')}"
        )
        if not report.get("ok"):
            print(report)
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
