#!/usr/bin/env python3
"""Universal pack-parity drawing sheets (Anvil Sprint 3).

INTENT: every product-scale twin gets the same *capability-gated* sheets that
cross-pack review found missing on instruments (and sparse on motors):

  drawings/ga-bom-callouts.svg|.png     — GA with principal BoM tag leaders
  drawings/ga-optical-path.svg|.png    — optical/OD path dimension (when sensing)
  drawings/service-access.svg|.png     — service / access zones (sealed products)
  drawings/PACK-PARITY-INDEX.md        — index of what was emitted and why

Morphology signals only — never product_class nicknames. Motors skip optical
path; plants skip sealed-instrument service if no shell.

Also normalises drawing coordinates so a floating world-Z (e.g. z_min=300 mm)
does not print as "floating product" — drawing frame is origin-shifted to the
parts-manifest site bbox min (does not rewrite the twin CAD source).

Called from generate_drawing_set.py and safe to run standalone:
  python3 scripts/blender-universal/draw_pack_parity_sheets.py <twin_dir>
"""
from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

REPO = Path(__file__).resolve().parents[2]


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _q(state: dict, key: str, default: Optional[float] = None) -> Optional[float]:
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {}).get(key)
    if isinstance(q, dict):
        try:
            return float(q.get("value"))
        except (TypeError, ValueError):
            return default
    try:
        return float(q) if q is not None else default
    except (TypeError, ValueError):
        return default


def _load(twin: Path) -> tuple[dict, dict]:
    state = json.loads((twin / "state.json").read_text(encoding="utf-8"))
    pm_path = twin / "parts-manifest.json"
    pm = json.loads(pm_path.read_text(encoding="utf-8")) if pm_path.is_file() else {}
    return state, pm


def _site(pm: dict) -> dict[str, float]:
    s = pm.get("site") or pm.get("bbox_mm") or {}
    if not isinstance(s, dict):
        s = {}
    # defaults
    out = {
        "x_min": float(s.get("x_min_mm") or s.get("x_min") or 0),
        "x_max": float(s.get("x_max_mm") or s.get("x_max") or 200),
        "y_min": float(s.get("y_min_mm") or s.get("y_min") or 0),
        "y_max": float(s.get("y_max_mm") or s.get("y_max") or 200),
        "z_min": float(s.get("z_min_mm") or s.get("z_min") or 0),
        "z_max": float(s.get("z_max_mm") or s.get("z_max") or 200),
    }
    out["W"] = max(1.0, out["x_max"] - out["x_min"])
    out["D"] = max(1.0, out["y_max"] - out["y_min"])
    out["H"] = max(1.0, out["z_max"] - out["z_min"])
    return out


def _parts(pm: dict) -> list[dict]:
    return [p for p in (pm.get("parts") or []) if isinstance(p, dict) and p.get("pos_mm")]


def _principal_parts(pm: dict, state: dict, n: int = 14) -> list[dict]:
    """Prefer BoM / ledger principals; fall back to largest non-HMI parts."""
    parts = _parts(pm)
    bom_tags = set()
    for row in state.get("requirementsBom") or []:
        if isinstance(row, dict) and row.get("tag"):
            bom_tags.add(str(row["tag"]))
    scored = []
    for p in parts:
        tag = str(p.get("tag") or p.get("equipment_tag") or "")
        name = str(p.get("name") or "")
        # skip pure UI chrome for callouts
        if re.search(r"\bhmi\b|button|indicator led|display", name, re.I) and "port" not in name.lower():
            continue
        dims = p.get("dims_mm") or {}
        vol = 1.0
        try:
            if dims.get("dia") or dims.get("d") and dims.get("len"):
                dia = float(dims.get("dia") or dims.get("d") or 10)
                ln = float(dims.get("len") or dims.get("w") or 10)
                vol = math.pi * (dia / 2) ** 2 * ln
            else:
                vol = (
                    float(dims.get("w") or 10)
                    * float(dims.get("d") or 10)
                    * float(dims.get("h") or 10)
                )
        except (TypeError, ValueError):
            vol = 1.0
        pri = 2 if tag in bom_tags else 0
        if re.search(
            r"vessel|stirr|pump|peltier|tec|pcb|board|filter|vent|optical|od\b|"
            r"sensor|heater|enclosure|shell|casing|mcu|adapter",
            name,
            re.I,
        ):
            pri += 3
        scored.append((pri, vol, p))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [t[2] for t in scored[:n]]


