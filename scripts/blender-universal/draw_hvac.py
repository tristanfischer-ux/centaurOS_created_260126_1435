#!/usr/bin/env python3
"""draw_hvac.py — UNIVERSAL HVAC / DUCT-LAYOUT drawing generator.

The MECHANICAL-SERVICES drawing of the set — the air-side / cooling companion to
draw_ga.py (GA), draw_pid.py (P&ID) and draw_single_line.py (SLD).  Same contract:
it does NOT recompute anything and it does NOT touch build_universal_scene.py — it
CONSUMES that generator's outputs (the placed-equipment manifest + the sized
connection schedule) plus the archetype state, and PROJECTS the air / cooling
distribution into a standard HVAC layout: a ducted PLAN (the supply hub → served
zones → return spine) + a SECTION, the real deliverable a building-services
(mechanical) engineer expects to set out the air system.

INPUTS (read-only):
  <out>/parts-manifest.json   — written by build_universal_scene.py after placement.
        Equipment positions + footprints; the AHU / DX unit / CRAC / chiller / fans
        and the served racks/zones are picked out of this by role (name regex).
        x = plant length (east), y = plant width (north), z = elevation (up); mm.
  <state.json>                — the archetype state.  Two things are read:
        (1) topology (engineeringContract / orchestratorContract) — the THERMAL / air
            edges (hub → consumer) give the served-zone connectivity when the manifest
            doesn't place the racks individually.
        (2) quantities — the AIRFLOW the air system actually carries
            (`hvac_airflow_cms` / `hvac_airflow_cmh` for an AHU; `chassis_airflow_cfm`
            for a server CRAC) + the cooling duties (`hvac_cooling_kw`,
            `system_thermal_dissipation_kw`, …).  This is what SIZES the ducts:
            duct area = airflow / target velocity (~4-8 m/s) → a W×H section.
  <out>/connection-schedule.json — OPTIONAL enrichment.  The sized thermal runs
        (hub → rack[N], with kind=duct OR a liquid coolant DN + the carried kW + the
        run length) give the AS-MODELLED distribution.  A LIQUID coolant loop (BESS)
        is drawn HONESTLY as a coolant loop (double-line pipe, DN-labelled), not as
        air ducts; an AIR system is drawn as sized rectangular ducts.

DERIVED ROLE-BASED AIR SYSTEM (same hub→consumer→collector pattern as the water loop):
  the AHU / DX unit / CRAC / chiller is the SUPPLY HUB → SUPPLY DUCTS fan out to the
  served zones / racks → grilles / diffusers deliver into each zone → RETURN DUCTS
  collect back to the unit.  Each duct is sized from its airflow SHARE (the hub airflow
  split across the zones it serves) ÷ a target duct velocity → a duct cross-section,
  rounded to a standard duct side; supply vs return are drawn distinctly (solid navy
  supply, dashed teal return) with airflow-direction arrows + cms/cfm labels.

PIPELINE:
  1. load_inputs()      — manifest + state + (optional) schedule.
  2. derive_air_system()— pick the supply hub(s) by role; pick the served zones (racks
       from the manifest, else derived from the contract + a clear note); read the hub
       airflow from the quantities; decide AIR vs LIQUID per hub from the material
       context / coolant chemistry; build SUPPLY + RETURN ducts, each SIZED from its
       airflow share ÷ velocity (round/rect), each carrying its flow label; attach a
       diffuser / grille to every served zone.
  3. build_hvac_svg()   — draw the PLAN (double-line sized ducts, diffusers, equipment
       tags, flow arrows + cms/cfm) + a SECTION (supply high / return low over the
       zones), a scale bar + north arrow, a supply/return/exhaust/liquid LEGEND, a
       duct/equipment SCHEDULE, a title block + "not for construction".
  4. rasterise()        — SVG → PNG (cairosvg → rsvg-convert → headless Chrome cascade).

OUTPUTS:
  <out>/drawings/hvac-layout.svg
  <out>/drawings/hvac-layout.png

Run:
  python3 scripts/blender-universal/draw_hvac.py /tmp/hvac-vertical_farm out/rerun-vertical_farm/state.json
  python3 scripts/blender-universal/draw_hvac.py /tmp/hvac-edge_ai_server out/rerun-edge_ai_server/state.json
  python3 scripts/blender-universal/draw_hvac.py /tmp/hvac-energy_storage out/rerun-energy_storage/state.json

Pure Python stdlib + (optional) a rasteriser on PATH.  No Blender import.
"""
from __future__ import annotations

import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import drawing_titleblock as _tb  # noqa: E402  (shared REV + deterministic issue date)
import drawing_building_envelope as _be  # noqa: E402  (ledger-slab building footprint)
# the SAME small-part-full-tag discipline draw_ga.py's plan view uses (v58b GA coverage
# fix): an item too small for an in-place tag still gets its FULL equipment tag drawn,
# via a keynote + leader line, so a real principal is never silently untagged on the
# HVAC sheet (2026-07-05 HVAC-label fix).
import draw_ga as _ga  # noqa: E402  (_TagPlacer — shared tag de-overlap/keynote idiom)

# Deterministic title-block issue date for THIS run (YYYY-MM-DD), set by
# generate_hvac() from the run's own artifacts; '' until set (block shows '—').
_ISSUE_DATE = ""


# ═══════════════════════════════════════════════════════════════════════════
# CONSTANTS — air-side engineering defaults (mirrors connection_sizing.py)
# ═══════════════════════════════════════════════════════════════════════════

DEFAULT_DUCT_VELOCITY_MS = 6.0          # supply-air duct 4–8 m/s (mid-band)
DUCT_VELOCITY_MAX_MS = 9.0              # the velocity the layout flags above
RHO_AIR = 1.2                           # kg/m³ (≈20 °C)
CP_AIR = 1006.0                         # J/(kg·K)
DEFAULT_SUPPLY_DT_K = 10.0             # supply-air ΔT used for an airflow fallback
CFM_PER_CMS = 2118.88                   # 1 m³/s = 2118.88 cfm

# Standard rectangular-duct side ladder [mm] (galvanised, mirrors connection_sizing).
_DUCT_SIDES = [150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800,
               900, 1000, 1200, 1400, 1600]
# Standard round-duct (spiral) diameter ladder [mm].
_ROUND_DIA = [100, 125, 150, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250]


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODEL — the derived air / cooling distribution
# ═══════════════════════════════════════════════════════════════════════════

SERVICE_SUPPLY = "supply"        # conditioned SUPPLY air (solid navy, → zone)
SERVICE_RETURN = "return"        # RETURN air back to the unit (dashed teal)
SERVICE_EXHAUST = "exhaust"      # EXHAUST / relief to outside (dashed amber)
SERVICE_LIQUID = "liquid"        # LIQUID coolant (not air) — drawn honestly as a pipe


@dataclass
class Equip:
    """One placed piece of mechanical kit (hub or served zone), projected to PLAN.
    All coords mm (x east, y north). The plan rectangle is centre ± half-footprint."""
    tag: str                     # equipment tag, e.g. 'AHU-1', 'CRAC-1', 'R-07'
    name: str
    role: str                    # 'ahu' | 'crac' | 'dx' | 'chiller' | 'fan' | 'zone'
    cx: float; cy: float          # plan centre (mm)
    w: float; d: float; h: float  # footprint extents (mm)
    z: float = 0.0               # centre elevation (mm)
    is_hub: bool = False


@dataclass
class Duct:
    """One sized duct (or coolant pipe) run from a hub to a served zone (or back)."""
    frm: str                     # from equip tag
    to: str                      # to equip tag
    service: str                 # SERVICE_SUPPLY / _RETURN / _EXHAUST / _LIQUID
    airflow_cms: float           # the airflow this run carries (m³/s); 0 for liquid
    size_label: str              # '400×250' (rect) / 'Ø315' (round) / 'DN32' (liquid)
    width_mm: float              # drawn double-line width (the larger duct side, mm)
    velocity_ms: float = 0.0     # actual duct velocity (m/s)
    duty_kw: float = 0.0         # carried cooling duty (kW), when known
    length_m: float = 0.0        # run length (m), when known from the schedule
    over_velocity: bool = False  # velocity exceeds the spec band → flagged


@dataclass
class Diffuser:
    """A supply diffuser / return grille at a served zone."""
    at: str                      # the served-zone equip tag
    service: str                 # SERVICE_SUPPLY (diffuser) | SERVICE_RETURN (grille)
    cx: float; cy: float          # plan position (mm)


@dataclass
class Dehumidifier:
    """A DEHUMIDIFICATION unit / AHU dehumidification coil the ledger carries (the latent
    side of the air system). Drawn on the supply hub as a coil + a standalone unit, with the
    latent duty + the moisture load it removes — the part of the air-side duty the sensible
    heating drawing was missing. Data-driven from the ledger; None when the design has none."""
    tag: str                     # equipment tag, e.g. 'X-104'
    name: str                    # 'Dehumidifier'
    power_kw: float = 0.0        # electrical/cooling power (kW)
    moisture_load_kg_h: float = 0.0  # the latent moisture load it removes (kg/h)


@dataclass
class AirSystem:
    archetype: str
    hubs: list[Equip]
    zones: list[Equip]
    ducts: list[Duct]
    diffusers: list[Diffuser]
    bbox: dict
    medium: str                  # 'air' | 'liquid' | 'mixed' — the dominant medium
    airflow_cms: float           # the system design airflow (m³/s), 0 if pure-liquid
    cooling_kw: float            # the system cooling duty (kW)
    zones_derived: bool          # True when zones were derived (not placed individually)
    notes: list[str] = field(default_factory=list)
    schedule_present: bool = False
    duty_word: str = "cooling"   # 'heating' | 'cooling' — honest air-side duty label
    dehumidifier: Optional["Dehumidifier"] = None   # the ledger's dehumidification unit
    # NO-ORPHAN-SUBSYSTEM (Sam Green SME review, 2026-07-07): True when NOTHING in the
    # design carries an HVAC/climate-control requirement — see the check in
    # derive_air_system for the exact signal set. When True, generate_hvac() writes NO
    # drawing at all (the renderer's existing existsSync skip omits the sheet), instead
    # of synthesising a fake AHU so "the layout still reads". A subsystem with no driving
    # requirement anywhere in the brief/physics/BoM must never be hallucinated onto a
    # dossier — universal, keyed on requirement signals, never a product-class name.
    not_applicable: bool = False
    not_applicable_reason: str = ""


# ═══════════════════════════════════════════════════════════════════════════
# INPUT LOADING
# ═══════════════════════════════════════════════════════════════════════════

def load_inputs(out_dir: str, state_path: Optional[str],
                manifest_path: Optional[str] = None):
    """Read parts-manifest.json (required) + state.json (required) + the optional
    connection-schedule.json.  Returns (manifest, state, schedule)."""
    mp = Path(manifest_path) if manifest_path else Path(out_dir) / "parts-manifest.json"
    if not mp.is_file():
        raise FileNotFoundError(
            f"no parts-manifest.json in {out_dir} (run build_universal_scene.py with "
            f"INSPECT=1 BLENDER_OUT_DIR={out_dir} -- <state.json> first)")
    with open(mp) as fh:
        manifest = json.load(fh)

    state = {}
    for c in ([Path(state_path)] if state_path else []) + [Path(out_dir) / "state.json"]:
        if c and c.is_file():
            with open(c) as fh:
                state = json.load(fh)
            break

    schedule = {}
    sp = Path(out_dir) / "connection-schedule.json"
    if sp.is_file():
        with open(sp) as fh:
            schedule = json.load(fh)
    return manifest, state, schedule


# ═══════════════════════════════════════════════════════════════════════════
# STATE / QUANTITY helpers
# ═══════════════════════════════════════════════════════════════════════════

def _archetype_name(out_dir: str, state: dict) -> str:
    for ck in ("parsedBrief", "engineeringContract", "orchestratorContract"):
        c = state.get(ck) or {}
        pc = c.get("product_class") or c.get("productClass")
        if pc:
            return str(pc)
    if state.get("projectId"):
        return str(state["projectId"])
    base = re.sub(r"^(hvac|rerun|bl-univ)[-_]", "", Path(out_dir).name)
    return base or "facility"


def _quantity(state: dict, *keys):
    """First matching quantity VALUE across both contracts (dict OR list form)."""
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict):
            for k in keys:
                if k in q:
                    v = q[k]
                    return v.get("value") if isinstance(v, dict) else v
        elif isinstance(q, list):
            for item in q:
                if item.get("key") in keys:
                    return item.get("value")
    return None


def _topology(state: dict):
    for ck in ("engineeringContract", "orchestratorContract"):
        t = (state.get(ck) or {}).get("topology")
        if isinstance(t, list) and t:
            return t
    return []


def _coolant_is_liquid(state: dict) -> bool:
    """True when the design carries a LIQUID coolant chemistry (glycol / water) — the
    cue that the main 'thermal' loop is liquid cooling, NOT air."""
    for ck in ("engineeringContract", "orchestratorContract"):
        sq = (state.get(ck) or {}).get("shared_quantities") or {}
        blob = " ".join(str(v) for v in sq.values()).lower()
        if re.search(r"glycol|propylene|ethylene|\bmpg\b|\bmeg\b|deionised|"
                     r"deionized|coolant", blob):
            return True
    return False


def _humanise(tag: str) -> str:
    if not tag:
        return tag
    ACR = {"co2", "h2", "ahu", "crac", "crah", "dx", "hvac", "led", "vf", "fcu",
           "ac", "dc", "mv", "lv", "hv", "bess", "pcs", "it", "ups", "cfm", "cms"}
    parts = re.split(r"[_\s]+", tag.strip())
    out = [p.upper() if p.lower() in ACR else p for p in parts]
    s = " ".join(out)
    return s[:1].upper() + s[1:] if s else s


# ═══════════════════════════════════════════════════════════════════════════
# ROLE CLASSIFICATION — which placed parts are HUBS, which are SERVED ZONES
# ═══════════════════════════════════════════════════════════════════════════

# A SUPPLY-HUB role (the thing air/coolant comes FROM).  Order matters: the first
# match wins, so a 'CRAC' beats a generic 'fan'.
# 2026-07-05 BESS HVAC coverage pass: the DX rule's `packaged.?(ac|unit)` required the
# literal word "packaged" — a bare "container AC unit" (no "packaged" anywhere in the name)
# matched NOTHING at all and was silently dropped from the air system. Added `\bac unit\b` /
# `container.?ac` so a containerised AC unit resolves the same way a packaged one already
# did. `condensate` is inserted BEFORE the generic hvac/climate bucket so an "HVAC condensate
# pump" (real name: contains the bare token "hvac") routes to its own honest role instead of
# being mis-typed as a full air-handling unit. `cooling.?pump`/`coolant.?pump` and
# `expansion.?tank` and `louvre`/`louver` were entirely absent — those BoM items matched
# NEITHER a hub NOR a zone pattern and were dropped from the drawing outright (not merely
# mislabelled); each now has its own role so it enters the drawn equipment set at all.
_HUB_PATTERNS = [
    (re.compile(r"\bcrac\b|\bcrah\b|computer.?room.?air|precision.?air|"
                r"in.?row|inrow", re.I), "crac"),
    (re.compile(r"\bahu\b|air.?handl|air.?handling|fan.?coil|\bfcu\b|"
                r"\bmau\b|makeup.?air|make.?up.?air|rooftop|\brtu\b", re.I), "ahu"),
    (re.compile(r"\bdx\b|direct.?expansion|split.?unit|condensing.?unit|"
                r"packaged.?(ac|unit)|\bac unit\b|container.?ac|mini.?split|heat.?pump",
                re.I), "dx"),
    (re.compile(r"condensate", re.I), "condensate"),
    (re.compile(r"chiller|cooling.?skid|coolant.?skid|refrig|cooling.?plant", re.I),
     "chiller"),
    (re.compile(r"cooling.?pump|coolant.?pump", re.I), "pump"),
    (re.compile(r"expansion.?tank", re.I), "tank"),
    (re.compile(r"louvre|louver", re.I), "louvre"),
    (re.compile(r"\bhvac\b|climate|environmental.?control|conditioning", re.I), "ahu"),
    (re.compile(r"\bfan\b|blower|extract|exhaust.?fan|mixing.?fan|circulat", re.I),
     "fan"),
    # PROCESS THERMAL UTILITY (2026-07-06, CO2-mineralisation HVAC air-side/coolant
    # coverage pass): a process COOLER (a trim/product/inlet cooler rejecting heat from
    # a process stream) or a process AIR-HEATER / HEAT-RECOVERY EXCHANGER (a dryer's
    # inlet air-heater battery or exhaust heat-recovery unit) is the SAME mechanical-
    # services scope as the chiller/AHU roles above — it belongs on the HVAC/coolant
    # sheet even though it is named for the process stream it serves, not for "HVAC".
    # LOWEST PRIORITY (end of the list) so it never steals a match from a more specific
    # existing role (a "cooling pump" still resolves to the "pump" role above). Kept out
    # of _MAIN_HUB_ROLES (see derive_air_system) so a small process cooler/heater can
    # never become the plan's supply-hub origin — it is drawn + tagged + scheduled like
    # any other hub, never the duct-sizing source. Universal — generic mechanical-
    # equipment nouns, no per-class/per-part table.
    (re.compile(r"\bcoolers?\b", re.I), "cooler"),
    (re.compile(r"heat.?recovery exchanger|heater battery|\bair.?heater\b", re.I),
     "process_air_heater"),
    # COOLANT DISTRIBUTION MANIFOLD (2026-07-06, BESS HVAC coverage fix): the header/
    # manifold that splits the chiller's flow/return mains out to the per-rack cold
    # plates is a real, separately-tagged BoM item (e.g. CD-101 'coolant distribution
    # manifold') that sat on NEITHER the hub list NOR the zone list — it matched no
    # pattern at all and was silently dropped from the drawing even though it is a
    # named principal on the coolant loop between the chiller and the racks. Same
    # idiom as the process-thermal-utility roles above: drawn + tagged (with its own
    # real BoM tag, per the "REAL BoM tag first" hub-creation rule) + scheduled, but
    # excluded from the sizing-origin candidates below (a manifold is a distribution
    # point, not the coolant SOURCE). Universal — generic plumbing noun, no per-class
    # table; covers any coolant-loop archetype with a distribution/collector manifold.
    # SCOPED to coolant/cooling/glycol (not a bare "distribution manifold" — a water-
    # treatment or fertigation plant has its own unrelated distribution manifolds on
    # the process-water side that must NEVER be pulled onto the HVAC/coolant sheet).
    (re.compile(r"coolant.{0,20}manifold|cooling.{0,20}manifold|glycol.{0,20}manifold",
                re.I), "manifold"),
]

