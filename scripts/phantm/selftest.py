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

    # --- NdFeB knee / demagnetisation model (the dual-drive gate) ----------
    # These guard the ACCEPTANCE side of the demag gate, which is the half the
    # FE cannot check itself: FEMM's magnet is a linear recoil line with no
    # knee, so nothing in the solve would ever complain about an operating
    # point past it.
    n42 = NdFeBMaterial(br_t=1.30, grade="N42")
    check("NdFeB Hcj derates ~5x faster than Br",
          abs(n42.hcj_at(120) / n42.hcj_at(20)) < abs(n42.br_at(120) / n42.br_at(20)),
          f"Hcj {n42.hcj_at(120)/1e3:.0f} vs {n42.hcj_at(20)/1e3:.0f} kA/m, "
          f"Br {n42.br_at(120):.3f} vs {n42.br_at(20):.3f} T")
    check("knee sits below Hcj (squareness < 1)",
          0.5 < n42.h_knee_at(20) / n42.hcj_at(20) < 1.0,
          f"{n42.h_knee_at(20)/n42.hcj_at(20):.2f}")
    check("Hcj clamps at zero rather than going negative",
          n42.hcj_at(1000) == 0.0)
    # t_max_reversible must be monotone DECREASING in the applied reverse
    # field: a harder push must never buy a higher temperature.
    t_soft = n42.t_max_reversible(150e3)
    t_hard = n42.t_max_reversible(400e3)
    check("hotter limit for a weaker reverse field (monotone)", t_soft > t_hard,
          f"{t_soft:.0f} °C at 150 kA/m vs {t_hard:.0f} °C at 400 kA/m")
    check("N52 has lower coercivity than N42 (the remanence/coercivity trade)",
          NdFeBMaterial(br_t=1.45, grade="N52").hcj_at(20) < n42.hcj_at(20),
          f"{NdFeBMaterial(br_t=1.45, grade='N52').hcj_at(20)/1e3:.0f} vs "
          f"{n42.hcj_at(20)/1e3:.0f} kA/m")
    # Artefact guard: if the demag gate has been run, its headline verdict is
    # pinned here so a geometry or drive-current change that silently pushes
    # the magnet past its knee fails the build rather than shipping.
    import json as _json
    import os as _os
    _dg = _os.path.join(_os.path.dirname(__file__), "out", "demag-fe.json")
    if _os.path.exists(_dg):
        _d = _json.load(open(_dg))
        for _c in _d["configs"]:
            _work = next(x for x in _c["ceilings"]
                         if x["grade"] == _c["workhorse_grade"])
            check(f"demag gate: {_c['name']} specified grade "
                  f"{_c['workhorse_grade']} is thermally bound, not demag-bound",
                  _work["binding"] == "grade thermal rating",
                  f"ceiling {_work['usable_ceiling_c']} °C "
                  f"(catalogue {_work['t_max_catalogue_c']}, "
                  f"demag {_work['t_max_reversible_c']})")
            check(f"demag gate: {_c['name']} verdict survives every "
                  f"assumption corner",
                  _c["workhorse_corners_clear"][0] == _c["workhorse_corners_clear"][1],
                  f"{_c['workhorse_corners_clear'][0]}/"
                  f"{_c['workhorse_corners_clear'][1]} corners")
            # The point-probe design decision itself: if worst and mean ever
            # coincide the grid has collapsed and the gate is measuring the
            # wrong statistic.
            check(f"demag gate: {_c['name']} worst-in-slug exceeds the mean "
                  f"(point probes are doing real work)",
                  _c["worst_vs_mean_cold"]["ratio"] > 1.02,
                  f"{_c['worst_vs_mean_cold']['ratio']}x")

    # --- eddy-current gate (the no-laminations claim) ----------------------
    _eg = _os.path.join(_os.path.dirname(__file__), "out", "eddy-fe.json")
    if _os.path.exists(_eg):
        _e = _json.load(open(_eg))
        # The METHOD gate: the metric must reproduce the closed-form slab
        # solution or it does not get to rule on tooling.
        check("eddy gate: metric reproduces the closed-form slab solution",
              all(v["ok"] for v in _e["slab_validation"]),
              "; ".join(f"{v['f_hz']:.0f} Hz {v['rel_error']*100:.1f}%"
                        for v in _e["slab_validation"]))
        # Diffusion time must scale with permeability. If this ever goes flat,
        # the solve has stopped seeing the steel (which is exactly how the
        # first, wrong version of this gate looked).
        _mim = [r for r in _e["rows"] if r["sigma_ms"] > 0.01]
        _lo = min(_mim, key=lambda r: r["mu_r"])
        _hi = max(_mim, key=lambda r: r["mu_r"])
        check("eddy gate: diffusion time rises with permeability",
              _hi["tau_ms"] > 3.0 * _lo["tau_ms"],
              f"tau {_lo['tau_ms']*1e3:.1f} µs at µr {_lo['mu_r']} → "
              f"{_hi['tau_ms']*1e3:.1f} µs at µr {_hi['mu_r']}")
        _w = _e["worst_buildable"]
        check("eddy gate: flux clears the pulse on the worst buildable route",
              _w["margin_pulse_over_tau"] > 2.0
              and _w["force_fraction_at_pulse_end"] > 0.90,
              f"{_w['margin_pulse_over_tau']}× margin, flux "
              f"{_w['penetration_at_pulse_end']*100:.2f}%, force "
              f"{_w['force_fraction_at_pulse_end']*100:.1f}% at pulse end")
        # The verdict must be computed on a route that will actually be built.
        # SMC is ~850x less conductive and was killed as a process; if it ever
        # became the worst case the study would be self-flattering.
        check("eddy gate: verdict is set by a buildable route, not by SMC",
              "SMC" not in _w["material"], _w["material"])

    # --- vent tolerance gate ----------------------------------------------
    _vt = _os.path.join(_os.path.dirname(__file__), "out", "opt",
                        "vent-tolerance.json")
    if _os.path.exists(_vt):
        _v = _json.load(open(_vt))
        # METHOD gate: the fast integrator must reproduce the reference one,
        # or every tolerance number downstream is meaningless.
        check("vent gate: fast integrator reproduces damper.simulate",
              all(r["ok"] for r in _v["validation"]),
              f"{sum(r['ok'] for r in _v['validation'])}/"
              f"{len(_v['validation'])} cases match")
        # The robust band must be a strict subset of the nominal one. If they
        # ever coincide, the corners have stopped biting and the sweep is
        # measuring nominal twice.
        _nb, _rb = _v["nominal_band_mm"], _v["robust_band_mm"]
        check("vent gate: uncertainty corners actually narrow the band",
              _rb is not None and (_rb[1] - _rb[0]) < (_nb[1] - _nb[0]),
              f"nominal {_nb} → robust {_rb}")
        # The specified centre must sit inside the robust band it came from.
        _sp = _v["specification"]
        check("vent gate: specified centre lies inside the robust band",
              _rb[0] <= _sp["centre_mm"] <= _rb[1],
              f"Ø{_sp['centre_mm']} in {_rb}")
        if _v.get("cd_pinned_specification"):
            _cd = _v["cd_pinned_specification"]
            check("vent gate: discharge coefficient is the dominant "
                  "uncertainty (measuring it buys real tolerance)",
                  _cd["tolerance_mm"] > 2.0 * _sp["tolerance_mm"],
                  f"±{_sp['tolerance_mm']*1e3:.0f} µm → "
                  f"±{_cd['tolerance_mm']*1e3:.0f} µm with Cd measured")

    # --- driver EMC specification -----------------------------------------
    _es = _os.path.join(_os.path.dirname(__file__), "out", "emc-spec.json")
    if _os.path.exists(_es):
        _e2 = _json.load(open(_es))
        _sp2 = _e2["spectrum"]
        check("EMC spec: drive spectrum is decades below the operating band",
              _sp2["decades_to_band"] > 3.0
              and _sp2["attenuation_to_band_db"] > 100,
              f"{_sp2['decades_to_band']} decades = "
              f"{_sp2['attenuation_to_band_db']:.0f} dB")
        check("EMC spec: every rule carries a verification method",
              all(r.get("verify", "").strip() and r.get("why", "").strip()
                  for r in _e2["rules"]),
              f"{len(_e2['rules'])} rules")
        # The rule that defends the LPI claim must exist by name — the others
        # are hygiene, this one IS the property being sold.
        check("EMC spec: the silent-hold rule is present",
              any("hold" in r["title"].lower() for r in _e2["rules"]))

    # report-consistency guard (deterministic; skips if the report isn't built)
    if _os.path.exists(_os.path.join(_os.path.dirname(__file__), "out",
                                     "PHANTM-ACTUATOR-REPORT.md")):
        import subprocess as _sp
        rv = _sp.run([__import__("sys").executable,
                      _os.path.join(_os.path.dirname(__file__), "verify_report.py")],
                     capture_output=True, text=True)
        check("verify_report.py (report ↔ formulas ↔ artefacts, no stale strings)",
              rv.returncode == 0,
              rv.stdout.strip().splitlines()[-1] if rv.stdout else "no output")

    failed = [c for c in CHECKS if not c[1]]
    print(f"\n{len(CHECKS) - len(failed)}/{len(CHECKS)} checks pass")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