def has_optical_sensing(state: dict, pm: dict) -> bool:
    blob = " ".join(
        [
            str(state.get("productClass") or ""),
            str(((state.get("orchestratorContract") or {}).get("brief_summary") or "")),
            " ".join(str(p.get("name") or "") for p in (pm.get("parts") or []) if isinstance(p, dict)),
        ]
    ).lower()
    return bool(
        re.search(
            r"optical\s*density|od600|od\s*sensor|turbidimetr|photodiode|"
            r"growth\s*sensor|absorbance|spectrophoto",
            blob,
        )
    )


def is_sealed_product(state: dict, pm: dict) -> bool:
    if state.get("isInstrumentDevice") is True:
        return True
    names = " ".join(str(p.get("name") or "") for p in (pm.get("parts") or []) if isinstance(p, dict)).lower()
    return bool(re.search(r"enclosure|shell|housing|ghost|sealed|benchtop|instrument", names))


def svg_header(w: int, h: int, title: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
        f"<title>{_esc(title)}</title>",
        '<rect width="100%" height="100%" fill="#fafafa"/>',
        "<style>",
        "  .t { font-family: Helvetica, Arial, sans-serif; fill: #111; }",
        "  .h { font-size: 16px; font-weight: 700; }",
        "  .s { font-size: 11px; }",
        "  .xs { font-size: 9px; fill: #333; }",
        "  .dim { font-size: 10px; fill: #0a3d91; }",
        "  .warn { fill: #a30; font-size: 10px; }",
        "  .box { fill: #e8eef5; stroke: #1a1a1a; stroke-width: 1.1; }",
        "  .env { fill: none; stroke: #a30; stroke-width: 1.4; stroke-dasharray: 6 4; }",
        "  .leader { stroke: #0a3d91; stroke-width: 0.9; }",
        "  .opt { fill: none; stroke: #c45c00; stroke-width: 2.2; }",
        "  .svc { fill: #fff3cd; stroke: #856404; stroke-width: 1.2; stroke-dasharray: 4 3; }",
        "</style>",
    ]


def raster(svg: Path, png: Path) -> bool:
    try:
        import cairosvg  # type: ignore

        cairosvg.svg2png(url=str(svg), write_to=str(png), output_width=2400)
        return png.is_file()
    except Exception:
        pass
    for cmd in (
        ["rsvg-convert", "-o", str(png), str(svg)],
        ["convert", str(svg), str(png)],
    ):
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=60)
            if r.returncode == 0 and png.is_file():
                return True
        except Exception:
            continue
    return False


def _pos_xyz(pos: Any) -> tuple[float, float, float]:
    """Accept pos_mm as {x,y,z} or [x,y,z]."""
    if isinstance(pos, dict):
        return (
            float(pos.get("x") or 0),
            float(pos.get("y") or 0),
            float(pos.get("z") or 0),
        )
    if isinstance(pos, (list, tuple)) and len(pos) >= 3:
        return float(pos[0] or 0), float(pos[1] or 0), float(pos[2] or 0)
    if isinstance(pos, (list, tuple)) and len(pos) == 2:
        return float(pos[0] or 0), float(pos[1] or 0), 0.0
    return 0.0, 0.0, 0.0


def _world_to_page(
    pos: Any,
    site: dict,
    *,
    ox: float,
    oy: float,
    scale: float,
    view: str = "top",
) -> tuple[float, float, float, float]:
    """Map part world pos to page coords with origin shifted to site min (no float-Z)."""
    wx, wy, wz = _pos_xyz(pos)
    x = wx - site["x_min"]
    y = wy - site["y_min"]
    z = wz - site["z_min"]
    if view == "top":
        # X right, Y down-page from front
        return ox + x * scale, oy + (site["D"] - y) * scale, x, y
    if view == "front":
        return ox + x * scale, oy + (site["H"] - z) * scale, x, z
    # side
    return ox + y * scale, oy + (site["H"] - z) * scale, y, z


