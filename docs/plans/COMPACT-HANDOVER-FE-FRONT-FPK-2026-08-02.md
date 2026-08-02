# FE Front FPK — compaction handover, 2026-08-02

**Supersedes** `TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md`.
Branch `oxccu-efuel`. Twin is **only** `out/formula-e-front-mgu-20260729-1432/` — do
not mint a new one.

---

## 1. The headline: DEC-EM-1 is REVERSED

The magnet respec **does not clear duty**.

| | torque | vs 125.21 N·m |
|---|---|---|
| rebalanced, **correct** excitation | **81.64 N·m** | **0.652× — does NOT clear** |
| rebalanced, as modelled all day | 145.73 N·m | 1.164× — the basis of DEC-EM-1 |
| **baseline, correct excitation (MEASURED)** | **25.75 N·m** mean\|T\| (signed −14.72) | **0.206×** (signed 0.118) |

Cause: **FEMM has no concept of parallel paths.** `mi_addcircprop` is a SERIES
circuit through every turn assigned to it. Exciting the deck at the terminal
current (674.58 A peak) with 7 turns/slot built a machine with **28 series turns
per phase** where the contract specifies **14** (`Npcp=1` vs `Npcp=2`).

Confirmed independently, two ways:
- pyleecan `comp_Ntsp()` — 28 vs 14, directly
- FE/analytic flux-linkage ratio **1.964** on the rebalanced (near-sinusoidal,
  THD 6.9%) field, where the 1-D transform is valid

Saturation softened the correction — the measured half-current ratio is **0.560**,
not the 0.500 of pure linearity, exactly as MiniMax-M3 argued against my own
pessimistic estimate. Not nearly enough.

**Stack cannot close the rest.** Residual 1.534× needs a **149.7 mm stack** against
a **140.5 mm housing**. 120 mm → 0.802×. 110 mm → 0.735×. This is an
**architecture gap**, not a tweak.

**The respec is still worth 3.07×** and still passes every other screen (demag
×3.25 at 160 °C, pocket FoS ×1.88). It is simply not sufficient alone.

`ship_ok` **false**. Homologation **NOT_HOMOLOGATED**.

### SOURCE FIX APPLIED (committed 11928d56c)
`em_fia_front_kit_case.py` now excites the FE at the **path** current
(`I_terminal / Npcp`), not the terminal current, with `path_current_rms_a` +
`winding_parallel_paths` emitted to JSON and a proveCatch check
`fe_excites_at_path_not_terminal_current` in the **selftest** (the twin JSON
records `path_current_rms_a` + `winding_parallel_paths` as the evidence, but does
not itself carry the gate). **Every EM number in the twin predating this commit
is void.**

Baseline re-solved on the fixed deck 2026-08-02: terminal 477.0 A rms over 2
parallel paths → FE conductor excited at 238.5 A rms → **25.75 N·m mean |T| =
0.206×**, signed −14.72 N·m = 0.118×. `torque_reliable` **false**,
`duty_torque_screen_ok` **false**, status PARTIAL, `ship_ok` **false**. That
replaces the ~26.6 N·m estimate with a measurement.

### CONFIRMED — six branch circuits, measured 2026-08-02
The half-current run **was** a valid proxy. Six explicit branch circuits
(`phase_a_b1/b2`, `phase_b_b1/b2`, `phase_c_b1/b2`, each at 337.29 A peak) vs
one-circuit-per-phase at IDENTICAL currents, rebalanced geometry, −30° elec,
four rotor positions:

| | result |
|---|---|
| torque residual | **\|ΔT\| ≤ 3.6e-6 N·m** — a RESIDUAL, on torques of order 50–80 N·m |
| flux-linkage ratio one/six | **exactly 2.0000** |
| terminal current recombination | 584.20 A, as it must be |

