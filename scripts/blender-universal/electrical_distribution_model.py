#!/usr/bin/env python3
"""electrical_distribution_model.py — UNIVERSAL distribution-voltage + feeder model.

WHY THIS EXISTS
    The single-line diagram (draw_single_line.py) and the panel/load schedule
    (draw_panel_schedule.py) are both PROJECTIONS of the same converged electrical
    model. They consume connection-schedule.json + state.json. Two real
    engineering defects appeared in the rendered projections:

      (a) DISTRIBUTION VOLTAGE wasn't chosen from the load. The sizer
          (connection_sizing.size_electrical) sized a single conductor at the
          edge's 400/415 V LV system voltage regardless of magnitude, so a 6 MW
          e-fuel plant showed a 10,434 A run on a 10×673 mm copper bar at 400 V.
          Distributing several MW at LV is not real engineering — past ~1.5 MW a
          plant distributes at MEDIUM VOLTAGE (3.3 / 6.6 / 11 kV), or at least at
          690 V LV when the LV current would otherwise be excessive.

      (b) ONE LUMPED FEEDER. The topology carries a single aggregate electrical
          edge (electrical_supply → "process compressors and pumps"), so both the
          SLD and the schedule showed the WHOLE plant as one feeder / one circuit.
          A real single-line + schedule has a FEEDER PER MODULE / major load
          group.

    Fixing this once in the model (here) lets BOTH projections read the SAME
    derived board voltage + per-module feeders, so they stay consistent and the
    fix is archetype-agnostic.

WHAT IT IS
    PURE LOGIC, stdlib only (no Blender, no draw import — both draw_*.py import
    THIS). Two public entry points:

      select_distribution_voltage(connected_load_kw, lv_design_current_a=None,
                                  lv_voltage_v=400.0) -> VoltagePlan
          Deterministic voltage-level auto-selection from the TOTAL connected
          load (universal: keyed on magnitude, never on product class). Re-bases
          the main-board / busbar continuous current onto the chosen voltage so a
          6 MW plant reads as a sane ~315 A MV board, not 10 kA at 400 V.

      synthesise_module_feeders(total_current_a, voltage_v, modules,
                               total_load_kw=None, ...) -> list[Feeder]
          Split an AGGREGATE electrical load across the MODULES present (the
          module decomposition / major load groups), one feeder each with its own
          design current + standard cable/busbar size at the board voltage. Used
          when the schedule only carries the single lumped electrical edge — the
          projection then shows one feeder per module instead of one lumped feeder.

    Both are deterministic + first-principles (3-phase P = √3·V·I; BS 7671 size
    ladders mirrored from connection_sizing). British spelling throughout. No
    fabricated physics — only standard voltage/size selection + the load split.
"""
from __future__ import annotations

import math
import re
import sys
from dataclasses import dataclass, field
from typing import Optional

# Standard 3-phase distribution voltages [V]. LV first, then the UK primary
# distribution MV ladder. The model picks the lowest voltage at which the plant's
# continuous current is sensible to distribute at (see select_distribution_voltage).
LV_VOLTAGE_V = 400.0          # standard UK 3-phase LV board (400/415 V)
LV_690_VOLTAGE_V = 690.0      # heavy-LV board (large motors / drives) before MV
MV_3300_V = 3_300.0           # MV up to ~5 MW
MV_6600_V = 6_600.0           # MV up to ~15 MW
MV_11000_V = 11_000.0         # MV above ~15 MW (UK 11 kV primary)

POWER_FACTOR = 0.95           # assumed displacement pf for kW↔A (stated)

# --- Load thresholds that drive the voltage choice (stated, not hidden) --------
# At/under this connected load a 400 V LV board is normal practice.
LV_MAX_CONNECTED_KW = 250.0
# Between LV_MAX and MV_MIN we stay LV (400 V) UNLESS the LV current would exceed
# the practical LV board/busbar ceiling, in which case we step to 690 V.
MV_MIN_CONNECTED_KW = 1_500.0
# Practical LV main-board continuous-current ceiling [A] — past this an LV board /
# busbar is impractical (a real plant goes to 690 V or MV instead of ~2500 A+ LV).
PRACTICAL_LV_BOARD_CURRENT_A = 2_500.0

# MV band edges by connected load [kW]: choose the LOWEST standard MV that keeps
# the plant within a sane MV-feeder current for that level.
MV_3300_MAX_KW = 5_000.0      # 3.3 kV up to ~5 MW
MV_6600_MAX_KW = 15_000.0     # 6.6 kV up to ~15 MW; above ⇒ 11 kV

# Cable conductor CSA ladder [mm²] — BS 7671 / IEC 60228 preferred sizes
# (mirrors connection_sizing.CABLE_CSA_LADDER; kept local so this module is
# import-free of the heavier sizing engine).
CABLE_CSA_LADDER = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150,
                    185, 240, 300, 400]
