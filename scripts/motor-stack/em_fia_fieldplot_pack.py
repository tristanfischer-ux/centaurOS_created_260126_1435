#!/usr/bin/env python3
"""FE Front FEMM Field Plot Pack — |B| maps you can lean in on.

INTENT (Tristan 2026-08-04): the Tony / Hooley RF bar was "seeing the plots is
quite different in how it modifies one's understanding." The FE front twin had
torque scalars and air-gap line charts, not a field map of magnets ↔ copper.

This pack reuses the SAME Path B kit-case xfemm deck
(``em_fia_front_kit_case._build_fia_lua``) and samples the solved field on a
Cartesian grid via ``mo_getpointvalues``, then draws:

  1. Tony-style 2D |B| colour map + flux-line contours (vector potential)
  2. Subsampled B-vector quiver over the machine
  3. 3D surface of |B|(x,y) — height encodes flux density
  4. Interactive Plotly 3D HTML (orbit / zoom)
  5. One-pole-pair zoom for tooth / magnet detail
  6. Air-gap circumferential |B| as a 3D ring (unwrap + lift)

Open-circuit and Path B loaded (−30° elec. kit-case OP) are both produced.

Honesty: 2D planar magnetostatic FEMM. Not 3D end-winding FE. Not dyno.
ship_ok remains false. Flux lines are contours of reconstructed A_z from By
(same construction as phantm/femm/fieldplot.py).

Usage:
  .venv/bin/python scripts/motor-stack/em_fia_fieldplot_pack.py \\
      --twin out/formula-e-front-mgu-20260729-1432
  .venv/bin/python scripts/motor-stack/em_fia_fieldplot_pack.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import cm  # noqa: E402
from mpl_toolkits.mplot3d import Axes3D  # noqa: E402, F401

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "motor-stack"))
sys.path.insert(0, str(REPO / "scripts" / "lib"))

from em_fia_front_kit_case import (  # noqa: E402
    MATERIAL_MACHINE_PATH,
    FiaFrontKitCaseError,
    LoadedPointAssumptions,
    _build_fia_lua,
    _solver_path,
    analytical_duty_check,
    derive_fia_geometry,
    load_twin_inputs,
    loaded_point_assumptions,
)
from pyleecan.Functions.load import load  # noqa: E402

DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
PROBE_PREFIX = "FORGE_FIA_FIELD_PROBE"
# Full-machine grid. 72² = 5184 probes — one solve + probe pass ≈ 1–2 min.
DEFAULT_N = 72
# Zoom grid over one pole pair.
DEFAULT_ZOOM_N = 64


@dataclass(frozen=True)
class FieldSample:
    label: str
    xs_mm: np.ndarray
    ys_mm: np.ndarray
    bx_t: np.ndarray
    by_t: np.ndarray
    bmag_t: np.ndarray
    a_reconstructed: np.ndarray
    geometry: dict[str, float]
    operating_point: dict[str, Any]
    solve_seconds: float
    n_probes: int


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _geom_radii(geometry) -> dict[str, float]:
    return {
        "r_ri_mm": geometry.rotor_inner_diameter_mm / 2.0,
        "r_ro_mm": geometry.rotor_outer_diameter_mm / 2.0,
        "r_si_mm": geometry.stator_inner_diameter_mm / 2.0,
        "r_so_mm": geometry.stator_outer_diameter_mm / 2.0,
        "r_gap_mm": (
            geometry.rotor_outer_diameter_mm + geometry.stator_inner_diameter_mm
        )
        / 4.0,
        "active_length_mm": geometry.active_length_mm,
        "stator_slots": float(geometry.stator_slots),
        "rotor_poles": float(geometry.rotor_poles),
    }


def _cartesian_grid(
    r_max_mm: float, n: int
) -> tuple[np.ndarray, np.ndarray, list[tuple[float, float]]]:
    xs = np.linspace(-r_max_mm, r_max_mm, n)
    ys = np.linspace(-r_max_mm, r_max_mm, n)
    pts = [(float(x), float(y)) for y in ys for x in xs]
    return xs, ys, pts


def _pole_pair_window(geometry) -> tuple[float, float, float, float]:
    """Axis-aligned window covering roughly one pole pair near the air-gap."""
    r_ro = geometry.rotor_outer_diameter_mm / 2.0
    r_si = geometry.stator_inner_diameter_mm / 2.0
    r_so = geometry.stator_outer_diameter_mm / 2.0
    r_mid = 0.5 * (r_ro + r_si)
    # One pole mechanical span.
    pole_mech_rad = 2.0 * math.pi / geometry.rotor_poles
    half_w = r_mid * math.tan(0.55 * pole_mech_rad)
    # Centre the window on +X air-gap.
    x0, x1 = r_mid * 0.55, r_so * 1.02
    y0, y1 = -half_w, half_w
    return x0, x1, y0, y1


def _window_grid(
    x0: float, x1: float, y0: float, y1: float, n: int
) -> tuple[np.ndarray, np.ndarray, list[tuple[float, float]]]:
    xs = np.linspace(x0, x1, n)
    ys = np.linspace(y0, y1, n)
    pts = [(float(x), float(y)) for y in ys for x in xs]
    return xs, ys, pts


def _inject_probes(lua: str, pts: Sequence[tuple[float, float]]) -> str:
    """Append mo_getpointvalues probe prints before quit()."""
    body = lua.rstrip()
    if not body.endswith("quit()"):
        raise FiaFrontKitCaseError("FIA lua missing quit() — cannot inject probes")
    body = body[: -len("quit()")].rstrip()
    lines = [
        "",
        f"-- Field-plot pack: {len(pts)} probe points (mo_getpointvalues)",
    ]
    for k, (px, py) in enumerate(pts):
        # Corners of a Cartesian box sit outside the circular mesh — mo_getpoint
        # returns nil there. Emit NaN rather than concat-crash.
        lines.append(
            "pA,pBx,pBy,pSig,pE,pHx,pHy,pJe,pJs,pMu1,pMu2,pPe,pPh="
            f"mo_getpointvalues({px:.8f},{py:.8f})"
        )
        lines.append(
            f'if pBx==nil then print("{PROBE_PREFIX} probe{k}_bx=nan") '
            f'else print("{PROBE_PREFIX} probe{k}_bx="..pBx) end'
        )
        lines.append(
            f'if pBy==nil then print("{PROBE_PREFIX} probe{k}_by=nan") '
            f'else print("{PROBE_PREFIX} probe{k}_by="..pBy) end'
        )
        lines.append(
            f'if pA==nil then print("{PROBE_PREFIX} probe{k}_a=nan") '
            f'else print("{PROBE_PREFIX} probe{k}_a="..pA) end'
        )
    return body + "\n" + "\n".join(lines) + "\nquit()\n"


def _run_field_sample(
    *,
    geometry,
    solver: Path,
    remanence_t: float,
    loaded: LoadedPointAssumptions | None,
    label: str,
    xs: np.ndarray,
    ys: np.ndarray,
    pts: list[tuple[float, float]],
    timeout_s: float = 900.0,
) -> FieldSample:
    t0 = time.time()
    lua = _build_fia_lua(
        geometry,
        remanence_t=remanence_t,
        fem_name="fia_fieldplot.fem",
        loaded=loaded,
        open_circuit_turns_per_slot=(
            loaded.effective_turns_per_slot if loaded is not None else 1
        ),
        parallel_paths=(
            loaded.winding_parallel_paths if loaded is not None else 1.0
        ),
    )
    lua = _inject_probes(lua, pts)
    with tempfile.TemporaryDirectory(prefix="forge-fia-fieldplot-") as tmp:
        work = Path(tmp)
        script = work / "fieldplot.lua"
        script.write_text(lua, encoding="utf-8")
        proc = subprocess.run(
            [str(solver), "-q", f"--lua-script={script}"],
            cwd=work,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    if proc.returncode != 0:
        raise FiaFrontKitCaseError(
            f"fieldplot femmcli failed exit={proc.returncode} "
            f"stderr={proc.stderr[-800:]!r} stdout_tail={proc.stdout[-800:]!r}"
        )
    bx_map: dict[int, float] = {}
    by_map: dict[int, float] = {}
    a_map: dict[int, float] = {}
    pat = re.compile(
        rf"^{re.escape(PROBE_PREFIX)} probe(\d+)_(bx|by|a)=(.*)$"
    )
    for line in proc.stdout.splitlines():
        m = pat.match(line.strip())
        if not m:
            continue
        idx, comp, raw = int(m.group(1)), m.group(2), m.group(3)
        try:
            val = float(raw)
        except ValueError:
            val = float("nan")
        if comp == "bx":
            bx_map[idx] = val
        elif comp == "by":
            by_map[idx] = val
        else:
            a_map[idx] = val
    n = len(pts)
    missing = [i for i in range(n) if i not in bx_map or i not in by_map]
    if missing:
        raise FiaFrontKitCaseError(
            f"fieldplot missing {len(missing)}/{n} probes "
            f"(first missing {missing[:5]}); stdout_tail={proc.stdout[-1200:]!r}"
        )
    ny, nx = len(ys), len(xs)
    bx = np.array([bx_map[i] for i in range(n)], dtype=float).reshape(ny, nx)
    by = np.array([by_map[i] for i in range(n)], dtype=float).reshape(ny, nx)
    bmag = np.hypot(bx, by)
    # Prefer FEMM A when finite; else reconstruct A_z from By (dA/dx = -By).
    if len(a_map) == n and np.isfinite([a_map[i] for i in range(n)]).mean() > 0.9:
        a = np.array([a_map[i] for i in range(n)], dtype=float).reshape(ny, nx)
    else:
        dx = float(xs[1] - xs[0]) if nx > 1 else 1.0
        a = -np.cumsum(by, axis=1) * dx
    op: dict[str, Any] = {"kind": "open_circuit"}
    if loaded is not None:
        op = {
            "kind": "loaded_path_b_kit_case_op",
            "current_angle_electrical_deg": loaded.current_angle_electrical_deg,
            "rotor_position_mechanical_deg": loaded.rotor_position_mechanical_deg,
            "phase_current_rms_a": loaded.phase_current_rms_a,
            "phase_current_peak_a": loaded.phase_current_peak_a,
            "path_current_rms_a": loaded.path_current_rms_a,
            "effective_turns_per_slot": loaded.effective_turns_per_slot,
            "winding_parallel_paths": loaded.winding_parallel_paths,
        }
    return FieldSample(
        label=label,
        xs_mm=xs,
        ys_mm=ys,
        bx_t=bx,
        by_t=by,
        bmag_t=bmag,
        a_reconstructed=a,
        geometry=_geom_radii(geometry),
        operating_point=op,
        solve_seconds=time.time() - t0,
        n_probes=n,
    )


def _draw_machine_circles(ax, g: dict[str, float], *, color="w", lw=0.9) -> None:
    for key, ls in (
        ("r_ri_mm", ":"),
        ("r_ro_mm", "-"),
        ("r_si_mm", "-"),
        ("r_so_mm", "-"),
    ):
        r = g[key]
        th = np.linspace(0, 2 * np.pi, 256)
        ax.plot(r * np.cos(th), r * np.sin(th), ls=ls, color=color, lw=lw, alpha=0.85)


def plot_tony_2d(sample: FieldSample, path: Path, *, title: str) -> None:
    xs, ys = sample.xs_mm, sample.ys_mm
    X, Y = np.meshgrid(xs, ys)
    b = np.nan_to_num(sample.bmag_t, nan=0.0)
    vmax = float(np.nanpercentile(b, 99.5)) or 1.0
    fig, ax = plt.subplots(figsize=(9.2, 8.0), dpi=160)
    levels = np.linspace(0.0, vmax, 28)
    cf = ax.contourf(X, Y, b, levels=levels, cmap="turbo", extend="max")
    try:
        ax.contour(
            X,
            Y,
            sample.a_reconstructed,
            levels=18,
            colors="k",
            linewidths=0.4,
            alpha=0.7,
        )
    except Exception:
        pass
    _draw_machine_circles(ax, sample.geometry, color="white", lw=1.0)
    cb = fig.colorbar(cf, ax=ax, fraction=0.046, pad=0.03)
    cb.set_label("|B|  (tesla)")
    ax.set_aspect("equal")
    ax.set_xlabel("x  (mm)  — machine cross-section")
    ax.set_ylabel("y  (mm)")
    ax.set_title(title, fontsize=11)
    ax.text(
        0.02,
        0.02,
        "2D planar FEMM · flux lines = contours of A_z · not 3D end-winding FE",
        transform=ax.transAxes,
        fontsize=7.5,
        color="0.15",
        bbox=dict(boxstyle="round,pad=0.25", fc="white", alpha=0.82, ec="none"),
    )
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def plot_quiver(sample: FieldSample, path: Path, *, title: str) -> None:
    xs, ys = sample.xs_mm, sample.ys_mm
    X, Y = np.meshgrid(xs, ys)
    b = np.nan_to_num(sample.bmag_t, nan=0.0)
    step = max(1, len(xs) // 28)
    fig, ax = plt.subplots(figsize=(9.0, 8.0), dpi=150)
    vmax = float(np.nanpercentile(b, 99.5)) or 1.0
    ax.contourf(
        X,
        Y,
        b,
        levels=np.linspace(0, vmax, 20),
        cmap="turbo",
        alpha=0.55,
        extend="max",
    )
    ax.quiver(
        X[::step, ::step],
        Y[::step, ::step],
        sample.bx_t[::step, ::step],
        sample.by_t[::step, ::step],
        b[::step, ::step],
        cmap="inferno",
        scale=None,
        width=0.0035,
        pivot="mid",
    )
    _draw_machine_circles(ax, sample.geometry, color="k", lw=1.1)
    ax.set_aspect("equal")
    ax.set_title(title, fontsize=11)
    ax.set_xlabel("x (mm)")
    ax.set_ylabel("y (mm)")
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def plot_surface_3d(sample: FieldSample, path: Path, *, title: str) -> None:
    """|B| as a 3D landscape — height is flux density (tesla)."""
    xs, ys = sample.xs_mm, sample.ys_mm
    X, Y = np.meshgrid(xs, ys)
    Z = np.nan_to_num(sample.bmag_t, nan=0.0)
    # Soft floor outside machine for readability.
    r_so = sample.geometry["r_so_mm"]
    R = np.hypot(X, Y)
    Z = np.where(R <= r_so * 1.02, Z, np.nan)

    fig = plt.figure(figsize=(10.5, 7.8), dpi=160)
    ax = fig.add_subplot(111, projection="3d")
    norm = plt.Normalize(vmin=0.0, vmax=float(np.nanpercentile(Z, 99.0) or 1.0))
    surf = ax.plot_surface(
        X,
        Y,
        Z,
        cmap="turbo",
        linewidth=0,
        antialiased=True,
        rstride=1,
        cstride=1,
        norm=norm,
        alpha=0.95,
    )
    # Machine OD ring floating at z=0 for orientation.
    th = np.linspace(0, 2 * np.pi, 200)
    for r, z0, c in (
        (sample.geometry["r_ro_mm"], 0.0, "0.35"),
        (sample.geometry["r_si_mm"], 0.0, "0.55"),
        (sample.geometry["r_so_mm"], 0.0, "0.2"),
    ):
        ax.plot(r * np.cos(th), r * np.sin(th), np.full_like(th, z0), color=c, lw=1.0)
    ax.set_xlabel("x (mm)")
    ax.set_ylabel("y (mm)")
    ax.set_zlabel("|B| (T)")
    ax.set_title(title, fontsize=11, pad=12)
    ax.view_init(elev=32, azim=-58)
    fig.colorbar(surf, ax=ax, shrink=0.55, pad=0.08, label="|B| (T)")
    fig.text(
        0.5,
        0.02,
        "Height = flux density · base rings = rotor OD / stator ID / stator OD · 2D FE extruded as a landscape",
        ha="center",
        fontsize=8,
        color="0.25",
    )
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def plot_airgap_ring_3d(sample: FieldSample, path: Path, *, title: str) -> None:
    """Circumferential air-gap |B| lifted into a 3D ring (lean-in pole signature)."""
    g = sample.geometry
    r_gap = 0.5 * (g["r_ro_mm"] + g["r_si_mm"])
    xs, ys = sample.xs_mm, sample.ys_mm
    # Sample |B| on the mid-air-gap circle by bilinear interpolation.
    n_th = 720
    th = np.linspace(0, 2 * np.pi, n_th, endpoint=False)
    px = r_gap * np.cos(th)
    py = r_gap * np.sin(th)
    b = np.nan_to_num(sample.bmag_t, nan=0.0)
    # map physical → fractional indices
    fx = (px - xs[0]) / (xs[-1] - xs[0]) * (len(xs) - 1)
    fy = (py - ys[0]) / (ys[-1] - ys[0]) * (len(ys) - 1)
    x0 = np.clip(np.floor(fx).astype(int), 0, len(xs) - 2)
    y0 = np.clip(np.floor(fy).astype(int), 0, len(ys) - 2)
    tx = np.clip(fx - x0, 0.0, 1.0)
    ty = np.clip(fy - y0, 0.0, 1.0)
    b00 = b[y0, x0]
    b10 = b[y0, x0 + 1]
    b01 = b[y0 + 1, x0]
    b11 = b[y0 + 1, x0 + 1]
    b_gap = (
        b00 * (1 - tx) * (1 - ty)
        + b10 * tx * (1 - ty)
        + b01 * (1 - tx) * ty
        + b11 * tx * ty
    )

    # Build a thin radial ribbon: r_gap ± δ, z = |B|
    delta = max(1.5, 0.04 * r_gap)
    r_inner, r_outer = r_gap - delta, r_gap + delta
    n_r = 6
    rs = np.linspace(r_inner, r_outer, n_r)
    TH, RR = np.meshgrid(th, rs)
    XX = RR * np.cos(TH)
    YY = RR * np.sin(TH)
    ZZ = np.tile(b_gap, (n_r, 1))

    fig = plt.figure(figsize=(10.0, 7.6), dpi=160)
    ax = fig.add_subplot(111, projection="3d")
    vmax = float(np.percentile(b_gap, 99.5) or 1.0)
    norm = plt.Normalize(vmin=0.0, vmax=vmax)
    surf = ax.plot_surface(
        XX,
        YY,
        ZZ,
        cmap="turbo",
        norm=norm,
        linewidth=0,
        antialiased=True,
        rstride=1,
        cstride=1,
        alpha=0.95,
    )
    ax.set_title(title, fontsize=11)
    ax.set_xlabel("x (mm)")
    ax.set_ylabel("y (mm)")
    ax.set_zlabel("|B| in air-gap (T)")
    ax.view_init(elev=28, azim=-40)
    fig.colorbar(surf, ax=ax, shrink=0.55, pad=0.08, label="|B| (T)")
    fig.text(
        0.5,
        0.02,
        f"Air-gap mid-radius {r_gap:.1f} mm · {g['rotor_poles']:.0f} poles visible as |B| lobes · FEMM 2D",
        ha="center",
        fontsize=8,
        color="0.25",
    )
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def write_plotly_html(sample: FieldSample, path: Path, *, title: str) -> None:
    try:
        import plotly.graph_objects as go
    except ImportError:
        path.write_text(
            "<html><body><p>plotly not installed</p></body></html>", encoding="utf-8"
        )
        return
    xs, ys = sample.xs_mm, sample.ys_mm
    Z = np.nan_to_num(sample.bmag_t, nan=0.0)
    r_so = sample.geometry["r_so_mm"]
    X, Y = np.meshgrid(xs, ys)
    R = np.hypot(X, Y)
    Z = np.where(R <= r_so * 1.02, Z, np.nan)
    fig = go.Figure(
        data=[
            go.Surface(
                x=xs,
                y=ys,
                z=Z,
                colorscale="Turbo",
                colorbar=dict(title="|B| (T)"),
                contours={
                    "z": {
                        "show": True,
                        "usecolormap": True,
                        "highlightcolor": "limegreen",
                        "project_z": False,
                    }
                },
            )
        ]
    )
    fig.update_layout(
        title=title,
        scene=dict(
            xaxis_title="x (mm)",
            yaxis_title="y (mm)",
            zaxis_title="|B| (T)",
            aspectmode="manual",
            aspectratio=dict(x=1, y=1, z=0.45),
            camera=dict(eye=dict(x=1.5, y=1.5, z=1.1)),
        ),
        margin=dict(l=0, r=0, t=50, b=0),
        paper_bgcolor="white",
    )
    fig.write_html(str(path), include_plotlyjs="cdn")


def _save_npz(sample: FieldSample, path: Path) -> None:
    np.savez_compressed(
        path,
        xs_mm=sample.xs_mm,
        ys_mm=sample.ys_mm,
        bx_t=sample.bx_t,
        by_t=sample.by_t,
        bmag_t=sample.bmag_t,
        a=sample.a_reconstructed,
        label=np.array(sample.label),
    )


def _thumb(src: Path, dest: Path, max_side: int = 1400) -> None:
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(src).convert("RGB")
    im.thumbnail((max_side, max_side))
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=88, optimize=True)


def run_pack(twin: Path, *, n: int = DEFAULT_N, zoom_n: int = DEFAULT_ZOOM_N) -> Path:
    twin = twin.resolve()
    out = twin / "_motor_stack" / "fieldplot_pack"
    out.mkdir(parents=True, exist_ok=True)
    show = twin / "_show_tristan"
    show.mkdir(parents=True, exist_ok=True)

    state_path = twin / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    solver = _solver_path()
    material_machine = load(str(MATERIAL_MACHINE_PATH))
    remanence_t = float(material_machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20)

    # Path B kit-case OP: −30° electrical (matches dual-bar / narrative).
    loaded = loaded_point_assumptions(
        duty,
        inputs,
        current_angle_electrical_deg=-30.0,
        rotor_position_mechanical_deg=0.0,
    )

    r_max = geometry.stator_outer_diameter_mm / 2.0 * 1.08
    xs, ys, pts = _cartesian_grid(r_max, n)
    x0, x1, y0, y1 = _pole_pair_window(geometry)
    zxs, zys, zpts = _window_grid(x0, x1, y0, y1, zoom_n)

    print(f"[fieldplot] twin={twin.name} n={n} probes={len(pts)} zoom={len(zpts)}", flush=True)
    print(f"[fieldplot] geometry slots={geometry.stator_slots} poles={geometry.rotor_poles} "
          f"gap={geometry.radial_airgap_mm:.2f} mm stack={geometry.active_length_mm:.1f} mm",
          flush=True)

    samples: dict[str, FieldSample] = {}
    for label, load_pt, grid_xs, grid_ys, grid_pts in (
        ("oc_full", None, xs, ys, pts),
        ("loaded_path_b_full", loaded, xs, ys, pts),
        ("loaded_path_b_pole_zoom", loaded, zxs, zys, zpts),
    ):
        print(f"[fieldplot] solving {label} …", flush=True)
        samples[label] = _run_field_sample(
            geometry=geometry,
            solver=solver,
            remanence_t=remanence_t,
            loaded=load_pt,
            label=label,
            xs=grid_xs,
            ys=grid_ys,
            pts=grid_pts,
        )
        s = samples[label]
        print(
            f"[fieldplot] {label}: {s.solve_seconds:.1f}s  "
            f"|B| peak={np.nanmax(s.bmag_t):.3f} T  "
            f"p99={np.nanpercentile(s.bmag_t, 99):.3f} T",
            flush=True,
        )
        _save_npz(s, out / f"{label}_field.npz")

    # ── renders ────────────────────────────────────────────────────────────
    artefacts: list[str] = []

    def _emit(sample: FieldSample, stem: str, title: str) -> None:
        p2 = out / f"{stem}_tony_bmag.png"
        plot_tony_2d(sample, p2, title=title)
        artefacts.append(p2.name)
        pq = out / f"{stem}_quiver.png"
        plot_quiver(sample, pq, title=title + " — B vectors")
        artefacts.append(pq.name)
        p3 = out / f"{stem}_surface3d.png"
        plot_surface_3d(sample, p3, title=title + " — |B| as height")
        artefacts.append(p3.name)
        ph = out / f"{stem}_interactive3d.html"
        write_plotly_html(sample, ph, title=title + " — orbit me")
        artefacts.append(ph.name)
        # thumbs for Tristan
        _thumb(p2, show / f"field-{stem}-tony.jpg")
        _thumb(p3, show / f"field-{stem}-3d.jpg")

    _emit(
        samples["oc_full"],
        "01-oc-full",
        "FE Front Path B — OPEN CIRCUIT |B| (magnets only, no stator current)",
    )
    _emit(
        samples["loaded_path_b_full"],
        "02-loaded-full",
        "FE Front Path B — LOADED |B| (−30° elec., kit-case OP, magnets + copper)",
    )
    # Pole zoom: tony + 3d only
    z = samples["loaded_path_b_pole_zoom"]
    p2 = out / "03-loaded-pole-zoom_tony_bmag.png"
    plot_tony_2d(
        z,
        p2,
        title="Path B loaded — one pole-pair zoom (air-gap / tooth / magnet)",
    )
    artefacts.append(p2.name)
    p3 = out / "03-loaded-pole-zoom_surface3d.png"
    plot_surface_3d(
        z,
        p3,
        title="Path B loaded — pole-pair |B| landscape",
    )
    artefacts.append(p3.name)
    _thumb(p2, show / "field-03-pole-zoom-tony.jpg")
    _thumb(p3, show / "field-03-pole-zoom-3d.jpg")

    pr = out / "04-loaded-airgap-ring3d.png"
    plot_airgap_ring_3d(
        samples["loaded_path_b_full"],
        pr,
        title="Path B loaded — air-gap |B| as a 3D ring (pole lobes)",
    )
    artefacts.append(pr.name)
    _thumb(pr, show / "field-04-airgap-ring3d.jpg")

    # Side-by-side OC vs loaded comparison strip
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 5.8), dpi=150)
    for ax, key, ttl in (
        (axes[0], "oc_full", "Open circuit"),
        (axes[1], "loaded_path_b_full", "Loaded −30° elec."),
    ):
        s = samples[key]
        X, Y = np.meshgrid(s.xs_mm, s.ys_mm)
        b = np.nan_to_num(s.bmag_t, nan=0.0)
        vmax = float(np.nanpercentile(b, 99.5)) or 1.0
        cf = ax.contourf(X, Y, b, levels=np.linspace(0, vmax, 24), cmap="turbo", extend="max")
        try:
            ax.contour(X, Y, s.a_reconstructed, levels=14, colors="k", linewidths=0.35, alpha=0.65)
        except Exception:
            pass
        _draw_machine_circles(ax, s.geometry, color="white", lw=0.9)
        ax.set_aspect("equal")
        ax.set_title(ttl)
        ax.set_xlabel("x (mm)")
        ax.set_ylabel("y (mm)")
        fig.colorbar(cf, ax=ax, fraction=0.046, pad=0.02, label="|B| (T)")
    fig.suptitle(
        "FE Front FEMM — magnets alone vs magnets + copper (Path B kit-case)",
        fontsize=12,
    )
    fig.tight_layout()
    pcmp = out / "05-oc-vs-loaded-compare.png"
    fig.savefig(pcmp, facecolor="white")
    plt.close(fig)
    artefacts.append(pcmp.name)
    _thumb(pcmp, show / "field-05-oc-vs-loaded.jpg")

    # Manifest
    def _stats(s: FieldSample) -> dict[str, Any]:
        b = s.bmag_t[np.isfinite(s.bmag_t)]
        return {
            "label": s.label,
            "n_probes": s.n_probes,
            "solve_seconds": round(s.solve_seconds, 2),
            "bmag_peak_t": float(np.max(b)) if b.size else None,
            "bmag_p99_t": float(np.percentile(b, 99)) if b.size else None,
            "bmag_mean_t": float(np.mean(b)) if b.size else None,
            "operating_point": s.operating_point,
            "geometry_mm": s.geometry,
        }

    manifest = {
        "schema": "forgeos.motor_stack.em_fia_fieldplot_pack/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "status": "SCREEN_FIELD_MAPS",
        "source_twin": str(twin),
        "source_state_sha256": state_hash,
        "solver": {
            "name": "xfemm femmcli",
            "path": str(solver),
            "deck": "em_fia_front_kit_case._build_fia_lua (Path B geometry)",
        },
        "grid": {"full_n": n, "zoom_n": zoom_n, "full_probes": n * n},
        "cases": {k: _stats(v) for k, v in samples.items()},
        "artefacts": artefacts,
        "interactive_html": [
            a for a in artefacts if a.endswith(".html")
        ],
        "honesty": {
            "dimensionality": "2D planar magnetostatic FEMM; 3D plots are "
            "presentation of the 2D |B| field (height/colour), not a 3D FE solve",
            "flux_lines": "contours of A_z (FEMM A or reconstructed from By)",
            "not_claimed": [
                "3D end-winding field",
                "dyno correlation",
                "closed MTPA / demag map",
                "ship_ok / homologation",
            ],
        },
        "release_statement": (
            "Field-plot SCREEN only. Same Path B kit-case deck as the torque "
            "campaign. ship_ok false. Lean-in visualisation of magnets ↔ copper, "
            "not race evidence."
        ),
        "remanence_t": remanence_t,
        "loaded_path_b_op": asdict(loaded),
    }
    man_path = out / "fieldplot_pack_manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Cover card for the pack
    _write_cover(out / "00-fieldplot-cover.png", manifest)
    _thumb(out / "00-fieldplot-cover.png", show / "field-00-cover.jpg")

    print(f"[fieldplot] wrote pack → {out}", flush=True)
    print(f"[fieldplot] interactive: {out / '02-loaded-full_interactive3d.html'}", flush=True)
    print(f"[fieldplot] show thumbs → {show}", flush=True)
    return out


def _write_cover(path: Path, manifest: dict[str, Any]) -> None:
    fig, ax = plt.subplots(figsize=(11, 6.2), dpi=150)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.set_facecolor("#f7f5f0")
    fig.patch.set_facecolor("#f7f5f0")
    ax.text(0.05, 0.88, "FE Front — FEMM Field Plot Pack", fontsize=20, weight="bold", color="#1a1a1a")
    ax.text(0.05, 0.78, "Magnets ↔ copper · Path B kit-case deck · lean-in |B| maps", fontsize=12, color="#333")
    cases = manifest.get("cases") or {}
    y = 0.62
    for key, label in (
        ("oc_full", "Open circuit (magnets alone)"),
        ("loaded_path_b_full", "Loaded Path B (−30° elec.)"),
        ("loaded_path_b_pole_zoom", "Loaded pole-pair zoom"),
    ):
        c = cases.get(key) or {}
        ax.text(
            0.05,
            y,
            f"• {label}:  peak |B| = {c.get('bmag_peak_t', float('nan')):.3f} T   "
            f"p99 = {c.get('bmag_p99_t', float('nan')):.3f} T   "
            f"({c.get('solve_seconds', '?')} s, {c.get('n_probes', '?')} probes)",
            fontsize=11,
            color="#222",
            family="monospace",
        )
        y -= 0.09
    ax.text(
        0.05,
        0.22,
        "Includes: Tony-style 2D maps · B quivers · 3D |B| landscapes · "
        "interactive HTML · air-gap ring",
        fontsize=10,
        color="#444",
    )
    ax.text(
        0.05,
        0.12,
        "ship_ok = false  ·  2D planar FEMM  ·  not dyno  ·  not 3D end-winding FE",
        fontsize=10,
        color="#8b1a1a",
        weight="bold",
    )
    ax.text(0.05, 0.04, f"ran_at {manifest.get('ran_at')}", fontsize=8, color="#666")
    fig.savefig(path, facecolor=fig.get_facecolor())
    plt.close(fig)


def _selftest() -> int:
    """Cheap unit checks without a full FEMM solve."""
    xs, ys, pts = _cartesian_grid(50.0, 5)
    assert len(pts) == 25
    assert xs[0] < 0 < xs[-1]
    # inject probes
    lua = "show_console()\nquit()\n"
    out = _inject_probes(lua, [(1.0, 2.0), (3.0, 4.0)])
    assert "mo_getpointvalues(1.00000000,2.00000000)" in out
    assert PROBE_PREFIX in out
    assert out.strip().endswith("quit()")
    print("em_fia_fieldplot_pack _selftest: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    ap.add_argument("--n", type=int, default=DEFAULT_N, help="full-map grid side")
    ap.add_argument("--zoom-n", type=int, default=DEFAULT_ZOOM_N)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    run_pack(args.twin, n=args.n, zoom_n=args.zoom_n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