# Hub roles that are PROCESS THERMAL UTILITY equipment (or auxiliary distribution
# plumbing, e.g. a coolant manifold) shown on the HVAC sheet for coverage/labelling
# only — never eligible to become the plan's supply-hub origin (see
# the _HUB_PATTERNS comment above + derive_air_system's main_hub selection).
_PROCESS_THERMAL_ROLES = {"cooler", "process_air_heater", "manifold"}

# A SERVED-ZONE role (the thing air/coolant goes TO).  Racks / grow zones / aisles.
_ZONE_PATTERNS = [
    re.compile(r"\brack\b|cabinet|\benclosure\b|\baisle\b|server|compute|gpu", re.I),
    re.compile(r"grow|canopy|cultivation|bench|trolley|tier|nursery|propagat", re.I),
]

# Equipment we never treat as a served air zone or a hub (other BoP skids).
_NEUTRAL_RE = re.compile(
    r"control|fire|nutrient|water|dosing|switchgear|transformer|\bbms\b|"
    r"battery management|\bpdu\b|\bups\b|inverter|\bpcs\b|power conversion", re.I)


def _classify_role(name: str, module: str):
    """Return ('hub', role) / ('zone', None) / (None, None) for a placed part."""
    blob = f"{name} {module}"
    for rx, role in _HUB_PATTERNS:
        if rx.search(blob):
            return "hub", role
    for rx in _ZONE_PATTERNS:
        if rx.search(blob):
            return "zone", None
    return None, None


def _equip_from_row(r: dict) -> tuple:
    """Project a manifest row into (cx, cy, w, d, h, z)."""
    pos = r.get("pos_mm") or [0, 0, 0]
    x, y, z = float(pos[0]), float(pos[1]), float(pos[2])
    d = r.get("dims_mm") or {}
    if "dia" in d:
        dia = float(d.get("dia") or 0.0)
        ln = float(d.get("len") or 0.0)
        return x, y, dia, dia, ln, z
    return x, y, float(d.get("w") or 0.0), float(d.get("d") or 0.0), \
        float(d.get("h") or 0.0), z


# ═══════════════════════════════════════════════════════════════════════════
# DUCT SIZING — airflow → standard duct cross-section
# ═══════════════════════════════════════════════════════════════════════════

def _round_up(value, ladder):
    for s in ladder:
        if s >= value:
            return s
    return ladder[-1]


def size_duct(airflow_cms: float, round_duct: bool = False,
              velocity_target=DEFAULT_DUCT_VELOCITY_MS):
    """Size a duct from an airflow (m³/s).  Returns (size_label, draw_width_mm,
    actual_velocity_ms, over_velocity).  Rectangular by default (≈1.6:1 aspect, the
    convention a layout shows as 'W×H'); round on request (Ø label)."""
    airflow_cms = max(airflow_cms, 1e-4)
    area_m2 = airflow_cms / max(velocity_target, 0.5)
    if round_duct:
        dia_ideal = math.sqrt(area_m2 * 4.0 / math.pi) * 1000.0
        dia = _round_up(dia_ideal, _ROUND_DIA)
        v = airflow_cms / max(1e-9, math.pi * (dia / 2000.0) ** 2)
        return f"Ø{dia}", float(dia), round(v, 1), v > DUCT_VELOCITY_MAX_MS
    side_ideal = math.sqrt(area_m2) * 1000.0
    w = _round_up(side_ideal, _DUCT_SIDES)
    h_ideal = area_m2 * 1e6 / max(w, 1.0)
    h = _round_up(h_ideal, _DUCT_SIDES)
    v = airflow_cms / max(1e-9, (w / 1000.0) * (h / 1000.0))
    return f"{w}×{h}", float(max(w, h)), round(v, 1), v > DUCT_VELOCITY_MAX_MS


def _cfm(cms: float) -> int:
    return int(round(cms * CFM_PER_CMS))


# ═══════════════════════════════════════════════════════════════════════════
# SCHEDULE lookups — the as-modelled thermal runs (hub → consumer)
# ═══════════════════════════════════════════════════════════════════════════

def _thermal_rows(schedule: dict):
    """Every thermal / duct / fluid-loop run in the schedule (the cooling distribution),
    excluding pure electrical rows.  Returns the raw row dicts."""
    out = []
    for r in (schedule.get("rows") or []):
        mech = (r.get("mechanism") or "").lower()
        if mech in ("thermal", "thermal_return", "fluid_loop") or \
                (r.get("kind") == "duct"):
            out.append(r)
    return out


def _row_duty_kw(r: dict) -> float:
    """Pull a kW duty out of a schedule row (the rating or the qty desc)."""
    for fld in ("rating", "carried_rating"):
        v = r.get(fld)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            m = re.search(r"([\d.]+)\s*kW", v, re.I)
            if m:
                return float(m.group(1))
    m = re.search(r"\(([\d.]+)\s*kW", str(r.get("qty") or ""), re.I)
    return float(m.group(1)) if m else 0.0


def _row_len_m(r: dict) -> float:
    v = r.get("length_m")
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"([\d.]+)\s*m\b", str(r.get("qty") or ""))
    return float(m.group(1)) if m else 0.0


# ═══════════════════════════════════════════════════════════════════════════
# DERIVE the role-based air / cooling system
# ═══════════════════════════════════════════════════════════════════════════

def derive_air_system(manifest: dict, state: dict, schedule: dict,
                      out_dir: str) -> AirSystem:
    """Build the supply hub → served zones → return distribution, the same
    hub→consumer→collector pattern as the water loop.

    HONESTY: a system whose main thermal loop is LIQUID coolant (glycol/water, e.g. a
    BESS) is built as a LIQUID loop (drawn as coolant pipes, DN-sized from the schedule)
    — NOT mis-drawn as air ducts.  An AIR system (AHU / DX / CRAC) is built as sized
    rectangular ducts from the design airflow.  When the served zones aren't placed
    individually in the manifest (e.g. a VF whose grow racks aggregate away), the zones
    are DERIVED from the contract (canopy / rack count) and a clear note records it."""
    arch = _archetype_name(out_dir, state)
    rows = manifest.get("parts") or []
    bbox = manifest.get("bbox_mm") or {}
    notes: list[str] = []

    # ---- BUILDING ENVELOPE from the LEDGER slab (the #122 one-source rule) -------
    # The HVAC plan must zone the SAME building the GA draws, and that building is the
    # LEDGER floor slab — not the equipment-placement bbox (a long placement ribbon would
    # make the air system span a 372 m strip that the slab BoM never costs). When the ledger
    # carries a slab/floor area, swap the bbox for the slab-sized building rectangle + fit the
    # placed equipment into it. No-op for a design with no building slab (untouched).
    _build_bb, _fit = _be.building_bbox(state, bbox)
    if _build_bb is not None:
        bbox = _build_bb
    else:
        _fit = (lambda x, y: (x, y))

    # ---- partition placed kit into hubs / zones / neutral -----------------------
    hubs: list[Equip] = []
    zones: list[Equip] = []
    for r in rows:
        name = r.get("name") or ""
        module = r.get("module") or ""
        tag = r.get("equipment_tag") or "?"
        role, sub = _classify_role(name, module)
        if role == "hub":
            cx, cy, w, d, h, z = _equip_from_row(r)
            cx, cy = _fit(cx, cy)
            # REAL BoM tag first (2026-07-05 HVAC-label fix): a placed hub row already
            # carries its own equipment_tag (e.g. 'CH-101' for the liquid cooling
            # chiller) post the manifest real-name pass — the old code threw that away
            # and always minted a synthetic counter-based tag ('CH-1'), so the HVAC
            # sheet's chiller never matched its OWN BoM/schedule tag anywhere else in
            # the dossier. Fall back to the synthetic role tag only when the manifest
            # genuinely has no tag for this row (mirrors the zone branch below, which
            # already used the real tag).
            hub_tag = tag if tag and tag != "?" else _hub_tag(sub, len(hubs))
            hubs.append(Equip(tag=hub_tag, name=name, role=sub,
                              cx=cx, cy=cy, w=w, d=d, h=h, z=z, is_hub=True))
        elif role == "zone" and not _NEUTRAL_RE.search(f"{name} {module}"):
            cx, cy, w, d, h, z = _equip_from_row(r)
            cx, cy = _fit(cx, cy)
            zones.append(Equip(tag=tag, name=name, role="zone",
                               cx=cx, cy=cy, w=w, d=d, h=h, z=z))

    # ---- read the design airflow + cooling duty from the quantities -------------
    # the placed-zone count feeds the per-chassis-cfm × N fallback (a server CRAC
    # publishes airflow PER CHASSIS; the whitespace airflow is that × the racks served).
    placed_zone_n = len(zones)
    airflow_cms = _read_design_airflow(state, fallback_n=placed_zone_n)
    cooling_kw = _read_cooling_kw(state, fallback_n=placed_zone_n)

    # ---- decide the dominant MEDIUM (air vs liquid) -----------------------------
    liquid = _coolant_is_liquid(state)
    # a hub that is a 'chiller' on a liquid-coolant design ⇒ the main loop is liquid.
    main_liquid = liquid and any(h.role == "chiller" for h in hubs)
    # the air airflow may still exist (a container HVAC pair / cabinet AC aux load).
    medium = "liquid" if main_liquid and not airflow_cms else (
        "mixed" if main_liquid and airflow_cms else "air")

    # ---- NO-ORPHAN-SUBSYSTEM SCOPE GATE (Sam Green SME review, 2026-07-07) ------
    # Sam: "What is the HVAC required for? What is its design requirement?" — a real
    # Fischer Farms water-treatment P&ID has NO HVAC at all, yet the old code below
    # ALWAYS synthesised a fake AHU "so the layout still reads" whenever no real hub was
    # placed, regardless of whether the design carries any climate-control need. That is
    # a hallucinated subsystem: a drawing with no driving requirement anywhere in the
    # brief/physics/BoM. The fix is a SCOPE CHECK on requirement PROVENANCE, universal
    # across every archetype (never a class name): the design has an HVAC requirement
    # iff AT LEAST ONE of — (a) real HVAC/cooling equipment was PLACED in the manifest
    # (`hubs`); (b) a served zone (server rack / grow bench / aisle) was PLACED
    # (`zones`, read before the derive-fallback below); (c) the physics/brief contract
    # publishes a design airflow or cooling/heating duty quantity (`airflow_cms` /
    # `cooling_kw`, both 0.0 only when NO such quantity exists — see _read_design_airflow
    # / _read_cooling_kw, neither fabricates a value from nothing); (d) the routed
    # connection schedule carries a thermal/duct distribution run (`_thermal_rows`); (e)
    # the BoM carries a dehumidification unit. None of these ⇒ no HVAC anywhere in this
    # design ⇒ return NOT-APPLICABLE and never synthesise a hub. A design that legitimately
    # needs HVAC (BESS thermal management, a data-hall CRAC, a vertical-farm grow room)
    # always trips at least one signal — proven both directions in the selftest below.
    if not (hubs or zones or airflow_cms > 0 or cooling_kw > 0
            or bool(_thermal_rows(schedule)) or _read_dehumidifier(state) is not None):
        return AirSystem(
            archetype=arch, hubs=[], zones=[], ducts=[], diffusers=[], bbox=bbox,
            medium=medium, airflow_cms=0.0, cooling_kw=0.0, zones_derived=False,
            notes=[], schedule_present=False, duty_word=_duty_word(state),
            dehumidifier=None, not_applicable=True,
            not_applicable_reason=(
                "no HVAC/climate-control requirement anywhere in this design — no "
                "placed air-handling/cooling equipment, no served zone, no design "
                "airflow or cooling/heating duty quantity, no thermal distribution "
                "run, and no dehumidification unit in the BoM"),
        )

    # ---- ensure we have a hub --------------------------------------------------
    if not hubs:
        # synthesise a hub at the plant edge so the layout still reads (named from the
        # archetype's air system); record that it was derived.
        hubs.append(_synth_hub(arch, bbox, medium))
        notes.append("Air-handling unit not individually placed in the model — "
                     "shown at the plant edge from the design airflow; verify position.")

    # ---- served zones: placed racks, else DERIVE from the contract --------------
    zones_derived = False
    zd_note = ""
    if not zones:
        zones, zd_note = _derive_zones(state, bbox, arch)
        zones_derived = True
        if zd_note:
            notes.append(zd_note)

    # ---- HALL COVERAGE: the air system must serve the WHOLE building -------------
    # The HVAC plan must zone the building ENVELOPE (the same plant footprint the GA
    # draws, the manifest bbox), not a fraction of it. When the placed/derived zones span
    # only a small part of the hall (a handful of placed boxes clustered in one corner, or
    # one Enclosure-Panel stand-in), the layout reads as a single duct run over a fraction
    # of a large hall. Replace them with a representative grid of conditioned zones tiled
    # across the full footprint so the supply/return distribution covers the building.
    # Deterministic; universal (keyed on the footprint geometry, never a product class).
    if _building_under_served(zones, bbox):
        zones = _hall_zone_grid(bbox, _read_zone_count(state))
        zones_derived = True
        # ONE source of truth for the zone story: the earlier derive-zones note quoted a
        # zone count this re-zoning just changed (v54: note said "4 representative zones"
        # while the plan + title read 6) — the superseded note must not ship.
        if zd_note and zd_note in notes:
            notes.remove(zd_note)
        L_m = (bbox.get("x_max_mm", 0.0) - bbox.get("x_min_mm", 0.0)) / 1000.0
        W_m = (bbox.get("y_max_mm", 0.0) - bbox.get("y_min_mm", 0.0)) / 1000.0
        notes.append(
            f"Conditioned zones tiled across the building envelope "
            f"({L_m:.0f} m × {W_m:.0f} m) — the served spaces are not placed "
            f"individually in the model; shown as {len(zones)} representative zones so the "
            f"air distribution covers the whole hall. Verify against the room layout.")

    # ---- build the SUPPLY + RETURN distribution ---------------------------------
    ducts: list[Duct] = []
    diffusers: list[Diffuser] = []
    schedule_present = bool(_thermal_rows(schedule))

    # the primary hub is the largest-footprint hub (the main AHU/CRAC/chiller).
    hubs.sort(key=lambda e: -(e.w * e.d))
    # PROCESS THERMAL UTILITY hubs (cooler / process_air_heater, added 2026-07-06) are
    # drawn + tagged + scheduled like any other hub but must NEVER become the duct-
    # sizing origin (they aren't the air/coolant SOURCE — they're process kit shown for
    # HVAC-sheet coverage). Excluding them from the candidate list is a no-op whenever
    # the design carries none (every archetype before this addition): the filtered list
    # equals `hubs` and `main_hub` is unchanged.
    _main_candidates = [h for h in hubs if h.role not in _PROCESS_THERMAL_ROLES]
    main_hub = _main_candidates[0] if _main_candidates else hubs[0]

    if medium == "liquid":
        _build_liquid_loop(main_hub, zones, schedule, ducts, diffusers, notes)
    else:
        # ONE source of truth: the ducts and the title-block headline must quote the SAME
        # airflow. _build_air_ducts derives a fallback airflow when none is published
        # (v54: ducts said 3.0 m³/s while the title read "0.00 m³/s (0 cfm)") — keep the
        # EFFECTIVE value it actually sized the ducts from.
        airflow_cms = _build_air_ducts(main_hub, zones, airflow_cms, cooling_kw, schedule,
                                       ducts, diffusers, notes, medium == "mixed", state)

    # ---- DEHUMIDIFICATION (the latent side of the air system the ledger carries) ----
    # The sensible heating/cooling drawing alone under-renders the air-side duty: a humid
    # process building (a RAS hall over open tanks) also needs latent removal. Enumerate the
    # ledger's dehumidifier + the moisture load it removes, draw it on the supply hub, and
    # note the latent duty. Universal: surfaces only when the ledger carries it.
    dehum = _read_dehumidifier(state)
    if dehum is not None:
        bits = []
        if dehum.power_kw:
            bits.append(f"{dehum.power_kw:.0f} kW")
        if dehum.moisture_load_kg_h:
            bits.append(f"{dehum.moisture_load_kg_h:.0f} kg/h latent load")
        notes.append(
            f"Dehumidification ({dehum.tag}): {' · '.join(bits)} — a dehumidification "
            f"coil/unit on the air handler removes the building moisture (latent duty), "
            f"separate from the {_duty_word(state)} above." if bits else
            f"Dehumidification unit ({dehum.tag}) on the air handler — latent duty.")

    return AirSystem(
        archetype=arch, hubs=hubs, zones=zones, ducts=ducts, diffusers=diffusers,
        bbox=bbox, medium=medium, airflow_cms=airflow_cms, cooling_kw=cooling_kw,
        zones_derived=zones_derived, notes=notes, schedule_present=schedule_present,
        duty_word=_duty_word(state), dehumidifier=dehum)


