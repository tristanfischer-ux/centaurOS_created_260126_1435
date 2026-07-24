#!/usr/bin/env python3
"""interior_geometry.py — universal function→mesh library for the sealed-instrument
see-inside render (2026-07-23).

The see-inside (ghost / cutaway) render was near-EMPTY while the GA drawing showed a
full interior: the 33 manifest parts were co-located clay proxies (108 clashes) that the
render clutter-suppressed, leaving ~7 tiny story meshes. interior_pack.py fixed the
LAYOUT (non-overlapping single-layer pack). This module fixes the GEOMETRY: it turns each
manifest part into a RECOGNIZABLE component mesh, keyed on the part's FUNCTION vocabulary
(a controlled regex taxonomy on the name noun — NEVER a product-class table), sized
PARAMETRICALLY from the part's real dims, so the render is coherent with the GA drawing
BY CONSTRUCTION (same source, same positions) — not by a second gate.

Council doctrine (2026-07-23, 6 seats) baked in here:
  * parametric FROM dims (cyl radius/length derived), never a raw scale of a stock mesh;
  * ONE origin datum — the part CENTRE (matches interior_pack + fl.add_box centre place);
  * controlled taxonomy, ~13 families, cap it; unmatched → bevelled box + COVERAGE_GAP log
    (the growth mechanism — the library grows, the fallback is never silently "fine");
  * a dims-sanity clamp (universal, noun-keyed) catches physically-absurd sizer output
    (the 200×200×100 mm "thermal interface pad" — a thin gap-film that fell to a
    plant-scale TYPE_DEFAULTS box) BEFORE it inflates the pack + dominates the render;
  * a visibility filter hides genuine fasteners (standoff/screw/washer/…) for legibility.

Pure helpers (function_family / sane_dims / is_hidden_fastener / material_role) are
Blender-free and unit-tested via --selftest. build_component() is the thin bpy dispatch.
"""
from __future__ import annotations
import re
import math

# ── controlled function taxonomy — regex on the name noun → a family token ──────
# Order matters: earliest match wins, so specific families precede generic ones.
# Every rule is a universal noun signal (pump/vessel/fan/…), never a product slug.
_FAMILY_RULES = [
    ("led",       r"\bled\b|indicator|lamp|pilot light"),
    ("fastener",  r"standoff|screw|washer|\bnut\b|\bclip\b|bracket|strain relief|"
                  r"\bcable\b|\bwire\b|\blabel\b|cable tie|grommet|zip tie"),
    ("pcb",       r"\bpcb\b|\bboard\b|motherboard|backplane|mcu|microcontroller|"
                  r"controller|logic|daughterboard|processor"),
    # sensor precedes vessel so "Culture Temperature Probe" reads as a probe, not a
    # culture vessel (the "culture" modifier must not out-vote the "probe" noun).
    ("sensor",    r"sensor|\bprobe\b|thermocouple|detector|optical density|photodiode|"
                  r"thermometer|tachometer|encoder|flow meter|\bod\b"),
    ("vessel",    r"vessel|culture|reactor|bioreactor|\bvial\b|flask|chamber|"
                  r"cuvette|\btube\b flask|beaker|well ?plate"),
    ("pump",      r"pump|peristaltic|diaphragm|dosing"),
    ("motor",     r"\bmotor\b|stirrer|\bdrive\b|servo|actuator|spindle|impeller|agitat"),
    ("fan",       r"\bfan\b|blower|ventilat|\bcooler\b(?! plate)"),
    ("thermal",   r"peltier|\btec\b|heater|heatsink|heat ?sink|cold ?plate|"
                  r"thermal (?:pad|interface|insulation|tape)|thermoelectric|fin stack"),
    ("tubing",    r"tubing|\bhose\b|\bline\b|manifold|\bduct\b|fitting|barb"),
    ("valve",     r"\bvalve\b|solenoid|regulator|pinch"),
    ("filter",    r"\bfilter\b|\bvent\b|grille|louvre|mesh|membrane|sterile"),
    ("connector", r"connector|\bport\b|\busb\b|\bbnc\b|\bjack\b|header|power entry|"
                  r"interface|bridge|isolator|terminal|socket|plug|receptacle"),
    ("panel",     r"display|screen|lcd|oled|touchscreen|keypad|fascia"),
    # passive board-level electronics (protection / EMC / discretes) — small SMD blocks
    # that mount on the board. Kept LAST so specific families (connector/pcb) win first.
    ("component", r"protection|\bemc\b|ferrite|\bbead\b|polyfuse|\bfuse\b|\bdiode\b|"
                  r"capacitor|resistor|inductor|creepage|varistor|\btvs\b|snubber|network"),
]

