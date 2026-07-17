#!/usr/bin/env python3
"""draw_interconnect.py — handheld device wiring / signal Interconnect drawing.

INTENT (2026-07-14): plant GA / P&ID is the wrong genre for a fluid-less handheld.
This sheet is the glanceable blueprint: Power → PCB → Optical → HMI → Enclosure
with typed edges sourced from the BoM principals + contract topology.

DECISION (2026-07-14, Tristan: "complete disaster" / bird's-nest scored 10):
  1. Nodes = BoM PRINCIPALS only (≤ ~20), never the full connection-ledger adjacency
     dump (colorimeter shipped 36 nodes / 51 edges → unreadable).
  2. Layout height is CONTENT-DRIVEN; title block + legend sit in a reserved band
     that NEVER overlaps node boxes (the previous fixed 900 px sheet clipped Power/
     PCB and overprinted the title on the legend).
  3. Edges are orthogonal (right → mid-X → left) so parallel runs don't paint a
     diagonal scribble across the sheet.
  4. A pure layout_metrics() proveCatch refuses the bird's-nest class — the Excel
     Interconnect score must read these metrics, never "SVG exists".

USAGE: python3 draw_interconnect.py <out_dir> [state.json]
OUTPUT: drawings/interconnect.svg (+ .png when a rasteriser is available)
Handheld pack only — generate_drawing_set skips this for plant / sealed_cabinet.
"""
from __future__ import annotations

import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))

import drawing_titleblock as _tb  # noqa: E402
from render_view_contract import (  # noqa: E402
    drawing_form_factor,
    is_fluid_less_instrument,
)

try:
    import draw_ga as _ga  # rasterise helper
except Exception:  # noqa: BLE001
    _ga = None  # type: ignore

_ISSUE_DATE = ""

# Hard ceiling — above this the sheet is a dump, not a drawing. proveCatch enforces.
MAX_PRINCIPAL_NODES = 18
MAX_EDGES = 28
# Reserved bottom band for legend + title block (px). Content must end above this.
TITLE_BAND_PX = 160
LEGEND_BAND_PX = 70
TOP_HEADER_PX = 90

# Order matters: Thermal before Optical so "sample block" is not mis-filed as
# optics; Actuation before PCB so "stepper driver board" is not a bare board
# dump; PCB before HMI so "Compute UI Module" is the board, not a display.
_BLOCK_RULES = (
    # INTENT (NinjaPCR 2026-07-15): TEC / sample block / heatsink are THERMAL
    # principals — not Optical (colorimeter "sample holder" stays Optical via
    # holder/cell/chamber below).
    ("Thermal", re.compile(
        r"\b(?:peltier|\btec\b|thermoelectric|heatsink|heat\s*sink|"
        r"sample\s*block|thermal\s*block|tube\s*block|lid\s*heater|"
        r"heated\s*lid|cooling\s*fan)\b", re.I)),
    # INTENT (Poseidon 2026-07-16): OPEN-array linear dosing — NEMA + screw
    # train is the Actuation column (not Optical, not a plant pump).
    # GOTCHA: do NOT match bare "stepper" — "Stepper Driver Board" is PCB.
    ("Actuation", re.compile(
        r"\b(?:stepper\s*motor|\bnema\b|lead\s*screw|leadscrew|"
        r"flexure\s*stage|sample\s*stage|stage\s*platform|"
        r"linear\s*carriage|plunger(?:\s*clamp)?|syringe(?:\s*barrel)?|"
        r"shaft\s*coupl|guide\s*rail)\b", re.I)),
    # GOTCHA: LED Source Board is OPTICAL (emitter on the bench), not Power.
    # Putting it in Power made the synthesised "DC rail" LED→MCU and a 1-node
    # Power column that still scored story_ok (Tristan rejected the fake 10).
    ("Optical", re.compile(
        r"\b(?:optic|optical|collimat|cuvette|wavelength|baffle|detector|"
        r"photodiode|filter\s*wheel|monochromat|sample\s*(?:holder|cell|chamber)|"
        r"objective|rms\s*objective|tube\s*assembly|camera|webcam|illumination|"
        r"focus\s*metric|"
        r"led\s*source|source\s*board|led\s*driver)\b", re.I)),
    ("Power", re.compile(
        r"\b(?:power|battery|usb|charger|regulator|dc\s*rail|psu|supply|"
        r"fuse|terminal\s*block|mains|bench\s*adapter)\b", re.I)),
    ("PCB", re.compile(
        r"\b(?:pcb|mcu|compute|sbc|single\s*board\s*computer|microcontroller|controller|board|afe|adc|"
        r"stepper\s*driver)\b", re.I)),
    ("HMI", re.compile(
        r"\b(?:display|hmi|\bui\s*module\b|touchscreen|touch\s*display|"
        r"button|bezel|screen|keypad)\b",
        re.I)),
    ("Enclosure", re.compile(
        r"\b(?:enclosure|housing|shell|lid|chassis|case|base\s*plate|"
        r"printed\s*main\s*body|main\s*body|instrument\s*body|"
        r"channel\s*frame|console\s*enclosure)\b", re.I)),
)
# Caps / lids are mechanical accessories — not the enclosure principal.
# Console / base plate ARE the OPEN-array mechanical story (no sealed shell).
_ENCLOSURE_SHELL_RE = re.compile(
    r"\b(?:enclosure\s*shell|housing|chassis|console\s*enclosure|base\s*plate|"
    r"printed\s*main\s*body|main\s*body|instrument\s*body)\b",
    re.I,
)
_ENCLOSURE_ACCESSORY_RE = re.compile(r"\b(?:cap|lid|shroud|bezel)\b", re.I)

_EDGE_STYLE = {
    "power": ("#c2410c", "2.0", ""),
    "signal": ("#2563eb", "1.5", "5,3"),
    "optical": ("#7c3aed", "1.7", "2,2"),
    "mechanical": ("#64748b", "1.2", "1,3"),
}

# Consumables / fasteners / loom parts are not interconnect NODES — a cable is an
# edge, not a box. Scoring a sheet 10 with "Qwiic Interconnect Cable" as a PCB
# principal is Goodhart (Tristan 2026-07-14).
_SKIP_NODE_RE = re.compile(
    r"\b(?:consumable|fastener\s*set|screw\s*kit|cable\s*tie|"
    r"interconnect\s*cable|qwiic|stemma\s*header|ribbon\s*cable|"
    r"wiring\s*harness|wire\s*harness|cable\s*assembly|sensor\s*cable|"
    r"ambient\s*light\s*cap|light\s*cap|cuvette\s*consumable|"
    r"(?:sensing|structure|control|energy|power(?:\s*distribution)?|"
    r"actuation|hmi|safety)[\w\s-]*subcomponent\s*\d+|"
    r"browser\s*ui\s*host\s*software|network\s*api\s*service|"
    r"source\s*board\s*connector|optical\s*window\s*seal|detector\s*mount\s*plate)\b", re.I,
)

# INTENT (NinjaPCR 1258): host peripherals + protection that gold-spine absorbs
# into the compute principal — listing them as nodes blew past MAX_PRINCIPAL_NODES
# (32 > 18) even after the Power story was correct.
_ABSORB_INTO_COMPUTE_NODE_RE = re.compile(
    r"wifi|wi[- ]?fi|flash\s*storage|firmware\s*(?:storage|watchdog)|debug\s*uart|"
    r"debug\s*interface|usb\s*(?:data|interface|power)|polyfuse|bulk\s*capacitor|"
    r"board\s*level\s*decoupling|decoupling|status\s*led|"
    r"current\s*sense|snubber|h[- ]?bridge|mosfet|dc\s*dc\s*regulator|"
    r"low\s*noise\s*regulator|\bldo\b|linear\s*regulator|"
    r"ferrite|emc\s*bead|esd\s*protection|"
    r"i2c\s*level\s*shifter|input\s*protection|control\s*switch|"
    r"fan\s*(?:tach|failure)|overtemp|thermal\s*fuse|estop|e[- ]?stop|"
    r"power\s*kill|protective\s*earth|\bpe\b|block\s*temperature|"
    r"temperature\s*sensor|sample\s*block\s*mount|tube\s*access|"
    r"lid\s*assembly(?!\s*heater)|host\s*interface|force\s*limit|"
    r"home\s*reference|endstop|mains\s*fuse|overcurrent|"
    r"status\s*indicator|low\s*battery\s*indicator|power\s*indicator(?:\s*led)?|"
    r"battery\s*included|host\s*power\s*rail|run\s*start|user\s*facing|foot\s*pad|"
    r"user\s*facing\s*legend|legend\s*plate|silk\s*screen|"
    r"mounting\s*bezel|actuation\s*kinematics|maintenance\s*service|"
    r"access\s*panel|stage\s*limit|stall\s*sense|motor\s*current\s*limit|"
    r"debug\s*interface|level\s*shifter|i2c\s*level|"
    r"blm\d+|ferrite\s*bead",
    re.I,
)
# GOTCHA (colorimeter 1236): "Host Power Rail On Compute Ui" / "Input Protection On
# Compute Ui" contain "Compute Ui" and were KEPT as compute principals — absorb never
# ran. Match the real MCU/compute host only; absorb-matched names always lose.
# GOTCHA (colorimeter 2008): BoM pinned "Adafruit Feather M0" instead of
# "Compute UI Module" — has_compute was False, absorb skipped, 27 nodes / 39 edges.
# Named MCU boards ARE the compute principal (catalogue pin, not a generic noun).
_COMPUTE_PRINCIPAL_NAME_RE = re.compile(
    r"^(?:compute\s*ui(?:\s*module)?|main\s*controller(?:\s*mcu)?|"
    r"microcontroller|\bmcu\b|processor(?:\s*board)?|"
    r"(?:adafruit\s+)?feather(?:\s+\w+)*|"
    r"arduino(?:\s+\w+)*|"
    r"(?:raspberry\s*pi\s+)?pico(?:\s+\w+)*|"
    r"esp32(?:\s*[- ]?\w+)*|teensy(?:\s+\w+)*|"
    r"rp2040(?:\s+\w+)*|samd(?:21|51)?(?:\s+\w+)*|"
    r"nrf52(?:\s+\w+)*|stm32(?:\s+\w+)*|"
    r"itsybitsy(?:\s+\w+)*|metro\s+m\d+(?:\s+\w+)*)"
    r"(?:\b|$)",
    re.I,
)
# INTENT (Poseidon): cradle/rail/screw are the motor's mechanical train — one
# Actuation principal (Stepper Motor), not six boxes that blow MAX_PRINCIPAL_NODES.
_ABSORB_INTO_STEPPER_NODE_RE = re.compile(
    r"lead\s*screw|leadscrew|linear\s*carriage|guide\s*rail|"
    r"plunger(?:\s*clamp)?|syringe(?:\s*barrel)?(?:\s*cradle)?|"
    r"shaft\s*coupl|channel\s*frame",
    re.I,
)


