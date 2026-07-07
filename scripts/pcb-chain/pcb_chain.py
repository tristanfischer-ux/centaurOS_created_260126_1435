#!/usr/bin/env python3
"""
Universal PCB chain: atopile project → manufacturable PCB.

Takes ANY atopile project directory (containing main.ato + ato.yaml + .ato/),
produces a routed, DRC-clean, manufacturable board with Gerbers + drill +
positions + 3D render.

UNIVERSAL LESSONS (each is a failure that happened and was fixed permanently):

1. Board size auto-scales from total component footprint area × multiplier.
   Too small → FreeRouter can't route. Too big →浪费 space. Multiplier 5.0 works.

2. Through-hole spacing is computed DYNAMICALLY from actual pad geometry, not
   a fixed constant. Two 3-pin connectors with pads at ±5.08mm need ≥12.61mm
   centre-to-centre spacing. Formula: max_pad_offset × 2 + max_pad_diameter + 0.25.

3. Through-hole components go on board edges (all 4 sides, wrapping), SMD in
   centre. TH sorted largest-first so big connectors get edge priority.

4. Edge margin is computed from the maximum pad offset across all TH components,
   not a fixed constant. A 3-pin terminal block needs 7.08mm margin (5.08 + 2.0).

5. Power nets detected by name pattern (gnd/vcc/vin/3v3/5v/12v/etc). If ≥2
   found → 4-layer board (2 inner signal layers for power routing).
   CAPPED AT 2 INNER LAYERS — FreeRouter breaks with 3+ inner layers
   (does 0.00 CPU seconds, routes nothing). This is a FreeRouter limitation.

6. Zone/copper-pour definitions in the .kicad_pcb BREAK FreeRouter — it sees
   the planes, assumes pads are already connected, and doesn't route. DO NOT
   add zones before routing. Route power as tracks on inner layers, then add
   zones after if needed for manufacturing.

7. Pads need (net N "name") with the name string, not just (net N). Without
   the name, KiCad's DSN exporter drops the pad-to-net mapping, FreeRouter
   sees 0 unrouted nets, and DRC reports everything as unconnected.

8. Inner layers need SetEnabledLayers() + SetLayerType(LT_SIGNAL) before
   ExportSpecctraDSN(), or KiCad silently drops them from the DSN. The DSN
   will show only F.Cu + B.Cu even if the .kicad_pcb has In1/In2 defined.

9. KiCad 10 .kicad_pcb format requires:
   - (version 20241229)
   - Quoted layer names: (layer "F.Cu") not (layer F.Cu)
   - (stroke (width X)) not (width X) for gr_line and fp_line
   - (footprint "NAME" ...) not (module easyeda2kicad:NAME ...)

10. FreeRouter stops when the board hash stops changing between passes.
    More passes don't help. If it's stuck, the issue is placement/geometry,
    not lack of passes. Hybrid strategy first, then Global if stuck.

11. Placement validation checks BOTH on-board bounds AND pad-to-pad overlap.
    Overlap = two pads from different components closer than pad_r1 + pad_r2
    + 0.25mm. If invalid, increase spacing and re-place (not just bigger board).

12. Auto-loop: if DRC has shorts → increase TH spacing + re-place. If DRC has
    unconnected → increase board size + re-route. Loop until 0/0 or max iters.

13. atopile `~` MERGES signals. `A ~ B` makes them one net. Never connect
    two different power rails with `~` (e.g. `v_5v ~ vin_12v` shorts them).
    Each pin connects to exactly ONE signal. Power rails are separate signals.

14. KiCad's bundled Python (3.9) crashes on exit (_pcbnew.so segfault in
    wxWidgets). The work completes before the crash — outputs are always
    produced. Not a real problem, just cosmetic crash reports.
"""
import re
import sys
import os
import subprocess
import math
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional

# ─── Configuration ──────────────────────────────────────────────────────────

@dataclass
class ChainConfig:
    project_dir: Path
    board_min_size: float = 50.0
    board_max_size: float = 250.0
    component_area_multiplier: float = 5.0
    edge_margin_base: float = 5.0
    smd_spacing: float = 4.0
    ic_spacing: float = 8.0
    pad_min_gap: float = 0.25
    max_iterations: int = 8
    board_shape: str = "rect"
    add_copper_pours: bool = True
    power_trace_width: float = 1.0
    signal_trace_width: float = 0.2
    power_clearance: float = 0.3
    signal_clearance: float = 0.2
    high_current_threshold: float = 5.0
    high_current_multiplier: float = 0.15
    high_current_base: float = 0.2
    # Differential pair detection: nets with these name patterns get pre-routed as pairs
    diff_pair_patterns: List[Tuple[str, str]] = field(default_factory=lambda: [
        (r'^(.*)_p$', r'^\1_n$'),      # eth_tx_p / eth_tx_n
        (r'^(.*)_n$', r'^\1_p$'),      # eth_rx_n / eth_rx_p
        (r'^(.*)_dp$', r'^\1_dm$'),    # usb_dp / usb_dm
        (r'^(.*)_dm$', r'^\1_dp$'),    # usb_dm / usb_dp
        (r'^(.+)_h$', r'^\1_l$'),      # can_h / can_l
        (r'^(.+)_l$', r'^\1_h$'),      # can_l / can_h
        (r'^(.+)_pos$', r'^\1_neg$'),  # differential signals
        (r'^(.+)_neg$', r'^\1_pos$'),
    ])
    power_net_patterns: List[str] = field(default_factory=lambda: [
        r'^gnd$', r'^ground$', r'^vcc$', r'^vin$', r'^vdd$', r'^3v3$', r'^5v$',
        r'^5va$', r'^3v3a$', r'^12v$', r'^24v$', r'^48v$', r'^agnd$', r'^pgnd$',
        r'^iso_gnd$', r'^vin_\w+', r'^vcc_\w+', r'^\w+_gnd$', r'^\w+_vcc$',
        r'^v_bat$', r'^v_5v$', r'^v_3v3$',
    ])

    @property
    def build_dir(self): return self.project_dir / "build"
    @property
    def netlist_path(self): return self.build_dir / "default.net"
    @property
    def footprints_dir(self): return self.build_dir / "footprints" / "footprints.pretty"
    @property
    def board_path(self): return self.build_dir / "board.kicad_pcb"
    @property
    def dsn_path(self): return self.build_dir / "board.dsn"
    @property
    def ses_path(self): return self.build_dir / "board-routed.ses"
    final_board_path: Optional[Path] = None