# families whose meshes we HIDE on the see-inside for legibility (council visibility
# filter): tiny mechanical fasteners add clash-free clutter and no story. Electronics
# stay (they read as components on the board). Keyed on the fastener family only.
_HIDDEN_FAMILIES = {"fastener"}

# material role per family — a small stylized palette so coarse parts read as
# deliberate, not broken (council: "unified stylized material").
_FAMILY_MATERIAL = {
    "led":       "emissive",
    "fastener":  "steel",
    "pcb":       "pcb_green",
    "vessel":    "glass",
    "pump":      "polymer",
    "motor":     "steel",
    "fan":       "polymer",
    "thermal":   "alu",
    "sensor":    "dark_plastic",
    "tubing":    "clear_tube",
    "valve":     "brass",
    "filter":    "grey_plastic",
    "connector": "dark_plastic",
    "panel":     "screen",
    "component": "dark_plastic",
    "box":       "grey_plastic",   # fallback family
}


def function_family(name: str, shape: str | None = None) -> str:
    """Map a part name (+ optional manifest shape) to a controlled function family.

    Pure + universal: a regex sweep over the name noun. `shape` is a weak fallback
    hint only (a 'cylinder'/'vessel' manifest shape → vessel) when the name matched
    nothing. Unmatched → 'box' (the caller logs a COVERAGE_GAP + builds a bevelled
    box — the growth signal, never a silent pass)."""
    nm = str(name or "").lower()
    for fam, pat in _FAMILY_RULES:
        if re.search(pat, nm):
            return fam
    sh = str(shape or "").lower()
    if sh in ("cylinder", "vessel", "tank", "capped_cylinder"):
        return "vessel"
    if sh in ("board", "pcb", "plate"):
        return "pcb"
    return "box"


# ── universal dims-sanity clamp ─────────────────────────────────────────────────
# A benchtop instrument's INTERIOR part cannot be plant-scale. The sizer's static
# TYPE_DEFAULTS box leaks a 200×200×100 mm "thermal interface pad" (a thin gap film)
# and metre-ish boxes for other unmodified parts. This clamps by noun BEFORE packing +
# render so one bogus part can't dominate the layout. Universal (noun signal), guarded
# (selftest). NOTE: the true source rule is the plant-scale TYPE_DEFAULTS fallthrough in
# build_universal_scene (device-scale-leak family) — this is the render-side authority +
# guard; a chain re-run should also fix TYPE_DEFAULTS for isWattScaleInstrument parts.
_THIN_FILM = re.compile(
    r"thermal (?:pad|interface|tape)|gap ?pad|thermal ?pad|insulation|"
    r"\bgasket\b|\blabel\b|\bfilm\b|\bshim\b|\bfoil\b|thermal interface", re.I)

# a benchtop instrument interior part is implausible past this on any axis
_MAX_INTERIOR_PART_MM = 160.0
_MAX_THIN_FILM_THICK_MM = 5.0
_MAX_THIN_FILM_FOOTPRINT_MM = 90.0


