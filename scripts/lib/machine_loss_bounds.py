#!/usr/bin/env python3
"""Loss bounds from MEASURED field, for any rotating machine.

Two losses that are routinely got wrong in opposite directions, and the reason
is the same in both cases: the FREQUENCY and the FIELD that actually drive them
are not the ones a naive model uses.

  ROTOR / MAGNET EDDY. A magnet rotating synchronously sees the FUNDAMENTAL AS
  DC — it induces nothing. Only ASYNCHRONOUS harmonics do, arriving at
  slot-passing frequency in the ROTOR frame (Zs * n / 60), with only the AC
  amplitude INSIDE the magnet. Applying full electrical frequency to the bulk
  volume as an unsegmented slab is how `motor_loss_point.py` produced 4.2 kW on
  the FE front MGU (~18 kW at the real volume) against a measured bound of
  0.61 kW at 8 segments.

  STATOR IRON. The stator is STATIONARY and the fundamental sweeps past it, so
  its loss IS driven at electrical frequency. But teeth and yoke sit at very
  different flux densities and must not share a lumped value: measured 1.799 T
  in the teeth against 2.104 T in the yoke, where the model assumed 1.2 T for
  both. With real masses that took iron loss from 135.6 W to 1020.5 W — 7.5x.

SEGMENTATION IS THE DOMINANT PARAMETER for eddy loss, not the material
coefficient: loss scales with segment width SQUARED, so it is worth orders where
a coefficient argument is worth a factor. Corpus corroboration
(`fpk:thermal:017baf38ff`): "the increased high-frequency eddy current loss will
lead to more severe rotor heating" at high speed.

SKIN DEPTH BOUNDS THE UNSEGMENTED CASE. Above it the slab formula overestimates,
because eddy reaction stops the field penetrating. Reported so an impossible
unsegmented figure is read as "must segment", not as a literal wattage.

UNIVERSAL: plain numbers in, no archetype knowledge, no file paths.

Usage:  machine_loss_bounds.py --selftest
"""

from __future__ import annotations

import argparse
import math

MU0 = 4.0e-7 * math.pi

# NdFeB. Resistivity is the sensitive constant: eddy loss goes as 1/rho.
NDFEB_RESISTIVITY_OHM_M = 1.6e-6
NDFEB_REL_PERMEABILITY = 1.05


def skin_depth_m(*, resistivity_ohm_m: float, frequency_hz: float,
                 relative_permeability: float = 1.0) -> float:
    """Depth at which the AC field falls to 1/e. Beyond it the slab formula
    OVERESTIMATES, because the field never reaches the interior."""
    return math.sqrt(resistivity_ohm_m
                     / (math.pi * frequency_hz * MU0 * relative_permeability))


def eddy_loss_w(*, segment_width_m: float, frequency_hz: float,
                ac_flux_amplitude_t: float, volume_m3: float,
                resistivity_ohm_m: float = NDFEB_RESISTIVITY_OHM_M) -> float:
    """Classical slab eddy loss: P = pi^2 w^2 f^2 B^2 V / (6 rho).

    `ac_flux_amplitude_t` must be the AC amplitude MEASURED INSIDE the conductor
    — not the airgap field, and emphatically not the field in the retaining
    bridge. On the FE front MGU the bridge measured 2.05-2.30 T DC with 0.35 T
    of AC; feeding that in gives 3.95 GW/m^3, absurd by three orders. The bridge
    CARRIES the harmonic; the magnet behind it saw 0.0765 T.
    """
    return (math.pi ** 2 * segment_width_m ** 2 * frequency_hz ** 2
            * ac_flux_amplitude_t ** 2 * volume_m3) / (6.0 * resistivity_ohm_m)


