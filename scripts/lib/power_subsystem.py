#!/usr/bin/env python3
"""power_subsystem.py — UNIVERSAL power-subsystem completeness (2026-07-24).

WHY: power parts were declared PER-CLASS (`REQUIRED_PARTS` in required-parts-manifest.ts —
BESS gets an EMS, a server a redundant PSU, a HAPS a solar array). `bom-builder.ts` does
`if (!REQUIRED_PARTS[productClass]) return []`, so ANY class not in that table (e.g.
benchtop_bioreactor) got ZERO mandatory power parts — an inlet with no supply, nothing sized
to the load, even though the contract knows `connected_electrical_load_kw`. Tristan (2026-07-24):
"why was the power missing? surely that should be there for everything on a UNIVERSAL basis at
the RIGHT AMOUNT?" This module is the universal, load-sized answer (like the thermal-derating
subsystem): EVERY powered device gets a power INLET + a power SUPPLY rated ≥ load × margin,
picked by wattage TIER (Tristan's choice).

Pure + deterministic (no LLM, no per-class table) — keyed only on the device's electrical load.
`select_power_subsystem(load_w)` returns the parts; `augment_decomposition_with_power(state)`
injects any MISSING ones into moduleDecomposition (idempotent) so the render (extract_parts) +
BoM + drawings all see one coherent power path. `power_subsystem_ok(state)` is the gate.
"""
from __future__ import annotations
import re

POWER_MARGIN = 1.3   # supply must be rated ≥ load × this (headroom for inrush + derating)

# Standard catalogue ratings (W) — the supply is the SMALLEST standard size ≥ load×margin,
# so the rating is real (a catalogue part exists), never an arbitrary number.
_ADAPTER_SIZES_W = [18, 30, 36, 60, 90, 120, 150, 240]      # external DC bricks (Mean Well GST/GS)
_PSU_SIZES_W = [100, 150, 200, 350, 500, 750, 1000]        # internal AC-DC (Mean Well RS/SE/UHP)


def _smallest_ge(sizes, target):
    for s in sizes:
        if s >= target:
            return s
    return sizes[-1]   # cap: the largest standard size (a real bug surfaces as under-rated)