# Rough single-core copper ampacity [A] per CSA (BS 7671 Method C ballpark) — used
# only to pick a PLAUSIBLE feeder cable size for the drawing (the heavy sizing is
# the engine's job; this is the projection's display size). Conservative.
_CSA_AMPACITY_A = {
    1.5: 20, 2.5: 27, 4: 37, 6: 47, 10: 64, 16: 85, 25: 112, 35: 138, 50: 168,
    70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461, 300: 530, 400: 643,
}
# Above this single-conductor current we annotate parallels / a busbar.
_BUSBAR_CU_A_PER_MM2 = 1.55   # natural-convection flat bar (IEC 61439 ballpark)


@dataclass
class VoltagePlan:
    """The chosen distribution voltage + the board current re-based onto it.

    `board_voltage_v` is the voltage the MAIN board/busbar runs at. When MV was
    selected, `is_mv` is True and an incomer step-down transformer (utility MV →
    `board_voltage_v`, or `board_voltage_v` → an LV sub-board) is implied — the
    drawing shows the board at the MV level with a sane current."""
    board_voltage_v: float
    board_current_a: float          # main board / busbar continuous current AT board_voltage_v
    is_mv: bool
    connected_load_kw: Optional[float]
    lv_voltage_v: float             # the LV reference the load was originally sized at
    lv_current_a: Optional[float]   # what the current WAS at LV (for the transformer secondary)
    rationale: str                  # human one-liner: why this voltage
    transformer_ratio: str = ""     # e.g. '11000/400 V' when MV (incomer step-down)
    transformer_kva: Optional[float] = None

    @property
    def board_voltage_label(self) -> str:
        v = self.board_voltage_v
        if v >= 1000:
            return f"{v/1000:g} kV"
        return f"{v:g} V"


@dataclass
class Feeder:
    """One synthesised outgoing feeder / circuit for a module / major load group."""
    name: str                       # the load group (module display name)
    load_kw: Optional[float]
    current_a: float
    size_label: str                 # cable CSA or busbar bar label at board_voltage
    voltage_v: float
    is_busbar: bool = False
    note: str = ""


# ── incomer / transformer kVA — the ONE sizing rule (parity with the engine mint) ─────────
# incomer/transformer kVA = next STANDARD rating ≥ connected load kW × 1.25. kVA ≥ kW for
# ANY power factor, so load × 1.25 is the assumption-free adequacy requirement — the SAME
# rule scripts/lib/design-loop/settle-loop.ts (resizeFromConvergedDemand) mints into the
# contract and deterministic_checks_lib's adequacy invariant verifies. The SLD must carry
# the SAME value as the contract (one mint, one rule) — the old `kw / pf × 1.25` rounded
# raw (no ladder) diverged from the contract's laddered rating.
INCOMER_KVA_MARGIN = 1.25
STD_KVA_LADDER = [
    25, 50, 75, 100, 160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
]


def next_standard_kva(s_req_kva: float) -> float:
    """Smallest standard kVA rating ≥ s_req (inclusive: exactly-on-a-step returns the
    step); above the ladder, round UP to the next 100 kVA — never under-size."""
    for r in STD_KVA_LADDER:
        if r >= s_req_kva - 1e-9:
            return float(r)
    return float(math.ceil(s_req_kva / 100.0) * 100)


def incomer_kva_for_load(kw: float) -> float:
    """The plant incomer / step-down transformer nameplate for a connected load [kW]:
    next standard rating ≥ kw × 1.25 (assumption-free — kVA ≥ kW at any pf)."""
    return next_standard_kva(kw * INCOMER_KVA_MARGIN)


def _3ph_current_a(kw: float, voltage_v: float, pf: float = POWER_FACTOR) -> float:
    """3-phase line current [A] for a real power [kW] at a line voltage [V]."""
    denom = math.sqrt(3.0) * max(1e-6, voltage_v) * pf
    return (kw * 1000.0) / denom


def _3ph_power_kw(current_a: float, voltage_v: float, pf: float = POWER_FACTOR) -> float:
    """3-phase real power [kW] for a line current [A] at a line voltage [V]."""
    return math.sqrt(3.0) * voltage_v * current_a * pf / 1000.0


def _round_up_csa(required_csa_mm2: float) -> Optional[float]:
    for c in CABLE_CSA_LADDER:
        if c >= required_csa_mm2 - 1e-9:
            return c
    return None