def draw_bom_callouts(state: dict, pm: dict, path: Path) -> dict[str, Any]:
    site = _site(pm)
    principals = _principal_parts(pm, state, n=12)
    W, H = 2000, 1600
    margin = 80
    usable_w, usable_h = W - 2 * margin - 420, H - 2 * margin - 80
    scale = min(usable_w / site["W"], usable_h / site["D"]) * 0.92
    ox, oy = margin + 40, margin + 100

    lines = svg_header(W, H, "GA — BoM callouts (universal)")
    lines.append('<text x="40" y="36" class="t h">GENERAL ARRANGEMENT — principal BoM callouts</text>')
    lines.append(
        f'<text x="40" y="56" class="t s">Drawing frame origin-shifted to site min '
        f"(x={site['x_min']:.0f}, y={site['y_min']:.0f}, z={site['z_min']:.0f} mm) · "
        f"envelope {site['W']:.0f}×{site['D']:.0f}×{site['H']:.0f} mm · "
        f"{len(principals)} principal tags</text>"
    )
    lines.append(
        '<text x="40" y="74" class="t warn">NOT FOR CONSTRUCTION — concept placement from '
        "parts-manifest; verify against Blender heroes before fab</text>"
    )

    # envelope
    ew, ed = site["W"] * scale, site["D"] * scale
    lines.append(f'<rect x="{ox}" y="{oy}" width="{ew}" height="{ed}" class="env"/>')
    lines.append(f'<text x="{ox}" y="{oy-8}" class="t xs">TOP view · envelope</text>')

    callouts: list[str] = []
    for i, p in enumerate(principals):
        pos = p.get("pos_mm") or {}
        dims = p.get("dims_mm") or {}
        tag = str(p.get("tag") or p.get("equipment_tag") or f"P{i}")
        name = str(p.get("name") or tag)
        px, py, _, _ = _world_to_page(pos, site, ox=ox, oy=oy, scale=scale, view="top")
        # part footprint
        try:
            pw = float(dims.get("w") or dims.get("dia") or dims.get("d") or 12) * scale
            pd = float(dims.get("d") or dims.get("dia") or dims.get("w") or 12) * scale
        except (TypeError, ValueError):
            pw, pd = 14.0, 14.0
        pw, pd = max(8.0, pw), max(8.0, pd)
        lines.append(
            f'<rect x="{px - pw/2}" y="{py - pd/2}" width="{pw}" height="{pd}" class="box"/>'
        )
        # leader to right rail
        lx = ox + ew + 30
        ly = oy + 20 + i * 28
        lines.append(f'<line x1="{px}" y1="{py}" x2="{lx}" y2="{ly}" class="leader"/>')
        lines.append(f'<circle cx="{px}" cy="{py}" r="2.5" fill="#0a3d91"/>')
        label = f"{tag}  {name}"[:52]
        lines.append(f'<text x="{lx+6}" y="{ly+4}" class="t xs">{_esc(label)}</text>')
        callouts.append(f"{tag}|{name}")

    # dim envelope
    lines.append(
        f'<text x="{ox}" y="{oy + ed + 24}" class="t dim">'
        f"W = {site['W']:.0f} mm · D = {site['D']:.0f} mm · H = {site['H']:.0f} mm "
        f"(origin-normalised drawing frame)</text>"
    )
    lines.append(
        f'<text x="40" y="{H-28}" class="t xs">Generated by draw_pack_parity_sheets · '
        "universal BoM callouts from parts-manifest principals</text>"
    )
    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"n_callouts": len(callouts), "callouts": callouts, "origin_shift_z_mm": site["z_min"]}


