"""PHANTM actuator — deterministic selftest (Increment A scope).

Calibration anchors from the brief + independent hand-checks:
  * Mt ≈ 0.16 g at 26 slots/face, 7.4 g/cm³ (brief §4.1 hand-check)
  * Wm = 77.5 µm exactly (§3)
  * bridge radial span reconciles: 2·0.465 + 2·0.0775 + 1.549 = 2.634 (§2.2)
  * each slot-section face carries 3 teeth at the translator tooth pitch
  * coil (20t × 58 µm OD) fits the 0.263 mm bridge-centre window
  * pole phasing: computed offsets are LOCKED, incl. the ~13 µm discrepancy vs the
    ideal pitch/3 that goes back to Tony as an open question (0.374 mm spacing
    gives 0.142 mm, not 0.155 mm)
Materials sanity: SMC B-H monotone + round-trips; NdFeB load line signs.

Run:  .venv-phantm/bin/python scripts/phantm/selftest.py   → exits 0 green.
"""

from __future__ import annotations

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import numpy as np  # noqa: E402

import geometry as g  # noqa: E402
from materials import MU0, NdFeBMaterial, SmcMaterial  # noqa: E402
from params import BASELINE  # noqa: E402

CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  — ' + detail if detail else ''}")


def main() -> int:
    p = BASELINE
    s = g.summarise(p)
    print("PHANTM selftest (Increment A)")

    # --- geometry anchors ---
    check("tooth pitch = 0.464 mm", abs(s.tooth_pitch_mm - 0.464) < 1e-9,
          f"{s.tooth_pitch_mm:.3f}")
    check("26 slots per face", s.n_slots_per_face == 26)
    mt_g = s.translator_mass_kg * 1e3
    check("Mt in calibration band 0.150–0.165 g", 0.150 <= mt_g <= 0.165, f"{mt_g:.4f} g")
    # independent closed-form recompute (bar − slots), not via geometry.py internals
    bar = 1.549 * 1.55 * 12.5
    slots = 2 * 26 * (0.465 * 0.232 * 1.55)
    mt_ref = (bar - slots) * 1e-9 * 7400.0 * 1e3
    check("Mt matches closed form", abs(mt_g - mt_ref) < 1e-6, f"ref {mt_ref:.4f} g")

    check("Wm = 77.5 µm", abs(s.magnetic_gap_mm - 0.0775) < 1e-9,
          f"{s.magnetic_gap_mm*1000:.1f} µm")
    check("bridge span reconciles to 2.634 mm",
          abs(s.bridge_span_check_mm - p.bridge.length_radial_mm) < 1e-6,
          f"{s.bridge_span_check_mm:.3f}")
    check("3 teeth per slot-section face", s.pole_tooth_count == 3)

    # tooth lands sit exactly on the translator pitch grid
    lands = g.pole_tooth_positions_mm(p)
    on_grid = all(abs(a - k * s.tooth_pitch_mm) < 1e-9 for k, (a, _b) in enumerate(lands))
    check("pole teeth on translator pitch grid", on_grid,
          f"lands at {[f'{a:.3f}' for a, _ in lands]}")

    # --- pole phasing: LOCK the computed values incl. the Tony-question discrepancy ---
    check("pole centre spacing = 1.534 mm", abs(s.pole_centre_spacing_mm - 1.534) < 1e-9)
    off1 = s.pole_phase_offsets_mm[1]
    check("pole-1 offset ≈ 0.142 mm (mod pitch)", abs(off1 - 0.142) < 1e-6, f"{off1:.4f}")
    # 0.374 mm spacing ⇒ per-step offset 0.142 not 0.1547 (12.7 µm short); the error
    # ACCUMULATES: pole 2 sits 25.3 µm off ideal. OPEN QUESTION for Tony (§9).
    check("worst pole phase error ≈ 25 µm (cumulative, pole 2 — OPEN QUESTION for Tony)",
          0.020 <= s.pole_phase_error_mm <= 0.030, f"{s.pole_phase_error_mm*1000:.1f} µm")

    # --- coil window ---
    check("coil fits 0.263 mm window", s.coil_fits_window,
          f"{s.coil_layers} layers, build {s.coil_radial_build_mm:.3f} mm")
    check("coil wire length in 60–90 mm band", 60 <= s.coil_wire_len_mm <= 90,
          f"{s.coil_wire_len_mm:.1f} mm")

    # --- envelope + stroke ---
    check("stator envelope radial = 2.634 mm (> 1.9 mm E-band cell — quantified in §5)",
          abs(s.envelope_radial_mm - 2.634) < 1e-9)
    check("usable stroke ≥ 3.0 mm (λ/2 @ 50 GHz)", s.usable_stroke_mm >= 3.0,
          f"{s.usable_stroke_mm:.2f} mm")

    # --- materials ---
    smc = SmcMaterial()
    bs = [smc.b_of_h(h) for h in (100, 1000, 10000, 300000)]
    check("SMC B(H) monotone", all(b2 > b1 for b1, b2 in zip(bs, bs[1:])),
          f"{[f'{b:.2f}' for b in bs]} T")
    check("SMC inverse round-trips", abs(smc.h_of_b(smc.b_of_h(1234.0)) - 1234.0) < 1.0)
    check("SMC deep-saturation slope → µ0",
          abs((smc.b_of_h(310000) - smc.b_of_h(300000)) / 10000 - MU0) < 1e-9)
    mag = NdFeBMaterial()
    check("NdFeB B(0)=Br, B(-Hc)=0",
          abs(mag.b_of_h(0.0) - 1.30) < 1e-9 and abs(mag.b_of_h(-mag.hc_at(20))) < 1e-9)
    check("NdFeB Br derates with temperature", mag.br_at(100) < mag.br_at(20),
          f"{mag.br_at(100):.3f} T @100°C")

    # --- Increment B: reluctance model guards ---
    from reluctance_model import Actuator, FringeConfig, PoleCircuit

    pole = PoleCircuit(p, pm_length_m=30e-6)
    f_plus, f_minus = pole.force(0.1e-3), pole.force(-0.1e-3)
    check("single-pole force zero at alignment", abs(pole.force(0.0)) < 1e-5,
          f"{pole.force(0.0)*1e3:.4f} mN")
    check("single-pole force antisymmetric", abs(f_plus + f_minus) < 5e-5,
          f"{f_plus*1e3:+.3f} / {f_minus*1e3:+.3f} mN")
    check("single-pole force restores toward alignment", f_plus < 0)

    # council BLOCK #3 guard: co-energy force must match the linear-limit flux
    # identity F = ½Φ²·dR_total/dx (independent derivation incl. sign).
    lin = PoleCircuit(p, pm_length_m=2e-6,
                      fringe=FringeConfig(k_leak=0.0))  # low flux → linear steel
    x0, dx = 0.1e-3, 1e-6
    f_coen = lin.force(x0)
    phi = lin.solve(x0).phi_gap_wb
    r_of = lambda x: 2.0 / lin.gap_permeance(x)
    # steel + PM reluctance are x-independent to first order at low flux; only
    # the gap term contributes dR/dx
    f_flux = -0.5 * phi**2 * (r_of(x0 + dx) - r_of(x0 - dx)) / (2 * dx)
    ok = abs(f_coen - f_flux) <= 0.05 * max(abs(f_flux), 1e-9)
    check("co-energy force = ½Φ²·dR/dx in linear limit (±5%)", ok,
          f"coenergy {f_coen*1e6:+.3f} µN vs flux {f_flux*1e6:+.3f} µN")

    # three stable detents per pitch (3rd-harmonic physics) + uneven-step finding
    act = Actuator(p, pm_length_m=29.1e-6)
    xs = np.linspace(-act.pitch / 2, act.pitch / 2, 31)
    fdet = np.array([act.detent_force(x) for x in xs])
    stable = [i for i in range(len(fdet) - 1) if fdet[i] > 0 > fdet[i + 1]]
    check("3 stable detents per pitch", len(stable) == 3,
          f"{len(stable)} crossings")
    check("net detent breakaway in 5–11 mN band at Pm≈29 µm",
          5e-3 <= np.abs(fdet).max() <= 11e-3, f"{np.abs(fdet).max()*1e3:.2f} mN")
    # smoothness: no isolated single-sample spikes (the 2026-07-24 artifact class).
    # At 31 samples/pitch legitimate slopes near crossings reach ~0.7·peak/sample;
    # a spike shows as a jump up AND back down — test the second difference.
    spike = np.abs(np.diff(fdet, 2)).max()
    check("detent curve spike-free (max 2nd difference < 1.0·peak)",
          spike < 1.0 * np.abs(fdet).max(), f"2nd-diff {spike*1e3:.2f} mN")

    failed = [c for c in CHECKS if not c[1]]
    print(f"\n{len(CHECKS) - len(failed)}/{len(CHECKS)} checks pass")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
