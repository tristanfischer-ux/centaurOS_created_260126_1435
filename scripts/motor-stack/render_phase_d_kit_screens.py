#!/usr/bin/env python3
"""Phase D kit screens: W2.3 ESL, W2.7 iron corners, W2.9–11 mech honesty, W2.12/13 gear.

Durable matplotlib pack pages 14–19 + JSON screens. ship_ok stays false.
No Blender hero. No invented dyno/Gerbers/XYZ/modal results.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
PATH_B = "em_fia_front_kit_case_PATH_B_DEC009.json"
C_BG, C_INK, C_MUTED, C_GRID = "#FAFAF8", "#1A1A1A", "#5C5C5C", "#D8D8D4"
C_OK, C_WARN, C_ACCENT = "#0B6E4F", "#922B21", "#1B4F72"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _q(quantities: dict, key: str, default=None):
    r = quantities.get(key)
    if isinstance(r, dict):
        return r.get("value", default)
    return default if r is None else r


def _load(ms: Path, name: str) -> dict:
    p = ms / name
    if not p.is_file():
        raise FileNotFoundError(str(p))
    return json.loads(p.read_text())


def write_esl(twin: Path, out: Path, iso: str) -> Path:
    """W2.3 busbar / loop inductance analytical budget."""
    ms = twin / "_motor_stack"
    inv = _load(ms, "inverter_packaging_fia_front_kit_case.json")
    cap = _load(ms, "dc_link_capacitor_concept_screen.json")
    scr = inv.get("screening_results") or {}
    iq = inv.get("input_quantities") or {}
    env = cap.get("envelope") or {}
    esl_env = env.get("esl_nh") or {}

    nom = float(scr.get("bus_esl_nominal_nh") or iq.get("bus_esl_nominal_nh") or 6.39)
    lo = float(scr.get("bus_esl_low_nh") or iq.get("bus_esl_low_nh") or 4.15)
    hi = float(scr.get("bus_esl_high_nh") or iq.get("bus_esl_high_nh") or 9.9)
    band = scr.get("esl_target_band_nh") or esl_env.get("target_band") or [3.0, 15.0]
    pref_hi = float(scr.get("esl_preferred_high_nh") or 10.0)
    v_dc = float(iq.get("dc_bus_voltage_v") or 750)
    i_dc = float(scr.get("dc_current_a") or 333.33)
    # First-order V = L di/dt scale: assume turn-off di/dt ~ 2–8 kA/µs class (concept)
    di_dt_low = 2.0e9  # A/s = 2 kA/µs
    di_dt_hi = 8.0e9
    # L in H = nH * 1e-9
    v_spike_nom_lo = nom * 1e-9 * di_dt_low
    v_spike_nom_hi = nom * 1e-9 * di_dt_hi
    v_spike_hi_hi = hi * 1e-9 * di_dt_hi

    rep = {
        "schema": "forgeos.fpk.busbar_esl_budget_screen/v1",
        "status": "PARTIAL_ANALYTICAL_SCREEN",
        "ship_ok": False,
        "ran_at": iso,
        "budget_nh": {
            "target_band": band,
            "preferred_high": pref_hi,
            "seed_low": lo,
            "seed_nominal": nom,
            "seed_high": hi,
            "source": "inverter_packaging_fia_front_kit_case.screening_results",
        },
        "switching_spike_order_of_magnitude": {
            "v_dc": v_dc,
            "i_dc_a": i_dc,
            "di_dt_assumed_ka_per_us": {"low": 2.0, "high": 8.0, "status": "ASSUMED_CONCEPT"},
            "v_spike_at_nom_esl_v": {
                "at_2_ka_us": round(v_spike_nom_lo, 1),
                "at_8_ka_us": round(v_spike_nom_hi, 1),
            },
            "v_spike_at_high_esl_8_ka_us": round(v_spike_hi_hi, 1),
            "note": "V≈L·di/dt order-of-magnitude only — not a double-pulse measurement.",
        },
        "screen_flags": {
            "esl_nominal_in_target_band": scr.get("esl_nominal_in_target_band"),
            "esl_high_within_preferred": scr.get("esl_high_within_preferred"),
        },
        "bar_b_ask": "BARB-DOUBLE-PULSE",
        "explicitly_not_claimed": [
            "measured_ESL",
            "double_pulse_Eon_Eoff",
            "supplier_laminated_bus_STEP",
            "ship_ok",
        ],
        "release_statement": (
            "Analytical laminated-bus ESL seeds vs 3–15 nH target. "
            "Double-pulse measurement OPEN (Bar B). ship_ok false."
        ),
    }
    (ms / "busbar_esl_budget_screen.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.2, 7.2), facecolor=C_BG)
    fig.text(0.05, 0.93, "Busbar / loop inductance budget — analytical (W2.3)", fontsize=15, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.885, f"Laminated-bus ESL seeds · double-pulse OPEN · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)

    ax = fig.add_axes([0.08, 0.38, 0.84, 0.42])
    ax.set_facecolor("#FFFFFF")
    ax.axhspan(band[0], band[1], color="#D5F5E3", alpha=0.55, label=f"target band {band[0]}–{band[1]} nH")
    ax.axhline(pref_hi, color=C_WARN, ls="--", lw=1.2, label=f"preferred high {pref_hi} nH")
    xs = [0, 1, 2]
    ys = [lo, nom, hi]
    cols = ["#5DADE2", C_OK, "#E67E22"]
    ax.bar(xs, ys, color=cols, width=0.55, edgecolor=C_INK, lw=0.8)
    ax.set_xticks(xs)
    ax.set_xticklabels(["seed low", "seed nominal", "seed high"])
    ax.set_ylabel("ESL nH")
    ax.set_ylim(0, max(hi, pref_hi, band[1]) * 1.25)
    for i, v in enumerate(ys):
        ax.text(i, v + 0.25, f"{v:.2f}", ha="center", fontweight="bold", fontsize=10)
    ax.legend(loc="upper right", fontsize=8)
    ax.set_title("Packaging-screen ESL seeds vs target band", fontsize=11)
    ax.grid(True, axis="y", color=C_GRID, alpha=0.6)

    fig.text(0.05, 0.30, "Switching spike order-of-magnitude  V ≈ L · di/dt  (ASSUMED di/dt 2–8 kA/µs)", fontsize=10, fontweight="bold", color=C_INK)
    fig.text(
        0.05,
        0.22,
        f"At nom {nom:.2f} nH:  ΔV ~ {v_spike_nom_lo:.0f}–{v_spike_nom_hi:.0f} V\n"
        f"At high {hi:.2f} nH · 8 kA/µs:  ΔV ~ {v_spike_hi_hi:.0f} V   ·   V_dc seed {v_dc:.0f} V   ·   I_dc ~ {i_dc:.0f} A",
        fontsize=10,
        family="monospace",
        color=C_INK,
    )
    fig.text(0.05, 0.12, "HAVE: analytical ESL seeds + target band + cap ESL note", fontsize=9.5, color=C_OK)
    fig.text(0.05, 0.085, "DO NOT HAVE: measured ESL, Eon/Eoff, laminated-bus STEP, SiC MPN (BARB-DOUBLE-PULSE / BARB-SIC-MODULE)", fontsize=9.5, color=C_WARN)
    fig.text(0.05, 0.04, "W2.3 · not a double-pulse result · ship_ok=false", fontsize=8, color=C_MUTED)
    path = out / "14-busbar-esl-budget.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_iron_corners(twin: Path, out: Path, iso: str) -> Path:
    """W2.7 iron loss corner table — Jack-facing uncertainty."""
    ms = twin / "_motor_stack"
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    lam = _load(ms, "stator_iron_loss_from_lamination.json")
    iron_lam = float(lam.get("iron_loss_w") or 6035.1)
    iron_dec = float(_q(q, "mgu_iron_loss_w") or 11732.5)
    # Caveat band on lamination estimate
    lo = iron_lam * 0.65
    hi = iron_lam * 1.40
    # Plan class 3.9–8.5 kW
    rep = {
        "schema": "forgeos.fpk.iron_loss_corner_table/v1",
        "status": "SCREENING_ESTIMATE_CORNERS",
        "ship_ok": False,
        "ran_at": iso,
        "corners_w": {
            "lamination_steinmetz_mid": iron_lam,
            "lamination_low_0_65x": round(lo, 1),
            "lamination_high_1_4x": round(hi, 1),
            "dec009_scaled_stamp": iron_dec,
            "unit": "W",
        },
        "corners_kw": {
            "lamination_mid_kw": round(iron_lam / 1000.0, 2),
            "class_band_kw": [round(lo / 1000.0, 2), round(hi / 1000.0, 2)],
            "dec009_stamp_kw": round(iron_dec / 1000.0, 2),
        },
        "basis": {
            "lamination": {
                "grade": lam.get("lamination_grade"),
                "f_elec_hz": lam.get("electrical_frequency_hz"),
                "basis": lam.get("basis"),
                "caveat_excerpt": (lam.get("caveat") or "")[:400],
            },
            "dec009_stamp": {
                "source": "state.mgu_iron_loss_w / DEC-009 option screen scaled",
                "basis": (q.get("mgu_iron_loss_w") or {}).get("basis"),
                "uncertainty_pct": (q.get("mgu_iron_loss_w") or {}).get("uncertainty_pct"),
            },
        },
        "explicitly_not_claimed": [
            "measured_iron_loss",
            "PWM_harmonic_resolved_loss",
            "ship_ok",
            "single_point_truth",
        ],
        "jack_read": (
            "Do not treat one iron-loss number as closed. The twin carries a "
            "lamination screening mid-point and a higher DEC-009 scaled stamp; "
            "true loss may sit roughly 0.65×–1.4× the lamination mid under the "
            "published caveat (≈3.9–8.5 kW class on that mid)."
        ),
    }
    (ms / "iron_loss_corner_table.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig, ax = plt.subplots(figsize=(11.0, 6.8), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    labels = ["Lam low\n0.65×", "Lam mid\nSteinmetz", "Lam high\n1.4×", "DEC-009\nstamp"]
    vals = [lo / 1000, iron_lam / 1000, hi / 1000, iron_dec / 1000]
    colors = ["#AED6F1", C_ACCENT, "#F5B7B1", "#F9E79F"]
    bars = ax.bar(labels, vals, color=colors, edgecolor=C_INK, lw=0.8, width=0.65)
    ax.axhspan(3.9, 8.5, color="#D5F5E3", alpha=0.35, label="plan class band ≈3.9–8.5 kW (on lam mid)")
    ax.set_ylabel("Iron loss kW")
    ax.set_title("Iron loss corners — Jack-facing uncertainty (W2.7)", fontsize=13, fontweight="bold", color=C_INK)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.15, f"{v:.2f}", ha="center", fontweight="bold")
    ax.legend(loc="upper left", fontsize=8)
    ax.set_ylim(0, max(vals) * 1.25)
    ax.grid(True, axis="y", color=C_GRID, alpha=0.5)
    fig.text(
        0.08,
        0.08,
        f"Grade {lam.get('lamination_grade')} · f_e≈{lam.get('electrical_frequency_hz')} Hz · "
        f"yoke B probe outside pure Steinmetz fit · PWM harmonics OPEN · ship_ok=false · {iso}",
        fontsize=8.5,
        color=C_MUTED,
    )
    fig.text(0.08, 0.03, "W2.7 · screening corners only — not a calorimeter result", fontsize=8, color=C_MUTED)
    fig.tight_layout(rect=(0.03, 0.12, 0.97, 0.96))
    path = out / "15-iron-loss-corner-table.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_bearing(twin: Path, out: Path, iso: str) -> Path:
    """W2.9 bearing reaction order-of-magnitude under ripple."""
    ms = twin / "_motor_stack"
    rip = _load(ms, "torque_ripple_load_sheet.json")
    oom = rip.get("order_of_magnitude") or {}
    tq = rip.get("torque_nm") or {}
    f_mean = float(oom.get("F_tangential_mean_kN") or 0)
    f_half = float(oom.get("F_tangential_half_range_kN") or oom.get("F_tangential_alt_kN") or 0)
    # Crude two-bearing equal share of radial from air-gap tangential (NOT validated)
    # F_radial_per_bearing ≈ F_tang / 2 as order seed; axial OPEN
    f_rad_each = f_mean / 2.0
    f_rad_alt_each = f_half / 2.0

    rep = {
        "schema": "forgeos.fpk.bearing_reaction_oom_screen/v1",
        "status": "ORDER_OF_MAGNITUDE_ONLY",
        "ship_ok": False,
        "ran_at": iso,
        "upstream": {
            "ripple_status": rip.get("status"),
            "torque_reliable": (rip.get("source_flags") or {}).get("torque_reliable"),
            "source": "torque_ripple_load_sheet.json",
        },
        "inputs": {
            "F_tang_mean_kN": f_mean,
            "F_tang_half_range_kN": f_half,
            "torque_nm": tq,
        },
        "bearing_seed": {
            "assumption": "two_bearing_equal_share_of_airgap_tangential — NOT a shaft free-body",
            "F_radial_mean_per_bearing_kN": round(f_rad_each, 3),
            "F_radial_half_range_per_bearing_kN": round(f_rad_alt_each, 3),
            "F_axial_kN": None,
            "F_axial_status": "OPEN_no_preload_or_gear_thrust_model",
        },
        "explicitly_not_claimed": [
            "bearing_L10_life",
            "ISO_281_life",
            "NVH_modal",
            "validated_reaction",
            "ship_ok",
            "torque_reliable",
        ],
        "partner_ask_stub": {
            "artefact": "bearing reaction from dyno + shaft instrumentation",
            "unblocks": "L10 / BARB-DYNO",
        },
        "release_statement": (
            "Order-of-magnitude radial seeds from Path B |T|→F_tang only. "
            "L10 life OPEN. Upstream INPUT_NOT_VALIDATED while torque_reliable false."
        ),
    }
    (ms / "bearing_reaction_oom_screen.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.0, 6.8), facecolor=C_BG)
    fig.text(0.05, 0.92, "Bearing reaction — order-of-magnitude under ripple (W2.9)", fontsize=14, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.875, f"Upstream ripple status={rip.get('status')} · L10 OPEN · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)

    ax = fig.add_axes([0.08, 0.35, 0.5, 0.45])
    ax.set_facecolor("#FFFFFF")
    cats = ["F_tang\nmean", "F_tang\n½-range", "F_rad/brg\nmean seed", "F_rad/brg\n½-range seed"]
    vals = [f_mean, f_half, f_rad_each, f_rad_alt_each]
    ax.bar(cats, vals, color=[C_ACCENT, "#E74C3C", "#5DADE2", "#F5B7B1"], edgecolor=C_INK, width=0.6)
    ax.set_ylabel("kN")
    ax.set_title("Air-gap F_tang → crude per-bearing radial seed", fontsize=11)
    for i, v in enumerate(vals):
        ax.text(i, v + 0.02, f"{v:.3f}", ha="center", fontweight="bold", fontsize=9)
    ax.set_ylim(0, max(vals) * 1.35 if max(vals) > 0 else 1)

    fig.text(0.62, 0.72, "Assumption (explicit)", fontsize=11, fontweight="bold", color=C_INK)
    fig.text(
        0.62,
        0.42,
        "• Two bearings share air-gap\n  tangential force equally\n"
        "• No gear mesh force\n"
        "• No magnetic pull unbalance\n"
        "• No rotor dynamic amplification\n"
        "• Axial / preload: OPEN\n"
        "• L10 / ISO 281: OPEN\n"
        f"• Upstream |T| mean {tq.get('mean', '?')} N·m",
        fontsize=9.5,
        family="monospace",
        color=C_INK,
        va="top",
    )
    fig.text(0.05, 0.18, "NOT a bearing selection. NOT a life calc. NOT a free-body from CAD mounts.", fontsize=10, color=C_WARN, fontweight="bold")
    fig.text(0.05, 0.12, "Partner: BARB-DYNO + shaft/bearing instrumentation before any L10 claim.", fontsize=9.5, color=C_INK)
    fig.text(0.05, 0.05, "W2.9 · order-of-magnitude only · ship_ok=false", fontsize=8, color=C_MUTED)
    path = out / "16-bearing-reaction-oom.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_rotor_fos(twin: Path, out: Path, iso: str) -> Path:
    """W2.10 rotor FoS screening summary card."""
    ms = twin / "_motor_stack"
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    sw = _load(ms, "calculix_rotor_speed_sweep.json")
    rows = sw.get("rows") or []
    row_24 = next((r for r in rows if int(r.get("rpm") or 0) == 24000), None)
    fos_24 = float((row_24 or {}).get("screening_fos_vs_yield") or _q(q, "dec_009_adopted_rotor_fos") or 1.74)
    fos_state = float(_q(q, "rotor_fe_screening_fos") or fos_24)
    yield_mpa = float(sw.get("assumed_yield_mpa") or 355)

    rep = {
        "schema": "forgeos.fpk.rotor_fos_screening_card/v1",
        "status": "SCREENING_ONLY",
        "ship_ok": False,
        "ran_at": iso,
        "adopted": {
            "rpm": 24000,
            "screening_fos_vs_yield": fos_24,
            "assumed_yield_mpa": yield_mpa,
            "dec_009_adopted_rotor_fos": _q(q, "dec_009_adopted_rotor_fos"),
            "state_rotor_fe_screening_fos": fos_state,
        },
        "sweep_rows": [
            {
                "rpm": r.get("rpm"),
                "screening_fos_vs_yield": r.get("screening_fos_vs_yield"),
                "max_von_mises_mpa": r.get("max_von_mises_mpa"),
                "below_assumed_yield": r.get("below_assumed_yield"),
            }
            for r in rows
        ],
        "honesty": {
            "release_fos_closed": False,
            "sweep_machine_torque_source": sw.get("machine_torque_source"),
            "sweep_machine_torque_nm": sw.get("machine_torque_nm"),
            "note": (
                "CalculiX speed sweep used a legacy REBALANCED mean torque stamp for the "
                "torque_ratio column — FoS vs yield is centrifugal stress screening, not a "
                "Path B torque proof. Path B mean is separate (EM kit-case)."
            ),
            "caveat": sw.get("caveat"),
        },
        "explicitly_not_claimed": [
            "release_FoS",
            "burst_test",
            "laminate_stack_anisotropy",
            "magnet_retention_sleeve",
            "fatigue",
            "ship_ok",
        ],
        "bar_b_ask": "BARB-ROTOR-RETENTION",
        "release_statement": "Screening FoS only (assumed 355 MPa yield). Not release FEA. ship_ok false.",
    }
    (ms / "rotor_fos_screening_card.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.2, 7.0), facecolor=C_BG)
    fig.text(0.05, 0.93, "Rotor FoS screening card — not release (W2.10)", fontsize=15, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.885, f"Assumed yield {yield_mpa:.0f} MPa · release_fos_closed=false · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)

    ax = fig.add_axes([0.08, 0.38, 0.55, 0.42])
    ax.set_facecolor("#FFFFFF")
    rpms = [r["rpm"] for r in rows]
    foss = [r["screening_fos_vs_yield"] for r in rows]
    ax.plot(rpms, foss, "o-", color=C_ACCENT, lw=2, ms=8)
    ax.axhline(1.5, color=C_WARN, ls="--", lw=1.2, label="screening floor 1.5 (informational)")
    ax.axhline(1.0, color="#922B21", ls=":", lw=1.0, label="yield (FoS=1)")
    ax.axvline(24000, color=C_OK, ls="--", alpha=0.7, label="DEC-009 24k")
    ax.scatter([24000], [fos_24], s=120, color=C_OK, zorder=5)
    ax.text(24000, fos_24 + 0.08, f"FoS {fos_24:.2f}", ha="center", fontweight="bold", color=C_OK)
    ax.set_xlabel("rpm")
    ax.set_ylabel("screening FoS vs assumed yield")
    ax.set_title("CalculiX rotor speed sweep", fontsize=11)
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(True, color=C_GRID, alpha=0.6)
    ax.set_ylim(0.8, max(foss) * 1.15)

    fig.text(0.68, 0.72, "At 24,000 rpm", fontsize=12, fontweight="bold", color=C_INK)
    fig.text(
        0.68,
        0.48,
        f"screening FoS  {fos_24:.2f}\n"
        f"σ_vm max       {(row_24 or {}).get('max_von_mises_mpa', '?')} MPa\n"
        f"yield assumed  {yield_mpa:.0f} MPa\n"
        f"below yield    {(row_24 or {}).get('below_assumed_yield')}\n"
        f"release closed False",
        fontsize=10,
        family="monospace",
        color=C_INK,
        va="top",
    )
    fig.text(
        0.05,
        0.22,
        "NOT claimed: laminate anisotropy, magnet pocket burst, sleeve retention, fatigue, instrumented overspeed.\n"
        f"Sweep torque_ratio column used legacy machine_torque={sw.get('machine_torque_nm')} N·m — not Path B mean.",
        fontsize=9,
        color=C_WARN,
    )
    fig.text(0.05, 0.12, "Partner: BARB-ROTOR-RETENTION (instrumented overspeed to release speed).", fontsize=9.5, color=C_INK)
    fig.text(0.05, 0.05, "W2.10 · screening only · ship_ok=false", fontsize=8, color=C_MUTED)
    path = out / "17-rotor-fos-screening-card.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_nvh_open(twin: Path, out: Path, iso: str) -> Path:
    """W2.11 explicit NVH/modal OPEN register — no fake results."""
    ms = twin / "_motor_stack"
    rep = {
        "schema": "forgeos.fpk.nvh_modal_open_register/v1",
        "status": "EXPLICITLY_OPEN",
        "ship_ok": False,
        "ran_at": iso,
        "register": [
            {
                "id": "NVH-001",
                "item": "Housing modal analysis",
                "status": "OPEN",
                "blocker": "Mount XYZ / stiffness not frozen (B5)",
                "not_doing": "No invented eigenfrequencies",
            },
            {
                "id": "NVH-002",
                "item": "Air-gap force harmonic → structure transfer",
                "status": "OPEN",
                "blocker": "torque_reliable false; no dyno NVH map",
                "partial": "Path B |T| ripple + F_tang OoM exist as excitation seeds only",
            },
            {
                "id": "NVH-003",
                "item": "Gear whine / mesh orders",
                "status": "OPEN",
                "blocker": "PLANETARY_STRENGTH_VS_ROTOR_BORE; ratio writeback invalidated",
            },
            {
                "id": "NVH-004",
                "item": "Inverter PWM tonal",
                "status": "OPEN",
                "blocker": "SiC MPN + switching frequency not frozen",
            },
            {
                "id": "NVH-005",
                "item": "Vehicle cabin / chassis transfer",
                "status": "OPEN",
                "blocker": "Partner vehicle model",
            },
        ],
        "explicitly_not_claimed": [
            "modal_frequencies_hz",
            "sound_pressure_level",
            "pass_fail_NVH",
            "ship_ok",
        ],
        "release_statement": (
            "NVH/modal is OPEN by design. This page records the open register so "
            "absence of numbers is not read as a clean bill. ship_ok false."
        ),
    }
    (ms / "nvh_modal_open_register.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.2, 7.0), facecolor=C_BG)
    fig.text(0.05, 0.93, "NVH / modal — explicit OPEN register (W2.11)", fontsize=15, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.885, f"No fake eigenmodes · no invented dB(A) · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)

    y = 0.78
    for row in rep["register"]:
        fig.add_artist(
            FancyBboxPatch(
                (0.05, y - 0.02),
                0.90,
                0.10,
                boxstyle="round,pad=0.01,rounding_size=0.01",
                facecolor="#FDEDEC",
                edgecolor=C_WARN,
                transform=fig.transFigure,
                linewidth=1.2,
            )
        )
        fig.text(0.07, y + 0.045, f"{row['id']}  {row['item']}", fontsize=11, fontweight="bold", color=C_INK, transform=fig.transFigure)
        fig.text(0.07, y + 0.015, f"status={row['status']}  ·  blocker: {row['blocker']}", fontsize=9, color=C_WARN, transform=fig.transFigure)
        extra = row.get("partial") or row.get("not_doing") or ""
        if extra:
            fig.text(0.07, y - 0.01, extra, fontsize=8.5, color=C_MUTED, transform=fig.transFigure)
        y -= 0.125

    fig.text(0.05, 0.06, "W2.11 · OPEN register is the deliverable — silence would be the lie", fontsize=8, color=C_MUTED)
    path = out / "18-nvh-modal-open-register.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_gear_oil_and_ratio(twin: Path, out: Path, iso: str) -> tuple[Path, Path]:
    """W2.13 gear-oil one-pager + W2.12 gear ratio blocked status."""
    ms = twin / "_motor_stack"
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    oil = _load(ms, "gear_oil_fia_front_kit_case.json")
    gw = _load(ms, "gear_geometry_writeback.json")
    iso6336 = _load(ms, "iso6336_fia_front_kit_case.json") if (ms / "iso6336_fia_front_kit_case.json").is_file() else {}
    scr = oil.get("screening_results") or {}
    wik = oil.get("works_in_kit_context") or {}
    wik_iso = iso6336.get("works_in_kit_context") or {}

    ratio = float(_q(q, "gear_ratio") or 8)
    rep_oil = {
        "schema": "forgeos.fpk.gear_oil_status_one_pager/v1",
        "status": oil.get("status") or "PARTIAL",
        "ship_ok": False,
        "ran_at": iso,
        "screen": {
            "oil_delivery_screen_ok": wik.get("oil_delivery_screen_ok"),
            "cornering_pickup_ok": scr.get("cornering_pickup_ok"),
            "tip_speed_splash_ok": scr.get("tip_speed_splash_ok"),
            "churning_loss_w": scr.get("churning_loss_w"),
            "gear_loss_kw": scr.get("gear_loss_kw"),
            "jet_pressure_required_kpa": scr.get("jet_pressure_required_kpa"),
            "minimum_jet_flow_l_min": scr.get("minimum_jet_flow_l_min"),
            "carrier_speed_rpm": scr.get("carrier_speed_rpm"),
        },
        "free_surface_cfd": oil.get("free_surface_cfd") or {"status": "OPEN"},
        "bar_b_ask": "BARB-GEAR-OIL-BENCH",
        "explicitly_not_claimed": [
            "free_surface_CFD",
            "clear_case_bench",
            "seal_temperature_closure",
            "ship_ok",
        ],
        "release_statement": oil.get("release_statement"),
    }
    (ms / "gear_oil_status_one_pager.json").write_text(json.dumps(rep_oil, indent=2) + "\n")

    rep_ratio = {
        "schema": "forgeos.fpk.gear_ratio_writeback_status/v1",
        "status": "BLOCKED_ARCHITECTURE_HOLD",
        "ship_ok": False,
        "ran_at": iso,
        "twin_gear_ratio": ratio,
        "writeback": {
            "invalidated": gw.get("invalidated"),
            "architecture_hold": gw.get("architecture_hold"),
            "note": gw.get("note"),
        },
        "iso6336_screen": {
            "duty_strength_screen_ok": wik_iso.get("duty_strength_screen_ok"),
            "minimum_strength_factor": wik_iso.get("minimum_strength_factor"),
            "nest_fits_rotor": wik_iso.get("nest_fits_rotor"),
            "ratio_matches_twin": wik_iso.get("ratio_matches_twin"),
            "controlling_geometry_source": wik_iso.get("controlling_geometry_source"),
            "note": wik_iso.get("note"),
        },
        "fos_numbers_are_not_the_same_metric": {
            "architecture_hold_text_fos_approx": 1.005,
            "architecture_hold_meaning": (
                "Best nest INSIDE rotor bore from prior strength resize attempt — "
                "informational hold narrative, not the live ISO 6336 min factor."
            ),
            "iso6336_minimum_strength_factor": wik_iso.get("minimum_strength_factor"),
            "iso6336_meaning": (
                "min(bending, contact) FoS on packaging_seed_rotor_bore_hold geometry "
                "with assumed case-hardened allowables — NOT KISSsoft."
            ),
            "do_not_average_or_equate": True,
        },
        "explicitly_not_claimed": [
            "strength_closed_planetary",
            "KISSsoft_release",
            "ship_ok",
            "ratio_writeback_live",
        ],
        "next_unblocks": [
            "Enlarge rotor bore, change tooth counts/topology, or accept external planetary",
            "Then re-run gear_geometry_writeback + ISO 6336 screen",
        ],
        "release_statement": (
            "Twin ratio seed remains 8. Strength writeback is INVALIDATED under "
            "PLANETARY_STRENGTH_VS_ROTOR_BORE. Do not claim PASS. ship_ok false."
        ),
    }
    (ms / "gear_ratio_writeback_status.json").write_text(json.dumps(rep_ratio, indent=2) + "\n")

    # --- oil figure ---
    fig = plt.figure(figsize=(11.2, 7.0), facecolor=C_BG)
    fig.text(0.05, 0.93, "Gear-oil screen status — analytical vs B7 CFD (W2.13)", fontsize=14, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.885, f"oil_delivery_screen_ok={wik.get('oil_delivery_screen_ok')} · free-surface CFD OPEN · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)

    def flag(x, y, title, ok, sub):
        fc = "#D5F5E3" if ok else "#FDEDEC"
        ec = C_OK if ok else C_WARN
        fig.patches.append(
            FancyBboxPatch((x, y), 0.28, 0.16, boxstyle="round,pad=0.01,rounding_size=0.015",
                           facecolor=fc, edgecolor=ec, lw=1.5, transform=fig.transFigure)
        )
        fig.text(x + 0.14, y + 0.11, title, ha="center", fontsize=10, fontweight="bold", transform=fig.transFigure)
        fig.text(x + 0.14, y + 0.06, "OK" if ok else "OPEN/FAIL", ha="center", fontsize=12, fontweight="bold", color=ec, transform=fig.transFigure)
        fig.text(x + 0.14, y + 0.025, sub, ha="center", fontsize=7.5, color=C_MUTED, transform=fig.transFigure)

    flag(0.05, 0.65, "Oil delivery screen", bool(wik.get("oil_delivery_screen_ok")), "works_in_kit_context")
    flag(0.36, 0.65, "Cornering pickup", bool(scr.get("cornering_pickup_ok")), "analytical flag")
    flag(0.67, 0.65, "Tip-speed splash", bool(scr.get("tip_speed_splash_ok")), "geometry OoM")

    lines = [
        f"carrier speed     {scr.get('carrier_speed_rpm')} rpm",
        f"churning loss     {scr.get('churning_loss_w')} W",
        f"gear loss         {scr.get('gear_loss_kw')} kW",
        f"min jet flow      {scr.get('minimum_jet_flow_l_min')} L/min",
        f"jet pressure need {scr.get('jet_pressure_required_kpa')} kPa",
        f"sump volume est.  {scr.get('estimated_sump_volume_ml')} ml",
        "",
        "CLEARED analytically (under assumptions): tip-speed splash OoM, charge/pickup gallery seeds",
        "NOT cleared: free-surface CFD, clear-case bench, seal temps, cornering pickup (flag false)",
    ]
    fig.text(0.05, 0.55, "Screen numbers (geometry-bound)", fontsize=11, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.22, "\n".join(lines), fontsize=9.5, family="monospace", color=C_INK, va="top")
    fig.text(0.05, 0.08, "Partner: B7 oil bench / free-surface CFD (BARB-GEAR-OIL-BENCH).", fontsize=9.5, color=C_INK)
    fig.text(0.05, 0.04, "W2.13 · RESULT_UNDER_ASSUMPTIONS · ship_ok=false", fontsize=8, color=C_MUTED)
    p_oil = out / "19-gear-oil-status.png"
    fig.savefig(p_oil, dpi=150, facecolor=C_BG)
    plt.close(fig)

    # --- ratio blocked figure ---
    fig = plt.figure(figsize=(11.2, 7.0), facecolor=C_BG)
    fig.text(0.05, 0.93, "Gear ratio writeback — BLOCKED status (W2.12)", fontsize=15, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.885, f"Twin ratio seed = {ratio:.0f} · writeback invalidated · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)

    fig.patches.append(
        FancyBboxPatch((0.08, 0.55), 0.84, 0.25, boxstyle="round,pad=0.02,rounding_size=0.02",
                       facecolor="#FDEDEC", edgecolor=C_WARN, lw=2, transform=fig.transFigure)
    )
    fig.text(0.12, 0.72, "ARCHITECTURE HOLD", fontsize=14, fontweight="bold", color=C_WARN, transform=fig.transFigure)
    fig.text(
        0.12,
        0.58,
        str(gw.get("architecture_hold") or "PLANETARY_STRENGTH_VS_ROTOR_BORE"),
        fontsize=11,
        family="monospace",
        color=C_INK,
        transform=fig.transFigure,
        va="top",
        wrap=True,
    )
    fig.text(
        0.05,
        0.42,
        "\n".join(
            [
                f"twin gear_ratio              {ratio:.0f}",
                f"writeback.invalidated        {gw.get('invalidated')}",
                f"ISO 6336 duty_strength_ok    {wik_iso.get('duty_strength_screen_ok')}",
                f"ISO 6336 min strength FoS    {wik_iso.get('minimum_strength_factor')}  ← live screen",
                f"hold narrative FoS ≈1.005    (prior nest attempt — NOT same metric)",
                f"nest_fits_rotor              {wik_iso.get('nest_fits_rotor')}",
                f"ratio_matches_twin           {wik_iso.get('ratio_matches_twin')}",
                f"controlling geometry         {wik_iso.get('controlling_geometry_source')}",
                "",
                "Do NOT average 1.005 and ISO min FoS — different geometries/attempts.",
                "Unblocks: enlarge rotor bore / retune tooth counts / external planetary,",
                "then re-run gear_geometry_writeback + ISO 6336. Do not invent a PASS ratio nest.",
                "W2.13 gear-oil page is separate (19-gear-oil-status.png).",
            ]
        ),
        fontsize=10,
        family="monospace",
        color=C_INK,
        va="top",
    )
    fig.text(0.05, 0.05, "W2.12 · blocked honesty card · not a silent skip · ship_ok=false", fontsize=8, color=C_MUTED)
    p_ratio = out / "20-gear-ratio-writeback-blocked.png"
    fig.savefig(p_ratio, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return p_oil, p_ratio


def update_partner_asks(twin: Path, iso: str) -> Path:
    path = twin / "JLR-FE-FRONT-FPK-PARTNER-ASKS-DRAFT-2026-08-04.md"
    body = f"""# Partner / test asks — draft from live screens (2026-08-04)