def draw_optical_path(state: dict, pm: dict, path: Path) -> dict[str, Any]:
    site = _site(pm)
    # path length from quantities if present
    path_mm = (
        _q(state, "od_path_length_mm")
        or _q(state, "optical_path_length_mm")
        or _q(state, "od600_path_length_mm")
        or 13.0
    )
    # find vessel + optical parts
    vessel = None
    led = None
    det = None
    for p in _parts(pm):
        name = str(p.get("name") or "").lower()
        if vessel is None and re.search(r"vessel|culture|vial", name):
            vessel = p
        if led is None and re.search(r"od|optical|led|emitter|source", name):
            led = p
        if det is None and re.search(r"photo|detector|diode|receiver", name):
            det = p

    W, H = 1600, 1100
    lines = svg_header(W, H, "GA — optical / OD path")
    lines.append('<text x="40" y="36" class="t h">OPTICAL / OD PATH — dimensioned concept</text>')
    lines.append(
        f'<text x="40" y="56" class="t s">Transmission path length ≈ {path_mm:.1f} mm '
        f"(from twin quantity or concept default) · sealed instrument sensing</text>"
    )
    lines.append(
        '<text x="40" y="74" class="t warn">CONCEPT — freeze fixture + cal SOP before fab; '
        "path must appear on GA callouts for CM handoff</text>"
    )

    # schematic: LED — vessel — photodiode
    cx, cy = 280, 420
    # LED
    lines.append(f'<rect x="{cx}" y="{cy-30}" width="70" height="60" class="box"/>')
    lines.append(f'<text x="{cx+8}" y="{cy+5}" class="t xs">LED / source</text>')
    # path
    x1, x2 = cx + 70, cx + 70 + path_mm * 8
    lines.append(f'<line x1="{x1}" y1="{cy}" x2="{x2}" y2="{cy}" class="opt"/>')
    lines.append(
        f'<text x="{(x1+x2)/2}" y="{cy-12}" text-anchor="middle" class="t dim">'
        f"path ≈ {path_mm:.1f} mm</text>"
    )
    # vessel
    vx = (x1 + x2) / 2 - 40
    lines.append(
        f'<ellipse cx="{(x1+x2)/2}" cy="{cy}" rx="45" ry="70" fill="#e8f4fc" stroke="#1a4a6a" stroke-width="1.5"/>'
    )
    lines.append(
        f'<text x="{(x1+x2)/2}" y="{cy+100}" text-anchor="middle" class="t xs">culture vessel</text>'
    )
    # detector
    lines.append(f'<rect x="{x2}" y="{cy-30}" width="90" height="60" class="box"/>')
    lines.append(f'<text x="{x2+6}" y="{cy+5}" class="t xs">photodiode / TIA</text>')

    # notes
    y = 620
    notes = [
        "Path is the clear optical distance through culture (not cable length).",
        "T-comp / cal SOP still open unless a freeze is recorded on Holds.",
        "BoM must not pin a bare indicator LED as the full OD600 system.",
    ]
    if vessel:
        notes.append(f"Vessel placement tag: {vessel.get('tag')} · {vessel.get('name')}")
    for note in notes:
        lines.append(f'<text x="40" y="{y}" class="t s">• {_esc(note)}</text>')
        y += 22

    lines.append(
        f'<text x="40" y="{H-28}" class="t xs">Generated by draw_pack_parity_sheets · '
        "emitted only when optical/OD sensing is present</text>"
    )
    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"path_mm": path_mm, "vessel_tag": (vessel or {}).get("tag")}