def _load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        with open(path) as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _classify_block(name: str) -> str:
    for label, rx in _BLOCK_RULES:
        if rx.search(name or ""):
            return label
    return "PCB"


# INTENT (2026-07-14 Tristan): colorimeter optical column sorted alphabetically
# put Collimator → Cuvette → LED → Detector — light does not travel that way.
# Canonical free-space order for a transmission colorimeter / photometer.
_OPTICAL_PATH_ORDER: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("led_source", re.compile(r"led\s*source|source\s*board|\bled\s*driver\b", re.I)),
    ("collimator", re.compile(r"collimat", re.I)),
    ("wavelength", re.compile(r"wavelength|filter\s*wheel|monochromat", re.I)),
    ("cuvette", re.compile(r"cuvette|sample\s*holder|sample\s*cell", re.I)),
    ("baffle", re.compile(r"baffle|stray\s*light", re.I)),
    ("detector", re.compile(r"detector|photodiode|optical\s*detector", re.I)),
)


def _optical_path_rank(name: str) -> int:
    for i, (_key, rx) in enumerate(_OPTICAL_PATH_ORDER):
        if rx.search(name or ""):
            return i
    return 50


def _rewrite_optical_path(
    nodes: dict[str, dict],
    edges: list[dict],
    seen: set[tuple[str, str, str]],
) -> list[dict]:
    """Replace unordered optical edges with LED→…→detector chain + net labels.

    @description A glanceable interconnect must show the physical light path
                 in order. Alphabetically-stacked Optical columns with random
                 purple edges Goodhart as "optical story present".
    """
    opt_keys = [
        k for k, n in nodes.items()
        if n.get("block") == "Optical" and _optical_path_rank(n.get("name") or "") < 50
    ]
    if len(opt_keys) < 2:
        return edges
    ordered = sorted(opt_keys, key=lambda k: (
        _optical_path_rank(nodes[k].get("name") or ""),
        nodes[k].get("tag") or "",
        k,
    ))
    # Drop prior optical edges among these principals — rebuild the chain.
    keep = [
        e for e in edges
        if not (
            e.get("kind") == "optical"
            and e.get("from") in opt_keys
            and e.get("to") in opt_keys
        )
    ]
    for e in list(seen):
        if e[2] == "optical" and e[0] in opt_keys and e[1] in opt_keys:
            seen.discard(e)
    labels = (
        "LED emission",
        "collimated beam",
        "wavelength select",
        "sample path",
        "baffled path",
        "to detector",
    )
    for i in range(len(ordered) - 1):
        a, b = ordered[i], ordered[i + 1]
        ek = (a, b, "optical")
        if ek in seen or (b, a, "optical") in seen:
            continue
        seen.add(ek)
        keep.append({
            "from": a, "to": b, "kind": "optical",
            "label": labels[min(i, len(labels) - 1)],
            "net": f"OPT-{i + 1}",
            # DECISION: not synthesised fiction — canonical product-class light path
            # (same honesty as schedule collapse). Counting these in synth_ratio
            # made a correct LED→detector chain fail story_ok at 46%.
            "synthesised": False,
            "basis": "canonical optical path order (LED→detector)",
        })
    return keep


def _stamp_edge_nets(edges: list[dict]) -> None:
    """INTENT: a wiring sheet without named nets is a silent block diagram.

    Stamps net/connector on every edge in-place so layout_metrics + SVG labels
    agree whether the graph came from topology or a unit-test fixture.
    """
    for e in edges:
        if e.get("net"):
            continue
        kind = e.get("kind") or ""
        lab = str(e.get("label") or "")
        if kind == "power":
            e["net"] = "VBUS" if re.search(r"usb|lipo|device power", lab, re.I) else "VLED"
            e["connector"] = e.get("connector") or (
                "J-USB" if e["net"] == "VBUS" else "J-LED"
            )
        elif kind == "signal":
            e["net"] = "I2C" if re.search(r"i2c|stemma|detector|display", lab, re.I) else "GPIO"
            e["connector"] = e.get("connector") or "J-STEMMA"
        elif kind == "optical":
            e["net"] = "OPT"
        elif kind == "mechanical":
            e["net"] = "MNT"


def _edge_kind(mech: str, service: str = "") -> str:
    # DECISION: prefer material_context (service) over mechanism — colorimeter
    # topology stamps mechanism="signal" even on optical paths / DC rails; the
    # truthful physics lives in material_context ("optical path…", "DC power rail…").
    blob = f"{service} {mech}".lower()
    if re.search(r"optical|free-space|guided light|light path|beam|photon", blob):
        return "optical"
    if re.search(r"electrical|power|dc\b|bus|usb|battery|rail", blob):
        return "power"
    if re.search(r"mechanical|mount|fasten|struct|hous|enclos", blob):
        return "mechanical"
    if re.search(r"signal|i2c|spi|uart|stemma|qwiic|data|sense|analogue|display|command", blob):
        return "signal"
    return "signal"


# Topology endpoints often use generic nouns; BoM uses product names. Map both ways.
_ENDPOINT_ALIASES: dict[str, tuple[str, ...]] = {
    "microcontroller": ("compute ui module", "mcu", "compute module"),
    "mcu": ("compute ui module", "microcontroller"),
    "compute ui module": ("microcontroller", "mcu"),
    "led source": ("led source board", "led driver"),
    "led source board": ("led source", "led driver"),
    "led driver": ("led source board", "led source"),
    "local display": ("display", "hmi", "compute ui module"),
    "enclosure shell": ("enclosure", "housing"),
    "enclosure": ("enclosure shell", "housing"),
}

# INTENT (2026-07-14): gold-spine absorbs discrete host lines into Compute UI
# Module / LED Source Board. Stale topology still names Usb Interface, DC DC
# Regulator, Microcontroller — map those endpoints onto the surviving principals
# so power/signal edges are not silently dropped (no Power column = fake story).
_HOST_INTO_COMPUTE_RE = re.compile(
    r"microcontroller|\bmcu\b|local\s*display|user\s*input|firmware\s*storage|"
    r"usb\s*(interface|power)|rechargeable\s*battery|battery\s*charge|"
    r"power\s*switch|control\s*switch|status\s*indicator|mounting\s*bezel|"
    r"power\s*indicator|overcurrent|input\s*fuse|dc\s*input\s*fuse|"
    r"thermal\s*cutoff|reverse\s*polarity|power\s*input\s*connector|"
    r"esd\s*protection|polyfuse|ferrite|dc\s*dc\s*regulator|"
    r"sensing\s*instrumentation\s*subcomponent|compute\s*ui",
    re.I,
)
_HOST_INTO_LED_RE = re.compile(
    r"\bled\s*driver\b|\bled\s*source\b(?!\s*board)",
    re.I,
)


def _bom_rows(state: dict) -> list[dict]:
    """Normalise requirementsBom whether it is a list or {rows:[…]}."""
    bom = state.get("requirementsBom")
    if isinstance(bom, list):
        rows = [b for b in bom if isinstance(b, dict)]
        if rows:
            return rows
    if isinstance(bom, dict):
        nested = bom.get("rows") or bom.get("items") or []
        rows = [b for b in nested if isinstance(b, dict)]
        if rows:
            return rows
    # GOTCHA (Poseidon 2026-07-16): nested chain re-entry can rewrite state.json
    # mid-flight WITHOUT requirementsBom (estimate/engine-c) while module words
    # still carry the principals. Fall back so Interconnect is not a 1-node stub.
    out: list[dict] = []
    seen: set[str] = set()
    for m in ((state.get("moduleDecomposition") or {}).get("modules") or []):
        if not isinstance(m, dict):
            continue
        for sm in (m.get("sub_modules") or []):
            if not isinstance(sm, dict):
                continue
            for w in (sm.get("words") or []):
                if not isinstance(w, dict):
                    continue
                nm = str(w.get("name_human") or w.get("name") or "").split("·")[0].strip()
                if not nm:
                    continue
                key = _norm(nm)
                if not key or key in seen:
                    continue
                seen.add(key)
                out.append({"name": nm, "tag": "", "status": "OK"})
    return out


def _bom_principals(state: dict) -> list[dict]:
    """Tagged BoM lines that belong on the interconnect (not sub-components)."""
    out: list[dict] = []
    for b in _bom_rows(state):
        if b.get("status") == "SUB-COMPONENT":
            continue
        # GOTCHA: word-fallback rows (no requirementsBom) carry `name` only —
        # reading requirement/name_human alone wiped every principal (Poseidon).
        nm = str(
            b.get("requirement") or b.get("name_human") or b.get("name") or ""
        ).split("·")[0].strip()
        tg = str(b.get("tag") or "").strip()
        if not nm and not tg:
            continue
        if _SKIP_NODE_RE.search(nm):
            continue
        out.append({"name": nm or tg, "tag": tg})
    # Collapse host peripherals into the compute principal so the sheet stays
    # glanceable (≤ MAX_PRINCIPAL_NODES). Topology aliases still route via
    # _match_principal → _find_compute_principal.
    has_compute = any(_COMPUTE_PRINCIPAL_NAME_RE.search(p.get("name") or "") for p in out)
    has_stepper = any(
        re.search(r"stepper\s*motor|\bnema\b", p.get("name") or "", re.I)
        for p in out
    )
    # When the motor word is still missing (pad-truncated BoM), keep ONE actuation
    # anchor (linear carriage / lead screw) and absorb the rest of the train.
    has_actuation_anchor = has_stepper or any(
        re.search(r"linear\s*carriage|lead\s*screw", p.get("name") or "", re.I)
        for p in out
    )
    if has_compute or has_actuation_anchor:
        kept: list[dict] = []
        kept_actuation_anchor = False
        for p in out:
            nm = p.get("name") or ""
            # Absorb BEFORE compute-keep — "… On Compute Ui" peripherals must not
            # be promoted to the MCU column (colorimeter 1236 edge-cap blow-out).
            if has_compute and _ABSORB_INTO_COMPUTE_NODE_RE.search(nm):
                continue
            if _COMPUTE_PRINCIPAL_NAME_RE.search(nm):
                kept.append(p)
                continue
            if re.search(r"stepper\s*motor|\bnema\b", nm, re.I):
                kept.append(p)
                kept_actuation_anchor = True
                continue
            if re.search(r"stepper\s*driver", nm, re.I):
                kept.append(p)
                continue
            if _ABSORB_INTO_STEPPER_NODE_RE.search(nm):
                # First carriage/screw becomes the Actuation principal when no motor.
                if (
                    not has_stepper
                    and not kept_actuation_anchor
                    and re.search(r"linear\s*carriage|lead\s*screw", nm, re.I)
                ):
                    kept.append(p)
                    kept_actuation_anchor = True
                continue
            kept.append(p)
        out = kept
    return out