def sane_dims(name: str, dims) -> tuple[float, float, float]:
    """Clamp physically-implausible interior-part dims (universal, noun-keyed).

    Returns (w, d, h) mm. Two rules:
      1. THIN-FILM parts (thermal pad/interface/tape, insulation, gasket, label, film,
         shim, foil) — a plant-scale box here is always wrong; clamp thickness ≤5 mm and
         footprint ≤90 mm (the SHORTEST axis is the film thickness).
      2. Any interior part with an axis >160 mm on a benchtop instrument is a sizer leak
         — clamp that axis to 160 mm (keeps aspect on the other two)."""
    w, d, h = (float(dims[0]), float(dims[1]), float(dims[2]))
    if _THIN_FILM.search(str(name or "")):
        axes = sorted([w, d, h])
        thick = min(axes[0], _MAX_THIN_FILM_THICK_MM)
        foot_a = min(axes[1], _MAX_THIN_FILM_FOOTPRINT_MM)
        foot_b = min(axes[2], _MAX_THIN_FILM_FOOTPRINT_MM)
        # preserve which axis was the thin one (h is usually the film thickness)
        if h <= w and h <= d:
            return (foot_b, foot_a, thick)
        if w <= d and w <= h:
            return (thick, foot_b, foot_a)
        return (foot_b, thick, foot_a)
    return (min(w, _MAX_INTERIOR_PART_MM),
            min(d, _MAX_INTERIOR_PART_MM),
            min(h, _MAX_INTERIOR_PART_MM))


def is_hidden_fastener(name: str) -> bool:
    """Visibility filter: True for genuine mechanical fasteners we hide on the
    see-inside for legibility (council). Electronics never match here."""
    return function_family(name) in _HIDDEN_FAMILIES


def material_role(family: str) -> str:
    return _FAMILY_MATERIAL.get(family, "grey_plastic")


# ── bpy geometry dispatch (thin — the primitives live in forge_blender_lib) ─────
_MAT_RGB = {
    "emissive":     (0.95, 0.35, 0.15),
    "steel":        (0.62, 0.64, 0.68),
    "pcb_green":    (0.10, 0.42, 0.20),
    "glass":        (0.80, 0.90, 0.92),
    "polymer":      (0.22, 0.24, 0.28),
    "alu":          (0.78, 0.80, 0.83),
    "dark_plastic": (0.10, 0.11, 0.13),
    "clear_tube":   (0.75, 0.85, 0.90),
    "brass":        (0.72, 0.60, 0.28),
    "grey_plastic": (0.40, 0.42, 0.45),
    "screen":       (0.05, 0.10, 0.16),
}


def _mat(fl, cache, role):
    if role in cache:
        return cache[role]
    rgb = _MAT_RGB.get(role, (0.40, 0.42, 0.45))
    kw = {}
    if role == "glass" or role == "clear_tube":
        kw = dict(metallic=0.0, roughness=0.08, alpha=0.35, ior=1.46)
    elif role in ("steel", "alu"):
        kw = dict(metallic=0.9, roughness=0.35)
    elif role == "brass":
        kw = dict(metallic=0.85, roughness=0.30)
    elif role == "emissive":
        kw = dict(emission_strength=2.5, roughness=0.4)
    elif role == "screen":
        kw = dict(metallic=0.1, roughness=0.15, emission_strength=0.4)
    else:
        kw = dict(metallic=0.05, roughness=0.55)
    m = fl.make_mat(f"m_se_int_{role}", fl._to_linear(rgb), **kw)
    cache[role] = m
    return m