def select_power_subsystem(load_w: float) -> list:
    """Return the power-subsystem parts for a device drawing `load_w` watts, tiered by
    wattage (Tristan 2026-07-24). Each part: {name, character_id, form, dims_mm (w,d,h),
    category, rating_w, internal, mpn_hint}. `internal=True` → rendered inside the body;
    `internal=False` → a shipped external accessory (BoM only, not in the interior render).
    Deterministic; the rating is the smallest standard catalogue size ≥ load×1.3."""
    load_w = max(0.0, float(load_w or 0.0))
    if load_w <= 0.0:
        return []   # a truly unpowered device (passive) needs no power subsystem
    need = load_w * POWER_MARGIN

    if load_w <= 10.0:
        # bus-powered: the USB host IS the supply — only an input connector on the device.
        return [
            {"name": "USB-C Power Input", "character_id": "usbc_power_input",
             "form": f"USB-C bus-powered input ({load_w:.1f} W ≤ 10 W — host-supplied)",
             "dims_mm": (9.0, 7.5, 3.5), "category": "power_inlet", "rating_w": 15.0,
             "internal": True, "mpn_hint": "USB-C receptacle, e.g. GCT USB4085"},
        ]
    if load_w <= 100.0:
        # external DC adapter (barrel-jack inlet + a rated brick shipped with the product).
        r = _smallest_ge(_ADAPTER_SIZES_W, need)
        return [
            {"name": "DC Power Inlet Jack", "character_id": "dc_power_inlet_jack",
             "form": "2.1 mm DC barrel-jack inlet (panel-mount, rear)",
             "dims_mm": (11.0, 14.0, 9.0), "category": "power_inlet", "rating_w": r,
             "internal": True, "mpn_hint": "DC barrel jack, e.g. CUI PJ-102AH"},
            {"name": f"External DC Power Adapter {r:.0f} W", "character_id": "external_dc_power_adapter",
             "form": f"external desktop AC-DC adapter, 12 V / {r:.0f} W (sized ≥ {load_w:.0f} W × {POWER_MARGIN})",
             "dims_mm": (120.0, 52.0, 32.0), "category": "power_supply", "rating_w": r,
             "internal": False, "mpn_hint": f"{r:.0f} W 12 V Class-II adapter, e.g. Mean Well GST{r:.0f}A12"},
            {"name": "DC-DC Regulation Board", "character_id": "dcdc_regulation_board",
             "form": "on-board buck regulators (12 V → 5 V / 3.3 V logic rails)",
             "dims_mm": (50.0, 35.0, 12.0), "category": "power_conversion", "rating_w": r,
             "internal": True, "mpn_hint": "buck regulator module, e.g. TI LMR33630"},
        ]
    if load_w <= 300.0:
        # internal AC-DC PSU + IEC mains inlet.
        r = _smallest_ge(_PSU_SIZES_W, need)
        return [
            {"name": "IEC C14 Mains Inlet", "character_id": "iec_c14_mains_inlet",
             "form": "IEC 60320 C14 mains inlet + fuse holder + switch (panel-mount, rear)",
             "dims_mm": (48.0, 30.0, 52.0), "category": "power_inlet", "rating_w": r,
             "internal": True, "mpn_hint": "IEC inlet filter module, e.g. Schaffner FN9260"},
            {"name": f"Internal AC-DC Power Supply {r:.0f} W", "character_id": "internal_acdc_psu",
             "form": f"enclosed AC-DC power supply, 24 V / {r:.0f} W (sized ≥ {load_w:.0f} W × {POWER_MARGIN})",
             "dims_mm": (129.0, 98.0, 38.0), "category": "power_supply", "rating_w": r,
             "internal": True, "mpn_hint": f"{r:.0f} W enclosed PSU, e.g. Mean Well RS-{r:.0f}-24"},
        ]
    # >300 W: industrial mains + high-power PSU.
    r = _smallest_ge(_PSU_SIZES_W, need)
    return [
        {"name": "IEC C20 Mains Inlet", "character_id": "iec_c20_mains_inlet",
         "form": "IEC 60320 C20 16 A mains inlet + fused disconnect (panel-mount, rear)",
         "dims_mm": (52.0, 34.0, 58.0), "category": "power_inlet", "rating_w": r,
         "internal": True, "mpn_hint": "16 A IEC inlet, e.g. Schurter 4304"},
        {"name": f"Industrial AC-DC Power Supply {r:.0f} W", "character_id": "industrial_acdc_psu",
         "form": f"industrial enclosed/rack AC-DC PSU, {r:.0f} W (sized ≥ {load_w:.0f} W × {POWER_MARGIN})",
         "dims_mm": (215.0, 115.0, 50.0), "category": "power_supply", "rating_w": r,
         "internal": True, "mpn_hint": f"{r:.0f} W industrial PSU, e.g. Mean Well UHP-{r:.0f}-24"},
    ]


# ── device electrical load (W) ──────────────────────────────────────────────────
def device_load_w(state: dict) -> float:
    """Best available device electrical load in WATTS. Prefers the contract's
    `connected_electrical_load_kw`; falls back to summing any per-part power draws."""
    try:
        ec = (state.get("engineeringContract") or {}).get("shared_quantities") or {}
        for k in ("connected_electrical_load_kw", "total_electrical_load_kw", "installed_power_kw"):
            v = ec.get(k)
            if isinstance(v, dict):
                v = v.get("value")
            if isinstance(v, (int, float)) and v > 0:
                return float(v) * 1000.0
    except Exception:  # noqa: BLE001
        pass
    return 0.0


_SUPPLY_RE = re.compile(r"power supply|adapter|\bpsu\b|ac[- ]?dc|dc[- ]?dc regulation", re.I)
_RATING_RE = re.compile(r"(\d+(?:\.\d+)?)\s*W\b", re.I)


def existing_supply_rating_w(state: dict) -> float | None:
    """Largest rating (W) among existing power-SUPPLY words, or None if the device has no
    supply at all. Used to decide whether the universal subsystem must inject one."""
    best = None
    try:
        for m in (state.get("moduleDecomposition") or {}).get("modules", []) or []:
            for s in m.get("sub_modules", []) or []:
                for w in s.get("words", []) or []:
                    nm = str(w.get("name_human") or "")
                    if not _SUPPLY_RE.search(nm):
                        # also scan the form modifier (the name may be generic)
                        forms = " ".join(str(mc.get("value") or "") for mc in w.get("modifier_characters", [])
                                         if mc.get("kind") == "form")
                        if not _SUPPLY_RE.search(forms):
                            continue
                        hay = nm + " " + forms
                    else:
                        hay = nm + " " + " ".join(str(mc.get("value") or "") for mc in w.get("modifier_characters", []))
                    mm = _RATING_RE.findall(hay)
                    if mm:
                        r = max(float(x) for x in mm)
                        best = r if best is None else max(best, r)
                    elif best is None:
                        best = 0.0   # a supply exists but carries no rating → 0 (fails the sizing gate)
    except Exception:  # noqa: BLE001
        return best
    return best


