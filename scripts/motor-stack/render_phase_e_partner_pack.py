#!/usr/bin/env python3
"""Phase E — partner-gated ask pack (W5.*) + voltage-screen honesty tighten.

Jack-facing executable asks and dyno matrix from live Path B OP.
Does not invent dyno data, Gerbers, XYZ, or ship_ok.
Also tightens path_b_voltage_feasibility_screen honesty: −30° is OP *context*
for the kit-case point, not an input to the scalar Vll model (Sol finish residual).
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402

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


def tighten_voltage_honesty(ms: Path, iso: str) -> None:
    """Mark −30° as OP context; scalar model does not use current angle."""
    p = ms / "path_b_voltage_feasibility_screen.json"
    if not p.is_file():
        return
    d = json.loads(p.read_text())
    op = d.setdefault("operating_point", {})
    op["current_angle_role"] = "CONTEXT_ONLY_not_used_in_scalar_Vll_model"
    op["current_angle_honesty"] = (
        "Path B kit-case loaded point is screened near −30° electrical. "
        "This voltage screen's back-EMF uses OC B_rms; loaded Vll uses "
        "P/(η·√3·I·PF). Neither equation takes current angle as an input. "
        "A true −30° voltage-circle check needs Rs/Ld/Lq (or FEMM flux linkage "
        "at load) — OPEN. Do not read this page as MTPA voltage proof."
    )
    d.setdefault("explicitly_not_claimed", [])
    for item in (
        "current_angle_bound_voltage_vector",
        "MTPA_voltage_circle_at_minus_30_deg",
        "saturated_dq_map",
    ):
        if item not in d["explicitly_not_claimed"]:
            d["explicitly_not_claimed"].append(item)
    d["honesty_revision"] = {
        "ran_at": iso,
        "note": "Sol residual: label −30° as context, not model input",
    }
    d["ran_at"] = iso
    p.write_text(json.dumps(d, indent=2) + "\n")


def write_dyno_matrix(twin: Path, out: Path, iso: str) -> Path:
    ms = twin / "_motor_stack"
    pb = json.loads((ms / PATH_B).read_text())
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    wik = pb.get("works_in_kit_context") or {}
    iq = pb.get("input_quantities") or {}
    loaded = pb.get("loaded_point") or {}

    mean = float(wik.get("torque_magnitude_mean_nm") or 122.1)
    arch = float(wik.get("required_shaft_torque_nm") or 104.1)
    bind = float(_q(q, "binding_duty_shaft_torque_nm") or 125.2)
    rpm = float(iq.get("max_rotor_speed_rpm") or 24000)
    i_rms = float(iq.get("phase_current_design_a") or 535)
    v_dc = float(iq.get("dc_bus_voltage_v") or 750)
    v_min = float(iq.get("dc_bus_min_voltage_v") or 600)
    v_max = float(iq.get("dc_bus_max_voltage_v") or 900)
    p_kw = float(iq.get("continuous_electrical_power_kw") or 250)
    cool_in = float(_q(q, "coolant_inlet_c") or 60)
    flow = float(_q(q, "coolant_flow_l_min") or 12)
    angle = float(loaded.get("current_angle_electrical_deg") or -30)

    points = [
        {
            "id": "DYNO-P0",
            "name": "Path B kit OP (primary)",
            "rpm": rpm,
            "shaft_torque_target_nm": round(mean, 2),
            "phase_I_rms_a": i_rms,
            "Vdc_v": v_dc,
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "notes": f"Match Path B mean |T|≈{mean:.1f} N·m; angle context ≈{angle:.0f}° elec (not a locked MTPA)",
            "closes": "torque_reliable / B1–B2",
        },
        {
            "id": "DYNO-P1",
            "name": "Architecture duty bar",
            "rpm": rpm,
            "shaft_torque_target_nm": round(arch, 2),
            "phase_I_rms_a": "measure",
            "Vdc_v": v_dc,
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "notes": f"Software architecture bar {arch:.1f} N·m @ 24k / 250 kW class",
            "closes": "duty bar correlation",
        },
        {
            "id": "DYNO-P2",
            "name": "Binding ledger bar (stretch)",
            "rpm": rpm,
            "shaft_torque_target_nm": round(bind, 2),
            "phase_I_rms_a": "measure",
            "Vdc_v": v_dc,
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "notes": f"Conservative bind {bind:.1f} N·m — may be thermal/current limited; record limit mode",
            "closes": "whether bind is physical or ledger-only",
        },
        {
            "id": "DYNO-P3",
            "name": "Bus min corner",
            "rpm": rpm,
            "shaft_torque_target_nm": round(arch, 2),
            "phase_I_rms_a": "measure",
            "Vdc_v": v_min,
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "notes": "Voltage headroom stress at 600 V class",
            "closes": "bus-min feasibility / FW need",
        },
        {
            "id": "DYNO-P4",
            "name": "Bus max corner",
            "rpm": rpm,
            "shaft_torque_target_nm": round(mean, 2),
            "phase_I_rms_a": "measure",
            "Vdc_v": v_max,
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "notes": "900 V class — insulation/switching stress",
            "closes": "bus-max operating envelope",
        },
        {
            "id": "DYNO-P5",
            "name": "Thermal hold @ Path B OP",
            "rpm": rpm,
            "shaft_torque_target_nm": round(mean, 2),
            "phase_I_rms_a": i_rms,
            "Vdc_v": v_dc,
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "notes": "Hold until winding/magnet/module temps stabilise or hit limit; log time history ≥20 Hz",
            "closes": "DEC-008 intermittent vs continuous story",
        },
    ]

    channels = [
        "shaft_torque_nm (calibrated)",
        "shaft_speed_rpm",
        "Vdc_v, Idc_a",
        "phase_I_rms_a (or Ia/Ib/Ic)",
        "phase_V_ll or Va/Vb/Vc",
        "coolant_inlet_c, coolant_outlet_c, flow_l_min",
        "winding_temp_c (or RTD map)",
        "magnet_temp_proxy_c if available",
        "module_temp_c",
        "inverter_faults / derate flags",
        "timestamp_utc ≥20 Hz preferred; ≥10 Hz minimum",
    ]

    rep = {
        "schema": "forgeos.fpk.dyno_request_matrix/v1",
        "status": "PARTNER_ASK_DRAFT",
        "ship_ok": False,
        "ran_at": iso,
        "source_op": {
            "path_b_mean_nm": mean,
            "architecture_duty_nm": arch,
            "binding_duty_nm": bind,
            "rpm": rpm,
            "electrical_power_kw": p_kw,
            "phase_current_design_a": i_rms,
            "dc_bus_v": [v_min, v_dc, v_max],
            "coolant_inlet_c": cool_in,
            "flow_l_min": flow,
            "current_angle_context_deg": angle,
        },
        "points": points,
        "required_channels": channels,
        "deliverable_from_partner": [
            "CSV or TDMS with header units",
            "Calibration certs for torque + current",
            "Photo/serial of SiC module MPN on unit under test",
            "Statement of control mode (torque / current / speed)",
        ],
        "explicitly_not_claimed": [
            "dyno_results",
            "torque_reliable",
            "ship_ok",
            "Bar_A_close",
        ],
        "bar_b_ask": "BARB-DYNO",
        "release_statement": (
            "Request matrix only. No measured map is invented. ship_ok false."
        ),
    }
    (ms / "dyno_request_matrix.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.5, 7.6), facecolor=C_BG)
    fig.text(0.04, 0.94, "Dyno request matrix — Path B OP (W5.1 / BARB-DYNO)", fontsize=14, fontweight="bold", color=C_INK)
    fig.text(
        0.04,
        0.90,
        f"Path B mean {mean:.1f} N·m · arch {arch:.1f} · bind {bind:.1f} · {rpm:.0f} rpm · "
        f"I_rms {i_rms:.0f} A · Vdc {v_min:.0f}/{v_dc:.0f}/{v_max:.0f} · "
        f"{cool_in:.0f} °C / {flow:.0f} L/min · ship_ok=false · {iso}",
        fontsize=8.5,
        color=C_MUTED,
    )

    y = 0.84
    headers = ["ID", "Point", "rpm", "T_nm", "I_rms", "Vdc", "Closes"]
    xs = [0.04, 0.12, 0.38, 0.48, 0.58, 0.68, 0.78]
    for x, h in zip(xs, headers):
        fig.text(x, y, h, fontsize=8, fontweight="bold", color=C_MUTED)
    y -= 0.035
    for pt in points:
        fig.text(0.04, y, pt["id"], fontsize=7.5, family="monospace", color=C_ACCENT)
        fig.text(0.12, y, pt["name"][:28], fontsize=7.5, color=C_INK)
        fig.text(0.38, y, f"{pt['rpm']:.0f}", fontsize=7.5, family="monospace")
        fig.text(0.48, y, f"{pt['shaft_torque_target_nm']}", fontsize=7.5, family="monospace")
        fig.text(0.58, y, str(pt["phase_I_rms_a"])[:8], fontsize=7.5, family="monospace")
        fig.text(0.68, y, f"{pt['Vdc_v']:.0f}", fontsize=7.5, family="monospace")
        fig.text(0.78, y, pt["closes"][:22], fontsize=7, color=C_MUTED)
        y -= 0.028
        fig.text(0.12, y, pt["notes"][:95], fontsize=6.5, color=C_MUTED)
        y -= 0.032

    fig.text(0.04, y - 0.01, "Required channels", fontsize=10, fontweight="bold", color=C_INK)
    y -= 0.04
    for ch in channels:
        fig.text(0.06, y, f"• {ch}", fontsize=7.5, color=C_INK)
        y -= 0.022

    fig.text(
        0.04,
        0.05,
        "W5.1 · request only — no invented map · torque_reliable stays false until partner returns data · ship_ok=false",
        fontsize=8,
        color=C_MUTED,
    )
    path = out / "22-dyno-request-matrix.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_partner_asks_page(twin: Path, out: Path, iso: str) -> Path:
    """Jack one-pager of ranked partner asks (W5 batch draft)."""
    asks = [
        ("1", "BARB-DYNO", "Motor+inverter dyno map @ 60 °C / 12 L/min, 24k class", "Path B 122.1 N·m; matrix page 22", "torque_reliable"),
        ("2", "BARB-DUTY-CYCLE", "Lap/stint CSV ≥20 Hz regen power or HV V·I", "DEC-008 24/100 s vignette", "DEC-007"),
        ("3", "BARB-FLOW-BENCH", "Jacket+plate Δp/flow + wall taps", "Network Δp≈45 kPa; W2.6", "B6"),
        ("4", "BARB-DOUBLE-PULSE", "Measured ESL / Eon/Eoff laminated bus", "ESL seeds 4.15–9.9 nH; W2.3", "PE freeze"),
        ("5", "BARB-SIC-MODULE", "SiC MPN + datasheet + STEP", "3-module class packaging", "DEC-001"),
        ("6", "BARB-GERBERS", "Supplier Gerbers GD + control", "Forge drafts NOT_FAB", "B4"),
        ("7", "BARB-ICD-XYZ", "Chassis port XYZ mm", "Bay 343×259×267; types ICD", "B5"),
        ("8", "BARB-ROTOR-RETENTION", "Instrumented overspeed", "CalculiX FoS 1.74 @ 24k screening", "B9"),
        ("9", "BARB-GEAR-OIL-BENCH", "Clear-case / free-surface oil", "Analytical jet/churning; cornering fail", "B7"),
        ("10", "BARB-GEAR-STRENGTH", "Unblock PLANETARY_STRENGTH_VS_ROTOR_BORE", "Ratio seed 8; writeback invalidated", "W2.12"),
        ("11", "BARB-NVH", "Housing modal if mounts frozen", "OPEN register W2.11 (no fake Hz)", "NVH"),
        ("12", "BARB-IRON-LOSS", "Calorimeter / transient FE iron", "Corner table 3.9–8.5 kW class", "Loss"),
    ]
    md = twin / "JLR-FE-FRONT-FPK-PARTNER-ASKS-DRAFT-2026-08-04.md"
    lines = [
        "# Partner / test asks — executable draft (2026-08-04)",
        "",
        "**ship_ok remains false.** Homologation ~1/10 until these return.",
        "",
        "| Pri | ID | Ask | Already have | Closes |",
        "|---|---|---|---|---|",
    ]
    for pri, aid, ask, have, closes in asks:
        lines.append(f"| {pri} | {aid} | {ask} | {have} | {closes} |")
    lines += [
        "",
        "Dyno matrix detail: `_motor_stack/dyno_request_matrix.json` / pack page 22.",
        "Lap log columns: pack page 23.",
        "",
        f"Stamped: {iso}",
        "",
    ]
    md.write_text("\n".join(lines))

    fig = plt.figure(figsize=(11.5, 7.6), facecolor=C_BG)
    fig.text(0.04, 0.94, "Partner asks — ranked (W5 draft)", fontsize=15, fontweight="bold", color=C_INK)
    fig.text(0.04, 0.90, f"ship_ok=false · homologation stays ~1/10 · {iso}", fontsize=10, color=C_MUTED)
    y = 0.84
    for pri, aid, ask, have, closes in asks:
        fig.add_artist(
            FancyBboxPatch(
                (0.04, y - 0.015),
                0.92,
                0.055,
                boxstyle="round,pad=0.008,rounding_size=0.008",
                facecolor="#FFFFFF",
                edgecolor=C_GRID,
                transform=fig.transFigure,
                lw=0.8,
            )
        )
        fig.text(0.05, y + 0.018, f"{pri}. {aid}", fontsize=8, fontweight="bold", color=C_ACCENT, transform=fig.transFigure, family="monospace")
        fig.text(0.22, y + 0.018, ask[:70], fontsize=8, color=C_INK, transform=fig.transFigure)
        fig.text(0.05, y - 0.005, f"have: {have[:55]}  →  closes: {closes}", fontsize=7, color=C_MUTED, transform=fig.transFigure)
        y -= 0.062
    fig.text(0.04, 0.04, "W5 · draft asks only — partner data closes Bar B; software does not invent it", fontsize=8, color=C_MUTED)
    path = out / "23-partner-asks-ranked.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def write_lap_log_columns(twin: Path, out: Path, iso: str) -> Path:
    """W5.2 — what CSV columns we need for DEC-007 / B10."""
    ms = twin / "_motor_stack"
    cols = [
        ("t_s", "s", "Time base, monotonic", "required"),
        ("vehicle_speed_kph", "km/h", "Optional cross-check", "optional"),
        ("regen_power_kw", "kW", "Front regen electrical or shaft proxy", "required_or_V_I"),
        ("Vdc_v", "V", "HV bus", "required_if_no_power"),
        ("Idc_a", "A", "HV current (signed regen)", "required_if_no_power"),
        ("front_motor_rpm", "rpm", "If available", "optional"),
        ("front_torque_nm", "N·m", "If available", "optional"),
        ("coolant_inlet_c", "°C", "If logged", "optional"),
        ("throttle_pedal", "–", "Context only", "optional"),
        ("brake_regen_request", "–", "Context only", "optional"),
    ]
    rep = {
        "schema": "forgeos.fpk.lap_log_column_ask/v1",
        "status": "PARTNER_ASK_DRAFT",
        "ship_ok": False,
        "ran_at": iso,
        "rate_hz_minimum": 10,
        "rate_hz_preferred": 20,
        "duration": "≥1 full race stint or representative quali + race lap set",
        "columns": [{"name": n, "unit": u, "why": w, "need": need} for n, u, w, need in cols],
        "acceptance": [
            "Either regen_power_kw OR (Vdc_v AND Idc_a) present continuously",
            "No invented gaps filled with constants without a quality flag column",
            "UTC or session-relative time documented",
        ],
        "bar_b_ask": "BARB-DUTY-CYCLE",
        "closes": "DEC-007 / B10 continuous duty evidence",
        "explicitly_not_claimed": ["we_have_the_log", "ship_ok"],
    }
    (ms / "lap_log_column_ask.json").write_text(json.dumps(rep, indent=2) + "\n")

    fig = plt.figure(figsize=(11.0, 7.0), facecolor=C_BG)
    fig.text(0.05, 0.93, "Lap / stint log — required CSV columns (W5.2 / BARB-DUTY-CYCLE)", fontsize=14, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.885, f"≥20 Hz preferred · ≥10 Hz minimum · ship_ok=false · {iso}", fontsize=10, color=C_MUTED)
    y = 0.80
    fig.text(0.05, y, "column", fontsize=8, fontweight="bold", color=C_MUTED)
    fig.text(0.28, y, "unit", fontsize=8, fontweight="bold", color=C_MUTED)
    fig.text(0.38, y, "need", fontsize=8, fontweight="bold", color=C_MUTED)
    fig.text(0.55, y, "why", fontsize=8, fontweight="bold", color=C_MUTED)
    y -= 0.04
    for n, u, w, need in cols:
        fig.text(0.05, y, n, fontsize=9, family="monospace", color=C_INK)
        fig.text(0.28, y, u, fontsize=9, color=C_MUTED)
        col = C_WARN if "required" in need else C_OK
        fig.text(0.38, y, need, fontsize=8, color=col)
        fig.text(0.55, y, w, fontsize=8.5, color=C_INK)
        y -= 0.045
    fig.text(0.05, 0.18, "Acceptance", fontsize=11, fontweight="bold", color=C_INK)
    fig.text(
        0.05,
        0.08,
        "• regen_power_kw OR (Vdc×Idc) continuous\n"
        "• no silent constant-fill gaps\n"
        "• time base documented\n"
        "Closes DEC-007 / B10. Does not invent a duty cycle.",
        fontsize=9.5,
        color=C_INK,
        va="top",
    )
    path = out / "24-lap-log-columns-ask.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def rewrite_voltage_page(twin: Path, out: Path, iso: str) -> Path:
    """Refresh page 21 with OP-context honesty."""
    ms = twin / "_motor_stack"
    rep = json.loads((ms / "path_b_voltage_feasibility_screen.json").read_text())
    op = rep["operating_point"]
    hl = rep["headline"]
    fig = plt.figure(figsize=(11.2, 7.2), facecolor=C_BG)
    fig.text(0.05, 0.93, "Path B voltage feasibility — 24k vs 600–900 V (analytical)", fontsize=14, fontweight="bold", color=C_INK)
    fig.text(
        0.05,
        0.885,
        f"speed×{op.get('speed_ratio_vs_legacy_19500')} vs 19.5k  ·  −30° is OP CONTEXT not model input  ·  "
        f"Bar A open  ·  ship_ok=false  ·  {iso}",
        fontsize=9,
        color=C_MUTED,
    )
    ax = fig.add_axes([0.08, 0.40, 0.52, 0.40])
    ax.set_facecolor("#FFFFFF")
    buses = [c["dc_bus_voltage_v"] for c in rep["bus_cases"]]
    utils = [c["controlling_voltage_utilisation"] for c in rep["bus_cases"]]
    cols = [C_WARN if u > 1 else (C_OK if u < 0.9 else "#E67E22") for u in utils]
    ax.bar([str(int(b)) for b in buses], utils, color=cols, edgecolor=C_INK, width=0.55)
    ax.axhline(1.0, color=C_WARN, ls="--", lw=1.3, label="usable ceiling")
    for i, u in enumerate(utils):
        ax.text(i, u + 0.02, f"{u:.2f}", ha="center", fontweight="bold")
    ax.set_ylabel("controlling util")
    ax.set_xlabel("DC bus V")
    ax.set_ylim(0, max(1.15, max(utils) * 1.25))
    ax.legend(fontsize=8)
    ax.grid(True, axis="y", color=C_GRID, alpha=0.5)
    ax.set_title("Scalar model util (OC BEMF + P/I loaded V)", fontsize=11)

    fig.text(0.65, 0.72, "What this is / is not", fontsize=11, fontweight="bold", color=C_INK)
    fig.text(
        0.65,
        0.38,
        "IS:\n"
        "• Path B OC B_rms → BEMF\n"
        "• P/(η√3 I PF) → loaded Vll\n"
        f"• util@750 ≈ {hl.get('controlling_utilisation_at_nominal')}\n"
        f"• all_fit = {hl.get('all_bus_corners_within_usable_ceiling')}\n\n"
        "IS NOT:\n"
        "• −30° dq voltage vector\n"
        "• MTPA voltage circle\n"
        "• saturated Ld/Lq map\n"
        "• Bar A close\n"
        "• torque_reliable",
        fontsize=9,
        family="monospace",
        color=C_INK,
        va="top",
    )
    fig.text(
        0.05,
        0.22,
        op.get("current_angle_honesty")
        or "−30° electrical is Path B kit-case context only; scalar V model does not use angle.",
        fontsize=8.5,
        color=C_WARN,
        wrap=True,
    )
    fig.text(0.05, 0.08, "Prior em_fia_voltage_fw_screen.json = 19.5k / 97.58 mm lineage — not Path B proof.", fontsize=8.5, color=C_MUTED)
    fig.text(0.05, 0.04, "W4.1-lite · analytical · ship_ok=false · closes_bar_a=false", fontsize=8, color=C_MUTED)
    path = out / "21-path-b-voltage-feasibility.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
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
        "21-path-b-voltage-feasibility.png",
        "22-dyno-request-matrix.png",
        "23-partner-asks-ranked.png",
        "24-lap-log-columns-ask.png",
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
        fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
        fig.text(0.08, 0.8, "FE Front — Path B EM honesty pack", fontsize=18, fontweight="bold", color=C_INK)
        fig.text(
            0.08,
            0.45,
            "\n".join(
                [
                    "Path B mean ~122 N·m clears architecture ~104 N·m (~1.17×).",
                    "Does not clear binding ~125 N·m. ship_ok false. Homologation ~1/10.",
                    "",
                    "Partner pages 22–24 are REQUESTS only — no invented dyno/log data.",
                    "Voltage page 21 is analytical; −30° is OP context, not model input.",
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
    (out / "manifest.json").write_text(
        json.dumps(
            {
                "schema": "forgeos.fpk.jack_em_pack/v1",
                "rendered_at": iso,
                "twin": str(twin),
                "path_b": str(pb_path),
                "figures": figs,
                "pdf": str(pdf.relative_to(twin)),
                "claims": {
                    "path_b_mean_nm": (path_b.get("works_in_kit_context") or {}).get(
                        "torque_magnitude_mean_nm"
                    ),
                    "ship_ok": False,
                    "not_claimed": [
                        "ship_ok",
                        "Bar A close",
                        "torque_reliable",
                        "dyno_results",
                        "MTPA_voltage_circle",
                    ],
                },
                "phase_e": {
                    "w5_1_dyno_matrix": True,
                    "w5_partner_asks": True,
                    "w5_2_lap_log_columns": True,
                    "voltage_honesty_tighten": True,
                },
            },
            indent=2,
        )
        + "\n"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    out = ms / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)
    iso = _iso()

    if not (ms / PATH_B).is_file():
        print(json.dumps({"error": "missing Path B", "ship_ok": False}))
        return 2

    tighten_voltage_honesty(ms, iso)
    wrote = [
        write_dyno_matrix(twin, out, iso).name,
        write_partner_asks_page(twin, out, iso).name,
        write_lap_log_columns(twin, out, iso).name,
        rewrite_voltage_page(twin, out, iso).name,
    ]
    pdf = rebuild_pdf(out)
    wrote.append(pdf.name)
    update_manifest(twin, out, pdf, iso)
    print(json.dumps({"wrote": wrote, "ship_ok": False, "pages": "21-24"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
