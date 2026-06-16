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
    print("selftest:", "OK" if bad == 0 else f"{bad} FAILED")
    return 1 if bad else 0


def _connection_rows(out_dir: str):
    """Each routed connection (pipe / cable / duct run from the Blender layout)
    becomes its OWN bill-of-materials line — service-classified (electrical /
    water / air), carrying its as-built LENGTH and SIZE — so every input/output
    connection is an IDENTIFIED part, not just decoration on an equipment row
    (Tristan 2026-06-15: "pay attention to all of the input output connections
    plus the length and sizing eg electric water and air"). Universal: reads the
    deterministic connection-schedule the universal Blender builder writes for
    any archetype. An out-of-spec run is flagged ROUTED·REVIEW so the convergence
    loop can re-size it."""
    p = os.path.join(out_dir, "connection-schedule.json")
    if not os.path.exists(p):
        return []
    try:
        cs = json.load(open(p))
    except Exception:
        return []
    out = []
    for i, r in enumerate(cs.get("rows") or []):
        size = str(r.get("size") or "").strip()
        mech = str(r.get("mechanism") or "").lower()
        if "mm²" in size or "mm2" in size.lower() or any(k in mech for k in ("cable", "power", "electr", "supply", "feeder")):
            service, kind = "electrical", "cable"
        elif "duct" in size.lower() or any(k in mech for k in ("hvac", "vent", "exhaust", "air", "aeration")):
            service, kind = "air", "duct"
        else:
            service, kind = "water", "pipe"
        frm = str(r.get("from") or "").replace("_", " ").strip()
        to = str(r.get("to") or "").replace("_", " ").strip()
        length = r.get("length_m")
        within = bool(r.get("within_spec"))
        rating = str(r.get("rating") or "").strip()
        line = float(r.get("line_total_gbp") or 0.0)
        req = f"{service} connection: {frm} → {to}" + (f" · {rating}" if rating else "")
        part = str(r.get("qty") or f"{size} {kind}")   # human desc incl. length, e.g. "DN300 pipe, 65.1 m"
        out.append({
            "tag": f"C{i + 1:02d}",
            "requirement": req,
            "status": "ROUTED" if within else "ROUTED·REVIEW",
            "part": part,
            "qty": 1,
            "unit_gbp": round(line),
            "line_gbp": round(line),
            "basis": str(r.get("cost_basis") or "model:uk-2026 supply+install"),
            # extras (length + sizing focus) — consumed by the run dashboard:
            "connection": True, "service": service, "size": size,
            "length_m": round(float(length), 1) if isinstance(length, (int, float)) else None,
            "within_spec": within,
        })
    return out


def assemble(out_dir: str):
    st = json.load(open(os.path.join(out_dir, "state.json")))
    def _load(n):
        p = os.path.join(out_dir, n)
        return json.load(open(p)) if os.path.exists(p) else {}
    rm = _load("route-manifest.json"); pm = _load("parts-manifest.json")

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

    # price map from partVerifications
    price = {}
    for v in (st.get("partVerifications") or []):
        wid = str(v.get("word_id") or "")
        p = v.get("cost_repair_corrected_price_gbp") or v.get("price_estimate_gbp")
        if wid and isinstance(p, (int, float)) and p > 0 and not v.get("cost_repair_excluded_from_subtotal"):
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
                            else "SCADA" if "scada" in nlow else "GR" if ("grading" in nlow or "harvest" in nlow) else "SYS")
                    rows.append({"tag": ptag, "requirement": requirement, "status": "SYSTEM",
                                 "part": "process-support system (catalogue class)", "qty": qy,
                                 "unit_gbp": round(pgbp), "line_gbp": round(pgbp * qy),
                                 "basis": "installed process system — catalogue-class budget"})
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
                elif bc == "simple":
                    mt = _materials_takeoff(name, md, g_lookup)
                    status, part = "BESPOKE", "made to spec"
                    gbp, basis = (mt[0], mt[1]) if mt else (price.get(wid, 0.0), "bottom-up parametric")
                    mt_spec = mt[2] if mt and len(mt) > 2 else None
                else:
                    status, part = "NOT FOUND", "requirement stated"
                    gbp, basis = price.get(wid, 0.0), "bottom-up parametric"
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
    rows += _connection_rows(out_dir)   # pipe/cable/duct runs as their own service-classified BoM lines
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