def _find_compute_principal(principals: list[dict]) -> Optional[str]:
    """Universal compute/MCU principal — not just gold-spine 'Compute UI Module'."""
    return (
        _principal_key_by_name(principals, "Compute UI Module")
        or _principal_key_by_name(
            principals,
            "Main Controller MCU",
            "Main Controller",
            "Microcontroller",
            "MCU",
            "Processor",
            "Adafruit Feather M0",
            "Feather M0",
        )
        or next(
            (
                (_norm(p["name"]) or _norm(p["tag"]))
                for p in principals
                if _COMPUTE_PRINCIPAL_NAME_RE.search(p.get("name") or "")
            ),
            None,
        )
    )


def _find_thermal_load_principal(principals: list[dict]) -> Optional[str]:
    """Dominant thermal/electrical load for instrument power story (TEC / heater)."""
    return (
        _principal_key_by_name(
            principals,
            "Peltier Module",
            "TEC Module",
            "Thermoelectric Cooler",
            "Lid Heater",
            "Sample Block",
            "Thermal Block",
        )
        or next(
            (
                (_norm(p["name"]) or _norm(p["tag"]))
                for p in principals
                if re.search(
                    r"peltier|\btec\b|thermoelectric|lid\s*heater|sample\s*block|"
                    r"thermal\s*block|h[- ]?bridge",
                    p.get("name") or "",
                    re.I,
                )
            ),
            None,
        )
    )


def _find_stepper_driver_principal(principals: list[dict]) -> Optional[str]:
    """Stepper / microstep driver board (PCB column) for OPEN-array dosing."""
    return (
        _principal_key_by_name(
            principals,
            "Stepper Driver Board",
            "Stepper Driver",
            "Microstep Driver",
        )
        or next(
            (
                (_norm(p["name"]) or _norm(p["tag"]))
                for p in principals
                if re.search(r"stepper\s*driver|microstep\s*driver", p.get("name") or "", re.I)
            ),
            None,
        )
    )


def _find_stepper_motor_principal(principals: list[dict]) -> Optional[str]:
    """NEMA / stepper motor — the Actuation column principal."""
    return (
        _principal_key_by_name(
            principals,
            "Stepper Motor",
            "NEMA Stepper",
            "NEMA Motor",
        )
        or next(
            (
                (_norm(p["name"]) or _norm(p["tag"]))
                for p in principals
                if re.search(r"stepper\s*motor|\bnema\b", p.get("name") or "", re.I)
            ),
            None,
        )
    )


def _principal_key_by_name(principals: list[dict], *name_needles: str) -> Optional[str]:
    for needle in name_needles:
        nn = _norm(needle)
        for p in principals:
            key = _norm(p["name"]) or _norm(p["tag"])
            if nn and nn in (_norm(p["name"]), key):
                return key
            if nn and nn in _norm(p["name"]):
                return key
    return None


def _match_principal(token: str, principals: list[dict]) -> Optional[str]:
    """Map a topology endpoint name → principal key, or None if not a principal."""
    nt = _norm(token)
    if not nt:
        return None
    candidates = {nt}
    for alias in _ENDPOINT_ALIASES.get(nt, ()):
        candidates.add(_norm(alias))
    # Exact / containment against principal name or tag.
    for p in principals:
        key = _norm(p["name"]) or _norm(p["tag"])
        pn, pt = _norm(p["name"]), _norm(p["tag"])
        for cand in candidates:
            if cand == key or cand == pn or (pt and cand == pt):
                return key
            if pn and (cand in pn or pn in cand):
                return key
            # Token overlap ≥ 2 significant words
            tw = set(cand.split()) - {"module", "board", "unit", "the", "a"}
            pw = set(pn.split()) - {"module", "board", "unit", "the", "a"}
            if len(tw & pw) >= 2:
                return key
    # Gold-spine host absorption (stale topology → surviving BoM principals).
    if _HOST_INTO_LED_RE.search(token or ""):
        led = _principal_key_by_name(principals, "LED Source Board", "LED Source")
        if led:
            return led
    if _HOST_INTO_COMPUTE_RE.search(token or ""):
        compute = _find_compute_principal(principals)
        if compute:
            return compute
    return None