**ship_ok remains false.** Asks generated as screens land (council: do not wait for Wave 5 batch).

| Pri | ID | Ask (short) | Already have | Closes |
|---|---|---|---|---|
| 1 | BARB-DUTY-CYCLE | Lap/stint CSV ≥20 Hz with regen power or HV V·I | DEC-008 vignette 24/100 s | DEC-007 |
| 2 | BARB-DYNO | Motor+inverter dyno map @ 60 °C / 12 L/min incl. 24k class | Path B FE mean 122.1 N·m; ripple + bearing OoM seeds | torque_reliable / B1–B2 |
| 3 | BARB-FLOW-BENCH | Jacket+plate Δp/flow + wall taps | Network Δp≈45 kPa; W2.6 one-pager | B6 |
| 4 | BARB-SIC-MODULE | SiC MPN + datasheet + STEP | Packaging ESL seed 6.4 nH, 3-module class | DEC-001 |
| 5 | BARB-DOUBLE-PULSE | Measured ESL / Eon/Eoff on laminated bus | W2.3 ESL budget 4.15–9.9 nH vs 3–15 target | PE freeze |
| 6 | BARB-GERBERS | Supplier Gerbers gate-drive + control | Forge drafts NOT_FAB | B4 |
| 7 | BARB-ICD-XYZ | Chassis port XYZ mm | Types-only ICD, bay 343×259×267; W3.2-lite | B5 |
| 8 | BARB-ROTOR-RETENTION | Instrumented overspeed to release speed | CalculiX screening FoS 1.74 @ 24k | B9/DEC-006 |
| 9 | BARB-GEAR-OIL-BENCH | Clear-case / free-surface oil + cornering pickup | Analytical jet/churning; cornering flag false | B7 |
| 10 | BARB-GEAR-STRENGTH | Unblock PLANETARY_STRENGTH_VS_ROTOR_BORE (bore/topology) | Twin ratio seed 8; writeback invalidated | W2.12 |
| 11 | BARB-NVH | Housing modal + dyno NVH if mounts frozen | Explicit OPEN register W2.11 (no fake modes) | NVH |
| 12 | BARB-IRON-LOSS | Calorimeter / transient FE iron loss on M400-50A class | Corner table 3.9–8.5 kW class + DEC-009 stamp | Loss close |