def magnet_eddy_bound(
    *,
    ac_flux_amplitude_t: float,
    stator_slots: int,
    speed_rpm: float,
    magnet_volume_m3: float,
    unsegmented_width_m: float,
    segment_counts: tuple[int, ...] = (1, 2, 4, 8, 16),
    resistivity_ohm_m: float = NDFEB_RESISTIVITY_OHM_M,
    plausible_ceiling_w: float = 2000.0,
) -> dict:
    """Eddy loss versus segmentation, and the minimum segments that are viable.

    The driving frequency is SLOT PASSING IN THE ROTOR FRAME — Zs * n / 60 —
    NOT the electrical frequency p * n / 60. That distinction is the whole
    point: get it wrong and the answer is out by (Zs/p)^2, here 36x.
    """
    f_slot = stator_slots * speed_rpm / 60.0
    delta = skin_depth_m(resistivity_ohm_m=resistivity_ohm_m,
                         frequency_hz=f_slot,
                         relative_permeability=NDFEB_REL_PERMEABILITY)
    rows = []
    for n in segment_counts:
        w = unsegmented_width_m / n
        p = eddy_loss_w(segment_width_m=w, frequency_hz=f_slot,
                        ac_flux_amplitude_t=ac_flux_amplitude_t,
                        volume_m3=magnet_volume_m3,
                        resistivity_ohm_m=resistivity_ohm_m)
        rows.append({
            "segments": n,
            "segment_width_mm": round(w * 1000.0, 4),
            "eddy_loss_w": round(p, 1),
            "within_skin_depth": w <= delta,
            # Above skin depth the slab formula overestimates; say so rather
            # than let an impossible wattage be quoted as if literal.
            "formula_valid": w <= delta,
        })
    viable = [r for r in rows if r["eddy_loss_w"] <= plausible_ceiling_w]
    return {
        "schema": "forgeos.machine.loss_bounds.magnet_eddy/v1",
        "slot_passing_frequency_hz": round(f_slot, 1),
        "electrical_frequency_note": (
            "slot passing, NOT p*n/60 — the fundamental is DC in the rotor frame"),
        "skin_depth_mm": round(delta * 1000.0, 3),
        "ac_flux_amplitude_t": ac_flux_amplitude_t,
        "rows": rows,
        "minimum_viable_segments": (viable[0]["segments"] if viable else None),
        "verdict": (
            f"segment into at least {viable[0]['segments']} pieces "
            f"({viable[0]['eddy_loss_w']:.0f} W)" if viable else
            "NO segmentation in the tested range brings this under the ceiling"),
    }


