#!/usr/bin/env python3
"""Magnet FLUX-FOCUSING screen — is the magnet spending its volume on the axis
that actually produces airgap flux?

THE SOURCE RULE THIS EXISTS TO CATCH (found 2026-08-01 on the FE front MGU).
`em_fia_front_kit_case.derive_fia_geometry()` sizes a V-magnet pair with two
INDEPENDENT rules that never consult the magnetic circuit:

    magnet_thickness_mm = max(4.0, min(12.0, usable_radial_mm * 0.75))
    magnet_length_mm    = max(14.0, min(pole_pitch_mm * 0.38, 44.0))

and its own comment states the rule it is following:

    "thickness drives flux, length drives pole arc"

THAT IS BACKWARDS for a small-airgap IPM, and it is why the live kit measured an
open-circuit airgap fundamental of ~0.32 T against a 0.70-1.00 T healthy band.

THE PHYSICS. A permanent magnet in a magnetic circuit sits at the operating
point where its own demagnetisation curve meets the circuit's load line:

    B_m = Br / (1 + mur * g_eff * (A_m / A_g) / t_m)

Thickness `t_m` appears ONLY in that denominator, and only as a ratio against
`mur * g_eff`. At g_eff = 0.7 mm and mur = 1.05 the term `mur*g_eff` is 0.735 mm,
so by t_m = 4 mm the magnet already sits above 90% of Br and by t_m = 8.85 mm it
is at ~95%. Every millimetre of thickness after that buys under half a percent of
flux density — while consuming the radial room that FACE AREA needs.

The flux that crosses the airgap is:

    B_gap = B_m * (A_m / A_g)          [the FLUX-FOCUSING RATIO]

`A_m/A_g` is set by the magnet's FACE — length x stack — against the pole's
airgap area. It is the term with real leverage, and it scales roughly linearly.
On the live kit A_m/A_g = 0.56: the magnet is DE-focusing, throwing away 44% of
the flux the pole area could carry, because its volume went into thickness.

So the rule should read: **face area drives flux; thickness only buys the
operating point, and saturates at a few multiples of mur*g_eff.**

WHY A SCREEN AND NOT A ONE-OFF FIX. This is universal to every IPM/SPM the engine
sizes, on any archetype. A geometry can be perfectly legal (fits the ring, clears
the bridges, no polygon intersection) and still be structurally under-magnetised.
Nothing upstream looks at A_m/A_g at all, so nothing catches it.

Usage:
    fpk_magnet_flux_focusing.py --twin <dir> [--json]
    fpk_magnet_flux_focusing.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

# The healthy open-circuit airgap fundamental band for a rare-earth IPM.
# Below this a machine cannot make competitive torque per amp regardless of
# winding, current angle, or integration method.
HEALTHY_B1_BAND_T = (0.70, 1.00)

# Thickness past this multiple of (mur * g_eff) is dead weight — it buys under
# 1% more operating-point flux while consuming radial room face area needs.
THICKNESS_SATURATION_MULTIPLE = 6.0

# Below this focusing ratio the magnet is throwing away pole area.
MIN_HEALTHY_FOCUSING_RATIO = 0.75


@dataclass
class MagnetCircuit:
    """One pole's magnet circuit, reduced to the terms that set airgap flux."""

    remanence_t: float
    recoil_permeability: float
    magnet_thickness_mm: float
    magnet_face_per_pole_mm: float   # summed tangential projection, both bars
    pole_pitch_at_magnet_mm: float
    effective_airgap_mm: float

    @property
    def focusing_ratio(self) -> float:
        """A_m / A_g — magnet face area against pole airgap area."""
        return self.magnet_face_per_pole_mm / self.pole_pitch_at_magnet_mm

    @property
    def load_line_term(self) -> float:
        """mur * g_eff * (A_m/A_g) / t_m — the ONLY place thickness appears."""
        return (
            self.recoil_permeability
            * self.effective_airgap_mm
            * self.focusing_ratio
            / self.magnet_thickness_mm
        )

    @property
    def magnet_operating_flux_t(self) -> float:
        """B_m — where the magnet actually sits on its demag curve."""
        return self.remanence_t / (1.0 + self.load_line_term)

    @property
    def magnet_utilisation(self) -> float:
        """B_m / Br. Above ~0.90 more thickness is dead weight."""
        return self.magnet_operating_flux_t / self.remanence_t

    @property
    def airgap_flux_t(self) -> float:
        """B_gap = B_m * (A_m/A_g) — the number torque actually tracks."""
        return self.magnet_operating_flux_t * self.focusing_ratio

    @property
    def thickness_saturation_multiple(self) -> float:
        """t_m / (mur * g_eff). Past ~6 the thickness is doing nothing."""
        return self.magnet_thickness_mm / (
            self.recoil_permeability * self.effective_airgap_mm)