def _collect_graph(out_dir: Path, state: dict) -> tuple[dict[str, dict], list[dict]]:
    """BoM-principal nodes + topology edges between them only.

    INTENT: Connection-ledger adjacency listed every ghost endpoint (36 nodes).
    The glanceable interconnect is the BoM story the Part names tab already owns.
    """
    principals = _bom_principals(state)
    nodes: dict[str, dict] = {}
    for p in principals:
        key = _norm(p["name"]) or _norm(p["tag"])
        if not key:
            continue
        nodes[key] = {
            "name": p["name"],
            "tag": p["tag"],
            "block": _classify_block(p["name"]),
        }

    edges: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    def _add_edge(fr_tok: str, to_tok: str, mech: str, svc: str = "") -> None:
        a = _match_principal(fr_tok, principals)
        b = _match_principal(to_tok, principals)
        if not a or not b or a == b:
            return
        if a not in nodes or b not in nodes:
            return
        kind = _edge_kind(mech, svc)
        ek = (a, b, kind)
        if ek in seen:
            return
        seen.add(ek)
        edges.append({"from": a, "to": b, "kind": kind, "label": mech or svc})

    topo = (
        ((state.get("orchestratorContract") or {}).get("topology"))
        or ((state.get("engineeringContract") or {}).get("topology"))
        or []
    )
    for e in topo:
        if not isinstance(e, dict):
            continue
        fr = str(e.get("from") or e.get("from_part") or "").strip()
        to = str(e.get("to") or e.get("to_part") or "").strip()
        if fr and to:
            _add_edge(fr, to, str(e.get("mechanism") or ""),
                      str(e.get("material_context") or ""))

    # Supplement from parts-ledger connections (still principal-filtered).
    pl = _load_json(out_dir / "parts-ledger.json")
    for c in pl.get("connections") or []:
        if not isinstance(c, dict):
            continue
        fr = str(c.get("from_part") or "").strip()
        to = str(c.get("to_part") or "").strip()
        if fr and to:
            _add_edge(fr, to, str(c.get("service") or c.get("mech") or ""),
                      str(c.get("material_context") or c.get("service") or ""))

    # INTENT: Enclosure SHELL is the mechanical story — never the ambient-light
    # cap (cap sorted first alphabetically and stole every mount on colorimeter,
    # leaving Enclosure Shell at degree 0 while story_ok still passed).
    shell_keys = [
        k for k, n in nodes.items()
        if n.get("block") == "Enclosure" and _ENCLOSURE_SHELL_RE.search(n.get("name") or "")
    ]
    enc_keys = shell_keys or [
        k for k, n in nodes.items()
        if n.get("block") == "Enclosure" and not _ENCLOSURE_ACCESSORY_RE.search(n.get("name") or "")
    ]
    if enc_keys:
        enc = sorted(enc_keys, key=lambda k: (0 if nodes[k].get("tag") else 1, k))[0]
        # DECISION: mount only the structural masses (PCB + Optical + Thermal).
        # Power/HMI columns are electrical/UI stories — synthesising 4 mounts +
        # spine power edges pushed synth_ratio over the honest bar
        # (colorimeter 2026-07-14). Thermal = TEC/sample block in the wood box.
        for block in ("PCB", "Optical", "Thermal", "Actuation"):
            reps = [k for k, n in nodes.items() if n.get("block") == block]
            if not reps:
                continue
            rep = sorted(reps, key=lambda k: (0 if nodes[k].get("tag") else 1, k))[0]
            kind = "mechanical"
            ek = (rep, enc, kind)
            if ek in seen or (enc, rep, kind) in seen:
                continue
            seen.add(ek)
            edges.append({
                "from": rep, "to": enc, "kind": kind,
                "label": "mechanical mount",
                "synthesised": True,
            })

    # INTENT (2026-07-14 / extended 2026-07-15): gold-spine Compute UI Module
    # absorbs USB/LiPo/regulator as discrete BoM lines — topology power edges then
    # collapse to self-loops and the sheet had ZERO Power column while the legend
    # still advertised power. UNIVERSAL: any instrument compute principal
    # (Compute UI Module OR Main Controller MCU / …) gets the same Power story:
    #   USB/LiPo or DC Input (Power) → Compute → (LED Source | TEC / thermal load
    #   | stepper driver → stepper motor)
    # plus Compute → Detector as signal when an optical detector exists.
    compute_key = _find_compute_principal(principals)
    led_key = _principal_key_by_name(principals, "LED Source Board", "LED Source")
    det_key = _principal_key_by_name(principals, "Optical Detector Module")
    load_key = _find_thermal_load_principal(principals)
    driver_key = _find_stepper_driver_principal(principals)
    motor_key = _find_stepper_motor_principal(principals)
    has_power_edge = any(e.get("kind") == "power" for e in edges)
    has_power_col = any(n.get("block") == "Power" for n in nodes.values())
    if compute_key and compute_key in nodes:
        # Prefer an existing Power-column principal (terminal block / PSU) over a
        # synthetic USB/LiPo node when the BoM already names one.
        existing_pwr = next(
            (k for k, n in nodes.items() if n.get("block") == "Power"),
            None,
        )
        pwr_key = existing_pwr or "usb lipo input"
        if not has_power_col:
            nodes[pwr_key] = {
                "name": "USB / LiPo Input",
                "tag": "EP-201",
                "block": "Power",
            }
            has_power_col = True
        if pwr_key in nodes:
            ek = (pwr_key, compute_key, "power")
            if ek not in seen and (compute_key, pwr_key, "power") not in seen:
                seen.add(ek)
                edges.append({
                    "from": pwr_key, "to": compute_key, "kind": "power",
                    "label": "device power → compute",
                    "synthesised": True,
                    "basis": "gold-spine compute power path",
                })
                has_power_edge = True
        if led_key and led_key in nodes and not any(
            e.get("kind") == "power"
            and {e.get("from"), e.get("to")} == {compute_key, led_key}
            for e in edges
        ):
            ek2 = (compute_key, led_key, "power")
            if ek2 not in seen and (led_key, compute_key, "power") not in seen:
                seen.add(ek2)
                edges.append({
                    "from": compute_key, "to": led_key, "kind": "power",
                    "label": "source board supply",
                    "synthesised": True,
                    "basis": "gold-spine kit → LED daughterboard",
                })
        elif load_key and load_key in nodes and load_key != compute_key and not any(
            e.get("kind") == "power"
            and {e.get("from"), e.get("to")} == {compute_key, load_key}
            for e in edges
        ):
            ek2b = (compute_key, load_key, "power")
            if ek2b not in seen and (load_key, compute_key, "power") not in seen:
                seen.add(ek2b)
                edges.append({
                    "from": compute_key, "to": load_key, "kind": "power",
                    "label": "TEC / thermal load supply",
                    "synthesised": True,
                    "basis": "gold-spine kit → thermal load",
                })
        # OPEN-array dosing: Power → MCU → Driver (power+step/dir) → Motor.
        if driver_key and driver_key in nodes and driver_key != compute_key:
            if pwr_key in nodes:
                ek_pd = (pwr_key, driver_key, "power")
                if ek_pd not in seen and (driver_key, pwr_key, "power") not in seen:
                    seen.add(ek_pd)
                    edges.append({
                        "from": pwr_key, "to": driver_key, "kind": "power",
                        "label": "motor supply rail",
                        "synthesised": True,
                        "basis": "gold-spine OPEN-array driver power",
                    })
            ek_sd = (compute_key, driver_key, "signal")
            if ek_sd not in seen and (driver_key, compute_key, "signal") not in seen:
                seen.add(ek_sd)
                edges.append({
                    "from": compute_key, "to": driver_key, "kind": "signal",
                    "label": "step / dir / enable",
                    "synthesised": True,
                    "basis": "gold-spine OPEN-array step/dir",
                })
            if motor_key and motor_key in nodes and motor_key != driver_key:
                ek_dm = (driver_key, motor_key, "power")
                if ek_dm not in seen and (motor_key, driver_key, "power") not in seen:
                    seen.add(ek_dm)
                    edges.append({
                        "from": driver_key, "to": motor_key, "kind": "power",
                        "label": "phase coils",
                        "synthesised": True,
                        "basis": "gold-spine OPEN-array motor phases",
                    })
        else:
            # No discrete driver — power the Actuation principal (motor, or
            # carriage/screw stand-in when the motor word was pad-truncated).
            act_key = motor_key or next(
                (k for k, n in nodes.items() if n.get("block") == "Actuation"),
                None,
            )
            if act_key and act_key in nodes and act_key != compute_key:
                ek_cm = (compute_key, act_key, "power")
                if ek_cm not in seen and (act_key, compute_key, "power") not in seen:
                    seen.add(ek_cm)
                    edges.append({
                        "from": compute_key, "to": act_key, "kind": "power",
                        "label": "stepper drive",
                        "synthesised": True,
                        "basis": "gold-spine OPEN-array MCU→actuation",
                    })
    if compute_key and det_key and compute_key in nodes and det_key in nodes:
        if not any(
            e.get("kind") == "signal"
            and {e.get("from"), e.get("to")} == {compute_key, det_key}
            for e in edges
        ):
            ek3 = (det_key, compute_key, "signal")
            if ek3 not in seen and (compute_key, det_key, "signal") not in seen:
                seen.add(ek3)
                edges.append({
                    "from": det_key, "to": compute_key, "kind": "signal",
                    "label": "I²C / STEMMA detector bus",
                    "synthesised": True,
                    "basis": "gold-spine detector ↔ compute",
                })

    # Deduplicate: prefer optical over signal for the same endpoint pair.
    # Also drop anonymous signal clones of electrical_bus power edges — parts-ledger
    # re-emits the same USB→compute hop as both power + signal and blew MAX_EDGES
    # (colorimeter 1236: 17 nodes / 37 edges with story_ok still true).
    by_pair: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in edges:
        a, b = e["from"], e["to"]
        key = (a, b) if a <= b else (b, a)
        by_pair[key].append(e)
    deduped: list[dict] = []
    _DATA_BUS_RE = re.compile(
        r"i2c|spi|uart|stemma|qwiic|usb\s*data|can\b|rs[- ]?485|modbus", re.I,
    )
    for pair_edges in by_pair.values():
        kinds = {e["kind"] for e in pair_edges}
        if "optical" in kinds and "signal" in kinds:
            pair_edges = [e for e in pair_edges if e["kind"] != "signal"]
        if "power" in kinds and "signal" in kinds:
            pair_edges = [
                e for e in pair_edges
                if e["kind"] != "signal"
                or _DATA_BUS_RE.search(str(e.get("label") or ""))
                or _DATA_BUS_RE.search(str(e.get("net") or ""))
            ]
        deduped.extend(pair_edges)
    edges = deduped

    # Canonical optical path (LED → … → detector) + named nets — replaces the
    # alphabetically-stacked purple scribble that still scored story_ok.
    edges = _rewrite_optical_path(nodes, edges, seen)

    _stamp_edge_nets(edges)

    # DECISION: keep EVERY BoM principal even at zero degree — dropping orphans
    # hid the MCU/PCB column on colorimeter (Compute UI Module had no matched edge
    # after name normalisation) and made the sheet look like "optics only".
    # Unwired principals stay as honest islands only when no alias/synthesis applies.
    return nodes, edges


def layout_metrics(
    nodes: dict[str, dict],
    edges: list[dict],
    *,
    width: int = 0,
    height: int = 0,
    content_bottom: float = 0.0,
    title_top: float = 0.0,
) -> dict[str, Any]:
    """PURE layout + story quality — used by proveCatch + Excel Interconnect scorer.

    A glanceable interconnect clears ALL of:
      - n_nodes ≤ MAX_PRINCIPAL_NODES
      - n_edges ≤ MAX_EDGES
      - content_bottom + 8 ≤ title_top  (no title/legend overlap)
      - max column depth ≤ 10
      - when ≥6 nodes and an Enclosure column exists: ≥1 mechanical enclosure edge
        AND ≥2 distinct edge kinds (not a monochrome "all signal" scribble)
    """
    order = ["Power", "PCB", "Actuation", "Thermal", "Optical", "HMI", "Enclosure"]
    buckets: dict[str, list[str]] = {b: [] for b in order}
    for key, n in nodes.items():
        buckets.setdefault(n["block"], []).append(key)
    cols = [b for b in order if buckets.get(b)]
    max_col = max((len(buckets.get(c) or []) for c in cols), default=0)
    overlap = bool(title_top and content_bottom and content_bottom + 8 > title_top)
    kinds = {str(e.get("kind") or "") for e in edges if e.get("kind")}
    enc_keys = set(buckets.get("Enclosure") or [])
    shell_keys = {
        k for k in enc_keys
        if _ENCLOSURE_SHELL_RE.search((nodes.get(k) or {}).get("name") or "")
    }
    enclosure_degree = sum(
        1 for e in edges
        if e.get("from") in enc_keys or e.get("to") in enc_keys
    )
    shell_degree = sum(
        1 for e in edges
        if e.get("from") in shell_keys or e.get("to") in shell_keys
    )
    # GOTCHA: mechanical mounts are expected scaffolding on a handheld pack —
    # counting them in synth_ratio made an honest USB→compute + 2 mounts fail
    # at 50% while the Power story was real (Tristan 2026-07-14).
    # GOTCHA 2: gold-spine power/signal after host absorption is the honest
    # principal-level story (USB/LiPo→Compute→LED) — not fiction. Counting it
    # with the optical-path rebuild pushed synth_ratio over 40% on a correct sheet.
    n_synth = sum(
        1 for e in edges
        if (e.get("synthesised") or e.get("label") in ("DC power rail",))
        and e.get("label") != "mechanical mount"
        and e.get("kind") != "mechanical"
        and "gold-spine" not in str(e.get("basis") or "")
        and "canonical optical path" not in str(e.get("basis") or "")
    )
    synth_ratio = (n_synth / len(edges)) if edges else 0.0
    cable_nodes = [
        (nodes[k].get("name") or "")
        for k in nodes
        if _SKIP_NODE_RE.search((nodes[k].get("name") or ""))
    ]
    # HONEST story bar (Tristan 2026-07-14): layout clearance is necessary but
    # not sufficient. Enclosure Shell tie, real Power when a compute kit exists,
    # ≥2 edge kinds, no cable-as-node litter, synth mounts cannot dominate.
    story_ok = True
    story_reasons: list[str] = []
    # GOTCHA (NinjaPCR 1203): 1-node stub "Device (no graph yet)" scored
    # story_ok=true while kinds=[] — Goodhart. A real interconnect needs ≥2
    # nodes and ≥1 edge before the story bar can pass.
    if len(nodes) < 2 or len(edges) < 1:
        story_ok = False
        story_reasons.append(f"thin graph nodes={len(nodes)} edges={len(edges)}")
    if cable_nodes:
        story_ok = False
        story_reasons.append(f"cable/header nodes: {cable_nodes[:3]}")
    if len(nodes) >= 4 and shell_keys and shell_degree < 1:
        story_ok = False
        story_reasons.append("Enclosure Shell has zero edges")
    if len(nodes) >= 6 and len(kinds) < 2:
        story_ok = False
        story_reasons.append(f"only {sorted(kinds)} edge kind(s)")
    if edges and synth_ratio > 0.40:
        story_ok = False
        story_reasons.append(f"synthesised edges {n_synth}/{len(edges)} ({synth_ratio:.0%})")
    # Power column that is only an optical emitter misclassified — thin story.
    power_names = [(nodes[k].get("name") or "") for k in (buckets.get("Power") or [])]
    if power_names and all(re.search(r"led\s*source|source\s*board", n, re.I) for n in power_names):
        story_ok = False
        story_reasons.append("Power column is only LED source (misclassified optics)")
    # Compute-kit instruments must show a Power column + at least one power edge.
    has_compute = any(
        re.search(
            r"compute\s*ui|main\s*controller|microcontroller|\bmcu\b|processor",
            (nodes[k].get("name") or ""),
            re.I,
        )
        for k in nodes
    )
    if has_compute and len(nodes) >= 4:
        if not buckets.get("Power"):
            story_ok = False
            story_reasons.append("Compute kit present but no Power column")
        if "power" not in kinds:
            story_ok = False
            story_reasons.append("Compute kit present but no power edges")
    # Optical path order: LED must precede detector on the optical chain.
    optical_path_ok = True
    opt_edges = [e for e in edges if e.get("kind") == "optical"]
    opt_nodes = [
        k for k in (buckets.get("Optical") or [])
        if _optical_path_rank((nodes.get(k) or {}).get("name") or "") < 50
    ]
    if len(opt_nodes) >= 2 and opt_edges:
        ranks = {
            k: _optical_path_rank((nodes.get(k) or {}).get("name") or "")
            for k in opt_nodes
        }
        for e in opt_edges:
            fr, to = e.get("from"), e.get("to")
            if fr in ranks and to in ranks and ranks[fr] > ranks[to]:
                optical_path_ok = False
                story_ok = False
                story_reasons.append(
                    f"optical edge {fr}→{to} runs detector-ward backwards "
                    f"(ranks {ranks[fr]}→{ranks[to]})"
                )
                break
    # Net / connector labels: a wiring sheet without named nets is a block diagram.
    n_labeled = sum(1 for e in edges if e.get("net") or e.get("connector"))
    nets_labeled = (n_labeled / len(edges)) if edges else 0.0
    if len(edges) >= 4 and nets_labeled < 0.5:
        story_ok = False
        story_reasons.append(
            f"only {n_labeled}/{len(edges)} edges carry net/connector labels"
        )
    ok = (
        len(nodes) <= MAX_PRINCIPAL_NODES
        and len(edges) <= MAX_EDGES
        and max_col <= 10
        and not overlap
        and (height == 0 or content_bottom <= height)
        and story_ok
        and optical_path_ok
    )
    return {
        "ok": ok,
        "n_nodes": len(nodes),
        "n_edges": len(edges),
        "max_col_depth": max_col,
        "n_cols": len(cols),
        "n_edge_kinds": len(kinds),
        "edge_kinds": sorted(kinds),
        "enclosure_degree": enclosure_degree,
        "shell_degree": shell_degree,
        "n_synthesised": n_synth,
        "synth_ratio": round(synth_ratio, 3),
        "cable_nodes": cable_nodes,
        "story_ok": story_ok,
        "story_reasons": story_reasons,
        "optical_path_ok": optical_path_ok,
        "nets_labeled_ratio": round(nets_labeled, 3),
        "content_bottom": content_bottom,
        "title_top": title_top,
        "title_overlaps_content": overlap,
        "width": width,
        "height": height,
    }


