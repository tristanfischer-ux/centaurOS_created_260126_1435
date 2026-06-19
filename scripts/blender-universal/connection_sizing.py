#!/usr/bin/env python3
"""
scripts/blender-universal/connection_sizing.py

STANDALONE connection-sizing engine for the universal Blender CAD generator.

PROBLEM IT SOLVES
    Today the universal scene builder draws EVERY pipe/cable/duct at a single
    hardcoded `PIPE_DIA_MM = 190`. That diameter is fabricated — a 1562 A DC
    busbar and a 13 L/min drip line render at the same fatness, which is wrong
    and visibly so. But the engineering packet's topology edges already carry
    REAL ratings (`constraint_kind` + `required_value` + `required_unit` +
    `required_margin_factor` + `material_context`), and the engine ships
    first-principles sizing tools. This module is the bridge:

        (edge rating + CAD-measured run length)
            -> real connection size (CSA / DN / duct)
            -> real volt-drop% (over THAT run length) or velocity / dP
            -> within-spec check
            -> an outer_dia_mm the generator renders the cylinder at.

    It is PURE LOGIC (no Blender import). It is wired in later by the scene
    builder; here it stands alone + is unit-tested headless.

SOURCE OF TRUTH = THE ENGINE'S OWN TOOLS (do NOT reinvent the physics)
    We shell out to the existing stdin-JSON -> stdout-JSON tools under
    `scripts/lib/orchestrator/tools/python/`, run by the repo `.venv` python:

      electrical (current_rating, A):
        - electrical_cable_sizing.py -> main_feeder_cable_csa_mm2,
            feeder_design_current_a, mv_per_a_m, cable_voltdrop_pct,
            selected_ampacity_a   (supports n_parallel; we sweep it).
            We use mv_per_a_m WITH the CAD length to recompute the REAL
            volt-drop over THIS run:
              Vd_V  = mv_per_a_m × I × L_m / 1000 / n_parallel
              Vd_%  = 100 × Vd_V / U_system
        - cable_ampacity.py -> csa_mm2 (single-core fallback / cross-check).
        - For a BUSBAR (current above the largest standard cable, e.g. 1562 A)
          we size a copper BAR by current density (not a round cable) and
          report its equivalent outer_dia_mm.

      fluid (flow_capacity, kg/s | L/h | L/min | m3/h | m3/s):
        - size pipe ID from flow + a target velocity (liquid ~1.5 m/s, gas
          higher) :  D = sqrt(4 · Q_m3s / (π · v)).
        - process_pump_sizing.py -> pipe_velocity_m_s, darcy_friction_factor,
          reynolds; we use the friction factor with the CAD length to get the
          real pressure drop over the run (Darcy–Weisbach).
        - kg/s -> m3/s via a density taken from material_context.

      thermal (thermal_rejection, kW):
        - LIQUID coolant:  Q = duty / (ρ · cp · ΔT)  (ΔT ~ 6 K) then size as a
          fluid pipe (same path as above).
        - AIR:  hvac_load_sizing.py -> required_airflow_cms; duct area
          A = airflow_cms / v_duct (v_duct ~ 6 m/s) -> rectangular duct.

      step-down (distribution tree):
        - the TRUNK carries Σ(branch loads) and is sized for the total; each
          branch is sized for its own share. Thick main -> thinner branches
          falls out of the arithmetic (trunk current = Σ branch currents).
        - a transformer/step-down HUB is sized via
          electrical_transformer_sizing.py (primary vs secondary current — the
          conductor size CHANGES across the hub).

    Results are ROUNDED to a STANDARD ladder (cable CSA 1.5…400 mm²; pipe
    DN15…DN300; duct standard widths).

PUBLIC API (all pure):
    size_connection(edge, length_m, carried_value=None) -> ConnectionSpec dict
    size_connection_to_spec(edge, length_m, carried_value=None) -> ConnectionSpec
        (PHASE D — sizes, then RESPONDS to an out-of-spec result: D1 auto-upsizes
        by climbing the size ladder until in-spec, or D2 emits a design
        recommendation when upsizing would be excessive. This is the entry point
        the CAD generator uses at every draw site.)
    size_distribution_tree(hub_edge, branch_edges, lengths) -> tree dict
    connection_schedule(specs) -> list[row] for the BoM feedback

PHASE D — the iterative design feedback loop (env-tunable):
    CONN_VOLTDROP_LIMIT_PCT   the volt-drop ceiling [%] (default the real 5%);
        set low to FORCE a real run out of spec and exercise the D1/D2 response.
    CONN_TEST_LONG_RUN_M      test lever — size electrical runs as if the load sat
        N m away (the "inject a long test run" what-if; render geometry unchanged).
    CONN_TEST_LV_VOLTAGE_V    test lever — size electrical runs at this LV system
        voltage (lets the LV-reach D2 path be shown on an MV-bus archetype).
    D1 records upsized / original_size_label / final_size_label / driver /
       upsize_iterations on the spec; D2 records design_recommendation. The schedule
       rolls these into upsized[] + design_feedback[] (+ [conn-UPSIZE]/[conn-DESIGN]).

HONEST ASSUMPTIONS (the caller may override via material_context / kwargs):
    - target liquid velocity 1.5 m/s; compressed gas 18 m/s; steam 30 m/s;
      coolant ΔT 6 K; duct air 6 m/s.
    - default system voltage when an edge carries only a current: inferred from
      required_unit context / DEFAULT_SYSTEM_VOLTAGE_V (1500 V DC bus, else 400 V).
    - busbar copper current density 1.55 A/mm² (natural-convection bar, IEC 61439
      ballpark); cable copper as per the tool's BS 7671 tables.
    - water density 1000 kg/m³, cp 4187 J/kg·K. A GAS line's density is the
      IDEAL-GAS value ρ=P·M/(R·T) using a pressure parsed from material_context
      (e.g. "25 bar"; a range "1.5 to 25 bar" takes the higher/operating value)
      and the species molar mass (CO2 44, H2 2, CH4 16, N2 28, air 29 g/mol),
      at a parsed or ~350 K temperature. With NO parseable pressure a gas falls
      back to ~25 kg/m³ (typical compressed process gas), NOT the atmospheric
      1.2 kg/m³ and NOT a liquid density. The detected phase + density +
      pressure + velocity are recorded in each spec's `assumptions`/`notes` and
      as structured `phase`/`density_kg_m3`/`pressure_bar`/`target_velocity_ms`
      fields. This fixes the e-fuel CO2/H2 feed mis-sizing where a ~25 bar gas
      was sized as a 780 kg/m³ liquid (wrong, far-too-large pipe).

British spelling throughout. No fabricated physics — the numbers come from the
engine tools; this module only marshals inputs, applies geometry, and rounds.
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
from typing import Any, Optional

# ---------------------------------------------------------------------------
# 0. Tool runner — locate the repo .venv python + the orchestrator tools dir
#    relative to THIS file, and run a tool (stdin JSON -> stdout JSON).
# ---------------------------------------------------------------------------
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
# scripts/blender-universal/ -> repo root is two levels up.
_REPO_ROOT = os.path.abspath(os.path.join(_THIS_DIR, os.pardir, os.pardir))
_TOOLS_DIR = os.path.join(
    _REPO_ROOT, "scripts", "lib", "orchestrator", "tools", "python"
)


def _venv_python() -> str:
    """Absolute path to the repo .venv python (falls back to sys.executable)."""
    cand = os.path.join(_REPO_ROOT, ".venv", "bin", "python")
    if os.path.exists(cand):
        return cand
    return sys.executable


# A module-level hook so the TEST can stub tool calls without spawning a venv.
# Signature: (tool_filename: str, payload: dict) -> dict.  When None, the real
# subprocess runner is used.
TOOL_RUNNER: Optional[Any] = None


def run_tool(tool_filename: str, payload: dict, timeout_s: float = 30.0) -> dict:
    """Run an orchestrator python tool: stdin JSON -> stdout JSON.

    Returns the parsed dict (which may itself carry an ``error`` key — the
    tools surface failures as ``{"error": ...}`` rather than crashing). On a
    subprocess/parse failure returns ``{"error": ...}`` so callers can fall
    back deterministically. If ``TOOL_RUNNER`` is set (test stub), delegates."""
    if TOOL_RUNNER is not None:
        return TOOL_RUNNER(tool_filename, payload)
    tool_path = os.path.join(_TOOLS_DIR, tool_filename)
    if not os.path.exists(tool_path):
        return {"error": f"tool not found: {tool_path}"}
    try:
        proc = subprocess.run(
            [_venv_python(), tool_path],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except Exception as exc:  # noqa: BLE001 — surface as structured error
        return {"error": f"subprocess: {type(exc).__name__}: {exc}"}
    out = (proc.stdout or "").strip()
    if not out:
        return {"error": f"empty stdout (rc={proc.returncode}): {proc.stderr.strip()[:200]}"}
    try:
        return json.loads(out)
    except json.JSONDecodeError as exc:
        return {"error": f"tool stdout not JSON: {exc}: {out[:200]}"}


# ---------------------------------------------------------------------------
# 1. Standard ladders + physical constants (stated, not hidden)
# ---------------------------------------------------------------------------

# Cable conductor CSA ladder [mm²] — BS 7671 / IEC 60228 preferred sizes.
CABLE_CSA_LADDER = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150,
                    185, 240, 300, 400]

# Pipe nominal-bore ladder DN [mm] with a representative internal bore [mm].
# (DN is a label; the bore is roughly the real schedule-40/-10 ID used to test
#  the achieved velocity once a standard size is chosen.)
PIPE_DN_LADDER = [
    ("DN15", 15.8), ("DN20", 21.0), ("DN25", 26.6), ("DN32", 35.1),
    ("DN40", 40.9), ("DN50", 52.5), ("DN65", 62.7), ("DN80", 77.9),
    ("DN100", 102.3), ("DN125", 128.2), ("DN150", 154.1), ("DN200", 202.7),
    ("DN250", 254.5), ("DN300", 304.8),
]
# DN outer diameter [mm] (the steel pipe OD for the CAD cylinder — slightly
# larger than the bore; ~ schedule pipe OD).
PIPE_DN_OD = {
    "DN15": 21.3, "DN20": 26.7, "DN25": 33.4, "DN32": 42.2, "DN40": 48.3,
    "DN50": 60.3, "DN65": 73.0, "DN80": 88.9, "DN100": 114.3, "DN125": 139.7,
    "DN150": 168.3, "DN200": 219.1, "DN250": 273.0, "DN300": 323.9,
}

# Rectangular-duct standard widths [mm] (a coarse ladder is enough for CAD).
DUCT_SIZE_LADDER = [150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500]

G = 9.80665
RHO_WATER = 1000.0          # kg/m³
CP_WATER = 4187.0           # J/kg·K
RHO_AIR = 1.2               # kg/m³
RHO_CU = 8960.0             # kg/m³ (busbar mass)
R_GAS = 8.314462           # J/mol·K (universal gas constant)

# Species molar masses [kg/mol] for ideal-gas density of a process gas line.
# Used by _gas_density_ideal: ρ = P·M / (R·T).
GAS_MOLAR_MASS_KG_MOL = {
    "h2": 0.002016, "hydrogen": 0.002016,
    "co2": 0.04401, "carbon dioxide": 0.04401,
    "co": 0.02801,   # carbon monoxide (NOT CO2 — matched after co2)
    "ch4": 0.01604, "methane": 0.01604, "natural gas": 0.01604,
    "n2": 0.02801, "nitrogen": 0.02801,
    "o2": 0.032, "oxygen": 0.032,
    "air": 0.02896,
    "h2o": 0.01802, "steam": 0.01802, "water vapour": 0.01802,
    "nh3": 0.01703, "ammonia": 0.01703,
    "syngas": 0.0145,   # ~ H2/CO mix, light → ~14.5 g/mol typical
    "tail gas": 0.025, "off gas": 0.025, "flue": 0.030, "flue gas": 0.030,
}
# When a known gas is present but no pressure can be parsed, fall back to a
# TYPICAL compressed-process-gas density (NOT the 780 kg/m³ liquid, NOT the
# 1.2 kg/m³ atmospheric value). ~25 bar process gas ≈ 20–45 kg/m³.
DEFAULT_COMPRESSED_GAS_DENSITY = 25.0   # kg/m³ (typical 10–30 bar process gas)
# Default temperature for ideal-gas density when none is parseable [K].
DEFAULT_GAS_TEMP_K = 350.0

# Default target velocities / temperature deltas (overridable).
DEFAULT_LIQUID_VELOCITY_MS = 1.5    # process liquid line 1–2.5 m/s
DEFAULT_GAS_VELOCITY_MS = 18.0      # compressed gas/vapour line 15–20 m/s
DEFAULT_STEAM_VELOCITY_MS = 30.0    # steam line 25–40 m/s
DEFAULT_COOLANT_DT_K = 6.0          # chilled-water loop supply→return ΔT
DEFAULT_DUCT_VELOCITY_MS = 6.0      # supply-air duct 4–8 m/s

# Busbar copper current density [A/mm²] — natural-convection flat bar, IEC 61439
# ballpark (~1.3–1.6 A/mm² for an un-forced bar). Stated in assumptions.
BUSBAR_CU_A_PER_MM2 = 1.55

# When an edge carries only a current and no system voltage, infer one.
DEFAULT_SYSTEM_VOLTAGE_V = 400.0    # 3-phase LV default
DEFAULT_DC_BUS_VOLTAGE_V = 1500.0   # a "bus" current usually rides a DC bus

# Volt-drop spec ceiling (BS 7671 §525 advisory). The REAL design limit is 5%.
# Overridable at runtime via the env knob CONN_VOLTDROP_LIMIT_PCT — this is the
# Phase-D3 test lever: set it low (e.g. 1%) to FORCE a real short-run BESS/e-fuel
# bus out of spec and demonstrate the D1 auto-upsize / D2 design-feedback loop,
# WITHOUT fabricating a fake long run. At the normal 5% the real archetypes stay
# in-spec (no spurious trips).
DEFAULT_VOLTDROP_LIMIT_PCT = 5.0
# Liquid line velocity ceiling (erosion / water-hammer) — within-spec test.
LIQUID_VELOCITY_LIMIT_MS = 3.0
GAS_VELOCITY_LIMIT_MS = 30.0       # gas erosion limit (API RP 14E ballpark)
STEAM_VELOCITY_LIMIT_MS = 45.0     # steam line erosion ceiling


# ===========================================================================
# 1b. COST MODEL — supply+install unit-cost ladders for the distribution BoM.
#
#   PROVENANCE / HONESTY (read this before trusting a £):
#   The engine has NO per-metre cable / pipe / duct cost source anywhere
#   (verified 2026-06-11: scripts/lib/, src/lib/pdf-engine-v2/, the
#   class-reference-graphs and the distributor cascade all price COMPONENTS by
#   part number, never a conductor/pipe/duct by the metre — the dossier BoM has
#   historically OMITTED cabling/piping/ductwork entirely). So these ladders are
#   a DOCUMENTED MODEL, not engine data. Every costed row is stamped
#   cost_source="model:uk-2026-supply+install" so the dossier can disclose it.
#
#   BASIS (UK, 2026, ex-VAT, SUPPLY + INSTALL — material + labour to pull/lay,
#   terminate-excluded-here-and-charged-separately-per-termination, tray/trench/
#   support included as a per-metre allowance). Figures are order-of-magnitude
#   trade rates triangulated from SPON's Mechanical & Electrical Price Book
#   ranges, ECA/BEAMA installed-cable guidance, and typical M&E subcontractor
#   schedules-of-rates. They are deliberately ROUND. Treat as ±30%.
#
#   - CABLE  £/m by conductor CSA, PER CONDUCTOR (single core, Cu, LV/MV power,
#     installed on tray or in trench). A run's cable cost =
#       £/m(CSA) × length_m × n_parallel × n_cores_for_the_run.
#     n_cores defaults to 1 (the sizer reports a per-conductor CSA; a 3-phase +
#     N + earth run would set conductors_per_run=5 — we keep 1 unless the spec
#     says otherwise, and DOCUMENT that this is a per-conductor rate so a caller
#     can scale it). A copper BUSBAR is priced by its copper MASS (below), not
#     this ladder.
#   - PIPE   £/m by DN (carbon-steel process pipe installed with fittings +
#     supports + a basic paint/lag allowance). Stainless / exotic alloys cost
#     more — a `pipe_material_factor` (parsed from material_context) lifts it
#     (316L ≈ 1.9×, Hastelloy/Inconel ≈ 3.5×, copper/cu ≈ 1.4×, plastic/PVC ≈
#     0.6×). Steam/gas lines use the same DN ladder (the pipe is the pipe).
#   - DUCT   £/m by the standard side dimension (galvanised rectangular sheet-
#     metal duct, installed with hangers + a flexible-connection allowance).
#   - TERMINATION  a per-END cost (glands, lugs, crimps, terminations, flanges,
#     duct connectors). Two ends per run by default. Electrical terminations
#     scale up with CSA (a 400 mm² lug + gland is far dearer than a 2.5 mm² one);
#     pipe terminations scale with DN (a DN200 flange-pair vs a DN15 union).
#
#   These are STATED so the dossier shows exactly where each £ came from. None of
#   it is fabricated engine output — it is a transparent quoting model.
# ===========================================================================

# £/m PER CONDUCTOR by CSA [mm²] — Cu power cable, UK-2026 supply+install.
CABLE_COST_GBP_PER_M_BY_CSA = {
    1.5: 3.0, 2.5: 4.0, 4: 5.5, 6: 6.5, 10: 8.5, 16: 11.0, 25: 15.0,
    35: 19.0, 50: 24.0, 70: 31.0, 95: 39.0, 120: 47.0, 150: 57.0,
    185: 68.0, 240: 84.0, 300: 100.0, 400: 130.0,
}
# £/m by DN label — carbon-steel process pipe, UK-2026 supply+install
# (material + fittings + supports + basic finish). Lifted by pipe_material_factor.
PIPE_COST_GBP_PER_M_BY_DN = {
    "DN15": 18.0, "DN20": 22.0, "DN25": 28.0, "DN32": 34.0, "DN40": 40.0,
    "DN50": 48.0, "DN65": 60.0, "DN80": 74.0, "DN100": 95.0, "DN125": 130.0,
    "DN150": 165.0, "DN200": 210.0, "DN250": 275.0, "DN300": 340.0,
}
# £/m by standard duct SIDE [mm] — galvanised rectangular duct, UK-2026
# supply+install (sheet metal + hangers + flexible-connection allowance).
DUCT_COST_GBP_PER_M_BY_SIDE = {
    150: 12.0, 200: 16.0, 250: 20.0, 300: 25.0, 400: 33.0, 500: 42.0,
    600: 52.0, 800: 64.0, 1000: 75.0, 1200: 88.0, 1500: 105.0,
}
# Per-TERMINATION (per END) £ — electrical, by conductor CSA [mm²] (lug + gland +
# crimp + labour). Two ends per run by default.
TERMINATION_GBP_ELEC_BY_CSA = {
    1.5: 6.0, 2.5: 6.0, 4: 7.0, 6: 8.0, 10: 10.0, 16: 14.0, 25: 18.0,
    35: 24.0, 50: 30.0, 70: 40.0, 95: 52.0, 120: 66.0, 150: 82.0,
    185: 100.0, 240: 130.0, 300: 160.0, 400: 210.0,
}
# Per-TERMINATION (per END) £ — fluid/duct, by DN label (flange pair amortised
# to one end, gasket, bolts, labour) — a DN200 flanged end ≫ a DN15 union.
TERMINATION_GBP_FLUID_BY_DN = {
    "DN15": 14.0, "DN20": 16.0, "DN25": 20.0, "DN32": 26.0, "DN40": 32.0,
    "DN50": 42.0, "DN65": 55.0, "DN80": 70.0, "DN100": 95.0, "DN125": 130.0,
    "DN150": 170.0, "DN200": 240.0, "DN250": 320.0, "DN300": 420.0,
}
# Duct termination (connector / flexible joint) per end — coarse, by side band.
TERMINATION_GBP_DUCT = 35.0
# Default ends per run (a cable/pipe is terminated at BOTH ends).
DEFAULT_ENDS_PER_RUN = 2
# Copper busbar £/kg installed (bar + supports + insulators + labour); a busbar
# is priced by its copper MASS, not the per-metre cable ladder. UK-2026 ~£18/kg
# fabricated + installed (copper ~£8-9/kg raw, ~2× for fabrication + supports).
BUSBAR_GBP_PER_KG = 18.0
# Distribution / sub-distribution transformer £/kVA installed (oil-filled pad-mount +
# connection + commissioning) — UK-2026 supply+install. Used both by the step-down
# tree row and by a standalone D2-actuation sub-distribution spec.
TRANSFORMER_GBP_PER_KVA = 28.0
# Fallback signal/control bundle + member rates (thin, fixed) — UK-2026 supply+install.
SIGNAL_BUNDLE_GBP_PER_M = 6.0       # data/control/fibre bundle on tray
SIGNAL_TERMINATION_GBP = 12.0       # connectorised end (RJ45/fibre/terminal)
MEMBER_GBP_PER_M = 28.0             # generic structural steel tie per metre
MEMBER_TERMINATION_GBP = 25.0       # bolted/welded end connection
# Unidentified-size fallback per-metre cost (un-rated edge rendered at a stub size).
FALLBACK_GBP_PER_M = 12.0

# The single label every model-derived cost row carries so the dossier discloses
# that these £ came from a documented quoting MODEL, not engine/distributor data.
COST_SOURCE_MODEL = "model:uk-2026-supply+install"

# Material multipliers for pipe cost, parsed from material_context (carbon = 1.0).
# NB the stainless row matches a STANDALONE "ss" token (\bss\b, not the substring "ss " —
# that fired inside "proce**ss** water" and mis-tagged plain water lines as stainless).
PIPE_MATERIAL_FACTORS = (
    # (substring tuple, factor, label)
    (("hastelloy", "inconel", "incoloy", "monel", "titanium", "duplex",
      "super duplex", "c-276", "c276"), 3.5, "exotic alloy"),
    (("316", "304", "stainless", r"\bss\b", "cres", "1.4404", "1.4301"), 1.9,
     "stainless steel"),
    (("copper", "cu ", "cupronickel", "cuni"), 1.4, "copper"),
    (("pvc", "upvc", "cpvc", "hdpe", "mdpe", "pe100", "pp ", "polyprop", "polyeth",
      "plastic", "grp", "frp", "abs "), 0.6, "plastic/composite"),
)

# ── CORROSIVE-SERVICE → CORROSION-RESISTANT MATERIAL (universal, keyed on the FLUID) ──
# A pipe carrying a CORROSIVE fluid (seawater / saline / brackish / brine / effluent /
# wastewater / sewage / leachate) corrodes carbon steel to failure in 2-5 years and PITS
# 316 stainless (chloride stress-corrosion). The correct default for such water service is
# a corrosion-resistant non-metal — HDPE / PE100 (or PVC-U / GRP) — which is cheaper AND
# chloride-proof. This is decided from the route's FLUID/service tag, NOT the product class,
# so it is a no-op for any plant with no corrosive line. (Mirrors requirements_bom.py's
# `_STAINLESS_SERVICE_RE` reservation so the line-list material + the BoM column agree.)
# Treat _ / - / whitespace as token separators (service tags are often snake_case).
_SEP = r"[\s_\-]"
_CORROSIVE_SERVICE_RE = re.compile(
    rf"sea{_SEP}?water|saline|brackish|brine|chlorinat|"
    rf"effluent|waste{_SEP}?water|black{_SEP}?water|grey{_SEP}?water|sewage|"
    rf"leachate|reject{_SEP}?(?:water|brine)|(?:^|{_SEP})ro{_SEP}?reject", re.I)
# A WATER service of ANY kind (process / recirculation / cooling / make-up / treated) — a
# water main is HDPE / PVC-U / ductile iron in practice, NEVER bare carbon steel. Defaulting
# water to HDPE/PE100 makes the line-list material agree with requirements_bom.py (whose
# water-main default is also HDPE/PVC-U). Excludes a closed steam/condensate loop (those tags
# say "steam"/"condensate" + hit neither the water nor the oxidiser pattern).
_WATER_SERVICE_RE = re.compile(
    rf"(?:^|{_SEP})water(?:$|{_SEP})|water{_SEP}?(?:loop|main|line|supply|return|"
    rf"recirc|tie|service|source)|recirculat|process{_SEP}?water|"
    rf"make{_SEP}?up|cooling{_SEP}?water|chilled{_SEP}?water|degass?ed|oxygenat|nitrif|"
    rf"reoxygenat|drain{_SEP}?tank|"
    # aqueous process streams / wetted vessels — unambiguously water-bearing in any plant
    rf"biofilt|biofilm|(?:^|{_SEP})mbbr(?:$|{_SEP})|moving{_SEP}?bed|clarifier|settler|"
    rf"(?:^|{_SEP})sump|solids{_SEP}?(?:remov|rich|laden|draw)|sludge|tan{_SEP}?oxidation",
    re.I)
# The genuine 316L-reserve services — strongly OXIDISING / cryogenic-oxygen / ozone delivery
# — where a corrosion-resistant PLASTIC is NOT acceptable and stainless is correct. Kept
# narrow (oxygen / LOX / ozone / peroxide / oxidiser). _ counts as a boundary so a snake_case
# 'LOX_plus_PSA' / 'kg_O2_per' tag still matches.
_OXIDISER_SERVICE_RE = re.compile(
    rf"(?:^|{_SEP})lox(?:$|{_SEP})|liquid{_SEP}?oxygen|"
    rf"oxygen{_SEP}?(?:supply|delivery|line|gas|service|generat)|psa|"
    rf"(?:^|{_SEP})o2(?:$|{_SEP})|(?:^|{_SEP})gox(?:$|{_SEP})|ozone|(?:^|{_SEP})o3(?:$|{_SEP})|"
    rf"peroxide|oxidis|oxidiz|hypochlorite|chlorine{_SEP}?gas", re.I)

# Plant-level salinity [ppt], set once by the caller (build_universal_scene reads salinity_ppt
# from the contract before sizing connections). None / < ~10 ppt ⇒ fresh-water plant ⇒ the
# oxidiser default stays plain 316L (so a non-marine plant — SAF / CO₂ — is unchanged). ≥ 10 ppt
# ⇒ marine ⇒ the oxidiser/stainless lines upgrade to duplex 2205 (316L pits in warm oxygenated
# chloride). Universal, keyed on the salinity, never a product class.
_PLANT_SALINITY_PPT: Optional[float] = None
# A COMBUSTION oxidiser (thermal oxidiser / RTO / incinerator) is NOT an oxygen/oxidant SERVICE —
# its lines carry hot flue/air on carbon steel, not stainless. Used to veto the bare 'oxidis'
# match so a thermal_oxidiser unit name never forces 316L (the SAF false-positive that blocked
# this fix for weeks).
_COMBUSTION_OXIDISER_RE = re.compile(
    rf"thermal{_SEP}?oxidi[sz]|\brto\b|incinerat|enclosed{_SEP}?flare|regenerative{_SEP}?therm",
    re.I)


def corrosive_service_material(material_context: Optional[str]) -> Optional[tuple]:
    """If `material_context` describes a fluid service that warrants a NON-carbon-steel
    default pipe material, return (factor, label); else None.

    Universal + fluid-keyed (NOT class-keyed), in priority order:
      • an OXIDISER / LOX / ozone / oxygen-supply service → 316L stainless (factor 1.9) —
        a corrosion-resistant PLASTIC is unsafe in an oxidising/cryogenic-O₂ duty;
      • a corrosive WATER service (seawater / saline / brine / effluent / wastewater) OR a
        generic WATER main (process / recirculation / cooling / make-up) → HDPE / PE100
        (factor 0.6) — chloride-proof AND the correct material for water service (a water
        main is HDPE/PVC-U/ductile iron, never bare carbon steel that rusts through).
    Returns None for a non-water, non-oxidiser service (air / inert / oil / process gas),
    so the caller keeps the normal carbon-steel default — a strict no-op there."""
    if not material_context:
        return None
    s = material_context.lower()
    # Oxidiser / LOX / ozone takes precedence: stainless is genuinely required there — UNLESS the
    # match is a COMBUSTION oxidiser unit (thermal oxidiser / RTO / incinerator), whose lines are
    # hot flue/air on carbon steel, not an oxygen service.
    if _OXIDISER_SERVICE_RE.search(s) and not _COMBUSTION_OXIDISER_RE.search(s):
        # MARINE plant (salinity ≥ ~10 ppt): plain 316L pits in a warm oxygenated chloride duty —
        # specify DUPLEX 2205 instead. Fresh-water / unset salinity keeps plain 316L (no-op).
        if _PLANT_SALINITY_PPT is not None and _PLANT_SALINITY_PPT >= 10:
            return (2.5, "duplex 2205 (oxidiser + marine service)")
        return (1.9, "316L stainless (oxidiser service)")
    if _CORROSIVE_SERVICE_RE.search(s):
        return (0.6, "HDPE/PE100 (corrosive service)")
    if _WATER_SERVICE_RE.search(s):
        return (0.6, "HDPE/PE100 (water service)")
    return None


def _voltdrop_limit_pct() -> float:
    """The active volt-drop ceiling [%]. Reads CONN_VOLTDROP_LIMIT_PCT each call
    (so a test can set it per-process) and falls back to the BS 7671 5% advisory.
    A non-numeric / non-positive value falls back to the default."""
    raw = os.environ.get("CONN_VOLTDROP_LIMIT_PCT")
    if raw is None:
        return DEFAULT_VOLTDROP_LIMIT_PCT
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_VOLTDROP_LIMIT_PCT
    return v if v > 0 else DEFAULT_VOLTDROP_LIMIT_PCT


# ---------------------------------------------------------------------------
# Phase-D practical-ladder thresholds (the "excessive size" triggers for D2).
# When the in-spec answer is past ANY of these, an absurd fat conductor is the
# WRONG response — the right one is a DESIGN RECOMMENDATION (local step-down /
# relocate the load). Stated, not hidden.
# ---------------------------------------------------------------------------
# A single LV cable run beyond this CSA is impractical to pull/terminate; past it
# we cap parallels rather than chase an ever-fatter single conductor.
PRACTICAL_MAX_CABLE_CSA_MM2 = 400.0
# Max parallel conductors per phase before the run is "a cable farm" — beyond this
# the honest answer is sub-distribution, not yet more parallels.
PRACTICAL_MAX_PARALLEL = 6
# Sane LV reach as an ampere-metre product (current × length). A 400 A load 300 m
# away (=120,000 A·m) on LV is a textbook case for an MV feeder + local step-down,
# regardless of how many parallels would technically hold the volt-drop.
PRACTICAL_LV_REACH_A_M = 90_000.0
# Below this system voltage we treat the bus as LV for the reach test (an 11 kV
# feeder is MV and is allowed to run far — the reach test is an LV-distribution
# heuristic, not an MV one).
LV_REACH_VOLTAGE_CEILING_V = 1000.0
# Liquid-pipe ΔP practical ceiling [kPa] over a single run before a fatter pipe is
# the wrong answer (pump the fluid / relocate / boost locally instead).
PRACTICAL_MAX_PIPE_DP_KPA = 500.0

# --- D2 ACTUATION (auto-insert a sub-distribution + re-route) thresholds -------
# When D2 fires on an LV fan-out that's infeasible over the distance, the ACTUATION
# (size_d2_actuation, gated behind CONN_D2_ACTUATE in the scene builder) re-designs
# the run as a step-down hierarchy: ONE feeder hub→sub-distribution sized for the
# TOTAL load, stepped UP to MV for the long haul (so the feeder is low-current and
# THIN), then SHORT LV branches from the sub-distribution to each local consumer.
# The medium voltage the long feeder steps up to (a standard UK primary distribution
# voltage). At this voltage the same kVA draws ~LV_V/MV_V less current, so the long
# feeder is in-spec where the LV run was not.
D2_ACTUATION_MV_FEEDER_V = 11_000.0
# The LOCAL distance [m] the sub-distribution sits from its consumer cluster — the
# branches are re-sized over THIS short length (in-spec at LV), NOT the long haul.
# The scene builder passes the REAL geometric tap length; this is the pure-logic
# fallback when no measured local length is supplied.
D2_ACTUATION_LOCAL_BRANCH_M = 8.0
# The local LV busway along the consumer cluster (the re-sized trunk-equivalent on
# the LV side of the step-down) is also a SHORT local run; this is its fallback
# length when the builder supplies none.
D2_ACTUATION_LOCAL_BUSWAY_M = 20.0


# ---------------------------------------------------------------------------
# 2. Small helpers
# ---------------------------------------------------------------------------

def _f(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return default
        return float(x)
    except (TypeError, ValueError):
        return default


def _density_from_context(material_context: Optional[str], default: float) -> float:
    """Pick a sensible fluid density [kg/m³] from a free-text material_context.

    Honest + coarse: water/aqueous ~1000; refrigerant vapour ~30; oil ~880; a
    named gas (CO2/H2/air/steam/N2/methane) ~ low. Returns ``default`` when the
    context gives no hint."""
    if not material_context:
        return default
    s = material_context.lower()
    # liquids
    if any(k in s for k in ("water", "aqueous", "glycol", "mea", "amine",
                            "brine", "coolant", "di water", "demin")):
        return 1000.0
    if "oil" in s:
        return 880.0
    # liquid hydrocarbons / synthetic fuels (e-fuel, SAF, diesel, kerosene,
    # naphtha, methanol) — the plant family this module lives in. ~750–820.
    if any(k in s for k in ("hydrocarbon", "fuel", "diesel", "kerosene",
                            "saf", "naphtha", "gasoline", "petrol", "jet",
                            "fischer", "syncrude", "condensate")):
        return 780.0
    if "methanol" in s or "ethanol" in s:
        return 790.0
    if any(k in s for k in ("slurry", "carbonate", "k2so4", "kco3", "sludge")):
        return 1200.0
    # refrigerants (vapour-phase density, order of magnitude)
    if any(k in s for k in ("r410a", "r290", "r134a", "r744", "refrigerant", "r1234")):
        return 30.0
    # gases / vapour
    if "steam" in s:
        return 0.6
    if "hydrogen" in s or " h2" in s or s.startswith("h2"):
        return 0.09
    if "methane" in s or "natural gas" in s or "ch4" in s:
        return 0.72
    if "co2" in s or "carbon dioxide" in s:
        return 1.84
    if "nitrogen" in s or "n2" in s:
        return 1.17
    if "air" in s or "gas" in s or "vapour" in s or "vapor" in s:
        return 1.2
    return default


# --- Phase detection (gas vs liquid vs steam) ----------------------------------
# Keyword sets are checked LIQUID-first so an explicitly liquid stream (e.g. a
# "liquid product gas-to-liquids" line, or "condensate") is never mis-flagged as
# a gas just because the word "gas" appears in a process name.
_LIQUID_KEYWORDS = (
    "syncrude", "wax", "saf ", "saf,", "saf.", "sustainable aviation",
    "naphtha", "condensate", "kerosene", "diesel", "gasoline", "petrol",
    "jet fuel", "jet-fuel", "liquid fuel", "fuel liquid", "liquid product",
    "syncrude", "fischer", "ft liquid", "ft product", "ft wax",
    "water", "aqueous", "demin", "di water", "glycol", "coolant",
    "chilled water", "cooling water", "oil", "lube", "brine", "slurry",
    "sludge", "mea", "amine", "solvent", "methanol", "ethanol", "alcohol",
    "rich amine", "lean amine", "carbonate", "k2so4", "kco3",
)
_GAS_KEYWORDS = (
    "gas", "vapour", "vapor", "compressed", "syngas", "tail gas", "tail-gas",
    "tailgas", "flue", "off gas", "off-gas", "offgas", "purge", "vent gas",
    "air", "refrigerant", "r410a", "r290", "r134a", "r744", "r1234",
    "hydrogen", "methane", "natural gas", "carbon dioxide", "carbon monoxide",
    "nitrogen", "oxygen", "ammonia", "recycle gas", "feed gas",
)
# Standalone-token gas species (matched on word boundaries so "h2" doesn't hit
# "h2o" and "co2" / "co" / "n2" / "o2" / "ch4" are caught cleanly).
_GAS_TOKEN_SPECIES = ("h2", "co2", "co", "ch4", "n2", "o2", "nox", "sox")


def _detect_phase(material_context: Optional[str],
                  required_unit: Optional[str],
                  from_part: Optional[str] = None,
                  to_part: Optional[str] = None) -> str:
    """Classify a fluid edge as ``"liquid"``, ``"gas"`` or ``"steam"``.

    Looks at material_context first, then the from/to part names, then falls
    back to a mass-flow heuristic. LIQUID keywords win over GAS keywords when
    both appear (a process NAME may contain 'gas' yet move a liquid, e.g.
    'gas-to-liquids product'); an explicit 'liquid'/'condensate' hint is decisive.
    STEAM is reported separately (special high-velocity gas)."""
    import re as _re
    blob = " ".join(
        x for x in (material_context, from_part, to_part) if x
    ).lower()
    if not blob.strip():
        # No textual hint at all: a bare kg/s mass flow is more often a gas
        # mass flow in this plant family; volumetric units default liquid.
        u = (required_unit or "").strip().lower()
        return "gas" if u in ("kg/s", "kgs", "kg s-1", "kg/h", "kgh") else "liquid"

    # STEAM is decisive (a special high-velocity gas). Only the explicit word
    # 'steam' triggers it — a 'reboiler' edge can be the LIQUID amine side, so
    # we never infer steam from 'reboiler' alone.
    if "steam" in blob:
        return "steam"

    has_liquid = any(k in blob for k in _LIQUID_KEYWORDS)
    # An explicit "liquid" word (not "...liquids" process name) is a strong hint.
    explicit_liquid = bool(_re.search(r"\bliquid\b", blob))

    has_gas_word = any(k in blob for k in _GAS_KEYWORDS)
    has_gas_token = any(
        _re.search(rf"(?<![a-z0-9]){_re.escape(tok)}(?![a-z0-9])", blob)
        for tok in _GAS_TOKEN_SPECIES
    )
    # "h2" as a standalone token, but NOT inside "h2o".
    if _re.search(r"(?<![a-z0-9])h2(?!o)(?![a-z0-9])", blob):
        has_gas_token = True
    has_gas = has_gas_word or has_gas_token

    # Decision: explicit-liquid beats everything; otherwise liquid keywords beat
    # gas keywords (process names embed 'gas'); else any gas hint -> gas.
    if explicit_liquid:
        return "liquid"
    if has_liquid and not has_gas:
        return "liquid"
    if has_liquid and has_gas:
        # Ambiguous: prefer the more specific signal. A standalone gas SPECIES
        # token (h2/co2/ch4…) or 'compressed'/'syngas'/'vapour' is decisive gas.
        if has_gas_token or any(k in blob for k in (
                "compressed", "syngas", "vapour", "vapor", "recycle gas",
                "feed gas", "tail gas", "off gas", "flue")):
            return "gas"
        return "liquid"
    if has_gas:
        return "gas"
    return "liquid"


def _parse_pressure_bar(text: Optional[str]) -> Optional[float]:
    """Parse a pressure in bar from free text. Handles ranges ('1.5 to 25 bar'
    -> 25, the higher / operating value), 'barg', 'bar(g)', and MPa/kPa.
    Returns ``None`` when no pressure is stated."""
    if not text:
        return None
    import re as _re
    s = text.lower()
    candidates: list[float] = []
    # MPa first (convert to bar): "X MPa"  (1 MPa = 10 bar)
    for m in _re.finditer(r"(\d+(?:\.\d+)?)\s*mpa", s):
        candidates.append(float(m.group(1)) * 10.0)
    # kPa (gauge/abs) -> bar
    for m in _re.finditer(r"(\d+(?:\.\d+)?)\s*kpa", s):
        candidates.append(float(m.group(1)) / 100.0)
    # bar / barg / bar(g) / bara — capture every number adjacent to a 'bar'.
    # First, ranges like "1.5 to 25 bar" or "1.5-25 bar" (take the HIGHER).
    for m in _re.finditer(
            r"(\d+(?:\.\d+)?)\s*(?:to|-|–|—)\s*(\d+(?:\.\d+)?)\s*bar", s):
        candidates.append(max(float(m.group(1)), float(m.group(2))))
    # Then single "N bar".
    for m in _re.finditer(r"(\d+(?:\.\d+)?)\s*bar", s):
        candidates.append(float(m.group(1)))
    if not candidates:
        return None
    # Use the highest stated pressure (the operating / design value drives the
    # densest case, hence the smallest pipe — the conservative gas size).
    p = max(candidates)
    return p if p > 0 else None


def _parse_temp_k(text: Optional[str]) -> Optional[float]:
    """Parse a temperature -> kelvin from free text ('120C', '120 °C', '350 K').
    Returns ``None`` when no temperature is stated."""
    if not text:
        return None
    import re as _re
    s = text.lower()
    # Kelvin explicit.
    m = _re.search(r"(\d+(?:\.\d+)?)\s*k\b", s)
    if m:
        v = float(m.group(1))
        if v > 0:
            return v
    # Celsius: "120C", "120 c", "120°c", "120 °c", "+50c", "-40 c".
    m = _re.search(r"([+-]?\d+(?:\.\d+)?)\s*°?\s*c\b", s)
    if m:
        return float(m.group(1)) + 273.15
    return None


def _gas_molar_mass(material_context: Optional[str]) -> tuple[float, str]:
    """Pick a molar mass [kg/mol] + a species label for a gas line from text.

    Matches the most specific species present (CO2 before CO, steam/H2O, etc.).
    Falls back to air (~29 g/mol) for an unidentified gas. Returns
    (molar_mass_kg_mol, species_label)."""
    if not material_context:
        return GAS_MOLAR_MASS_KG_MOL["air"], "air (assumed)"
    import re as _re
    s = material_context.lower()
    # Multi-word / phrase species first (most specific).
    for key in ("carbon dioxide", "carbon monoxide", "natural gas",
                "water vapour", "tail gas", "off gas", "flue gas", "syngas",
                "hydrogen", "methane", "nitrogen", "oxygen", "ammonia",
                "steam", "air"):
        if key in s:
            return GAS_MOLAR_MASS_KG_MOL[key], key
    # Token species on word boundaries (co2 before co; h2 not h2o).
    if _re.search(r"(?<![a-z0-9])co2(?![a-z0-9])", s):
        return GAS_MOLAR_MASS_KG_MOL["co2"], "CO2"
    if _re.search(r"(?<![a-z0-9])h2(?!o)(?![a-z0-9])", s):
        return GAS_MOLAR_MASS_KG_MOL["h2"], "H2"
    if _re.search(r"(?<![a-z0-9])ch4(?![a-z0-9])", s):
        return GAS_MOLAR_MASS_KG_MOL["ch4"], "CH4"
    if _re.search(r"(?<![a-z0-9])n2(?![a-z0-9])", s):
        return GAS_MOLAR_MASS_KG_MOL["n2"], "N2"
    if _re.search(r"(?<![a-z0-9])o2(?![a-z0-9])", s):
        return GAS_MOLAR_MASS_KG_MOL["o2"], "O2"
    if _re.search(r"(?<![a-z0-9])co(?![a-z0-9])", s):
        return GAS_MOLAR_MASS_KG_MOL["co"], "CO"
    return GAS_MOLAR_MASS_KG_MOL["air"], "air (assumed)"


def _gas_density_ideal(material_context: Optional[str]) -> tuple[float, dict]:
    """Ideal-gas density [kg/m³] for a process-gas line, ρ = P·M/(R·T).

    Parses a pressure (bar→Pa) and temperature (→K) from material_context; uses
    the species molar mass. When NO pressure is parseable, returns the typical
    compressed-process-gas fallback (~25 kg/m³) rather than an atmospheric value.
    Returns (density_kg_m3, provenance_dict) where provenance records the
    pressure / temperature / molar mass / species actually used so the spec's
    assumptions are fully auditable."""
    p_bar = _parse_pressure_bar(material_context)
    t_k = _parse_temp_k(material_context)
    molar, species = _gas_molar_mass(material_context)
    if p_bar is None:
        # No pressure: a compressed PROCESS gas is ~20–45 kg/m³ at 10–30 bar.
        return DEFAULT_COMPRESSED_GAS_DENSITY, {
            "method": "compressed-gas fallback (no pressure in context)",
            "pressure_bar": None,
            "temp_k": t_k if t_k is not None else DEFAULT_GAS_TEMP_K,
            "molar_mass_kg_mol": molar,
            "species": species,
        }
    t_use = t_k if t_k is not None else DEFAULT_GAS_TEMP_K
    p_pa = p_bar * 1.0e5
    rho = p_pa * molar / (R_GAS * t_use)
    return rho, {
        "method": "ideal gas ρ=P·M/(R·T)",
        "pressure_bar": p_bar,
        "temp_k": round(t_use, 1),
        "molar_mass_kg_mol": molar,
        "species": species,
    }


def flow_to_m3s(value: float, unit: Optional[str], density_kg_m3: float) -> float:
    """Convert a flow figure in the edge's stated unit to m³/s.

    Mass flow (kg/s) is divided by density. Volumetric units (L/h, L/min,
    m3/h, m3/s, L/s) convert directly."""
    u = (unit or "").strip().lower()
    if u in ("kg/s", "kgs", "kg s-1"):
        return value / max(1e-9, density_kg_m3)
    if u in ("kg/h", "kgh"):
        return (value / 3600.0) / max(1e-9, density_kg_m3)
    if u in ("l/s", "lps"):
        return value / 1000.0
    if u in ("l/min", "lpm", "l min-1"):
        return value / 1000.0 / 60.0
    if u in ("l/h", "lph", "l hr-1", "l/hr"):
        return value / 1000.0 / 3600.0
    if u in ("m3/s", "m3s", "m^3/s", "m³/s"):
        return value
    if u in ("m3/h", "m3h", "m^3/h", "m³/h"):
        return value / 3600.0
    # Unknown unit: assume already m³/s (best-effort; flagged by caller's notes).
    return value


def _round_up_cable_csa(required_mm2: float) -> Optional[float]:
    for c in CABLE_CSA_LADDER:
        if c >= required_mm2 - 1e-9:
            return c
    return None


def _round_up_pipe_dn(required_bore_mm: float) -> tuple[str, float]:
    """Smallest DN whose bore >= required; clamp to DN300 if larger."""
    for label, bore in PIPE_DN_LADDER:
        if bore >= required_bore_mm - 1e-9:
            return label, bore
    return PIPE_DN_LADDER[-1]


def _round_up_duct(required_side_mm: float) -> int:
    for s in DUCT_SIZE_LADDER:
        if s >= required_side_mm - 1e-9:
            return s
    return DUCT_SIZE_LADDER[-1]


def _spec(**kw) -> dict:
    """Build a ConnectionSpec with all the documented keys, defaulting absent
    ones so every spec has a uniform shape for the schedule + the CAD."""
    base = {
        "kind": None,
        "mechanism": None,
        "carried_rating": None,
        "carried_unit": None,
        "size_label": None,
        "outer_dia_mm": None,
        "drop_pct_or_velocity": None,
        "within_spec": True,
        "spec_limit": None,
        "material_qty_desc": None,
        "tool_used": None,
        "assumptions": [],
        "notes": None,
        # Fluid-phase provenance (None for non-fluid kinds) — see size_fluid.
        "phase": None,
        "density_kg_m3": None,
        "target_velocity_ms": None,
        "pressure_bar": None,
        # Electrical-conductor provenance (None for non-electrical kinds) — set by
        # size_electrical so the Phase-D ladder-climb can re-evaluate volt-drop at
        # a larger conductor WITHOUT another tool round-trip (Vd ∝ 1/CSA, ∝ 1/n).
        "csa_mm2": None,
        "n_parallel": None,
        "mv_per_a_m": None,
        "system_voltage_v": None,
        # UNIVERSAL distribution-voltage provenance (set by size_electrical via
        # _stamp_distribution): the load-appropriate board voltage + the current at
        # that voltage, so the SLD + panel schedule present a sane MV/LV board. None
        # for non-electrical kinds / sub-1.5 MW LV runs where LV is correct anyway.
        "distribution_voltage_v": None,
        "distribution_current_a": None,
        "distribution_is_mv": None,
        "distribution_connected_kw": None,
        "distribution_transformer_ratio": None,
        "dp_kpa": None,            # fluid pressure drop over the routed run [kPa]
        # Phase-D auto-upsize / design-feedback provenance (always present so the
        # schedule has a uniform shape; size_connection_to_spec fills them in).
        "upsized": False,
        "original_size_label": None,
        "final_size_label": None,
        "driver": None,
        "upsize_iterations": 0,
        "design_recommendation": None,
    }
    base.update(kw)
    return base


# ---------------------------------------------------------------------------
# 3. Electrical sizing (current_rating)
# ---------------------------------------------------------------------------

def _infer_system_voltage(edge: dict, mechanism: str) -> float:
    """Infer the system voltage to express volt-drop as a % of.

    Prefer an explicit edge hint; else use a DC-bus default for an
    'electrical_bus' (these are usually DC buses) or LV otherwise.

    PHASE-D3 TEST OVERRIDE (CONN_TEST_LV_VOLTAGE_V): forces the system voltage low
    for the sizing decision so the LV-reach D2 path can be demonstrated on a real
    archetype whose real bus is MV (the 1500 V BESS DC bus is correctly exempt from
    the LV-reach test; this knob asks 'what if this were a 48 V LV system at these
    currents?'). A what-if lever only — never changes the rendered geometry."""
    _lv = os.environ.get("CONN_TEST_LV_VOLTAGE_V")
    if _lv:
        try:
            v = float(_lv)
            if v > 0:
                return v
        except (TypeError, ValueError):
            pass
    for k in ("system_voltage_v", "nominal_voltage_v", "voltage_v"):
        if edge.get(k) is not None:
            return _f(edge[k])
    mc = (edge.get("material_context") or "").lower()
    # parse e.g. "1500 V dc bus" out of material_context if present
    import re
    m = re.search(r"(\d+(?:\.\d+)?)\s*v\b", mc)
    if m:
        return float(m.group(1))
    if "dc" in mc or mechanism == "electrical_bus":
        return DEFAULT_DC_BUS_VOLTAGE_V
    return DEFAULT_SYSTEM_VOLTAGE_V


# Distribution-voltage thresholds (stated, not hidden) — mirror
# electrical_distribution_model so connection_sizing is import-free of it (this
# module already runs under Blender's python via subprocess; keeping it dependency
# -light avoids a sys.path surprise there). Keyed PURELY on load magnitude.
_LV_REF_VOLTAGE_V = 415.0            # the LV the engine sizes a process edge at
_DIST_MV_MIN_KW = 1_500.0           # above this connected load → medium voltage
_DIST_LV_690_CURRENT_A = 2_500.0    # LV current beyond this → 690 V (mid band)
_DIST_MV_3300_MAX_KW = 5_000.0      # 3.3 kV up to ~5 MW
_DIST_MV_6600_MAX_KW = 15_000.0     # 6.6 kV up to ~15 MW; above → 11 kV
_DIST_PF = 0.95


def _distribution_voltage_for_edge(edge: dict, current_a: float,
                                   v_sys: float) -> Optional[dict]:
    """Pick the load-appropriate 3-phase distribution voltage for an electrical
    edge from its connected load, deterministically (universal — magnitude-keyed).

    The connected load [kW] is taken from the edge's design current at the LV
    reference voltage (P = √3·V·I·pf). Returns a provenance dict
    {voltage_v, current_a, is_mv, connected_kw, lv_voltage_v, lv_current_a,
     transformer_ratio, note} or None when there is no current to plan.

    This does NOT change the conductor the run is sized as — it records what voltage
    the load should distribute at so the SLD/panel projections read a sane board.
    """
    if not current_a or current_a <= 0:
        return None
    # The LV reference: an explicit LV figure in material_context (e.g.
    # '400_415V_three_phase'); else the edge's system voltage IF it's a real LV
    # value (≤1000 V — never a leaked 1500 V DC-bus default); else 415 V.
    lv_v = None
    mc = edge.get("material_context") or ""
    import re as _re
    mlv = _re.search(r"(\d{3,4})\s*[_\s]?V\b", mc) or _re.search(r"(\d{3,4})V", mc)
    if mlv and 100.0 <= float(mlv.group(1)) <= 1000.0:
        lv_v = float(mlv.group(1))
    elif 100.0 <= v_sys <= 1000.0:
        lv_v = v_sys
    else:
        lv_v = _LV_REF_VOLTAGE_V

    connected_kw = math.sqrt(3.0) * lv_v * current_a * _DIST_PF / 1000.0
    lv_current = current_a

    if connected_kw <= _DIST_MV_MIN_KW:
        # LV — step to 690 V only if the LV current would be impractical.
        if lv_current > _DIST_LV_690_CURRENT_A:
            v, is_mv = 690.0, False
        else:
            v, is_mv = lv_v, False
    else:
        if connected_kw <= _DIST_MV_3300_MAX_KW:
            v = 3_300.0
        elif connected_kw <= _DIST_MV_6600_MAX_KW:
            v = 6_600.0
        else:
            v = 11_000.0
        is_mv = True

    board_current = (connected_kw * 1000.0) / (math.sqrt(3.0) * v * _DIST_PF)
    vlabel = (f"{v/1000:g} kV" if v >= 1000 else f"{v:g} V")
    note = (f"connected load ≈{connected_kw:,.0f} kW → distribute at {vlabel} "
            f"({board_current:,.0f} A); LV would be {lv_current:,.0f} A at {lv_v:g} V"
            if is_mv else
            f"connected load ≈{connected_kw:,.0f} kW → {vlabel} LV board "
            f"({board_current:,.0f} A)")
    return {
        "voltage_v": v,
        "current_a": round(board_current, 1),
        "is_mv": is_mv,
        "connected_kw": round(connected_kw, 1),
        "lv_voltage_v": lv_v,
        "lv_current_a": round(lv_current, 1),
        "transformer_ratio": (f"{v:g}/{lv_v:g} V" if is_mv else ""),
        "note": note,
    }


def _stamp_distribution(spec: dict, plan: Optional[dict]) -> dict:
    """Stamp distribution-voltage provenance onto an electrical spec (no geometry
    change). Records distribution_voltage_v / distribution_current_a / etc. + a
    human assumption line so the SLD + panel schedule can present a sane board."""
    if not plan:
        return spec
    spec["distribution_voltage_v"] = plan["voltage_v"]
    spec["distribution_current_a"] = plan["current_a"]
    spec["distribution_is_mv"] = plan["is_mv"]
    spec["distribution_connected_kw"] = plan["connected_kw"]
    spec["distribution_transformer_ratio"] = plan["transformer_ratio"]
    spec.setdefault("assumptions", [])
    spec["assumptions"] = list(spec["assumptions"]) + [
        f"distribution voltage selected from load: {plan['note']}"]
    return spec


def _busbar_from_current(current_a: float) -> tuple[float, float, float]:
    """Size a copper busbar BAR from current density.

    Returns (csa_mm2, equivalent_outer_dia_mm, bar_thickness_mm). The bar is a
    flat rectangular section; equivalent_outer_dia is the diameter of a circle
    of the SAME cross-sectional area, so the CAD cylinder reads as 'fat as the
    copper is'."""
    csa_mm2 = current_a / BUSBAR_CU_A_PER_MM2
    # Equivalent round diameter for the same area (for the CAD cylinder).
    equiv_dia_mm = 2.0 * math.sqrt(csa_mm2 / math.pi)
    # A plausible bar geometry: 10 mm thick, width = csa/thickness.
    thickness_mm = 10.0
    return csa_mm2, equiv_dia_mm, thickness_mm


def _cable_outer_dia_mm(csa_mm2: float, n_parallel: int) -> float:
    """Approximate the OUTER diameter of an installed power cable from its
    conductor CSA (single core, including insulation + sheath), then widen for
    parallel runs so a multi-cable bundle reads fatter in the CAD.

    Conductor diameter d_c = 2·sqrt(CSA/π); overall cable OD ≈ 2.4× the
    conductor diameter (insulation + armour + sheath for LV/MV power cable).
    For n parallel cores the bundle equivalent diameter = single OD × sqrt(n)."""
    d_cond = 2.0 * math.sqrt(csa_mm2 / math.pi)
    od_single = 2.4 * d_cond
    return od_single * math.sqrt(max(1, n_parallel))


def size_electrical(edge: dict, length_m: float, current_a: float) -> dict:
    """Size an electrical connection for ``current_a`` over ``length_m``.

    Strategy:
      1. Ask electrical_cable_sizing.py to pick a standard CSA, sweeping
         n_parallel 1..8 until it succeeds. Use its mv_per_a_m WITH the CAD
         length for the REAL volt-drop over this run.
      2. If even 8 parallel 400 mm² cables can't carry it (a true busbar), size
         a copper bar by current density and report its equivalent dia.
    """
    mechanism = edge.get("mechanism", "electrical_bus")
    v_sys = _infer_system_voltage(edge, mechanism)
    vd_limit = _voltdrop_limit_pct()
    margin = _f(edge.get("required_margin_factor"), 1.0) or 1.0
    assumptions = [
        f"system voltage {v_sys:g} V (for volt-drop %)",
        f"design current {current_a:g} A already includes the edge margin "
        f"factor {margin:g}" if margin != 1.0 else f"design current {current_a:g} A",
    ]

    # UNIVERSAL distribution-voltage provenance (keyed on load magnitude). A large
    # connected load (>~1.5 MW) is NOT distributed at LV — a real plant goes to MV.
    # We record the load-appropriate distribution voltage + the current it WOULD be
    # at that voltage on the spec, so downstream projections (the single-line + the
    # panel schedule) present a sane MV board instead of e.g. 10 kA at 400 V. The
    # CONDUCTOR sizing/geometry below is unchanged (the routed run still sizes from
    # the edge current); this is the model recording the correct board voltage.
    dist_plan = _distribution_voltage_for_edge(edge, current_a, v_sys)

    best = None
    for n_par in range(1, 9):
        res = run_tool("electrical_cable_sizing.py", {
            "cable_name": f"{mechanism} feeder",
            "design_current_a": current_a,
            "length_m": max(0.1, length_m),
            "nominal_voltage_v": v_sys,
            "conductor": "copper",
            "n_parallel": n_par,
            "max_voltdrop_pct": vd_limit,
        })
        if "error" not in res:
            best = (n_par, res)
            break

    if best is not None:
        n_par, res = best
        csa = _f(res.get("main_feeder_cable_csa_mm2"))
        mv_per_a_m = _f(res.get("mv_per_a_m"))
        # REAL volt-drop over the CAD run length (the tool already did this, but
        # we recompute explicitly so the length-dependence is transparent and
        # testable, and so a length passed AFTER routing is honoured exactly).
        vd_v = mv_per_a_m * current_a * max(0.0, length_m) / 1000.0 / n_par
        vd_pct = 100.0 * vd_v / v_sys
        within = vd_pct <= vd_limit
        outer = _cable_outer_dia_mm(csa, n_par)
        if n_par == 1:
            size_label = f"{csa:g} mm²"
            qty = f"1 × {csa:g} mm² Cu, {length_m:.1f} m"
        else:
            size_label = f"{n_par}×{csa:g} mm²"
            qty = f"{n_par} × {csa:g} mm² Cu (parallel), {length_m:.1f} m each"
        assumptions.append(
            f"selected {n_par}×{csa:g} mm² Cu; tabulated ampacity "
            f"{_f(res.get('selected_ampacity_a')):g} A/run (BS 7671 Method C)"
        )
        spec = _spec(
            kind="cable",
            mechanism=mechanism,
            carried_rating=round(current_a, 1),
            carried_unit="A",
            size_label=size_label,
            outer_dia_mm=round(outer, 1),
            drop_pct_or_velocity=round(vd_pct, 3),
            within_spec=bool(within),
            spec_limit=f"≤{vd_limit:g}% volt-drop",
            material_qty_desc=qty,
            tool_used="electrical_cable_sizing.py",
            assumptions=assumptions,
            notes=("volt-drop over the routed length"
                   + ("" if within
                      else f" EXCEEDS {vd_limit:g}% limit — upsize / add runs")),
        )
        # Conductor provenance for the Phase-D ladder-climb (Vd ∝ 1/CSA, ∝ 1/n).
        spec["csa_mm2"] = csa
        spec["n_parallel"] = n_par
        spec["mv_per_a_m"] = mv_per_a_m
        spec["system_voltage_v"] = v_sys
        return _stamp_distribution(spec, dist_plan)

    # ---- Busbar branch: too much current for stranded cable -> copper bar ----
    csa_mm2, equiv_dia, thick = _busbar_from_current(current_a)
    width_mm = csa_mm2 / thick
    # Volt-drop of a copper bar over the run: R = rho_Cu_20 / CSA per metre.
    rho_cu = 0.0172  # Ω·mm²/m
    r_ohm = rho_cu * max(0.0, length_m) / max(1e-9, csa_mm2)
    vd_v = current_a * r_ohm
    vd_pct = 100.0 * vd_v / v_sys
    within = vd_pct <= vd_limit
    assumptions.append(
        f"current {current_a:g} A exceeds the largest stranded-cable group; sized "
        f"as a copper BUSBAR at {BUSBAR_CU_A_PER_MM2:g} A/mm² (IEC 61439 natural "
        f"convection) -> {csa_mm2:.0f} mm² bar ≈ {thick:g}×{width_mm:.0f} mm"
    )
    spec = _spec(
        kind="busbar",
        mechanism=mechanism,
        carried_rating=round(current_a, 1),
        carried_unit="A",
        size_label=f"{thick:g}×{width_mm:.0f} mm Cu bar ({csa_mm2:.0f} mm²)",
        outer_dia_mm=round(equiv_dia, 1),
        drop_pct_or_velocity=round(vd_pct, 3),
        within_spec=bool(within),
        spec_limit=f"≤{vd_limit:g}% volt-drop",
        material_qty_desc=f"copper busbar {thick:g}×{width_mm:.0f} mm, {length_m:.1f} m",
        tool_used="busbar current-density (cable tool over-range)",
        assumptions=assumptions,
        notes="busbar — round-cable tool returned over-range, bar sized by current density",
    )
    # Busbar volt-drop scales ∝ 1/CSA with section area (resistive); record the
    # equivalent mv/A·m so the Phase-D climb can fatten the bar deterministically.
    spec["csa_mm2"] = csa_mm2
    spec["n_parallel"] = 1
    # mv per A·m for the bar: 1000 · ρ_cu / CSA  (ρ_cu = 0.0172 Ω·mm²/m).
    spec["mv_per_a_m"] = 1000.0 * 0.0172 / max(1e-9, csa_mm2)
    spec["system_voltage_v"] = v_sys
    return _stamp_distribution(spec, dist_plan)


# ---------------------------------------------------------------------------
# 4. Fluid sizing (flow_capacity)
# ---------------------------------------------------------------------------

def size_fluid(edge: dict, length_m: float, flow_value: float,
               flow_unit: Optional[str],
               target_velocity_ms: Optional[float] = None,
               density_override: Optional[float] = None,
               mechanism_override: Optional[str] = None) -> dict:
    """Size a fluid pipe from a flow + target velocity, then use
    process_pump_sizing.py to get the achieved velocity + friction factor and
    compute the Darcy–Weisbach pressure drop over the CAD run length."""
    mechanism = mechanism_override or edge.get("mechanism", "fluid_loop")
    mc = edge.get("material_context")
    phase = _detect_phase(mc, flow_unit, edge.get("from_part"), edge.get("to_part"))
    is_gas = phase in ("gas", "steam")

    # --- Density selection per phase -------------------------------------------
    gas_prov: Optional[dict] = None
    if density_override is not None:
        density = density_override
    elif phase == "steam":
        # Steam: ideal-gas density at the parsed (or default) pressure/temp.
        density, gas_prov = _gas_density_ideal(mc)
    elif phase == "gas":
        # Compressed process gas: ideal-gas density from parsed pressure +
        # species molar mass (NOT the ~1.2 kg/m³ atmospheric value, NOT 780).
        density, gas_prov = _gas_density_ideal(mc)
    else:
        density = _density_from_context(mc, RHO_WATER)

    # --- Target velocity per phase ---------------------------------------------
    if target_velocity_ms is not None:
        v_target = target_velocity_ms
    elif phase == "steam":
        v_target = DEFAULT_STEAM_VELOCITY_MS
    elif phase == "gas":
        v_target = DEFAULT_GAS_VELOCITY_MS
    else:
        v_target = DEFAULT_LIQUID_VELOCITY_MS

    q_m3s = flow_to_m3s(flow_value, flow_unit, density)
    # D = sqrt(4 Q / (π v))
    ideal_dia_m = math.sqrt(4.0 * q_m3s / (math.pi * max(1e-9, v_target)))
    ideal_bore_mm = ideal_dia_m * 1000.0
    dn_label, dn_bore_mm = _round_up_pipe_dn(ideal_bore_mm)

    # Achieved velocity in the chosen standard bore.
    area_m2 = math.pi * (dn_bore_mm / 1000.0 / 2.0) ** 2
    v_actual = q_m3s / max(1e-12, area_m2)

    # Pressure drop over the CAD run via the engine's pump tool (friction factor
    # + velocity computed from first principles by process_pump_sizing.py).
    dp_kpa = None
    tool_used = "D=sqrt(4Q/πv) + DN ladder"
    pump = run_tool("process_pump_sizing.py", {
        "pump_name": f"{mechanism} line",
        "flow_m3_h": q_m3s * 3600.0,
        "fluid_density_kg_m3": density,
        "fluid_viscosity_pa_s": 0.001 if density >= 500 else 1.5e-5,
        "static_head_m": edge.get("static_head_m", 0.0),
        "pipe_length_m": max(0.1, length_m),
        "pipe_diameter_mm": dn_bore_mm,
        "roughness_mm": 0.015,
        "process_backpressure_kpa": 0.0,
    })
    if "error" not in pump:
        f_darcy = _f(pump.get("darcy_friction_factor"))
        v_tool = _f(pump.get("pipe_velocity_m_s"), v_actual)
        # Darcy–Weisbach head -> pressure: dP = f (L/D) (ρ v²/2)
        # dp_kpa is FRICTION ONLY — the marginal parasitic load of the routed
        # run length. Static head is a process requirement (already in the base
        # electrical demand via the contract's pump motor sizing), not a routing
        # parasitic, so it is NOT included here. The convergence loop sums
        # dp_kpa across lines to get the marginal friction cost.
        d_m = dn_bore_mm / 1000.0
        dp_pa = f_darcy * (max(0.1, length_m) / d_m) * (density * v_tool ** 2 / 2.0)
        dp_kpa = dp_pa / 1000.0
        v_actual = v_tool
        tool_used = "process_pump_sizing.py (velocity + Darcy friction)"

    if phase == "steam":
        v_limit = STEAM_VELOCITY_LIMIT_MS
    elif phase == "gas":
        v_limit = GAS_VELOCITY_LIMIT_MS
    else:
        v_limit = LIQUID_VELOCITY_LIMIT_MS
    within = v_actual <= v_limit
    outer = PIPE_DN_OD.get(dn_label, dn_bore_mm * 1.15)

    phase_label = {"steam": "steam", "gas": "gas/vapour", "liquid": "liquid"}[phase]
    # Density line — for a gas, surface the ideal-gas P·M/(R·T) derivation so the
    # number is auditable; for a liquid keep the from-context provenance.
    if gas_prov is not None and density_override is None:
        if gas_prov.get("pressure_bar") is not None:
            dens_line = (
                f"{phase_label} service; density {density:.2f} kg/m³ via "
                f"{gas_prov['method']} at {gas_prov['pressure_bar']:g} bar, "
                f"{gas_prov['temp_k']:g} K, {gas_prov['species']} "
                f"(M={gas_prov['molar_mass_kg_mol']*1000:g} g/mol)"
                + (f" [material_context: {mc}]" if mc else "")
            )
        else:
            dens_line = (
                f"{phase_label} service; density {density:.2f} kg/m³ — "
                f"{gas_prov['method']} for {gas_prov['species']} "
                f"(no pressure stated in context, used "
                f"{DEFAULT_COMPRESSED_GAS_DENSITY:g} kg/m³ typical compressed gas)"
                + (f" [material_context: {mc}]" if mc else "")
            )
    else:
        dens_line = (
            f"{phase_label} service; density {density:g} kg/m³"
            + (f" (from material_context: {mc})" if mc else " (default)")
        )
    assumptions = [
        dens_line,
        f"target velocity {v_target:g} m/s; D=sqrt(4Q/πv) -> {ideal_bore_mm:.0f} mm "
        f"ideal bore -> {dn_label} ({dn_bore_mm:g} mm bore)",
    ]
    if flow_unit and flow_unit.strip().lower() in ("kg/s", "kg/h"):
        assumptions.append(f"mass flow {flow_value:g} {flow_unit} ÷ density {density:.2f} "
                           f"kg/m³ -> {q_m3s * 1000:.3f} L/s volumetric")

    notes = (f"{phase_label} pipe ID from flow + target velocity "
             f"(detected phase: {phase}); dP over the routed length")
    if dp_kpa is not None:
        notes += f"; ΔP ≈ {dp_kpa:.1f} kPa"

    spec = _spec(
        kind="pipe",
        mechanism=mechanism,
        carried_rating=round(flow_value, 4),
        carried_unit=flow_unit or "m³/s",
        size_label=dn_label,
        outer_dia_mm=round(outer, 1),
        drop_pct_or_velocity=round(v_actual, 3),
        within_spec=bool(within),
        spec_limit=f"≤{v_limit:g} m/s velocity",
        material_qty_desc=f"{dn_label} pipe, {length_m:.1f} m"
                          + (f", ΔP≈{dp_kpa:.1f} kPa" if dp_kpa is not None else ""),
        tool_used=tool_used,
        assumptions=assumptions,
        notes=notes,
    )
    # Auditable structured fields (the schedule + CAD can read the raw numbers).
    spec["phase"] = phase
    spec["density_kg_m3"] = round(density, 3)
    spec["target_velocity_ms"] = v_target
    if dp_kpa is not None:
        spec["dp_kpa"] = round(dp_kpa, 2)
    if gas_prov is not None:
        spec["pressure_bar"] = gas_prov.get("pressure_bar")
    return spec


# ---------------------------------------------------------------------------
# 5. Thermal sizing (thermal_rejection)
# ---------------------------------------------------------------------------

def size_thermal(edge: dict, length_m: float, duty_kw: float) -> dict:
    """Size a thermal connection for a heat duty.

    Liquid coolant: convert duty -> coolant flow (Q = duty/(ρ cp ΔT)), then size
    as a fluid pipe. Air: hvac_load_sizing.py -> airflow -> duct area."""
    mechanism = edge.get("mechanism", "thermal")
    mc = edge.get("material_context")
    is_air = bool(mc and ("air" in mc.lower() and "fluid" not in mc.lower())) \
        and not any(k in (mc or "").lower() for k in ("water", "glycol", "coolant"))

    if is_air:
        # AIR cooling -> size a DUCT.
        hv = run_tool("hvac_load_sizing.py", {
            "sensible_load_kw": duty_kw,
            "supply_air_dt_k": 10.0,
        })
        if "error" not in hv:
            airflow_cms = _f(hv.get("required_airflow_cms"))
            tool_used = "hvac_load_sizing.py (airflow) + duct ladder"
        else:
            # Fallback airflow from Q = ρ cp ΔT (air): m = Q/(cp ΔT).
            airflow_cms = (duty_kw * 1000.0) / (1006.0 * 10.0) / RHO_AIR
            tool_used = "airflow Q=ρcpΔT (hvac tool unavailable) + duct ladder"
        # Duct area from airflow / duct velocity; square duct side.
        area_m2 = airflow_cms / DEFAULT_DUCT_VELOCITY_MS
        side_ideal_mm = math.sqrt(max(1e-9, area_m2)) * 1000.0
        w = _round_up_duct(side_ideal_mm)
        # rectangular: keep a 1.6:1 aspect by halving the secondary side ladder
        h = _round_up_duct(area_m2 * 1e6 / w)
        v_actual = airflow_cms / max(1e-9, (w / 1000.0) * (h / 1000.0))
        within = v_actual <= 9.0
        # Equivalent round diameter for the CAD cylinder (same area).
        equiv_dia_mm = 2.0 * math.sqrt((w * h) / math.pi)
        return _spec(
            kind="duct",
            mechanism=mechanism,
            carried_rating=round(duty_kw, 2),
            carried_unit="kW",
            size_label=f"{w}×{h} duct",
            outer_dia_mm=round(equiv_dia_mm, 1),
            drop_pct_or_velocity=round(v_actual, 3),
            within_spec=bool(within),
            spec_limit="≤9 m/s duct velocity",
            material_qty_desc=f"{w}×{h} mm duct, {length_m:.1f} m",
            tool_used=tool_used,
            assumptions=[
                f"air cooling {duty_kw:g} kW; ΔT 10 K; duct velocity "
                f"{DEFAULT_DUCT_VELOCITY_MS:g} m/s -> {airflow_cms:.2f} m³/s airflow",
            ],
            notes="air duct sized from cooling duty -> airflow -> area",
        )

    # LIQUID coolant -> convert duty to flow then size as a fluid pipe.
    dt_k = DEFAULT_COOLANT_DT_K
    density = _density_from_context(mc, RHO_WATER)
    cp = CP_WATER if density >= 500 else 1006.0
    m_dot_kg_s = (duty_kw * 1000.0) / (cp * dt_k)
    q_m3s = m_dot_kg_s / max(1e-9, density)
    # Reuse the fluid sizer, feeding m³/s directly (mechanism stays thermal).
    spec = size_fluid(
        edge, length_m, q_m3s, "m3/s",
        target_velocity_ms=DEFAULT_LIQUID_VELOCITY_MS,
        density_override=density,
        mechanism_override=mechanism,
    )
    # Re-badge the carried rating as the THERMAL duty (the engineering quantity
    # the edge actually carries), keeping the pipe geometry from the fluid sizer.
    spec["carried_rating"] = round(duty_kw, 2)
    spec["carried_unit"] = "kW"
    spec["material_qty_desc"] = (f"{spec['size_label']} coolant pipe, {length_m:.1f} m "
                                 f"({duty_kw:g} kW @ ΔT {dt_k:g} K)")
    spec["assumptions"] = [
        f"liquid coolant; {duty_kw:g} kW / (ρ {density:g} × cp {cp:g} × ΔT {dt_k:g} K) "
        f"-> {m_dot_kg_s:.2f} kg/s -> {q_m3s * 1000:.3f} L/s",
    ] + spec["assumptions"]
    spec["notes"] = "thermal duty -> coolant flow -> pipe (Q=duty/(ρ·cp·ΔT))"
    return spec


# ---------------------------------------------------------------------------
# 6. PUBLIC: size_connection
# ---------------------------------------------------------------------------

def size_connection(edge: dict, length_m: float,
                    carried_value: Optional[float] = None) -> dict:
    """Size ONE topology edge over a CAD-measured run length.

    Args:
      edge: a topology edge dict with at least ``mechanism`` +
            ``constraint_kind``; the rating lives in ``required_value`` /
            ``required_unit`` and an optional ``required_margin_factor`` is
            multiplied in (so the connection is sized for the DESIGN value, not
            the bare rating).
      length_m: the routed-polyline length [m] measured in the CAD.
      carried_value: OVERRIDE for the rating actually carried by THIS segment
            (used by the step-down for a branch carrying a divided/summed load).
            When given it is the FINAL design value already (margin not
            re-applied).

    Returns a ConnectionSpec dict (uniform shape — see _spec)."""
    ck = edge.get("constraint_kind")
    mechanism = edge.get("mechanism")
    margin = _f(edge.get("required_margin_factor"), 1.0) or 1.0
    unit = edge.get("required_unit")
    length_m = max(0.0, _f(length_m))

    # Resolve the value carried by this segment.
    if carried_value is not None:
        value = _f(carried_value)
        applied_margin = False
    else:
        value = _f(edge.get("required_value")) * margin
        applied_margin = margin != 1.0

    # ---- Route to the right physics by constraint_kind / mechanism ----
    if ck == "current_rating" or mechanism == "electrical_bus":
        spec = size_electrical(edge, length_m, value)

    elif ck == "thermal_rejection":
        # thermal_rejection can ride a 'thermal' loop (coolant/air) OR a
        # 'fluid_loop' (heat-pump source). Both -> duty in kW.
        spec = size_thermal(edge, length_m, value)

    elif ck == "flow_capacity":
        spec = size_fluid(edge, length_m, value, unit)

    elif ck in ("voltage_rating",):
        # A voltage-only edge: render as a thin signal/HV-sense lead — no
        # current to size a conductor from. Report it honestly.
        spec = _spec(
            kind="cable", mechanism=mechanism or "electrical_bus",
            carried_rating=round(value, 1), carried_unit=unit or "V",
            size_label="2.5 mm² (sense)", outer_dia_mm=12.0,
            drop_pct_or_velocity=None, within_spec=True,
            spec_limit="insulation rated for the voltage",
            material_qty_desc=f"2.5 mm² Cu HV-sense lead, {length_m:.1f} m",
            tool_used="(voltage edge — no current to size from)",
            assumptions=["voltage_rating edge carries no power flow; sized as a "
                         "minimum sense/control lead"],
            notes="voltage-only edge — minimum lead",
        )

    elif ck == "data_bandwidth" or mechanism in ("data", "control", "optical"):
        # Data / control / optical: a thin fixed bundle (no power physics).
        kind = "fibre" if mechanism == "optical" else "cable"
        spec = _spec(
            kind=kind, mechanism=mechanism or "data",
            carried_rating=round(value, 3) if value else None,
            carried_unit=unit or ("Gbps" if value else None),
            size_label="data/control bundle", outer_dia_mm=14.0,
            drop_pct_or_velocity=None, within_spec=True,
            spec_limit="link budget (not power-limited)",
            material_qty_desc=f"signal bundle, {length_m:.1f} m",
            tool_used="(data/control — fixed bundle)",
            assumptions=["data/control/optical link — not power-sized; fixed thin bundle"],
            notes="signal connection — thin fixed bundle",
        )

    elif ck in ("mass_carry",) or mechanism == "mechanical":
        # Mechanical tie / support — render a structural member sized loosely by
        # the carried mass (a heavier tie reads thicker). Honest, coarse.
        # member side ~ sqrt(mass) heuristic so 10 t reads fatter than 100 kg.
        side_mm = max(40.0, 20.0 * math.sqrt(max(0.0, value) / 100.0)) if value else 60.0
        spec = _spec(
            kind="member", mechanism=mechanism or "mechanical",
            carried_rating=round(value, 1) if value else None,
            carried_unit=unit or ("kg" if value else None),
            size_label=f"{side_mm:.0f} mm structural tie", outer_dia_mm=round(side_mm, 1),
            drop_pct_or_velocity=None, within_spec=True,
            spec_limit="structural (load path)",
            material_qty_desc=f"steel tie ~{side_mm:.0f} mm, {length_m:.1f} m",
            tool_used="(mechanical — load-path heuristic)",
            assumptions=["mechanical/mass_carry edge sized as a structural tie "
                         "(coarse: member side ∝ sqrt(mass))"],
            notes="mechanical tie — structural member",
        )

    elif ck == "material_compatibility":
        # Pure compatibility constraint — no quantity to size. Render as the
        # generic process pipe at a nominal small size (it still connects two
        # parts in the CAD) and flag that it's compatibility-only.
        spec = _spec(
            kind="pipe", mechanism=mechanism or "fluid_loop",
            carried_rating=None, carried_unit=None,
            size_label="DN25 (nominal)", outer_dia_mm=PIPE_DN_OD["DN25"],
            drop_pct_or_velocity=None, within_spec=True,
            spec_limit=edge.get("material_context") or "material compatibility",
            material_qty_desc=f"DN25 nominal connection, {length_m:.1f} m",
            tool_used="(material_compatibility — no quantity)",
            assumptions=["material_compatibility edge carries no rated quantity; "
                         "drawn at a nominal DN25 so the parts stay connected"],
            notes="compatibility-only edge — nominal pipe",
        )

    else:
        # Unknown constraint_kind: be explicit rather than fabricate a size.
        spec = _spec(
            kind="unknown", mechanism=mechanism,
            carried_rating=round(value, 3) if value else None,
            carried_unit=unit,
            size_label="(unsized)", outer_dia_mm=None,
            within_spec=True, spec_limit=None,
            material_qty_desc=f"unsized {ck} edge, {length_m:.1f} m",
            tool_used="(none — unknown constraint_kind)",
            assumptions=[f"unknown constraint_kind {ck!r}; not sized"],
            notes="unknown constraint_kind — left unsized (no fabricated diameter)",
        )

    # Stamp common provenance.
    spec["constraint_kind"] = ck
    spec["from_part"] = edge.get("from_part")
    spec["to_part"] = edge.get("to_part")
    spec["length_m"] = round(length_m, 2)
    if applied_margin:
        spec["assumptions"] = ([f"edge rating {_f(edge.get('required_value')):g} "
                                f"{unit or ''} × margin {margin:g} = {value:g} "
                                f"design value"] + list(spec.get("assumptions", [])))
    return spec


# ---------------------------------------------------------------------------
# 6b. PHASE D — the iterative design FEEDBACK LOOP.
#
#   size_connection() sizes ONE candidate and reports within_spec. Phase D makes
#   that ITERATIVE: when a run is OUT OF SPEC the system RESPONDS.
#
#   D1  auto-upsize (the cheap response): CLIMB the size ladder (next CSA / add a
#       parallel conductor / next DN) and re-evaluate until in-spec OR the
#       practical ladder is exhausted. The generator renders at the FINAL
#       (upsized) outer_dia_mm — a long run becomes a fatter cable/pipe, visibly.
#
#   D2  design feedback (when upsizing is EXCESSIVE): instead of an absurd
#       conductor, emit a DESIGN RECOMMENDATION — a local sub-distribution
#       (MV feeder to a local step-down near the load, LV locally) OR relocate the
#       load nearer its source. This is the loop back into the design.
#
#   Both are PURE: D1 re-evaluates volt-drop / velocity / ΔP from the SAME
#   first-principles relations the sizer already trusts (Vd ∝ 1/CSA ∝ 1/n_par;
#   pipe velocity ∝ 1/area; ΔP ∝ velocity² / D), so no extra tool round-trip is
#   needed to climb. The driver string records WHY (limit, current, length, the
#   value that breached). The caller (the CAD generator) uses
#   size_connection_to_spec() at every draw site instead of size_connection().
# ---------------------------------------------------------------------------

def _cable_outer_for(csa_mm2: float, n_parallel: int) -> float:
    """Outer diameter [mm] for a (CSA, n_parallel) cable — reuses the production
    geometry so an upsized conductor renders consistently with a first-pass one."""
    return round(_cable_outer_dia_mm(csa_mm2, n_parallel), 1)


def _electrical_size_label(csa_mm2: float, n_parallel: int) -> str:
    if n_parallel <= 1:
        return f"{csa_mm2:g} mm²"
    return f"{n_parallel}×{csa_mm2:g} mm²"


def _climb_electrical(spec: dict, length_m: float) -> dict:
    """D1/D2 for a cable/busbar that breached the volt-drop limit.

    Climb the conductor ladder — first add a parallel conductor, then step the CSA
    up — re-computing the REAL routed volt-drop at each rung from the recorded
    mv_per_a_m (Vd ∝ 1/CSA ∝ 1/n_par). Stop at the first in-spec rung. If the
    in-spec rung is EXCESSIVE (CSA pinned at the top of the ladder AND still needs
    many parallels, OR the ampere-metre reach is past sane LV) OR the ladder is
    exhausted still out-of-spec → annotate a D2 design recommendation instead.

    Mutates + returns the spec. Always sets upsized / original_size_label /
    final_size_label / driver / upsize_iterations; sets design_recommendation when
    D2 fires."""
    vd_limit = _voltdrop_limit_pct()
    current_a = _f(spec.get("carried_rating"))
    v_sys = _f(spec.get("system_voltage_v"), DEFAULT_DC_BUS_VOLTAGE_V) or DEFAULT_DC_BUS_VOLTAGE_V
    base_csa = _f(spec.get("csa_mm2"))
    base_n = max(1, int(_f(spec.get("n_parallel"), 1) or 1))
    base_mv = _f(spec.get("mv_per_a_m"))
    orig_label = spec.get("size_label")
    orig_vd = _f(spec.get("drop_pct_or_velocity"))

    spec["original_size_label"] = orig_label

    def _vd_pct(csa: float, n_par: int) -> float:
        # Vd ∝ 1/CSA (resistive) and ∝ 1/n_parallel; scale the recorded mv_per_a_m
        # of the base conductor to the trial conductor.
        if base_csa <= 0 or base_mv <= 0:
            return orig_vd
        mv = base_mv * (base_csa / max(1e-9, csa))
        vd_v = mv * current_a * max(0.0, length_m) / 1000.0 / max(1, n_par)
        return 100.0 * vd_v / max(1e-9, v_sys)

    # The ampere-metre reach (an LV-distribution sanity heuristic).
    reach_a_m = current_a * max(0.0, length_m)
    is_lv = v_sys <= LV_REACH_VOLTAGE_CEILING_V

    # Build the climb ladder: at each n_parallel (base..MAX) sweep the CSA ladder
    # from the current CSA upward. Prefer FEWER parallels first (add a conductor),
    # then a fatter CSA — the cheaper, more practical response before the next.
    iterations = 0
    chosen = None  # (csa, n_par, vd_pct)
    # Start the CSA sweep at the first ladder rung >= the base conductor. If the
    # base CSA is BEYOND the ladder top (a fat busbar), the only climb dimension is
    # more parallels of the top CSA — start at the last rung (never climb to a
    # SMALLER CSA, which would only worsen volt-drop).
    csa_start_idx = len(CABLE_CSA_LADDER) - 1
    for i, c in enumerate(CABLE_CSA_LADDER):
        if c >= base_csa - 1e-9:
            csa_start_idx = i
            break
    for n_par in range(base_n, PRACTICAL_MAX_PARALLEL + 1):
        for c in CABLE_CSA_LADDER[csa_start_idx:]:
            # don't re-test the exact starting conductor (it already breached)
            if n_par == base_n and abs(c - base_csa) < 1e-9:
                continue
            iterations += 1
            vd = _vd_pct(c, n_par)
            if vd <= vd_limit:
                chosen = (c, n_par, vd)
                break
        if chosen is not None:
            break

    spec["upsize_iterations"] = iterations

    # Is even the chosen answer EXCESSIVE? (top-of-ladder CSA forced AND multiple
    # parallels, or the LV ampere-metre reach is past sane.) Then D2, not D1.
    excessive_reach = is_lv and reach_a_m > PRACTICAL_LV_REACH_A_M

    if chosen is not None and not excessive_reach:
        csa, n_par, vd = chosen
        spec["csa_mm2"] = csa
        spec["n_parallel"] = n_par
        spec["mv_per_a_m"] = base_mv * (base_csa / max(1e-9, csa)) if base_csa > 0 else base_mv
        spec["size_label"] = _electrical_size_label(csa, n_par)
        spec["final_size_label"] = spec["size_label"]
        spec["outer_dia_mm"] = _cable_outer_for(csa, n_par)
        spec["drop_pct_or_velocity"] = round(vd, 3)
        spec["within_spec"] = True
        spec["upsized"] = True
        spec["kind"] = "cable"   # an upsized busbar is rendered as a parallel-cable group
        spec["driver"] = (f"volt-drop {orig_vd:g}% > {vd_limit:g}% over {length_m:.0f} m "
                          f"at {current_a:g} A on {v_sys:g} V")
        spec["material_qty_desc"] = (
            f"{n_par} × {csa:g} mm² Cu (parallel), {length_m:.1f} m each"
            if n_par > 1 else f"1 × {csa:g} mm² Cu, {length_m:.1f} m")
        spec["assumptions"] = list(spec.get("assumptions", [])) + [
            f"D1 auto-upsize: {orig_label} → {spec['size_label']} "
            f"({iterations} ladder step{'s' if iterations != 1 else ''}); "
            f"volt-drop {orig_vd:g}% → {vd:.3f}% (≤ {vd_limit:g}% limit)"
        ]
        spec["notes"] = (f"D1 auto-upsized {orig_label} → {spec['size_label']} "
                         f"to bring volt-drop {orig_vd:g}% under {vd_limit:g}%")
        return spec

    # ---- D2: upsizing is excessive / impossible → DESIGN RECOMMENDATION ----
    # Pick the best-effort largest conductor for the render (fattest we tried) so
    # the run is still visibly heavy, but flag it as the wrong answer.
    fat_csa = CABLE_CSA_LADDER[-1]
    fat_n = PRACTICAL_MAX_PARALLEL
    fat_vd = _vd_pct(fat_csa, fat_n)
    spec["csa_mm2"] = fat_csa
    spec["n_parallel"] = fat_n
    spec["size_label"] = _electrical_size_label(fat_csa, fat_n)
    spec["final_size_label"] = spec["size_label"]
    spec["outer_dia_mm"] = _cable_outer_for(fat_csa, fat_n)
    spec["drop_pct_or_velocity"] = round(fat_vd, 3)
    spec["within_spec"] = fat_vd <= vd_limit   # usually still False
    spec["upsized"] = True

    if excessive_reach:
        reason = (f"{length_m:.0f} m at {current_a:g} A on {v_sys:g} V "
                  f"(= {reach_a_m:,.0f} A·m) exceeds practical LV reach "
                  f"(~{PRACTICAL_LV_REACH_A_M:,.0f} A·m)")
    else:
        reason = (f"volt-drop {orig_vd:g}% stays > {vd_limit:g}% even at "
                  f"{PRACTICAL_MAX_PARALLEL}×{CABLE_CSA_LADDER[-1]:g} mm² over "
                  f"{length_m:.0f} m at {current_a:g} A on {v_sys:g} V")
    rec = (f"Run {spec.get('from_part') or '?'}→{spec.get('to_part') or '?'}: "
           f"{reason} — recommend a LOCAL SUB-DISTRIBUTION (MV feeder to a local "
           f"step-down transformer near the load, LV distributed locally) OR "
           f"relocate the load nearer its source. An ever-fatter LV conductor is "
           f"the wrong response at this reach.")
    spec["driver"] = reason
    spec["design_recommendation"] = rec
    spec["assumptions"] = list(spec.get("assumptions", [])) + [
        f"D2 design feedback: {reason}; ladder-climb exhausted/excessive → "
        f"sub-distribution recommended (not an absurd conductor)"
    ]
    spec["notes"] = ("D2 DESIGN RECOMMENDATION — LV reach exceeded; "
                     "sub-distribution / relocate (see design_recommendation)")
    return spec


def _climb_fluid(spec: dict, length_m: float) -> dict:
    """D1/D2 for a pipe/duct that breached the velocity (or ΔP) limit.

    Step the DN (or duct) ladder UP — velocity ∝ 1/area falls as the bore grows —
    until the velocity is within the erosion limit AND the ΔP (which scales ∝
    v²/D, so it falls FAST as the bore grows) is under the practical ceiling, OR
    the ladder is exhausted. If exhausted still out-of-spec OR the in-spec answer's
    ΔP is still over the practical ceiling → a D2 recommendation (boost/relocate)."""
    orig_label = spec.get("size_label")
    orig_v = _f(spec.get("drop_pct_or_velocity"))
    spec_limit = spec.get("spec_limit") or ""
    spec["original_size_label"] = orig_label
    kind = spec.get("kind")

    # Parse the velocity limit out of the spec_limit string ("≤3 m/s velocity").
    import re as _re
    m = _re.search(r"([\d.]+)\s*m/s", spec_limit or "")
    v_limit = float(m.group(1)) if m else LIQUID_VELOCITY_LIMIT_MS

    if kind != "pipe":
        # Duct climb is rare; fall back to a single step up the duct ladder by
        # widening the equivalent diameter (kept simple — ducts seldom breach).
        spec["final_size_label"] = orig_label
        spec["driver"] = f"velocity {orig_v:g} m/s > {v_limit:g} m/s over {length_m:.0f} m"
        return spec

    # Reconstruct the volumetric flow from the achieved velocity in the chosen
    # bore so the climb is exact: Q = v_actual × area(base_bore).
    base_bore = None
    for label, bore in PIPE_DN_LADDER:
        if label == orig_label:
            base_bore = bore
            break
    if base_bore is None:
        spec["final_size_label"] = orig_label
        spec["driver"] = f"velocity {orig_v:g} m/s > {v_limit:g} m/s"
        return spec
    area_base = math.pi * (base_bore / 1000.0 / 2.0) ** 2
    q_m3s = orig_v * area_base
    density = _f(spec.get("density_kg_m3"), RHO_WATER) or RHO_WATER
    base_dp = _f(spec.get("dp_kpa"))

    iterations = 0
    chosen = None  # (label, bore, v, dp_kpa)
    start_idx = 0
    for i, (label, bore) in enumerate(PIPE_DN_LADDER):
        if label == orig_label:
            start_idx = i + 1
            break
    for label, bore in PIPE_DN_LADDER[start_idx:]:
        iterations += 1
        area = math.pi * (bore / 1000.0 / 2.0) ** 2
        v = q_m3s / max(1e-12, area)
        # ΔP ∝ v² / D (Darcy, friction roughly constant across adjacent DN); scale
        # the recorded base ΔP by (v/orig_v)² × (base_bore/bore).
        if base_dp > 0 and orig_v > 0:
            dp = base_dp * (v / orig_v) ** 2 * (base_bore / bore)
        else:
            dp = None
        if v <= v_limit and (dp is None or dp <= PRACTICAL_MAX_PIPE_DP_KPA):
            chosen = (label, bore, v, dp)
            break

    spec["upsize_iterations"] = iterations

    if chosen is not None:
        label, bore, v, dp = chosen
        spec["size_label"] = label
        spec["final_size_label"] = label
        spec["outer_dia_mm"] = PIPE_DN_OD.get(label, bore * 1.15)
        spec["drop_pct_or_velocity"] = round(v, 3)
        if dp is not None:
            spec["dp_kpa"] = round(dp, 2)
        spec["within_spec"] = True
        spec["upsized"] = True
        spec["driver"] = (f"velocity {orig_v:g} m/s > {v_limit:g} m/s over "
                          f"{length_m:.0f} m")
        spec["material_qty_desc"] = (f"{label} pipe, {length_m:.1f} m"
                                     + (f", ΔP≈{dp:.1f} kPa" if dp is not None else ""))
        spec["assumptions"] = list(spec.get("assumptions", [])) + [
            f"D1 auto-upsize: {orig_label} → {label} ({iterations} ladder "
            f"step{'s' if iterations != 1 else ''}); velocity {orig_v:g} → "
            f"{v:.2f} m/s (≤ {v_limit:g} m/s)"
        ]
        spec["notes"] = (f"D1 auto-upsized {orig_label} → {label} to bring "
                         f"velocity {orig_v:g} m/s under {v_limit:g} m/s")
        return spec

    # ---- D2 for a pipe: ladder exhausted still out of spec ----
    label, bore = PIPE_DN_LADDER[-1]
    area = math.pi * (bore / 1000.0 / 2.0) ** 2
    v = q_m3s / max(1e-12, area)
    spec["size_label"] = label
    spec["final_size_label"] = label
    spec["outer_dia_mm"] = PIPE_DN_OD.get(label, bore * 1.15)
    spec["drop_pct_or_velocity"] = round(v, 3)
    spec["within_spec"] = v <= v_limit
    spec["upsized"] = True
    reason = (f"flow {q_m3s * 1000:.1f} L/s stays > {v_limit:g} m/s even at the "
              f"largest standard bore ({label}) over {length_m:.0f} m")
    rec = (f"Run {spec.get('from_part') or '?'}→{spec.get('to_part') or '?'}: "
           f"{reason} — recommend splitting the duty across parallel lines, a "
           f"local boost, or relocating the consumer nearer the source. A single "
           f"line past {label} is the wrong response.")
    spec["driver"] = reason
    spec["design_recommendation"] = rec
    spec["assumptions"] = list(spec.get("assumptions", [])) + [
        f"D2 design feedback: {reason}; pipe ladder exhausted → split/boost/relocate"]
    spec["notes"] = ("D2 DESIGN RECOMMENDATION — pipe ladder exhausted "
                     "(see design_recommendation)")
    return spec


def size_connection_to_spec(edge: dict, length_m: float,
                            carried_value: Optional[float] = None) -> dict:
    """PUBLIC Phase-D entry point. Size ONE edge (via size_connection) and, when the
    first-pass result is OUT OF SPEC, RESPOND:

      * D1 — climb the size ladder (parallel conductor / fatter CSA / next DN) and
        re-evaluate until in-spec (the run renders FATTER), or
      * D2 — when upsizing is excessive/impossible, leave a best-effort heavy
        conductor for the render BUT attach a design_recommendation (sub-distribution
        / relocate) — the feedback back into the design.

    Returns the ConnectionSpec with the Phase-D fields populated (upsized,
    original_size_label, final_size_label, driver, upsize_iterations,
    design_recommendation). An in-spec first pass is returned unchanged except
    upsized=False + final_size_label=size_label (uniform shape for the schedule).

    PHASE-D3 TEST INJECTION (CONN_TEST_LONG_RUN_M): when set to a length in metres,
    ELECTRICAL runs are SIZED as if the load sat that far away (a "what if this load
    were N m from its source" what-if). This is the task's "inject a long test run"
    lever — it FORCES a real BESS/e-fuel bus out of spec so the D1/D2 response is
    demonstrable on REAL ratings without fabricating fake edge data. It overrides
    only the SIZING length (volt-drop / reach), never the rendered polyline."""
    test_len_raw = os.environ.get("CONN_TEST_LONG_RUN_M")
    eff_len = _f(length_m)
    ck = (edge.get("constraint_kind") if isinstance(edge, dict) else None)
    is_electrical = (ck == "current_rating"
                     or (isinstance(edge, dict)
                         and edge.get("mechanism") == "electrical_bus"))
    if test_len_raw and is_electrical:
        try:
            inj = float(test_len_raw)
            if inj > 0:
                eff_len = inj
        except (TypeError, ValueError):
            pass

    spec = size_connection(edge, eff_len, carried_value=carried_value)
    if spec.get("within_spec") is not False:
        spec["upsized"] = False
        spec["final_size_label"] = spec.get("size_label")
        return spec

    kind = spec.get("kind")
    if kind in ("cable", "busbar"):
        return _climb_electrical(spec, eff_len)
    if kind in ("pipe", "duct"):
        return _climb_fluid(spec, eff_len)

    # Other kinds (member/data/unknown) don't carry a climbable spec dimension.
    spec["upsized"] = False
    spec["final_size_label"] = spec.get("size_label")
    return spec


# ---------------------------------------------------------------------------
# 7. PUBLIC: size_distribution_tree (the STEP-DOWN)
# ---------------------------------------------------------------------------

def size_distribution_tree(hub_edge: dict, branch_edges: list[dict],
                           lengths: list[float]) -> dict:
    """Size a step-down distribution tree.

    The TRUNK (``hub_edge``) carries Σ(branch design loads) and is sized for the
    total; each BRANCH is sized for its own share. Thick main -> thinner
    branches falls out because trunk current = Σ branch currents.

    A transformer/step-down HUB (``hub_edge['hub_kind'] == 'transformer'`` or a
    primary/secondary voltage pair on the hub) is sized via
    electrical_transformer_sizing.py — the conductor size CHANGES across the hub
    because the current changes with the turns ratio.

    Args:
      hub_edge: the trunk edge (same shape as a topology edge); may carry its
                own ``required_value`` (used only if no branches sum higher) and
                a ``length_m`` / be paired with lengths[0] if provided.
      branch_edges: the downstream edges, each its own topology edge.
      lengths: run lengths [m]; lengths[0] = trunk, lengths[1:] = branches
               (or len==len(branch_edges) meaning branches only, trunk uses
               hub_edge['length_m']).

    Returns:
      { 'trunk': ConnectionSpec, 'branches': [ConnectionSpec, ...],
        'transformer': {...}|None, 'summed_design_value': float, 'unit': str }
    """
    # Map lengths onto trunk + branches.
    if len(lengths) == len(branch_edges) + 1:
        trunk_len = _f(lengths[0])
        branch_lens = [_f(x) for x in lengths[1:]]
    elif len(lengths) == len(branch_edges):
        trunk_len = _f(hub_edge.get("length_m"), 0.0)
        branch_lens = [_f(x) for x in lengths]
    else:
        # best-effort: pad/truncate branch lengths, trunk from hub_edge
        trunk_len = _f(hub_edge.get("length_m"), 0.0)
        branch_lens = [(_f(lengths[i]) if i < len(lengths) else 0.0)
                       for i in range(len(branch_edges))]

    # ---- Size each branch for ITS OWN design share ----
    branch_specs: list[dict] = []
    summed_value = 0.0
    unit = None
    for be, bl in zip(branch_edges, branch_lens):
        bspec = size_connection_to_spec(be, bl)   # D1/D2 on each branch
        branch_specs.append(bspec)
        # accumulate the DESIGN value (rating × margin) in the branch's unit
        margin = _f(be.get("required_margin_factor"), 1.0) or 1.0
        summed_value += _f(be.get("required_value")) * margin
        unit = unit or be.get("required_unit")

    # ---- The trunk carries Σ branches (or its own value, whichever is larger) ----
    hub_margin = _f(hub_edge.get("required_margin_factor"), 1.0) or 1.0
    hub_own = _f(hub_edge.get("required_value")) * hub_margin
    trunk_value = max(summed_value, hub_own)

    transformer = None
    # ---- Transformer / step-down hub ----
    is_xfmr = (str(hub_edge.get("hub_kind", "")).lower() == "transformer"
               or (hub_edge.get("primary_voltage_v") is not None
                   and hub_edge.get("secondary_voltage_v") is not None))
    if is_xfmr and (unit == "A" or hub_edge.get("constraint_kind") == "current_rating"):
        v_pri = _f(hub_edge.get("primary_voltage_v"), 11000.0)
        v_sec = _f(hub_edge.get("secondary_voltage_v"), 400.0)
        # Trunk (secondary side) current -> load kW at the secondary voltage
        # (3-phase): P = sqrt(3) · V_sec · I.
        load_kw = math.sqrt(3.0) * v_sec * trunk_value / 1000.0
        xr = run_tool("electrical_transformer_sizing.py", {
            "transformer_name": "step-down hub",
            "plant_load_kw": max(0.1, load_kw),
            "power_factor": 0.95,
            "headroom_fraction": 0.25,
            "primary_voltage_v": v_pri,
            "secondary_voltage_v": v_sec,
            "phases": 3,
        })
        if "error" not in xr:
            i_pri = _f(xr.get("transformer_primary_current_a"))
            i_sec = _f(xr.get("transformer_secondary_current_a"))
            transformer = {
                "transformer_kva": _f(xr.get("transformer_kva")),
                "primary_voltage_v": v_pri,
                "secondary_voltage_v": v_sec,
                "primary_current_a": round(i_pri, 1),
                "secondary_current_a": round(i_sec, 1),
                "tool_used": "electrical_transformer_sizing.py",
                "note": ("conductor size CHANGES across the hub: HV primary "
                         f"{i_pri:.0f} A vs LV secondary {i_sec:.0f} A"),
            }
            # The TRUNK on each side is sized to the respective current.
            trunk_value = i_sec  # the LV-side trunk feeds the branches

    # ---- Size the trunk for the (possibly transformer-adjusted) trunk value ----
    trunk_edge = dict(hub_edge)
    trunk_edge.setdefault("constraint_kind",
                          branch_edges[0].get("constraint_kind") if branch_edges else "current_rating")
    trunk_edge.setdefault("mechanism",
                          branch_edges[0].get("mechanism") if branch_edges else "electrical_bus")
    trunk_spec = size_connection_to_spec(trunk_edge, trunk_len, carried_value=trunk_value)
    trunk_spec["role"] = "trunk"
    for bs in branch_specs:
        bs["role"] = "branch"

    return {
        "trunk": trunk_spec,
        "branches": branch_specs,
        "transformer": transformer,
        "summed_design_value": round(summed_value, 3),
        "trunk_design_value": round(trunk_value, 3),
        "unit": unit,
    }


# ---------------------------------------------------------------------------
# 7c. PHASE D2 ACTUATION — auto-insert a sub-distribution + RE-ROUTE the run.
#
#   size_connection_to_spec()'s D2 RECOMMENDS a sub-distribution when a fan-out is
#   infeasible at LV over the distance (a long high-current LV run). It does NOT
#   change the design — it leaves a best-effort fat conductor + a text recommendation.
#
#   size_d2_actuation() makes D2 *ACT*: it RE-DESIGNS the infeasible fan-out as a
#   step-down hierarchy and returns specs that come back IN-SPEC —
#     1. a SUB-DISTRIBUTION node (a local panel / step-down transformer marker placed
#        NEAR the consumer cluster, between the source hub and the far consumers);
#     2. ONE FEEDER hub→sub-distribution sized for the TOTAL load — stepped UP to MV
#        (D2_ACTUATION_MV_FEEDER_V) for the long haul, so the feeder current is the
#        MV-side primary current (≈ LV_V/MV_V smaller) and the feeder is THIN +
#        in-spec where the LV run was not (modelled via electrical_transformer_sizing.py);
#     3. SHORT LV BRANCHES from the sub-distribution to each local consumer, re-sized
#        over the SHORT local distance (in-spec at LV) — the original infeasible
#        long-LV run is GONE;
#     4. (when the consumers ride a local busway) a SHORT LV local busway from the
#        sub-distribution along the cluster, carrying the total LV-side current over
#        the short local span (in-spec).
#
#   PURE — reuses size_connection_to_spec / electrical_transformer_sizing.py; no
#   geometry. The SCENE BUILDER (build_universal_scene.py, gated CONN_D2_ACTUATE=1)
#   calls this, renders the returned sub-distribution box + feeder + short branches,
#   and feeds every returned spec into the schedule so they are recorded + costed.
#
#   UNIVERSAL — keyed purely on the D2 condition (an electrical LV fan-out whose
#   long-haul run is past the practical LV reach), never on archetype.
# ---------------------------------------------------------------------------

def d2_actuation_applicable(trunk_spec: dict) -> bool:
    """True when a sized trunk/feeder spec is a D2 case the actuation can RESOLVE:
    an ELECTRICAL run (cable/busbar) that breached spec AND carries a
    design_recommendation (the LV-reach / ladder-exhausted D2 signal). Pipes/ducts
    and in-spec runs are never actuated (the sub-distribution answer is electrical).
    """
    if not isinstance(trunk_spec, dict):
        return False
    if trunk_spec.get("kind") not in ("cable", "busbar"):
        return False
    if not trunk_spec.get("design_recommendation"):
        return False
    # only the LV-reach / ladder-exhausted D2 (not a pipe split/boost) is actuable.
    return trunk_spec.get("within_spec") is False


def size_d2_actuation(hub_edge: dict,
                      total_value: float,
                      branch_edges: list[dict],
                      long_haul_m: float,
                      lv_voltage_v: float,
                      branch_local_lengths: Optional[list[float]] = None,
                      local_busway_m: Optional[float] = None,
                      mv_feeder_v: float = D2_ACTUATION_MV_FEEDER_V,
                      sub_distribution_name: str = "sub_distribution") -> dict:
    """ACTUATE D2: re-design an infeasible LV electrical fan-out as a step-down
    hierarchy that comes back IN-SPEC. PURE (no Blender).

    Args:
      hub_edge:   the SOURCE hub edge (carries mechanism / material_context / the
                  electrical constraint_kind). Its from_part names the source.
      total_value: the TOTAL design load the fan-out carries [A] (the trunk value —
                  Σ branch shares, already margin-applied).
      branch_edges: the per-consumer edges (each carries its own required_value share
                  + from/to part names) — re-sized LOCALLY off the sub-distribution.
      long_haul_m: the long distance source→cluster that made the LV run infeasible
                  [m] (the volt-drop / reach length, e.g. the CONN_TEST_LONG_RUN_M
                  injection or a genuinely long routed run).
      lv_voltage_v: the LV system voltage the consumers run at [V] (e.g. 48).
      branch_local_lengths: the SHORT local length of each branch off the sub-
                  distribution [m] (the real geometric tap length). Defaults to
                  D2_ACTUATION_LOCAL_BRANCH_M each when None / short.
      local_busway_m: the SHORT local span of the LV busway along the cluster [m]
                  (the re-sized trunk-equivalent on the LV side). When None, no
                  separate local busway spec is emitted (the branches tap the
                  sub-distribution directly).
      mv_feeder_v: the medium voltage the long feeder steps up to [V] (default 11 kV).
      sub_distribution_name: the name stamped on the sub-distribution node + used as
                  the from_part of the local branches.

    Returns a dict:
      { 'sub_distribution': {name, kind, primary_voltage_v, secondary_voltage_v,
                             transformer_kva, primary_current_a, secondary_current_a,
                             total_value, unit, tool_used, note},
        'feeder': ConnectionSpec (hub→sub-distribution, MV, thin, in-spec),
        'local_busway': ConnectionSpec|None (sub-distribution→cluster, LV, short),
        'branches': [ConnectionSpec, ...] (sub-distribution→each consumer, LV, short),
        'resolved': bool (True iff feeder + busway + every branch are within_spec),
        'before': {...the original infeasible run's numbers...} }

    The returned specs already have role stamped (feeder / local_busway / branch) and
    are ready for connection_schedule / connection_cost (they carry length_m, sizes,
    within_spec). `sub_distribution` is rendered by the scene builder as a panel/
    transformer box near the cluster + costed by kVA (the existing transformer £/kVA).
    """
    mech = hub_edge.get("mechanism", "electrical_bus")
    ck = hub_edge.get("constraint_kind", "current_rating")
    unit = hub_edge.get("required_unit") or "A"
    src_name = hub_edge.get("from_part") or "source"
    mc = hub_edge.get("material_context")
    lv_voltage_v = _f(lv_voltage_v, DEFAULT_SYSTEM_VOLTAGE_V) or DEFAULT_SYSTEM_VOLTAGE_V
    total_value = _f(total_value)

    # ---- 1. SUB-DISTRIBUTION: a step-down transformer MV→LV sized for the total --
    # The LV-side load in kW (3-phase apparent ~ active here): P = √3·V_lv·I_total.
    load_kw = math.sqrt(3.0) * lv_voltage_v * total_value / 1000.0
    xr = run_tool("electrical_transformer_sizing.py", {
        "transformer_name": f"{sub_distribution_name} step-down",
        "plant_load_kw": max(0.1, load_kw),
        "power_factor": 0.95,
        "headroom_fraction": 0.25,
        "primary_voltage_v": mv_feeder_v,
        "secondary_voltage_v": lv_voltage_v,
        "phases": 3,
    })
    if "error" not in xr:
        kva = _f(xr.get("transformer_kva"))
        i_pri = _f(xr.get("transformer_primary_current_a"))
        i_sec = _f(xr.get("transformer_secondary_current_a"))
        xfmr_tool = "electrical_transformer_sizing.py"
    else:
        # Deterministic fallback if the tool is unreachable: kVA from load + headroom,
        # primary/secondary currents from S/(√3·U). No fabricated constants.
        kva = (load_kw / 0.95) * 1.25
        i_pri = kva * 1000.0 / (math.sqrt(3.0) * mv_feeder_v)
        i_sec = kva * 1000.0 / (math.sqrt(3.0) * lv_voltage_v)
        xfmr_tool = "S=P/pf×1.25 + I=S/(√3·U) (transformer tool unavailable)"

    sub_distribution = {
        "name": sub_distribution_name,
        "kind": "transformer",   # a local step-down panel/transformer marker
        "primary_voltage_v": mv_feeder_v,
        "secondary_voltage_v": lv_voltage_v,
        "transformer_kva": round(kva, 1),
        "primary_current_a": round(i_pri, 1),
        "secondary_current_a": round(i_sec, 1),
        "total_value": round(total_value, 1),
        "unit": unit,
        "tool_used": xfmr_tool,
        "note": (f"local sub-distribution: {mv_feeder_v:g} V MV feeder → {kva:g} kVA "
                 f"step-down → {lv_voltage_v:g} V LV near the cluster "
                 f"(HV primary {i_pri:.0f} A vs LV secondary {i_sec:.0f} A)"),
    }

    # ---- 2. FEEDER hub→sub-distribution, MV, sized for the MV primary current ----
    # Carries the TOTAL load but at MV, so the current is the transformer PRIMARY
    # current (≈ lv/mv smaller). Sized over the LONG haul — in-spec because it is MV.
    feeder_edge = {
        "from_part": src_name, "to_part": sub_distribution_name, "mechanism": mech,
        "constraint_kind": ck, "required_value": i_pri, "required_unit": "A",
        "required_margin_factor": 1.0,
        # Pin the feeder system voltage to MV explicitly so the volt-drop% is taken
        # against MV (NOT the LV test-override) — _infer_system_voltage reads this key.
        "system_voltage_v": mv_feeder_v,
        "material_context": f"{mv_feeder_v:g} V MV feeder",
    }
    feeder = _size_actuation_run(feeder_edge, long_haul_m, role="feeder")
    feeder["actuation_role"] = "feeder"

    # ---- 3. LOCAL LV BUSWAY sub-distribution→cluster (short), carries total LV I ----
    local_busway = None
    if local_busway_m is not None:
        busway_edge = {
            "from_part": sub_distribution_name, "to_part": "(local busway)",
            "mechanism": mech, "constraint_kind": ck,
            "required_value": total_value, "required_unit": unit,
            "required_margin_factor": 1.0,
            "system_voltage_v": lv_voltage_v,
            "material_context": mc or f"{lv_voltage_v:g} V LV bus",
        }
        local_busway = _size_actuation_run(busway_edge, _f(local_busway_m),
                                           role="local_busway")
        local_busway["actuation_role"] = "local_busway"

    # ---- 4. SHORT LV BRANCHES sub-distribution→each consumer (short local length) --
    branches: list[dict] = []
    n = len(branch_edges)
    for k, be in enumerate(branch_edges):
        local_len = D2_ACTUATION_LOCAL_BRANCH_M
        if branch_local_lengths and k < len(branch_local_lengths):
            ll = _f(branch_local_lengths[k])
            if ll > 0:
                local_len = ll
        margin = _f(be.get("required_margin_factor"), 1.0) or 1.0
        share = _f(be.get("required_value")) * margin
        to_nm = be.get("to_part") or f"consumer[{k}]"
        if share <= 0:
            # A consumer with NO current rating (e.g. a thermal load swept into the
            # electrical fan-out) would size a degenerate 0 mm² busbar; emit a minimal
            # in-spec sense/control lead instead (honest: nothing to size a power
            # conductor from). Keeps the actuation 0-out-of-spec + the schedule clean.
            bs = _spec(
                kind="cable", mechanism=be.get("mechanism", mech),
                carried_rating=None, carried_unit=be.get("required_unit") or unit,
                size_label="2.5 mm² (sense)", outer_dia_mm=12.0,
                drop_pct_or_velocity=None, within_spec=True,
                spec_limit="no current rating — minimum lead",
                material_qty_desc=f"2.5 mm² Cu sense lead, {local_len:.1f} m",
                tool_used="(actuation branch — consumer carried no current rating)",
                assumptions=["D2 ACTUATION branch: consumer edge carried no current "
                             "rating; drawn as a minimum 2.5 mm² sense lead (not a "
                             "degenerate 0 mm² busbar)"],
                notes="actuation branch with no rating — minimum lead",
            )
            bs["role"] = "branch"; bs["actuation_role"] = "branch"
            bs["from_part"] = sub_distribution_name; bs["to_part"] = to_nm
            bs["csa_mm2"] = 2.5; bs["n_parallel"] = 1
            branches.append(bs)
            continue
        b_edge = {
            "from_part": sub_distribution_name,
            "to_part": to_nm,
            "mechanism": be.get("mechanism", mech),
            "constraint_kind": be.get("constraint_kind", ck),
            "required_value": share, "required_unit": be.get("required_unit") or unit,
            "required_margin_factor": 1.0,
            "system_voltage_v": lv_voltage_v,
            "material_context": be.get("material_context") or mc
                                 or f"{lv_voltage_v:g} V LV bus",
        }
        bs = _size_actuation_run(b_edge, local_len, role="branch")
        bs["actuation_role"] = "branch"
        branches.append(bs)

    feeder_ok = feeder.get("within_spec") is True
    busway_ok = (local_busway is None) or (local_busway.get("within_spec") is True)
    branches_ok = all(b.get("within_spec") is True for b in branches) if branches else True
    resolved = bool(feeder_ok and busway_ok and branches_ok)

    return {
        "sub_distribution": sub_distribution,
        "feeder": feeder,
        "local_busway": local_busway,
        "branches": branches,
        "resolved": resolved,
        "before": {
            "lv_voltage_v": lv_voltage_v,
            "total_value": round(total_value, 1),
            "unit": unit,
            "long_haul_m": round(_f(long_haul_m), 1),
            "reach_a_m": round(total_value * _f(long_haul_m), 0),
            "practical_lv_reach_a_m": PRACTICAL_LV_REACH_A_M,
        },
        "n_branches": n,
    }


def _size_actuation_run(edge: dict, length_m: float, role: str) -> dict:
    """Size ONE actuation run via size_connection_to_spec with the TWO Phase-D3 test
    levers NEUTRALISED, because the actuation has ALREADY decided this run's true
    length AND true voltage and pinned them on the edge:

      * CONN_TEST_LONG_RUN_M — the global 'inject a long run' lever must not
        re-stretch a deliberately-SHORT actuation branch (the whole point of the
        sub-distribution is that the branches are local); the explicit length passed
        here is honoured exactly.
      * CONN_TEST_LV_VOLTAGE_V — the 'what-if this were an LV system' lever must not
        clobber the feeder's pinned MV voltage (the feeder is GENUINELY medium voltage
        — that is how the step-up makes it thin + in-spec); each actuation edge carries
        an explicit system_voltage_v (MV feeder vs LV branch/busway) which _infer_
        system_voltage must honour, so the test override is dropped for the call.

    Stamps role + actuation provenance."""
    saved_len = os.environ.pop("CONN_TEST_LONG_RUN_M", None)
    saved_lv = os.environ.pop("CONN_TEST_LV_VOLTAGE_V", None)
    try:
        spec = size_connection_to_spec(dict(edge), _f(length_m))
    finally:
        if saved_len is not None:
            os.environ["CONN_TEST_LONG_RUN_M"] = saved_len
        if saved_lv is not None:
            os.environ["CONN_TEST_LV_VOLTAGE_V"] = saved_lv
    spec["role"] = role
    spec["from_part"] = edge.get("from_part")
    spec["to_part"] = edge.get("to_part")
    return spec


# ---------------------------------------------------------------------------
# 7b. COST — price a sized ConnectionSpec from the documented supply+install
#     ladders above. PURE. Every result is stamped with cost_source so the
#     dossier can disclose it is a MODEL, not engine/distributor data.
# ---------------------------------------------------------------------------

def _ladder_cost_for_csa(csa_mm2: float, table: dict) -> tuple[float, float]:
    """£ for the nearest ladder CSA >= csa_mm2 (clamped to the ends). Returns
    (rate, ladder_csa). A busbar's huge equivalent CSA clamps to the top rung."""
    if csa_mm2 is None or csa_mm2 <= 0:
        keys = sorted(table)
        return table[keys[0]], keys[0]
    keys = sorted(table)
    for k in keys:
        if k >= csa_mm2 - 1e-9:
            return table[k], k
    return table[keys[-1]], keys[-1]


def _parse_csa_from_label(size_label: Optional[str]) -> Optional[float]:
    """Pull the per-conductor CSA [mm²] out of a size label like '95 mm²',
    '3×400 mm²' (→ 400 the per-conductor size) or a busbar label '(2880 mm²)'."""
    if not size_label:
        return None
    import re as _re
    # parenthesised busbar area first: '... (2880 mm²)'
    m = _re.search(r"\(([\d.]+)\s*mm²\)", size_label)
    if m:
        return float(m.group(1))
    # the LAST 'N mm²' in the label is the per-conductor CSA ('3×400 mm²' → 400).
    last = None
    for m in _re.finditer(r"([\d.]+)\s*mm²", size_label):
        last = float(m.group(1))
    return last


def _pipe_material_factor(material_context: Optional[str]) -> tuple[float, str]:
    """Material multiplier + label on the carbon-steel pipe rate (carbon = 1.0).

    Resolution order (universal, keyed on the SERVICE / fluid in material_context):
      1. An EXPLICIT plastic / copper / exotic-alloy material named in the context wins
         (e.g. the context literally says "HDPE" or "Hastelloy").
      2. Else a CORROSIVE-FLUID service forces a corrosion-resistant default — HDPE/PE100
         for corrosive water (seawater / saline / brine / effluent / wastewater), 316L for
         an oxidiser / LOX / ozone line — OVERRIDING the carbon/stainless the substring
         table would otherwise pick (a seawater main is HDPE, never carbon steel and never
         plain 316L which pits in chloride).
      3. Else the generic substring table (a stated 316/stainless, copper, etc.).
      4. Else carbon steel.
    No-op for a non-corrosive service with no stated material → carbon steel as before."""
    if not material_context:
        return 1.0, "carbon steel (assumed)"
    s = material_context.lower()

    def _match(subs):
        for sub in subs:
            if sub.startswith("\\b"):                # a regex word-boundary token
                if re.search(sub, s):
                    return True
            elif sub in s:
                return True
        return False

    # (1) an explicitly-named corrosion-resistant / special material wins outright.
    for subs, factor, label in PIPE_MATERIAL_FACTORS:
        if label in ("plastic/composite", "copper", "exotic alloy") and _match(subs):
            return factor, label

    # (2) corrosive-fluid service → corrosion-resistant default (HDPE water / 316L oxidiser),
    #     overriding the carbon-vs-stainless substring guess.
    corr = corrosive_service_material(material_context)
    if corr is not None:
        return corr

    # (3) a stated stainless (or any remaining table entry), then (4) carbon steel.
    for subs, factor, label in PIPE_MATERIAL_FACTORS:
        if _match(subs):
            return factor, label
    return 1.0, "carbon steel"


def _dn_label_from_spec(spec: dict) -> Optional[str]:
    """Best-effort DN label for a pipe spec (the size_label is the DN for pipes;
    a compatibility/nominal edge already carries 'DN25 (nominal)')."""
    lbl = spec.get("size_label") or ""
    import re as _re
    m = _re.search(r"(DN\d+)", lbl)
    return m.group(1) if m else None


def _duct_sides_from_spec(spec: dict) -> Optional[int]:
    """The larger duct side [mm] from a '600×400 duct' label (priced by the
    larger side band)."""
    lbl = spec.get("size_label") or ""
    import re as _re
    m = _re.search(r"(\d+)\s*[×x]\s*(\d+)", lbl)
    if not m:
        return None
    return max(int(m.group(1)), int(m.group(2)))


def connection_cost(spec: dict,
                    conductors_per_run: Optional[int] = None,
                    ends_per_run: int = DEFAULT_ENDS_PER_RUN) -> dict:
    """Price ONE sized ConnectionSpec from the documented supply+install ladders.

    PURE. Returns a cost dict:
      { unit_cost_gbp, qty, install_gbp, termination_gbp, line_total_gbp,
        cost_source, cost_basis }
    where:
      * unit_cost_gbp  = the per-metre rate actually used (£/m), AFTER the
        per-conductor × n_parallel × n_cores expansion for a cable (so a reader
        can multiply unit_cost_gbp × length and reproduce the material line);
      * qty            = the run length [m] (the BoM quantity for the metre-rate);
      * install_gbp    = the material+install metre cost = unit_cost_gbp × length;
      * termination_gbp= the per-end glands/lugs/flanges × ends_per_run;
      * line_total_gbp = install_gbp + termination_gbp (the run's all-in £);
      * cost_source    = COST_SOURCE_MODEL (disclosed as a MODEL, not engine data);
      * cost_basis     = a short human string naming the rate + multipliers used.

    The metre-rate splits material+labour-to-lay (install_gbp) from the connection
    hardware (termination_gbp) so the dossier can show both. NOTHING here is
    engine/distributor data — see the COST MODEL header for the basis.

    Args:
      conductors_per_run: cores per cable run (default 1 — the sizer reports a
        per-conductor CSA). Set to 5 for a 3-phase+N+earth feeder, etc.
      ends_per_run: terminations to count (default 2 — both ends of the run)."""
    kind = spec.get("kind")
    L = max(0.0, _f(spec.get("length_m")))
    n_par = max(1, int(_f(spec.get("n_parallel"), 1) or 1))
    n_cores = max(1, int(conductors_per_run)) if conductors_per_run else 1
    ends = max(0, int(ends_per_run))

    def _result(unit_rate, install, term, basis):
        return {
            "unit_cost_gbp": round(unit_rate, 2),
            "qty": round(L, 2),
            "install_gbp": round(install, 2),
            "termination_gbp": round(term, 2),
            "line_total_gbp": round(install + term, 2),
            "cost_source": COST_SOURCE_MODEL,
            "cost_basis": basis,
        }

    mech = spec.get("mechanism")

    # ---- TRANSFORMER / SUB-DISTRIBUTION (a packaged step-down unit, NOT a metre-run)
    #      — priced by kVA (the same £/kVA the schedule's tree-transformer row uses).
    #      A D2-actuation sub-distribution arrives as a standalone kind='transformer'
    #      spec in _CONN_SPECS; price it here so it isn't dropped to the £/m fallback.
    if kind == "transformer":
        kva = _f(spec.get("transformer_kva") or spec.get("carried_rating"))
        install = kva * TRANSFORMER_GBP_PER_KVA
        basis = (f"transformer £{TRANSFORMER_GBP_PER_KVA:g}/kVA × {kva:g} kVA installed "
                 f"(pad-mount step-down + connection + commissioning)")
        # unit_cost_gbp carries the £/kVA rate; qty stays the (zero) run length.
        return {
            "unit_cost_gbp": TRANSFORMER_GBP_PER_KVA, "qty": round(L, 2),
            "install_gbp": round(install, 2), "termination_gbp": 0.0,
            "line_total_gbp": round(install, 2),
            "cost_source": COST_SOURCE_MODEL, "cost_basis": basis,
        }

    # ---- DATA / CONTROL / FIBRE bundle (thin, fixed) — by MECHANISM first, so a
    #      signal lead that the sizer labelled kind='cable' still gets the flat
    #      bundle rate (NOT the power-cable CSA ladder).
    if kind == "fibre" or mech in ("data", "control", "optical"):
        unit_rate = SIGNAL_BUNDLE_GBP_PER_M
        install = unit_rate * L
        term = SIGNAL_TERMINATION_GBP * ends
        basis = (f"signal bundle £{SIGNAL_BUNDLE_GBP_PER_M:g}/m + "
                 f"£{SIGNAL_TERMINATION_GBP:g}/connector × {ends} ends")
        return _result(unit_rate, install, term, basis)

    # ---- CABLE: per-conductor £/m × length × n_parallel × n_cores ----
    if kind == "cable":
        csa = _parse_csa_from_label(spec.get("size_label")) or _f(spec.get("csa_mm2"))
        per_m_1c, ladder_csa = _ladder_cost_for_csa(csa, CABLE_COST_GBP_PER_M_BY_CSA)
        conductors = n_par * n_cores
        unit_rate = per_m_1c * conductors           # effective £/m for the whole run
        install = unit_rate * L
        term_1, _tcsa = _ladder_cost_for_csa(csa, TERMINATION_GBP_ELEC_BY_CSA)
        # each end terminates every parallel conductor of every core.
        term = term_1 * conductors * ends
        basis = (f"cable £{per_m_1c:g}/m·conductor @ {ladder_csa:g} mm² × "
                 f"{conductors} conductor(s) ({n_par}∥×{n_cores} core) + "
                 f"£{term_1:g}/end-lug × {ends} ends")
        return _result(unit_rate, install, term, basis)

    # ---- BUSBAR: priced by copper MASS (not the cable ladder) ----
    if kind == "busbar":
        csa = _parse_csa_from_label(spec.get("size_label")) or _f(spec.get("csa_mm2"))
        # copper mass = CSA[m²] × length[m] × ρ_Cu; £ = mass × £/kg.
        mass_kg = (max(0.0, csa) * 1e-6) * L * RHO_CU
        install = mass_kg * BUSBAR_GBP_PER_KG
        unit_rate = install / L if L > 0 else 0.0
        # busbar terminations: bolted joints/risers — price at the top elec lug.
        term_1 = TERMINATION_GBP_ELEC_BY_CSA[400]
        term = term_1 * ends
        basis = (f"busbar {csa:.0f} mm² Cu → {mass_kg:.1f} kg × £{BUSBAR_GBP_PER_KG:g}/kg "
                 f"installed + £{term_1:g}/end joint × {ends} ends")
        return _result(unit_rate, install, term, basis)

    # ---- PIPE (incl. steam/gas — the pipe is the pipe): £/m by DN × material ----
    if kind == "pipe":
        dn = _dn_label_from_spec(spec)
        per_m = PIPE_COST_GBP_PER_M_BY_DN.get(dn) if dn else None
        if per_m is None:
            per_m = PIPE_COST_GBP_PER_M_BY_DN["DN50"]   # neutral mid fallback
            dn = dn or "DN50?"
        mat_factor, mat_label = _pipe_material_factor(spec.get("material_context")
                                                      or _spec_material_ctx(spec))
        unit_rate = per_m * mat_factor
        install = unit_rate * L
        term_1 = (TERMINATION_GBP_FLUID_BY_DN.get(dn)
                  or TERMINATION_GBP_FLUID_BY_DN["DN50"]) * mat_factor
        term = term_1 * ends
        basis = (f"pipe £{per_m:g}/m @ {dn} × {mat_factor:g} ({mat_label}) + "
                 f"£{term_1:.0f}/flanged-end × {ends} ends")
        return _result(unit_rate, install, term, basis)

    # ---- DUCT: £/m by the larger standard side ----
    if kind == "duct":
        side = _duct_sides_from_spec(spec)
        if side is not None:
            # nearest standard duct side >= the larger side.
            chosen = next((s for s in DUCT_SIZE_LADDER if s >= side), DUCT_SIZE_LADDER[-1])
        else:
            chosen = 400
        per_m = DUCT_COST_GBP_PER_M_BY_SIDE.get(chosen, DUCT_COST_GBP_PER_M_BY_SIDE[400])
        unit_rate = per_m
        install = unit_rate * L
        term = TERMINATION_GBP_DUCT * ends
        basis = (f"duct £{per_m:g}/m @ {chosen} mm side + "
                 f"£{TERMINATION_GBP_DUCT:g}/connector × {ends} ends")
        return _result(unit_rate, install, term, basis)

    # (data/control/optical handled at the top, by mechanism.)

    # ---- MECHANICAL member / structural tie ----
    if kind == "member" or mech == "mechanical":
        unit_rate = MEMBER_GBP_PER_M
        install = unit_rate * L
        term = MEMBER_TERMINATION_GBP * ends
        basis = (f"steel tie £{MEMBER_GBP_PER_M:g}/m + "
                 f"£{MEMBER_TERMINATION_GBP:g}/end × {ends} ends")
        return _result(unit_rate, install, term, basis)

    # ---- UNKNOWN / unsized: a documented neutral per-metre fallback ----
    unit_rate = FALLBACK_GBP_PER_M
    install = unit_rate * L
    term = 0.0
    basis = (f"unsized/{kind} run — neutral £{FALLBACK_GBP_PER_M:g}/m allowance "
             f"(no rating to price hardware from)")
    return _result(unit_rate, install, term, basis)


def _spec_material_ctx(spec: dict) -> Optional[str]:
    """material_context isn't stamped on the spec by size_*; reconstruct a hint
    for pipe-material from the recorded phase + assumptions so stainless/exotic
    process lines lift off the carbon-steel base rate even post-sizing."""
    parts = []
    for a in (spec.get("assumptions") or []):
        if isinstance(a, str):
            parts.append(a)
    n = spec.get("notes")
    if isinstance(n, str):
        parts.append(n)
    return " ".join(parts) if parts else None


# ---------------------------------------------------------------------------
# 8. PUBLIC: connection_schedule
# ---------------------------------------------------------------------------

def connection_schedule(specs: list[dict]) -> list[dict]:
    """Flatten a list of ConnectionSpecs (or tree results) into BoM-feedback
    rows: mechanism, from, to, rating, length, size, drop, qty.

    Accepts a mix of plain ConnectionSpec dicts and size_distribution_tree
    results ({'trunk':..., 'branches':[...]}); trees are expanded in place."""
    rows: list[dict] = []

    def _emit(spec: dict, role: Optional[str] = None) -> None:
        rating = spec.get("carried_rating")
        unit = spec.get("carried_unit") or ""
        drop = spec.get("drop_pct_or_velocity")
        kind = spec.get("kind")
        # express the drop value with its meaning
        if drop is None:
            drop_str = "—"
        elif kind in ("cable", "busbar"):
            drop_str = f"{drop:g}% Vd"
        elif kind in ("pipe", "duct"):
            drop_str = f"{drop:g} m/s"
        else:
            drop_str = f"{drop:g}"
        # COST — price the run from the documented supply+install ladders. PURE;
        # the row carries the per-metre rate, the install £, the termination £,
        # the all-in line total and the cost_source so the dossier discloses it.
        c = connection_cost(spec)
        rows.append({
            "mechanism": spec.get("mechanism"),
            "from": spec.get("from_part"),
            "to": spec.get("to_part"),
            "rating": (f"{rating:g} {unit}".strip() if rating is not None else "—"),
            "length_m": spec.get("length_m"),
            "size": spec.get("size_label"),
            "outer_dia_mm": spec.get("outer_dia_mm"),
            "drop": drop_str,
            "within_spec": spec.get("within_spec"),
            "qty": spec.get("material_qty_desc"),
            "role": role or spec.get("role"),
            # --- COST (model:uk-2026-supply+install) ---
            "unit_cost_gbp": c["unit_cost_gbp"],
            "install_gbp": c["install_gbp"],
            "termination_gbp": c["termination_gbp"],
            "line_total_gbp": c["line_total_gbp"],
            "cost_source": c["cost_source"],
            "cost_basis": c["cost_basis"],
            # Phase-D surface (uniform shape; None/False when nothing fired).
            "upsized": bool(spec.get("upsized")),
            "original_size": spec.get("original_size_label"),
            "upsize_iterations": spec.get("upsize_iterations") or 0,
            "design_recommendation": spec.get("design_recommendation"),
        })

    for item in specs:
        if isinstance(item, dict) and "trunk" in item and "branches" in item:
            _emit(item["trunk"], role="trunk")
            if item.get("transformer"):
                t = item["transformer"]
                # A step-down transformer is a packaged unit, not a metre-run —
                # price it by kVA (UK-2026 distribution-transformer installed
                # rate ~£28/kVA: oil-filled pad-mount + connection + commissioning).
                kva = _f(t.get("transformer_kva"))
                xfmr_total = round(kva * TRANSFORMER_GBP_PER_KVA, 2)
                rows.append({
                    "mechanism": "electrical_bus",
                    "from": "(primary)", "to": "(secondary)",
                    "rating": f"{t.get('transformer_kva'):g} kVA",
                    "length_m": None,
                    "size": f"{t.get('primary_voltage_v'):g}/{t.get('secondary_voltage_v'):g} V transformer",
                    "outer_dia_mm": None,
                    "drop": f"{t.get('primary_current_a'):g}→{t.get('secondary_current_a'):g} A",
                    "within_spec": True,
                    "qty": t.get("note"),
                    "role": "transformer",
                    "unit_cost_gbp": TRANSFORMER_GBP_PER_KVA,
                    "install_gbp": xfmr_total,
                    "termination_gbp": 0.0,
                    "line_total_gbp": xfmr_total,
                    "cost_source": COST_SOURCE_MODEL,
                    "cost_basis": f"transformer £{TRANSFORMER_GBP_PER_KVA:g}/kVA × {kva:g} kVA installed",
                    "upsized": False,
                    "original_size": None,
                    "upsize_iterations": 0,
                    "design_recommendation": None,
                })
            for b in item["branches"]:
                _emit(b, role="branch")
        else:
            _emit(item)
    return rows


# ---------------------------------------------------------------------------
# 8b. PUBLIC: connection_schedule_costed  — the COSTED schedule + a totals block.
# ---------------------------------------------------------------------------

def _cost_bucket_for_row(row: dict) -> str:
    """Which cost-total bucket a costed row falls in (cable / pipe / duct /
    transformer / other). Used to roll the per-run line totals into totals."""
    role = row.get("role")
    if role == "transformer":
        return "transformer"
    size = (row.get("size") or "")
    mech = (row.get("mechanism") or "")
    if "mm²" in size or "Cu bar" in size or mech == "electrical_bus":
        return "cable"
    if size.startswith("DN") or "(nominal)" in size:
        return "pipe"
    if "duct" in size.lower():
        return "duct"
    return "other"


def connection_schedule_costed(specs: list[dict]) -> dict:
    """The COSTED schedule: every row from connection_schedule (now carrying its
    cost fields) PLUS a `totals` block that splits the all-in £ by category and a
    grand total. PURE.

    Returns:
      { 'rows': [...costed rows...],
        'totals': { 'cable_gbp', 'pipe_gbp', 'duct_gbp', 'transformer_gbp',
                    'other_gbp', 'terminations_gbp', 'install_gbp',
                    'grand_total_gbp', 'cost_source' } }

    `terminations_gbp` is the sum of every row's termination hardware (glands /
    lugs / flanges / connectors); `install_gbp` is the sum of every row's
    material+labour metre cost; grand_total = install + terminations =
    Σ line_total_gbp. The per-category buckets (cable/pipe/duct/…) are the FULL
    line totals (metre + terminations) so they add up to the grand total."""
    rows = connection_schedule(specs)
    cat_total = {"cable": 0.0, "pipe": 0.0, "duct": 0.0,
                 "transformer": 0.0, "other": 0.0}
    term_total = 0.0
    install_total = 0.0
    for r in rows:
        bucket = _cost_bucket_for_row(r)
        cat_total[bucket] += _f(r.get("line_total_gbp"))
        term_total += _f(r.get("termination_gbp"))
        install_total += _f(r.get("install_gbp"))
    grand = sum(cat_total.values())
    totals = {
        "cable_gbp": round(cat_total["cable"], 2),
        "pipe_gbp": round(cat_total["pipe"], 2),
        "duct_gbp": round(cat_total["duct"], 2),
        "transformer_gbp": round(cat_total["transformer"], 2),
        "other_gbp": round(cat_total["other"], 2),
        "terminations_gbp": round(term_total, 2),
        "install_gbp": round(install_total, 2),
        "grand_total_gbp": round(grand, 2),
        "cost_source": COST_SOURCE_MODEL,
    }
    return {"rows": rows, "totals": totals}


# ---------------------------------------------------------------------------
# 8c. PUBLIC: merge_distribution_bom  — the dossier CONSUMPTION HOOK.
# ---------------------------------------------------------------------------

def merge_distribution_bom(dossier_bom_rows: list[dict],
                           schedule: dict,
                           module_name: str = "Distribution & cabling",
                           group_by_mechanism: bool = True) -> list[dict]:
    """Append the costed distribution runs to an existing dossier BoM as a new
    'Distribution & cabling' section, matching a typical dossier BoM row shape:

        { name, qty, unit, unit_price_gbp, line_total_gbp, module }

    THE HOOK a dossier calls to actually PRINT the cabling/piping/ductwork the
    BoM has historically omitted. PURE — returns a NEW list (input untouched).

    Args:
      dossier_bom_rows: the dossier's existing BoM rows (any shape; passed through
        unchanged — we only APPEND).
      schedule: either a connection_schedule_costed() result ({rows, totals}) OR a
        write_connection_schedule() dict (it carries `rows` + cost totals too) OR a
        raw list of costed rows.
      module_name: the BoM section label for the appended rows.
      group_by_mechanism: True → one BoM line per (mechanism, size) group with the
        runs summed (the readable dossier shape: '12 × 240 mm² DC bus cable runs');
        False → one BoM line per individual run.

    Returns the merged list: [*dossier_bom_rows, *distribution_rows]. When
    group_by_mechanism, a final 'Terminations & connection hardware' line and the
    section total are folded into the per-group lines (each group line's
    line_total includes its share of terminations), so Σ(appended line_total) ==
    the schedule grand total."""
    # Normalise the schedule arg → a list of costed rows.
    if isinstance(schedule, dict):
        rows = schedule.get("rows") or []
    elif isinstance(schedule, list):
        rows = schedule
    else:
        rows = []

    out = list(dossier_bom_rows or [])
    if not rows:
        return out

    if not group_by_mechanism:
        for r in rows:
            mech = r.get("mechanism") or "distribution"
            size = r.get("size") or "(unsized)"
            frm = r.get("from") or "?"
            to = r.get("to") or "?"
            out.append({
                "name": f"{mech} run {frm}→{to} — {size}",
                "qty": 1,
                "unit": "run",
                "unit_price_gbp": round(_f(r.get("line_total_gbp")), 2),
                "line_total_gbp": round(_f(r.get("line_total_gbp")), 2),
                "module": module_name,
            })
        return out

    # GROUPED: collapse runs sharing (mechanism, size) into one BoM line, summing
    # the run lengths + the all-in line totals (metre cost + terminations).
    groups: dict[tuple, dict] = {}
    order: list[tuple] = []
    for r in rows:
        mech = r.get("mechanism") or "distribution"
        size = r.get("size") or "(unsized)"
        key = (mech, size)
        if key not in groups:
            groups[key] = {"mech": mech, "size": size, "n_runs": 0,
                           "length_m": 0.0, "line_total_gbp": 0.0,
                           "cost_source": r.get("cost_source") or COST_SOURCE_MODEL}
            order.append(key)
        g = groups[key]
        g["n_runs"] += 1
        g["length_m"] += _f(r.get("length_m"))
        g["line_total_gbp"] += _f(r.get("line_total_gbp"))

    for key in order:
        g = groups[key]
        is_metre = g["length_m"] > 0
        # BoM quantity = total metres for a metre-run; else a count of units.
        if is_metre:
            qty = round(g["length_m"], 1)
            unit = "m"
            unit_price = round(g["line_total_gbp"] / g["length_m"], 2) if g["length_m"] else 0.0
            name = f"{g['mech']} — {g['size']} ({g['n_runs']} run{'s' if g['n_runs'] != 1 else ''})"
        else:
            qty = g["n_runs"]
            unit = "unit"
            unit_price = round(g["line_total_gbp"] / max(1, g["n_runs"]), 2)
            name = f"{g['mech']} — {g['size']}"
        out.append({
            "name": name,
            "qty": qty,
            "unit": unit,
            "unit_price_gbp": unit_price,
            "line_total_gbp": round(g["line_total_gbp"], 2),
            "module": module_name,
        })
    return out


# ---------------------------------------------------------------------------
# 9. CLI smoke (optional): `python connection_sizing.py` sizes the 3 canonical
#    edges and prints the schedule. Not the test — that's connection_sizing_test.py.
# ---------------------------------------------------------------------------

def _demo() -> None:
    bess_dc = {"from_part": "battery_string", "to_part": "dc_bus",
               "mechanism": "electrical_bus", "constraint_kind": "current_rating",
               "required_value": 1250.0, "required_unit": "A",
               "required_margin_factor": 1.25, "material_context": "1500 V DC bus"}
    vf_drip = {"from_part": "pump", "to_part": "manifold",
               "mechanism": "fluid_loop", "constraint_kind": "flow_capacity",
               "required_value": 13.33, "required_unit": "L/min",
               "material_context": "nutrient water"}
    efuel_thermal = {"from_part": "reactor", "to_part": "cooler",
                     "mechanism": "thermal", "constraint_kind": "thermal_rejection",
                     "required_value": 677.0, "required_unit": "kW",
                     "required_margin_factor": 1.15,
                     "material_context": "water/glycol coolant"}
    specs = [
        size_connection_to_spec(bess_dc, 12.0),
        size_connection_to_spec(vf_drip, 8.0),
        size_connection_to_spec(efuel_thermal, 20.0),
    ]
    costed = connection_schedule_costed(specs)
    for r in costed["rows"]:
        print(json.dumps(r, ensure_ascii=False))
    print("# totals:", json.dumps(costed["totals"], ensure_ascii=False))
    # CONSUMPTION HOOK demo — append to a sample dossier BoM.
    sample_bom = [{"name": "Battery rack", "qty": 16, "unit": "unit",
                   "unit_price_gbp": 42000.0, "line_total_gbp": 672000.0,
                   "module": "Energy storage"}]
    merged = merge_distribution_bom(sample_bom, costed)
    print(f"# merged BoM: {len(sample_bom)} → {len(merged)} rows "
          f"(+{len(merged) - len(sample_bom)} distribution lines)")
    for r in merged[len(sample_bom):]:
        print("#   +", json.dumps(r, ensure_ascii=False))

    # PHASE D demo — a 48 V LV bus far from its load: D1 upsizes the fixable case,
    # D2 recommends a re-design when the reach is excessive.
    print("\n# Phase D — iterative feedback:")
    lv = {"from_part": "pack", "to_part": "load", "mechanism": "electrical_bus",
          "constraint_kind": "current_rating", "required_value": 600.0,
          "required_unit": "A", "material_context": "48 V DC bus"}
    for L in (60.0, 250.0):
        s = size_connection_to_spec(dict(lv), L)
        tag = ("D1 upsize" if s["upsized"] and not s["design_recommendation"]
               else "D2 recommend" if s["design_recommendation"] else "in-spec")
        print(f"#  {L:>5.0f} m  [{tag}]  {s['original_size_label'] or s['size_label']}"
              f" -> {s['final_size_label']}  vd={s['drop_pct_or_velocity']}%"
              f"  spec={s['within_spec']}")
        if s["design_recommendation"]:
            print(f"#     {s['design_recommendation']}")


if __name__ == "__main__":
    _demo()