def _cable_or_busbar_label(current_a: float) -> tuple[str, bool]:
    """Pick a plausible DISPLAY conductor for a feeder current.

    Returns (label, is_busbar). A single standard cable if the current fits one
    conductor's ampacity; else parallel cables up to the top CSA; else a copper
    busbar sized by current density. This is the PROJECTION's display size — the
    engine's connection_sizing does the binding volt-drop sizing for the routed
    runs; here we only need a sensible figure per synthesised feeder."""
    if current_a <= 0:
        return "—", False
    # single conductor?
    for csa in CABLE_CSA_LADDER:
        if _CSA_AMPACITY_A.get(csa, 0) >= current_a:
            return f"{csa:g} mm²", False
    # parallel runs of the top CSA?
    top = CABLE_CSA_LADDER[-1]
    top_amp = _CSA_AMPACITY_A[top]
    n = math.ceil(current_a / top_amp)
    if n <= 6:
        return f"{n}×{top:g} mm²", False
    # busbar
    csa = current_a / _BUSBAR_CU_A_PER_MM2
    thickness = 10.0
    width = csa / thickness
    return f"{thickness:g}×{width:.0f} mm Cu bar ({csa:.0f} mm²)", True


# ═══════════════════════════════════════════════════════════════════════════
# 1. VOLTAGE-LEVEL AUTO-SELECTION  (universal — keyed on load magnitude)
# ═══════════════════════════════════════════════════════════════════════════

def select_distribution_voltage(connected_load_kw: Optional[float],
                                lv_design_current_a: Optional[float] = None,
                                lv_voltage_v: float = LV_VOLTAGE_V,
                                ) -> Optional[VoltagePlan]:
    """Choose the distribution voltage from the TOTAL connected load, deterministically.

    Rule (universal, magnitude-keyed — NEVER product-class):
      - ≤ 250 kW                         → 400 V LV.
      - 250 kW … 1.5 MW                  → 400 V LV, OR 690 V LV if the LV
                                           continuous current would exceed the
                                           practical LV board ceiling (~2500 A).
      - > 1.5 MW                         → MEDIUM VOLTAGE:
                                             ≤ 5 MW   → 3.3 kV
                                             ≤ 15 MW  → 6.6 kV
                                             > 15 MW  → 11 kV.
      The main-board / busbar continuous current is RE-BASED onto the chosen
      voltage (P = √3·V·I·pf), so a 6 MW plant reads as a sane ~315 A 11 kV board
      instead of 10 kA at 400 V.

    Args:
      connected_load_kw: the plant connected electrical load [kW]. When None we
        derive it from lv_design_current_a at lv_voltage_v (so the selector still
        works when only the lumped feeder current is known).
      lv_design_current_a: the design current the engine sized at lv_voltage_v
        (the lumped electrical edge's rating) — used to derive the load if no kW.
      lv_voltage_v: the LV system voltage the engine sized at (400/415 V).

    Returns a VoltagePlan, or None when there is no electrical load to plan
    (both inputs absent / non-positive) — the caller then leaves the board as-is.
    """
    kw = connected_load_kw
    if (kw is None or kw <= 0) and lv_design_current_a and lv_design_current_a > 0:
        kw = _3ph_power_kw(lv_design_current_a, lv_voltage_v)
    if kw is None or kw <= 0:
        return None

    lv_current = lv_design_current_a
    if lv_current is None or lv_current <= 0:
        lv_current = _3ph_current_a(kw, lv_voltage_v)

    # --- decide the board voltage ---------------------------------------------
    if kw <= LV_MAX_CONNECTED_KW:
        v = lv_voltage_v
        is_mv = False
        why = f"{kw:,.0f} kW ≤ {LV_MAX_CONNECTED_KW:,.0f} kW → standard 400 V LV board"
    elif kw <= MV_MIN_CONNECTED_KW:
        # mid band: stay LV unless the LV current is impractical → 690 V.
        if lv_current > PRACTICAL_LV_BOARD_CURRENT_A:
            v = LV_690_VOLTAGE_V
            is_mv = False
            why = (f"{kw:,.0f} kW LV current {lv_current:,.0f} A > "
                   f"{PRACTICAL_LV_BOARD_CURRENT_A:,.0f} A LV ceiling → 690 V LV board")
        else:
            v = lv_voltage_v
            is_mv = False
            why = (f"{kw:,.0f} kW (≤ {MV_MIN_CONNECTED_KW:,.0f} kW) with "
                   f"{lv_current:,.0f} A → 400 V LV board")
    else:
        # MV band: lowest standard MV that suits the level.
        if kw <= MV_3300_MAX_KW:
            v = MV_3300_V
        elif kw <= MV_6600_MAX_KW:
            v = MV_6600_V
        else:
            v = MV_11000_V
        is_mv = True
        why = (f"{kw:,.1f} kW > {MV_MIN_CONNECTED_KW:,.0f} kW → distribute at "
               f"medium voltage {v/1000:g} kV (LV would be "
               f"{lv_current:,.0f} A at {lv_voltage_v:g} V — not real engineering)")

    board_current = _3ph_current_a(kw, v)

    plan = VoltagePlan(
        board_voltage_v=v,
        board_current_a=round(board_current, 1),
        is_mv=is_mv,
        connected_load_kw=round(kw, 1),
        lv_voltage_v=lv_voltage_v,
        lv_current_a=round(lv_current, 1) if lv_current else None,
        rationale=why,
    )
    if is_mv:
        # incomer step-down: utility MV → the MV board is fed from the DNO at the
        # SAME MV (a primary substation), so the SLD shows the board at MV with a
        # downstream LV sub-board for the small loads. We record the standard
        # MV→LV ratio the board's outgoing LV distribution would use, and the
        # transformer kVA from the ONE sizing rule (next standard rating ≥ load ×
        # 1.25 — identical to the contract mint, so SLD and contract agree).
        plan.transformer_ratio = f"{v:g}/{lv_voltage_v:g} V"
        plan.transformer_kva = incomer_kva_for_load(kw)
    return plan


