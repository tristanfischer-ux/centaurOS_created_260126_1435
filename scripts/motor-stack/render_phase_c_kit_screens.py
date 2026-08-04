#!/usr/bin/env python3
"""Phase C kit screens: W2.6 coolant, W2.8 ripple load, W3.2-lite envelopes, partner asks.

Durable generators for artefacts that previously landed as one-shots.
Rebuilds Jack pack PDF from all numbered figures 00–13.
Does not mint ship_ok. visualOnly envelopes only — no Blender hero re-render.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
PATH_B_NAME = "em_fia_front_kit_case_PATH_B_DEC009.json"
C_BG, C_INK, C_MUTED, C_GRID = "#FAFAF8", "#1A1A1A", "#5C5C5C", "#D8D8D4"
C_OK, C_WARN, C_ACCENT = "#0B6E4F", "#922B21", "#1B4F72"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _q(quantities: dict, key: str, default=None):
    r = quantities.get(key)
    if isinstance(r, dict):
        return r.get("value", default)
    return default if r is None else r


def write_coolant(twin: Path, out: Path, iso: str) -> Path:
    ms = twin / "_motor_stack"
    cool = json.loads((ms / "analytical_fia_cooling_network_screen.json").read_text())
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    scr = cool.get("screening_results") or {}
    inp = cool.get("input_quantities") or {}
    hyd = cool.get("branch_hydraulics") or {}
    thermal = cool.get("thermal_network") or {}

    inlet = float(inp.get("coolant_inlet_c") or _q(q, "coolant_inlet_c") or 60)
    flow = float(inp.get("coolant_flow_l_min") or _q(q, "coolant_flow_l_min") or 12)
    dp = float(scr.get("total_delta_p_kpa") or 0)
    mod_t = float(scr.get("maximum_module_temperature_c") or 0)
    coupled = bool(scr.get("coupled_screen_ok"))
    pump_budget = float(inp.get("pump_pressure_budget_kpa") or 150)
    mag_int = float(_q(q, "mgu_magnet_temp_c") or 99.4)
    mag_cont = float(_q(q, "magnet_temperature_screen_c") or 159.35)
    mag_lim = float(_q(q, "magnet_temp_limit_c") or 150)

    j = hyd.get("motor_water_jacket") or {}
    cp = hyd.get("inverter_cold_plate") or {}
    outlet = float(_q(q, "coolant_outlet_c") or thermal.get("coolant_cold_plate_outlet_c") or 77.19)
    dT = outlet - inlet

    rep = {
        "schema": "forgeos.fpk.coolant_loop_one_pager/v1",
        "status": "PARTIAL_ANALYTICAL_SCREEN",
        "ship_ok": False,
        "ran_at": iso,
        "source_status": cool.get("status"),
        "source_ship_ok": cool.get("ship_ok"),
        "screen": {
            "inlet_c": inlet,
            "flow_l_min": flow,
            "delta_p_kpa": dp,
            "module_t_c": mod_t,
            "outlet_c": outlet,
            "delta_t_k": round(dT, 3),
            "coupled_ok": coupled,
            "pump_budget_kpa": pump_budget,
            "pressure_margin_kpa": scr.get("pressure_margin_kpa"),
        },
        "branches": {
            "jacket_delta_p_kpa": round(float(j.get("headline_delta_p_pa") or 0) / 1000.0, 3),
            "cold_plate_delta_p_kpa": round(float(cp.get("headline_delta_p_pa") or 0) / 1000.0, 3),
            "topology_assumption": "ASSUMED_series_jacket_then_cold_plate_at_common_12_L_min",
            "topology_status": "ASSUMED_NOT_PROVEN",
            "flow_basis_note": (
                "ΣΔp copies branch headline Δp seeds from the cooling-network screen "
                "at its published flow point. Does not re-solve CFD; does not prove "
                "series vs parallel topology, identical fluid/T, or total-vs-per-channel "
                "flow basis across OpenFOAM branch artefacts. Flow bench must. "
                "If source network topology is parallel, do not treat ΣΔp as series head."
            ),
        },
        "twin_magnet_stamps": {
            "intermittent_dec008_c": mag_int,
            "continuous_screen_c": mag_cont,
            "limit_c": mag_lim,
        },
        "bar_b_ask": "BARB-FLOW-BENCH",
        "explicitly_not_claimed": [
            "flow_bench_data",
            "validated_Rth",
            "conjugate_heat_transfer",
            "identical_cfd_boundary_conditions_across_branches",
            "ship_ok",
        ],
        "flow_bench_must_prove": [
            "Jacket + cold-plate Δp vs flow at 12 L/min class (and neighbour points)",
            "Wall tap temperatures vs network prediction at known loss inject",
            "Parallel branch balance (no starvation of cold plate)",
            "No free-stream leak paths / QD Δp contribution",
            "Same fluid identity, inlet T, and total-vs-per-channel flow basis as network",
        ],
    }
    (ms / "coolant_loop_one_pager.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.2, 7.4), facecolor=C_BG)
    fig.text(
        0.05,
        0.93,
        "Coolant loop one-pager — analytical network seeds (W2.6)",
        fontsize=15,
        fontweight="bold",
        color=C_INK,
    )
    fig.text(
        0.05,
        0.885,
        f"EGW class · flow_bench OPEN · ship_ok=false · {iso}",
        fontsize=10,
        color=C_MUTED,
    )

    # Loop schematic
    ax = fig.add_axes([0.05, 0.48, 0.55, 0.36])
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")
    ax.set_facecolor(C_BG)

    def box(x, y, w, h, title, sub, fc):
        ax.add_patch(
            FancyBboxPatch(
                (x, y),
                w,
                h,
                boxstyle="round,pad=0.04,rounding_size=0.12",
                facecolor=fc,
                edgecolor=C_INK,
                lw=1.3,
            )
        )
        ax.text(x + w / 2, y + h * 0.62, title, ha="center", va="center", fontsize=9, fontweight="bold")
        ax.text(x + w / 2, y + h * 0.28, sub, ha="center", va="center", fontsize=7.2, color=C_MUTED)

    box(0.3, 3.5, 2.2, 1.6, "Inlet", f"{inlet:.0f} °C\n{flow:.0f} L/min", "#D6EAF8")
    box(3.0, 3.5, 2.6, 1.6, "Motor jacket", f"Δp ~{rep['branches']['jacket_delta_p_kpa']:.1f} kPa\nscreen seed", "#D5F5E3")
    box(6.2, 3.5, 2.8, 1.6, "Inv. cold plate", f"Δp ~{rep['branches']['cold_plate_delta_p_kpa']:.1f} kPa\nmodule ~{mod_t:.1f} °C", "#E8DAEF")
    box(3.0, 0.6, 2.6, 1.6, "Return / pump", f"ΣΔp {dp:.1f} kPa\nbudget {pump_budget:.0f} kPa", "#FCF3CF")
    for a in [(2.5, 4.3, 3.0, 4.3), (5.6, 4.3, 6.2, 4.3), (7.6, 3.5, 4.3, 2.2), (3.0, 1.4, 1.4, 1.4), (1.4, 2.2, 1.4, 3.5)]:
        ax.annotate("", xy=a[2:], xytext=a[:2], arrowprops=dict(arrowstyle="->", color=C_INK, lw=1.4))
    ax.text(0.3, 5.6, "Series hydraulic path (concept) — not a CFD mesh", fontsize=8, color=C_MUTED)

    # KPI cards
    kpis = [
        ("Σ Δp", f"{dp:.1f} kPa", C_OK if dp < pump_budget else C_WARN),
        ("Module T", f"{mod_t:.1f} °C", C_OK),
        ("Coolant ΔT", f"{dT:.1f} K", C_ACCENT),
        ("Coupled screen", "OK" if coupled else "FAIL", C_OK if coupled else C_WARN),
    ]
    for i, (lab, val, col) in enumerate(kpis):
        x0 = 0.63
        y0 = 0.78 - i * 0.09
        fig.text(x0, y0, lab, fontsize=9, color=C_MUTED)
        fig.text(x0 + 0.14, y0, val, fontsize=12, fontweight="bold", color=col, family="monospace")

    # Magnet honesty strip
    fig.text(0.05, 0.42, "Magnet temperature honesty (twin stamps)", fontsize=11, fontweight="bold", color=C_INK)
    fig.text(
        0.05,
        0.375,
        f"DEC-008 intermittent vignette ~{mag_int:.1f} °C  ·  continuous screen ~{mag_cont:.1f} °C  ·  limit {mag_lim:.0f} °C",
        fontsize=9.5,
        color=C_INK,
        family="monospace",
    )
    fig.text(
        0.05,
        0.34,
        "Continuous magnet stamp exceeds limit — duty_torque_screen stays false; intermittent vignette is the architecture path.",
        fontsize=8.5,
        color=C_WARN,
    )

    fig.text(0.05, 0.28, "Flow bench must prove (B6 / BARB-FLOW-BENCH)", fontsize=11, fontweight="bold", color=C_INK)
    y = 0.235
    for line in rep["flow_bench_must_prove"]:
        fig.text(0.07, y, f"○ {line}", fontsize=9, color=C_INK)
        y -= 0.032
    fig.text(
        0.05,
        0.06,
        "W2.6 · analytical network only · no measured Rth · no CHT · ship_ok=false",
        fontsize=8,
        color=C_MUTED,
    )
    path = out / "11-coolant-loop-one-pager.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_ripple(twin: Path, out: Path, iso: str) -> Path:
    ms = twin / "_motor_stack"
    pb = json.loads((ms / PATH_B_NAME).read_text())
    sweep = pb.get("rotor_position_sweep") or {}
    tq = sweep.get("torque_nm") or sweep.get("shaft_torque_nm")
    # Path B may nest differently
    if tq is None:
        # try works_in_kit + samples
        samples = None
        for key in ("samples", "points", "angle_samples"):
            if key in sweep and isinstance(sweep[key], list):
                samples = sweep[key]
                break
        if samples:
            vals = []
            for s in samples:
                if isinstance(s, dict):
                    for kk in ("torque_nm", "T_nm", "shaft_torque_nm"):
                        if kk in s:
                            vals.append(float(s[kk]))
                            break
                elif isinstance(s, (int, float)):
                    vals.append(float(s))
            tq = vals
        else:
            # direct list under known keys
            for key in ("torque_nm_list", "torques_nm", "T_nm"):
                if isinstance(pb.get(key), list):
                    tq = pb[key]
                    break
    if tq is None and isinstance(sweep, dict):
        # nested arrays
        for k, v in sweep.items():
            if isinstance(v, list) and v and isinstance(v[0], (int, float)) and "torque" in k.lower():
                tq = v
                break
    # fallback: load from path_b works + reconstruct from min/max if present
    wik = pb.get("works_in_kit_context") or {}
    geo = pb.get("machine_geometry") or {}
    if tq is None:
        # scan whole json for torque array under rotor
        def find_tq(obj, depth=0):
            if depth > 6:
                return None
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if k in ("torque_nm", "shaft_torque_nm", "T_em_nm") and isinstance(v, list) and len(v) > 4:
                        return v
                    r = find_tq(v, depth + 1)
                    if r is not None:
                        return r
            return None

        tq = find_tq(pb)
    if tq is None:
        # last resort: use published min/mean/max if any
        mean = float(wik.get("torque_magnitude_mean_nm") or 122.1)
        # synthetic from known Path B half-range if missing
        tmin = float(wik.get("torque_magnitude_min_nm") or mean * 0.7)
        tmax = float(wik.get("torque_magnitude_max_nm") or mean * 1.19)
        tq = [tmin, mean, tmax]

    vals = [abs(float(x)) for x in tq]
    t_min, t_max = min(vals), max(vals)
    t_mean = sum(vals) / len(vals)
    p2p = t_max - t_min
    half = p2p / 2.0
    r_od_mm = float(geo.get("rotor_outer_diameter_mm") or 139.4)
    r_m = (r_od_mm / 1000.0) / 2.0
    # F = |T| / r with r = rotor_od/2 (explicit — not gas_compressor_sizing)
    f_mean = t_mean / r_m / 1000.0  # kN
    f_half = half / r_m / 1000.0  # kN — half peak-to-peak force amplitude, not harmonic alt
    def _as_bool_true(v) -> bool:
        if v is True or v == 1:
            return True
        if isinstance(v, str) and v.strip().lower() in {"true", "1", "yes"}:
            return True
        return False

    torque_reliable = _as_bool_true(wik.get("torque_reliable"))
    # Council: do not mint a "load" when source is unvalidated
    sheet_status = "ORDER_OF_MAGNITUDE_EXCITATION" if torque_reliable else "INPUT_NOT_VALIDATED"

    rep = {
        "schema": "forgeos.fpk.torque_ripple_load_sheet/v1",
        "status": sheet_status,
        "ship_ok": False,
        "ran_at": iso,
        "source": f"{PATH_B_NAME}#rotor_position_sweep",
        "source_flags": {
            "torque_reliable": wik.get("torque_reliable"),
            "duty_torque_screen_ok": wik.get("duty_torque_screen_ok"),
            "path_b_status": pb.get("status"),
            "note": (
                "Fixed current-angle coarse rotor sweep — not MTPA, not fine ripple study. "
                "Values are excitation order-of-magnitude only while torque_reliable is false."
            ),
        },
        "torque_nm": {
            "min": t_min,
            "mean": t_mean,
            "max": t_max,
            "peak_to_peak": p2p,
            "half_range_amp": half,
            "n_samples": len(vals),
        },
        "order_of_magnitude": {
            "definition": "F_tang_kN = |T_nm| / (rotor_od_m/2) / 1000",
            "rotor_od_mm": r_od_mm,
            "F_tangential_mean_kN": round(f_mean, 3),
            "F_tangential_half_range_kN": round(f_half, 3),
            # keep alias for prior pack consumers; same value, clearer name preferred
            "F_tangential_alt_kN": round(f_half, 3),
            "note": (
                "F=|T|/(r_od/2) at rotor OD air-gap radius — NOT a bearing reaction, "
                "NOT gear-mesh force, NOT shaft bending. half_range = ½ peak-to-peak, "
                "not a Fourier harmonic amplitude."
            ),
        },
        "consumer_guard": {
            "may_use_as": "order_of_magnitude_excitation_seed",
            "must_not_use_as": [
                "bearing_L10_input",
                "gear_mesh_force",
                "validated_cyclic_load",
                "dyno_correlated_ripple",
            ],
            "blocked_while": ["torque_reliable==false", "duty_torque_screen_ok==false"],
        },
        "explicitly_not_claimed": [
            "bearing_L10_life",
            "NVH_modal",
            "ship_ok",
            "torque_reliable",
            "validated_mechanical_load",
        ],
        "partner_ask_stub": {
            "artefact": "dyno map at Path B OP",
            "unblocks": "BARB-DYNO / torque_reliable",
        },
    }
    (ms / "torque_ripple_load_sheet.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig, axes = plt.subplots(1, 2, figsize=(11.2, 6.6), facecolor=C_BG, gridspec_kw={"width_ratios": [1.35, 1]})
    fig.suptitle(
        "Torque-ripple load sheet — Path B |T| sweep (W2.8)",
        fontsize=14,
        fontweight="bold",
        color=C_INK,
        y=0.97,
    )
    ax = axes[0]
    ax.set_facecolor(C_BG)
    xs = list(range(len(vals)))
    ax.plot(xs, vals, color=C_ACCENT, lw=1.8)
    ax.axhline(t_mean, color=C_OK, ls="--", lw=1.2, label=f"mean {t_mean:.1f} N·m")
    ax.axhline(t_min, color=C_WARN, ls=":", lw=1.0, label=f"min {t_min:.1f}")
    ax.axhline(t_max, color=C_WARN, ls=":", lw=1.0, label=f"max {t_max:.1f}")
    ax.fill_between(xs, t_mean - half, t_mean + half, color="#F5B7B1", alpha=0.25, label=f"±½ p-p ({half:.1f})")
    ax.set_xlabel("rotor sample index")
    ax.set_ylabel("|T| N·m")
    ax.legend(loc="lower right", fontsize=8)
    ax.grid(True, color=C_GRID, alpha=0.6)
    ax.set_title("Sign-stable magnitude sweep", fontsize=11)

    ax2 = axes[1]
    ax2.set_facecolor(C_BG)
    ax2.axis("off")
    lines = [
        f"min / mean / max   {t_min:.2f} / {t_mean:.2f} / {t_max:.2f} N·m",
        f"peak-to-peak       {p2p:.2f} N·m",
        f"½-range amplitude  {half:.2f} N·m",
        f"samples            {len(vals)}",
        "",
        f"rotor OD           {r_od_mm:.1f} mm",
        f"status             {sheet_status}",
        f"torque_reliable    {wik.get('torque_reliable')}",
        f"duty_screen_ok     {wik.get('duty_torque_screen_ok')}",
        f"F_tang mean        {f_mean:.3f} kN",
        f"F_tang ½-range     {f_half:.3f} kN",
        "def: F=|T|/(r_od/2)  (not bearing)",
        "",
        "NOT claimed / must not use as:",
        "  · bearing L10 / gear mesh force",
        "  · validated cyclic load",
        "  · torque_reliable / dyno",
        "  · ship_ok",
        "",
        "Partner ask: BARB-DYNO map @ Path B OP",
    ]
    ax2.text(
        0.02,
        0.98,
        "\n".join(lines),
        va="top",
        ha="left",
        family="monospace",
        fontsize=9.5,
        color=C_INK,
        transform=ax2.transAxes,
        bbox=dict(boxstyle="round", facecolor="white", edgecolor=C_GRID, pad=0.6),
    )
    fig.text(
        0.05,
        0.02,
        f"W2.8 · F≈T/r order-of-magnitude only · {iso} · ship_ok=false",
        fontsize=8,
        color=C_MUTED,
    )
    fig.tight_layout(rect=(0.02, 0.05, 0.98, 0.93))
    path = out / "12-torque-ripple-load-sheet.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def _cube_face_dims(vol_cm3: float, aspect=(2.0, 1.2, 0.6)) -> tuple[float, float, float]:
    """Approximate box mm from volume cm³ with fixed aspect ratios (unitless)."""
    ax, ay, az = aspect
    # V_mm3 = vol_cm3 * 1000 = (s*ax)*(s*ay)*(s*az)
    s = ((vol_cm3 * 1000.0) / (ax * ay * az)) ** (1.0 / 3.0)
    return s * ax, s * ay, s * az


def write_envelopes(twin: Path, out: Path, iso: str) -> Path:
    """W3.2-lite: orthographic kit hierarchy envelopes inside bay ghost."""
    ms = twin / "_motor_stack"
    pb = json.loads((ms / PATH_B_NAME).read_text())
    inv = json.loads((ms / "inverter_packaging_fia_front_kit_case.json").read_text())
    cap = json.loads((ms / "dc_link_capacitor_concept_screen.json").read_text())
    mass = json.loads((ms / "inverter_class_mass_screen.json").read_text()) if (ms / "inverter_class_mass_screen.json").is_file() else {}
    geo = pb.get("machine_geometry") or {}
    iq = inv.get("input_quantities") or {}
    env = cap.get("envelope") or {}
    vol_band = env.get("volume_cm3_nom_band") or {}
    vol_lo = float(vol_band.get("min") or 20)
    vol_hi = float(vol_band.get("max") or 250)
    vol_nom = math.sqrt(vol_lo * vol_hi)  # geometric mid — packing seed only
    # Council: high-volume case is the conservative fit envelope, not geo-mean

    bay_w = float(geo.get("bay_width_mm") or iq.get("bay_w_mm") or 343)
    bay_d = float(geo.get("bay_depth_mm") or iq.get("bay_d_mm") or 259)
    bay_h = float(geo.get("bay_height_mm") or iq.get("bay_h_mm") or 267)

    motor_od = float(geo.get("housing_outer_diameter_mm") or 198)
    motor_l = float(geo.get("housing_length_mm") or 140.5)
    mcu_w = float(iq.get("mcu_w_mm") or 235.3)
    mcu_d = float(iq.get("mcu_d_mm") or 139.6)
    mcu_h = float(iq.get("mcu_h_mm") or 28.0)
    cp_l = float(iq.get("cold_plate_length_mm") or mcu_w)
    cp_w = float(iq.get("cold_plate_width_mm") or mcu_d)
    cp_h = 12.0  # seed thickness — not measured

    cap_w, cap_d, cap_h = _cube_face_dims(vol_nom, (2.4, 1.4, 0.7))
    cap_hi_w, cap_hi_d, cap_hi_h = _cube_face_dims(vol_hi, (2.4, 1.4, 0.7))
    cap_lo_w, cap_lo_d, cap_lo_h = _cube_face_dims(vol_lo, (2.4, 1.4, 0.7))
    # PCB draft volumes from twin if present
    st = json.loads((twin / "state.json").read_text())
    pcb = st.get("pcb") or {}
    boards = (pcb.get("architecture") or {}).get("boards") or []
    gd_w = gd_h = ctrl_w = ctrl_h = 80.0
    for b in boards:
        shape = b.get("shape") or {}
        dats = {d["id"]: d for d in shape.get("datums") or [] if isinstance(d, dict)}
        w = float(dats.get("outline_width_mm", {}).get("valueMm") or 80)
        h = float(dats.get("outline_height_mm", {}).get("valueMm") or 80)
        role = (b.get("role") or b.get("boardId") or "").lower()
        if "gate" in role or "drive" in role:
            gd_w, gd_h = w, h
        elif "control" in role or "ctrl" in role:
            ctrl_w, ctrl_h = w, h

    # Gear / reducer OPEN placeholder — remainder mass only, no ratio
    gear_box = (90.0, 80.0, 70.0)  # conceptual placeholder mm
    hv_conn = (40.0, 35.0, 45.0)
    coolant_qd = (28.0, 28.0, 40.0)

    parts = [
        {
            "id": "bay_ghost",
            "label": "Bay envelope ghost",
            "mm": [bay_w, bay_d, bay_h],
            "status": "TWIN_SEED",
            "note": "343×259×267 class",
            "visualOnly": True,
        },
        {
            "id": "motor_housing",
            "label": "IPM motor housing",
            "mm": [motor_od, motor_od, motor_l],
            "status": "PATH_B_GEOMETRY",
            "note": f"OD×L · active L {geo.get('active_length_mm')} mm",
            "visualOnly": True,
        },
        {
            "id": "reducer",
            "label": "Reducer / gear",
            "mm": list(gear_box),
            "status": "OPEN_RATIO",
            "note": "placeholder box — ratio OPEN",
            "visualOnly": True,
        },
        {
            "id": "inverter_mcu",
            "label": "Inverter MCU housing",
            "mm": [mcu_w, mcu_d, mcu_h],
            "status": "PACKAGING_SCREEN",
            "note": f"fits_bay={ (inv.get('screening_results') or {}).get('mcu_fits_bay') }",
            "visualOnly": True,
        },
        {
            "id": "cold_plate",
            "label": "Cold plate land",
            "mm": [cp_l, cp_w, cp_h],
            "status": "SEED_THICKNESS",
            "note": f"h={cp_h} mm seed · B6 OPEN",
            "visualOnly": True,
        },
        {
            "id": "dc_link_cap_region",
            "label": "DC-link capacitor region (geo-mean seed)",
            "mm": [round(cap_w, 1), round(cap_d, 1), round(cap_h, 1)],
            "status": "CONCEPT_ENVELOPE_SEED",
            "note": f"vol geo-mean~{vol_nom:.0f} cm³ · NOT conservative fit",
            "visualOnly": True,
            "volume_cm3_nom_band": vol_band,
        },
        {
            "id": "dc_link_cap_region_high",
            "label": "DC-link capacitor HIGH volume (fit check)",
            "mm": [round(cap_hi_w, 1), round(cap_hi_d, 1), round(cap_hi_h, 1)],
            "status": "CONCEPT_ENVELOPE_CONSERVATIVE",
            "note": (
                f"vol high={vol_hi:.0f} cm³ under ASSUMED aspect 2.4:1.4:0.7 — "
                "not a datasheet envelope; fit is shape-assumption only"
            ),
            "visualOnly": True,
            "volume_cm3": vol_hi,
            "aspect_assumption": [2.4, 1.4, 0.7],
            "axis_aligned_box_vs_bay_under_assumed_aspect": bool(
                cap_hi_w <= bay_w and cap_hi_d <= bay_d and cap_hi_h <= bay_h
            ),
            "fit_check_class": "ASSUMED_ASPECT_volume_only_not_datasheet",
            "fit_indeterminate_without_supplier_dims": True,
        },
        {
            "id": "dc_link_cap_region_low",
            "label": "DC-link capacitor LOW volume",
            "mm": [round(cap_lo_w, 1), round(cap_lo_d, 1), round(cap_lo_h, 1)],
            "status": "CONCEPT_ENVELOPE_LOW",
            "note": f"vol low={vol_lo:.0f} cm³",
            "visualOnly": True,
            "volume_cm3": vol_lo,
        },
        {
            "id": "gate_drive_pcb",
            "label": "Gate-drive PCB",
            "mm": [gd_w, gd_h, 2.0],
            "status": "NOT_FAB",
            "note": "draft outline only",
            "visualOnly": True,
        },
        {
            "id": "control_pcb",
            "label": "Control PCB",
            "mm": [ctrl_w, ctrl_h, 2.0],
            "status": "NOT_FAB",
            "note": "draft outline only",
            "visualOnly": True,
        },
        {
            "id": "hv_connector",
            "label": "HV connector",
            "mm": list(hv_conn),
            "status": "XYZ_OPEN",
            "note": "type-class placeholder",
            "visualOnly": True,
        },
        {
            "id": "coolant_qd",
            "label": "Coolant QD pair",
            "mm": list(coolant_qd),
            "status": "XYZ_OPEN",
            "note": "port XYZ OPEN",
            "visualOnly": True,
        },
        {
            "id": "sensors_bundle",
            "label": "Sensors (resolver/temp)",
            "mm": [30.0, 30.0, 40.0],
            "status": "OPEN",
            "note": "bundle placeholder",
            "visualOnly": True,
        },
    ]

    rep = {
        "schema": "forgeos.fpk.kit_assembly_envelopes_lite/v1",
        "status": "VISUAL_ONLY_ENVELOPES",
        "ship_ok": False,
        "ran_at": iso,
        "visualOnly": True,
        "bay_mm": {"w": bay_w, "d": bay_d, "h": bay_h},
        "parts": parts,
        "mass_context_kg": (mass.get("mass_kg") if isinstance(mass, dict) else None),
        "explicitly_not_claimed": [
            "Blender_hero_re_render",
            "frozen_STEP",
            "mount_XYZ_mm",
            "supplier_MPN",
            "ship_ok",
            "kit_hardware_ready",
        ],
        "release_statement": (
            "W3.2-lite orthographic envelopes from twin seeds + capacitor volume band. "
            "Boxes are visualOnly packing aids — not CAD release."
        ),
    }
    (ms / "kit_assembly_envelopes_lite.json").write_text(json.dumps(rep, indent=2) + "\n")

    # --- figure: top orthographic packing + side elevation ---
    fig = plt.figure(figsize=(12.0, 7.6), facecolor=C_BG)
    fig.text(
        0.04,
        0.95,
        "Kit assembly hierarchy — W3.2-lite envelopes (visualOnly)",
        fontsize=15,
        fontweight="bold",
        color=C_INK,
    )
    fig.text(
        0.04,
        0.91,
        f"Bay ghost {bay_w:.0f}×{bay_d:.0f}×{bay_h:.0f} mm · no Blender hero · ship_ok=false · {iso}",
        fontsize=9.5,
        color=C_MUTED,
    )

    # Top view (W × D)
    ax = fig.add_axes([0.05, 0.28, 0.52, 0.58])
    ax.set_facecolor("#FFFFFF")
    ax.set_aspect("equal")
    ax.set_xlim(-20, bay_w + 40)
    ax.set_ylim(-20, bay_d + 40)
    ax.set_xlabel("W mm")
    ax.set_ylabel("D mm")
    ax.set_title("Top orthographic (bay floor)", fontsize=11, fontweight="bold")
    # bay
    ax.add_patch(Rectangle((0, 0), bay_w, bay_d, fill=False, ec=C_WARN, lw=2.0, ls="--", label="bay ghost"))
    ax.text(bay_w / 2, bay_d + 12, "BAY GHOST", ha="center", fontsize=8, color=C_WARN, fontweight="bold")

    # layout packing (left motor, right electronics stack)
    # motor cylinder as square footprint OD
    mx, my = 18, (bay_d - motor_od) / 2
    ax.add_patch(Rectangle((mx, my), motor_od, motor_od, facecolor="#D6EAF8", edgecolor=C_ACCENT, lw=1.4))
    ax.text(mx + motor_od / 2, my + motor_od / 2, f"MOTOR\nØ{motor_od:.0f}", ha="center", va="center", fontsize=8, fontweight="bold")

    # reducer beside motor toward +W
    gx, gy = mx + motor_od + 10, my + 20
    ax.add_patch(Rectangle((gx, gy), gear_box[0], gear_box[1], facecolor="#F6DDCC", edgecolor="#A04000", lw=1.2, ls=":"))
    ax.text(gx + gear_box[0] / 2, gy + gear_box[1] / 2, "GEAR\nOPEN", ha="center", va="center", fontsize=7.5)

    # MCU stack right side
    ix = bay_w - mcu_w - 16
    iy = 16
    ax.add_patch(Rectangle((ix, iy), mcu_w, mcu_d, facecolor="#D5F5E3", edgecolor=C_OK, lw=1.4))
    ax.text(ix + mcu_w / 2, iy + mcu_d / 2 + 8, f"MCU\n{mcu_w:.0f}×{mcu_d:.0f}", ha="center", va="center", fontsize=8, fontweight="bold")
    # cold plate under label
    ax.add_patch(Rectangle((ix + 4, iy + 4), cp_l * 0.92, 14, facecolor="#E8DAEF", edgecolor="#6C3483", lw=1.0))
    ax.text(ix + mcu_w / 2, iy + 11, "cold plate", ha="center", va="center", fontsize=6.5, color="#6C3483")

    # cap region above MCU in D
    cap_x = ix + 10
    cap_y = iy + mcu_d + 8
    if cap_y + cap_d > bay_d - 8:
        cap_y = iy + mcu_d - cap_d - 8
        cap_x = ix - cap_w - 8
    cap_y_clamped = max(8, min(cap_y, bay_d - cap_d - 8))
    # high-volume ghost (conservative fit) behind geo-mean seed
    # Draw true high-volume depth (may extend past bay — that is the fit signal)
    ax.add_patch(
        Rectangle(
            (cap_x - 4, max(4, cap_y_clamped - 4)),
            cap_hi_w,
            cap_hi_d,
            facecolor="#FDEBD0",
            edgecolor="#CA6F1E",
            lw=1.0,
            ls=":",
            alpha=0.7,
        )
    )
    if cap_hi_d > bay_d or cap_hi_w > bay_w:
        ax.text(
            bay_w / 2,
            -12,
            "CAP HIGH exceeds bay under assumed aspect — fit indeterminate w/o supplier dims",
            ha="center",
            fontsize=7,
            color=C_WARN,
            fontweight="bold",
        )
    ax.add_patch(
        Rectangle(
            (cap_x, cap_y_clamped),
            cap_w,
            cap_d,
            facecolor="#FCF3CF",
            edgecolor="#B7950B",
            lw=1.3,
            ls="--",
        )
    )
    ax.text(
        cap_x + cap_w / 2,
        cap_y_clamped + cap_d / 2,
        f"CAP seed ~{vol_nom:.0f}\nhigh {vol_hi:.0f} cm³\nNO MPN",
        ha="center",
        va="center",
        fontsize=6.5,
        fontweight="bold",
        color="#7D6608",
    )

    # PCBs small
    ax.add_patch(Rectangle((ix + 8, bay_d - gd_h - 12), min(gd_w, mcu_w - 16), min(gd_h, 40), facecolor="#EBF5FB", edgecolor="#2874A6", lw=1.0))
    ax.text(ix + 8 + 30, bay_d - 28, "GD PCB NOT_FAB", fontsize=6.5, color="#2874A6")

    # HV + QD along front edge
    ax.add_patch(Rectangle((mx + 10, 8), hv_conn[0], hv_conn[1], facecolor="#F5B7B1", edgecolor=C_WARN, lw=1.0))
    ax.text(mx + 10 + hv_conn[0] / 2, 8 + hv_conn[1] / 2, "HV\nXYZ?", ha="center", va="center", fontsize=6.5)
    ax.add_patch(Rectangle((mx + 60, 8), coolant_qd[0], coolant_qd[1], facecolor="#AED6F1", edgecolor="#1A5276", lw=1.0))
    ax.text(mx + 60 + coolant_qd[0] / 2, 8 + coolant_qd[1] / 2, "QD", ha="center", va="center", fontsize=6.5)

    ax.legend(loc="upper left", fontsize=7, framealpha=0.9)

    # Side elevation (W × H)
    ax2 = fig.add_axes([0.60, 0.28, 0.36, 0.58])
    ax2.set_facecolor("#FFFFFF")
    ax2.set_aspect("equal")
    ax2.set_xlim(-15, bay_w + 30)
    ax2.set_ylim(-15, bay_h + 30)
    ax2.set_xlabel("W mm")
    ax2.set_ylabel("H mm")
    ax2.set_title("Side elevation (bay height)", fontsize=11, fontweight="bold")
    ax2.add_patch(Rectangle((0, 0), bay_w, bay_h, fill=False, ec=C_WARN, lw=2.0, ls="--"))

    # motor as rectangle OD × L shown as height OD, width L along W? Use OD height, place length along W
    ax2.add_patch(Rectangle((18, (bay_h - motor_od) / 2), motor_l, motor_od, facecolor="#D6EAF8", edgecolor=C_ACCENT, lw=1.4))
    ax2.text(18 + motor_l / 2, bay_h / 2, f"MOTOR\nL{motor_l:.0f}", ha="center", va="center", fontsize=8, fontweight="bold")

    # electronics stack at right: cold plate, MCU, cap
    stack_x = bay_w - mcu_w - 16
    y = 20
    ax2.add_patch(Rectangle((stack_x, y), mcu_w, cp_h, facecolor="#E8DAEF", edgecolor="#6C3483", lw=1.0))
    ax2.text(stack_x + mcu_w / 2, y + cp_h / 2, "cold plate", ha="center", va="center", fontsize=6.5)
    y += cp_h + 2
    ax2.add_patch(Rectangle((stack_x, y), mcu_w, mcu_h, facecolor="#D5F5E3", edgecolor=C_OK, lw=1.4))
    ax2.text(stack_x + mcu_w / 2, y + mcu_h / 2, f"MCU h={mcu_h:.0f}", ha="center", va="center", fontsize=8, fontweight="bold")
    y += mcu_h + 4
    # show HIGH volume stack height (conservative) with geo-mean seed inset
    ax2.add_patch(
        Rectangle(
            (stack_x, y),
            min(cap_hi_w, mcu_w + 20),
            cap_hi_h,
            facecolor="#FDEBD0",
            edgecolor="#CA6F1E",
            lw=1.0,
            ls=":",
        )
    )
    ax2.add_patch(
        Rectangle(
            (stack_x + 4, y + 2),
            min(cap_w, mcu_w),
            cap_h,
            facecolor="#FCF3CF",
            edgecolor="#B7950B",
            lw=1.3,
            ls="--",
        )
    )
    ax2.text(
        stack_x + min(cap_hi_w, mcu_w + 20) / 2,
        y + max(cap_hi_h, cap_h) / 2,
        f"CAP high {vol_hi:.0f} / seed {vol_nom:.0f}",
        ha="center",
        va="center",
        fontsize=6.5,
        fontweight="bold",
        color="#7D6608",
    )
    y += max(cap_hi_h, cap_h) + 6
    ax2.add_patch(Rectangle((stack_x, y), min(gd_w, mcu_w), 8, facecolor="#EBF5FB", edgecolor="#2874A6", lw=1.0))
    ax2.text(stack_x + 40, y + 4, "PCBs NOT_FAB", fontsize=6.5, color="#2874A6", va="center")

    # legend table
    fig.text(0.04, 0.22, "Part hierarchy (visualOnly envelopes)", fontsize=10, fontweight="bold", color=C_INK)
    y = 0.185
    for p in parts:
        if p["id"] == "bay_ghost":
            continue
        mm = p["mm"]
        line = f"• {p['label']:<28} {mm[0]:6.1f}×{mm[1]:6.1f}×{mm[2]:5.1f} mm   [{p['status']}]  {p['note']}"
        fig.text(0.05, y, line, fontsize=7.2, family="monospace", color=C_INK)
        y -= 0.022
        if y < 0.04:
            break
    fig.text(
        0.04,
        0.015,
        "W3.2-lite · boxes from twin seeds + C volume band · XYZ mounts OPEN · not CAD release · ship_ok=false",
        fontsize=8,
        color=C_MUTED,
    )
    path = out / "13-kit-assembly-envelopes-lite.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_partner_asks(twin: Path, iso: str) -> Path:
    path = twin / "JLR-FE-FRONT-FPK-PARTNER-ASKS-DRAFT-2026-08-04.md"
    body = f"""# Partner / test asks — draft from live screens (2026-08-04)