So **81.64 N·m = 0.652× stands and DEC-EM-1 stays reversed** — but every
**flux-linkage** figure in this campaign was **2× the terminal value**, and
that propagates to back-EMF, the voltage limit and the analytic cross-check.
It also explains the 1.964 FE/analytic ratio: it was ≈2, i.e. the diagnosis.

`_branch_layout()` pairs coils (+ side k with − side k), deals them round-robin
to Npcp branches (the diametrical arrangement), and REFUSES to split when the
branches would be unbalanced. proveCatch
`branch_circuits_hold_contract_series_turns`.

### The lamination was never missing — it was never CARRIED
`§5 item 4` said gauge and grade were "established nowhere". Wrong: **M400-50A,
Wlam 0.5 mm, ρ 4.6e-7 Ω·m, 7650 kg/m³, Kf1 0.95** sit in the pyleecan material
file the FE deck **already loads for its BH curve**. Nothing passed them to
`motor:loss-point`, which defaults `ke=1e-5` against a classical **1.169e-4**
for that lamination — 12× low, and eddy goes as gauge² and frequency².

On the twin's OWN measured field and mass (`stator_iron_b_REBALANCED.json`,
`stator_iron_mass.json` — tooth 2.96 kg at 1.746 T, yoke 3.66 kg at 2.094 T,
f = 1300 Hz):

| coefficients | iron loss |
|---|---|
| defaulted (kh 0.02, ke 1e-5) | **993.6 W** — and the twin's thermal screen used **1020.5 W**, so that is what it ran on |
| derived from the M400-50A lamination | **5 869.8 W (5.91×)** |

⚠ **The 5 870 W is a BOUND, not a measurement.** The yoke sits at **2.09 T**,
deep in saturation and far outside the range where a Steinmetz B^1.8 fit
calibrated at 1.5 T is valid. The honest statement is that the iron loss is
several times the 1020 W the thermal screen was sized on, and that the yoke flux
density is itself a design problem. It is not "5 870 W".

An earlier draft of this note quoted "302 W → 1713 W". That was a like-for-like
coefficient comparison on ILLUSTRATIVE inputs (5 kg at 1.2 T), not the twin, and
should not be cited.

`scripts/lib/machine_lamination.py` derives the coefficients rather than tabling
them: classical eddy from the gauge, hysteresis calibrated to the grade's own
EN 10106 guarantee (the designation IS the datasheet). Same shape as the
"3 of 18 solvers in use" audit — the data was on the shelf.

---

## 1b. P-STAGE DISCIPLINE — structural as of 2026-08-02

**Every load-bearing block goes through `scripts/lib/p_stage_discipline.py`.**

    start  --stage-id X --twin <twin> --plan-ref "<open plan item>" --intent … \
           [--evidence <artefacts backing any number the intent asserts>]
    finish --stage-id X --claim "<the numbers>" --produced … --next …

`start` = plan fit (REFUSES without `--plan-ref`) + `capability_lookup --enforce`
+ `calculation_guard` + START council **which blocks on unanswered seats**. `finish` = `stage_boundary_check` +
FINISH council. Exit **49**. Record lands on the twin at `_discipline/`.
Disagreeing with a seat is allowed; **ignoring one is not** — finish refuses
while a blocking seat is neither fixed nor recorded in `advice_rejected` with a
reason. Commit bodies cite all four artefact paths.

**Why it had to be built:** every piece already existed with a selftest and none
of it was the loop. `core.hooksPath` pointed at a **sibling checkout**, so
`install-forcing-hooks.sh` had installed the structural block into *that* repo
and this one's `.husky/pre-commit` was 22 lines of lint + drift. No finish
council ran after the path-current fix or the baseline measurement; no stage
boundary artefact existed on the twin at all; the capability dossier was a
one-shot with both package lists empty. The installer now refuses an out-of-repo
`hooksPath`; pre-commit requires a finish-council artefact whenever
`scripts/motor-stack/**` or `scripts/lib/**` is staged.