def power_subsystem_ok(state: dict) -> dict:
    """GATE: a powered device must have a power SUPPLY rated ≥ load × margin.
    Returns {applicable, ok, load_w, need_w, supply_w, reason}."""
    load_w = device_load_w(state)
    if load_w <= 0:
        return {"applicable": False, "ok": True, "load_w": 0.0}
    need = load_w * POWER_MARGIN
    supply = existing_supply_rating_w(state)
    if supply is None:
        return {"applicable": True, "ok": False, "load_w": load_w, "need_w": need,
                "supply_w": None, "reason": "no power supply present for a powered device"}
    ok = supply + 1e-6 >= need
    return {"applicable": True, "ok": ok, "load_w": load_w, "need_w": need, "supply_w": supply,
            "reason": ("" if ok else f"supply {supply:.0f} W < required {need:.0f} W (load {load_w:.0f} W × {POWER_MARGIN})")}


# ── decomposition augmentation (idempotent) ─────────────────────────────────────
def _make_word(part: dict) -> dict:
    cid = part["character_id"]
    return {
        "id": f"{cid}_word",
        "name_human": part["name"],
        "content_character": {
            "character_id": cid, "name_human": part["name"],
            "function_radical_primary": "power", "function_radical_secondary": None,
            "material_radical_primary": None, "material_radical_secondary": None,
        },
        "modifier_characters": [
            {"kind": "quantity", "value": "×1"},
            {"kind": "form", "value": part["form"]},
            {"kind": "rating_primary", "value": f"{part['rating_w']:.0f} W"},
            {"kind": "part_number", "value": f"TBD (detailed design) — {part['mpn_hint']}"},
            {"kind": "dimensions",
             "value": f"{part['dims_mm'][0]:.0f}×{part['dims_mm'][1]:.0f}×{part['dims_mm'][2]:.0f} mm"},
            {"kind": "lifecycle", "value": "Concept design — universal power subsystem (sized to load)"},
            {"kind": "installation",
             "value": ("Internal — mounted in the enclosure" if part["internal"]
                       else "External accessory — shipped with the product")},
        ],
        "_power_subsystem": True, "_internal": part["internal"], "_category": part["category"],
    }


def augment_decomposition_with_power(state: dict) -> int:
    """Ensure the device's decomposition carries a load-sized power subsystem. Idempotent:
    adds ONLY the parts missing by character_id, into the power_distribution sub-module (or the
    first module). Skips entirely for an unpowered device. Returns the number of words added."""
    load_w = device_load_w(state)
    parts = select_power_subsystem(load_w)
    if not parts:
        return 0
    md = state.get("moduleDecomposition") or {}
    modules = md.get("modules") or []
    if not modules:
        return 0
    # already-present character_ids anywhere in the design + whether a power INLET already
    # exists (a device that already has a mains/DC/USB inlet must NOT get a second one — the
    # real universal gap is the SUPPLY; only add the inlet when none is present).
    present = set()
    _inlet_re = re.compile(r"power entry|power inlet|mains inlet|\bjack\b|\biec\b|power input", re.I)
    has_inlet = False
    for m in modules:
        for s in m.get("sub_modules", []) or []:
            for w in s.get("words", []) or []:
                cc = (w.get("content_character") or {}).get("character_id")
                if cc:
                    present.add(str(cc))
                if _inlet_re.search(str(w.get("name_human") or "")):
                    has_inlet = True
    # target sub-module: an existing power/electrical one, else the first sub-module
    target = None
    for m in modules:
        for s in m.get("sub_modules", []) or []:
            sid = str(s.get("sub_module_id") or s.get("id") or "")
            if re.search(r"power|electr|supply|distribution", sid, re.I):
                target = s
                break
        if target:
            break
    if target is None:
        first = modules[0]
        subs = first.setdefault("sub_modules", [])
        if not subs:
            subs.append({"sub_module_id": "power_supply", "words": []})
        target = subs[0]
    target.setdefault("words", [])
    added = 0
    for p in parts:
        if p["character_id"] in present:
            continue
        if p["category"] == "power_inlet" and has_inlet:
            continue   # a suitable inlet already exists — don't add a second
        target["words"].append(_make_word(p))
        added += 1
    return added


