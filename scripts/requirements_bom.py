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
    spec = {"material": matlabel, "wall_mm": round(wall * 1000, 1), "mass_kg": round(mass),
            "diameter_m": round(d_v, 2), "height_m": round(h_v, 2)}
    return installed + fittings, basis, spec


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
    for v in (st.get("partVerifications") or []):
        wid = str(v.get("word_id") or "")
        if not wid:
            continue
        dp = v.get("distributor_price_gbp")
        if isinstance(dp, (int, float)) and dp > 0:
            dist_price[wid] = float(dp)
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
                if duty:
                    parts_req.append(f"{duty} {duty_u or ''}".strip())
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
                    nlow = name.lower()
                    atag = ("FCV" if "valve" in nlow else "B" if "blower" in nlow
                            else "FE" if "fan" in nlow else "Y")   # ISA: control valve / blower
                    rows.append({"tag": atag, "requirement": requirement, "status": "ACTUATOR",
                                 "part": "final control element (catalogue class)", "qty": qy,
                                 "unit_gbp": round(agbp), "line_gbp": round(agbp * qy),
                                 "basis": "installed actuator — catalogue-class budget"})
                    continue
                # ── BALANCE-OF-PLANT utility / safety system (synthesizeUtilitySafety #142):
                # standby generator, make-up water, bleed/drain, ventilation. Priced as a
                # whole skid from its contract-duty estimate. ──
                if w.get("_utility"):
                    ugbp = _child_price(w)
                    nlow = name.lower()
                    utag = ("G" if "generator" in nlow else "P" if ("make-up" in nlow or "make up" in nlow)
                            else "DV" if ("bleed" in nlow or "drain" in nlow) else "AHU" if "ventil" in nlow else "U")
                    rows.append({"tag": utag, "requirement": requirement, "status": "UTILITY",
                                 "part": "balance-of-plant system (catalogue class)", "qty": qy,
                                 "unit_gbp": round(ugbp), "line_gbp": round(ugbp * qy),
                                 "basis": "installed BoP system — catalogue-class budget"})
                    continue
                # ── PROCESS-SUPPORT system (synthesizeProcessSystems #143): dosing, feed,
                # LOX, sludge handling, SCADA, grading. Priced whole from its contract duty. ──
                if w.get("_process"):
                    pgbp = _child_price(w)
                    nlow = name.lower()
                    ptag = ("DOS" if "dosing" in nlow else "FD" if "feed" in nlow
                            else "LOX" if ("oxygen" in nlow or "lox" in nlow) else "SLU" if "sludge" in nlow
                            else "SCADA" if "scada" in nlow else "GR" if ("grading" in nlow or "harvest" in nlow)
                            else "MED" if ("media" in nlow or "carrier" in nlow) else "SYS")
                    rows.append({"tag": ptag, "requirement": requirement, "status": "SYSTEM",
                                 "part": "process-support system (catalogue class)", "qty": qy,
                                 "unit_gbp": round(pgbp), "line_gbp": round(pgbp * qy),
                                 "basis": "installed process system — catalogue-class budget"})
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
                    raws = [_child_price(k) for k in kids]
                    tot = sum(raws)
                    pl = row["line_gbp"]
                    for i, (k, rp) in enumerate(zip(kids, raws), 1):
                        scaled = round(pl * rp / tot) if (pl > 0 and tot > 0) else round(rp)
                        kn = k.get("name_human") or "sub-component"
                        krat = next((f"{x.get('value')} {x.get('unit', '')}".strip()
                                     for x in (k.get("modifier_characters") or [])
                                     if x.get("kind") == "rating_primary"), "")
                        rows.append({"tag": f"{tag}.{i}", "requirement": f"↳ {kn}" + (f" · {krat}" if krat else ""),
                                     "status": "SUB-COMPONENT", "part": "assembly detail", "qty": 1,
                                     "unit_gbp": scaled, "line_gbp": 0, "breakdown_gbp": scaled, "sub_of": tag,
                                     "basis": f"physics-sized component of {name}; scaled to parent cost"})
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