**The first live start council blocked on all three seats, and was right twice:**
the capability dossier probed Python packages only — reporting `femm` MISSING
while the deck runs the native `femmcli` binary — so it now probes solver
BINARIES too (femmcli ✓, blender ✓, **ccx MISSING**, previously unknown); and
`start` handed the council no artefacts, so every claim read as UNSUPPORTED,
which `--evidence` fixes.

**A review harness that silently truncates is worse than none.** The SECOND
finish council had all three seats report that `p_stage_discipline.py` and the
promoted flux-linkage sweeps were "not in the diff". They were right about what
they were given: `call_council` did `diff[:200000]`, the staged diff was 278,443
characters, and those files start at 216,089 and 269,582. Three independent
seats produced confident false findings from corrupted input, and it cost a full
council round to notice. `build_review_body()` now puts files the claim NAMES
first — so the evidence for a claim is never what gets cut — and lists anything
dropped by name and size inside the prompt, telling seats to say they cannot
assess it rather than that it is absent.

**The first live FINISH council found four things that mattered**, and the
sharpest was aimed at the driver itself:

1. **Sol: `start` recorded blocking seats and did not block on them.** The very
   first live start council had all three seats blocking and printed "work may
   begin". I had built a gate and left it advisory — the exact failure this
   driver exists to replace. `unrejected_blocking()` is now shared by start and
   finish, so a blocking seat must be answered *before* the work too.
2. **Sol: the hook was not POSIX sh.** `set -uo pipefail` and `shopt -s nullglob`
   are bash-only, while the block's own comment acknowledged husky may invoke it
   under `sh`. On dash it would die before running a single gate. macOS `/bin/sh`
   is bash, so it worked here and would have silently stopped working on CI.
3. **Sol: the finish-council check accepted any panel under a day old from any
   twin.** It now must be newer than the newest staged engine file.
4. **Grok: "7/7 backed" was not auditable** — `out/` is gitignored, so the
   backing artefacts were not in the diff, and the MTPA peak was prose. Ten
   artefacts force-added; the peak is now a registered claim.

Full record with the four reasoned rejections:
`_discipline/em-refresh-fixed-deck-finish-council.json`.

---

## 1c. MEASURED on the fully fixed deck — stage `em-refresh-fixed-deck`

Every EM claim re-solved with path-current excitation AND six branch circuits.
The registry holds **9** claims (the MTPA peak and the magnitude mean were added
after the finish council found them asserted in prose rather than gated).

| claim | was | now | ratio |
|---|---|---|---|
| `lambda_pm_fundamental_wb` (baseline) | 0.002903 | **0.0014514** | **0.5000×** |
| `lambda_pm_rebalanced_wb` | 0.031057 | **0.0155287** | **0.5000×** |
| `delivered_torque_rebalanced_nm` | −145.44 | **−81.558** | 0.5608× |
| `mtpa_mean_torque_rebalanced_nm` | 147.539 | **81.098** | 0.5497× |
| `delivered_mean_torque_nm` (probe, max I) | 41.90 | **18.076** | 0.4314× |

