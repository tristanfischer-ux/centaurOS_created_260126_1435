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


def _materials_takeoff(name, mods, geom=None):
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


def _price_floor_for(name: str):
    """Minimum credible installed unit price (£) for a power/control component by its
    NOUN, else None. Conservative trade-supply lower bound — a real quote is higher."""
    for rx, floor in _MIN_PRICE_FLOORS:
        if rx.search(name or ""):
            return floor
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

    # ── CLOSED-VESSEL CEILING — a small closed-vessel take-off can never reach the
    # absurd £1M-class value the prior council flagged on a ~7 m³ "UV reactor".
    ceil7 = _vessel_cost_ceiling(7.1)
    if not (ceil7 < 200000):
        print(f"  FAIL 7 m³ vessel ceiling too high: £{ceil7:.0f}"); bad += 1
    mt = _materials_takeoff("UV Reactor", {"dimension": "1.8 m dia x 2.8 m"})
    if mt and mt[0] > ceil7:
        print(f"  FAIL small vessel take-off £{mt[0]:.0f} exceeds its own ceiling £{ceil7:.0f}"); bad += 1

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

    # 1) MAIN LOOP — both ends are recirculation-loop process units. The plant flow
    # is carried by `trains` parallel headers; one represented edge = one train.
    frm_loop = bool(_LOOP_NODE_RE.search(frm))
    to_loop = bool(_LOOP_NODE_RE.search(to))
    if frm_loop and to_loop:
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
    # PARALLEL PROCESS TRAINS — the plant flow is split across N parallel headers
    # (e.g. the rearing-tank count), so a single represented loop edge carries one
    # train's share, not the whole plant flow through one impossible giant main.
    # Derived from total ÷ per-unit tank volume (universal), floored at 1.
    tot_vol = _qval("total_tank_volume_m3")
    each_vol = _qval("rearing_tank_volume_each_m3")
    trains = 1
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


def assemble(out_dir: str):
    st = json.load(open(os.path.join(out_dir, "state.json")))
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
                if bc == "strong":
                    # complex fabricated process vessel — bespoke regardless of any pinned
                    # PN; cost is the engineering budget estimate, NOT a shell take-off
                    # (which would undercount a reactor/column by orders of magnitude).
                    status, part = "BESPOKE", "made to spec"
                    pv = price.get(wid, 0.0)
                    if pv > 0:
                        gbp, basis = pv, "made-to-spec · engineering budget estimate"
                    else:
                        mt = _materials_takeoff(name, md, g_lookup)
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
                    mt = _materials_takeoff(name, md, g_lookup)
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
                # MINIMUM-CREDIBLE-PRICE FLOOR (council 2026-06-16): a power/control
                # catalogue component must not render at £1-£3 from a stray estimate.
                # Apply the floor only when there is no real distributor price for it.
                # `_price_floor_for` only matches genuine electrical-component nouns
                # (breaker / busbar / SPD / relay / contactor / isolator …), so it is
                # safe to apply even when such a part was mis-labelled BESPOKE (a "power
                # contactor" wrongly classed as a process 'contactor' vessel) — it never
                # touches a real fabricated process vessel.
                floor = _price_floor_for(name)
                if floor and wid not in dist_price and 0 <= gbp < floor:
                    gbp = floor
                    if status == "BESPOKE":   # it was an electrical part, not a vessel
                        status, part = "NOT FOUND", "requirement stated"
                    basis = (basis + " · floored to min credible price"
                             if "floored" not in basis else basis)
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
                    gbp, basis = _reconcile_rated_price(name, md, gbp, basis, requirement)
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
                        kc, kcb = _commodity_catalogue_cap(kn, kcap_pn, float(scaled), dist_price.get(kwid))
                        if kcb is not None:
                            scaled, kbasis = round(kc), kbasis + " · " + kcb
                        kce, kceb = _apply_commodity_ceiling(kn, kmd, float(scaled), krat)
                        if kceb is not None:
                            scaled, kbasis = round(kce), kbasis + " · " + kceb
                        rows.append({"tag": f"{tag}.{i}", "requirement": f"↳ {kn}" + (f" · {krat}" if krat else ""),
                                     "status": "SUB-COMPONENT", "part": "assembly detail", "qty": 1,
                                     "unit_gbp": scaled, "line_gbp": 0, "breakdown_gbp": scaled, "sub_of": tag,
                                     "basis": kbasis})
    rows += _connection_rows(out_dir, qcontract)   # pipe/cable/duct runs as their own service-classified BoM lines (re-priced from contract duties)
    return rows


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    rows = assemble(pos[0] if pos else "out/ras-r5-20260613")
    if "--json" in sys.argv:                      # machine mode — the TS chain consumes this
        print(json.dumps(rows))
        sys.exit(0)
    tot = sum(r["line_gbp"] for r in rows)
    print(f"{'TAG':7} {'STATUS':11} {'REQUIREMENT':62} {'£ LINE':>10}  BASIS")
    for r in rows:
        print(f"{r['tag']:7} {r['status']:11} {r['requirement'][:60]:62} {r['line_gbp']:>10,}  {r['basis'][:40]}")
    print(f"\n{len(rows)} requirement lines · Σ £{tot:,}")