def draw_service_access(state: dict, pm: dict, path: Path) -> dict[str, Any]:
    site = _site(pm)
    W, H = 1800, 1300
    lines = svg_header(W, H, "Service access — sealed product")
    lines.append('<text x="40" y="36" class="t h">SERVICE / ACCESS — operator zones (concept)</text>')
    lines.append(
        f'<text x="40" y="56" class="t s">Sealed instrument envelope '
        f"{site['W']:.0f}×{site['D']:.0f}×{site['H']:.0f} mm · origin-normalised frame</text>"
    )
    lines.append(
        '<text x="40" y="74" class="t warn">NOT A FAT SHEET — shows intended access, not validated sterile procedure</text>'
    )

    # product box
    ox, oy, bw, bh = 120, 160, 900, 700
    lines.append(f'<rect x="{ox}" y="{oy}" width="{bw}" height="{bh}" class="box"/>')
    lines.append(f'<text x="{ox+12}" y="{oy+24}" class="t s">Product exterior (front)</text>')

    zones = [
        (ox + 40, oy + 50, bw * 0.55, 90, "A — Lid / vessel access", "Remove culture vessel; media change"),
        (ox + 40, oy + 180, bw * 0.4, 80, "B — Tubing / vent", "Sterile vent + perfusion lines"),
        (ox + bw * 0.5, oy + 180, bw * 0.42, 80, "C — Front ports", "Power / USB / sensors"),
        (ox + 40, oy + 320, bw * 0.9, 100, "D — Service panel", "PCB access only with power isolated"),
        (ox + 40, oy + 460, bw * 0.9, 90, "E — Thermal path", "Heatsink / TEC airflow — keep clear"),
    ]
    for x, y, w, h, title, note in zones:
        lines.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="svc"/>')
        lines.append(f'<text x="{x+10}" y="{y+22}" class="t s">{_esc(title)}</text>')
        lines.append(f'<text x="{x+10}" y="{y+44}" class="t xs">{_esc(note)}</text>')

    # legend
    lx = ox + bw + 40
    lines.append(f'<text x="{lx}" y="{oy+20}" class="t s">Access rules (concept)</text>')
    rules = [
        "1. Power off before opening D.",
        "2. Aseptic technique for A/B — not validated here.",
        "3. Do not block E airflow.",
        "4. Replace consumable tubing on B.",
        "5. Hold: full SOP + FAT still open.",
    ]
    yy = oy + 50
    for r in rules:
        lines.append(f'<text x="{lx}" y="{yy}" class="t xs">{_esc(r)}</text>')
        yy += 22

    # list service-relevant parts if present
    yy += 20
    lines.append(f'<text x="{lx}" y="{yy}" class="t s">Tagged access parts</text>')
    yy += 18
    for p in _principal_parts(pm, state, n=8):
        name = str(p.get("name") or "")
        if re.search(
            r"vessel|tubing|vent|port|lid|shell|enclosure|filter|usb|power",
            name,
            re.I,
        ):
            lines.append(
                f'<text x="{lx}" y="{yy}" class="t xs">· '
                f"{_esc(str(p.get('tag')))} {_esc(name)[:36]}</text>"
            )
            yy += 16

    lines.append(
        f'<text x="40" y="{H-28}" class="t xs">Generated by draw_pack_parity_sheets · '
        "sealed-product service zones (capability-gated)</text>"
    )
    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"zones": ["A", "B", "C", "D", "E"], "envelope_mm": [site["W"], site["D"], site["H"]]}


def write_placement_normalisation_note(twin: Path, site: dict) -> Path:
    """Document origin shift; optional JSON for consumers (drawing frame only)."""
    d = twin / "drawings"
    d.mkdir(exist_ok=True)
    note = {
        "schema": "anvil.drawing_placement_frame/1",
        "site_min_mm": {
            "x": site["x_min"],
            "y": site["y_min"],
            "z": site["z_min"],
        },
        "envelope_mm": {"W": site["W"], "D": site["D"], "H": site["H"]},
        "note": (
            "Pack parity drawings shift the print frame so site min maps to drawing "
            "origin. Twin CAD / Blender world coordinates are unchanged. A large "
            "z_min (e.g. 300 mm) is a placement convention, not a product floating "
            "above the bench in the GA sheets."
        ),
    }
    path = d / "drawing-placement-frame.json"
    path.write_text(json.dumps(note, indent=2) + "\n", encoding="utf-8")
    return path