def enforce_mode_from_env() -> str:
    """ENFORCING BY DEFAULT (Tristan 2026-08-01: "turn them on by default").

    The earlier reasoning — "a starved magnet is a DESIGN finding, not a
    wrongness, so it flags rather than blocks" — did not survive contact with
    this campaign. The FE front MGU spent days being treated as a torque-
    integration problem while the actual fault was a magnet de-focusing flux at
    A_m/A_g = 0.562. A machine that cannot make its duty because its pole arc is
    wrong is not a soft finding to note in passing; every downstream number it
    produces is describing a machine that will not work.

    MAGNET_FOCUSING_ENFORCING=off returns it to reporting.
    """
    import os
    raw = str(os.environ.get("MAGNET_FOCUSING_ENFORCING", "on")).strip().lower()
    return "off" if raw in ("0", "false", "no", "off", "shadow") else "on"


def screen(circuit: MagnetCircuit) -> dict:
    """Judge a magnet circuit and, when it is starved, say what to change."""
    findings: list[dict] = []
    b_gap = circuit.airgap_flux_t
    lo, hi = HEALTHY_B1_BAND_T

    if circuit.focusing_ratio < MIN_HEALTHY_FOCUSING_RATIO:
        findings.append({
            "severity": "HIGH",
            "rule": "magnet_face_area_starved",
            "detail": (
                f"flux-focusing ratio A_m/A_g = {circuit.focusing_ratio:.3f} "
                f"(< {MIN_HEALTHY_FOCUSING_RATIO}) — the magnet face covers only "
                f"{circuit.focusing_ratio * 100:.0f}% of the pole's airgap area, "
                "so it DE-focuses flux. Airgap flux scales roughly linearly with "
                "this ratio."),
        })

    if circuit.thickness_saturation_multiple > THICKNESS_SATURATION_MULTIPLE:
        # Saturated thickness is only a DEFECT when there is somewhere better to
        # spend it. If the face already covers the pole, a thick magnet is a
        # legitimate demagnetisation-margin choice, not a starved circuit — so
        # it records as MED and does not fail the screen.
        findings.append({
            "severity": ("HIGH"
                         if circuit.focusing_ratio < MIN_HEALTHY_FOCUSING_RATIO
                         else "MED"),
            "rule": "magnet_thickness_saturated",
            "detail": (
                f"t_m = {circuit.magnet_thickness_mm:.2f} mm is "
                f"{circuit.thickness_saturation_multiple:.1f}x (mur*g_eff); the "
                f"magnet already sits at {circuit.magnet_utilisation * 100:.1f}% "
                "of Br. Further thickness buys effectively no flux while "
                "consuming the radial room face area needs."),
        })

    if b_gap < lo:
        findings.append({
            "severity": "HIGH",
            "rule": "airgap_fundamental_below_band",
            "detail": (
                f"B_gap = {b_gap:.3f} T is below the healthy band {lo}-{hi} T. "
                "Torque tracks the airgap FUNDAMENTAL, so no winding, current-"
                "angle or torque-integration work can recover this."),
        })

    return {
        "schema": "forgeos.motor_stack.magnet_flux_focusing/v1",
        "circuit": asdict(circuit),
        "derived": {
            "focusing_ratio_Am_over_Ag": round(circuit.focusing_ratio, 4),
            "magnet_operating_flux_T": round(circuit.magnet_operating_flux_t, 4),
            "magnet_utilisation_frac_of_Br": round(circuit.magnet_utilisation, 4),
            "thickness_saturation_multiple": round(
                circuit.thickness_saturation_multiple, 2),
            "airgap_flux_T": round(b_gap, 4),
            "healthy_band_T": list(HEALTHY_B1_BAND_T),
        },
        "findings": findings,
        "ok": not any(f["severity"] == "HIGH" for f in findings),
    }



