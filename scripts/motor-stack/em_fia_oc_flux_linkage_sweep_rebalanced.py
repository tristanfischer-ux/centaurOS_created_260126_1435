#!/usr/bin/env python3
"""Open-circuit flux-linkage FUNDAMENTAL over a full electrical period.

PROMOTED FROM A SCRATCH FILE 2026-08-02. This script is the SOLE producer of
`oc_flux_linkage_sweep{_REBALANCED}.json`, which back the `lambda_pm_*` claims —
and it lived in /tmp, unversioned and unreviewable, while the claim-provenance
gate's own punchlist pointed at `$SCRATCH/...`. Force-adding its JSON output made
the NUMBERS auditable; it did not make the DERIVATION auditable. A load-bearing
claim whose producer is deleted on reboot is not reproducible.

COUNCIL BLOCK (Sol, 2026-08-01): "a single phase flux-linkage sample at one
rotor position is not generally lambda_pm; it is an instantaneous phase linkage
whose value depends on rotor position." Correct. This sweeps a FULL electrical
period and extracts the FUNDAMENTAL, which is what lambda_pm means.

The reported linkage is the TERMINAL value: `_execute_magnetic_point` recombines
the six branch circuits, so this no longer reports Npcp x the terminal linkage.
"""
import sys, json, math, cmath, dataclasses

sys.path.insert(0, 'scripts/motor-stack')
import em_fia_front_kit_case as m

st = json.load(open('out/formula-e-front-mgu-20260729-1432/state.json'))
q = (st.get('orchestratorContract') or {}).get('quantities') or {}
i = m.inputs_from_sections(q, {})
g = m.derive_fia_geometry(i)
turns = m.effective_turns_per_slot_from_twin(i)
mach = m.load(str(m.MATERIAL_MACHINE_PATH))
Br = float(mach.rotor.hole[0].magnet_0.mat_type.mag.Brm20)
S = m._solver_path()
p = m.ROTOR_POLES // 2
duty = m.analytical_duty_check(i)

period = 360.0 / p          # one ELECTRICAL period in mechanical degrees
N = 24
lam = []
for k in range(N):
    pos = period * k / N
    base = m.loaded_point_assumptions(duty, i, current_angle_electrical_deg=0.0)
    d = dataclasses.replace(
        base,
        phase_current_peak_a=0.0, phase_current_rms_a=0.0,
        phase_a_current_a=0.0, phase_b_current_a=0.0, phase_c_current_a=0.0,
        rotor_position_mechanical_deg=pos,
        effective_turns_per_slot=turns)
    v = m._execute_magnetic_point(g, S, remanence_t=Br, loaded=d)
    lam.append(v['flux_linkage_phase_a_wb'])
    print(f'  {pos:6.2f} deg mech   lambda_a = {lam[-1]:+.8f} Wb', flush=True)


def harm(h):
    return 2 * abs(sum(x * cmath.exp(-2j * math.pi * h * k / N)
                       for k, x in enumerate(lam))) / N


fund = harm(1)
thd = math.sqrt(sum(harm(h) ** 2 for h in (3, 5, 7))) / fund * 100
print()
print(f'  FUNDAMENTAL lambda_pm = {fund:.6f} Wb  (full electrical period, {N} samples)')
print(f'  linkage THD = {thd:.1f}%   harmonics: 3rd {harm(3):.6f}  5th {harm(5):.6f}')
print()
json.dump({'lambda_pm_fundamental_wb': fund, 'samples': lam, 'thd_pct': thd,
           'n_samples': N, 'electrical_period_mech_deg': period},
          open('out/formula-e-front-mgu-20260729-1432/_motor_stack/oc_flux_linkage_sweep_REBALANCED.json', 'w'),
          indent=2)