def _wrap_label(text: str, width: int = 28) -> list[str]:
    """Word-wrap a node label — never emit an ellipsis truncation."""
    words = (text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    cur = words[0]
    for w in words[1:]:
        if len(cur) + 1 + len(w) <= width:
            cur = f"{cur} {w}"
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines[:3]  # hard cap 3 lines; box grows via box_h


def build_interconnect_svg(
    nodes: dict[str, dict],
    edges: list[dict],
    archetype: str,
    issue_date: str = "",
) -> tuple[str, dict[str, Any]]:
    """Layered left→right SVG. Returns (svg_text, layout_metrics)."""
    _stamp_edge_nets(edges)
    order = ["Power", "PCB", "Actuation", "Thermal", "Optical", "HMI", "Enclosure"]
    buckets: dict[str, list[str]] = {b: [] for b in order}
    for key, n in nodes.items():
        buckets.setdefault(n["block"], []).append(key)

    cols = [b for b in order if buckets.get(b)]
    if not cols:
        cols = ["PCB"]
        buckets["PCB"] = list(nodes.keys()) or ["device"]

    box_w, base_box_h, v_gap = 200, 44, 16
    # Pre-compute per-node heights from wrapped labels so long names don't clip.
    node_h: dict[str, float] = {}
    for key, n in nodes.items():
        n_lines = len(_wrap_label(n["name"], 26))
        extra = 12 if n.get("tag") else 0
        node_h[key] = max(base_box_h, 18 + extra + n_lines * 12)

    max_col = max(len(buckets.get(c) or []) for c in cols)
    # Conservative content height (sum of tallest column's box heights).
    tallest = 0.0
    for c in cols:
        keys = buckets.get(c) or []
        tallest = max(tallest, sum(node_h.get(k, base_box_h) for k in keys) + v_gap * max(len(keys) - 1, 0))
    content_h = tallest + 24
    width = 1280
    # Content-driven height: header + columns + legend + title band + padding
    height = int(TOP_HEADER_PX + content_h + LEGEND_BAND_PX + TITLE_BAND_PX + 40)
    height = max(height, 640)
    margin_l, margin_t = 48, TOP_HEADER_PX
    col_w = (width - margin_l - 48) / max(len(cols), 1)
    title_top = height - TITLE_BAND_PX
    legend_y = title_top - LEGEND_BAND_PX + 18

    # Assign positions — pack from top, never into the reserved band.
    # Optical column: physical light-path order (LED top → detector bottom),
    # never alphabetical (Collimator/Cuvette before LED — Tristan 2026-07-14).
    pos: dict[str, tuple[float, float]] = {}
    content_bottom = margin_t + 20.0
    for ci, col in enumerate(cols):
        raw = list(buckets.get(col) or [])
        if col == "Optical":
            keys = sorted(raw, key=lambda k: (
                _optical_path_rank(nodes[k].get("name") or ""),
                0 if nodes[k].get("tag") else 1,
                nodes[k]["name"].lower(),
            ))
        else:
            keys = sorted(raw, key=lambda k: (
                0 if nodes[k].get("tag") else 1,
                nodes[k]["name"].lower(),
            ))
        y0 = margin_t + 28
        y = y0
        for key in keys:
            x = margin_l + ci * col_w + (col_w - box_w) / 2
            h = node_h.get(key, base_box_h)
            pos[key] = (x, y)
            content_bottom = max(content_bottom, y + h)
            y += h + v_gap

    metrics = layout_metrics(
        nodes, edges,
        width=width, height=height,
        content_bottom=content_bottom, title_top=title_top,
    )

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" data-interconnect-nodes="{len(nodes)}" '
        f'data-interconnect-edges="{len(edges)}" '
        f'data-layout-ok="{str(metrics["ok"]).lower()}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="40" y="32" font-family="Helvetica,Arial,sans-serif" font-size="18" '
        f'font-weight="bold" fill="#0f172a">INTERCONNECT — device wiring &amp; signal paths</text>',
        f'<text x="40" y="52" font-family="Helvetica,Arial,sans-serif" font-size="11" '
        f'fill="#64748b">{html.escape(_humanise(str(archetype)))} · '
        f'{len(nodes)} principals · detail on Connection trace</text>',
    ]

    # Markers
    marker_defs = ['<defs>']
    for kind, (color, _, _) in _EDGE_STYLE.items():
        marker_defs.append(
            f'<marker id="arrow-{kind}" markerWidth="8" markerHeight="8" '
            f'refX="6" refY="3" orient="auto">'
            f'<path d="M0,0 L6,3 L0,6 Z" fill="{color}"/></marker>')
    marker_defs.append("</defs>")
    parts.append("".join(marker_defs))

    # Column headers + faint column rails
    for ci, col in enumerate(cols):
        cx = margin_l + ci * col_w + col_w / 2
        parts.append(
            f'<text x="{cx:.1f}" y="{margin_t}" text-anchor="middle" '
            f'font-family="Helvetica,Arial,sans-serif" font-size="12" '
            f'font-weight="bold" fill="#334155">{html.escape(col)}</text>')
        if ci:
            xrail = margin_l + ci * col_w
            parts.append(
                f'<line x1="{xrail:.1f}" y1="{margin_t + 8}" '
                f'x2="{xrail:.1f}" y2="{content_bottom + 8:.1f}" '
                f'stroke="#e2e8f0" stroke-width="1"/>')

    # Orthogonal edges (under nodes). Stagger mid-X by edge index to reduce overlap.
    col_index = {c: i for i, c in enumerate(cols)}
    edge_i = 0
    for e in edges:
        a, b = e["from"], e["to"]
        if a not in pos or b not in pos or a == b:
            continue
        x1, y1 = pos[a]
        x2, y2 = pos[b]
        ha, hb = node_h.get(a, base_box_h), node_h.get(b, base_box_h)
        # Always draw left→right for readability
        if col_index.get(nodes[a]["block"], 0) > col_index.get(nodes[b]["block"], 0):
            x1, y1, x2, y2 = x2, y2, x1, y1
            ha, hb = hb, ha
            a, b = b, a
        x1 += box_w
        y1 += ha / 2
        y2 += hb / 2
        # Mid X between the two column centres, staggered
        mid = (x1 + x2) / 2 + ((edge_i % 5) - 2) * 6
        edge_i += 1
        color, width_s, dash = _EDGE_STYLE.get(e["kind"], _EDGE_STYLE["signal"])
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        parts.append(
            f'<path d="M{x1:.1f},{y1:.1f} H{mid:.1f} V{y2:.1f} H{x2:.1f}" '
            f'fill="none" stroke="{color}" stroke-width="{width_s}"{dash_attr} '
            f'marker-end="url(#arrow-{e["kind"]})" opacity="0.85"/>')
        # Net / connector callout at the elbow — wiring sheet, not silent blocks.
        net = str(e.get("net") or e.get("connector") or e.get("label") or "").strip()
        if net and e.get("kind") in ("power", "signal", "optical"):
            label = net
            if e.get("connector") and e.get("net"):
                label = f"{e['connector']}:{e['net']}"
            elif e.get("label") and e.get("kind") == "optical":
                label = str(e["label"])
            parts.append(
                f'<text x="{mid + 4:.1f}" y="{(y1 + y2) / 2 - 3:.1f}" '
                f'font-family="Helvetica,Arial,sans-serif" font-size="8" '
                f'fill="{color}" data-net="{html.escape(str(e.get("net") or ""))}">'
                f'{html.escape(label[:28])}</text>')

    # Nodes — full labels (wrapped), never ellipsis-truncated.
    for key, (x, y) in pos.items():
        n = nodes[key]
        tag = n.get("tag") or ""
        lines = _wrap_label(n["name"], 26)
        h = node_h.get(key, base_box_h)
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{box_w}" height="{h:.1f}" '
            f'rx="4" fill="#f8fafc" stroke="#334155" stroke-width="1.2"/>')
        ty = y + 14
        if tag:
            parts.append(
                f'<text x="{x + 8:.1f}" y="{ty:.1f}" '
                f'font-family="Helvetica,Arial,sans-serif" font-size="9" '
                f'font-weight="bold" fill="#c2410c">{html.escape(tag)}</text>')
            ty += 13
        for li, line in enumerate(lines):
            parts.append(
                f'<text x="{x + 8:.1f}" y="{ty + li * 12:.1f}" '
                f'font-family="Helvetica,Arial,sans-serif" font-size="9.5" '
                f'fill="#0f172a">{html.escape(line)}</text>')

    # Legend — in the reserved band, left of title block
    parts.append(
        f'<text x="40" y="{legend_y:.1f}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="10" font-weight="bold" fill="#334155">Legend</text>')
    for i, (kind, (color, width_s, dash)) in enumerate(_EDGE_STYLE.items()):
        yy = legend_y + 16 + i * 13
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        parts.append(
            f'<line x1="40" y1="{yy:.1f}" x2="76" y2="{yy:.1f}" '
            f'stroke="{color}" stroke-width="{width_s}"{dash_attr}/>')
        parts.append(
            f'<text x="84" y="{yy + 3:.1f}" '
            f'font-family="Helvetica,Arial,sans-serif" font-size="9" '
            f'fill="#475569">{html.escape(kind)}</text>')

    # Title block — reserved band, never overlapping content
    y0 = title_top + 8
    parts.append(
        f'<line x1="30" y1="{y0:.1f}" x2="{width - 30}" y2="{y0:.1f}" '
        f'stroke="#334155" stroke-width="1.6"/>')
    parts.append(
        f'<text x="30" y="{y0 + 22:.1f}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="12" font-weight="bold" fill="#0f172a">'
        f'FRACTIONAL FORGE · ForgeOS</text>')
    parts.append(
        f'<text x="30" y="{y0 + 42:.1f}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="14" font-weight="bold" fill="#10243e">'
        f'INTERCONNECT — {html.escape(str(archetype))}</text>')
    parts.append(
        f'<text x="30" y="{y0 + 58:.1f}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="9" fill="#64748b">BoM principals + contract topology · '
        f'NOT FOR CONSTRUCTION</text>')
    bw, bx0, by0, rh = 300, width - 330, y0 + 12, 22
    rows = [("DRAWING No.", "FF-INT-001"),
            ("REV", _tb.REV),
            ("DATE", issue_date or "—"),
            ("SCALE", "NTS")]
    box_th = rh * len(rows)
    parts.append(
        f'<rect x="{bx0}" y="{by0:.1f}" width="{bw}" height="{box_th}" '
        f'fill="#ffffff" stroke="#1a1a1a" stroke-width="1.3"/>')
    for i, (k, v) in enumerate(rows):
        ry = by0 + i * rh
        if i:
            parts.append(
                f'<line x1="{bx0}" y1="{ry:.1f}" x2="{bx0 + bw}" y2="{ry:.1f}" '
                f'stroke="#cbd5e1" stroke-width="1"/>')
        parts.append(
            f'<line x1="{bx0 + 108}" y1="{by0:.1f}" x2="{bx0 + 108}" '
            f'y2="{by0 + box_th:.1f}" stroke="#cbd5e1" stroke-width="1"/>')
        parts.append(
            f'<text x="{bx0 + 8}" y="{ry + 15:.1f}" '
            f'font-family="Helvetica,Arial,sans-serif" font-size="9" '
            f'font-weight="bold" fill="#64748b">{html.escape(k)}</text>')
        parts.append(
            f'<text x="{bx0 + 116}" y="{ry + 15:.1f}" '
            f'font-family="Helvetica,Arial,sans-serif" font-size="9.5" '
            f'fill="#1a1a1a">{html.escape(v)}</text>')
    parts.append("</svg>")
    return "\n".join(parts), metrics