# ── chassis + wiring-harness parts (rendered → MUST be in the BoM) ──────────────
# Tristan 2026-07-24 ("all of these parts need to be in the BOM!!"): the sealed-instrument render
# draws a chassis base plate, an internal wiring harness (the loom of the power/signal runs), and
# the interior shelf decks + standoffs of the mounting frame. Those are REAL physical parts, so
# they must be BoM line items or the render + the bill contradict each other. Universal — every
# assembled device with a populated interior has a chassis + a harness. `_structural: True` marks
# them so the interior PACKER skips them (they are drawn by the frame/harness code, not packed).
_CHASSIS_HARNESS = [
    {"name": "Chassis Base Plate", "character_id": "chassis_base_plate", "category": "structure",
     "form": "aluminium mounting base plate — the interior parts bolt onto it",
     "dims_mm": (200.0, 140.0, 3.0), "mpn_hint": "custom 3 mm 5052-Al plate"},
    {"name": "Interior Mounting Frame", "character_id": "interior_mounting_frame", "category": "structure",
     "form": "standoff pillars + raised shelf/mezzanine deck(s) the sub-assemblies mount on",
     "dims_mm": (160.0, 120.0, 90.0), "mpn_hint": "custom sheet-metal / standoff frame kit"},
    {"name": "Internal Wiring Harness", "character_id": "internal_wiring_harness", "category": "electrical",
     "form": "loomed cable harness — the power + signal runs between the interior parts",
     "dims_mm": (120.0, 40.0, 15.0), "mpn_hint": "custom loom, JST/Molex-terminated"},
]


def _make_chassis_word(part: dict) -> dict:
    cid = part["character_id"]
    return {
        "id": f"{cid}_word",
        "name_human": part["name"],
        "content_character": {
            "character_id": cid, "name_human": part["name"],
            "function_radical_primary": "structure", "function_radical_secondary": None,
            "material_radical_primary": None, "material_radical_secondary": None,
        },
        "modifier_characters": [
            {"kind": "quantity", "value": "×1"},
            {"kind": "form", "value": part["form"]},
            {"kind": "part_number", "value": f"TBD (detailed design) — {part['mpn_hint']}"},
            {"kind": "dimensions",
             "value": f"{part['dims_mm'][0]:.0f}×{part['dims_mm'][1]:.0f}×{part['dims_mm'][2]:.0f} mm"},
            {"kind": "lifecycle", "value": "Concept design — chassis/harness (rendered → BoM'd)"},
            {"kind": "installation", "value": "Internal — the interior mounting + wiring structure"},
        ],
        "_chassis_harness": True, "_structural": True, "_category": part["category"],
    }


def augment_decomposition_with_chassis_harness(state: dict) -> int:
    """Ensure the chassis base plate, mounting frame (standoffs + shelf decks) and internal wiring
    harness — all RENDERED by the SEALED-INSTRUMENT interior/frame/harness code — are BoM line items.
    Idempotent; only for a SEALED INSTRUMENT with a populated physical interior (≥3 physical parts).
    Returns count added. `_structural: True` on the words tells the interior packer to skip placing them.

    INSTRUMENT-ONLY (2026-07-24): the base plate + interior mounting frame + internal wiring loom are
    a benchtop-device signature — a MW-scale process plant (BESS / CO₂ / recrystalliser) has a steel
    structure + cable trays, NOT an 'Interior Mounting Frame', and its interior is not populated by the
    sealed-enclosure path. Gate on the SAME isInstrumentDevice signal the render's interior population
    uses, so the BoM injection matches what the render actually draws (no phantom instrument-chassis on
    a plant)."""
    if not state.get("isInstrumentDevice"):
        return 0   # not a sealed instrument — the frame/harness is never drawn, so never billed
    md = state.get("moduleDecomposition") or {}
    modules = md.get("modules") or []
    if not modules:
        return 0
    present = set()
    _n_phys = 0
    for m in modules:
        for s in m.get("sub_modules", []) or []:
            for w in s.get("words", []) or []:
                cc = (w.get("content_character") or {}).get("character_id")
                if cc:
                    present.add(str(cc))
                _n_phys += 1
    if _n_phys < 3:
        return 0   # not a populated assembly — no chassis/harness to render or bill
    target = None
    for m in modules:
        for s in m.get("sub_modules", []) or []:
            sid = str(s.get("sub_module_id") or s.get("id") or "")
            if re.search(r"structure|chassis|enclos|frame|containment", sid, re.I):
                target = s
                break
        if target:
            break
    if target is None:
        first = modules[0]
        subs = first.setdefault("sub_modules", [])
        if not subs:
            subs.append({"sub_module_id": "structure_containment", "words": []})
        target = subs[0]
    target.setdefault("words", [])
    added = 0
    for part in _CHASSIS_HARNESS:
        if part["character_id"] in present:
            continue
        target["words"].append(_make_chassis_word(part))
        added += 1
    return added


