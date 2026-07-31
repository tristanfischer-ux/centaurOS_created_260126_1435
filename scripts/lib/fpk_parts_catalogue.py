#!/usr/bin/env python3
"""Pure layout planner for the parts-on-paper catalogue (14-product-parts-catalogue).

INTENT (2026-07-31 Tristan): "all the parts almost laid out on a big piece of
paper" so every kit part can be INVENTORIED by eye — not another coaxial explode
cloud. The engine could already prove parts exist in JSON (coverage ok=true,
authenticity 1.0) while a human still could not point at one. This module is the
SOURCE rule for that view's geometry.

DECISION — one cell per part FAMILY, labelled "Name xN", not one cell per mesh:
218 unlabelled meshes is the cloud Tristan already rejected; 109 labelled family
cells is an inventory. The xN count is what proves every instance is in the
system, and sum(counts) == inventoriable mesh total is an invariant (below), so
collapsing siblings can never silently drop parts.

DECISION — UNIFORM cells, each part scaled to fit, TRUE SIZE PRINTED in the
caption. Superseded the first attempt (2026-07-31 SIGHT), which preserved true
relative scale by packing size-sorted rows at each row's own pitch. Rendered, that
produced a monotonic size gradient whose last rows were an illegible smear: this
kit spans 52:1 (420 mm pack housing to an 8 mm bolt), so at true relative scale
the smaller half of the inventory is invisible — which defeats the only thing the
view exists to do. Engineering parts catalogues have always solved this the same
way: uniform frames, each item scaled to its frame, the real dimension written
next to it. The caption carries "Name xN" plus the representative's true
footprint in mm, so nothing about size is hidden — it is stated in text, which is
more useful at a glance than a 7-pixel dot. Geometry scaling is a VIEW pose,
restored on exit like the explode's location snapshot.

This module is deliberately bpy-free so the layout maths is unit-testable and the
proveCatch below is real geometry, not a render-time assert. See
build_universal_scene._fpk_apply_parts_catalogue_view for the Blender consumer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

# ── Admission ────────────────────────────────────────────────────────────────
# Story meshes carry the traction-drive prefix. Anything else is scene context.
_TD_PREFIX = "u_se_td_"

# Scene anchors + context geometry: these are NOT kit parts and must never be
# inventoried (a "vehicle HV endpoint" is where the loom leaves the kit, not a
# line item). Keyed on role prefixes, never a hand-listed part table.
# GOTCHA (2026-07-31): a bare "u_se_td_ground" prefix also swallowed
# `u_se_td_ground_stud` — an earth-bonding stud, a real kit part. Datum helpers
# are named explicitly so a part noun sharing the stem is never dropped.
_CATALOGUE_SKIP_PREFIXES = (
    "u_se_td_vehicle",       # vehicle-side endpoints (loom/coolant terminations)
    "u_se_td_ground_plane",  # scene datum helpers only — NOT ground_stud
    "u_se_td_ground_datum",
    "u_se_td_ground_ref",
    "u_se_td_endpoint",      # abstract connection anchors
    "u_se_td_bay",           # bay walls = install context, not kit content
)

# Tooth fragments are geometry DETAIL on a parent gear body, not separate parts.
# Exploding them produced the sphere clutter Tristan rejected in 13; in the
# catalogue they stay nested on their parent so the gear reads as one item.
_CATALOGUE_FRAGMENT_PREFIXES = (
    "u_se_td_sun_gear_tooth",
    "u_se_td_ring_gear_tooth",
    "u_se_td_planet_tooth",
    "u_se_td_output_gear_tooth",
)

# Acronyms that must not be title-cased into nonsense ("Sic" / "Pcb" / "Hv").
_ACRONYMS = {
    "sic": "SiC", "pcb": "PCB", "pe": "PE", "hv": "HV", "lv": "LV",
    "mcu": "MCU", "hvil": "HVIL", "dclink": "DC-link", "gd": "GD",
    "oil": "oil", "in": "in", "out": "out",
}

# Section-view clones carry a `section_` infix; they are the same part.
_SECTION_INFIX = "u_se_td_section_"


def catalogue_family(mesh_name: str) -> Optional[str]:
    """Family key for one mesh, or None when the mesh is not inventoriable.

    Sibling instances collapse to one family: every `_<digits>` segment is
    stripped wherever it appears, so magnet_0..7 -> magnet and
    microjet_0_3 -> microjet, while phase_bus_0_leg_h -> phase_bus_leg_h.
    """
    nm = (mesh_name or "").strip()
    if not nm:
        return None
    if nm.startswith(_SECTION_INFIX):
        nm = _TD_PREFIX + nm[len(_SECTION_INFIX):]
    if not nm.startswith(_TD_PREFIX):
        return None
    if any(nm.startswith(p) for p in _CATALOGUE_SKIP_PREFIXES):
        return None
    if any(nm.startswith(p) for p in _CATALOGUE_FRAGMENT_PREFIXES):
        return None
    stem = nm[len(_TD_PREFIX):]
    stem = re.sub(r"_\d+(?=_|$)", "", stem)   # drop every numeric segment
    stem = re.sub(r"_+", "_", stem).strip("_")
    return stem or None


def fragment_parent_family(mesh_name: str) -> Optional[str]:
    """Family of the part a detail fragment belongs to, or None.

    Tooth fragments are not separate inventory lines, but they MUST travel with
    their gear through the catalogue pose. Hiding them (the first attempt)
    protected the framing and destroyed part identity: "Ring Gear x2" rendered
    as a bald cylinder that no one could recognise as a gear. They are therefore
    transformed by the SAME matrix as the parent — rotation, scale and
    translation about the parent's centre — so the gear arrives toothed.
    """
    nm = (mesh_name or "").strip()
    if nm.startswith(_SECTION_INFIX):
        nm = _TD_PREFIX + nm[len(_SECTION_INFIX):]
    for pref in _CATALOGUE_FRAGMENT_PREFIXES:
        if nm.startswith(pref):
            parent = pref[: -len("_tooth")] if pref.endswith("_tooth") else pref
            return catalogue_family(parent)
    return None


_HALF_PI = 1.5707963267948966


def presentation_rotation_steps(
    dims_xyz: Sequence[float],
) -> list[tuple[str, float]]:
    """Extra 90-degree rotations that turn a part to its characteristic face.

    INTENT (2026-07-31 SIGHT, Cursor concurred): the first catalogue render left
    every part in ASSEMBLY orientation. The pack axis runs along X, so rings,
    the stator, the rotor and every gear presented EDGE-ON to a top-oblique
    camera and rendered as a vertical smear or a thin line. Thin shells (jacket,
    cover, gasket) became faint squares for the same reason. Inventory coverage
    was doing its job while part IDENTITY was destroyed.

    Universal rule, keyed on the part's own proportions and never on a part
    name: put the THINNEST axis up (+Z, toward the camera) so discs, rings and
    plates show their face as a circle/rectangle, and lay the LONGEST axis
    across the sheet (X) so shafts and bolts read as elongated rather than
    pointing at the lens. Returns a list of (axis, radians) steps to apply in
    order; empty means the part is already presented correctly.
    """
    dims = [float(d) for d in dims_xyz]
    if len(dims) != 3 or any(d < 0 for d in dims):
        raise ValueError("dims_xyz must be three non-negative extents")
    steps: list[tuple[str, float]] = []
    smallest = min(range(3), key=lambda i: dims[i])
    # Bring the thinnest axis to Z.
    if smallest == 0:
        steps.append(("Y", _HALF_PI))       # X -> Z
        dims = [dims[2], dims[1], dims[0]]
    elif smallest == 1:
        steps.append(("X", _HALF_PI))       # Y -> Z
        dims = [dims[0], dims[2], dims[1]]
    # Lay the longer remaining axis across the sheet.
    if dims[1] > dims[0]:
        steps.append(("Z", _HALF_PI))       # X <-> Y
        dims = [dims[1], dims[0], dims[2]]
    return steps


def apply_rotation_steps_to_dims(
    dims_xyz: Sequence[float],
    steps: Iterable[tuple[str, float]],
) -> tuple[float, float, float]:
    """Resulting bbox extents after the 90-degree steps. Pure, for proveCatch."""
    d = [float(v) for v in dims_xyz]
    for axis, _angle in steps:
        if axis == "Y":
            d = [d[2], d[1], d[0]]
        elif axis == "X":
            d = [d[0], d[2], d[1]]
        elif axis == "Z":
            d = [d[1], d[0], d[2]]
        else:
            raise ValueError(f"unknown axis {axis!r}")
    return d[0], d[1], d[2]


def human_label(family: str, count: int = 1) -> str:
    """Readable catalogue caption, e.g. ('sic_inverter_mod', 3) -> 'SiC Inverter Mod x3'."""
    words = [w for w in (family or "").split("_") if w]
    if not words:
        return "Unnamed part"
    parts = [_ACRONYMS.get(w.lower(), w.capitalize()) for w in words]
    name = " ".join(parts)
    return f"{name} x{int(count)}" if int(count) > 1 else name


@dataclass(frozen=True)
class CataloguePart:
    """One inventoriable family: a representative mesh + how many exist."""

    family: str
    count: int
    footprint_mm: float   # horizontal extent AFTER presentation rotation (drives fit)
    label: str
    true_size_mm: float = 0.0   # real overall size, printed in the caption


@dataclass(frozen=True)
class Placement:
    """Where one family's representative sits on the paper, in mm.

    `display_scale` is the factor the representative's geometry is scaled by so
    it fills its uniform cell; `true_size_mm` is its real footprint, which the
    caption prints so the scaling is disclosed rather than hidden.
    """

    family: str
    label: str
    count: int
    x_mm: float
    y_mm: float
    cell_mm: float
    display_scale: float = 1.0
    true_size_mm: float = 0.0

    @property
    def caption(self) -> str:
        """Two-line cell caption: identity above, true size below."""
        if self.true_size_mm >= 100.0:
            size = f"{self.true_size_mm:.0f} mm"
        elif self.true_size_mm >= 10.0:
            size = f"{self.true_size_mm:.1f} mm"
        else:
            size = f"{self.true_size_mm:.2f} mm"
        return f"{self.label}\n{size}"


# Nominal cell edge. Absolute mm is arbitrary for readability (every part is
# scaled into its cell and the camera fits the sheet), so this only sets the
# sheet's working units.
_CELL_MM = 100.0
# Fraction of a cell the PART may occupy. The remainder is the label band plus
# clear space, which is what makes the grid read as discrete items rather than a
# heap — the sphere-cloud failure mode from 13-product-exploded.
_PART_FRAC_OF_CELL = 0.50
# Fraction of a cell reserved under the part for its printed caption.
_LABEL_BAND_FRAC = 0.30
# A part is never blown up past this, so a tiny bolt stays a bolt rather than
# becoming a boulder that misleads about what it is.
_MAX_DISPLAY_SCALE = 12.0


def collect_catalogue_parts(
    mesh_sizes_mm: dict,
) -> list[CataloguePart]:
    """Fold {mesh_name: largest_horizontal_extent_mm} into inventoriable families.

    The representative footprint is the LARGEST sibling, so a family's cell is
    always big enough for the instance actually drawn in it.
    """
    agg: dict[str, list[float]] = {}
    for name, size in (mesh_sizes_mm or {}).items():
        fam = catalogue_family(name)
        if fam is None:
            continue
        try:
            val = float(size)
        except (TypeError, ValueError):
            continue
        if val <= 0:
            val = 1.0
        agg.setdefault(fam, []).append(val)
    parts = [
        CataloguePart(
            family=fam,
            count=len(sizes),
            footprint_mm=max(sizes),
            label=human_label(fam, len(sizes)),
        )
        for fam, sizes in agg.items()
    ]
    # Largest first: big housings head the sheet, fasteners tail it.
    parts.sort(key=lambda p: (-p.footprint_mm, p.family))
    return parts


def plan_catalogue_layout(
    parts: Sequence[CataloguePart],
    aspect: float = 1.5,
) -> tuple[list[Placement], tuple[float, float]]:
    """Row-pack families onto a paper sheet. Returns (placements, (width, depth)) mm.

    Rows are filled largest-first; each row's pitch is set by ITS OWN largest
    part, so mixed-scale kits stay readable without rescaling any geometry.
    Raises ValueError if the packing produced overlapping cells — the invariant
    that makes this view inventoriable (see _selftest).
    """
    if not parts:
        return [], (0.0, 0.0)
    if aspect <= 0:
        raise ValueError("aspect must be positive")

    # Uniform grid sized to the frame: every cell identical, so captions are one
    # size, spacing is regular, and no row can collapse into an illegible strip.
    n = len(parts)
    row_pitch = _CELL_MM * (1.0 + _LABEL_BAND_FRAC)
    # Choose columns so the finished sheet is close to the render's aspect.
    cols = max(1, int(round(((n * aspect * row_pitch) / _CELL_MM) ** 0.5)))
    cols = min(cols, n)

    placements: list[Placement] = []
    for index, part in enumerate(parts):
        col, row = index % cols, index // cols
        # Fit the part to its cell; enlarge small parts but never past the cap.
        target = _CELL_MM * _PART_FRAC_OF_CELL
        scale = target / part.footprint_mm if part.footprint_mm > 0 else 1.0
        scale = min(scale, _MAX_DISPLAY_SCALE)
        placements.append(Placement(
            family=part.family,
            label=part.label,
            count=part.count,
            x_mm=col * _CELL_MM + _CELL_MM / 2.0,
            y_mm=-(row * row_pitch) - row_pitch / 2.0,
            cell_mm=_CELL_MM,
            display_scale=scale,
            true_size_mm=part.true_size_mm or part.footprint_mm,
        ))

    rows_used = (n + cols - 1) // cols
    sheet_w = cols * _CELL_MM
    sheet_d = rows_used * row_pitch
    overlaps = find_overlaps(placements)
    if overlaps:
        raise ValueError(
            f"catalogue layout produced {len(overlaps)} overlapping cell pair(s); "
            f"first={overlaps[0]} — parts would not be individually readable")
    return placements, (sheet_w, sheet_d)


def find_overlaps(
    placements: Iterable[Placement],
) -> list[tuple[str, str]]:
    """Every pair of placements whose square cells intersect. Empty == readable."""
    items = list(placements)
    bad: list[tuple[str, str]] = []
    for i in range(len(items)):
        a = items[i]
        ah = a.cell_mm / 2.0
        for j in range(i + 1, len(items)):
            b = items[j]
            bh = b.cell_mm / 2.0
            # Strict inequality: cells that merely touch edges are still discrete.
            if (abs(a.x_mm - b.x_mm) < (ah + bh) - 1e-9
                    and abs(a.y_mm - b.y_mm) < (ah + bh) - 1e-9):
                bad.append((a.family, b.family))
    return bad


def catalogue_coverage(
    mesh_names: Iterable[str],
    placements: Iterable[Placement],
) -> dict:
    """Prove the sheet accounts for every inventoriable mesh.

    `placed_instances` sums the xN counts; when it equals `inventoriable`, no
    part was silently dropped by the family collapse.
    """
    names = list(mesh_names)
    families = [catalogue_family(n) for n in names]
    inventoriable = [f for f in families if f is not None]
    plist = list(placements)
    placed_families = {p.family for p in plist}
    missing = sorted(set(inventoriable) - placed_families)
    return {
        "meshes_total": len(names),
        "inventoriable": len(inventoriable),
        "families_expected": len(set(inventoriable)),
        "families_placed": len(placed_families),
        "placed_instances": sum(p.count for p in plist),
        "missing_families": missing,
        "ok": not missing and sum(p.count for p in plist) == len(inventoriable),
    }


def _selftest() -> None:
    """proveCatch: the catalogue must FAIL when it stops being inventoriable."""
    # ── Family folding ───────────────────────────────────────────────────────
    assert catalogue_family("u_se_td_magnet_3") == "magnet"
    assert catalogue_family("u_se_td_microjet_0_2") == "microjet"
    assert catalogue_family("u_se_td_phase_bus_0_leg_h") == "phase_bus_leg_h"
    assert catalogue_family("u_se_td_section_hollow_rotor") == "hollow_rotor", (
        "a section clone must fold onto the same family as its part")
    # Non-parts must never enter the inventory.
    assert catalogue_family("u_se_td_vehicle_hv") is None
    assert catalogue_family("u_se_td_bay_endwall_0") is None
    assert catalogue_family("u_se_td_ground_plane_0") is None, "datum helper"
    # proveCatch for the over-broad-prefix bug: a part noun that merely SHARES a
    # stem with a datum helper must stay in the inventory.
    assert catalogue_family("u_se_td_ground_stud") == "ground_stud", (
        "an earth-bonding stud is a real kit part — a bare 'ground' skip prefix "
        "silently dropped it from the sheet")
    assert catalogue_family("u_se_td_ring_gear_tooth_7") is None, (
        "tooth fragments stay nested on the parent gear, per the 13-explode lesson")
    assert catalogue_family("fl_ground_plane") is None
    assert catalogue_family("") is None

    # ── Labels ───────────────────────────────────────────────────────────────
    assert human_label("sic_inverter_mod", 3) == "SiC Inverter Mod x3"
    assert human_label("sun_gear", 1) == "Sun Gear", "a singleton carries no xN"
    assert human_label("hv_connector_hvil") == "HV Connector HVIL"
    assert human_label("pcb_package", 4) == "PCB Package x4"

    # ── Presentation orientation (the edge-on-smear defect) ─────────────────
    # A ring gear built on the pack axis: thin in X, full diameter in Y/Z.
    # Assembly pose renders it edge-on as a line; it must turn face-up.
    ring = (12.0, 200.0, 200.0)
    ring_steps = presentation_rotation_steps(ring)
    assert ring_steps, "a ring on the pack axis MUST be reoriented, not left edge-on"
    rw, rd, rh = apply_rotation_steps_to_dims(ring, ring_steps)
    assert rh < rw and rh < rd, (
        f"the thin axis must end up VERTICAL so the face reads as a circle, got {(rw, rd, rh)}")
    assert abs(rw - 200.0) < 1e-9 and abs(rd - 200.0) < 1e-9, (rw, rd)
    # A shaft/bolt: long in X, small elsewhere — must LIE ACROSS the sheet, never
    # point at the camera (which would render it as a dot).
    bolt = (25.0, 8.0, 8.0)
    bw, bd, bh = apply_rotation_steps_to_dims(
        bolt, presentation_rotation_steps(bolt))
    assert bw >= bd and bw >= bh, f"long axis must lie across the sheet, got {(bw, bd, bh)}"
    assert abs(bw - 25.0) < 1e-9, bw
    # An already-flat PCB is left alone (no gratuitous rotation).
    assert presentation_rotation_steps((80.0, 60.0, 2.0)) == [], (
        "a part already presenting its face must not be rotated")
    # A part whose longest axis is Y gets laid across.
    yl = (30.0, 120.0, 4.0)
    yw, yd, yh = apply_rotation_steps_to_dims(yl, presentation_rotation_steps(yl))
    assert yw >= yd >= yh, f"axes must end sorted longest->shortest, got {(yw, yd, yh)}"
    # Universal invariant: ANY proportions end up longest-across, thinnest-up.
    for probe in ((5.0, 90.0, 90.0), (90.0, 5.0, 90.0), (90.0, 90.0, 5.0),
                  (1.0, 2.0, 3.0), (7.0, 7.0, 7.0), (200.0, 3.0, 40.0)):
        pw, pd, ph = apply_rotation_steps_to_dims(
            probe, presentation_rotation_steps(probe))
        assert pw >= pd >= ph - 1e-9, f"{probe} -> {(pw, pd, ph)} not sorted"
        assert abs(sorted(probe, reverse=True)[0] - pw) < 1e-9, (
            f"rotation must PERMUTE extents, never resize them: {probe} -> {(pw, pd, ph)}")
    try:
        presentation_rotation_steps((1.0, 2.0))
        raise AssertionError("bad input must raise")
    except ValueError:
        pass

    # ── Layout on a realistic mixed-scale kit ────────────────────────────────
    sizes = {}
    sizes["u_se_td_pack_housing"] = 420.0          # biggest
    sizes["u_se_td_motor_housing"] = 260.0
    for i in range(8):
        sizes[f"u_se_td_magnet_{i}"] = 22.0        # many small siblings
    for i in range(8):
        sizes[f"u_se_td_end_bolt_{i}"] = 8.0       # tiniest
    for i in range(4):
        sizes[f"u_se_td_planet_{i}"] = 54.0
    for i in range(18):
        sizes[f"u_se_td_ring_gear_tooth_{i}"] = 6.0   # must be EXCLUDED
    sizes["u_se_td_vehicle_hv"] = 30.0                # must be EXCLUDED
    sizes["u_se_td_sun_gear"] = 60.0

    parts = collect_catalogue_parts(sizes)
    fams = {p.family: p for p in parts}
    assert "ring_gear_tooth" not in fams, "fragments must not reach the sheet"
    assert "vehicle_hv" not in fams, "scene anchors must not reach the sheet"
    assert fams["magnet"].count == 8, f"magnet count wrong: {fams['magnet'].count}"
    assert fams["magnet"].label == "Magnet x8"
    assert parts[0].family == "pack_housing", "largest part must head the sheet"

    placements, (sw, sd) = plan_catalogue_layout(parts)
    assert placements, "layout must place something"
    assert not find_overlaps(placements), "a readable sheet has zero overlaps"
    assert sw > 0 and sd > 0, f"sheet must have extent, got {(sw, sd)}"
    # Every label is printable and carries its count.
    assert all(p.label.strip() for p in placements), "every cell must be labelled"

    # ── READABILITY FLOOR (the defect the first render actually shipped) ─────
    # Size-sorted rows at true relative scale produced a monotonic gradient whose
    # last rows were an illegible smear. Uniform cells make that impossible:
    # every cell is the same size, so no part can be rendered smaller than any
    # other, whatever the kit's size range.
    cells = {round(p.cell_mm, 6) for p in placements}
    assert len(cells) == 1, (
        f"cells must be UNIFORM or small parts become unreadable; got {cells}")
    # Every part fills a comparable fraction of its cell — the 52:1 housing/bolt
    # span must NOT survive into the rendered sheet.
    occupancy = [
        min(p.true_size_mm * p.display_scale, p.cell_mm) / p.cell_mm
        for p in placements
    ]
    assert min(occupancy) > 0.12, (
        f"every part must be visible in its cell; smallest occupancy "
        f"{min(occupancy):.3f} — this is the 'last rows are a smear' failure")
    # Scaling is DISCLOSED, never silent: the caption prints the true size.
    bolt_p = next(p for p in placements if p.family == "end_bolt")
    house_p = next(p for p in placements if p.family == "pack_housing")
    assert bolt_p.display_scale > 1.0, "a tiny part is enlarged to be visible"
    assert house_p.display_scale < 1.0, "an outsize part is reduced to fit"
    assert "8" in bolt_p.caption and "mm" in bolt_p.caption, (
        f"true size must be printed so the scaling is disclosed: {bolt_p.caption!r}")
    assert "420" in house_p.caption, house_p.caption
    assert "\n" in bolt_p.caption, "caption is identity above, true size below"
    assert bolt_p.display_scale <= _MAX_DISPLAY_SCALE, (
        "a bolt must not be blown up into a boulder")

    cov = catalogue_coverage(sizes.keys(), placements)
    assert cov["ok"], f"coverage must reconcile, got {cov}"
    assert cov["inventoriable"] == 8 + 8 + 4 + 2 + 1, f"unexpected inventory: {cov}"
    assert cov["placed_instances"] == cov["inventoriable"], (
        "the xN counts must account for every inventoriable mesh — a family "
        f"collapse that drops parts is the failure this catches: {cov}")

    # ── ADVERSARIAL 1: a tiny pitch must FAIL, not silently ship a cloud ─────
    # This is the exact defect Tristan rejected in 13-product-exploded: parts
    # packed so tight they read as one blob. Collapsing the gutter to nothing
    # must be detected as overlap, never rendered.
    tight = [
        Placement("a", "A", 1, 0.0, 0.0, 100.0),
        Placement("b", "B", 1, 40.0, 0.0, 100.0),   # 40 mm apart, 100 mm cells
    ]
    assert find_overlaps(tight), (
        "overlapping cells MUST be detected — this is the proveCatch for the "
        "sphere-cloud failure mode")

    # ── ADVERSARIAL 2: a dropped family must FAIL coverage ──────────────────
    holed = [p for p in placements if p.family != "magnet"]
    cov_bad = catalogue_coverage(sizes.keys(), holed)
    assert not cov_bad["ok"], "dropping a family must fail coverage"
    assert "magnet" in cov_bad["missing_families"], cov_bad

    # ── ADVERSARIAL 3: a miscounted family must FAIL coverage ───────────────
    miscounted = [
        (Placement(p.family, p.label, 1, p.x_mm, p.y_mm, p.cell_mm)
         if p.family == "magnet" else p)
        for p in placements
    ]
    cov_mis = catalogue_coverage(sizes.keys(), miscounted)
    assert not cov_mis["ok"], (
        "an xN that under-counts its instances must fail — otherwise the sheet "
        "could claim completeness while hiding 7 magnets")

    # ── ADVERSARIAL 4: a size-graded sheet must FAIL the readability floor ───
    # Reconstructs the layout that actually shipped on 2026-07-31 (cells scaled
    # to each part's true size) and proves the floor above rejects it.
    graded = [
        Placement(p.family, p.label, p.count, p.x_mm, p.y_mm,
                  cell_mm=max(pr.footprint_mm, 1.0), display_scale=1.0,
                  true_size_mm=pr.footprint_mm)
        for p, pr in zip(placements, parts)
    ]
    graded_cells = {round(g.cell_mm, 6) for g in graded}
    assert len(graded_cells) > 1, "the rejected layout had per-part cell sizes"
    _sheet_max = max(g.cell_mm for g in graded)
    _worst = min(g.cell_mm / _sheet_max for g in graded)
    assert _worst < 0.12, (
        "a true-relative-scale sheet across a 52:1 kit renders its smallest "
        f"parts at {_worst:.3f} of the largest cell — unreadable, which is why "
        "uniform cells + printed dimensions replaced it")

    # Degenerate input is handled, not crashed.
    assert plan_catalogue_layout([]) == ([], (0.0, 0.0))

    print(
        "fpk_parts_catalogue _selftest: OK "
        f"(families={len(parts)} placed={len(placements)} "
        f"sheet={sw:.0f}x{sd:.0f}mm, overlap+coverage+count proveCatch)")


if __name__ == "__main__":
    _selftest()