def _humanise(tag: str) -> str:
    if not tag:
        return "device"
    return tag.replace("_", " ").strip().title()


def generate_interconnect(
    out_dir: str,
    state_path: Optional[str] = None,
    rasterise_png: bool = True,
) -> dict:
    global _ISSUE_DATE
    out = Path(out_dir).resolve()
    sp = Path(state_path) if state_path else out / "state.json"
    state = _load_json(sp)
    _ISSUE_DATE = _tb.issue_date(str(out))

    if drawing_form_factor(state) != "handheld" and not state.get("isInstrumentDevice"):
        return {"ok": False, "skipped": "not_handheld"}

    nodes, edges = _collect_graph(out, state)
    if not nodes:
        nodes = {"device": {"name": "Device (no graph yet)", "tag": "", "block": "PCB"}}
        edges = []

    arch = (
        ((state.get("parsedBrief") or {}).get("product_class"))
        or ((state.get("orchestratorContract") or {}).get("product_class"))
        or out.name
    )
    svg, metrics = build_interconnect_svg(nodes, edges, str(arch), _ISSUE_DATE)
    draw = out / "drawings"
    draw.mkdir(parents=True, exist_ok=True)
    svg_path = draw / "interconnect.svg"
    png_path = draw / "interconnect.png"
    svg_path.write_text(svg, encoding="utf-8")
    (draw / "interconnect-layout.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8")
    png_ok = False
    if rasterise_png and _ga is not None:
        try:
            png_ok = bool(_ga.rasterise(svg_path, png_path))
        except Exception:  # noqa: BLE001
            png_ok = False
    try:
        import a1_print
        a1_print.export_a1(svg_path, base="interconnect",
                           title="Interconnect — device wiring")
    except Exception:  # noqa: BLE001
        pass
    return {
        "ok": bool(metrics.get("ok")),
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "n_nodes": len(nodes),
        "n_edges": len(edges),
        "layout": metrics,
        "fluid_less": is_fluid_less_instrument(state),
    }