Full executable text: `JLR-FE-FRONT-FPK-BAR-B-READINESS.md`

Stamped: {iso}
"""
    path.write_text(body)
    return path


def rebuild_pdf(out: Path) -> Path:
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
        "14-busbar-esl-budget.png",
        "15-iron-loss-corner-table.png",
        "16-bearing-reaction-oom.png",
        "17-rotor-fos-screening-card.png",
        "18-nvh-modal-open-register.png",
        "19-gear-oil-status.png",
        "20-gear-ratio-writeback-blocked.png",
    ]
    pngs = [out / n for n in preferred if (out / n).is_file()]
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
        brief = out / "10-fe-visual-brief.md"
        if brief.is_file():
            fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
            fig.text(0.06, 0.94, "W3.1 visual authenticity brief", fontsize=14, fontweight="bold", color=C_INK)
            fig.text(0.06, 0.88, brief.read_text()[:3500], fontsize=8.5, family="monospace", color=C_INK, va="top")
            pdf.savefig(fig)
            plt.close(fig)
        fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
        fig.text(0.08, 0.82, "FE Front MGU — Path B EM honesty pack", fontsize=18, fontweight="bold", color=C_INK)
        fig.text(
            0.08,
            0.50,
            "\n".join(
                [
                    "Path B mean (~122 N·m) is ~1.17× the architecture duty bar (~104 N·m).",
                    "Does not clear binding ledger (~125 N·m). ship_ok false. Homologation ~1/10.",
                    "",
                    "Phase D adds: ESL budget, iron-loss corners, bearing OoM, rotor FoS card,",
                    "NVH OPEN register, gear-oil status, gear-ratio BLOCKED honesty.",
                    "",
                    f"Rebuilt {_iso()} · {len(pngs)} image pages",
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
    pb_path = twin / "_motor_stack" / PATH_B
    path_b = json.loads(pb_path.read_text()) if pb_path.is_file() else {}
    figs = sorted(
        str(p.relative_to(twin))
        for p in out.iterdir()
        if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".md"} and p.name[0].isdigit()
    )
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
            "ship_ok": False,
            "not_claimed": [
                "duty_torque_screen_ok",
                "ship_ok",
                "Bar A close",
                "release_FoS",
                "bearing_L10",
                "NVH_modal_closed",
                "gear_ratio_writeback_live",
                "measured_ESL",
            ],
        },
        "phase_d": {
            "w2_3_esl": True,
            "w2_7_iron": True,
            "w2_9_bearing": True,
            "w2_10_fos": True,
            "w2_11_nvh_open": True,
            "w2_12_ratio_blocked": True,
            "w2_13_gear_oil": True,
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    out = ms / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)
    iso = _iso()

    required = [
        "inverter_packaging_fia_front_kit_case.json",
        "dc_link_capacitor_concept_screen.json",
        "torque_ripple_load_sheet.json",
        "stator_iron_loss_from_lamination.json",
        "calculix_rotor_speed_sweep.json",
        "gear_oil_fia_front_kit_case.json",
        "gear_geometry_writeback.json",
    ]
    missing = [n for n in required if not (ms / n).is_file()]
    if missing:
        print(json.dumps({"error": "missing_required_inputs", "missing": missing, "ship_ok": False}, indent=2))
        return 2

    wrote = []
    wrote.append(write_esl(twin, out, iso).name)
    wrote.append(write_iron_corners(twin, out, iso).name)
    wrote.append(write_bearing(twin, out, iso).name)
    wrote.append(write_rotor_fos(twin, out, iso).name)
    wrote.append(write_nvh_open(twin, out, iso).name)
    p_oil, p_ratio = write_gear_oil_and_ratio(twin, out, iso)
    wrote.extend([p_oil.name, p_ratio.name])
    asks = update_partner_asks(twin, iso)
    wrote.append(asks.name)
    pdf = rebuild_pdf(out)
    wrote.append(pdf.name)
    update_manifest(twin, out, pdf, iso)

    print(json.dumps({"wrote": wrote, "ship_ok": False, "pages": "14-20"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