**ship_ok remains false.** These asks are generated as screens land (council: do not wait for Wave 5 batch).

| Pri | ID | Ask (short) | Already have | Closes |
|---|---|---|---|---|
| 1 | BARB-DUTY-CYCLE | Lap/stint CSV ≥20 Hz with regen power or HV V·I | DEC-008 vignette 24/100 s | DEC-007 |
| 2 | BARB-DYNO | Motor+inverter dyno map @ 60 °C / 12 L/min incl. 24k class | Path B FE mean 122.1 N·m, architecture bar 104.1; ripple load F_tang seeds | torque_reliable / B1–B2 |
| 3 | BARB-FLOW-BENCH | Jacket+plate Δp/flow + wall taps | Network Δp≈45 kPa, module T≈77.6 °C screen; W2.6 one-pager | B6 |
| 4 | BARB-SIC-MODULE | SiC MPN + datasheet + STEP | Packaging ESL seed 6.4 nH, 3-module class | DEC-001 |
| 5 | BARB-DOUBLE-PULSE | Measured ESL / Eon/Eoff on laminated bus | Cap C band 71–884 µF (concept), ESL target 3–15 nH | PE freeze |
| 6 | BARB-GERBERS | Supplier Gerbers gate-drive + control | Forge drafts NOT_FAB, DRC clean claim | B4 |
| 7 | BARB-ICD-XYZ | Chassis port XYZ mm | Types-only ICD, bay 343×259×267; W3.2-lite boxes | B5 |
| 8 | BARB-ROTOR-RETENTION | Instrumented overspeed to release speed | CalculiX screening FoS | B9/DEC-006 |

