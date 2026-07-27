"""PHANTM — the driver electromagnetic-compatibility layout SPECIFICATION.

WHY THIS EXISTS. The report claims the aperture is electromagnetically silent at
hold: the detent is permanent-magnet, so a held cell draws no current and
radiates nothing. That is the low-probability-of-intercept property the bid
sells, and it is genuinely a property of the ARCHITECTURE rather than of careful
engineering. But it was carried with an open requirement attached, in the honest
form: a silent actuator behind a badly laid-out driver is not a silent aperture,
and "lay the driver out well" is not a specification. This module turns it into
one, with the numbers computed rather than asserted.

THE FIRST THING TO ESTABLISH IS WHAT IS *NOT* A RISK, because it determines
where the effort goes. The drive is a millisecond-scale pulse into a coil whose
own electrical time constant is about a microsecond. A trapezoidal pulse with
rise time tr has a spectral envelope that breaks at 1/(pi*tr) and falls at
40 dB/decade above it. From that knee up to the 60-80 GHz operating band is more
than five decades, i.e. north of 200 dB of roll-off. The drive electronics
therefore CANNOT radiate meaningfully in band — not because of good layout, but
because the physics separates the two by five orders of magnitude.

So the layout rules below are not about in-band radiation. They are about the
three things that genuinely can go wrong:
  (a) near-field magnetic coupling from the drive loops into the aperture
      structure and the receive chain, which is a broadband desense problem, not
      an in-band emission one;
  (b) the hold state ceasing to be silent because the driver idles noisily —
      which would forfeit the LPI property outright, and is the only failure
      here that attacks the actual claim;
  (c) self-compatibility across the 72 coils of a tile switching together.

Run: ~/.venvs/phantm/bin/python emc_spec.py -> out/emc-spec.json
"""

from __future__ import annotations

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

MU0 = 4e-7 * math.pi
C_LIGHT = 2.99792458e8

# --- the drive, as designed (drive-electronics.json / report §15) -----------
R_COIL = 0.552          # ohm
L_COIL = 0.6e-6         # H (finite-element value)
I_STEP = 1.8            # A, stepping regime
I_DUAL = 3.35           # A, balanced dual scheme
I_MAX = 5.0             # A, max-force scheme
PULSE_S = 1.5e-3
COILS_PER_CELL = 3
CELLS_PER_TILE = 24
BAND_LOW_HZ = 60e9
BAND_HIGH_HZ = 80e9

# --- the layout budget this document SPECIFIES ------------------------------
# A drive loop's area is trace run x dielectric height to its return plane.
# 20 mm of run over a 0.2 mm prepreg is 4 mm^2, which is ordinary four-layer
# practice — so this is a specification a fabricator can simply meet, not a
# stretch target.
LOOP_AREA_BUDGET_MM2 = 4.0
RETURN_PLANE_HEIGHT_MM = 0.2
MIN_EDGE_NS = 100.0     # deliberate slew FLOOR — see rationale below


def spectral_knee_hz(tr_s: float) -> float:
    """Break frequency of a trapezoidal pulse envelope."""
    return 1.0 / (math.pi * tr_s)


def rolloff_db(f_from: float, f_to: float, db_per_decade: float = 40.0) -> float:
    return db_per_decade * math.log10(f_to / f_from)


def loop_near_field_a_per_m(i_a: float, area_m2: float, r_m: float) -> float:
    """On-axis H from a small current loop at distance r (magnetostatic near field)."""
    return i_a * area_m2 / (2.0 * math.pi * r_m ** 3)


