#!/usr/bin/env python3
"""draw_ga_detailed.py — UNIVERSAL multi-view detailed GA for sealed drive packs.

UNIVERSAL: not product-class-specific. Activates when parts-manifest shows a
concentric/rotating traction morphology (horizontal_cylinder motor + PE shelf
tags) OR when --force is passed. Consumes the same inputs as draw_ga.py:

  <out>/parts-manifest.json
  <out>/state.json  (quantities for design_envelope_* / stack_length_mm)

Produces:
  drawings/general-arrangement.svg/.png
  drawings/ga-detail-interfaces.svg/.png
  drawings/ga-detail-section.svg/.png
  drawings/GA-DETAIL-INDEX.md

INTENT: Blender morphology informs GA — cylinders for motors, shelf for PE,
envelope from twin design_envelope_*, L_stk called out. Not a STEP export.
fe-front-draw-detailed-ga.py is a thin compatibility wrapper to this module.
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

# scripts/blender-universal/ → repo root is parents[2]
REPO = Path(__file__).resolve().parents[2]


def _q(state: dict, key: str, default: float = 0.0) -> float:
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {}).get(key) or {}
    try:
        return float(q.get("value") if isinstance(q, dict) else q)
    except (TypeError, ValueError):
        return default


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )



def is_sealed_drive_pack(pm: dict, state: dict) -> bool:
    """True when morphology warrants detailed concentric GA (universal signal)."""
    parts = pm.get("parts") or []
    n_cyl = sum(1 for p in parts if isinstance(p, dict) and str(p.get("shape") or "").endswith("cylinder"))
    names = " ".join(str(p.get("name") or "") for p in parts if isinstance(p, dict)).lower()
    tags = " ".join(str(p.get("tag") or "") for p in parts if isinstance(p, dict)).upper()
    # Morphology signals only — never a product_class table.
    has_motor = n_cyl >= 2 or "motor" in names or "ipmsm" in names or "rotor" in names
    has_pe = "inverter" in names or "sic" in names or "film" in names or "dc-link" in names or "dc link" in names
    return bool(has_motor and (has_pe or n_cyl >= 3))


def load(twin: Path) -> tuple[dict, dict]:
    state = json.loads((twin / "state.json").read_text())
    pm = json.loads((twin / "parts-manifest.json").read_text())
    return state, pm


def part_map(pm: dict) -> dict[str, dict]:
    out = {}
    for p in pm.get("parts") or []:
        tag = str(p.get("tag") or p.get("equipment_tag") or "")
        if tag:
            out[tag] = p
    return out


def svg_header(w: int, h: int, title: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
        f"<title>{_esc(title)}</title>",
        '<rect width="100%" height="100%" fill="#fafafa"/>',
        '<style>',
        '  .t { font-family: Helvetica, Arial, sans-serif; fill: #111; }',
        '  .h { font-size: 18px; font-weight: 700; }',
        '  .s { font-size: 11px; }',
        '  .xs { font-size: 9px; fill: #333; }',
        '  .dim { font-size: 10px; fill: #0a3d91; }',
        '  .warn { fill: #a30; font-size: 10px; }',
        '  .box { fill: none; stroke: #1a1a1a; stroke-width: 1.4; }',
        '  .cyl { fill: #e8eef5; stroke: #1a1a1a; stroke-width: 1.3; }',
        '  .pe { fill: #dfe8d8; stroke: #1a1a1a; stroke-width: 1.2; }',
        '  .hv { fill: #ff8c00; stroke: #333; stroke-width: 1; }',
        '  .cool { fill: #c8e0f0; stroke: #1a4a6a; stroke-width: 1; }',
        '  .axis { stroke: #888; stroke-dasharray: 4 3; stroke-width: 0.8; }',
        '  .leader { stroke: #0a3d91; stroke-width: 0.9; }',
        '</style>',
    ]


def dim_h(lines: list[str], x1: float, x2: float, y: float, label: str) -> None:
    lines.append(f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" class="leader"/>')
    lines.append(f'<line x1="{x1}" y1="{y-4}" x2="{x1}" y2="{y+4}" class="leader"/>')
    lines.append(f'<line x1="{x2}" y1="{y-4}" x2="{x2}" y2="{y+4}" class="leader"/>')
    mid = (x1 + x2) / 2
    lines.append(f'<text x="{mid}" y="{y-6}" text-anchor="middle" class="t dim">{_esc(label)}</text>')


def dim_v(lines: list[str], y1: float, y2: float, x: float, label: str) -> None:
    lines.append(f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}" class="leader"/>')
    lines.append(f'<line x1="{x-4}" y1="{y1}" x2="{x+4}" y2="{y1}" class="leader"/>')
    lines.append(f'<line x1="{x-4}" y1="{y2}" x2="{x+4}" y2="{y2}" class="leader"/>')
    mid = (y1 + y2) / 2
    lines.append(
        f'<text x="{x+8}" y="{mid}" class="t dim" transform="rotate(-90 {x+8} {mid})">{_esc(label)}</text>'
    )


def draw_overview(state: dict, pm: dict, path: Path) -> None:
    W, H = 2400, 2000
    env_w = _q(state, "design_envelope_width_mm", 343)
    env_d = _q(state, "design_envelope_depth_mm", 259)
    env_h = _q(state, "design_envelope_height_mm", 267)
    stk = _q(state, "stack_length_mm", 130)
    parts = part_map(pm)
    motor = parts.get("X-116") or {}
    md = motor.get("dims_mm") or {}
    motor_dia = float(md.get("dia") or md.get("d") or 178)
    motor_len = float(md.get("len") or md.get("w") or 187)

    lines = svg_header(W, H, "FE Front MGU — Detailed General Arrangement")
    lines.append('<text x="40" y="36" class="t h">GENERAL ARRANGEMENT — sealed drive pack (detailed)</text>')
    lines.append(
        f'<text x="40" y="58" class="t s">Twin envelope {env_w:.0f}×{env_d:.0f}×{env_h:.0f} mm (W×D×H) · '
        f'stator L_stk={stk:.0f} mm · package motor Ø{motor_dia:.0f}×{motor_len:.0f} mm · '
        f'as-placed from parts-manifest ({pm.get("count")} parts)</text>'
    )
    lines.append(
        '<text x="40" y="76" class="t warn">NOT FOR CONSTRUCTION — morphology from Blender train; '
        'verify connectors against 00-hero / 08-ghost / 13-exploded</text>'
    )

    # Scale: fit envelope into panels
    # FRONT elevation (looking +Y): show L×H as cylinders
    ox, oy = 120, 280
    scale = 2.8  # px/mm
    # Front: motor cylinder side + PE shelf above
    ml = motor_len * scale
    mdia = motor_dia * scale
    # left end-bell
    lines.append(f'<ellipse cx="{ox+30}" cy="{oy+mdia/2}" rx="18" ry="{mdia/2}" class="cyl"/>')
    lines.append(f'<rect x="{ox+30}" y="{oy}" width="{ml}" height="{mdia}" class="cyl"/>')
    lines.append(f'<ellipse cx="{ox+30+ml}" cy="{oy+mdia/2}" rx="18" ry="{mdia/2}" class="cyl"/>')
    # windings copper hint
    lines.append(
        f'<rect x="{ox+30+ml*0.15}" y="{oy+mdia*0.15}" width="{ml*0.7}" height="{mdia*0.7}" '
        f'fill="none" stroke="#b87333" stroke-width="2"/>'
    )
    # PE shelf
    pe_y = oy - 70
    pe_w, pe_h = ml * 0.85, 55
    lines.append(f'<rect x="{ox+30+ml*0.08}" y="{pe_y}" width="{pe_w}" height="{pe_h}" class="pe"/>')
    lines.append(f'<text x="{ox+30+ml*0.08+8}" y="{pe_y+18}" class="t xs">PE shelf · SiC modules + film-cap bank</text>')
    # filmcap row
    for i in range(6):
        cx = ox + 30 + ml * 0.15 + i * (pe_w * 0.12)
        lines.append(f'<ellipse cx="{cx}" cy="{pe_y+38}" rx="10" ry="8" fill="#c5c5c5" stroke="#333"/>')
    # SiC modules
    for i in range(3):
        sx = ox + 30 + ml * 0.45 + i * 36
        lines.append(f'<rect x="{sx}" y="{pe_y+8}" width="28" height="22" fill="#2a2a2a" stroke="#111"/>')
    # HV boom
    lines.append(f'<rect x="{ox-70}" y="{pe_y+15}" width="90" height="14" class="hv"/>')
    lines.append(f'<text x="{ox-68}" y="{pe_y+10}" class="t xs">HV DC</text>')
    # Coolant QD pair
    lines.append(f'<circle cx="{ox+30+ml*0.35}" cy="{oy+mdia+28}" r="10" class="cool"/>')
    lines.append(f'<circle cx="{ox+30+ml*0.50}" cy="{oy+mdia+28}" r="10" fill="#e8a0a0" stroke="#6a1a1a"/>')
    lines.append(f'<text x="{ox+30+ml*0.35-20}" y="{oy+mdia+50}" class="t xs">coolant QD in/out</text>')
    # shaft
    lines.append(f'<line x1="{ox+30+ml}" y1="{oy+mdia/2}" x2="{ox+30+ml+80}" y2="{oy+mdia/2}" stroke="#333" stroke-width="6"/>')
    lines.append(f'<text x="{ox+30+ml+10}" y="{oy+mdia/2-10}" class="t xs">output shaft</text>')

    lines.append(f'<text x="{ox}" y="{oy-90}" class="t s">FRONT elevation (axial train · Blender-informed)</text>')
    dim_h(lines, ox + 30, ox + 30 + ml, oy + mdia + 70, f"motor L ≈ {motor_len:.0f} mm")
    dim_v(lines, oy, oy + mdia, ox + 30 + ml + 100, f"Ø ≈ {motor_dia:.0f} mm")
    dim_h(lines, ox + 30 + ml * 0.2, ox + 30 + ml * 0.2 + stk * scale, oy - 100, f"L_stk = {stk:.0f} mm")

    # TOP view
    tx, ty = 120, 980
    lines.append(f'<text x="{tx}" y="{ty-20}" class="t s">TOP (looking down · PE shelf over motor)</text>')
    # motor footprint rectangle with ellipse
    tw, td = motor_len * scale * 0.9, motor_dia * scale * 0.9
    lines.append(f'<rect x="{tx}" y="{ty}" width="{tw}" height="{td}" class="cyl"/>')
    lines.append(f'<ellipse cx="{tx+tw/2}" cy="{ty+td/2}" rx="{tw*0.35}" ry="{td*0.42}" class="cyl"/>')
    lines.append(f'<rect x="{tx+tw*0.1}" y="{ty-50}" width="{tw*0.8}" height="48" class="pe"/>')
    lines.append(f'<text x="{tx+tw*0.1+6}" y="{ty-30}" class="t xs">inverter / film-cap tray</text>')
    # envelope box
    ew, ed = env_w * scale * 0.55, env_d * scale * 0.55
    lines.append(
        f'<rect x="{tx-20}" y="{ty-70}" width="{ew}" height="{ed}" fill="none" stroke="#a30" '
        f'stroke-dasharray="6 4" stroke-width="1.5"/>'
    )
    lines.append(f'<text x="{tx-18}" y="{ty-78}" class="t warn">design_envelope {env_w:.0f}×{env_d:.0f} mm</text>')
    dim_h(lines, tx - 20, tx - 20 + ew, ty + ed + 20, f"envelope W = {env_w:.0f} mm")

    # SIDE / end view
    sx, sy = 1200, 280
    lines.append(f'<text x="{sx}" y="{sy-20}" class="t s">END elevation B–B (looking along shaft · gears as circles)</text>')
    R = motor_dia * scale * 0.55
    lines.append(f'<circle cx="{sx+R+40}" cy="{sy+R}" r="{R}" class="cyl"/>')
    lines.append(f'<circle cx="{sx+R+40}" cy="{sy+R}" r="{R*0.72}" fill="none" stroke="#b87333" stroke-width="3"/>')
    lines.append(f'<circle cx="{sx+R+40}" cy="{sy+R}" r="{R*0.35}" fill="#ddd" stroke="#333"/>')
    lines.append(f'<circle cx="{sx+R+40}" cy="{sy+R}" r="{R*0.12}" fill="#333"/>')
    # gear nest hint
    lines.append(f'<circle cx="{sx+R+40}" cy="{sy+R}" r="{R*0.22}" fill="none" stroke="#666" stroke-dasharray="2 2"/>')
    lines.append(f'<text x="{sx+R+40-30}" y="{sy+R*2+30}" class="t xs">stator / rotor / gear nest</text>')
    # PE above
    lines.append(f'<rect x="{sx+20}" y="{sy-55}" width="{R*2}" height="40" class="pe"/>')
    lines.append(f'<text x="{sx+28}" y="{sy-32}" class="t xs">PE</text>')
    dim_v(lines, sy, sy + 2 * R, sx + R * 2 + 90, f"Ø {motor_dia:.0f}")

    # Equipment schedule (key tags)
    lines.append('<text x="1200" y="900" class="t s">PRINCIPAL EQUIPMENT (Blender-linked tags)</text>')
    schedule = [
        ("X-116", "Traction IPMSM", f"L_stk={stk:.0f} · package Ø{motor_dia:.0f}×{motor_len:.0f}"),
        ("INV-1", "SiC traction inverter", "shelf PE · 3-module seed"),
        ("X-145", "DC-link film-cap bank", "concept morphology · no MPN claim"),
        ("X-147/148", "Coolant ports", "QD pair service face"),
        ("X-154/162/224", "Housing / end bells", "concentric cylinder family"),
        ("X-201/203/207", "Rotor / ring / sun", "planetary nest"),
    ]
    y = 925
    for tag, name, note in schedule:
        lines.append(f'<text x="1200" y="{y}" class="t xs"><tspan font-weight="700">{_esc(tag)}</tspan>  {_esc(name)} — {_esc(note)}</text>')
        y += 18

    # Title block
    lines.append(f'<rect x="40" y="{H-120}" width="{W-80}" height="90" fill="none" stroke="#111" stroke-width="1.5"/>')
    lines.append(f'<text x="55" y="{H-95}" class="t s">FRACTIONAL FORGE · ForgeOS · detailed GA (universal sealed pack)</text>')
    lines.append(f'<text x="55" y="{H-75}" class="t xs">Drawing GA-DET-001 · REV P1 · scale ~1:{(1/scale)*25.4/25.4:.1f} schematic · dimensions mm</text>')
    lines.append(f'<text x="55" y="{H-55}" class="t xs">Source: parts-manifest placement_fp + twin design_envelope · ship_ok=false</text>')
    lines.append(f'<text x="55" y="{H-35}" class="t warn">Dual torque bars unchanged: Path B 122.1 clears arch 104.1 · fails bind 125.2</text>')

    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n")


def draw_interfaces(state: dict, pm: dict, path: Path) -> None:
    W, H = 1800, 1400
    lines = svg_header(W, H, "FE Front — Interface ICD (detailed)")
    lines.append('<text x="40" y="36" class="t h">INTERFACE CONTROL — connectors, QD, HV (from Blender train)</text>')
    lines.append(
        '<text x="40" y="58" class="t s">Service face toward vehicle cooling corridor · chassis XYZ remains OPEN until partner ICD</text>'
    )
    # Service face schematic
    x0, y0 = 80, 120
    lines.append(f'<rect x="{x0}" y="{y0}" width="700" height="500" class="box" fill="#f0f0f0"/>')
    lines.append(f'<text x="{x0+10}" y="{y0+24}" class="t s">SERVICE FACE (toward front bay)</text>')
    # HV
    lines.append(f'<rect x="{x0+40}" y="{y0+80}" width="160" height="50" class="hv"/>')
    lines.append(f'<text x="{x0+50}" y="{y0+110}" class="t xs">HV DC connector + HVIL</text>')
    lines.append(f'<line x1="{x0+200}" y1="{y0+105}" x2="{x0+320}" y2="{y0+105}" class="leader"/>')
    lines.append(f'<text x="{x0+325}" y="{y0+108}" class="t xs">X-HV · orange safety collar · braid boot</text>')
    # QD
    lines.append(f'<circle cx="{x0+120}" cy="{y0+220}" r="22" class="cool"/>')
    lines.append(f'<circle cx="{x0+200}" cy="{y0+220}" r="22" fill="#e8a0a0" stroke="#6a1a1a"/>')
    lines.append(f'<text x="{x0+90}" y="{y0+270}" class="t xs">coolant IN (blue) / OUT (red) · X-147 / X-148</text>')
    # LV / CAN
    lines.append(f'<rect x="{x0+40}" y="{y0+320}" width="100" height="36" fill="#333" stroke="#111"/>')
    lines.append(f'<text x="{x0+50}" y="{y0+342}" class="t xs" fill="#eee">LV / CAN</text>')
    lines.append(f'<text x="{x0+160}" y="{y0+342}" class="t xs">vehicle CAN-FD · interlock</text>')
    # Mounting feet
    for i, fx in enumerate((80, 280, 480, 620)):
        lines.append(f'<rect x="{x0+fx}" y="{y0+460}" width="40" height="18" fill="#555"/>')
    lines.append(f'<text x="{x0+80}" y="{y0+495}" class="t xs">mounting feet (studio stand in Blender ≠ chassis ICD — partner XYZ OPEN)</text>')

    # Table
    lines.append('<text x="900" y="140" class="t s">INTERFACE REGISTER</text>')
    rows = [
        ("IF-HV", "HV DC + HVIL", "Inverter shelf", "OPEN chassis XYZ"),
        ("IF-CL-IN", "Coolant supply QD", "Motor jacket", "60 °C design inlet"),
        ("IF-CL-OUT", "Coolant return QD", "Motor jacket", "paired with IN"),
        ("IF-CAN", "Vehicle CAN-FD", "Control PCB", "SN65HVD255 path"),
        ("IF-LV", "12/24 V LV", "Buck rails", "3× LV buck"),
        ("IF-SHAFT", "Halfshaft outputs", "Gear nest", "L/R flanges"),
    ]
    y = 170
    lines.append(f'<text x="900" y="{y}" class="t xs" font-weight="700">Tag · Interface · On unit · Hold</text>')
    y += 22
    for row in rows:
        lines.append(f'<text x="900" y="{y}" class="t xs">{" · ".join(row)}</text>')
        y += 18

    lines.append(
        f'<text x="40" y="{H-40}" class="t warn">ICD XYZ not invented — partner ask remains open (Bar B)</text>'
    )
    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n")


def draw_section(state: dict, pm: dict, path: Path) -> None:
    W, H = 1800, 1200
    stk = _q(state, "stack_length_mm", 130)
    lines = svg_header(W, H, "FE Front — Axial section story")
    lines.append('<text x="40" y="36" class="t h">SECTION A–A — axial stack (Blender-informed story)</text>')
    lines.append(
        f'<text x="40" y="58" class="t s">Active stack L_stk={stk:.0f} mm (DEC-009) · concentric planetary nest · PE above</text>'
    )
    x0, y0 = 100, 200
    # layers as concentric bands
    bands = [
        (280, "#c8d0d8", "housing / end-bell"),
        (230, "#e8eef5", "stator laminations"),
        (180, "#d4a574", "copper windings"),
        (130, "#bbb", "rotor barrel"),
        (80, "#999", "gear nest / sun"),
        (30, "#444", "shaft"),
    ]
    cx, cy = x0 + 320, y0 + 280
    for r, fill, lab in bands:
        lines.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="#222" stroke-width="1.2"/>')
    # labels with leaders
    ly = y0 + 40
    for r, fill, lab in bands:
        lines.append(f'<line x1="{cx+r*0.7}" y1="{cy-r*0.7}" x2="{cx+360}" y2="{ly}" class="leader"/>')
        lines.append(f'<text x="{cx+365}" y="{ly+4}" class="t xs">{_esc(lab)}</text>')
        ly += 28
    # PE callout
    lines.append(f'<rect x="{cx-200}" y="{cy-360}" width="400" height="50" class="pe"/>')
    lines.append(f'<text x="{cx-190}" y="{cy-330}" class="t xs">PE: SiC modules (×3) + film-cap bank + laminated bus</text>')
    lines.append(
        f'<text x="40" y="{H-50}" class="t xs">Architecture blockers remain OPEN (planetary FoS / EM torque bars) — ship_ok=false</text>'
    )
    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n")


def raster(svg: Path, png: Path) -> None:
    try:
        import cairosvg  # type: ignore

        cairosvg.svg2png(url=str(svg), write_to=str(png), output_width=3200)
        return
    except Exception:
        pass
    for cmd in (
        ["rsvg-convert", "-o", str(png), str(svg)],
        ["convert", str(svg), str(png)],
    ):
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=60)
            if r.returncode == 0 and png.exists():
                return
        except Exception:
            continue


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    force = "--force" in args
    args = [a for a in args if a != "--force"]
    twin = Path(args[0] if args else ".")
    if not twin.is_absolute():
        twin = (REPO / twin).resolve()
    if not (twin / "state.json").exists():
        print(f"[draw_ga_detailed] no state.json under {twin}", file=sys.stderr)
        return 2
    state, pm = load(twin)
    if not force and not is_sealed_drive_pack(pm, state):
        print("[draw_ga_detailed] morphology gate: not a sealed drive pack — skip (use --force to override)")
        return 0
    d = twin / "drawings"
    d.mkdir(exist_ok=True)

    # Primary GA (replace thin overview)
    ga_svg = d / "general-arrangement.svg"
    ga_png = d / "general-arrangement.png"
    draw_overview(state, pm, ga_svg)
    raster(ga_svg, ga_png)

    if_svg = d / "ga-detail-interfaces.svg"
    if_png = d / "ga-detail-interfaces.png"
    draw_interfaces(state, pm, if_svg)
    raster(if_svg, if_png)

    sec_svg = d / "ga-detail-section.svg"
    sec_png = d / "ga-detail-section.png"
    draw_section(state, pm, sec_svg)
    raster(sec_svg, sec_png)

    (d / "GA-DETAIL-INDEX.md").write_text(
        f"""# Detailed GA set (v10)

| Sheet | File | Purpose |
|---|---|---|
| Overview 3-view | `general-arrangement.png` | Front / top / end — Blender-informed cylinders + PE shelf |
| Interfaces | `ga-detail-interfaces.png` | HV, coolant QD, LV/CAN, mounts |
| Section A–A | `ga-detail-section.png` | Concentric stack story + PE callout |

Twin envelope from quantities; L_stk from DEC-009. ship_ok=false.
Blender heroes remain the high-fidelity visual (00-hero, 08-ghost, 13-exploded).
"""
    )
    print(f"[detailed-ga] wrote {ga_svg.name}, {if_svg.name}, {sec_svg.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
