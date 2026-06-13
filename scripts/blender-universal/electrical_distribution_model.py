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
        # MV→LV ratio the board's outgoing LV distribution would use, and a
        # transformer kVA sized to the connected load (+25% headroom).
        plan.transformer_ratio = f"{v:g}/{lv_voltage_v:g} V"
        plan.transformer_kva = round(kw / POWER_FACTOR * 1.25, 0)
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