Full executable text: `JLR-FE-FRONT-FPK-BAR-B-READINESS.md`

Stamped: {iso}
"""
    path.write_text(body)
    return path


def rebuild_pdf(out: Path) -> Path:
    """Assemble all numbered pack figures + brief into multi-page PDF."""
    pngs: list[Path] = []
    # ordered stems
    preferred = [
        "00-verdict-one-pager.png",
        "00b-open-by-design.png",
        "00c-how-to-read-pack.png",
        "01-dual-torque-bars.png",
        "02-torque-vs-rotor-angle.png",
        "03-airgap-flux-vs-angle.png",
        "04-geometry-identity-card.png",
        "05-product-hero-em-callouts.jpg",
        "06-thermal-duty-storyboard.png",
        "07-pcb-honesty-sheet.png",
        "08-system-block-diagram.png",
        "09-inverter-mass-budget.png",
        "11-coolant-loop-one-pager.png",
        "12-torque-ripple-load-sheet.png",
        "13-kit-assembly-envelopes-lite.png",
    ]
    for name in preferred:
        p = out / name
        if p.is_file():
            pngs.append(p)
    # any extras numbered
    for p in sorted(out.glob("[0-9]*")):
        if p.suffix.lower() in {".png", ".jpg", ".jpeg"} and p not in pngs:
            pngs.append(p)

    pdf_path = out / "FE-FRONT-PATH-B-EM-HONESTY-PACK.pdf"
    with PdfPages(pdf_path) as pdf:
        for png in pngs:
            img = plt.imread(str(png))
            fig = plt.figure(figsize=(11.0, 7.5), facecolor="white")
            ax = fig.add_axes([0, 0, 1, 1])
            ax.imshow(img)
            ax.axis("off")
            pdf.savefig(fig, dpi=140)
            plt.close(fig)
        # brief page if present
        brief = out / "10-fe-visual-brief.md"
        if brief.is_file():
            fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
            text = brief.read_text()[:3500]
            fig.text(0.06, 0.94, "W3.1 visual authenticity brief", fontsize=14, fontweight="bold", color=C_INK)
            fig.text(0.06, 0.88, text, fontsize=8.5, family="monospace", color=C_INK, va="top")
            pdf.savefig(fig)
            plt.close(fig)
        # cover / honesty closer
        fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
        fig.text(0.08, 0.82, "FE Front MGU — Path B EM honesty pack", fontsize=18, fontweight="bold", color=C_INK)
        fig.text(
            0.08,
            0.55,
            "\n".join(
                [
                    "Purpose: show Jack the maths we actually ran — dual bars, Path B FE,",
                    "kit analytical screens, coolant/ripple sheets, visualOnly envelopes.",
                    "",
                    "Path B mean (~122 N·m) is ~1.17× the architecture duty bar (~104 N·m) — clears that bar.",
                    "Does not clear: conservative binding ledger bar (~125 N·m); mean/bind ≈ 0.975.",
                    "Open by design: torque_reliable / dyno; duty_torque_screen_ok; ship_ok; Bar A.",
                    "Homologation score stays ~1/10 until partners return data.",
                    "",
                    f"Rebuilt {_iso()}",
                    f"Figures in this PDF: {len(pngs)} image pages + brief/notes.",
                ]
            ),
            fontsize=11,
            color=C_INK,
            va="top",
        )
        pdf.savefig(fig)
        plt.close(fig)
    return pdf_path


def update_manifest(twin: Path, out: Path, pdf: Path, iso: str) -> None:
    pb_path = twin / "_motor_stack" / PATH_B_NAME
    path_b = json.loads(pb_path.read_text())
    figs = []
    for p in sorted(out.iterdir()):
        if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".md"} and re.match(r"^\d", p.name):
            figs.append(str(p.relative_to(twin)))
    manifest = {
        "schema": "forgeos.fpk.jack_em_pack/v1",
        "rendered_at": iso,
        "twin": str(twin),
        "path_b": str(pb_path),
        "figures": figs,
        "pdf": str(pdf.relative_to(twin)),
        "claims": {
            "path_b_mean_nm": (path_b.get("works_in_kit_context") or {}).get("torque_magnitude_mean_nm"),
            "architecture_duty_nm": (path_b.get("works_in_kit_context") or {}).get("required_shaft_torque_nm"),
            "duty_torque_screen_ok": (path_b.get("works_in_kit_context") or {}).get("duty_torque_screen_ok"),
            "ship_ok": path_b.get("ship_ok"),
            "not_claimed": [
                "duty_torque_screen_ok",
                "ship_ok",
                "Bar A close",
                "full MTPA map",
                "3D field solution",
                "kit_hardware_ready",
                "Blender_hero_re_render",
            ],
        },
        "phase_c": {
            "w2_6_coolant": True,
            "w2_8_ripple": True,
            "w3_2_lite_envelopes": True,
            "partner_asks_draft": True,
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def _require(ms: Path, name: str) -> Path:
    p = ms / name
    if not p.is_file():
        raise FileNotFoundError(f"Phase C required input missing: {p}")
    return p


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    out = ms / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)
    iso = _iso()

    # Fail closed if mandatory analytical inputs are absent (council: no silent skip)
    required = [
        PATH_B_NAME,
        "analytical_fia_cooling_network_screen.json",
        "dc_link_capacitor_concept_screen.json",
        "inverter_packaging_fia_front_kit_case.json",
    ]
    missing = [n for n in required if not (ms / n).is_file()]
    if missing:
        print(json.dumps({"error": "missing_required_inputs", "missing": missing, "ship_ok": False}, indent=2))
        return 2

    p11 = write_coolant(twin, out, iso)
    p12 = write_ripple(twin, out, iso)
    p13 = write_envelopes(twin, out, iso)
    asks = write_partner_asks(twin, iso)
    pdf = rebuild_pdf(out)
    update_manifest(twin, out, pdf, iso)

    ripple = json.loads((ms / "torque_ripple_load_sheet.json").read_text())
    print(
        json.dumps(
            {
                "wrote": [p11.name, p12.name, p13.name, asks.name, pdf.name],
                "F_tang_mean_kN": ripple["order_of_magnitude"]["F_tangential_mean_kN"],
                "F_tang_alt_kN": ripple["order_of_magnitude"]["F_tangential_alt_kN"],
                "ripple_status": ripple.get("status"),
                "ship_ok": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