# ═══════════════════════════════════════════════════════════════════════════
# 2. PER-MODULE FEEDER SYNTHESIS  (universal — split the aggregate over modules)
# ═══════════════════════════════════════════════════════════════════════════

# Modules that are NOT distributed electrical load groups (structure / safety /
# instrumentation are powered, but they are not the major motor/process feeders a
# single-line shows as discrete ways). We still allow them through as small
# feeders if no better group exists, but they're de-prioritised for the split.
_NON_LOAD_MODULE_RE = re.compile(
    r"structure|containment|skid|enclosure|frame|safety|protection|"
    r"instrument|sensing|signage|label", re.I)


def _module_label(m: dict) -> str:
    """A human label for a module dict (display_name → module id → fallback)."""
    for k in ("display_name", "name_human", "module_name", "title", "name"):
        v = m.get(k)
        if v:
            return str(v)
    mid = m.get("module") or m.get("id") or ""
    return str(mid).replace("_", " ").strip().title() or "Process load"


def module_load_groups(modules: list[dict]) -> list[str]:
    """The ordered list of major LOAD-GROUP names to synthesise feeders for, from
    the module decomposition. Prefers genuine process/energy modules; keeps the
    order stable (deterministic). Non-load modules (structure/safety/instrument)
    are dropped when there are enough real load modules, else kept so a board
    always has ≥1 outgoing way."""
    if not modules:
        return []
    load_mods, other_mods = [], []
    seen = set()
    for m in modules:
        lbl = _module_label(m)
        key = lbl.lower()
        if key in seen:
            continue
        seen.add(key)
        if _NON_LOAD_MODULE_RE.search(f"{m.get('module','')} {lbl}"):
            other_mods.append(lbl)
        else:
            load_mods.append(lbl)
    if load_mods:
        return load_mods
    return other_mods or [_module_label(m) for m in modules[:1]]


def synthesise_module_feeders(total_current_a: float,
                             voltage_v: float,
                             modules: list[dict],
                             total_load_kw: Optional[float] = None,
                             per_module_load_kw: Optional[dict] = None,
                             ) -> list[Feeder]:
    """Split an AGGREGATE electrical load into one feeder PER MODULE / load group.

    Deterministic. When `per_module_load_kw` gives a known kW for a group name we
    use it; otherwise the aggregate is split EVENLY across the load-group modules
    (an explicit, disclosed assumption — better than one lumped feeder, and the Σ
    of feeders reconciles back to the board). Each feeder is sized (display size)
    at `voltage_v`, so an MV board's feeders read as low MV currents and an LV
    board's as the familiar LV currents.

    Args:
      total_current_a: the board continuous current at `voltage_v` (from the
        VoltagePlan — already re-based onto the board voltage).
      voltage_v: the board voltage the feeders run at.
      modules: the module-decomposition module dicts (for the group names).
      total_load_kw: the connected load [kW] (for the per-feeder kW split). If
        None, derived from total_current_a at voltage_v.
      per_module_load_kw: optional {group_name_lower: kW} of KNOWN per-group loads.

    Returns a list[Feeder]; empty only when there are no groups AND no current.
    """
    groups = module_load_groups(modules)
    if not groups:
        # No module info at all — fall back to a single representative feeder so the
        # board is never left blank (still better than nothing; clearly one way).
        if total_current_a and total_current_a > 0:
            lbl, isb = _cable_or_busbar_label(total_current_a)
            return [Feeder(name="Process loads", load_kw=total_load_kw,
                           current_a=round(total_current_a, 1), size_label=lbl,
                           voltage_v=voltage_v, is_busbar=isb,
                           note="aggregate process load (no module breakdown available)")]
        return []

    if total_load_kw is None or total_load_kw <= 0:
        total_load_kw = _3ph_power_kw(total_current_a, voltage_v)

    pml = {k.lower(): v for k, v in (per_module_load_kw or {}).items()}

    # Assign each group a kW: known value where available, else an even share of
    # the remaining (unallocated) load across the groups that have no known value.
    known = {g: pml[g.lower()] for g in groups if g.lower() in pml}
    known_sum = sum(known.values())
    remaining = max(0.0, (total_load_kw or 0.0) - known_sum)
    unknown_groups = [g for g in groups if g not in known]
    share = (remaining / len(unknown_groups)) if unknown_groups else 0.0

    feeders: list[Feeder] = []
    for g in groups:
        kw = known.get(g, share)
        i_a = _3ph_current_a(kw, voltage_v) if kw > 0 else 0.0
        lbl, isb = _cable_or_busbar_label(i_a)
        note = "" if g in known else "even split of aggregate load across modules"
        feeders.append(Feeder(
            name=g, load_kw=round(kw, 1) if kw else None,
            current_a=round(i_a, 1), size_label=lbl, voltage_v=voltage_v,
            is_busbar=isb, note=note))
    return feeders