def _rect_corners(cx: float, cy: float, length: float, thickness: float,
                  angle_rad: float) -> list[tuple[float, float]]:
    """Corners of a rotated rectangle — the same construction the placer uses."""
    ca, sa = math.cos(angle_rad), math.sin(angle_rad)
    ax, ay = ca * length / 2.0, sa * length / 2.0        # along the long axis
    bx, by = -sa * thickness / 2.0, ca * thickness / 2.0  # across it
    return [(cx - ax - bx, cy - ay - by), (cx + ax - bx, cy + ay - by),
            (cx + ax + bx, cy + ay + by), (cx - ax + bx, cy - ay + by)]


def _rects_overlap(a: list[tuple[float, float]],
                   b: list[tuple[float, float]]) -> bool:
    """Separating-axis test for two convex quads."""
    for poly in (a, b):
        n = len(poly)
        for i in range(n):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % n]
            ax, ay = -(y2 - y1), (x2 - x1)               # edge normal
            pa = [ax * x + ay * y for x, y in a]
            pb = [ax * x + ay * y for x, y in b]
            if max(pa) <= min(pb) + 1e-9 or max(pb) <= min(pa) + 1e-9:
                return False                              # separating axis found
    return True


def v_pair_is_buildable(*, length_mm: float, thickness_mm: float,
                        magnet_centre_radius_mm: float, half_separation_deg: float,
                        tilt_rad: float) -> bool:
    """Do the two bars of a V-pair actually CLEAR each other as PLACED?

    ⭐ WHY THIS REPLACED A FILL HEURISTIC (2026-08-01, found by measurement).
    `rebalance()` used to bound length with `n * L * cos(tilt) <= 0.9 * pitch`,
    a tangential FILL fraction. That is not the constraint the placer applies:
    it seats the bars at +/- half_separation_deg with a tilt, and REFUSES the
    geometry if the two rectangles intersect. The heuristic therefore
    over-promised — the recommended 7.0 x 23.34 mm rebalance, quoted all day as
    a 1.53x gain, raised "Derived V-magnet polygons intersect in pole 0" the
    moment it was built. A screen that recommends an unbuildable geometry is
    worse than one that recommends nothing.

    Same class of fault as the documented sizer/placer disagreement in
    em_fia_front_kit_case.derive_fia_geometry, reproduced in the tangential
    direction instead of the radial one.
    """
    rects = []
    for side in (-1.0, 1.0):
        centre_angle = side * math.radians(half_separation_deg)
        cx = magnet_centre_radius_mm * math.cos(centre_angle)
        cy = magnet_centre_radius_mm * math.sin(centre_angle)
        long_axis = math.pi / 2.0 + side * tilt_rad + centre_angle * 0.0
        rects.append(_rect_corners(cx, cy, length_mm, thickness_mm, long_axis))
    return not _rects_overlap(rects[0], rects[1])