def run(twin: Path) -> dict[str, Any]:
    state, pm = _load(twin)
    d = twin / "drawings"
    d.mkdir(exist_ok=True)
    site = _site(pm)
    report: dict[str, Any] = {
        "twin": str(twin),
        "emitted": [],
        "skipped": [],
        "origin_shift_z_mm": site["z_min"],
    }

    write_placement_normalisation_note(twin, site)
    report["emitted"].append("drawing-placement-frame.json")

    # Always emit BoM callouts when we have placed parts
    if len(_parts(pm)) >= 3:
        svg = d / "ga-bom-callouts.svg"
        png = d / "ga-bom-callouts.png"
        meta = draw_bom_callouts(state, pm, svg)
        raster(svg, png)
        report["emitted"].append("ga-bom-callouts.svg")
        report["bom_callouts"] = meta
    else:
        report["skipped"].append("ga-bom-callouts (need ≥3 placed parts)")

    if has_optical_sensing(state, pm):
        svg = d / "ga-optical-path.svg"
        png = d / "ga-optical-path.png"
        meta = draw_optical_path(state, pm, svg)
        raster(svg, png)
        report["emitted"].append("ga-optical-path.svg")
        report["optical"] = meta
    else:
        report["skipped"].append("ga-optical-path (no optical/OD sensing signal)")

    if is_sealed_product(state, pm):
        svg = d / "service-access.svg"
        png = d / "service-access.png"
        meta = draw_service_access(state, pm, svg)
        raster(svg, png)
        report["emitted"].append("service-access.svg")
        report["service"] = meta
    else:
        report["skipped"].append("service-access (not a sealed product / instrument)")

    # Index
    idx = d / "PACK-PARITY-INDEX.md"
    lines = [
        "# Pack parity drawing sheets",
        "",
        "Universal Anvil sheets (capability-gated). Same module for every product class.",
        "",
        "| Sheet | File | When emitted |",
        "|---|---|---|",
        "| BoM callouts | `ga-bom-callouts.png` | ≥3 placed parts |",
        "| Optical path | `ga-optical-path.png` | OD / optical sensing present |",
        "| Service access | `service-access.png` | Sealed instrument / product shell |",
        "| Placement frame | `drawing-placement-frame.json` | Always |",
        "",
        f"**Origin shift (drawing only):** z_min = {site['z_min']:.1f} mm "
        f"(site bbox — product sits on z=0 in these sheets).",
        "",
        "## This run",
        "",
        f"- Emitted: {', '.join(report['emitted']) or '—'}",
        f"- Skipped: {', '.join(report['skipped']) or '—'}",
        "",
        "NOT FOR CONSTRUCTION. Blender heroes remain visual ground truth.",
        "",
    ]
    idx.write_text("\n".join(lines), encoding="utf-8")
    report["emitted"].append("PACK-PARITY-INDEX.md")

    # Manifest sidecar for pack chrome / tests
    (d / "pack-parity-manifest.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    report["emitted"].append("pack-parity-manifest.json")
    return report


def _selftest() -> None:
    """Capability gates + list pos_mm handling (no twin required)."""
    assert has_optical_sensing(
        {"productClass": "x"},
        {"parts": [{"name": "Optical Density Sensor", "pos_mm": [0, 0, 0]}]},
    )
    assert not has_optical_sensing(
        {"productClass": "motor"},
        {"parts": [{"name": "Stator", "pos_mm": [0, 0, 0]}]},
    )
    assert is_sealed_product({"isInstrumentDevice": True}, {})
    assert _pos_xyz([1, 2, 3]) == (1.0, 2.0, 3.0)
    assert _pos_xyz({"x": 1, "y": 2, "z": 3}) == (1.0, 2.0, 3.0)
    print("draw_pack_parity_sheets selftest OK")


def main() -> int:
    if "--selftest" in sys.argv:
        _selftest()
        return 0
    args = [a for a in sys.argv[1:] if a and a != "--selftest"]
    twin = Path(args[0] if args else ".")
    if not twin.is_absolute():
        twin = (REPO / twin).resolve()
    if not (twin / "state.json").is_file():
        print(f"[pack-parity] no state.json under {twin}", file=sys.stderr)
        return 2
    r = run(twin)
    print(json.dumps({"ok": True, **{k: r[k] for k in ("emitted", "skipped", "origin_shift_z_mm")}}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