# ═══════════════════════════════════════════════════════════════════════════
# 3. PER-EQUIPMENT FEEDER SYNTHESIS  (universal — one way per electrically-driven item)
# ═══════════════════════════════════════════════════════════════════════════
# The per-MODULE split (above) gives a board with ~7 module-name ways — better than one
# lumped feeder but still not what a real single-line shows: a WAY PER DRIVEN ITEM (each
# pump, each blower/compressor, the O2 system, the heat-pump set, the control/instrument
# panel). This reads the qty-EXPANDED parts-manifest (the GA's source of truth) so the SLD
# shows the actual electrical loads — the recurring "not enough electrical wiring" fix.
# Universal: keyed on equipment SHAPE + name, with per-item kW from the contract quantities
# where the engine published them (pump/compressor/heat-pump motor powers).

# Shapes that are electrically DRIVEN (take a motor feeder).
_DRIVEN_SHAPES = {"pump", "compressor", "blower", "fan"}
# Cabinet/box shapes that are a CONTROL / DISTRIBUTION panel (a small dedicated way).
_PANEL_SHAPES = {"cabinet", "cabinet_small"}
# Names that mark a powered SYSTEM even when drawn as a box/skid (oxygen/ozone/UV/heat-pump
# packages carry significant motor/process load and deserve their own way).
_POWERED_SYSTEM_RE = re.compile(
    r"oxygen|\bo2\b|ozone|\buv\b|disinfect|heat.?pump|chiller|refriger|"
    r"blower|aeration|degas|protein.?skim|circulation|recirc", re.I)


# Quantity-key markers: a quantity is an ELECTRICAL motor/drive load (a real feeder) when
# it names motor/power/drive; it is a THERMAL DUTY / heat-rejection figure (NOT an
# electrical feeder) when it names duty/capacity/cooling/heating/thermal/load-kw — those
# must NOT be read as a motor feeder (a 'Cooling Fan' is a ~kW motor, not the 1617 kW
# cooling DUTY). Compressor electrical input IS a feeder ('compressor_power_kw').
_ELEC_KW_RE = re.compile(r"motor|power|drive|electrical|fan_kw|pump_kw|blower", re.I)
_THERMAL_KW_RE = re.compile(
    r"duty|capacity|cooling|heating|thermal|dissipation|rejection|"
    r"makeup_heating|process_loss|sensible|load_kw", re.I)


# Tokens that carry no identity — EVERY pump/motor shares them, so they must never decide a
# match on their own (the 120×-recurring load_reconcile blanket bug 2026-07-02: the generic
# token 'pump' substring-matched every *_pump_*_kw key and the 'motor' preference then handed
# irrigation_pump_motor_kw (9.65 kW) to EVERY pump in the plant — fertigation 7.5, RO 4.2 and
# drain 1.9 all rendered 9.65, panel 67.7 kW vs contract 53). The DISTINGUISHING noun decides.
_GENERIC_EQUIP_TOKENS = {"pump", "motor", "power", "drive", "kw", "unit", "system",
                         "electrical", "elec"}
_GENERIC_EQUIP_TOKENS_MIN = {"pump", "motor", "kw"}   # fallback for all-generic names


def _tok_hits(dist: set, ktoks: set) -> int:
    """Distinguishing-token overlap between a part name and a quantity key — exact token
    equality, plus a bounded PREFIX stem (≥4 chars) so 'recirculation' still finds 'recirc'
    while 'ran' can never ride inside 'drain' (substring containment is banned here: it is
    the root of the blanket-match bug)."""
    n = 0
    for t in dist:
        for k in ktoks:
            if t == k or (min(len(t), len(k)) >= 4 and (t.startswith(k) or k.startswith(t))):
                n += 1
                break
    return n