def stator_iron_loss(
    *,
    tooth_flux_t: float, tooth_mass_kg: float,
    yoke_flux_t: float, yoke_mass_kg: float,
    electrical_frequency_hz: float,
    steinmetz_kh: float = 0.02, steinmetz_ke: float = 1e-5,
    steinmetz_alpha: float = 1.8,
) -> dict:
    """Iron loss with teeth and yoke kept SEPARATE.

    A lumped `iron_b_t` cannot represent both: on the FE front MGU the teeth
    measured 1.799 T and the yoke 2.104 T, and the yoke is also the HEAVIER
    region (3.66 kg against 2.96 kg), so lumping understates the dominant term
    twice over.

    NOTE (corpus, `fpk:fea:P_core`): the literature for this class describes a
    HIERARCHICAL method computing core loss from the analytical air-gap field
    solution, which is more rigorous than this Steinmetz form. Recorded as a
    known refinement rather than silently ignored.
    """
    def one(b: float, m: float) -> float:
        f = electrical_frequency_hz
        return (steinmetz_kh * f * b ** steinmetz_alpha
                + steinmetz_ke * f ** 2 * b ** 2) * m

    t, y = one(tooth_flux_t, tooth_mass_kg), one(yoke_flux_t, yoke_mass_kg)
    return {
        "schema": "forgeos.machine.loss_bounds.stator_iron/v1",
        "tooth_loss_w": round(t, 1), "yoke_loss_w": round(y, 1),
        "total_w": round(t + y, 1),
        "dominant_region": "yoke" if y > t else "teeth",
        "known_refinement": (
            "hierarchical method from the analytical air-gap field solution "
            "(corpus fpk:fea:P_core) is more rigorous than this Steinmetz form"),
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            fails.append(f"{name}: {detail}")

    # ── The measured FE front MGU case ────────────────────────────────────
    vol = 16 * 0.006 * 0.0225 * 0.09758
    r = magnet_eddy_bound(ac_flux_amplitude_t=0.0765, stator_slots=24,
                          speed_rpm=19500.0, magnet_volume_m3=vol,
                          unsegmented_width_m=0.0225)
    ck("freq.is_slot_passing", abs(r["slot_passing_frequency_hz"] - 7800.0) < 1.0,
       f"got {r['slot_passing_frequency_hz']} Hz, expected 7800")
    # The whole point: using ELECTRICAL frequency instead would be 36x low.
    ck("freq.not_electrical", abs(r["slot_passing_frequency_hz"] - 1300.0) > 1.0,
       "used p*n/60 instead of Zs*n/60")
    ck("bound.unsegmented_impossible", r["rows"][0]["eddy_loss_w"] > 10_000,
       "an unsegmented bar did not come out impossible")
    ck("bound.segmentation_helps", r["minimum_viable_segments"] in (4, 8),
       f"minimum viable segments = {r['minimum_viable_segments']}")
    # w^2 scaling is the reason segmentation dominates: halving w must quarter P.
    a, b = r["rows"][0]["eddy_loss_w"], r["rows"][1]["eddy_loss_w"]
    ck("physics.w_squared", abs(a / b - 4.0) < 0.05,
       f"halving segment width changed loss by {a / b:.2f}x, expected 4")
    ck("skin.reported", r["skin_depth_mm"] > 0, "no skin depth reported")
    ck("skin.flags_invalid_formula", r["rows"][0]["formula_valid"] is False,
       "a 22.5 mm bar above skin depth was not flagged as overestimating")

    # ── The bridge-iron trap: an absurd input must yield an absurd output,
    #    NOT a plausible one. A model that quietly absorbs a bad field is worse
    #    than one that shouts.
    bad = magnet_eddy_bound(ac_flux_amplitude_t=0.353, stator_slots=24,
                            speed_rpm=19500.0, magnet_volume_m3=vol,
                            unsegmented_width_m=0.0225)
    ck("trap.bridge_field_is_obviously_absurd",
       bad["rows"][0]["eddy_loss_w"] > 500_000,
       "the bridge-iron field did not produce an obviously impossible number")

    # ── Iron loss: teeth and yoke separate ────────────────────────────────
    i = stator_iron_loss(tooth_flux_t=1.799, tooth_mass_kg=2.960,
                         yoke_flux_t=2.104, yoke_mass_kg=3.662,
                         electrical_frequency_hz=1300.0)
    ck("iron.yoke_dominates", i["dominant_region"] == "yoke",
       f"dominant region {i['dominant_region']}")
    # A lumped average must UNDERSTATE the split calculation, which is the
    # error this function exists to remove.
    lumped = stator_iron_loss(tooth_flux_t=1.2, tooth_mass_kg=5.0,
                              yoke_flux_t=1.2, yoke_mass_kg=0.0,
                              electrical_frequency_hz=1300.0)
    ck("iron.lumped_understates", lumped["total_w"] < i["total_w"],
       f"lumped {lumped['total_w']} not below split {i['total_w']}")

    # ── UNIVERSALITY: a different machine must work, not just this one.
    other = magnet_eddy_bound(ac_flux_amplitude_t=0.05, stator_slots=36,
                              speed_rpm=6000.0, magnet_volume_m3=1e-4,
                              unsegmented_width_m=0.03)
    ck("universal.other_machine", abs(other["slot_passing_frequency_hz"] - 3600.0) < 1.0,
       f"36 slots at 6000 rpm gave {other['slot_passing_frequency_hz']} Hz")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} machine_loss_bounds selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    ap.error("--selftest is the only mode; import the functions to use them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
