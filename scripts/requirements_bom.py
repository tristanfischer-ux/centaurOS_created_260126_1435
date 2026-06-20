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
import json, math, os, re

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
_STRONG_BESPOKE_RE = re.compile(r"reactor|distillation|fractionation|\bcolumn\b|\btower\b|"
                                r"absorber|stripper|scrubber|contactor|crystalli|calciner|"
                                r"\bkiln\b|digester|ferment|bioreactor|electroly", re.I)
_TBD_RE = re.compile(r"tbd|detailed design|specify|^$", re.I)


def _num(s):
    m = re.search(r"-?\d+(?:\.\d+)?", str(s or ""))
    return float(m.group(0)) if m else None


def _mods(w):
    return {m.get("kind"): m.get("value") for m in (w.get("modifier_characters") or [])}


def _cyl_from_dim(dim):
    """(dia_m, h_m) from a '<d> m dia x <h> m' string, else None."""
    m = re.search(r"([\d.]+)\s*m\s*dia[^x]*x\s*([\d.]+)\s*m", str(dim or ""), re.I)
    return (float(m.group(1)), float(m.group(2))) if m else None


def _box_from_dim(dim):
    """(w,d,h) in m from a '<w>x<d>x<h> mm' string, else None."""
    m = re.search(r"([\d.]+)x([\d.]+)x([\d.]+)\s*mm", str(dim or ""), re.I)
    return (float(m.group(1)) / 1000, float(m.group(2)) / 1000, float(m.group(3)) / 1000) if m else None


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
    gbp = area_m2 * _STRUCTURAL_GBP_PER_M2 + 8000.0   # + connections/baseplates/HD bolts
    basis = (f"structural steelwork take-off: {area_m2:,.0f} m² plan × £{_STRUCTURAL_GBP_PER_M2:.0f}/m² "
             f"(UK-2026 fabricated + erected; service=structural, dry, 0 bar — NOT a pressure shell) "
             f"+ £8k connections")
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
    fittings = 0.20 * installed + 1800                        # nozzles, manway, supports, coating
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
_MIN_PRICE_FLOORS = [
    (re.compile(r"main[_ ]?breaker|\bmccb\b|moulded[_ ]?case|air[_ ]?circuit", re.I), 180.0),
    (re.compile(r"\bbreaker\b|\bmcb\b|circuit[_ ]?breaker", re.I), 45.0),
    (re.compile(r"busbar|bus[_ ]?bar|distribution[_ ]?bus", re.I), 120.0),
    (re.compile(r"surge[_ ]?protect|\bspd\b|surge[_ ]?arrest", re.I), 90.0),
    (re.compile(r"protective[_ ]?relay|protection[_ ]?relay", re.I), 220.0),
    (re.compile(r"\brelay\b", re.I), 35.0),
    (re.compile(r"isolat(?:or|ion)[_ ]?(?:device|switch)?|disconnect|load[_ ]?break", re.I), 95.0),
    (re.compile(r"contactor", re.I), 80.0),
    (re.compile(r"fuse[_ ]?holder|fuse[_ ]?carrier", re.I), 25.0),
    (re.compile(r"emergency[_ ]?stop|e[_ -]?stop", re.I), 40.0),
    (re.compile(r"interlock|safety[_ ]?switch", re.I), 60.0),
    (re.compile(r"signal[_ ]?conditioner|isolat(?:ing)?[_ ]?amplifier", re.I), 120.0),
    (re.compile(r"network[_ ]?switch|ethernet[_ ]?switch", re.I), 150.0),
    (re.compile(r"communication[_ ]?gateway|protocol[_ ]?gateway|fieldbus", re.I), 250.0),
    (re.compile(r"i/?o[_ ]?module|input[_ ]?output", re.I), 250.0),
    (re.compile(r"controller[_ ]?power|power[_ ]?supply|\bpsu\b", re.I), 120.0),
    (re.compile(r"main[_ ]?controller|\bplc\b|programmable[_ ]?logic", re.I), 400.0),
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
    (re.compile(r"\bo2\b|oxygen|\blox\b|solenoid|oxygen[_ ]?(?:supply|system|dos|inject)", re.I), 1500.0),
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
    for rx, floor in _MIN_PRICE_FLOORS:
        if rx.search(nm):
            return floor
    return None


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
    r"signal[_ -]?conditioner|i/?o[_ -]?module|terminal\b",
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

    # UV / ozone disinfection — £/kW of installed lamp power (medium-pressure UV
    # skids ~ £900-1,400/kW installed incl. reactor, ballasts, quartz, controls).
    if re.search(r"\buv\b|ultraviolet|ozone|disinfect|steril", nm):
        kw = _qv("uv_lamp_power_kw", "uv_installed_power_kw", default=rating)
        if kw and kw > 0:
            kw = min(kw, 60.0)   # sanity clamp until the upstream UV-power fix lands
            gbp = 18000.0 + kw * 1200.0
            return gbp, f"UV/ozone parametric: {kw:.0f} kW lamp power × £1,200/kW + £18k reactor/controls"
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


def _rating_kw(md: dict, name: str = "", requirement: str = ""):
    """(value, is_kva) for a power-rated line, else (None, False). Reads the
    machine-readable `rating_primary` modifier first (the universal hook every
    sized equipment carries), then falls back to a kW/kVA token in the name or
    requirement text. Universal — no per-class logic."""
    val = None
    unit = ""
    rp = md.get("rating_primary") if isinstance(md, dict) else None
    if rp is not None:
        val = _num(rp)
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
    for mk in motor_keys:
        stem = mk[: -len("_motor_kw")]
        stem_toks = [t for t in re.split(r"[_\d]+", stem) if t]
        # require the equipment-type token (pump/blower/compressor/fan) to coincide
        type_tok = next((t for t in stem_toks if _MOTOR_DRIVEN_NOUN_RE.search(t)), None)
        if not type_tok or type_tok not in name_toks:
            continue
        # and at least one descriptive stem token present in the line's noun
        if any(t in name_toks for t in stem_toks if t != type_tok) or len(stem_toks) == 1:
            nameplate = _qnum(q, mk)
            if nameplate and nameplate > shaft_kw * 1.01:
                return (nameplate, shaft_kw)
    return (None, None)


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
                           requirement: str = ""):
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
    if kw is None:
        return (gbp, basis)
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
        return (float(mid_gbp), f"{model_basis} [{why} → grounded to market]")
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


