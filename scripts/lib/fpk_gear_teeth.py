#!/usr/bin/env python3
"""Planetary tooth set solved from the CALCULATED pitch diameters.

INTENT (2026-07-31 Tristan): "the blender images should look like the calculated
parts with the right dimensions including the correct number of teeth and the
correct geometries of the teeth — they are there to represent the exact physical
characteristics that have been calculated."

The render is a VISUALISATION of the design, so tooth count and tooth profile
must be DERIVED from the design, never invented for looks. Before this module
`gear_module_mm` was 0.0 in the contract (never calculated) and the Blender
placer fell back to `max(0.8, sun_od/24)` — a decorative number that happened to
produce plausible teeth. That is exactly the failure this closes.

A planetary tooth set is not free. It must satisfy, simultaneously:
  1. COMMON MODULE     — sun, planets and ring all mesh, so they share m.
  2. INTEGER TEETH     — z = d/m must be a whole number for all three.
  3. MESHING           — z_ring = z_sun + 2*z_planet.
  4. EQUAL SPACING     — (z_sun + z_ring) / n_planets must be an integer, or the
                         planets cannot sit at equal angular pitch.
  5. NO UNDERCUT       — z_sun >= the undercut limit for the pressure angle
                         (17 at 20 deg), else the tooth root is cut away.
This module solves for the largest module satisfying all five, and reports the
ACTUAL ratio the resulting tooth set produces — which is the honest ratio,
whatever the contract claims.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

# Standard full-depth involute proportions.
PRESSURE_ANGLE_DEG = 20.0
ADDENDUM_FACTOR = 1.00      # a = 1.00 * m
DEDENDUM_FACTOR = 1.25      # b = 1.25 * m
# Below this the 20-degree full-depth tooth root is undercut by the generating
# rack. Standard result, not a preference.
UNDERCUT_LIMIT_TEETH = 17


@dataclass(frozen=True)
class PlanetaryToothSet:
    """A tooth set that actually meshes, with the ratio it really produces."""

    module_mm: float
    z_sun: int
    z_planet: int
    z_ring: int
    n_planets: int
    ratio_actual: float          # fixed ring, carrier output: 1 + z_ring/z_sun
    sun_pcd_mm: float
    planet_pcd_mm: float
    ring_pcd_mm: float
    notes: tuple


def _is_int(value: float, tol: float = 1e-6) -> bool:
    return abs(value - round(value)) <= tol


def solve_planetary_tooth_set(
    sun_pcd_mm: float,
    planet_pcd_mm: float,
    ring_pcd_mm: float,
    n_planets: int,
    *,
    candidate_modules: Optional[Sequence[float]] = None,
    pcd_tol_mm: float = 0.6,
    allow_pcd_snap: bool = False,
) -> PlanetaryToothSet:
    """Solve the tooth set from calculated pitch diameters.

    Prefers the LARGEST module that satisfies every constraint — a larger module
    means a stronger tooth for the same diameter, which is the normal design
    direction. Falls back to relaxing the undercut limit (recorded in `notes`)
    before it will relax meshing or integer teeth, which are physical.
    """
    if min(sun_pcd_mm, planet_pcd_mm, ring_pcd_mm) <= 0:
        raise ValueError("pitch diameters must be positive")
    if n_planets < 2:
        raise ValueError("n_planets must be >= 2")

    notes: list[str] = []
    # Meshing sanity on the DIAMETERS themselves (before teeth).
    implied_ring = sun_pcd_mm + 2.0 * planet_pcd_mm
    if abs(implied_ring - ring_pcd_mm) > pcd_tol_mm:
        notes.append(
            f"pcd_meshing_mismatch: sun+2*planet={implied_ring:.2f} mm vs "
            f"ring={ring_pcd_mm:.2f} mm (delta {implied_ring - ring_pcd_mm:+.2f} mm)")
    # Use the meshing-consistent ring so the tooth set is physical even when the
    # supplied ring PCD is a rounded value.
    ring_used = implied_ring

    if candidate_modules is None:
        # Standard metric module series (ISO 54 preferred + common halves),
        # searched largest-first.
        candidate_modules = (
            4.0, 3.5, 3.0, 2.5, 2.0, 1.75, 1.5, 1.25, 1.0,
            0.9, 0.8, 0.75, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2,
        )

    def _try(min_teeth: int):
        for m in candidate_modules:
            zs, zp, zr = sun_pcd_mm / m, planet_pcd_mm / m, ring_used / m
            if not (_is_int(zs) and _is_int(zp) and _is_int(zr)):
                continue
            zs_i, zp_i, zr_i = round(zs), round(zp), round(zr)
            if zs_i < min_teeth:
                continue
            if zr_i != zs_i + 2 * zp_i:          # meshing, in TEETH
                continue
            if (zs_i + zr_i) % n_planets != 0:   # equal angular spacing
                continue
            return m, zs_i, zp_i, zr_i
        return None

    got = _try(UNDERCUT_LIMIT_TEETH)
    if got is None:
        got = _try(8)
        if got is not None:
            notes.append(
                f"undercut_relaxed: no module gives z_sun >= {UNDERCUT_LIMIT_TEETH} "
                "at 20 deg pressure angle; profile shift would be required")

    # INTENT (2026-08-04 cycle-2): packaging-seed PCDs often land 0.3 mm off a
    # standard module (sun=12.0 planet=38.7 fails; planet=38.4 solves at m=0.6).
    # Blender visualisation may snap (allow_pcd_snap=True) so the nest shows
    # real involute teeth rather than blank discs. The pure solver still RAISES
    # so unequal-spacing / unbuildable sets are never silently smoothed in
    # strength or release paths.
    if got is None and allow_pcd_snap:
        # Prefer undercut-safe sun first; fall back to z_sun>=12 (still better
        # than z=8 knife-edge teeth at catalogue scale).
        for _min_z in (UNDERCUT_LIMIT_TEETH, 12, 8):
            got_snap = _snap_nearest_tooth_set(
                sun_pcd_mm, planet_pcd_mm, ring_used, n_planets,
                candidate_modules=candidate_modules,
                min_teeth=_min_z,
            )
            if got_snap is not None:
                m_s, zs_s, zp_s, zr_s, d_pct = got_snap
                notes.append(
                    f"pcd_snap: seed sun/planet/ring="
                    f"{sun_pcd_mm:.2f}/{planet_pcd_mm:.2f}/{ring_used:.2f} mm → "
                    f"z={zs_s}/{zp_s}/{zr_s} m={m_s} mm "
                    f"(max PCD delta {d_pct:.1f}%); provisional visualisation "
                    "under packaging seed — not a released tooth set"
                )
                if zs_s < UNDERCUT_LIMIT_TEETH:
                    notes.append(
                        f"undercut_relaxed: snapped z_sun={zs_s} < "
                        f"{UNDERCUT_LIMIT_TEETH}"
                    )
                got = (m_s, zs_s, zp_s, zr_s)
                break

    if got is None:
        raise ValueError(
            "no standard module satisfies integer teeth + meshing + equal "
            f"spacing for sun={sun_pcd_mm} planet={planet_pcd_mm} "
            f"ring={ring_used} n={n_planets}")

    m, zs_i, zp_i, zr_i = got
    ratio = 1.0 + (zr_i / zs_i)
    if (zs_i + zr_i) % n_planets == 0:
        notes.append(f"equal_spacing_ok: (z_sun+z_ring)/n = {(zs_i + zr_i)//n_planets}")
    return PlanetaryToothSet(
        module_mm=float(m), z_sun=zs_i, z_planet=zp_i, z_ring=zr_i,
        n_planets=int(n_planets), ratio_actual=ratio,
        sun_pcd_mm=zs_i * m, planet_pcd_mm=zp_i * m, ring_pcd_mm=zr_i * m,
        notes=tuple(notes),
    )


def _snap_nearest_tooth_set(
    sun_pcd_mm: float,
    planet_pcd_mm: float,
    ring_pcd_mm: float,
    n_planets: int,
    *,
    candidate_modules: Sequence[float],
    min_teeth: int = 8,
    max_pcd_delta_pct: float = 5.0,
):
    """Nearest meshing integer tooth set within ``max_pcd_delta_pct`` of seeds.

    Searches standard modules and small integer neighbourhoods around the
    implied tooth counts. Prefers higher sun tooth count (readable involute)
    then larger module then smaller PCD error.
    Returns ``(m, zs, zp, zr, max_delta_pct)`` or None.
    """
    best = None  # (score, m, zs, zp, zr, d_pct)
    for m in candidate_modules:
        if m <= 0:
            continue
        zs0 = max(min_teeth, int(round(sun_pcd_mm / m)))
        zp0 = max(min_teeth, int(round(planet_pcd_mm / m)))
        # Tight neighbourhood: only ±2 teeth — snap packaging rounding, do not
        # invent a different gearbox.
        for dzs in range(-2, 3):
            for dzp in range(-2, 3):
                zs = zs0 + dzs
                zp = zp0 + dzp
                if zs < min_teeth or zp < min_teeth:
                    continue
                zr = zs + 2 * zp
                if (zs + zr) % n_planets != 0:
                    continue
                sun_a, pl_a, rg_a = zs * m, zp * m, zr * m
                errs = (
                    abs(sun_a - sun_pcd_mm) / max(sun_pcd_mm, 1e-6),
                    abs(pl_a - planet_pcd_mm) / max(planet_pcd_mm, 1e-6),
                    abs(rg_a - ring_pcd_mm) / max(ring_pcd_mm, 1e-6),
                )
                d_pct = 100.0 * max(errs)
                if d_pct > max_pcd_delta_pct:
                    continue
                # Prefer catalogue-readable module (0.5–2.0 mm) over micro-teeth
                # (m=0.2 × z_ring=448 is a Blender mesh bomb and invisible at
                # hero scale). Then undercut-safe sun count, then PCD fidelity.
                m_f = float(m)
                if 0.5 <= m_f <= 2.0:
                    m_band = 0
                elif 0.35 <= m_f < 0.5 or 2.0 < m_f <= 3.0:
                    m_band = 1
                else:
                    m_band = 2
                undercut_pen = 0 if zs >= UNDERCUT_LIMIT_TEETH else 1
                score = (m_band, undercut_pen, -m_f, d_pct, -zs)
                if best is None or score < best[0]:
                    best = (score, m_f, zs, zp, zr, d_pct)
    if best is None:
        return None
    _, m, zs, zp, zr, d_pct = best
    return m, zs, zp, zr, d_pct


def involute_tooth_profile(
    module_mm: float,
    n_teeth: int,
    *,
    internal: bool = False,
    pressure_angle_deg: float = PRESSURE_ANGLE_DEG,
    points_per_flank: int = 6,
) -> list[tuple[float, float]]:
    """One tooth's half-profile as (radius_mm, angle_rad) from the tooth centre.

    Real involute geometry, not a trapezoid: r(theta) traced from the base circle
    to the tip, so the flank curvature is the actual conjugate profile. Returned
    as polar points the caller can mirror about the tooth centreline and array
    around the gear.
    """
    m = float(module_mm)
    z = int(n_teeth)
    if m <= 0 or z < 4:
        raise ValueError("module must be positive and n_teeth >= 4")
    alpha = math.radians(pressure_angle_deg)
    r_pitch = m * z / 2.0
    r_base = r_pitch * math.cos(alpha)
    r_tip = r_pitch + (DEDENDUM_FACTOR if internal else ADDENDUM_FACTOR) * m
    r_root = r_pitch - (ADDENDUM_FACTOR if internal else DEDENDUM_FACTOR) * m
    r_root = max(r_root, r_base * 0.62, m * 0.5)

    def inv(a: float) -> float:
        return math.tan(a) - a

    # Half tooth thickness at the pitch circle, in angle.
    half_thick = (math.pi / (2.0 * z)) + (inv(alpha) if internal else -inv(alpha)) * 0.0
    half_at_pitch = math.pi / (2.0 * z)

    pts: list[tuple[float, float]] = []
    r_start = max(r_root, r_base)
    for i in range(points_per_flank + 1):
        r = r_start + (r_tip - r_start) * (i / points_per_flank)
        r = max(r, r_base + 1e-9)
        a_r = math.acos(min(1.0, r_base / r))
        # Angular position of the involute flank at radius r, referenced so the
        # tooth is symmetric about angle 0.
        theta = half_at_pitch + inv(alpha) - inv(a_r)
        pts.append((r, theta))
    # Root point closes the flank down to the root circle.
    if r_root < r_start:
        pts.insert(0, (r_root, pts[0][1]))
    return pts


def _selftest() -> None:
    """proveCatch: the tooth set must be PHYSICAL, and must expose a bad ratio."""
    # ── The live FE front kit, from its own calculated PCDs ──────────────────
    ts = solve_planetary_tooth_set(12.0, 38.4, 88.7, 3)
    assert ts.z_ring == ts.z_sun + 2 * ts.z_planet, (
        f"meshing must hold in TEETH: {ts}")
    assert (ts.z_sun + ts.z_ring) % ts.n_planets == 0, (
        f"3 planets must sit at equal pitch: {ts}")
    assert ts.module_mm > 0, "module must be solved, never left 0.0"
    # Every wheel must land on a whole number of teeth.
    for pcd, z in ((ts.sun_pcd_mm, ts.z_sun), (ts.planet_pcd_mm, ts.z_planet),
                   (ts.ring_pcd_mm, ts.z_ring)):
        assert abs(pcd / ts.module_mm - z) < 1e-6, f"non-integer teeth: {ts}"

    # ── The ratio the geometry REALLY gives (vs the contract's stated 8) ─────
    assert abs(ts.ratio_actual - (1.0 + ts.z_ring / ts.z_sun)) < 1e-9
    assert ts.ratio_actual > 8.2, (
        f"this kit's PCDs give ratio {ts.ratio_actual:.3f}, not the stated 8 — "
        "the solver must report the HONEST ratio")

    # ── Cycle-2 packaging seed (planet 38.7): pure solver may RAISE; Blender
    # path (allow_pcd_snap) must produce involute teeth, not blank discs.
    try:
        exact_387 = solve_planetary_tooth_set(12.0, 38.7, 89.4, 3)
    except ValueError:
        exact_387 = None
    snapped = solve_planetary_tooth_set(
        12.0, 38.7, 89.4, 3, allow_pcd_snap=True
    )
    assert snapped.module_mm > 0 and snapped.z_sun >= 8
    assert snapped.z_ring == snapped.z_sun + 2 * snapped.z_planet
    if exact_387 is None:
        assert any(n.startswith("pcd_snap") for n in snapped.notes), snapped.notes

    # ── ADVERSARIAL 1: PCDs that do not mesh must be FLAGGED, not smoothed ──
    bad = solve_planetary_tooth_set(12.0, 38.4, 120.0, 3)
    assert any(n.startswith("pcd_meshing_mismatch") for n in bad.notes), (
        f"a ring that cannot mesh must be reported: {bad.notes}")

    # ── ADVERSARIAL 2: meshing must hold in TEETH for every solved set ───────
    for sun, planet, n in ((12.0, 38.4, 3), (24.0, 36.0, 3), (24.0, 36.0, 4)):
        s = solve_planetary_tooth_set(sun, planet, sun + 2 * planet, n)
        assert s.z_ring == s.z_sun + 2 * s.z_planet, s
        assert (s.z_sun + s.z_ring) % n == 0, s
        assert not any(n0.startswith("pcd_meshing_mismatch") for n0 in s.notes), (
            f"meshing-consistent PCDs must not flag mismatch: {s.notes}")

    # ── ADVERSARIAL 4: an arrangement that CANNOT be equally spaced must RAISE,
    # not be quietly rounded into place. sun=20/planet=30/ring=80 with 3 planets
    # gives (20+80)/3 = 33.3 — three planets physically cannot sit at equal
    # angular pitch, and a solver that "fixed" that would be drawing a gearbox
    # that cannot be built.
    try:
        solve_planetary_tooth_set(20.0, 30.0, 80.0, 3)
        raise AssertionError(
            "an unequally-spaceable planetary must RAISE, never be smoothed")
    except ValueError as exc:
        assert "equal spacing" in str(exc) or "no standard module" in str(exc), exc
    # The same wheels with 4 planets ARE spaceable: (20+80)/4 = 25.
    ok4 = solve_planetary_tooth_set(20.0, 30.0, 80.0, 4)
    assert (ok4.z_sun + ok4.z_ring) % 4 == 0, ok4

    # ── ADVERSARIAL 3: undercut is reported, never silently shipped ──────────
    tiny = solve_planetary_tooth_set(6.0, 12.0, 30.0, 3)
    if tiny.z_sun < UNDERCUT_LIMIT_TEETH:
        assert any(n.startswith("undercut_relaxed") for n in tiny.notes), (
            f"an undercut sun must be declared: {tiny}")

    # ── Involute profile is a real involute, not a trapezoid ────────────────
    prof = involute_tooth_profile(ts.module_mm, ts.z_sun)
    assert len(prof) >= 6, prof
    radii = [r for r, _t in prof]
    assert radii == sorted(radii), "profile must sweep outward monotonically"
    r_pitch = ts.module_mm * ts.z_sun / 2.0
    assert max(radii) > r_pitch, "tooth must reach past the pitch circle to the tip"
    assert min(radii) < r_pitch, "tooth must start below the pitch circle at the root"
    # Flank must CURVE: equal radial steps give unequal angular steps.
    angs = [t for _r, t in prof]
    d1 = angs[1] - angs[2] if len(angs) > 2 else 0.0
    d2 = angs[-2] - angs[-1]
    assert abs(d2 - d1) > 1e-6, (
        "an involute flank curves — equal angular steps would mean a straight "
        "(trapezoidal) tooth, which is the decorative shape this replaces")
    inner = involute_tooth_profile(ts.module_mm, ts.z_ring, internal=True)
    assert max(r for r, _ in inner) > ts.ring_pcd_mm / 2.0, "internal tip past pitch"

    try:
        solve_planetary_tooth_set(0.0, 10.0, 30.0, 3)
        raise AssertionError("non-positive pcd must raise")
    except ValueError:
        pass

    print(
        f"fpk_gear_teeth _selftest: OK — live kit solves m={ts.module_mm} "
        f"z_sun={ts.z_sun} z_planet={ts.z_planet} z_ring={ts.z_ring} "
        f"ratio_actual={ts.ratio_actual:.3f} (contract states 8) notes={ts.notes}")


if __name__ == "__main__":
    _selftest()
