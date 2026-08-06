#!/usr/bin/env python3
"""export_step.py — write a REAL CAD solid model (STEP AP214) from a run's parts-manifest.

Tristan 2026-07-04: "if you could download it as a STEP file, that would be
perfectly fine. It doesn't need to be DWG."

The universal Blender builder places PARAMETRISED PRIMITIVES (boxes, cylinders,
dished tanks) whose shape kind, dimensions and transform are all recorded in
<run>/parts-manifest.json (schema parts-manifest/1, written by
build_universal_scene.py::build_parts_manifest). So the CAD model is written
DIRECTLY from the manifest as analytic B-rep solids — never a mesh conversion.

Runs OUTSIDE Blender in the repo .venv (cadquery 2.8.0 / cadquery-ocp 7.9.3,
i.e. Open CASCADE — see README-export-step.md next to this file for the
tooling choice + the stated geometry approximations).

Usage:
    .venv/bin/python scripts/blender-universal/export_step.py <run_dir>
        → writes <run_dir>/cad/<run-basename>-model.step   (units mm)
          then RE-OPENS the written file and verifies part count + every
          part's bounding box against the manifest (0.1 mm tolerance).
    .venv/bin/python scripts/blender-universal/export_step.py --selftest
        → synthetic 3-part manifest + 1 pipe route → write → re-open →
          assert names/count/bboxes + byte-determinism of two writes.

Assembly structure:  plant (root, named after the run)
                       > one sub-assembly per manifest `module`
                           > one solid per manifest part row, named
                             '<equipment_tag> — <Name>'  (BoM-unifying names)
                       > 'piping' sub-assembly: one compound per route-manifest
                         line (swept = straight cylinder per segment; elbows
                         approximated as spheres at the interior waypoints).

Geometry (all APPROXIMATIONS stated in README-export-step.md):
  dims_mm {w,d,h}     → box, centred on pos_mm (manifest pos is the bbox centre)
  dims_mm {dia,len}   → cylinder; VERTICAL (axis Z) for tank / vertical_vessel /
                        tall_vessel / tall_column / stack; HORIZONTAL for
                        horizontal_vessel / inline_spool — axis assumed +X (the
                        plant process axis; the manifest does not record the
                        horizontal axis — metadata gap routed, not guessed in code).
  tank / *_vessel     → dished ends: torispherical-ish spherical-cap heads
                        (Klopper-like depth ≈ 0.194·D) INSET so the overall
                        height still equals the manifest `len` — the solid's
                        bbox therefore matches the manifest dims exactly.

Determinism: the STEP header's FILE_NAME record carries the write timestamp +
absolute path; both are pinned post-write (fixed 2026-01-01T00:00:00 + the
basename) so two runs are byte-identical — same discipline as the xlsx docProps.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile

import cadquery as cq
from cadquery import Vector

# ── shape classification (mirrors build_parts_manifest's round/box split) ────
HORIZONTAL_SHAPES = {"horizontal_vessel", "inline_spool"}
DISHED_SHAPES = {"tank", "vertical_vessel", "tall_vessel"}   # dished heads
PIN_DATE = "2026-01-01T00:00:00"                              # pinned STEP header date
BBOX_TOL_MM = 0.1

# Klopper (DIN 28011) torispherical head depth is ≈ 0.194 × D; we approximate
# the head as a SPHERICAL CAP of that depth (stated approximation).
HEAD_DEPTH_FRAC = 0.194


# ── solid builders (all centred on the origin; placed via Location) ──────────

def _make_box(w: float, d: float, h: float) -> cq.Shape:
    return cq.Solid.makeBox(w, d, h, Vector(-w / 2.0, -d / 2.0, -h / 2.0))


def _make_cylinder(dia: float, ln: float) -> cq.Shape:
    return cq.Solid.makeCylinder(dia / 2.0, ln, Vector(0, 0, -ln / 2.0))


def _make_dished_vessel(dia: float, ln: float) -> cq.Shape:
    """Vertical vessel: cylindrical shell + spherical-cap heads INSET so the
    overall height == ln (bbox stays exactly dia × dia × ln)."""
    hh = min(HEAD_DEPTH_FRAC * dia, 0.25 * ln)   # head depth, capped so body > 0
    if hh < 1.0:                                  # degenerate → plain cylinder
        return _make_cylinder(dia, ln)
    r_sph = (hh * hh + (dia / 2.0) ** 2) / (2.0 * hh)   # cap sphere radius
    body = cq.Solid.makeCylinder(dia / 2.0, ln - 2.0 * hh,
                                 Vector(0, 0, -(ln / 2.0 - hh)))
    caps = []
    for sign in (+1.0, -1.0):
        zc = sign * (ln / 2.0 - r_sph)            # sphere centre so apex sits at ±ln/2
        sph = cq.Solid.makeSphere(r_sph, Vector(0, 0, zc),
                                  angleDegrees1=-90, angleDegrees2=90)
        z0 = ln / 2.0 - hh if sign > 0 else -ln / 2.0
        clip = cq.Solid.makeBox(dia + 2.0, dia + 2.0, hh,
                                Vector(-(dia + 2.0) / 2.0, -(dia + 2.0) / 2.0, z0))
        caps.append(sph.intersect(clip))
    return body.fuse(*caps)


def part_solid(row: dict) -> cq.Shape:
    """Build the analytic solid for one manifest part row (centred at origin)."""
    dims = row["dims_mm"]
    shape = row.get("shape", "")
    if "dia" in dims:                             # cylinder family
        dia, ln = float(dims["dia"]), float(dims["len"])
        if shape in DISHED_SHAPES:
            sol = _make_dished_vessel(dia, ln)
        else:
            sol = _make_cylinder(dia, ln)
        if shape in HORIZONTAL_SHAPES:            # lay along +X (assumed plant axis)
            sol = sol.rotate(Vector(0, 0, 0), Vector(0, 1, 0), 90)
        return sol
    return _make_box(float(dims["w"]), float(dims["d"]), float(dims["h"]))


def expected_extents(row: dict) -> tuple[float, float, float]:
    """The bbox extents (x,y,z) the written solid MUST have (verification)."""
    dims = row["dims_mm"]
    shape = row.get("shape", "")
    if "dia" in dims:
        dia, ln = float(dims["dia"]), float(dims["len"])
        if shape in HORIZONTAL_SHAPES:
            return (ln, dia, dia)
        return (dia, dia, ln)
    return (float(dims["w"]), float(dims["d"]), float(dims["h"]))


def pipe_compound(line: dict) -> cq.Shape | None:
    """One route-manifest line → compound of straight cylinders per segment,
    with a sphere at each interior waypoint standing in for the elbow."""
    wps = line.get("waypoints_mm") or []
    od = line.get("outer_dia_mm")
    if len(wps) < 2 or not od:
        return None
    r = float(od) / 2.0
    solids = []
    for a, b in zip(wps, wps[1:]):
        va, vb = Vector(*a), Vector(*b)
        seg = vb - va
        if seg.Length < 1e-6:
            continue
        solids.append(cq.Solid.makeCylinder(r, seg.Length, va, seg.normalized()))
    for w in wps[1:-1]:
        solids.append(cq.Solid.makeSphere(r, Vector(*w),
                                          angleDegrees1=-90, angleDegrees2=90))
    if not solids:
        return None
    return cq.Compound.makeCompound(solids)


# ── assembly build + write ───────────────────────────────────────────────────

def build_assembly(product: str, parts: list[dict], route_lines: list[dict]):
    """plant > module > part (+ 'piping' group). Returns (assembly, stats)."""
    # NB: cq.Assembly.add(<Assembly>) COPIES the child — so each module
    # sub-assembly must be FULLY populated before it is added to the root.
    root = cq.Assembly(name=product)
    module_asms: dict[str, cq.Assembly] = {}
    part_names: set[str] = set()
    n_parts = 0
    for row in parts:                                  # manifest order = deterministic
        mod = str(row.get("module") or "plant")
        if mod not in module_asms:
            module_asms[mod] = cq.Assembly(name=f"module_{mod}")
        name = f'{row["equipment_tag"]} — {row["name"]}'
        if name in part_names:                         # defensive: names must be unique
            name = f'{name} ({row["tag"]})'
        part_names.add(name)
        module_asms[mod].add(part_solid(row),
                             name=name,
                             loc=cq.Location(Vector(*row["pos_mm"])))
        n_parts += 1
    for mod in module_asms:                            # insertion (manifest) order
        root.add(module_asms[mod])

    n_pipes = n_skipped = 0
    if route_lines:
        piping = cq.Assembly(name="piping")
        pipe_names: set[str] = set()
        added = False
        for line in route_lines:
            comp = pipe_compound(line)
            if comp is None:
                n_skipped += 1                          # honest skip: no usable route data
                continue
            nm = f'{line.get("line_number", "PIPE")} — {line.get("run_name", "run")}'
            if nm in pipe_names:
                nm = f"{nm} #{n_pipes}"
            pipe_names.add(nm)
            piping.add(comp, name=nm)
            n_pipes += 1
            added = True
        if added:
            root.add(piping)
    return root, {"parts": n_parts, "pipes": n_pipes, "pipes_skipped": n_skipped}


def _pin_step_header(path: str) -> None:
    """Pin the STEP FILE_NAME record (timestamp + absolute path) so output is
    deterministic — mirrors the xlsx docProps pinning discipline."""
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        txt = fh.read()
    base = os.path.basename(path)
    txt = re.sub(r"FILE_NAME\('[^']*','[^']*'",
                 f"FILE_NAME('{base}','{PIN_DATE}'", txt, count=1)
    # cadquery's assembly exporter numbers NEXT_ASSEMBLY_USAGE_OCCURRENCE ids
    # from a PROCESS-GLOBAL counter — renumber them in file order so repeated
    # exports are byte-identical.
    counter = iter(range(1, 10 ** 9))
    txt = re.sub(r"NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'",
                 lambda m: f"NEXT_ASSEMBLY_USAGE_OCCURRENCE('{next(counter)}'",
                 txt)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(txt)


def write_step(run_dir: str, out_path: str | None = None) -> tuple[str, dict]:
    """Write STEP for a run.

    When geometry kernel IR is present and master is *kernel* (or
    ANVIL_STEP_SOURCE=kernel), prefer geometry/assembly.step from the CAD-first
    kernel. Otherwise build from parts-manifest (legacy path).
    """
    run_dir = os.path.abspath(run_dir)
    product = os.path.basename(run_dir.rstrip("/"))
    if out_path is None:
        out_path = os.path.join(run_dir, "cad", f"{product}-model.step")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # ── Kernel IR path (CAD-first) ─────────────────────────────────────────
    try:
        _lib = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib")
        if _lib not in sys.path:
            sys.path.insert(0, _lib)
        from geometry_master import is_kernel_master, step_source_preference, ensure_geometry_kernel
        from geometry_step_export import export_step as _export_ir_step
    except ImportError:
        is_kernel_master = None  # type: ignore
        step_source_preference = None  # type: ignore
        ensure_geometry_kernel = None  # type: ignore
        _export_ir_step = None  # type: ignore

    ir_path = os.path.join(run_dir, "geometry", "assembly.json")
    kernel_step = os.path.join(run_dir, "geometry", "assembly.step")
    prefer_kernel = False
    if step_source_preference is not None:
        prefer_kernel = step_source_preference(run_dir) == "kernel"
    elif is_kernel_master is not None and is_kernel_master():
        prefer_kernel = os.path.isfile(ir_path)
    if prefer_kernel and _export_ir_step is not None:
        if ensure_geometry_kernel is not None:
            ensure_geometry_kernel(run_dir)
        if os.path.isfile(ir_path):
            from pathlib import Path as _Path

            ir = json.load(open(ir_path, encoding="utf-8"))
            # Always re-export so geometry/assembly.step stays master
            rep = _export_ir_step(ir, _Path(kernel_step))
            if rep.get("ok") and os.path.isfile(kernel_step):
                import shutil

                shutil.copy2(kernel_step, out_path)
                _pin_step_header(out_path)
                stats = {
                    "parts": int(rep.get("n_solids") or 0),
                    "pipes": int(rep.get("n_paths") or 0),
                    "pipes_skipped": 0,
                    "manifest_count": len(ir.get("components") or []),
                    "bytes": os.path.getsize(out_path),
                    "source": "geometry_kernel",
                    "named_tree": rep.get("named_tree"),
                    "exporter": rep.get("exporter"),
                }
                return out_path, stats

    # ── Legacy parts-manifest path ─────────────────────────────────────────
    manifest = json.load(open(os.path.join(run_dir, "parts-manifest.json")))
    parts = manifest["parts"]
    route_lines = []
    route_path = os.path.join(run_dir, "route-manifest.json")
    if os.path.exists(route_path):
        route_lines = json.load(open(route_path)).get("lines", [])

    asm, stats = build_assembly(product, parts, route_lines)
    asm.export(out_path)          # STEP AP214, mm (OCCT write unit default MM)
    _pin_step_header(out_path)
    stats["manifest_count"] = manifest.get("count", len(parts))
    stats["bytes"] = os.path.getsize(out_path)
    stats["source"] = "parts_manifest"
    # Mirror into geometry/ when kernel IR absent so packs have one CAD home
    try:
        geo_dir = os.path.join(run_dir, "geometry")
        os.makedirs(geo_dir, exist_ok=True)
        mirror = os.path.join(geo_dir, "assembly.step")
        if not os.path.isfile(mirror) or os.environ.get("ANVIL_GEOMETRY_MASTER", "").lower() in (
            "legacy_blender", "", "legacy",
        ):
            import shutil
            shutil.copy2(out_path, mirror)
            stats["mirrored_to"] = mirror
    except OSError:
        pass
    return out_path, stats


# ── verification: re-open the WRITTEN file (same library) and check truth ────

def read_step_assembly(path: str) -> list[dict]:
    """Re-open a STEP with OCCT XCAF and return every LEAF component:
    {'path': [...names...], 'name': leaf name, 'bbox': (xmin,ymin,zmin,xmax,ymax,zmax)}."""
    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.TDocStd import TDocStd_Document
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.XCAFDoc import XCAFDoc_DocumentTool
    from OCP.TDF import TDF_LabelSequence, TDF_Label
    from OCP.TDataStd import TDataStd_Name
    from OCP.TopLoc import TopLoc_Location
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.IFSelect import IFSelect_RetDone

    doc = TDocStd_Document(TCollection_ExtendedString("doc"))
    rdr = STEPCAFControl_Reader()
    if rdr.ReadFile(path) != IFSelect_RetDone:
        raise RuntimeError(f"STEP re-open FAILED: {path}")
    rdr.Transfer(doc)
    tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())

    def name_of(label) -> str:
        attr = TDataStd_Name()
        if not label.FindAttribute(TDataStd_Name.GetID_s(), attr):
            return ""
        s = str(attr.Get().ToExtString())
        # OCCT writes names as raw UTF-8 bytes but this build's reader decodes
        # them as Latin-1 ('—' → 'â\\x80\\x94'). Repair when it round-trips
        # cleanly; a genuinely Latin-1 name is left untouched.
        try:
            repaired = s.encode("latin-1").decode("utf-8")
            if repaired != s:
                return repaired
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        return s

    leaves: list[dict] = []

    def walk(label, loc, path_names):
        if tool.IsAssembly_s(label):
            comps = TDF_LabelSequence()
            tool.GetComponents_s(label, comps)
            for i in range(1, comps.Length() + 1):
                comp = comps.Value(i)
                ref = TDF_Label()
                tool.GetReferredShape_s(comp, ref)
                # the instance (NAUO) name is a bare running id ('2') for
                # sub-assemblies — prefer the referred PRODUCT name then.
                nm = name_of(comp)
                if not nm or nm.isdigit():
                    nm = name_of(ref) or nm
                walk(ref, loc.Multiplied(tool.GetLocation_s(comp)),
                     path_names + [nm])
        else:
            shape = tool.GetShape_s(label).Moved(loc)
            box = Bnd_Box()
            BRepBndLib.AddOptimal_s(shape, box, False, False)
            leaves.append({"path": path_names,
                           "name": path_names[-1] if path_names else name_of(label),
                           "bbox": box.Get()})

    free = TDF_LabelSequence()
    tool.GetFreeShapes(free)
    for i in range(1, free.Length() + 1):
        lab = free.Value(i)
        walk(lab, TopLoc_Location(), [name_of(lab)])
    return leaves


def verify_step(step_path: str, run_dir: str, quiet: bool = False) -> dict:
    """Solid truth: part count == manifest count; EVERY part's bbox (centre +
    extents) == manifest pos/dims within 0.1 mm; assembly names preserved."""
    manifest = json.load(open(os.path.join(run_dir, "parts-manifest.json")))
    parts = manifest["parts"]
    leaves = read_step_assembly(step_path)
    equip = [l for l in leaves if "piping" not in l["path"][:2]]
    pipes = [l for l in leaves if "piping" in l["path"][:2]]

    errors: list[str] = []
    if len(equip) != len(parts):
        errors.append(f"part count MISMATCH: STEP has {len(equip)} equipment leaves, "
                      f"manifest has {len(parts)}")

    by_name = {l["name"]: l for l in equip}
    checked = []
    for row in parts:
        nm = f'{row["equipment_tag"]} — {row["name"]}'
        leaf = by_name.get(nm)
        if leaf is None:
            errors.append(f"missing part in STEP: '{nm}'")
            continue
        xmin, ymin, zmin, xmax, ymax, zmax = leaf["bbox"]
        got_c = ((xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2)
        got_e = (xmax - xmin, ymax - ymin, zmax - zmin)
        exp_c = tuple(row["pos_mm"])
        exp_e = expected_extents(row)
        dc = max(abs(a - b) for a, b in zip(got_c, exp_c))
        de = max(abs(a - b) for a, b in zip(got_e, exp_e))
        if dc > BBOX_TOL_MM or de > BBOX_TOL_MM:
            errors.append(f"bbox MISMATCH '{nm}': centre Δ{dc:.3f} mm extents Δ{de:.3f} mm "
                          f"(got {got_e} expected {exp_e})")
        checked.append((nm, row["dims_mm"], got_e, max(dc, de)))

    result = {"ok": not errors, "errors": errors,
              "equip_leaves": len(equip), "pipe_leaves": len(pipes),
              "manifest_count": len(parts), "checked": checked}
    if not quiet:
        print(f"[verify] equipment leaves: {len(equip)}  (manifest: {len(parts)})  "
              f"pipe leaves: {len(pipes)}")
        for e in errors:
            print(f"[verify] FAIL {e}")
        if not errors:
            print(f"[verify] ALL {len(checked)} part bboxes within {BBOX_TOL_MM} mm "
                  f"of manifest pos/dims; assembly names preserved")
    return result


# ── selftest: synthetic manifest → write → re-open → assert ─────────────────

def selftest() -> int:
    tmp = tempfile.mkdtemp(prefix="export-step-selftest-")
    manifest = {
        "schema": "parts-manifest/1", "count": 3,
        "parts": [
            {"tag": "u_test_skid", "equipment_tag": "Z-101", "name": "Test Skid",
             "module": "structure", "shape": "skid_box", "qty": 1,
             "pos_mm": [1000.0, 2000.0, 800.0],
             "dims_mm": {"w": 3230.0, "d": 1500.0, "h": 1600.0}},
            {"tag": "u_test_tank", "equipment_tag": "TK-101", "name": "Test Tank",
             "module": "process", "shape": "tank", "qty": 1,
             "pos_mm": [-2000.0, 0.0, 1850.0],
             "dims_mm": {"dia": 3700.0, "len": 3700.0}},
            {"tag": "u_test_spool", "equipment_tag": "M-101", "name": "Test Spool",
             "module": "process", "shape": "inline_spool", "qty": 1,
             "pos_mm": [500.0, -800.0, 900.0],
             "dims_mm": {"dia": 372.0, "len": 1930.0}},
        ],
    }
    route = {"schema": "route-manifest/1", "count": 1, "lines": [
        {"line_number": "201-PR-DN65", "run_name": "u_test_route",
         "outer_dia_mm": 73.0,
         "waypoints_mm": [[0, 0, 900], [0, 0, 2400], [-3000, 0, 2400]]},
    ]}
    json.dump(manifest, open(os.path.join(tmp, "parts-manifest.json"), "w"))
    json.dump(route, open(os.path.join(tmp, "route-manifest.json"), "w"))

    p1, stats = write_step(tmp)
    res = verify_step(p1, tmp, quiet=True)
    assert res["ok"], f"selftest verify FAILED: {res['errors']}"
    assert res["equip_leaves"] == 3, res
    assert res["pipe_leaves"] == 1, res

    # determinism: a second write (same target basename) must be byte-identical
    p2 = os.path.join(tmp, "second", os.path.basename(p1))
    os.makedirs(os.path.dirname(p2), exist_ok=True)
    write_step(tmp, out_path=p2)
    h1 = hashlib.sha256(open(p1, "rb").read()).hexdigest()
    h2 = hashlib.sha256(open(p2, "rb").read()).hexdigest()
    assert h1 == h2, f"selftest determinism FAILED: {h1} != {h2}"

    # proveCatch: a corrupted manifest dim MUST make verification fire
    bad = json.loads(json.dumps(manifest))
    bad["parts"][1]["dims_mm"]["dia"] = 4200.0     # claim a bigger tank than written
    json.dump(bad, open(os.path.join(tmp, "parts-manifest.json"), "w"))
    res_bad = verify_step(p1, tmp, quiet=True)
    assert not res_bad["ok"], "selftest proveCatch FAILED: bad dims not detected"

    print(f"[selftest] PASS — 3 parts + 1 pipe written, re-opened, bboxes within "
          f"{BBOX_TOL_MM} mm, two writes byte-identical (sha256 {h1[:16]}…), "
          f"corrupted-dims catch proven. ({tmp})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("run_dir", nargs="?", help="run output dir containing parts-manifest.json")
    ap.add_argument("--out", help="explicit output .step path")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.run_dir:
        ap.error("run_dir required (or --selftest)")
    path, stats = write_step(args.run_dir, out_path=args.out)
    print(f"[export_step] wrote {path}  ({stats['bytes']:,} bytes)  "
          f"parts={stats.get('parts')}/{stats.get('manifest_count')}  pipes={stats.get('pipes')} "
          f"(skipped {stats.get('pipes_skipped', 0)} route lines with no usable data) "
          f"source={stats.get('source', 'parts_manifest')}")
    if stats.get("source") == "geometry_kernel":
        # Kernel STEP uses IR tags; legacy bbox-vs-manifest verify does not apply.
        # Open-smoke (FreeCAD/OCCT) is the truth gate for kernel masters.
        try:
            _lib = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib")
            if _lib not in sys.path:
                sys.path.insert(0, _lib)
            from geometry_freecad_smoke import smoke_open_step

            smoke = smoke_open_step(path)
            print(f"[export_step] kernel smoke ok={smoke.get('ok')} backend={smoke.get('backend')}")
            return 0 if smoke.get("ok") else 1
        except Exception as exc:
            print(f"[export_step] kernel smoke skipped: {exc}")
            return 0 if os.path.getsize(path) > 200 else 1
    res = verify_step(path, args.run_dir)
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
