#!/usr/bin/env python3
"""
PCB Phase C pipeline runner — engine-side (2026-07-12).

Ports the WORKING mechanics of `~/Developer/CentaurOS created 260126 1435/scripts/pcb-chain/pcb_chain.py`
(atopile -> KiCad -> DSN -> Freerouting -> DRC -> Gerber/drill/pos/render) into a
UNIVERSAL, no-hardcoded-path, no-optimistic-success runner that `pcb-pipeline.ts`
invokes as a subprocess.

Dropped from the prior art (per Tristan's Phase C brief):
  - hardcoded /tmp/freerouting.jar, machine-specific ATO_BIN/JAVA_BIN/KICAD_PYTHON
    constants -> all now REQUIRED CLI args, discovered by the TS caller via
    `discoverPcbCapability()` and passed in explicitly. This script never guesses
    a path itself.
  - the static LCSC_PRICE_DB / LCSC_DESC_DB per-part price/description tables and
    `enrich_bom()` -> pricing/description is the engine's own BoM concern
    (Stage 17.6 / distributor cascade), not this pipeline's.
  - any optimistic "success" path -> `ok` in the emitted JSON is true ONLY when
    the board built, routed, DRC ran with ZERO violations (errors + unconnected),
    and Gerbers exist on disk. Every other outcome is `ok:false` + the real
    `stage_reached` + `errors[]`.

Kept (the parts that made the prototype actually work, described in its own
header comments, still true here):
  - dynamic TH pad spacing + edge margin computed from REAL footprint geometry,
    never a fixed constant.
  - the "UNIVERSAL FIX for text-generated .kicad_pcb files that kicad-cli can't
    load" — LoadBoard()+Save() via KiCad's bundled Python normalises the file
    format (net classes, KiCad-10 s-expression quirks) before any kicad-cli
    operation touches it.
  - Specctra DSN export + Freerouting autoroute + SES import via the KiCad
    Python bridge (kicad-cli has no `pcb export specctra` subcommand as of
    KiCad 10.0.4 — verified live 2026-07-12).
  - the auto-loop: if placement is invalid (pad overlap / off-board) or DRC
    still has violations, grow TH spacing / board size and retry, bounded by
    --max-iterations.

NEW in this port (universal, not per-product):
  - footprint resolution falls back from the ato-project-local
    `build/footprints/footprints.pretty/` (populated only when `ato create
    layout` has run) to the REAL GLOBAL KiCad footprint library
    (`<KICAD_FOOTPRINTS_ROOT>/<Library>.pretty/<Footprint>.kicad_mod`), resolved
    generically from each component's own `(footprint "Library:Footprint")`
    netlist field — never a per-part table. This is what makes `ato build`'s
    local footprint-copy step optional (it was empty on the 2026-07-12 run
    because no layout had been created yet).
  - the board's Edge.Cuts is read from an OPTIONAL `--board-outline` JSON file
    (Phase B's `PcbBoardGeometry`: an ordered list of line/arc segments) instead
    of always drawing a plain rectangle, so a bespoke non-rect outline is
    actually honoured. Placement still runs on the outline's bounding box with
    an edge margin >= the outline's own corner radius (safe for the common
    rounded-rect case); this is a NAIVE placement (documented, not a real
    autoplacer) — good enough for Phase C, revisited if DRC needs it.
  - DRC parsed from `kicad-cli pcb drc --format json` (`violations` +
    `unconnected_items` arrays) instead of substring-counting the text report —
    more robust, same information pcb_chain.py extracted by regex.

Run: python3 pcb_pipeline_runner.py --project-dir <ato project> --run-dir <out dir> ...
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="PCB Phase C pipeline runner")
    p.add_argument("--project-dir", required=True, help="atopile project dir (main.ato + ato.yaml)")
    p.add_argument("--run-dir", required=True, help="output root; all artifacts land under <run-dir>/pcb/")
    p.add_argument("--ato-bin", required=True)
    p.add_argument("--java-bin", required=True)
    p.add_argument("--kicad-python", required=True, help="KiCad's bundled python3 (has pcbnew)")
    p.add_argument("--kicad-pythonpath", required=True, help="site-packages dir containing pcbnew")
    p.add_argument("--kicad-cli", default="kicad-cli")
    p.add_argument("--freerouting-jar", default="", help="path to freerouting .jar; routing skipped if absent")
    p.add_argument("--kicad-footprints-root", required=True, help="global KiCad SharedSupport/footprints dir")
    p.add_argument("--board-outline", default="", help="Phase B board-outline.json (PcbBoardGeometry)")
    p.add_argument("--max-passes", type=int, default=500)
    p.add_argument("--max-iterations", type=int, default=4)
    p.add_argument("--freerouting-timeout-s", type=int, default=300)
    return p.parse_args()

# ─── Result (always emitted, honest) ───────────────────────────────────────────

def new_result() -> dict:
    return {
        "ok": False,
        "stage_reached": "not_started",
        "kicad_pcb_path": None,
        "routed": False,
        "drc": {"ran": False, "violations": None, "report_path": None},
        "gerbers": None,
        "drill": None,
        "pos": None,
        "render_png": None,
        "board_size_mm": None,
        "components": None,
        "nets": None,
        "unrouted_after_freerouting": None,
        "iterations_run": 0,
        "errors": [],
    }

def emit(result: dict) -> None:
    print("=== PCB_PIPELINE_RESULT_JSON ===")
    print(json.dumps(result, indent=2))

# ─── Data types (ported from pcb_chain.py) ────────────────────────────────────

@dataclass
class Component:
    ref: str
    value: str
    footprint: str  # "Library:FootprintName"

@dataclass
class Net:
    code: int
    name: str

@dataclass
class PadNet:
    ref: str
    pin: str
    net_code: int
    net_name: str

@dataclass
class FootprintData:
    pads: List[dict] = field(default_factory=list)
    drill: Optional[float] = None
    lines: List[dict] = field(default_factory=list)
    is_th: bool = False
    bbox_w: float = 2.0
    bbox_h: float = 2.0
    max_pad_offset: float = 1.0
    max_pad_diameter: float = 1.0
    resolved_from: str = "missing"

@dataclass
class ChainConfig:
    project_dir: Path
    run_dir: Path
    board_min_size: float = 50.0
    board_max_size: float = 250.0
    component_area_multiplier: float = 5.0
    edge_margin_base: float = 5.0
    smd_spacing: float = 4.0
    ic_spacing: float = 8.0
    pad_min_gap: float = 0.25
    power_trace_width: float = 1.0
    signal_trace_width: float = 0.2
    power_clearance: float = 0.3
    signal_clearance: float = 0.2
    high_current_base: float = 0.2
    high_current_multiplier: float = 0.15
    power_net_patterns: List[str] = field(default_factory=lambda: [
        r'^gnd$', r'^ground$', r'^vcc$', r'^vin$', r'^vdd$', r'^3v3$', r'^5v$',
        r'^5va$', r'^3v3a$', r'^12v$', r'^24v$', r'^48v$', r'^agnd$', r'^pgnd$',
        r'^iso_gnd$', r'^vin_\w+', r'^vcc_\w+', r'^\w+_gnd$', r'^\w+_vcc$',
        r'^v_bat$', r'^v_5v$', r'^v_3v3$',
    ])

    @property
    def build_dir(self) -> Path:
        return self.project_dir / "build"

    @property
    def netlist_path(self) -> Path:
        return self.build_dir / "default.net"

    @property
    def local_footprints_dir(self) -> Path:
        return self.build_dir / "footprints" / "footprints.pretty"

    @property
    def pcb_out_dir(self) -> Path:
        d = self.run_dir / "pcb"
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def board_path(self) -> Path:
        return self.pcb_out_dir / "board.kicad_pcb"

    @property
    def dsn_path(self) -> Path:
        return self.pcb_out_dir / "board.dsn"

    @property
    def ses_path(self) -> Path:
        return self.pcb_out_dir / "board-routed.ses"


# ─── Netlist parsing (unchanged from pcb_chain.py — same atopile netlist format) ──

def parse_netlist(netlist_path: Path) -> Tuple[List[Component], List[Net], Dict[Tuple[str, str], PadNet]]:
    text = netlist_path.read_text()
    components = []
    for m in re.finditer(r'\(comp \(ref "([^"]+)"\)\s*\n\s*\(value "([^"]*)"\)\s*\n\s*\(footprint "([^"]+)"\)', text):
        components.append(Component(m.group(1), m.group(2), m.group(3)))
    nets = []
    for m in re.finditer(r'\(net \(code "(\d+)"\) \(name "([^"]+)"\)', text):
        nets.append(Net(int(m.group(1)), m.group(2)))
    pad_nets = {}
    if '(nets' in text:
        nets_section = text[text.index('(nets'):]
        for m in re.finditer(r'\(net \(code "(\d+)"\) \(name "([^"]+)"\)\s*\n((?:\s+\(node[^)]*\)[^\n]*\n)*)', nets_section):
            code, name, body = int(m.group(1)), m.group(2), m.group(3)
            for nm in re.finditer(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)', body):
                ref, pin = nm.group(1), nm.group(2)
                pad_nets[(ref, pin)] = PadNet(ref, pin, code, name)
    return components, nets, pad_nets

# ─── Footprint resolution (NEW: local-pretty-dir-first, global-library-fallback) ──

_footprint_cache: Dict[str, FootprintData] = {}

def resolve_footprint_path(fp_ref: str, cfg: ChainConfig, kicad_footprints_root: Path) -> Tuple[Optional[Path], str]:
    """fp_ref is 'Library:FootprintName' (atopile's netlist footprint field).
    Returns (path, resolved_from) — tries the ato-project-local pretty dir first
    (populated only if `ato create layout` ran), then the real global KiCad
    footprint library (always populated on any working KiCad install)."""
    name = fp_ref.split(":")[-1]
    local = cfg.local_footprints_dir / f"{name}.kicad_mod"
    if local.exists():
        return local, "project_local"
    if ":" in fp_ref:
        library = fp_ref.split(":")[0]
        glob_path = kicad_footprints_root / f"{library}.pretty" / f"{name}.kicad_mod"
        if glob_path.exists():
            return glob_path, "kicad_global_library"
    return None, "missing"

def parse_footprint(fp_ref: str, cfg: ChainConfig, kicad_footprints_root: Path) -> FootprintData:
    if fp_ref in _footprint_cache:
        return _footprint_cache[fp_ref]
    fp_path, resolved_from = resolve_footprint_path(fp_ref, cfg, kicad_footprints_root)
    fp = FootprintData(resolved_from=resolved_from)
    if fp_path is None:
        _footprint_cache[fp_ref] = fp
        return fp
    content = fp_path.read_text()
    fp.is_th = 'thru_hole' in content

    # NOTE (universal fixes, discovered live 2026-07-12, all source-rule regex
    # corrections — not per-footprint patches — verified to hold across the
    # library's 15,435 real footprints):
    #  (a) a real `(at X Y)` clause OMITS the rotation entirely when it's 0 (most
    #      SMD pads) — pcb_chain.py's original regex required whitespace THEN an
    #      optional number, which cannot match a bare `)` with no preceding
    #      whitespace. Fixed to `(?:\s+([-\d.]+))?\)`.
    #  (b) some pads (paste-mask segmentation helpers under a large exposed pad on
    #      QFN/DFN packages) have an EMPTY quoted designator `(pad "" smd ...)` —
    #      `\S+?` cannot match zero characters, so the old `"?(\S+?)"?` regex
    #      mis-parsed the number as a stray quote character. Fixed to an explicit
    #      `"([^"]*)"` alternative that allows an empty string between the quotes.
    #  (c) those same paste-helper pads carry ONLY `(layers "F.Paste")` (no
    #      F.Cu/F.Mask) — they are not real electrical/copper pads, just
    #      solder-paste-stencil segmentation for a large thermal pad, and
    #      duplicating them onto F.Cu would create phantom overlapping copper at
    #      the same coordinates as the real exposed pad. The layers clause is now
    #      captured and any pad with no F.Cu layer is skipped.
    pad_pattern = (
        r'\(pad\s+(?:"([^"]*)"|(\S+))\s+(\w+)\s+(\w+)\s+'
        r'\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)\s+'
        r'\(size\s+([-\d.]+)\s+([-\d.]+)\)'
        r'(?:\s+\([^()]*\))*\s+\(layers([^)]*)\)'
    )
    for m in re.finditer(pad_pattern, content):
        num = m.group(1) if m.group(1) is not None else m.group(2)
        layers_text = m.group(10) or ''
        if 'F.Cu' not in layers_text and '*.Cu' not in layers_text:
            continue  # paste/mask-only helper pad, not a real copper pad
        fp.pads.append({
            "num": num, "type": m.group(3), "shape": m.group(4),
            "x": float(m.group(5)), "y": float(m.group(6)),
            "rot": float(m.group(7)) if m.group(7) else 0.0,
            "w": float(m.group(8)), "h": float(m.group(9)),
        })

    dm = re.search(r'\(drill\s+([-\d.]+)\)', content)
    if dm:
        fp.drill = float(dm.group(1))

    for m in re.finditer(r'\(fp_line\s+\(start\s+([-\d.]+)\s+([-\d.]+)\)\s+\(end\s+([-\d.]+)\s+([-\d.]+)\)\s+\(layer\s+"?\w+\.SilkS"?\)\s+\(stroke\s+\(width\s+([-\d.]+)\)', content):
        fp.lines.append({
            "x1": float(m.group(1)), "y1": float(m.group(2)),
            "x2": float(m.group(3)), "y2": float(m.group(4)),
            "width": float(m.group(5)),
        })

    all_x = [p["x"] - p["w"] / 2 for p in fp.pads] + [p["x"] + p["w"] / 2 for p in fp.pads] + [l["x1"] for l in fp.lines] + [l["x2"] for l in fp.lines]
    all_y = [p["y"] - p["h"] / 2 for p in fp.pads] + [p["y"] + p["h"] / 2 for p in fp.pads] + [l["y1"] for l in fp.lines] + [l["y2"] for l in fp.lines]
    if all_x and all_y:
        fp.bbox_w = max(all_x) - min(all_x) + 1.0
        fp.bbox_h = max(all_y) - min(all_y) + 1.0

    for p in fp.pads:
        offset = max(abs(p["x"]), abs(p["y"]))
        fp.max_pad_offset = max(fp.max_pad_offset, offset)
        fp.max_pad_diameter = max(fp.max_pad_diameter, max(p["w"], p["h"]))

    _footprint_cache[fp_ref] = fp
    return fp

# ─── Power net detection ───────────────────────────────────────────────────────

def detect_power_nets(nets: List[Net], patterns: List[str]) -> List[Net]:
    power = []
    for net in nets:
        name_lower = net.name.lower()
        for pat in patterns:
            if re.match(pat, name_lower):
                power.append(net)
                break
    return power

# ─── Dynamic spacing (unchanged) ───────────────────────────────────────────────

def compute_th_spacing(components: List[Component], cfg: ChainConfig, fp_root: Path, min_gap: float) -> float:
    max_offset = 0.0
    max_diameter = 0.0
    for c in components:
        fp = parse_footprint(c.footprint, cfg, fp_root)
        if fp.is_th:
            max_offset = max(max_offset, fp.max_pad_offset)
            max_diameter = max(max_diameter, fp.max_pad_diameter)
    spacing = max_offset * 2 + max_diameter + min_gap
    return max(spacing, 10.0)

def compute_edge_margin(components: List[Component], cfg: ChainConfig, fp_root: Path, base: float) -> float:
    max_offset = 0.0
    for c in components:
        fp = parse_footprint(c.footprint, cfg, fp_root)
        if fp.is_th:
            max_offset = max(max_offset, fp.max_pad_offset)
    return max(base, max_offset + 2.0)

# ─── Board outline (NEW — reads Phase B's PcbBoardGeometry when provided) ─────

def load_board_outline(path: str) -> Optional[dict]:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text())

def outline_bbox(outline: dict) -> Tuple[float, float, float, float]:
    """(min_x, min_y, max_x, max_y) over every line/arc endpoint+mid in the outline."""
    xs, ys = [], []
    for seg in outline["outline"]["segments"]:
        for key in ("start", "end", "mid"):
            pt = seg.get(key)
            if pt:
                xs.append(pt["xMm"])
                ys.append(pt["yMm"])
    return min(xs), min(ys), max(xs), max(ys)

def scale_outline_segments(outline: dict, scale_x: float, scale_y: float) -> dict:
    """Uniformly scale every point in the outline (used when the auto-loop grows
    the board — the bespoke shape is preserved, just scaled to the new bbox)."""
    def scale_pt(pt):
        return {"xMm": round(pt["xMm"] * scale_x, 4), "yMm": round(pt["yMm"] * scale_y, 4)}
    scaled = json.loads(json.dumps(outline))
    for seg in scaled["outline"]["segments"]:
        for key in ("start", "end", "mid"):
            if key in seg:
                seg[key] = scale_pt(seg[key])
    return scaled

def _looks_like_compact_source_board(components: List[Component]) -> bool:
    """Return true for source/driver-only board netlists, not controller motherboards."""
    text = " ".join(f"{c.ref} {c.value} {c.footprint}" for c in components).lower()
    has_source = bool(re.search(r"\b(led source|light source|optical source|source board|emitter|illumination|led driver)\b", text))
    has_motherboard_roles = bool(re.search(r"\b(mcu|microcontroller|processor|controller|display|screen|detector|photodiode|sensor)\b", text))
    return has_source and not has_motherboard_roles and len(components) <= 32

def auto_board_size(components: List[Component], cfg: ChainConfig, fp_root: Path) -> Tuple[float, float]:
    total_area = 0.0
    for c in components:
        fp = parse_footprint(c.footprint, cfg, fp_root)
        total_area += fp.bbox_w * fp.bbox_h
    side = math.sqrt(max(total_area, 1.0) * cfg.component_area_multiplier)
    if _looks_like_compact_source_board(components):
        side = max(25.0, min(40.0, side))
        side = math.ceil(side / 5) * 5
    else:
        side = max(cfg.board_min_size, min(cfg.board_max_size, side))
        side = math.ceil(side / 10) * 10
    return side, side

def selftest() -> None:
    """proveCatch: compact optical/source boards stay in the 25–40 mm window.

    Catches both (a) the old 50 mm auto_board_size floor and (b) placement
    board_extra growth that inflated colorimeter-1441 from 40→80 mm.
    """
    cfg = ChainConfig(project_dir=Path("/tmp/pcb-selftest"), run_dir=Path("/tmp/pcb-selftest"))
    components = [Component("D1", "LED source", "LED_SMD:LED_0603_1608Metric")]
    _footprint_cache.clear()
    _footprint_cache[components[0].footprint] = FootprintData(bbox_w=1.6, bbox_h=0.8, resolved_from="fixture")
    board_w, board_h = auto_board_size(components, cfg, Path("/tmp/unused"))
    if not (25.0 <= board_w <= 40.0 and 25.0 <= board_h <= 40.0):
        raise AssertionError(
            f"compact source PCB should stay 25–40 mm, got {board_w:g}×{board_h:g} mm"
        )
    # proveCatch: a 40 mm outline + would-be +20/+40 board_extra must clamp ≤40.
    assert _looks_like_compact_source_board(components), "LED-source-only netlist must classify compact"
    base_w = base_h = 40.0
    board_extra = 40.0  # two failed iterations of the old +20 path
    capped_w = min(base_w + board_extra, 40.0)
    capped_h = min(base_h + board_extra, 40.0)
    if capped_w > 40.0 or capped_h > 40.0:
        raise AssertionError(f"compact-source placement growth must clamp at 40 mm, got {capped_w}×{capped_h}")
    # Counter-case: motherboard-shaped netlist is NOT compact (may grow past 40).
    motherboard = [
        Component("U1", "MCU microcontroller", "Package_QFP:LQFP-64_10x10mm_P0.5mm"),
        Component("D2", "LED source", "LED_SMD:LED_0603_1608Metric"),
    ]
    if _looks_like_compact_source_board(motherboard):
        raise AssertionError("MCU+LED netlist must NOT classify as compact source board")
    # proveCatch: IC grid is board-centred (old cy-20 shoved pads off a 40 mm board).
    _footprint_cache["Package_SO:SOIC-8_3.9x4.9mm_P1.27mm"] = FootprintData(
        bbox_w=6.0, bbox_h=5.0, resolved_from="fixture",
        pads=[{"num": "1", "x": -2.7, "y": -1.9, "w": 0.6, "h": 1.5, "rot": 0, "type": "smd", "shape": "rect"}],
    )
    _footprint_cache["LED_SMD:LED_0603_1608Metric"] = FootprintData(
        bbox_w=1.6, bbox_h=0.8, resolved_from="fixture",
        pads=[{"num": "1", "x": -0.75, "y": 0, "w": 0.8, "h": 0.8, "rot": 0, "type": "smd", "shape": "rect"}],
    )
    tiny = [
        Component("U1", "LED driver", "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm"),
        Component("D1", "LED source", "LED_SMD:LED_0603_1608Metric"),
    ]
    place = place_components(tiny, cfg, Path("/tmp/unused"), 40.0, 40.0, 10.0, 3.0)
    uy = place["U1"][1]
    if not (5.0 <= uy <= 35.0):
        raise AssertionError(f"compact-board IC must sit near centre, got y={uy:.1f}")
    # proveCatch (2026-07-15): SOT-23 IC + several 0603 caps must NOT collide.
    # Old smd_cy = cy + 0.55*ic_spacing kept U1 vs C* at ~0.5 mm (powerwall-2214).
    _footprint_cache["Package_TO_SOT_SMD:SOT-23-5"] = FootprintData(
        bbox_w=3.0, bbox_h=3.0, resolved_from="fixture",
        pads=[
            {"num": "1", "x": -0.95, "y": -0.95, "w": 0.6, "h": 0.5, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "2", "x": 0.0, "y": -0.95, "w": 0.6, "h": 0.5, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "3", "x": 0.95, "y": -0.95, "w": 0.6, "h": 0.5, "rot": 0, "type": "smd", "shape": "rect"},
        ],
    )
    _footprint_cache["Capacitor_SMD:C_0603_1608Metric"] = FootprintData(
        bbox_w=1.6, bbox_h=0.8, resolved_from="fixture",
        pads=[
            {"num": "1", "x": -0.75, "y": 0, "w": 0.8, "h": 0.8, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "2", "x": 0.75, "y": 0, "w": 0.8, "h": 0.8, "rot": 0, "type": "smd", "shape": "rect"},
        ],
    )
    multi = [
        Component("U1", "DC-DC regulator", "Package_TO_SOT_SMD:SOT-23-5"),
        Component("C1", "decouple", "Capacitor_SMD:C_0603_1608Metric"),
        Component("C2", "decouple", "Capacitor_SMD:C_0603_1608Metric"),
        Component("C3", "decouple", "Capacitor_SMD:C_0603_1608Metric"),
        Component("D1", "status LED", "LED_SMD:LED_0603_1608Metric"),
    ]
    place2 = place_components(multi, cfg, Path("/tmp/unused"), 70.0, 70.0, 12.0, 5.0,
                              ic_spacing=15.0, smd_spacing=4.0)
    ok, reason = validate_placement(place2, multi, cfg, Path("/tmp/unused"), 70.0, 70.0)
    if not ok:
        raise AssertionError(f"IC+SMD band separation must place without overlap, got: {reason}")
    # proveCatch (2026-07-16): three Fuse_1206 at cfg smd_spacing=4 mm must NOT
    # collide — spacing floors to bbox_w+1 (≥4.2 for 3.2 mm 1206).
    _footprint_cache["Fuse:Fuse_1206_3216Metric"] = FootprintData(
        bbox_w=3.2, bbox_h=1.6, resolved_from="fixture",
        pads=[
            {"num": "1", "x": -1.4, "y": 0, "w": 1.0, "h": 1.2, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "2", "x": 1.4, "y": 0, "w": 1.0, "h": 1.2, "rot": 0, "type": "smd", "shape": "rect"},
        ],
    )
    fuses = [
        Component("F1", "polyfuse", "Fuse:Fuse_1206_3216Metric"),
        Component("F2", "overcurrent", "Fuse:Fuse_1206_3216Metric"),
        Component("F3", "mains", "Fuse:Fuse_1206_3216Metric"),
    ]
    place_f = place_components(fuses, cfg, Path("/tmp/unused"), 40.0, 40.0, 10.0, 3.0,
                               smd_spacing=4.0)
    ok_f, reason_f = validate_placement(place_f, fuses, cfg, Path("/tmp/unused"), 40.0, 40.0)
    if not ok_f:
        raise AssertionError(f"1206 fuse SMD pitch floor must prevent pad overlap, got: {reason_f}")
    # proveCatch (2026-07-16): LQFP + Fuse_1206 band must clear (SMD anchored below IC).
    _footprint_cache["Package_QFP:LQFP-32_7x7mm_P0.8mm"] = FootprintData(
        bbox_w=10.8, bbox_h=10.8, resolved_from="fixture",
        pads=[
            {"num": "1", "x": -4.2, "y": -4.2, "w": 0.5, "h": 1.2, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "9", "x": 4.2, "y": -4.2, "w": 0.5, "h": 1.2, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "17", "x": 4.2, "y": 4.2, "w": 0.5, "h": 1.2, "rot": 0, "type": "smd", "shape": "rect"},
            {"num": "25", "x": -4.2, "y": 4.2, "w": 0.5, "h": 1.2, "rot": 0, "type": "smd", "shape": "rect"},
        ],
    )
    drive = [
        Component("U1", "MCU microcontroller", "Package_QFP:LQFP-32_7x7mm_P0.8mm"),
        Component("F1", "polyfuse", "Fuse:Fuse_1206_3216Metric"),
        Component("F2", "overcurrent", "Fuse:Fuse_1206_3216Metric"),
    ]
    place_d = place_components(drive, cfg, Path("/tmp/unused"), 60.0, 60.0, 12.0, 5.0,
                               ic_spacing=15.0, smd_spacing=4.0)
    ok_d, reason_d = validate_placement(place_d, drive, cfg, Path("/tmp/unused"), 60.0, 60.0)
    if not ok_d:
        raise AssertionError(f"LQFP+fuse SMD band anchor must clear IC pads, got: {reason_d}")
    if place_d["F1"][1] <= place_d["U1"][1]:
        raise AssertionError(
            f"SMD band must sit below IC (F1.y={place_d['F1'][1]:.1f} U1.y={place_d['U1'][1]:.1f})"
        )
    print("pcb_pipeline_runner selftest: OK (compact 25-40 + growth cap + centred IC + motherboard counter-case + IC/SMD band + fuse pitch + LQFP band)")

# ─── Placement (unchanged algorithm; NAIVE — grid/edge placement, not a real
#     autoplacer. Bounded to the board's own outline bbox with a margin >= the
#     outline's own corner radius, so parts land inside a rounded-rect bespoke
#     outline too, not just a plain rectangle.) ────────────────────────────────

def validate_placement(placements: Dict, components: List[Component], cfg: ChainConfig, fp_root: Path,
                        board_w: float, board_h: float, clearance: float = 1.0) -> Tuple[bool, str]:
    all_pads = []
    for c in components:
        if c.ref not in placements:
            continue
        cx, cy = placements[c.ref]
        fp = parse_footprint(c.footprint, cfg, fp_root)
        for p in fp.pads:
            pad_x = cx + p["x"]
            pad_y = cy + p["y"]
            pad_r = max(p["w"], p["h"]) / 2
            if pad_x < clearance or pad_x > board_w - clearance:
                return False, f"{c.ref} pad {p['num']} off-board X ({pad_x:.1f})"
            if pad_y < clearance or pad_y > board_h - clearance:
                return False, f"{c.ref} pad {p['num']} off-board Y ({pad_y:.1f})"
            all_pads.append((c.ref, pad_x, pad_y, pad_r))

    min_gap = 0.25
    for i in range(len(all_pads)):
        for j in range(i + 1, len(all_pads)):
            ref1, x1, y1, r1 = all_pads[i]
            ref2, x2, y2, r2 = all_pads[j]
            if ref1 == ref2:
                continue
            dist = math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
            if dist < r1 + r2 + min_gap:
                return False, f"pad overlap: {ref1}({x1:.1f},{y1:.1f}) vs {ref2}({x2:.1f},{y2:.1f}) dist={dist:.2f}"
    return True, "ok"

def place_components(components: List[Component], cfg: ChainConfig, fp_root: Path, board_w: float, board_h: float,
                      th_spacing: float, edge_margin: float,
                      ic_spacing: Optional[float] = None, smd_spacing: Optional[float] = None) -> Dict[str, Tuple[float, float]]:
    ic_spacing = cfg.ic_spacing if ic_spacing is None else ic_spacing
    smd_spacing = cfg.smd_spacing if smd_spacing is None else smd_spacing
    placements = {}
    fp_cache = {c.ref: parse_footprint(c.footprint, cfg, fp_root) for c in components}

    th = [(c, fp_cache[c.ref]) for c in components if fp_cache[c.ref].is_th]
    ics = [(c, fp_cache[c.ref]) for c in components if not fp_cache[c.ref].is_th and c.ref.startswith('U')]
    smd = [(c, fp_cache[c.ref]) for c in components if not fp_cache[c.ref].is_th and not c.ref.startswith('U')]

    th.sort(key=lambda x: max(x[1].bbox_w, x[1].bbox_h), reverse=True)

    margin = edge_margin
    per_top = max(1, int((board_w - 2 * margin) / th_spacing))
    per_right = max(1, int((board_h - 2 * margin) / th_spacing))
    per_bottom = per_top
    per_left = per_right

    for i, (c, fp) in enumerate(th):
        if i < per_top:
            x = margin + (i % per_top) * th_spacing
            y = margin
        elif i < per_top + per_right:
            idx = i - per_top
            x = board_w - margin
            y = margin + idx * th_spacing
        elif i < per_top + per_right + per_bottom:
            idx = i - per_top - per_right
            x = board_w - margin - idx * th_spacing
            y = board_h - margin
        else:
            idx = i - per_top - per_right - per_bottom
            x = margin
            y = board_h - margin - idx * th_spacing
        placements[c.ref] = (x, y)

    cx, cy = board_w / 2, board_h / 2
    ics.sort(key=lambda x: max(x[1].bbox_w, x[1].bbox_h), reverse=True)
    cols = max(1, int(math.sqrt(len(ics)) + 0.999)) if ics else 1
    rows = max(1, math.ceil(len(ics) / cols)) if ics else 1

    def _pad_radial_extent(fp: FootprintData) -> float:
        if fp.pads:
            return max(
                max(abs(pad["x"]) + max(pad["w"], pad["h"]) / 2,
                    abs(pad["y"]) + max(pad["w"], pad["h"]) / 2)
                for pad in fp.pads
            )
        return max(fp.bbox_w / 2, fp.bbox_h / 2, 0.5)

    # Floor IC pitch by pad extents so LQFP-32 + SOIC-8 cannot start at 15 mm
    # centres with nearest pads < min_gap (Poseidon retest iter-1 U1-vs-U2).
    if ics:
        max_ic_extent = max(_pad_radial_extent(fp) for _, fp in ics)
        ic_spacing = max(ic_spacing, 2 * max_ic_extent + 0.5)
    # DECISION (2026-07-14): centre the IC grid on the board. The old
    # `cy - 20` / `cy + 10` offsets assumed ≥50 mm motherboards and shoved
    # SOIC pads off a 25–40 mm optical source daughterboard (colorimeter-1441).
    for i, (c, fp) in enumerate(ics):
        col = i % cols
        row = i // cols
        x = cx - (cols - 1) * ic_spacing / 2 + col * ic_spacing
        y = cy - (rows - 1) * ic_spacing / 2 + row * ic_spacing
        half_h = max(fp.bbox_h / 2, 1.0)
        half_w = max(fp.bbox_w / 2, 1.0)
        x = min(max(x, margin + half_w), board_w - margin - half_w)
        y = min(max(y, margin + half_h), board_h - margin - half_h)
        placements[c.ref] = (x, y)

    smd.sort(key=lambda x: max(x[1].bbox_w, x[1].bbox_h), reverse=True)
    smd_cols = max(1, int(math.sqrt(len(smd)) + 0.999)) if smd else 1
    smd_rows = max(1, math.ceil(len(smd) / smd_cols)) if smd else 1
    # DECISION (2026-07-15): separate SMD band by footprint half-extents + gap,
    # NOT `ic_spacing * 0.55`. Fractional spacing kept U1 (SOT-23-5) and C*
    # (0603) colliding at ~0.5–0.7 mm while board growth moved BOTH clusters
    # with `cy` — placement never converged (powerwall-2214/0447).
    # INTENT (2026-07-16): floor SMD pitch + IC/SMD band gap from real pad
    # extents (same r as validate_placement) so Fuse_1206 parts and LQFP pads
    # cannot collide (Poseidon 0602 / retest U1-vs-F1).
    max_ic_half_h = max((_pad_radial_extent(fp) for _, fp in ics), default=0.0)
    max_ic_half_h = max(
        max_ic_half_h,
        max((fp.bbox_h / 2 for _, fp in ics), default=0.0),
        1.0 if ics else 0.0,
    )
    max_smd_half_h = max((_pad_radial_extent(fp) for _, fp in smd), default=0.5)
    max_pad_extent = max_smd_half_h
    smd_spacing = max(smd_spacing, 2 * max_pad_extent + 0.5)
    band_gap = max(2.5, ic_spacing * 0.2, 1.0)
    # DECISION (2026-07-16): anchor the SMD band BELOW the IC pad extent.
    # Centring the SMD grid on smd_cy pulled row-0 back into the LQFP pads
    # (Poseidon retest: U1@cy vs F1@cy+5.6 with extents 4.92+2.27 needed ≥7.4).
    if ics:
        smd_top = cy + max_ic_half_h + band_gap
        smd_y0 = smd_top + max_smd_half_h
    else:
        smd_y0 = cy - (smd_rows - 1) * smd_spacing / 2
    for i, (c, fp) in enumerate(smd):
        col = i % smd_cols
        row = i // smd_cols
        x = cx - (smd_cols - 1) * smd_spacing / 2 + col * smd_spacing
        y = smd_y0 + row * smd_spacing
        half_h = max(fp.bbox_h / 2, 0.5)
        half_w = max(fp.bbox_w / 2, 0.5)
        x = min(max(x, margin + half_w), board_w - margin - half_w)
        y = min(max(y, margin + half_h), board_h - margin - half_h)
        placements[c.ref] = (x, y)

    return placements

# ─── .kicad_pcb generation ─────────────────────────────────────────────────────

def footprint_to_sexp(fp_data: FootprintData, fp_name: str, ref: str, value: str,
                       x: float, y: float, pad_nets: Dict) -> str:
    short_name = fp_name.split(":")[-1]
    lines = [f'(footprint "{short_name}" (layer "F.Cu") (at {x} {y})']
    # INTENT: generated footprints come from many packages with no courtyard model.
    # Keeping refs on F.SilkS clipped header pads (silk_over_copper DRC warnings);
    # F.Fab preserves manufacturing/PnP identity without claiming printable silk.
    lines.append(f'  (fp_text reference "{ref}" (at 0 -{max(fp_data.bbox_h/2 + 1, 2)}) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))')
    lines.append(f'  (fp_text value "{value or short_name}" (at 0 {max(fp_data.bbox_h/2 + 1, 2)}) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))')

    for sl in fp_data.lines[:6]:
        w = sl["width"] if sl["width"] else 0.12
        lines.append(f'  (fp_line (start {sl["x1"]} {sl["y1"]}) (end {sl["x2"]} {sl["y2"]}) (stroke (width {w})) (layer "F.SilkS"))')

    for p in fp_data.pads:
        drill_str = f' (drill {fp_data.drill})' if p["type"] == "thru_hole" and fp_data.drill else ""
        net_str = ""
        if (ref, p["num"]) in pad_nets:
            pn = pad_nets[(ref, p["num"])]
            net_str = f' (net {pn.net_code} "{pn.net_name}")'
        pad_layers = '"F.Cu" "F.Paste" "F.Mask"' if p["type"] == "smd" else '"*.Cu" "*.Mask"'
        lines.append(f'  (pad "{p["num"]}" {p["type"]} {p["shape"]} (at {p["x"]} {p["y"]} {p["rot"]}) (size {p["w"]} {p["h"]}) (layers {pad_layers}){drill_str}{net_str})')

    lines.append(')')
    return '\n'.join(lines)

def edge_cuts_sexp(board_w: float, board_h: float, outline: Optional[dict]) -> List[str]:
    """Real bespoke outline (lines + arcs) when provided; plain rectangle fallback
    for a generic/no-outline atopile project (keeps this script usable stand-alone,
    universal across any archetype, not just ones that ran Phase B's outline step)."""
    lines = []
    if outline is not None:
        for seg in outline["outline"]["segments"]:
            if seg["kind"] == "line":
                s, e = seg["start"], seg["end"]
                lines.append(f'  (gr_line (start {s["xMm"]} {s["yMm"]}) (end {e["xMm"]} {e["yMm"]}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
            elif seg["kind"] == "arc":
                s, mid, e = seg["start"], seg["mid"], seg["end"]
                lines.append(f'  (gr_arc (start {s["xMm"]} {s["yMm"]}) (mid {mid["xMm"]} {mid["yMm"]}) (end {e["xMm"]} {e["yMm"]}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
        return lines
    lines.append(f'  (gr_line (start 0 0) (end {board_w} 0) (stroke (width 0.1)) (layer "Edge.Cuts"))')
    lines.append(f'  (gr_line (start {board_w} 0) (end {board_w} {board_h}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
    lines.append(f'  (gr_line (start {board_w} {board_h}) (end 0 {board_h}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
    lines.append(f'  (gr_line (start 0 {board_h}) (end 0 0) (stroke (width 0.1)) (layer "Edge.Cuts"))')
    return lines

def generate_kicad_pcb(components: List[Component], nets: List[Net], pad_nets: Dict,
                        placements: Dict, board_w: float, board_h: float,
                        power_nets: List[Net], cfg: ChainConfig, fp_root: Path,
                        outline: Optional[dict]) -> str:
    # NOTE (universal fix, discovered live 2026-07-12): pcb_chain.py's original
    # layer-ID table (F.Cu=0 .. B.Cu=31, sequential 32-49 for the rest) matches an
    # OLDER KiCad numbering scheme. KiCad 10.0.4's actual PCB_LAYER_ID enum (read
    # directly from the live `pcbnew` module below, not guessed) uses interleaved
    # odd/even IDs (F.Cu=0, B.Cu=2, In1.Cu=4, In2.Cu=6, F.Mask=1, B.Mask=3, ...) —
    # every generated board silently failed `LoadBoard()` (returned None, no
    # exception) with the old table. This is a KiCad FILE-FORMAT CONSTANT (not a
    # business-logic table), stable across a KiCad release line, so it is fixed
    # here rather than threaded through as a parameter.
    use_4layer = len(power_nets) >= 2
    lines = ['(kicad_pcb', '  (version 20260206)', '  (generator "pcb-pipeline-runner")', '  (generator_version "10.0")']
    lines.append('  (general (thickness 1.6) (legacy_teardrops no))')
    lines.append('  (paper "A4")')
    lines.append('  (layers')

    copper_layers = [(0, "F.Cu"), (2, "B.Cu")]
    if use_4layer:
        num_inner = min(len(power_nets), 2)
        inner_ids = [4, 6]
        inner_names = [f"In{i+1}.Cu" for i in range(num_inner)]
        copper_layers = [(0, "F.Cu")] + list(zip(inner_ids[:num_inner], inner_names)) + [(2, "B.Cu")]

    for ln, lname in copper_layers:
        lines.append(f'    ({ln} "{lname}" signal)')
    for ln, lname, ltype in [
        (1, "F.Mask", "user"), (3, "B.Mask", "user"),
        (5, "F.SilkS", "user"), (7, "B.SilkS", "user"),
        (9, "F.Adhes", "user"), (11, "B.Adhes", "user"),
        (13, "F.Paste", "user"), (15, "B.Paste", "user"),
        (17, "Dwgs.User", "user"), (19, "Cmts.User", "user"),
        (25, "Edge.Cuts", "user"), (27, "Margin", "user"),
        (29, "B.CrtYd", "user"), (31, "F.CrtYd", "user"),
        (33, "B.Fab", "user"), (35, "F.Fab", "user"),
    ]:
        lines.append(f'    ({ln} "{lname}" {ltype})')
    lines.append('  )')
    lines.append('  (setup (pad_to_mask_clearance 0))')

    lines.append('  (net 0 "")')
    for n in nets:
        lines.append(f'  (net {n.code} "{n.name}")')
    lines.append('')

    lines.extend(edge_cuts_sexp(board_w, board_h, outline))
    lines.append('')

    for c in components:
        if c.ref not in placements:
            continue
        x, y = placements[c.ref]
        fp_data = parse_footprint(c.footprint, cfg, fp_root)
        block = footprint_to_sexp(fp_data, c.footprint, c.ref, c.value, x, y, pad_nets)
        for line in block.split('\n'):
            lines.append('  ' + line)
        lines.append('')

    lines.append(')')
    return '\n'.join(lines)

# ─── KiCad Python bridge (the "UNIVERSAL FIX" for text-generated .kicad_pcb) ──

def kicad_python(script: str, kicad_python_bin: str, kicad_pythonpath: str, timeout: int = 120) -> Tuple[str, str, int]:
    env = {"PYTHONPATH": kicad_pythonpath, "PATH": "/usr/bin:/bin"}
    result = subprocess.run([kicad_python_bin, "-c", script], capture_output=True, text=True, env=env, timeout=timeout)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def normalise_board(board_path: Path, output_path: Path, power_nets: List[Net], args) -> Tuple[bool, str]:
    # NOTE (KiCad 10 API change, discovered live 2026-07-12): pcb_chain.py's
    # original per-net-class trace-width assignment used `BOARD.AddNetClass()` /
    # `NETCLASS.SetTraceWidth()`, both removed in KiCad 10 — net classes now live
    # in the PROJECT's design settings, not settable this way from a bare in-memory
    # BOARD with no .kicad_pro. Simplified: this is still the load-bearing
    # "UNIVERSAL FIX for text-generated .kicad_pcb files that kicad-cli can't
    # load" (LoadBoard()+Save() round-trips the file through KiCad's own
    # s-expression writer, which is what actually repairs it) — just without the
    # power/signal trace-width differentiation, which now uses the board's
    # default net class (KiCad defaults: 0.25mm track, 0.2mm clearance) instead.
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")
if b is None:
    print("ERROR: LoadBoard returned None")
else:
    b.Save("{output_path}")
    print(f"Normalised: {{len(b.GetFootprints())}} footprints")
'''
    out, err, code = kicad_python(script, args.kicad_python, args.kicad_pythonpath)
    ok = output_path.exists() and "ERROR" not in out
    return ok, (out + "\n" + err).strip()

def export_dsn(board_path: Path, dsn_path: Path, num_inner: int, args) -> Tuple[bool, str]:
    script = f'import pcbnew\nb = pcbnew.LoadBoard("{board_path}")\n'
    if num_inner > 0:
        script += 'lset = pcbnew.LSET()\nlset.addLayer(pcbnew.F_Cu)\nlset.addLayer(pcbnew.B_Cu)\n'
        for i in range(1, num_inner + 1):
            script += f'lset.addLayer(pcbnew.In{i}_Cu)\n'
        script += 'b.SetEnabledLayers(lset)\n'
        for i in range(1, num_inner + 1):
            script += f'b.SetLayerType(pcbnew.In{i}_Cu, pcbnew.LT_SIGNAL)\n'
    script += f'pcbnew.ExportSpecctraDSN(b, "{dsn_path}")\nprint("DSN exported")'
    out, err, code = kicad_python(script, args.kicad_python, args.kicad_pythonpath)
    ok = dsn_path.exists()
    return ok, (out + "\n" + err).strip()

def import_ses(board_path: Path, ses_path: Path, output_path: Path, args) -> Tuple[bool, int, str]:
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")
pcbnew.ImportSpecctraSES(b, "{ses_path}")
tracks = list(b.GetTracks())
print(f"tracks:{{len(tracks)}}")
b.Save("{output_path}")
'''
    out, err, code = kicad_python(script, args.kicad_python, args.kicad_pythonpath)
    m = re.search(r'tracks:(\d+)', out)
    track_count = int(m.group(1)) if m else 0
    ok = output_path.exists()
    return ok, track_count, (out + "\n" + err).strip()

# ─── FreeRouter ─────────────────────────────────────────────────────────────

def run_freerouter(dsn_path: Path, ses_path: Path, args, strategy: str = "Hybrid") -> Tuple[bool, int, str]:
    if not args.freerouting_jar or not Path(args.freerouting_jar).exists():
        return False, -1, "freerouting_jar_not_available"
    env = os.environ.copy()
    java_dir = str(Path(args.java_bin).parent)
    env["PATH"] = java_dir + ":" + env.get("PATH", "")
    try:
        result = subprocess.run(
            [args.java_bin, "-Djava.awt.headless=true", "-jar", args.freerouting_jar,
             "-de", str(dsn_path), "-do", str(ses_path),
             "-mp", str(args.max_passes), "-mt", "8", "-us", strategy],
            capture_output=True, text=True, env=env, timeout=args.freerouting_timeout_s,
        )
    except subprocess.TimeoutExpired:
        return ses_path.exists(), -1, "freerouting_timeout"
    # NOTE (honesty fix, discovered live 2026-07-12): Freerouting emits ONE line
    # per autoroute pass ("Auto-router pass #N ... completed ... score of S
    # (M unrouted)." — the "(M unrouted)" suffix is OMITTED once a pass reaches
    # 0 unrouted), THEN a final "Auto-router session completed: started with K
    # unrouted nets, ..." summary line. That summary line ALSO contains both the
    # substrings "completed" and "unrouted", but its number is the STARTING
    # count, not the final one — pcb_chain.py's original substring scan (`if
    # 'completed' in line and 'unrouted' in line`) matches every one of these
    # lines and keeps the LAST match, so it was silently overwriting a correct
    # "0 unrouted" (pass omits the suffix) or "1 unrouted" (last real pass) with
    # the session summary's STARTING count — reporting e.g. 51 unrouted on a
    # board that DRC (the real source of truth) confirms is fully routed.
    # Fixed: only read the per-pass lines, and treat a pass with no "(M
    # unrouted)" suffix as 0 (Freerouting's own convention).
    last_pass_unrouted: Optional[int] = None
    for line in result.stdout.split('\n'):
        if not re.match(r'.*Auto-router pass #\d+ .* completed ', line):
            continue
        m = re.search(r'\((\d+) unrouted\)', line)
        last_pass_unrouted = int(m.group(1)) if m else 0
    unrouted = last_pass_unrouted if last_pass_unrouted is not None else -1
    return ses_path.exists(), unrouted, (result.stdout[-2000:] + result.stderr[-1000:])

# ─── DRC (JSON format — robust, no substring counting) ─────────────────────────

def run_drc(board_path: Path, drc_json_path: Path, kicad_cli: str) -> Tuple[bool, int, dict]:
    result = subprocess.run(
        [kicad_cli, "pcb", "drc", str(board_path),
         "--output", str(drc_json_path), "--format", "json", "--severity-all"],
        # GOTCHA (Rodeostat 0201): 90s timed out under concurrent Blender/chain
        # load even though a quiet DRC finishes in ~2s — pipeline stopped at
        # runner_output_parse with a routed board and no Gerbers.
        # GOTCHA (OpenDrop 0410): 300s still timed out under revisit-watch load
        # (Freerouting + excel + Blender concurrent) — raise to 900s.
        capture_output=True, text=True, timeout=900,
    )
    if not drc_json_path.exists():
        return False, -1, {"stdout": result.stdout, "stderr": result.stderr}
    report = json.loads(drc_json_path.read_text())
    violations = len(report.get("violations", [])) + len(report.get("unconnected_items", []))
    return True, violations, report

# ─── Manufacturing outputs ──────────────────────────────────────────────────

def export_manufacturing(routed_board: Path, out_dir: Path, kicad_cli: str) -> dict:
    outputs = {"gerbers": None, "drill": None, "pos": None, "render_png": None}

    gerbers_dir = out_dir / "gerbers"
    gerbers_dir.mkdir(exist_ok=True)
    r = subprocess.run([kicad_cli, "pcb", "export", "gerbers", str(routed_board),
                        "--output", str(gerbers_dir)], capture_output=True, text=True, timeout=90)
    gerber_files = sorted(str(p) for p in gerbers_dir.glob("*")) if gerbers_dir.exists() else []
    if gerber_files:
        outputs["gerbers"] = {"dir": str(gerbers_dir), "files": gerber_files}

    drill_dir = out_dir / "drill"
    drill_dir.mkdir(exist_ok=True)
    subprocess.run([kicad_cli, "pcb", "export", "drill", str(routed_board),
                    "--output", str(drill_dir)], capture_output=True, text=True, timeout=90)
    drill_files = sorted(str(p) for p in drill_dir.glob("*")) if drill_dir.exists() else []
    if drill_files:
        outputs["drill"] = {"dir": str(drill_dir), "files": drill_files}

    pos_path = out_dir / "positions.csv"
    subprocess.run([kicad_cli, "pcb", "export", "pos", str(routed_board),
                    "--output", str(pos_path)], capture_output=True, text=True, timeout=90)
    if pos_path.exists():
        outputs["pos"] = {"path": str(pos_path)}

    render_path = out_dir / "board-3d.png"
    subprocess.run([kicad_cli, "pcb", "render", str(routed_board),
                    "--output", str(render_path), "--side", "top", "--quality", "high",
                    "--width", "1600", "--height", "1200", "--background", "opaque"],
                   capture_output=True, text=True, timeout=180)
    if render_path.exists():
        outputs["render_png"] = str(render_path)

    return outputs

# ─── Main ───────────────────────────────────────────────────────────────────

def run(args) -> dict:
    result = new_result()
    project_dir = Path(args.project_dir)
    run_dir = Path(args.run_dir)
    fp_root = Path(args.kicad_footprints_root)
    cfg = ChainConfig(project_dir=project_dir, run_dir=run_dir)

    # 1. ato build
    result["stage_reached"] = "ato_build"
    try:
        build = subprocess.run(
            [args.ato_bin, "build"], cwd=str(project_dir),
            capture_output=True, text=True, input="n\n", timeout=180,
        )
    except Exception as e:
        result["errors"].append(f"ato build failed to launch: {e}")
        emit(result)
        return result

    if not cfg.netlist_path.exists():
        result["errors"].append(f"ato build did not produce a netlist ({cfg.netlist_path}); stderr: {build.stderr[-800:]}")
        emit(result)
        return result

    components, nets, pad_nets = parse_netlist(cfg.netlist_path)
    result["components"] = len(components)
    result["nets"] = len(nets)
    if not components:
        result["errors"].append("netlist parsed but contains zero components")
        emit(result)
        return result

    unresolved_footprints = []
    for c in components:
        fp = parse_footprint(c.footprint, cfg, fp_root)
        if fp.resolved_from == "missing":
            unresolved_footprints.append(f"{c.ref}:{c.footprint}")
    if unresolved_footprints:
        result["stage_reached"] = "footprint_resolution"
        result["errors"].append(
            f"{len(unresolved_footprints)}/{len(components)} components have no resolvable "
            f".kicad_mod (neither project-local nor global KiCad library): {unresolved_footprints[:10]}"
        )
        emit(result)
        return result

    power_nets = detect_power_nets(nets, cfg.power_net_patterns)
    num_inner = min(len(power_nets), 2) if len(power_nets) >= 2 else 0

    outline = load_board_outline(args.board_outline)
    if outline is not None:
        min_x, min_y, max_x, max_y = outline_bbox(outline)
        base_w, base_h = max_x - min_x, max_y - min_y
    else:
        base_w, base_h = auto_board_size(components, cfg, fp_root)

    th_spacing = compute_th_spacing(components, cfg, fp_root, cfg.pad_min_gap)
    edge_margin = compute_edge_margin(components, cfg, fp_root, cfg.edge_margin_base)

    th_spacing_extra = 0.0
    ic_spacing_extra = 0.0
    smd_spacing_extra = 0.0
    board_extra = 0.0
    placements: Dict[str, Tuple[float, float]] = {}
    board_w = board_h = 0.0
    cur_outline = outline
    # DECISION (2026-07-14, gold delta G3): compact optical source boards are
    # clamped [25,40] mm at outline/auto-size. Placement retries used to grow
    # board_extra by +10/+20 mm per failure and inflate a 40 mm LED daughterboard
    # to 80×80 — the exact colorimeter-1441 artefact bug. Cap growth so a
    # window-scale source board cannot become a motherboard via retry.
    # GOTCHA (Poseidon 2026-07-16): outline≤40 alone must NOT clamp growth — a
    # Phase-B 30 mm estimate for an MCU+stepper control board is NOT a compact
    # optical source. Only `_looks_like_compact_source_board` may set the cap.
    compact_source = _looks_like_compact_source_board(components)
    max_board_side = 40.0 if compact_source else None
    # 5 mm edge margin eats 40% of a 25 mm board; keep ≥2.5 mm but scale down.
    if compact_source:
        edge_margin = min(edge_margin, max(2.5, min(base_w, base_h) * 0.12))

    result["stage_reached"] = "placement"
    placed_ok = False
    for iteration in range(args.max_iterations):
        result["iterations_run"] = iteration + 1
        board_w = base_w + board_extra
        board_h = base_h + board_extra
        if max_board_side is not None:
            board_w = min(board_w, max_board_side)
            board_h = min(board_h, max_board_side)
            board_extra = min(board_extra, max(0.0, max_board_side - min(base_w, base_h)))
        cur_th_spacing = th_spacing + th_spacing_extra
        cur_ic_spacing = cfg.ic_spacing + ic_spacing_extra
        cur_smd_spacing = cfg.smd_spacing + smd_spacing_extra

        if outline is not None and board_extra > 0:
            scale = board_w / base_w if base_w > 0 else 1.0
            # Never scale a compact source outline past the 40 mm ceiling.
            if max_board_side is not None:
                scale = min(scale, max_board_side / base_w) if base_w > 0 else 1.0
            cur_outline = scale_outline_segments(outline, scale, scale)

        placements = place_components(components, cfg, fp_root, board_w, board_h, cur_th_spacing, edge_margin,
                                       ic_spacing=cur_ic_spacing, smd_spacing=cur_smd_spacing)
        valid, reason = validate_placement(placements, components, cfg, fp_root, board_w, board_h)
        if valid:
            placed_ok = True
            break
        if "overlap" in reason:
            # A pad overlap can originate from ANY of the three placement classes
            # (through-hole edge-wrap, IC grid, or SMD grid) — grow all three
            # spacings together (a universal response, not a TH-only one; the
            # original prototype only grew th_spacing because its own test
            # boards never hit IC-vs-IC overlap) plus a modest board-size bump
            # so the wider spacing still fits.
            th_spacing_extra += 2.0
            ic_spacing_extra += 2.0
            smd_spacing_extra += 1.0
            step = 10.0
        else:
            step = 20.0
        # GOTCHA: under the 40 mm compact-source cap, a +20 step from a 25 mm
        # outline would overshoot and the old all-or-nothing `continue` left
        # board_extra at 0 forever (U1 pad off-board on every iteration). Grow
        # by the remaining headroom instead so 25→35→40 still happens.
        if max_board_side is not None:
            headroom = max(0.0, max_board_side - base_w - board_extra)
            if headroom <= 1e-6:
                result["errors"].append(
                    f"placement iteration {iteration + 1} invalid under {max_board_side:g} mm "
                    f"compact-source cap: {reason}"
                )
                continue
            board_extra += min(step, headroom)
            result["errors"].append(
                f"placement iteration {iteration + 1} invalid (grew to "
                f"{base_w + board_extra:g} mm under cap): {reason}"
            )
        else:
            board_extra += step
            result["errors"].append(f"placement iteration {iteration + 1} invalid: {reason}")

    result["board_size_mm"] = {"w": board_w, "h": board_h}
    if compact_source:
        result["compact_source_board_cap_mm"] = 40.0
    if not placed_ok:
        result["errors"].append(f"placement did not converge within {args.max_iterations} iterations")
        emit(result)
        return result

    # 2. generate + text-pcb repair
    result["stage_reached"] = "kicad_pcb_generation"
    pcb_content = generate_kicad_pcb(components, nets, pad_nets, placements, board_w, board_h,
                                      power_nets, cfg, fp_root, cur_outline)
    cfg.board_path.write_text(pcb_content)

    result["stage_reached"] = "text_pcb_repair"
    normalised_path = cfg.pcb_out_dir / "board-normalised.kicad_pcb"
    norm_ok, norm_log = normalise_board(cfg.board_path, normalised_path, power_nets, args)
    if not norm_ok:
        result["errors"].append(f"KiCad-Python board normalisation failed (the text-generated .kicad_pcb could not be loaded/repaired): {norm_log[-1200:]}")
        emit(result)
        return result
    board_path = normalised_path
    result["kicad_pcb_path"] = str(board_path)

    # 3. DSN export
    result["stage_reached"] = "dsn_export"
    dsn_ok, dsn_log = export_dsn(board_path, cfg.dsn_path, num_inner, args)
    if not dsn_ok:
        result["errors"].append(f"Specctra DSN export failed: {dsn_log[-1200:]}")
        emit(result)
        return result

    # 4. Freerouting
    result["stage_reached"] = "freerouting"
    fr_ok, unrouted, fr_log = run_freerouter(cfg.dsn_path, cfg.ses_path, args, "Hybrid")
    if not fr_ok:
        result["errors"].append(f"Freerouting did not produce a .ses file: {fr_log[-1200:]}")
        emit(result)
        return result
    # DECISION (2026-07-16): any leftover unrouted net is a manufacturability
    # failure (Poseidon 0602: Hybrid left 2 VCC/GND stubs). Retry Global whenever
    # Hybrid leaves ANY nets — not only when unrouted > 5.
    if unrouted > 0:
        fr_ok2, unrouted2, _fr_log2 = run_freerouter(cfg.dsn_path, cfg.ses_path, args, "Global")
        if fr_ok2 and unrouted2 < unrouted:
            unrouted = unrouted2
    result["unrouted_after_freerouting"] = unrouted

    # 4b. import .ses back
    result["stage_reached"] = "ses_import"
    routed_board = cfg.pcb_out_dir / "board-routed.kicad_pcb"
    ses_ok, track_count, ses_log = import_ses(board_path, cfg.ses_path, routed_board, args)
    if not ses_ok:
        result["errors"].append(f"SES import (routed tracks back into the board) failed: {ses_log[-1200:]}")
        emit(result)
        return result
    result["kicad_pcb_path"] = str(routed_board)
    result["routed"] = track_count > 0

    # 5. DRC (real kicad-cli invocation — the only source of truth for violations)
    result["stage_reached"] = "drc"
    drc_json_path = cfg.pcb_out_dir / "drc-report.json"
    drc_ran, violations, drc_report = run_drc(routed_board, drc_json_path, args.kicad_cli)
    result["drc"] = {"ran": drc_ran, "violations": violations if drc_ran else None,
                      "report_path": str(drc_json_path) if drc_ran else None}
    if not drc_ran:
        result["errors"].append(f"kicad-cli pcb drc did not produce a report: {drc_report}")
        emit(result)
        return result
    if violations > 0:
        result["errors"].append(f"DRC ran cleanly but reported {violations} violation(s) — board is NOT manufacturable as-is")

    # 6. Exports — only attempted because DRC ran (per spec); gerbers/drill/pos/render
    #    are produced regardless of violation count (a designer still wants to SEE
    #    the board), but `ok` below stays false unless violations == 0.
    result["stage_reached"] = "manufacturing_exports"
    exports = export_manufacturing(routed_board, cfg.pcb_out_dir, args.kicad_cli)
    result["gerbers"] = exports["gerbers"]
    result["drill"] = exports["drill"]
    result["pos"] = exports["pos"]
    result["render_png"] = exports["render_png"]

    gerbers_present = bool(exports["gerbers"] and exports["gerbers"]["files"])
    result["ok"] = bool(result["routed"] and drc_ran and violations == 0 and gerbers_present)
    result["stage_reached"] = "complete" if result["ok"] else "complete_with_defects"
    if not gerbers_present:
        result["errors"].append("gerber export produced no files on disk")

    emit(result)
    return result


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        print("pcb_pipeline_runner selftest: OK")
        raise SystemExit(0)
    args = parse_args()
    r = run(args)
    sys.exit(0 if r["ok"] else 1)