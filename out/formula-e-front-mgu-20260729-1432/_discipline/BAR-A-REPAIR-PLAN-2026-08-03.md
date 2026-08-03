# Bar A repair plan — v2, rewritten after the start council

**v1 was substantially wrong and is withdrawn.** It reported three divergences;
only one is real. Two were manufactured by comparing quantities that do not
describe the same thing:

| v1 claim | truth |
|---|---|
| `envelope_mgu_torque_nm` 145.746 vs FE 81.558 = **1.79×** | a **peak** against a **37-point mean**. Peak-to-peak against the MTPA screen: **1.06× — they AGREE** |
| `mgu_shaft_torque_max_nm` 334 vs FE 137.641 = **2.43×** | a **~10,000 rpm corner** against a **19,500 rpm** solve. 350 kW at 10,000 rpm through η is **341.8 N·m** — 334 is CORRECT |
| `mgu_shaft_torque_nm` 119.7 vs FE 81.558 = **1.47×** | **REAL** — both continuous shaft torque at 19,500 rpm |

Already fixed at source: `basis` and `operating_point` are load-bearing fields on
every binding; a mismatch is reported **incomparable with the reason** rather
than as a ratio; four proveCatch cases encode the error. Live: 1 divergence,
1 agreement, 1 incomparable.

## The actual problem, restated

Exactly one number in the deliverable is contradicted by a like-for-like solve:
continuous shaft torque at 19,500 rpm. The workbook prints **119.7 N·m**
(`front_fpk_power_reconcile`, `T = P_shaft/ω`); the finite-element solve measures
**81.558 N·m** over 37 rotor positions. Both are honestly derived. They disagree
because the analytic form assumes the machine *delivers* the shaft power the
electrical duty implies, and the FE says it does not.

## Step 1 — make comparison like-for-like BY CONSTRUCTION (Sol)
Stop pairing summary statistics out of two artefacts. Declare ONE load case
(19,500 rpm, 477 A rms, −30° elec) and evaluate it through
`em_fia_torque_map_screen.py` and `em_fia_voltage_fw_screen.py`, both already
fresh on this twin. A comparison built from one declared load case cannot repeat
the v1 error.

## Step 2 — governance in the RENDERER, at ONE point (Sol #8)
`build-excel-export.py:187 qval()` is the single choke point every reader uses,
and `excel_closure_blocks.py` has its own `_qval`. Give both a
provenance-aware preference: where a `*_fe_*` quantity exists at the SAME basis
and operating point, prefer it, and record which was chosen.

Rejected alternative: rewriting contract entries in place. One real divergence
does not justify that blast radius, and this engine has a scar from a physics
tree that silently re-based four quantities.

## Step 3 — gate ONLY on an unresolved like-for-like divergence
`--enforce` must not fire on agreements or incomparables. Exit 50 only when a
same-basis, same-operating-point pair exceeds threshold and the renderer has not
been told which governs.

## Step 4 — verify by READING the workbook
Assert the continuous-torque cell reflects the chosen governance and that the
choice is visible. **Do NOT assert 145.7 or 334 are absent** — v1 demanded
deleting two correct numbers.

## Explicitly NOT doing
- Not deleting or "fixing" 145.7 or 334 — both are correct for what they describe.
- Not rewriting contract quantities in place.
- Not touching `ship_ok` (stays false), the EM result, or the architecture finding.

## What I want challenged
1. Is preferring the FE value in the renderer right at all? The analytic 119.7 is
   the *requirement* implied by the duty; the FE 81.558 is the *capability*. A
   deliverable arguably needs BOTH, side by side, not one silently chosen.
2. Does `qval()` preference hide the disagreement the same way a contract
   rewrite would, just one layer later?
