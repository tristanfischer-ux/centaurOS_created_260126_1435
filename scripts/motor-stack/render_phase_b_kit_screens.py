#!/usr/bin/env python3
"""Phase B kit screens for Jack pack: PCB honesty, system block, inverter mass, visual brief."""
from __future__ import annotations
import argparse, json
from datetime import datetime, timezone
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
C_BG, C_INK, C_MUTED, C_GRID = "#FAFAF8", "#1A1A1A", "#5C5C5C", "#D8D8D4"
C_OK, C_WARN = "#0B6E4F", "#922B21"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    out = twin / "_motor_stack" / "jack_em_pack"
    out.mkdir(parents=True, exist_ok=True)
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    pcb = st.get("pcb") or {}
    inv = json.loads((twin / "_motor_stack" / "inverter_packaging_fia_front_kit_case.json").read_text())
    scr = inv.get("screening_results") or {}
    cap = json.loads((twin / "_motor_stack" / "dc_link_capacitor_concept_screen.json").read_text())
    pb = json.loads((twin / "_motor_stack" / "em_fia_front_kit_case_PATH_B_DEC009.json").read_text())
    iso = _iso()

    def g(k, d=None):
        r = q.get(k)
        return r.get("value") if isinstance(r, dict) else d

    # PCB
    fig = plt.figure(figsize=(11, 7.2), facecolor=C_BG)
    fig.text(0.05, 0.92, "PCB honesty sheet — draft topology, not fabrication", fontsize=16, fontweight="bold", color=C_INK)
    fig.text(0.05, 0.875, f"disposition={pcb.get('disposition')}  ·  NOT_FABRICATION_READY  ·  ship_ok=false  ·  {iso}", fontsize=10, color=C_MUTED)
    boards = (pcb.get("architecture") or {}).get("boards") or []
    y = 0.80
    for b in boards:
        bid, role = b.get("boardId"), b.get("role")
        shape = b.get("shape") or {}
        dats = {d["id"]: d for d in shape.get("datums") or [] if isinstance(d, dict)}
        w = dats.get("outline_width_mm", {}).get("valueMm", "?")
        h = dats.get("outline_height_mm", {}).get("valueMm", "?")
        ch = ", ".join(f"{c.get('role')}×{c.get('count')}" for c in (b.get("channelRequirements") or [])[:6])
        work = ", ".join((b.get("workPerformed") or [])[:5])
        fig.text(0.05, y, f"• {bid}  ({role})", fontsize=11, fontweight="bold", color=C_INK, family="monospace"); y -= 0.04
        fig.text(0.07, y, f"outline ~{w}×{h} mm  ·  mounts={shape.get('mountingHoles')}  ·  domains={b.get('domains')}", fontsize=9, color=C_MUTED); y -= 0.035
        fig.text(0.07, y, f"channels: {ch}", fontsize=9, color=C_INK); y -= 0.035
        fig.text(0.07, y, f"work: {work}", fontsize=9, color=C_INK); y -= 0.05
    y -= 0.02
    fig.text(0.05, y, "HAVE (software)", fontsize=11, fontweight="bold", color=C_OK); y -= 0.04
    for line in ["Forge-authored KiCad drafts for gate-drive + control", "Channel architecture from twin words", "DRC pipeline on twin (forgeDraftOnly)"]:
        fig.text(0.07, y, f"✓ {line}", fontsize=9.5, color=C_INK); y -= 0.032
    y -= 0.02
    fig.text(0.05, y, "DO NOT HAVE (Bar B / partner)", fontsize=11, fontweight="bold", color=C_WARN); y -= 0.04
    for line in ["Supplier-stamped Gerbers / stack-up", "Frozen SiC module MPN pinout ICD", "HIL on populated hardware", "Production BOM / fab release"]:
        fig.text(0.07, y, f"○ {line}", fontsize=9.5, color=C_INK); y -= 0.032
    fig.text(0.05, 0.06, "W2.4 · do not send these boards to a fab house as release art", fontsize=8, color=C_MUTED)
    fig.savefig(out / "07-pcb-honesty-sheet.png", dpi=150, facecolor=C_BG); plt.close()

    # Block diagram
    fig, ax = plt.subplots(figsize=(12, 7), facecolor=C_BG)
    ax.set_xlim(0, 12); ax.set_ylim(0, 8); ax.axis("off"); ax.set_facecolor(C_BG)
    ax.set_title("Front FPK system block — energy & control boundaries (concept)", fontsize=14, fontweight="bold", color=C_INK, pad=12)

    def box(x, y, w, h, title, sub, fc="#E8F0FE"):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05,rounding_size=0.15", facecolor=fc, edgecolor=C_INK, linewidth=1.4))
        ax.text(x + w / 2, y + h * 0.62, title, ha="center", va="center", fontsize=10, fontweight="bold", color=C_INK)
        ax.text(x + w / 2, y + h * 0.28, sub, ha="center", va="center", fontsize=7.5, color=C_MUTED)

    def arrow(x1, y1, x2, y2):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="->", color=C_INK, lw=1.5))

    box(0.3, 5.5, 2.2, 1.5, "HV DC bus", "750 V class\ncontactor/HVIL OPEN", "#FDEDEC")
    box(3.0, 5.5, 2.4, 1.5, "DC-link caps", "C 71–884 µF screen\nno MPN · ESL OPEN", "#FCF3CF")
    box(5.9, 5.5, 2.6, 1.5, "SiC inverter", "class screen · 8.2 kg seed\nMPN OPEN", "#D5F5E3")
    box(9.0, 5.5, 2.5, 1.5, "Gate drive PCB", "draft · NOT_FAB", "#EBF5FB")
    box(5.9, 3.2, 2.6, 1.6, "IPM motor", "Path B 122.1 N·m\n24k / 130 / 6×22.5", "#D6EAF8")
    box(9.0, 3.2, 2.5, 1.6, "Control PCB", "draft · NOT_FAB", "#EBF5FB")
    box(3.0, 3.2, 2.4, 1.6, "Cold plate", "Δp screen · B6 OPEN", "#E8DAEF")
    box(0.3, 3.2, 2.2, 1.6, "Coolant loop", "EGW seed · B6 OPEN", "#E8DAEF")
    box(5.9, 1.0, 2.6, 1.5, "Reducer / gear", "ratio OPEN", "#F6DDCC")
    box(9.0, 1.0, 2.5, 1.5, "Halfshaft / bay", "XYZ OPEN", "#F5B7B1")
    box(0.3, 1.0, 5.1, 1.5, "Vehicle LV / CAN / safety", "pre-charge/HVIL/IMD ownership OPEN", "#FADBD8")
    for a in [(2.5, 6.25, 3.0, 6.25), (5.4, 6.25, 5.9, 6.25), (8.5, 6.25, 9.0, 6.25), (7.2, 5.5, 7.2, 4.8), (7.2, 3.2, 7.2, 2.5)]:
        arrow(*a)
    ax.text(0.3, 0.25, "Red-tinted = partner/hardware OPEN. Not a wiring ICD. ship_ok=false.", fontsize=8, color=C_MUTED)
    ax.text(0.3, 0.08, f"W1.4 · {_iso()}", fontsize=8, color=C_MUTED)
    fig.savefig(out / "08-system-block-diagram.png", dpi=150, facecolor=C_BG, bbox_inches="tight"); plt.close()

    # Inverter mass
    mass_m = float((pb.get("machine_geometry") or {}).get("estimated_active_material_mass_kg") or 13)
    mass_i = float(q["mass_inverter_kg"]["value"])
    mass_cap = float(q["fpk_mass_cap_kg"]["value"])
    other = max(mass_cap - mass_i - mass_m, 0)
    fig, ax = plt.subplots(figsize=(10, 5.8), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    ax.set_title("Inverter class + mass budget reconciliation (concept seeds)", fontsize=13, fontweight="bold", color=C_INK)
    ax.bar([0, 1, 2], [mass_m, mass_i, other], color=["#1B4F72", "#0B6E4F", "#BDC3C7"], width=0.55)
    ax.axhline(mass_cap, color=C_WARN, linestyle="--", linewidth=1.5, label=f"kit mass cap {mass_cap} kg")
    ax.set_xticks([0, 1, 2]); ax.set_xticklabels(["Motor\nactive mat.", "Inverter\nseed", "Remainder\n(gear/cool/HV/…)"])
    ax.set_ylabel("kg"); ax.legend(loc="upper right")
    for i, v in enumerate([mass_m, mass_i, other]):
        ax.text(i, v + 0.3, f"{v:.1f}", ha="center", fontweight="bold")
    ax.text(0.02, 0.98, f"ESL nom {scr.get('bus_esl_nominal_nh')} nH · fits bay={scr.get('mcu_fits_bay')}\n"
            f"Cap vol nom band {cap.get('envelope',{}).get('volume_cm3_nom_band')} cm³ · MPN OPEN",
            transform=ax.transAxes, va="top", fontsize=8.5, family="monospace",
            bbox=dict(boxstyle="round", facecolor="white", edgecolor=C_GRID))
    fig.tight_layout(rect=(0.03, 0.06, 0.97, 0.96))
    fig.savefig(out / "09-inverter-mass-budget.png", dpi=150, facecolor=C_BG); plt.close()

    # Visual brief
    (out / "10-fe-visual-brief.md").write_text(
        f"""# FE Front kit — visual authenticity brief (W3.1)\n\n**Status:** BRIEF ONLY — not a Blender re-render.\n**Date:** {iso}\n\n## Goal\nRead as Formula E front regen FPK, not generic industrial pod.\n\n## Must show\n1. Motor IPM casing + coolant ports + resolver\n2. Reducer (ratio OPEN)\n3. Inverter housing + cold plate\n4. DC-link region tagged CONCEPT ENVELOPE / NO MPN (volume band from capacitor screen)\n5. Gate-drive + control as draft volumes (NOT_FAB)\n6. HV connector + coolant QD + LV/CAN (XYZ OPEN)\n7. Bay ghost 343×259×267 mm\n\n## Must not\n- Fake XYZ mounts, supplier Gerbers look, ship_ok implication\n\n## Caption standard\n`Concept morphology under DEC-008/009 · Path B FE SIGHT-candidate · ship_ok false · interfaces OPEN`\n\n## Next\nW3.2-lite envelope boxes with visualOnly=true after W2.1/W2.2 review.\n"""
    )

    # mass JSON
    rep = {
        "schema": "forgeos.fpk.inverter_class_mass_screen/v1",
        "status": "PARTIAL_ANALYTICAL_SCREEN",
        "ship_ok": False,
        "ran_at": iso,
        "mass_kg": {
            "motor_active_material": mass_m,
            "inverter_seed": mass_i,
            "remainder_for_gear_cool_hv": round(other, 2),
            "fpk_cap": mass_cap,
        },
        "packaging_screen": {
            "esl_nominal_nh": scr.get("bus_esl_nominal_nh"),
            "mcu_fits_bay": scr.get("mcu_fits_bay"),
            "footprint_mm2": scr.get("mcu_footprint_area_mm2"),
            "dissipated_kw": scr.get("inverter_dissipated_kw"),
        },
        "explicitly_not_claimed": ["supplier_MPN", "measured_ESL", "ship_ok", "production_BOM"],
    }
    (twin / "_motor_stack" / "inverter_class_mass_screen.json").write_text(json.dumps(rep, indent=2) + "\n")
    print(json.dumps({"wrote": [p.name for p in out.glob('0[7-9]*')], "mass": rep["mass_kg"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
