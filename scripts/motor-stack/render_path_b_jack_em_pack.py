#!/usr/bin/env python3
"""Render Jack-facing EM honesty figures from Path B kit-case artefact.

Reads only on-disk Path B (+ optional REBALANCED for comparison). Does not
re-solve FE, does not mint ship_ok, does not claim duty_torque_screen_ok.

Outputs PNG + multi-page PDF under the twin _motor_stack/jack_em_pack/.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import Circle, FancyBboxPatch, Wedge  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
PATH_B_NAME = "em_fia_front_kit_case_PATH_B_DEC009.json"
REBALANCED_NAME = "em_fia_front_kit_case_REBALANCED.json"

# Light-mode palette (Tristan preference)
C_BG = "#FAFAF8"
C_INK = "#1A1A1A"
C_MUTED = "#5C5C5C"
C_GRID = "#D8D8D4"
C_ARCH = "#0B6E4F"  # architecture bar — green, cleared
C_BIND = "#8B4513"  # conservative binding — brown, not cleared
C_PATHB = "#1B4F72"  # Path B mean
C_REB = "#7F8C8D"  # REBALANCED legacy
C_TORQUE = "#1B4F72"
C_FLUX = "#B03A2E"
C_MEAN = "#117A65"
C_WARN = "#922B21"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _style_axes(ax: plt.Axes, title: str) -> None:
    ax.set_facecolor(C_BG)
    ax.set_title(title, fontsize=12, fontweight="bold", color=C_INK, pad=10)
    ax.tick_params(colors=C_INK, labelsize=9)
    for spine in ax.spines.values():
        spine.set_color(C_GRID)
    ax.grid(True, color=C_GRID, linewidth=0.6, alpha=0.85)
    ax.set_axisbelow(True)


def _caption(fig: plt.Figure, lines: list[str]) -> None:
    text = "\n".join(lines)
    fig.text(
        0.5,
        0.02,
        text,
        ha="center",
        va="bottom",
        fontsize=7.5,
        color=C_MUTED,
        wrap=True,
        linespacing=1.35,
    )


def fig_dual_bars(
    path_b: dict,
    reb: dict | None,
    out: Path,
) -> Path:
    wic = path_b.get("works_in_kit_context") or {}
    mean_b = float(wic.get("torque_magnitude_mean_nm") or 0)
    arch = float(wic.get("required_shaft_torque_nm") or 0)
    bind = 125.214912
    mean_r = None
    if reb:
        rw = reb.get("works_in_kit_context") or {}
        mean_r = rw.get("torque_magnitude_mean_nm")
        if mean_r is not None:
            mean_r = float(mean_r)
        req_r = rw.get("required_shaft_torque_nm")
        if req_r is not None:
            bind = float(req_r)

    labels = [
        "Architecture duty\n(24k / 250 kW)",
        "Path B kit-case\nmean |T|",
        "Conservative binding\n(REBALANCED ledger)",
    ]
    values = [arch, mean_b, bind]
    colours = [C_ARCH, C_PATHB, C_BIND]
    if mean_r is not None:
        labels.append("REBALANCED mean\n(pre-DEC-009)")
        values.append(mean_r)
        colours.append(C_REB)

    fig, ax = plt.subplots(figsize=(9.5, 5.8), facecolor=C_BG)
    _style_axes(ax, "FE Front — dual torque bars (honest reading)")
    x = np.arange(len(labels))
    bars = ax.bar(x, values, color=colours, width=0.62, edgecolor="white", linewidth=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9, color=C_INK)
    ax.set_ylabel("Shaft torque (N·m)", color=C_INK)
    ax.axhline(arch, color=C_ARCH, linestyle="--", linewidth=1.0, alpha=0.55)
    ax.axhline(bind, color=C_BIND, linestyle=":", linewidth=1.2, alpha=0.7)

    for b, v in zip(bars, values):
        ax.text(
            b.get_x() + b.get_width() / 2,
            v + max(values) * 0.02,
            f"{v:.1f}",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
            color=C_INK,
        )

    ratio_arch = mean_b / arch if arch else float("nan")
    ratio_bind = mean_b / bind if bind else float("nan")
    ax.text(
        0.98,
        0.96,
        f"Path B / architecture = {ratio_arch:.3f}×  (clears)\n"
        f"Path B / binding = {ratio_bind:.3f}×  (does not clear)\n"
        f"duty_torque_screen_ok = false  (torque_reliable gate)\n"
        f"ship_ok = false",
        transform=ax.transAxes,
        ha="right",
        va="top",
        fontsize=8.5,
        color=C_INK,
        bbox=dict(boxstyle="round,pad=0.45", facecolor="white", edgecolor=C_GRID),
    )
    _caption(
        fig,
        [
            "Architecture bar = Path B analytical required shaft torque at DEC-009 freeze (24,000 rpm, 250 kW, twin η). "
            "Conservative binding = REBALANCED ledger bar (~19.5k class). "
            "Path B mean is sign-consistent kit-case FE — not duty-clear SIGHT, not ship_ok.",
            f"Source: {PATH_B_NAME}  ·  rendered {_iso()}",
        ],
    )
    fig.tight_layout(rect=(0.03, 0.10, 0.97, 0.96))
    path = out / "01-dual-torque-bars.png"
    fig.savefig(path, dpi=160, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_torque_sweep(path_b: dict, out: Path) -> Path:
    sw = path_b.get("rotor_position_sweep") or {}
    pts = sw.get("points") or []
    wic = path_b.get("works_in_kit_context") or {}
    arch = float(wic.get("required_shaft_torque_nm") or 0)
    bind = 125.214912
    mean = float(wic.get("torque_magnitude_mean_nm") or 0)
    summ = sw.get("summary") or {}

    theta = [float(p["rotor_position_mechanical_deg"]) for p in pts]
    t_mag = [float(p["torque_magnitude_nm"]) for p in pts]
    # Sign check: all same sign?
    signs = [1 if float(p["torque_nm"]) >= 0 else -1 for p in pts]
    all_same_sign = len(set(signs)) == 1

    fig, ax = plt.subplots(figsize=(9.5, 5.8), facecolor=C_BG)
    _style_axes(
        ax,
        "Path B — |torque| vs rotor position (fixed current angle −30° elec.)",
    )
    ax.fill_between(theta, t_mag, color=C_TORQUE, alpha=0.12)
    ax.plot(theta, t_mag, color=C_TORQUE, linewidth=2.2, label="|T| (kit-case sweep)")
    ax.axhline(mean, color=C_MEAN, linewidth=1.8, label=f"Mean |T| = {mean:.1f} N·m")
    ax.axhline(arch, color=C_ARCH, linestyle="--", linewidth=1.3, label=f"Architecture bar {arch:.1f} N·m")
    ax.axhline(bind, color=C_BIND, linestyle=":", linewidth=1.4, label=f"Conservative binding {bind:.1f} N·m")
    tmin = float(summ.get("torque_magnitude_min_nm") or min(t_mag))
    tmax = float(summ.get("torque_magnitude_max_nm") or max(t_mag))
    ax.axhline(tmin, color=C_MUTED, linestyle="-.", linewidth=0.9, alpha=0.7)
    ax.axhline(tmax, color=C_MUTED, linestyle="-.", linewidth=0.9, alpha=0.7)

    ax.set_xlabel("Rotor position (mechanical degrees)", color=C_INK)
    ax.set_ylabel("|Torque| (N·m)", color=C_INK)
    ax.set_ylim(0, max(tmax, bind) * 1.12)
    ax.legend(loc="upper right", fontsize=8, framealpha=0.95)
    sign_rev = summ.get("sign_reversals")
    consistent = summ.get("torque_sign_consistent")
    ax.text(
        0.02,
        0.04,
        f"sign_reversals = {sign_rev}   torque_sign_consistent = {consistent}   "
        f"all_same_sign = {all_same_sign}\n"
        f"|T| min/mean/max = {tmin:.1f} / {mean:.1f} / {tmax:.1f} N·m\n"
        f"n = {len(pts)} pts @ 1.25°   current angle = {sw.get('current_angle_electrical_deg')}° elec.\n"
        f"Mean clears architecture ({mean/arch:.2f}×) · does not clear binding ({mean/bind:.2f}×)",
        transform=ax.transAxes,
        fontsize=8,
        color=C_INK,
        va="bottom",
        bbox=dict(boxstyle="round,pad=0.4", facecolor="white", edgecolor=C_GRID),
    )
    _caption(
        fig,
        [
            "Coarse mechanical rotor-position sweep at one screened current angle — not a full MTPA map. "
            "Zero sign reversals is the Path A/B honesty gate that failed on the old DEC009 (re-derived magnets).",
            f"Source: {PATH_B_NAME}#rotor_position_sweep  ·  rendered {_iso()}",
        ],
    )
    fig.tight_layout(rect=(0.03, 0.10, 0.97, 0.96))
    path = out / "02-torque-vs-rotor-angle.png"
    fig.savefig(path, dpi=160, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_airgap_b(path_b: dict, out: Path) -> Path:
    sw = path_b.get("rotor_position_sweep") or {}
    pts = sw.get("points") or []
    theta = [float(p["rotor_position_mechanical_deg"]) for p in pts]
    b_peak = [float(p["peak_airgap_flux_density_t"]) for p in pts]
    b_rms = [float(p["rms_airgap_flux_density_t"]) for p in pts]
    fp = path_b.get("finite_element_point") or {}

    fig, ax = plt.subplots(figsize=(9.5, 5.8), facecolor=C_BG)
    _style_axes(ax, "Path B — air-gap flux density vs rotor position")
    ax.plot(theta, b_peak, color=C_FLUX, linewidth=2.0, label="Peak air-gap |B|")
    ax.plot(theta, b_rms, color=C_MUTED, linewidth=1.4, linestyle="--", label="RMS air-gap |B|")
    ax.set_xlabel("Rotor position (mechanical degrees)", color=C_INK)
    ax.set_ylabel("Flux density (T)", color=C_INK)
    ax.legend(loc="upper right", fontsize=9, framealpha=0.95)
    ax.text(
        0.02,
        0.04,
        f"Loaded FE point peak |B| = {fp.get('peak_airgap_flux_density_t')}\n"
        f"Sweep peak |B| range = {min(b_peak):.3f} – {max(b_peak):.3f} T\n"
        "Scalar air-gap samples from kit-case — not a full field map / demag close.",
        transform=ax.transAxes,
        fontsize=8,
        color=C_INK,
        va="bottom",
        bbox=dict(boxstyle="round,pad=0.4", facecolor="white", edgecolor=C_GRID),
    )
    _caption(
        fig,
        [
            "Physics flavour from the same Path B sweep used for torque. Does not claim MTPA, demagnetisation, or thermal closure.",
            f"Source: {PATH_B_NAME}  ·  rendered {_iso()}",
        ],
    )
    fig.tight_layout(rect=(0.03, 0.10, 0.97, 0.96))
    path = out / "03-airgap-flux-vs-angle.png"
    fig.savefig(path, dpi=160, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_geometry_card(path_b: dict, out: Path) -> Path:
    g = path_b.get("machine_geometry") or {}
    iq = path_b.get("input_quantities") or {}

    # Diameters mm
    rid = float(g.get("rotor_inner_diameter_mm") or 0)
    rod = float(g.get("rotor_outer_diameter_mm") or 0)
    sid = float(g.get("stator_inner_diameter_mm") or 0)
    sod = float(g.get("stator_outer_diameter_mm") or 0)
    hod = float(g.get("housing_outer_diameter_mm") or sod)
    poles = int(g.get("rotor_poles") or 8)
    slots = int(g.get("stator_slots") or 24)
    mag_t = float(g.get("magnet_thickness_mm") or 6)
    mag_l = float(g.get("magnet_length_mm") or 22.5)
    active = float(g.get("active_length_mm") or 130)

    fig, ax = plt.subplots(figsize=(9.5, 6.2), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    ax.set_aspect("equal")
    ax.set_title(
        "Path B machine identity — DEC-009 freeze (cross-section schematic)",
        fontsize=12,
        fontweight="bold",
        color=C_INK,
        pad=10,
    )
    ax.axis("off")

    # Scale: plot in mm, origin centre
    def ring(r_in: float, r_out: float, color: str, alpha: float = 0.85) -> None:
        if r_out <= r_in:
            return
        w = Wedge((0, 0), r_out, 0, 360, width=r_out - r_in, facecolor=color, edgecolor=C_INK, linewidth=0.4, alpha=alpha)
        ax.add_patch(w)

    ring(0, rid / 2, "#E8E8E4", 0.5)
    ring(rid / 2, rod / 2, "#5D6D7E", 0.9)  # rotor iron
    # magnet layer (simplified annular band outside rotor OD toward airgap)
    airgap = float(g.get("radial_airgap_mm") or 0.7)
    ring(rod / 2, rod / 2 + mag_t, "#C0392B", 0.75)  # magnets schematic
    ring(sid / 2, sod / 2, "#1A5276", 0.55)  # stator
    ring(sod / 2, hod / 2, "#BDC3C7", 0.45)  # housing

    # slot ticks
    for i in range(slots):
        ang = 2 * math.pi * i / slots
        r0, r1 = sid / 2, sid / 2 + float(g.get("slot_depth_mm") or 15)
        ax.plot(
            [r0 * math.cos(ang), r1 * math.cos(ang)],
            [r0 * math.sin(ang), r1 * math.sin(ang)],
            color="#F4D03F",
            linewidth=1.1,
            alpha=0.85,
        )
    # pole ticks on rotor
    for i in range(poles):
        ang = 2 * math.pi * i / poles + math.pi / poles
        r0, r1 = rid / 2 + 2, rod / 2 - 1
        ax.plot(
            [r0 * math.cos(ang), r1 * math.cos(ang)],
            [r0 * math.sin(ang), r1 * math.sin(ang)],
            color="white",
            linewidth=1.4,
            alpha=0.9,
        )

    lim = hod / 2 * 1.15
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)

    info = (
        f"Active length  {active:.2f} mm\n"
        f"Rotor OD       {rod:.1f} mm\n"
        f"Stator OD      {sod:.1f} mm\n"
        f"Housing OD     {hod:.1f} mm\n"
        f"Air-gap        {airgap:.2f} mm\n"
        f"Magnets        {mag_t:.1f} × {mag_l:.1f} mm  (baseline freeze)\n"
        f"Topology       {slots} slots / {poles} poles\n"
        f"Speed          {iq.get('max_rotor_speed_rpm')} rpm\n"
        f"I_design       {iq.get('phase_current_design_a')} A rms\n"
        f"Mean |T|       {(path_b.get('works_in_kit_context') or {}).get('torque_magnitude_mean_nm')} N·m"
    )
    ax.text(
        1.02,
        0.5,
        info,
        transform=ax.transAxes,
        fontsize=9.5,
        color=C_INK,
        va="center",
        family="monospace",
        bbox=dict(boxstyle="round,pad=0.55", facecolor="white", edgecolor=C_GRID),
    )
    ax.text(
        0.0,
        -0.08,
        "Schematic only (not CAD). Magnets shown as radial band for identity — IPM pocket detail is in kit-case geometry.",
        transform=ax.transAxes,
        fontsize=7.5,
        color=C_MUTED,
        ha="left",
    )
    _caption(
        fig,
        [
            "Identity card for Path B DEC-009 freeze. Failed DEC009 used re-derived magnets 8.85×14.58 mm — do not quote that artefact.",
            f"Source: {PATH_B_NAME}#machine_geometry  ·  rendered {_iso()}",
        ],
    )
    fig.tight_layout(rect=(0.02, 0.08, 0.98, 0.95))
    path = out / "04-geometry-identity-card.png"
    fig.savefig(path, dpi=160, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_hero_callout(path_b: dict, hero_path: Path | None, out: Path) -> Path | None:
    if hero_path is None or not hero_path.is_file():
        return None
    wic = path_b.get("works_in_kit_context") or {}
    g = path_b.get("machine_geometry") or {}
    iq = path_b.get("input_quantities") or {}
    mean = float(wic.get("torque_magnitude_mean_nm") or 0)
    arch = float(wic.get("required_shaft_torque_nm") or 0)
    bind = 125.214912

    im = Image.open(hero_path).convert("RGBA")
    w, h = im.size
    # Panel on left third
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    panel_w = int(w * 0.36)
    draw.rounded_rectangle(
        (int(w * 0.03), int(h * 0.08), int(w * 0.03) + panel_w, int(h * 0.78)),
        radius=18,
        fill=(250, 250, 248, 230),
        outline=(26, 26, 26, 80),
        width=2,
    )
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", size=max(22, w // 55))
        font_body = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size=max(16, w // 70))
        font_small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size=max(13, w // 85))
    except OSError:
        font_title = ImageFont.load_default()
        font_body = font_title
        font_small = font_title

    x0 = int(w * 0.05)
    y = int(h * 0.12)
    lines = [
        ("FE Front MGU — Path B EM status", font_title, (26, 26, 26, 255)),
        ("", font_small, (0, 0, 0, 0)),
        (f"Architecture   {iq.get('max_rotor_speed_rpm'):.0f} rpm  ·  {g.get('active_length_mm')} mm stack", font_body, (26, 26, 26, 255)),
        (f"Magnets        {g.get('magnet_thickness_mm')} × {g.get('magnet_length_mm')} mm (frozen)", font_body, (26, 26, 26, 255)),
        (f"Kit-case mean  {mean:.1f} N·m  (sign-consistent)", font_body, (27, 79, 114, 255)),
        (f"Architecture bar  {arch:.1f} N·m   →  {mean/arch:.2f}×  CLEAR", font_body, (11, 110, 79, 255)),
        (f"Conservative bar  {bind:.1f} N·m   →  {mean/bind:.2f}×  NOT CLEAR", font_body, (139, 69, 19, 255)),
        ("", font_small, (0, 0, 0, 0)),
        ("duty_torque_screen_ok = false", font_body, (146, 43, 33, 255)),
        ("(torque_reliable gate — dyno/map still open)", font_small, (92, 92, 92, 255)),
        ("ship_ok = false   ·   not Bar A close", font_body, (146, 43, 33, 255)),
        ("", font_small, (0, 0, 0, 0)),
        ("Do not quote failed DEC009 (8.85 mm magnets).", font_small, (92, 92, 92, 255)),
    ]
    for text, font, fill in lines:
        if text:
            draw.text((x0, y), text, font=font, fill=fill)
        y += int(font.size * 1.55) if hasattr(font, "size") else 22

    composed = Image.alpha_composite(im, overlay).convert("RGB")
    path = out / "05-product-hero-em-callouts.jpg"
    composed.save(path, quality=92, optimize=True)
    return path


def _find_hero(twin: Path) -> Path | None:
    candidates = sorted(twin.glob("*/renders/00-hero.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def fig_verdict_one_pager(path_b: dict, twin: Path, out: Path) -> Path:
    """W1.1 — council-required dual-bar arithmetic + non-claims."""
    wic = path_b.get("works_in_kit_context") or {}
    g = path_b.get("machine_geometry") or {}
    iq = path_b.get("input_quantities") or {}
    mean = float(wic.get("torque_magnitude_mean_nm") or 0)
    arch = float(wic.get("required_shaft_torque_nm") or 0)
    bind = 125.214912
    qpath = twin / "state.json"
    if qpath.is_file():
        q = (_load(qpath).get("orchestratorContract") or {}).get("quantities") or {}
        if isinstance(q.get("binding_duty_shaft_torque_nm"), dict):
            bind = float(q["binding_duty_shaft_torque_nm"]["value"])
        if isinstance(q.get("architecture_duty_shaft_torque_nm"), dict):
            arch = float(q["architecture_duty_shaft_torque_nm"]["value"])
    gap_arch = mean - arch
    gap_bind = mean - bind
    fig = plt.figure(figsize=(11.0, 7.8), facecolor=C_BG)
    fig.text(0.06, 0.92, "FE Front MGU — Jack verdict (one page)", fontsize=18, fontweight="bold", color=C_INK)
    fig.text(0.06, 0.875, "Concept pack under named assumptions · not homologation · ship_ok = false", fontsize=11, color=C_MUTED)
    body = [
        f"Architecture freeze (DEC-009):  {iq.get('max_rotor_speed_rpm')} rpm  ·  {g.get('active_length_mm')} mm stack  ·  magnets {g.get('magnet_thickness_mm')}×{g.get('magnet_length_mm')} mm",
        f"Duty assumption (DEC-008):      intermittent peak (vignette ~24 s regen / 100 s) — not continuous 250 kW thermal",
        "",
        f"Path B kit-case FE mean |T|     {mean:.3f} N·m   (sign-consistent; sign_reversals=0; SIGHT-candidate only)",
        f"Architecture duty bar (24k)     {arch:.3f} N·m   →  mean/arch = {mean/arch:.3f}×   gap = {gap_arch:+.1f} N·m   CLEARS",
        f"Conservative binding (ledger)   {bind:.3f} N·m   →  mean/bind = {mean/bind:.3f}×   gap = {gap_bind:+.1f} N·m   DOES NOT CLEAR",
        "",
        f"duty_torque_screen_ok = {wic.get('duty_torque_screen_ok')}     torque_reliable = {wic.get('torque_reliable')}",
        "Fail reason is the reliability gate (dyno/map), not short torque vs architecture bar.",
        "",
        "Product field mgu_fe_shaft_torque_nm remains option-screen PRODUCT (not kit-case FE).",
        "Do not quote failed DEC009 artefacts (re-derived magnets 8.85×14.58 mm).",
        "Do not quote pre-DEC-009 REBALANCED mean 81.56 N·m as the live freeze FE (lineage / Path A only).",
        "",
        "Bar A process: A-DUTY re-freeze under DEC-008/009 stands as concept close under assumptions.",
        "Bar A FE: Path B is SIGHT-candidate — not duty-screen green, not ship.",
        "Bar B: B1–B10 all OPEN (dyno, Gerbers, XYZ, flow bench, HIL, …) — correctly.",
        "",
        f"Artefact: {PATH_B_NAME}   rendered {_iso()}",
    ]
    fig.text(0.06, 0.82, "\n".join(body), fontsize=10.5, color=C_INK, va="top", family="monospace", linespacing=1.45)
    # mini bars
    ax = fig.add_axes([0.55, 0.12, 0.38, 0.35])
    ax.set_facecolor(C_BG)
    labels = ["Arch\n104", "Path B\nmean", "Bind\n125"]
    vals = [arch, mean, bind]
    cols = [C_ARCH, C_PATHB, C_BIND]
    ax.bar([0, 1, 2], vals, color=cols, width=0.65)
    ax.set_xticks([0, 1, 2])
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("N·m", fontsize=8)
    ax.tick_params(labelsize=8)
    for spine in ax.spines.values():
        spine.set_color(C_GRID)
    ax.set_title("Dual bars (honest)", fontsize=9, color=C_INK)
    path = out / "00-verdict-one-pager.png"
    fig.savefig(path, dpi=160, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_open_by_design(twin: Path, out: Path) -> Path:
    """W1.2 — Bar B / DEC opens with closure columns."""
    md = twin / "JLR-FE-FRONT-FPK-BAR-B-READINESS.md"
    rows = []
    if md.is_file():
        for line in md.read_text(encoding="utf-8").splitlines():
            if line.startswith("|") and "BARB-" in line:
                parts = [c.strip() for c in line.strip("|").split("|")]
                if len(parts) >= 6 and parts[1].startswith("`BARB"):
                    rows.append(parts)
    fig = plt.figure(figsize=(12.0, 8.0), facecolor=C_BG)
    fig.text(0.04, 0.94, "Open by design — Bar B & partner holds", fontsize=16, fontweight="bold", color=C_INK)
    fig.text(
        0.04,
        0.90,
        "Software can define and ask. Software cannot close these. ship_ok stays false.",
        fontsize=10,
        color=C_MUTED,
    )
    y = 0.84
    fig.text(0.04, y, f"{'Pri':<4} {'ID':<22} {'Item':<42} {'Class':<18} Status", fontsize=8, fontweight="bold", family="monospace", color=C_INK)
    y -= 0.03
    for parts in rows[:12]:
        pri, bid, item, cls = parts[0], parts[1].replace("`", ""), parts[2][:40], parts[3].replace("**", "")[:16]
        line = f"{pri:<4} {bid:<22} {item:<42} {cls:<18} OPEN"
        fig.text(0.04, y, line, fontsize=7.5, family="monospace", color=C_INK)
        y -= 0.028
        if y < 0.12:
            break
    fig.text(
        0.04,
        0.08,
        "Full executable asks (artefact / format / conditions): JLR-FE-FRONT-FPK-BAR-B-READINESS.md\n"
        f"Rendered {_iso()} · Path B EM live; dyno still required for torque_reliable",
        fontsize=8,
        color=C_MUTED,
    )
    path = out / "00b-open-by-design.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_how_to_read(out: Path) -> Path:
    """W1.5 — concept vs homologation."""
    fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
    fig.text(0.06, 0.90, "How to read this pack", fontsize=18, fontweight="bold", color=C_INK)
    left = [
        "CONCEPT (software-closed under assumptions)",
        "• DEC-008 intermittent duty + DEC-009 24k/130",
        "• Path B sign-stable kit-case FE mean",
        "• Dual torque bars (architecture vs conservative)",
        "• Cooling / oil / rotor screens (screening class)",
        "• Draft PCB topology (NOT_FAB)",
        "• Blender morphology + EM honesty figures",
        "",
        "You may treat this as a serious concept FPK.",
    ]
    right = [
        "HOMOLOGATION / RACE (partner + hardware)",
        "• Dyno map → torque_reliable",
        "• Lap CSV → duty authority",
        "• Supplier Gerbers + SiC MPN",
        "• Chassis XYZ mounts",
        "• Flow bench / oil CFD + clear case",
        "• Release FEA + material certs",
        "• HIL on populated inverter",
        "",
        "ship_ok stays false until these exist.",
    ]
    fig.text(0.06, 0.78, "\n".join(left), fontsize=11, color=C_INK, va="top", linespacing=1.5)
    fig.text(0.52, 0.78, "\n".join(right), fontsize=11, color=C_INK, va="top", linespacing=1.5)
    fig.text(
        0.06,
        0.18,
        "If a figure looks green, read the caption. Green architecture bar ≠ green duty screen ≠ ship.",
        fontsize=11,
        color=C_WARN,
        fontweight="bold",
    )
    fig.text(0.06, 0.08, f"Rendered {_iso()}", fontsize=8, color=C_MUTED)
    path = out / "00c-how-to-read-pack.png"
    fig.savefig(path, dpi=150, facecolor=C_BG)
    plt.close(fig)
    return path


def fig_thermal_storyboard(twin: Path, out: Path) -> Path:
    """W2.5 — continuous vs intermittent magnet temp."""
    q = {}
    sp = twin / "state.json"
    if sp.is_file():
        q = (_load(sp).get("orchestratorContract") or {}).get("quantities") or {}
    cont = float((q.get("magnet_temperature_screen_c") or {}).get("value") or 159.35)
    inter = float((q.get("mgu_magnet_temp_c") or {}).get("value") or 99.4)
    limit = float((q.get("magnet_temp_limit_c") or {}).get("value") or 150.0)
    fig, ax = plt.subplots(figsize=(9.5, 5.6), facecolor=C_BG)
    _style_axes(ax, "Thermal storyboard — magnet temperature under duty assumption")
    labs = ["Continuous\nscreen (wrong\nfor this FPK)", "DEC-008\nintermittent\n(DEC-009 case)", "Limit"]
    vals = [cont, inter, limit]
    cols = [C_WARN, C_ARCH, C_MUTED]
    bars = ax.bar([0, 1, 2], vals, color=cols, width=0.55)
    ax.axhline(limit, color=C_MUTED, linestyle="--", linewidth=1.2)
    ax.set_xticks([0, 1, 2])
    ax.set_xticklabels(labs, fontsize=9)
    ax.set_ylabel("Magnet temperature (°C)")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 2, f"{v:.1f} °C", ha="center", fontsize=10, fontweight="bold")
    ax.text(
        0.98,
        0.95,
        "Continuous 250 kW thermal is rejected by DEC-008\n"
        "(front unit is regen-only; vignette ~24%).\n"
        "99.4 °C is a SCREEN under assumptions — not dyno.",
        transform=ax.transAxes,
        ha="right",
        va="top",
        fontsize=8.5,
        bbox=dict(boxstyle="round,pad=0.4", facecolor="white", edgecolor=C_GRID),
    )
    _caption(
        fig,
        [
            "DEC-008 makes intermittent duty the design basis; continuous magnet 159 °C was an artefact of screening 24% duty at 100% load.",
            f"Sources: state quantities magnet_temperature_screen_c / mgu_magnet_temp_c  ·  {_iso()}",
        ],
    )
    fig.tight_layout(rect=(0.03, 0.10, 0.97, 0.96))
    path = out / "06-thermal-duty-storyboard.png"
    fig.savefig(path, dpi=160, facecolor=C_BG)
    plt.close(fig)
    return path


def build_pdf(pngs: list[Path], out: Path) -> Path:
    pdf_path = out / "FE-FRONT-PATH-B-EM-HONESTY-PACK.pdf"
    with PdfPages(pdf_path) as pdf:
        for png in pngs:
            if not png.is_file():
                continue
            img = plt.imread(str(png))
            fig = plt.figure(figsize=(11.0, 7.5), facecolor="white")
            ax = fig.add_axes([0, 0, 1, 1])
            ax.imshow(img)
            ax.axis("off")
            pdf.savefig(fig, dpi=140)
            plt.close(fig)
        # cover note page
        fig = plt.figure(figsize=(11.0, 7.5), facecolor=C_BG)
        fig.text(0.08, 0.82, "FE Front MGU — Path B EM honesty pack", fontsize=18, fontweight="bold", color=C_INK)
        fig.text(
            0.08,
            0.55,
            "\n".join(
                [
                    "Purpose: show Jack the maths we actually ran — dual bars, sign-stable torque sweep,",
                    "air-gap scalars, and machine identity — without claiming duty close or ship_ok.",
                    "",
                    "Clears: architecture power bar at 24,000 rpm (~104 N·m) at 1.17× mean.",
                    "Does not clear: conservative binding ledger bar (~125 N·m).",
                    "Open by design: torque_reliable / dyno-map; duty_torque_screen_ok; ship_ok; Bar A.",
                    "",
                    f"Rendered {_iso()}",
                    "Sources: em_fia_front_kit_case_PATH_B_DEC009.json (+ REBALANCED for legacy mean).",
                ]
            ),
            fontsize=11,
            color=C_INK,
            va="top",
            family="sans-serif",
        )
        pdf.savefig(fig)
        plt.close(fig)
    return pdf_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    pb_path = ms / PATH_B_NAME
    if not pb_path.is_file():
        print(f"MISSING {pb_path}", flush=True)
        return 2
    path_b = _load(pb_path)
    reb_path = ms / REBALANCED_NAME
    reb = _load(reb_path) if reb_path.is_file() else None

    out = ms / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)

    pngs: list[Path] = []
    # Jack spine first (council Phase A)
    pngs.append(fig_verdict_one_pager(path_b, twin, out))
    pngs.append(fig_open_by_design(twin, out))
    pngs.append(fig_how_to_read(out))
    pngs.append(fig_dual_bars(path_b, reb, out))
    pngs.append(fig_torque_sweep(path_b, out))
    pngs.append(fig_airgap_b(path_b, out))
    pngs.append(fig_geometry_card(path_b, out))
    pngs.append(fig_thermal_storyboard(twin, out))
    hero = fig_hero_callout(path_b, _find_hero(twin), out)
    if hero:
        pngs.append(hero)

    pdf = build_pdf(pngs, out)
    manifest = {
        "schema": "forgeos.fpk.jack_em_pack/v1",
        "rendered_at": _iso(),
        "twin": str(twin),
        "path_b": str(pb_path),
        "figures": [str(p.relative_to(twin)) for p in pngs],
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
            ],
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    print("PDF", pdf)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