def _hub_tag(role: str, idx: int) -> str:
    base = {"crac": "CRAC", "ahu": "AHU", "dx": "DX", "chiller": "CH",
            "fan": "EF", "condensate": "CD", "pump": "PMP", "tank": "TK",
            "louvre": "LV", "manifold": "CDM"}.get(role, "AHU")
    return f"{base}-{idx + 1}"


def _read_design_airflow(state: dict, fallback_n: int = 0) -> float:
    """The air system's design airflow (m³/s).  Reads the AHU airflow directly, else a
    per-chassis cfm × rack count, else derives from the sensible cooling duty.
    `fallback_n` is the count of zones actually PLACED in the model — used to multiply a
    per-chassis cfm when the contract has no explicit rack-count quantity."""
    cms = _quantity(state, "hvac_airflow_cms", "supply_airflow_cms", "airflow_cms")
    if cms:
        return float(cms)
    cmh = _quantity(state, "hvac_airflow_cmh", "supply_airflow_cmh", "airflow_cmh")
    if cmh:
        return float(cmh) / 3600.0
    # server CRAC: per-chassis cfm × the rack count (the whitespace airflow). Prefer a
    # contract rack-count; else the number of racks the model actually placed.
    cfm = _quantity(state, "chassis_airflow_cfm", "rack_airflow_cfm", "airflow_cfm")
    if cfm:
        n = _read_zone_count(state) or fallback_n or 1
        return (float(cfm) * n) / CFM_PER_CMS
    # last resort: derive the supply airflow from the design AIR-SIDE THERMAL DUTY
    # (Q = ρ·cp·ΔT·V). Covers BOTH a cooling AND a HEATING air system (RAS warm-water
    # BUILDING load): the air system that holds the building condition must move the air to
    # carry that duty (was 0 → an EMPTY duct drawing for RAS, whose duty is HEATING not
    # cooling). DELIBERATELY EXCLUDES `system_thermal_dissipation_kw` / chiller-capacity —
    # those are a LIQUID-COOLED system's heat-REJECTION (BESS glycol loop), NOT an air duty;
    # reading them would mis-derive an air airflow for a liquid plant (flipping its medium
    # off 'liquid'). A liquid-cooled design is handled by the coolant-loop path, not here.
    duty = _quantity(state, "hvac_sensible_load_kw", "hvac_cooling_capacity_kw",
                     "hvac_cooling_kw", "heating_duty_kw", "makeup_heating_kw",
                     "building_process_loss_kw")
    if duty:
        return (float(duty) * 1000.0) / (CP_AIR * DEFAULT_SUPPLY_DT_K) / RHO_AIR
    return 0.0


def _read_cooling_kw(state: dict, fallback_n: int = 0) -> float:
    """The system cooling duty (kW).  Prefers a SYSTEM-scope quantity; a per-chassis
    capacity (the only figure a server CRAC publishes) is multiplied by the rack count
    so the headline is the whole-room load, not one chassis."""
    for k in ("hvac_total_load_kw", "hvac_cooling_kw", "hvac_chiller_capacity_kw",
              "hvac_cooling_capacity_kw", "system_thermal_dissipation_kw",
              "thermal_rejection_capacity_kw",
              # HEATING systems (RAS warm-water building load) publish a heating duty, not
              # a cooling figure — read it so the drawing carries a real duty (not 0/empty).
              "heating_duty_kw", "makeup_heating_kw", "building_process_loss_kw"):
        v = _quantity(state, k)
        if v:
            return float(v)
    # per-chassis only → scale to the whole room by the rack count.
    v = _quantity(state, "chassis_cooling_capacity_kw")
    if v:
        n = _read_zone_count(state) or fallback_n or 1
        return float(v) * n
    return 0.0


def _duty_word(state: dict) -> str:
    """'heating' when the design's dominant air-side duty is HEATING (a heating_duty figure
    that exceeds any explicit cooling figure — RAS warm-water building load), else
    'cooling'. So the drawing doesn't mislabel a warm-water fish-farm duct as 'cooling'.
    Universal: reads the published duty quantities, no per-class assumption."""
    heat = 0.0
    for k in ("heating_duty_kw", "makeup_heating_kw"):
        v = _quantity(state, k)
        if v:
            heat = max(heat, float(v))
    cool = 0.0
    for k in ("hvac_cooling_kw", "hvac_chiller_capacity_kw",
              "system_thermal_dissipation_kw", "thermal_rejection_capacity_kw"):
        v = _quantity(state, k)
        if v:
            cool = max(cool, float(v))
    return "heating" if heat > cool else "cooling"


def _read_zone_count(state: dict) -> int:
    for k in ("rack_count", "n_racks", "number_of_racks", "chassis_count",
              "grow_rack_count", "n_zones", "grow_zone_count"):
        v = _quantity(state, k)
        if v:
            return int(v)
    return 0


# A DEHUMIDIFIER / dehumidification unit the BoM carries (the latent side of the air system).
_DEHUMID_RE = re.compile(r"dehumidif|moisture\s*remov|latent\s*(load|cool)|desiccant", re.I)


def _read_dehumidifier(state: dict) -> Optional["Dehumidifier"]:
    """The DEHUMIDIFICATION unit the ledger carries (a real environmental-control item the
    sensible-heating HVAC drawing omitted), or None. Reads the requirementsBom for a
    dehumidifier row (name + duty + tag) and the latent-load quantities for the moisture it
    removes. Universal — reads the engine's OWN BoM + the canonical latent-duty quantities
    (dehumidifier_power_kw / evaporative_moisture_load_kg_h), never a per-class assumption."""
    power = _quantity(state, "dehumidifier_power_kw", "dehumidification_power_kw",
                      "dehumidifier_capacity_kw")
    moisture = _quantity(state, "evaporative_moisture_load_kg_h",
                         "latent_moisture_load_kg_h", "moisture_load_kg_h",
                         "dehumidification_load_kg_h")
    tag, name = "", "Dehumidifier"
    rb = state.get("requirementsBom")
    if isinstance(rb, list):
        for r in rb:
            if not isinstance(r, dict):
                continue
            req = str(r.get("requirement") or "")
            head = req.split("·")[0].strip()
            if not _DEHUMID_RE.search(head):
                continue
            tag = str(r.get("tag") or "").strip() or tag
            name = head or name
            if not power:
                m = re.search(r"·\s*([\d.,]+)\s*kW\b", req)
                if m:
                    try:
                        power = float(m.group(1).replace(",", ""))
                    except ValueError:
                        pass
            break
        else:
            # no BoM row → only synthesise a unit if the latent-duty quantities exist.
            if not (power or moisture):
                return None
    if not (power or moisture):
        return None
    try:
        power = float(power) if power else 0.0
    except (TypeError, ValueError):
        power = 0.0
    try:
        moisture = float(moisture) if moisture else 0.0
    except (TypeError, ValueError):
        moisture = 0.0
    return Dehumidifier(tag=tag or "DH-1", name=name or "Dehumidifier",
                        power_kw=power, moisture_load_kg_h=moisture)