def _equip_kw_from_quantities(name: str, quantities: dict,
                              require_key_re: Optional[re.Pattern] = None) -> Optional[float]:
    """A known per-item ELECTRICAL motor/drive kW for this equipment from the contract
    quantities, matched on the item's DISTINGUISHING name tokens (universal — no per-class
    table). E.g. 'Fertigation Dosing Pump' matches `fertigation_dosing_pump_power_kw`, never
    the generic-sibling `irrigation_pump_motor_kw`. CRITICALLY excludes thermal DUTY /
    capacity quantities (a 'Cooling Fan' must not read the 1617 kW cooling DUTY as its motor
    feeder). `require_key_re` optionally restricts candidate keys (the panel's pump/motor
    scope). Deterministic: ties on (overlap, motor-preference) with DIFFERENT values return
    None (ambiguous → caller's honest even-split) instead of dict-order roulette.
    Returns the per-item electrical kW, or None when nothing matches by identity."""
    if not quantities:
        return None
    toks = {t for t in re.split(r"[^a-z0-9]+", (name or "").lower()) if len(t) >= 2}
    if not toks:
        return None
    dist = toks - _GENERIC_EQUIP_TOKENS
    if not dist:                                    # name was ONLY generic words
        dist = toks - _GENERIC_EQUIP_TOKENS_MIN
    if not dist:
        return None
    candidates: list[tuple[int, int, str, float]] = []
    for k, v in quantities.items():
        kl = k.lower()
        if not kl.endswith("_kw"):
            continue
        if require_key_re is not None and not require_key_re.search(kl):
            continue
        # a thermal DUTY / capacity figure is NOT an electrical feeder — skip it.
        if _THERMAL_KW_RE.search(kl) and not _ELEC_KW_RE.search(kl):
            continue
        # only accept a key that reads as an ELECTRICAL motor/drive/power load.
        if not _ELEC_KW_RE.search(kl):
            continue
        ktoks = set(re.split(r"[^a-z0-9]+", kl))
        overlap = _tok_hits(dist, ktoks)
        if overlap == 0:
            continue
        val = v.get("value") if isinstance(v, dict) else v
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        if val <= 0:
            continue
        motor_pref = 1 if ("motor" in ktoks or "drive" in ktoks) else 0
        candidates.append((overlap, motor_pref, kl, val))
    if not candidates:
        return None
    candidates.sort(key=lambda c: (-c[0], -c[1], c[2]))   # total order (key name last)
    top_overlap, top_pref = candidates[0][0], candidates[0][1]
    top_vals = {c[3] for c in candidates if c[0] == top_overlap and c[1] == top_pref}
    if len(top_vals) > 1:
        return None                                  # genuine ambiguity — never guess
    return candidates[0][3]


def synthesise_equipment_feeders(total_current_a: float,
                                 voltage_v: float,
                                 parts: list[dict],
                                 total_load_kw: Optional[float] = None,
                                 quantities: Optional[dict] = None,
                                 ) -> list[Feeder]:
    """One outgoing feeder PER electrically-driven equipment item (or grouped array), from
    the qty-expanded parts-manifest — the real single-line a process plant has.

    Driven items (pumps / compressors / blowers / fans) each take a motor feeder; powered
    packages (O2 / ozone / UV / heat-pump / degasser systems) take a system feeder; the
    control/instrument cabinets collapse to ONE control-panel way. Identical repeated items
    (e.g. 3 circulation pumps) collapse to one way annotated '×N'. Per-item kW comes from
    the contract quantities where published, else an even split of the load not otherwise
    allocated. Σ feeders reconciles to the board. Universal; deterministic.

    Returns a list[Feeder]; empty when there are no driven/powered items (caller then falls
    back to the per-module split)."""
    quantities = quantities or {}
    # ---- collect the electrically-relevant items, collapsing identical repeats ----
    groups: dict[str, dict] = {}     # name → {n, shape, kw_each(optional)}
    control_n = 0
    for p in (parts or []):
        shape = (p.get("shape") or "").lower()
        name = (p.get("name") or "").strip()
        if not name:
            continue
        is_driven = shape in _DRIVEN_SHAPES
        is_panel = shape in _PANEL_SHAPES
        is_powered = bool(_POWERED_SYSTEM_RE.search(name))
        if is_panel and not is_driven:
            control_n += 1
            continue
        if not (is_driven or is_powered):
            continue
        g = groups.setdefault(name.lower(), {"name": name, "n": 0, "shape": shape})
        g["n"] += 1
    if not groups and control_n == 0:
        return []

    # ---- assign kW per group: known per-item value × N, else share the remainder ----
    if total_load_kw is None or total_load_kw <= 0:
        total_load_kw = _3ph_power_kw(total_current_a, voltage_v)
    known_kw: dict[str, float] = {}
    for key, g in groups.items():
        kw_each = _equip_kw_from_quantities(g["name"], quantities)
        if kw_each:
            known_kw[key] = kw_each * g["n"]
    known_sum = sum(known_kw.values())
    remaining = max(0.0, (total_load_kw or 0.0) - known_sum)
    unknown = [k for k in groups if k not in known_kw]
    # the control panel takes a modest fixed share too (counts as one unknown way)
    n_unknown_ways = len(unknown) + (1 if control_n else 0)
    share = (remaining / n_unknown_ways) if n_unknown_ways else 0.0

    feeders: list[Feeder] = []
    # stable order: driven motors first (by name), then powered systems, panel last
    for key in sorted(groups, key=lambda k: (groups[k]["shape"] not in _DRIVEN_SHAPES,
                                             groups[k]["name"].lower())):
        g = groups[key]
        kw = known_kw.get(key, share)
        i_a = _3ph_current_a(kw, voltage_v) if kw > 0 else 0.0
        lbl, isb = _cable_or_busbar_label(i_a)
        nm = g["name"] + (f" ×{g['n']}" if g["n"] > 1 else "")
        note = "" if key in known_kw else "even split of unallocated load"
        feeders.append(Feeder(name=nm, load_kw=round(kw, 1) if kw else None,
                              current_a=round(i_a, 1), size_label=lbl,
                              voltage_v=voltage_v, is_busbar=isb, note=note))
    if control_n:
        kw = share
        i_a = _3ph_current_a(kw, voltage_v) if kw > 0 else 0.0
        lbl, isb = _cable_or_busbar_label(i_a)
        feeders.append(Feeder(name=f"Control & instrument panel ×{control_n}",
                              load_kw=round(kw, 1) if kw else None,
                              current_a=round(i_a, 1), size_label=lbl,
                              voltage_v=voltage_v, is_busbar=isb,
                              note="control/instrument distribution"))
    return feeders