The two flux-linkage claims fell by **0.5000×**. Note what that is and is not:
the registry before/after is a full re-solve, so it is *consistent with* the
branch fix rather than proof of it. The controlled evidence is the A/B artefact —
`mean_flux_linkage_ratio_one_over_six = 2.0000000247` at identical per-conductor
currents (Grok, finish council: "EXACTLY 0.5000× on registry churn is slightly
stronger than warranted").

**The rebalanced respec measured on the fully fixed deck: 81.558 N·m mean |T| =
0.651× of the 125.21 N·m required.** That is the same figure the half-current
proxy gave, now measured. **DEC-EM-1 stays reversed. `ship_ok` stays false.**

The signed mean (−81.558081) and the magnitude mean (81.558081) coincide **only
because `torque_sign_consistent` is true** over the 37-point sweep — |mean(T)|
and mean(|T|) are not generally equal, and both are now registered as separate
claims against their own keys rather than relying on the coincidence.

`em_fia_torque_scaling_probe.py` was **rebuilding the three phase currents from
its own peak**, bypassing the path-current division — the DEC-EM-1 bug
reintroduced the same day in a file nobody was looking at. Both the case and the
probe now go through one function, `fe_phase_currents_from_terminal()`. A rule
that lives in one caller is not a rule.

Probe verdict on the fixed deck: **RELUCTANCE-DOMINATED** — the FE/analytic ratio
RISES with current (0.59 → 1.54), i.e. torque is SUPERLINEAR, the opposite of
saturation. The PM circuit is the weak part, which is what the pole-arc finding
in §2 says.

### The central disagreement is closed — with a caveat that matters
`em_pyleecan_analytic_crosscheck.py` on the rebalanced geometry:

- FE circuit flux linkage (terminal): **0.015529 Wb**
- λ_pm from back-EMF: **0.015436 Wb** — **agree to 0.6%**

⚠ **These are NOT two independent routes.** `estimated_back_emf_line_line_rms_v`
is computed from `open_circuit_rms_airgap_flux_density_t`, i.e. from the FE
airgap probe through a 1-D transform — the same "two routes were one" error
already on this campaign's record (§6). They share the FIELD. What they do
**not** share is the WINDING treatment, so their agreement is evidence about the
**turns**, which is exactly what was broken. It is not evidence about the field.

**Still disagreeing, and now the sharpest analytic gap: 3.03×** between the
DESIGN flux linkage (0.04678 Wb, from flux-per-pole) and the back-EMF value
(0.015436 Wb). The tool says so itself: *"the winding/flux model is internally
inconsistent"*. Open.

The λ sweeps used to print a "1-D airgap transform = 2.09× the measurement"
line against a hardcoded 0.032393 Wb — a constant computed at 28 series turns,
stale by exactly the factor this stage fixed. Both sweep scripts have been
**promoted out of `/tmp` into `scripts/motor-stack/`**
(`em_fia_oc_flux_linkage_sweep{,_rebalanced}.py`) with those stale constants
removed, and the two λ claims now declare them as dependencies. They were the
sole producers of the headline λ artefacts while living unversioned in a
scratch directory that a reboot would have deleted: force-adding their JSON
output made the NUMBERS auditable, not the DERIVATION.

### Why the probe moved 0.4314× and the case moved 0.5608×
Grok asked at the finish council why halving the excitation gave 0.4314× on the
probe when linear scaling predicts 0.5× — and separately 0.5608× on the case,
apparently the opposite nonlinearity. Neither is anomalous, and Grok's linear
predictor is the wrong model:

- Least squares on the probe's five points: **T = 0.00969·I + 2.527e-5·I²**. At
  674.58 A the PM term is 6.53 N·m and the **reluctance term 11.50 N·m — 64%**,
  matching the probe's own published 33–36% PM share. Halving the excitation of
  that mix predicts **0.3406×**, not 0.5×. We measured 0.4314× — above the
  quadratic bound, below the linear one, which is what a **saturating** mixed
  machine does, the "before" figure having been depressed by saturation at
  double the ampere-turns.
- The case is a **different machine**: λ_pm 0.0155287 Wb rebalanced against
  0.0014514 Wb baseline — **10.7× more PM flux** — so it is PM-dominated,
  scales nearer to linear, and saturation carries it past 0.5 to 0.5608×.

Both λ values are registered claims, so this explanation is checkable.

---

## 2. The root cause found earlier the same day (still valid)

**The pole arc.** Magnets spanned 56% of pole pitch, bunched within ±11° of a 45°
pole, making a flux **pulse** whose 3rd harmonic (zero-sequence — no torque) was
**1.90× the fundamental**. That explains the weak PM torque, the reluctance
dominance, and the 11× disagreement with the 1-D reference. The rebalance
(thickness 8.85 → 6.0 mm, length → 22.5 mm, i.e. `FIA_MAGNET_THICKNESS_MM=6.0
FIA_MAGNET_LENGTH_MM=22.5`) takes THD from 198% to 6.9% and is worth 3.07×.

That finding is unaffected by the excitation error — it is a field-SHAPE result,
measured as a ratio.

---

## 3. Hard constraints that must survive compaction

- Twin is **only** `out/formula-e-front-mgu-20260729-1432/`
- Branch `oxccu-efuel`
- `ship_ok` stays **false**; NOT_HOMOLOGATED
- Fix at **SOURCE + proveCatch**, never band-aid one twin's JSON
- **No LLM/generative product images** — CAD → Cycles only
- **Never clear duty on peak alone**
- Oil screens must not regress: 30 mm slosh / Ø1.8 mm jet / ~626.4 ml
- Do not invent Bar B artefacts (dyno / HIL / Gerbers / XYZ)
- Gold/Lucid: training check only — never paste proprietary STEP or silhouette
- Cursor is on hold; all remaining files are the terminal's

---

## 4. What was built this session (all universal, all committed)

Ten modules, every one verified to import cleanly from `/tmp` with zero
FE-campaign dependencies:

| module | exit | what it owns |
|---|---|---|
| `machine_excitation_tracking.py` | 42 | async-harmonic screen; span check precedes Nyquist |
| `machine_magnet_flux_focusing.py` | 43 | `MagnetCircuit`, `screen()`, `rebalance()`, injectable `is_buildable` |
| `machine_loss_bounds.py` | — | magnet eddy bound at **slot-passing** frequency; teeth/yoke iron loss separately |
| `machine_geometry_coherence.py` | — | `GEOMETRY_ALIASES` as a registry |
| `model_routing.py` | — | DIAGNOSE grok-4.5 / PROPOSE **gpt-5.6-terra** / AUDIT minimax-m3 / BACKUP deepseek-v4-flash-0731 |
| `claim_provenance_gate.py` | 41 | artefact exists + newer than inputs + contains the value |
| `council_precommit_review.py` | — | role-specific prompts; balanced-brace JSON extractor |
| `capability_lookup_stage.py` | 45 | enumerates 41 solvers, 270 tools, corpus rows, packages |
| `stage_boundary_check.py` | 46 | DID / NEXT / GATES at every P-stage boundary |
| `calculation_guard.py` | 47 | indexes 457 tools by docstring, IDF-weighted; *find the tool before hand-deriving* |
| `fpk_solver_coverage.py` | 44 | stale/missing solvers on the twin |

Gates **41–45** are wired into `scripts/lib/gate-registry.ts` (28 proven) and
**ENFORCE by default**. Forcing hooks install via
`scripts/lib/install-forcing-hooks.sh`, which **appends to `.husky/pre-commit`
and never touches `.husky/_`** (the dispatcher was clobbered once and restored
byte-identically).

Terra 5.6 replaced Sol 5.6 in the code-review seat — ~5× cheaper, near-equal.
`SOL_ESCALATION` retained for the hardest calls.

`fpk_component_literature` is now **24,946/24,946 rows embedded** (100%,
$0.0096). It had no embedding column for the life of the corpus.

---

## 5. Open work, in priority order

1. ~~Six-branch circuit model~~ — **DONE and measured** (see §1). Torque residual
   ≤3.6e-6 N·m; flux linkage was exactly 2.0000× too high.
2. **Re-run every EM figure** on the branch-circuit deck. IN FLIGHT as stage
   `em-refresh-fixed-deck` — the claim-provenance gate is blocking 7 claims.
   Baseline is measured (25.75 N·m mean |T| = 0.206×); the REBALANCED point, the
   MTPA screen and the flux-linkage sweeps are NOT — the rebalanced 81.64 N·m
   came from the half-current proxy, and every λ figure was 2× regardless.
3. **Re-establish what architecture change closes 0.652×.** Stack is exhausted
   inside the housing. This is the only item that decides the programme.
4. ~~Lamination gauge and grade~~ — **DONE** (see §1). Coefficients now derived
   from the machine's own material file. Iron MASS was already derived on the
   twin (6.62 kg, tooth 2.96 + yoke 3.66) — `motor:loss-point`'s 5.0 kg default
   was never the twin's number either. **What remains, and it is now the
   sharpest open item after §5.3:** the twin's thermal screen was sized on
   **1020.5 W** of iron loss, which is what the DEFAULTED coefficients give
   (993.6 W). The real lamination gives several times that, and the yoke is at
   **2.09 T** — deep saturation, where the Steinmetz fit is an extrapolation and
   where the machine has a design problem independent of the loss model. The
   coolant margin needs re-deriving and the yoke needs looking at.
5. **Magnet respec into BoM and drawings** — the modifier still does not attach to
   pre-existing BoM words. Currently a MODEL-only fix, which is the exact
   band-aid shape the core principle forbids.
6. `physicsTree` divergences: 4 quantities recorded, none decided
   (turns_per_phase 14 vs 18, conductor area, phase resistance, DC-link C).
7. **Stamp a module content hash into every artefact.** ⬅ *raised by Sol at TWO
   consecutive councils; schedule it rather than defer it again.* The claim-provenance
   gate checks artefact-newer-than-inputs, which does NOT catch a run whose
   process imported the pre-fix module — the hole that forced killing pid 99933
   mid-run. Sol raised it again at the `em-refresh-fixed-deck` start council; it
   is recorded as rejected-for-scope, not as solved.

---

## 6. Errors made this session — do not repeat

These are recorded because each cost real time and several recurred.

- **Dismissed the parallel-path hypothesis** after checking only current
  *magnitude* (477 × √2 = 674.58, correct) and missing that the coupling runs
  through **turns**. Grok and Sol both raised it; I overrode them. It was the
  single largest error of the campaign.
- **Hand-derived what a tool owned**, repeatedly — iron loss, B_tooth,
  flux-linkage, nearly a demag check and an angle sweep, all while
  `motor_loss_point.py` / `em_fia_demag_screen.py` / `em_fia_mtpa_screen.py` /
  pyleecan sat installed. `calculation_guard.py` exists because of this.
- **Cogging contamination — made TWICE**, once in the angle screen and again in
  my own scaling probe.
- **"Two independent routes" were one** — back-EMF is an analytic transform of
  airgap B, not independent evidence.
- **Advance sign flipped the wrong way** on 5-point evidence whose *span* was
  under one cycle; I called it aliasing, and MiniMax correctly refuted the
  framing.
- **Slot-opening change was mine, not the panel's** — I misread a full-slot
  parameter as a mouth and attributed the change to the council.
- **Bisection boundary published as a design value** — it flips under rotation.
- **Modelled the placer's constraint twice** instead of asking the placer.
- **Physics tree silently overwrote four contract quantities** — guard now
  records divergences instead of overwriting.
- **The council system prompt carried stale machine facts for a full day**, and
  my first fix reintroduced them inside the prompt string.
- **Three selftests pinned to transient state** (demag band, capability
  lexical-only, backup cost ratio) — each passed for exactly as long as the bug
  it encoded survived. An assertion pinned to a condition you are actively
  fixing breaks the moment you succeed.
- **Watcher pgrep self-match** — `until ! pgrep -f X` never fires when the
  watcher's own shell contains X. Watch a PID. Cost a full run reported as
  in-flight that never launched.

---

## 7. Where things are

- Twin: `out/formula-e-front-mgu-20260729-1432/`
- Rebalanced + path-current EM snapshot:
  `_motor_stack/em_fia_front_kit_case_REBALANCED_PATHCURRENT.json`
- Decision brief: `docs/plans/DEC-EM-1-DECISION-BRIEF-2026-08-01.md` (marked
  REVERSED)
- Engine catalogue: `docs/plans/FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md`
- Advisory triad: `docs/plans/LLM-ADVISORY-TRIAD-PHYSICS-CEILING-2026-08-01.md`
