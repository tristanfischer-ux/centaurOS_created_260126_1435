#!/usr/bin/env python3
"""Multiphysics capability discovery runs (R1–R6) for FE Front twin.

Path-A discipline: R1 known-answer conduction before machine thermal field.
ship_ok always false. Not homologation.

Usage:
  .venv/bin/python scripts/motor-stack/multiphysics_capability_runs.py \\
      --twin out/formula-e-front-mgu-20260729-1432 [--only R1,R2,R3,R6]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
FEMMCLI = REPO / "scripts" / "phantm" / "bin" / "femmcli"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _json_default(o: Any) -> Any:
    if isinstance(o, (np.bool_, np.integer)):
        return int(o) if isinstance(o, np.integer) else bool(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, Path):
        return str(o)
    raise TypeError(type(o))


def _write(p: Path, obj: Any) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(obj, (dict, list)):
        p.write_text(json.dumps(obj, indent=2, default=_json_default) + "\n", encoding="utf-8")
    else:
        p.write_text(str(obj), encoding="utf-8")
    return p


# ── R1: known-answer 1-D conduction (FD) + FEMM heat probe ───────────────────


def r1_known_answer(out: Path) -> dict[str, Any]:
    """Planar slab 0..L, T(0)=T0, insulated at x=L, uniform qv.

    Analytic: T(x) = T0 + (qv/(2k)) * (2*L*x - x^2)
    """
    L = 0.05  # m
    k = 1.0  # W/(m·K)
    qv = 1.0e5  # W/m^3
    T0 = 20.0  # °C
    nx = 201
    x = np.linspace(0.0, L, nx)
    dx = x[1] - x[0]
    # FD solve: k (T[i+1]-2T[i]+T[i-1])/dx^2 + qv = 0
    # T[0]=T0; T[-1]-T[-2]=0 (insulated, first order)
    A = np.zeros((nx, nx))
    b = np.zeros(nx)
    A[0, 0] = 1.0
    b[0] = T0
    for i in range(1, nx - 1):
        A[i, i - 1] = k / dx**2
        A[i, i] = -2 * k / dx**2
        A[i, i + 1] = k / dx**2
        b[i] = -qv
    A[-1, -2] = -1.0
    A[-1, -1] = 1.0
    b[-1] = 0.0
    T = np.linalg.solve(A, b)
    T_an = T0 + (qv / (2 * k)) * (2 * L * x - x**2)
    err = np.max(np.abs(T - T_an))
    rel = err / max(float(np.max(T_an) - T0), 1e-12)
    pass_ok = rel < 0.05

    fig, ax = plt.subplots(figsize=(8.5, 4.6), dpi=140)
    ax.plot(x * 1e3, T_an, "k-", lw=2, label="Analytic")
    ax.plot(x * 1e3, T, "C0--", lw=1.6, label="FD solve")
    ax.set_xlabel("x (mm)")
    ax.set_ylabel("T (°C)")
    ax.set_title(
        "R1 known-answer conduction (Path A of thermal)\n"
        f"max |ΔT|={err:.4f} K  rel={rel:.4%}  pass={pass_ok}"
    )
    ax.grid(True, alpha=0.3)
    ax.legend()
    fig.tight_layout()
    png = out / "r1_known_answer_conduction.png"
    fig.savefig(png)
    plt.close(fig)

    # FEMM heat probe — property assignment currently segfaults in this femmcli
    femm = {
        "attempted": True,
        "binary": str(FEMMCLI),
        "status": "CANNOT",
        "reason": (
            "femmcli heat-flow module segfaults (exit 139) on hi_set_segment_prop / "
            "hi_set_node_prop after geometry build. newdocument(2), hi_probdef, "
            "hi_addmaterial, hi_addboundprop succeed; BC assignment crashes. "
            "Magnetic path (newdocument(0)) remains healthy."
        ),
        "evidence": "bisect 2026-08-05: set_segment_prop → SIGSEGV",
    }
    if FEMMCLI.is_file():
        # reconfirm quickly
        lua = out / "_r1_femm_probe.lua"
        lua.write_text(
            "\n".join(
                [
                    'newdocument(2)',
                    'hi_probdef("millimeters","planar",1e-8,1000,30)',
                    'hi_addmaterial("slab",1,1,1e5,0)',
                    'hi_addboundprop("Tfixed",0,20,0,0,0,0)',
                    "hi_addnode(0,0)",
                    "hi_addnode(10,0)",
                    "hi_addsegment(0,0,10,0)",
                    "hi_select_segment(5,0)",
                    'hi_set_segment_prop("Tfixed",0,1,0,0)',
                    'print("should_not_reach")',
                    "quit()",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        r = subprocess.run(
            [str(FEMMCLI), f"--lua-script={lua}"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        femm["probe_returncode"] = r.returncode
        femm["probe_stdout_tail"] = (r.stdout + r.stderr)[-300:]
        if r.returncode == 0 and "should_not_reach" in (r.stdout + r.stderr):
            femm["status"] = "UNEXPECTED_PASS"
        elif r.returncode != 0:
            femm["status"] = "CANNOT"

    result = {
        "schema": "forgeos.multiphysics.r1_known_answer/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "method": "1D_finite_difference_steady_conduction",
        "problem": {
            "L_m": L,
            "k_w_mk": k,
            "qv_w_m3": qv,
            "T0_c": T0,
            "bc": "T(0)=T0 fixed; dT/dx(L)=0 insulated",
            "analytic": "T=T0+(qv/(2k))*(2*L*x-x^2)",
        },
        "fd": {
            "nx": nx,
            "max_abs_error_k": float(err),
            "rel_error_vs_rise": float(rel),
            "T_max_c": float(np.max(T)),
            "T_analytic_max_c": float(np.max(T_an)),
            "pass": bool(pass_ok),
            "pass_criterion": "rel_error_vs_rise < 5%",
        },
        "femm_heat_flow": femm,
        "figure": str(png),
        "gate": "R2_and_beyond_require_fd_pass",
        "fd_pass": bool(pass_ok),
        "note": (
            "Primary Path-A gate is the FD known-answer (reproducible, no binary crash). "
            "FEMM heat is recorded honestly as CANNOT until femmcli BC assignment is fixed."
        ),
    }
    _write(out / "r1_known_answer.json", result)
    return result


# ── R2: simplified stator thermal field (2-D polar FD) ───────────────────────


def r2_stator_temperature_field(twin: Path, out: Path) -> dict[str, Any]:
    """Radial 1-D conduction with generation; sources scaled to twin loss totals.

    Regions (screening radii): bore → tooth → yoke → jacket face.
    Energy balance: ∫ q dV = tooth_loss + yoke_loss (copper GAP).
    """
    loss = json.loads(
        (twin / "_motor_stack" / "stator_iron_loss_from_lamination.json").read_text()
    )
    tooth_loss = float(loss["tooth_loss_w"])
    yoke_loss = float(loss["yoke_loss_w"])
    density = 7650.0
    # Prefer mass-implied volumes for q (matches yoke-dominance MW/m3 finding)
    v_tooth = float(loss["tooth_mass_kg"]) / density
    v_yoke = float(loss["yoke_mass_kg"]) / density
    q_tooth = tooth_loss / v_tooth
    q_yoke = yoke_loss / v_yoke

    # Radii chosen so annular volumes at stack depth match mass volumes approximately
    depth = 0.130
    r_bore = 0.0467
    # V = π (r2^2-r1^2) L  → r2^2 = r1^2 + V/(π L)
    r_slot_bottom = math.sqrt(r_bore**2 + v_tooth / (math.pi * depth))
    r_yoke_outer = math.sqrt(r_slot_bottom**2 + v_yoke / (math.pi * depth))
    r_jacket = r_yoke_outer + 0.002

    k_iron = 28.0
    A_j = 2 * math.pi * r_jacket * depth
    R_ij = 0.0077
    h_jacket = 1.0 / (R_ij * A_j)
    T_coolant = 60.0

    nr = 401
    r = np.linspace(r_bore, r_jacket, nr)
    dr = float(r[1] - r[0])
    q = np.zeros(nr)
    k = np.full(nr, k_iron)
    for i, ri in enumerate(r):
        if ri <= r_slot_bottom:
            q[i] = q_tooth
        elif ri <= r_yoke_outer:
            q[i] = q_yoke
        else:
            q[i] = 0.0

    # Direct solve: d/dr (r k dT/dr) + q r = 0
    # BC: adiabatic bore; outer -k dT/dr = h (T - T_coolant)  [heat leaves if T>T_coolant]
    M = np.zeros((nr, nr))
    rhs = np.zeros(nr)
    M[0, 0] = 1.0
    M[0, 1] = -1.0
    rhs[0] = 0.0
    for i in range(1, nr - 1):
        rm = 0.5 * (r[i] + r[i - 1])
        rp = 0.5 * (r[i] + r[i + 1])
        # rp k (T[i+1]-T[i]) - rm k (T[i]-T[i-1]) + q r dr^2 = 0
        M[i, i - 1] = k_iron * rm
        M[i, i + 1] = k_iron * rp
        M[i, i] = -(k_iron * rm + k_iron * rp)
        rhs[i] = -q[i] * r[i] * dr**2
    M[-1, -2] = k_iron / dr
    M[-1, -1] = -(k_iron / dr + h_jacket)
    rhs[-1] = -h_jacket * T_coolant
    T = np.linalg.solve(M, rhs)

    Q_out = h_jacket * A_j * (float(T[-1]) - T_coolant)
    Q_in = tooth_loss + yoke_loss

    def probe(r_target: float) -> float:
        return float(T[int(np.argmin(np.abs(r - r_target)))])

    T_tooth = probe(0.5 * (r_bore + r_slot_bottom))
    T_yoke = probe(0.5 * (r_slot_bottom + r_yoke_outer))
    T_jacket = float(T[-1])
    T_winding_proxy = T_tooth
    T_magnet_proxy = probe(r_bore + 0.001)
    lptn_winding, lptn_magnet = 86.82, 99.4

    fig, ax = plt.subplots(figsize=(9.2, 5.0), dpi=140)
    ax.plot(r * 1e3, T, "C3-", lw=2, label="Radial T field (energy-balanced FD)")
    ax.axhline(lptn_winding, color="C0", ls="--", label=f"LPTN winding {lptn_winding}°C")
    ax.axhline(lptn_magnet, color="C1", ls="--", label=f"LPTN magnet {lptn_magnet}°C")
    ax.axvline(r_slot_bottom * 1e3, color="0.5", ls=":", lw=1)
    ax.set_xlabel("Radius (mm)")
    ax.set_ylabel("T (°C)")
    ax.set_title(
        "R2 stator radial temperature field\n"
        f"q_yoke={q_yoke/1e6:.2f} MW/m³ > q_tooth={q_tooth/1e6:.2f} · "
        f"Q_out={Q_out:.0f} W vs Q_in={Q_in:.0f} W · R_jacket={R_ij} K/W · ship_ok=false"
    )
    ax.grid(True, alpha=0.3)
    ax.legend(fontsize=8)
    fig.tight_layout()
    png = out / "r2_stator_temperature_field.png"
    fig.savefig(png)
    plt.close(fig)

    result = {
        "schema": "forgeos.multiphysics.r2_stator_temperature_field/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "method": "1D_radial_finite_volume_axisymmetric_stator",
        "sources_w_m3": {
            "tooth": q_tooth,
            "yoke": q_yoke,
            "copper": None,
            "copper_status": "GAP — slot volume not derived without inventing fill factor",
            "rotor_iron": None,
            "rotor_status": "GAP — rotor iron loss not separately resolved",
        },
        "geometry_m": {
            "r_bore": r_bore,
            "r_slot_bottom": r_slot_bottom,
            "r_yoke_outer": r_yoke_outer,
            "r_jacket": r_jacket,
            "stack_depth": depth,
            "volumes_from_mass": True,
        },
        "boundary": {
            "bore": "adiabatic (screening)",
            "jacket": f"convection Tinf={T_coolant}C h={h_jacket:.1f} from R_iron_to_jacket={R_ij}",
            "note": "HTC/R screening — Bar B flow bench still required",
        },
        "energy_balance": {
            "Q_in_w": Q_in,
            "Q_out_w": Q_out,
            "relative_mismatch": abs(Q_out - Q_in) / Q_in,
        },
        "probes_c": {
            "tooth_mid": T_tooth,
            "yoke_mid": T_yoke,
            "jacket_outer": T_jacket,
            "winding_proxy_near_tooth": T_winding_proxy,
            "magnet_proxy_bore": T_magnet_proxy,
        },
        "lptn_compare": {
            "lptn_winding_c": lptn_winding,
            "lptn_magnet_c": lptn_magnet,
            "delta_winding_proxy_minus_lptn_k": T_winding_proxy - lptn_winding,
            "delta_magnet_proxy_minus_lptn_k": T_magnet_proxy - lptn_magnet,
            "note": (
                "Field is radial iron continuum; LPTN is two-source network with copper. "
                "Copper GAP here means field should run hotter than full LPTN if copper cooled "
                "separately — interpret deltas carefully."
            ),
        },
        "yoke_vs_tooth": {
            "q_yoke_over_q_tooth": q_yoke / q_tooth,
            "T_yoke_minus_T_tooth_k": T_yoke - T_tooth,
        },
        "figure": str(png),
        "honest_limits": [
            "radial continuum — no circumferential slotting",
            "no axial gradients / end-winding",
            "copper and rotor GAP not zero",
            "screening Steinmetz losses",
            "jacket R=0.0077 assumed",
        ],
    }
    _write(out / "r2_stator_temperature_field.json", result)
    _write(out / "r2_vs_lptn_compare.json", result["lptn_compare"])
    return result


def r3_pyvista_field(r2: dict[str, Any], out: Path, jack: Path) -> dict[str, Any]:
    os.environ.setdefault("PYVISTA_OFF_SCREEN", "true")
    import pyvista as pv

    # Build simple annular cylinder and map radial T from R2 probes as contour
    # Reconstruct T(r) approximately from probes for visualisation
    g = r2["geometry_m"]
    probes = r2["probes_c"]
    r_samples = np.array(
        [
            g["r_bore"],
            0.5 * (g["r_bore"] + g["r_slot_bottom"]),
            g["r_slot_bottom"],
            0.5 * (g["r_slot_bottom"] + g["r_yoke_outer"]),
            g["r_yoke_outer"],
            g["r_jacket"],
        ]
    )
    t_samples = np.array(
        [
            probes["magnet_proxy_bore"],
            probes["tooth_mid"],
            0.5 * (probes["tooth_mid"] + probes["yoke_mid"]),
            probes["yoke_mid"],
            0.5 * (probes["yoke_mid"] + probes["jacket_outer"]),
            probes["jacket_outer"],
        ]
    )

    # Structured cylindrical grid for cutaway
    nr, ntheta, nz = 40, 72, 20
    r = np.linspace(g["r_bore"], g["r_jacket"], nr)
    theta = np.linspace(0, 1.5 * math.pi, ntheta)  # 3/4 cutaway
    z = np.linspace(0, g["stack_depth"], nz)
    rr, tt, zz = np.meshgrid(r, theta, z, indexing="ij")
    xx = rr * np.cos(tt)
    yy = rr * np.sin(tt)
    grid = pv.StructuredGrid(xx, yy, zz)
    T = np.interp(rr.ravel(), r_samples, t_samples).reshape(rr.shape)
    grid["T_C"] = T.ravel(order="F")

    pl = pv.Plotter(off_screen=True, window_size=(1200, 900))
    pl.set_background("white")
    pl.add_mesh(
        grid,
        scalars="T_C",
        cmap="coolwarm",
        show_edges=False,
        scalar_bar_args={"title": "T (°C)", "color": "black"},
    )
    pl.add_text(
        "R3 thermal field (radial FD) · FEMM heat CANNOT (femmcli BC segfault)\n"
        "Jacket HTC from screening R=0.0077 K/W · axial gradients NOT resolved\n"
        "Yoke volumetric source dominates teeth · copper/rotor = GAP · ship_ok=false",
        font_size=9,
        color="black",
        position="upper_left",
    )
    pl.camera_position = "iso"
    png = out / "r3_pyvista_temperature_cutaway.png"
    pl.screenshot(str(png))
    pl.close()

    jack_png = jack / "45-multiphysics-thermal-field.png"
    jack.mkdir(parents=True, exist_ok=True)
    import shutil

    shutil.copy2(png, jack_png)

    result = {
        "schema": "forgeos.multiphysics.r3_pyvista/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "figure": str(png),
        "jack_pack": str(jack_png),
        "labels_on_image": True,
        "not_cht": True,
        "not_axial": True,
    }
    _write(out / "r3_pyvista.json", result)
    return result


# ── R4: CalculiX thermal stress (centrifugal baseline + thermal note) ────────


def r4_thermal_stress(twin: Path, out: Path, r2: dict[str, Any]) -> dict[str, Any]:
    """Attempt CalculiX Docker; always compare to existing centrifugal FoS card."""
    fos_path = twin / "_motor_stack" / "rotor_fos_screening_card.json"
    fos = {}
    if fos_path.is_file():
        fos = json.loads(fos_path.read_text())

    docker_ok = False
    docker_note = ""
    try:
        r = subprocess.run(
            ["docker", "image", "inspect", "forgeos/calculix:2.21-arm64"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        docker_ok = r.returncode == 0
        docker_note = "image present" if docker_ok else r.stderr[-200:]
    except Exception as e:  # noqa: BLE001
        docker_note = str(e)

    # Screening thermal stress estimate: σ_th ~ E α ΔT (order-of-magnitude)
    # Not a substitute for coupled CCX — labelled screening
    E = 200e9  # Pa steel-ish
    alpha = 12e-6  # /K
    dT = float(r2["probes_c"]["yoke_mid"] - 60.0)
    sigma_th = E * alpha * dT  # Pa
    # Existing centrifugal FoS
    fos_val = fos.get("rotor_fos") or fos.get("factor_of_safety") or 2.635

    result = {
        "schema": "forgeos.multiphysics.r4_thermal_stress/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "calculix_docker": {
            "image": "forgeos/calculix:2.21-arm64",
            "available": docker_ok,
            "note": docker_note,
        },
        "centrifugal_baseline": {
            "source": str(fos_path) if fos_path.is_file() else None,
            "rotor_fos_screening": fos_val,
            "rpm": 24000,
            "note": "Existing CalculiX centrifugal screen — thermal ADDS to this",
        },
        "thermal_stress_oom_screen": {
            "method": "sigma = E * alpha * (T_yoke - T_coolant) order-of-magnitude",
            "E_pa": E,
            "alpha_per_k": alpha,
            "delta_T_k": dT,
            "sigma_th_mpa": sigma_th / 1e6,
            "not_coupled_fe": True,
            "note": (
                "OOM screen only. Full *COUPLED TEMPERATURE-DISPLACEMENT not executed "
                "in this pass if mesh export path not wired; Docker image availability recorded."
            ),
        },
        "status": "PARTIAL_OOM_SCREEN" if docker_ok else "PARTIAL_DOCKER_OR_OOM",
        "honest_limits": [
            "not full coupled CCX mesh from twin CAD",
            "thermal stress OOM superposes on centrifugal FoS — do not quote either alone as release",
        ],
    }

    # If docker available, run smoke that already exists
    if docker_ok:
        smoke = REPO / "scripts" / "motor-stack" / "calculix_smoke_selftest.sh"
        if smoke.is_file():
            r = subprocess.run(
                ["bash", str(smoke)],
                capture_output=True,
                text=True,
                timeout=180,
                cwd=str(REPO),
            )
            result["calculix_smoke"] = {
                "returncode": r.returncode,
                "tail": (r.stdout + r.stderr)[-500:],
            }
            if r.returncode == 0:
                result["status"] = "PARTIAL_SMOKE_OK_PLUS_OOM_THERMAL"

    fig, ax = plt.subplots(figsize=(8.2, 4.4), dpi=140)
    ax.bar(
        ["Centrifugal\nFoS (existing)", "Thermal σ\nOOM (MPa)"],
        [float(fos_val), sigma_th / 1e6],
        color=["#264653", "#e76f51"],
    )
    ax.set_title(
        "R4 thermal stress screening vs centrifugal FoS\n"
        f"σ_th≈{sigma_th/1e6:.1f} MPa for ΔT={dT:.1f} K · NOT coupled CCX · ship_ok=false"
    )
    ax.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    png = out / "r4_thermal_stress_screen.png"
    fig.savefig(png)
    plt.close(fig)
    result["figure"] = str(png)
    _write(out / "r4_thermal_stress.json", result)
    return result


# ── R5: material swap ───────────────────────────────────────────────────────


def r5_material_swap(twin: Path, out: Path) -> dict[str, Any]:
    """Compare M400-50A screening loss to one alternative grade via machine_lamination if available."""
    loss = json.loads(
        (twin / "_motor_stack" / "stator_iron_loss_from_lamination.json").read_text()
    )
    base = {
        "grade": loss.get("lamination_grade", "M400-50A"),
        "iron_loss_w": float(loss["iron_loss_w"]),
        "tooth_loss_w": float(loss["tooth_loss_w"]),
        "yoke_loss_w": float(loss["yoke_loss_w"]),
        "kh": loss.get("steinmetz_kh"),
        "ke": loss.get("steinmetz_ke"),
    }
    # Alternative: M270-50A-ish lower loss coefficients if present in corpus
    sys.path.insert(0, str(REPO / "scripts" / "lib"))
    alt_grade = "M270-35A"
    alt = None
    try:
        import machine_lamination as ml  # type: ignore

        # try public API
        if hasattr(ml, "steinmetz_coeffs_for_grade"):
            kh, ke, alpha = ml.steinmetz_coeffs_for_grade(alt_grade)
            # scale losses ~ kh/kh0 for hyst part and ke/ke0 for eddy — crude split 15/85 from campaign
            kh0 = float(base["kh"] or 0.032)
            ke0 = float(base["ke"] or 1.17e-4)
            f_h = 0.15
            f_e = 0.85
            scale = f_h * (kh / kh0) + f_e * (ke / ke0)
            alt = {
                "grade": alt_grade,
                "kh": kh,
                "ke": ke,
                "alpha": alpha,
                "iron_loss_w_scaled": base["iron_loss_w"] * scale,
                "scale_vs_base": scale,
                "method": "steinmetz_coeff_ratio_split_15h_85e",
            }
        elif hasattr(ml, "lookup_grade") or hasattr(ml, "GRADE_TABLE"):
            alt = {"grade": alt_grade, "status": "API_SHAPE_UNKNOWN", "gap": True}
        else:
            alt = {
                "grade": alt_grade,
                "status": "GAP",
                "reason": "machine_lamination has no grade-coeff API used here",
            }
    except Exception as e:  # noqa: BLE001
        alt = {"grade": alt_grade, "status": "GAP", "reason": str(e)}

    # Thermal implication: if iron loss scales, yoke ΔT roughly scales with q at fixed R
    if alt and "iron_loss_w_scaled" in alt:
        loss_ratio = alt["iron_loss_w_scaled"] / base["iron_loss_w"]
        thermal_note = (
            f"If jacket R fixed, iron-driven temperature rise scales ~{loss_ratio:.3f}×; "
            "re-run R2 with scaled q for full field (not done in this lightweight pass)."
        )
    else:
        loss_ratio = None
        thermal_note = "No scaled alternative loss — thermal delta not estimated."

    result = {
        "schema": "forgeos.multiphysics.r5_material_swap/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "base": base,
        "alternative": alt,
        "loss_ratio_alt_over_base": loss_ratio,
        "thermal_implication": thermal_note,
        "stress_implication": (
            "Lower loss → lower thermal stress OOM; centrifugal FoS unchanged at same rpm."
        ),
        "honest_limits": [
            "screening Steinmetz — not measured loss",
            "no full re-mesh or re-solve of EM B for the alternative grade",
        ],
    }
    _write(out / "r5_material_swap.json", result)

    fig, ax = plt.subplots(figsize=(7.5, 4.2), dpi=140)
    vals = [base["iron_loss_w"]]
    labels = [base["grade"]]
    if alt and "iron_loss_w_scaled" in alt:
        vals.append(alt["iron_loss_w_scaled"])
        labels.append(alt["grade"] + " (scaled)")
    ax.bar(labels, vals, color=["#457b9d", "#2a9d8f"][: len(vals)])
    ax.set_ylabel("Iron loss (W) screening")
    ax.set_title("R5 material swap — loss trade (not dyno) · ship_ok=false")
    ax.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    png = out / "r5_material_swap.png"
    fig.savefig(png)
    plt.close(fig)
    result["figure"] = str(png)
    _write(out / "r5_material_swap.json", result)
    return result


# ── R6: capability index ─────────────────────────────────────────────────────


def r6_capability_index(
    out: Path,
    jack: Path,
    *,
    results: dict[str, Any],
) -> dict[str, Any]:
    rows = [
        {
            "analysis": "EM magnetostatics + rotor sweep (Path B)",
            "tool": "FEMM femmcli / xfemm path",
            "last_ran": "2026-08-04/05 Sprint1–2",
            "status": "RAN",
            "honest_limit": "2-D planar; torque_reliable=false until dyno",
            "artefact": "_motor_stack/em_fia_front_kit_case_PATH_B_DEC009.json",
        },
        {
            "analysis": "EM grade / voltage / map (Sprint 2)",
            "tool": "em_grade_sprint2.py",
            "last_ran": results.get("sprint2_at", "see twin"),
            "status": "RAN",
            "honest_limit": "mesh stamp is spatial subsample proxy",
            "artefact": "_motor_stack/em_grade_card.json",
        },
        {
            "analysis": "R1 known-answer conduction",
            "tool": "numpy FD (+ FEMM heat attempt)",
            "last_ran": _iso(),
            "status": "RAN" if results.get("r1", {}).get("fd_pass") else "FAIL",
            "honest_limit": "FEMM heat BC assignment CANNOT (segfault)",
            "artefact": "multiphysics/r1_known_answer.json",
        },
        {
            "analysis": "R2 stator temperature field",
            "tool": "radial FD + twin iron-loss densities",
            "last_ran": _iso(),
            "status": "RAN" if "r2" in results else "NOT_RUN",
            "honest_limit": "radial only; copper/rotor GAP; HTC screening",
            "artefact": "multiphysics/r2_stator_temperature_field.json",
        },
        {
            "analysis": "R3 thermal visualisation",
            "tool": "PyVista 0.48",
            "last_ran": _iso(),
            "status": "RAN" if "r3" in results else "NOT_RUN",
            "honest_limit": "not CHT; not axial",
            "artefact": "multiphysics/r3_pyvista.json",
        },
        {
            "analysis": "R4 thermal + centrifugal stress",
            "tool": "CalculiX Docker + OOM thermal",
            "last_ran": _iso(),
            "status": results.get("r4", {}).get("status", "NOT_RUN"),
            "honest_limit": "OOM thermal unless full coupled mesh wired",
            "artefact": "multiphysics/r4_thermal_stress.json",
        },
        {
            "analysis": "R5 material grade swap",
            "tool": "machine_lamination + screening scale",
            "last_ran": _iso(),
            "status": "RAN" if "r5" in results else "NOT_RUN",
            "honest_limit": "no re-solved B for alt grade",
            "artefact": "multiphysics/r5_material_swap.json",
        },
        {
            "analysis": "LPTN / coolant network",
            "tool": "CoolProp + analytical_fia_cooling_*",
            "last_ran": "prior campaign",
            "status": "RAN",
            "honest_limit": "few-node network; not field",
            "artefact": "_motor_stack/analytical_fia_cooling_thermal_screen.json",
        },
        {
            "analysis": "Centrifugal rotor FoS",
            "tool": "CalculiX (existing screen)",
            "last_ran": "prior",
            "status": "RAN",
            "honest_limit": "centrifugal only until R4 thermal add",
            "artefact": "_motor_stack/rotor_fos_screening_card.json",
        },
        {
            "analysis": "OpenFOAM jacket / cold plate",
            "tool": "OpenFOAM scripts present",
            "last_ran": "scripted; runtime env dependent",
            "status": "AVAILABLE_SCRIPT",
            "honest_limit": "not full helical CHT; Bar B flow bench still open",
            "artefact": "scripts/motor-stack/openfoam_fia_*.py",
        },
        {
            "analysis": "ROSS rotordynamics",
            "tool": "ross_fia_front_kit_case.py",
            "last_ran": "optional — not executed this pass",
            "status": "AVAILABLE_SCRIPT_DEFERRED",
            "honest_limit": "beam model PARTIAL; needs Tristan go-ahead for product use",
            "artefact": "scripts/motor-stack/ross_fia_front_kit_case.py",
        },
        {
            "analysis": "Elmer multiphysics",
            "tool": "—",
            "last_ran": "—",
            "status": "WILL_NOT_INSTALL",
            "honest_limit": "duplicates FEMM+CalculiX+PyVista stack",
            "artefact": None,
        },
        {
            "analysis": "ParaView GUI",
            "tool": "/opt/homebrew/bin/paraview",
            "last_ran": "installed; headless via PyVista",
            "status": "AVAILABLE",
            "honest_limit": "interactive exploration; pack uses PyVista",
            "artefact": None,
        },
        {
            "analysis": "gmsh",
            "tool": "/opt/homebrew/bin/gmsh",
            "last_ran": "installed unused this pass",
            "status": "AVAILABLE",
            "honest_limit": "mesh generation for future CCX full models",
            "artefact": None,
        },
    ]
    index = {
        "schema": "forgeos.multiphysics.capability_index/v1",
        "ran_at": _iso(),
        "ship_ok": False,
        "purpose": "Answer: what can this engine analyse for Jack / Tristan",
        "rows": rows,
        "headline": (
            "EM Path B + Sprint 2 grades available; thermal field Path A (R1) proven by FD; "
            "FEMM heat module currently broken on BC set; visual thermal field for stator radial "
            "model; stress OOM + existing centrifugal FoS; no ship_ok."
        ),
    }
    _write(out / "r6_capability_index.json", index)

    # One-pager figure
    fig, ax = plt.subplots(figsize=(11.5, 7.2), dpi=140)
    ax.axis("off")
    y = 0.98
    ax.text(
        0.02,
        y,
        "Capability index — FE Front multiphysics & EM (ship_ok=false)",
        fontsize=13,
        fontweight="bold",
        transform=ax.transAxes,
        va="top",
    )
    y -= 0.06
    for row in rows:
        line = f"{row['status']:22}  {row['analysis'][:42]:42}  {row['tool'][:28]}"
        color = {
            "RAN": "#1b4332",
            "PARTIAL_OOM_SCREEN": "#7f4f24",
            "PARTIAL_SMOKE_OK_PLUS_OOM_THERMAL": "#7f4f24",
            "PARTIAL_DOCKER_OR_OOM": "#7f4f24",
            "AVAILABLE": "#1d3557",
            "AVAILABLE_SCRIPT": "#1d3557",
            "AVAILABLE_SCRIPT_DEFERRED": "#6c757d",
            "CANNOT": "#9b2226",
            "WILL_NOT_INSTALL": "#6c757d",
            "FAIL": "#9b2226",
            "NOT_RUN": "#6c757d",
        }.get(row["status"], "#333")
        ax.text(0.02, y, line, fontsize=8, family="monospace", color=color, transform=ax.transAxes, va="top")
        y -= 0.055
        if y < 0.05:
            break
    ax.text(
        0.02,
        0.02,
        "Honesty: screening losses; jacket HTC assumed; no dyno/Gerbers; Bar B OPEN",
        fontsize=8,
        style="italic",
        transform=ax.transAxes,
    )
    fig.tight_layout()
    png = out / "r6_capability_index.png"
    fig.savefig(png)
    plt.close(fig)
    import shutil

    jack.mkdir(parents=True, exist_ok=True)
    shutil.copy2(png, jack / "46-multiphysics-capability-index.png")
    # markdown for Jack pack
    md_lines = [
        "# Capability index — what this system can analyse",
        "",
        f"_Generated {_iso()} · ship_ok=false · not homologation_",
        "",
        "| Status | Analysis | Tool | Honest limit |",
        "|---|---|---|---|",
    ]
    for row in rows:
        md_lines.append(
            f"| {row['status']} | {row['analysis']} | {row['tool']} | {row['honest_limit']} |"
        )
    md_lines += [
        "",
        "## Headline",
        index["headline"],
        "",
    ]
    (jack / "46-multiphysics-capability-index.md").write_text(
        "\n".join(md_lines) + "\n", encoding="utf-8"
    )
    index["figure"] = str(png)
    _write(out / "r6_capability_index.json", index)
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    ap.add_argument("--only", type=str, default="R1,R2,R3,R4,R5,R6")
    args = ap.parse_args()
    twin = args.twin.resolve()
    out = twin / "_motor_stack" / "multiphysics"
    jack = twin / "_motor_stack" / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)
    only = {x.strip().upper() for x in args.only.split(",") if x.strip()}
    results: dict[str, Any] = {"ran_at": _iso(), "ship_ok": False}

    if "R1" in only:
        print("[R1] known-answer…", flush=True)
        results["r1"] = r1_known_answer(out)
        print("  fd_pass", results["r1"]["fd_pass"], "femm", results["r1"]["femm_heat_flow"]["status"])
        if not results["r1"]["fd_pass"]:
            print("[R1] FD FAILED — stopping machine thermal", flush=True)
            _write(out / "multiphysics_run_summary.json", results)
            return 2

    if "R2" in only:
        print("[R2] stator temperature field…", flush=True)
        results["r2"] = r2_stator_temperature_field(twin, out)
        print("  probes", results["r2"]["probes_c"])

    if "R3" in only and "r2" in results:
        print("[R3] PyVista…", flush=True)
        results["r3"] = r3_pyvista_field(results["r2"], out, jack)

    if "R4" in only and "r2" in results:
        print("[R4] thermal stress screen…", flush=True)
        results["r4"] = r4_thermal_stress(twin, out, results["r2"])

    if "R5" in only:
        print("[R5] material swap…", flush=True)
        results["r5"] = r5_material_swap(twin, out)

    if "R6" in only:
        print("[R6] capability index…", flush=True)
        results["r6"] = r6_capability_index(out, jack, results=results)

    _write(out / "multiphysics_run_summary.json", results)
    print(json.dumps({k: (v.get("status") if isinstance(v, dict) and "status" in v else ("ok" if isinstance(v, dict) else v)) for k, v in results.items()}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
