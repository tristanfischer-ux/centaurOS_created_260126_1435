"""First-order radio-frequency impact of one-third double walls on hex cells.

Tony (29 Jul): continuous waveguide *arrays* from folded strip need one-third
of walls doubled; Vlad must say whether that is radio-frequency-insuperable.
This is NOT a Floquet array solve — it is the single-cell cutoff / guide-
wavelength shift from the geometry change alone, so the conversation with
Vlad has numbers rather than adjectives.

Two bounding models (tape thickness 75 micrometres, interior across-flats
3.10 mm from Tony's geometry):

  1. Exterior pitch held, doubled walls eat interior → anisotropic shrink
     approximated by reducing across-flats by one tape thickness (worst
     single-cell bound).
  2. Interior held, exterior pitch grows by one tape thickness on the
     doubled-wall axis (≈2.3% biperiodic pitch — matches the main-report
     estimate). Cutoff of the *interior* is unchanged; the array lattice
     constant changes (beam-forming / Floquet — Vlad).

Run: ~/.venvs/phantm/bin/python double_wall_rf_check.py
       -> out/double-wall-rf-check.json
"""

from __future__ import annotations

import json
import math
import os

from hexcell import C0, hex_mask_exact, te_cutoff_wavenumber

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

AF_MM = 3.10          # interior across-flats
PITCH_MM = 3.25       # tiling pitch
WALL_NOM_MM = 0.15    # as-drawn wall (STL)
TAPE_MM = 0.075       # Tony folded-foil candidate
N_GRID = 96


def cutoff_ghz(af_mm: float) -> dict:
    mask, h = hex_mask_exact(af_mm, N_GRID)
    kc = te_cutoff_wavenumber(mask, h)          # 1/mm
    lam_c = 2 * math.pi / kc                    # mm — same as hexcell.py
    fc = C0 / lam_c                             # GHz
    return dict(af_mm=af_mm, kc_per_mm=kc, lam_c_mm=lam_c, fc_ghz=fc)


def guide_wavelength_mm(fc_ghz: float, f_ghz: float) -> float | None:
    if f_ghz <= fc_ghz:
        return None
    lam0 = C0 / f_ghz
    lam_c = C0 / fc_ghz
    return lam0 / math.sqrt(1.0 - (lam0 / lam_c) ** 2)


def main():
    base = cutoff_ghz(AF_MM)
    # Model 1: interior shrinks by one tape thickness (aggressive single-cell)
    shrunk = cutoff_ghz(AF_MM - TAPE_MM)
    # Milder: average wall thickening on 1/3 of perimeter ≈ reduce AF by t/3
    mild = cutoff_ghz(AF_MM - TAPE_MM / 3.0)

    freqs = [50.0, 60.0, 70.0, 75.0, 80.0]
    rows = []
    for f in freqs:
        lam_g0 = guide_wavelength_mm(base["fc_ghz"], f)
        lam_g1 = guide_wavelength_mm(shrunk["fc_ghz"], f)
        rows.append(dict(
            f_ghz=f,
            lam_g_uniform_mm=None if lam_g0 is None else round(lam_g0, 3),
            lam_g_shrunk_mm=None if lam_g1 is None else round(lam_g1, 3),
            lam_g_shift_pct=(None if (lam_g0 is None or lam_g1 is None)
                             else round((lam_g1 / lam_g0 - 1) * 100, 2)),
        ))

    pitch_growth_pct = (TAPE_MM / PITCH_MM) * 100.0

    out = dict(
        note=("Single-cell cutoff bounds for one-third double walls. "
              "Not a periodic-array Floquet solve — that remains Vlad's."),
        geometry_mm=dict(interior_across_flats=AF_MM, tiling_pitch=PITCH_MM,
                         drawn_wall=WALL_NOM_MM, tape_thickness=TAPE_MM),
        uniform_cell=dict(fc_ghz=round(base["fc_ghz"], 3),
                          kc_per_mm=round(base["kc_per_mm"], 5)),
        model_interior_shrink_by_tape=dict(
            af_mm=round(AF_MM - TAPE_MM, 3),
            fc_ghz=round(shrunk["fc_ghz"], 3),
            delta_fc_mhz=round((shrunk["fc_ghz"] - base["fc_ghz"]) * 1000, 1),
            verdict=("Worst single-cell bound if exterior pitch is fixed and "
                     "doubled walls consume aperture")),
        model_interior_shrink_by_tape_over_3=dict(
            af_mm=round(AF_MM - TAPE_MM / 3.0, 3),
            fc_ghz=round(mild["fc_ghz"], 3),
            delta_fc_mhz=round((mild["fc_ghz"] - base["fc_ghz"]) * 1000, 1),
            verdict="Smoother average if only one of three wall classes doubles"),
        model_interior_held_exterior_grows=dict(
            pitch_mm=round(PITCH_MM + TAPE_MM, 3),
            pitch_growth_pct=round(pitch_growth_pct, 2),
            fc_interior_ghz=round(base["fc_ghz"], 3),
            delta_fc_mhz=0.0,
            verdict=("Cutoff of each guide unchanged; array lattice becomes "
                     "biperiodic — beam-forming / Floquet is the real question")),
        guide_wavelength_vs_frequency=rows,
        for_vlad=dict(
            question=("Is a periodic one-third-double-wall hex lattice "
                      "radio-frequency-acceptable at 75 GHz, given "
                      f"~{pitch_growth_pct:.1f}% pitch growth on one axis "
                      "and/or up to "
                      f"{(shrunk['fc_ghz']-base['fc_ghz'])*1000:.0f} MHz "
                      "cutoff shift if aperture is eaten?"),
            anvil_cannot_close="Full Floquet / periodic-supercell array response",
        ),
    )
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "double-wall-rf-check.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"wrote {path}")
    print(f"  uniform fc = {base['fc_ghz']:.3f} GHz")
    print(f"  shrink-by-tape fc = {shrunk['fc_ghz']:.3f} GHz  "
          f"(Δ {(shrunk['fc_ghz']-base['fc_ghz'])*1000:.0f} MHz)")
    print(f"  interior-held pitch growth = {pitch_growth_pct:.2f}%")


if __name__ == "__main__":
    main()