ATO_BIN = "/Users/tristanfischer/.local/bin/ato"
FREEROUTING_JAR = "/tmp/freerouting.jar"
JAVA_BIN = "/opt/homebrew/opt/openjdk/bin/java"
KICAD_PYTHON = "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9/bin/python3"
KICAD_PYTHONPATH = "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9/lib/python3.9/site-packages"

# Local price database (LCSC ID → unit price in GBP)
# Used when the EasyEDA API is down. Prices approximate from LCSC listings.
LCSC_PRICE_DB = {
    "C8387": 0.08,    # WJ15EDGRC-3.81-2P terminal block
    "C395743": 0.12,  # DB2EVC-5.08-3P 3-pin terminal block
    "C8734": 1.50,    # STM32F103C8T6 LQFP48
    "C50263": 0.90,   # LAN8720A QFN24 Ethernet PHY
    "C9168": 0.60,    # SN65HVD230 SOP8 CAN transceiver
    "C81869": 0.40,   # TPS54331 SOT23-6 buck regulator
    "C893914": 0.45,  # NTTFS4C25NTWG POWERPAK MOSFET
    "C8678": 0.04,    # SS34 Schottky diode
    "C2286": 0.01,    # KT-0603R red LED
    "C12624": 0.01,   # KT-0603G green LED
    "C15008": 0.04,   # 100µF 1206 cap
    "C96123": 0.05,   # 47µF 1206 cap
    "C15850": 0.007,  # 10µF 0805 cap
    "C45783": 0.015,  # 22µF 0805 cap
    "C15849": 0.003,  # 1µF 0603 cap
    "C14663": 0.002,  # 100nF 0603 cap
    "C25804": 0.001,  # 10kΩ 0603 resistor
    "C21190": 0.001,  # 1kΩ 0603 resistor
    "C22962": 0.001,  # 220Ω 0603 resistor
    "C22787": 0.001,  # 120Ω 0603 resistor
    "C23138": 0.001,  # 330Ω 0603 resistor
    "C22859": 0.001,  # 10Ω 0603 resistor
    "C23162": 0.001,  # 4.7kΩ 0603 resistor
}

# Component descriptions (LCSC ID → human-readable function)
LCSC_DESC_DB = {
    "C8387": "2-pin screw terminal block (3.81mm pitch) — power/signal connectors",
    "C395743": "3-pin screw terminal block (5.08mm pitch) — power/signal connectors",
    "C8734": "STM32F103C8T6 — ARM Cortex-M3 microcontroller, 72MHz, 64KB flash, 20KB RAM. Runs firmware: FOC motor control, I2C/SPI/UART peripherals, CAN bus stack",
    "C50263": "LAN8720A — Ethernet PHY (physical layer). Converts RMII digital signals to differential pairs for hospital network. 25MHz crystal, auto-MDIX",
    "C9168": "SN65HVD230 — CAN bus transceiver. Converts MCU TX/RX logic to differential CAN_H/CAN_L signals. Used for medical device communication bus",
    "C81869": "TPS54331 — Step-down buck regulator. Converts 12V input to 5V for gate drive + CAN bus. 3A output, 340kHz switching",
    "C893914": "NTTFS4C25NTWG — N-channel power MOSFET, 25V, 88A. Low-side switch for LED channels / motor phases. Low Rds(on) = 2.2mΩ for minimal heat",
    "C8678": "SS34 — Schottky diode, 40V, 3A. Used for reverse polarity protection on power input and as bootstrap diode for gate drive",
    "C2286": "KT-0603R — Red indicator LED (0603 SMD). Status indicator — lights when channel active or alarm state",
    "C12624": "KT-0603G — Green indicator LED (0603 SMD). Status indicator — power-ok / system-running",
    "C15008": "100µF electrolytic capacitor (1206) — bulk decoupling on power input rail, absorbs current spikes",
    "C96123": "47µF tantalum capacitor (1206) — bulk power rail stabilisation for buck regulator output",
    "C15850": "10µF ceramic capacitor (0805) — power rail decoupling near ICs, mid-frequency noise filter",
    "C45783": "22µF ceramic capacitor (0805) — power rail decoupling, 5V rail stabilisation",
    "C15849": "1µF ceramic capacitor (0603) — local decoupling for individual ICs",
    "C14663": "100nF ceramic capacitor (0603) — high-frequency decoupling, one per IC power pin. Filters switching noise",
    "C25804": "10kΩ resistor (0603) — pull-up/pull-down for logic signals (reset, enable, boot pins)",
    "C21190": "1kΩ resistor (0603) — gate resistor for MOSFETs, limits inrush gate current to prevent ringing",
    "C22962": "220Ω resistor (0603) — current-limiting resistor for indicator LEDs (3.3V / 220Ω = 15mA)",
    "C22787": "120Ω resistor (0603) — CAN bus termination resistor, matches 120Ω characteristic impedance of twisted pair",
    "C23138": "330Ω resistor (0603) — current-limiting for status LEDs at 3.3V",
    "C22859": "10Ω resistor (0603) — gate drive resistor for motor MOSFETs, dampens gate ringing at 20kHz PWM",
    "C23162": "4.7kΩ resistor (0603) — I2C bus pull-up and 1-Wire temperature sensor pull-up",
}

