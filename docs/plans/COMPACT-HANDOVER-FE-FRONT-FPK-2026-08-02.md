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

### Outstanding confirmation
The half-current run is a **proxy** for the correct topology. All three council
seats prefer Sol's **six explicit branch circuits** (A1/A2, B1/B2, C1/C2), each at
337.29 A peak. MMF per slot is identical either way so torque should not move —
but flux-linkage reporting and copper-loss bookkeeping differ. Not yet run.
Grok's parallel instruction: *"do not scale torque by 1/2 — publish a re-solved
T–I curve."*

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

1. **Six-branch circuit model** (A1/A2, B1/B2, C1/C2 at 337.29 A peak) — confirm
   the proxy. Sol's preferred fix; all three seats agree.
2. **Re-run every EM figure** on the source-fixed deck. Baseline is now measured
   (25.75 N·m mean |T| = 0.206×); the REBALANCED point, the MTPA screen and the
   flux-linkage sweeps are NOT — the rebalanced 81.64 N·m came from the
   half-current proxy run, not from the fixed deck.
3. **Re-establish what architecture change closes 0.652×.** Stack is exhausted
   inside the housing.
4. **Lamination gauge and grade** — established nowhere in this twin. Eddy loss
   goes as gauge², so this one unstated number moves the loss answer more than
   the entire grain-orientation debate. Bigger lever than anything currently open.
5. **Magnet respec into BoM and drawings** — the modifier still does not attach to
   pre-existing BoM words. Currently a MODEL-only fix, which is the exact
   band-aid shape the core principle forbids.
6. `physicsTree` divergences: 4 quantities recorded, none decided
   (turns_per_phase 14 vs 18, conductor area, phase resistance, DC-link C).

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