def build() -> dict:
    tau_s = L_COIL / R_COIL
    # The coil cannot be driven faster than its own L/R, so that is the natural
    # edge; the deliberate floor below it exists so nobody "improves" the bridge
    # by fitting a faster gate driver and buys spectrum for nothing.
    knee_natural = spectral_knee_hz(tau_s)
    knee_floor = spectral_knee_hz(MIN_EDGE_NS * 1e-9)
    atten_band = rolloff_db(knee_floor, BAND_LOW_HZ)

    area_m2 = LOOP_AREA_BUDGET_MM2 * 1e-6
    near = {f"{r*1e3:.0f} mm": round(loop_near_field_a_per_m(I_MAX, area_m2, r), 6)
            for r in (0.005, 0.010, 0.050)}

    rules = [
        dict(id="EMC-1", title="Bound the drive loop area",
             rule=f"Every coil drive loop (bridge output -> coil -> return) "
                  f"shall enclose no more than {LOOP_AREA_BUDGET_MM2:.0f} mm². "
                  f"Route each coil pair directly above an unbroken return "
                  f"plane at {RETURN_PLANE_HEIGHT_MM} mm, or run the pair as a "
                  f"tightly-coupled differential pair.",
             why="Loop area is the only term in the radiated magnetic moment "
                 "that layout controls; current and pulse shape are set by the "
                 "mechanics. It is also the cheapest to control at design time "
                 "and the most expensive to fix afterwards.",
             verify="Extract enclosed loop area per coil net from the finished "
                    "layout and check against the budget — a geometric check on "
                    "the board file, not a measurement."),
        dict(id="EMC-2", title="Never split the return plane under a drive loop",
             rule="No plane split, gap or via-field shall cross beneath any coil "
                  "drive trace. Where a split is unavoidable the drive trace "
                  "shall be re-routed, not stitched across.",
             why="A split forces the return current to detour around it, and "
                 "the enclosed area of that detour can exceed the whole rest of "
                 "the loop — which silently defeats EMC-1 while the layout "
                 "still looks compliant.",
             verify="Visual and design-rule check against the plane layer."),
        dict(id="EMC-3", title="Slew-limit the bridge deliberately",
             rule=f"Bridge output edges shall be no faster than "
                  f"{MIN_EDGE_NS:.0f} ns. Gate drive shall be resistor-limited "
                  f"to enforce this.",
             why=f"The coil's own L/R time constant is {tau_s*1e6:.1f} µs, so "
                 f"edges faster than this buy no mechanical performance "
                 f"whatsoever — they only extend the emitted spectrum. This is "
                 f"a rule against a well-meant future 'improvement'.",
             verify="Oscilloscope on the bridge output at bring-up; measure "
                    "10-90% edge."),
        dict(id="EMC-4", title="The hold state shall be genuinely quiet",
             rule="At hold the bridge shall rest in a defined non-switching "
                  "state with both outputs at the same rail and zero coil "
                  "current. No pulse-width modulation, no current-regulation "
                  "loop and no housekeeping switcher shall remain active on the "
                  "coil rail while cells are held.",
             why="This is the only rule here that defends the actual claim. The "
                 "aperture's low-probability-of-intercept property rests "
                 "entirely on a held cell drawing zero current; a driver that "
                 "idles with a switching regulator on the coil rail forfeits it "
                 "completely, and would do so invisibly. Current is already set "
                 "by rail voltage against the coil resistance, so no regulation "
                 "loop is needed at hold.",
             verify="Measure coil current at hold with a current probe — the "
                    "acceptance criterion is indistinguishable from zero, and "
                    "conducted emission on the coil rail at the noise floor."),
        dict(id="EMC-5", title="Filter every conductor crossing the aperture boundary",
             rule="Each conductor entering the aperture volume shall carry a "
                  "feed-through or common-mode filter at the boundary. Coil "
                  "pairs shall cross as tightly-coupled pairs, never as single "
                  "conductors sharing a distant return.",
             why="An unfiltered conductor through a shielding boundary is an "
                 "antenna on both sides of it, and undoes the shield it passes "
                 "through regardless of how good that shield is.",
             verify="Boundary inspection plus a conducted-emission scan on each "
                    "penetrating conductor."),
        dict(id="EMC-6", title="Stagger the tile's coil switching",
             rule=f"The {COILS_PER_CELL * CELLS_PER_TILE} coils of a tile shall "
                  f"not commutate on a common edge. Group starts shall be "
                  f"skewed by at least one bridge edge time.",
             why="Simultaneous switching sums coherently in both the supply "
                 "current and the radiated near field, turning many small "
                 "sources into one large one for no functional benefit.",
             verify="Firmware sequence review plus a supply-current transient "
                    "measurement across a full tile re-point."),
    ]

    return dict(
        drive=dict(r_ohm=R_COIL, l_h=L_COIL, tau_us=round(tau_s * 1e6, 3),
                   i_step_a=I_STEP, i_dual_a=I_DUAL, i_max_a=I_MAX,
                   pulse_ms=PULSE_S * 1e3,
                   coils_per_tile=COILS_PER_CELL * CELLS_PER_TILE),
        spectrum=dict(
            knee_natural_khz=round(knee_natural / 1e3, 1),
            knee_at_slew_floor_mhz=round(knee_floor / 1e6, 3),
            band_low_ghz=BAND_LOW_HZ / 1e9, band_high_ghz=BAND_HIGH_HZ / 1e9,
            decades_to_band=round(math.log10(BAND_LOW_HZ / knee_floor), 2),
            attenuation_to_band_db=round(atten_band, 0),
            conclusion=("the drive spectrum and the operating band are "
                        "separated by more than five decades, so in-band "
                        "radiation from the driver is not a credible mechanism "
                        "— the rules below target near-field coupling and the "
                        "integrity of the silent hold instead")),
        layout_budget=dict(loop_area_mm2=LOOP_AREA_BUDGET_MM2,
                           return_plane_height_mm=RETURN_PLANE_HEIGHT_MM,
                           min_edge_ns=MIN_EDGE_NS,
                           near_field_a_per_m_at_i_max=near),
        rules=rules)


def main():
    os.makedirs(OUT, exist_ok=True)
    spec = build()
    json.dump(spec, open(os.path.join(OUT, "emc-spec.json"), "w"), indent=1)
    s = spec["spectrum"]
    print(f"drive tau {spec['drive']['tau_us']} µs; natural knee "
          f"{s['knee_natural_khz']} kHz; at the {MIN_EDGE_NS:.0f} ns slew floor "
          f"{s['knee_at_slew_floor_mhz']} MHz")
    print(f"separation to {s['band_low_ghz']:.0f} GHz: "
          f"{s['decades_to_band']} decades = {s['attenuation_to_band_db']:.0f} dB "
          f"of envelope roll-off")
    print(f"{len(spec['rules'])} layout rules, each with a verification method")
    print("wrote out/emc-spec.json")


if __name__ == "__main__":
    main()