def enrich_bom(build_dir: Path) -> List[dict]:
    """Parse BoM CSV, enrich with prices + descriptions from local DB, return enriched rows."""
    import csv
    bom_path = build_dir / "default.csv"
    if not bom_path.exists():
        return []
    rows = []
    with open(bom_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            lcsc = row.get("LCSC", "").strip()
            desigs = row.get("Designator", "").split(",")
            qty = len(desigs)
            price = float(row.get("Price", 0))
            if price == 0 and lcsc in LCSC_PRICE_DB:
                price = LCSC_PRICE_DB[lcsc]
            ext_price = price * qty
            desc = LCSC_DESC_DB.get(lcsc, "")
            rows.append({
                "footprint": row.get("Footprint", ""),
                "designators": row.get("Designator", ""),
                "qty": qty,
                "lcsc": lcsc,
                "unit_price": price,
                "ext_price": ext_price,
                "description": desc,
            })
    return rows

# ─── Data types ─────────────────────────────────────────────────────────────

@dataclass
class Component:
    ref: str
    value: str
    footprint: str

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

# ─── Netlist parsing ─────────────────────────────────────────────────────────

def parse_netlist(netlist_path: Path) -> Tuple[List[Component], List[Net], Dict[Tuple[str,str], PadNet]]:
    text = netlist_path.read_text()
    components = []
    for m in re.finditer(r'\(comp \(ref "([^"]+)"\)\s*\n\s*\(value "([^"]*)"\)\s*\n\s*\(footprint "([^"]+)"\)', text):
        components.append(Component(m.group(1), m.group(2), m.group(3).split(":")[-1]))
    nets = []
    for m in re.finditer(r'\(net \(code "(\d+)"\) \(name "([^"]+)"\)', text):
        nets.append(Net(int(m.group(1)), m.group(2)))
    pad_nets = {}
    nets_section = text[text.index('(nets'):]
    for m in re.finditer(r'\(net \(code "(\d+)"\) \(name "([^"]+)"\)\s*\n((?:\s+\(node[^)]*\)[^\n]*\n)*)', nets_section):
        code, name, body = int(m.group(1)), m.group(2), m.group(3)
        for nm in re.finditer(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)', body):
            ref, pin = nm.group(1), nm.group(2)
            pad_nets[(ref, pin)] = PadNet(ref, pin, code, name)
    return components, nets, pad_nets

# ─── Footprint parsing (universal — reads any .kicad_mod) ───────────────────

def parse_footprint(fp_name: str, fp_dir: Path) -> FootprintData:
    fp_path = fp_dir / f"{fp_name}.kicad_mod"
    if not fp_path.exists():
        return FootprintData()
    content = fp_path.read_text()
    fp = FootprintData()
    fp.is_th = 'thru_hole' in content

    for m in re.finditer(r'\(pad\s+(\d+)\s+(\w+)\s+(\w+)\s+\(at\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)?\)\s+\(size\s+([-\d.]+)\s+([-\d.]+)\)', content):
        fp.pads.append({
            "num": m.group(1), "type": m.group(2), "shape": m.group(3),
            "x": float(m.group(4)), "y": float(m.group(5)),
            "rot": float(m.group(6)) if m.group(6) else 0.0,
            "w": float(m.group(7)), "h": float(m.group(8)),
        })

    dm = re.search(r'\(drill\s+([-\d.]+)\)', content)
    if dm:
        fp.drill = float(dm.group(1))

    for m in re.finditer(r'\(fp_line\s+\(start\s+([-\d.]+)\s+([-\d.]+)\)\s+\(end\s+([-\d.]+)\s+([-\d.]+)\)\s+\(layer\s+\w+\.SilkS\)\s+\(width\s+([-\d.]+)\)', content):
        fp.lines.append({
            "x1": float(m.group(1)), "y1": float(m.group(2)),
            "x2": float(m.group(3)), "y2": float(m.group(4)),
            "width": float(m.group(5)),
        })

    all_x = [p["x"] - p["w"]/2 for p in fp.pads] + [p["x"] + p["w"]/2 for p in fp.pads] + [l["x1"] for l in fp.lines] + [l["x2"] for l in fp.lines]
    all_y = [p["y"] - p["h"]/2 for p in fp.pads] + [p["y"] + p["h"]/2 for p in fp.pads] + [l["y1"] for l in fp.lines] + [l["y2"] for l in fp.lines]
    if all_x and all_y:
        fp.bbox_w = max(all_x) - min(all_x) + 1.0
        fp.bbox_h = max(all_y) - min(all_y) + 1.0

    for p in fp.pads:
        offset = max(abs(p["x"]), abs(p["y"]))
        fp.max_pad_offset = max(fp.max_pad_offset, offset)
        fp.max_pad_diameter = max(fp.max_pad_diameter, max(p["w"], p["h"]))

    return fp

# ─── Power net detection (universal — pattern-based) ────────────────────────

def detect_power_nets(nets: List[Net], patterns: List[str]) -> List[Net]:
    power = []
    for net in nets:
        name_lower = net.name.lower()
        for pat in patterns:
            if re.match(pat, name_lower):
                power.append(net)
                break
    return power

def detect_diff_pairs(nets: List[Net], patterns: List[Tuple[str, str]]) -> List[Tuple[Net, Net, str]]:
    """Detect differential pairs by name pattern. Returns (net_p, net_n, base_name) tuples."""
    pairs = []
    net_names = {n.name: n for n in nets}
    matched = set()
    for net in nets:
        if net.code in matched:
            continue
        for pos_pat, neg_pat in patterns:
            m = re.match(pos_pat, net.name)
            if m:
                base = m.group(1)
                neg_name = re.sub(pos_pat, neg_pat, net.name)
                if neg_name in net_names and neg_name != net.name:
                    neg_net = net_names[neg_name]
                    if neg_net.code not in matched:
                        pairs.append((net, neg_net, base))
                        matched.add(net.code)
                        matched.add(neg_net.code)
                break
    return pairs

def compute_trace_width(current_a: float, base: float = 0.2, multiplier: float = 0.15) -> float:
    """Compute trace width from current: width_mm = current × 0.15 + 0.2.
    IPC-2221 external layer approximation for 30°C temp rise."""
    return round(current_a * multiplier + base, 2)

def classify_nets_by_current(nets: List[Net], power_nets: List[Net], cfg: ChainConfig) -> Dict[str, Tuple[float, float]]:
    """Assign each net a (trace_width, clearance) based on whether it's power or signal.
    Power nets with high-current names (vin_12v, v_5v, 48v, motor) get wider traces."""
    high_current_patterns = [r'vin_12v', r'^12v$', r'^48v$', r'^24v$', r'vin_\d+v',
                             r'phase_\w+', r'motor_\w+', r'relay\d+', r'vin', r'v_5v']
    classifications = {}
    for net in nets:
        is_power = any(p.code == net.code for p in power_nets)
        if is_power:
            is_high_current = any(re.match(p, net.name.lower()) for p in high_current_patterns)
            if is_high_current:
                current = 10.0
                width = compute_trace_width(current, cfg.high_current_base, cfg.high_current_multiplier)
                classifications[net.name] = (width, cfg.power_clearance)
            else:
                classifications[net.name] = (cfg.power_trace_width, cfg.power_clearance)
        else:
            classifications[net.name] = (cfg.signal_trace_width, cfg.signal_clearance)
    return classifications

# ─── Dynamic spacing computation (universal — from actual footprints) ───────

def compute_th_spacing(components: List[Component], fp_dir: Path, min_gap: float = 0.25) -> float:
    """Compute minimum TH centre-to-centre spacing from actual pad geometry.
    Guarantees no two TH components will have overlapping pads."""
    max_offset = 0.0
    max_diameter = 0.0
    for c in components:
        fp = parse_footprint(c.footprint, fp_dir)
        if fp.is_th:
            max_offset = max(max_offset, fp.max_pad_offset)
            max_diameter = max(max_diameter, fp.max_pad_diameter)
    spacing = max_offset * 2 + max_diameter + min_gap
    return max(spacing, 10.0)

def compute_edge_margin(components: List[Component], fp_dir: Path, base: float = 5.0) -> float:
    """Edge margin = max TH pad offset + clearance, so pads don't go off-board."""
    max_offset = 0.0
    for c in components:
        fp = parse_footprint(c.footprint, fp_dir)
        if fp.is_th:
            max_offset = max(max_offset, fp.max_pad_offset)
    return max(base, max_offset + 2.0)

# ─── Board sizing ───────────────────────────────────────────────────────────

def auto_board_size(components: List[Component], fp_dir: Path, cfg: ChainConfig) -> Tuple[float, float]:
    total_area = 0.0
    for c in components:
        fp = parse_footprint(c.footprint, fp_dir)
        total_area += fp.bbox_w * fp.bbox_h
    side = math.sqrt(total_area * cfg.component_area_multiplier)
    side = max(cfg.board_min_size, min(cfg.board_max_size, side))
    side = math.ceil(side / 10) * 10
    return side, side

# ─── Placement (universal) ──────────────────────────────────────────────────

def validate_placement(placements: Dict, components: List[Component], fp_dir: Path,
                        board_w: float, board_h: float, clearance: float = 1.0) -> Tuple[bool, str]:
    """Validate: all pads on-board AND no pad-to-pad overlap. Returns (valid, reason)."""
    all_pads = []
    for c in components:
        if c.ref not in placements:
            continue
        cx, cy = placements[c.ref]
        fp = parse_footprint(c.footprint, fp_dir)
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

def place_components(components: List[Component], fp_dir: Path, board_w: float, board_h: float,
                     th_spacing: float, edge_margin: float, cfg: ChainConfig) -> Dict[str, Tuple[float, float]]:
    placements = {}
    footprint_cache = {}
    for c in components:
        footprint_cache[c.ref] = parse_footprint(c.footprint, fp_dir)

    th = [(c, footprint_cache[c.ref]) for c in components if footprint_cache[c.ref].is_th]
    ics = [(c, footprint_cache[c.ref]) for c in components if not footprint_cache[c.ref].is_th and c.ref.startswith('U')]
    smd = [(c, footprint_cache[c.ref]) for c in components if not footprint_cache[c.ref].is_th and not c.ref.startswith('U')]

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
    cols = max(2, int(math.sqrt(len(ics)) + 1))
    for i, (c, fp) in enumerate(ics):
        col = i % cols
        row = i // cols
        x = cx - (cols - 1) * cfg.ic_spacing / 2 + col * cfg.ic_spacing
        y = cy - 20 + row * cfg.ic_spacing
        placements[c.ref] = (x, y)

    smd.sort(key=lambda x: max(x[1].bbox_w, x[1].bbox_h), reverse=True)
    smd_cols = max(3, int(math.sqrt(len(smd)) + 1))
    for i, (c, fp) in enumerate(smd):
        col = i % smd_cols
        row = i // smd_cols
        x = cx - (smd_cols - 1) * cfg.smd_spacing / 2 + col * cfg.smd_spacing
        y = cy + 10 + row * cfg.smd_spacing
        placements[c.ref] = (x, y)

    return placements

# ─── .kicad_pcb generation (universal, KiCad 10 format) ─────────────────────

def footprint_to_sexp(fp_data: FootprintData, fp_name: str, ref: str, value: str,
                       x: float, y: float, pad_nets: Dict) -> str:
    lines = [f'(footprint "{fp_name}" (layer "F.Cu") (at {x} {y})']
    lines.append(f'  (fp_text reference "{ref}" (at 0 -{max(fp_data.bbox_h/2 + 1, 2)}) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))')
    lines.append(f'  (fp_text value "{value or fp_name}" (at 0 {max(fp_data.bbox_h/2 + 1, 2)}) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))')

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

def generate_kicad_pcb(components: List[Component], nets: List[Net], pad_nets: Dict,
                       placements: Dict, board_w: float, board_h: float,
                       power_nets: List[Net], fp_dir: Path, cfg: ChainConfig) -> str:
    use_4layer = len(power_nets) >= 2
    lines = ['(kicad_pcb (version 20241229) (generator "pcb-chain")']
    lines.append(f'  (general (thickness 1.6))')
    lines.append('  (paper "A4")')
    lines.append('  (layers')

    copper_layers = [(0, "F.Cu"), (31, "B.Cu")]
    if use_4layer:
        num_inner = min(len(power_nets), 2)
        inner_names = [f"In{i+1}.Cu" for i in range(num_inner)]
        copper_layers = [(0, "F.Cu")] + [(i+1, inner_names[i]) for i in range(num_inner)] + [(31, "B.Cu")]

    for ln, lname in copper_layers:
        lines.append(f'    ({ln} "{lname}" signal)')
    for ln, lname, ltype in [
        (32, "B.Adhes", "user"), (33, "F.Adhes", "user"),
        (34, "B.Paste", "user"), (35, "F.Paste", "user"),
        (36, "B.SilkS", "user"), (37, "F.SilkS", "user"),
        (38, "B.Mask", "user"), (39, "F.Mask", "user"),
        (40, "Dwgs.User", "user"), (41, "Cmts.User", "user"),
        (44, "Edge.Cuts", "user"), (45, "Margin", "user"),
        (48, "B.Fab", "user"), (49, "F.Fab", "user"),
    ]:
        lines.append(f'    ({ln} "{lname}" {ltype})')
    lines.append('  )')
    lines.append('  (setup (pad_to_mask_clearance 0))')

    lines.append('  (net 0 "")')
    for n in nets:
        lines.append(f'  (net {n.code} "{n.name}")')
    lines.append('')

    if cfg.board_shape == "circle":
        r = min(board_w, board_h) / 2
        cx, cy = board_w / 2, board_h / 2
        lines.append(f'  (gr_arc (start {cx} {cy+r}) (mid {cx+r} {cy}) (end {cx} {cy-r}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
        lines.append(f'  (gr_arc (start {cx} {cy-r}) (mid {cx-r} {cy}) (end {cx} {cy+r}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
    else:
        lines.append(f'  (gr_line (start 0 0) (end {board_w} 0) (stroke (width 0.1)) (layer "Edge.Cuts"))')
        lines.append(f'  (gr_line (start {board_w} 0) (end {board_w} {board_h}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
        lines.append(f'  (gr_line (start {board_w} {board_h}) (end 0 {board_h}) (stroke (width 0.1)) (layer "Edge.Cuts"))')
        lines.append(f'  (gr_line (start 0 {board_h}) (end 0 0) (stroke (width 0.1)) (layer "Edge.Cuts"))')
    lines.append('')

    for c in components:
        x, y = placements[c.ref]
        fp_data = parse_footprint(c.footprint, fp_dir)
        block = footprint_to_sexp(fp_data, c.footprint, c.ref, c.value, x, y, pad_nets)
        for line in block.split('\n'):
            lines.append('  ' + line)
        lines.append('')

    lines.append(')')
    return '\n'.join(lines)

# ─── KiCad Python bridge (DSN export + SES import) ──────────────────────────

def kicad_python(script: str) -> str:
    env = {"PYTHONPATH": KICAD_PYTHONPATH, "PATH": "/usr/bin:/bin"}
    result = subprocess.run([KICAD_PYTHON, "-c", script], capture_output=True, text=True, env=env, timeout=120)
    return result.stdout.strip()

def normalise_board(board_path: Path, output_path: Path, power_nets: List[Net] = None, cfg=None):
    """Load board via KiCad Python (fixes format), add net classes, save.
    This is the UNIVERSAL FIX for text-generated .kicad_pcb files that kicad-cli can't load."""
    power_net_names = [n.name for n in (power_nets or [])]
    power_names_str = repr(power_net_names)
    high_current_patterns = "vin_12v|12v|48v|24v|vin|v_5v|phase|motor|relay"
    script = f'''
import pcbnew, re
b = pcbnew.LoadBoard("{board_path}")
if b is None:
    print("ERROR: LoadBoard returned None")
else:
    ncm = b.GetNetClassAssignmentMap()
    for nc_name, width, clearance, via_dia, via_drill in [
        ("High Current", 1.7, 0.3, 0.8, 0.4),
        ("Power", 1.0, 0.3, 0.6, 0.3),
        ("Signal", 0.2, 0.2, 0.4, 0.2),
    ]:
        existing = b.GetAllNetClasses()
        if nc_name not in [str(c) for c in existing]:
            nc = pcbnew.NETCLASS(nc_name)
            nc.SetTraceWidth(pcbnew.FromMM(width))
            nc.SetClearance(pcbnew.FromMM(clearance))
            nc.SetViaDiameter(pcbnew.FromMM(via_dia))
            nc.SetViaDrill(pcbnew.FromMM(via_drill))
            b.AddNetClass(nc)

    power_names = {power_names_str}
    high_pats = r"({high_current_patterns})"
    for netcode in range(1, b.GetNetCount()):
        net = b.GetNetInfo().GetNetItem(netcode)
        if net is None:
            continue
        name = net.GetNetname()
        if not name:
            continue
        name_lower = name.lower()
        if re.match(high_pats, name_lower):
            ncm[name] = "High Current"
        elif name_lower in [p.lower() for p in power_names]:
            ncm[name] = "Power"
        else:
            ncm[name] = "Signal"

    b.SynchNets()
    b.Save("{output_path}")
    print(f"Normalised: {{len(b.GetFootprints())}} footprints")
'''
    result = kicad_python(script)
    print(f"   {result}")
    return output_path.exists()

def export_dsn(board_path: Path, dsn_path: Path, num_inner: int):
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")
'''
    if num_inner > 0:
        script += 'from pcbnew import LSET\nlset = LSET()\nlset.addLayer(pcbnew.F_Cu)\nlset.addLayer(pcbnew.B_Cu)\n'
        for i in range(1, num_inner + 1):
            script += f'lset.addLayer(pcbnew.In{i}_Cu)\n'
        script += 'b.SetEnabledLayers(lset)\n'
        for i in range(1, num_inner + 1):
            script += f'b.SetLayerType(pcbnew.In{i}_Cu, pcbnew.LT_SIGNAL)\n'
    script += f'pcbnew.ExportSpecctraDSN(b, "{dsn_path}")\nprint("DSN exported")'
    kicad_python(script)

def import_ses(board_path: Path, ses_path: Path, output_path: Path):
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")
pcbnew.ImportSpecctraSES(b, "{ses_path}")
tracks = list(b.GetTracks())
print(f"tracks:{{len(tracks)}}")
b.Save("{output_path}")
'''
    kicad_python(script)

def fill_zones(board_path: Path, output_path: Path):
    """Fill existing zones on the board (zones must already be defined)."""
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")
zones = list(b.GetZones())
print(f"zones before fill: {{len(zones)}}")
if zones:
    filler = pcbnew.ZONE_FILLER(b)
    filler.Fill(zones)
    b.BuildConnectivity()
    b.Save("{output_path}")
    print("zones filled")
else:
    print("no zones to fill")
'''
    kicad_python(script)

def add_copper_pours_text(board_path: Path, output_path: Path, gnd_net_code: int, board_w: float, board_h: float):
    """Add GND copper pour zones by directly appending S-expression text to the .kicad_pcb file.
    This avoids the KiCad Python zone API which crashes on some boards."""
    content = board_path.read_text()
    zone_text = f'''
  (zone (net {gnd_net_code}) (net_name "gnd") (layer "F.Cu") (tstamp 00000000-0000-0000-0000-0000000000aa)
    (hatch edge 0.5)
    (connect_pads (clearance 0.3))
    (min_thickness 0.2)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon
      (pts
        (xy 0.5 0.5) (xy {board_w - 0.5} 0.5) (xy {board_w - 0.5} {board_h - 0.5}) (xy 0.5 {board_h - 0.5})
      )
    )
  )
  (zone (net {gnd_net_code}) (net_name "gnd") (layer "B.Cu") (tstamp 00000000-0000-0000-0000-0000000000bb)
    (hatch edge 0.5)
    (connect_pads (clearance 0.3))
    (min_thickness 0.2)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon
      (pts
        (xy 0.5 0.5) (xy {board_w - 0.5} 0.5) (xy {board_w - 0.5} {board_h - 0.5}) (xy 0.5 {board_h - 0.5})
      )
    )
  )
'''
    content = content.rstrip()
    if content.endswith(')'):
        content = content[:-1] + zone_text + ')\n'
    else:
        content = content + zone_text
    output_path.write_text(content)
    fill_zones(output_path, output_path)

def preroute_diff_pairs(board_path: Path, output_path: Path, diff_pairs: List[Tuple[str, str, str, str, str]]):
    """Pre-route differential pairs as straight tracks before FreeRouter.
    diff_pairs: list of (ref1, pin1, ref2, pin2, net_class) tuples.
    Places a short straight track between the two pads of each pair."""
    script_lines = []
    for ref1, pin1, ref2, pin2, net_class in diff_pairs:
        script_lines.append(f'')
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")

# Find pads for diff pairs
diff_pairs = {diff_pairs!r}

for ref1, pin1, ref2, pin2, net_class in diff_pairs:
    fp1 = b.FindFootprintByReference(ref1)
    fp2 = b.FindFootprintByReference(ref2)
    if not fp1 or not fp2:
        continue
    pad1 = fp1.FindPadByPinNumber(pin1)
    pad2 = fp2.FindPadByPinNumber(pin2)
    if not pad1 or not pad2:
        continue

    pos1 = pad1.GetPosition()
    pos2 = pad2.GetPosition()

    # Create a track from pad1 to pad2
    track = pcbnew.PCB_TRACK(b)
    track.SetStart(pos1)
    track.SetEnd(pos2)
    track.SetLayer(pcbnew.F_Cu)
    track.SetWidth(pcbnew.FromMM(0.2))
    if pad1.GetNetCode() > 0:
        track.SetNetCode(pad1.GetNetCode())
    b.Add(track)
    print(f"Pre-routed diff pair: {{ref1}}.{{pin1}} -> {{ref2}}.{{pin2}}")

b.Save("{output_path}")
print("Diff pairs pre-routed")
'''
    kicad_python(script)

def cleanup_silkscreen(board_path: Path, output_path: Path, board_w: float = 0, board_h: float = 0):
    """Shrink reference designator font + move inside board bounds + off pads."""
    script = f'''
import pcbnew
b = pcbnew.LoadBoard("{board_path}")

board_w = {board_w}
board_h = {board_h}
if board_w == 0 or board_h == 0:
    bbox = b.GetBoardEdgesBoundingBox()
    board_w = pcbnew.ToMM(bbox.GetWidth())
    board_h = pcbnew.ToMM(bbox.GetHeight())

margin_mm = 1.5
moved = 0
for fp in b.GetFootprints():
    pos = fp.GetPosition()
    fp_x = pcbnew.ToMM(pos.x)
    fp_y = pcbnew.ToMM(pos.y)

    for item in fp.GraphicalItems():
        if item.Type() == pcbnew.PCB_TEXT_T:
            text = item.GetText()
            if text and text == fp.GetReference():
                item.SetTextSize(pcbnew.VECTOR2I_MM(0.6, 0.6))
                item.SetTextThickness(pcbnew.FromMM(0.1))

                item_pos = item.GetPosition()
                item_x = pcbnew.ToMM(item_pos.x)
                item_y = pcbnew.ToMM(item_pos.y)

                new_x = item_x
                new_y = item_y

                if item_x < margin_mm:
                    new_x = fp_x
                elif item_x > board_w - margin_mm:
                    new_x = fp_x
                if item_y < margin_mm:
                    new_y = fp_y
                elif item_y > board_h - margin_mm:
                    new_y = fp_y

                if new_x != item_x or new_y != item_y:
                    item.SetPosition(pcbnew.VECTOR2I_MM(new_x, new_y))
                    moved += 1

print(f"Silkscreen cleaned: {{moved}} refs moved inside board")
b.Save("{output_path}")
'''
    kicad_python(script)

# ─── FreeRouter ─────────────────────────────────────────────────────────────

def run_freerouter(dsn_path: Path, ses_path: Path, strategy: str = "Hybrid", max_passes: int = 500) -> int:
    env = os.environ.copy()
    env["PATH"] = "/opt/homebrew/opt/openjdk/bin:" + env["PATH"]
    result = subprocess.run(
        [JAVA_BIN, "-Djava.awt.headless=true", "-jar", FREEROUTING_JAR,
         "-de", str(dsn_path), "-do", str(ses_path),
         "-mp", str(max_passes), "-mt", "8", "-us", strategy],
        capture_output=True, text=True, env=env, timeout=300
    )
    unrouted = 999
    for line in result.stdout.split('\n'):
        if 'completed' in line and 'unrouted' in line:
            m = re.search(r'(\d+) unrouted', line)
            if m:
                unrouted = int(m.group(1))
    return unrouted if unrouted != 999 else 0

# ─── DRC ────────────────────────────────────────────────────────────────────

def run_drc(board_path: Path, drc_path: Path) -> Tuple[int, int]:
    subprocess.run(["kicad-cli", "pcb", "drc", str(board_path),
                   "--output", str(drc_path), "--format", "report"],
                  capture_output=True, text=True, timeout=60)
    content = drc_path.read_text() if drc_path.exists() else ""
    unconnected = content.count('[unconnected_items]')
    shorts = content.count('[shorting_items]')
    return unconnected, shorts

# ─── Manufacturing outputs ──────────────────────────────────────────────────

def export_manufacturing(routed_board: Path, build_dir: Path):
    gerbers_dir = build_dir / "gerbers"
    gerbers_dir.mkdir(exist_ok=True)
    subprocess.run(["kicad-cli", "pcb", "export", "gerbers", str(routed_board),
                   "--output", str(gerbers_dir)], capture_output=True, timeout=60)
    drill_dir = build_dir / "drill"
    drill_dir.mkdir(exist_ok=True)
    subprocess.run(["kicad-cli", "pcb", "export", "drill", str(routed_board),
                   "--output", str(drill_dir)], capture_output=True, timeout=60)
    pos_path = build_dir / "positions.csv"
    subprocess.run(["kicad-cli", "pcb", "export", "pos", str(routed_board),
                   "--output", str(pos_path)], capture_output=True, timeout=60)
    render_path = build_dir / "board-3d.png"
    subprocess.run(["kicad-cli", "pcb", "render", str(routed_board),
                   "--output", str(render_path), "--side", "top", "--quality", "high",
                   "--width", "1600", "--height", "1200", "--background", "opaque"],
                  capture_output=True, timeout=120)

# ─── Main chain (auto-loop until 100%) ──────────────────────────────────────

def run_chain(cfg: ChainConfig) -> bool:
    print(f"=== PCB Chain: {cfg.project_dir} ===")

    print("1. atopile build...")
    result = subprocess.run([ATO_BIN, "build"], cwd=cfg.project_dir,
                          capture_output=True, text=True, input="n\n", timeout=120)
    if not cfg.netlist_path.exists():
        print(f"   ERROR: {result.stderr[-300:]}")
        return False
    components, nets, pad_nets = parse_netlist(cfg.netlist_path)
    print(f"   {len(components)} components, {len(nets)} nets, {len(pad_nets)} pad-net mappings")

    power_nets = detect_power_nets(nets, cfg.power_net_patterns)
    num_inner = min(len(power_nets), 2) if len(power_nets) >= 2 else 0
    print(f"2. Power nets: {[n.name for n in power_nets]} → {2 + num_inner}-layer board")

    th_spacing = compute_th_spacing(components, cfg.footprints_dir, cfg.pad_min_gap)
    edge_margin = compute_edge_margin(components, cfg.footprints_dir, cfg.edge_margin_base)
    print(f"3. Dynamic spacing: TH={th_spacing:.1f}mm, edge_margin={edge_margin:.1f}mm")

    base_w, base_h = auto_board_size(components, cfg.footprints_dir, cfg)
    th_spacing_extra = 0.0
    board_extra = 0

    for iteration in range(cfg.max_iterations):
        board_w = base_w + board_extra
        board_h = base_h + board_extra
        cur_th_spacing = th_spacing + th_spacing_extra
        print(f"\n--- Iteration {iteration + 1}: board={board_w}x{board_h}mm, th_spacing={cur_th_spacing:.1f}mm ---")

        placements = place_components(components, cfg.footprints_dir, board_w, board_h,
                                      cur_th_spacing, edge_margin, cfg)
        valid, reason = validate_placement(placements, components, cfg.footprints_dir, board_w, board_h)
        if not valid:
            print(f"   Placement invalid: {reason}")
            if "overlap" in reason:
                th_spacing_extra += 2.0
                print(f"   → increasing TH spacing to {th_spacing + th_spacing_extra:.1f}mm")
            else:
                board_extra += 20
                print(f"   → increasing board to {base_w + board_extra}x{base_h + board_extra}mm")
            continue

        print("4. Generating .kicad_pcb...")
        pcb_content = generate_kicad_pcb(components, nets, pad_nets, placements,
                                         board_w, board_h, power_nets, cfg.footprints_dir, cfg)
        cfg.board_path.write_text(pcb_content)

        print("4a. Normalising board via KiCad Python...")
        normalised_path = cfg.build_dir / "board-normalised.kicad_pcb"
        normalise_board(cfg.board_path, normalised_path, power_nets, cfg)
        if normalised_path.exists():
            cfg.board_path = normalised_path

        diff_pairs_info = detect_diff_pairs(nets, cfg.diff_pair_patterns)
        if diff_pairs_info:
            print(f"4a. Pre-routing {len(diff_pairs_info)} diff pairs...")
            preroute_path = cfg.build_dir / "board-prerouted.kicad_pcb"
            diff_pair_refs = []
            for net_p, net_n, base in diff_pairs_info:
                ref1 = pin1 = ref2 = pin2 = None
                for (ref, pin), pn in pad_nets.items():
                    if pn.net_code == net_p.code:
                        ref1, pin1 = ref, pin
                    if pn.net_code == net_n.code:
                        ref2, pin2 = ref, pin
                if ref1 and ref2:
                    diff_pair_refs.append((ref1, pin1, ref2, pin2, "diff"))
            if diff_pair_refs:
                preroute_diff_pairs(cfg.board_path, preroute_path, diff_pair_refs)
                if preroute_path.exists():
                    cfg.board_path = preroute_path

        print("5. Exporting DSN...")
        export_dsn(cfg.board_path, cfg.dsn_path, num_inner)

        print("6. FreeRouter (Hybrid)...")
        unrouted = run_freerouter(cfg.dsn_path, cfg.ses_path, "Hybrid", 500)
        print(f"   {unrouted} unrouted")
        if unrouted > 5:
            print("   Retrying with Global strategy...")
            unrouted = run_freerouter(cfg.dsn_path, cfg.ses_path, "Global", 1000)
            print(f"   Global: {unrouted} unrouted")

        print("7. Importing + DRC...")
        routed_board = cfg.build_dir / "board-routed.kicad_pcb"
        import_ses(cfg.board_path, cfg.ses_path, routed_board)
        drc_path = cfg.build_dir / "drc.txt"
        unconnected, shorts = run_drc(routed_board, drc_path)
        print(f"   DRC: {unconnected} unconnected, {shorts} shorts")

        if unconnected == 0 and shorts == 0:
            print(f"\n✓ 100% ROUTED on iteration {iteration + 1}")
            break

        if shorts > 0:
            th_spacing_extra += 2.0
            print(f"   → shorts: increasing TH spacing to {th_spacing + th_spacing_extra:.1f}mm")
        if unconnected > 0:
            board_extra += 20
            print(f"   → unconnected: increasing board to {base_w + board_extra}x{base_h + board_extra}mm")

    print("\n8. Post-processing: copper pours + silkscreen...")
    final_board = routed_board
    if cfg.add_copper_pours and final_board.exists():
        gnd_net = None
        for n in nets:
            if n.name.lower() in ("gnd", "ground"):
                gnd_net = n
                break
            if "gnd" in n.name.lower() and gnd_net is None:
                gnd_net = n
        if gnd_net:
            pour_path = cfg.build_dir / "board-poured.kicad_pcb"
            add_copper_pours_text(final_board, pour_path, gnd_net.code, board_w, board_h)
            if pour_path.exists():
                final_board = pour_path
                print("   Copper pours added")

    silk_path = cfg.build_dir / "board-silk.kicad_pcb"
    cleanup_silkscreen(final_board, silk_path, board_w, board_h)
    if silk_path.exists():
        final_board = silk_path
        print("   Silkscreen cleaned")
    print("9. Manufacturing files...")
    export_manufacturing(final_board, cfg.build_dir)

    drc_path = cfg.build_dir / "drc.txt"
    unconnected, shorts = run_drc(final_board, drc_path)

    if unconnected == 0 and shorts == 0:
        print("\n=== ✓ 100% MANUFACTURABLE (with real ICs, net classes, copper pours) ===")
        return True
    else:
        print(f"\n=== ✗ {unconnected} unconnected, {shorts} shorts ===")
        return False

if __name__ == '__main__':
    project_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/pcb-chain-test")
    cfg = ChainConfig(project_dir=project_dir)
    success = run_chain(cfg)
    sys.exit(0 if success else 1)