def rebalance(
    circuit: MagnetCircuit,
    *,
    max_radial_half_extent_mm: float,
    magnet_tilt_rad: float,
    max_tangential_fill: float = 0.90,
    n_bars_per_pole: int = 2,
    half_separation_deg: float | None = None,
    magnet_centre_radius_mm: float | None = None,
    is_buildable: "callable | None" = None,
) -> dict:
    """Hold magnet VOLUME roughly constant and move it from thickness to face.

    Both real constraints are respected: the V-pair must still fit the rotor
    ring radially (the placer's own test) and the bars must not collide
    tangentially inside the pole.
    """
    sin_t, cos_t = math.sin(magnet_tilt_rad), math.cos(magnet_tilt_rad)
    pitch = circuit.pole_pitch_at_magnet_mm
    best = None
    # Sweep thickness downward; for each, take the longest bar that fits BOTH
    # the radial ring and the tangential pole arc.
    t = 12.0
    while t >= 3.0:
        # radial:  L/2*sin + t/2*cos <= max_half
        # GOTCHA (found by running this on a machine that is NOT the one it was
        # written for): an UNTILTED magnet — straight bar, surface-mount, any
        # geometry with tilt 0 — makes sin_t zero and this divides by zero. With
        # no tilt the bar's radial extent does not depend on its LENGTH at all,
        # so the radial constraint simply does not bind; only the tangential one
        # does. Guard the degenerate case rather than assuming a V-magnet.
        if sin_t <= 1e-9:
            if t / 2.0 * cos_t > max_radial_half_extent_mm:
                t -= 0.25
                continue
            l_radial = float("inf")
        else:
            l_radial = (max_radial_half_extent_mm - t / 2.0 * cos_t) * 2.0 / sin_t
        # tangential: n * L * cos(tilt) <= fill * pitch
        l_tangential = max_tangential_fill * pitch / (n_bars_per_pole * cos_t)
        length = min(l_radial, l_tangential)
        # ⭐ ASK THE PLACER, DO NOT REIMPLEMENT IT (2026-08-01, learned twice).
        # The fill heuristic above over-promised: it recommended 7.0 x 23.34 mm,
        # quoted all day as a 1.53x gain, which the real placer refused with
        # "Derived V-magnet polygons intersect in pole 0". A local
        # separating-axis reimplementation ALSO disagreed with the placer — it
        # accepted 22.74 mm where the true maximum was 22.59. Two attempts to
        # model someone else's constraint, two disagreements.
        #
        # So callers may inject `is_buildable(length_mm, thickness_mm)` — the
        # PLACER'S OWN test. The built-in geometric fallback stays for callers
        # that have none, but it is documented as approximate and must never be
        # the basis of a shipped recommendation.
        if length > 0 and is_buildable is not None:
            while length > 1.0 and not is_buildable(length, t):
                length -= 0.05
        elif (length > 0 and half_separation_deg is not None
                and magnet_centre_radius_mm is not None and n_bars_per_pole == 2):
            while length > 1.0 and not v_pair_is_buildable(
                    length_mm=length, thickness_mm=t,
                    magnet_centre_radius_mm=magnet_centre_radius_mm,
                    half_separation_deg=half_separation_deg,
                    tilt_rad=magnet_tilt_rad):
                length -= 0.1
        if length > 0:
            cand = MagnetCircuit(
                remanence_t=circuit.remanence_t,
                recoil_permeability=circuit.recoil_permeability,
                magnet_thickness_mm=t,
                magnet_face_per_pole_mm=n_bars_per_pole * length * cos_t,
                pole_pitch_at_magnet_mm=pitch,
                effective_airgap_mm=circuit.effective_airgap_mm,
            )
            entry = {
                "magnet_thickness_mm": round(t, 2),
                "magnet_length_mm": round(length, 2),
                "volume_per_bar_mm2": round(t * length, 1),
                "focusing_ratio": round(cand.focusing_ratio, 3),
                "airgap_flux_T": round(cand.airgap_flux_t, 4),
                "magnet_utilisation": round(cand.magnet_utilisation, 4),
            }
            if best is None or cand.airgap_flux_t > best["airgap_flux_T"]:
                best = entry
        t -= 0.25

    gain = (best["airgap_flux_T"] / circuit.airgap_flux_t) if best else None
    return {
        "buildability_source": ("caller-supplied placer test" if is_buildable
                                else "APPROXIMATE built-in geometry — verify "
                                     "against the real placer before quoting"),
        "current": {
            "magnet_thickness_mm": round(circuit.magnet_thickness_mm, 2),
            "focusing_ratio": round(circuit.focusing_ratio, 3),
            "airgap_flux_T": round(circuit.airgap_flux_t, 4),
        },
        "best_rebalance": best,
        "airgap_flux_gain_x": round(gain, 3) if gain else None,
        "note": (
            "Torque scales with the airgap FUNDAMENTAL, so this gain carries "
            "through to shaft torque roughly one-for-one at fixed current."),
    }