# ── canonical board naming — ONE MINT for the schedule + the single-line ──────────────────
def canonical_board_name(board_id: str, kind: str, *, is_mv: bool = False,
                         is_dc: bool = False, humanise=None) -> str:
    """THE canonical human name for a distribution board — ONE MINT shared by the panel/load
    schedule (draw_panel_schedule._board_name) and the single-line diagram's main-bus tagging,
    so the SAME board reads the SAME heading in both projections.

    The divergence this closes (2026-07-03): draw_single_line hardcoded a GENERIC main-bus tag
    ('MAIN SWITCHBOARD' → rewritten to 'MAIN LV BOARD') that never read the real board_id, so a
    board the schedule correctly named 'MAIN DISTRIBUTION BOARD (TP&N)' (from board_id
    'motor_control_center') rendered as the meaningless 'MAIN LV BOARD' in the SLD. Conversely,
    for a DC main board the SLD already used the clear universal name 'MAIN DC BUS' while the
    schedule echoed the RAW (often synthesised/arbitrary) node id verbatim — 'MAIN BOARD — DC
    busbar 1500 V'. Routing BOTH drawers through this one function fixes both directions.

    Ports draw_panel_schedule's pre-existing `_board_name` rule set byte-identical for the
    LV/no-qualifier case (no archetype regresses) and ADDS is_mv / is_dc qualifiers: a DC main
    board is ALWAYS 'MAIN DC BUS' (the universal name, not an echo of an arbitrary node id — a
    DC bus is a DC bus regardless of what the connection-schedule happened to call the node);
    an MV main board is 'MAIN MV SWITCHBOARD'. `humanise` is the CALLER's own tag→title-case
    function (kept local to each drawer — draw_single_line's variant handles rack-tap suffixes
    the schedule's doesn't) so this stays PURE LOGIC with no drawer-specific string convention
    baked in; defaults to identity when the caller doesn't supply one."""
    humanise = humanise or (lambda s: s)
    bid = (board_id or "").lower()
    if board_id and board_id.endswith("_subdist"):
        base = humanise(board_id[:-len("_subdist")])
        return f"SUB-DISTRIBUTION BOARD — {base}"
    if kind != "main":
        return humanise(board_id)
    if is_dc:
        return "MAIN DC BUS"
    if is_mv:
        return "MAIN MV SWITCHBOARD"
    if "switchgear" in bid or "switchboard" in bid:
        return "MAIN SWITCHBOARD (MSB)"
    if "control" in bid:
        return "MAIN DISTRIBUTION BOARD (TP&N)"
    if "board" in bid or "panel" in bid:
        return humanise(board_id)
    return f"MAIN BOARD — {humanise(board_id)}"