def build_component(fl, prefix, family, centre_mm, dims_mm, mat_cache,
                    module=None, module_objects=None, rot_swap=False, orient="flat"):
    """Build a recognizable component at CENTRE `centre_mm` (Blender metres via fl.MM),
    sized parametrically from `dims_mm` (mm). Returns the list of created objects.

    ONE datum: centre. `rot_swap` (from the packer) means the long footprint axis was
    swapped to run along +x — we swap w/d so the mesh matches the packed AABB.
    `orient="vertical_back"` (2026-07-24) stands a flat board UP against the back wall: every
    primitive is rotated 90° about X (local y↔z: size (sx,sy,sz)→(sx,sz,sy), offset
    (ox,oy,oz)→(ox,-oz,oy)), so the mesh matches the packer's vertical world_dims (w, thin, d)."""
    MM = fl.MM
    w, d, h = (float(dims_mm[0]), float(dims_mm[1]), float(dims_mm[2]))
    if rot_swap:
        w, d = max(w, d), min(w, d)
    cx, cy, cz = (centre_mm[0] * MM, centre_mm[1] * MM, centre_mm[2] * MM)
    role = material_role(family)
    mat = _mat(fl, mat_cache, role)
    objs = []
    _vert = (orient == "vertical_back")

    def _xf_size(s):
        return (s[0], s[2], s[1]) if _vert else s

    def _xf_off(o):
        return (o[0], -o[2], o[1]) if _vert else o

    def box(sfx, size, off=(0, 0, 0), material=None):
        size = _xf_size(size); off = _xf_off(off)
        o = fl.add_box(f"{prefix}_{sfx}",
                       (cx + off[0] * MM, cy + off[1] * MM, cz + off[2] * MM),
                       (size[0] * MM, size[1] * MM, size[2] * MM),
                       material or mat, module=module, module_objects=module_objects)
        objs.append(o)
        return o

    def cyl(sfx, radius, height, off=(0, 0, 0), rotation=(0, 0, 0), material=None):
        off = _xf_off(off)
        if _vert:  # stand the cylinder axis up-vs-into-wall: add a 90° X rotation
            rotation = (rotation[0] + math.radians(90), rotation[1], rotation[2])
        o = fl.add_cyl(f"{prefix}_{sfx}",
                       (cx + off[0] * MM, cy + off[1] * MM, cz + off[2] * MM),
                       radius * MM, height * MM, material or mat,
                       module=module, module_objects=module_objects, rotation=rotation)
        objs.append(o)
        return o

    if family == "vessel":
        r = min(w, d) / 2.0
        cyl("body", r, h * 0.86)
        cyl("cap", r * 1.06, h * 0.10, off=(0, 0, h * 0.48))          # lid collar
        cyl("neck", r * 0.5, h * 0.14, off=(0, 0, h * 0.55))          # port neck

    elif family == "pump":
        box("body", (w, d, h * 0.75), off=(0, 0, -h * 0.12))
        cyl("head", min(w, d) * 0.42, h * 0.5,
            off=(0, -d * 0.1, h * 0.30), rotation=(math.radians(90), 0, 0),
            material=_mat(fl, mat_cache, "dark_plastic"))            # rotor head

    elif family == "motor":
        # NB: add_compound_motor takes radius/length in BLENDER METRES → *MM here.
        r = min(w, d) / 2.0
        motor_parts = fl.add_compound_motor(
            f"{prefix}_m", (cx, cy, cz), r * MM, h * 0.8 * MM, mat,
            material_shaft=_mat(fl, mat_cache, "steel"),
            module=module, module_objects=module_objects)
        objs.extend(motor_parts or [])
        objs.append(box("plate", (w, d, max(2.0, h * 0.05)), off=(0, 0, -h * 0.48)))

    elif family == "fan":
        box("shroud", (w, d, h), material=_mat(fl, mat_cache, "polymer"))
        cyl("hub", min(w, d) * 0.22, h * 0.5, material=_mat(fl, mat_cache, "dark_plastic"))
        for i in range(5):
            ang = i * (2 * math.pi / 5)
            box(f"blade{i}", (min(w, d) * 0.40, min(w, d) * 0.06, h * 0.6),
                off=(math.cos(ang) * w * 0.22, math.sin(ang) * d * 0.22, 0),
                material=_mat(fl, mat_cache, "dark_plastic"))

    elif family == "pcb":
        box("board", (w, d, max(1.6, h * 0.12)), off=(0, 0, -h * 0.40))
        # a few SMD blocks + a connector header so it reads as a populated board
        box("ic", (w * 0.28, d * 0.28, max(2.0, h * 0.35)),
            off=(-w * 0.18, d * 0.10, -h * 0.10), material=_mat(fl, mat_cache, "dark_plastic"))
        box("hdr", (w * 0.5, d * 0.10, max(2.0, h * 0.3)),
            off=(0, -d * 0.35, -h * 0.10), material=_mat(fl, mat_cache, "steel"))

    elif family == "thermal":
        # peltier/heatsink → finned block; thin pad → flat plate
        if h < 8.0 or max(w, d) / max(1.0, h) > 8.0:
            box("pad", (w, d, h))
        else:
            fl.add_compound_finned_heatsink(
                f"{prefix}_hs", (cx, cy, cz), w * MM, d * MM, h * MM, mat,
                n_fins=max(6, int(w / 8)),
                module=module, module_objects=module_objects)
            objs.append(box("base", (w, d, max(2.0, h * 0.1)), off=(0, 0, -h * 0.44)))

    elif family == "sensor":
        # slim upright rod (probe) if tall, else a small housing
        if h > max(w, d) * 1.5:
            cyl("rod", max(w, d) * 0.45, h)
            cyl("tip", max(w, d) * 0.30, h * 0.14, off=(0, 0, h * 0.5),
                material=_mat(fl, mat_cache, "steel"))
        else:
            box("body", (w, d, h))

    elif family == "tubing":
        # a short bundle of parallel tubes (structural media-tubing coil proxy)
        r = min(h, min(w, d) / 3.0) / 2.0
        for i in range(3):
            cyl(f"t{i}", max(1.5, r), w,
                off=(0, (i - 1) * d * 0.3, 0), rotation=(0, math.radians(90), 0),
                material=_mat(fl, mat_cache, "clear_tube"))

    elif family == "valve":
        box("body", (w, d, h * 0.7), off=(0, 0, -h * 0.15))
        cyl("stem", min(w, d) * 0.2, h * 0.5, off=(0, 0, h * 0.35),
            material=_mat(fl, mat_cache, "steel"))

    elif family == "connector":
        box("shell", (w, d, h))
        box("mouth", (w * 0.7, d * 0.4, h * 0.5), off=(0, -d * 0.3, 0),
            material=_mat(fl, mat_cache, "steel"))

    elif family == "filter":
        box("frame", (w, d, h))
        for i in range(3):
            box(f"slot{i}", (w * 0.7, d * 0.06, h * 0.7),
                off=(0, (i - 1) * d * 0.25, 0), material=_mat(fl, mat_cache, "dark_plastic"))

    elif family == "panel":
        box("bezel", (w, d, h))
        box("screen", (w * 0.85, d * 0.85, max(1.0, h * 0.2)), off=(0, 0, h * 0.42),
            material=_mat(fl, mat_cache, "screen"))

    elif family == "led":
        cyl("dome", min(w, d) * 0.5, h, material=mat)

    elif family == "component":
        # a small SMD-ish block with a thin lead strip — reads as a discrete on the board
        box("body", (w, d, h))
        box("lead", (w * 0.9, d * 0.25, max(0.6, h * 0.15)), off=(0, d * 0.42, -h * 0.35),
            material=_mat(fl, mat_cache, "steel"))

    elif family == "fastener":
        # low-visual-weight post (hidden by the visibility filter anyway)
        cyl("post", max(1.5, min(w, d) * 0.45), h)

    else:  # box fallback
        box("box", (w, d, h))

    return objs