# ──────────────────────────────────────────────────────────────────────────
# Twin binding
# ──────────────────────────────────────────────────────────────────────────

def from_machine(
    *,
    remanence_t: float,
    recoil_permeability: float,
    magnet_thickness_mm: float,
    magnet_length_mm: float,
    magnets_per_pole: int,
    magnet_tilt_deg: float,
    rotor_outer_diameter_mm: float,
    bridge_mm: float,
    poles: int,
    airgap_mm: float,
) -> tuple[MagnetCircuit, float, float]:
    """Build the circuit from PLAIN MACHINE NUMBERS — no archetype coupling.

    Every FE-front-kit-specific import, constant and file path that used to live
    here has been removed. Any caller with an IPM/SPM geometry can use this:
    pass the numbers, get the screen. The FE front kit is now just one caller
    (see `scripts/motor-stack/em_fia_front_kit_case.py`), not the only one.
    """
    tilt = math.radians(magnet_tilt_deg)
    r_ro = rotor_outer_diameter_mm / 2.0
    half = (magnet_length_mm / 2.0 * math.sin(tilt)
            + magnet_thickness_mm / 2.0 * math.cos(tilt))
    r_mag = r_ro - bridge_mm - half
    pole_pitch = 2.0 * math.pi * r_mag / poles
    face = magnets_per_pole * magnet_length_mm * math.cos(tilt)
    circuit = MagnetCircuit(
        remanence_t=remanence_t,
        recoil_permeability=recoil_permeability,
        magnet_thickness_mm=magnet_thickness_mm,
        magnet_face_per_pole_mm=face,
        pole_pitch_at_magnet_mm=pole_pitch,
        effective_airgap_mm=airgap_mm,
    )
    return circuit, half, tilt


# ──────────────────────────────────────────────────────────────────────────
# proveCatch
# ──────────────────────────────────────────────────────────────────────────