# ── selftest — regression guard for the load_reconcile blanket-match family ──────────────
def _selftest() -> int:
    """Proves the per-equipment kW matcher resolves each item to ITS OWN quantity (the
    120×-recurring load_reconcile root cause 2026-07-02). Run: python3 <me> --selftest"""
    q = {
        "fertigation_dosing_pump_power_kw": {"value": 7.5},
        "ro_high_pressure_pump_power_kw": {"value": 4.2},
        "drain_transfer_pump_power_kw": {"value": 1.923},
        "irrigation_pump_motor_kw": {"value": 9.653},
        "acid_dosing_pump_power_kw": {"value": 0.04},
        "chemical_dosing_pump_power_kw": {"value": 0.04},
        "connected_electrical_load_kw": {"value": 53},
        "hvac_chiller_capacity_kw": {"value": 1617},   # thermal — must never feed a motor
    }
    fails = 0

    def chk(name, cond):
        nonlocal fails
        if not cond:
            fails += 1
            print(f"  ✗ {name}")
        else:
            print(f"  ✓ {name}")

    f = _equip_kw_from_quantities
    chk("E1.fertigation_own_kw_not_blanket", f("Fertigation Dosing Pump", q) == 7.5)
    chk("E2.ro_own_kw", f("Ro High Pressure Pump", q) == 4.2)
    chk("E3.drain_own_kw", f("Drain Transfer Pump", q) == 1.923)
    chk("E4.irrigation_own_kw", f("Irrigation Pump", q) == 9.653)
    chk("E5.unmatched_returns_none", f("Hand Watering Pump", q) is None)
    chk("E6.no_substring_ride", f("Membrane Crane Hoist", q) is None)     # 'ran'∉'drain'
    chk("E7.stem_prefix_matches", f("Recirculation Pump",
        {"recirc_pump_motor_kw": {"value": 4.0}}) == 4.0)
    chk("E8.thermal_never_a_feeder", f("Chiller Skid",
        {"hvac_chiller_capacity_kw": {"value": 1617}}) is None)
    chk("E9.ambiguous_tie_returns_none", f("Dosing Pump", q) is None)     # acid vs chemical vs fertigation tie
    chk("E10.require_re_scopes_keys", f("Fertigation Dosing Pump", q,
        require_key_re=re.compile(r"pump|motor")) == 7.5)
    # determinism: identical result under reversed insertion order
    q_rev = dict(reversed(list(q.items())))
    chk("E11.insertion_order_invariant",
        all(f(n, q) == f(n, q_rev) for n in
            ("Fertigation Dosing Pump", "Ro High Pressure Pump", "Drain Transfer Pump",
             "Irrigation Pump", "Hand Watering Pump", "Dosing Pump")))
    # ── incomer/transformer kVA rule (v56c ADEQUACY FAIL proveCatch, 2026-07-03) ──
    # THE RULE: kVA = next STANDARD rating ≥ load × 1.25 (ladder incl. 75). proveCatch:
    # a 53 kW load must yield 75 kVA — never a raw 66.25 (which the un-laddered
    # `round(kw/pf×1.25)` family produced) and never a whole-class jump to 100.
    chk("K1.53kw_gives_75kva_not_66", incomer_kva_for_load(53) == 75.0)
    chk("K2.exact_edge_40kw_gives_50kva", incomer_kva_for_load(40) == 50.0)   # 40×1.25 = 50 exactly → 50 passes
    chk("K3.exact_edge_60kw_gives_75kva", incomer_kva_for_load(60) == 75.0)   # 60×1.25 = 75 exactly → 75
    chk("K4.never_below_load_x_1_25",
        all(incomer_kva_for_load(kw) >= kw * INCOMER_KVA_MARGIN - 1e-9
            for kw in (1, 19, 53, 61, 87.39, 100, 400, 999, 12000)))
    chk("K5.above_ladder_rounds_up_100", incomer_kva_for_load(8500) == 10700.0)  # 10,625 → next 100

    # ── canonical board naming (J101, 2026-07-03) — ONE MINT proves identical from BOTH
    # drawers' call paths, so a schedule heading and an SLD main-bus tag can never diverge. ──
    n = canonical_board_name
    chk("N1.control_node_is_mdb",
        n("motor_control_center", "main") == "MAIN DISTRIBUTION BOARD (TP&N)")
    chk("N2.switchgear_node_is_msb",
        n("switchgear", "main") == "MAIN SWITCHBOARD (MSB)")
    chk("N3.dc_always_main_dc_bus_regardless_of_node_text",
        n("dc_busbar_1500v", "main", is_dc=True) == "MAIN DC BUS")
    chk("N4.mv_is_main_mv_switchboard",
        n("switchgear", "main", is_mv=True) == "MAIN MV SWITCHBOARD")
    chk("N5.subdist_node_is_sub_distribution_board",
        n("hvac_subdist", "main", humanise=lambda s: s.replace("_", " ").title())
        == "SUB-DISTRIBUTION BOARD — Hvac")
    chk("N6.non_main_kind_falls_through_to_humanise",
        n("hvac_subdist", "sub", humanise=lambda s: s.upper())
        == "SUB-DISTRIBUTION BOARD — HVAC")
    # THE CATCH: the schedule's real (arbitrarily-cased/synthesised) board_id 'DC busbar
    # 1500 V' and a differently-formatted equivalent both resolve to the SAME DC name — proving
    # the divergence J101 flagged (schedule 'MAIN BOARD — DC busbar 1500 V' vs SLD 'MAIN DC
    # BUS') can no longer happen: the DC-universal override makes node-id text irrelevant.
    chk("N7.dc_universal_override_ignores_node_id_differences",
        n("DC busbar 1500 V", "main", is_dc=True) == n("dc_busbar_1500v", "main", is_dc=True)
        == "MAIN DC BUS")
    print(f"[edm-selftest] {'PASS' if fails == 0 else f'FAIL ({fails})'}")
    return 1 if fails else 0


if __name__ == "__main__" and "--selftest" in sys.argv:
    raise SystemExit(_selftest())