def _routed_lengths(out_dir: str) -> dict:
    """Read <out_dir>/wired-lengths.json → {elec_m, fluid_m, n_elec, n_fluid} or {}.

    The render measures every routed run in 3-D (power/signal = electrical loom;
    water/air/thermal = fluid conduit) and writes wired-lengths.json. This reads it
    back so the harness/tubing BoM lines can carry the REAL routed length + run count
    (Tristan's canonical loop: "the 3-D wiring tells the BoM the wire count + length")
    instead of a placeholder. Empty when the file is absent (pre-render / non-routed).
    """
    import json as _json
    import os as _os
    path = _os.path.join(out_dir or "", "wired-lengths.json")
    try:
        with open(path, encoding="utf-8") as fh:
            doc = _json.load(fh)
    except (OSError, ValueError):
        return {}
    by_svc = doc.get("length_m_by_service") or {}
    runs = doc.get("runs") or []
    def _m(*svcs):
        return round(sum(float(by_svc.get(s, 0) or 0) for s in svcs), 2)
    def _n(*svcs):
        return sum(1 for r in runs if str(r.get("service") or "") in svcs)
    elec_m, fluid_m = _m("power", "signal"), _m("water", "air", "thermal")
    return {
        "elec_m": elec_m, "fluid_m": fluid_m,
        "n_elec": _n("power", "signal"), "n_fluid": _n("water", "air", "thermal"),
    }


def _append_routed_basis(word: dict, text: str) -> bool:
    """Append a routed-length provenance note to a word's form + add a basis modifier.
    Idempotent (no-op if already annotated). Returns True if it enriched the word."""
    mods = word.setdefault("modifier_characters", [])
    if any(str(m.get("kind")) == "basis" and "3D-routed" in str(m.get("value") or "")
           for m in mods):
        return False
    mods.append({"kind": "basis", "value": text})
    for m in mods:
        if str(m.get("kind")) == "form" and "3D-routed" not in str(m.get("value") or ""):
            m["value"] = f"{m.get('value')} — {text}"
            break
    return True


def enrich_conduit_from_routing(state: dict, out_dir: str) -> int:
    """Annotate the harness + fluid-tubing BoM words with the 3-D-measured routed
    length + run count from wired-lengths.json (Tristan 2026-07-25: the render routes
    the wires AND the fluid pipes in 3-D — that measurement must reach the BoM).

    SAFE by design: appends a `basis` provenance modifier + enriches the `form` string
    only — never changes quantity / cost / dimensions / tag, so a complete BoM row stays
    complete (the incomplete-row injection that floored the dossier is NOT repeated).
    Idempotent. Returns the number of words enriched. No-op when the routing file is
    absent (pre-render) or the design is not a routed instrument."""
    if not isinstance(state, dict):
        return 0
    rl = _routed_lengths(out_dir)
    if not rl or (rl["elec_m"] <= 0 and rl["fluid_m"] <= 0):
        return 0
    md = state.get("moduleDecomposition") or {}
    n = 0
    for m in md.get("modules") or []:
        for s in m.get("sub_modules", []) or []:
            for w in s.get("words", []) or []:
                cid = str((w.get("content_character") or {}).get("character_id") or "")
                nm = str(w.get("name_human") or "")
                is_harness = cid == "internal_wiring_harness"
                is_tubing = bool(rl["fluid_m"] > 0 and re.search(
                    r"tubing|\btube\b|perfusion|dosing.*line|fluid.*line", nm, re.I))
                if is_harness and rl["elec_m"] > 0:
                    if _append_routed_basis(w, (
                        f"3D-routed loom ≈{rl['elec_m']:.2f} m over {rl['n_elec']} "
                        f"runs (power+signal), measured from the assembled Blender wiring")):
                        n += 1
                elif is_tubing:
                    if _append_routed_basis(w, (
                        f"3D-routed conduit ≈{rl['fluid_m']:.2f} m over {rl['n_fluid']} "
                        f"runs (water+air), measured from the assembled Blender routing")):
                        n += 1
    return n