def _derive_zones(state: dict, bbox: dict, arch: str):
    """When the served zones aren't placed individually, derive a sensible set of zone
    rectangles from the contract (a rack count, else a canopy split into bays) laid out
    in the plant footprint.  Returns (zones, note)."""
    n = _read_zone_count(state)
    canopy = _quantity(state, "canopy_area_m2", "cultivation_area_m2")
    note = ""
    if not n and canopy:
        # split the canopy into ~4 m² grow bays for a legible zone count (capped).
        n = max(2, min(12, int(round(float(canopy) / 8.0))))
        note = (f"Grow zones derived from canopy {float(canopy):g} m² (not placed "
                f"individually in the model) — shown as {n} representative grow bays.")
    if not n:
        n = 4
        note = ("Served zones not placed individually in the model — shown as 4 "
                "representative zones; verify against the room layout.")
    elif not note:
        note = (f"Served zones derived from the design ({n} units) — laid out "
                f"representatively; verify positions against the room layout.")

    # lay the zones as a row of grow benches along the LONGER plant axis, with a clear
    # aisle, so they read as a served row + a duct run down the aisle (not a packed
    # block).  Cap the count so each bench is at least ~600 mm wide on paper-legible kit.
    x0 = bbox.get("x_min_mm", 0.0)
    x1 = bbox.get("x_max_mm", 6000.0)
    y0 = bbox.get("y_min_mm", 0.0)
    y1 = bbox.get("y_max_mm", 6000.0)
    L = max(x1 - x0, 2000.0)
    W = max(y1 - y0, 2000.0)
    long_is_x = L >= W
    span = max(L, W)
    n = max(2, min(n, int(span // 800)))          # ≥ 800 mm pitch per bench
    note = re.sub(r"as \d+ ", f"as {n} ", note) if "as " in note else note
    cell = span / n
    bench_long = cell * 0.78                       # bench length along the row
    bench_short = max(min(L, W) * 0.34, 600.0)     # bench depth (leaves an aisle)
    zones = []
    for i in range(n):
        along = (x0 if long_is_x else y0) + cell * (i + 0.5)
        cross = (y0 if long_is_x else x0) + min(L, W) * 0.66   # row offset, aisle below
        cx, cy = (along, cross) if long_is_x else (cross, along)
        zw = bench_long if long_is_x else bench_short
        zd = bench_short if long_is_x else bench_long
        zones.append(Equip(tag=f"Z-{i + 1:02d}", name="Grow zone / bench", role="zone",
                           cx=cx, cy=cy, w=zw, d=zd, h=2000.0, z=1000.0))
    return zones, note


def _bbox_extent(bbox: dict) -> tuple:
    """(x0, x1, y0, y1, L, W) of the building footprint [mm], with sane minimums."""
    x0 = bbox.get("x_min_mm", 0.0)
    x1 = bbox.get("x_max_mm", 6000.0)
    y0 = bbox.get("y_min_mm", 0.0)
    y1 = bbox.get("y_max_mm", 6000.0)
    return x0, x1, y0, y1, max(x1 - x0, 1000.0), max(y1 - y0, 1000.0)


def _building_under_served(zones: list, bbox: dict) -> bool:
    """True when the served zones cover only a FRACTION of the building footprint, so the
    air system should be re-zoned across the whole hall. Compares the zones' bounding-box
    span against the building envelope on each axis; under-served when EITHER axis spans
    < 60% of the envelope (the same 0.6 the drawing inspector's hvac-coverage check uses),
    so the projected plan footprint reaches the GA envelope. Deterministic; geometry-only,
    no product-class logic. A genuinely full-hall placement (BESS racks, VF benches that
    already tile the floor) spans the envelope and is left untouched."""
    x0, x1, y0, y1, L, W = _bbox_extent(bbox)
    placed = [z for z in zones if z.cx is not None and z.cy is not None
              and (z.w or 0) > 0 and (z.d or 0) > 0]
    if not placed:
        return True
    zx0 = min(z.cx - z.w / 2 for z in placed)
    zx1 = max(z.cx + z.w / 2 for z in placed)
    zy0 = min(z.cy - z.d / 2 for z in placed)
    zy1 = max(z.cy + z.d / 2 for z in placed)
    span_x = zx1 - zx0
    span_y = zy1 - zy0
    return (span_x < 0.6 * L) or (span_y < 0.6 * W)


def _hall_zone_grid(bbox: dict, hint_n: int = 0) -> list:
    """A representative grid of conditioned zones tiled across the FULL building envelope,
    so the air distribution covers the whole hall (not a fraction). Deterministic and
    universal — the grid is sized purely from the footprint geometry (an aspect-aware
    row × column split, each cell a zone with a clear aisle margin). `hint_n` (a rack /
    zone count from the contract) nudges the cell count where known. Returns list[Equip]."""
    x0, x1, y0, y1, L, W = _bbox_extent(bbox)
    long_is_x = L >= W
    long_span, short_span = (L, W) if long_is_x else (W, L)
    # cells along the LONG axis: ~1 per 12 m of hall, clamped to a legible 3..8; honour a
    # contract zone hint when it is in range. Two rows across the short axis if the hall is
    # not a narrow corridor (short axis ≥ ~10 m).
    cols = max(3, min(8, int(round(long_span / 12000.0)) or 3))
    if hint_n and 2 <= hint_n <= 16:
        cols = max(3, min(8, hint_n))
    rows = 2 if short_span >= 10000.0 else 1
    # leave a margin so zones sit INSIDE the envelope with aisles between them.
    margin_long = long_span * 0.04
    margin_short = short_span * 0.06
    usable_long = long_span - 2 * margin_long
    usable_short = short_span - 2 * margin_short
    cell_long = usable_long / cols
    cell_short = usable_short / rows
    zw_long = cell_long * 0.80                      # zone extent along the long axis
    zw_short = cell_short * 0.74                     # zone extent across the short axis
    long_origin = (x0 if long_is_x else y0) + margin_long
    short_origin = (y0 if long_is_x else x0) + margin_short
    zones: list = []
    k = 0
    for r in range(rows):
        for c in range(cols):
            k += 1
            along = long_origin + cell_long * (c + 0.5)
            cross = short_origin + cell_short * (r + 0.5)
            cx, cy = (along, cross) if long_is_x else (cross, along)
            zw = zw_long if long_is_x else zw_short
            zd = zw_short if long_is_x else zw_long
            zones.append(Equip(tag=f"Z-{k:02d}", name="Conditioned zone", role="zone",
                               cx=cx, cy=cy, w=zw, d=zd, h=2400.0, z=1200.0))
    return zones


def _synth_hub(arch: str, bbox: dict, medium: str) -> Equip:
    role = "chiller" if medium == "liquid" else "ahu"
    x0 = bbox.get("x_min_mm", 0.0)
    y0 = bbox.get("y_min_mm", 0.0)
    y1 = bbox.get("y_max_mm", 6000.0)
    # park it at the bottom-left edge of the footprint.
    return Equip(tag=_hub_tag(role, 0), name="Air-handling unit", role=role,
                 cx=x0 - 1200.0, cy=(y0 + y1) / 2.0, w=1600.0, d=1200.0, h=2000.0,
                 z=1000.0, is_hub=True)


# ── air-duct distribution -----------------------------------------------------

def _build_air_ducts(hub: Equip, zones: list[Equip], airflow_cms: float,
                     cooling_kw: float, schedule: dict, ducts: list,
                     diffusers: list, notes: list, mixed: bool, state: dict) -> float:
    """SUPPLY ducts hub→each zone, sized from the per-zone airflow share; a RETURN duct
    from each zone back to the hub; a diffuser at each zone (supply) + a return grille.
    The MAIN supply trunk + branch sizing mirrors connection_sizing's duct ladder.
    Returns the EFFECTIVE airflow (m³/s) the ducts were sized from — the caller stores it
    so the headline and the duct schedule quote one number."""
    n = max(len(zones), 1)
    if airflow_cms <= 0:
        # no published airflow: back it out of the cooling duty so ducts are still sized.
        airflow_cms = (cooling_kw * 1000.0) / (CP_AIR * DEFAULT_SUPPLY_DT_K) / RHO_AIR \
            if cooling_kw else 0.5 * n
        notes.append("Airflow not published — derived from the cooling duty "
                     "(Q = ρ·cp·ΔT) to size the ducts; treat sizes as indicative.")
    per_zone = airflow_cms / n

    # MAIN supply trunk (hub → the manifold point carrying the full airflow).
    tlabel, tw, tv, tover = size_duct(airflow_cms)
    if tover:
        notes.append(f"Main supply trunk velocity {tv:g} m/s exceeds the "
                     f"{DUCT_VELOCITY_MAX_MS:g} m/s band — upsize the trunk.")
    ducts.append(Duct(frm=hub.tag, to="__trunk__", service=SERVICE_SUPPLY,
                      airflow_cms=airflow_cms, size_label=tlabel, width_mm=tw,
                      velocity_ms=tv, duty_kw=cooling_kw, over_velocity=tover))

    # per-zone supply branch + return + diffuser/grille.
    for z in zones:
        slabel, sw, sv, sover = size_duct(per_zone)
        ducts.append(Duct(frm="__trunk__", to=z.tag, service=SERVICE_SUPPLY,
                          airflow_cms=per_zone, size_label=slabel, width_mm=sw,
                          velocity_ms=sv, over_velocity=sover))
        # return branch — slightly lower velocity band → one size up area-wise.
        rlabel, rw, rv, rover = size_duct(per_zone, velocity_target=4.5)
        ducts.append(Duct(frm=z.tag, to=hub.tag, service=SERVICE_RETURN,
                          airflow_cms=per_zone, size_label=rlabel, width_mm=rw,
                          velocity_ms=rv, over_velocity=rover))
        diffusers.append(Diffuser(at=z.tag, service=SERVICE_SUPPLY,
                                  cx=z.cx, cy=z.cy))

    # mixed system: note the parallel LIQUID loop (BESS container air pair + liquid rack
    # cooling), so the air drawing is honest about what it does and does NOT cover.
    if mixed:
        notes.append("This air system handles the AUXILIARY sensible load only; the "
                     "main equipment heat is rejected by a separate LIQUID coolant loop "
                     "(see the P&ID / coolant schedule).")
    else:
        notes.append(f"Supply airflow {airflow_cms:.2f} m³/s ({_cfm(airflow_cms):,} cfm) "
                     f"split across {n} zone(s); ducts sized at "
                     f"≤{DUCT_VELOCITY_MAX_MS:g} m/s.")
    return airflow_cms


# ── liquid coolant loop (honest: NOT air) -------------------------------------

def _build_liquid_loop(hub: Equip, zones: list[Equip], schedule: dict, ducts: list,
                       diffusers: list, notes: list):
    """A LIQUID coolant loop drawn honestly as coolant pipes: chiller → flow header →
    each rack (cold plate) → return header → chiller.  DN sizes come from the connection
    schedule (the sized coolant runs) when present, else a sensible default."""
    rows = _thermal_rows(schedule)
    # map a 'rack[N]'/'busway' schedule row → a DN size + duty + length.
    main_dn, branch_dn = "DN32", "DN15"
    main_duty = 0.0
    branch_len = 0.0
    for r in rows:
        to = str(r.get("to") or "")
        size = str(r.get("size") or "")
        if "busway" in to or "header" in to.lower():
            if re.match(r"DN\d+", size):
                main_dn = size
            main_duty = max(main_duty, _row_duty_kw(r))
        elif "rack" in to:
            if re.match(r"DN\d+", size):
                branch_dn = size
            branch_len = max(branch_len, _row_len_m(r))

    dn_w = {"DN15": 21.3, "DN20": 26.9, "DN25": 33.7, "DN32": 42.4, "DN40": 48.3,
            "DN50": 60.3, "DN65": 76.1, "DN80": 88.9, "DN100": 114.3}
    # FLOW + RETURN main between the chiller and the rack lineup.
    ducts.append(Duct(frm=hub.tag, to="__trunk__", service=SERVICE_LIQUID,
                      airflow_cms=0.0, size_label=f"{main_dn} flow",
                      width_mm=dn_w.get(main_dn, 42.4), duty_kw=main_duty))
    ducts.append(Duct(frm="__trunk__", to=hub.tag, service=SERVICE_RETURN,
                      airflow_cms=0.0, size_label=f"{main_dn} return",
                      width_mm=dn_w.get(main_dn, 42.4), duty_kw=main_duty))
    for z in zones:
        ducts.append(Duct(frm="__trunk__", to=z.tag, service=SERVICE_LIQUID,
                          airflow_cms=0.0, size_label=branch_dn,
                          width_mm=dn_w.get(branch_dn, 21.3), length_m=branch_len))
        ducts.append(Duct(frm=z.tag, to="__trunk__", service=SERVICE_RETURN,
                          airflow_cms=0.0, size_label=branch_dn,
                          width_mm=dn_w.get(branch_dn, 21.3)))
        diffusers.append(Diffuser(at=z.tag, service=SERVICE_LIQUID,
                                  cx=z.cx, cy=z.cy))
    notes.append("LIQUID-COOLED system — this is a coolant (glycol/water) loop, NOT an "
                 "air duct layout: chiller → flow/return headers → per-rack cold plates. "
                 "Cabinet air-conditioning handles the small auxiliary sensible load "
                 "only (see the P&ID).")
    notes.append("Coolant pipe sizes (DN) taken from the connection schedule; loop shown "
                 "as flow + return mains with per-rack branches.")


# ═══════════════════════════════════════════════════════════════════════════
# SVG primitives — identical palette + builder to the GA / P&ID / SLD
# ═══════════════════════════════════════════════════════════════════════════

INK = "#1a1a1a"            # primary line / text
EQ_INK = "#10243e"         # equipment outline (deep navy)
EQ_FILL = "#eef2f7"        # equipment body fill
SUPPLY_INK = "#10243e"     # SUPPLY air duct (deep navy, solid double line)
SUPPLY_FILL = "#dce7f4"    # supply duct body tint (cool blue)
RETURN_INK = "#0f7b6c"     # RETURN air duct (teal, dashed)
RETURN_FILL = "#dcefe9"    # return duct body tint
EXHAUST_INK = "#b5772a"    # EXHAUST / relief (amber)
LIQUID_INK = "#1a5fb4"     # LIQUID coolant pipe (blue)
LIQUID_FILL = "#dbe7f7"
DIM_INK = "#1a5fb4"        # dimension lines / arrows
FILL_BG = "#ffffff"        # page
PANEL_BG = "#f4f6f9"       # title-block / key fill
GRID_FAINT = "#e4e8ee"     # setting-out grid / faint guide
DATUM_INK = "#9aa3af"      # datum / centre-line grey
MUTED = "#5b6470"


def _service_ink(service: str):
    return {SERVICE_SUPPLY: (SUPPLY_INK, SUPPLY_FILL),
            SERVICE_RETURN: (RETURN_INK, RETURN_FILL),
            SERVICE_EXHAUST: (EXHAUST_INK, "#f5e8d3"),
            SERVICE_LIQUID: (LIQUID_INK, LIQUID_FILL)}.get(
        service, (SUPPLY_INK, SUPPLY_FILL))


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


class SVG:
    """Tiny imperative SVG builder (deterministic) — same primitives as the GA/P&ID."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.4, dash=None, cap="round"):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{width}" stroke-linecap="{cap}"{d}/>')

    def rect(self, x, y, w, h, stroke=INK, width=1.3, fill="none", rx=0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def circle(self, cx, cy, r, stroke=INK, width=1.4, fill="none", dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{width}"{d}/>')

    def path(self, d, stroke=INK, width=1.4, fill="none", join="round", cap="round",
             dash=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
                 f'stroke-linejoin="{join}" stroke-linecap="{cap}"{da}/>')

    def text(self, x, y, s, size=11, anchor="start", fill=INK, weight="normal",
             family="Helvetica, Arial, sans-serif", mono=False, spacing=None,
             rotate=None):
        fam = "'DejaVu Sans Mono', 'Menlo', monospace" if mono else family
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        tr = f' transform="rotate({rotate} {x:.1f} {y:.1f})"' if rotate is not None else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" '
                 f'font-size="{size}" text-anchor="{anchor}" fill="{fill}" '
                 f'font-weight="{weight}"{sp}{tr}>{_esc(s)}</text>')

    def render(self) -> str:
        defs = (
            '<defs>'
            f'<marker id="dim" markerWidth="12" markerHeight="12" refX="6" refY="5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,5 L11,1.5 L8.5,5 L11,8.5 Z" fill="{DIM_INK}"/></marker>'
            f'<marker id="airS" markerWidth="13" markerHeight="13" refX="9" refY="5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M1,1 L10,5 L1,9" fill="none" stroke="{SUPPLY_INK}" '
            f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
            f'</marker>'
            f'<marker id="airR" markerWidth="13" markerHeight="13" refX="9" refY="5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M1,1 L10,5 L1,9" fill="none" stroke="{RETURN_INK}" '
            f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
            f'</marker>'
            f'<marker id="airL" markerWidth="13" markerHeight="13" refX="9" refY="5" '
            f'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M1,1 L10,5 L1,9" fill="none" stroke="{LIQUID_INK}" '
            f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
            f'</marker>'
            '</defs>')
        body = "\n".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">\n{defs}\n'
                f'<rect width="{self.w}" height="{self.h}" fill="{FILL_BG}"/>\n'
                f'{body}\n</svg>\n')


# ═══════════════════════════════════════════════════════════════════════════
# SCALE — pick a standard drawing scale (shared with the GA convention)
# ═══════════════════════════════════════════════════════════════════════════

_STD_SCALES = [20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000]
_K_PPM = 3.78   # on-paper px per model-mm at 1:1 (1 m at 1:100 ≈ 37.8 px)


def choose_scale(span_mm: float, avail_px: float):
    span_mm = max(span_mm, 1.0)
    for S in _STD_SCALES:
        if span_mm * (_K_PPM / S) <= avail_px:
            return S
    return _STD_SCALES[-1]


def _fmt_mm(v_mm: float) -> str:
    a = abs(v_mm)
    if a >= 1000:
        s = f"{v_mm/1000:.2f}".rstrip("0").rstrip(".")
        return f"{s} m"
    return f"{v_mm:.0f} mm"


# ═══════════════════════════════════════════════════════════════════════════
# NORTH ARROW + SCALE BAR  (mirrors the GA)
# ═══════════════════════════════════════════════════════════════════════════

def north_arrow(svg: SVG, cx, cy, r=18):
    svg.circle(cx, cy, r, stroke=MUTED, width=1.0)
    svg.path(f"M {cx:.1f} {cy-r+2:.1f} L {cx+5:.1f} {cy+4:.1f} L {cx:.1f} {cy+1:.1f} "
             f"L {cx-5:.1f} {cy+4:.1f} Z", stroke=INK, width=1.0, fill=INK)
    svg.path(f"M {cx:.1f} {cy-r+2:.1f} L {cx+5:.1f} {cy+4:.1f} L {cx:.1f} {cy+1:.1f} Z",
             stroke=INK, width=1.0, fill=FILL_BG)
    svg.text(cx, cy + r + 11, "N", size=11, anchor="middle", weight="bold")


def scale_bar(svg: SVG, x, y, scale_S, px_per_mm, total_mm):
    seg_n = 4
    seg_mm = total_mm / seg_n
    bar_h = 6.0
    for i in range(seg_n):
        sx = x + i * seg_mm * px_per_mm
        sw = seg_mm * px_per_mm
        fill = INK if i % 2 == 0 else FILL_BG
        svg.rect(sx, y, sw, bar_h, stroke=INK, width=0.9, fill=fill)
    for frac in (0.0, 0.5, 1.0):
        tx = x + total_mm * frac * px_per_mm
        svg.line(tx, y - 2, tx, y + bar_h + 2, stroke=INK, width=0.8)
        svg.text(tx, y + bar_h + 13, _fmt_mm(total_mm * frac), size=8.5,
                 anchor="middle", fill=MUTED)
    svg.text(x, y - 5, f"SCALE 1:{int(scale_S)}", size=9.5, weight="bold", fill=INK)


def _nice_bar_mm(scale_S: float):
    for metres in (1, 2, 5, 10, 20, 50, 100):
        if metres * 1000.0 / scale_S >= 20:
            return metres * 1000.0
    return 100 * 1000.0


# ═══════════════════════════════════════════════════════════════════════════
# DUCT + EQUIPMENT + DIFFUSER glyphs
# ═══════════════════════════════════════════════════════════════════════════

def _draw_double_line_duct(svg, x0, y0, x1, y1, width_px, service, label=None,
                           airflow_cms=0.0, duty_kw=0.0):
    """Draw a duct as a SIZED DOUBLE LINE (two parallel rails width_px apart) following
    the centre-line (x0,y0)→(x1,y1), with a centre flow arrow + a size/flow label.
    Supply solid navy, return dashed teal, liquid solid blue — distinct per service."""
    ink, fill = _service_ink(service)
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy) or 1.0
    # unit normal
    nx, ny = -dy / ln, dx / ln
    hw = max(width_px / 2.0, 2.0)
    # the duct body (a thin filled ribbon) + two rails.
    ax0, ay0 = x0 + nx * hw, y0 + ny * hw
    ax1, ay1 = x1 + nx * hw, y1 + ny * hw
    bx0, by0 = x0 - nx * hw, y0 - ny * hw
    bx1, by1 = x1 - nx * hw, y1 - ny * hw
    svg.add(f'<path d="M {ax0:.1f} {ay0:.1f} L {ax1:.1f} {ay1:.1f} '
            f'L {bx1:.1f} {by1:.1f} L {bx0:.1f} {by0:.1f} Z" '
            f'fill="{fill}" fill-opacity="0.85" stroke="none"/>')
    dash = "8,4" if service == SERVICE_RETURN else (
        "10,3" if service == SERVICE_EXHAUST else None)
    svg.line(ax0, ay0, ax1, ay1, stroke=ink, width=1.5, dash=dash)
    svg.line(bx0, by0, bx1, by1, stroke=ink, width=1.5, dash=dash)
    # centre-line flow arrow (a short marker-tipped segment at ~62% of the run)
    marker = {SERVICE_SUPPLY: "airS", SERVICE_RETURN: "airR",
              SERVICE_EXHAUST: "airS", SERVICE_LIQUID: "airL"}[service]
    mxs, mys = x0 + dx * 0.46, y0 + dy * 0.46
    mxe, mye = x0 + dx * 0.60, y0 + dy * 0.60
    svg.add(f'<line x1="{mxs:.1f}" y1="{mys:.1f}" x2="{mxe:.1f}" y2="{mye:.1f}" '
            f'stroke="{ink}" stroke-width="1.6" marker-end="url(#{marker})"/>')
    # the size + flow label, offset off the duct, mid-run.
    if label:
        lx, ly = (x0 + x1) / 2.0 + nx * (hw + 9), (y0 + y1) / 2.0 + ny * (hw + 9)
        bits = [label]
        if airflow_cms > 0:
            bits.append(f"{_cfm(airflow_cms):,} cfm")
        svg.text(lx, ly, "  ".join(bits), size=7.6, anchor="middle", fill=ink,
                 weight="bold", mono=True)


def _draw_equipment(svg, e: Equip, px, py, pw, ph, placer=None, max_tag_w=None):
    """A mechanical-kit outline (hub or zone) with its tag.  Hubs get a heavier navy
    outline + a fan/coil tick; zones a lighter rack rectangle. When a `placer`
    (draw_ga._TagPlacer) is given, the tag is REGISTERED for the sheet's de-overlap
    pass instead of being stamped immediately — the same idiom draw_ga.py's plan
    view uses (2026-07-05 HVAC-label fix). The part's descriptive BoM NAME is NOT
    stamped here (2026-07-05 BESS coverage pass, revised): a first attempt captioned
    every hub in-place, but on a design with many small adjacent hubs (a BESS's
    louvre/fan/pump/tank cluster) the captions collided into illegible garbled text —
    exactly the 5-second-glance defect this dossier's SIGHT discipline exists to catch.
    Names are listed instead in a clean EQUIPMENT SCHEDULE strip (build_hvac_svg,
    `_draw_equipment_schedule`) — same literal-text coverage credit, zero collision
    risk, and arguably better drafting practice than cramming full names onto a busy
    plan.

    `max_tag_w` (2026-07-05, hub-tag crowding fix): a real box this small (a fitting
    whose footprint is well under its neighbour's centre-to-centre spacing, e.g. a row
    of ~300-440 mm auxiliary items only 800-900 mm apart in the real plant) still
    needs a 5-6 character tag that is WIDER, at this drawing's normal tag font size,
    than the gap between two such boxes — the shared _TagPlacer's own collision search
    does not always resolve that within this drawing's tight row height (observed:
    'EQ-107'/'EQ-108'/'EQ-110' overlapping into illegible text). The caller
    (build_hvac_svg) pre-computes each hub's available neighbour-to-neighbour gap and
    passes it here; the tag font shrinks (never repositions — there is no safe
    direction to move it: the zone row sits immediately below, the dimension line
    immediately above) just enough to fit inside that gap, down to a legible floor."""
    if e.is_hub:
        svg.rect(px, py, max(pw, 18), max(ph, 14), stroke=EQ_INK, width=1.8,
                 fill=EQ_FILL, rx=2)
        # a fan glyph (circle + 3 blades) in the corner so it reads as air-moving kit.
        fcx, fcy = px + min(pw, ph) * 0.30, py + min(pw, ph) * 0.30
        fr = max(min(pw, ph) * 0.16, 4)
        svg.circle(fcx, fcy, fr, stroke=EQ_INK, width=1.0)
        for a in (0, 120, 240):
            ax = fcx + fr * 0.85 * math.cos(math.radians(a))
            ay = fcy + fr * 0.85 * math.sin(math.radians(a))
            svg.line(fcx, fcy, ax, ay, stroke=EQ_INK, width=0.8)
    else:
        svg.rect(px, py, max(pw, 10), max(ph, 8), stroke=EQ_INK, width=1.2,
                 fill="#f0f3f7", rx=1)
    if pw >= 18 and ph >= 11:
        _cx, _cy = px + pw / 2.0, py + ph / 2.0
        _sz = min(9.5, ph * 0.5)
        if max_tag_w:
            # ~0.6 char-width-to-height ratio (this file's own bold-tag rendering) —
            # shrink to fit the real available gap, floored so it never vanishes.
            _fit_sz = max_tag_w / max(1, len(e.tag)) / 0.6
            _sz = max(4.5, min(_sz, _fit_sz))
        if placer is not None:
            placer.add(_cx, _cy + 3.2, e.tag, _sz, anchor_pt=(_cx, _cy))
        else:
            svg.text(_cx, _cy + 3.2, e.tag, size=_sz,
                     anchor="middle", weight="bold", fill=EQ_INK)
        return True
    return False


def _draw_equipment_schedule(svg, hubs, x, y, max_w, max_h=98):
    """A compact 'TAG — Name' EQUIPMENT SCHEDULE strip (2026-07-05 BESS coverage pass):
    the plan view's hub boxes are drawn tight enough that a full descriptive name never
    fits beside every one without colliding with its neighbours (see _draw_equipment's
    docstring) — so the names are listed here instead, once, cleanly, in reading order.
    `max_h` bounds the TOTAL strip height (the caller's real available gap before the
    next drawing element) — the row count per column is derived FROM it (never a fixed
    guess) so the strip can never grow into whatever is drawn below it, however many
    hubs the design carries. Gives every hub's BoM name real literal SVG text (the
    coverage scorer's own name-substring test) without touching the plan's geometry at
    all. Returns the bottom y reached."""
    if not hubs:
        return y
    svg.text(x, y, "EQUIPMENT SCHEDULE:", size=9.5, weight="bold", fill=EQ_INK)
    rh = 13
    per_col = max(1, int((max_h - 15) // rh))
    n_cols = -(-len(hubs) // per_col)
    col_w = min(260, max_w / max(1, n_cols))
    for i, h in enumerate(hubs):
        col, row = divmod(i, per_col)
        svg.text(x + col * col_w, y + 15 + row * rh, f"{h.tag} — {h.name}",
                 size=8.0, fill=MUTED)
    n_rows = min(per_col, len(hubs))
    return y + 15 + n_rows * rh


def _draw_diffuser(svg, cx, cy, service):
    """A supply DIFFUSER (square 4-way throw) / return GRILLE (louvre square) /
    liquid cold-plate (hatched square) — the standard terminal symbols."""
    s = 7.5
    ink, _f = _service_ink(service)
    if service == SERVICE_SUPPLY:
        # 4-way diffuser: square + an X of throw arrows.
        svg.rect(cx - s, cy - s, 2 * s, 2 * s, stroke=ink, width=1.2, fill=FILL_BG)
        svg.line(cx - s, cy - s, cx + s, cy + s, stroke=ink, width=0.8)
        svg.line(cx - s, cy + s, cx + s, cy - s, stroke=ink, width=0.8)
    elif service == SERVICE_RETURN:
        # return grille: square with louvre lines.
        svg.rect(cx - s, cy - s, 2 * s, 2 * s, stroke=ink, width=1.2, fill=FILL_BG)
        for k in (-3, 0, 3):
            svg.line(cx - s + 1, cy + k, cx + s - 1, cy + k, stroke=ink, width=0.7)
    else:
        # liquid cold plate: hatched square.
        svg.rect(cx - s, cy - s, 2 * s, 2 * s, stroke=ink, width=1.2, fill="#eef4fc")
        svg.line(cx - s, cy, cx + s, cy, stroke=ink, width=0.7)
        svg.line(cx, cy - s, cx, cy + s, stroke=ink, width=0.7)


# Dehumidifier glyph colours — a distinct cool-cyan so the latent kit reads apart from the
# navy supply ducts / heating hub.
DEHUM_INK = "#0a6e8a"
DEHUM_FILL = "#d6eef5"


def _draw_dehumidifier_glyph(svg, dh, hub_px, hub_py, hub_w_px, hub_d_px):
    """Draw the DEHUMIDIFICATION unit beside the supply hub + a coil glyph ON the hub face,
    tagged with the unit tag + its latent duty/moisture-load. A standard cooling-coil symbol
    (a box of vertical fins with the condensate drip) so it reads as the latent-removal kit
    the air handler carries — the part the sensible-heating drawing omitted."""
    # standalone unit just to the RIGHT of the hub.
    uw, ud = max(hub_w_px * 0.8, 22), max(hub_d_px * 0.8, 16)
    ux = hub_px + hub_w_px / 2 + 12
    uy = hub_py - ud / 2
    svg.rect(ux, uy, uw, ud, stroke=DEHUM_INK, width=1.6, fill=DEHUM_FILL, rx=2)
    # cooling-coil fins inside the unit (vertical ticks)
    nf = max(3, int(uw / 6))
    for i in range(1, nf):
        fx = ux + uw * i / nf
        svg.line(fx, uy + 2, fx, uy + ud - 2, stroke=DEHUM_INK, width=0.8)
    # condensate drip below the coil (the latent-removal cue)
    svg.line(ux + uw / 2, uy + ud, ux + uw / 2, uy + ud + 6, stroke=DEHUM_INK, width=1.0)
    svg.path(f"M {ux + uw/2 - 2:.1f} {uy + ud + 6:.1f} q 2 4 4 0 z",
             stroke=DEHUM_INK, width=0.8, fill=DEHUM_FILL)
    # tag + duty caption above the unit.
    bits = [dh.tag]
    if dh.power_kw:
        bits.append(f"{dh.power_kw:.0f} kW")
    svg.text(ux + uw / 2, uy - 4, "  ".join(bits), size=7.4, anchor="middle",
             weight="bold", fill=DEHUM_INK)
    if dh.moisture_load_kg_h:
        svg.text(ux + uw / 2, uy + ud + 16, f"{dh.moisture_load_kg_h:.0f} kg/h",
                 size=6.8, anchor="middle", fill=DEHUM_INK)
    svg.text(ux + uw / 2, uy + ud + (25 if dh.moisture_load_kg_h else 16),
             "dehumidifier (latent)", size=6.4, anchor="middle", fill=MUTED)


def _draw_duct_penetration_seal(svg, sysm, meta, pc, plan_x, plan_y, plan_w, plan_h):
    """Draw the WALL-PENETRATION detail for a duct that exits the enclosure to atmosphere
    (an off-gas / exhaust duct's fire/gas-tight transit seal, e.g. a Roxtec frame) — a
    penetration detail at the container wall (2026-07-05 HVAC air-side coverage pass:
    the seal is a real BoM line but was never drawn, so the HVAC layout silently dropped
    a life-safety detail a chartered engineer would expect to see). Anchors on the
    nearest EXHAUST-role hub (an 'off-gas exhaust fan' or similar); a no-op when the
    design carries no such hub or the BoM has no matching seal line — never fabricated
    geometry with no real anchor. Universal: keyed on the hub's role + the BoM's own
    requirement text, no product-class table."""
    pen = meta.get("duct_penetration_seal")
    if not pen:
        return
    # anchor: prefer a hub whose NAME says off-gas/exhaust; else any 'fan' (exhaust) hub —
    # the duct run this seal terminates is the one that vents to outside.
    hub = next((h for h in sysm.hubs if re.search(r"off.?gas", h.name, re.I)), None)
    if hub is None:
        hub = next((h for h in sysm.hubs if h.role == "fan"), None)
    if hub is None or hub.tag not in pc:
        return
    hx, hy = pc[hub.tag]
    # nearest wall edge of the plan rectangle (the enclosure wall this duct penetrates).
    x0, x1, y0, y1 = plan_x, plan_x + plan_w, plan_y, plan_y + plan_h
    dists = [("left", hx - x0), ("right", x1 - hx), ("top", hy - y0), ("bottom", y1 - hy)]
    side, _ = min(dists, key=lambda t: t[1])
    if side == "left":
        wx, wy, nx, ny = x0, hy, -1.0, 0.0
    elif side == "right":
        wx, wy, nx, ny = x1, hy, 1.0, 0.0
    elif side == "top":
        wx, wy, nx, ny = hx, y0, 0.0, -1.0
    else:
        wx, wy, nx, ny = hx, y1, 0.0, 1.0
    # duct stub from the hub to the wall (dashed amber — the same EXHAUST convention the
    # legend already uses for "relief to outside").
    svg.line(hx, hy, wx, wy, stroke=EXHAUST_INK, width=2.2, dash="6,3")
    # the penetration-seal glyph: a small transit-frame rectangle straddling the wall line,
    # cross-hatched (the standard "sealed/fire-stopped" convention), oriented along the wall.
    seal_w, seal_d = (16.0, 8.0) if ny == 0 else (8.0, 16.0)
    sx, sy = wx - seal_w / 2, wy - seal_d / 2
    svg.rect(sx, sy, seal_w, seal_d, stroke=EXHAUST_INK, width=1.4, fill="#f5e8d3")
    if ny == 0:
        for i in range(1, 4):
            fx = sx + seal_w * i / 4
            svg.line(fx, sy, fx - 3, sy + seal_d, stroke=EXHAUST_INK, width=0.8)
    else:
        for i in range(1, 4):
            fy = sy + seal_d * i / 4
            svg.line(sx, fy, sx + seal_w, fy - 3, stroke=EXHAUST_INK, width=0.8)
    # label — named from the BoM's own requirement/part/qty (never hardcoded), placed
    # INSIDE the plan boundary (offset AWAY from the wall) so it never collides with the
    # exterior setout-grid dimension chain (which runs along the plan's outer edges).
    part = str(pen.get("part") or "").strip()
    qty = pen.get("qty")
    bits = ["Off-gas duct penetration seal"]
    if part and part.upper() not in ("TBD", "—", "NOT FOUND", "REQUIREMENT STATED"):
        bits.append(part)
    if isinstance(qty, (int, float)) and qty:
        bits.append(f"×{qty:g}")
    label = " · ".join(bits)
    lx = wx - nx * 14 + (10 if ny == 0 else 0)
    ly = wy - ny * 14 + (4 if ny == 0 else 0)
    anchor = "start" if nx >= 0 else "end"
    if ny != 0:
        anchor = "middle"
        lx = wx
    svg.text(lx, ly, label, size=7.2, anchor=anchor, weight="bold", fill=EXHAUST_INK)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN LAYOUT
# ═══════════════════════════════════════════════════════════════════════════

def build_hvac_svg(sysm: AirSystem, meta: dict) -> str:
    """Render the derived air / cooling distribution as an HVAC LAYOUT: a ducted PLAN
    (top) + a SECTION (below), with a scale bar, north arrow, legend, schedule, title
    block + 'not for construction'."""
    bbox = sysm.bbox
    all_eq = sysm.hubs + sysm.zones
    # ----- model extents (include the hub even if it sits at the plant edge) -----
    # The plan footprint must span the BUILDING ENVELOPE (the GA's plant bbox), so the
    # HVAC drawing covers the same hall the General Arrangement draws — union the
    # equipment extent with the manifest bbox. Without this the plan would shrink to the
    # bounding box of a few placed boxes and read as a fraction of the hall.
    xs = [e.cx - e.w / 2 for e in all_eq] + [e.cx + e.w / 2 for e in all_eq]
    ys = [e.cy - e.d / 2 for e in all_eq] + [e.cy + e.d / 2 for e in all_eq]
    bx0 = bbox.get("x_min_mm")
    bx1 = bbox.get("x_max_mm")
    by0 = bbox.get("y_min_mm")
    by1 = bbox.get("y_max_mm")
    if bx0 is not None:
        xs.append(float(bx0))
    if bx1 is not None:
        xs.append(float(bx1))
    if by0 is not None:
        ys.append(float(by0))
    if by1 is not None:
        ys.append(float(by1))
    x_min = min(xs) if xs else (float(bx0) if bx0 is not None else 0.0)
    x_max = max(xs) if xs else (float(bx1) if bx1 is not None else 6000.0)
    y_min = min(ys) if ys else (float(by0) if by0 is not None else 0.0)
    y_max = max(ys) if ys else (float(by1) if by1 is not None else 6000.0)
    L = max(x_max - x_min, 1000.0)
    W = max(y_max - y_min, 1000.0)
    z_max = max([e.z + e.h / 2 for e in all_eq] + [bbox.get("z_max_mm", 3000.0)])
    H = max(z_max, 2500.0)

    # ----- scale: fit the plan into the working width -----
    PLAN_MAX_W = 820.0
    PLAN_MAX_H = 340.0
    scale_S = max(choose_scale(L, PLAN_MAX_W), choose_scale(W, PLAN_MAX_H),
                  choose_scale(H, 240.0))
    ppm = _K_PPM / scale_S

    plan_w = L * ppm
    plan_h = W * ppm
    sect_h = H * ppm

    def mx(x_mm):
        return (x_mm - x_min) * ppm

    def my(y_mm):
        return (y_max - y_mm) * ppm     # north up

    # ----- sheet geometry -----
    margin = 46
    # title-block height grows with the WRAPPED note lines (notes are word-wrapped, never
    # clipped mid-word — v54 shipped "from the desig…" / "verify aga…").
    # +28 for the shared general-tolerance note line (_tb.TOLERANCE_NOTE), drawn BELOW the
    # NFC line so it clears the drawing-metadata box on the right.
    title_h = 184 + max(0, len(_note_lines(sysm)) - 2) * 12
    plan_x = margin + 44
    plan_y = margin + 56
    sect_x = plan_x
    sect_y = plan_y + plan_h + 120
    sect_plan_h = sect_h

    legend_w = 250
    width = int(math.ceil(max(plan_x + plan_w + legend_w + 40,
                              sect_x + plan_w + margin + 30, 1120)))
    n_sched = max(6, min(len(sysm.ducts) + len(all_eq), 18))
    body_bottom = max(sect_y + sect_plan_h + 70,
                      plan_y + max(plan_h, 0) + 40 + n_sched * 13 + 60)
    height = int(math.ceil(body_bottom + title_h))

    svg = SVG(width, height)
    svg.rect(16, 16, width - 32, height - 32, stroke=GRID_FAINT, width=1.2)

    # ───────────────────────── PLAN ─────────────────────────
    medium_word = {"air": "AIR DUCT", "liquid": "COOLANT", "mixed": "AIR DUCT"}[
        sysm.medium]
    svg.text(plan_x, plan_y - 30, f"{medium_word} LAYOUT — PLAN", size=13,
             weight="bold", fill=EQ_INK, spacing="1.0")
    svg.text(plan_x + 250, plan_y - 30, "(roof removed · looking down)", size=9.5,
             fill=MUTED)
    _draw_setout_grid(svg, plan_x, plan_y, plan_w, plan_h, L, W, ppm)
    svg.rect(plan_x, plan_y, plan_w, plan_h, stroke=DATUM_INK, width=1.2, fill="none")

    # plan position of each equipment + a quick lookup of its plan centre.
    pc = {}   # tag → (px, py) plan centre
    for e in all_eq:
        pc[e.tag] = (plan_x + mx(e.cx), plan_y + my(e.cy))

    # ----- DUCTS first (so equipment + diffusers overlay the duct ends) -----
    # route ORTHOGONALLY: a supply trunk runs parallel to the served-zone row on the
    # hub side, with perpendicular branch taps to each zone; a return trunk runs on the
    # far side with perpendicular pickups.  This reads as a real ducted distribution,
    # never a diagonal star.  Diffusers are drawn inside the same routine.
    _draw_plan_distribution(svg, sysm, pc, ppm, plan_x, plan_y, plan_w, plan_h)
    _draw_duct_penetration_seal(svg, sysm, meta, pc, plan_x, plan_y, plan_w, plan_h)

    # ----- equipment outlines (hubs + zones) -----
    # de-overlap + GUARANTEED full-tag pass (2026-07-05 HVAC-label fix) — the SAME
    # _TagPlacer idiom draw_ga.py's plan view uses: an item too small for an in-place
    # tag becomes a small numbered-style keynote carrying its FULL real BoM tag (with
    # a leader back to the part) instead of being drawn but silently untagged.
    eq_tags = _ga._TagPlacer(svg, bounds=(plan_x - 2, plan_y - 2,
                                          plan_x + plan_w + 2, plan_y + plan_h + 2))
    # HUB-TAG CROWDING FIX (2026-07-05 BESS coverage pass): a row of small real
    # fittings (a BESS's louvre/fan/pump cluster — each ~300-440 mm, but only
    # 800-900 mm apart in the real plant) needs a 5-6 char tag WIDER, at this
    # drawing's normal tag font size, than the gap between two such boxes; the
    # shared _TagPlacer's own collision search does not always resolve that within
    # this drawing's tight row height (observed: 'EQ-107'/'EQ-108'/'EQ-110' tags
    # overlapping into illegible text — the zone row immediately below and the
    # dimension line immediately above leave no safe direction to DISPLACE a
    # colliding tag, so it must SHRINK to fit instead). For every hub, the real
    # available gap to its nearest neighbour (either side) bounds its tag's max
    # width; passed to _draw_equipment, which shrinks the font only as far as that
    # gap requires. Purely geometric (centre spacing) — never per-class.
    _hub_cx = sorted((plan_x + mx(e.cx), e.tag) for e in all_eq if e.is_hub)
    hub_max_w: dict[str, float] = {}
    for i, (cx, tag) in enumerate(_hub_cx):
        gaps = []
        if i > 0:
            gaps.append(cx - _hub_cx[i - 1][0])
        if i + 1 < len(_hub_cx):
            gaps.append(_hub_cx[i + 1][0] - cx)
        if gaps:
            hub_max_w[tag] = max(10.0, min(gaps) - 2.0)   # 2 px clearance either side
    eq_keynotes = []
    for e in all_eq:
        pw = e.w * ppm
        ph = e.d * ppm
        px = plan_x + mx(e.cx - e.w / 2)
        py = plan_y + my(e.cy + e.d / 2)
        labelled = _draw_equipment(svg, e, px, py, pw, ph, placer=eq_tags,
                                   max_tag_w=hub_max_w.get(e.tag))
        if not labelled:
            eq_keynotes.append((e, px + pw / 2.0, py + ph / 2.0))
    for e, kx, ky in eq_keynotes:
        # same crowding-fit shrink as the inline path above (2026-07-05) — a hub too
        # small for an in-place tag is EXACTLY the case most likely to also be part of
        # a crowded row (see hub_max_w's docstring above), so the keynote's fixed
        # 7.5 pt default must be bounded by the same real neighbour-gap.
        _mw = hub_max_w.get(e.tag)
        _ksz = 7.5
        if _mw:
            _ksz = max(4.5, min(_ksz, _mw / max(1, len(e.tag)) / 0.6))
        eq_tags.add(kx, ky + 2.7, e.tag, _ksz, anchor_pt=(kx, ky))
    eq_tags.flush()

    # EQUIPMENT SCHEDULE (2026-07-05 BESS coverage pass) — every hub's descriptive BoM
    # name as clean list text, in the gap between the plan and the section (see
    # _draw_equipment's docstring for why the name is not captioned in-place on the plan).
    # max_h is the REAL gap (sect_y - here), less an 8 px safety margin before the
    # "SECTION A–A" heading — never a guessed constant, so it can't collide even if the
    # plan/section pitch above changes independently of this function.
    _draw_equipment_schedule(svg, sysm.hubs, plan_x, plan_y + plan_h + 22, plan_w,
                             max_h=(sect_y - (plan_y + plan_h + 22) - 8))

    # ----- DEHUMIDIFICATION unit + coil on the supply hub (the ledger's latent kit) -----
    # The air system's latent side: a dehumidification coil drawn ON the supply hub + a
    # standalone unit beside it, tagged with its duty + the moisture load it removes. Drawn
    # from the ledger; nothing drawn when the design carries no dehumidifier.
    if sysm.dehumidifier is not None and pc:
        hub0 = sysm.hubs[0]
        hpx, hpy = pc.get(hub0.tag, (plan_x + plan_w * 0.5, plan_y + plan_h * 0.5))
        _draw_dehumidifier_glyph(svg, sysm.dehumidifier, hpx, hpy,
                                 max(hub0.w * ppm, 18), max(hub0.d * ppm, 14))

    north_arrow(svg, plan_x + plan_w - 14, plan_y + 20)
    # overall plan dimensions: building LENGTH along the top, building DEPTH down the left,
    # so the HVAC plan annotates the SAME plant envelope the General Arrangement does
    # (the air system serves the whole hall, not a fraction).
    _dim_h(svg, plan_x, plan_x + plan_w, plan_y - 14, L, ext_from=plan_y)
    _dim_v(svg, plan_y, plan_y + plan_h, plan_x - 14, W, ext_from=plan_x)

    # ───────────────────────── SECTION ─────────────────────────
    svg.text(sect_x, sect_y - 14, "SECTION A–A", size=13, weight="bold",
             fill=EQ_INK, spacing="1.0")
    svg.text(sect_x + 110, sect_y - 14,
             "(supply high-level · return low-level · diffusers drop into the zones)",
             size=9.0, fill=MUTED)
    _draw_section(svg, sysm, sect_x, sect_y, plan_w, sect_plan_h, L, H, ppm, x_min, mx)

    # ───────────────────────── LEGEND ─────────────────────────
    legend_x = width - legend_w + 4
    legend_bottom = _draw_legend(svg, sysm, legend_x, plan_y - 2, legend_w - 24)

    # ───────────────────────── SCHEDULE ─────────────────────────
    # the schedule lives in the RIGHT gutter directly below the legend (its own column),
    # so the tall left-column section never squeezes it.
    sched_y = legend_bottom + 18
    _draw_schedule(svg, sysm, legend_x, sched_y, legend_w - 24,
                   (height - title_h - 24) - sched_y)

    # ───────────────────────── scale bar + title block ─────────────────────────
    bar_total = _nice_bar_mm(scale_S)
    scale_bar(svg, margin + 6, height - title_h - 24, scale_S, ppm, bar_total)
    _draw_title_block(svg, sysm, meta, scale_S, width, height, title_h)
    return svg.render()


def _draw_plan_distribution(svg, sysm, pc, ppm, plan_x, plan_y, plan_w, plan_h):
    """Draw the air/coolant distribution in the PLAN as an ORTHOGONAL trunk-and-branch
    layout (the way a real duct/pipe layout routes), not a diagonal star:

      • find the served-zone ROW axis (the axis the zones spread along);
      • run a SUPPLY trunk parallel to that row, on the hub side, from the hub across
        the row; tap a PERPENDICULAR supply branch from the trunk to each zone diffuser;
      • run a RETURN trunk parallel on the FAR side, with perpendicular return pickups.

    Each duct is a sized DOUBLE LINE; the trunk carries the size+flow label, branches
    carry their (smaller) size.  Supply/return/liquid stay visually distinct."""
    zc = [(z, pc[z.tag]) for z in sysm.zones if z.tag in pc]
    hub = sysm.hubs[0]
    hub_pt = pc.get(hub.tag, (plan_x + plan_w * 0.5, plan_y + plan_h * 0.5))
    if not zc:
        return

    xs = [p[0] for _z, p in zc]
    ys = [p[1] for _z, p in zc]
    # row axis = the axis the zones spread ALONG (the longer spread).
    row_is_x = (max(xs) - min(xs)) >= (max(ys) - min(ys))

    sup_service = SERVICE_LIQUID if sysm.medium == "liquid" else SERVICE_SUPPLY
    sup = [d for d in sysm.ducts if d.service in (SERVICE_SUPPLY, SERVICE_LIQUID)
           and d.frm == hub.tag]
    br = [d for d in sysm.ducts if d.service in (SERVICE_SUPPLY, SERVICE_LIQUID)
          and d.frm != hub.tag]
    trunk_w = (sup[0].width_mm if sup else 12) * ppm
    branch_w = (br[0].width_mm if br else 6) * ppm
    trunk_lbl = sup[0].size_label if sup else (br[0].size_label if br else "")
    trunk_flow = sup[0].airflow_cms if sup else 0.0
    branch_lbl = br[0].size_label if br else ""
    branch_flow = br[0].airflow_cms if br else 0.0

    # cross axis = perpendicular to the row; cluster zones into ROWS on it (1 or 2 for a
    # single aisle / hot-cold-aisle pair).  A 2-row block routes the SUPPLY spine down
    # the CENTRAL AISLE between the rows (the data-centre / containment idiom), branching
    # up + down; RETURN runs the two outer walls.  A single row uses a hub-side trunk +
    # a far-side return.
    cross = ys if row_is_x else xs
    cmid = (min(cross) + max(cross)) / 2.0
    band_lo = [(z, p) for z, p in zc if (p[1] if row_is_x else p[0]) <= cmid + 1]
    band_hi = [(z, p) for z, p in zc if (p[1] if row_is_x else p[0]) > cmid + 1]
    two_rows = (max(cross) - min(cross) > 30) and band_lo and band_hi

    along_lo = min(xs) if row_is_x else min(ys)
    along_hi = max(xs) if row_is_x else max(ys)
    pad = max(trunk_w, branch_w) / 2.0 + 14
    first_z = zc[0][0]

    def seg(a0, a1, w, service, **kw):
        _orth_duct(svg, a0, a1, w, service, row_is_x=row_is_x, **kw)

    if two_rows:
        spine = cmid                                  # central aisle on the cross axis
        out_lo = min(cross) - pad                      # near outer wall (return)
        out_hi = max(cross) + pad                      # far outer wall (return)
        # SUPPLY spine down the aisle + a leg from the hub into the spine.
        seg(_pt(row_is_x, along_lo, spine), _pt(row_is_x, along_hi, spine), trunk_w,
            sup_service, label=trunk_lbl, airflow_cms=trunk_flow)
        seg(hub_pt, _pt(row_is_x, _along(hub_pt, row_is_x), spine), trunk_w,
            sup_service)
        # RETURN trunks on both outer walls + a leg back to the hub from the near one.
        seg(_pt(row_is_x, along_lo, out_lo), _pt(row_is_x, along_hi, out_lo), trunk_w,
            SERVICE_RETURN, label="return")
        seg(_pt(row_is_x, along_lo, out_hi), _pt(row_is_x, along_hi, out_hi), trunk_w,
            SERVICE_RETURN)
        seg(_pt(row_is_x, _along(hub_pt, row_is_x), out_lo), hub_pt, trunk_w,
            SERVICE_RETURN)
        for band, outwall in ((band_lo, out_lo), (band_hi, out_hi)):
            for z, p in band:
                a = _along(p, row_is_x)
                c = p[1] if row_is_x else p[0]
                # supply branch: spine → zone diffuser (perpendicular tap)
                seg(_pt(row_is_x, a, spine), _pt(row_is_x, a, c), branch_w, sup_service,
                    label=branch_lbl if z is first_z else None,
                    airflow_cms=branch_flow if z is first_z else 0.0)
                # return branch: zone → outer wall (offset so it doesn't sit on supply)
                seg(_pt(row_is_x, a + 8, c), _pt(row_is_x, a + 8, outwall), branch_w,
                    SERVICE_RETURN)
                _draw_diffuser(svg, p[0], p[1], sup_service)
    else:
        sup_wall = min(cross) - pad
        ret_wall = max(cross) + pad
        seg(hub_pt, _pt(row_is_x, _along(hub_pt, row_is_x), sup_wall), trunk_w,
            sup_service)
        seg(_pt(row_is_x, along_lo, sup_wall), _pt(row_is_x, along_hi, sup_wall),
            trunk_w, sup_service, label=trunk_lbl, airflow_cms=trunk_flow)
        seg(_pt(row_is_x, along_lo, ret_wall), _pt(row_is_x, along_hi, ret_wall),
            trunk_w, SERVICE_RETURN, label="return")
        seg(_pt(row_is_x, _along(hub_pt, row_is_x) + 8, ret_wall),
            _pt(row_is_x, _along(hub_pt, row_is_x) + 8, sup_wall), trunk_w,
            SERVICE_RETURN)
        for z, p in zc:
            a = _along(p, row_is_x)
            c = p[1] if row_is_x else p[0]
            seg(_pt(row_is_x, a, sup_wall), _pt(row_is_x, a, c), branch_w, sup_service,
                label=branch_lbl if z is first_z else None,
                airflow_cms=branch_flow if z is first_z else 0.0)
            seg(_pt(row_is_x, a + 8, c), _pt(row_is_x, a + 8, ret_wall), branch_w,
                SERVICE_RETURN)
            _draw_diffuser(svg, p[0], p[1], sup_service)


def _pt(row_is_x, along, cross):
    """Compose a point from (along-axis, cross-axis) coords given the row orientation:
    when the row runs along X, along=x and cross=y; when along Y, along=y and cross=x."""
    return (along, cross) if row_is_x else (cross, along)


def _along(p, row_is_x):
    return p[0] if row_is_x else p[1]


def _orth_duct(svg, p0, p1, width_px, service, label=None, airflow_cms=0.0,
               row_is_x=True):
    """Draw one ORTHOGONAL (axis-aligned) duct segment as a sized double line."""
    _draw_double_line_duct(svg, p0[0], p0[1], p1[0], p1[1], max(width_px, 3.0),
                           service, label=label, airflow_cms=airflow_cms)


def _draw_setout_grid(svg, ox, oy, pw, ph, L_mm, W_mm, ppm):
    def _pitch(span_mm):
        for m in (2000, 5000, 10000, 20000, 50000):
            if span_mm / m <= 8:
                return m
        return 100000
    px_pitch = _pitch(L_mm)
    py_pitch = _pitch(W_mm)
    n = 0
    xx = 0.0
    while xx <= L_mm + 1:
        gx = ox + xx * ppm
        svg.line(gx, oy - 6, gx, oy + ph, stroke=GRID_FAINT, width=0.9)
        svg.circle(gx, oy - 13, 6.5, stroke=DATUM_INK, width=0.8, fill=FILL_BG)
        svg.text(gx, oy - 10, str(n + 1), size=7.5, anchor="middle", fill=MUTED)
        xx += px_pitch
        n += 1
    n = 0
    yy = W_mm
    while yy >= -1:
        gy = oy + (W_mm - yy) * ppm
        svg.line(ox - 6, gy, ox + pw, gy, stroke=GRID_FAINT, width=0.9)
        svg.circle(ox - 13, gy, 6.5, stroke=DATUM_INK, width=0.8, fill=FILL_BG)
        svg.text(ox - 13, gy + 2.5, chr(ord("A") + n), size=7.5, anchor="middle",
                 fill=MUTED)
        yy -= py_pitch
        n += 1


def _dim_h(svg, x_a, x_b, y, value_mm, ext_from=None):
    if x_b < x_a:
        x_a, x_b = x_b, x_a
    if ext_from is not None:
        svg.line(x_a, ext_from - 3, x_a, y, stroke=DIM_INK, width=0.8)
        svg.line(x_b, ext_from - 3, x_b, y, stroke=DIM_INK, width=0.8)
    svg.add(f'<line x1="{x_a:.1f}" y1="{y:.1f}" x2="{x_b:.1f}" y2="{y:.1f}" '
            f'stroke="{DIM_INK}" stroke-width="1.0" marker-start="url(#dim)" '
            f'marker-end="url(#dim)"/>')
    svg.text((x_a + x_b) / 2.0, y - 4, _fmt_mm(value_mm), size=10, anchor="middle",
             fill=DIM_INK, weight="bold")


def _dim_v(svg, y_a, y_b, x, value_mm, ext_from=None):
    """A VERTICAL overall dimension (the plan DEPTH / building width), drawn to the LEFT of
    the plan so both building dimensions read off the HVAC plan — the same plant envelope
    the General Arrangement annotates. Mirrors _dim_h."""
    if y_b < y_a:
        y_a, y_b = y_b, y_a
    if ext_from is not None:
        svg.line(ext_from - 3, y_a, x, y_a, stroke=DIM_INK, width=0.8)
        svg.line(ext_from - 3, y_b, x, y_b, stroke=DIM_INK, width=0.8)
    svg.add(f'<line x1="{x:.1f}" y1="{y_a:.1f}" x2="{x:.1f}" y2="{y_b:.1f}" '
            f'stroke="{DIM_INK}" stroke-width="1.0" marker-start="url(#dim)" '
            f'marker-end="url(#dim)"/>')
    # rotated label, centred on the dimension line
    cy = (y_a + y_b) / 2.0
    svg.add(f'<text x="{x - 4:.1f}" y="{cy:.1f}" font-size="10" '
            f'text-anchor="middle" fill="{DIM_INK}" font-weight="bold" '
            f'transform="rotate(-90 {x - 4:.1f} {cy:.1f})">{_fmt_mm(value_mm)}</text>')


def _draw_section(svg, sysm, ox, oy, pw, ph, L_mm, H_mm, ppm, x_min, mx):
    """A SECTION CUT ALONG THE SERVED-ZONE ROW: the floor + the zones standing on it, a
    SUPPLY duct at high level over them with drops to each diffuser, and a RETURN duct
    at low level (or the coolant flow/return mains for a liquid system).  The cut is
    taken ALONG the row the zones spread on (not always world-X), so every zone shows in
    a line — conveys the vertical arrangement the plan can't."""
    floor_y = oy + ph
    # faint level lines
    for step in (2000, 5000, 10000):
        if H_mm / step <= 6:
            pitch = step
            break
    else:
        pitch = 20000
    lvl = 0.0
    while lvl <= H_mm + 1:
        gy = floor_y - lvl * ppm
        if gy >= oy - 1:
            svg.line(ox, gy, ox + pw, gy, stroke=GRID_FAINT, width=0.8)
            svg.text(ox + pw + 4, gy + 3, f"+{lvl/1000:.0f}m" if lvl else "0",
                     size=7.5, fill=DATUM_INK)
        lvl += pitch
    # floor / datum
    svg.line(ox - 8, floor_y, ox + pw + 8, floor_y, stroke=INK, width=1.6)
    for i in range(int((pw + 16) / 12) + 1):
        hx = ox - 8 + i * 12
        svg.line(hx, floor_y, hx - 6, floor_y + 6, stroke=MUTED, width=0.7)
    svg.text(ox + pw + 10, floor_y + 12, "± 0.000  FFL", size=8.4, fill=MUTED)

    liquid = sysm.medium == "liquid"
    s_ink, s_fill = _service_ink(SERVICE_LIQUID if liquid else SERVICE_SUPPLY)
    r_ink, _rf = _service_ink(SERVICE_RETURN)
    sup_y = oy + ph * 0.16
    ret_y = floor_y - 18

    # the section runs ALONG the row axis.  Map each item's along-coordinate to the
    # section width.  Distinct rows (hot/cold aisle) collapse onto the one cut line —
    # the section shows the z-arrangement, the plan shows the two rows.
    all_eq = sysm.hubs + sysm.zones
    axs = [e.cx for e in all_eq]
    ays = [e.cy for e in all_eq]
    row_is_x = (max(axs) - min(axs)) >= (max(ays) - min(ays))
    a_lo = min(axs) if row_is_x else min(ays)
    a_hi = max(axs) if row_is_x else max(ays)
    a_span = max(a_hi - a_lo, 1.0)

    def sx(e_along):
        return ox + (e_along - a_lo) / a_span * pw

    # de-overlap pass for the SECTION's own tags (2026-07-05 HVAC-label fix, G9): a
    # narrow section cut can clamp several zones into nearly the same along-coordinate
    # (drawing_gates G9 caught 'Z-01'..'Z-08' piling up 100% on a tight BESS section
    # BOTH before and after the equipment-label fix above — a pre-existing, separate
    # collision this SAME _TagPlacer idiom closes) — register every zone + the hub tag
    # here and resolve them in one pass, exactly like draw_ga.py's elevations.
    sect_tags = _ga._TagPlacer(svg, bounds=(ox - 2, oy - 2, ox + pw + 2, floor_y + 2))
    # the supply/return main BAND width (also used below, unchanged, when the mains
    # are actually drawn) — computed early so the placer can reserve those rows.
    band = max(sysm.ducts[0].width_mm * ppm if sysm.ducts else 8, 6)
    # reserve the supply/return main-label bands (drawn below, after zxs/hx are known)
    # so a displaced zone/hub tag can never overprint them.
    sect_tags.block(ox - 2, sup_y - band - 14, ox + pw + 2, sup_y - 2)
    sect_tags.block(ox - 2, ret_y + 2, ox + pw + 2, ret_y + band + 20)

    # zones standing on the floor, laid along the row.
    zxs = []
    for z in sysm.zones:
        zw = max(z.w * ppm, 10)
        zh = max(min(z.h, H_mm * 0.55) * ppm, 24)
        za = z.cx if row_is_x else z.cy
        zx = min(max(sx(za) - zw / 2, ox), ox + pw - zw)
        zy = floor_y - zh
        svg.rect(zx, zy, zw, zh, stroke=EQ_INK, width=1.2, fill="#f0f3f7", rx=1)
        if zw > 16:
            sect_tags.add(zx + zw / 2, zy - 4, z.tag, 7.0, anchor_pt=(zx + zw / 2, zy))
        zxs.append((zx + zw / 2, zy))

    # the hub on the floor at its along-coordinate (clamped into the frame).
    hub = sysm.hubs[0]
    hw = max(hub.w * ppm, 16)
    hh = max(min(hub.h, H_mm * 0.7) * ppm, 30)
    hx = min(max(sx(hub.cx if row_is_x else hub.cy) - hw / 2, ox), ox + pw - hw)
    svg.rect(hx, floor_y - hh, hw, hh, stroke=EQ_INK, width=1.7, fill=EQ_FILL, rx=2)
    sect_tags.add(hx + hw / 2, floor_y - hh - 4, hub.tag, 8.0,
                  anchor_pt=(hx + hw / 2, floor_y - hh))
    sect_tags.flush()

    # supply main at high level across the zones + a return main low — drawn as a
    # double-line band, with drops to each zone. (`band` computed earlier, above the
    # zone loop, so the tag placer can reserve its row.)
    xL = min([p[0] for p in zxs] + [hx + hw]) if zxs else hx + hw
    xR = max([p[0] for p in zxs] + [hx]) if zxs else ox + pw - 20
    # supply
    svg.rect(xL, sup_y - band / 2, xR - xL, band, stroke=s_ink, width=1.3,
             fill=s_fill, rx=1)
    svg.line(hx + hw / 2, floor_y - hh, hx + hw / 2, sup_y, stroke=s_ink, width=1.4)
    # return
    svg.rect(xL, ret_y - band / 2, xR - xL, band, stroke=r_ink, width=1.3,
             fill=RETURN_FILL, rx=1, dash="6,3")
    # drops from supply to each zone diffuser + return pickups.
    for (zx, zy) in zxs:
        svg.line(zx, sup_y + band / 2, zx, zy + 4, stroke=s_ink, width=1.3)
        _draw_diffuser(svg, zx, zy + 8, SERVICE_LIQUID if liquid else SERVICE_SUPPLY)
        svg.line(zx + 6, zy + 14, zx + 6, ret_y - band / 2, stroke=r_ink, width=1.0,
                 dash="4,3")
    lab_sup = "Coolant flow main" if liquid else "Supply duct (high level)"
    lab_ret = "Coolant return main" if liquid else "Return duct (low level)"
    svg.text(xL + 2, sup_y - band / 2 - 4, lab_sup, size=7.4, fill=s_ink, weight="bold")
    svg.text(xL + 2, ret_y + band / 2 + 11, lab_ret, size=7.4, fill=r_ink, weight="bold")


# ═══════════════════════════════════════════════════════════════════════════
# LEGEND
# ═══════════════════════════════════════════════════════════════════════════

def _draw_legend(svg, sysm, x, y, w):
    rows = [
        ("supply_duct", SERVICE_SUPPLY, "Supply air duct (sized)"),
        ("return_duct", SERVICE_RETURN, "Return air duct"),
        ("exhaust_duct", SERVICE_EXHAUST, "Exhaust / relief air"),
        ("liquid", SERVICE_LIQUID, "Liquid coolant pipe"),
        ("diffuser", SERVICE_SUPPLY, "Supply diffuser (4-way)"),
        ("grille", SERVICE_RETURN, "Return grille"),
        ("ahu", None, "Air-handling unit / CRAC"),
        ("zone", None, "Served zone / rack"),
    ]
    # liquid-only systems hide the air-only rows + vice versa to stay honest.
    if sysm.medium == "liquid":
        rows = [r for r in rows if r[0] not in (
            "supply_duct", "return_duct", "exhaust_duct", "diffuser", "grille")]
        rows = [("liquid", SERVICE_LIQUID, "Coolant flow / return pipe"),
                ("coldplate", SERVICE_LIQUID, "Rack cold plate"),
                ("ahu", None, "Liquid chiller / cooling skid"),
                ("zone", None, "Served rack")]
    elif sysm.medium == "air":
        rows = [r for r in rows if r[0] != "liquid"]
    # the dehumidification unit (latent side) gets its own key row when the ledger has one.
    if sysm.dehumidifier is not None:
        rows = rows + [("dehumidifier", None, "Dehumidification unit (latent)")]

    rowh = 26
    header_h = 22
    pad = 12
    bh = header_h + pad + len(rows) * rowh
    svg.rect(x, y, w, bh, stroke=GRID_FAINT, width=1.2, fill=PANEL_BG, rx=4)
    svg.text(x + 12, y + 16, "LEGEND", size=10, weight="bold", fill=MUTED)
    yy = y + header_h + 14
    gx = x + 24
    tx = x + 50
    for kind, service, lbl in rows:
        _mini_glyph(svg, gx, yy, kind, service)
        svg.text(tx, yy + 4, lbl, size=8.6, fill=MUTED)
        yy += rowh
    return y + bh


def _mini_glyph(svg, cx, cy, kind, service):
    if kind in ("supply_duct", "return_duct", "exhaust_duct", "liquid"):
        ink, fill = _service_ink(service)
        dash = "5,3" if kind in ("return_duct", "exhaust_duct") else None
        svg.rect(cx - 11, cy - 4, 22, 8, stroke=ink, width=1.3, fill=fill, rx=1,
                 dash=dash)
        mk = {SERVICE_SUPPLY: "airS", SERVICE_RETURN: "airR", SERVICE_EXHAUST: "airS",
              SERVICE_LIQUID: "airL"}[service]
        svg.add(f'<line x1="{cx-4:.1f}" y1="{cy:.1f}" x2="{cx+2:.1f}" y2="{cy:.1f}" '
                f'stroke="{ink}" stroke-width="1.4" marker-end="url(#{mk})"/>')
    elif kind in ("diffuser", "grille", "coldplate"):
        sv = SERVICE_SUPPLY if kind == "diffuser" else (
            SERVICE_LIQUID if kind == "coldplate" else SERVICE_RETURN)
        _draw_diffuser(svg, cx, cy, sv)
    elif kind == "ahu":
        svg.rect(cx - 9, cy - 6, 18, 12, stroke=EQ_INK, width=1.5, fill=EQ_FILL, rx=1)
        svg.circle(cx - 4, cy - 1, 3, stroke=EQ_INK, width=0.8)
    elif kind == "dehumidifier":
        svg.rect(cx - 9, cy - 6, 18, 12, stroke=DEHUM_INK, width=1.5, fill=DEHUM_FILL,
                 rx=1)
        for k in (-4, 0, 4):
            svg.line(cx + k, cy - 4, cx + k, cy + 4, stroke=DEHUM_INK, width=0.7)
    else:  # zone
        svg.rect(cx - 9, cy - 5, 18, 10, stroke=EQ_INK, width=1.1, fill="#f0f3f7", rx=1)


# ═══════════════════════════════════════════════════════════════════════════
# DUCT / EQUIPMENT SCHEDULE
# ═══════════════════════════════════════════════════════════════════════════

def _draw_schedule(svg, sysm, x, y, w, h_max):
    """A compact DUCT SCHEDULE: collapses identical branch sizes to a count row, lists
    the hub(s) + the trunk + a representative branch."""
    # collapse ducts by (service, size_label) → count + representative flow.
    from collections import OrderedDict
    groups = OrderedDict()
    for d in sysm.ducts:
        key = (d.service, d.size_label)
        g = groups.setdefault(key, {"n": 0, "cms": d.airflow_cms, "kw": d.duty_kw,
                                    "v": d.velocity_ms})
        g["n"] += 1
    rows = []
    for (service, size), g in groups.items():
        svc = {SERVICE_SUPPLY: "Supply", SERVICE_RETURN: "Return",
               SERVICE_EXHAUST: "Exhaust", SERVICE_LIQUID: "Coolant"}[service]
        meta = []
        if g["cms"] > 0:
            meta.append(f"{g['cms']:.2f} m³/s")
            meta.append(f"{_cfm(g['cms']):,} cfm")
        if g["v"] > 0:
            meta.append(f"{g['v']:g} m/s")
        elif g["kw"] > 0:
            meta.append(f"{g['kw']:g} kW")
        cnt = f"×{g['n']}" if g["n"] > 1 else ""
        rows.append((f"{svc} {size}", f"{cnt}  {'  '.join(meta)}".strip()))

    header_h = 20
    rh = 13.0
    pad = 8
    rows = rows[:max(int((h_max - header_h - pad) // rh), 1)]
    panel_h = header_h + len(rows) * rh + pad
    svg.rect(x, y, w, panel_h, stroke=GRID_FAINT, width=1.1, fill=FILL_BG)
    svg.rect(x, y, w, header_h, stroke=GRID_FAINT, width=1.1, fill=PANEL_BG)
    title = "COOLANT SCHEDULE" if sysm.medium == "liquid" else "DUCT SCHEDULE"
    svg.text(x + 8, y + 14, title, size=9.0, weight="bold", fill=MUTED)
    yy = y + header_h + 11
    for tag, note in rows:
        svg.text(x + 8, yy, tag, size=8.0, weight="bold", fill=EQ_INK)
        # fit by dropping whole trailing tokens — never a mid-word clip.
        while len(note) > 30 and "  " in note:
            note = note.rsplit("  ", 1)[0]
        svg.text(x + 108, yy, note, size=7.6, fill=MUTED, mono=True)
        yy += rh


# ═══════════════════════════════════════════════════════════════════════════
# TITLE BLOCK
# ═══════════════════════════════════════════════════════════════════════════

def _wrap_words(text: str, limit: int) -> list:
    """Word-boundary wrap: never cuts mid-word, never drops text (the fix for the
    clipped 'from the desig…' / 'verify aga…' title-block notes, v54 2026-07-02)."""
    words = str(text or "").split()
    lines, cur = [], ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if len(cand) <= limit or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _note_lines(sysm) -> list:
    """Every note, word-wrapped to the title-block width. Returns a list of
    (text, is_first_line_of_note) so the renderer bullets only the first line."""
    out = []
    for note in (sysm.notes or []):
        for i, ln in enumerate(_wrap_words(note, 96)):
            out.append((ln, i == 0))
    return out


def _draw_title_block(svg, sysm, meta, scale_S, width, height, title_h):
    y0 = height - title_h + 24
    x0 = 30
    x1 = width - 30
    svg.line(x0, y0, x1, y0, stroke=INK, width=1.6)

    bw = 320
    bx0 = x1 - bw
    by0 = y0 + 14
    rows = [("DRAWING No.", "FF-HVAC-001"),
            ("REV", _tb.REV),
            ("DATE", _ISSUE_DATE or "—  "),
            ("SCALE", f"1:{int(scale_S)}  (@ A1)")]
    rh = 22
    box_h = rh * len(rows)
    svg.rect(bx0, by0, bw, box_h, stroke=INK, width=1.3, fill=FILL_BG)
    for i, (k, v) in enumerate(rows):
        ry = by0 + i * rh
        if i:
            svg.line(bx0, ry, bx0 + bw, ry, stroke=GRID_FAINT, width=1.0)
        svg.line(bx0 + 112, by0, bx0 + 112, by0 + box_h, stroke=GRID_FAINT, width=1.0)
        svg.text(bx0 + 8, ry + 15, k, size=9, fill=MUTED, weight="bold")
        svg.text(bx0 + 120, ry + 15, v, size=9.5)

    svg.text(x0, y0 + 24, "FRACTIONAL FORGE · ForgeOS", size=12, weight="bold")
    title = ("HVAC COOLANT LAYOUT" if sysm.medium == "liquid"
             else "HVAC / DUCT LAYOUT")
    svg.text(x0, y0 + 43, f"{title} — {_humanise(sysm.archetype)}",
             size=15, weight="bold", fill=EQ_INK)
    # the air/cooling headline.
    if sysm.medium == "liquid":
        head = (f"Liquid-cooled · chiller {sysm.cooling_kw:.0f} kW heat rejection · "
                f"{len(sysm.zones)} served rack(s).")
    else:
        latent = ""
        if sysm.dehumidifier is not None:
            dh = sysm.dehumidifier
            lat_bits = []
            if dh.power_kw:
                lat_bits.append(f"{dh.power_kw:.0f} kW")
            if dh.moisture_load_kg_h:
                lat_bits.append(f"{dh.moisture_load_kg_h:.0f} kg/h")
            latent = (f" · dehumidification {' / '.join(lat_bits)}"
                      if lat_bits else " · dehumidification")
        # the headline quotes the SAME effective airflow the ducts were sized from (one
        # source of truth); a zero/unpublished duty is OMITTED, never printed as "0 kW".
        duty = (f" · {sysm.duty_word} {sysm.cooling_kw:.0f} kW"
                if sysm.cooling_kw > 0 else "")
        head = (f"Supply airflow {sysm.airflow_cms:.2f} m³/s "
                f"({_cfm(sysm.airflow_cms):,} cfm){duty}{latent} · "
                f"{len(sysm.zones)} served zone(s).")
    svg.text(x0, y0 + 61, head, size=9.5, fill=MUTED)
    svg.text(x0, y0 + 78,
             "Plan + section · ducts sized from airflow ÷ velocity (≤9 m/s) · "
             "supply / return shown distinctly · datum ± 0.000 = FFL.",
             size=9.0, fill=MUTED)
    ny = y0 + 95
    for ln, is_first in _note_lines(sysm):
        svg.text(x0 + (0 if is_first else 10), ny, ("• " if is_first else "") + ln,
                 size=8.5, fill=MUTED)
        ny += 12
    svg.text(x0, ny + 2,
             "NOT FOR CONSTRUCTION — preliminary auto-generated mechanical-services "
             "layout; verify against the P&ID + room layout before issue.",
             size=9.0, fill="#a4332a", weight="bold")
    # shared general-tolerance note (ONE source of truth: drawing_titleblock.py) — drawn
    # BELOW the NFC line, full width, clear of the metadata box.
    svg.text(x0, ny + 18, _tb.TOLERANCE_NOTE, size=8.5, fill=MUTED)


# ═══════════════════════════════════════════════════════════════════════════
# RASTERISATION  (SVG → PNG) — identical cascade to the GA / P&ID
# ═══════════════════════════════════════════════════════════════════════════

def _svg_dims(svg_text: str):
    mw = re.search(r'<svg[^>]*\bwidth="([\d.]+)"', svg_text)
    mh = re.search(r'<svg[^>]*\bheight="([\d.]+)"', svg_text)
    return (int(math.ceil(float(mw.group(1)))) if mw else 1200,
            int(math.ceil(float(mh.group(1)))) if mh else 800)


def rasterise(svg_path: Path, png_path: Path, scale: int = 2) -> bool:
    svg_text = svg_path.read_text()
    w, h = _svg_dims(svg_text)
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=w * scale, output_height=h * scale,
                         background_color="white")
        if png_path.is_file() and png_path.stat().st_size > 1000:
            return True
    except Exception:
        pass
    rsvg = shutil.which("rsvg-convert")
    if rsvg:
        try:
            subprocess.run([rsvg, "-w", str(w * scale), "-h", str(h * scale),
                            "-b", "white", "-o", str(png_path), str(svg_path)],
                           check=True, capture_output=True, timeout=60)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception:
            pass
    chrome = _find_chrome()
    if chrome:
        try:
            subprocess.run(
                [chrome, "--headless", "--disable-gpu", "--no-sandbox",
                 f"--screenshot={png_path}",
                 f"--window-size={w},{h}",
                 f"--force-device-scale-factor={scale}",
                 "--default-background-color=FFFFFFFF",
                 "--hide-scrollbars", f"file://{Path(svg_path).resolve()}"],
                check=True, capture_output=True, timeout=90)
            if png_path.is_file() and png_path.stat().st_size > 1000:
                return True
        except Exception as ex:
            print(f"[hvac] chrome rasterise failed: {ex}")
    return False


def _find_chrome():
    for c in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ):
        if Path(c).is_file():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def generate_hvac(out_dir: str, state_path: Optional[str] = None,
                  manifest_path: Optional[str] = None, rasterise_png: bool = True):
    """Full pipeline: load → derive air/cooling system → draw → write SVG (+ PNG)."""
    global _ISSUE_DATE
    # deterministic title-block issue date from the run's own artifacts (set before draw).
    _ISSUE_DATE = _tb.issue_date(out_dir)
    manifest, state, schedule = load_inputs(out_dir, state_path, manifest_path)
    sysm = derive_air_system(manifest, state, schedule, out_dir)
    if sysm.not_applicable:
        # NO-ORPHAN-SUBSYSTEM: write NOTHING — no SVG, no PNG, no A1 set. The renderer's
        # existing existsSync-gated skip (the "same philosophy" this module's own module
        # docstring already claims for a missing rasteriser) omits the HVAC sheet
        # entirely, exactly as if Blender were absent — never a fabricated drawing for a
        # subsystem the design has no requirement for.
        print(f"[hvac] NOT APPLICABLE — {sysm.not_applicable_reason}")
        summary = {
            "archetype": sysm.archetype, "medium": sysm.medium, "svg": None, "png": None,
            "a1": None, "hubs": 0, "zones": 0, "ducts": 0, "diffusers": 0,
            "airflow_cms": 0.0, "airflow_cfm": 0, "cooling_kw": 0.0,
            "zones_derived": False, "schedule_present": False,
            "not_applicable": True, "not_applicable_reason": sysm.not_applicable_reason,
        }
        return summary, sysm, ""
    meta = {"count": manifest.get("count", 0), "schema": manifest.get("schema", "")}
    # WALL-PENETRATION SEAL (2026-07-05, HVAC air-side coverage pass): a BoM line
    # describing a duct's fire/gas-tight wall-penetration seal (the transit frame where a
    # duct crosses the enclosure wall — e.g. an off-gas exhaust duct's Roxtec transit) is
    # drawn as an explicit glyph on the duct run, never assumed absent. The label is read
    # from the BoM's OWN requirement/part/qty, never a hardcoded manufacturer/count —
    # universal, keyed on the requirement text (any '<...> duct <...> penetration <...>
    # seal <...>' line), no product-class table. Absent for a design with no such line.
    _pen_rx = re.compile(r"duct.*penetration.*seal|penetration.*seal.*duct", re.I)
    _pen_row = next((r for r in (state.get("requirementsBom") or [])
                     if isinstance(r, dict) and _pen_rx.search(str(r.get("requirement") or ""))),
                    None)
    if _pen_row:
        meta["duct_penetration_seal"] = {
            "requirement": _pen_row.get("requirement"),
            "part": _pen_row.get("part"),
            "qty": _pen_row.get("qty"),
            "tag": _pen_row.get("tag"),
        }
    else:
        # FALLBACK — moduleDecomposition word (2026-07-05, fresh-run coverage fix): on a
        # fresh chain run this stage can execute BEFORE state.requirementsBom carries the
        # seal line at all — requirementsBom is synthesised/enriched by LATER pipeline
        # stages (price-lift, dedupe), so a run that reached HVAC drawing early in an
        # iteration legitimately has no such row yet, even though the design's own
        # moduleDecomposition (Phase-2 emission, well upstream of BoM synthesis) already
        # carries the word. A REBUILD against an already-finalised state.json (requirements
        # Bom populated) never hit this gap — only a genuinely FRESH end-to-end run does.
        # Same universal keying as the requirementsBom lookup above (the word's OWN
        # name_human text, no product-class table) — just read from the earlier-available
        # source when the later one hasn't caught up yet.
        for _m in (state.get("moduleDecomposition") or {}).get("modules") or []:
            if _pen_row:
                break
            for _sm in (_m.get("sub_modules") or []) if isinstance(_m, dict) else []:
                if _pen_row:
                    break
                for _w in (_sm.get("words") or []) if isinstance(_sm, dict) else []:
                    if not isinstance(_w, dict):
                        continue
                    _nm = str(_w.get("name_human") or "")
                    _cc = _w.get("content_character") or {}
                    if not _pen_rx.search(_nm) and not _pen_rx.search(str(_cc.get("name_human") or "")):
                        continue
                    _mods = {mc.get("kind"): mc.get("value") for mc in (_w.get("modifier_characters") or [])
                              if isinstance(mc, dict)}
                    _mfr = str(_mods.get("manufacturer") or "").strip()
                    _pn = str(_mods.get("part_number") or "").strip()
                    _qty_raw = str(_mods.get("quantity") or "").strip().lstrip("×x").strip()
                    try:
                        _qty = float(_qty_raw) if _qty_raw else None
                        _qty = int(_qty) if _qty is not None and _qty == int(_qty) else _qty
                    except (TypeError, ValueError):
                        _qty = None
                    _pen_row = {
                        "requirement": _nm or str(_cc.get("name_human") or ""),
                        "part": (f"{_mfr} {_pn}".strip() or None),
                        "qty": _qty,
                        "tag": _w.get("id"),
                    }
                    break
        if _pen_row:
            meta["duct_penetration_seal"] = _pen_row
    svg_text = build_hvac_svg(sysm, meta)

    draw_dir = Path(out_dir) / "drawings"
    draw_dir.mkdir(parents=True, exist_ok=True)
    svg_path = draw_dir / "hvac-layout.svg"
    png_path = draw_dir / "hvac-layout.png"
    svg_path.write_text(svg_text)
    png_ok = rasterise(svg_path, png_path) if rasterise_png else False

    # print-ready ISO A1 PDF set (routed gap #1 — FF-HVAC-001 rendered PNG/SVG masters but
    # never exported an A1 print set, unlike every other drawing family; the Drawings tab's
    # per-sheet pdf_ok check failed for HVAC as a result). Mirrors draw_pid.py / draw_bfd.py's
    # A1 export exactly: additive (the SVG master above is untouched) + non-fatal by contract.
    a1 = None
    try:
        import a1_print
        a1 = a1_print.export_a1(svg_path, base="hvac", title="HVAC & Cooling Layout")
    except Exception as ex:  # noqa: BLE001 — the A1 print set never blocks the drawing
        print(f"[hvac] A1 PDF export skipped: {type(ex).__name__}: {ex}")

    summary = {
        "archetype": sysm.archetype,
        "medium": sysm.medium,
        "svg": str(svg_path),
        "png": str(png_path) if png_ok else None,
        "a1": a1,
        "hubs": len(sysm.hubs),
        "zones": len(sysm.zones),
        "ducts": len(sysm.ducts),
        "diffusers": len(sysm.diffusers),
        "airflow_cms": round(sysm.airflow_cms, 3),
        "airflow_cfm": _cfm(sysm.airflow_cms),
        "cooling_kw": round(sysm.cooling_kw, 1),
        "zones_derived": sysm.zones_derived,
        "schedule_present": sysm.schedule_present,
        "not_applicable": False,
    }
    return summary, sysm, svg_text


def _selftest() -> int:
    """Pure, no-Blender proveCatch for the NO-ORPHAN-SUBSYSTEM scope gate in
    derive_air_system (Sam Green SME review, 2026-07-07). Proves BOTH directions on
    synthetic manifest/state fixtures — no fixture files, no Blender, no rasteriser."""
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    empty_manifest = {"parts": [], "bbox_mm": {"x_min_mm": 0, "y_min_mm": 0,
                                               "x_max_mm": 20000, "y_max_mm": 10000}}

    # (a) proveCatch — a water-treatment-shaped design (Sam's Fischer Farms case): no
    # placed HVAC equipment, no served zones, no airflow/cooling/heating quantity, no
    # thermal schedule row, no dehumidifier. MUST come back not_applicable.
    water_state = {"orchestratorContract": {"product_class": "aquaculture_ras",
                                            "quantities": {
                                                "irrigation_pump_flow_m3_h": {"value": 90},
                                                "ro_permeate_flow_m3_h": {"value": 11},
                                            }}}
    sysm_water = derive_air_system(empty_manifest, water_state, {}, "/tmp")
    chk("water_plant_not_applicable", sysm_water.not_applicable is True)
    chk("water_plant_no_hub_synthesised", len(sysm_water.hubs) == 0)
    chk("water_plant_reason_states_no_requirement",
        "no HVAC" in sysm_water.not_applicable_reason)

    # (b) proveNoFalsePositive — a design with a real published cooling duty (BESS
    # thermal management) but NO equipment placed yet in the manifest. Must NOT be
    # suppressed — a genuine requirement must still get its hub synthesised.
    bess_state = {"orchestratorContract": {"product_class": "bess",
                                           "quantities": {
                                               "system_thermal_dissipation_kw": {"value": 42.0},
                                           }}}
    sysm_bess = derive_air_system(empty_manifest, bess_state, {}, "/tmp")
    chk("bess_cooling_duty_not_suppressed", sysm_bess.not_applicable is False)
    chk("bess_hub_synthesised", len(sysm_bess.hubs) == 1)

    # (c) proveNoFalsePositive — a design with a real airflow quantity (data-hall CRAC)
    # must also NOT be suppressed.
    dc_state = {"orchestratorContract": {"quantities": {
        "hvac_airflow_cms": {"value": 3.2},
    }}}
    sysm_dc = derive_air_system(empty_manifest, dc_state, {}, "/tmp")
    chk("data_hall_airflow_not_suppressed", sysm_dc.not_applicable is False)

    # (d) proveNoFalsePositive — a design with NO quantity signal but a REAL placed
    # zone (a server rack physically in the manifest) must also NOT be suppressed —
    # the served equipment itself is the requirement.
    rack_manifest = {"parts": [{"name": "Server Rack 1", "module": "compute",
                                "equipment_tag": "RK-1", "pos_mm": [1000, 1000, 0],
                                "dims_mm": {"w": 600, "d": 1000, "h": 2000}}],
                     "bbox_mm": empty_manifest["bbox_mm"]}
    sysm_rack = derive_air_system(rack_manifest, {}, {}, "/tmp")
    chk("placed_zone_not_suppressed", sysm_rack.not_applicable is False)

    # (e) the generate_hvac() wrapper writes NO files when not_applicable (checked at
    # the source level: the function must short-circuit before touching draw_dir).
    import inspect
    src = inspect.getsource(generate_hvac)
    chk("generate_hvac_short_circuits_before_svg_write",
        src.index("sysm.not_applicable") < src.index("svg_path.write_text"))

    if fails:
        print("[hvac] SELFTEST FAIL: " + ", ".join(fails))
        return 1
    print("[hvac] selftest OK (no-orphan-subsystem scope gate: fires on a water-only "
          "design with zero HVAC signal; a real cooling-duty/airflow-quantity/placed-"
          "zone design is never suppressed)")
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] in ("--selftest", "selftest"):
        return _selftest()
    out_dir = argv[0]
    state_path = argv[1] if len(argv) > 1 else None
    try:
        summary, _sys, _svg = generate_hvac(out_dir, state_path)
    except FileNotFoundError as ex:
        print(f"[hvac] ERROR: {ex}")
        return 2
    print(f"[hvac] archetype  : {summary['archetype']}  ({summary['medium']})")
    print(f"[hvac] hubs        : {summary['hubs']}  zones: {summary['zones']}"
          f"{'  (derived)' if summary['zones_derived'] else ''}")
    print(f"[hvac] ducts/pipes : {summary['ducts']}  diffusers: {summary['diffusers']}")
    if summary["medium"] != "liquid":
        print(f"[hvac] airflow     : {summary['airflow_cms']} m³/s "
              f"({summary['airflow_cfm']:,} cfm)")
    print(f"[hvac] cooling     : {summary['cooling_kw']} kW")
    print(f"[hvac] schedule    : {'used' if summary['schedule_present'] else 'none'}")
    print(f"[hvac] SVG → {summary['svg']}")
    if summary["png"]:
        print(f"[hvac] PNG → {summary['png']}")
    else:
        print("[hvac] PNG not written (no rasteriser available — SVG is the master)")
    a1 = summary.get("a1")
    if a1 and a1.get("pdf_ok"):
        print(f"[hvac] A1  → {a1['pdfs'][0]}  ({a1['sheets']} sheet(s), "
              f"min text {a1['min_text_mm']} mm on A1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
