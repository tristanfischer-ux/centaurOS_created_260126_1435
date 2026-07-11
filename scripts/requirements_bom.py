#!/usr/bin/env python3
"""requirements_bom.py — the REQUIREMENTS-DRIVEN bill of materials (Tristan 2026-06-13).

The dossier's BoM value is the REQUIREMENT (what each item must DO), not the product.
Each line is three things:
  1. REQUIREMENT  — the computed engineering spec: duty (physics) + size + connections
                    (Blender-measured) + material/standard (rules). The durable IP an EPC
                    tenders against.
  2. FULFILMENT   — IDENTIFIED (a real catalogue part, verified to meet the duty) |
                    BESPOKE (made-to-spec — tanks/vessels/fabricated steel, never off-shelf) |
                    NOT FOUND (requirement stated, no catalogue match yet).
  3. COST + BASIS — catalogue quote | materials take-off (mass × rate) | bottom-up parametric.

Universal, deterministic, archetype-agnostic. Reads the chain state + the Blender route-
manifest + parts-manifest from a run dir; returns the rows. A preview consumer (round-
evidence.py) renders them; the dossier renderer will consume the same structure.
"""
from __future__ import annotations
import json, math, os, re, sys

# SHARED canonical-tag authority (scripts/blender-universal/canonical_tags.py): the
# SINGLE source for synthesised-auxiliary tags, so an instrument / actuator / utility
# carries ONE name in this bill-of-materials AND in the drawing schedules. Guarded so
# `--selftest` (and any environment without the blender-universal dir importable) still
# runs — when absent, the auxiliary rows fall back to the legacy bare ISA letter.
try:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender-universal"))
    import canonical_tags  # type: ignore
except Exception:           # pragma: no cover  (defensive — keeps --selftest standalone)
    canonical_tags = None   # type: ignore

# SHARED phase authority (scripts/blender-universal/connection_sizing.py): the SAME
# liquid/gas/steam classifier the universal Blender connection-sizer uses, so the
# bill-of-materials sizes a fluid edge by its PHYSICAL phase rather than assuming
# every non-cable/non-duct edge is a water main. A genuine gas / vapour / steam tie
# (CO₂ / H₂ / syngas / amine-stripper overhead) is sized small-bore at a high gas
# velocity, NOT on the bulk-water-main model; only a true LIQUID edge keeps the
# HDPE/316L water model. Guarded so --selftest stays standalone when the
# blender-universal dir is not importable (falls back to the volumetric/mass-flow
# heuristic in _edge_phase below).
try:
    from connection_sizing import _detect_phase as _cs_detect_phase  # type: ignore
except Exception:           # pragma: no cover  (defensive — keeps --selftest standalone)
    _cs_detect_phase = None  # type: ignore

# Materials take-off rates — UK 2026 fabricated supply (ex-works, not installed).
# Sources: SGS Engineering, Enduramaxx, process-vessel fabricator quotes, CECA data.
#   FRP/GRP laminate fabricated (winding/hand lay-up + QC, ex-works): £8–14/kg; mid = £12/kg
#   Carbon steel fabricated vessel (plate purchase + cutting/rolling/welding): £3–6/kg; mid = £4.5/kg
#   316L stainless fabricated (SS plate + orbital welding + pickling): £12–18/kg; mid = £14/kg
#   Reinforced concrete: £0.45/kg (plant-mixed, formed in situ — rate is already installed)
# These are SUPPLY costs; site erection is added separately via _install_factor().
STEEL_RHO, FRP_RHO = 7850.0, 1850.0          # kg/m³
STEEL_RATE, FRP_RATE = 4.5, 12.0             # £/kg fabricated supply, ex-works

# SIMPLE bespoke = shell-dominated fabrications (a materials take-off — mass of steel/
# FRP — is the right cost basis: the price IS mostly the shell).
_BESPOKE_RE = re.compile(r"tank|vessel|reservoir|basin|sump|biofilter|degass|"
                         r"clarifier|skimmer|hopper|silo|frame|enclosure|structure|duct", re.I)
# STRONG bespoke = complex fabricated PROCESS vessels. NEVER a catalogue purchase — even
# when the emitter pinned a part_number (that 'PN' is a fabricator / licensor drawing
# reference, not a buyable SKU). Their cost is dominated by INTERNALS / catalyst /
# heat-exchange / engineering, NOT the shell steel — so a shell materials take-off would
# wildly undercount them; the honest basis is the process engineering budget estimate.
# 'contactor' is a NOUN COLLISION (2026-07-10, Powerwall 'Main DC Contactor · 51 A'
# priced via the process-vessel budget path and flagged for missing MATERIAL): a
# gas-liquid CONTACTOR column is strong-bespoke; an ELECTRICAL contactor (dc/ac/main/
# motor/line/power/pack qualifier, or an A-rating) is a catalogue switching device.
_STRONG_BESPOKE_RE = re.compile(r"reactor|distillation|fractionation|\bcolumn\b|\btower\b|"
                                r"absorber|stripper|scrubber|"
                                r"(?<!dc )(?<!ac )(?<!main )(?<!motor )(?<!line )(?<!power )(?<!pack )contactor|"
                                r"crystalli|calciner|"
                                r"\bkiln\b|digester|ferment|bioreactor|electroly", re.I)
_TBD_RE = re.compile(r"tbd|detailed design|specify|^$", re.I)


def _num(s):
    m = re.search(r"-?\d+(?:\.\d+)?", str(s or ""))
    return float(m.group(0)) if m else None


def _mods(w):
    """Flatten modifier_characters to {kind: value} — PLUS `<kind>_unit` keys when the
    modifier carries a separate `unit` field (2026-07-02, the flow-read-as-kW source fix):
    the emitter authors e.g. {kind: rating_primary, value: "90", unit: "m³/h"} and the old
    flat map DROPPED the unit, so `_rating_kw` saw a bare "90" and priced the 90 m³/h
    Irrigation Pump as 90 kW × £700/kW = £63k (its real motor is 15 kW). Additive — the
    value strings are unchanged, so every existing consumer (incl. BESS byte-identity)
    reads exactly what it read before; unit-aware consumers now ALSO see the unit."""
    out = {}
    for m in (w.get("modifier_characters") or []):
        kind = m.get("kind")
        out[kind] = m.get("value")
        u = m.get("unit")
        if kind and u not in (None, ""):
            out[f"{kind}_unit"] = u
    return out


def _cyl_from_dim(dim):
    """(dia_m, h_m) from a '<d> m dia x <h> m' string, else None."""
    m = re.search(r"([\d.]+)\s*m\s*dia[^x]*x\s*([\d.]+)\s*m", str(dim or ""), re.I)
    return (float(m.group(1)), float(m.group(2))) if m else None


def _box_from_dim(dim):
    """(w,d,h) in m from a '<w>x<d>x<h> mm' string, else None."""
    m = re.search(r"([\d.]+)x([\d.]+)x([\d.]+)\s*mm", str(dim or ""), re.I)
    return (float(m.group(1)) / 1000, float(m.group(2)) / 1000, float(m.group(3)) / 1000) if m else None


# ── WETTED-PARTS CORROSION (Tristan 2026-06-23) ─────────────────────────────────────────
# A plant handling a CORROSIVE fluid (seawater / brackish / saline / chlorinated / ozonated)
# must specify corrosion-resistant wetted materials — carbon steel / cast iron corrode fast in
# marine service. Detect the plant fluid corrosivity ONCE from the plant's PROCESS-FLUID DUTY
# context (brief + contract duty fields — see _fluid_context_blob), then (a) _material upgrades
# a wetted steel shell to 316L, and (b) every wetted catalogue part carries an explicit material
# of construction. Universal — keyed on the FLUID, never a product class. Freshwater /
# non-corrosive plants are untouched; a POTABLE-water plant gets a WRAS-appropriate MoC
# (not a corrosion upgrade).
_PLANT_CORROSIVE = False
_PLANT_MOC = ""
_PLANT_CORROSION = ""


def _fluid_context_blob(state) -> str:
    """The plant's PROCESS-FLUID duty context — the brief + the engineering contract's DUTY
    fields ONLY, never the whole state blob. The whole-blob scan mis-classified a PVC potable
    plant as marine (v54, 2026-07-02): 'seawater' matched a tool registry URL
    ('github.com/python-seawater'), a catalogue part's CAPABILITY list
    (product_ontology.key_specs.feed_water_type: '… seawater …'), and 'marine' matched the
    audit boolean NAME 'is_marine_class': false — none of which says anything about THIS
    plant's fluid. It is also self-reinforcing: the cached requirementsBom carries the previous
    run's 'MoC: … (seawater)' strings, so a single false positive re-matches forever. The duty
    statement lives in the brief + the contract's brief_summary/quantities — scan those only."""
    ec = state.get("engineeringContract") if isinstance(state, dict) else None
    ec = ec if isinstance(ec, dict) else {}
    parts = [state.get("brief") if isinstance(state, dict) else None,
             state.get("parsedBrief") if isinstance(state, dict) else None,
             state.get("briefOverviewProse") if isinstance(state, dict) else None,
             ec.get("brief_summary"), ec.get("quantities")]
    try:
        return json.dumps(parts, default=str).lower()
    except Exception:
        return str(parts).lower()


def _set_plant_corrosivity(state):
    global _PLANT_CORROSIVE, _PLANT_MOC, _PLANT_CORROSION
    blob = _fluid_context_blob(state)
    if re.search(r"seawater|sea water|\bmarine\b|brackish|\bsaline\b|salinity|maricultur", blob):
        _PLANT_CORROSIVE, _PLANT_MOC, _PLANT_CORROSION = (
            True, "316L stainless / bronze (seawater)", "seawater/marine chloride service")
    elif re.search(r"chlorinat|hypochlor|ozonat|\bozone\b|peracetic|caustic|acidic|low\s*ph", blob):
        _PLANT_CORROSIVE, _PLANT_MOC, _PLANT_CORROSION = (
            True, "316L stainless / PVC-U (chemical)", "chlorinated/chemical service")
    elif re.search(r"potable|drinking\s*water|\bwras\b", blob):
        # POTABLE service: not a corrosion problem (no 316L shell upgrade) but wetted parts
        # still carry the right MoC — WRAS-appropriate polymer / stainless contact materials.
        _PLANT_CORROSIVE, _PLANT_MOC, _PLANT_CORROSION = (
            False, "PVC-U / 304 stainless (WRAS)", "potable-water service (WRAS-approved wetted materials)")
    elif re.search(
        r"fertigat|nutrient|irrigation|hydropon|\bro\b|reverse\s*osmosis|"
        r"process\s*water|recirculat|drain\s*water|cultivat",
        blob,
    ):
        # INTENT: fertigation / irrigation / RO process-water plants are not seawater
        # and not "potable" by name, but every wetted fabricated header/manifold/tank
        # still needs a MoC. Without this branch `_wetted_moc` returned "" and the
        # BoM ledger FAILed fabricated Distribution Manifold rows for missing material
        # (Codema ship 2026-07-09). Noun-keyed on the FLUID context, never a class slug.
        _PLANT_CORROSIVE, _PLANT_MOC, _PLANT_CORROSION = (
            False, "PVC-U / 304 stainless (WRAS)",
            "process/irrigation water service (WRAS-appropriate wetted materials)")
    else:
        _PLANT_CORROSIVE, _PLANT_MOC, _PLANT_CORROSION = (False, "", "")


_WETTED_NOUN = re.compile(
    r"pump|valve|pipe|pipework|manifold|heat\s*exchang|\bhex\b|filter|strainer|\btank\b|vessel|"
    r"column|degas|skimmer|sump|basin|reservoir|clarifier|drum|steril|\buv\b|biofilter|reactor|"
    r"nozzle|diffuser|header|spool|screen|weir|scrubber", re.I)
_NONWETTED_NOUN = re.compile(
    r"motor|drive|\bvsd\b|cabinet|panel|busbar|cable|switch|transformer|generator|\bups\b|frame|"
    r"structur|building|\bduct\b|\bfan\b|blower|\bahu\b|hvac|controller|\bplc\b|gauge|light|ladder|"
    r"platform|walkway|sign|sensor|monitor|alarm|button|interlock|relay|probe", re.I)


# A part whose NAME/requirement already DECLARES its material of construction keeps it —
# the plant-level MoC default must never override a part's own stated material (a 'DN50 PVC
# Pipe' is PVC, full stop — v54 stamped it '316L stainless / bronze (seawater)'). Ordered:
# first match wins; patterns are word-bounded so tag fragments never false-match.
_OWN_MATERIAL_PATTERNS = [
    (re.compile(r"\bu?pvc\b|pvc-?[uc]\b|\bcpvc\b", re.I), "PVC-U"),
    (re.compile(r"\bhdpe\b|\bmdpe\b|polyethylene|\bpe100\b|\bpe80\b", re.I), "HDPE"),
    (re.compile(r"\bpp\b(?!-)|polypropylen", re.I), "polypropylene"),
    (re.compile(r"\babs\b", re.I), "ABS"),
    (re.compile(r"\bfrp\b|\bgrp\b|fibreglass|fiberglass", re.I), "FRP/GRP"),
    (re.compile(r"\b316l?\b", re.I), "316L stainless"),
    (re.compile(r"\b304l?\b", re.I), "304 stainless"),
    (re.compile(r"duplex", re.I), "duplex stainless"),
    (re.compile(r"titanium", re.I), "titanium"),
    (re.compile(r"\bbronze\b|\bbrass\b|cupro[- ]?nickel", re.I), "bronze/copper alloy"),
]


def _own_material(blob: str) -> str:
    """The material the part's own name/requirement declares, else ''."""
    for pat, label in _OWN_MATERIAL_PATTERNS:
        if pat.search(blob):
            return label
    return ""


def _wetted_moc(name, requirement):
    """The material-of-construction for a WETTED part, derived from the part's OWN
    service/material context first, then the plant fluid service — else '' (no plant MoC
    context, or a clearly non-wetted part). The part's declared material always wins over
    the plant default (universal: keyed on the part text + the FLUID, never a class)."""
    if not _PLANT_MOC:
        return ""
    blob = (str(name or "") + " " + str(requirement or "")).lower()
    if _NONWETTED_NOUN.search(blob):
        return ""
    if not _WETTED_NOUN.search(blob):
        return ""
    return _own_material(blob) or _PLANT_MOC


def _material(name, mods):
    """(label, density kg/m³, £/kg) for the take-off. From the requirement's material if
    stated, else a UNIVERSAL inference — open water/process tanks → FRP/GRP; pressure +
    process vessels → carbon (or 316L) steel; structure → steel. Works for RAS tanks AND
    CO2/SAF pressure vessels without per-class code."""
    blob = (str(mods.get("material") or "") + " " + name).lower()
    if re.search(r"frp|grp|fibreglass|polyeth|hdpe|\bpe\b|plastic|composite", blob):
        return ("FRP/GRP", FRP_RHO, FRP_RATE)
    if re.search(r"concrete|reinforced", blob):
        return ("reinforced concrete", 2400.0, 0.45)
    if re.search(r"316|stainless|\bss\b|duplex|cres", blob):
        return ("316L stainless", 8000.0, 14.0)
    if re.search(r"\btank\b|basin|reservoir|\bsump\b|pond|raceway|lagoon", blob) \
            and not re.search(r"pressure|reactor|column|stripper", blob):
        return ("FRP/GRP", FRP_RHO, FRP_RATE)                  # open (atmospheric) tank
    # CORROSIVE plant (seawater/chemical): a wetted steel shell must be 316L, not carbon steel —
    # carbon steel corrodes fast in chloride service (Tristan 2026-06-23). Universal.
    if _PLANT_CORROSIVE:
        return ("316L stainless", 8000.0, 14.0)
    return ("carbon steel", STEEL_RHO, STEEL_RATE)


def _install_factor(vol_m3: float) -> float:
    """Site-erection multiplier on the fabricated-supply shell cost.

    A vessel's installed cost = supply cost × install_factor.  The factor covers
    crane hire, riggers, site bolting/sealing, pressure-test, and (for large tanks)
    the concrete ring-beam foundation.  It is PARAMETRIC by volume only — no
    per-class or per-material table — so it generalises to any archetype.

    UK-2026 benchmarks (Costain / CECA / process-plant cost guides):
      < 5 m³   — small skid-mounted vessel, workshop-tested, fork-lift in:   1.20×
      5–50 m³  — medium vessel, small crane/telehandler, half-day erect:     1.35×
      50–500 m³ — large field-erected tank, 50–100 t crane, ring-beam,
                   multi-day labour:                                          1.55×
      ≥ 500 m³ — very large field-construction (e.g. 1 ML fish-farm ring):  1.70×

    Reinforced concrete vessels are already an in-situ unit rate so no extra
    factor is applied (caller should pass vol=0 or handle separately).
    """
    if vol_m3 < 5.0:
        return 1.20
    if vol_m3 < 50.0:
        return 1.35
    if vol_m3 < 500.0:
        return 1.55
    return 1.70


# ── TYPED SERVICE (Phase 0 — council 2026-06-17, the £42.36M Structural Frame bug) ──
# universal-contract-sizing.ts emits a TYPED `service` modifier on every synthesised
# part AT SYNTHESIS, derived from the part's DRIVER quantity (a footprint-area driver →
# structural; a m³/flow driver → fluid_vessel; a kW driver → rotating_electrical). The
# cost characteriser reads THIS typed field to decide the fabrication kind — it must
# NEVER re-infer the fabrication branch from the part's noun (that noun-regex is exactly
# what mis-priced a footprint-driven "Structural Frame" as a 57,000 m³ closed pressure
# vessel → £42.36M). The legacy noun-heuristic survives ONLY as the fallback when a part
# carries no typed service (legacy archetypes), so nothing else moves.
_STRUCTURAL_FAMILIES = {"structural", "building_element"}
# A single fabricated pressure vessel never exceeds a few thousand m³ (the largest
# field-erected process vessels are ~3,000-5,000 m³; a 57,000 m³ "vessel" is the
# whole-plant bounding box). Above this, a closed-shell hoop-stress take-off is
# physically impossible → reject it (the plausibility invariant). A large OPEN tank
# (a 1 ML fish-farm ring) is priced by the open-tank branch, not this shell path.
_MAX_SHELL_VOL_M3 = 5000.0


def _read_service(md: dict):
    """Parse the typed `service` modifier (a JSON dict) → dict, else None. The shape is
    {fluid, phase, pressure_bar, fabrication_family, criticality} emitted by
    universal-contract-sizing.ts::serviceJson. Tolerant of an already-parsed dict."""
    if not isinstance(md, dict):
        return None
    raw = md.get("service")
    if raw is None:
        return None
    if isinstance(raw, dict):
        svc = raw
    else:
        try:
            svc = json.loads(str(raw))
        except (ValueError, TypeError):
            return None
    if not isinstance(svc, dict):
        return None
    fam = str(svc.get("fabrication_family") or "").strip().lower()
    fluid = str(svc.get("fluid") or "none").strip().lower()
    try:
        pbar = float(svc.get("pressure_bar") or 0.0)
    except (ValueError, TypeError):
        pbar = 0.0
    return {
        "fabrication_family": fam,
        "fluid": fluid,
        "pressure_bar": pbar,
        "phase": str(svc.get("phase") or "none").strip().lower(),
        "criticality": str(svc.get("criticality") or "standard").strip().lower(),
    }


# UK-2026 structural steelwork supply+erect rate (fabricated, painted, erected on a
# prepared base) — the SAME £/m² basis the synthesised "Steel Portal Frame" building
# element uses (BUILDING_ELEMENTS portal_frame = £90/m²). A bare structural FRAME /
# space-frame / support structure is priced on its plan footprint at this rate, NOT by a
# hoop-stress shell take-off. (Hot-rolled portal-frame steelwork ≈ £85-110/m² of covered
# area, UK 2026 — Costain / SCI / CECA.) Plus a modest fixed allowance for connections /
# baseplates / holding-down bolts.
_STRUCTURAL_GBP_PER_M2 = 90.0


# ── MEMBRANE / FILTRATION-MEDIA family (2026-07-02, the membrane-as-steel fix) ──
# A membrane element / membrane bank / membrane housing / filter-media line is a
# PROCESS CONSUMABLE-or-PACKAGE priced from its MEMBRANE AREA — never a structural-
# steel or hoop-stress shell take-off. v55 priced 'Ro Membrane Elements · 364 m²'
# as "structural steelwork take-off: 364 m² plan × £90/m²" = £40,760 (×3 lines with
# the UF bank + GRP housings = £122k, 16 % of the bill) — the m² is MEMBRANE area,
# not a steel plan footprint. Universal: keyed on the membrane/media noun family.
_MEMBRANE_MEDIA_RE = re.compile(
    r"\bmembranes?\b|"
    r"\b(?:ro|uf|nf|mf|edi)\s+(?:membrane|element|module|bank|housing)s?\b|"
    r"\bfilter\s+media\b|\bmedia\s+(?:bed|fill|charge)\b|"
    r"\bspiral[- ]wound\b|\bhollow[- ]fib(?:re|er)\b",
    re.I)
_MEMBRANE_GBP_PER_M2 = 25.0        # spiral-wound RO / UF module supply ≈ £15-30/m² (UK 2026)
_HOUSING_M2_PER_UNIT = 37.0        # one 8040 element ≈ 37 m² membrane area
_HOUSING_GBP_PER_UNIT = 1100.0     # 8-in GRP pressure housing, 300 psi class, supplied

# ── INTERNAL ACCESSORY FAN TRAY (2026-07-04, corpus-mismatch family, BESS
# out/bess-campaign-v2) ── a "fan tray" is an internal cooling accessory bolted
# INSIDE its parent assembly (a PCS, VSD, telecoms rack) and rated in TENS of watts
# — the "fan" corpus median is dominated by STANDALONE process/exhaust/HVAC fan
# UNITS (whole catalogue products in their own right, hundreds of watts to
# multi-kW), so a corpus lift over-bills the internal accessory ~6x (£28→£181 on a
# Sungrow PCS fan tray, n=5 median £191). An accessory can never price against a
# principal-scale corpus family sharing only the noun. Deliberately narrow to the
# "tray" form factor (a multi-fan module mounted inside another assembly) so a
# genuine standalone fan — "enclosure ventilation fan", "off-gas exhaust fan",
# both real corpus-priced lines in the same BESS bill — is UNAFFECTED; combined
# with a sub-1000 W rating check at the call site so a "tray" that happens to be
# a large standalone unit is still left to the corpus. Same family as the
# heater/actuator/membrane guards above (a same-noun corpus dominated by a bigger
# sibling class), universal — no per-class table.
_INTERNAL_FAN_TRAY_RE = re.compile(r"\bfan[\s_-]?tray\b", re.I)


def _membrane_area_price(name, md):
    """(gbp, basis) for a membrane/media line from its MEMBRANE AREA (m²), read from
    the dimension / rating_primary modifiers; None when no area driver exists (the
    caller then labels it an honest vendor-TBD with the membrane CLASS as the basis
    — never a steel take-off). Housings price per element-slot; elements/banks/media
    price per m² of membrane area. Universal — noun family + area only."""
    blob = f"{md.get('dimension') or md.get('dimensions') or ''} " \
           f"{md.get('rating_primary') or ''} {md.get('rating_primary_unit') or ''} " \
           f"{md.get('capacity') or ''} {md.get('capacity_unit') or ''}"
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*m(?:²|2)\b", blob, re.I)
    area_m2 = float(m.group(1).replace(",", "")) if m else None
    if not area_m2 or area_m2 <= 0:
        return None
    if re.search(r"housings?\b", name or "", re.I):
        n = max(1, math.ceil(area_m2 / _HOUSING_M2_PER_UNIT))
        gbp = n * _HOUSING_GBP_PER_UNIT
        return gbp, (f"membrane-housing parametric: {area_m2:,.0f} m² membrane area ÷ "
                     f"{_HOUSING_M2_PER_UNIT:.0f} m²/element → {n} × 8-in GRP pressure housing "
                     f"@ £{_HOUSING_GBP_PER_UNIT:,.0f} (UK-2026 supply; NOT a steel take-off)")
    gbp = max(1500.0, area_m2 * _MEMBRANE_GBP_PER_M2)
    return gbp, (f"membrane-area parametric: {area_m2:,.0f} m² × £{_MEMBRANE_GBP_PER_M2:.0f}/m² "
                 f"(spiral-wound/UF module supply, UK-2026; NOT a steel take-off)")


def _membrane_pin_is_real(pn: str, wid: str, curve_only: dict) -> bool:
    """MEMBRANE PIN RULE (2026-07-04, round-4 dissection fix 2). The membrane/media
    branch below used to route EVERY membrane/media row to the area-parametric price
    UNCONDITIONALLY — discarding even a genuinely pinned real MPN (e.g. a DuPont
    FilmTec BW30-400). A real catalogue pin is IDENTITY (which element this actually
    is); the membrane-area parametric is PRICE (membrane pricing genuinely scales by
    m², not a small-parts catalogue curve) — the two are orthogonal, so a real pin
    should keep its identity even though the price still comes from the area
    parametric. "Real" is judged by the SAME type-coherence discipline the bespoke-
    shell branch (`bc == "simple"`) applies to a catalogue/DB pin: a structured,
    non-TBD part number (`_is_structured_pn`) whose price was NOT derived solely from
    Engine B's generic small-parts commodity curve (`curve_only[wid]` — that curve has
    no ComponentClass for a membrane consumable, so a curve-only price is a family
    mismatch, never proof of a genuine pin). A pinless row, or a row whose only 'pin'
    is a curve-only guess, is NOT real — the caller keeps today's area-parametric
    behaviour byte-identically. proveCatch both directions in `_selftest`."""
    return bool(pn) and _is_structured_pn(pn) and not curve_only.get(wid, False)


def _structural_takeoff(name, md, geom=None):
    """Cost a STRUCTURAL part (a frame / space-frame / support structure / enclosure
    skeleton) from its PLAN FOOTPRINT at the structural-steel £/m² rate — the SAME basis
    as the synthesised Steel Portal Frame, NEVER a hoop-stress pressure-vessel shell.

    The footprint (m²) is read, in order, from: a `… m² footprint` / `… m² area`
    dimension modifier; a `rating_primary` carrying m² footprint; else (last resort) the
    plan area of the as-built Blender geometry (π·(d/2)² for a cylinder footprint, w×d for
    a box) — a FLOOR AREA, never wrapped into a pressure shell. Returns (gbp, basis,
    spec) or None when no footprint can be read. Universal, deterministic, no per-class
    table."""
    # a MEMBRANE/media line's m² is MEMBRANE area, not a steel plan footprint —
    # it may never take a structural take-off (2026-07-02 membrane-as-steel fix).
    if _MEMBRANE_MEDIA_RE.search(name or ""):
        return None
    area_m2 = None
    dim = str(md.get("dimension") or md.get("dimensions") or "")
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*m(?:²|2)\b", dim, re.I)
    if m:
        area_m2 = float(m.group(1).replace(",", ""))
    if area_m2 is None:
        rp = md.get("rating_primary")
        rpu = next((x.get("unit") for x in []), "")  # rating unit not in flat md; parse value
        rv = _num(rp)
        # a rating_primary value tagged as an m² footprint (the building/structural hook)
        if rv and re.search(r"footprint|m²|m2|area", str(md.get("rating_primary_unit") or "") + " " + dim, re.I):
            area_m2 = rv
    if area_m2 is None and geom:
        d_v, h_v = geom
        area_m2 = math.pi * (d_v / 2.0) ** 2          # PLAN footprint (a circle), not a shell
    if area_m2 is None or area_m2 <= 0:
        return None
    # CONNECTIONS ADDER FOLLOWS SCALE (2026-07-10, Powerwall run-20: four cabinet-scale
    # structural rows — 'Battery Module Rack', 'Structural Rack Frame', 'Weatherproof
    # Enclosure' — each billed the flat £8,000 BUILDING connections/baseplates/HD-bolts
    # allowance on a sub-1 m² footprint, £24k+ of phantom civils on a wall unit; two of
    # them then fed the corpus lift as 'principals'). The £8k allowance is a BUILDING
    # portal-frame constant — it applies at building scale (≥ 20 m² plan) byte-identically;
    # a device/skid-scale frame gets a proportional fixture allowance instead.
    if area_m2 >= 20.0:
        gbp = area_m2 * _STRUCTURAL_GBP_PER_M2 + 8000.0   # + connections/baseplates/HD bolts
        adder_txt = "+ £8k connections"
    else:
        fixture = max(150.0, area_m2 * 40.0)
        gbp = area_m2 * _STRUCTURAL_GBP_PER_M2 + fixture   # brackets/fasteners at device scale
        adder_txt = f"+ £{fixture:,.0f} device-scale fixtures (sub-20 m² frame — no building connections)"
    basis = (f"structural steelwork take-off: {area_m2:,.0f} m² plan × £{_STRUCTURAL_GBP_PER_M2:.0f}/m² "
             f"(UK-2026 fabricated + erected; service=structural, dry, 0 bar — NOT a pressure shell) "
             f"{adder_txt}")
    spec = {"material": "structural steel", "footprint_m2": round(area_m2)}
    return gbp, basis, spec


def _wall_physics(matlabel):
    """(allowable stress MPa, corrosion allowance mm, fabrication-minimum wall mm) for the
    hoop-stress wall, by material. UNIVERSAL — keyed off _material()'s label."""
    if "FRP" in matlabel or "GRP" in matlabel:
        return (18.0, 0.0, 6.0)
    if "concrete" in matlabel:
        return (9.0, 0.0, 120.0)
    if "316" in matlabel or "stainless" in matlabel:
        return (138.0, 0.5, 4.0)
    return (120.0, 2.0, 5.0)   # carbon steel


def _materials_takeoff(name, mods, geom=None, service=None):
    """Bespoke cost from a real materials take-off.

    Cost model (UNIVERSAL — parametric by material + physical size only):

      1. Shell area (cylinder: πDH + 2 × πD²/4; box: 6 faces)
      2. Wall thickness from hoop-stress physics: t = P·r/(σ·E) + corrosion_allowance,
         floored at the fabrication minimum for the material.
      3. Shell mass = area × wall × material density.
      4. Supply cost = mass × fabricated-supply £/kg (ex-works rate, UK 2026).
      5. Installed cost = supply × _install_factor(vessel_volume) — covers crane hire,
         riggers, site bolting/sealing, pressure test, and ring-beam foundation for
         large tanks.  Factor is 1.20–1.70× parametric on volume (no per-class table).
      6. Fittings allowance = 20% of installed cost + £1,800 fixed (nozzles, manway,
         vents, supports, anti-corrosion coating, site testing).

    `service` (the typed service descriptor, when present) gates the CLOSED
    pressure-vessel branch via the PLAUSIBILITY INVARIANT (Phase 0, council
    2026-06-17): a part may be costed as a closed PRESSURE vessel ONLY IF it has a
    fluid service AND pressure_bar>0 AND a sane vessel volume. A structural / dry /
    no-pressure part, or an impossibly large (≥ a few thousand m³) "vessel", is NOT a
    pressure shell — the hoop-stress shell take-off is rejected and the cost falls to a
    structural / parametric basis. This is what stops a footprint-driven "Structural
    Frame" being priced as a 57,000 m³ steel pressure vessel (£42.36M).

    Returns (gbp, basis_str, spec_dict) or None if no geometry is available.
    """
    # a MEMBRANE/media line is a process consumable/package priced from membrane
    # area — never a shell/steel take-off (2026-07-02 membrane-as-steel fix).
    if _MEMBRANE_MEDIA_RE.search(name or ""):
        mem = _membrane_area_price(name, mods if isinstance(mods, dict) else {})
        if mem:
            g_m, b_m = mem
            return g_m, b_m, {"material": "membrane/filtration media"}
        return None
    if geom:
        # AS-BUILT geometry (the Blender parts-manifest ⌀,H in m) — the SAME source the
        # drawings + the dashboard read, so the BoM costs the vessel that is actually
        # placed (one geometry source, not the word's re-derived working volume).
        d_v, h_v = geom
        vol = math.pi * (d_v / 2.0) ** 2 * h_v
        area = math.pi * d_v * h_v + 2 * (math.pi * d_v * d_v / 4.0)
    else:
        dim = mods.get("dimension") or ""
        cyl = _cyl_from_dim(dim); box = _box_from_dim(dim); cap = _num(mods.get("capacity"))
        # UNIT-FAMILY GUARD (2026-07-03, the same capacity->m3 confusion the
        # 'flow read as kW' fix closed for rating_primary): `capacity` is stated in
        # WHATEVER unit the modifier carries (a Reflex expansion vessel is '50 L',
        # not '50 m3') — deriving a cylinder from the bare number as if it were
        # already m3 inflates a 50 L tank into a 50 m3 shell (dia 3.66 m). Convert
        # to m3 first; unknown/absent unit defaults to m3 (byte-identical for every
        # existing m3-stated capacity — the dominant case).
        cap_u = str(mods.get("capacity_unit") or "").strip().lower()
        if cap is not None and re.fullmatch(r"l|litre|litres|liter|liters", cap_u):
            cap = cap / 1000.0
        if not cyl and not box and cap:                       # derive a cylinder from V
            d = (4 * cap / (1.3 * math.pi)) ** (1 / 3.0); cyl = (d, 1.3 * d)
        if cyl:
            d_v, h_v = cyl
            vol = math.pi * (d_v / 2.0) ** 2 * h_v
            area = math.pi * d_v * h_v + 2 * (math.pi * d_v * d_v / 4.0)   # shell + 2 heads
        elif box:
            w, dp, h_v = box; d_v = max(w, dp)
            vol = w * dp * h_v
            area = 2 * (w * dp + dp * h_v + w * h_v)                        # 6 faces
        else:
            return None
    # ── PLAUSIBILITY INVARIANT (Phase 0, council 2026-06-17) — an ABSOLUTE check, not a
    # cross-surface one. A closed PRESSURE-vessel shell take-off (hoop stress on the full
    # wrapped surface) is PHYSICALLY VALID only for a real fluid vessel of sane size. So
    # the closed-shell path is FORBIDDEN, and the cost falls to a STRUCTURAL footprint
    # take-off, whenever EITHER:
    #   (a) the typed service says this part is NOT a pressurised fluid vessel — a
    #       structural / building / dry-no-pressure / no-fluid part (the footprint-driven
    #       "Structural Frame": service.fabrication_family ∈ {structural, building_element}
    #       OR fluid='none' OR pressure_bar≤0); OR
    #   (b) the implied "vessel" volume is impossibly large for a single fabricated shell
    #       (≥ _MAX_SHELL_VOL_M3 — a 57,000 m³ "vessel" is the whole-plant bounding box,
    #       never one pressure vessel).
    # This is the typed-service-FIRST decision the council mandated: it reads the service
    # the synthesis emitted from the part's PHYSICS, never the part's noun. (A genuine
    # open atmospheric TANK is handled below by the is_open branch, which is not a
    # pressure shell either.)
    svc = service if isinstance(service, dict) else None
    svc_says_not_pressure = bool(svc) and (
        svc.get("fabrication_family") in _STRUCTURAL_FAMILIES
        or svc.get("fluid") in (None, "", "none")
        or float(svc.get("pressure_bar") or 0.0) <= 0.0)
    # an open atmospheric tank is legitimately NOT a pressure vessel, but it IS still a
    # fluid-holding shell costed by the open-tank branch below — so the structural
    # redirect applies only to a part the service marks STRUCTURAL/building/dry, or to an
    # impossibly large shell. (fluid='process_water' with pressure 0 = an OPEN TANK, kept.)
    svc_structural = bool(svc) and svc.get("fabrication_family") in _STRUCTURAL_FAMILIES
    impossible_shell = vol >= _MAX_SHELL_VOL_M3
    if svc_structural or impossible_shell:
        st = _structural_takeoff(name, mods, geom)
        if st:
            why = ("typed service = structural/building (dry, no pressure) — a hoop-stress "
                   "shell take-off is physically wrong for a structure"
                   if svc_structural else
                   f"implied shell volume {vol:,.0f} m³ ≥ {_MAX_SHELL_VOL_M3:,.0f} m³ is impossible "
                   f"for a single pressure vessel (whole-plant envelope, not a vessel)")
            gbp_s, basis_s, spec_s = st
            return gbp_s, f"{basis_s} · PLAUSIBILITY: {why}; rejected the closed-shell take-off", spec_s
        # no footprint to price structurally → fall through, but the closed-shell branch
        # is still forbidden below by `force_open` (never a pressure shell).
    force_open = svc_says_not_pressure or impossible_shell
    matlabel, rho, rate = _material(name, mods)
    # wall from PHYSICS — hoop stress at the hydrostatic head. t = P·r/(σ·E) + corrosion,
    # floored at the fabrication minimum.
    sigma_mpa, corr_mm, floor_mm = _wall_physics(matlabel)
    P = 1000.0 * 9.81 * h_v
    t_hoop = P * (d_v / 2.0) / (sigma_mpa * 1e6 * 0.85)
    # OPEN atmospheric process tank (FRP / GRP or concrete rearing tank, basin, MBBR
    # biofilter, sump) vs CLOSED / PRESSURE vessel — decided by the same NOUN test the
    # geometry uses. An open tank is NOT a pressure vessel: it has NO top head (it is open
    # to atmosphere), its shell wall TAPERS with the hydrostatic head (full at the base,
    # fabrication-minimum at the rim → average (t_hoop+floor)/2), it has a flat structural
    # floor, and it is delivered / panel-assembled (a lighter erection multiplier than a
    # field-fabricated steel pressure vessel). Universal — no per-class table.
    # OPEN/CLOSED noun set MATCHES universal-contract-sizing.ts::SUB_ASSEMBLY so the cost
    # basis (here) and the explosion breakdown (there) agree on every vessel.
    is_open = bool(re.search(r"\btank\b|\bbasin\b|\bsump\b|\bpond\b|biofilter|clarifier|raceway|lagoon", name, re.I)) \
        and not re.search(r"pressure|reactor|\bcolumn\b|\btower\b|strip|scrub|absorber|degass|contactor|\bsilo\b|hopper", name, re.I)
    # PLAUSIBILITY INVARIANT continuation: a part the typed service says is NOT a
    # pressurised fluid vessel (no fluid / 0 bar / structural) — or one whose implied
    # shell volume is impossible — must NEVER take the CLOSED pressure-vessel branch
    # (the hoop-stress wall over a wrapped shell). If it reached here it had no footprint
    # to price structurally, so cost it as the lighter OPEN-shell (no top head, tapered
    # wall, panel-assembled) — never a sealed pressure vessel. The typed-service decision
    # OVERRIDES the noun; the noun heuristic only runs when there is no typed service.
    if force_open:
        is_open = True
    if is_open:
        shell_area = math.pi * d_v * h_v
        floor_area = math.pi * d_v * d_v / 4.0
        area = shell_area + floor_area                        # shell + ONE floor (no top head)
        wall = max((t_hoop + floor_mm / 1000.0) / 2.0, floor_mm / 1000.0)   # tapered shell average
        floor_wall = (floor_mm / 1000.0) * 1.5                # flat structural floor
        mass = shell_area * wall * rho + floor_area * floor_wall * rho
        ifac = 1.0 if "concrete" in matlabel else 1.25        # delivered / panel-assembled, not field-fabricated
        head_note = "open top (no head)"
    else:
        wall = max(t_hoop + corr_mm / 1000.0, floor_mm / 1000.0)
        mass = area * wall * rho
        ifac = 1.0 if "concrete" in matlabel else _install_factor(vol)
        head_note = "2 heads"
    supply = mass * rate                                       # ex-works fabricated shell
    installed = supply * ifac                                  # × site-erection multiplier
    # FITTINGS ALLOWANCE FOLLOWS SCALE (2026-07-10, Powerwall run-21: an 'AC Filter
    # Inductor' mis-routed through this vessel path priced £1,811 — £11 of shell plus
    # the FLAT £1,800 nozzles/manway/supports allowance, on a 2 kg part. Same family
    # as the structural £8k connections adder: a plant-scale flat allowance laundering
    # a device-scale line into principal money). A real vessel (≥ 100 kg shell) keeps
    # the £1,800 byte-identically; a sub-100 kg shell gets a proportional allowance.
    fittings = 0.20 * installed + (1800 if mass >= 100 else max(30.0, mass * 6.0))
    basis = (f"{'tapered ' if is_open else 'hoop '}wall {wall*1000:.0f} mm = P·r/(σ·E)+c · ⌀{d_v:.1f}×{h_v:.1f} m ({head_note}) · "
             f"P={P/1000:.0f} kPa head · σ={sigma_mpa:.0f} MPa → {area:.0f} m² × {mass:.0f} kg "
             f"{matlabel} @ £{rate}/kg supply × {ifac:.2f} erection + fittings")
    total = installed + fittings
    # CLOSED-vessel sanity CEILING (council 2026-06-16/17): the shell-area × £/kg +
    # install + fittings path must NEVER reach the absurd £1M-class value the prior
    # council flagged on a ~7 m³ "UV reactor". Cap a closed vessel at a loose
    # volume-tied ceiling (a genuine vessel is well under it; only a runaway trips).
    # The open-tank branch has its own discounted band (guarded by the selftest).
    if not is_open:
        ceiling = _vessel_cost_ceiling(vol)
        if total > ceiling:
            basis = (basis + f" · CAPPED at vessel ceiling £{ceiling:,.0f} for {vol:.1f} m³ "
                     f"(take-off £{total:,.0f} implausible)")
            total = ceiling
    spec = {"material": matlabel, "wall_mm": round(wall * 1000, 1), "mass_kg": round(mass),
            "diameter_m": round(d_v, 2), "height_m": round(h_v, 2)}
    return total, basis, spec


# ── Minimum-credible-price floor for power / control catalogue components ──
# (council 2026-06-16, the £0/£1/£3 token-line fix). A 52 A main breaker, a busbar,
# a surge-protection device, a relay or an isolator cannot credibly render at £1-£3
# — those are LLM cost-estimate artefacts (engine_c picked a stray £3.09/£0.91). When
# a line has no real distributor price AND its estimate is below the floor for its
# part class, the floor is applied. UK 2026 trade-supply lower bounds (installed bare
# device, conservative — a genuine quote will be higher, never lower). Universal:
# keyed off the component NOUN, no per-archetype table.
# PACK-INTERNAL MICRO-COMMODITY (2026-06-24): a cell-to-cell busbar, cell link / tap /
# sense wire, cell interconnect bar or insulation pad is a stamped/wire/die-cut part bought
# in the THOUSANDS at a few £ each. Two failure modes both fixed via this one matcher:
#   • a switchgear FLOOR (£120 busbar) overriding the real £0.40 estimate → £448k;
#   • a catalogue REEL/SHEET price applied per-cell (Alpha Wire reel £59, Bergquist pad
#     sheet £40) × thousands of cells → £221k / £150k.
# So these take a tight BAND, SPLIT by material (BESS benchmark-net punch-list 2026-06-24): a
# stamped METAL busbar / interconnect-bar is ~£2-15 each; a WIRE / LEAD / SENSE / insulation-PAD
# is a consumable ~£0.3-2.5 each (the net flagged the shared £12 ceiling as still 10-20× too high
# for a per-cell tap wire / pad → £45k each). Universal — a genuine distribution busbar /
# switchboard part carries no cell/tap/interconnect qualifier and is untouched.
_PACK_MICRO_COMMODITY_RE = re.compile(
    r"cell[\s_-]*to[\s_-]*cell|\bcell\b[\w\s_-]*(?:busbar|bus[\s_-]?bar|link|tap|sense|"
    r"interconnect|insulation[\s_-]*pad)|tap[\s_-]*(?:wire|lead)|sense[\s_-]*(?:wire|lead)|"
    r"insulation[\s_-]*pad|interconnect[\s_-]*(?:bar|link)", re.I)
# the WIRE/LEAD/PAD consumable subset (cheaper than a stamped metal bar)
_PACK_MICRO_WIRE_PAD_RE = re.compile(
    r"tap[\s_-]*(?:wire|lead)|sense[\s_-]*(?:wire|lead)|insulation[\s_-]*pad|"
    r"cell[\s_-]*(?:voltage[\s_-]*)?(?:tap|sense)?[\s_-]*(?:wire|lead|pad)", re.I)
_PACK_MICRO_WIRE_FLOOR_GBP, _PACK_MICRO_WIRE_CEILING_GBP = 0.3, 2.5
_PACK_MICRO_METAL_FLOOR_GBP, _PACK_MICRO_METAL_CEILING_GBP = 2.0, 15.0
# back-compat aliases (default = the metal band) for any other reader
_PACK_MICRO_FLOOR_GBP = _PACK_MICRO_METAL_FLOOR_GBP
_PACK_MICRO_CEILING_GBP = _PACK_MICRO_METAL_CEILING_GBP

def _pack_micro_band(name: str):
    """(floor_gbp, ceiling_gbp) for a pack-internal micro-commodity, else None. Wire/lead/sense/
    insulation-pad → the consumable band (£0.3-2.5); a stamped metal busbar / interconnect-bar /
    link → the metal band (£2-15). Universal, noun-keyed."""
    nm = name or ""
    if not _PACK_MICRO_COMMODITY_RE.search(nm):
        return None
    if _PACK_MICRO_WIRE_PAD_RE.search(nm):
        return (_PACK_MICRO_WIRE_FLOOR_GBP, _PACK_MICRO_WIRE_CEILING_GBP)
    return (_PACK_MICRO_METAL_FLOOR_GBP, _PACK_MICRO_METAL_CEILING_GBP)


# BATTERY CELL pricing — the LFP cell is the DOMINANT BESS cost (rendered £0 on a catalogue miss).
# DB-FIRST (Tristan 2026-06-25: "your cell price was back-solved as the remaining cost — don't you
# have better data?"). We DO: forge-truth.db holds real prismatic-cell prices (Hithium/EVE/CALB/
# Gotion 280 Ah LFP ≈ £51-53). So price the cell from the REAL DB cell market (by chemistry +
# capacity), and ONLY fall back to a £/kWh estimate when the DB has no comparable cell. The fallback
# constant is itself GROUNDED in that DB cell data (~£57/kWh = ~£52 for a 0.896 kWh 280 Ah cell),
# NOT back-solved from the system price. Universal across chemistries (LFP/NMC/NCA/Na-ion) and Ah
# ratings — the formula is £/kWh × Ah × V, never a flat per-Ah-class number, so the SAME constant
# applies unchanged when the emitted cell moves to a newer generation (2026-07-05 WAVE C addendum
# 9, engineering-contract.ts BESS archetype recalibrated cellAh 280 → 314, CATL CBC00 class): at
# 314 Ah × 3.2 V = 1.0048 kWh/cell, £57/kWh ≈ £57.27/cell, still within the $41-56/kWh (≈£31-42/kWh)
# 2025-26 bulk 300 Ah+ LFP cell band this constant is grounded against (see engineering-contract.ts
# CELL_GBP_PER_KWH_MARKET_2026 for the full citation trail) — no change needed here.
CELL_GBP_PER_KWH = 57.0   # DB-grounded: median real 280 Ah LFP cell ≈ £52 / 0.896 kWh ≈ £58/kWh (forge-truth.db); £/kWh basis is Ah-agnostic
# FORGE_TRUTH_DB_PATH_OVERRIDE (2026-07-06, mirrors the TS chain-side ingest
# scripts' own env var — scripts/ingest/ingest-*.ts): lets a calibration
# harness replay requirements_bom.py against a TEMP COPY of forge-truth.db
# (with candidate ingest rows committed to the copy only) instead of the live
# DB, so a before/after diff can prove "no cross-class hit" without ever
# writing to the live DB. Defaults to the live path — every existing call site
# is unaffected when the env var is unset.
_FORGE_TRUTH_DB = os.environ.get("FORGE_TRUTH_DB_PATH_OVERRIDE") or os.path.expanduser("~/.forge-truth/forge-truth.db")
_CELL_DB_CACHE: dict = {}
_BATTERY_CELL_RE = re.compile(
    # `cells?` — the run-24 miss: every real BoM line is PLURAL ('LFP Prismatic
    # Cells'), and \bcell\b never matches 'Cells', so neither the energy-grounded
    # price nor the corpus-lift exemption fired on the exact dominant line they
    # were built for.
    r"\b(?:lfp|nmc|nca|lto|li[\s_-]?ion|lithium|sodium[\s_-]?ion|prismatic|pouch|cylindrical|blade)\b"
    r"[\w\s_-]*\bcells?\b|\bbattery\b[\w\s_-]*\bcells?\b", re.I)
_NON_BATTERY_CELL_RE = re.compile(r"fuel[\s_-]?cell|load[\s_-]?cell|solar[\s_-]?cell|photovoltaic|pv[\s_-]?cell", re.I)

def _cell_chemistry(nm: str) -> str:
    for c in ("lfp", "lifepo", "nmc", "nca", "lto", "sodium"):
        if c in nm.lower():
            return "lfp" if c == "lifepo" else c
    return "lfp"   # prismatic-cell default chemistry for grid storage

# UNIVERSAL DB-FIRST price resolver (Tristan 2026-06-25: "use the database to get the number — you
# have been hand-coding rather than using universal code"). For ANY component, the real price is the
# median of forge-truth.db parts that share this component's principal NOUN *and* its discriminating
# SPEC. The spec is REQUIRED: a noun-only match is too coarse (the DB 'heater' class is dominated by
# kW immersion heaters → £4,270 for a 250 W PTC heater — the very over-price hand-coding was patching).
# No spec, or <2 comparable rows → None, and the caller falls back to the grounded floor. DB read only
# (no live API — consistent with the chain-as-DB-consumer principle). One code path, every component.
_NOUN_STOP = {"the", "and", "for", "with", "type", "grid", "high", "low", "duty", "mini", "new",
              "dc", "ac", "lv", "mv", "hv", "off", "gas", "rack", "module", "system", "assembly"}
_DB_PRICE_CACHE: dict = {}

def _principal_noun(name: str) -> str:
    toks = [t for t in re.findall(r"[a-z]{3,}", (name or "").lower()) if t not in _NOUN_STOP]
    return toks[-1] if toks else ""

def _spec_like_tokens(name: str, md: dict):
    """Strongest discriminating spec as DB LIKE-patterns (Ah > kWh > kW > W > A > V). [] when none —
    a noun-only DB median is not trustworthy, so the caller must fall back to the floor."""
    md = md or {}
    blob = f"{name} {md.get('capacity','')} {md.get('rating_primary','')} {md.get('dimension','')}"
    for unit in ("ah", "kwh", "kw", "w", "a", "v"):
        m = re.search(rf"(\d[\d,]*(?:\.\d+)?)\s*{unit}\b", blob, re.I)
        if m:
            n = re.sub(r"\.0+$", "", m.group(1).replace(",", ""))
            return (unit, n, [f"%{n}{unit}%", f"%{n} {unit}%"])
    return None

# FAMILY-QUALIFIER groups (2026-07-04, BESS out/bess-campaign-v2 chiller mismatch): a DB
# noun match ("chiller") can span mutually-exclusive PHYSICAL SUB-FAMILIES that share the
# noun but are priced completely differently — an air-cooled process/HVAC chiller vs a
# compact liquid-only BESS thermal-management chiller. `_db_spec_price` matched "liquid
# cooling chiller · 148 kW" against the ONLY forge-truth.db row carrying the exact "148kw"
# spec token — a Daikin EWAD-TZBXS150 *Air Cooled* Chiller £48,500 — while the DB holds
# several real LIQUID coolant chillers (Pfannenberg/SPX/Trane, £18.5k-£34k) that simply
# don't share that exact wattage. The noun-plus-exact-spec rule has no discipline for a
# same-noun opposite-family candidate; this closes that gap the SAME way emitter-
# completion.ts's `headNounHit`/`isAccessoryRow` already close it for DB-first part-pinning
# (family coherence: match the noun's DECLARED SUB-FAMILY, not just the noun). Universal —
# keyed on qualifier TEXT, not a per-class table; a requirement/candidate pair that names no
# qualifier at all (most components) is completely unaffected.
_FAMILY_QUALIFIER_GROUPS: list[list[str]] = [
    ["liquid cool", "liquid-cool", "water cool", "water-cool", "glycol"],
    ["air cool", "air-cool"],
]


def _family_qualifier_conflict(req_blob: str, cand_blob: str) -> bool:
    """True when req_blob names a qualifier from ONE _FAMILY_QUALIFIER_GROUPS group and
    cand_blob names a qualifier from a DIFFERENT group (a real cross-family mismatch).
    False whenever either blob is silent on every group (nothing to discriminate on) or
    both name a qualifier from the SAME group — so a noun-only requirement/candidate pair
    (the overwhelming majority) is never affected."""
    req_l, cand_l = req_blob.lower(), cand_blob.lower()
    req_groups = {i for i, grp in enumerate(_FAMILY_QUALIFIER_GROUPS) if any(t in req_l for t in grp)}
    if not req_groups:
        return False
    cand_groups = {i for i, grp in enumerate(_FAMILY_QUALIFIER_GROUPS) if any(t in cand_l for t in grp)}
    if not cand_groups:
        return False
    return req_groups.isdisjoint(cand_groups)


def _db_spec_price(name: str, md: dict):
    """UNIVERSAL: (median_gbp, n, noun, spec) of forge-truth.db parts matching this component's
    principal NOUN + discriminating SPEC (≥2 rows), else None. The one DB-first price path.
    Candidates whose part_name names an OPPOSITE physical sub-family qualifier to the
    requirement (liquid-cooled vs air-cooled, …) are excluded before the median is taken —
    see _family_qualifier_conflict."""
    if not os.path.exists(_FORGE_TRUTH_DB):
        return None
    noun = _principal_noun(name)
    spec = _spec_like_tokens(name, md)
    if not noun or not spec:
        return None
    unit, nstr, likes = spec
    key = (noun, unit, nstr, (name or "").lower())
    if key in _DB_PRICE_CACHE:
        return _DB_PRICE_CACHE[key]
    out = None
    try:
        import sqlite3
        con = sqlite3.connect(f"file:{_FORGE_TRUTH_DB}?mode=ro", uri=True)
        rows = con.execute(
            "SELECT unit_price_gbp, part_name FROM pretraining_extracted_parts "
            "WHERE lower(part_name) LIKE ? AND (lower(part_name) LIKE ? OR lower(part_name) LIKE ?) "
            "AND unit_price_gbp > 0",
            (f"%{noun}%", likes[0], likes[1])).fetchall()
        con.close()
        req_blob = f"{name} {md.get('form', '') if isinstance(md, dict) else ''}"
        coherent = [r for r in rows if r and r[0]
                    and not _family_qualifier_conflict(req_blob, str(r[1] or ""))]
        prices = sorted(float(r[0]) for r in coherent)
        # ≥1 is enough: the match is noun + EXACT spec token (same component, same rating), and the
        # growing-DB loop ingests VERIFIED real parts one at a time — a single comparable must price
        # so the loop closes (a freshly-ingested 86 kW chiller resolves next run). 2026-06-25.
        if len(prices) >= 1:
            out = (prices[len(prices) // 2], len(prices), noun, f"{nstr}{unit}")
    except Exception:
        out = None
    _DB_PRICE_CACHE[key] = out
    return out

# DB-INGEST QUEUE — the chain-side half of the growing-DB loop. A principal the DB-first resolver
# could NOT price (fell to a hand-coded estimate) is logged here; the off-chain ingest job
# (scripts/ingest/ingest-priced-principals.ts) web-searches + writes back the real part. NO live
# API on the chain side (chain-as-DB-consumer) — this is an append-only log only.
_PRICE_INGEST_QUEUE = os.path.expanduser("~/.forge-truth/price-ingest-queue.jsonl")
_INGEST_MIN_GBP = 2000.0   # only principals worth ingesting a real part for (skip commodities)

def _enqueue_db_misses(rows):
    """Append estimate-priced PRINCIPAL lines (unit ≥ £2k, basis = a hand-coded estimate/rating
    model, NOT a DB/catalogue/materials source) to the price-ingest queue. Dedup by (noun|spec)
    against the existing queue so it never grows unbounded."""
    cand = []
    for r in rows:
        if r.get("status") == "SUB-COMPONENT":
            continue
        unit = r.get("unit_gbp") or 0
        if unit < _INGEST_MIN_GBP:
            continue
        b = str(r.get("basis", "")).lower()
        if any(t in b for t in ("forge-truth", "catalogue", "materials", "take-off", "distributor")):
            continue   # already data-backed
        if not any(t in b for t in ("estimate", "rating-based", "budget", "parametric", "curve", "£/k", "class budget")):
            continue   # only hand-coded estimates are ingest candidates
        req = str(r.get("requirement", ""))
        name = (req.split("·")[0].strip() or str(r.get("part", ""))).strip()
        noun = _principal_noun(name)
        if not noun:
            continue
        m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(mva|kva|mwh|kwh|mw|kw|kv|ah|m2|m3|°c|bar|w|a|v|l)\b", req, re.I)
        spec = (m.group(1).replace(",", "") + m.group(2).lower()) if m else ""
        cand.append({"key": f"{noun}|{spec}", "noun": noun, "spec": spec, "name": name[:80],
                     "requirement": req[:140], "est_unit_gbp": round(unit), "tag": r.get("tag")})
    if not cand:
        return
    seen = set()
    try:
        if os.path.exists(_PRICE_INGEST_QUEUE):
            with open(_PRICE_INGEST_QUEUE) as f:
                for ln in f:
                    try:
                        seen.add(json.loads(ln).get("key"))
                    except Exception:
                        pass
    except Exception:
        pass
    new = [c for c in cand if c["key"] not in seen and not seen.add(c["key"])]
    if not new:
        return
    os.makedirs(os.path.dirname(_PRICE_INGEST_QUEUE), exist_ok=True)
    with open(_PRICE_INGEST_QUEUE, "a") as f:
        for c in new:
            f.write(json.dumps(c) + "\n")
    print(f"[requirements_bom] price-ingest queue: +{len(new)} DB-miss principal(s) → {_PRICE_INGEST_QUEUE}", file=sys.stderr)

def _battery_cell_price(name: str, md: dict):
    """A battery CELL price → (gbp, basis) or None. DB-first via the UNIVERSAL resolver (real cell
    market in forge-truth.db), else an energy estimate (Ah × V × £/kWh_cell, the constant itself
    DB-grounded). None for a non-battery 'cell' (fuel/load/solar) or a cell with no usable Ah."""
    nm = name or ""
    if _NON_BATTERY_CELL_RE.search(nm) or not _BATTERY_CELL_RE.search(nm):
        return None
    cap_ah = _num((md or {}).get("capacity"))
    if not cap_ah or cap_ah <= 0:
        return None
    db = _db_spec_price(name, md)
    if db is not None and db[0] > 0:
        return (round(db[0], 2), f"battery cell · £{db[0]:.2f}/cell — real DB median of {db[1]} {db[3]} cells (forge-truth.db)")
    mv = re.search(r"([\d.]+)\s*v\b", str((md or {}).get("dimension") or ""), re.I)
    volt = float(mv.group(1)) if mv else 3.2
    kwh = cap_ah * volt / 1000.0
    if kwh <= 0:
        return None
    est = round(kwh * CELL_GBP_PER_KWH, 2)
    return (est, f"battery cell · £{est:.2f}/cell from {cap_ah:.0f} Ah × {volt:.1f} V × £{CELL_GBP_PER_KWH:.0f}/kWh (DB-grounded estimate; no exact-capacity cell in DB)")

_MIN_PRICE_FLOORS = [
    (re.compile(r"main[_ ]?breaker|\bmccb\b|moulded[_ ]?case|air[_ ]?circuit", re.I), 180.0),
    (re.compile(r"\bbreaker\b|\bmcb\b|circuit[_ ]?breaker", re.I), 45.0),
    # the £120 busbar floor is a SWITCHBOARD constant — a small-pack busbar (its own
    # name carries a sub-100 A continuous rating) is stamped copper at £15-30
    # (2026-07-10, Powerwall run-35: FOUR busbar family lines each floored £120 on a
    # 39.2 A pack). Amp-aware: <100 A in the name → £20; else the switchboard £120.
    (re.compile(r"busbar[\w\s]*·\s*(?:[1-9]?\d(?:\.\d+)?)\s*A\b|bus[_ ]?bar[\w\s]*·\s*(?:[1-9]?\d(?:\.\d+)?)\s*A\b", re.I), 20.0),
    (re.compile(r"busbar|bus[_ ]?bar|distribution[_ ]?bus", re.I), 120.0),
    (re.compile(r"surge[_ ]?protect|\bspd\b|surge[_ ]?arrest", re.I), 90.0),
    (re.compile(r"protective[_ ]?relay|protection[_ ]?relay", re.I), 220.0),
    (re.compile(r"\brelay\b", re.I), 35.0),
    (re.compile(r"isolat(?:or|ion)[_ ]?(?:device|switch)?|disconnect|load[_ ]?break", re.I), 95.0),
    (re.compile(r"contactor", re.I), 80.0),
    # a bare solenoid / pilot VALVE is a small control part (~£50-200) — its own modest floor, NOT
    # the £1,500 O₂-supply-system floor that used to catch it (2026-06-24).
    (re.compile(r"\bsolenoid\b|pilot[_ ]?valve", re.I), 80.0),
    (re.compile(r"fuse[_ ]?holder|fuse[_ ]?carrier", re.I), 25.0),
    (re.compile(r"emergency[_ ]?stop|e[_ -]?stop", re.I), 40.0),
    (re.compile(r"interlock|safety[_ ]?switch", re.I), 60.0),
    (re.compile(r"signal[_ ]?conditioner|isolat(?:ing)?[_ ]?amplifier", re.I), 120.0),
    (re.compile(r"network[_ ]?switch|ethernet[_ ]?switch", re.I), 150.0),
    (re.compile(r"communication[_ ]?gateway|protocol[_ ]?gateway|fieldbus", re.I), 250.0),
    (re.compile(r"i/?o[_ ]?module|input[_ ]?output", re.I), 250.0),
    (re.compile(r"controller[_ ]?power|power[_ ]?supply|\bpsu\b", re.I), 120.0),
    (re.compile(r"main[_ ]?controller|\bplc\b|programmable[_ ]?logic", re.I), 400.0),
    # Electrical ASSEMBLY enclosures (a populated panel / board / switchboard / MCC — NOT a
    # bare component). The 2026-06-26 Codema audit found "Electrical Control Panel" matched NO
    # floor → it rendered at £218, and a stale qty=3,271 had made it £713k = 58% of the bill.
    # These are whole assemblies (enclosure + main gear + busbars + wiring + terminals + build)
    # — a real quote is never below these minimums. Bare "panel" is deliberately NOT matched
    # (a solar / vent / deflagration / cladding panel is not switchgear); only unambiguous
    # switchgear-assembly nouns. LAST in the table so a component WITHIN an assembly (a
    # "switchboard busbar" → £120 busbar, a "panel breaker" → £45) matches its own floor first;
    # only a bare assembly noun reaches these. Conservative flat minimums (a real quote is higher).
    (re.compile(r"switch[_ ]?board|\bmcc\b|motor[_ ]?control[_ ]?(?:centre|center)|"
                r"main[_ ]?distribution[_ ]?board|\bmdb\b|main[_ ]?switchgear", re.I), 3000.0),
    (re.compile(r"control[_ ]?panel|control[_ ]?cabinet|control[_ ]?enclosure|"
                r"distribution[_ ]?board|distribution[_ ]?panel|panel[_ ]?board|consumer[_ ]?unit|"
                r"power[_ ]?distribution[_ ]?panel|electrical[_ ]?panel|electrical[_ ]?cabinet", re.I),
     800.0),
]


# ── PROCESS-SYSTEM minimum-credible-price floors (council 2026-06-19, the RAS £5M
# BoM audit: the customer was rightly suspicious because the ELECTRICAL floor above
# only caught breakers/relays/busbars — PROCESS systems were token-priced. The live
# RAS run shipped 10+ process systems near a token value, blowers at £25 (class
# median ~£8k), a DO control valve at £9, and a DN400 modulating valve at £0). These
# are MINIMUM credible installed-supply prices for the WHOLE skid/system — a real
# vendor quote is higher, never lower. Universal: keyed off the system NOUN, no
# per-archetype table. A class whose lines match NONE of these is untouched (the
# CO₂/SAF byte-identity guarantee: their process kit is strong-bespoke reactors/
# columns priced on the engineering-budget basis, which never reaches this floor).
#
# A floor entry is either a flat £ OR the sentinel _DUTY for a duty-scaled floor
# (computed by _duty_scaled_floor from the line's kW rating). ORDER MATTERS — the
# most specific noun first; the blower/immersion-heater rows carry their own duty
# logic in _price_floor_for so they appear here only as the no-rating fallback floor.
# A floor entry value is a flat £, the sentinel _BLOWER_DUTY (max(£5,000, duty_kw ×
# £500/kW)), or _DUTY (the generic _duty_scaled_floor). ORDER MATTERS — most specific
# noun first.
_DUTY = "__duty_scaled__"
_BLOWER_DUTY = "__blower_duty__"
_PROCESS_SYSTEM_FLOORS = [
    # P1-D (Sam/Codema 2026-07-08): metering/dosing pumps are ~0.04–0.75 kW chemical
    # injectors (£300–£800 installed), NOT a £3k process skid. Match metering/acid/
    # chemical dosing FIRST at a realistic floor; leave bulk fertigation circulation
    # pumps to the general dosing floor below.
    # Metering injectors ONLY (… dosing pump / meter / injector / skid) — NOT a
    # plant-level "Chemical Dosing System" (that hits the £3k system floor below).
    (re.compile(r"(?:acid|chemical|nutrient|metering|h2o2|peroxide|alkalin|caustic|ph)"
                r"[_ ]?dos(?:e|ing)?[_ ]?(?:pump|meter|injector|skid)\b|"
                r"\bdos(?:e|ing)[_ ]?(?:pump|meter|injector|skid)\b", re.I), 400.0),
    # P1-D UV (2026-07-09): a plant UV/ozone skid is never a £280 residential unit.
    # Flat floor catches the Spektron-30e-class catalogue miss; duty-scaled parametric
    # in _unit_operation_price still lifts IDENTIFIED lines further (see assemble).
    (re.compile(r"\buv\b|ultraviolet|\bozone\b|disinfect|steril", re.I), 8000.0),
    (re.compile(r"chemical[_ ]?dos|\bdosing\b|alkalin|\bph[_ ]?dos|caustic[_ ]?dos|acid[_ ]?dos", re.I), 3000.0),
    (re.compile(r"\bfeed\b[_ ]?(?:stor|system|distribution|silo|hopper|handling)|feed[_ ]?stor|"
                r"feed[_ ]?distribution|pellet[_ ]?(?:stor|silo|system)", re.I), 5000.0),
    (re.compile(r"sludge|biosolids|\bsolids\b[_ ]?handling|solids[_ ]?(?:dewater|thicken|handling)|"
                r"thicken|dewater", re.I), 8000.0),
    (re.compile(r"effluent|discharge[_ ]?(?:treat|system)|wastewater[_ ]?treat", re.I), 8000.0),
    (re.compile(r"grading|harvest|sorting|grader|\bgrade\b[_ ]?system|crowd", re.I), 6000.0),
    (re.compile(r"mortali|cull[_ ]?(?:handling|system)|carcass", re.I), 5000.0),
    # blower / aeration / degassing — max(£5,000, duty_kw × £500/kW), NOT the steep
    # generic _duty_scaled_floor (£3,000/kW above 50 kW would mis-price a 55 kW
    # blower at £165k vs the ~£30k market). A blower is light rotating kit.
    (re.compile(r"\bblower\b|aerat\w*[_ ]?(?:blower|system)|degass\w*[_ ]?blower|air[_ ]?blower|"
                r"roots[_ ]?blower|lobe[_ ]?blower|degassing[_ ]?blower", re.I), _BLOWER_DUTY),
    # O₂/oxygen SUPPLY SYSTEM floor £1,500 — NOT a bare "solenoid" (a small valve ~£50-300; the
    # bare alternative wrongly floored a 250 V "off-gas activation solenoid" to £1,500 ×13 = £19.5k,
    # 2026-06-24). The oxygen-system patterns still match the real LOX/O₂ supply skid.
    (re.compile(r"\bo2\b|oxygen|\blox\b|oxygen[_ ]?(?:supply|system|dos|inject)|"
                r"oxygen[_ ]?(?:dosing|injection)[_ ]?solenoid", re.I), 1500.0),
]


def _duty_scaled_floor(kw):
    """Minimum credible installed £ for any component carrying a kW rating, scaled by
    that duty (council 2026-06-19). A duty-rated skid is never a token price: a small
    unit still carries a base cost, a large one scales with its power. Universal — a
    pure function of kW, no noun or class table:

      < 5 kW   → £1,500 base (a small skid's irreducible cost)
      5–50 kW  → £500/kW
      > 50 kW  → £3,000/kW

    Returns None when there is no usable kW rating (so a non-rated line is unaffected
    and the caller falls back to its flat category floor)."""
    if kw is None or kw <= 0:
        return None
    if kw < 5.0:
        return 1500.0
    if kw <= 50.0:
        return 500.0 * kw
    return 3000.0 * kw


def _price_floor_for(name: str, md=None):
    """Minimum credible installed unit price (£) for a power/control/PROCESS component
    by its NOUN (+ its kW rating where one is carried), else None. Conservative
    trade-supply lower bound — a real quote is higher, never lower. Universal: keyed
    off the noun, no per-class table; a line matching nothing returns None (untouched).

    Extended 2026-06-19 (the RAS £5M audit) beyond the ELECTRICAL floors to cover:
      • PROCESS systems  — chemical/dosing → £3,000; feed/storage/distribution →
        £5,000; sludge/solids → £8,000; grading/harvest/sorting → £6,000;
        blower/aeration/degassing → max(£5,000, duty_kw × £500/kW);
        O₂/oxygen/solenoid → £1,500.
      • BACKUP IMMERSION HEATER > 100 kW → £6,000 + duty_kw × £3,000/kW.
    The duty terms read the line's `rating_primary` kW via `md` (optional — a None
    `md`, or a rating that is not kW, falls back to the flat floor)."""
    nm = name or ""
    # PACK-INTERNAL MICRO-COMMODITY guard (2026-06-24): a cell-to-cell busbar, cell link,
    # tap/sense wire, cell interconnect bar or insulation pad is a stamped/wire part bought
    # in the THOUSANDS at pennies each — NOT the switchboard busbar / relay the electrical
    # floors below target. The £120 distribution-busbar floor was overriding the cell-to-cell
    # busbar's correct £0.40 estimate → £120 × 3,735 = £448k. These carry a real catalogue/
    # estimate price already, so they take NO floor. Universal (no class table); a genuine
    # distribution busbar / switchboard part has no "cell"/"tap"/"interconnect" qualifier.
    _micro = _pack_micro_band(nm)
    if _micro is not None:
        # a tiny but non-ZERO minimum (a stamped strip / hookup wire / thermal pad is a few
        # £ in bulk, never the £120 switchgear floor and never £0) — keeps the line credible.
        # Material-split: a metal bar floors at £2, a wire/pad consumable at £0.3.
        return _micro[0]
    kw = None
    if isinstance(md, dict):
        kw_val, is_kva = _rating_kw(md, nm)
        if kw_val and not is_kva:
            kw = kw_val
    # backup immersion heater > 100 kW — a sane MINIMUM only kicks in above 100 kW
    # (a small backup heater is covered by the duty-scaled / electrical paths). Base
    # + a per-kW term so a large backup heater is never a token price. £200/kW: an
    # industrial electric immersion-heater package is ~£80-200/kW installed — a
    # resistive heater is NOT a rotating/process skid, so it must NOT use the generic
    # £3,000/kW heavy-equipment tier (that mis-priced a 411 kW heater at £1.24M).
    if re.search(r"immersion[_ ]?heat|backup[_ ]?heat|electric[_ ]?(?:resistance[_ ]?)?heat", nm, re.I):
        if kw is not None and kw > 100.0:
            return 6000.0 + kw * 200.0
    # PROCESS-SYSTEM floors (the new RAS-audit categories)
    for rx, floor in _PROCESS_SYSTEM_FLOORS:
        if rx.search(nm):
            if floor == _BLOWER_DUTY:
                # blower / aeration / degassing: max(£5,000, duty_kw × £500/kW)
                return max(5000.0, kw * 500.0) if (kw and kw > 0) else 5000.0
            if floor == _DUTY:
                ds = _duty_scaled_floor(kw)
                return max(1500.0, ds) if ds is not None else 1500.0
            return floor
    # ELECTRICAL / control floors (the original council-2026-06-16 set)
    # AMP-AWARE BUSBAR (2026-07-10, Powerwall run 50): the amp-suffixed name pattern
    # ("busbar · 39.2 A") never fires because the rating suffix is appended to the DISPLAY
    # row AFTER floor time — at floor time the name is bare ("DC Busbar Assembly") and the
    # £120 switchboard constant wins on a 39.2 A stamped-copper pack bar (4 lines, run 50).
    # Read the current from the word's OWN modifiers instead: a sub-100 A busbar floors £20.
    amps = None
    if isinstance(md, dict):
        for _k in ("rating_primary", "rating", "capacity", "dimension"):
            _mv = re.search(r"([\d.]+)\s*A(?:\b|mp)", str(md.get(_k) or ""), re.I)
            if _mv:
                try:
                    amps = float(_mv.group(1))
                except ValueError:
                    amps = None
                break
        # run 51: rating_primary is often a BARE number ('39.2') with the unit in the
        # SEPARATE rating_primary_unit field ('A continuous') — the inline regex above
        # never sees it. Same unit-honouring discipline as _rating_kw.
        if amps is None and re.match(r"^\s*A\b", str(md.get("rating_primary_unit") or ""), re.I):
            try:
                amps = float(str(md.get("rating_primary")).strip())
            except (TypeError, ValueError):
                amps = None
    for rx, floor in _MIN_PRICE_FLOORS:
        if rx.search(nm):
            if floor == 120.0 and amps is not None and amps < 100.0 and \
                    re.search(r"busbar|bus[_ ]?bar", nm, re.I):
                return 20.0
            return floor
    return None


# ── ZERO-PRICE COMMODITY FLOOR (2026-06-25) ──
# A £0 unit price is NEVER correct: every part costs SOMETHING. An IDENTIFIED / principal
# line can still finalise at £0 when the catalogue MPN missed, the DB-spec resolver missed,
# and no list price was stamped — real commodity parts the parts-DB had no price for
# (Klauke 16208 cable lugs, Vishay MKP1848C capacitor, Schaffner FN6840 line filter,
# Trelleborg gasket, Brady 121085 labels). This is the FINAL guard: no priced line may emit
# unit_price_gbp <= 0. The floor is a small, CONSERVATIVE minimum derived from the principal
# NOUN class (via `_principal_noun`) — universal, noun-keyed, NOT a per-MPN table. The goal
# is "no £0" with an HONEST floored-not-sourced basis, never a precise (or inflated) guess —
# precise pricing is the DB-ingest track. ORDER: most specific noun first; a generic £0
# commodity falls back to the conservative catch-all.
_COMMODITY_NOUN_FLOORS = [
    # label / marker / nameplate / tag — die-cut adhesive, pennies-to-£1 each
    ({"label", "labels", "marker", "markers", "nameplate", "nameplates", "tag", "tags",
      "sticker", "stickers", "placard"}, 1.0),
    # cable lug / ferrule / terminal (block) / crimp / connector pin — a stamped contact
    # / DIN-rail terminal, ~£2 (the commodity-electrical £2-8 band, v56c 'Terminal
    # Blocks £0' family)
    ({"lug", "lugs", "ferrule", "ferrules", "terminal", "terminals", "crimp", "crimps",
      "ferule", "spade", "bootlace"}, 2.0),
    # gasket / seal / o-ring / grommet / bung / cable gland — moulded elastomer /
    # threaded brass gland, ~£5
    ({"gasket", "gaskets", "seal", "seals", "oring", "grommet", "grommets", "bung",
      "bungs", "washer", "washers", "gland", "glands"}, 5.0),
    # fuse / mcb / breaker (bare commodity protective device), ~£8
    ({"fuse", "fuses", "mcb", "mcbs", "breaker", "breakers", "fuselink"}, 8.0),
    # capacitor / cap, ~£15
    ({"capacitor", "capacitors", "cap", "caps", "supercapacitor"}, 15.0),
    # EMC / line / mains filter, ~£60
    ({"filter", "filters", "choke", "chokes"}, 60.0),
]
# generic conservative catch-all for any OTHER £0 commodity — every part costs something
_COMMODITY_GENERIC_FLOOR_GBP = 3.0


def _commodity_zero_floor(name: str):
    """A small, deterministic, NOUN-keyed minimum price (£) for a line that finalised at
    £0 — the 'no £0 priced line' guard. Returns (floor_gbp, noun). Matches the line's
    principal NOUN first, then ANY of its tokens against the class bands (v56c fix:
    'Terminal Blocks' has principal noun 'blocks', but the CLASS token is 'terminal' —
    last-token-only matching sent every multi-word commodity to the generic catch-all).
    Falls back to the conservative generic floor for any other noun. Universal, no
    per-MPN table. CONSERVATIVE — a small floor, never an inflated guess."""
    noun = _principal_noun(name)
    toks = [t for t in re.findall(r"[a-z]{3,}", (name or "").lower()) if t not in _NOUN_STOP]
    for nouns, floor in _COMMODITY_NOUN_FLOORS:
        if noun in nouns:
            return (floor, noun)
        hit = next((t for t in toks if t in nouns), None)
        if hit:
            return (floor, hit)
    return (_COMMODITY_GENERIC_FLOOR_GBP, noun)


# ── CORPUS-MEDIAN LIFT (RAS £5M audit 2026-06-20) ──
# A principal that has NO rating/take-off basis (so neither _reconcile_rated_price
# nor the take-off path corrected it) keeps the engine's flat parametric estimate —
# which can sit FAR below the price the engine ITSELF computed from its forge-truth
# corpus (Engine C): a Degasser at £4,946 vs a £65k corpus median (n=5); a Drum
# Filter at £6,851 vs £28k. The corpus verdict was recorded (engine_c_flag='under',
# engine_c_ref_median_gbp, engine_c_ref_count) but never APPLIED to the price. This
# lifts such a line to the corpus's CONSERVATIVE lower edge (p25, falling back to a
# damped fraction of the median) — never to the median itself, so a noisy corpus
# can't over-bill. Universal: keyed off the engine's own recorded corpus verdict, no
# per-class table, no noun list. LIFT-ONLY (never lowers a price); fires ONLY when the
# corpus is TRUSTED (≥ MIN hits) and the line is MATERIALLY under it.
_CORPUS_MIN_HITS = 3          # ignore a thin corpus (< this many priced reference hits)
_CORPUS_UNDER_FRAC = 0.5      # only lift a line priced below this × the median
_CORPUS_MEDIAN_DAMP = 0.6     # p25 fallback = this × median (a conservative lower edge)


def _corpus_median_lift(unit_gbp: float, pv: dict):
    """Conservative corpus-median lift for ONE principal line. Returns (new_unit_gbp,
    basis_suffix) when the engine's own forge-truth corpus says this line is materially
    under-priced and the corpus is trusted, else None. Lift target = p25 (the corpus
    lower quartile) if present, else _CORPUS_MEDIAN_DAMP × median — a LOWER edge, never
    the median, so a noisy corpus cannot over-bill. Deterministic, class-agnostic."""
    if not isinstance(pv, dict):
        return None
    flag = str(pv.get("engine_c_flag") or "").lower()
    if flag != "under":
        return None
    try:
        median = float(pv.get("engine_c_ref_median_gbp") or 0)
        count = int(pv.get("engine_c_ref_count") or 0)
    except (TypeError, ValueError):
        return None
    if median <= 0 or count < _CORPUS_MIN_HITS:
        return None
    if not (unit_gbp < _CORPUS_UNDER_FRAC * median):
        return None
    p25 = pv.get("engine_c_ref_p25_gbp")
    try:
        target = float(p25) if p25 not in (None, "") and float(p25) > 0 else _CORPUS_MEDIAN_DAMP * median
    except (TypeError, ValueError):
        target = _CORPUS_MEDIAN_DAMP * median
    # never LOWER a price, and never lift ABOVE the median (the conservative ceiling)
    target = min(max(target, unit_gbp), median)
    if target <= unit_gbp * 1.0001:
        return None
    # COMMODITY-MATCHED-TO-PRINCIPAL guard (2026-06-24): a tiny commodity estimate lifted to
    # a LARGE corpus reference is a CLASS-MISMATCH, not an under-priced principal — the corpus
    # matched a per-module "module steel frame" (£40) / per-rack "cold plate" (£700) to large
    # industrial components and lifted them to £34,000 / £19,250 (a 27-850× jump). Reject a
    # lift whose TARGET is large (> £10k) while the original is a commodity (< £1k). A genuine
    # under-priced principal (Degasser £4,946→£65k) starts in the hundreds-thousands; a
    # small-target lift (junction box → £110) is unaffected. Universal, no noun/class table.
    if target > 10_000.0 and unit_gbp < 1_000.0:
        return None
    # RATIO guard (2026-06-24, BESS benchmark-net punch-list): the absolute guard above missed
    # MID-range commodity mismatches — a per-module sheet-metal "module bottom tray" £40→£3,000
    # (75×), "module top cover" £1→£866 (866×), "rack heater thermostat" £16→£1,500 (94×). A lift
    # that MULTIPLIES a sub-£500 commodity by more than 20× is a class-mismatch (the corpus matched
    # a stamped per-module part to a large-component reference), NOT an under-priced principal. The
    # genuine cases stay: Degasser £4,946→£65k is 13× (and orig ≥ £500); junction box £40→£110 is
    # 2.75×. Universal, no noun list.
    # (tightened 20× → 10× 2026-07-10: run-23 lifted £21 'Access Doors' / £40 skin
    # lines to a generic £300 corpus p25 at 14× — 22 such lines ≈ £6.6k of phantom
    # commodity inflation on a wall cabinet. The genuine sub-£500 case in the corpus
    # is the junction box £40→£110 at 2.75×; nothing genuine needs >10× on a commodity.)
    if unit_gbp < 500.0 and target > unit_gbp * 10.0:
        return None
    # UNIVERSAL RATIO CEILING (2026-07-10, Powerwall run-20: 'Battery Module Rack'
    # £8,001 → £210,000, a 26× lift to a UTILITY-rack corpus median on a 14 kWh wall
    # cabinet — slipped BETWEEN the two guards above because the line was neither
    # sub-£1k nor sub-£500). Third occurrence of the corpus CLASS-MISMATCH family
    # (module tray 75×, fan tray 6×, now rack 26×): a line at < ~7% of its corpus
    # median is not "under-priced" — the corpus matched a DIFFERENT class of product
    # sharing the noun. The genuine under-priced principals stay: Degasser £4,946→£65k
    # is 13×, Drum Filter £6,851→£28k is 4×. No noun list, no class table.
    if target > unit_gbp * 15.0:
        return None
    edge = "p25" if (p25 not in (None, "") and target < median) else "0.6×median"
    basis = (f" · lifted £{round(unit_gbp):,}→£{round(target):,} to the engine corpus "
             f"{edge} (median £{round(median):,}, n={count}; line was "
             f"{unit_gbp/median:.0%} of median — under-priced vs the engine's own "
             f"forge-truth reference)")
    return round(target), basis


def _is_real_mpn_grounded(pv: dict) -> bool:
    """True when `pv` (a partVerifications entry) is priced from a VERIFIED distributor-
    cascade hit for a REAL pinned MPN (the chain's bom-cost-grounding step stamps
    cost_grounding_provenance='distributor-cache'; cascade-price-adoption.ts's
    adoptCascadePrices choke point is the sibling mechanism for the SAME signal). Such a
    price is the market price for the EXACT part being shipped — strictly more
    authoritative than a corpus-median heuristic, which can only ever compare against
    OTHER products in the same family (2026-07-05, the X-115 £190→£1,582 bug: the corpus's
    top matches were Siemens S7-1500 CPU 1511-1/1513-1 PN — different, pricier CPU models
    than the part actually pinned) and exists as a fallback for a line the engine priced
    with NO real grounding at all — `_corpus_median_lift`'s own docstring says as much
    ("a principal that has NO rating/take-off basis... keeps the engine's flat parametric
    estimate"). Universal — keyed on the verification provenance the grounding step itself
    stamps, no per-part table; a line with no such grounding (the Degasser/Drum Filter
    cases the lift exists for) is unaffected."""
    return (
        isinstance(pv, dict)
        and str(pv.get("cost_grounding_provenance") or "").lower() == "distributor-cache"
        and str(pv.get("status") or "").lower() == "verified"
    )


# ── CONTROL-ELEMENT CLASS BUDGETS (council 2026-06-19, the RAS £0 DN400 valve) ──
# A FINAL CONTROL ELEMENT (a modulating / on-off process valve or actuator) must
# NEVER render at £0. The live RAS run shipped a DN400 modulating control valve at
# £0 (status=ACTUATOR, the synthesis stamped no price_estimate_gbp). These are
# catalogue-class minimum budgets by the NORMALISED control-element kind — a sane
# floor applied as the LAST resort BEFORE any code path would emit £0 for a control
# element. Universal: keyed off the control-element kind, no per-class table.
CONTROL_ELEMENT_CLASS_BUDGETS = {
    "final_control_element": 1200.0,   # a generic control valve / on-off actuator
    "proportional_valve": 1800.0,      # a modulating / characterised control valve
    "motorised_actuator": 2500.0,      # an electric/motorised valve actuator
}


def _control_element_kind(name: str) -> str:
    """Normalised control-element kind for CONTROL_ELEMENT_CLASS_BUDGETS, else ''.
    A motorised/electric ACTUATOR > a modulating/proportional valve > a generic
    control element. Universal — keyed off the noun, no class table."""
    nm = name or ""
    if re.search(r"motoris\w*[_ ]?actuat|electric[_ ]?actuat|\bactuator\b", nm, re.I):
        return "motorised_actuator"
    if re.search(r"modulat\w*|proportional|control[_ ]?valve|characteris\w*[_ ]?valve|"
                 r"\bfcv\b|throttl\w*[_ ]?valve|globe[_ ]?valve", nm, re.I):
        return "proportional_valve"
    if re.search(r"\bvalve\b|solenoid|control[_ ]?element|damper", nm, re.I):
        return "final_control_element"
    return ""


def _control_element_budget(name: str):
    """Minimum credible installed £ for a final control element of this NOUN, else
    None. Used as the last-resort fallback so a control valve / actuator can never
    cost £0. Universal, deterministic, no per-class table."""
    kind = _control_element_kind(name)
    return CONTROL_ELEMENT_CLASS_BUDGETS.get(kind)


# ── ACTUATED-VALVE ASSEMBLY FAMILY (benchmark net v56, 2026-07-02) ──
# An ACTUATED valve (a pneumatic/electric actuator MOUNTED ON a valve body — one
# procurable assembly) must price from the ACTUATED-VALVE family, never the bare-valve
# commodity band: the v56 water-treatment run shipped 200× "Pneumatic Actuated Valves"
# at £25 each (a bare PVC ball-valve token price) when a real 2½ in pneumatically
# actuated valve is £150–250 — the heart of the client's £895k ebb/flow section being
# ~70% under-modelled. Basis (UK 2026 trade supply, PVC-U/ball class assembly):
#   assembly £ = £80 base (actuator + mounting kit + solenoid pilot) + £1.85 × DN(mm)
#   → DN50 ≈ £173 · DN65 (2½ in, the class default) ≈ £200 · DN100 ≈ £265.
# LIFT-ONLY (never lowers a real catalogue price); a line with a live distributor
# price is untouched. Universal: keyed off the ACTUATION qualifier on the valve NOUN
# (pneumatic/electric/motorised/actuated/automated), no per-archetype table. A manual /
# check / solenoid / relief valve carries no actuation qualifier and never matches.
_ACTUATED_VALVE_RE = re.compile(
    r"(?:pneumatic(?:ally)?|electric(?:ally)?|motoris\w*|air)[\s_-]+(?:actuated|operated)"
    r"[\s_-]+(?:\w+[\s_-]+)?valves?\b"                                  # 'pneumatic actuated valve'
    r"|\bactuated[\s_-]+(?:\w+[\s_-]+)?valves?\b"                        # 'actuated ball valve'
    r"|\bautomated[\s_-]+(?:\w+[\s_-]+)?valves?\b"                       # 'automated ball valve'
    r"|\bmotoris\w*[\s_-]+valves?\b"                                     # 'motorised valve'
    r"|\bpneumatic[\s_-]+(?:ball|butterfly|diaphragm|control)[\s_-]+valves?\b",
    re.I)
_ACTUATED_VALVE_BASE_GBP = 80.0      # actuator + mounting kit + solenoid pilot
_ACTUATED_VALVE_PER_DN_GBP = 1.85    # valve-body cost scales with DN
_ACTUATED_VALVE_DEFAULT_DN = 65.0    # 2½ in — the ebb/flow distribution class


def _valve_dn_mm(text: str):
    """DN (mm) parsed from a name/requirement — 'DN80', '2.5 in', '2½"' — else None."""
    t = text or ""
    m = re.search(r"\bDN\s*(\d{2,4})\b", t, re.I)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:\"|\bin(?:ch)?\b)", t)
    if m:
        return float(m.group(1)) * 25.0   # nominal inch → DN mm (2 in → DN50)
    return None


def _actuated_valve_assembly_price(name: str, requirement: str = ""):
    """(gbp, basis) for an actuated-valve ASSEMBLY (actuator + valve body priced as
    ONE unit), else None when the noun carries no actuation qualifier. Deterministic,
    universal, explicit basis: £80 base + £1.85/DN·mm (DN65 assumed when unstated)."""
    if not _ACTUATED_VALVE_RE.search(name or ""):
        return None
    dn = _valve_dn_mm(f"{name} {requirement}")
    dn_note = f"DN{dn:g}" if dn else f"DN{_ACTUATED_VALVE_DEFAULT_DN:g} assumed (2½ in class)"
    dn_val = dn or _ACTUATED_VALVE_DEFAULT_DN
    gbp = _ACTUATED_VALVE_BASE_GBP + _ACTUATED_VALVE_PER_DN_GBP * dn_val
    basis = (f"actuated-valve assembly (actuator + valve body as ONE unit): "
             f"£{_ACTUATED_VALVE_BASE_GBP:.0f} base + £{_ACTUATED_VALVE_PER_DN_GBP:.2f}/DN·mm × {dn_note} "
             f"= £{gbp:,.0f} (UK-2026 trade supply, never the bare-valve band)")
    return gbp, basis


# ── BARE PNEUMATIC-ACTUATOR COMPONENT BAND (benchmark net v56, 2026-07-02) ──
# A bare PNEUMATIC (air) actuator priced SEPARATELY from its valve is a small
# rack-and-pinion / diaphragm component — £30–40 each at trade volume, NOT the £329
# the corpus lift produced (the "actuator" corpus median £548 is dominated by large
# MOTORISED/electric actuators — a class-mismatch). A motorised/electric actuator is
# a different family (CONTROL_ELEMENT_CLASS_BUDGETS £2,500) and never matches here.
# NOTE the double-representation trap this band pairs with: when the SAME N units also
# appear as an actuated-valve ASSEMBLY line (which already includes its actuators),
# the bare-actuator line is folded to £0 by _dedupe_actuator_assembly_rows.
_BARE_PNEUMATIC_ACTUATOR_RE = re.compile(
    r"(?:pneumatic|air)[\s_-]+(?:valve[\s_-]+)?actuators?\b", re.I)
_PNEUMATIC_ACTUATOR_FLOOR_GBP, _PNEUMATIC_ACTUATOR_CEILING_GBP = 30.0, 40.0


def _pneumatic_actuator_band(name: str, gbp: float):
    """Clamp a bare pneumatic-actuator COMPONENT price into its £30–40 band; returns
    (gbp, basis_suffix) when clamped, else None (non-matching noun / already in band).
    A pneumatic ACTUATED VALVE (the assembly) is priced by its own family, not here."""
    if not _BARE_PNEUMATIC_ACTUATOR_RE.search(name or ""):
        return None
    if _ACTUATED_VALVE_RE.search(name or ""):
        return None                       # the assembly family owns that line
    if gbp > _PNEUMATIC_ACTUATOR_CEILING_GBP:
        return (_PNEUMATIC_ACTUATOR_CEILING_GBP,
                f" · capped to pneumatic-actuator component band "
                f"£{_PNEUMATIC_ACTUATOR_FLOOR_GBP:.0f}–{_PNEUMATIC_ACTUATOR_CEILING_GBP:.0f} "
                f"(bare rack-and-pinion/diaphragm air actuator, not a motorised drive)")
    if 0 <= gbp < _PNEUMATIC_ACTUATOR_FLOOR_GBP:
        return (_PNEUMATIC_ACTUATOR_FLOOR_GBP,
                f" · floored to pneumatic-actuator component band "
                f"£{_PNEUMATIC_ACTUATOR_FLOOR_GBP:.0f}–{_PNEUMATIC_ACTUATOR_CEILING_GBP:.0f}")
    return None


def _structural_material_from_name(name: str) -> str:
    """The stated material of a budget-estimated STRUCTURAL part, read from the part's
    OWN name tokens (universal — the name IS the data; no class table): 'Sst304 / SS316 /
    stainless' → the stainless grade; 'galvanised' → galvanised steel; 'aluminium' →
    aluminium alloy; 'painted steel' (or any other steel frame) → painted structural
    carbon steel (the trade default for a skid/frame)."""
    nm = (name or "").lower()
    m = re.search(r"(?:sst|ss)\s*_?(304|316)l?|\b(304|316)l?\s+stainless|\bstainless\b", nm)
    if m:
        grade = next((g for g in m.groups() if g), None)
        return f"{grade} stainless steel" if grade else "stainless steel"
    if re.search(r"galvani[sz]", nm):
        return "galvanised steel"
    if re.search(r"aluminium|aluminum", nm):
        return "aluminium alloy"
    return "painted structural carbon steel (S275/S355)"


_ENCLOSURE_SKIN_HEAD_RE = re.compile(r"(enclosure|cabinet|housing)s?\s*$", re.I)
_ENCLOSURE_PANEL_HEAD_RE = re.compile(r"(panel|cover|door|lid)s?\s*$", re.I)
_SHEET_STEEL_GBP_PER_KG = 4.5      # UK-2026 sheet-metal material, mild steel
_SHEET_FAB_MULT = 2.8              # forming + welding + powder coat + gaskets
_SHEET_T_MM = 1.5
_STEEL_KG_PER_M2_PER_MM = 7.85


def _enclosure_skin_takeoff(name, qcontract):
    """Price a DEVICE-SCALE enclosure/cabinet skin from the contract's OWN
    enclosure_volume_m3 (2026-07-10, Powerwall ledger: 'Outdoor Cabinet Enclosure'
    shipped at the £3 commodity floor with NO material — a physical fabricated part).
    Skin area ≈ 6·V^(2/3) × 1.1 (returns/flanges) for a box of that volume; sheet
    steel 1.5 mm; fabricated cost = mass × £/kg × forming/coating multiplier. A
    'panel/cover/door' head prices 25% of the skin (one face family, not the whole
    box). Fires ONLY when the name head is enclosure-family AND the contract carries
    a sub-5 m³ enclosure volume — every other archetype/row byte-identical. Returns
    (gbp, basis, spec) or None."""
    nm = str(name or "")
    full = bool(_ENCLOSURE_SKIN_HEAD_RE.search(nm))
    panel = bool(_ENCLOSURE_PANEL_HEAD_RE.search(nm)) and re.search(r"enclosure|cabinet|housing", nm, re.I)
    if not (full or panel):
        return None
    qv = (qcontract or {}).get("enclosure_volume_m3")
    vol = _num(qv.get("value") if isinstance(qv, dict) else qv)
    if not vol or not (0 < vol < 5.0):
        return None
    area_m2 = 6.0 * (float(vol) ** (2.0 / 3.0)) * 1.1
    frac = 1.0 if full else 0.25
    mass_kg = area_m2 * frac * _SHEET_T_MM * _STEEL_KG_PER_M2_PER_MM
    gbp = mass_kg * _SHEET_STEEL_GBP_PER_KG * _SHEET_FAB_MULT
    basis = (f"enclosure sheet-metal take-off: {area_m2 * frac:.2f} m² skin"
             f"{'' if full else ' (panel family — 25% of the box skin)'} from the contract "
             f"enclosure_volume_m3 = {float(vol):.2f} × {_SHEET_T_MM:.1f} mm sheet "
             f"({mass_kg:.1f} kg) × £{_SHEET_STEEL_GBP_PER_KG:.2f}/kg × "
             f"{_SHEET_FAB_MULT:.1f} forming/welding/powder-coat")
    spec = {"material": "powder-coated mild steel sheet (IP-rated outdoor enclosure)",
            "skin_area_m2": round(area_m2 * frac, 2), "mass_kg": round(mass_kg, 1)}
    return gbp, basis, spec


def _dedupe_actuator_assembly_rows(rows):
    """DOUBLE-REPRESENTATION de-dup (benchmark net v56, 2026-07-02): when the bill
    carries BOTH an actuated-valve ASSEMBLY line (N units, actuator included in the
    assembly price) AND a separate bare-actuator line for the same population (qty ≤
    the assemblies' qty), the bare-actuator line double-bills the actuators already
    priced inside the assemblies. Fold it: line_gbp → 0, status IN ASSEMBLY, honest
    basis note. Mutates `rows` in place; returns the number of folded lines. Pure
    noun/qty logic — a bare-actuator line with NO matching assembly line (or a larger
    population than the assemblies can absorb) is left untouched (it genuinely stands
    alone). Universal, no per-class table."""
    assemblies = [r for r in rows
                  if float(r.get("line_gbp") or 0) > 0
                  and _ACTUATED_VALVE_RE.search(str(r.get("requirement", "")).split("·")[0])]
    if not assemblies:
        return 0
    folded = 0
    for r in rows:
        if float(r.get("line_gbp") or 0) <= 0:
            continue
        lead = str(r.get("requirement", "")).split("·")[0]
        if not _BARE_PNEUMATIC_ACTUATOR_RE.search(lead) or _ACTUATED_VALVE_RE.search(lead):
            continue
        qy = int(r.get("qty") or 1)
        host = next((a for a in assemblies if int(a.get("qty") or 1) >= qy), None)
        if host is None:
            continue                      # more actuators than assemblies — stands alone
        r["line_gbp"] = 0
        r["status"] = "IN ASSEMBLY"
        # PARENT LINK (v56c ledger column-contract fix, 2026-07-03): a folded line is an
        # APPORTIONMENT of its host assembly — mark it sub_of so the ledger contract
        # treats it as a child ('incl. in parent'), not a broken qty×unit≠line row.
        _htag = str(host.get("tag") or "").strip()
        r["sub_of"] = _htag if _htag and _htag != "—" else \
            str(host.get("requirement", "")).split("·")[0].strip()
        r["basis"] = (str(r.get("basis", ""))
                      + f" · de-duplicated: these {qy}× actuators are the actuators ON the "
                      f"{int(host.get('qty') or 1)}× actuated-valve assemblies "
                      f"('{str(host.get('requirement','')).split('·')[0].strip()[:40]}') — "
                      f"the assembly line already prices actuator + valve as one unit")
        folded += 1
    return folded


# ── MEMBRANE-FAMILY SYNONYM DE-DUP (benchmark net v56b, 2026-07-03) ──
# THE BUG: the generator emitted the SAME UF stage under three synonym words —
# 'Ultrafiltration Module' (£14,505), 'Uf Module Bank' (£14,505) and 'Uf Membrane Bank'
# (£9,100, area parametric) — and each became its own priced line (£38k for one bank;
# the gate-36 diagnose: "Duplicate UF module + bank lines … double-counted").
# THE RULE (universal — distinguishing-token discipline, no class table): within the
# membrane/filtration family, two lines whose DISTINGUISHING tokens are IDENTICAL after
# dropping the family-generic nouns (membrane/module/bank/element/media …) and
# normalising the stage synonyms (ultrafiltration→uf, reverse osmosis→ro, nano→nf,
# micro→mf) name the SAME physical stage → ONE line survives (the one with a stated
# quantitative driver — the area parametric — else the cheapest), the rest fold to £0
# with an honest MERGED·SYNONYM note. Different STAGE tokens (uf vs ro) or different
# HARDWARE tokens (elements vs housings vs skid) NEVER merge — UF and RO are different
# physical stages; housings are not membranes.
_MEMBRANE_DEDUP_FAMILY_RE = re.compile(
    r"\bmembranes?\b|\bultrafiltrat\w*|\bnanofiltrat\w*|\bmicrofiltrat\w*|"
    r"\breverse\s+osmosis\b|\b(?:ro|uf|nf|mf|edi)\s+(?:membrane|element|module|bank|cartridge)s?\b",
    re.I)
_MEMBRANE_GENERIC_TOKENS = {
    "membrane", "module", "bank", "element", "media", "cartridge", "filtration", "filter",
}


def _membrane_distinguishing_tokens(name):
    """The DISTINGUISHING token set of a membrane-family line name: stage synonyms
    normalised, family-generic nouns dropped, plurals folded. 'Ultrafiltration Module' /
    'Uf Module Bank' / 'Uf Membrane Bank' → {'uf'}; 'Ro Membrane Elements' → {'ro'};
    'Grp Membrane Housings' → {'grp','housing'} (housing is HARDWARE, it distinguishes)."""
    joined = "_".join(re.findall(r"[a-z0-9]+", str(name or "").lower()))
    joined = (joined.replace("reverse_osmosis", "ro").replace("ultrafiltration", "uf")
              .replace("nanofiltration", "nf").replace("microfiltration", "mf")
              .replace("electrodeionization", "edi").replace("electrodeionisation", "edi"))
    out = set()
    for t in joined.split("_"):
        if not t:
            continue
        t = t[:-1] if (t.endswith("s") and len(t) > 3) else t
        if t in _MEMBRANE_GENERIC_TOKENS:
            continue
        out.add(t)
    return frozenset(out)


_ACTUATED_ON_OFF_POP_RE = re.compile(
    r"\b(?:solenoid|pneumatic|electric|motor(?:is|iz)ed|actuated)\b.*\bvalves?\b|"
    r"\bvalves?\b.*\b(?:solenoid|pneumatic|electric|motor(?:is|iz)ed|actuated)\b",
    re.I)
_ACTUATED_ON_OFF_EXCLUDE_RE = re.compile(
    r"\b(?:manual|ball|check|sample|relief|butterfly|gate|needle)\b", re.I)


def _dedupe_actuated_valve_population_rows(rows):
    """Fold synonym ON/OFF actuated-valve POPULATION lines (same qty ≥12) onto ONE
    survivor. INTENT: 'Solenoid Valves ×200' + 'Pneumatic Actuated Valves ×200' +
    'Solenoid Valve ×200' are the SAME 200 valves under synonym labels — leaving all
    three priced DOUBLE/TRIPLE-COUNTS the bill (Codema ship population_duplication +
    £72k over-bill). Manual/ball/check/sample families never fold in. Mutates `rows`;
    returns folded count. Mirrors dropAttributePhantomWords role-key discipline."""
    groups: dict = {}
    for r in rows:
        if r.get("connection") or float(r.get("line_gbp") or 0) <= 0:
            continue
        if str(r.get("status")) in ("SUB-COMPONENT", "MERGED·SYNONYM", "IN ASSEMBLY"):
            continue
        lead = str(r.get("requirement", "")).split("·")[0].strip()
        if lead.startswith("↳"):
            continue
        if not _ACTUATED_ON_OFF_POP_RE.search(lead) or _ACTUATED_ON_OFF_EXCLUDE_RE.search(lead):
            continue
        qy = int(r.get("qty") or 1)
        if qy < 12:
            continue
        groups.setdefault(qy, []).append(r)
    folded = 0
    for qy, grp in groups.items():
        if len(grp) < 2:
            continue
        # Prefer the highest-priced survivor (assembly-priced pneumatic line over a
        # cheap solenoid placeholder) so the bill keeps the credible unit cost.
        grp.sort(key=lambda r: -float(r.get("unit_gbp") or 0))
        survivor = grp[0]
        # GOTCHA: dossier_audit fold-parent check matches sub_of against the parent's
        # requirement/part NAME (not its tag). Always stamp the survivor's lead name.
        survivor_name = str(survivor.get("requirement", "")).split("·")[0].strip()
        merged_names = []
        for r in grp[1:]:
            merged_names.append(
                f"'{str(r.get('requirement', '')).split('·')[0].strip()}' "
                f"(was £{round(float(r.get('line_gbp') or 0)):,})")
            r["line_gbp"] = 0
            r["status"] = "MERGED·SYNONYM"
            r["sub_of"] = survivor_name
            r["basis"] = (
                str(r.get("basis", ""))
                + f" · de-duplicated: names the SAME {qy}-unit on/off actuated-valve "
                f"population as '{survivor_name}' "
                f"— synonym line folded into it (one population, one price)")
            folded += 1
        if merged_names:
            survivor["basis"] = (
                str(survivor.get("basis", ""))
                + f" · merged synonym population line(s): {', '.join(merged_names)}")
    return folded


def _dedupe_membrane_synonym_rows(rows):
    """Fold membrane-family SYNONYM lines (identical distinguishing tokens) onto one
    survivor: survivor keeps its price (area-parametric driver preferred, else cheapest),
    qty = max across the group, basis lists the merged source names; folded lines →
    line_gbp 0 + MERGED·SYNONYM + honest note. Mutates `rows`; returns folded count.
    UF vs RO / elements vs housings vs skid are different token sets → never merged."""
    groups = {}
    for r in rows:
        if r.get("connection") or float(r.get("line_gbp") or 0) <= 0:
            continue
        if str(r.get("status")) == "SUB-COMPONENT":
            continue
        lead = str(r.get("requirement", "")).split("·")[0].strip()
        if lead.startswith("↳") or not _MEMBRANE_DEDUP_FAMILY_RE.search(lead):
            continue
        key = _membrane_distinguishing_tokens(lead)
        if not key:
            continue
        groups.setdefault(key, []).append(r)
    folded = 0
    for key, grp in groups.items():
        if len(grp) < 2:
            continue

        def _rank(r):
            b = str(r.get("basis", ""))
            has_driver = ("membrane-area parametric" in b or "membrane-housing parametric" in b)
            return (0 if has_driver else 1, float(r.get("line_gbp") or 0))

        grp.sort(key=_rank)
        survivor = grp[0]
        merged_names = []
        for r in grp[1:]:
            merged_names.append(f"'{str(r.get('requirement', '')).split('·')[0].strip()}' "
                                f"(was £{round(float(r.get('line_gbp') or 0)):,})")
            r["line_gbp"] = 0
            r["status"] = "MERGED·SYNONYM"
            # PARENT LINK (v56c ledger column-contract fix, 2026-07-03): a merged synonym
            # is an apportionment of its survivor — mark it sub_of so the ledger contract
            # treats it as a child ('incl. in parent'), not a broken qty×unit≠line row.
            _stag = str(survivor.get("tag") or "").strip()
            r["sub_of"] = _stag if _stag and _stag != "—" else \
                str(survivor.get("requirement", "")).split("·")[0].strip()
            r["basis"] = (str(r.get("basis", ""))
                          + f" · de-duplicated: names the SAME {'/'.join(sorted(key)).upper()} stage as "
                          f"'{str(survivor.get('requirement', '')).split('·')[0].strip()}' — synonym line "
                          f"folded into it (one physical bank, one price)")
            folded += 1
        survivor["qty"] = max(int(g.get("qty") or 1) for g in grp)
        survivor["line_gbp"] = round(float(survivor.get("unit_gbp") or 0) * int(survivor.get("qty") or 1)) \
            if float(survivor.get("unit_gbp") or 0) > 0 else survivor.get("line_gbp")
        survivor["basis"] = (str(survivor.get("basis", ""))
                             + f" · merged synonym line(s): {', '.join(merged_names)}")
    return folded


# ── DUTY-SCALED CLASS-REFERENCE BUDGET (council 2026-06-19) ──
# A large mechanical-equipment price should be EXPLICIT and auditable, not an
# unexplained outlier. A heat pump / compressor / chiller / blower scales its cost
# from a class-reference base price by (duty_kw / reference_duty_kw)^0.6 (the
# standard six-tenths cost-capacity rule for process equipment). So e.g. a 1,493 kW
# heat pump = £6,000 × (1493 / 5)^0.6 ≈ £28,617 reads as a derivation, not a magic
# number. Universal: keyed off the equipment NOUN, no per-class table; a noun that
# is not in this reference set returns None (untouched). This sits ALONGSIDE the
# £/kW band in _RATING_COST_MODELS — it is the auditable basis string, and is only
# ever used to EXPLAIN/raise a price, never to lower one.
# Each entry: noun regex → (reference_base_gbp, reference_duty_kw, label).
_CLASS_REFERENCE_EQUIPMENT = [
    (re.compile(r"heat[_ -]?pump", re.I), (6000.0, 5.0, "heat pump")),
    (re.compile(r"\bcompressor\b|scroll[_ -]?compressor|screw[_ -]?compressor", re.I),
     (5000.0, 5.0, "compressor")),
    (re.compile(r"chiller|refrigerat\w+[_ -]?(?:unit|skid|plant)", re.I), (8000.0, 10.0, "chiller")),
    (re.compile(r"\bblower\b|aerat\w*[_ -]?blower|air[_ -]?blower|roots[_ -]?blower|"
                r"lobe[_ -]?blower|degass\w*[_ -]?blower", re.I), (6000.0, 5.0, "blower")),
]


def _duty_scaled_class_budget(name: str, kw):
    """Auditable class-reference budget (£, basis) for a mechanical-equipment line —
    heat pump / compressor / chiller / blower — scaled from a reference base price by
    (duty_kw / reference_duty_kw)^0.6 (the six-tenths cost-capacity rule). Returns
    (gbp, basis) or None when the noun is not a referenced mechanical class or no kW
    is available. Universal, deterministic, no per-class table. The basis string
    makes the number explicit, e.g. '£6,000 × (1493/5)^0.6 = £28,617 (heat pump)'."""
    if kw is None or kw <= 0:
        return None
    for rx, (base, ref_kw, label) in _CLASS_REFERENCE_EQUIPMENT:
        if rx.search(name or "") and ref_kw > 0:
            gbp = base * (kw / ref_kw) ** 0.6
            basis = (f"class-reference budget: £{base:,.0f} × ({kw:g}/{ref_kw:g})^0.6 "
                     f"= £{gbp:,.0f} ({label}; six-tenths cost-capacity rule)")
            return (gbp, basis)
    return None


# ── COMMODITY CATALOGUE SANITY CAP (council 2026-06-16/17) ──
# A line carrying a STRUCTURED catalogue part number for a commodity electronic /
# IC / cable / fastener / small instrument must be priced from its catalogue list
# price, and must NEVER exceed a sane multiple of it. The council found a TI
# TMP451 temperature-sensor IC at £692 vs £1.40 catalogue (494×), an MSP430 at
# £692 vs £6.43 (108×), a StarTech patch cable at £1,298 vs £6.14 (211×), a
# Honeywell DP switch at £8,652 vs £39 (219×). Those are bespoke-priced commodity
# parts. When a real distributor/catalogue price is known, cap the rendered price
# at ≤ COMMODITY_CAP_MULT × it. Universal: keyed off the commodity NOUN, no
# per-archetype table.
COMMODITY_CAP_MULT = 3.0
# Cost-band multiplier mirroring the deterministic verifier (gate-21 ">5× = wrong"):
# a named catalogue MPN whose own reference price is > this factor BELOW the duty-
# rated price is undersized for the duty and must be rejected. One number, shared
# meaning across the engine and the off-budget check.
COST_BAND_FACTOR = 5.0
# Commodity nouns: small electronics / ICs / cables / connectors / fasteners /
# small instruments — kit whose unit price is a catalogue number, never a bespoke
# fabrication. (A power transformer / switchgear / motor is NOT here — those are
# rating-priced.) A line is commodity ONLY if it ALSO carries a structured PN.
_COMMODITY_NOUN_RE = re.compile(
    r"\bsensor\b|\bic\b|microcontroller|\bmcu\b|temperature[_ -]?sensor|"
    r"voltage[_ -]?sensor|current[_ -]?sensor|thermistor|thermocouple|\brtd\b|"
    r"transducer|\bprobe\b|patch[_ -]?(?:cable|lead|cord)|ethernet[_ -]?cable|"
    r"\bcable\b|\bcord\b|\bjumper\b|\bconnector\b|\bplug\b|\bsocket\b|terminal[_ -]?block|"
    r"\bfastener|\bbolt\b|\bscrew\b|\bnut\b|\bwasher\b|\bgland\b|cable[_ -]?gland|"
    r"\bfuse\b|fuse[_ -]?holder|\bled\b|\bdiode\b|\bresistor\b|\bcapacitor\b|"
    r"pressure[_ -]?switch|differential[_ -]?pressure|\bdp[_ -]?switch\b|limit[_ -]?switch|"
    r"push[_ -]?button|indicator[_ -]?light|\brelay\b|\bgateway\b|network[_ -]?switch|"
    r"signal[_ -]?conditioner|i/?o[_ -]?module|terminal\b|"
    # Per-cell / per-module electrical COMMODITY sub-components (Tristan 2026-06-24, UNIVERSAL):
    # a cell-to-cell busbar, tap/sense wire, insulation pad, cell link, lug or ferrule is a tiny
    # high-quantity commodity (~£1–20), NOT a principal. Without these a BESS cell busbar was
    # corpus-lifted £120→£452 (corpus median £585 is for LARGE power-distribution busbars) — a
    # ~90× over-bill across 3,735 units. Same family as the instrument material-take-off bug.
    r"bus[_ -]?bar|busbar|tap[_ -]?(?:wire|lead)|voltage[_ -]?tap|sense[_ -]?(?:wire|lead)|"
    r"insulation[_ -]?pad|cell[_ -]?link|interconnect[_ -]?(?:bar|link)|\blug\b|\bferrule\b",
    re.I)
# A structured part number: alphanumeric with a separator OR a long alphanumeric
# run (looks like a real SKU), ≥5 chars — the same shape gate-20 uses. A bare
# descriptive token ("M6 bolt", "generic", "TBD") is NOT structured → falls back
# to the rating model / floor, not a catalogue cap.
_STRUCTURED_PN_RE = re.compile(r"^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9\-_/.]{4,}$")


def _is_structured_pn(pn: str) -> bool:
    pn = (pn or "").strip()
    if len(pn) < 5 or _TBD_RE.search(pn):
        return False
    if re.fullmatch(r"(?i)m\d+|m\d+x\d+|generic|tbd|n/?a|standard", pn):
        return False
    return bool(_STRUCTURED_PN_RE.match(pn))


# a GENERIC bespoke/fabrication placeholder ('bespoke vessel', 'made-to-order
# fabrication', 'fabricated compressor-suction knock-out drum') NAMES ITS OWN
# genericness — this is what `_detect_borrowed_identities` must never flag as a
# collision (SAF oxccu-saf-v21 D-102/D-103: two genuinely distinct bespoke
# separators, correctly both this shape). A REAL manufacturer's product-family
# name with no digit-bearing model code (GEA's 'FLUIDBED VIBRO-FLUIDISER') does
# NOT use this language — it names a specific product, just without a numeric
# suffix — so it is not caught by this placeholder pattern.
_BESPOKE_PLACEHOLDER_PN_RE = re.compile(
    r"\bbespoke\b|\bmade[- ]?to[- ]?(?:order|spec)\b|\bcustom\b|\bfabricat\w*\b|"
    r"\bengineered[- ]?to[- ]?order\b", re.I)


def _is_identity_bearing_pn(pn: str) -> bool:
    """True for a `part_number` value that plausibly identifies ONE specific real
    part — either a STRUCTURED catalogue MPN (`_is_structured_pn`: has a digit, no
    spaces) or a non-structured but still SPECIFIC descriptive product-family name
    (a real manufacturer's product line named without a numeric model code — e.g.
    'FLUIDBED VIBRO-FLUIDISER'). False for a GENERIC bespoke/fabrication
    placeholder (see `_BESPOKE_PLACEHOLDER_PN_RE`) that is legitimately reused
    verbatim across many genuinely-different made-to-order items.

    Used by `_detect_borrowed_identities` (2026-07-06, CO₂-mineralisation
    out/co2-campaign-v5 E-101/E-107): the prior `_is_structured_pn`-only gate could
    never catch a collision where the copied identity is itself non-numeric — GEA's
    real MPN was emitted as its bare product-FAMILY name ('FLUIDBED VIBRO-
    FLUIDISER', no digits), so the SAME collision-detection discipline that already
    catches a numeric MPN copied onto an unrelated word must also catch a
    descriptive-but-specific one, without reopening the SAF bespoke-placeholder
    false-positive the digit-only gate was originally protecting against.
    proveCatch (both directions) in `_selftest`."""
    pn = (pn or "").strip()
    if not pn or len(pn) < 5 or _TBD_RE.search(pn):
        return False
    if _is_structured_pn(pn):
        return True
    return not _BESPOKE_PLACEHOLDER_PN_RE.search(pn)


def _commodity_catalogue_cap(name: str, pn: str, gbp: float, cat_price):
    """Cap a commodity catalogue line at ≤ COMMODITY_CAP_MULT × its catalogue/list
    price. Applies ONLY when (a) the noun is a commodity, (b) the line carries a
    structured PN, and (c) a real catalogue/distributor price is known. Returns
    (gbp, basis_suffix_or_None). A commodity with NO catalogue price is left for
    the rating model / floor — never a fixed inflated number."""
    if cat_price is None or cat_price <= 0:
        return (gbp, None)
    if not (_COMMODITY_NOUN_RE.search(name or "") and _is_structured_pn(pn)):
        return (gbp, None)
    ceiling = COMMODITY_CAP_MULT * float(cat_price)
    if gbp is None or gbp <= 0:
        return (float(cat_price), f"catalogue · list £{float(cat_price):,.2f} (commodity, no estimate)")
    if gbp > ceiling:
        return (ceiling, f"catalogue · capped at {COMMODITY_CAP_MULT:.0f}× list £{float(cat_price):,.2f} "
                         f"(was £{gbp:,.0f}, {gbp/float(cat_price):.0f}× list)")
    return (gbp, None)


# ── BARE-COMMODITY HARD CEILING (council 2026-06-17, the marine-RAS mis-PIN) ──
# The catalogue cap above needs a resolved catalogue price. But a mis-PINNED
# commodity often has NONE — the structured PN lives only in partVerifications, or
# the price came back £0, or the wrong-part-class label hides the real SKU (a TI
# TMP451 temp IC labelled "Network Switch"; an MSP430 microcontroller at £752). For
# those, a wrong-part-class label IS the signal: a bare IC / sensor IC / micro-
# controller / connector / cable / I/O / small comms device CANNOT cost more than a
# few hundred pounds unless it is a real field INSTRUMENT carrying a kW/duty rating.
# This is a deterministic upper sanity bound by commodity sub-class, applied when a
# commodity line has NO rating — so a mis-pin can never reach £752 / £9,406 even
# when its catalogue price never resolves. Universal: keyed off the commodity NOUN,
# no per-archetype table; a genuine rated instrument (carries kW/duty) is exempt.
#
# The ceiling targets the MICROELECTRONIC / bare-catalogue-component class ONLY —
# NOT a genuine field INSTRUMENT (a process pH/ORP/RTD probe, an in-line analyser),
# NOT mechanical process kit whose name merely contains a commodity token (a screw
# CONVEYOR, a cable-TRANSIT frame, a feed HOPPER). It is a deliberately NARROW net
# so it catches the mis-PIN (a TMP451 IC / MSP430 micro / MEMS DP-switch labelled as
# a "Local Sensor" / "Network Switch" / "DP Switch") without ever re-pricing a real
# instrument. Sub-class ceilings (UK 2026 generous upper bound):
#   bare IC / microcontroller / sensor-IC / LED / diode / resistor / capacitor: £150
#   connector / patch-lead / gland / fuse / push-button / indicator:           £300
#   bare switch-IC / DP-switch / network-comms / I/O / gateway / signal cond.:  £500
_COMMODITY_CEILING_TIERS = [
    (re.compile(r"\bic\b|microcontroller|\bmcu\b|sensor[_ -]?ic|local[_ -]?sensor|"
                r"\bled\b|\bdiode\b|\bresistor\b|\bcapacitor\b", re.I), 150.0),
    (re.compile(r"\bconnector\b|\bplug\b|\bsocket\b|patch[_ -]?(?:cable|lead|cord)|"
                r"\bjumper\b|cable[_ -]?gland|fuse[_ -]?holder|\bfuse\b|"
                r"push[_ -]?button|indicator[_ -]?light", re.I), 300.0),
    (re.compile(r"differential[_ -]?pressure[_ -]?switch|\bdp[_ -]?switch\b|"
                r"network[_ -]?switch|ethernet[_ -]?switch|\bgateway\b|i/?o[_ -]?module|"
                r"signal[_ -]?conditioner", re.I), 500.0),
]
# A BARE generic instrument noun ("Temperature Sensor", "Voltage Sensor") with NO
# process/context qualifier is a catalogue commodity too (the mis-pinned RAS
# Mitsubishi/TI sensor lines). But a QUALIFIED instrument ("reactor temperature
# sensor", "in-line pH probe") is a genuine sized field instrument → NOT capped.
_BARE_SENSOR_RE = re.compile(
    r"^(?:temperature|voltage|current|level|flow|pressure)?[_ -]?sensor$", re.I)
# Process / field-instrument context that EXEMPTS a line from the bare-commodity
# ceiling — a real instrument (probe / analyser / transmitter) or mechanical process
# kit whose name merely contains a commodity token (conveyor / transit / hopper /
# screw-feeder / valve / pump). These are never bare micro-parts.
_INSTRUMENT_OR_MECH_EXEMPT_RE = re.compile(
    r"\bprobe\b|analy[sz]er|transmitter|\bgauge\b|\bmeter\b|"
    r"conveyor|transit|hopper|feeder|\bscrew\b|\bvalve\b|\bpump\b|\bblower\b|"
    r"\bframe\b|\bskid\b|\bpanel\b|\bcabinet\b|\bactuator\b|"
    r"reactor|column|vessel|in[_ -]?line|process[_ -]?", re.I)


def _commodity_ceiling(name: str):
    """Hard upper-bound £ for a bare MICROELECTRONIC / catalogue-component line of
    this NOUN, else None. A genuine field instrument (probe/analyser/transmitter) or
    mechanical process kit whose name merely contains a commodity token (screw
    conveyor, cable-transit frame, feed hopper) is EXEMPT. Deterministic, no class
    table."""
    nm = name or ""
    if _INSTRUMENT_OR_MECH_EXEMPT_RE.search(nm):
        return None
    for rx, cap in _COMMODITY_CEILING_TIERS:
        if rx.search(nm):
            return cap
    if _BARE_SENSOR_RE.match(nm.strip()):
        return 500.0   # a bare unqualified sensor noun — a catalogue commodity
    return None        # not a recognised bare micro-part → leave to other paths


def _is_rated_instrument(md: dict, name: str = "", requirement: str = "") -> bool:
    """True if the line carries a real kW/kVA power/duty rating — a genuine sized
    instrument/equipment, NOT a bare catalogue commodity. Such a line is EXEMPT
    from the bare-commodity ceiling (its price is rating-driven, not catalogue)."""
    kw, _ = _rating_kw(md if isinstance(md, dict) else {}, name, requirement)
    return kw is not None and kw > 0


def _apply_commodity_ceiling(name: str, md: dict, gbp: float, requirement: str = ""):
    """Bound a bare-commodity line's price by its sub-class ceiling. Returns
    (gbp, basis_suffix_or_None). No-op for a non-commodity noun, a rated
    instrument (carries kW/duty), or a price already under the ceiling."""
    if gbp is None or gbp <= 0:
        return (gbp, None)
    if _is_rated_instrument(md, name, requirement):
        return (gbp, None)
    cap = _commodity_ceiling(name)
    if cap is not None and gbp > cap:
        return (cap, f"commodity ceiling · capped at £{cap:,.0f} for a bare "
                     f"{name.strip().lower()} (was £{gbp:,.0f}; no kW/duty rating — "
                     f"a catalogue part, not a bespoke instrument)")
    return (gbp, None)


# ── PART-NUMBER-DERIVED COMMODITY CLASS (council 2026-06-17, the marine-RAS mis-PIN
# that SURVIVED gate 21) ──
# The name-keyed ceiling above is fooled by the EXACT mis-PIN shape: the human
# DESCRIPTION claims a field device ("Local Sensor", "Differential-Pressure
# Switch", "Non-Return Valve") but the PART NUMBER is a bare commodity IC /
# microcontroller / board-mount MEMS sensor / commodity-SKU component. The
# description is the mis-pin; the PN is the truth. A "Local Sensor" whose PN is a
# TI TMP451 temperature IC must be priced as the IC (£1.58 catalogue → £150
# ceiling), NOT as an industrial sensor — and a "Non-Return Valve" whose PN is a
# bare Crouzet commodity SKU is NOT exempted by the word "valve".
#
# This resolves the ceiling tier from the PART NUMBER (+ manufacturer) REGARDLESS
# of the description. Two universal signals, no per-part table:
#   (a) MANUFACTURER is a semiconductor / board-mount-component vendor (TI,
#       Microchip, NXP, STMicro, Analog Devices, Infineon, Bosch Sensortec, …) —
#       these vendors make CHIPS, never the field transmitters/valves an EPC would
#       bespoke-price; OR Honeywell's board-mount sensor-IC series (HSC/SSC/ABP/
#       MPR TruStability — an SMD MEMS die on a PCB, a catalogue commodity, NOT a
#       Honeywell process transmitter like an STD/SMV/ML series).
#   (b) PART-NUMBER SHAPE matches a known commodity-silicon family (TMP/MSP/LM/
#       ATmega/PIC/STM32/MAX/ADXL … microcontroller + sensor-IC prefixes).
# A GENUINE field-instrument PN — a real Endress+Hauser / Krohne / Vega / Yokogawa
# / Rosemount / Siemens-Sitrans / Honeywell-STD process transmitter series, or any
# line carrying a kW/duty rating — is NOT a commodity (returns None → never capped).
_SEMICONDUCTOR_MFR_RE = re.compile(
    r"texas[_ ]?instr|\bti\b|microchip|atmel|\bnxp\b|st[_ ]?micro|stmicro|"
    r"analog[_ ]?devices|\badi\b|infineon|bosch[_ ]?sensortec|maxim|on[_ ]?semi|"
    r"onsemi|renesas|nordic[_ ]?semi|espressif|silicon[_ ]?labs|silabs|"
    r"vishay|diodes[_ ]?inc|rohm|toshiba[_ ]?semi|micron|cypress|dialog[_ ]?semi",
    re.I)
# Honeywell board-mount sensor-IC series (commodity SMD MEMS, NOT a process
# transmitter): TruStability HSC/SSC/ABP/MPR + the basic-board-mount families.
_HONEYWELL_SENSOR_IC_RE = re.compile(r"^(?:HSC|SSC|ABP|MPR|NBP|RSC|TBP)[A-Z]", re.I)
# Commodity-silicon part-number families (microcontroller / sensor-IC / op-amp /
# logic prefixes that are unambiguously a chip, whatever the line is labelled).
_COMMODITY_SILICON_PN_RE = re.compile(
    r"^(?:TMP\d|MSP430|LM\d|TL\d|ATMEGA|ATTINY|PIC\d{2}|PIC16|PIC18|PIC32|"
    r"STM32|STM8|MAX\d{3,}|ADXL|ADS\d|MCP\d|NE555|ESP32|ESP8266|"
    r"BME\d{3}|BMP\d{3}|BNO\d{3}|SHT\d|DHT\d|DS18B20|HDC\d|SI70\d{2})",
    re.I)
# Genuine industrial field-INSTRUMENT manufacturer/series that must STAY exempt
# (a real process transmitter/analyser an EPC tenders — never a commodity chip).
_FIELD_INSTRUMENT_MFR_RE = re.compile(
    r"endress|hauser|\be\+h\b|krohne|\bvega\b|yokogawa|rosemount|emerson[_ ]?process|"
    r"siemens[_ ]?sitrans|sitrans|\babb\b[_ ]?(?:measure|instrument)|hach|"
    r"mettler[_ ]?toledo|wika|ifm[_ ]?electronic|\bbürkert\b|burkert|georg[_ ]?fischer|"
    r"\bgf[_ ]?signet\b|prosonic|deltabar|cerabar|liquiline",
    re.I)


def _commodity_pn_class(pn: str, mfr: str = "") -> float:
    """Bare-commodity ceiling (£) implied by a PART NUMBER (+ manufacturer) when it
    is unambiguously a catalogue chip / microcontroller / board-mount sensor-IC /
    commodity component, else None. PN-OVER-DESCRIPTION: this ignores the line's
    human description entirely (the description is the mis-pin). A genuine field-
    instrument series (E+H / Krohne / Rosemount / Honeywell-STD …) returns None.
    Deterministic, universal — no per-part table."""
    pn = (pn or "").strip()
    mfr = (mfr or "").strip()
    if not pn or _TBD_RE.search(pn):
        # PN unknown/TBD — fall back to the manufacturer signal alone.
        if mfr and _FIELD_INSTRUMENT_MFR_RE.search(mfr):
            return None
        if mfr and _SEMICONDUCTOR_MFR_RE.search(mfr):
            return 150.0       # a chip-vendor part with no resolvable PN → IC tier
        return None
    # A real field-instrument series is NEVER a commodity, whatever the vendor list.
    if _FIELD_INSTRUMENT_MFR_RE.search(mfr) or _FIELD_INSTRUMENT_MFR_RE.search(pn):
        return None
    # Microcontroller / sensor-IC silicon family → IC tier (£150).
    if _COMMODITY_SILICON_PN_RE.match(pn):
        return 150.0
    # Honeywell board-mount sensor-IC (HSC/SSC/ABP/MPR …) → IC tier (£150). A
    # Honeywell PROCESS transmitter (STD/SMV/ML series) does NOT match this prefix.
    if re.search(r"honeywell", mfr, re.I) and _HONEYWELL_SENSOR_IC_RE.match(pn):
        return 150.0
    # Any other part from a pure semiconductor / board-mount-component vendor: a
    # chip-house never makes a bespoke field device, so its catalogue SKU is a
    # commodity. Connector/cable shape → £300 tier; otherwise the IC tier (£150).
    if _SEMICONDUCTOR_MFR_RE.search(mfr):
        return 150.0
    return None


def _bare_commodity_ceiling(name: str, pn: str, md: dict, requirement: str = "",
                            mfr: str = ""):
    """Unified bare-commodity ceiling (£) for a line, PN-OVER-DESCRIPTION, else
    None. Takes the TIGHTER (lower) of the PN-derived class ceiling and the
    name-derived ceiling — so a mis-PINNED 'Local Sensor' (PN = TMP451 IC) is
    capped at the £150 IC tier even though the name alone would give £500, and a
    'Non-Return Valve' (PN = bare Crouzet commodity SKU) is capped even though the
    word 'valve' would otherwise exempt it by name. A line carrying a kW/duty
    rating, or a genuine field-instrument PN, returns None (never capped)."""
    if _is_rated_instrument(md if isinstance(md, dict) else {}, name, requirement):
        return None
    pn_cap = _commodity_pn_class(pn, mfr)
    name_cap = _commodity_ceiling(name)
    caps = [c for c in (pn_cap, name_cap) if c is not None]
    return min(caps) if caps else None


def _unit_operation_price(name: str, md: dict, q):
    """Per-UNIT-OPERATION parametric for a process unit the catalogue couldn't pin
    (council 2026-06-16, the £12,300 copy-paste-stub fix). The old code gave Protein
    Skimming / UV Sterilisation / Oxygenation / Heat Exchanger an IDENTICAL £12,300
    flat stub. Instead, each is priced from its CARRIED DUTY (the contract quantity
    or the word's own rating), so the four units no longer collapse to one number.

    Returns (gbp, basis) or None if there is no model for this unit (caller then
    labels it a visible 'budget allowance — vendor TBD', not a silent placeholder).
    Universal: keyed off the unit NOUN + a duty read, no per-archetype table."""
    nm = (name or "").lower()
    rating = _num(md.get("rating_primary"))

    def _qv(*keys, default=None):
        for k in keys:
            v = q.get(k) if isinstance(q, dict) else None
            if isinstance(v, dict):
                v = v.get("value")
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return default

    # UV / ozone disinfection — £/kW of installed LAMP power. The lamp power is
    # NEVER a flow read as kW (v55: '90 m³/h' flowed into `rating` and priced a
    # £90k '60 kW' UV on a plant whose real UV draw is ~2-4 kW). Resolution order:
    #   1. an explicit contract LAMP/POWER quantity (uv_*_power_kw family);
    #   2. the line's own rating ONLY when it is a POWER (unit-checked);
    #   3. the UV DOSE RULE from the FLOW quantity: P[kW] = Q[m³/h] × dose[mJ/cm²]
    #      ÷ UVT-factor — dose 40 mJ/cm² (potable, DVGW/USEPA validated point),
    #      UVT-factor 1800 ≈ 22 Wh/m³ delivered electrical at UVT ~85% with
    #      low-pressure lamp + ballast efficiency (a 90 m³/h potable duty → 2.0 kW).
    if re.search(r"\buv\b|ultraviolet|ozone|disinfect|steril", nm):
        _UV_DOSE_MJ_CM2 = 40.0     # potable-water validated dose
        _UV_UVT_FACTOR = 1800.0    # (m³/h·mJ/cm²) per kW — UVT ~85 %, LP lamp+ballast
        _rp_unit = str(md.get("rating_primary_unit") or "")
        _rp_blob = f"{md.get('rating_primary') or ''} {_rp_unit}"
        _rp_is_power = bool(re.search(r"\b\d[\d.]*\s*(?:k|m)?w\b|^\s*k?w\s*$",
                                      _rp_blob, re.I)) or re.fullmatch(r"k?w", _rp_unit.strip(), re.I)
        _rp_is_flow = bool(re.search(r"m\s*[³^]?\s*3?\s*/?\s*h|l\s*/?\s*(?:min|s|h)|gpm",
                                     _rp_blob, re.I))
        kw = _qv("uv_lamp_power_kw", "uv_installed_power_kw", "uv_disinfection_power_kw",
                 "uv_power_kw", "disinfection_power_kw",
                 default=(rating if _rp_is_power else None))
        _kw_basis = "contract lamp-power quantity" if not (_rp_is_power and kw == rating) \
            else "the line's own kW rating"
        if not (kw and kw > 0):
            flow = _qv("uv_disinfection_throughput_m3_h", "uv_flow_m3_h",
                       "disinfection_flow_m3_h", "uv_throughput_m3_h",
                       default=(rating if _rp_is_flow else None))
            if flow and flow > 0:
                kw = flow * _UV_DOSE_MJ_CM2 / _UV_UVT_FACTOR
                _kw_basis = (f"dose rule: {flow:.0f} m³/h × {_UV_DOSE_MJ_CM2:.0f} mJ/cm² "
                             f"(potable) ÷ {_UV_UVT_FACTOR:.0f} UVT-factor (UVT ~85 %, LP lamp)")
        if kw and kw > 0:
            gbp = 4000.0 + kw * 2200.0
            return gbp, (f"UV/ozone parametric: {kw:.1f} kW lamp power ({_kw_basis}) "
                         f"× £2,200/kW + £4k reactor/controls (LP-UV skid, UK-2026)")
        return 35000.0, "UV/ozone budget: mid-size disinfection skid (duty unstated)"

    # Oxygenation — LOX skid + oxygen-transfer cones, £/kg·h of oxygen supply.
    if re.search(r"oxygenat|oxygen[_ ]?cone|speece|\blox\b|oxygen[_ ]?system|oxygen[_ ]?supply", nm):
        kgh = _qv("oxygen_supply_kg_h", default=rating)
        if kgh and kgh > 0:
            gbp = 45000.0 + kgh * 1100.0   # LOX tank/vaporiser/cones + dissolution
            return gbp, f"oxygenation parametric: {kgh:.0f} kg/h O₂ × £1,100/(kg·h) + £45k LOX skid + cones"
        return 80000.0, "oxygenation budget: LOX skid + Speece cones (duty unstated)"

    # Protein skimmer / foam fractionator — £/(m³·h) of treated side-stream flow.
    if re.search(r"protein[_ ]?skim|foam[_ ]?fraction|skimmer|fractionator", nm):
        flow = _qv("skimmer_flow_m3_h", default=rating)
        if flow and flow > 0:
            gbp = 12000.0 + flow * 180.0
            return gbp, f"foam-fractionator parametric: {flow:.0f} m³/h × £180/(m³·h) + £12k vessel/pump"
        return 28000.0, "foam-fractionator budget: side-stream protein skimmer (flow unstated)"

    # Heat exchanger — £/kW of thermal duty (plate/shell-and-tube, £/kW installed).
    if re.search(r"heat[_ ]?exchang|\bhx\b|plate[_ ]?exchang|shell[_ ]?and[_ ]?tube|economiser", nm):
        kw = _qv("hx_duty_kw", "heating_duty_kw", default=rating)
        if kw and kw > 0:
            gbp = 4000.0 + kw * 220.0
            return gbp, f"heat-exchanger parametric: {kw:.0f} kW duty × £220/kW + £4k frame/connections"
        return 14000.0, "heat-exchanger budget: process plate exchanger (duty unstated)"

    # Distribution manifold station — the zoned-delivery per-group header (rule-8 principal:
    # delivery header + isolation/non-return valves + gauge tappings + supports, fabricated
    # thermoplastic/stainless). Priced from its delivery FLOW duty; supply-only materials
    # (this bill is raw materials; the cost stack adds field labour). Without this family the
    # word fell to the £3 'manifold' commodity floor (2026-07-03 — a £6 line for the plant's
    # per-department distribution header).
    if re.search(r"(distribution|delivery|zone)[_ ]?manifold|manifold[_ ]?(station|set|assembly|skid)", nm):
        flow = _qv("distribution_manifold_throughput_m3_h", default=rating)
        if flow and flow > 0:
            gbp = 600.0 + flow * 25.0
            return gbp, (f"distribution-manifold parametric: {flow:.0f} m³/h delivery duty × £25/(m³·h) "
                         f"+ £600 base — fabricated header + isolation/non-return valves + gauge tappings "
                         f"+ supports (supply-only materials; field labour in the cost stack)")
        return 1500.0, "distribution-manifold budget: per-group delivery header station (duty unstated)"

    # Media-bed vessel (GAC / softener / adsorber / polisher) — packaged pressure vessel
    # + media + underdrain + valve nest. Priced from treated FLOW (m³/h). Without this
    # family an IDENTIFIED media-bag MPN (General Carbon HP-1000 £105) survived as the
    # vessel line while partVerifications carried the ~£14.7k physics assembly
    # (codema-full-20260709-1359 V-101 COST FAIL). Universal: noun + flow duty.
    if re.search(
        r"\bgac\b|granular.?activ|activated.?carbon|media.?bed|"
        r"\bsoftener\b|adsorber|polisher|ion.?exchange|carbon.?filter",
        nm,
    ):
        flow = _qv(
            "gac_filter_throughput_m3_h", "gac_softener_throughput_m3_h",
            "softener_throughput_m3_h", "gac_throughput_m3_h",
            "filter_throughput_m3_h", "makeup_water_flow_m3_h",
            default=rating,
        )
        if flow and flow > 0:
            # Shell + media + underdrain + valve nest + instruments + skid — mirrors
            # universal-contract-sizing.ts media-bed subassembly at the same duty.
            gbp = 8500.0 + flow * 430.0
            return gbp, (
                f"media-bed vessel parametric: {flow:.1f} m³/h × £430/(m³·h) + £8.5k "
                f"shell/underdrain/valve-nest/skid (packaged GAC/softener, UK-2026)"
            )
        return 14000.0, "media-bed vessel budget: packaged filter/softener (duty unstated)"

    return None


# ── UNIVERSAL RATING-BASED EQUIPMENT COST MODEL (council 2026-06-16/17) ──
# The BoM was untrustworthy in BOTH directions: the same 94 kW circulation pump
# rendered at £35 (an LLM under-estimate stamped on price_estimate_gbp) while a
# 1000 kVA genset rendered at £293k (£293/kVA, ~2× the market mid) and an 11 kW
# blower at £923/kW. Equipment with a real RATING must price from a deterministic
# £/kW (or £/kVA) curve grounded to UK-2026 installed-cost market mid-points —
# NOT from whatever number an upstream LLM stamped, which swings either way.
#
# Each entry: noun regex → (lo £/kW, mid £/kW, hi £/kW, min installed £, label).
# Bands are INSTALLED cost (supply + erect + connect), UK 2026, from process-plant
# cost guides + the council's own stated bands (genset £150-400/kVA; aeration
# blower £300-800/kW; heat pump £400-900/kW thermal). The `min` floor stops a
# very small unit (e.g. a 1 kW gearmotor) collapsing to a few pounds — small kit
# has a higher effective £/kW. Universal: keyed off the equipment NOUN only, no
# per-archetype / per-class table. ORDER MATTERS — most specific noun first.
_RATING_COST_MODELS = [
    # ── rotating / power-rated process kit (£/kW) ──
    (re.compile(r"variable[_ -]?speed[_ -]?drive|\bvsd\b|\bvfd\b|inverter[_ -]?drive|soft[_ -]?start", re.I),
     (60.0, 110.0, 200.0, 350.0, "variable-speed drive @ £/kW")),
    (re.compile(r"gear[_ -]?motor|gearmotor|geared[_ -]?motor", re.I),
     (120.0, 220.0, 420.0, 600.0, "gearmotor @ £/kW")),
    (re.compile(r"\bmotor\b|drive[_ -]?motor|electric[_ -]?motor", re.I),
     (80.0, 150.0, 280.0, 450.0, "electric motor @ £/kW")),
    (re.compile(r"\bblower\b|aerat\w*[_ -]?blower|air[_ -]?blower|roots[_ -]?blower|lobe[_ -]?blower", re.I),
     (300.0, 550.0, 900.0, 6000.0, "aeration/process blower @ £/kW")),
    (re.compile(r"\bcompressor\b|scroll[_ -]?compressor|screw[_ -]?compressor", re.I),
     (250.0, 500.0, 950.0, 4000.0, "compressor @ £/kW")),
    (re.compile(r"heat[_ -]?pump", re.I),
     (400.0, 650.0, 1000.0, 9000.0, "heat pump @ £/kW thermal")),
    (re.compile(r"chiller|refrigerat\w+[_ -]?(?:unit|skid|plant)", re.I),
     (350.0, 600.0, 1100.0, 8000.0, "chiller @ £/kW thermal")),
    (re.compile(r"heat[_ -]?exchang\w*|\bhx\b|plate[_ -]?exchang|shell[_ -]?and[_ -]?tube|economiser", re.I),
     (120.0, 220.0, 420.0, 3000.0, "heat exchanger @ £/kW duty")),
    (re.compile(r"\bfan\b|extract[_ -]?fan|supply[_ -]?fan|axial[_ -]?fan|centrifugal[_ -]?fan", re.I),
     (150.0, 320.0, 650.0, 1200.0, "fan @ £/kW")),
    (re.compile(r"\bmixer\b|agitator|stirrer", re.I),
     (200.0, 400.0, 800.0, 1500.0, "mixer/agitator @ £/kW")),
    # pump LAST among rotating kit (a "backwash pump"/"dosing pump" should still hit
    # this; the noun is broad so it must not pre-empt a more specific match above)
    (re.compile(r"\bpump\b", re.I),
     (350.0, 700.0, 1300.0, 2500.0, "process pump (skid: casing+motor+VSD) @ £/kW")),
    # ── electrical-supply kit rated in kVA (£/kVA) ──
    # genset band grounded to UK market 2025: 1000 kVA bare unit ~£90k, installed
    # £100-200k ≈ £360-440/kVA (≈ £450-550/kW @ 0.8 pf). Small sets carry a higher
    # £/kVA, so the band spans £200-440/kVA, mid £320.
    (re.compile(r"diesel[_ -]?generat\w*|standby[_ -]?generat\w*|\bgenset\b|generator[_ -]?set", re.I),
     (200.0, 320.0, 440.0, 12000.0, "standby diesel genset @ £/kVA")),
    (re.compile(r"\bups\b|uninterruptible|battery[_ -]?backup", re.I),
     (300.0, 550.0, 950.0, 4000.0, "UPS @ £/kVA")),
    (re.compile(r"transformer", re.I),
     (15.0, 28.0, 55.0, 3000.0, "transformer @ £/kVA")),
]
# kit whose rating is a kVA quantity (so the curve is £/kVA, and a stray "kW" on the
# word is treated as kVA-equivalent rather than mis-scaling the price).
_KVA_NOUN_RE = re.compile(r"generat|\bups\b|uninterruptible|transformer", re.I)


def _has_rating_cost_model(name: str) -> bool:
    """True iff `name`'s own noun matches one of _RATING_COST_MODELS's families
    (motor/VFD/blower/compressor/heat-pump/chiller/heat-exchanger/fan/mixer/pump/
    generator/UPS/transformer) — i.e. this word already flows through
    `_reconcile_rated_price`'s downstream rating-based reconciliation elsewhere in
    this module. Used by `_detect_borrowed_identities` to scope its "already
    reconciled downstream" exemption to the NOUN FAMILIES that exemption was
    actually written for (2026-07-05 SAF EP-109 motor control centre) — NOT to
    every word that merely carries a capacity/rating_primary value. A thermal-
    transfer noun (condenser, heat-recovery exchanger) can carry a kW capacity
    too, but _RATING_COST_MODELS has no £/kW curve for it, so no downstream
    price-reconciliation ever inspects its identity — exempting it from the
    collision check left a copied sibling identity to render as a false
    'IDENTIFIED · catalogue' row with no reconciliation catching it at all (the
    CO₂-mineralisation v5 E-101/E-107 GEA VIBRO-FLUIDISER bug: a K2SO4 dryer's own
    MPN copied onto an unrelated vacuum condenser AND an unrelated heat-recovery
    exchanger — neither noun has a rating-cost model, so neither was ever
    downstream-reconciled). Pure noun-regex test — does not evaluate any kw value,
    so it is correct regardless of whether a usable kw can be extracted."""
    return any(rx.search(name or "") for rx, _ in _RATING_COST_MODELS)


def _rating_kw(md: dict, name: str = "", requirement: str = ""):
    """(value, is_kva) for a power-rated line, else (None, False). Reads the
    machine-readable `rating_primary` modifier first (the universal hook every
    sized equipment carries), then falls back to a kW/kVA token in the name or
    requirement text. Universal — no per-class logic."""
    val = None
    unit = ""
    rp = md.get("rating_primary") if isinstance(md, dict) else None
    if rp is not None:
        # GUARD (2026-06-24): a rating_primary carrying a NON-power unit (flow L/min·m³/h,
        # current A, voltage V, pressure bar, speed rpm, head m, temp °C) is NOT a kW
        # rating. _num() ignores the unit, so "150 L/min @ 20 m head" was read as 150 kW
        # and the cooling pump priced 150 kW × £700/kW = £105k (×2 = £210k). Only accept a
        # bare number or an explicit kW/kVA/MW/MVA. Universal — same unit-honouring fix as
        # the capacity→m³ size bug.
        # the modifier's own `unit` field (preserved by _mods as rating_primary_unit)
        # is part of the rating — "value: 90, unit: m³/h" must read as a FLOW, never
        # 90 kW (the v55 Irrigation Pump £63k bug: the flat map dropped the unit).
        rp_str = f"{rp} {md.get('rating_primary_unit') or ''}".strip()
        _has_power = bool(re.search(r"\b\d[\d.]*\s*(?:k|m)?(?:w|va)\b", rp_str, re.I))
        _has_nonpower = bool(re.search(
            r"l\s*/?\s*min|l\s*/?\s*s|m\s*3\s*/?\s*h|m³|\bgpm\b|\bm\b\s*head|\bhead\b|"
            r"\bA\b|\bV\b|\bkV\b|\bbar\b|\bk?pa\b|\bmpa\b|\brpm\b|\bhz\b|°\s*c|\bmm\b",
            rp_str, re.I))
        val = None if (_has_nonpower and not _has_power) else _num(rp)
    # explicit unit from the modifier list if the caller passed one through name/req
    blob = f"{name} {requirement}"
    if val is None:
        m = re.search(r"([\d.]+)\s*(kVA|kW)\b", blob, re.I)
        if m:
            val = float(m.group(1)); unit = m.group(2)
    if val is None or val <= 0:
        return (None, False)
    is_kva = bool(_KVA_NOUN_RE.search(name)) or unit.lower() == "kva" \
        or bool(re.search(r"\bkVA\b", blob))
    return (val, is_kva)


# ── MOTOR-NAMEPLATE DISPLAY RULE (council 2026-06-17, marine RAS) ──
# A motor-driven rotating-equipment line (pump / blower / compressor / fan) must
# show its MOTOR NAMEPLATE kW — the procurable IEC frame an engineer orders — NOT
# the hydraulic / shaft power. The RAS recirc pump rendered "Circulation Pump · 94
# kW" (= recirc_pump_power_kw, the hydraulic/shaft duty) while the motor nameplate
# is recirc_pump_motor_kw = 132 kW; procurement would buy the wrong frame. The
# contract carries the nameplate as a `*_motor_kw` quantity paired with the shaft
# `*_power_kw` (or `*_shaft_kw` / `*_hydraulic_power_kw`). Universal + deterministic:
# the nameplate is adopted ONLY when (a) the line is a motor-driven noun, (b) it
# already DISPLAYS a shaft rating, and (c) a `*_motor_kw` key exists whose paired
# shaft sibling matches that displayed rating (the physics pairing) OR whose stem
# matches the line's noun. Both (b)+(c) FAIL on an archetype whose pumps carry no
# shaft rating and no shaft sibling (CO₂ / SAF) → those BoMs are byte-unchanged.
_MOTOR_DRIVEN_NOUN_RE = re.compile(r"\bpump\b|\bblower\b|\bcompressor\b|\bfan\b", re.I)

# Rotating / power-rated kit where a NAMED consumer-grade catalogue MPN can be
# grossly undersized for the engineering duty (a domestic circulator named for a
# process recirculation pump). Used by the undersized-MPN rejection: if such a
# line's named part is priced far below the duty-rated curve, the MPN is wrong.
# Broader than _MOTOR_DRIVEN_NOUN_RE (adds gensets / motors / mixers) but excludes
# a passive vessel / instrument noun (those are not £/kW rotating kit).
_ROTATING_EQUIP_NOUN_RE = re.compile(
    r"\bpump\b|\bblower\b|\bcompressor\b|\bfan\b|\bmotor\b|\bmixer\b|agitator|"
    r"\bvsd\b|\bvfd\b|variable[_ -]?speed[_ -]?drive|generat\w*|\bgenset\b", re.I)


def _is_rotating_equipment_noun(name: str) -> bool:
    """True when the line's noun is rotating / power-rated kit for which a named
    consumer-grade MPN can be undersized for the duty. Universal, no class table."""
    return bool(_ROTATING_EQUIP_NOUN_RE.search(name or ""))
_SHAFT_SIBLING_SUFFIXES = ("_power_kw", "_shaft_power_kw", "_shaft_kw",
                           "_hydraulic_power_kw", "_brake_power_kw")


def _qnum(q, key):
    """Numeric value of a contract quantity (handles the {value: N} wrapper), else None."""
    if not isinstance(q, dict):
        return None
    v = q.get(key)
    if isinstance(v, dict):
        v = v.get("value")
    return _num(v) if v is not None else None


def _motor_nameplate_kw(name: str, shaft_kw, q):
    """(nameplate_kw, shaft_kw) for a motor-driven line whose displayed rating is a
    SHAFT/hydraulic kW that the contract pairs with a larger `*_motor_kw` nameplate,
    else (None, None). Deterministic pairing, no per-class table:

      1. PHYSICS PAIRING (primary) — find a `<stem>_motor_kw` key whose paired shaft
         sibling (`<stem>_power_kw` / `_shaft_kw` / `_hydraulic_power_kw` …) equals the
         line's displayed shaft rating (within 1%). This binds the nameplate to the
         line by the engineering numbers, independent of wording.
      2. NOUN-STEM fallback — if no sibling pairs, match a `*_motor_kw` stem token-wise
         to the line's noun (e.g. 'Circulation Pump' / 'Recirc Pump' → recirc_pump).

    Only returns a nameplate that is ≥ the shaft duty (a motor is never smaller than
    the shaft power it drives) and actually LARGER (≥1% over), so an equal value is a
    no-op (nothing to correct)."""
    if not isinstance(q, dict) or shaft_kw is None or shaft_kw <= 0:
        return (None, None)
    if not _MOTOR_DRIVEN_NOUN_RE.search(name or ""):
        return (None, None)
    motor_keys = [k for k in q if k.endswith("_motor_kw")]
    if not motor_keys:
        return (None, None)

    # 1) physics pairing — a motor key whose shaft sibling == this line's shaft rating
    best = None
    for mk in motor_keys:
        stem = mk[: -len("_motor_kw")]
        for suf in _SHAFT_SIBLING_SUFFIXES:
            sib = _qnum(q, stem + suf)
            if sib is not None and sib > 0 and abs(sib - shaft_kw) <= 0.01 * shaft_kw:
                nameplate = _qnum(q, mk)
                if nameplate and nameplate >= shaft_kw:
                    best = nameplate if best is None else max(best, nameplate)
    if best is not None and best > shaft_kw * 1.01:
        return (best, shaft_kw)

    # 2) noun-stem fallback — match the motor key's stem tokens to the line's noun
    name_toks = set(re.findall(r"[a-z]+", (name or "").lower()))
    # normalise a couple of common synonyms so 'circulation' matches 'recirc'
    if "circulation" in name_toks or "circulating" in name_toks:
        name_toks.add("recirc")
    # Scope tokens that MUST agree both ways (a 'nursery_*_motor_kw' must never
    # nameplate a non-nursery pump, and a nursery pump must not take the main-zone
    # motor). Universal zone/role prefixes — not a class table.
    _SCOPE_TOKS = {"nursery", "backup", "standby", "duty", "primary", "secondary",
                   "main", "aux", "auxiliary", "hand", "zone"}
    for mk in motor_keys:
        stem = mk[: -len("_motor_kw")]
        stem_toks = [t for t in re.split(r"[_\d]+", stem) if t]
        # require the equipment-type token (pump/blower/compressor/fan) to coincide
        type_tok = next((t for t in stem_toks if _MOTOR_DRIVEN_NOUN_RE.search(t)), None)
        if not type_tok or type_tok not in name_toks:
            continue
        # scope tokens: every scope token on the KEY must appear in the NAME, and
        # every scope token on the NAME must appear on the KEY (symmetric). Without
        # this, nursery_drain_transfer_pump_motor_kw=5.04 was pasted onto
        # "Drain Transfer Pump" (1.9 kW shaft) → BoM "5.04 kW motor" vs contract
        # drain_transfer_pump_power_kw=1.92 (C4 FAIL).
        key_scope = {t for t in stem_toks if t in _SCOPE_TOKS}
        name_scope = {t for t in name_toks if t in _SCOPE_TOKS}
        if key_scope != name_scope:
            continue
        # and at least one descriptive stem token present in the line's noun
        if any(t in name_toks for t in stem_toks if t != type_tok and t not in _SCOPE_TOKS) or len(stem_toks) == 1:
            nameplate = _qnum(q, mk)
            if nameplate and nameplate > shaft_kw * 1.01:
                return (nameplate, shaft_kw)
    return (None, None)


# Tokens that carry no identity for the motor-kW matcher — every pump/motor shares
# them, so they must never DECIDE a match on their own (the f9dfc2918 blanket-match
# family: the generic token 'pump' handed irrigation_pump_motor_kw to EVERY pump).
_GENERIC_EQUIP_TOKENS = {"pump", "motor", "power", "drive", "kw", "unit", "system",
                         "electrical", "elec"}
# contract kW keys that are AGGREGATES or thermal duties — never a per-item motor.
_NON_MOTOR_KW_KEY_RE = re.compile(
    r"total|connected|aggregate|overall|demand|supply|thermal|duty|capacity|"
    r"heating|cooling|chiller|loss|load_kw$", re.I)


def _contract_motor_kw(name: str, q):
    """Per-item MOTOR/electrical kW for a motor-driven line from the contract
    quantities, matched on the line's DISTINGUISHING name tokens (the f9dfc2918
    matcher discipline: exact token or ≥4-char prefix stem, generic tokens never
    decide, ambiguous top-ties return None). Used when the line's own rating is a
    FLOW (m³/h) — the v55 Irrigation Pump (90 m³/h) must price from its 15 kW
    motor, never from '90 kW'. Returns (kw, key) or (None, None)."""
    if not isinstance(q, dict) or not _MOTOR_DRIVEN_NOUN_RE.search(name or ""):
        return (None, None)
    toks = {t for t in re.split(r"[^a-z0-9]+", (name or "").lower()) if len(t) >= 2}
    dist = toks - _GENERIC_EQUIP_TOKENS
    if not dist:
        return (None, None)
    _SCOPE_TOKS = {"nursery", "backup", "standby", "duty", "primary", "secondary",
                   "main", "aux", "auxiliary", "hand", "zone"}
    name_scope = {t for t in toks if t in _SCOPE_TOKS}

    def _hit(t, k):
        return t == k or (min(len(t), len(k)) >= 4 and (t.startswith(k) or k.startswith(t)))

    candidates = []   # (overlap, motor_pref, key, kw)
    for k in q:
        kl = str(k).lower()
        if not (kl.endswith("_motor_kw") or kl.endswith("_power_kw")):
            continue
        if _NON_MOTOR_KW_KEY_RE.search(kl):
            continue
        ktoks = set(re.split(r"[^a-z0-9]+", kl))
        key_scope = {t for t in ktoks if t in _SCOPE_TOKS}
        # Symmetric scope: nursery key ↔ nursery name only (same rule as nameplate).
        if key_scope != name_scope:
            continue
        overlap = sum(1 for t in dist if any(_hit(t, kt) for kt in ktoks))
        if overlap == 0:
            continue
        val = _qnum(q, k)
        if val is None or val <= 0:
            continue
        candidates.append((overlap, 1 if kl.endswith("_motor_kw") else 0, kl, float(val)))
    if not candidates:
        return (None, None)
    candidates.sort(key=lambda c: (-c[0], -c[1], c[2]))   # total order (key name last)
    top = [c for c in candidates if c[0] == candidates[0][0] and c[1] == candidates[0][1]]
    if len({c[3] for c in top}) > 1:
        return (None, None)                                # genuine ambiguity — never guess
    return (candidates[0][3], candidates[0][2])


def _rated_equipment_cost(name: str, kw: float, is_kva: bool):
    """Installed cost (£) for a power-rated equipment line from a UNIVERSAL £/kW
    (or £/kVA) market curve keyed off the equipment NOUN, plus the plausibility
    BAND. Returns (mid_gbp, basis, lo_gbp, hi_gbp) or None if the noun matches no
    rating model. The band lets the caller both FILL a £0/absent line AND clamp an
    over- or under-priced LLM estimate back in-band — the same model in both
    directions. Universal: no per-class table."""
    if not kw or kw <= 0:
        return None
    for rx, (lo, mid, hi, minimum, label) in _RATING_COST_MODELS:
        if rx.search(name or ""):
            unit = "kVA" if is_kva else "kW"
            mid_gbp = max(mid * kw, minimum)
            lo_gbp = max(lo * kw, minimum * 0.6)
            hi_gbp = max(hi * kw, minimum)
            basis = (f"rating-based: {kw:.0f} {unit} × £{mid:.0f}/{unit} "
                     f"(UK-2026 installed mid; band £{lo:.0f}-{hi:.0f}/{unit}) — {label}")
            return (round(mid_gbp), basis, round(lo_gbp), round(hi_gbp))
    return None


def _reconcile_rated_price(name: str, md: dict, gbp: float, basis: str,
                           requirement: str = "", q=None):
    """Universal price-reality reconciliation for a power-rated line. If the line
    carries a real rating AND a rating-model exists for its noun, ANY existing
    price that is absent / ≤0 / outside the model's plausibility band is REPLACED
    by the rating-model mid. This is the both-directions fix: it lifts a £35 94-kW
    pump up and pulls a £293/kVA genset / £923/kW blower down to the market curve.

    Tolerance: the in-band window is [0.4 × lo, 2.5 × hi] of the rating-implied
    band — generous enough that a defensible vendor quote inside the market range
    is KEPT (we only correct values that are clearly wrong), but tight enough that
    a 5-30× error (either way) is pulled to the mid. Returns (gbp, basis)."""
    kw, is_kva = _rating_kw(md, name, requirement)
    _motor_note = ""
    if kw is None:
        # FLOW-RATED PUMP (2026-07-02, unit-confusion family): the line's own rating
        # is EXPLICITLY a volumetric flow (the v55 'Irrigation Pump · 90 m³/h' that
        # priced as '90 kW × £700/kW' = £63k), so its PRICE driver is its MOTOR —
        # resolve the per-item motor kW from the contract by distinguishing-token
        # match (a pump with flow 90 m³/h + motor 15 kW prices from 15 kW, never
        # from '90 kW'). SCOPE (no-regression, SAF/CO₂ byte-identity): fires ONLY
        # when (a) the line's rating_primary IS a flow — a line with NO rating at
        # all (a catalogue-identified Grundfos) keeps its price untouched, the old
        # behaviour — AND (b) the noun is a PUMP (an engineered kg/h compressor
        # package is not £/kW commodity kit and must not be re-banded).
        _rp_blob = (f"{md.get('rating_primary') or ''} {md.get('rating_primary_unit') or ''}"
                    if isinstance(md, dict) else "")
        _rating_is_flow = bool(re.search(
            r"m\s*[³^]?\s*3?\s*/?\s*h|l\s*/?\s*(?:min|s|h)\b|\bgpm\b", _rp_blob, re.I))
        if not (_rating_is_flow and re.search(r"\bpump\b", name or "", re.I)):
            return (gbp, basis)
        kw, _mkey = _contract_motor_kw(name, q)
        if kw is None:
            return (gbp, basis)
        is_kva = False
        _motor_note = f" · motor kW from contract {_mkey} (the line's own rating is a flow, not a power)"
    # DB-FIRST (growing-DB loop, Tristan 2026-06-25): a REAL spec-matched part in forge-truth.db
    # beats the rating-model estimate — this is how an ingested principal (e.g. the 86 kW chiller
    # the ingest job wrote) flows back into pricing on the next run, closing the loop. The known
    # rating gives a reliable spec token even when md/name omit it.
    _dbp = _db_spec_price(f"{name} {kw:.0f} {'kva' if is_kva else 'kw'}", md)
    if _dbp and _dbp[0] > 0:
        return (round(_dbp[0], 2),
                f"real DB median of {_dbp[1]} comparable {_dbp[3]} '{_dbp[2]}' parts (forge-truth.db)"
                + _motor_note)
    model = _rated_equipment_cost(name, kw, is_kva)
    if not model:
        return (gbp, basis)
    mid_gbp, model_basis, lo_gbp, hi_gbp = model
    # keep a price that is within the market band (with a modest slack so a
    # defensible vendor quote near an edge is not needlessly overwritten); ground
    # anything clearly outside it (a 5-30× error in either direction) to the mid.
    window_lo = 0.6 * lo_gbp
    window_hi = 1.5 * hi_gbp
    if gbp is None or gbp <= 0 or gbp < window_lo or gbp > window_hi:
        why = ("no price" if (gbp is None or gbp <= 0)
               else f"£{gbp:,.0f} below band" if gbp < window_lo
               else f"£{gbp:,.0f} above band")
        return (float(mid_gbp), f"{model_basis} [{why} → grounded to market]{_motor_note}")
    return (gbp, basis)


# Hard ceiling for a CLOSED-vessel materials take-off, tied to volume, so the
# shell-area × £/m² + install path can NEVER reach the absurd £1M-class value the
# prior council flagged on a ~7 m³ "UV reactor". A closed steel pressure vessel's
# installed cost scales ~ £/m³ that FALLS with size; this caps the small end. The
# ceiling is deliberately loose (a genuine large field-erected vessel is well
# under it) — it only catches a runaway. Universal: a pure function of volume.
def _vessel_cost_ceiling(vol_m3: float) -> float:
    """Maximum credible installed cost (£) for a fabricated closed vessel of the
    given volume — an upper sanity bound, not a price. A 7 m³ vessel caps ~£90k,
    a 50 m³ ~£420k, a 500 m³ ~£3M; a genuine vessel costs far less, so this only
    ever trips a mispricer. £/m³ falls with scale (economy of size)."""
    v = max(float(vol_m3), 0.1)
    # piecewise £/m³ ceiling: small vessels can be ~£13k/m³ at the very low end
    # (a 1 m³ skid-mounted 316L vessel + fittings), falling to ~£6k/m³ by 500 m³.
    if v < 10.0:
        per_m3 = 13000.0
    elif v < 50.0:
        per_m3 = 9000.0
    elif v < 200.0:
        per_m3 = 7500.0
    else:
        per_m3 = 6000.0
    return per_m3 * v + 20000.0   # + fixed allowance so a sub-1 m³ vessel isn't over-tight


_BESPOKE_SHELL_HEAD_NOUN_RE = re.compile(
    r"^(?:tanks?|vessels?|reservoirs?|basins?|sumps?|biofilters?|degassers?|"
    r"clarifiers?|hoppers?|silos?)$", re.I)


def _is_bespoke_shell_head_noun(name: str) -> bool:
    """TRUE only when the word's HEAD NOUN (last token, whole-word) is unambiguously
    a large fabricated pressure/process shell — tank/vessel/reservoir/basin/sump/
    biofilter/degasser/clarifier/hopper/silo. Deliberately NARROWER than
    `_BESPOKE_RE` (which loose-substring-matches the WHOLE name, including
    'enclosure'/'frame'/'structure'/'duct' — real hits for THEIR own purpose, but
    'duct' also matches inside unrelated words like 'inductor', and a small
    catalogue-scale isolator 'enclosure' is not a fabricated vessel shell). Used
    ONLY to decide whether a catalogue-pinned price should be refused for type-
    coherence (see the curve_only gate below); does not change `_bespoke_class`'s
    own broader SIMPLE/STRONG classification used elsewhere."""
    toks = (name or "").strip().split()
    if not toks:
        return False
    head = re.sub(r"[^a-z0-9]+$", "", toks[-1].lower())
    return bool(_BESPOKE_SHELL_HEAD_NOUN_RE.match(head))


# Below this implied volume, a tank/vessel-headed word is a MASS-MANUFACTURED
# shelf product (compressed-air receiver, expansion vessel, small buffer tank —
# the exact scale `_install_factor`'s own smallest bracket, '<5 m3 — small
# skid-mounted vessel, workshop-tested, fork-lift in', still assumes a REAL
# fabrication job, not a catalogue item), not a field-fabricated shell — a
# materials take-off (steel/FRP mass x £/kg + erection + fittings) systematically
# OVER-prices it (a real 50 L Reflex expansion vessel priced as bespoke fabrication
# came out £1,941 vs a genuine ~£100-300 retail item). So the catalogue-pin refusal
# below applies ONLY at genuine field-fabrication scale.
_MIN_BESPOKE_SHELL_VOL_M3 = 0.5


def _implied_vessel_vol_m3(mods: dict) -> Optional[float]:
    """Best-effort implied volume (m3), unit-aware, from a word's OWN dimension/
    capacity modifiers — mirrors `_materials_takeoff`'s geometry derivation without
    needing AS-BUILT (Blender) geometry. Returns None when neither is present."""
    dim = mods.get("dimension") or ""
    cyl = _cyl_from_dim(dim)
    if cyl:
        d, h = cyl
        return math.pi * (d / 2.0) ** 2 * h
    box = _box_from_dim(dim)
    if box:
        w, dp, h = box
        return w * dp * h
    cap = _num(mods.get("capacity"))
    if cap is None:
        return None
    cap_u = str(mods.get("capacity_unit") or "").strip().lower()
    if re.fullmatch(r"l|litre|litres|liter|liters", cap_u):
        cap = cap / 1000.0
    return cap


def _bespoke_shell_vol_m3(geom, mods: dict) -> Optional[float]:
    """Implied volume (m3) for the field-fabrication-scale gate: prefer the
    AS-BUILT (Blender) geometry `_materials_takeoff` itself prefers, else the
    word's own dimension/capacity modifiers."""
    if geom:
        d_v, h_v = geom
        return math.pi * (d_v / 2.0) ** 2 * h_v
    return _implied_vessel_vol_m3(mods)


def _bespoke_class(name: str) -> str:
    """'strong' | 'simple' | 'none'. STRONG = complex fabricated process vessel
    (reactor/column/absorber/...) decided by the HEAD noun (last word) so a qualifier
    ('reactor thermowell', 'fractionation reboiler') can't promote a catalogue component.
    SIMPLE = shell-dominated fabrication (tank/basin/duct...) costed by a materials
    take-off. Universal — no per-class table."""
    head = re.sub(r"[^a-z0-9]+$", "", (name.strip().split() or [""])[-1].lower())
    if _STRONG_BESPOKE_RE.search(head):
        # the head is tested BARE, so qualifier lookbehinds in the regex can't see the
        # context — re-test 'contactor' against the FULL name (run-34: 'Main DC
        # Contactor' → head 'contactor' → strong, the electrical/process collision
        # the lookbehinds were built for but never reached).
        if head == "contactor" and re.search(
                r"\b(?:dc|ac|main|motor|line|power|pack)\b[\s\w·]*contactor", name, re.I):
            return "none"
        return "strong"
    if _BESPOKE_RE.search(name or ""):
        return "simple"
    return "none"


# ── UNDERGROUND-ELEMENT CIVILS DERIVATION (Sam Green SME review, 2026-07-07 — the
# real Fischer Farms drawings' "Drain pits suggest a lot of underground civils work but
# previous pages suggest almost no civils cost" two-truths contradiction, see also the
# design-basis memo's cross-tab-consistency lesson). The engine already synthesises
# below-grade drainage/collection vessels (a Drain Collection Sump / drain pit, or the
# equivalent on any other archetype with floor drainage — RAS sumps, CO2-plant washdown
# pits) as an open-tank fabricated SHELL, but nothing derived the separate EXCAVATION +
# BACKFILL + CONCRETE-SURROUND civils cost of BURYING it — a genuinely different cost
# from both the vessel's own shell fabrication AND the generic 'building / civil works'
# hall take-off (`w.get("_structure")` above, synthesizeBuildingStructure's parametric
# £/m² — out of scope for a class like water_treatment where no hall is synthesised).
# A design with real underground physical scope (drain pits, buried pipe) and ~£0 on the
# civils line is exactly the internal contradiction Sam flagged. UNIVERSAL: keyed on
# GENERIC below-grade drainage vocabulary — a standalone below-grade noun (pit/manhole/
# duct bank/buried/underground/below-grade/below-slab/excavation) OR a drainage-role
# qualifier (drain/effluent/foul/surface-water/storm/sewage/collection) COLLOCATED with a
# chamber-type noun (sump/chamber/well/pit) — never a class name, so it fires for
# water_treatment's Drain Collection Sump, an aquaculture_ras drain sump, a
# co2_mineralisation washdown pit, or any future archetype's below-grade drainage vessel.
# A bare 'Coolant Sump' or 'Buffer Tank' (no drainage-role qualifier, no standalone
# below-grade noun) never fires — proveNoFalsePositive in `_selftest`.
_UNDERGROUND_STANDALONE_RE = re.compile(
    r"\b(pit|manhole|duct[\s-]?bank|buried|underground|below[\s-]?grade|below[\s-]?"
    r"(?:the\s+)?slab|excavat\w*)\b", re.I)
_UNDERGROUND_DRAINAGE_ROLE_RE = re.compile(
    r"\b(drain(?:age|water)?|effluent|foul|surface[\s-]?water|storm(?:water)?|sewage|collection)\b", re.I)
_UNDERGROUND_CHAMBER_NOUN_RE = re.compile(r"\b(sump|chamber|well|pit)\b", re.I)


def _is_underground_element(name: str) -> bool:
    """A generically below-grade civil element — see the civils-derivation docstring
    above. proveCatch/proveNoFalsePositive in `_selftest`."""
    n = name or ""
    if _UNDERGROUND_STANDALONE_RE.search(n):
        return True
    return bool(_UNDERGROUND_DRAINAGE_ROLE_RE.search(n) and _UNDERGROUND_CHAMBER_NOUN_RE.search(n))


# UK-2026 groundworks parametric — DOCUMENTED model (same disclosure convention as
# connection_sizing.py's cable/pipe £/m ladder header): bulk excavation + spoil
# cart-away (~£180/m³ of WORKING volume, taken as 2.5× the vessel's own volume for
# access/formwork clearance) + mass-concrete surround/backfill (~£220/m³ of the
# vessel's OWN volume) + a fixed per-unit mobilisation/reinstatement allowance
# (breaking ground, temporary support, surface reinstatement) of £900. Class-4
# parametric (±30-50%, same honesty band as the DOE/NETL process-equipment curves) —
# a real civils sub-contractor RFQ tightens it; the point is a DERIVED, non-trivial
# line that SCALES with physical below-grade scope, never a disconnected placeholder.
_CIVILS_EXCAVATION_GBP_PER_M3 = 180.0
_CIVILS_EXCAVATION_WORKING_FACTOR = 2.5
_CIVILS_CONCRETE_SURROUND_GBP_PER_M3 = 220.0
_CIVILS_MOBILISATION_GBP = 900.0


def _civils_cost_for_underground_vessel(vol_m3: float):
    """Excavation + concrete surround + mobilisation for ONE below-grade vessel of
    `vol_m3`. Returns (gbp:int, basis:str). Pure + deterministic; never zero (a
    below-grade element always carries a non-trivial floor via the mobilisation term)."""
    v = max(0.1, float(vol_m3 or 0.1))
    excav_vol = v * _CIVILS_EXCAVATION_WORKING_FACTOR
    excav = _CIVILS_EXCAVATION_GBP_PER_M3 * excav_vol
    surround = _CIVILS_CONCRETE_SURROUND_GBP_PER_M3 * v
    gbp = excav + surround + _CIVILS_MOBILISATION_GBP
    basis = (f"below-grade civils (model:uk-2026-groundworks) — bulk excavation "
             f"{excav_vol:.1f} m³ working volume @ £{_CIVILS_EXCAVATION_GBP_PER_M3:.0f}/m³ "
             f"(£{excav:,.0f}) + mass-concrete surround/backfill {v:.1f} m³ @ "
             f"£{_CIVILS_CONCRETE_SURROUND_GBP_PER_M3:.0f}/m³ (£{surround:,.0f}) + "
             f"mobilisation/reinstatement £{_CIVILS_MOBILISATION_GBP:,.0f} — Class-4 "
             f"parametric (±30-50%), scales with physical below-grade scope")
    return round(gbp), basis


_ROW_VOL_M3_RE = re.compile(r"(\d+(?:\.\d+)?)\s*m³")


def _row_underground_volume_m3(req: str):
    """Below-grade element volume (m³) from a requirement's size text. Tries an
    explicit 'N m³' figure first, else derives it from the SAME dimensional
    conventions the rest of this module already parses elsewhere (`_cyl_from_dim`'s
    '<d> m dia x <h> m' cylinder, `_box_from_dim`'s '<w>x<d>x<h> mm' box). Returns
    None (never fabricates) when neither form is present.

    ROOT-CAUSE FIX (2026-07-08, Sam Green SME review follow-up): the bare 'N m³'
    regex alone silently skipped EVERY fabricated-vessel requirement row (Softener
    Vessel, Drain Collection Sump, Fresh Water Tank, Reverse Osmosis Skid, ...)
    because their size is recorded as '<dia> m dia x <h> m' — the standard
    dimension-line convention this module's own SIZE-line assembly + `_cyl_from_dim`
    already use — never as an 'm³' figure. On the real Codema water-treatment design
    this meant `civils_rows_from_underground_scope` emitted ZERO civils lines even
    though a real underground vessel (Drain Collection Sump · 2.1 m dia x 1.4 m,
    qty 2) was present: exactly the "drainpits everywhere, ~£0 civils" two-truths
    contradiction Sam flagged. The gap was a volume-PARSING format mismatch, not an
    under-instantiation of the design (the sump row itself was already there,
    correctly quantified qty=2) — the design models the recovery infrastructure the
    reference topology defines; only the cost derivation was blind to its own size
    text convention."""
    m = _ROW_VOL_M3_RE.search(req)
    if m:
        return float(m.group(1))
    cyl = _cyl_from_dim(req)
    if cyl:
        dia_m, h_m = cyl
        return math.pi * (dia_m / 2.0) ** 2 * h_m
    box = _box_from_dim(req)
    if box:
        w_m, d_m, h_m = box
        return w_m * d_m * h_m
    return None


def civils_rows_from_underground_scope(rows: list) -> list:
    """UNDERGROUND-ELEMENT CIVILS DERIVATION — additive post-pass (called from `assemble`
    after every principal/connection/distribution row exists). For every PRINCIPAL row
    (never a SUB-COMPONENT/ROUTED/CIVILS line, so this never re-fires on its own output)
    whose requirement/part text signals a below-grade drainage vessel
    (`_is_underground_element`), emits a PAIRED CIVILS BoM row deriving excavation +
    concrete-surround + mobilisation cost from THAT row's OWN volume (parsed from its
    'N m³' size text, already present in `requirement` — see the SIZE-line assembly
    above) and quantity. NEVER FABRICATES: a matching row with no parseable volume is
    skipped (no invented number) rather than guessed; an all-above-ground design (no
    underground-signal rows at all) returns [] — the civils line is only as real as the
    physical scope driving it. proveCatch/proveNoFalsePositive in `_selftest`."""
    out = []
    for row in rows:
        if row.get("status") in ("SUB-COMPONENT", "ROUTED", "CIVILS"):
            continue
        req = str(row.get("requirement") or "")
        part = str(row.get("part") or "")
        if not (_is_underground_element(req) or _is_underground_element(part)):
            continue
        vol_m3 = _row_underground_volume_m3(req)
        if vol_m3 is None:
            continue  # no parseable volume on this row — never fabricate a civils quantity
        qy = row.get("qty") or 1
        unit_gbp, basis = _civils_cost_for_underground_vessel(vol_m3)
        # Unique tag per vessel so ship-gate tag_validity never sees a reused "CIV"
        # (two drain pits → CIV-101 + CIV-102). Universal sequential counter.
        n = len(out) + 1
        out.append({
            "tag": f"CIV-{100 + n}", "requirement": f"{row.get('requirement', '')} · below-grade civils",
            "status": "CIVILS",
            "part": "civils — excavation / backfill / concrete surround (parametric take-off)",
            "qty": qy, "unit_gbp": unit_gbp, "line_gbp": round(unit_gbp * qy), "basis": basis,
        })
    return out


def _catalogue_pinned_child(kmd, child_price):
    """CATALOGUE-ADOPTED sub-component (cascade-price-adoption, 2026-07-03 codema v58):
    a child word whose `price_basis` modifier is a distributor-catalogue quote renders its
    OWN catalogue price + that basis — never a scaled share of the parent (the v58
    Differential-Pressure Switch: £420 parametric share vs db:mouser £45.68). Returns
    (unit_gbp, basis) to PIN the row (treated as capped, so pass-2 reconciliation cannot
    re-inflate it), or None for every non-adopted child (BESS/SAF byte-identity rides on
    the None path)."""
    pb = str((kmd or {}).get("price_basis") or "").strip()
    if not pb.lower().startswith("distributor catalogue"):
        return None
    try:
        p = float(child_price or 0)
    except (TypeError, ValueError):
        return None
    if p <= 0:
        return None
    return round(p), pb


def _selftest() -> int:
    """Guards the head-noun rule that the qualifier-over-match bug (2026-06-13) broke."""
    global _FORGE_TRUTH_DB
    cases = {
        "Fischer-Tropsch synthesis reactor": "strong",
        "product fractionation column · 0.8 m dia x 18 m": "strong",
        "packed amine absorber": "strong",
        "hydrocracker/hydrotreater reactor": "strong",
        "reactor thermowell + temperature profile": "none",   # head = profile
        "reactor pressure-relief valve": "none",               # head = valve
        "fractionation reboiler": "none",                      # head = reboiler (an HX)
        "fractionation overhead condenser": "none",            # head = condenser
        "rearing tank · 9.5 m dia x 4.7 m": "simple",          # head = tank... but '·' splits
        "CO2 degasser": "simple",
        "process-water transfer pump": "none",
        "Main DC Contactor · 51 A": "none",      # ELECTRICAL contactor — never a process vessel
        "CO2 gas-liquid contactor": "strong",    # the PROCESS contactor column stays bespoke
    }
    bad = 0
    for name, want in cases.items():
        got = _bespoke_class(name)
        # the '·'-suffixed names: the take-off appends ' · <dim>', so test the bare noun too
        if got != want and want in ("simple", "strong"):
            got = _bespoke_class(name.split("·")[0].strip())
        if got != want:
            print(f"  FAIL  '{name}' → {got} (want {want})"); bad += 1
    # ── CORPUS-LIFT ratio ceiling (2026-07-10, run-20 rack £8,001→£210,000 26× lift) ──
    _pv_rack = {"engine_c_flag": "under", "engine_c_ref_median_gbp": 210000,
                "engine_c_ref_count": 5}
    if _corpus_median_lift(8001.0, _pv_rack) is not None:
        print("  FAIL corpus-lift proveCatch: a 26× lift to a wrong-class corpus median "
              "must be REJECTED (ratio ceiling 15×)"); bad += 1
    _pv_degas = {"engine_c_flag": "under", "engine_c_ref_median_gbp": 65000,
                 "engine_c_ref_count": 5}
    if _corpus_median_lift(4946.0, _pv_degas) is None:
        print("  FAIL corpus-lift proveNoFalsePositive: the genuine Degasser "
              "£4,946→0.6×£65k (7.9×) lift must survive"); bad += 1
    # ── STRUCTURAL connections adder follows scale (2026-07-10, run-20 £8k on 0 m²) ──
    _st_dev = _structural_takeoff("Battery Module Rack", {"dimension": "0.3 m² footprint"})
    if not _st_dev or _st_dev[0] > 1000.0:
        print(f"  FAIL structural-adder proveCatch: a 0.3 m² device frame must price "
              f"device-scale fixtures (< £1k), got {_st_dev and round(_st_dev[0])}"); bad += 1
    _st_bld = _structural_takeoff("Steel Portal Frame", {"dimension": "100 m² area"})
    if not _st_bld or abs(_st_bld[0] - (100 * 90 + 8000)) > 1.0:
        print(f"  FAIL structural-adder proveNoFalsePositive: a 100 m² building frame "
              f"must keep the £8k connections adder byte-identically, got "
              f"{_st_bld and round(_st_bld[0])}"); bad += 1
    # ── ENCLOSURE-SKIN take-off (2026-07-10, run-13 ledger £3 material-less enclosure) ──
    _q_encl = {"enclosure_volume_m3": {"value": 0.143}}
    _sk = _enclosure_skin_takeoff("Outdoor Cabinet Enclosure", _q_encl)
    if not _sk or not (100 <= _sk[0] <= 700) or "material" not in (_sk[2] or {}):
        print(f"  FAIL enclosure-skin proveCatch: 0.143 m³ cabinet skin must price "
              f"£100-700 with a material, got {_sk!r}"); bad += 1
    _pn = _enclosure_skin_takeoff("Enclosure Panel", _q_encl)
    if not _pn or not (_pn[0] < _sk[0] * 0.5):
        print(f"  FAIL enclosure-skin: a panel head must price a FRACTION of the box "
              f"skin, got {_pn and _pn[0]!r} vs full {_sk[0]:.0f}"); bad += 1
    if _enclosure_skin_takeoff("Outdoor Cabinet Enclosure", {}) is not None:
        print("  FAIL enclosure-skin proveNoFalsePositive: no enclosure_volume_m3 key "
              "must be a strict no-op (byte-identity)"); bad += 1
    if _enclosure_skin_takeoff("Steel Portal Frame", _q_encl) is not None:
        print("  FAIL enclosure-skin proveNoFalsePositive: a non-enclosure head must "
              "never take the skin price"); bad += 1
    # OPEN-TANK cost discount (#144): an open atmospheric tank (FRP, no top head, tapered
    # wall, delivered) must cost materially LESS than a closed steel pressure vessel of the
    # same size, and land in a sane FRP fish-tank band — not the old £194k/tank over-count.
    dim = {"dimension": "12.4 m dia x 3.2 m"}
    ot = _materials_takeoff("Rearing Tank", dim)      # open → FRP, 1 head, tapered, 1.25×
    ct = _materials_takeoff("Buffer Vessel", dim)     # closed → carbon steel, 2 heads
    if ot and ct:
        oc, cc = ot[0], ct[0]
        if not (oc < 0.75 * cc and 20000 < oc < 150000):
            print(f"  FAIL open-tank cost £{oc:.0f} vs closed £{cc:.0f} (want open < 0.75×closed, £20–150k)"); bad += 1
    else:
        print("  FAIL open-tank cost — no geometry parsed"); bad += 1

    # ── FITTINGS ALLOWANCE FOLLOWS SCALE (2026-07-10, run-21 £1,811 'AC Filter Inductor'
    # via the vessel path: £11 shell + the FLAT £1,800 nozzles/manway allowance). A tiny
    # shell gets a proportional allowance; a real vessel keeps £1,800 byte-identically. ──
    _tiny = _materials_takeoff("Filter Housing", {"dimension": "0.1 m dia x 0.1 m"})
    if not _tiny or _tiny[0] > 300.0:
        print(f"  FAIL fittings-scale proveCatch: a ⌀0.1×0.1 m shell must price sub-£300 "
              f"(no £1,800 manway), got {_tiny and round(_tiny[0])}"); bad += 1
    if ct and not (ct[0] > 20000):
        print(f"  FAIL fittings-scale proveNoFalsePositive: the 12.4 m Buffer Vessel must "
              f"keep vessel-scale money (incl. the £1,800 allowance), got £{ct[0]:.0f}"); bad += 1

    # ── WETTED-MoC PROVENANCE (v54 seawater-leak, 2026-07-02): the plant fluid service is
    # read from the DUTY context (brief + contract duty fields) ONLY — a tool registry URL
    # ('python-seawater'), a catalogue part's capability list (feed_water_type '… seawater …'),
    # an audit boolean name (is_marine_class) and the cached previous BoM's own MoC strings
    # must NOT flip a potable plant to marine. And a part's OWN declared material always
    # beats the plant default (a 'DN50 PVC Pipe' is PVC, never 316L/bronze).
    _poison = {  # every known false-positive source, NONE of them a duty statement
        "toolsUsedPage": [{"source_url": "github.com/python-seawater"}],
        "toolArchetypeCoherence": {"is_marine_class": False},
        "partRecommendations": [{"key_specs": {"feed_water_type":
                                 "surface water, groundwater, seawater, wastewater"}}],
        "requirementsBom": [{"basis": "moc: 316l stainless / bronze (seawater) for "
                                      "seawater/marine chloride service"}],
    }
    _moc_cases = [
        # (state, corrosive?, wetted-MoC for a plain pump, MoC for a PVC pipe)
        (dict(_poison, brief="A potable drinking-water treatment plant, 500 m³/day."),
         False, "PVC-U / 304 stainless (WRAS)", "PVC-U"),
        (dict(_poison, brief="A land-based marine RAS on a seawater intake."),
         True, "316L stainless / bronze (seawater)", "PVC-U"),
        (dict(_poison, brief="A 20 ft containerised battery energy storage system."),
         False, "", ""),
        ({"brief": "An effluent plant with sodium hypochlorite dosing."},
         True, "316L stainless / PVC-U (chemical)", "PVC-U"),
        # proveCatch: fertigation / irrigation process-water must stamp a plant MoC
        # so fabricated Distribution Manifold rows carry material (Codema ship 2026-07-09).
        (dict(_poison, brief="A fertigation and irrigation water plant with RO make-up."),
         False, "PVC-U / 304 stainless (WRAS)", "PVC-U"),
    ]
    for _st, _want_corr, _want_pump, _want_pipe in _moc_cases:
        _set_plant_corrosivity(_st)
        if _PLANT_CORROSIVE != _want_corr:
            print(f"  FAIL corrosivity on {_st.get('brief','')!r} → {_PLANT_CORROSIVE} (want {_want_corr})"); bad += 1
        got_pump = _wetted_moc("Transfer Pump", "duty pump")
        got_pipe = _wetted_moc("DN50 PVC Pipe", "distribution pipework")
        if got_pump != _want_pump:
            print(f"  FAIL pump MoC on {_st.get('brief','')!r} → {got_pump!r} (want {_want_pump!r})"); bad += 1
        if got_pipe != _want_pipe:
            print(f"  FAIL PVC-pipe MoC on {_st.get('brief','')!r} → {got_pipe!r} (want {_want_pipe!r})"); bad += 1
    _set_plant_corrosivity({})  # reset the globals for anything after this block

    # ── CORPUS-MEDIAN LIFT (#172, 2026-06-20): a principal the engine's own forge-truth
    # corpus flagged 'under' (price ≪ a TRUSTED median) is lifted to the conservative
    # lower edge (p25 / 0.6×median, never the median); a thin / no_reference / in_range
    # corpus, or an already-in-band price, is left untouched (false-positive discipline).
    _lift_cases = [
        # (unit_gbp, pv, expect_lift_to_or_None)
        (4946, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 65000,
                "engine_c_ref_count": 5, "engine_c_ref_p25_gbp": 65000}, 65000),   # Degasser → p25
        (54, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 540,
              "engine_c_ref_count": 5}, 324),                                       # no p25 → 0.6×median (£324), the conservative damp
        (40, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 218,
              "engine_c_ref_count": 5, "engine_c_ref_p25_gbp": 110}, 110),          # junction box → p25 (NOT the median)
        (2000, {"engine_c_flag": "no_reference", "engine_c_ref_median_gbp": 0,
                "engine_c_ref_count": 0}, None),                                    # no corpus → untouched
        (2000, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 9000,
                "engine_c_ref_count": 2}, None),                                    # thin corpus (<3) → untouched
        (8000, {"engine_c_flag": "in_range", "engine_c_ref_median_gbp": 9000,
                "engine_c_ref_count": 5}, None),                                    # already in range → untouched
        (8000, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 9000,
                "engine_c_ref_count": 5}, None),                                    # 89% of median (≥0.5×) → not materially under
        # RATIO guard: a sub-£500 commodity multiplied >20× is a class-mismatch → untouched.
        (40, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 6000,
              "engine_c_ref_count": 5, "engine_c_ref_p25_gbp": 3000}, None),        # module tray £40→£3,000 (75×) → REJECTED
        (16, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 3000,
              "engine_c_ref_count": 5, "engine_c_ref_p25_gbp": 1500}, None),        # heater thermostat £16→£1,500 (94×) → REJECTED
        (21, {"engine_c_flag": "under", "engine_c_ref_median_gbp": 500,
              "engine_c_ref_count": 5, "engine_c_ref_p25_gbp": 300}, None),         # access door £21→£300 (14×) → REJECTED (10× commodity gate)
    ]
    for u, pv, want in _lift_cases:
        res = _corpus_median_lift(float(u), pv)
        got = res[0] if res else None
        if want is None and got is not None:
            print(f"  FAIL corpus-lift fired on £{u} {pv.get('engine_c_flag')} → £{got} (want untouched)"); bad += 1
        elif want is not None and got != want:
            print(f"  FAIL corpus-lift £{u} → {got} (want £{want})"); bad += 1
        elif res and got is not None and got < u:
            print(f"  FAIL corpus-lift LOWERED £{u} → £{got}"); bad += 1

    # ── REAL-MPN CATALOGUE GROUNDING GUARD proveCatch (2026-07-05, the X-115 £190→£1,582
    # bug: a REAL pinned MPN's verified distributor-cascade price must never be
    # corpus-lifted, however 'under' the corpus thinks it is). Tests BOTH the pure
    # predicate _is_real_mpn_grounded AND the exact X-115 scenario end-to-end (the
    # combined `pv and not _is_real_mpn_grounded(pv)` gate the caller loop applies).
    _x115_pv = {
        "status": "verified", "cost_grounding_provenance": "distributor-cache",
        "engine_c_flag": "under", "engine_c_ref_median_gbp": 1715,
        "engine_c_ref_count": 5, "engine_c_ref_p25_gbp": 1582.5,
    }
    if not _is_real_mpn_grounded(_x115_pv):
        print("  FAIL _is_real_mpn_grounded: a verified distributor-cache line must read as grounded"); bad += 1
    _x115_res = _corpus_median_lift(190.0, _x115_pv) if not _is_real_mpn_grounded(_x115_pv) else None
    if _x115_res is not None:
        print(f"  FAIL X-115 proveCatch: a real-MPN-grounded £190 line was corpus-lifted to {_x115_res}"); bad += 1
    _ungrounded_cases = [
        ({}, True),                                                       # no pv info at all → not grounded
        ({"cost_grounding_provenance": "distributor-cache"}, True),       # provenance present but NEVER verified → not grounded (half-signal)
        ({"status": "verified"}, True),                                   # verified but no distributor-cache hit → not grounded
        ({"status": "verified", "cost_grounding_provenance": "corpus-median"}, True),  # a DIFFERENT grounding source → not grounded
        ({"status": "verified", "cost_grounding_provenance": "distributor-cache"}, False),  # the real signal → grounded
    ]
    for _pv, _want_ungrounded in _ungrounded_cases:
        _got_grounded = _is_real_mpn_grounded(_pv)
        if _got_grounded == _want_ungrounded:
            print(f"  FAIL _is_real_mpn_grounded({_pv}) → {_got_grounded} (want {'ungrounded' if _want_ungrounded else 'grounded'})"); bad += 1
    # The Degasser/Drum Filter cases MUST still lift — no pv carries a cost_grounding_*
    # field at all (they were priced by the flat parametric estimate the lift exists for).
    if _is_real_mpn_grounded({"engine_c_flag": "under", "engine_c_ref_median_gbp": 65000, "engine_c_ref_count": 5}):
        print("  FAIL: a plain engine_c_* pv (no cost_grounding_provenance) must NOT read as real-MPN-grounded (would silently disable the legitimate Degasser lift)"); bad += 1

    # ── FAMILY-QUALIFIER CONFLICT proveCatch (2026-07-04, BESS out/bess-campaign-v2
    # CH-101 chiller £48,500 bug): _db_spec_price matched "liquid cooling chiller ·
    # 148 kW" against the ONLY forge-truth.db row with the exact "148kw" spec token
    # — a Daikin EWAD-TZBXS150 AIR COOLED chiller — while the DB holds several real
    # LIQUID coolant chillers it never considered. Both directions: a genuine
    # cross-family pair (liquid vs air-cooled) MUST conflict; a same-family pair,
    # and any pair where either side names no qualifier at all (the overwhelming
    # majority of components — untouched by this guard), must NOT.
    _fq_cases = [
        ("liquid cooling chiller · 148 kW", "Daikin EWAD-TZBXS150 Air Cooled Chiller 148kW", True),   # the live bug — MUST conflict
        ("liquid cooling chiller · 148 kW", "Pfannenberg EB XT 1000 WT liquid coolant chiller", False),  # same family — MUST NOT conflict
        ("chiller · 148 kW", "Daikin EWAD-TZBXS150 Air Cooled Chiller 148kW", False),   # requirement names NO qualifier — untouched
        ("liquid cooling chiller · 148 kW", "Generic Process Chiller 148kW", False),    # candidate names NO qualifier — untouched
        ("PCS inverter 1 MW bidirectional", "Sungrow SC1000UD-MV", False),              # no qualifier on either side — untouched (the overwhelming case)
    ]
    for _req, _cand, _want_conflict in _fq_cases:
        _got_conflict = _family_qualifier_conflict(_req, _cand)
        if _got_conflict != _want_conflict:
            print(f"  FAIL _family_qualifier_conflict({_req!r}, {_cand!r}) → {_got_conflict} (want {_want_conflict})"); bad += 1
    # End-to-end (real forge-truth.db, when present): the live CH-101 case must no
    # longer resolve to the air-cooled Daikin row at all (either a real LIQUID
    # comparable wins, or — since none share the exact 148kw token — the DB match
    # is correctly declined and the caller falls through to the rating-based model,
    # never silently re-labelling itself "real DB median" over a wrong-family part).
    if os.path.exists(_FORGE_TRUTH_DB):
        _ch101 = _db_spec_price("liquid cooling chiller", {"rating_primary": "148 kW"})
        if _ch101 is not None and _ch101[0] == 48500.0:
            print("  FAIL CH-101 proveCatch: _db_spec_price still resolves the air-cooled Daikin £48,500 row for a 'liquid cooling chiller' requirement"); bad += 1

    # ── INTERNAL ACCESSORY FAN TRAY proveCatch (2026-07-04, BESS out/bess-campaign-v2
    # INV-4 £181 bug): the "fan" corpus median is dominated by STANDALONE process/
    # exhaust/HVAC fan units, so a "fan tray" internal accessory (rated in tens of
    # watts) must never corpus-lift against it. Both directions: the accessory
    # phrase fires; a genuine standalone fan line (the SAME bill's enclosure
    # ventilation fan / off-gas exhaust fan, both real corpus-priced lines) does not.
    _fan_cases = [
        ("PCS cooling fan tray", True),
        ("module cooling fan tray", True),
        ("enclosure ventilation fan", False),
        ("off-gas exhaust fan", False),
        ("PCS liquid cooling interface", False),
    ]
    for _name, _want_fires in _fan_cases:
        _got_fires = bool(_INTERNAL_FAN_TRAY_RE.search(_name))
        if _got_fires != _want_fires:
            print(f"  FAIL _INTERNAL_FAN_TRAY_RE.search({_name!r}) → {_got_fires} (want {_want_fires})"); bad += 1

    # ── FAMILY COHERENCE / FIELD-SWAP GUARD proveCatch (2026-07-05, INV-4 reproduced
    # fresh on out/bess-campaign-v3): "PCS cooling fan tray" carried modifier_characters
    # manufacturer=Sungrow / part_number=SC1000UD-MV — the PARENT 1 MW PCS's OWN
    # catalogue identity, silently copied — while its independently-researched
    # partVerification correctly found a distinct accessory PN (A01-FAN-SC1000). The
    # copied identity false-joined the £28 accessory to the parent's £75,000
    # partVerification in the cost-band check (x2,679 false FAIL). End-to-end via the
    # real assemble() path — both the fix AND its scope boundaries.
    import tempfile as _fs_tf
    with _fs_tf.TemporaryDirectory() as _fd:
        _fwords = [
            {"id": "pcs_parent_word", "name_human": "PCS inverter 1 MW bidirectional",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "manufacturer", "value": "Sungrow"},
                 {"kind": "part_number", "value": "SC1000UD-MV"},
             ]},
            # FIELD-SWAP shape: accessory copies the parent's exact identity.
            {"id": "pcs_fan_tray_word", "name_human": "PCS cooling fan tray",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "capacity", "value": "80", "unit": "W"},
                 {"kind": "manufacturer", "value": "Sungrow"},
                 {"kind": "part_number", "value": "SC1000UD-MV"},
             ]},
            # CONTROL — same accessory shape, but no field-swap (its own pv_pn matches
            # its modifier pn): must render byte-identically, never spuriously changed.
            {"id": "module_fan_tray_word", "name_human": "module cooling fan tray",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "capacity", "value": "60", "unit": "W"},
                 {"kind": "manufacturer", "value": "Sanyo Denki"},
                 {"kind": "part_number", "value": "SF-9WNS"},
             ]},
            # SCOPE BOUNDARY — a "fan tray" rated in the STANDALONE-unit range (kW, not
            # sub-1000 W) with a mismatched pv_pn must be UNAFFECTED (the rating check,
            # same one the price-side guard already uses, must still gate this fix).
            {"id": "big_fan_tray_word", "name_human": "exhaust cooling fan tray",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "rating_primary", "value": "5", "unit": "kW"},
                 {"kind": "manufacturer", "value": "Sungrow"},
                 {"kind": "part_number", "value": "SC1000UD-MV"},
             ]},
        ]
        _fpvs = [
            {"word_id": "pcs_parent_word", "manufacturer": "Sungrow", "part_number": "SC1000UD-MV",
             "price_estimate_gbp": 75000, "distributor_price_gbp": 75000},
            {"word_id": "pcs_fan_tray_word", "manufacturer": "Sungrow", "part_number": "A01-FAN-SC1000",
             "price_estimate_gbp": 28},
            {"word_id": "module_fan_tray_word", "manufacturer": "Sanyo Denki", "part_number": "SF-9WNS",
             "price_estimate_gbp": 19},
            {"word_id": "big_fan_tray_word", "manufacturer": "Sungrow", "part_number": "OTHER-PN-123",
             "price_estimate_gbp": 4500},
        ]
        json.dump({"moduleDecomposition": {"modules": [{"sub_modules": [{"words": _fwords}]}]},
                   "partVerifications": _fpvs}, open(os.path.join(_fd, "state.json"), "w"))
        _frows = assemble(_fd)
        _by_req = {r["requirement"].split(" · ")[0]: r for r in _frows}
        _parent = _by_req.get("PCS inverter 1 MW bidirectional")
        _fan = _by_req.get("PCS cooling fan tray")
        _ctrl = _by_req.get("module cooling fan tray")
        _big = _by_req.get("exhaust cooling fan tray")
        if not _fan or _fan["part"] != "Sungrow A01-FAN-SC1000":
            print(f"  FAIL INV-4 field-swap guard: fan tray part = {_fan and _fan['part']!r} "
                  f"(want 'Sungrow A01-FAN-SC1000')"); bad += 1
        if not _fan or _fan["unit_gbp"] != 28:
            print(f"  FAIL INV-4 field-swap guard: fan tray price changed to "
                  f"{_fan and _fan['unit_gbp']} (want 28, unaffected by the identity fix)"); bad += 1
        if not _parent or _parent["part"] != "Sungrow SC1000UD-MV":
            print(f"  FAIL INV-4 field-swap guard: the PARENT's own row must stay untouched "
                  f"({_parent and _parent['part']!r})"); bad += 1
        if not _ctrl or _ctrl["part"] != "Sanyo Denki SF-9WNS":
            print(f"  FAIL INV-4 field-swap guard: a non-swapped accessory must render "
                  f"byte-identically ({_ctrl and _ctrl['part']!r})"); bad += 1
        if not _big or _big["part"] != "Sungrow SC1000UD-MV":
            print(f"  FAIL INV-4 field-swap guard: a kW-rated 'fan tray' (standalone-unit scale) "
                  f"must be OUT OF SCOPE for the accessory override ({_big and _big['part']!r})"); bad += 1

    # ── ACCESSORY IDENTITY FAMILY proveCatch (2026-07-05, I-10 'gas sensor mount' —
    # generalising the fan-tray field-swap guard to the mount/bracket/tray/holder/
    # rail/cradle/clamp noun family). Regex-shape cases first (both directions).
    _accessory_cases = [
        ("gas sensor mount", True),
        ("DIN rail mount", True),
        ("cable tray holder", True),
        ("battery rack mounting bracket", True),
        ("cold plate cradle clamp", True),
        ("PCS cooling fan tray", True),      # fan-tray shape also matches (harmless — `elif` scoping below keeps it disjoint)
        ("gas sensor", False),
        ("gas detector controller", False),
        ("PCS liquid cooling interface", False),
    ]
    for _name, _want_fires in _accessory_cases:
        _got_fires = bool(_ACCESSORY_IDENTITY_RE.search(_name))
        if _got_fires != _want_fires:
            print(f"  FAIL _ACCESSORY_IDENTITY_RE.search({_name!r}) → {_got_fires} (want {_want_fires})"); bad += 1

    # End-to-end via the real assemble() path — the fix AND its two scope boundaries
    # (a rated principal sharing the noun; a cheap-but-honest accessory above no
    # duty but with an EXPENSIVE own price, i.e. not actually accessory-scale).
    with _fs_tf.TemporaryDirectory() as _gd:
        _gwords = [
            {"id": "gas_sensor_word", "name_human": "gas sensor",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×13"},
                 {"kind": "manufacturer", "value": "Crowcon"},
                 {"kind": "part_number", "value": "TXgard-IS+"},
             ]},
            # FIELD-SWAP shape: mount copies the parent detector's exact identity.
            {"id": "gas_sensor_mount_word", "name_human": "gas sensor mount",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×13"},
                 {"kind": "manufacturer", "value": "Crowcon"},
                 {"kind": "part_number", "value": "TXgard-IS+"},
             ]},
            # SCOPE BOUNDARY 1 — a RATED principal sharing the 'rail'/'mount' noun
            # (a structural rack rail) with a disagreeing pv_pn must be UNTOUCHED —
            # the rating_primary duty check gates this fix, same as the fan-tray's
            # kW scope boundary above.
            {"id": "structural_rail_word", "name_human": "battery rack DIN rail mount",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "rating_primary", "value": "500", "unit": "kg"},
                 {"kind": "manufacturer", "value": "Phoenix Contact"},
                 {"kind": "part_number", "value": "NS-35-RAIL-HD"},
             ]},
            # SCOPE BOUNDARY 2 — no duty rating, but the researched price is well
            # ABOVE the accessory ceiling — not actually accessory-scale — must be
            # UNTOUCHED even though the noun matches and the PN disagrees.
            {"id": "expensive_mount_word", "name_human": "sensor enclosure wall mount",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "manufacturer", "value": "Crowcon"},
                 {"kind": "part_number", "value": "TXgard-IS+"},
             ]},
        ]
        _gpvs = [
            {"word_id": "gas_sensor_word", "manufacturer": "Crowcon", "part_number": "TXgard-IS+",
             "price_estimate_gbp": 150},
            {"word_id": "gas_sensor_mount_word", "manufacturer": "Crowcon", "part_number": "A1TXG-ACC-MOUNT",
             "price_estimate_gbp": 1},
            {"word_id": "structural_rail_word", "manufacturer": "Phoenix Contact", "part_number": "OTHER-PN-999",
             "price_estimate_gbp": 340},
            {"word_id": "expensive_mount_word", "manufacturer": "Crowcon", "part_number": "WALL-MOUNT-HD-500",
             "price_estimate_gbp": 340},
        ]
        json.dump({"moduleDecomposition": {"modules": [{"sub_modules": [{"words": _gwords}]}]},
                   "partVerifications": _gpvs}, open(os.path.join(_gd, "state.json"), "w"))
        _grows = assemble(_gd)
        _gby_req = {r["requirement"].split(" · ")[0]: r for r in _grows}
        _gdet = _gby_req.get("gas sensor")
        _gmount = _gby_req.get("gas sensor mount")
        _grail = _gby_req.get("battery rack DIN rail mount")
        _gexp = _gby_req.get("sensor enclosure wall mount")
        if not _gmount or _gmount["part"] != "Crowcon A1TXG-ACC-MOUNT":
            print(f"  FAIL accessory-identity guard: gas sensor mount part = "
                  f"{_gmount and _gmount['part']!r} (want 'Crowcon A1TXG-ACC-MOUNT')"); bad += 1
        if not _gdet or _gdet["part"] != "Crowcon TXgard-IS+":
            print(f"  FAIL accessory-identity guard: the genuine DETECTOR's own row "
                  f"must stay untouched ({_gdet and _gdet['part']!r})"); bad += 1
        if not _grail or _grail["part"] != "Phoenix Contact NS-35-RAIL-HD":
            print(f"  FAIL accessory-identity guard: a rated principal sharing the "
                  f"'rail'/'mount' noun must be OUT OF SCOPE for the accessory "
                  f"override ({_grail and _grail['part']!r})"); bad += 1
        if not _gexp or _gexp["part"] != "Crowcon TXgard-IS+":
            print(f"  FAIL accessory-identity guard: a 'mount'-named line priced ABOVE "
                  f"the accessory ceiling must be OUT OF SCOPE for the override "
                  f"({_gexp and _gexp['part']!r})"); bad += 1

    # ── SIBLING-IDENTITY-COLLISION GUARD proveCatch (2026-07-05, BESS I-17 —
    # generalising the fan-tray / accessory-identity families to any noun shape).
    with _fs_tf.TemporaryDirectory() as _bd:
        _bwords = [
            # DONOR — the real, verified owner of Arcteq/AQ-210. Must stay untouched.
            {"id": "arc_flash_relay_word", "name_human": "arc flash relay",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "manufacturer", "value": "Arcteq"},
                 {"kind": "part_number", "value": "AQ-210"},
             ]},
            # BORROWER — inherited the donor's exact identity post-verification
            # (part_number_inherited_from_sibling); its OWN pv identity (AQ-PS01)
            # disagrees, confirming it never owned AQ-210. Its own price (£140) must
            # survive; its `part`/`status` must not falsely pin the donor's SKU.
            {"id": "arc_flash_fibre_sensor_word", "name_human": "arc flash fibre-optic point sensor",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×4"},
                 {"kind": "manufacturer", "value": "Arcteq"},
                 {"kind": "part_number", "value": "AQ-210"},
             ]},
            # AMBIGUOUS COLLISION — two words share one PN but NEITHER's own pv
            # confirms ownership (no confirmed donor) — must stay UNTOUCHED (leave
            # ambiguous cases alone rather than guess).
            {"id": "ambiguous_widget_a_word", "name_human": "ambiguous widget A",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "manufacturer", "value": "Foo"},
                 {"kind": "part_number", "value": "SHARED-1"},
             ]},
            {"id": "ambiguous_widget_b_word", "name_human": "ambiguous widget B",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "manufacturer", "value": "Foo"},
                 {"kind": "part_number", "value": "SHARED-1"},
             ]},
        ]
        _bpvs = [
            {"word_id": "arc_flash_relay_word", "manufacturer": "Arcteq", "part_number": "AQ-210",
             "price_estimate_gbp": 6.5},
            {"word_id": "arc_flash_fibre_sensor_word", "manufacturer": "Arcteq", "part_number": "AQ-PS01",
             "price_estimate_gbp": 140},
            {"word_id": "ambiguous_widget_a_word", "manufacturer": "Foo", "part_number": "OTHER-A",
             "price_estimate_gbp": 20},
            {"word_id": "ambiguous_widget_b_word", "manufacturer": "Foo", "part_number": "OTHER-B",
             "price_estimate_gbp": 30},
        ]
        json.dump({"moduleDecomposition": {"modules": [{"sub_modules": [{"id": "arc_flash_protection",
                                                                          "words": _bwords}]}]},
                   "partVerifications": _bpvs}, open(os.path.join(_bd, "state.json"), "w"))
        _brows = assemble(_bd)
        _bby_req = {r["requirement"].split(" · ")[0]: r for r in _brows}
        _bdonor = _bby_req.get("arc flash relay")
        _bsensor = _bby_req.get("arc flash fibre-optic point sensor")
        _bamb_a = _bby_req.get("ambiguous widget A")
        _bamb_b = _bby_req.get("ambiguous widget B")
        if not _bdonor or _bdonor["part"] != "Arcteq AQ-210":
            print(f"  FAIL sibling-identity guard: the DONOR's own row must stay "
                  f"untouched ({_bdonor and _bdonor['part']!r})"); bad += 1
        if not _bsensor or _bsensor["status"] != "NOT FOUND" or _bsensor["unit_gbp"] != 140:
            print(f"  FAIL sibling-identity guard: BESS I-17 shape — borrower must "
                  f"render NOT FOUND at its OWN £140 (got status="
                  f"{_bsensor and _bsensor['status']!r}, unit_gbp="
                  f"{_bsensor and _bsensor['unit_gbp']!r})"); bad += 1
        if not _bsensor or "MPN unresolved" not in _bsensor["basis"]:
            print(f"  FAIL sibling-identity guard: borrower's basis must disclose "
                  f"the unresolved MPN ({_bsensor and _bsensor['basis']!r})"); bad += 1
        if not _bamb_a or _bamb_a["part"] != "Foo SHARED-1":
            print(f"  FAIL sibling-identity guard: an AMBIGUOUS collision (no "
                  f"confirmed donor) must stay untouched ({_bamb_a and _bamb_a['part']!r})"); bad += 1
        if not _bamb_b or _bamb_b["part"] != "Foo SHARED-1":
            print(f"  FAIL sibling-identity guard: an AMBIGUOUS collision (no "
                  f"confirmed donor) must stay untouched ({_bamb_b and _bamb_b['part']!r})"); bad += 1

    # ── _is_identity_bearing_pn proveCatch (2026-07-06) — both directions: a real
    # descriptive product-family name (no digits) IS identity-bearing; a generic
    # bespoke/fabrication placeholder is NOT, even at the same length/shape.
    _identity_pn_cases = [
        ("FLUIDBED VIBRO-FLUIDISER", True),          # GEA's real product family (E-101/E-107)
        ("shell-and-tube vacuum condenser", True),    # a specific descriptive product, no digits
        ("bespoke vessel", False),
        ("made-to-order fabrication", False),
        ("fabricated compressor-suction knock-out drum — bespoke vessel", False),
        ("custom engineered enclosure", False),
        ("GRU-99803652", True),                       # structured MPN still passes
        ("TBD (detailed design)", False),
    ]
    for _pn, _want in _identity_pn_cases:
        _got = _is_identity_bearing_pn(_pn)
        if _got != _want:
            print(f"  FAIL _is_identity_bearing_pn({_pn!r}) → {_got} (want {_want})"); bad += 1

    # ── SIBLING-IDENTITY-COLLISION on a THERMAL-TRANSFER noun proveCatch (2026-07-06,
    # CO₂-mineralisation out/co2-campaign-v5 E-101/E-107) — the guard above only fires
    # when `_detect_borrowed_identities` doesn't exempt the word first; v5's real bug
    # was the EXEMPTION itself firing wrongly for a 'condenser'/'heat-recovery
    # exchanger' noun (capacity present, but no _RATING_COST_MODELS family matches
    # either noun) while correctly staying exempt for a 'motor control centre' noun
    # (capacity present, 'motor' DOES match a _RATING_COST_MODELS family). Both
    # directions in one real state.json via the real assemble() path.
    with _fs_tf.TemporaryDirectory() as _td_thermal:
        _thermal_words = [
            # DONOR — the real, verified K2SO4 dryer. Must stay untouched.
            {"id": "k2so4_hot_air_dryer_word", "name_human": "K2SO4 hot-air dryer",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "capacity", "value": "75", "unit": "kW"},
                 {"kind": "manufacturer", "value": "GEA"},
                 {"kind": "part_number", "value": "FLUIDBED VIBRO-FLUIDISER"},
             ]},
            # BORROWER — a condenser copied the dryer's exact identity. Own pv is a
            # DIFFERENT (unverified) part — 'condenser' matches no _RATING_COST_MODELS
            # family, so this must NOT be exempted by the capacity check; must demote.
            {"id": "crystalliser_vacuum_condenser_word", "name_human": "crystalliser vacuum condenser",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "capacity", "value": "60", "unit": "kW"},
                 {"kind": "manufacturer", "value": "GEA"},
                 {"kind": "part_number", "value": "FLUIDBED VIBRO-FLUIDISER"},
             ]},
            # BORROWER 2 — a heat-recovery exchanger, same shape (different sub-noun,
            # still no _RATING_COST_MODELS hit: 'heat-recovery exchanger' does not
            # match the tight 'heat[_ -]?exchang' family regex).
            {"id": "dryer_heat_recovery_exchanger_word", "name_human": "dryer exhaust heat-recovery exchanger",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "capacity", "value": "30", "unit": "kW"},
                 {"kind": "manufacturer", "value": "GEA"},
                 {"kind": "part_number", "value": "FLUIDBED VIBRO-FLUIDISER"},
             ]},
            # SCOPE BOUNDARY — a motor control centre sharing a VFD's identity: 'motor'
            # DOES match _RATING_COST_MODELS, so the pre-existing SAF EP-109 exemption
            # must still hold — this word is UNAFFECTED by the narrowing.
            {"id": "motor_control_centre_word", "name_human": "motor control centre",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "capacity", "value": "750", "unit": "kW"},
                 {"kind": "manufacturer", "value": "ABB"},
                 {"kind": "part_number", "value": "ACS580-01"},
             ]},
            {"id": "vfd_drive_word", "name_human": "VFD drive",
             "modifier_characters": [
                 {"kind": "quantity", "value": "×1"},
                 {"kind": "rating_primary", "value": "30", "unit": "kW"},
                 {"kind": "manufacturer", "value": "ABB"},
                 {"kind": "part_number", "value": "ACS580-01"},
             ]},
        ]
        _thermal_pvs = [
            {"word_id": "k2so4_hot_air_dryer_word", "manufacturer": "GEA", "part_number": "FLUIDBED VIBRO-FLUIDISER",
             "status": "verified", "price_estimate_gbp": 22000},
            {"word_id": "crystalliser_vacuum_condenser_word", "manufacturer": "GEA",
             "part_number": "shell-and-tube vacuum condenser — packaged", "status": "unverified",
             "price_estimate_gbp": 9200},
            {"word_id": "dryer_heat_recovery_exchanger_word", "manufacturer": "GEA",
             "part_number": "air-to-air glass-tube recuperator — packaged", "status": "unverified",
             "price_estimate_gbp": 6800},
            {"word_id": "motor_control_centre_word", "manufacturer": "ABB", "part_number": "OTHER-MCC-PN",
             "price_estimate_gbp": 112500},
            {"word_id": "vfd_drive_word", "manufacturer": "ABB", "part_number": "ACS580-01",
             "status": "verified", "price_estimate_gbp": 3200},
        ]
        json.dump({"moduleDecomposition": {"modules": [{"sub_modules": [{"id": "k2so4_recovery_line_thermal_transfer",
                                                                          "words": _thermal_words}]}]},
                   "partVerifications": _thermal_pvs}, open(os.path.join(_td_thermal, "state.json"), "w"))
        _thermal_rows = assemble(_td_thermal)
        _thermal_by_req = {r["requirement"].split(" · ")[0]: r for r in _thermal_rows}
        _t_dryer = _thermal_by_req.get("K2SO4 hot-air dryer")
        _t_cond = _thermal_by_req.get("crystalliser vacuum condenser")
        _t_hx = _thermal_by_req.get("dryer exhaust heat-recovery exchanger")
        _t_mcc = _thermal_by_req.get("motor control centre")
        if not _t_dryer or _t_dryer["part"] != "GEA FLUIDBED VIBRO-FLUIDISER":
            print(f"  FAIL thermal-noun collision guard: the DONOR dryer's own row must "
                  f"stay untouched ({_t_dryer and _t_dryer['part']!r})"); bad += 1
        if not _t_cond or _t_cond["status"] != "NOT FOUND":
            print(f"  FAIL thermal-noun collision guard (E-101 regression): 'crystalliser "
                  f"vacuum condenser' must demote off the borrowed dryer MPN (got status="
                  f"{_t_cond and _t_cond['status']!r}, part={_t_cond and _t_cond.get('part')!r})"); bad += 1
        if not _t_hx or _t_hx["status"] != "NOT FOUND":
            print(f"  FAIL thermal-noun collision guard (E-107 regression): 'dryer exhaust "
                  f"heat-recovery exchanger' must demote off the borrowed dryer MPN (got "
                  f"status={_t_hx and _t_hx['status']!r}, part={_t_hx and _t_hx.get('part')!r})"); bad += 1
        if not _t_mcc or _t_mcc["part"] != "ABB ACS580-01":
            print(f"  FAIL thermal-noun collision guard: a 'motor control centre' (matches "
                  f"_RATING_COST_MODELS via 'motor') must stay OUT OF SCOPE for this "
                  f"narrowing — the pre-existing SAF EP-109 exemption must be unaffected "
                  f"({_t_mcc and _t_mcc['part']!r})"); bad += 1

    # ── PHANTOM-PIPEWORK GUARD (council 2026-06-16) — a make-up / bleed / chemical-
    # dosing branch and an instrument-SIGNAL tie must NOT be priced at the whole-plant
    # recirculation flow / DN300 / 316L. The schedule blanket-tags every water edge
    # with the full recirc flow; the BoM must re-derive the real per-edge duty. We
    # drive a synthetic connection-schedule through the REAL _connection_rows path.
    import tempfile as _tf
    _q = {
        "recirculation_flow_m3_h": {"value": 13360},
        "makeup_water_m3_h": {"value": 53.44},
        "total_tank_volume_m3": {"value": 3340},
        "rearing_tank_volume_each_m3": {"value": 334},
    }
    _sched = {"rows": [
        # main-loop edge — SHOULD carry full plant flow (split across trains)
        {"from": "rearing_tanks", "to": "rotary_drum_filter", "mechanism": "fluid_loop",
         "rating": "3.7111 m³/s", "length_m": 50.0, "size": "DN300", "line_total_gbp": 32000, "within_spec": False},
        # make-up branch — must be SMALL (~53 m³/h, DN100, HDPE)
        {"from": "Make-up Water System", "to": "Rearing Tank", "mechanism": "fluid_loop",
         "rating": "3.7111 m³/s", "length_m": 50.0, "size": "DN300", "line_total_gbp": 57000, "within_spec": False},
        # bleed branch — must be SMALL (~make-up balance)
        {"from": "Bleed / Drain System", "to": "Rearing Tank", "mechanism": "fluid_loop",
         "rating": "3.7111 m³/s", "length_m": 50.0, "size": "DN300", "line_total_gbp": 83000, "within_spec": False},
        # chemical-dosing branch — must be VERY small (DN≤32)
        {"from": "Chemical Dosing System", "to": "Rearing Tank", "mechanism": "fluid_loop",
         "rating": "3.7111 m³/s", "length_m": 50.0, "size": "DN300", "line_total_gbp": 59000, "within_spec": False},
        # instrument SIGNAL tie mis-tagged as a fluid loop — must become a CABLE
        {"from": "Dissolved-Oxygen Analyser", "to": "Voltage Sensor", "mechanism": "fluid_loop",
         "rating": "3.7111 m³/s", "length_m": 8.0, "size": "DN300", "line_total_gbp": 4900, "within_spec": False},
    ]}
    with _tf.TemporaryDirectory() as _d:
        json.dump(_sched, open(os.path.join(_d, "connection-schedule.json"), "w"))
        crows = {r["requirement"].split(":")[1].split("·")[0].strip(): r
                 for r in _connection_rows(_d, _q)}
        loop = crows.get("rearing tanks → rotary drum filter")
        mk = crows.get("Make-up Water System → Rearing Tank")
        bl = crows.get("Bleed / Drain System → Rearing Tank")
        do = crows.get("Chemical Dosing System → Rearing Tank")
        sig = crows.get("Dissolved-Oxygen Analyser → Voltage Sensor")

        def _dn(r):
            mt = re.search(r"DN(\d+)", str(r.get("size") or "")) if r else None
            return int(mt.group(1)) if mt else None

        # make-up: small DN, HDPE, FAR below the £57k blanket recirc price
        if not (mk and _dn(mk) and _dn(mk) <= 150 and "316" not in mk["basis"]
                and mk["line_gbp"] < 20000):
            print(f"  FAIL make-up edge not de-rated: {mk and (mk['size'], mk['line_gbp'])} (want DN≤150 HDPE <£20k)"); bad += 1
        # bleed: small DN, well below blanket recirc price
        if not (bl and _dn(bl) and _dn(bl) <= 150 and bl["line_gbp"] < 20000):
            print(f"  FAIL bleed edge not de-rated: {bl and (bl['size'], bl['line_gbp'])} (want DN≤150 <£20k)"); bad += 1
        # dosing: very small DN (not DN300)
        if not (do and _dn(do) and _dn(do) <= 50):
            print(f"  FAIL dosing edge not de-rated: {do and do['size']} (want DN≤50, never DN300)"); bad += 1
        # signal tie: re-classified to an electrical cable, NOT a water pipe
        if not (sig and sig.get("service") == "electrical" and "mm²" in str(sig.get("size"))
                and sig["line_gbp"] < 1000):
            print(f"  FAIL signal tie still a water pipe: {sig and (sig.get('service'), sig.get('size'))}"); bad += 1
        # main loop SHOULD still carry the (per-train) plant flow → larger than a branch
        if not (loop and mk and loop["line_gbp"] > mk["line_gbp"]):
            print(f"  FAIL main-loop edge not > make-up branch ({loop and loop['line_gbp']} vs {mk and mk['line_gbp']})"); bad += 1
        # NONE of the re-priced water edges may keep the blanket DN300/316L recirc combo
        for r in _connection_rows(_d, _q):
            if r.get("service") == "water" and _dn(r) == 300 and "316" in r["basis"] and "3.7111" in r["requirement"]:
                print(f"  FAIL edge still priced DN300/316L at full recirc: {r['tag']} {r['requirement'][:40]}"); bad += 1

        # ── CLOSER-EDGE SUPPRESSION GUARD (P0-C, 2026-07-08) ──
        # residual/boundary/direction closer language → drop from costed BoM.
        # source=="completion" alone (MCC power feeders) must NOT drop — prove both ways.
        _sched_cls = {"rows": [
            # real process edge (no closer signal)
            {"from": "tank_a", "to": "pump_b", "mechanism": "fluid_loop", "rating": "1 m³/s", "length_m": 10.0, "size": "DN100", "line_total_gbp": 1000},
            # residual closer edge (route-manifest service)
            {"from": "pump_b", "to": "nearest_consumer", "mechanism": "fluid_loop", "rating": "1 m³/s", "length_m": 2.0, "size": "DN100", "line_total_gbp": 200},
            # boundary closer edge (ledger material_context)
            {"from": "nearest_producer", "to": "tank_a", "mechanism": "fluid_loop", "rating": "1 m³/s", "length_m": 3.0, "size": "DN100", "line_total_gbp": 300},
            # completion-only power feeder — must STAY priced (customer buys MCC feeders)
            {"from": "Motor Control Center", "to": "Irrigation Pump", "mechanism": "electrical_bus",
             "rating": "15 kW", "length_m": 8.0, "size": "4 mm²", "line_total_gbp": 120},
        ]}
        _rm_cls = {"lines": [
            {"from_tag": "pump_b", "to_tag": "nearest_consumer",
             "service": "process output (residual closer: nearest consumer)"},
            {"from_tag": "Motor Control Center", "to_tag": "Irrigation Pump",
             "service": "LV power feeder 400/415V 3ph"},
        ]}
        _cl_cls = {"rows": [
            {"from_part": "nearest_producer", "to_part": "tank_a",
             "material_context": "process input (boundary closer: nearest producer)", "source": "completion"},
            {"from_part": "Motor Control Center", "to_part": "Irrigation Pump",
             "material_context": "LV power feeder 400/415V 3ph", "source": "completion"},
        ]}
        with _tf.TemporaryDirectory() as _d2:
            json.dump(_sched_cls, open(os.path.join(_d2, "connection-schedule.json"), "w"))
            json.dump(_rm_cls, open(os.path.join(_d2, "route-manifest.json"), "w"))
            json.dump(_cl_cls, open(os.path.join(_d2, "connection-ledger.json"), "w"))
            _c2 = _connection_rows(_d2, _q)
            _c2_reqs = [r["requirement"] for r in _c2]
            # endpoint names are space-normalised in the requirement text
            if not any("tank a → pump b" in rq for rq in _c2_reqs):
                print(f"  FAIL real edge suppressed incorrectly (got {_c2_reqs})"); bad += 1
            if any("nearest consumer" in rq or "nearest_consumer" in rq for rq in _c2_reqs):
                print("  FAIL residual closer edge not suppressed (route-manifest match)"); bad += 1
            if any("nearest producer" in rq or "nearest_producer" in rq for rq in _c2_reqs):
                print("  FAIL boundary closer edge not suppressed (ledger material_context match)"); bad += 1
            if not any("Motor Control Center → Irrigation Pump" in rq for rq in _c2_reqs):
                print("  FAIL completion-only MCC feeder suppressed (source=completion alone must NOT drop real feeders)"); bad += 1

        # ── P0-C DISTRIBUTION DOUBLE-COUNT GUARD (2026-07-09) ──
        # When distribution_network_length_km is present, water Cxx must NOT enter the
        # costed BoM (parametric X-14x lines already price the pipe take-off). Electrical
        # feeders must still price. Without the distribution key, water Cxx still price
        # (RAS/CO₂ byte-identity).
        _sched_d = {"rows": [
            {"from": "tank_a", "to": "pump_b", "mechanism": "fluid_loop",
             "rating": "1 m³/s", "length_m": 10.0, "size": "DN100", "line_total_gbp": 1000},
            {"from": "Motor Control Center", "to": "Irrigation Pump",
             "mechanism": "electrical_bus", "rating": "15 kW", "length_m": 8.0,
             "size": "4 mm²", "line_total_gbp": 120},
        ]}
        with _tf.TemporaryDirectory() as _d3:
            json.dump(_sched_d, open(os.path.join(_d3, "connection-schedule.json"), "w"))
            json.dump({"lines": []}, open(os.path.join(_d3, "route-manifest.json"), "w"))
            json.dump({"rows": []}, open(os.path.join(_d3, "connection-ledger.json"), "w"))
            _q_dist = dict(_q)
            _q_dist["distribution_network_length_km"] = {"value": 1.8}
            _c3 = _connection_rows(_d3, _q_dist)
            _c3_water = [r for r in _c3 if r.get("service") == "water"]
            _c3_elec = [r for r in _c3 if r.get("service") == "electrical"]
            if _c3_water:
                print(f"  FAIL water Cxx still costed under distribution_network_length_km "
                      f"(got {[r.get('requirement') for r in _c3_water]})"); bad += 1
            if not _c3_elec:
                print("  FAIL electrical Cxx suppressed when only water should drop"); bad += 1
            _c3b = _connection_rows(_d3, _q)  # no distribution key
            if not any(r.get("service") == "water" for r in _c3b):
                print("  FAIL water Cxx dropped without distribution_network_length_km "
                      "(byte-identity break)"); bad += 1

    # ── CAPACITY-UNIT SIZE LINE (BESS GA-fit bug, gate 36 2026-06-24) — a `capacity`
    # modifier is a VOLUME only when its unit is m³/L; a non-volume capacity (A/V/W/kW/
    # L/min) must render with its REAL unit, never " m³". The old code hardcoded m³ onto
    # any capacity → a 2300 A breaker read "2300 m³", a 150 L/min pump "150 m³" (50-250×
    # the whole 40-ft container). UNIVERSAL: build a tiny state, assemble it, assert the
    # requirement strings carry true units, a genuine m³/L volume is preserved, and a
    # non-volume capacity already covered by rating_primary is dropped (not duplicated).
    with _tf.TemporaryDirectory() as _cd:
        _capstate = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
            {"id": "w_breaker", "name_human": "AC main breaker",
             "modifier_characters": [{"kind": "capacity", "value": "2300", "unit": "A"}]},
            {"id": "w_pump", "name_human": "cooling pump",
             "modifier_characters": [{"kind": "rating_primary", "value": "150 L/min @ 20 m head"},
                                     {"kind": "capacity", "value": "150", "unit": "L/min"}]},
            {"id": "w_tank", "name_human": "buffer tank",
             "modifier_characters": [{"kind": "capacity", "value": "5", "unit": "m³"}]},
            {"id": "w_sump", "name_human": "coolant sump",
             "modifier_characters": [{"kind": "capacity", "value": "200", "unit": "L"}]},
        ]}]}]}}
        json.dump(_capstate, open(os.path.join(_cd, "state.json"), "w"))
        _crow = {r["requirement"].split("·")[0].strip(): r["requirement"] for r in assemble(_cd)}
        _brk = _crow.get("AC main breaker", "")
        if "m³" in _brk or "2300 A" not in _brk:
            print(f"  FAIL breaker capacity not shown as 2300 A: {_brk!r}"); bad += 1
        _tank = _crow.get("buffer tank", "")
        if "5 m³" not in _tank:
            print(f"  FAIL genuine m³ tank volume not preserved: {_tank!r}"); bad += 1
        _sump = _crow.get("coolant sump", "")
        if "200 L" not in _sump or "m³" in _sump:
            print(f"  FAIL litre capacity not shown as 200 L: {_sump!r}"); bad += 1
        _pump = _crow.get("cooling pump", "")
        if "m³" in _pump:   # the L/min rating is already in rating_primary → no redundant " · 150 m³"
            print(f"  FAIL pump non-volume capacity rendered as m³: {_pump!r}"); bad += 1

    # ── RATING-KW UNIT GUARD (cost side of the same unit-confusion, 2026-06-24) — a
    # rating_primary with a NON-power unit must NOT be read as kW. "150 L/min @ 20 m head"
    # was read as 150 kW → the cooling pump priced 150 kW × £700/kW = £105k. A genuine kW
    # rating still prices; a kVA/MVA/MW rating still parses.
    if _rating_kw({"rating_primary": "150 L/min @ 20 m head"}, "cooling pump")[0] is not None:
        print("  FAIL rating_kw read a flow rating (L/min) as kW"); bad += 1
    if _rating_kw({"rating_primary": "2300 A"}, "AC main breaker")[0] is not None:
        print("  FAIL rating_kw read a current rating (A) as kW"); bad += 1
    if _rating_kw({"rating_primary": "94"}, "Circulation Pump")[0] != 94:
        print("  FAIL rating_kw dropped a bare kW number"); bad += 1
    if _rating_kw({"rating_primary": "132 kW"}, "Circulation Pump")[0] != 132:
        print("  FAIL rating_kw dropped an explicit kW rating"); bad += 1

    # ── FLOW-AS-KW PRICING proveCatch (2026-07-02, the v55 Irrigation Pump £63k =
    # '90 kW × £700/kW' where 90 was its FLOW in m³/h): (a) _mods preserves the
    # modifier's separate `unit` field; (b) _rating_kw refuses a flow-united rating;
    # (c) a flow-rated pump prices from its CONTRACT MOTOR kW (distinguishing-token
    # match, f9dfc2918 family) — a pump with flow 90 m³/h + motor 15 kW prices from
    # 15 kW; (d) an ambiguous motor-key tie returns None (never guesses).
    _w_irr = {"modifier_characters": [{"kind": "rating_primary", "value": "90", "unit": "m³/h"}]}
    _md_irr = _mods(_w_irr)
    if _md_irr.get("rating_primary_unit") != "m³/h":
        print("  FAIL _mods dropped the modifier's separate unit field"); bad += 1
    if _rating_kw(_md_irr, "Irrigation Pump")[0] is not None:
        print("  FAIL rating_kw read a value-90/unit-m³/h rating as 90 kW (v55 flow-as-kW)"); bad += 1
    _q_irr = {"irrigation_pump_motor_kw": {"value": 15}, "irrigation_pump_flow_m3_h": {"value": 90}}
    _kwm, _keym = _contract_motor_kw("Irrigation Pump", _q_irr)
    if not (_kwm == 15 and _keym == "irrigation_pump_motor_kw"):
        print(f"  FAIL contract motor kW not resolved: {_kwm} {_keym}"); bad += 1
    g, b = _reconcile_rated_price("Irrigation Pump", _md_irr, 0.0, "x", q=_q_irr)
    if not (g >= 2500 and g <= 20000 and "motor kW from contract irrigation_pump_motor_kw" in b):
        print(f"  FAIL flow-rated pump not priced from its 15 kW motor: £{g:.0f} ({b[:90]})"); bad += 1
    _kwm, _ = _contract_motor_kw("Dosing Pump", {"acid_dosing_pump_power_kw": {"value": 0.04},
                                                 "chemical_dosing_pump_power_kw": {"value": 0.07}})
    if _kwm is not None:
        print("  FAIL ambiguous motor-kW tie guessed instead of returning None"); bad += 1

    # ── UV LAMP-POWER RULE proveCatch (2026-07-02, the v55 £90k '60 kW' UV on a
    # 90 m³/h duty — a 90 m³/h potable UV is ~2-4 kW / £8-15k): the lamp power is
    # never a flow read as kW; it comes from a contract power key, or the dose rule
    # P = flow × dose ÷ UVT-factor (40 mJ/cm² potable), and prices in the LP band.
    _md_uv = _mods({"modifier_characters": [{"kind": "rating_primary", "value": "90", "unit": "m³/h"}]})
    g, b = _unit_operation_price("UV Disinfection Unit", _md_uv,
                                 {"uv_disinfection_throughput_m3_h": {"value": 90}})
    if not (abs(g - 8400.0) < 1 and "dose rule" in b and "2.0 kW" in b):
        print(f"  FAIL UV dose rule (want 2.0 kW → £8,400): £{g} ({str(b)[:90]})"); bad += 1
    g, b = _unit_operation_price("UV Disinfection Unit", _md_uv,
                                 {"uv_disinfection_power_kw": {"value": 4.1}})
    if not (abs(g - (4000.0 + 4.1 * 2200.0)) < 1 and "4.1 kW" in b):
        print(f"  FAIL UV contract lamp-power key not used: £{g} ({str(b)[:90]})"); bad += 1
    # P1-D: IDENTIFIED Spektron-class catalogue price must lift to the parametric
    # (proveCatch — a £280 pin on a 10.1 kW duty must not survive assemble pricing).
    _uv_param, _ = _unit_operation_price(
        "Uv Disinfection",
        _mods({"modifier_characters": [{"kind": "rating_primary", "value": "10.1", "unit": "kW"}]}),
        {"uv_disinfection_power_kw": {"value": 10.1}},
    )
    if not (_uv_param and _uv_param >= 20000):
        print(f"  FAIL UV 10.1 kW parametric below £20k floor (got £{_uv_param})"); bad += 1
    _uv_floor = _price_floor_for("Uv Disinfection", {})
    if not (_uv_floor and _uv_floor >= 8000):
        print(f"  FAIL UV process-system floor missing/too low (got {_uv_floor})"); bad += 1

    # P1-D MEDIA-BED (2026-07-09, codema V-101): GAC/softener parametric at 14.5 m³/h
    # must land near the physics subassembly (~£14.7k), never a £105 media-bag stub.
    _md_gac = _mods({"modifier_characters": [
        {"kind": "rating_primary", "value": "14.5", "unit": "m³/h"},
    ]})
    _gac_param, _gac_basis = _unit_operation_price(
        "Gac Filter", _md_gac, {"gac_filter_throughput_m3_h": {"value": 14.5}},
    )
    if not (_gac_param and 12000 <= _gac_param <= 20000 and "media-bed" in (_gac_basis or "")):
        print(f"  FAIL media-bed 14.5 m³/h parametric (want £12–20k): £{_gac_param} "
              f"({str(_gac_basis)[:90]})"); bad += 1

    # ── MEMBRANE-AS-STEEL proveCatch (2026-07-02, v55: 'Ro Membrane Elements · 364 m²'
    # = £40,760 'structural steelwork take-off', ×3 lines = £122k / 16% of the bill):
    # a membrane/element/media line NEVER takes a structural or shell take-off — it
    # prices from MEMBRANE AREA (elements £/m²; housings per element slot).
    _md_mem = {"rating_primary": "364", "rating_primary_unit": "m2", "dimension": ""}
    if _structural_takeoff("Ro Membrane Elements", _md_mem) is not None:
        print("  FAIL membrane line took a structural steelwork take-off"); bad += 1
    mt = _materials_takeoff("Ro Membrane Elements", _md_mem)
    if not (mt and abs(mt[0] - 9100.0) < 1 and "membrane-area parametric" in mt[1]):
        print(f"  FAIL membrane elements not priced from membrane area: {mt}"); bad += 1
    mt = _materials_takeoff("Grp Membrane Housings", _md_mem)
    if not (mt and abs(mt[0] - 11000.0) < 1 and "membrane-housing parametric" in mt[1]):
        print(f"  FAIL membrane housings not priced per element slot: {mt}"); bad += 1

    # ── UNIVERSAL RATING-BASED COST MODEL (council 2026-06-16/17) ──
    # invariant: power-rated kit is priced from the £/kW(/kVA) market curve in BOTH
    # directions — a £0/under-priced line is lifted UP, an over-priced one pulled
    # DOWN, both to the band; the model NEVER returns £0 for a real rating.
    md94 = {"rating_primary": "94"}
    # (a) under-priced 94 kW pump (£35 LLM stamp) → grounded UP into the pump band
    g, b = _reconcile_rated_price("Circulation Pump", md94, 35.0, "catalogue")
    if not (45000 <= g <= 130000 and "grounded to market" in b):
        print(f"  FAIL under-priced pump not lifted to band: £{g:.0f} ({b[:40]})"); bad += 1
    # (b) absent price on a 96 kW heat pump → grounded (never £0)
    g, b = _reconcile_rated_price("Heat Pump", {"rating_primary": "96"}, 0.0, "x")
    if not (g >= 38000):
        print(f"  FAIL heat-pump £0 not grounded: £{g:.0f}"); bad += 1
    # (c) over-priced 11 kW blower stamped at £80k (>1.5×hi) → pulled DOWN to band
    g, b = _reconcile_rated_price("Aeration Blower", {"rating_primary": "11"}, 80000.0, "x")
    if not (g < 20000 and "grounded to market" in b):
        print(f"  FAIL over-priced blower not pulled to band: £{g:.0f}"); bad += 1
    # (d) a defensible in-band genset quote (£293/kVA, band 200-440) is KEPT, not churned
    g, b = _reconcile_rated_price("Standby Diesel Generator", {"rating_primary": "1000"}, 293200.0, "vendor")
    if not (abs(g - 293200) < 1):
        print(f"  FAIL in-band genset needlessly overwritten: £{g:.0f}"); bad += 1
    # (e) a non-rated noun (a vessel/instrument) is untouched (no spurious rating match)
    g, b = _reconcile_rated_price("Buffer Vessel", {"rating_primary": "50"}, 7500.0, "take-off")
    if not (abs(g - 7500) < 1):
        print(f"  FAIL vessel wrongly rating-grounded: £{g:.0f}"); bad += 1

    # ── COMMODITY CATALOGUE CAP — a commodity electronic/IC/cable with a structured
    # PN + a known catalogue price must never exceed 3× that price (the TMP451 494×
    # / Honeywell DP-switch 219× class). A bare descriptor (no catalogue) is NOT
    # capped/inflated — it falls through to the rating model / floor.
    g, b = _commodity_catalogue_cap("Temperature Sensor", "TMP451AQDQFRQ1", 692.0, 1.40)
    if not (g and abs(g - 4.20) < 0.01 and b):
        print(f"  FAIL TMP451 commodity not capped to 3× catalogue: £{g} ({b})"); bad += 1
    g, b = _commodity_catalogue_cap("Differential-Pressure Switch", "HSCDLNN100MDSA5", 8652.0, 39.43)
    if not (g and g <= 3.0 * 39.43 + 0.01 and b):
        print(f"  FAIL DP-switch commodity not capped: £{g}"); bad += 1
    g, b = _commodity_catalogue_cap("M6 Bolt", "M6", 50.0, None)          # no catalogue price
    if not (abs(g - 50.0) < 0.01 and b is None):
        print(f"  FAIL bare descriptor wrongly capped: £{g} ({b})"); bad += 1
    g, b = _commodity_catalogue_cap("Circulation Pump", "GRUNDFOS-NB-100", 65000.0, 1.40)  # not a commodity noun
    if not (abs(g - 65000.0) < 0.01 and b is None):
        print(f"  FAIL rated kit wrongly treated as commodity: £{g} ({b})"); bad += 1

    # ── MOTOR-NAMEPLATE DISPLAY (council 2026-06-17, marine RAS) — a motor-driven
    # line shows its MOTOR nameplate kW, not the shaft/hydraulic duty. Fires only
    # when the line already shows a shaft rating AND the contract pairs it (by the
    # shaft sibling OR the noun stem) with a larger `*_motor_kw`. No-op otherwise —
    # the CO₂/SAF byte-identical guarantee depends on this.
    _qm = {"recirc_pump_power_kw": {"value": 94}, "recirc_pump_motor_kw": {"value": 132}}
    np, sh = _motor_nameplate_kw("Circulation Pump", 94.0, _qm)        # physics pairing
    if not (np == 132 and sh == 94):
        print(f"  FAIL pump motor nameplate not adopted: nameplate={np} shaft={sh}"); bad += 1
    np2, _ = _motor_nameplate_kw("Recirc Pump", 94.0, _qm)            # noun-stem path
    if np2 != 132:
        print(f"  FAIL recirc-pump nameplate (noun stem) not adopted: {np2}"); bad += 1
    # a NON-motor noun (a tank) never adopts a motor nameplate
    if _motor_nameplate_kw("Buffer Tank", 94.0, _qm)[0] is not None:
        print("  FAIL non-rotating noun wrongly took a motor nameplate"); bad += 1
    # a pump with NO shaft sibling + NO matching stem (CO₂/SAF shape) is a NO-OP
    if _motor_nameplate_kw("Slurry Pump", 5.0, {"mea_pump_motor_kw": {"value": 0.75}})[0] is not None:
        print("  FAIL unmatched motor key wrongly adopted (would break CO₂/SAF identity)"); bad += 1
    # a motor nameplate that is NOT larger than the shaft (equal) is a no-op
    if _motor_nameplate_kw("Feed Pump", 5.0,
                           {"feed_pump_power_kw": {"value": 5}, "feed_pump_motor_kw": {"value": 5}})[0] is not None:
        print("  FAIL equal motor==shaft wrongly substituted"); bad += 1

    # ── BARE-COMMODITY HARD CEILING (council 2026-06-17, the marine-RAS mis-PIN) —
    # a bare IC / sensor-IC / microcontroller / comms / I/O line with NO kW/duty
    # rating can't exceed its sub-class ceiling, EVEN when its catalogue price never
    # resolves (the TMP451 labelled "Network Switch", the MSP430 at £752, the MEMS
    # DP-switch at £9,406). A genuine process instrument (probe/analyser) or
    # mechanical kit whose name merely contains a commodity token (screw conveyor,
    # cable-transit frame) is EXEMPT — that exemption preserves the CO₂ archetype.
    g, b = _apply_commodity_ceiling("Network Switch", {}, 752.0)       # MSP430 mis-pin → £500
    if not (g == 500.0 and b):
        print(f"  FAIL Network-Switch mis-pin not ceiling-capped: £{g} ({b})"); bad += 1
    g, b = _apply_commodity_ceiling("Local Sensor", {}, 4390.0)        # TMP451 mis-pin → £150
    if not (g == 150.0 and b):
        print(f"  FAIL Local-Sensor mis-pin not ceiling-capped: £{g} ({b})"); bad += 1
    g, b = _apply_commodity_ceiling("Differential-Pressure Switch", {}, 9406.0)  # Honeywell → £500
    if not (g == 500.0 and b):
        print(f"  FAIL DP-switch mis-pin not ceiling-capped: £{g} ({b})"); bad += 1
    # EXEMPTIONS (these MUST stay uncapped — they are the CO₂ byte-identical cases):
    if _apply_commodity_ceiling("reactor pH probe", {}, 4400.0)[1] is not None:
        print("  FAIL real process probe wrongly ceiling-capped"); bad += 1
    if _apply_commodity_ceiling("reactor temperature sensor", {}, 2200.0)[1] is not None:
        print("  FAIL qualified process sensor wrongly ceiling-capped"); bad += 1
    if _apply_commodity_ceiling("gypsum feed hopper + screw", {}, 9800.0)[1] is not None:
        print("  FAIL screw-conveyor wrongly ceiling-capped (commodity-token false positive)"); bad += 1
    if _apply_commodity_ceiling("cable transit frames", {}, 1920.0)[1] is not None:
        print("  FAIL cable-transit frame wrongly ceiling-capped"); bad += 1
    # a RATED instrument (carries kW/duty) is exempt — its price is rating-driven
    if _apply_commodity_ceiling("Aeration Blower", {"rating_primary": "11"}, 10000.0)[1] is not None:
        print("  FAIL rated blower wrongly ceiling-capped"); bad += 1
    # a bare unqualified sensor noun (the mis-pinned Mitsubishi/TI sensor lines) IS capped
    g, b = _apply_commodity_ceiling("Temperature Sensor", {}, 752.0)
    if not (g == 500.0 and b):
        print(f"  FAIL bare Temperature-Sensor mis-pin not capped: £{g}"); bad += 1

    # ── PN-OVER-DESCRIPTION COMMODITY CLASS (council 2026-06-17 — the gate-21
    # mis-PIN that SURVIVED). The ceiling tier must come from the PART NUMBER, not
    # the (mis-pinned) human description: a 'Local Sensor' whose PN is a TI TMP451
    # temp IC is the IC; a 'Non-Return Valve' whose PN is a bare Crouzet commodity
    # SKU is NOT exempted by the word 'valve'. A genuine field-instrument PN
    # (E+H/Krohne/Rosemount/Honeywell-STD) or a kW/duty rating stays exempt.
    if _commodity_pn_class("TMP451AQDQFRQ1", "Texas Instruments") != 150.0:
        print("  FAIL TMP451 PN not classed as a commodity IC (£150)"); bad += 1
    if _commodity_pn_class("MSP430", "TI") != 150.0:
        print("  FAIL MSP430 PN not classed as a commodity MCU (£150)"); bad += 1
    if _commodity_pn_class("HSCDLNN100MDSA5", "Honeywell") != 150.0:
        print("  FAIL Honeywell HSC board-mount sensor-IC not classed commodity (£150)"); bad += 1
    if _commodity_pn_class("81529907", "Crouzet") is not None:
        # a bare numeric SKU from a non-semiconductor vendor is NOT auto-commodity by
        # PN alone — it must be caught by the NAME tier or its catalogue cap. (Crouzet
        # is not a chip-house; its '81529907' is a real component PN.) PN-class None here.
        pass
    # a real field-instrument PN is NEVER a commodity, whatever it is labelled
    if _commodity_pn_class("PMC71-ABA1V1RAAAA", "Endress+Hauser") is not None:
        print("  FAIL genuine E+H transmitter PN wrongly classed commodity"); bad += 1
    if _commodity_pn_class("STD730-E1AC4AS-1-A-AHB-11S-A", "Honeywell") is not None:
        print("  FAIL Honeywell STD process transmitter wrongly classed commodity"); bad += 1

    # _bare_commodity_ceiling: PN-over-description (takes the TIGHTER of PN/name).
    # 'Local Sensor' (name→£150 IC) + TMP451 PN → £150.
    if _bare_commodity_ceiling("Local Sensor", "TMP451AQDQFRQ1", {}, "", "Texas Instruments") != 150.0:
        print("  FAIL Local Sensor/TMP451 not bounded at £150"); bad += 1
    # 'Network Switch' (name→£500) but MSP430 PN → tighter £150.
    if _bare_commodity_ceiling("Network Switch", "MSP430", {}, "", "TI") != 150.0:
        print("  FAIL Network Switch/MSP430 not bounded at the tighter IC £150"); bad += 1
    # 'Non-Return Valve' — name exempts via 'valve', but a Honeywell HSC sensor-IC PN
    # would still class it; with a bare Crouzet SKU + no rating it relies on the
    # catalogue cap (gate-21 distributor price) — bare ceiling is None (correctly,
    # a real valve must not be force-capped to a chip tier).
    if _bare_commodity_ceiling("Non-Return Valve", "81529907", {}, "", "Crouzet") is not None:
        print("  FAIL Non-Return Valve wrongly force-capped (no commodity PN signal)"); bad += 1
    # a real rated instrument (kW/duty) is exempt even with a commodity-ish name
    if _bare_commodity_ceiling("Aeration Blower", "X", {"rating_primary": "11"}, "", "") is not None:
        print("  FAIL rated blower wrongly bare-commodity-capped"); bad += 1

    # _normalise_partverification_prices: mutates the EXACT field gate 21 reads
    # (cost_repair_corrected_price_gbp / price_estimate_gbp), PN-over-description.
    # Mirrors the live ras-v11 mis-PINs: a TMP451 IC labelled 'Local Sensor' at £751,
    # an MSP430 micro labelled 'Network Switch' (word PN = TBD, real MPN on the PV),
    # a Honeywell HSC MEMS labelled 'Differential-Pressure Switch' at £9,391.
    _state = {
        "moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
            {"id": "w_local_sensor", "name_human": "Local Sensor",
             "modifier_characters": [{"kind": "part_number", "value": "TMP451AQDQFRQ1"},
                                     {"kind": "manufacturer", "value": "Texas Instruments"}]},
            {"id": "w_net_switch", "name_human": "Network Switch",
             "modifier_characters": [{"kind": "part_number", "value": "TBD (detailed design)"},
                                     {"kind": "manufacturer", "value": "TI"}]},
            {"id": "w_dp_switch", "name_human": "Differential-Pressure Switch",
             "modifier_characters": [{"kind": "part_number", "value": "HSCDLNN100MDSA5"},
                                     {"kind": "manufacturer", "value": "Honeywell"}]},
            {"id": "w_real_probe", "name_human": "reactor pH probe",
             "modifier_characters": [{"kind": "part_number", "value": "PMC71-ABA1V1RAAAA"},
                                     {"kind": "manufacturer", "value": "Endress+Hauser"}]},
            {"id": "w_rated_pump", "name_human": "Circulation Pump",
             "modifier_characters": [{"kind": "rating_primary", "value": "94"}]},
            {"id": "w_nrv", "name_human": "Non-Return Valve",
             "modifier_characters": [{"kind": "part_number", "value": "81529907"},
                                     {"kind": "manufacturer", "value": "Crouzet"}]},
        ]}]}]},
        "partVerifications": [
            {"word_id": "w_local_sensor", "part_number": "TMP451AQDQFRQ1", "manufacturer": "Texas Instruments",
             "price_estimate_gbp": 751.34, "cost_repair_corrected_price_gbp": 751.34},
            {"word_id": "w_net_switch", "part_number": "MSP430", "manufacturer": "TI",
             "price_estimate_gbp": 751.34, "cost_repair_corrected_price_gbp": 751.34},
            {"word_id": "w_dp_switch", "part_number": "HSCDLNN100MDSA5", "manufacturer": "Honeywell",
             "price_estimate_gbp": 9391.76, "cost_repair_corrected_price_gbp": 9391.76},
            # genuine E+H process transmitter WITH a catalogue reference price — must
            # stay exempt from BOTH arms (the field-instrument PN protects it).
            {"word_id": "w_real_probe", "part_number": "PMC71-ABA1V1RAAAA", "manufacturer": "Endress+Hauser",
             "engine_c_our_unit_gbp": 1200.0,
             "price_estimate_gbp": 4400.0, "cost_repair_corrected_price_gbp": 4400.0},
            {"word_id": "w_rated_pump", "part_number": "", "manufacturer": "",
             "price_estimate_gbp": 65000.0, "cost_repair_corrected_price_gbp": 65000.0},
            # Crouzet in-line non-return valve — correctly DESCRIBED (noun 'valve'
            # exempts arm A) but parametrically over-priced; arm B caps it at 3× its
            # £49.66 forge-truth.db reference (the number gate 21 uses) → £148.98.
            {"word_id": "w_nrv", "part_number": "81529907", "manufacturer": "Crouzet",
             "engine_c_our_unit_gbp": 49.66, "distributor_price_gbp": 0,
             "price_estimate_gbp": 939.18, "cost_repair_corrected_price_gbp": 939.18},
        ],
    }
    _changes = _normalise_partverification_prices(_state)
    _pv = {p["word_id"]: p for p in _state["partVerifications"]}
    # the three mis-PINs are capped to their IC tier (£150) on BOTH price fields
    for _wid in ("w_local_sensor", "w_net_switch", "w_dp_switch"):
        for _fld in ("cost_repair_corrected_price_gbp", "price_estimate_gbp"):
            if _pv[_wid][_fld] != 150.0:
                print(f"  FAIL partVerif {_wid}.{_fld} not capped to £150: £{_pv[_wid][_fld]}"); bad += 1
    # the Crouzet non-return valve is capped to 3× its catalogue reference (arm B),
    # NOT a chip tier — and well under gate 21's 5× HIGH threshold (3× < 5×).
    _nrv = _pv["w_nrv"]["cost_repair_corrected_price_gbp"]
    if not (abs(_nrv - 3.0 * 49.66) < 0.01):
        print(f"  FAIL Crouzet non-return valve not capped to 3× catalogue: £{_nrv}"); bad += 1
    # the genuine E+H probe + the rated pump are UNTOUCHED (CO₂/SAF byte-identity) —
    # the E+H probe stays £4,400 even though it carries a £1,200 reference price (a
    # field instrument is exempt from the 3× catalogue cap; its price is engineered).
    if _pv["w_real_probe"]["cost_repair_corrected_price_gbp"] != 4400.0:
        print("  FAIL genuine E+H probe price wrongly capped"); bad += 1
    if _pv["w_rated_pump"]["cost_repair_corrected_price_gbp"] != 65000.0:
        print("  FAIL rated pump price wrongly capped"); bad += 1
    # idempotent: a second pass changes nothing
    if _normalise_partverification_prices(_state):
        print("  FAIL price normalisation not idempotent"); bad += 1
    # a state with NO mis-pinned commodity lines yields zero changes (the CO₂ case)
    _clean = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
                {"id": "w_col", "name_human": "Distillation Column",
                 "modifier_characters": []}]}]}]},
              "partVerifications": [{"word_id": "w_col", "part_number": "BESPOKE-FT-001",
                                     "manufacturer": "EPC", "price_estimate_gbp": 480000.0,
                                     "cost_repair_corrected_price_gbp": 480000.0}]}
    if _normalise_partverification_prices(_clean):
        print("  FAIL clean (CO₂-shape) state wrongly mutated by price normalisation"); bad += 1

    # ── CLOSED-VESSEL CEILING — a small closed-vessel take-off can never reach the
    # absurd £1M-class value the prior council flagged on a ~7 m³ "UV reactor".
    ceil7 = _vessel_cost_ceiling(7.1)
    if not (ceil7 < 200000):
        print(f"  FAIL 7 m³ vessel ceiling too high: £{ceil7:.0f}"); bad += 1
    mt = _materials_takeoff("UV Reactor", {"dimension": "1.8 m dia x 2.8 m"})
    if mt and mt[0] > ceil7:
        print(f"  FAIL small vessel take-off £{mt[0]:.0f} exceeds its own ceiling £{ceil7:.0f}"); bad += 1

    # ── PHASE 0: TYPED SERVICE → FABRICATION KIND + PLAUSIBILITY INVARIANT (council
    # 2026-06-17, the £42.36M Structural Frame). The cost characteriser must decide the
    # fabrication branch from the TYPED service the synthesis emitted, NEVER the noun;
    # and a part may be priced as a closed PRESSURE vessel ONLY IF it has a fluid service
    # AND pressure_bar>0 AND a sane volume. The exact live bug: a footprint-driven
    # "Structural Frame" + the whole-plant 54.5×24.5 m bounding-box geometry → £42.36M.
    WHOLE_PLANT_GEOM = (54.5069, 24.5281)   # the bbox that produced the £42M shell
    svc_struct = json.dumps({"fluid": "none", "phase": "solid", "pressure_bar": 0,
                             "fabrication_family": "structural", "criticality": "standard"})
    # _read_service round-trips the JSON descriptor
    rs = _read_service({"service": svc_struct})
    if not (rs and rs["fabrication_family"] == "structural" and rs["fluid"] == "none" and rs["pressure_bar"] == 0):
        print(f"  FAIL _read_service did not parse the typed service: {rs}"); bad += 1
    # a structural part is priced on its FOOTPRINT (£/m²), NOT a hoop-stress shell — even
    # with the whole-plant bounding-box geometry that previously gave £42.36M.
    frame_md = {"dimensions": "2971 m² footprint, 8 m haunch height", "service": svc_struct}
    fmt = _materials_takeoff("Structural Frame", frame_md, WHOLE_PLANT_GEOM, _read_service(frame_md))
    # priced structurally (£/m² footprint), NOT a hoop-stress shell wall computation.
    # (the basis MENTIONS hoop-stress only to say it was REJECTED — so check the actual
    # wall-physics formula token "= P·r/" is absent, i.e. no shell take-off was computed.)
    fmt_basis = fmt[1] if fmt else ""
    if not (fmt and 50000 < fmt[0] < 1500000 and "structural steelwork" in fmt_basis and "= P·r/" not in fmt_basis):
        print(f"  FAIL structural frame not priced structurally: £{fmt[0] if fmt else 0:,.0f} ({fmt_basis[:60]})"); bad += 1
    if fmt and fmt[0] > 2000000:
        print(f"  FAIL structural frame STILL in the £M-class pressure-shell range: £{fmt[0]:,.0f}"); bad += 1
    # PLAUSIBILITY by VOLUME (defence-in-depth): even with NO typed service, an impossible
    # 57,000 m³ "vessel" (the whole-plant bbox) must NOT be priced as a closed shell.
    fmt_ns = _materials_takeoff("Structural Frame", {"dimensions": "2971 m² footprint"}, WHOLE_PLANT_GEOM, None)
    if not (fmt_ns and fmt_ns[0] < 2000000):
        print(f"  FAIL 57,000 m³ no-service shell not rejected by the volume guard: £{fmt_ns and fmt_ns[0]:,.0f}"); bad += 1
    # a GENUINE pressure vessel (fluid service + pressure_bar>0 + sane volume) STILL takes
    # the closed hoop-stress shell branch — the CO₂/SAF/BESS byte-identity depends on this.
    svc_ves = json.dumps({"fluid": "process_water", "phase": "liquid", "pressure_bar": 25,
                          "fabrication_family": "fluid_vessel", "criticality": "high"})
    vmt = _materials_takeoff("Buffer Vessel", {"dimension": "2.5 m dia x 8 m", "service": svc_ves},
                             (2.5, 8.0), _read_service({"service": svc_ves}))
    if not (vmt and "hoop" in vmt[1]):
        print(f"  FAIL genuine pressure vessel did NOT take the shell branch: {vmt and vmt[1][:60]}"); bad += 1
    # an OPEN atmospheric tank (fluid='process_water', pressure 0) is NOT redirected to
    # structural — it stays a fluid-holding OPEN-tank take-off (no top head, tapered).
    svc_open = json.dumps({"fluid": "process_water", "phase": "liquid", "pressure_bar": 0,
                           "fabrication_family": "fluid_vessel", "criticality": "standard"})
    omt = _materials_takeoff("Rearing Tank", {"dimension": "12.4 m dia x 3.2 m", "service": svc_open},
                             (12.4, 3.2), _read_service({"service": svc_open}))
    if not (omt and "tapered" in omt[1] and "structural steelwork" not in omt[1]):
        print(f"  FAIL open tank wrongly redirected away from the open take-off: {omt and omt[1][:60]}"); bad += 1
    # a part with NO typed service + a SANE geometry behaves EXACTLY as before (legacy
    # fallback path unchanged — the noun heuristic still decides).
    leg_open = _materials_takeoff("Rearing Tank", {"dimension": "12.4 m dia x 3.2 m"}, (12.4, 3.2), None)
    if not (leg_open and "tapered" in leg_open[1]):
        print(f"  FAIL legacy no-service open tank changed behaviour: {leg_open and leg_open[1][:60]}"); bad += 1

    # ── PROCESS-SYSTEM + CONTROL-ELEMENT FLOORS (RAS £5M audit 2026-06-19) — process
    # systems, blowers, the DN400 control valve and the >100 kW immersion heater must
    # never be token-priced, while a process VESSEL (CO₂/SAF byte-identity) is untouched.
    # (a) process-system category floors
    for nm, want_min in [("Chemical Dosing System (pH / Alkalinity)", 3000.0),
                         ("Feed Storage + Distribution System", 5000.0),
                         ("Solids / Sludge Handling System", 8000.0),
                         ("Grading / Harvest System", 6000.0),
                         ("Effluent Treatment + Discharge System", 8000.0),
                         ("Mortality Handling System", 5000.0),
                         ("Oxygen Supply (LOX) System", 1500.0)]:
        f = _price_floor_for(nm, {})
        if f != want_min:
            print(f"  FAIL process floor {nm!r}: £{f} (want £{want_min})"); bad += 1
    # (b) blower floor = max(£5,000, duty_kw × £500/kW) — a 55 kW blower is £27,500,
    # NOT the steep £3,000/kW generic tier (which would mis-price it at £165k)
    if _price_floor_for("Degassing Blower", {"rating_primary": "55"}) != 27500.0:
        print(f"  FAIL blower duty floor: £{_price_floor_for('Degassing Blower', {'rating_primary':'55'})} (want £27,500)"); bad += 1
    if _price_floor_for("Aeration Blower", {}) != 5000.0:
        print("  FAIL unrated blower floor not £5,000"); bad += 1
    # (c) >100 kW backup immersion heater = £6,000 + duty_kw × £3,000/kW (≤100 kW: no
    # immersion floor — covered by the duty/electrical paths)
    if _price_floor_for("Backup Immersion Heater", {"rating_primary": "411"}) != 6000.0 + 411 * 200.0:
        print("  FAIL immersion-heater floor formula"); bad += 1
    if _price_floor_for("Backup Immersion Heater", {"rating_primary": "40"}) is not None:
        print("  FAIL immersion heater ≤100 kW wrongly floored"); bad += 1
    # (d) a process VESSEL / tank / reactor matches NO process-system floor → None
    # (the CO₂/SAF byte-identity guarantee — their strong-bespoke kit is untouched)
    for nm in ("Distillation Column", "Buffer Vessel", "Rearing Tank", "Fischer-Tropsch Reactor"):
        if _price_floor_for(nm, {}) is not None:
            print(f"  FAIL process-vessel {nm!r} wrongly floored (£{_price_floor_for(nm, {})})"); bad += 1
    # (d1) ELECTRICAL ASSEMBLY enclosures (2026-06-26 Codema: "Electrical Control Panel" had NO
    # floor → £218, and a stale qty made it £713k). A populated panel/board/switchboard/MCC takes
    # a minimum-credible assembly floor; a COMPONENT within one keeps its own (busbar £120, breaker
    # £45); a solar/vent/deflagration/cladding panel is NOT switchgear → untouched.
    for nm, want in [("Electrical Control Panel", 800.0), ("Local Control Panel", 800.0),
                     ("Distribution Board", 800.0), ("Power Distribution Panel", 800.0),
                     ("Main Switchboard", 3000.0), ("Motor Control Centre", 3000.0)]:
        if _price_floor_for(nm, {}) != want:
            print(f"  FAIL assembly floor {nm!r}: £{_price_floor_for(nm, {})} (want £{want})"); bad += 1
    if _price_floor_for("main switchboard busbar", {}) != 120.0:   # component wins over assembly
        print(f"  FAIL switchboard busbar lost its £120 floor (got {_price_floor_for('main switchboard busbar', {})})"); bad += 1
    for nm in ("Solar Panel", "Deflagration Vent Panel", "Polycarbonate cladding panel"):
        if _price_floor_for(nm, {}) is not None:
            print(f"  FAIL non-switchgear {nm!r} wrongly floored (£{_price_floor_for(nm, {})})"); bad += 1
    # (d2) PACK-INTERNAL MICRO-COMMODITY guard (2026-06-24): a pack-internal cell part takes the
    # tiny micro band, NOT the £120 switchgear busbar floor (×3,735 = £448k). Material-split: a
    # stamped METAL busbar/interconnect-bar floors at £2 (ceiling £15); a WIRE/LEAD/insulation-PAD
    # consumable floors at £0.3 (ceiling £2.5 — the net flagged the old shared £12 ceiling as still
    # 10-20× too high). A genuine distribution / DC busbar still gets the £120 switchgear floor.
    for nm in ("cell-to-cell busbar", "cell interconnect bar"):           # metal → £2 floor
        if _price_floor_for(nm, {}) != 2.0:
            print(f"  FAIL micro-commodity metal {nm!r} not £2 floor (got {_price_floor_for(nm, {})})"); bad += 1
    for nm in ("cell voltage tap wire", "cell insulation pad", "module sense wire"):  # consumable → £0.3
        if _price_floor_for(nm, {}) != 0.3:
            print(f"  FAIL micro-commodity wire/pad {nm!r} not £0.3 floor (got {_price_floor_for(nm, {})})"); bad += 1
    # ceilings: a wire/pad caps at £2.5, a metal bar at £15
    if _pack_micro_band("cell voltage tap wire") != (0.3, 2.5):
        print(f"  FAIL wire/pad band (got {_pack_micro_band('cell voltage tap wire')})"); bad += 1
    if _pack_micro_band("cell-to-cell busbar") != (2.0, 15.0):
        print(f"  FAIL metal-bar band (got {_pack_micro_band('cell-to-cell busbar')})"); bad += 1
    # (d3) BATTERY CELL pricing (2026-06-24/25): an LFP prismatic cell (280 Ah, 3.2 V) → (gbp, basis)
    # in a sane CELL range (£20-90): the real DB median (~£52, forge-truth.db) when present, else the
    # DB-grounded energy estimate (0.896 kWh × £57/kWh ≈ £51). A non-battery 'cell' (fuel/load/solar)
    # is NOT priced; a cell with no Ah returns None.
    _cellp = _battery_cell_price("LFP prismatic cell", {"capacity": "280", "dimension": "3.2 V"})
    if not (isinstance(_cellp, tuple) and 20.0 <= _cellp[0] <= 90.0 and "cell" in _cellp[1]):
        print(f"  FAIL LFP cell price not a sane (gbp, basis) tuple (got {_cellp})"); bad += 1
    if _battery_cell_price("hydrogen fuel cell stack", {"capacity": "280"}) is not None:
        print("  FAIL non-battery 'fuel cell' wrongly priced"); bad += 1
    if _battery_cell_price("LFP prismatic cell", {}) is not None:
        print("  FAIL cell with no Ah should return None"); bad += 1
    # (d4) UNIVERSAL DB-spec resolver (2026-06-25): noun + discriminating spec required; a noun with
    # NO numeric spec returns None (don't trust a coarse noun-only DB median — the £4,270 heater bug).
    if _spec_like_tokens("off-gas activation solenoid", {}) is not None:
        print("  FAIL spec-less part should yield no spec token (noun-only DB match is unsafe)"); bad += 1
    if _spec_like_tokens("PTC rack heater", {"rating_primary": "250 W"}) is None:
        print("  FAIL a 250 W heater should yield a spec token for DB matching"); bad += 1
    if _pack_micro_band("DC busbar 800 V") is not None:
        print("  FAIL distribution busbar wrongly matched the micro band"); bad += 1
    for nm in ("DC busbar 800 V", "distribution busbar", "main switchboard busbar"):
        if _price_floor_for(nm, {}) != 120.0:
            print(f"  FAIL distribution busbar {nm!r} lost its £120 floor (got {_price_floor_for(nm, {})})"); bad += 1
    # amp-aware busbar (2026-07-10 run 50): a sub-100 A pack busbar — rating in the MODIFIERS,
    # not the name — floors £20 (stamped copper), never the £120 switchboard constant; a ≥100 A
    # or unrated busbar keeps £120.
    if _price_floor_for("DC Busbar Assembly", {"rating_primary": "39.2 A continuous"}) != 20.0:
        print("  FAIL 39.2 A busbar (rating in md) should floor £20"); bad += 1
    if _price_floor_for("DC Busbar Assembly", {"rating_primary": "400 A continuous"}) != 120.0:
        print("  FAIL 400 A busbar must keep the £120 switchboard floor"); bad += 1
    # (e) duty-scaled floor tiers
    if not (_duty_scaled_floor(3) == 1500.0 and _duty_scaled_floor(30) == 15000.0
            and _duty_scaled_floor(100) == 300000.0 and _duty_scaled_floor(None) is None):
        print("  FAIL _duty_scaled_floor tiers"); bad += 1
    # (f) CONTROL-ELEMENT class budgets — a final control element NEVER costs £0
    if _control_element_budget("Inlet Flow Control Valve") != 1800.0:   # modulating → proportional
        print("  FAIL DN400 modulating valve not bounded at £1,800"); bad += 1
    if _control_element_budget("Dissolved-O₂ Control Valve") != 1800.0:
        print("  FAIL DO control valve not bounded at £1,800"); bad += 1
    if _control_element_budget("Emergency O₂ Solenoid + Diffuser (fail-open)") != 1200.0:
        print("  FAIL O₂ solenoid not bounded at the £1,200 final-control-element budget"); bad += 1
    if _control_element_budget("Motorised Actuator") != 2500.0:
        print("  FAIL motorised actuator not bounded at £2,500"); bad += 1
    if _control_element_budget("Buffer Vessel") is not None or _control_element_budget("Recirc Pump") is not None:
        print("  FAIL a non-control-element wrongly given a control-element budget"); bad += 1
    # (g) DUTY-SCALED CLASS-REFERENCE BUDGET — auditable, basis string explicit, never
    # lowers; a non-referenced noun or no-kW returns None
    hp = _duty_scaled_class_budget("Heat Pump", 1493)
    if not (hp and abs(hp[0] - 6000.0 * (1493 / 5.0) ** 0.6) < 1 and "(1493/5)^0.6" in hp[1]):
        print(f"  FAIL heat-pump class-reference budget: {hp}"); bad += 1
    if _duty_scaled_class_budget("Heat Pump", 5)[0] != 6000.0:   # reference duty → base
        print("  FAIL heat-pump at reference duty not £6,000"); bad += 1
    if _duty_scaled_class_budget("Centrifugal Pump", 94) is not None:   # pump is not in the set
        print("  FAIL a pump wrongly given a class-reference budget"); bad += 1
    if _duty_scaled_class_budget("Heat Pump", None) is not None:
        print("  FAIL class-reference budget without a kW wrongly returned"); bad += 1
    # (h) ZERO-PRICE COMMODITY FLOOR (2026-06-25): a £0 commodity line is floored to a
    # small NOUN-appropriate minimum (no £0 priced line ever ships) — the real parts the
    # DB had no price for. Keyed off _principal_noun, universal (no per-MPN table).
    for _name, _want_floor, _want_noun in [
            ("Brady 121085 labels", 1.0, "labels"),                 # label/marker → £1
            ("Klauke 16208 cable lug", 2.0, "lug"),                 # cable lug/ferrule → £2
            ("Trelleborg gasket", 5.0, "gasket"),                   # gasket/seal → £5
            ("Eaton MCB", 8.0, "mcb"),                              # fuse/MCB → £8
            ("Vishay MKP1848C capacitor", 15.0, "capacitor"),       # capacitor → £15
            ("Schaffner FN6840 line filter", 60.0, "filter"),       # EMC/line filter → £60
            ("anonymous bracket clip", 3.0, "clip")]:               # any other commodity → £3 catch-all
        _f, _n = _commodity_zero_floor(_name)
        if _f != _want_floor or _n != _want_noun:
            print(f"  FAIL commodity floor {_name!r}: got (£{_f}, {_n!r}) want (£{_want_floor}, {_want_noun!r})"); bad += 1
    # the floor LIFTS a £0 line and annotates provenance; a normally-priced line is UNCHANGED.
    def _apply_zero_floor(name, gbp):
        """mirror the in-assemble guard for a unit test: lift £0 → noun floor, else no-op."""
        if gbp <= 0:
            _cf, _cn = _commodity_zero_floor(name)
            return (_cf, f"x · commodity-floor (no DB price; {_cn!r} → £{_cf:g})")
        return (gbp, "x")
    _g0, _b0 = _apply_zero_floor("Klauke 16208 cable lug", 0.0)
    if not (_g0 == 2.0 and "commodity-floor" in _b0):
        print(f"  FAIL £0 cable lug not floored to £2 with annotated basis (got £{_g0}, {_b0!r})"); bad += 1
    _g1, _b1 = _apply_zero_floor("Trelleborg gasket", 42.0)          # already priced → untouched
    if not (_g1 == 42.0 and "commodity-floor" not in _b1):
        print(f"  FAIL normally-priced gasket wrongly altered by the £0 floor (got £{_g1})"); bad += 1
    _g2, _b2 = _apply_zero_floor("Schaffner FN6840 line filter", 0.0)
    if not (_g2 == 60.0 and "commodity-floor" in _b2):
        print(f"  FAIL £0 line filter not floored to £60 (got £{_g2})"); bad += 1

    # ── (i) ACTUATED-VALVE ASSEMBLY FAMILY + BARE-ACTUATOR BAND + DE-DUP (benchmark net
    # v56, 2026-07-02) — proveCatch both directions for each of the three rules.
    # (i1) an ACTUATED valve prices from the assembly family, never the bare-valve band:
    _av = _actuated_valve_assembly_price("Pneumatic Actuated Valves")
    if not (_av and abs(_av[0] - (80.0 + 1.85 * 65.0)) < 0.01 and "actuated-valve assembly" in _av[1]):
        print(f"  FAIL actuated-valve DN65 default not ~£200 with assembly basis (got {_av})"); bad += 1
    _av100 = _actuated_valve_assembly_price("Actuated Butterfly Valve DN100")
    if not (_av100 and abs(_av100[0] - (80.0 + 1.85 * 100.0)) < 0.01 and "DN100" in _av100[1]):
        print(f"  FAIL actuated-valve DN100 scaling (want £265, got {_av100})"); bad += 1
    _av25in = _actuated_valve_assembly_price("Electrically Operated Ball Valve", '2.5" ebb/flow')
    if not (_av25in and abs(_av25in[0] - (80.0 + 1.85 * 62.5)) < 0.01):
        print(f"  FAIL actuated-valve 2.5-inch → DN62.5 scaling (got {_av25in})"); bad += 1
    if _actuated_valve_assembly_price("Automated Ball Valves") is None:
        print("  FAIL 'Automated Ball Valves' should match the assembly family"); bad += 1
    for _nm in ("Manual Isolation Valves", "Check Valve", "Solenoid Valve",
                "Pressure Relief Valve", "Flow Control Valves", "Backwash / Service Valve Nest"):
        if _actuated_valve_assembly_price(_nm) is not None:
            print(f"  FAIL non-actuated valve {_nm!r} wrongly matched the assembly family"); bad += 1
    # (i2) a bare pneumatic actuator clamps into the £30–40 COMPONENT band (the £329
    # corpus-lift over-bill), and the corpus lift never fires on it; a motorised/electric
    # actuator is a different family and is untouched by the band:
    _pa_hi = _pneumatic_actuator_band("Pneumatic Actuators", 329.0)
    if not (_pa_hi and _pa_hi[0] == 40.0 and "component band" in _pa_hi[1]):
        print(f"  FAIL pneumatic actuator £329 not capped to £40 (got {_pa_hi})"); bad += 1
    _pa_lo = _pneumatic_actuator_band("Pneumatic Valve Actuator", 25.0)
    if not (_pa_lo and _pa_lo[0] == 30.0):
        print(f"  FAIL pneumatic actuator £25 not floored to £30 (got {_pa_lo})"); bad += 1
    if _pneumatic_actuator_band("Pneumatic Actuators", 35.0) is not None:
        print("  FAIL in-band pneumatic actuator wrongly clamped"); bad += 1
    if _pneumatic_actuator_band("Motorised Actuator", 2500.0) is not None:
        print("  FAIL motorised actuator wrongly clamped to the pneumatic band"); bad += 1
    if _pneumatic_actuator_band("Pneumatic Actuated Valves", 25.0) is not None:
        print("  FAIL actuated-valve ASSEMBLY wrongly clamped to the bare-actuator band"); bad += 1
    if _BARE_PNEUMATIC_ACTUATOR_RE.search("Pneumatic Actuators") is None:
        print("  FAIL corpus-lift skip regex misses 'Pneumatic Actuators'"); bad += 1
    # (i3) DOUBLE-REPRESENTATION de-dup: 200 assemblies + 200 bare actuators → the
    # actuator line folds to £0 IN ASSEMBLY; a bare-actuator line with NO assembly (or a
    # larger population than the assemblies) stands alone (proveCatch both directions).
    _rows_fold = [
        {"requirement": "Pneumatic Actuated Valves", "qty": 200, "unit_gbp": 200, "line_gbp": 40000, "basis": "b", "status": "NOT FOUND"},
        {"requirement": "Pneumatic Actuators", "qty": 200, "unit_gbp": 35, "line_gbp": 7000, "basis": "b", "status": "NOT FOUND"},
    ]
    if not (_dedupe_actuator_assembly_rows(_rows_fold) == 1
            and _rows_fold[1]["line_gbp"] == 0 and _rows_fold[1]["status"] == "IN ASSEMBLY"
            and "de-duplicated" in _rows_fold[1]["basis"]
            and _rows_fold[0]["line_gbp"] == 40000):
        print(f"  FAIL actuator de-dup did not fold the duplicate line (got {_rows_fold})"); bad += 1
    _rows_alone = [{"requirement": "Pneumatic Actuators", "qty": 200, "unit_gbp": 35, "line_gbp": 7000, "basis": "b", "status": "NOT FOUND"}]
    if not (_dedupe_actuator_assembly_rows(_rows_alone) == 0 and _rows_alone[0]["line_gbp"] == 7000):
        print("  FAIL standalone actuator line wrongly folded (no assembly present)"); bad += 1
    _rows_more = [
        {"requirement": "Actuated Ball Valves", "qty": 50, "unit_gbp": 200, "line_gbp": 10000, "basis": "b", "status": "NOT FOUND"},
        {"requirement": "Pneumatic Actuators", "qty": 200, "unit_gbp": 35, "line_gbp": 7000, "basis": "b", "status": "NOT FOUND"},
    ]
    if not (_dedupe_actuator_assembly_rows(_rows_more) == 0 and _rows_more[1]["line_gbp"] == 7000):
        print("  FAIL 200 actuators folded into only 50 assemblies (population mismatch)"); bad += 1

    # ── ACTUATED ON/OFF VALVE POPULATION SYNONYM DE-DUP proveCatch (Codema 2026-07-09)
    _pop_rows = [
        {"tag": "X-1", "requirement": "Solenoid Valves", "qty": 200, "unit_gbp": 80,
         "line_gbp": 16000, "basis": "b", "status": "IDENTIFIED"},
        {"tag": "X-2", "requirement": "Pneumatic Actuated Valves", "qty": 200, "unit_gbp": 200,
         "line_gbp": 40000, "basis": "b", "status": "IDENTIFIED"},
        {"tag": "V-1", "requirement": "Solenoid Valve", "qty": 200, "unit_gbp": 80,
         "line_gbp": 16000, "basis": "b", "status": "IDENTIFIED"},
        {"tag": "V-2", "requirement": "Manual Ball Valves", "qty": 200, "unit_gbp": 50,
         "line_gbp": 10000, "basis": "b", "status": "IDENTIFIED"},
    ]
    _pop_folded = _dedupe_actuated_valve_population_rows(_pop_rows)
    if not (_pop_folded == 2
            and _pop_rows[1]["line_gbp"] == 40000  # highest-priced survivor
            and _pop_rows[0]["line_gbp"] == 0 and _pop_rows[0]["status"] == "MERGED·SYNONYM"
            and _pop_rows[2]["line_gbp"] == 0 and _pop_rows[2]["status"] == "MERGED·SYNONYM"
            and _pop_rows[3]["line_gbp"] == 10000):  # manual family untouched
        print(f"  FAIL actuated-pop de-dup (folded={_pop_folded}; "
              f"rows={[(r['requirement'][:28], r['line_gbp'], r['status']) for r in _pop_rows]})")
        bad += 1

    # ── MEMBRANE-FAMILY SYNONYM DE-DUP proveCatch (gate-36 round 2, 2026-07-03, v56b:
    # 'Ultrafiltration Module' £14,505 + 'Uf Module Bank' £14,505 + 'Uf Membrane Bank'
    # £9,100 = three lines for ONE UF stage). Both directions: the UF synonym triplet
    # folds to the area-parametric survivor; UF vs RO (different stage tokens) and
    # elements vs housings (different hardware tokens) NEVER merge.
    if _membrane_distinguishing_tokens("Ultrafiltration Module") != frozenset({"uf"}):
        print("  FAIL 'Ultrafiltration Module' distinguishing tokens ≠ {'uf'}"); bad += 1
    if _membrane_distinguishing_tokens("Uf Membrane Bank") != frozenset({"uf"}):
        print("  FAIL 'Uf Membrane Bank' distinguishing tokens ≠ {'uf'}"); bad += 1
    if _membrane_distinguishing_tokens("Ro Membrane Elements") == _membrane_distinguishing_tokens("Uf Membrane Bank"):
        print("  FAIL RO vs UF must have DIFFERENT distinguishing tokens (never merge stages)"); bad += 1
    if _membrane_distinguishing_tokens("Grp Membrane Housings") == _membrane_distinguishing_tokens("Ro Membrane Elements"):
        print("  FAIL housings vs elements must have DIFFERENT distinguishing tokens"); bad += 1
    _mem_rows = [
        {"tag": "Z-103", "requirement": "Ultrafiltration Module", "qty": 1, "unit_gbp": 14505, "line_gbp": 14505, "basis": "bottom-up parametric", "status": "NOT FOUND"},
        {"tag": "Z-102", "requirement": "Uf Module Bank", "qty": 1, "unit_gbp": 14505, "line_gbp": 14505, "basis": "membrane/filtration-media class — vendor quote TBD", "status": "NOT FOUND"},
        {"tag": "—", "requirement": "Uf Membrane Bank · 364 m² area", "qty": 1, "unit_gbp": 9100, "line_gbp": 9100, "basis": "membrane-area parametric: 364 m² × £25/m²", "status": "NOT FOUND"},
        {"tag": "—", "requirement": "Ro Membrane Elements · 364 m² area", "qty": 1, "unit_gbp": 9100, "line_gbp": 9100, "basis": "membrane-area parametric: 364 m² × £25/m²", "status": "NOT FOUND"},
        {"tag": "—", "requirement": "Grp Membrane Housings · 364 m² area", "qty": 1, "unit_gbp": 11000, "line_gbp": 11000, "basis": "membrane-housing parametric: 364 m² ÷ 37 m²/element", "status": "NOT FOUND"},
    ]
    _mem_folded = _dedupe_membrane_synonym_rows(_mem_rows)
    _uf_live = [r for r in _mem_rows if "uf" in str(r["requirement"]).lower()[:3] or "ultraf" in str(r["requirement"]).lower()]
    if not (_mem_folded == 2
            and _mem_rows[0]["line_gbp"] == 0 and _mem_rows[0]["status"] == "MERGED·SYNONYM"
            and _mem_rows[1]["line_gbp"] == 0 and _mem_rows[1]["status"] == "MERGED·SYNONYM"
            and _mem_rows[2]["line_gbp"] == 9100 and "merged synonym" in _mem_rows[2]["basis"]
            and _mem_rows[3]["line_gbp"] == 9100 and _mem_rows[3]["status"] == "NOT FOUND"
            and _mem_rows[4]["line_gbp"] == 11000 and _mem_rows[4]["status"] == "NOT FOUND"):
        print(f"  FAIL membrane synonym de-dup (folded={_mem_folded}; rows={[(r['requirement'][:24], r['line_gbp'], r['status']) for r in _mem_rows]})"); bad += 1
    # a single membrane line (no synonym) is byte-untouched
    _mem_alone = [{"tag": "—", "requirement": "Ro Membrane Elements · 364 m² area", "qty": 1, "unit_gbp": 9100, "line_gbp": 9100, "basis": "membrane-area parametric", "status": "NOT FOUND"}]
    if not (_dedupe_membrane_synonym_rows(_mem_alone) == 0 and _mem_alone[0]["line_gbp"] == 9100 and "merged" not in _mem_alone[0]["basis"]):
        print("  FAIL standalone membrane line wrongly folded"); bad += 1

    # ── MEMBRANE PIN RULE proveCatch (2026-07-04, round-4 dissection fix 2). A real
    # pinned MPN (structured, non-TBD, NOT priced by Engine B's curve-only small-parts
    # class) must be treated as real; a pinless row, a TBD placeholder, and a
    # structured-looking PN whose price is curve-only (family mismatch) must all be
    # rejected — the caller then keeps today's area-parametric behaviour byte-
    # identically. Both directions.
    if not _membrane_pin_is_real("BW30-400", "w1", {}):
        print("  FAIL membrane-pin: a real structured PN with no curve-only price must be REAL"); bad += 1
    if _membrane_pin_is_real("BW30-400", "w1", {"w1": True}):
        print("  FAIL membrane-pin: a curve-only-priced PN is a family mismatch — must NOT be real"); bad += 1
    if _membrane_pin_is_real("TBD (detailed design)", "w2", {}):
        print("  FAIL membrane-pin: a TBD placeholder must NOT be real"); bad += 1
    if _membrane_pin_is_real("", "w3", {}):
        print("  FAIL membrane-pin: a pinless row must NOT be real"); bad += 1
    if _membrane_pin_is_real("M6", "w4", {}):
        print("  FAIL membrane-pin: a bare fastener-size token must NOT be real"); bad += 1

    # ── (j) v56c LEDGER COLUMN-CONTRACT convergence fixes (2026-07-03) — proveCatch each.
    # (j1) COMMODITY-ELECTRICAL CLASS-TOKEN FLOOR: 'Terminal Blocks' (principal noun
    # 'blocks') must reach the £2 terminal-contact band via its CLASS token — the v56c
    # rows shipped unit £0 because the £0.11 estimate ROUNDED to £0 and last-token-only
    # matching missed the class. Both directions: an in-band price is untouched.
    for _nm, _want_floor, _want_tok in [
            ("Terminal Blocks", 2.0, "terminal"),       # class token, not the last noun
            ("Terminal Block", 2.0, "terminal"),
            ("Cable Gland", 5.0, "gland"),              # gland → moulded/threaded fitting band
            ("DIN Rail", 3.0, "rail"),                  # no class band → generic £3 (£2-8 family)
            ("Compartment Spacers", 3.0, "spacers"),    # generic catch-all
            ("Leveling Feet", 3.0, "feet")]:
        _f2, _n2 = _commodity_zero_floor(_nm)
        if _f2 != _want_floor or _n2 != _want_tok:
            print(f"  FAIL class-token floor {_nm!r}: got (£{_f2}, {_n2!r}) want (£{_want_floor}, {_want_tok!r})"); bad += 1
    # (j2) RENDERS-£0 guard mirror: a 0 < £ < 0.5 estimate (emits unit £0 after round())
    # is floored; a £0.60 estimate (renders £1) and a pack micro-commodity are untouched.
    def _apply_render_zero_floor(name, gbp):
        if gbp <= 0 or (gbp < 0.5 and _pack_micro_band(name or "") is None):
            _cf3, _cn3 = _commodity_zero_floor(name)
            return (_cf3, "floored")
        return (gbp, "untouched")
    if _apply_render_zero_floor("Terminal Blocks", 0.11) != (2.0, "floored"):
        print("  FAIL £0.11 Terminal Blocks (renders £0) not floored to £2"); bad += 1
    if _apply_render_zero_floor("Leveling Feet", 0.11) != (3.0, "floored"):
        print("  FAIL £0.11 Leveling Feet (renders £0) not floored"); bad += 1
    if _apply_render_zero_floor("Trelleborg gasket", 0.6) != (0.6, "untouched"):
        print("  FAIL £0.60 gasket (renders £1) wrongly floored"); bad += 1
    if _apply_render_zero_floor("cell tap wire", 0.3) != (0.3, "untouched"):
        print("  FAIL pack micro-commodity £0.30 tap wire wrongly lifted out of its band"); bad += 1
    # (j3) DE-DUP PARENT LINK: a folded (IN ASSEMBLY / MERGED·SYNONYM) row carries sub_of
    # → the ledger column contract treats it as an apportioned child ('incl. in parent'),
    # never a broken qty×unit≠line row (the v56c Z-102/Z-103/Pneumatic-Actuators fails).
    if not (_rows_fold[1].get("sub_of") == "Pneumatic Actuated Valves"):
        print(f"  FAIL folded actuator line carries no sub_of parent link (got {_rows_fold[1].get('sub_of')!r})"); bad += 1
    if not (_mem_rows[0].get("sub_of") and _mem_rows[1].get("sub_of")):
        print(f"  FAIL merged membrane synonym lines carry no sub_of parent link "
              f"(got {_mem_rows[0].get('sub_of')!r}, {_mem_rows[1].get('sub_of')!r})"); bad += 1
    if _rows_alone[0].get("sub_of") or _mem_alone[0].get("sub_of"):
        print("  FAIL an un-folded line wrongly gained a sub_of link"); bad += 1
    # (j4) STRUCTURAL MATERIAL from the part's own name (X-134/X-135 skid frames shipped
    # material-less): stainless grade read from Sst304/SS316; painted steel defaults.
    for _nm, _want in [("Sst304 Skid Frame · 2.3 m dia x 2.4 m", "304 stainless steel"),
                       ("SS316 Support Frame", "316 stainless steel"),
                       ("Painted Steel Skid Frame · 2.3 m dia x 2.4 m", "painted structural carbon steel (S275/S355)"),
                       ("Galvanised Access Platform", "galvanised steel"),
                       ("Aluminium Gantry", "aluminium alloy")]:
        if _structural_material_from_name(_nm) != _want:
            print(f"  FAIL structural material {_nm!r}: got {_structural_material_from_name(_nm)!r} want {_want!r}"); bad += 1

    # (k) ZONED-DELIVERY PARAMETRIC NETWORK (client section D, 2026-07-03): the sizer's
    # 'parametric — not routed' distribution quantities price as supply-only £/m lines;
    # absent quantities → [] (every non-zoned archetype's bill byte-identical).
    _dq = {
        "distribution_network_length_km": {"value": 1.836, "source": "demand-coverage",
                                           "source_detail": "parametric — not routed: total"},
        "distribution_zone_lateral_length_m": {"value": 120, "source": "demand-coverage",
                                               "source_detail": "parametric — not routed: 200 zones × 0.6 m"},
        "distribution_zone_lateral_dn_mm": {"value": 75},
        "distribution_drain_riser_length_m": {"value": 700},
        "distribution_drain_riser_dn_mm": {"value": 110},
        "distribution_position_connections": {"value": 200, "source_detail": "parametric — one shared-tray inlet per zone"},
        "distribution_zone_kits": {"value": 200},
    }
    _drows = _distribution_network_rows(_dq)
    if len(_drows) != 4:
        print(f"  FAIL distribution rows: want 4 (2 segments + inlets + zone kits), got {len(_drows)}"); bad += 1
    if any("hand" in str(r["requirement"]).lower() for r in _drows):
        print("  FAIL hand-watering rows minted WITHOUT the rule-8b quantities (must be a no-op)"); bad += 1
    if len(_drows) == 4:
        _lat = next((r for r in _drows if "zone laterals" in r["requirement"]), None)
        _want_lat = round(120 * _pvc_supply_rate_per_m(75))
        if not _lat or _lat["line_gbp"] != _want_lat:
            print(f"  FAIL lateral line £{_lat and _lat['line_gbp']} want £{_want_lat} "
                  f"(120 m × £{_pvc_supply_rate_per_m(75)}/m supply share)"); bad += 1
        # LENGTH-PRICED shape (gate-36 round 3): qty = run length in metres, unit = the £/m
        # rate, uom = 'm' — never qty 1 × the whole run's cost (the "single DN75 assembly
        # ~200× too high" misread). The line total must be UNCHANGED by the reshape.
        if _lat and (_lat["qty"] != 120 or _lat["unit_gbp"] != _pvc_supply_rate_per_m(75)
                     or _lat.get("uom") != "m"):
            print(f"  FAIL lateral row must be length-priced (qty 120 m × £{_pvc_supply_rate_per_m(75)}/m, "
                  f"uom 'm'); got qty {_lat['qty']} × £{_lat['unit_gbp']}, uom {_lat.get('uom')!r}"); bad += 1
        if _lat and abs(_lat["unit_gbp"] * _lat["qty"] - _lat["line_gbp"]) > max(1.0, 0.005 * _lat["line_gbp"]):
            print("  FAIL lateral unit × qty must equal the line total within the C2 tolerance"); bad += 1
        if _lat and "length-priced" not in _lat["basis"]:
            print("  FAIL lateral basis must state the length-priced scope (qty = metres)"); bad += 1
        if _lat and "parametric" not in _lat["basis"]:
            print("  FAIL lateral basis must state the parametric provenance"); bad += 1
        if _lat and "supply" not in _lat["basis"].lower():
            print("  FAIL lateral basis must state the supply-only share (no install double-count)"); bad += 1
        _ink = next((r for r in _drows if "inlet stubs" in r["requirement"]), None)
        if not _ink or _ink["line_gbp"] != 200 * round(_DIST_INLET_STUB_GBP):
            print(f"  FAIL inlet-stub allowance £{_ink and _ink['line_gbp']} want £{200 * round(_DIST_INLET_STUB_GBP)}"); bad += 1
        if any(r["status"] != "PARAMETRIC" for r in _drows):
            print("  FAIL every distribution row must carry the PARAMETRIC status (not ROUTED — it is NOT per-pipe routed)"); bad += 1
        if any("TBD" in str(r.get("part", "")) for r in _drows):
            print("  FAIL distribution rows must not add TBD parts (HOLD-002 must not inflate)"); bad += 1
        if any(r.get("tag") != "—" for r in _drows):
            print("  FAIL distribution rows must stay untagged ('—') — a new PD- prefix family "
                  "would be an undocumented Glossary abbreviation"); bad += 1
    if _distribution_network_rows({}) != []:
        print("  FAIL distribution rows must be [] with no zoned-delivery quantities (BESS/SAF/CO2/RAS byte-identity)"); bad += 1
    if _distribution_network_rows({"connected_electrical_load_kw": {"value": 53}}) != []:
        print("  FAIL distribution rows must ignore unrelated quantities"); bad += 1

    # ── (k2) RULE-8b HAND-WATERING RING MAIN PRICING (client section E, 2026-07-03) —
    # proveCatch: the sizer's hand_watering_ring_main_* quantities price as ONE length-priced
    # DN90 segment (same supply-only £/m model as the section-D segments) + ONE per-station
    # allowance, with EXACT conservation (length × rate + count × allowance), a 'client
    # section E scope' basis on both, and a strict no-op when absent (proven above: the
    # _dq run without the keys mints no hand-watering row; {} → []).
    _dqh = dict(_dq)
    _dqh.update({
        "hand_watering_ring_main_length_m": {
            "value": 428, "source": "demand-coverage",
            "source_detail": "parametric — not routed: 2 delivery group(s) × 2 legs × 107 m spine"},
        "hand_watering_ring_main_dn_mm": {"value": 90},
        "hand_watering_riser_count": {
            "value": 44, "source": "demand-coverage",
            "source_detail": "parametric — not routed: 2/branch × 20 branches + 2/group = 44"},
    })
    _hrows = _distribution_network_rows(_dqh)
    if len(_hrows) != 6:
        print(f"  FAIL hand-watering pricing: want 6 rows (3 segments + inlets + kits + stations), got {len(_hrows)}"); bad += 1
    else:
        _ring = next((r for r in _hrows if "ring main" in r["requirement"].lower()), None)
        _stat = next((r for r in _hrows if "tap/hose stations" in r["requirement"]), None)
        _hw_rate = _pvc_supply_rate_per_m(90)
        if not _ring or _ring["line_gbp"] != round(428 * _hw_rate):
            print(f"  FAIL ring-main line £{_ring and _ring['line_gbp']} want £{round(428 * _hw_rate)} "
                  f"(428 m × £{_hw_rate}/m DN90 supply share)"); bad += 1
        if _ring and (_ring["qty"] != 428 or _ring["unit_gbp"] != _hw_rate or _ring.get("uom") != "m"
                      or _ring.get("size") != "DN90"):
            print(f"  FAIL ring-main row must be length-priced (qty 428 m × £{_hw_rate}/m, uom 'm', DN90); "
                  f"got qty {_ring['qty']} × £{_ring['unit_gbp']}, uom {_ring.get('uom')!r}, size {_ring.get('size')!r}"); bad += 1
        if not _stat or _stat["line_gbp"] != 44 * round(_HAND_WATERING_STATION_GBP):
            print(f"  FAIL tap-station allowance £{_stat and _stat['line_gbp']} want £{44 * round(_HAND_WATERING_STATION_GBP)}"); bad += 1
        if _stat and (_stat["qty"] != 44 or _stat["unit_gbp"] != round(_HAND_WATERING_STATION_GBP)):
            print(f"  FAIL tap-station row shape: got qty {_stat['qty']} × £{_stat['unit_gbp']} "
                  f"want 44 × £{round(_HAND_WATERING_STATION_GBP)}"); bad += 1
        # EXACT conservation of the section-E addition: length × rate + count × allowance
        _e_add = sum(r["line_gbp"] for r in _hrows) - sum(r["line_gbp"] for r in _drows)
        _e_want = round(428 * _hw_rate) + 44 * round(_HAND_WATERING_STATION_GBP)
        if _e_add != _e_want:
            print(f"  FAIL section-E conservation: added £{_e_add} want £{_e_want} "
                  f"(428 m × £{_hw_rate}/m + 44 × £{_HAND_WATERING_STATION_GBP:g})"); bad += 1
        for _hr in (_ring, _stat):
            if _hr and "parametric estimate — client section E scope" not in _hr["basis"]:
                print(f"  FAIL {_hr['requirement'][:40]!r} basis must state the 'client section E scope' provenance"); bad += 1
            if _hr and _hr["status"] != "PARAMETRIC":
                print(f"  FAIL {_hr['requirement'][:40]!r} must carry PARAMETRIC status"); bad += 1
        if _ring and "supply" not in _ring["basis"].lower():
            print("  FAIL ring-main basis must state the supply-only share (no install double-count)"); bad += 1
        if _stat and "allowance" not in _stat["basis"]:
            print("  FAIL tap-station basis must state the per-station allowance breakdown"); bad += 1
        # the section-D rows are UNTOUCHED by the hand-watering keys (same 4 rows, same £)
        if [r for r in _hrows if "hand" not in r["requirement"].lower()] != _drows:
            print("  FAIL section-D distribution rows changed when the hand-watering keys appeared"); bad += 1

    # (l) DEMAND-SIZED DUTY PROVENANCE (gate-36 round 3, 2026-07-03): a row whose m³/h duty
    # equals a contract *_demand_* flow gets the demand derivation stamped on its basis (so
    # the benchmark fault-router can defend "90 m³/h pump on 45 m³/h design flow"); a
    # per-share row (45), a non-flow row (kW), and a demand key without a derivation never
    # stamp — and a second pass is idempotent. BESS/SAF byte-identity rides on the miss cases.
    _dsr = [
        {"status": "PRINCIPAL", "requirement": "Irrigation Pump · 90 m³/h · 1379x766x1073 mm", "basis": "catalogue"},
        {"status": "PRINCIPAL", "requirement": "Fertigation Dosing Pump · 45 m³/h", "basis": "catalogue"},
        {"status": "PRINCIPAL", "requirement": "Battery Rack · 250 kWh", "basis": "catalogue"},
        {"status": "SUB-COMPONENT", "requirement": "Impeller · 90 m³/h", "basis": "catalogue"},
    ]
    _dsq = {
        "irrigation_demand_m3_h": {"value": 90, "unit": "m³/h",
                                   "source_detail": "peak irrigation demand = 45 m³/h per department × 2 departments; lock-gate HARD slot (exit 22)"},
        "power_demand_kw": {"value": 53, "unit": "kW", "source_detail": "26.5 kW × 2 boards"},
        "bare_demand_m3_h": {"value": 45, "unit": "m3/h", "source_detail": ""},
    }
    _n1 = _apply_demand_sized_basis(_dsr, _dsq)
    if _n1 != 1 or "demand-sized: peak irrigation demand = 45 m³/h per department × 2 departments" not in _dsr[0]["basis"]:
        print(f"  FAIL demand-sized stamp: want exactly the 90 m³/h principal stamped with the ';'-clean "
              f"derivation, got n={_n1}, basis={_dsr[0]['basis']!r}"); bad += 1
    if "lock-gate" in _dsr[0]["basis"]:
        print("  FAIL demand-sized stamp must strip the '; lock-gate …' tail"); bad += 1
    if any("demand-sized" in r["basis"] for r in _dsr[1:]):
        print("  FAIL demand-sized must not stamp per-share (45), non-flow (kW) or SUB-COMPONENT rows"); bad += 1
    if _apply_demand_sized_basis(_dsr, _dsq) != 0:
        print("  FAIL demand-sized stamp must be idempotent"); bad += 1
    if _apply_demand_sized_basis([dict(_dsr[0], basis="catalogue")], {"nameplate_capacity_kwh": {"value": 2912, "unit": "kWh", "source_detail": "16 racks × 182 kWh"}}) != 0:
        print("  FAIL demand-sized must ignore non-demand and non-flow quantities (BESS byte-identity)"); bad += 1

    # (m) CATALOGUE-ADOPTED SUB-COMPONENT PIN (cascade-price-adoption, 2026-07-03): a child
    # whose price_basis modifier is a distributor-catalogue quote renders its OWN price +
    # basis (pinned); every non-adopted child returns None — BESS/SAF byte-identity rides
    # on the None path.
    _cat_hit = _catalogue_pinned_child(
        {"price_basis": "distributor catalogue (db:mouser £45.68) — supersedes parametric estimate £420.00"}, 45.68)
    if _cat_hit != (46, "distributor catalogue (db:mouser £45.68) — supersedes parametric estimate £420.00"):
        print(f"  FAIL catalogue-pinned child must render its own price + basis, got {_cat_hit!r}"); bad += 1
    if _catalogue_pinned_child({"price_basis": "physics-sized"}, 45.68) is not None:
        print("  FAIL non-catalogue price_basis must not pin (byte-identity)"); bad += 1
    if _catalogue_pinned_child({}, 45.68) is not None:
        print("  FAIL missing price_basis must not pin (byte-identity)"); bad += 1
    if _catalogue_pinned_child({"price_basis": "distributor catalogue (db:mouser £45.68)"}, 0) is not None:
        print("  FAIL a £0 child never pins (catalogue price must be plausible)"); bad += 1

    # (n) TYPE-COHERENT CATALOGUE-PIN REFUSAL (codema v65 I-106, 2026-07-03): a
    # tank/vessel-headed word priced ONLY by Engine B's small-parts commodity
    # curve (no ComponentClass exists for a bespoke fabricated shell) must be
    # refused at FIELD-FABRICATION scale (proveCatch — the v65 shape: a 1.2x1.3 m
    # Softener Vessel hallucinated-pinned to a £66 'structural_polymer' curve
    # guess) — AND a genuine SMALL vessel (mass-manufactured catalogue scale, e.g.
    # a 50 L Reflex expansion tank) must KEEP its real catalogue price unrefused
    # (a cheap vessel accessory never gets bulldozed into a bespoke-fabrication
    # over-price). Both directions on the SAME head-noun family + curve-only
    # provenance signal — only the implied volume differs.
    if not _is_bespoke_shell_head_noun("Softener Vessel"):
        print("  FAIL head-noun gate must accept 'Softener Vessel'"); bad += 1
    if _is_bespoke_shell_head_noun("Rack DC Isolator Enclosure"):
        print("  FAIL head-noun gate must reject 'Enclosure' (small-parts scale, "
              "loose substring landmine — 'duct' inside 'inductor' etc.)"); bad += 1
    if _is_bespoke_shell_head_noun("PCS LCL Output Filter Inductor"):
        print("  FAIL head-noun gate must not fire on 'inductor' ('duct' substring)"); bad += 1
    _v_big = _bespoke_shell_vol_m3((1.2, 1.3), {})       # codema V-106 AS-BUILT geometry
    if not (_v_big and _v_big >= _MIN_BESPOKE_SHELL_VOL_M3):
        print(f"  FAIL field-fabrication-scale vessel must clear the volume floor, got {_v_big!r}"); bad += 1
    _v_small = _bespoke_shell_vol_m3(None, {"capacity": "50", "capacity_unit": "L"})  # BESS expansion tank
    if not (_v_small is not None and _v_small < _MIN_BESPOKE_SHELL_VOL_M3):
        print(f"  FAIL a 50 L catalogue-scale vessel must stay BELOW the volume floor, got {_v_small!r}"); bad += 1
    if abs((_v_small or 0) - 0.05) > 1e-9:
        print(f"  FAIL 50 L must convert to 0.05 m3 (unit-family guard), got {_v_small!r}"); bad += 1

    # ═══ proveCatch the VALVE SPEC STAMPING follow-on (2026-07-04, routed follow-on
    # #1). Claims: (a) `_engine_refused_process_valve` mirrors the excel scorer's
    # `_commodity_process_valve` vocabulary exactly (manual/isolation/check/ball/
    # sample refused, actuated never); (b) a valve row naming EXACTLY ONE piece of
    # connection-schedule equipment stamps that equipment's LARGEST-bore DN + a
    # provenance note, and a stated rating token when the schedule carries one;
    # (c) a valve naming ZERO or TWO-OR-MORE equipment items NEVER stamps (honest
    # absent — zero silently, two-or-more with an ambiguity note); (d) an
    # already-sized row is never overwritten. ═══
    if not _engine_refused_process_valve("Manual Ball Valve") or \
       not _engine_refused_process_valve("Sample Valves") or \
       not _engine_refused_process_valve("Isolation Valves"):
        print("  FAIL valve-stamping: manual/sample/isolation valves must be engine-refused"); bad += 1
    for _av in ("Pneumatic Actuated Valves", "Solenoid Valve", "Pressure Relief Valve"):
        if _engine_refused_process_valve(_av):
            print(f"  FAIL valve-stamping: {_av!r} must stay ENGINEERED (actuation never refused)"); bad += 1
    _cs_rows = [
        {"from": "Softener Vessel", "to": "Gac Softener", "size": "DN65", "outer_dia_mm": 73.0,
         "rating": "14.5 m3/h"},
        {"from": "Softener Vessel", "to": "Drain Collection Sump", "size": "DN25", "outer_dia_mm": 30.0,
         "rating": "2 m3/h"},
        {"from": "Ro High Pressure Pump", "to": "Reverse Osmosis Skid", "size": "DN50", "outer_dia_mm": 60.0,
         "rating": "PN16"},
    ]
    if _named_equipment_candidates("Manual Isolation Valve on the Softener Vessel", _cs_rows) != {"Softener Vessel"}:
        print("  FAIL valve-stamping: naming ONE equipment item must yield exactly that candidate"); bad += 1
    if _named_equipment_candidates("Manual Ball Valve", _cs_rows):
        print("  FAIL valve-stamping: naming NO equipment must yield zero candidates"); bad += 1
    if _named_equipment_candidates("Valve between the Softener Vessel and the Ro High Pressure Pump", _cs_rows) \
            != {"Softener Vessel", "Ro High Pressure Pump"}:
        print("  FAIL valve-stamping: naming TWO equipment items must yield both candidates"); bad += 1
    if _dn_for_named_equipment("Softener Vessel", _cs_rows) != "DN65":
        print(f"  FAIL valve-stamping: the LARGEST-bore connection must win, got "
              f"{_dn_for_named_equipment('Softener Vessel', _cs_rows)!r}"); bad += 1
    if _rating_for_named_equipment("Ro High Pressure Pump", _cs_rows) != "PN16":
        print("  FAIL valve-stamping: a STATED pressure-class token must be read back"); bad += 1
    if _rating_for_named_equipment("Softener Vessel", _cs_rows):
        print("  FAIL valve-stamping: no pressure class stated must stay honest absent (never a default)"); bad += 1
    _vs_rows = [
        {"tag": "V-1", "requirement": "Manual Isolation Valve on the Softener Vessel",
         "part": "requirement stated", "basis": "bottom-up parametric", "qty": 1, "unit_gbp": 95, "line_gbp": 95},
        {"tag": "V-2", "requirement": "Manual Ball Valve", "part": "requirement stated",
         "basis": "bottom-up parametric", "qty": 1, "unit_gbp": 9, "line_gbp": 9},
        {"tag": "V-3", "requirement": "Manual Isolation Valve between the Softener Vessel and the Ro High Pressure Pump",
         "part": "requirement stated", "basis": "bottom-up parametric", "qty": 1, "unit_gbp": 9, "line_gbp": 9},
        {"tag": "V-4", "requirement": "Manual Isolation Valve on the Softener Vessel",
         "part": "requirement stated", "basis": "bottom-up parametric", "size": "DN300",
         "qty": 1, "unit_gbp": 9, "line_gbp": 9},
    ]
    import copy as _copy
    _stamped = _apply_valve_stamping(_copy.deepcopy(_vs_rows), _cs_rows)
    _by_tag = {r["tag"]: r for r in _stamped}
    if _by_tag["V-1"].get("size") != "DN65" or "derived from connection schedule (line Softener Vessel)" \
            not in _by_tag["V-1"].get("basis", ""):
        print(f"  FAIL valve-stamping: an unambiguous single-equipment valve must stamp its DN "
              f"+ provenance, got {_by_tag['V-1']!r}"); bad += 1
    if _by_tag["V-2"].get("size"):
        print(f"  FAIL valve-stamping: a valve naming NO equipment must NEVER stamp a DN, "
              f"got {_by_tag['V-2']!r}"); bad += 1
    if _by_tag["V-3"].get("size") or "ambiguous join" not in _by_tag["V-3"].get("basis", ""):
        print(f"  FAIL valve-stamping: a valve naming TWO equipment items must stay unstamped "
              f"+ carry an ambiguity note, got {_by_tag['V-3']!r}"); bad += 1
    if _by_tag["V-4"].get("size") != "DN300":
        print(f"  FAIL valve-stamping: an ALREADY-sized row must never be overwritten, "
              f"got {_by_tag['V-4']!r}"); bad += 1

    # ═══ proveCatch the OEM-PROPRIETARY FINDING RECORDING follow-on (2026-07-04,
    # routed follow-on #2). Claims: (a) a row whose requirement matches a recorded
    # finding's names gets the finding's basis text appended; (b) a row matching NO
    # finding is left untouched; (c) applying the same findings twice is idempotent
    # (no duplicated basis text). ═══
    _findings = [(["Veolia Ro40 Controller"],
                  "OEM-proprietary — no public MPN (verified 2026-07-04: Veolia Water "
                  "Technologies RO40 datasheets + distributor catalogues checked)")]
    _oem_rows = [
        {"tag": "X-1", "requirement": "Veolia Ro40 Controller", "basis": "bottom-up parametric"},
        {"tag": "X-2", "requirement": "Dc3 Power Controller", "basis": "bottom-up parametric"},
    ]
    _oem_stamped = _apply_oem_findings(_copy.deepcopy(_oem_rows), _findings)
    _oem_by_tag = {r["tag"]: r for r in _oem_stamped}
    if "OEM-proprietary — no public MPN" not in _oem_by_tag["X-1"].get("basis", ""):
        print(f"  FAIL oem-finding: a row matching a recorded finding must have its basis "
              f"stamped, got {_oem_by_tag['X-1']!r}"); bad += 1
    if _oem_by_tag["X-2"].get("basis") != "bottom-up parametric":
        print(f"  FAIL oem-finding: a row matching NO finding must be left untouched, "
              f"got {_oem_by_tag['X-2']!r}"); bad += 1
    _oem_twice = _apply_oem_findings(_apply_oem_findings(_copy.deepcopy(_oem_rows), _findings), _findings)
    if _oem_twice[0]["basis"].count("OEM-proprietary — no public MPN") != 1:
        print(f"  FAIL oem-finding: applying findings twice must be idempotent (no duplicate "
              f"stamp), got {_oem_twice[0]['basis']!r}"); bad += 1

    # ═══ proveCatch the CROSS-CLASS OEM-FINDING LEAK FIX (2026-07-06, the CO2-
    # mineralisation ingest round's own SAF-v21 replay regression: a CO2-tagged
    # 'cooling-water skid' no-public-MPN finding (S&S Technical's bespoke PCW skid)
    # silently stamped onto SAF's OWN, UNRELATED 'cooling-water skid · 1200 kW'
    # line the moment the CO2 ingest committed to forge-truth.db — the finding
    # table was never filtered by class_tag. End-to-end via the real assemble()
    # path + a real temp sqlite DB (FORGE_TRUTH_DB_PATH_OVERRIDE): two findings
    # share the IDENTICAL part_name_match text but carry DIFFERENT class_tag;
    # a run whose own orchestratorContract.product_class is class A must stamp
    # ONLY class A's finding, never class B's (and vice versa). ═══
    import sqlite3 as _sqlite3_selftest
    with _fs_tf.TemporaryDirectory() as _oem_db_dir:
        _oem_db_path = os.path.join(_oem_db_dir, "forge-truth-oem-selftest.db")
        _con = _sqlite3_selftest.connect(_oem_db_path)
        _con.execute("""CREATE TABLE verified_no_public_mpn_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT, class_tag TEXT NOT NULL,
            manufacturer TEXT NOT NULL, family TEXT NOT NULL, part_name_match TEXT NOT NULL,
            evidence_urls TEXT NOT NULL, verified_date TEXT NOT NULL, note TEXT,
            basis_text TEXT NOT NULL, discovery_source TEXT NOT NULL, created_at TEXT NOT NULL)""")
        _con.execute(
            "INSERT INTO verified_no_public_mpn_findings (class_tag, manufacturer, family, "
            "part_name_match, evidence_urls, verified_date, basis_text, discovery_source, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("co2_mineralisation", "S&S Technical, Inc.", "PCW skid", '["cooling-water skid"]',
             "[]", "2026-07-06", "OEM-proprietary — no public MPN (CO2 finding)", "test", "2026-07-06"))
        _con.execute(
            "INSERT INTO verified_no_public_mpn_findings (class_tag, manufacturer, family, "
            "part_name_match, evidence_urls, verified_date, basis_text, discovery_source, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("e_fuel_synthesis", "Some SAF Vendor", "SAF cooling skid", '["cooling-water skid"]',
             "[]", "2026-07-06", "OEM-proprietary — no public MPN (SAF finding)", "test", "2026-07-06"))
        _con.commit(); _con.close()
        _oem_words = [{"id": "cooling_water_skid_word", "name_human": "cooling-water skid",
                       "modifier_characters": [{"kind": "quantity", "value": "×1"}]}]
        _real_forge_truth_db = _FORGE_TRUTH_DB
        for _class, _want_substr, _reject_substr in (
            ("co2_mineralisation", "CO2 finding", "SAF finding"),
            ("e_fuel_synthesis", "SAF finding", "CO2 finding"),
        ):
            with _fs_tf.TemporaryDirectory() as _oem_run_dir:
                json.dump({
                    "moduleDecomposition": {"product_class": _class, "modules": [{"sub_modules": [{"words": _oem_words}]}]},
                    "orchestratorContract": {"product_class": _class},
                    "partVerifications": [],
                }, open(os.path.join(_oem_run_dir, "state.json"), "w"))
                # `_FORGE_TRUTH_DB` is bound once at module import from the env var — a
                # bare os.environ[...] set here would NOT retroactively change it within
                # this same process, so the module GLOBAL is monkey-patched directly
                # (the exact value the real CLI path gets via the env var at import time).
                _FORGE_TRUTH_DB = _oem_db_path
                _NO_PUBLIC_MPN_CACHE.clear()
                try:
                    _oem_class_rows = assemble(_oem_run_dir)
                finally:
                    _FORGE_TRUTH_DB = _real_forge_truth_db
                    _NO_PUBLIC_MPN_CACHE.clear()
            _oem_skid = next((r for r in _oem_class_rows if r["requirement"].split(" · ")[0] == "cooling-water skid"), None)
            if not _oem_skid or _want_substr not in _oem_skid.get("basis", ""):
                print(f"  FAIL cross-class oem-finding leak fix: class {_class!r} must stamp its OWN "
                      f"finding ({_want_substr!r}), got {_oem_skid and _oem_skid.get('basis')!r}"); bad += 1
            if _oem_skid and _reject_substr in _oem_skid.get("basis", ""):
                print(f"  FAIL cross-class oem-finding leak fix (REGRESSION): class {_class!r} stamped "
                      f"the OTHER class's finding ({_reject_substr!r}) — basis={_oem_skid.get('basis')!r}"); bad += 1

    # ═══ proveCatch the CROSS-MODULE WORD-ID COLLISION GUARD (2026-07-06, the
    # co2-mineralisation round-2 X-117/119/120 regression: Part-names 8.4 → 0). A word
    # id authored in ONE module (name_human + content_character, a real price) also
    # appears as a BARE stub (no name_human, just modifier_characters incl. a mis-matched
    # manufacturer/part_number) in a DIFFERENT module. Claims: (a) the bare stub emits NO
    # row at all — never a blank-requirement ledger tag the Part-names master can't
    # collect; (b) the authored twin still emits its own correct, unaffected row; (c) a
    # bare word whose id is NOT authored anywhere else is untouched (stays the honest
    # 'NOT FOUND — requirement stated' gap, never over-suppressed). ═══
    import tempfile as _tempfile
    with _tempfile.TemporaryDirectory() as _pc_dir:
        _pc_state = {
            "moduleDecomposition": {"modules": [
                {"module": "energy_conversion_transduction", "sub_modules": [
                    {"words": [
                        # bare cross-module duplicate of k2so4_recrystalliser_word,
                        # mistakenly attached to a DIFFERENT module — no name_human/
                        # content_character, wearing an unrelated (wrong-class) MPN.
                        {"id": "k2so4_recrystalliser_word", "modifier_characters": [
                            {"kind": "manufacturer", "value": "Alps Alpine"},
                            {"kind": "part_number", "value": "AFT14A903A"}]},
                        # a genuinely orphaned bare word — no authored twin anywhere —
                        # must NOT be suppressed by this guard.
                        {"id": "truly_unauthored_word", "modifier_characters": [
                            {"kind": "list_price_gbp", "value": "500"}]},
                    ]},
                ]},
                {"module": "energy_conversion_transduction", "sub_modules": [
                    {"words": [
                        {"id": "k2so4_recrystalliser_word", "name_human": "K2SO4 recrystalliser",
                         "content_character": {"character_id": "k2so4_recrystalliser",
                                                "name_human": "K2SO4 forced-circulation recrystalliser"},
                         "modifier_characters": [
                             {"kind": "manufacturer", "value": "GEA Messo"},
                             {"kind": "list_price_gbp", "value": "21000"}]},
                    ]},
                ]},
            ]},
        }
        json.dump(_pc_state, open(os.path.join(_pc_dir, "state.json"), "w"))
        _pc_rows = assemble(_pc_dir)
        _pc_by_part = [r for r in _pc_rows if "Alps Alpine" in str(r.get("part") or "")
                       or "AFT14A903A" in str(r.get("basis") or "")]
        if _pc_by_part:
            print(f"  FAIL word-id-collision guard: the bare cross-module duplicate must emit "
                  f"NO row (no Alps Alpine identity anywhere in the output), got {_pc_by_part!r}"); bad += 1
        _pc_real = [r for r in _pc_rows if r.get("requirement") == "K2SO4 recrystalliser"]
        if len(_pc_real) != 1:
            print(f"  FAIL word-id-collision guard: the authored twin must still emit exactly "
                  f"its own row, got {_pc_real!r}"); bad += 1
        # exactly 2 rows: the authored twin + the genuinely-orphaned bare word (no
        # authored twin anywhere) — proving the guard is narrow (excludes ONLY the
        # phantom duplicate) rather than over-reaching onto every bare word.
        if len(_pc_rows) != 2:
            print(f"  FAIL word-id-collision guard: expected exactly 2 rows (the authored twin "
                  f"+ the genuine orphan; the phantom duplicate excluded), got {len(_pc_rows)}: "
                  f"{_pc_rows!r}"); bad += 1

    # ═══ proveCatch/proveNoFalsePositive the UNDERGROUND-ELEMENT CIVILS DERIVATION
    # (Sam Green SME review 2026-07-07 — "drain pits suggest a lot of underground
    # civils work but previous pages suggest almost no civils cost"). ═══
    # (a) proveCatch: a design with a real below-grade drain-collection sump (the
    # Codema fixture, 5 m³ each × 2 rooms) must get a DERIVED, non-trivial civils line
    # — not the ~£4k disconnected placeholder Sam flagged.
    _ug_rows = [
        {"tag": "T-1", "requirement": "Drain Collection Sump · 5 m³", "status": "SYSTEM",
         "part": "requirement stated", "qty": 2, "unit_gbp": 3200, "line_gbp": 6400,
         "basis": "bespoke shell take-off"},
        # a legitimate clean-side principal — must NEVER get a civils line:
        {"tag": "T-2", "requirement": "Fresh Water Tank · 40 m³", "status": "SYSTEM",
         "part": "requirement stated", "qty": 1, "unit_gbp": 18000, "line_gbp": 18000,
         "basis": "bespoke shell take-off"},
    ]
    _ug_civils = civils_rows_from_underground_scope(_ug_rows)
    if len(_ug_civils) != 1:
        print(f"  FAIL civils-derivation proveCatch: expected exactly 1 civils line for the "
              f"1 underground row (Fresh Water Tank must NOT get one), got {len(_ug_civils)}: "
              f"{_ug_civils!r}"); bad += 1
    else:
        _civ = _ug_civils[0]
        if _civ["status"] != "CIVILS" or _civ["qty"] != 2:
            print(f"  FAIL civils-derivation proveCatch: expected a CIVILS row at qty=2 "
                  f"(matches the sump's own qty), got {_civ!r}"); bad += 1
        if not (500 <= _civ["unit_gbp"] <= 5000):
            print(f"  FAIL civils-derivation proveCatch: unit civils cost £{_civ['unit_gbp']} "
                  f"for a 5 m³ drain pit is outside a sane Class-4 parametric band "
                  f"(£500-£5,000) — {_civ!r}"); bad += 1
        if _civ["line_gbp"] < 4000:
            # this is the exact defect Sam flagged: "almost no civils cost" (~£4k on a
            # design covered in drain pits) — the DERIVED line must clear that floor.
            print(f"  FAIL civils-derivation proveCatch: total civils £{_civ['line_gbp']} for "
                  f"2 drain pits reads as the SAME disconnected ~£4k placeholder Sam flagged "
                  f"— {_civ!r}"); bad += 1
    # (b) proveNoFalsePositive #1: an all-above-ground design (no underground-signal row
    # at all) must get NO civils line — never fabricated.
    _ag_rows = [
        {"tag": "T-3", "requirement": "Fresh Water Tank · 40 m³", "status": "SYSTEM",
         "part": "requirement stated", "qty": 1, "unit_gbp": 18000, "line_gbp": 18000,
         "basis": "bespoke shell take-off"},
        {"tag": "T-4", "requirement": "Softener Vessel · 1.5 m³", "status": "SYSTEM",
         "part": "requirement stated", "qty": 2, "unit_gbp": 4200, "line_gbp": 8400,
         "basis": "bespoke shell take-off"},
    ]
    if civils_rows_from_underground_scope(_ag_rows):
        print(f"  FAIL civils-derivation proveNoFalsePositive: an all-above-ground design "
              f"must get NO civils line, got {civils_rows_from_underground_scope(_ag_rows)!r}"); bad += 1
    # (b) proveNoFalsePositive #2: a bare 'Coolant Sump' (drainage-role-free chamber noun,
    # e.g. a CNC machine's skid-mounted drip tray) must NOT be read as below-grade.
    if _is_underground_element("Coolant Sump · 0.2 m³"):
        print("  FAIL civils-derivation proveNoFalsePositive: a bare 'Coolant Sump' (no "
              "drainage-role qualifier) must not read as a below-grade element"); bad += 1
    # (b) proveNoFalsePositive #3: the CIVILS row ITSELF (status='CIVILS') is excluded
    # from re-scanning — running the pass over its own prior output never compounds.
    _once = civils_rows_from_underground_scope(_ug_rows)
    if civils_rows_from_underground_scope(_once):
        print("  FAIL civils-derivation: a CIVILS row must never be re-scanned as its own "
              "underground signal (would compound the cost on re-entry)"); bad += 1

    # (c) proveCatch — REAL SIZE-TEXT FORMAT (2026-07-08 follow-up): the fixture above
    # used an explicit 'N m³' figure, but every FABRICATED-VESSEL row this module itself
    # emits (Softener Vessel, Drain Collection Sump, Fresh Water Tank...) records size as
    # '<dia> m dia x <h> m' — see `_cyl_from_dim` / the SIZE-line assembly — NEVER as an
    # 'm³' figure. The real out/codema-sam-verify/state.json reads exactly
    # "Drain Collection Sump · 2.1 m dia x 1.4 m" (qty 2) and got ZERO civils lines before
    # `_row_underground_volume_m3` added the cylinder-from-dim fallback. This fixture
    # proves the fix on the REAL text shape, not just the m³ one.
    _ug_dim_rows = [
        {"tag": "T-5", "requirement": "Drain Collection Sump · 2.1 m dia x 1.4 m", "status": "BESPOKE",
         "part": "made to spec", "qty": 2, "unit_gbp": 3200, "line_gbp": 6400,
         "basis": "bespoke shell take-off"},
    ]
    _ug_dim_civils = civils_rows_from_underground_scope(_ug_dim_rows)
    if len(_ug_dim_civils) != 1:
        print(f"  FAIL civils-derivation proveCatch (dia-x-h size text): expected exactly 1 "
              f"civils line for the real 'N m dia x M m' size format, got {len(_ug_dim_civils)}: "
              f"{_ug_dim_civils!r}"); bad += 1
    elif _ug_dim_civils[0]["line_gbp"] <= 0:
        print(f"  FAIL civils-derivation proveCatch (dia-x-h size text): civils line must be "
              f"non-trivial, got {_ug_dim_civils[0]!r}"); bad += 1
    # (b) proveNoFalsePositive #4: a matching underground row with NO parseable volume
    # is skipped — never a fabricated civils number.
    _no_vol_rows = [{"tag": "T-5", "requirement": "Drain Collection Sump", "status": "SYSTEM",
                      "part": "requirement stated", "qty": 1, "unit_gbp": 3200, "line_gbp": 3200,
                      "basis": "bespoke shell take-off"}]
    if civils_rows_from_underground_scope(_no_vol_rows):
        print("  FAIL civils-derivation: a row with no parseable volume must never get a "
              "fabricated civils line"); bad += 1

    print("selftest:", "OK" if bad == 0 else f"{bad} FAILED")
    return 1 if bad else 0


# ── Pipework re-pricing (the council's £1.27M phantom-pipe fix, 2026-06-16) ──
# The universal Blender builder writes ONE blanket flow on every water connection
# (the whole-plant recirculation flow) and prices them all at a fixed DN300 in
# 316L stainless @ £340/m. That is physically wrong: only the main recirculation
# LOOP carries full flow; a make-up / bleed / dosing / feed / chilling tie-in
# carries its OWN much smaller duty, and a water main is HDPE/PVC-U, not stainless
# (316L is reserved for LOX / ozone / seawater-intake / effluent service). So the
# BoM re-derives a realistic per-edge flow → DN at ~1.75 m/s → material → £/m,
# rather than trusting the schedule's blanket line_total_gbp. Universal: keyed off
# the edge ENDPOINTS + the carried contract quantities, no per-class table.

# Standard pipe DN ladder (mm bore). The re-sizer picks the smallest DN whose bore
# carries the edge flow at ≤ ~2 m/s (target 1.75 m/s).
_PIPE_DN_LADDER = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300,
                   350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600]

# Installed £/m by DN for the DEFAULT water main material (HDPE / PVC-U pressure
# pipe, UK 2026 supply+install incl. fittings/supports/jointing). Reserve 316L
# stainless (the £340/m DN300 the schedule used) for aggressive-service edges only.
def _hdpe_rate_per_m(dn_mm: float) -> float:
    """Installed £/m for an HDPE/PVC-U water main at the given DN (UK 2026)."""
    table = [(25, 28), (40, 36), (50, 44), (65, 55), (80, 66), (100, 82),
             (125, 104), (150, 128), (200, 176), (250, 232), (300, 296),
             (400, 430), (500, 600), (600, 820), (800, 1180), (1000, 1620),
             (1200, 2180), (1600, 3300)]
    for cap_dn, rate in table:
        if dn_mm <= cap_dn:
            return float(rate)
    return float(table[-1][1])


def _stainless_rate_per_m(dn_mm: float) -> float:
    """Installed £/m for a 316L stainless line (aggressive service) at the given DN."""
    # roughly 4× the HDPE rate (the schedule's own £340/m at DN300 sits here)
    return round(_hdpe_rate_per_m(dn_mm) * 3.8 + 30, 0)


# ── ZONED-DELIVERY DISTRIBUTION NETWORK (parametric — 2026-07-03, client section D) ────────
# A zoned-delivery plant (ebb/flow irrigation, bench fertigation, any valve-sectioned
# delivery grid) carries most of its cost in a repetitive FIELD distribution network the
# Blender never routes (it routes plant-room equipment ties, not a 15,000 m rack grid).
# The universal contract sizer (universal-contract-sizing.ts, mintDemandCoverage rule 8)
# derives the network PARAMETRICALLY — segment lengths by DN family + connection counts,
# each quantity carrying its derivation formula and 'parametric — not routed' provenance —
# and THIS pass prices those quantities as their own BoM lines.
#
# PRICE BASIS — supply-only share of the EXISTING installed £/m model: this bill is the
# RAW-MATERIALS bill (costStack.raw_materials_bom_gbp); the cost stack then adds field
# assembly labour + installation + EPC on top of every line. Pricing the network at the
# full supply+install £/m would double-count its installation. Thermoplastic distribution
# pipework is installation-dominated: pipe + fittings + hangers SUPPLY is ~20 % of the
# uk-2026 supply+install rate (DN75 PVC-U ≈ £13/m of the £66/m installed; DN110 ≈ £21 of
# £104), so the supply share is stated per line and the stack carries the labour.
_PVC_SUPPLY_SHARE = 0.20


def _pvc_supply_rate_per_m(dn_mm: float) -> float:
    """Supply-only £/m (pipe + fittings + hangers, ex-works) for PVC-U/HDPE distribution
    pipework at the given DN = the supply share of the uk-2026 supply+install model."""
    return round(_hdpe_rate_per_m(dn_mm) * _PVC_SUPPLY_SHARE, 1)


# The parametric network segments, in fixed render order (deterministic bill). Each entry:
# (quantity-key base, row label, basis SCOPE phrase — which client section owns the line).
_DIST_SCOPE_D = ("zoned-delivery distribution network (engineered allowance, NOT "
                 "per-pipe routed; client distribution-section scope)")
# rule-8b HAND-WATERING RING MAIN (client section E, 2026-07-03): the universal sizer
# mints hand_watering_ring_main_length_m / _dn_mm from the brief's OWN signals (the
# 25 m³/h manual duty + the established zoned-delivery geometry — 2 groups × 2 legs
# along the delivery spine, DN from d = √(4Q/πv) ≤ 1.3 m/s). The segment loop below
# prices it exactly like the section-D segments (supply-only £/m share, qty-in-metres);
# absent quantities (BESS / SAF / CO₂ / RAS) → the loop skips it, bill byte-identical.
_DIST_SCOPE_E = ("client section E scope (hand-watering ring main — engineered "
                 "allowance, NOT per-pipe routed)")
_DISTRIBUTION_SEGMENTS = [
    ("distribution_main", "Zoned distribution — department delivery mains", _DIST_SCOPE_D),
    ("distribution_riser", "Zoned distribution — delivery risers", _DIST_SCOPE_D),
    ("distribution_zone_lateral", "Zoned distribution — zone laterals (flood-fill lines)", _DIST_SCOPE_D),
    ("distribution_drain_riser", "Zoned distribution — drain/return risers (gravity)", _DIST_SCOPE_D),
    ("distribution_drain_collection", "Zoned distribution — drain collection lines", _DIST_SCOPE_D),
    ("distribution_drain_main", "Zoned distribution — main drain headers", _DIST_SCOPE_D),
    ("hand_watering_ring_main", "Hand watering — ring main to both departments", _DIST_SCOPE_E),
]

# Per-connection supply allowances (£, ex-works fittings/stub materials — stated basis):
#   inlet stub: a small-bore tee + stub + inlet fitting per served position (~£6)
#   drain outlet: a gravity tee/branch fitting per 2 positions (~£9)
#   zone kit: valve stub-in unions + supports per sectioning valve (~£40)
_DIST_INLET_STUB_GBP = 6.0
_DIST_DRAIN_OUTLET_GBP = 9.0
_DIST_ZONE_KIT_GBP = 40.0
# hand-watering tap/hose station (rule 8b, client section E): each of the brief's risers
# carries a hand valve + quick connector off the ring main. Supply-only materials
# allowance per station: brass hand valve ~£14 + quick-release hose coupler ~£9 +
# ring-main tee, riser stub + clamps ~£22 (ex-works) = £45.
_HAND_WATERING_STATION_GBP = 45.0


def _distribution_network_rows(q):
    """The parametric zoned-distribution network as BoM lines — one line per DN segment
    family plus the per-connection allowances. Reads ONLY the `distribution_*` (rule 8,
    client section D) and `hand_watering_ring_main_*` / `hand_watering_riser_count`
    (rule 8b, client section E) quantities the universal sizer minted with 'parametric —
    not routed' provenance (absent on every non-zoned archetype → returns [] and the bill
    is byte-identical). Lengths price at the supply share of the existing installed £/m
    model (see _PVC_SUPPLY_SHARE)."""
    q = q or {}

    def _qv(key):
        v = q.get(key)
        if isinstance(v, dict):
            v = v.get("value")
        return float(v) if isinstance(v, (int, float)) and v > 0 else None

    def _detail(key):
        v = q.get(key)
        return str(v.get("source_detail") or "") if isinstance(v, dict) else ""

    if not _qv("distribution_network_length_km"):
        return []
    rows, i = [], 0

    def _row(requirement, part, qty, unit_gbp, basis, extra=None, per_m=False):
        nonlocal i
        i += 1
        if per_m:
            # LENGTH-PRICED presentation (gate-36 round 3, 2026-07-03): a network segment used
            # to render qty 1 × the whole run's cost — the benchmark (and any reviewer) read
            # "Zone laterals … £109,296" as ONE DN75 assembly (~200× too high). The row now
            # carries qty = the run length in METRES and unit = the stated £/m supply rate, so
            # the unit price reads sane; the LINE TOTAL IS UNCHANGED (round(length × rate) is
            # exactly what the old qty-1 line charged). The £/m rate stays fractional BY DESIGN
            # — rounding £13.2/m to £13 would move an 8,280 m line by £1,656; deterministic
            # check C2 (unit × qty == line) carries ±max(0.5%, £1) tolerance, satisfied here.
            # `uom: "m"` exempts the row from the integer display-rounding pass in assemble().
            r = {
                "tag": "—",
                "requirement": requirement,
                "status": "PARAMETRIC",
                "part": part,
                "qty": int(round(qty)),
                "unit_gbp": round(unit_gbp, 2),
                "line_gbp": round(qty * unit_gbp),
                "uom": "m",
                "basis": basis,
                "material": "PVC-U (thermoplastic pressure pipework, solvent-weld)",
                "estimate_class": 4,
                "confidence": "moderate — parametric engineered allowance",
                "how_to_verify": "Recompute: length_m × £/m rate from the parametric basis formula",
            }
        else:
            r = {
                # untagged ("—") like other non-canonical rows: inventing a new tag-prefix family
                # (PD-) would add an undocumented abbreviation the Glossary audit rightly flags.
                "tag": "—",
                "requirement": requirement,
                "status": "PARAMETRIC",
                "part": part,
                "qty": qty,
                "unit_gbp": round(unit_gbp),
                "line_gbp": round(unit_gbp) * int(qty),
                "basis": basis,
                "material": "PVC-U (thermoplastic pressure pipework, solvent-weld)",
                "estimate_class": 4,
                "confidence": "moderate — parametric engineered allowance",
                "how_to_verify": "Recompute: qty × unit rate from the parametric basis formula",
            }
        if extra:
            r.update(extra)
        rows.append(r)

    for base, label, scope in _DISTRIBUTION_SEGMENTS:
        length_m = _qv(f"{base}_length_m")
        dn = _qv(f"{base}_dn_mm")
        if not length_m or not dn:
            continue
        rate = _pvc_supply_rate_per_m(dn)
        installed_rate = _hdpe_rate_per_m(dn)
        derivation = _detail(f"{base}_length_m")
        _row(
            f"{label} · DN{int(dn)} PVC-U · {length_m:,.0f} m",
            f"DN{int(dn)} PVC-U pressure pipe + fittings + hangers, {length_m:,.0f} m (supply)",
            length_m, rate,
            f"parametric estimate — {scope}: {length_m:,.0f} m × "
            f"£{rate:g}/m supply-only materials ({_PVC_SUPPLY_SHARE:.0%} of the uk-2026 "
            f"supply+install £{installed_rate:.0f}/m @ DN{int(dn)}; installation labour is "
            f"carried by the cost-stack field-install factors — no double count) · "
            f"length-priced: qty = the run length in metres, unit = £/m"
            + (f" · derivation: {derivation}" if derivation else ""),
            extra={"length_m": round(length_m, 1), "size": f"DN{int(dn)}"},
            per_m=True,
        )
    inlets = _qv("distribution_position_connections")
    if inlets:
        _row(
            f"Zoned distribution — delivery inlet stubs, one per served position · {inlets:,.0f} off",
            "Small-bore PVC-U tee + stub + inlet fitting (supply)",
            int(inlets), _DIST_INLET_STUB_GBP,
            f"parametric estimate — zoned-delivery distribution network: {inlets:,.0f} served "
            f"positions × £{_DIST_INLET_STUB_GBP:g} inlet-stub materials allowance (tee + stub "
            f"+ inlet fitting, ex-works) · {_detail('distribution_position_connections')}",
        )
    drains = _qv("distribution_drain_outlet_connections")
    if drains:
        _row(
            f"Zoned distribution — drain outlet connections (one per 2 positions) · {drains:,.0f} off",
            "PVC-U gravity tee/branch outlet fitting (supply)",
            int(drains), _DIST_DRAIN_OUTLET_GBP,
            f"parametric estimate — zoned-delivery distribution network: {drains:,.0f} drain "
            f"outlets × £{_DIST_DRAIN_OUTLET_GBP:g} gravity tee/branch materials allowance "
            f"(ex-works) · {_detail('distribution_drain_outlet_connections')}",
        )
    kits = _qv("distribution_zone_kits")
    if kits:
        _row(
            f"Zoned distribution — zone valve connection kits · {kits:,.0f} off",
            "Zone valve stub-in: unions, supports, riser tie-in (supply; valve body + actuator priced on the actuated-valve assembly line)",
            int(kits), _DIST_ZONE_KIT_GBP,
            f"parametric estimate — zoned-delivery distribution network: {kits:,.0f} valve "
            f"zones × £{_DIST_ZONE_KIT_GBP:g} connection-kit materials allowance; the "
            f"actuated valve assemblies themselves are priced on their own BoM line "
            f"(assembly family £/DN) — this kit is the pipework tie-in only, no double count "
            f"· {_detail('distribution_zone_kits')}",
        )
    stations = _qv("hand_watering_riser_count")
    if stations:
        _row(
            f"Hand watering — tap/hose stations (riser, hand valve + quick connector) · {stations:,.0f} off",
            "Ring-main riser stub-in: brass hand valve, quick-release hose coupler, tee + clamps (supply)",
            int(stations), _HAND_WATERING_STATION_GBP,
            f"parametric estimate — {_DIST_SCOPE_E}: {stations:,.0f} tap/hose stations × "
            f"£{_HAND_WATERING_STATION_GBP:g} per-station materials allowance (brass hand valve "
            f"~£14 + quick-release hose coupler ~£9 + ring-main tee, riser stub + clamps ~£22, "
            f"ex-works; installation labour is carried by the cost-stack field-install factors "
            f"— no double count) · {_detail('hand_watering_riser_count')}",
        )
    return rows


def _apply_demand_sized_basis(rows, q):
    """DEMAND-SIZED DUTY PROVENANCE (gate-36 round 3, 2026-07-03). A principal whose rendered
    duty EQUALS a contract ``*_demand_*`` flow quantity (the v57 irrigation pump: 90 m³/h =
    45 m³/h per department × 2 departments concurrent, brief line 49) reads as "~2× oversized"
    to a reviewer holding only the per-share figure. Stamp the demand derivation ON the row
    ('demand-sized: …') so the benchmark fault-router (routeFaults in
    scripts/lib/benchmark-expectation.ts) sees the stated basis and downgrades an oversize
    opinion that contradicts it. Fires ONLY for a flow duty (N m³/h in the row's requirement)
    equal (±1%) to a ``_demand_`` quantity carrying a stated multiplicative derivation — no
    BESS/SAF/CO2 row matches (their demand keys are not m³/h duties), so those bills stay
    byte-identical (verified in the selftest + the assemble diff). Returns the stamped count.
    Idempotent: a row already carrying 'demand-sized:' is never re-stamped."""
    demands = []
    for k, v in (q or {}).items():
        if not re.search(r"(^|_)demand(_|$)", str(k)):
            continue
        val = v.get("value") if isinstance(v, dict) else v
        unit = str(v.get("unit") or "") if isinstance(v, dict) else ""
        detail = str(v.get("source_detail") or "") if isinstance(v, dict) else ""
        u = unit.replace("³", "3").replace(" ", "").lower()
        if not (isinstance(val, (int, float)) and val > 0 and u in ("m3/h", "m3/hr") and detail):
            continue
        # only a derivation worth stating (a share multiplication: '×'/'x N'/'per') defends a row
        if not re.search(r"[×]|\bx\s*\d|\bper\b", detail):
            continue
        demands.append((float(val), detail.split(";")[0].strip()))
    if not demands:
        return 0
    n = 0
    for row in rows:
        if row.get("status") == "SUB-COMPONENT":
            continue
        basis = str(row.get("basis") or "")
        if "demand-sized:" in basis:
            continue
        m = re.search(r"·\s*([\d,]+(?:\.\d+)?)\s*m(?:³|3)/hr?\b", str(row.get("requirement") or ""))
        if not m:
            continue
        duty = float(m.group(1).replace(",", ""))
        for val, detail in demands:
            if abs(duty - val) <= 0.01 * val:
                row["basis"] = basis + f" · demand-sized: {detail}"
                n += 1
                break
    return n


# Endpoint NOUNS that make up the main high-flow recirculation LOOP (full recirc
# flow). UNIVERSAL water-treatment loop vocabulary — tank ↔ drum/screen filter ↔
# biofilter ↔ degasser ↔ oxygenator/cone ↔ UV/ozone ↔ recirculation pump. Only an
# edge whose BOTH endpoints are loop members carries the whole-plant flow.
_LOOP_NODE_RE = re.compile(
    r"rearing[_ ]?tank|grow[_ ]?out[_ ]?tank|fish[_ ]?tank|culture[_ ]?tank|"
    r"drum[_ ]?filter|microscreen|rotary[_ ]?drum|"
    r"biofilter|mbbr|moving[_ ]?bed|trickling|biofilm|nitrif|"
    r"degass|co2[_ ]?strip|degasser|"
    r"oxygen[_ ]?cone|speece|oxygenat|"
    r"\buv\b|ozone|disinfect|"
    r"recirc(?:ulation)?[_ ]?pump|circulation[_ ]?pump|process[_ ]?pump|sump|pump[_ ]?(?:station|gallery)",
    re.I)

# Endpoints that are pure INSTRUMENTS / sensors / controllers / electrical nodes —
# an edge whose endpoints are these is NEVER a water pipe (a signal tap or a power
# feed mis-tagged as fluid). Universal control-room / I&C vocabulary.
_SIGNAL_NODE_RE = re.compile(
    r"analy[sz]er|\bsensor\b|transmitter|\bprobe\b|signal[_ ]?conditioner|"
    r"main[_ ]?controller|\bplc\b|\bscada\b|\bhmi\b|i/?o[_ ]?module|"
    r"network[_ ]?switch|gateway|\brelay\b|breaker|busbar|surge|"
    r"controller[_ ]?power|emergency[_ ]?stop|interlock|isolation[_ ]?device|"
    r"fire[_ ]?detector|voltage[_ ]?sensor|current[_ ]?sensor",
    re.I)

# Aggressive-service edges that genuinely warrant 316L (or special) pipe rather
# than the HDPE default: liquid-oxygen / ozone delivery ONLY. (Applied only to
# BRANCH water edges — a main-loop edge is process water in HDPE even if its
# disinfection unit's NAME mentions ozone.)
# NB: seawater / brine / effluent are deliberately NOT here — 316L PITS in seawater
# (chloride stress-corrosion), so marine RAS + seawater-intake + treated effluent
# pipework is HDPE / PVC-U / GRP throughout (cheaper AND the correct material); only
# cryogenic-O₂ and oxidising-ozone delivery genuinely need stainless. (2026-06-16:
# tagging the seawater/effluent lines 316L mis-priced them ~4× — a £300k effluent
# pipe that is really ~£78k of HDPE.)
_STAINLESS_SERVICE_RE = re.compile(
    r"\blox\b|liquid[_ ]?oxygen|oxygen[_ ]?supply|ozone[_ ]?(?:supply|generat|inject|line)",
    re.I)

# GAS / cryogenic-liquid DELIVERY lines (oxygen / ozone / CO₂ / nitrogen / air feed)
# carry a small MASS flow (kg/s, kg/h, Nm³/h) — NOT a bulk water volume. They must be
# sized small-bore (stainless / copper), never as a 1,000s-m³/h water main.
_GAS_SERVICE_RE = re.compile(
    r"oxygen[_ ]?supply|\blox\b|liquid[_ ]?oxygen|\bozone\b|\bco2\b|carbon[_ ]?dioxide|"
    r"nitrogen|\bn2\b|compressed[_ ]?air|gas[_ ]?supply|gas[_ ]?feed",
    re.I)


def _edge_phase(frm: str, to: str, rating: str, mech: str) -> str:
    """Classify a fluid edge as 'liquid' | 'gas' | 'steam' by its PHYSICAL phase,
    delegating to connection_sizing._detect_phase (the SAME authority the Blender
    connection-sizer uses) so the bill-of-materials and the drawings agree.

    The phase detector keys on PHYSICAL signals only — the fluid words in the
    endpoint names + the mechanism + the flow unit — never an archetype name. A
    water edge (rearing tank ↔ biofilter, volumetric m³/s, 'fluid_loop') resolves
    to LIQUID and keeps the water-main model; a CO₂ / H₂ / syngas / amine-overhead
    tie resolves to GAS and is sized small-bore. STEAM is reported separately
    (a special high-velocity gas).

    The material_context fed to the detector is the endpoint names + mechanism (the
    only fluid description a connection row carries); the rating's unit drives the
    no-text mass-flow fallback. When the shared detector is unavailable (--selftest
    without the blender-universal dir), falls back to: an explicit gas/steam word in
    the endpoints/mechanism → gas/steam; a bare kg/s|kg/h|Nm³ mass rating → gas;
    else liquid (the historic default)."""
    blob = f"{frm} {to} {mech}".strip()
    unit = None
    m = re.search(r"(kg\s*/\s*[sh]|nm3|nm³|m3/s|m³/s|m3/h|m³/h|l/s|l/min|l/h)",
                  str(rating or ""), re.I)
    if m:
        unit = m.group(1).lower().replace(" ", "").replace("³", "3")
    if _cs_detect_phase is not None:
        try:
            return _cs_detect_phase(blob, unit, frm, to)
        except Exception:   # pragma: no cover — never let a phase miss crash the BoM
            pass
    # Standalone fallback (no shared detector): physical-signal heuristic only.
    low = blob.lower()
    if "steam" in low:
        return "steam"
    if re.search(r"\bgas\b|vapou?r|compressed|syngas|tail[_ ]?gas|off[_ ]?gas|flue|"
                 r"\bco2\b|carbon[_ ]?dioxide|\bh2\b|hydrogen|methane|\bch4\b|"
                 r"nitrogen|\bn2\b|\bo2\b|oxygen|ammonia", low):
        return "gas"
    if unit in ("kg/s", "kg/h", "nm3", "nm3"):
        return "gas"
    return "liquid"


def _edge_water_flow_m3h(frm: str, to: str, recirc_m3h: float, q, trains: int = 1) -> tuple:
    """Realistic per-edge water duty (m³/h) + a short basis label, from the edge's
    ENDPOINTS + the contract quantities — NOT the schedule's blanket recirc flow.

    Universal rule: an edge on the MAIN recirculation loop (both endpoints are loop
    members) carries the full recirculation flow; a make-up / bleed / dosing / feed /
    chilling / grading / sludge / media / oxygenation BRANCH carries its own much
    smaller duty, read from the matching contract quantity where one exists, else a
    small default fraction of recirc.

    `trains` is the number of PARALLEL process trains (e.g. the rearing-tank count):
    the whole-plant recirculation flow is split across them, so each represented
    loop edge carries the per-train duty (a real DN500-600 header), not one
    physically-impossible giant main carrying the entire plant flow through a single
    point-to-point pipe. Universal: a single representative edge per loop segment is
    one train's share.

    `recirc_m3h` is None for a plant that declares NO recirculation loop (a once-
    through / non-recirculating archetype): there is then no loop to represent, so the
    main-loop branch is skipped and every branch falls back to its ABSOLUTE floor duty
    (the `recirc * fraction` terms collapse to 0 and the floor wins) rather than a
    fraction of a fabricated plant flow."""
    blob = f"{frm} {to}".lower()
    has_recirc = recirc_m3h is not None and recirc_m3h > 0
    # For the fraction-of-recirc default terms below, a None recirc contributes 0 so the
    # absolute floor (the `max(..., FLOOR)` second arg) governs — no phantom loop flow.
    recirc_m3h = float(recirc_m3h) if has_recirc else 0.0

    def _qv(*keys, default=None):
        for k in keys:
            v = q.get(k) if isinstance(q, dict) else None
            if isinstance(v, dict):
                v = v.get("value")
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return default

    # A loop unit's NAME can carry a BRANCH qualifier — "Drum Filter BACKWASH",
    # "Degassing BLOWER", "Biofilm Carrier MEDIA charge", "… SAMPLE / OVERFLOW /
    # REJECT" — whose base noun ("drum filter", "degass", "biofilm") matches a
    # main-loop unit, but whose edge is the small BRANCH service of that unit (a
    # reject / utility / charge stream), NOT the full process loop. Such a qualifier
    # VETOES loop-membership so the per-branch duty rules below size the edge to its
    # own (much smaller) duty. Without this veto a backwash reject was mis-sized as a
    # full DN600 recirculation header — the root of the £700k phantom connection cost
    # + the fat-pipe "web" in the render (26 ancillary ties at the plant-max DN).
    # Universal: branch qualifiers are class-agnostic service words, no per-class table.
    _branch_veto = bool(re.search(
        r"backwash|\bblower\b|\bmedia\b|carrier|dos(?:e|ing)|chemical|\bfeed\b|feeding|"
        r"sludge|solids|thicken|chill|grad|harvest|crowd|skim|foam|make[_ -]?up|makeup|"
        r"\bbleed\b|\bdrain\b|blow[_ -]?down|purge|sample|overflow|reject|waste|effluent|"
        r"expansion|buffer|reservoir|mortality|biosecurity|quarant|grading", blob))

    # 1) MAIN LOOP — both ends are recirculation-loop process units AND neither end is
    # a branch-qualified service. The plant flow is carried by `trains` parallel
    # headers; one represented edge = one train.
    frm_loop = bool(_LOOP_NODE_RE.search(frm))
    to_loop = bool(_LOOP_NODE_RE.search(to))
    if has_recirc and frm_loop and to_loop and not _branch_veto:
        n = max(int(trains), 1)
        return (recirc_m3h / n,
                f"main recirculation loop — per-train header ({recirc_m3h:,.0f} m³/h ÷ {n} parallel trains)"
                if n > 1 else "main recirculation loop (full plant flow)")

    # 2) BRANCH services — derive the OWN duty from the contract quantity.
    if re.search(r"make[_ -]?up|makeup|fresh[_ -]?water|top[_ -]?up", blob):
        return _qv("makeup_water_m3_h", "make_up_water_m3_h",
                   default=max(recirc_m3h * 0.004, 5.0)), "make-up water duty (~0.4% of recirc)"
    if re.search(r"\bbleed\b|\bdrain\b|blow[_ -]?down|purge|waste[_ -]?water", blob):
        # bleed ≈ make-up (mass balance) — never the full recirc flow
        return _qv("bleed_water_m3_h", "blowdown_m3_h",
                   default=_qv("makeup_water_m3_h", default=max(recirc_m3h * 0.004, 5.0))), "bleed/drain duty (~make-up balance)"
    if re.search(r"dos|chemical|alkalin|\bph\b|bicarb|caustic|acid|nutrient", blob):
        return _qv("dosing_flow_m3_h", default=2.0), "chemical-dosing branch duty"
    if re.search(r"\bfeed\b|feeding|pellet", blob):
        return _qv("feed_water_m3_h", default=3.0), "feed-line branch duty"
    if re.search(r"chill|ice[_ ]?slurry|product[_ ]?cool|harvest[_ ]?chill", blob):
        return _qv("chiller_water_m3_h", "product_chill_m3_h",
                   default=max(recirc_m3h * 0.03, 20.0)), "product-chilling branch duty"
    if re.search(r"grad|harvest|crowd", blob):
        return _qv("grading_water_m3_h", default=max(recirc_m3h * 0.05, 30.0)), "grading/harvest branch duty"
    if re.search(r"sludge|solids|thicken|settle|biosolids", blob):
        return _qv("sludge_flow_m3_h", "backwash_flow_m3_h", "drum_filter_backwash_flow_m3_h",
                   default=max(recirc_m3h * 0.01, 10.0)), "solids/sludge branch duty"
    if re.search(r"media|carrier|biofilm[_ ]?carrier", blob):
        return _qv("media_charge_flow_m3_h", default=5.0), "media-charge branch duty"
    if re.search(r"protein[_ ]?skim|foam[_ ]?fraction|skimmer", blob):
        # a foam fractionator takes a side-stream slip-flow, ~5% of recirc
        return _qv("skimmer_flow_m3_h", default=max(recirc_m3h * 0.05, 40.0)), "protein-skimmer side-stream duty"
    if re.search(r"oxygenat|oxygen[_ ]?cone|speece", blob):
        # an oxygenation contactor on a side-loop ~5-8% of recirc
        return _qv("oxygenation_flow_m3_h", default=max(recirc_m3h * 0.06, 60.0)), "oxygenation side-loop duty"
    if re.search(r"expansion|buffer|reservoir|make[_ -]?up[_ ]?tank|surge[_ ]?tank", blob):
        return _qv("expansion_flow_m3_h", default=max(recirc_m3h * 0.02, 15.0)), "buffer/expansion branch duty"
    if re.search(r"heat[_ ]?exchang|\bhx\b|heat[_ ]?pump|thermal|temperature[_ ]?control", blob):
        # a heating/cooling side-loop carries only the flow needed to move its THERMAL
        # duty: Q = P / (ρ·cp·ΔT). For a RAS heating loop (ΔT ~ 5 °C) this is a small
        # fraction of recirc, NOT a flat 10%. Derive from the heating power where known.
        explicit = _qv("heating_loop_m3_h")
        if explicit:
            return explicit, "thermal side-loop duty"
        kw = _qv("heating_duty_kw", "makeup_heating_kw", "heat_pump_duty_kw")
        if kw:
            # m³/h = kW·1000 / (1000 kg/m³ · 4186 J/kg·K · 5 K) · 3600
            m3h = kw * 1000.0 / (1000.0 * 4186.0 * 5.0) * 3600.0
            return max(m3h, 20.0), "thermal side-loop duty (from heating power, ΔT 5 °C)"
        return max(recirc_m3h * 0.05, 40.0), "thermal side-loop duty"
    if re.search(r"manifold|distribution|pipework[_ ]?run|header|transfer", blob):
        # a header/manifold feeding a single tank carries that tank's turnover, not
        # the whole plant — a per-tank fraction of recirc
        return _qv("per_tank_flow_m3_h", default=max(recirc_m3h * 0.10, 60.0)), "distribution/header branch duty"
    if re.search(r"inlet|intake|seawater|borehole|source[_ ]?water", blob):
        return _qv("makeup_water_m3_h", default=max(recirc_m3h * 0.01, 10.0)), "intake/source branch duty"

    # 3) UNKNOWN branch (one end not on the loop) — a conservative small fraction of
    # recirc, NEVER the full plant flow.
    return max(recirc_m3h * 0.05, 25.0), "branch duty (default — endpoint not on main loop)"


def _size_pipe_from_flow(flow_m3h: float, target_v_ms: float = 2.0) -> tuple:
    """(DN mm, bore mm, velocity m/s) — smallest standard DN whose bore carries the
    flow at ≤ ~2.5 m/s (target 2.0 m/s, a standard design velocity for pumped
    process-water mains: typical 1.5-3 m/s). Universal hydraulic sizing."""
    import math as _m
    q_s = max(flow_m3h, 0.0) / 3600.0
    if q_s <= 0:
        return (_PIPE_DN_LADDER[0], _PIPE_DN_LADDER[0], 0.0)
    # required inner bore for the target velocity
    d_req_mm = _m.sqrt(4.0 * q_s / (_m.pi * target_v_ms)) * 1000.0
    for dn in _PIPE_DN_LADDER:
        # approximate bore ≈ DN (nominal); accept if velocity at this bore ≤ 2.5 m/s
        v = q_s / (_m.pi * (dn / 1000.0 / 2.0) ** 2)
        if dn >= d_req_mm and v <= 2.5:
            return (dn, dn, round(v, 2))
    dn = _PIPE_DN_LADDER[-1]
    v = q_s / (_m.pi * (dn / 1000.0 / 2.0) ** 2)
    return (dn, dn, round(v, 2))


# ── ENGINE-REFUSED VALVE SPEC STAMPING (2026-07-04, routed follow-on #1 to the
# honest generic-spec/OEM-proprietary taxonomy landed in build-excel-export.py
# commit d2b1c1075). The excel scorer's `_generic_spec_valve` reclassifies an
# engine-refused process valve (check / manual isolation / ball / sample — see
# `_engine_refused_process_valve` below, which MIRRORS build-excel-export.py's
# `_commodity_process_valve` EXACTLY: same three regex legs, same verdict, kept
# in sync by hand since the two scripts are independent CLI entry points) ONLY
# when the row's OWN cells carry a full DN + material + rating spec. Material
# is already stamped (the existing `_wetted_moc`/`_material` MoC pass below —
# the "material from the connected line's service MoC" leg of this follow-on
# was already closed). DN and a pressure-class rating were never stamped
# because nothing joined the valve back to the routed connection that knows
# its bore — this closes that join.
#
# THE JOIN (proven by the process-schedules fix, commit 5237e446e): the
# connection-schedule.json rows draw_process_schedules.py already uses are
# keyed by the HUMAN equipment name (`from`/`to`) — e.g. 'Softener Vessel',
# 'Ro High Pressure Pump'. A valve row whose OWN requirement/basis/part text
# NAMES exactly ONE of those equipment items joins that equipment's largest-
# bore connection (a vessel/skid's several nozzles legitimately differ in
# size — same "hosting vessel's connection DN" precedent as
# draw_process_schedules._dn_by_equipment_name); a rating token (PN/ANSI/bar/
# psi/class) is stamped ONLY when the schedule itself states one for that
# equipment (the schedule mostly carries FLOW ratings, not pressure classes —
# 'honest absent where not stated', never a default).
#
# NEVER STAMPS when the row's text names ZERO equipment (a class-level
# 'Manual Ball Valve' completion line naming no specific line — the common
# case for an auto-generated BoM-completion accessory, verified 2026-07-04:
# `partVerifications[*].sub_module_id` for these exact 7 rows resolves to
# essentially arbitrary template buckets — 'Isolation Valves' lands under
# `maintenance_serviceability__leveling_feet`, 'Check Valve' under
# `safety_protection__overcurrent_protection` — proving there is NO real
# per-row engineering placement to join against; inventing one via name/tag
# proximity would be exactly the fabrication this taxonomy exists to refuse)
# OR names TWO OR MORE *different* pieces of equipment (a genuinely ambiguous
# reference — ADDS a note instead of guessing). proveCatch both directions in
# `_selftest`.
_VALVE_ACTUATION_RX = re.compile(
    r"actuat|automat|solenoid|motoris|motoriz|\bcontrol\b|dosing|metering|modulat|"
    r"throttl|pneumatic|electric|relief|safety", re.I)
_COMMODITY_VALVE_NOUN_RX = re.compile(
    r"\b(check|non.?return|swing|ball|gate|globe|needle|wafer|lift|foot|"
    r"isolation|isolat\w*|manual|sample)\b", re.I)
_VALVE_RATING_RX = re.compile(
    r"\bPN\s*\d{1,3}\b|\bclass\s*\d{2,4}\s*#?\b|\bANSI\s*\d{2,4}\b|"
    r"\b\d+(?:\.\d+)?\s*bar(?:\s+rating)?\b|\b\d+(?:\.\d+)?\s*psi\b", re.I)


def _engine_refused_process_valve(text: str) -> bool:
    """Mirrors build-excel-export.py's `_commodity_process_valve` EXACTLY — the two
    scripts must agree on which rows this taxonomy covers, or a row could stamp
    here and still miss the scorer's own `_generic_spec_valve` gate."""
    n = str(text or "")
    if not re.search(r"\bvalves?\b|\bnon.?return\b", n, re.I):
        return False
    if _VALVE_ACTUATION_RX.search(n):
        return False
    return bool(_COMMODITY_VALVE_NOUN_RX.search(n))


def _connection_schedule_rows(out_dir: str) -> list:
    p = os.path.join(out_dir, "connection-schedule.json")
    if not os.path.exists(p):
        return []
    try:
        return (json.load(open(p)).get("rows") or [])
    except Exception:
        return []


def _named_equipment_candidates(text: str, cs_rows: list) -> set:
    """Equipment NAMES the row's own text mentions that also appear as a connection-
    schedule endpoint (from/to) — a real, non-fabricated reference, never a token-
    overlap guess. Case-insensitive whole-NAME substring match (a name like
    'Softener Vessel' must appear verbatim in the row's text, not merely share a
    word with it — 'Isolation Valves' sharing no word with any equipment name is
    exactly the point: it correctly yields NO candidate, not a guessed one)."""
    blob = f" {str(text or '').lower()} "
    names = set()
    for r in cs_rows:
        if not isinstance(r, dict):
            continue
        for key in ("from", "to"):
            nm = str(r.get(key) or "").strip()
            if nm and len(nm) >= 4 and nm.lower() in blob:
                names.add(nm)
    return names


def _dn_for_named_equipment(name: str, cs_rows: list) -> str:
    """Largest-bore DN among every connection-schedule run touching equipment NAME
    <name> (either end) — the vessel's main process nozzle, not a drain/vent stub.
    Mirrors draw_process_schedules.py's `_dn_by_equipment_name` exactly (the proven
    join). '' when the equipment has no sized connection at all — a genuine gap,
    never invented."""
    best_dn, best_bore = "", -1.0
    for r in cs_rows:
        if not isinstance(r, dict) or name not in (r.get("from"), r.get("to")):
            continue
        dn = str(r.get("size") or "").strip()
        if not dn:
            continue
        try:
            bore = float(r.get("outer_dia_mm") or 0)
        except (TypeError, ValueError):
            bore = 0.0
        if bore >= best_bore:
            best_dn, best_bore = dn, bore
    return best_dn


def _rating_for_named_equipment(name: str, cs_rows: list) -> str:
    """A pressure-CLASS token (PN/ANSI/bar/psi/class) STATED on a connection-schedule
    run touching equipment NAME <name> — never a default, never inferred from price
    or material. '' when the schedule states no pressure class for that equipment
    (the common case — the schedule carries FLOW ratings, e.g. '45 m3/h', not
    pressure classes; honest absent, per this follow-on's own instruction)."""
    for r in cs_rows:
        if not isinstance(r, dict) or name not in (r.get("from"), r.get("to")):
            continue
        for fld in ("rating", "cost_basis", "qty"):
            hit = _VALVE_RATING_RX.search(str(r.get(fld) or ""))
            if hit:
                return hit.group(0).strip()
    return ""


def _apply_valve_stamping(rows: list, cs_rows: list) -> list:
    """Pure application of the join rule onto `rows` given an already-loaded
    connection-schedule `cs_rows` list — split from `_stamp_engine_refused_valve_specs`
    so `_selftest` can proveCatch the join with a synthetic schedule, independent of
    any on-disk connection-schedule.json. See the module docstring above for the
    join/ambiguity rule this implements."""
    if not cs_rows:
        return rows
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get("size") or "").strip():
            continue    # already sized — never overwrite
        req = str(row.get("requirement") or "")
        # SUB-COMPONENT rows (requirement starts '↳', or `sub_of` set) are OUT OF SCOPE:
        # the excel scorer's taxonomy (`_eval_bom_ledger_contract`'s own `is_sub` check,
        # mirrored here exactly) never evaluates them for generic-spec/OEM-proprietary —
        # their unit/line/MPN/size live on the PARENT line by apportionment. A sub-
        # component's OWN basis often already names its parent equipment (e.g. "physics-
        # sized component of Ro High Pressure Pump"), which WOULD join unambiguously —
        # but stamping it would be scope creep on a row this follow-on's target taxonomy
        # never reads, so it is explicitly skipped rather than silently mutated.
        if req.startswith("↳") or row.get("sub_of"):
            continue
        part = str(row.get("part") or "")
        if not _engine_refused_process_valve(f"{req} {part}"):
            continue
        blob = f"{req} {part} {row.get('basis') or ''}"
        candidates = _named_equipment_candidates(blob, cs_rows)
        if len(candidates) != 1:
            if len(candidates) > 1:
                row["basis"] = (str(row.get("basis") or "").rstrip(" ·")
                                 + f" · size/rating not stamped: row names {len(candidates)} "
                                   f"distinct connection-schedule equipment items — ambiguous join")
            continue    # zero → no reference at all; >1 → genuinely ambiguous, never guess
        name = next(iter(candidates))
        dn = _dn_for_named_equipment(name, cs_rows)
        if not dn:
            continue    # named equipment has no sized connection — honest absent
        row["size"] = dn
        note = f" · size {dn} derived from connection schedule (line {name})"
        rating = _rating_for_named_equipment(name, cs_rows)
        if rating:
            note += f" · rating {rating} (from the connected line's stated pressure class)"
        row["basis"] = str(row.get("basis") or "").rstrip(" ·") + note
    return rows


def _stamp_engine_refused_valve_specs(rows: list, out_dir: str) -> list:
    """Stamps DN (`size`) + (when the schedule states one) a rating token onto every
    engine-refused process valve row in `rows` whose own size field is empty, by
    reading `out_dir`'s connection-schedule.json. See `_apply_valve_stamping` for the
    join/ambiguity rule."""
    return _apply_valve_stamping(rows, _connection_schedule_rows(out_dir))


# ── OEM-PROPRIETARY (no public MPN) FINDING RECORDING (2026-07-04, routed
# follow-on #2). `build-excel-export.py`'s `_oem_proprietary_row` honours the
# OEM-proprietary status ONLY when a row's own `basis` states a RECORDED
# research finding — never self-declared merely because a price/part is
# absent. `scripts/ingest/ingest-water-treatment-verified-parts.ts` writes
# VERIFIED findings (mfr + family + evidence URLs + date, narrowly matched by
# requirement substring) into forge-truth.db's `verified_no_public_mpn_findings`
# table; this reads them back — read-only, defensive (a missing DB/table is a
# no-op, never a crash) — and stamps the matching row's basis on EVERY
# `assemble()` call, so a brand-new chain run and an offline replay of an
# existing out_dir (`python3 scripts/requirements_bom.py out/<run>`) both pick
# up the SAME recorded finding without touching the TS emitter at all.
_NO_PUBLIC_MPN_CACHE: dict = {}


def _run_class_tag(st: dict) -> str:
    """The current run's own class tag — matches the `class_tag` an ingest script
    (scripts/ingest/ingest-*-verified-parts.ts) stamps on its
    `verified_no_public_mpn_findings` rows. Prefers `orchestratorContract.
    product_class` (the ingest scripts' own CLASS_TAG constant — 'bess',
    'water_treatment', 'co2_mineralisation', 'e_fuel_synthesis' — matches this
    exactly); falls back to `moduleDecomposition.product_class` when the contract
    is absent (offline/synthetic states, e.g. `_selftest`'s inline fixtures).
    '' when neither is present — `_oem_proprietary_findings` then matches NO
    finding rather than every finding (fail closed, never fail open)."""
    if not isinstance(st, dict):
        return ""
    oc = (st.get("orchestratorContract") or {}).get("product_class")
    if oc:
        return str(oc)
    md = (st.get("moduleDecomposition") or {}).get("product_class")
    return str(md) if md else ""


def _oem_proprietary_findings(class_tag: str) -> list:
    """[(part_name_match:list[str], basis_text:str)] from forge-truth.db, SCOPED to
    `class_tag` (the current run's own class — see `_run_class_tag`), cached per
    class_tag for the process lifetime. [] when the DB or table doesn't exist yet
    (a fresh checkout that hasn't run the ingest script), or when `class_tag` is
    empty — never raises.

    CROSS-CLASS LEAK FIX (2026-07-06): this used to read EVERY row in
    `verified_no_public_mpn_findings` regardless of class, matching purely on the
    generic `part_name_match` text — so a CO2-mineralisation finding for
    'cooling-water skid' (S&S Technical PCW skid, a bespoke build-to-order item)
    silently stamped onto SAF's OWN, UNRELATED 'cooling-water skid · 1200 kW' line
    (a different real design, same generic English name) the moment the CO2
    ingest committed to forge-truth.db — a genuine cross-class contamination
    caught by this round's own byte-identity replay across BESS-v15/water-v79/
    SAF-v21 (SAF was NOT byte-identical before this fix). The table's `class_tag`
    column already exists (every ingest script stamps it); this was simply never
    read. Universal, keyed on the SAME class_tag string every ingest script
    already writes — no per-class table."""
    global _NO_PUBLIC_MPN_CACHE
    if not class_tag:
        return []
    if class_tag in _NO_PUBLIC_MPN_CACHE:
        return _NO_PUBLIC_MPN_CACHE[class_tag]
    out = []
    if os.path.exists(_FORGE_TRUTH_DB):
        try:
            import sqlite3
            con = sqlite3.connect(f"file:{_FORGE_TRUTH_DB}?mode=ro", uri=True)
            rows = con.execute(
                "SELECT part_name_match, basis_text FROM verified_no_public_mpn_findings WHERE class_tag = ?",
                (class_tag,),
            ).fetchall()
            con.close()
            for match_json, basis_text in rows:
                try:
                    names = json.loads(match_json)
                except Exception:
                    names = []
                if names and basis_text:
                    out.append(([str(n) for n in names], str(basis_text)))
        except Exception:
            out = []
    _NO_PUBLIC_MPN_CACHE[class_tag] = out
    return out


def _apply_oem_findings(rows: list, findings: list) -> list:
    """Pure application of a `findings` list ([(names, basis_text), …]) onto `rows` —
    split from `_stamp_oem_proprietary_findings` so `_selftest` can proveCatch the
    matching/idempotency behaviour with a synthetic findings list, independent of
    whether forge-truth.db happens to be present in the run environment. NEVER
    inferred from a merely-missing price/part — a row only stamps when a finding
    actually names it. Idempotent — skips a row whose basis already carries the
    finding text."""
    if not findings:
        return rows
    for row in rows:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "")
        if not req:
            continue
        basis = str(row.get("basis") or "")
        for names, basis_text in findings:
            if basis_text in basis:
                break   # already stamped
            if any(n.lower() in req.lower() for n in names):
                row["basis"] = (basis.rstrip(" ·") + " · " + basis_text) if basis.strip() else basis_text
                break
    return rows


def _stamp_oem_proprietary_findings(rows: list, class_tag: str = "") -> list:
    """Stamps every recorded no-public-MPN research finding FOR THIS RUN'S OWN
    CLASS (forge-truth.db, scoped by `class_tag` — see `_oem_proprietary_findings`)
    onto its matching row's `basis`. See `_apply_oem_findings` for the matching/
    idempotency rule. `class_tag=""` (the pre-2026-07-06 default) matches nothing
    — callers that know their class MUST pass it; `assemble()` passes
    `_run_class_tag(st)`."""
    return _apply_oem_findings(rows, _oem_proprietary_findings(class_tag))


def _connection_rows(out_dir: str, q=None):
    """Each routed connection (pipe / cable / duct run from the Blender layout)
    becomes its OWN bill-of-materials line — service-classified (electrical /
    water / air), carrying its as-built LENGTH and SIZE — so every input/output
    connection is an IDENTIFIED part, not just decoration on an equipment row
    (Tristan 2026-06-15: "pay attention to all of the input output connections
    plus the length and sizing eg electric water and air"). Universal: reads the
    deterministic connection-schedule the universal Blender builder writes for
    any archetype.

    WATER pipes are RE-PRICED here (council 2026-06-16, the £1.27M phantom-pipe
    fix): the schedule blanket-tags every water tie with the whole-plant recirc
    flow at a fixed DN300 in 316L @ £340/m. The BoM instead derives a realistic
    per-edge flow from the endpoints + contract quantities (`q`), sizes the DN at
    ~1.75 m/s, defaults to HDPE/PVC-U (reserving 316L for LOX/ozone/seawater/
    effluent), and NEVER prices an instrument-signal or electrical tie as a water
    main. An out-of-spec run is flagged ROUTED·REVIEW so the loop can re-size it."""
    p = os.path.join(out_dir, "connection-schedule.json")
    if not os.path.exists(p):
        return []
    try:
        cs = json.load(open(p))
    except Exception:
        return []
    q = q or {}

    def _norm_endpoint(s: str) -> str:
        return str(s or "").replace("_", " ").strip().lower()

    ledger_map = {}
    p_ledger = os.path.join(out_dir, "connection-ledger.json")
    if os.path.exists(p_ledger):
        try:
            for r in json.load(open(p_ledger)).get("rows", []):
                # connection-ledger uses from_part/to_part; some writers use from/to
                f = _norm_endpoint(r.get("from_part") or r.get("from") or "")
                t = _norm_endpoint(r.get("to_part") or r.get("to") or "")
                if f and t:
                    ledger_map[(f, t)] = r
        except Exception:
            pass

    route_map = {}
    p_route = os.path.join(out_dir, "route-manifest.json")
    if os.path.exists(p_route):
        try:
            for r in json.load(open(p_route)).get("lines", []):
                f = _norm_endpoint(r.get("from_tag") or r.get("from") or "")
                t = _norm_endpoint(r.get("to_tag") or r.get("to") or "")
                if f and t:
                    route_map[(f, t)] = r
        except Exception:
            pass

    def _qval(*keys, default=None):
        for k in keys:
            v = q.get(k) if isinstance(q, dict) else None
            if isinstance(v, dict):
                v = v.get("value")
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return default

    # whole-plant recirculation flow (the schedule's blanket value) — the ONLY edges
    # that legitimately carry it are the main-loop edges. ARCHETYPE-NEUTRAL: this must
    # come from a DECLARED recirculation quantity, never a hardcoded plant flow. A plant
    # with NO recirculation loop (a once-through process, a CO₂/SAF train) declares none
    # → recirc_m3h stays None and NO phantom loop reference is synthesised; the branch-
    # duty rules below fall back to absolute floors rather than a fraction of a fabricated
    # loop flow. The RAS declares recirculation_flow_m3_h, so it is unaffected.
    recirc_m3h = _qval("recirculation_flow_m3_h", "degasser_water_flow_m3_h",
                       "drum_filter_throughput_m3_h", default=None)
    # PARALLEL PROCESS TRAINS — the recirculation LOOP flow is split across N parallel
    # treatment trains (the recirc PUMPS / drum-filters / degassers that actually carry
    # the loop), so a single represented loop edge carries one train's share. The split
    # count is the EQUIPMENT-train count the contract authoritatively declares
    # (`recirc_pump_count` / `drum_filter_count` / `degasser_count`) — NOT the rearing-
    # TANK count. Those differ (8 pump trains vs 10 tanks at 13,360 m³/h): dividing the
    # loop by the tank count (÷10 → 1,336 m³/h) gives a per-unit flow that, ×8 trains,
    # is 10,688 ≠ the 13,360 loop — the exact per-tank-vs-per-pump basis bug. The pump-
    # train count gives 13,360 ÷ 8 = 1,670, which closes. Falls back to the tank count
    # only when no train count is declared. Universal, floored at 1.
    train_count_keys = ("recirc_pump_count", "drum_filter_count", "degasser_count",
                        "recirc_train_count", "biofilter_count")
    trains = 1
    for _tk in train_count_keys:
        _tc = _qval(_tk)
        if _tc and _tc >= 1:
            trains = max(1, round(_tc))
            break
    else:
        tot_vol = _qval("total_tank_volume_m3")
        each_vol = _qval("rearing_tank_volume_each_m3")
        if tot_vol and each_vol and each_vol > 0:
            trains = max(1, round(tot_vol / each_vol))
    out = []
    for i, r in enumerate(cs.get("rows") or []):
        size = str(r.get("size") or "").strip()
        mech = str(r.get("mechanism") or "").lower()
        frm = str(r.get("from") or "").replace("_", " ").strip()
        to = str(r.get("to") or "").replace("_", " ").strip()
        
        frm_key = frm.lower()
        to_key = to.lower()
        ledger_row = ledger_map.get((frm_key, to_key)) or {}
        route_row = route_map.get((frm_key, to_key)) or {}
        
        # P0-C (2026-07-08): residual/boundary/direction CLOSER edges are topological
        # completion, not customer-bought plant pipework — suppress them from the costed
        # BoM (~£25k phantom water-connection lines on Codema). Keyed ONLY on the closer
        # language in service/material_context/role — NEVER on source=="completion" alone
        # (that flag also marks real MCC power feeders + utility hierarchy the customer buys).
        signals = [
            str(ledger_row.get("material_context") or ""),
            str(route_row.get("service") or ""),
            str(ledger_row.get("service") or ""),
            str(ledger_row.get("role") or ""),
            str(route_row.get("role") or ""),
            str(r.get("service") or ""),
            str(r.get("role") or ""),
        ]
        if any("closer" in s.lower() for s in signals):
            continue

        length = r.get("length_m")
        within = bool(r.get("within_spec"))
        rating = str(r.get("rating") or "").strip()
        line = float(r.get("line_total_gbp") or 0.0)
        basis = str(r.get("cost_basis") or "model:uk-2026 supply+install")
        sized_note = None

        # ── SERVICE CLASSIFICATION ──
        # The connection-LEDGER's own service verdict is the AUTHORITY when present
        # (2026-07-10, Powerwall run-23: the ledger's air-mover override correctly
        # authored fan/vent edges as service 'air', but this classifier ignored it and
        # fell to the water default — re-pricing a cabinet's AIR paths as DN100 water
        # mains at the 40 m³/h thermal floor, £1,061 of phantom pipe + the exact
        # 'pipes into empty space' geometry the vision critic flags).
        _ledger_svc = str(ledger_row.get("service") or "").lower()
        if "mm²" in size or "mm2" in size.lower() or any(k in mech for k in ("cable", "power", "electr", "supply", "feeder", "bus")):
            service, kind = "electrical", "cable"
        elif (_ledger_svc == "air" or "duct" in size.lower()
              or any(k in mech for k in ("hvac", "vent", "exhaust", "air", "aeration"))):
            service, kind = "air", "duct"
        else:
            service, kind = "water", "pipe"

        # P0-C (2026-07-09): when the parametric zoned-distribution network already owns
        # the plant pipe take-off (distribution_network_length_km present →
        # _distribution_network_rows emits X-14x length-priced lines), per-edge water Cxx
        # rows DOUBLE-COUNT the same pipework (~£25k phantom "water connection: A → B"
        # lines). Suppress WATER Cxx from the costed bill; Connection trace still reads
        # connection-ledger.json. Electrical/air Cxx stay (not covered by the PVC
        # distribution take-off). Keyed on the distribution_network_length_km signal —
        # every archetype without zoned delivery is byte-identical.
        if service == "water":
            _dnet = q.get("distribution_network_length_km") if isinstance(q, dict) else None
            if isinstance(_dnet, dict):
                _dnet = _dnet.get("value")
            if isinstance(_dnet, (int, float)) and _dnet > 0:
                continue

        # ── AIR ROW AT DEVICE SCALE (2026-07-10 run-35): the Blender schedule prices
        # every sized run on the PIPE model, so a cabinet's short AIR paths carried
        # 'pipe £28/m @ DN25 (water service)' labels at £59-69 each. A sub-5 m air
        # run is a moulded duct/grille: supply-share £6/m + £4 ends. Plant-scale
        # ducting (long runs) keeps the schedule's own figure.
        if service == "air":
            _alen = float(length) if isinstance(length, (int, float)) else 0.0
            if 0 < _alen < 5.0:
                line = round(_alen * 6.0 + 4.0, 2)
                basis = (f"air duct/grille supply-share × {_alen:.1f} m @ £6/m + ends "
                         f"(re-priced from the pipe-model schedule figure)")
                within = True

        # ── MIS-CLASSIFIED SIGNAL/ELECTRICAL TIE wrongly tagged as a fluid edge ──
        # An edge whose BOTH endpoints are pure instruments/sensors/controllers (and
        # carries no real liquid duty) must NEVER be a DN300 water main. The schedule
        # mis-tags some instrument→sensor signal taps as fluid_loop @ 3.71 m³/s.
        if service == "water" and _SIGNAL_NODE_RE.search(frm) and _SIGNAL_NODE_RE.search(to):
            service, kind = "electrical", "cable"
            length_m = float(length) if isinstance(length, (int, float)) else 10.0
            # a 1.5 mm² instrument signal cable, installed ~£6/m
            line = round(length_m * 6.0 + 35.0)
            size = "1.5 mm²"
            within = True   # deliberately re-classified — this is now a correct cable
            sized_note = "re-routed as instrument signal cable (was mis-tagged as a water main)"
            basis = f"signal cable 1.5 mm² × {length_m:.1f} m @ £6/m + terminations (re-classified from fluid tie)"

        # ── WATER PIPE RE-PRICING (endpoint-derived flow → DN → material → £/m) ──
        if service == "water":
            length_m = float(length) if isinstance(length, (int, float)) else 0.0
            endpoints = f"{frm} {to}"
            rating_is_mass = bool(re.search(r"\bkg\s*/\s*[sh]\b|\bnm3\b|nm³|\bg\s*/\s*s\b", rating, re.I))
            is_loop = bool(_LOOP_NODE_RE.search(frm) and _LOOP_NODE_RE.search(to))

            # ── PHASE ROUTING (archetype-neutral) ──
            # The fluid branch is NO LONGER assumed to be water. Detect the PHYSICAL
            # phase (liquid / gas / steam) from the endpoints + mechanism + flow unit
            # via the SHARED connection-sizing authority, and route accordingly:
            #   gas / steam  → small-bore line at a high gas velocity (NOT a water main);
            #   liquid       → the HDPE/316L water-main model (unchanged — RAS preserved).
            # A main RECIRCULATION-LOOP edge is process water by construction, so it is
            # never re-phased to gas (the loop carries the recirculating LIQUID even if a
            # unit name mentions a stripped gas species like CO₂). This keeps the RAS
            # loop edges (rearing tank ↔ biofilter ↔ degasser, m³/s) sizing as water.
            phase = "liquid" if is_loop else _edge_phase(frm, to, rating, mech)

            # RAS-PRESERVATION GUARD: a stated VOLUMETRIC flow unit (m³/s, m³/h, L/s …) is a
            # LIQUID signal — a gas DELIVERY line is rated in MASS or normal-volume (kg/s,
            # kg/h, Nm³), never bulk m³/s. So an edge whose rating carries a volumetric unit
            # stays LIQUID regardless of a gas-species word in an endpoint name: the RAS
            # recirculation WATER passing THROUGH an in-loop 'Oxygen Supply (LOX) System' /
            # 'Protein Skimmer' is water at 0.45 m³/s, and the bleed/drain → 'effluent' ties
            # are water (the shared detector's substring 'flue'∈'effluent' would otherwise
            # mis-flag them gas). This keeps every RAS fluid edge on the water model. A gas
            # verdict is therefore honoured only for a NON-volumetric-rated tie (a real mass
            # /Nm³ feed, or an unrated dosing line). (Physical signal: the rating UNIT —
            # never an archetype name.)
            rating_is_volumetric = bool(re.search(
                r"m3\s*/\s*[sh]|m³\s*/\s*[sh]|\bl\s*/\s*(?:s|min|h|hr)\b", rating, re.I))
            if phase in ("gas", "steam") and rating_is_volumetric:
                phase = "liquid"

            # GAS / STEAM DELIVERY line (oxygen/ozone/CO₂/H₂/syngas/amine-overhead feed)
            # — sized small-bore at a HIGH gas velocity, NOT a bulk-water main. Sizing
            # input precedence: a stated MASS flow (kg/s, kg/h) drives a mass-duty DN; a
            # stated VOLUMETRIC gas flow (m³/s, m³/h) is sized at the gas velocity; with
            # no parseable rating a small-bore DN50 default is used.
            if (not is_loop) and phase in ("gas", "steam"):
                v_target = 30.0 if phase == "steam" else 18.0   # m/s gas/steam line
                if rating_is_mass:
                    # small-bore gas delivery line — DN15-50 by mass duty
                    kgs = _num(rating) or 0.0
                    if re.search(r"kg\s*/\s*h", rating, re.I):
                        kgs = kgs / 3600.0
                    dn_mm = 15 if kgs < 0.05 else 25 if kgs < 0.2 else 40 if kgs < 1.0 else 50
                    flow_note = f"{rating} (mass flow, not bulk water)"
                else:
                    # A normal-volume gas rate (Nm³/h, Nm³/s) → size at the gas velocity.
                    # Otherwise (no recognised flow UNIT — e.g. 'N2 purge', '0', '—')
                    # use a small-bore DN50 default. Note: a bulk m³/s|m³/h|L/s unit can
                    # never reach here — the RAS-preservation guard above re-routes any
                    # volumetric-unit rating to LIQUID, so we must NOT extract a bare
                    # number from unitless text ('N2' → '2' would mis-size a phantom main).
                    nm3 = re.search(r"(-?\d+(?:\.\d+)?)\s*nm3\s*/\s*([sh])|(-?\d+(?:\.\d+)?)\s*nm³\s*/\s*([sh])",
                                    rating, re.I)
                    qv = 0.0
                    if nm3:
                        val = float(nm3.group(1) or nm3.group(3))
                        per = (nm3.group(2) or nm3.group(4)).lower()
                        qv = (val / 3600.0) if per == "h" else val   # → m³/s
                    if qv > 0:
                        _dn, _b, _v = _size_pipe_from_flow(qv * 3600.0, target_v_ms=v_target)
                        dn_mm = int(_dn)
                        flow_note = f"{rating} @ {v_target:.0f} m/s {phase}"
                    else:
                        dn_mm = 50
                        flow_note = f"unrated {phase} tie → small-bore default"
                rate, matlabel = _stainless_rate_per_m(dn_mm), f"316L stainless ({phase})"
                term = 2.0 * (0.25 * rate + 80.0)
                line = round(length_m * rate + term)
                size = f"DN{dn_mm}"
                within = True
                sized_note = f"{phase} delivery line: {rating} → DN{dn_mm} small-bore {matlabel}"
                basis = (f"{phase} delivery pipe £{rate:.0f}/m @ DN{dn_mm} ({matlabel}) × "
                         f"{length_m:.1f} m + 2 ends · {flow_note}")
            else:
                flow_m3h, duty_basis = _edge_water_flow_m3h(frm, to, recirc_m3h, q, trains)
                dn_mm, bore_mm, v_ms = _size_pipe_from_flow(flow_m3h)
                # material: HDPE/PVC-U by default; 316L reserved for genuine aggressive-
                # service BRANCH lines (LOX/ozone-delivery/seawater/effluent). A MAIN-LOOP
                # edge is process water in HDPE even if a disinfection unit's name mentions
                # ozone — the loop carries process water, not an ozone-delivery stream.
                agg = (not is_loop) and bool(_STAINLESS_SERVICE_RE.search(f"{endpoints} {mech}"))
                if agg:
                    rate, matlabel = _stainless_rate_per_m(dn_mm), "316L stainless"
                else:
                    rate, matlabel = _hdpe_rate_per_m(dn_mm), "HDPE/PVC-U"
                term = 2.0 * (0.25 * rate + 80.0)            # two jointed/flanged ends
                line = round(length_m * rate + term)
                size = f"DN{int(dn_mm)}"
                # within-spec now means the re-sized velocity is sane (≤ 2.5 m/s)
                within = v_ms <= 2.5
                sized_note = f"{duty_basis}: {flow_m3h:,.0f} m³/h → DN{int(dn_mm)} @ {v_ms:.1f} m/s ({matlabel})"
                basis = (f"pipe £{rate:.0f}/m @ DN{int(dn_mm)} ({matlabel}) × {length_m:.1f} m + "
                         f"2 ends · sized {flow_m3h:,.0f} m³/h @ {v_ms:.1f} m/s · {duty_basis}")

        req = f"{service} connection: {frm} → {to}" + (f" · {rating}" if rating else "")
        # ── INSTALLED-SCOPE STATEMENT (gate-36 round 2, 2026-07-03): every routed run is
        # priced on the uk-2026 SUPPLY+INSTALL model (£/m rate incl. pipe/cable supply +
        # fittings/supports/jointing + installation labour; ends = jointed/flanged/lugged
        # terminations) — NOT a bare-fittings price. The benchmark diagnose compared £900-
        # £2,400 installed water runs to £50-£150 FITTINGS and £100-£130 installed cable
        # runs to £15-£40 TERMINATIONS: two different scopes. State the scope ON the line
        # so no reader can mistake the installed run for a component price (the fault
        # router downgrades an installed-vs-component complaint to a note on this basis).
        if "install" not in basis.lower():
            basis += (" · installed cost — supply + installation labour + terminations "
                      "included (uk-2026 supply+install model; not a bare-fittings/component price)")
        # human part description incl. length + as-sized DN/CSA
        if service == "water":
            part = f"{size} {matlabel} {kind}, {float(length or 0):.1f} m"
        else:
            part = str(r.get("qty") or f"{size} {kind}")
        # ── MATERIAL OF CONSTRUCTION (v56c ledger column-contract fix, 2026-07-03): a
        # routed run is a PHYSICAL fabricated take-off, so every service states its
        # material — the water branch already sized one (matlabel); a CABLE is the
        # £/m·conductor copper model by construction; a DUCT is galvanised sheet. The 27
        # 'material missing on a PHYSICAL fabricated part' C-row fails were exactly the
        # electrical runs shipping with no stated material. Universal — keyed on the
        # service the row itself carries, no class table. ──
        if service == "water":
            conn_material = matlabel
        elif service == "electrical":
            conn_material = "Cu conductor, LSZH/XLPE insulated (BS 6724/BS 5467 class)"
        else:
            conn_material = "galvanised steel duct (DW/144)"
        row = {
            "tag": f"C{len(out) + 1:02d}",
            "requirement": req,
            "status": "ROUTED" if within else "ROUTED·REVIEW",
            "part": part,
            "qty": 1,
            "unit_gbp": round(line),
            "line_gbp": round(line),
            "basis": basis,
            "material": conn_material,
            # COST-BASIS DISCLOSURE (ledger 'Est class'/'Confidence' columns, 2026-07-03):
            # a routed run is a deterministic parametric take-off (routed length × the
            # uk-2026 installed £/m rate) — AACE class 3, moderate confidence. Stated at
            # SOURCE so the 39 connection rows never render blank estimate-class cells.
            "estimate_class": 3,
            "confidence": "moderate — deterministic take-off (routed length × rate)",
            # G5 (Sam): how an SME verifies this line without re-running the whole design
            "how_to_verify": "Recompute: length_m × £/m install rate from the cost basis",
            # extras (length + sizing focus) — consumed by the run dashboard:
            "connection": True, "service": service, "size": size,
            "length_m": round(float(length), 1) if isinstance(length, (int, float)) else None,
            "within_spec": within,
        }
        if sized_note:
            row["sized_note"] = sized_note
        out.append(row)
    return out


# ── GATE-21 PRICE NORMALISATION (council 2026-06-17 — the cap that didn't fire live) ──
# WHY the commodity cap above did NOT fire on the live run: gate 21
# (per-line-price-plausibility-audit.ts) reads its per-line price straight from
#   state.partVerifications[*].cost_repair_corrected_price_gbp ?? price_estimate_gbp
# — NOT from the assemble() BoM rows. The catalogue cap + bare-commodity ceiling
# live entirely inside assemble() and only touch the rendered ROW prices
# (row["unit_gbp"] / row["line_gbp"]). So the cap modified one field while gate 21
# read a DIFFERENT one; they never met. (Compounding it, 3 of the 5 mis-PINs are
# '__'-suffixed sub-components that assemble() never even emits as top-level rows.)
# This pass closes the loop: it applies the SAME PN-over-description commodity
# ceiling to the EXACT partVerification price fields gate 21 reads, so the cap and
# the gate operate on one field. It is keyed off the PART NUMBER (word modifier OR
# the partVerification's own MPN) — a 'Local Sensor' whose PN is a TI TMP451 temp
# IC is priced as the IC (£150), because the description is the mis-pin. A genuine
# rated instrument (kW/duty) or a real field-instrument PN stays exempt → its price
# is untouched, so CO₂/SAF (which carry no mis-PINNED commodity chips) are
# byte-identical. Universal, deterministic, no per-class table.
def _pv_reference_price(pv: dict):
    """A REAL catalogue/distributor reference unit price (£) carried on the
    partVerification, else None. This is the SAME number gate 21 compares against —
    the forge-truth.db cascade price — so capping to a multiple of it makes the cap
    and the gate agree. Prefer the explicit distributor price; fall back to the
    engine-C forge-truth.db reference (`engine_c_our_unit_gbp`) the verifier stamped
    from the catalogue match.

    CRITICAL GUARD (no-reference token): Engine C stamps `engine_c_our_unit_gbp`
    even when it found NO priced catalogue reference — a curve-derived TOKEN (e.g.
    £12) flagged `engine_c_flag == 'no_reference'` / `engine_c_priced_count == 0`.
    That token is NOT a real catalogue price and must NEVER be used to cap a line
    (it would crush a genuine Mitsubishi heat-pump thermistor / ABB combi-sensor
    from ~£800 to 3×£12 = £36 — the I-104/I-106 under-bill). Only `engine_c_our_
    unit_gbp` backed by ≥1 priced reference (`engine_c_priced_count > 0` and the
    flag is not 'no_reference') counts as a real reference here. The distributor
    price is always real. Universal — keyed on the provenance flag, no class table."""
    dp = pv.get("distributor_price_gbp")
    if isinstance(dp, (int, float)) and dp > 0:
        return float(dp)
    flag = str(pv.get("engine_c_flag") or "")
    priced = pv.get("engine_c_priced_count")
    engine_c_has_real_ref = (flag != "no_reference"
                             and (priced is None or (isinstance(priced, (int, float)) and priced > 0)))
    if engine_c_has_real_ref:
        for fld in ("engine_c_our_unit_gbp", "engine_c_ref_median_gbp"):
            v = pv.get(fld)
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
    return None


def _normalise_partverification_prices(state: dict) -> list:
    """Cap mis-PINNED commodity lines IN PLACE on state.partVerifications so gate 21
    reads the capped price (it reads cost_repair_corrected_price_gbp ??
    price_estimate_gbp — the field this mutates). Returns change records (for
    logging). PN-OVER-DESCRIPTION, two complementary arms, both keyed off the PART
    NUMBER not the (mis-pinned) human description:

      (A) BARE-COMMODITY CEILING — a bare IC / MCU / board-mount sensor-IC /
          connector / cable / I/O / comms line is bounded by its sub-class ceiling
          (£150/£300/£500), so a TI TMP451 IC labelled 'Local Sensor' is priced as
          the chip.
      (B) CATALOGUE CAP — when the line carries a STRUCTURED PN AND a real catalogue
          reference price (the forge-truth.db number gate 21 compares against), the
          price is capped at ≤3× that reference. This catches a correctly-described
          but parametrically over-priced commodity whose NOUN escapes arm A — e.g.
          the Crouzet 81529907 in-line non-return valve priced £939 vs its £49.66
          catalogue reference (the word 'valve' exempts it from arm A, but 3× £49.66
          = £149 still bounds it).

    The two arms take the TIGHTER result. A rated instrument (carries kW/duty) or a
    genuine field-instrument PN is exempt from BOTH → untouched (so CO₂/SAF, which
    carry no mis-pinned commodity, are byte-identical)."""
    pvs = state.get("partVerifications")
    if not isinstance(pvs, list):
        return []
    # word_id → (name_human, modifier-dict) from the module tree, so the ceiling can
    # read the human noun + any kW/duty rating + the word's OWN pinned PN.
    word_by_id = {}
    for m in ((state.get("moduleDecomposition") or {}).get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                wid = str(w.get("id") or "")
                if wid:
                    word_by_id[wid] = (w.get("name_human") or "",
                                       {x.get("kind"): x.get("value")
                                        for x in (w.get("modifier_characters") or [])})
    PRICE_FIELDS = ("cost_repair_corrected_price_gbp", "price_estimate_gbp", "unit_price_gbp")
    changes = []
    for pv in pvs:
        if not isinstance(pv, dict) or pv.get("cost_repair_excluded_from_subtotal"):
            continue
        wid = str(pv.get("word_id") or pv.get("id") or "")
        wname, wmd = word_by_id.get(wid, ("", {}))
        wmd = wmd or {}
        # the line's identity: prefer the word's human noun, then the PV's own name.
        name = wname or str(pv.get("word_name") or "")
        # PN-over-description: the word's pinned PN, else the partVerification's MPN.
        word_pn = str(wmd.get("part_number") or "")
        pv_pn = str(pv.get("part_number") or "")
        pn = word_pn if _is_structured_pn(word_pn) else (pv_pn or word_pn)
        mfr = str(wmd.get("manufacturer") or pv.get("manufacturer") or "")
        # a genuinely RATED line (kW/kVA/duty) is real sized kit — exempt from both
        # arms (its price is rating-driven, not a catalogue commodity number).
        if _is_rated_instrument(wmd, name, name):
            continue
        # arm (A): bare-commodity sub-class ceiling (PN- and name-derived).
        cap = _bare_commodity_ceiling(name, pn, wmd, name, mfr)
        # arm (B): 3× catalogue-reference cap when the line carries a STRUCTURED PN
        # AND a real catalogue reference price (the number gate 21 compares against)
        # AND it is not a genuine field-instrument series. This bounds an over-priced
        # commodity whose noun escapes arm A — the Crouzet 81529907 in-line
        # non-return valve (£939 vs £49.66 reference; the word 'valve' exempts it
        # from arm A, but 3× £49.66 = £149 still bounds it).
        ref = _pv_reference_price(pv)
        is_field_instr = bool(_FIELD_INSTRUMENT_MFR_RE.search(mfr)
                              or _FIELD_INSTRUMENT_MFR_RE.search(pn))
        # arm B's PN gate is DELIBERATELY looser than _is_structured_pn: a real
        # catalogue SKU is often a bare numeric run (the Crouzet 81529907, a Mouser
        # match). The strong signal is that gate 21's OWN DB lookup returned a price
        # for this exact MPN (carried here as the reference). So accept any concrete,
        # non-TBD MPN of length ≥4 — a 'TBD'/'generic'/'M6' descriptor is rejected.
        pn_concrete = (len(pn) >= 4 and not _TBD_RE.search(pn)
                       and not re.fullmatch(r"(?i)m\d+|m\d+x\d+|generic|tbd|n/?a|standard", pn))
        if ref is not None and pn_concrete and not is_field_instr:
            cat_cap = COMMODITY_CAP_MULT * ref
            cap = cat_cap if cap is None else min(cap, cat_cap)
        if cap is None:
            continue
        for fld in PRICE_FIELDS:
            v = pv.get(fld)
            if isinstance(v, (int, float)) and v > cap:
                pv[fld] = float(cap)
                changes.append({"word_id": wid, "name": name, "part_number": pn,
                                "manufacturer": mfr, "field": fld,
                                "was_gbp": round(float(v), 2), "now_gbp": round(float(cap), 2)})
    return changes


# ── ACCESSORY IDENTITY FAMILY (2026-07-05, generalising the fan-tray field-swap
# guard above to I-10 'gas sensor mount' — BESS out/bess-campaign-v5, same
# corpus-mismatch/field-swap MECHANISM, a different word noun). An accessory
# that is physically fitted to / racked alongside a parent PRINCIPAL (a
# mounting bracket, a DIN-rail mount, a cable-tray segment, a cradle, a clamp —
# the fan-tray shape stays under its own established `_INTERNAL_FAN_TRAY_RE`
# guard, untouched here) is frequently authored with the PARENT's own
# manufacturer+part_number silently copied onto its modifier_characters — e.g.
# 'gas sensor mount' carrying manufacturer=Crowcon / part_number=TXgard-IS+,
# the PARENT DETECTOR's own catalogue identity (a real device, £150-580
# corpus median), while the mount's independently-researched partVerification
# correctly priced it as a £1 commodity accessory (A1TXG-ACC-MOUNT — an
# unresolved but DISTINCT SKU, never inherited from a sibling by construction).
# Rendering the copied identity false-joins the accessory to the parent's
# price/spec wherever a downstream check matches by manufacturer+PN substring
# (the exact x2,679 fan-tray mechanism). Universal accessory-noun match; scoped
# to ACCESSORY SCALE so a genuine principal that happens to share one of these
# nouns (a rated structural mounting frame, a priced cable-tray run) is never
# touched: fires only when the line carries NO rating_primary duty of its own
# AND its independently-researched price sits under an accessory ceiling — a
# real principal at this scale would price well above it. proveCatch both
# directions in `_selftest`.
_ACCESSORY_IDENTITY_RE = re.compile(
    r"\bfan[\s_-]?tray\b|\bmount(?:ing)?\b|\bbracket\b|\btray\b|\bholder\b|"
    r"\brail\b|\bcradle\b|\bclamp\b", re.I)
_ACCESSORY_IDENTITY_PRICE_CEILING_GBP = 50.0


# ── SIBLING-IDENTITY-COLLISION GUARD (2026-07-05, BESS out/bess-campaign-v8 I-17) —
# the UNIVERSAL generalisation of the fan-tray / accessory-identity families above,
# for the noun shapes those two narrow regexes don't cover (a sensor, a label, a
# padlock, a tape roll — anything). The chain's part-verification rescue
# (`inheritPartNumberFromDeterministicSibling`, serial-design-chain-v2.tsx) copies a
# VERIFIED sibling word's OWN manufacturer+part_number onto a word whose own PN was
# stripped as a hallucination, so gate 20 (fictional-PN) has something real to find —
# a legitimate rescue FOR THAT GATE. But it also silently makes two structurally
# DIFFERENT parts (an arc-flash RELAY and its fibre-optic point SENSOR; a compliance
# label and a warning label; an isolator label and its padlock) share one exact
# catalogue SKU. No real design ever gives two different components the same MPN, so
# this is detected structurally — never a noun table: within one sub_module, 2+
# DISTINCT words carrying the identical (manufacturer, part_number) is the collision
# signature. The TRUE owner is confirmed by ITS OWN independently-researched
# partVerification (`pv_pn`, keyed by word_id — a fresh call per word, never mutated
# by the in-place sibling copy); every OTHER member whose own pv_pn DISAGREES with the
# shared PN is a borrower. Rendering the borrower as `IDENTIFIED · catalogue` against
# that borrowed SKU false-JOINS its (correct) own price to the DONOR's unrelated
# reference price in the downstream per-line cost-band check (BESS I-17: a £140 fibre
# sensor, own price untouched, banded against the £6.5 relay estimate it borrowed the
# identity from — a corpus/identity mismatch, not a pricing error). Fix at SOURCE:
# a borrower's `pn` is blanked before the fulfilment branch below, so it falls through
# to the SAME honest 'NOT FOUND — requirement stated' path a word with no pinned part
# already takes (still priced from its OWN wid-keyed estimate, untouched) instead of
# a false catalogue pin. Returns {word_id: (mfr_norm, pn_norm)} for BORROWERS only —
# the confirmed donor's own row is never touched. proveCatch in `_selftest`.
def _detect_borrowed_identities(modules, pv_pn: dict) -> dict:
    groups: dict = {}
    for m in (modules or []):
        for sm in (m.get("sub_modules") or []):
            smid = sm.get("id") or id(sm)
            for w in (sm.get("words") or []):
                wid = str(w.get("id") or "")
                if not wid or "__" in wid:
                    continue
                md = _mods(w)
                name = str(w.get("name_human") or "")
                pn = str(md.get("part_number") or "").strip()
                mfr = str(md.get("manufacturer") or "").strip()
                # an IDENTITY-BEARING PN only (`_is_identity_bearing_pn`: a structured
                # catalogue MPN OR a specific-but-non-numeric product-family name) —
                # never a GENERIC bespoke descriptive placeholder ('fabricated
                # compressor-suction knock-out drum — bespoke vessel') shared,
                # entirely legitimately, across several DIFFERENT made-to-order
                # vessels that simply have no real catalogue MPN (SAF oxccu-saf-v21
                # D-102/D-103: two genuinely distinct bespoke separators, correctly
                # both 'made-to-order fabrication' — never a collision). Widened
                # 2026-07-06 from `_is_structured_pn` alone (see that function's
                # docstring) to also catch a non-numeric copied identity (CO₂-
                # mineralisation E-101/E-107: GEA 'FLUIDBED VIBRO-FLUIDISER', no
                # digits). proveCatch (both directions) in `_selftest`.
                if not pn or not mfr or _TBD_RE.search(pn) or not _is_identity_bearing_pn(pn):
                    continue
                # a rated principal (its own `rating_primary` duty OR a `capacity`
                # dimension — the MCC 'motor control centre' word carries its 3000 kW
                # under `capacity`, not `rating_primary`) already runs the full
                # universal rating-based reconciliation pipeline further down (grounds
                # /rejects an undersized named MPN with a SPECIFIC diagnostic — SAF
                # EP-109 'motor control centre · 3000 kW' correctly borrowed the
                # co-located VFD's ACS580-01 in the emitted data, but the rating
                # pipeline already relabels it more precisely than a bare identity
                # note could); a bare structural/instrument/accessory line has no such
                # downstream mechanism, which is exactly the gap this guard closes.
                #
                # NARROWED (2026-07-06, CO₂-mineralisation v5 E-101/E-107 fix): the
                # "downstream rating pipeline" this exemption defers to is
                # `_reconcile_rated_price` / `_rated_equipment_cost`, and THAT
                # pipeline only recognises the noun families in _RATING_COST_MODELS
                # (motor/VFD/pump/blower/compressor/heat-pump/chiller/heat-exchanger/
                # fan/mixer/generator/UPS/transformer). A capacity/rating_primary
                # value alone is NOT proof a downstream mechanism exists — v5's
                # "crystalliser vacuum condenser" (capacity 60 kW) and "dryer exhaust
                # heat-recovery exchanger" (capacity 30 kW) both carried a copied
                # sibling identity (GEA FLUIDBED VIBRO-FLUIDISER, the CO₂/K2SO4 hot-
                # air DRYER's own MPN) and were exempted here on the bare presence of
                # `capacity`, even though neither noun ('condenser', 'heat-recovery
                # exchanger') matches any _RATING_COST_MODELS family — so NO
                # downstream mechanism ever inspected either identity, and the
                # borrowed dryer MPN rendered as a false 'IDENTIFIED · catalogue' row
                # (parts_ledger.py's orphan check separately flagged both as
                # zero-connectivity orphans — a DIFFERENT axis, this fix addresses the
                # dishonest STATUS). Require the noun to actually match a rating-cost
                # family before deferring to it; every previously-exempted case this
                # guard was written for (motor/VFD/pump/MCC/blower/…) still matches
                # `_has_rating_cost_model` and is unaffected. proveCatch in `_selftest`.
                if (md.get("rating_primary") or md.get("capacity")) and _has_rating_cost_model(name):
                    continue
                groups.setdefault((smid, mfr.lower(), pn.upper()), []).append(wid)
    borrowed = {}
    for (smid, mfr_norm, pn_norm), wids in groups.items():
        if len(wids) < 2:
            continue
        owners = [w for w in wids if str(pv_pn.get(w) or "").strip().upper() == pn_norm]
        if not owners:
            continue   # no confirmed owner in this sub_module — ambiguous, leave untouched
        for w in wids:
            if w in owners:
                continue
            own_pv = str(pv_pn.get(w) or "").strip()
            if own_pv and own_pv.upper() != pn_norm:
                borrowed[w] = (mfr_norm, pn_norm)
    return borrowed


# fabricated-name-family MATERIAL stamps (2026-07-10 run-40: the taxonomy bridge
# classified busbar work / manifolds / insulation as FABRICATED — the column contract
# then honestly demanded a MATERIAL these parametric rows never carried). The stated
# material of each fabricated family is its trade default; disclosed, idempotent,
# never overwrites a stated material. Mirrors the family list in build-excel-export
# _FABRICATED_NAME_FAMILY_RX + parts_ledger._FABRICATED_PACK_WORK_RE (in sync by hand).
_FAB_FAMILY_MATERIALS = [
    (re.compile(r"busbar", re.I), "ETP copper bar, tin-plated (stamped/formed to drawing)"),
    (re.compile(r"thermal\s+management\s+(?:manifold|bay|plenum)|coolant\s+loop", re.I),
     "aluminium sheet/extrusion (formed to drawing)"),
    (re.compile(r"deflagration\s+vent\s+panel", re.I), "scored stainless sheet (burst element to drawing)"),
    (re.compile(r"(?:fireproof|thermal|acoustic)\s+insulation", re.I), "mineral-wool / ceramic-fibre board"),
    (re.compile(r"structural\s+(?:base\s+)?frame|compartmentali[sz]ed\s+internal", re.I),
     "painted structural carbon steel (S275)"),
    (re.compile(r"power\s+distribution\s+unit", re.I), "powder-coated steel enclosure + copper distribution"),
    # battery pack STRUCTURE (2026-07-10 run 51): OEM-fabricated from the design's own
    # pinned cells — module frames + retention + interconnect work, never a bought module.
    (re.compile(r"battery\s+modules?\b|(?:battery\s+)?module\s+racks?\b|pack\s+frames?\b|cell\s+stacks?\b", re.I),
     "aluminium module frames + retention hardware (cell-to-pack assembly to drawing)"),
]


def _stamp_fabricated_family_materials(rows):
    for r in rows:
        if not isinstance(r, dict) or str(r.get("material") or "").strip():
            continue
        nm = str(r.get("requirement") or "")
        for rx, mat in _FAB_FAMILY_MATERIALS:
            if rx.search(nm):
                r["material"] = mat
                break
    return rows


def assemble(out_dir: str):
    st = json.load(open(os.path.join(out_dir, "state.json")))
    _pv_state = st          # stable handle to the STATE dict — the loop below rebinds
                            # local `st` to a take-off tuple (~line 2449); the corpus-
                            # median-lift post-pass reads partVerifications from here.
    # Cap mis-PINNED bare-commodity partVerification prices (PN-over-description)
    # BEFORE building rows, so the IDENTIFIED-row price this function reads from the
    # partVerifications `price` map is already the capped value — the SAME field
    # gate 21 reads. Idempotent + no-op for non-mis-pinned states (CO₂/SAF unchanged).
    _normalise_partverification_prices(st)
    # WETTED-PARTS CORROSION — detect the plant fluid corrosivity (seawater/chemical) once, so
    # the take-off upgrades wetted steel shells to 316L and every wetted part gets an explicit MoC.
    _set_plant_corrosivity(st)
    # CANONICAL TAGS — build the shared {cid: [tag, …]} map ONCE from this state, so the
    # synthesised-auxiliary rows below carry the SAME numbered tag the drawing schedules
    # print. Keyed by the word's content-character id. Range-rendered per row (a qty-N
    # word emits ONE row → "LT-201–205"). None when the module is unavailable (--selftest).
    _aux_tag_map = canonical_tags.build_tag_map(st) if canonical_tags is not None else {}
    def _canon_tag(w, fallback):
        """The canonical range-label for a synthesised-auxiliary word, or `fallback`
        (the legacy bare ISA letter) if its cid is absent from the map."""
        cc = w.get("content_character") or {}
        cid = cc.get("character_id") if isinstance(cc, dict) else None
        tags = _aux_tag_map.get(cid) if cid else None
        return canonical_tags.format_range(tags) if (tags and canonical_tags is not None) else fallback
    def _load(n):
        p = os.path.join(out_dir, n)
        return json.load(open(p)) if os.path.exists(p) else {}
    rm = _load("route-manifest.json"); pm = _load("parts-manifest.json")
    # contract quantities — the physics-derived duties the per-edge pipe re-pricing
    # and the per-unit-operation parametrics read (recirc flow, make-up flow, O₂
    # supply, UV lamp power, HX duty …). Universal: a dict keyed by quantity name.
    qcontract = ((st.get("orchestratorContract") or {}).get("quantities") or {})

    # tag + as-built geometry from the Blender layout (ONE geometry source for the BoM cost,
    # the drawings and the 3D — not the word's re-derived working volume; kills the 9.5-vs-10.26 split)
    tag_by_name = {}
    geom_by_name = {}
    for p in (pm.get("parts") or []):
        nm0 = re.sub(r"\s+\d+$", "", str(p.get("name") or ""))
        tag_by_name.setdefault(nm0, p.get("equipment_tag"))
        dm = p.get("dims_mm") or {}
        g = None
        if isinstance(dm, dict):
            if "dia" in dm:
                g = (float(dm["dia"]) / 1000.0, float(dm.get("len") or dm.get("h") or 0) / 1000.0)
            elif "w" in dm or "d" in dm:
                g = (max(float(dm.get("w") or 0), float(dm.get("d") or 0)) / 1000.0, float(dm.get("h") or 0) / 1000.0)
        if g and g[0] > 0 and g[1] > 0:
            geom_by_name.setdefault(nm0.strip().lower(), g)
    conns_by_tag = {}
    for l in (rm.get("lines") or []):
        for t in (l.get("from_tag"), l.get("to_tag")):
            if t:
                conns_by_tag.setdefault(t, set()).add(l.get("size_label") or f"DN{round(l.get('outer_dia_mm',0))}")

    # price map from partVerifications.
    # PRICE-PROPAGATION BRIDGE (council 2026-06-16): a VERIFIED catalogue line can
    # carry its real distributor price in `distributor_price_gbp` while BOTH
    # `cost_repair_corrected_price_gbp` and `price_estimate_gbp` are null (e.g. the
    # Fuse Holder: Mouser £118, status=verified, but the two cost-repair fields are
    # None). The old cascade dropped it → £0 line. So `distributor_price_gbp` is now
    # the LAST resort in the cascade. A separate `dist_price` map keeps the cheapest
    # real distributor price for the gate-21 >5× divergence preference below.
    price = {}
    dist_price = {}
    pv_pn = {}        # the partVerification's OWN MPN (may differ from the word modifier)
    # CURVE-ONLY PROVENANCE (2026-07-03, codema v65 I-106): a word's price is
    # "curve_only" when Engine B's OWN small-parts commodity-class curve is the
    # sole basis (engine_b_estimate_source in {curve, flash_lite_unknown_class})
    # — i.e. NOT grounded in a real distributor hit, DB spec match, or corpus
    # price. Engine B's ComponentClass taxonomy (component-classes.ts) has no
    # class for a bespoke fabricated vessel/tank shell — every one of its ~24
    # classes is explicitly small-parts scale (electronics, fasteners, moulded
    # housings, …) — so a curve_only price is a FAMILY MISMATCH by construction
    # whenever it lands on a `_bespoke_class() != 'none'` word. Used below to
    # refuse the catalogue-pin branch for a bespoke fabricated shell, the same
    # type-coherence discipline dbHitAcceptableForWord applies to a DB MPN pin.
    curve_only = {}
    for v in (st.get("partVerifications") or []):
        wid = str(v.get("word_id") or "")
        if not wid:
            continue
        dp = v.get("distributor_price_gbp")
        if isinstance(dp, (int, float)) and dp > 0:
            dist_price[wid] = float(dp)
        if str(v.get("engine_b_estimate_source") or "").strip().lower() in (
                "curve", "flash_lite_unknown_class"):
            curve_only[wid] = True
        vpn = str(v.get("part_number") or "").strip()
        if vpn:
            pv_pn[wid] = vpn
        p = (v.get("cost_repair_corrected_price_gbp")
             or v.get("price_estimate_gbp")
             or v.get("distributor_price_gbp"))   # bridge: keep the verified distributor price
        if isinstance(p, (int, float)) and p > 0 and not v.get("cost_repair_excluded_from_subtotal"):
            price[wid] = float(p)

    # see _detect_borrowed_identities docstring — a word whose displayed mfr+PN was
    # copied from an unrelated sibling (part_number_inherited_from_sibling rescue)
    # false-joins its own (correct) price to the sibling's unrelated reference price
    # downstream. {word_id: (mfr_norm, pn_norm)} for BORROWERS only.
    _borrowed_identity = _detect_borrowed_identities(
        (st.get("moduleDecomposition") or {}).get("modules") or [], pv_pn)

    # Sub-components (explodeEquipmentSubAssemblies, id 'parent__suffix') = the ASSEMBLY
    # BREAKDOWN of their principal. Collect per parent → itemise beneath each principal
    # row (a pump → casing/impeller/motor/VSD/seal…; a tank → shell/heads/nozzles…),
    # scaled to SUM to the parent's calibrated cost. DEPTH without double-counting: the
    # child line_gbp stays 0 (grand total unchanged); the scaled £ rides in breakdown_gbp.
    def _child_price(cw):
        for mc in (cw.get("modifier_characters") or []):
            if mc.get("kind") == "price_estimate_gbp":
                try:
                    return max(0.0, float(mc.get("value")))
                except (TypeError, ValueError):
                    return 0.0
        return 0.0
    kids_by_parent = {}
    for _m in ((st.get("moduleDecomposition") or {}).get("modules") or []):
        for _sm in (_m.get("sub_modules") or []):
            for _w in (_sm.get("words") or []):
                _wid = str(_w.get("id") or "")
                if "__" in _wid:
                    kids_by_parent.setdefault(_wid.split("__")[0], []).append(_w)

    # ── CROSS-MODULE WORD-ID COLLISION GUARD (root cause of the X-117/119/120 blank-
    # name ledger rows, co2-mineralisation round-2): a word `id` occasionally appears
    # MORE THAN ONCE across the whole module tree — once fully authored (name_human +
    # content_character) in its OWN module, and once as a BARE stub (only a couple of
    # modifier_characters, no name_human/content_character) mistakenly attached to a
    # DIFFERENT module (e.g. `k2so4_recrystalliser_word` authored in "K2SO4 Recovery &
    # Crystallisation" AND, bare, inside "Gypsum Carbonation Reactor"). The bare stub
    # still carries enough (manufacturer/part_number) to render an IDENTIFIED/NOT-FOUND
    # row, but with an EMPTY requirement — a row the Part-names master can't collect as
    # a principal (empty name → excluded), while the LEDGER (every non-sub-component
    # tag) still lists it: a tag present in the ledger but absent from the master. Worse,
    # sharing the SAME word_id means downstream word_id-keyed lookups (price/pv) can
    # resolve the bare stub's row against its AUTHORED TWIN's contract-priced
    # partVerification while the row itself wears the bare stub's own (often wrong-
    # class) manufacturer+part_number — a phantom mis-priced line for a part that
    # doesn't structurally exist. Pre-scan the WHOLE tree once: an id is "authored" if
    # ANY occurrence carries a non-empty name (its own name_human, or its
    # content_character's). A bare occurrence of an id that IS authored elsewhere is a
    # phantom cross-module duplicate — skip it entirely, so the tag is honestly excluded
    # from BOTH the ledger and the master, never one without the other. A bare id with
    # NO authored occurrence anywhere is a genuine gap and is left untouched — it falls
    # through to the existing 'NOT FOUND — requirement stated' path unchanged.
    _id_occurrences: dict = {}
    _authored_ids: set = set()
    for _m in ((st.get("moduleDecomposition") or {}).get("modules") or []):
        for _sm in (_m.get("sub_modules") or []):
            for _w in (_sm.get("words") or []):
                _wid0 = str(_w.get("id") or "")
                if not _wid0:
                    continue
                _id_occurrences[_wid0] = _id_occurrences.get(_wid0, 0) + 1
                _nm0 = _w.get("name_human") or (_w.get("content_character") or {}).get("name_human") or ""
                if str(_nm0).strip():
                    _authored_ids.add(_wid0)
    _phantom_duplicate_ids = {i for i, n in _id_occurrences.items() if n > 1 and i in _authored_ids}

    rows = []
    for m in ((st.get("moduleDecomposition") or {}).get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                wid = str(w.get("id") or "")
                if "__" in wid:                       # sub-component → itemised under its parent below
                    continue
                name = w.get("name_human") or ""
                if not name and wid in _phantom_duplicate_ids:
                    continue                          # phantom cross-module id collision — its authored twin already emits the real row
                if re.search(r"\bfastener|gasket seal|\bbracket\b|wiring harness|labelling|"
                             r"lifting point|nameplate|mounting hardware|earthing boss\b", name, re.I):
                    continue                          # hardware detail — not a requirement line
                md = _mods(w)
                tag = tag_by_name.get(name) or "—"
                # ── REQUIREMENT (what it must do) ──
                duty = md.get("rating_primary")
                duty_u = next((x.get("unit") for x in (w.get("modifier_characters") or [])
                               if x.get("kind") == "rating_primary"), "")
                # SIZE line. `capacity` is a genuine VOLUME only when its modifier unit is a
                # volume (m³/L); for an electrical/flow/thermal part `capacity` carries its OWN
                # unit (A, V, W, kW, L/min). The old code hardcoded " m³" onto ANY capacity value
                # — so a 2300 A breaker rendered "2300 m³", a 1000 V sensor "1000 m³", a 150 L/min
                # pump "150 m³" (50-250× the whole 40-ft container). That broke the GA sizing AND
                # the generative benchmark net (gate 36) flagged it as a pervasive volume bug.
                # UNIVERSAL fix: honour the capacity modifier's REAL unit; only label m³ when it
                # actually is a volume. A non-volume rating already covered by rating_primary (duty)
                # is dropped to avoid a redundant "1000 V measuring range · 1000 V".
                size = md.get("dimension")
                if not size and md.get("capacity"):
                    cap_val = md.get("capacity")
                    cap_unit = next((x.get("unit") for x in (w.get("modifier_characters") or [])
                                     if x.get("kind") == "capacity"), None) or ""
                    cu = str(cap_unit).strip()
                    if not cu or re.fullmatch(r"m3|m³", cu, re.I):
                        size = f"{cap_val} m³"                 # genuine volume capacity (tank/vessel)
                    elif re.fullmatch(r"l|litre|litres|liter|liters", cu, re.I):
                        size = f"{cap_val} L"                  # volume in litres
                    elif not duty:
                        size = f"{cap_val} {cu}"               # a RATING (A/V/W/kW/…) — show its true unit
                    else:
                        size = None                           # non-volume capacity already in the duty
                conns = ", ".join(sorted(conns_by_tag.get(tag, []))) or None
                parts_req = [name]
                # MOTOR-NAMEPLATE DISPLAY (council 2026-06-17): a motor-driven line
                # (pump/blower/compressor/fan) shows its MOTOR nameplate kW (the
                # procurable IEC frame), not the hydraulic/shaft duty — so the recirc
                # pump reads 132 kW (recirc_pump_motor_kw) not 94 kW (shaft). The shaft
                # duty is kept as a secondary note. Fires ONLY when the line already
                # shows a shaft rating AND the contract pairs it with a larger motor
                # nameplate; a no-op (byte-identical) where neither holds.
                shaft_note = None
                if duty and (duty_u or "").lower() in ("kw", ""):
                    nameplate, shaft = _motor_nameplate_kw(name, _num(duty), qcontract)
                    if nameplate is not None:
                        duty = f"{nameplate:g}"
                        duty_u = "kW"
                        shaft_note = f"{shaft:g} kW shaft"
                if duty:
                    parts_req.append(f"{duty} {duty_u or ''}".strip()
                                     + (f" motor ({shaft_note})" if shaft_note else ""))
                if size:
                    parts_req.append(size)
                if conns:
                    parts_req.append(conns)
                requirement = " · ".join(parts_req)
                # ── FULFILMENT + COST/BASIS ──
                pn = str(md.get("part_number") or "")
                mfr = str(md.get("manufacturer") or "")
                # FAMILY COHERENCE / FIELD-SWAP GUARD (2026-07-05, INV-4 reproduced fresh on
                # out/bess-campaign-v3) — an INTERNAL ACCESSORY (a "fan tray", sub-1000 W; see
                # _INTERNAL_FAN_TRAY_RE's docstring for the same corpus-mismatch family this
                # mirrors) can be authored with its PARENT ASSEMBLY's own manufacturer+part_number
                # copied onto its modifier_characters — e.g. "PCS cooling fan tray" carrying
                # part_number=SC1000UD-MV, the 1 MW PCS's OWN catalogue identity — while its
                # independently-researched partVerification (`pv_pn`, a SEPARATE per-word_id
                # lookup, never copied from the parent) correctly found a DISTINCT accessory PN
                # (A01-FAN-SC1000). Rendering the copied PN as this row's `part` string
                # (`f"{mfr} {pn}"` below) false-JOINS this row to the PARENT's partVerification in
                # the downstream cost-band check (deterministic_checks_lib._match_partverification_
                # by_mpn matches by mfr+pn SUBSTRING, not word identity) — banding an honest £28
                # accessory price against the parent's £75,000 principal price, a spurious
                # ~x2,679 under-bill FAIL. Fix at SOURCE (never mask downstream in the checker):
                # for this narrow, already-guarded shape, prefer the word's OWN independently-
                # researched partVerification identity over its (possibly copied) modifier PN
                # whenever the two disagree — the PV lookup is a fresh call per word_id and
                # cannot inherit a sibling's identity by construction, so it is the more
                # trustworthy source for exactly this family. proveCatch in `_selftest`.
                if (_INTERNAL_FAN_TRAY_RE.search(name)
                        and re.search(r"\b\d{1,3}\s*w\b", requirement, re.I)):
                    _own_pv_pn = str(pv_pn.get(wid) or "").strip()
                    if _own_pv_pn and _own_pv_pn.upper() != pn.strip().upper():
                        pn = _own_pv_pn
                # ACCESSORY IDENTITY FAMILY (see _ACCESSORY_IDENTITY_RE docstring above) —
                # a mount/bracket/tray/holder/rail/cradle/clamp word with NO rating_primary
                # duty of its own AND a cheap (< £50) independently-researched price is
                # accessory-scale; when its own researched PN disagrees with the (possibly
                # copied) modifier PN, the researched identity wins. `elif` — never double-
                # applies with the fan-tray branch above (disjoint noun shapes + duty check).
                elif _ACCESSORY_IDENTITY_RE.search(name) and not duty:
                    _own_pv_pn = str(pv_pn.get(wid) or "").strip()
                    _own_price = price.get(wid)
                    if (_own_pv_pn and _own_pv_pn.upper() != pn.strip().upper()
                            and isinstance(_own_price, (int, float))
                            and 0 < _own_price < _ACCESSORY_IDENTITY_PRICE_CEILING_GBP):
                        pn = _own_pv_pn
                # SIBLING-IDENTITY-COLLISION GUARD (see _detect_borrowed_identities
                # docstring) — the FALLBACK for noun shapes the two narrow guards above
                # don't cover (a sensor, a label, a padlock, a tape roll — never a fan
                # tray or a mount/bracket/tray/holder/rail/cradle/clamp, which stay
                # entirely on THEIR OWN scope-boundary decision, acted on or not, so an
                # already-corrected — or deliberately-declined — narrow-guard word is
                # never re-litigated here). Blank `pn` so the fulfilment branch below
                # falls through to its own honest 'NOT FOUND — requirement stated' path
                # — same price (own wid-keyed estimate, untouched), no false catalogue pin.
                _borrowed = _borrowed_identity.get(wid)
                _borrowed_from = None
                if (_borrowed and _borrowed[1] == pn.strip().upper() and _borrowed[0] == mfr.strip().lower()
                        and not _INTERNAL_FAN_TRAY_RE.search(name)
                        and not _ACCESSORY_IDENTITY_RE.search(name)):
                    _borrowed_from = f"{mfr} {pn}".strip()
                    pn = ""
                qy = int((re.search(r"\d+", str(md.get("quantity") or "1")) or re.search(r"(1)", "1")).group(0))
                # ── FIELD INSTRUMENT (synthesizeInstrumentation #140): a level / temp /
                # pressure / DO / pH / conductivity transmitter measuring a contract-declared
                # control variable. Catalogue-class budget; priced from its installed-cost
                # estimate, qty = per-vessel count. Its own clean line — not bespoke/NOT-FOUND.
                if w.get("_instrument"):
                    igbp = _child_price(w)
                    nlow = name.lower()
                    itag = ("LT" if "level" in nlow else "TT" if "temperature" in nlow
                            else "PT" if "pressure" in nlow else "FT" if "flow" in nlow
                            else "AT")   # ISA-5.1 instrument tag (analysers → AT)
                    itag = _canon_tag(w, itag)   # numbered canonical tag — same as the drawings
                    ibasis = "installed instrument — catalogue-class budget"
                    # STATED QTY BASIS (gate-36 round 2, 2026-07-03): the per-vessel count is
                    # deliberate engineering (synthesizeInstrumentation: a contract-declared
                    # control variable is measured on EVERY vessel that holds it — a tank's
                    # level/pressure cannot be inferred from a neighbour's), not over-provision.
                    # State the rule + the vessel roster ON the line so a reader (the benchmark
                    # net's "17 transmitters for ~15 tanks — reduce to 8-10" included) sees the
                    # one-per-vessel basis instead of an unexplained count.
                    if qy > 1:
                        vloc = str(md.get("vessel_location") or "").strip()
                        ibasis += (f" · qty {qy} = one per monitored vessel (a contract-declared "
                                   f"control variable is measured on EVERY vessel that holds it — "
                                   f"stated engineering rule)")
                        if vloc:
                            ibasis += f"; locations: {vloc[:180]}"
                    rows.append({"tag": itag, "requirement": requirement, "status": "INSTRUMENT",
                                 "part": "field instrument (catalogue class)", "qty": qy,
                                 "unit_gbp": round(igbp), "line_gbp": round(igbp * qy),
                                 "basis": ibasis})
                    continue
                # ── FINAL CONTROL ELEMENT (synthesizeActuation #141): a flow control valve
                # or aeration blower sized from the contract. Catalogue-class budget. ──
                if w.get("_actuator"):
                    agbp = _child_price(w)
                    abasis = "installed actuator — catalogue-class budget"
                    # rated kit (aeration blower / fan) → ground to the market £/kW
                    # curve in BOTH directions (the £923/kW 11 kW blower over-count
                    # and any £0 stamp). No-op for an unrated valve.
                    agbp, abasis = _reconcile_rated_price(name, md, agbp, abasis, requirement)
                    # PROCESS-SYSTEM / blower floor (RAS audit 2026-06-19) — a token
                    # blower (£25) is lifted to its duty-scaled class floor. No-op once
                    # the rating reconciliation above already set a band price.
                    pf = _price_floor_for(name, md)
                    if pf and agbp < pf:
                        agbp = pf
                        abasis = abasis + " · floored to min credible process price"
                    # CONTROL-ELEMENT class budget (RAS audit 2026-06-19) — a final
                    # control element (a modulating / DN400 / on-off valve or actuator)
                    # must NEVER cost £0: the synthesis stamped no price on the DN400
                    # modulating control valve → £0. Apply the catalogue-class budget as
                    # the last resort BEFORE a £0 actuator line is emitted.
                    ceb = _control_element_budget(name)
                    if ceb and agbp < ceb:
                        agbp = ceb
                        abasis = abasis + " · control-element catalogue-class budget (no stamped price)"
                    nlow = name.lower()
                    atag = ("FCV" if "valve" in nlow else "B" if "blower" in nlow
                            else "FE" if "fan" in nlow else "Y")   # ISA: control valve / blower
                    atag = _canon_tag(w, atag)   # numbered canonical tag — same as the drawings
                    rows.append({"tag": atag, "requirement": requirement, "status": "ACTUATOR",
                                 "part": "final control element (catalogue class)", "qty": qy,
                                 "unit_gbp": round(agbp), "line_gbp": round(agbp * qy),
                                 "basis": abasis})
                    continue
                # ── BALANCE-OF-PLANT utility / safety system (synthesizeUtilitySafety #142):
                # standby generator, make-up water, bleed/drain, ventilation. Priced as a
                # whole skid from its contract-duty estimate. ──
                if w.get("_utility"):
                    ugbp = _child_price(w)
                    ubasis = "installed BoP system — catalogue-class budget"
                    # rated kit (standby genset @ kVA, UPS @ kVA) → ground to the
                    # market £/kVA curve (the £293/kVA genset over-count). No-op for
                    # an unrated make-up/bleed skid.
                    ugbp, ubasis = _reconcile_rated_price(name, md, ugbp, ubasis, requirement)
                    nlow = name.lower()
                    utag = ("G" if "generator" in nlow else "P" if ("make-up" in nlow or "make up" in nlow)
                            else "DV" if ("bleed" in nlow or "drain" in nlow) else "AHU" if "ventil" in nlow else "U")
                    utag = _canon_tag(w, utag)   # numbered canonical tag — same as the drawings
                    rows.append({"tag": utag, "requirement": requirement, "status": "UTILITY",
                                 "part": "balance-of-plant system (catalogue class)", "qty": qy,
                                 "unit_gbp": round(ugbp), "line_gbp": round(ugbp * qy),
                                 "basis": ubasis})
                    continue
                # ── PROCESS-SUPPORT system (synthesizeProcessSystems #143): dosing, feed,
                # LOX, sludge handling, SCADA, grading. Priced whole from its contract duty. ──
                if w.get("_process"):
                    pgbp = _child_price(w)
                    # STATED PRICE BASIS (gate-36 round 2): a process-support system whose
                    # synthesis stamped a `price_basis` modifier (e.g. SCADA: £60k base +
                    # £50/kW, supply+install scope) carries THAT auditable derivation as
                    # the line basis. A word from an earlier state (no price_basis yet)
                    # states its scope from its own `form` modifier instead — the £ is a
                    # WHOLE-SYSTEM supply+install budget and the line must say what that
                    # covers (the SCADA £62,650 read as an unexplained outlier).
                    pbasis = str(md.get("price_basis") or "").strip()
                    if not pbasis:
                        pbasis = "installed process system — catalogue-class budget"
                        _pform = str(md.get("form") or "").strip()
                        if _pform:
                            pbasis += (" (whole-system supply+install scope: "
                                       f"{_pform[:150]}{'…' if len(_pform) > 150 else ''})")
                    # a process-support skid with a kW/kVA rating (e.g. a pumped LOX
                    # vaporiser, a chilled-water skid) → ground to the market curve.
                    # No-op for an unrated dosing/feed/SCADA system.
                    pgbp, pbasis = _reconcile_rated_price(name, md, pgbp, pbasis, requirement)
                    # PROCESS-SYSTEM minimum-credible floor (RAS audit 2026-06-19) — a
                    # token-priced dosing / feed-storage / sludge / grading / O₂ system
                    # is lifted to its category floor (chemical-dosing £3k, feed/storage
                    # £5k, sludge/solids £8k, grading/harvest £6k, O₂ £1.5k). No-op when
                    # the synthesis already stamped a credible installed-cost estimate.
                    pf = _price_floor_for(name, md)
                    if pf and pgbp < pf:
                        pgbp = pf
                        pbasis = pbasis + " · floored to min credible process price"
                    nlow = name.lower()
                    # Prefer the parts-manifest ISA tag (what the GA / P&ID / line-list
                    # draw — X-104 / EP-101 / TK-106 / Z-101) so the BoM and the drawings
                    # carry ONE tag per part (Tristan 2026-06-21). The mnemonic
                    # (DOS/FD/LOX/…) is only a fallback for a system not drawn as geometry.
                    ptag = tag if tag and tag != "—" else (
                            "DOS" if "dosing" in nlow else "FD" if "feed" in nlow
                            else "LOX" if ("oxygen" in nlow or "lox" in nlow) else "SLU" if "sludge" in nlow
                            else "SCADA" if "scada" in nlow else "GR" if ("grading" in nlow or "harvest" in nlow)
                            else "MED" if ("media" in nlow or "carrier" in nlow) else "SYS")
                    rows.append({"tag": ptag, "requirement": requirement, "status": "SYSTEM",
                                 "part": "process-support system (catalogue class)", "qty": qy,
                                 "unit_gbp": round(pgbp), "line_gbp": round(pgbp * qy),
                                 "basis": pbasis})
                    continue
                # ── BUILDING-STRUCTURE take-off (synthesizeBuildingStructure #145): the hall
                # that houses the plant — reinforced floor slab, steel portal frame, insulated
                # wall + roof cladding, foundations, doors. Priced PARAMETRICALLY from the
                # derived building footprint / wall / roof areas (the price_estimate_gbp the
                # synthesis stamped, £/m² UK 2026). Its own CIVIL line, like the BoP / process
                # systems above — NOT a bespoke process vessel or a NOT-FOUND catalogue part. ──
                if w.get("_structure"):
                    bgbp = _child_price(w)
                    nlow = name.lower()
                    # Prefer the parts-manifest ISA tag (drawing-consistent) over the civil
                    # mnemonic, same as the SYSTEM branch — one tag per part across BoM + drawings.
                    btag = tag if tag and tag != "—" else (
                            "SLB" if "slab" in nlow else "FRM" if ("frame" in nlow or "portal" in nlow)
                            else "WAL" if "wall" in nlow else "ROF" if "roof" in nlow
                            else "FND" if ("foundation" in nlow or "ground" in nlow)
                            else "DR" if "door" in nlow else "BLD")
                    rows.append({"tag": btag, "requirement": requirement, "status": "BUILDING",
                                 "part": "building / civil works (parametric take-off)", "qty": qy,
                                 "unit_gbp": round(bgbp), "line_gbp": round(bgbp * qy),
                                 "basis": "building element — parametric £/m² take-off from the housed-equipment footprint"})
                    continue
                bc = _bespoke_class(name)   # 'strong' (process vessel) | 'simple' (shell) | 'none'
                mt_spec = None
                g_lookup = geom_by_name.get(re.sub(r"\s+\d+$", "", name).strip().lower())
                # ── TYPED SERVICE FIRST (Phase 0 — council 2026-06-17, the £42.36M bug) ──
                # Read the TYPED `service` the synthesis emitted from the part's DRIVER
                # PHYSICS, and let it decide the fabrication kind BEFORE the noun heuristic.
                # A STRUCTURAL / building part is priced as structural tonnage / £-per-m² of
                # footprint (the SAME basis as the Steel Portal Frame) — NEVER a hoop-stress
                # pressure shell. The noun-regex (_bespoke_class / is_open) survives only as
                # the FALLBACK when no typed service is present (legacy archetypes), so CO₂ /
                # SAF / BESS — whose fluid vessels carry fluid+pressure service → still take
                # the shell branch — are unchanged. The typed `service` is ALSO threaded into
                # every _materials_takeoff() call so its plausibility invariant always fires.
                svc = _read_service(md)
                svc_fam = svc.get("fabrication_family") if svc else None
                # ── MEMBRANE/MEDIA FAMILY FIRST (2026-07-02): a membrane element /
                # bank / housing / filter-media line prices from its MEMBRANE AREA
                # (or an honest class-basis TBD) — NEVER the structural-steel or
                # shell take-off the typed service / noun would otherwise route it
                # to (the v55 £122k membrane-as-steel bill, 16% of the total). ──
                if _MEMBRANE_MEDIA_RE.search(name):
                    mem = _membrane_area_price(name, md)
                    if _membrane_pin_is_real(pn, wid, curve_only):
                        # a REAL pin keeps its IDENTITY; the PRICE still comes from the
                        # area parametric unless a real distributor price exists — see
                        # `_membrane_pin_is_real` for the type-coherence rule.
                        status, part = "IDENTIFIED", f"{mfr} {pn}".strip()
                        mt_spec = {"material": "membrane/filtration media"}
                        dpv = dist_price.get(wid)
                        if dpv and dpv > 0:
                            gbp, basis = dpv, (f"catalogue · real pinned part {mfr!s} {pn!r} "
                                               "(distributor price)")
                        elif mem:
                            gbp, basis = mem[0], (f"catalogue · real pinned part {mfr!s} {pn!r} "
                                                   f"(identity) · price from membrane-area "
                                                   f"parametric: {mem[1]}")
                        else:
                            pv = price.get(wid, 0.0)
                            gbp = pv if pv > 0 else 0.0
                            basis = (f"catalogue · real pinned part {mfr!s} {pn!r} (identity); "
                                     "no membrane-area driver for a parametric price — the "
                                     "part's own verified price is used")
                    elif mem:
                        status, part = "NOT FOUND", "requirement stated — membrane-area parametric"
                        gbp, basis = mem
                        mt_spec = {"material": "membrane/filtration media"}
                    else:
                        pv = price.get(wid, 0.0)
                        status, part = "NOT FOUND", "requirement stated"
                        gbp = pv if pv > 0 else 0.0
                        basis = ("membrane/filtration-media class — vendor quote TBD "
                                 "(no membrane-area driver; excluded from steel take-off)")
                elif svc_fam in _STRUCTURAL_FAMILIES:
                    # structural / building frame — price on footprint, not a pressure shell.
                    pv = price.get(wid, 0.0)
                    st = _structural_takeoff(name, md, g_lookup)
                    if st:
                        status, part = "BESPOKE", "made to spec (structural)"
                        gbp, basis, mt_spec = st[0], st[1], (st[2] if len(st) > 2 else None)
                    elif pv > 0:
                        status, part = "BESPOKE", "made to spec (structural)"
                        gbp, basis = pv, "made-to-spec · structural budget estimate"
                        # MATERIAL (v56c ledger fix, 2026-07-03): a budget-estimated
                        # structural part is still a PHYSICAL fabricated part — state its
                        # material from the part's OWN name tokens ('Sst304 Skid Frame' →
                        # 304 stainless; 'Painted Steel Skid Frame' → painted carbon
                        # steel), defaulting to structural carbon steel. The X-134/X-135
                        # skid frames shipped material-less because this branch (unlike
                        # the take-off branch) emitted no mt_spec.
                        mt_spec = {"material": _structural_material_from_name(name)}
                    else:
                        # device-scale enclosure skin — priced from the contract's OWN
                        # enclosure volume before falling to the £0/commodity floor
                        # (run-13 ledger: £3 material-less 'Outdoor Cabinet Enclosure').
                        _skin = _enclosure_skin_takeoff(name, qcontract)
                        if _skin:
                            status, part = "BESPOKE", "made to spec (structural)"
                            gbp, basis, mt_spec = _skin
                        else:
                            status, part = "NOT FOUND", "requirement stated — structural"
                            gbp, basis = 0.0, "structural element — footprint take-off (no footprint driver; confidence low)"
                            # still a PHYSICAL part — its material column must never
                            # be blank (BoM Ledger column contract).
                            mt_spec = {"material": _structural_material_from_name(name)}
                elif bc == "strong":
                    # complex fabricated process vessel — bespoke regardless of any pinned
                    # PN; cost is the engineering budget estimate, NOT a shell take-off
                    # (which would undercount a reactor/column by orders of magnitude).
                    status, part = "BESPOKE", "made to spec"
                    pv = price.get(wid, 0.0)
                    if pv > 0:
                        gbp, basis = pv, "made-to-spec · engineering budget estimate"
                    else:
                        mt = _materials_takeoff(name, md, g_lookup, svc)
                        gbp, basis = (mt[0], mt[1]) if mt else (0.0, "bottom-up parametric")
                        mt_spec = mt[2] if mt and len(mt) > 2 else None
                elif pn and not _TBD_RE.search(pn) and not (
                        bc == "simple" and curve_only.get(wid)
                        and _is_bespoke_shell_head_noun(name)
                        and (_bespoke_shell_vol_m3(g_lookup, md) or 0.0) >= _MIN_BESPOKE_SHELL_VOL_M3):
                    status, part = "IDENTIFIED", f"{mfr} {pn}".strip()
                    gbp, basis = price.get(wid, 0.0), "catalogue"
                    # BATTERY CELL — the DOMINANT BESS cost. ALWAYS price from its ENERGY (the
                    # grounded, commoditised truth: Ah × V × £/kWh_cell); a catalogue/list stamp
                    # for a cell is an unreliable LLM estimate (rendered £0 here, £100 there for the
                    # same £40 cell). A real distributor hit (gate-21 below) can still override.
                    _cell = _battery_cell_price(name, md)
                    if _cell and _cell[0] > 0:
                        gbp, basis = _cell[0], _cell[1]
                    elif gbp <= 0:
                        # UNIVERSAL DB-FIRST (Tristan 2026-06-25): the catalogue (exact MPN) missed,
                        # so resolve the price from the DB by component NOUN + SPEC before any list
                        # stamp — the same data path that prices the cell, for every spec'd part.
                        _dbp = _db_spec_price(name, md)
                        if _dbp and _dbp[0] > 0:
                            gbp, basis = round(_dbp[0], 2), f"real DB median of {_dbp[1]} comparable {_dbp[3]} '{_dbp[2]}' parts (forge-truth.db)"
                        else:
                            _lp = _num(md.get("list_price_gbp"))
                            if _lp and _lp > 0:
                                gbp, basis = _lp, "catalogue · manufacturer list price"
                    # GATE-21 PRICE FEEDBACK (council 2026-06-16): when the cheapest
                    # real distributor price diverges > 5× from the rendered estimate,
                    # prefer the distributor price (TI TMP451 £900→£1.40 class).
                    dpv = dist_price.get(wid)
                    if dpv and gbp > 0 and (gbp / dpv > 5.0 or dpv / gbp > 5.0):
                        gbp, basis = dpv, "catalogue · cheapest distributor (gate-21 >5× correction)"
                    # P1-D UV (2026-07-09): an IDENTIFIED UV/ozone MPN whose catalogue
                    # price is ≪ the duty-rated parametric (Spektron 30e £280 on a
                    # 225 m³/h / 10.1 kW plant duty → ~£26k) is undersized for the
                    # duty — same discipline as undersized rotating-equipment MPN
                    # rejection. Lift to the UV parametric and drop the wrong pin.
                    if re.search(r"\buv\b|ultraviolet|ozone|disinfect|steril", name or "", re.I):
                        uop_uv = _unit_operation_price(name, md, qcontract)
                        if (uop_uv and uop_uv[0] > 0
                                and (gbp <= 0 or uop_uv[0] >= max(gbp, 1e-9) * COST_BAND_FACTOR)):
                            _pre_uv = gbp
                            status = "NOT FOUND"
                            part = "requirement stated — parametric"
                            gbp, basis = uop_uv[0], (
                                uop_uv[1] + f" · named part {pn!r} rejected: catalogue "
                                f"reference £{_pre_uv:,.0f} is "
                                f"{uop_uv[0] / max(_pre_uv, 1e-9):.0f}× below the "
                                f"duty-rated UV/ozone skid (undersized for the duty)"
                            )
                    # P1-D MEDIA-BED (2026-07-09, codema V-101): an IDENTIFIED GAC /
                    # softener / adsorber MPN whose catalogue stub (£105 HP-1000 media
                    # bag) is ≪ the duty-rated vessel parametric (~£14.7k at 14.5 m³/h)
                    # is the SAME underbill family as Spektron — reject the pin and
                    # lift to the media-bed parametric. Universal: noun-keyed.
                    elif re.search(
                        r"\bgac\b|granular.?activ|activated.?carbon|media.?bed|"
                        r"\bsoftener\b|adsorber|polisher|ion.?exchange|carbon.?filter",
                        name or "", re.I,
                    ):
                        uop_mb = _unit_operation_price(name, md, qcontract)
                        if (uop_mb and uop_mb[0] > 0
                                and (gbp <= 0 or uop_mb[0] >= max(gbp, 1e-9) * COST_BAND_FACTOR)):
                            _pre_mb = gbp
                            status = "NOT FOUND"
                            part = "requirement stated — parametric"
                            gbp, basis = uop_mb[0], (
                                uop_mb[1] + f" · named part {pn!r} rejected: catalogue "
                                f"reference £{_pre_mb:,.0f} is "
                                f"{uop_mb[0] / max(_pre_mb, 1e-9):.0f}× below the "
                                f"duty-rated media-bed vessel (media bag / stub pin, "
                                f"not the packaged filter)"
                            )
                elif bc == "simple":
                    mt = _materials_takeoff(name, md, g_lookup, svc)
                    status, part = "BESPOKE", "made to spec"
                    gbp, basis = (mt[0], mt[1]) if mt else (price.get(wid, 0.0), "bottom-up parametric")
                    mt_spec = mt[2] if mt and len(mt) > 2 else None
                    # TYPE-COHERENCE (2026-07-03, codema v65 I-106): a pinned MPN was
                    # REJECTED above because it was priced ONLY by Engine B's small-parts
                    # commodity curve (no ComponentClass exists for a bespoke fabricated
                    # shell — the head-noun family of the price SOURCE never matched the
                    # word, same discipline as dbHitAcceptableForWord for a DB MPN pin).
                    # Say so on the line rather than silently dropping the pin.
                    if (pn and not _TBD_RE.search(pn) and curve_only.get(wid)
                            and _is_bespoke_shell_head_noun(name)
                            and (_bespoke_shell_vol_m3(g_lookup, md) or 0.0) >= _MIN_BESPOKE_SHELL_VOL_M3
                            and mt):
                        basis = (basis + f" · named part {mfr!s} {pn!r} rejected: Engine "
                                 f"B priced it £{price.get(wid, 0.0):,.0f} via its small-parts "
                                 f"commodity curve — no catalogue class exists for a bespoke "
                                 f"fabricated tank/vessel shell; a materials take-off is used instead")
                else:
                    # NOT FOUND — no pinned catalogue part. Before falling back to a
                    # flat verification-stub, try a per-UNIT-OPERATION parametric keyed
                    # to the carried duty (council 2026-06-16, kills the £12,300 copy-
                    # paste stub shared by UV / oxygenation / skimmer / heat-exchanger).
                    uop = _unit_operation_price(name, md, qcontract)
                    if uop:
                        status, part = "NOT FOUND", "requirement stated — parametric"
                        gbp, basis = uop
                    else:
                        status, part = "NOT FOUND", "requirement stated"
                        gbp, basis = price.get(wid, 0.0), "bottom-up parametric"
                        # if there is genuinely no model AND no real price, label it a
                        # VISIBLE budget allowance rather than a silent £0/identical stub.
                        if gbp <= 0:
                            basis = "budget allowance — vendor TBD (no parametric model; confidence low)"
                # MINIMUM-CREDIBLE-PRICE FLOOR (council 2026-06-16; PROCESS systems +
                # duty scaling added 2026-06-19, the RAS £5M audit): a power/control
                # catalogue component must not render at £1-£3 from a stray estimate,
                # and (RAS audit) a PROCESS system / blower / immersion heater must not
                # render at a token price either. Apply the floor only when there is no
                # real distributor price for it. `_price_floor_for(name, md)` matches
                # electrical-component nouns AND the new process-system categories AND a
                # >100 kW backup immersion heater (its kW comes from `md`); a real
                # fabricated process vessel matches none of these, so it is untouched.
                floor = _price_floor_for(name, md)
                if floor and wid not in dist_price and 0 <= gbp < floor:
                    gbp = floor
                    if status == "BESPOKE":   # it was an electrical/process part, not a vessel
                        status, part = "NOT FOUND", "requirement stated"
                    basis = (basis + " · floored to min credible price"
                             if "floored" not in basis else basis)
                # ── ACTUATED-VALVE ASSEMBLY FAMILY (benchmark net v56, 2026-07-02): a valve
                # noun carrying an ACTUATION qualifier (pneumatic/electric/motorised/actuated/
                # automated) is an actuator+valve ASSEMBLY — price it from the actuated-valve
                # family (£80 base + £1.85/DN·mm, DN65 assumed), NEVER the bare-valve band
                # (the 200× "Pneumatic Actuated Valves" @ £25 bug — a £5k line for £40k of
                # kit). LIFT-only with a re-based explicit basis; a line with a real
                # distributor price is never overridden.
                av = _actuated_valve_assembly_price(name, requirement)
                if av and wid not in dist_price and gbp < av[0]:
                    gbp, basis = av[0], av[1]
                    if status == "BESPOKE":
                        status, part = "NOT FOUND", "requirement stated"
                # ── BARE PNEUMATIC-ACTUATOR COMPONENT BAND (benchmark net v56, 2026-07-02):
                # a pneumatic (air) actuator priced SEPARATELY from its valve is a £30–40
                # component — clamp any stray estimate into the band (the standalone leg of
                # the £329 over-bill; the corpus-lift leg is guarded at the lift site, and a
                # line that duplicates an actuated-valve assembly population is folded to £0
                # by _dedupe_actuator_assembly_rows).
                pab = _pneumatic_actuator_band(name, gbp)
                if pab and wid not in dist_price:
                    gbp = pab[0]
                    basis = basis + pab[1]
                # PACK-INTERNAL MICRO-COMMODITY CEILING (2026-06-24): a cell tap/sense wire or
                # insulation pad priced from a catalogue REEL/SHEET (£59 reel, £40 sheet) and
                # applied per-cell ×3,750 is a pack-size error. Cap the per-unit at the material
                # band — a wire/pad consumable at £2.5, a stamped metal bar at £15. Universal;
                # only the pack micro-commodity nouns match (a distribution busbar is untouched).
                _micro_band = _pack_micro_band(name or "")
                if _micro_band is not None and gbp > _micro_band[1]:
                    gbp = _micro_band[1]
                    basis = (basis + " · capped to pack micro-commodity ceiling"
                             if "micro-commodity ceiling" not in basis else basis)
                # SMALL-HEATER £/W CEILING (2026-06-24, BESS punch-list): a PTC / anti-condensation
                # / rack / panel / trace heater rated in WATTS (not kW) is a small resistive part
                # (~£0.3-0.6/W); a gate-21 distributor datum of £1,500 for a 250 W PTC rack heater is
                # a wrong catalogue price. Cap a sub-2 kW heater at £0.6/W (min £30). Excludes the
                # immersion / backup / process heaters (kW-scale, priced on their own duty floor).
                if re.search(r"\bheater\b", name, re.I) and not re.search(
                        r"immersion|backup|process|duct|inline|booster|jacket|reboil", name, re.I):
                    _wm = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*w\b",
                                    f"{requirement} {md.get('capacity') or ''} {md.get('rating_primary') or ''}", re.I)
                    _watt = float(_wm.group(1).replace(",", "")) if _wm else None
                    if _watt and _watt <= 2000:
                        _hcap = max(30.0, _watt * 0.6)
                        if gbp > _hcap:
                            gbp = _hcap
                            basis = basis + f" · capped to small-heater £0.6/W ceiling ({_watt:.0f} W)"
                # CONTROL-ELEMENT class budget (RAS audit 2026-06-19) — a final control
                # element (a modulating / DN400 / on-off process valve or actuator)
                # reaching this point with £0 (the synthesis stamped no price and it is
                # not on the _actuator fast-path) is given its catalogue-class budget so
                # it NEVER costs £0. Last resort, only when still ≤ £0 after the floor.
                if gbp <= 0 and wid not in dist_price:
                    ceb = _control_element_budget(name)
                    if ceb:
                        gbp = ceb
                        if status == "BESPOKE":
                            status, part = "NOT FOUND", "requirement stated"
                        basis = "control-element catalogue-class budget (no stamped price)"
                # ── COMMODITY CATALOGUE CAP (council 2026-06-16/17): a commodity
                # electronic/IC/cable/fastener/small-instrument line with a structured
                # catalogue PN must never exceed 3× its catalogue/distributor price
                # (TMP451 £692→£1.40·3, MSP430, StarTech patch cable, Honeywell DP
                # switch). Only fires on a commodity NOUN + structured PN + a known
                # catalogue price — a bare descriptor with no catalogue match is left
                # to the rating model / floor, never a fixed inflated number.
                # The structured PN is taken from the word modifier, OR (when that is
                # absent/TBD) from the partVerification's OWN MPN — a mis-PINNED line
                # (e.g. "Network Switch" whose partVerif MPN is the MSP430 micro-
                # controller) often carries the real SKU only in partVerifications. ──
                cap_pn = pn if _is_structured_pn(pn) else (pv_pn.get(wid) or pn)
                capped_gbp, cap_basis = _commodity_catalogue_cap(name, cap_pn, gbp, dist_price.get(wid))
                if cap_basis is not None:
                    gbp, basis = capped_gbp, basis + " · " + cap_basis
                # ── BARE-COMMODITY HARD CEILING (council 2026-06-17): a commodity
                # IC / sensor IC / microcontroller / connector / cable / I/O / small
                # comms line with NO kW/duty rating cannot exceed its sub-class ceiling
                # — the safety net for a mis-PIN whose catalogue price never resolved
                # (a temp IC labelled "Network Switch" can't reach £752; a Honeywell
                # MEMS DP-switch can't reach £9,406). A genuine rated instrument is
                # exempt. Universal: keyed off the commodity NOUN, no per-class table. ──
                ceil_gbp, ceil_basis = _apply_commodity_ceiling(name, md, gbp, requirement)
                if ceil_basis is not None:
                    gbp, basis = ceil_gbp, basis + " · " + ceil_basis
                # ── UNIVERSAL RATING-BASED RECONCILIATION (council 2026-06-16/17):
                # any power-rated equipment line (pump/motor/VSD/blower/heat-pump/
                # compressor/chiller/fan/genset/UPS …) whose price is absent, £0, or
                # outside the market £/kW(/kVA) band is grounded to the rating-model
                # mid — the both-directions fix (a £35 94-kW pump UP, a £293/kVA genset
                # DOWN). No-op for a line whose noun matches no rating model, so a
                # vessel/instrument/cable is untouched. Skip a strong-bespoke process
                # vessel (engineering-budget basis, not £/kW kit). ──
                if bc != "strong":
                    # Capture the NAMED part's own price + identity BEFORE the rating
                    # reconciliation grounds it, so we can detect an UNDERSIZED named
                    # MPN: a catalogue part whose own reference price is grossly below
                    # the duty-rated price (the Grundfos UP15-42 domestic circulator
                    # named for a 97 kW / 1,670 m³/h recirculation pump → its £2,024
                    # estimate vs the £67,900 rating-based price = 33.5×).
                    pre_gbp, pre_status = gbp, status
                    gbp, basis = _reconcile_rated_price(name, md, gbp, basis, requirement,
                                                        q=qcontract)
                    # AUDITABLE CLASS-REFERENCE BUDGET (RAS audit 2026-06-19): for a
                    # mechanical-equipment line (heat pump / compressor / chiller /
                    # blower), make a large price EXPLICIT — scaled from a class-
                    # reference base by (duty_kw/ref_kw)^0.6 (the six-tenths rule) — so
                    # e.g. a 1,493 kW heat pump reads '£6,000 × (1493/5)^0.6 = £28,617',
                    # not an unexplained outlier. Only ever RAISES + re-bases the price
                    # (never lowers it): adopt when the class-reference budget ≥ the
                    # current price. No-op for a noun outside the reference set.
                    _kw_cb, _is_kva_cb = _rating_kw(md, name, requirement)
                    if _kw_cb and not _is_kva_cb:
                        csb = _duty_scaled_class_budget(name, _kw_cb)
                        if csb and csb[0] > gbp:   # LIFT-only (never lower a price)
                            gbp, basis = csb[0], csb[1]
                    # UNIVERSAL UNDERSIZED-MPN REJECTION: when a power-rated rotating-
                    # equipment line was grounded UP from a far-lower named-part price,
                    # the named catalogue part cannot meet the duty — presenting it
                    # would make the BoM contradict itself (a 50 W circulator priced as
                    # a 97 kW pump). Strip the wrong MPN and relabel the line as the
                    # duty-rated parametric the engine already correctly priced; the
                    # named part no longer lies about the duty. Deterministic + class-
                    # agnostic: keyed off the rating mismatch, not any class table.
                    if (pre_status == "IDENTIFIED"
                            and _is_rotating_equipment_noun(name)
                            and pre_gbp and pre_gbp > 0
                            and gbp >= pre_gbp * COST_BAND_FACTOR):
                        status = "NOT FOUND"
                        part = "requirement stated — rating-based parametric"
                        basis = (basis + f" · named part {pn!r} rejected: catalogue "
                                 f"reference £{pre_gbp:,.0f} is "
                                 f"{gbp / pre_gbp:.0f}× below the duty-rated price "
                                 f"(undersized for the duty)")
                # ── ZERO-PRICE COMMODITY FLOOR (2026-06-25; RENDERS-£0 extension
                # 2026-07-03): FINAL guard — no priced principal/IDENTIFIED line may emit
                # unit £0. A real commodity MPN (Klauke cable lug, Vishay capacitor,
                # Schaffner line filter, Trelleborg gasket, Brady labels) that missed the
                # catalogue, the DB-spec resolver and the list price reaches here at £0 —
                # every part costs SOMETHING. v56c ROW-FAIL family: a stray SUB-£0.50
                # estimate (Terminal Blocks @ £0.11) is just as bad — the emitted row
                # rounds it to unit £0, failing the ledger column contract ('unit £
                # missing/zero'). So the floor fires whenever the price would RENDER as
                # £0 (round(gbp) == 0), keyed off the commodity class token (terminal →
                # £2, gland → £5, generic → £3). A PACK-MICRO consumable (tap wire /
                # insulation pad, deliberate £0.3-2.5 band) keeps its band — only a true
                # £0 lifts, to the band FLOOR, never the commodity floor above its
                # ceiling. Skips a SUB-COMPONENT (its £ lives in the parent's breakdown,
                # line_gbp=0) and a BUILDING/structural line (handled on its own path).
                # BOUNDARY FIX (2026-07-05, the DS-101 £0 deflagration-vent-seal miss):
                # the guard's own comment states the intent as 'round(gbp) == 0', but the
                # implemented test was `gbp <= 0 or (gbp < 0.5 and …)` — a STRICT `< 0.5`
                # never catches gbp EXACTLY 0.5, yet Python's round(0.5) == 0 (round-half-
                # to-even) renders it as unit £0 regardless. DS-101 priced at £0.50 slipped
                # through both clauses and shipped a £0 line. Test round(gbp) directly for
                # a non-pack-micro line (matches the stated intent exactly); a pack-micro
                # consumable keeps its narrower 'only a TRUE £0' exemption unchanged. ──
                _is_pack_micro = _pack_micro_band(name or "") is not None
                _renders_zero = (gbp <= 0) if _is_pack_micro else (round(gbp) <= 0)
                if status not in ("SUB-COMPONENT", "BUILDING") and _renders_zero:
                    _cf, _cnoun = _commodity_zero_floor(name)
                    # ×5 SELF-CONSISTENCY (2026-07-11 run 59: a REAL £0.14 catalogue
                    # estimate floored to the £3 noun floor tripped the engine's own
                    # per-line ×5 price invariant — the floor manufactured the very
                    # wrongness the invariant polices). A line with a KNOWN sub-£0.5
                    # price keeps within ×3 of its truth (still non-zero-rendering at
                    # 2 dp); only a genuinely price-less line takes the full noun floor.
                    if gbp > 0:
                        _cf = min(_cf, max(round(gbp * 3.0, 2), 0.5))
                    _why = "no DB price" if gbp <= 0 else f"estimate £{gbp:.2f} renders £0 at integer display"
                    gbp = _cf
                    basis = (basis + f" · commodity-floor ({_why}; '{_cnoun}' → £{_cf:g})"
                             if "commodity-floor" not in basis else basis)
                # SIBLING-IDENTITY-COLLISION disclosure (see _detect_borrowed_identities
                # docstring) — state plainly why this line carries no catalogue pin even
                # though the design DOES name a manufacturer: the identity it would have
                # shown was a different, verified sibling part's SKU, not this part's own.
                if _borrowed_from:
                    basis = (basis + f" · MPN unresolved — {mfr or 'the manufacturer'} "
                             f"is correct but the specific part number is not; the "
                             f"identity this line would otherwise show ({_borrowed_from}) "
                             f"belongs to a different, verified sibling part in the same "
                             f"sub-system and is not this component's true SKU, so this "
                             f"line is priced from its own independent estimate rather "
                             f"than pinned to that catalogue reference")
                row = {"tag": tag, "requirement": requirement, "status": status,
                       "part": part, "qty": qy, "unit_gbp": round(gbp), "line_gbp": round(gbp * qy),
                       "basis": basis}
                if mt_spec:
                    row.update(mt_spec)   # material · wall_mm · mass_kg · diameter_m · height_m
                # WETTED-PARTS CORROSION: a wetted catalogue/parametric part (pump/valve/pipe/HEX/
                # filter) in a corrosive plant carries an explicit material of construction — shells
                # already got one via mt_spec. Universal — keyed on fluid corrosivity + the noun.
                if not row.get("material"):
                    _moc = _wetted_moc(name, requirement)
                    if _moc:
                        row["material"] = _moc
                        # honest provenance: a part-declared material is "as specified";
                        # only a plant-default MoC cites the plant fluid service.
                        if _moc != _PLANT_MOC:
                            row["basis"] = (f"{row.get('basis','')} · MoC: {_moc} "
                                            f"(part-specified material; {_PLANT_CORROSION})")
                        else:
                            row["basis"] = f"{row.get('basis','')} · MoC: {_moc} for {_PLANT_CORROSION}"
                rows.append(row)
                # ── itemise the ASSEMBLY BREAKDOWN beneath the parent: one row per
                # physics-sized sub-component, scaled to SUM to the parent's line cost.
                # line_gbp stays 0 (grand total unchanged); breakdown_gbp carries the £. ──
                kids = kids_by_parent.get(wid, [])
                if kids:
                    # raw child weight = its stamped price_estimate_gbp, BUT if that is
                    # £0 and the child is itself rated kit (a 107 kW drive motor, a VSD,
                    # a compressor), use the rating-model mid as its weight so the
                    # proportional split has a real basis and the displayed breakdown
                    # isn't £0 for a major rated sub-component (council 'motors at £0').
                    def _child_weight(ck):
                        ckn = ck.get("name_human") or ""
                        ckwid = str(ck.get("id") or "")
                        ckpn = next((x.get("value") for x in (ck.get("modifier_characters") or [])
                                     if x.get("kind") == "part_number"), "")
                        rp0 = _child_price(ck)
                        # COMMODITY sub-component (IC / cable / small instrument with a
                        # structured PN + a known catalogue price): cap its displayed
                        # breakdown at ≤3× catalogue so a TMP451 doesn't show £900 in
                        # the breakdown when catalogue is £1.40 (council 494× finding).
                        capped, cb = _commodity_catalogue_cap(ckn, str(ckpn), rp0, dist_price.get(ckwid))
                        if cb is not None:
                            return capped
                        if rp0 > 0:
                            return rp0
                        ckmd = {"rating_primary": next(
                            (x.get("value") for x in (ck.get("modifier_characters") or [])
                             if x.get("kind") == "rating_primary"), None)}
                        ckw, ck_kva = _rating_kw(ckmd, ckn)
                        rm = _rated_equipment_cost(ckn, ckw, ck_kva) if ckw else None
                        return rm[0] if rm else rp0
                    raws = [_child_weight(k) for k in kids]
                    tot = sum(raws)
                    pl = row["line_gbp"]
                    # PASS 1 — proportional split + commodity caps. Track which kids
                    # were CAPPED (their displayed £ pinned below their proportional
                    # share) vs UNCAPPED (bespoke / rated kit free to absorb the
                    # residual). The cap stops a cheap commodity showing an inflated
                    # share; but capping alone makes Σ(breakdown) < parent line — the
                    # vessel reconciliation gap. Pass 2 redistributes the freed-up
                    # residual onto the uncapped kids so Σ(breakdown) == parent line.
                    kid_rows = []
                    for i, (k, rp) in enumerate(zip(kids, raws), 1):
                        scaled = round(pl * rp / tot) if (pl > 0 and tot > 0) else round(rp)
                        kn = k.get("name_human") or "sub-component"
                        kwid = str(k.get("id") or "")
                        kmd = {m.get("kind"): m.get("value") for m in (k.get("modifier_characters") or [])}
                        kpn = str(kmd.get("part_number") or "")
                        krat = next((f"{x.get('value')} {x.get('unit', '')}".strip()
                                     for x in (k.get("modifier_characters") or [])
                                     if x.get("kind") == "rating_primary"), "")
                        kbasis = f"physics-sized component of {name}; scaled to parent cost"
                        # BOUND the DISPLAYED commodity sub-component (the proportional
                        # split re-inflates a capped weight back up to the parent share —
                        # a TMP451 "Local Sensor" rescaled to £4,390). Cap the displayed
                        # breakdown at ≤3× catalogue (partVerif MPN fallback) then at the
                        # bare-commodity ceiling. line_gbp stays 0 → grand total unchanged.
                        kcap_pn = kpn if _is_structured_pn(kpn) else (pv_pn.get(kwid) or kpn)
                        was_capped = False
                        _cat = _catalogue_pinned_child(kmd, _child_price(k))
                        if _cat is not None:
                            # catalogue-adopted child: its REAL distributor price + basis,
                            # pinned so pass-2 never re-inflates it back to a parent share.
                            scaled, kbasis, was_capped = _cat[0], _cat[1], True
                        else:
                            kc, kcb = _commodity_catalogue_cap(kn, kcap_pn, float(scaled), dist_price.get(kwid))
                            if kcb is not None:
                                scaled, kbasis, was_capped = round(kc), kbasis + " · " + kcb, True
                            kce, kceb = _apply_commodity_ceiling(kn, kmd, float(scaled), krat)
                            if kceb is not None:
                                scaled, kbasis, was_capped = round(kce), kbasis + " · " + kceb, True
                        kid_rows.append({"tag": f"{tag}.{i}",
                                         "requirement": f"↳ {kn}" + (f" · {krat}" if krat else ""),
                                         "status": "SUB-COMPONENT", "part": "assembly detail", "qty": 1,
                                         "unit_gbp": scaled, "line_gbp": 0, "breakdown_gbp": scaled,
                                         "sub_of": tag, "basis": kbasis, "_capped": was_capped})
                    # PASS 2 — reconcile Σ(breakdown) to the parent line. Apportion the
                    # residual (parent line − Σ capped&uncapped) across the UNCAPPED kids
                    # in proportion to their current share (they are the bespoke shell /
                    # internals / rated kit that legitimately carry the balance). Falls
                    # back to ALL kids if none are uncapped, so the invariant always holds.
                    if pl > 0:
                        cur = sum(kr["breakdown_gbp"] for kr in kid_rows)
                        resid = pl - cur
                        if resid != 0:
                            absorbers = [kr for kr in kid_rows if not kr["_capped"]] or kid_rows
                            base = sum(kr["breakdown_gbp"] for kr in absorbers)
                            if base > 0:
                                acc = 0
                                for j, kr in enumerate(absorbers):
                                    share = (round(resid * kr["breakdown_gbp"] / base)
                                             if j < len(absorbers) - 1 else resid - acc)
                                    acc += share
                                    kr["breakdown_gbp"] = max(0, kr["breakdown_gbp"] + share)
                                    kr["unit_gbp"] = kr["breakdown_gbp"]
                            else:
                                # all absorbers at £0 — drop the whole residual on the last
                                absorbers[-1]["breakdown_gbp"] = max(0, absorbers[-1]["breakdown_gbp"] + resid)
                                absorbers[-1]["unit_gbp"] = absorbers[-1]["breakdown_gbp"]
                            absorbers[-1]["basis"] += " · reconciled to parent line"
                    for kr in kid_rows:
                        kr.pop("_capped", None)
                        rows.append(kr)
    # ── CORPUS-MEDIAN LIFT post-pass (RAS £5M audit 2026-06-20). A principal that no
    # rating/take-off path corrected keeps a flat parametric estimate that can sit far
    # below the engine's OWN forge-truth corpus median (Degasser £4,946 vs £65k median;
    # Drum Filter £6,851 vs £28k). The corpus verdict was recorded per partVerification
    # but never applied. Lift each such line to the corpus's CONSERVATIVE lower edge
    # (p25 / 0.6×median, never the median) — universal, lift-only, keyed off the engine's
    # own recorded verdict. Matches a row to its pv by word_id (sub-of rows excluded:
    # line_gbp 0) then by normalised leading name. Re-derives line_gbp = unit × qty. ──
    # NB: read partVerifications from the ORIGINAL state dict — the loop above rebinds
    # the local `st` to a structural-takeoff tuple (line ~2449), so `st` is no longer
    # the state here. `_pv_state` is the untouched state dict captured at load time.
    pv_by_name = {}
    for v in (_pv_state.get("partVerifications") or []):
        nmk = re.sub(r"\s+\d+$", "", str(v.get("word_name") or "")).strip().lower()
        if nmk:
            pv_by_name.setdefault(nmk, v)
    # A LENGTH-priced run (pipework / piping / cabling / ducting) is owned by the
    # _connection_rows mechanism (£/m × route-manifest length) — a per-UNIT corpus
    # median is meaningless for it, and a generic "Pipework Run" placeholder lifted to
    # a £20k median would DOUBLE-COUNT the itemised ROUTED pipe lines. Exclude those
    # nouns from the corpus-median lift. (False-positive guard, Tristan 2026-06-20.)
    _CORPUS_LIFT_SKIP_RE = re.compile(
        r"pipework|piping|\bpipe[_ -]?run|cable[_ -]?run|cabling|duct(?:ing|[_ -]?run)|"
        r"\bwiring\b|trunking|conduit", re.I)
    # Index the sub-component children by their parent tag so a lift can RE-SCALE the
    # breakdown to keep Σ(children) == parent line (the ⚠ Checks parent↔children invariant).
    kids_by_tag = {}
    for kr in rows:
        if kr.get("status") == "SUB-COMPONENT" and kr.get("sub_of"):
            kids_by_tag.setdefault(kr["sub_of"], []).append(kr)
    # ── ACTUATED-VALVE / BARE-ACTUATOR DOUBLE-REPRESENTATION DE-DUP (2026-07-02):
    # when the bill carries BOTH "N× actuated valves" (assembly-priced, actuator
    # included) AND "N× pneumatic actuators" for the same population, the actuator
    # line double-bills what the assemblies already contain — fold it to £0 with an
    # honest IN ASSEMBLY note. Runs BEFORE the corpus lift so a folded line is never
    # lifted. (stderr only — stdout must stay pure JSON for the chain.)
    _folded = _dedupe_actuator_assembly_rows(rows)
    if _folded:
        print(f"  [actuator-dedup] folded {_folded} bare-actuator line(s) into their "
              f"actuated-valve assemblies (double-representation removed)", file=sys.stderr)
    # ── MEMBRANE-FAMILY SYNONYM DE-DUP (gate-36 round 2, 2026-07-03): the same UF stage
    # emitted under synonym names ('Ultrafiltration Module' + 'Uf Module Bank' + 'Uf
    # Membrane Bank') folds to ONE priced line. Runs BEFORE the corpus lift so a folded
    # synonym is never lifted. (stderr only — stdout must stay pure JSON for the chain.)
    _mfolded = _dedupe_membrane_synonym_rows(rows)
    if _mfolded:
        print(f"  [membrane-dedup] folded {_mfolded} membrane-family synonym line(s) onto "
              f"their surviving stage line (same distinguishing tokens — one physical bank)",
              file=sys.stderr)
    # ── ACTUATED ON/OFF VALVE POPULATION SYNONYM DE-DUP (Codema ship 2026-07-09):
    # solenoid ↔ pneumatic-actuated ×N lines are ONE population under synonym labels.
    _afolded = _dedupe_actuated_valve_population_rows(rows)
    if _afolded:
        print(f"  [actuated-pop-dedup] folded {_afolded} on/off actuated-valve synonym "
              f"population line(s) onto one survivor (one population, one price)",
              file=sys.stderr)
    _lift_n, _lift_gbp = 0, 0.0
    for row in rows:
        if row.get("line_gbp", 0) <= 0 or row.get("status") == "SUB-COMPONENT":
            continue          # sub-components ride in breakdown_gbp; never lift those
        if str(row.get("status")) == "ROUTED":
            continue          # routed connections are length-priced, not unit-priced
        u = float(row.get("unit_gbp") or 0)
        if u <= 0:
            continue
        req_lead = str(row.get("requirement", "")).split("·")[0]
        if _CORPUS_LIFT_SKIP_RE.search(req_lead):
            continue          # length-priced run — owned by _connection_rows, never lift
        if _COMMODITY_NOUN_RE.search(req_lead):
            # COMMODITY sub-component (busbar / tap-wire / cable / fuse / lug …): never corpus-lift.
            # The corpus median for a commodity NOUN is dominated by larger / bespoke variants, so a
            # lift over-bills the small per-cell part (the BESS busbar £120→£452 bug). Principals —
            # which the lift is FOR — never match this regex, so legitimate under-priced principals
            # (the Degasser £4,946 vs £65k median case) are unaffected. (Tristan 2026-06-24, UNIVERSAL.)
            continue
        # SMALL W-RATED HEATER: a PTC / anti-condensation / rack / panel heater rated in WATTS is a
        # small resistive part — the corpus median for "heater" is dominated by kW-scale immersion/
        # process heaters, so a lift over-bills the 250 W rack heater (£100→£1,500, gate-21 saw it
        # too). Skip the lift; the £0.6/W ceiling keeps it sane. (Tristan 2026-06-24, UNIVERSAL.)
        if (re.search(r"\bheater\b", req_lead, re.I)
                and not re.search(r"immersion|backup|process|duct|inline|booster|jacket|reboil", req_lead, re.I)
                and re.search(r"\b\d[\d,]*\s*w\b", str(row.get("requirement") or ""), re.I)):
            continue
        # INTERNAL ACCESSORY FAN TRAY: skip whenever the requirement names a "fan
        # tray" (see _INTERNAL_FAN_TRAY_RE docstring) AND its own rating is sub-
        # 1000 W (the accessory scale); a standalone fan rated in hundreds of watts
        # to kW (the enclosure ventilation fan / off-gas exhaust fan lines, which
        # the corpus genuinely describes) is untouched.
        if (_INTERNAL_FAN_TRAY_RE.search(req_lead)
                and re.search(r"\b\d{1,3}\s*w\b", str(row.get("requirement") or ""), re.I)):
            continue
        # MEMBRANE/MEDIA family: the line is AREA-GROUNDED (membrane-area/housing
        # parametric, 2026-07-02) — the corpus median for a 'membrane bank/skid' noun is
        # dominated by COMPLETE skid packages (pumps + frames + controls), so a lift
        # re-inflates the consumable back toward the steel-take-off error the membrane
        # fix just removed (Uf Membrane Bank £9,100→£47,855). The area rate is the
        # grounded truth; never corpus-lift a membrane/media line. (corpus-mismatch family)
        if _MEMBRANE_MEDIA_RE.search(req_lead):
            continue
        # ACTUATED-VALVE / BARE-ACTUATOR FAMILIES (benchmark net v56, 2026-07-02,
        # corpus-mismatch family): the "actuator"/"actuated valve" corpus medians (£548 /
        # £2,400, n=5) are dominated by large MOTORISED/electric industrial drives and
        # valve packages, so a lift over-bills the £30–40 air actuator ~10× (£25→£329
        # across 200 units = £65.8k phantom) and re-inflates the family-grounded £200
        # assembly to £2,400 (12×). The DN-scaled family band at the pricing site is the
        # grounded truth for BOTH; never corpus-lift either family.
        if _BARE_PNEUMATIC_ACTUATOR_RE.search(req_lead) or _ACTUATED_VALVE_RE.search(req_lead):
            continue
        # BATTERY CELL family (2026-07-10, Powerwall run-23, corpus-mismatch family): a
        # cell line is ENERGY-GROUNDED (Ah × V × £/kWh_cell, the commoditised truth —
        # requirements_bom's own dominant-cost doctrine) or real-DB-median priced. The
        # 'cell' corpus median (£52, n=5) is small-quantity RETAIL single-cell pricing —
        # the wrong frame for a manufactured product's programme BoM: the lift re-inflated
        # 88 × £8 → 88 × £52 (£3.9k phantom on a 14 kWh unit, £327/kWh at CELL level vs
        # the ~£60-100/kWh cell market). The energy grounding is the truth; never
        # corpus-lift a battery-cell line. (Same discipline as membrane/actuator above.)
        if _BATTERY_CELL_RE.search(req_lead) and not _NON_BATTERY_CELL_RE.search(req_lead):
            continue
        nmk = re.sub(r"\s+\d+$", "", req_lead).strip().lower()
        pv = pv_by_name.get(nmk)
        res = _corpus_median_lift(u, pv) if (pv and not _is_real_mpn_grounded(pv)) else None
        if res:
            new_u, suffix = res
            qy = row.get("qty") or 1
            _lift_n += 1
            _lift_gbp += (new_u - u) * qy
            # RE-SCALE the assembly breakdown so the children still SUM to the lifted
            # parent line (else the ⚠ Checks parent-vs-sub-component invariant FAILs — the
            # swarm-caught Degasser £115k parent / £9,693 children mismatch, 2026-06-20).
            # The children are an apportionment of the parent, not independent prices, so a
            # proportional scale by the SAME factor the parent moved keeps the split honest.
            # PLACEHOLDER-TAG COLLISION GUARD (2026-07-02): "—" is the no-tag placeholder
            # shared by MANY unrelated rows, so kids_by_tag["—"] holds OTHER parents'
            # children — rescaling them by THIS row's lift factor silently inflated the
            # membrane sub-components ~13× in v56 (the £116.5M "Backwash / Service Valve
            # Nest" breakdown). Only a row with a REAL canonical tag owns its children.
            _rtag = row.get("tag")
            kids = kids_by_tag.get(_rtag) if _rtag not in (None, "", "—") else None
            if kids and u > 0:
                k_factor = new_u / u
                for kr in kids:
                    kr["breakdown_gbp"] = round(float(kr.get("breakdown_gbp") or 0) * k_factor)
                    kr["unit_gbp"] = kr["breakdown_gbp"]
                # drop the rounding residual on the largest child so Σ(children) == the
                # new parent line EXACTLY (robust to any tolerance the checks tab uses).
                new_line = round(new_u * (row.get("qty") or 1))
                ksum = sum(kr["breakdown_gbp"] for kr in kids)
                resid = new_line - ksum
                if resid:
                    big = max(kids, key=lambda kr: kr["breakdown_gbp"])
                    big["breakdown_gbp"] = max(0, big["breakdown_gbp"] + resid)
                    big["unit_gbp"] = big["breakdown_gbp"]
            row["unit_gbp"] = new_u
            row["line_gbp"] = round(new_u * qy)
            row["basis"] = str(row.get("basis", "")) + suffix
    if _lift_n:
        # stderr ONLY — the chain (serial-design-chain-v2.tsx ~8166) does JSON.parse on
        # this script's STDOUT in --json mode; any stdout chatter breaks the BoM step and
        # the chain silently falls back to the lower R1 anchor (the £2.08M-not-£5M bug).
        print(f"  [corpus-median-lift] raised {_lift_n} under-priced principal line(s) "
              f"to their engine corpus lower edge (+£{_lift_gbp:,.0f})", file=sys.stderr)

    rows += _connection_rows(out_dir, qcontract)   # pipe/cable/duct runs as their own service-classified BoM lines (re-priced from contract duties)
    # the PARAMETRIC zoned-delivery distribution network (mains/risers/laterals/drain mirror
    # + connection allowances) — priced from the sizer's 'parametric — not routed' quantities;
    # [] on every archetype without zoned-delivery signals (bill byte-identical).
    rows += _distribution_network_rows(qcontract)
    # demand-sized duty provenance — stamp AFTER every row exists so a principal, connection or
    # network line whose duty IS a contract *_demand_* flow states its derivation (see helper).
    _apply_demand_sized_basis(rows, qcontract)

    # ── UNDERGROUND-ELEMENT CIVILS DERIVATION (Sam Green SME review 2026-07-07) —
    # additive; [] on any design with no below-grade drainage/collection vessel
    # (byte-identical for every archetype without underground scope). See the
    # function's own docstring for the full rationale.
    rows += civils_rows_from_underground_scope(rows)

    # ── DISPLAY-ARITHMETIC CONSISTENCY (swarm-flagged £1 nits, 2026-06-20). A line built
    # as unit_gbp=round(x), line_gbp=round(x·qty) can show unit×qty ≠ line by up to £1
    # (4 × £47,867 = £191,468 but the line read £191,469, because the unit was rounded
    # AFTER multiplying). A reader checks unit×qty == line, so the DISPLAYED line must be
    # the DISPLAYED unit × qty exactly. Re-derive every priced parent line from its rounded
    # unit; sub-components (line_gbp 0, ride in breakdown_gbp) are untouched. Negligible
    # effect on the total; makes every BoM row self-consistent + passes the C2 gate exactly.
    for row in rows:
        if row.get("status") == "SUB-COMPONENT":
            continue
        if row.get("uom") == "m":
            # LENGTH-PRICED parametric row (gate-36 round 3): qty is metres and unit is the
            # fractional £/m rate — integer-rounding £13.2/m to £13 would move an 8,280 m line
            # by £1,656 (and re-mint the qty-1 "single assembly" misread this shape fixes).
            # The row is already self-consistent: line = round(qty × rate), within the C2
            # check's ±max(0.5%, £1) tolerance.
            continue
        u = row.get("unit_gbp")
        qy = row.get("qty")
        if isinstance(u, (int, float)) and isinstance(qy, (int, float)) and float(row.get("line_gbp") or 0) > 0:
            row["unit_gbp"] = round(u)
            row["line_gbp"] = round(u) * int(qy)
    # DB-INGEST ENQUEUE (Tristan 2026-06-25 "wire the ingest") — log every PRINCIPAL the DB could
    # not price (fell to a hand-coded estimate) to the price-ingest queue so the off-chain ingest
    # job grows the DB; next run the DB-first resolver prices it from data. Cheap append; no API.
    if os.environ.get("PRICE_INGEST_ENQUEUE", "1") not in ("0", "false", "no"):
        try:
            _enqueue_db_misses(rows)
        except Exception:
            pass
    # ROUTED FOLLOW-ONS to the honest generic-spec/OEM-proprietary taxonomy (commit
    # d2b1c1075) — run LAST, after every row/basis exists: (1) stamp an engine-refused
    # process valve's DN (+ rating, where the schedule states one) from the connection
    # schedule, when the join is unambiguous; (2) stamp a recorded no-public-MPN
    # research finding onto its matching row's basis. Both defensive (missing schedule
    # / DB / table = no-op) and idempotent (never overwrite an already-sized/-stamped
    # row).
    rows = _stamp_engine_refused_valve_specs(rows, out_dir)
    rows = _stamp_oem_proprietary_findings(rows, _run_class_tag(_pv_state))  # _pv_state = the STABLE state handle; `st` is rebound inside the loop above
    rows = _stamp_fabricated_family_materials(rows)
    return rows


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    # GATE-21 PRICE NORMALISATION mode (council 2026-06-17): mutate the run's
    # state.json so state.partVerifications carries the capped commodity prices the
    # gate reads — closing the field-mismatch that let the mis-PINs survive. Run by
    # the chain BEFORE gate 21. Universal + idempotent (re-running caps nothing new).
    if "--normalize-prices" in sys.argv:
        out_dir = pos[0] if pos else "out/ras-v11"
        sp = os.path.join(out_dir, "state.json")
        st = json.load(open(sp))
        changes = _normalise_partverification_prices(st)
        if changes:
            with open(sp, "w") as f:
                json.dump(st, f)
        if "--json" in sys.argv:
            print(json.dumps(changes))
        else:
            print(f"partVerification price normalisation · {out_dir}: "
                  f"{len(changes)} commodity line(s) capped")
            for c in changes:
                print(f"  {c['name']!r} (PN {c['part_number']}, {c['manufacturer']}) "
                      f"{c['field']}: £{c['was_gbp']:,.2f} → £{c['now_gbp']:,.0f}")
        sys.exit(0)
    rows = assemble(pos[0] if pos else "out/ras-r5-20260613")
    if "--json" in sys.argv:                      # machine mode — the TS chain consumes this
        print(json.dumps(rows))
        sys.exit(0)
    tot = sum(r["line_gbp"] for r in rows)
    print(f"{'TAG':7} {'STATUS':11} {'REQUIREMENT':62} {'£ LINE':>10}  BASIS")
    for r in rows:
        print(f"{r['tag']:7} {r['status']:11} {r['requirement'][:60]:62} {r['line_gbp']:>10,}  {r['basis'][:40]}")
    print(f"\n{len(rows)} requirement lines · Σ £{tot:,}")