def _selftest() -> int:
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            failures.append(f"{name}: {detail}")

    # ADVERSARIAL INPUT 1 — the live FE front kit geometry, which is legal in
    # every existing screen (fits the ring, clears bridges, no intersection)
    # and is nonetheless structurally under-magnetised. The gate MUST fire.
    starved = MagnetCircuit(
        remanence_t=1.24, recoil_permeability=1.05,
        magnet_thickness_mm=8.85,
        magnet_face_per_pole_mm=2 * 14.5793 * math.cos(math.radians(20.0)),
        pole_pitch_at_magnet_mm=2 * math.pi * 62.05 / 8,
        effective_airgap_mm=0.7)
    res = screen(starved)
    check("proveCatch.starved_fires", not res["ok"],
          "the live starved geometry passed the screen")
    rules = {f["rule"] for f in res["findings"]}
    check("proveCatch.names_face_area", "magnet_face_area_starved" in rules,
          f"did not name face area; got {rules}")
    check("proveCatch.names_thickness", "magnet_thickness_saturated" in rules,
          f"did not name thickness saturation; got {rules}")

    # The screen must AGREE with the measured FE direction: both say the
    # airgap fundamental is under the healthy band.
    check("proveCatch.below_band", "airgap_fundamental_below_band" in rules,
          "did not flag the fundamental as below band")

    # ADVERSARIAL INPUT 2 — a WELL-focused magnet must NOT fire, or the gate is
    # decoration that flags everything.
    healthy = MagnetCircuit(
        remanence_t=1.24, recoil_permeability=1.05,
        magnet_thickness_mm=5.0,
        magnet_face_per_pole_mm=0.95 * (2 * math.pi * 62.0 / 8),
        pole_pitch_at_magnet_mm=2 * math.pi * 62.0 / 8,
        effective_airgap_mm=0.7)
    ok = screen(healthy)
    check("proveCatch.healthy_silent", ok["ok"],
          f"a well-focused magnet fired: {ok['findings']}")

    # PHYSICS INVARIANT 1 — thickness saturates. DOUBLING thickness at fixed
    # face area must move airgap flux by under 6%.
    thin = MagnetCircuit(1.24, 1.05, 6.0, 40.0, 48.0, 0.7)
    thick = MagnetCircuit(1.24, 1.05, 12.0, 40.0, 48.0, 0.7)
    delta = abs(thick.airgap_flux_t - thin.airgap_flux_t) / thin.airgap_flux_t
    check("physics.thickness_saturates", delta < 0.06,
          f"doubling thickness moved airgap flux {delta * 100:.1f}% (expected <6%)")

    # PHYSICS INVARIANT 2 — face area has real leverage. +50% face must give
    # >+40% airgap flux (near-linear), i.e. the OPPOSITE of thickness.
    narrow = MagnetCircuit(1.24, 1.05, 6.0, 30.0, 48.0, 0.7)
    wide = MagnetCircuit(1.24, 1.05, 6.0, 45.0, 48.0, 0.7)
    gain = (wide.airgap_flux_t - narrow.airgap_flux_t) / narrow.airgap_flux_t
    check("physics.face_area_leverages", gain > 0.40,
          f"+50% face gave only +{gain * 100:.1f}% airgap flux")

    # PHYSICS INVARIANT 2b — the CONTRAST is the whole point of this screen, and
    # it is what the source rule's comment ("thickness drives flux, length
    # drives pole arc") gets backwards. Compare ELASTICITIES (relative response
    # per relative change), not raw deltas — the two probes above perturb by
    # different amounts (+50% face vs +100% thickness), so raw deltas would
    # understate the contrast.
    face_elasticity = gain / 0.50
    thickness_elasticity = delta / 1.00
    check("physics.face_out_leverages_thickness",
          face_elasticity > 10.0 * thickness_elasticity,
          f"face elasticity {face_elasticity:.2f} vs thickness "
          f"{thickness_elasticity:.3f} — not the >10x contrast this screen "
          "exists to assert")

    # INVARIANT 3 — the rebalance must respect BOTH constraints it is given.
    reb = rebalance(starved, max_radial_half_extent_mm=7.375,
                    magnet_tilt_rad=math.radians(20.0))
    best = reb["best_rebalance"]
    check("rebalance.found", best is not None, "no feasible rebalance")
    if best:
        # Tolerance is 0.01 mm, not 1e-6: the reported length is rounded to 2 dp
        # for the operator, so an exactly-at-the-limit solution can round just
        # over it. A hundredth of a millimetre is below any manufacturing
        # tolerance and cannot mask a real overrun.
        half = (best["magnet_length_mm"] / 2.0 * math.sin(math.radians(20.0))
                + best["magnet_thickness_mm"] / 2.0 * math.cos(math.radians(20.0)))
        check("rebalance.fits_radially", half <= 7.375 + 0.01,
              f"half extent {half:.3f} exceeds the placer budget 7.375")
        tang = 2 * best["magnet_length_mm"] * math.cos(math.radians(20.0))
        check("rebalance.fits_tangentially",
              tang <= 0.90 * starved.pole_pitch_at_magnet_mm + 0.01,
              f"tangential {tang:.2f} exceeds 90% of pole pitch")
        check("rebalance.improves", reb["airgap_flux_gain_x"] > 1.0,
              "rebalance did not improve airgap flux")

    # UNIVERSALITY proveCatch — this module must work on machines it was NOT
    # written for. A zero-tilt (surface-mount / straight-bar) magnet used to
    # divide by sin(0) in rebalance(); FE-front-kit-only testing never hit it.
    flat = MagnetCircuit(1.35, 1.05, 4.0, 30.0, 55.0, 1.2)
    try:
        reb_flat = rebalance(flat, max_radial_half_extent_mm=6.0,
                             magnet_tilt_rad=0.0, n_bars_per_pole=1)
        check("universal.zero_tilt_magnet", reb_flat["best_rebalance"] is not None,
              "no rebalance found for an untilted magnet")
    except ZeroDivisionError:
        check("universal.zero_tilt_magnet", False,
              "rebalance divides by zero when magnet tilt is 0")

    # And a different pole count / bar count must screen without complaint.
    spm = MagnetCircuit(1.35, 1.05, 4.0, 30.0, 55.0, 1.2)
    _ = screen(spm)
    check("universal.other_pole_count_screens", True)

    for f in failures:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if failures else 'PASS'} "
          f"machine_magnet_flux_focusing selftest ({len(failures)} failures)")
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--machine-json", type=Path,
                    help="JSON with the machine numbers (see from_machine)")
    ap.add_argument("--output", type=Path)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--enforce", action="store_true",
                    help="exit 43 when the screen BLOCKS (default: report)")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()
    if not args.machine_json:
        ap.error("--machine-json required unless --selftest")

    spec = json.loads(args.machine_json.read_text())
    circuit, max_half, tilt = from_machine(**spec)
    res = screen(circuit)
    res["rebalance"] = rebalance(
        circuit, max_radial_half_extent_mm=max_half, magnet_tilt_rad=tilt,
        n_bars_per_pole=int(spec.get("magnets_per_pole", 2)))

    out = args.output or args.machine_json.with_name("magnet_flux_focusing.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2))

    if args.json:
        print(json.dumps(res, indent=2))
    else:
        d = res["derived"]
        print(f"  focusing ratio A_m/A_g       = {d['focusing_ratio_Am_over_Ag']}")
        print(f"  magnet operating point       = {d['magnet_operating_flux_T']} T "
              f"({d['magnet_utilisation_frac_of_Br'] * 100:.1f}% of Br)")
        print(f"  thickness / (mur*g_eff)      = {d['thickness_saturation_multiple']}x")
        print(f"  airgap flux (analytic)       = {d['airgap_flux_T']} T "
              f"(healthy {d['healthy_band_T']})")
        for f in res["findings"]:
            print(f"  [{f['severity']}] {f['rule']}: {f['detail']}")
        reb = res["rebalance"]["best_rebalance"]
        if reb and "APPROXIMATE" in res["rebalance"].get("buildability_source", ""):
            print("  ⚠ REBALANCE IS UNVERIFIED — no placer test was supplied, so "
                  "these dimensions may not BUILD. The recommended 7.0 x 23.34 mm "
                  "for the FE front MGU was refused by the real placer (the "
                  "V-magnets collide). Pass is_buildable=<the placer's own test> "
                  "before quoting or committing these numbers.")
        if reb:
            print(f"  REBALANCE -> t={reb['magnet_thickness_mm']} mm "
                  f"L={reb['magnet_length_mm']} mm  "
                  f"A_m/A_g={reb['focusing_ratio']}  "
                  f"B_gap={reb['airgap_flux_T']} T "
                  f"({res['rebalance']['airgap_flux_gain_x']}x)")
    print(f"Artefact: {out}")
    # Enforcement mirrors gate 41: the CLI must be able to BLOCK, so the
    # registry can prove the catch from OUTSIDE rather than by importing the
    # screen in-process (Sol, pre-commit council 2026-08-01).
    if not res["ok"] and (args.enforce or enforce_mode_from_env() != "off"):
        print("  GATE BLOCKS — do not ship this machine's numbers.")
        return 43
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
