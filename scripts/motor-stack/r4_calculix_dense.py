#!/usr/bin/env python3
"""Denser CalculiX R4: quarter rotor ring, centrif vs centrif+T-gradient.

Maps FEMM R2 radial samples onto rotor ring nodes as a screening proxy.
Not release FoS. ship_ok false.
"""
from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
IMAGE = "forgeos/calculix:2.21-arm64"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write(p: Path, obj: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def load_t_samples(twin: Path) -> tuple[np.ndarray, np.ndarray]:
    samples = twin / "_motor_stack" / "multiphysics" / "r2_femm_samples.txt"
    if samples.is_file():
        rows = []
        for line in samples.read_text().splitlines():
            if not line or line.startswith("r_mm"):
                continue
            parts = line.split(",")
            if len(parts) >= 2:
                rows.append((float(parts[0]), float(parts[1])))
        if rows:
            r = np.array([a for a, _ in rows]) * 1e-3
            t = np.array([b for _, b in rows])
            return r, t
    # Fallback: FD field probes
    r2 = json.loads(
        (twin / "_motor_stack" / "multiphysics" / "r2_stator_temperature_field.json").read_text()
    )
    g = r2["geometry_m"]
    p = r2["probes_c"]
    r = np.array([g["r_bore"], g["r_slot_bottom"], g["r_yoke_outer"], g["r_jacket"]])
    t = np.array(
        [
            p["magnet_proxy_bore"],
            p["tooth_mid"],
            p["yoke_mid"],
            p["jacket_outer"],
        ]
    )
    return r, t


def T_of_r(r_m: float, rs: np.ndarray, ts: np.ndarray) -> float:
    return float(np.interp(r_m, rs, ts, left=ts[0], right=ts[-1]))


def build_mesh(
    ri: float,
    ro: float,
    half_z: float,
    nr: int,
    nth: int,
    nz: int,
) -> tuple[list[tuple[int, float, float, float]], list[tuple[int, ...]], dict[str, list[int]]]:
    """Quarter ring C3D8: theta 0..pi/2, r ri..ro, z 0..half_z*2."""
    r_vals = np.linspace(ri, ro, nr + 1)
    th_vals = np.linspace(0.0, math.pi / 2, nth + 1)
    z_vals = np.linspace(0.0, 2 * half_z, nz + 1)
    nodes: list[tuple[int, float, float, float]] = []
    nid = {}
    n = 0
    for iz, z in enumerate(z_vals):
        for ith, th in enumerate(th_vals):
            for ir, r in enumerate(r_vals):
                n += 1
                x = r * math.cos(th)
                y = r * math.sin(th)
                nodes.append((n, x, y, z))
                nid[(ir, ith, iz)] = n
    elems: list[tuple[int, ...]] = []
    e = 0
    for iz in range(nz):
        for ith in range(nth):
            for ir in range(nr):
                e += 1
                # C3D8 ordering: bottom face CCW, then top
                n1 = nid[(ir, ith, iz)]
                n2 = nid[(ir + 1, ith, iz)]
                n3 = nid[(ir + 1, ith + 1, iz)]
                n4 = nid[(ir, ith + 1, iz)]
                n5 = nid[(ir, ith, iz + 1)]
                n6 = nid[(ir + 1, ith, iz + 1)]
                n7 = nid[(ir + 1, ith + 1, iz + 1)]
                n8 = nid[(ir, ith + 1, iz + 1)]
                elems.append((e, n1, n2, n3, n4, n5, n6, n7, n8))
    sets = {
        "SYM0": [nid[(ir, 0, iz)] for ir in range(nr + 1) for iz in range(nz + 1)],
        "SYM90": [nid[(ir, nth, iz)] for ir in range(nr + 1) for iz in range(nz + 1)],
        "FIXZ": [nid[(ir, ith, 0)] for ir in range(nr + 1) for ith in range(nth + 1)],
        "ALLN": list(range(1, n + 1)),
    }
    return nodes, elems, sets


def write_inp(
    path: Path,
    nodes: list,
    elems: list,
    sets: dict,
    rpm: float,
    t_map: dict[int, float] | None,
    t_ref: float,
    heading: str,
) -> None:
    omega = rpm * 2 * math.pi / 60.0
    lines = [f"*HEADING\n{heading}\n*NODE"]
    for nid, x, y, z in nodes:
        lines.append(f"{nid}, {x*1000:.6f}, {y*1000:.6f}, {z*1000:.6f}")
    lines.append("*ELEMENT, TYPE=C3D8, ELSET=SOLID")
    for e in elems:
        lines.append(", ".join(str(v) for v in e))
    for name, ids in sets.items():
        lines.append(f"*NSET, NSET={name}")
        row: list[str] = []
        for i, nid in enumerate(ids, 1):
            row.append(str(nid))
            if i % 16 == 0:
                lines.append(", ".join(row))
                row = []
        if row:
            lines.append(", ".join(row))
    lines += [
        "*MATERIAL, NAME=Steel",
        "*ELASTIC",
        "210000.0, 0.300",
        "*DENSITY",
        "7.810000e-09",
        "*EXPANSION",
        "1.200000e-05",
        "*SOLID SECTION, ELSET=SOLID, MATERIAL=Steel",
        "*BOUNDARY",
        "SYM0, 2, 2",
        "SYM90, 1, 1",
        "FIXZ, 3, 3",
        "*INITIAL CONDITIONS, TYPE=TEMPERATURE",
        f"ALLN, {t_ref:.3f}",
        "*STEP",
        "*STATIC",
        "*DLOAD",
        f"SOLID, CENTRIF, {omega**2:.6e}, 0., 0., 0., 0., 0., 1.",
    ]
    lines.append("*TEMPERATURE")
    if t_map:
        for nid, t in sorted(t_map.items()):
            lines.append(f"{nid}, {t:.4f}")
    else:
        # CalculiX requires a final temperature when INITIAL CONDITIONS TEMPERATURE is set
        for nid in sets["ALLN"]:
            lines.append(f"{nid}, {t_ref:.4f}")
    lines += ["*EL PRINT, ELSET=SOLID", "S", "*END STEP"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_ccx(job_dir: Path, job: str) -> dict[str, Any]:
    job_dir.mkdir(parents=True, exist_ok=True)
    # Prefer docker image
    cmd = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{job_dir}:/work",
        "-w",
        "/work",
        IMAGE,
        "ccx",
        "-i",
        job,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    (job_dir / "solver.log").write_text(r.stdout + "\n" + r.stderr, encoding="utf-8")
    dat = job_dir / f"{job}.dat"
    max_vm = None
    n = 0
    if dat.is_file():
        text = dat.read_text(errors="replace")
        # parse stress lines: elem integ sxx syy szz sxy sxz syz
        for line in text.splitlines():
            parts = line.split()
            if len(parts) >= 8:
                try:
                    sxx, syy, szz, sxy, sxz, syz = map(float, parts[2:8])
                except ValueError:
                    continue
                # von Mises
                vm = math.sqrt(
                    0.5
                    * (
                        (sxx - syy) ** 2
                        + (syy - szz) ** 2
                        + (szz - sxx) ** 2
                        + 6 * (sxy**2 + sxz**2 + syz**2)
                    )
                )
                n += 1
                if max_vm is None or vm > max_vm:
                    max_vm = vm
    return {
        "ok": r.returncode == 0 and max_vm is not None,
        "returncode": r.returncode,
        "max_von_mises_mpa": max_vm,
        "n_integration_points": n,
        "tail": (r.stdout + r.stderr)[-400:],
    }


def main() -> int:
    twin = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TWIN
    twin = twin.resolve()
    out = twin / "_motor_stack" / "multiphysics"
    jack = twin / "_motor_stack" / "jack_em_pack"
    work = REPO / "scripts" / "motor-stack" / "_ccx_r4_dense"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    # Rotor ring from twin quantities if present
    ri, ro, half_z = 0.05295, 0.0697, 0.0325
    qpath = twin / "quantities.json"
    if qpath.is_file():
        q = json.loads(qpath.read_text())
        def gv(k, default):
            v = q.get(k)
            if isinstance(v, dict) and v.get("value") is not None:
                return float(v["value"])
            return default
        # mm values often
        rid = gv("rotor_inner_diameter_mm", None) or gv("fpk_rotor_id_mm", None)
        rod = gv("rotor_outer_diameter_mm", None) or gv("fpk_rotor_od_mm", None)
        stack = gv("active_length_mm", None) or gv("stack_length_mm", 130.0)
        if rid and rod:
            ri, ro = rid / 2000.0, rod / 2000.0
        if stack:
            half_z = (stack / 1000.0) / 2.0

    rs, ts = load_t_samples(twin)
    rpm = 24000.0
    t_ref = 20.0
    # Dense: 8 radial × 16 theta × 4 axial → 9×17×5 = 765 nodes, 8×16×4 = 512 elems
    nr, nth, nz = 8, 16, 4
    nodes, elems, sets = build_mesh(ri, ro, half_z, nr, nth, nz)
    t_map = {}
    for nid, x, y, z in nodes:
        r = math.hypot(x, y)
        t_map[nid] = T_of_r(r, rs, ts)

    results = {}
    for name, use_t in (("centrif_only", False), ("centrif_Tgrad", True)):
        job_dir = work / name
        job_dir.mkdir(parents=True, exist_ok=True)
        write_inp(
            job_dir / f"{name}.inp",
            nodes,
            elems,
            sets,
            rpm,
            t_map if use_t else None,
            t_ref,
            f"R4 dense {name} rpm={rpm} nr={nr} nth={nth} nz={nz}",
        )
        print(f"[R4 dense] solving {name}…", flush=True)
        results[name] = run_ccx(job_dir, name)
        print(" ", results[name], flush=True)

    c0 = results["centrif_only"].get("max_von_mises_mpa")
    c1 = results["centrif_Tgrad"].get("max_von_mises_mpa")
    delta = (c1 - c0) if c0 is not None and c1 is not None else None
    payload = {
        "schema": "forgeos.multiphysics.r4_calculix_dense/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "mesh": {
            "nr": nr,
            "nth": nth,
            "nz": nz,
            "n_nodes": len(nodes),
            "n_elements": len(elems),
            "ri_m": ri,
            "ro_m": ro,
            "half_z_m": half_z,
            "type": "C3D8_quarter_ring",
        },
        "rpm": rpm,
        "T_ref_c": t_ref,
        "T_field": "FEMM R2 radial samples mapped by r=hypot(x,y)",
        "centrif_only": results["centrif_only"],
        "centrif_plus_thermal_gradient": results["centrif_Tgrad"],
        "delta_vm_mpa": delta,
        "assumed_yield_mpa": 355.0,
        "status": "RAN" if results["centrif_only"]["ok"] and results["centrif_Tgrad"]["ok"] else "PARTIAL",
        "honest_limits": [
            "quarter ring continuum — not laminate/magnet-pocket mesh",
            "stator FEMM T mapped onto rotor ring as screening proxy",
            "not *COUPLED TEMPERATURE-DISPLACEMENT heat conduction solve",
            "not release FoS",
        ],
        "compare_to_coarse": {
            "prior_coarse_nodes": 56,
            "prior_delta_vm_mpa": 24.99,
        },
    }
    _write(out / "r4_calculix_dense.json", payload)
    # also refresh main r4_calculix_thermal_centrif.json for pack consumers
    _write(
        out / "r4_calculix_thermal_centrif.json",
        {
            **payload,
            "schema": "forgeos.multiphysics.r4_calculix_thermal_centrif/v3",
        },
    )

    fig, ax = plt.subplots(figsize=(8.4, 4.6), dpi=140)
    labels = ["Centrif only", "Centrif + T-grad"]
    vals = [c0 or 0, c1 or 0]
    ax.bar(labels, vals, color=["#264653", "#e76f51"])
    ax.set_ylabel("max von Mises (MPa)")
    ax.set_title(
        f"R4 dense CCX ({len(nodes)} nodes) @ {rpm:.0f} rpm\n"
        f"Δ≈{delta:.1f} MPa from T-gradient · screening · ship_ok=false"
        if delta is not None
        else "R4 dense CCX · ship_ok=false"
    )
    ax.axhline(355, color="#9b2226", ls="--", lw=1, label="yield 355 MPa (assumed)")
    ax.legend(fontsize=8)
    ax.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    png = out / "r4_calculix_thermal_centrif.png"
    fig.savefig(png)
    fig.savefig(out / "r4_calculix_dense.png")
    plt.close(fig)
    jack.mkdir(parents=True, exist_ok=True)
    shutil.copy2(png, jack / "49-r4-thermal-stress-screen.png")
    print(json.dumps({"status": payload["status"], "delta_vm_mpa": delta, "n_nodes": len(nodes)}, indent=2))
    return 0 if payload["status"] == "RAN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