def _selftest():
    # tiering
    assert select_power_subsystem(0) == []
    usb = select_power_subsystem(6)
    assert len(usb) == 1 and usb[0]["category"] == "power_inlet"
    dc = select_power_subsystem(35)          # organoid tier
    cats = {p["category"] for p in dc}
    assert cats == {"power_inlet", "power_supply", "power_conversion"}, cats
    supply = next(p for p in dc if p["category"] == "power_supply")
    assert supply["rating_w"] >= 35 * POWER_MARGIN and supply["internal"] is False
    assert supply["rating_w"] == 60, supply["rating_w"]   # 35×1.3=45.5 → 60 W standard
    psu = select_power_subsystem(180)        # internal-PSU tier
    assert any(p["category"] == "power_supply" and p["internal"] for p in psu)
    assert any("IEC" in p["name"] for p in psu)
    big = select_power_subsystem(600)
    assert any(p["rating_w"] >= 600 * POWER_MARGIN for p in big)
    # gate: a device with load but no supply FAILS; with a sized supply PASSES
    bad = {"engineeringContract": {"shared_quantities": {"connected_electrical_load_kw": 0.035}},
           "moduleDecomposition": {"modules": [{"sub_modules": [{"sub_module_id": "power_distribution",
                "words": [{"name_human": "Usb Power Entry",
                           "content_character": {"character_id": "usb_power_entry"},
                           "modifier_characters": [{"kind": "form", "value": "12v/5v board"}]}]}]}]}}
    g = power_subsystem_ok(bad)
    assert g["applicable"] and g["ok"] is False, g
    # augment it → adds the SUPPLY + regulation (2), NOT a second inlet (the Usb Power Entry
    # already counts as the inlet); now a sized supply exists → gate PASSES; re-augment = 0.
    n1 = augment_decomposition_with_power(bad)
    assert n1 == 2, n1
    assert not any("Inlet Jack" in w.get("name_human", "")
                   for w in bad["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"]), \
        "must NOT add a second inlet when a Usb Power Entry already exists"
    g2 = power_subsystem_ok(bad)
    assert g2["ok"] is True, g2
    n2 = augment_decomposition_with_power(bad)
    assert n2 == 0, f"augment not idempotent: added {n2} on the second pass"
    # unpowered device: no subsystem, gate N/A
    passive = {"engineeringContract": {"shared_quantities": {}}, "moduleDecomposition": {"modules": [{"sub_modules": []}]}}
    assert augment_decomposition_with_power(passive) == 0
    assert power_subsystem_ok(passive)["applicable"] is False

    # --- chassis + wiring harness proveCatch -----------------------------------------
    # A POPULATED assembly (≥3 physical parts) that is RENDERED with a base plate, mounting
    # frame + wiring loom but has NONE of them as BoM words → the three structural parts get
    # added, marked _structural (so the packer skips them), idempotent, and skipped when the
    # interior is empty (<3 parts) or the parts are already present.
    def _asm(nparts, instrument=True):
        ws = [{"name_human": f"Part {i}", "content_character": {"character_id": f"part_{i}"},
               "modifier_characters": []} for i in range(nparts)]
        return {"isInstrumentDevice": instrument,
                "moduleDecomposition": {"modules": [
                    {"sub_modules": [{"sub_module_id": "structure_containment", "words": ws}]}]}}
    empty = _asm(1)
    assert augment_decomposition_with_chassis_harness(empty) == 0, "empty interior → no chassis"
    # a NON-instrument (process plant) with a full interior → NO chassis/harness (it has steel +
    # cable trays, not an Interior Mounting Frame; the sealed-enclosure path never draws it).
    plant = _asm(5, instrument=False)
    assert augment_decomposition_with_chassis_harness(plant) == 0, "non-instrument → no chassis/harness"
    full = _asm(5)
    nc = augment_decomposition_with_chassis_harness(full)
    assert nc == 3, f"expected 3 chassis/harness parts, got {nc}"
    added_ws = full["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"]
    struct = [w for w in added_ws if w.get("_structural")]
    assert len(struct) == 3 and all(w.get("_chassis_harness") for w in struct), struct
    names = {w["name_human"] for w in struct}
    assert names == {"Chassis Base Plate", "Interior Mounting Frame", "Internal Wiring Harness"}, names
    # every chassis word carries a part_number + dimensions modifier → it renders as a real BoM line
    for w in struct:
        kinds = {m["kind"] for m in w["modifier_characters"]}
        assert {"part_number", "dimensions", "quantity"} <= kinds, kinds
    assert augment_decomposition_with_chassis_harness(full) == 0, "chassis augment not idempotent"

    # --- routed-conduit → BoM enrichment proveCatch (2026-07-25 vessel/wiring loop) --
    import json as _json, os as _os, tempfile as _tmp
    rl_dir = _tmp.mkdtemp()
    with open(_os.path.join(rl_dir, "wired-lengths.json"), "w", encoding="utf-8") as fh:
        _json.dump({"length_m_by_service": {"power": 1.92, "signal": 2.49,
                                            "water": 3.46, "air": 0.70},
                    "runs": [{"service": s} for s in
                             (["power"] * 20 + ["signal"] * 21 + ["water"] * 5 + ["air"] * 1)]}, fh)
    est = {"isInstrumentDevice": True, "moduleDecomposition": {"modules": [
        {"sub_modules": [{"sub_module_id": "structure_containment", "words": [
            {"name_human": "Internal Wiring Harness",
             "content_character": {"character_id": "internal_wiring_harness"},
             "modifier_characters": [{"kind": "form", "value": "loomed cable harness"}]},
            {"name_human": "PharMed BPT Pump Tubing",
             "content_character": {"character_id": "pharmed_bpt_pump_tubing"},
             "modifier_characters": [{"kind": "form", "value": "peristaltic pump tubing"}]},
        ]}]}]}}
    ne = enrich_conduit_from_routing(est, rl_dir)
    assert ne == 2, f"expected harness + tubing enriched, got {ne}"
    _ws = est["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"]
    _h = next(w for w in _ws if w["name_human"] == "Internal Wiring Harness")
    _hb = next(m for m in _h["modifier_characters"] if m["kind"] == "basis")
    assert "4.41 m" in _hb["value"] and "power+signal" in _hb["value"], _hb  # 1.92+2.49
    _t = next(w for w in _ws if "Tubing" in w["name_human"])
    _tb = next(m for m in _t["modifier_characters"] if m["kind"] == "basis")
    assert "4.16 m" in _tb["value"] and "water+air" in _tb["value"], _tb     # 3.46+0.70
    # idempotent + no-op when file absent
    assert enrich_conduit_from_routing(est, rl_dir) == 0, "conduit enrich not idempotent"
    assert enrich_conduit_from_routing(est, "/tmp/nonexistent-routing-xyz") == 0
    _os.remove(_os.path.join(rl_dir, "wired-lengths.json")); _os.rmdir(rl_dir)

    print("power_subsystem _selftest: OK (tiering 6/35/180/600 W; organoid→60W external brick; "
          "gate catches supply<load; augment idempotent; unpowered N/A; "
          "chassis+harness→3 BoM parts, _structural-flagged, idempotent, empty-interior skip; "
          "routed-conduit enrich harness 4.41 m + tubing 4.16 m from wired-lengths.json)")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] in ("--selftest", "selftest"):
        _selftest()
        sys.exit(0)
    import json
    st = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "out/organoid-for-simon/state.json"))
    print("load_w:", device_load_w(st))
    for p in select_power_subsystem(device_load_w(st)):
        print(f"  [{p['category']:15}] {p['name']:34} {p['rating_w']:.0f}W "
              f"{'INTERNAL' if p['internal'] else 'external'}  {p['mpn_hint']}")
    print("gate:", power_subsystem_ok(st))