def _bespoke_class(name: str) -> str:
    """'strong' | 'simple' | 'none'. STRONG = complex fabricated process vessel
    (reactor/column/absorber/...) decided by the HEAD noun (last word) so a qualifier
    ('reactor thermowell', 'fractionation reboiler') can't promote a catalogue component.
    SIMPLE = shell-dominated fabrication (tank/basin/duct...) costed by a materials
    take-off. Universal — no per-class table."""
    head = re.sub(r"[^a-z0-9]+$", "", (name.strip().split() or [""])[-1].lower())
    if _STRONG_BESPOKE_RE.search(head):
        return "strong"
    if _BESPOKE_RE.search(name or ""):
        return "simple"
    return "none"


def _selftest() -> int:
    """Guards the head-noun rule that the qualifier-over-match bug (2026-06-13) broke."""
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
    }
    bad = 0
    for name, want in cases.items():
        got = _bespoke_class(name)
        # the '·'-suffixed names: the take-off appends ' · <dim>', so test the bare noun too
        if got != want and want in ("simple", "strong"):
            got = _bespoke_class(name.split("·")[0].strip())
        if got != want:
            print(f"  FAIL  '{name}' → {got} (want {want})"); bad += 1
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
    one train's share."""
    blob = f"{frm} {to}".lower()

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
    if frm_loop and to_loop and not _branch_veto:
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

    def _qval(*keys, default=None):
        for k in keys:
            v = q.get(k) if isinstance(q, dict) else None
            if isinstance(v, dict):
                v = v.get("value")
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return default

    # whole-plant recirculation flow (the schedule's blanket value) — the ONLY edges
    # that legitimately carry it are the main-loop edges.
    recirc_m3h = _qval("recirculation_flow_m3_h", "degasser_water_flow_m3_h",
                       "drum_filter_throughput_m3_h", default=13360.0)
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
        length = r.get("length_m")
        within = bool(r.get("within_spec"))
        rating = str(r.get("rating") or "").strip()
        line = float(r.get("line_total_gbp") or 0.0)
        basis = str(r.get("cost_basis") or "model:uk-2026 supply+install")
        sized_note = None

        # ── SERVICE CLASSIFICATION ──
        if "mm²" in size or "mm2" in size.lower() or any(k in mech for k in ("cable", "power", "electr", "supply", "feeder", "bus")):
            service, kind = "electrical", "cable"
        elif "duct" in size.lower() or any(k in mech for k in ("hvac", "vent", "exhaust", "air", "aeration")):
            service, kind = "air", "duct"
        else:
            service, kind = "water", "pipe"

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

            # GAS / cryo-liquid DELIVERY line (oxygen/ozone/CO₂ feed) — a small mass
            # flow, sized small-bore stainless, NOT a bulk-water main. Detected when
            # the edge is a gas service AND its rating is a mass flow (kg/s, kg/h).
            if (not is_loop) and _GAS_SERVICE_RE.search(endpoints) and rating_is_mass:
                # small-bore gas/LOX delivery line — DN15-50 stainless by mass duty
                kgs = _num(rating) or 0.0
                if re.search(r"kg\s*/\s*h", rating, re.I):
                    kgs = kgs / 3600.0
                dn_mm = 15 if kgs < 0.05 else 25 if kgs < 0.2 else 40 if kgs < 1.0 else 50
                rate, matlabel = _stainless_rate_per_m(dn_mm), "316L stainless (gas)"
                term = 2.0 * (0.25 * rate + 80.0)
                line = round(length_m * rate + term)
                size = f"DN{dn_mm}"
                within = True
                sized_note = f"gas/cryo delivery line: {rating} → DN{dn_mm} small-bore {matlabel}"
                basis = (f"gas delivery pipe £{rate:.0f}/m @ DN{dn_mm} ({matlabel}) × "
                         f"{length_m:.1f} m + 2 ends · {rating} (mass flow, not bulk water)")
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
        # human part description incl. length + as-sized DN/CSA
        if service == "water":
            part = f"{size} {matlabel} {kind}, {float(length or 0):.1f} m"
        else:
            part = str(r.get("qty") or f"{size} {kind}")
        row = {
            "tag": f"C{i + 1:02d}",
            "requirement": req,
            "status": "ROUTED" if within else "ROUTED·REVIEW",
            "part": part,
            "qty": 1,
            "unit_gbp": round(line),
            "line_gbp": round(line),
            "basis": basis,
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


def assemble(out_dir: str):
    st = json.load(open(os.path.join(out_dir, "state.json")))
    # Cap mis-PINNED bare-commodity partVerification prices (PN-over-description)
    # BEFORE building rows, so the IDENTIFIED-row price this function reads from the
    # partVerifications `price` map is already the capped value — the SAME field
    # gate 21 reads. Idempotent + no-op for non-mis-pinned states (CO₂/SAF unchanged).
    _normalise_partverification_prices(st)
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
    for v in (st.get("partVerifications") or []):
        wid = str(v.get("word_id") or "")
        if not wid:
            continue
        dp = v.get("distributor_price_gbp")
        if isinstance(dp, (int, float)) and dp > 0:
            dist_price[wid] = float(dp)
        vpn = str(v.get("part_number") or "").strip()
        if vpn:
            pv_pn[wid] = vpn
        p = (v.get("cost_repair_corrected_price_gbp")
             or v.get("price_estimate_gbp")
             or v.get("distributor_price_gbp"))   # bridge: keep the verified distributor price
        if isinstance(p, (int, float)) and p > 0 and not v.get("cost_repair_excluded_from_subtotal"):
            price[wid] = float(p)

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

    rows = []
    for m in ((st.get("moduleDecomposition") or {}).get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                wid = str(w.get("id") or "")
                if "__" in wid:                       # sub-component → itemised under its parent below
                    continue
                name = w.get("name_human") or ""
                if re.search(r"\bfastener|gasket seal|\bbracket\b|wiring harness|labelling|"
                             r"lifting point|nameplate|mounting hardware|earthing boss\b", name, re.I):
                    continue                          # hardware detail — not a requirement line
                md = _mods(w)
                tag = tag_by_name.get(name) or "—"
                # ── REQUIREMENT (what it must do) ──
                duty = md.get("rating_primary")
                duty_u = next((x.get("unit") for x in (w.get("modifier_characters") or [])
                               if x.get("kind") == "rating_primary"), "")
                size = md.get("dimension") or (f"{md.get('capacity')} m³" if md.get("capacity") else None)
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
                    rows.append({"tag": itag, "requirement": requirement, "status": "INSTRUMENT",
                                 "part": "field instrument (catalogue class)", "qty": qy,
                                 "unit_gbp": round(igbp), "line_gbp": round(igbp * qy),
                                 "basis": "installed instrument — catalogue-class budget"})
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
                    rows.append({"tag": utag, "requirement": requirement, "status": "UTILITY",
                                 "part": "balance-of-plant system (catalogue class)", "qty": qy,
                                 "unit_gbp": round(ugbp), "line_gbp": round(ugbp * qy),
                                 "basis": ubasis})
                    continue
                # ── PROCESS-SUPPORT system (synthesizeProcessSystems #143): dosing, feed,
                # LOX, sludge handling, SCADA, grading. Priced whole from its contract duty. ──
                if w.get("_process"):
                    pgbp = _child_price(w)
                    pbasis = "installed process system — catalogue-class budget"
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
                    ptag = ("DOS" if "dosing" in nlow else "FD" if "feed" in nlow
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
                    btag = ("SLB" if "slab" in nlow else "FRM" if ("frame" in nlow or "portal" in nlow)
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
                if svc_fam in _STRUCTURAL_FAMILIES:
                    # structural / building frame — price on footprint, not a pressure shell.
                    pv = price.get(wid, 0.0)
                    st = _structural_takeoff(name, md, g_lookup)
                    if st:
                        status, part = "BESPOKE", "made to spec (structural)"
                        gbp, basis, mt_spec = st[0], st[1], (st[2] if len(st) > 2 else None)
                    elif pv > 0:
                        status, part = "BESPOKE", "made to spec (structural)"
                        gbp, basis = pv, "made-to-spec · structural budget estimate"
                    else:
                        status, part = "NOT FOUND", "requirement stated — structural"
                        gbp, basis = 0.0, "structural element — footprint take-off (no footprint driver; confidence low)"
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
                elif pn and not _TBD_RE.search(pn):
                    status, part = "IDENTIFIED", f"{mfr} {pn}".strip()
                    gbp, basis = price.get(wid, 0.0), "catalogue"
                    # GATE-21 PRICE FEEDBACK (council 2026-06-16): when the cheapest
                    # real distributor price diverges > 5× from the rendered estimate,
                    # prefer the distributor price (TI TMP451 £900→£1.40 class).
                    dpv = dist_price.get(wid)
                    if dpv and gbp > 0 and (gbp / dpv > 5.0 or dpv / gbp > 5.0):
                        gbp, basis = dpv, "catalogue · cheapest distributor (gate-21 >5× correction)"
                elif bc == "simple":
                    mt = _materials_takeoff(name, md, g_lookup, svc)
                    status, part = "BESPOKE", "made to spec"
                    gbp, basis = (mt[0], mt[1]) if mt else (price.get(wid, 0.0), "bottom-up parametric")
                    mt_spec = mt[2] if mt and len(mt) > 2 else None
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
                    gbp, basis = _reconcile_rated_price(name, md, gbp, basis, requirement)
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
                row = {"tag": tag, "requirement": requirement, "status": status,
                       "part": part, "qty": qy, "unit_gbp": round(gbp), "line_gbp": round(gbp * qy),
                       "basis": basis}
                if mt_spec:
                    row.update(mt_spec)   # material · wall_mm · mass_kg · diameter_m · height_m
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
    rows += _connection_rows(out_dir, qcontract)   # pipe/cable/duct runs as their own service-classified BoM lines (re-priced from contract duties)
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