def _selftest() -> int:
    bad = 0

    def chk(name: str, cond: bool) -> None:
        nonlocal bad
        if not cond:
            print(f"  FAIL {name}")
            bad += 1

    # Happy path — small principal graph draws + metrics pass.
    nodes = {
        "usb": {"name": "USB Input", "tag": "I-200", "block": "Power"},
        "fuse": {"name": "Input Fuse", "tag": "X-200", "block": "Power"},
        "reg": {"name": "3V3 Regulator", "tag": "X-201", "block": "Power"},
        "mcu": {"name": "Compute UI Module", "tag": "I-201", "block": "PCB"},
        "led": {"name": "LED Source Board", "tag": "X-201", "block": "Optical"},
        "det": {"name": "Optical Detector Module", "tag": "I-202", "block": "Optical"},
        "disp": {"name": "Local Display", "tag": "I-210", "block": "HMI"},
        "enc": {"name": "Enclosure Shell", "tag": "X-207", "block": "Enclosure"},
    }
    edges = [
        {"from": "usb", "to": "fuse", "kind": "power", "label": "electrical_bus"},
        {"from": "fuse", "to": "reg", "kind": "power", "label": "electrical_bus"},
        {"from": "reg", "to": "mcu", "kind": "power", "label": "electrical_bus"},
        {"from": "mcu", "to": "led", "kind": "signal", "label": "signal"},
        {"from": "led", "to": "det", "kind": "optical", "label": "optical"},
        {"from": "mcu", "to": "disp", "kind": "signal", "label": "signal"},
        # topology-authored mounts (not synthesised) so synth_ratio stays low
        {"from": "mcu", "to": "enc", "kind": "mechanical", "label": "mount"},
        {"from": "led", "to": "enc", "kind": "mechanical", "label": "mount"},
    ]
    svg, metrics = build_interconnect_svg(nodes, edges, "colorimeter", "2026-07-14")
    for needle in ("INTERCONNECT", "I-201", "LED Source", "Legend", "power",
                   "FF-INT-001", 'data-layout-ok="true"'):
        chk(f"svg_has_{needle[:20]}", needle in svg)
    chk("no_plant_labels", "m³/h" not in svg and "DN50" not in svg)
    chk("no_ellipsis_truncation", "…" not in svg)
    chk("metrics_ok", metrics["ok"] is True)
    chk("story_ok", metrics.get("story_ok") is True)
    chk("enclosure_wired", (metrics.get("shell_degree") or 0) >= 1)
    chk("multi_kinds", (metrics.get("n_edge_kinds") or 0) >= 2)
    chk("no_cable_nodes", not metrics.get("cable_nodes"))
    chk("no_title_overlap", not metrics["title_overlaps_content"])
    chk("content_above_title", metrics["content_bottom"] + 8 <= metrics["title_top"])

    # proveCatch — bird's-nest class MUST fail metrics (the disaster Tristan rejected).
    nest_nodes = {
        f"n{i}": {"name": f"Part {i}", "tag": f"X-{i}", "block": "Power" if i < 12 else "PCB"}
        for i in range(30)
    }
    nest_edges = [
        {"from": f"n{i}", "to": f"n{i+1}", "kind": "power", "label": "x"}
        for i in range(29)
    ]
    nest_m = layout_metrics(nest_nodes, nest_edges, content_bottom=900, title_top=800)
    chk("birds_nest_fails_node_cap", nest_m["ok"] is False)
    chk("birds_nest_flags_overlap", nest_m["title_overlaps_content"] is True)

    # proveCatch — monochrome signal + unwired enclosure MUST fail story bar.
    thin = layout_metrics(
        {k: nodes[k] for k in ("mcu", "led", "det", "disp", "enc", "usb")},
        [{"from": "mcu", "to": "led", "kind": "signal"},
         {"from": "led", "to": "det", "kind": "signal"},
         {"from": "mcu", "to": "disp", "kind": "signal"}],
        content_bottom=200, title_top=400,
    )
    chk("thin_story_fails", thin["ok"] is False and thin["story_ok"] is False)

    # BoM-only collection: adjacency dump must NOT inflate past principals.
    state = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-201", "requirement": "Compute UI Module", "status": "OK"},
            {"tag": "X-201", "requirement": "LED Source Board", "status": "OK"},
            {"tag": "X-207", "requirement": "Enclosure Shell", "status": "OK"},
            {"tag": "X-208", "requirement": "Ambient Light Cap", "status": "OK"},  # skipped
            {"tag": "I-203", "requirement": "Sensor Interconnect Cable", "status": "OK"},  # skipped
            {"tag": "X-209", "requirement": "Fastener Set", "status": "OK"},  # skipped
        ],
        "orchestratorContract": {"topology": [
            {"from_part": "Microcontroller", "to_part": "LED Source",
             "mechanism": "signal",
             "material_context": "optical path (free-space / guided light)"},
            {"from_part": "Ghost Endpoint A", "to_part": "Ghost Endpoint B",
             "mechanism": "electrical_bus"},
        ]},
    }
    n2, e2 = _collect_graph(Path("/tmp"), state)
    names2 = {_norm(v["name"]) for v in n2.values()}
    chk("skips_fastener", "fastener set" not in names2)
    chk("skips_cable_node", "sensor interconnect cable" not in names2)
    chk("skips_cap_node", "ambient light cap" not in names2)
    # +1 USB/LiPo Power node is required when Compute UI Module is present.
    chk("no_ghost_nodes", len(n2) <= 4 and "ghost" not in " ".join(names2))
    chk("no_ghost_edges", all(
        "ghost" not in e["from"] and "ghost" not in e["to"] for e in e2))
    chk("alias_mcu", any(e["from"] == "compute ui module" or e["to"] == "compute ui module"
                         for e in e2))
    chk("optical_from_context", any(e["kind"] == "optical" for e in e2))
    chk("enclosure_shell_wired", any(
        e["kind"] == "mechanical" and (
            (e["from"] in n2 and _ENCLOSURE_SHELL_RE.search(n2[e["from"]]["name"]))
            or (e["to"] in n2 and _ENCLOSURE_SHELL_RE.search(n2[e["to"]]["name"]))
        ) for e in e2
    ))
    # proveCatch: cap must NOT steal mounts (the fake-10 failure mode).
    chk("no_cap_mount_target", all(
        "cap" not in (n2.get(e["from"], {}) or {}).get("name", "").lower()
        and "cap" not in (n2.get(e["to"], {}) or {}).get("name", "").lower()
        for e in e2
    ))
    # proveCatch: absorbed-host topology + Compute kit must mint Power column.
    state_pwr = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-201", "requirement": "Compute UI Module", "status": "OK"},
            {"tag": "X-201", "requirement": "LED Source Board", "status": "OK"},
            {"tag": "I-202", "requirement": "Optical Detector Module", "status": "OK"},
            {"tag": "X-207", "requirement": "Enclosure Shell", "status": "OK"},
        ],
        "orchestratorContract": {"topology": [
            {"from_part": "Usb Interface", "to_part": "DC DC Regulator",
             "mechanism": "electrical_bus",
             "material_context": "DC power rail (instrument-internal)"},
            {"from_part": "DC DC Regulator", "to_part": "Microcontroller",
             "mechanism": "electrical_bus",
             "material_context": "DC power rail (instrument-internal)"},
            {"from_part": "DC DC Regulator", "to_part": "LED Driver",
             "mechanism": "electrical_bus",
             "material_context": "DC power rail (instrument-internal)"},
            {"from_part": "Optical Detector Module", "to_part": "Microcontroller",
             "mechanism": "signal",
             "material_context": "analogue detector signal"},
        ]},
    }
    n3, e3 = _collect_graph(Path("/tmp"), state_pwr)
    m3 = layout_metrics(n3, e3, content_bottom=200, title_top=500)
    chk("power_column_present", any(n.get("block") == "Power" for n in n3.values()))
    chk("power_edge_present", any(e.get("kind") == "power" for e in e3))
    chk("compute_kit_story_ok", m3.get("story_ok") is True and m3.get("ok") is True)
    chk("host_alias_to_compute", any(
        e.get("from") == "compute ui module" or e.get("to") == "compute ui module"
        for e in e3
    ))

    assert _classify_block("Cuvette Holder") == "Optical"
    assert _classify_block("LED Source Board") == "Optical"
    assert _classify_block("Compute UI Module") == "PCB"
    assert _classify_block("Enclosure Shell") == "Enclosure"
    assert _classify_block("Peltier Module") == "Thermal"
    assert _classify_block("Sample Block") == "Thermal"
    assert _classify_block("Main Controller MCU") == "PCB"
    assert _edge_kind("signal", "optical path (free-space / guided light)") == "optical"
    assert _edge_kind("signal", "DC power rail (instrument-internal)") == "power"

    # proveCatch (NinjaPCR 1203): thermocycler MCU + TEC must mint Power column
    # + power edges without a colorimeter-named "Compute UI Module".
    state_tc = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-101", "requirement": "Main Controller MCU", "status": "OK"},
            {"tag": "X-110", "requirement": "Peltier Module", "status": "OK"},
            {"tag": "X-111", "requirement": "Sample Block", "status": "OK"},
            {"tag": "X-120", "requirement": "Enclosure Shell", "status": "OK"},
            {"tag": "X-121", "requirement": "Terminal Block", "status": "OK"},
        ],
        "orchestratorContract": {"topology": []},
    }
    n_tc, e_tc = _collect_graph(Path("/tmp"), state_tc)
    m_tc = layout_metrics(n_tc, e_tc, content_bottom=200, title_top=500)
    chk("tc_power_column", any(n.get("block") == "Power" for n in n_tc.values()))
    chk("tc_power_edge", any(e.get("kind") == "power" for e in e_tc))
    chk("tc_thermal_load_edge", any(
        e.get("kind") == "power"
        and ("peltier" in e.get("from", "") or "peltier" in e.get("to", "")
             or "sample" in e.get("from", "") or "sample" in e.get("to", ""))
        for e in e_tc
    ))
    chk("tc_story_ok", m_tc.get("story_ok") is True)
    chk("tc_not_thin", len(n_tc) >= 4 and len(e_tc) >= 1)
    # proveCatch (Poseidon 2026-07-16): OPEN-array MCU + driver + stepper must
    # mint Power + Actuation columns and a driver→motor power edge — never a
    # 1-node stub when requirementsBom is missing (word fallback).
    state_sp = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-101", "requirement": "Main Controller MCU", "status": "OK"},
            {"tag": "X-201", "requirement": "Stepper Driver Board", "status": "OK"},
            {"tag": "X-202", "requirement": "Stepper Motor", "status": "OK"},
            {"tag": "X-203", "requirement": "Lead Screw", "status": "OK"},
            {"tag": "X-204", "requirement": "Terminal Block", "status": "OK"},
            {"tag": "X-205", "requirement": "Console Enclosure", "status": "OK"},
            {"tag": "X-206", "requirement": "Touch Display", "status": "OK"},
        ],
        "orchestratorContract": {"topology": []},
    }
    n_sp, e_sp = _collect_graph(Path("/tmp"), state_sp)
    m_sp = layout_metrics(n_sp, e_sp, content_bottom=200, title_top=500)
    chk("sp_actuation_column", any(n.get("block") == "Actuation" for n in n_sp.values()))
    chk("sp_driver_is_pcb", any(
        n.get("block") == "PCB" and "driver" in (n.get("name") or "").lower()
        for n in n_sp.values()
    ))
    chk("sp_absorbs_lead_screw", "lead screw" not in {_norm(v["name"]) for v in n_sp.values()})
    chk("sp_keeps_motor", any("stepper motor" in _norm(v["name"]) for v in n_sp.values()))
    chk("sp_motor_power_edge", any(
        e.get("kind") == "power"
        and ("stepper" in e.get("from", "") or "stepper" in e.get("to", "")
             or "driver" in e.get("from", "") or "driver" in e.get("to", ""))
        for e in e_sp
    ))
    chk("sp_story_ok", m_sp.get("story_ok") is True and m_sp.get("ok") is True)
    # proveCatch (OpenFlexure 0939): generic Power Distribution Subcomponent N
    # leaves are plant-template residue. They must not become device principals.
    state_of = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-102", "requirement": "Microcontroller (MCU)", "status": "OK"},
            {"tag": "I-105", "requirement": "Motor Controller Board", "status": "OK"},
            {"tag": "I-108", "requirement": "Sbc Compute Module", "status": "OK"},
            {"tag": "X-111", "requirement": "Geared Stepper Motor X", "status": "OK"},
            {"tag": "X-112", "requirement": "Geared Stepper Motor Focus", "status": "OK"},
            {"tag": "X-113", "requirement": "Flexure Stage Body", "status": "OK"},
            {"tag": "X-101", "requirement": "Optics Tube Assembly", "status": "OK"},
            {"tag": "X-102", "requirement": "Rms Objective Mount", "status": "OK"},
            {"tag": "X-103", "requirement": "Webcam Grade Camera", "status": "OK"},
            {"tag": "X-105", "requirement": "Printed Main Body", "status": "OK"},
            {"tag": "X-116", "requirement": "Low Voltage DC Supply", "status": "OK"},
            {"tag": "EP-101", "requirement": "Usb Or Barrel Power Inlet", "status": "OK"},
            {"tag": "X-123", "requirement": "Power Distribution Subcomponent 1", "status": "OK"},
            {"tag": "X-124", "requirement": "Power Distribution Subcomponent 2", "status": "OK"},
            {"tag": "X-125", "requirement": "Power Distribution Subcomponent 3", "status": "OK"},
            {"tag": "X-128", "requirement": "HMI Ergonomics Subcomponent 1", "status": "OK"},
        ],
        "orchestratorContract": {"topology": [
            {"from_part": "Power Distribution Subcomponent 1", "to_part": "Microcontroller",
             "mechanism": "electrical_bus"},
            {"from_part": "Sbc Compute Module", "to_part": "Motor Controller Board",
             "mechanism": "signal"},
            {"from_part": "Geared Stepper Motor X", "to_part": "Flexure Stage Body",
             "mechanism": "mechanical"},
        ]},
    }
    n_of, e_of = _collect_graph(Path("/tmp"), state_of)
    m_of = layout_metrics(n_of, e_of, content_bottom=200, title_top=500)
    of_names = {_norm(v["name"]) for v in n_of.values()}
    chk("of_skips_power_distribution_subcomponents", not any(
        "power distribution subcomponent" in name for name in of_names))
    chk("of_skips_hmi_subcomponent", "hmi ergonomics subcomponent 1" not in of_names)
    chk("of_under_node_cap", len(n_of) <= MAX_PRINCIPAL_NODES)
    chk("of_shell_wired", (m_of.get("shell_degree") or 0) >= 1)
    chk("of_layout_ok", m_of.get("ok") is True)
    # Word fallback when requirementsBom was wiped mid-chain.
    state_sp_words = {
        "isInstrumentDevice": True,
        "moduleDecomposition": {
            "modules": [{
                "sub_modules": [{
                    "words": [
                        {"name_human": "Main Controller Mcu"},
                        {"name_human": "Stepper Driver Board"},
                        {"name_human": "Stepper Motor"},
                        {"name_human": "Terminal Block"},
                        {"name_human": "Console Enclosure"},
                    ],
                }],
            }],
        },
        "orchestratorContract": {"topology": []},
    }
    n_wf, e_wf = _collect_graph(Path("/tmp"), state_sp_words)
    chk("sp_word_fallback_not_thin", len(n_wf) >= 4 and len(e_wf) >= 1)
    # proveCatch (1258): fat host BoM must absorb into compute — not 32 nodes.
    state_fat = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-101", "requirement": "Main Controller MCU", "status": "OK"},
            {"tag": "I-104", "requirement": "Wifi Module", "status": "OK"},
            {"tag": "I-105", "requirement": "Flash Storage", "status": "OK"},
            {"tag": "I-106", "requirement": "Debug Uart", "status": "OK"},
            {"tag": "X-112", "requirement": "Polyfuse Resettable", "status": "OK"},
            {"tag": "X-113", "requirement": "Bulk Capacitor", "status": "OK"},
            {"tag": "X-109", "requirement": "Status LED", "status": "OK"},
            {"tag": "X-101", "requirement": "Current Sense Shunt", "status": "OK"},
            {"tag": "I-110", "requirement": "Fan Failure Detect", "status": "OK"},
            {"tag": "I-111", "requirement": "Estop Or Power Kill", "status": "OK"},
            {"tag": "X-111", "requirement": "Wire Harness", "status": "OK"},
            {"tag": "X-115", "requirement": "Peltier Tec Module", "status": "OK"},
            {"tag": "X-114", "requirement": "Aluminum Sample Block", "status": "OK"},
            {"tag": "K-101", "requirement": "Heatsink Fan Assembly", "status": "OK"},
            {"tag": "X-106", "requirement": "Enclosure Shell", "status": "OK"},
            {"tag": "X-110", "requirement": "Terminal Block", "status": "OK"},
        ],
        "orchestratorContract": {"topology": []},
    }
    n_fat, e_fat = _collect_graph(Path("/tmp"), state_fat)
    m_fat = layout_metrics(n_fat, e_fat, content_bottom=200, title_top=500)
    chk("fat_under_node_cap", len(n_fat) <= MAX_PRINCIPAL_NODES)
    chk("fat_absorbs_wifi", "wifi module" not in {_norm(v["name"]) for v in n_fat.values()})
    chk("fat_keeps_mcu", any("mcu" in _norm(v["name"]) for v in n_fat.values()))
    chk("fat_power_story", any(e.get("kind") == "power" for e in e_fat))
    chk("fat_layout_ok", m_fat.get("ok") is True)
    # proveCatch (colorimeter 1236): "… On Compute Ui" peripherals must absorb, not
    # become extra compute principals that + power/signal clones blow MAX_EDGES.
    state_on_compute = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-101", "requirement": "Compute Ui Module", "status": "OK"},
            {"tag": "I-102", "requirement": "Host Power Rail On Compute Ui", "status": "OK"},
            {"tag": "I-103", "requirement": "Input Protection On Compute Ui", "status": "OK"},
            {"tag": "I-104", "requirement": "Firmware Storage", "status": "OK"},
            {"tag": "I-105", "requirement": "Ferrite Emc Bead", "status": "OK"},
            {"tag": "I-106", "requirement": "Esd Protection Network", "status": "OK"},
            {"tag": "I-107", "requirement": "Low Noise Regulator", "status": "OK"},
            {"tag": "X-115", "requirement": "Usb 5v Input", "status": "OK"},
            {"tag": "X-102", "requirement": "LED Source", "status": "OK"},
            {"tag": "I-110", "requirement": "Optical Detector Module", "status": "OK"},
            {"tag": "X-109", "requirement": "Enclosure Shell", "status": "OK"},
        ],
        "orchestratorContract": {"topology": [
            {"from_part": "Usb 5v Input", "to_part": "Compute Ui Module",
             "mechanism": "electrical_bus"},
            {"from_part": "Usb 5v Input", "to_part": "Compute Ui Module",
             "mechanism": "signal"},
            {"from_part": "Compute Ui Module", "to_part": "LED Source",
             "mechanism": "electrical_bus"},
            {"from_part": "Optical Detector Module", "to_part": "Compute Ui Module",
             "mechanism": "signal"},
        ]},
    }
    n_oc, e_oc = _collect_graph(Path("/tmp"), state_on_compute)
    m_oc = layout_metrics(n_oc, e_oc, content_bottom=200, title_top=500)
    oc_names = {_norm(v["name"]) for v in n_oc.values()}
    chk("on_compute_absorbs_host_rail", "host power rail on compute ui" not in oc_names)
    chk("on_compute_absorbs_input_prot", "input protection on compute ui" not in oc_names)
    chk("on_compute_absorbs_firmware", "firmware storage" not in oc_names)
    chk("on_compute_under_edge_cap", len(e_oc) <= MAX_EDGES)
    chk("on_compute_layout_ok", m_oc.get("ok") is True)
    # proveCatch (colorimeter 2008): catalogue MCU pin ("Adafruit Feather M0") must
    # still trigger host absorb — otherwise 27 nodes / 39 edges blows MAX_EDGES.
    state_feather = {
        "isInstrumentDevice": True,
        "requirementsBom": [
            {"tag": "I-104", "requirement": "Adafruit Feather M0", "status": "OK"},
            {"tag": "I-106", "requirement": "Debug Interface", "status": "OK"},
            {"tag": "I-107", "requirement": "I2c Level Shifter", "status": "OK"},
            {"tag": "X-121", "requirement": "Firmware Storage", "status": "OK"},
            {"tag": "X-119", "requirement": "BLM21PG221SN1D Ferrite Bead", "status": "OK"},
            {"tag": "X-118", "requirement": "Power Indicator LED", "status": "OK"},
            {"tag": "X-120", "requirement": "Host Power Rail On Compute Ui", "status": "OK"},
            {"tag": "EP-102", "requirement": "Board Level Decoupling", "status": "OK"},
            {"tag": "X-115", "requirement": "Usb 5v Input", "status": "OK"},
            {"tag": "X-117", "requirement": "Bench Psu Input", "status": "OK"},
            {"tag": "X-114", "requirement": "Polyfuse Resettable", "status": "OK"},
            {"tag": "X-116", "requirement": "Low Noise Regulator", "status": "OK"},
            {"tag": "X-103", "requirement": "DC DC Regulator", "status": "OK"},
            {"tag": "I-102", "requirement": "Esd Protection Network", "status": "OK"},
            {"tag": "I-101", "requirement": "Input Protection On Compute Ui", "status": "OK"},
            {"tag": "X-105", "requirement": "Control Switch", "status": "OK"},
            {"tag": "X-106", "requirement": "Mounting Bezel", "status": "OK"},
            {"tag": "X-112", "requirement": "User Facing Legend", "status": "OK"},
            {"tag": "X-108", "requirement": "SSD1306 0.96 inch OLED", "status": "OK"},
            {"tag": "X-101", "requirement": "LED Driver", "status": "OK"},
            {"tag": "X-102", "requirement": "Kingbright 470 nm LED", "status": "OK"},
            {"tag": "X-104", "requirement": "Wavelength Selection Module", "status": "OK"},
            {"tag": "I-110", "requirement": "Optical Detector Module", "status": "OK"},
            {"tag": "X-111", "requirement": "Cuvette Holder", "status": "OK"},
            {"tag": "X-110", "requirement": "Optical Path Baffle", "status": "OK"},
            {"tag": "X-109", "requirement": "Enclosure Shell", "status": "OK"},
            {"tag": "X-107", "requirement": "Display Bezel", "status": "OK"},
        ],
        "orchestratorContract": {"topology": [
            {"from_part": "Usb 5v Input", "to_part": "Adafruit Feather M0",
             "mechanism": "electrical_bus"},
            {"from_part": "Adafruit Feather M0", "to_part": "LED Driver",
             "mechanism": "electrical_bus"},
            {"from_part": "Optical Detector Module", "to_part": "Adafruit Feather M0",
             "mechanism": "signal"},
        ]},
    }
    n_fe, e_fe = _collect_graph(Path("/tmp"), state_feather)
    m_fe = layout_metrics(n_fe, e_fe, content_bottom=200, title_top=500)
    fe_names = {_norm(v["name"]) for v in n_fe.values()}
    chk("feather_is_compute", any("feather" in n for n in fe_names))
    chk("feather_absorbs_host_rail", "host power rail on compute ui" not in fe_names)
    chk("feather_absorbs_decoupling", "board level decoupling" not in fe_names)
    chk("feather_absorbs_ferrite_mpn", not any("blm21" in n or "ferrite" in n for n in fe_names))
    chk("feather_under_node_cap", len(n_fe) <= MAX_PRINCIPAL_NODES)
    chk("feather_under_edge_cap", len(e_fe) <= MAX_EDGES)
    chk("feather_layout_ok", m_fe.get("ok") is True)
    # proveCatch: 1-node stub must FAIL story (Goodhart net on empty interconnect).
    thin_stub = layout_metrics(
        {"device": {"name": "Device (no graph yet)", "tag": "", "block": "PCB"}},
        [],
        content_bottom=100, title_top=400,
    )
    chk("stub_story_fails", thin_stub.get("story_ok") is False and thin_stub.get("ok") is False)

    print("draw_interconnect selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        return 1 if _selftest() else 0
    if not argv:
        print("usage: draw_interconnect.py <out_dir> [state.json]", file=sys.stderr)
        return 1
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    res = generate_interconnect(out_dir, state_path)
    print(f"[interconnect] {res}")
    return 0 if res.get("ok") or res.get("skipped") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