# ── selftest (proveCatch) ───────────────────────────────────────────────────────
def _selftest():
    # the real organoid interior part set → every part classifies; the taxonomy covers it
    organoid = [
        "Magnetic Stirrer Drive", "Cable Strain Relief", "Dosing Peristaltic Pump",
        "Front Panel Connector Ports", "Culture Vessel", "Sterile Filter Vent",
        "Pcb Mounting Standoff", "Media Tubing Set", "Vial Holder Fixture",
        "Temperature Sensor", "Heatsink Fan", "Reverse Polarity Protection",
        "Power Indicator LED", "Esd Protection Network", "Usb Power Entry",
        "Ferrite Emc Bead", "Peltier Tec Module", "Thermal Insulation",
        "Thermal Interface Pad", "Current Limit Polyfuse", "Usb Interface",
        "Microcontroller Mcu", "Sensor Cable", "Input Protection Network",
        "Optical Density Sensor", "Culture Temperature Probe", "Stir Tachometer Sense",
        "Flow Sensor", "Debug Header", "Host Protocol Bridge", "Galvanic Isolator",
        "Wet Bench Creepage Slot", "Safety Label Set",
    ]
    fams = {n: function_family(n) for n in organoid}
    # spot-check the load-bearing mappings
    assert fams["Culture Vessel"] == "vessel", fams["Culture Vessel"]
    assert fams["Dosing Peristaltic Pump"] == "pump", fams["Dosing Peristaltic Pump"]
    assert fams["Magnetic Stirrer Drive"] == "motor", fams["Magnetic Stirrer Drive"]
    assert fams["Heatsink Fan"] == "fan", fams["Heatsink Fan"]
    assert fams["Peltier Tec Module"] == "thermal", fams["Peltier Tec Module"]
    assert fams["Microcontroller Mcu"] == "pcb", fams["Microcontroller Mcu"]
    assert fams["Optical Density Sensor"] == "sensor", fams["Optical Density Sensor"]
    assert fams["Media Tubing Set"] == "tubing", fams["Media Tubing Set"]
    assert fams["Power Indicator LED"] == "led", fams["Power Indicator LED"]
    assert fams["Pcb Mounting Standoff"] == "fastener", fams["Pcb Mounting Standoff"]
    assert fams["Usb Power Entry"] == "connector", fams["Usb Power Entry"]
    assert fams["Sterile Filter Vent"] == "filter", fams["Sterile Filter Vent"]
    assert fams["Esd Protection Network"] == "component", fams["Esd Protection Network"]
    assert fams["Ferrite Emc Bead"] == "component", fams["Ferrite Emc Bead"]
    assert fams["Current Limit Polyfuse"] == "component", fams["Current Limit Polyfuse"]
    # coverage: no organoid part falls to the raw 'box' fallback (taxonomy is complete)
    gaps = [n for n, f in fams.items() if f == "box"]
    assert not gaps, f"COVERAGE_GAP (extend the taxonomy): {gaps}"
    # visibility filter: only genuine fasteners are hidden
    assert is_hidden_fastener("Pcb Mounting Standoff")
    assert is_hidden_fastener("Cable Strain Relief")
    assert not is_hidden_fastener("Culture Vessel")
    assert not is_hidden_fastener("Microcontroller Mcu")
    # dims-sanity: the 200×200×100 thermal pad clamps to a thin film; a real part is untouched
    sd = sane_dims("Thermal Interface Pad", (200.0, 200.0, 100.0))
    assert max(sd) <= _MAX_THIN_FILM_FOOTPRINT_MM and min(sd) <= _MAX_THIN_FILM_THICK_MM, sd
    assert sane_dims("Culture Vessel", (38.0, 100.0, 19.0)) == (38.0, 100.0, 19.0)
    # oversized non-film part clamps to the interior cap
    assert max(sane_dims("Mystery Block", (400.0, 50.0, 50.0))) <= _MAX_INTERIOR_PART_MM
    # proveCatch the growth mechanism: an unknown noun DOES fall to box (and would log)
    assert function_family("Quantum Flux Widget") == "box"
    print(f"interior_geometry _selftest: OK ({len(organoid)} organoid parts classified, "
          f"0 coverage gaps, thin-film clamp fires, fastener filter correct)")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] in ("--selftest", "selftest"):
        _selftest()
        sys.exit(0)
    # ad-hoc: classify a manifest
    import json
    mf = sys.argv[1] if len(sys.argv) > 1 else "out/organoid-for-simon/parts-manifest.json"
    pm = json.load(open(mf))
    for p in pm.get("parts", []):
        nm = str(p.get("name", ""))
        if "shell" in nm.lower():
            continue
        fam = function_family(nm, p.get("shape"))
        d = p.get("dims_mm") or {}
        raw = (d.get("w", 5), d.get("d", 5), d.get("h", 5))
        sd = sane_dims(nm, raw)
        flag = "  <-- CLAMPED" if tuple(round(x, 1) for x in sd) != tuple(round(x, 1) for x in raw) else ""
        gap = "  <-- COVERAGE_GAP" if fam == "box" else ""
        print(f"  {fam:10} {nm:32} {raw} -> {tuple(round(x,1) for x in sd)}{flag}{gap}")
